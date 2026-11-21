/**
 * The machines' bodies: driving toward a goal, collisions, the ground they ride, and each one's
 * joints and what they do to the world. `stepMachine` is the only way a machine moves: easy
 * mode's hands (`hands.ts`) and pro mode's levers both hand it a `Cmd`, so the physics are the
 * same. Levers move joints at fixed rates; a bucket below the surface digs and one tipped far
 * enough spills, wherever it is.
 */

import {
  BED_DEPTH, BED_HINGE_Y, BED_HINGE_Z, BED_LEN, BLADE_WIDTH, BLADE_Z, BOOM_LEN, BOOM_RANGE, BOOM_ROOT_Y, BOOM_ROOT_Z, BUCKET_LEN, COINS, CURL_RANGE, DRUM_Z, DUMPER_CAP, FORK_RISE, FORK_Z,
  HITCH_Z, HOOK_TOP_MOBILE, HOOK_TOP_TOWER, HOPPER_R, HOPPER_Y, HOPPER_Z, LOG_FULL, MACHINE_SPECS, MAST_H, MIXER_SAND, REACH_RANGE, ROLL_WIDTH, SCOOP, SEAT, STICK_LEN, STICK_RANGE, TRAILER_AXLE,
  THING_HEIGHT, TROLLEY_RANGE, TURRET_Z, CELL, ROAD_Y, MACHINE_KINDS,
} from './model'
import type { Deck, Digger, Dozer, Dumper, Forklift, Goal, LooseKind, Levers, Load, Machine, MachineKind, Mixer, Mobile, PlantId, Roller, Semi, Sim, Tower } from './model'
import { BUILD_HALF, FOREST_RING, OBSTACLES, PLANTS, RIVER, ROAD_WIDTH, WATER_COLUMN, WATER_RING } from './map'
import { clamp, clamp01, damp, lerp, localX, localZ, toward, turnTo } from './math'
import { bladePush, heightAt, rollOver, spill, surplusIn, take } from './terrain'
import { award, groundY, hopperIn, pickThing, pourConcrete, setDownThing, thingById } from './world'

export type Point = { x: number; y: number; z: number }

/** What a machine is told this frame, each -1 to 1. a to d are the levers of the plan's table: the digger's swing, boom, stick and bucket; the dumper's bed; the dozer's blade; the mixer's chute; the forklift's forks; a crane's jib, trolley or reach, and hook. `tap` is Space. */
export interface Cmd {
  drive: number
  steer: number
  a: number
  b: number
  c: number
  d: number
  tap: boolean
}

export const idleCmd = (): Cmd => ({ drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0, tap: false })
/** Pro's levers as joint commands. The joint angles turn counter-clockwise seen from above, so the swing and the jibs take the lever's sign flipped: a positive lever turns right, the way a positive steer does. */
export const proCmd = (kind: MachineKind, l: Levers, tap: boolean): Cmd => ({
  drive: l.drive,
  steer: l.steer,
  a: kind === 'digger' || kind === 'tower' || kind === 'mobile' ? -l.a : l.a,
  b: l.b,
  c: l.c,
  d: l.d,
  tap,
})

/** How fast each lever moves its joint: radians, metres or (0 to 1) fractions per second at a lever of 1. */
export const RATES = {
  swing: 2.2,
  boom: 2.2,
  stick: 2.4,
  curl: 3.5,
  bed: 0.9,
  blade: 1.2,
  chute: 2,
  forks: 0.6,
  tower: { jib: 1.6, reach: 11, hook: 12 },
  mobile: { jib: 1.6, reach: 10, hook: 11 },
} as const

/** Bucketfuls bite for this long at full rate, and spill this fast (cubic metres a second) when tipped all the way. */
const BITE_FOR = 0.9
const SPILL_RATE = 2.8
const TIP_RATE = 4
/** The steepest a machine leans, radians. */
const LEAN_LIMIT = 0.349
/** The trailer's fold limit. */
const FOLD_LIMIT = 1.2
/** The world's soft wall: a body circle's edge stays inside this. */
export const EDGE = 47
/** Where the mixer's chute pours, local z. */
const CHUTE_Z = HOPPER_Z - 1.4

/** The length of the vector (dx, dz). */
const distance = (dx: number, dz: number) => Math.sqrt(dx * dx + dz * dz)

const at = (m: Machine, lx: number, lz: number) => ({ x: localX(m.x, m.yaw, lx, lz), z: localZ(m.z, m.yaw, lx, lz) })

/** True once per `period` seconds of the sim's clock. */
const every = (s: Sim, dt: number, period: number) => Math.floor(s.time / period) !== Math.floor((s.time - dt) / period)

// ---------------------------------------------------------------------------------------
// Geometry: the digger's arm, and where things hang or sit.

/** The digger's arm in the world: the boom's root, the elbow, the wrist (stick to bucket) and the bucket's tip, and the angle the tip points at (0 is straight ahead, below 0 down). */
export function armPoints(m: Digger): { root: Point; elbow: Point; wrist: Point; tip: Point; angle: number } {
  const yaw = m.yaw + m.swing
  const sx = Math.sin(yaw)
  const cz = Math.cos(yaw)
  const ry = m.y + BOOM_ROOT_Y
  const a1 = m.boom
  const a2 = a1 + m.stick
  const a3 = a2 + m.curl
  const h1 = BOOM_ROOT_Z + BOOM_LEN * Math.cos(a1)
  const v1 = BOOM_LEN * Math.sin(a1)
  const h2 = h1 + STICK_LEN * Math.cos(a2)
  const v2 = v1 + STICK_LEN * Math.sin(a2)
  const h3 = h2 + BUCKET_LEN * Math.cos(a3)
  const v3 = v2 + BUCKET_LEN * Math.sin(a3)
  const pt = (h: number, v: number): Point => ({ x: m.x + sx * h, y: ry + v, z: m.z + cz * h })
  return { root: pt(BOOM_ROOT_Z, 0), elbow: pt(h1, v1), wrist: pt(h2, v2), tip: pt(h3, v3), angle: a3 }
}

export const bucketTip = (m: Digger): Point => armPoints(m).tip

/** The boom and stick that put the wrist at `h` along the arm's plane and `v` up, both from the boom's root. Out of reach it stretches toward the point; the joints stay in their ranges. */
export function armToWrist(h: number, v: number): { boom: number; stick: number } {
  const d = clamp(Math.hypot(h, v), Math.abs(BOOM_LEN - STICK_LEN) + 0.05, BOOM_LEN + STICK_LEN - 0.02)
  const elbow = Math.acos(clamp((BOOM_LEN * BOOM_LEN + STICK_LEN * STICK_LEN - d * d) / (2 * BOOM_LEN * STICK_LEN), -1, 1))
  const lift = Math.acos(clamp((BOOM_LEN * BOOM_LEN + d * d - STICK_LEN * STICK_LEN) / (2 * BOOM_LEN * d), -1, 1))
  return { boom: clamp(Math.atan2(v, h) + lift, BOOM_RANGE[0], BOOM_RANGE[1]), stick: clamp(elbow - Math.PI, STICK_RANGE[0], STICK_RANGE[1]) }
}

/** The joints that put the bucket's tip `reach` metres from the turret's middle and `rise` metres above the machine, pointing at `angle`. */
export function armToTip(reach: number, rise: number, angle: number): { boom: number; stick: number; curl: number } {
  const w = armToWrist(reach - BOOM_ROOT_Z - BUCKET_LEN * Math.cos(angle), rise - BOOM_ROOT_Y - BUCKET_LEN * Math.sin(angle))
  return { ...w, curl: clamp(angle - w.boom - w.stick, CURL_RANGE[0], CURL_RANGE[1]) }
}

/** Where the stuff leaves the bed: over the hinge at the back. */
export function bedTail(m: Dumper): Point {
  const p = at(m, 0, BED_HINGE_Z - 0.25)
  return { x: p.x, y: m.y + BED_HINGE_Y, z: p.z }
}

/** The middle of the forks' tips, and the height they carry a thing at. */
export function forkPoint(m: Forklift): Point {
  const p = at(m, 0, FORK_Z)
  return { x: p.x, y: m.y + m.lift * FORK_RISE, z: p.z }
}

/** Where a crane's jib turns: the mast, or the truck crane's turret. */
export function craneBase(m: Tower | Mobile): { x: number; z: number } {
  return m.kind === 'tower' ? { x: m.x, z: m.z } : at(m, 0, TURRET_Z)
}

