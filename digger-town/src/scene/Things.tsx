/**
 * Things a hook or forks carry: pallets of bricks and planks, and the pieces of the bridge, the
 * playground and the clock. Each kind is one instanced mesh. This file also holds what its
 * sibling scene files share: the instance setter `put`, the cached baked shapes, and the
 * pieces' part lists, which `Builds.tsx` draws again where a piece is placed.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, ExtrudeGeometry, InstancedMesh, Object3D, Quaternion, Shape, Vector3, type BufferGeometry } from 'three'

import { mulberry32, TAU } from '../game/math'
import { THING_KINDS, type Sim, type ThingKind } from '../game/model'
import { bake, box, cylinder, part, roundBox, sphere, SOLID, type Finish, type Part, type V3 } from './parts'

const dummy = new Object3D()

/** Sets instance `i` of a mesh: position, yaw, scale, and (rarely) pitch and roll. Allocates nothing. */
export function put(mesh: InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = sx, sz = sx, pitch = 0, roll = 0): void {
  dummy.position.set(x, y, z)
  dummy.rotation.set(pitch, yaw, roll, 'YXZ')
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

const baked = new Map<string, BufferGeometry>()

/** A merged solid geometry from a part list, made once per key. */
export function solidGeo(key: string, parts: readonly Part[], paint = '#ffffff'): BufferGeometry {
  let g = baked.get(key)
  if (!g) {
    g = bake(parts, paint).solid
    baked.set(key, g)
  }
  return g
}

/** A flat polygon (x, y points) pushed out `depth` along z, centred on z = 0, as a prism for a part. */
export function prism(key: string, points: readonly (readonly [number, number])[], depth: number): BufferGeometry {
  const id = `prism${key}`
  let g = baked.get(id)
  if (!g) {
    const shape = new Shape()
    points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
    g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    g.translate(0, 0, -depth / 2)
    g.deleteAttribute('uv')
    baked.set(id, g)
  }
  return g
}

const UP = new Vector3(0, 1, 0)
const qq = new Quaternion()
const ee = new Euler()
const vv = new Vector3()

/** The rotation that turns a part's y axis onto direction d. */
export function aim(d: V3): V3 {
  ee.setFromQuaternion(qq.setFromUnitVectors(UP, vv.set(...d).normalize()))
  return [ee.x, ee.y, ee.z]
}

/** A round rod between two points. */
export function rod(a: V3, b: V3, r: number, colour: string, finish: Finish = 'trim', seg = 8): Part {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  return part(cylinder(r, r, Math.hypot(...d), seg), finish, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { rot: aim(d), colour })
}

/** A sharp box in a fixed colour, a short way to write most parts. */
export const slab = (w: number, h: number, d: number, at: V3, colour: string, finish: Finish = 'trim', rot?: V3): Part => part(box(w, h, d), finish, at, { colour, rot })
/** A chunky rounded box in a fixed colour. */
export const chunk = (w: number, h: number, d: number, r: number, at: V3, colour: string, finish: Finish = 'trim'): Part => part(roundBox(w, h, d, r), finish, at, { colour })

export const RED = '#e5483f'
export const YELLOW = '#ffcf3a'
export const BLUE = '#2f80e8'
export const GREEN = '#35b86b'
export const ORANGE = '#ff8a2a'
export const PINK = '#ff7fb5'
export const WOOD = '#c98f55'
export const CONCRETE = '#b9bcc2'
export const NAVY = '#26304a'

// ---------------------------------------------------------------------------------------
// Pallets.

const BRICK_REDS = ['#c9442f', '#b73a28', '#d9533a', '#c04a35']
const PLANK_WOODS = ['#e8c48a', '#dcb577', '#f0cf95', '#d9a96a']

/** A wooden pallet 1.2 by 1.0 and 0.15 high: deck boards over three runners. */
const PALLET: Part[] = [
  ...[-0.5, 0, 0.5].map((x) => slab(0.16, 0.1, 0.98, [x, 0.05, 0], '#a97a46', 'plush')),
  ...[-0.42, -0.21, 0, 0.21, 0.42].map((z) => slab(1.2, 0.04, 0.17, [0, 0.13, z], WOOD, 'plush')),
]

/** Two steel straps round a stack of this height. */
const straps = (height: number): Part[] =>
  [-0.22, 0.22].flatMap((z) => [
    slab(1.06, 0.025, 0.05, [0, 0.15 + height + 0.01, z], '#9aa2ad', 'steel'),
    ...[-1, 1].map((s) => slab(0.025, height, 0.05, [s * 0.53, 0.15 + height / 2, z], '#9aa2ad', 'steel')),
  ])

function brickStack(): Part[] {
  const rnd = mulberry32(5)
  const parts: Part[] = []
  for (let layer = 0; layer < 6; layer++) {
    const shift = layer % 2 === 0 ? 0 : 0.12
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        const x = -0.375 + col * 0.25 + shift - (shift > 0 && col === 3 ? 0.5 : 0)
        parts.push(slab(0.235, 0.165, 0.385, [x, 0.15 + 0.0875 + layer * 0.175, -0.2 + row * 0.4], BRICK_REDS[Math.floor(rnd() * 4)]))
      }
    }
  }
  return [...PALLET, ...parts, ...straps(1.05)]
}

