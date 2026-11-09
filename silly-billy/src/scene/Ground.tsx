import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Path,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { mulberry32 } from '../../../castle-builder/src/game/random'
import { CAMERA_YAW, Flat } from '../../../castle-builder/src/scene/look'
import { LAYOUTS } from '../content/layouts'
import { ROOM_GEO, WATER_Y, type Water } from '../engine/rooms'
import { terrainOf } from '../engine/sky'
import { ROOM_HALF, type RoomId, type World } from '../engine/types'
import { waterTop } from '../engine/world'
import { useLive } from './live'
import { colorOf, palette, type Clock } from './look'
import type { SceneSource } from './Stage'

/**
 * Each room is a thick diorama slab floating on the sky: a painted top (grass and sand,
 * light tiles, moss and a dirt path) with holes where the water is, a coloured band and
 * dirt (or stone) down its sides, and the room's own furniture that never moves: the
 * playground's low white fence, the pool's coping and basin, the forest's pond and the ring
 * of trees beyond the edge. The water is a sheet of facets that rocks gently at its surface,
 * as high as the room's water is now (engine/sky.ts's terrain: full at WATER_Y, gone when the
 * pool is emptied) and in its colour, over a floor at the room's floor depth; a colour code
 * washed over the ground lies over the painted top. Each room's painted top is made once and kept.
 */

const TAU = Math.PI * 2
/** The top's painting, pixels a side. */
const TEX = 1024
/** How deep the slab is under the ground, and how deep its coloured top band is. */
const DEPTH = 2.2
const BAND = 0.3
/** The pond's round edge has this many sides. */
const ROUND = 40

type Paint = (g: CanvasRenderingContext2D, at: (x: number, z: number) => [number, number], s: number, rand: () => number) => void

interface Slab {
  /** Half the slab's width: the room's ±ROOM_HALF and a border round it. */
  half: number
  band: string
  side: string
  paint: Paint
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

/** Smooth hills and hollows from 0 to 1, a few crossing waves about `size` metres long: enough for patches of colour. */
function waves(seed: number, size: number) {
  const rand = mulberry32(seed)
  const list = Array.from({ length: 6 }, () => ({ a: rand() * TAU, f: ((0.6 + rand() * 0.9) * TAU) / size, p: rand() * TAU }))
  return (x: number, z: number) => 0.5 + 0.5 * (list.reduce((sum, w) => sum + Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.f + w.p), 0) / Math.sqrt(list.length)) * 0.8
}

/** The whole top in soft patches of three colours, painted small and stretched smooth. */
function patches(g: CanvasRenderingContext2D, half: number, colours: readonly string[], size: number, seed: number) {
  const n = 160
  const small = document.createElement('canvas')
  small.width = small.height = n
  const sg = small.getContext('2d')!
  const img = sg.createImageData(n, n)
  const big = waves(seed, size)
  const fine = waves(seed + 1, size * 0.45)
  const [a, b, c] = colours.map(rgb)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * 2 * half - half
      const z = ((j + 0.5) / n) * 2 * half - half
      const u = Math.min(1, Math.max(0, big(x, z)))
      const v = Math.min(1, Math.max(0, (fine(x, z) - 0.55) * 3))
      for (let k = 0; k < 3; k++) {
        const ab = a![k]! + (b![k]! - a![k]!) * u
        img.data[(j * n + i) * 4 + k] = ab + (c![k]! - ab) * v
      }
      img.data[(j * n + i) * 4 + 3] = 255
    }
  }
  sg.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.drawImage(small, 0, 0, TEX, TEX)
}

/** Little marks all over: blades, leaves, pebbles. */
function speckle(g: CanvasRenderingContext2D, rand: () => number, count: number, colours: readonly string[], size: number, long: number, keep: (x: number, y: number) => boolean) {
  g.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rand() * TEX
    const y = rand() * TEX
    if (!keep(x, y)) continue
    g.strokeStyle = colours[Math.floor(rand() * colours.length)]!
    g.lineWidth = size * (0.6 + rand() * 0.8)
    const a = rand() * TAU
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * long, y + Math.sin(a) * long)
    g.stroke()
  }
}

/** A patch of ground: an oval `rx` by `rz` metres from its middle, turned by `yaw`. */
interface Patch {
  x: number
  z: number
  rx: number
  rz: number
  yaw: number
}

