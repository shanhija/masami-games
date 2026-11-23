/**
 * Magic House: the pieces of a frame the view from high up (step 6) does its own way, which
 * engine/sim.ts calls in their places in FRAME_ORDER when World.view is 'high'. The floor is x and
 * z, y is up, and a solid is its footprint with its heights (engine/geometry.ts). What does not
 * depend on the view stays in sim.ts, shared: the order of a frame, the buttons and the hooks, the
 * steps, the referee's rules, the helper and the end. None of these calls back into sim.ts.
 *
 * - carryOverHeadFloor, putDownAtFloor, grabChoiceFloor: carrying, from high up (a carried thing on
 *   the head; put down ahead the way the player faces, Player.heading).
 * - riderFrameFloor, riderAtFloor: a rider kept in the frame of the solid it stands on as the solid
 *   moves and turns round y (the bots' search carries its copy of a bot the same way).
 * - pushBodiesFloor, pushPlayerOutFloor, besideIfInsideFloor: a solid that moved into a body pushes
 *   it out the shortest way (up onto it, down, or across), and a body inside a solid shown is put
 *   beside it.
 * - separatePlayersFloor, touchPairsFloor, zoneMembersFloor, tapTargetFloor, settleFloor: the same
 *   jobs as the side's, in three dimensions.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { FEEL, SIZES } from './api'
import { emptyOutline, overlaps, pushOut, sliceAt, topOverFoot, type FloorTop } from './geometry'
import { cos, sin } from './math'
import {
  boxes3Overlap,
  emptyBox3,
  gap3,
  groundUnderFloor,
  gatherFloor,
  playerBox3,
  playerFitsFloor,
  solidInBox3,
  thingBox3,
  thingFitsFloor,
  zoneHas,
  type Box3,
  type FloorGround,
} from './floorState'
import { bodies, moverHidden, playerHeight, playerWidth, roomPoint, solidActive, thingById, thingLoose, type Body, type Sim } from './state'
import type { HandleId, Player, Thing, Zone } from './world'

// ------------------------------------------------------------------------------ carrying

/** A carried thing sits on its carrier's head, its middle over their feet. */
export function carryOverHeadFloor(sim: Sim, p: Player): void {
  const th = thingById(sim, p.holding as HandleId)
  th.at = [p.at[0] - (th.box.min[0] + th.box.max[0]) / 2, p.at[1] + playerHeight(p) + 0.02 - th.box.min[1], p.at[2] - (th.box.min[2] + th.box.max[2]) / 2]
  th.velocity = [p.velocity[0], p.velocity[1], p.velocity[2]]
}

/**
 * Where putting down the thing `th` that player p carries sets its foot, from high up: just ahead of
 * them the way they face (Player.heading), behind them if that is in a wall, else where it is (it
 * drops from their head). The bots' search asks it too.
 */
export function putDownAtFloor(sim: Sim, p: Player, th: Thing): Vec3 {
  const hx = p.heading[0]
  const hz = p.heading[2]
  const halfX = (th.box.max[0] - th.box.min[0]) / 2
  const halfZ = (th.box.max[2] - th.box.min[2]) / 2
  const midX = (th.box.min[0] + th.box.max[0]) / 2
  const midZ = (th.box.min[2] + th.box.max[2]) / 2
  // Far enough that its box clears the player's the way they face.
  const away = playerWidth(p) / 2 + 0.05 + Math.abs(hx) * halfX + Math.abs(hz) * halfZ
  const y = p.at[1] - th.box.min[1] + 0.01
  for (const dir of [1, -1]) {
    const x = p.at[0] + dir * hx * away - midX
    const z = p.at[2] + dir * hz * away - midZ
    if (thingFitsFloor(sim, th, x, y, z)) return [x, y, z]
  }
  return [th.at[0], th.at[1], th.at[2]]
}

const reachBox: Box3 = emptyBox3()
const otherBox: Box3 = emptyBox3()

