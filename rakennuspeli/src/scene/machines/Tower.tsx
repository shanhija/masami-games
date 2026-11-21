import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'

import { COUNTER_JIB, JIB_LEN, MAST_H, SEAT } from '../../game/model'
import type { Tower as TowerState } from '../../game/model'
import type { Capsule } from '../frame'
import { Driver } from '../Driver'
import { arch, Beacon, box, cylinder, part, roundBox, sphere, Static, type MachineProps, type Part } from '../parts'
import { strut } from './shared-forklift'

// The tower crane's draw calls, 8 in all: base 1, mast 1, top with the jib 2 (with glass), trolley 1, rope 1, hook 1, beacon 1. The driver adds 1.

const PI2 = Math.PI / 2
const WHITE = '#f4f1ea'
const CONCRETE = '#b9b6ad'
const YELLOW = '#f2b705'

// The mast: four legs and bays of braces, standing from y = BASE_H to MAST_H. Its own frame starts at its foot.
const BASE_H = 0.5
const MAST_LEN = MAST_H - BASE_H
const BAYS = 12
const BAY = MAST_LEN / BAYS
const MH = 0.62
const CORNERS: readonly (readonly [number, number])[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]

/** The jib's section: two lower chords and a ridge, from the counter-jib's end to the tip. */
const CHORD_X = 0.5
const CHORD_Y = 0.65
const RIDGE_Y = 2.9
const STRIPE = 3
const APEX: readonly [number, number, number] = [0, 4.8, 0]
const HOOK_SCALE = 1.5
const HOOK_TOP = 2.3 * HOOK_SCALE
const TROLLEY_Y = CHORD_Y
const PENDULUM_Y = -0.6

/** The cab around SEAT.tower: its middle and size in the jib's frame. */
const CAB_X = 0.97
const CAB_Z = 1.45
const CAB_W = 1.35
const CAB_D = 1.4

/** Concrete base: a slab with hazard edges, four ballast blocks and the feet of the mast. */
const BASE: Part[] = [
  part(roundBox(3.6, BASE_H, 3.6, 0.1), 'plush', [0, BASE_H / 2, 0], { colour: CONCRETE }),
  ...[1, -1].flatMap((s) => [
    part(roundBox(3.62, 0.12, 0.05, 0.02), 'hazard', [0, 0.3, s * 1.8]),
    part(roundBox(0.05, 0.12, 3.62, 0.02), 'hazard', [s * 1.8, 0.3, 0]),
  ]),
  ...CORNERS.flatMap(([x, z]) => [
    part(roundBox(1.0, 0.7, 1.0, 0.07), 'plush', [x * 1.3, BASE_H + 0.35, z * 1.3], { colour: CONCRETE, tint: 0.94 }),
    part(roundBox(0.34, 0.06, 0.34, 0.03), 'steel', [x * MH, BASE_H + 0.03, z * MH]),
    part(cylinder(0.03, 0.03, 0.12, 6), 'chrome', [x * 1.3, BASE_H + 0.73, z * 1.3]),
  ]),
]

/** Mast: legs, a square of braces at the top of each bay, a zigzag brace on every face, and a ladder. */
const MAST: Part[] = [
  ...CORNERS.map(([x, z]) => part(roundBox(0.27, MAST_LEN, 0.27, 0.08), 'enamel', [x * MH, MAST_LEN / 2, z * MH])),
  ...Array.from({ length: BAYS }, (_, i) =>
    CORNERS.flatMap(([ax, az], k) => {
      const [bx, bz] = CORNERS[(k + 1) % 4]
      const y0 = i * BAY
      const y1 = y0 + BAY
      const from: [number, number, number] = [ax * MH, i % 2 ? y0 : y1, az * MH]
      const to: [number, number, number] = [bx * MH, i % 2 ? y1 : y0, bz * MH]
      return [strut([ax * MH, y1, az * MH], [bx * MH, y1, bz * MH], 0.13, 'trim', { colour: WHITE }), strut(from, to, 0.12, 'trim', { colour: WHITE })]
    }),
  ).flat(),
  ...[-1, 1].map((s) => part(roundBox(0.05, MAST_LEN - 0.4, 0.05, 0.015), 'steel', [MH + 0.17, MAST_LEN / 2, s * 0.17])),
  ...Array.from({ length: Math.floor((MAST_LEN - 0.6) / 0.36) }, (_, i) => part(box(0.04, 0.04, 0.34), 'steel', [MH + 0.17, 0.4 + i * 0.36, 0])),
]

