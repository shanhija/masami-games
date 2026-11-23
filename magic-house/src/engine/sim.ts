/**
 * Magic House: the sim's core. A pure, deterministic, fixed-step world of plain numbers (plan.md,
 * The engine and the seats; The engine owns the feel and is the referee). Its whole state is the
 * World (engine/world.ts), which the scene and the HUD read; its input each frame is a FrameInput
 * (seats/types.ts); one frame follows FRAME_ORDER (engine/api.ts) exactly. It never calls made code
 * but through the Hooks, and never draws from Math.random or Date: the room's random stream lives in
 * the World (engine/math.ts), so a structuredClone of a World is the whole engine's state.
 *
 * FOR THE BUILDER'S AUTHOR (r, w and the handles over this core):
 *
 * 1. Make the sim. `createSim(start, hooks)` with the room's seed, level, kind, view, shell and party
 *    (one PartyMember a seat, in seat order). The room's box and the camera's frame are the house's,
 *    the same in every room (world.ts ROOM_BOUNDS, engine/camera.ts SIDE_FRAME and HIGH_FRAME), set
 *    once here and never moved. The players are handles 0..party-1; every handle built after takes
 *    the next id, in build order, which is also the order FRAME_ORDER goes by. Keep your closures
 *    (handlers, places, timers, the frame function, the steps' done) by id, and give the sim a Hooks
 *    object that calls them. `sim.hooks` may be set after createSim.
 *
 * 2. Build (while the room's code first runs; World.t is 0). Each maker takes plain values (colours
 *    already '#rrggbb', every option filled in with its default) and the handle's Listens (which
 *    handlers it has), and gives back its id:
 *    - addModel(sim, recipe) -> ModelId: a built kit model (once for each model function).
 *    - addSolid(sim, { at, shape, plain, house, surface, model, turn, mover, name, hidden }, listens):
 *      a box, ramp or ball (World SolidShape), at its middle; in a mover, at and turn are from the
 *      mover's origin.
 *    - addMover(sim, { name, hidden }, listens), then build its parts with mover: its id, then
 *      placeMover(sim, id) once your place closure is registered: it asks hooks.place at clock 0.
 *    - addThing(sim, { at, model, scale, round, weight, name, hidden }, listens): at its foot; it
 *      touches as its model's bounds times scale (Thing.box).
 *    - addDecor / addZone / addLamp / addSign: as the World's types, with mover (or null).
 *    - The room's settings: setWayOut, setControls (per seat, ButtonShown with
 *      an own job's icon as a ModelId), setSteps (each at a point or a handle id), setRule,
 *      setClock, setPushing, and putPlayer for each start.
 *    - Once the room's code has returned, addHouse(sim): the house's own floor, walls and ceiling
 *      (HOUSE), so their ids come after every handle the room built.
 *    Then finishBuild(sim): it settles everyone on their floors.
 *
 * 3. Play: `step(sim, input)` once a frame (DT = 1/60). The hooks are called in FRAME_ORDER:
 *    buttons -> hooks.button for own jobs (press, hold, release); taps -> hooks.tap (null for r.tap);
 *    movers -> hooks.place(id, clock); players -> hooks.use; contacts -> hooks.touch, hooks.land;
 *    zones -> hooks.zone(enter, stay, leave); timers -> hooks.timers(); frame -> hooks.frame();
 *    steps -> hooks.done(next). After the end (World.end), only the engine's own motion goes on.
 *
 * 4. Change things during play (any phase; the effects wait for play, as the reference says):
 *    putAt, slideTo, hide, show, turnTo, glow, pose (any placed handle, by id; putAt of a player is
 *    putPlayer); setSurface, setZone, setLamp, writeSign; moverSpeed, moverSlideBy, moverTurnBy;
 *    pushThing, goHome; putPlayer, pushPlayer, changePlayer, bonk, give, drop, addScore; and the
 *    world's acts puff, sound, shake, pop (engine/effects.ts) and finish. Reads for the handles:
 *    pointOf (any handle's point in the room), zoneWeight, the World's own fields, and the handle's
 *    id from a World entry. The referee's rules (the freedom rule, size only where there is room,
 *    changes capped) are kept here, so a handle only passes calls through.
 *
 * 5. For the bots' search (step 3): `movePlayer` (engine/player.ts) moves a copy of a Player one
 *    frame over the room as it stands, held in the room's box, changing only that copy; `riderFrame` and `riderAt` carry it
 *    on a solid that moves, as the movers' phase carries riders, and `pushPlayerOut` pushes it out
 *    of the solids that moved into it; `grabChoice` and `putDownAt` say
 *    what a press of grab would pick up and where it would set a thing down.
 *
 * 6. From high up (step 6, World.view 'high'): the same calls and the same order of a frame, with
 *    every body keeping its z. The pieces that work in three dimensions are the view's own and are
 *    called in their places: the controller on the floor (engine/floorPlayer.ts movePlayerFloor),
 *    loose things on the floor (engine/floorThings.ts), the footprints of solids (engine/geometry.ts,
 *    engine/floorState.ts), and carrying, riding, squeezing, touching, zones, taps and settling
 *    (engine/floor.ts). The bots' search steps a copy of a Player with movePlayerFloor, carries it
 *    with riderFrameFloor and riderAtFloor, pushes it with pushPlayerOutFloor, and asks
 *    grabChoiceFloor and putDownAtFloor.
 */

import type { Words } from '../../../profiles/src/lang'
import type { PuffKind, Recipe, Slot, Vec3 } from '../../../silly-billy/src/engine/types'
import type { Wearing } from '../saves'
import type { FrameInput, Pad, SeatIndex } from '../seats/types'
import { DEFAULTS, FEEL, REFEREE, ROOM, SIZES, type Level, type Shell, type StickMode } from './api'
import { HIGH_FRAME, SIDE_FRAME, frontOfFloor } from './camera'
import { addPop, addPuff, addShake, addSound, ageEffects } from './effects'
import { besideIfInsideFloor, carryOverHeadFloor, grabChoiceFloor, pushBodiesFloor, putDownAtFloor, riderAtFloor, riderFrameFloor, separatePlayersFloor, settleFloor, tapTargetFloor, touchPairsFloor, zoneMembersFloor } from './floor'
import { emptyBox3, playerBox3, playerFitsFloor, thingBox3, thingFitsFloor } from './floorState'
import { movePlayerFloor } from './floorPlayer'
import { moveThingFloor } from './floorThings'
import { contains, overlaps, pushOut } from './geometry'
import { cos, sin, streamState } from './math'
import { movePlayer, playerFits } from './player'
import {
  DT,
  NO_LISTENS,
  bodies,
  easeNumber,
  easeVec,
  gatherNear,
  groundUnder,
  moverById,
  moverHidden,
  playerBox,
  playerHeight,
  playerWidth,
  refreshOutline,
  roomPoint,
  solidActive,
  solidById,
  solidMiddle,
  thingBox,
  thingById,
  thingLoose,
  whereOf,
  type Body,
  type Box,
  type Ground,
  type Hooks,
  type Listens,
  type Sim,
} from './state'
import type { HouseSound } from './sounds'
import { moveThing } from './things'
import {
  HELPER,
  ROOM_BOUNDS,
  type BodyLook,
  type ButtonShown,
  type Decor,
  type Glow,
  type HandleId,
  type Lamp,
  type ModelId,
  type Mover,
  type Player,
  type RoomKind,
  type RoomView,
  type Sign,
  type SignShown,
  type Solid,
  type SolidShape,
  type Surface,
  type Thing,
  type World,
  type Zone,
} from './world'

export { DT, NO_LISTENS, type Hooks, type Listens, type MoverPose, type Sim } from './state'
export { movePlayer, CONTROL } from './player'

// ------------------------------------------------------------------------------ making the sim

/** One seat of the party, as the sim needs it. */
export interface PartyMember {
  seat: SeatIndex
  color: string
  body: BodyLook
  wear: Partial<Record<Slot, Wearing>>
}

/** What a room starts from. */
export interface RoomStart {
  seed: number
  level: Level
  kind: RoomKind
  view: RoomView
  /** The room's shell, as its answer or its facts give it: the world keeps it as given, and the build checks it (step 7a: its colours parsed, its light within LIGHT_RANGE). */
  shell: Shell
  party: readonly PartyMember[]
}

/** Where a helper rests, outside the room's inside so it hides no play: from the side on the ceiling's beam, this far in from its right end (under the HUD's ? button that calls it, and clear of the key legends that hang under the badges at the top left); from high up this high over the top of the walls' back right corner. */
const HELPER_HOME = { beamIn: 0.7, overWalls: 0.4 } as const
/** How fast the helper flies, m/s, and how high over a step's spot it hovers. */
const HELPER_FLY = 6
const HELPER_OVER = 1.6
/** A player whose feet are this far below the room's bottom has fallen out; a thing this far out of the box has left. */
const OUT = 1
/** How long a player fades back in after a fall, seconds. */
const BACK_SECS = 0.5
/** Metres of stride between two footsteps. */
const FOOTSTEP = 0.7
/** How a bonk throws them back and up, m/s. */
const BONK_V: readonly [number, number] = [2.5, 4]
/** How fast a throw leaves upward, m/s; its speed across is worked out to land FEEL.throwAhead ahead. */
const THROW_UP = 5
/** How far apart touching counts, metres. */
const TOUCH = 0.03
/** A putAt further than this, metres, is a jump and gets a puff. */
const PUT_PUFF = 0.5

