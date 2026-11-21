/**
 * The track as one soft toy: every slab of a course merged into a single outline with
 * round corners and smooth joins where slabs meet, the round holes cut out of it, then
 * built as a flat top, a rounded rim and a wall going down into the water, with a band
 * of foam round it on the water. The outline is the zero line of a distance field
 * sampled on a fine grid (marching squares), so joins, corners and holes crossing an
 * edge all come out round with no special cases. Built once per course and kept.
 */

import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'

import type { Course, Ground } from '../game/model'
import { WATER_Y } from './place'

/** How round the top edge is: the flat top stops this far inside the slab's edge and the rim curves down to the edge. */
export const RIM_R = 0.18
/** Each band of the top is this long; the top's texture holds two. */
export const BAND = 3
/** How round a slab's open corners are. */
const CORNER_R = 0.65
/** The wall goes down to here, well under the water. */
const WALL_BOTTOM = -1.4
/** Slabs this close melt together where they meet; where a hole crosses an edge the cut is rounded this much. */
const JOIN_K = 0.9
const HOLE_K = 0.45
/** The grid the field is sampled on, and how far from every slab the field stops caring. */
const STEP = 0.12
const FAR = 2
const RIM_RINGS = 6
/** The foam reaches this far out from the wall on open water, and less inside a hole. */
const FOAM_OUT = 0.6
const FOAM_IN_HOLE = 0.38

export interface TrackGeometry {
  /** The flat top, with uv.y running one texture repeat every two bands along the course. */
  cap: BufferGeometry
  /** The rounded edge from the top down to the wall. */
  rim: BufferGeometry
  /** The wall, with a vertex colour that darkens toward the water. */
  wall: BufferGeometry
  /** A band on the water round every edge, its vertex alpha fading outward. */
  foam: BufferGeometry
}

interface Slab {
  x0: number
  x1: number
  z0: number
  z1: number
  cx: number
  cz: number
  hx: number
  hz: number
  /** The corner radius in each quarter: +x+z, +x-z, -x+z, -x-z. A corner another slab carries on from stays square and the join is rounded instead. */
  radii: [number, number, number, number]
}

const inside = (g: Ground, x: number, z: number) => x >= g.x0 - 1e-6 && x <= g.x1 + 1e-6 && z >= g.z0 - 1e-6 && z <= g.z1 + 1e-6

function slabOf(g: Ground, all: readonly Ground[]): Slab {
  if (!(g.x1 > g.x0 && g.z1 > g.z0)) throw new Error(`a ground slab must have size: ${JSON.stringify(g)}`)
  const hx = (g.x1 - g.x0) / 2
  const hz = (g.z1 - g.z0) / 2
  const open = Math.min(CORNER_R, hx, hz)
  const e = 0.05
  const covered = (x: number, z: number) => all.some((o) => o !== g && inside(o, x, z))
  // A corner is square when the track carries on past either of its two edges.
  const radius = (sx: number, sz: number) => {
    const x = sx > 0 ? g.x1 : g.x0
    const z = sz > 0 ? g.z1 : g.z0
    return covered(x + sx * e, z - sz * e) || covered(x - sx * e, z + sz * e) ? 0 : open
  }
  return { x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1, cx: (g.x0 + g.x1) / 2, cz: (g.z0 + g.z1) / 2, hx, hz, radii: [radius(1, 1), radius(1, -1), radius(-1, 1), radius(-1, -1)] }
}

/** Signed distance to a slab with its own radius in each corner: negative inside. */
function slabDistance(s: Slab, x: number, z: number) {
  const dx = x - s.cx
  const dz = z - s.cz
  const r = dx > 0 ? (dz > 0 ? s.radii[0] : s.radii[1]) : dz > 0 ? s.radii[2] : s.radii[3]
  const qx = Math.abs(dx) - s.hx + r
  const qz = Math.abs(dz) - s.hz + r
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r
}

