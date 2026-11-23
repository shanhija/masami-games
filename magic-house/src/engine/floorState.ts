/**
 * Magic House: the lookups and collision questions of the view from high up (step 6), beside
 * engine/state.ts's for the side view. The floor is x and z and y is up. Players and loose things
 * are boxes standing square to the axes (Box3); a solid is its footprint on the floor with its
 * heights (engine/geometry.ts setFootprint, kept in Sim.outlines by refreshOutline), turned round y.
 * What both views share stays in state.ts: the sim, the hooks, the lookups by id, the boxes' sizes,
 * the eases.
 */

import { emptyOutline, overlaps, sliceAt, topOverFoot, type FloorTop } from './geometry'
import { moverHidden, playerHeight, playerWidth, roomPoint, solidActive, thingLoose, type Sim } from './state'
import type { HandleId, Player, Thing } from './world'

/** A box standing square to the axes, metres: x0 to x1, y0 to y1, z0 to z1. Reused to save allocations. */
export interface Box3 {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
}

export const emptyBox3 = (): Box3 => ({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 })

/** A player's box from high up: FEEL.width square on the floor round their feet, FEEL.height tall, times their size. */
export function playerBox3(p: Player, out: Box3): Box3 {
  const hw = playerWidth(p) / 2
  out.x0 = p.at[0] - hw
  out.x1 = p.at[0] + hw
  out.y0 = p.at[1]
  out.y1 = p.at[1] + playerHeight(p)
  out.z0 = p.at[2] - hw
  out.z1 = p.at[2] + hw
  return out
}

/** A thing's box from high up, from its foot (Thing.box). */
export function thingBox3(t: Thing, out: Box3): Box3 {
  out.x0 = t.at[0] + t.box.min[0]
  out.x1 = t.at[0] + t.box.max[0]
  out.y0 = t.at[1] + t.box.min[1]
  out.y1 = t.at[1] + t.box.max[1]
  out.z0 = t.at[2] + t.box.min[2]
  out.z1 = t.at[2] + t.box.max[2]
  return out
}

/** Whether two boxes overlap by more than 1e-4 on every axis. */
export function boxes3Overlap(a: Box3, b: Box3): boolean {
  return a.x0 < b.x1 - 1e-4 && a.x1 > b.x0 + 1e-4 && a.y0 < b.y1 - 1e-4 && a.y1 > b.y0 + 1e-4 && a.z0 < b.z1 - 1e-4 && a.z1 > b.z0 + 1e-4
}

/** A scratch outline for the part of a solid between two heights. */
const slice = emptyOutline()

/** Whether solid i (from high up) reaches into the box: its part between the box's heights overlaps the box on the floor. */
export function solidInBox3(sim: Sim, i: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  return sliceAt(sim.outlines[i], y0, y1, slice) && overlaps(slice, x0, z0, x1, z1)
}

/** The active solids whose footprints and heights come near a region, by index; filled into a shared list the caller reads at once. */
export const nearFloor: number[] = []
export function gatherFloor(sim: Sim, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  nearFloor.length = 0
  const { solids } = sim.world
  for (let i = 0; i < solids.length; i++) {
    const o = sim.outlines[i]
    if (o.maxX < x0 || o.minX > x1 || o.maxY < z0 || o.minY > z1 || o.y1 < y0 || o.y0 > y1) continue
    if (!solidActive(sim, solids[i])) continue
    nearFloor.push(i)
  }
  return nearFloor
}

/** What a body stands on from high up, or would land on: the handle, the top's height and its rise there (dy/dx, dy/dz), and the solid's index or -1. */
export interface FloorGround {
  id: HandleId
  y: number
  gx: number
  gz: number
  solid: number
}

const top: FloorTop = { y: 0, gx: 0, gz: 0 }

/**
 * The highest floor over the rectangle [x0, x1] by [z0, z1] whose top is between `low` and `high`:
 * among the given near solids (through-floors too: from high up nothing drops through them), loose
 * things (all but `self` and things resting on it, up to `thingHigh`; a round one's top the ball in its
 * box) and, when `heads`, the heads of the players (all but seat `selfSeat`). Fills `out` and gives
 * true when there is one. On a tie the gentler top wins.
 */
