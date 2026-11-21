import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderChunk,
  SphereGeometry,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import {
  BRIDGE,
  ENTRY,
  FLOOR_DIGS,
  FOREST_RING,
  GRAVEL_HEAP,
  HOLES,
  HOME,
  HUT,
  LOTS,
  PALLET_RING,
  PLACES,
  PLANTS,
  PLAYGROUND,
  POND_AT,
  PROPS,
  READY_ROADS,
  RIVER,
  ROAD_WIDTH,
  ROADS,
  ROCK_PILE,
  SAND_HILL,
  SANDPIT,
  TIP_RINGS,
  TOWER_AT,
  TREES,
  WATER_COLUMN,
  WATER_RING,
} from '../game/map'
import { CELL, CHUNK, CHUNKS, GRID, HALF, SIDE } from '../game/model'
import type { Terrain } from '../game/model'
import { clamp, mulberry32, smooth } from '../game/math'
import { heightAt } from '../game/terrain'
import { latticeNoise, patchShader, STONE } from './Ground'

type V3 = readonly [number, number, number]

// ---------------------------------------------------------------------------------------
// A small kit: pieces merged into one vertex-coloured geometry. `tint` says how much of an
// instance's colour a piece takes, so a tree's trunk keeps its brown while its crown changes.

interface Piece {
  geo: BufferGeometry
  colour: string
  tint: number
  m: Matrix4
}

interface Opts {
  rot?: V3
  scale?: V3
  tint?: number
}

const compose = (at: V3, rot: V3, scale: V3) => new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale))

const piece = (geo: BufferGeometry, colour: string, at: V3, o: Opts): Piece => ({ geo, colour, tint: o.tint ?? 0, m: compose(at, o.rot ?? [0, 0, 0], o.scale ?? [1, 1, 1]) })

const box = (w: number, h: number, d: number, colour: string, at: V3, o: Opts = {}) => piece(new BoxGeometry(w, h, d), colour, at, o)
const ball = (r: number, colour: string, at: V3, o: Opts = {}, seg = 10) => piece(new SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), colour, at, o)
/** A cylinder along y with the top radius `rt` and the bottom radius `rb`; a cone when `rt` is 0. */
const cyl = (rt: number, rb: number, h: number, colour: string, at: V3, o: Opts = {}, seg = 12) => piece(new CylinderGeometry(rt, rb, h, seg), colour, at, o)
/** A cone along y with its tip up and no base, `seg` sides: `seg` triangles. */
const spike = (r: number, h: number, seg: number, colour: string, at: V3, o: Opts = {}) => piece(new CylinderGeometry(0, r, h, seg, 1, true), colour, at, o)
/** A flat board `w` by `h` facing +z, seen from both sides: 4 triangles. */
const board = (w: number, h: number, colour: string, at: V3, o: Opts = {}): Piece[] => [piece(new PlaneGeometry(w, h), colour, at, o), piece(new PlaneGeometry(w, h), colour, at, { ...o, rot: [0, Math.PI, 0] })]
/** A roof's prism along x: `len` long, `width` across at the base, `height` high, its base on y = at.y. */
const prism = (len: number, width: number, height: number, colour: string, at: V3) =>
  piece(new CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2), colour, [at[0], at[1] + height / 3, at[2]], { scale: [len, height / 1.5, width / 1.732] })

/** The pieces moved to (x, y, z) and turned by `yaw`. */
function place(pieces: readonly Piece[], x: number, y: number, z: number, yaw: number): Piece[] {
  const at = compose([x, y, z], [0, yaw, 0], [1, 1, 1])
  return pieces.map((p) => ({ ...p, m: at.clone().multiply(p.m) }))
}

function merge(pieces: readonly Piece[]): BufferGeometry {
  const parts = pieces.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()
    g.deleteAttribute('uv')
    g.applyMatrix4(p.m)
    const n = g.attributes.position.count
    const c = new Color(p.colour)
    g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3))
    g.setAttribute('aTint', new Float32BufferAttribute(new Float32Array(n).fill(p.tint), 1))
    return g
  })
  const merged = mergeGeometries(parts, false)
  if (merged === null) throw new Error('scenery: pieces have different attributes')
  return merged
}

function tintShader(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = patchShader(shader.vertexShader, '#include <common>', '#include <common>\nattribute float aTint;')
  shader.vertexShader = patchShader(
    shader.vertexShader,
    '#include <color_vertex>',
    patchShader(ShaderChunk.color_vertex, 'vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);'),
  )
}

/** Matte vertex colours; an instance's colour reaches a vertex by its `aTint`. */
function propMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.15 })
  m.onBeforeCompile = tintShader
  m.customProgramCacheKey = () => 'digger-town-prop'
  return m
}
/** Instanced shapes, every instance with a colour; a plain mesh has its own, so three never re-reads the program between them. */
const PROP = propMaterial()
const PROP_MESH = propMaterial()
const WHITE = new Color('#ffffff')

