import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import { FORK_RISE, SEAT } from '../../game/model'
import { Driver } from '../Driver'
import { Beacon, box, cylinder, ExhaustPuff, mirror, part, roundBox, sphere, Static, Wheels, type MachineProps, type Part, type WheelSpot } from '../parts'
import { rod } from './shared-forklift'

// The forklift's draw calls, 8 in all: body 1, front wheels 1, rear wheels 1, inner mast 1, chain 1, carriage and forks 1, beacon 1, exhaust 1. The driver adds 1.

const PI2 = Math.PI / 2
const FRONT: readonly WheelSpot[] = [1, -1].map((s) => ({ x: s * 0.77, y: 0.56, z: 0.4, steer: 0 }))
const REAR: readonly WheelSpot[] = [1, -1].map((s) => ({ x: s * 0.68, y: 0.38, z: -1.08, steer: -1 }))

/** Mast geometry: the outer rails stand on the nose; the inner rails ride up half as far as the carriage. */
const OUTER_Z = 1.02
const INNER_Z = 1.2
const CHAIN_Z = 1.29
const CARRIAGE_Z = 1.35
const INNER_TOP = 2.4
const CARRIAGE_TOP = 0.7

/** Body: chassis, counterweight with hazard band and tail lamps, fenders, seat, steering, roll cage, mast base, tilt rams, gas bottle, exhaust, lamps and mirror. */
const BODY: Part[] = [
  part(roundBox(1.5, 0.5, 2.5, 0.16), 'enamel', [0, 0.72, -0.3]),
  part(roundBox(1.78, 1.18, 0.95, 0.3), 'enamel', [0, 0.97, -1.17], { tint: 0.88 }),
  part(roundBox(1.55, 0.2, 0.06, 0.02), 'hazard', [0, 0.62, -1.66]),
  part(roundBox(1.36, 0.08, 0.5, 0.03), 'dark', [0, 1.56, -1.15]),
  ...[1, -1].flatMap((s) => [
    part(box(0.2, 0.12, 0.06), 'lamp', [s * 0.55, 1.12, -1.66], { colour: '#e0302a' }),
    // Fender over each front wheel, with a lamp on its nose.
    part(roundBox(0.62, 0.1, 1.05, 0.05), 'enamel', [s * 0.77, 1.2, 0.4], { tint: 0.92 }),
    part(roundBox(0.1, 0.46, 1.05, 0.04), 'enamel', [s * 0.45, 0.97, 0.4], { tint: 0.92 }),
    part(roundBox(0.18, 0.18, 0.12, 0.04), 'dark', [s * 0.77, 1.17, 0.96]),
    part(box(0.12, 0.1, 0.03), 'lamp', [s * 0.77, 1.17, 1.03]),
    // Rear mudguard stubs and a step.
    part(roundBox(0.1, 0.46, 0.7, 0.04), 'enamel', [s * 0.82, 0.62, -0.78], { tint: 0.9 }),
    part(roundBox(0.03, 0.1, 1.5, 0.015), 'trim', [s * 0.76, 0.78, 0.0], { colour: '#f4f1ea' }),
  ]),
  part(roundBox(0.3, 0.06, 0.55, 0.02), 'dark', [0.9, 0.52, -0.2]),
  // Seat and the pedestal under it, and the foot plate.
  part(roundBox(0.95, 0.2, 1.0, 0.06), 'enamel', [0, 1.0, -0.3], { tint: 0.8 }),
  part(roundBox(0.82, 0.14, 0.7, 0.06), 'dark', [0, 1.11, -0.15]),
  part(roundBox(0.74, 0.72, 0.12, 0.06), 'dark', [0, 1.5, -0.5]),
  part(roundBox(0.5, 0.06, 0.5, 0.03), 'dark', [0, 1.03, 0.5]),
  // Cowl with the steering wheel and two levers.
  part(roundBox(0.62, 0.55, 0.36, 0.12), 'enamel', [0, 1.2, 0.82], { tint: 0.92 }),
  part(cylinder(0.025, 0.025, 0.55, 8), 'chrome', [0, 1.62, 0.66], { rot: [0.75, 0, 0] }),
  part(cylinder(0.2, 0.2, 0.035, 18), 'dark', [0, 1.84, 0.47], { rot: [0.75, 0, 0] }),
  part(sphere(0.05, 10), 'trim', [0, 1.84, 0.47], { colour: '#e03a3e' }),
  ...[0.3, -0.3].flatMap((x) => [part(cylinder(0.015, 0.015, 0.32, 8), 'chrome', [x, 1.35, 0.5], { rot: [-0.25, 0, 0] }), part(sphere(0.04, 10), 'trim', [x, 1.5, 0.47], { colour: '#f2b705' })]),
  // Roll cage: four posts, a frame, slats across the roof and lamps.
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.09, 1.4, 0.09, 0.03), 'enamel', [s * 0.66, 1.75, 0.6], { tint: 0.85 }),
    part(roundBox(0.09, 1.4, 0.09, 0.03), 'enamel', [s * 0.66, 1.75, -0.75], { tint: 0.85 }),
    part(roundBox(0.1, 0.09, 1.5, 0.03), 'enamel', [s * 0.66, 2.44, -0.07]),
    part(box(0.2, 0.14, 0.14), 'dark', [s * 0.5, 2.5, 0.62]),
    part(box(0.15, 0.09, 0.03), 'lamp', [s * 0.5, 2.5, 0.7]),
  ]),
  ...[-0.7, -0.45, -0.2, 0.05, 0.3, 0.55].map((z) => part(roundBox(1.3, 0.06, 0.09, 0.02), 'dark', [0, 2.45, z])),
  part(roundBox(1.4, 0.09, 0.1, 0.03), 'enamel', [0, 2.44, 0.6]),
  part(roundBox(1.4, 0.09, 0.1, 0.03), 'enamel', [0, 2.44, -0.75]),
  ...mirror([0.7, 2.2, 0.55], 1),
  // Mast: two outer rails with cross bars, and tilt rams from the chassis.
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.15, 2.55, 0.17, 0.05), 'dark', [s * 0.46, 1.32, OUTER_Z]),
    part(cylinder(0.07, 0.07, 0.28, 12), 'chrome', [s * 0.46, 0.55, OUTER_Z - 0.04], { rot: [0, 0, PI2] }),
    rod([s * 0.5, 0.95, 0.72], [s * 0.5, 1.45, OUTER_Z - 0.02], 0.06, 'chrome'),
    rod([s * 0.5, 0.95, 0.72], [s * 0.5, 1.18, 0.89], 0.085, 'dark'),
  ]),
  part(roundBox(1.0, 0.14, 0.17, 0.04), 'dark', [0, 2.5, OUTER_Z]),
  part(roundBox(1.0, 0.16, 0.17, 0.04), 'dark', [0, 0.3, OUTER_Z]),
  // Gas bottle on a bracket behind the seat, and the tail pipe.
  part(cylinder(0.17, 0.17, 0.64, 18), 'trim', [-0.5, 1.9, -1.0], { colour: '#e9ecf1' }),
  part(sphere(0.17, 14), 'trim', [-0.5, 2.22, -1.0], { colour: '#e9ecf1', scale: [1, 0.55, 1] }),
  part(cylinder(0.1, 0.1, 0.06, 12), 'steel', [-0.5, 2.31, -1.0]),
  part(sphere(0.05, 10), 'trim', [-0.5, 2.38, -1.0], { colour: '#e03a3e' }),
  part(cylinder(0.175, 0.175, 0.05, 18), 'steel', [-0.5, 1.75, -1.0]),
  part(roundBox(0.42, 0.06, 0.34, 0.02), 'dark', [-0.5, 1.6, -1.0]),
  part(cylinder(0.065, 0.065, 0.7, 12), 'dark', [0.55, 1.95, -1.38]),
  part(cylinder(0.09, 0.09, 0.07, 12), 'chrome', [0.55, 2.3, -1.38]),
]

