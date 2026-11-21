import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Euler, Matrix4, Quaternion, Vector3, type Group, type InstancedMesh } from 'three'

import { HITCH_Z, SEAT, TRAILER_LEN } from '../../game/model'
import { Driver } from '../Driver'
import { Beacon, bake, box, cylinder, ExhaustPuff, part, roundBox, SOLID_TINTED, sphere, Static, Wheels, type MachineProps, type Part, type WheelSpot } from '../parts'
import { cabOver } from './shared-semi'

// The lorry's draw calls, 8 in all: cab 2 (with glass), cab wheels 1, trailer 1, trailer wheels 1, logs 1, beacon 1, exhaust 1. The driver adds 1.

const PI2 = Math.PI / 2
const R = 0.62
const REAR_AXLES = [-0.9, -2.1] as const
const CAB_WHEELS: readonly WheelSpot[] = [
  ...[1, -1].map((s) => ({ x: s * 1.0, y: R, z: 1.9, steer: 1 })),
  ...[1, -1].flatMap((s) => REAR_AXLES.map((z) => ({ x: s * 1.0, y: R, z, steer: 0 }))),
]
// The trailer's two axles sit either side of TRAILER_AXLE behind the hitch, in the trailer's own frame (origin at the hitch).
const BOGIE = [-6.0, -7.2] as const
const TRAILER_WHEELS: readonly WheelSpot[] = [1, -1].flatMap((s) => BOGIE.map((z) => ({ x: s * 1.0, y: R, z, steer: 0 })))

const DECK_Y = 1.62
const TRAILER_FRONT = TRAILER_LEN - 8.7
const TRAILER_REAR = TRAILER_FRONT - TRAILER_LEN

const CAB: Part[] = [
  ...cabOver({ halfW: 1.25, z0: 1.1, z1: 2.8, floor: 1.92, seat: SEAT.semi }),
  // Sleeper box behind the cab, with its bunk window, vents and the white stripe running the whole side.
  part(roundBox(2.5, 1.8, 1.5, 0.17), 'enamel', [0, 2.5, 0.35]),
  ...[1, -1].flatMap((s) => [
    part(box(0.04, 0.6, 0.9), 'dark', [s * 1.25, 2.75, 0.35]),
    part(roundBox(0.03, 0.5, 0.8, 0.02), 'glass', [s * 1.265, 2.75, 0.35]),
    ...[0, 1, 2].map((k) => part(box(0.03, 0.05, 0.25), 'chrome', [s * 1.26, 2.5 + 0.12 * k, -0.27])),
    part(roundBox(0.03, 0.13, 3.1, 0.01), 'trim', [s * 1.265, 2.1, 1.2], { colour: '#f4f1e8' }),
    // Chrome stack with its muffler, brackets and a dark top ring.
    part(cylinder(0.1, 0.1, 2.1, 14), 'chrome', [s * 1.12, 2.55, -0.58]),
    part(cylinder(0.2, 0.2, 0.7, 14), 'chrome', [s * 1.12, 1.9, -0.58]),
        part(cylinder(0.08, 0.08, 0.03, 12), 'dark', [s * 1.12, 3.61, -0.58]),
    ...[2.2, 3.1].map((y) => part(box(0.1, 0.08, 0.22), 'steel', [s * 1.12, y, -0.45])),
    // Fuel tank with its straps, a mud flap and the fender over the front wheel.
    part(cylinder(0.3, 0.3, 1.2, 18), 'chrome', [s * 0.85, 1.12, 0.5], { rot: [PI2, 0, 0] }),
    ...[0.05, 0.95].map((z) => part(box(0.62, 0.05, 0.05), 'steel', [s * 0.85, 1.12, z])),
    part(roundBox(0.76, 0.16, 1.7, 0.07), 'enamel', [s * 1.05, 1.38, 1.9], { tint: 0.8 }),
    part(roundBox(0.76, 0.16, 2.5, 0.07), 'enamel', [s * 1.05, 1.38, -1.5], { tint: 0.8 }),
    part(box(0.6, 0.5, 0.04), 'rubber', [s * 1.05, 0.9, -2.85]),
    part(box(0.6, 0.45, 0.04), 'rubber', [s * 1.05, 0.9, 0.5]),
    // Step under the door and a grab handle.
    part(box(0.34, 0.07, 0.7), 'dark', [s * 1.18, 1.18, 1.85]),
    part(cylinder(0.02, 0.02, 0.6, 8), 'chrome', [s * 1.32, 2.2, 1.22]),
  ]),
  // Air horns on the roof.
  ...[0.55, -0.55].flatMap((x) => [
    part(cylinder(0.11, 0.03, 0.6, 12), 'chrome', [x, 3.56, 1.7], { rot: [PI2, 0, 0] }),
    part(box(0.12, 0.1, 0.16), 'steel', [x, 3.47, 1.45]),
  ]),
  // Chassis: frame rails, axles with their bulges, springs, the cross bar, the fifth wheel.
  ...[0.5, -0.5].map((x) => part(box(0.28, 0.34, 5.9), 'dark', [x, 1.2, -0.35])),
  ...[1.9, ...REAR_AXLES].flatMap((z) => [
    part(cylinder(0.12, 0.12, 1.9, 12), 'dark', [0, R, z], { rot: [0, 0, PI2] }),
    ...(z < 0 ? [part(sphere(0.3, 10), 'steel', [0, R, z])] : []),
    ...[1, -1].map((s) => part(box(0.12, 0.1, 0.9), 'steel', [s * 0.55, 0.9, z])),
  ]),
  part(box(1.3, 0.2, 1.6), 'dark', [0, 1.3, -1.4]),
  part(cylinder(0.62, 0.62, 0.12, 24), 'steel', [0, 1.43, -1.4]),
  part(box(0.3, 0.13, 0.65), 'dark', [0, 1.44, -1.75]),
  // Air hoses to the trailer, red and blue.
  ...[0.3, -0.3].map((x, i) => part(sphere(0.07, 8), 'trim', [x, 2.0, -0.44], { colour: i === 0 ? '#e03a3e' : '#3a6fe0' })),
  part(roundBox(2.4, 0.2, 0.3, 0.08), 'chrome', [0, 1.05, -3.2]),
]

