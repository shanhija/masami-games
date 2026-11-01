/**
 * Every rule of the sim on its own, on small hand-made courses: a straight track with
 * just the thing under test on it. The five real courses are proven in courses.test.ts.
 */
import { describe, expect, it } from 'vitest'

import {
  BALL_R,
  DROP_FOR,
  EASY_AFTER,
  FAN_DOWN,
  FAN_HARD,
  FAN_SOFT,
  FAN_UP,
  FRAME_DEPTH,
  FRAME_H,
  GATE_GAP,
  GIANT_HOLE,
  HIDDEN_TOP,
  HIDE_FOR,
  MAX_SIZE,
  PADDLE_BOTTOM,
  POLE_DZ,
  POLE_X,
  R0,
  TEACH_SCALE,
  TOWER_HALF,
  TRACK_HALF,
  TRAMPOLINE_DZ,
  animalFor,
  type BabySpec,
  type BallSpec,
  type Course,
  type EventKind,
  type Sim,
  type SimEvent,
  type Teachable,
} from './model'
import {
  BALL_Y,
  CIRCLE_R,
  FAN_CYCLE,
  HOLE_GRACE,
  JUMP_EARLY,
  PAD_THROW_H,
  RISE_V,
  RUN_V,
  SLIDE_SPEED,
  STEER_V,
  createSim,
  fanPowerAt,
  go,
  gravityFor,
  groundAt,
  inHole,
  inRect,
  jumpSpeedFor,
  jumpWindow,
  nextJump,
  onSlab,
  pressJump,
  progress,
  setBalls,
  setHide,
  setSteer,
  startAt,
  startTop,
  startTower,
  tick,
  windLoud,
} from './sim'

const DT = 1 / 60
const ALL: readonly Teachable[] = ['spinner', 'fan', 'frame', 'hole', 'gate', 'circle']
/** Babies out of reach in the water, for courses that are not about them. */
const AWAY: BabySpec = { x: 40, y: 0, z: 900 }
/** Balls out of reach, so setBalls can make the slime any size. */
const SPARE: BallSpec[] = Array.from({ length: 30 }, (_, i) => ({ x: 40, y: BALL_Y, z: 900 + i }))

/** A straight track from z = -4 to 400 with nothing on it but what `over` adds. */
function track(over: Partial<Course>): Course {
  return {
    id: 'park',
    ground: [{ x0: -TRACK_HALF, x1: TRACK_HALF, z0: -4, z1: 400 }],
    holes: [],
    spinners: [],
    fans: [],
    frames: [],
    pads: [],
    slides: [],
    gates: [],
    flags: [],
    balls: [],
    babies: [AWAY, AWAY, AWAY],
    finishZ: 300,
    circles: [],
    ...over,
  }
}

/** A run of the course after Go, everything already taught unless told otherwise. */
function start(course: Course, learned: readonly Teachable[] = ALL): Sim {
  const s = createSim(course, { learned, babiesHome: [false, false, false], gift: 'cap' })
  go(s)
  s.events.length = 0
  return s
}

/** A run on a track with spare balls, at a size from 1 to MAX_SIZE. */
function sized(over: Partial<Course>, size: number, learned: readonly Teachable[] = ALL): Sim {
  const s = start(track({ balls: SPARE, ...over }), learned)
  setBalls(s, ((size - 1) / (MAX_SIZE - 1)) * SPARE.length)
  return s
}

type Driver = (s: Sim) => void
const kinds = (events: SimEvent[]) => events.map((e) => e.kind)

