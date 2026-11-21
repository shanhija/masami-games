import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import { BOOM_LEN, BOOM_ROOT_Y, BOOM_ROOT_Z, BUCKET_LEN, BUCKET_WIDTH, SCOOP, SEAT, STICK_LEN } from '../../game/model'
import { Driver } from '../Driver'
import { Beacon, box, cylinder, thickShell, ExhaustPuff, Mound, mirror, part, Rams, roundBox, shell, sphere, Static, Treads, Wheels, type MachineProps, type Part, type SetRam, type TreadSpec, type WheelSpot } from '../parts'

// The excavator's draw calls, 12 in all: undercarriage 1, treads 1, sprockets 1, turret 2 (with glass), boom 1, stick 1, bucket 1, load 1, rams 1, beacon 1, exhaust 1. The driver adds 1.

const TRACK_X = 1.05
const TREAD: TreadSpec = { x: TRACK_X, z: 0, len: 3.1, r: 0.42, cy: 0.53, width: 0.72, links: 32 }
const SPROCKETS: readonly WheelSpot[] = [1, -1].flatMap((s) => [-1.55, 1.55].map((z) => ({ x: s * TRACK_X, y: TREAD.cy, z, steer: 0 })))
const PI2 = Math.PI / 2

/** Undercarriage: the car body, the two track frames with their rollers, the turntable ring and the step. */
const UNDER: Part[] = [
  part(roundBox(1.7, 0.5, 2.1, 0.14), 'dark', [0, 0.8, 0]),
  part(cylinder(0.98, 0.98, 0.14, 32), 'steel', [0, 1.0, 0]),
  part(cylinder(0.84, 0.84, 0.05, 32), 'chrome', [0, 1.075, 0]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.55, 0.5, 3.2, 0.12), 'dark', [s * TRACK_X, 0.53, 0]),
    ...[-0.85, -0.28, 0.28, 0.85].map((z) => part(cylinder(0.17, 0.17, 0.62, 16), 'steel', [s * TRACK_X, 0.34, z], { rot: [0, 0, PI2] })),
    part(roundBox(0.1, 0.1, 3.3, 0.04), 'steel', [s * (TRACK_X + 0.31), 0.78, 0]),
  ]),
  // The step: a walkway to the cab door, a rung below it and two chrome rails.
  part(roundBox(0.42, 0.06, 1.1, 0.02), 'dark', [1.41, 1.15, 0.35]),
  part(box(0.3, 0.05, 0.55), 'dark', [1.6, 0.62, 0.35]),
  part(cylinder(0.022, 0.022, 0.56, 8), 'chrome', [1.74, 0.88, 0.12]),
  part(cylinder(0.022, 0.022, 0.56, 8), 'chrome', [1.74, 0.88, 0.58]),
]

