import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import { clamp01 } from '../../game/math'
import { BLADE_RISE, BLADE_WIDTH, BLADE_Z, SEAT } from '../../game/model'
import { Driver } from '../Driver'
import { Beacon, box, cylinder, ExhaustPuff, mirror, part, Rams, roundBox, sphere, Static, thickShell, Treads, Wheels, type MachineProps, type Part, type SetRam, type TreadSpec, type WheelSpot } from '../parts'
import { canopy, seatParts, strut } from './shared-dozer'

// The bulldozer's draw calls, 9 in all: body 2 (with glass), undercarriage 1, treads 1, sprockets 1, blade and arms 1, rams 1, beacon 1, exhaust 1. The driver adds 1.

const PI2 = Math.PI / 2
const TRACK_X = 1.15
const TREAD: TreadSpec = { x: TRACK_X, z: 0, len: 2.2, r: 0.5, cy: 0.61, width: 0.8, links: 28 }
const SPROCKETS: readonly WheelSpot[] = [1, -1].flatMap((s) => [-1.1, 1.1].map((z) => ({ x: s * TRACK_X, y: TREAD.cy, z, steer: 0 })))

/** The push arms turn about this point on each side of the tracks. */
const PIVOT_Y = 0.8
const ARM_R = Math.hypot(BLADE_Z, PIVOT_Y)
const ARM_PHI = Math.atan2(PIVOT_Y, BLADE_Z)
/** Where a ram ends on the arms (x, y, z in the arm's frame), and where it starts on the body. */
const LUG: readonly [number, number] = [0.75, 2.2]
const RAM_X = 1.2
const POST: readonly [number, number] = [1.85, 0.9]

/** The arms' angle above level when the blade is at `blade` (0 on the ground, 1 up by BLADE_RISE): the cutting edge stays on the arc through (BLADE_Z, -PIVOT_Y). */
const armAngle = (blade: number) => Math.asin((clamp01(blade) * BLADE_RISE - PIVOT_Y) / ARM_R) + ARM_PHI

/** Undercarriage: the chassis between the tracks, two track frames with rollers, the fenders and the ram posts. */
const UNDER: Part[] = [
  part(roundBox(1.44, 0.9, 3.3, 0.15), 'dark', [0, 1.05, -0.05]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.56, 0.55, 2.5, 0.12), 'dark', [s * TRACK_X, 0.61, 0]),
    ...[-0.62, -0.2, 0.2, 0.62].map((z) => part(cylinder(0.13, 0.13, 0.64, 14), 'steel', [s * TRACK_X, 0.3, z], { rot: [0, 0, PI2] })),
    part(roundBox(0.95, 0.1, 3.0, 0.045), 'enamel', [s * TRACK_X, 1.3, -0.1], { tint: 0.85 }),
    part(roundBox(0.16, 0.55, 0.18, 0.05), 'dark', [s * RAM_X, 1.62, POST[1]]),
    part(cylinder(0.09, 0.09, 0.2, 12), 'chrome', [s * (TRACK_X + 0.48), PIVOT_Y, 0], { rot: [0, 0, PI2] }),
  ]),
]

/** Body: deck, hood with grille and lamps, cab on posts with glass, seat and levers, counterweight, exhaust, ripper. */
const BODY: Part[] = [
  part(roundBox(1.9, 0.4, 2.0, 0.1), 'enamel', [0, 1.68, -0.8], { tint: 0.8 }),
  part(roundBox(1.55, 1.3, 1.75, 0.28), 'enamel', [0, 2.08, 0.97]),
  part(roundBox(1.2, 0.95, 0.06, 0.02), 'dark', [0, 2.0, 1.85]),
  ...[-0.42, -0.21, 0, 0.21, 0.42].map((x) => part(box(0.05, 0.88, 0.03), 'chrome', [x, 2.0, 1.89])),
  ...[1, -1].flatMap((s) => [
    part(cylinder(0.15, 0.15, 0.06, 16), 'chrome', [s * 0.55, 2.4, 1.87], { rot: [PI2, 0, 0] }),
    part(cylinder(0.1, 0.1, 0.06, 16), 'lamp', [s * 0.55, 2.4, 1.91], { rot: [PI2, 0, 0] }),
    ...[0, 1, 2, 3].map((k) => part(box(0.03, 0.75, 0.07), 'dark', [s * 0.785, 2.05, 0.5 + k * 0.28])),
  ]),
  part(roundBox(1.7, 0.8, 0.5, 0.18), 'enamel', [0, 1.55, -1.9], { tint: 0.78 }),
  part(roundBox(1.4, 0.3, 0.05, 0.02), 'hazard', [0, 1.45, -2.16]),
  ...[1, -1].map((s) => part(box(0.14, 0.1, 0.05), 'lamp', [s * 0.7, 1.8, -2.16], { colour: '#e0302a' })),
  // Cab: four posts and a roof on the deck, glass round it, seat, dash lever sticks.
  ...canopy({ halfW: 0.75, front: 0.05, rear: -1.55, y0: 1.88, y1: 3.28 }),
  part(roundBox(1.4, 1.25, 0.025, 0.01), 'glass', [0, 2.58, 0.05]),
  part(roundBox(1.4, 1.25, 0.025, 0.01), 'glass', [0, 2.58, -1.55]),
  ...[1, -1].map((s) => part(roundBox(0.025, 1.25, 1.45, 0.01), 'glass', [s * 0.75, 2.58, -0.75])),
  ...seatParts(SEAT.dozer),
  ...[0.32, -0.32].flatMap((x) => [part(cylinder(0.018, 0.018, 0.34, 8), 'chrome', [x, 2.35, -0.04]), part(sphere(0.045, 10), 'trim', [x, 2.54, -0.04], { colour: '#e03a3e' })]),
  part(cylinder(0.02, 0.02, 0.9, 8), 'chrome', [0.8, 2.35, 0.0]),
  ...mirror([0.76, 2.9, 0.02], 1),
  ...mirror([-0.76, 2.9, 0.02], -1),
  // Exhaust.
  part(cylinder(0.075, 0.075, 0.9, 12), 'dark', [-0.45, 3.0, 1.15]),
  part(cylinder(0.105, 0.105, 0.08, 12), 'chrome', [-0.45, 3.4, 1.15]),
  // Ripper: a beam on two arms with three claws, and its rams.
  part(roundBox(1.8, 0.3, 0.3, 0.1), 'dark', [0, 0.78, -2.45]),
  ...[1, -1].flatMap((s) => [
    strut([s * 0.62, 1.3, -1.95], [s * 0.62, 0.85, -2.4], 0.075, 'dark'),
    strut([s * 0.3, 1.8, -2.1], [s * 0.3, 0.95, -2.4], 0.065, 'dark'),
    strut([s * 0.3, 1.5, -2.25], [s * 0.3, 0.95, -2.4], 0.035, 'chrome'),
  ]),
  ...[-0.65, 0, 0.65].flatMap((x) => [
    part(cylinder(0.11, 0.05, 0.6, 10), 'dark', [x, 0.5, -2.55], { rot: [0.3, 0, 0] }),
    part(cylinder(0.05, 0.015, 0.3, 10), 'steel', [x, 0.15, -2.66], { rot: [0.3, 0, 0] }),
  ]),
]

