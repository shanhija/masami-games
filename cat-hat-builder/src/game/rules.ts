import { shownFloors, viewAt } from './camera'
import { LOOK_KEYS, LOOK_OPTIONS, MACHINE_FOR_MATERIAL, PRESENTS, PRESENT_GEMS, RECIPES, THEME_VISIT, optionOpen, roomCost, themeOpen } from './catalog'
import { heapShows } from './flights'
import { ITEMS, defaultItems, type ItemId } from './items'
import {
  MIRROR_BUILDER_X,
  PLOT_W,
  PRESENT_FOR,
  SLAB,
  TRUCK,
  TRUCK_TIP_X,
  centre,
  coverOf,
  hintAim,
  houseRect,
  machineSpot,
  plotLeft,
  presentOpenAt,
  rect,
  roomRect,
  roomsOnTop,
  slotsOf,
  stackRect,
  stationRect,
  streetEnd,
  targets,
  truckDrivingIn,
  truckOnStreet,
  validSpots,
  visitPoint,
  type Rect,
} from './layout'
import {
  BATCH,
  BATCH_PUSHED,
  CRATE_HITS,
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
  ROOFS,
  SHOT_TWEEN,
  STEP,
  TIP,
  isRaw,
  ticks,
  type Action,
  type BuilderAt,
  type Good,
  type Hit,
  type Keep,
  type Look,
  type MachineId,
  type MachineRun,
  type Night,
  type Part,
  type PlacedRoom,
  type Place,
  type Plot,
  type Pose,
  type RoadKind,
  type RoadState,
  type Shot,
  type SimEvent,
  type State,
  type Theme,
  type Unlock,
} from './model'
import { freshKeep } from './progress'
import { between, next } from './random'
import { makeRoad, roadHorn, roadPedal, roadPush, roadWhack, startRoad, stepRoad } from './road'

/**
 * The whole session as a pure state: the screens and shots, the street, the machines, the
 * building, the rooms, the presents, the hints and Good night. `act` takes one Action,
 * `step` advances one tick (HZ a second) and fills `s.events`. No DOM, no canvas, no
 * Math.random (random.ts), so the scripted child and the fuzz run it in node.
 *
 * Every tap answers at once: the keep changes in `act`, and what takes time on screen (the
 * builder's dash, the crane, a batch, goods flying) is a tick stamp or a Flight the picture
 * reads. A tap counts only when layout.targets offers its hit for the shot on screen, so the
 * picture, the hit test and the rules can never disagree.
 *
 * Events from `act` wait in `s.queued` and come out first in the next step's `s.events`:
 * the clock reads events in one place, after each step.
 */

/** The street shot when the game opens on the street or leaves the mirror: the garage's door, the truck in it and the mirror on a screen held upright; a wider screen holds the street's left end and shows the first machines too. */
export const START_X = 7.5
/** The street shot after a trip: the yard where the truck drives in and tips, the garage door at its left. */
export const YARD_VIEW_X = 24
/** After the trip ends (the street sign passed, or Home), the road stays on screen this long before the street. */
export const HOME_BEAT = 0.6
/** The builder dashes along the street when the way is at most a street shot wide (camera.ts shows 26 m); further, they pop in. */
const DASH_REACH = 26
/** A one-shot pose (a swing, a lever pull, a hop, a cheer) holds this long and then the builder stands. */
export const SETTLE = 1.2
const ONE_SHOT: readonly Pose[] = ['hit', 'lever', 'hop', 'cheer']
/** Good night: evening falls over this long before the street can be dark. */
export const DUSK = 1.5
/** The dice remembers this many looks to undo. */
export const UNDO_LOOKS = 5
/** A hinted thing this near the street shot's middle is in view on any screen the game is played on (a phone held upright shows about 9 m of street): the rules count it in view when they know no screen, and a light put out brings a lit house further off into view. */
export const HINT_NEAR = 4
/** When the thing that bounces changes, or a street shot settles, with it out of sight: the camera glides to it this long after, with no touch meanwhile and the yard in view quiet. The hand (HINT_IDLE) waits for this look too. */
export const GLANCE = 1.2

/** The wardrobe tab each look field belongs to (a colour row shares its part's tab). */
const PART_OF: Record<keyof Look, Part> = {
  hat: 'hat', hair: 'hair', hairColor: 'hair', skin: 'skin', glasses: 'glasses', shirt: 'shirt', shirtColor: 'shirt', bag: 'bag', pants: 'pants', pantsColor: 'pants', shoes: 'shoes', tool: 'tool',
}

/** The truck is not back from its last trip yet: it drives in, tips, or its load still flies to the heaps. It cannot leave again until then, and nothing else bounces meanwhile. */
export const unloading = (s: State) => (s.tipAt >= 0 && s.tick < s.tipAt + ticks(TIP)) || s.flights.some((f) => f.from.kind === 'bed')
/** Two hits, places or shots are the same when every field matches (they are flat records). */
export function same<T extends object>(a: T, b: T): boolean {
  const ka = Object.keys(a) as (keyof T)[]
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}
/** The room `id` on plot `plot`; it must be there. */
export function roomOf(s: State, plot: number, id: number): PlacedRoom {
  const room = s.keep.plots[plot]!.rooms.find((r) => r.id === id)
  if (!room) throw new Error(`no room ${id} on plot ${plot}`)
  return room
}
/** A hit layout.targets offers for the shot on screen: the only taps the rules act on. */
export const offered = (s: State, hit: Hit) => targets(s).some((t) => same(t.hit, hit))

const roll = (s: State, n: number) => {
  const [u, rng] = next(s.rng)
  s.rng = rng
  return between(u, 0, n - 1)
}
const diceLook = (s: State): Look =>
  Object.fromEntries(
    LOOK_KEYS.map((field) => {
      const open = (LOOK_OPTIONS[field] as readonly unknown[]).filter((v) => optionOpen(s.keep.unlocked, field, v))
      return [field, open[roll(s, open.length)]]
    }),
  ) as unknown as Look
