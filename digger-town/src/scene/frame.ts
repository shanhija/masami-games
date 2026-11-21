/**
 * The camera's pure arithmetic: which distance and middle show a set of points inside a part of the
 * screen, what easy mode frames for a machine and its ring, how far the screen's lens is shifted so that part is its middle, how to pull a point
 * back into view, where an arrow for an off-screen point sits on the edge of that part, and how
 * near a line of sight passes to a tall thing.
 */

import { clamp } from '../game/math'
import { COUNTER_JIB, HOOK_TOP_MOBILE, JIB_LEN, MACHINE_SPECS } from '../game/model'
import type { Machine, Pointer } from '../game/model'
import { hookPoint } from '../game/machines'

/** x, y, z in metres. */
export type Pt = [x: number, y: number, z: number]

/** A part of the screen in pixels. */
export interface Area {
  left: number
  top: number
  right: number
  bottom: number
}

/** The camera's vertical field of view in degrees. */
export const FOV = 38
/** The narrowest stretch of ground the area shows at a party that has a small landmark to show close, in metres. */
const NARROWEST_PARTY = 12
/** The farthest a ray is followed to the ground: a ray parameter (the ray's direction is about a unit vector, so about metres along the ray from the eye, not metres on the ground from the camera's middle). A ray level with or above the horizon takes this value as its parameter; no screen of a party reaches it. */
const GROUND_REACH = 400

/** How much of the area the framed points may fill. */
const FILL = 0.8
/** A machine pulled into view lands inside this share of the area. */
const INSIDE = 0.9
/** A machine too far from its target to frame both drifts out from the middle up to this share of the area's half size. */
const DRIFT = 0.8
/** The share of the area's half size a point may lie past INSIDE and still count as inside: pullIn lands on the line, to a rounding. */
const SLACK = 0.01

/** Points around a place: the four corners at the ground and at `high`. */
export function around(pts: Pt[], x: number, y: number, z: number, rx: number, rz: number, high: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pts.push([x + sx * rx, y, z + sz * rz], [x + sx * rx, y + high, z + sz * rz])
    }
  }
}

/** The middle of a ring on the ground and its four sides, half a metre up. */
export function ringPoints(pts: Pt[], x: number, y: number, z: number, r: number): void {
  pts.push([x, y + 0.5, z])
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pts.push([x + dx * r, y + 0.5, z + dz * r])
}

/** A party fills this much of the free area with the points it shows, more than easy mode does: the screen shows no more ground than it must, as that ground is kept clear of machines. */
const PARTY_FILL = 0.95

/** The camera a party has: `fit` with the party's fill and narrowest view, looking north. */
export function partyFit(pts: readonly Pt[], tilt: number, tanH: number, tanV: number): { cx: number; cy: number; cz: number; d: number } {
  const k = PARTY_FILL / FILL
  return fit(pts, EASY_YAW, tilt, tanH * k, tanV * k, NARROWEST_PARTY * k, null, null)
}

/** The tan of the half angles the area spans, from the tan of the whole screen's half height. */
export function areaTans(tanV: number, height: number, area: Area): { tanH: number; tanV: number } {
  return { tanH: (tanV * (area.right - area.left)) / height, tanV: (tanV * (area.bottom - area.top)) / height }
}

/** Where to shift the lens, in pixels for `PerspectiveCamera.setViewOffset`, so the point the camera looks at lands in the middle of the area. */
export function lensShift(width: number, height: number, area: Area): { x: number; y: number } {
  return { x: width / 2 - (area.left + area.right) / 2, y: height / 2 - (area.top + area.bottom) / 2 }
}

/** The screen's right, up and forward for a camera that looks along `yaw` from `tilt` below the horizon. */
export function basis(yaw: number, tilt: number): { right: Pt; up: Pt; fwd: Pt } {
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const fwd: Pt = [Math.sin(yaw) * cosT, -sinT, Math.cos(yaw) * cosT]
  const right: Pt = [-Math.cos(yaw), 0, Math.sin(yaw)]
  const up: Pt = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]]
  return { right, up, fwd }
}

