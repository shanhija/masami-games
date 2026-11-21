/**
 * The session's rules, one per test, on small keeps built by hand: the mirror, the trips
 * home, the machines, building and taking back, the rooms, the shots, the hint, Good night,
 * the builder's picture, the flights and the demos. Taps go through `act` with hits that
 * layout.targets offers, as the shell's hit test would send them.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_LOOK, LOCKED_BAGS, LOCKED_GLASSES, LOCKED_SHOES, LOCKED_THEMES, LOCKED_TOOLS, PRESENTS, PRESENT_GEMS, SHAPE_SIZE, THEME_VISIT, roomCost, themeOpen } from './catalog'
import { BED, placePoint, shown } from './flights'
import { DEMOS, demoKeep, demoShot } from './fixtures'
import { ITEMS, defaultItems, themeItems, type ItemId } from './items'
import { insets, toScreen, tweening, viewAt, simTime } from './camera'
import {
  PLOT_W,
  PRESENT_FOR,
  PRESENT_POP,
  PRESENT_X,
  TRUCK,
  TRUCK_HOME_X,
  TRUCK_TIP_X,
  canPlace,
  centre,
  coverOf,
  heapRect,
  hitTest,
  houseRect,
  machineSpot,
  plotLeft,
  presentOpenAt,
  visitPoint,
  roomRect,
  slotsOf,
  stackRect,
  stationRect,
  streetEnd,
  targets,
  MIRROR_BUILDER_X,
  VISITOR,
} from './layout'
import {
  BATCH,
  BATCH_PUSHED,
  CELL_COST,
  DASH,
  DRIVE_IN,
  FLY_EVERY,
  FLY_FOR,
  HAMMER,
  HINT_IDLE,
  HZ,
  LOWER,
  MACHINES,
  MATERIALS,
  MAX_PLOTS,
  PARTY_EVERY,
  SHAPES,
  SHOT_TWEEN,
  STEP,
  THEMES,
  TIP,
  ticks,
  type Action,
  type EventKind,
  type Hit,
  type Keep,
  type Look,
  type MachineId,
  type Material,
  type PlacedRoom,
  type Plot,
  type Raw,
  type Shape,
  type SimEvent,
  type State,
  type Theme,
} from './model'
import { freshKeep } from './progress'
import { between, rng } from './random'
import { DUSK, GLANCE, HINT_NEAR, HOME_BEAT, SETTLE, START_X, UNDO_LOOKS, YARD_VIEW_X, act, createState, offered, roomOf, same, step, unloading } from './rules'

// ---------------------------------------------------------------------------------------
// Keeps and hands on the controls.

/** Every event the rules report (a Record, so the compiler keeps the list whole; the road's own are road.test.ts's). The last test checks each came up. */
const RULE_EVENTS: Record<Exclude<EventKind, 'pickup' | 'whack' | 'crack' | 'stop' | 'honk' | 'answer' | 'ramp' | 'land' | 'arrive'>, true> = {
  present: true, unlock: true, tip: true, crate: true, crateHit: true, machineBuilt: true, batch: true, push: true, cough: true,
  house: true, build: true, landed: true, lift: true, takeBack: true, nope: true, wiggle: true, theme: true, itemIn: true, itemOut: true, play: true,
  paint: true, roof: true, doorbell: true, visit: true, newPlot: true, wear: true, dice: true, zoom: true, goodnight: true, lightsOut: true,
  sleep: true, wake: true, tap: true,
}
const seen = new Set<EventKind>()

type Stamped = SimEvent & { tick: number }
/** Steps n times; every event on the way, stamped with the tick it came at. */
function run(s: State, n: number): Stamped[] {
  const out: Stamped[] = []
  for (let k = 0; k < n; k++) {
    step(s)
    for (const e of s.events) {
      out.push({ ...e, tick: s.tick })
      seen.add(e.kind)
    }
  }
  return out
}
/** One action and the step after it: the action's events come out in that step. */
const doing = (s: State, a: Action) => {
  act(s, a)
  return run(s, 1)
}
const tapOn = (s: State, hit: Hit) => doing(s, { kind: 'tap', hit })
const kinds = (events: readonly SimEvent[]) => events.map((e) => e.kind)

const room = (id: number, shape: Shape, col: number, row: number, material: Material, theme: Theme | null): PlacedRoom => ({
  id, shape, col, row, material, theme, items: theme === null ? slotsOf(shape).map(() => null) : defaultItems(theme, shape), wall: 0, floor: 0,
})
/** A keep with these plots (the last one the empty one waiting) and these goods. */
function keepWith(plots: Plot[], goods: Partial<Keep['goods']> = {}): Keep {
  const keep = freshKeep()
  keep.plots = plots
  keep.nextId = 1 + Math.max(0, ...plots.flatMap((p) => p.rooms.map((r) => r.id)))
  Object.assign(keep.goods, goods)
  return keep
}
const onStreet = (keep: Keep) => createState(keep, 7, false)
const empty = (): Plot => ({ kind: null, roof: 'pointed', rooms: [] })
/** The street x with a plot's house (or its sign) in the middle, and with the target of `hit` in the middle. */
const houseMiddle = (s: State, plot: number) => centre(houseRect(plot, s.keep.plots[plot]!)).x
const targetMiddle = (s: State, hit: Hit) => centre(targets(s).find((t) => same(t.hit, hit))!.rect).x
const lookOpen = (keep: Keep, look: Look) =>
  (!LOCKED_BAGS.includes(look.bag) || keep.unlocked.includes(`bag:${look.bag}`)) &&
  (!LOCKED_TOOLS.includes(look.tool) || keep.unlocked.includes(`tool:${look.tool}`)) &&
  (!LOCKED_SHOES.includes(look.shoes) || keep.unlocked.includes(`shoes:${look.shoes}`)) &&
  (!LOCKED_GLASSES.includes(look.glasses) || keep.unlocked.includes(`glasses:${look.glasses}`)) &&
  look.hat !== 'none'

/** A trip driven by hand once the truck is back from the last: the truck tapped (and the road picked), these goods dropped in the bed as road.ts would, then Home, the beat and the drive into the yard, to the step after the truck tips. */
function trip(s: State, goods: readonly Raw[], present: boolean): Stamped[] {
  while (unloading(s)) run(s, 1)
  tapOn(s, { kind: 'truck' })
  if (s.ask !== null) doing(s, { kind: 'road', road: 'forest' })
  const road = s.road!
  for (const g of goods) {
    road.bed.push(g)
    s.keep.goods[g]++
  }
  road.present = present
  const events = doing(s, { kind: 'home' })
  return [...events, ...run(s, ticks(HOME_BEAT) + ticks(DRIVE_IN))]
}

// ---------------------------------------------------------------------------------------

describe('the mirror', () => {
  it('opens on a dice-made builder on the first visit, a different one per seed', () => {
    const s = createState(freshKeep(), 5, true)
    expect(s.shot).toEqual({ kind: 'mirror' })
    expect(s.builder.at).toEqual({ kind: 'mirror' })
    expect(s.keep.look).not.toEqual(DEFAULT_LOOK)
    expect(lookOpen(s.keep, s.keep.look)).toBe(true)
    expect(createState(freshKeep(), 6, true).keep.look).not.toEqual(s.keep.look)
    expect(createState(freshKeep(), 5, false).keep.look).toEqual(DEFAULT_LOOK)
  })

  it('wears what is open and ignores what is locked or unknown', () => {
    const s = createState(freshKeep(), 1, true)
    const before = { ...s.keep.look }
    const events = doing(s, { kind: 'wear', patch: { bag: 'jetpack', shirt: 'hoodie', hat: 'none', hair: 'mohawk' as Look['hair'] } })
    expect(s.keep.look).toEqual({ ...before, shirt: 'hoodie' })
    expect(events.filter((e) => e.kind === 'wear')).toEqual([{ kind: 'wear', part: 'shirt', tick: s.tick }])
    s.keep.unlocked.push('bag:jetpack')
    expect(doing(s, { kind: 'wear', patch: { bag: 'jetpack' } }).map((e) => e.kind === 'wear' && e.part)).toEqual(['bag'])
    expect(s.keep.look.bag).toBe('jetpack')
    const colours = doing(s, { kind: 'wear', patch: { shirtColor: 'red', pantsColor: 'teal', skin: 9 as Look['skin'], toString: 'x' } as Partial<Look> })
    expect(colours.flatMap((e) => (e.kind === 'wear' ? [e.part] : []))).toEqual(['shirt', 'pants'])
    expect(s.keep.look.skin).toBe(before.skin)
  })

  it('rolls the dice from open options only, and undoes the last five rolls', () => {
    const s = createState(freshKeep(), 2, true)
    const looks = [s.keep.look]
    for (let i = 0; i < 7; i++) {
      expect(kinds(doing(s, { kind: 'dice' }))).toContain('dice')
      looks.push(s.keep.look)
    }
    expect(s.lookUndo.length).toBe(UNDO_LOOKS)
    for (let i = 6; i >= 2; i--) {
      doing(s, { kind: 'undoDice' })
      expect(s.keep.look).toEqual(looks[i])
    }
    expect(kinds(doing(s, { kind: 'undoDice' }))).not.toContain('dice')
    expect(s.keep.look).toEqual(looks[2])
    for (let i = 0; i < 300; i++) {
      act(s, { kind: 'dice' })
      expect(lookOpen(s.keep, s.keep.look)).toBe(true)
    }
    s.keep.unlocked = [...PRESENTS]
    const bags = new Set<string>()
    for (let i = 0; i < 300; i++) {
      act(s, { kind: 'dice' })
      bags.add(s.keep.look.bag)
    }
    expect(bags.has('jetpack') && bags.has('cat')).toBe(true)
  })

  it('opens a tab from the tab row or a part of the big builder, and goes to the street', () => {
    const s = createState(freshKeep(), 1, true)
    doing(s, { kind: 'tab', part: 'tool' })
    expect(s.tab).toBe('tool')
    expect(offered(s, { kind: 'part', part: 'shoes' })).toBe(true)
    tapOn(s, { kind: 'part', part: 'shoes' })
    expect(s.tab).toBe('shoes')
    const events = doing(s, { kind: 'go' })
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    expect(s.builder.at).toEqual({ kind: 'street', x: MIRROR_BUILDER_X })
    expect(kinds(events)).toContain('zoom')
    const look = s.keep.look
    expect(kinds(doing(s, { kind: 'dice' }))).toEqual([])
    doing(s, { kind: 'wear', patch: { shirt: 'star' } })
    expect(s.keep.look).toBe(look)
    tapOn(s, { kind: 'mirror' })
    expect(s.shot).toEqual({ kind: 'mirror' })
    doing(s, { kind: 'back' })
    expect(s.shot.kind).toBe('street')
  })
})

