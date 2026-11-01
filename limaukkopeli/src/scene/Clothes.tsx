import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import {
  Box3,
  type BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  type Group,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import { ITEMS, SLOTS, type ItemId, type Outfit, type Slot } from '../game/closet'
import { mulberry32 } from '../game/math'
import { palette } from './look'
import { ARM, EYE, HAT, NECK_Y, SHIRT, SKIRT_Y, girth, newPose, onBody, type Pose } from './slimeShape'
import { DOME, HEART, ROUND, STAR, STILL, TAU, geo, heartPoints, lazy, mat, merged, placed, tint, type Turn, type V3 } from './toy'

/**
 * What the slime wears: all 28 things as rounded toy models in their ITEMS colour, each
 * fitted to the radius-1 body of slimeShape (bottom at y = 0, centre at y = 1, facing +Z,
 * its own left at +X). Hats sit on top behind the eyes, glasses over the eyes, shirts are
 * a band of cloth round the middle with puffed sleeves, skirts flare from the lower body,
 * bags hang from the right hand, across the body or on the back, neck things sit round
 * the neck line. Everything but the glasses squashes with the jelly; on top of that each
 * place moves from the body's pose: the hat flies off at a knock and drops back on, the
 * glasses ride the eyes, the skirt twirls and flares in a jump, the handbag swings from
 * the hand (and goes into the jelly with it when the arms are pulled in), the backpack
 * hops, the shoulder bag swings and the scarf streams in the wind.
 */

/** The body's surface at body height `ys`, `off` out along its normal: the distance from the middle line and the height. */
function surf(ys: number, off: number): [number, number] {
  const u = ys - 1
  return [(1 + off) * Math.sqrt(Math.max(0, 1 - u * u)), 1 + (1 + off) * u]
}

/** A band of cloth hugging the body from height lo to hi, `off` out from it, open at both ends. */
function bandGeometry(lo: number, hi: number, off: number) {
  const points: Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const [r, y] = surf(lo + ((hi - lo) * i) / 12, off)
    points.push(new Vector2(r, y))
  }
  return new LatheGeometry(points, 48)
}

/** A rolled edge lying level round the body at height `ys`. */
function hemGeometry(ys: number, off: number, tube: number) {
  const [r, y] = surf(ys, off)
  return new TorusGeometry(r, tube, 8, 48).rotateX(Math.PI / 2).translate(0, y, 0)
}

/** A skirt or a hat brim turned round the middle line from its outline (distance out, height). */
function latheGeometry(outline: readonly (readonly [number, number])[], phi: number, arc: number) {
  return new LatheGeometry(
    outline.map(([r, y]) => new Vector2(r, y)),
    Math.max(4, Math.round((56 * arc) / TAU)),
    phi,
    arc,
  )
}

/**
 * Where a flat decoration sits on a lathe outline: `along` 0 to 1 down the outline, `phi`
 * round from the front toward its left, `lift` out from the surface, facing out.
 */
function onLathe(outline: readonly (readonly [number, number])[], along: number, phi: number, lift: number, spin: number) {
  const f = along * (outline.length - 1)
  const i = Math.min(outline.length - 2, Math.floor(f))
  const [r0, y0] = outline[i]!
  const [r1, y1] = outline[i + 1]!
  const k = f - i
  const len = Math.hypot(r1 - r0, y1 - y0)
  // The outward normal of the outline: turned a quarter from its direction down the skirt.
  const nr = (y0 - y1) / len
  const ny = (r1 - r0) / len
  const r = r0 + (r1 - r0) * k + lift * nr
  const y = y0 + (y1 - y0) * k + lift * ny
  return { position: [r * Math.sin(phi), y, r * Math.cos(phi)] as V3, rotation: [-Math.asin(ny), phi, spin, 'YXZ'] as Turn }
}

/** A little flower facing +Z, about 1.2 across: five petals, and its middle apart (another colour). */
const PETALS = lazy(() =>
  merged(
    [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * TAU + Math.PI / 2
      return placed(ROUND, [0.33 * Math.cos(a), 0.33 * Math.sin(a), 0], [0, 0, a, 'XYZ'], [0.31, 0.21, 0.09])
    }),
  ),
)
const MIDDLE = lazy(() => placed(ROUND, [0, 0, 0.07], STILL, [0.2, 0.2, 0.12]))
/** A twinkle: two thin crossed blades. */
const SPARK = lazy(() => merged([placed(ROUND, [0, 0, 0], STILL, [0.16, 1, 0.1]), placed(ROUND, [0, 0, 0], STILL, [1, 0.16, 0.1])]))
/** A fluffy pompom about two units across. */
const POMPOM = lazy(() => {
  const rand = mulberry32(11)
  const parts = [placed(ROUND, [0, 0, 0], STILL, 0.78)]
  for (let i = 0; i < 12; i++) {
    const a = rand() * TAU
    const z = rand() * 2 - 1
    const s = Math.sqrt(1 - z * z)
    parts.push(placed(ROUND, [0.6 * s * Math.cos(a), 0.6 * z, 0.6 * s * Math.sin(a)], STILL, 0.42))
  }
  return merged(parts)
})

/** Flowers spread over spots: petals in turn in each of `kinds` colours, the middles all together. */
function flowerBed(spots: readonly { position: V3; rotation: Turn }[], size: number, kinds: number) {
  const petals: BufferGeometry[][] = Array.from({ length: kinds }, () => [])
  const middles: BufferGeometry[] = []
  spots.forEach((s, i) => {
    petals[i % kinds]!.push(placed(PETALS(), s.position, s.rotation, size))
    middles.push(placed(MIDDLE(), s.position, s.rotation, size))
  })
  return { petals: petals.map(merged), middles: merged(middles) }
}

// ------------------------------------------------------------------ hats (body frame; they fly about HAT)

/** How far each hat reaches above the top of the head (body units): babies and the little fish sit up there. */
const HAT_TOP: Partial<Record<ItemId, number>> = { cap: 0.36, beanie: 0.48, sunhat: 0.28, crown: 0.5, flowers: 0.16, bow: 0.4 }

/** How far the hat in an outfit reaches above the head, 0 with none. */
export function hatTop(outfit: Outfit) {
  if (outfit.hat === null) return 0
  const top = HAT_TOP[outfit.hat]
  if (top === undefined) throw new Error(`${outfit.hat} is worn as a hat but has no height`)
  return top
}

function Cap() {
  const blue = mat(ITEMS.cap.colour, 'cloth')
  return (
    <group>
      <mesh geometry={DOME} material={blue} position={[0, 1.77, -0.14]} scale={[0.7, 0.58, 0.7]} castShadow />
      <mesh geometry={ROUND} material={blue} position={[0, 1.97, 0.56]} rotation={[-0.2, 0, 0]} scale={[0.27, 0.04, 0.5]} castShadow />
      <mesh geometry={ROUND} material={mat('#ffffff', 'cloth')} position={[0, 2.35, -0.14]} scale={0.08} />
      <mesh geometry={STAR()} material={mat('#ffd23f', 'plain')} position={[0, 2.08, 0.47]} rotation={[-0.62, 0, 0]} scale={0.12} />
    </group>
  )
}

