/**
 * Magic House: the bots' floor graph from high up (step 6; trial/api.ts), beside the side's
 * (trial/graph.ts). A coarse map over the floor, x and z, of where a bot can stand and how it gets
 * from one place to another, which scores the beam search from high up (trial/highSearch.ts) and,
 * when the search finds no way, says what is missing.
 *
 * - The floor is cut into square cells GRAPH.column metres apart. A spot is a place to stand in a
 *   cell: every top there, highest first, of a still solid or (in the graph with boosts, built when
 *   there is no way without one) a loose thing at rest or a player standing still, that is not too
 *   steep (STEEP) and leaves room for the body over it, above the step it walks up (FEEL.stepUp),
 *   inside the room's box. From high up a loose thing is mostly something to carry or push, and a
 *   way over the top of one is a boost of last resort, as a head is; from the side a thing at rest
 *   is always a floor.
 * - Spots in the eight cells round each other are joined by walking where the step between them is
 *   at most FEEL.stepUp. A spot missing a walk to any of its eight neighbours is an edge spot, at a
 *   floor's end or at a wall's foot. Edge spots are joined by a jump or a drop where a running jump
 *   carries the feet across the gap between their floors at that height (reachAcross: the side's
 *   numbers, the same any way across the floor), the jump rises that high before the head meets a
 *   solid over the spot it leaves or the room's top, and nothing between them stands higher than the
 *   jump's arc. The room's top is only 3 m up (engine/api.ts ROOM.high), so from a raised floor a
 *   jump's rise is stopped early and it falls from there, carrying the feet less far (reachUnder).
 * - A solid that moves (in a mover whose place changes, or on a slide or a turn under way) is one
 *   node, joined to every spot its top comes within a step or a jump of at some time over the
 *   horizon, and to every other moving solid it comes so near; it keeps when (trial/graph.ts
 *   Timetable), so the search counts the wait for it and the ride on it as from the side.
 * - Dijkstra from the spots that count as there gives every node its seconds to go.
 *
 * Pure plain numbers: no three.js, no Date, no Math.random.
 */

import { FEEL, ROOM } from '../engine/api'
import { bottomUnderFoot, contains, emptyOutline, topOverFoot, type FloorTop, type Outline } from '../engine/geometry'
import { cos, sin } from '../engine/math'
import { groundUnderFloor, solidInBox3, zoneForcesFloor, type FloorForces, type FloorGround } from '../engine/floorState'
import { CONTROL, STEEP } from '../engine/player'
import { DT, playerHeight, playerWidth, solidActive, thingLoose, whereOf, type Sim } from '../engine/state'
import type { HandleId, Player } from '../engine/world'
import { apex, arcAt, dijkstra, FAR, GRAPH, reachAcross, reachedFrom, reachUnder, tenth, type Ahead, type Edge, type Timetable } from './graph'

/** A place a bot can stand from high up. */
export interface HighSpot {
  /** The feet, at the middle of the cell. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** What it stands on: a solid, a thing or a player's head, by id. */
  readonly on: HandleId
  /** How high a jump from here lifts the feet before it tops out or the head meets a solid above, metres; the speed up it leaves at and the pull down here, as a side Spot's. */
  readonly rise: number
  readonly vy: number
  readonly g: number
  /** Its cell: ix + iz * nx. */
  readonly cell: number
}

/** A moving solid's top at some samples over the horizon: its footprint (a copy of its outline then), its top's height, the jump from it, and the samples it is there at. */
interface HighTop {
  readonly o: Outline
  readonly y: number
  readonly vy: number
  readonly g: number
  readonly when: number[]
}

/** A solid that moves, as one node of the graph. */
export interface HighMoving {
  readonly solid: number
  readonly id: HandleId
  /** Its tops over the horizon, each once, in the order they first come. */
  readonly tops: readonly HighTop[]
  readonly board: Map<number, number[]>
  readonly leave: Map<number, number[]>
}

const pull: FloorForces = { ax: 0, ay: 0, az: 0, gravity: 1, drag: 0 }

/** The jump of body p from feet at x, y, z from high up, as trial/graph.ts leapAt reckons it from the side: the speed up it leaves at (a held jump's, or a bounce's) and the pull down it meets there. */
export function leapAtHigh(sim: Sim, p: Player, x: number, y: number, z: number, bounce: number): { vy: number; g: number } {
  const hw = playerWidth(p) / 2
  zoneForcesFloor(sim, { x0: x - hw, y0: y, z0: z - hw, x1: x + hw, y1: y + playerHeight(p), z1: z + hw }, p.change === null ? 1 : p.change.weight, pull)
  const k = p.change === null ? 1 : p.change.jump
  const vy = bounce > 0 ? Math.sqrt(2 * FEEL.gravity * Math.max(pull.gravity, 0.2) * bounce) : pull.gravity > 0 ? Math.sqrt(2 * FEEL.gravity * pull.gravity * FEEL.jumpHigh * k) : 0
  return { vy, g: FEEL.gravity * pull.gravity - pull.ay }
}

/** The point of a footprint's edge (a convex polygon in x and z, or a circle) nearest a point on the floor, inside the footprint or out, and how far it is. */
function edgeNearest(o: Outline, x: number, z: number): { x: number; z: number; d: number } {
  if (o.kind === 'circle') {
    const dx = x - o.cx
    const dz = z - o.cy
    const len = Math.sqrt(dx * dx + dz * dz)
    const [ux, uz] = len < 1e-12 ? [1, 0] : [dx / len, dz / len]
    return { x: o.cx + ux * o.r, z: o.cy + uz * o.r, d: Math.abs(len - o.r) }
  }
  let best = { x, z, d: Infinity }
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    const ex = o.xs[j] - o.xs[i]
    const ez = o.ys[j] - o.ys[i]
    const len2 = ex * ex + ez * ez
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - o.xs[i]) * ex + (z - o.ys[i]) * ez) / len2))
    const px = o.xs[i] + t * ex
    const pz = o.ys[i] + t * ez
    const d = Math.sqrt((x - px) ** 2 + (z - pz) ** 2)
    if (d < best.d) best = { x: px, z: pz, d }
  }
  return best
}