// ---------------------------------------------------------------------------------------
// Instances.

interface Item {
  x: number
  y: number
  z: number
  yaw: number
  sx: number
  sy: number
  sz: number
  colour: Color | null
}

const item = (x: number, y: number, z: number, yaw: number, s: number, colour: Color | null = null, squash = 1): Item => ({ x, y, z, yaw, sx: s, sy: s * squash, sz: s, colour })

const dummy = new Object3D()

function setItem(mesh: InstancedMesh, k: number, it: Item): void {
  dummy.position.set(it.x, it.y, it.z)
  dummy.rotation.set(0, it.yaw, 0)
  dummy.scale.set(it.sx, it.sy, it.sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(k, dummy.matrix)
  mesh.setColorAt(k, it.colour ?? WHITE)
}

function instancesOf(geometry: BufferGeometry, material: MeshStandardMaterial, items: readonly Item[]): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, items.length)
  items.forEach((it, k) => setItem(mesh, k, it))
  mesh.frustumCulled = false
  return mesh
}

/** One draw call for a list of placed copies of a shape. */
function Instances({ name, geometry, items, material = PROP, cast = false }: { name: string; geometry: BufferGeometry; items: readonly Item[]; material?: MeshStandardMaterial; cast?: boolean }) {
  const mesh = useMemo(() => instancesOf(geometry, material, items), [geometry, material, items])
  useEffect(() => () => mesh.dispose(), [mesh])
  return <primitive object={mesh} name={name} castShadow={cast} receiveShadow />
}

// ---------------------------------------------------------------------------------------
// Where things may stand: the places of map.ts, as circles, strips and rectangles.

interface Circle {
  x: number
  z: number
  r: number
}

const CIRCLES: readonly Circle[] = [
  SAND_HILL,
  ROCK_PILE,
  ...HOLES,
  SANDPIT,
  POND_AT,
  { x: HUT.x, z: HUT.z, r: HUT.r + 3 },
  { x: WATER_COLUMN.x, z: WATER_COLUMN.z, r: WATER_COLUMN.r + 2 },
  { x: GRAVEL_HEAP.x, z: GRAVEL_HEAP.z, r: 4 },
  FOREST_RING,
  WATER_RING,
  PALLET_RING,
  { x: TOWER_AT.x, z: TOWER_AT.z, r: 4 },
  ...Object.values(PLANTS).flatMap((p) => [{ x: p.x, z: p.z, r: p.r + 1.5 }, p.ring]),
  ...TIP_RINGS,
  ...Object.values(PLACES),
  ...FLOOR_DIGS.map((f) => ({ x: f.park.x, z: f.park.z, r: 4 })),
  ...Object.values(HOME).map((h) => ({ x: h.x, z: h.z, r: 4 })),
  ...Object.values(ENTRY).map((h) => ({ x: h.x, z: h.z, r: 4 })),
]

/** True where a flower or tuft may grow: off the roads, the hill, the lots, the rings and the places machines work. */
function onGrass(x: number, z: number): boolean {
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + 1) return false
  for (const l of LOTS) if (Math.abs(x - l.x) < l.w / 2 + 1.5 && Math.abs(z - l.z) < l.d / 2 + 1.5) return false
  if (Math.abs(x - PLAYGROUND.x) < PLAYGROUND.w / 2 + 1.5 && Math.abs(z - PLAYGROUND.z) < PLAYGROUND.d / 2 + 1.5) return false
  if (z > RIVER.z0 - 1.6 && z < RIVER.z1 + 1.6) return false
  if (Math.abs(x - BRIDGE.x) < 5 && z > BRIDGE.z0 - 6 && z < BRIDGE.z1 + 6) return false
  for (const r of [...ROADS, ...READY_ROADS]) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az)
    const ux = (r.bx - r.ax) / len
    const uz = (r.bz - r.az) / len
    const along = (x - r.ax) * ux + (z - r.az) * uz
    const across = Math.abs(-(x - r.ax) * uz + (z - r.az) * ux)
    if (along > -1 && along < len + 1 && across < ROAD_WIDTH / 2 + 1.2) return false
  }
  return true
}

/** True where a tree of the forest may stand: beyond the map's edge, off the river and the road running on. */
function inForest(x: number, z: number): boolean {
  if (Math.abs(x) < HALF + 2 && Math.abs(z) < HALF + 2) return false
  if (z > RIVER.z0 - 4 && z < RIVER.z1 + 4) return false
  if (Math.abs(x) > HALF && Math.abs(z - READY_ROADS[0].az) < ROAD_WIDTH / 2 + 4) return false
  return true
}