function Beanie() {
  const red = mat(ITEMS.beanie.colour, 'knit')
  const white = mat('#fffaf2', 'knit')
  return (
    <group position={[0, 1.72, -0.38]} rotation={[-0.4, 0, 0]}>
      <mesh geometry={DOME} material={red} scale={0.72} castShadow />
      <mesh geometry={geo('beanie:cuff', () => new TorusGeometry(0.73, 0.1, 12, 48).rotateX(Math.PI / 2))} material={mat(tint(ITEMS.beanie.colour, -0.08), 'knit')} castShadow />
      {[0.26, 0.44].map((h) => (
        <mesh key={h} geometry={geo(`beanie:stripe:${h}`, () => new TorusGeometry(Math.sqrt(0.72 * 0.72 - h * h) + 0.006, 0.035, 8, 48).rotateX(Math.PI / 2).translate(0, h, 0))} material={white} />
      ))}
      <mesh geometry={POMPOM()} material={white} position={[0, 0.76, 0]} scale={0.21} castShadow />
    </group>
  )
}

const SUNHAT_CROWN = [
  [0.5, 0],
  [0.5, 0.18],
  [0.47, 0.27],
  [0.38, 0.33],
  [0.2, 0.36],
  [0, 0.37],
] as const
const SUNHAT_BRIM = [
  [0.48, 0.01],
  [0.7, -0.01],
  [0.9, -0.05],
  [1.03, -0.1],
  [1.07, -0.125],
  [1.05, -0.14],
] as const

function Sunhat() {
  const straw = mat(ITEMS.sunhat.colour, 'cloth')
  const weave = mat(tint(ITEMS.sunhat.colour, -0.1), 'cloth')
  return (
    <group position={[0, 1.84, -0.12]} rotation={[-0.38, 0, 0.1]}>
      <mesh geometry={geo('sunhat:crown', () => latheGeometry(SUNHAT_CROWN, 0, TAU))} material={straw} castShadow />
      <mesh geometry={geo('sunhat:brim', () => latheGeometry(SUNHAT_BRIM, 0, TAU))} material={straw} castShadow />
      {[0.7, 0.9].map((r) => (
        <mesh key={r} geometry={geo(`sunhat:weave:${r}`, () => new TorusGeometry(r, 0.012, 6, 56).rotateX(Math.PI / 2).translate(0, r === 0.7 ? -0.005 : -0.045, 0))} material={weave} />
      ))}
      <mesh geometry={geo('sunhat:band', () => new TorusGeometry(0.5, 0.05, 8, 48).rotateX(Math.PI / 2).translate(0, 0.07, 0))} material={mat('#ff7f5e', 'satin')} />
      <group position={[0.43, 0.1, 0.27]} rotation={[0, 1.0, 0]}>
        <mesh geometry={PETALS()} material={mat('#ffffff', 'cloth')} scale={0.17} />
        <mesh geometry={MIDDLE()} material={mat('#ffd23f', 'cloth')} scale={0.17} />
      </group>
    </group>
  )
}

const CROWN_BAND = [
  [0.4, 0],
  [0.42, 0.02],
  [0.42, 0.18],
  [0.4, 0.2],
  [0.37, 0.18],
  [0.37, 0.02],
  [0.4, 0],
] as const
const GEMS = ['#ff3b6b', '#3f8fe0', '#5ec25a', '#ff8fc8', '#5fd8f0']

function Crown() {
  const gold = mat(ITEMS.crown.colour, 'gold')
  return (
    <group position={[0, 1.86, -0.1]} rotation={[-0.15, 0, 0]} scale={1.25}>
      <mesh geometry={geo('crown:band', () => latheGeometry(CROWN_BAND, 0, TAU))} material={gold} castShadow />
      {GEMS.map((gem, i) => {
        const a = (i / 5) * TAU
        const b = a + TAU / 10
        return (
          <group key={gem}>
            <mesh geometry={geo('crown:point', () => new ConeGeometry(0.085, 0.24, 20).translate(0, 0.12, 0))} material={gold} position={[0.39 * Math.sin(a), 0.19, 0.39 * Math.cos(a)]} castShadow />
            <mesh geometry={ROUND} material={gold} position={[0.39 * Math.sin(a), 0.45, 0.39 * Math.cos(a)]} scale={0.05} />
            <mesh geometry={ROUND} material={mat(gem, 'plain')} position={[0.425 * Math.sin(b), 0.1, 0.425 * Math.cos(b)]} rotation={[0, b, 0]} scale={[0.06, 0.06, 0.035]} />
          </group>
        )
      })}
    </group>
  )
}

const WREATH = lazy(() => {
  const spots: { position: V3; rotation: Turn }[] = []
  const leaves: BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU
    spots.push({ position: [0.56 * Math.sin(a), 0.06, 0.56 * Math.cos(a)], rotation: [-0.75, a, i, 'YXZ'] })
    const b = a + TAU / 18
    leaves.push(placed(ROUND, [0.58 * Math.sin(b), 0.02, 0.58 * Math.cos(b)], [0, b + Math.PI / 2, 0.5, 'YXZ'], [0.14, 0.055, 0.03]))
  }
  return { ...flowerBed(spots, 0.17, 2), leaves: merged(leaves) }
})

function Flowers() {
  const leaf = mat('#5ec25a', 'cloth')
  const w = WREATH()
  return (
    <group position={[0, 1.9, -0.12]} rotation={[-0.35, 0, 0]}>
      <mesh geometry={geo('wreath:ring', () => new TorusGeometry(0.56, 0.045, 8, 48).rotateX(Math.PI / 2))} material={leaf} />
      <mesh geometry={w.leaves} material={leaf} />
      <mesh geometry={w.petals[0]!} material={mat(ITEMS.flowers.colour, 'cloth')} castShadow />
      <mesh geometry={w.petals[1]!} material={mat('#ffffff', 'cloth')} castShadow />
      <mesh geometry={w.middles} material={mat('#ffd23f', 'cloth')} />
    </group>
  )
}

/** White dots round each loop of the bow, on its front and its back, laid out the way the loops are turned. */
const BOW_DOTS = lazy(() => {
  const parts: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const turn = side * 0.32
    for (const face of [1, -1])
      for (const a of [0.5, 1.9, 3.3, 4.7]) {
        const x = 0.247 * Math.cos(a + (side === 1 ? 0 : Math.PI))
        const y = 0.18 * Math.sin(a)
        parts.push(placed(ROUND, [side * 0.27 + x * Math.cos(turn) - y * Math.sin(turn), 0.13 + x * Math.sin(turn) + y * Math.cos(turn), face * 0.064], STILL, [0.03, 0.03, 0.012]))
      }
  }
  return merged(parts)
})

function Bow() {
  const pink = mat(ITEMS.bow.colour, 'satin')
  const deep = mat(tint(ITEMS.bow.colour, -0.1), 'satin')
  return (
    <group position={[0, 2.0, -0.28]} rotation={[0.1, 0, 0]}>
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('bow:loop', () => new TorusGeometry(0.19, 0.08, 12, 32))} material={pink} position={[side * 0.27, 0.13, 0]} rotation={[0, 0, side * 0.32]} scale={[1.3, 0.95, 0.75]} castShadow />
      ))}
      {[1, -1].map((side) => (
        <mesh key={side} geometry={ROUND} material={deep} position={[side * 0.1, -0.07, 0.02]} rotation={[0, 0, side * 0.45]} scale={[0.07, 0.2, 0.035]} />
      ))}
      <mesh geometry={ROUND} material={deep} position={[0, 0.11, 0]} scale={[0.12, 0.11, 0.1]} castShadow />
      <mesh geometry={BOW_DOTS()} material={mat('#ffffff', 'plain')} />
    </group>
  )
}

// ------------------------------------------------------------------ glasses (in the eyes' frame: eyes at (±EYE.x, 0, 0), EYE.r round)

/** A rim lying on the front of each eye, `radius` round and `tube` thick, and the lens bulging over it. */
function rimAt(radius: number) {
  const lens = EYE.r + 0.03
  return { z: Math.sqrt(lens * lens - radius * radius), lens, angle: Math.asin(radius / lens) }
}