/** The smooth minimum: like min, but rounds the crease where two shapes meet. */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Douglas-Peucker on a closed loop of flat x, z pairs: drops the points that lie within `eps` of a straight line through their neighbours. */
function simplify(pts: number[], eps: number) {
  const n = pts.length / 2
  if (n < 8) return pts
  let far = 0
  let best = -1
  for (let i = 1; i < n; i++) {
    const d = (pts[2 * i]! - pts[0]!) ** 2 + (pts[2 * i + 1]! - pts[1]!) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[far] = 1
  const stack = [0, far, far, n]
  while (stack.length > 0) {
    const b = stack.pop()!
    const a = stack.pop()!
    const ax = pts[2 * a]!
    const az = pts[2 * a + 1]!
    const bx = pts[2 * (b % n)]!
    const bz = pts[2 * (b % n) + 1]!
    const lx = bx - ax
    const lz = bz - az
    const len = Math.hypot(lx, lz)
    let worst = -1
    let at = -1
    for (let i = a + 1; i < b; i++) {
      const px = pts[2 * i]! - ax
      const pz = pts[2 * i + 1]! - az
      const d = len > 1e-9 ? Math.abs(px * lz - pz * lx) / len : Math.hypot(px, pz)
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > eps) {
      keep[at] = 1
      stack.push(a, at, at, b)
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i]!, pts[2 * i + 1]!)
  return out
}

/** Twice the signed area of a loop in the x-z plane: positive when it runs anticlockwise (x right, z up). */
function area2(pts: readonly number[]) {
  let a = 0
  const n = pts.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += pts[2 * i]! * pts[2 * j + 1]! - pts[2 * j]! * pts[2 * i + 1]!
  }
  return a
}

function contains(pts: readonly number[], x: number, z: number) {
  let hit = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i]!
    const zi = pts[2 * i + 1]!
    const xj = pts[2 * j]!
    const zj = pts[2 * j + 1]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

/**
 * The outline of the track's flat top, in sim x, z: closed loops with the track on their
 * left, so the outside edges run anticlockwise and the holes clockwise. The top stops
 * RIM_R inside the true edge; the rim curves out to the edge.
 */
function outline(course: Course) {
  if (course.ground.length === 0) throw new Error(`course ${course.id} has no ground`)
  const slabs = course.ground.map((g) => slabOf(g, course.ground))
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const s of slabs) {
    minX = Math.min(minX, s.x0)
    maxX = Math.max(maxX, s.x1)
    minZ = Math.min(minZ, s.z0)
    maxZ = Math.max(maxZ, s.z1)
  }
  const x0 = minX - 1
  const z0 = minZ - 1
  const nx = Math.ceil((maxX + 1 - x0) / STEP)
  const nz = Math.ceil((maxZ + 1 - z0) / STEP)
  const w = nx + 1
  // The field minus the level of the top's edge: negative on the flat top.
  const f = new Float32Array(w * (nz + 1))
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * STEP
    const near = slabs.filter((s) => z >= s.z0 - FAR && z <= s.z1 + FAR)
    const holes = course.holes.filter((h) => Math.abs(z - h.z) <= h.r + FAR)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * STEP
      let d = FAR
      for (const s of near) if (x >= s.x0 - FAR && x <= s.x1 + FAR) d = smin(d, slabDistance(s, x, z), JOIN_K)
      let dh = FAR
      for (const h of holes) dh = Math.min(dh, Math.hypot(x - h.x, z - h.z) - h.r)
      if (dh < FAR) d = -smin(-d, dh, HOLE_K)
      f[j * w + i] = d + RIM_R
    }
  }

  // Marching squares. Edge ids: the horizontal edges first, then the vertical ones.
  const hCount = (nz + 1) * nx
  const hId = (i: number, j: number) => j * nx + i
  const vId = (i: number, j: number) => hCount + j * w + i
  const next = new Map<number, number>()
  const link = (from: number, to: number) => next.set(from, to)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = f[j * w + i]!
      const b = f[j * w + i + 1]!
      const c = f[(j + 1) * w + i + 1]!
      const d = f[(j + 1) * w + i]!
      const code = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0)
      if (code === 0 || code === 15) continue
      const e0 = hId(i, j)
      const e1 = vId(i + 1, j)
      const e2 = hId(i, j + 1)
      const e3 = vId(i, j)
      const centreIn = a + b + c + d < 0
      // Each piece runs with the inside on its left.
      switch (code) {
        case 1: link(e0, e3); break
        case 2: link(e1, e0); break
        case 3: link(e1, e3); break
        case 4: link(e2, e1); break
        case 5:
          if (centreIn) {
            link(e0, e1)
            link(e2, e3)
          } else {
            link(e0, e3)
            link(e2, e1)
          }
          break
        case 6: link(e2, e0); break
        case 7: link(e2, e3); break
        case 8: link(e3, e2); break
        case 9: link(e0, e2); break
        case 10:
          if (centreIn) {
            link(e3, e0)
            link(e1, e2)
          } else {
            link(e1, e0)
            link(e3, e2)
          }
          break
        case 11: link(e1, e2); break
        case 12: link(e3, e1); break
        case 13: link(e0, e1); break
        case 14: link(e3, e0); break
      }
    }
  }
  const crossing = (id: number, out: number[]) => {
    if (id < hCount) {
      const j = Math.floor(id / nx)
      const i = id - j * nx
      const a = f[j * w + i]!
      const b = f[j * w + i + 1]!
      out.push(x0 + (i + a / (a - b)) * STEP, z0 + j * STEP)
    } else {
      const k = id - hCount
      const j = Math.floor(k / w)
      const i = k - j * w
      const a = f[j * w + i]!
      const b = f[(j + 1) * w + i]!
      out.push(x0 + i * STEP, z0 + (j + a / (a - b)) * STEP)
    }
  }
  const loops: number[][] = []
  const used = new Set<number>()
  for (const start of next.keys()) {
    if (used.has(start)) continue
    const pts: number[] = []
    let e = start
    do {
      used.add(e)
      crossing(e, pts)
      const n = next.get(e)
      if (n === undefined) throw new Error(`the outline of course ${course.id} does not close`)
      e = n
    } while (e !== start)
    const simple = simplify(pts, 0.004)
    if (simple.length >= 6) loops.push(simple)
  }
  return loops
}

