import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Quaternion,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { mod, mulberry32, smoothstep } from '../game/math'
import { COURSE_IDS, type CourseId } from '../game/model'
import { THEMES, palette, type Theme } from './look'

/**
 * The map's world: five round islands in a sunny sea, a gentle zigzag of them joined by
 * plank bridges, each in its island's colours with one landmark to know it by, and the sea
 * itself with its shallows, lapping foam and sparkles. All of it is still but the water
 * and a few small things that bob; MapScene.tsx puts the slime, the clouds, the badges and
 * the camera on it.
 */

/** Every island is this wide (radius), its top this high over the sea, bulging a little more in the middle, its edge rounded over RIM. */
export const ISLAND_R = 3
const TOP = 0.55
const DOME = 0.16
const RIM = 0.4
const FLAT_R = ISLAND_R - RIM
/** The islands stand this far apart along the row, every other one this far toward the camera or away from it. */
const SPACING = 7
const ZIG = 2.2
/** Where each island is in COURSE_IDS order, in three's space: the row runs along x, the zigzag along z. */
export const ISLAND_AT: readonly { x: number; z: number }[] = COURSE_IDS.map((_, i) => ({
  x: (i - (COURSE_IDS.length - 1) / 2) * SPACING,
  z: i % 2 === 0 ? ZIG : -ZIG,
}))

/**
 * The back of every island: the camera looks from the front (+z on a wide screen, -x on a
 * tall one, in between on a square one), so the landmarks stand toward (+x, -z), behind the
 * slime from any of those angles, and the slime and its babies stand toward the front.
 */
const BACK_X = Math.SQRT1_2
const BACK_Z = -Math.SQRT1_2
/** The yaw that turns a thing's +Z (its face) toward the front. */
const FRONT_YAW = Math.atan2(-BACK_X, -BACK_Z)

/** The island's top at `rho` from its middle: the dome, flat at the rounded edge. */
export function groundY(rho: number) {
  return TOP + DOME * (1 - Math.min(1, (rho / FLAT_R) ** 2))
}

/** A spot on an island, island-local: `deg` round from the back (positive is anticlockwise seen from above), `rho` out from the middle, on the ground. */
function place(deg: number, rho: number): [number, number, number] {
  const a = (deg * Math.PI) / 180
  const x = BACK_X * Math.cos(a) + BACK_Z * Math.sin(a)
  const z = -BACK_X * Math.sin(a) + BACK_Z * Math.cos(a)
  return [x * rho, groundY(rho), z * rho]
}

/** The sea's colours: shallow near the islands, deep further out (the background and the fog too). */
const SEA_SHALLOW = '#46cde6'
export const SEA_DEEP = '#2387bd'

// ------------------------------------------------------------------ shared parts

/** The finishes on the map, each made once (by its kind and colour) and shared by everything wearing it. */
const finishes = new Map<string, MeshStandardMaterial>()
function finish(kind: 'toy' | 'glow' | 'sugar', colour: string) {
  const key = `${kind}${colour}`
  let m = finishes.get(key)
  if (m === undefined) {
    m =
      kind === 'toy'
        ? new MeshStandardMaterial({ color: colour, roughness: 0.55 })
        : kind === 'glow'
          ? new MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.75, roughness: 0.4 })
          : new MeshStandardMaterial({ color: new Color(colour).lerp(new Color('#ffffff'), 0.15), roughness: 0.95 })
    finishes.set(key, m)
  }
  return m
}
/** Soft toy plastic. */
const toy = (colour: string) => finish('toy', colour)
/** Shining by itself a little: the night island's moon, mushrooms and stars. */
const glow = (colour: string) => finish('glow', colour)
/** Sugared: matte and a little lighter, the gumdrops. */
const gumdrop = (colour: string) => finish('sugar', colour)

/** A unit ball, shared by every round thing on the map; BEAD is the same with fewer faces, for the small ones (eyes, apples, knobs). */
export const SPHERE = new SphereGeometry(1, 24, 16)
export const BEAD = new SphereGeometry(1, 12, 8)
/** The top half of a ball, its flat side at y = 0. */
const DOME_HALF = new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)
/** A unit post standing on y = 0, a little wider at the foot. */
const POST = new CylinderGeometry(0.78, 1, 1, 18).translate(0, 0.5, 0)
/** A unit cone standing on y = 0. */
const CONE = new ConeGeometry(1, 1, 28).translate(0, 0.5, 0)

/** A flat five-pointed star `outer` across, for the starfish and the night's floating stars. */
function starShape(outer: number, inner: number) {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outer : inner
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return s
}
/** A puffy star, its bevel rounding every edge, centred on its own depth. */
const STAR_PUFF = new ExtrudeGeometry(starShape(1, 0.48), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4 }).translate(0, 0, -0.1)

/** A canvas texture drawn once, the first time it is needed (the scene only runs in a browser). */
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void, colour: boolean) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (g === null) throw new Error('the map needs a 2d canvas for its textures')
  draw(g)
  const t = new CanvasTexture(c)
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace
  return t
}
function lazy<T>(make: () => T) {
  let made: T | null = null
  return () => {
    if (made === null) made = make()
    return made
  }
}

/** White to clear from the middle out: the shallows' soft edge and the blob shadows. */
export const softDisc = lazy(() =>
  canvasTexture(
    128,
    (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      r.addColorStop(0, '#ffffff')
      r.addColorStop(0.55, '#ffffff')
      r.addColorStop(1, '#000000')
      g.fillStyle = r
      g.fillRect(0, 0, 128, 128)
    },
    false,
  ),
)

