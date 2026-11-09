import { Matrix4, Quaternion, Vector3, type Group, type Material, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../castle-builder/src/game/random'
import { backFrame, footFrame, handFrame, headFrame, proportions, type Frame } from '../engine/body'
import { BODY_KINDS, restPose, type Actor, type BodyKind } from '../engine/types'
import { Face } from './face'
import { dressBones, makeBones, poseBones } from './rig'

type Body = Pick<Actor, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll' | 'scale' | 'pose' | 'look' | 'pivot' | 'sway'>

const HEIGHT: Record<BodyKind, number> = { kid: 1.15, grownup: 1.6, cat: 0.5, dog: 0.6 }

/** A body somewhere in the room in a wild pose, squash left at 1 (body.ts has no squash). */
function wild(kind: BodyKind, rand: () => number): Body {
  const r = (lo: number, hi: number) => lo + (hi - lo) * rand()
  const pose = restPose()
  pose.lean = r(-1, 1)
  pose.tilt = r(-0.6, 0.6)
  pose.twist = r(-1, 1)
  pose.bob = r(-0.2, 0.8)
  pose.tail = r(-1, 1)
  pose.head = { nod: r(-1, 1), turn: r(-1.2, 1.2), tilt: r(-0.5, 0.5) }
  for (const limb of [pose.armL, pose.armR, pose.legL, pose.legR]) {
    limb.swing = r(-2, 3.2)
    limb.raise = r(-0.5, 2.5)
    limb.bend = r(0, 2)
  }
  return {
    x: r(-10, 10),
    y: r(0, 2),
    z: r(-10, 10),
    yaw: r(-4, 4),
    pitch: r(-1.6, 1.6),
    roll: r(-1, 1),
    scale: r(0.5, 2),
    // Half of them turn round a point up the body (a cartwheel's middle) and sway (sick, dizzy, cold).
    pivot: rand() < 0.5 ? 0 : r(0, 1),
    sway: rand() < 0.5 ? null : { tilt: r(-0.3, 0.3), twist: r(-0.1, 0.1), nod: r(-0.3, 0.4), turn: r(-0.4, 0.4) },
    pose,
    look: { body: kind, height: HEIGHT[kind] * r(0.8, 1.3), build: r(0.8, 1.3), skin: '#ffd9b3', eyes: '#2b2b30', top: '#9b5fd3', bottom: '#4a78e0', shoes: '#e8503f', skirt: rand() < 0.5, worn: {} },
  }
}

function expectAt(bone: Group, frame: Frame) {
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  bone.matrixWorld.decompose(p, q, s)
  expect(p.distanceTo(new Vector3(...frame.p))).toBeLessThan(1e-9)
  const r = frame.r
  const want = new Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1)
  const got = new Matrix4().makeRotationFromQuaternion(q)
  got.elements.forEach((v, i) => expect(v).toBeCloseTo(want.elements[i]!, 9))
  expect(s.x).toBeCloseTo(frame.s, 9)
}

describe('the rig', () => {
  it('puts the hands, mouth, head, feet and back exactly where body.ts does, in any pose', () => {
    const rand = mulberry32(7)
    for (const kind of BODY_KINDS) {
      for (let n = 0; n < 25; n++) {
        const a = wild(kind, rand)
        const pr = proportions(a.look)
        const bones = makeBones(pr, a.look.body)
        poseBones(bones, a, pr, 0)
        bones.root.updateMatrixWorld(true)
        expectAt(bones.hand.left, handFrame(a, 'left', pr))
        expectAt(bones.hand.right, handFrame(a, 'right', pr))
        expectAt(bones.head, headFrame(a, pr))
        expectAt(bones.back, backFrame(a, pr))
        expectAt(bones.limbs.legL.end, footFrame(a, 'left', pr))
        expectAt(bones.limbs.legR.end, footFrame(a, 'right', pr))
      }
    }
  })

  it('stands people and animals on the ground at rest', () => {
    for (const kind of BODY_KINDS) {
      const a = wild(kind, mulberry32(3))
      Object.assign(a, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, pose: restPose(), pivot: 0.5, sway: null })
      const pr = proportions(a.look)
      const bones = makeBones(pr, a.look.body)
      dressBones(bones, a.look, pr, false)
      poseBones(bones, a, pr, 0)
      bones.root.updateMatrixWorld(true)
      const feet = pr.animal ? Object.values(bones.limbs) : [bones.limbs.legL, bones.limbs.legR]
      for (const l of feet) expect(l.end.getWorldPosition(new Vector3()).y).toBeCloseTo(0, 9)
    }
  })

  it('dresses every body, a dress of one colour too, one mesh per joint and colour', () => {
    for (const kind of BODY_KINDS) {
      for (const skirt of [false, true]) {
        const a = wild(kind, mulberry32(9))
        a.look = { ...a.look, skirt, top: '#ff9ccf', bottom: '#ff9ccf' }
        const pr = proportions(a.look)
        const bones = makeBones(pr, a.look.body)
        const owned = dressBones(bones, a.look, pr, skirt)
        const meshes: Mesh[] = []
        bones.root.traverse((o) => void ((o as Mesh).isMesh && meshes.push(o as Mesh)))
        expect(meshes.length).toBe(owned.length)
        const seen = new Set(meshes.map((m) => `${m.parent!.uuid}|${(m.material as Material).uuid}|${m.castShadow}`))
        expect(seen.size).toBe(meshes.length)
      }
    }
  })

  it('turns a cartwheel round the middle: the middle stays put while the feet go over the head', () => {
    for (const kind of BODY_KINDS) {
      const a = wild(kind, mulberry32(4))
      Object.assign(a, { x: 1, y: 0, z: 2, yaw: 0.3, pitch: 0, roll: 0, scale: 1, pose: restPose(), pivot: 0.5, sway: null })
      const pr = proportions(a.look)
      const bones = makeBones(pr, a.look.body)
      const middle = (roll: number) => {
        a.roll = roll
        poseBones(bones, a, pr, 0)
        bones.root.updateMatrixWorld(true)
        return { centre: bones.root.getWorldPosition(new Vector3()), foot: bones.limbs.legL.end.getWorldPosition(new Vector3()), head: bones.head.getWorldPosition(new Vector3()) }
      }
      const up = middle(0)
      const over = middle(Math.PI)
      expect(over.centre.distanceTo(up.centre)).toBeLessThan(1e-9)
      expect(up.centre.y).toBeCloseTo(a.look.height / 2, 9)
      // Upside down round the middle: the feet are up where the head was, above the ground.
      expect(over.foot.y).toBeGreaterThan(up.head.y - 0.25 * a.look.height)
      expect(over.head.y).toBeGreaterThan(-0.05)
    }
  })

  it('wears every mood on every kind of face', () => {
    for (const kind of BODY_KINDS) {
      const face = new Face({ ...wild(kind, mulberry32(5)).look })
      for (const mood of ['happy', 'sad', 'surprised', 'silly', 'angry', 'sleepy', 'love', 'scared'] as const) {
        face.show(mood, false)
        face.show(mood, true)
      }
      expect(face.group.children.length).toBeGreaterThan(4)
    }
  })
})
