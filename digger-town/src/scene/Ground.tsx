import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  CircleGeometry,
  RepeatWrapping,
  RGBAFormat,
  Sphere,
  UnsignedByteType,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three'

import { READY_ROADS, RIVER, ROAD_WIDTH, ROADS } from '../game/map'
import { CELL, CHUNK, CHUNKS, GRID, HALF, LOOSE_INDEX, LOOSE_KINDS, ROAD_Y, SIDE, SURFACE_INDEX } from '../game/model'
import type { Pond, Terrain } from '../game/model'
import { clamp, clamp01, mulberry32, smooth } from '../game/math'
import { pondY } from '../game/terrain'
import { LOAD_COLOUR } from './look'

// ---------------------------------------------------------------------------------------
// Shared helpers: the valley's noise, shader patching and the stone shape.

/** Replaces `from` in a shader's source, throwing when it is not there, so a three.js change cannot silently drop a patch. */
export function patchShader(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`shader patch: "${from}" not found`)
  return source.replace(from, to)
}

const hash = (ix: number, iz: number, seed: number) => {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0 to 1, with features one unit wide; wraps every `period` units (Infinity for no wrap). */
export function latticeNoise(x: number, z: number, period: number, seed: number): number {
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  const tx = smooth(0, 1, x - fx)
  const tz = smooth(0, 1, z - fz)
  const wrap = (v: number) => (Number.isFinite(period) ? ((v % period) + period) % period : v)
  const x0 = wrap(fx)
  const x1 = wrap(fx + 1)
  const z0 = wrap(fz)
  const z1 = wrap(fz + 1)
  const a = hash(x0, z0, seed) * (1 - tx) + hash(x1, z0, seed) * tx
  const b = hash(x0, z1, seed) * (1 - tx) + hash(x1, z1, seed) * tx
  return a * (1 - tz) + b * tz
}

/** A rough stone: shared by the rock points' scattered stones and the river's banks. Scale it per instance. */
export const STONE = new IcosahedronGeometry(1, 1)

const SIZE_GRAIN = 256

/** The fine tiling grain: R is speckle, G a ragged edge noise (a tile is 6 m), B a slow patchiness (a tile is 48 m). */
function grainTexture(): DataTexture {
  const data = new Uint8Array(SIZE_GRAIN * SIZE_GRAIN * 4)
  for (let v = 0; v < SIZE_GRAIN; v++) {
    for (let u = 0; u < SIZE_GRAIN; u++) {
      const o = (u + v * SIZE_GRAIN) * 4
      const noise = (cells: number, seed: number) => latticeNoise((u * cells) / SIZE_GRAIN, (v * cells) / SIZE_GRAIN, cells, seed)
      const speckle = 0.5 * hash(u, v, 1) + 0.5 * noise(64, 2)
      const edge = 0.7 * noise(8, 3) + 0.3 * noise(17, 4)
      const slow = 0.7 * noise(2, 5) + 0.3 * noise(6, 6)
      data[o] = Math.round(255 * clamp01(speckle))
      data[o + 1] = Math.round(255 * clamp01(0.5 + (edge - 0.5) * 1.7))
      data[o + 2] = Math.round(255 * clamp01(0.5 + (slow - 0.5) * 1.5))
      data[o + 3] = 255
    }
  }
  const tex = new DataTexture(data, SIZE_GRAIN, SIZE_GRAIN, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

// ---------------------------------------------------------------------------------------
// Colours.

const GRASS_A = new Color('#78c850')
const GRASS_B = new Color('#8fd45a')
const GRASS_C = new Color('#5fb848')
const ASPHALT = new Color('#4b4e5a')
const SLAB = new Color('#b9bac0')
const BEDROCK_COLOUR = new Color('#6e4c33')
const RIVERBED = new Color('#b39a6a')
const LOOSE_COLOURS = LOOSE_KINDS.map((k) => new Color(LOAD_COLOUR[k]))
const HARD_COLOURS = [BEDROCK_COLOUR, ASPHALT, SLAB, RIVERBED]
/** Loose stuff thinner than this lets a built hard level's colour show. */
const THIN = 0.06
/** The same on bare soft ground, where a heap's toe must keep its own colour right to the rim. */
const THIN_SOFT = 0.005

/** The ground's one material: vertex colour for the loose stuff, grass over it by `turf` and asphalt by `rolled`, each sharpened against a noise in world space so the edges are crisp and ragged. */
function groundMaterial(grain: DataTexture): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.15 })
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGrain = { value: grain }
    shader.uniforms.uGrassA = { value: GRASS_A }
    shader.uniforms.uGrassB = { value: GRASS_B }
    shader.uniforms.uGrassC = { value: GRASS_C }
    shader.uniforms.uAsphalt = { value: ASPHALT }
    shader.vertexShader = patchShader(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;\nvarying vec3 vWorld;')
    shader.vertexShader = patchShader(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <common>',
      '#include <common>\nuniform sampler2D uGrain;\nuniform vec3 uGrassA;\nuniform vec3 uGrassB;\nuniform vec3 uGrassC;\nuniform vec3 uAsphalt;\nvarying vec2 vMix;\nvarying vec3 vWorld;',
    )
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <color_fragment>',
      /* glsl */ `
      vec4 gA = texture2D(uGrain, vWorld.xz / 6.0);
      vec4 gB = texture2D(uGrain, mat2(0.8, 0.6, -0.6, 0.8) * vWorld.xz / 1.9 + 0.37);
      vec4 gC = texture2D(uGrain, vWorld.xz / 48.0 + 0.11);
      float edgeN = gA.g;
      float turfV = vMix.x * 1.2 - 0.1 + (edgeN - 0.5) * 0.6;
      float wT = fwidth(turfV) * 0.8 + 0.02;
      float grass = smoothstep(0.5 - wT, 0.5 + wT, turfV);
      float rim = smoothstep(0.5, 0.66, turfV);
      float rollV = vMix.y * 1.2 - 0.1 + (gA.g - 0.5) * 0.6;
      float wR = fwidth(rollV) * 0.8 + 0.02;
      float asphalt = smoothstep(0.5 - wR, 0.5 + wR, rollV);
      vec3 grassCol = mix(mix(uGrassA, uGrassB, smoothstep(0.35, 0.7, gC.b)), uGrassC, smoothstep(0.55, 0.9, gC.g) * 0.35);
      grassCol *= mix(0.82, 1.0, rim) * (0.96 + 0.08 * gB.r);
      vec3 base = mix(vColor.rgb, uAsphalt, asphalt) * (0.88 + 0.1 * gB.r + 0.14 * gC.b);
      // Heaps lighten toward their tops with soft contour bands; pits darken with depth.
      float up = clamp(vWorld.y, 0.0, 4.5);
      base *= 0.93 + 0.035 * up + 0.025 * sin(vWorld.y * 7.0 + gB.g * 2.0) * smoothstep(0.15, 0.6, vWorld.y);
      base *= 1.0 - 0.38 * smoothstep(-0.02, -0.5, vWorld.y);
      diffuseColor.rgb = mix(base, grassCol, grass);
      `,
    )
  }
  m.customProgramCacheKey = () => 'digger-town-ground'
  return m
}