describe('trips', () => {
  it('starts the training road at once on the first truck tap', () => {
    const s = onStreet(freshKeep())
    expect(kinds(tapOn(s, { kind: 'truck' }))).toContain('zoom')
    expect(s.road!.def.trip).toBe(1)
    expect(s.shot).toEqual({ kind: 'road' })
    expect(s.ask).toBeNull()
    expect(s.builder).toMatchObject({ at: { kind: 'truck' }, pose: 'drive' })
  })

  it('asks which road from the second trip on, with a seed from the state', () => {
    const keep = keepWith([empty()])
    keep.trips = 2
    const s = onStreet(keep)
    tapOn(s, { kind: 'truck' })
    expect(s.ask).toEqual({ kind: 'road' })
    expect(s.road).toBeNull()
    doing(s, { kind: 'road', road: 'hills' })
    expect(s.ask).toBeNull()
    expect(s.road!.def).toMatchObject({ kind: 'hills', trip: 3 })
    const other = createState(structuredClone(keep), 8, false)
    tapOn(other, { kind: 'truck' })
    doing(other, { kind: 'road', road: 'hills' })
    expect(other.road!.def.seed).not.toBe(s.road!.def.seed)
    const again = createState(structuredClone(keep), 7, false)
    tapOn(again, { kind: 'truck' })
    doing(again, { kind: 'road', road: 'hills' })
    expect(again.road!.def.seed).toBe(s.road!.def.seed)
  })

  it('comes home after a beat: the truck drives into the yard and tips, the goods fly to their heaps, crates drop and the present opens', () => {
    const s = onStreet(freshKeep())
    const goods: Raw[] = ['log', 'log', 'rock', 'clay']
    tapOn(s, { kind: 'truck' })
    const road = s.road!
    for (const g of goods) {
      road.bed.push(g)
      s.keep.goods[g]++
    }
    road.present = true
    doing(s, { kind: 'home' })
    expect(s.road).not.toBeNull()
    expect(road.endAt).toBe(s.tick - 1)
    run(s, ticks(HOME_BEAT) - 2)
    expect(s.road).not.toBeNull()
    const home = run(s, 1)
    expect(s.road).toBeNull()
    const at = s.tick
    const tipAt = at + ticks(DRIVE_IN)
    // Home: counted and on the street at once, the crates dropping while the truck drives in with the builder at the wheel.
    expect(kinds(home)).toEqual(expect.arrayContaining(['crate', 'zoom']))
    expect(kinds(home)).not.toContain('tip')
    expect(home.filter((e) => e.kind === 'crate').map((e) => e.kind === 'crate' && e.m)).toEqual(['sawmill', 'oven', 'mixer'])
    expect(s.keep.trips).toBe(1)
    expect(s.keep.goods).toMatchObject({ log: 2, rock: 1, clay: 1 })
    expect(s.tipAt).toBe(tipAt)
    expect(s.shot).toEqual({ kind: 'street', x: YARD_VIEW_X })
    expect(s.keep.machines).toEqual({ sawmill: 'crate', oven: 'crate', mixer: 'crate', glassworks: 'pad', rainbow: 'pad' })
    expect(s.crateAt.sawmill).toBe(at)
    expect(s.presentGot).toBe(PRESENTS[0])
    expect(s.presentAt).toBe(tipAt)
    expect(s.keep.unlocked).toEqual([PRESENTS[0]])
    expect(s.builder.at).toEqual({ kind: 'truck' })
    const flights = s.flights.filter((f) => f.from.kind === 'bed')
    expect(flights.map((f) => [f.good, f.to])).toEqual(goods.map((g) => [g, { kind: 'heap', good: g }]))
    flights.forEach((f, i) => {
      expect(f.at).toBe(tipAt + ticks(TIP / 2) + Math.round(i * FLY_EVERY * HZ))
      expect(f.dur).toBe(ticks(FLY_FOR))
    })
    // While it drives in nothing bounces and nothing on the street answers a tap, not even the crate just dropped: the builder stays at the wheel.
    expect(unloading(s)).toBe(true)
    expect(s.hint).toBeNull()
    expect(targets(s)).toEqual([])
    for (const hit of [{ kind: 'truck' }, { kind: 'present' }, { kind: 'machine', m: 'sawmill' }, { kind: 'mirror' }, { kind: 'plot', plot: 0 }] as const) expect(kinds(tapOn(s, hit)), hit.kind).toEqual([])
    expect(kinds(doing(s, { kind: 'mirror' }))).toEqual([])
    expect(s.ask).toBeNull()
    expect(s.machines.sawmill.hits).toBe(0)
    expect(s.builder.at).toEqual({ kind: 'truck' })
    expect(s.presentAt).toBe(tipAt)
    // It tips: the present pops out of the bed, and the builder jumps out and cheers. The present opens with its fanfare as it lands, PRESENT_POP later.
    const tipped = run(s, tipAt - s.tick + ticks(PRESENT_POP))
    expect(tipped.filter((e) => e.tick === tipAt).map((e) => e.kind)).toEqual(['tip'])
    expect(presentOpenAt(s)).toBe(tipAt + ticks(PRESENT_POP))
    expect(tipped.filter((e) => e.kind === 'present' || e.kind === 'unlock').map((e) => [e.kind, e.tick])).toEqual([['present', tipAt + ticks(PRESENT_POP)], ['unlock', tipAt + ticks(PRESENT_POP)]])
    expect(s.builder).toMatchObject({ at: { kind: 'street' }, pose: 'cheer', movedAt: tipAt, facing: -1 })
    // The tipping truck stands in the yard, in front of the machines: so does its target.
    const truck = targets(s).find((t) => t.hit.kind === 'truck')!
    expect([centre(truck.rect).x, truck.z]).toEqual([TRUCK_TIP_X, 2])
    // Once the load is home the truck can go again, and a tap on the box while its card shows opens it again.
    while (unloading(s)) run(s, 1)
    tapOn(s, { kind: 'truck' })
    expect(s.ask).toEqual({ kind: 'road' })
    act(s, { kind: 'back' })
    expect(kinds(tapOn(s, { kind: 'present' }))).toContain('present')
    expect(s.presentAt).toBe(s.tick - 1)
    // Nothing bounces until its card has gone; then the hint comes back, the crate in view.
    run(s, presentOpenAt(s) + ticks(PRESENT_FOR) - s.tick - 1)
    expect(s.hint).toBeNull()
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'machine', m: 'oven' })
  })

  it("waits out the present's card on the homecoming: nothing bounces, the camera stays on the yard and the hand waits until the card has gone", () => {
    const s = onStreet(freshKeep())
    s.screen = { w: 820, h: 1180 }
    trip(s, ['log', 'log', 'rock', 'rock'], true)
    // No touch and no hand for as long as the hand waits, as on a long road with the pedal held to its end.
    s.lastInputAt = s.handAt = s.tick - ticks(HINT_IDLE)
    const gone = presentOpenAt(s) + ticks(PRESENT_FOR)
    while (s.tick < gone - 1) {
      run(s, 1)
      expect(s.hint).toBeNull()
      expect(s.shot).toEqual({ kind: 'street', x: YARD_VIEW_X })
      expect(s.handAt).toBeLessThan(0)
    }
    // The card goes: the crate in sight bounces (half the mixer's station shows), and the hand taps it after the camera's look, a beat later.
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'machine', m: 'mixer' })
    expect(s.handAt).toBeLessThan(0)
    run(s, ticks(GLANCE))
    expect(s.shot).toEqual({ kind: 'street', x: YARD_VIEW_X })
    expect(s.handAt).toBe(gone + ticks(GLANCE))
  })

  it('gives the presents in order, then three gems that bring the rainbow crate', () => {
    const s = onStreet(freshKeep())
    trip(s, ['log'], true)
    trip(s, ['log'], true)
    expect(s.keep.unlocked).toEqual(PRESENTS.slice(0, 2))
    s.keep.unlocked = [...PRESENTS]
    const events = [...trip(s, [], true), ...run(s, ticks(PRESENT_POP))]
    expect(s.presentGot).toBe('gems')
    expect(events).toContainEqual(expect.objectContaining({ kind: 'unlock', what: 'gems' }))
    expect(s.keep.goods.gem).toBe(PRESENT_GEMS)
    expect(s.flights.filter((f) => f.from.kind === 'present').length).toBe(PRESENT_GEMS)
    expect(s.keep.machines.rainbow).toBe('crate')
    trip(s, ['sand'], false)
    expect(s.presentGot).toBeNull()
    expect(s.presentAt).toBe(-1)
    expect(offered(s, { kind: 'present' })).toBe(false)
  })

  it('opens the present in the yard, in the after-trip view on every screen and clear of what the child taps there, answering taps only while its card shows', () => {
    const s = onStreet(freshKeep())
    trip(s, ['log', 'rock'], true)
    expect(s.presentAt).toBe(s.tipAt)
    expect(s.shot).toEqual({ kind: 'street', x: YARD_VIEW_X })
    // It answers no tap while it flies from the bed, and from its landing on.
    run(s, ticks(PRESENT_POP) - 2)
    expect(offered(s, { kind: 'present' })).toBe(false)
    run(s, 1)
    expect(s.tick).toBe(presentOpenAt(s))
    const box = targets(s).find((t) => t.hit.kind === 'present')!
    expect(centre(box.rect).x).toBe(PRESENT_X)
    // On the sand behind the tipped bed, between the oven's stack and the mixer's heap, clear of every machine and the truck.
    expect(PRESENT_X).toBeGreaterThan(stackRect('oven').x + stackRect('oven').w + 0.3)
    expect(PRESENT_X).toBeLessThan(heapRect('mixer').x - 0.3)
    expect(TRUCK_TIP_X - TRUCK.length / 2 - PRESENT_X).toBeGreaterThan(1)
    // Each screen the game is played on, the box landed: it shows in the picture the HUD leaves free, a tap on it is the present's,
    // and a tap anywhere on the truck, a heap, a crate or a machine is never the present's.
    for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [667, 375], [1920, 1000]] as const) {
      const v = viewAt(s, simTime(s), w, h, 1)
      const ins = insets(s.shot, w, h)
      for (const [x, y] of [[box.rect.x, box.rect.y], [box.rect.x + box.rect.w, 0]] as const) {
        const [sx, sy] = toScreen(v, x, y)
        expect(sx >= ins.left && sx <= w - ins.right && sy >= ins.top && sy <= h - ins.bottom, `${w}x${h}`).toBe(true)
      }
      expect(hitTest(s, v, ...toScreen(v, PRESENT_X, -0.3)), `${w}x${h}`).toEqual({ kind: 'present' })
      const needed = targets(s).filter((t) => t.hit.kind === 'truck' || t.hit.kind === 'machine')
      expect(needed.filter((t) => t.hit.kind === 'truck').length).toBe(1)
      for (const t of needed) {
        for (let fx = 0; fx <= 1; fx += 0.05) for (let fy = 0; fy <= 1; fy += 0.25) expect(hitTest(s, v, ...toScreen(v, t.rect.x + t.rect.w * fx, t.rect.y + t.rect.h * fy)), `${w}x${h} ${t.hit.kind}`).not.toEqual({ kind: 'present' })
      }
    }
    run(s, ticks(PRESENT_FOR) - (s.tick - presentOpenAt(s)) - 1)
    expect(offered(s, { kind: 'present' })).toBe(true)
    // A tap opens it again, and its card with it.
    expect(kinds(tapOn(s, { kind: 'present' }))).toContain('present')
    run(s, ticks(PRESENT_FOR) - 2)
    expect(offered(s, { kind: 'present' })).toBe(true)
    run(s, 1)
    expect(offered(s, { kind: 'present' })).toBe(false)
    expect(kinds(tapOn(s, { kind: 'present' }))).toEqual([])
  })

  it('ends when the road says so, as when Home is pressed, and keeps the drive controls to the road', () => {
    const s = onStreet(freshKeep())
    for (const a of [{ kind: 'pedal', down: true }, { kind: 'push' }, { kind: 'horn' }, { kind: 'whack' }, { kind: 'home' }] as const) act(s, a)
    expect(s.road).toBeNull()
    tapOn(s, { kind: 'truck' })
    s.road!.endAt = s.tick
    run(s, ticks(HOME_BEAT))
    expect(s.road).toBeNull()
    expect(s.keep.trips).toBe(1)
  })
})

