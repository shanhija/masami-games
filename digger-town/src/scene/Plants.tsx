/**
 * The four places where materials change. Each one shows its job plainly: stuff goes in at one
 * side (a hopper with a heap, a log deck) and something new comes out of the other (bricks on a
 * belt, gravel over a conveyor, planks off the saw). Frame of each plant: +z is where its product
 * comes out, y up. The group sits at the plant's x, z and turns by its yaw.
 */

import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, InstancedMesh } from 'three'

import { PLANTS, WATER_COLUMN, WATER_RING } from '../game/map'
import { mod, TAU } from '../game/math'
import type { Load, LooseKind, Plant, PlantId, Sim } from '../game/model'
import type { View } from './Camera'
import { useFade } from './fade'
import type { Capsule } from './frame'
import { LOAD_COLOUR } from './look'
import { box, cylinder, Mound, roundBox, part, SOLID, sphere, Static, type Part, type V3 } from './parts'
import { chunk, put, rod, slab, solidGeo } from './Things'

// ---------------------------------------------------------------------------------------
// Shared: how hard a plant is working, and the puffs and riders every plant uses.

interface Run {
  /** 0 to 1, eased toward 1 while the plant works. */
  run: number
  /** Seconds of work so far: motion reads this so it stops smoothly. */
  spin: number
}

function useRun(plant: Plant): Run {
  const r = useRef<Run>({ run: 0, spin: 0 })
  useFrame((_, dt) => {
    const v = r.current
    v.run += ((plant.phase === 'work' ? 1 : 0) - v.run) * Math.min(1, dt * 6)
    v.spin += dt * v.run
  })
  return r.current
}

