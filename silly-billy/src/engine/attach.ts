/**
 * Things fixed to other things, and things put exactly somewhere on another: stairs against the
 * treehouse's front, a door at the house, a lamp on top of a pole, a sign on a door that swings.
 * A thing is fixed in a frame of what it is fixed to (an item's anchor, turned with the anchor's
 * part; a part's pivot; the item's base point; an actor's feet) at a place and turn of its own
 * there, kept as plain data (types.ts's Attachment), and the sim puts it back in that frame
 * every frame, so it goes and turns with it. Nothing here runs made code.
 */

import { anglesOf, apply, backFrame, eulerYXZ, handFrame, headFrame, mul, pointIn, proportions, rootFrame, rotY, type Frame, type Mat3 } from './body'
import { boundsOf } from './kit'
import type { Library } from './library'
import type { Actor, Attachment, Item, ItemInfo, Recipe, Vec3 } from './types'
import { infoFor, itemRotation, partFrame, type Side } from './world'

const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

/** The sides a thing can be put at, and how far round from its front each is (left is +x, the way an actor facing +z has its left hand). */
export const SIDES: Record<string, number> = { front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2 }
/** Points on an actor a thing can be fixed at. */
const BODY_POINTS = ['head', 'hand', 'back'] as const

/**
 * A frame on an item: the anchor named `at` (its point, turned with its part), else the pivot of
 * the part named `at`, else the item's base point. Sides are not frames: they only say where a
 * thing is put.
 */
export function itemFrameAt(it: Item, info: ItemInfo, at: string | null): Frame {
  const base: Frame = { p: [it.x, it.y, it.z], r: itemRotation(it), s: it.scale }
  if (at === null) return base
  const anchor = info.recipe.anchors[at]
  const def = anchor === undefined ? info.recipe.parts.find((p) => p.name === at || p.pose === at) : undefined
  if (anchor === undefined && def === undefined) return base
  const pf = partFrame(info.recipe, it.parts, anchor !== undefined ? anchor.part : def!.name)
  const local = anchor !== undefined ? pointIn(pf, anchor.at) : pf.p
  return { p: pointIn(base, local), r: mul(base.r, pf.r), s: base.s * pf.s }
}

/** A frame on an actor: its head, its right hand, its back, else its feet. */
export function actorFrameAt(a: Actor, at: string | null): Frame {
  if (at === 'head') return headFrame(a)
  if (at === 'hand') return handFrame(a, 'right')
  if (at === 'back') return backFrame(a)
  return rootFrame(a)
}

/** Whether `at` names a frame on the thing (an anchor or a part, or a point of an actor), not a side or nothing. */
export function namesFrame(target: Item | Actor, info: ItemInfo | null, at: string): boolean {
  if ('look' in target) return (BODY_POINTS as readonly string[]).includes(at)
  return info !== null && (info.recipe.anchors[at] !== undefined || info.recipe.parts.some((p) => p.name === at || p.pose === at))
}

/** The frame a thing is fixed in now, or null when what it is fixed to is not in the room. */
export function holdFrame(side: Side, lib: Library, att: Attachment): Frame | null {
  const a = side.actors.get(att.to)
  if (a !== undefined) return actorFrameAt(a, att.at)
  const it = side.items.get(att.to)
  return it === undefined ? null : itemFrameAt(it, infoFor(lib, it), att.at)
}

/** Where a thing is in a frame now: its place and turn there. */
export function offsetIn(f: Frame, it: Item): Omit<Attachment, 'to' | 'at'> {
  const rt = transpose(f.r)
  const l = apply(rt, [it.x - f.p[0], it.y - f.p[1], it.z - f.p[2]])
  const { yaw, pitch, roll } = anglesOf(mul(rt, itemRotation(it)))
  return { x: l[0] / f.s, y: l[1] / f.s, z: l[2] / f.s, yaw, pitch, roll }
}

/** Puts a thing back at its place in its frame. */
export function placeIn(f: Frame, att: Attachment, it: Item): void {
  const p = pointIn(f, [att.x, att.y, att.z])
  const { yaw, pitch, roll } = anglesOf(mul(f.r, eulerYXZ(att.pitch, att.yaw, -att.roll)))
  it.x = p[0]
  it.y = p[1]
  it.z = p[2]
  it.yaw = yaw
  it.pitch = pitch
  it.roll = roll
}

/** Whether fixing `it` to `to` would close a ring (`to` is `it`, or fixed to it, however far up). */
export function wouldLoop(side: Side, it: Item, to: string): boolean {
  let at: string | undefined = to
  for (let n = 0; n < 16 && at !== undefined; n++) {
    if (at === it.id) return true
    at = side.items.get(at)?.attached?.to
  }
  return at !== undefined
}

