import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { PUFF_KINDS, type Puff, type PuffKind } from '../engine/types'
import { heart } from './face'
import { colorOf } from './look'
import { PUFF_CAP } from './puffCap'

/**
 * The puffs: every kind its own little shape in one instanced mesh, so 600 of them draw in
 * a dozen calls. The sim moves them; here each pops in, lives its way (smoke swells, fire
 * flickers, hearts beat, leaves and confetti tumble, flat things turn to the camera) and
 * shrinks away at the end of its life. A puff's size is how big it is across. They read only
 * the world's clock and its puffs (PuffSource), so another game's scene can hand its own. A flat
 * puff turns to the live camera, so it reads from any view: Silly Billy's fixed diorama angle and
 * Magic House's side view alike.
 */

/** What is read of a puff: its kind, where it is, its colour and size, when it was born and how long it lives; the way it flies across tells puffs from one burst apart. */
export type PuffSeen = Pick<Puff, 'kind' | 'x' | 'y' | 'z' | 'vx' | 'vz' | 'color' | 'size' | 'born' | 'life'>

/** What the puffs read every frame: the world as it is now (a new one may come any frame), its clock in seconds and its puffs. Silly Billy's Stage hands its SceneSource. */
export interface PuffSource {
  readonly world: { readonly t: number; readonly puffs: readonly PuffSeen[] }
}

/** As many as the sim keeps at once (puffCap.ts). */
const CAP = PUFF_CAP

/** How a kind turns: toward the camera (flat shapes), tumbling, spinning upright, or not at all. */
type Turn = 'face' | 'tumble' | 'spin' | 'none'

interface Kind {
  geometry: BufferGeometry
  material: Material
  turn: Turn
  /** The size over its life, k from 0 to 1, age in seconds, a number of its own. */
  size: (k: number, age: number, seed: number) => number
  /** Taller than wide: fire licks up, drops fall. */
  tall: number
}

function outline(points: [number, number][], depth: number): BufferGeometry {
  return new ExtrudeGeometry(new Shape(points.map(([x, y]) => new Vector2(x, y))), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2)
}

/** A five-pointed star half a unit across, flat along z. */
export function star(): BufferGeometry {
  const points: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2
    const r = i % 2 === 0 ? 0.5 : 0.22
    points.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return outline(points, 0.14)
}

function note(): BufferGeometry {
  const head = new SphereGeometry(0.17, 8, 6).scale(1.25, 0.9, 0.5).rotateZ(0.4).translate(-0.12, -0.3, 0)
  const stem = new BoxGeometry(0.06, 0.65, 0.08).translate(0.06, 0.02, 0)
  const flag = new BoxGeometry(0.22, 0.07, 0.08).rotateZ(-0.6).translate(0.15, 0.28, 0)
  return mergeGeometries([head, stem, flag].map((g) => g.toNonIndexed()))!
}

function leaf(): BufferGeometry {
  const points: [number, number][] = []
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2
    points.push([Math.cos(a) * 0.5, Math.sin(a) * 0.22 * (1 - 0.5 * Math.cos(a) ** 8)])
  }
  return outline(points, 0.04)
}

function flake(): BufferGeometry {
  return mergeGeometries([0, 1, 2].map((i) => new BoxGeometry(1, 0.1, 0.06).rotateZ((i * Math.PI) / 3).toNonIndexed()))!
}

/** A water drop a unit tall, its point up. */
export const drop = () =>
  new LatheGeometry(
    [
      [0, -0.5],
      [0.25, -0.38],
      [0.32, -0.15],
      [0.18, 0.15],
      [0, 0.5],
    ].map(([x, y]) => new Vector2(x, y)),
    8,
  )

const lit = () => new MeshStandardMaterial({ flatShading: true, roughness: 0.8 })
const shine = () => new MeshBasicMaterial()

/** Pops in over its first tenth of a second and shrinks away over the last third of its life. */
const fade = (k: number, age: number) => Math.min(1, age / 0.1, (1 - k) / 0.3)

