import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group, Mesh, MeshStandardMaterial } from 'three'

import { ease, easeAngle } from '../game/math'
import { RECIPE, costEntries, hallOf, nearPiece, nodeById, pieceById, windStrength, type Sim, type Worker, type Workshop } from '../game/sim'
import { BALCONY, CAMERA_PITCH, CAMERA_YAW, Flat, Glow, GoodMesh, Shiny, dyeHex, palette, refAt, show } from './look'
import { Synced } from './Synced'

/**
 * The people: the hero, the workshop people and the King, all on one chibi rig. The
 * rig faces +X and turns with `rotation.y = -facing`, so a facing of 0 along +X in the
 * sim is a person looking along +X here. Nothing in this file is React state: every
 * person reads the sim in its own frame callback and moves its bones through refs,
 * easing toward the sim's height and facing so a climb is a hop and a turn is a turn.
 */

// The rig, standing on y = 0, about 1.7 tall with a big head: hips, shoulders, head.
const HIP_Y = 0.5
const LEG_L = 0.42
const SHOULDER_Y = 0.96
const ARM_L = 0.42
/** Where the hand is in the arm's frame: tools hang from here. */
const HAND_Y = -0.44
const HEAD_Y = 1.32
const HEAD_R = 0.36
const CROWN_Y = 0.2
const BUBBLE_Y = HEAD_Y + HEAD_R + 1.2
const TAU = Math.PI * 2
/** Tilts a flat thing to face the camera: up by its pitch, then round by its yaw. */
const FACE_CAMERA = [Math.PI / 2 - CAMERA_PITCH, CAMERA_YAW, 0, 'YXZ'] as const
/** The camera's right, on the ground: where a second thing in a bubble goes. */
const CAMERA_RIGHT = { x: Math.cos(CAMERA_YAW), z: -Math.sin(CAMERA_YAW) }

type ToolKind = 'axe' | 'pick' | 'shears' | 'basket' | 'hammer' | 'bucket' | 'mallet' | 'shuttle' | 'ladle'
const HERO_TOOLS: readonly ToolKind[] = ['axe', 'pick', 'shears', 'basket', 'hammer', 'bucket']
const WORKER_TOOL: Record<Workshop, ToolKind> = { woodcutter: 'axe', mason: 'mallet', smithy: 'hammer', weaver: 'shuttle', dyer: 'ladle' }
const APRONED: readonly Workshop[] = ['mason', 'smithy', 'dyer']

/** The bones a frame callback moves. The turn group carries the facing and the lean; the root the position, the hop and the sway. */
interface Rig {
  root: Group
  turn: Group
  head: Group
  legs: Group[]
  arms: Group[]
}

/** One jump within `dur` of `at`: how high it is now, and how squashed on landing right after. A -1 never happened. */
function jump(t: number, at: number, dur: number, height: number) {
  const since = t - at
  if (at < 0 || since < 0 || since > dur + 0.2) return { lift: 0, squash: 0 }
  if (since < dur) return { lift: height * Math.sin((Math.PI * since) / dur), squash: 0 }
  return { lift: 0, squash: Math.sin((Math.PI * (since - dur)) / 0.2) }
}

/** Little hops on the spot, `hz` a second, for `dur` after `at`. A -1 never happened. */
function bounce(t: number, at: number, dur: number, height: number, hz: number) {
  const since = t - at
  return at >= 0 && since >= 0 && since < dur ? height * Math.abs(Math.sin(Math.PI * hz * since)) : 0
}

/** Legs and arms scissoring at `phase`, the arms against the legs. Returns the bob that goes with the steps. */
function stride(rig: Rig, phase: number, legAmp: number, armAmp: number) {
  const s = Math.sin(phase)
  rig.legs[0]!.rotation.z = s * legAmp
  rig.legs[1]!.rotation.z = -s * legAmp
  rig.arms[0]!.rotation.z = -s * armAmp
  rig.arms[1]!.rotation.z = s * armAmp
  return 0.05 * Math.abs(Math.cos(phase))
}

