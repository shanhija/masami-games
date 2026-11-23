/**
 * The side camera, Magic House's own (plan.md, The look, people and presents): a long lens straight into the room's open
 * front, its eye a little above the frame, so the floors show their tops. It does not tip: the lens
 * is shifted instead, as a view camera's is, so the plane z = 0 stays square to it and the sim's
 * frame (world.ts Camera) is drawn as exactly that rectangle, with metres the same size all over
 * it. So a point on the screen is a point in the room by a scale and a shift (screenToRoom), which
 * is how a tap finds its place (seats/types.ts Tap).
 *
 * Since step 7a the frame is the constant SIDE_FRAME (engine/camera.ts): the room's 16 by 8 m inside
 * with the house's walls, floor lip and ceiling beam round it, never moving. Its eye stands 49.8 m
 * back and 0.6 frame heights over the frame's middle, so the floor's top shows as a strip, the side
 * walls' inner faces in perspective and the ceiling's underside not at all (scene/shell.ts).
 *
 * Pure numbers: the stage turns them into three.js's projection.
 */

import { DEFAULTS } from '../engine/api'
import { SIDE_LENS } from '../engine/camera'
import type { Camera, Shake } from '../engine/world'

/** How far a shake of strength 1 moves the view at its start, in metres. */
export const SHAKE_METRES = 0.35

/** The canvas, CSS pixels, and how much of its bottom must stay clear for the touch pads and of its top for the HUD's band (badges, step dots, the corner buttons). */
export interface Screen {
  width: number
  height: number
  clearBottom: number
  clearTop: number
}

/** Where the side camera stands and what it shows. */
export interface SideView {
  /** The eye, metres. */
  eye: [number, number, number]
  /** The room's x at the screen's left and right edges and its y at the top and bottom, on z = 0. */
  left: number
  right: number
  top: number
  bottom: number
  /** Pixels a metre, on z = 0. */
  scale: number
  near: number
  far: number
}

/**
 * The view that shows the frame exactly, as big as it fits between the clear bottom and the clear
 * top: across the middle of the screen, and standing on the clear bottom, so a screen taller than
 * the frame shows more above it (the house's upper storey, under the HUD's band), and below it only
 * what the pads cover (the floor's front face). `shift` moves the whole view (a shake), eye and all.
 */
export function sideView(frame: Camera, screen: Screen, shift: readonly [number, number]): SideView {
  const fits = screen.height - screen.clearBottom - screen.clearTop
  const above = screen.height - screen.clearBottom
  if (!(fits > 0) || !(screen.width > 0)) throw new Error(`the side camera has no room to draw in: ${screen.width} by ${screen.height} px with ${screen.clearBottom} px kept clear below and ${screen.clearTop} px above`)
  if (!(frame.width > 0) || !(frame.height > 0)) throw new Error(`the camera's frame is ${frame.width} by ${frame.height} m`)
  const scale = Math.min(screen.width / frame.width, fits / frame.height)
  const x = frame.x + shift[0]
  const y = frame.y + shift[1]
  const back = SIDE_LENS.back * frame.width
  return {
    eye: [x, y + SIDE_LENS.eyeUp * frame.height, back],
    left: x - screen.width / 2 / scale,
    right: x + screen.width / 2 / scale,
    top: y - frame.height / 2 + above / scale,
    bottom: y - frame.height / 2 - screen.clearBottom / scale,
    scale,
    near: Math.max(1, back - SIDE_LENS.before),
    far: back + SIDE_LENS.behind,
  }
}

/** The frustum on the near plane, from the eye, as three.js's makePerspective takes it: left, right, top, bottom. */
export function nearWindow(v: SideView): [number, number, number, number] {
  const k = v.near / v.eye[2]
  return [(v.left - v.eye[0]) * k, (v.right - v.eye[0]) * k, (v.top - v.eye[1]) * k, (v.bottom - v.eye[1]) * k]
}

/** A point on the screen (CSS pixels from the top left) as the point in the room under it, on z = 0. */
export function screenToRoom(v: SideView, px: number, py: number): [number, number, number] {
  return [v.left + px / v.scale, v.top - py / v.scale, 0]
}

/** A point in the room on z = 0 as the point on the screen over it, CSS pixels from the top left. */
export function roomToScreen(v: SideView, x: number, y: number): [number, number] {
  return [(x - v.left) * v.scale, (v.top - y) * v.scale]
}

/** How far the shakes under way move the view now: each fades over DEFAULTS.shakeSecs, and they add up. */
export function shakeOffset(shakes: readonly Shake[], t: number): [number, number] {
  let amp = 0
  for (const s of shakes) {
    const age = t - s.born
    if (age >= 0 && age < DEFAULTS.shakeSecs) amp += s.strength * (1 - age / DEFAULTS.shakeSecs)
  }
  if (amp === 0) return [0, 0]
  const m = Math.min(1.5, amp) * SHAKE_METRES
  return [m * Math.sin(t * 53), m * Math.cos(t * 41)]
}