/** The hook, straight under the trolley or the boom's tip (the swing is for the look only). */
export function hookPoint(m: Tower | Mobile): Point {
  const b = craneBase(m)
  const out = m.kind === 'tower' ? m.trolley : m.reach
  return { x: b.x + Math.sin(m.jib) * out, y: m.hookY, z: b.z + Math.cos(m.jib) * out }
}

/** Where the driver sits in the world. */
export function seatPoint(m: Machine): Point {
  const [sx, sy, sz] = SEAT[m.kind]
  const yaw = m.kind === 'digger' ? m.yaw + m.swing : m.kind === 'tower' ? m.jib : m.yaw
  return { x: localX(m.x, yaw, sx, sz), y: m.y + sy + (m.kind === 'tower' ? MAST_H : 0), z: localZ(m.z, yaw, sx, sz) }
}

// ---------------------------------------------------------------------------------------
// Receivers: what a bucket or a bed can tip into.

export interface Receiver {
  owner: Dumper | Mixer | PlantId
  x: number
  z: number
  /** The rim: the height a bucket opens over it. */
  top: number
  r: number
}

/** The dumper's bed, the mixer's hopper and the plants' hoppers, as circles `slack` metres wider than they are. */
export function receivers(s: Sim, slack: number, fromDigger: boolean): Receiver[] {
  const list: Receiver[] = []
  if (fromDigger) {
    if (s.machines.dumper.unlocked) {
      const d = s.machines.dumper
      const p = at(d, 0, BED_HINGE_Z + BED_LEN / 2)
      list.push({ owner: d, x: p.x, z: p.z, top: d.y + BED_HINGE_Y + BED_DEPTH, r: 1.5 + slack })
    }
    if (s.machines.mixer.unlocked) {
      const mx = s.machines.mixer
      const p = at(mx, 0, HOPPER_Z)
      list.push({ owner: mx, x: p.x, z: p.z, top: mx.y + HOPPER_Y, r: HOPPER_R + slack })
    }
  }
  for (const id of ['press', 'crusher', 'saw'] as const) {
    const c = PLANTS[id]
    list.push({ owner: id, x: c.hopperX, z: c.hopperZ, top: c.hopperY, r: c.hopperR + slack })
  }
  return list
}

/** The receiver whose circle holds (x, z), nearest first, or null for the open ground. */
export function receiverAt(s: Sim, x: number, z: number, slack: number, fromDigger: boolean): Receiver | null {
  let best: Receiver | null = null
  let bestD = Infinity
  for (const r of receivers(s, slack, fromDigger)) {
    const d = Math.hypot(x - r.x, z - r.z)
    if (d < r.r && d < bestD) {
      best = r
      bestD = d
    }
  }
  return best
}

const addLoad = (load: Load, amount: number, kind: LooseKind) => {
  if (load.amount < 1e-6 || amount > load.amount) load.kind = kind
  load.amount += amount
}

/** Tips `amount` of `kind` from `from` onto what lies under (x, z): a receiver takes what it has room for, the rest lands on the ground. Coins `coinsPer` per cubic metre taken by a receiver. */
function pourStuff(s: Sim, from: Point, x: number, z: number, amount: number, kind: LooseKind, fromDigger: boolean, coinsPer: number, strength: number): void {
  const r = receiverAt(s, x, z, fromDigger ? 0.3 : 0.5, fromDigger)
  let taken = 0
  if (r !== null) {
    if (typeof r.owner === 'string') {
      taken = amount
      hopperIn(s, r.owner, amount)
    } else if (r.owner.kind === 'dumper') {
      taken = Math.min(amount, Math.max(0, DUMPER_CAP - r.owner.load.amount))
      addLoad(r.owner.load, taken, kind)
    } else {
      taken = Math.min(amount, Math.max(0, MIXER_SAND * (1 - r.owner.concrete) - r.owner.sand))
      r.owner.sand += taken
    }
    award(s, coinsPer * taken, x, from.y, z)
  }
  if (amount - taken > 1e-9) spill(s.terrain, x, z, fromDigger ? 1.2 : 1.4, amount - taken, kind)
  const toY = r !== null ? r.top : groundY(s, x, z)
  s.streams.push({ stuff: kind, fromX: from.x, fromY: from.y, fromZ: from.z, toX: x, toY, toZ: z, rate: strength })
}

// ---------------------------------------------------------------------------------------
// Collisions.

// The shoves below take indexes into arrays and not numbers: a number passed to a function that is not inlined is boxed afresh, and these run for every circle, every thing, every pass, every tick.

/** The push `circleVs` and `boxVs` leave: x and z. */
const push = new Float64Array(2)

/** The push that moves circle `c` of the machine clear of circle `i` of `xs`, `zs` and `rs`, left in `push`. */
function circleVs(c: number, xs: Float64Array, zs: Float64Array, rs: Float64Array, i: number): void {
  const dx = circleX[c] - xs[i]
  const dz = circleZ[c] - zs[i]
  const reach = circleR[c] + rs[i]
  const d2 = dx * dx + dz * dz
  if (d2 >= reach * reach) {
    push[0] = 0
    push[1] = 0
  } else if (d2 < 1e-12) {
    push[0] = reach
    push[1] = 0
  } else {
    const d = Math.sqrt(d2)
    const k = (reach - d) / d
    push[0] = dx * k
    push[1] = dz * k
  }
}

/** The push that moves circle `c` of the machine clear of the box at `k` in `boxes` (centre x and z, half sizes x and z, cosine and sine of its yaw), left in `push`. */
function boxVs(c: number, boxes: Float64Array, k: number): void {
  const hx = boxes[k + 2]
  const hz = boxes[k + 3]
  const cs = boxes[k + 4]
  const sn = boxes[k + 5]
  const dx = circleX[c] - boxes[k]
  const dz = circleZ[c] - boxes[k + 1]
  const lx = dx * cs - dz * sn
  const lz = dx * sn + dz * cs
  const ex = lx - clamp(lx, -hx, hx)
  const ez = lz - clamp(lz, -hz, hz)
  const d = Math.sqrt(ex * ex + ez * ez)
  const ar = circleR[c]
  if (d >= ar) {
    push[0] = 0
    push[1] = 0
    return
  }
  let nx: number
  let nz: number
  let depth: number
  if (d > 1e-6) {
    nx = ex / d
    nz = ez / d
    depth = ar - d
  } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) {
    nx = lx >= 0 ? 1 : -1
    nz = 0
    depth = hx - Math.abs(lx) + ar
  } else {
    nx = 0
    nz = lz >= 0 ? 1 : -1
    depth = hz - Math.abs(lz) + ar
  }
  push[0] = (nx * cs + nz * sn) * depth
  push[1] = (-nx * sn + nz * cs) * depth
}

/** The river's no-go boxes: the whole strip, or the two sides of a deck that spans it. */
function riverBoxes(decks: readonly Deck[]): [number, number, number, number][] {
  const mid = (RIVER.z0 + RIVER.z1) / 2
  const hz = (RIVER.z1 - RIVER.z0) / 2
  const big = 400
  const boxes: [number, number, number, number][] = []
  let from = -big
  const spans = decks.filter((d) => d.z0 <= RIVER.z0 && d.z1 >= RIVER.z1).sort((p, q) => p.x0 - q.x0)
  for (const d of spans) {
    boxes.push([(from + d.x0) / 2, mid, (d.x0 - from) / 2, hz])
    from = d.x1
  }
  boxes.push([(from + big) / 2, mid, (big - from) / 2, hz])
  return boxes
}

// ---------------------------------------------------------------------------------------
// The standing things: what no machine may drive through, as flat numbers made once for as long as they stand where they are.

/** One box's numbers in `Standing.builds` and `Standing.rivers`: centre x and z, half size x and z, cosine and sine of its yaw. */
const BOX_STRIDE = 6
/** The route grid's side in one-metre cells, and the grid's cell count. */
const ROUTE_SIDE = 96
const ROUTE_CELLS = ROUTE_SIDE * ROUTE_SIDE

/** The standing things of one sim: its placed builds (not the bridge, which is walked over) and the river's boxes, and the route grids made from them for each body radius. */
interface Standing {
  /** Everything the other fields were made from, one number after another: the builds' count and their x, z, yaw and half sizes, then the decks' count and their edges. */
  sig: number[]
  nBuilds: number
  builds: Float64Array
  nRivers: number
  rivers: Float64Array
  grids: Map<number, Uint8Array>
  /** How many of ROUTE_OWN have had their grids made ahead of need. */
  warmed: number
}

