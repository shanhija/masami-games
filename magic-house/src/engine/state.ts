/**
 * Magic House: the sim as a whole (the World and what lives beside it), its hooks into made code,
 * and the lookups and collision questions every phase of a frame shares. The main module is
 * engine/sim.ts, whose header says how to use all of it.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import type { SeatIndex } from '../seats/types'
import { FEEL } from './api'
import { emptyOutline, overlaps, setFootprint, setOutline, topOver, type FloorForm, type Form, type Outline } from './geometry'
import { cos, sin } from './math'
import type { HandleId, Mover, Player, Solid, Thing, World } from './world'

/** One frame, seconds: the sim's fixed step. */
export const DT = 1 / 60

/** What kind of handle an id is, and its index in its kind's list in the World. */
export type BodyKind = 'player' | 'solid' | 'mover' | 'thing' | 'decor' | 'zone' | 'lamp' | 'sign'
export interface Where {
  kind: BodyKind
  i: number
}

/** Which of made code's handlers a handle has, so the sim calls a hook only where something listens (and knows a thing with use is used, never carried). */
export interface Listens {
  tap: boolean
  touch: boolean
  land: boolean
  use: boolean
  enter: boolean
  stay: boolean
  leave: boolean
}

export const NO_LISTENS: Listens = Object.freeze({ tap: false, touch: false, land: false, use: false, enter: false, stay: false, leave: false })

/** Where a mover's origin is at a time of its clock, as its place gives it. */
export interface MoverPose {
  at: Vec3
  turn: number
}

/**
 * The only way the sim reaches made code (FRAME_ORDER in engine/api.ts says when each is called).
 * The builder (step 2's next agent) keeps the closures by handle id and implements these; the sim
 * never sees a closure. A hook that throws is the builder's to catch: the sim carries on.
 */
export interface Hooks {
  /** buttons: a room's own button job (Player.a or .b is { word, icon }), in seat order, a before b; press, then hold while held, then release. */
  button(seat: SeatIndex, button: 'a' | 'b', act: 'press' | 'hold' | 'release'): void
  /** taps: a tap on a handle with a tap of its own, or null for r.tap; at is on z = 0 from the side, and from high up on what was tapped. */
  tap(on: HandleId | null, at: Vec3): void
  /** movers: where the mover's origin is at t, its own clock (the builder makes Math.random throw in here and counts placeTurns). */
  place(mover: HandleId, t: number): MoverPose
  /** contacts: a player or a thing (who) began to touch a solid, a mover or a thing. */
  touch(touched: HandleId, who: HandleId): void
  /** contacts: who came onto the top of a solid, a mover (any of its solids) or a thing. */
  land(touched: HandleId, who: HandleId): void
  /** players: a player pressed grab within reach of a solid, a mover or a thing that has use. */
  use(used: HandleId, seat: SeatIndex): void
  /** zones: who came in, is in (every frame, after enter), or went out (or was hidden). */
  zone(zone: HandleId, act: 'enter' | 'stay' | 'leave', who: HandleId): void
  /** timers: run the w.after callbacks that are due at World.t, in the order they were set. */
  timers(): void
  /** frame: the room's frame function, if it gave one. */
  frame(): void
  /** steps: the step at this index (World.next) is asked whether it is done. */
  done(step: number): boolean
}

/**
 * The sim: the World, which is the engine's whole state and what the scene reads, and beside it what
 * cannot or need not be in it: the hooks into made code, what each handle listens for, an index from
 * id to list, and each solid's outline this frame (worked out again from the World by `attach`).
 */
export interface Sim {
  world: World
  hooks: Hooks
  /** By handle id. */
  listens: Listens[]
  where: Where[]
  /** By solid index: its shape in the room now (from high up, its footprint on the floor with its heights: engine/geometry.ts), and its turn in the room (from high up, round y). Both are worked out from the World, so a clone of it plays on the same. */
  outlines: Outline[]
  turns: number[]
  /** True while the room's code first runs (createSim to finishBuild): builder calls work, and the world's acts (puff, sound, shake, pop) wait. */
  building: boolean
}

// ------------------------------------------------------------------------------ lookups

export function whereOf(sim: Sim, id: HandleId): Where {
  const w = sim.where[id]
  if (w === undefined) throw new Error(`no handle with id ${id}`)
  return w
}

export function solidById(sim: Sim, id: HandleId): Solid {
  const w = whereOf(sim, id)
  if (w.kind !== 'solid') throw new Error(`handle ${id} is a ${w.kind}, not a solid`)
  return sim.world.solids[w.i]
}