/** How far a point is from a footprint on the floor; 0 inside it. */
export function footGap(o: Outline, x: number, z: number): number {
  return contains(o, x, z) ? 0 : edgeNearest(o, x, z).d
}

/** How far from (x, z) along the unit way (ux, uz) a square of half size `half` stays over a footprint (it overlaps it): 0 when it does not now. */
function footExit(o: Outline, x: number, z: number, ux: number, uz: number, half: number): number {
  if (o.kind === 'circle') {
    const r = o.r + half
    const dx = x - o.cx
    const dz = z - o.cy
    const b = dx * ux + dz * uz
    const c = dx * dx + dz * dz - r * r
    if (c > 0) return 0
    return -b + Math.sqrt(Math.max(0, b * b - c))
  }
  let t = Infinity
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    // The edge's outward normal (the polygon is counterclockwise in x and z, as engine/geometry.ts contains reads it), and the edge pushed out by the square.
    let nx = o.ys[j] - o.ys[i]
    let nz = o.xs[i] - o.xs[j]
    const len = Math.sqrt(nx * nx + nz * nz)
    if (len === 0) continue
    nx /= len
    nz /= len
    const d = nx * o.xs[i] + nz * o.ys[i] + half * (Math.abs(nx) + Math.abs(nz))
    const now = nx * x + nz * z
    if (now > d + 1e-9) return 0
    const along = nx * ux + nz * uz
    if (along > 1e-12) t = Math.min(t, (d - now) / along)
  }
  return t === Infinity ? 0 : t
}

/**
 * How far apart two footprints are on the floor, and a point of the first's edge that far from the
 * second: the one nearest (x, z) (where a bot stood) when that one is as near as any, else one of
 * the nearest pair. 0 apart where they meet.
 */
export function footsApart(a: Outline, b: Outline, x: number, z: number): { gap: number; x: number; z: number } {
  const corners = (o: Outline): [number, number][] => {
    if (o.kind === 'poly') return o.xs.slice(0, o.n).map((cx, i) => [cx, o.ys[i]])
    const out: [number, number][] = []
    for (let k = 0; k < 16; k++) out.push([o.cx + o.r * cos((k / 16) * 2 * Math.PI), o.cy + o.r * sin((k / 16) * 2 * Math.PI)])
    return out
  }
  let best = { gap: Infinity, x: a.cx, z: a.cy }
  for (const [cx, cz] of corners(b)) {
    if (contains(a, cx, cz)) return { gap: 0, x: cx, z: cz }
    const near = edgeNearest(a, cx, cz)
    if (near.d < best.gap) best = { gap: near.d, x: near.x, z: near.z }
  }
  for (const [cx, cz] of corners(a)) {
    const gap = footGap(b, cx, cz)
    if (gap < best.gap - 1e-9) best = { gap, x: cx, z: cz }
  }
  const mine = edgeNearest(a, x, z)
  return footGap(b, mine.x, mine.z) <= best.gap + 1e-3 ? { gap: best.gap, x: mine.x, z: mine.z } : best
}

export class HighGraph implements Timetable {
  readonly spots: HighSpot[] = []
  readonly moving: HighMoving[] = []
  /** Spot indices in each cell, lowest first. */
  readonly cells: number[][] = []
  /** The highest top in each cell under the body's square, standable or not (a wall's too): what a jump's arc must clear. */
  readonly topH: Float64Array
  readonly out: Edge[][] = []
  readonly inn: Edge[][] = []
  /** The spots whose jumps in were taken out as landings the bot's moves could not make (dropJumpsInto). */
  readonly dropped = new Set<number>()
  /** Whether each spot is an edge spot (a walk to one of its eight neighbours is missing), and the walked part of the floor it is in (spots joined by walking share one). */
  edge: Uint8Array = new Uint8Array(0)
  part: Int32Array = new Int32Array(0)
  /** The cells across (x) and along (z), and the middle of cell 0. */
  readonly nx: number
  readonly nz: number
  readonly x0: number
  readonly z0: number
  readonly frame0: number
  readonly movingNode = new Map<number, number>()
  readonly boarding = new Map<number, Edge[]>()
  /** The jump a bot leaves at where no zone pulls, m/s, and the most it lifts the feet there. */
  readonly vyJump: number
  readonly jumpHigh: number
  readonly foot: number
  private readonly hw: number
  private readonly height: number
  /** Each spot's floor as the jumps measure its end: the solid's index, or -1 for a box (a thing's, a head's) given in fx0..fz1. */
  private readonly floorSolid: number[] = []
  private readonly floorBox: number[] = []

  constructor(
    readonly now: Sim,
    fixed: readonly number[],
    readonly self: Player,
    ahead: Ahead,
    frames: number,
    readonly heads: boolean,
    readonly key: number,
  ) {
    const w = now.world
    const k = self.change === null ? 1 : self.change.jump
    this.vyJump = Math.sqrt(2 * FEEL.gravity * FEEL.jumpHigh * k)
    this.jumpHigh = FEEL.jumpHigh * k
    this.foot = (CONTROL.foot * self.size) / 2
    this.hw = playerWidth(self) / 2
    this.height = playerHeight(self)
    this.frame0 = w.frame
    this.x0 = w.bounds.min[0] + this.hw
    this.z0 = w.bounds.min[2] + this.hw
    this.nx = Math.max(1, Math.floor((w.bounds.max[0] - this.hw - this.x0) / GRAPH.column) + 1)
    this.nz = Math.max(1, Math.floor((w.bounds.max[2] - this.hw - this.z0) / GRAPH.column) + 1)
    for (let c = 0; c < this.nx * this.nz; c++) this.cells.push([])
    this.topH = new Float64Array(this.nx * this.nz).fill(-Infinity)
    const sampled = this.sample(ahead, frames)
    const settled = ahead.moving.filter((_, i) => sampled.settled[i])
    this.scan(ahead.sim, [...fixed, ...settled])
    this.spots.forEach(() => this.out.push([]))
    this.joinWalks()
    this.jumps(ahead.sim)
    this.join(ahead, sampled)
    for (let n = 0; n < this.out.length; n++) this.inn.push([])
    this.out.forEach((edges, from) => {
      for (const e of edges) this.inn[e.to].push({ to: from, cost: e.cost })
    })
  }

