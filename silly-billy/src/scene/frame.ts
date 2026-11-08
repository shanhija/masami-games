/**
 * What the camera keeps in view. With nobody busy it shows the whole room, Castle Builder's
 * diorama frame (FRAME_R). When someone does something, it moves in on them and on what their
 * step names (other actors, things, places), so a child can see a ball fly from Alice to Steve
 * or to the slide: at the whole room a kid is about 30 px tall on a laptop, close up about 2.5
 * times that. A thing still flying or rolling fast stays in view until it slows down, and a
 * made thing whose real model has just replaced its draft is shown up close for a moment.
 */

import { SLOTS, type Actor, type World } from '../engine/types'
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

export interface Frame {
  x: number
  z: number
  /** Ground kept in view round (x, z), metres. */
  r: number
}

/** A place a step names: 'x,z' in metres. */
const PLACE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/** Where a step's word is in the room: an actor by id, a thing by its id ('#i12'), the nearest thing of that kind to the doer ('slide'), a place ('3,-2'), or nowhere. */
function pointOf(w: World, doer: Actor, value: string): [number, number] | null {
  const other = w.actors.find((a) => a.id === value)
  if (other !== undefined) return other === doer ? null : [other.x, other.z]
  const place = PLACE.exec(value)
  if (place !== null) return [Number(place[1]), Number(place[2])]
  const kind = value.trim().toLowerCase()
  let best: [number, number] | null = null
  let near = Infinity
  for (const it of w.items) {
    if (it.id !== value && it.kind !== kind) continue
    const d = Math.hypot(it.x - doer.x, it.z - doer.z)
    if (d < near) [best, near] = [[it.x, it.z], d]
  }
  return best
}

/**
 * Where everything taking part is: the doers, the ones waiting for an action being made, those
 * joined in or playing a reaction (a wave, a shrug), whatever their steps name, and every loose
 * thing still flying or rolling fast.
 */
export function busyPoints(w: World): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (const a of w.actors) {
    if (a.doing === null && a.thinking === null && a.joinedBy === null && (a.reacting ?? null) === null) continue
    points.push([a.x, a.z])
    // What it does, or what it waits for while that is being made.
    const step = a.doing ?? (a.thinking !== null ? a.queue[0] : undefined)
    if (step === undefined) continue
    for (const value of Object.values(step.args)) {
      const p = pointOf(w, a, value)
      if (p !== null) points.push(p)
    }
  }
  for (const it of w.items) if (it.loose && it.holder === null && Math.hypot(it.vx, it.vy, it.vz) > FAST) points.push([it.x, it.z])
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
  points(w: World): Array<[number, number]> {
    const points: Array<[number, number]> = []
    for (const kind of this.until.keys()) {
      for (const a of w.actors) if (SLOTS.some((slot) => a.look.worn[slot]?.kind === kind)) points.push([a.x, a.z])
      for (const it of w.items) if (it.kind === kind) points.push([it.x, it.z])
    }
    return points
  }
}

/** The frame round these points: close round one actor, wider for several far apart, the whole room for none. */
export function frameFor(points: ReadonlyArray<readonly [number, number]>): Frame {
  if (points.length === 0) return { x: 0, z: 0, r: FRAME_R }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  let far = 0
  for (const [x, z] of points) far = Math.max(far, Math.hypot(x - cx, z - cz))
  const r = Math.min(FRAME_R, Math.max(CLOSE_R, far + MARGIN))
  // As the frame widens to the whole room, the aim slides back toward the room's middle.
  const k = 1 - (1 - LEAN) * ((r - CLOSE_R) / (FRAME_R - CLOSE_R))
  return { x: cx * k, z: cz * k, r }
}