describe('machines', () => {
  const yard = (stage: 'crate' | 'built', goods: Partial<Keep['goods']>) => {
    const keep = keepWith([empty()], goods)
    keep.machines.sawmill = stage
    return onStreet(keep)
  }

  it('unfold from a crate on the third hit, the builder dashing over to hit it', () => {
    const s = yard('crate', { log: 2 })
    const first = tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(kinds(first)).toContain('crateHit')
    expect(s.builder).toMatchObject({ at: { kind: 'machine', m: 'sawmill' }, pose: 'hit', fromX: MIRROR_BUILDER_X, movedAt: s.tick - 1, poseAt: s.tick - 1 + ticks(DASH), facing: 1 })
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(s.keep.machines.sawmill).toBe('crate')
    const third = tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(kinds(third)).toEqual(expect.arrayContaining(['crateHit', 'machineBuilt']))
    expect(s.keep.machines.sawmill).toBe('built')
    expect(s.machines.sawmill).toMatchObject({ hits: 3, builtAt: s.tick - 1 })
    expect(s.keep.goods.log).toBe(2)
  })

  it('run the whole heap on one tap, a batch every BATCH, spending and crediting at its start', () => {
    const s = yard('built', { log: 3 })
    const events = tapOn(s, { kind: 'machine', m: 'sawmill' })
    const t0 = s.tick - 1
    expect(kinds(events)).toContain('batch')
    expect(s.keep.goods).toMatchObject({ log: 2, planks: 1 })
    expect(s.builder.pose).toBe('lever')
    expect(s.flights).toContainEqual({ good: 'planks', n: 1, from: { kind: 'heap', good: 'log' }, to: { kind: 'stack', good: 'planks' }, at: t0, dur: ticks(BATCH) })
    const later = run(s, ticks(BATCH) * 3 + 2)
    expect(later.filter((e) => e.kind === 'batch').map((e) => e.tick)).toEqual([t0 + ticks(BATCH), t0 + 2 * ticks(BATCH)])
    expect(s.keep.goods).toMatchObject({ log: 0, planks: 3 })
    expect(s.machines.sawmill.on).toBe(false)
    expect(s.flights).toEqual([])
  })

  it('pop the batch out at once on a push while running, and cough with an empty heap', () => {
    const s = yard('built', { log: 2 })
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    const t0 = s.tick - 1
    run(s, 4)
    expect(kinds(tapOn(s, { kind: 'machine', m: 'sawmill' }))).toContain('push')
    const pushed = s.tick - 1
    expect(s.machines.sawmill).toMatchObject({ batchAt: t0, batchFor: pushed - t0 + ticks(BATCH_PUSHED), pushAt: pushed })
    expect(s.flights[0]!.dur).toBe(pushed - t0 + ticks(BATCH_PUSHED))
    const next = run(s, ticks(BATCH_PUSHED))
    expect(next.filter((e) => e.kind === 'batch').map((e) => e.tick)).toEqual([pushed + ticks(BATCH_PUSHED)])
    run(s, ticks(BATCH))
    expect(s.machines.sawmill.on).toBe(false)
    const cough = tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(kinds(cough)).toContain('cough')
    expect(s.machines.sawmill.coughAt).toBe(s.tick - 1)
  })

  it('do nothing on an empty pad but show the hand, the camera first bringing the thing bouncing into view', () => {
    const s = yard('built', {})
    doing(s, { kind: 'pan', x: machineSpot('oven') })
    const keep = structuredClone(s.keep)
    expect(s.hint).toEqual({ kind: 'truck' })
    expect(kinds(tapOn(s, { kind: 'machine', m: 'oven' }))).toEqual(['zoom', 'tap'])
    expect(s.shot).toEqual({ kind: 'street', x: TRUCK_HOME_X })
    expect(s.handAt).toBe(s.tick - 1 + ticks(SHOT_TWEEN))
    expect(s.keep).toEqual(keep)
    expect(s.builder.at.kind).toBe('street')
    // The truck in view now, the next empty pad shows the hand at once.
    run(s, ticks(SHOT_TWEEN))
    expect(kinds(tapOn(s, { kind: 'machine', m: 'oven' }))).toEqual(['tap'])
    expect(s.handAt).toBe(s.tick - 1)
  })

  it('run only on goods their heap shows: logs still in the tipping truck or in the air wait', () => {
    const keep = keepWith([empty()])
    keep.machines.sawmill = 'built'
    const s = onStreet(keep)
    trip(s, ['log', 'log', 'log'], false)
    // The truck has just tipped: the logs fly from tipAt + TIP / 2 and land FLY_FOR later.
    expect(s.keep.goods.log).toBe(3)
    expect(kinds(tapOn(s, { kind: 'machine', m: 'sawmill' }))).toContain('cough')
    expect(s.keep.goods).toMatchObject({ log: 3, planks: 0 })
    // The first log lands: the machine runs on it, and stops when the heap shows no more though more are still flying.
    while (shown(s, { kind: 'heap', good: 'log' }, 'log', s.tick * STEP) === 0) run(s, 1)
    expect(kinds(tapOn(s, { kind: 'machine', m: 'sawmill' }))).toContain('batch')
    while (unloading(s)) run(s, 1)
    run(s, 3 * ticks(BATCH))
    expect(s.keep.goods.log + s.keep.goods.planks).toBe(3)
    // Every log home: one tap runs the rest.
    if (s.keep.goods.log > 0) {
      expect(s.machines.sawmill.on).toBe(false)
      tapOn(s, { kind: 'machine', m: 'sawmill' })
      run(s, 3 * ticks(BATCH))
    }
    expect(s.keep.goods).toMatchObject({ log: 0, planks: 3 })
  })
})

describe('building', () => {
  it('zooms to an empty plot, asks which house, and picks the material there is most of', () => {
    const s = onStreet(keepWith([empty()], { bricks: 3, glass: 6 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    expect(s.shot).toEqual({ kind: 'plot', plot: 0 })
    expect(s.ask).toEqual({ kind: 'house', plot: 0 })
    expect(targets(s).map((t) => t.hit)).toEqual([{ kind: 'plot', plot: 0 }])
    expect(kinds(doing(s, { kind: 'house', house: 'tall' }))).toContain('house')
    expect(s.keep.plots[0]!.kind).toBe('tall')
    expect(s.rev[0]).toBe(1)
    expect(s.material).toBe('glass')
    expect(s.ask).toBeNull()
  })

  it('asks which house again on a tap on the empty plot after the question was closed, its sign bouncing meanwhile', () => {
    const s = onStreet(keepWith([empty()], { planks: 4 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'back' })
    expect([s.ask, s.shot]).toEqual([null, { kind: 'plot', plot: 0 }])
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    expect(kinds(tapOn(s, { kind: 'plot', plot: 0 }))).not.toContain('zoom')
    expect(s.ask).toEqual({ kind: 'house', plot: 0 })
    expect(s.shot).toEqual({ kind: 'plot', plot: 0 })
    expect(s.hint).toBeNull()
  })

  it('places a paid room that the crane lowers and the builder hammers, then asks which room', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }], { planks: 5 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'material', material: 'planks' })
    doing(s, { kind: 'shape', shape: 'wide' })
    const events = tapOn(s, { kind: 'spot', plot: 0, col: 1, row: 0 })
    const t0 = s.tick - 1
    expect(events).toContainEqual(expect.objectContaining({ kind: 'build', plot: 0, room: 1, material: 'planks' }))
    expect(s.keep.goods.planks).toBe(1)
    expect(s.keep.plots[0]!.rooms).toEqual([room(1, 'wide', 1, 0, 'planks', null)])
    expect(s.keep.nextId).toBe(2)
    expect(s).toMatchObject({ craneRoom: 1, craneAt: t0, craneOut: false })
    expect(s.flights.map((f) => [f.from, f.to, f.at])).toEqual([0, 1, 2, 3].map((i) => [{ kind: 'stack', good: 'planks' }, { kind: 'room', plot: 0, room: 1 }, t0 + Math.round(i * FLY_EVERY * HZ)]))
    expect(s.builder.at.kind).toBe('scaffold')
    const landed = run(s, ticks(LOWER))
    expect(landed.filter((e) => e.kind === 'landed')).toEqual([{ kind: 'landed', plot: 0, room: 1, tick: t0 + ticks(LOWER) }])
    expect(s.builder.pose).toBe('hammer')
    expect(s.ask).toBeNull()
    run(s, ticks(LOWER + HAMMER) - ticks(LOWER))
    expect(s.ask).toEqual({ kind: 'theme', plot: 0, room: 1 })
    expect(s.builder.pose).toBe('hop')
    expect(s.craneRoom).toBe(-1)
  })

  it('keeps the room card back while a finger still holds a ghost: lifting it there builds that room, and then the card asks about the first', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }, empty()], { planks: 8 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'material', material: 'planks' })
    tapOn(s, { kind: 'spot', plot: 0, col: 0, row: 0 })
    const t0 = s.tick - 1
    const held = { kind: 'spot', plot: 0, col: 1, row: 0 } as const
    doing(s, { kind: 'press', hit: held })
    run(s, ticks(LOWER + HAMMER) + 30)
    expect(s.ask).toBeNull()
    expect(s.craneRoom).toBe(1)
    expect(s.builder).toMatchObject({ pose: 'hop', poseAt: t0 + ticks(LOWER + HAMMER) })
    // The finger lifts on the ghost it holds: that room goes in, and the first room's card comes.
    const lift = tapOn(s, held)
    expect(lift).toContainEqual(expect.objectContaining({ kind: 'build', plot: 0, room: 2 }))
    expect(s.ask).toEqual({ kind: 'theme', plot: 0, room: 1 })
    expect(s.craneRoom).toBe(2)
    // A finger that slides off the ghosts instead lets the card come in the next step.
    doing(s, { kind: 'theme', theme: null })
    doing(s, { kind: 'press', hit: { kind: 'spot', plot: 0, col: 2, row: 0 } })
    run(s, ticks(LOWER + HAMMER))
    expect(s.ask).toBeNull()
    doing(s, { kind: 'press', hit: null })
    expect(s.ask).toEqual({ kind: 'theme', plot: 0, room: 2 })
    expect(s.craneRoom).toBe(-1)
  })

  it('says nope with the material when it does not pay, and acts only on offered spots', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }, empty()], { bricks: 3 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'material', material: 'bricks' })
    doing(s, { kind: 'shape', shape: 'big' })
    const keep = structuredClone(s.keep)
    expect(tapOn(s, { kind: 'spot', plot: 0, col: 0, row: 0 })).toContainEqual(expect.objectContaining({ kind: 'nope', good: 'bricks' }))
    expect(s.keep).toEqual(keep)
    doing(s, { kind: 'shape', shape: 'small' })
    tapOn(s, { kind: 'spot', plot: 0, col: 0, row: 2 })
    tapOn(s, { kind: 'spot', plot: 1, col: 0, row: 0 })
    expect(s.keep).toEqual(keep)
  })

  it('levels a new empty plot when the waiting plot gets its first room, up to MAX_PLOTS', () => {
    const s = onStreet(keepWith([{ kind: 'row', roof: 'pointed', rooms: [] }], { concrete: 20 }))
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'material', material: 'concrete' })
    const events = tapOn(s, { kind: 'spot', plot: 0, col: 0, row: 0 })
    expect(events).toContainEqual(expect.objectContaining({ kind: 'newPlot', plot: 1 }))
    expect(s.keep.plots.length).toBe(2)
    expect([s.partyAt, s.rev, s.plotAt, s.roofAt]).toEqual([[-1, -1], [1, 0], [-1, s.tick - 1], [-1, -1]])
    tapOn(s, { kind: 'spot', plot: 0, col: 1, row: 0 })
    expect(s.keep.plots.length).toBe(2)
    const full = onStreet(keepWith([...Array.from({ length: MAX_PLOTS - 1 }, (_, i): Plot => ({ kind: 'tall', roof: 'pointed', rooms: [room(i + 1, 'small', 0, 0, 'planks', 'play')] })), { kind: 'tall', roof: 'pointed', rooms: [] }], { planks: 2 }))
    tapOn(full, { kind: 'plot', plot: MAX_PLOTS - 1 })
    expect(kinds(tapOn(full, { kind: 'spot', plot: MAX_PLOTS - 1, col: 0, row: 0 }))).not.toContain('newPlot')
    expect(full.keep.plots.length).toBe(MAX_PLOTS)
  })
})