  get size(): number {
    return this.spots.length + this.moving.length
  }

  /** The cell a point is in, held to the floor's cells. */
  cellOf(x: number, z: number): number {
    const ix = Math.max(0, Math.min(this.nx - 1, Math.round((x - this.x0) / GRAPH.column)))
    const iz = Math.max(0, Math.min(this.nz - 1, Math.round((z - this.z0) / GRAPH.column)))
    return ix + iz * this.nx
  }

  /** Every spot: each cell's floors from the top down, kept where they are standable, in `sim` (the room ahead, its settling solids where they settle). */
  private scan(sim: Sim, fixed: readonly number[]): void {
    const w = sim.world
    const col = GRAPH.column
    // The still solids each cell's body can meet, so a cell asks only those.
    const near: number[][] = this.cells.map(() => [])
    for (const i of fixed) {
      const o = sim.outlines[i]
      const ix0 = Math.max(0, Math.floor((o.minX - this.hw - this.x0) / col))
      const ix1 = Math.min(this.nx - 1, Math.ceil((o.maxX + this.hw - this.x0) / col))
      const iz0 = Math.max(0, Math.floor((o.minY - this.hw - this.z0) / col))
      const iz1 = Math.min(this.nz - 1, Math.ceil((o.maxY + this.hw - this.z0) / col))
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) near[ix + iz * this.nx].push(i)
    }
    const g: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }
    const top: FloorTop = { y: 0, gx: 0, gz: 0 }
    const low = w.bounds.min[1] - 1
    const f = this.foot
    const hw = this.hw
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const c = ix + iz * this.nx
        const x = this.x0 + ix * col
        const z = this.z0 + iz * col
        // The highest top under the body's square: solids but through-floors, and loose things.
        let h = -Infinity
        for (const i of near[c]) if (!w.solids[i].surface.through && topOverFoot(sim.outlines[i], x - hw, z - hw, x + hw, z + hw, top)) h = Math.max(h, top.y)
        for (const t of w.things) {
          if (!thingLoose(t) || t.at[0] + t.box.max[0] <= x - hw || t.at[0] + t.box.min[0] >= x + hw || t.at[2] + t.box.max[2] <= z - hw || t.at[2] + t.box.min[2] >= z + hw) continue
          h = Math.max(h, t.at[1] + t.box.max[1])
        }
        this.topH[c] = h
        let high = w.bounds.max[1] + 1
        for (let n = 0; n < 16; n++) {
          // A loose thing's top is a floor only in the graph with boosts, as a head is: from high up a thing is mostly to carry or push.
          if (!groundUnderFloor(sim, near[c], x - f, z - f, x + f, z + f, low, high, this.heads ? high : -Infinity, this.self.id, false, this.self.seat, g)) break
          if (g.gx * g.gx + g.gz * g.gz <= STEEP * STEEP) this.consider(sim, near[c], c, x, g.y, z, g.id, g.solid)
          high = g.y - 0.02
        }
        // The heads of players standing still.
        for (const o of this.heads ? w.players : []) {
          if (o.seat === this.self.seat || o.on === null || !still(o.velocity)) continue
          const ohw = playerWidth(o) / 2
          if (o.at[0] + ohw <= x - f + 1e-4 || o.at[0] - ohw >= x + f - 1e-4 || o.at[2] + ohw <= z - f + 1e-4 || o.at[2] - ohw >= z + f - 1e-4) continue
          this.consider(sim, near[c], c, x, o.at[1] + playerHeight(o), z, o.id, -1)
        }
        this.cells[c].sort((a, b) => this.spots[a].y - this.spots[b].y)
      }
    }
  }

  /** A spot in cell c at feet x, y, z on `on` (solid index `solid`, or -1), if the body fits over that floor inside the room's box. */
  private consider(sim: Sim, near: readonly number[], c: number, x: number, y: number, z: number, on: HandleId, solid: number): void {
    const w = sim.world
    const hw = this.hw
    if (y + this.height > w.bounds.max[1] + 1e-6) return
    for (const s of this.cells[c]) if (Math.abs(this.spots[s].y - y) < 0.02) return
    // Room for the body above the step it walks up: what is lower than that it walks onto.
    for (const i of near) {
      if (w.solids[i].surface.through) continue
      if (solidInBox3(sim, i, x - hw, y + FEEL.stepUp, z - hw, x + hw, y + this.height, z + hw)) return
    }
    for (const t of w.things) {
      if (!thingLoose(t) || t.id === on) continue
      if (t.at[0] + t.box.max[0] <= x - hw + 1e-4 || t.at[0] + t.box.min[0] >= x + hw - 1e-4) continue
      if (t.at[2] + t.box.max[2] <= z - hw + 1e-4 || t.at[2] + t.box.min[2] >= z + hw - 1e-4) continue
      if (t.at[1] + t.box.max[1] <= y + 0.06 || t.at[1] + t.box.min[1] >= y + this.height - 1e-4) continue
      return
    }
    // The floor's end, as the jumps measure it.
    const where = sim.where[on]
    let box = [0, 0, 0, 0]
    if (where.kind === 'thing') {
      const t = w.things[where.i]
      box = [t.at[0] + t.box.min[0], t.at[2] + t.box.min[2], t.at[0] + t.box.max[0], t.at[2] + t.box.max[2]]
    } else if (where.kind === 'player') {
      const p = w.players[where.i]
      const phw = playerWidth(p) / 2
      box = [p.at[0] - phw, p.at[2] - phw, p.at[0] + phw, p.at[2] + phw]
    }
    // How high a jump rises before it tops out, or the head meets a solid over the spot or the room's top.
    const { vy, g } = leapAtHigh(sim, this.self, x, y, z, solid >= 0 ? w.solids[solid].surface.bounce : 0)
    let rise = Math.min(apex(vy, g), w.bounds.max[1] - y - this.height)
    const under: FloorTop = { y: 0, gx: 0, gz: 0 }
    for (const i of near) {
      if (w.solids[i].surface.through || !bottomUnderFoot(sim.outlines[i], x - hw, z - hw, x + hw, z + hw, under)) continue
      if (under.y >= y + this.height - 0.01) rise = Math.min(rise, under.y - y - this.height)
    }
    this.spots.push({ x, y, z, on, rise: Math.max(0, rise), vy, g, cell: c })
    this.floorSolid.push(solid)
    this.floorBox.push(...box)
    this.cells[c].push(this.spots.length - 1)
  }

  private edgeTo(from: number, to: number, cost: number): void {
    this.out[from].push({ to, cost })
  }

  /** Walking to the eight cells round, up or down a step; a spot missing any of the eight is an edge spot. */
  private joinWalks(): void {
    const links = new Uint8Array(this.spots.length)
    const col = GRAPH.column
    // The walked parts, joined as walks are found (union-find).
    const up = new Int32Array(this.spots.length).map((_, i) => i)
    const root = (i: number): number => {
      while (up[i] !== i) {
        up[i] = up[up[i]]
        i = up[i]
      }
      return i
    }
    const ways: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ]
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const c = ix + iz * this.nx
        for (const [dx, dz] of ways) {
          const jx = ix + dx
          const jz = iz + dz
          if (jx < 0 || jx >= this.nx || jz >= this.nz) continue
          const t = (Math.sqrt(dx * dx + dz * dz) * col) / FEEL.walk
          for (const a of this.cells[c]) {
            for (const b of this.cells[jx + jz * this.nx]) {
              if (Math.abs(this.spots[a].y - this.spots[b].y) > FEEL.stepUp + GRAPH.stepSlack) continue
              this.edgeTo(a, b, t)
              this.edgeTo(b, a, t)
              links[a] += 1
              links[b] += 1
              up[root(a)] = root(b)
            }
          }
        }
      }
    }
    this.edge = new Uint8Array(this.spots.length)
    for (let a = 0; a < this.spots.length; a++) if (links[a] < 8) this.edge[a] = 1
    this.part = new Int32Array(this.spots.length).map((_, i) => root(i))
  }

  /** How far from spot a along (ux, uz) its feet still stand over its floor, held to a cell and a half: where a jump from it leaves, or one onto it lands. */
  private standsOut(sim: Sim, a: number, ux: number, uz: number): number {
    const s = this.spots[a]
    const solid = this.floorSolid[a]
    let t: number
    if (solid >= 0) t = footExit(sim.outlines[solid], s.x, s.z, ux, uz, this.foot)
    else {
      const [x0, z0, x1, z1] = this.floorBox.slice(4 * a, 4 * a + 4)
      const tx = ux > 1e-12 ? (x1 + this.foot - s.x) / ux : ux < -1e-12 ? (x0 - this.foot - s.x) / ux : Infinity
      const tz = uz > 1e-12 ? (z1 + this.foot - s.z) / uz : uz < -1e-12 ? (z0 - this.foot - s.z) / uz : Infinity
      t = Math.max(0, Math.min(tx, tz))
    }
    return Math.min(t, 1.5 * GRAPH.column)
  }

  /** reachAcross by a table a centimetre apart over the heights the room has, as the side's graph keeps it; under a lower cap (a spot's rise, as under the room's top from a raised floor), reachUnder. */
  private readonly reaches = new Map<string, Float64Array>()
  /** The table asked last, kept beside the map: nearly every spot of a room jumps alike. */
  private last: { vy: number; g: number; table: Float64Array } = { vy: NaN, g: NaN, table: new Float64Array(0) }
  reach(up: number, vy: number, g: number, cap: number): number {
    if (g <= 0) return FAR
    if (cap < apex(vy, g) - 1e-9) return reachUnder(up, vy, g, cap)
    const deep = this.now.world.bounds.max[1] - this.now.world.bounds.min[1] + 1
    let table = this.last.table
    if (vy !== this.last.vy || g !== this.last.g) {
      const id = `${vy}|${g}`
      const known = this.reaches.get(id)
      if (known === undefined) {
        table = new Float64Array(Math.ceil((deep + apex(vy, g)) * 100) + 1)
        for (let k = 0; k < table.length; k++) table[k] = reachAcross(k / 100 - deep, vy, g)
        this.reaches.set(id, table)
      } else table = known
      this.last = { vy, g, table }
    }
    const k = Math.round((up + deep) * 100)
    return k < 0 ? reachAcross(up, vy, g) : k >= table.length ? -1 : table[k]
  }

  /**
   * Whether a jump from spot A to spot B clears what stands between them: across the gap, from where
   * A's feet leave (`from` along the way) to where B's land (`to`), every cell's highest top stays
   * under the arc of a running jump from A (the coyote time given, as reachAcross gives it).
   */
  clears(A: HighSpot, B: HighSpot, ux: number, uz: number, from: number, to: number): boolean {
    const g = Math.max(A.g, B.g)
    if (g <= 0) return true
    for (let s = from; s <= to; s += 0.2) {
      const h = this.topH[this.cellOf(A.x + ux * s, A.z + uz * s)]
      if (h === -Infinity) continue
      const t = Math.max(0, (s - from) / CONTROL.airSpeed - CONTROL.coyote)
      if (h > A.y + arcAt(t, A.vy, g, A.rise) + 0.05) return false
    }
    return true
  }

  /** Jumps and drops between edge spots, where a running jump carries the feet across their floors' gap at that height and clears what is between. */
  private jumps(sim: Sim): void {
    const n = this.spots.length
    if (n === 0) return
    let lo = Infinity
    let hiY = -Infinity
    let vyMost = this.vyJump
    let floats = false
    for (const s of this.spots) {
      lo = Math.min(lo, s.y)
      hiY = Math.max(hiY, s.y)
      vyMost = Math.max(vyMost, s.vy)
      if (s.g <= 0) floats = true
    }
    const far = floats ? 12 : reachAcross(-(hiY - lo), vyMost, FEEL.gravity) + 2 * GRAPH.column
    // The edge spots in buckets a metre square, so each asks only those near it.
    const B = 1
    const bx = Math.ceil((this.nx * GRAPH.column) / B) + 1
    const bz = Math.ceil((this.nz * GRAPH.column) / B) + 1
    const buckets: number[][] = []
    for (let k = 0; k < bx * bz; k++) buckets.push([])
    const bucketOf = (x: number, z: number) => Math.floor((x - this.x0) / B) + Math.floor((z - this.z0) / B) * bx
    for (let a = 0; a < n; a++) if (this.edge[a] === 1) buckets[bucketOf(this.spots[a].x, this.spots[a].z)].push(a)
    const reachB = Math.ceil(far / B)
    for (let a = 0; a < n; a++) {
      if (this.edge[a] !== 1) continue
      const A = this.spots[a]
      const abx = Math.floor((A.x - this.x0) / B)
      const abz = Math.floor((A.z - this.z0) / B)
      for (let jz = Math.max(0, abz - reachB); jz <= Math.min(bz - 1, abz + reachB); jz++) {
        for (let jx = Math.max(0, abx - reachB); jx <= Math.min(bx - 1, abx + reachB); jx++) {
          for (const b of buckets[jx + jz * bx]) {
            if (b === a) continue
            const Bs = this.spots[b]
            const up = Bs.y - A.y
            if (up > A.rise + 1e-6) continue
            // Walking already joins two spots of one walked part at about one height: a jump there would only cut a corner. Between
            // heights of one part (off a terrace its ramp also leads down from) a jump only cuts the way short, so every other cell's spot will do.
            if (this.part[a] === this.part[b] && (Math.abs(up) <= FEEL.stepUp + GRAPH.stepSlack || (Bs.cell % this.nx) % 2 === 1 || Math.floor(Bs.cell / this.nx) % 2 === 1)) continue
            const dx = Bs.x - A.x
            const dz = Bs.z - A.z
            const dd = dx * dx + dz * dz
            if (dd > far * far) continue
            const dist = Math.sqrt(dd)
            const reach = this.reach(up, A.vy, Math.max(A.g, Bs.g), A.rise)
            if (reach < 0 || dist > reach + 3 * GRAPH.column + 2 * this.foot) continue
            const ux = dist > 1e-9 ? dx / dist : 0
            const uz = dist > 1e-9 ? dz / dist : 0
            const from = dist > 1e-9 ? this.standsOut(sim, a, ux, uz) : 0
            const to = dist > 1e-9 ? dist - this.standsOut(sim, b, -ux, -uz) : 0
            if (to - from > reach + 1e-6) continue
            if (dist > 1e-9 && !this.clears(A, Bs, ux, uz, from, to)) continue
            this.edgeTo(a, b, GRAPH.jumpCost + dist / CONTROL.airSpeed)
          }
        }
      }
    }
  }

  /** The moving solids' tops over the horizon (each once), every sample in time, and which settle within GRAPH.settleSecs. Leaves the room ahead at the horizon's end. */
  private sample(ahead: Ahead, frames: number): { tops: HighTop[][]; times: HighTop[][]; settled: boolean[] } {
    const tops: HighTop[][] = ahead.moving.map(() => [])
    const seen: Map<string, HighTop>[] = ahead.moving.map(() => new Map())
    const times: HighTop[][] = ahead.moving.map(() => [])
    let sample = 0
    const take = () => {
      ahead.moving.forEach((i, k) => {
        const o = ahead.sim.outlines[i]
        const key = `${Math.round(o.cx * 100)}|${Math.round(o.cy * 100)}|${Math.round(o.y1 * 100)}|${Math.round(ahead.sim.turns[i] * 1000)}`
        let top = seen[k].get(key)
        if (top === undefined) {
          const leap = leapAtHigh(ahead.sim, this.self, o.cx, o.y1, o.cy, ahead.sim.world.solids[i].surface.bounce)
          top = { o: { ...o, xs: [...o.xs], ys: [...o.ys] }, y: o.y1, vy: leap.vy, g: leap.g, when: [] }
          seen[k].set(key, top)
          tops[k].push(top)
        }
        top.when.push(sample)
        times[k].push(top)
      })
      sample += 1
    }
    take()
    for (let f = GRAPH.sampleFrames; f <= frames; f += GRAPH.sampleFrames) {
      ahead.sampleAt(f)
      take()
    }
    const settle = Math.round(GRAPH.settleSecs / (GRAPH.sampleFrames * DT))
    const settled = times.map((list) => list.every((t, s) => s < settle || t === list[list.length - 1]))
    return { tops, times, settled }
  }

  /** The moving solids that do not settle: each one node, joined to the spots it comes near and to each other, with when. */
  private join(ahead: Ahead, sampled: { tops: HighTop[][]; times: HighTop[][]; settled: boolean[] }): void {
    const times: HighTop[][] = []
    ahead.moving.forEach((i, k) => {
      if (sampled.settled[k]) return
      this.movingNode.set(i, this.spots.length + this.moving.length)
      this.moving.push({ solid: i, id: this.now.world.solids[i].id, tops: sampled.tops[k], board: new Map(), leave: new Map() })
      times.push(sampled.times[k])
      this.out.push([])
    })
    const base = this.spots.length
    const col = GRAPH.column
    // How far across one may step or jump between a spot and a moving top, metres, or -1.
    const meets = (fromY: number, rise: number, vy: number, g: number, toY: number, gap: number): number => {
      const up = toY - fromY
      if (Math.abs(up) <= FEEL.stepUp && gap <= col) return gap
      if (up > rise + 1e-6 || gap > this.reach(up, vy, g, rise)) return -1
      return gap
    }
    const far = reachAcross(-(this.now.world.bounds.max[1] - this.now.world.bounds.min[1]), this.vyJump, FEEL.gravity) + 1
    const sorted = (lists: number[][]) => lists.flat().sort((p, q) => p - q)
    this.moving.forEach((m, k) => {
      const n = base + k
      const onWhen = new Map<number, number[][]>()
      const offWhen = new Map<number, number[][]>()
      const onCost = new Map<number, number>()
      const offCost = new Map<number, number>()
      for (const top of m.tops) {
        const o = top.o
        const ix0 = Math.max(0, Math.floor((o.minX - far - this.x0) / col))
        const ix1 = Math.min(this.nx - 1, Math.ceil((o.maxX + far - this.x0) / col))
        const iz0 = Math.max(0, Math.floor((o.minY - far - this.z0) / col))
        const iz1 = Math.min(this.nz - 1, Math.ceil((o.maxY + far - this.z0) / col))
        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            for (const a of this.cells[ix + iz * this.nx]) {
              const A = this.spots[a]
              const gap = Math.max(0, footGap(o, A.x, A.z) - this.foot)
              const on = meets(A.y, A.rise, A.vy, Math.max(A.g, top.g), top.y, gap)
              if (on >= 0) {
                onCost.set(a, Math.min(onCost.get(a) ?? Infinity, on))
                onWhen.set(a, [...(onWhen.get(a) ?? []), top.when])
              }
              const off = meets(top.y, this.riseUnderTop(top), top.vy, Math.max(A.g, top.g), A.y, gap)
              if (off >= 0) {
                offCost.set(a, Math.min(offCost.get(a) ?? Infinity, off))
                offWhen.set(a, [...(offWhen.get(a) ?? []), top.when])
              }
            }
          }
        }
      }
      for (const [a, gap] of onCost) {
        const cost = GRAPH.moverCost + gap / CONTROL.airSpeed
        this.edgeTo(a, n, cost)
        m.board.set(a, sorted(onWhen.get(a) as number[][]))
        const list = this.boarding.get(a)
        if (list === undefined) this.boarding.set(a, [{ to: n, cost }])
        else list.push({ to: n, cost })
      }
      for (const [a, gap] of offCost) {
        this.edgeTo(n, a, GRAPH.moverCost + gap / CONTROL.airSpeed)
        m.leave.set(a, sorted(offWhen.get(a) as number[][]))
      }
      // Another moving solid it comes near at the same time.
      this.moving.forEach((_, k2) => {
        if (k2 === k) return
        for (let s = 0; s < times[k].length; s++) {
          const a = times[k][s]
          const b = times[k2][s]
          const gap = Math.max(0, footsApart(a.o, b.o, a.o.cx, a.o.cy).gap - 2 * this.foot)
          if (meets(a.y, apex(a.vy, a.g), a.vy, Math.max(a.g, b.g), b.y, gap) >= 0) {
            this.edgeTo(n, base + k2, GRAPH.moverCost + gap / CONTROL.airSpeed)
            break
          }
        }
      })
    })
  }

  distances(goals: readonly number[], alone: boolean): Float64Array {
    return dijkstra(this.inn, this.spots.length, goals, alone)
  }

  /** How many edges were taken out (drop): distances worked out before are out of date when it changes. */
  version = 0

  /**
   * Takes out every jump onto spot b and the spots walked to from it in the cells round it: a landing
   * the bots' real moves could not make (trial/highSearch.ts), from wherever they jump.
   */
  dropJumpsInto(b: number): void {
    const B = this.spots[b]
    const bx = B.cell % this.nx
    const bz = (B.cell - bx) / this.nx
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (bx + dx < 0 || bx + dx >= this.nx || bz + dz < 0 || bz + dz >= this.nz) continue
        for (const c of this.cells[bx + dx + (bz + dz) * this.nx]) {
          if (Math.abs(this.spots[c].y - B.y) > FEEL.stepUp + GRAPH.stepSlack) continue
          this.dropped.add(c)
          for (const e of this.inn[c]) if (e.to < this.spots.length && !this.walks(e.to, c)) this.out[e.to] = this.out[e.to].filter((o) => o.to !== c)
          this.inn[c] = this.inn[c].filter((e) => e.to >= this.spots.length || this.walks(e.to, c))
        }
      }
    }
    this.version += 1
  }

  /** Whether the edge from spot a to spot b is a walk (to a cell round it, a step at most), not a jump. */
  walks(a: number, b: number): boolean {
    const A = this.spots[a]
    const B = this.spots[b]
    const ax = A.cell % this.nx
    const bx = B.cell % this.nx
    return Math.abs(ax - bx) <= 1 && Math.abs((A.cell - ax) / this.nx - (B.cell - bx) / this.nx) <= 1 && Math.abs(A.y - B.y) <= FEEL.stepUp + GRAPH.stepSlack
  }

  reached(from: number): Uint8Array {
    return reachedFrom(this.out, from)
  }

  /** The node a body stands on: the moving solid's, or the spot at its feet in their cell or one round it; -1 for none. */
  nodeAt(p: Player): number {
    if (p.on === null) return -1
    const where = this.now.where[p.on]
    if (where.kind === 'solid') {
      const n = this.movingNode.get(where.i)
      if (n !== undefined) return n
    }
    return this.spotNear(p.at[0], p.at[1], p.at[2])
  }

  /** The spot nearest feet at x, y, z in their cell or the eight round it, within a step's height; -1 for none. */
  spotNear(x: number, y: number, z: number): number {
    const ix = Math.round((x - this.x0) / GRAPH.column)
    const iz = Math.round((z - this.z0) / GRAPH.column)
    let best = -1
    let bestD = 0.16
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx
        const jz = iz + dz
        if (jx < 0 || jx >= this.nx || jz < 0 || jz >= this.nz) continue
        for (const s of this.cells[jx + jz * this.nx]) {
          const d = Math.abs(this.spots[s].y - y) + (Math.abs(dx) + Math.abs(dz)) * 0.01
          if (d < bestD) {
            best = s
            bestD = d
          }
        }
      }
    }
    return best
  }

  /** The spot under feet at x, y, z: the highest one in their cell at or below them; -1 for none. */
  spotUnder(x: number, y: number, z: number): number {
    let best = -1
    for (const s of this.cells[this.cellOf(x, z)]) if (this.spots[s].y <= y + 0.05) best = s
    return best
  }

  /** How high a jump from a moving solid's top lifts the feet before it tops out or the head meets the room's top, as the side's graph reckons it. */
  riseUnderTop(top: { y: number; vy: number; g: number }): number {
    return Math.max(0, Math.min(apex(top.vy, top.g), this.now.world.bounds.max[1] - top.y - this.height))
  }

  /** Where a node is, for a sentence and the search: a spot's feet, or a moving solid's top now (its middle). */
  placeOf(n: number): { x: number; y: number; z: number; rise: number; vy: number; g: number } {
    if (n < this.spots.length) return this.spots[n]
    const top = this.moving[n - this.spots.length].tops[0]
    return { x: top.o.cx, y: top.y, z: top.o.cy, rise: this.riseUnderTop(top), vy: top.vy, g: top.g }
  }

  /** The floor under a node as built, for a sentence: a still solid's footprint or a thing's box as one; null for a head or a solid that moves. */
  floorOf(n: number): Outline | null {
    if (n >= this.spots.length) return null
    const sim = this.now
    const where = whereOf(sim, this.spots[n].on)
    if (where.kind === 'solid') {
      const s = sim.world.solids[where.i]
      return s.mover === null && s.slide === null && s.turning === null ? sim.outlines[where.i] : null
    }
    if (where.kind === 'thing') {
      const t = sim.world.things[where.i]
      const [x0, z0, x1, z1] = [t.at[0] + t.box.min[0], t.at[2] + t.box.min[2], t.at[0] + t.box.max[0], t.at[2] + t.box.max[2]]
      return { ...emptyOutline(), kind: 'poly', n: 4, xs: [x0, x1, x1, x0], ys: [z0, z0, z1, z1], cx: (x0 + x1) / 2, cy: (z0 + z1) / 2, r: 0, minX: x0, maxX: x1, minY: z0, maxY: z1 }
    }
    return null
  }
}