/**
 * What a press of grab would act on now, from high up: the nearest handle within FEEL.reach of the
 * player's box that has use (with full hands too), else, with empty hands, the nearest thing light
 * enough to pick up; null for none. A solid is measured by the box round it.
 */
export function grabChoiceFloor(sim: Sim, p: Player): HandleId | null {
  const w = sim.world
  const full = p.holding !== null
  playerBox3(p, reachBox)
  let best: HandleId | null = null
  let bestGap = Infinity
  const consider = (id: HandleId, b: Box3) => {
    const d = gap3(reachBox, b)
    if (d <= FEEL.reach && d < bestGap - 1e-9) {
      best = id
      bestGap = d
    }
  }
  for (const th of w.things) {
    if (th.hidden || th.heldBy !== null || th.slide !== null) continue
    if (!sim.listens[th.id].use && (full || th.weight > FEEL.carryMax)) continue
    consider(th.id, thingBox3(th, otherBox))
  }
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s)) return
    const o = sim.outlines[i]
    const b = { x0: o.minX, y0: o.y0, z0: o.minY, x1: o.maxX, y1: o.y1, z1: o.maxY }
    if (sim.listens[s.id].use) consider(s.id, b)
    if (s.mover !== null && sim.listens[s.mover].use) consider(s.mover, b)
  })
  return best
}

// ------------------------------------------------------------------------------ riding

/** A rider's feet in the frame of the solid it stands on, from the solid's middle x, y, z and its turn round y before it moves: [along its own x, up, along its own z]. */
export function riderFrameFloor(at: Vec3, x: number, y: number, z: number, turn: number): Vec3 {
  const c = cos(turn)
  const s = sin(turn)
  const dx = at[0] - x
  const dz = at[2] - z
  return [c * dx - s * dz, at[1] - y, s * dx + c * dz]
}

/** Where a rider's feet are in the room, from riderFrameFloor's point and the solid's middle and turn now. */
export function riderAtFloor(l: Vec3, x: number, y: number, z: number, turn: number): Vec3 {
  const c = cos(turn)
  const s = sin(turn)
  return [x + c * l[0] + s * l[2], y + l[1], z - s * l[0] + c * l[2]]
}

// ------------------------------------------------------------------------------ pushing out, squeezing

const box: Box3 = emptyBox3()
const slice = emptyOutline()
const top: FloorTop = { y: 0, gx: 0, gz: 0 }

function bodyBox3(b: Body, out: Box3): Box3 {
  return b.kind === 'player' ? playerBox3(b.p, out) : thingBox3(b.t, out)
}

function moveBody3(b: Body, dx: number, dy: number, dz: number): void {
  const at = b.kind === 'player' ? b.p.at : b.t.at
  const moved: Vec3 = [at[0] + dx, at[1] + dy, at[2] + dz]
  if (b.kind === 'player') b.p.at = moved
  else b.t.at = moved
}

function standOn(b: Body, on: HandleId | null): void {
  if (b.kind === 'player') b.p.on = on
  else b.t.on = on
}