/** The trailer in its own frame: origin on the ground under the hitch, forward is +z. A flat bed with stakes, a headboard, a landing leg pair, a bogie and a tail lamp bar. */
const STAKES = [-1.0, -2.6, -4.2, -5.8, -7.4]
const TRAILER: Part[] = [
  part(roundBox(2.5, 0.14, TRAILER_LEN - 0.1, 0.05), 'enamel', [0, DECK_Y - 0.07, (TRAILER_FRONT + TRAILER_REAR) / 2], { tint: 0.6 }),
  ...[1, -1].flatMap((s) => [
    part(box(0.25, 0.3, TRAILER_LEN - 0.5), 'dark', [s * 0.6, 1.33, (TRAILER_FRONT + TRAILER_REAR) / 2]),
    part(box(0.1, 0.14, TRAILER_LEN - 0.1), 'steel', [s * 1.27, DECK_Y + 0.02, (TRAILER_FRONT + TRAILER_REAR) / 2]),
    ...STAKES.map((z) => part(box(0.1, 1.8, 0.14), 'enamel', [s * 1.27, DECK_Y + 0.9, z], { tint: 0.7 })),
    ...STAKES.map((z) => part(box(0.12, 0.05, 0.16), 'steel', [s * 1.27, DECK_Y + 1.82, z])),
    // Landing leg, fender, mud flap, tail lamp, side marker.
    part(box(0.14, 0.9, 0.14), 'dark', [s * 0.8, 0.95, -0.9]),
    part(box(0.4, 0.07, 0.4), 'steel', [s * 0.8, 0.46, -0.9]),
    part(roundBox(0.76, 0.14, 2.7, 0.06), 'enamel', [s * 1.05, 1.36, -6.6], { tint: 0.7 }),
    part(box(0.6, 0.5, 0.04), 'rubber', [s * 1.05, 0.9, -8.05]),
    part(box(0.6, 0.24, 0.1), 'lamp', [s * 0.85, 1.35, TRAILER_REAR - 0.1], { colour: '#e0302a' }),
    ...[-2.5, -5.0].map((z) => part(box(0.05, 0.08, 0.2), 'lamp', [s * 1.28, 1.5, z], { colour: '#ffa51a' })),
    part(box(0.1, 0.5, 0.1), 'steel', [s * 1.05, 0.95, TRAILER_REAR + 0.15]),
  ]),
  // Cross members, kingpin plate, headboard with bars, the rear bumper and the tail lamp bar.
  ...[-1.5, -3.5, -5.5, -7.5].map((z) => part(box(1.3, 0.2, 0.14), 'dark', [0, 1.35, z])),
  part(box(1.6, 0.06, 1.0), 'steel', [0, 1.44, 0]),
  part(roundBox(2.5, 1.9, 0.14, 0.05), 'enamel', [0, DECK_Y + 0.95, TRAILER_FRONT - 0.07], { tint: 0.7 }),
  ...[0.4, 0.95, 1.5].map((y) => part(box(2.3, 0.1, 0.06), 'steel', [0, DECK_Y + y, TRAILER_FRONT + 0.0])),
  part(box(2.3, 0.16, 0.14), 'steel', [0, 1.0, TRAILER_REAR + 0.1]),
  part(box(2.5, 0.3, 0.16), 'dark', [0, 1.35, TRAILER_REAR - 0.02]),
  ...[-0.35, 0, 0.35].map((x) => part(box(0.16, 0.08, 0.04), 'lamp', [x, 1.43, TRAILER_REAR - 0.11], { colour: '#ffa51a' })),
  ...[-0.35, 0, 0.35].map((x) => part(box(0.16, 0.08, 0.04), 'lamp', [x, 1.27, TRAILER_REAR - 0.11], { colour: '#e0302a' })),
  // Bogie: two axles with their hubs and springs.
  ...BOGIE.flatMap((z) => [part(cylinder(0.12, 0.12, 1.9, 12), 'dark', [0, R, z], { rot: [0, 0, PI2] }), ...[1, -1].map((s) => part(box(0.12, 0.1, 0.9), 'steel', [s * 0.55, 0.9, z]))]),
]