const emit = (s: State, e: SimEvent) => s.events.push(e)
/** Ticks between goods leaving one after another. */
const flyGap = (i: number) => Math.round(i * FLY_EVERY * HZ)
const homeOf = (good: Good): Place => (isRaw(good) ? { kind: 'heap', good } : { kind: 'stack', good })
const plotX = (plot: number) => plotLeft(plot) + PLOT_W / 2
/** The street x with a plot's whole house (or its sign) in the middle. */
const houseX = (s: State, plot: number) => centre(houseRect(plot, s.keep.plots[plot]!)).x
const idleRun = (): MachineRun => ({ on: false, batchAt: -1, batchFor: 0, pushAt: -1, coughAt: -1, hits: 0, hitAt: -1, builtAt: -1 })

/** A state over a keep. `firstVisit`: the game opens at the mirror with a dice-made builder; otherwise on the street. */
export function createState(keep: Keep, seed: number, firstVisit: boolean): State {
  const shot = (): Shot => (firstVisit ? { kind: 'mirror' } : { kind: 'street', x: START_X })
  const s: State = {
    keep,
    tick: 0,
    shot: shot(),
    shotFrom: shot(),
    shotAt: -1,
    ask: null,
    askAt: -1,
    press: null,
    tab: 'hair',
    material: 'planks',
    shape: 'small',
    hand: false,
    lifted: -1,
    liftedAt: -1,
    craneRoom: -1,
    craneFrom: -1,
    craneAt: -1,
    craneOut: false,
    gone: [],
    playAt: {},
    placedAt: {},
    partyAt: keep.plots.map(() => -1),
    rev: keep.plots.map(() => 0),
    plotAt: keep.plots.map(() => -1),
    roofAt: keep.plots.map(() => -1),
    machines: Object.fromEntries(MACHINES.map((m) => [m, idleRun()])) as Record<MachineId, MachineRun>,
    crateAt: Object.fromEntries(MACHINES.map((m) => [m, -1])) as Record<MachineId, number>,
    presentAt: -1,
    presentGot: null,
    builder: { at: firstVisit ? { kind: 'mirror' } : { kind: 'street', x: MIRROR_BUILDER_X }, fromX: MIRROR_BUILDER_X, movedAt: -1, pose: 'stand', poseAt: -1, facing: 1 },
    road: null,
    tipAt: -1,
    flights: [],
    night: null,
    hint: null,
    handAt: -1,
    glanceAt: -1,
    screen: null,
    lastInputAt: 0,
    touching: false,
    lookUndo: [],
    rng: seed | 0,
    events: [],
    queued: [],
  }
  if (firstVisit) keep.look = diceLook(s)
  s.hint = nextHint(s)
  return s
}

/**
 * The builder goes to `at` and takes `pose` facing `facing` once there. Along the street
 * (the mirror, the street, a machine) within DASH_REACH they dash from `fromX` over DASH,
 * starting at `movedAt` from wherever a dash in progress has got them, and the pose starts
 * when they arrive (`poseAt`). Anywhere else, and further, they pop in at once, and `fromX`
 * is then the x they are drawn at (on the street or a scaffold, at the room's visit point,
 * in the truck), so the picture never runs them in from where they were. `facing` is the
 * facing on arrival; the picture runs the way from `fromX` to the place. A visit to a room
 * stands at the room's visit point as it starts, and there for as long as it lasts.
 */
function moveBuilder(s: State, to: Exclude<BuilderAt, { kind: 'room' }> | Omit<Extract<BuilderAt, { kind: 'room' }>, 'x'>, pose: Pose, facing: -1 | 1): void {
  const b = s.builder
  const was = b.at
  const at: BuilderAt = to.kind !== 'room' ? to : { kind: 'room', plot: to.plot, room: to.room, x: was.kind === 'room' && was.plot === to.plot && was.room === to.room ? was.x : visitPoint(to.plot, roomOf(s, to.plot, to.room)).x }
  b.pose = pose
  b.facing = facing
  if (same(b.at, at)) {
    b.poseAt = Math.max(s.tick, b.poseAt)
    return
  }
  const streetX = (p: BuilderAt) => (p.kind === 'street' ? p.x : p.kind === 'machine' ? machineSpot(p.m) : p.kind === 'mirror' ? MIRROR_BUILDER_X : null)
  const toX = streetX(at)
  let from = streetX(b.at)
  const dashed = (s.tick - b.movedAt) / ticks(DASH)
  if (from !== null && dashed < 1) from = b.fromX + (from - b.fromX) * dashed
  const dash = from !== null && toX !== null && from !== toX && Math.abs(toX - from) <= DASH_REACH
  const there = toX ?? (at.kind === 'scaffold' || at.kind === 'room' ? at.x : truckOnStreet(s, s.tick * STEP).x)
  b.at = at
  b.fromX = dash ? from! : there
  b.movedAt = s.tick
  b.poseAt = dash ? s.tick + ticks(DASH) : s.tick
}

/** The camera moves to `shot`: it tweens from the shot before. A room on the hand's hook goes back down, a press is let go and the hand is put away, so every house opens ready to build with its ghosts showing. */
function setShot(s: State, shot: Shot): void {
  s.shotFrom = s.shot
  s.shot = shot
  s.shotAt = s.tick
  s.hand = false
  s.lifted = -1
  s.press = null
  emit(s, { kind: 'zoom' })
}

/** The view of the street shot on the screen the game last drew on, once the camera has settled (viewAt at an endless time), or null with no screen known (the rules alone, in node). */
function streetView(s: State) {
  if (s.shot.kind !== 'street') throw new Error(`the street's view on the ${s.shot.kind} shot`)
  return s.screen === null ? null : viewAt(s, Infinity, s.screen.w, s.screen.h, 1)
}

/**
 * A rect on the street shows on the street shot's view (streetView): whole, or as much of it
 * as the screen is wide around its middle. With no screen known, its middle is within
 * HINT_NEAR of the shot's.
 */
function inView(s: State, shotX: number, r: Rect): boolean {
  const c = centre(r).x
  const v = streetView(s)
  if (v === null) return Math.abs(c - shotX) <= HINT_NEAR
  const half = Math.min(r.w, v.w / v.ppm) / 2
  return c - half >= v.x0 - 1e-6 && c + half <= v.x0 + v.w / v.ppm + 1e-6
}

/** Any of a rect on the street shows on the street shot's view (streetView); with no screen known, its middle is within HINT_NEAR of the shot's. */
function showsAny(s: State, shotX: number, r: Rect): boolean {
  const v = streetView(s)
  if (v === null) return Math.abs(centre(r).x - shotX) <= HINT_NEAR
  return r.x < v.x0 + v.w / v.ppm && r.x + r.w > v.x0
}