/** Little light wave marks on black, tiling: they glow faintly on the sea and drift. */
const waveMarks = lazy(() => {
  const t = canvasTexture(
    256,
    (g) => {
      g.fillStyle = '#000000'
      g.fillRect(0, 0, 256, 256)
      g.lineCap = 'round'
      const rand = mulberry32(5)
      for (let i = 0; i < 15; i++) {
        const x = rand() * 256
        const y = rand() * 256
        const r = 7 + rand() * 9
        g.strokeStyle = `rgba(255,255,255,${(0.45 + rand() * 0.45).toFixed(2)})`
        g.lineWidth = 2.5 + rand() * 2
        for (let dx = -256; dx <= 256; dx += 256) {
          for (let dy = -256; dy <= 256; dy += 256) {
            g.beginPath()
            g.arc(x + dx, y + dy, r, Math.PI * 0.2, Math.PI * 0.8)
            g.stroke()
          }
        }
      }
    },
    true,
  )
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  return t
})

/** The big lollipop's swirl: a fat pink spiral and a thin lilac one on white. */
const swirl = lazy(() =>
  canvasTexture(
    256,
    (g) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, 256, 256)
      g.lineCap = 'round'
      const spiral = (colour: string, width: number, turn: number) => {
        g.strokeStyle = colour
        g.lineWidth = width
        g.beginPath()
        for (let t = 0; t <= Math.PI * 7; t += 0.08) {
          const r = 4 + t * 5.6
          const x = 128 + Math.cos(t + turn) * r
          const y = 128 + Math.sin(t + turn) * r
          if (t === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
      spiral('#ff4f9a', 15, 0)
      spiral('#b38bff', 6, Math.PI)
    },
    true,
  ),
)

/** Red and white stripes round the candy cane. */
const caneStripes = lazy(() => {
  const t = canvasTexture(
    64,
    (g) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = '#ff3b6b'
      for (let k = -2; k < 3; k++) {
        g.beginPath()
        g.moveTo(k * 32, 0)
        g.lineTo(k * 32 + 16, 0)
        g.lineTo(k * 32 + 16 + 64, 64)
        g.lineTo(k * 32 + 64, 64)
        g.fill()
      }
    },
    true,
  )
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(5, 1)
  return t
})

/**
 * A copy of `geometry` cut into separate triangles, each painted one colour by `pick` from
 * the angle round y of its middle: stripes that stay crisp on a smooth-shaded ball.
 */
function striped(geometry: BufferGeometry, pick: (angle: number) => string) {
  const g = geometry.toNonIndexed()
  const pos = g.getAttribute('position')
  const colours: number[] = []
  const c = new Color()
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)
    const z = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)
    c.set(pick(mod(Math.atan2(z, x), Math.PI * 2)))
    for (let k = 0; k < 3; k++) colours.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return g
}
const painted = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })

// ------------------------------------------------------------------ the islands

/**
 * An island's body turned on a lathe: the side under the sea and up to the rounded edge,
 * an edge stripe over the rounding, then the top in two bands (top, topAlt, top) to the
 * bulge in the middle. Every colour change doubles its profile point, so the bands stay
 * crisp on the smooth shading.
 */
function islandGeometry(theme: Theme) {
  const pts: Vector2[] = []
  const cols: Color[] = []
  const side = new Color(theme.side)
  const edge = new Color(theme.edge)
  const top = new Color(theme.top)
  const alt = new Color(theme.topAlt)
  const add = (r: number, y: number, c: Color) => {
    pts.push(new Vector2(r, y))
    cols.push(c)
  }
  add(ISLAND_R - 0.35, -1.1, side)
  add(ISLAND_R, -0.45, side)
  add(ISLAND_R, TOP - RIM, side)
  // Round the edge in eight steps: the side's colour to the third, the stripe to the seventh, then the top.
  for (let k = 1; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2)
    const r = FLAT_R + Math.cos(a) * RIM
    const y = TOP - RIM + Math.sin(a) * RIM
    if (k <= 3) add(r, y, side)
    if (k === 3) add(r, y, edge)
    if (k > 3 && k <= 7) add(r, y, edge)
    if (k >= 7) add(r, y, top)
  }
  for (const [rho, colour] of [
    [2.3, top],
    [1.95, top],
    [1.95, alt],
    [1.6, alt],
    [1.2, alt],
    [1.2, top],
    [0.8, top],
    [0.4, top],
    [0, top],
  ] as const) {
    add(rho, groundY(rho), colour)
  }
  const segments = 72
  const g = new LatheGeometry(pts, segments)
  const colours = new Float32Array((segments + 1) * pts.length * 3)
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < pts.length; j++) cols[j]!.toArray(colours, (i * pts.length + j) * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return g
}
const islandMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.72 })

/** The island's body, made once per island. */
const islandGeometries = lazy(() => COURSE_IDS.map((id) => islandGeometry(THEMES[id])))

/**
 * The little things scattered over an island's top, one instanced mesh per island: flowers
 * in the park, shells on the beach, sprinkles on the candy, snow lumps, and tiny glowing
 * dots at night. They keep off the slime's spot, the babies' and the landmark's.
 */