// ---------------------------------------------------------------------------------------
// Chunks.

const VERTS = CHUNK + 1

/** The index buffer every chunk shares. */
function chunkIndex(): BufferAttribute {
  const index = new Uint16Array(CHUNK * CHUNK * 6)
  let n = 0
  for (let j = 0; j < CHUNK; j++) {
    for (let k = 0; k < CHUNK; k++) {
      const a = k + j * VERTS
      index.set([a, a + VERTS, a + 1, a + 1, a + VERTS, a + VERTS + 1], n)
      n += 6
    }
  }
  return new BufferAttribute(index, 1)
}

interface Chunk {
  mesh: Mesh
  cx: number
  cz: number
  position: BufferAttribute
  normal: BufferAttribute
  color: BufferAttribute
  mix: BufferAttribute
  drawn: number
}

const heightIx = (t: Terrain, ix: number, iz: number) => {
  const i = clamp(ix, 0, GRID) + clamp(iz, 0, GRID) * SIDE
  return t.hard[i] + t.loose[i]
}

const tmpColour = new Color()

/** The colour of point `i`: its hard level, covered by its loose stuff as it thickens. */
function groundColour(t: Terrain, i: number, out: Color): void {
  out.copy(HARD_COLOURS[t.surface[i]]).lerp(LOOSE_COLOURS[t.kind[i]], clamp01(t.loose[i] / (t.surface[i] === SURFACE_INDEX.soft ? THIN_SOFT : THIN)))
}