// ---------------------------------------------------------------------------------------
// Trees.

const GREENS = ['#58b84e', '#6cc558', '#7ed25f', '#4fae4f', '#8ad45e', '#62bf62'].map((c) => new Color(c))
const BLOSSOM = ['#ffb3c9', '#ffd27a', '#f59a4a'].map((c) => new Color(c))

/** A crown colour: mostly greens, now and then a pink or golden one. */
function crownColour(rand: () => number): Color {
  return rand() < 0.1 ? BLOSSOM[Math.floor(rand() * BLOSSOM.length)] : GREENS[Math.floor(rand() * GREENS.length)]
}

const NEAR_TREE = merge([
  cyl(0.15, 0.24, 1.3, '#8a5a36', [0, 0.65, 0], {}, 6),
  ball(1.2, '#ffffff', [0, 2.35, 0], { tint: 1, scale: [1, 0.92, 1] }, 9),
  ball(0.85, '#e4e4e4', [0.85, 1.8, 0.25], { tint: 1 }, 7),
  ball(0.8, '#e4e4e4', [-0.8, 1.85, -0.3], { tint: 1 }, 7),
])

const FAR_TREE = merge([ball(1.4, '#ffffff', [0, 1.5, 0], { tint: 1, scale: [1, 1.15, 1] }, 6)])

/** The forest's trees: near the edge detailed, beyond it plain, dense with a few clearings. */
function forestItems(terrain: Terrain): { near: Item[]; far: Item[] } {
  const rand = mulberry32(31)
  const near: Item[] = []
  const far: Item[] = []
  for (const [x, z, r] of TREES) {
    near.push(item(x, heightAt(terrain, x, z), z, rand() * 6.28, 0.8 + r * 0.45, crownColour(rand)))
  }
  const step = 9
  const reach = 125
  for (let gz = -reach; gz < reach; gz += step) {
    for (let gx = -reach; gx < reach; gx += step) {
      const x = gx + (rand() - 0.5) * step * 0.9
      const z = gz + (rand() - 0.5) * step * 0.9
      if (!inForest(x, z)) continue
      const d = Math.max(Math.abs(x), Math.abs(z)) - HALF
      const dense = 1 - smooth(55, 80, d) * 0.5
      const patchy = 0.45 + 0.75 * latticeNoise(x / 14, z / 14, Infinity, 3)
      if (rand() > dense * patchy) continue
      const it = item(x, 0, z, rand() * 6.28, d < 10 ? 1 + rand() * 0.6 : 1.2 + rand() * 1.0, crownColour(rand))
      if (d < 10) near.push(it)
      else far.push(it)
    }
  }
  return { near, far }
}

// ---------------------------------------------------------------------------------------
// The ring of far hills.

function hillGeometry(): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const segments = 180
  const rings = 6
  const c = new Color()
  const layers = [
    { rIn: 112, rOut: 190, peak: 28, seed: 41, low: '#6fbf6a', high: '#9ad67e' },
    { rIn: 150, rOut: 280, peak: 62, seed: 43, low: '#7cb98a', high: '#a9d4a0' },
  ]
  for (const L of layers) {
    const at = (s: number, k: number) => {
      const a = (s / segments) * Math.PI * 2
      const t = k / rings
      const n = latticeNoise(Math.cos(a) * 3.2 + 20, Math.sin(a) * 3.2 + 20, Infinity, L.seed)
      const n2 = latticeNoise(Math.cos(a) * 7.5 + 50, Math.sin(a) * 7.5 + 50, Infinity, L.seed + 1)
      const peak = L.peak * (0.35 + 0.65 * n) * (0.8 + 0.4 * n2)
      const shape = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.1)
      const y = -4 + (peak + 4) * shape
      const r = L.rIn + (L.rOut - L.rIn) * t
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, h: clamp(shape * (0.5 + 0.5 * n), 0, 1) }
    }
    for (let s = 0; s < segments; s++) {
      for (let k = 0; k < rings; k++) {
        const p = [at(s, k), at(s + 1, k), at(s + 1, k + 1), at(s, k + 1)]
        for (const i of [0, 2, 1, 0, 3, 2]) {
          pos.push(p[i].x, p[i].y, p[i].z)
          c.set(L.low).lerp(new Color(L.high), p[i].h)
          col.push(c.r, c.g, c.b)
        }
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

const HILL_MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.1, side: DoubleSide })
// The haze never swallows the hills: at most this much of the fog colour.
const HILL_HAZE = 0.62
HILL_MATERIAL.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader = patchShader(
    shader.fragmentShader,
    '#include <fog_fragment>',
    `#ifdef USE_FOG\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(smoothstep(fogNear, fogFar, vFogDepth), ${HILL_HAZE.toFixed(2)}));\n#endif`,
  )
}
HILL_MATERIAL.customProgramCacheKey = () => 'digger-town-hills'