/** A lumpy oval patch, grown by `grow` metres all round, as a path. */
function blob(g: CanvasRenderingContext2D, at: (x: number, z: number) => [number, number], p: Patch, grow: number, seed: number) {
  const rand = mulberry32(seed)
  const bumps = Array.from({ length: 3 }, () => ({ k: 2 + Math.floor(rand() * 4), p: rand() * TAU, a: 0.03 + rand() * 0.05 }))
  const c = Math.cos(p.yaw)
  const s = Math.sin(p.yaw)
  g.beginPath()
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * TAU
    const w = 1 + bumps.reduce((sum, b) => sum + b.a * Math.sin(b.k * t + b.p), 0)
    const u = Math.cos(t) * (p.rx + grow) * w
    const v = Math.sin(t) * (p.rz + grow) * w
    const [x, y] = at(p.x + u * c + v * s, p.z - u * s + v * c)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
}

/** How much sand lies under each big toy that stands on the playground (content/layouts.ts): soft ground to land on. */
const SAND_UNDER: Record<string, [number, number]> = { slide: [2.1, 3.3], swing: [3.6, 2.3], 'climbing-frame': [2.7, 2.7] }
const SAND: Patch[] = LAYOUTS.playground.filter((p) => p.kind in SAND_UNDER).map((p) => ({ x: p.x, z: p.z, rx: SAND_UNDER[p.kind]![0], rz: SAND_UNDER[p.kind]![1], yaw: p.yaw ?? 0 }))

/** Whether a spot on the playground is on its sand, the sand grown by `grow` metres. */
const onSand = (x: number, z: number, grow: number) =>
  SAND.some((p) => {
    const dx = x - p.x
    const dz = z - p.z
    const u = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)
    const v = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)
    return (u / (p.rx + grow)) ** 2 + (v / (p.rz + grow)) ** 2 < 1
  })

