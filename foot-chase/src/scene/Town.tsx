import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { AdditiveBlending, BufferAttribute, Color, Group, InstancedMesh, Object3D, PlaneGeometry } from 'three'

import { mod } from '../game/math'
import { mulberry32 } from '../game/random'
import type { Sim } from '../game/sim'
import { TOON_GRADIENT, palette } from './look'

const scratch = new Object3D()
/** The sidewalk the runners keep to: this wide, its surface at y = 0, the grass a little under it. */
export const PATH_HALF_W = 1.4
export const GRASS_TOP = -0.08
/** The street in front of the sidewalk starts past the kerb. */
const STREET_Z = PATH_HALF_W + 0.4

/**
 * Where scrolling things wrap. Each layer repeats every `span` units, centred a little
 * right of the police, where the camera looks. Deeper layers need wider spans: the
 * camera sees more of the world the further back it looks.
 */
function wrap(worldX: number, policeX: number, span: number) {
  const left = 14 - span / 2
  return mod(worldX - policeX - left, span) + left
}

/** The sky: violet overhead, orange above the town, gold at the horizon; painted once, it never changes. */
const skyGeometry = (() => {
  const g = new PlaneGeometry(600, 300, 1, 20)
  const stops: [number, Color][] = [
    [-150, new Color(palette.horizon)],
    [0, new Color(palette.horizon)],
    [14, new Color(palette.skyMid)],
    [48, new Color(palette.skyTop)],
    [150, new Color('#22183f')],
  ]
  const pos = g.attributes.position!
  const colors = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    let k = 1
    while (k < stops.length - 1 && stops[k]![0] < y) k++
    const [y0, c0] = stops[k - 1]!
    const [y1, c1] = stops[k]!
    c.copy(c0).lerp(c1, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
})()

/** A scatter of early stars high in the sky, and the sun going down on the right, behind the town. */
const STARS = (() => {
  const rand = mulberry32(19)
  return Array.from({ length: 40 }, () => ({ x: -140 + rand() * 300, y: 45 + rand() * 60, r: 0.25 + rand() * 0.3 }))
})()

function Sky() {
  return (
    <group>
      <mesh geometry={skyGeometry} position={[0, 0, -90]}>
        <meshBasicMaterial vertexColors fog={false} />
      </mesh>
      {STARS.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, -88]} scale={s.r}>
          <sphereGeometry args={[1, 6, 4]} />
          <meshBasicMaterial color={palette.star} fog={false} transparent opacity={0.7} />
        </mesh>
      ))}
      <mesh position={[24, 6, -87]}>
        <sphereGeometry args={[14, 24, 18]} />
        <meshBasicMaterial color={palette.sunHalo} fog={false} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[24, 6, -86]}>
        <sphereGeometry args={[9, 24, 18]} />
        <meshBasicMaterial color={palette.sun} fog={false} />
      </mesh>
    </group>
  )
}

interface Blob {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: number
}

/**
 * An instanced layer of one shape, each copy placed, scaled and tinted from its blob and
 * wrapping in police-local x: buildings, windows, trees, clouds are all this. `lit`
 * layers glow on their own instead of taking the light.
 */
function Layer({ sim, blobs, colors, span, drift, shadow, lit, children }: { sim: Sim; blobs: Blob[]; colors: readonly string[]; span: number; drift: number; shadow: boolean; lit: boolean; children: ReactNode }) {
  const mesh = useRef<InstancedMesh>(null!)
  const tints = useMemo(() => colors.map((c) => new Color(c)), [colors])
  useLayoutEffect(() => {
    blobs.forEach((b, i) => mesh.current.setColorAt(i, tints[b.color]!))
    mesh.current.instanceColor!.needsUpdate = true
  }, [blobs, tints])
  useFrame(() => {
    const shift = sim.police.x + drift * sim.time
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i]!
      scratch.position.set(wrap(b.x, shift, span), b.y, b.z)
      scratch.scale.set(b.sx, b.sy, b.sz)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, blobs.length]} frustumCulled={false} castShadow={shadow} receiveShadow={shadow}>
      {children}
      {lit ? <meshBasicMaterial color="#ffffff" /> : <meshToonMaterial color="#ffffff" gradientMap={TOON_GRADIENT} />}
    </instancedMesh>
  )
}

/** One copy of a model at each of a few world x, wrapping in police-local x. */
function Wrapped({ sim, xs, span, children }: { sim: Sim; xs: number[]; span: number; children: ReactNode }) {
  const groups = useRef<Group[]>([])
  useFrame(() => {
    groups.current.forEach((g, i) => {
      g.position.x = wrap(xs[i]!, sim.police.x, span)
    })
  })
  return (
    <>
      {xs.map((x, i) => (
        <group
          key={x}
          ref={(el) => {
            if (el) groups.current[i] = el
          }}
        >
          {children}
        </group>
      ))}
    </>
  )
}

const WHEEL_R = 7
const GONDOLAS = 8