/** Inner mast: two rails that slide up, a top bar and the chain wheels. */
const INNER: Part[] = [
  ...[1, -1].map((s) => part(roundBox(0.13, 2.4, 0.14, 0.04), 'steel', [s * 0.3, 1.3, INNER_Z])),
  part(roundBox(0.8, 0.12, 0.15, 0.04), 'steel', [0, INNER_TOP - 0.06, INNER_Z]),
  part(roundBox(0.8, 0.12, 0.15, 0.04), 'steel', [0, 0.2, INNER_Z]),
  ...[1, -1].map((s) => part(cylinder(0.1, 0.1, 0.07, 14), 'chrome', [s * 0.18, INNER_TOP, CHAIN_Z - 0.02], { rot: [0, 0, PI2] })),
]

/** One chain of unit length hanging from y = 0 up to y = 1, stretched by the chain group. */
const CHAIN: Part[] = [1, -1].map((s) => part(box(0.045, 1, 0.045), 'dark', [s * 0.18, 0.5, CHAIN_Z]))

/** Carriage: a frame across the front of the inner mast, a backrest and two forks. A fork's top is at y = 0.065, level with the sim's fork point. */
const CARRIAGE: Part[] = [
  part(roundBox(1.3, 0.14, 0.09, 0.03), 'dark', [0, 0.07, CARRIAGE_Z]),
  part(roundBox(1.3, 0.12, 0.09, 0.03), 'dark', [0, CARRIAGE_TOP - 0.06, CARRIAGE_Z]),
  ...[-0.62, -0.3, 0, 0.3, 0.62].map((x) => part(roundBox(0.07, CARRIAGE_TOP, 0.07, 0.025), 'dark', [x, CARRIAGE_TOP / 2, CARRIAGE_Z + 0.01])),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.18, 0.78, 0.08, 0.03), 'steel', [s * 0.4, 0.33, CARRIAGE_Z + 0.09]),
    part(roundBox(0.18, 0.13, 1.15, 0.045), 'steel', [s * 0.4, 0, CARRIAGE_Z + 0.09 + 0.54]),
    part(roundBox(0.16, 0.07, 0.34, 0.03), 'steel', [s * 0.4, 0.005, CARRIAGE_Z + 0.09 + 1.2], { rot: [0.05, 0, 0] }),
  ]),
]

