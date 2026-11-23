/**
 * Magic House: fixtures for the sim's tests, and for anyone's who needs a room without made code:
 * hooks that record what they are called with, a party, floors, boxes and things built with plain
 * values, and pads driven by what is held each frame (the presses worked out as a seat would).
 */

import type { Recipe, Vec3 } from '../../../silly-billy/src/engine/types'
import type { FrameInput, Pad, Pointing, SeatIndex } from '../seats/types'
import { NO_POINTING } from '../seats/types'
import type { Builder, Level, RoomCode, StepSpec, World } from './api'
import type { Model } from './gift'
import { plainParty } from './party'
import { buildRoom, Room, RoomBuildError, RoomRuntime, stepRoom } from './room'
import { nextThrow, sin, streamState } from './math'
import {
  addModel,
  addMover,
  addSolid,
  addThing,
  addZone,
  createSim,
  finishBuild,
  placeMover,
  putPlayer,
  setSteps,
  step,
  type Hooks,
  type Listens,
  type MoverPose,
  type RoomStart,
  type Sim,
} from './sim'
import { NO_LISTENS } from './state'
import { HOUSE_SHELL, type HandleId, type ModelId, type RoomKind, type Solid as WorldSolid, type SolidShape, type Surface } from './world'

/** Hooks that write down every call, place movers by the functions given, and ask steps by the list given. */
export interface Recorder extends Hooks {
  calls: string[]
  places: Map<HandleId, (t: number) => MoverPose>
  dones: (() => boolean)[]
  frames: (() => void)[]
}

export function recorder(): Recorder {
  const r: Recorder = {
    calls: [],
    places: new Map(),
    dones: [],
    frames: [],
    button: (seat, button, act) => r.calls.push(`button ${seat} ${button} ${act}`),
    tap: (on, at) => r.calls.push(`tap ${on} ${at[0].toFixed(2)} ${at[1].toFixed(2)}`),
    place: (mover, t) => {
      const f = r.places.get(mover)
      if (f === undefined) throw new Error(`no place for mover ${mover}`)
      return f(t)
    },
    touch: (touched, who) => r.calls.push(`touch ${touched} ${who}`),
    land: (touched, who) => r.calls.push(`land ${touched} ${who}`),
    use: (used, seat) => r.calls.push(`use ${used} ${seat}`),
    zone: (zone, act, who) => r.calls.push(`${act} ${zone} ${who}`),
    timers: () => {},
    frame: () => {
      for (const f of r.frames) f()
    },
    done: (i) => r.dones[i](),
  }
  return r
}

/** A party of this size in seat order, each seat in its colour (engine/party.ts). */
export const partyOf = plainParty

/**
 * A sim from the side for a party of this size with recording hooks, still building, in the room's
 * one box (world.ts ROOM_BOUNDS: x -8 to 8, y 0 to 8). It has no house round it: the sim's own tests
 * build their floors themselves, with plain values.
 */
export function testSim(party: 1 | 2 | 3 | 4, kind: RoomKind, level: Level): { sim: Sim; rec: Recorder } {
  const rec = recorder()
  const sim = createSim({ seed: 7, level, kind, view: 'side', shell: HOUSE_SHELL, party: partyOf(party) }, rec)
  return { sim, rec }
}

export const PLAIN: Surface = { color: '#888888', ice: false, bounce: 0, belt: [0, 0, 0], through: false }

/** A solid box from x0 to x1 and y0 to y1. */
export function slab(sim: Sim, x0: number, y0: number, x1: number, y1: number, surface: Partial<Surface>, listens: Listens): HandleId {
  return solid(sim, [(x0 + x1) / 2, (y0 + y1) / 2, 0], { kind: 'box', size: [x1 - x0, y1 - y0, 2] }, surface, 0, listens)
}