/** Ticks `seconds` of real time on, drivers first each frame, and returns every event in order. */
function drive(s: Sim, seconds: number, ...drivers: Driver[]): SimEvent[] {
  const events: SimEvent[] = []
  for (let i = Math.round(seconds / DT); i > 0; i--) {
    for (const d of drivers) d(s)
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  return events
}

/** Ticks on until an event of this kind happens (that frame included) and returns it; fails after `most` real seconds. */
function driveUntil<K extends EventKind>(s: Sim, kind: K, most: number, ...drivers: Driver[]): Extract<SimEvent, { kind: K }> {
  for (let i = Math.round(most / DT); i > 0; i--) {
    for (const d of drivers) d(s)
    tick(s, DT)
    const seen = s.events.find((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind)
    s.events.length = 0
    if (seen) return seen
  }
  throw new Error(`no ${kind} within ${most} s (slime at z ${s.slime.z.toFixed(2)}, x ${s.slime.x.toFixed(2)}, ${s.phase})`)
}

/** Ticks on while `going` holds; fails after `most` real seconds. Returns the events on the way. */
function driveWhile(s: Sim, going: (s: Sim) => boolean, most: number, ...drivers: Driver[]): SimEvent[] {
  const events: SimEvent[] = []
  for (let i = Math.round(most / DT); i > 0 && going(s); i--) {
    for (const d of drivers) d(s)
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  if (going(s)) throw new Error(`still going after ${most} s (slime at z ${s.slime.z.toFixed(2)}, ${s.phase})`)
  return events
}

const steer = (dir: -1 | 0 | 1): Driver => (s) => setSteer(s, dir)
const mod = (v: number, m: number) => ((v % m) + m) % m
/** n balls in a row along x = x0 from z0 to z1. */
const line = (x0: number, z0: number, z1: number, n: number): BallSpec[] => Array.from({ length: n }, (_, i) => ({ x: x0, y: BALL_Y, z: z0 + ((z1 - z0) * i) / (n - 1) }))
const holdHide: Driver = (s) => setHide(s, true)

describe('the clock', () => {
  it('takes real seconds, at most 0.1 a frame, and scales them by timeScale', () => {
    const s = start(track({}))
    tick(s, 1)
    expect(s.time).toBeCloseTo(0.1, 9)
    tick(s, 0.05)
    expect(s.time).toBeCloseTo(0.15, 9)
    s.timeScale = 0.5
    tick(s, 0.02)
    expect(s.time).toBeLessThan(0.15 + 0.02)
    expect(s.timeScale).toBeGreaterThan(0.5)
  })

  it('refuses a step that is no number or runs backward', () => {
    const s = start(track({}))
    expect(() => tick(s, Number.NaN)).toThrow(/0 or more/)
    expect(() => tick(s, -1)).toThrow(/0 or more/)
  })

  it('waits on the ready card until Go', () => {
    const s = createSim(track({}), { learned: ALL, babiesHome: [false, false, false], gift: null })
    drive(s, 1)
    expect(s.phase).toBe('ready')
    expect(s.slime.z).toBe(0)
    go(s)
    expect(s.phase).toBe('run')
    expect(kinds(s.events)).toEqual(['go'])
  })
})

describe('running', () => {
  it('eases forward to the running speed by itself, on the main line', () => {
    const s = start(track({}))
    drive(s, 2)
    expect(s.slime.vz).toBeCloseTo(RUN_V, 1)
    expect(s.slime.x).toBe(0)
  })

  it('steers to the side at the steering speed, in the air too', () => {
    const s = start(track({}))
    drive(s, 0.5, steer(1))
    expect(s.slime.vx).toBeCloseTo(STEER_V, 0)
    drive(s, 0.1, steer(0))
    pressJump(s)
    const x = s.slime.x
    drive(s, 0.3, steer(-1))
    expect(s.slime.grounded).toBe(false)
    expect(s.slime.x).toBeLessThan(x - 0.5)
  })

  it('runs faster on an ice slide, saying so on the way in, and slides only while on it', () => {
    const slide = { x0: -TRACK_HALF, x1: TRACK_HALF, z0: 6, z1: 60 }
    const s = start(track({ slides: [slide] }))
    expect(s.slime.sliding).toBe(false)
    const events = drive(s, 4)
    expect(s.slime.vz).toBeCloseTo(RUN_V * SLIDE_SPEED, 1)
    expect(s.slime.sliding).toBe(true)
    expect(kinds(events).filter((k) => k === 'slide')).toHaveLength(1)
    driveWhile(s, (s) => s.slime.z < 61, 8)
    expect(s.slime.sliding).toBe(false)
    const arch = start(track({ slides: [slide], finishZ: 30 }))
    driveUntil(arch, 'key', 8)
    expect(arch.slime.sliding).toBe(false)
  })
})

describe('edges and water', () => {
  const course = track({ holes: [{ x: 0, z: 20, r: 1.5 }], flags: [{ z: 10 }] })

  it('knows where the track holds a slime: in a slab, and not deep inside a hole', () => {
    expect(groundAt(course, 0, 5)).toBe(true)
    expect(groundAt(course, TRACK_HALF + 0.1, 5)).toBe(false)
    expect(groundAt(course, 0, 20)).toBe(false)
    expect(groundAt(course, 0, 20 - 1.5 + HOLE_GRACE / 2)).toBe(true)
    expect(groundAt(course, 0, -5)).toBe(false)
  })

  it('asks the slabs and the holes on their own: a slab counts to its very edge, a hole from its grace inside the rim', () => {
    expect(inRect(course.ground[0], TRACK_HALF, 400)).toBe(true)
    expect(inRect(course.ground[0], TRACK_HALF + 0.01, 5)).toBe(false)
    expect(onSlab(course, 0, 20)).toBe(true)
    expect(onSlab(course, 0, -5)).toBe(false)
    expect(inHole(course, 0, 20 - 1.5 + HOLE_GRACE / 2, 0)).toBe(true)
    expect(inHole(course, 0, 20 - 1.5 + HOLE_GRACE / 2, HOLE_GRACE)).toBe(false)
    expect(inHole(course, 0, 5, 0)).toBe(false)
  })

  it('falls off a side into the water, and the fish spits it back to the start with every ball', () => {
    const s = start(track({ balls: [{ x: 0, y: BALL_Y, z: 3 }, ...SPARE] }))
    drive(s, 1.2)
    expect(s.slime.balls).toBe(1)
    const events = driveWhile(s, (s) => s.phase !== 'splash', 3, steer(1))
    expect(kinds(events)).toContain('splash')
    expect(s.time - s.slime.splashAt).toBeLessThan(DT)
    expect(s.slime.splashX).toBeGreaterThan(TRACK_HALF)
    const splashAt = s.slime.splashAt
    driveUntil(s, 'fish', 1)
    expect(s.time - splashAt).toBeCloseTo(0.6, 1)
    driveUntil(s, 'back', 3)
    expect(s.time - splashAt).toBeGreaterThan(1.8)
    expect(s.time - splashAt).toBeLessThan(2.6)
    expect(s.phase).toBe('run')
    expect(s.slime.x).toBe(0)
    expect(s.slime.z).toBe(0)
    expect(s.slime.fishUntil).toBeCloseTo(s.time + 3, 6)
    expect(s.slime.balls).toBe(1)
  })

  it('goes back to the last flag passed, and never below y = -1', () => {
    const s = start(course)
    let lowest = 0
    driveUntil(s, 'flag', 3)
    expect(s.checkpoint).toBe(0)
    expect(s.flags[0].reachedAt).toBe(s.time)
    driveUntil(s, 'splash', 4, (s) => (lowest = Math.min(lowest, s.slime.y)))
    expect(s.slime.splashZ).toBeGreaterThan(18)
    driveUntil(s, 'back', 4, (s) => (lowest = Math.min(lowest, s.slime.y)))
    expect(s.slime.z).toBeCloseTo(10, 1)
    expect(lowest).toBeGreaterThan(-1)
  })

  it('warns as the centre nears a side edge', () => {
    const s = start(track({}))
    expect(s.slime.edge).toBe(0)
    const seen: number[] = []
    driveWhile(s, (s) => s.slime.x < TRACK_HALF - 0.05, 2, steer(1), (s) => seen.push(s.slime.edge))
    expect(Math.min(...seen)).toBe(0)
    expect(s.slime.edge).toBeGreaterThan(0.8)
  })
})

describe('jumping', () => {
  it('jumps only standing and not flat, and says how big it is', () => {
    const s = start(track({}))
    drive(s, 0.5)
    setHide(s, true)
    pressJump(s)
    expect(s.slime.grounded).toBe(true)
    setHide(s, false)
    drive(s, HIDE_FOR + 0.1)
    pressJump(s)
    expect(kinds(s.events)).toEqual(['jump'])
    expect(s.events[0]).toEqual({ kind: 'jump', big: false })
    const land = driveUntil(s, 'land', 2)
    expect(land).toEqual({ kind: 'land', big: false })
    const big = sized({}, 2.5)
    drive(big, 0.5)
    pressJump(big)
    expect(big.events.at(-1)).toEqual({ kind: 'jump', big: true })
  })

  it('counts a press a moment before landing', () => {
    for (const [early, jumps] of [
      [JUMP_EARLY - 0.05, true],
      [JUMP_EARLY + 0.15, false],
    ] as const) {
      const s = start(track({}))
      drive(s, 0.5)
      pressJump(s)
      const g = gravityFor(1)
      const air = (2 * jumpSpeedFor(1)) / g
      drive(s, air - early)
      expect(s.slime.grounded).toBe(false)
      pressJump(s)
      const events = drive(s, early + 0.05)
      expect(kinds(events).includes('jump')).toBe(jumps)
    }
  })

  it('jumps small and quick, big and slower but longer and a bit higher', () => {
    const air = (size: number) => (2 * jumpSpeedFor(size)) / gravityFor(size)
    const height = (size: number) => jumpSpeedFor(size) ** 2 / (2 * gravityFor(size))
    expect(air(MAX_SIZE)).toBeGreaterThan(air(1) * 1.3)
    expect(height(MAX_SIZE)).toBeGreaterThan(height(1))
    expect(height(MAX_SIZE)).toBeLessThan(height(1) * 1.5)
  })

  it('clears a frame and a hole of radius 1.5 at every size, with a take-off window of more than 0.3 s', () => {
    for (let size = 1; size <= MAX_SIZE + 1e-9; size += 0.1) {
      const r = R0 * size
      const frame = jumpWindow(size, RUN_V, -FRAME_DEPTH / 2 - r, FRAME_DEPTH / 2 + r, FRAME_H)
      const hole = jumpWindow(size, RUN_V, -(1.5 - HOLE_GRACE), 1.5 - HOLE_GRACE, 0.02)
      expect(frame).not.toBeNull()
      expect(hole).not.toBeNull()
      expect((frame!.hi - frame!.lo) / RUN_V).toBeGreaterThan(0.3)
      expect((hole!.hi - hole!.lo) / RUN_V).toBeGreaterThan(0.3)
    }
  })

  it('really clears a frame from either end of its window, small and big', () => {
    for (const size of [1, 2, MAX_SIZE]) {
      for (const end of ['lo', 'hi'] as const) {
        const s = sized({ frames: [{ z: 30, x0: -TRACK_HALF, x1: TRACK_HALF }] }, size)
        driveWhile(s, (s) => {
          const j = nextJump(s, 12)
          return j === null || s.slime.z < (end === 'lo' ? j.lo + 0.02 : j.hi - 0.1)
        }, 8)
        pressJump(s)
        const events = driveWhile(s, (s) => s.slime.z < 36, 3)
        expect(kinds(events)).not.toContain('climb')
      }
    }
  })

  it('bounces once more when big, and that BOING pulls in every ball near', () => {
    const near = { x: 2.5, y: BALL_Y, z: 14 }
    const s = sized({ balls: [...SPARE, near] }, 2.4)
    drive(s, 1.5)
    const balls = s.slime.balls
    pressJump(s)
    const events = drive(s, 2)
    expect(kinds(events).filter((k) => k === 'bounce')).toHaveLength(1)
    expect(kinds(events).filter((k) => k === 'land')).toHaveLength(1)
    expect(s.slime.bounceAt).toBeGreaterThan(0)
    expect(s.slime.balls).toBe(balls + 1)
    const small = start(track({}))
    drive(small, 0.5)
    pressJump(small)
    expect(kinds(drive(small, 2))).not.toContain('bounce')
  })
})

describe('hiding', () => {
  it('is low enough for every paddle and gate, whatever the size', () => {
    expect(HIDDEN_TOP).toBeLessThan(PADDLE_BOTTOM)
    expect(HIDDEN_TOP).toBeLessThan(GATE_GAP)
  })

  it('goes flat at once, stays flat a tap long, and comes back up', () => {
    const s = start(track({}))
    drive(s, 0.5)
    setHide(s, true)
    setHide(s, false)
    expect(s.slime.hidden).toBe(true)
    expect(s.slime.hiddenAt).toBe(s.time)
    expect(kinds(s.events)).toEqual(['hide'])
    const shown = driveUntil(s, 'show', 2)
    expect(shown.kind).toBe('show')
    expect(s.slime.shownAt - s.slime.hiddenAt).toBeCloseTo(HIDE_FOR, 1)
  })

  it('stays flat while held, steers flat, and can go flat in the air', () => {
    const s = start(track({}))
    drive(s, 0.5)
    const x = s.slime.x
    setHide(s, true)
    drive(s, 0.4, steer(1))
    drive(s, 2.6, steer(0))
    expect(s.slime.hidden).toBe(true)
    expect(s.slime.x).toBeGreaterThan(x + 1)
    setHide(s, false)
    drive(s, 0.05)
    expect(s.slime.hidden).toBe(false)
    pressJump(s)
    drive(s, 0.15)
    setHide(s, true)
    expect(s.slime.grounded).toBe(false)
    expect(s.slime.hidden).toBe(true)
  })
})

describe('balls', () => {
  it('are taken only when the body really touches them', () => {
    const reach = R0 + BALL_R
    const s = start(track({ balls: [{ x: reach - 0.05, y: R0, z: 6 }, { x: -(reach + 0.1), y: R0, z: 8 }, ...SPARE] }))
    drive(s, 2.5)
    expect(s.balls.slice(0, 2).map((b) => b.takenAt >= 0)).toEqual([true, false])
  })

  it('are taken by the body, flat or not, and every one makes the slime bigger', () => {
    const balls = [...line(0, 4, 14, 10), { x: 2, y: BALL_Y, z: 16 }, ...SPARE.slice(0, 9)]
    const s = start(track({ balls }))
    const events = drive(s, 1.4)
    const taken = events.filter((e) => e.kind === 'ball')
    expect(taken.length).toBeGreaterThan(2)
    setHide(s, true)
    events.push(...drive(s, 2, holdHide))
    expect(s.slime.balls).toBe(10)
    expect(kinds(events).filter((k) => k === 'burp')).toHaveLength(1)
    expect(s.slime.size).toBeCloseTo(1 + ((MAX_SIZE - 1) * 10) / balls.length, 9)
    expect(s.slime.r).toBeCloseTo(R0 * s.slime.size, 9)
    expect(s.balls[10].takenAt).toBe(-1)
  })
})

describe('spinners', () => {
  const spinning = (period: number): Partial<Course> => ({ spinners: [{ x: -4.6, z: 16, reach: 7.9, arms: 2, period, phase: 0, dir: -1 }] })

  it('turn by their period and direction', () => {
    const s = start(track(spinning(4)))
    drive(s, 1)
    expect(s.spinners[0].angle).toBeCloseTo(mod(-(2 * Math.PI * s.time) / 4, 2 * Math.PI), 6)
  })

  it('hit a slime that is not flat: dizzy, two balls knocked off ahead, back along the track, then paddles pass through', () => {
    const s = sized(spinning(2), 1.6)
    const carried = s.slime.balls
    const hit = driveUntil(s, 'hit', 6)
    expect(hit).toEqual({ kind: 'hit', dropped: 2 })
    const sl = s.slime
    const at = { x: sl.x, z: sl.z, t: sl.hitAt }
    expect(sl.ghostUntil).toBeCloseTo(at.t + 1.5, 9)
    expect(sl.balls).toBe(carried - 2)
    const dropped = s.balls.filter((b) => b.droppedAt >= 0)
    expect(dropped).toHaveLength(2)
    for (const b of dropped) {
      expect(b.droppedAt).toBe(at.t)
      expect(b.z).toBeGreaterThan(at.z)
      expect(groundAt(s.course, b.x, b.z)).toBe(true)
    }
    let back = at.z
    drive(s, 0.6, (s) => (back = Math.min(back, s.slime.z)))
    expect(at.z - back).toBeGreaterThan(1.2)
    expect(at.z - back).toBeLessThan(1.8)
    expect(sl.x).toBe(at.x)
    expect(s.balls.filter((b) => b.takenAt < 0).length + sl.balls).toBe(s.course.balls.length)
    const later = drive(s, 1.4 - 0.6 - DT)
    expect(kinds(later)).not.toContain('hit')
  })

  it('let a ball knocked off be taken only once it has landed', () => {
    const s = sized(spinning(2), 1.6)
    driveUntil(s, 'hit', 6)
    const b = s.balls.find((b) => b.droppedAt >= 0)!
    const onIt: Driver = (s) => {
      s.slime.x = b.x
      s.slime.z = b.z
    }
    drive(s, DROP_FOR - 0.1, onIt)
    expect(b.takenAt).toBe(-1)
    drive(s, 0.2, onIt)
    expect(b.takenAt).toBeGreaterThanOrEqual(b.droppedAt + DROP_FOR)
  })

  it('pass over a flat slime', () => {
    const s = start(track(spinning(2)))
    const events = driveWhile(s, (s) => s.slime.z < 26, 8, holdHide)
    expect(kinds(events)).not.toContain('hit')
  })

  it('turn at half speed after three hits', () => {
    const s = start(track(spinning(2)))
    for (let i = 0; i < EASY_AFTER; i++) {
      startAt(s, 6)
      s.slime.ghostUntil = -1
      driveUntil(s, 'hit', 6)
    }
    expect(s.spinners[0].hits).toBe(EASY_AFTER)
    expect(s.spinners[0].easy).toBe(true)
    const a = s.spinners[0].angle
    const t = s.time
    drive(s, 0.2)
    const turned = mod(a - s.spinners[0].angle, 2 * Math.PI)
    expect(turned).toBeCloseTo((Math.PI * (s.time - t)) / 2, 6)
  })
})

describe('fans', () => {
  /** A fan over the whole track at z = 30 (only a test does that), hard from 3.5 to 5.7 s. */
  const blowing: Partial<Course> = { fans: [{ x: 0, z: 30, width: 6, reach: 7, phase: 0 }] }

  it('breathe softly, speed up, blow hard and slow down, round and round', () => {
    const spec = { x: 0, z: 0, width: 3, reach: 7, phase: 0 }
    expect(fanPowerAt(spec, 1)).toBeCloseTo(0.15, 9)
    expect(fanPowerAt(spec, FAN_SOFT + FAN_UP / 2)).toBeGreaterThan(0.4)
    expect(fanPowerAt(spec, FAN_SOFT + FAN_UP + FAN_HARD / 2)).toBe(1)
    expect(fanPowerAt(spec, FAN_SOFT + FAN_UP + FAN_HARD + FAN_DOWN - 0.001)).toBeCloseTo(0.15, 2)
    expect(fanPowerAt(spec, FAN_CYCLE + 1)).toBeCloseTo(0.15, 9)
  })

  it('blow a small slime backward and turn it round; it sneezes once a gust', () => {
    const s = start(track(blowing))
    const events = drive(s, 5.4)
    expect(s.slime.vz).toBeLessThan(0)
    expect(Math.abs(s.slime.spin)).toBeGreaterThan(0)
    expect(s.slime.windAt).toBeGreaterThan(0)
    expect(kinds(events)).toContain('spun')
    expect(kinds(events).filter((k) => k === 'sneeze')).toHaveLength(1)
    expect(s.fans[0].pushes).toBe(1)
    expect(windLoud(s)).toBeGreaterThan(0.5)
  })

  it('barely hold back a big slime', () => {
    const s = sized(blowing, MAX_SIZE)
    drive(s, 5.4)
    expect(s.slime.vz).toBeGreaterThan(0)
    expect(s.slime.vz).toBeLessThan(1.2)
  })

  it('announce speeding up, and blow at under half after three gusts', () => {
    const s = start(track(blowing))
    expect(driveUntil(s, 'windUp', 4)).toEqual({ kind: 'windUp', fan: 0 })
    for (let gust = 0; gust < EASY_AFTER; gust++) {
      startAt(s, 25)
      driveUntil(s, 'sneeze', FAN_CYCLE + 1, (s) => {
        if (s.slime.z > 26) startAt(s, 25)
      })
    }
    expect(s.fans[0].easy).toBe(true)
    startAt(s, 25)
    driveWhile(s, (s) => s.fans[0].power < 1, FAN_CYCLE + 1, (s) => startAt(s, 25))
    drive(s, 1)
    expect(s.slime.vz).toBeGreaterThan(1)
  })

  it('have a soft cage the slime slides round, and never off the track', () => {
    for (const fx of [0, 1.9, -1.9]) {
      for (const off of [0, 0.3]) {
        for (const size of [1, MAX_SIZE]) {
          const s = sized({ fans: [{ x: fx, z: 20, width: 0.1, reach: 0.5, phase: 0 }] }, size)
          s.slime.x = fx + off * Math.sign(fx)
          let widest = 0
          const events = driveWhile(s, (s) => s.slime.z < 24, 8, (s) => (widest = Math.max(widest, Math.abs(s.slime.x))))
          expect(kinds(events)).toContain('bump')
          expect(kinds(events)).not.toContain('splash')
          expect(widest).toBeLessThanOrEqual(TRACK_HALF)
          expect(events.filter((e) => e.kind === 'bump').length).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})

describe('climbing frames', () => {
  const frame = track({ frames: [{ z: 20, x0: -TRACK_HALF, x1: TRACK_HALF }] })

  it('catch a slime that does not jump, and it climbs over in about a second', () => {
    const s = start(frame)
    driveUntil(s, 'climb', 6)
    const at = s.slime.climbAt
    let top = 0
    driveUntil(s, 'over', 2, (s) => (top = Math.max(top, s.slime.y)))
    expect(s.time - at).toBeCloseTo(1, 1)
    expect(top).toBeCloseTo(FRAME_H, 1)
    expect(s.slime.z).toBeGreaterThan(20 + FRAME_DEPTH / 2 + s.slime.r)
    expect(s.slime.climbAt).toBe(-1)
  })

  it('let a climbing slime hop straight over with a jump', () => {
    const s = start(frame)
    driveUntil(s, 'climb', 6)
    drive(s, 0.1)
    pressJump(s)
    expect(kinds(s.events)).toContain('jump')
    const events = driveWhile(s, (s) => !s.slime.grounded || s.slime.z < 22, 2)
    expect(kinds(events)).not.toContain('over')
    expect(kinds(events)).not.toContain('climb')
  })
})

describe('snow gates', () => {
  const gate = track({ gates: [{ z: 20, x0: -TRACK_HALF, x1: TRACK_HALF }] })

  it('bump back a slime that is not flat', () => {
    const s = start(gate)
    driveUntil(s, 'bump', 6)
    const z = s.slime.z
    expect(s.gates[0].bumps).toBe(1)
    expect(s.slime.bumpAt).toBeGreaterThan(0)
    let back = z
    drive(s, 0.5, (s) => (back = Math.min(back, s.slime.z)))
    expect(z - back).toBeGreaterThan(0.8)
  })

  it('let a flat slime under, and keep it flat until it is out', () => {
    const s = start(gate)
    driveWhile(s, (s) => s.slime.z < 14.6, 6)
    setHide(s, true)
    setHide(s, false)
    const events = driveWhile(s, (s) => s.slime.hidden, 3)
    expect(kinds(events)).not.toContain('bump')
    expect(s.time - s.slime.hiddenAt).toBeGreaterThan(HIDE_FOR + 0.05)
    expect(s.slime.z - s.slime.r).toBeGreaterThan(20 + 0.4 - 0.1)
  })

  it('lift out of the way after three bumps', () => {
    const s = start(gate)
    const events = driveWhile(s, (s) => s.slime.z < 23, 20)
    expect(kinds(events).filter((k) => k === 'bump')).toHaveLength(EASY_AFTER)
    expect(events).toContainEqual({ kind: 'easy', what: 'gate' })
    expect(s.gates[0].liftAt).toBeGreaterThan(0)
  })
})

describe('marshmallow cushions', () => {
  it('throw a slime that runs onto one high up', () => {
    const s = start(track({ pads: [{ x: 0, z: 12 }] }))
    driveUntil(s, 'pad', 4)
    expect(s.pads[0].boingAt).toBeGreaterThan(0)
    let top = 0
    driveUntil(s, 'land', 3, (s) => (top = Math.max(top, s.slime.y)))
    const jump = jumpSpeedFor(1) ** 2 / (2 * gravityFor(1))
    expect(top).toBeGreaterThan(PAD_THROW_H - 0.05)
    expect(top).toBeLessThan(PAD_THROW_H + 0.4)
    expect(top / jump).toBeGreaterThan(2.2)
  })
})

describe('flags and babies', () => {
  it('count a flag as passed', () => {
    const s = start(track({ flags: [{ z: 5 }, { z: 9 }] }))
    expect(driveUntil(s, 'flag', 3)).toEqual({ kind: 'flag', index: 0 })
    expect(driveUntil(s, 'flag', 3)).toEqual({ kind: 'flag', index: 1 })
    expect(s.checkpoint).toBe(1)
    expect(s.flags[1].reachedAt).toBeGreaterThan(s.flags[0].reachedAt)
  })

  it('take a baby on touch, and bring those found before from the start', () => {
    const course = track({ babies: [{ x: 0, y: 0.1, z: 8 }, AWAY, { x: 0, y: 0.1, z: 12 }] })
    const s = start(course)
    expect(driveUntil(s, 'baby', 4)).toEqual({ kind: 'baby', index: 0 })
    expect(s.babies[0].takenAt).toBeGreaterThan(0)
    const home = createSim(course, { learned: ALL, babiesHome: [false, false, true], gift: null })
    expect(home.babies[2]).toMatchObject({ takenAt: 0, home: true })
    go(home)
    const events = drive(home, 4)
    expect(events.filter((e) => e.kind === 'baby')).toEqual([{ kind: 'baby', index: 0 }])
  })
})

describe('the finish', () => {
  it('gives the key under the arch, measures the slime at the pole, and hops it onto the trampoline', () => {
    const s = sized({ finishZ: 30 }, 2.3)
    driveUntil(s, 'key', 8)
    expect(s.phase).toBe('finish')
    expect(s.finish.keyAt).toBeGreaterThan(0)
    const measure = driveUntil(s, 'measure', 4, steer(1))
    expect(measure).toEqual({ kind: 'measure', animal: animalFor(s.slime.size) })
    expect(s.slime.x).toBeCloseTo(POLE_X - s.slime.r - 0.25, 1)
    expect(s.slime.z).toBeCloseTo(30 + POLE_DZ, 1)
    const measuredAt = s.finish.measureAt
    driveUntil(s, 'jump', 4)
    expect(s.time - measuredAt).toBeGreaterThan(2.2)
    driveUntil(s, 'trampoline', 3)
    expect(s.phase).toBe('tower')
    expect(s.tower.launchAt).toBeGreaterThan(measuredAt)
    expect(s.slime.z).toBe(30 + TRAMPOLINE_DZ)
    expect(progress(s)).toBe(1)
  })
})

describe('the tower', () => {
  const towering = (circles: Course['circles']) => {
    const s = start(track({ circles }))
    startTower(s)
    s.events.length = 0
    return s
  }

  it('rises at a steady speed after the springy launch, steering within the shaft', () => {
    const s = towering([{ n: 1, x: 4.5, y: 30 }])
    drive(s, 2.5, steer(1))
    expect(s.slime.vy).toBeCloseTo(RISE_V, 0)
    expect(s.slime.x).toBeCloseTo(TOWER_HALF - s.slime.r, 6)
  })

  it('pops a circle passed without touching into its stars', () => {
    const s = towering([{ n: 5, x: 3, y: 6 }])
    const pop = driveUntil(s, 'pop', 5, steer(-1))
    expect(pop).toEqual({ kind: 'pop', n: 5 })
    expect(s.stars).toBe(5)
    expect(s.tower.circles[0].poppedAt).toBeGreaterThan(0)
  })

  it('drops a slime that touches a circle back to the trampoline, keeping the stars, with every circle back', () => {
    const s = towering([
      { n: 1, x: 3.5, y: 6 },
      { n: 1, x: 0, y: 12 },
    ])
    driveUntil(s, 'bonk', 8)
    expect(s.stars).toBe(1)
    expect(s.phase).toBe('fall')
    expect(s.tower.hits).toBe(1)
    const at = s.tower.bonkAt
    driveUntil(s, 'trampoline', 2)
    expect(s.time - at).toBeCloseTo(1.2, 1)
    expect(s.phase).toBe('tower')
    expect(s.tower.circles.every((c) => c.poppedAt < 0)).toBe(true)
    expect(s.stars).toBe(1)
  })

  it('shrinks and slows the circles after three bonks', () => {
    const s = towering([{ n: 1, x: 0, y: 6 }])
    for (let i = 0; i < EASY_AFTER; i++) driveUntil(s, 'bonk', 6)
    expect(s.tower.easy).toBe(true)
    expect(s.tower.circles[0].r).toBeCloseTo(CIRCLE_R * 0.75, 9)
    const clock = s.doing.towerClock
    const t = s.time
    drive(s, 0.5)
    expect(s.doing.towerClock - clock).toBeCloseTo((s.time - t) / 2, 6)
  })

  it('has a giant circle whose hole the biggest slime fits through', () => {
    expect(GIANT_HOLE).toBeGreaterThan(R0 * MAX_SIZE)
  })

  it('funnels the slime through the giant circle onto the top, where the key opens the box', () => {
    const s = towering([{ n: 100, x: 3.5, y: 6 }])
    driveUntil(s, 'funnel', 8, steer(-1))
    const funnelX = s.slime.x
    driveUntil(s, 'top', 4, steer(-1))
    expect(Math.abs(funnelX)).toBeGreaterThan(Math.abs(s.slime.x))
    expect(s.phase).toBe('top')
    expect(s.slime.x).toBe(0)
    expect(s.slime.y).toBe(s.tower.topY)
    const topAt = s.finish.topAt
    driveUntil(s, 'unlock', 2)
    expect(s.finish.unlockAt - topAt).toBeCloseTo(0.8, 1)
    driveUntil(s, 'open', 2)
    expect(s.finish.openAt - topAt).toBeCloseTo(1.6, 1)
    const gift = driveUntil(s, 'gift', 2)
    expect(gift).toEqual({ kind: 'gift', item: 'cap' })
    expect(s.finish.giftAt - topAt).toBeCloseTo(2.4, 1)
    driveUntil(s, 'done', 2)
    expect(s.phase).toBe('done')
    expect(s.phaseAt - topAt).toBeCloseTo(4, 1)
  })
})

describe('lessons', () => {
  const frame = track({ frames: [{ z: 30, x0: -TRACK_HALF, x1: TRACK_HALF }, { z: 60, x0: -TRACK_HALF, x1: TRACK_HALF }] })

  it('slow time when a jump would clear a new frame; the jump answers and clears it', () => {
    const s = start(frame, [])
    const teach = driveUntil(s, 'teach', 8)
    expect(teach).toEqual({ kind: 'teach', action: 'jump' })
    expect(s.teach).toMatchObject({ kind: 'frame', action: 'jump' })
    const t = s.time
    drive(s, 0.5)
    expect(s.timeScale).toBeLessThan(TEACH_SCALE + 0.05)
    expect(s.time - t).toBeLessThan(0.5 * 0.5)
    pressJump(s)
    expect(s.events).toContainEqual({ kind: 'learned', what: 'frame' })
    expect(s.learned).toContain('frame')
    expect(s.teach).toBeNull()
    const events = driveWhile(s, (s) => s.slime.z < 34, 4)
    expect(kinds(events)).not.toContain('climb')
    expect(s.timeScale).toBe(1)
  })

  it('wait with a press that comes the moment the lesson shows', () => {
    const s = start(frame, [])
    driveUntil(s, 'teach', 8)
    pressJump(s)
    const events = driveWhile(s, (s) => s.slime.z < 34, 4)
    expect(kinds(events)).toContain('jump')
    expect(kinds(events)).not.toContain('climb')
  })

  it('go by unanswered when the slime climbs over, and come again next time', () => {
    const s = start(frame, [])
    const events = driveWhile(s, (s) => s.slime.z < 64, 30)
    expect(kinds(events).filter((k) => k === 'teach')).toHaveLength(2)
    expect(kinds(events)).not.toContain('learned')
    expect(s.learned).toEqual([])
  })

  it('teach a hole with a jump', () => {
    const s = start(track({ holes: [{ x: 0, z: 30, r: 1.5 }] }), [])
    driveUntil(s, 'teach', 8)
    expect(s.teach).toMatchObject({ kind: 'hole', action: 'jump' })
    drive(s, 0.3)
    pressJump(s)
    const events = driveWhile(s, (s) => s.slime.z < 34, 4)
    expect(kinds(events)).not.toContain('splash')
    expect(s.learned).toEqual(['hole'])
  })

  it('teach a spinner with hiding, when a paddle is about to come', () => {
    const s = start(track({ spinners: [{ x: -4.6, z: 16, reach: 7.9, arms: 2, period: 2, phase: 0, dir: -1 }] }), [])
    driveUntil(s, 'teach', 8)
    expect(s.teach).toMatchObject({ kind: 'spinner', action: 'hide' })
    setHide(s, true)
    expect(s.learned).toEqual(['spinner'])
    const events = drive(s, 0.8)
    expect(kinds(events)).not.toContain('hit')
  })

  it('teach a gate with hiding, a little before it', () => {
    const s = start(track({ gates: [{ z: 20, x0: -TRACK_HALF, x1: TRACK_HALF }] }), [])
    driveUntil(s, 'teach', 8)
    expect(s.teach).toMatchObject({ kind: 'gate', action: 'hide' })
    expect(20 - 0.4 - (s.slime.z + s.slime.r)).toBeLessThan(2.6)
    setHide(s, true)
    setHide(s, false)
    expect(kinds(driveWhile(s, (s) => s.slime.z < 23, 4))).not.toContain('bump')
    expect(s.learned).toEqual(['gate'])
  })

  it('teach hard wind by steering out of the lane to the free side', () => {
    const s = start(track({ fans: [{ x: -1.6, z: 30, width: 3.2, reach: 7, phase: 0 }] }), [])
    s.slime.x = -1.6
    driveUntil(s, 'teach', 8)
    expect(s.teach).toMatchObject({ kind: 'fan', action: 'right' })
    setSteer(s, 1)
    expect(s.learned).toEqual(['fan'])
    expect(s.teach).toBeNull()
  })

  it('never come for a kind already learned', () => {
    const s = start(
      track({
        frames: [{ z: 20, x0: -TRACK_HALF, x1: TRACK_HALF }],
        holes: [{ x: 0, z: 40, r: 1.5 }],
        gates: [{ z: 60, x0: -TRACK_HALF, x1: TRACK_HALF }],
        spinners: [{ x: -4.6, z: 80, reach: 7.9, arms: 2, period: 2, phase: 0, dir: -1 }],
        fans: [{ x: 0, z: 100, width: 6, reach: 7, phase: 0 }],
      }),
    )
    expect(kinds(drive(s, 40))).not.toContain('teach')
  })
})

describe('getting easier', () => {
  it('floats a lily pad into a hole after three falls, and then the hole holds the slime', () => {
    const s = start(track({ holes: [{ x: 0, z: 20, r: 1.5 }] }))
    const events = driveWhile(s, (s) => s.slime.z < 24 || s.phase !== 'run', 40)
    expect(kinds(events).filter((k) => k === 'splash')).toHaveLength(EASY_AFTER)
    expect(events).toContainEqual({ kind: 'easy', what: 'hole' })
    expect(s.holes[0].raftAt).toBeGreaterThan(0)
    expect(groundAt(s.course, 0, 20)).toBe(false)
  })
})

describe('the URL switches', () => {
  const course = track({ balls: SPARE, flags: [{ z: 10 }, { z: 30 }], holes: [{ x: 0, z: 50, r: 1.5 }] })

  it('start the run further on, with the flags before it passed', () => {
    const s = start(course)
    startAt(s, 20)
    expect(s.slime).toMatchObject({ x: 0, y: 0, z: 20, grounded: true })
    expect(s.checkpoint).toBe(0)
    expect(s.flags[0].reachedAt).toBeGreaterThanOrEqual(0)
    expect(s.flags[1].reachedAt).toBe(-1)
    expect(() => startAt(s, 50)).toThrow(/no track/)
  })

  it('make the slime any size, keeping every ball counted', () => {
    const s = start(course)
    setBalls(s, 15)
    expect(s.slime.balls).toBe(15)
    expect(s.slime.size).toBeCloseTo(2, 9)
    expect(s.balls.filter((b) => b.takenAt < 0)).toHaveLength(15)
  })

  it('start on the trampoline with the key, or on the top with the box about to open', () => {
    const s = start(course)
    startTower(s)
    expect(s.phase).toBe('tower')
    expect(s.finish.keyAt).toBeGreaterThanOrEqual(0)
    const top = start(course)
    startTop(top)
    expect(top.phase).toBe('top')
    expect(top.slime.y).toBe(top.tower.topY)
    driveUntil(top, 'done', 5)
  })
})

describe('for the HUD and the sounds', () => {
  it('tells how far along the course the slime is', () => {
    const s = start(track({ finishZ: 40 }))
    expect(progress(s)).toBe(0)
    driveWhile(s, (s) => s.slime.z < 20, 6)
    expect(progress(s)).toBeCloseTo(0.5, 1)
  })

  it('hears no wind far from the fans', () => {
    const s = start(track({ fans: [{ x: 0, z: 200, width: 6, reach: 7, phase: 0 }] }))
    expect(windLoud(s)).toBe(0)
  })
})