function plankStack(): Part[] {
  const rnd = mulberry32(9)
  const parts: Part[] = []
  for (let layer = 0; layer < 5; layer++) {
    for (let k = 0; k < 4; k++) parts.push(slab(1.12, 0.145, 0.195, [(rnd() - 0.5) * 0.06, 0.15 + 0.0725 + layer * 0.15, -0.3 + k * 0.2], PLANK_WOODS[Math.floor(rnd() * 4)], 'plush'))
  }
  return [...PALLET, ...parts, ...straps(0.75).map((p) => Object.assign(p, { colour: '#3b7bd8' }))]
}

// ---------------------------------------------------------------------------------------
// Pieces: the bridge's pier and deck beams, the playground's three, and the clock tower.

/** The pieces a building is made of that are also things; the house's bricks and planks are walls and roofs, drawn by Builds. */
export type PieceKind = Exclude<ThingKind, 'bricks' | 'planks'>

const ASPHALT = '#4a4e57'

/** A deck beam: 5.5 long (z from -2.75 to 2.75), 6 wide, the bank end (-z) a ramp. The top is 0.4 up from the foot. */
const RAMP_TILT = Math.atan(0.4 / 2.5)
const BEAM: Part[] = [
  slab(5.4, 0.5, 5.5, [0, -0.25, 0], CONCRETE),
  chunk(6, 0.4, 3, 0.05, [0, 0.2, 1.25], ASPHALT),
  slab(6, 0.3, 2.55, [0, 0.05, -1.5], ASPHALT, 'trim', [-RAMP_TILT, 0, 0]),
  ...[-1, 1].flatMap((s) => [
    slab(0.25, 0.14, 3, [s * 2.875, 0.45, 1.25], '#d7d9de'),
    ...[-0.05, 0.9, 1.85, 2.7].map((z) => slab(0.12, 0.4, 0.12, [s * 2.85, 0.6, z], BLUE)),
    slab(0.12, 0.09, 3, [s * 2.85, 0.78, 1.25], YELLOW),
    slab(0.08, 0.07, 3, [s * 2.85, 0.6, 1.25], BLUE),
  ]),
  ...[0.2, 1.1, 2.0].map((z) => slab(0.14, 0.012, 0.5, [0, 0.406, z], '#f4f5f7')),
]

/** The pier: a footing, two round columns with bands, a cap the beams rest on (top 1.7), and a lamp post at each edge. */
const PIER: Part[] = [
  slab(5.6, 0.25, 1.9, [0, 0.125, 0], '#8f949c'),
  ...[-1.8, 1.8].flatMap((x) => [
    part(cylinder(0.62, 0.7, 1.2, 18), 'trim', [x, 0.85, 0], { colour: '#b4b8bf' }),
    part(cylinder(0.72, 0.72, 0.1, 18), 'trim', [x, 0.5, 0], { colour: '#7d838c' }),
    part(cylinder(0.68, 0.68, 0.1, 18), 'trim', [x, 1.2, 0], { colour: '#7d838c' }),
  ]),
  slab(3.4, 0.25, 0.3, [0, 0.55, 0], '#a3a8b0'),
  chunk(6, 0.4, 1.6, 0.06, [0, 1.5, 0], '#cfd2d8'),
  ...[-2.75, 2.75].flatMap((x) => [
    rod([x, 1.7, 0], [x, 3.0, 0], 0.06, NAVY, 'dark'),
    part(sphere(0.2, 12), 'lamp', [x, 3.12, 0], { colour: '#ffe9a0' }),
    part(cylinder(0, 0.24, 0.16, 12), 'trim', [x, 3.34, 0], { colour: RED }),
  ]),
]