const KINDS: Record<PuffKind, Kind> = {
  dust: { geometry: new IcosahedronGeometry(0.5, 0), material: lit(), turn: 'spin', size: (k, age) => fade(k, age) * (0.8 + 0.6 * k), tall: 1 },
  spark: { geometry: new OctahedronGeometry(0.5), material: shine(), turn: 'spin', size: (k, age, seed) => fade(k, age) * (0.7 + 0.3 * Math.sin(age * 30 + seed * 9)), tall: 1.6 },
  heart: { geometry: heart(1), material: shine(), turn: 'face', size: (k, age) => fade(k, age) * (1 + 0.15 * Math.sin(age * 12)), tall: 1 },
  star: { geometry: star(), material: shine(), turn: 'face', size: (k, age) => fade(k, age), tall: 1 },
  drop: { geometry: drop(), material: lit(), turn: 'none', size: (k, age) => fade(k, age), tall: 1.2 },
  note: { geometry: note(), material: lit(), turn: 'face', size: (k, age) => fade(k, age), tall: 1 },
  bubble: { geometry: new SphereGeometry(0.5, 10, 8), material: new MeshStandardMaterial({ transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }), turn: 'none', size: (k, age, seed) => (k > 0.92 ? 0 : Math.min(1, age / 0.15) * (1 + 0.08 * Math.sin(age * 9 + seed * 7))), tall: 1 },
  leaf: { geometry: leaf(), material: lit(), turn: 'tumble', size: (k, age) => fade(k, age), tall: 1 },
  snow: { geometry: flake(), material: shine(), turn: 'tumble', size: (k, age) => fade(k, age), tall: 1 },
  confetti: { geometry: new BoxGeometry(1, 0.08, 0.6), material: lit(), turn: 'tumble', size: (k, age) => fade(k, age), tall: 1 },
  smoke: { geometry: new IcosahedronGeometry(0.5, 1), material: lit(), turn: 'spin', size: (k, age) => Math.min(1, age / 0.15, (1 - k) / 0.25) * (0.6 + 1.4 * k), tall: 1 },
  fire: { geometry: new ConeGeometry(0.4, 1, 6), material: shine(), turn: 'spin', size: (k, age, seed) => fade(k, age) * (1 - 0.5 * k) * (1 + 0.25 * Math.sin(age * 28 + seed * 11)), tall: 1.5 },
}

/** A number of its own for every puff, the same all its life, so puffs from one burst turn apart: from the way it flies across, which the drag never turns (it slows vx and vz alike) and the wind never touches (it moves x, never vx). */
const seedOf = (p: PuffSeen) => {
  const v = Math.sin(p.born * 12.9898 + p.size * 78.233 + p.life * 37.719 + Math.atan2(p.vz, p.vx) * 3.1) * 43758.5453
  return v - Math.floor(v)
}

const scratch = new Object3D()
/** The camera's turn this frame, and a flat puff's own little rock round the line it is seen along. */
const facing = new Quaternion()
const rock = new Quaternion()
const ALONG = new Vector3(0, 0, 1)
const colours = new Map<string, Color>()
/** A puff's colour, kept for next time; made code may throw a new colour every frame, so the store starts over when it is full. */
function colour(c: string): Color {
  let known = colours.get(c)
  if (known === undefined) {
    if (colours.size >= 512) colours.clear()
    known = new Color(colorOf(c))
    colours.set(c, known)
  }
  return known
}

class PuffLayer {
  readonly root = new Group()
  private readonly meshes = {} as Record<PuffKind, InstancedMesh>
  private readonly counts = {} as Record<PuffKind, number>

  constructor() {
    const white = new Color('#ffffff')
    for (const kind of PUFF_KINDS) {
      const k = KINDS[kind]
      const m = new InstancedMesh(k.geometry, k.material, CAP)
      for (let i = 0; i < CAP; i++) m.setColorAt(i, white)
      m.count = 0
      m.frustumCulled = false
      this.meshes[kind] = m
      this.root.add(m)
    }
  }

  update(world: PuffSource['world'], camera: Camera) {
    camera.getWorldQuaternion(facing)
    for (const kind of PUFF_KINDS) this.counts[kind] = 0
    for (const p of world.puffs) {
      const kind = KINDS[p.kind]
      const age = Math.max(0, world.t - p.born)
      const k = Math.min(1, age / p.life)
      const seed = seedOf(p)
      const size = p.size * kind.size(k, age, seed)
      scratch.position.set(p.x, p.y, p.z)
      switch (kind.turn) {
        case 'face':
          // Turned as the camera is, so it faces it square, then rocked round the line of sight.
          scratch.quaternion.copy(facing).multiply(rock.setFromAxisAngle(ALONG, 0.35 * Math.sin(age * 5 + seed * 6)))
          break
        case 'tumble':
          scratch.rotation.set(age * (3 + 4 * seed), age * 2 + seed * 6, age * (2 + 3 * seed), 'XYZ')
          break
        case 'spin':
          scratch.rotation.set(0, age * (1.5 + 2 * seed) + seed * 6, 0, 'XYZ')
          break
        case 'none':
          scratch.rotation.set(0, 0, 0, 'XYZ')
          break
      }
      scratch.scale.set(size, size * kind.tall, size)
      scratch.updateMatrix()
      const mesh = this.meshes[p.kind]
      const i = this.counts[p.kind]++
      mesh.setMatrixAt(i, scratch.matrix)
      mesh.setColorAt(i, colour(p.color))
    }
    for (const kind of PUFF_KINDS) {
      const m = this.meshes[kind]
      m.count = this.counts[kind]
      if (m.count === 0) continue
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    }
  }

  dispose() {
    for (const kind of PUFF_KINDS) this.meshes[kind].dispose()
  }
}

export function Effects({ source }: { source: PuffSource }) {
  const layer = useMemo(() => new PuffLayer(), [])
  useEffect(() => () => layer.dispose(), [layer])
  useFrame(({ camera }) => layer.update(source.world, camera))
  return <primitive object={layer.root} />
}
