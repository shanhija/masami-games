/**
 * Finding a way round the room's solid things. A solid thing is a circle on the ground
 * (world.ts's Solid), and a walker of radius r keeps r from each. Over the room lies a grid of
 * CELL squares, and a field says for each square how far it is from the nearest thing's edge
 * and from the second nearest. The field is made once for a set of things and kept, so one
 * field serves every walker whatever its size, and every goal: the thing walked to is left out
 * by taking the second nearest where it is the nearest. For each size of walker the field gives
 * a grid of where it can stand and which open squares reach each other, kept too. A* on the grid
 * finds the way, which is then pulled straight wherever the line between two of its spots is
 * clear, so a walker goes straight and turns only beside things. A goal that cannot be reached
 * gives the way to the nearest spot that can. A way takes about a twentieth of a millisecond to
 * find, a new field a tenth and a grid for a new size a third; walkers plan only when the goal
 * is out of sight (runtime.ts). The single step a walker takes each frame, round the actors in
 * its way, is here too.
 */

import { ROOM_HALF } from './types'

/** A circle on the ground: a solid thing's footprint, or an actor's. */
export interface Circle {
  x: number
  z: number
  r: number
}

export interface Point {
  x: number
  z: number
}

/** A grid square's side, metres. */
export const CELL = 0.2
/** Squares along a side of the room. */
const N = Math.round((2 * ROOM_HALF) / CELL)
/** How far from things the field measures: no walker plans as wider than this. */
const CAP = 2.5
/** A planned way keeps this much more than the walker's radius from things, and a clear line half of it. */
export const MARGIN = 0.04

const centre = (i: number) => -ROOM_HALF + (i + 0.5) * CELL
const index = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + ROOM_HALF) / CELL)))

/** What a set of things leaves free, square by square. */
export interface Field {
  readonly key: string
  readonly solids: readonly Circle[]
  /** From each square's middle to the nearest thing's edge (less than 0 inside it), at most CAP. */
  readonly first: Float32Array
  /** To the second nearest thing's edge. */
  readonly second: Float32Array
  /** Which thing is the nearest, or -1. */
  readonly nearest: Int16Array
  /** Grids made from it for walkers of a size, kept (see gridFor). */
  readonly grids: Map<string, Grid>
}

/** Where a walker of one size can stand, by the things (one maybe left out) and the room's edge. */
interface Grid {
  /** 1 where it cannot stand, 0 where it can. */
  blocked: Uint8Array
  /** The open region each square it can stand on is in, from 1; squares in one region reach each other. 0 where blocked. */
  region: Int32Array
}

function makeField(key: string, solids: Circle[]): Field {
  const first = new Float32Array(N * N).fill(CAP)
  const second = new Float32Array(N * N).fill(CAP)
  const nearest = new Int16Array(N * N).fill(-1)
  solids.forEach((s, k) => {
    // Only the squares the thing can be nearest to within CAP.
    const out = s.r + CAP
    const i1 = index(s.x + out)
    const j0 = index(s.z - out)
    const j1 = index(s.z + out)
    for (let i = index(s.x - out); i <= i1; i++) {
      const dx = centre(i) - s.x
      for (let j = j0; j <= j1; j++) {
        const dz = centre(j) - s.z
        const d = Math.sqrt(dx * dx + dz * dz) - s.r
        const c = i * N + j
        if (d < first[c]!) {
          second[c] = first[c]!
          first[c] = d
          nearest[c] = k
        } else if (d < second[c]!) second[c] = d
      }
    }
  })
  return { key, solids, first, second, nearest, grids: new Map() }
}

/** The last few fields made, newest last: the same things give the same field. */
const fields = new Map<string, Field>()
const KEEP_FIELDS = 6

/** The field for these things, made now or kept from before. */
export function fieldFor(solids: readonly Circle[]): Field {
  let key = ''
  for (const s of solids) key += `${s.x.toFixed(2)},${s.z.toFixed(2)},${s.r.toFixed(2)};`
  let f = fields.get(key)
  if (f !== undefined) {
    fields.delete(key)
    fields.set(key, f)
    return f
  }
  f = makeField(
    key,
    solids.map((s) => ({ x: s.x, z: s.z, r: s.r })),
  )
  fields.set(key, f)
  if (fields.size > KEEP_FIELDS) fields.delete(fields.keys().next().value!)
  return f
}

