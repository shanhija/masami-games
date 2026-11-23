/**
 * Magic House: the shapes of solids in the plane of the side view, and their footprints on the floor
 * from high up, and the questions the sim asks of them. Plain numbers only.
 *
 * A solid this frame is an Outline: a convex polygon (a box or a ramp, turned by its own turn and
 * its mover's) or a circle (a ball), with its bounding box kept beside it for a quick first test.
 * Players and loose things are axis-aligned boxes. The questions:
 * - overlaps: does the outline overlap a box (touching is not overlapping, by EPS)?
 * - topOver / bottomUnder: the highest point of the outline's upper side over a stretch of x, with
 *   its slope there, and the lowest of its lower side: a floor under the feet and a ceiling over the
 *   head, for any shape, ramps and turned boxes too.
 * - pushOut: the shortest move that takes a box out of the outline (a mover pushing someone).
 * - contains: a point inside it (a tap).
 *
 * From high up (step 6) an Outline is the solid's footprint on the floor instead: the same convex
 * polygon or circle, in the plane of x and z (xs holds x and ys holds z; cx, cy are the middle's x
 * and z; minY, maxY its z range), with its heights beside it (y0, y1, ym) and, for a ramp, how its
 * top rises (grade along ux, uz). The plane's own questions then ask about footprints, and these
 * add the heights:
 * - sliceAt: the footprint of the part of the solid between two heights, as an Outline the plane's
 *   questions take: what stands in a body's way, and whether a box overlaps the solid at all.
 * - topOverFoot / bottomUnderFoot: the highest top over a rectangle of the floor, with which way and
 *   how steeply it rises there, and the lowest bottom under it.
 */

import { cos, sin } from './math'

/** How far apart two shapes must overlap before it counts, metres: a body standing on a floor touches it and does not overlap it. */
export const EPS = 1e-4

/** A solid's shape in the room this frame. Updated in place, so the sim allocates none per frame. */
export interface Outline {
  kind: 'poly' | 'circle'
  /** The polygon's corners, counterclockwise (3 or 4); unused for a circle. */
  xs: number[]
  ys: number[]
  n: number
  /** The circle's middle and radius; for a polygon, its middle and 0. */
  cx: number
  cy: number
  r: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Added in step 6, from high up only (0 from the side): the solid's bottom, top and middle heights. */
  y0: number
  y1: number
  ym: number
  /** From high up: a ramp's top rises `grade` metres a metre along (ux, uz) on the floor, from ym at the middle; 0 for a box or a ball. */
  grade: number
  /** From high up: the footprint's own axes, u = (ux, uz) (a ramp's rising way, a box's own x) and v = (-uz, ux), and its half sizes along them. */
  ux: number
  uz: number
  hu: number
  hv: number
}

export function emptyOutline(): Outline {
  return { kind: 'poly', xs: [0, 0, 0, 0], ys: [0, 0, 0, 0], n: 0, cx: 0, cy: 0, r: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, y0: 0, y1: 0, ym: 0, grade: 0, ux: 0, uz: 0, hu: 0, hv: 0 }
}

/** What a solid is, as the outline needs it: a box or a ramp of half-size hw, hh, or a ball of radius r. */
export type Form = { kind: 'box'; hw: number; hh: number } | { kind: 'ramp'; hw: number; hh: number; right: boolean } | { kind: 'ball'; r: number }

