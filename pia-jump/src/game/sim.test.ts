/**
 * Pia Jump's rules, one per test, on small rooms drawn as ASCII maps and stepped with
 * `step`. Jump heights and distances are compared with the envelope the plan was tuned on
 * (a reference stepper of the same rules at the same 1/120 s step): a miss of more than
 * 0.08 tiles means a rule differs, so the fix is in the sim, not in the tolerance.
 */
import { describe, expect, it } from 'vitest'

import {
  ACCEL,
  BALL_FOR,
  BEE_RANGE,
  BOSS_BOX,
  BOSS_DIZZY,
  BOSS_PUSH,
  BUBBLE_EVERY,
  BUBBLES_MAX,
  COYOTE,
  DIZZY_FOR,
  FERRY_WAIT,
  FREEZE_FOR,
  FRICTION,
  HELP_AFTER,
  JUMP_BUFFER,
  POLE_STARS,
  RESCUE_FOR,
  RISE_FOR,
  ROWS,
  RUN,
  RUN_AFTER,
  SAFE_FOR,
  SAFE_MARGIN,
  SHELL_BOX,
  SHELL_STARS,
  SHELL_WAKE,
  SNAIL_BOX,
  SPRING_TOP,
  STARS_BOX_HITS,
  STEP,
  TILE,
  TRAPPED_FOR,
  WAKE_DIST,
  WALK,
  YAWN_FOR,
  ticks,
  type EventKind,
  type Form,
  type ItemKind,
  type LiftDef,
  type Room,
  type Sim,
  type SimEvent,
} from './model'
import { parseRoom } from './room'
import {
  BED_GAP,
  BUNNY_BOX,
  BUNNY_FOR,
  GROW_NUDGE,
  SKID_FROM,
  cloneSim,
  createSim,
  heroBox,
  pressBubble,
  pressJump,
  releaseBubble,
  releaseJump,
  setMove,
  step,
} from './sim'

// ---------------------------------------------------------------------------------------
// Rooms and hands on the controls.

/** Every event kind (a Record, so the compiler keeps the list whole). The last test checks that each one was seen. */
const KINDS: Record<EventKind, true> = {
  jump: true, land: true, skid: true, bonk: true, star: true, giftStar: true, bump: true, break: true, sprout: true, grow: true, wand: true,
  ball: true, ballEnd: true, shrink: true, hurt: true, stomp: true, kick: true, shellPop: true, knock: true, wake: true, blow: true,
  trap: true, pop: true, spring: true, fall: true, rescued: true, pole: true, kitten: true, bossHit: true, bossDown: true, gate: true, done: true,
}
const seen = new Set<EventKind>()

type Mark = readonly [row: number, col: number, text: string]

/**
 * A flat room `cols` wide: the floor on rows 13 and 14 (her feet at y 13), her start at
 * column 2, the pole 6 columns from the right end and the bed 3. Each mark writes its text
 * over the map from (row, col) rightward.
 */
function flatRoom(cols: number, marks: readonly Mark[] = [], lifts: readonly LiftDef[] = []): Room {
  const rows = Array.from({ length: ROWS }, (_, r) => Array.from({ length: cols }, (): string => (r >= 13 ? '#' : '.')))
  const write = (r: number, c: number, text: string) => [...text].forEach((ch, i) => (rows[r]![c + i] = ch))
  write(12, 2, '@')
  write(12, cols - 6, '!')
  write(12, cols - 3, 'h')
  for (const [r, c, text] of marks) write(r, c, text)
  return parseRoom({ id: 'garden', kitten: 'sunny', map: rows.map((r) => r.join('')), lifts })
}

/** A room from the bottom rows of a map; rows of air on top make it ROWS tall. */
function mapRoom(lines: readonly string[], lifts: readonly LiftDef[] = []): Room {
  const air = Array.from({ length: ROWS - lines.length }, () => '.'.repeat(lines[0]!.length))
  return parseRoom({ id: 'garden', kitten: 'sunny', map: [...air, ...lines], lifts })
}

/** Steps n times, calling `before` ahead of each step (the test's hands on the controls). Returns the events of those steps, stamped with the tick each step ran at. */
function run(s: Sim, room: Room, n: number, before: (s: Sim, k: number) => void = () => {}): (SimEvent & { tick: number })[] {
  const events: (SimEvent & { tick: number })[] = []
  for (let k = 0; k < n; k++) {
    before(s, k)
    step(s, room)
    for (const e of s.events) {
      events.push({ ...e, tick: s.tick - 1 })
      seen.add(e.kind)
    }
    s.events.length = 0
  }
  return events
}

/** Steps until `done` holds after a step (at most `limit` steps, or it throws). Returns every event on the way. */
function runUntil(s: Sim, room: Room, done: (s: Sim, events: readonly SimEvent[]) => boolean, before: (s: Sim, k: number) => void = () => {}, limit = 5000) {
  const events: (SimEvent & { tick: number })[] = []
  for (let k = 0; k < limit; k++) {
    const more = run(s, room, 1, (s) => before(s, k))
    events.push(...more)
    if (done(s, more)) return events
  }
  throw new Error(`still waiting after ${limit} steps`)
}

const kinds = (events: readonly SimEvent[]) => events.map((e) => e.kind)
const count = (events: readonly SimEvent[], kind: EventKind) => events.filter((e) => e.kind === kind).length
const has = (kind: EventKind) => (_: Sim, events: readonly SimEvent[]) => events.some((e) => e.kind === kind)

/** Puts her in the air at (x, y), still, with no ground under her to jump from. */
function hang(s: Sim, x: number, y: number) {
  const h = s.hero
  h.x = h.px = x
  h.y = h.py = y
  h.vx = h.vy = 0
  h.grounded = false
  h.groundAt = -1
  h.lift = -1
}

/** Puts her standing on the floor at x. */
function stand(s: Sim, x: number) {
  hang(s, x, 13)
  s.hero.grounded = true
}

/** Gives her a form, with its box. */
function setForm(s: Sim, form: Form) {
  s.hero.form = form
  ;[s.hero.w, s.hero.h] = heroBox(form)
}

/** An item already out of its box, standing at (x, y). */
function addItem(s: Sim, kind: ItemKind, x: number, y: number, facing: -1 | 1) {
  s.items.push({ x, y, px: x, py: y, vx: 0, vy: 0, w: 0.7, h: 0.7, kind, facing, grounded: true, bornAt: -1000, alive: true })
  return s.items[s.items.length - 1]!
}

/** Expects a measured number within `tol` of the plan's. */
function near(actual: number, expected: number, tol: number, what: string) {
  expect(actual, `${what}: ${actual.toFixed(3)}, wanted ${expected} +- ${tol}`).toBeGreaterThanOrEqual(expected - tol)
  expect(actual, `${what}: ${actual.toFixed(3)}, wanted ${expected} +- ${tol}`).toBeLessThanOrEqual(expected + tol)
}

// ---------------------------------------------------------------------------------------

/** Runs a flight from where she is until she stands again: how high her feet rose and how far her centre went. */
function flight(s: Sim, room: Room, before: (s: Sim, k: number) => void) {
  const x0 = s.hero.x
  const y0 = s.hero.y
  let top = y0
  for (let k = 0; k < 1000; k++) {
    run(s, room, 1, (s) => before(s, k))
    top = Math.min(top, s.hero.y)
    if (s.hero.grounded) return { apex: y0 - top, reach: s.hero.x - x0 }
  }
  throw new Error('she never came down')
}

