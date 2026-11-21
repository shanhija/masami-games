import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import { DRUM_R, DRUM_WIDTH, DRUM_Z, MACHINE_SPECS, SEAT } from '../../game/model'
import { TAU } from '../../game/math'
import { Driver } from '../Driver'
import { Beacon, box, cylinder, ExhaustPuff, lathe, mirror, part, roundBox, sphere, Static, Wheels, type MachineProps, type Part, type WheelSpot } from '../parts'
import { canopy, seatParts, strut } from './shared-dozer'

// The road roller's draw calls, 7 in all: body 2 (with glass), yoke 1, drum 1, tyres 1, beacon 1, exhaust 1. The driver adds 1.

const PI2 = Math.PI / 2
const TYRE_R = 0.68
const AXLE_Z = DRUM_Z - MACHINE_SPECS.roller.wheelbase
const TYRES: readonly WheelSpot[] = [1, -1].map((s) => ({ x: s * 1.0, y: TYRE_R, z: AXLE_Z, steer: 0 }))
const HALF = DRUM_WIDTH / 2
const YOKE_X = HALF + 0.08

/** Body: the deck, fenders over the tyres, the engine hood with its vents, the canopy, seat, steering wheel and exhaust. */
const BODY: Part[] = [
  part(roundBox(1.5, 0.29, 2.5, 0.1), 'enamel', [0, 1.745, -0.8], { tint: 0.8 }),
  part(roundBox(1.1, 0.5, 3.0, 0.1), 'dark', [0, 1.3, -0.4]),
  part(cylinder(0.14, 0.14, 1.6, 14), 'steel', [0, TYRE_R, AXLE_Z], { rot: [0, 0, PI2] }),
  ...[1, -1].flatMap((s) => [
    part(roundBox(1.15, 0.14, 1.9, 0.06), 'enamel', [s * 0.95, 1.7, AXLE_Z], { tint: 0.9 }),
    part(roundBox(0.07, 0.34, 1.9, 0.03), 'enamel', [s * 1.5, 1.55, AXLE_Z], { tint: 0.9 }),
    part(box(0.14, 0.1, 0.05), 'lamp', [s * 0.55, 2.05, -2.07], { colour: '#e0302a' }),
  ]),
  part(roundBox(1.4, 0.85, 1.15, 0.26), 'enamel', [0, 2.32, -1.5]),
  part(roundBox(1.1, 0.3, 0.05, 0.02), 'hazard', [0, 1.95, -2.08]),
  ...[1, -1].flatMap((s) => [0, 1, 2].map((k) => part(box(0.03, 0.5, 0.07), 'dark', [s * 0.705, 2.35, -1.2 - k * 0.3]))),
  part(cylinder(0.07, 0.07, 0.8, 12), 'dark', [0.42, 3.1, -1.6]),
  part(cylinder(0.1, 0.1, 0.08, 12), 'chrome', [0.42, 3.5, -1.6]),
  // Canopy on four posts with a windscreen and mirrors.
  ...canopy({ halfW: 0.8, front: 0.4, rear: -1.0, y0: 1.88, y1: 3.28 }),
  part(roundBox(1.5, 0.9, 0.025, 0.01), 'glass', [0, 2.7, 0.4]),
  ...mirror([0.82, 2.8, 0.38], 1),
  ...mirror([-0.82, 2.8, 0.38], -1),
  ...seatParts(SEAT.roller),
  // Dash and steering wheel.
  part(roundBox(0.7, 0.4, 0.3, 0.08), 'dark', [0, 2.0, 0.3]),
  strut([0, 2.15, 0.3], [0, 2.42, 0.2], 0.035, 'chrome'),
  part(lathe('roller-wheel', [[0.13, -0.025], [0.23, -0.025], [0.23, 0.025], [0.13, 0.025]], 18), 'dark', [0, 2.5, 0.16], { rot: [-1.0, 0, 0] }),
  part(sphere(0.06, 10), 'trim', [0, 2.5, 0.16], { colour: '#e03a3e' }),
]