/** Sets `o` to the form placed with its middle at (x, y), turned by `turn` radians counterclockwise. */
export function setOutline(o: Outline, form: Form, x: number, y: number, turn: number): void {
  o.cx = x
  o.cy = y
  if (form.kind === 'ball') {
    o.kind = 'circle'
    o.n = 0
    o.r = form.r
    o.minX = x - form.r
    o.maxX = x + form.r
    o.minY = y - form.r
    o.maxY = y + form.r
    return
  }
  o.kind = 'poly'
  o.r = 0
  const { hw, hh } = form
  // Counterclockwise corners round the middle, before the turn.
  let lx: number[]
  let ly: number[]
  if (form.kind === 'box') {
    lx = [-hw, hw, hw, -hw]
    ly = [-hh, -hh, hh, hh]
  } else if (form.right) {
    lx = [-hw, hw, hw]
    ly = [-hh, -hh, hh]
  } else {
    lx = [-hw, hw, -hw]
    ly = [-hh, -hh, hh]
  }
  o.n = lx.length
  const c = turn === 0 ? 1 : cos(turn)
  const s = turn === 0 ? 0 : sin(turn)
  o.minX = Infinity
  o.maxX = -Infinity
  o.minY = Infinity
  o.maxY = -Infinity
  for (let i = 0; i < o.n; i++) {
    const px = x + c * lx[i] - s * ly[i]
    const py = y + s * lx[i] + c * ly[i]
    o.xs[i] = px
    o.ys[i] = py
    if (px < o.minX) o.minX = px
    if (px > o.maxX) o.maxX = px
    if (py < o.minY) o.minY = py
    if (py > o.maxY) o.maxY = py
  }
}

/** Whether the outline overlaps the box [x0, x1] by [y0, y1] by more than EPS (separating axes). */
export function overlaps(o: Outline, x0: number, y0: number, x1: number, y1: number): boolean {
  if (o.maxX <= x0 + EPS || o.minX >= x1 - EPS || o.maxY <= y0 + EPS || o.minY >= y1 - EPS) return false
  if (o.kind === 'circle') {
    const qx = o.cx < x0 ? x0 : o.cx > x1 ? x1 : o.cx
    const qy = o.cy < y0 ? y0 : o.cy > y1 ? y1 : o.cy
    const dx = o.cx - qx
    const dy = o.cy - qy
    const rr = o.r - EPS
    return dx * dx + dy * dy < rr * rr
  }
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    // Outward normal of a counterclockwise edge.
    const nx = o.ys[j] - o.ys[i]
    const ny = o.xs[i] - o.xs[j]
    const len = Math.sqrt(nx * nx + ny * ny)
    const d = (nx * o.xs[i] + ny * o.ys[i]) / len
    const bx = nx >= 0 ? x0 : x1
    const by = ny >= 0 ? y0 : y1
    if ((nx * bx + ny * by) / len >= d - EPS) return false
  }
  return true
}

/** Whether the point is inside the outline. */
export function contains(o: Outline, x: number, y: number): boolean {
  if (x < o.minX || x > o.maxX || y < o.minY || y > o.maxY) return false
  if (o.kind === 'circle') return (x - o.cx) * (x - o.cx) + (y - o.cy) * (y - o.cy) <= o.r * o.r
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    if ((o.ys[j] - o.ys[i]) * (x - o.xs[i]) + (o.xs[i] - o.xs[j]) * (y - o.ys[i]) > 0) return false
  }
  return true
}

/** The outline's upper (up true) or lower side at x, and the slope dy/dx of the edge it is on there; null where x is outside it. */
function side(o: Outline, x: number, up: boolean, out: { y: number; slope: number }): boolean {
  if (x < o.minX || x > o.maxX) return false
  if (o.kind === 'circle') {
    const dx = x - o.cx
    const h = Math.sqrt(Math.max(0, o.r * o.r - dx * dx))
    out.y = up ? o.cy + h : o.cy - h
    out.slope = h === 0 ? (dx > 0 === up ? -Infinity : Infinity) : up ? -dx / h : dx / h
    return true
  }
  let found = false
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    const ax = o.xs[i]
    const bx = o.xs[j]
    if (x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue
    let y: number
    let slope: number
    if (ax === bx) {
      y = up ? Math.max(o.ys[i], o.ys[j]) : Math.min(o.ys[i], o.ys[j])
      slope = 0
    } else {
      slope = (o.ys[j] - o.ys[i]) / (bx - ax)
      y = o.ys[i] + slope * (x - ax)
    }
    if (!found || (up ? y > out.y : y < out.y)) {
      out.y = y
      out.slope = slope
      found = true
    }
  }
  return found
}

const probe = { y: 0, slope: 0 }

/**
 * The highest point of the outline's upper side over x in [a, b], and its slope (dy/dx) there; the
 * slope is 0 where that point is a peak or a corner inside the stretch, so a corner stands. Gives
 * false where the outline is not over the stretch at all.
 */
