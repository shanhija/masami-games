import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, Mesh, Quaternion, Vector3, type Group, type InstancedMesh } from 'three'

import { clamp01, lerp } from '../../game/math'
import { craneBase } from '../../game/machines'
import { BEAMS_OUT_AT, BEAM_X0, BEAM_Y, HOOK_TOP_MOBILE, MOBILE_PIVOT_Y, OUTRIGGER_Z, PAD_OUT, SEAT, SLIDE, TURRET_Z, ease } from '../../game/model'
import type { Mobile as MobileState } from '../../game/model'
import type { Capsule } from '../frame'
import { Driver } from '../Driver'
import { arch, bake, box, cylinder, part, Rams, roundBox, SOLID, SOLID_MESH, sphere, Static, useBaked, Wheels, type MachineProps, type Part, type SetRam, type WheelSpot } from '../parts'
import { cabOver } from './shared-semi'

// The truck crane's draw calls, 12 in all: carrier 2 (with the cab's glass), wheels 1, outrigger beams 1, jacks 1, turret 1, three boom sections 3, rope 1, hook 1, ram 1. The driver adds 1.

const PI2 = Math.PI / 2
const R = 0.62
const FRONT_AXLES = [3.35, 2.1] as const
const REAR_AXLES = [-1.9, -3.15] as const
const WHEEL_X = 1.08
const WHEELS: readonly WheelSpot[] = [1, -1].flatMap((s) => [
  { x: s * WHEEL_X, y: R, z: FRONT_AXLES[0], steer: 1 },
  { x: s * WHEEL_X, y: R, z: FRONT_AXLES[1], steer: 0.6 },
  ...REAR_AXLES.map((z) => ({ x: s * WHEEL_X, y: R, z, steer: 0 })),
])

/** How high a jack is held while the legs are not down. */
const JACK_STOW_Y = 0.7

const CARRIER: Part[] = [
  ...cabOver({ halfW: 1.2, z0: 2.45, z1: 4.1, floor: 1.62, seat: SEAT.mobile }),
  // Frame rails and the deck over them.
  ...[0.55, -0.55].map((x) => part(box(0.3, 0.36, 8.2), 'dark', [x, 1.05, -0.2])),
  part(roundBox(2.4, 0.16, 5.4, 0.06), 'enamel', [0, 1.36, -1.5], { tint: 0.6 }),
  // Axles with their springs, front fenders over both front wheels, one long fender over both rear ones, mud flaps.
  ...[...FRONT_AXLES, ...REAR_AXLES].flatMap((z) => [
    part(cylinder(0.12, 0.12, 1.9, 12), 'dark', [0, R, z], { rot: [0, 0, PI2] }),
    ...[1, -1].map((s) => part(box(0.12, 0.1, 0.9), 'steel', [s * 0.55, 0.9, z])),
  ]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.78, 0.16, 2.9, 0.07), 'enamel', [s * 1.08, 1.4, 2.72], { tint: 0.8 }),
    part(roundBox(0.78, 0.16, 3.0, 0.07), 'enamel', [s * 1.08, 1.4, -2.52], { tint: 0.8 }),
    part(box(0.6, 0.5, 0.04), 'rubber', [s * 1.08, 0.9, -4.05]),
    part(box(0.6, 0.45, 0.04), 'rubber', [s * 1.08, 0.9, 1.4]),
    // Outrigger housings across the carrier, with a hazard stripe on each end.
    ...OUTRIGGER_Z.flatMap((z) => [part(roundBox(0.58, 0.5, 0.56, 0.1), 'enamel', [s * 0.98, BEAM_Y, z], { tint: 0.85 }), part(box(0.04, 0.34, 0.5), 'hazard', [s * 1.3, BEAM_Y, z])]),
    // Fuel tank and a tool box.
    part(cylinder(0.26, 0.26, 1.0, 16), 'chrome', [s * 0.82, 1.08, 0.2], { rot: [PI2, 0, 0] }),
    part(roundBox(0.4, 0.34, 0.9, 0.06), 'steel', [s * 0.9, 1.1, -0.9]),
  ]),
  // Rear bumper with a tail lamp bar.
  part(box(2.6, 0.3, 0.2), 'dark', [0, 1.1, -4.3]),
  ...[1, -1].map((s) => part(box(0.5, 0.2, 0.05), 'lamp', [s * 0.9, 1.1, -4.42], { colour: '#e0302a' })),
  part(box(1.1, 0.12, 0.05), 'hazard', [0, 1.1, -4.42]),
]