const jibBays = COUNTER_JIB + JIB_LEN
/** The look of the jib at `bay`: paint on even stripes, yellow on odd ones, for chords and braces alike. */
const stripe = (bay: number) => {
  const odd = Math.floor(Math.min(bay, jibBays - 1) / STRIPE) % 2 === 1
  return { finish: odd ? ('trim' as const) : ('enamel' as const), o: odd ? { colour: YELLOW } : {} }
}
const JIB: Part[] = [
  // Chords in stripes of paint and yellow.
  ...Array.from({ length: Math.ceil(jibBays / STRIPE) }, (_, i) => {
    const z0 = -COUNTER_JIB + i * STRIPE
    const len = Math.min(STRIPE, JIB_LEN - z0)
    const { finish, o } = stripe(i * STRIPE)
    return [
      part(roundBox(0.24, 0.24, len, 0.07), finish, [CHORD_X, CHORD_Y, z0 + len / 2], o),
      part(roundBox(0.24, 0.24, len, 0.07), finish, [-CHORD_X, CHORD_Y, z0 + len / 2], o),
      part(roundBox(0.26, 0.26, len, 0.08), finish, [0, RIDGE_Y, z0 + len / 2], o),
    ]
  }).flat(),
  // A cross frame at every bay and a zigzag on both sides.
  ...Array.from({ length: jibBays + 1 }, (_, i) => {
    const z = -COUNTER_JIB + i
    const { finish, o } = stripe(i)
    return [
      strut([-CHORD_X, CHORD_Y, z], [CHORD_X, CHORD_Y, z], 0.13, finish, o),
      strut([-CHORD_X, CHORD_Y, z], [0, RIDGE_Y, z], 0.12, finish, o),
      strut([CHORD_X, CHORD_Y, z], [0, RIDGE_Y, z], 0.12, finish, o),
    ]
  }).flat(),
  ...Array.from({ length: jibBays }, (_, i) => {
    const z = -COUNTER_JIB + i
    const { finish, o } = stripe(i)
    return [1, -1].map((s) => (i % 2 ? strut([s * CHORD_X, CHORD_Y, z], [0, RIDGE_Y, z + 1], 0.12, finish, o) : strut([0, RIDGE_Y, z], [s * CHORD_X, CHORD_Y, z + 1], 0.12, finish, o)))
  }).flat(2),
  part(roundBox(0.7, 0.4, 0.3, 0.08), 'enamel', [0, 1.5, JIB_LEN + 0.05], { tint: 0.85 }),
  part(box(0.4, 0.14, 0.04), 'lamp', [0, 1.55, JIB_LEN + 0.22]),
]