export function topOver(o: Outline, a: number, b: number, out: { y: number; slope: number }): boolean {
  return extreme(o, a, b, true, out)
}

/** The lowest point of the outline's lower side under x in [a, b]; false where it is not under the stretch. */
export function bottomUnder(o: Outline, a: number, b: number, out: { y: number; slope: number }): boolean {
  return extreme(o, a, b, false, out)
}

function extreme(o: Outline, a: number, b: number, up: boolean, out: { y: number; slope: number }): boolean {
  const lo = Math.max(a, o.minX)
  const hi = Math.min(b, o.maxX)
  if (lo > hi) return false
  let found = false
  const take = (x: number, ownSlope: boolean) => {
    if (!side(o, x, up, probe)) return
    if (!found || (up ? probe.y > out.y + 1e-12 : probe.y < out.y - 1e-12)) {
      out.y = probe.y
      out.slope = ownSlope ? probe.slope : 0
      found = true
    } else if (Math.abs(probe.y - out.y) <= 1e-12 && Math.abs(ownSlope ? probe.slope : 0) < Math.abs(out.slope)) {
      out.slope = ownSlope ? probe.slope : 0
    }
  }
  // An end of the stretch keeps its edge's slope only where the stretch was not cut by the outline's own edge.
  take(lo, lo === a)
  take(hi, hi === b)
  if (o.kind === 'circle') {
    if (o.cx > lo && o.cx < hi) take(o.cx, false)
  } else {
    for (let i = 0; i < o.n; i++) if (o.xs[i] > lo && o.xs[i] < hi) take(o.xs[i], false)
  }
  return found
}

/**
 * The shortest move [dx, dy] that takes the box out of the outline (separating axes, the least
 * overlap); [0, 0] when they do not overlap.
 */
export function pushOut(o: Outline, x0: number, y0: number, x1: number, y1: number): [number, number] {
  if (!overlaps(o, x0, y0, x1, y1)) return [0, 0]
  // The box's own axes first.
  let best = o.maxX - x0
  let mx = best
  let my = 0
  const tryAxis = (depth: number, dx: number, dy: number) => {
    if (depth < best) {
      best = depth
      mx = dx * depth
      my = dy * depth
    }
  }
  tryAxis(x1 - o.minX, -1, 0)
  tryAxis(o.maxY - y0, 0, 1)
  tryAxis(y1 - o.minY, 0, -1)
  if (o.kind === 'circle') {
    const qx = o.cx < x0 ? x0 : o.cx > x1 ? x1 : o.cx
    const qy = o.cy < y0 ? y0 : o.cy > y1 ? y1 : o.cy
    const dx = qx - o.cx
    const dy = qy - o.cy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 1e-9) {
      const nx = dx / len
      const ny = dy / len
      // How far the box reaches back toward the middle along n, against the radius.
      const back = Math.min(nx * x0, nx * x1) + Math.min(ny * y0, ny * y1) - (nx * o.cx + ny * o.cy)
      tryAxis(o.r - back, nx, ny)
    }
    return [mx, my]
  }
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1
    let nx = o.ys[j] - o.ys[i]
    let ny = o.xs[i] - o.xs[j]
    const len = Math.sqrt(nx * nx + ny * ny)
    nx /= len
    ny /= len
    const d = nx * o.xs[i] + ny * o.ys[i]
    const boxMin = Math.min(nx * x0, nx * x1) + Math.min(ny * y0, ny * y1)
    tryAxis(d - boxMin, nx, ny)
  }
  return [mx, my]
}

// ------------------------------------------------------------------------------ footprints, from high up

/** What a solid is from high up: a box or a ramp of half sizes hw (x), hh (y), hd (z), the ramp rising toward its way, or a ball of radius r. */
export type FloorForm =
  | { kind: 'box'; hw: number; hh: number; hd: number }
  | { kind: 'ramp'; hw: number; hh: number; hd: number; rises: 'right' | 'left' | 'back' | 'front' }
  | { kind: 'ball'; r: number }