export function createSim(start: RoomStart, hooks: Hooks): Sim {
  const players: Player[] = start.party.map((m, i) => {
    if (m.seat !== i) throw new Error(`party member ${i} has seat ${m.seat}: give the party in seat order`)
    return {
      id: i,
      seat: m.seat,
      at: [0, 0, 0],
      velocity: [0, 0, 0],
      facing: 1,
      heading: [1, 0, 0],
      on: null,
      stride: 0,
      jumpedAt: -Infinity,
      landedAt: -Infinity,
      threwAt: -Infinity,
      grabbedAt: -Infinity,
      landSpeed: 0,
      holding: null,
      pushing: null,
      bonkedUntil: -Infinity,
      heldSince: null,
      freeUntil: -Infinity,
      input: { stick: [0, 0], a: false, b: false },
      leftGroundAt: -Infinity,
      jumpKeptUntil: -Infinity,
      jumpHeld: false,
      lastFloor: null,
      change: null,
      back: null,
      stick: 'walk',
      a: 'jump',
      b: 'grab',
      color: m.color,
      score: 0,
      badge: false,
      glow: null,
      body: m.body,
      wear: m.wear,
      jumpFrom: 0,
      steep: false,
      size: 1,
      start: [0, 0, 0],
      putFrame: -1,
      heldAt: [0, 0, 0],
    }
  })
  const bounds: World['bounds'] = { min: [...ROOM_BOUNDS[start.view].min], max: [...ROOM_BOUNDS[start.view].max] }
  const world: World = {
    t: 0,
    frame: 0,
    seed: start.seed,
    rng: streamState(start.seed),
    level: start.level,
    kind: start.kind,
    view: start.view,
    bounds,
    camera: start.view === 'high' ? frontOfFloor(bounds, HIGH_FRAME, { x: 0, y: 0, width: 0, height: 0 }) : { ...SIDE_FRAME },
    floorFrame: start.view === 'high' ? { ...HIGH_FRAME } : null,
    shell: start.shell,
    models: [],
    solids: [],
    movers: [],
    things: [],
    decor: [],
    zones: [],
    lamps: [],
    signs: [],
    uses: [],
    players,
    pointers: [],
    pushing: false,
    steps: [],
    next: 0,
    rule: null,
    clock: null,
    wayOut: { at: [0, 0, 0], open: false },
    helper: { at: [0, 0, 0], step: null, says: null, saidAt: -Infinity, quietSince: 0, hints: 0 },
    puffs: [],
    pops: [],
    sounds: [],
    shakes: [],
    serial: 0,
    contacts: [],
    finishing: null,
    end: null,
  }
  const sim = attach(world, hooks, players.map(() => NO_LISTENS))
  sim.building = true
  return sim
}

/**
 * A sim over a World that is already built (a clone, or one sent from the worker), with the hooks and
 * listens of the room that built it: the index and the outlines are worked out again from the World.
 */
export function attach(world: World, hooks: Hooks, listens: Listens[]): Sim {
  const sim: Sim = { world, hooks, listens, where: [], outlines: [], turns: [], building: false }
  world.players.forEach((p, i) => (sim.where[p.id] = { kind: 'player', i }))
  const lists = [
    ['solid', world.solids],
    ['mover', world.movers],
    ['thing', world.things],
    ['decor', world.decor],
    ['zone', world.zones],
    ['lamp', world.lamps],
    ['sign', world.signs],
  ] as const
  for (const [kind, list] of lists) list.forEach((h, i) => (sim.where[h.id] = { kind, i }))
  for (let i = 0; i < world.solids.length; i++) refreshOutline(sim, i)
  return sim
}

/** A body's point as the view keeps it: from the side on z = 0, from high up as given. */
function flat(sim: Sim, at: readonly number[]): Vec3 {
  return sim.world.view === 'high' ? [at[0], at[1], at[2]] : [at[0], at[1], 0]
}

/** A belt's speed as the view keeps it: from the side [vx, vy, 0], from high up along the floor [vx, 0, vz]. */
function beltOf(sim: Sim, belt: readonly number[]): Vec3 {
  return sim.world.view === 'high' ? [belt[0], 0, belt[2]] : [belt[0], belt[1], 0]
}

/** The id the next handle built gets. */
function nextId(sim: Sim): HandleId {
  return sim.where.length
}

function register(sim: Sim, kind: 'solid' | 'mover' | 'thing' | 'decor' | 'zone' | 'lamp' | 'sign', i: number, listens: Listens): HandleId {
  const id = nextId(sim)
  sim.where[id] = { kind, i }
  sim.listens[id] = listens
  return id
}

function needBuilding(sim: Sim, call: string): void {
  if (!sim.building) throw new Error(`${call} builds, and the room is already playing`)
}

// ------------------------------------------------------------------------------ the makers

export function addModel(sim: Sim, recipe: Recipe): ModelId {
  sim.world.models.push(recipe)
  return sim.world.models.length - 1
}

export interface SolidSpec {
  at: Vec3
  shape: SolidShape
  /** World Solid.plain: the room's code gave it nothing of its own but its place, size, turn and name. */
  plain: boolean
  /** World Solid.house: one of the house's own floor, walls and ceiling (addHouse). */
  house: boolean
  surface: Surface
  model: ModelId | null
  turn: number
  mover: HandleId | null
  name: string | null
  hidden: boolean
}

export function addSolid(sim: Sim, spec: SolidSpec, listens: Listens): HandleId {
  needBuilding(sim, 'addSolid')
  const i = sim.world.solids.length
  const id = register(sim, 'solid', i, listens)
  sim.world.solids.push({
    id,
    name: spec.name,
    hidden: spec.hidden,
    mover: spec.mover,
    at: flat(sim, spec.at),
    slide: null,
    shape: spec.shape,
    house: spec.house,
    plain: spec.plain,
    surface: { ...spec.surface, belt: beltOf(sim, spec.surface.belt) },
    model: spec.model,
    turn: spec.turn,
    turning: null,
    glow: null,
    parts: {},
  })
  refreshOutline(sim, i)
  return id
}

/** A part of the house round every room: what a sentence calls each of its own solids. */
export type HousePart = 'floor' | 'left wall' | 'right wall' | 'back wall' | 'ceiling'

/**
 * The house's own solids in each view, in the order addHouse builds them, each a box by its middle
 * and size (engine/api.ts ROOM; world.ts Solid.house). From the side: the floor x ±8.3, y -0.4 to 0;
 * the walls x ±8 to ±8.3, y 0 to 8; the ceiling y 8 to 8.4; each from the back wall to the open front
 * round the players' plane (every body there stands on z = 0). From high up: the floor x ±7.3, y -0.3
 * to 0, z -4.3 to 4.3; the side walls x ±7 to ±7.3 and the back wall z -4.3 to -4, each 2.5 m tall,
 * the front open. They hold the players inside with the room's box, so nobody falls out of the room.
 */
export const HOUSE: Readonly<Record<RoomView, readonly { readonly part: HousePart; readonly at: Vec3; readonly size: Vec3 }[]>> = (() => {
  const t = ROOM.wall
  const s = ROOM.side
  const h = ROOM.high
  const deep = s.front - s.back
  const sideOut = s.width / 2 + t
  const highOut = h.width / 2 + t
  return {
    side: [
      { part: 'floor', at: [0, -ROOM.lip / 2, 0], size: [2 * sideOut, ROOM.lip, deep] },
      { part: 'left wall', at: [-(s.width / 2 + t / 2), s.height / 2, 0], size: [t, s.height, deep] },
      { part: 'right wall', at: [s.width / 2 + t / 2, s.height / 2, 0], size: [t, s.height, deep] },
      { part: 'ceiling', at: [0, s.height + ROOM.beam / 2, 0], size: [2 * sideOut, ROOM.beam, deep] },
    ],
    high: [
      { part: 'floor', at: [0, -t / 2, 0], size: [2 * highOut, t, h.depth + 2 * t] },
      { part: 'left wall', at: [-(h.width / 2 + t / 2), h.wallHigh / 2, t / 2], size: [t, h.wallHigh, h.depth + t] },
      { part: 'right wall', at: [h.width / 2 + t / 2, h.wallHigh / 2, t / 2], size: [t, h.wallHigh, h.depth + t] },
      { part: 'back wall', at: [0, h.wallHigh / 2, -(h.depth / 2 + t / 2)], size: [2 * highOut, h.wallHigh, t] },
    ],
  }
})()

/**
 * Builds the house's own solids (HOUSE) in the shell's colours, once the room's code has returned, so
 * their ids come after every handle the room built and none of the room's ids shift. They listen for
 * nothing and are never in a mover.
 */
export function addHouse(sim: Sim): void {
  const shell = sim.world.shell
  for (const piece of HOUSE[sim.world.view]) {
    const color = piece.part === 'floor' ? shell.floor.color : piece.part === 'ceiling' ? shell.ceiling.color : shell.walls.color
    addSolid(
      sim,
      { at: piece.at, shape: { kind: 'box', size: piece.size }, plain: false, house: true, surface: { color, ice: false, bounce: 0, belt: [0, 0, 0], through: false }, model: null, turn: 0, mover: null, name: null, hidden: false },
      NO_LISTENS,
    )
  }
}

/** Which part of the house a house's solid is, by its id. */
export function housePart(sim: Sim, id: HandleId): HousePart {
  const k = sim.world.solids.filter((s) => s.house).findIndex((s) => s.id === id)
  if (k < 0) throw new Error(`handle ${id} is not one of the house's own solids`)
  return HOUSE[sim.world.view][k].part
}

export function addMover(sim: Sim, spec: { name: string | null; hidden: boolean }, listens: Listens): HandleId {
  needBuilding(sim, 'addMover')
  const i = sim.world.movers.length
  const id = register(sim, 'mover', i, listens)
  sim.world.movers.push({
    id,
    name: spec.name,
    hidden: spec.hidden,
    mover: null,
    at: [0, 0, 0],
    turn: 0,
    clock: 0,
    speed: 1,
    by: { from: [0, 0, 0], to: [0, 0, 0], start: 0, secs: 0 },
    turnBy: { from: 0, to: 0, start: 0, secs: 0 },
    glow: null,
  })
  return id
}

/** Puts a mover where its place says for its clock now (hooks.place), with its slide and turn, and its solids with it. */
export function placeMover(sim: Sim, id: HandleId): void {
  const m = moverById(sim, id)
  const pose = sim.hooks.place(id, m.clock)
  const by = easeVec(m.by, sim.world.t)
  m.at = flat(sim, [pose.at[0] + by[0], pose.at[1] + by[1], pose.at[2] + by[2]])
  m.turn = pose.turn + easeNumber(m.turnBy, sim.world.t)
  sim.world.solids.forEach((s, i) => {
    if (s.mover === id) refreshOutline(sim, i)
  })
}

export interface ThingSpec {
  at: Vec3
  model: ModelId
  scale: number
  round: boolean
  weight: number
  name: string | null
  hidden: boolean
}

export function addThing(sim: Sim, spec: ThingSpec, listens: Listens): HandleId {
  needBuilding(sim, 'addThing')
  const i = sim.world.things.length
  const id = register(sim, 'thing', i, listens)
  const b = sim.world.models[spec.model].bounds
  const k = spec.scale
  // A thing touches at least SIZES.smallest across in the plane (from high up along x and along z), so nothing is too thin to stand on or
  // grab: grown round its middle across, and up from its bottom, so a flat thing still rests on its foot.
  // It touches from its foot up, never below it: a model reaching under y = 0 (a scarf's hanging end)
  // would start inside the floor it is put on, fall through it and come home, again and again.
  const least = SIZES.smallest
  const mx = ((b.min[0] + b.max[0]) / 2) * k
  const [x0, x1] = (b.max[0] - b.min[0]) * k >= least ? [b.min[0] * k, b.max[0] * k] : [mx - least / 2, mx + least / 2]
  const y0 = Math.max(0, b.min[1] * k)
  const y1 = Math.max(b.max[1] * k, y0 + least)
  const mz = ((b.min[2] + b.max[2]) / 2) * k
  const [z0, z1] = sim.world.view === 'side' || (b.max[2] - b.min[2]) * k >= least ? [b.min[2] * k, b.max[2] * k] : [mz - least / 2, mz + least / 2]
  sim.world.things.push({
    id,
    name: spec.name,
    hidden: spec.hidden,
    mover: null,
    at: flat(sim, spec.at),
    slide: null,
    model: spec.model,
    scale: spec.scale,
    round: spec.round,
    weight: spec.weight,
    velocity: [0, 0, 0],
    roll: 0,
    home: flat(sim, spec.at),
    heldBy: null,
    codeMoved: false,
    putFrame: -1,
    on: null,
    box: { min: [x0, y0, z0], max: [x1, y1, z1] },
    glow: null,
    parts: {},
  })
  return id
}

