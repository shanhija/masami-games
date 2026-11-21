/**
 * The five islands, proven. Lints check every promise a course makes a five-year-old
 * (where the balls, babies, flags and obstacles may go, and what each island brings), the
 * careful bot finishes every course with every ball and baby and no fall, hit or bonk, it
 * gets through every tower as the smallest and the biggest slime whenever it arrives, a
 * child who presses nothing reaches every finish arch, and a child with wild hands keeps
 * the sim's promises for minutes.
 */
import { describe, expect, it } from 'vitest'

import { botStep, createBot } from './bot'
import { COURSES, courseById } from './courses'
import { mulberry32 } from './math'
import {
  COURSE_IDS,
  FAN_R,
  MAX_SIZE,
  R0,
  TOWER_HALF,
  TRACK_HALF,
  TRAMPOLINE_DZ,
  TRAMPOLINE_R,
  type Course,
  type CourseId,
  type EventKind,
  type Phase,
  type Sim,
} from './model'
import {
  BALL_Y,
  CIRCLE_R,
  RING_R,
  SLIDE_AMP,
  TOWER_BODY,
  createSim,
  freeSide,
  go,
  groundAt,
  inWind,
  pressJump,
  setBalls,
  setHide,
  setSteer,
  startTower,
  tick,
} from './sim'

const DT = 1 / 60
const fresh = (course: Course) => createSim(course, { learned: [], babiesHome: [false, false, false], gift: 'cap' })

/** Every obstacle of a course along z, with its kind. */
function obstacles(c: Course) {
  return [
    ...c.spinners.map((o) => ({ kind: 'spinner', z: o.z, x: o.x })),
    ...c.fans.map((o) => ({ kind: 'fan', z: o.z, x: o.x })),
    ...c.frames.map((o) => ({ kind: 'frame', z: o.z, x: 0 })),
    ...c.holes.map((o) => ({ kind: 'hole', z: o.z, x: o.x })),
    ...c.gates.map((o) => ({ kind: 'gate', z: o.z, x: 0 })),
    ...c.pads.map((o) => ({ kind: 'pad', z: o.z, x: o.x })),
  ].sort((a, b) => a.z - b.z)
}

/** Whether a point high up is where a jump or a cushion's flight passes: over a frame or a hole, or on a cushion's flight. */
const overJump = (c: Course, x: number, z: number) =>
  c.frames.some((f) => Math.abs(z - f.z) <= 1 && x >= f.x0 && x <= f.x1) ||
  c.holes.some((h) => Math.abs(z - h.z) <= 1 && Math.abs(x - h.x) <= 0.5) ||
  c.pads.some((p) => z > p.z && z < p.z + 6 && Math.abs(x - p.x) <= 0.5)

/** Runs a careful bot (or nobody) at 60 frames a second until `stop`, counting events; fails after `most` real seconds. */
function play(s: Sim, stop: (s: Sim) => boolean, most: number, hands: ((s: Sim) => void) | null) {
  const counts: Partial<Record<EventKind, number>> = {}
  let real = 0
  while (!stop(s)) {
    if (real > most) throw new Error(`${s.course.id}: not there after ${most} s (z ${s.slime.z.toFixed(1)}, ${s.phase})`)
    if (hands) hands(s)
    tick(s, DT)
    real += DT
    for (const e of s.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1
    s.events.length = 0
  }
  return { counts, real }
}

describe('the islands', () => {
  it('come in the order they open', () => {
    expect(COURSES.map((c) => c.id)).toEqual(COURSE_IDS)
    for (const id of COURSE_IDS) expect(courseById(id).id).toBe(id)
  })

  it('get longer island by island, from about 240 to about 420, each with 40 to 70 balls', () => {
    const ends = COURSES.map((c) => c.finishZ)
    for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1])
    expect(ends[0]).toBeGreaterThan(220)
    expect(ends[0]).toBeLessThan(260)
    expect(ends.at(-1)).toBeGreaterThan(380)
    expect(ends.at(-1)).toBeLessThan(430)
    for (const c of COURSES) {
      expect(c.balls.length, c.id).toBeGreaterThanOrEqual(40)
      expect(c.balls.length, c.id).toBeLessThanOrEqual(70)
    }
  })
})

