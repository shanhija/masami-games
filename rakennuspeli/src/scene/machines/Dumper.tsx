import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import { BED_DEPTH, BED_HINGE_Y, BED_HINGE_Z, BED_LEN, BED_MAX, BED_WIDTH, DUMPER_CAP } from '../../game/model'
import { clamp01 } from '../../game/math'
import { box, cylinder, Mound, part, Rams, roundBox, Static, type MachineProps, type Part, type SetRam } from '../parts'
import { TruckBase, truckBody } from './shared-dumper'

// The dump truck's draw calls, 9 in all: chassis and cab 2, wheels 1, beacon 1, exhaust 1, bed 1, tailgate 1, ram 1, load 1. The driver adds 1.

const PI2 = Math.PI / 2
const FLOOR = 0.16
const WALL_TOP = FLOOR + BED_DEPTH
/** The ram's foot on the chassis, and its hold under the bed (in the bed's frame: y, z from the hinge). */
const RAM_FOOT = { y: 0.75, z: 0.1 }
const RAM_HOLD = { y: -0.15, z: 2.8 }

/** The fixed parts under the bed: hinge brackets, the pin, the ram's cross member and the pads the bed rests on. */
const FRAME: Part[] = [
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.26, 0.5, 0.4, 0.06), 'dark', [s * 0.85, 1.05, BED_HINGE_Z - 0.05]),
    part(roundBox(0.3, 0.2, 0.3, 0.05), 'dark', [s * 0.62, 1.12, -1.6]),
    part(roundBox(0.3, 0.2, 0.3, 0.05), 'dark', [s * 0.62, 1.12, 0.2]),
  ]),
  part(cylinder(0.08, 0.08, 2.3, 12), 'chrome', [0, BED_HINGE_Y, BED_HINGE_Z], { rot: [0, 0, PI2] }),
  part(roundBox(1.4, 0.2, 0.3, 0.05), 'dark', [0, RAM_FOOT.y - 0.05, RAM_FOOT.z]),
]

/** The chassis mesh's parts: the shared truck body and the frame. */
const BODY = truckBody(FRAME)

/** The bed in its own frame: the hinge at the origin, the tail at z = 0, the front at z = BED_LEN, y up from the floor's underside. */
const BED: Part[] = [
  part(roundBox(BED_WIDTH, FLOOR, BED_LEN, 0.05), 'enamel', [0, FLOOR / 2, BED_LEN / 2], { tint: 0.9 }),
  part(roundBox(BED_WIDTH - 0.3, 0.02, BED_LEN - 0.2, 0.01), 'steel', [0, FLOOR + 0.01, BED_LEN / 2 - 0.05]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.12, WALL_TOP, BED_LEN, 0.04), 'enamel', [s * (BED_WIDTH / 2 - 0.06), WALL_TOP / 2, BED_LEN / 2]),
    part(roundBox(0.22, 0.12, BED_LEN + 0.1, 0.05), 'enamel', [s * (BED_WIDTH / 2 - 0.08), WALL_TOP + 0.02, BED_LEN / 2], { tint: 0.72 }),
    part(roundBox(0.2, 0.16, 3.4, 0.04), 'dark', [s * 0.62, -0.08, BED_LEN / 2 - 0.1]),
    ...[0.5, 1.4, 2.3, 3.2].map((z) => part(box(0.07, WALL_TOP - 0.15, 0.12), 'enamel', [s * (BED_WIDTH / 2 + 0.02), 0.55, z], { tint: 0.8 })),
    part(cylinder(0.1, 0.1, 0.3, 12), 'chrome', [s * 0.8, 0.02, 0], { rot: [0, 0, PI2] }),
  ]),
  // The tall front wall with its hazard band, and a hold for the ram.
  part(roundBox(BED_WIDTH, 1.5, 0.22, 0.08), 'enamel', [0, 0.75, BED_LEN - 0.11]),
  part(roundBox(BED_WIDTH - 0.3, 0.14, 0.24, 0.03), 'hazard', [0, 1.38, BED_LEN - 0.11]),
  part(roundBox(0.4, 0.2, 0.3, 0.05), 'dark', [0, RAM_HOLD.y - 0.05, RAM_HOLD.z]),
  // The ladder on the left wall.
  ...[2.7, 3.1].map((z) => part(cylinder(0.03, 0.03, 1.7, 8), 'chrome', [BED_WIDTH / 2 + 0.17, 0.2, z])),
  ...[2.7, 3.1].flatMap((z) => [-0.5, 0.7].map((y) => part(box(0.2, 0.05, 0.05), 'steel', [BED_WIDTH / 2 + 0.08, y, z]))),
  ...[-0.45, -0.15, 0.15, 0.45, 0.75].map((y) => part(cylinder(0.025, 0.025, 0.4, 8), 'chrome', [BED_WIDTH / 2 + 0.17, y, 2.9], { rot: [PI2, 0, 0] })),
]