/**
 * The chibi rig: a sphere head with two dark eyes on the +X side, a box body, two arms
 * and two legs hung from their pivots, feet. The owner adds what goes on the head, on
 * the body, in each hand and over the head, and moves the bones every frame through
 * `animate`. The pose is reset before every call, so an animator sets only what it
 * bends; the sway and the wind lean are added here for everybody.
 */
function Person({
  sim,
  tunic,
  breeches,
  boots,
  hat,
  extras,
  held,
  above,
  animate,
}: {
  sim: Sim
  tunic: string
  breeches: string
  boots: string
  /** In the head's frame, origin at the head's centre. */
  hat: ReactNode
  /** In the turned body's frame: aprons, capes, robes. */
  extras: ReactNode
  /** In the left and the right arm's frame, the hand at HAND_Y. */
  held: [ReactNode, ReactNode]
  /** Over the head, not turning with the person: a thought bubble. */
  above: ReactNode
  animate: (rig: Rig, t: number, dt: number) => void
}) {
  const rig = useRef<Rig>({ root: null!, turn: null!, head: null!, legs: [], arms: [] }).current
  const last = useRef(sim.time)
  useFrame(() => {
    const t = sim.time
    const dt = Math.min(0.1, Math.max(0, t - last.current))
    last.current = t
    for (const g of rig.legs) g.rotation.set(0, 0, 0)
    for (const g of rig.arms) g.rotation.set(0, 0, 0)
    rig.head.rotation.set(0, 0, 0)
    rig.head.position.y = HEAD_Y
    rig.turn.rotation.set(0, 0, 0)
    rig.root.scale.set(1, 1, 1)
    animate(rig, t, dt)
    // Everything alive sways a little, and leans away from the east wind, whichever way it faces.
    const { x, z } = rig.root.position
    const wind = windStrength(sim)
    rig.root.rotation.set(0.015 * Math.sin(0.9 * t + x * 0.7 + z * 1.3), 0, 0.02 * Math.sin(t + x * 0.7 + z * 1.3) + 0.1 * wind * (1 + 0.3 * Math.sin(7 * t + x)))
  })
  return (
    <group
      ref={(el) => {
        if (el) rig.root = el
      }}
    >
      <group
        ref={(el) => {
          if (el) rig.turn = el
        }}
      >
        {[-1, 1].map((side, i) => (
          <group
            key={side}
            position={[0, HIP_Y, side * 0.13]}
            ref={(el) => {
              if (el) rig.legs[i] = el
            }}
          >
            <mesh position={[0, -LEG_L / 2, 0]} castShadow>
              <boxGeometry args={[0.17, LEG_L, 0.17]} />
              <Flat color={breeches} />
            </mesh>
            <mesh position={[0.05, -LEG_L - 0.04, 0]} castShadow>
              <boxGeometry args={[0.3, 0.08, 0.2]} />
              <Flat color={boots} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, (HIP_Y + SHOULDER_Y) / 2 + 0.02, 0]} castShadow>
          <boxGeometry args={[0.5, SHOULDER_Y - HIP_Y + 0.1, 0.42]} />
          <Flat color={tunic} />
        </mesh>
        {extras}
        {[-1, 1].map((side, i) => (
          <group
            key={side}
            position={[0, SHOULDER_Y, side * 0.31]}
            ref={(el) => {
              if (el) rig.arms[i] = el
            }}
          >
            <mesh position={[0, -ARM_L / 2, 0]} castShadow>
              <boxGeometry args={[0.15, ARM_L, 0.15]} />
              <Flat color={tunic} />
            </mesh>
            {held[i]}
          </group>
        ))}
        <group
          position={[0, HEAD_Y, 0]}
          ref={(el) => {
            if (el) rig.head = el
          }}
        >
          <mesh castShadow>
            <sphereGeometry args={[HEAD_R, 10, 8]} />
            <Flat color={palette.skin} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0.31, 0.05, side * 0.13]}>
              <sphereGeometry args={[0.055, 6, 5]} />
              <Flat color={palette.eye} />
            </mesh>
          ))}
          {hat}
        </group>
      </group>
      {above}
    </group>
  )
}