/** A machine is in sight when half of its station or more shows: what must show is the station's middle, a rect with no size. */
function sightOf(m: MachineId): Rect {
  const c = centre(stationRect(m))
  return rect(c.x, c.y, 0, 0)
}

/**
 * How the camera looks for a hint on the street: the rect that shows when it is in sight, and
 * the street x the camera centres to bring it there. A machine's station, half of it or more
 * (sightOf); a plot's whole house (or its sign), or on a screen narrower than the house its
 * rooms (layout.hintAim), the view kept inside the house; else the hinted thing's target.
 */
function hintLook(s: State, hint: Hit): { r: Rect; x: number } {
  if (hint.kind === 'machine') return { r: sightOf(hint.m), x: centre(stationRect(hint.m)).x }
  if (hint.kind !== 'plot') {
    const r = targets(s).find((t) => same(t.hit, hint))!.rect
    return { r, x: centre(r).x }
  }
  const house = houseRect(hint.plot, s.keep.plots[hint.plot]!)
  const v = streetView(s)
  const w = v === null ? Infinity : v.w / v.ppm
  if (house.w <= w) return { r: house, x: centre(house).x }
  const aim = hintAim(s, hint)!
  return { r: aim, x: Math.min(Math.max(centre(aim).x, house.x + w / 2), house.x + house.w - w / 2) }
}

/** On the street, the camera glides to the thing bouncing when it is out of sight (hintLook); true when it moves. */
function lookAtHint(s: State): boolean {
  const hint = s.hint
  const shot = s.shot
  if (hint === null || shot.kind !== 'street') return false
  const { r, x } = hintLook(s, hint)
  if (x === shot.x || inView(s, shot.x, r)) return false
  setShot(s, { kind: 'street', x })
  return true
}

/** The hint hand comes to tap the thing bouncing. On the street a thing out of sight comes into view first, and the hand waits for the camera to settle. */
function showHand(s: State): void {
  lookAtHint(s)
  s.handAt = Math.max(s.tick, s.shotAt + ticks(SHOT_TWEEN))
}

/** The plot nearest the street's x that `ok` takes, or -1 for none. */
function nearestPlot(s: State, x: number, ok: (p: Plot, i: number) => boolean): number {
  let best = -1
  s.keep.plots.forEach((p, i) => {
    if (ok(p, i) && (best < 0 || Math.abs(plotX(i) - x) < Math.abs(plotX(best) - x))) best = i
  })
  return best
}
/** At Good night, a built plot still lit (nearestPlot finds the one nearest the camera, or -1 once every light is out). */
const lit = (night: Night) => (p: Plot, i: number) => p.rooms.length > 0 && night.dark[i]! < 0

/** The doorbell party: every item in the house plays in turn from the bottom floor up (step). */
function ringDoorbell(s: State, plot: number): void {
  s.partyAt[plot] = s.tick
  emit(s, { kind: 'doorbell', plot })
}

/** The house's roof turns to the next style, on every column at once. */
function cycleRoof(s: State, plot: number): void {
  const p = s.keep.plots[plot]!
  p.roof = ROOFS[(ROOFS.indexOf(p.roof) + 1) % ROOFS.length]!
  s.roofAt[plot] = s.tick
  s.rev[plot]!++
  emit(s, { kind: 'roof', plot })
}

function ask(s: State, a: NonNullable<State['ask']>): void {
  s.ask = a
  s.askAt = s.tick
}

/** The material there is most of becomes the pick until the very first room is built. */
function preselect(s: State): void {
  const keep = s.keep
  if (keep.plots.every((p) => p.rooms.length === 0)) s.material = MATERIALS.reduce((a, b) => (keep.goods[b] > keep.goods[a] ? b : a))
}

function startTrip(s: State, kind: RoadKind): void {
  const [u, rng] = next(s.rng)
  s.rng = rng
  s.ask = null
  s.road = startRoad(makeRoad(kind, s.keep.trips + 1, Math.floor(u * 2 ** 32) | 0))
  setShot(s, { kind: 'road' })
  moveBuilder(s, { kind: 'truck' }, 'drive', 1)
}

/**
 * Home from a trip: the street shows the truck driving into the yard, and DRIVE_IN later
 * (s.tipAt) it tips its bed and every good flies to its heap (the keep counted them on the
 * road). The present pops out of the bed as it tips and opens PRESENT_POP later where it
 * lands, with the next unlock or three gems (counted now). The crane drops a crate on every
 * pad whose raw good is now in the yard. The builder rides in the truck until it tips (`tip`).
 */
function arrive(s: State, road: RoadState): void {
  const keep = s.keep
  s.road = null
  keep.trips++
  s.flights = s.flights.filter((f) => f.from.kind !== 'road' && f.to.kind !== 'road' && f.from.kind !== 'bed' && f.to.kind !== 'bed')
  const tipAt = s.tick + ticks(DRIVE_IN)
  s.tipAt = tipAt
  const leave = tipAt + ticks(TIP / 2)
  road.bed.forEach((good, i) => s.flights.push({ good, n: 1, from: { kind: 'bed' }, to: homeOf(good), at: leave + flyGap(i), dur: ticks(FLY_FOR) }))
  const got: Unlock | 'gems' | null = road.present ? (PRESENTS.find((u) => !keep.unlocked.includes(u)) ?? 'gems') : null
  if (got === 'gems') {
    keep.goods.gem += PRESENT_GEMS
    for (let i = 0; i < PRESENT_GEMS; i++) s.flights.push({ good: 'gem', n: 1, from: { kind: 'present' }, to: { kind: 'heap', good: 'gem' }, at: tipAt + ticks(TIP) + flyGap(i), dur: ticks(FLY_FOR) })
  } else if (got !== null) keep.unlocked.push(got)
  for (const m of MACHINES) {
    if (keep.machines[m] !== 'pad' || keep.goods[RECIPES[m].takes] === 0) continue
    keep.machines[m] = 'crate'
    s.crateAt[m] = s.tick
    emit(s, { kind: 'crate', m })
  }
  s.presentAt = got === null ? -1 : tipAt
  s.presentGot = got
  setShot(s, { kind: 'street', x: YARD_VIEW_X })
}