/** Soft puffs rising from `at` while the plant runs: `drift` is where they go in a rise. One instanced mesh. */
function Puffs({ at, run, colour, drift, size, count = 8, speed = 0.7 }: { at: V3; run: Run; colour: string; drift: V3; size: number; count?: number; speed?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useFrame(() => {
    for (let i = 0; i < count; i++) {
      const u = mod(run.spin * speed + i / count, 1)
      const s = Math.max(0.001, (0.3 + 0.9 * u) * Math.sqrt(1 - u) * size * run.run)
      put(ref.current!, i, at[0] + drift[0] * u + Math.sin(i * 2.3) * 0.1 * u, at[1] + drift[1] * u, at[2] + drift[2] * u, 0, s)
    }
    ref.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[solidGeo(`puff${colour}`, [part(sphere(1, 8), 'plush', [0, 0, 0], { colour })]), SOLID, count]} frustumCulled={false} />
}

/** A hopper's heap: grows with what the plant has stored toward one batch, in the colour of `kind`. */
function Heap({ plant, kind, at, size }: { plant: Plant; kind: LooseKind; at: V3; size: V3 }) {
  const load = useRef<{ load: Load }>({
    load: {
      get amount() {
        return plant.stored
      },
      kind,
    },
  })
  return <Mound m={load.current} full={PLANTS[plant.id].need} size={size} at={at} />
}

const PLANT_GROUND = '#9aa0a8'

// ---------------------------------------------------------------------------------------
// The brick press.

const BELT = '#33363d'
const PRESS_BODY: Part[] = [
  chunk(6, 0.3, 5, 0.06, [0, 0.15, 0], PLANT_GROUND),
  part(roundBox(3, 1.5, 2.6, 0.12), 'enamel', [-1.2, 1.05, 0]),
  ...[-2.5, 0.1].flatMap((x) => [-1, 1].map((s) => part(roundBox(0.3, 2.0, 0.3, 0.05), 'enamel', [x, 2.8, s * 1.05], { tint: 0.85 }))),
  part(roundBox(3, 0.4, 2.6, 0.1), 'enamel', [-1.2, 4.0, 0], { tint: 0.85 }),
  slab(1.8, 0.12, 1.6, [-1.2, 1.86, 0], '#3b3f47', 'dark'),
  // The hopper on legs, a rim, and the chute down to the die.
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([-3.2 + sx * 1.05, 0.2, sz * 1.05], [-3.2 + sx * 0.8, 2.5, sz * 0.8], 0.11, '#3b3f47', 'dark'))),
  part(cylinder(1.75, 0.45, 0.9, 4), 'enamel', [-3.2, 2.95, 0], { rot: [0, Math.PI / 4, 0], tint: 0.9 }),
  ...[-1, 1].flatMap((s) => [slab(2.5, 0.12, 0.12, [-3.2, 3.42, s * 1.2], '#f2b01e'), slab(0.12, 0.12, 2.5, [-3.2 + s * 1.2, 3.42, 0], '#f2b01e')]),
  slab(2.6, 0.04, 2.6, [-3.2, 3.0, 0], '#2a2d33', 'dark'),
  slab(1.25, 0.1, 1.0, [-2.45, 2.28, 0], '#6b7079', 'steel', [0, 0, -Math.atan(0.55 / 1.1)]),
  // The brick chimney with bands and a cap.
  part(cylinder(0.32, 0.4, 4.6, 14), 'trim', [1.0, 2.6, -1.4], { colour: '#a8402f' }),
  ...[1.3, 2.5, 3.7].map((y) => part(cylinder(0.43, 0.43, 0.14, 14), 'trim', [1.0, y, -1.4], { colour: '#f4f1ea' })),
  part(cylinder(0.46, 0.4, 0.2, 14), 'dark', [1.0, 4.95, -1.4]),
  // The conveyor out of the front, and the pad the pallets stand on.
  slab(1.5, 0.12, 4.2, [-1.2, 0.85, 3.4], BELT, 'dark'),
  ...[-1, 1].map((s) => slab(0.1, 0.22, 4.2, [-1.2 + s * 0.8, 0.92, 3.4], '#f2b01e')),
  ...[0.4, 1.4].flatMap((z) => [-1, 1].map((s) => rod([-1.2 + s * 0.7, 0.3, 2.2 + z * 1.6], [-1.2 + s * 0.7, 0.8, 2.2 + z * 1.6], 0.06, '#3b3f47', 'dark'))),
  part(cylinder(0.14, 0.14, 1.5, 12), 'steel', [-1.2, 0.85, 5.45], { rot: [0, 0, Math.PI / 2] }),
  slab(7, 0.06, 2.2, [-2, 0.03, 6.6], '#aeb2b8'),
]
const PRESS_HEAD: Part[] = [
  part(roundBox(1.7, 0.5, 1.5, 0.08), 'dark', [0, 0, 0]),
  part(cylinder(0.13, 0.13, 1.9, 12), 'chrome', [0, 1.1, 0]),
  part(box(1.5, 0.12, 1.3), 'hazard', [0, -0.3, 0]),
]
const BRICK_RED = '#c9442f'