const SLABS: Record<RoomId, Slab> = {
  playground: {
    half: ROOM_HALF + 1,
    band: palette.grass[1],
    side: palette.dirt,
    paint: (g, at, s, rand) => {
      patches(g, ROOM_HALF + 1, palette.grass, 7, 11)
      // Mown stripes, two metres wide.
      g.fillStyle = 'rgba(255,255,255,0.05)'
      for (let z = -ROOM_HALF - 1; z < ROOM_HALF + 1; z += 4) g.fillRect(0, at(0, z)[1], TEX, 2 * s)
      // From the painting's pixels to the ground's metres.
      const sandy = (x: number, y: number, grow: number) => onSand(x / s - ROOM_HALF - 1, y / s - ROOM_HALF - 1, grow)
      speckle(g, rand, 2600, [palette.grassDark, palette.grass[2], '#9ad86a'], 1.6, 4, (x, y) => !sandy(x, y, 0.3))
      // Every patch's rim first and then every patch's sand, so patches that touch run into one.
      for (const [grow, colour] of [
        [0.25, palette.sandDark],
        [0, palette.sand],
      ] as const) {
        SAND.forEach((p, i) => {
          blob(g, at, p, grow, 5 + i)
          g.fillStyle = colour
          g.fill()
        })
      }
      speckle(g, rand, 1400, [palette.sandDark, '#fff3cf'], 2, 1, (x, y) => sandy(x, y, -0.3))
      // Daisies.
      for (let i = 0; i < 260; i++) {
        const x = rand() * TEX
        const y = rand() * TEX
        if (sandy(x, y, 0.3)) continue
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.arc(x, y, 2.6, 0, TAU)
        g.fill()
        g.fillStyle = '#f5d33b'
        g.beginPath()
        g.arc(x, y, 1.1, 0, TAU)
        g.fill()
      }
    },
  },
  pool: {
    half: ROOM_HALF + 1,
    band: palette.coping,
    side: palette.slabStone,
    paint: (g, at, s, rand) => {
      const half = ROOM_HALF + 1
      const tile = 0.6
      for (let z = -half; z < half; z += tile) {
        for (let x = -half; x < half; x += tile) {
          const [px, py] = at(x, z)
          const odd = (Math.round((x + half) / tile) + Math.round((z + half) / tile)) % 2 === 1
          const c = rgb(odd ? palette.tileAlt : palette.tile).map((v) => Math.round(v - rand() * 6))
          g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
          g.fillRect(px, py, tile * s + 1, tile * s + 1)
        }
      }
      g.strokeStyle = palette.grout
      g.lineWidth = 1.5
      for (let v = -half; v <= half; v += tile) {
        const [px] = at(v, 0)
        const [, py] = at(0, v)
        g.beginPath()
        g.moveTo(px, 0)
        g.lineTo(px, TEX)
        g.moveTo(0, py)
        g.lineTo(TEX, py)
        g.stroke()
      }
      // A blue band of little tiles round the deck's edge.
      g.strokeStyle = palette.basin
      g.lineWidth = 0.3 * s
      const [x0, y0] = at(-half + 0.7, -half + 0.7)
      g.strokeRect(x0, y0, (2 * half - 1.4) * s, (2 * half - 1.4) * s)
    },
  },
  forest: {
    half: ROOM_HALF + 3.5,
    band: palette.moss[1],
    side: palette.dirtDark,
    paint: (g, at, s, rand) => {
      const half = ROOM_HALF + 3.5
      patches(g, half, palette.moss, 5, 31)
      speckle(g, rand, 3000, [palette.mossLight, '#3c7030', '#8a6a3a', '#b5773e'], 1.8, 3, () => true)
      // The path, from the front edge to the back.
      const points: [number, number][] = [
        [2, half],
        [0.5, 9],
        [-2.5, 4.5],
        [-1.5, -0.5],
        [2.2, -5],
        [0.5, -10],
        [-1.5, -half],
      ]
      const trace = () => {
        g.beginPath()
        g.moveTo(...at(...points[0]!))
        for (let i = 1; i < points.length - 1; i++) {
          const [mx, my] = at((points[i]![0] + points[i + 1]![0]) / 2, (points[i]![1] + points[i + 1]![1]) / 2)
          g.quadraticCurveTo(...at(...points[i]!), mx, my)
        }
        g.lineTo(...at(...points[points.length - 1]!))
      }
      g.lineCap = 'round'
      g.lineJoin = 'round'
      trace()
      g.strokeStyle = palette.pathDark
      g.lineWidth = 2.4 * s
      g.stroke()
      trace()
      g.strokeStyle = palette.path
      g.lineWidth = 1.9 * s
      g.stroke()
      // Mud round the pond.
      for (const w of ROOM_GEO.forest.water) {
        if (w.kind !== 'circle') continue
        const [px, py] = at(w.x, w.z)
        g.strokeStyle = 'rgba(70,52,30,0.55)'
        g.lineWidth = 0.7 * s
        g.beginPath()
        g.arc(px, py, (w.r + 0.25) * s, 0, TAU)
        g.stroke()
      }
    },
  },
}

/** The painted top: the slab's square with the water cut out, its texture laid flat over the whole slab. */
function topGeometry(half: number, water: Water[]): BufferGeometry {
  // Drawn in (x, -z) and laid down, so a hole at world z is cut at -z.
  const outline = new Shape().moveTo(-half, -half).lineTo(half, -half).lineTo(half, half).lineTo(-half, half)
  for (const w of water) {
    const hole = new Path()
    if (w.kind === 'rect') {
      hole.moveTo(w.x0, -w.z0)
      hole.lineTo(w.x0, -w.z1)
      hole.lineTo(w.x1, -w.z1)
      hole.lineTo(w.x1, -w.z0)
    } else {
      for (let i = 0; i <= ROUND; i++) {
        const a = (i / ROUND) * TAU
        if (i === 0) hole.moveTo(w.x + Math.sin(a) * w.r, -(w.z + Math.cos(a) * w.r))
        else hole.lineTo(w.x + Math.sin(a) * w.r, -(w.z + Math.cos(a) * w.r))
      }
    }
    outline.holes.push(hole)
  }
  const g = new ShapeGeometry(outline).rotateX(-Math.PI / 2)
  const pos = g.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + half) / (2 * half)
    uv[i * 2 + 1] = (half - pos.getZ(i)) / (2 * half)
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return g
}

