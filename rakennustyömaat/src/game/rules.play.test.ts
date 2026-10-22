/**
 * Whole sessions through the rules: the economy of scripted trips, a child who is never
 * stuck, and a seeded fuzz of random actions and taps that checks the state's invariants.
 * Trips here are driven by hand (the goods a road holds dropped in the bed as road.ts
 * credits them), so the economy is the catalog's numbers whatever a road's layout; the fuzz
 * also holds the pedal down and lets the real road credit what it lays out.
 */
import { describe, expect, it } from 'vitest'

import { HOME_COLS, HOUSE_GRID, PRESENT_GEMS, RECIPES, SHAPE_SIZE, roomCost, themeOpen } from './catalog'
import { placePoint } from './flights'
import { ITEMS, ITEM_IDS } from './items'
import { slotsOf, targets, validSpots } from './layout'
import {
  BAGS,
  BOULDER_ROCKS,
  GOODS,
  HAIRS,
  MACHINES,
  MATERIALS,
  MAX_PLOTS,
  PARTS,
  RAWS,
  ROAD_KINDS,
  SHAPES,
  SHIRTS,
  THEMES,
  WEAR_COLORS,
  ticks,
  type Action,
  type EventKind,
  type Hit,
  type Look,
  type Raw,
  type RoadDef,
  type RoadKind,
  type Shape,
  type State,
} from './model'
import { freshKeep } from './progress'
import { rng } from './random'
import { makeRoad } from './road'
import { HOME_BEAT, UNDO_LOOKS, act, cloneState, createState, offered, step, unloading } from './rules'

const steps = (s: State, n: number) => {
  for (let k = 0; k < n; k++) step(s)
}
const tap = (s: State, hit: Hit) => act(s, { kind: 'tap', hit })
/** Back to the street from any screen, as a child would get there: awake, a question closed, the road home, zoomed out, and the truck back in the yard with its load out. */
function toStreet(s: State): void {
  if (s.night !== null) act(s, { kind: 'wake' })
  for (let k = 0; k < 4 && (s.shot.kind !== 'street' || s.ask !== null); k++) {
    act(s, { kind: 'back' })
    if (s.road !== null) steps(s, ticks(HOME_BEAT) + 1)
  }
  while (unloading(s)) step(s)
  expect(s.shot.kind).toBe('street')
  expect(s.ask).toBeNull()
}

// ---------------------------------------------------------------------------------------
// The economy

/**
 * The raw goods on `def` as road.ts credits them to a truck that takes everything: its
 * pickups, its boulders' rocks and hidden gems, the balloon's gem, and the ramp's gem at its
 * foot for a slow truck or its arc's three for a fast one.
 */
function haul(def: RoadDef, fast: boolean): Raw[] {
  return def.things.flatMap((t): Raw[] => {
    if (t.kind === 'pickup') return [t.good]
    if (t.kind === 'boulder') return [...Array<Raw>(BOULDER_ROCKS[t.size]).fill('rock'), ...(t.gem ? (['gem'] as const) : [])]
    if (t.kind === 'surprise' && t.what === 'balloon') return ['gem']
    if (t.kind === 'ramp') return Array<Raw>(fast ? 3 : 1).fill('gem')
    return []
  })
}

/** A trip driven by hand: the truck tapped (and the road picked), everything on the road the rules laid out dropped in the bed, Home, and the beat until the street. */
function drive(s: State, kind: RoadKind, fast: boolean): void {
  toStreet(s)
  tap(s, { kind: 'truck' })
  if (s.ask !== null) act(s, { kind: 'road', road: kind })
  const road = s.road!
  for (const g of haul(road.def, fast)) {
    road.bed.push(g)
    s.keep.goods[g]++
  }
  road.present = true
  act(s, { kind: 'home' })
  steps(s, ticks(HOME_BEAT) + 1)
  expect(s.road).toBeNull()
}

