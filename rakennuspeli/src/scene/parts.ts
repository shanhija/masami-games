/**
 * The parts box every machine is made of. A machine is built from `Part`s: a cached shape, a
 * finish, a place. `Static` merges a list of parts into one mesh, so a whole moving link (turret,
 * boom, bucket) is one draw call, plus one more only if it has glass. Everything shares ONE
 * lit material (`SOLID`): colour, roughness, metalness, glow and hazard stripes ride in vertex
 * attributes, so finishes cost nothing extra. Glass is the one other material (`GLASS`).
 *
 * Draw calls: `Static` 1 (2 with glass), `Wheels` 1, `Treads` 1, `Rams` 1, `Beacon` 1,
 * `ExhaustPuff` 1, `Mound` 1. A machine stays within 12 plus its driver.
 *
 * Frame: a machine is built facing +z with +x on the driver's left and y up, the origin on the
 * ground under its middle. The caller (not the component) places it by x, y, z, yaw, pitch, roll.
 */

import { createElement as h, Fragment, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { clamp01, mod, TAU } from '../game/math'
import { isWorking, LOOSE_KINDS, MACHINE_SPECS, type Load, type LooseKind, type Machine, type MachineKind, type Machines, type Species } from '../game/model'
import { LOAD_COLOUR, PALETTE } from './look'
import { spare } from './preload'

/** x, y, z in metres. */
export type V3 = readonly [x: number, y: number, z: number]

/** What every machine component takes. `driver` is null when nobody sits in the cab. */
export interface MachineProps<K extends MachineKind> {
  m: Machines[K]
  paint: string
  driver: { species: Species; hat: string } | null
}

// ---------------------------------------------------------------------------------------
// Finishes and the two materials.

/**
 * enamel: the machine's paint, glossy (a part's `colour` or `tint` changes it). trim: glossy fixed colour.
 * plush: matte fixed colour. rubber: black matte. steel: brushed. chrome: mirror. dark: dark cast iron.
 * hazard: yellow and black stripes. lamp: glows in its colour. glass: see-through, in the second mesh.
 */
export type Finish = 'enamel' | 'trim' | 'plush' | 'rubber' | 'steel' | 'chrome' | 'dark' | 'hazard' | 'lamp' | 'glass'

const FINISH: Record<Finish, { rough: number; metal: number; emit: number; hazard: number; colour: string }> = {
  enamel: { rough: 0.14, metal: 0.12, emit: 0, hazard: 0, colour: '#ffffff' },
  trim: { rough: 0.28, metal: 0.1, emit: 0, hazard: 0, colour: '#ffffff' },
  plush: { rough: 0.85, metal: 0, emit: 0, hazard: 0, colour: '#ffffff' },
  rubber: { rough: 0.92, metal: 0, emit: 0, hazard: 0, colour: PALETTE.rubber },
  steel: { rough: 0.36, metal: 0.92, emit: 0, hazard: 0, colour: PALETTE.steel },
  chrome: { rough: 0.05, metal: 1, emit: 0, hazard: 0, colour: PALETTE.chrome },
  dark: { rough: 0.42, metal: 0.7, emit: 0, hazard: 0, colour: PALETTE.darkMetal },
  hazard: { rough: 0.45, metal: 0.05, emit: 0, hazard: 1, colour: PALETTE.hazard },
  lamp: { rough: 0.3, metal: 0, emit: 1.1, hazard: 0, colour: PALETTE.headlamp },
  glass: { rough: 0.05, metal: 0, emit: 0, hazard: 0, colour: PALETTE.glass },
}

/** Vertex colour, and `aSurf` = (roughness, metalness, glow, hazard). `aRam` bends a ram's instanced shape (see `Rams`). */
function shadeSolid(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aSurf;\nattribute vec2 aRam;\nvarying vec4 vSurf;\nvarying vec3 vObj;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vSurf = aSurf;
      vObj = position;
      #ifdef USE_INSTANCING
      if (aRam.x > 0.5) {
        float D = length(instanceMatrix[2].xyz);
        if (aRam.x < 1.5) transformed.z = position.z / D;
        else if (aRam.x < 2.5) transformed.z = (aRam.y + position.z * (D - aRam.y)) / D;
        else transformed.z = (D + position.z) / D;
      }
      #endif`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vSurf;\nvarying vec3 vObj;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      if (vSurf.w > 0.5) {
        float stripe = step(0.5, fract((vObj.x + vObj.y + vObj.z) * 2.4));
        diffuseColor.rgb = mix(vec3(0.01), diffuseColor.rgb, stripe);
      }`,
    )
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.z;')
}

/**
 * The lit material of every part, in three copies of one look. Three re-reads a material's program
 * whenever consecutive objects drawn with it differ in being instanced or not, or in carrying
 * instance colours or not, so each kind of mesh has its own: `SOLID` for instanced shapes,
 * `SOLID_TINTED` for instanced shapes with an instance colour, `SOLID_MESH` for a plain mesh.
 */
function solidMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 1.0 })
  m.onBeforeCompile = shadeSolid
  return m
}
export const SOLID = solidMaterial()
export const SOLID_TINTED = solidMaterial()
export const SOLID_MESH = solidMaterial()

/** Cab glass and lamp covers: see-through, with sharp reflections. */
export const GLASS = new MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6, depthWrite: false })

// ---------------------------------------------------------------------------------------
// Cached shapes. Every shape is non-indexed, with position and normal only.

const shapes = new Map<string, BufferGeometry>()

function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = shapes.get(key)
  if (!g) {
    g = make()
    if (g.index) g = g.toNonIndexed()
    g.deleteAttribute('uv')
    shapes.set(key, g)
  }
  return g
}

/** A box with rounded edges and corners (r up to half the smallest side). Size along x, y, z. */
export const roundBox = (w: number, h: number, d: number, r: number) =>
  cached(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, r >= 0.18 ? 2 : 1, Math.min(r, w / 2, h / 2, d / 2)))

/** A plain box with sharp edges: 12 triangles, for what is small or hidden. */
export const box = (w: number, h: number, d: number) => cached(`x${w},${h},${d}`, () => new BoxGeometry(w, h, d))

/** A closed cylinder along y, rTop above rBottom (a cone when one is 0). `arc` less than a full turn makes a wedge, a half disc at PI. */
export const cylinder = (rTop: number, rBottom: number, h: number, seg = 20, arc = TAU) => cached(`c${rTop},${rBottom},${h},${seg},${arc}`, () => new CylinderGeometry(rTop, rBottom, h, seg, 1, false, 0, arc))

/** A sphere; scale a part to make an ellipsoid. */
export const sphere = (r: number, seg = 16) => cached(`s${r},${seg}`, () => new SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.62))))

/** An open piece of a cylinder along y, `arc` radians of it starting at +z going toward +x. `inward` flips it to be seen from inside (the inner face of a scoop). */
export const shell = (r: number, h: number, arc: number, inward: boolean, seg = 24) =>
  cached(`h${r},${h},${arc},${inward},${seg}`, () => {
    const g = new CylinderGeometry(r, r, h, seg, 1, true, 0, arc)
    if (inward) {
      const index = g.index!
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i)
        index.setX(i, index.getX(i + 2))
        index.setX(i + 2, a)
      }
      const n = g.attributes.normal
      for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
    }
    return g
  })

/** A thick piece of a cylinder wall along y, `arc` radians of it starting at +z going toward +x: an outer face, an inner face, both caps and both ends, smooth on the curve. */
export const thickShell = (rOut: number, rIn: number, h: number, arc: number, seg = 28) =>
  cached(`t${rOut},${rIn},${h},${arc},${seg}`, () => {
    const pos: number[] = []
    const nor: number[] = []
    const tri = (a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3) => {
      pos.push(...a, ...b, ...c)
      nor.push(...na, ...nb, ...nc)
    }
    const quad = (a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3) => {
      tri(a, b, c, na, nb, nc)
      tri(a, c, d, na, nc, nd)
    }
    const at = (r: number, y: number, th: number): V3 => [r * Math.sin(th), y, r * Math.cos(th)]
    const radial = (th: number, k: number): V3 => [k * Math.sin(th), 0, k * Math.cos(th)]
    const up: V3 = [0, 1, 0]
    const down: V3 = [0, -1, 0]
    const y1 = h / 2
    const y0 = -h / 2
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * arc
      const b = ((i + 1) / seg) * arc
      quad(at(rOut, y0, a), at(rOut, y0, b), at(rOut, y1, b), at(rOut, y1, a), radial(a, 1), radial(b, 1), radial(b, 1), radial(a, 1))
      quad(at(rIn, y0, b), at(rIn, y0, a), at(rIn, y1, a), at(rIn, y1, b), radial(b, -1), radial(a, -1), radial(a, -1), radial(b, -1))
      quad(at(rIn, y1, a), at(rOut, y1, a), at(rOut, y1, b), at(rIn, y1, b), up, up, up, up)
      quad(at(rIn, y0, b), at(rOut, y0, b), at(rOut, y0, a), at(rIn, y0, a), down, down, down, down)
    }
    // The two ends, each flat with a normal along the direction the wall turns away from.
    const end = (th: number, flip: number) => {
      const n: V3 = [flip * Math.cos(th), 0, -flip * Math.sin(th)]
      const A = at(rIn, y0, th)
      const B = at(rOut, y0, th)
      const C = at(rOut, y1, th)
      const D = at(rIn, y1, th)
      if (flip > 0) quad(A, B, C, D, n, n, n, n)
      else quad(B, A, D, C, n, n, n, n)
    }
    end(0, -1)
    end(arc, 1)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
    return g
  })

/** A ring of radius 1 and tube radius `tube` in the xy plane, the upper half (an arch): scale it to an ellipse. */
export const arch = (tube: number) => cached(`a${tube}`, () => new TorusGeometry(1, tube, 6, 20, Math.PI))

/** A solid of revolution around y from a profile of (radius, height) points. */
export const lathe = (key: string, profile: readonly (readonly [number, number])[], seg = 24) => cached(`l${key},${seg}`, () => new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), seg))

// ---------------------------------------------------------------------------------------
// Parts and Static.

export interface Part {
  geo: BufferGeometry
  finish: Finish
  at: V3
  /** Euler XYZ in radians. */
  rot: V3
  scale: V3
  /** The colour of a fixed-colour finish, or of enamel in place of the paint. */
  colour: string | null
  /** Multiplies the colour: 0.6 is a darker paint. */
  tint: number
  /** Takes the colour that stands out from the paint (see `contrastOf`), in place of `colour`. */
  contrast: boolean
  /** Internal to `Rams`: 1 stays at the near end, 2 stretches along the ram, 3 sits at the far end; `start` is where the rod starts. */
  ram: 0 | 1 | 2 | 3
  start: number
}

export interface PartOptions {
  rot?: V3
  scale?: V3
  colour?: string
  tint?: number
  contrast?: boolean
}

const NO_ROT: V3 = [0, 0, 0]
const ONE: V3 = [1, 1, 1]

/** A part: `geo` (from `roundBox`, `cylinder`, `sphere`, `shell`, `lathe`) in a finish at a place, with optional rotation, scale, colour, tint, contrast. */
export function part(geo: BufferGeometry, finish: Finish, at: V3, o: PartOptions = {}): Part {
  return { geo, finish, at, rot: o.rot ?? NO_ROT, scale: o.scale ?? ONE, colour: o.colour ?? null, tint: o.tint ?? 1, contrast: o.contrast ?? false, ram: 0, start: 0 }
}

/** A colour that stands out from `paint`: cream on a dark paint, blue on a light one. */
export function contrastOf(paint: string): string {
  const c = new Color(paint)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.7 ? '#2e63c9' : '#fbf7ec'
}

const bakeM = new Matrix4()
const bakeQ = new Quaternion()
const bakeE = new Euler()
const bakeP = new Vector3()
const bakeS = new Vector3()

/** Merges parts into one solid geometry and one glass geometry (null when there is no glass). Paint colours the enamel. */
export function bake(parts: readonly Part[], paint: string): Baked {
  const solid: BufferGeometry[] = []
  const glass: BufferGeometry[] = []
  for (const p of parts) {
    const g = p.geo.clone()
    g.applyMatrix4(bakeM.compose(bakeP.set(...p.at), bakeQ.setFromEuler(bakeE.set(...p.rot)), bakeS.set(...p.scale)))
    const f = FINISH[p.finish]
    const c = new Color((p.contrast ? contrastOf(paint) : p.colour) ?? (p.finish === 'enamel' ? paint : f.colour)).multiplyScalar(p.tint)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    const surf = new Float32Array(n * 4)
    const ram = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
      surf.set([f.rough, f.metal, f.emit, f.hazard], i * 4)
      ram.set([p.ram, p.start], i * 2)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    g.setAttribute('aSurf', new Float32BufferAttribute(surf, 4))
    g.setAttribute('aRam', new Float32BufferAttribute(ram, 2))
    ;(p.finish === 'glass' ? glass : solid).push(g)
  }
  const merged = (list: BufferGeometry[]) => {
    const out = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    return out
  }
  return { solid: merged(solid), glass: glass.length > 0 ? merged(glass) : null }
}

/** A merged pair of geometries: the solid one and the glass one (null when there is no glass). */
export interface Baked {
  solid: BufferGeometry
  glass: BufferGeometry | null
}

interface Slot {
  baked: Baked
  paint: string
  /** Mounted components that hold this bake. */
  users: number
  /** A mounted component has held it at some time. */
  held: boolean
  /** Sweeps that found it made but never held: a render that was never committed leaves such a slot, and the second sweep frees it. */
  strikes: number
  /** Order of the last release, so a sweep keeps the newest idle bake of a list. */
  idleAt: number
}

const slots = new Map<readonly Part[], Map<string, Slot>>()
let releases = 0
let sweeping = false

/** Sweeps a never-held bake survives before it is freed. */
const UNHELD_SWEEPS = 2
/** Milliseconds between the sweeps that wait for a never-held bake to be held. */
const UNHELD_WAIT = 1000

const lists = new Map<string, { list: readonly Part[]; source: string }>()

/**
 * The part list of `key`, made once: a stable list for `bakedParts` when a component builds its parts from the
 * numbers in its key. `make` is only called the first time; a key that meets a `make` of other code throws, because
 * the second list would be ignored.
 */
export function partsOf(key: string, make: () => readonly Part[]): readonly Part[] {
  const source = make.toString()
  const known = lists.get(key)
  if (known === undefined) {
    const list = make()
    lists.set(key, { list, source })
    return list
  }
  if (known.source !== source) throw new Error(`the parts key ${key} is used for two different lists`)
  return known.list
}

/** Disposes every bake that nobody holds, except the newest of each part list: after a repaint or a visit elsewhere the last paint stays for the way back. */
function sweep(): void {
  sweeping = false
  let waiting = false
  const free = (parts: readonly Part[], byPaint: Map<string, Slot>, slot: Slot) => {
    slot.baked.solid.dispose()
    slot.baked.glass?.dispose()
    byPaint.delete(slot.paint)
    if (byPaint.size === 0) slots.delete(parts)
  }
  for (const [parts, byPaint] of [...slots]) {
    const idle: Slot[] = []
    for (const slot of [...byPaint.values()]) {
      if (slot.users > 0) continue
      if (slot.held) idle.push(slot)
      else if (++slot.strikes >= UNHELD_SWEEPS) free(parts, byPaint, slot)
      else waiting = true
    }
    idle.sort((a, b) => b.idleAt - a.idleAt)
    for (const slot of idle.slice(1)) free(parts, byPaint, slot)
  }
  if (waiting) scheduleSweep(UNHELD_WAIT)
}

function scheduleSweep(wait = 0): void {
  if (sweeping) return
  sweeping = true
  setTimeout(sweep, wait)
}

/** The bake of `parts` in `paint`, made once and shared: the same list and paint give the same geometries. Not for use in a frame. */
export function bakedParts(parts: readonly Part[], paint: string): Baked {
  let byPaint = slots.get(parts)
  if (byPaint === undefined) {
    byPaint = new Map()
    slots.set(parts, byPaint)
  }
  let slot = byPaint.get(paint)
  if (slot === undefined) {
    slot = { baked: bake(parts, paint), paint, users: 0, held: false, strikes: 0, idleAt: 0 }
    byPaint.set(paint, slot)
    scheduleSweep()
  }
  return slot.baked
}

/**
 * Marks `baked`, the bake of `parts` in `paint` that a mounted component renders, as held. Returns the call that lets it go.
 * A render that commits after the sweep has freed its bake finds no slot: the geometry is registered again (three uploads a
 * disposed geometry afresh), so a late commit holds a working bake instead of failing.
 */
export function holdBaked(parts: readonly Part[], paint: string, baked: Baked): () => void {
  let byPaint = slots.get(parts)
  if (byPaint === undefined) {
    byPaint = new Map()
    slots.set(parts, byPaint)
  }
  let slot = byPaint.get(paint)
  if (slot === undefined) {
    slot = { baked, paint, users: 0, held: true, strikes: 0, idleAt: 0 }
    byPaint.set(paint, slot)
  }
  const held = slot
  held.users++
  held.held = true
  return () => {
    held.users--
    if (held.users === 0) {
      held.idleAt = ++releases
      scheduleSweep()
    }
  }
}

/** The shared bake of `parts` in `paint` for a mounted component; it stays while any component holds it and the newest one stays after. */
export function useBaked(parts: readonly Part[], paint: string): Baked {
  const baked = useMemo(() => bakedParts(parts, paint), [parts, paint])
  useEffect(() => holdBaked(parts, paint, baked), [parts, paint, baked])
  return baked
}

/** Parts merged into one mesh (and one glass mesh if any part is glass). Pass a module-level `parts` list so it merges once, and then every mount of it shares the merge; a new `paint` merges again. Place it inside a group for a moving link. */
export function Static({ parts, paint, cast = true }: { parts: readonly Part[]; paint: string; cast?: boolean }) {
  const baked = useBaked(parts, paint)
  return h(
    Fragment,
    null,
    h('mesh', { geometry: baked.solid, material: SOLID_MESH, castShadow: cast, receiveShadow: true }),
    baked.glass && h('mesh', { geometry: baked.glass, material: GLASS, renderOrder: 2 }),
  )
}

// ---------------------------------------------------------------------------------------
// Wheels.

/** One wheel: its centre in the machine's frame, and how much of the machine's steering turns it (0 fixed, 1 the front axle, -1 turning the other way). */
export interface WheelSpot {
  x: number
  y: number
  z: number
  steer: number
}

function wheelParts(r: number, w: number): Part[] {
  const lugs = Array.from({ length: 10 }, (_, i) => part(box(w * 0.7, r * 0.14, r * 0.26), 'rubber', [0, 0, 0], { rot: [(i / 10) * TAU, 0, 0] }))
  // The lugs sit on the tyre: lift each along its own radius.
  for (const l of lugs) l.at = [0, Math.cos(l.rot[0]) * r * 0.97, Math.sin(l.rot[0]) * r * 0.97]
  const bolts = [-1, 1].flatMap((side) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * TAU
      return part(cylinder(r * 0.06, r * 0.06, 0.05, 6), 'chrome', [side * (w / 2 + 0.04), Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42], { rot: [0, 0, Math.PI / 2] })
    }),
  )
  const tyre = lathe(`tyre${r},${w}`, [
    [r * 0.55, -w / 2],
    [r * 0.88, -w / 2],
    [r * 0.99, -w * 0.38],
    [r * 0.99, w * 0.38],
    [r * 0.88, w / 2],
    [r * 0.55, w / 2],
  ], 20)
  return [
    part(tyre, 'rubber', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
    ...lugs,
    part(cylinder(r * 0.64, r * 0.64, w + 0.04, 20), 'steel', [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
    ...[-1, 1].map((side) => part(cylinder(r * 0.4, r * 0.46, 0.05, 14), 'enamel', [side * (w / 2 + 0.02), 0, 0], { rot: [0, 0, Math.PI / 2] })),
    ...bolts,
  ]
}

const dummy = new Object3D()

/** All the wheels of one size on a machine: one instanced mesh. Fed `m.rollL` (spots with x above 0), `m.rollR`, `m.steer` and the machine's lock. Hubs wear the paint. */
export function Wheels({ m, paint, radius, width, spots }: { m: Machine; paint: string; radius: number; width: number; spots: readonly WheelSpot[] }) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useBaked(partsOf(`wheels${radius},${width}`, () => wheelParts(radius, width)), paint).solid
  const lock = MACHINE_SPECS[m.kind].lock
  useFrame(() => {
    const mesh = ref.current!
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z)
      dummy.rotation.set((s.x > 0 ? m.rollL : m.rollR) / radius, m.steer * lock * s.steer, 0, 'YXZ')
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return h('instancedMesh', { ref, args: [geo, SOLID, spots.length], frustumCulled: false, castShadow: true, receiveShadow: true })
}

// ---------------------------------------------------------------------------------------
// Treads.

/** A tread: an oval belt on each side, centred at x = +-x, between two end wheels `len` apart (centres), their belt radius `r`, axle height `cy`, belt `width`, `links` of them, middle at z. */
export interface TreadSpec {
  x: number
  z: number
  len: number
  r: number
  cy: number
  width: number
  links: number
}

/** Links running round a stadium path on both sides, read from `m.rollL` (left, x above 0) and `m.rollR`: one instanced mesh. Put `Wheels` (the sprockets) at the two ends inside it. */
export function Treads({ m, paint, spec }: { m: Machine; paint: string; spec: TreadSpec }) {
  const ref = useRef<InstancedMesh>(null)
  const { x, z, len, r, cy, width, links } = spec
  const perimeter = 2 * len + TAU * r
  const pitch = perimeter / links
  const geo = useBaked(
    partsOf(`treads${width},${pitch}`, () => [
      part(box(width, 0.1, pitch * 0.9), 'rubber', [0, 0, 0]),
      part(box(width * 0.9, 0.08, pitch * 0.4), 'dark', [0, 0.07, 0]),
      part(cylinder(0.055, 0.055, width + 0.07, 8), 'steel', [0, 0, -pitch / 2], { rot: [0, 0, Math.PI / 2] }),
    ]),
    paint,
  ).solid
  useFrame(() => {
    const mesh = ref.current!
    for (let side = 0; side < 2; side++) {
      const roll = side === 0 ? m.rollL : m.rollR
      for (let i = 0; i < links; i++) {
        const s = mod((i * perimeter) / links + roll, perimeter)
        let y: number
        let zz: number
        let a: number
        if (s < len) {
          zz = z - len / 2 + s
          y = cy + r
          a = 0
        } else if (s < len + Math.PI * r) {
          const al = (s - len) / r
          zz = z + len / 2 + r * Math.sin(al)
          y = cy + r * Math.cos(al)
          a = al
        } else if (s < 2 * len + Math.PI * r) {
          zz = z + len / 2 - (s - len - Math.PI * r)
          y = cy - r
          a = Math.PI
        } else {
          const al = (s - 2 * len - Math.PI * r) / r
          zz = z - len / 2 - r * Math.sin(al)
          y = cy - r * Math.cos(al)
          a = al - Math.PI
        }
        dummy.position.set(side === 0 ? x : -x, y, zz)
        dummy.rotation.set(a, 0, 0, 'XYZ')
        dummy.updateMatrix()
        mesh.setMatrixAt(side * links + i, dummy.matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return h('instancedMesh', { ref, args: [geo, SOLID, links * 2], frustumCulled: false, castShadow: true, receiveShadow: true })
}

// ---------------------------------------------------------------------------------------
// Rams.

/** Sets ram `i` between two points (a, the barrel's end; b, the rod's tip), in the frame the `Rams` mesh sits in. */
export type SetRam = (i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void

const ramUp = new Vector3()
const ramDir = new Vector3()
const ramPos = new Vector3()
const ramScale = new Vector3()
const ramQ = new Quaternion()
const ramM = new Matrix4()
const ramZero = new Vector3()

/**
 * Hydraulic rams: one instanced mesh of `count` rams, each a dark barrel of fixed length `barrel`
 * and a chrome rod sliding out of it, between two points that move. `update` runs every frame
 * and calls `set` for each ram. Rams of radius `radius` are as thick as the barrel; the rod is 55 percent of that.
 */
export function Rams({ count, radius, barrel, update }: { count: number; radius: number; barrel: number; update: (set: SetRam) => void }) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useBaked(
    partsOf(`rams${radius},${barrel}`, () => {
      const ram = (p: Part, kind: 1 | 2 | 3, start: number) => Object.assign(p, { ram: kind, start })
      return [
        ram(part(cylinder(radius, radius, barrel, 14), 'dark', [0, 0, barrel / 2], { rot: [Math.PI / 2, 0, 0] }), 1, 0),
        ram(part(cylinder(radius * 1.2, radius * 1.2, 0.07, 14), 'steel', [0, 0, barrel - 0.04], { rot: [Math.PI / 2, 0, 0] }), 1, 0),
        ram(part(sphere(radius * 1.3, 10), 'steel', [0, 0, 0]), 1, 0),
        ram(part(cylinder(radius * 0.55, radius * 0.55, 1, 12), 'chrome', [0, 0, 0.5], { rot: [Math.PI / 2, 0, 0] }), 2, barrel * 0.4),
        ram(part(sphere(radius * 0.95, 10), 'steel', [0, 0, 0]), 3, 0),
      ]
    }),
    '#ffffff',
  ).solid
  useFrame(() => {
    const mesh = ref.current!
    update((i, ax, ay, az, bx, by, bz) => {
      ramDir.set(bx - ax, by - ay, bz - az)
      const d = ramDir.length()
      ramUp.set(Math.abs(ramDir.y) > 0.99 * d ? 1 : 0, Math.abs(ramDir.y) > 0.99 * d ? 0 : 1, 0)
      ramQ.setFromRotationMatrix(ramM.lookAt(ramDir, ramZero, ramUp))
      mesh.setMatrixAt(i, ramM.compose(ramPos.set(ax, ay, az), ramQ, ramScale.set(1, 1, d)))
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return h('instancedMesh', { ref, args: [geo, SOLID, count], frustumCulled: false, castShadow: true })
}

// ---------------------------------------------------------------------------------------
// Beacon, mirror, exhaust, mound.

const beaconParts: Part[] = [
  part(cylinder(0.15, 0.17, 0.07, 16), 'dark', [0, 0.035, 0]),
  part(cylinder(0.11, 0.13, 0.16, 16), 'lamp', [0, 0.15, 0], { colour: '#b25f00' }),
  part(sphere(0.11, 12), 'lamp', [0, 0.23, 0], { colour: '#b25f00', scale: [1, 0.7, 1] }),
  part(roundBox(0.05, 0.13, 0.11, 0.02), 'lamp', [0.085, 0.16, 0], { colour: '#ffe58a' }),
  part(roundBox(0.03, 0.1, 0.09, 0.01), 'dark', [-0.07, 0.16, 0]),
]

/** An amber beacon whose lamp turns while `isWorking(m)`, glowing in a sweep. `at` is where its base sits, in the group it is placed in. One mesh. */
export function Beacon({ m, at }: { m: Machine; at: V3 }) {
  const ref = useRef<Mesh>(null)
  const geo = useBaked(beaconParts, '#ffffff').solid
  useFrame((_, dt) => {
    if (isWorking(m)) ref.current!.rotation.y += dt * 7
  })
  return h('mesh', { ref, geometry: geo, material: SOLID_MESH, position: at })
}

/** A wing mirror: an arm and a painted housing with a steel face reaching out from `at` toward +x (side 1, the driver's left) or -x (side -1). A list of parts for a `Static`. */
export function mirror(at: V3, side: 1 | -1): Part[] {
  const [x, y, z] = at
  return [
    part(cylinder(0.025, 0.025, 0.3, 8), 'steel', [x + side * 0.15, y, z], { rot: [0, 0, Math.PI / 2] }),
    part(roundBox(0.06, 0.36, 0.22, 0.03), 'enamel', [x + side * 0.31, y + 0.1, z], { tint: 0.85 }),
    part(roundBox(0.02, 0.3, 0.17, 0.01), 'steel', [x + side * 0.345, y + 0.1, z]),
  ]
}

const puffGeo = bake([part(sphere(1, 10), 'plush', [0, 0, 0], { colour: '#eceef2' })], '#ffffff').solid
const PUFFS = 8

/** Exhaust smoke: a few soft grey puffs rising from `at` and thinning, more when `m.rev` is high. One instanced mesh. */
export function ExhaustPuff({ m, at }: { m: Machine; at: V3 }) {
  const ref = useRef<InstancedMesh>(null)
  useFrame((state) => {
    const mesh = ref.current!
    const strength = 0.3 + 0.7 * clamp01(m.rev)
    for (let i = 0; i < PUFFS; i++) {
      const u = mod(state.clock.elapsedTime * (0.7 + 0.5 * m.rev) + i / PUFFS, 1)
      dummy.position.set(at[0] + Math.sin(i * 2.1 + u * 3) * 0.12 * u, at[1] + u * 1.1, at[2] - u * 0.35)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(Math.max(0.001, (0.05 + 0.12 * u) * Math.sqrt(1 - u) * strength * 1.3))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    dummy.scale.setScalar(1)
    mesh.instanceMatrix.needsUpdate = true
  })
  return h('instancedMesh', { ref, args: [puffGeo, SOLID, PUFFS], frustumCulled: false })
}

/** A lumpy heap of one kind of stuff, a dome of radius 1 and height 1 on a flat base, in that kind's colour. */
function makeMound(kind: LooseKind): BufferGeometry {
  const base = new SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2)
  base.deleteAttribute('uv')
  const p = base.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const zz = p.getZ(i)
    const bump = 1 + 0.07 * Math.sin(x * 7 + zz * 3) + 0.06 * Math.sin(zz * 9 - y * 4)
    p.setXYZ(i, x * bump, y * (0.9 + 0.1 * Math.sin(x * 5 + zz * 6)), zz * bump)
  }
  base.computeVertexNormals()
  const n = p.count
  const col = new Float32Array(n * 3)
  const surf = new Float32Array(n * 4)
  const c = new Color(LOAD_COLOUR[kind])
  for (let i = 0; i < n; i++) {
    const v = 0.88 + 0.12 * Math.sin(p.getX(i) * 11 + p.getZ(i) * 7) + 0.1 * p.getY(i)
    col.set([c.r * v, c.g * v, c.b * v], i * 3)
    surf.set([0.95, 0, 0, 0], i * 4)
  }
  base.setAttribute('color', new Float32BufferAttribute(col, 3))
  base.setAttribute('aSurf', new Float32BufferAttribute(surf, 4))
  base.setAttribute('aRam', new Float32BufferAttribute(new Float32Array(n * 2), 2))
  return base
}

const MOUNDS = Object.fromEntries(LOOSE_KINDS.map((kind) => [kind, spare(makeMound(kind))])) as Record<LooseKind, BufferGeometry>

/** The heap shape of one kind of stuff, made once at load with the others so none is made or sent to the graphics card in play. */
export const moundGeo = (kind: LooseKind): BufferGeometry => MOUNDS[kind]

/**
 * What a machine carries: a heap in `m.load.kind`'s colour, `size` (x, y, z half-sizes) when `m.load.amount` reaches `full`,
 * growing with the amount and hidden when empty. Put it in the group of the bucket, bed or hopper; its base is at `at`, its
 * dome rises along +y of that group (rotate the group around it to open the other way). One mesh.
 */
export function Mound({ m, full, size, at }: { m: { load: Load }; full: number; size: V3; at: V3 }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const mesh = ref.current!
    const f = clamp01(m.load.amount / full)
    mesh.visible = f > 0.02
    mesh.geometry = moundGeo(m.load.kind)
    const k = 0.3 + 0.7 * Math.sqrt(f)
    mesh.scale.set(size[0] * k, size[1] * (0.25 + 0.75 * f), size[2] * k)
  })
  return h('mesh', { ref, geometry: moundGeo('dirt'), material: SOLID_MESH, position: at, castShadow: true })
}
