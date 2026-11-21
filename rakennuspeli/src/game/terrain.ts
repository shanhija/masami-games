/**
 * The ground: making the valley, reading it, digging, spilling, the blade, rolling and
 * settling. Pure numbers over the arrays of `Terrain`. Every change goes through `write`, which
 * wears the grass by how much stuff moved, bumps the chunk versions and puts the point and its neighbours on the
 * settling list, so the scene redraws what changed and slopes steeper than REPOSE slump.
 */

import { HOLES, READY_ROADS, RIVER, ROAD_WIDTH, ROADS, ROCK_PILE, SAND_HILL, SANDPIT } from './map'
import { BEDROCK, CELL, CHUNK, CHUNKS, GRID, HALF, LOOSE_INDEX, LOOSE_KINDS, POINT_AREA, REPOSE, ROAD_Y, SIDE, SURFACE_INDEX } from './model'
import type { LooseKind, Pond, SurfaceKind, Terrain, Zone } from './model'
import { clamp, clamp01, smooth } from './math'

/** Points `tick` lets `settle` visit each frame. */
export const SETTLE_BUDGET = 300

/** Loose stuff thinner than this counts as none. */
const MIN_STUFF = 1e-6
/** How much of a too-steep step one point passes on in one visit. */
const SLUMP = 0.25
/** How fast a roller packs a road-bed point: `rolled` per second. */
const ROLL_RATE = 2
/** How far behind the blade's face (in blade depths) it still gathers what slumps back, as if the pile were held by the blade. */
const BEHIND = 1.5
/** The drum's length along its way, metres. */
const ROLL_LENGTH = 3
/** The grassy bank of the river, metres wide: the bed drops from ground level to the floor over it, gentler than REPOSE. */
const BANK = 3.2
/** The grass edge is a smooth field, 0.5 on the rim: it goes from 0 to 1 over this many metres across the rim. */
const TURF_FADE = 1
/** Grass lost per metre of stuff a point gains or loses, so a dig clears the grass where it moves more than a couple of centimetres. */
const WEAR = 20

/** A round or a rectangular place on the ground. */
export type Shape = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'rect'; x: number; z: number; w: number; d: number }

const NB_DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const NB_DZ = [-1, -1, -1, 0, 0, 1, 1, 1]
const NB_OFFSET = Int32Array.from(NB_DX.map((dx, k) => dx + NB_DZ[k] * SIDE))
/** The rise over which a neighbour counts as too steep. */
const NB_RISE = Float64Array.from(NB_DX.map((dx, k) => REPOSE * CELL * Math.hypot(dx, NB_DZ[k])))

// Scratch: each call that uses these clears or empties them before and after, so nothing carries between calls.
const takenBy = new Float64Array(LOOSE_KINDS.length)
const marked = new Uint8Array(SIDE * SIDE)
const stripPoints: number[] = []
const weights: number[] = []

const worldX = (ix: number) => ix * CELL - HALF

/** The kind of which most was counted in `takenBy`: dirt when nothing was. */
function topKind(): number {
  let best = 0
  for (let k = 1; k < takenBy.length; k++) if (takenBy[k] > takenBy[best]) best = k
  return best
}

/** Slight lumps in the height, far under the repose slope. */
const lump = (x: number, z: number) => 0.08 * (0.6 * Math.sin(x * 0.45 + 1.1) * Math.sin(z * 0.37 + 0.4) + 0.4 * Math.sin(x * 0.2 - z * 0.23 + 2))

/** Depth of a bowl `depth` deep and `r` wide, `d` from its middle. */
const bowl = (r: number, depth: number, d: number) => depth * smooth(r, r * 0.35, d)

/** Where a point is along a straight road and how far to one side of it. */
function alongRoad(road: { ax: number; az: number; bx: number; bz: number }, x: number, z: number) {
  const len = Math.hypot(road.bx - road.ax, road.bz - road.az)
  const ux = (road.bx - road.ax) / len
  const uz = (road.bz - road.az) / len
  const dx = x - road.ax
  const dz = z - road.az
  return { along: dx * ux + dz * uz, across: Math.abs(-dx * uz + dz * ux), len }
}

/** The grass at signed distance `sd` from a rim, negative inside it: a smooth ramp that is 0.5 on the rim. */
const turfAt = (sd: number) => clamp01(0.5 + sd / TURF_FADE)

/** The pits and the sandpit, every one a bowl in the ground. */
const BOWLS = [...HOLES, SANDPIT]

