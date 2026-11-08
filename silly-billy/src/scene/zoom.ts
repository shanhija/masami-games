/**
 * How close the player has brought the camera, on top of the game's own frame (frame.ts). Pinch,
 * the wheel or the + and − buttons zoom: `t` runs from 0, the game's frame exactly as it is (the
 * whole room, or close round whoever is busy), to 1, MIN_R of ground round the aim whatever the
 * frame, so one or two avatars fill much of the screen. In between, the frame's own moves (in on
 * an action, back out after) still show, smaller the closer the player is. A zoom keeps the ground
 * under the fingers or the cursor where it is; the + button zooms toward the people when nobody is
 * busy, else toward the middle of the action. Zoomed in, a drag pans; a new action takes the camera
 * to it again, and when everyone is done the view stays where it was. The view never leaves the
 * room. Plain numbers, read by the camera once a frame and kept only while the page is open.
 */

import { ease } from '../../../castle-builder/src/game/math'
import { CAMERA_HALF_FOV, CAMERA_PITCH, CAMERA_YAW, GROUND_AHEAD } from '../../../castle-builder/src/scene/look'
import { ROOM_HALF } from '../engine/types'
import type { Frame } from './frame'
import { FRAME_R } from './look'

/** All the way in: the least ground kept round the aim, metres. A kid is then about 7 times as tall on the screen as at the whole room, two of them fill the screen. */
export const MIN_R = 2
/** One press of + or −: four presses go from the whole room all the way in. */
export const ZOOM_STEP = 0.25
/** Seconds the zoom takes to ease most of the way to where the buttons or the wheel sent it. */
const ZOOM_TAU = 0.18
/** How far past the room's edge the ground kept in view may reach while panning, metres. */
const ROOM_EDGE = 1

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The ground the camera shows round its aim: the frame's own (`frameR`) at t 0, MIN_R at t 1, evenly in between on a log scale. */
export const shownR = (frameR: number, t: number) => frameR ** (1 - t) * MIN_R ** t

/** How far the camera stands from its aim per metre of ground kept in view, so the frame's ground fits below the aim and across on a screen this wide (`aspect`, width over height). */
export const standBack = (aspect: number) => Math.max(1 / GROUND_AHEAD, 1 / (Math.tan(CAMERA_HALF_FOV) * aspect))

/** From the camera's aim toward the camera, one metre: Castle Builder's yaw and pitch. */
export const BACK = [Math.sin(CAMERA_YAW) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(CAMERA_YAW) * Math.cos(CAMERA_PITCH)] as const

/**
 * The ground under a point of the screen (`ndcX`, `ndcY` from -1 to 1, up positive), from the
 * camera's aim, per metre of ground kept in view: the camera stands back in proportion to that
 * ground, so the point under a spot of the screen is the aim plus this times the ground. Stage
 * places its camera exactly so (`standBack`, `BACK`, looking at the aim with +y up).
 */
export function groundUnit(ndcX: number, ndcY: number, aspect: number): [number, number] {
  const k = standBack(aspect)
  const [bx, by, bz] = BACK
  // The camera's right and up, as three's lookAt makes them.
  const rl = Math.hypot(bz, bx)
  const [rx, rz] = [bz / rl, -bx / rl]
  const [ux, uy, uz] = [by * rz, bz * rx - bx * rz, -by * rx]
  const tan = Math.tan(CAMERA_HALF_FOV)
  const ray = [-bx + ndcX * tan * aspect * rx + ndcY * tan * ux, -by + ndcY * tan * uy, -bz + ndcX * tan * aspect * rz + ndcY * tan * uz] as const
  // The camera is above the ground and every ray from this pitch and lens points down.
  const s = (-k * by) / ray[1]
  return [k * bx + s * ray[0], k * bz + s * ray[2]]
}

/** The player's view: how far zoomed in, how far panned, and where the camera looks this frame. */
export class View {
  /** How far zoomed in now, 0 to 1, and where it is easing to. */
  t = 0
  goal = 0
  /** Where the camera looks on the ground, and how much ground it keeps in view round that, this frame. */
  x = 0
  z = 0
  r = FRAME_R
  /** A finger or the mouse is panning or pinching: a new action does not take the view from under it. */
  dragging = false
  /** The player's shift of the aim from the frame's, metres. */
  private panX = 0
  private panZ = 0
  /** The frame's ground, eased, as the camera always eased it. */
  private frameR = FRAME_R
  /** The frame last aimed at, for gestures between frames. */
  private frame: Frame = { x: 0, z: 0, r: FRAME_R }
  private busy = false
  /** The screen's width over its height. */
  private aspect = 1
  /** A ground point kept where it is on the screen while the zoom eases: the one under the cursor or the people. */
  private anchor: [number, number] | null = null