/** A gold band with four spikes, sat around the top of the head. */
function Crown({ size }: { size: number }) {
  return (
    <group scale={size}>
      <mesh castShadow>
        <cylinderGeometry args={[0.36, 0.39, 0.2, 8, 1, true]} />
        <Shiny color={palette.crown} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.36, 0.18, Math.sin((i * Math.PI) / 2) * 0.36]}>
          <coneGeometry args={[0.07, 0.18, 4]} />
          <Shiny color={palette.crown} />
        </mesh>
      ))}
    </group>
  )
}

/** A tool as the hand holds it: the handle runs on down the arm, the working end past the fingers. */
function Tool({ kind }: { kind: ToolKind }) {
  const handle = (len: number) => (
    <mesh position={[0, 0.12 - len / 2, 0]} castShadow>
      <boxGeometry args={[0.06, len, 0.06]} />
      <Flat color={palette.wood} />
    </mesh>
  )
  switch (kind) {
    case 'axe':
      return (
        <group>
          {handle(0.62)}
          <mesh position={[0.15, -0.4, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
            <coneGeometry args={[0.13, 0.24, 4]} />
            <Shiny color={palette.iron} iron />
          </mesh>
        </group>
      )
    case 'pick':
      return (
        <group>
          {handle(0.62)}
          <mesh position={[0, -0.44, 0]} castShadow>
            <boxGeometry args={[0.46, 0.07, 0.07]} />
            <Shiny color={palette.iron} iron />
          </mesh>
        </group>
      )
    case 'hammer':
      return (
        <group>
          {handle(0.5)}
          <mesh position={[0.03, -0.35, 0]} castShadow>
            <boxGeometry args={[0.24, 0.13, 0.13]} />
            <Shiny color={palette.iron} iron />
          </mesh>
        </group>
      )
    case 'mallet':
      return (
        <group>
          {handle(0.5)}
          <mesh position={[0, -0.35, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.28, 8]} />
            <Flat color={palette.woodDark} />
          </mesh>
        </group>
      )
    case 'shears':
      return (
        <group>
          {[-1, 1].map((side) => (
            <group key={side} rotation={[0, 0, side * 0.18]}>
              <mesh position={[0, -0.24, 0]}>
                <boxGeometry args={[0.05, 0.46, 0.025]} />
                <Shiny color={palette.iron} iron />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'basket':
      return (
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.15, 0.18, 8]} />
          <Flat color={palette.wood} />
        </mesh>
      )
    case 'bucket':
      return (
        <group>
          <mesh position={[0, -0.26, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.12, 0.26, 8]} />
            <Flat color={palette.woodDark} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.03, 8]} />
            <Flat color={palette.water2} />
          </mesh>
        </group>
      )
    case 'shuttle':
      return (
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.08, 0.4, 4]} />
          <Flat color={palette.plank} />
        </mesh>
      )
    case 'ladle':
      return (
        <group>
          {handle(0.5)}
          <mesh position={[0, -0.4, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.07, 0.1, 8]} />
            <Shiny color={palette.iron} iron />
          </mesh>
        </group>
      )
  }
}