const standings = new WeakMap<Sim, Standing>()

/** True if the placed builds and the decks are as `st` was made from them. Costs nothing but the comparing. */
function stands(s: Sim, st: Standing): boolean {
  const sig = st.sig
  let k = 1
  let n = 0
  for (let i = 0; i < s.builds.length; i++) {
    const b = s.builds[i]
    if (b.placed === 0 || b.kind === 'bridge') continue
    const half = BUILD_HALF[b.kind]
    if (sig[k++] !== b.x || sig[k++] !== b.z || sig[k++] !== b.yaw || sig[k++] !== half[0] || sig[k++] !== half[1]) return false
    n++
  }
  if (sig[0] !== n || sig[k++] !== s.decks.length) return false
  for (let i = 0; i < s.decks.length; i++) {
    const d = s.decks[i]
    if (sig[k++] !== d.x0 || sig[k++] !== d.x1 || sig[k++] !== d.z0 || sig[k++] !== d.z1) return false
  }
  return true
}

/** The standing things of a sim, made again when a build gets its first piece, moves, or a deck comes or goes. Each call that finds them as they were makes one more body radius's grid ahead of need, so every grid is ready within a few ticks and none of them costs a tick more than one grid. */
function standing(s: Sim): Standing {
  const kept = standings.get(s)
  if (kept !== undefined && stands(s, kept)) {
    if (kept.warmed < ROUTE_OWN.length) gridFor(kept, ROUTE_OWN[kept.warmed++])
    return kept
  }
  const placed = s.builds.filter((b) => b.placed > 0 && b.kind !== 'bridge')
  const sig: number[] = [placed.length]
  const builds = new Float64Array(placed.length * BOX_STRIDE)
  placed.forEach((b, i) => {
    const [hx, hz] = BUILD_HALF[b.kind]
    sig.push(b.x, b.z, b.yaw, hx, hz)
    builds.set([b.x, b.z, hx, hz, Math.cos(b.yaw), Math.sin(b.yaw)], i * BOX_STRIDE)
  })
  sig.push(s.decks.length)
  for (const d of s.decks) sig.push(d.x0, d.x1, d.z0, d.z1)
  const boxes = riverBoxes(s.decks)
  const rivers = new Float64Array(boxes.length * BOX_STRIDE)
  boxes.forEach(([x, z, hx, hz], i) => rivers.set([x, z, hx, hz, 1, 0], i * BOX_STRIDE))
  const st: Standing = { sig, nBuilds: placed.length, builds, nRivers: boxes.length, rivers, grids: new Map(), warmed: 0 }
  standings.set(s, st)
  return st
}

/** The grid cells that a span of the world, `half` each side of `c`, can touch, as first and last index into `out` from `at`: a cell more each way than the span reaches, clamped to the grid. */
function cellsAround(c: number, half: number, out: Int32Array, at: number): void {
  out[at] = clamp(Math.floor(c - half + ROUTE_SIDE / 2 - 0.5) - 1, 0, ROUTE_SIDE - 1)
  out[at + 1] = clamp(Math.floor(c + half + ROUTE_SIDE / 2 - 0.5) + 1, 0, ROUTE_SIDE - 1)
}

const span = new Int32Array(4)

/** Marks the cells whose centre is inside the box turned by yaw and grown by `own` all round: only the cells of its bounding box are tried, with the same arithmetic for each as a test of every cell would use. */
function markBox(grid: Uint8Array, cx: number, cz: number, hx: number, hz: number, cos: number, sin: number, own: number): void {
  const ex = hx + own
  const ez = hz + own
  cellsAround(cx, ex * Math.abs(cos) + ez * Math.abs(sin), span, 0)
  cellsAround(cz, ex * Math.abs(sin) + ez * Math.abs(cos), span, 2)
  for (let j = span[2]; j <= span[3]; j++) {
    const z = j - ROUTE_SIDE / 2 + 0.5
    for (let i = span[0]; i <= span[1]; i++) {
      const x = i - ROUTE_SIDE / 2 + 0.5
      const lx = (x - cx) * cos - (z - cz) * sin
      const lz = (x - cx) * sin + (z - cz) * cos
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) grid[i + j * ROUTE_SIDE] = 1
    }
  }
}

/** Marks the cells whose centre is within `r` + `own` of (cx, cz). */
function markCircle(grid: Uint8Array, cx: number, cz: number, r: number, own: number): void {
  cellsAround(cx, r + own, span, 0)
  cellsAround(cz, r + own, span, 2)
  for (let j = span[2]; j <= span[3]; j++) {
    const z = j - ROUTE_SIDE / 2 + 0.5
    for (let i = span[0]; i <= span[1]; i++) {
      const x = i - ROUTE_SIDE / 2 + 0.5
      if (Math.hypot(x - cx, z - cz) < r + own) grid[i + j * ROUTE_SIDE] = 1
    }
  }
}

/** A one-metre grid of what a machine of body radius `own` must keep clear of: the world's edge, the trees, plants, standing buildings and the river (less any deck). Made once for a radius while the standing things stay. */
function gridFor(st: Standing, own: number): Uint8Array {
  const kept = st.grids.get(own)
  if (kept !== undefined) return kept
  const grid = new Uint8Array(ROUTE_CELLS)
  for (let j = 0; j < ROUTE_SIDE; j++) {
    const z = j - ROUTE_SIDE / 2 + 0.5
    for (let i = 0; i < ROUTE_SIDE; i++) {
      const x = i - ROUTE_SIDE / 2 + 0.5
      if (Math.abs(x) > EDGE - own || Math.abs(z) > EDGE - own) grid[i + j * ROUTE_SIDE] = 1
    }
  }
  for (const [ox, oz, or] of OBSTACLES) markCircle(grid, ox, oz, or, own)
  for (let i = 0; i < st.nBuilds; i++) {
    const k = i * BOX_STRIDE
    markBox(grid, st.builds[k], st.builds[k + 1], st.builds[k + 2], st.builds[k + 3], st.builds[k + 4], st.builds[k + 5], own)
  }
  for (let i = 0; i < st.nRivers; i++) {
    const k = i * BOX_STRIDE
    markBox(grid, st.rivers[k], st.rivers[k + 1], st.rivers[k + 2], st.rivers[k + 3], st.rivers[k + 4], st.rivers[k + 5], own)
  }
  st.grids.set(own, grid)
  return grid
}

/** The route grid of a sim for a machine of body radius `own`: what `route` keeps that machine clear of. */
export function standingGrid(s: Sim, own: number): Uint8Array {
  return gridFor(standing(s), own)
}

// ---------------------------------------------------------------------------------------
// Pushing a machine out of what it overlaps.

/** The most circles a machine is made of: its body's and the trailer's. */
const MAX_CIRCLES = 8
/** The most circles all the other machines make. */
const MAX_OTHER_CIRCLES = 48

// Scratch for one `pushOut`: the machine's circles and the others' circles, with the middle of the machine each belongs to.
const circleX = new Float64Array(MAX_CIRCLES)
const circleZ = new Float64Array(MAX_CIRCLES)
const circleR = new Float64Array(MAX_CIRCLES)
const otherX = new Float64Array(MAX_OTHER_CIRCLES)
const otherZ = new Float64Array(MAX_OTHER_CIRCLES)
const otherR = new Float64Array(MAX_OTHER_CIRCLES)
const otherMidX = new Float64Array(MAX_OTHER_CIRCLES)
const otherMidZ = new Float64Array(MAX_OTHER_CIRCLES)
/** The trees, plants and props as circles. */
const obstacleX = Float64Array.from(OBSTACLES, (o) => o[0])
const obstacleZ = Float64Array.from(OBSTACLES, (o) => o[1])
const obstacleR = Float64Array.from(OBSTACLES, (o) => o[2])
/** The biggest push so far and where its thing is: size, x, z. */
const big = new Float64Array(3)
/** What `pushOut` hands back, overwritten by the next call. */
const shoved = { dx: 0, dz: 0, cx: 0, cz: 0 }

/** Moves the machine and all its `n` circles by the push left in `push`. */
function applyShove(m: Machine, n: number): void {
  m.x += push[0]
  m.z += push[1]
  for (let i = 0; i < n; i++) {
    circleX[i] += push[0]
    circleZ[i] += push[1]
  }
}