/** Things standing still enough to stand on, and players standing still: what the graph takes as floors. */
function still(v: readonly number[]): boolean {
  return Math.abs(v[0]) < 0.05 && Math.abs(v[1]) < 0.05 && Math.abs(v[2]) < 0.05
}

/** A place as a sentence from high up says it: x, y, z to a tenth. */
export const placeHigh = (x: number, y: number, z: number) => `${tenth(x)}, ${tenth(y)}, ${tenth(z)}`

/**
 * The gap between two nodes as WALK_MISTAKES.noWay says it from high up: the gap's clause and the
 * jump's. The gap is between the floors' footprints as a designer built them, across the floor, and
 * the height between their tops; a solid in the way is named as `name` says it, with where it stands
 * on the floor and how high. `tried` is a jump the graph allows that the bot's moves did not make:
 * with no solid in the way, it says so with the gap as it is, since the graph reckons a jump's reach
 * with a full run up that a small floor may not give.
 */
function gapClausesHigh(graph: HighGraph, a: number, b: number, name: (id: HandleId) => string, tried: boolean): { gap: string; reach: string } {
  const A = graph.placeOf(a)
  const B = graph.placeOf(b)
  const up = B.y - A.y
  const fa = graph.floorOf(a)
  const fb = graph.floorOf(b)
  const dist = Math.sqrt((B.x - A.x) ** 2 + (B.z - A.z) ** 2)
  const apart = fa !== null && fb !== null ? footsApart(fa, fb, A.x, A.z) : { gap: Math.max(0, dist - GRAPH.column), x: A.x, z: A.z }
  const from = placeHigh(apart.gap > 0 ? apart.x : A.x, A.y, apart.gap > 0 ? apart.z : A.z)
  const gap =
    apart.gap === 0 && up > 0
      ? `from ${placeHigh(A.x, A.y, A.z)} the floor above, at ${placeHigh(B.x, B.y, B.z)}, is ${tenth(up)} m up`
      : `the gap from ${from} is ${tenth(apart.gap)} m across and ${tenth(Math.abs(up))} m ${up >= 0 ? 'up' : 'down'}`
  if (up > A.rise + 1e-6) return { gap, reach: A.rise < apex(A.vy, A.g) - 1e-6 ? `a jump there rises only ${tenth(A.rise)} m before the head meets what is above` : `a jump lifts the feet ${tenth(A.rise)} m` }
  const reach = reachUnder(up, A.vy, Math.max(A.g, B.g), A.rise)
  const carries = `a jump carries the feet ${Math.floor((reach + 2 * graph.foot) * 10 + 1e-6) / 10} m across at that height`
  if (apart.gap <= reach + 2 * graph.foot + 1e-6) {
    // Near enough and low enough for a jump: something between stops it, as a wall does.
    const between = `between ${placeHigh(A.x, A.y, A.z)} and ${placeHigh(B.x, B.y, B.z)}`
    const wall = wallBetweenHigh(graph, A, B)
    if (wall === null && tried) return { gap, reach: `no jump the bot tried landed on it, though ${apart.gap === 0 && up > 0 ? `a jump lifts the feet ${tenth(A.rise)} m` : carries} with a run up` }
    const stands = wall === null ? 'something stops every jump across' : `${name(wall.id)} (x ${tenth(wall.x0)} to ${tenth(wall.x1)}, z ${tenth(wall.z0)} to ${tenth(wall.z1)}) stands up to y ${tenth(wall.top)}`
    return { gap: `${between} ${stands}`, reach: `a jump lifts the feet ${tenth(A.rise)} m` }
  }
  return { gap, reach: carries }
}