export function addDecor(sim: Sim, spec: { at: Vec3; model: ModelId; scale: number; turn: number; mover: HandleId | null; name: string | null; hidden: boolean }, listens: Listens): HandleId {
  needBuilding(sim, 'addDecor')
  const i = sim.world.decor.length
  const id = register(sim, 'decor', i, listens)
  sim.world.decor.push({ id, name: spec.name, hidden: spec.hidden, mover: spec.mover, at: [...spec.at], slide: null, model: spec.model, scale: spec.scale, turn: spec.turn, turning: null, glow: null, parts: {}, changed: false })
  return id
}

export interface ZoneSpec {
  at: Vec3
  size: Vec3
  color: string | null
  wind: Vec3
  pull: number
  gravity: number
  drag: number
  mover: HandleId | null
  name: string | null
  hidden: boolean
}

export function addZone(sim: Sim, spec: ZoneSpec, listens: Listens): HandleId {
  needBuilding(sim, 'addZone')
  const i = sim.world.zones.length
  const id = register(sim, 'zone', i, listens)
  sim.world.zones.push({
    id,
    name: spec.name,
    hidden: spec.hidden,
    mover: spec.mover,
    at: flat(sim, spec.at),
    slide: null,
    size: [...spec.size],
    color: spec.color,
    wind: flat(sim, spec.wind),
    pull: spec.pull,
    gravity: spec.gravity,
    drag: spec.drag,
    inside: [],
    glow: null,
  })
  return id
}

export function addLamp(sim: Sim, spec: { at: Vec3; color: string; power: number; reach: number; mover: HandleId | null; name: string | null; hidden: boolean }, listens: Listens): HandleId {
  needBuilding(sim, 'addLamp')
  const i = sim.world.lamps.length
  const id = register(sim, 'lamp', i, listens)
  sim.world.lamps.push({ id, name: spec.name, hidden: spec.hidden, mover: spec.mover, at: [...spec.at], slide: null, color: spec.color, power: spec.power, reach: spec.reach })
  return id
}

export function addSign(sim: Sim, spec: { at: Vec3; what: SignShown; mover: HandleId | null; name: string | null; hidden: boolean }, listens: Listens): HandleId {
  needBuilding(sim, 'addSign')
  const i = sim.world.signs.length
  const id = register(sim, 'sign', i, listens)
  sim.world.signs.push({ id, name: spec.name, hidden: spec.hidden, mover: spec.mover, at: [...spec.at], slide: null, what: spec.what })
  return id
}

// ------------------------------------------------------------------------------ the room's settings, while building

export function setWayOut(sim: Sim, at: Vec3): void {
  sim.world.wayOut.at = flat(sim, at)
}

export function setControls(sim: Sim, seat: SeatIndex, stick: StickMode, a: ButtonShown, b: ButtonShown): void {
  const p = sim.world.players[seat]
  p.stick = stick
  p.a = a
  p.b = b
}

/** The room's steps, in order, each at a fixed point or at a handle (whose place it follows). */
export function setSteps(sim: Sim, steps: readonly { hint: Words; at: Vec3 | HandleId }[]): void {
  sim.world.steps = steps.map((s) => (typeof s.at === 'number' ? { hint: s.hint, target: s.at, at: pointOf(sim, s.at), doneAt: null } : { hint: s.hint, target: null, at: [...s.at], doneAt: null }))
  sim.world.next = 0
}

export function setRule(sim: Sim, words: Words): void {
  sim.world.rule = words
}

export function setClock(sim: Sim, secs: number): void {
  sim.world.clock = secs
}

export function setPushing(sim: Sim, on: boolean): void {
  sim.world.pushing = on
}

/** After the room's code first ran (and the house was built round it): everyone stands on their floor. */
export function finishBuild(sim: Sim): void {
  const w = sim.world
  for (let i = 0; i < w.solids.length; i++) refreshOutline(sim, i)
  if (w.view === 'high') {
    for (const th of w.things) if (thingLoose(th)) th.on = settleFloor(sim, thingBox3(th, emptyBox3()), th.id, -1)
    for (const p of w.players) {
      p.on = settleFloor(sim, playerBox3(p, emptyBox3()), p.id, p.seat)
      noteFloor(sim, p)
    }
  } else {
    for (const th of w.things) if (thingLoose(th)) th.on = settle(sim, thingBox(th, box), th.id, -1)
    for (const p of w.players) {
      const hw = (FEEL.width * p.size) / 2
      const found = settle(sim, { x0: p.at[0] - hw, x1: p.at[0] + hw, y0: p.at[1], y1: p.at[1] + playerHeight(p) }, p.id, p.seat)
      p.on = found
      noteFloor(sim, p)
    }
  }
  w.helper.at = helperHome(sim)
  w.helper.quietSince = 0
  sim.building = false
}

const settleGround: Ground = { id: 0, y: 0, slope: 0, solid: -1 }
function settle(sim: Sim, b: Box, self: HandleId, seat: number): HandleId | null {
  const near = gatherNear(sim, b.x0 - 1, b.y0 - 1, b.x1 + 1, b.y0 + 1)
  return groundUnder(sim, near, b.x0, b.x1, b.y0 - 0.05, b.y0 + 0.05, true, b.y0 + 0.05, self, seat >= 0, seat, settleGround) ? settleGround.id : null
}

// ------------------------------------------------------------------------------ reads

/** Any handle's point in the room now: a player's or a thing's feet, a solid's, zone's, sign's or lamp's middle, decor's foot, a mover's origin. */
export function pointOf(sim: Sim, id: HandleId): Vec3 {
  const w = whereOf(sim, id)
  const world = sim.world
  switch (w.kind) {
    case 'player':
      return world.players[w.i].at
    case 'thing':
      return world.things[w.i].at
    case 'mover':
      return world.movers[w.i].at
    case 'solid':
      return solidMiddle(sim, w.i)
    case 'decor':
      return roomPoint(sim, world.decor[w.i].at, world.decor[w.i].mover)
    case 'zone':
      return roomPoint(sim, world.zones[w.i].at, world.zones[w.i].mover)
    case 'lamp':
      return roomPoint(sim, world.lamps[w.i].at, world.lamps[w.i].mover)
    case 'sign':
      return roomPoint(sim, world.signs[w.i].at, world.signs[w.i].mover)
  }
}

/** The weight in a zone now: each player 1 times their weight change, each thing its weight, carried things too. */
export function zoneWeight(sim: Sim, id: HandleId): number {
  const z = sim.world.zones[whereOf(sim, id).i]
  let sum = 0
  for (const who of z.inside) {
    const w = sim.where[who]
    if (w.kind === 'player') {
      const p = sim.world.players[w.i]
      sum += p.change === null ? 1 : p.change.weight
    } else sum += sim.world.things[w.i].weight
  }
  return sum
}

// ------------------------------------------------------------------------------ changes, any time

/** A carried thing is let go where it is, still. */
function letGo(sim: Sim, th: Thing): void {
  if (th.heldBy === null) return
  sim.world.players[th.heldBy].holding = null
  th.heldBy = null
  th.velocity = [0, 0, 0]
  th.on = null
}

/**
 * Moves what stands on handle `id` (players and loose things whose `on` it is) by dx, dy (and from high up dz), and what
 * stands on them in turn, so a stack rides as one: a player on a crate on a moving floor, a player on
 * a head. A rider who would go into a wall across keeps their x; a thing that would not fit stays.
 * Riders form a tree (each stands on one thing), so it ends; the depth is capped all the same.
 */
function carryStack(sim: Sim, id: HandleId, dx: number, dy: number, dz: number, depth: number): void {
  if (depth > 8) return
  const high = sim.world.view === 'high'
  for (const p of sim.world.players) {
    if (p.on !== id) continue
    const fits = high ? playerFitsFloor(sim, p.at[0] + dx, p.at[1] + dy, p.at[2] + dz, playerWidth(p), playerHeight(p)) : playerFits(sim, p.at[0] + dx, p.at[1] + dy, playerWidth(p), playerHeight(p))
    const mx = fits ? dx : 0
    const mz = fits ? dz : 0
    p.at = high ? [p.at[0] + mx, p.at[1] + dy, p.at[2] + mz] : [p.at[0] + mx, p.at[1] + dy, 0]
    if (p.holding !== null) carryOverHead(sim, p)
    carryStack(sim, p.id, mx, dy, mz, depth + 1)
  }
  for (const th of sim.world.things) {
    if (th.on !== id || !thingLoose(th)) continue
    if (high ? !thingFitsFloor(sim, th, th.at[0] + dx, th.at[1] + dy, th.at[2] + dz) : !thingFits(sim, th, th.at[0] + dx, th.at[1] + dy)) continue
    th.at = high ? [th.at[0] + dx, th.at[1] + dy, th.at[2] + dz] : [th.at[0] + dx, th.at[1] + dy, 0]
    carryStack(sim, th.id, dx, dy, dz, depth + 1)
  }
}

export function putAt(sim: Sim, id: HandleId, at: Vec3): void {
  const where = whereOf(sim, id)
  const w = sim.world
  switch (where.kind) {
    case 'player':
      putPlayer(sim, w.players[where.i].seat, at)
      return
    case 'solid': {
      const s = w.solids[where.i]
      if (s.mover !== null) throw new Error(`solid ${id} is part of a mover and moves only with it`)
      const was = solidMiddle(sim, where.i)
      s.at = flat(sim, at)
      s.slide = null
      refreshOutline(sim, where.i)
      if (sim.building) return
      // What stands on it rides along, and whoever it was put into is pushed out at once.
      const now = solidMiddle(sim, where.i)
      carryStack(sim, id, now[0] - was[0], now[1] - was[1], now[2] - was[2], 0)
      if (w.view === 'high') pushBodiesFloor(sim, [where.i])
      else pushBodies(sim, [where.i])
      return
    }
    case 'thing': {
      const th = w.things[where.i]
      letGo(sim, th)
      th.at = flat(sim, at)
      th.velocity = [0, 0, 0]
      th.slide = null
      th.on = null
      th.putFrame = w.frame
      th.codeMoved = true
      return
    }
    case 'decor': {
      const d = w.decor[where.i]
      d.at = [...at]
      d.slide = null
      d.changed = true
      return
    }
    case 'zone':
    case 'lamp':
    case 'sign': {
      const h = where.kind === 'zone' ? w.zones[where.i] : where.kind === 'lamp' ? w.lamps[where.i] : w.signs[where.i]
      h.at = where.kind === 'zone' ? flat(sim, at) : [at[0], at[1], at[2]]
      h.slide = null
      return
    }
    case 'mover':
      throw new Error(`a mover has no putAt: it goes where its place says`)
  }
}

