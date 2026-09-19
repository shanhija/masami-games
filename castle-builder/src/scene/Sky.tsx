import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three'

import { clamp01, mod } from '../game/math'
import { mulberry32 } from '../game/random'
import { GRID_MIN, ISLAND_R, RAINBOW_FOR, raining, windStrength, type Sim } from '../game/sim'
import { CAMERA_YAW, Flat, Glow, daylight, palette, refAt, setOpacity, show } from './look'

const scratch = new Object3D()
const UP = new Vector3(0, 1, 0)
const dir = new Vector3()

// ---------------------------------------------------------------------------- clouds

const CLOUD_SPAN = 110
interface Blob {
  x: number
  y: number
  z: number
  r: number
}
/** Five puffs of four to six blobs each, laid once from a fixed seed, spread along the span they drift round. */
const CLOUD_BLOBS: Blob[] = (() => {
  const rand = mulberry32(31)
  const blobs: Blob[] = []
  for (let c = 0; c < 5; c++) {
    const cx = (c + 0.2 + rand() * 0.6) * (CLOUD_SPAN / 5)
    const cy = 16 + rand() * 6
    const cz = -16 + rand() * 40
    const n = 4 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand()
      const d = i === 0 ? 0 : 1.6 + rand() * 2
      blobs.push({ x: cx + Math.cos(a) * d, y: cy + (i === 0 ? 0.5 : (rand() - 0.5) * 1.4), z: cz + Math.sin(a) * d * 0.6, r: i === 0 ? 2.6 + rand() * 0.8 : 1.4 + rand() * 1.3 })
    }
  }
  return blobs
})()

