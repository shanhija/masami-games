/**
 * The munchers, each rule alone on the designed board, stepped the way rules.step steps them:
 * the hunger's terms one by one, its stages and the warning, every kind rule holding a visit
 * back on its own, the scout, a visit's size, targets by preference and walking distance, a
 * hedge line forcing a nibble and the stump regrowing, a sitter starving the machine after it
 * and grabbing, a nap stopping a machine and the shiny thing taken, the 60 s limit, tickles
 * with the cap and Beep's order, the towers' choice, reservation, suds and ammo, picnics and
 * friends, each switch, Good night, the launch's watchers and edits; then the board lint: from
 * every burrow's door a muncher reaches the factory's core on the empty board of the land that
 * opens it.
 */
import { describe, expect, it } from 'vitest'

import { add, cell, line, put } from './beltKit'
import { working } from './band'
import { BURROWS, GROUND, LANDS, PAD_RING, cellOf, stepCell, xOf, yOf } from './board'
import { hop, rebuild } from './belts'
import {
  AFTER_CARD,
  AFTER_PAUSE,
  AFTER_TURN,
  CAUGHT_MAX,
  CHEEKS,
  COUNT_AT,
  GRAB_EVERY,
  HELLO_SLEEP,
  HOME_STEP,
  HOP_OUT_EVERY,
  HUNGER,
  HUNGER_FULL,
  LAUNCH_FOR,
  NAP_BOTTLE,
  NAP_OTHER,
  NIBBLE_FOR,
  OUT_FOR,
  PICNIC_FOR,
  POLITE_FOR,
  QUIET_AFTER,
  REGROW,
  SCOUT_AFTER,
  SCOUT_CHEEKS,
  SCOUT_STEP,
  SESSION_CALM,
  SHRUG_FOR,
  SIZE,
  SLEEP,
  STAGE_AT,
  SUDS_STEP,
  TICKLED_STEP,
  TICKLE_FOR,
  TOUCHED_WITHIN,
  TOWER_EVERY,
  TOWER_FLIGHT,
  VISIT_CAP,
  WAIT_AT,
  WALK_ON,
  WALK_STEP,
  WARN,
} from './catalog'
import { CELLS, DIRS, HOP, HZ, MUNCHER_MODES, STEP, THINGS, inSlot, outSlot, thingIndex, ticks, type Building, type CardId, type Dir, type Kind, type Muncher, type MuncherMode, type SimEvent, type State, type Thing } from './model'
import { afterEdit, doorCell, goodnightHome, listening, nearFlowers, pawsOf, sittingAt, stepBurrows, stepMunchers, stepTowers, tickle, walkDistances } from './munchers'
import { rng } from './random'
import { act, blankState, cloneState } from './rules'
import { wants } from './trade'
import { muncherPoint } from './where'

/** The tick the tests start at: ten minutes into the session, a whole second. */
const T = ticks(600)
const A = 0
const ALL: CardId[] = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'land2', 'stars', 'snacks', 'land3', 'rocket', 'fuel']
const at = (x: number, y: number) => cellOf(x, y)
/** The cells beside burrow A's mound on land 1 (its row above and column to the east lie in land 2). */
const BY_A = [at(10, 2), at(10, 3), at(11, 4), at(12, 4)]

/** A game ten minutes into its session on land 1: Gears! found and burrow A's scout long gone, a finger on the glass, nothing else going on. */
function game(): State {
  const s = blankState(3)
  s.tick = T
  s.playing = true
  s.found = ALL.slice(0, 4)
  s.burrows[A]!.visits = 1
  s.touching = true
  rebuild(s)
  return s
}

/**
 * Steps the munchers' part of rules.step n times in the seams' order (the events, the belts'
 * hop on hop ticks, the towers, the munchers, the burrows once a second, the tick) and returns
 * every event.
 */
function run(s: State, n: number): SimEvent[] {
  const all: SimEvent[] = []
  for (let i = 0; i < n; i++) {
    s.events = s.queued
    s.queued = []
    if (s.tick % HOP === 0) hop(s)
    stepTowers(s)
    stepMunchers(s)
    if (s.tick % HZ === 0) stepBurrows(s)
    all.push(...s.events)
    s.tick++
  }
  return all
}
/** Steps until `done` holds (asked after each tick), at most `max` ticks; returns every event. */
function until(s: State, done: (s: State) => boolean, max: number): SimEvent[] {
  const all: SimEvent[] = []
  for (let i = 0; i < max; i++) {
    all.push(...run(s, 1))
    if (done(s)) return all
  }
  throw new Error(`still waiting after ${max} ticks`)
}
/** Every muncher of the visit is out of the doorway and has decided. */
const settled = (s: State) => s.munchers.length > 0 && s.munchers.every((m) => m.mode !== 'peek' && m.mode !== 'out' && m.mode !== 'bowl')
/** Burrow A's hunger at the edge with every rule letting it come: steps until the visit's munchers are out and on their way. */
function visit(s: State): SimEvent[] {
  s.burrows[A]!.hunger = WAIT_AT
  return until(s, settled, ticks(20))
}
const kinds = <K extends SimEvent['kind']>(events: readonly SimEvent[], kind: K) => events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind)
const manhattan = (a: number, b: number) => Math.abs(xOf(a) - xOf(b)) + Math.abs(yOf(a) - yOf(b))

