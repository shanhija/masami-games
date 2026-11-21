/**
 * The town's animals. Every species is two instanced meshes (the body and both legs), so the whole
 * crowd costs the same few draw calls whether it is five animals or thirty. Pip, the first
 * hedgehog, wears a yellow hard hat. Poses come from the mood and the seconds in it.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'

import { clamp01 } from '../game/math'
import { SPECIES, type Animal, type Sim, type Species } from '../game/model'
import { creature, warmDrivers } from './creatures'
import { cylinder, lathe, part, SOLID, sphere } from './parts'
import { put, solidGeo } from './Things'

const CAPACITY = 40
const ICE_CREAMS = 16
const PIP_HAT = '#ffd23f'

/** One shape: a species, with or without Pip's hat. */
interface Kind {
  species: Species
  hat: string | null
}
const KINDS: readonly Kind[] = [...SPECIES.map((species): Kind => ({ species, hat: null })), { species: 'hedgehog', hat: PIP_HAT }]
const PIP = KINDS.length - 1

const kindOf = (a: Animal): number => (a.id === 0 && a.species === 'hedgehog' ? PIP : SPECIES.indexOf(a.species))

/** How an animal stands this frame. */
interface Pose {
  /** Metres up from its feet, and the body's pitch, roll and extra turn. */
  lift: number
  pitch: number
  roll: number
  turn: number
  /** Squash and stretch of the body upward. */
  stretch: number
  /** Leg swings, left then right. */
  left: number
  right: number
  /** The whole animal's size, evenly in all three. */
  size: number
}
const pose: Pose = { lift: 0, pitch: 0, roll: 0, turn: 0, stretch: 1, left: 0, right: 0, size: 1 }

/** The animal waving from her new home's window is this much bigger, so the party's camera reads who it is. */
export const WAVE_SIZE = 2.4

/** The animal running to her new home is as big as when she waves at the far end of the road, down to her own size by the time she is `WALK_IN_NEAR` metres from the door, so the wide shot of her coming reads who it is. */
const WALK_IN_SIZE = WAVE_SIZE
const WALK_IN_NEAR = 6
const WALK_IN_FAR = 22

/** How big an animal is drawn for her walk to her door: more the further she is from it. */
export function walkInSize(a: Animal): number {
  if (!a.movingIn) return 1
  return 1 + (WALK_IN_SIZE - 1) * clamp01((Math.hypot(a.goalX - a.x, a.goalZ - a.z) - WALK_IN_NEAR) / (WALK_IN_FAR - WALK_IN_NEAR))
}

/** The pose an animal strikes this frame, filled into one shared record that the next call overwrites. */
export function poseOf(a: Animal): Readonly<Pose> {
  const t = a.t
  const k = a.id
  pose.lift = 0
  pose.pitch = 0
  pose.roll = 0
  pose.turn = 0
  pose.stretch = 1
  pose.left = 0
  pose.right = 0
  pose.size = 1
  switch (a.mood) {
    case 'walk': {
      const ph = t * 9 + k
      pose.left = Math.sin(ph) * 0.75
      pose.right = -pose.left
      pose.lift = Math.abs(Math.sin(ph)) * 0.06
      pose.roll = Math.sin(ph) * 0.07
      pose.pitch = 0.06
      pose.size = walkInSize(a)
      break
    }
    case 'idle':
      pose.stretch = 1 + Math.sin(t * 2 + k) * 0.015
      pose.turn = Math.sin(t * 0.8 + k) * 0.2
      break
    case 'wave':
      if (a.home >= 0) pose.size = WAVE_SIZE
      pose.roll = Math.sin(t * 8) * 0.24
      pose.lift = Math.abs(Math.sin(t * 4)) * 0.05
      pose.turn = Math.sin(t * 2) * 0.15
      break
    case 'cheer': {
      const up = Math.abs(Math.sin(t * 6.5 + k))
      pose.lift = up * 0.5
      pose.stretch = 0.9 + 0.2 * up
      pose.left = Math.sin(t * 13 + k) * 0.8
      pose.right = -pose.left
      pose.roll = Math.sin(t * 6.5 + k) * 0.14
      break
    }
    case 'lick':
      pose.pitch = 0.12 + Math.sin(t * 5 + k) * 0.1
      pose.lift = Math.abs(Math.sin(t * 2.5)) * 0.02
      pose.turn = Math.sin(t * 1.3 + k) * 0.1
      break
    case 'swim':
      pose.lift = -0.5 + Math.sin(t * 2 + k) * 0.03
      pose.pitch = -0.12
      pose.roll = Math.sin(t * 3 + k) * 0.08
      pose.left = Math.sin(t * 10) * 0.9
      pose.right = -pose.left
      break
    case 'slide':
      pose.lift = -0.14
      pose.pitch = -0.45
      pose.left = -1.3
      pose.right = -1.3
      break
  }
  return pose
}