/** Turret: deck, engine hood, counterweight with its hazard stripes, tank, boom mount, cab with glass, lamps, exhaust, mirrors. */
const TURRET: Part[] = [
  part(roundBox(2.6, 0.2, 3.1, 0.1), 'enamel', [0, 1.17, -0.45], { tint: 0.55 }),
  part(roundBox(2.5, 0.85, 1.0, 0.25), 'enamel', [0, 1.67, -0.8]),
  part(roundBox(2.6, 1.0, 0.75, 0.22), 'enamel', [0, 1.72, -1.65], { tint: 0.78 }),
  part(roundBox(2.1, 0.3, 0.05, 0.02), 'hazard', [0, 1.5, -2.04]),
  part(roundBox(2.1, 0.06, 0.4, 0.02), 'hazard', [0, 2.24, -1.65]),
  ...[1, -1].flatMap((s) => [
    ...[0, 1, 2].map((k) => part(box(0.03, 0.5, 0.07), 'dark', [s * 1.26, 1.7, -1.05 + k * 0.2])),
    part(box(0.12, 0.1, 0.05), 'lamp', [s * 1.0, 1.8, -2.06], { colour: '#e0302a' }),
  ]),
  // Tank and the boom mount: two ears the boom's pin passes through, and a gap between them for the lift ram.
  part(roundBox(0.95, 0.55, 1.05, 0.14), 'enamel', [-0.78, 1.55, 0.52]),
  part(cylinder(0.1, 0.1, 0.05, 14), 'chrome', [-0.9, 1.84, 0.4]),
  ...[1, -1].map((s) => part(box(0.09, 0.5, 0.34), 'enamel', [s * 0.3, 1.5, 0.72], { tint: 0.85 })),
  part(cylinder(0.12, 0.12, 0.84, 16), 'chrome', [0, BOOM_ROOT_Y, BOOM_ROOT_Z], { rot: [0, 0, PI2] }),
  part(box(0.28, 0.14, 0.2), 'steel', [0, 1.3, -0.02]),
  // Cab: skirt, four pillars, roof, glass on all four sides, seat back and dash with levers.
  part(roundBox(0.98, 0.34, 1.38, 0.08), 'enamel', [0.71, 1.28, 0.36], { tint: 0.92 }),
  part(roundBox(0.54, 0.16, 0.56, 0.05), 'dark', [0.62, 1.45, 0.28]),
  part(roundBox(0.52, 0.62, 0.1, 0.05), 'dark', [0.62, 1.85, -0.16]),
  ...[0.26, 1.16].flatMap((x) => [-0.28, 1.01].map((z) => part(roundBox(0.09, 1.55, 0.09, 0.03), 'enamel', [x, 2.02, z]))),
  part(roundBox(1.2, 0.1, 1.65, 0.05), 'enamel', [0.71, 2.84, 0.4]),
  part(roundBox(0.88, 1.26, 0.025, 0.01), 'glass', [0.71, 2.1, 1.01]),
  part(roundBox(0.88, 1.26, 0.025, 0.01), 'glass', [0.71, 2.1, -0.28]),
  part(roundBox(0.025, 1.26, 1.26, 0.01), 'glass', [1.16, 2.1, 0.36]),
  part(roundBox(0.025, 1.26, 1.26, 0.01), 'glass', [0.26, 2.1, 0.36]),
  part(roundBox(0.8, 0.34, 0.14, 0.05), 'dark', [0.71, 1.72, 0.9]),
  ...[0.45, 0.79].flatMap((x) => [part(cylinder(0.014, 0.014, 0.3, 8), 'chrome', [x, 1.9, 0.76]), part(sphere(0.04, 10), 'trim', [x, 2.07, 0.76], { colour: '#e03a3e' })]),
  // Work lamps on the roof, the exhaust, a grab rail and the mirrors.
  ...[0.4, 1.02].flatMap((x) => [part(box(0.18, 0.13, 0.14), 'dark', [x, 2.93, 1.0]), part(box(0.13, 0.08, 0.03), 'lamp', [x, 2.93, 1.08])]),
  part(cylinder(0.07, 0.07, 0.85, 12), 'dark', [-0.95, 2.5, -0.8]),
  part(cylinder(0.095, 0.095, 0.08, 12), 'chrome', [-0.95, 2.92, -0.8]),
  part(cylinder(0.02, 0.02, 0.8, 8), 'chrome', [1.27, 2.0, 0.97]),
  part(cylinder(0.02, 0.02, 0.1, 8), 'chrome', [1.22, 2.35, 0.97], { rot: [0, 0, PI2] }),
  part(cylinder(0.02, 0.02, 0.1, 8), 'chrome', [1.22, 1.65, 0.97], { rot: [0, 0, PI2] }),
  ...mirror([1.2, 2.55, 0.95], 1),
  ...mirror([-1.25, 1.95, 0.9], -1),
]