describe.each(COURSES.map((c) => [c.id, c] as const))('%s', (id, c) => {
  it('runs unbroken along x = 0 from the start to past the trampoline, except for holes', () => {
    const end = c.finishZ + TRAMPOLINE_DZ + TRAMPOLINE_R
    for (let z = -2; z <= end; z += 0.25) {
      const inHole = c.holes.some((h) => Math.abs(z - h.z) < h.r)
      if (!inHole) expect(groundAt(c, 0, z), `${id} at z ${z}`).toBe(true)
    }
  })

  it('puts every ball over track, or where a jump or a cushion takes the slime', () => {
    for (const b of c.balls) {
      const where = `${id} ball at (${b.x}, ${b.y}, ${b.z})`
      if (b.y <= BALL_Y + 1e-9) expect(groundAt(c, b.x, b.z) && groundAt(c, b.x - 0.3, b.z) && groundAt(c, b.x + 0.3, b.z), where).toBe(true)
      else expect(overJump(c, b.x, b.z), where).toBe(true)
    }
  })

  it('keeps holes away from spinners, fans and gates, and a quiet stretch round every obstacle', () => {
    for (const h of c.holes) {
      for (const o of [...c.spinners, ...c.fans, ...c.gates]) expect(Math.abs(h.z - o.z), `${id} hole at ${h.z}`).toBeGreaterThan(6)
    }
    const list = obstacles(c)
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      expect(b.z - a.z, `${id}: ${a.kind} at ${a.z}, ${b.kind} at ${b.z}`).toBeGreaterThanOrEqual(a.kind === 'pad' ? 16 : 14)
    }
  })

  it('has a flag every two or three obstacles, on the main line', () => {
    const list = obstacles(c)
    const marks = [0, ...c.flags.map((f) => f.z), c.finishZ]
    for (let i = 1; i < marks.length; i++) {
      const between = list.filter((o) => o.z > marks[i - 1] && o.z < marks[i]).length
      expect(between, `${id}: from ${marks[i - 1]} to ${marks[i]}`).toBeLessThanOrEqual(3)
    }
    for (const f of c.flags) expect(groundAt(c, 0, f.z), `${id} flag at ${f.z}`).toBe(true)
  })

  it('hides its three babies over a jump, in a fan\'s wind before its cage, and at the end of a side path', () => {
    const [jump, wind, side] = c.babies
    expect(jump.y).toBeGreaterThan(1.5)
    expect(overJump(c, jump.x, jump.z)).toBe(true)
    expect(c.fans.some((f) => inWind(f, wind.x, wind.z) && wind.z > f.z - FAN_R - 5)).toBe(true)
    expect(Math.abs(side.x)).toBeGreaterThan(TRACK_HALF + 1)
    expect(groundAt(c, side.x, side.z)).toBe(true)
  })

  it('has fans that blow over one half and spinners whose paddle reaches over the whole track', () => {
    for (const f of c.fans) {
      expect(() => freeSide(f, f.x)).not.toThrow()
      expect(Math.abs(f.x) + f.width / 2).toBeGreaterThanOrEqual(TRACK_HALF)
    }
    for (const sp of c.spinners) {
      expect(Math.abs(sp.x)).toBeGreaterThan(TRACK_HALF)
      expect(sp.reach).toBeGreaterThanOrEqual(Math.abs(sp.x) + TRACK_HALF)
      expect(sp.dir).toBe(sp.x < 0 ? -1 : 1)
    }
  })

  it('has a tower of circles about 5 apart, inside the shaft, each leaving the biggest slime a way past', () => {
    expect(c.circles[0].y).toBe(6)
    const rBig = R0 * MAX_SIZE
    const wall = TOWER_HALF - rBig
    const reach = TOWER_BODY * rBig + CIRCLE_R
    c.circles.forEach((circle, i) => {
      if (i > 0) expect(circle.y - c.circles[i - 1].y).toBeGreaterThanOrEqual(5)
      if (i > 0) expect(circle.y - c.circles[i - 1].y).toBeLessThanOrEqual(6)
      const swing = circle.n === 5 ? SLIDE_AMP : circle.n === 100 ? RING_R : 0
      expect(Math.abs(circle.x) + swing + CIRCLE_R, `${id} circle ${i}`).toBeLessThanOrEqual(TOWER_HALF)
      const way = Math.max(wall - (circle.x + swing + reach), circle.x - swing - reach + wall)
      expect(way, `${id} circle ${i}`).toBeGreaterThan(0.5)
    })
  })
})