export function slideTo(sim: Sim, id: HandleId, at: Vec3, secs: number): void {
  const where = whereOf(sim, id)
  const w = sim.world
  const h =
    where.kind === 'solid' ? w.solids[where.i] : where.kind === 'thing' ? w.things[where.i] : where.kind === 'decor' ? w.decor[where.i] : where.kind === 'zone' ? w.zones[where.i] : where.kind === 'lamp' ? w.lamps[where.i] : where.kind === 'sign' ? w.signs[where.i] : null
  if (h === null) throw new Error(`a ${where.kind} has no slideTo`)
  if (h.mover !== null) throw new Error(`handle ${id} is part of a mover and moves only with it`)
  const body = where.kind === 'solid' || where.kind === 'thing' || where.kind === 'zone'
  h.slide = { from: [...h.at], to: body ? flat(sim, at) : [at[0], at[1], at[2]], start: w.t, secs: Math.max(0, secs) }
  if (where.kind === 'thing') {
    const th = w.things[where.i]
    letGo(sim, th)
    th.velocity = [0, 0, 0]
    th.on = null
  }
  if (where.kind === 'decor') w.decor[where.i].changed = true
}

export function hide(sim: Sim, id: HandleId): void {
  const where = whereOf(sim, id)
  const w = sim.world
  if (where.kind === 'player') throw new Error('a player is never hidden')
  if (where.kind === 'thing') letGo(sim, w.things[where.i])
  if (where.kind === 'decor') w.decor[where.i].changed = true
  entryOf(sim, id).hidden = true
}

export function show(sim: Sim, id: HandleId): void {
  const where = whereOf(sim, id)
  if (where.kind === 'player') throw new Error('a player is never hidden')
  const h = entryOf(sim, id)
  if (!h.hidden) return
  h.hidden = false
  if (where.kind === 'decor') sim.world.decor[where.i].changed = true
  if (where.kind === 'solid' || where.kind === 'mover') {
    // Anyone inside what was shown is put beside it.
    const solids = sim.world.solids.map((s, i) => [s, i] as const).filter(([s]) => s.id === id || s.mover === id)
    for (const [s, i] of solids) {
      if (!solidActive(sim, s) || s.surface.through) continue
      for (const body of bodies(sim)) {
        if (sim.world.view === 'high') besideIfInsideFloor(sim, body, i)
        else besideIfInside(sim, body, i)
      }
    }
  }
}

/** The World entry of any handle the room built (every one of them may be hidden). */
export function entryOf(sim: Sim, id: HandleId): Solid | Mover | Thing | Decor | Zone | Lamp | Sign {
  const where = whereOf(sim, id)
  const w = sim.world
  switch (where.kind) {
    case 'solid':
      return w.solids[where.i]
    case 'mover':
      return w.movers[where.i]
    case 'thing':
      return w.things[where.i]
    case 'decor':
      return w.decor[where.i]
    case 'zone':
      return w.zones[where.i]
    case 'lamp':
      return w.lamps[where.i]
    case 'sign':
      return w.signs[where.i]
    case 'player':
      throw new Error('a player is never hidden')
  }
}

export function turnTo(sim: Sim, id: HandleId, turn: number, secs: number): void {
  const where = whereOf(sim, id)
  const w = sim.world
  if (where.kind !== 'solid' && where.kind !== 'decor') throw new Error(`a ${where.kind} has no turnTo`)
  const h = where.kind === 'solid' ? w.solids[where.i] : w.decor[where.i]
  h.turning = { from: h.turn, to: turn, start: w.t, secs: Math.max(0, secs) }
  if (where.kind === 'decor') w.decor[where.i].changed = true
}

export function glow(sim: Sim, id: HandleId, g: Glow | null): void {
  const where = whereOf(sim, id)
  const w = sim.world
  const h =
    where.kind === 'solid' ? w.solids[where.i] : where.kind === 'mover' ? w.movers[where.i] : where.kind === 'thing' ? w.things[where.i] : where.kind === 'decor' ? w.decor[where.i] : where.kind === 'zone' ? w.zones[where.i] : where.kind === 'player' ? w.players[where.i] : null
  if (h === null) throw new Error(`a ${where.kind} has no glow`)
  h.glow = g === null ? null : { ...g }
  if (where.kind === 'decor') w.decor[where.i].changed = true
}

export function pose(sim: Sim, id: HandleId, part: string, rot: Vec3, secs: number): void {
  const where = whereOf(sim, id)
  const w = sim.world
  const h = where.kind === 'solid' ? w.solids[where.i] : where.kind === 'thing' ? w.things[where.i] : where.kind === 'decor' ? w.decor[where.i] : null
  if (h === null) throw new Error(`a ${where.kind} has no pose`)
  const now = h.parts[part]
  h.parts[part] = { from: now === undefined ? [0, 0, 0] : easeVec(now, w.t), to: [...rot], start: w.t, secs: Math.max(0, secs) }
  if (where.kind === 'decor') w.decor[where.i].changed = true
}

export function setSurface(sim: Sim, id: HandleId, changes: Partial<Surface>): void {
  const s = solidById(sim, id)
  s.surface = { ...s.surface, ...changes }
  s.surface.belt = beltOf(sim, s.surface.belt)
}

export function setZone(sim: Sim, id: HandleId, changes: Partial<Pick<Zone, 'color' | 'wind' | 'pull' | 'gravity' | 'drag'>>): void {
  const z = sim.world.zones[whereOf(sim, id).i]
  Object.assign(z, changes)
  z.wind = flat(sim, z.wind)
}

export function setLamp(sim: Sim, id: HandleId, changes: { color?: string; power?: number; reach?: number }): void {
  Object.assign(sim.world.lamps[whereOf(sim, id).i], changes)
}

/** A sign shows this from now on; a clock { clock } starts now. */
export function writeSign(sim: Sim, id: HandleId, what: number | Words | { count: number; of: number } | { clock: number }): void {
  sim.world.signs[whereOf(sim, id).i].what = typeof what === 'object' && 'clock' in what ? { clock: what.clock, from: sim.world.t } : what
}

// ------------------------------------------------------------------------------ movers

export function moverSpeed(sim: Sim, id: HandleId, k: number): void {
  moverById(sim, id).speed = k
}

export function moverSlideBy(sim: Sim, id: HandleId, by: Vec3, secs: number): void {
  const m = moverById(sim, id)
  const t = sim.world.t
  m.by = { from: easeVec(m.by, t), to: flat(sim, by), start: t, secs: Math.max(0, secs) }
}

export function moverTurnBy(sim: Sim, id: HandleId, turn: number, secs: number): void {
  const m = moverById(sim, id)
  const t = sim.world.t
  m.turnBy = { from: easeNumber(m.turnBy, t), to: turn, start: t, secs: Math.max(0, secs) }
}

/** Whether a slideBy or turnBy is under way. */
export function moverMoving(sim: Sim, id: HandleId): boolean {
  const m = moverById(sim, id)
  const t = sim.world.t
  return t < m.by.start + m.by.secs || t < m.turnBy.start + m.turnBy.secs
}

// ------------------------------------------------------------------------------ things

export function pushThing(sim: Sim, id: HandleId, v: Vec3): void {
  const th = thingById(sim, id)
  letGo(sim, th)
  th.slide = null
  th.velocity = flat(sim, [th.velocity[0] + v[0], th.velocity[1] + v[1], th.velocity[2] + v[2]])
  if (v[1] > 0) th.on = null
}

export function goHome(sim: Sim, id: HandleId): void {
  const th = thingById(sim, id)
  const w = sim.world
  letGo(sim, th)
  th.at = [...th.home]
  th.velocity = [0, 0, 0]
  th.slide = null
  th.on = null
  addPuff(w, th.home, 'spark', null, DEFAULTS.puffCount, DEFAULTS.puffSize)
  addSound(w, 'magic', th.home)
}

// ------------------------------------------------------------------------------ players

export function putPlayer(sim: Sim, seat: SeatIndex, at: Vec3): void {
  const p = sim.world.players[seat]
  const w = sim.world
  if (sim.building) {
    p.at = flat(sim, at)
    p.start = flat(sim, at)
    return
  }
  if (w.t < p.freeUntil) return
  const to = flat(sim, at)
  const [jx, jy, jz] = [to[0] - p.at[0], to[1] - p.at[1], to[2] - p.at[2]]
  const jump = Math.sqrt(jx * jx + jy * jy + jz * jz)
  p.at = to
  p.velocity = [0, 0, 0]
  p.on = null
  p.putFrame = w.frame
  if (p.holding !== null) carryOverHead(sim, p)
  // A puff only for a real jump, not for a room moving them along a little each frame.
  if (jump > PUT_PUFF) addPuff(w, p.at, 'dust', null, 6, DEFAULTS.puffSize)
}

export function pushPlayer(sim: Sim, seat: SeatIndex, v: Vec3): void {
  const p = sim.world.players[seat]
  p.velocity = flat(sim, [p.velocity[0] + v[0], p.velocity[1] + v[1], p.velocity[2] + v[2]])
  if (v[1] > 0) {
    p.on = null
    p.steep = false
    p.jumpHeld = false
    p.leftGroundAt = -Infinity
  }
}

/** A change for secs seconds (at most REFEREE.changeSecs); each of speed, jump, size and weight is times normal, size within REFEREE's range. A new change takes the old one's place. */
export function changePlayer(sim: Sim, seat: SeatIndex, changes: { speed: number; jump: number; size: number; weight: number }, secs: number): void {
  const p = sim.world.players[seat]
  p.change = {
    speed: Math.max(0, changes.speed),
    jump: Math.max(0, changes.jump),
    size: Math.max(REFEREE.sizeMin, Math.min(REFEREE.sizeMax, changes.size)),
    weight: Math.max(0, changes.weight),
    until: sim.world.t + Math.max(0, Math.min(REFEREE.changeSecs, secs)),
  }
}