/** The valley of map.ts as one made from nothing, which takes tens of milliseconds. */
function makeTerrain(): Terrain {
  const n = SIDE * SIDE
  const t: Terrain = {
    hard: new Float32Array(n).fill(BEDROCK),
    loose: new Float32Array(n).fill(-BEDROCK),
    kind: new Uint8Array(n),
    turf: new Float32Array(n).fill(1),
    surface: new Uint8Array(n),
    bed: new Int8Array(n).fill(-1),
    rolled: new Float32Array(n),
    version: new Uint32Array(CHUNKS * CHUNKS),
    settling: new Int32Array(n),
    settlingCount: 0,
    isSettling: new Uint8Array(n),
    packed: 0,
  }
  for (let iz = 0; iz < SIDE; iz++) {
    const z = worldX(iz)
    for (let ix = 0; ix < SIDE; ix++) {
      const x = worldX(ix)
      const i = ix + iz * SIDE
      let hard = BEDROCK
      let loose = -BEDROCK
      let kind = LOOSE_INDEX.dirt
      let surface = SURFACE_INDEX.soft
      let flat = false
      let turf = 1
      // A road's grass edge lies half a cell outside its last point, so the rim is straight and the road keeps its width.
      const roadTurf = (r: ReturnType<typeof alongRoad>) => turfAt(Math.max(r.across - ROAD_WIDTH / 2, -r.along, r.along - r.len) - CELL / 2)
      for (const road of READY_ROADS) {
        const r = alongRoad(road, x, z)
        turf = Math.min(turf, roadTurf(r))
        if (r.along >= -1e-6 && r.along <= r.len + 1e-6 && r.across <= ROAD_WIDTH / 2 + 1e-6) {
          hard = ROAD_Y
          loose = 0
          surface = SURFACE_INDEX.road
          flat = true
        }
      }
      for (let k = 0; k < ROADS.length; k++) {
        const r = alongRoad(ROADS[k], x, z)
        turf = Math.min(turf, roadTurf(r))
        if (!flat && t.bed[i] < 0 && r.along >= -1e-6 && r.along <= r.len + 1e-6 && r.across <= ROAD_WIDTH / 2 + 1e-6) t.bed[i] = k
      }
      if (t.bed[i] >= 0) flat = true
      if (z >= RIVER.z0 && z <= RIVER.z1) {
        const m = Math.min(z - RIVER.z0, RIVER.z1 - z)
        const s = RIVER.floor * clamp01(m / BANK)
        if (s > BEDROCK) loose = s - BEDROCK
        else {
          hard = s
          loose = 0
          surface = SURFACE_INDEX.riverbed
        }
        turf = Math.min(turf, clamp01(1 - m / 1.5))
        flat = true
      }
      if (!flat) loose += lump(x, z)
      const sand = SAND_HILL.h * smooth(SAND_HILL.r, SAND_HILL.r * 0.35, Math.hypot(x - SAND_HILL.x, z - SAND_HILL.z))
      const rock = ROCK_PILE.h * smooth(ROCK_PILE.r, ROCK_PILE.r * 0.35, Math.hypot(x - ROCK_PILE.x, z - ROCK_PILE.z))
      loose += sand + rock
      if (sand > 0) kind = LOOSE_INDEX.sand
      if (rock > 0) kind = LOOSE_INDEX.rock
      turf = Math.min(turf, turfAt(Math.hypot(x - SAND_HILL.x, z - SAND_HILL.z) - SAND_HILL.r), turfAt(Math.hypot(x - ROCK_PILE.x, z - ROCK_PILE.z) - ROCK_PILE.r))
      for (const h of BOWLS) {
        const cut = bowl(h.r, h.depth, Math.hypot(x - h.x, z - h.z))
        if (cut > 0) loose -= cut
        turf = Math.min(turf, turfAt(Math.hypot(x - h.x, z - h.z) - h.r))
      }
      t.turf[i] = turf
      t.hard[i] = hard
      t.loose[i] = loose
      t.kind[i] = kind
      t.surface[i] = surface
    }
  }
  return t
}

/** The valley as first made, never handed out: every `createTerrain` after the first copies it. */
let valley: Terrain | null = null