describe('the hand', () => {
  /** A tall house: a wide room with a small one on its left half, and a small one beside. */
  const house = () => onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'wide', 0, 0, 'bricks', 'gym'), room(2, 'small', 0, 1, 'glass', 'cat'), room(3, 'small', 2, 0, 'planks', null)] }, empty()]))

  it('wiggles the room on top of one that holds others up, and lifts a free one', () => {
    const s = house()
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'hand', on: true })
    expect(offered(s, { kind: 'spot', plot: 0, col: 1, row: 1 })).toBe(false)
    const wiggle = tapOn(s, { kind: 'room', plot: 0, room: 1 })
    expect(wiggle.map(({ tick, ...e }) => e)).toEqual([{ kind: 'wiggle', plot: 0, room: 2 }])
    expect(s.playAt[2]).toBe(s.tick - 1)
    expect(s.lifted).toBe(-1)
    expect(kinds(tapOn(s, { kind: 'room', plot: 0, room: 2 }))).toContain('lift')
    expect([s.lifted, s.liftedAt]).toEqual([2, s.tick - 1])
    expect(s.shot).toEqual({ kind: 'plot', plot: 0 })
  })

  it('takes a lifted room back on a second tap and refunds exactly what it cost', () => {
    const s = house()
    const before = { ...s.keep.goods }
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'hand', on: true })
    tapOn(s, { kind: 'room', plot: 0, room: 2 })
    const events = tapOn(s, { kind: 'room', plot: 0, room: 2 })
    expect(events).toContainEqual(expect.objectContaining({ kind: 'takeBack', plot: 0, room: 2 }))
    expect(s.keep.goods).toEqual({ ...before, glass: before.glass + roomCost('small') })
    expect(s.keep.plots[0]!.rooms.map((r) => r.id)).toEqual([1, 3])
    expect(s).toMatchObject({ lifted: -1, craneRoom: 2, craneOut: true, rev: [1, 0] })
    expect(s.gone.map((g) => g.room.id)).toEqual([2])
    expect(s.flights.filter((f) => same(f.from, { kind: 'room', plot: 0, room: 2 })).length).toBe(roomCost('small'))
    expect(placePoint(s, { kind: 'room', plot: 0, room: 2 })).toEqual(centre(roomRect(0, room(2, 'small', 0, 1, 'glass', null))))
    run(s, ticks(LOWER + FLY_FOR) + 10)
    expect(s.gone).toEqual([])
    expect(s.craneRoom).toBe(-1)
    // Built and taken back through the rules, every good comes home.
    s.material = 'planks'
    s.keep.goods.planks = 9
    doing(s, { kind: 'hand', on: false })
    doing(s, { kind: 'shape', shape: 'tall' })
    tapOn(s, { kind: 'spot', plot: 0, col: 2, row: 1 })
    expect(s.keep.goods.planks).toBe(5)
    doing(s, { kind: 'hand', on: true })
    const id = s.keep.nextId - 1
    tapOn(s, { kind: 'room', plot: 0, room: id })
    tapOn(s, { kind: 'room', plot: 0, room: id })
    expect(s.keep.goods.planks).toBe(9)
  })

  it('goes away when a material or a shape is picked, or the shot changes, so the ghosts show again', () => {
    for (const pick of [{ kind: 'material', material: 'planks' }, { kind: 'shape', shape: 'small' }, { kind: 'back' }] as const) {
      const s = house()
      s.keep.goods.planks = 4
      tapOn(s, { kind: 'plot', plot: 0 })
      doing(s, { kind: 'hand', on: true })
      tapOn(s, { kind: 'room', plot: 0, room: 3 })
      expect([s.hand, s.lifted, offered(s, { kind: 'spot', plot: 0, col: 1, row: 1 })]).toEqual([true, 3, false])
      doing(s, pick)
      expect([s.hand, s.lifted], pick.kind).toEqual([false, -1])
      if (pick.kind === 'back') tapOn(s, { kind: 'plot', plot: 0 })
      expect(offered(s, { kind: 'spot', plot: 0, col: 1, row: 1 }), pick.kind).toBe(true)
    }
  })

  it('sets a lifted room down on any other tap, a turned-off hand or a new shot', () => {
    const s = house()
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'hand', on: true })
    const lift = () => {
      tapOn(s, { kind: 'room', plot: 0, room: 3 })
      expect(s.lifted).toBe(3)
    }
    lift()
    tapOn(s, { kind: 'none' })
    expect(s.lifted).toBe(-1)
    lift()
    tapOn(s, { kind: 'room', plot: 0, room: 2 })
    expect(s.lifted).toBe(2)
    lift()
    doing(s, { kind: 'hand', on: false })
    expect(s.lifted).toBe(-1)
    doing(s, { kind: 'hand', on: true })
    lift()
    doing(s, { kind: 'back' })
    expect(s.lifted).toBe(-1)
    expect(s.keep.plots[0]!.rooms.length).toBe(3)
  })
})

describe('rooms', () => {
  const furnished = () => onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', 'play'), room(2, 'small', 1, 0, 'bricks', null), room(3, 'small', 0, 1, 'glass', 'disco')] }, empty()]))
  const inRoom = (id: number) => {
    const s = furnished()
    tapOn(s, { kind: 'plot', plot: 0 })
    tapOn(s, { kind: 'room', plot: 0, room: id })
    return s
  }

  it('zoom in and the builder visits, doing the theme thing', () => {
    const s = inRoom(1)
    expect(s.shot).toEqual({ kind: 'room', plot: 0, room: 1 })
    expect(s.builder).toMatchObject({ at: { kind: 'room', plot: 0, room: 1 }, pose: THEME_VISIT.play })
    expect(offered(s, { kind: 'builder' })).toBe(true)
    const again = tapOn(s, { kind: 'builder' })
    expect(again).toContainEqual(expect.objectContaining({ kind: 'visit', theme: 'play' }))
    expect(s.builder.poseAt).toBe(s.tick - 1)
    expect(kinds(tapOn(s, { kind: 'room', plot: 0, room: 1 }))).toContain('tap')
    expect(s.playAt[1]).toBe(s.tick - 1)
  })

  it('ask which room for a bare one, keep what is in it and fill the rest without twins', () => {
    const s = inRoom(2)
    expect(s.ask).toEqual({ kind: 'theme', plot: 0, room: 2 })
    expect(s.builder).toMatchObject({ at: { kind: 'room', plot: 0, room: 2 }, pose: 'stand' })
    roomOf(s, 0, 2).items = [null, null, null, 'blockTower']
    doing(s, { kind: 'theme', theme: 'bath' })
    expect(s.ask).not.toBeNull()
    const events = doing(s, { kind: 'theme', theme: 'play' })
    expect(kinds(events)).toEqual(expect.arrayContaining(['theme', 'visit']))
    expect(roomOf(s, 0, 2)).toMatchObject({ theme: 'play', items: ['planeMobile', 'toyShelf', null, 'blockTower'] })
    expect(s.builder.pose).toBe(THEME_VISIT.play)
    doing(s, { kind: 'askTheme' })
    expect(s.ask).toEqual({ kind: 'theme', plot: 0, room: 2 })
    doing(s, { kind: 'theme', theme: null })
    expect(s.ask).toBeNull()
    expect(roomOf(s, 0, 2).theme).toBe('play')
    s.keep.unlocked.push('theme:bath')
    doing(s, { kind: 'askTheme' })
    doing(s, { kind: 'theme', theme: 'bath' })
    expect(roomOf(s, 0, 2)).toMatchObject({ theme: 'bath', items: defaultItems('bath', 'small') })
  })

  it("make another room of a furnished one: the things of the theme it had make way for the new theme's, and what came from other themes stays", () => {
    for (const shape of SHAPES) {
      const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, shape, 0, 0, 'planks', 'disco')] }, empty()]))
      s.keep.unlocked.push('theme:space')
      const r = roomOf(s, 0, 1)
      const slots = slotsOf(shape)
      // Every slot full: disco's own things, the rest from other themes, and the sleep room's teddy where the dancer was.
      const spare = (['play', 'gym', 'music', 'crafts', 'cat'] as const).flatMap((theme) => themeItems(theme))
      const fill = (i: number): ItemId => {
        const at = spare.findIndex((id) => ITEMS[id].slot === slots[i]!.kind)
        if (at < 0) throw new Error(`no spare ${slots[i]!.kind} item`)
        return spare.splice(at, 1)[0]!
      }
      r.items = r.items.map((item, i) => (item === 'dancer' ? 'teddyBear' : (item ?? fill(i))))
      const before = r.items.map((item) => item!)
      expect(before, shape).toContain('teddyBear')
      tapOn(s, { kind: 'plot', plot: 0 })
      tapOn(s, { kind: 'room', plot: 0, room: 1 })
      doing(s, { kind: 'askTheme' })
      doing(s, { kind: 'theme', theme: 'space' })
      const disco = (item: ItemId) => ITEMS[item].theme === 'disco'
      const kept = before.filter((item) => !disco(item))
      const space = defaultItems('space', shape)
      expect(r.items, shape).toEqual(before.map((item, i) => (!disco(item) ? item : space[i] !== null && !kept.includes(space[i]!) ? space[i] : null)))
      expect(r.items.filter((item) => item !== null && disco(item)), shape).toEqual([])
      expect(r.items.filter((item) => item !== null && ITEMS[item].theme === 'space').length, shape).toBeGreaterThan(0)
      // The same room again only fills what is free.
      doing(s, { kind: 'item', item: kept[0]! })
      const now = r.items.slice()
      doing(s, { kind: 'askTheme' })
      doing(s, { kind: 'theme', theme: 'space' })
      expect(r.items.filter((item, i) => item !== now[i] && now[i] !== null), shape).toEqual([])
    }
  })

  it('put floor things beside the visiting builder while a slot clear of them is free, and pop them to the middle, in front of the things, when one goes where they stand', () => {
    for (const shape of SHAPES) {
      const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, shape, 0, 0, 'planks', 'play')] }, empty()]))
      const r = roomOf(s, 0, 1)
      const floors = slotsOf(shape).flatMap((sl, i) => (sl.kind === 'floor' ? [i] : []))
      r.items = r.items.map((item, i) => (floors.includes(i) ? null : item))
      tapOn(s, { kind: 'plot', plot: 0 })
      tapOn(s, { kind: 'room', plot: 0, room: 1 })
      // The visit starts at the first floor slot, in front of it and clear of the others.
      const x = visitPoint(0, r).x
      const under = floors[0]!
      expect(coverOf(0, r, under, x), shape).toBeCloseTo(VISITOR.w)
      expect(floors.filter((i) => i !== under && coverOf(0, r, i, x) > 0), shape).toEqual([])
      expect(s.builder.at).toEqual({ kind: 'room', plot: 0, room: 1, x })
      const target = () => targets(s).find((t) => t.hit.kind === 'builder')!.rect
      const before = target()
      // Each floor thing goes in a free slot beside them, and they stay put; a tap on them is another visit, on the same spot.
      const things = ['rockingHorse', 'blockTower', 'toyKid', 'ballPit', 'trampoline'] as const
      for (const item of things.slice(0, floors.length - 1)) {
        doing(s, { kind: 'item', item })
        expect(coverOf(0, r, r.items.indexOf(item), x), `${shape} ${item}`).toBe(0)
        expect(s.builder.at, `${shape} ${item}`).toEqual({ kind: 'room', plot: 0, room: 1, x })
        expect(target(), `${shape} ${item}`).toEqual(before)
        tapOn(s, { kind: 'builder' })
        expect(s.builder.at, `${shape} ${item}`).toEqual({ kind: 'room', plot: 0, room: 1, x })
      }
      // The one free slot left is where they stand: the thing goes there, and they pop to the room's middle as it lands, between two floor slots, hiding at most a sliver of either.
      const last = things[floors.length - 1]!
      doing(s, { kind: 'item', item: last })
      const middle = centre(roomRect(0, r)).x
      expect(r.items[under], shape).toBe(last)
      expect(s.builder, shape).toMatchObject({ at: { kind: 'room', plot: 0, room: 1, x: middle }, fromX: middle, movedAt: s.tick - 1 })
      for (const i of floors) expect(coverOf(0, r, i, middle), `${shape} slot ${i}`).toBeLessThanOrEqual(0.25)
      expect(centre(target()).x, shape).toBeCloseTo(middle)
      // More things take the oldest one's place, and the builder stays in front of them.
      for (const item of things.slice(floors.length)) {
        doing(s, { kind: 'item', item })
        expect(s.builder.at, `${shape} ${item}`).toEqual({ kind: 'room', plot: 0, room: 1, x: middle })
      }
      expect(r.items.filter((item) => item !== null && ITEMS[item].slot === 'floor').length).toBe(floors.length)
      // A bare room: the visit starts at its first floor slot, and the theme's own three floor things filling it pop them aside too: to the floor slot a wide room still has free, else to the middle.
      const bare = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, shape, 0, 0, 'planks', null)] }, empty()]))
      tapOn(bare, { kind: 'plot', plot: 0 })
      tapOn(bare, { kind: 'room', plot: 0, room: 1 })
      const b = roomOf(bare, 0, 1)
      expect(bare.builder.at, shape).toEqual({ kind: 'room', plot: 0, room: 1, x: visitPoint(0, b).x })
      doing(bare, { kind: 'theme', theme: 'play' })
      expect(b.items[floors[0]!], shape).not.toBeNull()
      const aside = floors.length > 3 ? roomRect(0, b).x + slotsOf(shape)[floors[3]!]!.x : centre(roomRect(0, b)).x
      expect(bare.builder.at, shape).toEqual({ kind: 'room', plot: 0, room: 1, x: aside })
    }
  })

  it('never leave a floor thing put in behind the visiting builder while a slot clear of them was free, and keep them where they hide the least, in every shape of room', () => {
    for (const shape of SHAPES) {
      const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, shape, 0, 0, 'planks', 'play')] }, empty()]))
      const things = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].slot === 'floor' && themeOpen(s.keep.unlocked, ITEMS[id].theme))
      tapOn(s, { kind: 'plot', plot: 0 })
      tapOn(s, { kind: 'room', plot: 0, room: 1 })
      const r = roomOf(s, 0, 1)
      const floors = slotsOf(shape).flatMap((sl, i) => (sl.kind === 'floor' ? [i] : []))
      const x = () => {
        const at = s.builder.at
        if (at.kind !== 'room') throw new Error(`the builder is at ${at.kind}`)
        return at.x
      }
      const hides = (i: number) => (r.items[i] === null ? 0 : coverOf(0, r, i, x()))
      const u = rng(shape.length)
      // The child takes floor things out and puts others in, as they like.
      for (let k = 0; k < 300; k++) {
        const there = floors.filter((i) => r.items[i] !== null)
        if (there.length > 0 && u() < 0.4) {
          doing(s, { kind: 'item', item: r.items[there[between(u(), 0, there.length - 1)]!]! })
          continue
        }
        const out = things.filter((id) => !r.items.includes(id))
        const item = out[between(u(), 0, out.length - 1)]!
        const clear = floors.some((i) => r.items[i] === null && coverOf(0, r, i, x()) === 0)
        doing(s, { kind: 'item', item })
        const what = `${shape} step ${k}`
        if (clear) expect(coverOf(0, r, r.items.indexOf(item), x()), what).toBe(0)
        // A floor slot still free: they hide nothing. Every one taken: they stand at the middle, between two, hiding a sliver of each.
        if (floors.some((i) => r.items[i] === null)) expect(floors.map(hides), what).toEqual(floors.map(() => 0))
        else {
          expect(x(), what).toBeCloseTo(centre(roomRect(0, r)).x)
          expect(Math.max(...floors.map(hides)), what).toBeLessThanOrEqual(0.25)
        }
      }
    }
  })

  it('take an item out from the tray, put one in the first free slot of its kind, or in place of the oldest', () => {
    const s = inRoom(1)
    const r = roomOf(s, 0, 1)
    expect(r.items).toEqual(['planeMobile', 'toyShelf', 'blockTower', 'toyKid'])
    expect(kinds(doing(s, { kind: 'item', item: 'toyKid' }))).toContain('itemOut')
    expect(r.items[3]).toBeNull()
    expect(kinds(doing(s, { kind: 'item', item: 'rockingHorse' }))).toContain('itemIn')
    expect(r.items[3]).toBe('rockingHorse')
    // Floors full: the block tower has been there longest.
    doing(s, { kind: 'item', item: 'toyKid' })
    expect(r.items).toEqual(['planeMobile', 'toyShelf', 'toyKid', 'rockingHorse'])
    run(s, 3)
    doing(s, { kind: 'item', item: 'ballPit' })
    expect(r.items).toEqual(['planeMobile', 'toyShelf', 'toyKid', 'ballPit'])
    doing(s, { kind: 'item', item: 'discoBall' })
    expect(r.items[0]).toBe('discoBall')
    const locked = r.items.slice()
    doing(s, { kind: 'item', item: 'rocket' })
    expect(r.items).toEqual(locked)
    for (const shape of ['small', 'wide', 'tall', 'big'] as const) expect(slotsOf(shape).map((sl) => sl.kind)).toEqual(expect.arrayContaining(['ceiling', 'wall', 'floor']))
  })

  it('play an item on a tap, and paint the walls and the floor round four colourings', () => {
    const s = inRoom(3)
    expect(offered(s, { kind: 'item', plot: 0, room: 3, slot: 2 })).toBe(true)
    const play = tapOn(s, { kind: 'item', plot: 0, room: 3, slot: 2 })
    expect(play).toContainEqual(expect.objectContaining({ kind: 'play', item: 'speaker' }))
    expect(s.playAt['3:2']).toBe(s.tick - 1)
    const rev = s.rev[0]!
    const walls = [1, 2, 3, 0].map(() => {
      doing(s, { kind: 'paint', what: 'wall' })
      return roomOf(s, 0, 3).wall
    })
    expect(walls).toEqual([1, 2, 3, 0])
    expect(kinds(doing(s, { kind: 'paint', what: 'floor' }))).toContain('paint')
    expect(roomOf(s, 0, 3).floor).toBe(1)
    expect(s.rev[0]).toBe(rev + 5)
  })

  it('cycle the roof on a tap, and ring a party from the bottom floor up', () => {
    const s = furnished()
    tapOn(s, { kind: 'plot', plot: 0 })
    const roofs = ['round', 'garden', 'tower', 'pointed'].map(() => {
      expect(kinds(tapOn(s, { kind: 'roof', plot: 0 }))).toContain('roof')
      return s.keep.plots[0]!.roof
    })
    expect(roofs).toEqual(['round', 'garden', 'tower', 'pointed'])
    expect(s.roofAt[0]).toBe(s.tick - 1)
    const events = doing(s, { kind: 'doorbell' })
    const t0 = s.tick - 1
    expect(events).toContainEqual(expect.objectContaining({ kind: 'doorbell', plot: 0 }))
    const party = [...events, ...run(s, 3 * ticks(PARTY_EVERY) + 2)]
    expect(party.filter((e) => e.kind === 'play').map((e) => e.tick)).toEqual([...Array(4).fill(t0 + 1), ...Array(4).fill(t0 + 1 + 2 * ticks(PARTY_EVERY))])
    expect([s.playAt[1], s.playAt[2], s.playAt[3]]).toEqual([t0 + 1, t0 + 1 + ticks(PARTY_EVERY), t0 + 1 + 2 * ticks(PARTY_EVERY)])
    expect(s.playAt['3:0']).toBe(t0 + 1 + 2 * ticks(PARTY_EVERY))
    expect(s.partyAt[0]).toBe(-1)
    const bare = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }]))
    tapOn(bare, { kind: 'plot', plot: 0 })
    expect(kinds(doing(bare, { kind: 'doorbell' }))).toEqual([])
    expect(offered(bare, { kind: 'door', plot: 0 })).toBe(false)
  })

  it("turn the roof from the tray's button too, in the build view only", () => {
    const s = furnished()
    doing(s, { kind: 'roof' })
    expect(s.keep.plots[0]!.roof).toBe('pointed')
    tapOn(s, { kind: 'plot', plot: 0 })
    expect(doing(s, { kind: 'roof' })).toContainEqual(expect.objectContaining({ kind: 'roof', plot: 0 }))
    expect(s.keep.plots[0]!.roof).toBe('round')
    expect(s.roofAt[0]).toBe(s.tick - 1)
    tapOn(s, { kind: 'room', plot: 0, room: 1 })
    doing(s, { kind: 'roof' })
    expect(s.keep.plots[0]!.roof).toBe('round')
  })

  it('ring the doorbell party from a front door', () => {
    const s = furnished()
    tapOn(s, { kind: 'plot', plot: 0 })
    expect(offered(s, { kind: 'door', plot: 0 })).toBe(true)
    const events = tapOn(s, { kind: 'door', plot: 0 })
    expect(events).toContainEqual(expect.objectContaining({ kind: 'doorbell', plot: 0 }))
    expect(s.partyAt[0]).toBe(s.tick - 1)
  })
})