/** The temples going back from the outer side of each rim, and the bridge over the gap between the eyes. */
function FrameBits({ frame, radius }: { frame: Material; radius: number }) {
  const { z } = rimAt(radius)
  const gap = EYE.x - radius
  return (
    <>
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('glasses:temple', () => new CapsuleGeometry(0.022, 0.42, 4, 8).rotateX(Math.PI / 2))} material={frame} position={[side * (EYE.x + radius + 0.06), 0.03, z - 0.23]} rotation={[0, side * 0.25, 0]} />
      ))}
      <mesh geometry={geo(`glasses:bridge:${gap}`, () => new TorusGeometry(gap, 0.03, 8, 20, Math.PI).scale(1, 0.45, 1))} material={frame} position={[0, 0.05, z + 0.1]} />
    </>
  )
}

function RoundGlasses() {
  const frame = mat(ITEMS.roundGlasses.colour, 'plain')
  const { z, lens, angle } = rimAt(0.34)
  return (
    <group>
      {[1, -1].map((side) => (
        <group key={side} position={[side * EYE.x, 0, 0]}>
          <mesh geometry={geo('glasses:rim:round', () => new TorusGeometry(0.34, 0.04, 10, 40))} material={frame} position={[0, 0, z]} />
          <mesh geometry={geo('glasses:lens:round', () => new SphereGeometry(lens, 32, 10, 0, TAU, 0, angle).rotateX(Math.PI / 2))} material={mat('#d6f1ff', 'glass')} />
        </group>
      ))}
      <FrameBits frame={frame} radius={0.34} />
    </group>
  )
}

function Sunglasses() {
  const frame = mat(ITEMS.sunglasses.colour, 'plain')
  const { z, lens, angle } = rimAt(0.36)
  return (
    <group>
      {[1, -1].map((side) => (
        <group key={side} position={[side * EYE.x, 0, 0]}>
          <mesh geometry={geo('glasses:rim:sun', () => new TorusGeometry(0.36, 0.055, 10, 40))} material={frame} position={[0, 0, z]} />
          <mesh geometry={geo('glasses:lens:sun', () => new SphereGeometry(lens + 0.005, 32, 10, 0, TAU, 0, angle).rotateX(Math.PI / 2))} material={mat('#3a2f5c', 'shade')} />
          <mesh geometry={ROUND} material={mat('#ffffff', 'glow')} position={[-0.16, 0.18, 0.39]} rotation={[-0.41, -0.39, -0.7, 'YXZ']} scale={[0.1, 0.025, 0.012]} />
        </group>
      ))}
      <FrameBits frame={frame} radius={0.36} />
    </group>
  )
}

/** The heart glasses' frame (a tube round the heart) and lens, about 0.7 across, facing +Z. */
const HEART_RIM = lazy(() => new TubeGeometry(new CatmullRomCurve3(heartPoints().map((p) => new Vector3(p.x * 0.34, p.y * 0.34, 0)), true), 96, 0.035, 8, true))
const HEART_LENS = lazy(() => new ShapeGeometry(new Shape(heartPoints().map((p) => new Vector2(p.x * 0.34, p.y * 0.34))), 24))

function HeartGlasses() {
  const frame = mat(ITEMS.heartGlasses.colour, 'plain')
  return (
    <group>
      {[1, -1].map((side) => (
        <group key={side} position={[side * EYE.x, 0.02, EYE.r + 0.05]} rotation={[0, side * 0.12, side * -0.08]}>
          <mesh geometry={HEART_RIM()} material={frame} />
          <mesh geometry={HEART_LENS()} material={mat('#ff9ec0', 'glass')} />
        </group>
      ))}
      <FrameBits frame={frame} radius={0.3} />
    </group>
  )
}

// ------------------------------------------------------------------ shirts (body frame)

/** A plain shirt band, `off` out from the body. */
function Band({ off, material }: { off: number; material: Material }) {
  return <mesh geometry={geo(`shirt:band:${off}`, () => bandGeometry(SHIRT.lo, SHIRT.hi, off))} material={material} castShadow />
}

/** A shirt's rolled hem and collar, and its puffed sleeves where the arms come out. */
function Trim({ off, hem, collar, sleeves }: { off: number; hem: Material; collar: Material; sleeves: Material }) {
  return (
    <>
      <mesh geometry={geo(`shirt:hem:${off}`, () => hemGeometry(SHIRT.lo, off, 0.034))} material={hem} />
      <mesh geometry={geo(`shirt:collar:${off}`, () => hemGeometry(SHIRT.hi, off, 0.038))} material={collar} />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={ROUND} material={sleeves} position={[side * (ARM.x + 0.01), ARM.y, 0]} scale={[0.16, 0.2, 0.2]} castShadow />
      ))}
    </>
  )
}

function Tee() {
  const red = mat(ITEMS.tee.colour, 'cloth')
  const white = mat('#ffffff', 'cloth')
  return (
    <group>
      <Band off={0.035} material={red} />
      <Trim off={0.035} hem={red} collar={white} sleeves={red} />
      <mesh geometry={HEART()} material={white} {...onBody(0, -0.24, 1, 0.06, 0)} scale={0.12} />
      <mesh geometry={STAR()} material={mat('#ffd23f', 'plain')} {...onBody(0, -0.22, -1, 0.06, 0)} scale={0.14} />
    </group>
  )
}

const STRIPE_BANDS = lazy(() => {
  const blue: BufferGeometry[] = []
  const white: BufferGeometry[] = []
  const n = 6
  for (let i = 0; i < n; i++) {
    const lo = SHIRT.lo + ((SHIRT.hi - SHIRT.lo) * i) / n
    const hi = SHIRT.lo + ((SHIRT.hi - SHIRT.lo) * (i + 1)) / n
    ;(i % 2 === 0 ? blue : white).push(bandGeometry(lo, hi, 0.035).toNonIndexed())
  }
  return { blue: merged(blue), white: merged(white) }
})

function StripesShirt() {
  const blue = mat(ITEMS.stripes.colour, 'cloth')
  const stripes = STRIPE_BANDS()
  return (
    <group>
      <mesh geometry={stripes.blue} material={blue} castShadow />
      <mesh geometry={stripes.white} material={mat('#ffffff', 'cloth')} castShadow />
      <Trim off={0.035} hem={blue} collar={blue} sleeves={blue} />
    </group>
  )
}

function Hoodie() {
  const purple = mat(ITEMS.hoodie.colour, 'knit')
  const deep = mat(tint(ITEMS.hoodie.colour, -0.12), 'knit')
  const white = mat('#ffffff', 'plain')
  return (
    <group>
      <Band off={0.045} material={purple} />
      <Trim off={0.045} hem={deep} collar={purple} sleeves={purple} />
      <mesh geometry={ROUND} material={purple} position={[0, 1.1, -0.9]} rotation={[-0.35, 0, 0]} scale={[0.58, 0.36, 0.3]} castShadow />
      <mesh geometry={ROUND} material={deep} position={[0, 1.27, -0.87]} rotation={[-0.35, 0, 0]} scale={[0.43, 0.06, 0.19]} />
      {[1, -1].map((side) => (
        <group key={side} position={[side * 0.13, 0.9, 1.03]} rotation={[0.3, 0, side * 0.05]}>
          <mesh geometry={geo('hoodie:string', () => new CapsuleGeometry(0.018, 0.2, 4, 8))} material={white} />
          <mesh geometry={ROUND} material={white} position={[0, -0.13, 0]} scale={0.03} />
        </group>
      ))}
      <mesh geometry={geo('hoodie:pocket', () => new RoundedBoxGeometry(0.56, 0.2, 0.05, 3, 0.025))} material={deep} {...onBody(0, -0.42, 0.9, 0.06, 0)} />
    </group>
  )
}