/** The valley of map.ts. Heaps and bowls are gentler than REPOSE, so nothing settles until touched. The first call makes it, the later ones copy it (a copy takes a fraction of a millisecond, so a job that wants an untouched valley to measure against never stalls a frame). */
export function createTerrain(): Terrain {
  valley ??= makeTerrain()
  return {
    hard: valley.hard.slice(),
    loose: valley.loose.slice(),
    kind: valley.kind.slice(),
    turf: valley.turf.slice(),
    surface: valley.surface.slice(),
    bed: valley.bed.slice(),
    rolled: valley.rolled.slice(),
    version: valley.version.slice(),
    settling: valley.settling.slice(),
    settlingCount: valley.settlingCount,
    isSettling: valley.isSettling.slice(),
    packed: valley.packed,
  }
}

// ---------------------------------------------------------------------------------------
// Reading.

function bilinear(a: Float32Array, x: number, z: number): number {
  const fx = clamp((x + HALF) / CELL, 0, GRID)
  const fz = clamp((z + HALF) / CELL, 0, GRID)
  const ix = Math.min(Math.floor(fx), GRID - 1)
  const iz = Math.min(Math.floor(fz), GRID - 1)
  const tx = fx - ix
  const tz = fz - iz
  const i = ix + iz * SIDE
  return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - tz) + (a[i + SIDE] * (1 - tx) + a[i + SIDE + 1] * tx) * tz
}

/** The surface height, bilinear; clamped beyond the edge. */
export function heightAt(t: Terrain, x: number, z: number): number {
  return bilinear(t.hard, x, z) + bilinear(t.loose, x, z)
}

/** Metres of loose stuff, bilinear. */
export function looseAt(t: Terrain, x: number, z: number): number {
  return bilinear(t.loose, x, z)
}

/** The kind of loose stuff at the nearest point. */
export function kindAt(t: Terrain, x: number, z: number): LooseKind {
  const ix = clamp(Math.round((x + HALF) / CELL), 0, GRID)
  const iz = clamp(Math.round((z + HALF) / CELL), 0, GRID)
  return LOOSE_KINDS[t.kind[ix + iz * SIDE]]
}

/** Cubic metres of loose stuff on the whole ground. With `packed` and what machines hold it stays the same. */
export function looseVolume(t: Terrain): number {
  let sum = 0
  for (let i = 0; i < t.loose.length; i++) sum += t.loose[i]
  return sum * POINT_AREA
}

/** Calls `fn(i, d2)` for every point in the shape, d2 being the squared distance from its middle. */
function forShape(shape: Shape, fn: (i: number, d2: number) => void): void {
  const hw = shape.kind === 'circle' ? shape.r : shape.w / 2
  const hd = shape.kind === 'circle' ? shape.r : shape.d / 2
  const ix0 = Math.max(0, Math.ceil((shape.x - hw + HALF) / CELL - 1e-9))
  const ix1 = Math.min(GRID, Math.floor((shape.x + hw + HALF) / CELL + 1e-9))
  const iz0 = Math.max(0, Math.ceil((shape.z - hd + HALF) / CELL - 1e-9))
  const iz1 = Math.min(GRID, Math.floor((shape.z + hd + HALF) / CELL + 1e-9))
  for (let iz = iz0; iz <= iz1; iz++) {
    const dz = worldX(iz) - shape.z
    for (let ix = ix0; ix <= ix1; ix++) {
      const dx = worldX(ix) - shape.x
      const d2 = dx * dx + dz * dz
      if (shape.kind === 'rect' || d2 <= shape.r * shape.r + 1e-9) fn(ix + iz * SIDE, d2)
    }
  }
}

/** Calls `fn(i, along, across)` for every point in a strip from `a0` (kept) to `a1` (not kept) along the unit direction, `half` to either side. */
function forStrip(cx: number, cz: number, dirX: number, dirZ: number, a0: number, a1: number, half: number, fn: (i: number, along: number, across: number) => void): void {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const a of [a0, a1]) {
    for (const s of [-half, half]) {
      const px = cx + dirX * a - dirZ * s
      const pz = cz + dirZ * a + dirX * s
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minZ = Math.min(minZ, pz)
      maxZ = Math.max(maxZ, pz)
    }
  }
  const ix0 = Math.max(0, Math.ceil((minX + HALF) / CELL))
  const ix1 = Math.min(GRID, Math.floor((maxX + HALF) / CELL))
  const iz0 = Math.max(0, Math.ceil((minZ + HALF) / CELL))
  const iz1 = Math.min(GRID, Math.floor((maxZ + HALF) / CELL))
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const dx = worldX(ix) - cx
      const dz = worldX(iz) - cz
      const along = dx * dirX + dz * dirZ
      const across = -dx * dirZ + dz * dirX
      if (along >= a0 && along < a1 && Math.abs(across) <= half) fn(ix + iz * SIDE, along, across)
    }
  }
}