function paintTop(room: RoomId): CanvasTexture {
  const slab = SLABS[room]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEX
  const g = canvas.getContext('2d')!
  const s = TEX / (2 * slab.half)
  slab.paint(g, (x, z) => [(x + slab.half) * s, (z + slab.half) * s], s, mulberry32(101))
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ------------------------------------------------------------------------------ scattered things

/** One of many copies: where, how big (and how tall), which way round, which colour. */
interface Copy {
  x: number
  y: number
  z: number
  s: number
  h: number
  yaw: number
  color: string
}

const scratch = new Object3D()
const tint = new Color()

/** Many copies of one shape in one draw, set once. */
function Scatter({ geometry, copies, shadow }: { geometry: BufferGeometry; copies: Copy[]; shadow: boolean }) {
  const mesh = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = mesh.current
    copies.forEach((c, i) => {
      scratch.position.set(c.x, c.y, c.z)
      scratch.rotation.set(0, c.yaw, 0)
      scratch.scale.set(c.s, c.h, c.s)
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
      m.setColorAt(i, tint.set(c.color))
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
    m.computeBoundingSphere()
  }, [copies])
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, copies.length]} castShadow={shadow} receiveShadow>
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  )
}

/** Shapes with their foot at the origin, about a metre tall, so a copy's scale is its size. */
const SHAPES = {
  tuft: new ConeGeometry(0.1, 1, 3).translate(0, 0.5, 0),
  bloom: new SphereGeometry(0.5, 6, 5).translate(0, 0.5, 0),
  trunk: new CylinderGeometry(0.14, 0.2, 1, 6).translate(0, 0.5, 0),
  tier: new ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  crown: new IcosahedronGeometry(1, 0).translate(0, 1, 0),
  rock: new DodecahedronGeometry(0.5, 0).translate(0, 0.25, 0),
  reed: new CylinderGeometry(0.02, 0.035, 1, 4).translate(0, 0.5, 0),
  fern: new ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0),
}

/** Spots all over the slab, kept off what `avoid` says, the same every visit. */
function scatter(seed: number, count: number, half: number, avoid: (x: number, z: number) => boolean, make: (x: number, z: number, rand: () => number) => Copy): Copy[] {
  const rand = mulberry32(seed)
  const out: Copy[] = []
  for (let tries = 0; tries < count * 20 && out.length < count; tries++) {
    const x = (rand() * 2 - 1) * half
    const z = (rand() * 2 - 1) * half
    if (!avoid(x, z)) out.push(make(x, z, rand))
  }
  return out
}

/** How near the camera's side of the slab a spot is: -1 on the far edges, 1 on the near ones. Tall trees go far, low bushes near, so nothing hides the room. */
const nearness = (x: number, z: number, half: number) => (x * Math.sin(CAMERA_YAW) + z * Math.cos(CAMERA_YAW)) / half

const pick = <T,>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)]!

// ------------------------------------------------------------------------------ the water

/** The water's top now, for the room the world is in, and how full it is. */
const surfaceOf = (w: World) => ({ top: waterTop(w), full: terrainOf(w, w.room).water })

/** A sheet of facets over the water's shape that rocks gently: its corners bob on crossing waves at the water's height now, in its colour (eased), gone when the water is. */
function Surface({ water, colour, clock, world }: { water: Water; colour: string; clock: Clock; world: () => World }) {
  const mesh = useRef<Mesh>(null!)
  const shown = useMemo(() => new Color(colour), [colour])
  const want = useMemo(() => new Color(), [])
  const { geometry, base } = useMemo(() => {
    const g = water.kind === 'rect' ? new PlaneGeometry(water.x1 - water.x0, water.z1 - water.z0, Math.round((water.x1 - water.x0) * 2), Math.round((water.z1 - water.z0) * 2)).rotateX(-Math.PI / 2).translate((water.x0 + water.x1) / 2, 0, (water.z0 + water.z1) / 2) : new RingGeometry(0.001, water.r, ROUND, 6).rotateX(-Math.PI / 2).translate(water.x, 0, water.z)
    return { geometry: g, base: Float32Array.from(g.getAttribute('position').array) }
  }, [water])
  useFrame((_, delta) => {
    const w = world()
    const { top, full } = surfaceOf(w)
    const m = mesh.current
    m.visible = full > 0.02
    if (!m.visible) return
    const t = clock.t
    // A low puddle barely rocks.
    const rock = 0.035 * Math.min(1, full * 3)
    const pos = geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!
      const z = base[i * 3 + 2]!
      pos.setY(i, top + (rock * (Math.sin(x * 1.4 + t * 1.5) + Math.sin(z * 1.9 - t * 1.1) + Math.sin((x - z) * 0.8 + t * 2))) / 3)
    }
    pos.needsUpdate = true
    const own = terrainOf(w, w.room).waterColor
    want.set(own === null ? colour : colorOf(own))
    shown.lerp(want, 1 - Math.exp(-4 * Math.min(delta, 0.1)))
    ;(m.material as MeshStandardMaterial).color.copy(shown)
  })
  return (
    <mesh ref={mesh} geometry={geometry} receiveShadow>
      <meshStandardMaterial color={colour} transparent opacity={0.62} flatShading roughness={0.2} metalness={0.1} depthWrite={false} />
    </mesh>
  )
}