/** The truck has driven into the yard (the step at s.tipAt): it tips, the present pops out of the bed (it opens as it lands, in step), and the builder jumps out of the cab and cheers (nothing on the street answers a tap while the truck drives in, so they are still at the wheel). */
function tip(s: State): void {
  emit(s, { kind: 'tip' })
  moveBuilder(s, { kind: 'street', x: TRUCK_TIP_X + TRUCK.length / 2 + 0.8 }, 'cheer', -1)
}

/** A batch starts: one raw good goes in and one material is counted at once; the picture of it rides from the heap to the stack until the batch pops out. */
function startBatch(s: State, m: MachineId): void {
  const { takes, makes } = RECIPES[m]
  const run = s.machines[m]
  s.keep.goods[takes]--
  s.keep.goods[makes]++
  run.batchAt = s.tick
  run.batchFor = ticks(BATCH)
  s.flights.push({ good: makes, n: 1, from: { kind: 'heap', good: takes }, to: { kind: 'stack', good: makes }, at: s.tick, dur: run.batchFor })
  emit(s, { kind: 'batch', m })
}

function tapMachine(s: State, m: MachineId): void {
  const keep = s.keep
  const run = s.machines[m]
  const stage = keep.machines[m]
  if (stage === 'pad') {
    // Nothing to do at an empty pad: the hand shows what to do instead.
    showHand(s)
    emit(s, { kind: 'tap' })
    return
  }
  moveBuilder(s, { kind: 'machine', m }, stage === 'crate' ? 'hit' : 'lever', 1)
  if (stage === 'crate') {
    run.hits++
    run.hitAt = s.tick
    emit(s, { kind: 'crateHit', m })
    if (run.hits >= CRATE_HITS) {
      keep.machines[m] = 'built'
      run.builtAt = s.tick
      emit(s, { kind: 'machineBuilt', m })
    }
  } else if (run.on) {
    run.batchFor = Math.min(run.batchFor, s.tick - run.batchAt + ticks(BATCH_PUSHED))
    for (const f of s.flights) if (f.to.kind === 'stack' && f.from.kind === 'heap' && f.good === RECIPES[m].makes && f.at === run.batchAt) f.dur = run.batchFor
    run.pushAt = s.tick
    emit(s, { kind: 'push', m })
  } else if (heapShows(s, m, s.tick * STEP) > 0) {
    // Only what has landed on the heap: goods still in the truck's bed or in the air wait their turn.
    run.on = true
    startBatch(s, m)
  } else {
    run.coughAt = s.tick
    emit(s, { kind: 'cough', m })
  }
}

/** A room on the picked spot, if the picked material pays for it: paid at once, lowered by the crane, its blocks flying from the stack, the builder on the scaffold. */
function build(s: State, plot: number, col: number, row: number): void {
  const keep = s.keep
  const p = keep.plots[plot]!
  const cost = roomCost(s.shape)
  if (keep.goods[s.material] < cost) {
    emit(s, { kind: 'nope', good: s.material })
    return
  }
  keep.goods[s.material] -= cost
  // The room before it, done and waiting for the finger that built this one to lift, asks which room it is now.
  if (s.craneRoom >= 0 && !s.craneOut && s.tick - s.craneAt >= ticks(LOWER + HAMMER)) craneDone(s)
  const room: PlacedRoom = { id: keep.nextId++, shape: s.shape, col, row, material: s.material, theme: null, items: slotsOf(s.shape).map(() => null), wall: 0, floor: 0 }
  const first = p.rooms.length === 0
  s.craneFrom = shownFloors(s, plot, s.tick * STEP)
  p.rooms.push(room)
  s.rev[plot]!++
  s.craneRoom = room.id
  s.craneAt = s.tick
  s.craneOut = false
  for (let i = 0; i < cost; i++) s.flights.push({ good: room.material, n: 1, from: { kind: 'stack', good: room.material }, to: { kind: 'room', plot, room: room.id }, at: s.tick + flyGap(i), dur: ticks(FLY_FOR) })
  const r = roomRect(plot, room)
  moveBuilder(s, { kind: 'scaffold', plot, x: r.x + r.w + 0.3, y: r.y + r.h - SLAB }, 'stand', -1)
  emit(s, { kind: 'build', plot, room: room.id, material: room.material })
  // The plot waiting at the street's end got its first room: the bulldozer levels the next one.
  if (first && plot === keep.plots.length - 1 && keep.plots.length < MAX_PLOTS) {
    keep.plots.push({ kind: null, roof: 'pointed', rooms: [] })
    s.partyAt.push(-1)
    s.rev.push(0)
    s.plotAt.push(s.tick)
    s.roofAt.push(-1)
    emit(s, { kind: 'newPlot', plot: keep.plots.length - 1 })
  }
}

/** The crane's new room is done: in its house's build view, a bare room asks which room it is. */
function craneDone(s: State): void {
  const plot = s.keep.plots.findIndex((p) => p.rooms.some((r) => r.id === s.craneRoom))
  const room = roomOf(s, plot, s.craneRoom)
  if (s.ask === null && s.night === null && room.theme === null && s.shot.kind === 'plot' && s.shot.plot === plot) ask(s, { kind: 'theme', plot, room: room.id })
  s.craneRoom = -1
  s.craneFrom = -1
}

/** The lifted room goes back to the stack it came from: every good it cost flies home, the crane carries it away. */
function takeBack(s: State, plot: number, room: PlacedRoom): void {
  const keep = s.keep
  const p = keep.plots[plot]!
  const cost = roomCost(room.shape)
  keep.goods[room.material] += cost
  s.craneFrom = shownFloors(s, plot, s.tick * STEP)
  p.rooms.splice(p.rooms.indexOf(room), 1)
  s.rev[plot]!++
  s.lifted = -1
  s.gone.push({ plot, room })
  s.craneRoom = room.id
  s.craneAt = s.tick
  s.craneOut = true
  for (let i = 0; i < cost; i++) s.flights.push({ good: room.material, n: 1, from: { kind: 'room', plot, room: room.id }, to: { kind: 'stack', good: room.material }, at: s.tick + flyGap(i), dur: ticks(FLY_FOR) })
  for (const key of Object.keys(s.playAt)) if (key === `${room.id}` || key.startsWith(`${room.id}:`)) delete s.playAt[key]
  for (const key of Object.keys(s.placedAt)) if (key.startsWith(`${room.id}:`)) delete s.placedAt[key]
  if (s.builder.at.kind === 'room' && s.builder.at.room === room.id) moveBuilder(s, { kind: 'street', x: plotLeft(plot) + 1 }, 'stand', 1)
  emit(s, { kind: 'takeBack', plot, room: room.id })
}