interface Scatter {
  count: number
  geometry: BufferGeometry
  material: Material
  colours: readonly string[]
  /** Size about one; lying: rolled flat with a random turn, like a sprinkle. */
  scale: number
  lying: boolean
}
const scatterFor = lazy((): Record<CourseId, Scatter> => {
  const dot = new SphereGeometry(1, 12, 8)
  const lump = new SphereGeometry(1, 14, 8).scale(1, 0.45, 1)
  const sprinkle = new CapsuleGeometry(0.035, 0.13, 3, 8)
  return {
    park: { count: 30, geometry: dot, material: toy('#ffffff'), colours: ['#ffffff', '#ff8fc8', '#ffd23f', '#a07bff', '#ff6b8b'], scale: 0.075, lying: false },
    beach: { count: 22, geometry: lump, material: toy('#ffffff'), colours: ['#ffffff', '#ffd1dc', '#ffe8b8', '#ffc9a8'], scale: 0.09, lying: false },
    candy: { count: 46, geometry: sprinkle, material: toy('#ffffff'), colours: ['#8f6bff', '#ff4f9a', '#5fd8f0', '#ffd23f', '#ffffff'], scale: 1, lying: true },
    winter: { count: 16, geometry: lump, material: toy('#ffffff'), colours: ['#ffffff', '#f2f8ff'], scale: 0.17, lying: false },
    night: { count: 34, geometry: dot, material: new MeshBasicMaterial({ color: '#ffffff' }), colours: ['#ffe066', '#ff8fc8', '#5fd8f0', '#b38bff', '#ffffff'], scale: 0.05, lying: false },
  }
})

/** Where the slime stands on an island, island-local. */
export const SLIME_SPOT = place(180, 0.6)
/** The night's moon stands off to one side of the back, out from under its island's badge. */
const MOON_DEG = -58
/** Where the babies found on an island bounce, island-local: left and right of the slime, and one in front. */
export const BABY_SPOTS = [place(180 + 62, 1.65), place(180 - 62, 1.65), place(180 + 18, 1.95)] as const
/** Spots kept clear of scattered things, island-local (x, z, how far): the slime's, the babies', the landmarks'. */
const CLEAR: readonly (readonly [number, number, number])[] = [
  [SLIME_SPOT[0], SLIME_SPOT[2], 0.8],
  ...BABY_SPOTS.map((p) => [p[0], p[2], 0.42] as const),
  ...[place(0, 1.25), place(72, 1.55), place(-72, 1.55), place(MOON_DEG, 1.5)].map((p) => [p[0], p[2], 0.85] as const),
]

