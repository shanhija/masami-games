import { PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BackSide,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  type DirectionalLight,
  type Group,
  LatheGeometry,
  type Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera as Camera,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Reflector } from 'three/addons/objects/Reflector.js'

import { ITEMS, SLOTS, type SlimeLook, type Slot } from '../game/closet'
import { useLook, type Game } from '../game/game'
import { clamp, easeAngle, mulberry32, smoothstep } from '../game/math'
import { IdleSlime } from './Slime'
import { DOME, HEART, ROUND, STAR, TAU, geo, lazy, mat } from './toy'

/**
 * The wardrobe's 3D half: the slime on a round show turntable in a cosy closet, a lilac
 * wardrobe standing open behind it with clothes on hangers, hat boxes on top and folded
 * jumpers on a shelf, pink striped wallpaper, a honey wood floor and a round rug, a gold
 * standing mirror that shows the slime from behind, and warm light. The turntable turns
 * slowly; when the look changes the slime does a happy wiggle and the turntable turns the
 * new thing toward the child (a backpack's back, a bag's side). Its own camera keeps the
 * slime clear of the panel: in the left part of a wide screen, the top part of a tall one.
 */

/** The turntable's top: the slime stands on it. */
const TABLE_H = 0.3
/** The slime is happy this long after its look changes, and the turntable shows the change off for this long before it turns on. */
const HAPPY_FOR = 1.4
const SHOW_FOR = 2.8
/** The turntable's slow turn, radians a second. */
const TURN = 0.3
/** The room's colours. */
const ROOM = {
  wall: '#ffe2ee',
  stripe: '#fff1f6',
  wainscot: '#ffc8dd',
  floor: '#e9b686',
  wardrobe: '#b9a4f5',
  inside: '#8670d4',
  trim: '#f1ebff',
  gold: '#ffcf3f',
} as const

/** How far round the turntable shows a look off: the back for a backpack, the side for a bag, a three-quarter turn for a hat, the front for the rest. */
function showOff(before: SlimeLook | null, after: SlimeLook) {
  if (before === null) return 0
  const changed: Slot | undefined = SLOTS.find((slot) => before.outfit[slot] !== after.outfit[slot])
  const item = changed === undefined ? null : after.outfit[changed]
  if (changed === undefined || item === null) return 0
  if (item === 'handbag') return 1.15
  if (item === 'shoulderBag') return 2.2
  if (ITEMS[item].slot === 'bag') return Math.PI
  if (ITEMS[item].slot === 'hat') return 0.4
  return 0
}

// ------------------------------------------------------------------ the room

/** A canvas texture painted once and kept for every visit, tiled `repeat` times. */
function painted(size: number, repeat: [number, number], paint: (g: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (g === null) throw new Error('the wardrobe needs a 2D canvas')
  paint(g, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 4
  return texture
}

/** A little heart with its top middle at (x, y), `s` tall. */
function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath()
  g.moveTo(x, y + s * 0.3)
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3)
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s)
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3)
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3)
  g.fill()
}

/** Pink wallpaper with wide soft stripes, little hearts and yellow dots between them. */
const WALLPAPER = lazy(() =>
  painted(256, [24, 4], (g, s) => {
    g.fillStyle = ROOM.wall
    g.fillRect(0, 0, s, s)
    g.fillStyle = ROOM.stripe
    g.fillRect(0, 0, s / 2, s)
    g.fillStyle = '#ffb8d2'
    heart(g, s * 0.75, s * 0.18, s * 0.14)
    g.fillStyle = '#fff3a8'
    g.beginPath()
    g.arc(s * 0.75, s * 0.7, s * 0.045, 0, TAU)
    g.fill()
  }),
)

/** Honey floorboards of different lengths, each a slightly different shade. */
const FLOORBOARDS = lazy(() =>
  painted(512, [10, 10], (g, s) => {
    const rand = mulberry32(3)
    const rows = 8
    const h = s / rows
    for (let row = 0; row < rows; row++) {
      let x = -rand() * s * 0.5
      while (x < s) {
        const w = s * (0.35 + 0.4 * rand())
        const l = 70 + 8 * rand()
        g.fillStyle = `hsl(30, 62%, ${l}%)`
        g.fillRect(x, row * h, w, h)
        g.fillStyle = 'rgba(160, 96, 40, 0.35)'
        g.fillRect(x, row * h, 3, h)
        x += w
      }
      g.fillStyle = 'rgba(160, 96, 40, 0.45)'
      g.fillRect(0, row * h, s, 3)
    }
  }),
)