// ------------------------------------------------------------------------------ clear lines

/** Whether the line from a to b keeps R from c. Starting inside, going out is clear: the line never comes back in. */
function passes(c: Circle, R: number, a: Point, b: Point): boolean {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const acx = c.x - a.x
  const acz = c.z - a.z
  const L2 = abx * abx + abz * abz
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, (acx * abx + acz * abz) / L2)) : 0
  const dx = a.x + abx * t - c.x
  const dz = a.z + abz * t - c.z
  if (dx * dx + dz * dz >= R * R) return true
  return acx * acx + acz * acz < R * R && abx * acx + abz * acz <= 0
}

/**
 * Whether a walker of radius `me` can walk straight from a to b without coming nearer than its
 * radius and `margin` to any of the things but `skip`, or to any of the `extra` circles.
 */
export function clearLine(solids: readonly Circle[], skip: number, me: number, a: Point, b: Point, extra: readonly Circle[] = [], margin = MARGIN / 2): boolean {
  const pad = me + margin
  for (let k = 0; k < solids.length; k++) if (k !== skip && !passes(solids[k]!, solids[k]!.r + pad, a, b)) return false
  for (const e of extra) if (!passes(e, e.r + pad, a, b)) return false
  return true
}

// ------------------------------------------------------------------------------ the way

export interface Way {
  /** The spots to walk through after the start, in straight lines; the last is where the way ends. */
  points: Point[]
  /** Whether the way ends near enough the goal. If not, it ends as near as a walker can get. */
  reaches: boolean
  /** Its length in metres from the start. */
  length: number
}

export interface WayQuery {
  from: Point
  to: Point
  /** How near the goal's middle is near enough: its radius and the walker's, and how near the walker means to stop. */
  reach: number
  /** The walker's radius. */
  me: number
  /** The thing walked to (its index in the field's things), left out; or -1. */
  skip: number
  /** How far from the room's middle the walker may go, each way. */
  lim: number
  /** Actors to go round as well. */
  extra?: readonly Circle[]
}

/** A walker's size is rounded up to this for its grid, so walkers of about one size share one. */
const SIZE_STEP = 0.02
const KEEP_GRIDS = 12

/** The grid for a walker who needs `need` from things, may go `lo` squares from the edge at most, with thing `skip` left out: made now, or kept on the field. */
function gridFor(field: Field, need: number, skip: number, lo: number): Grid {
  const key = `${need.toFixed(2)}|${skip}|${lo}`
  let grid = field.grids.get(key)
  if (grid !== undefined) {
    field.grids.delete(key)
    field.grids.set(key, grid)
    return grid
  }
  const { first, second, nearest } = field
  const blocked = new Uint8Array(N * N)
  const hi = N - 1 - lo
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const c = i * N + j
      blocked[c] = i < lo || i > hi || j < lo || j > hi || (nearest[c] === skip ? second[c]! : first[c]!) < need ? 1 : 0
    }
  // Regions: squares joined side to side (A* goes corner to corner only past two open sides, so that joins nothing more).
  const region = new Int32Array(N * N)
  let label = 0
  for (let c0 = 0; c0 < N * N; c0++) {
    if (blocked[c0] === 1 || region[c0] !== 0) continue
    region[c0] = ++label
    let top = 0
    stack[top++] = c0
    while (top > 0) {
      const c = stack[--top]!
      const i = (c / N) | 0
      const j = c - i * N
      if (i > 0 && blocked[c - N] === 0 && region[c - N] === 0) (region[c - N] = label), (stack[top++] = c - N)
      if (i < N - 1 && blocked[c + N] === 0 && region[c + N] === 0) (region[c + N] = label), (stack[top++] = c + N)
      if (j > 0 && blocked[c - 1] === 0 && region[c - 1] === 0) (region[c - 1] = label), (stack[top++] = c - 1)
      if (j < N - 1 && blocked[c + 1] === 0 && region[c + 1] === 0) (region[c + 1] = label), (stack[top++] = c + 1)
    }
  }
  grid = { blocked, region }
  field.grids.set(key, grid)
  if (field.grids.size > KEEP_GRIDS) field.grids.delete(field.grids.keys().next().value!)
  return grid
}