/** What each trade wears on its head. */
function Hat({ kind }: { kind: Workshop }) {
  switch (kind) {
    case 'woodcutter':
      return (
        <>
          <mesh position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.38, 8, 5, 0, TAU, 0, Math.PI / 2]} />
            <Flat color={palette.hat} />
          </mesh>
          <mesh position={[0.36, 0.14, 0]}>
            <boxGeometry args={[0.22, 0.05, 0.3]} />
            <Flat color={palette.hat} />
          </mesh>
        </>
      )
    case 'mason':
      return (
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.42, 0.36, 0.1, 8]} />
          <Flat color={palette.hat} />
        </mesh>
      )
    case 'smithy':
      return (
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.38, 8, 5, 0, TAU, 0, Math.PI / 2]} />
          <Flat color={palette.iron} />
        </mesh>
      )
    case 'weaver':
      return (
        <>
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.4, 8, 5, 0, TAU, 0, Math.PI / 2]} />
            <Flat color={palette.woolWhite} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.46, 0.46, 0.05, 8]} />
            <Flat color={palette.woolWhite} />
          </mesh>
        </>
      )
    case 'dyer':
      return (
        <mesh position={[0.04, 0.3, -0.06]} rotation={[0.15, 0, -0.1]} scale={[1.15, 0.4, 1.15]}>
          <sphereGeometry args={[0.36, 8, 6]} />
          <Flat color={dyeHex(3)} />
        </mesh>
      )
  }
}

/** What the hero holds for the job in hand, or nothing between jobs and for a banner picked up by hand. */
function heroTool(s: Sim): ToolKind | null {
  const job = s.hero.job
  if (job === null) return null
  if (job.kind === 'repair') return 'hammer'
  if (job.kind === 'douse') return 'bucket'
  switch (nodeById(s, job.id).kind) {
    case 'tree':
      return 'axe'
    case 'rock':
    case 'ore':
      return 'pick'
    case 'sheep':
      return 'shears'
    case 'flowers':
      return 'basket'
    case 'lostbanner':
      return null
  }
}

/**
 * The hero: blue tunic, boots, a gold crown that slides over the eyes on a sudden
 * stop, a red cape of three slats that trail one behind the other. Runs with a lean,
 * hops on the button, chops with the job's tool at every swing, dances on the hall,
 * and holds on to the crown looking up when a storm is coming.
 */