/** The slide: a ladder, a platform with a roof, and a chute from (-1.8, 2.5) down to (2.0, 0.1), the line animals slide on. */
const SLIDE_TILT = Math.atan(2.4 / 3.8)
const SLIDE: Part[] = [
  ...[-1, 1].flatMap((s) => [
    rod([-3.1, 0, s * 0.32], [-2.62, 2.4, s * 0.32], 0.045, RED),
    rod([-2.62, 0, s * 0.55], [-2.62, 2.85, s * 0.55], 0.06, BLUE),
    rod([-1.45, 0, s * 0.55], [-1.45, 2.85, s * 0.55], 0.06, BLUE),
    slab(1.2, 0.07, 0.07, [-2.04, 2.4, s * 0.55], RED),
    slab(0.07, 0.07, 0.8, [-2.62, 2.7, s * 0.28], RED),
    slab(4.5, 0.17, 0.08, [0.1 + 0.07, 1.25 + 0.14, s * 0.5], RED, 'trim', [0, 0, -SLIDE_TILT]),
    rod([0.6, 0, s * 0.5], [0.6, 0.95, s * 0.5], 0.05, NAVY, 'dark'),
  ]),
  ...[0.35, 0.75, 1.15, 1.55, 1.95].map((y) => slab(0.07, 0.07, 0.64, [-3.1 + (y / 2.4) * 0.48, y, 0], '#ffd9a0')),
  slab(1.3, 0.1, 1.2, [-2.04, 2.4, 0], YELLOW),
  slab(4.5, 0.12, 0.95, [0.068, 1.25, 0], '#ffd23f', 'enamel', [0, 0, -SLIDE_TILT]),
  part(cylinder(0, 1.05, 0.35, 4), 'trim', [-2.04, 2.97, 0], { colour: RED, rot: [0, Math.PI / 4, 0] }),
]

/** The swing's frame: two A-frames and the top bar at 2.55. */
export const SWING_TOP = 2.55
export const SWING_SEAT_X = [-0.65, 0.65] as const
const SWING: Part[] = [
  ...[-1.7, 1.7].flatMap((x) => [rod([x, 0, 1.1], [x, SWING_TOP, 0], 0.07, YELLOW), rod([x, 0, -1.1], [x, SWING_TOP, 0], 0.07, YELLOW), slab(0.1, 0.1, 2.2, [x, 0.05, 0], '#8f949c', 'steel')]),
  rod([-1.85, SWING_TOP, 0], [1.85, SWING_TOP, 0], 0.08, RED),
  ...[-1.7, 1.7].map((x) => part(sphere(0.1, 8), 'trim', [x, SWING_TOP, 0], { colour: RED })),
]
/** One swing seat with its chains, hanging from the pivot at the origin. */
export const SWING_SEAT: Part[] = [
  rod([-0.2, 0, 0], [-0.2, -1.95, 0], 0.017, '#cfd4da', 'steel', 5),
  rod([0.2, 0, 0], [0.2, -1.95, 0], 0.017, '#cfd4da', 'steel', 5),
  chunk(0.56, 0.08, 0.26, 0.03, [0, -1.99, 0], GREEN),
]
const swingSeatsAtRest = (): Part[] => SWING_SEAT_X.flatMap((x) => SWING_SEAT.map((p) => Object.assign({}, p, { at: [p.at[0] + x, p.at[1] + SWING_TOP, p.at[2]] as V3 })))