/** Whether the body's box, moved by dx, dy, dz, is clear of every active solid but through-floors. */
function clearAt3(sim: Sim, b: Body, dx: number, dy: number, dz: number): boolean {
  bodyBox3(b, box)
  const x0 = box.x0 + dx
  const x1 = box.x1 + dx
  const y0 = box.y0 + dy
  const y1 = box.y1 + dy
  const z0 = box.z0 + dz
  const z1 = box.z1 + dz
  for (const i of gatherFloor(sim, x0 - 0.1, y0 - 0.1, z0 - 0.1, x1 + 0.1, y1 + 0.1, z1 + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (solidInBox3(sim, i, x0, y0 + 0.01, z0, x1, y1, z1)) return false
  }
  return true
}

/** A body inside solid i is put beside it: the nearest free spot of its four sides on the floor, its top and its bottom; where none is free it stays, and walks out of it. */
export function besideIfInsideFloor(sim: Sim, b: Body, i: number): void {
  bodyBox3(b, box)
  if (!solidInBox3(sim, i, box.x0, box.y0 + 0.01, box.z0, box.x1, box.y1, box.z1)) return
  const o = sim.outlines[i]
  const moves: Vec3[] = [
    [o.minX - box.x1 - 0.01, 0, 0],
    [o.maxX - box.x0 + 0.01, 0, 0],
    [0, 0, o.minY - box.z1 - 0.01],
    [0, 0, o.maxY - box.z0 + 0.01],
    [0, o.y1 - box.y0, 0],
    [0, o.y0 - box.y1 - 0.01, 0],
  ]
  moves.sort((m, n) => Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]) - (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2])))
  for (const [dx, dy, dz] of moves) {
    if (clearAt3(sim, b, dx, dy, dz)) {
      moveBody3(b, dx, dy, dz)
      standOn(b, null)
      return
    }
  }
}

/** The solids in `moved` (by index) push one body out of them the shortest way: up onto the top, down under the bottom, or across; squeezed against something else, it is put beside the solid that moved. */
function pushBodyFloor(sim: Sim, b: Body, moved: readonly number[]): void {
  const on = b.kind === 'player' ? b.p.on : b.t.on
  for (const i of moved) {
    const s = sim.world.solids[i]
    if (s.id === on || s.surface.through || !solidActive(sim, s)) continue
    bodyBox3(b, box)
    if (!solidInBox3(sim, i, box.x0, box.y0, box.z0, box.x1, box.y1, box.z1)) continue
    const o = sim.outlines[i]
    let best: Vec3 = [0, o.y0 - box.y1, 0]
    let size = Math.abs(best[1])
    if (topOverFoot(o, box.x0, box.z0, box.x1, box.z1, top) && top.y - box.y0 < size) {
      best = [0, top.y - box.y0, 0]
      size = Math.abs(best[1])
    }
    if (sliceAt(o, box.y0, box.y1, slice)) {
      const [px, pz] = pushOut(slice, box.x0, box.z0, box.x1, box.z1)
      const across = Math.sqrt(px * px + pz * pz)
      if (across > 0 && across < size) best = [px, 0, pz]
    }
    moveBody3(b, best[0], best[1], best[2])
    // Pushed up from below: now standing on it.
    if (best[1] > 0) standOn(b, s.id)
    if (!clearAt3(sim, b, 0, 0, 0)) {
      moveBody3(b, -best[0], -best[1], -best[2])
      besideIfInsideFloor(sim, b, i)
    }
  }
}

/** A solid that moved into a body pushes it out (pushBodyFloor), every body in turn. */
export function pushBodiesFloor(sim: Sim, moved: readonly number[]): void {
  if (moved.length === 0) return
  for (const b of bodies(sim)) pushBodyFloor(sim, b, moved)
}

/** The solids in `moved` push player p out of them, as the movers' phase pushes every body: the bots' search pushes its copy of a bot so. */
export function pushPlayerOutFloor(sim: Sim, p: Player, moved: readonly number[]): void {
  pushBodyFloor(sim, { kind: 'player', p }, moved)
}