/** The round rug: soft rings in pink, cream, yellow and blue with a scalloped pink edge. */
const RUG = lazy(() =>
  painted(512, [1, 1], (g, s) => {
    const c = s / 2
    const rings = ['#ffb3c8', '#fff6e6', '#ffd0dc', '#fff6e6', '#ffe48f', '#fff6e6', '#bfe6ff', '#fff6e6']
    g.fillStyle = rings[0]!
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU
      g.beginPath()
      g.arc(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9, c * 0.1, 0, TAU)
      g.fill()
    }
    rings.forEach((colour, i) => {
      g.fillStyle = colour
      g.beginPath()
      g.arc(c, c, c * (0.92 - i * 0.11), 0, TAU)
      g.fill()
    })
  }),
)

/** The back of the room: a curved wall (the camera never finds a corner) with a darker band low down and a rail on it, and the wooden floor. */
function Room() {
  const wall = useMemo(() => new MeshStandardMaterial({ map: WALLPAPER(), roughness: 0.95, side: BackSide }), [])
  const floor = useMemo(() => new MeshStandardMaterial({ map: FLOORBOARDS(), roughness: 0.75 }), [])
  const rug = useMemo(() => new MeshStandardMaterial({ map: RUG(), roughness: 1, alphaTest: 0.5, transparent: false }), [])
  useEffect(
    () => () => {
      wall.dispose()
      floor.dispose()
      rug.dispose()
    },
    [wall, floor, rug],
  )
  const arc = 3.9
  const from = Math.PI - arc / 2
  return (
    <group>
      <mesh geometry={geo('room:wall', () => new CylinderGeometry(11, 11, 12, 72, 1, true, from, arc).translate(0, 6, 1))} material={wall} receiveShadow />
      <mesh geometry={geo('room:wainscot', () => new CylinderGeometry(10.96, 10.96, 1.5, 72, 1, true, from, arc).translate(0, 0.75, 1))} material={mat(ROOM.wainscot, 'cloth')} receiveShadow />
      <mesh geometry={geo('room:rail', () => new TorusGeometry(10.92, 0.07, 8, 96, arc).rotateX(Math.PI / 2).rotateY(-(Math.PI / 2 - arc / 2) - Math.PI).translate(0, 1.5, 1))} material={mat('#ffffff', 'plain')} />
      <mesh geometry={geo('room:floor', () => new CircleGeometry(14, 72).rotateX(-Math.PI / 2).translate(0, 0, 1))} material={floor} receiveShadow />
      <mesh geometry={geo('room:rug', () => new CircleGeometry(2.9, 64).rotateX(-Math.PI / 2).translate(0, 0.012, 0))} material={rug} receiveShadow />
    </group>
  )
}

const GARMENT_COLOURS = ['#ff8fc8', '#ffd23f', '#5ec8ff', '#7fe07a', '#ff7f5e', '#c58bff']

/** A little dress hanging from its hanger's hook at the origin. */
function Dress({ colour }: { colour: string }) {
  return (
    <group>
      <mesh geometry={geo('ward:dress', () => new LatheGeometry([new Vector2(0.12, -0.12), new Vector2(0.16, -0.3), new Vector2(0.3, -0.75), new Vector2(0.33, -0.82), new Vector2(0.3, -0.84)], 32).scale(1, 1, 0.45))} material={mat(colour, 'cloth')} castShadow />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={ROUND} material={mat(colour, 'cloth')} position={[side * 0.16, -0.16, 0]} scale={[0.08, 0.07, 0.07]} />
      ))}
      <mesh geometry={ROUND} material={mat('#ffffff', 'cloth')} position={[0, -0.36, 0.08]} scale={[0.05, 0.05, 0.02]} />
    </group>
  )
}

/** A little shirt hanging from its hanger's hook at the origin. */
function Shirt({ colour }: { colour: string }) {
  return (
    <group>
      <mesh geometry={geo('ward:shirt', () => new RoundedBoxGeometry(0.5, 0.55, 0.1, 3, 0.05))} material={mat(colour, 'cloth')} position={[0, -0.42, 0]} castShadow />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('ward:sleeve', () => new RoundedBoxGeometry(0.2, 0.3, 0.09, 3, 0.04))} material={mat(colour, 'cloth')} position={[side * 0.3, -0.28, 0]} rotation={[0, 0, side * 0.7]} />
      ))}
      <mesh geometry={ROUND} material={mat('#ffffff', 'cloth')} position={[0, -0.18, 0.05]} scale={[0.1, 0.04, 0.02]} />
    </group>
  )
}