/** A jump on a long flat floor: she first gets up to speed (none, WALK or RUN), then holds jump for `hold` steps (0: a press and a release between two steps), holding right all along when `push`. */
function jump(speed: 'stand' | 'walk' | 'run', hold: number, push: boolean) {
  const room = flatRoom(80)
  const s = createSim(room)
  if (speed !== 'stand') run(s, room, ticks(speed === 'walk' ? 0.5 : 2), (s) => setMove(s, 1))
  expect(s.hero.vx).toBe(speed === 'stand' ? 0 : speed === 'walk' ? WALK : RUN)
  return flight(s, room, (s, k) => {
    if (push) setMove(s, 1)
    if (k === 0) pressJump(s)
    if (k === hold) releaseJump(s)
  })
}

/** How high she rises after the launch that `kind` sets off, measured from her feet at the end of the launch step. */
function launchApex(room: Room, s: Sim, kind: EventKind) {
  runUntil(s, room, has(kind))
  const y0 = s.hero.y
  let top = y0
  for (let k = 0; k < ticks(1); k++) {
    run(s, room, 1)
    top = Math.min(top, s.hero.y)
  }
  return { y0, apex: y0 - top }
}

describe('the jump envelope', () => {
  it('a tap hops 2.25, a 0.15 s hold 2.59, a 0.3 s hold 3.33 and a full jump 3.69 standing', () => {
    near(jump('stand', 0, false).apex, 2.25, 0.08, 'tap')
    near(jump('stand', 18, false).apex, 2.59, 0.08, '0.15 s hold')
    near(jump('stand', 36, false).apex, 3.33, 0.08, '0.3 s hold')
    near(jump('stand', Infinity, false).apex, 3.69, 0.08, 'full jump')
  })

  it('a full jump rises 4.38 and carries 4.62 at WALK, 4.75 and 7.25 at RUN; a tap at WALK carries 2.75', () => {
    const walk = jump('walk', Infinity, true)
    near(walk.apex, 4.38, 0.08, 'apex at walk')
    near(walk.reach, 4.62, 0.08, 'reach at walk')
    const run = jump('run', Infinity, true)
    near(run.apex, 4.75, 0.08, 'apex at run')
    near(run.reach, 7.25, 0.08, 'reach at run')
    near(jump('walk', 0, true).reach, 2.75, 0.08, 'tap reach at walk')
  })

  it('from a standstill with the direction pressed at take-off a tap carries 1.87, a 0.3 s hold 2.78, a full hold 3.49', () => {
    near(jump('stand', 0, true).reach, 1.87, 0.08, 'tap')
    near(jump('stand', 36, true).reach, 2.78, 0.08, '0.3 s hold')
    near(jump('stand', Infinity, true).reach, 3.49, 0.08, 'full hold')
  })

  it('a spring launches her 7.26 whether the button is held or not', () => {
    for (const held of [false, true]) {
      const room = flatRoom(30, [[12, 10, '^']])
      const s = createSim(room)
      hang(s, 10.5, 9)
      if (held) pressJump(s)
      const { y0, apex } = launchApex(room, s, 'spring')
      expect(y0).toBe(13 - SPRING_TOP)
      near(apex, 7.26, 0.08, `spring, button ${held ? 'held' : 'free'}`)
      expect(s.springs[0]).toBeGreaterThan(0)
    }
  })

  it('a stomp bounces her 1.97, or 3.69 with the button held', () => {
    for (const held of [false, true]) {
      const room = flatRoom(30, [[12, 10, 'g']])
      const s = createSim(room)
      hang(s, 10.5, 10)
      if (held) pressJump(s)
      near(launchApex(room, s, 'stomp').apex, held ? 3.69 : 1.97, 0.08, `stomp, button ${held ? 'held' : 'free'}`)
    }
  })
})

describe('running', () => {
  it('reaches WALK in about 0.28 s', () => {
    const room = flatRoom(40)
    const s = createSim(room)
    let k = 0
    while (s.hero.vx < WALK) {
      run(s, room, 1, (s) => setMove(s, 1))
      k += 1
    }
    expect(Math.abs(k * STEP - WALK / ACCEL)).toBeLessThanOrEqual(STEP)
    expect(Math.abs(k * STEP - 0.28)).toBeLessThan(0.01)
  })

  it('runs faster than WALK only after RUN_AFTER of pushing one way, and tops out at RUN', () => {
    const room = flatRoom(60)
    const s = createSim(room)
    run(s, room, ticks(RUN_AFTER), (s) => setMove(s, 1))
    expect(s.hero.vx).toBe(WALK)
    run(s, room, 1, (s) => setMove(s, 1))
    expect(s.hero.vx).toBeGreaterThan(WALK)
    run(s, room, ticks(1), (s) => setMove(s, 1))
    expect(s.hero.vx).toBe(RUN)
    // Letting go for a moment starts the count again.
    run(s, room, 30, (s) => setMove(s, 0))
    run(s, room, ticks(0.5), (s) => setMove(s, 1))
    expect(s.hero.pushTicks).toBe(ticks(0.5))
  })

  it('slides about WALK squared over twice FRICTION when she lets go', () => {
    const room = flatRoom(40)
    const s = createSim(room)
    run(s, room, ticks(0.5), (s) => setMove(s, 1))
    const x0 = s.hero.x
    runUntil(s, room, (s) => s.hero.vx === 0, (s) => setMove(s, 0))
    near(s.hero.x - x0, (WALK * WALK) / (2 * FRICTION), 0.03, 'slide')
  })

  it('skids when she turns, facing the new way at once, then runs off the other way', () => {
    const room = flatRoom(40)
    const s = createSim(room)
    stand(s, 10)
    run(s, room, ticks(0.5), (s) => setMove(s, 1))
    const events = run(s, room, 1, (s) => setMove(s, -1))
    expect(kinds(events)).toEqual(['skid'])
    expect(s.hero.facing).toBe(-1)
    expect(s.hero.skidding).toBe(true)
    const more = runUntil(s, room, (s) => s.hero.vx <= 0, (s) => setMove(s, -1))
    expect(count(more, 'skid')).toBe(0)
    expect(s.hero.skidding).toBe(false)
    run(s, room, ticks(0.5), (s) => setMove(s, -1))
    expect(s.hero.vx).toBe(-WALK)
    expect(SKID_FROM).toBeLessThan(WALK)
  })
})