/** Knitted ribs round the sweater's hem, and its two white zigzags. */
const SWEATER = lazy(() => {
  const ribs: BufferGeometry[] = []
  const [hemR, hemY] = surf(SHIRT.lo + 0.03, 0.06)
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU
    ribs.push(placed(ROUND, [hemR * Math.sin(a), hemY, hemR * Math.cos(a)], [0, a, 0, 'YXZ'], [0.03, 0.06, 0.03]))
  }
  const zigzags: BufferGeometry[] = []
  for (const ys of [0.66, 0.88]) {
    const [r, y] = surf(ys, 0.058)
    const points: Vector3[] = []
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU
      points.push(new Vector3(r * Math.sin(a), y + (i % 2 === 0 ? 0.035 : -0.035), r * Math.cos(a)))
    }
    zigzags.push(new TubeGeometry(new CatmullRomCurve3(points, true, 'catmullrom', 0.1), 192, 0.018, 6, true).toNonIndexed())
  }
  return { ribs: merged(ribs), zigzags: merged(zigzags) }
})

/** A snowflake about two units across, facing +Z: six arms with little branches. */
const SNOWFLAKE = lazy(() => {
  const parts: BufferGeometry[] = [placed(ROUND, [0, 0, 0], STILL, [0.2, 0.2, 0.1])]
  const arm = new CapsuleGeometry(0.07, 0.8, 4, 8)
  const twig = new CapsuleGeometry(0.06, 0.3, 4, 8)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    parts.push(placed(arm, [0.45 * Math.sin(a), 0.45 * Math.cos(a), 0], [0, 0, -a, 'XYZ'], 1))
    for (const side of [1, -1]) {
      const bx = 0.6 * Math.sin(a)
      const by = 0.6 * Math.cos(a)
      const b = a + side * 0.75
      parts.push(placed(twig, [bx + 0.16 * Math.sin(b), by + 0.16 * Math.cos(b), 0], [0, 0, -b, 'XYZ'], 1))
    }
  }
  return merged(parts)
})

function Sweater() {
  const green = mat(ITEMS.sweater.colour, 'knit')
  const light = mat(tint(ITEMS.sweater.colour, 0.12), 'knit')
  const white = mat('#ffffff', 'knit')
  const s = SWEATER()
  return (
    <group>
      <Band off={0.045} material={green} />
      <Trim off={0.045} hem={light} collar={light} sleeves={green} />
      <mesh geometry={s.ribs} material={light} />
      <mesh geometry={s.zigzags} material={white} />
      <mesh geometry={SNOWFLAKE()} material={white} {...onBody(0, -0.24, 1, 0.07, 0)} scale={0.15} />
      <mesh geometry={SNOWFLAKE()} material={white} {...onBody(0, -0.24, -1, 0.07, 0)} scale={0.15} />
    </group>
  )
}

const FLOWER_SHIRT = lazy(() => {
  const spots: { position: V3; rotation: Turn }[] = []
  const leaves: BufferGeometry[] = []
  for (let i = 0; i < 15; i++) {
    const a = i * 2.39996
    const ys = 0.56 + 0.4 * ((i * 0.618) % 1)
    const g = girth(ys)
    const at = onBody(g * Math.sin(a), ys - 1, g * Math.cos(a), 0.05, i * 0.7)
    spots.push(at)
    leaves.push(placed(ROUND, at.position, at.rotation, [0.06, 0.025, 0.012]).translate(0, -0.035, 0))
  }
  return { ...flowerBed(spots, 0.1, 3), leaves: merged(leaves) }
})

function FlowerShirt() {
  const teal = mat(ITEMS.flowerShirt.colour, 'cloth')
  const white = mat('#ffffff', 'cloth')
  const f = FLOWER_SHIRT()
  return (
    <group>
      <Band off={0.035} material={teal} />
      <Trim off={0.035} hem={teal} collar={white} sleeves={teal} />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={ROUND} material={white} {...onBody(side * 0.17, 0.02, 1, 0.05, side * 0.7)} scale={[0.15, 0.08, 0.025]} />
      ))}
      <mesh geometry={f.petals[0]!} material={white} />
      <mesh geometry={f.petals[1]!} material={mat('#ffd23f', 'cloth')} />
      <mesh geometry={f.petals[2]!} material={mat('#ff8fc8', 'cloth')} />
      <mesh geometry={f.middles} material={mat('#ff7f5e', 'cloth')} />
      <mesh geometry={f.leaves} material={mat('#3fae4f', 'cloth')} />
    </group>
  )
}

/** Where the glitter shirt's sparkles sit, spread over its band. */
const SPARKS = lazy(() => {
  const rand = mulberry32(5)
  return Array.from({ length: 30 }, (_, i) => {
    const ys = SHIRT.lo + 0.06 + (SHIRT.hi - SHIRT.lo - 0.12) * rand()
    const a = rand() * TAU
    const g = girth(ys)
    return { ...onBody(g * Math.sin(a), ys - 1, g * Math.cos(a), 0.055, rand() * TAU), phase: i * 2.39996 }
  })
})
const SPARK_COLOURS = ['#ffffff', '#fff2a8', '#ffd1ea', '#d8f4ff']
const sparkHolder = new Object3D()

function GlitterShirt({ pose }: { pose: Pose }) {
  const lilac = mat(ITEMS.glitterShirt.colour, 'satin')
  const sparks = useRef<InstancedMesh>(null!)
  const spots = SPARKS()
  const twinkle = (t: number) => {
    const m = sparks.current
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!
      const on = Math.max(0, Math.sin(t * 2.7 + s.phase))
      sparkHolder.position.set(s.position[0], s.position[1], s.position[2])
      sparkHolder.rotation.set(s.rotation[0], s.rotation[1], s.rotation[2] + t * 0.6, s.rotation[3])
      sparkHolder.scale.setScalar(0.03 + 0.06 * on * on)
      sparkHolder.updateMatrix()
      m.setMatrixAt(i, sparkHolder.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => {
    const colour = new Color()
    for (let i = 0; i < spots.length; i++) sparks.current.setColorAt(i, colour.set(SPARK_COLOURS[i % SPARK_COLOURS.length]!))
    twinkle(0)
  }, [])
  useFrame(() => twinkle(pose.t))
  return (
    <group>
      <Band off={0.035} material={lilac} />
      <Trim off={0.035} hem={mat(tint(ITEMS.glitterShirt.colour, -0.1), 'satin')} collar={mat('#e8e8f4', 'silver')} sleeves={lilac} />
      <instancedMesh ref={sparks} args={[SPARK(), mat('#ffffff', 'glow'), spots.length]} />
    </group>
  )
}

// ------------------------------------------------------------------ skirts (body frame; they twirl about the middle line and flare from the waist)

const WAIST = girth(SKIRT_Y) + 0.022
const BELL = [
  [WAIST, SKIRT_Y + 0.01],
  [WAIST + 0.05, SKIRT_Y - 0.06],
  [WAIST + 0.13, SKIRT_Y - 0.16],
  [WAIST + 0.21, SKIRT_Y - 0.26],
  [WAIST + 0.26, SKIRT_Y - 0.33],
  [WAIST + 0.27, SKIRT_Y - 0.355],
  [WAIST + 0.25, SKIRT_Y - 0.365],
] as const
const ALINE = [
  [WAIST, SKIRT_Y + 0.01],
  [WAIST + 0.05, SKIRT_Y - 0.08],
  [WAIST + 0.12, SKIRT_Y - 0.22],
  [WAIST + 0.18, SKIRT_Y - 0.33],
  [WAIST + 0.19, SKIRT_Y - 0.35],
  [WAIST + 0.17, SKIRT_Y - 0.36],
] as const
const LONG = [
  [WAIST, SKIRT_Y + 0.01],
  [WAIST + 0.07, SKIRT_Y - 0.08],
  [WAIST + 0.19, SKIRT_Y - 0.2],
  [WAIST + 0.31, SKIRT_Y - 0.32],
  [WAIST + 0.39, SKIRT_Y - 0.4],
  [WAIST + 0.42, SKIRT_Y - 0.425],
  [WAIST + 0.4, SKIRT_Y - 0.432],
] as const

/** The waistband every skirt has. */
function Waistband({ material }: { material: Material }) {
  return <mesh geometry={geo('skirt:waistband', () => new TorusGeometry(WAIST + 0.01, 0.034, 8, 48).rotateX(Math.PI / 2).translate(0, SKIRT_Y, 0))} material={material} />
}

/** One ruffled layer of the tutu: a wide puffy frill from `inner` at height y out to `outer`, its edge waving `waves` times round. */
function ruffle(inner: number, outer: number, y: number, waves: number) {
  const mid = (inner + outer) / 2
  const g = new LatheGeometry(
    [new Vector2(inner, y), new Vector2(mid, y + 0.01), new Vector2(outer - 0.05, y - 0.05), new Vector2(outer, y - 0.09), new Vector2(outer - 0.02, y - 0.115)],
    192,
  )
  const p = g.attributes.position!
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const out = Math.max(0, (Math.hypot(x, z) - inner) / (outer - inner))
    const a = Math.atan2(x, z)
    const k = 1 + 0.05 * out * Math.sin(waves * a)
    p.setXYZ(i, x * k, p.getY(i) + 0.04 * out * Math.cos(waves * a), z * k)
  }
  g.computeVertexNormals()
  return g
}