/** The turret in its own frame: origin on the carrier's turret axis, +z the way the boom points. A deck, the cheeks the boom hangs from, a winch, an engine hood, a counterweight and a small crane cab. */
const TURRET: Part[] = [
  part(cylinder(1.05, 1.05, 0.12, 28), 'steel', [0, 1.5, 0]),
  part(roundBox(2.5, 0.3, 3.3, 0.12), 'enamel', [0, 1.72, -0.1], { tint: 0.7 }),
  // Cheeks either side of the boom's root, and the pin through them.
  ...[1, -1].map((s) => part(roundBox(0.1, 1.2, 0.8, 0.04), 'enamel', [s * 0.57, 2.45, -0.1], { tint: 0.9 })),
  part(cylinder(0.14, 0.14, 1.4, 14), 'chrome', [0, MOBILE_PIVOT_Y, 0], { rot: [0, 0, PI2] }),
  part(cylinder(0.3, 0.3, 0.7, 16), 'dark', [0, 2.05, -0.75], { rot: [0, 0, PI2] }),
  ...[1, -1].map((s) => part(cylinder(0.4, 0.4, 0.06, 16), 'chrome', [s * 0.38, 2.05, -0.75], { rot: [0, 0, PI2] })),
  // Engine hood to the right, counterweight across the back with hazard stripes.
  part(roundBox(0.85, 0.7, 1.4, 0.2), 'enamel', [-0.85, 2.2, -0.45]),
  ...[0.18, 0.5].map((z) => part(box(0.03, 0.4, 0.06), 'dark', [-1.29, 2.2, -0.2 - z])),
  part(roundBox(2.5, 1.0, 0.9, 0.22), 'enamel', [0, 2.3, -1.4], { tint: 0.78 }),
  part(box(2.2, 0.28, 0.05), 'hazard', [0, 2.15, -1.86]),
  part(cylinder(0.07, 0.07, 0.7, 10), 'dark', [-1.0, 2.9, -0.95]),
  part(cylinder(0.09, 0.09, 0.06, 10), 'chrome', [-1.0, 3.25, -0.95]),
  // The crane cab, to the boom's left: skirt, pillars, roof, dark windows, lamps.
  part(roundBox(0.95, 0.5, 1.25, 0.1), 'enamel', [1.0, 2.12, 0.55]),
  ...[0.55, 1.45].flatMap((x) => [0.0, 1.1].map((z) => part(box(0.08, 0.95, 0.08), 'enamel', [x, 2.82, z]))),
  part(roundBox(1.05, 0.1, 1.35, 0.05), 'enamel', [1.0, 3.34, 0.55]),
  part(roundBox(0.8, 0.8, 0.03, 0.01), 'dark', [1.0, 2.8, 1.14]),
  part(roundBox(0.03, 0.8, 1.0, 0.01), 'dark', [1.49, 2.8, 0.55]),
  part(roundBox(0.8, 0.8, 0.03, 0.01), 'dark', [1.0, 2.8, -0.03]),
  part(box(0.16, 0.1, 0.1), 'dark', [1.1, 3.45, 1.1]),
  part(box(0.12, 0.07, 0.03), 'lamp', [1.1, 3.45, 1.17]),
  ...[0, 1].map((k) => part(box(0.03, 0.3, 0.07), 'dark', [1.5, 2.1, 0.2 + k * 0.2])),
]

