import { BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, Group, Matrix4, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { KID_HEIGHT, pivotHeight, type Proportions } from '../engine/body'
import type { Actor, Hand, Look } from '../engine/types'
import { flat, glow, palette } from './look'

/**
 * The chibi rig: one group per joint, chained, placed and turned exactly as engine/body.ts
 * says (the same offsets, the same rotation orders), so the hand drawn here is where the
 * sim puts a held ball. On the joints hang the body's solids, coloured from the look: for
 * people a big head, a torso or a dress, two-piece arms and legs, shoes; for a cat or a dog
 * a long body on four legs, ears, a muzzle and a tail that wags with pose.tail. For animals
 * the look's colours mean: skin the fur, top the collar, bottom the chest, the tail's tip
 * (and a dog's ears and muzzle), shoes the paws.
 */

export type LimbName = 'armL' | 'armR' | 'legL' | 'legR'
export const LIMBS: readonly LimbName[] = ['armL', 'armR', 'legL', 'legR']

/** A limb's joints: the shoulder or hip, the elbow or knee, the hand or foot. */
export interface LimbBones {
  top: Group
  mid: Group
  end: Group
}

export interface Bones {
  /** What the body turns round (the feet, unless it has a pivot): position, facing and tip, and the actor's scale. */
  root: Group
  /** The feet, pivot * height below the root. */
  base: Group
  /** Squash and stretch from the feet. body.ts has none: a held thing slips a little off the hand while it lasts. */
  squash: Group
  /** People: pivoting at the hips. Animals: the whole body, pivoting at its middle. */
  upper: Group
  neck: Group
  /** The head's centre. */
  head: Group
  limbs: Record<LimbName, LimbBones>
  /** Where a held thing goes: the hands, or an animal's mouth for both. */
  hand: Record<Hand, Group>
  /** Between the shoulder blades. */
  back: Group
  /** Animals: the tail's segments from the root out; people: none. */
  tail: Group[]
}

const TAIL: Record<'cat' | 'dog', { n: number; len: number; r: number; lift: number; curl: number }> = {
  cat: { n: 4, len: 0.09, r: 0.026, lift: 1.9, curl: 0.42 },
  dog: { n: 3, len: 0.065, r: 0.03, lift: 0.9, curl: 0.25 },
}

function joint(parent: Group, x: number, y: number, z: number): Group {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function limb(parent: Group, x: number, y: number, z: number, upper: number, lower: number): LimbBones {
  const top = joint(parent, x, y, z)
  const mid = joint(top, 0, -upper, 0)
  return { top, mid, end: joint(mid, 0, -lower, 0) }
}

/** The joints of a body of these proportions, at rest. */
export function makeBones(pr: Proportions, body: Look['body']): Bones {
  const root = new Group()
  const base = joint(root, 0, 0, 0)
  const squash = joint(base, 0, 0, 0)
  const upper = joint(squash, 0, pr.hipY, 0)
  const neck = joint(upper, 0, pr.neckY - pr.hipY, pr.animal ? pr.frontZ + pr.headR * 0.6 : 0)
  const head = joint(neck, 0, pr.headR * 0.85, 0)
  const back = joint(upper, 0, pr.animal ? 0.05 : pr.shoulderY - pr.hipY - 0.05 * (pr.height / KID_HEIGHT), -pr.torsoD / 2)
  if (!pr.animal) {
    const limbs = {
      armL: limb(upper, pr.shoulderX, pr.shoulderY - pr.hipY, 0, pr.upperArm, pr.lowerArm),
      armR: limb(upper, -pr.shoulderX, pr.shoulderY - pr.hipY, 0, pr.upperArm, pr.lowerArm),
      legL: limb(squash, pr.hipX, pr.hipY, 0, pr.thigh, pr.shin),
      legR: limb(squash, -pr.hipX, pr.hipY, 0, pr.thigh, pr.shin),
    }
    return { root, base, squash, upper, neck, head, limbs, hand: { left: limbs.armL.end, right: limbs.armR.end }, back, tail: [] }
  }
  const limbs = {
    armL: limb(squash, pr.legX, pr.legTop, pr.frontZ, pr.thigh, pr.shin),
    armR: limb(squash, -pr.legX, pr.legTop, pr.frontZ, pr.thigh, pr.shin),
    legL: limb(squash, pr.legX, pr.legTop, -pr.frontZ, pr.thigh, pr.shin),
    legR: limb(squash, -pr.legX, pr.legTop, -pr.frontZ, pr.thigh, pr.shin),
  }
  const mouth = joint(head, 0, -pr.headR * 0.45, pr.headR * 0.9)
  const k = pr.height / (body === 'dog' ? 0.6 : 0.5)
  const spec = TAIL[body === 'dog' ? 'dog' : 'cat']
  const tail: Group[] = []
  let at = joint(upper, 0, pr.tailY - pr.hipY, -pr.tailZ)
  for (let i = 0; i < spec.n; i++) {
    tail.push(at)
    at = joint(at, 0, spec.len * k, 0)
  }
  return { root, base, squash, upper, neck, head, limbs, hand: { left: mouth, right: mouth }, back, tail }
}

/** The actor's place and pose on the joints, as body.ts turns them (round its pivot, with the sway its states add). `sway` adds a little life to a tail that is not wagging. */
export function poseBones(b: Bones, a: Pick<Actor, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll' | 'scale' | 'pose' | 'look' | 'pivot' | 'sway'>, pr: Proportions, sway: number) {
  const p = a.pose
  const h = pivotHeight(a)
  b.root.position.set(a.x, a.y + p.bob * a.scale + h * a.scale, a.z)
  b.root.rotation.set(a.pitch, a.yaw, -a.roll, 'YXZ')
  b.root.scale.setScalar(a.scale)
  b.base.position.y = -h
  const wide = 1 / Math.sqrt(p.squash)
  b.squash.scale.set(wide, p.squash, wide)
  const sw = a.sway ?? null
  b.upper.rotation.set(p.lean, p.twist + (sw?.twist ?? 0), -(p.tilt + (sw?.tilt ?? 0)), 'YXZ')
  b.neck.rotation.set(p.head.nod + (sw?.nod ?? 0), p.head.turn + (sw?.turn ?? 0), -p.head.tilt, 'YXZ')
  for (const name of LIMBS) {
    const l = p[name]
    const side = name.endsWith('L') ? 1 : -1
    const bones = b.limbs[name]
    bones.top.rotation.set(-l.swing, 0, side * l.raise, 'ZXY')
    // People bend the elbow forward and the knee back; every animal leg bends like a knee.
    bones.mid.rotation.set(!pr.animal && name.startsWith('arm') ? -l.bend : l.bend, 0, 0)
  }
  if (b.tail.length === 0) return
  const spec = TAIL[a.look.body === 'dog' ? 'dog' : 'cat']
  b.tail.forEach((g, i) => {
    if (i === 0) g.rotation.set(-spec.lift, p.tail + sway, 0, 'YXZ')
    else g.rotation.set(spec.curl, 0, (p.tail + sway) * 0.35, 'XYZ')
  })
}

type V3 = [number, number, number]

const place = new Matrix4()
const turn = new Euler()
const spin = new Quaternion()
const at3 = new Vector3()
const size3 = new Vector3()

/** A body's solids as they are made, before they are hung on the joints. */
interface Piece {
  bone: Group
  geometry: BufferGeometry
  material: Material
  shadow: boolean
}

/**
 * Collects a body's solids, each moved into place on its joint, and hangs them merged: one
 * mesh per joint and colour (a head with its ears and nose draws once). Small bits cast no
 * shadow.
 */
class Dresser {
  private readonly pieces: Piece[] = []

  add(bone: Group, geometry: BufferGeometry, material: Material, at: V3, how: { rot?: [number, number, number, 'XYZ' | 'ZYX']; scale?: V3; shadow?: boolean } = {}) {
    const [rx, ry, rz, order] = how.rot ?? [0, 0, 0, 'XYZ']
    place.compose(at3.set(...at), spin.setFromEuler(turn.set(rx, ry, rz, order)), size3.set(...(how.scale ?? [1, 1, 1])))
    this.pieces.push({ bone, geometry: geometry.applyMatrix4(place), material, shadow: how.shadow ?? true })
  }

  /** Hangs every joint's solids, merged by colour. Returns the geometries made, for the caller to let go later. */
  hang(): BufferGeometry[] {
    const groups = new Map<string, Piece[]>()
    for (const p of this.pieces) {
      const key = `${p.bone.uuid}|${p.material.uuid}|${p.shadow}`
      const list = groups.get(key)
      if (list === undefined) groups.set(key, [p])
      else list.push(p)
    }
    const owned: BufferGeometry[] = []
    for (const list of groups.values()) {
      const first = list[0]!
      // Some primitives come indexed and some not (a rounded box): merged, they all go without.
      const geometry = list.length === 1 ? first.geometry : mergeGeometries(list.map((p) => (p.geometry.index === null ? p.geometry : p.geometry.toNonIndexed())))
      if (geometry === null) throw new Error('a body part would not merge')
      if (list.length > 1) for (const p of list) p.geometry.dispose()
      const mesh = new Mesh(geometry, first.material)
      mesh.castShadow = first.shadow
      first.bone.add(mesh)
      owned.push(geometry)
    }
    return owned
  }
}

/** An upright capsule from a joint down to the next, `len` long in all. */
const segment = (r: number, len: number) => new CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 2, 8)

/**
 * Hangs the body's solids on the joints. Returns the geometries made for it, for the
 * caller to let go when the look changes. The face and worn things are added elsewhere.
 * `lit`: the body lights itself in its own colours (glowing), not lit by the sun.
 */
export function dressBones(b: Bones, look: Look, pr: Proportions, lit: boolean): BufferGeometry[] {
  const d = new Dresser()
  const k = pr.height / (look.body === 'kid' ? KID_HEIGHT : look.body === 'grownup' ? 1.6 : look.body === 'dog' ? 0.6 : 0.5)
  const paint = lit ? glow : flat
  const skin = paint(look.skin)
  const top = paint(look.top)
  const bottom = paint(look.bottom)
  const shoes = paint(look.shoes)
  const R = pr.headR
  if (!pr.animal) {
    // The torso stops just over the shoulders with round corners, so the chin shows above it from high up.
    const torsoH = pr.shoulderY - pr.hipY
    d.add(b.upper, new RoundedBoxGeometry(pr.torsoW, torsoH + 0.06 * k, pr.torsoD, 2, 0.07 * k), top, [0, torsoH / 2, 0])
    d.add(b.squash, new RoundedBoxGeometry(pr.torsoW * 0.94, 0.13 * k, pr.torsoD * 0.92, 2, 0.04 * k), look.skirt ? top : bottom, [0, pr.hipY - 0.02 * k, 0])
    if (look.skirt) {
      const h = pr.hipY * 0.62
      d.add(b.squash, new CylinderGeometry(pr.torsoW * 0.5, pr.torsoW * 0.95, h, 12), bottom, [0, pr.hipY + 0.03 * k - h / 2, 0])
    }
    for (const name of ['armL', 'armR'] as const) {
      const l = b.limbs[name]
      d.add(l.top, segment(0.05 * k, pr.upperArm + 0.05 * k), top, [0, -pr.upperArm / 2, 0])
      d.add(l.mid, segment(0.045 * k, pr.lowerArm), top, [0, -pr.lowerArm / 2, 0])
      d.add(l.end, new SphereGeometry(0.058 * k, 8, 6), skin, [0, 0, 0], { shadow: false })
    }
    for (const name of ['legL', 'legR'] as const) {
      const l = b.limbs[name]
      const legs = look.skirt ? skin : bottom
      d.add(l.top, segment(0.068 * k, pr.thigh + 0.04 * k), legs, [0, -pr.thigh / 2 + 0.02 * k, 0])
      d.add(l.mid, segment(0.06 * k, pr.shin), legs, [0, -pr.shin / 2, 0])
      d.add(l.end, new RoundedBoxGeometry(0.12 * k, 0.08 * k, 0.2 * k, 2, 0.03 * k), shoes, [0, 0.04 * k, 0.03 * k], { shadow: false })
    }
    d.add(b.head, new SphereGeometry(R, 16, 12), skin, [0, 0, 0])
    for (const side of [1, -1]) d.add(b.head, new SphereGeometry(R * 0.2, 8, 6), skin, [side * R * 0.96, -R * 0.06, 0], { scale: [0.55, 1, 0.85] })
    d.add(b.head, new SphereGeometry(R * 0.1, 8, 6), skin, [0, -R * 0.14, R * 0.98])
    return d.hang()
  }
  const dog = look.body === 'dog'
  const r = pr.torsoW / 2
  d.add(b.upper, new CapsuleGeometry(r, pr.torsoD - 2 * r, 3, 10), skin, [0, 0, 0], { rot: [Math.PI / 2, 0, 0, 'XYZ'] })
  d.add(b.upper, new SphereGeometry(r * 0.78, 10, 8), bottom, [0, -r * 0.2, pr.torsoD / 2 - r * 0.9])
  d.add(b.neck, new TorusGeometry(R * 0.62, 0.022 * k, 6, 14), top, [0, -R * 0.15, -R * 0.1], { rot: [Math.PI / 2 - 0.5, 0, 0, 'XYZ'], shadow: false })
  for (const name of LIMBS) {
    const l = b.limbs[name]
    d.add(l.top, segment(0.034 * k, pr.thigh + 0.03 * k), skin, [0, -pr.thigh / 2 + 0.015 * k, 0])
    d.add(l.mid, segment(0.03 * k, pr.shin), skin, [0, -pr.shin / 2, 0])
    d.add(l.end, new SphereGeometry(0.044 * k, 8, 6), shoes, [0, 0.02 * k, 0.012 * k], { scale: [1, 0.7, 1.25], shadow: false })
  }
  d.add(b.head, new SphereGeometry(R, 16, 12), skin, [0, 0, 0])
  if (dog) {
    d.add(b.head, new SphereGeometry(R * 0.5, 10, 8), bottom, [0, -R * 0.32, R * 0.8], { scale: [1, 0.8, 1.2] })
    d.add(b.head, new SphereGeometry(R * 0.16, 8, 6), flat(palette.ink), [0, -R * 0.12, R * 1.38], { shadow: false })
    for (const side of [1, -1]) d.add(b.head, new SphereGeometry(R * 0.42, 8, 6), bottom, [side * R * 0.9, R * 0.05, -R * 0.1], { rot: [0, 0, side * 0.35, 'XYZ'], scale: [0.45, 1.25, 0.85] })
  } else {
    for (const side of [1, -1]) {
      // Spun so a flat side faces forward, then tipped outward.
      d.add(b.head, new ConeGeometry(R * 0.42, R * 0.78, 4), skin, [side * R * 0.56, R * 0.78, -R * 0.08], { rot: [0, Math.PI / 4, -side * 0.38, 'ZYX'] })
      d.add(b.head, new ConeGeometry(R * 0.24, R * 0.48, 4), flat(palette.nose), [side * R * 0.56, R * 0.74, R * 0.06], { rot: [0, Math.PI / 4, -side * 0.38, 'ZYX'], shadow: false })
      d.add(b.head, new SphereGeometry(R * 0.26, 8, 6), bottom, [side * R * 0.2, -R * 0.36, R * 0.84], { shadow: false })
      for (const tilt of [-0.18, 0.12]) d.add(b.head, new CylinderGeometry(R * 0.022, R * 0.022, R * 0.9, 3), flat(palette.whisker), [side * R * 0.68, -R * 0.36 + tilt * R, R * 0.78], { rot: [0, 0, Math.PI / 2 + side * tilt, 'XYZ'], shadow: false })
    }
    d.add(b.head, new SphereGeometry(R * 0.11, 8, 6), flat(palette.nose), [0, -R * 0.2, R * 1.02], { shadow: false })
  }
  const spec = TAIL[dog ? 'dog' : 'cat']
  b.tail.forEach((g, i) => d.add(g, segment(spec.r * k * (i === b.tail.length - 1 ? 1.1 : 1), spec.len * k + spec.r * k), i === b.tail.length - 1 ? bottom : skin, [0, (spec.len * k) / 2, 0]))
  return d.hang()
}