/** The tutu's four layers of tulle, top to bottom, each starting just under the shirt's hem. */
const TUTU = [
  { y: 0.52, outer: 1.26, lightness: 0.06 },
  { y: 0.45, outer: 1.32, lightness: 0 },
  { y: 0.38, outer: 1.27, lightness: 0.08 },
  { y: 0.31, outer: 1.16, lightness: -0.03 },
] as const

function Tutu() {
  const satin = mat(tint(ITEMS.tutu.colour, -0.12), 'satin')
  return (
    <group>
      {TUTU.map((l, i) => (
        <mesh key={i} geometry={geo(`tutu:${i}`, () => ruffle(girth(l.y) + 0.025, l.outer, l.y, 12 + i * 2))} material={mat(tint(ITEMS.tutu.colour, l.lightness), 'tulle')} castShadow={i === 1} />
      ))}
      <Waistband material={satin} />
      <mesh geometry={ROUND} material={satin} position={[0, SKIRT_Y, -WAIST - 0.03]} scale={[0.1, 0.07, 0.05]} />
    </group>
  )
}

const FLOWER_SKIRT = lazy(() => {
  const spots: { position: V3; rotation: Turn }[] = []
  for (let i = 0; i < 16; i++) spots.push(onLathe(BELL, 0.2 + 0.6 * ((i * 0.618) % 1), i * 2.39996, 0.025, i))
  return flowerBed(spots, 0.12, 3)
})

function FlowerSkirt() {
  const f = FLOWER_SKIRT()
  return (
    <group>
      <mesh geometry={geo('skirt:bell', () => latheGeometry(BELL, 0, TAU))} material={mat(ITEMS.flowerSkirt.colour, 'cloth')} castShadow />
      <Waistband material={mat('#ffffff', 'cloth')} />
      <mesh geometry={f.petals[0]!} material={mat('#ffffff', 'cloth')} />
      <mesh geometry={f.petals[1]!} material={mat('#ff7f5e', 'cloth')} />
      <mesh geometry={f.petals[2]!} material={mat('#5ec8ff', 'cloth')} />
      <mesh geometry={f.middles} material={mat('#ff8a1f', 'cloth')} />
    </group>
  )
}

function DenimSkirt() {
  const denim = mat(ITEMS.denimSkirt.colour, 'knit')
  const stitch = mat('#ffb05e', 'plain')
  const deep = mat(tint(ITEMS.denimSkirt.colour, -0.08), 'knit')
  const last = ALINE[ALINE.length - 3]!
  return (
    <group>
      <mesh geometry={geo('skirt:aline', () => latheGeometry(ALINE, 0, TAU))} material={denim} castShadow />
      <Waistband material={deep} />
      <mesh geometry={geo('denim:stitch', () => new TorusGeometry(last[0] - 0.005, 0.008, 4, 64).rotateX(Math.PI / 2).translate(0, last[1] + 0.03, 0))} material={stitch} />
      {[1, -1].map((side) => {
        const at = onLathe(ALINE, 0.42, side * 0.55, 0.018, 0)
        return (
          <group key={side} position={at.position} rotation={at.rotation}>
            <mesh geometry={geo('denim:pocket', () => new RoundedBoxGeometry(0.22, 0.18, 0.025, 3, 0.03))} material={deep} />
            <mesh geometry={geo('denim:pocket:stitch', () => new TorusGeometry(0.085, 0.006, 4, 24, Math.PI).rotateZ(Math.PI))} material={stitch} position={[0, 0.05, 0.016]} />
          </group>
        )
      })}
      <mesh geometry={ROUND} material={mat('#d9dde8', 'silver')} position={[0, SKIRT_Y, WAIST + 0.04]} scale={[0.045, 0.045, 0.02]} />
    </group>
  )
}

const GORES = lazy(() => {
  const n = 16
  const a: BufferGeometry[] = []
  const b: BufferGeometry[] = []
  for (let i = 0; i < n; i++) (i % 2 === 0 ? a : b).push(latheGeometry(BELL, (i / n) * TAU, TAU / n).toNonIndexed())
  return { a: merged(a), b: merged(b) }
})

function StripeSkirt() {
  const gores = GORES()
  return (
    <group>
      <mesh geometry={gores.a} material={mat(ITEMS.stripeSkirt.colour, 'cloth')} castShadow />
      <mesh geometry={gores.b} material={mat('#fff6f8', 'cloth')} castShadow />
      <Waistband material={mat(tint(ITEMS.stripeSkirt.colour, -0.1), 'cloth')} />
    </group>
  )
}

const PARTY_SPARKLES = lazy(() => {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 34; i++) {
    const at = onLathe(LONG, 0.12 + 0.75 * ((i * 0.618) % 1), i * 2.39996, 0.012, 0)
    parts.push(placed(ROUND, at.position, at.rotation, [0.022, 0.022, 0.01]))
  }
  return merged(parts)
})