describe('shots', () => {
  it('go back one at a time: a question, the room, the house, the mirror', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', null)] }, empty()]))
    tapOn(s, { kind: 'plot', plot: 0 })
    tapOn(s, { kind: 'room', plot: 0, room: 1 })
    expect(s.ask).not.toBeNull()
    doing(s, { kind: 'back' })
    expect([s.ask, s.shot.kind]).toEqual([null, 'room'])
    const zoom = doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'plot', plot: 0 })
    expect(s.shotFrom).toEqual({ kind: 'room', plot: 0, room: 1 })
    expect(s.shotAt).toBe(s.tick - 1)
    expect(kinds(zoom)).toContain('zoom')
    // Out on the street at the next step: with nothing to build with, the truck.
    doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'street', x: TRUCK_HOME_X })
    expect(kinds(doing(s, { kind: 'back' }))).toEqual([])
    doing(s, { kind: 'mirror' })
    expect(s.shot).toEqual({ kind: 'mirror' })
    doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    tapOn(s, { kind: 'truck' })
    doing(s, { kind: 'mirror' })
    expect(s.shot).toEqual({ kind: 'road' })
    doing(s, { kind: 'back' })
    run(s, ticks(HOME_BEAT))
    expect(s.shot.kind).toBe('street')
    expect(s.road).toBeNull()
  })

  it('pan the street within its ends, and only on the street', () => {
    const s = onStreet(freshKeep())
    doing(s, { kind: 'pan', x: 1000 })
    expect(s.shot).toEqual({ kind: 'street', x: streetEnd(1) })
    doing(s, { kind: 'pan', x: -5 })
    expect(s.shot).toEqual({ kind: 'street', x: 0 })
    doing(s, { kind: 'pan', x: 33 })
    expect(s.shot).toEqual({ kind: 'street', x: 33 })
    doing(s, { kind: 'mirror' })
    doing(s, { kind: 'pan', x: 40 })
    expect(s.shot).toEqual({ kind: 'mirror' })
  })

  it('close a question on a tap outside it, and show a pressed spot only while it is offered', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }], { planks: 4 }))
    s.keep.trips = 1
    tapOn(s, { kind: 'truck' })
    expect(s.ask).toEqual({ kind: 'road' })
    tapOn(s, { kind: 'truck' })
    expect(s.ask).toBeNull()
    expect(s.road).toBeNull()
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'press', hit: { kind: 'spot', plot: 0, col: 1, row: 0 } })
    expect(s.press).toEqual({ hit: { kind: 'spot', plot: 0, col: 1, row: 0 }, at: s.tick - 1 })
    doing(s, { kind: 'press', hit: { kind: 'spot', plot: 0, col: 1, row: 3 } })
    expect(s.press).toBeNull()
    doing(s, { kind: 'press', hit: { kind: 'spot', plot: 0, col: 1, row: 0 } })
    tapOn(s, { kind: 'spot', plot: 0, col: 1, row: 0 })
    expect(s.press).toBeNull()
    expect(s.keep.plots[0]!.rooms.length).toBe(1)
  })
})

/**
 * The yard played on a w x h screen as a child plays it: the machine bouncing is tapped (a
 * crate until it opens) once the camera has settled with half its station or more on screen,
 * a beat apart, and nothing else; the camera's street x at the start and after each move, in order.
 */
function playYard(s: State, w: number, h: number, seconds: number): number[] {
  s.screen = { w, h }
  const xs: number[] = []
  let tapped = -Infinity
  for (let k = 0; k < ticks(seconds); k++) {
    run(s, 1)
    const shot = s.shot
    if (shot.kind !== 'street') throw new Error(`the yard on the ${shot.kind} shot`)
    if (xs.at(-1) !== shot.x) xs.push(shot.x)
    const hint = s.hint
    if (hint === null || hint.kind !== 'machine' || tweening(s, simTime(s)) || s.tick - tapped < ticks(0.3)) continue
    const v = viewAt(s, Infinity, w, h, 1)
    const c = middleOf(hint.m)
    if (c < v.x0 || c > v.x0 + w / v.ppm) continue
    tapOn(s, hint)
    tapped = s.tick
  }
  return xs
}
const middleOf = (m: MachineId) => centre(stationRect(m)).x