/**
 * Where the ray through screen pixel (px, py) meets the ground at height 0, as x and z, for a camera that looks at (cx, cy, cz) from `d` away along `yaw` and `tilt`,
 * with its lens shifted so that point lands in the middle of `free` (as Camera.tsx does), on a screen of `height` pixels tall.
 * A ray that does not meet the ground lands `GROUND_REACH` out.
 */
export function groundAt(mid: { cx: number; cy: number; cz: number; d: number }, yaw: number, tilt: number, height: number, free: Area, px: number, py: number): [x: number, z: number] {
  const { right, up, fwd } = basis(yaw, tilt)
  const tan = Math.tan((FOV * Math.PI) / 360)
  const a = ((px - (free.left + free.right) / 2) / (height / 2)) * tan
  const b = (-(py - (free.top + free.bottom) / 2) / (height / 2)) * tan
  const dir: Pt = [fwd[0] + a * right[0] + b * up[0], fwd[1] + a * right[1] + b * up[1], fwd[2] + a * right[2] + b * up[2]]
  const eyeY = mid.cy - fwd[1] * mid.d
  const t = dir[1] < 0 ? Math.min(-eyeY / dir[1], GROUND_REACH) : GROUND_REACH
  return [mid.cx - fwd[0] * mid.d + dir[0] * t, mid.cz - fwd[2] * mid.d + dir[2] * t]
}

const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * The camera that sees every point from this yaw and tilt inside the area (its tans): a distance and the middle it looks at,
 * never closer than the area shows `narrowest` metres of ground across.
 * `cap` is the farthest it may pull back, as a share of the area's width a 6 m truck keeps (so a machine is never tiny);
 * the middle then slides to keep `keep` in view.
 */
export function fit(pts: readonly Pt[], yaw: number, tilt: number, tanH: number, tanV: number, narrowest: number, keep: Pt | null, cap: number | null): { cx: number; cy: number; cz: number; d: number } {
  const { right, up, fwd } = basis(yaw, tilt)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [x, y, z] of pts) {
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
    z0 = Math.min(z0, z)
    z1 = Math.max(z1, z)
  }
  let cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  let cz = (z0 + z1) / 2
  let d = 0
  for (const p of pts) {
    const v: Pt = [p[0] - cx, p[1] - cy, p[2] - cz]
    const depth = dot(v, fwd)
    d = Math.max(d, Math.abs(dot(v, right)) / (FILL * tanH) - depth, Math.abs(dot(v, up)) / (FILL * tanV) - depth)
  }
  d = Math.max(d, narrowest / 2 / tanH, narrowest / 2 / tanV / 1.4)
  if (cap !== null && keep !== null) {
    const depthKeep = dot([keep[0] - cx, keep[1] - cy, keep[2] - cz], fwd)
    const most = 6 / (2 * cap * tanH) - depthKeep
    if (d > most) {
      d = Math.max(most, narrowest / 2 / tanH)
      // The middle slides so the machine stays inside the area, near its edge on the side away from the target.
      const cosT = Math.cos(tilt)
      const across = DRIFT * d * tanH
      const along = (DRIFT * d * tanV) / Math.sin(tilt)
      const ox = keep[0] - cx
      const oz = keep[2] - cz
      const rx = ox * right[0] + oz * right[2]
      const fxh = fwd[0] / cosT
      const fzh = fwd[2] / cosT
      const fz = ox * fxh + oz * fzh
      const nr = clamp(rx, -across, across)
      const nf = clamp(fz, -along, along)
      cx += (rx - nr) * right[0] + (fz - nf) * fxh
      cz += (rx - nr) * right[2] + (fz - nf) * fzh
    }
  }
  return { cx, cy, cz, d }
}

/**
 * Moves the middle the camera looks at, along the ground, until the point lies inside the area
 * (to INSIDE of its half width and height). Returns the new middle.
 */