/** The solid in the way on the floor between two places, standing over the higher of them: the one whose top is highest, with its footprint's box and its top; null when none is. */
function wallBetweenHigh(graph: HighGraph, A: { x: number; y: number; z: number }, B: { x: number; y: number; z: number }): { id: HandleId; x0: number; x1: number; z0: number; z1: number; top: number } | null {
  const sim = graph.now
  const floor = Math.max(A.y, B.y)
  const dist = Math.sqrt((B.x - A.x) ** 2 + (B.z - A.z) ** 2)
  const steps = Math.max(1, Math.ceil(dist / 0.1))
  let wall: { id: HandleId; x0: number; x1: number; z0: number; z1: number; top: number } | null = null
  const hw = playerWidth(graph.self) / 2
  for (let i = 0; i < sim.world.solids.length; i++) {
    const s = sim.world.solids[i]
    const o = sim.outlines[i]
    if (!solidActive(sim, s) || s.surface.through || o.y1 <= floor + FEEL.stepUp || o.y0 >= floor + FEEL.height) continue
    let crosses = false
    for (let k = 0; k <= steps && !crosses; k++) {
      const x = A.x + ((B.x - A.x) * k) / steps
      const z = A.z + ((B.z - A.z) * k) / steps
      crosses = solidInBox3(sim, i, x - hw, floor + FEEL.stepUp, z - hw, x + hw, floor + FEEL.height, z + hw)
    }
    if (crosses && (wall === null || o.y1 > wall.top)) wall = { id: s.id, x0: o.minX, x1: o.maxX, z0: o.minY, z1: o.maxY, top: o.y1 }
  }
  return wall
}