/** Writes a chunk's vertices from the Terrain arrays alone, so shared borders agree exactly. */
function rebuild(t: Terrain, c: Chunk): void {
  const pos = c.position.array as Float32Array
  const nor = c.normal.array as Float32Array
  const col = c.color.array as Float32Array
  const mix = c.mix.array as Float32Array
  const ix0 = c.cx * CHUNK
  const iz0 = c.cz * CHUNK
  for (let j = 0; j < VERTS; j++) {
    for (let k = 0; k < VERTS; k++) {
      const ix = ix0 + k
      const iz = iz0 + j
      const i = ix + iz * SIDE
      const v = k + j * VERTS
      pos[v * 3] = ix * CELL - HALF
      pos[v * 3 + 1] = t.hard[i] + t.loose[i]
      pos[v * 3 + 2] = iz * CELL - HALF
      const dx = (heightIx(t, ix - 1, iz) - heightIx(t, ix + 1, iz)) / (2 * CELL)
      const dz = (heightIx(t, ix, iz - 1) - heightIx(t, ix, iz + 1)) / (2 * CELL)
      const len = Math.hypot(dx, 1, dz)
      nor[v * 3] = dx / len
      nor[v * 3 + 1] = 1 / len
      nor[v * 3 + 2] = dz / len
      const loose = t.loose[i]
      // A grassy point next to bare ground takes that ground's colour, so the blend across the edge stays under the grass and the line stays crisp.
      let source = i
      if (t.turf[i] >= 0.5) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const q = clamp(ix + dx, 0, GRID) + clamp(iz + dz, 0, GRID) * SIDE
            if (t.turf[q] < Math.min(0.5, t.turf[source])) source = q
          }
        }
      }
      groundColour(t, source, tmpColour)
      col[v * 3] = tmpColour.r
      col[v * 3 + 1] = tmpColour.g
      col[v * 3 + 2] = tmpColour.b
      mix[v * 2] = t.turf[i]
      mix[v * 2 + 1] = t.surface[i] === SURFACE_INDEX.road ? 1 : t.bed[i] < 0 ? 0 : t.rolled[i] * clamp01(1 - loose * 8)
    }
  }
  c.position.needsUpdate = true
  c.normal.needsUpdate = true
  c.color.needsUpdate = true
  c.mix.needsUpdate = true
  c.drawn = t.version[c.cx + c.cz * CHUNKS]
}