/** One island's scatter, laid out once from a seed of its own. */
function Scattered({ id, index }: { id: CourseId; index: number }) {
  const mesh = useRef<InstancedMesh>(null!)
  const s = scatterFor()[id]
  useLayoutEffect(() => {
    const m = mesh.current
    const rand = mulberry32(31 + index * 17)
    const o = new Object3D()
    const c = new Color()
    let n = 0
    for (let tries = 0; n < s.count && tries < 2000; tries++) {
      const rho = 0.35 + Math.sqrt(rand()) * (FLAT_R - 0.5)
      const deg = rand() * 360
      const [x, y, z] = place(deg, rho)
      if (CLEAR.some(([cx, cz, keep]) => Math.hypot(cx - x, cz - z) < keep)) continue
      o.position.set(x, y + (s.lying ? 0.03 : s.scale * 0.35), z)
      o.rotation.set(s.lying ? Math.PI / 2 : 0, rand() * Math.PI * 2, 0, 'YXZ')
      o.scale.setScalar(s.scale * (0.75 + rand() * 0.5))
      o.updateMatrix()
      m.setMatrixAt(n, o.matrix)
      m.setColorAt(n, c.set(s.colours[Math.floor(rand() * s.colours.length)]!))
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [index, s])
  return <instancedMesh ref={mesh} args={[s.geometry, s.material, s.count]} receiveShadow />
}

// ------------------------------------------------------------------ the landmarks

/** The park: a round tree with apples, a little climbing frame and a bush, and a duck on the water. */
function Park({ theme, clock }: { theme: Theme; clock: () => number }) {
  const duck = useRef<Group>(null!)
  const [dx, , dz] = place(150, 3.75)
  useFrame(() => {
    const t = clock()
    duck.current.position.y = 0.06 * Math.sin(t * 2.1)
    duck.current.rotation.z = 0.08 * Math.sin(t * 1.7)
  })
  const leaf = toy('#5ec25a')
  const leafDeep = toy('#46ad4f')
  const apple = toy('#ff5e5e')
  return (
    <>
      <group position={place(0, 1.25)}>
        <mesh geometry={POST} material={toy(palette.wood)} scale={[0.17, 1.05, 0.17]} castShadow />
        <mesh geometry={SPHERE} material={leaf} position={[0, 1.5, 0]} scale={0.78} castShadow />
        <mesh geometry={SPHERE} material={leafDeep} position={[0.52, 1.18, 0.12]} scale={0.56} castShadow />
        <mesh geometry={SPHERE} material={leafDeep} position={[-0.48, 1.22, -0.1]} scale={0.54} castShadow />
        {[
          [-0.38, 1.62, 0.52],
          [0.3, 1.82, 0.54],
          [0.62, 1.3, 0.48],
          [-0.72, 1.18, 0.26],
        ].map(([x, y, z]) => (
          <mesh key={`${x},${y}`} geometry={BEAD} material={apple} position={[x!, y!, z!]} scale={0.1} />
        ))}
      </group>
      <group position={place(72, 1.55)} rotation={[0, FRONT_YAW + 0.4, 0]}>
        {[-0.38, 0.38].map((x) =>
          [-0.26, 0.26].map((z) => <mesh key={`${x},${z}`} geometry={BAR_POST} material={toy(theme.accent[0])} position={[x, 0.41, z]} castShadow />),
        )}
        {[-0.26, 0.26].map((z) => (
          <mesh key={z} geometry={BAR_TOP} material={toy(theme.accent[2])} position={[0, 0.8, z]} rotation={[0, 0, Math.PI / 2]} castShadow />
        ))}
        {[-0.24, 0, 0.24].map((x) => (
          <mesh key={x} geometry={BAR_RUNG} material={toy(theme.accent[1])} position={[x, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow />
        ))}
      </group>
      <group position={place(-72, 1.6)}>
        <mesh geometry={SPHERE} material={leafDeep} position={[0, 0.22, 0]} scale={[0.42, 0.34, 0.42]} castShadow />
        <mesh geometry={SPHERE} material={leaf} position={[0.3, 0.16, 0.18]} scale={[0.3, 0.26, 0.3]} castShadow />
        <mesh geometry={BEAD} material={toy('#ff8fc8')} position={[-0.12, 0.5, 0.22]} scale={0.07} />
        <mesh geometry={BEAD} material={toy('#ffd23f')} position={[0.24, 0.38, 0.32]} scale={0.06} />
      </group>
      <group position={[dx, 0, dz]} rotation={[0, FRONT_YAW + Math.PI / 2, 0]}>
        <group ref={duck}>
          <mesh geometry={SPHERE} material={toy('#ffd23f')} position={[0, 0.12, 0]} scale={[0.26, 0.2, 0.36]} castShadow />
          <mesh geometry={SPHERE} material={toy('#ffd23f')} position={[0, 0.36, 0.2]} scale={0.17} />
          <mesh geometry={BEAD} material={toy('#ff9f43')} position={[0, 0.33, 0.38]} scale={[0.08, 0.04, 0.09]} />
          <mesh geometry={BEAD} material={toy(palette.ink)} position={[0.09, 0.41, 0.31]} scale={0.03} />
          <mesh geometry={BEAD} material={toy(palette.ink)} position={[-0.09, 0.41, 0.31]} scale={0.03} />
          <mesh geometry={BEAD} material={toy('#ffe58a')} position={[0, 0.2, -0.32]} scale={[0.1, 0.08, 0.12]} />
        </group>
      </group>
    </>
  )
}
const BAR_POST = new CapsuleGeometry(0.055, 0.7, 4, 10)
const BAR_TOP = new CapsuleGeometry(0.05, 0.76, 4, 10)
const BAR_RUNG = new CapsuleGeometry(0.045, 0.52, 4, 10)

/** The beach: a leaning palm with coconuts, a striped umbrella, a beach ball and a starfish. */
function Beach({ theme }: { theme: Theme }) {
  const canopy = useMemo(() => striped(new SphereGeometry(0.85, 24, 7, 0, Math.PI * 2, 0, Math.PI * 0.42), (a) => (Math.floor(a / (Math.PI / 4)) % 2 === 0 ? theme.accent[0] : '#ffffff')), [theme])
  const ball = useMemo(() => {
    const colours = ['#ff5e5e', '#ffffff', '#ffd23f', '#ffffff', '#3f8fe0', '#ffffff']
    return striped(new SphereGeometry(1, 24, 14), (a) => colours[Math.floor(a / (Math.PI / 3)) % 6]!)
  }, [])
  const starfish = useMemo(() => new ExtrudeGeometry(starShape(0.24, 0.1), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }), [])
  /** The trunk bends out as it rises: six short segments along a curve. */
  const trunk = Array.from({ length: 6 }, (_, k) => {
    const u = (k + 0.5) / 6
    return { x: 0.55 * u * u, y: 1.9 * u, tilt: -Math.atan((2 * 0.55 * u) / 1.9), r: 0.13 - k * 0.008, k }
  })
  return (
    <>
      <group position={place(0, 1.3)} rotation={[0, Math.PI / 4, 0]}>
        {trunk.map((s) => (
          <mesh key={s.k} geometry={POST} material={toy(s.k % 2 === 0 ? '#c99a62' : '#b5844f')} position={[s.x, s.y - 0.19, 0]} rotation={[0, 0, s.tilt]} scale={[s.r, 0.36, s.r]} castShadow />
        ))}
        <group position={[0.55, 1.95, 0]}>
          {Array.from({ length: 7 }, (_, k) => (
            <group key={k} rotation={[0, (k * Math.PI * 2) / 7, 0]}>
              <mesh geometry={SPHERE} material={toy(k % 2 === 0 ? '#3fae4f' : '#5ec25a')} position={[0, -0.12, 0.5]} rotation={[0.45 + 0.12 * (k % 2), 0, 0]} scale={[0.2, 0.05, 0.62]} castShadow />
            </group>
          ))}
          {[
            [0.1, -0.12, 0.06],
            [-0.08, -0.14, 0.08],
            [0.02, -0.14, -0.1],
          ].map(([x, y, z]) => (
            <mesh key={`${x},${z}`} geometry={BEAD} material={toy('#8a5a34')} position={[x!, y!, z!]} scale={0.1} />
          ))}
        </group>
      </group>
      <group position={place(-72, 1.55)} rotation={[0, 0, 0.12]}>
        <mesh geometry={POST} material={toy('#ffffff')} scale={[0.035, 1.3, 0.035]} castShadow />
        <mesh geometry={canopy} material={painted} position={[0, 1.02, 0]} castShadow />
        <mesh geometry={BEAD} material={toy(theme.accent[0])} position={[0, 1.88, 0]} scale={0.07} />
      </group>
      <mesh geometry={ball} material={painted} position={add(place(55, 1.9), 0, 0.22, 0)} rotation={[0.4, 0.3, 0.2]} scale={0.22} castShadow />
      <mesh geometry={starfish} material={toy('#ff9f43')} position={add(place(-28, 2.05), 0, 0.03, 0)} rotation={[-Math.PI / 2, 0, 0.5]} />
    </>
  )
}
/** A spot moved by (x, y, z). */
function add(p: [number, number, number], x: number, y: number, z: number): [number, number, number] {
  return [p[0] + x, p[1] + y, p[2] + z]
}

/** Candy Land: a big swirl lollipop facing the front, a small one, a candy cane and gumdrops. */
function Candy({ theme }: { theme: Theme }) {
  const disc = useMemo(() => new CylinderGeometry(0.72, 0.72, 0.16, 44), [])
  const discMaterials = useMemo(() => {
    const face = new MeshStandardMaterial({ map: swirl(), roughness: 0.35 })
    return [toy(theme.accent[1]), face, face]
  }, [theme])
  const cane = useMemo(() => {
    const path = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0, 0.7, 0), new Vector3(0, 1.1, 0), new Vector3(0.08, 1.32, 0), new Vector3(0.26, 1.38, 0), new Vector3(0.4, 1.26, 0), new Vector3(0.42, 1.1, 0)])
    return new TubeGeometry(path, 40, 0.07, 12, false)
  }, [])
  const caneMaterial = useMemo(() => new MeshStandardMaterial({ map: caneStripes(), roughness: 0.35 }), [])
  const lolly = (p: [number, number, number], s: number) => (
    <group position={p} scale={s}>
      <mesh geometry={POST} material={toy('#ffffff')} scale={[0.05, 1.5, 0.05]} castShadow />
      <group position={[0, 1.62, 0]} rotation={[0, FRONT_YAW, 0]}>
        <mesh geometry={disc} material={discMaterials} rotation={[Math.PI / 2, 0, 0]} castShadow />
      </group>
    </group>
  )
  return (
    <>
      {lolly(place(0, 1.15), 1)}
      {lolly(place(-75, 1.65), 0.58)}
      <group position={place(40, 1.9)} rotation={[0, FRONT_YAW + 0.6, 0]}>
        <mesh geometry={cane} material={caneMaterial} castShadow />
      </group>
      {(
        [
          [62, 1.55, 0],
          [104, 1.6, 2],
          [-38, 2.05, 3],
          [-112, 2.0, 1],
        ] as const
      ).map(([deg, rho, k]) => (
        <mesh key={deg} geometry={DOME_HALF} material={gumdrop(theme.accent[k])} position={place(deg, rho)} scale={[0.3, 0.34, 0.3]} castShadow />
      ))}
    </>
  )
}
/** Snow Land: a fir with snow on its tiers and a snowman in a scarf and a beanie, facing the front. */
function Winter({ theme }: { theme: Theme }) {
  const fir = toy('#2f8f5b')
  const snow = toy('#ffffff')
  const ink = toy(palette.ink)
  const red = toy(theme.accent[0])
  return (
    <>
      <group position={place(0, 1.25)}>
        <mesh geometry={POST} material={toy(palette.wood)} scale={[0.12, 0.4, 0.12]} castShadow />
        {(
          [
            [0.3, 0.86, 0.9],
            [0.82, 0.68, 0.8],
            [1.28, 0.48, 0.7],
          ] as const
        ).map(([y, r, h]) => (
          <group key={y} position={[0, y, 0]}>
            <mesh geometry={CONE} material={fir} scale={[r, h, r]} castShadow />
            <mesh geometry={CONE} material={snow} position={[0, h * 0.5, 0]} scale={[r * 0.52, h * 0.5, r * 0.52]} />
          </group>
        ))}
      </group>
      <group position={place(-70, 1.5)} rotation={[0, FRONT_YAW + 0.25, 0]}>
        <mesh geometry={SPHERE} material={snow} position={[0, 0.38, 0]} scale={0.42} castShadow />
        <mesh geometry={SPHERE} material={snow} position={[0, 0.98, 0]} scale={0.31} castShadow />
        <mesh geometry={SPHERE} material={snow} position={[0, 1.42, 0]} scale={0.23} castShadow />
        <mesh geometry={BEAD} material={ink} position={[0.08, 1.48, 0.2]} scale={0.035} />
        <mesh geometry={BEAD} material={ink} position={[-0.08, 1.48, 0.2]} scale={0.035} />
        <mesh geometry={CONE} material={toy('#ff9f43')} position={[0, 1.41, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[0.05, 0.24, 0.05]} />
        <mesh geometry={BEAD} material={ink} position={[0, 1.05, 0.3]} scale={0.035} />
        <mesh geometry={BEAD} material={ink} position={[0, 0.9, 0.31]} scale={0.035} />
        <mesh geometry={SCARF} material={red} position={[0, 1.22, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={SPHERE} material={red} position={[0.15, 1.08, 0.21]} rotation={[0, 0, 0.3]} scale={[0.07, 0.16, 0.05]} />
        <mesh geometry={DOME_HALF} material={red} position={[0, 1.55, 0]} scale={0.205} />
        <mesh geometry={BEAD} material={snow} position={[0, 1.78, 0]} scale={0.07} />
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={ARM} material={toy(palette.woodDeep)} position={[side * 0.4, 1.06, 0]} rotation={[0, 0, side * -1]} />
        ))}
      </group>
    </>
  )
}
const SCARF = new TorusGeometry(0.27, 0.075, 10, 28)
const ARM = new CapsuleGeometry(0.025, 0.42, 3, 8)