// The search's scratch, kept between searches: a square counts as seen or done only for the search that marked it.
const stack = new Int32Array(N * N)
/** This search's grid: 0 open, 1 blocked, 2 inside a thing the walker starts inside (it may cross it to get out). */
const cells = new Uint8Array(N * N)
const g = new Float32Array(N * N)
const cameFrom = new Int32Array(N * N)
const seen = new Uint32Array(N * N)
const done = new Uint32Array(N * N)
let search = 0
/** Crossing a square of a thing it starts inside costs this many times an open one: it gets out the shortest way that leads on. */
const ESCAPE_COST = 8
/** A search round actors, or out of a thing, looks at most this many squares: the regions are the things' alone, so such a goal may be out of reach without the regions saying so. */
const BUDGET = 6000
/** The open squares, a binary heap by their estimate (a square met again by a shorter way is pushed again; the longer one is skipped). */
let heapCells = new Int32Array(4 * N)
let heapKeys = new Float64Array(4 * N)
let heapSize = 0

function push(c: number, key: number) {
  if (heapSize === heapCells.length) {
    const cs = new Int32Array(heapSize * 2)
    const ks = new Float64Array(heapSize * 2)
    cs.set(heapCells)
    ks.set(heapKeys)
    heapCells = cs
    heapKeys = ks
  }
  let k = heapSize++
  while (k > 0) {
    const up = (k - 1) >> 1
    if (heapKeys[up]! <= key) break
    heapCells[k] = heapCells[up]!
    heapKeys[k] = heapKeys[up]!
    k = up
  }
  heapCells[k] = c
  heapKeys[k] = key
}

function pop(): number {
  const top = heapCells[0]!
  const n = --heapSize
  if (n > 0) {
    const lastCell = heapCells[n]!
    const lastKey = heapKeys[n]!
    let k = 0
    for (;;) {
      const l = 2 * k + 1
      if (l >= n) break
      const m = l + 1 < n && heapKeys[l + 1]! < heapKeys[l]! ? l + 1 : l
      if (heapKeys[m]! >= lastKey) break
      heapCells[k] = heapCells[m]!
      heapKeys[k] = heapKeys[m]!
      k = m
    }
    heapCells[k] = lastCell
    heapKeys[k] = lastKey
  }
  return top
}

/** The eight steps from a square: across (x), along (z), and what each costs in metres. */
const STEP_I = [1, -1, 0, 0, 1, 1, -1, -1]
const STEP_J = [0, 0, 1, -1, 1, -1, 1, -1]
const STEP_COST = STEP_I.map((di, k) => (di !== 0 && STEP_J[k] !== 0 ? Math.SQRT2 : 1) * CELL)
/** The estimate counts this much more than the distance left: a little longer way, found looking at far fewer squares. */
const GREED = 1.3
/** A goal out of reach: a spot this much farther from it than the nearest will do, if it is nearer the walker. */
const NEARLY = 0.5

/**
 * The way from `from` to within `reach` of `to` round the things in the field (and the extra
 * circles), for a walker of radius `me`. Starting inside a thing (code put it there), the way
 * may cross that thing to get out, but dearly, so it leaves by the shortest way that leads on,
 * not into a pocket; starting inside an extra circle, it walks out of it any way. When the goal
 * cannot be reached, the way goes to the nearest spot that can, and says so: the regions tell
 * at once, so the search goes straight there. Null only when the walker has nowhere at all to
 * stand.
 */