/** Yoke, in a frame turned by the steer about the drum's centre: two arms, the beam, the water tank, the spray bar, scrapers and lamps. */
const SPRAY_Y = 1.5
const YOKE: Part[] = [
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.14, 1.5, 0.45, 0.06), 'enamel', [s * YOKE_X, 1.45, 0], { tint: 0.85 }),
    part(cylinder(0.24, 0.24, 0.1, 18), 'chrome', [s * (YOKE_X + 0.12), DRUM_R, 0], { rot: [0, 0, PI2] }),
    strut([s * YOKE_X, 1.8, 0.3], [s * 1.2, SPRAY_Y + 0.05, 0.72], 0.04, 'steel'),
    part(box(0.2, 0.1, 0.05), 'lamp', [s * 1.1, 2.05, 0.36]),
    part(box(0.26, 0.16, 0.08), 'dark', [s * 1.1, 2.05, 0.33]),
    part(box(0.14, 0.1, 0.05), 'lamp', [s * 1.1, 2.05, -0.36], { colour: '#e0302a' }),
  ]),
  part(roundBox(YOKE_X * 2 + 0.2, 0.3, 0.7, 0.12), 'enamel', [0, 2.05, 0]),
  part(cylinder(0.25, 0.25, 0.1, 18), 'steel', [0, 2.23, 0]),
  // Water tank lying across the beam.
  part(cylinder(0.34, 0.34, 1.7, 22), 'trim', [0, 2.55, 0], { rot: [0, 0, PI2], colour: '#4aa8ff' }),
  ...[1, -1].map((s) => part(sphere(0.34, 14), 'trim', [s * 0.85, 2.55, 0], { colour: '#4aa8ff', scale: [0.4, 1, 1] })),
  ...[-0.5, 0.5].map((x) => part(cylinder(0.355, 0.355, 0.07, 22), 'steel', [x, 2.55, 0], { rot: [0, 0, PI2] })),
  part(cylinder(0.1, 0.1, 0.1, 14), 'chrome', [0.3, 2.9, 0]),
  part(sphere(0.06, 10), 'chrome', [0.3, 2.97, 0]),
  // Spray bar with nozzles over the front of the drum.
  part(cylinder(0.04, 0.04, YOKE_X * 2, 10), 'chrome', [0, SPRAY_Y + 0.05, 0.72], { rot: [0, 0, PI2] }),
  ...[-0.9, -0.45, 0, 0.45, 0.9].map((x) => part(cylinder(0.04, 0.02, 0.12, 8), 'dark', [x, SPRAY_Y - 0.03, 0.72])),
  // Scrapers hugging the drum.
  ...[1, -1].flatMap((z) => [
    part(roundBox(HALF * 2 - 0.1, 0.12, 0.1, 0.03), 'dark', [0, 0.5, z * 0.87]),
    ...[1, -1].map((s) => strut([s * YOKE_X, 0.9, z * 0.15], [s * (HALF - 0.05), 0.5, z * 0.87], 0.035, 'steel')),
  ]),
]

/** The drum: a smooth steel cylinder with painted end caps, hazard bands and rows of studs, turning about x at its centre. */
const STUDS = Array.from({ length: 16 }, (_, i) => (i / 16) * TAU)
const DRUM: Part[] = [
  part(cylinder(DRUM_R, DRUM_R, DRUM_WIDTH, 40), 'chrome', [0, 0, 0], { rot: [0, 0, PI2] }),
  ...[1, -1].flatMap((s) => [
    part(cylinder(DRUM_R - 0.04, DRUM_R - 0.04, 0.08, 30), 'enamel', [s * (HALF + 0.03), 0, 0], { rot: [0, 0, PI2] }),
    part(cylinder(0.3, 0.3, 0.12, 18), 'chrome', [s * (HALF + 0.1), 0, 0], { rot: [0, 0, PI2] }),
    part(cylinder(DRUM_R + 0.015, DRUM_R + 0.015, 0.26, 40), 'hazard', [s * 0.78, 0, 0], { rot: [0, 0, PI2] }),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU
      return part(cylinder(0.045, 0.045, 0.06, 6), 'chrome', [s * (HALF + 0.09), Math.cos(a) * 0.55, Math.sin(a) * 0.55], { rot: [0, 0, PI2] })
    }),
    ...STUDS.map((a) => part(sphere(0.06, 6), 'chrome', [s * 0.4, Math.cos(a) * DRUM_R, Math.sin(a) * DRUM_R])),
  ]),
]

/**
 * The road roller: a huge steel drum in a yoke that turns by `steer` about the drum's own centre and spins by the
 * rolled distance, two fat tyres behind, a canopy over the driver. `shake` jitters the drum and the body.
 */
export function Roller({ m, paint, driver }: MachineProps<'roller'>) {
  const root = useRef<Group>(null)
  const yoke = useRef<Group>(null)
  const drum = useRef<Group>(null)
  const lock = MACHINE_SPECS.roller.lock

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const k = m.shake
    root.current!.position.set(0.012 * k * Math.sin(t * 53), 0.014 * k * Math.sin(t * 71 + 1), 0.01 * k * Math.sin(t * 47 + 2))
    yoke.current!.rotation.y = m.steer * lock
    yoke.current!.position.set(0.03 * k * Math.sin(t * 61 + 3), 0, DRUM_Z)
    drum.current!.rotation.x = (m.rollL + m.rollR) / 2 / DRUM_R
    drum.current!.position.y = DRUM_R + 0.03 * k * Math.max(0, Math.sin(t * 67))
  })

  return (
    <group ref={root}>
      <Static parts={BODY} paint={paint} />
      <Wheels m={m} paint={paint} radius={TYRE_R} width={0.9} spots={TYRES} />
      <Beacon m={m} at={[0, 3.4, -0.9]} />
      <ExhaustPuff m={m} at={[0.42, 3.55, -1.6]} />
      {driver && (
        <group position={SEAT.roller as unknown as [number, number, number]}>
          <Driver species={driver.species} hat={driver.hat} />
        </group>
      )}
      <group ref={yoke}>
        <Static parts={YOKE} paint={paint} />
        <group ref={drum}>
          <Static parts={DRUM} paint={paint} />
        </group>
      </group>
    </group>
  )
}