/** The pool's floor: blue tiles and dark lane lines. */
function poolFloorTexture(w: number, d: number): CanvasTexture {
  const s = 48
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(d * s)
  const g = canvas.getContext('2d')!
  g.fillStyle = palette.basin
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += s * 0.3) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, canvas.height)
    g.stroke()
  }
  for (let y = 0; y <= canvas.height; y += s * 0.3) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(canvas.width, y)
    g.stroke()
  }
  g.fillStyle = palette.lane
  for (let k = 1; k < 4; k++) g.fillRect(s * 1, (canvas.height * k) / 4 - s * 0.12, canvas.width - s * 2, s * 0.24)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

/** A basin cut into the slab: its walls down to the floor, the floor, and the water's surface over it. */
function Basin({ water, floor, room, clock, world }: { water: Water; floor: number; room: RoomId; clock: Clock; world: () => World }) {
  const pool = room === 'pool'
  const wall = pool ? palette.basinDark : palette.pondWall
  const floorMap = useMemo(() => (pool && water.kind === 'rect' ? poolFloorTexture(water.x1 - water.x0, water.z1 - water.z0) : null), [pool, water])
  if (water.kind === 'rect') {
    const w = water.x1 - water.x0
    const d = water.z1 - water.z0
    const cx = (water.x0 + water.x1) / 2
    const cz = (water.z0 + water.z1) / 2
    const walls: [number, number, number, number][] = [
      [water.x0, cz, Math.PI / 2, d],
      [water.x1, cz, -Math.PI / 2, d],
      [cx, water.z0, 0, w],
      [cx, water.z1, Math.PI, w],
    ]
    return (
      <group>
        {walls.map(([x, z, yaw, len], i) => (
          <mesh key={i} position={[x, floor / 2, z]} rotation={[0, yaw, 0]} receiveShadow>
            <planeGeometry args={[len, -floor]} />
            <Flat color={wall} />
          </mesh>
        ))}
        <mesh position={[cx, floor, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          {floorMap === null ? <Flat color={palette.pondFloor} /> : <meshStandardMaterial map={floorMap} roughness={0.8} />}
        </mesh>
        {/* The coping: a raised white rim round the water. */}
        {[
          [cx, water.z0 - 0.2, w + 0.8, 0.4],
          [cx, water.z1 + 0.2, w + 0.8, 0.4],
          [water.x0 - 0.2, cz, 0.4, d],
          [water.x1 + 0.2, cz, 0.4, d],
        ].map(([x, z, sx, sz], i) => (
          <mesh key={`c${i}`} position={[x!, 0.04, z!]} castShadow receiveShadow>
            <boxGeometry args={[sx!, 0.08, sz!]} />
            <Flat color={palette.coping} />
          </mesh>
        ))}
        <Surface water={water} colour={palette.water} clock={clock} world={world} />
      </group>
    )
  }
  return (
    <group>
      <mesh position={[water.x, floor / 2, water.z]} receiveShadow>
        <cylinderGeometry args={[water.r, water.r, -floor, ROUND, 1, true]} />
        <meshStandardMaterial color={wall} flatShading roughness={0.9} side={BackSide} />
      </mesh>
      <mesh position={[water.x, floor + 0.001, water.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[water.r, ROUND]} />
        <Flat color={palette.pondFloor} />
      </mesh>
      <Surface water={water} colour={palette.pond} clock={clock} world={world} />
      <Pondside water={water} clock={clock} world={world} />
    </group>
  )
}

/** Lily pads that bob on the pond (sinking with it, gone when it is), one with a flower, reeds at the back and stones round the edge. */
function Pondside({ water, clock, world }: { water: Water & { kind: 'circle' }; clock: Clock; world: () => World }) {
  const pads = useRef<Mesh[]>([])
  const flower = useRef<Mesh>(null!)
  const spots = useMemo(() => {
    const rand = mulberry32(77)
    return Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * TAU + rand()
      const r = water.r * (0.25 + rand() * 0.45)
      return { x: water.x + Math.cos(a) * r, z: water.z + Math.sin(a) * r, yaw: rand() * TAU, s: 0.32 + rand() * 0.18 }
    })
  }, [water])
  const shore = useMemo(() => {
    const rand = mulberry32(78)
    const copies: Copy[] = []
    for (let i = 0; i < 22; i++) {
      const a = rand() * TAU
      const r = water.r + 0.05 + rand() * 0.35
      copies.push({ x: water.x + Math.cos(a) * r, y: -0.05, z: water.z + Math.sin(a) * r, s: 0.35 + rand() * 0.4, h: 0.5 + rand() * 0.5, yaw: rand() * TAU, color: pick([palette.rock, palette.rockDark, '#b9b2a8'], rand) })
    }
    return copies
  }, [water])
  const reeds = useMemo(() => {
    const rand = mulberry32(79)
    const copies: Copy[] = []
    for (let i = 0; i < 26; i++) {
      // At the far side of the pond from the camera, so they stand behind the water.
      const a = CAMERA_YAW + (rand() - 0.5) * 2.2
      const r = water.r - 0.1 + rand() * 0.5
      copies.push({ x: water.x - Math.sin(a) * r, y: WATER_Y, z: water.z - Math.cos(a) * r, s: 1, h: 0.7 + rand() * 0.7, yaw: 0, color: pick(['#5f9e48', '#79b55a', '#8a7a3a'], rand) })
    }
    return copies
  }, [water])
  useFrame(() => {
    const t = clock.t
    const { top, full } = surfaceOf(world())
    pads.current.forEach((m, i) => {
      const s = spots[i]!
      m.visible = full > 0.02
      m.position.y = top + 0.02 + 0.02 * Math.sin(t * 1.3 + i * 1.7)
      m.rotation.z = s.yaw + 0.1 * Math.sin(t * 0.4 + i)
    })
    flower.current.visible = full > 0.02
    flower.current.position.y = top + 0.1
  })
  return (
    <>
      {spots.map((s, i) => (
        <mesh key={i} ref={(el) => void (el && (pads.current[i] = el))} position={[s.x, WATER_Y + 0.02, s.z]} rotation={[-Math.PI / 2, 0, s.yaw]} receiveShadow>
          <circleGeometry args={[s.s, 12, 0.5, TAU - 0.7]} />
          <meshStandardMaterial color={palette.lily} flatShading roughness={0.8} side={DoubleSide} />
        </mesh>
      ))}
      <mesh ref={flower} position={[spots[0]!.x, WATER_Y + 0.1, spots[0]!.z]} castShadow>
        <sphereGeometry args={[0.12, 6, 4]} />
        <Flat color="#ff9ccf" />
      </mesh>
      <Scatter geometry={SHAPES.rock} copies={shore} shadow />
      <Scatter geometry={SHAPES.reed} copies={reeds} shadow />
    </>
  )
}

// ------------------------------------------------------------------------------ each room's own furniture

/** A low white picket fence just inside the slab's edge, with a gap at the front to come in by. */
function Fence({ half }: { half: number }) {
  const { pickets, rails } = useMemo(() => {
    const e = half - 0.4
    const copies: Copy[] = []
    const railList: BufferGeometry[] = []
    for (const [x0, z0, x1, z1] of [
      [-e, -e, e, -e],
      [e, -e, e, e],
      [e, e, -e, e],
      [-e, e, -e, -e],
    ] as const) {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const n = Math.round(len / 0.32)
      const yaw = Math.atan2(x1 - x0, z1 - z0)
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n
        const z = z0 + ((z1 - z0) * i) / n
        if (z > e - 0.1 && Math.abs(x) < 1.6) continue
        copies.push({ x, y: 0, z, s: 1, h: 1, yaw, color: palette.fence })
      }
      for (const y of [0.2, 0.42]) railList.push(new BoxGeometry(0.05, 0.06, len).rotateY(yaw).translate((x0 + x1) / 2, y, (z0 + z1) / 2))
    }
    return { pickets: copies, rails: mergeGeometries(railList)! }
  }, [half])
  return (
    <>
      <Scatter geometry={PICKET} copies={pickets} shadow />
      <mesh geometry={rails} castShadow receiveShadow>
        <Flat color={palette.fenceShade} />
      </mesh>
    </>
  )
}