// ---------------------------------------------------------------------------------------
// Writing: the one helper.

/**
 * Sets everything a point holds. A point that lost or gained stuff wears its grass by that much and goes on
 * the settling list with its neighbours. Any change bumps the version of every chunk whose
 * vertex range, grown by one point, contains the point (up to 4), so normals agree across borders.
 */
function write(t: Terrain, i: number, hard: number, loose: number, kind: number, surface: number, rolled: number): void {
  const moved = Math.abs(hard - t.hard[i]) + Math.abs(loose - t.loose[i])
  const stuff = moved > 0
  if (!stuff && kind === t.kind[i] && surface === t.surface[i] && rolled === t.rolled[i]) return
  t.hard[i] = hard
  t.loose[i] = loose
  t.kind[i] = kind
  t.surface[i] = surface
  t.rolled[i] = rolled
  const ix = i % SIDE
  const iz = (i - ix) / SIDE
  const cx0 = Math.max(0, Math.ceil((ix - CHUNK - 1) / CHUNK))
  const cx1 = Math.min(CHUNKS - 1, Math.floor((ix + 1) / CHUNK))
  const cz0 = Math.max(0, Math.ceil((iz - CHUNK - 1) / CHUNK))
  const cz1 = Math.min(CHUNKS - 1, Math.floor((iz + 1) / CHUNK))
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) t.version[cx + cz * CHUNKS]++
  if (!stuff) return
  t.turf[i] = Math.max(0, t.turf[i] - moved * WEAR)
  for (let dz = -1; dz <= 1; dz++) {
    const nz = iz + dz
    if (nz < 0 || nz > GRID) continue
    for (let dx = -1; dx <= 1; dx++) {
      const nx = ix + dx
      if (nx < 0 || nx > GRID) continue
      const q = nx + nz * SIDE
      if (t.isSettling[q] === 0) {
        t.isSettling[q] = 1
        t.settling[t.settlingCount++] = q
      }
    }
  }
}

/** A point becomes road: its loose stuff is packed, the hard level rises to ROAD_Y. */
function becomeRoad(t: Terrain, i: number): void {
  t.packed += t.loose[i] * POINT_AREA
  write(t, i, ROAD_Y, 0, t.kind[i], SURFACE_INDEX.road, 1)
}

// ---------------------------------------------------------------------------------------
// Digging, spilling, pushing, rolling, settling.

/** Removes up to `volume` within `r`, weighted to the middle, never below the hard level. Returns what came and the kind of most of it. */
export function take(t: Terrain, x: number, z: number, r: number, volume: number): { amount: number; kind: LooseKind } {
  if (volume < 0) throw new Error(`take: negative volume ${volume}`)
  const shape: Shape = { kind: 'circle', x: clamp(x, -HALF, HALF), z: clamp(z, -HALF, HALF), r }
  const r2 = r * r
  takenBy.fill(0)
  let remaining = volume
  for (let pass = 0; pass < 6 && remaining > 1e-9; pass++) {
    let total = 0
    forShape(shape, (i, d2) => {
      if (t.loose[i] > MIN_STUFF) total += 1 - d2 / r2
    })
    if (total <= 0) break
    const share = remaining / total / POINT_AREA
    let got = 0
    forShape(shape, (i, d2) => {
      const l = t.loose[i]
      if (l <= MIN_STUFF) return
      const amt = Math.min(share * (1 - d2 / r2), l)
      if (amt <= 0) return
      write(t, i, t.hard[i], l - amt, t.kind[i], t.surface[i], t.rolled[i])
      got += amt * POINT_AREA
      takenBy[t.kind[i]] += amt * POINT_AREA
    })
    remaining -= got
  }
  return { amount: volume - remaining, kind: LOOSE_KINDS[topKind()] }
}

/** Adds `volume` within `r`, weighted to the middle. Every point it touches takes on `kind`. */
export function spill(t: Terrain, x: number, z: number, r: number, volume: number, kind: LooseKind): void {
  if (volume < 0) throw new Error(`spill: negative volume ${volume}`)
  if (volume === 0) return
  const shape: Shape = { kind: 'circle', x: clamp(x, -HALF, HALF), z: clamp(z, -HALF, HALF), r }
  const r2 = r * r
  stripPoints.length = 0
  weights.length = 0
  let total = 0
  forShape(shape, (i, d2) => {
    stripPoints.push(i)
    weights.push(1 - d2 / r2)
    total += 1 - d2 / r2
  })
  if (total <= 0) throw new Error(`spill: no ground points within ${r} m of ${x}, ${z}`)
  const share = volume / total / POINT_AREA
  for (let k = 0; k < stripPoints.length; k++) {
    const i = stripPoints[k]
    if (weights[k] > 0) write(t, i, t.hard[i], t.loose[i] + share * weights[k], LOOSE_INDEX[kind], t.surface[i], t.rolled[i])
  }
}