/** `applyShove` for a push by a thing centred at (`xs[i]`, `zs[j]`): the biggest push remembers where its thing is. */
function applyShoveFrom(m: Machine, n: number, xs: Float64Array, i: number, zs: Float64Array, j: number): void {
  if (push[0] === 0 && push[1] === 0) return
  const size = Math.sqrt(push[0] * push[0] + push[1] * push[1])
  if (size > big[0]) {
    big[0] = size
    big[1] = xs[i]
    big[2] = zs[j]
  }
  applyShove(m, n)
}

/** Pushes a machine out of the other machines, the trees and plants, built things, the river and the world's edge: sideways, so it slides and never stops dead. The lorry's trailer end counts too, except at the edge. The answer is overwritten by the next call. */
function pushOut(s: Sim, m: Machine): { dx: number; dz: number; cx: number; cz: number } {
  const x0 = m.x
  const z0 = m.z
  const body = MACHINE_SPECS[m.kind].body
  const sin = Math.sin(m.yaw)
  const cos = Math.cos(m.yaw)
  let n = body.length
  if (n + 1 > MAX_CIRCLES) throw new Error(`pushOut: ${m.kind} has ${n} body circles, room for ${MAX_CIRCLES - 1}`)
  for (let i = 0; i < n; i++) {
    circleX[i] = m.x + sin * body[i][0]
    circleZ[i] = m.z + cos * body[i][0]
    circleR[i] = body[i][1]
  }
  const edged = n
  if (m.kind === 'semi') {
    const hx = localX(m.x, m.yaw, 0, HITCH_Z)
    const hz = localZ(m.z, m.yaw, 0, HITCH_Z)
    circleX[n] = hx - Math.sin(m.trailerYaw) * TRAILER_AXLE
    circleZ[n] = hz - Math.cos(m.trailerYaw) * TRAILER_AXLE
    circleR[n] = 1.3
    n++
  }
  let others = 0
  for (let k = 0; k < MACHINE_KINDS.length; k++) {
    const o = s.machines[MACHINE_KINDS[k]]
    if (o === m || !o.unlocked) continue
    const os = Math.sin(o.yaw)
    const oc = Math.cos(o.yaw)
    const theirs = MACHINE_SPECS[o.kind].body
    for (let i = 0; i < theirs.length; i++) {
      if (others >= MAX_OTHER_CIRCLES) throw new Error(`pushOut: more than ${MAX_OTHER_CIRCLES} circles in the other machines`)
      otherX[others] = o.x + os * theirs[i][0]
      otherZ[others] = o.z + oc * theirs[i][0]
      otherR[others] = theirs[i][1]
      otherMidX[others] = o.x
      otherMidZ[others] = o.z
      others++
    }
  }
  const st = standing(s)
  big[0] = 0
  big[1] = m.x
  big[2] = m.z
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 0; c < n; c++) {
      for (let o = 0; o < others; o++) {
        circleVs(c, otherX, otherZ, otherR, o)
        applyShoveFrom(m, n, otherMidX, o, otherMidZ, o)
      }
      for (let i = 0; i < obstacleX.length; i++) {
        circleVs(c, obstacleX, obstacleZ, obstacleR, i)
        applyShoveFrom(m, n, obstacleX, i, obstacleZ, i)
      }
      for (let i = 0; i < st.nBuilds; i++) {
        boxVs(c, st.builds, i * BOX_STRIDE)
        applyShoveFrom(m, n, st.builds, i * BOX_STRIDE, st.builds, i * BOX_STRIDE + 1)
      }
      for (let i = 0; i < st.nRivers; i++) {
        boxVs(c, st.rivers, i * BOX_STRIDE)
        applyShoveFrom(m, n, st.rivers, i * BOX_STRIDE, st.rivers, i * BOX_STRIDE + 1)
      }
      if (c < edged) {
        push[0] = clamp(circleX[c], -EDGE + circleR[c], EDGE - circleR[c]) - circleX[c]
        push[1] = clamp(circleZ[c], -EDGE + circleR[c], EDGE - circleR[c]) - circleZ[c]
        applyShove(m, n)
      }
    }
  }
  shoved.dx = m.x - x0
  shoved.dz = m.z - z0
  shoved.cx = big[1]
  shoved.cz = big[2]
  return shoved
}

// ---------------------------------------------------------------------------------------
// Driving toward a goal.

/** How fast a wheeled machine that has reached its spot swings round to the goal's yaw, in radians a second. */
const SETTLE_TURN = 2.5

/** The goal is reached: close enough, and turned to its yaw if it has one. */
export function arrived(m: Machine, g: Goal): boolean {
  return distance(g.x - m.x, g.z - m.z) < g.within && (g.yaw === null || Math.abs(turnTo(m.yaw, g.yaw)) < 0.06)
}

/** What `goalDrive` hands back, overwritten by the next call. */
const driven = { drive: 0, steer: 0 }

/**
 * What to command to get to a goal that is not yet reached. A tracked machine turns toward it,
 * then drives. A wheeled one steers along the arc that ends on it; a goal behind and near is
 * backed up to; a goal inside its turning circle is backed away from first (the lorry drives
 * straight on instead, then loops back round, so it never backs up and never orbits).
 */
function goalDrive(m: Machine, g: Goal, tx: number, tz: number): { drive: number; steer: number } {
  const spec = MACHINE_SPECS[m.kind]
  const dx = tx - m.x
  const dz = tz - m.z
  const d = Math.sqrt(dx * dx + dz * dz)
  const top = spec.top * g.pace
  const mag = clamp((3.5 * (d - 0.5 * g.within)) / top, 0.12, 1)
  if (spec.pivot > 0) {
    const err = turnTo(m.yaw, Math.atan2(dx, dz) + (g.reverse ? Math.PI : 0))
    driven.drive = (g.reverse ? -1 : 1) * mag * clamp((1 - Math.abs(err)) / 0.65, 0, 1)
    driven.steer = clamp(err * 2.5, -1, 1)
    return driven
  }
  const canReverse = m.kind !== 'semi'
  const sign = g.reverse && canReverse ? -1 : 1
  const radius = spec.wheelbase / Math.tan(spec.lock)
  const lx = dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw)
  const lz = dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw)
  const u = lx * sign
  const w = lz * sign
  const reversing = m.speed * sign < -0.3
  // A machine already backing up keeps backing until the goal is clearly ahead, so a goal at the side does not flip it between forward and back.
  const behind = reversing ? w < 0.25 * d : w < 0
  const pursuit = clamp(Math.atan((spec.wheelbase * 2 * u) / (d * d)) / spec.lock, -1, 1)
  // The goal is inside the turning circle when the ring around it cannot be reached by driving forward on the arc.
  const reachable = radius - 0.9 * g.within
  const inside = d * d < 2 * radius * Math.abs(u) * (reversing && w >= 0 ? 1.4 : 1) + reachable * reachable - radius * radius && d > g.within
  let dir = 1
  let steer = pursuit
  if (inside) {
    dir = w >= 0 && canReverse ? -1 : 1
    steer = 0
  } else if (behind || Math.abs(u) > 0.57 * d) {
    if (behind && canReverse && d < (reversing ? 3.2 : 2.4) * radius) dir = -1
    else steer = u >= 0 ? 1 : -1
  }
  driven.drive = dir * sign * mag * (1 - 0.45 * Math.abs(steer))
  driven.steer = steer * sign
  return driven
}

/**
 * A machine under manual control that is pushed straight back by something in its way slides
 * along it, away from the middle of the thing, and turns to follow the edge, so it works its way
 * round. (A goal plans its way round with `detour`.)
 */
function slideAlong(m: Machine, shove: { dx: number; dz: number; cx: number; cz: number }, dt: number): void {
  const moved = Math.abs(m.speed) * dt
  const push = distance(shove.dx, shove.dz)
  if (moved < 1e-4 || push < 1e-5) return
  const dir = Math.sign(m.speed)
  const against = (-(shove.dx * Math.sin(m.yaw) + shove.dz * Math.cos(m.yaw)) * dir) / moved
  if (against < 0.3) return
  const nx = shove.dx / push
  const nz = shove.dz / push
  let tx = -nz
  let tz = nx
  if (tx * (m.x - shove.cx) + tz * (m.z - shove.cz) < 0) {
    tx = -tx
    tz = -tz
  }
  const k = Math.min(1, against)
  m.x += tx * moved * 0.7 * k
  m.z += tz * moved * 0.7 * k
  m.yaw = turnTo(0, m.yaw + clamp(turnTo(m.yaw, Math.atan2(tx * dir, tz * dir)), -2 * dt * k, 2 * dt * k))
}