function PartySkirt() {
  const gold = mat('#ffcf3f', 'gold')
  return (
    <group>
      <mesh geometry={geo('skirt:long', () => latheGeometry(LONG, 0, TAU))} material={mat(ITEMS.partySkirt.colour, 'satin')} castShadow />
      <Waistband material={gold} />
      <mesh geometry={PARTY_SPARKLES()} material={gold} />
      <group position={[0, SKIRT_Y, -WAIST - 0.05]}>
        {[1, -1].map((side) => (
          <mesh key={side} geometry={geo('party:loop', () => new TorusGeometry(0.1, 0.045, 10, 24))} material={gold} position={[side * 0.13, 0.03, 0]} rotation={[0, 0, side * 0.3]} scale={[1.3, 0.9, 0.7]} />
        ))}
        {[1, -1].map((side) => (
          <mesh key={side} geometry={ROUND} material={gold} position={[side * 0.07, -0.14, -0.01]} rotation={[0, 0, side * 0.3]} scale={[0.045, 0.15, 0.02]} />
        ))}
        <mesh geometry={ROUND} material={gold} scale={[0.065, 0.06, 0.05]} />
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ bags

/** In the hand's frame: the handle through the right hand, the bag hanging under it. */
function Handbag() {
  const red = mat(ITEMS.handbag.colour, 'satin')
  const deep = mat(tint(ITEMS.handbag.colour, -0.1), 'satin')
  return (
    <group scale={1.35}>
      <mesh geometry={geo('handbag:handle', () => new TorusGeometry(0.11, 0.024, 8, 24, Math.PI))} material={deep} position={[0, -0.13, 0]} />
      <mesh geometry={geo('handbag:body', () => new RoundedBoxGeometry(0.36, 0.26, 0.14, 4, 0.06))} material={red} position={[0, -0.27, 0]} castShadow />
      <mesh geometry={geo('handbag:flap', () => new RoundedBoxGeometry(0.37, 0.1, 0.15, 3, 0.04))} material={deep} position={[0, -0.18, 0.005]} />
      <mesh geometry={ROUND} material={mat('#ffcf3f', 'gold')} position={[0, -0.21, 0.085]} scale={0.035} />
    </group>
  )
}

/** Where the shoulder bag's strap crosses the body: a ring round it from over its left shoulder to under its right side, and the spot low on the back right where the bag hangs. */
const STRAP_TILT = 0.9
const STRAP_R = 1.07
const BAG_AT = -2.4
const BAG_SPOT: V3 = [STRAP_R * Math.cos(BAG_AT) * Math.cos(STRAP_TILT), 1 + STRAP_R * Math.cos(BAG_AT) * Math.sin(STRAP_TILT), STRAP_R * Math.sin(BAG_AT)]

function ShoulderBag({ pose }: { pose: Pose }) {
  const coral = mat(ITEMS.shoulderBag.colour, 'cloth')
  const strap = mat(tint(ITEMS.shoulderBag.colour, -0.15), 'cloth')
  const swing = useRef<Group>(null!)
  useFrame(() => {
    swing.current.rotation.z = 0.6 * pose.sway
  })
  return (
    <group>
      <mesh geometry={geo('shoulderBag:strap', () => new TorusGeometry(STRAP_R, 0.032, 8, 72).rotateX(Math.PI / 2))} material={strap} position={[0, 1, 0]} rotation={[0, 0, STRAP_TILT]} />
      <group position={BAG_SPOT} rotation={[0, Math.atan2(BAG_SPOT[0], BAG_SPOT[2]), 0]}>
        <group ref={swing} scale={1.3}>
          <mesh geometry={geo('shoulderBag:body', () => new RoundedBoxGeometry(0.42, 0.3, 0.13, 4, 0.07))} material={coral} position={[0, -0.14, 0.07]} castShadow />
          <mesh geometry={geo('shoulderBag:flap', () => new RoundedBoxGeometry(0.43, 0.12, 0.14, 3, 0.05))} material={strap} position={[0, -0.04, 0.075]} />
          <mesh geometry={STAR()} material={mat('#ffd23f', 'plain')} position={[0, -0.17, 0.15]} rotation={[0, 0, 0.3]} scale={0.075} />
        </group>
      </group>
    </group>
  )
}

/** The straps a backpack hangs from: from the top of the pack over each shoulder (outside the eyes) and down the front to under the arm, hugging the jelly. */
function Straps({ material }: { material: Material }) {
  return (
    <>
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('backpack:strap', () => new TorusGeometry(0.555, 0.04, 8, 40, 3.3).rotateZ(0.55).rotateY(Math.PI / 2))} material={material} position={[side * 0.84, 1, 0]} />
      ))}
    </>
  )
}

function Backpack() {
  const orange = mat(ITEMS.backpack.colour, 'cloth')
  const red = mat('#ff5e5e', 'cloth')
  return (
    <group>
      <Straps material={mat(tint(ITEMS.backpack.colour, -0.18), 'cloth')} />
      <mesh geometry={geo('backpack:body', () => new RoundedBoxGeometry(0.78, 0.8, 0.36, 4, 0.15))} material={orange} position={[0, 1, -1.06]} castShadow />
      <mesh geometry={geo('backpack:pocket', () => new RoundedBoxGeometry(0.56, 0.32, 0.14, 4, 0.06))} material={red} position={[0, 0.84, -1.26]} castShadow />
      <mesh geometry={ROUND} material={mat('#ffcf3f', 'gold')} position={[0.18, 0.99, -1.33]} scale={0.035} />
      <mesh geometry={geo('backpack:handle', () => new TorusGeometry(0.1, 0.028, 8, 20, Math.PI))} material={red} position={[0, 1.39, -1.06]} />
      <mesh geometry={STAR()} material={mat('#ffffff', 'plain')} position={[0, 1.2, -1.25]} rotation={[0, Math.PI, 0]} scale={0.07} />
    </group>
  )
}

function TeddyBackpack() {
  const fur = mat(ITEMS.teddyBackpack.colour, 'knit')
  const muzzle = mat('#f1d3a8', 'knit')
  const dark = mat('#3a2418', 'plain')
  return (
    <group>
      <Straps material={mat(tint(ITEMS.teddyBackpack.colour, -0.15), 'cloth')} />
      <mesh geometry={ROUND} material={fur} position={[0, 1.02, -1.08]} scale={[0.44, 0.42, 0.3]} castShadow />
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh geometry={ROUND} material={fur} position={[side * 0.32, 1.38, -1.08]} scale={[0.15, 0.15, 0.1]} castShadow />
          <mesh geometry={ROUND} material={muzzle} position={[side * 0.32, 1.38, -1.16]} scale={[0.08, 0.08, 0.04]} />
          <mesh geometry={ROUND} material={dark} position={[side * 0.15, 1.1, -1.34]} scale={0.05} />
          <mesh geometry={ROUND} material={mat('#ffffff', 'glow')} position={[side * 0.15 + 0.015, 1.115, -1.38]} scale={0.014} />
          <mesh geometry={geo('teddy:paw', () => new CapsuleGeometry(0.08, 0.26, 4, 10))} material={fur} position={[side * 0.55, 0.82, -0.86]} rotation={[0.5, side * 0.9, side * 0.9]} castShadow />
        </group>
      ))}
      <mesh geometry={ROUND} material={muzzle} position={[0, 0.93, -1.33]} scale={[0.17, 0.13, 0.1]} />
      <mesh geometry={ROUND} material={dark} position={[0, 0.98, -1.43]} scale={[0.065, 0.05, 0.04]} />
      <mesh geometry={geo('teddy:smile', () => new TorusGeometry(0.045, 0.011, 6, 12, Math.PI).rotateZ(Math.PI))} material={dark} position={[0, 0.9, -1.43]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

function KittyBackpack() {
  const pink = mat(ITEMS.kittyBackpack.colour, 'knit')
  const inner = mat('#ffe0f0', 'knit')
  const dark = mat(palette.ink, 'plain')
  const white = mat('#ffffff', 'plain')
  return (
    <group>
      <Straps material={mat(tint(ITEMS.kittyBackpack.colour, -0.15), 'cloth')} />
      <mesh geometry={ROUND} material={pink} position={[0, 1.02, -1.08]} scale={[0.45, 0.4, 0.3]} castShadow />
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh geometry={geo('kitty:ear', () => new ConeGeometry(0.15, 0.27, 24))} material={pink} position={[side * 0.27, 1.43, -1.06]} rotation={[0, 0, -side * 0.38]} castShadow />
          <mesh geometry={geo('kitty:ear:in', () => new ConeGeometry(0.08, 0.16, 20))} material={inner} position={[side * 0.26, 1.41, -1.13]} rotation={[0.1, 0, -side * 0.38]} />
          <mesh geometry={ROUND} material={dark} position={[side * 0.16, 1.07, -1.35]} scale={[0.05, 0.07, 0.04]} />
          <mesh geometry={ROUND} material={mat('#ffffff', 'glow')} position={[side * 0.16 + 0.015, 1.095, -1.385]} scale={0.016} />
          {[-1, 0, 1].map((k) => (
            <mesh key={k} geometry={geo('kitty:whisker', () => new CapsuleGeometry(0.008, 0.22, 3, 6))} material={white} position={[side * 0.3, 0.96 + k * 0.045, -1.31]} rotation={[0, 0, side * (Math.PI / 2 + k * 0.18)]} />
          ))}
        </group>
      ))}
      <mesh geometry={ROUND} material={mat('#ff5e8a', 'plain')} position={[0, 0.97, -1.38]} scale={[0.05, 0.035, 0.03]} />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('kitty:mouth', () => new TorusGeometry(0.035, 0.009, 6, 12, Math.PI).rotateZ(Math.PI))} material={dark} position={[side * 0.034, 0.93, -1.375]} rotation={[0, Math.PI, 0]} />
      ))}
      <group position={[0.38, 1.33, -1.12]} rotation={[0, Math.PI, 0.3]}>
        {[1, -1].map((side) => (
          <mesh key={side} geometry={ROUND} material={mat('#ffd23f', 'satin')} position={[side * 0.06, 0, 0]} rotation={[0, 0, side * 0.3]} scale={[0.07, 0.05, 0.03]} />
        ))}
        <mesh geometry={ROUND} material={mat('#ffb000', 'satin')} scale={0.03} />
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ neck things (body frame)