/**
 * Why there is no way from node `from` to the goal from high up: the nearest missing edge between
 * what the bot can reach and what reaches the goal (`dist` finite), each pair weighed by how far a
 * jump falls short of it. Only edge spots and moving solids are weighed: a missing edge is always
 * between two of them. When nothing reaches the goal at all, a solid under the goal's place `under`
 * (x, z) whose top leaves less than a body's height under the room's top is named, as nobody stands
 * on it.
 */
export function missingEdgeHigh(graph: HighGraph, from: number, dist: Float64Array, name: (id: HandleId) => string, under: readonly [number, number]): { gap: string; reach: string } {
  const reachable = graph.reached(from)
  const ends = (keep: (n: number) => boolean) => {
    const out: number[] = []
    for (let n = 0; n < graph.size; n++) if (keep(n) && (n >= graph.spots.length || graph.edge[n] === 1)) out.push(n)
    return out
  }
  const mine = ends((n) => reachable[n] === 1)
  const theirs = ends((n) => reachable[n] !== 1 && Number.isFinite(dist[n]))
  // Where the bot is, so that of missing edges alike the one nearest it is named.
  const at = from >= 0 ? graph.placeOf(from) : null
  let best: { a: number; b: number; short: number } | null = null
  for (const a of mine) {
    const A = graph.placeOf(a)
    const away = at === null ? 0 : Math.sqrt((A.x - at.x) ** 2 + (A.z - at.z) ** 2)
    for (const b of theirs) {
      const B = graph.placeOf(b)
      const up = B.y - A.y
      const across = Math.max(0, Math.sqrt((B.x - A.x) ** 2 + (B.z - A.z) ** 2) - GRAPH.column)
      const reach = up > A.rise ? 0 : Math.max(0, reachUnder(up, A.vy, Math.max(A.g, B.g), A.rise))
      const short = Math.max(0, up - A.rise) * 2 + Math.max(0, across - reach) + 0.01 * across + 0.001 * away
      if (best === null || short < best.short) best = { a, b, short }
    }
  }
  if (best === null) {
    const sim = graph.now
    const tall = playerHeight(graph.self)
    let low: { id: HandleId; top: number } | null = null
    for (let i = 0; i < sim.world.solids.length; i++) {
      const s = sim.world.solids[i]
      const o = sim.outlines[i]
      if (s.house || !solidActive(sim, s) || s.surface.through || ROOM.high.height - o.y1 >= tall) continue
      if (under[0] < o.minX || under[0] > o.maxX || under[1] < o.minY || under[1] > o.maxY) continue
      if (low === null || o.y1 > low.top) low = { id: s.id, top: o.y1 }
    }
    if (low !== null) return { gap: `${name(low.id)} tops out at y ${tenth(low.top)}, under the room's top at ${ROOM.high.height}`, reach: `a player needs ${Math.round(tall * 100) / 100} m over a top to stand on it` }
    return {
      gap: 'nothing near it can be stood on',
      reach: `a jump lifts the feet ${tenth(graph.jumpHigh)} m and carries them ${Math.floor((reachAcross(0, graph.vyJump, FEEL.gravity) + 2 * graph.foot) * 10 + 1e-6) / 10} m across`,
    }
  }
  return gapClausesHigh(graph, best.a, best.b, name, graph.dropped.has(best.b))
}

/** Why the search could not go on from node `from` though the graph has a way: the first edge of that way that is not a walk (a jump, or boarding a solid that moves), which the bot's real moves could not make. */
export function nextEdgeHigh(graph: HighGraph, from: number, dist: Float64Array, name: (id: HandleId) => string, under: readonly [number, number]): { gap: string; reach: string } {
  let a = from
  for (let k = 0; a >= 0 && dist[a] > 0 && k < graph.size; k++) {
    let best: Edge | null = null
    for (const e of graph.out[a]) if (best === null || e.cost + dist[e.to] < best.cost + dist[best.to]) best = e
    if (best === null || !Number.isFinite(best.cost + dist[best.to])) break
    if (a >= graph.spots.length || best.to >= graph.spots.length || !graph.walks(a, best.to)) return gapClausesHigh(graph, a, best.to, name, true)
    a = best.to
  }
  return missingEdgeHigh(graph, from, dist, name, under)
}