describe('the hint', () => {
  it('bounces one next step on the street: a crate, a machine with goods, the house, the truck', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }]))
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'truck' })
    s.keep.goods.planks = 2
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    s.keep.machines.oven = 'built'
    s.keep.goods.clay = 1
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'machine', m: 'oven' })
    s.keep.machines.rainbow = 'crate'
    run(s, 1)
    // Both out of sight of the garage: the nearer comes first, crate or not. A screen that shows both puts the crate first.
    expect(s.hint).toEqual({ kind: 'machine', m: 'oven' })
    s.screen = { w: 1920, h: 1000 }
    doing(s, { kind: 'pan', x: (middleOf('oven') + middleOf('rainbow')) / 2 })
    expect(s.hint).toEqual({ kind: 'machine', m: 'rainbow' })
    for (let i = 0; i < 3; i++) tapOn(s, { kind: 'machine', m: 'rainbow' })
    tapOn(s, { kind: 'machine', m: 'oven' })
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    tapOn(s, { kind: 'plot', plot: 0 })
    expect(s.hint).toBeNull()
  })

  it('sends the hand after HINT_IDLE seconds without a touch, and again after as long', () => {
    const s = onStreet(freshKeep())
    s.shot = { kind: 'street', x: TRUCK_HOME_X + HINT_NEAR }
    run(s, ticks(HINT_IDLE) - 1)
    expect(s.handAt).toBe(-1)
    run(s, 1)
    expect(s.handAt).toBe(ticks(HINT_IDLE))
    expect(s.shot).toEqual({ kind: 'street', x: TRUCK_HOME_X + HINT_NEAR })
    run(s, ticks(HINT_IDLE))
    expect(s.handAt).toBe(2 * ticks(HINT_IDLE))
    doing(s, { kind: 'sound', on: false })
    const touched = s.tick - 1
    run(s, ticks(HINT_IDLE))
    expect(s.handAt).toBe(touched + ticks(HINT_IDLE))
  })

  it('brings a hinted thing out of sight into view before the hand taps it, at any screen size', () => {
    /** The hint's target lies inside the picture the HUD leaves free, at these screen sizes, once the camera has settled. */
    const inView = (s: State) =>
      [[1180, 820], [1024, 768], [820, 1180], [1920, 1000]].every(([w, h]) => {
        const v = viewAt(s, simTime(s) + SHOT_TWEEN, w!, h!, 1)
        const ins = insets(s.shot, w!, h!)
        const c = centre(targets(s).find((t) => same(t.hit, s.hint!))!.rect)
        const [x, y] = toScreen(v, c.x, c.y)
        return x >= ins.left && x <= w! - ins.right && y >= ins.top && y <= h! - ins.bottom
      })
    // The first trip home, both crates opened and run: the plot comes next, far right of the yard, and a beat later the camera has brought it in, the hand not yet come.
    const s = onStreet(freshKeep())
    trip(s, ['log', 'log', 'log', 'log', 'rock', 'rock', 'rock'], true)
    while (unloading(s)) run(s, 1)
    for (const m of ['sawmill', 'mixer'] as const) for (let k = 0; k < 4; k++) tapOn(s, { kind: 'machine', m })
    const touched = s.tick - 1
    run(s, 5 * ticks(BATCH))
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
    expect(s.handAt).toBe(-1)
    expect(inView(s)).toBe(true)
    // The hand keeps its own time, and finds the plot in view.
    run(s, touched + ticks(HINT_IDLE) - s.tick)
    expect(s.handAt).toBe(s.tick)
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
    // In the house with nothing left to build with, Back goes out to the truck, the next thing.
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'house', house: 'tall' })
    for (const spot of [{ col: 0, row: 0 }, { col: 1, row: 0 }]) tapOn(s, { kind: 'spot', plot: 0, ...spot })
    run(s, ticks(LOWER + HAMMER) + 1)
    while (s.ask !== null) doing(s, { kind: 'theme', theme: 'play' })
    for (const m of MATERIALS) s.keep.goods[m] = 0
    doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'street', x: TRUCK_HOME_X })
    expect(s.hint).toEqual({ kind: 'truck' })
    expect(inView(s)).toBe(true)
  })

  it('glances at a thing that comes up out of sight on the screen drawn, a beat after it does with no touch, and never after a drag', () => {
    const s = onStreet(keepWith([empty()]))
    s.screen = { w: 1180, h: 820 }
    for (const m of MACHINES) s.keep.machines[m] = 'built'
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'truck' })
    // Clay on the oven's heap: the oven is in sight on an iPad's street (from the garage wall), so the camera stays.
    s.keep.goods.clay = 1
    run(s, ticks(GLANCE) + 2)
    expect(s.hint).toEqual({ kind: 'machine', m: 'oven' })
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    // Sand on the glassworks' heap instead: out of sight. A touch in the beat puts the glance off until a beat after it.
    s.keep.goods.clay = 0
    s.keep.goods.sand = 1
    run(s, ticks(GLANCE) - 10)
    expect(s.hint).toEqual({ kind: 'machine', m: 'glassworks' })
    doing(s, { kind: 'sound', on: false })
    const touched = s.tick - 1
    run(s, touched + ticks(GLANCE) - s.tick - 1)
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    const glance = run(s, 1)
    expect(kinds(glance)).toEqual(['zoom'])
    expect(s.shot).toEqual({ kind: 'street', x: targetMiddle(s, { kind: 'machine', m: 'glassworks' }) })
    expect(s.handAt).toBe(-1)
    // The camera settles there and stays.
    run(s, ticks(SHOT_TWEEN + GLANCE) + 2)
    expect(s.shotAt).toBe(touched + ticks(GLANCE))
    // The truck comes up next, out of sight, and a drag in the beat looks elsewhere: the camera stays where the child left it.
    s.keep.goods.sand = 0
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'truck' })
    doing(s, { kind: 'pan', x: 70 })
    run(s, 3 * ticks(GLANCE))
    expect(s.shot).toEqual({ kind: 'street', x: 70 })
  })

  it('glances once the street settles from Go!, at a phone held upright as at an iPad', () => {
    for (const screen of [{ w: 820, h: 1180 }, { w: 1180, h: 820 }]) {
      const s = createState(keepWith([empty()], { planks: 2 }), 7, true)
      s.screen = screen
      doing(s, { kind: 'go' })
      const went = s.tick - 1
      expect(s.shot).toEqual({ kind: 'street', x: START_X })
      run(s, went + ticks(SHOT_TWEEN + GLANCE) - s.tick - 1)
      expect(s.shot).toEqual({ kind: 'street', x: START_X })
      run(s, 1)
      expect(s.shot, `${screen.w}x${screen.h}`).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
      expect(s.handAt).toBe(-1)
    }
  })

  it('picks the crate in sight, else the machine with goods in sight, else what is out of sight on the garage\'s side, each the nearest the camera, so the camera never comes back across the yard', () => {
    const keep = keepWith([empty()], { log: 1, rock: 1, sand: 1 })
    keep.machines.sawmill = 'crate'
    keep.machines.glassworks = 'crate'
    keep.machines.mixer = 'built'
    const s = onStreet(keep)
    const hintAt = (x: number) => {
      doing(s, { kind: 'pan', x })
      return s.hint
    }
    expect(hintAt(machineSpot('sawmill'))).toEqual({ kind: 'machine', m: 'sawmill' })
    expect(hintAt(machineSpot('glassworks') - 2)).toEqual({ kind: 'machine', m: 'glassworks' })
    for (let k = 0; k < 3; k++) for (const m of ['sawmill', 'glassworks'] as const) tapOn(s, { kind: 'machine', m })
    // Three machines with goods: from the mixer, the mixer; it runs, and the next is the sawmill on the garage's side, though the glassworks is nearer: the camera goes on from there to the glassworks and the houses.
    expect(hintAt(machineSpot('mixer'))).toEqual({ kind: 'machine', m: 'mixer' })
    tapOn(s, { kind: 'machine', m: 'mixer' })
    expect(s.hint).toEqual({ kind: 'machine', m: 'sawmill' })
    expect(hintAt(machineSpot('glassworks') + 3)).toEqual({ kind: 'machine', m: 'glassworks' })
    expect(hintAt(machineSpot('oven'))).toEqual({ kind: 'machine', m: 'sawmill' })
  })

  it('finishes the side of the yard in view before the camera glides once to the other side: the first trip on phones held upright', () => {
    // Half the mixer's station shows from the yard view on an iPad held upright: its crate and machine first, then the sawmill's, then the plot. A narrower phone shows neither: the sawmill's side, the garage's, first.
    for (const [w, h, xs] of [[820, 1180, ['sawmill']], [390, 844, ['sawmill', 'mixer']]] as const) {
      const s = onStreet(freshKeep())
      s.screen = { w, h }
      trip(s, ['log', 'log', 'log', 'log', 'rock', 'rock', 'rock'], true)
      expect(playYard(s, w, h, 30), `${w}x${h}`).toEqual([YARD_VIEW_X, ...xs.map(middleOf), houseMiddle(s, 0)])
      expect(s.keep.machines).toMatchObject({ sawmill: 'built', mixer: 'built' })
      expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    }
  })

  it('finishes the side of the yard in view before the camera glides once to the other side: five machines on the second trip, upright and on its side', () => {
    // What is in sight from the yard view first, the oven's crate before the machines; then on a phone the sawmill's side, the garage's, once; then along the yard to the plot, never back.
    for (const [w, h, xs] of [
      [820, 1180, ['sawmill', 'glassworks', 'rainbow']],
      [390, 844, ['sawmill', 'mixer', 'glassworks', 'rainbow']],
      [1180, 820, ['rainbow']],
    ] as const) {
      const keep = keepWith([empty()])
      keep.trips = 1
      keep.machines.sawmill = keep.machines.mixer = 'built'
      const s = onStreet(keep)
      s.screen = { w, h }
      trip(s, ['log', 'log', 'clay', 'clay', 'rock', 'rock', 'sand', 'sand', 'gem'], true)
      expect(s.keep.machines).toMatchObject({ oven: 'crate', glassworks: 'crate', rainbow: 'crate' })
      expect(playYard(s, w, h, 60), `${w}x${h}`).toEqual([YARD_VIEW_X, ...xs.map(middleOf), houseMiddle(s, 0)])
      expect(MACHINES.every((m) => s.keep.machines[m] === 'built')).toBe(true)
    }
  })

  it('finishes the side of the yard in view before the camera glides once to the other side: a new crate far off with machines ready on the way', () => {
    // From the sawmill, the mixer and the glassworks have goods and the rainbow machine's crate stands at the yard's far end: the camera walks to each in turn, never past one and back.
    for (const [w, h, xs] of [
      [820, 1180, ['mixer', 'glassworks', 'rainbow']],
      [390, 844, ['mixer', 'glassworks', 'rainbow']],
      [1180, 820, ['mixer', 'rainbow']],
    ] as const) {
      const keep = keepWith([empty()], { rock: 4, sand: 4 })
      keep.trips = 3
      keep.machines.sawmill = keep.machines.mixer = keep.machines.oven = keep.machines.glassworks = 'built'
      keep.machines.rainbow = 'crate'
      const s = onStreet(keep)
      s.screen = { w, h }
      doing(s, { kind: 'pan', x: middleOf('sawmill') })
      expect(playYard(s, w, h, 60), `${w}x${h}`).toEqual([middleOf('sawmill'), ...xs.map(middleOf), houseMiddle(s, 0)])
      expect(s.keep.machines.rainbow).toBe('built')
    }
  })

  it('stays on the yard while the machines in view make things, and glances a beat after they are done', () => {
    const s = onStreet(freshKeep())
    s.screen = { w: 1180, h: 820 }
    trip(s, ['log', 'log', 'log', 'log', 'rock', 'rock', 'rock'], true)
    run(s, presentOpenAt(s) + ticks(PRESENT_FOR) - s.tick)
    for (const m of ['sawmill', 'mixer'] as const) for (let k = 0; k < 3; k++) tapOn(s, { kind: 'machine', m })
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    run(s, ticks(1))
    tapOn(s, { kind: 'machine', m: 'mixer' })
    // The planks pay for a room while both still run: the plot bounces, and the camera stays until a beat after the last block lands.
    let busyAt = -1
    while (s.shot.kind === 'street' && s.shot.x === YARD_VIEW_X) {
      run(s, 1)
      if (MACHINES.some((m) => s.machines[m].on) || s.flights.some((f) => f.to.kind === 'stack')) {
        busyAt = s.tick
        expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
      }
    }
    expect(busyAt).toBeGreaterThan(0)
    expect(s.tick).toBe(busyAt + ticks(GLANCE))
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
  })

  it('stays while a machine runs with only part of it on screen, and glances a beat after it is done', () => {
    // A phone held upright at the yard view shows the mixer's heap at its right edge, not half the station: the mixer bounces out of sight, and the child taps its heap.
    const keep = keepWith([empty()], { rock: 3, sand: 1 })
    keep.machines.mixer = keep.machines.glassworks = 'built'
    const s = onStreet(keep)
    s.screen = { w: 390, h: 844 }
    doing(s, { kind: 'pan', x: YARD_VIEW_X })
    expect(s.hint).toEqual({ kind: 'machine', m: 'mixer' })
    tapOn(s, { kind: 'machine', m: 'mixer' })
    const tapped = s.tick - 1
    expect(s.hint).toEqual({ kind: 'machine', m: 'glassworks' })
    let busyAt = -1
    while (same(s.shot, { kind: 'street', x: YARD_VIEW_X })) {
      run(s, 1)
      if (s.machines.mixer.on || s.flights.some((f) => f.to.kind === 'stack')) busyAt = s.tick
    }
    expect(busyAt - tapped).toBeGreaterThan(ticks(GLANCE))
    expect(s.tick).toBe(busyAt + ticks(GLANCE))
    expect(s.shot).toEqual({ kind: 'street', x: middleOf('glassworks') })
  })

  it('holds the hand as it holds the glance while a machine in view makes things for longer than the hand waits', () => {
    for (const [w, h] of [[1180, 820], [820, 1180]] as const) {
      // Twelve logs for the sawmill, the camera on it: the planks pay for a room, and the plot bounces out of sight.
      const keep = keepWith([empty()], { log: 12 })
      keep.trips = 2
      keep.machines.sawmill = keep.machines.mixer = 'built'
      const s = onStreet(keep)
      s.screen = { w, h }
      doing(s, { kind: 'pan', x: middleOf('sawmill') })
      run(s, ticks(1))
      tapOn(s, { kind: 'machine', m: 'sawmill' })
      const tapped = s.tick - 1
      let busyAt = -1
      for (;;) {
        run(s, 1)
        if (!same(s.shot, { kind: 'street', x: middleOf('sawmill') })) break
        if (s.machines.sawmill.on || s.flights.some((f) => f.to.kind === 'stack')) busyAt = s.tick
        expect(s.handAt, `${w}x${h}`).toBe(-1)
      }
      // The sawmill ran past the hand's wait; the camera glides a beat after it is done, and the hand taps the plot once the camera has settled there.
      expect(busyAt - tapped, `${w}x${h}`).toBeGreaterThan(ticks(HINT_IDLE))
      expect(s.tick, `${w}x${h}`).toBe(busyAt + ticks(GLANCE))
      expect(s.hint, `${w}x${h}`).toEqual({ kind: 'plot', plot: 0 })
      expect(s.shot, `${w}x${h}`).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
      expect(s.handAt, `${w}x${h}`).toBe(s.tick + ticks(SHOT_TWEEN))
    }
  })

  it('holds the glance and the hand while a finger is down on the canvas, until a beat after it lifts', () => {
    const s = onStreet(keepWith([empty()], { sand: 1 }))
    s.screen = { w: 1180, h: 820 }
    for (const m of MACHINES) s.keep.machines[m] = 'built'
    // Sand on the glassworks' heap, out of sight from the garage: a finger held still on the street keeps the camera where it is.
    doing(s, { kind: 'touch', down: true })
    run(s, ticks(HINT_IDLE + GLANCE))
    expect(s.hint).toEqual({ kind: 'machine', m: 'glassworks' })
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    expect(s.handAt).toBe(-1)
    doing(s, { kind: 'touch', down: false })
    const lifted = s.tick - 1
    run(s, lifted + ticks(GLANCE) - s.tick - 1)
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    run(s, 1)
    expect(s.shot).toEqual({ kind: 'street', x: targetMiddle(s, { kind: 'machine', m: 'glassworks' }) })
  })

  it('picks the house nearest the camera that a room still fits, so Back from a house that can take a room lands on it', () => {
    // A tall house with room to grow, a row house the child builds in, the empty plot; planks for a room.
    const keep = keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', 'play')] }, { kind: 'row', roof: 'pointed', rooms: [room(2, 'small', 0, 0, 'planks', 'cat')] }, empty()], { planks: 6 })
    const s = onStreet(keep)
    s.screen = { w: 1180, h: 820 }
    for (const plot of [1, 0, 1]) {
      tapOn(s, { kind: 'plot', plot })
      doing(s, { kind: 'back' })
      expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, plot) })
      expect(s.hint).toEqual({ kind: 'plot', plot })
      // The whole house shows, and the camera stays there.
      const v = viewAt(s, Infinity, 1180, 820, 1)
      const house = houseRect(plot, s.keep.plots[plot]!)
      expect(house.x).toBeGreaterThanOrEqual(v.x0)
      expect(house.x + house.w).toBeLessThanOrEqual(v.x0 + 1180 / v.ppm)
      run(s, ticks(SHOT_TWEEN + GLANCE) + 2)
      expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, plot) })
    }
    // Panned to the street's end, the empty plot waiting there.
    doing(s, { kind: 'pan', x: houseMiddle(s, 2) })
    expect(s.hint).toEqual({ kind: 'plot', plot: 2 })
  })

  it('goes back out from a house wider than the screen to its rooms, the view kept inside the house, and stays', () => {
    for (const [w, h] of [[820, 1180], [390, 844]] as const) {
      // The child's one room, in the first home of the row house: wider than an upright screen's street.
      const keep = keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', 'play')] }, { kind: 'row', roof: 'pointed', rooms: [room(2, 'small', 0, 0, 'planks', 'cat')] }, empty()], { planks: 6 })
      const s = onStreet(keep)
      s.screen = { w, h }
      tapOn(s, { kind: 'plot', plot: 1 })
      tapOn(s, { kind: 'room', plot: 1, room: 2 })
      doing(s, { kind: 'back' })
      doing(s, { kind: 'back' })
      expect(s.hint, `${w}x${h}`).toEqual({ kind: 'plot', plot: 1 })
      const shot = s.shot
      const house = houseRect(1, s.keep.plots[1]!)
      const r = roomRect(1, roomOf(s, 1, 2))
      for (const v of [viewAt(s, Infinity, w, h, 1), viewAt(s, simTime(s) + SHOT_TWEEN + GLANCE + HINT_IDLE + 1, w, h, 1)]) {
        const right = v.x0 + w / v.ppm
        expect(house.w, `${w}x${h}`).toBeGreaterThan(right - v.x0)
        expect([r.x >= v.x0, r.x + r.w <= right, v.x0 >= house.x - 1e-9, right <= house.x + house.w + 1e-9], `${w}x${h}`).toEqual([true, true, true, true])
        run(s, ticks(SHOT_TWEEN + GLANCE + HINT_IDLE) + 1)
        expect(s.shot, `${w}x${h}`).toEqual(shot)
      }
      expect(s.handAt, `${w}x${h}`).toBeGreaterThan(0)
    }
  })

  it('goes back out from a house to the next thing to do: the house while a room can be paid for, else the machine to run', () => {
    const keep = keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', 'play')] }, empty()], { planks: 2 })
    keep.machines.oven = 'built'
    const s = onStreet(keep)
    tapOn(s, { kind: 'plot', plot: 0 })
    doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    tapOn(s, { kind: 'plot', plot: 0 })
    s.keep.goods.planks = 0
    s.keep.goods.clay = 2
    // The build tray's bubble shows the oven: its Back lands there.
    doing(s, { kind: 'back' })
    expect(s.shot).toEqual({ kind: 'street', x: targetMiddle(s, { kind: 'machine', m: 'oven' }) })
    expect(s.hint).toEqual({ kind: 'machine', m: 'oven' })
  })
})