export function groundUnderFloor(
  sim: Sim,
  solids: readonly number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  low: number,
  high: number,
  thingHigh: number,
  self: HandleId,
  heads: boolean,
  selfSeat: number,
  out: FloorGround,
): boolean {
  const w = sim.world
  let found = false
  for (const i of solids) {
    if (!topOverFoot(sim.outlines[i], x0, z0, x1, z1, top)) continue
    if (top.y < low || top.y > high) continue
    const steep = top.gx * top.gx + top.gz * top.gz
    if (!found || top.y > out.y + 1e-9 || (Math.abs(top.y - out.y) <= 1e-9 && steep < out.gx * out.gx + out.gz * out.gz)) {
      out.id = w.solids[i].id
      out.y = top.y
      out.gx = top.gx
      out.gz = top.gz
      out.solid = i
      found = true
    }
  }
  for (const t of w.things) {
    if (t.id === self || !thingLoose(t) || t.on === self) continue
    const tx0 = t.at[0] + t.box.min[0]
    const tx1 = t.at[0] + t.box.max[0]
    const tz0 = t.at[2] + t.box.min[2]
    const tz1 = t.at[2] + t.box.max[2]
    if (tx1 <= x0 + 1e-4 || tx0 >= x1 - 1e-4 || tz1 <= z0 + 1e-4 || tz0 >= z1 - 1e-4) continue
    let ty = t.at[1] + t.box.max[1]
    let gx = 0
    let gz = 0
    if (t.round) {
      // A round thing's top is the ball in its box.
      const cx = (tx0 + tx1) / 2
      const cz = (tz0 + tz1) / 2
      const r = (tx1 - tx0 + (tz1 - tz0) + (t.box.max[1] - t.box.min[1])) / 6
      const cy = t.at[1] + (t.box.min[1] + t.box.max[1]) / 2
      const dx = (cx < x0 ? x0 : cx > x1 ? x1 : cx) - cx
      const dz = (cz < z0 ? z0 : cz > z1 ? z1 : cz) - cz
      const dd = dx * dx + dz * dz
      if (dd >= r * r) continue
      const h = Math.sqrt(r * r - dd)
      ty = cy + h
      gx = -dx / h
      gz = -dz / h
    }
    if (ty < low || ty > Math.min(high, thingHigh)) continue
    if (!found || ty > out.y + 1e-9) {
      out.id = t.id
      out.y = ty
      out.gx = gx
      out.gz = gz
      out.solid = -1
      found = true
    }
  }
  if (heads) {
    for (const p of w.players) {
      if (p.seat === selfSeat) continue
      const hw = playerWidth(p) / 2
      if (p.at[0] + hw <= x0 + 1e-4 || p.at[0] - hw >= x1 - 1e-4 || p.at[2] + hw <= z0 + 1e-4 || p.at[2] - hw >= z1 - 1e-4) continue
      const hy = p.at[1] + playerHeight(p)
      if (hy < low || hy > high) continue
      if (!found || hy > out.y + 1e-9) {
        out.id = p.id
        out.y = hy
        out.gx = 0
        out.gz = 0
        out.solid = -1
        found = true
      }
    }
  }
  return found
}

/** Whether any of the near solids but through-floors and those in `ignore` reaches into the box. */
export function solidInBoxFloor(sim: Sim, solids: readonly number[], ignore: readonly number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  for (const i of solids) {
    if (sim.world.solids[i].surface.through || ignore.includes(i)) continue
    if (solidInBox3(sim, i, x0, y0, z0, x1, y1, z1)) return true
  }
  return false
}

/** The near solids, but through-floors, that reach into the box now: a body already inside one walks out of it, never stuck. */
export function solidsInsideFloor(sim: Sim, solids: readonly number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, out: number[]): number[] {
  out.length = 0
  for (const i of solids) {
    if (sim.world.solids[i].surface.through) continue
    if (solidInBox3(sim, i, x0, y0, z0, x1, y1, z1)) out.push(i)
  }
  return out
}