// The boom: three nested sections along +z from the root pin. Each is a long box with a collar where it ends; the last has the head with its sheave.
const SECTION_LEN = 6.5
const ROOT_BACK = 0.4
const BOOM_SECTIONS = [
  { w: 0.95, h: 0.82, tint: 1 },
  { w: 0.8, h: 0.68, tint: 0.88 },
  { w: 0.66, h: 0.55, tint: 0.76 },
] as const
const SHEAVE_R = 0.34
/** Driving, the boom lies back along the carrier, retracted and nearly level. */
const STOW_ANGLE = 0.08

const sectionParts = (i: number): Part[] => {
  const { w, h, tint } = BOOM_SECTIONS[i]
  const z0 = -ROOT_BACK
  const parts = [
    part(roundBox(w, h, SECTION_LEN, 0.14), 'enamel', [0, 0, z0 + SECTION_LEN / 2], { tint }),
    part(roundBox(w + 0.08, h + 0.08, 0.2, 0.06), 'steel', [0, 0, z0 + SECTION_LEN - 0.1]),
    part(box(w * 0.5, 0.03, SECTION_LEN * 0.7), 'trim', [0, h / 2 + 0.005, z0 + SECTION_LEN * 0.5], { colour: '#f4f1e8' }),
  ]
  if (i === 0) {
    // Root: the pin eye, and the lug the luffing ram holds under the boom.
    parts.push(part(cylinder(0.2, 0.2, w + 0.2, 14), 'chrome', [0, 0, 0], { rot: [0, 0, PI2] }), part(box(0.14, 0.3, 0.2), 'steel', [0, -h / 2 - 0.12, 2.6]), part(sphere(0.09, 8), 'chrome', [0, -h / 2 - 0.26, 2.6]))
  }
  if (i === 2) {
    const tip = z0 + SECTION_LEN
    parts.push(
      part(box(0.9, 0.2, 0.55), 'hazard', [0, 0.38, tip - 0.55]),
      part(roundBox(0.7, 0.62, 0.4, 0.1), 'enamel', [0, -0.05, tip + 0.05], { tint: 0.7 }),
      part(cylinder(SHEAVE_R, SHEAVE_R, 0.5, 18), 'chrome', [0, 0, tip + 0.1], { rot: [0, 0, PI2] }),
      part(cylinder(0.08, 0.08, 0.7, 10), 'steel', [0, 0, tip + 0.1], { rot: [0, 0, PI2] }),
    )
  }
  return parts
}
const BOOM_PARTS = [0, 1, 2].map(sectionParts)

/** The hook, in its own frame: its belly at the origin, the big red and white block above it, a swivel eye on top. */
const HOOK: Part[] = [
  part(roundBox(0.72, 0.8, 0.5, 0.16), 'trim', [0, 1.05, 0], { colour: '#e03a3e' }),
  part(roundBox(0.74, 0.22, 0.52, 0.08), 'trim', [0, 1.1, 0], { colour: '#f4f1e8' }),
  ...[1, -1].map((s) => part(cylinder(0.26, 0.26, 0.05, 16), 'chrome', [s * 0.38, 1.05, 0], { rot: [0, 0, PI2] })),
  part(arch(0.23), 'chrome', [0, 0.36, 0], { rot: [0, 0, Math.PI], scale: [0.3, 0.3, 0.3] }),
  part(cylinder(0, 0.07, 0.2, 8), 'chrome', [0.3, 0.45, 0]),
  part(cylinder(0.07, 0.07, 0.45, 8), 'chrome', [-0.15, 0.53, 0], { rot: [0, 0, -0.72] }),
  part(cylinder(0.12, 0.12, 0.3, 10), 'steel', [0, 1.62, 0]),
  part(arch(0.3), 'chrome', [0, 1.7, 0], { scale: [0.17, 0.17, 0.17] }),
]
/** The hook is drawn this many times bigger than its parts list, so it reads from far. */
const HOOK_SCALE = 1.5
const HOOK_EYE = 1.9 * HOOK_SCALE

const ROPE = bake([part(cylinder(0.035, 0.035, 1, 6), 'dark', [0, 0, 0.5], { rot: [PI2, 0, 0] })], '#ffffff').solid