/** The climbing frame: four posts, rails on every side, a top grid, a platform, a ladder and a flag. */
const CLIMBER: Part[] = [
  ...[-1.2, 1.2].flatMap((x) => [-1.2, 1.2].map((z) => rod([x, 0, z], [x, 2.6, z], 0.075, YELLOW))),
  ...[0.8, 1.6].flatMap((y, level) => {
    const c = level === 0 ? RED : BLUE
    return [-1.2, 1.2].flatMap((s) => [rod([-1.2, y, s], [1.2, y, s], 0.04, c), rod([s, y, -1.2], [s, y, 1.2], 0.04, c)])
  }),
  ...[-1.2, 1.2].flatMap((s) => [rod([-1.2, 2.55, s], [1.2, 2.55, s], 0.06, BLUE), rod([s, 2.55, -1.2], [s, 2.55, 1.2], 0.06, BLUE)]),
  ...[-0.6, 0, 0.6].flatMap((k) => [rod([-1.2, 2.5, k], [1.2, 2.5, k], 0.04, GREEN), rod([k, 2.5, -1.2], [k, 2.5, 1.2], 0.04, ORANGE)]),
  slab(1.2, 0.07, 1.2, [-0.55, 1.2, -0.55], ORANGE),
  ...[-0.5, 0.5].map((x) => rod([x, 0, 1.75], [x, 1.2, 1.2], 0.045, RED)),
  ...[0.3, 0.6, 0.9].map((y) => slab(1.0, 0.06, 0.06, [0, y, 1.75 - (y / 1.2) * 0.55], '#ffd9a0')),
  rod([1.2, 2.6, 1.2], [1.2, 3.1, 1.2], 0.03, '#cfd4da', 'steel'),
  slab(0.45, 0.28, 0.03, [1.42, 2.95, 1.2], RED),
]

/** The clock tower: a stone block (its foot sunk 0.6 into the roof), a red cap, and a clock face on each side. */
export const CLOCK_FACE_Y = 1.1
export const CLOCK_HALF = 1.0
const STONE = '#eadfc8'
const clockFaces = (): Part[] =>
  [0, 1, 2, 3].flatMap((k) => {
    const ry = (k * Math.PI) / 2
    const n: V3 = [Math.sin(ry), 0, Math.cos(ry)]
    const right: V3 = [Math.cos(ry), 0, -Math.sin(ry)]
    const at = (u: number, v: number, lift: number): V3 => [n[0] * (CLOCK_HALF + lift) + right[0] * u, CLOCK_FACE_Y + v, n[2] * (CLOCK_HALF + lift) + right[2] * u]
    const disc = aim(n)
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const th = (i / 12) * TAU
      const big = i % 3 === 0
      const r = big ? 0.56 : 0.6
      return part(box(big ? 0.1 : 0.06, big ? 0.22 : 0.13, 0.03), 'trim', at(Math.sin(th) * r, Math.cos(th) * r, 0.07), { colour: NAVY, rot: [0, ry, -th] })
    })
    return [
      part(cylinder(0.84, 0.84, 0.1, 28), 'trim', at(0, 0, 0.03), { colour: '#e6b422', rot: disc }),
      part(cylinder(0.74, 0.74, 0.08, 28), 'trim', at(0, 0, 0.06), { colour: '#fbfbf6', rot: disc }),
      ...ticks,
      part(sphere(0.07, 8), 'trim', at(0, 0, 0.12), { colour: NAVY }),
    ]
  })

const CLOCK: Part[] = [
  slab(2.0, 2.6, 2.0, [0, 0.7, 0], STONE),
  ...[-1, 1].flatMap((x) => [-1, 1].map((z) => slab(0.2, 2.6, 0.2, [x * 1.0, 0.7, z * 1.0], '#d6c7a6'))),
  slab(2.14, 0.14, 2.14, [0, 0.2, 0], '#d6c7a6'),
  slab(2.3, 0.16, 2.3, [0, 2.0, 0], '#d6c7a6'),
  part(cylinder(0, 1.6, 0.8, 4), 'trim', [0, 2.48, 0], { colour: '#c8403a', rot: [0, Math.PI / 4, 0] }),
  rod([0, 2.85, 0], [0, 3.2, 0], 0.03, '#e6b422', 'steel'),
  part(sphere(0.09, 8), 'trim', [0, 3.22, 0], { colour: '#e6b422' }),
  ...clockFaces(),
]