describe('jumping and landing', () => {
  /** A platform (top at y 10) she walks off to the right, onto the floor 3 below. */
  const LEDGE = mapRoom([
    '..@...........................',
    '##########....................',
    '##########....................',
    '##########.............!..h...',
    '##############################',
    '##############################',
  ])

  /** She walks off the platform; a tap at `pressAt` ticks after the last tick she stood on it. Returns whether she jumped right then (later, the press would only fire on landing, from the buffer). */
  function coyote(pressAt: number) {
    const s = createSim(LEDGE)
    stand(s, 9.4)
    s.hero.y = s.hero.py = 10
    runUntil(s, LEDGE, (s) => !s.hero.grounded, (s) => setMove(s, 1))
    const left = s.hero.groundAt
    const events = run(s, LEDGE, ticks(0.2), (s) => {
      if (s.tick === left + pressAt) {
        pressJump(s)
        releaseJump(s)
      }
    })
    return events.some((e) => e.kind === 'jump' && e.tick === left + pressAt)
  }

  it('jumps COYOTE after she walked off a ledge, and not one tick later', () => {
    expect(coyote(ticks(COYOTE))).toBe(true)
    expect(coyote(ticks(COYOTE) + 1)).toBe(false)
  })

  /** She drops onto the floor; a tap `early` ticks before the first step she stands. Returns whether she jumped then. */
  function buffer(early: number) {
    const room = flatRoom(30)
    const probe = createSim(room)
    hang(probe, 10.5, 9)
    runUntil(probe, room, (s) => s.hero.grounded)
    const landed = probe.tick
    const s = createSim(room)
    hang(s, 10.5, 9)
    const events = run(s, room, ticks(1), (s) => {
      if (s.tick === landed - early) {
        pressJump(s)
        releaseJump(s)
      }
    })
    return events.some((e) => e.kind === 'jump' && e.y === 13)
  }

  it('jumps on landing for a press JUMP_BUFFER before it, and not for one a tick earlier', () => {
    expect(buffer(ticks(JUMP_BUFFER))).toBe(true)
    expect(buffer(ticks(JUMP_BUFFER) + 1)).toBe(false)
  })

  it('hops on a press and a release between two steps', () => {
    const room = flatRoom(30)
    const s = createSim(room)
    pressJump(s)
    releaseJump(s)
    const events = run(s, room, 1)
    expect(kinds(events)).toEqual(['jump'])
    expect(s.hero.vy).toBeLessThan(0)
  })

  it('jumps once for a button held through the landing', () => {
    const room = flatRoom(30)
    const s = createSim(room)
    pressJump(s)
    const events = run(s, room, ticks(3))
    expect(count(events, 'jump')).toBe(1)
    expect(count(events, 'land')).toBe(1)
    expect(s.hero.grounded).toBe(true)
  })

  it('lands from a hop with the land event, but steps down one tile without it', () => {
    const s = createSim(LEDGE)
    stand(s, 9.4)
    s.hero.y = s.hero.py = 10
    const events = runUntil(s, LEDGE, (s) => s.hero.grounded && s.hero.y === 13, (s) => setMove(s, 1))
    const land = events.find((e) => e.kind === 'land')!
    expect(land.n).toBeGreaterThan(1)
    expect(s.hero.landedAt).toBe(land.tick)
    const step = flatRoom(30, [[12, 6, '####']])
    const t = createSim(step)
    stand(t, 7.5)
    t.hero.y = t.hero.py = 12
    const down = runUntil(t, step, (s) => s.hero.grounded && s.hero.y === 13, (s) => setMove(s, 1))
    expect(count(down, 'land')).toBe(0)
  })
})

describe('her head and her toes', () => {
  /** A full jump under a tile at (10, 9), her box overlapping its column by `overlap` from the left. */
  function corner(form: Form, overlap: number) {
    const room = flatRoom(30, [[9, 10, '#']])
    const s = createSim(room)
    setForm(s, form)
    stand(s, 10 + overlap - s.hero.w / 2)
    let head = Infinity
    const events = runUntil(s, room, (s) => s.hero.grounded && s.hero.vy === 0 && s.tick > 10, (s, k) => {
      if (k === 0) pressJump(s)
      head = Math.min(head, s.hero.y - s.hero.h)
    })
    return { s, events, head }
  }

  it('slides past a corner clipped by 0.2 and bonks on one clipped by 0.3 (small); 0.25 and 0.35 when big', () => {
    for (const [form, pass, bonk] of [['small', 0.2, 0.3], ['big', 0.25, 0.35]] as const) {
      const passed = corner(form, pass)
      expect(passed.head, `${form} rises past the tile`).toBeLessThan(10)
      expect(count(passed.events, 'bonk')).toBe(0)
      expect(passed.s.hero.bonkedAt).toBe(-1)
      const bonked = corner(form, bonk)
      expect(bonked.head, `${form} stops under the tile`).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(count(bonked.events, 'bonk')).toBe(1)
      expect(bonked.s.hero.bonkedAt).toBeGreaterThan(0)
    }
  })

  it('knocks the block over her centre column when her head hits two', () => {
    const room = flatRoom(30, [[9, 10, '??']])
    const s = createSim(room)
    stand(s, 10.9)
    const events = run(s, room, ticks(0.6), (s, k) => k === 0 && pressJump(s))
    expect(count(events, 'giftStar')).toBe(1)
    expect(s.blocks.map((b) => b.state)).toEqual(['empty', 'full'])
  })

  it('is lifted onto a ledge she missed by 0.3, and stopped by one she missed by 0.4', () => {
    for (const miss of [0.3, 0.4]) {
      const room = flatRoom(30, [[11, 10, '###'], [12, 10, '###']])
      const s = createSim(room)
      hang(s, 9.64, 11 + miss)
      s.hero.vx = 5
      s.hero.vy = 2
      run(s, room, 1, (s) => setMove(s, 1))
      if (miss === 0.3) {
        expect(s.hero.y).toBe(11)
        expect(s.hero.grounded).toBe(true)
        expect(s.hero.x).toBeGreaterThan(10 - s.hero.w / 2)
      } else {
        expect(s.hero.x).toBe(10 - s.hero.w / 2)
        expect(s.hero.vx).toBe(0)
        expect(s.hero.grounded).toBe(false)
      }
    }
  })

  it('runs ten seconds over ground, ABC blocks and columns at one height without a snag', () => {
    const floor = '##ABC||#DE||##FGH||#'.repeat(5)
    const room = flatRoom(100, [[13, 0, floor]])
    const s = createSim(room)
    let atRun = false
    run(s, room, ticks(10), (s, k) => {
      setMove(s, 1)
      if (k === 0) return
      expect(s.hero.y).toBe(13)
      expect(s.hero.grounded).toBe(true)
      if (atRun) expect(s.hero.vx).toBe(RUN)
      atRun ||= s.hero.vx === RUN
    })
    expect(atRun).toBe(true)
    expect(s.hero.x).toBeGreaterThan(60)
  })

  it('jumps up through a shelf and stands on it', () => {
    const room = flatRoom(30, [[10, 8, '=====']])
    const s = createSim(room)
    stand(s, 10.5)
    const events = runUntil(s, room, (s) => s.hero.grounded && s.tick > 10, (s, k) => k === 0 && pressJump(s))
    expect(count(events, 'bonk')).toBe(0)
    expect(s.hero.y).toBe(10)
    run(s, room, ticks(1))
    expect(s.hero.y).toBe(10)
    expect(s.hero.grounded).toBe(true)
  })
})

describe('lifts', () => {
  /** Floor at both ends, open water between columns 7 and 21. */
  const WATER = [
    '..@.........................!..h',
    '#######..............###########',
    '#######..............###########',
  ]

  it('a ferry waits for her, carries her across, and goes home FERRY_WAIT after she steps off', () => {
    const room = mapRoom(WATER, [{ kind: 'ferry', col: 7, row: 13, width: 3, dx: 11, dy: 0 }])
    const s = createSim(room)
    run(s, room, ticks(1))
    expect(s.lifts[0]!.mode).toBe('wait')
    hang(s, 8.5, 12.9)
    runUntil(s, room, (s) => s.hero.grounded)
    expect(s.hero.lift).toBe(0)
    runUntil(s, room, (s) => s.lifts[0]!.mode === 'there')
    expect(s.hero.lift).toBe(0)
    expect(s.hero.x).toBeCloseTo(8.5 + 11, 9)
    expect(s.hero.y).toBe(13)
    run(s, room, ticks(3))
    expect(s.lifts[0]!.mode).toBe('there')
    runUntil(s, room, (s) => s.hero.x > 23, (s) => setMove(s, 1))
    const off = s.tick
    runUntil(s, room, (s) => s.lifts[0]!.mode === 'back')
    expect(s.tick - 1 - off).toBeLessThanOrEqual(ticks(FERRY_WAIT) + 1)
    runUntil(s, room, (s) => s.lifts[0]!.mode === 'wait')
    expect(s.lifts[0]!.x).toBe(8.5)
    expect(s.hero.y).toBe(13)
  })

  it('a loop lift carries her up and down and side to side without dropping her', () => {
    const room = mapRoom(WATER, [{ kind: 'loop', col: 10, row: 12, width: 3, dx: 5, dy: -4, period: 4 }])
    const s = createSim(room)
    const l = s.lifts[0]!
    hang(s, l.x, l.y - 0.1)
    runUntil(s, room, (s) => s.hero.grounded)
    expect(s.hero.lift).toBe(0)
    let lowest = Infinity
    run(s, room, ticks(8), () => {
      expect(s.hero.lift).toBe(0)
      expect(s.hero.y).toBe(l.y)
      lowest = Math.min(lowest, l.y)
    })
    expect(lowest).toBeLessThan(9)
  })
})