/**
 * The blade at (cx, cz) facing the unit direction (dirX, dirZ): a box `2 * depth` long in front of
 * it and `width` wide. Every point in the box gives what stands above `y` (never more than its
 * loose stuff), and all of it lands evenly on the box's far three quarters. The pile therefore
 * keeps its place in front of the blade and travels with it, whatever the speed; the back quarter
 * is always swept bare. Returns the volume gathered.
 */
export function bladePush(t: Terrain, cx: number, cz: number, dirX: number, dirZ: number, width: number, depth: number, y: number): number {
  const half = width / 2
  let ahead = 0
  forStrip(cx, cz, dirX, dirZ, depth / 2, 2 * depth, half, () => {
    ahead++
  })
  if (ahead === 0) return 0
  takenBy.fill(0)
  let moved = 0
  forStrip(cx, cz, dirX, dirZ, -BEHIND * depth, 2 * depth, half, (i) => {
    const excess = Math.min(t.hard[i] + t.loose[i] - y, t.loose[i])
    if (excess <= 1e-4) return
    write(t, i, t.hard[i], t.loose[i] - excess, t.kind[i], t.surface[i], t.rolled[i])
    moved += excess * POINT_AREA
    takenBy[t.kind[i]] += excess * POINT_AREA
  })
  if (moved <= 0) return 0
  const kind = topKind()
  const each = moved / ahead / POINT_AREA
  forStrip(cx, cz, dirX, dirZ, depth / 2, 2 * depth, half, (i) => write(t, i, t.hard[i], t.loose[i] + each, kind, t.surface[i], t.rolled[i]))
  return moved
}

/**
 * The drum at (x, z) rolling along the unit direction over a strip `width` wide: what lies
 * under it flattens toward the local mean (stuff only moves between points of the strip), and
 * road-bed points under it get `rolled` up by `dt`. At 1 a point becomes road. Returns how many
 * points turned to road in this call.
 */
export function rollOver(t: Terrain, x: number, z: number, dirX: number, dirZ: number, width: number, dt: number): number {
  stripPoints.length = 0
  forStrip(x, z, dirX, dirZ, -ROLL_LENGTH / 2, ROLL_LENGTH / 2, width / 2, (i) => {
    marked[i] = 1
    stripPoints.push(i)
  })
  const rate = Math.min(0.2, dt * 6)
  for (const p of stripPoints) {
    const ix = p % SIDE
    for (let k = 0; k < 2; k++) {
      if (k === 0 ? ix === GRID : p + SIDE >= t.loose.length) continue
      const q = k === 0 ? p + 1 : p + SIDE
      if (marked[q] === 0) continue
      const d = t.hard[p] + t.loose[p] - t.hard[q] - t.loose[q]
      const src = d > 0 ? p : q
      const dst = d > 0 ? q : p
      const a = Math.min(t.loose[src], Math.abs(d) * rate)
      if (a <= MIN_STUFF) continue
      write(t, src, t.hard[src], t.loose[src] - a, t.kind[src], t.surface[src], t.rolled[src])
      write(t, dst, t.hard[dst], t.loose[dst] + a, t.kind[src], t.surface[dst], t.rolled[dst])
    }
  }
  let turned = 0
  for (const i of stripPoints) {
    marked[i] = 0
    if (t.bed[i] < 0 || t.rolled[i] >= 1) continue
    const rolled = Math.min(1, t.rolled[i] + dt * ROLL_RATE)
    if (rolled >= 1) {
      becomeRoad(t, i)
      turned++
    } else write(t, i, t.hard[i], t.loose[i], t.kind[i], t.surface[i], rolled)
  }
  return turned
}

/**
 * Visits up to `budget` points of the settling list. A point higher than a neighbour by more
 * than REPOSE * distance passes a quarter of the difference to it (never more than its loose
 * stuff); it and the points it fed stay on the list. A point with nothing to do leaves.
 */