/** The ferris wheel at the fair across town, turning slowly, its gondolas hanging level as they go round. */
function FerrisWheel({ sim, x, span }: { sim: Sim; x: number; span: number }) {
  const root = useRef<Group>(null!)
  const spokes = useRef<Group>(null!)
  const gondolas = useRef<Group[]>([])
  useFrame(() => {
    root.current.position.x = wrap(x, sim.police.x, span)
    const a = sim.time * 0.25
    spokes.current.rotation.z = a
    gondolas.current.forEach((g, i) => {
      const b = a + (i * Math.PI * 2) / GONDOLAS
      g.position.set(Math.cos(b) * WHEEL_R, Math.sin(b) * WHEEL_R, 0)
    })
  })
  return (
    <group ref={root} position={[0, 0, -47]}>
      <group position={[0, WHEEL_R + 2.5, 0]}>
        <mesh>
          <torusGeometry args={[WHEEL_R, 0.3, 8, 40]} />
          <meshToonMaterial color={palette.ferris} gradientMap={TOON_GRADIENT} />
        </mesh>
        <group ref={spokes}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]}>
              <boxGeometry args={[WHEEL_R * 2, 0.2, 0.2]} />
              <meshToonMaterial color={palette.ferris} gradientMap={TOON_GRADIENT} />
            </mesh>
          ))}
        </group>
        <mesh>
          <sphereGeometry args={[0.8, 12, 10]} />
          <meshBasicMaterial color={palette.ferrisHub} />
        </mesh>
        {Array.from({ length: GONDOLAS }, (_, i) => (
          <group
            key={i}
            ref={(el) => {
              if (el) gondolas.current[i] = el
            }}
          >
            <mesh position={[0, -0.7, 0]}>
              <boxGeometry args={[1.3, 1.1, 1.1]} />
              <meshToonMaterial color={palette.confetti[i % palette.confetti.length]} gradientMap={TOON_GRADIENT} />
            </mesh>
          </group>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.4, (WHEEL_R + 2.5) / 2, 0]} rotation={[0, 0, side * -0.4]}>
          <boxGeometry args={[0.5, WHEEL_R + 3.5, 0.5]} />
          <meshToonMaterial color={palette.tower} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
    </group>
  )
}

/** The water tower: a tank on four legs with a pointed roof. */
function WaterTower() {
  return (
    <group position={[0, 0, -45]}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 1.3, 3.5, sz * 1.3]}>
            <boxGeometry args={[0.28, 7, 0.28]} />
            <meshToonMaterial color={palette.tower} gradientMap={TOON_GRADIENT} />
          </mesh>
        )),
      )}
      <mesh position={[0, 8.5, 0]}>
        <cylinderGeometry args={[2.1, 2.1, 3.2, 16]} />
        <meshToonMaterial color={palette.skylineNear[2]} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 10.9, 0]}>
        <coneGeometry args={[2.4, 1.6, 16]} />
        <meshToonMaterial color={palette.roof[0]} gradientMap={TOON_GRADIENT} />
      </mesh>
    </group>
  )
}

/** A street lamp on the kerb, already lit: a glowing head, and a pool of warm light on the sidewalk under it. */
function Lamp() {
  return (
    <group position={[0, 0, STREET_Z - 0.1]}>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 3.8, 8]} />
        <meshToonMaterial color={palette.lampPost} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 3.95, 0]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshBasicMaterial color={palette.lampGlow} />
      </mesh>
      <mesh position={[0, 4.3, 0]}>
        <coneGeometry args={[0.42, 0.3, 10]} />
        <meshToonMaterial color={palette.lampPost} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 0.1, -0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.6, 20]} />
        <meshBasicMaterial color={palette.lampGlow} transparent opacity={0.28} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

interface Firefly {
  x: number
  y: number
  z: number
  phase: number
}

/** Fireflies over the yards: little lights drifting and pulsing in the dusk. */
function Fireflies({ sim, flies }: { sim: Sim; flies: Firefly[] }) {
  const mesh = useRef<InstancedMesh>(null!)
  useFrame(() => {
    const t = sim.time
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i]!
      scratch.position.set(wrap(f.x + 0.8 * Math.sin(t * 0.5 + f.phase), sim.police.x, 90), f.y + 0.4 * Math.sin(t * 1.3 + f.phase * 1.7), f.z)
      scratch.scale.setScalar(0.06 + 0.04 * Math.sin(t * 3 + f.phase))
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, flies.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      <meshBasicMaterial color={palette.firefly} />
    </instancedMesh>
  )
}