/**
 * A crescent moon `r` across: the part of a disc outside a second disc bitten out of its
 * upper right. Its outline is the outer circle's points outside the bite, then the bite's
 * points inside the disc, back the other way. Each run is sampled from where it starts
 * outside the other circle, so it comes out as one unbroken arc.
 */
function crescentShape(r: number) {
  const bite = { x: r * 0.45, y: r * 0.25, r: r * 0.86 }
  const steps = 96
  const arc = (cx: number, cy: number, radius: number, keep: (x: number, y: number) => boolean) => {
    let start = 0
    while (start < steps && keep(cx + Math.cos((start / steps) * Math.PI * 2) * radius, cy + Math.sin((start / steps) * Math.PI * 2) * radius)) start++
    const run: Vector2[] = []
    for (let i = start; i < start + steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const x = cx + Math.cos(a) * radius
      const y = cy + Math.sin(a) * radius
      if (keep(x, y)) run.push(new Vector2(x, y))
    }
    return run
  }
  const outer = arc(0, 0, r, (x, y) => Math.hypot(x - bite.x, y - bite.y) > bite.r)
  const inner = arc(bite.x, bite.y, bite.r, (x, y) => Math.hypot(x, y) < r).reverse()
  if (outer.length < 8 || inner.length < 8) throw new Error('the crescent moon needs both of its arcs')
  return new Shape([...outer, ...inner])
}