export function findWay(field: Field, q: WayQuery): Way | null {
  if (++search >= 0xffffffff) {
    search = 1
    seen.fill(0)
    done.fill(0)
  }
  const need = Math.ceil(Math.min(q.me + MARGIN, CAP - 0.05) / SIZE_STEP) * SIZE_STEP
  const lo = Math.max(0, Math.ceil((ROOM_HALF - q.lim) / CELL - 0.5))
  const grid = gridFor(field, need, q.skip, lo)
  cells.set(grid.blocked)
  // Things it starts inside: their squares open, dearly, where nothing else blocks them.
  const solids = field.solids
  const inside: number[] = []
  for (let k = 0; k < solids.length; k++) if (k !== q.skip && Math.hypot(q.from.x - solids[k]!.x, q.from.z - solids[k]!.z) < solids[k]!.r + q.me) inside.push(k)
  for (const k of inside) {
    const s = solids[k]!
    const R = s.r + need
    const i1 = Math.min(N - 1 - lo, index(s.x + R))
    const j0 = Math.max(lo, index(s.z - R))
    const j1 = Math.min(N - 1 - lo, index(s.z + R))
    for (let i = Math.max(lo, index(s.x - R)); i <= i1; i++) {
      const x = centre(i)
      for (let j = j0; j <= j1; j++) {
        const z = centre(j)
        const c = i * N + j
        if (cells[c] !== 1 || (x - s.x) ** 2 + (z - s.z) ** 2 >= R * R) continue
        let ok = true
        for (let m = 0; m < solids.length && ok; m++) if (m !== q.skip && !inside.includes(m)) ok = Math.hypot(x - solids[m]!.x, z - solids[m]!.z) - solids[m]!.r >= need
        if (ok) cells[c] = 2
      }
    }
  }
  // Actors to go round, but not one it stands in.
  const extra = q.extra ?? []
  for (const e of extra) {
    if (Math.hypot(q.from.x - e.x, q.from.z - e.z) < e.r + q.me) continue
    const R = e.r + need
    const i1 = index(e.x + R)
    const j0 = index(e.z - R)
    const j1 = index(e.z + R)
    for (let i = index(e.x - R); i <= i1; i++) for (let j = j0; j <= j1; j++) if ((centre(i) - e.x) ** 2 + (centre(j) - e.z) ** 2 < R * R) cells[i * N + j] = 1
  }
  let start = index(q.from.x) * N + index(q.from.z)
  if (cells[start] === 1) {
    start = nearestFree(start)
    if (start < 0) return null
  }
  // The regions it can get to: its own, or those next to the thing it starts inside.
  const regions = new Set<number>()
  if (cells[start] === 0) regions.add(grid.region[start]!)
  else {
    let top = 0
    stack[top++] = start
    seen[start] = search
    while (top > 0) {
      const c = stack[--top]!
      const i = (c / N) | 0
      const j = c - i * N
      for (const n of [i > 0 ? c - N : -1, i < N - 1 ? c + N : -1, j > 0 ? c - 1 : -1, j < N - 1 ? c + 1 : -1]) {
        if (n < 0 || seen[n] === search || cells[n] === 1) continue
        seen[n] = search
        if (cells[n] === 0) regions.add(grid.region[n]!)
        else stack[top++] = n
      }
    }
    if (++search >= 0xffffffff) {
      search = 1
      seen.fill(0)
      done.fill(0)
    }
  }
  // Near enough the goal in a region it can get to; if there is no such square, the square nearest the goal that is.
  const region = q.reach + CELL * 0.5
  const near = (c: number) => {
    const i = (c / N) | 0
    return Math.hypot(centre(i) - q.to.x, centre(c - i * N) - q.to.z)
  }
  const ok = (c: number) => cells[c] === 0 && regions.has(grid.region[c]!)
  let target = -1
  {
    const i1 = index(q.to.x + region)
    const j0 = index(q.to.z - region)
    const j1 = index(q.to.z + region)
    for (let i = index(q.to.x - region); i <= i1 && target < 0; i++) for (let j = j0; j <= j1 && target < 0; j++) if (ok(i * N + j) && near(i * N + j) <= region) target = i * N + j
  }
  let reachable = target >= 0
  if (!reachable) {
    // Of the squares nearly as near the goal as the nearest, the one nearest the walker: up to a
    // thing on its own side, not round it for a few centimetres.
    let bestD = Infinity
    for (let c = 0; c < N * N; c++) if (ok(c)) bestD = Math.min(bestD, near(c))
    let fromD = Infinity
    for (let c = 0; c < N * N; c++) {
      if (!ok(c) || near(c) > bestD + NEARLY) continue
      const i = (c / N) | 0
      const d = Math.hypot(centre(i) - q.from.x, centre(c - i * N) - q.from.z)
      if (d < fromD) {
        fromD = d
        target = c
      }
    }
    // Nowhere open it can get to (it is inside a thing that fills its way out): the square it is on.
    if (target < 0) target = start
  }
  const ti = (target / N) | 0
  const tj = target - ti * N
  const tx = reachable ? q.to.x : centre(ti)
  const tz = reachable ? q.to.z : centre(tj)
  const stop = reachable ? region : CELL * 0.1
  const budget = extra.length > 0 || inside.length > 0 ? BUDGET : Infinity
  heapSize = 0
  g[start] = 0
  cameFrom[start] = -1
  seen[start] = search
  push(start, GREED * Math.max(0, Math.hypot(q.from.x - tx, q.from.z - tz) - stop))
  let best = start
  let bestAway = near(start)
  let end = -1
  for (let looked = 0; heapSize > 0 && looked < budget; looked++) {
    const c = pop()
    if (done[c] === search) continue
    done[c] = search
    const d = near(c)
    if (d < bestAway) {
      best = c
      bestAway = d
    }
    if (reachable ? d <= region : c === target) {
      end = c
      break
    }
    const i = (c / N) | 0
    const j = c - i * N
    for (let k = 0; k < 8; k++) {
      const ni = i + STEP_I[k]!
      const nj = j + STEP_J[k]!
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue
      const n = ni * N + nj
      if (done[n] === search || cells[n] === 1) continue
      // No squeezing between two things that touch at a corner.
      if (k >= 4 && (cells[ni * N + j] === 1 || cells[i * N + nj] === 1)) continue
      const ng = g[c]! + STEP_COST[k]! * (cells[n] === 2 ? ESCAPE_COST : 1)
      if (seen[n] === search && ng >= g[n]!) continue
      seen[n] = search
      g[n] = ng
      cameFrom[n] = c
      push(n, ng + GREED * Math.max(0, Math.hypot(centre(ni) - tx, centre(nj) - tz) - stop))
    }
  }
  // Round actors the regions may promise what the search could not find: it goes as near as it found.
  if (end < 0) end = best
  reachable = reachable && near(end) <= region
  const path: Point[] = []
  for (let c = end; c >= 0; c = cameFrom[c]!) {
    const i = (c / N) | 0
    path.push({ x: centre(i), z: centre(c - i * N) })
  }
  path.reverse()
  const points = pull([{ x: q.from.x, z: q.from.z }, ...path], field, q)
  let length = 0
  let prev: Point = q.from
  for (const p of points) {
    length += Math.hypot(p.x - prev.x, p.z - prev.z)
    prev = p
  }
  return { points, reaches: reachable, length }
}