export function bonk(sim: Sim, seat: SeatIndex): void {
  const p = sim.world.players[seat]
  const w = sim.world
  const t = w.t
  if (t < p.freeUntil) return
  if (p.bonkedUntil > -Infinity && t < p.bonkedUntil - REFEREE.bonkSecs + REFEREE.freeAfter) return
  p.bonkedUntil = t + REFEREE.bonkSecs
  // A little hop back from the way they face: from high up, back from their heading on the floor.
  p.velocity = w.view === 'high' ? [-p.heading[0] * BONK_V[0], BONK_V[1], -p.heading[2] * BONK_V[0]] : [-p.facing * BONK_V[0], BONK_V[1], 0]
  p.on = null
  p.steep = false
  p.jumpHeld = false
  addPuff(w, [p.at[0], p.at[1] + playerHeight(p), p.at[2]], 'star', null, 8, DEFAULTS.puffSize)
  addSound(w, 'bonk', p.at)
}

export function give(sim: Sim, seat: SeatIndex, id: HandleId): void {
  const p = sim.world.players[seat]
  const th = thingById(sim, id)
  if (p.holding === id) return
  if (p.holding !== null) letGo(sim, thingById(sim, p.holding))
  letGo(sim, th)
  th.hidden = false
  th.slide = null
  th.heldBy = p.seat
  th.on = null
  p.holding = id
  p.grabbedAt = sim.world.t
  carryOverHead(sim, p)
}

export function drop(sim: Sim, seat: SeatIndex): void {
  const p = sim.world.players[seat]
  if (p.holding !== null) putDown(sim, p)
}

export function addScore(sim: Sim, seat: SeatIndex, n: number): void {
  const p = sim.world.players[seat]
  p.score += n
  p.badge = true
}

/** w.finish: the room ends at the end of this frame. A second call does nothing. */
export function finish(sim: Sim, order: readonly SeatIndex[] | null): void {
  const w = sim.world
  if (w.finishing !== null || w.end !== null) return
  w.finishing = { order: order === null ? null : [...order] }
}

// ------------------------------------------------------------------------------ the world's acts

/** These wait for play: while building they do nothing, as the reference says. */
export function puff(sim: Sim, at: Vec3, kind: PuffKind, color: string | null, count: number, size: number): void {
  if (!sim.building) addPuff(sim.world, at, kind, color, count, size)
}
export function sound(sim: Sim, name: HouseSound): void {
  if (!sim.building) addSound(sim.world, name, null)
}
export function shake(sim: Sim, strength: number): void {
  if (!sim.building) addShake(sim.world, strength)
}
export function pop(sim: Sim, at: Vec3, what: number | Words): void {
  if (!sim.building) addPop(sim.world, at, what)
}

// ------------------------------------------------------------------------------ carrying

/** A carried thing sits on its carrier's head, its middle over their feet (from high up, engine/floor.ts carryOverHeadFloor). */
function carryOverHead(sim: Sim, p: Player): void {
  if (sim.world.view === 'high') {
    carryOverHeadFloor(sim, p)
    return
  }
  const th = thingById(sim, p.holding as HandleId)
  th.at = [p.at[0] - (th.box.min[0] + th.box.max[0]) / 2, p.at[1] + playerHeight(p) + 0.02 - th.box.min[1], 0]
  th.velocity = [p.velocity[0], p.velocity[1], 0]
}

/** Whether a thing's box at its foot `at` would be in a solid. */
function thingFits(sim: Sim, th: Thing, x: number, y: number): boolean {
  const x0 = x + th.box.min[0]
  const x1 = x + th.box.max[0]
  const y0 = y + th.box.min[1]
  const y1 = y + th.box.max[1]
  for (const i of gatherNear(sim, x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (overlaps(sim.outlines[i], x0, y0 + 0.01, x1, y1)) return false
  }
  return true
}

/**
 * Where putting down the thing `th` that player p carries sets its foot: in front of them as they
 * face, behind them if the front is in a wall, else where it is (it drops from their head). The
 * bots' search asks it too, to know where a press of grab sets a thing down.
 */
export function putDownAt(sim: Sim, p: Player, th: Thing): Vec3 {
  const hw = playerWidth(p) / 2
  const y = p.at[1] - th.box.min[1] + 0.01
  const front = (dir: number) => p.at[0] + dir * (hw + 0.05) - (dir > 0 ? th.box.min[0] : th.box.max[0])
  if (thingFits(sim, th, front(p.facing), y)) return [front(p.facing), y, 0]
  if (thingFits(sim, th, front(-p.facing), y)) return [front(-p.facing), y, 0]
  return [th.at[0], th.at[1], 0]
}

/** Puts the carried thing down where putDownAt says. */
function putDown(sim: Sim, p: Player): void {
  const th = thingById(sim, p.holding as HandleId)
  const at = sim.world.view === 'high' ? putDownAtFloor(sim, p, th) : putDownAt(sim, p, th)
  letGo(sim, th)
  th.at = at
  addSound(sim.world, 'pop', th.at)
}

/** Throws the carried thing ahead so it lands about FEEL.throwAhead ahead on the level. */
function throwIt(sim: Sim, p: Player): void {
  const th = thingById(sim, p.holding as HandleId)
  const w = sim.world
  letGo(sim, th)
  const rise = th.at[1] + th.box.min[1] - p.at[1]
  const g = FEEL.gravity
  const secs = (THROW_UP + Math.sqrt(THROW_UP * THROW_UP + 2 * g * rise)) / g
  // Ahead the way they face: from high up, their heading on the floor.
  th.velocity = w.view === 'high' ? [(p.heading[0] * FEEL.throwAhead) / secs, THROW_UP, (p.heading[2] * FEEL.throwAhead) / secs] : [(p.facing * FEEL.throwAhead) / secs, THROW_UP, 0]
  p.threwAt = w.t
  addSound(w, 'whoosh', th.at)
}

const reachBox: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
const otherBox: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }

/** How far apart two boxes are, metres (0 when they touch or overlap). */
function gap(a: Box, b: Box): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1)
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1)
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * What a press of grab would act on now: the nearest handle within reach that has use (with full
 * hands too), else, with empty hands, the nearest thing light enough to pick up; null for none.
 * The bots' search asks it too, to know where a press picks up the thing it wants.
 */
export function grabChoice(sim: Sim, p: Player): HandleId | null {
  const w = sim.world
  const full = p.holding !== null
  playerBox(p, reachBox)
  let best: HandleId | null = null
  let bestGap = Infinity
  const consider = (id: HandleId, b: Box) => {
    const d = gap(reachBox, b)
    if (d <= FEEL.reach && d < bestGap - 1e-9) {
      best = id
      bestGap = d
    }
  }
  for (const th of w.things) {
    if (th.hidden || th.heldBy !== null || th.slide !== null) continue
    if (!sim.listens[th.id].use && (full || th.weight > FEEL.carryMax)) continue
    consider(th.id, thingBox(th, otherBox))
  }
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s)) return
    const o = sim.outlines[i]
    const b = { x0: o.minX, y0: o.minY, x1: o.maxX, y1: o.maxY }
    if (sim.listens[s.id].use) consider(s.id, b)
    if (s.mover !== null && sim.listens[s.mover].use) consider(s.mover, b)
  })
  return best
}

/** The grab button: use what is nearest within reach and has use (with full hands too); else put down or throw what they carry, or pick up what is nearest. */
function grab(sim: Sim, p: Player): void {
  const w = sim.world
  const full = p.holding !== null
  const high = w.view === 'high'
  const best = high ? grabChoiceFloor(sim, p) : grabChoice(sim, p)
  if (best !== null && sim.listens[best].use) {
    sim.hooks.use(best, p.seat)
    return
  }
  if (full) {
    // Walking: from the side the stick across, from high up the stick any way on the floor.
    const [sx, sy] = p.input.stick
    if (high ? Math.sqrt(sx * sx + sy * sy) > 0.3 : Math.abs(sx) > 0.3) throwIt(sim, p)
    else putDown(sim, p)
    return
  }
  if (best === null) return
  const id: HandleId = best
  const th = thingById(sim, id)
  th.heldBy = p.seat
  th.on = null
  p.holding = id
  p.grabbedAt = w.t
  carryOverHead(sim, p)
  addSound(w, 'pop', th.at)
}

// ------------------------------------------------------------------------------ pushing out, squeezing

const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }

function bodyBox(b: Body, out: Box): Box {
  return b.kind === 'player' ? playerBox(b.p, out) : thingBox(b.t, out)
}

function moveBody(b: Body, dx: number, dy: number): void {
  if (b.kind === 'player') b.p.at = [b.p.at[0] + dx, b.p.at[1] + dy, 0]
  else b.t.at = [b.t.at[0] + dx, b.t.at[1] + dy, 0]
}