describe('good night', () => {
  it('turns each house dark on a tap and ends when the street is dark; a tap plays again', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [room(1, 'small', 0, 0, 'planks', 'sleep')] }, { kind: 'row', roof: 'pointed', rooms: [room(2, 'small', 0, 0, 'glass', 'cat')] }, empty()]))
    tapOn(s, { kind: 'plot', plot: 1 })
    expect(kinds(doing(s, { kind: 'goodnight' }))).toEqual(expect.arrayContaining(['goodnight', 'zoom']))
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 1) })
    expect(s.night).toEqual({ at: s.tick - 1, dark: [-1, -1, -1], doneAt: -1 })
    expect(s.hint).toEqual({ kind: 'plot', plot: 1 })
    tapOn(s, { kind: 'plot', plot: 2 })
    tapOn(s, { kind: 'truck' })
    expect(s.shot.kind).toBe('street')
    expect(s.road).toBeNull()
    expect(tapOn(s, { kind: 'plot', plot: 0 })).toContainEqual(expect.objectContaining({ kind: 'lightsOut', plot: 0 }))
    expect(s.hint).toEqual({ kind: 'plot', plot: 1 })
    run(s, ticks(DUSK))
    expect(s.night!.doneAt).toBe(-1)
    const done = tapOn(s, { kind: 'plot', plot: 1 })
    expect(kinds(done)).toEqual(expect.arrayContaining(['lightsOut', 'sleep']))
    expect(s.night!.doneAt).toBe(s.tick)
    expect(s.builder).toMatchObject({ pose: 'wave' })
    expect(kinds(doing(s, { kind: 'wake' }))).toContain('wake')
    expect(s.night).toBeNull()
  })

  it('is over after the dusk on a street with no rooms, and goes home first from the road, the builder driving in before they wave', () => {
    const s = onStreet(freshKeep())
    tapOn(s, { kind: 'truck' })
    doing(s, { kind: 'goodnight' })
    expect(s.road).toBeNull()
    expect(s.keep.trips).toBe(1)
    run(s, ticks(DUSK))
    expect(s.night!.doneAt).toBe(-1)
    expect(s.builder.at).toEqual({ kind: 'truck' })
    run(s, s.tipAt - s.tick)
    expect(s.night!.doneAt).toBe(s.tipAt)
    expect(s.builder).toMatchObject({ at: { kind: 'street', x: MIRROR_BUILDER_X }, pose: 'wave' })
  })

  it('points at the lit house nearest the camera, and each light put out brings the next lit house into view at once', () => {
    const lit = (id: number): Plot => ({ kind: 'tall', roof: 'pointed', rooms: [room(id, 'small', 0, 0, 'planks', 'sleep')] })
    const s = onStreet(keepWith([lit(1), lit(2), lit(3), empty()]))
    // From the mirror, evening falls on the lit house nearest the garage, the house in the middle.
    doing(s, { kind: 'mirror' })
    doing(s, { kind: 'goodnight' })
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 0) })
    expect(s.hint).toEqual({ kind: 'plot', plot: 0 })
    const out = tapOn(s, { kind: 'plot', plot: 0 })
    expect(kinds(out)).toEqual(['lightsOut', 'zoom'])
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 1) })
    expect(s.hint).toEqual({ kind: 'plot', plot: 1 })
    expect(s.handAt).toBe(-1)
    // From the far end, the nearest is the last lit one; then the one left.
    s.shot = { kind: 'street', x: streetEnd(4) }
    run(s, 1)
    expect(s.hint).toEqual({ kind: 'plot', plot: 2 })
    tapOn(s, { kind: 'plot', plot: 2 })
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 1) })
    // A lit house within HINT_NEAR of the camera is in view already: the camera stays.
    s.night!.dark[2] = -1
    s.shot = { kind: 'street', x: houseMiddle(s, 1) + HINT_NEAR }
    expect(kinds(tapOn(s, { kind: 'plot', plot: 2 }))).toEqual(['lightsOut'])
    expect(s.shot).toEqual({ kind: 'street', x: houseMiddle(s, 1) + HINT_NEAR })
    tapOn(s, { kind: 'plot', plot: 1 })
    run(s, ticks(DUSK))
    expect(s.hint).toBeNull()
    expect(s.night!.doneAt).toBeGreaterThan(0)
  })

  it('frames each lit house as the glance would, so the camera moves once for it, on a phone held upright too', () => {
    for (const [w, h] of [[390, 844], [360, 740], [412, 915], [820, 1180], [1180, 820]] as const) {
      const s = onStreet(demoKeep('street'))
      s.screen = { w, h }
      doing(s, { kind: 'mirror' })
      doing(s, { kind: 'goodnight' })
      for (let n = 0; s.hint !== null; n++) {
        const framed = s.shot
        run(s, ticks(SHOT_TWEEN + GLANCE) + 30)
        expect(s.shot, `${w}x${h}, house ${n}`).toEqual(framed)
        tapOn(s, s.hint)
        run(s, 1)
      }
      expect(s.night!.dark.filter((d, i) => d < 0 && s.keep.plots[i]!.rooms.length > 0), `${w}x${h}`).toEqual([])
    }
  })
})