const PICKET = mergeGeometries([new BoxGeometry(0.12, 0.5, 0.04).translate(0, 0.25, 0), new ConeGeometry(0.085, 0.12, 4).rotateY(Math.PI / 4).scale(1, 1, 0.33).translate(0, 0.56, 0)].map((g) => g.toNonIndexed()))!

/** The forest's ring of trees beyond the room's edge: tall pines and leafy trees behind, low bushes in front. */
function TreeRing({ half }: { half: number }) {
  const { trunks, tiers, crowns, ferns } = useMemo(() => {
    const out = { trunks: [] as Copy[], tiers: [] as Copy[], crowns: [] as Copy[], ferns: [] as Copy[] }
    const rand = mulberry32(55)
    const edge = ROOM_HALF + 0.7
    const taken: { x: number; z: number }[] = []
    for (let i = 0; i < 2400 && taken.length < 420; i++) {
      const x = (rand() * 2 - 1) * (half - 0.4)
      const z = (rand() * 2 - 1) * (half - 0.4)
      if (Math.max(Math.abs(x), Math.abs(z)) < edge || taken.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 1.2)) continue
      taken.push({ x, z })
      const near = Math.min(1, Math.max(0, (nearness(x, z, half) + 0.2) / 0.8))
      const size = (1 - near) * (0.8 + rand() * 0.5) + near * (0.3 + rand() * 0.2)
      const yaw = rand() * TAU
      if (near > 0.6) {
        out.crowns.push({ x, y: -0.3, z, s: 0.7 + rand() * 0.4, h: 0.55 + rand() * 0.25, yaw, color: pick(palette.leaves, rand) })
      } else if (rand() < 0.6) {
        out.trunks.push({ x, y: 0, z, s: size, h: 1.4 * size, yaw, color: palette.trunk })
        for (let k = 0; k < 3; k++) out.tiers.push({ x, y: (1 + k * 1.15) * size, z, s: (1.5 - k * 0.38) * size, h: 1.9 * size, yaw: yaw + k, color: pick(palette.pine, rand) })
      } else {
        out.trunks.push({ x, y: 0, z, s: size * 1.1, h: 2.2 * size, yaw, color: palette.trunk })
        out.crowns.push({ x, y: 1.6 * size, z, s: 1.5 * size, h: 1.3 * size, yaw, color: pick(palette.leaves, rand) })
      }
    }
    out.ferns = scatter(56, 160, half - 0.3, (x, z) => Math.max(Math.abs(x), Math.abs(z)) < edge - 1.2 || ROOM_GEO.forest.water.some((w) => w.kind === 'circle' && Math.hypot(x - w.x, z - w.z) < w.r + 0.8), (x, z, r) => ({ x, y: 0, z, s: 0.5 + r() * 0.4, h: 0.35 + r() * 0.25, yaw: r() * TAU, color: pick(['#3f8e46', '#4fa04a', '#2f7a3a'], r) }))
    return out
  }, [half])
  return (
    <>
      <Scatter geometry={SHAPES.trunk} copies={trunks} shadow />
      <Scatter geometry={SHAPES.tier} copies={tiers} shadow />
      <Scatter geometry={SHAPES.crown} copies={crowns} shadow />
      <Scatter geometry={SHAPES.fern} copies={ferns} shadow={false} />
    </>
  )
}