function Hero({ sim }: { sim: Sim }) {
  const st = useRef({ y: sim.hero.y, yaw: -sim.hero.facing, lean: 0, cape: [0, 0, 0] })
  const crown = useRef<Group>(null!)
  const capes = useRef<Group[]>([])
  const tools = useRef(new Map<ToolKind, Group>())
  const animate = (rig: Rig, t: number, dt: number) => {
    const h = sim.hero
    const s = st.current
    const hall = hallOf(sim)
    const dancing = !h.moving && hall !== null && nearPiece(hall, h.x, h.z, 0)
    s.y = ease(s.y, h.y, dt, 0.12)
    s.yaw = dancing ? s.yaw + 1.3 * dt : easeAngle(s.yaw, -h.facing, dt, 0.08)
    const j = jump(t, h.hopAt, 0.45, 0.9)
    let lift = j.lift + bounce(t, sim.cheerAt, 1, 0.3, 3)
    let lean = 0
    let breathe = 0
    if (h.moving) {
      lift += stride(rig, t * TAU * 6, 0.8, 0.7)
      lean = (-8 * Math.PI) / 180
    } else if (h.job) {
      // The tool arm held high, chopping down for a quarter second at every swing; the other arm braces.
      const p = h.swungAt >= 0 ? (t - h.swungAt) / 0.25 : 1
      const chop = p >= 0 && p < 1 ? (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) : 0
      rig.arms[1]!.rotation.z = 2.5 - 2 * chop
      rig.arms[0]!.rotation.z = 0.35
      lean = -0.12 * chop
    } else if (dancing) {
      // On the dance floor: a slow spin, a bob on every beat of 120 a minute, arms up and waving.
      lift += 0.12 * Math.abs(Math.sin(TAU * t))
      rig.arms[0]!.rotation.z = Math.PI - 0.6 + 0.3 * Math.sin(TAU * t)
      rig.arms[1]!.rotation.z = Math.PI - 0.6 - 0.3 * Math.sin(TAU * t)
      rig.head.rotation.z = 0.1 * Math.sin(TAU * t)
    } else {
      breathe = 0.02 * Math.sin(2.4 * t)
      if (sim.weather === 'warning') {
        // Looking up at the grumpy cloud, one hand on the crown.
        rig.head.rotation.z = 0.55
        rig.arms[0]!.rotation.set(0.4, 0, Math.PI - 0.2)
      }
    }
    s.lean = ease(s.lean, lean, dt, 0.1)
    rig.turn.rotation.set(0, s.yaw, s.lean)
    rig.root.position.set(h.x, s.y + lift, h.z)
    rig.root.scale.set(1 + 0.15 * j.squash, (1 - 0.2 * j.squash) * (1 + breathe), 1 + 0.15 * j.squash)
    const stop = t - h.stoppedAt
    crown.current.position.y = CROWN_Y - (stop >= 0 && stop < 0.5 ? 0.28 * Math.sin((Math.PI * stop) / 0.5) : 0)
    // The cape: the first slat lifts with speed and the wind, each next one chases the one before.
    const flutter = h.moving ? 0.08 : 0.02
    let target = -(0.15 + (h.moving ? 1 : 0) + 0.6 * windStrength(sim))
    capes.current.forEach((slat, i) => {
      s.cape[i] = ease(s.cape[i]!, target, dt, 0.1 + 0.05 * i)
      slat.rotation.z = s.cape[i]! + flutter * Math.sin(9 * t + i * 1.7)
      target = s.cape[i]!
    })
    const tool = heroTool(sim)
    for (const [kind, g] of tools.current) show(g, kind === tool)
  }
  return (
    <Person
      sim={sim}
      tunic={palette.heroTunic}
      breeches={palette.woodDark}
      boots={palette.heroBoots}
      hat={
        <group ref={crown} position={[0, CROWN_Y, 0]}>
          <Crown size={1} />
        </group>
      }
      extras={
        <>
          {[-0.16, 0, 0.16].map((z, i) => (
            <group key={z} position={[-0.24, SHOULDER_Y + 0.02, z]} ref={refAt(capes, i)}>
              <mesh position={[0, -0.36, 0]} castShadow>
                <boxGeometry args={[0.04, 0.72, 0.15]} />
                <Flat color={palette.cape} />
              </mesh>
            </group>
          ))}
        </>
      }
      held={[
        null,
        <>
          {HERO_TOOLS.map((kind) => (
            <group
              key={kind}
              position={[0, HAND_Y, 0]}
              ref={(el) => {
                if (el) tools.current.set(kind, el)
              }}
            >
              <Tool kind={kind} />
            </group>
          ))}
        </>,
      ]}
      above={null}
      animate={animate}
    />
  )
}

/**
 * A workshop person: their trade's colour, hat and tool, an apron for the dusty
 * trades. Walks to the yard and back with the goods on the head, swings the tool at
 * the door facing into the shop, and between jobs sits on the doorstep with a thought
 * bubble of what the shop needs, hollow while the yard has none of it. A broken or
 * burning shop has them standing with their hands on their head.
 */