/** Whether the body's box, moved by dx, dy, is clear of every solid but through-floors. */
function clearAt(sim: Sim, b: Body, dx: number, dy: number): boolean {
  bodyBox(b, box)
  const x0 = box.x0 + dx
  const x1 = box.x1 + dx
  const y0 = box.y0 + dy
  const y1 = box.y1 + dy
  for (const i of gatherNear(sim, x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (overlaps(sim.outlines[i], x0, y0 + 0.01, x1, y1)) return false
  }
  return true
}

/** A body inside solid i is put beside it: the nearest free spot of its left, right, top and bottom; where none is free it stays, and walks out of it. */
function besideIfInside(sim: Sim, b: Body, i: number): void {
  bodyBox(b, box)
  const o = sim.outlines[i]
  if (!overlaps(o, box.x0, box.y0 + 0.01, box.x1, box.y1)) return
  const moves: [number, number][] = [
    [o.minX - box.x1 - 0.01, 0],
    [o.maxX - box.x0 + 0.01, 0],
    [0, o.maxY - box.y0],
    [0, o.minY - box.y1 - 0.01],
  ]
  moves.sort((m, n) => Math.abs(m[0]) + Math.abs(m[1]) - (Math.abs(n[0]) + Math.abs(n[1])))
  for (const [dx, dy] of moves) {
    if (clearAt(sim, b, dx, dy)) {
      moveBody(b, dx, dy)
      if (b.kind === 'player') b.p.on = null
      else b.t.on = null
      return
    }
  }
}

/** A solid that moved into a body pushes it out the shortest way; squeezed against something else, the body is put beside the solid that moved. */
function pushBodies(sim: Sim, moved: readonly number[]): void {
  if (moved.length === 0) return
  for (const b of bodies(sim)) pushBody(sim, b, moved)
}

/** The solids in `moved` push one body out of them, as pushBodies says. */
function pushBody(sim: Sim, b: Body, moved: readonly number[]): void {
  const on = b.kind === 'player' ? b.p.on : b.t.on
  for (const i of moved) {
    const s = sim.world.solids[i]
    if (s.id === on || s.surface.through || !solidActive(sim, s)) continue
    bodyBox(b, box)
    const [dx, dy] = pushOut(sim.outlines[i], box.x0, box.y0, box.x1, box.y1)
    if (dx === 0 && dy === 0) continue
    moveBody(b, dx, dy)
    if (dy > 0 && Math.abs(dx) < 1e-9) {
      // Pushed up from below: now standing on it.
      if (b.kind === 'player') b.p.on = s.id
      else b.t.on = s.id
    }
    if (!clearAt(sim, b, 0, 0)) {
      moveBody(b, -dx, -dy)
      besideIfInside(sim, b, i)
    }
  }
}

/** The solids in `moved` (by index) push player p out of them, as the movers' phase pushes every body: the bots' search pushes its copy of a bot so. */
export function pushPlayerOut(sim: Sim, p: Player, moved: readonly number[]): void {
  pushBody(sim, { kind: 'player', p }, moved)
}

// ------------------------------------------------------------------------------ taps

/** The handle under a tap nearest the viewer that has a tap of its own, or null. Ties go to the one built last, drawn over the others. */
export function tapTarget(sim: Sim, x: number, y: number): HandleId | null {
  const w = sim.world
  let best: HandleId | null = null
  let bestZ = -Infinity
  const take = (id: HandleId, z: number) => {
    if (z > bestZ || (z === bestZ && best !== null && id > best)) {
      best = id
      bestZ = z
    }
  }
  const inBox = (cx: number, cy: number, hw: number, h0: number, h1: number) => x >= cx - hw && x <= cx + hw && y >= cy + h0 && y <= cy + h1
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s) || !contains(sim.outlines[i], x, y)) return
    if (sim.listens[s.id].tap) take(s.id, 0)
    if (s.mover !== null && sim.listens[s.mover].tap) take(s.mover, 0)
  })
  for (const th of w.things) if (!th.hidden && sim.listens[th.id].tap && x >= th.at[0] + th.box.min[0] && x <= th.at[0] + th.box.max[0] && y >= th.at[1] + th.box.min[1] && y <= th.at[1] + th.box.max[1]) take(th.id, 0)
  for (const d of w.decor) {
    if (d.hidden || moverHidden(sim, d.mover)) continue
    const listening = sim.listens[d.id].tap || (d.mover !== null && sim.listens[d.mover].tap)
    if (!listening) continue
    const b = w.models[d.model].bounds
    const at = roomPoint(sim, d.at, d.mover)
    if (x >= at[0] + b.min[0] * d.scale && x <= at[0] + b.max[0] * d.scale && y >= at[1] + b.min[1] * d.scale && y <= at[1] + b.max[1] * d.scale) {
      take(sim.listens[d.id].tap ? d.id : (d.mover as HandleId), at[2])
    }
  }
  for (const z of w.zones) {
    if (z.hidden || moverHidden(sim, z.mover) || !sim.listens[z.id].tap) continue
    const at = roomPoint(sim, z.at, z.mover)
    if (inBox(at[0], at[1], z.size[0] / 2, -z.size[1] / 2, z.size[1] / 2)) take(z.id, 0)
  }
  for (const s of w.signs) {
    if (s.hidden || moverHidden(sim, s.mover) || !sim.listens[s.id].tap) continue
    const at = roomPoint(sim, s.at, s.mover)
    if (inBox(at[0], at[1], SIZES.signHeight, -SIZES.signHeight / 2, SIZES.signHeight / 2)) take(s.id, at[2])
  }
  for (const l of w.lamps) {
    if (l.hidden || moverHidden(sim, l.mover) || !sim.listens[l.id].tap) continue
    const at = roomPoint(sim, l.at, l.mover)
    if (inBox(at[0], at[1], 0.3, -0.3, 0.3)) take(l.id, at[2])
  }
  return best
}

// ------------------------------------------------------------------------------ the referee's helpers

function helperHome(sim: Sim): Vec3 {
  if (sim.world.view === 'high') return [ROOM.high.width / 2 + ROOM.wall / 2, ROOM.high.wallHigh + HELPER_HOME.overWalls, -ROOM.high.depth / 2 - ROOM.wall / 2]
  return [ROOM.side.width / 2 - HELPER_HOME.beamIn, ROOM.side.height + ROOM.beam / 2, 0]
}

/**
 * Holds player p inside the room's box, whatever carried or put them out of it (a head or a mover
 * that rose, a room's putAt): across, along z from high up, and under its top, their speed out of
 * it stopped. Below, the house's floor holds them, and falling out is the referee's backstop.
 * Changes only p, and gives back whether it moved them. The referee holds every player so at the
 * end of each frame, and the bots' search holds its copy of a bot so.
 */
export function holdInRoom(sim: Sim, p: Player): boolean {
  const b = sim.world.bounds
  const hw = playerWidth(p) / 2
  const x = Math.min(b.max[0] - hw, Math.max(b.min[0] + hw, p.at[0]))
  const y = Math.min(b.max[1] - playerHeight(p), p.at[1])
  const z = sim.world.view === 'high' ? Math.min(b.max[2] - hw, Math.max(b.min[2] + hw, p.at[2])) : p.at[2]
  if (x === p.at[0] && y === p.at[1] && z === p.at[2]) return false
  p.velocity = [x === p.at[0] ? p.velocity[0] : 0, y === p.at[1] ? p.velocity[1] : Math.min(0, p.velocity[1]), z === p.at[2] ? p.velocity[2] : 0]
  p.at = [x, y, z]
  return true
}

/** Where they stand now, kept for coming back after a fall: only a solid that is not too steep counts as a floor. */
function noteFloor(sim: Sim, p: Player): void {
  if (p.on === null || p.steep || sim.where[p.on].kind !== 'solid') return
  const m = solidMiddle(sim, sim.where[p.on].i)
  p.lastFloor = { on: p.on, at: [p.at[0] - m[0], p.at[1] - m[1], p.at[2] - m[2]] }
}

function comeBack(sim: Sim, p: Player): void {
  const w = sim.world
  const from: Vec3 = [...p.at]
  let to: Vec3 = [...p.start]
  if (p.lastFloor !== null) {
    const where = sim.where[p.lastFloor.on]
    if (solidActive(sim, w.solids[where.i])) {
      const m = solidMiddle(sim, where.i)
      to = [m[0] + p.lastFloor.at[0], m[1] + p.lastFloor.at[1], m[2] + p.lastFloor.at[2]]
    }
  }
  p.at = to
  p.velocity = [0, 0, 0]
  p.on = null
  p.steep = false
  p.jumpHeld = false
  p.back = { from, until: w.t + BACK_SECS }
  if (p.holding !== null) carryOverHead(sim, p)
  addPuff(w, to, 'star', null, 10, DEFAULTS.puffSize)
  addSound(w, 'magic', to)
}

// ------------------------------------------------------------------------------ the frame

/** Pushers' weight on each thing this frame, by thing index, + to the right; from high up the weight times their heading's x, and pushDepth times its z (the push's net arrow on the floor). */
const pushWeight: number[] = []
const pushDepth: number[] = []
/** From high up: the weight of the pushers whose heading is within PUSH_ALONG of the net arrow, who count whole. */
const pushAlong: number[] = []
/** From high up a pusher counts with their whole weight when they point within 45 degrees of the push's net arrow: two children's sticks never point exactly the same way. */
const PUSH_ALONG = Math.SQRT1_2
/** What each body came onto this frame: [touched, who]. */
const lands: [HandleId, HandleId][] = []

/** One frame of play, in FRAME_ORDER. */
export function step(sim: Sim, input: FrameInput): void {
  const w = sim.world
  const playing = w.end === null
  if (input.pads.length !== w.players.length) throw new Error(`a frame has ${input.pads.length} pads for ${w.players.length} players`)
  w.frame += 1
  w.t = w.frame * DT
  const t = w.t
  lands.length = 0

  // buttons
  input.pads.forEach((pad, seat) => {
    const p = w.players[seat]
    for (const name of ['a', 'b'] as const) {
      const job = p[name]
      if (playing && job !== null && typeof job === 'object') {
        const button = pad[name]
        if (button.pressed) sim.hooks.button(p.seat, name, 'press')
        if (button.held) sim.hooks.button(p.seat, name, 'hold')
        if ((p.input[name] || button.pressed) && !button.held) sim.hooks.button(p.seat, name, 'release')
      }
    }
    p.input = { stick: [pad.stick[0], pad.stick[1]], a: pad.a.held, b: pad.b.held }
  })

  // taps
  w.pointers = input.pointing.held.map((at) => flat(sim, at))
  if (playing) for (const tap of input.pointing.taps) sim.hooks.tap(w.view === 'high' ? tapTargetFloor(sim, tap.at[0], tap.at[1], tap.at[2]) : tapTarget(sim, tap.at[0], tap.at[1]), flat(sim, tap.at))

  // movers
  moversPhase(sim)

  // players
  input.pads.forEach((pad, seat) => playerPhase(sim, w.players[seat], pad, playing))
  if (w.pushing) {
    if (w.view === 'high') separatePlayersFloor(sim)
    else separatePlayers(sim)
  }

  // things
  thingsPhase(sim)

  if (playing) {
    contactsPhase(sim)
    zonesPhase(sim)
    sim.hooks.timers()
    sim.hooks.frame()
    // steps
    if (w.next < w.steps.length && sim.hooks.done(w.next)) {
      const s = w.steps[w.next]
      s.doneAt = t
      w.next += 1
      w.helper.quietSince = t
      w.helper.step = null
      w.helper.says = null
      addSound(w, 'ding', s.at)
      addPuff(w, s.at, 'star', null, DEFAULTS.puffCount, DEFAULTS.puffSize * 1.5)
    }
  } else {
    w.contacts = []
  }
  for (const s of w.steps) if (s.target !== null) s.at = [...pointOf(sim, s.target)]

  refereePhase(sim, input.help)
}

/**
 * A rider's feet in the frame of the solid it stands on, from the solid's middle x, y and its turn
 * before it moves. The movers' phase keeps every rider there as the solid moves (riderAt), and the
 * bots' search carries its copy of a bot the same way.
 */
export function riderFrame(at: Vec3, x: number, y: number, turn: number): [number, number] {
  const c = cos(-turn)
  const s = sin(-turn)
  const dx = at[0] - x
  const dy = at[1] - y
  return [c * dx - s * dy, s * dx + c * dy]
}

/** Where a rider's feet are in the room, from riderFrame's lx, ly and the solid's middle x, y and turn now. */
export function riderAt(lx: number, ly: number, x: number, y: number, turn: number): [number, number] {
  const c = cos(turn)
  const s = sin(turn)
  return [x + c * lx - s * ly, y + s * lx + c * ly]
}