/** Star Night: a moon on a pole, glowing mushrooms, and little stars floating over it all. */
function Night({ theme, clock, facing }: { theme: Theme; clock: () => number; facing: Quaternion }) {
  const moon = useMemo(() => new ExtrudeGeometry(crescentShape(0.72), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 }).translate(0, 0, -0.07), [])
  const stars = useRef<InstancedMesh>(null!)
  const spots = useMemo(() => {
    const rand = mulberry32(77)
    // Round the back and the sides, never in front of the slime; some out over the water.
    return Array.from({ length: 13 }, (_, i) => {
      const [x, , z] = place(-115 + i * 19 + rand() * 8, 0.9 + rand() * 2.6)
      return { x, y: 1.5 + rand() * 1.9, z, s: 0.14 + rand() * 0.1, phase: rand() * 6, rate: 1.4 + rand() * 1.6 }
    })
  }, [])
  const o = useMemo(() => new Object3D(), [])
  useFrame(() => {
    const t = clock()
    const m = stars.current
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!
      o.position.set(s.x, s.y + 0.12 * Math.sin(t * 0.9 + s.phase), s.z)
      o.quaternion.copy(facing)
      o.scale.setScalar(s.s * (0.75 + 0.35 * Math.sin(t * s.rate + s.phase)))
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  const mushrooms: [number, number, number, number][] = [
    [62, 1.6, 0, 1.2],
    [96, 1.25, 1, 0.85],
    [-18, 1.7, 2, 1.1],
    [-104, 1.35, 1, 0.8],
    [32, 2.15, 2, 0.75],
  ]
  return (
    <>
      <group position={place(MOON_DEG, 1.5)}>
        <mesh geometry={POST} material={toy(palette.metal)} scale={[0.06, 1.7, 0.06]} castShadow />
        <mesh geometry={BEAD} material={toy(theme.accent[0])} position={[0, 1.7, 0]} scale={0.09} />
        <group position={[0, 2.22, 0]} rotation={[0, FRONT_YAW, 0.35]}>
          <mesh geometry={moon} material={glow('#ffe066')} castShadow />
        </group>
      </group>
      {mushrooms.map(([deg, rho, k, size]) => (
        <group key={deg} position={place(deg, rho)} scale={size * 1.2}>
          <mesh geometry={POST} material={toy('#fff3e0')} scale={[0.08, 0.3, 0.08]} castShadow />
          <mesh geometry={DOME_HALF} material={glow(theme.accent[k + 1]!)} position={[0, 0.26, 0]} scale={[0.27, 0.21, 0.27]} castShadow />
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} geometry={BEAD} material={toy('#ffffff')} position={[Math.cos(a) * 0.16, 0.42, Math.sin(a) * 0.16]} scale={0.04} />
          ))}
        </group>
      ))}
      <instancedMesh ref={stars} args={[STAR_PUFF, STAR_LIGHT, spots.length]} frustumCulled={false} />
    </>
  )
}

/** The night's floating stars shine by themselves, as bright as they come. */
const STAR_LIGHT = new MeshBasicMaterial({ color: '#ffe680' })

/** One island's look and things: the body, the scatter and the landmark. */
export function IslandArt({ index, clock, facing }: { index: number; clock: () => number; facing: Quaternion }) {
  const id = COURSE_IDS[index]
  if (id === undefined) throw new Error(`no island ${index}`)
  const theme = THEMES[id]
  return (
    <>
      <mesh geometry={islandGeometries()[index]} material={islandMaterial} receiveShadow castShadow />
      <Scattered id={id} index={index} />
      {id === 'park' && <Park theme={theme} clock={clock} />}
      {id === 'beach' && <Beach theme={theme} />}
      {id === 'candy' && <Candy theme={theme} />}
      {id === 'winter' && <Winter theme={theme} />}
      {id === 'night' && <Night theme={theme} clock={clock} facing={facing} />}
    </>
  )
}

// ------------------------------------------------------------------ the bridges