/**
 * Things have gone in, and the visiting builder stands in front of a floor thing: they pop to
 * where they hide none, the free floor slot nearest them; with every floor slot taken, to the
 * room's middle, between two floor slots, where they hide the least.
 */
function stepAside(s: State, plot: number, room: PlacedRoom): void {
  const at = s.builder.at
  if (at.kind !== 'room' || at.room !== room.id) return
  const slots = slotsOf(room.shape)
  const floors = slots.flatMap((sl, i) => (sl.kind === 'floor' ? [i] : []))
  if (floors.every((i) => room.items[i] === null || coverOf(plot, room, i, at.x) === 0)) return
  const r = roomRect(plot, room)
  const free = floors.flatMap((i) => (room.items[i] === null ? [r.x + slots[i]!.x] : []))
  const x = free.length > 0 ? free.reduce((a, b) => (Math.abs(b - at.x) < Math.abs(a - at.x) ? b : a)) : centre(r).x
  if (x === at.x) return
  s.builder.at = { ...at, x }
  s.builder.fromX = x
  s.builder.movedAt = s.tick
}

/** The builder goes into a room of `theme` and does its thing. */
function visit(s: State, plot: number, room: number, theme: Theme): void {
  moveBuilder(s, { kind: 'room', plot, room }, THEME_VISIT[theme], 1)
  emit(s, { kind: 'visit', theme })
}

function tapRoom(s: State, plot: number, room: PlacedRoom): void {
  const p = s.keep.plots[plot]!
  if (s.shot.kind === 'room') {
    // The room's own inside, in the room view: a bare room asks again, a themed one plays.
    if (room.theme === null) ask(s, { kind: 'theme', plot, room: room.id })
    else {
      s.playAt[room.id] = s.tick
      emit(s, { kind: 'tap' })
    }
  } else if (!s.hand) {
    setShot(s, { kind: 'room', plot, room: room.id })
    if (room.theme === null) {
      moveBuilder(s, { kind: 'room', plot, room: room.id }, 'stand', 1)
      ask(s, { kind: 'theme', plot, room: room.id })
    } else visit(s, plot, room.id, room.theme)
  } else if (s.lifted === room.id) takeBack(s, plot, room)
  else {
    const above = roomsOnTop(p, room)
    if (above.length > 0) {
      for (const r of above) {
        s.playAt[r.id] = s.tick
        emit(s, { kind: 'wiggle', plot, room: r.id })
      }
    } else {
      s.lifted = room.id
      s.liftedAt = s.tick
      emit(s, { kind: 'lift', plot, room: room.id })
    }
  }
}

/** A canvas tap: a question on screen closes; a hit the shot does not offer does nothing (and sets a lifted room down). */
function tap(s: State, hit: Hit): void {
  const keep = s.keep
  if (s.ask !== null) {
    s.ask = null
    return
  }
  const isLifted = hit.kind === 'room' && hit.room === s.lifted
  if (!isLifted) s.lifted = -1
  if (!offered(s, hit)) return
  if (s.night !== null) {
    if (hit.kind === 'plot' && keep.plots[hit.plot]!.rooms.length > 0 && s.night.dark[hit.plot]! < 0) {
      s.night.dark[hit.plot] = s.tick
      emit(s, { kind: 'lightsOut', plot: hit.plot })
      // The next lit house comes into view at once (the night is on the street), where the glance would look at it.
      const shot = s.shot
      if (shot.kind !== 'street') throw new Error(`a light goes out on the ${shot.kind} shot`)
      const next = nearestPlot(s, shot.x, lit(s.night))
      if (next >= 0 && Math.abs(houseX(s, next) - shot.x) > HINT_NEAR) setShot(s, { kind: 'street', x: hintLook(s, { kind: 'plot', plot: next }).x })
    }
    return
  }
  switch (hit.kind) {
    case 'part':
      s.tab = hit.part
      emit(s, { kind: 'tap' })
      return
    case 'truck':
      if (s.road !== null) roadHorn(s, s.road)
      else if (unloading(s)) emit(s, { kind: 'tap' })
      else if (keep.trips === 0) startTrip(s, 'forest')
      else ask(s, { kind: 'road' })
      return
    case 'mirror':
      openMirror(s)
      return
    case 'present':
      // Open (it opened as it landed), a tap opens it again where it stands, and its card with it.
      s.presentAt = s.tick
      emit(s, { kind: 'present' })
      return
    case 'machine':
      tapMachine(s, hit.m)
      return
    case 'plot':
      // From the street the camera zooms in; the sign of an empty plot whose question was closed asks again.
      if (s.shot.kind === 'street') setShot(s, { kind: 'plot', plot: hit.plot })
      if (keep.plots[hit.plot]!.kind === null) ask(s, { kind: 'house', plot: hit.plot })
      preselect(s)
      return
    case 'roof':
      cycleRoof(s, hit.plot)
      return
    case 'door':
      ringDoorbell(s, hit.plot)
      return
    case 'spot':
      build(s, hit.plot, hit.col, hit.row)
      return
    case 'room':
      tapRoom(s, hit.plot, roomOf(s, hit.plot, hit.room))
      return
    case 'item': {
      const key = `${hit.room}:${hit.slot}`
      s.playAt[key] = s.tick
      emit(s, { kind: 'play', item: roomOf(s, hit.plot, hit.room).items[hit.slot]!, plot: hit.plot, room: hit.room, slot: hit.slot })
      return
    }
    case 'builder': {
      const shot = s.shot
      if (shot.kind !== 'room') throw new Error('the builder is a target only in a room')
      const room = roomOf(s, shot.plot, shot.room)
      if (room.theme === null) moveBuilder(s, s.builder.at, 'hop', 1)
      else visit(s, shot.plot, room.id, room.theme)
      return
    }
    case 'boulder':
      roadWhack(s, s.road!)
      return
    case 'crosser':
      roadHorn(s, s.road!)
      return
    case 'ground':
    case 'none':
      throw new Error(`layout.targets never offers ${hit.kind}`)
  }
}

