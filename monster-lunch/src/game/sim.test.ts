import { describe, expect, it } from 'vitest'

import { parseCourse, type CourseText } from './course'
import {
  BONK_FOR,
  FLY_FOR,
  FROG_FOR,
  GATE_WARN,
  HERO_HALF,
  HERO_SPEED,
  HZ,
  SAFE_FOR,
  SWIM_FOR,
  TEETER_FOR,
  ZAP_FOR,
  type Course,
  type Sim,
  type SimEvent,
} from './model'
import { barsAt, cloneSim, createSim, FINISH_TIMES, setInput, sliderAt, spinnerAngle, step } from './sim'

/** A small test course: the map, its poles and gate times; everything else empty. */
function course(map: string[], extra: Partial<CourseText> = {}): Course {
  return parseCourse({ id: 'park', map, poles: {}, openFor: {}, puppies: [], ...extra })
}

/** Steps `seconds` with the input held, gathering the events. */
function run(s: Sim, c: Course, seconds: number, x = 0, y = 0): SimEvent[] {
  const out: SimEvent[] = []
  setInput(s, x, y)
  for (let i = 0; i < Math.round(seconds * HZ); i++) {
    step(s, c)
    out.push(...s.events)
    s.events.length = 0
  }
  return out
}

const kinds = (events: SimEvent[]) => events.map((e) => e.kind)

/** Steps with the input held until an event of `kind` happens (at most `max` seconds), gathering the events. */
function until(s: Sim, c: Course, kind: SimEvent['kind'], x: number, y: number, max = 5): SimEvent[] {
  const out: SimEvent[] = []
  setInput(s, x, y)
  for (let i = 0; i < max * HZ; i++) {
    step(s, c)
    out.push(...s.events)
    s.events.length = 0
    if (out.some((e) => e.kind === kind)) return out
  }
  throw new Error(`no ${kind} within ${max} s`)
}

/** An open field with the start at its left, the balloon far right. */
const FIELD = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~........................~',
  '~........................~',
  '~.S......................~',
  '~......................@.~',
  '~........................~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
]

describe('walking', () => {
  it('goes at her speed the way she is steered, and faces it', () => {
    const c = course(FIELD)
    const s = createSim(c, 'burger', ['cheese'])
    run(s, c, 1, 1, 0)
    // She reaches full speed in about a tenth of a second.
    expect(s.hero.x - c.start.x).toBeGreaterThan(HERO_SPEED - 0.25)
    expect(s.hero.x - c.start.x).toBeLessThan(HERO_SPEED * 1.0001)
    expect(s.hero.face).toBe('right')
    run(s, c, 0.5, 0, -1)
    expect(s.hero.face).toBe('up')
  })

  it('stops at a hedge and slides along it', () => {
    const c = course(['~~~~~~~~~~', '~...#....~', '~.S.#....~', '~...#..@.~', '~........~', '~~~~~~~~~~'])
    const s = createSim(c, 'burger', ['cheese'])
    run(s, c, 1, 1, 0)
    expect(s.hero.x).toBeCloseTo(4 - HERO_HALF, 3)
    const y = s.hero.y
    run(s, c, 0.3, 1, 1)
    expect(s.hero.x).toBeCloseTo(4 - HERO_HALF, 3)
    expect(s.hero.y).toBeGreaterThan(y + 0.5)
  })

  it('is the same every time: a clone steps alike and apart', () => {
    const c = course(FIELD)
    const a = createSim(c, 'burger', ['cheese'])
    run(a, c, 0.4, 1, 0.3)
    const b = cloneSim(a)
    run(a, c, 0.7, 0.2, 1)
    run(b, c, 0.7, 0.2, 1)
    expect(b).toEqual(a)
    run(b, c, 0.2, -1, 0)
    expect(b.hero.x).not.toBe(a.hero.x)
  })
})

describe('foods', () => {
  it('lie on their spots taking the picked fillings in turn, and hop onto the plate', () => {
    const c = course(['~~~~~~~~~~~~~~~~~~~~~~~~', '~.S.o.o.o.x..........@.~', '~......................~', '~~~~~~~~~~~~~~~~~~~~~~~~'])
    const s = createSim(c, 'croissant', ['jam', 'banana'])
    expect(s.items.map((it) => it.kind)).toEqual(['jam', 'banana', 'jam', 'poop'])
    const events = run(s, c, 2.4, 1, 0)
    expect(s.plate).toEqual(['jam', 'banana', 'jam', 'poop'])
    expect(events.filter((e) => e.kind === 'pick').map((e) => (e.kind === 'pick' ? e.n : 0))).toEqual([1, 2, 3, 4])
  })
})