function moversPhase(sim: Sim): void {
  const w = sim.world
  const t = w.t
  // Riders on what is about to move, in the frame of the solid they stand on.
  const riders: { body: Body; solid: number; lx: number; ly: number }[] = []
  const oldX = sim.outlines.map((o) => o.cx)
  const oldY = sim.outlines.map((o) => o.cy)
  // From high up a solid's middle height too (always 0 from the side).
  const oldM = sim.outlines.map((o) => o.ym)
  const oldTurn = [...sim.turns]
  for (const m of w.movers) {
    m.clock += m.speed * DT
    const pose = sim.hooks.place(m.id, m.clock)
    const by = easeVec(m.by, t)
    m.at = flat(sim, [pose.at[0] + by[0], pose.at[1] + by[1], pose.at[2] + by[2]])
    m.turn = pose.turn + easeNumber(m.turnBy, t)
  }
  const moved: number[] = []
  w.solids.forEach((s, i) => {
    if (s.slide !== null) {
      s.at = easeVec(s.slide, t)
      if (t >= s.slide.start + s.slide.secs) s.slide = null
    }
    if (s.turning !== null) {
      s.turn = easeNumber(s.turning, t)
      if (t >= s.turning.start + s.turning.secs) s.turning = null
    }
    refreshOutline(sim, i)
    const o = sim.outlines[i]
    if (o.cx !== oldX[i] || o.cy !== oldY[i] || o.ym !== oldM[i] || sim.turns[i] !== oldTurn[i]) moved.push(i)
  })
  for (const list of [w.decor, w.zones, w.lamps, w.signs]) {
    for (const h of list) {
      if (h.slide === null) continue
      h.at = easeVec(h.slide, t)
      if (t >= h.slide.start + h.slide.secs) h.slide = null
    }
  }
  for (const d of w.decor) {
    if (d.turning === null) continue
    d.turn = easeNumber(d.turning, t)
    if (t >= d.turning.start + d.turning.secs) d.turning = null
  }
  if (moved.length === 0) return
  if (w.view === 'high') {
    carryRidersFloor(sim, moved, oldX, oldM, oldY, oldTurn)
    pushBodiesFloor(sim, moved)
    return
  }
  // Carry what stands on a solid that moved: its feet keep their place in the solid's own frame.
  for (const body of bodies(sim)) {
    const on = body.kind === 'player' ? body.p.on : body.t.on
    if (on === null || sim.where[on].kind !== 'solid') continue
    const i = sim.where[on].i
    if (!moved.includes(i)) continue
    const [lx, ly] = riderFrame(body.kind === 'player' ? body.p.at : body.t.at, oldX[i], oldY[i], oldTurn[i])
    riders.push({ body, solid: i, lx, ly })
  }
  for (const r of riders) {
    const o = sim.outlines[r.solid]
    const [x, y] = riderAt(r.lx, r.ly, o.cx, o.cy, sim.turns[r.solid])
    const at = r.body.kind === 'player' ? r.body.p.at : r.body.t.at
    const [dx, dy] = [x - at[0], y - at[1]]
    if (r.body.kind === 'player') r.body.p.at = [x, y, 0]
    else r.body.t.at = [x, y, 0]
    // And whatever stands on the rider, by the same move.
    carryStack(sim, r.body.kind === 'player' ? r.body.p.id : r.body.t.id, dx, dy, 0, 0)
  }
  pushBodies(sim, moved)
}

/** From high up: what stands on a solid that moved keeps its place in the solid's own frame (engine/floor.ts riderFrameFloor), and what stands on it goes along. The solids' middles before the move are by index: x, y (height) and z, and their turns round y. */
function carryRidersFloor(sim: Sim, moved: readonly number[], oldX: readonly number[], oldY: readonly number[], oldZ: readonly number[], oldTurn: readonly number[]): void {
  const riders: { body: Body; solid: number; local: Vec3 }[] = []
  for (const body of bodies(sim)) {
    const on = body.kind === 'player' ? body.p.on : body.t.on
    if (on === null || sim.where[on].kind !== 'solid') continue
    const i = sim.where[on].i
    if (!moved.includes(i)) continue
    riders.push({ body, solid: i, local: riderFrameFloor(body.kind === 'player' ? body.p.at : body.t.at, oldX[i], oldY[i], oldZ[i], oldTurn[i]) })
  }
  for (const r of riders) {
    const o = sim.outlines[r.solid]
    const to = riderAtFloor(r.local, o.cx, o.ym, o.cy, sim.turns[r.solid])
    const at = r.body.kind === 'player' ? r.body.p.at : r.body.t.at
    const [dx, dy, dz] = [to[0] - at[0], to[1] - at[1], to[2] - at[2]]
    if (r.body.kind === 'player') r.body.p.at = to
    else r.body.t.at = to
    carryStack(sim, r.body.kind === 'player' ? r.body.p.id : r.body.t.id, dx, dy, dz, 0)
  }
}

function playerPhase(sim: Sim, p: Player, pad: Pad, playing: boolean): void {
  const w = sim.world
  const t = w.t
  const [ox, oy, oz] = [p.at[0], p.at[1], p.at[2]]
  const strideBefore = p.stride
  const wasOn = p.on
  const landed = w.view === 'high' ? movePlayerFloor(sim, p, pad) : movePlayer(sim, p, pad)
  if (landed !== null) lands.push([landed, p.id])
  // Riders on this player's head go with them.
  const dx = p.at[0] - ox
  const dy = p.at[1] - oy
  const dz = p.at[2] - oz
  if (dx !== 0 || dy !== 0 || dz !== 0) carryStack(sim, p.id, dx, dy, dz, 0)
  if (playing && t >= p.bonkedUntil) {
    const grabButton = p.a === 'grab' ? pad.a : p.b === 'grab' ? pad.b : null
    if (grabButton !== null && grabButton.pressed) grab(sim, p)
  }
  if (p.holding !== null) carryOverHead(sim, p)
  noteFloor(sim, p)
  // The engine's own sounds: a jump, a landing, footsteps.
  if (p.jumpedAt === t) addSound(w, 'whoosh', p.at)
  if (p.landedAt === t && p.landSpeed > 3) {
    addSound(w, 'step', p.at)
    addPuff(w, p.at, 'dust', null, 5, DEFAULTS.puffSize)
  }
  if (p.on !== null && wasOn !== null && Math.floor(p.stride / FOOTSTEP) !== Math.floor(strideBefore / FOOTSTEP)) addSound(w, 'step', p.at)
  if (landed !== null && p.velocity[1] > 0 && sim.where[landed].kind === 'solid') addSound(w, 'boing', p.at)
}

/** With pushing on, players who overlap are moved apart, half the overlap each. */
function separatePlayers(sim: Sim): void {
  const ps = sim.world.players
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      const need = (playerWidth(a) + playerWidth(b)) / 2
      const d = b.at[0] - a.at[0]
      const overlapY = a.at[1] < b.at[1] + playerHeight(b) - 0.05 && b.at[1] < a.at[1] + playerHeight(a) - 0.05
      if (!overlapY || Math.abs(d) >= need) continue
      const push = (need - Math.abs(d)) / 2
      const dir = d === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(d)
      if (playerFits(sim, a.at[0] - dir * push, a.at[1], playerWidth(a), playerHeight(a))) a.at = [a.at[0] - dir * push, a.at[1], 0]
      if (playerFits(sim, b.at[0] + dir * push, b.at[1], playerWidth(b), playerHeight(b))) b.at = [b.at[0] + dir * push, b.at[1], 0]
    }
  }
}

function thingsPhase(sim: Sim): void {
  const w = sim.world
  const t = w.t
  const high = w.view === 'high'
  pushWeight.length = w.things.length
  pushWeight.fill(0)
  pushDepth.length = w.things.length
  pushDepth.fill(0)
  pushAlong.length = w.things.length
  pushAlong.fill(0)
  for (const p of w.players) {
    if (p.pushing === null) continue
    const th = thingById(sim, p.pushing)
    const k = p.change === null ? 1 : p.change.weight
    if (high) {
      // From high up they push the way they walk; their arrows add up to the way it goes.
      pushWeight[sim.where[p.pushing].i] += p.heading[0] * k
      pushDepth[sim.where[p.pushing].i] += p.heading[2] * k
      continue
    }
    const side = th.at[0] + (th.box.min[0] + th.box.max[0]) / 2 > p.at[0] ? 1 : -1
    pushWeight[sim.where[p.pushing].i] += side * k
  }
  if (high) {
    for (const p of w.players) {
      if (p.pushing === null) continue
      const i = sim.where[p.pushing].i
      const net = Math.sqrt(pushWeight[i] * pushWeight[i] + pushDepth[i] * pushDepth[i])
      if (net <= 1e-9) continue
      if ((p.heading[0] * pushWeight[i] + p.heading[2] * pushDepth[i]) / net >= PUSH_ALONG - 1e-9) pushAlong[i] += p.change === null ? 1 : p.change.weight
    }
  }
  w.things.forEach((th, i) => {
    if (th.hidden || th.heldBy !== null) return
    if (th.slide !== null) {
      th.at = easeVec(th.slide, t)
      th.on = null
      if (t >= th.slide.start + th.slide.secs) {
        th.slide = null
        th.velocity = [0, 0, 0]
      }
      return
    }
    const [ox, oy, oz] = [th.at[0], th.at[1], th.at[2]]
    let landed: HandleId | null
    if (high) {
      // It moves along the net arrow when those pushing roughly along it weigh at least as much together.
      const net = Math.sqrt(pushWeight[i] * pushWeight[i] + pushDepth[i] * pushDepth[i])
      const k = net > 1e-9 && pushAlong[i] >= th.weight - 1e-9 ? FEEL.pushSpeed / net : 0
      landed = moveThingFloor(sim, th, pushWeight[i] * k, pushDepth[i] * k)
    } else {
      const net = pushWeight[i]
      const push = net !== 0 && Math.abs(net) >= th.weight - 1e-9 ? Math.sign(net) * FEEL.pushSpeed : 0
      landed = moveThing(sim, th, push)
    }
    if (landed !== null) lands.push([landed, th.id])
    const dx = th.at[0] - ox
    const dy = th.at[1] - oy
    const dz = th.at[2] - oz
    // What rests on it goes with it.
    if (dx !== 0 || dy !== 0 || dz !== 0) carryStack(sim, th.id, dx, dy, dz, 0)
  })
}

const touchBox: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }

function contactsPhase(sim: Sim): void {
  const w = sim.world
  const pairs: [HandleId, HandleId][] = w.view === 'high' ? touchPairsFloor(sim, TOUCH) : sideTouchPairs(sim)
  const key = (a: HandleId, b: HandleId) => a * 65536 + b
  const before = new Set(w.contacts.map(([a, b]) => key(a, b)))
  const seen = new Set<number>()
  const current: [HandleId, HandleId][] = []
  for (const pr of pairs) {
    const k = key(pr[0], pr[1])
    if (seen.has(k)) continue
    seen.add(k)
    current.push(pr)
  }
  current.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  // The events: touches begun, and landings, by the touched handle's build order, then the toucher's.
  const events: { touched: HandleId; who: HandleId; land: boolean }[] = []
  for (const [a, b] of current) if (!before.has(key(a, b))) events.push({ touched: a, who: b, land: false })
  for (const [on, who] of lands) {
    const where = sim.where[on]
    if (where.kind === 'solid') {
      const s = w.solids[where.i]
      if (sim.listens[s.id].land) events.push({ touched: s.id, who, land: true })
      if (s.mover !== null && sim.listens[s.mover].land) events.push({ touched: s.mover, who, land: true })
    } else if (where.kind === 'thing' && sim.listens[on].land) events.push({ touched: on, who, land: true })
  }
  events.sort((a, b) => a.touched - b.touched || a.who - b.who || Number(a.land) - Number(b.land))
  w.contacts = current
  for (const e of events) {
    if (e.land) sim.hooks.land(e.touched, e.who)
    else sim.hooks.touch(e.touched, e.who)
  }
}

/** The pairs that touch now from the side, [touched, toucher] by id: every player and loose thing within TOUCH of a solid, a mover's solid or a thing that listens for touch. */
function sideTouchPairs(sim: Sim): [HandleId, HandleId][] {
  const w = sim.world
  const pairs: [HandleId, HandleId][] = []
  // Who touches: every player, and every thing that touches (shown, not carried).
  const touchers: { id: HandleId; b: Box }[] = []
  for (const p of w.players) touchers.push({ id: p.id, b: { ...playerBox(p, touchBox) } })
  for (const th of w.things) if (thingLoose(th)) touchers.push({ id: th.id, b: { ...thingBox(th, touchBox) } })
  const touching = (o: { b: Box }, test: (x0: number, y0: number, x1: number, y1: number) => boolean) => test(o.b.x0 - TOUCH, o.b.y0 - TOUCH, o.b.x1 + TOUCH, o.b.y1 + TOUCH)
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s)) return
    const own = sim.listens[s.id].touch
    const mover = s.mover !== null && sim.listens[s.mover].touch ? s.mover : null
    if (!own && mover === null) return
    for (const who of touchers) {
      if (!touching(who, (x0, y0, x1, y1) => overlaps(sim.outlines[i], x0, y0, x1, y1))) continue
      if (own) pairs.push([s.id, who.id])
      if (mover !== null) pairs.push([mover, who.id])
    }
  })
  for (const th of w.things) {
    if (!thingLoose(th) || !sim.listens[th.id].touch) continue
    const b = thingBox(th, { x0: 0, y0: 0, x1: 0, y1: 0 })
    for (const who of touchers) {
      if (who.id === th.id) continue
      if (touching(who, (x0, y0, x1, y1) => b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0)) pairs.push([th.id, who.id])
    }
  }
  return pairs
}

function zonesPhase(sim: Sim): void {
  const w = sim.world
  const pb: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
  for (const z of w.zones) {
    const old = z.inside
    const now: HandleId[] = []
    if (!z.hidden && !moverHidden(sim, z.mover) && w.view === 'high') zoneMembersFloor(sim, z, now)
    else if (!z.hidden && !moverHidden(sim, z.mover)) {
      const c = roomPoint(sim, z.at, z.mover)
      const hx = z.size[0] / 2
      const hy = z.size[1] / 2
      const inZone = (b: Box) => b.x0 < c[0] + hx && b.x1 > c[0] - hx && b.y0 < c[1] + hy && b.y1 > c[1] - hy
      for (const p of w.players) if (inZone(playerBox(p, pb))) now.push(p.id)
      // A carried thing is where the hands carrying it are: in exactly when its carrier is.
      for (const th of w.things) if (!th.hidden && inZone(th.heldBy === null ? thingBox(th, pb) : playerBox(w.players[th.heldBy], pb))) now.push(th.id)
    }
    z.inside = now
    const l = sim.listens[z.id]
    if (l.enter) for (const id of now) if (!old.includes(id)) sim.hooks.zone(z.id, 'enter', id)
    if (l.stay) for (const id of now) sim.hooks.zone(z.id, 'stay', id)
    if (l.leave) for (const id of old) if (!now.includes(id)) sim.hooks.zone(z.id, 'leave', id)
  }
}

function refereePhase(sim: Sim, help: boolean): void {
  const w = sim.world
  const t = w.t
  // Falls, back onto the last floor: out of the bottom of the room. The house's floor and walls hold
  // everyone in, so this is only the backstop, for a body a room put below the floor or squeezed
  // through it.
  const high = w.view === 'high'
  for (const p of w.players) if (p.at[1] < w.bounds.min[1] - OUT) comeBack(sim, p)
  // A thing that leaves the room comes home: from high up, out of the box across or along z too.
  for (const th of w.things) {
    if (th.hidden || th.heldBy !== null) continue
    const b = thingBox(th, box)
    const cx = (b.x0 + b.x1) / 2
    const cz = th.at[2] + (th.box.min[2] + th.box.max[2]) / 2
    const outZ = high && (cz < w.bounds.min[2] - OUT || cz > w.bounds.max[2] + OUT)
    if (b.y1 < w.bounds.min[1] - OUT || cx < w.bounds.min[0] - OUT || cx > w.bounds.max[0] + OUT || b.y0 > w.bounds.max[1] + 4 * OUT || outZ) goHome(sim, th.id)
    th.codeMoved = th.putFrame >= 0 && w.frame - th.putFrame <= 1
  }
  for (const p of w.players) {
    if (p.back !== null && t >= p.back.until) p.back = null
    if (p.change !== null && t >= p.change.until) p.change = null
    // Size: shrinking at once, growing only into the room there is, inside the room's box.
    const target = p.change === null ? 1 : p.change.size
    const inBox = (k: number) => {
      const hw = (FEEL.width * k) / 2
      const b = w.bounds
      return p.at[0] - hw >= b.min[0] - 1e-9 && p.at[0] + hw <= b.max[0] + 1e-9 && p.at[1] + FEEL.height * k <= b.max[1] + 1e-9 && (!high || (p.at[2] - hw >= b.min[2] - 1e-9 && p.at[2] + hw <= b.max[2] + 1e-9))
    }
    const fits = (k: number) => inBox(k) && (high ? playerFitsFloor(sim, p.at[0], p.at[1], p.at[2], FEEL.width * k, FEEL.height * k) : playerFits(sim, p.at[0], p.at[1], FEEL.width * k, FEEL.height * k))
    if (p.size > target) p.size = target
    else if (p.size < target) {
      if (fits(target)) p.size = target
      else {
        let lo = p.size
        let hi = target
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2
          if (fits(mid)) lo = mid
          else hi = mid
        }
        p.size = lo
      }
    }
    // Inside the room's box, whatever carried or put them out of it.
    if (holdInRoom(sim, p) && p.holding !== null) carryOverHead(sim, p)
    // The freedom rule: held still for REFEREE.freeAfter in a row, then free of it for as long. A
    // speed change below REFEREE.slow counts as 0; a putAt holds them while they were put lately and
    // are still near where the run began (a room moving them along is not holding them).
    const slow = p.change !== null && p.change.speed < REFEREE.slow && t >= p.freeUntil
    const putLately = p.putFrame >= 0 && (w.frame - p.putFrame) * DT <= REFEREE.pinSecs + 1e-9
    const [hx, hy, hz] = [p.at[0] - p.heldAt[0], p.at[1] - p.heldAt[1], p.at[2] - p.heldAt[2]]
    const near = p.heldSince === null || Math.sqrt(hx * hx + hy * hy + hz * hz) <= REFEREE.pinRadius
    const held = t < p.bonkedUntil || slow || (putLately && near)
    if (!held) p.heldSince = null
    else {
      if (p.heldSince === null) {
        p.heldSince = t
        p.heldAt = [...p.at]
      }
      if (t - p.heldSince + DT >= REFEREE.freeAfter - 1e-9) {
        p.freeUntil = t + REFEREE.freeAfter
        p.heldSince = null
        p.bonkedUntil = Math.min(p.bonkedUntil, t)
      }
    }
  }
  // The helper.
  const h = w.helper
  const waiting = w.next < w.steps.length && w.end === null
  if (waiting && help) {
    // A ? pressed again while this step's hint is already said says it again but counts no new hint: children press a button many times.
    if (h.says === null || h.step !== w.next) h.hints += 1
    h.step = w.next
    h.says = w.steps[w.next].hint
    h.saidAt = t
  } else if (waiting && h.step === null && t - h.quietSince >= HELPER.flySecs) {
    h.step = w.next
  } else if (waiting && h.step !== null && h.says === null && t - h.quietSince >= HELPER.flySecs + HELPER.saySecs) {
    h.says = w.steps[w.next].hint
    h.saidAt = t
    h.hints += 1
  }
  if (!waiting) {
    h.step = null
    h.says = null
  }
  const goal: Vec3 = h.step === null ? helperHome(sim) : flat(sim, [w.steps[h.step].at[0], w.steps[h.step].at[1] + HELPER_OVER, w.steps[h.step].at[2]])
  const dx = goal[0] - h.at[0]
  const dy = goal[1] - h.at[1]
  const dz = goal[2] - h.at[2]
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const stepLen = HELPER_FLY * DT
  h.at = d <= stepLen ? goal : flat(sim, [h.at[0] + (dx / d) * stepLen, h.at[1] + (dy / d) * stepLen, h.at[2] + (dz / d) * stepLen])
  // The end: a w.finish called this frame, or the room's clock running out.
  if (w.end === null) {
    if (w.finishing !== null) w.end = { at: t, by: 'finish', order: w.finishing.order }
    else if (w.clock !== null && t >= w.clock - 1e-9) {
      const order = w.kind === 'contest' ? [...w.players].sort((a, b) => b.score - a.score || a.seat - b.seat).map((p) => p.seat) : null
      w.end = { at: t, by: 'clock', order }
    }
    if (w.end !== null) {
      w.finishing = null
      w.wayOut.open = true
      addSound(w, 'yay', null)
      addPuff(w, [w.wayOut.at[0], w.wayOut.at[1] + SIZES.doorHeight, w.wayOut.at[2]], 'confetti', null, DEFAULTS.puffMax, DEFAULTS.puffSize * 1.5)
    }
  }
  ageEffects(w)
}

