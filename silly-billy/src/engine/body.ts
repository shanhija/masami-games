/**
 * The body: how big each part of an actor is, and where its hands, head, seat and back are in
 * the world for its pose. The sim uses this to carry things in a hand; the scene builds its
 * bones from the same numbers and rotation orders, so a held ball sits in the drawn hand.
 *
 * The chain, every rotation a three.js Euler (the order named):
 * - root: at (x, y + bob, z), rotation (pitch, yaw, -roll, 'YXZ'), uniform scale `scale`.
 * - upper body: pivot at the hips (0, hipY, 0) in the root, rotation (lean, twist, -tilt, 'YXZ').
 *   People only: an animal's upper body is its whole body, pivoting at its middle.
 * - neck: (0, neckY - hipY, 0) in the upper body; head rotation (nod, turn, -tilt, 'YXZ');
 *   head centre at (0, headR * 0.85, 0) from the neck.
 * - arm (people): shoulder at (side * shoulderX, shoulderY - hipY, 0) in the upper body, side +1
 *   left (+x) and -1 right; rotation (-swing, 0, side * raise, 'ZXY'); elbow (0, -upperArm, 0),
 *   rotation (-bend, 0, 0); hand (0, -lowerArm, 0).
 * - leg (people): hip at (side * hipX, hipY, 0) in the root; rotation (-swing, 0, side * raise,
 *   'ZXY'); knee (0, -thigh, 0), rotation (bend, 0, 0); foot (0, -shin, 0).
 * - animals: every leg hangs from the root at (side * legX, legTop, +frontZ for armL/armR or
 *   -frontZ for legL/legR), the same rotations; the head's neck at (0, neckY - hipY, frontZ +
 *   headR * 0.6) in the body; the mouth is the hand; the tail starts at (0, tailY - hipY, -tailZ).
 *
 * Signs: lean, nod and swing + go forward; twist and turn + to its left; tilt, roll and raise +
 * lean toward its left (or outward, for a limb). Lying on the back is pitch -PI/2.
 */

import type { Actor, Hand, Look, Vec3 } from './types'

/** The model kid every worn thing is built around: 1.15 m tall with a head of radius 0.23. */
export const KID_HEIGHT = 1.15
export const KID_HEAD_R = 0.23

/** Sizes of a body's parts, metres, at scale 1. */
export interface Proportions {
  height: number
  headR: number
  /** Top of the torso, where the head sits. */
  neckY: number
  shoulderY: number
  shoulderX: number
  upperArm: number
  lowerArm: number
  hipY: number
  hipX: number
  thigh: number
  shin: number
  torsoW: number
  torsoD: number
  /** Animals: a leg's x offset, where legs join the body, how far front and back legs are from the middle, the tail. */
  legX: number
  legTop: number
  frontZ: number
  tailY: number
  tailZ: number
  /** How far out the body reaches on the ground: for bumping and hitting. */
  radius: number
  animal: boolean
}

/** A part's place in the world: its origin and its rotation (row-major 3x3), with the actor's scale. */
export interface Frame {
  p: Vec3
  r: Mat3
  s: number
}

export type Mat3 = [number, number, number, number, number, number, number, number, number]