export function pullIn(mid: { cx: number; cy: number; cz: number; d: number }, yaw: number, tilt: number, tanH: number, tanV: number, p: Pt): { cx: number; cz: number } {
  const { right, up, fwd } = basis(yaw, tilt)
  const cosT = Math.cos(tilt)
  let cx = mid.cx
  let cz = mid.cz
  // Sliding along the ground changes the depth a little, so a few rounds settle it.
  for (let round = 0; round < 8; round++) {
    const v: Pt = [p[0] - cx, p[1] - mid.cy, p[2] - cz]
    const depth = dot(v, fwd) + mid.d
    // A point behind the camera or at its feet has no screen position to pull from: look straight at it.
    if (depth < mid.d * 0.3) {
      cx = p[0]
      cz = p[2]
      continue
    }
    const across = dot(v, right)
    const high = dot(v, up)
    const reachX = INSIDE * depth * tanH
    const reachY = INSIDE * depth * tanV
    const moveX = Math.abs(across) > reachX ? across - Math.sign(across) * reachX : 0
    const moveY = Math.abs(high) > reachY ? high - Math.sign(high) * reachY : 0
    if (moveX === 0 && moveY === 0) break
    // Along the ground toward the screen's top: up has this share of it.
    const upOnGround = (up[0] * fwd[0] + up[2] * fwd[2]) / cosT
    cx += moveX * right[0] + (moveY / upOnGround) * (fwd[0] / cosT)
    cz += moveX * right[2] + (moveY / upOnGround) * (fwd[2] / cosT)
  }
  return { cx, cz }
}

/** Whether the point lies inside the area, to INSIDE of its half width and height, seen from the middle `mid`. */
export function isInside(mid: { cx: number; cy: number; cz: number; d: number }, yaw: number, tilt: number, tanH: number, tanV: number, p: Pt): boolean {
  const { right, up, fwd } = basis(yaw, tilt)
  const v: Pt = [p[0] - mid.cx, p[1] - mid.cy, p[2] - mid.cz]
  const depth = dot(v, fwd) + mid.d
  return depth > 0 && Math.abs(dot(v, right)) <= (INSIDE + SLACK) * depth * tanH && Math.abs(dot(v, up)) <= (INSIDE + SLACK) * depth * tanV
}

/** The rounds of pulling every point in, one after another, before the distance has to grow. */
const ROUNDS = 6

/**
 * Slides the middle until every point is inside the area, the last of them taking its turn last; when no middle fits them all,
 * the camera pulls back by the least distance that does. Null when that is farther than `most`: the set does not fit.
 * Throws for a number that is not finite, which no play can make.
 */
export function settle(mid: { cx: number; cy: number; cz: number; d: number }, yaw: number, tilt: number, tanH: number, tanV: number, must: readonly Pt[], most: number): { cx: number; cz: number; d: number } | null {
  if (!Number.isFinite(mid.cx + mid.cy + mid.cz + mid.d + yaw + tilt + tanH + tanV + most)) throw new Error(`settle: a number is not finite: ${JSON.stringify([mid, yaw, tilt, tanH, tanV, most])}`)
  for (const p of must) if (!Number.isFinite(p[0] + p[1] + p[2])) throw new Error(`settle: a point is not finite: ${JSON.stringify(p)}`)
  const at = (d: number) => {
    let c = { cx: mid.cx, cz: mid.cz }
    for (let round = 0; round < ROUNDS; round++) {
      for (const p of must) c = pullIn({ cx: c.cx, cy: mid.cy, cz: c.cz, d }, yaw, tilt, tanH, tanV, p)
      if (must.every((p) => isInside({ cx: c.cx, cy: mid.cy, cz: c.cz, d }, yaw, tilt, tanH, tanV, p))) return c
    }
    return null
  }
  if (mid.d > most) return null
  const first = at(mid.d)
  if (first !== null) return { ...first, d: mid.d }
  if (most === mid.d || at(most) === null) return null
  let lo = mid.d
  let hi = most
  for (let i = 0; i < 14; i++) {
    const half = (lo + hi) / 2
    if (at(half) === null) lo = half
    else hi = half
  }
  return { ...at(hi)!, d: hi }
}