function Hills() {
  const geometry = useMemo(hillGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={HILL_MATERIAL} frustumCulled={false} />
}

// ---------------------------------------------------------------------------------------
// Flowers and tufts on the grass: they keep to turf, sit on the ground and go where it is dug.

// A stem, a flat six-sided head and a yellow middle: 13 triangles.
const FLOWER = merge([spike(0.02, 0.34, 3, '#4f9a3a', [0, 0.17, 0]), spike(0.15, 0.06, 6, '#ffffff', [0, 0.36, 0], { tint: 1 }), spike(0.06, 0.07, 4, '#ffcf3a', [0, 0.4, 0])])

const TUFT = merge(
  [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2
    const lean = 0.35
    return spike(0.035, 0.34 + (k % 2) * 0.1, 3, '#ffffff', [Math.cos(a) * 0.04, 0.17, Math.sin(a) * 0.04], { tint: 1, rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean] })
  }),
)

const FLOWER_COLOURS = ['#ff7fb0', '#ffe14d', '#ffffff', '#b99cff', '#ff7a59', '#8fc4ff'].map((c) => new Color(c))
const TUFT_COLOURS = ['#4aa63c', '#5cb848', '#76c654', '#8bd05c'].map((c) => new Color(c))

const CHUNK_SIZE = CHUNK * CELL
const chunkOf = (x: number, z: number) => clamp(Math.floor((x + HALF) / CHUNK_SIZE), 0, CHUNKS - 1) + clamp(Math.floor((z + HALF) / CHUNK_SIZE), 0, CHUNKS - 1) * CHUNKS

interface Grown extends Item {
  chunk: number
}

/** Candidate spots on a jittered grid, thinned by a slow noise so they grow in drifts. */
function grownItems(terrain: Terrain, step: number, reach: number, seed: number, wanted: (x: number, z: number, rand: () => number) => boolean, colours: readonly Color[], size: [number, number]): Grown[] {
  const rand = mulberry32(seed)
  const out: Grown[] = []
  for (let gz = -reach; gz < reach; gz += step) {
    for (let gx = -reach; gx < reach; gx += step) {
      const x = gx + rand() * step
      const z = gz + rand() * step
      if (!onGrass(x, z) || !wanted(x, z, rand)) continue
      const inside = Math.abs(x) < HALF && Math.abs(z) < HALF
      out.push({ ...item(x, inside ? heightAt(terrain, x, z) : 0, z, rand() * 6.28, size[0] + rand() * (size[1] - size[0]), colours[Math.floor(rand() * colours.length)]), chunk: inside ? chunkOf(x, z) : -1 })
    }
  }
  return out
}

const nearest = (v: number) => clamp(Math.round((v + HALF) / CELL), 0, GRID)

/** Items that stand on the turf: each hides where its point lost the grass. Re-checked per chunk when the chunk's version moves. */
function Grass({ name, terrain, geometry, items }: { name: string; terrain: Terrain; geometry: BufferGeometry; items: readonly Grown[] }) {
  const mesh = useMemo(() => {
    const m = instancesOf(geometry, PROP, items)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    return m
  }, [geometry, items])
  const byChunk = useMemo(() => {
    const lists: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => [])
    items.forEach((it, k) => {
      if (it.chunk >= 0) lists[it.chunk].push(k)
    })
    return lists
  }, [items])
  const seen = useRef<number[]>([])
  useEffect(() => () => mesh.dispose(), [mesh])
  useFrame(() => {
    let changed = false
    byChunk.forEach((list, c) => {
      if (seen.current[c] === terrain.version[c]) return
      seen.current[c] = terrain.version[c]
      changed = true
      for (const k of list) {
        const it = items[k]
        const grassy = terrain.turf[nearest(it.x) + nearest(it.z) * SIDE] >= 0.9
        setItem(mesh, k, { ...it, y: heightAt(terrain, it.x, it.z) - 0.02, sx: grassy ? it.sx : 0, sy: grassy ? it.sy : 0, sz: grassy ? it.sz : 0 })
      }
    })
    if (changed) mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} name={name} receiveShadow />
}

// ---------------------------------------------------------------------------------------
// The river's banks: reeds in the shallows and stones on the edge.

const REED = merge([
  ...[
    [0, 0, 1.25, 0],
    [0.07, 0.04, 1.0, 0.18],
    [-0.06, 0.05, 0.85, -0.2],
  ].map(([x, z, h, lean]) => spike(0.03, h, 3, '#ffffff', [x, h / 2, z], { tint: 1, rot: [lean, 0, -lean] })),
  spike(0.055, 0.3, 4, '#7a4a2a', [0, 1.13, 0]),
])