// The logs: lie across the bed in three layers, each a half log shifted from the one under it. One instanced mesh; fewer logs show as `logs` falls, the top ones going first.
const LAYERS = [13, 12, 11] as const
const LOG_R = 0.27
const LOG_COUNT = LAYERS.reduce((a, b) => a + b, 0)
const LOG = bake(
  [
    part(cylinder(LOG_R, LOG_R, 2.3, 8), 'plush', [0, 0, 0], { rot: [0, 0, PI2], colour: '#6e4b2e' }),
    ...[1, -1].flatMap((s) => [
      part(cylinder(LOG_R - 0.02, LOG_R - 0.02, 0.05, 8), 'plush', [s * 1.16, 0, 0], { rot: [0, 0, PI2], colour: '#d8b07a' }),
      part(box(0.03, 0.2, 0.2), 'plush', [s * 1.19, 0, 0], { colour: '#a97b46' }),
    ]),
  ],
  '#ffffff',
).solid

/** A steady pseudo-random 0 to 1 from an index, so each log is a little different and the same every time. */
const noise = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const matrix = new Matrix4()
const tint = new Color()

function Logs({ logs }: { logs: () => number }) {
  const ref = useRef<InstancedMesh>(null)
  useEffect(() => {
    const mesh = ref.current!
    let n = 0
    LAYERS.forEach((count, k) => {
      for (let i = 0; i < count; i++) {
        const r = 0.93 + noise(n, 0) * 0.1
        matrix.compose(
          new Vector3((noise(n, 1) - 0.5) * 0.1, DECK_Y + LOG_R + k * 0.468, TRAILER_FRONT - 0.3 - 0.27 * k - 0.54 * i),
          new Quaternion().setFromEuler(new Euler(0, (noise(n, 2) - 0.5) * 0.06, 0)),
          new Vector3(0.94 + noise(n, 3) * 0.08, r, r),
        )
        mesh.setMatrixAt(n, matrix)
        mesh.setColorAt(n, tint.setScalar(0.82 + noise(n, 4) * 0.3))
        n++
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
  }, [])
  useFrame(() => {
    ref.current!.count = Math.ceil(logs() * LOG_COUNT - 1e-6)
  })
  return <instancedMesh ref={ref} args={[LOG, SOLID_TINTED, LOG_COUNT]} frustumCulled={false} castShadow receiveShadow />
}

/**
 * The lorry: a cab-over cab with a sleeper, stacks and horns, and a flat trailer behind it on the fifth wheel. The trailer turns about the hitch
 * by trailerYaw - yaw and follows trailerY, trailerPitch and trailerRoll; its logs follow `logs`. Draws in the cab's own frame.
 */
export function Semi({ m, paint, driver }: MachineProps<'semi'>) {
  const trailer = useRef<Group>(null)
  useFrame(() => {
    const t = trailer.current!
    t.position.y = m.trailerY - m.y
    t.rotation.set(-(m.trailerPitch - m.pitch), m.trailerYaw - m.yaw, m.trailerRoll - m.roll, 'YXZ')
  })
  return (
    <group>
      <Static parts={CAB} paint={paint} />
      <Wheels m={m} paint={paint} radius={R} width={0.55} spots={CAB_WHEELS} />
      <Beacon m={m} at={[0, 3.45, 1.95]} />
      <ExhaustPuff m={m} at={[1.12, 3.66, -0.58]} />
      {driver && (
        <group position={SEAT.semi as unknown as [number, number, number]}>
          <Driver species={driver.species} hat={driver.hat} />
        </group>
      )}
      <group ref={trailer} position={[0, 0, HITCH_Z]}>
        <Static parts={TRAILER} paint={paint} />
        <Wheels m={m} paint={paint} radius={R} width={0.55} spots={TRAILER_WHEELS} />
        <Logs logs={() => m.logs} />
      </group>
    </group>
  )
}