export function solid(sim: Sim, at: Vec3, shape: SolidShape, surface: Partial<Surface>, turn: number, listens: Listens): HandleId {
  return addSolid(sim, { at, shape, plain: false, house: false, surface: { ...PLAIN, ...surface }, model: null, turn, mover: null, name: null, hidden: false }, listens)
}

/** A model that is only a box w by h by d standing on its origin. */
export function boxModel(sim: Sim, w: number, h: number): ModelId {
  const recipe: Recipe = {
    shapes: [],
    parts: [],
    anchors: {},
    meta: { carry: 'hand', ride: false, sit: false, wear: null, bouncy: 0, solid: true },
    traits: { food: null, temp: null, soft: false },
    bounds: { min: [-w / 2, 0, -w / 2], max: [w / 2, h, w / 2] },
  }
  return addModel(sim, recipe)
}

export function crate(sim: Sim, at: Vec3, w: number, h: number, weight: number, listens: Listens): HandleId {
  return addThing(sim, { at, model: boxModel(sim, w, h), scale: 1, round: false, weight, name: null, hidden: false }, listens)
}

/** A floor whose top is at y = 0 all along the room (x -8 to 8), players standing on it at the given xs. */
export function onFloor(sim: Sim, xs: readonly number[]): HandleId {
  const id = slab(sim, -8, -1, 8, 0, {}, NO_LISTENS)
  xs.forEach((x, i) => putPlayer(sim, i as SeatIndex, [x, 0, 0]))
  return id
}

/** What a seat holds in one frame: the stick, and whether each button is down. */
export interface Hold {
  stick: readonly [number, number]
  a: boolean
  b: boolean
}

export const IDLE: Hold = { stick: [0, 0], a: false, b: false }

/** Plays frames: each frame `holds(frame)` says what every seat holds, and the presses are worked out from the frame before. */
export function play(sim: Sim, frames: number, holds: (frame: number) => readonly Hold[]): void {
  playFrames(sim.world.players.length, frames, holds, () => NO_POINTING, (input) => step(sim, input))
}

/** Frames of what each seat holds and what is pointed at, turned into FrameInput (presses worked out from the frame before) and given to `stepFn`. */
export function playFrames(seats: number, frames: number, holds: (frame: number) => readonly Hold[], pointing: (frame: number) => Pointing, stepFn: (input: FrameInput) => void): void {
  const before: Hold[] = Array.from({ length: seats }, () => IDLE)
  for (let f = 0; f < frames; f++) stepFn({ pads: padsOf(holds(f), before), pointing: pointing(f), help: false })
}

/** What each seat holds this frame as its Pad, a button pressed when held now and not in `before`; `before` becomes `now`. */
export function padsOf(now: readonly Hold[], before: Hold[]): Pad[] {
  const pads = now.map((h, i) => ({ stick: h.stick, a: { held: h.a, pressed: h.a && !before[i].a }, b: { held: h.b, pressed: h.b && !before[i].b } }))
  now.forEach((h, i) => (before[i] = h))
  return pads
}

/** A pad for one frame by hand, presses given as they are. */
export function frameOf(pads: readonly Pad[]): FrameInput {
  return { pads, pointing: NO_POINTING, help: false }
}

/** A box solid built in a mover, from the mover's origin. */
export function moverBox(sim: Sim, mover: HandleId, at: Vec3, size: Vec3, surface: Partial<Surface>, listens: Listens): HandleId {
  return addSolid(sim, { at, shape: { kind: 'box', size }, plain: false, house: false, surface: { ...PLAIN, ...surface }, model: null, turn: 0, mover, name: null, hidden: false }, listens)
}

/** A mover placed by `place`, with one box in it; placed at clock 0. */
export function platform(sim: Sim, rec: Recorder, place: (t: number) => MoverPose, size: Vec3, surface: Partial<Surface>, listens: Listens): { mover: HandleId; solid: HandleId } {
  const mover = addMover(sim, { name: null, hidden: false }, NO_LISTENS)
  rec.places.set(mover, place)
  const solidId = moverBox(sim, mover, [0, 0, 0], size, surface, listens)
  placeMover(sim, mover)
  return { mover, solid: solidId }
}