const STONE_MATERIAL = new MeshStandardMaterial({ roughness: 1, flatShading: true, envMapIntensity: 0.15 })
const BANK_STONES = ['#8a8d98', '#a3a6b0', '#9a968c', '#b0aea6'].map((c) => new Color(c))
const REED_COLOURS = ['#5aa83f', '#6fb84a', '#4f9a3a'].map((c) => new Color(c))

/** A bed height at metres `m` in from the river's edge, as terrain.ts shapes it. */
const bedY = (m: number) => RIVER.floor * clamp(m / 3.2, 0, 1)

function bankItems(): { reeds: Item[]; stones: Item[] } {
  const rand = mulberry32(9)
  const reeds: Item[] = []
  const stones: Item[] = []
  for (const north of [true, false]) {
    for (let x = -135; x < 135; x += 0.9 + rand() * 1.4) {
      if (Math.abs(x - BRIDGE.x) < 5.5) continue
      const edge = (m: number) => (north ? RIVER.z0 + m : RIVER.z1 - m)
      if (rand() < 0.55) {
        const m = 0.55 + rand() * 0.7
        reeds.push(item(x, bedY(m), edge(m), rand() * 6.28, 0.9 + rand() * 0.9, REED_COLOURS[Math.floor(rand() * REED_COLOURS.length)]))
      }
      if (rand() < 0.16) {
        const m = 0.1 + rand() * 1.6
        const s = 0.18 + rand() * 0.3
        stones.push({ ...item(x, bedY(m) + s * 0.1, edge(m), rand() * 6.28, s, BANK_STONES[Math.floor(rand() * BANK_STONES.length)]), sy: s * 0.6 })
      }
    }
  }
  return { reeds, stones }
}

// ---------------------------------------------------------------------------------------
// The site: the hut and Pip's sign, the portable toilet, road signs.

const hutPieces = (): Piece[] => [
  box(3.4, 0.18, 2.8, '#bdb6a8', [0, 0.09, 0]),
  box(3.0, 1.8, 2.4, '#ffe3a3', [0, 1.08, 0]),
  ...[1, -1].flatMap((sx) => [1, -1].map((sz) => box(0.16, 1.8, 0.16, '#e9c77a', [sx * 1.5, 1.08, sz * 1.2]))),
  prism(3.7, 3.1, 1.25, '#e0453a', [0, 1.98, 0]),
  box(3.7, 0.08, 0.08, '#b83228', [0, 1.99, 1.5]),
  box(0.42, 0.95, 0.42, '#c4553c', [1.0, 2.5, -0.5]),
  box(0.55, 0.1, 0.55, '#8a4030', [1.0, 3.0, -0.5]),
  // Door with a knob and a step, window with a flower box.
  box(0.72, 1.3, 0.08, '#8a4b2a', [-0.65, 0.83, 1.2]),
  ball(0.05, '#ffd23f', [-0.43, 0.8, 1.27], {}, 6),
  box(0.95, 0.1, 0.45, '#c8c0b0', [-0.65, 0.23, 1.45]),
  box(0.9, 0.72, 0.05, '#ffffff', [0.8, 1.3, 1.2]),
  box(0.7, 0.52, 0.06, '#bfe6ff', [0.8, 1.3, 1.22]),
  box(0.7, 0.04, 0.07, '#ffffff', [0.8, 1.3, 1.23]),
  box(0.04, 0.52, 0.07, '#ffffff', [0.8, 1.3, 1.23]),
  box(0.95, 0.15, 0.22, '#8a5a36', [0.8, 0.88, 1.32]),
  ball(0.08, '#ff7fb0', [0.55, 1.0, 1.32], {}, 6),
  ball(0.08, '#ffe14d', [0.8, 1.02, 1.32], {}, 6),
  ball(0.08, '#ff7a59', [1.05, 1.0, 1.32], {}, 6),
  // A bench of planks beside the door.
  box(0.9, 0.08, 0.34, '#b98b5e', [-1.9, 0.5, 0.6]),
  box(0.08, 0.5, 0.3, '#8a5a36', [-2.25, 0.25, 0.6]),
  box(0.08, 0.5, 0.3, '#8a5a36', [-1.55, 0.25, 0.6]),
]