/** The forklift: forks and carriage rise with `lift` over FORK_RISE, the inner mast half as far, the chain stretches between them, and the small rear wheels steer the other way. Draws in its own frame. */
export function Forklift({ m, paint, driver }: MachineProps<'forklift'>) {
  const inner = useRef<Group>(null)
  const chain = useRef<Group>(null)
  const carriage = useRef<Group>(null)

  useFrame(() => {
    const rise = m.lift * FORK_RISE
    inner.current!.position.y = rise / 2
    carriage.current!.position.y = rise
    chain.current!.position.y = rise + CARRIAGE_TOP
    chain.current!.scale.y = Math.max(0.05, INNER_TOP + rise / 2 - rise - CARRIAGE_TOP)
  })

  return (
    <group>
      <Static parts={BODY} paint={paint} />
      <Wheels m={m} paint={paint} radius={0.56} width={0.44} spots={FRONT} />
      <Wheels m={m} paint={paint} radius={0.38} width={0.34} spots={REAR} />
      <Beacon m={m} at={[0, 2.48, -0.2]} />
      <ExhaustPuff m={m} at={[0.55, 2.34, -1.38]} />
      {driver && (
        <group position={SEAT.forklift as unknown as [number, number, number]}>
          <Driver species={driver.species} hat={driver.hat} />
        </group>
      )}
      <group ref={inner}>
        <Static parts={INNER} paint={paint} />
      </group>
      <group ref={chain}>
        <Static parts={CHAIN} paint={paint} />
      </group>
      <group ref={carriage}>
        <Static parts={CARRIAGE} paint={paint} />
      </group>
    </group>
  )
}