/** The machine's chest above the ground, where the camera and the fade look for it. */
export const CHEST = 1.2
/** The ring and the machine, or a watched place and the machine, are framed together up to this far apart, in metres. */
export const TOGETHER = 45
/** The camera may pull back to this multiple of the distance that frames the machine alone to show the ring too: the machine is then drawn at about two thirds of its size alone or more (the sweep in frame.test.ts measures it). */
export const PULL_BACK = 1.3
/** A ring that is not framed yet joins the machine only when it fits within this lower multiple, so a machine near PULL_BACK does not flip the framing back and forth. */
export const PULL_BACK_ENTER = 1.2
/** A ring that lies this far from the last one, or is another size, is a new ring (a step changed), not the same one moving. */
const NEW_RING = 1
/** The narrowest stretch of ground the area shows, in metres, in play. */
export const NARROWEST = 34
/** A 6 m truck stays at least this share of the free area's width. */
const SMALLEST_TRUCK = 0.1
/** Easy mode looks north from the south. */
export const EASY_YAW = Math.PI

/** The points an active machine needs in view: its body, and for the cranes the whole jib, the mast and the hook. */
export function machinePoints(pts: Pt[], m: Machine, lead: number): void {
  const spec = MACHINE_SPECS[m.kind]
  const pad = Math.max(spec.length / 2 + 1.5, 3.5)
  const fx = Math.sin(m.yaw)
  const fz = Math.cos(m.yaw)
  around(pts, m.x, m.y, m.z, pad, pad, Math.min(spec.height, 4))
  if (lead !== 0) around(pts, m.x + fx * lead, m.y, m.z + fz * lead, pad, pad, 3)
  if (m.kind === 'tower') {
    const h = hookPoint(m)
    pts.push([m.x, m.y + 22, m.z], [m.x + Math.sin(m.jib) * JIB_LEN, m.y + 19, m.z + Math.cos(m.jib) * JIB_LEN], [m.x - Math.sin(m.jib) * COUNTER_JIB, m.y + 19, m.z - Math.cos(m.jib) * COUNTER_JIB], [h.x, m.y, h.z])
  } else if (m.kind === 'mobile') {
    const h = hookPoint(m)
    pts.push([h.x, m.y + HOOK_TOP_MOBILE, h.z], [h.x, m.y, h.z])
    around(pts, h.x, m.y, h.z, 2, 2, 2)
  }
}

/** The arrays easy mode's goal fills each frame, kept between frames. */
export interface EasyBuffers {
  /** The machine's points, then with the ring's. */
  machine: Pt[]
  withRing: Pt[]
  /** What must be inside the free area: the ring's four sides when they are framed, and the machine's chest last. */
  must: Pt[]
  keep: Pt
  chest: Pt
  /** Whether the last goal framed the ring with the machine. */
  together: boolean
  /** The ring that goal was for: where it lay and how big it was. */
  ringX: number
  ringZ: number
  ringSize: number
}

/** Points the buffers' keep and chest at the machine. */
export function aimAt(buf: EasyBuffers, m: Machine): void {
  buf.keep[0] = m.x
  buf.keep[1] = m.y
  buf.keep[2] = m.z
  buf.chest[0] = m.x
  buf.chest[1] = m.y + CHEST
  buf.chest[2] = m.z
}

export const createEasyBuffers = (): EasyBuffers => ({ machine: [], withRing: [], must: [], keep: [0, 0, 0], chest: [0, 0, 0], together: false, ringX: 0, ringZ: 0, ringSize: 0 })

/** Where easy mode's camera goes: the middle and distance, and whether the ring's four sides are framed with the machine. */
export interface EasyGoal {
  cx: number
  cy: number
  cz: number
  d: number
  together: boolean
}

/**
 * The camera easy mode wants for the active machine and the step's ring. The machine alone is framed first, never smaller than a
 * share of the area; the ring's four sides join it when they fit with the camera pulled back no more than PULL_BACK_ENTER times
 * that distance, and stay with it up to PULL_BACK (the edge arrow shows a ring that does not fit). The machine's chest is always inside the area.
 */