/** Builds the four geometries from the outline loops. */
function build(course: Course): TrackGeometry {
  const loops = outline(course)
  const outers = loops.filter((l) => area2(l) > 0)
  const holes = loops.filter((l) => area2(l) < 0)
  // Every hole goes to the smallest outside loop round it.
  const holesOf = outers.map(() => [] as number[][])
  for (const h of holes) {
    let best = -1
    for (let i = 0; i < outers.length; i++) {
      if (!contains(outers[i]!, h[0]!, h[1]!)) continue
      if (best < 0 || area2(outers[i]!) < area2(outers[best]!)) best = i
    }
    if (best < 0) throw new Error(`a hole in course ${course.id} is outside the track`)
    holesOf[best]!.push(h)
  }

  // ---------------------------------------------------------------- the flat top
  const capPos: number[] = []
  const capUv: number[] = []
  const capIdx: number[] = []
  outers.forEach((outer, oi) => {
    const toV = (l: number[]) => Array.from({ length: l.length / 2 }, (_, i) => new Vector2(l[2 * i]!, l[2 * i + 1]!))
    const contour = toV(outer)
    const inner = holesOf[oi]!.map(toV)
    const flat = [...contour, ...inner.flat()]
    const base = capPos.length / 3
    for (const p of flat) {
      capPos.push(p.x, 0, -p.y)
      capUv.push(p.x / (2 * BAND), p.y / (2 * BAND))
    }
    for (const [a, b, c] of ShapeUtils.triangulateShape(contour, inner)) {
      const pa = flat[a!]!
      const pb = flat[b!]!
      const pc = flat[c!]!
      // Anticlockwise in sim x, z faces up once z is flipped into three's space.
      const ccw = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x) > 0
      capIdx.push(base + a!, base + (ccw ? b! : c!), base + (ccw ? c! : b!))
    }
  })
  const cap = new BufferGeometry()
  cap.setAttribute('position', new Float32BufferAttribute(capPos, 3))
  cap.setAttribute('normal', new Float32BufferAttribute(capPos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  cap.setAttribute('uv', new Float32BufferAttribute(capUv, 2))
  cap.setIndex(capIdx)
  cap.computeBoundingSphere()

  // ---------------------------------------------------------------- rings round every loop
  /** The outward normal at every point of a loop (away from the track: into the water, or into the hole). */
  const normals = (l: number[]) => {
    const n = l.length / 2
    const out = new Float32Array(l.length)
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n
      const q = (i + 1) % n
      // With the track on the left, an edge (dx, dz) has its outside toward (dz, -dx).
      let ax = l[2 * i + 1]! - l[2 * p + 1]!
      let az = -(l[2 * i]! - l[2 * p]!)
      let bx = l[2 * q + 1]! - l[2 * i + 1]!
      let bz = -(l[2 * q]! - l[2 * i]!)
      const la = Math.hypot(ax, az) || 1
      const lb = Math.hypot(bx, bz) || 1
      ax /= la
      az /= la
      bx /= lb
      bz /= lb
      const sx = ax + bx
      const sz = az + bz
      const ls = Math.hypot(sx, sz) || 1
      out[2 * i] = sx / ls
      out[2 * i + 1] = sz / ls
    }
    return out
  }

  /**
   * A band of quads round a loop between consecutive rings: ring k + 1 lies further out
   * or further down than ring k, which makes every quad face away from the track.
   */
  const ringBand = (idx: number[], base: number, n: number, rings: number) => {
    for (let k = 0; k + 1 < rings; k++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const a = base + k * n + i
        const b = base + (k + 1) * n + i
        const c = base + (k + 1) * n + j
        const d = base + k * n + j
        idx.push(a, b, c, a, c, d)
      }
    }
  }

  const rimPos: number[] = []
  const rimNor: number[] = []
  const rimIdx: number[] = []
  const wallPos: number[] = []
  const wallNor: number[] = []
  const wallCol: number[] = []
  const wallIdx: number[] = []
  const foamPos: number[] = []
  const foamCol: number[] = []
  const foamIdx: number[] = []
  for (const l of loops) {
    const n = l.length / 2
    const nor = normals(l)
    const hole = area2(l) < 0
    // The rim: a quarter round from the top's edge out and down to the wall.
    const rimBase = rimPos.length / 3
    for (let k = 0; k <= RIM_RINGS; k++) {
      const a = (k / RIM_RINGS) * (Math.PI / 2)
      const off = RIM_R * Math.sin(a)
      const y = -RIM_R * (1 - Math.cos(a))
      for (let i = 0; i < n; i++) {
        const nx = nor[2 * i]!
        const nz = nor[2 * i + 1]!
        rimPos.push(l[2 * i]! + nx * off, y, -(l[2 * i + 1]! + nz * off))
        rimNor.push(nx * Math.sin(a), Math.cos(a), -nz * Math.sin(a))
      }
    }
    ringBand(rimIdx, rimBase, n, RIM_RINGS + 1)
    // The wall, straight down from the rim into the water.
    const wallBase = wallPos.length / 3
    for (const [y, shade] of [
      [-RIM_R, 1],
      [WALL_BOTTOM, 0.55],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const nx = nor[2 * i]!
        const nz = nor[2 * i + 1]!
        wallPos.push(l[2 * i]! + nx * RIM_R, y, -(l[2 * i + 1]! + nz * RIM_R))
        wallNor.push(nx, 0, -nz)
        wallCol.push(shade, shade, shade)
      }
    }
    ringBand(wallIdx, wallBase, n, 2)
    // The foam on the water, fading out from the wall.
    const foamBase = foamPos.length / 3
    for (const [off, alpha] of [
      [RIM_R + 0.02, 0.9],
      [RIM_R + (hole ? FOAM_IN_HOLE : FOAM_OUT), 0],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const nx = nor[2 * i]!
        const nz = nor[2 * i + 1]!
        foamPos.push(l[2 * i]! + nx * off, WATER_Y + 0.012, -(l[2 * i + 1]! + nz * off))
        foamCol.push(1, 1, 1, alpha)
      }
    }
    ringBand(foamIdx, foamBase, n, 2)
  }
  const rim = new BufferGeometry()
  rim.setAttribute('position', new Float32BufferAttribute(rimPos, 3))
  rim.setAttribute('normal', new Float32BufferAttribute(rimNor, 3))
  rim.setIndex(rimIdx)
  rim.computeBoundingSphere()
  const wall = new BufferGeometry()
  wall.setAttribute('position', new Float32BufferAttribute(wallPos, 3))
  wall.setAttribute('normal', new Float32BufferAttribute(wallNor, 3))
  wall.setAttribute('color', new Float32BufferAttribute(wallCol, 3))
  wall.setIndex(wallIdx)
  wall.computeBoundingSphere()
  const foam = new BufferGeometry()
  foam.setAttribute('position', new Float32BufferAttribute(foamPos, 3))
  foam.setAttribute('normal', new Float32BufferAttribute(foamPos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  foam.setAttribute('color', new Float32BufferAttribute(foamCol, 4))
  foam.setIndex(foamIdx)
  foam.computeBoundingSphere()
  return { cap, rim, wall, foam }
}

const built = new WeakMap<Course, TrackGeometry>()

/** The track of a course, built on first use and kept: a course never changes, and a new run of it reuses the same geometry. */
export function trackGeometry(course: Course): TrackGeometry {
  let g = built.get(course)
  if (g === undefined) {
    g = build(course)
    built.set(course, g)
  }
  return g
}

/** Whether a point of sim x, z is on some slab (holes not counted): what the stage asks before it puts a rim round a hole. */
export function onGround(course: Course, x: number, z: number) {
  return course.ground.some((g) => inside(g, x, z))
}