/** Grass tufts and little flowers over the playground's lawn, off the sandpit: a few, so the lawn reads as open (Sami, 2026-11-09: a fifth of what there was). */
function Lawn({ half }: { half: number }) {
  const { tufts, blooms } = useMemo(() => {
    const off = (x: number, z: number) => onSand(x, z, 0.4) || Math.max(Math.abs(x), Math.abs(z)) > half - 0.6
    return {
      tufts: scatter(21, 140, half, off, (x, z, r) => ({ x, y: 0, z, s: 0.9 + r() * 0.6, h: 0.25 + r() * 0.2, yaw: r() * TAU, color: pick([palette.grass[2], palette.grassDark, '#93d66a'], r) })),
      blooms: scatter(22, 36, half, off, (x, z, r) => ({ x, y: 0, z, s: 0.16 + r() * 0.06, h: 0.16 + r() * 0.06, yaw: 0, color: pick(palette.blooms, r) })),
    }
  }, [half])
  return (
    <>
      <Scatter geometry={SHAPES.tuft} copies={tufts} shadow={false} />
      <Scatter geometry={SHAPES.bloom} copies={blooms} shadow={false} />
    </>
  )
}

// ------------------------------------------------------------------------------ the room

const tops = new Map<RoomId, { geometry: BufferGeometry; map: CanvasTexture }>()