describe('blocks from below', () => {
  /** A box at (10, 9) and a jump at it from right under it; `jumps` times, each after she lands. */
  function bump(code: string, form: Form, jumps: number) {
    const room = flatRoom(30, [[9, 10, code]])
    const s = createSim(room)
    setForm(s, form)
    stand(s, 10.5)
    const events = []
    for (let i = 0; i < jumps; i++) {
      events.push(...runUntil(s, room, (s) => s.hero.grounded && s.hero.vy === 0, (s, k) => {
        if (k === 0) pressJump(s)
        if (k === 1) releaseJump(s)
      }))
      run(s, room, 5)
    }
    return { s, events }
  }

  it('a star box gives one star and then only bonks', () => {
    const { s, events } = bump('?', 'small', 2)
    expect(kinds(events).filter((k) => k === 'giftStar' || k === 'bonk')).toEqual(['giftStar', 'bonk'])
    expect(s.stars).toBe(1)
    expect(s.blocks[0]!.state).toBe('empty')
  })

  it('a many-stars box gives a star a bump until STARS_BOX_HITS', () => {
    const { s, events } = bump('$', 'small', STARS_BOX_HITS + 1)
    expect(count(events, 'giftStar')).toBe(STARS_BOX_HITS)
    expect(count(events, 'bonk')).toBe(1)
    expect(s.stars).toBe(STARS_BOX_HITS)
    expect(s.blocks[0]!.state).toBe('empty')
    expect(s.blocks[0]!.bumpedAt).toBeGreaterThan(0)
  })

  it('a power box sprouts a cupcake for small Pia and the wand for big Pia; the ball box the ball', () => {
    for (const [code, form, kind] of [['p', 'small', 'cupcake'], ['p', 'big', 'wand'], ['p', 'bubble', 'wand'], ['r', 'small', 'ball']] as const) {
      const { s, events } = bump(code, form, 1)
      expect(count(events, 'sprout')).toBe(1)
      expect(s.items.map((it) => it.kind)).toEqual([kind])
      expect(s.blocks[0]!.state).toBe('empty')
    }
  })

  it('a cookie block bumps for small Pia and breaks for big Pia, who keeps no upward speed', () => {
    const small = bump('c', 'small', 1)
    expect(count(small.events, 'bump')).toBe(1)
    expect(small.s.blocks[0]!.state).toBe('full')
    const room = flatRoom(30, [[9, 10, 'c']])
    const s = createSim(room)
    setForm(s, 'big')
    stand(s, 10.5)
    const events = runUntil(s, room, has('break'), (s, k) => k === 0 && pressJump(s))
    expect(s.blocks[0]!.state).toBe('broken')
    expect(s.hero.vy).toBe(0)
    expect(count(events, 'bonk')).toBe(0)
    // Gone: the next jump goes right through where it was.
    run(s, room, ticks(1.5))
    let head = Infinity
    run(s, room, ticks(0.6), (s, k) => {
      if (k === 0) pressJump(s)
      head = Math.min(head, s.hero.y - s.hero.h)
    })
    expect(head).toBeLessThan(9)
  })

  it('a bump knocks over an enemy standing on the block', () => {
    const room = flatRoom(30, [[8, 10, 'g'], [9, 10, '?']])
    const s = createSim(room)
    stand(s, 10.5)
    const events = run(s, room, ticks(0.6), (s, k) => k === 0 && pressJump(s))
    expect(count(events, 'knock')).toBe(1)
    expect(s.enemies[0]!.state).toBe('knocked')
    runUntil(s, room, (s) => s.enemies[0]!.state === 'gone')
  })

  it('a gate only bonks', () => {
    const room = flatRoom(30, [[9, 10, 'x']])
    const s = createSim(room)
    stand(s, 10.5)
    const events = run(s, room, ticks(0.6), (s, k) => k === 0 && pressJump(s))
    expect(count(events, 'bonk')).toBe(1)
    expect(s.blocks[0]!.state).toBe('full')
  })
})

describe('items', () => {
  it('rise out of the box for RISE_FOR before she can take them', () => {
    const room = flatRoom(30, [[9, 10, 'p']])
    const s = createSim(room)
    stand(s, 10.5)
    runUntil(s, room, has('sprout'), (s, k) => k === 0 && pressJump(s))
    const it = s.items[0]!
    const events = runUntil(s, room, has('grow'), (s) => {
      // Hold her right on top of the rising cupcake.
      hang(s, it.x, it.y)
    })
    const grow = events.find((e) => e.kind === 'grow')!
    expect(grow.tick - it.bornAt).toBe(ticks(RISE_FOR))
    expect(s.hero.form).toBe('big')
    expect(s.phase).toBe('freeze')
  })

  it('walk off a step, turn at pit edges and walls, and never fall out of the room', () => {
    // A step from column 8 to 15 (top at 12), the floor (top at 13) on both sides of it, a pit from column 20 to 22.
    const room = mapRoom([
      '..@.........................................!..h',
      '........########................................',
      '####################...#########################',
      '####################...#########################',
    ])
    for (const kind of ['cupcake', 'ball'] as const) {
      const s = createSim(room)
      stand(s, 40)
      const it = addItem(s, kind, 12, 12, 1)
      let dropped = false
      let nearest = 0
      let turns = 0
      let facing = it.facing
      run(s, room, ticks(30), () => {
        expect(it.alive).toBe(true)
        expect(it.y).toBeLessThanOrEqual(13)
        // Never over the pit by more than one step's move.
        expect(it.x + it.w / 2).toBeLessThanOrEqual(20 + 0.05)
        dropped ||= it.grounded && it.y === 13
        if (dropped) {
          nearest = Math.max(nearest, it.x + it.w / 2)
          // Back on the low floor, the step is a wall it turns at.
          expect(it.x - it.w / 2).toBeGreaterThanOrEqual(16 - 1e-9)
        }
        if (it.facing !== facing) turns += 1
        facing = it.facing
      })
      expect(dropped, `${kind} walks off the step`).toBe(true)
      expect(nearest, `${kind} goes right up to the pit edge`).toBeGreaterThan(19.9)
      expect(turns, `${kind} turns at the pit and at the step`).toBeGreaterThanOrEqual(4)
    }
  })

  it('a power she already has is a star; the wand makes bubble Pia; the ball starts the power and ends', () => {
    const room = flatRoom(40)
    const s = createSim(room)
    setForm(s, 'big')
    addItem(s, 'cupcake', s.hero.x, 13, 1)
    let events = run(s, room, 2)
    expect(kinds(events)).toContain('giftStar')
    expect(s.stars).toBe(1)
    addItem(s, 'wand', s.hero.x, 13, 1)
    events = run(s, room, 2)
    expect(kinds(events)).toContain('wand')
    expect(s.hero.form).toBe('bubble')
    run(s, room, ticks(FREEZE_FOR) + 1)
    expect(s.phase).toBe('play')
    addItem(s, 'ball', s.hero.x, 13, 1)
    events = run(s, room, 2)
    expect(kinds(events)).toContain('ball')
    const until = s.hero.ballUntil
    expect(until).toBe(events.find((e) => e.kind === 'ball')!.tick + ticks(BALL_FOR))
    events = runUntil(s, room, has('ballEnd'))
    expect(events[events.length - 1]!.tick).toBe(until)
  })

  it('grows beside a wall by stepping GROW_NUDGE away from it', () => {
    const room = flatRoom(30, [[11, 11, '#'], [12, 11, '#']])
    const s = createSim(room)
    stand(s, 11 - 0.35)
    addItem(s, 'cupcake', s.hero.x, 13, 1)
    const events = run(s, room, 1)
    expect(kinds(events)).toContain('grow')
    expect(s.hero.x).toBeCloseTo(11 - 0.35 - GROW_NUDGE, 9)
    expect(s.hero.x + s.hero.w / 2).toBeLessThanOrEqual(11)
  })

  it('a cupcake under a low ceiling is banked and grows her the first step there is room', () => {
    const room = flatRoom(30, [[11, 5, '#####']])
    const s = createSim(room)
    stand(s, 7.5)
    addItem(s, 'cupcake', 7.5, 13, 1)
    run(s, room, 2)
    expect(s.items.length).toBe(0)
    expect(s.hero.banked).toBe(true)
    expect(s.hero.form).toBe('small')
    const events = runUntil(s, room, has('grow'), (s) => setMove(s, 1))
    expect(s.hero.form).toBe('big')
    expect(s.hero.banked).toBe(false)
    expect(s.hero.x - s.hero.w / 2).toBeGreaterThanOrEqual(10 - 0.05 - 1e-9)
    expect(count(events, 'grow')).toBe(1)
  })
})