export function settle(t: Terrain, budget: number): void {
  let i = 0
  let visited = 0
  while (i < t.settlingCount && visited < budget) {
    visited++
    const p = t.settling[i]
    const ix = p % SIDE
    const iz = (p - ix) / SIDE
    let worked = false
    for (let k = 0; k < 8; k++) {
      const nx = ix + NB_DX[k]
      const nz = iz + NB_DZ[k]
      if (nx < 0 || nx > GRID || nz < 0 || nz > GRID) continue
      const have = t.loose[p]
      if (have <= MIN_STUFF) break
      const q = p + NB_OFFSET[k]
      const d = t.hard[p] + have - t.hard[q] - t.loose[q]
      if (d <= NB_RISE[k]) continue
      const a = Math.min(have, d * SLUMP)
      if (a <= MIN_STUFF) continue
      write(t, p, t.hard[p], have - a, t.kind[p], t.surface[p], t.rolled[p])
      write(t, q, t.hard[q], t.loose[q] + a, t.kind[p], t.surface[q], t.rolled[q])
      worked = true
    }
    if (worked) i++
    else {
      t.isSettling[p] = 0
      t.settling[i] = t.settling[--t.settlingCount]
    }
  }
}

// ---------------------------------------------------------------------------------------
// Measuring a zone.

/** Cubic metres of stuff standing above `level` in the zone, never counting the hard ground. */
export function surplusIn(t: Terrain, zone: Zone, level: number): number {
  let sum = 0
  forShape({ kind: 'circle', ...zone }, (i) => {
    sum += Math.min(Math.max(0, t.hard[i] + t.loose[i] - level), t.loose[i])
  })
  return sum * POINT_AREA
}

/** Cubic metres of room below `level` in the zone. */
export function deficitIn(t: Terrain, zone: Zone, level: number): number {
  let sum = 0
  forShape({ kind: 'circle', ...zone }, (i) => {
    sum += Math.max(0, level - t.hard[i] - t.loose[i])
  })
  return sum * POINT_AREA
}

/** The water's height: from the pool's lowest point to its rim (the ground just around it) by `p.water`. */
export function pondY(t: Terrain, p: Pond): number {
  let low = Infinity
  forShape({ kind: 'circle', x: p.x, z: p.z, r: p.r }, (i) => {
    low = Math.min(low, t.hard[i] + t.loose[i])
  })
  let ring = 0
  let count = 0
  forShape({ kind: 'circle', x: p.x, z: p.z, r: p.r + 0.75 }, (i, d2) => {
    if (d2 < p.r * p.r) return
    ring += t.hard[i] + t.loose[i]
    count++
  })
  if (count === 0) throw new Error(`pond at ${p.x}, ${p.z} has no rim on the ground`)
  return low + (Math.max(ring / count, low) - low) * p.water
}

// ---------------------------------------------------------------------------------------
// Stamps: what jobs do to the world. Not part of the law of conservation.

/** Sets the surface to height `y`: as loose stuff on the hard level, or, with 'hard', as bare hard ground with no stuff. Below the hard level either way lowers it. */
export function levelShape(t: Terrain, shape: Shape, y: number, ground: 'loose' | 'hard'): void {
  forShape(shape, (i) => {
    if (ground === 'hard' || y < t.hard[i]) write(t, i, y, 0, t.kind[i], t.surface[i], t.rolled[i])
    else write(t, i, t.hard[i], y - t.hard[i], t.kind[i], t.surface[i], t.rolled[i])
  })
}

/** Sets what the hard level looks like in the shape. */
export function setSurface(t: Terrain, shape: Shape, surface: SurfaceKind): void {
  forShape(shape, (i) => write(t, i, t.hard[i], t.loose[i], t.kind[i], SURFACE_INDEX[surface], t.rolled[i]))
}

/** Cuts a bowl `depth` deep and `r` wide out of the loose stuff, the same shape as the map's holes. */
export function cutBowl(t: Terrain, x: number, z: number, r: number, depth: number): void {
  forShape({ kind: 'circle', x, z, r }, (i, d2) => {
    const cut = bowl(r, depth, Math.sqrt(d2))
    if (cut > 0) write(t, i, t.hard[i], Math.max(0, t.loose[i] - cut), t.kind[i], t.surface[i], t.rolled[i])
  })
}

/** Every bed point of road `road` becomes road, as if it had been rolled: for restoring a save. */
export function markRoadBuilt(t: Terrain, road: number): void {
  for (let i = 0; i < t.bed.length; i++) if (t.bed[i] === road && t.rolled[i] < 1) becomeRoad(t, i)
}