function makeChunks(t: Terrain, material: MeshStandardMaterial): Chunk[] {
  const index = chunkIndex()
  const chunks: Chunk[] = []
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const geometry = new BufferGeometry()
      const make = (size: number) => new BufferAttribute(new Float32Array(VERTS * VERTS * size), size).setUsage(DynamicDrawUsage)
      const position = make(3)
      const normal = make(3)
      const color = make(3)
      const mix = make(2)
      geometry.setAttribute('position', position)
      geometry.setAttribute('normal', normal)
      geometry.setAttribute('color', color)
      geometry.setAttribute('aMix', mix)
      geometry.setIndex(index)
      const x0 = cx * CHUNK * CELL - HALF
      const z0 = cz * CHUNK * CELL - HALF
      const size = CHUNK * CELL
      geometry.boundingSphere = new Box3(new Vector3(x0, -2, z0), new Vector3(x0 + size, 8, z0 + size)).getBoundingSphere(new Sphere())
      const mesh = new Mesh(geometry, material)
      mesh.receiveShadow = true
      const chunk: Chunk = { mesh, cx, cz, position, normal, color, mix, drawn: 0 }
      rebuild(t, chunk)
      chunks.push(chunk)
    }
  }
  return chunks
}

/** Rebuilds the chunks whose version moved, nearest the camera's target first, at most this many a frame. */
const REBUILDS_PER_FRAME = 4