function WorkerModel({ sim, worker }: { sim: Sim; worker: Worker }) {
  // The shop is held as the object, not looked up every frame: the hand can take it out of
  // the sim's list a frame before React unmounts this person, and the object is still whole.
  const shop = pieceById(sim, worker.piece)
  const st = useRef({ y: worker.y, yaw: -worker.facing, sit: 0 })
  const carried = useRef<Group>(null!)
  const bubble = useRef<Group>(null!)
  const icons = useRef<Group[]>([])
  const hollow = useRef<boolean[]>([])
  const inputs = costEntries(RECIPE[worker.kind].inputs)
  const animate = (rig: Rig, t: number, dt: number) => {
    const s = st.current
    const sitting = worker.state === 'wait' && shop.state === 'ok'
    s.y = ease(s.y, worker.y, dt, 0.12)
    // Sitting, they face out of the door toward the camera; otherwise the way the sim walked them.
    s.yaw = easeAngle(s.yaw, sitting ? -Math.PI / 2 : -worker.facing, dt, 0.1)
    s.sit = ease(s.sit, sitting ? 1 : 0, dt, 0.15)
    let lift = bounce(t, worker.madeAt, 0.6, 0.3, 3) + bounce(t, sim.cheerAt, 1, 0.3, 3)
    let lean = 0
    show(carried.current, worker.carrying !== null)
    show(bubble.current, sitting)
    switch (worker.state) {
      case 'fetch':
      case 'carry':
        lift += stride(rig, t * TAU * 5, 0.7, 0.6)
        break
      case 'work': {
        const w = Math.sin(TAU * 3 * t)
        rig.arms[1]!.rotation.z = 1.7 + 0.8 * w
        rig.arms[0]!.rotation.z = 0.5 - 0.25 * w
        lean = -0.05 - 0.05 * w
        break
      }
      case 'wait':
        if (sitting) {
          rig.legs[0]!.rotation.z = s.sit * (Math.PI / 2 - 0.5 + 0.2 * Math.sin(2 * t + worker.id))
          rig.legs[1]!.rotation.z = s.sit * (Math.PI / 2 - 0.5 - 0.2 * Math.sin(2 * t + worker.id))
          rig.arms[0]!.rotation.z = 0.6 * s.sit
          rig.arms[1]!.rotation.z = 0.6 * s.sit
        } else {
          // Hands on the head, wobbling: the shop is on fire or in bits.
          rig.arms[0]!.rotation.set(0.45, 0, Math.PI - 0.3)
          rig.arms[1]!.rotation.set(-0.45, 0, Math.PI - 0.3)
          rig.head.rotation.y = 0.25 * Math.sin(9 * t)
          lean = 0.08 * Math.sin(12 * t)
        }
        break
    }
    rig.turn.rotation.set(0, s.yaw, lean)
    rig.root.position.set(worker.x, s.y + lift - 0.3 * s.sit, worker.z)
    if (!sitting) return
    bubble.current.position.y = BUBBLE_Y + 0.05 * Math.sin(2 * t + worker.id)
    inputs.forEach(([good, n], i) => {
      const lacking = sim.store[good] < n
      if (hollow.current[i] === lacking) return
      hollow.current[i] = lacking
      icons.current[i]!.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh) (m.material as MeshStandardMaterial).wireframe = lacking
      })
    })
  }
  const kind = worker.kind
  return (
    <Person
      sim={sim}
      tunic={palette.worker[kind]}
      breeches={palette.woodDark}
      boots={palette.heroBoots}
      hat={
        <>
          <Hat kind={kind} />
          <group ref={carried} position={[0, HEAD_R + 0.3, 0]} scale={0.8}>
            <GoodMesh good={inputs[0]![0]} />
          </group>
        </>
      }
      extras={
        APRONED.includes(kind) ? (
          <mesh position={[0.27, 0.72, 0]}>
            <boxGeometry args={[0.05, 0.44, 0.34]} />
            <Flat color={palette.apron} />
          </mesh>
        ) : null
      }
      held={[
        null,
        <group position={[0, HAND_Y, 0]}>
          <Tool kind={WORKER_TOOL[kind]} />
        </group>,
      ]}
      above={
        <group ref={bubble} position={[0, BUBBLE_Y, 0]}>
          <mesh rotation={FACE_CAMERA}>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 14]} />
            <Glow color={palette.cloud} />
          </mesh>
          <mesh position={[0.12, -0.5, 0.18]}>
            <sphereGeometry args={[0.09, 6, 5]} />
            <Glow color={palette.cloud} />
          </mesh>
          {inputs.map(([good], i) => {
            const side = (i - (inputs.length - 1) / 2) * 0.42
            return (
              <group key={good} position={[0.04 + side * CAMERA_RIGHT.x, 0.09, 0.06 + side * CAMERA_RIGHT.z]} scale={0.35} ref={refAt(icons, i)}>
                <GoodMesh good={good} />
              </group>
            )
          })}
        </group>
      }
      animate={animate}
    />
  )
}