function openMirror(s: State): void {
  s.ask = null
  setShot(s, { kind: 'mirror' })
  moveBuilder(s, { kind: 'mirror' }, 'stand', 1)
}

function leaveMirror(s: State): void {
  setShot(s, { kind: 'street', x: START_X })
  moveBuilder(s, { kind: 'street', x: MIRROR_BUILDER_X }, 'hop', 1)
}

/**
 * The theme picked on the card. The room keeps what the child put in it from other themes;
 * every other slot (a free one, or one holding a thing of the theme the room had) gets the
 * new theme's own item for it, or stays free, never twinning a thing kept. So another room
 * is a new room, and the same room again only fills its free slots.
 */
function answerTheme(s: State, theme: Theme | null): void {
  const a = s.ask
  if (a === null || a.kind !== 'theme' || (theme !== null && !themeOpen(s.keep.unlocked, theme))) return
  s.ask = null
  if (theme === null) return
  const room = roomOf(s, a.plot, a.room)
  const defaults = defaultItems(theme, room.shape)
  const was = room.theme
  const kept = room.items.map((item) => (item !== null && (was === theme || ITEMS[item].theme !== was) ? item : null))
  room.theme = theme
  room.items = kept.map((item, slot) => {
    if (item !== null) return item
    const key = `${room.id}:${slot}`
    const fill = defaults[slot]!
    if (fill === null || kept.includes(fill)) {
      delete s.placedAt[key]
      return null
    }
    s.placedAt[key] = s.tick
    return fill
  })
  s.rev[a.plot]!++
  stepAside(s, a.plot, room)
  emit(s, { kind: 'theme', theme, plot: a.plot, room: room.id })
  if (s.shot.kind === 'room' && s.shot.room === room.id) visit(s, a.plot, room.id, theme)
}

/** The tray in the room view: an item in the room comes out; any other goes in the first free slot of its kind (one the visiting builder stands clear of first, so it shows whole; then they step aside), or in place of the oldest of its kind. */
function trayItem(s: State, plot: number, room: PlacedRoom, item: ItemId): void {
  if (room.theme === null || !themeOpen(s.keep.unlocked, ITEMS[item].theme)) return
  const at = room.items.indexOf(item)
  if (at >= 0) {
    room.items[at] = null
    delete s.placedAt[`${room.id}:${at}`]
    emit(s, { kind: 'itemOut', item, plot, room: room.id, slot: at })
  } else {
    const kind = ITEMS[item].slot
    const slots = slotsOf(room.shape)
    const at = s.builder.at
    const clear = (i: number) => at.kind !== 'room' || at.room !== room.id || coverOf(plot, room, i, at.x) === 0
    const free = slots.flatMap((sl, i) => (sl.kind === kind && room.items[i] === null ? [i] : []))
    let slot = free.find(clear) ?? free[0] ?? -1
    if (slot < 0) {
      const age = (i: number) => s.placedAt[`${room.id}:${i}`] ?? -1
      for (let i = 0; i < slots.length; i++) if (slots[i]!.kind === kind && (slot < 0 || age(i) < age(slot))) slot = i
    }
    const key = `${room.id}:${slot}`
    room.items[slot] = item
    s.placedAt[key] = s.tick
    s.playAt[key] = s.tick
    stepAside(s, plot, room)
    emit(s, { kind: 'itemIn', item, plot, room: room.id, slot })
  }
  s.rev[plot]!++
}

/** Back: a question closes; the room to its house, the house to the street, the mirror to the street; on the road the truck heads home with its load. */
function back(s: State): void {
  if (s.ask !== null) {
    s.ask = null
    return
  }
  const shot = s.shot
  switch (shot.kind) {
    case 'road':
      if (s.road!.endAt < 0) s.road!.endAt = s.tick
      return
    case 'room':
      setShot(s, { kind: 'plot', plot: shot.plot })
      return
    case 'plot': {
      // Out on the street where the next step is: the house (its rooms, when it is wider than the screen), or what bounces next when that is elsewhere (a machine to run, the truck), as the build tray's bubble shows.
      setShot(s, { kind: 'street', x: houseX(s, shot.plot) })
      const hint = nextHint(s)
      if (hint !== null) s.shot = { kind: 'street', x: hintLook(s, hint).x }
      return
    }
    case 'mirror':
      leaveMirror(s)
      return
    case 'street':
      return
  }
}