/** A colour washed over the room's ground, easing in and out (white snow, a blue lawn), over the painted top with the water's holes. */
function Wash({ geometry, world }: { geometry: BufferGeometry; world: () => World }) {
  const mesh = useRef<Mesh>(null!)
  const shown = useMemo(() => ({ color: new Color('#ffffff'), want: new Color(), amount: 0 }), [])
  useFrame((_, delta) => {
    const w = world()
    const want = terrainOf(w, w.room).ground
    const k = 1 - Math.exp(-3 * Math.min(delta, 0.1))
    if (want !== null) shown.color.lerp(shown.want.set(colorOf(want)), shown.amount < 0.01 ? 1 : k)
    shown.amount += ((want === null ? 0 : 1) - shown.amount) * k
    const m = mesh.current
    m.visible = shown.amount > 0.01
    const mat = m.material as MeshStandardMaterial
    mat.color.copy(shown.color)
    mat.opacity = 0.72 * shown.amount
  })
  return (
    <mesh ref={mesh} geometry={geometry} position={[0, 0.012, 0]} receiveShadow visible={false}>
      <meshStandardMaterial transparent opacity={0} roughness={0.95} depthWrite={false} />
    </mesh>
  )
}

function RoomGround({ room, clock, world }: { room: RoomId; clock: Clock; world: () => World }) {
  const slab = SLABS[room]
  const geo = ROOM_GEO[room]
  let top = tops.get(room)
  if (top === undefined) {
    top = { geometry: topGeometry(slab.half, geo.water), map: paintTop(room) }
    tops.set(room, top)
  }
  const tube = (r: number) => [r * Math.SQRT2, r * Math.SQRT2] as const
  return (
    <group>
      <mesh geometry={top.geometry} receiveShadow>
        <meshStandardMaterial map={top.map} roughness={0.95} />
      </mesh>
      <Wash geometry={top.geometry} world={world} />
      {/* The slab's sides: an open square tube, a band of the top's colour over dirt or stone. */}
      <mesh position={[0, -BAND / 2, 0]} rotation={[0, Math.PI / 4, 0]} receiveShadow>
        <cylinderGeometry args={[...tube(slab.half), BAND, 4, 1, true]} />
        <Flat color={slab.band} />
      </mesh>
      <mesh position={[0, -BAND - (DEPTH - BAND) / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[...tube(slab.half), DEPTH - BAND, 4, 1, true]} />
        <Flat color={slab.side} />
      </mesh>
      {geo.water.map((w, i) => (
        <Basin key={i} water={w} floor={geo.floor} room={room} clock={clock} world={world} />
      ))}
      {room === 'playground' && (
        <>
          <Fence half={slab.half} />
          <Lawn half={slab.half} />
        </>
      )}
      {room === 'forest' && <TreeRing half={slab.half} />}
    </group>
  )
}

/** The ground of whichever room everybody is in. */
export function Ground({ source, clock }: { source: SceneSource; clock: Clock }) {
  const room = useLive(() => source.world.room)
  const world = useMemo(() => () => source.world, [source])
  return <RoomGround key={room} room={room} clock={clock} world={world} />
}