// The way round things: A* on a one-metre grid over standing things, so a goal behind a house or a plant is reached by driving round it, whatever the machine's size.

/** How far from its middle a machine's body circles reach, times `scale`. */
const bodyReach = (kind: MachineKind, scale: number): number => Math.max(...MACHINE_SPECS[kind].body.map(([lz, r]) => (Math.abs(lz) + r) * scale))

/** The body radius a machine of each kind keeps clear of standing things when it routes: 80 % of its reach, a margin, and a metre more for the lorry's trailer. */
export const ROUTE_RADIUS = Object.fromEntries(MACHINE_KINDS.map((k) => [k, bodyReach(k, 0.8) + 0.4 + (k === 'semi' ? 1 : 0)])) as Record<MachineKind, number>
/** The distinct radii, whose grids are made together. */
const ROUTE_OWN = [...new Set(Object.values(ROUTE_RADIUS))]
/** How far from another machine's middle a route keeps clear, by kind of the machine that routes. */
const ROUTE_REACH = Object.fromEntries(MACHINE_KINDS.map((k) => [k, bodyReach(k, 1) + 1.8])) as Record<MachineKind, number>
/** A route's start is open within this far of the machine, and its goal within `max(within * 0.9, GOAL_OPEN)` of the goal. */
const START_OPEN = 3
const GOAL_OPEN = 4

// Scratch for one search: each search stamps what it touches, so nothing carries from one call to the next.
const routeCost = new Float32Array(ROUTE_CELLS)
const routeFrom = new Int32Array(ROUTE_CELLS)
const routeSeen = new Uint32Array(ROUTE_CELLS)
const routeDone = new Uint32Array(ROUTE_CELLS)
const routePath = new Int32Array(ROUTE_CELLS)
let routeStamp = 0
const NEIGHBOUR_X = [1, -1, 0, 0, 1, 1, -1, -1] as const
const NEIGHBOUR_Z = [0, 0, 1, -1, 1, -1, 1, -1] as const

/** A binary min-heap of cells by cost: a cell is pushed again when a cheaper way to it is found, so it holds up to eight entries a cell. */
const HEAP_ROOM = ROUTE_CELLS * 8
const heapKey = new Float64Array(HEAP_ROOM)
const heapCell = new Int32Array(HEAP_ROOM)
let heapSize = 0

function heapPush(key: number, cell: number): void {
  if (heapSize >= HEAP_ROOM) throw new Error(`route: more than ${HEAP_ROOM} entries in the heap`)
  let i = heapSize++
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heapKey[parent] <= key) break
    heapKey[i] = heapKey[parent]
    heapCell[i] = heapCell[parent]
    i = parent
  }
  heapKey[i] = key
  heapCell[i] = cell
}

/** Takes the cheapest cell off the heap, which must not be empty. */
function heapPop(): number {
  const top = heapCell[0]
  heapSize--
  if (heapSize > 0) {
    const key = heapKey[heapSize]
    const cell = heapCell[heapSize]
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      if (l >= heapSize) break
      const r = l + 1
      const small = r < heapSize && heapKey[r] < heapKey[l] ? r : l
      if (heapKey[small] >= key) break
      heapKey[i] = heapKey[small]
      heapCell[i] = heapCell[small]
      i = small
    }
    heapKey[i] = key
    heapCell[i] = cell
  }
  return top
}

// The plan being made: the machine, the goal and what is in the way, read by the helpers below.
let planGrid: Uint8Array = new Uint8Array(0)
const planMask = new Uint8Array(ROUTE_CELLS)
const planOtherX = new Float64Array(MACHINE_KINDS.length)
const planOtherZ = new Float64Array(MACHINE_KINDS.length)
let planOthers = 0
let planReach = 0
let planFromX = 0
let planFromZ = 0
let planGoalX = 0
let planGoalZ = 0
let planEnter = 0

const cellOf = (v: number): number => clamp(Math.floor(v + ROUTE_SIDE / 2), 0, ROUTE_SIDE - 1)
const centreX = (cell: number): number => (cell % ROUTE_SIDE) - ROUTE_SIDE / 2 + 0.5
const centreZ = (cell: number): number => Math.floor(cell / ROUTE_SIDE) - ROUTE_SIDE / 2 + 0.5

/** A standing thing or another machine is at (x, z). */
function occupied(x: number, z: number): boolean {
  if (planGrid[cellOf(x) + cellOf(z) * ROUTE_SIDE] === 1) return true
  for (let i = 0; i < planOthers; i++) {
    const dx = x - planOtherX[i]
    const dz = z - planOtherZ[i]
    if (dx * dx + dz * dz < planReach * planReach) return true
  }
  return false
}

const nearStart = (x: number, z: number): boolean => (x - planFromX) * (x - planFromX) + (z - planFromZ) * (z - planFromZ) <= START_OPEN * START_OPEN
const nearEnd = (x: number, z: number): boolean => (x - planGoalX) * (x - planGoalX) + (z - planGoalZ) * (z - planGoalZ) <= planEnter * planEnter

/**
 * True if the straight run from the machine to (bx, bz) keeps clear of everything `occupied` knows, except that a
 * run may start among things (while the way is still occupied and `nearStart` holds) and may end
 * among them (likewise with `nearEnd`): a machine parked among things drives out, and a goal among
 * things is driven up to. A run that crosses things in the middle is never clear, near the goal or
 * far from it, so the plan never flips with the distance.
 */
function runIsClear(bx: number, bz: number): boolean {
  const ax = planFromX
  const az = planFromZ
  const steps = Math.ceil(Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) / 0.5)
  let from = 1
  while (from < steps) {
    const x = ax + ((bx - ax) * from) / steps
    const z = az + ((bz - az) * from) / steps
    if (!(occupied(x, z) && nearStart(x, z))) break
    from++
  }
  let to = steps - 1
  while (to >= from) {
    const x = ax + ((bx - ax) * to) / steps
    const z = az + ((bz - az) * to) / steps
    if (!(occupied(x, z) && nearEnd(x, z))) break
    to--
  }
  for (let i = from; i <= to; i++) if (occupied(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps)) return false
  return true
}

/** Lists the machines a route keeps clear of, other than `m`, in `planOtherX` and `planOtherZ`. */
function listOthers(s: Sim, m: Machine): void {
  planOthers = 0
  for (let k = 0; k < MACHINE_KINDS.length; k++) {
    const o = s.machines[MACHINE_KINDS[k]]
    if (o === m || !o.unlocked) continue
    planOtherX[planOthers] = o.x
    planOtherZ[planOthers] = o.z
    planOthers++
  }
}

/** Marks in `planMask` the cells whose centre is within `planReach` of a listed machine. */
function markOthers(): void {
  planMask.fill(0)
  for (let k = 0; k < planOthers; k++) {
    cellsAround(planOtherX[k], planReach, span, 0)
    cellsAround(planOtherZ[k], planReach, span, 2)
    for (let j = span[2]; j <= span[3]; j++) {
      for (let i = span[0]; i <= span[1]; i++) {
        const dx = i - ROUTE_SIDE / 2 + 0.5 - planOtherX[k]
        const dz = j - ROUTE_SIDE / 2 + 0.5 - planOtherZ[k]
        if (dx * dx + dz * dz < planReach * planReach) planMask[i + j * ROUTE_SIDE] = 1
      }
    }
  }
}