export function moverById(sim: Sim, id: HandleId): Mover {
  const w = whereOf(sim, id)
  if (w.kind !== 'mover') throw new Error(`handle ${id} is a ${w.kind}, not a mover`)
  return sim.world.movers[w.i]
}

export function thingById(sim: Sim, id: HandleId): Thing {
  const w = whereOf(sim, id)
  if (w.kind !== 'thing') throw new Error(`handle ${id} is a ${w.kind}, not a thing`)
  return sim.world.things[w.i]
}

/** A handle built in a mover is out of play while its mover is hidden. */
export function moverHidden(sim: Sim, mover: HandleId | null): boolean {
  return mover !== null && moverById(sim, mover).hidden
}

/** A solid that touches: shown, and its mover shown. */
export function solidActive(sim: Sim, s: Solid): boolean {
  return !s.hidden && !moverHidden(sim, s.mover)
}

/** A thing that touches: shown, not carried and not on an engine slide. */
export function thingLoose(t: Thing): boolean {
  return !t.hidden && t.heldBy === null && t.slide === null
}

/** A body the movers push and the referee keeps in the room: a player, or a loose thing. */
export type Body = { kind: 'player'; p: Player } | { kind: 'thing'; t: Thing }

/** Every body now: the players, then the loose things. */
export function bodies(sim: Sim): Body[] {
  const out: Body[] = sim.world.players.map((p) => ({ kind: 'player' as const, p }))
  for (const t of sim.world.things) if (thingLoose(t)) out.push({ kind: 'thing', t })
  return out
}

/** A point given from a mover's origin, in the room, by the mover as it is now. */
export function fromMover(m: Mover, at: Vec3): Vec3 {
  if (m.turn === 0) return [m.at[0] + at[0], m.at[1] + at[1], at[2]]
  const c = cos(m.turn)
  const s = sin(m.turn)
  return [m.at[0] + c * at[0] - s * at[1], m.at[1] + s * at[0] + c * at[1], at[2]]
}

/** From high up: a point given from a mover's origin, in the room, its turn round y (counterclockwise seen from above: +x turns toward -z). */
export function fromMoverFloor(m: Mover, at: Vec3): Vec3 {
  if (m.turn === 0) return [m.at[0] + at[0], m.at[1] + at[1], m.at[2] + at[2]]
  const c = cos(m.turn)
  const s = sin(m.turn)
  return [m.at[0] + c * at[0] + s * at[2], m.at[1] + at[1], m.at[2] - s * at[0] + c * at[2]]
}

/** Where a handle built with a place of its own is in the room: its own `at`, or carried by its mover. */
export function roomPoint(sim: Sim, at: Vec3, mover: HandleId | null): Vec3 {
  if (mover === null) return at
  return sim.world.view === 'high' ? fromMoverFloor(moverById(sim, mover), at) : fromMover(moverById(sim, mover), at)
}

/** A solid's middle in the room now, by its index: from the side on z = 0, from high up the middle of its footprint at its middle height. */
export function solidMiddle(sim: Sim, i: number): Vec3 {
  const o = sim.outlines[i]
  return sim.world.view === 'high' ? [o.cx, o.ym, o.cy] : [o.cx, o.cy, 0]
}

// ------------------------------------------------------------------------------ boxes

/** A player's box: x0, y0, x1, y1 (feet at the bottom middle). */
export function playerWidth(p: Player): number {
  return FEEL.width * p.size
}
export function playerHeight(p: Player): number {
  return FEEL.height * p.size
}

/** A box, reused to save allocations. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function playerBox(p: Player, out: Box): Box {
  const hw = playerWidth(p) / 2
  out.x0 = p.at[0] - hw
  out.x1 = p.at[0] + hw
  out.y0 = p.at[1]
  out.y1 = p.at[1] + playerHeight(p)
  return out
}

export function thingBox(t: Thing, out: Box): Box {
  out.x0 = t.at[0] + t.box.min[0]
  out.x1 = t.at[0] + t.box.max[0]
  out.y0 = t.at[1] + t.box.min[1]
  out.y1 = t.at[1] + t.box.max[1]
  return out
}

export function boxesOverlap(a: Box, x0: number, y0: number, x1: number, y1: number): boolean {
  return a.x0 < x1 - 1e-4 && a.x1 > x0 + 1e-4 && a.y0 < y1 - 1e-4 && a.y1 > y0 + 1e-4
}

// ------------------------------------------------------------------------------ outlines

/** The form of a solid's shape, for its outline. */
export function formOf(s: Solid): Form {
  const sh = s.shape
  if (sh.kind === 'ball') return { kind: 'ball', r: sh.radius }
  if (sh.kind === 'box') return { kind: 'box', hw: sh.size[0] / 2, hh: sh.size[1] / 2 }
  return { kind: 'ramp', hw: sh.size[0] / 2, hh: sh.size[1] / 2, right: sh.rises === 'right' }
}

