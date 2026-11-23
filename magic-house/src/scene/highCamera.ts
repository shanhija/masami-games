/**
 * The camera from high up (plan.md, The look, people and presents): Castle Builder's pitch and lens, as Silly Billy has
 * them (castle-builder/src/scene/look.tsx CAMERA_PITCH, CAMERA_FOV), but never turned: it looks
 * along -z from the viewer's side, tipped down, so x is the screen's right, -z its up and heights
 * rise up the screen (world.ts FloorFrame). It shows the sim's floor frame with the room's whole
 * height over it (the box from bounds.min[1] to bounds.max[1]), as big as that box fits between the
 * HUD's band and the touch pads: the eye backs off along its line until every corner of the box is
 * inside, and the lens is shifted (as the side camera's is) so the box sits in the middle of the
 * clear part of the screen. Since step 7a the frame is the constant HIGH_FRAME over the room's box
 * (engine/camera.ts, world.ts ROOM_BOUNDS): the 14 by 8 m floor with its walls and front lip, 3 m
 * high, never moving; the players are held in the box, so the camera always shows every player.
 *
 * A point on the screen is a line from the eye (screenRay); the stage finds where it first meets
 * something drawn (RoomStage.tsx pointAt), which is how a tap from high up finds its place
 * (seats/types.ts Tap). Pure numbers: the stage turns them into three.js's camera.
 */

import { CAMERA_HALF_FOV, CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import type { FloorFrame, World } from '../engine/world'
import type { Screen } from './sideCamera'

/** The camera's axes in the room: its right, its up and the way it looks. Its right is +x; it looks down at CAMERA_PITCH toward -z. */
export const HIGH_AXES = {
  right: [1, 0, 0] as Vec3,
  up: [0, Math.cos(CAMERA_PITCH), -Math.sin(CAMERA_PITCH)] as Vec3,
  forward: [0, -Math.sin(CAMERA_PITCH), -Math.cos(CAMERA_PITCH)] as Vec3,
} as const

/** What is drawn beyond the box: metres in front of its nearest corner and behind its farthest, from the eye. */
const DEPTH = { before: 10, behind: 150, nearest: 0.3 } as const

/** Where the camera from high up stands and what it shows. */
export interface HighView {
  /** The eye, metres. */
  eye: Vec3
  /** The screen on the plane one metre in front of the eye, along HIGH_AXES right and up: its left edge and its top edge there, and metres there a CSS pixel. */
  left: number
  top: number
  perPixel: number
  /** The screen's size in CSS pixels. */
  width: number
  height: number
  near: number
  far: number
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** The eight corners of the box the camera shows: the floor frame with the room's whole height. */
function corners(bounds: World['bounds'], floor: FloorFrame): Vec3[] {
  const out: Vec3[] = []
  for (const x of [floor.x - floor.width / 2, floor.x + floor.width / 2])
    for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [floor.z - floor.depth / 2, floor.z + floor.depth / 2]) out.push([x, y, z])
  return out
}

/** The box's corners as seen from `eye`: their spread on the plane a metre ahead, and their nearest and farthest distance along the line of sight. */
function spread(points: readonly Vec3[], eye: Vec3) {
  let [u0, u1, v0, v1, d0, d1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]
  for (const p of points) {
    const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]
    const ahead = dot(d, HIGH_AXES.forward)
    const u = dot(d, HIGH_AXES.right) / ahead
    const v = dot(d, HIGH_AXES.up) / ahead
    ;[u0, u1, v0, v1, d0, d1] = [Math.min(u0, u), Math.max(u1, u), Math.min(v0, v), Math.max(v1, v), Math.min(d0, ahead), Math.max(d1, ahead)]
  }
  return { u0, u1, v0, v1, d0, d1 }
}

/**
 * The view that shows the floor frame's box whole, as big as it fits between the clear bottom and
 * the clear top, in the middle of that band and across. The lens is Castle Builder's: CAMERA_FOV
 * from the screen's top to its bottom, so the eye stands as far back as the box needs at that lens.
 * `shift` moves the whole view (a shake), eye and all, in x and y.
 */
