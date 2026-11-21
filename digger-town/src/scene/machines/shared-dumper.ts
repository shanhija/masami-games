/**
 * What the dump truck and the cement truck share: one chassis with six fat wheels, one big cab
 * with the driver in it, the exhaust stack, the beacon, the mud flaps and the lamps. Each truck
 * builds a module-level `truckBody(FRAME)` from its own frame parts: the shared base plus the
 * frame, merged into one mesh and handed to `Static` as the truck's `body`.
 */

import { createElement as h, Fragment } from 'react'

import { SEAT, type Dumper, type Mixer } from '../../game/model'
import { Driver } from '../Driver'
import { Beacon, box, cylinder, ExhaustPuff, mirror, part, roundBox, sphere, Static, thickShell, Wheels, type MachineProps, type Part, type WheelSpot } from '../parts'

const PI2 = Math.PI / 2
const WHEEL_R = 0.6
const WHEEL_W = 0.52
const WHEEL_X = 1.0
/** The cab's roof top and the exhaust's top, for the trucks that hang things off them. */
export const ROOF_Y = 3.17
const STACK = { x: -1.36, z: 1.2, top: 3.5 }

const WHEEL_Z = { front: 2.0, rear: [-1.0, -2.2] } as const
const SPOTS: readonly WheelSpot[] = [1, -1].flatMap((s) => [
  { x: s * WHEEL_X, y: WHEEL_R, z: WHEEL_Z.front, steer: 1 },
  ...WHEEL_Z.rear.map((z) => ({ x: s * WHEEL_X, y: WHEEL_R, z, steer: 0 })),
])

/** Chassis: rails, axles, bumpers, tanks, fenders, mud flaps and tail lamps. */
const CHASSIS: Part[] = [
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.34, 0.3, 6.0, 0.08), 'dark', [s * 0.62, 0.85, -0.1]),
    // Fenders over every wheel, flaps hanging behind them, a wheel-arch lip.
    ...[WHEEL_Z.front, ...WHEEL_Z.rear].map((z) => part(thickShell(0.7, 0.66, 0.62, Math.PI, 20), 'enamel', [s * WHEEL_X, WHEEL_R, z], { rot: [0, 0, PI2], tint: 0.85 })),
    ...[1.3, -2.9].flatMap((z) => [
      part(roundBox(0.62, 0.5, 0.05, 0.02), 'rubber', [s * WHEEL_X, 0.4, z]),
      part(cylinder(0.12, 0.12, 0.02, 14), 'trim', [s * WHEEL_X, 0.4, z + Math.sign(z) * 0.03], { rot: [PI2, 0, 0], colour: '#f2f4f7' }),
      part(box(0.62, 0.06, 0.08), 'steel', [s * WHEEL_X, 0.67, z]),
    ]),
    part(box(0.24, 0.16, 0.06), 'lamp', [s * 1.0, 0.95, -3.12], { colour: '#e0302a' }),
    part(box(0.2, 0.1, 0.06), 'lamp', [s * 0.7, 0.95, -3.12], { colour: '#ffb02e' }),
  ]),
  ...[WHEEL_Z.front, ...WHEEL_Z.rear].map((z) => part(cylinder(0.13, 0.13, 2.0, 12), 'dark', [0, WHEEL_R, z], { rot: [0, 0, PI2] })),
  part(roundBox(2.5, 0.36, 0.3, 0.12), 'steel', [0, 0.98, 3.02]),
  part(box(0.2, 0.1, 0.05), 'lamp', [0.55, 0.98, 3.18]),
  part(box(0.2, 0.1, 0.05), 'lamp', [-0.55, 0.98, 3.18]),
  part(roundBox(2.3, 0.3, 0.2, 0.06), 'dark', [0, 0.85, -3.0]),
  part(roundBox(2.3, 0.18, 0.18, 0.06), 'steel', [0, 0.6, -3.1]),
  // Fuel tank with straps on the left, battery box on the right.
  part(cylinder(0.3, 0.3, 1.1, 18), 'steel', [1.0, 0.82, 0.45], { rot: [PI2, 0, 0] }),
  ...[0.1, 0.8].map((z) => part(cylinder(0.32, 0.32, 0.06, 18), 'dark', [1.0, 0.82, z], { rot: [PI2, 0, 0] })),
  part(roundBox(0.5, 0.4, 0.9, 0.06), 'dark', [-1.0, 0.85, 0.45]),
  part(box(0.1, 0.06, 0.1), 'chrome', [-1.27, 0.95, 0.2]),
  part(box(0.1, 0.06, 0.1), 'chrome', [-1.27, 0.95, 0.7]),
]