export function proportions(look: Pick<Look, 'body' | 'height' | 'build'>): Proportions {
  const b = look.build
  switch (look.body) {
    case 'kid': {
      const k = look.height / KID_HEIGHT
      return {
        height: look.height,
        headR: 0.23 * k,
        neckY: 0.72 * k,
        shoulderY: 0.68 * k,
        shoulderX: 0.17 * k * b,
        upperArm: 0.17 * k,
        lowerArm: 0.17 * k,
        hipY: 0.4 * k,
        hipX: 0.085 * k * b,
        thigh: 0.2 * k,
        shin: 0.2 * k,
        torsoW: 0.32 * k * b,
        torsoD: 0.2 * k * b,
        legX: 0,
        legTop: 0,
        frontZ: 0,
        tailY: 0,
        tailZ: 0,
        radius: 0.24 * k * Math.max(1, b),
        animal: false,
      }
    }
    case 'grownup': {
      const k = look.height / 1.6
      return {
        height: look.height,
        headR: 0.19 * k,
        neckY: 1.24 * k,
        shoulderY: 1.18 * k,
        shoulderX: 0.21 * k * b,
        upperArm: 0.27 * k,
        lowerArm: 0.27 * k,
        hipY: 0.74 * k,
        hipX: 0.1 * k * b,
        thigh: 0.37 * k,
        shin: 0.37 * k,
        torsoW: 0.4 * k * b,
        torsoD: 0.24 * k * b,
        legX: 0,
        legTop: 0,
        frontZ: 0,
        tailY: 0,
        tailZ: 0,
        radius: 0.28 * k * Math.max(1, b),
        animal: false,
      }
    }
    case 'cat':
    case 'dog': {
      const dog = look.body === 'dog'
      const k = look.height / (dog ? 0.6 : 0.5)
      return {
        height: look.height,
        headR: (dog ? 0.13 : 0.12) * k,
        neckY: 0.34 * k,
        shoulderY: 0.26 * k,
        shoulderX: 0,
        upperArm: 0.12 * k,
        lowerArm: 0.12 * k,
        hipY: 0.26 * k,
        hipX: 0,
        thigh: 0.12 * k,
        shin: 0.12 * k,
        torsoW: (dog ? 0.22 : 0.18) * k * b,
        torsoD: (dog ? 0.55 : 0.48) * k,
        legX: (dog ? 0.08 : 0.07) * k * b,
        legTop: 0.24 * k,
        frontZ: (dog ? 0.19 : 0.17) * k,
        tailY: 0.3 * k,
        tailZ: (dog ? 0.27 : 0.24) * k,
        radius: (dog ? 0.32 : 0.28) * k,
        animal: true,
      }
    }
  }
}

// ------------------------------------------------------------------------------ 3x3 rotations

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export function mul(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}

export function rotX(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}

export function rotY(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

export function rotZ(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

/** three.js Euler (x, y, z, 'YXZ'): Ry * Rx * Rz. */
export const eulerYXZ = (x: number, y: number, z: number) => mul(mul(rotY(y), rotX(x)), rotZ(z))
/** three.js Euler (x, y, z, 'ZXY'): Rz * Rx * Ry. */
export const eulerZXY = (x: number, y: number, z: number) => mul(mul(rotZ(z), rotX(x)), rotY(y))
/** three.js Euler (x, y, z, 'XYZ'), the default order: Rx * Ry * Rz. */
export const eulerXYZ = (x: number, y: number, z: number) => mul(mul(rotX(x), rotY(y)), rotZ(z))

/** The angles eulerXYZ makes this rotation from (m[2] = sin y). */
export function anglesXYZ(m: Mat3): Vec3 {
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])))
  if (Math.abs(m[2]) < 0.9999999) return [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])]
  return [Math.atan2(m[7], m[4]), y, 0]
}

/** A child frame: `offset` in the parent's frame, then rotated by `rot` relative to the parent. */
export function child(parent: Frame, offset: Vec3, rot: Mat3 = IDENTITY): Frame {
  const o = apply(parent.r, offset)
  return { p: [parent.p[0] + o[0] * parent.s, parent.p[1] + o[1] * parent.s, parent.p[2] + o[2] * parent.s], r: mul(parent.r, rot), s: parent.s }
}

/** A point given in a frame, in the world. */
export function pointIn(frame: Frame, local: Vec3): Vec3 {
  const o = apply(frame.r, local)
  return [frame.p[0] + o[0] * frame.s, frame.p[1] + o[1] * frame.s, frame.p[2] + o[2] * frame.s]
}

/** Yaw, pitch and roll (as an actor's or item's fields) of a rotation, for a thing that should turn with a frame. */
export function anglesOf(m: Mat3): { yaw: number; pitch: number; roll: number } {
  // m = Ry(yaw) Rx(pitch) Rz(-roll): m[5] = -sin(pitch).
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m[5])))
  if (Math.abs(m[5]) < 0.9999) return { yaw: Math.atan2(m[2], m[8]), pitch, roll: -Math.atan2(m[3], m[4]) }
  return { yaw: Math.atan2(-m[6], m[0]), pitch, roll: 0 }
}