const SCARF_RING = lazy(() => {
  const n = 16
  const a: BufferGeometry[] = []
  const b: BufferGeometry[] = []
  for (let i = 0; i < n; i++) (i % 2 === 0 ? a : b).push(new TorusGeometry(1.05, 0.1, 10, 6, TAU / n).rotateX(Math.PI / 2).rotateY((i / n) * TAU).translate(0, NECK_Y, 0).toNonIndexed())
  return { a: merged(a), b: merged(b) }
})
const FRINGE = lazy(() => merged([-0.08, -0.03, 0.02, 0.07].map((x) => placed(new CapsuleGeometry(0.018, 0.07, 3, 6), [x, -0.52, 0.02], STILL, 1))))

function Scarf({ pose }: { pose: Pose }) {
  const yellow = mat(ITEMS.scarf.colour, 'knit')
  const red = mat('#e8503f', 'knit')
  const tail = useRef<Group[]>([])
  useFrame(() => {
    const f = pose.flutter
    for (let i = 0; i < 3; i++) tail.current[i]!.rotation.x = (i === 0 ? 0.3 + 0.9 * f : 0.12 + 0.2 * f) + 0.3 * f * Math.sin(pose.t * 13 - i * 1.3)
  })
  const ring = SCARF_RING()
  const end = onBody(0.35, -0.1, 0.93, 0.08, 0.15)
  return (
    <group>
      <mesh geometry={ring.a} material={yellow} castShadow />
      <mesh geometry={ring.b} material={red} castShadow />
      <group position={end.position} rotation={end.rotation}>
        <mesh geometry={ROUND} material={yellow} position={[0, -0.24, 0.03]} scale={[0.13, 0.28, 0.05]} castShadow />
        <mesh geometry={ROUND} material={red} position={[0, -0.3, 0.06]} scale={[0.125, 0.05, 0.03]} />
        <mesh geometry={FRINGE()} material={red} />
      </group>
      <group position={[-0.28, NECK_Y - 0.02, -1.0]}>
        <group
          ref={(g) => {
            if (g) tail.current[0] = g
          }}
        >
          <mesh geometry={ROUND} material={yellow} position={[0, -0.14, 0]} scale={[0.12, 0.17, 0.045]} castShadow />
          <group
            position={[0, -0.28, 0]}
            ref={(g) => {
              if (g) tail.current[1] = g
            }}
          >
            <mesh geometry={ROUND} material={red} position={[0, -0.13, 0]} scale={[0.115, 0.16, 0.043]} castShadow />
            <group
              position={[0, -0.26, 0]}
              ref={(g) => {
                if (g) tail.current[2] = g
              }}
            >
              <mesh geometry={ROUND} material={yellow} position={[0, -0.12, 0]} scale={[0.11, 0.15, 0.04]} castShadow />
              <mesh geometry={FRINGE()} material={red} position={[0, 0.27, 0]} scale={0.8} />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

const PEARLS = lazy(() => {
  const parts: BufferGeometry[] = []
  const n = 28
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const droop = 0.08 * (1 + Math.cos(a)) * 0.5
    const [r, y] = surf(NECK_Y - droop, 0.045)
    parts.push(placed(ROUND, [r * Math.sin(a), y, r * Math.cos(a)], STILL, 0.052))
  }
  const [r, y] = surf(NECK_Y - 0.17, 0.07)
  parts.push(placed(ROUND, [0, y, r], STILL, 0.085))
  return merged(parts)
})

function Pearls() {
  return <mesh geometry={PEARLS()} material={mat(ITEMS.pearls.colour, 'pearl')} castShadow />
}

const BOWTIE_DOTS = lazy(() => {
  const parts: BufferGeometry[] = []
  for (const side of [1, -1])
    for (const [x, y] of [
      [0.1, 0.04],
      [0.19, -0.02],
      [0.13, -0.06],
    ] as const)
      parts.push(placed(ROUND, [side * x, y, 0.055], STILL, [0.022, 0.022, 0.01]))
  return merged(parts)
})

function BowTie() {
  const red = mat(ITEMS.bowTie.colour, 'satin')
  const front = onBody(0, NECK_Y - 1 - 0.03, 1, 0.06, 0)
  return (
    <group>
      <mesh geometry={geo('bowtie:collar', () => hemGeometry(NECK_Y, 0.03, 0.03))} material={mat('#ffffff', 'cloth')} />
      <group position={front.position} rotation={front.rotation}>
        {[1, -1].map((side) => (
          <mesh key={side} geometry={ROUND} material={red} position={[side * 0.13, 0, 0]} rotation={[0, side * 0.25, side * 0.12]} scale={[0.16, 0.11, 0.06]} castShadow />
        ))}
        <mesh geometry={ROUND} material={mat(tint(ITEMS.bowTie.colour, -0.1), 'satin')} position={[0, 0, 0.03]} scale={[0.06, 0.065, 0.05]} />
        <mesh geometry={BOWTIE_DOTS()} material={mat('#ffffff', 'plain')} />
      </group>
    </group>
  )
}

// ------------------------------------------------------------------ putting them on

/** One thing's model in the frame of its place: hats, shirts, skirts, backpacks and neck things in the body's, glasses in the eyes', the handbag in the right hand's. */
function Model({ item, pose }: { item: ItemId; pose: Pose }) {
  switch (item) {
    case 'cap':
      return <Cap />
    case 'beanie':
      return <Beanie />
    case 'sunhat':
      return <Sunhat />
    case 'crown':
      return <Crown />
    case 'flowers':
      return <Flowers />
    case 'bow':
      return <Bow />
    case 'roundGlasses':
      return <RoundGlasses />
    case 'sunglasses':
      return <Sunglasses />
    case 'heartGlasses':
      return <HeartGlasses />
    case 'tee':
      return <Tee />
    case 'stripes':
      return <StripesShirt />
    case 'hoodie':
      return <Hoodie />
    case 'sweater':
      return <Sweater />
    case 'flowerShirt':
      return <FlowerShirt />
    case 'glitterShirt':
      return <GlitterShirt pose={pose} />
    case 'tutu':
      return <Tutu />
    case 'flowerSkirt':
      return <FlowerSkirt />
    case 'denimSkirt':
      return <DenimSkirt />
    case 'stripeSkirt':
      return <StripeSkirt />
    case 'partySkirt':
      return <PartySkirt />
    case 'handbag':
      return <Handbag />
    case 'shoulderBag':
      return <ShoulderBag pose={pose} />
    case 'backpack':
      return <Backpack />
    case 'teddyBackpack':
      return <TeddyBackpack />
    case 'kittyBackpack':
      return <KittyBackpack />
    case 'scarf':
      return <Scarf pose={pose} />
    case 'pearls':
      return <Pearls />
    case 'bowTie':
      return <BowTie />
  }
}

/**
 * One worn thing, moved by its place every frame: the hat flies up and spins at a knock
 * and drops back on; the glasses follow the eyes (which the jelly does not squash); the
 * skirt twirls and flares out from the waist; the handbag hangs from the right hand and
 * swings; a backpack hops. A new thing from the box stays off until it lands, then pops on.
 */
function Worn({ slot, item, pose }: { slot: Slot; item: ItemId; pose: Pose }) {
  const g = useRef<Group>(null!)
  useFrame(() => {
    const o = g.current
    const on = pose.giftSlot === slot ? pose.giftOn : 1
    o.visible = on > 0.001
    switch (slot) {
      case 'hat': {
        const up = pose.hatUp
        o.position.set(0.25 * up * Math.sin(0.5 * pose.hatSpin), HAT.y + 1.1 * up, HAT.z - 0.15 * up)
        o.rotation.set(-0.5 * up, pose.hatSpin, 0.35 * up)
        o.scale.setScalar(on)
        break
      }
      case 'glasses': {
        const s = pose.eyeS * on
        o.position.set(0, pose.eyeY / pose.sy, pose.eyeZ / pose.sz)
        o.scale.set(s / pose.sx, s / pose.sy, s / pose.sz)
        break
      }
      case 'skirt': {
        const wide = 1 + 0.22 * pose.flare
        const tall = 1 - 0.25 * pose.flare
        o.position.set(0, SKIRT_Y * (1 - tall * on), 0)
        o.rotation.set(0, pose.twirl, 0)
        o.scale.set(wide * on, tall * on, wide * on)
        break
      }
      case 'bag':
        if (item === 'handbag') {
          o.position.set(pose.handX, pose.handY, pose.handZ)
          o.rotation.set(0.25 * pose.sway, 0, pose.sway)
        } else {
          o.position.set(0, pose.bounce, 0)
          o.rotation.set(-0.5 * pose.bounce, 0, 0)
        }
        o.scale.setScalar(on)
        break
      case 'shirt':
      case 'neck':
        o.scale.setScalar(on)
        break
    }
  })
  return (
    <group ref={g}>
      <group position={slot === 'hat' ? [0, -HAT.y, -HAT.z] : [0, 0, 0]}>
        <Model item={item} pose={pose} />
      </group>
    </group>
  )
}

/** What the slime wears, for a body of radius 1 whose bottom is at y = 0 and centre at y = 1, facing +Z, moved by the body's pose (read every frame). */
export function Clothes({ outfit, pose }: { outfit: Outfit; pose: Pose }) {
  return (
    <>
      {SLOTS.map((slot) => {
        const item = outfit[slot]
        return item === null ? null : <Worn key={`${slot}:${item}`} slot={slot} item={item} pose={pose} />
      })}
    </>
  )
}

/** The pose of a round slime at rest, for things drawn on their own. */
const REST = newPose()
const bounds = new Box3()
const part = new Box3()
const chain = new Matrix4()

/** The box round everything under `root`, in root's own frame (its own position, turn and scale left out). */
function boundsOf(root: Object3D) {
  root.updateMatrixWorld(true)
  bounds.makeEmpty()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    if (o instanceof InstancedMesh) {
      o.computeBoundingBox()
      part.copy(o.boundingBox!)
    } else {
      if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox()
      part.copy(o.geometry.boundingBox!)
    }
    chain.copy(o.matrix)
    for (let p = o.parent; p !== null && p !== root; p = p.parent) chain.premultiply(p.matrix)
    bounds.union(part.applyMatrix4(chain))
  })
  if (bounds.isEmpty()) throw new Error('a thing to wear with nothing in it')
  return bounds
}