/** Lays out every scrolling layer once, from a fixed seed, so the town looks the same on every visit. */
function plant() {
  const rand = mulberry32(20260914)
  const spread = (span: number) => rand() * span
  const farTown: Blob[] = Array.from({ length: 26 }, () => {
    const h = 8 + rand() * 20
    const w = 5 + rand() * 6
    return { x: spread(260), y: GRASS_TOP + h / 2, z: -74 - rand() * 6, sx: w, sy: h, sz: 6, color: Math.floor(rand() * 2) }
  })
  const nearTown: Blob[] = Array.from({ length: 18 }, () => {
    const h = 5 + rand() * 9
    const w = 4 + rand() * 4
    return { x: spread(200), y: GRASS_TOP + h / 2, z: -44 - rand() * 4, sx: w, sy: h, sz: 6, color: Math.floor(rand() * 5) }
  })
  const windows: Blob[] = []
  for (const b of nearTown) {
    const cols = Math.max(1, Math.floor((b.sx - 1) / 1.5))
    const rows = Math.max(1, Math.floor((b.sy - 1.5) / 2))
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        windows.push({ x: b.x - ((cols - 1) * 1.5) / 2 + c * 1.5, y: GRASS_TOP + 1.3 + r * 2, z: b.z + 3.06, sx: 0.7, sy: 1.0, sz: 0.1, color: rand() < 0.7 ? 0 : 1 })
      }
    }
  }
  const clouds: Blob[] = Array.from({ length: 7 }, () => ({ x: spread(220), y: 16 + rand() * 18, z: -80, sx: 12 + rand() * 12, sy: 0.7 + rand() * 0.7, sz: 1, color: Math.floor(rand() * 3) }))
  const crowns: Blob[] = []
  const trunks: Blob[] = []
  for (let i = 0; i < 30; i++) {
    const h = 3 + rand() * 3
    const r = 1.0 + rand() * 0.7
    const x = spread(110)
    const z = -13 - rand() * 6
    crowns.push({ x, y: GRASS_TOP + 0.8 + h / 2, z, sx: r, sy: h, sz: r, color: Math.floor(rand() * 3) })
    trunks.push({ x, y: GRASS_TOP + 0.5, z, sx: 0.3, sy: 1, sz: 0.3, color: 0 })
  }
  const flies: Firefly[] = Array.from({ length: 36 }, () => ({ x: spread(90), y: 0.5 + rand() * 1.8, z: -2 - rand() * 9, phase: rand() * 6.3 }))
  const lamps = Array.from({ length: 7 }, (_, i) => i * 16 + 6)
  return { farTown, nearTown, windows, clouds, crowns, trunks, flies, lamps }
}

/**
 * The town at golden hour: the sky and the sun going down, the city across the yards
 * with its windows coming on and the fair's wheel turning, tall dark trees behind the
 * houses, the sidewalk with its lamps lit and the street in front. Every layer wraps in
 * police-local x. The ground is fixed: grass behind the sidewalk, asphalt in front, the
 * sidewalk laid on top so nothing shares a plane. What stands on it is the sim's
 * business, in Lots.
 */
export function Town({ sim }: { sim: Sim }) {
  const layers = useMemo(plant, [])
  return (
    <group>
      <Sky />
      <Layer sim={sim} blobs={layers.clouds} colors={palette.cloud} span={220} drift={0.4} shadow={false} lit>
        <sphereGeometry args={[1, 12, 6]} />
      </Layer>
      <Layer sim={sim} blobs={layers.farTown} colors={palette.skylineFar} span={260} drift={0} shadow={false} lit={false}>
        <boxGeometry args={[1, 1, 1]} />
      </Layer>
      <Layer sim={sim} blobs={layers.nearTown} colors={palette.skylineNear} span={200} drift={0} shadow={false} lit={false}>
        <boxGeometry args={[1, 1, 1]} />
      </Layer>
      <Layer sim={sim} blobs={layers.windows} colors={[palette.windowLit, palette.windowDark]} span={200} drift={0} shadow={false} lit>
        <boxGeometry args={[1, 1, 1]} />
      </Layer>
      <FerrisWheel sim={sim} x={70} span={200} />
      <Wrapped sim={sim} xs={[150]} span={200}>
        <WaterTower />
      </Wrapped>
      <mesh position={[30, GRASS_TOP - 0.6, -48 - PATH_HALF_W / 2]} receiveShadow>
        <boxGeometry args={[400, 1.2, 96 - PATH_HALF_W]} />
        <meshToonMaterial color={palette.grass} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[30, -0.15, 0]} receiveShadow>
        <boxGeometry args={[400, 0.3, PATH_HALF_W * 2]} />
        <meshToonMaterial color={palette.path} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[30, -0.12, PATH_HALF_W + 0.2]}>
        <boxGeometry args={[400, 0.3, 0.4]} />
        <meshToonMaterial color={palette.kerb} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[30, -0.2, STREET_Z + 20]} receiveShadow>
        <boxGeometry args={[400, 0.3, 40]} />
        <meshToonMaterial color={palette.road} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[30, -0.04, STREET_Z + 4.2]}>
        <boxGeometry args={[400, 0.03, 0.18]} />
        <meshToonMaterial color={palette.roadLine} gradientMap={TOON_GRADIENT} />
      </mesh>
      <Layer sim={sim} blobs={layers.trunks} colors={[palette.treeTrunk]} span={110} drift={0} shadow lit={false}>
        <boxGeometry args={[1, 1, 1]} />
      </Layer>
      <Layer sim={sim} blobs={layers.crowns} colors={palette.treeCrown} span={110} drift={0} shadow lit={false}>
        <coneGeometry args={[1, 1, 7]} />
      </Layer>
      <Wrapped sim={sim} xs={layers.lamps} span={112}>
        <Lamp />
      </Wrapped>
      <Fireflies sim={sim} flies={layers.flies} />
    </group>
  )
}