function Chunks({ terrain, material }: { terrain: Terrain; material: MeshStandardMaterial }) {
  const chunks = useMemo(() => makeChunks(terrain, material), [terrain, material])
  const camera = useThree((s) => s.camera)
  const forward = useMemo(() => new Vector3(), [])
  const dirty = useRef<Chunk[]>([])
  useEffect(
    () => () => {
      for (const c of chunks) c.mesh.geometry.dispose()
    },
    [chunks],
  )
  useFrame(() => {
    dirty.current.length = 0
    for (const c of chunks) if (c.drawn !== terrain.version[c.cx + c.cz * CHUNKS]) dirty.current.push(c)
    if (dirty.current.length === 0) return
    camera.getWorldDirection(forward)
    const reach = forward.y < -0.05 ? -camera.position.y / forward.y : 0
    const tx = camera.position.x + forward.x * reach
    const tz = camera.position.z + forward.z * reach
    const half = (CHUNK * CELL) / 2
    const away = (c: Chunk) => Math.hypot(c.cx * CHUNK * CELL - HALF + half - tx, c.cz * CHUNK * CELL - HALF + half - tz)
    dirty.current.sort((a, b) => away(a) - away(b))
    for (let k = 0; k < Math.min(REBUILDS_PER_FRAME, dirty.current.length); k++) rebuild(terrain, dirty.current[k])
  })
  return (
    <>
      {chunks.map((c) => (
        <primitive key={`${c.cx}-${c.cz}`} object={c.mesh} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------
// Stones on rock points.

const STONES_PER_CHUNK = 110
const STONE_COLOURS = ['#8a8d98', '#a3a6b0', '#757986', '#9a968c', '#b0aea6'].map((c) => new Color(c))
/** A point shows stones while it holds at least this much rock. */
const STONE_MIN_LOOSE = 0.12

const nearest = (v: number) => clamp(Math.round((v + HALF) / CELL), 0, GRID)

interface StoneSlot {
  x: number
  z: number
  sx: number
  sy: number
  sz: number
  yaw: number
  colour: Color
}

function makeSlots(): StoneSlot[] {
  const rand = mulberry32(77)
  const slots: StoneSlot[] = []
  const size = CHUNK * CELL
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      for (let k = 0; k < STONES_PER_CHUNK; k++) {
        const s = 0.14 + Math.pow(rand(), 2.2) * 0.4
        slots.push({
          x: cx * size - HALF + rand() * size,
          z: cz * size - HALF + rand() * size,
          sx: s * (0.8 + rand() * 0.5),
          sy: s * (0.55 + rand() * 0.3),
          sz: s * (0.8 + rand() * 0.5),
          yaw: rand() * Math.PI * 2,
          colour: STONE_COLOURS[Math.floor(rand() * STONE_COLOURS.length)],
        })
      }
    }
  }
  return slots
}

const versionSum = (t: Terrain) => {
  let sum = 0
  for (let i = 0; i < t.version.length; i++) sum += t.version[i]
  return sum
}

/** Each frame's scratch objects, shared by the instanced parts of the ground. */
const dummy = new Object3D()

function Stones({ terrain }: { terrain: Terrain }) {
  const slots = useMemo(makeSlots, [])
  const mesh = useMemo(() => {
    const m = new InstancedMesh(STONE, new MeshStandardMaterial({ roughness: 1, flatShading: true, envMapIntensity: 0.15 }), slots.length)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.count = 0
    m.frustumCulled = false
    m.receiveShadow = true
    return m
  }, [slots])
  const seen = useRef(-1)
  useEffect(
    () => () => {
      ;(mesh.material as MeshStandardMaterial).dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useFrame(() => {
    const sum = versionSum(terrain)
    if (sum === seen.current) return
    seen.current = sum
    let n = 0
    for (const s of slots) {
      const i = nearest(s.x) + nearest(s.z) * SIDE
      if (terrain.kind[i] !== LOOSE_INDEX.rock || terrain.loose[i] < STONE_MIN_LOOSE) continue
      dummy.position.set(s.x, terrain.hard[i] + terrain.loose[i] + s.sy * 0.35, s.z)
      dummy.rotation.set(0, s.yaw, 0)
      dummy.scale.set(s.sx, s.sy, s.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      mesh.setColorAt(n, s.colour)
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------------------------------
// Road centre dashes.

const DASH_LENGTH = 1.5
const DASH_PERIOD = 3.2
const DASH_WIDTH = 0.2
const DASH_LIFT = 0.04
/** How far the roads on the apron run on past the terrain's edge. */
const APRON = 300

interface Dash {
  x: number
  z: number
  yaw: number
  /** Shown only while the terrain under it is bare road; false for the apron's, which always show. */
  watch: boolean
}

function makeDashes(): Dash[] {
  const dashes: Dash[] = []
  const along = (ax: number, az: number, bx: number, bz: number, from: number, to: number, watch: boolean) => {
    const len = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / len
    const uz = (bz - az) / len
    for (let a = from; a + DASH_LENGTH <= len - to + 1e-6; a += DASH_PERIOD) {
      const mid = a + DASH_LENGTH / 2
      dashes.push({ x: ax + ux * mid, z: az + uz * mid, yaw: Math.atan2(ux, uz), watch })
    }
  }
  for (const r of ROADS) along(r.ax, r.az, r.bx, r.bz, 2, 2, true)
  for (const r of READY_ROADS) along(r.ax, r.az, r.bx, r.bz, 0.4, 1, true)
  along(HALF, READY_ROADS[1].az, 130, READY_ROADS[1].az, 0.8, 0, false)
  along(-HALF, READY_ROADS[0].az, -130, READY_ROADS[0].az, 0.8, 0, false)
  return dashes
}

const DASH_MATERIAL = new MeshStandardMaterial({ color: '#f7f0d8', roughness: 1, envMapIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
const DASH_GEOMETRY = new PlaneGeometry(DASH_WIDTH, DASH_LENGTH).rotateX(-Math.PI / 2)

function Dashes({ terrain }: { terrain: Terrain }) {
  const dashes = useMemo(makeDashes, [])
  const mesh = useMemo(() => {
    const m = new InstancedMesh(DASH_GEOMETRY, DASH_MATERIAL, dashes.length)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.frustumCulled = false
    m.receiveShadow = true
    return m
  }, [dashes])
  const shown = useRef<boolean[]>([])
  useFrame(() => {
    let changed = false
    dashes.forEach((d, k) => {
      const i = nearest(d.x) + nearest(d.z) * SIDE
      const show = !d.watch || (terrain.surface[i] === SURFACE_INDEX.road && terrain.loose[i] < 0.02)
      if (shown.current[k] === show) return
      shown.current[k] = show
      changed = true
      dummy.position.set(d.x, ROAD_Y + DASH_LIFT, d.z)
      dummy.rotation.set(0, d.yaw, 0)
      dummy.scale.setScalar(show ? 1 : 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(k, dummy.matrix)
    })
    if (changed) mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}

// ---------------------------------------------------------------------------------------
// The apron: flat grass beyond the terrain, the river and the two ready roads running on.

interface Corner {
  x: number
  y: number
  z: number
  colour: Color
  turf: number
}

function apronGeometry(): BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const mix: number[] = []
  const a = new Vector3()
  const b = new Vector3()
  const n = new Vector3()
  const tri = (p: Corner, q: Corner, r: Corner) => {
    a.set(q.x - p.x, q.y - p.y, q.z - p.z)
    b.set(r.x - p.x, r.y - p.y, r.z - p.z)
    n.crossVectors(a, b).normalize()
    const up = n.y >= 0
    if (!up) n.negate()
    for (const c of up ? [p, q, r] : [p, r, q]) {
      pos.push(c.x, c.y, c.z)
      nor.push(n.x, n.y, n.z)
      col.push(c.colour.r, c.colour.g, c.colour.b)
      mix.push(c.turf, 0)
    }
  }
  const quad = (p: Corner, q: Corner, r: Corner, s: Corner) => {
    tri(p, q, r)
    tri(p, r, s)
  }
  const flat = (x0: number, x1: number, z0: number, z1: number, y: number, colour: Color, turf: number) => {
    const c = (x: number, z: number): Corner => ({ x, y, z, colour, turf })
    quad(c(x0, z0), c(x0, z1), c(x1, z1), c(x1, z0))
  }
  const dirt = LOOSE_COLOURS[LOOSE_INDEX.dirt]
  flat(-APRON, APRON, HALF, APRON, 0, dirt, 1)
  flat(-APRON, APRON, -APRON, -HALF, 0, dirt, 1)
  // The river's profile along z, the same slope and turf as the terrain's.
  const bank = (m: number) => ({ y: RIVER.floor * clamp01(m / 3.2), turf: clamp01(1 - m / 1.5), colour: m < 2.4 ? dirt : RIVERBED })
  const profile = [
    { z: -HALF, ...bank(0) },
    ...[0, 1.5, 2.4, 3.2].map((m) => ({ z: RIVER.z0 + m, ...bank(m) })),
    ...[3.2, 2.4, 1.5, 0].map((m) => ({ z: RIVER.z1 - m, ...bank(m) })),
    { z: HALF, ...bank(0) },
  ]
  for (const side of [-1, 1]) {
    const xs = [side * HALF, side * APRON]
    for (let k = 0; k + 1 < profile.length; k++) {
      const p = profile[k]
      const q = profile[k + 1]
      const c = (x: number, e: (typeof profile)[number]): Corner => ({ x, y: e.y, z: e.z, colour: e.colour, turf: e.turf })
      quad(c(xs[0], p), c(xs[1], p), c(xs[1], q), c(xs[0], q))
    }
    const road = READY_ROADS[0]
    flat(Math.min(xs[0], xs[1]), Math.max(xs[0], xs[1]), road.az - ROAD_WIDTH / 2, road.az + ROAD_WIDTH / 2, ROAD_Y, ASPHALT, 0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('aMix', new Float32BufferAttribute(mix, 2))
  g.computeBoundingSphere()
  return g
}

/** Draws with the chunks' own material, so the grass and the river bank match across the seam. */
function Apron({ material }: { material: MeshStandardMaterial }) {
  const geometry = useMemo(apronGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} receiveShadow frustumCulled={false} />
}

// ---------------------------------------------------------------------------------------
// Water: flat transparent planes the ground clips by depth.

const SHALLOW = new Color('#9be3ea')
const DEEP = new Color('#2a97e0')

function waterMaterial(): { material: MeshStandardMaterial; time: { value: number } } {
  const time = { value: 0 }
  const material = new MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0, envMapIntensity: 0.2 })
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = time
    shader.vertexShader = patchShader(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vWorld;')
    shader.vertexShader = patchShader(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = patchShader(shader.fragmentShader, '#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <color_fragment>',
      /* glsl */ `
      diffuseColor *= vColor;
      float ripple = sin(vWorld.x * 0.5 + sin(vWorld.z * 0.8) - uTime * 1.1) * sin(vWorld.x * 0.21 - vWorld.z * 3.2 + uTime * 0.7);
      diffuseColor.rgb += 0.16 * smoothstep(0.55, 0.95, ripple);
      `,
    )
  }
  material.customProgramCacheKey = () => 'digger-town-water'
  return { material, time }
}

function riverGeometry(): BufferGeometry {
  const width = RIVER.z1 - RIVER.z0
  const g = new PlaneGeometry(2 * APRON, width, 1, 8).rotateX(-Math.PI / 2)
  g.translate(0, RIVER.waterY, (RIVER.z0 + RIVER.z1) / 2)
  const p = g.attributes.position
  const colours = new Float32Array(p.count * 4)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    const mid = 1 - Math.abs(p.getZ(i) - (RIVER.z0 + RIVER.z1) / 2) / (width / 2)
    c.copy(SHALLOW).lerp(DEEP, smooth(0, 0.7, mid))
    colours.set([c.r, c.g, c.b, 0.55 + 0.4 * smooth(0, 0.7, mid)], i * 4)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 4))
  return g
}

function pondGeometry(): BufferGeometry {
  const g = new CircleGeometry(1, 40).rotateX(-Math.PI / 2)
  const p = g.attributes.position
  const colours = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const edge = Math.hypot(p.getX(i), p.getZ(i))
    const c = SHALLOW.clone().lerp(DEEP, smooth(1, 0.2, edge))
    colours.set([c.r, c.g, c.b, 0.65 + 0.3 * smooth(1, 0.2, edge)], i * 4)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 4))
  return g
}

/** The water at its level under the dug ground: the river's flat planes and one disc per pond, at `pondY` once the pond is dug. */
function Waters({ terrain, ponds }: { terrain: Terrain; ponds: readonly Pond[] }) {
  const { material, time } = useMemo(waterMaterial, [])
  const river = useMemo(riverGeometry, [])
  const pond = useMemo(pondGeometry, [])
  const refs = useRef<(Mesh | null)[]>([])
  useEffect(
    () => () => {
      river.dispose()
      pond.dispose()
      material.dispose()
    },
    [river, pond, material],
  )
  useFrame((state) => {
    time.value = state.clock.elapsedTime
    ponds.forEach((p, k) => {
      const m = refs.current[k]!
      m.visible = p.shown && p.water > 0.01
      if (!m.visible) return
      m.position.set(p.x, pondY(terrain, p), p.z)
      m.scale.setScalar(p.r + 0.75)
    })
  })
  return (
    <>
      <mesh geometry={river} material={material} renderOrder={2} frustumCulled={false} />
      {ponds.map((p, k) => (
        <mesh key={`${p.x}-${p.z}`} ref={(m) => void (refs.current[k] = m)} geometry={pond} material={material} renderOrder={2} visible={false} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------

/**
 * The valley's ground: 36 chunks read from the Terrain arrays and rebuilt as they change, the
 * stones on rock points, the road's centre dashes, the apron beyond the edge and the water.
 * `ponds` is the sim's list, for the water's level.
 */
export function Ground({ terrain, ponds }: { terrain: Terrain; ponds: readonly Pond[] }) {
  const grain = useMemo(grainTexture, [])
  const material = useMemo(() => groundMaterial(grain), [grain])
  useEffect(
    () => () => {
      material.dispose()
      grain.dispose()
    },
    [material, grain],
  )
  return (
    <>
      <Chunks terrain={terrain} material={material} />
      <Stones terrain={terrain} />
      <Dashes terrain={terrain} />
      <Apron material={material} />
      <Waters terrain={terrain} ponds={ponds} />
    </>
  )
}