/**
 * The King on the keep's balcony, facing the front: purple robe with ermine trim, red
 * cloak, big crown, white beard. Sways, claps and hops when a wish is done or the
 * bell rings, points at the sky when a storm is coming, and waves when the hero has
 * stood still for a while.
 */
function King({ sim }: { sim: Sim }) {
  const animate = (rig: Rig, t: number) => {
    const at = Math.max(sim.wishDoneAt, sim.cheerAt)
    const h = sim.hero
    let lift = 0
    if (at >= 0 && t - at < 1.5) {
      lift = 0.25 * Math.abs(Math.sin(Math.PI * 3 * (t - at)))
      const meet = 0.4 + 0.35 * Math.sin(TAU * 4 * t)
      rig.arms[0]!.rotation.set(0, -meet, Math.PI / 2 - 0.2)
      rig.arms[1]!.rotation.set(0, meet, Math.PI / 2 - 0.2)
      rig.head.rotation.z = 0.15 * Math.sin(TAU * 3 * t)
    } else if (sim.weather === 'warning') {
      rig.arms[1]!.rotation.z = Math.PI - 0.35
      rig.head.rotation.z = 0.45
    } else if (!h.moving && t - h.stoppedAt > 10) {
      rig.arms[1]!.rotation.set(0.35 * Math.sin(3 * t), 0, Math.PI - 0.3)
    } else {
      rig.arms[0]!.rotation.z = 0.15 + 0.05 * Math.sin(1.7 * t)
      rig.arms[1]!.rotation.z = 0.15 + 0.05 * Math.sin(1.7 * t + 1)
    }
    rig.turn.rotation.set(0, -Math.PI / 2, 0.03 * Math.sin(1.3 * t))
    rig.root.position.set(BALCONY.x, BALCONY.y + lift, BALCONY.z)
  }
  return (
    <Person
      sim={sim}
      tunic={palette.king}
      breeches={palette.king}
      boots={palette.heroBoots}
      hat={
        <>
          <group position={[0, CROWN_Y, 0]}>
            <Crown size={1.3} />
          </group>
          <mesh position={[0.24, -0.2, 0]} scale={[1, 1.3, 1]}>
            <icosahedronGeometry args={[0.15, 0]} />
            <Flat color={palette.ermine} />
          </mesh>
        </>
      }
      extras={
        <>
          <mesh position={[0, 0.52, 0]} castShadow>
            <boxGeometry args={[0.6, 0.86, 0.5]} />
            <Flat color={palette.king} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.64, 0.1, 0.54]} />
            <Flat color={palette.ermine} />
          </mesh>
          <mesh position={[0, 0.98, 0]}>
            <boxGeometry args={[0.56, 0.08, 0.5]} />
            <Flat color={palette.ermine} />
          </mesh>
          <mesh position={[-0.33, 0.55, 0]} castShadow>
            <boxGeometry args={[0.06, 0.9, 0.5]} />
            <Flat color={palette.kingRobe} />
          </mesh>
        </>
      }
      held={[null, null]}
      above={null}
      animate={animate}
    />
  )
}

/** Everybody alive on the island: the hero, one person per workshop, and the King on the keep. */
export function People({ sim }: { sim: Sim }) {
  return (
    <>
      <Hero sim={sim} />
      <Synced list={() => sim.workers} render={(w) => <WorkerModel key={w.id} sim={sim} worker={w} />} />
      <King sim={sim} />
    </>
  )
}