/** The cells of the cheapest way from `start` to `end` over the plan's grid, left in `routePath` from the start to the end; the number of cells, or 0 when there is no way. */
function search(start: number, end: number): number {
  routeStamp++
  routeSeen[start] = routeStamp
  routeCost[start] = 0
  routeFrom[start] = -1
  heapSize = 0
  heapPush(0, start)
  const endX = centreX(end)
  const endZ = centreZ(end)
  let found = false
  while (heapSize > 0) {
    const at = heapPop()
    if (routeDone[at] === routeStamp) continue
    routeDone[at] = routeStamp
    if (at === end) {
      found = true
      break
    }
    const ix = at % ROUTE_SIDE
    const iz = (at - ix) / ROUTE_SIDE
    for (let k = 0; k < 8; k++) {
      const nx = ix + NEIGHBOUR_X[k]
      const nz = iz + NEIGHBOUR_Z[k]
      if (nx < 0 || nz < 0 || nx >= ROUTE_SIDE || nz >= ROUTE_SIDE) continue
      const n = nx + nz * ROUTE_SIDE
      const cx = nx - ROUTE_SIDE / 2 + 0.5
      const cz = nz - ROUTE_SIDE / 2 + 0.5
      const solid = planGrid[n] === 1
      if (n !== end && (solid || planMask[n] === 1) && !nearStart(cx, cz) && !nearEnd(cx, cz)) continue
      const cost = routeCost[at] + (NEIGHBOUR_X[k] !== 0 && NEIGHBOUR_Z[k] !== 0 ? 1.414 : 1) + (solid ? 5 : 0)
      if (routeSeen[n] === routeStamp && routeCost[n] <= cost) continue
      routeSeen[n] = routeStamp
      routeCost[n] = cost
      routeFrom[n] = at
      heapPush(cost + Math.sqrt((cx - endX) * (cx - endX) + (cz - endZ) * (cz - endZ)), n)
    }
  }
  if (!found) return 0
  let length = 0
  for (let i = end; i !== -1; i = routeFrom[i]) routePath[length++] = i
  for (let i = 0; i < length >> 1; i++) {
    const swap = routePath[i]
    routePath[i] = routePath[length - 1 - i]
    routePath[length - 1 - i] = swap
  }
  return length
}

/** Remembers the aim for 0.4 s and returns it as `route` does. */
function keepRoute(s: Sim, m: Machine, g: Goal, aim: [number, number] | null): { x: number; z: number } | null {
  m.route = { goal: g, at: s.time, aim }
  return virtualAim(m, g, aim)
}

/** What `route` hands back, overwritten by the next call. */
const wayPoint = { x: 0, z: 0 }

/**
 * Where to aim instead of straight at the goal when a standing thing is in the way: the farthest
 * point of the shortest clear route that can be seen from the machine. The same answer comes
 * every frame, so the machine commits to one way round. Null when the straight run is clear, or
 * when no route exists (then the machine drives at the goal and slides along what it meets).
 * Standing things and parked machines within a few metres of the machine or of the goal do not count,
 * so a machine can leave a place it is parked in and drive up to a plant or a truck.
 * The point is overwritten by the next call.
 */
export function route(s: Sim, m: Machine, g: Goal): { x: number; z: number } | null {
  const kept = m.route
  if (kept !== null && kept.goal === g && s.time >= kept.at && s.time - kept.at < 0.4) return virtualAim(m, g, kept.aim)
  const spec = MACHINE_SPECS[m.kind]
  planGrid = standingGrid(s, ROUTE_RADIUS[m.kind])
  planReach = ROUTE_REACH[m.kind]
  planFromX = m.x
  planFromZ = m.z
  planGoalX = g.x
  planGoalZ = g.z
  planEnter = Math.max(g.within * 0.9, GOAL_OPEN)
  listOthers(s, m)
  if (runIsClear(g.x, g.z)) return keepRoute(s, m, g, null)
  const start = cellOf(m.x) + cellOf(m.z) * ROUTE_SIDE
  const end = cellOf(g.x) + cellOf(g.z) * ROUTE_SIDE
  markOthers()
  const length = search(start, end)
  if (length === 0) return keepRoute(s, m, g, null)
  let aimX = g.x
  let aimZ = g.z
  for (let i = length - 1; i >= 1; i--) {
    if (runIsClear(centreX(routePath[i]), centreZ(routePath[i]))) {
      aimX = centreX(routePath[i])
      aimZ = centreZ(routePath[i])
      break
    }
    const next = routePath[Math.max(1, i - 1)]
    aimX = centreX(next)
    aimZ = centreZ(next)
  }
  // A wheeled machine aims at least a turning circle ahead along the route, or at the goal itself when that is nearer: a nearer aim is inside its turn, so it would back away from it and shuttle.
  const look = spec.pivot > 0 ? 0 : (1.5 * spec.wheelbase) / Math.tan(spec.lock)
  if ((aimX - m.x) * (aimX - m.x) + (aimZ - m.z) * (aimZ - m.z) < look * look) {
    aimX = g.x
    aimZ = g.z
    for (let i = 0; i < length; i++) {
      const dx = centreX(routePath[i]) - m.x
      const dz = centreZ(routePath[i]) - m.z
      if (dx * dx + dz * dz >= look * look) {
        aimX = centreX(routePath[i])
        aimZ = centreZ(routePath[i])
        break
      }
    }
  }
  return keepRoute(s, m, g, [aimX, aimZ])
}

/** The aim as far off as the goal is, so the plan of `goalDrive` does not change with it. */
function virtualAim(m: Machine, g: Goal, aim: [number, number] | null): { x: number; z: number } | null {
  if (aim === null) return null
  const d = Math.sqrt((g.x - m.x) * (g.x - m.x) + (g.z - m.z) * (g.z - m.z))
  const len = Math.sqrt((aim[0] - m.x) * (aim[0] - m.x) + (aim[1] - m.z) * (aim[1] - m.z))
  if (len < 1e-6) return null
  wayPoint.x = m.x + ((aim[0] - m.x) / len) * d
  wayPoint.z = m.z + ((aim[1] - m.z) / len) * d
  return wayPoint
}

/** The ground's height under the point of a machine at local (lx, lz). */
const corner = (s: Sim, m: Machine, lx: number, lz: number): number => groundY(s, localX(m.x, m.yaw, lx, lz), localZ(m.z, m.yaw, lx, lz))

/** The ground under a machine's four corners: its ride height, pitch and roll, smoothed. */
function ride(s: Sim, m: Machine, dt: number): void {
  const spec = MACHINE_SPECS[m.kind]
  if (m.kind === 'tower') {
    m.y = groundY(s, m.x, m.z)
    return
  }
  const hl = spec.length / 2
  const hw = spec.width / 2
  const fl = corner(s, m, hw, hl)
  const fr = corner(s, m, -hw, hl)
  const rl = corner(s, m, hw, -hl)
  const rr = corner(s, m, -hw, -hl)
  const ty = (fl + fr + rl + rr) / 4
  const k = damp(10, dt)
  m.y = Math.abs(ty - m.y) > 2 ? ty : lerp(m.y, ty, k)
  m.pitch = lerp(m.pitch, clamp(Math.atan2((fl + fr - rl - rr) / 2, spec.length), -LEAN_LIMIT, LEAN_LIMIT), k)
  m.roll = lerp(m.roll, clamp(Math.atan2((fl + rl - fr - rr) / 2, spec.width), -LEAN_LIMIT, LEAN_LIMIT), k)
}

/** The lorry's trailer: it follows the hitch, folds no more than FOLD_LIMIT, and rides the ground under its hitch and axle. */
function stepTrailer(s: Sim, m: Semi, dt: number): void {
  m.trailerYaw += (m.speed / TRAILER_AXLE) * Math.sin(turnTo(m.trailerYaw, m.yaw)) * dt
  const fold = turnTo(m.trailerYaw, m.yaw)
  if (Math.abs(fold) > FOLD_LIMIT) m.trailerYaw = m.yaw - Math.sign(fold) * FOLD_LIMIT
  m.trailerYaw = turnTo(0, m.trailerYaw)
  const hitch = at(m, 0, HITCH_Z)
  const sin = Math.sin(m.trailerYaw)
  const cos = Math.cos(m.trailerYaw)
  const ax = hitch.x - sin * TRAILER_AXLE
  const az = hitch.z - cos * TRAILER_AXLE
  const gh = groundY(s, hitch.x, hitch.z)
  const ga = groundY(s, ax, az)
  const gl = groundY(s, ax + cos * 1.3, az - sin * 1.3)
  const gr = groundY(s, ax - cos * 1.3, az + sin * 1.3)
  const k = damp(10, dt)
  m.trailerY = lerp(m.trailerY, (gh + ga) / 2, k)
  m.trailerPitch = lerp(m.trailerPitch, clamp(Math.atan2(gh - ga, TRAILER_AXLE), -LEAN_LIMIT, LEAN_LIMIT), k)
  m.trailerRoll = lerp(m.trailerRoll, clamp(Math.atan2(gl - gr, 2.6), -LEAN_LIMIT, LEAN_LIMIT), k)
}

// ---------------------------------------------------------------------------------------
// One machine, one frame.