/** Sets the corners of a rectangle round (cx, cy) on axes u, v with half sizes hu, hv, counterclockwise in the plane of x and z, and its bounds. */
function rectangle(o: Outline, cx: number, cz: number, ux: number, uz: number, u0: number, u1: number, hv: number): void {
  const vx = -uz
  const vz = ux
  const us = [u0, u1, u1, u0]
  const vs = [-hv, -hv, hv, hv]
  o.kind = 'poly'
  o.n = 4
  o.minX = Infinity
  o.maxX = -Infinity
  o.minY = Infinity
  o.maxY = -Infinity
  for (let i = 0; i < 4; i++) {
    const px = cx + us[i] * ux + vs[i] * vx
    const pz = cz + us[i] * uz + vs[i] * vz
    o.xs[i] = px
    o.ys[i] = pz
    if (px < o.minX) o.minX = px
    if (px > o.maxX) o.maxX = px
    if (pz < o.minY) o.minY = pz
    if (pz > o.maxY) o.maxY = pz
  }
}

/**
 * Sets `o` to the footprint of the form with its middle at (x, y, z), turned by `turn` radians round
 * y, counterclockwise as seen from above (+x turns toward -z): a turned rectangle for a box or a
 * ramp, a circle for a ball, with its heights.
 */
export function setFootprint(o: Outline, form: FloorForm, x: number, y: number, z: number, turn: number): void {
  o.cx = x
  o.cy = z
  o.ym = y
  if (form.kind === 'ball') {
    o.kind = 'circle'
    o.n = 0
    o.r = form.r
    o.minX = x - form.r
    o.maxX = x + form.r
    o.minY = z - form.r
    o.maxY = z + form.r
    o.y0 = y - form.r
    o.y1 = y + form.r
    o.grade = 0
    o.ux = 1
    o.uz = 0
    o.hu = form.r
    o.hv = form.r
    return
  }
  o.r = 0
  o.y0 = y - form.hh
  o.y1 = y + form.hh
  const c = turn === 0 ? 1 : cos(turn)
  const s = turn === 0 ? 0 : sin(turn)
  // The form's own x turned is (c, -s), its own z (s, c). A ramp's u is the way it rises.
  const rises = form.kind === 'ramp' ? form.rises : 'right'
  const along = rises === 'right' || rises === 'left'
  const sign = rises === 'left' || rises === 'back' ? -1 : 1
  o.ux = sign * (along ? c : s)
  o.uz = sign * (along ? -s : c)
  o.hu = along ? form.hw : form.hd
  o.hv = along ? form.hd : form.hw
  o.grade = form.kind === 'ramp' ? form.hh / o.hu : 0
  rectangle(o, x, z, o.ux, o.uz, -o.hu, o.hu, o.hv)
}

/**
 * The footprint of the part of a solid (from high up) between heights ya and yb, set into `out`;
 * false where none of it is there. Touching is not reaching in, by EPS. A box is its whole
 * footprint; a ramp the part of it whose top is over ya; a ball its widest circle between the two.
 */
export function sliceAt(o: Outline, ya: number, yb: number, out: Outline): boolean {
  if (o.y1 <= ya + EPS || o.y0 >= yb - EPS) return false
  out.cx = o.cx
  out.cy = o.cy
  out.ym = o.ym
  out.y0 = o.y0
  out.y1 = o.y1
  out.grade = o.grade
  out.ux = o.ux
  out.uz = o.uz
  out.hv = o.hv
  if (o.kind === 'circle') {
    const d = o.ym < ya ? ya - o.ym : o.ym > yb ? o.ym - yb : 0
    const rr = o.r * o.r - d * d
    if (rr <= EPS * EPS) return false
    const r = d === 0 ? o.r : Math.sqrt(rr)
    out.kind = 'circle'
    out.n = 0
    out.r = r
    out.hu = r
    out.minX = o.cx - r
    out.maxX = o.cx + r
    out.minY = o.cy - r
    out.maxY = o.cy + r
    return true
  }
  out.r = 0
  out.hu = o.hu
  const from = o.grade === 0 ? -o.hu : Math.max(-o.hu, (ya - o.ym) / o.grade)
  if (from >= o.hu - EPS) return false
  if (from === -o.hu) {
    out.kind = 'poly'
    out.n = o.n
    for (let i = 0; i < o.n; i++) {
      out.xs[i] = o.xs[i]
      out.ys[i] = o.ys[i]
    }
    out.minX = o.minX
    out.maxX = o.maxX
    out.minY = o.minY
    out.maxY = o.maxY
    return true
  }
  rectangle(out, o.cx, o.cy, o.ux, o.uz, from, o.hu, o.hv)
  return true
}

