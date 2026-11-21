/**
 * What the camera keeps in view. With nobody busy it shows the whole room, Castle Builder's
 * diorama frame (FRAME_R). When someone does something, it moves in on them and on what their
 * step names (other actors, things, places), so a child can see a ball fly from Alice to Steve
 * or to the slide: at the whole room a kid is about 30 px tall on a laptop, close up about 2.5
 * times that. A thing still flying or rolling fast stays in view until it slows down, and a
 * made thing whose real model has just replaced its draft is shown up close for a moment.
 *
 * Heights count: the camera aims at the floor of what it frames, so someone on a roof is framed
 * as if on the ground, only higher; a tall thing, or someone up high beside others on the
 * ground, moves the aim back and widens the frame until its top is on the screen; and the whole
 * room widens when something in it reaches over the top of the screen.
 */

import { CAMERA_HALF_FOV, CAMERA_PITCH, CAMERA_YAW, GROUND_AHEAD } from '../../../castle-builder/src/scene/look'
import { SLOTS, type Actor, type Item, type ItemInfo, type World } from '../engine/types'
import { anchorPoint, bottomOf, itemPoint } from '../engine/world'
import { FRAME_R } from './look'

/** Up close: the least ground kept round whoever is doing something. */
export const CLOSE_R = 6
/** Ground kept beyond the farthest one taking part. */
const MARGIN = 2.5
/** How far the aim of the whole-room frame still leans toward what is going on. */
const LEAN = 0.5
/** A loose thing faster than this (m/s) is flying or rolling: it stays in view until it slows down. */
export const FAST = 1.5
/** Seconds the camera stays on a made thing whose real model has just replaced its draft. */
export const SHOW = 3
/** Above its floor, what the frame's margin keeps in view anyway: a grown-up standing. Only what reaches higher moves the aim back. */
const STANDING = 2
/**
 * Up close, how high on the screen (1 is its edge) a top may show once it is STANDING over a
 * grown-up's height above its floor: room above a head for its name and bubble, under the faces
 * along the top. A lower top may show higher, up to the edge at a grown-up's height, so people
 * on the ground are framed exactly by the margin, as they always were.
 */
const TOP = 0.7
/** The highest at the whole room: all of everything in it on the screen (the starting rooms' far trees reach 0.97 with the corners of their boxes). */
const ROOM_TOP = 1

export interface Frame {
  x: number
  /** The height the camera aims at: the floor of what it frames. */
  y: number
  z: number
  /** Ground kept in view round (x, y, z), metres, on the level of the aim. */
  r: number
}

/** A point of something to keep in view, in metres: an actor's floor and the top of its head, a thing's bottom and the corners of its top. */
export type Point = readonly [x: number, y: number, z: number]

/** The whole room, as nothing tall in it reaches over the top of the screen. */
export const ROOM: Frame = { x: 0, y: 0, z: 0, r: FRAME_R }

type Info = (kind: string) => ItemInfo

const [SIN, COS, TAN] = [Math.sin(CAMERA_PITCH), Math.cos(CAMERA_PITCH), Math.tan(CAMERA_HALF_FOV)]
/** Level, from the camera into the picture: up the screen. */
const AWAY = [-Math.sin(CAMERA_YAW), -Math.cos(CAMERA_YAW)] as const

/** A thing from its bottom to the corners of its top (the back ones show highest). */
function itemSpan(it: Item, info: Info): Point[] {
  const i = info(it.kind)
  const { min, max } = i.recipe.bounds
  const points: Point[] = [[it.x, it.y + bottomOf(it, i), it.z]]
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) points.push(itemPoint(it, i, null, [x, max[1], z]))
  return points
}

/**
 * An actor from what it stands on to the top of its head: the top of a thing it got up onto,
 * else the ground, so the camera does not bob with every jump.
 */
function actorSpan(w: World, a: Actor, info: Info): Point[] {
  const on = a.on == null ? undefined : w.items.find((it) => it.id === a.on)
  const floor = on === undefined ? Math.min(a.y, 0) : anchorPoint(on, info(on.kind), 'top')[1]
  return [
    [a.x, floor, a.z],
    [a.x, a.y + a.look.height * a.scale, a.z],
  ]
}

/** A place a step names: 'x,z' in metres. */
const PLACE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/** Where a step's word is in the room: an actor by id, a thing by its id ('#i12'), the nearest thing of that kind to the doer ('slide'), a place on the ground ('3,-2'), or nowhere. */
function pointsOf(w: World, doer: Actor, value: string, info: Info): Point[] {
  const other = w.actors.find((a) => a.id === value)
  if (other !== undefined) return other === doer ? [] : actorSpan(w, other, info)
  const place = PLACE.exec(value)
  if (place !== null) return [[Number(place[1]), 0, Number(place[2])]]
  const kind = value.trim().toLowerCase()
  let best: Item | null = null
  let near = Infinity
  for (const it of w.items) {
    if (it.id !== value && it.kind !== kind) continue
    const d = Math.hypot(it.x - doer.x, it.z - doer.z)
    if (d < near) [best, near] = [it, d]
  }
  return best === null ? [] : itemSpan(best, info)
}

/**
 * Where everything taking part is: the doers, the ones waiting for an action being made, those
 * joined in or playing a reaction (a wave, a shrug), whatever their steps name, and every loose
 * thing still flying or rolling fast.
 */