/** With pushing on, players who overlap are moved apart on the floor, half the overlap each, along the way they overlap least. */
export function separatePlayersFloor(sim: Sim): void {
  const ps = sim.world.players
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      const need = (playerWidth(a) + playerWidth(b)) / 2
      const dx = b.at[0] - a.at[0]
      const dz = b.at[2] - a.at[2]
      const overlapY = a.at[1] < b.at[1] + playerHeight(b) - 0.05 && b.at[1] < a.at[1] + playerHeight(a) - 0.05
      if (!overlapY || Math.abs(dx) >= need || Math.abs(dz) >= need) continue
      const alongX = need - Math.abs(dx) <= need - Math.abs(dz)
      const d = alongX ? dx : dz
      const push = (need - Math.abs(d)) / 2
      const dir = d === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(d)
      const [mx, mz] = alongX ? [dir * push, 0] : [0, dir * push]
      if (playerFitsFloor(sim, a.at[0] - mx, a.at[1], a.at[2] - mz, playerWidth(a), playerHeight(a))) a.at = [a.at[0] - mx, a.at[1], a.at[2] - mz]
      if (playerFitsFloor(sim, b.at[0] + mx, b.at[1], b.at[2] + mz, playerWidth(b), playerHeight(b))) b.at = [b.at[0] + mx, b.at[1], b.at[2] + mz]
    }
  }
}

// ------------------------------------------------------------------------------ noticing

const touchBox: Box3 = emptyBox3()

/** The pairs that touch now from high up, [touched, toucher] by id: every player and loose thing within `near` metres of a solid, a mover's solid or a thing that listens for touch. */
export function touchPairsFloor(sim: Sim, near: number): [HandleId, HandleId][] {
  const w = sim.world
  const pairs: [HandleId, HandleId][] = []
  const touchers: { id: HandleId; b: Box3 }[] = []
  const grown = (b: Box3): Box3 => ({ x0: b.x0 - near, y0: b.y0 - near, z0: b.z0 - near, x1: b.x1 + near, y1: b.y1 + near, z1: b.z1 + near })
  for (const p of w.players) touchers.push({ id: p.id, b: grown(playerBox3(p, touchBox)) })
  for (const th of w.things) if (thingLoose(th)) touchers.push({ id: th.id, b: grown(thingBox3(th, touchBox)) })
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s)) return
    const own = sim.listens[s.id].touch
    const mover = s.mover !== null && sim.listens[s.mover].touch ? s.mover : null
    if (!own && mover === null) return
    for (const who of touchers) {
      if (!solidInBox3(sim, i, who.b.x0, who.b.y0, who.b.z0, who.b.x1, who.b.y1, who.b.z1)) continue
      if (own) pairs.push([s.id, who.id])
      if (mover !== null) pairs.push([mover, who.id])
    }
  })
  for (const th of w.things) {
    if (!thingLoose(th) || !sim.listens[th.id].touch) continue
    const b = thingBox3(th, emptyBox3())
    for (const who of touchers) if (who.id !== th.id && boxes3Overlap(b, who.b)) pairs.push([th.id, who.id])
  }
  return pairs
}

const memberBox: Box3 = emptyBox3()

/** Who is in a zone now from high up, by id in id order: players by their boxes, things by theirs, a carried thing by its carrier's. */
export function zoneMembersFloor(sim: Sim, z: Zone, out: HandleId[]): HandleId[] {
  const w = sim.world
  const c = roomPoint(sim, z.at, z.mover)
  for (const p of w.players) if (zoneHas(c, z.size, playerBox3(p, memberBox))) out.push(p.id)
  for (const th of w.things) if (!th.hidden && zoneHas(c, z.size, th.heldBy === null ? thingBox3(th, memberBox) : playerBox3(w.players[th.heldBy], memberBox))) out.push(th.id)
  return out
}

/** How near a tap's point must be to a handle to land on it, metres: the scene's point is on the surface it hit. */
export const TAP_NEAR = 0.1

/**
 * The handle a tap from high up lands on, that has a tap of its own, or null. The tap's point is
 * where the scene's line from the eye first met something drawn (or the floor of the box): the
 * handle whose shape the point is on or in, within TAP_NEAR; among several, the one whose top is
 * highest (the eye from above meets it first), ties to the one built last.
 */