/** A building of `kind` at (x, y), busy with a batch: band.ts's working machine. */
function busy(s: State, kind: Kind, x: number, y: number): Building {
  const b = add(s, kind, x, y)
  b.batch = { makes: 'blueBar', at: s.tick, until: s.tick + ticks(1000) }
  rebuild(s)
  return b
}
/** One belt cell at (x, y) running east to nowhere with `thing` waiting at its end: a belt cell carrying that thing, which stays put. */
function spot(s: State, x: number, y: number, thing: Thing): number {
  const c = cell(s, x, y, 2, 0, -1, -1)
  put(s, outSlot(c), thing)
  rebuild(s)
  return c
}
/** A muncher of burrow A put down directly in `mode` on cell c (a sitter with that cell as its target, tried), with a visit for it to belong to. */
function muncher(s: State, c: number, mode: MuncherMode, cheeks: Thing[]): Muncher {
  const m: Muncher = { id: s.nextMuncher++, burrow: A, mode, modeAt: s.tick, cell: c, toward: c, stepAt: s.tick, stepFor: WALK_STEP, hop: null, homeWhy: null, target: mode === 'sit' ? { kind: 'cell', cell: c } : null, tried: mode === 'sit' ? [c] : [], cheeks, grabAt: -1, idleSince: s.tick, outAt: s.tick, scout: false, shotBy: -1 }
  s.munchers.push(m)
  s.visit ??= { burrow: A, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
  return m
}
/** A napper on building b, climbed up from cell c. */
function napper(s: State, b: Building, c: number): Muncher {
  const m = muncher(s, c, 'nap', [])
  m.target = { kind: 'building', id: b.id }
  b.napper = m.id
  return m
}
/** Burrow A's hunger after `seconds` more seconds, from 0. */
function hungerAfter(s: State, seconds: number): number {
  s.burrows[A]!.hunger = 0
  run(s, seconds * HZ)
  return s.burrows[A]!.hunger
}
/** Burrow A walled in by hedges on every cell beside its mound, with two bottles to go for. */
function fenced(): State {
  const s = game()
  for (const c of BY_A) s.hedge[c] = 1
  spot(s, 5, 9, 'greenBottle')
  spot(s, 6, 9, 'greenBottle')
  return s
}

describe('hunger', () => {
  it('grows by the base each second, plus one for each working machine on the board up to the cap', () => {
    const s = game()
    expect(hungerAfter(s, 3)).toBe(3 * HUNGER.base)
    busy(s, 'oven', 0, 10)
    expect(hungerAfter(s, 2)).toBe(2 * (HUNGER.base + HUNGER.perWorking))
    for (const x of [2, 4, 6, 8]) busy(s, 'oven', x, 10)
    for (const x of [0, 2, 4, 6]) busy(s, 'oven', x, 0)
    expect(s.buildings.filter(working).length).toBe(9)
    expect(hungerAfter(s, 2)).toBe(2 * (HUNGER.base + HUNGER.perWorking * HUNGER.workingCap))
  })

  it('adds the flower terms: a working machine on the flowers, one near them, and the drumming pad from Rocket!', () => {
    const s = game()
    const on = busy(s, 'oven', 9, 1)
    expect(nearFlowers(A, at(10, 2))).toBe('on')
    expect(hungerAfter(s, 2)).toBe(2 * (HUNGER.base + HUNGER.perWorking + HUNGER.onFlowers))
    on.batch = null
    busy(s, 'oven', 7, 4)
    expect([nearFlowers(A, at(8, 4)), nearFlowers(A, at(7, 4)), nearFlowers(A, at(6, 4))]).toEqual(['near', null, null])
    expect(hungerAfter(s, 2)).toBe(2 * (HUNGER.base + HUNGER.perWorking + HUNGER.nearFlowers))
    s.found = ALL.slice(0, 11)
    s.land = 3
    expect(hungerAfter(s, 1)).toBe(HUNGER.base + HUNGER.perWorking + HUNGER.nearFlowers + HUNGER.pad)
  })

  it('counts a machine napped on, or tucked in, as no machine', () => {
    const s = game()
    const b = busy(s, 'greenMaker', 9, 1)
    b.napper = 99
    expect(hungerAfter(s, 2)).toBe(2 * HUNGER.base)
    b.napper = -1
    b.tucked = true
    expect(hungerAfter(s, 2)).toBe(2 * HUNGER.base)
  })

  it('runs at half speed with the Few switch, rounding by turns, and nothing from the flowers', () => {
    const s = game()
    s.switches.munchers = 'few'
    busy(s, 'oven', 9, 1)
    expect(hungerAfter(s, 2)).toBe(HUNGER.base + HUNGER.perWorking)
    expect(hungerAfter(s, 4)).toBe(2 * (HUNGER.base + HUNGER.perWorking))
  })

  it('is frozen while the burrow sleeps, while its munchers are out, and before its land opens or Gears! is found', () => {
    const s = game()
    s.burrows[A]!.sleepUntil = s.tick + ticks(5)
    expect(hungerAfter(s, 4)).toBe(0)
    run(s, ticks(2))
    expect(s.burrows[A]!.hunger).toBeGreaterThan(0)
    muncher(s, at(9, 9), 'caught', [])
    expect(hungerAfter(s, 3)).toBe(0)
    s.munchers = []
    s.found = ALL.slice(0, 3)
    expect(hungerAfter(s, 3)).toBe(0)
    expect(s.burrows[1]!.hunger + s.burrows[2]!.hunger).toBe(0)
  })

  it('climbs through the stages, waits at WAIT_AT while a rule holds it back, warns at full and sends the visit WARN later', () => {
    const s = game()
    busy(s, 'oven', 9, 1)
    busy(s, 'greenMaker', 11, 4)
    s.touching = false
    const seen: number[] = []
    for (let k = 0; k < 120; k++) {
      run(s, HZ)
      seen.push(s.burrows[A]!.hunger)
    }
    const rate = HUNGER.base + 2 * HUNGER.perWorking + 2 * HUNGER.onFlowers
    expect(seen.slice(0, 3)).toEqual([rate, 2 * rate, 3 * rate])
    for (const stage of STAGE_AT) expect(seen.some((h) => h >= stage && h - rate < stage)).toBe(true)
    expect(seen[seen.length - 1]).toBe(WAIT_AT)
    expect(s.burrows[A]!.warnAt).toBe(-1)
    s.touching = true
    expect(kinds(run(s, HZ), 'warn')).toEqual([{ kind: 'warn', burrow: A }])
    expect(s.burrows[A]!.hunger).toBe(HUNGER_FULL)
    const warnAt = s.burrows[A]!.warnAt
    run(s, warnAt + WARN - s.tick)
    expect(s.munchers.length).toBe(0)
    run(s, 1)
    expect(s.visit).toMatchObject({ burrow: A, at: warnAt + WARN })
    expect(s.munchers.map((m) => m.mode)).toEqual(['peek', 'peek'])
    expect(s.burrows[A]!.hunger).toBe(0)
    expect(s.burrows[A]!.visits).toBe(2)
    expect(listening(s, A)).toBe(false)
  })
})

describe('the kind rules', () => {
  /** Each rule broken alone, long enough to hold for the three seconds the test steps. */
  const rules: [string, (s: State) => void][] = [
    [
      'another visit is out',
      (s) => {
        s.visit = { burrow: 1, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
        muncher(s, at(9, 9), 'caught', []).burrow = 1
      },
    ],
    [
      'another burrow is warning',
      (s) => {
        s.burrows[1]!.hunger = HUNGER_FULL
        s.burrows[1]!.warnAt = s.tick - HZ
      },
    ],
    ['the last muncher got home under QUIET_AFTER ago', (s) => (s.lastHomeAt = s.tick - QUIET_AFTER + 4 * HZ)],
    [
      'nobody touched the board for TOUCHED_WITHIN',
      (s) => {
        s.touching = false
        s.lastTouchAt = s.tick - TOUCHED_WITHIN - HZ
      },
    ],
    ['a card is up', (s) => (s.card = { id: 'gears', at: s.tick - HZ })],
    ['a card closed under AFTER_CARD ago', (s) => (s.cardClosedAt = s.tick - AFTER_CARD + 4 * HZ)],
    ['the pause menu closed under AFTER_PAUSE ago', (s) => (s.pauseClosedAt = s.tick - AFTER_PAUSE + 4 * HZ)],
    ['the board turned under AFTER_TURN ago', (s) => (s.turnedAt = s.tick - AFTER_TURN + 4 * HZ)],
    ['the session is no older than SESSION_CALM', (s) => (s.sessionAt = s.tick - SESSION_CALM + 4 * HZ)],
    ['the rocket is full', (s) => (s.rocket.got = [20, 30, 10, 40])],
    ['it is night', (s) => (s.night = { at: s.tick, kind: null, kindAt: -1, doneAt: -1 })],
    ['the launch runs', (s) => (s.launch = { at: s.tick, landsAt: s.tick + LAUNCH_FOR })],
  ]

  it('let a visit come when none holds it back, a touch a moment ago counting as well as a finger down', () => {
    for (const touching of [true, false]) {
      const s = game()
      s.touching = touching
      s.lastTouchAt = s.tick - TOUCHED_WITHIN + 2 * HZ
      s.burrows[A]!.hunger = WAIT_AT
      expect(kinds(run(s, HZ), 'warn').length).toBe(1)
    }
  })

  for (const [name, broken] of rules)
    it(`hold a visit back alone: ${name}`, () => {
      const s = game()
      broken(s)
      s.burrows[A]!.hunger = WAIT_AT
      const events = run(s, 3 * HZ)
      expect(kinds(events, 'warn').filter((e) => e.burrow === A)).toEqual([])
      expect(s.burrows[A]!.hunger).toBe(WAIT_AT)
      // The launch sends burrow A a watcher, which is no visit.
      expect(s.munchers.filter((m) => m.burrow === A && m.mode !== 'watch')).toEqual([])
    })

  it('send a warning back to waiting when a rule turns while the mound wobbles', () => {
    const s = game()
    s.burrows[A]!.hunger = WAIT_AT
    run(s, HZ)
    expect(s.burrows[A]!.hunger).toBe(HUNGER_FULL)
    s.card = { id: 'gears', at: s.tick }
    run(s, WARN + HZ)
    expect(s.munchers).toEqual([])
    expect([s.burrows[A]!.hunger, s.burrows[A]!.warnAt]).toEqual([WAIT_AT, -1])
    s.card = null
    s.cardClosedAt = s.tick - AFTER_CARD
    expect(kinds(run(s, HZ), 'warn').length).toBe(1)
  })
})

describe('the scout', () => {
  it('comes SCOUT_AFTER after Gears!: one slow muncher with small cheeks that never naps', () => {
    const s = game()
    s.found = ALL.slice(0, 3)
    s.burrows[A]!.visits = 0
    run(s, ticks(200))
    expect(s.burrows[A]!).toMatchObject({ hunger: 0, sleepUntil: -1 })
    s.found = ALL.slice(0, 4)
    run(s, HZ)
    const wakes = s.burrows[A]!.sleepUntil
    expect(wakes).toBe(s.tick - HZ + SCOUT_AFTER)
    expect(listening(s, A)).toBe(false)
    // A bottle maker to nap on, and a bar belt by the door.
    busy(s, 'greenMaker', 5, 8)
    const bars = line(s, [
      [7, 5],
      [8, 5],
      [9, 5],
    ])
    rebuild(s)
    for (const c of bars) {
      put(s, inSlot(c), 'blueBar')
      put(s, outSlot(c), 'blueBar')
    }
    run(s, wakes - s.tick - HZ)
    expect([s.burrows[A]!.hunger, s.burrows[A]!.warnAt]).toEqual([0, -1])
    const events = until(s, settled, SCOUT_AFTER)
    expect(kinds(events, 'warn').length).toBe(1)
    expect(s.munchers.length).toBe(1)
    const scout = s.munchers[0]!
    expect(scout.scout).toBe(true)
    expect(scout.target).toEqual({ kind: 'cell', cell: at(9, 5) })
    expect(scout.stepFor).toBe(SCOUT_STEP)
    const home = until(s, () => scout.mode === 'home', ticks(30))
    expect(scout.homeWhy).toBe('full')
    expect(scout.cheeks.length).toBe(SCOUT_CHEEKS)
    expect(kinds(home, 'napStart')).toEqual([])
    expect(s.burrows[A]!.visits).toBe(1)
  })
})

describe('a visit', () => {
  /** How many munchers burrow A sends with what `setup` puts on the board. */
  function size(setup: (s: State) => void): number {
    const s = game()
    setup(s)
    s.burrows[A]!.hunger = WAIT_AT
    run(s, HZ + WARN + HZ)
    return s.munchers.length
  }

  it('is 1, plus one for each working machine on its flowers up to FLOWER_EXTRA, plus one with VISIT_BUSY working, at most VISIT_CAP for the land', () => {
    expect(size(() => {})).toBe(1)
    expect(size((s) => busy(s, 'oven', 9, 1))).toBe(2)
    expect(size((s) => busy(s, 'oven', 7, 4))).toBe(1)
    expect(size((s) => [busy(s, 'oven', 9, 1), busy(s, 'oven', 11, 4)])).toBe(VISIT_CAP[1])
    const land3 = (s: State) => {
      s.land = 3
      for (const [x, y] of [
        [9, 1],
        [11, 4],
        [13, 2],
      ])
        busy(s, 'oven', x!, y!)
      for (const x of [0, 2, 4, 6, 8]) busy(s, 'oven', x, 10)
    }
    // 1 + 2 on its flowers + 1 with 8 working, held to land 3's cap.
    expect(size(land3)).toBe(Math.min(1 + 2 + 1, VISIT_CAP[3]))
    expect(
      size((s) => {
        land3(s)
        s.switches.munchers = 'few'
      }),
    ).toBe(1)
    // The drumming pad counts as a machine on every burrow's flowers.
    expect(
      size((s) => {
        s.land = 2
        s.found = ALL.slice(0, 11)
      }),
    ).toBe(2)
  })

  it('waits in the doorway and hops out HOP_OUT_EVERY apart, the first one HOP_OUT_EVERY after it came', () => {
    const s = game()
    busy(s, 'oven', 9, 1)
    s.burrows[A]!.hunger = WAIT_AT
    run(s, HZ + WARN)
    const door = BURROWS[A]!.door
    const t = s.tick * STEP
    expect(s.munchers.map((m) => [m.mode, muncherPoint(m, t).x, muncherPoint(m, t).y])).toEqual([
      ['peek', door.x, door.y],
      ['peek', door.x, door.y],
    ])
    const outs = kinds(run(s, 3 * HOP_OUT_EVERY), 'hopOut')
    expect(outs.map((e) => e.id)).toEqual(s.munchers.map((m) => m.id))
    expect(s.munchers.map((m) => m.outAt - s.visit!.at)).toEqual([HOP_OUT_EVERY, 2 * HOP_OUT_EVERY])
    expect(doorCell(s, A)).toBe(at(11, 4))
  })
})

describe('burrows B and C', () => {
  it('wake HELLO_SLEEP after their land opens and send their munchers from their own doors toward the factory', () => {
    for (const i of [1, 2]) {
      const s = game()
      s.land = BURROWS[i]!.land
      s.burrows[i]!.helloAt = s.tick
      const bottle = spot(s, 5, 9, 'greenBottle')
      s.burrows[i]!.hunger = WAIT_AT
      run(s, HELLO_SLEEP)
      expect([s.munchers, listening(s, i)]).toEqual([[], false])
      const events = until(s, settled, ticks(20))
      expect(kinds(events, 'warn')).toEqual([{ kind: 'warn', burrow: i }])
      const m = s.munchers[0]!
      expect([s.munchers.length, m.burrow, m.target]).toEqual([1, i, { kind: 'cell', cell: bottle }])
      expect(manhattan(m.cell, doorCell(s, i))).toBeLessThanOrEqual(1)
      until(s, () => m.mode === 'sit', ticks(40))
      expect(m.cell).toBe(bottle)
    }
  })
})

describe('targets', () => {
  it('go for the bottle line before gears and gears before bars, however far', () => {
    const s = game()
    spot(s, 10, 5, 'blueBar')
    const gear = spot(s, 5, 2, 'gear')
    const bottle = spot(s, 5, 9, 'greenBottle')
    visit(s)
    expect(s.munchers[0]!.target).toEqual({ kind: 'cell', cell: bottle })
    const t = game()
    spot(t, 10, 5, 'blueBar')
    spot(t, 5, 2, 'gear')
    visit(t)
    expect(t.munchers[0]!.target).toEqual({ kind: 'cell', cell: gear })
    const u = game()
    const bar = spot(u, 10, 5, 'blueBar')
    visit(u)
    expect(u.munchers[0]!.target).toEqual({ kind: 'cell', cell: bar })
  })

  it('count a belt by what the building upstream puts out, and a bottle maker to nap on as much as its line', () => {
    const s = game()
    add(s, 'greenMaker', 3, 8)
    line(s, [
      [5, 8],
      [6, 8],
      [7, 8],
    ])
    rebuild(s)
    spot(s, 10, 5, 'gear')
    visit(s)
    // The maker's line runs empty, but it is the bottle line: its spout (5, 8) and its end (7, 8) are both 10 steps away (round the start oven either way), and a tie goes to the lower cell, before the maker itself.
    const d = walkDistances(s, doorCell(s, A), false)
    expect([d[at(5, 8)], d[at(7, 8)]]).toEqual([10, 10])
    expect(s.munchers[0]!.target).toEqual({ kind: 'cell', cell: at(5, 8) })
    const t = game()
    const maker = add(t, 'greenMaker', 8, 4)
    rebuild(t)
    spot(t, 10, 6, 'blueBar')
    visit(t)
    const m = t.munchers[0]!
    expect(m.target).toEqual({ kind: 'building', id: maker.id })
    const events = until(t, () => m.mode === 'nap', ticks(10))
    expect(maker.napper).toBe(m.id)
    expect(kinds(events, 'napStart')).toEqual([{ kind: 'napStart', id: m.id, building: maker.id }])
    expect(t.visit!.naps).toBe(1)
  })

  it('take the nearest by walking distance, round what stands in the way', () => {
    const s = game()
    add(s, 'lab', 9, 3)
    rebuild(s)
    const near = spot(s, 8, 4, 'greenBottle')
    const far = spot(s, 12, 7, 'greenBottle')
    expect([manhattan(doorCell(s, A), near), manhattan(doorCell(s, A), far)]).toEqual([3, 4])
    const d = walkDistances(s, doorCell(s, A), false)
    expect([d[near], d[far]]).toEqual([5, 4])
    visit(s)
    expect(s.munchers[0]!.target).toEqual({ kind: 'cell', cell: far })
  })

  it('give each muncher the nearest target no earlier one took, in hop-out order', () => {
    const s = game()
    busy(s, 'oven', 9, 1)
    const near = spot(s, 10, 5, 'greenBottle')
    const far = spot(s, 5, 9, 'greenBottle')
    visit(s)
    expect(s.munchers.map((m) => m.target)).toEqual([
      { kind: 'cell', cell: near },
      { kind: 'cell', cell: far },
    ])
    const [first, second] = s.munchers
    until(s, () => first!.mode === 'sit', ticks(10))
    expect([sittingAt(s, near), sittingAt(s, far)]).toEqual([first, null])
    // A tap on the burrow while its visit is out shows the way its first muncher went.
    expect(pawsOf(s, A).at(-1)).toBe(near)
    until(s, () => second!.mode === 'sit', ticks(20))
    expect(sittingAt(s, far)).toBe(second)
  })

  it('show their way in paw prints: neighbouring cells from the door to the first target', () => {
    const s = game()
    const bottle = spot(s, 9, 7, 'greenBottle')
    const paws = pawsOf(s, A)
    expect(paws[0]).toBe(doorCell(s, A))
    expect(paws[paws.length - 1]).toBe(bottle)
    expect(paws.length).toBe(walkDistances(s, doorCell(s, A), false)[bottle]! + 1)
    paws.slice(1).forEach((c, i) => expect(manhattan(c, paws[i]!)).toBe(1))
  })

  it('leave a muncher with nothing to go for waving and hopping home', () => {
    const s = game()
    s.buildings = s.buildings.filter((b) => b.kind === 'pad')
    rebuild(s)
    const events = visit(s)
    expect(kinds(events, 'home')).toEqual([{ kind: 'home', id: s.munchers[0]!.id, why: 'nothing' }])
    expect(pawsOf(s, A)).toEqual([])
  })
})

describe('hedges', () => {
  it('make a muncher that reaches nothing nibble the first hedge on its way, three crunches over NIBBLE_FOR, one nibbler at a time', () => {
    const s = fenced()
    busy(s, 'oven', 9, 1)
    expect(doorCell(s, A)).toBe(at(11, 3))
    const events = visit(s)
    const [first, second] = s.munchers
    expect(first!.mode).toBe('nibble')
    const hedge = (first!.target as { cell: number }).cell
    expect([at(10, 3), at(11, 4)]).toContain(hedge)
    expect(kinds(events, 'nibble')).toEqual([{ kind: 'nibble', cell: hedge }])
    expect(second!.mode).toBe('wait')
    const bites = run(s, NIBBLE_FOR - (s.tick - first!.modeAt))
    expect(kinds([...events, ...bites], 'crunch')).toEqual([0, 1, 2].map(() => ({ kind: 'crunch', cell: hedge })))
    expect(s.hedge[hedge]).toBe(1)
    run(s, 1)
    expect(s.hedge[hedge]).toBe(2)
    expect([first!.mode, first!.toward]).toEqual(['walk', hedge])
    expect(second!.mode).toBe('walk')
  })

  it('send munchers round a hedge line through the gap a belt leaves, nibbling nothing', () => {
    const s = game()
    for (let y = 2; y <= 9; y++) if (y !== 6) s.hedge[at(9, y)] = 1
    cell(s, 9, 6, 2, 0, -1, -1)
    rebuild(s)
    const bottle = spot(s, 5, 9, 'greenBottle')
    visit(s)
    const m = s.munchers[0]!
    const events = until(s, () => m.mode === 'sit', ticks(30))
    expect(m.cell).toBe(bottle)
    expect(kinds(events, 'nibble')).toEqual([])
  })

  it('leave a stump that regrows REGROW after nobody stands on it', () => {
    const s = fenced()
    visit(s)
    const m = s.munchers[0]!
    const hedge = (m.target as { cell: number }).cell
    until(s, () => m.toward === hedge, NIBBLE_FOR + 1)
    until(s, () => m.cell !== hedge && m.toward !== hedge, ticks(5))
    const left = s.stumpAt[hedge]!
    expect(kinds(run(s, left + REGROW - s.tick), 'regrow')).toEqual([])
    expect(s.hedge[hedge]).toBe(2)
    expect(kinds(run(s, 1), 'regrow')).toEqual([{ kind: 'regrow', cell: hedge }])
    expect(s.hedge[hedge]).toBe(1)
    // A muncher standing on a stump keeps it from regrowing.
    s.hedge[at(5, 5)] = 2
    s.stumpAt[at(5, 5)] = s.tick - REGROW
    muncher(s, at(5, 5), 'caught', [])
    run(s, ticks(5))
    expect(s.hedge[at(5, 5)]).toBe(2)
  })
})

describe('sitting', () => {
  /** A bar belt west along row 8 into a green maker, bars waiting on its first two cells. */
  function barLine(): { s: State; maker: Building; cells: number[] } {
    const s = game()
    const maker = add(s, 'greenMaker', 7, 8)
    const cells = line(s, [
      [12, 8],
      [11, 8],
      [10, 8],
      [9, 8],
    ])
    rebuild(s)
    for (const c of cells.slice(0, 2)) {
      put(s, inSlot(c), 'blueBar')
      put(s, outSlot(c), 'blueBar')
    }
    return { s, maker, cells }
  }

  it('freezes its cell, starves the machine after it and every GRAB_EVERY eats what is coming in, burping home when full', () => {
    const free = barLine()
    run(free.s, ticks(5))
    expect(free.maker.held[thingIndex('blueBar')]).toBeGreaterThan(0)
    const { s, maker, cells } = barLine()
    const m = muncher(s, cells[2]!, 'sit', [])
    const moved = s.belts.moved[cells[2]!]
    const events = run(s, 4 * GRAB_EVERY + 1)
    expect(maker.held[thingIndex('blueBar')]).toBe(0)
    expect(s.belts.moved[cells[2]!]).toBe(moved)
    const p = { x: xOf(cells[2]!) + 0.5, y: yOf(cells[2]!) + 0.5 }
    expect(kinds(events, 'nom')).toEqual([0, 1, 2, 3].map(() => ({ kind: 'nom', id: m.id, thing: 'blueBar', ...p })))
    expect(kinds(events, 'burp')).toEqual([{ kind: 'burp', id: m.id, ...p }])
    expect([m.mode, m.homeWhy]).toEqual(['home', 'full'])
  })

  it('walks on to its nearest untried target after WALK_ON with nothing coming, and with none waves home', () => {
    const s = game()
    const here = spot(s, 9, 5, 'greenBottle')
    const there = spot(s, 6, 9, 'greenBottle')
    s.buildings = s.buildings.filter((b) => b.kind === 'pad')
    rebuild(s)
    const m = muncher(s, here, 'sit', [])
    run(s, WALK_ON)
    expect(m.mode).toBe('sit')
    run(s, 1)
    expect([m.mode, m.target]).toEqual(['walk', { kind: 'cell', cell: there }])
    until(s, () => m.mode === 'sit', ticks(30))
    run(s, WALK_ON)
    expect([m.mode, m.homeWhy]).toEqual(['home', 'nothing'])
  })

  it('eats off the roof stack of the machine whose spout it sits on, and never a rock', () => {
    const s = game()
    const maker = add(s, 'greenMaker', 5, 8)
    const cells = line(s, [
      [7, 8],
      [8, 8],
    ])
    rebuild(s)
    maker.stack = ['greenBottle', 'greenBottle']
    const m = muncher(s, cells[0]!, 'sit', [])
    run(s, GRAB_EVERY + 1)
    expect(m.cheeks).toEqual(['greenBottle'])
    expect(maker.stack).toEqual(['greenBottle'])
    const t = game()
    const rocks = line(t, [
      [7, 5],
      [8, 5],
      [9, 5],
    ])
    rebuild(t)
    put(t, outSlot(rocks[0]!), 'blueRock')
    const n = muncher(t, rocks[1]!, 'sit', [])
    run(t, 2 * GRAB_EVERY)
    expect(n.cheeks).toEqual([])
  })
})

describe('napping', () => {
  function napping(kind: Kind): { s: State; b: Building; m: Muncher } {
    const s = game()
    const b = busy(s, kind, 7, 8)
    return { s, b, m: napper(s, b, at(6, 8)) }
  }

  it('stops the machine for NAP_BOTTLE on a bottle maker, then takes one thing off its roof and hops home off it', () => {
    const { s, b, m } = napping('greenMaker')
    b.stack = ['greenBottle', 'greenBottle']
    expect(working(b)).toBe(false)
    expect(wants(s, b, 'blueBar')).toBe(false)
    run(s, NAP_BOTTLE)
    expect(m.mode).toBe('nap')
    const events = run(s, 1)
    expect([m.mode, m.homeWhy, m.cheeks]).toEqual(['home', 'nothing', ['greenBottle']])
    expect(b.stack).toEqual(['greenBottle'])
    expect(b.napper).toBe(-1)
    expect(kinds(events, 'napEnd')).toEqual([{ kind: 'napEnd', id: m.id, building: b.id }])
    expect(m.hop).toMatchObject({ x0: b.x + 1, y0: b.y + 1 })
    expect(working(b)).toBe(true)
  })

  it('takes the most wanted input when the roof is bare, after NAP_OTHER on the workshop or an oven, and never a rock', () => {
    const shop = napping('workshop')
    shop.b.held[thingIndex('blueBar')] = 2
    run(shop.s, NAP_OTHER + 1)
    expect(shop.m.cheeks).toEqual(['blueBar'])
    expect(shop.b.held[thingIndex('blueBar')]).toBe(1)
    const green = napping('greenMaker')
    green.b.held[thingIndex('blueBar')] = 1
    green.b.held[thingIndex('goldBar')] = 1
    run(green.s, NAP_BOTTLE + 1)
    expect(green.m.cheeks).toEqual(['goldBar'])
    const oven = napping('oven')
    oven.b.queue = ['blueRock', 'goldRock']
    run(oven.s, NAP_OTHER + 1)
    expect([oven.m.mode, oven.m.cheeks, oven.b.queue.length]).toEqual(['home', [], 2])
  })

  it('makes the burrow sleep SLEEP.perNap longer for each nap', () => {
    const s = game()
    const b = add(s, 'oven', 8, 5)
    rebuild(s)
    visit(s)
    const events = until(s, (x) => x.munchers.length === 0, NAP_OTHER + ticks(20))
    expect(kinds(events, 'napStart')).toEqual([{ kind: 'napStart', id: s.nextMuncher - 1, building: b.id }])
    expect(kinds(events, 'visitOver')).toEqual([{ kind: 'visitOver', burrow: A }])
    expect(s.lastHomeAt).toBe(s.tick - 1)
    expect(s.burrows[A]!.sleepUntil).toBe(s.lastHomeAt + SLEEP.base + SLEEP.perNap)
    expect(s.visit).toBe(null)
  })
})

describe('going home', () => {
  it('happens OUT_FOR after it left its door, whatever it is doing, unless it is caught', () => {
    const s = game()
    const m = muncher(s, spot(s, 9, 5, 'greenBottle'), 'sit', ['gear'])
    m.outAt = s.tick - OUT_FOR + 10
    m.idleSince = s.tick + ticks(100)
    const caught = muncher(s, at(9, 9), 'caught', [])
    caught.outAt = m.outAt
    s.tickles = [caught.id]
    s.tickleAt = s.tick + ticks(100)
    run(s, 10)
    expect(m.mode).toBe('sit')
    run(s, 1)
    expect([m.mode, m.homeWhy, caught.mode]).toEqual(['home', 'late', 'caught'])
  })

  it('is a straight hop at HOME_STEP, the cheeks landing on the heap, and the burrow sleeps by what the visit kept', () => {
    const s = game()
    const m = muncher(s, spot(s, 11, 8, 'gear'), 'sit', ['gear', 'blueBar', 'gear'])
    m.outAt = s.tick - OUT_FOR
    run(s, 1)
    const door = BURROWS[A]!.door
    expect(m.hop).toMatchObject({ x0: 11.5, y0: 8.5, x1: door.x, y1: door.y })
    expect(Math.abs(m.hop!.until - m.hop!.at - HOME_STEP * Math.hypot(door.x - 11.5, door.y - 8.5))).toBeLessThan(1)
    const events = until(s, (x) => x.munchers.length === 0, ticks(10))
    expect(kinds(events, 'heap').map((e) => e.thing)).toEqual(['gear', 'blueBar', 'gear'])
    expect(s.burrows[A]!.heap[thingIndex('gear')]).toBe(2)
    expect(s.burrows[A]!.sleepUntil).toBe(s.lastHomeAt + SLEEP.base + 3 * SLEEP.perKept)
  })
})

describe('tickles', () => {
  it('catch at once, at most CAUGHT_MAX, and Beep tickles them in tap order, TICKLE_FOR each', () => {
    const s = game()
    const oven = busy(s, 'oven', 7, 8)
    const ms = [muncher(s, spot(s, 10, 5, 'gear'), 'sit', ['blueBar']), napper(s, oven, at(6, 8)), muncher(s, at(9, 9), 'polite', []), muncher(s, at(11, 7), 'polite', [])]
    s.events = []
    for (const m of ms) tickle(s, m.id)
    expect(s.tickles).toEqual(ms.slice(0, CAUGHT_MAX).map((m) => m.id))
    expect(ms.map((m) => m.mode)).toEqual(['caught', 'caught', 'caught', 'polite'])
    expect(oven.napper).toBe(-1)
    expect(kinds(s.events, 'caught').length).toBe(CAUGHT_MAX)
    expect(kinds(s.events, 'tickleBusy')).toEqual([{ kind: 'tickleBusy', id: ms[3]!.id }])
    expect(s.beep).toMatchObject({ y: 5.5, pose: 'tickle', movedAt: s.tick })
    expect(Math.abs(s.beep.x - 10.5)).toBeCloseTo(0.55)
    tickle(s, ms[0]!.id)
    expect(s.tickles.length).toBe(CAUGHT_MAX)
    const legs = s.rocket.got[0]!
    run(s, TICKLE_FOR)
    expect(ms[0]!.mode).toBe('caught')
    const first = run(s, 1)
    expect([ms[0]!.mode, ms[0]!.homeWhy, ms[0]!.cheeks]).toEqual(['home', 'tickled', []])
    expect(kinds(first, 'sneeze')).toEqual([{ kind: 'sneeze', id: ms[0]!.id, x: 10.5, y: 5.5 }])
    expect(s.rocket.got[0]).toBe(legs + 1)
    const door = BURROWS[A]!.door
    expect(Math.abs(ms[0]!.hop!.until - ms[0]!.hop!.at - TICKLED_STEP * Math.hypot(door.x - 10.5, door.y - 5.5))).toBeLessThan(1)
    expect(s.tickles).toEqual([ms[1]!.id, ms[2]!.id])
    expect(s.beep.movedAt).toBe(s.tick - 1)
    run(s, TICKLE_FOR)
    expect(ms[1]!.mode).toBe('home')
    run(s, TICKLE_FOR)
    expect(ms[2]!.mode).toBe('home')
    expect(s.visit!.tickled).toBe(3)
    expect(s.tickles).toEqual([])
  })

  it('pop one in the doorway out of it, and leave one going home as it is', () => {
    const s = game()
    busy(s, 'oven', 9, 1)
    s.burrows[A]!.hunger = WAIT_AT
    run(s, HZ + WARN)
    const [m, n] = s.munchers
    tickle(s, m!.id)
    expect(m!.mode).toBe('caught')
    expect(m!.hop).toMatchObject({ x1: 11.5, y1: 4.5 })
    run(s, TICKLE_FOR + 1)
    expect(m!.mode).toBe('home')
    expect(n!.outAt).toBe(m!.outAt + HOP_OUT_EVERY)
    s.events = []
    tickle(s, m!.id)
    expect(s.events).toEqual([])
    expect(s.tickles).toEqual([])
  })

  it('make the burrow sleep SLEEP.perTickled longer for each muncher tickled', () => {
    const s = game()
    const m = muncher(s, at(11, 6), 'polite', ['gear'])
    tickle(s, m.id)
    until(s, (x) => x.munchers.length === 0, ticks(10))
    expect(s.burrows[A]!.sleepUntil).toBe(s.lastHomeAt + SLEEP.base + SLEEP.perTickled)
    expect(s.burrows[A]!.heap.every((n) => n === 0)).toBe(true)
  })
})

describe('towers', () => {
  function towers(): { s: State; t1: Building; t2: Building; sitter: Muncher; walker: Muncher } {
    const s = game()
    const t1 = add(s, 'tower', 9, 6)
    const t2 = add(s, 'tower', 9, 7)
    rebuild(s)
    for (const t of [t1, t2]) {
      t.ammo = 4
      t.held[thingIndex('bubble')] = 2
    }
    const sitter = muncher(s, spot(s, 11, 6, 'greenBottle'), 'sit', ['orangeBottle'])
    const walker = muncher(s, at(10, 6), 'walk', [])
    walker.target = { kind: 'cell', cell: at(11, 6) }
    return { s, t1, t2, sitter, walker }
  }

  it('shoot sitting munchers first, then the nearest, each tower reserving its muncher', () => {
    const { s, t1, t2, sitter, walker } = towers()
    const events = run(s, 1)
    expect(kinds(events, 'shot')).toEqual([
      { kind: 'shot', tower: t1.id, muncher: sitter.id },
      { kind: 'shot', tower: t2.id, muncher: walker.id },
    ])
    expect([sitter.shotBy, walker.shotBy]).toEqual([t1.id, t2.id])
    expect(s.shots).toEqual([
      { tower: t1.id, muncher: sitter.id, at: T, lands: T + TOWER_FLIGHT },
      { tower: t2.id, muncher: walker.id, at: T, lands: T + TOWER_FLIGHT },
    ])
    expect([t1.ammo, t1.shotAt, t1.held[thingIndex('bubble')]]).toEqual([3, T, 2])
  })

  it('land their suds TOWER_FLIGHT later: the cheeks go where wanted, it floats home in suds, the tower earns a star', () => {
    const { s, t1, sitter } = towers()
    const basket = s.basket[thingIndex('orangeBottle')]!
    run(s, TOWER_FLIGHT)
    expect(sitter.mode).toBe('sit')
    const events = run(s, 1)
    expect(kinds(events, 'suds')).toContainEqual({ kind: 'suds', id: sitter.id, x: 11.5, y: 6.5 })
    expect([sitter.mode, sitter.homeWhy, sitter.cheeks]).toEqual(['home', 'sudsed', []])
    expect(s.basket[thingIndex('orangeBottle')]).toBe(basket + 1)
    const door = BURROWS[A]!.door
    expect(Math.abs(sitter.hop!.until - sitter.hop!.at - SUDS_STEP * Math.hypot(door.x - 11.5, door.y - 6.5))).toBeLessThan(1)
    expect(t1.stars).toBe(1)
    expect(s.visit!.sent).toBe(2)
  })

  it('spend a shot of ammo a puff and a bubble every second shot, every TOWER_EVERY, only within reach', () => {
    const s = game()
    const t = add(s, 'tower', 5, 5)
    rebuild(s)
    t.ammo = 4
    t.held[thingIndex('bubble')] = 2
    const far = muncher(s, spot(s, 8, 7, 'greenBottle'), 'sit', [])
    for (const [x, y] of [
      [6, 4],
      [7, 4],
      [6, 5],
      [7, 5],
    ])
      muncher(s, spot(s, x!, y!, 'greenBottle'), 'sit', [])
    run(s, 1)
    expect([t.ammo, t.held[thingIndex('bubble')]]).toEqual([3, 2])
    run(s, TOWER_EVERY - 1)
    expect(t.ammo).toBe(3)
    run(s, 1)
    expect([t.ammo, t.held[thingIndex('bubble')]]).toEqual([2, 1])
    run(s, 2 * TOWER_EVERY + TOWER_FLIGHT)
    expect([t.ammo, t.held[thingIndex('bubble')]]).toEqual([0, 0])
    expect([far.shotBy, far.mode]).toEqual([-1, 'sit'])
    expect(t.stars).toBe(4)
  })
})

describe('bowls', () => {
  function withBowl(bars: number, setup: (s: State) => void): { s: State; bowl: Building } {
    const s = game()
    setup(s)
    const bowl = add(s, 'bowl', 10, 4)
    rebuild(s)
    bowl.held[thingIndex('goldBar')] = bars
    return { s, bowl }
  }

  it('give a muncher that finds two gold bars a picnic, and the burrow\'s first makes it a friend whose heap flies home', () => {
    const { s, bowl } = withBowl(2, () => {})
    s.burrows[A]!.heap[thingIndex('blueBar')] = 2
    s.burrows[A]!.hunger = WAIT_AT
    const legs = s.rocket.got[0]!
    const events = until(s, (x) => x.munchers.some((m) => m.mode === 'picnic'), ticks(20))
    const m = s.munchers[0]!
    expect(kinds(events, 'picnic')).toEqual([{ kind: 'picnic', id: m.id, burrow: A }])
    expect(kinds(events, 'friend')).toEqual([{ kind: 'friend', burrow: A }])
    expect(bowl.held[thingIndex('goldBar')]).toBe(0)
    expect(s.burrows[A]!.friend).toBe(true)
    expect(s.burrows[A]!.heap[thingIndex('blueBar')]).toBe(0)
    expect(s.rocket.got[0]).toBe(legs + 2)
    run(s, PICNIC_FOR)
    expect([m.mode, m.homeWhy]).toEqual(['home', 'fed'])
    until(s, (x) => x.munchers.length === 0, ticks(5))
    expect(s.burrows[A]!.sleepUntil).toBe(s.lastHomeAt + SLEEP.base + SLEEP.perSent)
  })

  it('make one that finds the bowl empty peer in and shrug for SHRUG_FOR, then go looking for fizz', () => {
    const { s } = withBowl(1, () => {})
    const bottle = spot(s, 5, 9, 'greenBottle')
    s.burrows[A]!.hunger = WAIT_AT
    const events = until(s, (x) => kinds(x.events, 'shrug').length > 0, ticks(20))
    const m = s.munchers[0]!
    expect(kinds(events, 'shrug')).toEqual([{ kind: 'shrug', id: m.id }])
    expect([m.mode, m.hop, m.modeAt]).toEqual(['bowl', null, s.tick - 1])
    run(s, SHRUG_FOR - 1)
    expect(m.mode).toBe('bowl')
    run(s, 1)
    expect([m.mode, m.target]).toEqual(['walk', { kind: 'cell', cell: bottle }])
  })

  it('feed the first of two munchers with two bars, and the second shrugs', () => {
    const { s } = withBowl(2, (x) => busy(x, 'oven', 9, 1))
    s.burrows[A]!.hunger = WAIT_AT
    const events = until(s, (x) => x.munchers.length === 2 && x.munchers.every((m) => m.mode !== 'peek' && (m.mode !== 'bowl' || m.hop === null)), ticks(20))
    expect(kinds(events, 'picnic').map((e) => e.id)).toEqual([s.munchers[0]!.id])
    expect(kinds(events, 'shrug').map((e) => e.id)).toEqual([s.munchers[1]!.id])
  })
})

describe('the parent\'s switch', () => {
  it('Polite: they sit beside the bottle line eating nothing and go home after POLITE_FOR', () => {
    const s = game()
    s.switches.munchers = 'polite'
    const bottle = spot(s, 10, 5, 'greenBottle')
    visit(s)
    const m = s.munchers[0]!
    const events = until(s, () => m.mode === 'polite', ticks(10))
    expect(s.belts.out[m.cell]).toBe(-1)
    expect(manhattan(m.cell, bottle)).toBe(1)
    run(s, POLITE_FOR - 1)
    expect(m.mode).toBe('polite')
    run(s, 1)
    expect([m.mode, m.homeWhy, m.cheeks]).toEqual(['home', 'late', []])
    expect(kinds(events, 'nom')).toEqual([])
  })

  it('Polite mid-visit gets a sitter up off its belt and a napper down off its roof', () => {
    const s = game()
    const bottle = spot(s, 10, 5, 'greenBottle')
    const sitter = muncher(s, bottle, 'sit', [])
    const maker = busy(s, 'greenMaker', 7, 8)
    const nap = napper(s, maker, at(6, 8))
    s.switches.munchers = 'polite'
    run(s, 1)
    expect(sitter.mode).toBe('walk')
    expect(s.belts.out[(sitter.target as { cell: number }).cell]).toBe(-1)
    expect([nap.mode, maker.napper]).toEqual(['out', -1])
    until(s, () => sitter.mode === 'polite', ticks(10))
  })

  it('Many again sends a polite muncher off to eat', () => {
    const s = game()
    const bottle = spot(s, 10, 5, 'greenBottle')
    const m = muncher(s, at(11, 5), 'polite', [])
    s.switches.munchers = 'polite'
    run(s, ticks(1))
    expect(m.mode).toBe('polite')
    s.switches.munchers = 'many'
    run(s, 1)
    expect([m.mode, m.target]).toEqual(['walk', { kind: 'cell', cell: bottle }])
  })

  it('Few mid-visit keeps the first muncher of the visit out and sends the rest home, as a visit under Few is one muncher', () => {
    const s = game()
    const bottle = spot(s, 10, 5, 'greenBottle')
    const first = muncher(s, bottle, 'sit', [])
    const maker = busy(s, 'greenMaker', 7, 8)
    const nap = napper(s, maker, at(6, 8))
    s.switches.munchers = 'few'
    run(s, 1)
    expect(first.mode).toBe('sit')
    expect([nap.mode, nap.homeWhy, maker.napper]).toEqual(['home', 'late', -1])
  })

  it('None: the burrows snore all game and everyone out goes home', () => {
    const s = game()
    s.switches.munchers = 'none'
    const m = muncher(s, at(9, 9), 'polite', [])
    s.burrows[A]!.hunger = WAIT_AT
    run(s, ticks(3))
    expect([m.mode, m.homeWhy]).toEqual(['home', 'late'])
    run(s, ticks(100))
    expect(s.munchers).toEqual([])
    expect(s.burrows[A]!.hunger).toBe(0)
    expect(listening(s, A)).toBe(false)
  })
})

describe('Good night', () => {
  it('sends every muncher out home, sneezing its cheeks back and yawning, and no visit comes at night', () => {
    const s = game()
    const sitter = muncher(s, spot(s, 10, 5, 'greenBottle'), 'sit', ['blueBar'])
    const maker = busy(s, 'greenMaker', 7, 8)
    const nap = napper(s, maker, at(6, 8))
    s.night = { at: s.tick, kind: 'oven', kindAt: s.tick, doneAt: -1 }
    const legs = s.rocket.got[0]!
    s.events = []
    goodnightHome(s)
    expect(kinds(s.events, 'sneeze').map((e) => e.id)).toEqual([sitter.id, nap.id])
    expect(s.munchers.map((m) => [m.mode, m.homeWhy])).toEqual([
      ['home', 'night'],
      ['home', 'night'],
    ])
    expect(s.rocket.got[0]).toBe(legs + 1)
    expect(maker.napper).toBe(-1)
    run(s, ticks(20))
    expect(s.munchers).toEqual([])
    s.burrows[A]!.sleepUntil = -1
    s.burrows[A]!.hunger = WAIT_AT
    run(s, ticks(100))
    expect(s.munchers).toEqual([])
    expect(s.burrows[A]!.hunger).toBe(WAIT_AT)
  })
})

describe('the launch', () => {
  it('sends everyone home once the rocket is full with Fuel! found, then a watcher from every burrow to sit by the pad until it lands', () => {
    const s = game()
    s.land = 3
    s.found = ALL
    for (const i of [1, 2]) s.burrows[i]!.helloAt = s.tick - HELLO_SLEEP - ticks(100)
    const m = muncher(s, at(9, 9), 'polite', [])
    s.rocket.got = [20, 30, 10, 40]
    run(s, 1)
    expect([m.mode, m.homeWhy]).toEqual(['home', 'late'])
    until(s, (x) => x.visit === null, ticks(10))
    s.launch = { at: s.tick, landsAt: s.tick + LAUNCH_FOR }
    const tower = add(s, 'tower', 3, 8)
    rebuild(s)
    tower.ammo = 4
    run(s, 1)
    const watchers = [...s.munchers]
    expect(watchers.map((w) => [w.burrow, w.mode, w.cell])).toEqual([
      [0, 'watch', at(1, 7)],
      [1, 'watch', at(2, 7)],
      [2, 'watch', at(3, 7)],
    ])
    for (const w of watchers) {
      expect(PAD_RING.has(w.cell)).toBe(true)
      expect(w.hop!.until - w.hop!.at).toBeLessThanOrEqual(COUNT_AT)
    }
    tickle(s, watchers[0]!.id)
    expect(s.tickles).toEqual([])
    run(s, LAUNCH_FOR - 2)
    expect(s.munchers.map((w) => [w.mode, w.hop])).toEqual(watchers.map(() => ['watch', null]))
    expect([tower.ammo, s.visit]).toEqual([4, null])
    s.launch = null
    s.launches = 1
    s.rocket.got = [0, 0, 0, 0]
    run(s, 1)
    expect(watchers.map((w) => [w.mode, w.homeWhy])).toEqual(watchers.map(() => ['home', 'late']))
    const events = until(s, (x) => x.munchers.length === 0, ticks(30))
    expect(kinds(events, 'visitOver')).toEqual([])
    expect(s.lastHomeAt).toBe(s.tick - 1)
  })
})

describe('edits', () => {
  it('make one standing where a sticker comes down hop aside with a giggle, then go on', () => {
    const s = game()
    const bottle = spot(s, 10, 5, 'greenBottle')
    const m = muncher(s, bottle, 'sit', [])
    add(s, 'tower', 10, 5)
    rebuild(s)
    s.events = []
    afterEdit(s)
    expect(m.mode).toBe('out')
    expect(kinds(s.events, 'giggle')).toEqual([{ kind: 'giggle', id: m.id, x: 10.5, y: 5.5 }])
    expect(m.cell).toBe(at(10, 4))
    run(s, ticks(1))
    expect(m.mode).not.toBe('out')
  })

  it('make a sitter whose belt was rolled up walk on, and a napper whose machine Oops took hop down', () => {
    const s = game()
    const here = spot(s, 10, 5, 'greenBottle')
    const there = spot(s, 6, 9, 'greenBottle')
    const m = muncher(s, here, 'sit', [])
    const maker = busy(s, 'greenMaker', 7, 2)
    const nap = napper(s, maker, at(6, 2))
    s.belts.in[here] = -1
    s.belts.out[here] = -1
    s.belts.slot[outSlot(here)] = -1
    s.buildings = s.buildings.filter((x) => x !== maker)
    rebuild(s)
    afterEdit(s)
    expect([m.mode, m.target]).toEqual(['walk', { kind: 'cell', cell: there }])
    expect(nap.mode).toBe('out')
    expect(nap.hop).not.toBe(null)
  })

  it('let a nibbler go on through an edit that changes nothing for it, and stop it when its hedge goes', () => {
    const s = fenced()
    visit(s)
    const m = s.munchers[0]!
    const since = m.modeAt
    const hedge = (m.target as { cell: number }).cell
    cell(s, 5, 5, 2, 0, -1, -1)
    rebuild(s)
    afterEdit(s)
    expect([m.mode, m.modeAt]).toEqual(['nibble', since])
    s.hedge[hedge] = 0
    afterEdit(s)
    expect([m.mode, m.toward]).toEqual(['walk', hedge])
  })

  it('let a nibbler whose hedge she takes back with nothing opened behind it step into the gap and nibble the next hedge, by the peel, a peel drag, Oops and a stroke', () => {
    // Land 2 with burrow B's fence from the hint's blueprint round its west side and top, the corner (13, 10) planted last by her hedge tool so Oops can take it back. B's muncher on its door cell (14, 10) nibbles the corner: behind it stand the tree at (12, 10), closed land at (13, 11) and the fence's next hedge at (13, 9).
    const s = game()
    s.land = 2
    s.found = ALL.slice(0, 7)
    for (const [x, y] of [[13, 7], [14, 7], [15, 7], [13, 8], [13, 9]] as const) s.hedge[at(x, y)] = 1
    spot(s, 5, 9, 'greenBottle')
    const corner = at(13, 10)
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    act(s, { kind: 'tap', hit: { kind: 'flowers', cell: corner } })
    expect(s.hedge[corner]).toBe(1)
    s.burrows[1]!.hunger = WAIT_AT
    until(s, settled, ticks(20))
    const nibbler = s.munchers[0]!
    expect([nibbler.burrow, nibbler.cell, nibbler.mode, nibbler.target]).toEqual([1, at(14, 10), 'nibble', { kind: 'cell', cell: corner }])
    const ways: Record<string, (t: State) => void> = {
      peel: (t) => {
        act(t, { kind: 'tool', tool: { kind: 'peel' } })
        act(t, { kind: 'tap', hit: { kind: 'hedge', cell: corner } })
      },
      'peel drag': (t) => {
        act(t, { kind: 'tool', tool: { kind: 'peel' } })
        act(t, { kind: 'drag', cells: [corner] })
        act(t, { kind: 'release', commit: true })
      },
      oops: (t) => act(t, { kind: 'oops' }),
      stroke: (t) => {
        act(t, { kind: 'drag', cells: [corner, at(14, 10)] })
        act(t, { kind: 'release', commit: true })
      },
    }
    for (const [how, takeBack] of Object.entries(ways)) {
      const t = cloneState(s)
      run(t, ticks(2))
      takeBack(t)
      expect(t.hedge[corner], how).toBe(0)
      const m = t.munchers.find((x) => x.id === nibbler.id)!
      expect(m.mode, how).toBe('walk')
      // Through the gap onto the corner, then the next hedge: never a nibble of a hedge that is gone.
      until(t, () => m.mode === 'nibble', 2 * WALK_STEP)
      expect([m.cell, m.target], how).toEqual([corner, { kind: 'cell', cell: at(13, 9) }])
      run(t, NIBBLE_FOR + 1)
      expect(t.hedge[at(13, 9)], how).toBe(2)
      expect(m.mode, how).toBe('walk')
    }
  })
})

describe('the board', () => {
  it('lets a muncher from every burrow\'s door reach the factory\'s core (the cells round the start oven and the pad\'s ring) on the empty board of the land that opens it', () => {
    BURROWS.forEach((site, i) => {
      const s = blankState(1)
      s.land = site.land
      rebuild(s)
      const door = doorCell(s, i)
      expect(GROUND[door]).not.toBe('burrow')
      const d = walkDistances(s, door, false)
      const w = LANDS[s.land]
      const open = (c: number) => xOf(c) >= w.x0 && xOf(c) <= w.x1 && yOf(c) >= w.y0 && yOf(c) <= w.y1 && s.owner[c]! < 0 && !PAD_RING.has(c) && GROUND[c] !== 'pond' && GROUND[c] !== 'tree' && GROUND[c] !== 'burrow'
      const oven = s.buildings.find((b) => b.kind === 'oven')!.id
      const core: number[] = []
      for (let c = 0; c < CELLS; c++)
        if (
          open(c) &&
          DIRS.some((dir) => {
            const n = stepCell(c, dir)
            return n >= 0 && (PAD_RING.has(n) || s.owner[n] === oven)
          })
        )
          core.push(c)
      expect(core.length).toBeGreaterThan(15)
      expect(core.filter((c) => d[c]! < 0)).toEqual([])
    })
  })

  it('keeps the munchers whole through random factories, edits, tickles, switches and nights', () => {
    const kinds: Kind[] = ['oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'tower', 'bowl']
    for (let seed = 1; seed <= 8; seed++) {
      const r = rng(seed)
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
      const s = game()
      s.land = pick([1, 2, 3] as const)
      s.found = ALL.slice(0, 9)
      s.burrows[A]!.visits = pick([0, 1])
      const fits = (x: number, y: number, k: number) => {
        for (let j = y; j < y + k; j++)
          for (let i = x; i < x + k; i++) if (i >= 20 || j >= 12 || s.owner[at(i, j)]! >= 0 || PAD_RING.has(at(i, j)) || GROUND[at(i, j)] === 'burrow' || s.belts.out[at(i, j)]! >= 0) return false
        return true
      }
      /** A building of a random kind at a random spot where it fits; false when it fits nowhere it tried. */
      const place = (): boolean => {
        const kind = pick(kinds)
        const x = Math.floor(r() * 20)
        const y = Math.floor(r() * 12)
        if (!fits(x, y, SIZE[kind])) return false
        const b = add(s, kind, x, y)
        if (kind === 'bowl') b.held[thingIndex('goldBar')] = Math.floor(r() * 5)
        if (kind === 'tower') b.ammo = 4
        if (kind === 'tower') b.held[thingIndex('bubble')] = 2
        if (kind !== 'tower' && kind !== 'bowl' && kind !== 'lab') b.stack = [pick(THINGS)]
        rebuild(s)
        return true
      }
      /** A straight belt of a few cells from a random cell a random way, things on some of them; false when not one cell fitted. */
      const belt = (): boolean => {
        let c = Math.floor(r() * CELLS)
        const d = pick(DIRS)
        let laid = false
        for (let j = 0; j < 2 + Math.floor(r() * 5); j++) {
          const n = stepCell(c, d)
          if (n < 0 || s.owner[c]! >= 0 || s.owner[n]! >= 0 || s.belts.out[c]! >= 0 || s.hedge[c] !== 0) break
          cell(s, xOf(c), yOf(c), ((d + 2) % 4) as Dir, d, -1, -1)
          if (r() < 0.6) put(s, outSlot(c), pick(THINGS))
          laid = true
          c = n
        }
        rebuild(s)
        return laid
      }
      for (let k = 0; k < 16; k++) place()
      for (let k = 0; k < 16; k++) belt()
      s.burrows.forEach((b) => (b.hunger = 900 + Math.floor(r() * 99)))
      const broken: string[] = []
      for (let t = 0; t < ticks(150); t++) {
        const c = Math.floor(r() * CELLS)
        let edited = false
        if (s.munchers.length > 0 && r() < 0.0005) tickle(s, pick(s.munchers).id)
        if (r() < 0.002) edited = place()
        else if (r() < 0.002) edited = belt()
        else if (r() < 0.002 && s.buildings.length > 2) {
          s.buildings.splice(2 + Math.floor(r() * (s.buildings.length - 2)), 1)
          rebuild(s)
          edited = true
        } else if (r() < 0.002 && s.owner[c]! < 0 && s.belts.out[c]! < 0 && !PAD_RING.has(c)) {
          s.hedge[c] = s.hedge[c] === 0 ? 1 : 0
          edited = true
        } else if (r() < 0.002 && s.belts.out[c]! >= 0 && s.owner[c]! < 0) {
          s.belts.out[c] = -1
          s.belts.in[c] = -1
          s.belts.slot[inSlot(c)] = -1
          s.belts.slot[outSlot(c)] = -1
          rebuild(s)
          edited = true
        } else if (r() < 0.0002) s.switches.munchers = pick(MUNCHER_MODES)
        else if (r() < 0.0001 && s.night === null) {
          s.night = { at: s.tick, kind: null, kindAt: -1, doneAt: -1 }
          goodnightHome(s)
        } else if (r() < 0.002 && s.night !== null) s.night = null
        if (edited) afterEdit(s)
        run(s, 1)
        const bad = (what: string) => broken.push(`seed ${seed} tick ${s.tick}: ${what}`)
        for (const m of s.munchers) {
          if (s.buildings.filter((b) => b.napper === m.id).length !== (m.mode === 'nap' ? 1 : 0)) bad(`m${m.id} ${m.mode} and the nappers`)
          if (m.mode === 'sit' && (s.belts.out[m.cell]! < 0 || s.owner[m.cell]! >= 0)) bad(`m${m.id} sits off a belt`)
          if ((m.mode === 'peek' || m.mode === 'out' || m.mode === 'home') && m.hop === null) bad(`m${m.id} ${m.mode} with no hop`)
          if (m.toward !== m.cell && m.hop === null && manhattan(m.toward, m.cell) !== 1) bad(`m${m.id} steps two cells`)
          if (m.cheeks.length > (m.scout ? SCOUT_CHEEKS : CHEEKS)) bad(`m${m.id} cheeks`)
        }
        for (const b of s.buildings) if (b.napper !== -1 && s.munchers.find((m) => m.id === b.napper)?.mode !== 'nap') bad(`building ${b.id} napped by nobody`)
        if (s.tickles.length > CAUGHT_MAX || s.tickles.some((id) => s.munchers.find((m) => m.id === id)?.mode !== 'caught')) bad(`tickles ${s.tickles}`)
        if (s.visit === null && s.munchers.some((m) => m.mode !== 'home')) bad('munchers out with no visit')
        if (t % 600 === 0) for (const i of [0, 1, 2]) pawsOf(s, i)
      }
      expect(broken).toEqual([])
    }
  })

  it('steps the same way from a copy of the state', () => {
    const s = game()
    busy(s, 'oven', 9, 1)
    spot(s, 10, 5, 'greenBottle')
    spot(s, 5, 9, 'gear')
    s.hedge[at(9, 7)] = 1
    s.burrows[A]!.hunger = WAIT_AT
    const t = cloneState(s)
    run(s, ticks(40))
    run(t, ticks(40))
    expect(t.munchers).toEqual(s.munchers)
    expect(t.burrows).toEqual(s.burrows)
    expect(s.munchers.length).toBeGreaterThan(0)
  })
})