describe('the water', () => {
  const POND = ['~~~~~~~~~~~~~~~~~~~~~~~', '~.S.o.o~..............~', '~......~..........@...~', '~......~~~~~~~~~~~~~~~~', '~......~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~~~~']

  it('makes her teeter, and if she keeps going the plate floats away and the frog brings her back', () => {
    const c = course(POND)
    const s = createSim(c, 'burger', ['patty'])
    until(s, c, 'teeter', 1, 0)
    expect(s.plate).toHaveLength(2)
    expect(s.hero.act).toBe('teeter')
    const fall = run(s, c, TEETER_FOR + 0.05, 1, 0)
    const splash = fall.find((e) => e.kind === 'splash')
    expect(splash).toMatchObject({ kind: 'splash', n: 2, foods: ['patty', 'patty'] })
    expect(s.plate).toEqual([])
    expect(s.lost).toBe(2)
    expect(s.hero.act).toBe('swim')
    const after = run(s, c, SWIM_FOR + FROG_FOR + 0.05)
    expect(kinds(after)).toEqual(['frog', 'back'])
    expect(s.hero.act).toBe('walk')
    expect([s.hero.x, s.hero.y]).toEqual([c.start.x, c.start.y])
    expect(s.hero.safeUntil).toBeGreaterThan(s.tick + (SAFE_FOR - 0.3) * HZ)
  })

  it('lets her step back from the edge in time', () => {
    const c = course(POND)
    const s = createSim(c, 'burger', ['patty'])
    until(s, c, 'teeter', 1, 0)
    run(s, c, TEETER_FOR * 0.6, 1, 0)
    expect(s.hero.act).toBe('teeter')
    run(s, c, 0.3, -1, 0)
    expect(s.hero.act).toBe('walk')
    run(s, c, 1, 0, 0)
    expect(s.hero.act).toBe('walk')
    expect(s.plate).toHaveLength(2)
  })

  it('never takes her while she walks along the shore', () => {
    const c = course(POND)
    const s = createSim(c, 'burger', ['patty'])
    // Up against the shore at column 7, then along it, pushing into the water a little all the way.
    until(s, c, 'teeter', 1, 0)
    const events = run(s, c, 0.8, 0.5, 1)
    expect(kinds(events)).not.toContain('splash')
    expect(s.hero.act).toBe('walk')
  })
})

describe('poles', () => {
  const SPIN = ['~~~~~~~~~~~~~~~~~~~~~~', '~....................~', '~.S.o.o.....1........~', '~...................@~', '~....................~', '~~~~~~~~~~~~~~~~~~~~~~']

  it('turn and glide as functions of time', () => {
    const c = course(SPIN, { poles: { 1: { kind: 'spin', reach: 2, arms: 2, speed: 0.25, phase: 0 } } })
    const sp = c.spinners[0]!
    expect(spinnerAngle(sp, HZ)).toBeCloseTo(Math.PI / 2, 9)
    expect(barsAt(c, 0)).toHaveLength(2)
    const sl = { ax: 0, ay: 0, bx: 4, by: 0, half: 1, angle: 0.25, period: 2, phase: 0 }
    expect(sliderAt(sl, 0).x).toBeCloseTo(0, 9)
    expect(sliderAt(sl, HZ).x).toBeCloseTo(4, 9)
    expect(sliderAt(sl, HZ / 2).toward).toBeGreaterThan(0)
  })

  it('knock every food off the plate; foods that land on the ground can be picked up again', () => {
    // A bar pointing straight at her, turning slowly: she walks into it.
    const c = course(SPIN, { poles: { 1: { kind: 'spin', reach: 3, arms: 1, speed: 0.02, phase: 0.5 } } })
    const s = createSim(c, 'burger', ['cheese', 'salad'])
    const events = run(s, c, 2.5, 1, 0)
    const bonk = events.find((e) => e.kind === 'bonk')
    expect(bonk).toMatchObject({ kind: 'bonk', n: 2 })
    expect(s.plate).toEqual([])
    expect(s.hero.act === 'bonk' || s.hero.act === 'walk').toBe(true)
    run(s, c, Math.max(FLY_FOR * 1.2, BONK_FOR))
    const lying = s.items.filter((it) => it.state === 'ground' && it.kind !== 'poop')
    expect(lying).toHaveLength(2)
    // Nothing knocks her again while she is safe.
    expect(s.tick).toBeLessThan(s.hero.safeUntil)
  })

  it('never throw food over a wall into a room she may not get back into', () => {
    // A hedge wall just north of a spinner's sweep; nothing may land beyond it, whatever the throws.
    const c = course(
      ['~~~~~~~~~~~~~~~~~~~~~~~', '~.....................~', '~#####################~', '~.S.o.o.o.o.1.......@.~', '~.....................~', '~~~~~~~~~~~~~~~~~~~~~~~'],
      { poles: { 1: { kind: 'spin', reach: 1.2, arms: 1, speed: 0.02, phase: 0.5 } } },
    )
    for (let seed = 1; seed <= 25; seed++) {
      const s = createSim(c, 'burger', ['cheese'], seed)
      run(s, c, 4, 1, 0)
      for (const it of s.items) if (it.state !== 'gone') expect(it.y, `seed ${seed}`).toBeGreaterThan(3)
    }
  })

  it('throw food into the water, where it is gone', () => {
    // A thin strip of land between two waters: a knock there throws most foods in.
    const c = course(
      ['~~~~~~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~~~~', '~.S.o.o.o.o.1.......@.~', '~~~~~~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~~~~'],
      { poles: { 1: { kind: 'spin', reach: 3, arms: 1, speed: 0.02, phase: 0.5 } } },
    )
    const s = createSim(c, 'burger', ['cheese'])
    const events = run(s, c, 4, 1, 0)
    const sunk = events.filter((e) => e.kind === 'sink').length
    const landed = events.filter((e) => e.kind === 'land').length
    expect(sunk + landed).toBe(4)
    expect(sunk).toBeGreaterThan(0)
    expect(s.lost).toBe(sunk)
  })
})