const BEAM: Part[] = [
  part(roundBox(1.7, 0.3, 0.38, 0.08), 'steel', [0, 0, 0]),
  part(box(1.2, 0.03, 0.3), 'hazard', [-0.1, 0.16, 0]),
  part(roundBox(0.38, 0.8, 0.5, 0.1), 'enamel', [0.75, 0, 0], { tint: 0.85 }),
]
const JACK: Part[] = [
  part(cylinder(0.09, 0.09, 0.85, 12), 'chrome', [0, 0.545, 0]),
  part(cylinder(0.36, 0.4, 0.12, 14), 'dark', [0, 0.06, 0]),
  part(cylinder(0.3, 0.3, 0.03, 14), 'rubber', [0, 0.135, 0]),
]

const matrix = new Matrix4()
const flip = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
const identity = new Quaternion()
const unit = new Vector3(1, 1, 1)
const position = new Vector3()

/** The four outrigger legs: beams that slide out from the carrier, then jacks that stamp down. One instanced mesh each. */
function Outriggers({ m, paint }: { m: { legs: number }; paint: string }) {
  const beams = useRef<InstancedMesh>(null)
  const jacks = useRef<InstancedMesh>(null)
  const beamGeo = useBaked(BEAM, paint).solid
  const jackGeo = useBaked(JACK, paint).solid
  useFrame(() => {
    const out = ease(clamp01(m.legs / BEAMS_OUT_AT))
    const down = ease(clamp01((m.legs - 0.5) / 0.5))
    let i = 0
    for (const z of OUTRIGGER_Z) {
      for (const s of [1, -1]) {
        const q = s > 0 ? identity : flip
        const x = BEAM_X0 + SLIDE * out
        matrix.compose(position.set(s * x, BEAM_Y, z), q, unit)
        beams.current!.setMatrixAt(i, matrix)
        matrix.compose(position.set(s * (x + PAD_OUT), JACK_STOW_Y * (1 - down), z), identity, unit)
        jacks.current!.setMatrixAt(i, matrix)
        i++
      }
    }
    beams.current!.instanceMatrix.needsUpdate = true
    jacks.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={beams} args={[beamGeo, SOLID, 4]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={jacks} args={[jackGeo, SOLID, 4]} frustumCulled={false} castShadow receiveShadow />
    </>
  )
}

/** The carrier's half length and the radius that stands for its body and the boom, in metres. */
const CARRIER_HALF = 4
const CARRIER_R = 1.8
const BOOM_R = 1.1

/** The truck crane as thick lines for the fade: the carrier from nose to tail and, once the legs are down, the boom from the turret to its tip. */
export function mobileShape(m: MobileState): Capsule[] {
  const sin = Math.sin(m.yaw)
  const cos = Math.cos(m.yaw)
  const body: Capsule = { a: [m.x + sin * CARRIER_HALF, m.y + 1.7, m.z + cos * CARRIER_HALF], b: [m.x - sin * CARRIER_HALF, m.y + 1.7, m.z - cos * CARRIER_HALF], r: CARRIER_R }
  if (m.legs < 1) return [body]
  const base = craneBase(m)
  return [body, { a: [base.x, m.y + MOBILE_PIVOT_Y, base.z], b: [base.x + Math.sin(m.jib) * m.reach, m.y + HOOK_TOP_MOBILE, base.z + Math.cos(m.jib) * m.reach], r: BOOM_R }]
}

const forward = new Vector3(0, 0, 1)
const ropeDir = new Vector3()

/**
 * The truck crane: an eight-wheeled carrier with a cab-over cab, four outrigger legs, a turret turning by jib - yaw and a boom of three nested
 * sections whose tip is at `reach` from the turret and HOOK_TOP_MOBILE high, with the rope and the red and white hook under it at hookY.
 * Draws in the carrier's own frame.
 */
export function Mobile({ m, paint, driver }: MachineProps<'mobile'>) {
  const turret = useRef<Group>(null)
  const boom = useRef<Group>(null)
  const mid = useRef<Group>(null)
  const tipSection = useRef<Group>(null)
  const hook = useRef<Group>(null)
  const rope = useRef<Mesh>(null)

  /** The boom's length and angle from the rule beside MOBILE_PIVOT_Y once the legs are down; before that it rises from lying back as they go down. */
  const boomPose = () => {
    const rise = HOOK_TOP_MOBILE - MOBILE_PIVOT_Y
    const rule = { len: Math.hypot(m.reach, rise), angle: Math.atan2(rise, m.reach) }
    if (m.legs >= 1) return rule
    const k = ease(clamp01(m.legs))
    return { len: lerp(SECTION_LEN - ROOT_BACK, rule.len, k), angle: lerp(STOW_ANGLE, rule.angle, k) }
  }

  useFrame(() => {
    const { len, angle } = boomPose()
    const slide = (len - (SECTION_LEN - ROOT_BACK)) / 2
    turret.current!.rotation.y = m.jib - m.yaw
    boom.current!.rotation.x = -angle
    mid.current!.position.z = slide
    tipSection.current!.position.z = slide
    // The tip of the boom and the top of the hook's block, in the turret's frame; the sway is a world offset, turned into it.
    const tipY = MOBILE_PIVOT_Y + Math.sin(angle) * len
    const sheaveY = tipY - SHEAVE_R
    // The tip's reach is the sim's only with the legs down; the hook hangs snug under the tip until then.
    const tipReach = Math.cos(angle) * len
    const snug = sheaveY - HOOK_EYE - 0.05
    const blockY = m.legs < 1 ? snug : Math.min(m.hookY - m.y, snug)
    const rodLen = Math.max(sheaveY - blockY - HOOK_EYE, 0.01)
    const lean = Math.min(1, rodLen * 0.25)
    const sway = Math.min(1, lean / Math.max(Math.hypot(m.swayX, m.swayZ), 1e-6))
    const wx = m.swayX * sway
    const wz = m.swayZ * sway
    const cj = Math.cos(m.jib)
    const sj = Math.sin(m.jib)
    const hx = wx * cj - wz * sj
    const hz = wx * sj + wz * cj + tipReach + 0.1
    hook.current!.position.set(hx, blockY, hz)
    // The rope runs from the sheave's underside to the hook's eye.
    const r = rope.current!
    r.position.set(0, sheaveY, tipReach + 0.1)
    ropeDir.set(hx, blockY + HOOK_EYE - sheaveY, hz - (tipReach + 0.1))
    r.scale.set(1, 1, ropeDir.length())
    r.quaternion.setFromUnitVectors(forward, ropeDir.normalize())
  })

  const rams = (set: SetRam) => {
    const { angle } = boomPose()
    const along = 2.6
    const under = -0.53
    const z = along * Math.cos(angle) - under * Math.sin(angle)
    const y = MOBILE_PIVOT_Y + along * Math.sin(angle) + under * Math.cos(angle)
    set(0, 0, 1.85, 1.0, 0, y, z)
  }

  return (
    <group>
      <Static parts={CARRIER} paint={paint} />
      <Wheels m={m} paint={paint} radius={R} width={0.55} spots={WHEELS} />
      <Outriggers m={m} paint={paint} />
      {driver && (
        <group position={SEAT.mobile as unknown as [number, number, number]}>
          <Driver species={driver.species} hat={driver.hat} />
        </group>
      )}
      <group ref={turret} position={[0, 0, TURRET_Z]}>
        <Static parts={TURRET} paint={paint} />
        <Rams count={1} radius={0.12} barrel={1.5} update={rams} />
        <group ref={boom} position={[0, MOBILE_PIVOT_Y, 0]}>
          <Static parts={BOOM_PARTS[0]} paint={paint} />
          <group ref={mid}>
            <Static parts={BOOM_PARTS[1]} paint={paint} />
            <group ref={tipSection}>
              <Static parts={BOOM_PARTS[2]} paint={paint} />
            </group>
          </group>
        </group>
        <group ref={hook} scale={HOOK_SCALE}>
          <Static parts={HOOK} paint={paint} />
        </group>
        <mesh ref={rope} geometry={ROPE} material={SOLID_MESH} castShadow />
      </group>
    </group>
  )
}