export interface Placing {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
}

/**
 * How far a model reaches toward a side (in its own frame, unscaled), counting only its shapes
 * between heights lo and hi: a roof overhanging high above does not keep stairs from the wall
 * below it. All of it when none are at those heights.
 */
function reach(recipe: Recipe, side: string, lo: number, hi: number): { min: Vec3; max: Vec3 } {
  const boxes = recipe.shapes.map((sh) => boundsOf([sh], recipe.parts)).filter((b) => b.max[1] > lo + 0.01 && b.min[1] < hi)
  if (boxes.length === 0) return recipe.bounds
  const out = { min: [...recipe.bounds.min] as Vec3, max: [...recipe.bounds.max] as Vec3 }
  if (side === 'front') out.max[2] = Math.max(...boxes.map((b) => b.max[2]))
  else if (side === 'back') out.min[2] = Math.min(...boxes.map((b) => b.min[2]))
  else if (side === 'left') out.max[0] = Math.max(...boxes.map((b) => b.max[0]))
  else if (side === 'right') out.min[0] = Math.min(...boxes.map((b) => b.min[0]))
  return out
}

/**
 * Where a thing goes when it is put at another (an item or an actor):
 * - a side ('front', 'back', 'left', 'right'): on the other's ground level beside that side,
 *   touching what the other has at its height (a roof high up does not hold it off the wall),
 *   its middle on the side's middle, facing away from it (its back toward it: stairs and ladders
 *   climb toward what they lead to);
 * - 'top': standing on its top, in the middle, turned as it is;
 * - an anchor or part of an item (a point of an actor: 'head', 'hand', 'back'): its bottom middle
 *   there, turned as that frame is.
 * Anything else is the front.
 */
export function placing(it: Item, info: ItemInfo, target: Item | Actor, tinfo: ItemInfo | null, where: string): Placing {
  const s = it.scale
  const a = info.recipe.bounds
  const centre: Vec3 = [((a.min[0] + a.max[0]) / 2) * s, a.min[1] * s, ((a.min[2] + a.max[2]) / 2) * s]
  if (namesFrame(target, tinfo, where)) {
    const f = 'look' in target ? actorFrameAt(target, where) : itemFrameAt(target, tinfo!, where)
    const o = apply(f.r, centre)
    return { x: f.p[0] - o[0], y: f.p[1] - o[1], z: f.p[2] - o[2], ...anglesOf(f.r) }
  }
  // The other's box, standing upright, turned only by its yaw.
  let min: Vec3
  let max: Vec3
  let st: number
  if ('look' in target) {
    const r = proportions(target.look).radius
    min = [-r, 0, -r]
    max = [r, target.look.height, r]
    st = target.scale
  } else {
    st = target.scale
    const r = tinfo!.recipe
    // Its own height, in the other's frame, from the other's bottom up.
    const near = where === 'top' ? r.bounds : reach(r, where, r.bounds.min[1], r.bounds.min[1] + ((a.max[1] - a.min[1]) * s) / st)
    min = near.min
    max = near.max
  }
  const ry = rotY(target.yaw)
  if (where === 'top') {
    const p = apply(ry, [((min[0] + max[0]) / 2) * st, 0, ((min[2] + max[2]) / 2) * st])
    const own = apply(ry, [centre[0], 0, centre[2]])
    return { x: target.x + p[0] - own[0], y: target.y + max[1] * st - centre[1], z: target.z + p[2] - own[2], yaw: target.yaw, pitch: 0, roll: 0 }
  }
  const turn = SIDES[where] ?? 0
  // The side's middle on the other's box, and how far out it reaches.
  const side: Vec3 =
    where === 'back' ? [((min[0] + max[0]) / 2) * st, 0, min[2] * st]
    : where === 'left' ? [max[0] * st, 0, ((min[2] + max[2]) / 2) * st]
    : where === 'right' ? [min[0] * st, 0, ((min[2] + max[2]) / 2) * st]
    : [((min[0] + max[0]) / 2) * st, 0, max[2] * st]
  const out: Vec3 = [Math.sin(turn), 0, Math.cos(turn)]
  // Its own back half goes out from the side; its own middle across lands on the side's middle.
  const back = -a.min[2] * s
  const across: Vec3 = [Math.cos(turn), 0, -Math.sin(turn)]
  const local: Vec3 = [side[0] + out[0] * back - across[0] * centre[0], 0, side[2] + out[2] * back - across[2] * centre[0]]
  const p = apply(ry, local)
  const bottom = 'look' in target ? target.y : target.y + min[1] * st
  return { x: target.x + p[0], y: bottom - centre[1], z: target.z + p[2], yaw: target.yaw + turn, pitch: 0, roll: 0 }
}