/** The hanger: a hook over the rail and a bar the clothes hang from. */
function Hanger() {
  const wood = mat('#c98a52', 'plain')
  return (
    <group>
      <mesh geometry={geo('ward:hook', () => new TorusGeometry(0.06, 0.012, 6, 16, Math.PI * 1.4))} material={mat('#d9dde8', 'silver')} position={[0, 0.04, 0]} rotation={[0, Math.PI / 2, -0.4]} />
      <mesh geometry={geo('ward:bar', () => new RoundedBoxGeometry(0.62, 0.05, 0.05, 2, 0.02))} material={wood} position={[0, -0.1, 0]} />
    </group>
  )
}

/** The open wardrobe behind the turntable: a hollow lilac cupboard with clothes on hangers, a shelf of folded jumpers, doors swung wide with heart stickers, hat boxes on top. */
function Wardrobe() {
  const body = mat(ROOM.wardrobe, 'plain')
  const trim = mat(ROOM.trim, 'plain')
  const gold = mat(ROOM.gold, 'gold')
  const folded = ['#ff8fc8', '#5ec8ff', '#ffd23f', '#7fe07a', '#ffffff', '#c58bff']
  return (
    <group position={[0, 0, -4]} scale={0.92}>
      <mesh geometry={geo('ward:back', () => new RoundedBoxGeometry(4.3, 5.3, 0.2, 4, 0.08))} material={mat(ROOM.inside, 'plain')} position={[0, 2.85, -0.6]} receiveShadow />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo('ward:side', () => new RoundedBoxGeometry(0.24, 5.3, 1.4, 4, 0.1))} material={body} position={[side * 2.03, 2.85, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={geo('ward:lid', () => new RoundedBoxGeometry(4.3, 0.24, 1.4, 4, 0.1))} material={body} position={[0, 5.38, 0]} castShadow />
      <mesh geometry={geo('ward:floor', () => new RoundedBoxGeometry(4.3, 0.3, 1.4, 4, 0.1))} material={body} position={[0, 0.5, 0]} receiveShadow />
      <mesh geometry={geo('ward:top', () => new RoundedBoxGeometry(4.6, 0.34, 1.6, 4, 0.15))} material={trim} position={[0, 5.6, 0]} castShadow />
      <mesh geometry={geo('ward:base', () => new RoundedBoxGeometry(4.5, 0.32, 1.55, 4, 0.14))} material={trim} position={[0, 0.3, 0]} />
      {[-1.95, 1.95].flatMap((x) => [-0.55, 0.55].map((z) => <mesh key={`${x}:${z}`} geometry={ROUND} material={gold} position={[x, 0.1, z]} scale={0.14} />))}
      <mesh geometry={geo('ward:rail', () => new CylinderGeometry(0.05, 0.05, 3.8, 12).rotateZ(Math.PI / 2))} material={gold} position={[0, 4.75, 0.05]} />
      {GARMENT_COLOURS.map((colour, i) => (
        <group key={colour} position={[-1.45 + i * 0.58, 4.75, 0.05]} rotation={[0, 0, 0.04 * (i % 2 === 0 ? 1 : -1)]}>
          <Hanger />
          <group position={[0, -0.1, 0]}>{i % 2 === 0 ? <Dress colour={colour} /> : <Shirt colour={colour} />}</group>
        </group>
      ))}
      <mesh geometry={geo('ward:shelf', () => new RoundedBoxGeometry(3.85, 0.1, 1.1, 2, 0.04))} material={trim} position={[0, 2.0, 0]} receiveShadow />
      {[-1.3, 1.3].map((x, k) =>
        [0, 1, 2].map((j) => <mesh key={`${x}:${j}`} geometry={geo('ward:folded', () => new RoundedBoxGeometry(0.8, 0.17, 0.55, 3, 0.07))} material={mat(folded[(k * 3 + j) % folded.length]!, 'knit')} position={[x + (j % 2) * 0.05, 2.14 + j * 0.17, 0.05]} castShadow />),
      )}
      {[1, -1].map((side) => (
        <group key={side} position={[side * 2.15, 0.62, 0.7]} rotation={[0, side * 1.95, 0]}>
          <mesh geometry={geo('ward:door', () => new RoundedBoxGeometry(2.1, 4.6, 0.13, 4, 0.08))} material={body} position={[-side * 1.05, 2.3, 0]} castShadow />
          <mesh geometry={geo('ward:panel', () => new RoundedBoxGeometry(1.5, 3.6, 0.04, 3, 0.18))} material={trim} position={[-side * 1.05, 2.4, -0.07]} />
          <mesh geometry={ROUND} material={gold} position={[-side * 1.85, 2.2, -0.1]} scale={0.09} />
          <mesh geometry={HEART()} material={mat('#ff8fc8', 'plain')} position={[-side * 1.05, 3.55, -0.11]} rotation={[0, Math.PI, 0]} scale={0.22} />
          <mesh geometry={STAR()} material={mat('#ffd23f', 'plain')} position={[-side * 1.05 + 0.35, 1.5, -0.11]} rotation={[0, Math.PI, 0.3]} scale={0.14} />
        </group>
      ))}
      {[
        { x: -1.15, r: 0.46, h: 0.52, colour: '#ff9ccb' },
        { x: 1.1, r: 0.4, h: 0.44, colour: '#8fd8ff' },
      ].map((box) => (
        <group key={box.x} position={[box.x, 5.77, 0.05]}>
          <mesh geometry={geo(`ward:box:${box.r}`, () => new CylinderGeometry(box.r, box.r, box.h, 32).translate(0, box.h / 2, 0))} material={mat(box.colour, 'plain')} castShadow />
          <mesh geometry={geo(`ward:boxlid:${box.r}`, () => new CylinderGeometry(box.r + 0.04, box.r + 0.04, 0.12, 32).translate(0, box.h, 0))} material={mat('#ffffff', 'plain')} />
          <mesh geometry={geo(`ward:boxband:${box.r}`, () => new TorusGeometry(box.r + 0.005, 0.03, 6, 32).rotateX(Math.PI / 2).translate(0, box.h * 0.45, 0))} material={mat('#ffffff', 'plain')} />
        </group>
      ))}
    </group>
  )
}

/** The gold standing mirror, turned so that from the camera it shows the slime's back. */
function Mirror() {
  const glass = useMemo(() => {
    const oval = new Shape()
    oval.absellipse(0, 0, 0.68, 1.05, 0, TAU, false, 0)
    return new Reflector(new ShapeGeometry(oval, 48), { textureWidth: 512, textureHeight: 768, color: '#dceeff', clipBias: 0.003 })
  }, [])
  useEffect(
    () => () => {
      glass.geometry.dispose()
      glass.dispose()
    },
    [glass],
  )
  const gold = mat(ROOM.gold, 'gold')
  return (
    <group position={[-2.7, 0, -1.6]} rotation={[0, 0.6, 0]}>
      <primitive object={glass} position={[0, 1.95, 0.02]} />
      <mesh geometry={geo('mirror:frame', () => new TubeGeometry(new CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => new Vector3(0.74 * Math.cos((i / 48) * TAU), 1.11 * Math.sin((i / 48) * TAU), 0)), true), 96, 0.07, 10, true))} material={gold} position={[0, 1.95, 0]} castShadow />
      <mesh geometry={ROUND} material={gold} position={[0, 3.14, 0]} scale={0.12} />
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh geometry={geo('mirror:leg', () => new CylinderGeometry(0.045, 0.06, 2.2, 10))} material={gold} position={[side * 0.74, 1.0, -0.12]} rotation={[0.1, 0, side * -0.05]} castShadow />
          <mesh geometry={ROUND} material={gold} position={[side * 0.8, 0.07, -0.22]} scale={[0.14, 0.07, 0.14]} />
        </group>
      ))}
    </group>
  )
}