/** The yard: every crate hit open, every machine with goods run until its heap is empty. */
function yard(s: State): void {
  toStreet(s)
  for (const m of MACHINES) while (s.keep.machines[m] === 'crate') tap(s, { kind: 'machine', m })
  for (const m of MACHINES) if (s.keep.goods[RECIPES[m].takes] > 0) tap(s, { kind: 'machine', m })
  while (MACHINES.some((m) => s.machines[m].on)) steps(s, 10)
}

/**
 * Builds rooms the way a child might, through the real taps (the plot, the house card, the
 * picks, a spot, the crane, the theme card): wishing for `wishes` in turn, each in the
 * material there is most of. A `spender` who cannot have the wish builds the biggest room
 * that material pays for, until nothing pays; anyone else keeps the goods for the next trip.
 * Returns how many rooms were built.
 */
function buildAll(s: State, wishes: readonly Shape[], spender: boolean, turn: { n: number; house: number }): number {
  const keep = s.keep
  for (let built = 0; ; built++) {
    const material = MATERIALS.reduce((a, b) => (keep.goods[b] > keep.goods[a] ? b : a))
    const fits = (shape: Shape) => keep.goods[material] >= roomCost(shape) && keep.plots.some((p) => p.kind === null || validSpots(p, shape).length > 0)
    const wish = wishes[turn.n % wishes.length]!
    const shape = fits(wish) ? wish : spender ? [...SHAPES].sort((a, b) => roomCost(b) - roomCost(a)).find(fits) : undefined
    if (shape === undefined) return built
    const plot = keep.plots.findIndex((p) => p.kind === null || validSpots(p, shape).length > 0)
    toStreet(s)
    tap(s, { kind: 'plot', plot })
    if (s.ask !== null && s.ask.kind === 'house') act(s, { kind: 'house', house: turn.house++ % 2 === 0 ? 'tall' : 'row' })
    act(s, { kind: 'material', material })
    act(s, { kind: 'shape', shape })
    const spot = validSpots(keep.plots[plot]!, shape)[0]!
    const hit: Hit = { kind: 'spot', plot, col: spot.col, row: spot.row }
    expect(offered(s, hit)).toBe(true)
    const before = keep.goods[material]
    tap(s, hit)
    expect(keep.goods[material]).toBe(before - roomCost(shape))
    steps(s, ticks(2.1))
    const open = THEMES.filter((t) => themeOpen(keep.unlocked, t))
    if (s.ask !== null && s.ask.kind === 'theme') act(s, { kind: 'theme', theme: open[turn.n % open.length]! })
    turn.n++
  }
}

/** The street is full: every plot has its house, and not even a small room fits on one. */
const full = (s: State) => s.keep.plots.length === MAX_PLOTS && s.keep.plots.every((p) => p.kind !== null && validSpots(p, 'small').length === 0)