/** The square nearest a square that is not blocked in this search, or -1: the rings round it, a little past the first ring with one. */
function nearestFree(c: number): number {
  const ci = (c / N) | 0
  const cj = c - ci * N
  let best = -1
  let bestD = Infinity
  let last = N
  for (let ring = 1; ring <= last; ring++) {
    for (let i = ci - ring; i <= ci + ring; i++) {
      if (i < 0 || i >= N) continue
      const edge = i === ci - ring || i === ci + ring
      for (let j = cj - ring; j <= cj + ring; j += edge ? 1 : 2 * ring) {
        if (j < 0 || j >= N) continue
        const n = i * N + j
        const d = (i - ci) ** 2 + (j - cj) ** 2
        if (d < bestD && cells[n] !== 1) {
          best = n
          bestD = d
        }
      }
    }
    if (best >= 0 && last === N) last = Math.ceil(ring * Math.SQRT2)
  }
  return best
}

/** The way's squares pulled into straight lines: a corner stays only where the line past it is not clear. */
function pull(points: Point[], field: Field, q: WayQuery): Point[] {
  const out: Point[] = []
  let anchor = points[0]!
  for (let k = 2; k < points.length; k++) {
    if (clearLine(field.solids, q.skip, q.me, anchor, points[k]!, q.extra)) continue
    anchor = points[k - 1]!
    out.push(anchor)
  }
  if (points.length > 1) out.push(points[points.length - 1]!)
  return out
}

// ------------------------------------------------------------------------------ one step

/** How far a step may turn from where the walker means to go: straight first, then a little more each try, 15 degrees at a time up to 105. */
const TURNS = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 12)
const COS = TURNS.map(Math.cos)
const SIN = TURNS.map(Math.sin)

/** Where a step went, and the side it turned to (+1 or -1), to try first next time. */
export interface Stepped {
  x: number
  z: number
  side: number
}

/** What is near enough to matter for a step, kept between calls: the circles grown by the walker's radius. */
const nearX: number[] = []
const nearZ: number[] = []
const nearR2: number[] = []
/** For each: Infinity to keep out of it, the squared distance now to go no deeper (an actor it overlaps), or -1 to ignore it (a thing it is inside). */
const nearDepth: number[] = []