export function highView(bounds: World['bounds'], floor: FloorFrame, screen: Screen, shift: readonly [number, number]): HighView {
  const fits = screen.height - screen.clearBottom - screen.clearTop
  if (!(fits > 0) || !(screen.width > 0)) throw new Error(`the camera from high up has no room to draw in: ${screen.width} by ${screen.height} px with ${screen.clearBottom} px kept clear below and ${screen.clearTop} px above`)
  if (!(floor.width > 0) || !(floor.depth > 0) || !(bounds.max[1] > bounds.min[1])) throw new Error(`the floor frame is ${floor.width} by ${floor.depth} m and the box ${bounds.max[1] - bounds.min[1]} m high`)
  const box = corners(bounds, floor)
  const middle: Vec3 = [floor.x, (bounds.min[1] + bounds.max[1]) / 2, floor.z]
  // Metres on the plane a metre ahead for a CSS pixel: the lens spans the screen's whole height.
  const perPixel = (2 * Math.tan(CAMERA_HALF_FOV)) / screen.height
  const back = (k: number): Vec3 => [middle[0] - HIGH_AXES.forward[0] * k, middle[1] - HIGH_AXES.forward[1] * k, middle[2] - HIGH_AXES.forward[2] * k]
  const fitsAt = (k: number) => {
    const s = spread(box, back(k))
    return s.d0 > DEPTH.nearest && (s.u1 - s.u0) / perPixel <= screen.width && (s.v1 - s.v0) / perPixel <= fits
  }
  // The nearest eye along its line from the box's middle at which the whole box fits: the box seen from farther is smaller.
  const size = Math.hypot(floor.width, floor.depth, bounds.max[1] - bounds.min[1])
  let far = size
  while (!fitsAt(far)) far *= 2
  let near = 0
  for (let i = 0; i < 40; i++) {
    const k = (near + far) / 2
    if (fitsAt(k)) far = k
    else near = k
  }
  const at = back(far)
  const s = spread(box, at)
  const eye: Vec3 = [at[0] + shift[0], at[1] + shift[1], at[2]]
  return {
    eye,
    left: (s.u0 + s.u1) / 2 - (screen.width / 2) * perPixel,
    top: (s.v0 + s.v1) / 2 + (screen.clearTop + fits / 2) * perPixel,
    perPixel,
    width: screen.width,
    height: screen.height,
    near: Math.max(DEPTH.nearest, s.d0 - DEPTH.before),
    far: s.d1 + DEPTH.behind,
  }
}

/** The frustum on the near plane, as three.js's makePerspective takes it: left, right, top, bottom. */
export function highWindow(v: HighView): [number, number, number, number] {
  return [v.left * v.near, (v.left + v.width * v.perPixel) * v.near, v.top * v.near, (v.top - v.height * v.perPixel) * v.near]
}

/** The line from the eye through a point on the screen (CSS pixels from the top left): where it starts and which way it goes, one metre ahead along the camera's line of sight for each metre of `way`'s length along it. */
export function screenRay(v: HighView, px: number, py: number): { from: Vec3; way: Vec3 } {
  const u = v.left + px * v.perPixel
  const w = v.top - py * v.perPixel
  const { right, up, forward } = HIGH_AXES
  return { from: v.eye, way: [right[0] * u + up[0] * w + forward[0], right[1] * u + up[1] * w + forward[1], right[2] * u + up[2] * w + forward[2]] }
}

/**
 * Where a line from the eye meets the ground: the plane of the box's bottom (bounds.min[1]). A line
 * that never comes down to it (the screen's top on a very tall screen) meets the box's back wall
 * (bounds.min[2]) instead, so every point on the screen is somewhere in the room.
 */
export function rayToGround(ray: { from: Vec3; way: Vec3 }, bounds: World['bounds']): Vec3 {
  const { from, way } = ray
  const k = way[1] < 0 ? (bounds.min[1] - from[1]) / way[1] : (bounds.min[2] - from[2]) / way[2]
  return [from[0] + way[0] * k, from[1] + way[1] * k, from[2] + way[2] * k]
}

/** A point in the room as the point on the screen over it, CSS pixels from the top left. */
export function highToScreen(v: HighView, p: Vec3): [number, number] {
  const d: Vec3 = [p[0] - v.eye[0], p[1] - v.eye[1], p[2] - v.eye[2]]
  const ahead = dot(d, HIGH_AXES.forward)
  return [(dot(d, HIGH_AXES.right) / ahead - v.left) / v.perPixel, (v.top - dot(d, HIGH_AXES.up) / ahead) / v.perPixel]
}