/** The top: slewing ring, deck, winch house, counterweights, tower head with its stays, cab with glass. */
const TOP: Part[] = [
  ...JIB,
  part(cylinder(1.25, 1.25, 0.26, 28), 'steel', [0, -0.1, 0]),
  part(cylinder(1.1, 1.1, 0.06, 28), 'chrome', [0, 0.04, 0]),
  part(roundBox(2.3, 0.34, 3.2, 0.1), 'dark', [0, 0.3, 0]),
  part(roundBox(1.5, 1.0, 1.7, 0.18), 'enamel', [0, 1.05, -2.9], { tint: 0.88 }),
  ...[-0.3, 0, 0.3].map((x) => part(box(0.07, 0.5, 0.03), 'dark', [x, 1.1, -3.76])),
  ...[-7.25, -6.3, -5.35].map((z, i) => part(roundBox(1.0, 0.86, 0.9, 0.06), 'plush', [0, 1.1, z], { colour: CONCRETE, tint: i === 1 ? 0.92 : 1 })),
  part(roundBox(1.02, 0.1, 2.9, 0.03), 'hazard', [0, 1.57, -6.3]),
  part(roundBox(0.4, 0.5, 0.06, 0.02), 'lamp', [0, 0.95, -COUNTER_JIB - 0.05], { colour: '#e0302a' }),
  // Tower head: four legs meeting at the apex, with stays to the jib and the counter-jib.
  ...CORNERS.map(([x, z]) => strut([x * 0.8, 0.45, z * 0.55], APEX, 0.2, 'enamel', { tint: 0.92 })),
  part(sphere(0.26, 14), 'steel', [APEX[0], APEX[1] + 0.05, APEX[2]]),
  strut(APEX, [0, RIDGE_Y, 11.5], 0.1, 'steel'),
  strut(APEX, [0, RIDGE_Y, 22.5], 0.1, 'steel'),
  strut(APEX, [0, RIDGE_Y, -7.6], 0.12, 'steel'),
  // Cab hung under the deck at the left of the mast: skirt, pillars, roof, glass, seat and dash.
  part(roundBox(CAB_W, 0.34, CAB_D, 0.1), 'enamel', [CAB_X, -0.96, CAB_Z], { tint: 0.92 }),
  part(roundBox(CAB_W + 0.1, 0.12, CAB_D + 0.1, 0.06), 'enamel', [CAB_X, 0.42, CAB_Z]),
  ...[1, -1].flatMap((sx) => [1, -1].map((sz) => part(roundBox(0.09, 1.1, 0.09, 0.03), 'enamel', [CAB_X + (sx * CAB_W) / 2, -0.15, CAB_Z + (sz * CAB_D) / 2], { tint: 0.85 }))),
  part(roundBox(CAB_W - 0.1, 0.8, 0.04, 0.01), 'dark', [CAB_X, -0.2, CAB_Z - CAB_D / 2 + 0.02]),
  part(roundBox(CAB_W - 0.18, 1.0, 0.025, 0.01), 'glass', [CAB_X, -0.15, CAB_Z + CAB_D / 2]),
  part(roundBox(0.025, 1.0, CAB_D - 0.18, 0.01), 'glass', [CAB_X + CAB_W / 2, -0.15, CAB_Z]),
  part(roundBox(0.025, 1.0, CAB_D - 0.18, 0.01), 'glass', [CAB_X - CAB_W / 2, -0.15, CAB_Z]),
  part(roundBox(0.6, 0.12, 0.6, 0.05), 'dark', [0.9, -1.03, 1.0]),
  part(roundBox(0.54, 0.6, 0.1, 0.05), 'dark', [0.9, -0.7, 0.72]),
  part(roundBox(0.7, 0.3, 0.3, 0.06), 'dark', [0.9, -0.95, 1.72]),
  ...[0.7, 1.1].flatMap((x) => [part(cylinder(0.014, 0.014, 0.3, 8), 'chrome', [x, -0.65, 1.66]), part(sphere(0.045, 10), 'trim', [x, -0.47, 1.66], { colour: x < 0.9 ? '#e03a3e' : YELLOW })]),
  ...[0.6, 1.35].flatMap((x) => [part(box(0.2, 0.14, 0.16), 'dark', [x, 0.56, CAB_Z + CAB_D / 2 - 0.05]), part(box(0.15, 0.09, 0.03), 'lamp', [x, 0.56, CAB_Z + CAB_D / 2 + 0.04])]),
]

/** The trolley: a dark saddle over the chords, and the block the rope hangs from. */
const TROLLEY: Part[] = [
  part(roundBox(1.4, 0.26, 1.0, 0.09), 'dark', [0, 0.02, 0]),
  ...[1, -1].flatMap((s) => [0.32, -0.32].map((z) => part(cylinder(0.14, 0.14, 0.16, 12), 'dark', [s * CHORD_X, -0.12, z], { rot: [0, 0, PI2] }))),
  part(roundBox(0.62, 0.4, 0.6, 0.1), 'dark', [0, -0.3, 0]),
  part(box(0.9, 0.12, 0.04), 'hazard', [0, 0.02, 0.51]),
]

/** Two ropes of unit length hanging from y = 0 down to y = -1, stretched by the rope group. */
const ROPE: Part[] = [1, -1].map((s) => part(box(0.05, 1, 0.05), 'dark', [s * 0.1, -0.5, 0]))