describe('what each island brings', () => {
  const park = courseById('park')

  it('Park: her course in her order, every obstacle once, a spinner with one slow arm', () => {
    expect(park.spinners).toHaveLength(1)
    expect(park.spinners[0].arms).toBe(1)
    expect(park.spinners[0].period).toBeGreaterThanOrEqual(6)
    expect(park.fans).toHaveLength(1)
    expect(park.holes).toHaveLength(1)
    expect(park.pads.length + park.slides.length + park.gates.length).toBe(0)
    const first = (kind: string) => obstacles(park).findIndex((o) => o.kind === kind)
    expect([first('spinner'), first('fan'), first('frame'), first('hole')]).toEqual([0, 1, 2, 4])
    expect(obstacles(park).map((o) => o.kind)).toEqual(['spinner', 'fan', 'frame', 'frame', 'hole'])
  })

  it('Beach: two narrow bridges between wider stretches', () => {
    const narrow = courseById('beach').ground.filter((g) => g.x0 <= 0 && g.x1 >= 0 && g.x1 - g.x0 < 2.5)
    expect(narrow).toHaveLength(2)
    for (const g of narrow) expect(g.x1 - g.x0).toBeCloseTo(2.2, 9)
  })

  it('Candy Land: cushions that throw to balls and a baby high up', () => {
    const candy = courseById('candy')
    expect(candy.pads.length).toBeGreaterThanOrEqual(3)
    expect(candy.balls.filter((b) => b.y > 4).length).toBeGreaterThanOrEqual(9)
    expect(candy.babies[0].y).toBeGreaterThan(4)
  })

  it('Snow Land: ice slides and two or three snow gates', () => {
    const winter = courseById('winter')
    expect(winter.slides.length).toBeGreaterThanOrEqual(2)
    expect(winter.gates.length).toBeGreaterThanOrEqual(2)
    expect(winter.gates.length).toBeLessThanOrEqual(3)
  })

  it('Star Night: everything, two spinners back to back and three fans in a row taking turns', () => {
    const night = courseById('night')
    for (const kind of ['spinner', 'fan', 'frame', 'hole', 'gate', 'pad'] as const) expect(obstacles(night).some((o) => o.kind === kind), kind).toBe(true)
    expect(night.slides.length).toBeGreaterThan(0)
    expect(night.spinners[1].z - night.spinners[0].z).toBeLessThanOrEqual(20)
    const fans = night.fans
    expect(fans).toHaveLength(3)
    for (let i = 1; i < 3; i++) {
      expect(fans[i].z - fans[i - 1].z).toBeLessThanOrEqual(20)
      expect(Math.sign(fans[i].x)).toBe(-Math.sign(fans[i - 1].x))
    }
  })

  it('Park and its towers keep the numbers she gave: 1, 5, 1, 5, 100, later towers 6 to 9 circles with one or two 100s', () => {
    expect(park.circles.map((c) => c.n)).toEqual([1, 5, 1, 5, 100])
    for (const c of COURSES.slice(1)) {
      expect(c.circles.length).toBeGreaterThanOrEqual(6)
      expect(c.circles.length).toBeLessThanOrEqual(9)
      const hundreds = c.circles.filter((x) => x.n === 100).length
      expect(hundreds).toBeGreaterThanOrEqual(1)
      expect(hundreds).toBeLessThanOrEqual(2)
    }
  })
})

describe('the careful bot', () => {
  it.each(COURSE_IDS.map((id) => [id]))('finishes %s with every ball and baby, and no fall, hit or bonk, in one to two minutes', (id: CourseId) => {
    const c = courseById(id)
    const s = fresh(c)
    const bot = createBot()
    const { counts, real } = play(s, (s) => s.phase === 'done', 200, (s) => botStep(s, bot))
    expect(counts.splash ?? 0).toBe(0)
    expect(counts.hit ?? 0).toBe(0)
    expect(counts.bonk ?? 0).toBe(0)
    expect(s.slime.balls).toBe(c.balls.length)
    expect(s.slime.size).toBe(MAX_SIZE)
    expect(s.babies.every((b) => b.takenAt >= 0)).toBe(true)
    expect(s.stars).toBe(c.circles.reduce((n, circle) => n + circle.n, 0))
    expect(s.finish.animal).toBe(4)
    expect(real).toBeGreaterThan(55)
    expect(real).toBeLessThan(125)
  }, 30_000)

  it('learns what Park and Snow Land teach on the way', () => {
    const s = fresh(courseById('park'))
    const bot = createBot()
    play(s, (s) => s.phase === 'done', 200, (s) => botStep(s, bot))
    for (const kind of ['spinner', 'frame', 'hole'] as const) expect(s.learned).toContain(kind)
    const snow = createSim(courseById('winter'), { learned: s.learned, babiesHome: [false, false, false], gift: null })
    const snowBot = createBot()
    play(snow, (s) => s.phase === 'done', 200, (s) => botStep(s, snowBot))
    expect(snow.learned).toContain('gate')
  }, 30_000)

  it.each(COURSE_IDS.map((id) => [id]))('gets through the %s tower as the smallest and the biggest slime, whenever it arrives', (id: CourseId) => {
    const c = courseById(id)
    for (const balls of [0, c.balls.length]) {
      for (let k = 0; k < 6; k++) {
        const s = fresh(c)
        setBalls(s, balls)
        s.doing.towerClock = k * 0.71
        startTower(s)
        const bot = createBot()
        const { counts } = play(s, (s) => s.phase === 'done', 60, (s) => botStep(s, bot))
        expect(counts.bonk ?? 0, `${id} with ${balls} balls from clock ${s.doing.towerClock}`).toBe(0)
      }
    }
  }, 60_000)
})