/** The show turntable the slime stands on: a rounded white puck with a pink band and little bulbs round it that light up in turn. */
function Turntable({ clock }: { clock: () => number }) {
  const bulbs = useRef<Mesh[]>([])
  const on = useMemo(() => new MeshStandardMaterial({ color: '#fff4b8', emissive: '#ffd23f', emissiveIntensity: 1.2, roughness: 0.3 }), [])
  const off = useMemo(() => new MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffd23f', emissiveIntensity: 0.15, roughness: 0.3 }), [])
  useEffect(
    () => () => {
      on.dispose()
      off.dispose()
    },
    [on, off],
  )
  useFrame(() => {
    const lit = Math.floor(clock() * 6)
    for (let i = 0; i < bulbs.current.length; i++) bulbs.current[i]!.material = (i + lit) % 3 === 0 ? on : off
  })
  const n = 18
  return (
    <group>
      <mesh geometry={geo('table:puck', () => new LatheGeometry([new Vector2(0, TABLE_H), new Vector2(1.6, TABLE_H), new Vector2(1.7, TABLE_H - 0.02), new Vector2(1.76, TABLE_H - 0.08), new Vector2(1.76, 0.06), new Vector2(1.7, 0.005), new Vector2(0, 0)], 64))} material={mat('#fffafc', 'plain')} castShadow receiveShadow />
      <mesh geometry={geo('table:band', () => new TorusGeometry(1.765, 0.05, 8, 64).rotateX(Math.PI / 2).translate(0, 0.15, 0))} material={mat('#ff8fc8', 'plain')} />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU
        return (
          <mesh
            key={i}
            ref={(m) => {
              if (m) bulbs.current[i] = m
            }}
            geometry={DOME}
            material={off}
            position={[1.78 * Math.sin(a), 0.15, 1.78 * Math.cos(a)]}
            rotation={[Math.PI / 2, 0, -a, 'YXZ']}
            scale={0.055}
          />
        )
      })}
    </group>
  )
}