/** Rooms built after each trip of a session on a fresh keep, the training road first and then the three roads in turn, until the street is full (`fullAt`, the trip that filled it) or `trips` are driven (`fullAt` -1). */
function session(trips: number, wishes: readonly Shape[], spender: boolean, fast: boolean): { rooms: number[]; fullAt: number } {
  const s = createState(freshKeep(), 11, false)
  const turn = { n: 0, house: 0 }
  const rooms: number[] = []
  for (let trip = 1; trip <= trips; trip++) {
    drive(s, ROAD_KINDS[(trip + 1) % ROAD_KINDS.length]!, fast)
    yard(s)
    rooms.push(buildAll(s, wishes, spender, turn))
    if (full(s)) return { rooms, fullAt: trip }
  }
  return { rooms, fullAt: -1 }
}
const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('the economy', () => {
  it('brings about sixteen raw goods a trip, and two more through the ramp’s arc', () => {
    for (const kind of ROAD_KINDS) {
      const defs = Array.from({ length: 550 }, (_, k) => makeRoad(kind, 2 + (k % 11), k))
      const slow = average(defs.map((def) => haul(def, false).length))
      expect(slow, kind).toBeGreaterThanOrEqual(15)
      expect(slow, kind).toBeLessThanOrEqual(18)
      expect(average(defs.map((def) => haul(def, true).length)) - slow, kind).toBeCloseTo(2)
    }
  })

  it('pays for about five rooms a trip for a child who spends everything, whatever they wish for, and fills the street around trip eleven', { timeout: 20_000 }, () => {
    // Sixteen goods in five materials make rooms of every size, with small ones from the odd goods; the six plots hold 81 cells, 162 goods. Each wish once, the ramp flown over and rolled off in turn.
    for (const [wishes, fast] of [
      [SHAPES, true],
      [['big'], false],
      [['small', 'big'], true],
    ] as const) {
      const { rooms, fullAt } = session(14, wishes, true, fast)
      const name = `${wishes} ${fast ? 'fast' : 'slow'}: ${rooms}`
      expect(fullAt, name).toBeGreaterThanOrEqual(10)
      expect(fullAt, name).toBeLessThanOrEqual(12)
      const before = rooms.slice(0, -1)
      expect(Math.min(...before), name).toBeGreaterThan(0)
      expect(average(before.slice(1)), name).toBeGreaterThanOrEqual(4)
      expect(average(before.slice(1)), name).toBeLessThanOrEqual(7)
    }
  })

  it('builds about four two-cell rooms a trip for a child who keeps the odd goods, the first from the training road', () => {
    for (const fast of [false, true]) {
      const { rooms } = session(7, ['wide', 'tall'], false, fast)
      expect(Math.min(...rooms), `${rooms}`).toBeGreaterThan(0)
      expect(average(rooms.slice(1)), `${rooms}`).toBeGreaterThanOrEqual(3.5)
      expect(average(rooms.slice(1)), `${rooms}`).toBeLessThanOrEqual(5)
    }
  })
})

// ---------------------------------------------------------------------------------------
// Never stuck, and the fuzz

/**
 * Follows the hint the way a child would from wherever the state is (`s` is changed): back
 * to the street, then the bouncing thing tapped and its question answered, a room placed
 * where the hint is a house. True when that changed the keep or started a trip.
 */
function followHint(s: State): boolean {
  toStreet(s)
  step(s)
  const before = JSON.stringify(s.keep)
  const hint = s.hint!
  expect(hint, 'a hint on the street').not.toBeNull()
  expect(offered(s, hint), JSON.stringify(hint)).toBe(true)
  tap(s, hint)
  if (hint.kind === 'machine') for (let k = 0; k < 3 && s.keep.machines[hint.m] === 'crate'; k++) tap(s, hint)
  if (s.ask !== null && s.ask.kind === 'road') act(s, { kind: 'road', road: 'beach' })
  if (s.ask !== null && s.ask.kind === 'house') act(s, { kind: 'house', house: 'row' })
  if (hint.kind === 'plot') {
    act(s, { kind: 'material', material: MATERIALS.find((m) => s.keep.goods[m] >= roomCost('small'))! })
    act(s, { kind: 'shape', shape: 'small' })
    act(s, { kind: 'hand', on: false })
    const spot = targets(s).find((t) => t.hit.kind === 'spot')
    expect(spot, 'a spot to build on').toBeDefined()
    tap(s, spot!.hit)
  }
  return s.road !== null || JSON.stringify(s.keep) !== before
}

const LOOK_FIELDS = Object.keys(freshKeep().look) as (keyof Look)[]
/** Hits the shell could send that are often not on screen: the rules must ignore them unless offered. */
const STRAY: readonly Hit[] = [
  { kind: 'none' }, { kind: 'ground', x: 30 }, { kind: 'truck' }, { kind: 'mirror' }, { kind: 'builder' }, { kind: 'present' }, { kind: 'boulder' },
  { kind: 'crosser', i: 0 }, { kind: 'part', part: 'hat' }, { kind: 'machine', m: 'oven' }, { kind: 'plot', plot: 4 }, { kind: 'roof', plot: 0 }, { kind: 'door', plot: 1 },
  { kind: 'spot', plot: 0, col: 1, row: 3 }, { kind: 'spot', plot: 1, col: 0, row: 0 }, { kind: 'room', plot: 0, room: 999 }, { kind: 'item', plot: 0, room: 1, slot: 9 },
]