// ------------------------------------------------------------------------------ an actor's frames

type Body = Pick<Actor, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll' | 'scale' | 'pose' | 'look'>

export function rootFrame(a: Body): Frame {
  return { p: [a.x, a.y + a.pose.bob * a.scale, a.z], r: eulerYXZ(a.pitch, a.yaw, -a.roll), s: a.scale }
}

/** The upper body, pivoting at the hips (people) or the middle of the body (animals). */
export function upperFrame(a: Body, pr: Proportions = proportions(a.look)): Frame {
  return child(rootFrame(a), [0, pr.hipY, 0], eulerYXZ(a.pose.lean, a.pose.twist, -a.pose.tilt))
}

/** The head's centre, turned with the head. */
export function headFrame(a: Body, pr: Proportions = proportions(a.look)): Frame {
  const upper = upperFrame(a, pr)
  const neck = child(upper, [0, pr.neckY - pr.hipY, pr.animal ? pr.frontZ + pr.headR * 0.6 : 0], eulerYXZ(a.pose.head.nod, a.pose.head.turn, -a.pose.head.tilt))
  return child(neck, [0, pr.headR * 0.85, 0])
}

/** The hand (people) or the mouth (animals), turned with the forearm or the head. */
export function handFrame(a: Body, hand: Hand, pr: Proportions = proportions(a.look)): Frame {
  if (pr.animal) return child(headFrame(a, pr), [0, -pr.headR * 0.45, pr.headR * 0.9])
  const side = hand === 'left' ? 1 : -1
  const limb = hand === 'left' ? a.pose.armL : a.pose.armR
  const shoulder = child(upperFrame(a, pr), [side * pr.shoulderX, pr.shoulderY - pr.hipY, 0], eulerZXY(-limb.swing, 0, side * limb.raise))
  const elbow = child(shoulder, [0, -pr.upperArm, 0], rotX(-limb.bend))
  return child(elbow, [0, -pr.lowerArm, 0])
}

/** A foot (people) or a paw (animals: 'left'/'right' are the back legs). */
export function footFrame(a: Body, side: Hand, pr: Proportions = proportions(a.look)): Frame {
  const s = side === 'left' ? 1 : -1
  const limb = side === 'left' ? a.pose.legL : a.pose.legR
  const at: Vec3 = pr.animal ? [s * pr.legX, pr.legTop, -pr.frontZ] : [s * pr.hipX, pr.hipY, 0]
  const hip = child(rootFrame(a), at, eulerZXY(-limb.swing, 0, s * limb.raise))
  const knee = child(hip, [0, pr.animal ? -pr.thigh : -pr.thigh, 0], rotX(limb.bend))
  return child(knee, [0, -pr.shin, 0])
}

/** Between the shoulder blades: where capes, wings and backpacks hang. */
export function backFrame(a: Body, pr: Proportions = proportions(a.look)): Frame {
  return child(upperFrame(a, pr), [0, pr.animal ? 0.05 : pr.shoulderY - pr.hipY - 0.05 * (pr.height / KID_HEIGHT), -pr.torsoD / 2])
}

/** In front of the chest: where a hugged thing is carried. `reach` is the thing's own half depth. */
export function hugFrame(a: Body, reach: number, pr: Proportions = proportions(a.look)): Frame {
  return child(upperFrame(a, pr), [0, pr.animal ? 0.1 : (pr.shoulderY - pr.hipY) * 0.55, pr.torsoD / 2 + reach])
}

/** The middle of the body: what a thrown thing aims at and hits. */
export function bodyCenter(a: Body, pr: Proportions = proportions(a.look)): Vec3 {
  return pointIn(upperFrame(a, pr), [0, pr.animal ? 0 : (pr.neckY - pr.hipY) * 0.5, 0])
}

/** How high the hips are above the feet: a rider's feet go this far below the seat. */
export const seatDrop = (a: Body, pr: Proportions = proportions(a.look)) => pr.hipY * a.scale