/** The big red and white hook block, drawn at HOOK_SCALE: its hook's lowest point is at the origin and the rope comes in at the top. */
const HOOK: Part[] = [
  part(roundBox(0.9, 0.9, 0.55, 0.2), 'enamel', [0, 1.62, 0]),
  part(roundBox(0.93, 0.28, 0.58, 0.1), 'trim', [0, 1.62, 0], { colour: WHITE }),
  ...[1, -1].map((s) => part(roundBox(0.06, 0.5, 0.2, 0.02), 'steel', [s * 0.1, 2.12, 0])),
  part(cylinder(0.21, 0.21, 0.08, 16), 'chrome', [0, 2.15, 0], { rot: [0, 0, PI2] }),
  part(cylinder(0.14, 0.17, 0.22, 14), 'chrome', [0, 1.06, 0]),
  part(cylinder(0.1, 0.1, 0.6, 12), 'chrome', [0, 0.78, 0]),
  part(arch(0.3), 'chrome', [0.32, 0.46, 0], { rot: [0, 0, Math.PI], scale: [0.32, 0.32, 0.32] }),
  part(cylinder(0, 0.1, 0.3, 12), 'chrome', [0.64, 0.58, 0]),
  part(sphere(0.07, 10), 'trim', [0.64, 0.75, 0], { colour: '#e03a3e' }),
]

/** How far out from its middle line the mast, the jib and the cab hung under it reach, for what they hide. */
const MAST_R = 1.6
const JIB_R = 2.2
/** The middle line of the jib, above the top of the mast. */
const JIB_MID = 1.2

/** The tower crane as two thick lines, the mast and the jib with its counter-jib, where they stand now. */
export function towerShape(m: TowerState): Capsule[] {
  const top = m.y + BASE_H + MAST_LEN * m.up
  const sin = Math.sin(m.jib)
  const cos = Math.cos(m.jib)
  return [
    { a: [m.x, m.y, m.z], b: [m.x, top, m.z], r: MAST_R },
    { a: [m.x - sin * COUNTER_JIB, top + JIB_MID, m.z - cos * COUNTER_JIB], b: [m.x + sin * JIB_LEN, top + JIB_MID, m.z + cos * JIB_LEN], r: JIB_R },
  ]
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

const DOWN = new Vector3(0, -1, 0)
const reach = new Vector3()

/**
 * The tower crane: the mast grows out of the ground with `up`, then the top pops in. The top turns by
 * jib - yaw, the trolley runs out along the jib, and the rope and hook hang from the trolley to hookY,
 * swung by swayX and swayZ (world axes, turned into the jib's frame). Draws in its own frame.
 */
export function Tower({ m, paint, driver }: MachineProps<'tower'>) {
  const mast = useRef<Group>(null)
  const top = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const trolley = useRef<Group>(null)
  const pendulum = useRef<Group>(null)
  const rope = useRef<Group>(null)
  const hook = useRef<Group>(null)

  useFrame(() => {
    const standing = m.up > 0.001
    mast.current!.visible = standing
    mast.current!.scale.y = Math.max(m.up, 0.001)
    const topY = BASE_H + MAST_LEN * m.up
    const pop = smooth((m.up - 0.9) / 0.1)
    top.current!.visible = pop > 0.001
    top.current!.position.y = topY
    top.current!.scale.setScalar(Math.max(pop, 0.001))
    turn.current!.rotation.y = m.jib - m.yaw
    trolley.current!.position.z = m.trolley
    const c = Math.cos(m.jib)
    const s = Math.sin(m.jib)
    reach.set(m.swayX * c - m.swayZ * s, m.hookY - m.y - topY - (TROLLEY_Y + PENDULUM_Y), m.swayX * s + m.swayZ * c)
    const length = Math.max(reach.length(), HOOK_TOP + 0.1)
    pendulum.current!.quaternion.setFromUnitVectors(DOWN, reach.normalize())
    rope.current!.scale.y = length - HOOK_TOP
    hook.current!.position.y = -length
  })

  return (
    <group>
      <Static parts={BASE} paint={paint} />
      <group ref={mast} position={[0, BASE_H, 0]}>
        <Static parts={MAST} paint={paint} />
      </group>
      <group ref={top}>
        <group ref={turn}>
          <Static parts={TOP} paint={paint} />
          <Beacon m={m} at={[APEX[0], APEX[1] + 0.25, APEX[2]]} />
          {driver && (
            <group position={SEAT.tower as unknown as [number, number, number]}>
              <Driver species={driver.species} hat={driver.hat} />
            </group>
          )}
          <group ref={trolley} position={[0, TROLLEY_Y, m.trolley]}>
            <Static parts={TROLLEY} paint={paint} />
            <group ref={pendulum} position={[0, PENDULUM_Y, 0]}>
              <group ref={rope}>
                <Static parts={ROPE} paint={paint} />
              </group>
              <group ref={hook} scale={HOOK_SCALE}>
                <Static parts={HOOK} paint={paint} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