/** The tailgate hangs from its top edge: the origin is the hinge, the gate reaches down. */
const GATE: Part[] = [
  part(roundBox(BED_WIDTH - 0.2, WALL_TOP - 0.1, 0.1, 0.04), 'enamel', [0, -(WALL_TOP - 0.1) / 2, -0.04], { tint: 0.9 }),
  part(roundBox(BED_WIDTH - 0.4, 0.17, 0.12, 0.03), 'hazard', [0, -(WALL_TOP - 0.28), -0.05]),
  ...[-0.5, 0, 0.5].map((x) => part(box(0.06, 0.4, 0.05), 'enamel', [x, -0.4, -0.1], { tint: 0.72 })),
  ...[1, -1].flatMap((s) => [part(cylinder(0.07, 0.07, 0.2, 10), 'chrome', [s * 0.85, 0, 0], { rot: [0, 0, PI2] }), part(cylinder(0.05, 0.05, 0.14, 8), 'chrome', [s * 0.85, -(WALL_TOP - 0.1), -0.08], { rot: [PI2, 0, 0] })]),
]

/** The dump truck. The bed tips about its hinge by `bed`, the ram follows, the tailgate swings open and the load slides to the tail. */
export function Dumper({ m, paint, driver }: MachineProps<'dumper'>) {
  const bed = useRef<Group>(null)
  const gate = useRef<Group>(null)
  const load = useRef<Group>(null)

  useFrame(() => {
    bed.current!.rotation.x = -m.bed * BED_MAX
    gate.current!.rotation.x = clamp01((m.bed - 0.08) * 3.5) * 1.15
    load.current!.position.z = 2.0 - m.bed * 1.05
  })

  const ram = (set: SetRam) => {
    const a = m.bed * BED_MAX
    const hy = BED_HINGE_Y + RAM_HOLD.y * Math.cos(a) + RAM_HOLD.z * Math.sin(a)
    const hz = BED_HINGE_Z - RAM_HOLD.y * Math.sin(a) + RAM_HOLD.z * Math.cos(a)
    set(0, 0, RAM_FOOT.y, RAM_FOOT.z, 0, hy, hz)
  }

  return (
    <group>
      <TruckBase m={m} paint={paint} driver={driver} body={BODY} />
      <Rams count={1} radius={0.11} barrel={0.3} update={ram} />
      <group ref={bed} position={[0, BED_HINGE_Y, BED_HINGE_Z]}>
        <Static parts={BED} paint={paint} />
        <group ref={gate} position={[0, WALL_TOP, 0]}>
          <Static parts={GATE} paint={paint} />
        </group>
        <group ref={load} position={[0, FLOOR + 0.02, 2.0]}>
          <Mound m={m} full={DUMPER_CAP} size={[BED_WIDTH / 2 - 0.15, 1.05, 1.5]} at={[0, 0, 0]} />
        </group>
      </group>
    </group>
  )
}