/** A clock hand, pointing up from its pivot at the origin: scale y to its length. */
export const HAND_PARTS: Part[] = [slab(0.1, 1, 0.035, [0, 0.5, 0], NAVY, 'trim'), slab(0.1, 0.16, 0.035, [0, -0.08, 0], NAVY, 'trim')]
export const HAND_LENGTH = { hour: 0.38, minute: 0.58 } as const
/** The hands' pivot on each face: where an instance of the hand goes, per face yaw. */
export const FACE_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const

/** The part lists of every piece, without what moves on it. */
export const PIECE_PARTS: Record<PieceKind, readonly Part[]> = { pier: PIER, beam: BEAM, slide: SLIDE, swing: SWING, climber: CLIMBER, clock: CLOCK }

/** The 10:10 hands of a still clock, as parts on every face. */
const stillHands = (): Part[] =>
  FACE_YAWS.flatMap((ry) =>
    [
      { len: HAND_LENGTH.hour, angle: (10 + 10 / 60) * (TAU / 12), lift: 0.14 },
      { len: HAND_LENGTH.minute, angle: (10 / 60) * TAU, lift: 0.17 },
    ].map(({ len, angle, lift }) => {
      const along = [Math.cos(ry) * Math.sin(angle), Math.cos(angle), -Math.sin(ry) * Math.sin(angle)]
      const at: V3 = [Math.sin(ry) * (CLOCK_HALF + lift) + (along[0] * len) / 2, CLOCK_FACE_Y + (along[1] * len) / 2, Math.cos(ry) * (CLOCK_HALF + lift) + (along[2] * len) / 2]
      return part(box(0.1, len, 0.035), 'trim', at, { colour: NAVY, rot: [0, ry, -angle] })
    }),
  )

/** What a carried or standing thing of this kind looks like: the piece with its moving parts at rest. */
function thingParts(kind: ThingKind): readonly Part[] {
  if (kind === 'bricks') return brickStack()
  if (kind === 'planks') return plankStack()
  if (kind === 'swing') return [...PIECE_PARTS.swing, ...swingSeatsAtRest()]
  if (kind === 'clock') return [...PIECE_PARTS.clock, ...stillHands()]
  return PIECE_PARTS[kind]
}

// ---------------------------------------------------------------------------------------
// The component.

/** How many of each kind can stand at once: pallets pile up, a piece is one of a few. */
const CAPACITY: Record<ThingKind, number> = { bricks: 48, planks: 48, pier: 8, beam: 8, slide: 8, swing: 8, climber: 8, clock: 8 }

/** Every thing that is not gone, one instanced mesh per kind, at its own x, y, z and yaw. */
export function Things({ sim }: { sim: Sim }) {
  const meshes = useRef<Partial<Record<ThingKind, InstancedMesh>>>({})
  const counts = useRef<Record<ThingKind, number>>({ bricks: 0, planks: 0, pier: 0, beam: 0, slide: 0, swing: 0, climber: 0, clock: 0 })
  useFrame(() => {
    const n = counts.current
    for (const k of THING_KINDS) n[k] = 0
    for (const t of sim.things) {
      if (t.gone) continue
      if (n[t.kind] >= CAPACITY[t.kind]) throw new Error(`more than ${CAPACITY[t.kind]} things of kind ${t.kind}`)
      put(meshes.current[t.kind]!, n[t.kind]++, t.x, t.y, t.z, t.yaw)
    }
    for (const k of THING_KINDS) {
      const mesh = meshes.current[k]!
      mesh.count = n[k]
      mesh.visible = n[k] > 0
      mesh.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      {THING_KINDS.map((k) => (
        <instancedMesh key={k} ref={(m) => void (m && (meshes.current[k] = m))} args={[solidGeo(`thing${k}`, thingParts(k)), SOLID, CAPACITY[k]]} frustumCulled={false} receiveShadow visible={false} />
      ))}
    </>
  )
}