const LISTEN_ALL: Listens = { tap: true, touch: true, land: true, use: false, enter: true, stay: true, leave: true }

/**
 * A busy room for a party of four in the room's 16 by 8 m: floors with a gap between them, walls at
 * both ends, steps, ramps, a ball, a turned box, through-floors, ice, a bounce and a belt; three
 * movers (sliding, rising, turning); a dozen loose things, one round and two heavy; zones of wind, no
 * gravity, pull and drag; handlers listening everywhere; and a step that is never done. For tests
 * that play it for minutes, and for timing the sim.
 */
export function busyRoom(): { sim: Sim; rec: Recorder } {
  const { sim, rec } = testSim(4, 'together', 2)
  slab(sim, -8, -1, -1, 0, {}, LISTEN_ALL)
  slab(sim, 0.5, -1, 8, 0, {}, NO_LISTENS)
  slab(sim, -8, 0, -7.5, 6, {}, NO_LISTENS)
  slab(sim, 7.5, 0, 8, 6, {}, NO_LISTENS)
  slab(sim, -6, 0, -5, 0.3, {}, NO_LISTENS)
  slab(sim, -5, 0, -4, 0.6, { ice: true }, NO_LISTENS)
  solid(sim, [-3, 0.75, 0], { kind: 'ramp', size: [1.5, 1.5, 2], rises: 'left' }, {}, 0, NO_LISTENS)
  slab(sim, 1, 0, 2.5, 0.2, { belt: [1.5, 0, 0] }, NO_LISTENS)
  slab(sim, 3, 0, 3.5, 0.3, { bounce: 2.5 }, LISTEN_ALL)
  solid(sim, [4.5, 1, 0], { kind: 'ball', radius: 1 }, {}, 0, NO_LISTENS)
  solid(sim, [6.4, 0.6, 0], { kind: 'box', size: [1.4, 0.4, 2] }, {}, 0.4, NO_LISTENS)
  slab(sim, -4, 3, -1.5, 3.2, { through: true }, NO_LISTENS)
  slab(sim, 1.5, 3.5, 4, 3.7, { through: true }, NO_LISTENS)
  slab(sim, -2, 6, 2, 6.4, {}, NO_LISTENS)
  platform(sim, rec, (t) => ({ at: [-0.25 + 1.5 * sin(t * 0.7), 1.5, 0], turn: 0 }), [2, 0.3, 2], {}, LISTEN_ALL)
  platform(sim, rec, (t) => ({ at: [6, 2 + 1.5 * sin(t), 0], turn: 0 }), [1.6, 0.3, 2], {}, NO_LISTENS)
  platform(sim, rec, (t) => ({ at: [0, 4.5, 0], turn: t * 0.5 }), [3, 0.3, 2], {}, NO_LISTENS)
  for (let i = 0; i < 12; i++) {
    const heavy = i === 3 || i === 8
    const id = crate(sim, [-6.5 + i * 1.15, 1 + (i % 3), 0], heavy ? 0.9 : 0.5, heavy ? 0.9 : 0.5, heavy ? 1.5 : 0.3, i % 4 === 0 ? LISTEN_ALL : NO_LISTENS)
    if (i === 5) sim.world.things[sim.where[id].i].round = true
  }
  const zone = (at: Vec3, size: Vec3, wind: Vec3, pull: number, gravity: number, drag: number) =>
    addZone(sim, { at, size, color: null, wind, pull, gravity, drag, mover: null, name: null, hidden: false }, LISTEN_ALL)
  zone([-6, 2, 0], [1.5, 4, 2], [6, 0, 0], 0, 1, 0)
  zone([0, 7, 0], [3, 2, 2], [0, 0, 0], 0, 0, 0)
  zone([4.5, 5, 0], [2, 3, 2], [0, 0, 0], 8, 1, 0)
  zone([2, 1.5, 0], [1.5, 3, 2], [0, 0, 0], 0, 1, 0.6)
  ;[-5.5, -2, 1.5, 7].forEach((x, i) => putPlayer(sim, i as SeatIndex, [x, x === -5.5 ? 0.3 : x === 1.5 ? 0.2 : 0, 0]))
  rec.dones.push(() => false)
  setSteps(sim, [{ hint: { en: 'try', fi: 'kokeile' }, at: [0, 1, 0] }])
  finishBuild(sim)
  return { sim, rec }
}