/** The push arms, the curved blade with its dark cutting edge and the lugs the rams hold, in the arms' frame (origin at the pivot). */
const ARC = 1.3
const TILT = -0.6
const R = 1.08
const CZ = BLADE_Z + R * Math.cos(TILT)
const CY = -PIVOT_Y - R * Math.sin(TILT)
const EDGE_UP: readonly [number, number] = [Math.sin(TILT), Math.cos(TILT)]
const BLADE: Part[] = [
  part(thickShell(R + 0.05, R - 0.05, BLADE_WIDTH - 0.14, ARC, 24), 'enamel', [0, CY, CZ], { rot: [TILT, Math.PI, PI2] }),
  ...[1, -1].map((s) => part(thickShell(R + 0.06, R - 0.24, 0.12, ARC, 24), 'enamel', [s * (BLADE_WIDTH / 2 - 0.06), CY, CZ], { rot: [TILT, Math.PI, PI2], tint: 0.8 })),
  ...[-1.1, 0, 1.1].map((x) => part(thickShell(R + 0.14, R, 0.14, ARC * 0.9, 20), 'enamel', [x, CY, CZ], { rot: [TILT, Math.PI, PI2], tint: 0.85 })),
  part(roundBox(BLADE_WIDTH - 0.1, 0.24, 0.14, 0.04), 'dark', [0, -PIVOT_Y + 0.1 * EDGE_UP[1] + 0.02, BLADE_Z + 0.1 * EDGE_UP[0]], { rot: [TILT, 0, 0] }),
  part(cylinder(0.075, 0.075, BLADE_WIDTH - 0.1, 12), 'steel', [0, CY + R * Math.sin(ARC + TILT), CZ - R * Math.cos(ARC + TILT)], { rot: [0, 0, PI2] }),
  part(roundBox(2.9, 0.4, 0.3, 0.1), 'dark', [0, -0.12, 1.95]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.16, 0.4, 2.15, 0.06), 'enamel', [s * (TRACK_X + 0.5), -0.03, 1.05], { tint: 0.8 }),
    part(roundBox(0.16, 0.5, 0.18, 0.05), 'dark', [s * RAM_X, 0.5, 2.1]),
    part(sphere(0.09, 10), 'chrome', [s * RAM_X, LUG[0], LUG[1]]),
  ]),
]

/**
 * The bulldozer: the blade rides on two push arms that turn about PIVOT_Y by `blade`, so its cutting edge is on the
 * ground at 0 and BLADE_RISE higher at 1. Two rams hold it up. Draws in the machine's own frame.
 */
export function Dozer({ m, paint, driver }: MachineProps<'dozer'>) {
  const arms = useRef<Group>(null)

  useFrame(() => {
    arms.current!.rotation.x = -armAngle(m.blade)
  })

  const rams = (set: SetRam) => {
    const a = armAngle(m.blade)
    const lugZ = LUG[1] * Math.cos(a) - LUG[0] * Math.sin(a)
    const lugY = PIVOT_Y + LUG[0] * Math.cos(a) + LUG[1] * Math.sin(a)
    for (const [i, s] of [1, -1].entries()) set(i, s * RAM_X, POST[0], POST[1], s * RAM_X, lugY, lugZ)
  }

  return (
    <group>
      <Static parts={UNDER} paint={paint} />
      <Treads m={m} paint={paint} spec={TREAD} />
      <Wheels m={m} paint={paint} radius={0.44} width={0.76} spots={SPROCKETS} />
      <Static parts={BODY} paint={paint} />
      <Beacon m={m} at={[0, 3.4, -1.25]} />
      <ExhaustPuff m={m} at={[-0.45, 3.45, 1.15]} />
      {driver && (
        <group position={SEAT.dozer as unknown as [number, number, number]}>
          <Driver species={driver.species} hat={driver.hat} />
        </group>
      )}
      <Rams count={2} radius={0.08} barrel={0.8} update={rams} />
      <group ref={arms} position={[0, PIVOT_Y, 0]}>
        <Static parts={BLADE} paint={paint} />
      </group>
    </group>
  )
}