describe('enemies', () => {
  it('sleep until she is within WAKE_DIST, yawn for YAWN_FOR, then walk at her', () => {
    const room = flatRoom(60, [[12, 40, 'g']])
    const s = createSim(room)
    const g = s.enemies[0]!
    stand(s, 40.5 - WAKE_DIST - 0.01)
    expect(count(run(s, room, 30), 'wake')).toBe(0)
    expect(g.state).toBe('asleep')
    stand(s, 40.5 - WAKE_DIST + 0.01)
    const woke = run(s, room, 1)
    expect(kinds(woke)).toEqual(['wake'])
    expect(g.state).toBe('yawn')
    run(s, room, ticks(YAWN_FOR) - 1)
    expect(g.state).toBe('yawn')
    expect(g.x).toBe(40.5)
    run(s, room, 1)
    expect(g.state).toBe('walk')
    expect(g.facing).toBe(-1)
    run(s, room, ticks(1))
    expect(g.x).toBeLessThan(40.5 - 1)
  })

  /** A platform from column 0 to 9 (top at y 10), the enemy at column 6 on it, Pia on the floor to the right. */
  function onPlatform(code: string) {
    const room = mapRoom([
      `..@...${code}.........................`,
      '##########......................',
      '##########......................',
      '##########...............!..h...',
      '################################',
      '################################',
    ])
    const s = createSim(room)
    stand(s, 16)
    return { room, s, e: s.enemies[0]! }
  }

  it('a grumble walks off a ledge; a snail turns at it', () => {
    const grumble = onPlatform('g')
    runUntil(grumble.s, grumble.room, () => grumble.e.y === 13 && grumble.e.grounded)
    expect(grumble.e.state).toBe('walk')
    const snail = onPlatform('s')
    let turned = false
    run(snail.s, snail.room, ticks(12), () => {
      expect(snail.e.y).toBe(10)
      turned ||= snail.e.state === 'walk' && snail.e.facing === -1
    })
    expect(turned).toBe(true)
  })

  it('a bee hovers in its band and keeps its x', () => {
    const room = flatRoom(30, [[5, 10, 'b']])
    const s = createSim(room)
    const b = s.enemies[0]!
    let low = Infinity
    let high = -Infinity
    run(s, room, ticks(10), () => {
      expect(b.x).toBe(10.5)
      low = Math.min(low, b.y)
      high = Math.max(high, b.y)
    })
    expect(low).toBeGreaterThanOrEqual(b.baseY - BEE_RANGE - 1e-9)
    expect(high).toBeLessThanOrEqual(b.baseY + BEE_RANGE + 1e-9)
    expect(high - low).toBeGreaterThan(2 * BEE_RANGE - 0.01)
  })
})