/** Pip's sign: a post with a blue board and a hedgehog in a yellow hard hat. */
const signPieces = (): Piece[] => {
  const spikes = Array.from({ length: 9 }, (_, k) => {
    const a = (Math.PI * (0.1 + (k / 8) * 0.8))
    return cyl(0, 0.07, 0.26, '#4a3326', [Math.cos(a) * 0.4, 1.4 + Math.sin(a) * 0.36, 0.1], { rot: [0, 0, a - Math.PI / 2] }, 5)
  })
  return [
    box(0.12, 1.5, 0.12, '#8a5a36', [-0.55, 0.75, 0]),
    box(0.12, 1.5, 0.12, '#8a5a36', [0.55, 0.75, 0]),
    box(1.5, 1.15, 0.08, '#ffffff', [0, 1.55, 0]),
    box(1.36, 1.01, 0.1, '#8fd0ff', [0, 1.55, 0.005]),
    ball(0.4, '#6b4a35', [0, 1.42, 0.1], { scale: [1.1, 0.95, 0.35] }),
    ...spikes,
    ball(0.25, '#f2c8a0', [0, 1.34, 0.2], { scale: [1, 0.85, 0.55] }),
    ball(0.07, '#f2c8a0', [-0.24, 1.5, 0.15], {}, 6),
    ball(0.07, '#f2c8a0', [0.24, 1.5, 0.15], {}, 6),
    ball(0.04, '#1d1d22', [-0.09, 1.38, 0.31], {}, 6),
    ball(0.04, '#1d1d22', [0.09, 1.38, 0.31], {}, 6),
    ball(0.05, '#1d1d22', [0, 1.3, 0.34], {}, 6),
    ball(0.23, '#ffd23f', [0, 1.5, 0.2], { scale: [1, 0.65, 0.9] }),
    cyl(0.3, 0.3, 0.03, '#ffc400', [0, 1.5, 0.24], {}, 14),
  ]
}

/** The portable toilet: a blue booth with a white roof, a red dot on the door and two shoes showing under it. */
const toiletPieces = (): Piece[] => [
  box(1.25, 0.1, 1.25, '#2a6bb0', [0, 0.05, 0]),
  box(1.1, 2.1, 1.1, '#3b8ee6', [0, 1.15, 0]),
  box(1.22, 0.12, 1.22, '#f4f5f7', [0, 2.26, 0]),
  cyl(0.07, 0.07, 0.3, '#f4f5f7', [0.35, 2.47, -0.3], {}, 8),
  box(0.8, 1.55, 0.04, '#5aa6f2', [0, 1.1, 0.56]),
  box(0.5, 0.05, 0.05, '#2a6bb0', [0, 1.7, 0.59]),
  box(0.5, 0.05, 0.05, '#2a6bb0', [0, 1.8, 0.59]),
  box(0.12, 0.05, 0.07, '#f4f5f7', [0.27, 1.05, 0.6]),
  ball(0.06, '#ff3b30', [0, 1.5, 0.6], {}, 6),
  box(0.2, 0.12, 0.34, '#7a3b1e', [-0.17, 0.17, 0.72]),
  box(0.2, 0.12, 0.34, '#7a3b1e', [0.17, 0.17, 0.72]),
]

const post = (h: number): Piece => cyl(0.04, 0.04, h, '#9aa0a8', [0, h / 2, 0], {}, 6)

/** A yellow diamond with a black heap of dirt on it. */
const diggingSign = (): Piece[] => [
  post(1.6),
  box(0.7, 0.7, 0.04, '#222222', [0, 1.7, -0.01], { rot: [0, 0, Math.PI / 4] }),
  box(0.6, 0.6, 0.05, '#ffd23f', [0, 1.7, 0.01], { rot: [0, 0, Math.PI / 4] }),
  ball(0.19, '#222222', [0, 1.6, 0.04], { scale: [1.3, 0.8, 0.25] }, 8),
  box(0.3, 0.05, 0.03, '#222222', [0, 1.54, 0.04]),
  cyl(0, 0.08, 0.2, '#222222', [0, 1.82, 0.04], { rot: [0, 0, 0] }, 3),
]

/** A blue disc with a white arrow. */
const arrowSign = (): Piece[] => [
  post(1.5),
  cyl(0.32, 0.32, 0.05, '#2e7de0', [0, 1.6, 0], { rot: [Math.PI / 2, 0, 0] }, 20),
  box(0.34, 0.09, 0.03, '#ffffff', [-0.04, 1.6, 0.03]),
  cyl(0, 0.13, 0.17, '#ffffff', [0.17, 1.6, 0.03], { rot: [0, 0, -Math.PI / 2] }, 3),
]

/** A stump with a pale cut top and a ring in it. */
const stumpPieces = (): Piece[] => [cyl(0.42, 0.55, 0.5, '#8a5a36', [0, 0.25, 0], {}, 10), cyl(0.4, 0.4, 0.04, '#e8c48f', [0, 0.51, 0], {}, 10), cyl(0.22, 0.22, 0.045, '#d3a86c', [0, 0.51, 0], {}, 10)]