function Press({ sim }: { sim: Sim }) {
  const p = sim.plants.press
  const run = useRun(p)
  const head = useRef<Group>(null)
  const bricks = useRef<InstancedMesh>(null)
  const ribs = useRef<InstancedMesh>(null)
  const grains = useRef<InstancedMesh>(null)
  useFrame(() => {
    // The head comes down hard and goes up slow.
    const d = Math.pow(0.5 - 0.5 * Math.cos(run.spin * 6), 3)
    head.current!.position.y = 2.75 - run.run * 0.78 * d - (1 - run.run) * 0
    for (let i = 0; i < 5; i++) {
      const u = mod(run.spin * 0.22 + i / 5, 1)
      put(bricks.current!, i, -1.2, 1.0, 1.0 + u * 4.0, 0, Math.min(1, u * 12) * (run.run > 0.02 ? 1 : 0.001))
    }
    for (let i = 0; i < 14; i++) put(ribs.current!, i, -1.2, 0.92, 1.3 + mod(i * 0.3 + run.spin * 0.9, 4.2), 0)
    for (let i = 0; i < 7; i++) {
      const u = mod(run.spin * 1.4 + i / 7, 1)
      put(grains.current!, i, -3.0 + 1.15 * u, 2.6 - 0.62 * u, Math.sin(i * 5) * 0.3, i, 0.001 + 0.18 * run.run)
    }
    for (const m of [bricks, ribs, grains]) m.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <Static parts={PRESS_BODY} paint="#e8573a" cast={false} />
      <group ref={head} position={[-1.2, 2.75, 0]}>
        <Static parts={PRESS_HEAD} paint="#e8573a" cast={false} />
      </group>
      <instancedMesh ref={bricks} args={[solidGeo('pressBrick', [part(box(0.5, 0.24, 0.3), 'trim', [0, 0.12, 0], { colour: BRICK_RED })]), SOLID, 5]} frustumCulled={false} />
      <instancedMesh ref={ribs} args={[solidGeo('pressRib', [slab(1.3, 0.03, 0.08, [0, 0, 0], '#555a64', 'dark')]), SOLID, 14]} frustumCulled={false} />
      <instancedMesh ref={grains} args={[solidGeo('pressGrain', [part(box(1, 1, 1), 'plush', [0, 0, 0], { colour: LOAD_COLOUR.sand })]), SOLID, 7]} frustumCulled={false} />
      <Heap plant={p} kind="sand" at={[-3.2, 3.0, 0]} size={[1.3, 0.65, 1.3]} />
      <Puffs at={[1.0, 5.1, -1.4]} run={run} colour="#eceef2" drift={[0.4, 2.4, -0.2]} size={0.45} />
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The rock crusher.

const BELT_FROM: V3 = [0, 0.75, 2.2]
const BELT_TO: V3 = [0, 3.6, 7]
const BELT_LEN = Math.hypot(BELT_TO[1] - BELT_FROM[1], BELT_TO[2] - BELT_FROM[2])
const BELT_TILT = Math.atan2(BELT_TO[1] - BELT_FROM[1], BELT_TO[2] - BELT_FROM[2])
/** A point along the belt: s from 0 to 1, lifted `lift` off its surface. */
const onBelt = (s: number, lift: number): [y: number, z: number] => [BELT_FROM[1] + (BELT_TO[1] - BELT_FROM[1]) * s + Math.cos(BELT_TILT) * lift, BELT_FROM[2] + (BELT_TO[2] - BELT_FROM[2]) * s - Math.sin(BELT_TILT) * lift]

const CRUSHER_BODY: Part[] = [
  chunk(5.4, 0.3, 4.6, 0.06, [0, 0.15, 0], PLANT_GROUND),
  part(roundBox(4.2, 0.4, 3.6, 0.08), 'enamel', [0, 0.5, 0], { tint: 0.85 }),
  part(roundBox(0.3, 2.2, 3.6, 0.06), 'enamel', [2.0, 1.4, 0]),
  ...[-1, 1].map((s) => part(roundBox(4.2, 2.2, 0.3, 0.06), 'enamel', [0, 1.4, s * 1.65])),
  part(roundBox(4.2, 0.2, 3.6, 0.06), 'enamel', [0, 2.4, 0], { tint: 0.85 }),
  slab(0.3, 0.3, 3.9, [-2.05, 2.4, 0], '#f2b01e'),
  slab(2.6, 0.04, 2.6, [0, 3.05, -1.5], '#2a2d33', 'dark'),
  ...[-1, 1].map((s) => part(box(0.3, 2.2, 0.3), 'hazard', [-2.05, 1.4, s * 1.75])),
  // The hopper, on the back of the roof.
  part(cylinder(2.0, 0.8, 1.1, 4), 'enamel', [0, 3.0, -1.5], { rot: [0, Math.PI / 4, 0], tint: 0.9 }),
  ...[-1, 1].flatMap((s) => [slab(2.8, 0.12, 0.12, [0, 3.58, -1.5 + s * 1.4], '#f2b01e'), slab(0.12, 0.12, 2.8, [s * 1.4, 3.58, -1.5], '#f2b01e')]),
  // The conveyor: a belt rising over to the gravel heap, with legs.
  slab(1.3, 0.14, BELT_LEN, [0, (BELT_FROM[1] + BELT_TO[1]) / 2 - 0.1, (BELT_FROM[2] + BELT_TO[2]) / 2], BELT, 'dark', [-BELT_TILT, 0, 0]),
  ...[-1, 1].map((s) => slab(0.1, 0.24, BELT_LEN, [s * 0.7, (BELT_FROM[1] + BELT_TO[1]) / 2 + 0.02, (BELT_FROM[2] + BELT_TO[2]) / 2], '#f2b01e', 'trim', [-BELT_TILT, 0, 0])),
  ...[3.2, 4.6, 6.0].flatMap((z) => {
    const y = BELT_FROM[1] + ((z - BELT_FROM[2]) / (BELT_TO[2] - BELT_FROM[2])) * (BELT_TO[1] - BELT_FROM[1]) - 0.2
    return [-1, 1].map((s) => rod([s * 0.6, 0.2, z], [s * 0.6, y, z], 0.07, '#3b3f47', 'dark'))
  }),
  part(cylinder(0.2, 0.2, 1.4, 12), 'steel', [0, BELT_TO[1] + 0.02, BELT_TO[2] + 0.02], { rot: [0, 0, Math.PI / 2] }),
  slab(1.3, 0.1, 1.5, [0, 1.0, 2.0], '#6b7079', 'steel', [0.5, 0, 0]),
]
/** A roller seen end-on from the open front: its axis runs along x, toothed all round. */
const ROLLER: Part[] = [
  part(cylinder(0.5, 0.5, 3.4, 20), 'steel', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * TAU
    return part(box(3.4, 0.17, 0.17), 'trim', [0, Math.sin(a) * 0.56, Math.cos(a) * 0.56], { colour: '#f2b01e', rot: [-a, 0, 0] })
  }),
  part(cylinder(0.2, 0.2, 3.8, 10), 'dark', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
]
/** The moving jaw: a ribbed plate hanging from its pivot at the origin. */
const JAW: Part[] = [part(box(0.25, 1.5, 3.0), 'dark', [0, -0.75, 0]), ...[-1.3, -0.9, -0.5, -0.1].map((y) => part(box(0.12, 0.14, 3.0), 'steel', [-0.17, y, 0]))]

function Crusher({ sim }: { sim: Sim }) {
  const p = sim.plants.crusher
  const run = useRun(p)
  const body = useRef<Group>(null)
  const rollers = useRef<(Group | null)[]>([])
  const jaw = useRef<Group>(null)
  const chunks = useRef<InstancedMesh>(null)
  const ribs = useRef<InstancedMesh>(null)
  useFrame(() => {
    body.current!.position.y = Math.sin(run.spin * 45) * 0.018 * run.run
    rollers.current[0]!.rotation.x = run.spin * 4
    rollers.current[1]!.rotation.x = -run.spin * 4
    jaw.current!.rotation.z = -0.12 + Math.sin(run.spin * 12) * 0.07 * run.run
    for (let i = 0; i < 10; i++) {
      const s = mod(run.spin * 0.16 + i / 10, 1) * 1.3
      let y: number
      let z: number
      let k = 0.2 + 0.07 * Math.sin(i * 4.1)
      if (s <= 1) [y, z] = onBelt(s, 0.17)
      else {
        const fall = (s - 1) * 2.2
        ;[y, z] = onBelt(1, 0.17)
        y -= 4.9 * fall * fall
        z += 0.5 * fall
        if (y < 0.9) k = 0.001
      }
      put(chunks.current!, i, (i % 3 - 1) * 0.22, y, z, i, k, k * 0.8, k, i, 0)
    }
    for (let i = 0; i < 18; i++) {
      const [y, z] = onBelt(mod(i / 18 + run.spin * 0.16, 1), 0.08)
      put(ribs.current!, i, 0, y, z, 0, 1, 1, 1, -BELT_TILT)
    }
    for (const m of [chunks, ribs]) m.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <group ref={body}>
        <Static parts={CRUSHER_BODY} paint="#3d8bd9" cast={false} />
        {[-0.8, 0.8].map((z, k) => (
          <group key={z} ref={(g) => void (rollers.current[k] = g)} position={[0, 1.4, z]}>
            <Static parts={ROLLER} paint="#ffffff" cast={false} />
          </group>
        ))}
        <group ref={jaw} position={[1.5, 2.3, 0]}>
          <Static parts={JAW} paint="#ffffff" cast={false} />
        </group>
        <Heap plant={p} kind="rock" at={[0, 3.05, -1.5]} size={[1.5, 0.7, 1.5]} />
      </group>
      <instancedMesh ref={chunks} args={[solidGeo('crushChunk', [part(box(1, 1, 1), 'plush', [0, 0, 0], { colour: LOAD_COLOUR.gravel })]), SOLID, 10]} frustumCulled={false} />
      <instancedMesh ref={ribs} args={[solidGeo('crushRib', [slab(1.15, 0.03, 0.08, [0, 0, 0], '#555a64', 'dark')]), SOLID, 18]} frustumCulled={false} />
      <Puffs at={[-2.3, 2.5, 0]} run={run} colour="#c9c2b4" drift={[-1.2, 1.2, 0]} size={0.4} speed={1.1} />
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The sawmill.

const SAW_BODY: Part[] = [
  chunk(7, 0.25, 5, 0.05, [0, 0.125, 0], PLANT_GROUND),
  part(roundBox(1.8, 0.9, 5.6, 0.08), 'enamel', [0, 0.7, 0]),
  slab(0.14, 0.03, 1.8, [0, 1.17, 0.4], '#1d1d22', 'dark'),
  slab(1.5, 0.1, 3.6, [0, 1.09, 4.6], '#8f949c', 'steel'),
  ...[-1, 1].flatMap((s) => [3.5, 5.8].map((z) => rod([s * 0.65, 0.2, z], [s * 0.65, 1.05, z], 0.07, '#3b3f47', 'dark'))),
  slab(6, 0.05, 2.2, [-1.4, 0.03, 6.8], '#aeb2b8'),
  // The blade's hood and post.
  part(roundBox(0.5, 0.3, 2.1, 0.1), 'enamel', [0, 3.35, 0.4], { tint: 0.8 }),
  rod([0, 1.1, -0.7], [0, 3.3, -0.7], 0.12, '#3b3f47', 'dark'),
  // A lean-to roof over the log deck, on posts behind the bench.
  ...[-2.7, -0.9].map((z) => rod([-3.0, 0.2, z], [-3.0, 3.0, z], 0.11, '#8a5a36', 'plush')),
  ...[-2.7, -0.9].map((z) => rod([0.5, 0.2, z], [0.5, 3.3, z], 0.11, '#8a5a36', 'plush')),
  part(roundBox(3.9, 0.2, 2.4, 0.05), 'enamel', [-1.25, 3.2, -1.8], { rot: [0, 0, -0.07], tint: 0.9 }),
  slab(3.9, 0.1, 0.12, [-1.25, 3.0, -0.6], '#d9443a', 'trim', [0, 0, -0.07]),
]
const BLADE: Part[] = [
  part(cylinder(1.15, 1.15, 0.06, 36), 'steel', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
  ...Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * TAU
    return part(box(0.07, 0.16, 0.1), 'trim', [0, Math.cos(a) * 1.17, Math.sin(a) * 1.17], { colour: '#d6dbe2', rot: [a, 0, 0] })
  }),
  ...Array.from({ length: 4 }, (_, i) => part(box(0.075, 1.7, 0.09), 'dark', [0, 0, 0], { rot: [(i / 4) * Math.PI, 0, 0] })),
  part(cylinder(0.22, 0.22, 0.14, 14), 'chrome', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
]
const BLADE_AT: V3 = [0, 2.1, 0.4]
const LOGS = 3
const LOG_LEN = 2.2
const BLADE_Z = 0.4

function Saw({ sim }: { sim: Sim }) {
  const p = sim.plants.saw
  const run = useRun(p)
  const blade = useRef<Group>(null)
  const logs = useRef<InstancedMesh>(null)
  const planks = useRef<InstancedMesh>(null)
  useFrame(() => {
    blade.current!.rotation.x = -run.spin * 16
    for (let i = 0; i < LOGS; i++) {
      const centre = -3.2 + mod(run.spin * 0.14 + i / LOGS, 1) * 11.5
      const back = centre - LOG_LEN / 2
      const front = centre + LOG_LEN / 2
      const logEnd = Math.min(front, BLADE_Z)
      put(logs.current!, i, 0, 1.47, (back + logEnd) / 2, 0, 1, 1, Math.max(0.001, logEnd - back))
      const from = Math.max(back, BLADE_Z)
      for (let k = 0; k < 2; k++) put(planks.current!, i * 2 + k, (k - 0.5) * 0.36, 1.47, (from + front) / 2, 0, 1, 1, Math.max(0.001, front - from))
    }
    for (const m of [logs, planks]) m.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <Static parts={SAW_BODY} paint="#f2b01e" cast={false} />
      <group ref={blade} position={BLADE_AT}>
        <Static parts={BLADE} paint="#ffffff" cast={false} />
      </group>
      <instancedMesh
        ref={logs}
        args={[solidGeo('sawLog', [part(cylinder(0.3, 0.3, 1, 16), 'plush', [0, 0, 0], { colour: '#8a5a36', rot: [Math.PI / 2, 0, 0] }), part(cylinder(0.27, 0.27, 1.004, 16), 'plush', [0, 0, 0], { colour: '#e8c48a', rot: [Math.PI / 2, 0, 0] })]), SOLID, LOGS]}
        frustumCulled={false}
      />
      <instancedMesh ref={planks} args={[solidGeo('sawPlank', [part(box(0.16, 0.56, 1), 'plush', [0, 0, 0], { colour: '#ecca92' })]), SOLID, LOGS * 2]} frustumCulled={false} />
      <Puffs at={[0.9, 2.2, 0.8]} run={run} colour="#f1dca0" drift={[1.6, 0.8, 0.5]} size={0.2} count={10} speed={1.2} />
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The water tower.

/** The spout's tip over the ring, from the column. */
const SPOUT = WATER_RING.z - WATER_COLUMN.z
const TOWER: Part[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => rod([sx * 1.9, 0, sz * 1.9], [sx * 1.2, 5.2, sz * 1.2], 0.13, '#8f949c', 'steel'))),
  ...[1.6, 3.4].flatMap((y) => {
    const k = 1.9 - (y / 5.2) * 0.7
    return [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].map(([ax, az, bx, bz]) => rod([ax * k, y, az * k], [bx * k, y, bz * k], 0.07, '#8f949c', 'steel'))
  }),
  part(cylinder(1.65, 1.65, 2.4, 28), 'enamel', [0, 6.4, 0]),
  part(cylinder(1.68, 1.68, 0.4, 28), 'trim', [0, 6.4, 0], { colour: '#f4f5f7' }),
  part(cylinder(1.68, 1.68, 0.12, 28), 'trim', [0, 5.3, 0], { colour: '#f4f5f7' }),
  part(cylinder(0.5, 1.6, 0.5, 28), 'enamel', [0, 4.95, 0], { tint: 0.85 }),
  part(cylinder(0, 1.85, 1.1, 28), 'trim', [0, 8.15, 0], { colour: '#d9443a' }),
  part(sphere(0.14, 8), 'trim', [0, 8.75, 0], { colour: '#e6b422' }),
  // The pipe down, along and out to the spout over the ring.
  rod([0, 4.7, 0], [0, 3.9, 0], 0.22, '#aab1ba', 'steel'),
  rod([0, 3.9, 0], [0, 3.9, SPOUT], 0.22, '#aab1ba', 'steel'),
  part(sphere(0.3, 10), 'steel', [0, 3.9, 0]),
  part(sphere(0.3, 10), 'steel', [0, 3.9, SPOUT]),
  part(cylinder(0.4, 0.26, 0.5, 14), 'steel', [0, 3.55, SPOUT]),
  part(cylinder(0.24, 0.24, 0.06, 14), 'lamp', [0, 3.3, SPOUT], { colour: '#5ec8ff' }),
  // The ladder up the near side.
  ...[-1, 1].map((s) => rod([s * 0.3, 0, 2.05], [s * 0.3, 5.9, 1.75], 0.04, '#d9443a')),
  ...Array.from({ length: 12 }, (_, i) => slab(0.6, 0.05, 0.05, [0, 0.4 + i * 0.46, 2.05 - ((0.4 + i * 0.46) / 5.9) * 0.3], '#d9443a')),
]
const VALVE: Part[] = [part(cylinder(0.36, 0.36, 0.05, 16), 'trim', [0, 0, 0], { colour: '#d9443a' }), slab(0.8, 0.06, 0.08, [0, 0.03, 0], '#d9443a'), slab(0.08, 0.06, 0.8, [0, 0.03, 0], '#d9443a')]

/** The tank and its legs as a thick line, for what they hide. */
const WATER_SHAPE: readonly Capsule[] = [{ a: [WATER_COLUMN.x, 0, WATER_COLUMN.z], b: [WATER_COLUMN.x, 9, WATER_COLUMN.z], r: 2.4 }]

/** Fades the water tower while it hides what the child must see. */
function FadeWaterTower({ view, group }: { view: View; group: RefObject<Group | null> }) {
  useFade(group, view, () => WATER_SHAPE)
  return null
}

function WaterTower({ sim, group }: { sim: Sim; group: RefObject<Group | null> }) {
  const tank = useRef<Group>(null)
  const valve = useRef<Group>(null)
  const open = useRef(0)
  useFrame((_, dt) => {
    open.current += ((sim.watering ? 1 : 0) - open.current) * Math.min(1, dt * 6)
    valve.current!.rotation.y += dt * 5 * open.current
    tank.current!.scale.y = 1 + Math.sin(sim.time * 14) * 0.012 * open.current
  })
  return (
    <group ref={group} position={[WATER_COLUMN.x, 0, WATER_COLUMN.z]}>
      <group ref={tank}>
        <Static parts={TOWER} paint="#3b8be0" cast={false} />
      </group>
      <group ref={valve} position={[0, 4.24, SPOUT * 0.4]}>
        <Static parts={VALVE} paint="#ffffff" cast={false} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------

const BY_ID: Record<PlantId, (props: { sim: Sim }) => React.JSX.Element> = { press: Press, crusher: Crusher, saw: Saw }

/** The brick press, the rock crusher, the sawmill and the water tower, each at its place on the map. The play screen passes the camera's `view` so the water tower fades while it hides the action; the previews pass none. */
export function Plants({ sim, view }: { sim: Sim; view?: View }) {
  const water = useRef<Group>(null)
  return (
    <>
      {(Object.keys(BY_ID) as PlantId[]).map((id) => {
        const Plant = BY_ID[id]
        const at = PLANTS[id]
        return (
          <group key={id} position={[at.x, 0, at.z]} rotation={[0, at.yaw, 0]}>
            <Plant sim={sim} />
          </group>
        )
      })}
      <WaterTower sim={sim} group={water} />
      {view !== undefined && <FadeWaterTower view={view} group={water} />}
    </>
  )
}