export function tapTargetFloor(sim: Sim, x: number, y: number, z: number): HandleId | null {
  const w = sim.world
  const n = TAP_NEAR
  let best: HandleId | null = null
  let bestTop = -Infinity
  const take = (id: HandleId, topY: number) => {
    if (topY > bestTop || (topY === bestTop && best !== null && id > best)) {
      best = id
      bestTop = topY
    }
  }
  const inBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => x >= x0 - n && x <= x1 + n && y >= y0 - n && y <= y1 + n && z >= z0 - n && z <= z1 + n
  w.solids.forEach((s, i) => {
    if (!solidActive(sim, s)) return
    const listening = sim.listens[s.id].tap || (s.mover !== null && sim.listens[s.mover].tap)
    if (!listening || !sliceAt(sim.outlines[i], y - n, y + n, slice) || !overlaps(slice, x - n, z - n, x + n, z + n)) return
    if (sim.listens[s.id].tap) take(s.id, sim.outlines[i].y1)
    if (s.mover !== null && sim.listens[s.mover].tap) take(s.mover, sim.outlines[i].y1)
  })
  for (const th of w.things) {
    if (th.hidden || !sim.listens[th.id].tap) continue
    const b = thingBox3(th, memberBox)
    if (inBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1)) take(th.id, b.y1)
  }
  for (const d of w.decor) {
    if (d.hidden || moverHidden(sim, d.mover)) continue
    const listening = sim.listens[d.id].tap || (d.mover !== null && sim.listens[d.mover].tap)
    if (!listening) continue
    const b = w.models[d.model].bounds
    const at = roomPoint(sim, d.at, d.mover)
    const k = d.scale
    if (inBox(at[0] + b.min[0] * k, at[1] + b.min[1] * k, at[2] + b.min[2] * k, at[0] + b.max[0] * k, at[1] + b.max[1] * k, at[2] + b.max[2] * k)) take(sim.listens[d.id].tap ? d.id : (d.mover as HandleId), at[1] + b.max[1] * k)
  }
  for (const zn of w.zones) {
    if (zn.hidden || moverHidden(sim, zn.mover) || !sim.listens[zn.id].tap) continue
    const c = roomPoint(sim, zn.at, zn.mover)
    const [hx, hy, hz] = [zn.size[0] / 2, zn.size[1] / 2, zn.size[2] / 2]
    if (inBox(c[0] - hx, c[1] - hy, c[2] - hz, c[0] + hx, c[1] + hy, c[2] + hz)) take(zn.id, c[1] + hy)
  }
  const h = SIZES.signHeight
  for (const sg of w.signs) {
    if (sg.hidden || moverHidden(sim, sg.mover) || !sim.listens[sg.id].tap) continue
    const c = roomPoint(sim, sg.at, sg.mover)
    if (inBox(c[0] - h, c[1] - h / 2, c[2] - 0.1, c[0] + h, c[1] + h / 2, c[2] + 0.1)) take(sg.id, c[1] + h / 2)
  }
  for (const l of w.lamps) {
    if (l.hidden || moverHidden(sim, l.mover) || !sim.listens[l.id].tap) continue
    const c = roomPoint(sim, l.at, l.mover)
    if (inBox(c[0] - 0.3, c[1] - 0.3, c[2] - 0.3, c[0] + 0.3, c[1] + 0.3, c[2] + 0.3)) take(l.id, c[1] + 0.3)
  }
  return best
}

const settleGround: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }

/** What a box's bottom rests on from high up, within 5 cm of it: a solid, a loose thing, or (for a player, `seat` 0 or more) another player's head; null for none. */
export function settleFloor(sim: Sim, b: Box3, self: HandleId, seat: number): HandleId | null {
  const near = gatherFloor(sim, b.x0 - 1, b.y0 - 1, b.z0 - 1, b.x1 + 1, b.y0 + 1, b.z1 + 1)
  return groundUnderFloor(sim, near, b.x0, b.z0, b.x1, b.z1, b.y0 - 0.05, b.y0 + 0.05, b.y0 + 0.05, self, seat >= 0, seat, settleGround) ? settleGround.id : null
}