export function easyGoal(buf: EasyBuffers, m: Machine, p: Pointer | null, tilt: number, tanH: number, tanV: number): EasyGoal {
  const crane = m.kind === 'tower' || m.kind === 'mobile'
  const lead = crane ? 0 : clamp(m.speed * 0.8, -3, 6)
  const cap = crane ? null : SMALLEST_TRUCK
  aimAt(buf, m)
  buf.machine.length = 0
  machinePoints(buf.machine, m, lead)
  const alone = fit(buf.machine, EASY_YAW, tilt, tanH, tanV, NARROWEST, buf.keep, cap)
  // A new ring is framed with the machine only within PULL_BACK_ENTER: the last ring's choice does not carry over.
  if (p === null || p.ring !== buf.ringSize || Math.hypot(p.x - buf.ringX, p.z - buf.ringZ) > NEW_RING) buf.together = false
  if (p !== null) {
    buf.ringX = p.x
    buf.ringZ = p.z
    buf.ringSize = p.ring
  }
  if (p !== null && Math.hypot(p.x - m.x, p.z - m.z) <= TOGETHER) {
    const pad = Math.max(p.ring, 1.5) + 0.7
    buf.withRing.length = 0
    buf.withRing.push(...buf.machine)
    around(buf.withRing, p.x, p.y, p.z, pad, pad, 2)
    const f = fit(buf.withRing, EASY_YAW, tilt, tanH, tanV, NARROWEST, buf.keep, cap)
    buf.must.length = 0
    ringPoints(buf.must, p.x, p.y, p.z, p.ring)
    buf.must.push(buf.chest)
    const to = settle(f, EASY_YAW, tilt, tanH, tanV, buf.must, alone.d * (buf.together ? PULL_BACK : PULL_BACK_ENTER))
    if (to !== null) {
      buf.together = true
      return { cx: to.cx, cy: f.cy, cz: to.cz, d: to.d, together: true }
    }
  }
  buf.together = false
  buf.must.length = 0
  buf.must.push(buf.chest)
  const to = pullIn(alone, EASY_YAW, tilt, tanH, tanV, buf.chest)
  return { cx: to.cx, cy: alone.cy, cz: to.cz, d: alone.d, together: false }
}

/** The point on the edge of the area, inset by `inset` pixels, that lies from the area's middle toward (x, y), and the angle of that direction in degrees. */
export function onEdge(area: Area, x: number, y: number, inset: number): { x: number; y: number; angle: number } {
  const mx = (area.left + area.right) / 2
  const my = (area.top + area.bottom) / 2
  const dx = x - mx
  const dy = y - my
  const reachX = (area.right - area.left) / 2 - inset
  const reachY = (area.bottom - area.top) / 2 - inset
  if (reachX <= 0 || reachY <= 0) throw new Error(`onEdge: an area ${area.right - area.left} by ${area.bottom - area.top} has no room inside an inset of ${inset}`)
  const t = Math.min(reachX / Math.max(1e-6, Math.abs(dx)), reachY / Math.max(1e-6, Math.abs(dy)), 1)
  return { x: mx + dx * t, y: my + dy * t, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

/** The least distance between the segment a to b and the segment c to d. */
export function gap(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const u: Pt = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v: Pt = [d[0] - c[0], d[1] - c[1], d[2] - c[2]]
  const w: Pt = [a[0] - c[0], a[1] - c[1], a[2] - c[2]]
  const uu = dot(u, u)
  const vv = dot(v, v)
  const uv = dot(u, v)
  const uw = dot(u, w)
  const vw = dot(v, w)
  const det = uu * vv - uv * uv
  let s = det < 1e-9 ? 0 : clamp((uv * vw - vv * uw) / det, 0, 1)
  let t = vv < 1e-9 ? 0 : (uv * s + vw) / vv
  if (t < 0 || t > 1) {
    t = clamp(t, 0, 1)
    s = uu < 1e-9 ? 0 : clamp((uv * t - uw) / uu, 0, 1)
  }
  const dx = w[0] + u[0] * s - v[0] * t
  const dy = w[1] + u[1] * s - v[1] * t
  const dz = w[2] + u[2] * s - v[2] * t
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** A thick line standing in for a tall thing: the segment a to b, `r` metres out to each side. */
export interface Capsule {
  a: Pt
  b: Pt
  r: number
}

/** Whether the line of sight from the eye to the target passes through the capsule. */
export const blocks = (eye: Pt, target: Pt, c: Capsule): boolean => gap(eye, target, c.a, c.b) < c.r