describe('gates and buttons', () => {
  const GATED = ['~~~~~~~~~~~~~~~~', '~...#..........~', '~.S.P......@...~', '~...#..........~', '~.p.#..........~', '~~~~~~~~~~~~~~~~']

  it('zap her back when shut, and the top food falls off behind her', () => {
    const c = course(['~~~~~~~~~~~~~~~~~~', '~.....#..........~', '~.S.o.P........@.~', '~.....#..........~', '~.p...#..........~', '~~~~~~~~~~~~~~~~~~'])
    const s = createSim(c, 'burger', ['cheese'])
    const events = run(s, c, 1.5, 1, 0)
    const zap = events.find((e) => e.kind === 'zap')
    expect(zap).toMatchObject({ kind: 'zap', hue: 'pink', lost: true })
    expect(s.plate).toEqual([])
    expect(s.hero.x).toBeLessThan(6)
    run(s, c, ZAP_FOR + FLY_FOR)
    const behind = s.items.find((it) => it.kind === 'cheese')!
    expect(behind.state).toBe('ground')
    expect(behind.x).toBeLessThan(6)
  })

  it('open every gate of their hue, for good', () => {
    const c = course(GATED)
    const s = createSim(c, 'burger', ['cheese'])
    const press = run(s, c, 0.6, 0, 1)
    expect(kinds(press)).toEqual(['press', 'open'])
    expect(s.gates[0]!.open).toBe(true)
    run(s, c, 0.5, 0, -1)
    run(s, c, 0.4, 0, 0)
    // Into the middle of row 2, the gateway's row.
    for (let i = 0; i < HZ && Math.abs(s.hero.y - 2.5) > 0.05; i++) run(s, c, 1 / HZ, 0, (2.5 - s.hero.y) * 4)
    const through = run(s, c, 2, 1, 0)
    expect(kinds(through)).not.toContain('zap')
    expect(s.hero.x).toBeGreaterThan(6)
  })

  it('that close again warn first, shut, push her out of the way and pop their buttons up', () => {
    const c = course(GATED, { openFor: { pink: 6 } })
    const s = createSim(c, 'burger', ['cheese'])
    run(s, c, 0.6, 0, 1)
    run(s, c, 0.5, 0, -1)
    run(s, c, 0.4, 0, 0)
    for (let i = 0; i < HZ && Math.abs(s.hero.y - 2.5) > 0.05; i++) run(s, c, 1 / HZ, 0, (2.5 - s.hero.y) * 4)
    // Walk into the gateway and stand there until it shuts.
    for (let i = 0; i < HZ && s.hero.x < 4.5; i++) run(s, c, 1 / HZ, 1, 0)
    run(s, c, 0.15)
    expect(Math.floor(s.hero.x)).toBe(4)
    const wait = run(s, c, 6)
    expect(kinds(wait)).toEqual(['warn', 'close', 'shove'])
    const warnAt = wait.indexOf(wait.find((e) => e.kind === 'warn')!)
    expect(warnAt).toBe(0)
    expect(s.gates[0]!.open).toBe(false)
    expect(s.buttons[0]!.down).toBe(false)
    expect(s.hero.x < 4 - HERO_HALF + 0.02 || s.hero.x > 5 + HERO_HALF - 0.02).toBe(true)
    expect(GATE_WARN).toBeLessThan(6 - 2)
  })

  it('that shut on her as she walks in push her out without a zap, even if she keeps walking', () => {
    const c = course(GATED, { openFor: { pink: 2 } })
    const s = createSim(c, 'burger', ['cheese'])
    s.plate.push('cheese')
    // Her middle just inside the gateway's near half, walking in at full speed, the gate shutting on the next step.
    s.gates[0] = { open: true, at: 0, until: 1 }
    s.hero.x = s.hero.px = 4.3
    s.hero.y = s.hero.py = 2.5
    s.hero.vx = HERO_SPEED
    const events = run(s, c, 0.5, 1, 0)
    expect(kinds(events)).toContain('shove')
    expect(kinds(events)).not.toContain('zap')
    expect(s.plate).toEqual(['cheese'])
    expect(s.hero.x).toBeLessThan(4)
  })
})