/** Moves one machine for `dt` seconds: a goal (if it has one) drives it, otherwise `cmd`; then its joints and what they do to the world. Throws if anything turns to NaN. */
export function stepMachine(s: Sim, m: Machine, cmd: Cmd, dt: number): void {
  if (!(dt > 0)) throw new Error(`stepMachine: dt must be above 0, got ${dt}`)
  const spec = MACHINE_SPECS[m.kind]
  m.honk = Math.max(0, m.honk - dt)
  let drive = clamp(cmd.drive, -1, 1)
  let steer = clamp(cmd.steer, -1, 1)
  let pace = 1
  const g = m.goal
  if (g !== null) {
    pace = g.pace
    if (distance(g.x - m.x, g.z - m.z) < g.within) {
      drive = 0
      steer = 0
      if (g.yaw !== null && Math.abs(turnTo(m.yaw, g.yaw)) > 0.05) {
        const err = turnTo(m.yaw, g.yaw)
        if (spec.pivot > 0) steer = clamp(err * 2.5, -1, 1)
        else m.yaw = turnTo(0, m.yaw + clamp(err, -SETTLE_TURN * dt, SETTLE_TURN * dt))
      }
      if (arrived(m, g) && !g.thenPress) m.goal = null
    } else {
      const way = route(s, m, g)
      const go = way === null ? goalDrive(m, g, g.x, g.z) : goalDrive(m, g, way.x, way.z)
      drive = go.drive
      steer = go.steer
    }
  }
  if (m.kind === 'mobile') {
    m.legs = clamp01(m.legs + (drive !== 0 || m.goal !== null || Math.abs(m.speed) > 0.3 ? -1 : 0.7) * dt)
    if (m.legs > 0.2) drive = 0
  }
  const slow = m.kind === 'dozer' && m.blade < 0.2 ? 1 - 0.5 * clamp01(m.pushing / 3) : 1
  const top = spec.top * pace * slow
  if (spec.top > 0) {
    const target = drive * top
    const accelerating = target * m.speed >= 0 && Math.abs(target) > Math.abs(m.speed)
    m.speed = toward(m.speed, target, (accelerating ? top / 2 : 4 * spec.top * Math.max(1, pace)) * dt)
    m.steer = toward(m.steer, steer, (spec.pivot > 0 ? 8 : 4) * dt)
    const omega = spec.pivot > 0 ? m.steer * spec.pivot : (m.speed / spec.wheelbase) * Math.tan(m.steer * spec.lock)
    m.yaw = turnTo(0, m.yaw + omega * dt)
    m.rollL += (m.speed - (omega * spec.width) / 2) * dt
    m.rollR += (m.speed + (omega * spec.width) / 2) * dt
    m.x += Math.sin(m.yaw) * m.speed * dt
    m.z += Math.cos(m.yaw) * m.speed * dt
    // A machine standing still has nothing to be pushed out of: whatever moves into it is pushed instead.
    if (m.speed !== 0 || omega !== 0) {
      const shove = pushOut(s, m)
      if (m.goal === null) {
        slideAlong(m, shove, dt)
        pushOut(s, m)
      }
    }
  }
  ride(s, m, dt)
  if (m.kind === 'semi') stepTrailer(s, m, dt)
  const work = Math.abs(cmd.a) + Math.abs(cmd.b) + Math.abs(cmd.c) + Math.abs(cmd.d)
  m.rev = lerp(m.rev, clamp01(0.2 + (0.5 * Math.abs(m.speed)) / Math.max(spec.top, 1) + 0.3 * clamp01(work)), damp(5, dt))

  switch (m.kind) {
    case 'digger':
      stepDigger(s, m, cmd, dt)
      break
    case 'dumper':
      stepDumper(s, m, cmd, dt)
      break
    case 'dozer':
      stepDozer(s, m, cmd, dt)
      break
    case 'roller':
      stepRoller(s, m, cmd, dt)
      break
    case 'mixer':
      stepMixer(s, m, cmd, dt)
      break
    case 'forklift':
      stepForklift(s, m, cmd, dt)
      break
    case 'tower':
    case 'mobile':
      stepCrane(s, m, cmd, dt)
      break
    case 'semi':
      stepSemi(s, m, cmd, dt)
      break
  }
  if (!(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z) && Number.isFinite(m.yaw) && Number.isFinite(m.speed) && Number.isFinite(m.pitch) && Number.isFinite(m.roll) && Number.isFinite(m.steer))) {
    throw new Error(`${m.kind} went to NaN or infinity: ${JSON.stringify({ x: m.x, y: m.y, z: m.z, yaw: m.yaw, speed: m.speed, pitch: m.pitch, roll: m.roll, steer: m.steer })}`)
  }
}

function stepDigger(s: Sim, m: Digger, cmd: Cmd, dt: number): void {
  m.swing = turnTo(0, m.swing + clamp(cmd.a, -1, 1) * RATES.swing * dt)
  m.boom = clamp(m.boom + clamp(cmd.b, -1, 1) * RATES.boom * dt, BOOM_RANGE[0], BOOM_RANGE[1])
  m.stick = clamp(m.stick + clamp(cmd.c, -1, 1) * RATES.stick * dt, STICK_RANGE[0], STICK_RANGE[1])
  m.curl = clamp(m.curl + clamp(cmd.d, -1, 1) * RATES.curl * dt, CURL_RANGE[0], CURL_RANGE[1])
  const { tip, angle } = armPoints(m)
  const ground = heightAt(s.terrain, tip.x, tip.z)
  if (tip.y < ground - 0.05) {
    if (m.load.amount < SCOOP - 1e-6) {
      const got = take(s.terrain, tip.x, tip.z, 1.3, Math.min(SCOOP - m.load.amount, (SCOOP / BITE_FOR) * dt))
      if (got.amount > 0) {
        addLoad(m.load, got.amount, got.kind)
        if (every(s, dt, 0.3)) s.events.push({ kind: 'bite', x: tip.x, y: tip.y, z: tip.z, stuff: got.kind })
      }
    }
    return
  }
  const open = clamp01((Math.cos(angle) - 0.55) / 0.45)
  if (open > 0 && m.load.amount > 1e-9) {
    const out = Math.min(m.load.amount, SPILL_RATE * open * dt)
    pourStuff(s, tip, tip.x, tip.z, out, m.load.kind, true, COINS.scoop / SCOOP, open)
    m.load.amount -= out
    if (m.load.amount < 1e-9) m.load.amount = 0
    if (every(s, dt, 0.4)) s.events.push({ kind: 'dump', x: tip.x, y: tip.y, z: tip.z, stuff: m.load.kind })
  }
}

function stepDumper(s: Sim, m: Dumper, cmd: Cmd, dt: number): void {
  m.bed = clamp01(m.bed + clamp(cmd.a, -1, 1) * RATES.bed * dt)
  if (m.bed <= 0.3 || m.load.amount <= 1e-9) return
  const out = Math.min(m.load.amount, (TIP_RATE * (m.bed - 0.3) * dt) / 0.7)
  const tail = bedTail(m)
  const back = at(m, 0, BED_HINGE_Z - 0.25 - 0.6 * m.bed)
  pourStuff(s, tail, back.x, back.z, out, m.load.kind, false, COINS.tip / DUMPER_CAP, m.bed)
  m.load.amount -= out
  if (m.load.amount < 1e-9) m.load.amount = 0
  if (every(s, dt, 0.5)) s.events.push({ kind: 'tip', x: back.x, y: tail.y, z: back.z, stuff: m.load.kind })
}

function stepDozer(s: Sim, m: Dozer, cmd: Cmd, dt: number): void {
  m.blade = clamp01(m.blade + clamp(cmd.a, -1, 1) * RATES.blade * dt)
  const fx = Math.sin(m.yaw)
  const fz = Math.cos(m.yaw)
  const down = m.blade < 0.2 && m.speed > 0.3
  const face = { x: m.x + fx * BLADE_Z, z: m.z + fz * BLADE_Z }
  // The blade cuts at the level under the tracks' rear, so a heap ahead is pushed and not ridden over. It leaves nothing higher behind than the ground it rides on, so the level never climbs.
  const rear = at(m, 0, -MACHINE_SPECS.dozer.length / 2)
  const level = Math.min(m.y, heightAt(s.terrain, rear.x, rear.z))
  if (down) bladePush(s.terrain, face.x, face.z, fx, fz, BLADE_WIDTH, 1, level)
  const riding = down ? surplusIn(s.terrain, { x: face.x + fx * 1.5, z: face.z + fz * 1.5, r: 2.2 }, level) : 0
  m.pushing = lerp(m.pushing, riding, damp(6, dt))
  if (m.pushing > 0.05 && every(s, dt, 0.5)) s.events.push({ kind: 'push', x: face.x, z: face.z })
}