/** The solid (its index) a player's box at their feet x, y, z would be in, through-floors aside; -1 when none. */
export function solidInPlayerFloor(sim: Sim, x: number, y: number, z: number, width: number, height: number): number {
  const hw = width / 2
  for (const i of gatherFloor(sim, x - hw - 0.1, y - 0.1, z - hw - 0.1, x + hw + 0.1, y + height + 0.1, z + hw + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (solidInBox3(sim, i, x - hw, y + 0.01, z - hw, x + hw, y + height, z + hw)) return i
  }
  return -1
}

/** Whether a player's box at their feet x, y, z would be free of solids (through-floors aside). */
export function playerFitsFloor(sim: Sim, x: number, y: number, z: number, width: number, height: number): boolean {
  return solidInPlayerFloor(sim, x, y, z, width, height) < 0
}

/** Whether a thing's box at its foot x, y, z would be free of solids (through-floors aside). */
export function thingFitsFloor(sim: Sim, th: Thing, x: number, y: number, z: number): boolean {
  const x0 = x + th.box.min[0]
  const x1 = x + th.box.max[0]
  const y0 = y + th.box.min[1]
  const y1 = y + th.box.max[1]
  const z0 = z + th.box.min[2]
  const z1 = z + th.box.max[2]
  for (const i of gatherFloor(sim, x0 - 0.1, y0 - 0.1, z0 - 0.1, x1 + 0.1, y1 + 0.1, z1 + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (solidInBox3(sim, i, x0, y0 + 0.01, z0, x1, y1, z1)) return false
  }
  return true
}

/** What zones do to a body from high up this frame: wind and pull in all three ways (m/s², wind shared out by weight), how hard the world pulls, and the most drag. */
export interface FloorForces {
  ax: number
  ay: number
  az: number
  gravity: number
  drag: number
}

/**
 * The zones' pulls on a body in the box of this weight, from high up: as engine/state.ts zoneForces,
 * with a zone's z, its wind's az and its pull toward its middle in all three ways.
 */
export function zoneForcesFloor(sim: Sim, b: Box3, weight: number, out: FloorForces): FloorForces {
  out.ax = 0
  out.ay = 0
  out.az = 0
  out.gravity = 1
  out.drag = 0
  for (const z of sim.world.zones) {
    if (z.hidden || (z.wind[0] === 0 && z.wind[1] === 0 && z.wind[2] === 0 && z.pull === 0 && z.gravity === 1 && z.drag === 0)) continue
    if (moverHidden(sim, z.mover)) continue
    const c = roomPoint(sim, z.at, z.mover)
    if (!zoneHas(c, z.size, b)) continue
    const share = 1 / Math.max(weight, 0.25)
    out.ax += z.wind[0] * share
    out.ay += z.wind[1] * share
    out.az += z.wind[2] * share
    if (z.pull !== 0) {
      const dx = c[0] - (b.x0 + b.x1) / 2
      const dy = c[1] - (b.y0 + b.y1) / 2
      const dz = c[2] - (b.z0 + b.z1) / 2
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len > 0.05) {
        out.ax += (z.pull * dx) / len
        out.ay += (z.pull * dy) / len
        out.az += (z.pull * dz) / len
      }
    }
    if (z.gravity !== 1) out.gravity = z.gravity
    if (z.drag > out.drag) out.drag = Math.min(1, z.drag)
  }
  return out
}

/** Whether a box overlaps the zone's box of this size round its middle c, from high up. */
export function zoneHas(c: readonly number[], size: readonly number[], b: Box3): boolean {
  const hx = size[0] / 2
  const hy = size[1] / 2
  const hz = size[2] / 2
  return b.x0 < c[0] + hx - 1e-4 && b.x1 > c[0] - hx + 1e-4 && b.y0 < c[1] + hy - 1e-4 && b.y1 > c[1] - hy + 1e-4 && b.z0 < c[2] + hz - 1e-4 && b.z1 > c[2] - hz + 1e-4
}

/** How far apart two boxes are, metres (0 when they touch or overlap). */
export function gap3(a: Box3, b: Box3): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1)
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1)
  const dz = Math.max(0, b.z0 - a.z1, a.z0 - b.z1)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