/** The deck rises this much in the middle of a bridge. */
const ARCH = 0.32
/** Planks and posts start this far in from an island's middle, so they rest on the island. */
const BRIDGE_IN = ISLAND_R - 0.5
const PLANK_W = 1.25
const PLANKS_PER_BRIDGE = 8

/** The bridges between neighbouring islands: plank decks arching over the water, posts at both ends, a rope rail each side. */
export function Bridges() {
  const planks = useRef<InstancedMesh>(null!)
  const posts = useRef<InstancedMesh>(null!)
  const caps = useRef<InstancedMesh>(null!)
  const count = COURSE_IDS.length - 1
  const ropes = useMemo(() => {
    const tubes: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const { a, d, across, length } = bridgeLine(i)
      for (const side of [-1, 1]) {
        const pts: Vector3[] = []
        for (let k = 0; k <= 6; k++) {
          const s = k / 6
          const along = s * length
          pts.push(new Vector3(a.x + d.x * along + across.x * side * 0.66, TOP + 0.62 + (ARCH - 0.08) * Math.sin(Math.PI * s), a.y + d.y * along + across.y * side * 0.66))
        }
        tubes.push(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.035, 6, false))
      }
    }
    const merged = mergeGeometries(tubes)
    if (merged === null) throw new Error('the bridge ropes would not merge')
    return merged
  }, [count])
  useLayoutEffect(() => {
    const o = new Object3D()
    const wood = new Color(palette.wood)
    const woodLight = new Color(palette.wood).lerp(new Color('#ffffff'), 0.18)
    for (let i = 0; i < count; i++) {
      const { a, d, across, length } = bridgeLine(i)
      const yaw = Math.atan2(d.x, d.y)
      for (let k = 0; k < PLANKS_PER_BRIDGE; k++) {
        const s = k / (PLANKS_PER_BRIDGE - 1)
        const along = s * length
        const slope = Math.atan((ARCH * Math.PI * Math.cos(Math.PI * s)) / length)
        o.position.set(a.x + d.x * along, TOP + 0.07 + ARCH * Math.sin(Math.PI * s), a.y + d.y * along)
        o.rotation.set(-slope, yaw, (k % 2 === 0 ? 1 : -1) * 0.03, 'YXZ')
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        const n = i * PLANKS_PER_BRIDGE + k
        planks.current.setMatrixAt(n, o.matrix)
        planks.current.setColorAt(n, k % 2 === 0 ? wood : woodLight)
      }
      for (let end = 0; end < 2; end++) {
        for (const side of [-1, 1]) {
          const along = end * length
          const n = i * 4 + end * 2 + (side + 1) / 2
          o.position.set(a.x + d.x * along + across.x * side * 0.66, TOP, a.y + d.y * along + across.y * side * 0.66)
          o.rotation.set(0, 0, 0)
          o.scale.set(0.07, 0.7, 0.07)
          o.updateMatrix()
          posts.current.setMatrixAt(n, o.matrix)
          o.position.y = TOP + 0.72
          o.scale.setScalar(0.1)
          o.updateMatrix()
          caps.current.setMatrixAt(n, o.matrix)
        }
      }
    }
    for (const m of [planks.current, posts.current, caps.current]) m.instanceMatrix.needsUpdate = true
    planks.current.instanceColor!.needsUpdate = true
  }, [count])
  return (
    <>
      <instancedMesh ref={planks} args={[PLANK, toy('#ffffff'), count * PLANKS_PER_BRIDGE]} castShadow receiveShadow />
      <instancedMesh ref={posts} args={[POST, toy(palette.woodDeep), count * 4]} castShadow />
      <instancedMesh ref={caps} args={[BEAD, toy(palette.ribbon), count * 4]} />
      <mesh geometry={ropes} material={toy('#f4e4c1')} castShadow />
    </>
  )
}
/** A plank: a capsule laid across the deck and squashed flat, so its ends are round. */
const PLANK = new CapsuleGeometry(0.17, PLANK_W - 0.34, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.36, 1)

/** Bridge i: where its deck starts (on island i), its direction and its side direction on the ground (as x, z pairs in Vector2), and its length. */
function bridgeLine(i: number) {
  const from = ISLAND_AT[i]!
  const to = ISLAND_AT[i + 1]!
  const d = new Vector2(to.x - from.x, to.z - from.z)
  const gap = d.length()
  d.normalize()
  return { a: new Vector2(from.x + d.x * BRIDGE_IN, from.z + d.y * BRIDGE_IN), d, across: new Vector2(-d.y, d.x), length: gap - 2 * BRIDGE_IN }
}

// ------------------------------------------------------------------ the sea

/** The sea reaches this far, past anything the camera sees; its rings crowd in near the islands, where the colour changes. */
const SEA_R = 240
const SEA_RINGS = 30
const SEA_SEGMENTS = 96

/**
 * The sea: a disc shading from shallow turquoise along the row of islands to deep blue
 * further out, with faint wave marks drifting over it. Built once; its faces wind
 * anticlockwise seen from above so it faces the sun.
 */