const body = new Matrix4()
const leg = new Matrix4()
const quat = new Quaternion()
const euler = new Euler()
const pos = new Vector3()
const scale = new Vector3()

export function Animals({ sim }: { sim: Sim }) {
  const bodies = useRef<(InstancedMesh | null)[]>([])
  const legs = useRef<(InstancedMesh | null)[]>([])
  const creams = useRef<InstancedMesh>(null)
  const ripples = useRef<InstancedMesh>(null)
  const shapes = useMemo(() => {
    warmDrivers()
    return KINDS.map((k) => creature(k.species, k.hat))
  }, [])
  const counts = useRef<number[]>(KINDS.map(() => 0))
  useFrame(() => {
    const n = counts.current
    n.fill(0)
    let cream = 0
    let ripple = 0
    for (const a of sim.animals) {
      const kind = kindOf(a)
      if (n[kind] >= CAPACITY) throw new Error(`more than ${CAPACITY} animals of ${KINDS[kind].species}`)
      const i = n[kind]++
      const c = shapes[kind]
      poseOf(a)
      const yaw = (a.mood === 'slide' ? Math.PI / 2 : a.yaw) + pose.turn
      body.compose(pos.set(a.x, a.y + pose.lift, a.z), quat.setFromEuler(euler.set(pose.pitch, yaw, pose.roll, 'YXZ')), scale.set(pose.size, pose.stretch * pose.size, pose.size))
      bodies.current[kind]!.setMatrixAt(i, body)
      for (let side = 0; side < 2; side++) {
        leg.makeRotationX(side === 0 ? pose.left : pose.right).setPosition(side === 0 ? c.hipX : -c.hipX, c.hipY, 0)
        legs.current[kind]!.setMatrixAt(i * 2 + side, leg.premultiply(body))
      }
      if (a.mood === 'lick') {
        if (cream >= ICE_CREAMS) throw new Error(`more than ${ICE_CREAMS} animals licking`)
        put(creams.current!, cream++, a.x + Math.sin(yaw) * 0.42, a.y + 0.62 + pose.lift, a.z + Math.cos(yaw) * 0.42, yaw, 1, 1, 1, pose.pitch * 0.5)
      }
      if (a.mood === 'swim') {
        if (ripple >= ICE_CREAMS) throw new Error(`more than ${ICE_CREAMS} animals swimming`)
        const u = (a.t * 0.9 + a.id * 0.3) % 1
        put(ripples.current!, ripple++, a.x, a.y + 0.03, a.z, 0, 0.5 + 0.7 * u)
      }
    }
    KINDS.forEach((_, kind) => {
      const b = bodies.current[kind]!
      const l = legs.current[kind]!
      b.count = n[kind]
      l.count = n[kind] * 2
      b.visible = l.visible = n[kind] > 0
      b.instanceMatrix.needsUpdate = true
      l.instanceMatrix.needsUpdate = true
    })
    creams.current!.count = cream
    creams.current!.visible = cream > 0
    creams.current!.instanceMatrix.needsUpdate = true
    ripples.current!.count = ripple
    ripples.current!.visible = ripple > 0
    ripples.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      {shapes.map((c, kind) => (
        <group key={kind}>
          <instancedMesh ref={(m) => void (bodies.current[kind] = m)} args={[c.body, SOLID, CAPACITY]} frustumCulled={false} receiveShadow visible={false} />
          <instancedMesh ref={(m) => void (legs.current[kind] = m)} args={[c.legs[0], SOLID, CAPACITY * 2]} frustumCulled={false} receiveShadow visible={false} />
        </group>
      ))}
      <instancedMesh
        ref={creams}
        args={[
          solidGeo('cream', [
            part(cylinder(0, 0.07, 0.22, 8), 'plush', [0, 0, 0], { colour: '#e0a85a' }),
            part(sphere(0.09, 10), 'plush', [0, 0.2, 0], { colour: '#ff8ec4' }),
            part(sphere(0.07, 10), 'plush', [0, 0.32, 0], { colour: '#fff6ea' }),
          ]),
          SOLID,
          ICE_CREAMS,
        ]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={ripples}
        args={[solidGeo('ripple', [part(lathe('ripple', [[0.82, 0], [1, 0], [1, 0.03], [0.82, 0.03], [0.82, 0]], 28), 'plush', [0, 0, 0], { colour: '#e8f6ff' })]), SOLID, ICE_CREAMS]}
        frustumCulled={false}
        visible={false}
      />
    </>
  )
}