/** A pile of three cut logs lying along x, with pale cut ends. */
const logPilePieces = (): Piece[] =>
  [
    [-0.4, 0.3],
    [0.4, 0.3],
    [0, 0.88],
  ].flatMap(([x, y]) => [
    cyl(0.3, 0.3, 2.4, '#8a5a36', [0, y, x], { rot: [0, 0, Math.PI / 2] }, 10),
    ...[1, -1].map((e) => cyl(0.27, 0.27, 0.02, '#e8c48f', [e * 1.2, y, x], { rot: [0, 0, Math.PI / 2] }, 10)),
  ])

function sitePieces(terrain: Terrain): Piece[] {
  const y = (x: number, z: number) => heightAt(terrain, x, z)
  const stand = (pieces: Piece[], x: number, z: number, yaw: number) => place(pieces, x, y(x, z), z, yaw)
  return [
    ...stand(hutPieces(), HUT.x, HUT.z, 0),
    ...stand(signPieces(), HUT.x + 3.4, HUT.z + 1.1, -0.15),
    ...PROPS.filter((p) => p.kind === 'toilet').flatMap((p) => stand(toiletPieces(), p.x, p.z, p.yaw)),
    ...stand(diggingSign(), -23.6, 26.6, 0.1),
    ...stand(diggingSign(), 25.6, 26.6, -0.1),
    ...stand(arrowSign(), -40, 26.4, 0),
    ...stand(arrowSign(), 40, 33.6, Math.PI),
    ...stand(diggingSign(), 5, 8.4, 0),
    ...stand(stumpPieces(), 38.6, -17.6, 0),
    ...stand(stumpPieces(), 47, -22, 0.5),
    ...stand(stumpPieces(), 36, -33.6, 1),
    ...stand(logPilePieces(), 34.8, -19.6, 0.15),
  ]
}

// ---------------------------------------------------------------------------------------
// Cones, barrels and the fence.

const CONE = merge([box(0.4, 0.04, 0.4, '#2d2d33', [0, 0.02, 0]), cyl(0.04, 0.17, 0.5, '#ff7a1a', [0, 0.29, 0], {}, 10), cyl(0.085, 0.115, 0.1, '#ffffff', [0, 0.3, 0], {}, 10)])

function coneItems(terrain: Terrain): Item[] {
  const spots: [number, number][] = []
  for (const h of HOLES) for (let k = 0; k < 4; k++) spots.push([h.x + Math.cos((k * Math.PI) / 2 + 0.6) * (h.r + 1), h.z + Math.sin((k * Math.PI) / 2 + 0.6) * (h.r + 1)])
  for (let k = 0; k < 3; k++) spots.push([SANDPIT.x - 2.5 + k * 2.5, SANDPIT.z - SANDPIT.r - 1.2])
  for (let k = 0; k < 3; k++) spots.push([HUT.x - 1.2 + k * 1.1, HUT.z + 3.2])
  for (const [x, z] of [
    [-22.6, 27.4],
    [-22.6, 32.6],
    [24.6, 27.4],
    [24.6, 32.6],
    [-21.2, 27.2],
    [23.2, 27.2],
    [-24.4, 27.4],
    [26.4, 27.4],
  ])
    spots.push([x, z])
  return spots.map(([x, z], k) => item(x, heightAt(terrain, x, z), z, k * 1.7, 1))
}

const BARREL = merge([
  cyl(0.3, 0.3, 0.88, '#ffffff', [0, 0.46, 0], { tint: 1 }, 14),
  cyl(0.308, 0.308, 0.03, '#2d2d33', [0, 0.22, 0], {}, 14),
  cyl(0.308, 0.308, 0.03, '#2d2d33', [0, 0.66, 0], {}, 14),
  cyl(0.27, 0.27, 0.03, '#dcdcdc', [0, 0.91, 0], {}, 14),
])
const BARREL_COLOURS = ['#e0453a', '#ffc400', '#3b8ee6', '#4fae4f'].map((c) => new Color(c))

function barrelItems(terrain: Terrain): Item[] {
  const out: Item[] = []
  const rows: [number, number][] = [
    [-0.64, 0],
    [0, 0],
    [0.64, 0],
    [-0.32, 0.88],
    [0.32, 0.88],
    [0, 1.76],
  ]
  for (const p of PROPS) {
    if (p.kind === 'barrelStack') {
      for (const [dx, dy] of rows) {
        const x = p.x + dx * Math.cos(p.yaw)
        const z = p.z - dx * Math.sin(p.yaw)
        out.push(item(x, heightAt(terrain, p.x, p.z) + dy, z, dx * 9, 1, BARREL_COLOURS[out.length % BARREL_COLOURS.length]))
      }
    } else if (p.kind === 'barrel') out.push(item(p.x, heightAt(terrain, p.x, p.z), p.z, p.yaw, 1, BARREL_COLOURS[out.length % BARREL_COLOURS.length]))
  }
  return out
}