const seaGeometry = lazy(() => {
  const positions: number[] = []
  const colours: number[] = []
  const uvs: number[] = []
  const shallow = new Color(SEA_SHALLOW)
  const deep = new Color(SEA_DEEP)
  const c = new Color()
  const ends = ISLAND_AT[ISLAND_AT.length - 1]!.x
  const push = (x: number, z: number) => {
    positions.push(x, 0, z)
    const dx = Math.max(0, Math.abs(x) - ends)
    const t = smoothstep(5, 30, Math.hypot(dx, z))
    c.copy(shallow).lerp(deep, t)
    colours.push(c.r, c.g, c.b)
    uvs.push(x / 16, z / 16)
  }
  push(0, 0)
  for (let k = 1; k <= SEA_RINGS; k++) {
    const r = SEA_R * (k / SEA_RINGS) ** 2.2
    for (let i = 0; i < SEA_SEGMENTS; i++) {
      const a = (i / SEA_SEGMENTS) * Math.PI * 2
      push(Math.cos(a) * r, Math.sin(a) * r)
    }
  }
  const at = (k: number, i: number) => (k === 0 ? 0 : 1 + (k - 1) * SEA_SEGMENTS + mod(i, SEA_SEGMENTS))
  const index: number[] = []
  for (let i = 0; i < SEA_SEGMENTS; i++) index.push(0, at(1, i + 1), at(1, i))
  for (let k = 1; k < SEA_RINGS; k++) {
    for (let i = 0; i < SEA_SEGMENTS; i++) index.push(at(k, i), at(k, i + 1), at(k + 1, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
})

/** The sparkles that wink on the water here and there, kept off the islands. */
const SPARKLE_COUNT = 70
const sparkleShape = new ShapeGeometry(
  (() => {
    const s = new Shape()
    s.moveTo(0, 1)
    s.quadraticCurveTo(0, 0, 1, 0)
    s.quadraticCurveTo(0, 0, 0, -1)
    s.quadraticCurveTo(0, 0, -1, 0)
    s.quadraticCurveTo(0, 0, 0, 1)
    return s
  })(),
  3,
).rotateX(-Math.PI / 2)

/**
 * The water: the sea, each island's shallows in its own water colour (deep blue round the
 * night island, a patch of night), foam rings lapping out from every shore, and winking
 * sparkles. The wave marks drift with the clock.
 */
export function Sea({ clock }: { clock: () => number }) {
  const sea = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.14, emissiveMap: waveMarks() }), [])
  const shallows = useMemo(
    () =>
      COURSE_IDS.map((id) => {
        const theme = THEMES[id]
        return new MeshStandardMaterial({
          color: theme.night ? theme.water : new Color(theme.water).lerp(new Color('#ffffff'), 0.3),
          transparent: true,
          opacity: theme.night ? 0.7 : 0.85,
          alphaMap: softDisc(),
          depthWrite: false,
          roughness: 0.35,
        })
      }),
    [],
  )
  const foam = useMemo(() => COURSE_IDS.flatMap(() => [0, 1].map(() => new MeshBasicMaterial({ color: '#f2fdff', transparent: true, depthWrite: false }))), [])
  const rings = useRef<(Mesh | null)[]>([])
  const sparkles = useRef<InstancedMesh>(null!)
  const spots = useMemo(() => {
    const rand = mulberry32(19)
    const out: { x: number; z: number; phase: number; rate: number; size: number }[] = []
    while (out.length < SPARKLE_COUNT) {
      const x = (rand() * 2 - 1) * 30
      const z = (rand() * 2 - 1) * 15
      if (ISLAND_AT.some((p) => Math.hypot(p.x - x, p.z - z) < ISLAND_R + 1.4)) continue
      out.push({ x, z, phase: rand() * 10, rate: 0.7 + rand() * 1.2, size: 0.14 + rand() * 0.14 })
    }
    return out
  }, [])
  const o = useMemo(() => new Object3D(), [])
  useEffect(() => () => [sea, ...shallows, ...foam].forEach((m) => m.dispose()), [sea, shallows, foam])
  useFrame(() => {
    const t = clock()
    waveMarks().offset.set(t * 0.012, t * 0.007)
    for (let i = 0; i < rings.current.length; i++) {
      const ring = rings.current[i]
      if (ring === null || ring === undefined) throw new Error(`foam ring ${i} is missing`)
      const p = mod(t * 0.32 + (i % 2) * 0.5 + Math.floor(i / 2) * 0.17, 1)
      ring.scale.setScalar(1 + 0.16 * p)
      foam[i]!.opacity = 0.7 * smoothstep(0, 0.15, p) * (1 - p)
    }
    const m = sparkles.current
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!
      const wink = Math.max(0, Math.sin(t * s.rate + s.phase)) ** 6
      o.position.set(s.x, 0.04, s.z)
      o.rotation.set(0, s.phase, 0)
      o.scale.setScalar(s.size * wink + 0.0001)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <mesh geometry={seaGeometry()} material={sea} receiveShadow />
      {ISLAND_AT.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh geometry={SHALLOWS} material={shallows[i]} position={[0, 0.015, 0]} scale={THEMES[COURSE_IDS[i]!].night ? 1.05 : 1} renderOrder={1} />
          {[0, 1].map((k) => (
            <mesh
              key={k}
              ref={(m) => {
                rings.current[i * 2 + k] = m
              }}
              geometry={FOAM}
              material={foam[i * 2 + k]}
              position={[0, 0.03, 0]}
              renderOrder={2}
            />
          ))}
        </group>
      ))}
      <instancedMesh ref={sparkles} args={[sparkleShape, SPARKLE_MATERIAL, SPARKLE_COUNT]} frustumCulled={false} />
    </>
  )
}
const SPARKLE_MATERIAL = new MeshBasicMaterial({ color: '#ffffff' })
const SHALLOWS = new CircleGeometry(ISLAND_R * 1.75, 48).rotateX(-Math.PI / 2)
const FOAM = new RingGeometry(ISLAND_R + 0.02, ISLAND_R + 0.2, 72).rotateX(-Math.PI / 2)