/** The faint ball a shirt, skirt, neck thing or backpack is shown on when it is on its own, so it reads as something to wear and not a ring. */
const GHOST = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false })
const GHOST_BALL = new SphereGeometry(1, 32, 20).translate(0, 1, 0)

/** What ItemMesh fitted each thing by, in the frame of its place: the centre of the box round it (and its ghost) and the box's biggest side. */
const fitted = new Map<ItemId, { centre: Vector3; size: number }>()

/** One thing on its own, about one unit across, centred on its group's origin (the gift flying out of the box). Things that wrap round the body are shown on a faint ghost of it. */
export function ItemMesh({ item }: { item: ItemId }) {
  const fit = useRef<Group>(null!)
  const inner = useRef<Group>(null!)
  const slot = ITEMS[item].slot
  const ghost = slot === 'shirt' || slot === 'skirt' || slot === 'neck' || (slot === 'bag' && item !== 'handbag')
  useLayoutEffect(() => {
    const box = boundsOf(inner.current)
    const size = box.getSize(new Vector3())
    const s = 1 / Math.max(size.x, size.y, size.z)
    fit.current.scale.setScalar(s)
    fit.current.position.copy(box.getCenter(new Vector3())).multiplyScalar(-s)
    fitted.set(item, { centre: box.getCenter(new Vector3()), size: 1 / s })
  }, [item])
  return (
    <group ref={fit}>
      <group ref={inner}>
        {ghost && <mesh geometry={GHOST_BALL} material={GHOST} />}
        <Model item={item} pose={REST} />
      </group>
    </group>
  )
}

/** What an ItemMesh of `item` was fitted by; one must have been mounted first. */
function fittedOf(item: ItemId) {
  const f = fitted.get(item)
  if (f === undefined) throw new Error(`no ItemMesh of ${item} has been fitted yet: mount one before asking where ${item} is worn`)
  return f
}

/**
 * Where an ItemMesh of `item` goes to cover the thing as a slime wears it at rest, on a
 * slime of radius 1 standing on the origin and facing +Z: the centre of the box ItemMesh
 * fitted it by, carried from the frame of its place (the eyes' for glasses, the right
 * hand's for the handbag, the body's for the rest) into the body's. For a slime of radius
 * r facing yaw, an ItemMesh at its feet plus this turned by yaw and times r, turned by yaw
 * and scaled r * wornFit(item), lies exactly on the worn thing, and its ghost ball on the body.
 */
export function wornAt(item: ItemId): readonly [number, number, number] {
  const c = fittedOf(item).centre
  if (ITEMS[item].slot === 'glasses') return [c.x, REST.eyeY + c.y, REST.eyeZ + c.z]
  if (item === 'handbag') return [REST.handX + c.x, REST.handY + c.y, REST.handZ + c.z]
  return [c.x, c.y, c.z]
}

/** How much bigger than an ItemMesh of `item` (one unit across) the thing is when a slime of radius 1 wears it: the biggest side of the box ItemMesh fitted it by. */
export function wornFit(item: ItemId) {
  return fittedOf(item).size
}