/** Boom: two straight pieces meeting in a hump, a pin at each end, and the lugs the rams hold. */
const HUMP = { z: 1.6, y: 0.62 }
const BOOM: Part[] = [
  part(roundBox(0.46, 0.46, Math.hypot(HUMP.z, HUMP.y) + 0.25, 0.12), 'enamel', [0, HUMP.y / 2, HUMP.z / 2], { rot: [-Math.atan2(HUMP.y, HUMP.z), 0, 0] }),
  part(roundBox(0.46, 0.42, Math.hypot(BOOM_LEN - HUMP.z, HUMP.y) + 0.25, 0.12), 'enamel', [0, HUMP.y / 2, (BOOM_LEN + HUMP.z) / 2], { rot: [Math.atan2(HUMP.y, BOOM_LEN - HUMP.z), 0, 0] }),
  part(sphere(0.3, 16), 'enamel', [0, HUMP.y, HUMP.z], { scale: [0.78, 1, 1] }),
  part(cylinder(0.15, 0.15, 0.62, 14), 'chrome', [0, 0, 0], { rot: [0, 0, PI2] }),
  part(cylinder(0.14, 0.14, 0.62, 14), 'chrome', [0, 0, BOOM_LEN], { rot: [0, 0, PI2] }),
  part(box(0.1, 0.3, 0.14), 'steel', [0, -0.14, 0.7]),
  part(sphere(0.07, 10), 'chrome', [0, -0.3, 0.7]),
  part(box(0.1, 0.2, 0.14), 'steel', [0, 0.76, 1.4]),
]

const STICK: Part[] = [
  part(roundBox(0.36, 0.44, 1.35, 0.12), 'enamel', [0, 0, 0.62]),
  part(roundBox(0.32, 0.32, 1.45, 0.1), 'enamel', [0, 0, 1.55], { tint: 0.95 }),
  part(cylinder(0.12, 0.12, 0.5, 14), 'chrome', [0, 0, 0], { rot: [0, 0, PI2] }),
  part(cylinder(0.11, 0.11, 0.62, 14), 'chrome', [0, 0, STICK_LEN], { rot: [0, 0, PI2] }),
  part(box(0.1, 0.16, 0.14), 'steel', [0, 0.28, 0.9]),
  part(box(0.1, 0.2, 0.14), 'steel', [0, 0.34, 1.4]),
]

/**
 * Bucket: its pivot at the origin, the cutting edge at z = BUCKET_LEN, the back toward +y and the mouth toward -y.
 * A thick curved back shell (an ellipse of half-height 0.53, half-depth 0.47 about z = BUCKET_LEN / 2), a steel liner
 * inside it, ribs over the back, a chunky side plate with a steel rail on each side, a thick lip and teeth.
 */
const SHELL_Y = 1.12
const SIDE = BUCKET_WIDTH / 2 - 0.035
const BUCKET: Part[] = [
  part(thickShell(0.47, 0.4, BUCKET_WIDTH - 0.14, Math.PI, 24), 'enamel', [0, 0, BUCKET_LEN / 2], { rot: [0, 0, PI2], scale: [SHELL_Y, 1, 1], tint: 0.92 }),
  part(shell(0.396, BUCKET_WIDTH - 0.15, Math.PI, true, 24), 'steel', [0, 0, BUCKET_LEN / 2], { rot: [0, 0, PI2], scale: [SHELL_Y, 1, 1] }),
  ...[-0.3, 0.3].map((x) => part(thickShell(0.5, 0.46, 0.08, Math.PI, 24), 'enamel', [x, 0, BUCKET_LEN / 2], { rot: [0, 0, PI2], scale: [SHELL_Y, 1, 1] })),
  ...[1, -1].flatMap((s) => [
    part(cylinder(0.5, 0.5, 0.07, 24, Math.PI), 'enamel', [s * SIDE, 0, BUCKET_LEN / 2], { rot: [0, 0, PI2], scale: [SHELL_Y, 1, 1] }),
    part(roundBox(0.1, 0.09, BUCKET_LEN, 0.03), 'steel', [s * SIDE, 0, BUCKET_LEN / 2]),
    part(box(0.06, 0.5, 0.3), 'steel', [s * 0.2, 0.28, 0.14]),
  ]),
  part(roundBox(BUCKET_WIDTH, 0.09, 0.16, 0.035), 'steel', [0, 0, BUCKET_LEN - 0.08]),
  ...[-0.5, -0.25, 0, 0.25, 0.5].map((x) => part(cylinder(0, 0.065, 0.17, 6), 'dark', [x, -0.005, BUCKET_LEN - 0.085], { rot: [PI2, 0, 0] })),
  part(cylinder(0.1, 0.1, 0.52, 14), 'chrome', [0, 0, 0], { rot: [0, 0, PI2] }),
  part(box(0.1, 0.3, 0.12), 'steel', [0, 0.46, 0.15]),
  part(sphere(0.07, 10), 'chrome', [0, 0.6, 0.15]),
]