describe('flags and the finish', () => {
  it('the frog brings her back to the flag she reached last, whatever their order on the map', () => {
    // Flag 0 (row 1) lies past flag 1 (row 3) on her way: she reaches flag 1 first, then flag 0, then falls in.
    const c = course(['~~~~~~~~~~~~~~~~~~~~~~', '~..........F.~.......~', '~..........~~~...@...~', '~.S..F.....~~~.......~', '~..........~~~.......~', '~~~~~~~~~~~~~~~~~~~~~~'])
    const s = createSim(c, 'burger', ['cheese'])
    until(s, c, 'flag', 1, 0)
    expect(s.flag).toBe(1)
    until(s, c, 'flag', 1, -0.55)
    expect(s.flag).toBe(0)
    until(s, c, 'splash', 1, 0)
    run(s, c, SWIM_FOR + FROG_FOR + 0.05)
    expect([s.hero.x, s.hero.y]).toEqual([c.flags[0]!.x, c.flags[0]!.y])
  })

  it('a flag is where the frog brings her back to', () => {
    const c = course(['~~~~~~~~~~~~~~~~~~~~~~~', '~.S..F.~..............~', '~......~..........@...~', '~~~~~~~~~~~~~~~~~~~~~~~'])
    const s = createSim(c, 'burger', ['cheese'])
    const events = until(s, c, 'splash', 1, 0)
    expect(kinds(events)).toContain('flag')
    expect(s.flag).toBe(0)
    run(s, c, SWIM_FOR + FROG_FOR + 0.05)
    expect([s.hero.x, s.hero.y]).toEqual([c.flags[0]!.x, c.flags[0]!.y])
  })

  it('at the balloon: the bread, climbing in, the lift-off, then done', () => {
    const c = course(FIELD)
    const s = createSim(c, 'burger', ['cheese'])
    const start = until(s, c, 'finish', 1, 0.08, 10)
    const at = s.tick
    const events = run(s, c, FINISH_TIMES.done + 0.1, 1, 0)
    expect(kinds([...start, ...events]).filter((k) => k !== 'flag')).toEqual(['finish', 'bread', 'climb', 'liftoff'])
    expect(s.phase).toBe('done')
    expect((s.phaseAt - at) / HZ).toBeCloseTo(FINISH_TIMES.done, 1)
    // She stands at the basket's front, and steering does nothing any more.
    const x = s.hero.x
    run(s, c, 0.5, -1, 0)
    expect(s.hero.x).toBe(x)
  })
})

describe('a puppy', () => {
  it('trots its lane and leaves poops now and then, never by a food or by her', () => {
    const c = course(['~~~~~~~~~~~~~~~~~~~~~~~~', '~.S....................~', '~.d.......o..........@.~', '~......................~', '~~~~~~~~~~~~~~~~~~~~~~~~'], {
      puppies: [
        {
          path: [
            [2, 2],
            [18, 2],
          ],
          every: 1,
        },
      ],
    })
    const s = createSim(c, 'burger', ['cheese'])
    const events = run(s, c, 20)
    const poops = events.filter((e) => e.kind === 'puppy')
    expect(poops.length).toBeGreaterThan(0)
    // At most PUPPY_POOPS of its own lie about.
    expect(s.items.filter((it) => it.kind === 'poop' && it.state === 'ground').length).toBeLessThanOrEqual(3)
    const food = c.foods[0]!
    for (const e of poops) {
      if (e.kind !== 'puppy') continue
      expect(Math.hypot(e.x - food.x, e.y - food.y)).toBeGreaterThanOrEqual(1.2)
      expect(Math.hypot(e.x - c.start.x, e.y - c.start.y)).toBeGreaterThan(1.2)
    }
  })
})