/** The form of a solid's shape from high up, for its footprint. */
export function floorFormOf(s: Solid): FloorForm {
  const sh = s.shape
  if (sh.kind === 'ball') return { kind: 'ball', r: sh.radius }
  if (sh.kind === 'box') return { kind: 'box', hw: sh.size[0] / 2, hh: sh.size[1] / 2, hd: sh.size[2] / 2 }
  return { kind: 'ramp', hw: sh.size[0] / 2, hh: sh.size[1] / 2, hd: sh.size[2] / 2, rises: sh.rises }
}

/** Works out solid i's outline from the World as it is now: its own place and turn, carried by its mover. From high up it is the footprint on the floor. */
export function refreshOutline(sim: Sim, i: number): void {
  const s = sim.world.solids[i]
  while (sim.outlines.length <= i) {
    sim.outlines.push(emptyOutline())
    sim.turns.push(0)
  }
  if (sim.world.view === 'high') {
    let turn = s.turn
    let at = s.at
    if (s.mover !== null) {
      const m = moverById(sim, s.mover)
      at = fromMoverFloor(m, s.at)
      turn += m.turn
    }
    setFootprint(sim.outlines[i], floorFormOf(s), at[0], at[1], at[2], turn)
    sim.turns[i] = turn
    return
  }
  let x = s.at[0]
  let y = s.at[1]
  let turn = s.turn
  if (s.mover !== null) {
    const m = moverById(sim, s.mover)
    const p = fromMover(m, s.at)
    x = p[0]
    y = p[1]
    turn += m.turn
  }
  setOutline(sim.outlines[i], formOf(s), x, y, turn)
  sim.turns[i] = turn
}

// ------------------------------------------------------------------------------ what is near, under and in the way

/** The solids whose outlines come near a region, by index; filled into a shared list the caller reads at once. */
export const near: number[] = []
export function gatherNear(sim: Sim, x0: number, y0: number, x1: number, y1: number): number[] {
  near.length = 0
  const { solids } = sim.world
  for (let i = 0; i < solids.length; i++) {
    const o = sim.outlines[i]
    if (o.maxX < x0 || o.minX > x1 || o.maxY < y0 || o.minY > y1) continue
    if (!solidActive(sim, solids[i])) continue
    near.push(i)
  }
  return near
}

/** What a body stands on, or would land on. */
export interface Ground {
  id: HandleId
  y: number
  /** dy/dx of its top there. */
  slope: number
  /** The solid's index, or -1 for a thing or a player's head. */
  solid: number
}

const top = { y: 0, slope: 0 }

/**
 * The highest floor over [a, b] whose top is between `low` and `high`, among the given near solids
 * (a through-floor only where `through` allows), loose things (all but `self` and things resting on
 * it, up to `thingHigh`) and, when `heads`, the heads of the players (all but seat `selfSeat`).
 * Fills `out` and gives true when there is one.
 */
export function groundUnder(
  sim: Sim,
  solids: readonly number[],
  a: number,
  b: number,
  low: number,
  high: number,
  through: boolean,
  thingHigh: number,
  self: HandleId,
  heads: boolean,
  selfSeat: number,
  out: Ground,
): boolean {
  const w = sim.world
  let found = false
  for (const i of solids) {
    const s = w.solids[i]
    if (s.surface.through && !through) continue
    if (!topOver(sim.outlines[i], a, b, top)) continue
    if (top.y < low || top.y > high) continue
    if (!found || top.y > out.y + 1e-9 || (Math.abs(top.y - out.y) <= 1e-9 && Math.abs(top.slope) < Math.abs(out.slope))) {
      out.id = s.id
      out.y = top.y
      out.slope = top.slope
      out.solid = i
      found = true
    }
  }
  for (const t of w.things) {
    if (t.id === self || !thingLoose(t) || t.on === self) continue
    const tx0 = t.at[0] + t.box.min[0]
    const tx1 = t.at[0] + t.box.max[0]
    if (tx1 <= a + 1e-4 || tx0 >= b - 1e-4) continue
    let ty = t.at[1] + t.box.max[1]
    let slope = 0
    if (t.round) {
      // A round thing's top is the ball in its box.
      const cx = (tx0 + tx1) / 2
      const r = ((tx1 - tx0) + (t.box.max[1] - t.box.min[1])) / 4
      const cy = t.at[1] + (t.box.min[1] + t.box.max[1]) / 2
      const x = cx < a ? a : cx > b ? b : cx
      const dx = x - cx
      if (Math.abs(dx) >= r) continue
      const h = Math.sqrt(r * r - dx * dx)
      ty = cy + h
      slope = -dx / h
    }
    if (ty < low || ty > Math.min(high, thingHigh)) continue
    if (!found || ty > out.y + 1e-9) {
      out.id = t.id
      out.y = ty
      out.slope = slope
      out.solid = -1
      found = true
    }
  }
  if (heads) {
    for (const p of w.players) {
      if (p.seat === selfSeat) continue
      const hw = playerWidth(p) / 2
      if (p.at[0] + hw <= a + 1e-4 || p.at[0] - hw >= b - 1e-4) continue
      const hy = p.at[1] + playerHeight(p)
      if (hy < low || hy > high) continue
      if (!found || hy > out.y + 1e-9) {
        out.id = p.id
        out.y = hy
        out.slope = 0
        out.solid = -1
        found = true
      }
    }
  }
  return found
}