describe('stomps and shells', () => {
  /** Drops her onto the enemy that stands at column 10, set to `state`, and steps until the stomp. */
  function stompOn(code: string, setup: (s: Sim) => void) {
    const room = flatRoom(40, [[12, 10, code]])
    const s = createSim(room)
    setup(s)
    const e = s.enemies[0]!
    hang(s, e.x, e.y - e.h - 0.3)
    const events = runUntil(s, room, has('stomp'))
    return { room, s, e, events }
  }

  it('a grumble poofs, a snail hides in its shell, a bee is knocked down', () => {
    const grumble = stompOn('g', () => {})
    expect(grumble.e.state).toBe('poof')
    runUntil(grumble.s, grumble.room, () => grumble.e.state === 'gone')
    const snail = stompOn('s', () => {})
    expect(snail.e.state).toBe('shell')
    expect([snail.e.w, snail.e.h]).toEqual([...SHELL_BOX])
    expect(snail.e.y).toBe(13)
    const bee = stompOn('b', () => {})
    expect(bee.e.state).toBe('knocked')
    expect(count(bee.events, 'knock')).toBe(1)
  })

  it('a resting shell is kicked by a stomp, and a sliding one stops', () => {
    const shell = (state: 'shell' | 'slide') => (s: Sim) => {
      const e = s.enemies[0]!
      e.state = state
      e.stateAt = -100
      ;[e.w, e.h] = SHELL_BOX
      e.facing = -1
    }
    const kicked = stompOn('s', shell('shell'))
    expect(kicked.e.state).toBe('slide')
    expect(count(kicked.events, 'kick')).toBe(1)
    const stopped = stompOn('s', shell('slide'))
    expect(stopped.e.state).toBe('shell')
    expect(stopped.e.vx).toBe(0)
  })

  it('stomps before she lands pay 1, 2, 3 stars', () => {
    const room = flatRoom(50, [[12, 10, 'g'], [12, 20, 'g'], [12, 30, 'g']])
    const s = createSim(room)
    const paid = []
    for (const e of s.enemies) {
      hang(s, e.x, e.y - e.h - 0.3)
      s.hero.vy = 2
      paid.push(runUntil(s, room, has('stomp')).find((e) => e.kind === 'stomp')!.n)
    }
    expect(paid).toEqual([1, 2, 3])
    expect(s.stars).toBe(6)
    runUntil(s, room, (s) => s.hero.grounded)
    expect(s.hero.chain).toBe(0)
  })

  it('a touch kicks a resting shell; it knocks over a line of enemies, never hurts her and pops at a wall', () => {
    const room = flatRoom(50, [[12, 8, 's'], [12, 14, 'g'], [12, 16, 'g'], [12, 18, 's'], [11, 30, '|'], [12, 30, '|']])
    const s = createSim(room)
    const shell = s.enemies[0]!
    shell.state = 'shell'
    shell.stateAt = -100
    ;[shell.w, shell.h] = SHELL_BOX
    stand(s, 6)
    const kick = runUntil(s, room, has('kick'), (s) => setMove(s, 1))
    expect(shell.state).toBe('slide')
    expect(shell.facing).toBe(1)
    expect(kick.find((e) => e.kind === 'kick')).toBeDefined()
    const events = runUntil(s, room, has('shellPop'))
    expect(count(events, 'knock')).toBe(3)
    expect(s.enemies.slice(1).every((e) => e.state === 'knocked' || e.state === 'gone')).toBe(true)
    expect(shell.state).toBe('gone')
    expect(events.find((e) => e.kind === 'shellPop')!.n).toBe(SHELL_STARS)
    expect(s.stars).toBe(SHELL_STARS)
    expect(count(events, 'hurt') + count(events, 'shrink')).toBe(0)
  })

  it('a sliding shell passes under her without hurting her', () => {
    const room = flatRoom(50, [[12, 20, 's']])
    const s = createSim(room)
    const shell = s.enemies[0]!
    shell.state = 'slide'
    shell.stateAt = -100
    shell.facing = -1
    ;[shell.w, shell.h] = SHELL_BOX
    stand(s, 10)
    const events = runUntil(s, room, () => shell.x < 5)
    expect(count(events, 'hurt') + count(events, 'shrink')).toBe(0)
    expect(s.hero.dizzyUntil).toBe(-1)
  })

  it('a resting shell walks again as a snail at SHELL_WAKE', () => {
    const { room, s, e } = stompOn('s', () => {})
    const at = e.stateAt
    stand(s, 30)
    runUntil(s, room, () => e.state === 'walk')
    expect(s.tick - 1 - at).toBe(ticks(SHELL_WAKE))
    expect([e.w, e.h]).toEqual([...SNAIL_BOX])
    expect(e.y).toBe(13)
  })

  it('a shell just stomped is not kicked by the same landing', () => {
    // Her feet come in deep (but above its middle): the shell is lower than the snail, and her bounce still overlaps it.
    const room = flatRoom(40, [[12, 10, 's']])
    const s = createSim(room)
    const e = s.enemies[0]!
    hang(s, e.x, e.y - e.h + 0.3)
    const events = run(s, room, ticks(0.3))
    expect(count(events, 'stomp')).toBe(1)
    expect(count(events, 'kick')).toBe(0)
    expect(e.state).toBe('shell')
  })
})

describe('getting hurt', () => {
  /** The room's grumbles pressed against her side every step, so they touch her whenever they can. */
  function pressed(s: Sim) {
    const grumbles = s.enemies.filter((e) => e.kind === 'grumble')
    return (_: Sim) =>
      grumbles.forEach((e, i) => {
        e.x = s.hero.x + 0.5 + i * 0.01
        e.y = 13
      })
  }

  it('bubble to big to small to dizzy, each hit SAFE_FOR after the last, and the stars never go down', () => {
    const room = flatRoom(40, [[12, 20, 'g']])
    const s = createSim(room)
    setForm(s, 'bubble')
    s.stars = 7
    stand(s, 10)
    const touch = pressed(s)
    const hits: { tick: number; kind: EventKind; form: Form }[] = []
    let stars = s.stars
    for (let k = 0; k < ticks(SAFE_FOR) * 2 + 10; k++) {
      for (const e of run(s, room, 1, touch)) if (e.kind === 'shrink' || e.kind === 'hurt') hits.push({ tick: e.tick, kind: e.kind, form: s.hero.form })
      expect(s.stars).toBeGreaterThanOrEqual(stars)
      stars = s.stars
    }
    expect(hits.map((h) => [h.kind, h.form])).toEqual([['shrink', 'big'], ['shrink', 'small'], ['hurt', 'small']])
    expect(hits[1]!.tick - hits[0]!.tick).toBe(ticks(SAFE_FOR))
    expect(hits[2]!.tick - hits[1]!.tick).toBe(ticks(SAFE_FOR))
    expect(s.hero.dizzyUntil).toBeGreaterThan(s.tick - 10)
    expect(s.stars).toBe(7)
  })

  it('two enemies at once take one form, not two', () => {
    const room = flatRoom(40, [[12, 20, 'g'], [12, 22, 'g']])
    const s = createSim(room)
    setForm(s, 'bubble')
    stand(s, 10)
    const x = s.hero.x
    const events = run(s, room, 1, pressed(s))
    expect(count(events, 'shrink')).toBe(1)
    expect(s.hero.form).toBe('big')
    expect(s.phase).toBe('freeze')
    // No knock-back, and the one that hit her turns away.
    expect(s.hero.x).toBe(x)
    expect(s.enemies.filter((e) => e.facing === 1).length).toBe(1)
  })

  it('dizzy, the controls do nothing for DIZZY_FOR', () => {
    const room = flatRoom(40, [[12, 20, 'g']])
    const s = createSim(room)
    stand(s, 10)
    run(s, room, 1, pressed(s))
    expect(s.hero.dizzyUntil).toBe(s.tick - 1 + ticks(DIZZY_FOR))
    const x = s.hero.x
    pressJump(s)
    const events = run(s, room, ticks(DIZZY_FOR) - 1, (s) => setMove(s, 1))
    expect(count(events, 'jump')).toBe(0)
    expect(s.hero.x).toBe(x)
    releaseJump(s)
    pressJump(s)
    expect(kinds(run(s, room, 1))).toContain('jump')
  })

  it('a freeze holds the world still for FREEZE_FOR, then everything moves on from where it was', () => {
    const room = flatRoom(50, [[12, 40, 'g'], [5, 30, 'b']], [{ kind: 'loop', col: 5, row: 9, width: 3, dx: 0, dy: -3, period: 3 }])
    const s = createSim(room)
    setForm(s, 'big')
    stand(s, 20)
    run(s, room, ticks(1.5))
    const bee = s.enemies.find((e) => e.kind === 'bee')!
    const lift = s.lifts[0]!
    expect(bee.state).toBe('walk')
    run(s, room, 1, pressed(s))
    expect(s.phase).toBe('freeze')
    expect(s.hero.form).toBe('small')
    const frozen = cloneSim(s)
    run(s, room, ticks(FREEZE_FOR) - 1)
    expect(s.phase).toBe('freeze')
    expect([bee.y, lift.y]).toEqual([frozen.enemies.find((e) => e.kind === 'bee')!.y, frozen.lifts[0]!.y])
    run(s, room, 2)
    expect(s.phase).toBe('play')
    // Moving on from where they were: no jump when the freeze ends.
    expect(Math.abs(bee.y - bee.py)).toBeLessThan(0.05)
    expect(Math.abs(lift.y - lift.py)).toBeLessThan(0.05)
    expect(bee.y).not.toBe(frozen.enemies.find((e) => e.kind === 'bee')!.y)
  })
})