export function busyPoints(w: World, info: Info): Point[] {
  const points: Point[] = []
  for (const a of w.actors) {
    if (a.doing === null && a.thinking === null && a.joinedBy === null && (a.reacting ?? null) === null) continue
    points.push(...actorSpan(w, a, info))
    // What it does, or what it waits for while that is being made.
    const step = a.doing ?? (a.thinking !== null ? a.queue[0] : undefined)
    if (step === undefined) continue
    for (const value of Object.values(step.args)) points.push(...pointsOf(w, a, value, info))
  }
  for (const it of w.items) if (it.loose && it.holder === null && Math.hypot(it.vx, it.vy, it.vz) > FAST) points.push(...itemSpan(it, info))
  return points
}

/** Everything in the room, for the whole room's frame: every actor and every thing. */
export function roomPoints(w: World, info: Info): Point[] {
  const points: Point[] = []
  for (const a of w.actors) points.push(...actorSpan(w, a, info))
  for (const it of w.items) points.push(...itemSpan(it, info))
  return points
}

/**
 * Notices a made thing's draft becoming the real thing (its kind stops being rough) and keeps it
 * in view for SHOW seconds: on whoever wears it, or wherever it is (in a hand, ridden, standing
 * in the room). By the time the designer is done everyone is often idle again and the camera back
 * at the whole room, so without this the child would never see the real thing up close.
 */
export class Reveals {
  /** Each kind seen, and whether it was still a draft when last looked at. */
  private readonly rough = new Map<string, boolean>()
  /** Kinds being shown, and until when (world seconds). */
  private readonly until = new Map<string, number>()
  private version = NaN

  /** Once a frame. `version` is the library's: kinds are looked at again when it changes, new ones when they turn up. */
  update(w: World, version: number, isRough: (kind: string) => boolean) {
    const kinds = new Set(w.items.map((it) => it.kind))
    for (const a of w.actors) for (const worn of Object.values(a.look.worn)) kinds.add(worn.kind)
    if (version !== this.version) for (const kind of this.rough.keys()) kinds.add(kind)
    for (const kind of kinds) {
      const was = this.rough.get(kind)
      if (was !== undefined && version === this.version) continue
      const now = isRough(kind)
      if (was === true && !now) this.until.set(kind, w.t + SHOW)
      this.rough.set(kind, now)
    }
    this.version = version
    // A new world's clock starts again: anything shown from before is over.
    for (const [kind, t] of this.until) if (w.t > t || t - w.t > SHOW) this.until.delete(kind)
  }

  /** Where the things being shown are now. */
  points(w: World, info: Info): Point[] {
    const points: Point[] = []
    for (const kind of this.until.keys()) {
      for (const a of w.actors) if (SLOTS.some((slot) => a.look.worn[slot]?.kind === kind)) points.push(...actorSpan(w, a, info))
      for (const it of w.items) if (it.kind === kind) points.push(...itemSpan(it, info))
    }
    return points
  }
}

/**
 * The least ground to keep round `aim` (on its level) so that `p` shows below `top` on the
 * screen. A point up high is nearer the camera than its floor and shows higher than the ground
 * under it. The camera stands back at least 1 / GROUND_AHEAD per metre of ground (zoom.ts,
 * `standBack`; more on a tall screen, which only brings the point down).
 */
function reach(aim: Frame, p: Point, top: number): number {
  const ahead = (p[0] - aim.x) * AWAY[0] + (p[2] - aim.z) * AWAY[1]
  const h = p[1] - aim.y
  return GROUND_AHEAD * ((ahead * SIN + h * COS) / (top * TAN) - ahead * COS + h * SIN)
}

/**
 * The frame round these points: close round one actor, wider for several far apart, never more
 * than the whole room on the ground, and as wide again as their tops need. It aims at their
 * floor; whatever reaches higher than a grown-up over it counts as far back as it shows on the
 * screen (h / tan(pitch)), so someone on a roof and someone below are both framed.
 */
export function frameFor(points: ReadonlyArray<Point>): Frame {
  if (points.length === 0) throw new Error('frameFor wants something to frame: with nothing, the frame is the whole room')
  const floor = Math.min(...points.map((p) => p[1]))
  const flat = points.map(([x, y, z]): [number, number] => {
    const back = Math.max(0, y - floor - STANDING) / Math.tan(CAMERA_PITCH)
    return [x + back * AWAY[0], z + back * AWAY[1]]
  })
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of flat) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  let far = 0
  for (const [x, z] of flat) far = Math.max(far, Math.hypot(x - cx, z - cz))
  const r = Math.min(FRAME_R, Math.max(CLOSE_R, far + MARGIN))
  // As the frame widens to the whole room, the aim slides back toward the room's middle.
  const k = 1 - (1 - LEAN) * ((r - CLOSE_R) / (FRAME_R - CLOSE_R))
  const frame = { x: cx * k, y: floor, z: cz * k, r }
  for (const p of points) {
    const over = Math.max(0, p[1] - floor - STANDING) / STANDING
    frame.r = Math.max(frame.r, reach(frame, p, Math.max(TOP, 1 - (1 - TOP) * over)))
  }
  return frame
}

/** The whole room: Castle Builder's diorama frame round the room's middle, wider while anything in it (`roomPoints`) reaches over the top of the screen. */
export function roomFrame(points: ReadonlyArray<Point>): Frame {
  const frame = { ...ROOM }
  for (const p of points) frame.r = Math.max(frame.r, reach(frame, p, ROOM_TOP))
  return frame
}