const FENCE_LENGTH = 3
const FENCE_PICKETS = 4
// A post as a box, the rails and pickets as flat boards: 36 triangles.
const FENCE = merge([
  box(0.13, 1.0, 0.13, '#a8764a', [0, 0.5, 0]),
  ...board(FENCE_LENGTH, 0.07, '#c99a6b', [FENCE_LENGTH / 2, 0.35, -0.04]),
  ...board(FENCE_LENGTH, 0.07, '#c99a6b', [FENCE_LENGTH / 2, 0.7, -0.04]),
  ...Array.from({ length: FENCE_PICKETS }, (_, k) => board(0.26, 0.85, '#ffffff', [((k + 0.5) * FENCE_LENGTH) / FENCE_PICKETS, 0.45, 0], { tint: 1 })).flat(),
])
const PASTELS = ['#ffffff', '#bfe6ff', '#fff0a8', '#ffc9dc', '#d4f2b4'].map((c) => new Color(c))
/** The fence runs along the map's edge, with gaps where the river and the road leave. */
const FENCE_AT = HALF - 0.7

function fenceItems(terrain: Terrain): Item[] {
  const out: Item[] = []
  const rand = mulberry32(4)
  for (let t = -HALF; t < HALF; t += FENCE_LENGTH) {
    const colour = () => PASTELS[Math.floor(rand() * PASTELS.length)]
    out.push({ ...item(t, 0, -FENCE_AT, 0, 1, colour()), y: heightAt(terrain, t, -FENCE_AT) })
    out.push({ ...item(t, 0, FENCE_AT, 0, 1, colour()), y: heightAt(terrain, t, FENCE_AT) })
    const mid = t + FENCE_LENGTH / 2
    const gap = (mid > RIVER.z0 - 1 && mid < RIVER.z1 + 1) || Math.abs(mid - READY_ROADS[0].az) < ROAD_WIDTH / 2 + 1
    if (gap) continue
    out.push({ ...item(-FENCE_AT, 0, t, Math.PI / 2, 1, colour()), y: heightAt(terrain, -FENCE_AT, t) })
    out.push({ ...item(FENCE_AT, 0, t, Math.PI / 2, 1, colour()), y: heightAt(terrain, FENCE_AT, t) })
  }
  return out
}

// ---------------------------------------------------------------------------------------

/**
 * Everything that stands around the site and does not move: the forest and the far hills, the
 * flowers and grass tufts, the river's banks, the hut with Pip's sign, a portable toilet, road
 * signs, cones, barrels and the fence. About 15 draw calls. Flowers and tufts follow the
 * terrain: they hide where the grass is dug away.
 */
export function Scenery({ terrain }: { terrain: Terrain }) {
  const forest = useMemo(() => forestItems(terrain), [terrain])
  const flowers = useMemo(() => grownItems(terrain, 4.4, 62, 11, (x, z, rand) => rand() < 0.16 + 0.9 * smooth(0.42, 0.65, latticeNoise(x / 9, z / 9, Infinity, 11)), FLOWER_COLOURS, [1.3, 2.1]), [terrain])
  const tufts = useMemo(() => grownItems(terrain, 3.5, 56, 12, (x, z, rand) => rand() < 0.2 + 0.7 * smooth(0.3, 0.55, latticeNoise(x / 5, z / 5, Infinity, 13)), TUFT_COLOURS, [1.2, 2.2]), [terrain])
  const banks = useMemo(bankItems, [])
  const site = useMemo(() => merge(sitePieces(terrain)), [terrain])
  const cones = useMemo(() => coneItems(terrain), [terrain])
  const barrels = useMemo(() => barrelItems(terrain), [terrain])
  const fence = useMemo(() => fenceItems(terrain), [terrain])
  useEffect(() => () => site.dispose(), [site])
  return (
    <>
      <Hills />
      <Instances name="near" geometry={NEAR_TREE} items={forest.near} cast />
      <Instances name="far" geometry={FAR_TREE} items={forest.far} />
      <Grass name="flowers" terrain={terrain} geometry={FLOWER} items={flowers} />
      <Grass name="tufts" terrain={terrain} geometry={TUFT} items={tufts} />
      <Instances name="reeds" geometry={REED} items={banks.reeds} />
      <Instances name="stones" geometry={STONE} items={banks.stones} material={STONE_MATERIAL} />
      <mesh geometry={site} material={PROP_MESH} castShadow receiveShadow />
      <Instances name="cones" geometry={CONE} items={cones} />
      <Instances name="barrels" geometry={BARREL} items={barrels} />
      <Instances name="fence" geometry={FENCE} items={fence} />
    </>
  )
}