/** One action from the child. Every action counts as input for the hint hand. */
export function act(s: State, a: Action): void {
  const keep = s.keep
  const mark = s.events.length
  s.lastInputAt = s.tick
  switch (a.kind) {
    case 'tap':
      s.press = null
      tap(s, a.hit)
      break
    case 'press':
      s.press = a.hit !== null && s.ask === null && s.night === null && offered(s, a.hit) ? { hit: a.hit, at: s.tick } : null
      break
    case 'touch':
      s.touching = a.down
      break
    case 'pedal':
      if (s.road !== null) roadPedal(s, s.road, a.down)
      break
    case 'push':
      if (s.road !== null) roadPush(s, s.road)
      break
    case 'horn':
      if (s.road !== null) roadHorn(s, s.road)
      break
    case 'whack':
      if (s.road !== null) roadWhack(s, s.road)
      break
    case 'home':
      if (s.road !== null) back(s)
      break
    case 'back':
      back(s)
      break
    case 'mirror':
      if (s.road === null && s.night === null && s.shot.kind !== 'mirror' && !truckDrivingIn(s)) openMirror(s)
      break
    case 'tab':
      s.tab = a.part
      break
    case 'go':
      if (s.shot.kind === 'mirror') leaveMirror(s)
      break
    case 'wear': {
      if (s.shot.kind !== 'mirror') break
      const parts = new Set<Part>()
      for (const [field, value] of Object.entries(a.patch) as [keyof Look, unknown][]) {
        if (!Object.hasOwn(LOOK_OPTIONS, field) || !optionOpen(keep.unlocked, field, value)) continue
        ;(keep.look as unknown as Record<string, unknown>)[field] = value
        parts.add(PART_OF[field])
      }
      for (const part of parts) emit(s, { kind: 'wear', part })
      break
    }
    case 'dice':
      if (s.shot.kind !== 'mirror') break
      s.lookUndo.push({ ...keep.look })
      if (s.lookUndo.length > UNDO_LOOKS) s.lookUndo.shift()
      keep.look = diceLook(s)
      emit(s, { kind: 'dice' })
      break
    case 'undoDice':
      if (s.shot.kind !== 'mirror' || s.lookUndo.length === 0) break
      keep.look = s.lookUndo.pop()!
      emit(s, { kind: 'dice' })
      break
    case 'house': {
      const q = s.ask
      if (q === null || q.kind !== 'house') break
      s.ask = null
      keep.plots[q.plot]!.kind = a.house
      s.rev[q.plot]!++
      preselect(s)
      emit(s, { kind: 'house', plot: q.plot })
      break
    }
    case 'road':
      if (s.ask !== null && s.ask.kind === 'road' && s.road === null) startTrip(s, a.road)
      break
    case 'theme':
      answerTheme(s, a.theme)
      break
    case 'askTheme':
      if (s.shot.kind === 'room') ask(s, { kind: 'theme', plot: s.shot.plot, room: s.shot.room })
      break
    // Picking what to build puts the hand away: the ghosts show again.
    case 'material':
      s.material = a.material
      s.hand = false
      s.lifted = -1
      break
    case 'shape':
      s.shape = a.shape
      s.hand = false
      s.lifted = -1
      s.press = null
      break
    case 'hand':
      s.hand = a.on
      s.lifted = -1
      s.press = null
      break
    case 'item':
      if (s.shot.kind === 'room') trayItem(s, s.shot.plot, roomOf(s, s.shot.plot, s.shot.room), a.item)
      break
    case 'paint': {
      if (s.shot.kind !== 'room') break
      const room = roomOf(s, s.shot.plot, s.shot.room)
      room[a.what] = ((room[a.what] + 1) % 4) as PlacedRoom['wall']
      s.rev[s.shot.plot]!++
      emit(s, { kind: 'paint' })
      break
    }
    case 'doorbell':
      if ((s.shot.kind === 'plot' || s.shot.kind === 'room') && keep.plots[s.shot.plot]!.rooms.length > 0) ringDoorbell(s, s.shot.plot)
      break
    case 'roof':
      if (s.shot.kind === 'plot') cycleRoof(s, s.shot.plot)
      break
    case 'pan':
      if (s.shot.kind !== 'street') break
      s.shot = { kind: 'street', x: Math.min(Math.max(a.x, 0), streetEnd(keep.plots.length)) }
      // The child looks where they like: what bounces is what the view shows first, and the camera never glides back to it after a drag.
      s.hint = nextHint(s)
      s.glanceAt = -1
      break
    case 'goodnight': {
      if (s.night !== null) break
      if (s.road !== null) arrive(s, s.road)
      const shot = s.shot
      s.ask = null
      const night = (s.night = { at: s.tick, dark: keep.plots.map(() => -1), doneAt: -1 })
      // Evening falls on the lit house nearest where the child was, the first lights to put out, framed as the glance would frame it.
      const from = shot.kind === 'street' ? shot.x : shot.kind === 'plot' || shot.kind === 'room' ? plotX(shot.plot) : START_X
      const first = nearestPlot(s, from, lit(night))
      setShot(s, { kind: 'street', x: first < 0 ? from : houseX(s, first) })
      if (first >= 0) s.shot = { kind: 'street', x: hintLook(s, { kind: 'plot', plot: first }).x }
      emit(s, { kind: 'goodnight' })
      break
    }
    case 'wake':
      if (s.night === null) break
      s.night = null
      emit(s, { kind: 'wake' })
      break
    case 'fresh': {
      const fresh = freshKeep()
      fresh.look = keep.look
      fresh.sound = keep.sound
      fresh.music = keep.music
      const from = s.shot
      // The old street's events still waiting for a step name rooms that are gone: they go with it. So do its houses: from a house or a room the camera pulls back along the new street from where it stood.
      const shotFrom: Shot = from.kind === 'plot' || from.kind === 'room' ? { kind: 'street', x: plotX(from.plot) } : from
      Object.assign(s, createState(fresh, s.rng, false), { tick: s.tick, lastInputAt: s.tick, shotFrom, shotAt: s.tick, screen: s.screen, events: s.events, queued: [] })
      emit(s, { kind: 'zoom' })
      break
    }
    case 'sound':
      keep.sound = a.on
      break
    case 'music':
      keep.music = a.on
      break
    default: {
      const never: never = a
      throw new Error(`unknown action ${JSON.stringify(never)}`)
    }
  }
  s.queued.push(...s.events.splice(mark))
}

/**
 * The one next step that bounces. On the street: at Good night the lit house nearest the
 * camera; by day a crate or a machine with goods on its heap: those in sight first (sightOf),
 * the crates first among them; out of sight, crate or not, those on the garage's side of the
 * camera first; each time the one nearest the camera. So the child finishes the yard in
 * view, and the camera walks the rest of the yard once, its last glide on toward the houses.
 * Else the house nearest the camera that a room still fits (or the empty plot) if a room is
 * affordable, else the truck; nothing while the truck comes home and unloads and the
 * present's card shows. On an empty plot whose question was closed: its sign.
 */
function nextHint(s: State): Hit | null {
  const shot = s.shot
  if (s.ask !== null) return null
  if (shot.kind === 'plot') return s.keep.plots[shot.plot]!.kind === null ? { kind: 'plot', plot: shot.plot } : null
  if (shot.kind !== 'street' || truckDrivingIn(s)) return null
  if (s.night !== null) {
    const plot = nearestPlot(s, shot.x, lit(s.night))
    return plot < 0 ? null : { kind: 'plot', plot }
  }
  if (unloading(s) || (s.presentGot !== null && s.tick < presentOpenAt(s) + ticks(PRESENT_FOR))) return null
  const keep = s.keep
  const todo = MACHINES.filter((m) => keep.machines[m] === 'crate' || (keep.machines[m] === 'built' && !s.machines[m].on && heapShows(s, m, s.tick * STEP) > 0)).map((m) => ({
    m,
    away: inView(s, shot.x, sightOf(m)) ? 0 : 1,
    built: keep.machines[m] === 'crate' ? 0 : 1,
    right: machineSpot(m) > shot.x ? 1 : 0,
    d: Math.abs(machineSpot(m) - shot.x),
  }))
  if (todo.length > 0) return { kind: 'machine', m: todo.reduce((a, b) => ((b.away - a.away || (a.away === 0 ? b.built - a.built : b.right - a.right) || b.d - a.d) < 0 ? b : a)).m }
  if (MATERIALS.some((g) => keep.goods[g] >= roomCost('small'))) {
    const plot = nearestPlot(s, shot.x, (p) => p.kind === null || validSpots(p, 'small').length > 0)
    if (plot >= 0) return { kind: 'plot', plot }
  }
  return { kind: 'truck' }
}