/** Random holds for a party from a seeded stream: each seat changes what it holds every so often, as a child pressing at random. */
export function randomHolds(seed: number, seats: number): (frame: number) => Hold[] {
  let state = streamState(seed)
  const draw = () => {
    const [v, s] = nextThrow(state)
    state = s
    return v
  }
  const now: Hold[] = Array.from({ length: seats }, () => IDLE)
  return () => {
    for (let i = 0; i < seats; i++) {
      if (draw() < 0.1) {
        const sx = Math.floor(draw() * 3) - 1
        const sy = draw() < 0.2 ? Math.floor(draw() * 3) - 1 : 0
        now[i] = { stick: [sx, sy], a: draw() < 0.4, b: draw() < 0.2 }
      }
    }
    return now.map((h) => ({ ...h }))
  }
}

// ------------------------------------------------------------------------------ rooms with made code

/** How a test room starts: a party of this size, from the side, in the house's own shell. */
export function roomStart(party: 1 | 2 | 3 | 4, kind: RoomKind, level: Level, seed: number): RoomStart {
  return { seed, level, kind, view: 'side', shell: HOUSE_SHELL, party: partyOf(party) }
}

/** A room built from its code on a runtime of its own. */
export function testRoom(code: RoomCode, start: RoomStart): Room {
  return buildRoom(code, start, new RoomRuntime())
}

/** The sentence a build fails with; a test fails when it builds. */
export function buildSentence(code: RoomCode, start: RoomStart): string {
  try {
    buildRoom(code, start, new RoomRuntime())
  } catch (err) {
    if (err instanceof RoomBuildError) return err.sentence
    throw err
  }
  throw new Error('the room built')
}

/** Plays a room's frames, each seat holding what `holds` says and pointing as `pointing` says. */
export function playRoom(room: Room, frames: number, holds: (frame: number) => readonly Hold[], pointing: (frame: number) => Pointing): void {
  playFrames(room.world.players.length, frames, holds, pointing, (input) => stepRoom(room, input))
}

/** Every seat holding nothing. */
export function idle(room: Room): () => Hold[] {
  return () => room.world.players.map(() => IDLE)
}

/** A step that is never done. */
export const NEVER: readonly StepSpec[] = [{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }]

/** The least a room needs: everyone standing on the house's floor 1.5 m apart from x -4, the way out at x 6, and these steps. */
export function plainRoom(r: Builder, w: World, steps: readonly StepSpec[]): void {
  w.players().forEach((p, i) => p.putAt([-4 + 1.5 * i, 0, 0]))
  r.wayOut([6, 0, 0])
  r.steps(steps)
}

/** The house's floor of a room built (engine/sim.ts HOUSE: the first of the house's own solids). */
export function houseFloor(world: { readonly solids: readonly WorldSolid[] }): WorldSolid {
  const floor = world.solids.find((s) => s.house)
  if (floor === undefined) throw new Error('the room has no house round it')
  return floor
}

/** A model of one box w by h by d standing on its origin. */
export function cube(w: number, h: number, d: number): Model {
  return (m) => m.box(w, h, d, { at: [0, h / 2, 0] })
}

export { finishBuild }