function gather(px: number, pz: number, step: number, me: number, solids: readonly Circle[], skip: number, actors: readonly Circle[]) {
  nearX.length = nearZ.length = nearR2.length = nearDepth.length = 0
  for (let k = 0; k < solids.length + actors.length; k++) {
    const solid = k < solids.length
    if (solid && k === skip) continue
    const o = solid ? solids[k]! : actors[k - solids.length]!
    const r = o.r + me
    const d2 = (px - o.x) ** 2 + (pz - o.z) ** 2
    if (d2 >= (r + step) ** 2) continue
    nearX.push(o.x)
    nearZ.push(o.z)
    nearR2.push(r * r)
    nearDepth.push(d2 >= r * r ? Infinity : solid ? -1 : d2)
  }
}

/** Whether a step to (x, z) keeps out of what gather found. */
function free(x: number, z: number): boolean {
  for (let m = 0; m < nearX.length; m++) {
    const d2 = (x - nearX[m]!) ** 2 + (z - nearZ[m]!) ** 2
    if (d2 < nearR2[m]! && nearDepth[m]! >= 0 && d2 < nearDepth[m]! - 1e-12) return false
  }
  return true
}

/**
 * One step of length `step` from p, meant along d (a unit vector), for a walker of radius `me`:
 * straight if it can, else turned as little as it must, the side it turned to last first. Never
 * into a solid thing but `skip` it is not already in (one it is inside it may walk out of any
 * way), never deeper into an actor (so one it overlaps it slides out of), and never out of the
 * room (|x| and |z| at most `lim`). Null when no step will.
 */
export function nextStep(px: number, pz: number, dx: number, dz: number, step: number, me: number, solids: readonly Circle[], skip: number, actors: readonly Circle[], lim: number, side: number): Stepped | null {
  gather(px, pz, step, me, solids, skip, actors)
  const outX = Math.max(0, Math.abs(px) - lim)
  const outZ = Math.max(0, Math.abs(pz) - lim)
  const s0 = side >= 0 ? 1 : -1
  for (let k = 0; k < TURNS.length; k++) {
    for (let t = 0; t < (k === 0 ? 1 : 2); t++) {
      const sign = t === 0 ? s0 : -s0
      const c = COS[k]!
      const s = SIN[k]! * sign
      const x = px + (dx * c - dz * s) * step
      const z = pz + (dx * s + dz * c) * step
      if (Math.max(0, Math.abs(x) - lim) > outX + 1e-9 || Math.max(0, Math.abs(z) - lim) > outZ + 1e-9) continue
      if (free(x, z)) return { x, z, side: sign }
    }
  }
  return null
}

/**
 * What stops a straight step from p along d: the room's edge, a solid thing (its index), an
 * actor (its index among `actors`, as 'actor'), or nothing. A thing the walker is inside does
 * not stop it, nor does an actor it overlaps unless the step goes deeper.
 */
export function blocker(px: number, pz: number, dx: number, dz: number, step: number, me: number, solids: readonly Circle[], skip: number, actors: readonly Circle[], lim: number): { kind: 'edge' } | { kind: 'solid'; index: number } | { kind: 'actor'; index: number } | null {
  const x = px + dx * step
  const z = pz + dz * step
  if (Math.max(0, Math.abs(x) - lim) > Math.max(0, Math.abs(px) - lim) + 1e-9 || Math.max(0, Math.abs(z) - lim) > Math.max(0, Math.abs(pz) - lim) + 1e-9) return { kind: 'edge' }
  for (let k = 0; k < solids.length; k++) {
    if (k === skip) continue
    const s = solids[k]!
    const r2 = (s.r + me) ** 2
    if ((x - s.x) ** 2 + (z - s.z) ** 2 < r2 && (px - s.x) ** 2 + (pz - s.z) ** 2 >= r2) return { kind: 'solid', index: k }
  }
  for (let k = 0; k < actors.length; k++) {
    const b = actors[k]!
    const r2 = (b.r + me) ** 2
    const d2 = (x - b.x) ** 2 + (z - b.z) ** 2
    if (d2 < r2 && d2 < (px - b.x) ** 2 + (pz - b.z) ** 2 - 1e-12) return { kind: 'actor', index: k }
  }
  return null
}
