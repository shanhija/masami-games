import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, InstancedMesh, Mesh, Object3D, SphereGeometry } from 'three'

import type { Game } from '../game/game'
import { mod, smoothstep } from '../game/math'
import { mulberry32 } from '../game/random'
import { GRID_MIN, ISLAND_R, PUDDLE_FOR, windStrength, type Puddle, type Sim } from '../game/sim'
import { Flat, Glow, Tinted, palette, setOpacity, show } from './look'
import { Synced } from './Synced'

const scratch = new Object3D()

/** The meadow's ground: this many rings of this many segments, so the greens can vary across it. */
const GROUND_RINGS = 14
const GROUND_SEGMENTS = 64
/** The island stands on a rim of dirt this deep; the sea laps against it at this height, so the rim shows above the water. */
const RIM_DEPTH = 2.2
const WATER_Y = -1.6
/** The sea reaches this far out, wider than the widest frame the look orbit can swing. */
const WATER_R = 120
/** Tufts and flowers keep off the castle grid, with a little margin, and off the very edge. */
const GRID_EDGE = -GRID_MIN + 1
const MEADOW_EDGE = ISLAND_R - 2
const TUFT_GREENS = [palette.grass[2], palette.lawn]
/** A puddle takes this long to spread, and dries up over this long at the end. */
const PUDDLE_SPREAD = 0.5
const PUDDLE_DRY = 10
const SPLASH_FOR = 0.6

/** Smooth value noise on a lattice `cell` units apart, 0 to 1, the same for the same seed. */
function valueNoise(seed: number, cell: number) {
  const rand = mulberry32(seed)
  const n = 32
  const lattice = Array.from({ length: n * n }, () => rand())
  const at = (i: number, j: number) => lattice[mod(i, n) * n + mod(j, n)]!
  return (x: number, z: number) => {
    const u = x / cell
    const v = z / cell
    const i = Math.floor(u)
    const j = Math.floor(v)
    const fu = smoothstep(0, 1, u - i)
    const fv = smoothstep(0, 1, v - j)
    const near = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
    const far = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
    return near + (far - near) * fv
  }
}

/**
 * The meadow: a disc of rings, every vertex with a green of its own, blended from the
 * three grass greens by seeded noise so the same patches are there every visit. Built
 * once; the faces wind counter-clockwise seen from above, so the disc faces the sun.
 */