/** Whether any of the near solids but through-floors and those in `ignore` overlaps the box. */
export function solidInBox(sim: Sim, solids: readonly number[], ignore: readonly number[], x0: number, y0: number, x1: number, y1: number): boolean {
  for (const i of solids) {
    if (sim.world.solids[i].surface.through || ignore.includes(i)) continue
    if (overlaps(sim.outlines[i], x0, y0, x1, y1)) return true
  }
  return false
}

/** The near solids, but through-floors, that overlap the box now: a body already inside one walks out of it, never stuck (it slips through what squeezed it). */
export function solidsInside(sim: Sim, solids: readonly number[], x0: number, y0: number, x1: number, y1: number, out: number[]): number[] {
  out.length = 0
  for (const i of solids) {
    if (sim.world.solids[i].surface.through) continue
    if (overlaps(sim.outlines[i], x0, y0, x1, y1)) out.push(i)
  }
  return out
}

/** What zones do to a body in the box this frame: wind and pull (m/s², wind already shared out by weight), how hard the world pulls (1 as everywhere), and the most drag. */
export interface Forces {
  ax: number
  ay: number
  gravity: number
  drag: number
}

/**
 * The zones' pulls on a body in the box of this weight. Wind and pull add up; where zones that
 * change gravity overlap, the one built last wins; drag is the most of them. Hidden zones and zones
 * in hidden movers pull nothing.
 */
export function zoneForces(sim: Sim, b: Box, weight: number, out: Forces): Forces {
  out.ax = 0
  out.ay = 0
  out.gravity = 1
  out.drag = 0
  for (const z of sim.world.zones) {
    if (z.hidden || (z.wind[0] === 0 && z.wind[1] === 0 && z.pull === 0 && z.gravity === 1 && z.drag === 0)) continue
    if (moverHidden(sim, z.mover)) continue
    const c = roomPoint(sim, z.at, z.mover)
    const hx = z.size[0] / 2
    const hy = z.size[1] / 2
    if (!boxesOverlap(b, c[0] - hx, c[1] - hy, c[0] + hx, c[1] + hy)) continue
    const share = 1 / Math.max(weight, 0.25)
    out.ax += z.wind[0] * share
    out.ay += z.wind[1] * share
    if (z.pull !== 0) {
      const dx = c[0] - (b.x0 + b.x1) / 2
      const dy = c[1] - (b.y0 + b.y1) / 2
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0.05) {
        out.ax += (z.pull * dx) / len
        out.ay += (z.pull * dy) / len
      }
    }
    if (z.gravity !== 1) out.gravity = z.gravity
    if (z.drag > out.drag) out.drag = Math.min(1, z.drag)
  }
  return out
}

/** Moves v toward target by at most step. */
export function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step)
}

/** The engine's ease, in and out, of u from 0 to 1: plain sums, so every engine agrees. */
export function smooth(u: number): number {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u
  return k * k * (3 - 2 * k)
}

/** A value on an Ease at time t. */
export function easeNumber(e: { from: number; to: number; start: number; secs: number }, t: number): number {
  if (e.secs <= 0 || t >= e.start + e.secs) return e.to
  return e.from + (e.to - e.from) * smooth((t - e.start) / e.secs)
}
export function easeVec(e: { from: Vec3; to: Vec3; start: number; secs: number }, t: number): Vec3 {
  if (e.secs <= 0 || t >= e.start + e.secs) return [e.to[0], e.to[1], e.to[2]]
  const k = smooth((t - e.start) / e.secs)
  return [e.from[0] + (e.to[0] - e.from[0]) * k, e.from[1] + (e.to[1] - e.from[1]) * k, e.from[2] + (e.to[2] - e.from[2]) * k]
}