describe('falling', () => {
  /** A gap from column 20 to 22. */
  const room = flatRoom(50, [[13, 20, '...'], [14, 20, '...']])

  it('a fall is rescued in RESCUE_FOR onto the last safe ground, keeping her form and stars', () => {
    const s = createSim(room)
    setForm(s, 'big')
    s.stars = 4
    const events = runUntil(s, room, has('rescued'), (s) => setMove(s, s.phase === 'play' ? 1 : 0))
    const fall = events.find((e) => e.kind === 'fall')!
    const rescued = events.find((e) => e.kind === 'rescued')!
    expect(rescued.tick - fall.tick).toBe(ticks(RESCUE_FOR))
    expect(rescued.n).toBe(0)
    expect([s.hero.x, s.hero.y]).toEqual([18.5, 13])
    expect(s.hero.form).toBe('big')
    expect(s.stars).toBe(4)
    expect(s.falls[0]).toBe(1)
    expect(s.hero.safeUntil).toBe(rescued.tick + ticks(SAFE_FOR))
    expect(s.phase).toBe('play')
  })

  it('the HELP_AFTER-th fall into one gap carries her across it', () => {
    const s = createSim(room)
    const rescues: number[] = []
    for (let i = 0; i < HELP_AFTER; i++) {
      const events = runUntil(s, room, has('rescued'), (s) => setMove(s, s.phase === 'play' ? 1 : 0))
      rescues.push(events.find((e) => e.kind === 'rescued')!.n)
    }
    expect(rescues).toEqual([...Array<number>(HELP_AFTER - 1).fill(0), 1])
    expect(s.hero.x).toBeGreaterThanOrEqual(23 + SAFE_MARGIN)
    expect(s.hero.y).toBe(13)
    expect(s.falls[0]).toBe(HELP_AFTER)
  })
})

describe('bubbles', () => {
  function bubbly(marks: readonly Mark[]) {
    const room = flatRoom(80, marks)
    const s = createSim(room)
    setForm(s, 'bubble')
    stand(s, 6)
    return { room, s }
  }

  it(`never more than ${BUBBLES_MAX} out, and a held button blows one every BUBBLE_EVERY`, () => {
    const { room, s } = bubbly([])
    pressBubble(s)
    const events = run(s, room, ticks(4), () => expect(s.bubbles.length).toBeLessThanOrEqual(BUBBLES_MAX))
    const blows = events.filter((e) => e.kind === 'blow').map((e) => e.tick)
    expect(blows.slice(1, BUBBLES_MAX).map((t, i) => t - blows[i]!)).toEqual(Array<number>(BUBBLES_MAX - 1).fill(ticks(BUBBLE_EVERY)))
    expect(blows.length).toBeGreaterThan(BUBBLES_MAX)
    releaseBubble(s)
    const later = run(s, room, ticks(4))
    expect(count(later, 'blow')).toBe(0)
  })

  it('a bubble traps an enemy, which floats off and pops after TRAPPED_FOR', () => {
    const { room, s } = bubbly([[12, 12, 'g']])
    const g = s.enemies[0]!
    pressBubble(s)
    releaseBubble(s)
    runUntil(s, room, has('trap'))
    expect(g.state).toBe('trapped')
    const at = g.stateAt
    const y = g.y
    runUntil(s, room, () => g.state === 'gone')
    expect(s.tick - 1 - at).toBe(ticks(TRAPPED_FOR))
    expect(g.y).toBeLessThan(y - 1)
    expect(s.bubbles.length).toBe(0)
  })

  it('a bubble pops at a wall', () => {
    const { room, s } = bubbly([[11, 9, '#'], [12, 9, '#']])
    pressBubble(s)
    releaseBubble(s)
    const events = run(s, room, ticks(0.5))
    expect(kinds(events)).toEqual(['blow', 'pop'])
    expect(s.bubbles.length).toBe(0)
  })

  it('the rainbow ball knocks over what she touches and never lets it hurt her', () => {
    const room = flatRoom(40, [[12, 10, 'g'], [12, 14, 's']])
    const s = createSim(room)
    addItem(s, 'ball', 4, 13, 1)
    const events = run(s, room, ticks(3), (s) => setMove(s, 1))
    expect(count(events, 'ball')).toBe(1)
    expect(count(events, 'knock')).toBe(2)
    expect(count(events, 'hurt')).toBe(0)
  })
})

describe('the Big Grumble', () => {
  /** An arena: the Big Grumble at column 20 and a gate four blocks tall at column 30. */
  const arena = () => flatRoom(50, [[12, 20, 'k'], [9, 30, 'x'], [10, 30, 'x'], [11, 30, 'x'], [12, 30, 'x']])

  it('takes three stomps, dizzy and smaller after each, never hurts her, then hops off as a bunny and the gate opens', () => {
    const room = arena()
    const s = createSim(room)
    const boss = s.enemies[0]!
    stand(s, 10)
    const all: SimEvent[] = []
    for (const hp of [2, 1, 0]) {
      all.push(...runUntil(s, room, () => boss.state === 'walk'))
      hang(s, boss.x, boss.y - boss.h - 0.2)
      const events = runUntil(s, room, has('stomp'))
      all.push(...events)
      expect(events.find((e) => e.kind === 'stomp')!.n).toBeGreaterThan(0)
      expect(boss.hp).toBe(hp)
      if (hp > 0) {
        expect(boss.state).toBe('dizzy')
        expect(events.find((e) => e.kind === 'bossHit')!.n).toBe(hp)
        expect([boss.w, boss.h]).toEqual([...BOSS_BOX[hp - 1]!])
        // A stomp while it is dizzy only bounces her.
        hang(s, boss.x, boss.y - boss.h - 0.2)
        const bounce = runUntil(s, room, has('stomp'))
        all.push(...bounce)
        expect(bounce.find((e) => e.kind === 'stomp')!.n).toBe(0)
        expect(boss.hp).toBe(hp)
        stand(s, 5)
        // Let it walk into her: it pushes her and never hurts her.
        all.push(...run(s, room, ticks(BOSS_DIZZY)))
      } else {
        expect(boss.state).toBe('bunny')
        expect([boss.w, boss.h]).toEqual([...BUNNY_BOX])
        expect(count(events, 'bossDown')).toBe(1)
        expect(count(events, 'gate')).toBe(4)
        expect(s.blocks.every((b) => b.state === 'open')).toBe(true)
        expect(s.gateAt).toBe(events.find((e) => e.kind === 'gate')!.tick)
      }
    }
    all.push(...run(s, room, ticks(BUNNY_FOR) + 1))
    expect(boss.state).toBe('gone')
    expect(count(all, 'hurt') + count(all, 'shrink')).toBe(0)
    expect(s.hero.form).toBe('small')
  })

  it('pushes her away when it walks into her', () => {
    const room = arena()
    const s = createSim(room)
    const boss = s.enemies[0]!
    stand(s, 12)
    const events = runUntil(s, room, () => Math.abs(s.hero.vx) === BOSS_PUSH)
    expect(s.hero.vx).toBe(-BOSS_PUSH)
    expect(boss.state).toBe('walk')
    run(s, room, ticks(3))
    expect(count(events, 'hurt') + count(events, 'shrink')).toBe(0)
    expect(s.hero.dizzyUntil).toBe(-1)
  })

  it('three bubbles beat it too', () => {
    const room = arena()
    const s = createSim(room)
    const boss = s.enemies[0]!
    setForm(s, 'bubble')
    stand(s, 12)
    const events: SimEvent[] = []
    for (let i = 0; i < 3; i++) {
      events.push(...runUntil(s, room, () => boss.state === 'walk'))
      stand(s, boss.x - 4)
      s.hero.facing = 1
      pressBubble(s)
      releaseBubble(s)
      events.push(...runUntil(s, room, (_, ev) => ev.some((e) => e.kind === 'bossHit' || e.kind === 'bossDown')))
    }
    expect(kinds(events).filter((k) => k === 'bossHit' || k === 'bossDown')).toEqual(['bossHit', 'bossHit', 'bossDown'])
    expect(boss.state).toBe('bunny')
  })
})