/**
 * The wardrobe's camera: in front of the slime, a little above, looking at it, moved off
 * centre with a view offset so the slime sits in the part of the screen the panel leaves
 * free (the panel is CSS: at the right on a landscape screen, up to 46% wide; along the
 * bottom 54% of a portrait one), and far enough back that slime, turntable and hat fit.
 */
function WardrobeCamera() {
  const camera = useRef<Camera>(null!)
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const c = camera.current
    const aspect = size.width / size.height
    const tan = Math.tan(((c.fov / 2) * Math.PI) / 180)
    let shiftX = 0
    let shiftY = 0
    let tall: number
    if (aspect > 1) {
      const free = 1 - (clamp(0.46 * size.width, 300, 620) + 24) / size.width
      shiftX = 0.5 - free * 0.56
      tall = Math.max(6.6, 4.6 / (0.75 * free * aspect))
    } else {
      const free = 0.43
      shiftY = 0.5 - free * 0.55
      tall = Math.max(3.9 / (0.9 * free), 4.4 / (0.92 * aspect))
    }
    const d = tall / (2 * tan)
    const pitch = 0.12 + 0.05 * smoothstep(1, 0.5, aspect)
    c.position.set(0, 1.7 + d * Math.sin(pitch), d * Math.cos(pitch))
    c.lookAt(0, 1.7, 0)
    c.setViewOffset(1, 1, shiftX, shiftY, 1, 1)
    c.updateProjectionMatrix()
  }, [size])
  return <PerspectiveCamera ref={camera} makeDefault fov={32} near={0.5} far={60} />
}

/** Warm light: a hemisphere fill, a key light from the front left with soft shadows, a warm lamp glow from the right and a lilac rim from behind that makes the jelly's edge shine. */
function Lights() {
  const key = useRef<DirectionalLight>(null!)
  useLayoutEffect(() => {
    key.current.target.position.set(0, 1, 0)
    key.current.target.updateMatrixWorld()
  }, [])
  return (
    <>
      <hemisphereLight args={['#fff6ee', '#f0c3a2', 1.1]} />
      <directionalLight
        ref={key}
        color="#fff1e0"
        position={[-3.5, 7, 6]}
        intensity={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={7}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={24}
      />
      <pointLight color="#ffd39a" position={[3.2, 4.2, 3]} intensity={16} />
      <directionalLight color="#e6d6ff" position={[1.5, 4, -6]} intensity={0.8} />
    </>
  )
}

/** The slime on a turntable in a cosy closet, its own camera and lights. */
export function WardrobeScene({ game }: { game: Game }) {
  const look = useLook(game)
  const [happy, setHappy] = useState(true)
  const table = useRef<Group>(null!)
  const show = useRef({ angle: 0, aim: 0, until: -1, happyUntil: -1, last: -1, look: null as SlimeLook | null }).current
  const clock = useMemo(() => () => game.clock, [game])

  useEffect(() => {
    // A new look (or the first one, a hello): a happy wiggle, and the new thing turned toward the child.
    show.aim = showOff(show.look, look)
    show.look = look
    show.until = game.clock + SHOW_FOR
    show.happyUntil = game.clock + HAPPY_FOR
    setHappy(true)
  }, [look, game, show])

  useFrame(() => {
    const c = game.clock
    const dt = show.last < 0 ? 0 : clamp(c - show.last, 0, 0.1)
    show.last = c
    if (happy && c >= show.happyUntil) setHappy(false)
    show.angle = c < show.until ? easeAngle(show.angle, show.aim, dt, 0.3) : show.angle + TURN * dt
    table.current.rotation.y = show.angle
  })

  return (
    <>
      <color attach="background" args={[ROOM.wall]} />
      <WardrobeCamera />
      <Lights />
      <Room />
      <Wardrobe />
      <Mirror />
      <group ref={table}>
        <Turntable clock={clock} />
        <group position={[0, TABLE_H, 0]}>
          <IdleSlime look={look} clock={clock} happy={happy} />
        </group>
      </group>
    </>
  )
}