/** One random action: mostly a tap on something on screen, else a stray hit, a press or any HUD button with any value; in a house now and then the hand, and a lifted room tapped again to send it back. */
function randomAction(s: State, r: () => number): Action {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
  const q = s.ask
  if (q !== null && r() < 0.6) {
    if (q.kind === 'house') return { kind: 'house', house: r() < 0.5 ? 'tall' : 'row' }
    if (q.kind === 'road') return { kind: 'road', road: pick(ROAD_KINDS) }
    return { kind: 'theme', theme: pick(THEMES) }
  }
  if (s.hint !== null && r() < 0.2) return { kind: 'tap', hit: s.hint }
  const shot = s.shot
  if (shot.kind === 'plot' && s.lifted >= 0 && r() < 0.5) return { kind: 'tap', hit: { kind: 'room', plot: shot.plot, room: s.lifted } }
  if (shot.kind === 'plot' && !s.hand && r() < 0.05) return { kind: 'hand', on: true }
  const u = r()
  const on = targets(s)
  if (u < 0.5 && on.length > 0) return { kind: 'tap', hit: pick(on).hit }
  if (u < 0.56) return { kind: 'tap', hit: pick(STRAY) }
  if (u < 0.6) return { kind: 'press', hit: r() < 0.3 || on.length === 0 ? null : pick(on).hit }
  if (u < 0.601) return { kind: 'fresh' }
  if (u < 0.61) return { kind: 'goodnight' }
  const hud: Action[] = [
    { kind: 'pedal', down: r() < 0.7 }, { kind: 'push' }, { kind: 'horn' }, { kind: 'whack' }, { kind: 'back' }, { kind: 'home' }, { kind: 'mirror' },
    { kind: 'tab', part: pick(PARTS) }, { kind: 'go' }, { kind: 'dice' }, { kind: 'undoDice' }, { kind: 'house', house: r() < 0.5 ? 'tall' : 'row' },
    { kind: 'road', road: pick(ROAD_KINDS) }, { kind: 'theme', theme: r() < 0.15 ? null : pick(THEMES) }, { kind: 'askTheme' },
    { kind: 'material', material: pick(MATERIALS) }, { kind: 'shape', shape: pick(SHAPES) }, { kind: 'hand', on: r() < 0.4 }, { kind: 'item', item: pick(ITEM_IDS) },
    { kind: 'paint', what: r() < 0.5 ? 'wall' : 'floor' }, { kind: 'doorbell' }, { kind: 'roof' }, { kind: 'pan', x: -20 + r() * 220 }, { kind: 'wake' },
    { kind: 'sound', on: r() < 0.5 }, { kind: 'music', on: r() < 0.5 },
    { kind: 'wear', patch: { [pick(LOOK_FIELDS)]: pick<unknown>([...HAIRS, ...SHIRTS, ...WEAR_COLORS, ...BAGS, 'none', 'zebra', 3, 99]) } as Partial<Look> },
  ]
  return pick(hud)
}