describe('the save switches', () => {
  it('start fresh keeping the look and the switches', () => {
    const s = onStreet(demoKeep('street'))
    doing(s, { kind: 'sound', on: false })
    doing(s, { kind: 'music', on: false })
    const look = s.keep.look
    run(s, 30)
    const tick = s.tick
    doing(s, { kind: 'fresh' })
    expect(s.keep).toEqual({ ...freshKeep(), look, sound: false, music: false })
    expect(s.tick).toBe(tick + 1)
    expect(s.shot).toEqual({ kind: 'street', x: START_X })
    expect([s.rev, s.partyAt, s.plotAt, s.roofAt]).toEqual([[0], [-1], [-1], [-1]])
  })

  it('start fresh from a house or a room with the camera pulling back along the street from where it stood', () => {
    for (const shot of [{ kind: 'room', plot: 0, room: 1 }, { kind: 'plot', plot: 2 }] as const) {
      const s = onStreet(demoKeep('street'))
      s.shot = shot
      doing(s, { kind: 'fresh' })
      expect(s.shotFrom).toEqual({ kind: 'street', x: plotLeft(shot.plot) + PLOT_W / 2 })
      for (const k of [0, 0.25, 0.5, 0.75]) {
        const v = viewAt(s, simTime(s) + SHOT_TWEEN * k, 1180, 820, 2)
        expect([v.ppm, v.x0, v.y0].every(Number.isFinite), `${shot.kind} at ${k}`).toBe(true)
      }
    }
  })
})

describe('the builder', () => {
  it('dashes along the street over DASH, pops in from further, and stands after a one-shot pose', () => {
    const s = onStreet(keepWith([empty()], { log: 1, sand: 1 }))
    s.keep.machines.sawmill = 'crate'
    s.keep.machines.glassworks = 'crate'
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(s.builder).toMatchObject({ fromX: MIRROR_BUILDER_X, movedAt: s.tick - 1, poseAt: s.tick - 1 + ticks(DASH) })
    // A tap halfway there sets off from where the dash has got to.
    run(s, ticks(DASH) / 2 - 1)
    tapOn(s, { kind: 'machine', m: 'glassworks' })
    expect(s.builder.fromX).toBeCloseTo((MIRROR_BUILDER_X + machineSpot('sawmill')) / 2)
    run(s, ticks(DASH))
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(s.builder).toMatchObject({ fromX: machineSpot('glassworks'), movedAt: s.tick - 1, poseAt: s.tick - 1 + ticks(DASH), facing: 1 })
    tapOn(s, { kind: 'machine', m: 'sawmill' })
    expect(s.builder.poseAt).toBe(s.tick - 2 + ticks(DASH))
    run(s, ticks(DASH))
    s.builder.at = { kind: 'street', x: plotLeft(1) }
    tapOn(s, { kind: 'machine', m: 'glassworks' })
    expect(s.builder).toMatchObject({ at: { kind: 'machine', m: 'glassworks' }, fromX: machineSpot('glassworks'), movedAt: s.tick - 1, poseAt: s.tick - 1, pose: 'hit' })
    run(s, ticks(SETTLE))
    expect(s.builder.pose).toBe('stand')
  })

  it('pops onto a scaffold, into a room and into the truck with fromX where they are drawn, never left where they were', () => {
    const s = onStreet(keepWith([{ kind: 'tall', roof: 'pointed', rooms: [] }, empty()], { planks: 8 }))
    expect(s.builder.fromX).toBe(MIRROR_BUILDER_X)
    tapOn(s, { kind: 'plot', plot: 0 })
    run(s, ticks(SHOT_TWEEN))
    // Two rooms in a row: each a pop onto its own scaffold.
    for (const spot of [{ col: 0, row: 0 }, { col: 1, row: 0 }]) {
      tapOn(s, { kind: 'spot', plot: 0, ...spot })
      const at = s.builder.at
      if (at.kind !== 'scaffold') throw new Error(`on ${at.kind}, not a scaffold`)
      expect(s.builder).toMatchObject({ fromX: at.x, movedAt: s.tick - 1, poseAt: s.tick - 1 })
    }
    run(s, ticks(LOWER + HAMMER) + 1)
    while (s.ask !== null) doing(s, { kind: 'theme', theme: 'play' })
    tapOn(s, { kind: 'room', plot: 0, room: 2 })
    expect(s.builder).toMatchObject({ at: { kind: 'room', plot: 0, room: 2 }, fromX: visitPoint(0, roomOf(s, 0, 2)).x, movedAt: s.tick - 1, poseAt: s.tick - 1 })
    doing(s, { kind: 'back' })
    doing(s, { kind: 'back' })
    run(s, ticks(SHOT_TWEEN))
    tapOn(s, { kind: 'truck' })
    expect(s.builder).toMatchObject({ at: { kind: 'truck' }, fromX: TRUCK_HOME_X, movedAt: s.tick - 1, poseAt: s.tick - 1 })
  })
})

describe('flights', () => {
  it('show goods leaving the bed and landing in the heap over time, never more than were counted', () => {
    const s = onStreet(freshKeep())
    trip(s, ['log', 'log', 'log', 'clay'], false)
    const heap = { kind: 'heap', good: 'log' } as const
    const t0 = s.tick * STEP
    expect(shown(s, heap, 'log', t0)).toBe(0)
    expect(shown(s, { kind: 'bed' }, 'log', t0)).toBe(3)
    expect(shown(s, { kind: 'heap', good: 'clay' }, 'log', t0)).toBe(0)
    let lastHeap = 0
    for (let t = t0; t < t0 + TIP + FLY_FOR + 1; t += STEP) {
      const h = shown(s, heap, 'log', t)
      const bed = shown(s, { kind: 'bed' }, 'log', t)
      expect(h).toBeGreaterThanOrEqual(lastHeap)
      expect(h + bed).toBeLessThanOrEqual(3)
      lastHeap = h
    }
    expect(lastHeap).toBe(3)
    expect(placePoint(s, { kind: 'bed' })).toEqual({ x: TRUCK_TIP_X + BED.dx, y: BED.dy })
    expect(placePoint(s, heap)).toEqual(centre(heapRect('sawmill')))
    expect(placePoint(s, { kind: 'stack', good: 'glass' })).toEqual(centre(stackRect('glassworks')))
    expect(placePoint(s, { kind: 'road', x: 3, y: -1 })).toEqual({ x: 3, y: -1 })
    expect(() => placePoint(s, { kind: 'room', plot: 0, room: 99 })).toThrow()
  })

  it('show a batch in the stack only when it pops out', () => {
    const keep = keepWith([empty()], { sand: 1, glass: 2 })
    keep.machines.glassworks = 'built'
    const s = onStreet(keep)
    tapOn(s, { kind: 'machine', m: 'glassworks' })
    const t0 = (s.tick - 1) * STEP
    const stack = { kind: 'stack', good: 'glass' } as const
    expect(s.keep.goods.glass).toBe(3)
    expect(shown(s, stack, 'glass', t0 + BATCH / 2)).toBe(2)
    expect(shown(s, stack, 'glass', t0 + BATCH + STEP / 2)).toBe(3)
    expect(placePoint(s, { kind: 'bed' }).x).toBe(TRUCK_TIP_X + BED.dx)
  })
})

describe('demos', () => {
  it('are keeps the rules could have made, and open on a shot that has its targets', () => {
    for (const demo of DEMOS) {
      const keep = demoKeep(demo)
      expect(keep.plots.length, demo).toBeLessThanOrEqual(MAX_PLOTS)
      expect(keep.plots.at(-1)!.rooms, demo).toEqual([])
      const ids = keep.plots.flatMap((p) => p.rooms.map((r) => r.id))
      expect(new Set(ids).size, demo).toBe(ids.length)
      expect(Math.max(0, ...ids), demo).toBeLessThan(keep.nextId)
      keep.plots.forEach((p) => {
        const built: Plot = { kind: p.kind, roof: p.roof, rooms: [] }
        for (const r of p.rooms) {
          expect(canPlace(built, r.shape, r.col, r.row), `${demo} room ${r.id}`).toBe(true)
          built.rooms.push(r)
          const slots = slotsOf(r.shape)
          expect(r.items.length).toBe(slots.length)
          r.items.forEach((item, i) => item !== null && expect(ITEMS[item].slot, `${demo} room ${r.id} slot ${i}`).toBe(slots[i]!.kind))
          if (r.theme !== null) expect(themeOpen(keep.unlocked, r.theme), `${demo} ${r.theme}`).toBe(true)
        }
      })
      const s = onStreet(keep)
      s.shot = demoShot(demo, keep)
      expect(() => targets(s), demo).not.toThrow()
      run(s, 120)
    }
  })

  it('open ?demo=themes on a view that holds: its hint, a house a room still fits, is in sight on a screen 1024 wide and up', () => {
    for (const [w, h] of [[1024, 768], [1180, 820], [1366, 1024], [1920, 1000]] as const) {
      const keep = demoKeep('themes')
      const shot = demoShot('themes', keep)
      if (shot.kind !== 'street') throw new Error('?demo=themes opens on the street')
      // As game.ts opens it: a pan to the demo's shot.
      const s = onStreet(keep)
      s.screen = { w, h }
      doing(s, { kind: 'pan', x: shot.x })
      run(s, ticks(5))
      expect(s.shot, `${w}x${h}`).toEqual(shot)
      expect(s.hint, `${w}x${h}`).toEqual({ kind: 'plot', plot: 0 })
      const v = viewAt(s, Infinity, w, h, 1)
      const house = houseRect(0, keep.plots[0]!)
      expect(house.x, `${w}x${h}`).toBeGreaterThanOrEqual(v.x0)
      expect(house.x + house.w, `${w}x${h}`).toBeLessThanOrEqual(v.x0 + w / v.ppm)
    }
  })

  it('show what each is for', () => {
    const cells = (p: Plot) => p.rooms.reduce((n, r) => n + SHAPE_SIZE[r.shape].w * SHAPE_SIZE[r.shape].h, 0)
    const tall = demoKeep('tall').plots[0]!
    expect(cells(tall)).toBe(15)
    expect(new Set(tall.rooms.map((r) => r.material)).size).toBe(5)
    expect(new Set(tall.rooms.map((r) => r.shape)).size).toBe(4)
    expect(cells(demoKeep('row').plots[0]!)).toBe(12)
    const street = demoKeep('street')
    expect(street.plots.filter((p) => p.rooms.length > 0).length).toBe(3)
    expect(MACHINES.every((m) => street.machines[m] === 'built')).toBe(true)
    const roomDemo = demoKeep('room')
    const shot = demoShot('room', roomDemo)
    expect(shot.kind === 'room' && roomDemo.plots[0]!.rooms.find((r) => r.id === shot.room)).toMatchObject({ shape: 'big', theme: 'disco' })
    expect(new Set(demoKeep('themes').plots.flatMap((p) => p.rooms.map((r) => r.theme)))).toEqual(new Set(THEMES))
    expect(demoShot('road', demoKeep('road')).kind).toBe('street')
    expect(demoShot('mirror', demoKeep('mirror'))).toEqual({ kind: 'mirror' })
    expect(LOCKED_THEMES.every((t) => themeOpen(demoKeep('themes').unlocked, t))).toBe(true)
  })
})

describe('the rules as a whole', () => {
  it('cost two blocks a cell and offer exactly what targets offers', () => {
    expect((['small', 'wide', 'tall', 'big'] as const).map(roomCost)).toEqual([1, 2, 2, 4].map((cells) => cells * CELL_COST))
    const s = onStreet(demoKeep('street'))
    for (const t of targets(s)) expect(offered(s, t.hit)).toBe(true)
    expect(offered(s, { kind: 'ground', x: 3 })).toBe(false)
    expect(offered(s, { kind: 'spot', plot: 3, col: 0, row: 0 })).toBe(false)
  })

  it('reported every kind of event somewhere above', () => {
    expect(Object.keys(RULE_EVENTS).filter((k) => !seen.has(k as EventKind))).toEqual([])
  })
})