/** The cab: a skirt, a grille, round headlamps, glass on every side, seats, wheel, roof lamps, mirrors, the stack. */
const CAB: Part[] = [
  part(roundBox(2.4, 0.5, 1.85, 0.12), 'enamel', [0, 1.58, 2.03]),
  part(roundBox(2.2, 0.24, 0.3, 0.07), 'dark', [0, 1.9, 2.8]),
  part(roundBox(2.3, 0.1, 1.75, 0.04), 'dark', [0, 1.62, 2.03]),
  part(roundBox(1.4, 0.34, 0.06, 0.03), 'dark', [0, 1.58, 3.0]),
  ...[-0.5, -0.17, 0.17, 0.5].map((x) => part(box(0.07, 0.3, 0.05), 'chrome', [x, 1.58, 3.04])),
  ...[1, -1].flatMap((s) => [
    part(cylinder(0.22, 0.22, 0.05, 18), 'chrome', [s * 0.95, 1.58, 2.99], { rot: [PI2, 0, 0] }),
    part(cylinder(0.17, 0.17, 0.08, 18), 'lamp', [s * 0.95, 1.58, 3.01], { rot: [PI2, 0, 0] }),
    // Doors: two seams and a handle.
    part(box(0.02, 0.5, 0.04), 'dark', [s * 1.21, 1.58, 1.45]),
    part(box(0.02, 0.5, 0.04), 'dark', [s * 1.21, 1.58, 2.6]),
    part(roundBox(0.06, 0.06, 0.22, 0.02), 'chrome', [s * 1.23, 1.7, 1.75]),
    part(cylinder(0.03, 0.03, 0.9, 8), 'chrome', [s * 1.27, 2.35, 2.78]),
    part(roundBox(0.06, 0.05, 0.05, 0.02), 'steel', [s * 1.24, 1.9, 2.78]),
    ...[1.15, 2.85].map((z) => part(roundBox(0.1, 1.3, 0.1, 0.03), 'enamel', [s * 1.15, 2.43, z], { tint: 0.85 })),
    ...mirror([s * 1.2, 2.5, 2.8], s === 1 ? 1 : -1),
  ]),
  // Seats, a steering wheel and the shift lever.
  part(roundBox(0.6, 0.2, 0.6, 0.06), 'dark', [0.42, 1.66, 1.95]),
  part(roundBox(0.6, 0.7, 0.12, 0.05), 'dark', [0.42, 2.05, 1.62]),
  part(roundBox(0.6, 0.2, 0.6, 0.06), 'dark', [-0.42, 1.66, 1.95]),
  part(roundBox(0.6, 0.7, 0.12, 0.05), 'dark', [-0.42, 2.05, 1.62]),
  part(cylinder(0.03, 0.03, 0.5, 8), 'steel', [0.42, 2.05, 2.55], { rot: [0.9, 0, 0] }),
  part(cylinder(0.23, 0.23, 0.05, 18), 'dark', [0.42, 2.3, 2.38], { rot: [0.9, 0, 0] }),
  part(cylinder(0.06, 0.06, 0.06, 10), 'chrome', [0.42, 2.3, 2.38], { rot: [0.9, 0, 0] }),
  // Roof, glass, wipers, work lamps.
  part(roundBox(2.5, 0.14, 1.95, 0.06), 'enamel', [0, 3.1, 2.03]),
  part(roundBox(2.2, 1.18, 0.03, 0.01), 'glass', [0, 2.43, 2.93]),
  part(roundBox(2.2, 1.18, 0.03, 0.01), 'glass', [0, 2.43, 1.13]),
  ...[1, -1].map((s) => part(roundBox(0.03, 1.18, 1.7, 0.01), 'glass', [s * 1.17, 2.43, 2.03])),
  ...[-0.45, 0.45].map((x) => part(box(0.7, 0.03, 0.03), 'dark', [x, 2.22, 2.96], { rot: [0, 0, 0.12] })),
  part(roundBox(1.4, 0.14, 0.16, 0.04), 'dark', [0, 3.27, 2.85]),
  ...[-0.5, -0.17, 0.17, 0.5].map((x) => part(box(0.22, 0.09, 0.05), 'lamp', [x, 3.27, 2.95])),
  // Exhaust stack on the right behind the cab.
  part(roundBox(0.3, 0.12, 0.3, 0.03), 'dark', [STACK.x + 0.1, 1.22, STACK.z]),
  part(cylinder(0.09, 0.09, STACK.top - 1.2, 12), 'chrome', [STACK.x, (STACK.top + 1.2) / 2, STACK.z]),
  part(cylinder(0.13, 0.1, 0.14, 12), 'dark', [STACK.x, STACK.top, STACK.z]),
  part(sphere(0.12, 10), 'chrome', [STACK.x, 2.2, STACK.z], { scale: [1, 0.5, 1] }),
]

const BASE: readonly Part[] = [...CHASSIS, ...CAB]

/** The parts of one truck's chassis mesh: the shared chassis and cab, then the truck's own fixed parts. Make it once, at module level. */
export function truckBody(extra: readonly Part[]): readonly Part[] {
  return [...BASE, ...extra]
}

export interface TruckBaseProps {
  m: Dumper | Mixer
  paint: string
  driver: MachineProps<'dumper'>['driver']
  /** The truck's chassis parts from `truckBody`, a module-level list. */
  body: readonly Part[]
}

/** Chassis, cab, wheels, driver, beacon and exhaust of either truck: 5 draw calls (and the driver's 1). */
export function TruckBase({ m, paint, driver, body }: TruckBaseProps) {
  const seat = SEAT[m.kind]
  return h(
    Fragment,
    null,
    h(Static, { parts: body, paint }),
    h(Wheels, { m, paint, radius: WHEEL_R, width: WHEEL_W, spots: SPOTS }),
    h(Beacon, { m, at: [0, ROOF_Y - 0.03, 1.8] }),
    h(ExhaustPuff, { m, at: [STACK.x, STACK.top + 0.08, STACK.z] }),
    driver && h('group', { position: [seat[0], seat[1], seat[2]] }, h(Driver, { species: driver.species, hat: driver.hat })),
  )
}