/** On the street, a machine any of whose station shows is on, or its blocks fly to a stack that shows: the yard in view is still making things. */
function yardBusy(s: State): boolean {
  const shot = s.shot
  if (shot.kind !== 'street') return false
  return MACHINES.some((m) => s.machines[m].on && showsAny(s, shot.x, stationRect(m))) || s.flights.some((f) => f.to.kind === 'stack' && showsAny(s, shot.x, stackRect(MACHINE_FOR_MATERIAL[f.to.good])))
}

/** One tick: the road (and the homecoming), the truck tipping at the yard and the present landing, the machines, the flights, the crane, the doorbell parties, the hint and the camera's look for it, Good night and the builder's poses. */
export function step(s: State): void {
  s.events.length = 0
  s.events.push(...s.queued)
  s.queued.length = 0
  s.tick++
  const keep = s.keep
  const tick = s.tick
  // A finger held on the street's canvas is input that lasts: nothing moves the camera under it. On the road it counts once, as it went down, so the pedal still pulses for a child holding the truck.
  if (s.touching && s.shot.kind !== 'road') s.lastInputAt = tick

  if (s.road !== null) {
    stepRoad(s, s.road)
    if (s.road.endAt >= 0 && tick >= s.road.endAt + ticks(HOME_BEAT)) arrive(s, s.road)
  }
  if (tick === s.tipAt) tip(s)
  // The present from the bed lands in the yard and opens with its fanfare.
  if (s.presentGot !== null && s.presentAt === s.tipAt && tick === presentOpenAt(s)) {
    emit(s, { kind: 'present' })
    emit(s, { kind: 'unlock', what: s.presentGot })
  }

  for (const m of MACHINES) {
    const run = s.machines[m]
    if (!run.on || tick < run.batchAt + run.batchFor) continue
    if (heapShows(s, m, tick * STEP) > 0) startBatch(s, m)
    else run.on = false
  }

  if (s.flights.some((f) => tick >= f.at + f.dur)) s.flights = s.flights.filter((f) => tick < f.at + f.dur)

  if (s.craneRoom >= 0) {
    const age = tick - s.craneAt
    if (s.craneOut) {
      if (age >= ticks(LOWER)) {
        s.craneRoom = -1
        s.craneFrom = -1
        s.craneOut = false
      }
    } else {
      const plot = keep.plots.findIndex((p) => p.rooms.some((r) => r.id === s.craneRoom))
      const b = s.builder
      const onScaffold = b.at.kind === 'scaffold' && b.at.plot === plot
      if (age === ticks(LOWER)) {
        emit(s, { kind: 'landed', plot, room: s.craneRoom })
        if (onScaffold) moveBuilder(s, b.at, 'hammer', b.facing)
      }
      if (age === ticks(LOWER + HAMMER) && onScaffold) moveBuilder(s, b.at, 'hop', b.facing)
      // A finger still held on a ghost keeps the card back: lifting it builds that room first (build), and the card comes then.
      if (age >= ticks(LOWER + HAMMER) && s.press === null) craneDone(s)
    }
  }
  if (s.gone.length > 0) {
    const pictured = (id: number) => s.craneRoom === id || s.flights.some((f) => (f.from.kind === 'room' && f.from.room === id) || (f.to.kind === 'room' && f.to.room === id))
    s.gone = s.gone.filter((g) => pictured(g.room.id))
  }

  const every = ticks(PARTY_EVERY)
  s.partyAt.forEach((at, plot) => {
    if (at < 0 || (tick - 1 - at) % every !== 0) return
    const order = [...keep.plots[plot]!.rooms].sort((a, b) => a.row - b.row || a.col - b.col)
    const turn = (tick - 1 - at) / every
    if (turn >= order.length) {
      s.partyAt[plot] = -1
      return
    }
    const room = order[turn]!
    s.playAt[room.id] = tick
    room.items.forEach((item, slot) => {
      if (item === null) return
      s.playAt[`${room.id}:${slot}`] = tick
      emit(s, { kind: 'play', item, plot, room: room.id, slot })
    })
  })

  const hint = nextHint(s)
  if (hint !== null && (s.hint === null || !same(hint, s.hint))) s.glanceAt = tick
  s.hint = hint
  if (s.shot.kind === 'street' && tick === s.shotAt + ticks(SHOT_TWEEN)) s.glanceAt = tick
  const handDue = s.hint !== null && tick - Math.max(s.lastInputAt, s.handAt) >= ticks(HINT_IDLE)
  // The yard in view still makes things: the beat starts once it is quiet, for the glance and for a hand that is due.
  if (yardBusy(s) && (s.glanceAt >= 0 || handDue)) s.glanceAt = tick
  // A new thing to do, or the camera just settled: the thing bouncing comes into view after a beat with no touch.
  if (s.glanceAt >= 0 && tick - Math.max(s.glanceAt, s.lastInputAt) >= ticks(GLANCE)) {
    s.glanceAt = -1
    lookAtHint(s)
  }
  // The hand waits for that look.
  if (handDue && s.glanceAt < 0) showHand(s)

  // The night is over once the street is dark and the truck is in from the road: the builder steps out of its cab to wave.
  const night = s.night
  if (night !== null && night.doneAt < 0 && tick >= night.at + ticks(DUSK) && !truckDrivingIn(s) && keep.plots.every((p, i) => p.rooms.length === 0 || night.dark[i]! >= 0)) {
    night.doneAt = tick
    emit(s, { kind: 'sleep' })
    setShot(s, { kind: 'street', x: START_X })
    moveBuilder(s, { kind: 'street', x: MIRROR_BUILDER_X }, 'wave', 1)
  }

  const b = s.builder
  if (ONE_SHOT.includes(b.pose) && tick >= b.poseAt + ticks(SETTLE)) {
    b.pose = 'stand'
    b.poseAt = tick
  }
}

/** A deep copy for the scripted child's look-ahead and the tests. */
export function cloneState(s: State): State {
  return structuredClone(s)
}
