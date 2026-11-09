/**
 * What the built-in things share: Castle Builder's palette (the look is Castle Builder's,
 * so its colours are imported, never copied), a typed way to declare a thing, and the angle
 * maths for shapes that lean, droop or point. The builds themselves use only the kit, the
 * way the designer model is told to build (engine/apidoc.ts).
 */

import { eulerYXZ, type Mat3 } from '../../engine/body'
import type { Kit } from '../../engine/kit'
import type { BuiltinItem } from '../../engine/library'
import type { ItemMeta, ItemTraits, Vec3 } from '../../engine/types'

export { palette } from '../../../../castle-builder/src/scene/look'

/** A built-in thing: its build returns how it behaves and what it is, checked against ItemMeta and ItemTraits. */
export const item = (spec: Omit<BuiltinItem, 'build'> & { build: (m: Kit) => Partial<ItemMeta & ItemTraits> }): BuiltinItem => spec

/** The 'XYZ' angles (as three.js reads them, and as shape opts take them) of a rotation. */
function anglesXYZ(m: Mat3): Vec3 {
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])))
  if (Math.abs(m[2]) < 0.9999999) return [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])]
  return [Math.atan2(m[7], m[4]), y, 0]
}

/** Shape angles for something first tipped by `pitch` (its +z end down), then turned by `yaw` about y. */
export const yawPitch = (yaw: number, pitch: number): Vec3 => anglesXYZ(eulerYXZ(pitch, yaw, 0))

/** Shape angles that stand a shape's y axis (a cylinder, a cone) along the direction `d`. */
export function alongY(d: Vec3): Vec3 {
  const l = Math.hypot(d[0], d[1], d[2])
  return yawPitch(Math.atan2(d[0], d[2]), Math.acos(d[1] / l))
}

/** A stick from `a` to `b`: the centre, length and angles for a cylinder. */
export function between(a: Vec3, b: Vec3): { at: Vec3; length: number; rot: Vec3 } {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], length: Math.hypot(d[0], d[1], d[2]), rot: alongY(d) }
}

/** Evenly spread directions over a ball (a Fibonacci spiral), for curls, berries and dots. */
export function spread(n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.399963
    return [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3
  })
}

/** Dots over an egg with radii `r` at `at` (berries on a bush, spots on a cap): `n` spread directions, those `keep` likes, each turned to face out. */
export function dotsOn(at: Vec3, r: Vec3, n: number, keep: (d: Vec3) => boolean): { at: Vec3; rot: Vec3 }[] {
  return spread(n)
    .filter(keep)
    .map((d) => ({ at: [at[0] + d[0] * r[0], at[1] + d[1] * r[1], at[2] + d[2] * r[2]], rot: alongY([d[0] / r[0], d[1] / r[1], d[2] / r[2]]) }))
}