describe('a child who presses nothing', () => {
  it.each(COURSE_IDS.map((id) => [id]))('still reaches the %s finish arch', (id: CourseId) => {
    const s = fresh(courseById(id))
    go(s)
    play(s, (s) => s.phase === 'finish', 600, null)
    expect(s.finish.keyAt).toBeGreaterThan(0)
  }, 30_000)
})

describe('a child with wild hands', () => {
  const NEXT: Record<Phase, readonly Phase[]> = {
    ready: ['run'],
    run: ['splash', 'finish'],
    splash: ['run'],
    finish: ['tower'],
    tower: ['fall', 'top'],
    fall: ['tower'],
    top: ['done'],
    done: [],
  }

  /** What must hold after every frame, whoever plays. Throws with the reason, so a long run fails with a message. */
  function check(s: Sim, was: Phase) {
    const sl = s.slime
    const fail = (why: string) => {
      throw new Error(`${s.course.id} at ${s.time.toFixed(2)} s: ${why}`)
    }
    for (const v of [sl.x, sl.y, sl.z, sl.vx, sl.vy, sl.vz, sl.r, sl.size, sl.spin, sl.edge, s.timeScale, s.time]) if (!Number.isFinite(v)) fail('a number is lost')
    let floating = 0
    for (const b of s.balls) if (b.takenAt < 0) floating++
    if (floating + sl.balls !== s.course.balls.length) fail(`${floating} balls floating and ${sl.balls} carried of ${s.course.balls.length}`)
    if (s.phase !== was && !NEXT[was].includes(s.phase)) fail(`went from ${was} to ${s.phase}`)
    if (s.phase !== 'splash' && sl.y < -1) fail(`down at y = ${sl.y} in ${s.phase}`)
    if (sl.size < 1 || sl.size > MAX_SIZE + 1e-9) fail(`size ${sl.size}`)
  }

  it.each(COURSE_IDS.map((id) => [id]))('keeps every promise on %s, mixed with careful play, all the way to the box', (id: CourseId) => {
    for (const seed of [1, 2]) {
      const rnd = mulberry32(seed * 7919 + id.length)
      const s = fresh(courseById(id))
      const bot = createBot()
      const seen = new Set<Phase>()
      let wild = 0
      for (let f = 0; f < 60 * 400 && s.phase !== 'done'; f++) {
        const was = s.phase
        if (wild > 0) wild--
        else if (rnd() < 0.004) wild = Math.floor(rnd() * 90)
        if (wild > 0) {
          if (rnd() < 0.08) setSteer(s, ([-1, 0, 1] as const)[Math.floor(rnd() * 3)])
          if (rnd() < 0.04) pressJump(s)
          if (rnd() < 0.03) setHide(s, true)
          if (rnd() < 0.05) setHide(s, false)
          bot.steer = s.input.steer
          bot.hide = s.input.hide
        } else botStep(s, bot)
        tick(s, rnd() < 0.01 ? 0.25 : DT)
        s.events.length = 0
        check(s, was)
        seen.add(s.phase)
      }
      expect(s.phase).toBe('done')
      expect(seen).toContain('tower')
    }
  }, 60_000)

  it('keeps every promise with nothing but random presses for minutes', () => {
    for (const c of COURSES) {
      const rnd = mulberry32(c.finishZ)
      const s = fresh(c)
      go(s)
      for (let f = 0; f < 60 * 180; f++) {
        const was = s.phase
        if (rnd() < 0.05) setSteer(s, ([-1, 0, 1] as const)[Math.floor(rnd() * 3)])
        if (rnd() < 0.02) pressJump(s)
        if (rnd() < 0.015) setHide(s, true)
        if (rnd() < 0.03) setHide(s, false)
        tick(s, DT)
        s.events.length = 0
        check(s, was)
      }
    }
  }, 60_000)
})