/** Puffy white clouds drifting east over the island, faster in a wind, their shadows sliding over the meadow. */
function Clouds({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  const drift = useRef({ shift: 0, at: -1 })
  useFrame(() => {
    const t = sim.time
    const d = drift.current
    if (d.at >= 0) d.shift += Math.max(0, t - d.at) * (0.8 + 5 * windStrength(sim))
    d.at = t
    const m = mesh.current
    for (let i = 0; i < CLOUD_BLOBS.length; i++) {
      const b = CLOUD_BLOBS[i]!
      scratch.position.set(mod(b.x + d.shift, CLOUD_SPAN) - CLOUD_SPAN / 2, b.y + 0.3 * Math.sin(t * 0.4 + b.x), b.z)
      scratch.rotation.set(0, 0, 0)
      scratch.scale.set(b.r, b.r * 0.8, b.r)
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CLOUD_BLOBS.length]} frustumCulled={false} castShadow>
      <sphereGeometry args={[1, 10, 7]} />
      <Flat color={palette.cloud} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------- grumpy cloud

/** How high the grumpy cloud floats: low enough that its face is in the frame wherever the hero stands. */
const GRUMPY_H = 11
/** Six grey blobs about nine units wide; the face sits on the front of the big one. */
const GRUMPY_BLOBS: (Blob & { dark: boolean })[] = [
  { x: 0, y: 0.4, z: 0, r: 2.3, dark: false },
  { x: -2.1, y: -0.1, z: 0.4, r: 1.8, dark: false },
  { x: 2.1, y: 0, z: 0.3, r: 1.85, dark: false },
  { x: -3.5, y: -0.7, z: -0.3, r: 1.2, dark: true },
  { x: 3.5, y: -0.6, z: -0.4, r: 1.25, dark: true },
  { x: 0.3, y: -0.5, z: -1.9, r: 1.9, dark: true },
]

/**
 * The storm as a character: a grey cloud with a face, turned to the camera, that frowns
 * from the warning through the storm and smiles as the rainbow comes, puffs its cheeks
 * to blow in a wind, bobs, and darkens the ground under it.
 */
function Grumpy({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const shadow = useRef<Mesh>(null!)
  const mouth = useRef<Mesh>(null!)
  const brows = useRef<Mesh[]>([])
  const cheeks = useRef<Mesh[]>([])
  useFrame(() => {
    const t = sim.time
    const { x, z } = sim.cloud
    const w = sim.weather
    const since = t - sim.weatherAt
    const wind = windStrength(sim)
    // The mood, 1 a smile and -1 a frown, turns over half a second when the warning comes and again with the rainbow.
    const turn = clamp01(since / 0.6)
    const mood = w === 'warning' ? 1 - 2 * turn : w === 'rainbow' ? 2 * turn - 1 : w === 'clear' ? 1 : -1
    // The cheeks fill while the wind blows and empty as its rainbow comes.
    const puff = w === 'wind' ? clamp01(since / 0.8) : w === 'rainbow' && sim.storm === 'wind' ? 1 - clamp01(since / 0.8) : 0
    root.current.position.set(x, GRUMPY_H + 0.4 * Math.sin(t * 1.1), z)
    root.current.rotation.z = 0.03 * Math.sin(t * 0.7) - 0.12 * wind
    // The half torus is a frown as made; turned over about its own X it swings out through a pout into a smile.
    mouth.current.rotation.x = ((1 + mood) / 2) * Math.PI
    const knit = 0.175 - 0.325 * mood
    brows.current.forEach((b, i) => {
      b.rotation.z = (i === 0 ? -1 : 1) * knit
      b.position.y = 1.15 - 0.15 * (1 - mood)
    })
    for (const c of cheeks.current) c.scale.setScalar(Math.max(1e-4, puff * (1 + 0.08 * Math.sin(t * 7))))
    shadow.current.position.set(x, 0.05, z)
    shadow.current.scale.setScalar(Math.max(1e-4, clamp01((ISLAND_R + 3 - Math.hypot(x, z)) / 8)))
  })
  return (
    <>
      <group ref={root} rotation={[0, CAMERA_YAW, 0]}>
        {GRUMPY_BLOBS.map((b, i) => (
          <mesh key={i} position={[b.x, b.y, b.z]} scale={[b.r, b.r * 0.85, b.r]}>
            <sphereGeometry args={[1, 10, 7]} />
            <Flat color={b.dark ? palette.grumpyDark : palette.grumpy} />
          </mesh>
        ))}
        <group position={[0, 0.3, 0]} rotation={[-0.5, 0, 0]}>
          {[-1, 1].map((s, i) => (
            <group key={s}>
              <mesh position={[s * 0.8, 0.55, 2.1]}>
                <sphereGeometry args={[0.45, 10, 8]} />
                <Flat color={palette.cloud} />
              </mesh>
              <mesh position={[s * 0.8, 0.5, 2.5]}>
                <sphereGeometry args={[0.2, 8, 6]} />
                <Flat color={palette.eye} />
              </mesh>
              <mesh ref={refAt(brows, i)} position={[s * 0.85, 1.15, 2.0]}>
                <boxGeometry args={[0.9, 0.18, 0.18]} />
                <Flat color={palette.eye} />
              </mesh>
              <mesh ref={refAt(cheeks, i)} position={[s * 1.7, -0.1, 1.9]}>
                <sphereGeometry args={[0.8, 8, 6]} />
                <Flat color={palette.grumpy} />
              </mesh>
            </group>
          ))}
          <mesh ref={mouth} position={[0, -0.35, 2.6]}>
            <torusGeometry args={[0.55, 0.12, 6, 12, Math.PI]} />
            <Flat color={palette.eye} />
          </mesh>
        </group>
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.8, 24]} />
        <Glow color={palette.grumpyDark} opacity={0.25} />
      </mesh>
    </>
  )
}

// ------------------------------------------------------------------------------ rain

const RAIN_N = 300
/** The drops start at the cloud's underside and fall from there. */
const RAIN_TOP = GRUMPY_H - 1.5
const RAIN_SPEED = 25
const RAIN_SPREAD = 22
const DROPS = (() => {
  const rand = mulberry32(44)
  return Array.from({ length: RAIN_N }, () => {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * RAIN_SPREAD
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, phase: rand() }
  })
})()

/** Rain under and around the grumpy cloud while the sim says so, each drop recycled from the top, leaning with the wind. */
function Rain({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  /** Sim time the rain started, for the fade in; the sim only keeps when it ends. */
  const from = useRef(-1)
  useFrame(() => {
    const t = sim.time
    const on = raining(sim)
    if (!on) from.current = -1
    else if (from.current < 0) from.current = t
    const k = on ? clamp01(Math.min(t - from.current, sim.rainUntil - t) / 0.5) : 0
    const m = mesh.current
    show(m, k > 0)
    if (k <= 0) return
    const lean = 0.4 * windStrength(sim)
    for (let i = 0; i < DROPS.length; i++) {
      const d = DROPS[i]!
      const y = RAIN_TOP - mod(t * RAIN_SPEED + d.phase * RAIN_TOP, RAIN_TOP)
      scratch.position.set(sim.cloud.x + d.x + (RAIN_TOP - y) * lean, y, sim.cloud.z + d.z)
      scratch.rotation.set(0, 0, lean)
      scratch.scale.setScalar(k)
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, RAIN_N]} frustumCulled={false}>
      <boxGeometry args={[0.04, 0.7, 0.04]} />
      <Glow color={palette.rain} opacity={0.7} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------------- lightning

const BOLT_SEGMENTS = 6
const BOLT_FOR = 0.25
const FLASH_FOR = 0.3

/** The bolt: a zigzag of glowing bars from the cloud to the strike for a quarter second, with a blink, and a pool of light on the ground. */
function Bolt({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const segments = useRef<Mesh[]>([])
  const flash = useRef<Mesh>(null!)
  /** The zigzag of the bolt shown last, laid from a seed keyed on when it struck. */
  const path = useRef({ at: -1, points: Array.from({ length: BOLT_SEGMENTS + 1 }, () => new Vector3()) })
  useFrame(() => {
    const t = sim.time
    const bolt = sim.lightning
    const age = t - bolt.at
    const struck = bolt.at >= 0 && age >= 0
    const flashing = struck && age < FLASH_FOR
    show(flash.current, flashing)
    if (flashing) {
      flash.current.position.set(bolt.x, 0.07, bolt.z)
      flash.current.scale.setScalar(1 + age * 3)
      setOpacity(flash.current, 0.6 * (1 - age / FLASH_FOR))
    }
    const on = struck && age < BOLT_FOR && !(age > 0.09 && age < 0.13)
    show(root.current, on)
    if (!on) return
    const p = path.current
    if (p.at !== bolt.at) {
      p.at = bolt.at
      const rand = mulberry32(Math.floor(bolt.at * 1000) >>> 0)
      const x0 = sim.cloud.x
      const y0 = GRUMPY_H - 1
      const z0 = sim.cloud.z
      p.points.forEach((pt, i) => {
        const f = i / BOLT_SEGMENTS
        const jag = i === 0 || i === BOLT_SEGMENTS ? 0 : 1
        pt.set(x0 + (bolt.x - x0) * f + jag * (rand() - 0.5) * 5, y0 + (bolt.y - y0) * f + jag * (rand() - 0.5) * 1.5, z0 + (bolt.z - z0) * f + jag * (rand() - 0.5) * 5)
      })
    }
    const thick = 0.28 + 0.14 * Math.sin(age * 90)
    for (let i = 0; i < BOLT_SEGMENTS; i++) {
      const a = p.points[i]!
      const b = p.points[i + 1]!
      const m = segments.current[i]!
      dir.subVectors(b, a)
      const len = dir.length()
      m.position.copy(a).addScaledVector(dir, 0.5)
      m.quaternion.setFromUnitVectors(UP, dir.normalize())
      m.scale.set(thick, len + thick, thick)
    }
  })
  return (
    <>
      <group ref={root}>
        {Array.from({ length: BOLT_SEGMENTS }, (_, i) => (
          <mesh key={i} ref={refAt(segments, i)}>
            <boxGeometry args={[1, 1, 1]} />
            <Glow color={palette.bolt} />
          </mesh>
        ))}
      </group>
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4, 24]} />
        <Glow color={palette.bolt} opacity={0.6} />
      </mesh>
    </>
  )
}

// ----------------------------------------------------------------------------- rainbow

/**
 * Six bands of half torus over the castle, facing the camera, in for the rainbow and
 * out again. A torus stands in the XY plane already, so the arc needs no tipping; its
 * centre is a unit under the meadow, so the feet stand on the grass just outside the
 * castle and the crown, sixteen up, stays under the top of a steeply down frame.
 */
function Rainbow({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const bands = useRef<Mesh[]>([])
  useFrame(() => {
    const on = sim.weather === 'rainbow'
    show(root.current, on)
    if (!on) return
    const since = sim.time - sim.weatherAt
    const k = clamp01(Math.min(since / 1.5, (RAINBOW_FOR - since) / 2))
    for (const b of bands.current) setOpacity(b, 0.55 * k)
  })
  return (
    <group ref={root} position={[0, -1, 0]} rotation={[0, CAMERA_YAW, 0]}>
      {palette.rainbow.map((c, i) => (
        <mesh key={c} ref={refAt(bands, i)}>
          <torusGeometry args={[17 - i * 0.5, 0.27, 6, 40, Math.PI]} />
          <Glow color={c} opacity={0.55} />
        </mesh>
      ))}
    </group>
  )
}

// --------------------------------------------------------------------------- fireflies

const FIREFLY_N = 220
/** They fill the meadow out to here, and keep off the castle grid with a little margin. */
const FIREFLY_R = 30
const FIREFLY_EDGE = -GRID_MIN + 1
interface Firefly {
  x: number
  y: number
  z: number
  size: number
  /** Where this one is in its wander and its blink, and how fast and how far it wanders. */
  phase: number
  rate: number
  swing: number
}
const FIREFLIES = (() => {
  const rand = mulberry32(90)
  const flies: Firefly[] = []
  while (flies.length < FIREFLY_N) {
    const x = (rand() * 2 - 1) * FIREFLY_R
    const z = (rand() * 2 - 1) * FIREFLY_R
    if (Math.hypot(x, z) > FIREFLY_R || (Math.abs(x) < FIREFLY_EDGE && Math.abs(z) < FIREFLY_EDGE)) continue
    flies.push({ x, y: 0.7 + rand() * 2.4, z, size: 0.08 + rand() * 0.07, phase: rand() * Math.PI * 2, rate: 0.5 + rand() * 0.7, swing: 0.5 + rand() * 1.2 })
  }
  return flies
})()

/**
 * Fireflies for the evening: little warm lights that wander and blink low over the
 * meadow as the dusk comes, out of the castle's way so they leave its lit windows alone.
 */
function Fireflies({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  useFrame(() => {
    const night = daylight(sim).night
    const m = mesh.current
    show(m, night > 0)
    if (night <= 0) return
    const t = sim.time
    for (let i = 0; i < FIREFLIES.length; i++) {
      const f = FIREFLIES[i]!
      const a = t * f.rate + f.phase
      scratch.position.set(f.x + Math.sin(a) * f.swing, f.y + 0.5 * Math.sin(a * 1.7), f.z + Math.cos(a * 0.8) * f.swing)
      scratch.rotation.set(0, 0, 0)
      scratch.scale.setScalar(night * f.size * (0.35 + 0.65 * Math.max(0, Math.sin(a * 2.3))))
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, FIREFLIES.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <Glow color={palette.sparkle} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------------------ leaves

const LEAF_N = 120
const LEAF_SPAN = 90
const LEAF_SPEED = 12
const LEAVES = (() => {
  const rand = mulberry32(55)
  return Array.from({ length: LEAF_N }, (_, i) => ({ x: rand() * LEAF_SPAN, y: 1.5 + rand() * 6.5, z: -30 + rand() * 60, phase: rand() * Math.PI * 2, spin: 2 + rand() * 4, colour: i % palette.leaves.length }))
})()

/** Leaves streaming east across the island while the wind blows, one instanced mesh per leaf green. */
function Leaves({ sim }: { sim: Sim }) {
  const meshes = useRef<InstancedMesh[]>([])
  useFrame(() => {
    const k = clamp01((windStrength(sim) - 0.2) / 0.2)
    for (const m of meshes.current) show(m, k > 0)
    if (k <= 0) return
    const t = sim.time
    const filled = palette.leaves.map(() => 0)
    for (const l of LEAVES) {
      scratch.position.set(mod(l.x + t * LEAF_SPEED, LEAF_SPAN) - LEAF_SPAN / 2, l.y + 0.8 * Math.sin(t * 2.2 + l.phase), l.z + 0.5 * Math.sin(t * 1.7 + l.phase * 2))
      scratch.rotation.set(t * l.spin, l.phase, t * l.spin * 0.6)
      scratch.scale.setScalar(k)
      scratch.updateMatrix()
      meshes.current[l.colour]!.setMatrixAt(filled[l.colour]!++, scratch.matrix)
    }
    for (const m of meshes.current) m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      {palette.leaves.map((c, i) => (
        <instancedMesh key={c} ref={refAt(meshes, i)} args={[undefined, undefined, LEAF_N / palette.leaves.length]} frustumCulled={false}>
          <boxGeometry args={[0.35, 0.02, 0.25]} />
          <Flat color={c} />
        </instancedMesh>
      ))}
    </>
  )
}

/** Everything in the air: the clouds and their shadows, the grumpy cloud, its rain and bolt, the rainbow, the evening fireflies and the leaves on the wind. */
export function Sky({ sim }: { sim: Sim }) {
  return (
    <group>
      <Clouds sim={sim} />
      <Grumpy sim={sim} />
      <Rain sim={sim} />
      <Bolt sim={sim} />
      <Rainbow sim={sim} />
      <Fireflies sim={sim} />
      <Leaves sim={sim} />
    </group>
  )
}