/** Every number anywhere in the state is finite; the paths of those that are not. */
function infinite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`)
  } else if (ArrayBuffer.isView(v)) {
    if (!(v as Float32Array).every(Number.isFinite)) out.push(`${path} has a number that is not finite`)
  } else if (Array.isArray(v)) v.forEach((x, i) => infinite(x, `${path}[${i}]`, out))
  else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) infinite(x, `${path}.${k}`, out)
}

/** What breaks the invariants, as sentences: whole goods that add up to what came in, rooms that fit and rest on something, one plot waiting, and a state whose every reference holds. */
function broken(s: State, credited: number): string[] {
  const out: string[] = []
  const fail = (ok: boolean, what: string) => ok || out.push(what)
  const keep = s.keep
  for (const g of GOODS) fail(Number.isInteger(keep.goods[g]) && keep.goods[g] >= 0, `${g} is ${keep.goods[g]}`)
  const spent = keep.plots.reduce((n, p) => n + p.rooms.reduce((m, r) => m + roomCost(r.shape), 0), 0)
  const kept = GOODS.reduce((n, g) => n + keep.goods[g], 0) + spent
  fail(kept === credited, `${kept} goods kept and built with, ${credited} came in`)
  fail(keep.plots.length <= MAX_PLOTS, `${keep.plots.length} plots`)
  fail(keep.plots.length === MAX_PLOTS || keep.plots.at(-1)!.rooms.length === 0, 'no empty plot waiting')
  for (const per of [s.partyAt, s.rev, s.plotAt, s.roofAt]) fail(per.length === keep.plots.length, 'a per-plot list the wrong length')
  const ids = new Set<number>()
  keep.plots.forEach((p, plot) => {
    if (p.kind === null) {
      fail(p.rooms.length === 0, `plot ${plot} has rooms and no house`)
      return
    }
    const grid = HOUSE_GRID[p.kind]
    const cells = new Set<string>()
    for (const r of p.rooms) {
      fail(!ids.has(r.id) && r.id < keep.nextId, `room id ${r.id}`)
      ids.add(r.id)
      const { w, h } = SHAPE_SIZE[r.shape]
      fail(r.col >= 0 && r.row >= 0 && r.col + w <= grid.cols && r.row + h <= grid.rows, `room ${r.id} out of its grid`)
      if (p.kind === 'row') fail(Math.floor(r.col / HOME_COLS) === Math.floor((r.col + w - 1) / HOME_COLS), `room ${r.id} across two homes`)
      for (let c = 0; c < w; c++)
        for (let k = 0; k < h; k++) {
          const cell = `${r.col + c},${r.row + k}`
          fail(!cells.has(cell), `plot ${plot} cell ${cell} taken twice`)
          cells.add(cell)
        }
      const slots = slotsOf(r.shape)
      fail(r.items.length === slots.length, `room ${r.id} has ${r.items.length} slots`)
      const items = r.items.filter((i) => i !== null)
      fail(new Set(items).size === items.length, `room ${r.id} holds twins`)
      r.items.forEach((item, i) => fail(item === null || ITEMS[item].slot === slots[i]!.kind, `room ${r.id} slot ${i} holds ${item}`))
    }
    for (const r of p.rooms) for (let c = 0; c < SHAPE_SIZE[r.shape].w; c++) fail(r.row === 0 || cells.has(`${r.col + c},${r.row - 1}`), `room ${r.id} floats`)
  })
  const has = (plot: number, id: number) => plot < keep.plots.length && keep.plots[plot]!.rooms.some((r) => r.id === id)
  const shot = s.shot
  fail((shot.kind === 'road') === (s.road !== null), `the ${shot.kind} shot with${s.road === null ? 'out' : ''} a road`)
  if (shot.kind === 'plot') fail(shot.plot < keep.plots.length, `the shot on plot ${shot.plot}`)
  if (shot.kind === 'room') fail(has(shot.plot, shot.room), `the shot in room ${shot.room}`)
  const b = s.builder.at
  if (b.kind === 'room') fail(has(b.plot, b.room), `the builder in room ${b.room}`)
  if (s.ask !== null && s.ask.kind === 'theme') fail(has(s.ask.plot, s.ask.room), `a theme card for room ${s.ask.room}`)
  if (s.ask !== null && s.ask.kind === 'house') fail(keep.plots[s.ask.plot]!.kind === null, 'a house card for a plot with a house')
  if (s.lifted >= 0) fail(shot.kind === 'plot' && has(shot.plot, s.lifted), `room ${s.lifted} lifted off screen`)
  fail(s.lookUndo.length <= UNDO_LOOKS, 'a long dice undo')
  fail(keep.look.hat !== 'none', 'no hat')
  for (const f of s.flights) {
    placePoint(s, f.from)
    placePoint(s, f.to)
  }
  infinite(s, 's', out)
  return out
}

/**
 * Plays `seconds` of game time from a fresh state: random actions with random pauses; on
 * the road the pedal is often held and goods sometimes dropped in the bed. Checks the
 * invariants after every action, and every so often that the hint leads somewhere.
 */
function fuzz(seed: number, seconds: number, seen: Set<EventKind>): { actions: number; rooms: number; trips: number } {
  const r = rng(seed)
  const s = createState(freshKeep(), seed, true)
  let credited = 0
  let actions = 0
  let rooms = 0
  let trips = 0
  while (s.tick < ticks(seconds)) {
    const keep = s.keep
    const road = s.road
    const bed = road === null ? 0 : road.bed.length
    const tipAt = s.tipAt
    const nextId = keep.nextId
    if (road !== null && r() < 0.3) {
      for (let k = Math.floor(r() * 3); k >= 0; k--) {
        const good = RAWS[Math.floor(r() * RAWS.length)]!
        road.bed.push(good)
        keep.goods[good]++
      }
    }
    const a = randomAction(s, r)
    act(s, a)
    actions++
    for (let k = 1 + Math.floor(r() * (s.road !== null ? 40 : 15)); k > 0; k--) {
      step(s)
      for (const e of s.events) seen.add(e.kind)
    }
    if (s.keep !== keep) credited = 0
    else {
      rooms += keep.nextId - nextId
      if (road !== null) credited += road.bed.length - bed
      if (s.road !== null && s.road !== road) credited += s.road.bed.length
      if (s.tipAt !== tipAt && s.presentGot === 'gems' && s.presentAt === s.tipAt) credited += PRESENT_GEMS
    }
    const wrong = broken(s, credited)
    if (wrong.length > 0) expect.fail(`seed ${seed}, action ${actions} (${JSON.stringify(a)}): ${wrong.join('; ')}`)
    if (s.tipAt !== tipAt) trips++
    if (actions % 40 === 0) expect(followHint(cloneState(s)), `stuck after ${actions} actions`).toBe(true)
  }
  return { actions, rooms, trips }
}

describe('a whole session', () => {
  it('always has a next step that leads somewhere', () => {
    const s = createState(freshKeep(), 3, true)
    // A child who only ever follows the hint drives, opens the machines, runs them and builds.
    for (let k = 0; k < 60; k++) {
      if (s.road !== null) {
        for (const g of ['log', 'clay', 'sand', 'rock', 'gem', 'log'] as const) {
          s.road.bed.push(g)
          s.keep.goods[g]++
        }
      }
      expect(followHint(s), `step ${k}`).toBe(true)
      steps(s, 30)
    }
    expect(s.keep.trips).toBeGreaterThan(2)
    expect(MACHINES.every((m) => s.keep.machines[m] === 'built')).toBe(true)
    expect(s.keep.plots[0]!.rooms.length).toBeGreaterThan(3)
  })

  it('keeps every invariant through minutes of random play', () => {
    let total = { actions: 0, rooms: 0, trips: 0 }
    const seen = new Set<EventKind>()
    for (const seed of [1, 2, 3, 4]) {
      const got = fuzz(seed, 180, seen)
      total = { actions: total.actions + got.actions, rooms: total.rooms + got.rooms, trips: total.trips + got.trips }
    }
    // The random child gets around: drives home, opens and runs machines, builds, furnishes, takes back and says good night.
    expect(total.actions).toBeGreaterThan(2000)
    expect(total.trips).toBeGreaterThan(10)
    expect(total.rooms).toBeGreaterThan(5)
    const reached = ['tip', 'machineBuilt', 'batch', 'build', 'landed', 'theme', 'itemIn', 'lift', 'takeBack', 'newPlot', 'doorbell', 'roof', 'sleep'] as const
    expect(reached.filter((k) => !seen.has(k))).toEqual([])
  })
})