  /** Once a frame: the game's frame, whether anyone is busy (or was until a moment ago), the screen's shape. */
  update(frame: Frame, busy: boolean, aspect: number, dt: number) {
    if (busy !== this.busy) {
      // A new action takes the camera to it; when everyone is done the view stays where it was (zoomed out, that is the whole room).
      if (busy && !this.dragging) [this.panX, this.panZ] = [0, 0]
      if (!busy) [this.panX, this.panZ] = [this.panX + this.frame.x - frame.x, this.panZ + this.frame.z - frame.z]
      this.busy = busy
    }
    this.frame = frame
    this.aspect = aspect
    const r0 = shownR(this.frameR, this.t)
    this.t = Math.abs(this.goal - this.t) < 1e-3 ? this.goal : ease(this.t, this.goal, dt, ZOOM_TAU)
    if (this.anchor !== null) {
      this.keep(this.anchor, r0, shownR(this.frameR, this.t))
      if (this.t === this.goal) this.anchor = null
    }
    this.frameR = ease(this.frameR, frame.r, dt, 1)
    this.inRoom()
    this.x = ease(this.x, frame.x + this.panX, dt, 0.8)
    this.z = ease(this.z, frame.z + this.panZ, dt, 0.8)
    this.r = shownR(this.frameR, this.t)
  }

  /** The + (1) or − (-1) button: a step in, toward the people if nobody is busy and they are on the screen, else toward the middle; or a step out. */
  step(dir: 1 | -1, people: ReadonlyArray<{ readonly x: number; readonly z: number }>) {
    this.goal = clamp(Math.round((this.goal + dir * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP, 0, 1)
    this.anchor = null
    if (dir < 0 || this.busy || people.length === 0) return
    const cx = people.reduce((s, p) => s + p.x, 0) / people.length
    const cz = people.reduce((s, p) => s + p.z, 0) / people.length
    if (Math.hypot(cx - this.x, cz - this.z) < this.r) this.anchor = [cx, cz]
  }

  /**
   * Zooms by `scale` (2: half the ground in view) keeping the ground under a point of the screen
   * where it is (`at`, or the middle for null): eased for the wheel, at once (`now`) for a pinch,
   * which follows the fingers.
   */
  zoomAt(scale: number, at: readonly [number, number] | null, now: boolean) {
    const goal = clamp(this.goal + Math.log(scale) / Math.log(this.frameR / MIN_R), 0, 1)
    const ground = at === null ? null : this.groundAt(at)
    if (!now) {
      this.goal = goal
      this.anchor = ground
      return
    }
    const r0 = this.r
    this.goal = this.t = goal
    this.anchor = null
    this.r = shownR(this.frameR, this.t)
    if (ground !== null) this.keep(ground, r0, this.r)
  }

  /** A drag from one point of the screen to another: the ground under the finger goes with it. */
  panBy(from: readonly [number, number], to: readonly [number, number]) {
    const [ax, az] = groundUnit(from[0], from[1], this.aspect)
    const [bx, bz] = groundUnit(to[0], to[1], this.aspect)
    this.shift(-(bx - ax) * this.r, -(bz - az) * this.r)
  }

  /** Back to the whole room (a double tap). */
  reset() {
    this.goal = 0
    this.anchor = null
  }

  /** Into another room: the pan was for the one left. */
  newRoom() {
    ;[this.panX, this.panZ] = [0, 0]
  }

  /** The ground under a point of the screen now. */
  groundAt(at: readonly [number, number]): [number, number] {
    const [ux, uz] = groundUnit(at[0], at[1], this.aspect)
    return [this.x + ux * this.r, this.z + uz * this.r]
  }

  /** The ground in view going from r0 to r1: shifts the aim so `ground` stays where it is on the screen. */
  private keep(ground: readonly [number, number], r0: number, r1: number) {
    const k = 1 - r1 / r0
    this.shift(k * (ground[0] - this.x), k * (ground[1] - this.z))
  }

  /**
   * Moves the pan, kept in the room, and the aim with it at once, so the view follows the finger
   * without easing: by as much of the move as the room allows, never more, never back, and never
   * further out of the room than the aim already is (it eases to where the pan says).
   */
  private shift(dx: number, dz: number) {
    const [px, pz] = [this.panX, this.panZ]
    this.panX += dx
    this.panZ += dz
    this.inRoom()
    const [[loX, hiX], [loZ, hiZ]] = [this.room(this.frame.x), this.room(this.frame.z)]
    const move = (at: number, d: number, moved: number, lo: number, hi: number) =>
      d > 0 ? Math.max(at, Math.min(at + clamp(moved, 0, d), hi)) : Math.min(at, Math.max(at + clamp(moved, d, 0), lo))
    this.x = move(this.x, dx, this.panX - px, loX, hiX)
    this.z = move(this.z, dz, this.panZ - pz, loZ, hiZ)
  }

  /**
   * Where the aim may go along one axis, given the frame's aim there: the ground in view (where
   * the zoom is going) reaches at most ROOM_EDGE past the room's edge, so zoomed out there is no
   * room to pan at all; the frame's own aim is always allowed (it can lean to the very edge, as
   * it always has).
   */
  private room(frameAim: number): [number, number] {
    const room = this.goal === 0 ? 0 : Math.max(0, ROOM_HALF + ROOM_EDGE - shownR(this.frame.r, this.goal))
    return [Math.min(-room, frameAim), Math.max(room, frameAim)]
  }

  /** Keeps the pan inside the room; zoomed out there is no pan. */
  private inRoom() {
    if (this.goal === 0) {
      ;[this.panX, this.panZ] = [0, 0]
      return
    }
    const f = this.frame
    const [[loX, hiX], [loZ, hiZ]] = [this.room(f.x), this.room(f.z)]
    this.panX = clamp(f.x + this.panX, loX, hiX) - f.x
    this.panZ = clamp(f.z + this.panZ, loZ, hiZ) - f.z
  }
}