function stepRoller(s: Sim, m: Roller, cmd: Cmd, dt: number): void {
  m.shake = Math.max(0, m.shake - 1.2 * dt)
  if (cmd.tap) {
    m.shake = 1
    s.events.push({ kind: 'stomp', x: m.x, z: m.z })
  }
  const moving = Math.abs(m.speed) > 0.5
  if (!moving && m.shake <= 0.1) return
  const drum = at(m, 0, DRUM_Z)
  const turned = rollOver(s.terrain, drum.x, drum.z, Math.sin(m.yaw), Math.cos(m.yaw), ROLL_WIDTH, dt * (moving ? 1 + 2 * m.shake : 0.5 * m.shake))
  if (turned > 0) {
    s.events.push({ kind: 'rolled', x: drum.x, z: drum.z })
    award(s, (turned * CELL * COINS.rolledMetre) / (ROAD_WIDTH / CELL + 1), drum.x, ROAD_Y, drum.z)
  }
}

function stepMixer(s: Sim, m: Mixer, cmd: Cmd, dt: number): void {
  m.chute = clamp01(m.chute + clamp(cmd.a, -1, 1) * RATES.chute * dt)
  const hopper = at(m, 0, HOPPER_Z)
  if (Math.hypot(m.x - WATER_RING.x, m.z - WATER_RING.z) < WATER_RING.r && Math.abs(m.speed) < 1 && m.sand > 0.05 && m.water < 1) {
    m.water = Math.min(1, m.water + dt / 1.5)
    s.watering = true
    s.streams.push({ stuff: 'water', fromX: WATER_COLUMN.x, fromY: 5, fromZ: WATER_COLUMN.z + WATER_COLUMN.r, toX: hopper.x, toY: m.y + HOPPER_Y, toZ: hopper.z, rate: 1 })
    if (every(s, dt, 0.5)) s.events.push({ kind: 'water', x: hopper.x, z: hopper.z })
  }
  const mixing = m.sand >= 0.9 * MIXER_SAND && m.water >= 1 - 1e-9
  if (mixing) {
    m.mixed = Math.min(1, m.mixed + dt / 3)
    if (m.mixed >= 1) {
      m.concrete = Math.min(1, m.concrete + m.sand / MIXER_SAND)
      m.sand = 0
      m.water = 0
      s.events.push({ kind: 'mixed', x: m.x, z: m.z })
    }
  } else if (m.concrete <= 1e-9) m.mixed = 0
  m.drum += dt * (0.8 + (mixing ? 2.6 : 0) + (m.concrete > 0 ? 0.6 : 0))
  if (m.chute > 0.5 && m.concrete > 0) {
    const out = Math.min(m.concrete, dt / 4)
    m.concrete = m.concrete - out < 1e-9 ? 0 : m.concrete - out
    const c = at(m, 0, CHUTE_Z)
    pourConcreteAt(s, m, c.x, c.z, out * MIXER_SAND)
    if (every(s, dt, 0.5)) s.events.push({ kind: 'pour', x: c.x, z: c.z })
  }
}

function pourConcreteAt(s: Sim, m: Mixer, x: number, z: number, volume: number): void {
  pourConcrete(s, x, z, volume)
  s.streams.push({ stuff: 'concrete', fromX: x, fromY: m.y + 1.2, fromZ: z, toX: x, toY: groundY(s, x, z), toZ: z, rate: 1 })
}

/** A held thing rides at its holder's point, every tick. */
function carry(s: Sim, id: number, p: Point, yaw: number, hangs: boolean, kind: 'forklift' | 'tower' | 'mobile'): void {
  const t = thingById(s, id)
  t.heldBy = kind
  t.x = p.x
  t.z = p.z
  t.y = hangs ? Math.max(groundY(s, p.x, p.z), p.y - THING_HEIGHT[t.kind]) : p.y
  t.yaw = yaw
}

function stepForklift(s: Sim, m: Forklift, cmd: Cmd, dt: number): void {
  m.lift = clamp01(m.lift + clamp(cmd.a, -1, 1) * RATES.forks * dt)
  const fork = forkPoint(m)
  if (cmd.tap) {
    if (m.holding < 0) m.holding = pickThing(s, 'forklift', fork.x, fork.y, fork.z, 1.3, 0.8)
    else {
      setDownThing(s, thingById(s, m.holding), fork.x, fork.z)
      m.holding = -1
    }
  }
  if (m.holding >= 0) carry(s, m.holding, fork, m.yaw, false, 'forklift')
}

function stepCrane(s: Sim, m: Tower | Mobile, cmd: Cmd, dt: number): void {
  const R = m.kind === 'tower' ? RATES.tower : RATES.mobile
  const top = m.kind === 'tower' ? HOOK_TOP_TOWER : HOOK_TOP_MOBILE
  const range = m.kind === 'tower' ? TROLLEY_RANGE : REACH_RANGE
  const ready = m.kind === 'tower' || m.legs > 0.95
  const a = ready ? clamp(cmd.a, -1, 1) : 0
  const b = ready ? clamp(cmd.b, -1, 1) : 0
  const c = ready ? clamp(cmd.c, -1, 1) : 0
  m.jib = turnTo(0, m.jib + a * R.jib * dt)
  if (m.kind === 'tower') m.trolley = clamp(m.trolley + b * R.reach * dt, range[0], range[1])
  else {
    m.reach = clamp(m.reach + b * R.reach * dt, range[0], range[1])
    if (m.legs < 0.5 && m.holding < 0) {
      m.jib = turnTo(0, m.jib + clamp(turnTo(m.jib, m.yaw + Math.PI), -2 * dt, 2 * dt))
      m.reach = toward(m.reach, REACH_RANGE[0], 6 * dt)
      m.hookY = toward(m.hookY, HOOK_TOP_MOBILE, 6 * dt)
    }
  }
  const out = m.kind === 'tower' ? m.trolley : m.reach
  const base = craneBase(m)
  const floor = groundY(s, base.x + Math.sin(m.jib) * out, base.z + Math.cos(m.jib) * out) + 0.3
  m.hookY = clamp(m.hookY + c * R.hook * dt, Math.min(floor, top), top)
  const sx = Math.sin(m.jib)
  const cz = Math.cos(m.jib)
  const along = b * R.reach + (m.kind === 'mobile' ? m.speed : 0) * 0
  const vx = sx * along + cz * a * R.jib * out + (m.kind === 'mobile' ? Math.sin(m.yaw) * m.speed : 0)
  const vz = cz * along - sx * a * R.jib * out + (m.kind === 'mobile' ? Math.cos(m.yaw) * m.speed : 0)
  const k = damp(3, dt)
  m.swayX = lerp(m.swayX, clamp(-vx * 0.12, -1.2, 1.2), k)
  m.swayZ = lerp(m.swayZ, clamp(-vz * 0.12, -1.2, 1.2), k)
  const hook = hookPoint(m)
  if (cmd.tap && ready) {
    if (m.holding < 0) m.holding = pickThing(s, m.kind, hook.x, hook.y, hook.z, 1.5, 1.2)
    else {
      setDownThing(s, thingById(s, m.holding), hook.x, hook.z)
      m.holding = -1
    }
  }
  if (m.holding >= 0) carry(s, m.holding, hook, m.jib, true, m.kind)
}

function stepSemi(s: Sim, m: Semi, cmd: Cmd, dt: number): void {
  const inSaw = Math.hypot(m.x - PLANTS.saw.ring.x, m.z - PLANTS.saw.ring.z) < PLANTS.saw.ring.r
  if (m.seq === 'rest' && m.logs < LOG_FULL && Math.abs(m.speed) < 1 && Math.hypot(m.x - FOREST_RING.x, m.z - FOREST_RING.z) < FOREST_RING.r) m.logs = Math.min(LOG_FULL, m.logs + dt / 2)
  if (cmd.tap) {
    if (m.seq === 'rest' && m.logs > 0 && inSaw) {
      m.seq = 'unload'
      m.seqT = 0
    } else s.events.push({ kind: 'uhuh', machine: 'semi' })
  }
  if (m.seq !== 'unload') return
  m.seqT += dt
  const out = Math.min(m.logs, dt / 2.5)
  m.logs -= out
  s.plants.saw.stored += out
  if (m.logs <= 1e-9 || !inSaw) {
    m.logs = m.logs <= 1e-9 ? 0 : m.logs
    m.seq = 'rest'
    m.seqT = 0
  }
}