/** A point (lz, ly) of a link whose pivot is at (pz, py) and which points at angle `a` above level, in the turret's (z, y). */
const onLink = (pz: number, py: number, a: number, lz: number, ly: number): [z: number, y: number] => [pz + lz * Math.cos(a) - ly * Math.sin(a), py + lz * Math.sin(a) + ly * Math.cos(a)]

/**
 * The excavator: the pose comes from swing, boom, stick and curl by the constants of model.ts, so
 * the bucket's cutting edge is at the sim's bucket tip. Draws in the machine's own frame.
 */
export function Digger({ m, paint, driver }: MachineProps<'digger'>) {
  const turret = useRef<Group>(null)
  const boom = useRef<Group>(null)
  const stick = useRef<Group>(null)
  const bucket = useRef<Group>(null)

  useFrame(() => {
    turret.current!.rotation.y = m.swing
    boom.current!.rotation.x = -m.boom
    stick.current!.rotation.x = -m.stick
    bucket.current!.rotation.x = -m.curl
  })

  const rams = (set: SetRam) => {
    const a1 = m.boom
    const a2 = a1 + m.stick
    const a3 = a2 + m.curl
    const [tipZ, tipY] = onLink(BOOM_ROOT_Z, BOOM_ROOT_Y, a1, BOOM_LEN, 0)
    const [endZ, endY] = onLink(tipZ, tipY, a2, STICK_LEN, 0)
    const lift = onLink(BOOM_ROOT_Z, BOOM_ROOT_Y, a1, 0.7, -0.3)
    set(0, 0, 1.28, 0, 0, lift[1], lift[0])
    const boomTop = onLink(BOOM_ROOT_Z, BOOM_ROOT_Y, a1, 1.4, 0.82)
    const stickAt = onLink(tipZ, tipY, a2, 0.9, 0.3)
    set(1, 0, boomTop[1], boomTop[0], 0, stickAt[1], stickAt[0])
    const stickTop = onLink(tipZ, tipY, a2, 1.4, 0.42)
    const bucketAt = onLink(endZ, endY, a3, 0.15, 0.6)
    set(2, 0, stickTop[1], stickTop[0], 0, bucketAt[1], bucketAt[0])
  }

  return (
    <group>
      <Static parts={UNDER} paint={paint} />
      <Treads m={m} paint={paint} spec={TREAD} />
      <Wheels m={m} paint={paint} radius={0.36} width={0.66} spots={SPROCKETS} />
      <group ref={turret}>
        <Static parts={TURRET} paint={paint} />
        <Beacon m={m} at={[0.71, 2.89, -0.1]} />
        <ExhaustPuff m={m} at={[-0.95, 2.97, -0.8]} />
        {driver && (
          <group position={SEAT.digger as unknown as [number, number, number]}>
            <Driver species={driver.species} hat={driver.hat} />
          </group>
        )}
        <Rams count={3} radius={0.075} barrel={0.7} update={rams} />
        <group ref={boom} position={[0, BOOM_ROOT_Y, BOOM_ROOT_Z]}>
          <Static parts={BOOM} paint={paint} />
          <group ref={stick} position={[0, 0, BOOM_LEN]}>
            <Static parts={STICK} paint={paint} />
            <group ref={bucket} position={[0, 0, STICK_LEN]}>
              <Static parts={BUCKET} paint={paint} />
              <group position={[0, 0.2, BUCKET_LEN / 2]} rotation={[Math.PI, 0, 0]}>
                <Mound m={m} full={SCOOP} size={[0.5, 0.4, 0.32]} at={[0, 0, 0]} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