/**
 * The most of a footprint's own u over where the rectangle [x0, x1] by [z0, z1] meets its strip
 * |v| <= hv (the rectangle's corners inside the strip, and where its edges cross the strip's two
 * sides); -Infinity where the rectangle misses the strip.
 */
function mostU(o: Outline, x0: number, z0: number, x1: number, z1: number): number {
  const vx = -o.uz
  const vz = o.ux
  const xs = [x0, x1, x1, x0]
  const zs = [z0, z0, z1, z1]
  const us = [0, 0, 0, 0]
  const vs = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const dx = xs[i] - o.cx
    const dz = zs[i] - o.cy
    us[i] = dx * o.ux + dz * o.uz
    vs[i] = dx * vx + dz * vz
  }
  let most = -Infinity
  for (let i = 0; i < 4; i++) {
    if (vs[i] >= -o.hv && vs[i] <= o.hv && us[i] > most) most = us[i]
    const j = i + 1 === 4 ? 0 : i + 1
    for (const side of [-o.hv, o.hv]) {
      if ((vs[i] - side) * (vs[j] - side) >= 0 || vs[i] === vs[j]) continue
      const u = us[i] + ((us[j] - us[i]) * (side - vs[i])) / (vs[j] - vs[i])
      if (u > most) most = u
    }
  }
  return most
}

/** A top or a bottom over the floor: its height, and its rise there, dy/dx and dy/dz (0, 0 where it is flat or a peak). */
export interface FloorTop {
  y: number
  gx: number
  gz: number
}

/**
 * The highest point of a solid's top (from high up) over the rectangle [x0, x1] by [z0, z1] of the
 * floor, with how it rises there; false where the solid is not over it. A box's top is flat; a
 * ramp's rises toward its way (flat where the rectangle reaches its high end, so its edge stands);
 * a ball's is the sphere over the rectangle's point nearest its middle.
 */
export function topOverFoot(o: Outline, x0: number, z0: number, x1: number, z1: number, out: FloorTop): boolean {
  return floorSide(o, x0, z0, x1, z1, true, out)
}

/** The lowest point of a solid's bottom (from high up) under the rectangle: flat for a box and a ramp; false where the solid is not over it. */
export function bottomUnderFoot(o: Outline, x0: number, z0: number, x1: number, z1: number, out: FloorTop): boolean {
  return floorSide(o, x0, z0, x1, z1, false, out)
}

function floorSide(o: Outline, x0: number, z0: number, x1: number, z1: number, up: boolean, out: FloorTop): boolean {
  if (o.kind === 'circle') {
    const qx = o.cx < x0 ? x0 : o.cx > x1 ? x1 : o.cx
    const qz = o.cy < z0 ? z0 : o.cy > z1 ? z1 : o.cy
    const dx = qx - o.cx
    const dz = qz - o.cy
    const dd = dx * dx + dz * dz
    if (dd >= o.r * o.r - EPS * EPS) return false
    const h = Math.sqrt(o.r * o.r - dd)
    out.y = up ? o.ym + h : o.ym - h
    out.gx = up ? -dx / h : dx / h
    out.gz = up ? -dz / h : dz / h
    return true
  }
  if (!overlaps(o, x0, z0, x1, z1)) return false
  out.gx = 0
  out.gz = 0
  if (!up) {
    out.y = o.y0
    return true
  }
  if (o.grade === 0) {
    out.y = o.y1
    return true
  }
  const u = mostU(o, x0, z0, x1, z1)
  if (u >= o.hu - 1e-9) {
    out.y = o.y1
    return true
  }
  out.y = o.ym + o.grade * u
  out.gx = o.grade * o.ux
  out.gz = o.grade * o.uz
  return true
}