describe('stars, springs and the pole', () => {
  it('picks up a map star', () => {
    const room = flatRoom(30, [[12, 6, '*']])
    const s = createSim(room)
    const events = run(s, room, ticks(1.5), (s) => setMove(s, 1))
    expect(count(events, 'star')).toBe(1)
    expect(s.taken[0]).toBe(1)
    expect(s.stars).toBe(1)
  })

  it('pays 1 star at the foot of the pole, and with no input the visit ends', () => {
    const room = flatRoom(40)
    const s = createSim(room)
    const events = runUntil(s, room, has('pole'), (s) => setMove(s, 1))
    expect(events.find((e) => e.kind === 'pole')!.n).toBe(1)
    expect(s.poleBonus).toBe(1)
    expect(s.stars).toBe(1)
    expect(s.phase).toBe('pole')
    const rest = runUntil(s, room, has('done'), (s) => setMove(s, 0))
    expect(kinds(rest)).toEqual(['kitten', 'done'])
    expect(s.phase).toBe('done')
    expect(s.hero.x).toBeCloseTo(room.bed.col + 0.5 - BED_GAP, 9)
  })

  it(`pays ${POLE_STARS} stars at the top of the pole and slides her down`, () => {
    const room = flatRoom(40)
    const s = createSim(room)
    const foot = room.pole.row + 1
    hang(s, room.pole.col + 0.5 - 0.38, foot - 8.9 + 0.6 * s.hero.h)
    s.hero.vx = 5
    const events = runUntil(s, room, has('pole'), (s) => setMove(s, 1))
    expect(events.find((e) => e.kind === 'pole')!.n).toBe(POLE_STARS)
    expect(s.poleBonus).toBe(POLE_STARS)
    runUntil(s, room, () => s.phase === 'walk')
    expect(s.hero.y).toBe(foot)
    runUntil(s, room, has('done'))
  })
})

describe('determinism and cloning', () => {
  /** A bit of everything. */
  const room = flatRoom(
    90,
    [
      [9, 8, '?p$r'],
      [9, 16, 'cc'],
      [8, 15, '*.*'],
      [12, 11, 'g'],
      [12, 18, 's'],
      [6, 24, 'b'],
      [12, 28, '^'],
      [13, 34, '...'],
      [14, 34, '...'],
      [10, 40, '====='],
      [12, 46, 'g.g'],
      [11, 52, 'AB'],
      [12, 52, 'ABCD'],
    ],
    [{ kind: 'loop', col: 60, row: 10, width: 3, dx: 4, dy: 0, period: 4 }],
  )

  /** A child's hands, from a seed: a new choice every 15 ticks, mostly right, jumps of every length. */
  function hands(seed: number) {
    let x = seed
    const next = () => {
      x = (x * 1103515245 + 12345) % 2147483648
      return x / 2147483648
    }
    return (s: Sim) => {
      if (s.tick % 15 !== 0) return
      const r = next()
      setMove(s, r < 0.6 ? 1 : r < 0.75 ? -1 : 0)
      const j = next()
      if (j < 0.3) pressJump(s)
      else if (j < 0.7) releaseJump(s)
      if (next() < 0.2) {
        pressBubble(s)
        releaseBubble(s)
      }
    }
  }

  it('one input script played twice gives the same sim', () => {
    const a = createSim(room)
    const b = createSim(room)
    run(a, room, ticks(30), hands(7))
    run(b, room, ticks(30), hands(7))
    expect(a).toEqual(b)
    expect(a.tick).toBe(ticks(30))
  })

  it('a clone shares nothing that changes, and keeps step with its source', () => {
    const s = createSim(room)
    const drive = hands(3)
    run(s, room, ticks(5), drive)
    const snapshot = structuredClone(s)
    const c = cloneSim(s)
    run(c, room, 100, hands(11))
    expect(s).toEqual(snapshot)
    const twin = cloneSim(s)
    const driveTwin = hands(3)
    // Bring the second driver to the same place in its script.
    for (let t = 0; t < s.tick; t += 15) driveTwin({ ...s, tick: t, input: { ...s.input } })
    for (let k = 0; k < ticks(20); k += 100) {
      run(s, room, 100, drive)
      run(twin, room, 100, driveTwin)
      expect(twin).toEqual(s)
    }
  })

  it('keeps everyone out of solid cells, never lowers the stars and never throws, for minutes of a child at the controls', () => {
    /** Whether a box covers a solid tile or a standing block (the walls beyond the ends of the room count). */
    const inside = (s: Sim, x: number, y: number, w: number, h: number) => {
      for (let r = Math.floor(y - h + 1e-6); r <= Math.ceil(y - 1e-6) - 1; r++) {
        for (let c = Math.floor(x - w / 2 + 1e-6); c <= Math.ceil(x + w / 2 - 1e-6) - 1; c++) {
          if (c < 0 || c >= room.cols) return true
          if (r < 0 || r >= ROWS) continue
          const tile = room.tiles[r * room.cols + c]!
          const b = room.blockAt[r * room.cols + c]!
          if (tile === TILE.ground || tile === TILE.abc || tile === TILE.column) return true
          if (b >= 0 && (s.blocks[b]!.state === 'full' || s.blocks[b]!.state === 'empty')) return true
        }
      }
      return false
    }
    for (const seed of [1, 2, 3, 4]) {
      const s = createSim(room)
      if (seed % 2 === 0) setForm(s, 'bubble')
      const drive = hands(seed)
      let stars = 0
      run(s, room, ticks(45), (s) => {
        drive(s)
        const h = s.hero
        if (s.phase === 'play' || s.phase === 'freeze') expect(inside(s, h.x, h.y, h.w, h.h), `seed ${seed} tick ${s.tick}: Pia at (${h.x}, ${h.y})`).toBe(false)
        for (const e of s.enemies) {
          if (e.state === 'walk' && e.kind !== 'bee') expect(inside(s, e.x, e.y, e.w, e.h), `seed ${seed} tick ${s.tick}: ${e.kind} at (${e.x}, ${e.y})`).toBe(false)
        }
        expect(s.stars).toBeGreaterThanOrEqual(stars)
        stars = s.stars
        if (s.phase === 'done') {
          // A new visit from the start, stars and all.
          Object.assign(s, createSim(room))
          stars = 0
        }
      })
    }
  })

  it('holds nothing but numbers, booleans, strings and typed arrays, in flat objects', () => {
    const s = createSim(room)
    run(s, room, ticks(10), hands(5))
    const leaf = (v: unknown) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string'
    const flatObject = (v: unknown, path: string) => {
      expect(Object.getPrototypeOf(v), path).toBe(Object.prototype)
      for (const [k, x] of Object.entries(v as object)) expect(leaf(x), `${path}.${k}`).toBe(true)
    }
    for (const [key, v] of Object.entries(s)) {
      if (leaf(v) || ArrayBuffer.isView(v)) continue
      if (Array.isArray(v)) v.forEach((x, i) => (leaf(x) ? undefined : flatObject(x, `${key}[${i}]`)))
      else flatObject(v, key)
    }
  })
})

describe('events', () => {
  it('every kind of event came up in some test above', () => {
    expect(Object.keys(KINDS).filter((k) => !seen.has(k as EventKind))).toEqual([])
  })
})