const groundGeometry = (() => {
  const patch = valueNoise(11, 6)
  const light = valueNoise(12, 4)
  const greens = palette.grass.map((c) => new Color(c))
  const positions: number[] = []
  const colours: number[] = []
  const tint = new Color()
  const push = (x: number, z: number) => {
    positions.push(x, 0, z)
    tint.copy(greens[0]!).lerp(greens[1]!, patch(x, z)).lerp(greens[2]!, smoothstep(0.55, 0.9, light(x, z)))
    colours.push(tint.r, tint.g, tint.b)
  }
  push(0, 0)
  for (let k = 1; k <= GROUND_RINGS; k++) {
    const r = (ISLAND_R * k) / GROUND_RINGS
    for (let i = 0; i < GROUND_SEGMENTS; i++) {
      const a = (i / GROUND_SEGMENTS) * Math.PI * 2
      push(Math.cos(a) * r, Math.sin(a) * r)
    }
  }
  const at = (k: number, i: number) => (k === 0 ? 0 : 1 + (k - 1) * GROUND_SEGMENTS + mod(i, GROUND_SEGMENTS))
  const index: number[] = []
  for (let i = 0; i < GROUND_SEGMENTS; i++) index.push(0, at(1, i + 1), at(1, i))
  for (let k = 1; k < GROUND_RINGS; k++) {
    for (let i = 0; i < GROUND_SEGMENTS; i++) index.push(at(k, i), at(k, i + 1), at(k + 1, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
})()

/** A tuft and a bloom, each with its foot at the origin so it leans from the ground. */
const tuftGeometry = new ConeGeometry(0.12, 0.5, 3).translate(0, 0.25, 0)
const bloomGeometry = new SphereGeometry(0.12, 6, 5).translate(0, 0.3, 0)

interface Spot {
  x: number
  z: number
  /** Picks the colour. */
  k: number
  /** The size, about one. */
  s: number
}

/** Spots for the tufts and the flowers: all over the meadow but off the castle grid and the rim, the same every visit. */
function scatter(seed: number, count: number): Spot[] {
  const rand = mulberry32(seed)
  const spots: Spot[] = []
  while (spots.length < count) {
    const x = (rand() * 2 - 1) * MEADOW_EDGE
    const z = (rand() * 2 - 1) * MEADOW_EDGE
    if (Math.hypot(x, z) > MEADOW_EDGE || (Math.abs(x) < GRID_EDGE && Math.abs(z) < GRID_EDGE)) continue
    spots.push({ x, z, k: rand(), s: 0.8 + rand() * 0.5 })
  }
  return spots
}
const TUFTS = scatter(21, 900)
const BLOOMS = scatter(22, 250)

/** One shape at every spot, tinted per copy, leaning with the wind each frame. The shape's foot is its origin. */
function Meadow({ sim, spots, colours, geometry }: { sim: Sim; spots: Spot[]; colours: readonly string[]; geometry: BufferGeometry }) {
  const mesh = useRef<InstancedMesh>(null!)
  const tints = useMemo(() => colours.map((c) => new Color(c)), [colours])
  useLayoutEffect(() => {
    const m = mesh.current
    spots.forEach((s, i) => m.setColorAt(i, tints[Math.floor(s.k * tints.length)]!))
    m.instanceColor!.needsUpdate = true
  }, [spots, tints])
  useFrame(() => {
    const m = mesh.current
    const t = sim.time
    const amount = 0.05 + 0.5 * windStrength(sim)
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!
      scratch.position.set(s.x, 0, s.z)
      scratch.rotation.set(0, 0, amount * Math.sin(t * 2 + s.x * 0.7 + s.z * 1.3))
      scratch.scale.setScalar(s.s)
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} geometry={geometry} frustumCulled={false}>
      <Tinted />
    </instancedMesh>
  )
}

/** A puddle the storm left: it spreads in, dries up at the end, and rings when the hero runs through it. */
function PuddleModel({ sim, puddle }: { sim: Sim; puddle: Puddle }) {
  const disc = useRef<Mesh>(null!)
  const ring = useRef<Mesh>(null!)
  useFrame(() => {
    const t = sim.time
    const age = t - puddle.at
    const spread = Math.min(1, age / PUDDLE_SPREAD)
    const wet = Math.max(0, Math.min(1, (PUDDLE_FOR - age) / PUDDLE_DRY))
    disc.current.scale.setScalar(spread * (1 + 0.03 * Math.sin(t * 1.5 + puddle.id)))
    setOpacity(disc.current, 0.7 * wet)
    const k = (t - puddle.splashedAt) / SPLASH_FOR
    const splashing = puddle.splashedAt >= 0 && k < 1
    show(ring.current, splashing)
    if (splashing) {
      ring.current.scale.setScalar(0.6 + 1.4 * k)
      setOpacity(ring.current, 0.8 * (1 - k))
    }
  })
  return (
    <group position={[puddle.x, 0.02, puddle.z]}>
      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.1, 18]} />
        <Glow color={palette.puddle} opacity={0.7} />
      </mesh>
      <mesh ref={ring} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.95, 18]} />
        <Glow color={palette.foam} opacity={0.8} />
      </mesh>
    </group>
  )
}

/**
 * The island: the meadow disc the child taps to send the hero, the dirt rim it stands
 * on, the sea all around with two lapping rings at the shore, the grass and flowers
 * that lean with the wind, and the puddles a storm leaves behind.
 */
export function Island({ sim, game }: { sim: Sim; game: Game }) {
  const ripple = useRef<Mesh>(null!)
  const foam = useRef<Mesh>(null!)
  useFrame(() => {
    // The rings are low polygons, so as they turn against each other their corners drift and the water seems to lap.
    ripple.current.rotation.z = sim.time * 0.05
    foam.current.rotation.z = -sim.time * 0.035
  })
  return (
    <group>
      <mesh
        geometry={groundGeometry}
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation()
          game.tapGround(e.point.x, e.point.z)
        }}
      >
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      {/* The rim stands a hair inside the meadow, so the grass laps over its top and no seam shows. */}
      <mesh position={[0, -RIM_DEPTH / 2, 0]}>
        <cylinderGeometry args={[ISLAND_R - 0.1, ISLAND_R - 0.1, RIM_DEPTH, GROUND_SEGMENTS, 1, true]} />
        <Flat color={palette.dirt} />
      </mesh>
      <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[WATER_R, 48]} />
        <Flat color={palette.water} />
      </mesh>
      <mesh ref={ripple} position={[0, WATER_Y + 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ISLAND_R + 0.8, ISLAND_R + 1.7, 18]} />
        <Glow color={palette.waterLight} opacity={0.5} />
      </mesh>
      <mesh ref={foam} position={[0, WATER_Y + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ISLAND_R + 2.6, ISLAND_R + 3.2, 14]} />
        <Glow color={palette.foam} opacity={0.5} />
      </mesh>
      <Meadow sim={sim} spots={TUFTS} colours={TUFT_GREENS} geometry={tuftGeometry} />
      <Meadow sim={sim} spots={BLOOMS} colours={palette.dye} geometry={bloomGeometry} />
      <Synced list={() => sim.puddles} render={(p) => <PuddleModel key={p.id} sim={sim} puddle={p} />} />
    </group>
  )
}
