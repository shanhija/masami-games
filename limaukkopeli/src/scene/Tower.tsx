import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CurvePath,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  LineCurve3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  QuadraticBezierCurve3,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import { ITEMS, type Slot } from '../game/closet'
import { clamp, clamp01, ease, lerp, mod, mulberry32, smoothstep } from '../game/math'
import { BOX_X, GIANT_HOLE, TOWER_HALF, TRAMPOLINE_R, type CircleNumber, type Sim } from '../game/model'
import { ItemMesh } from './Clothes'
import { bands, candy, canvasTexture, easeOutBack, fogReach, foam, foamMap, ink, jiggle, merge, placed, puck, redrawWithFont, refAt, tint, useOwned, vFromHeight } from './foam'
import { palette, type Theme } from './look'

// ------------------------------------------------------------------ the tower's frame

// Everything here is drawn in the tower's own frame: the origin on the track at the
// tower's foot (the trampoline's centre), x across the shaft, y up from the tower floor
// (the sim's tower heights), and three's +z toward the course, where the side camera stands.

/** The tower is drawn once the slime is this near it, or nearer when the fog swallows it sooner. */
const TOWER_SEEN = 160
/** The scaffold's corner poles stand this far out to the sides and this far in front of and behind the shaft. */
const CORNER_X = TOWER_HALF + 0.9
const CORNER_Z = 1.8
const CORNER_BOTTOM = -2
const CORNERS: readonly (readonly [number, number])[] = [
  [-CORNER_X, CORNER_Z],
  [CORNER_X, CORNER_Z],
  [-CORNER_X, -CORNER_Z],
  [CORNER_X, -CORNER_Z],
]
/** A U-shaped ring round the back of the shaft every this many units up, open toward the camera, in soft tints so the numbered circles stay the brightest things in the shaft. */
const RING_STEP = 4
const RING_TINT = 0.45

/** The trampoline's mat, inside its padded ring: it rests just over the track and dips at most this much at a launch. */
const MAT_R = TRAMPOLINE_R - 0.42
const MAT_Y = 0.1
const MAT_DIP = 0.09

/** A numbered circle is a puck this thick; its front face carries the number. */
const CIRCLE_T = 0.34
const CIRCLE_COLOUR: Record<CircleNumber, string> = { 1: '#3fa9ff', 5: '#3fc463', 100: '#ff4fa3' }

/** The giant circle is a rainbow funnel covering the shaft, its rim this wide and this far under its hole. */
const GIANT_OUT = TOWER_HALF + 0.6
const FUNNEL_DROP = 1.4
const RAINBOW = ['#ff5e5e', '#ffa53f', '#ffd23f', '#5ec25a', '#3fa9ff', '#a07bff']

/** The top deck: a round floor this wide and thick, with a hatch in its middle that the slime pops up through. */
const DECK_R = 6.4
const DECK_T = 0.4
const HATCH_R = 1.55

/**
 * The surprise box stands at BOX_X and this far toward the camera from the slime, so even
 * the biggest slime has room beside it and the hatch stays clear of it.
 */
const BOX_Z = 1.5
const BOX_W = 1.05
const BOX_H = 0.8
const LID_H = 0.24
const LOCK_Y = BOX_H * 0.5
const LOCK_Z = BOX_W / 2 + 0.055
/** The key's flight from the slime's head to the lock, the lid's flight to the deck, and the gift's onto the slime. */
const KEY_FLY = 0.55
const LID_FLY = 0.7
const GIFT_FLY = 0.7
/** Light pours out of the opened box in a pillar this tall that fades over BEAM_FOR. */
const BEAM_H = 2.6
const BEAM_FOR = 1.8
/** Where each kind of thing lands on a slime of radius 1 facing the camera (it is scaled by r). */
const SLOT_AT: Record<Slot, readonly [number, number, number]> = {
  hat: [0, 2.15, 0],
  glasses: [0, 1.5, 0.85],
  shirt: [0, 1, 0.8],
  skirt: [0, 0.45, 0.8],
  bag: [0.95, 0.9, 0.25],
  neck: [0, 1.3, 0.75],
}
/** Confetti: a burst when the lid pops, and a fountain that keeps going when the box has no new thing left to give. */
const CONFETTI = 150
const BURST = 80
const STARS = 36
const STAR_BURST = 15
const CONFETTI_LIFE = 3
const FOUNTAIN_EVERY = 1.6
const DRAG = 2.6
const FALL = 7

const dummy = new Object3D()
const at = new Vector3()
const to = new Vector3()

/**
 * The end of a run, past the finish arch: the trampoline at the tower's foot, the tall
 * open candy scaffold, the numbered circles moved by the sim, the giant rainbow funnel
 * with its hole, the deck on top with a hatch, and the surprise box that the key opens.
 * It is drawn only once the slime is near enough to see it.
 */
export function Tower({ sim, theme }: { sim: Sim; theme: Theme }) {
  const kit = useTowerKit(theme)
  const root = useRef<Group>(null!)
  // Drawn once on the run's first frame whatever the distance, so its materials compile while the ready card is up.
  const first = useRef(true)
  useFrame((state) => {
    root.current.visible = first.current || sim.tower.z - sim.slime.z < Math.min(fogReach(state.scene.fog) + 30, TOWER_SEEN)
    first.current = false
  })
  return (
    <group ref={root} position={[0, 0, -sim.tower.z]}>
      <Trampoline sim={sim} kit={kit} />
      <Scaffold sim={sim} kit={kit} />
      {sim.tower.circles.map((c, i) => (
        <CircleToy key={i} sim={sim} index={i} n={c.n} kit={kit} />
      ))}
      <Funnel sim={sim} kit={kit} />
      <Deck sim={sim} kit={kit} />
      <SurpriseBox sim={sim} kit={kit} />
    </group>
  )
}

/** A number on a round sticker in its own colour, white with an ink outline like every word of the game, with a shine and a white ring. */
function numberFace(n: CircleNumber) {
  const S = 256
  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, S, S)
    ctx.fillStyle = CIRCLE_COLOUR[n]
    ctx.fillRect(0, 0, S, S)
    const shine = ctx.createRadialGradient(S * 0.34, S * 0.28, 4, S * 0.34, S * 0.28, S * 0.6)
    shine.addColorStop(0, 'rgba(255,255,255,0.5)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2)
    ctx.stroke()
    const size = n === 100 ? 100 : 170
    ctx.font = `700 ${size}px "Fredoka Variable", "Comic Sans MS", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = n === 100 ? 15 : 20
    ctx.strokeStyle = palette.ink
    const y = S / 2 + size * 0.06
    ctx.strokeText(String(n), S / 2, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(n), S / 2, y)
  }
  const texture = canvasTexture(S, S, true, draw)
  redrawWithFont(texture, draw)
  return texture
}

/** The trampoline's mat: deep blue with two light rings and a big yellow star in the middle, where the slime lands. */
function matFace() {
  return canvasTexture(256, 256, true, (ctx) => {
    ctx.fillStyle = '#3d46a8'
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = '#8f9bff'
    ctx.lineWidth = 10
    for (const r of [116, 84]) {
      ctx.beginPath()
      ctx.arc(128, 128, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? 54 : 23
      ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fillStyle = palette.star
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = palette.ink
    ctx.stroke()
  })
}

/** A five-pointed star outline. */
function starShape(outer: number, inner: number) {
  const shape = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outer : inner
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  return shape
}

/** A half disc lying flat with its straight edge along x, reaching toward +z: one door of the hatch. */
function doorShape() {
  const shape = new Shape()
  const r = HATCH_R - 0.02
  shape.moveTo(r, 0)
  shape.absarc(0, 0, r, 0, Math.PI, false)
  shape.lineTo(r, 0)
  const door = new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 24 })
  // The shape's y becomes +z and its thickness goes down from the deck's top.
  return door.rotateX(Math.PI / 2)
}

/** The deck as a lathe: a thick ring from the hatch out to DECK_R with a rounded outer rim, its top at y = 0. */
function deckShape() {
  const points = [new Vector2(HATCH_R, -DECK_T), new Vector2(DECK_R - 0.15, -DECK_T)]
  for (let i = 1; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2)
    points.push(new Vector2(DECK_R - 0.15 + Math.cos(a) * 0.15, -DECK_T + 0.15 + Math.sin(a) * 0.15))
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2)
    points.push(new Vector2(DECK_R - 0.15 + Math.cos(a) * 0.15, -0.15 + Math.sin(a) * 0.15))
  }
  points.push(new Vector2(HATCH_R, 0), new Vector2(HATCH_R, -DECK_T))
  return new LatheGeometry(points, 72)
}

/** The giant circle's funnel: from just outside the hole, flat at first, curving down to its rim over the whole shaft. */
function funnelShape() {
  const points: Vector2[] = []
  for (let i = 0; i <= 14; i++) {
    const s = i / 14
    points.push(new Vector2(lerp(GIANT_HOLE + 0.1, GIANT_OUT, s), -FUNNEL_DROP * s ** 1.6))
  }
  return new LatheGeometry(points, 72)
}

/** The ring round the back of the shaft: from the front-left pole round the back to the front-right one, never across the front. */
function ringShape() {
  const c = 0.9
  const path = new CurvePath<Vector3>()
  const p = (x: number, z: number) => new Vector3(x, 0, z)
  path.add(new LineCurve3(p(-CORNER_X, CORNER_Z), p(-CORNER_X, -CORNER_Z + c)))
  path.add(new QuadraticBezierCurve3(p(-CORNER_X, -CORNER_Z + c), p(-CORNER_X, -CORNER_Z), p(-CORNER_X + c, -CORNER_Z)))
  path.add(new LineCurve3(p(-CORNER_X + c, -CORNER_Z), p(CORNER_X - c, -CORNER_Z)))
  path.add(new QuadraticBezierCurve3(p(CORNER_X - c, -CORNER_Z), p(CORNER_X, -CORNER_Z), p(CORNER_X, -CORNER_Z + c)))
  path.add(new LineCurve3(p(CORNER_X, -CORNER_Z + c), p(CORNER_X, CORNER_Z)))
  return new TubeGeometry(path, 120, 0.08, 8, false)
}

/** A key: a ring to hold at the front, a shaft pointing back (into a lock) and two teeth. */
function keyParts() {
  return merge([
    [new TorusGeometry(0.1, 0.035, 8, 20), placed([0, 0, 0.17], [0, 0, 0], [1, 1, 1])],
    [new CylinderGeometry(0.026, 0.026, 0.3, 8), placed([0, 0, 0.0], [Math.PI / 2, 0, 0], [1, 1, 1])],
    [new SphereGeometry(0.045, 10, 8), placed([0, 0, 0.1], [0, 0, 0], [1, 1, 1])],
    ...[-0.06, -0.12].map((z) => [new CylinderGeometry(0.02, 0.02, 0.07, 6), placed([0, -0.045, z], [0, 0, 0], [1, 1, 1])] as const),
  ])
}

type TowerKit = ReturnType<typeof useTowerKit>

/** Everything the tower of one island is made of. */
function useTowerKit(theme: Theme) {
  return useOwned(
    (own) => {
      const night = theme.night
      const [a0, a1, a2] = theme.accent
      const frameMap = own(bands([a0, '#ffffff'], 'u'))
      frameMap.repeat.set(12, 1)
      const deckMap = own(bands([tint(a2, 0.35), '#ffffff'], 'u'))
      deckMap.repeat.set(16, 1)
      // Seen mostly from below on the way up, the funnel and the deck glow of themselves so the sun above does not leave them dark.
      const rainbowMap = own(bands(RAINBOW, 'v'))
      const rainbow = own(new MeshStandardMaterial({ map: rainbowMap, emissiveMap: rainbowMap, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.45, side: DoubleSide }))
      const face = (n: CircleNumber) => {
        const map = own(numberFace(n))
        return own(new MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.4 }))
      }
      const gold = own(new MeshStandardMaterial({ color: palette.gold, roughness: 0.25, metalness: 0.55, emissive: palette.goldDeep, emissiveIntensity: 0.15 }))
      const twoBands = (w: number, h: number) =>
        merge([
          [new RoundedBoxGeometry(w + 0.02, h, 0.16, 2, 0.03), placed([0, 0, 0], [0, 0, 0], [1, 1, 1])],
          [new RoundedBoxGeometry(0.16, h, w + 0.02, 2, 0.03), placed([0, 0, 0], [0, 0, 0], [1, 1, 1])],
        ])
      return {
        accent: theme.accent.map((c) => own(foam(c, night))),
        ringColours: theme.accent.map((c) => new Color(tint(c, RING_TINT))),
        dark: own(ink()),
        gold,
        metal: own(new MeshStandardMaterial({ color: palette.metal, roughness: 0.3, metalness: 0.5 })),

        // The trampoline.
        frame: own(foamMap(frameMap, night)),
        frameShape: own(new TorusGeometry(TRAMPOLINE_R - 0.13, 0.13, 12, 56)),
        skirtShape: own(new CylinderGeometry(TRAMPOLINE_R - 0.1, TRAMPOLINE_R - 0.04, MAT_Y + 0.04, 48, 1, true)),
        mat: own(new MeshStandardMaterial({ map: own(matFace()), roughness: 0.7 })),
        springsShape: own(
          merge(
            Array.from({ length: 20 }, (_, i) => {
              const a = (i / 20) * Math.PI * 2
              const mid = (MAT_R + TRAMPOLINE_R - 0.24) / 2
              return [new CylinderGeometry(0.03, 0.03, TRAMPOLINE_R - 0.24 - MAT_R + 0.1, 6), placed([Math.cos(a) * mid, MAT_Y + 0.02, -Math.sin(a) * mid], [0, a, Math.PI / 2], [1, 1, 1])] as const
            }),
          ),
        ),

        // The scaffold.
        pole: own(foamMap(own(candy('#ffffff', a0)), night)),
        capShape: own(new SphereGeometry(0.3, 16, 12)),
        flagShape: own(new ShapeGeometry(new Shape([new Vector2(0, 0), new Vector2(0.75, 0.22), new Vector2(0, 0.44)]))),
        flags: theme.accent.map((c) => {
          const flag = own(foam(c, night))
          flag.side = DoubleSide
          return flag
        }),
        // Each ring has its own tint, so their light from within is a little white.
        ring: own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: night ? 0.12 : 0.05 })),
        ringShape: own(ringShape()),

        // The circles.
        circleShape: own(puck(1, CIRCLE_T, 0.12, 48).translate(0, -CIRCLE_T / 2, 0).rotateX(Math.PI / 2)),
        circleFaceShape: own(new RingGeometry(0, 0.86, 48)),
        circleBody: { 1: own(foam(CIRCLE_COLOUR[1], night)), 5: own(foam(CIRCLE_COLOUR[5], night)), 100: own(foam(CIRCLE_COLOUR[100], night)) },
        circleFace: { 1: face(1), 5: face(5), 100: face(100) },
        goldRimShape: own(new TorusGeometry(0.93, 0.07, 10, 48)),
        burstShape: own(new TorusGeometry(1, 0.045, 6, 48)),
        burst: own(new MeshStandardMaterial({ color: '#ffffff', emissive: palette.star, emissiveIntensity: 0.8, roughness: 0.4 })),

        // The giant circle.
        rainbow,
        funnelShape: own(funnelShape()),
        lipShape: own(new TorusGeometry(GIANT_HOLE + 0.1, 0.14, 12, 56)),
        rimShape: own(new TorusGeometry(GIANT_OUT, 0.18, 12, 80)),
        bulbsShape: [0, 1].map((odd) =>
          own(
            merge(
              Array.from({ length: 9 }, (_, i) => {
                const a = ((2 * i + odd) / 18) * Math.PI * 2
                return [new SphereGeometry(0.13, 10, 8), placed([Math.cos(a) * (GIANT_OUT + 0.17), 0, Math.sin(a) * (GIANT_OUT + 0.17)], [0, 0, 0], [1, 1, 1])] as const
              }),
            ),
          ),
        ),
        bulbs: [palette.white, a1].map((c) => own(new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.3 }))),

        // The deck and its hatch.
        deck: own(new MeshStandardMaterial({ map: deckMap, emissiveMap: deckMap, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.5 })),
        deckShape: own(deckShape()),
        bumperShape: own(new TorusGeometry(DECK_R - 0.16, 0.2, 12, 80)),
        doorShape: own(doorShape()),

        // The surprise box, its lock and the key.
        box: own(foam(palette.boxRed, night)),
        ribbon: own(foam(palette.ribbon, night)),
        baseShape: own(new RoundedBoxGeometry(BOX_W, BOX_H, BOX_W, 3, 0.07)),
        baseBandsShape: own(twoBands(BOX_W, BOX_H).translate(0, BOX_H / 2, 0)),
        lidShape: own(new RoundedBoxGeometry(BOX_W + 0.08, LID_H, BOX_W + 0.08, 3, 0.06).translate(0, LID_H / 2, 0)),
        lidBandsShape: own(twoBands(BOX_W + 0.08, LID_H + 0.01).translate(0, LID_H / 2, 0)),
        bowShape: own(
          merge([
            ...[-1, 1].map((side) => [new TorusGeometry(0.15, 0.055, 10, 20), placed([side * 0.15, LID_H + 0.12, 0], [0, 0, side * 0.55], [1, 0.75, 1])] as const),
            [new SphereGeometry(0.08, 12, 10), placed([0, LID_H + 0.07, 0], [0, 0, 0], [1, 1, 1])],
          ]),
        ),
        lockShape: own(new RoundedBoxGeometry(0.3, 0.26, 0.1, 2, 0.05)),
        keyholeShape: own(
          merge([
            [new CylinderGeometry(0.035, 0.035, 0.02, 12), placed([0, 0.03, 0.051], [Math.PI / 2, 0, 0], [1, 1, 1])],
            [new RoundedBoxGeometry(0.028, 0.07, 0.02, 1, 0.008), placed([0, -0.015, 0.051], [0, 0, 0], [1, 1, 1])],
          ]),
        ),
        shackleShape: own(new TorusGeometry(0.09, 0.028, 8, 16, Math.PI)),
        keyShape: own(keyParts()),
        sparkShape: own(new SphereGeometry(0.07, 8, 6)),
        mouthShape: own(new PlaneGeometry(BOX_W - 0.16, BOX_W - 0.16).rotateX(-Math.PI / 2)),
        mouth: own(new MeshBasicMaterial({ color: '#fff3b0', toneMapped: false })),
        beamShape: own(new CylinderGeometry(0.32, 0.5, BEAM_H, 24, 1, true).translate(0, BEAM_H / 2, 0)),
        beam: own(new MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false })),
        confettiShape: own(new PlaneGeometry(0.12, 0.08)),
        confetti: own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: DoubleSide })),
        starShape: own(new ShapeGeometry(starShape(0.14, 0.06))),
        star: own(new MeshStandardMaterial({ color: palette.star, emissive: palette.star, emissiveIntensity: 0.6, roughness: 0.3, side: DoubleSide })),
      }
    },
    [theme],
  )
}

/**
 * The trampoline at the tower's foot, TRAMPOLINE_R round: a padded striped ring, springs,
 * and a blue mat with a star. At every launch the mat dips under the slime, bulges up as
 * it flies off and wobbles still, and the ring squashes.
 */
function Trampoline({ sim, kit }: { sim: Sim; kit: TowerKit }) {
  const ring = useRef<Group>(null!)
  const memo = useRef({ dip: 0 })
  const parts = useOwned((own) => {
    const shape = own(new RingGeometry(0.0001, MAT_R, 48, 6))
    return { shape, rest: Float32Array.from(shape.getAttribute('position').array) }
  }, [])
  useFrame(() => {
    const since = sim.time - sim.tower.launchAt
    let dip = 0
    if (sim.tower.launchAt >= 0 && since < 1.2) {
      if (since < 0.07) dip = -MAT_DIP * (since / 0.07)
      else {
        const s = since - 0.07
        dip = Math.max(-MAT_DIP, 0.24 * Math.exp(-3.5 * s) * Math.sin(17.6 * s) - MAT_DIP * Math.exp(-12 * s))
      }
    }
    ring.current.scale.set(1, 1 + Math.min(0, dip) * 3 + Math.max(0, dip) * 0.6, 1)
    if (dip === memo.current.dip) return
    memo.current.dip = dip
    const position = parts.shape.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const x = parts.rest[i * 3]!
      const y = parts.rest[i * 3 + 1]!
      position.setZ(i, dip * (1 - (x * x + y * y) / (MAT_R * MAT_R)))
    }
    position.needsUpdate = true
    parts.shape.computeVertexNormals()
  })
  return (
    <group>
      <mesh position={[0, MAT_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={parts.shape} material={kit.mat} receiveShadow />
      <group ref={ring}>
        <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={kit.frameShape} material={kit.frame} castShadow receiveShadow />
        <mesh position={[0, (MAT_Y + 0.04) / 2, 0]} geometry={kit.skirtShape} material={kit.accent[1]} />
        <mesh geometry={kit.springsShape} material={kit.metal} />
      </group>
    </group>
  )
}

/**
 * The open scaffold round the shaft: four candy poles from the water to above the deck,
 * each with a ball and a waving flag on top, and coloured rings every RING_STEP round the
 * back and sides only, so nothing stands between the camera and the slime.
 */
function Scaffold({ sim, kit }: { sim: Sim; kit: TowerKit }) {
  const rings = useRef<InstancedMesh>(null!)
  const flags = useRef<Group[]>([])
  const topY = sim.tower.topY
  const parts = useOwned(
    (own) => {
      const poleH = topY + 1.5 - CORNER_BOTTOM
      const ringYs: number[] = []
      for (let y = RING_STEP; y < topY - 1.5; y += RING_STEP) ringYs.push(y)
      return { poleH, ringYs, pole: own(vFromHeight(new CylinderGeometry(0.2, 0.2, poleH, 16), 1.3)) }
    },
    [topY],
  )
  useLayoutEffect(() => {
    const mesh = rings.current
    parts.ringYs.forEach((y, i) => {
      dummy.position.set(0, y, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, kit.ringColours[i % kit.ringColours.length]!)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [parts, kit])
  useFrame(() => {
    const t = sim.time
    for (let k = 0; k < flags.current.length; k++) flags.current[k]!.rotation.y = (CORNERS[k]![0] < 0 ? Math.PI : 0) + 0.35 * Math.sin(t * 3 + k * 1.3)
  })
  return (
    <>
      {CORNERS.map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh position={[0, CORNER_BOTTOM + parts.poleH / 2, 0]} geometry={parts.pole} material={kit.pole} castShadow />
          <mesh position={[0, topY + 1.7, 0]} geometry={kit.capShape} material={kit.accent[3]} />
          <group ref={refAt(flags, k)} position={[0, topY + 1.05, 0]}>
            <mesh geometry={kit.flagShape} material={kit.flags[k]} />
          </group>
        </group>
      ))}
      <instancedMesh key={parts.ringYs.length} ref={rings} args={[kit.ringShape, kit.ring, parts.ringYs.length]} castShadow />
    </>
  )
}

/**
 * One numbered circle: a thick rounded puck in its number's colour facing the camera,
 * with the number big on its front (a 100 has a gold rim too), exactly the sim's radius,
 * moved by the sim's x and y. Passed untouched it pops: it swells, vanishes and leaves a
 * bright ring; when the slime touches it, it wobbles; when the climb starts again after a
 * touch, it grows back.
 */
function CircleToy({ sim, index, n, kit }: { sim: Sim; index: number; n: CircleNumber; kit: TowerKit }) {
  const root = useRef<Group>(null!)
  const disc = useRef<Group>(null!)
  const burst = useRef<Mesh>(null!)
  const memo = useRef({ popped: false, backAt: -1, bonkAt: -1, mine: false })
  useFrame(() => {
    const c = sim.tower.circles[index]!
    const tower = sim.tower
    const slime = sim.slime
    const t = sim.time
    const m = memo.current
    root.current.position.set(c.x, c.y, 0)
    if (m.popped && c.poppedAt < 0) m.backAt = t
    m.popped = c.poppedAt >= 0
    if (tower.bonkAt !== m.bonkAt) {
      m.bonkAt = tower.bonkAt
      m.mine = tower.bonkAt >= 0 && Math.hypot(slime.x - c.x, slime.y + slime.r - c.y) < 0.85 * slime.r + c.r + 0.4
    }
    let scale = c.r
    let ring = -1
    if (c.poppedAt >= 0) {
      const since = t - c.poppedAt
      scale *= since < 0.1 ? 1 + 2.5 * since : Math.max(0, 1.25 * (1 - (since - 0.1) / 0.12))
      if (since < 0.3) ring = c.r * (1 + 3.5 * since)
    } else if (m.backAt >= 0 && t - m.backAt < 0.4) scale *= easeOutBack((t - m.backAt) / 0.4)
    const w = m.mine ? jiggle(t, tower.bonkAt, 0.2, 4, 0.7) : 0
    disc.current.visible = scale > 0.001
    disc.current.scale.set(scale * (1 + w), scale * (1 - w), 1)
    burst.current.visible = ring > 0
    if (ring > 0) burst.current.scale.setScalar(ring)
  })
  return (
    <group ref={root}>
      <group ref={disc}>
        <mesh geometry={kit.circleShape} material={kit.circleBody[n]} castShadow />
        <mesh position={[0, 0, CIRCLE_T / 2 + 0.004]} geometry={kit.circleFaceShape} material={kit.circleFace[n]} />
        {n === 100 && <mesh position={[0, 0, CIRCLE_T / 2]} geometry={kit.goldRimShape} material={kit.gold} />}
      </group>
      <mesh ref={burst} geometry={kit.burstShape} material={kit.burst} visible={false} />
    </group>
  )
}

/**
 * The giant circle at giantY: a rainbow funnel covering the whole shaft, opening down
 * toward the rising slime and narrowing to a hole GIANT_HOLE round with a gold lip, a
 * ring of chasing lights round its rim. When the sim pulls the slime in (funnelAt) it
 * wobbles like jelly and its lights race.
 */
function Funnel({ sim, kit }: { sim: Sim; kit: TowerKit }) {
  const body = useRef<Group>(null!)
  const lights = useRef<Group>(null!)
  const memo = useRef({ time: sim.time, spin: 0 })
  useFrame(() => {
    const t = sim.time
    const m = memo.current
    const dt = clamp(t - m.time, 0, 0.1)
    m.time = t
    const at = sim.tower.funnelAt
    const w = jiggle(t, at, 0.1, 2.5, 1.2)
    body.current.scale.set(1 + w * 0.5, 1 - w, 1 + w * 0.5)
    const racing = at >= 0 && t - at < 2.5
    m.spin += dt * (racing ? 3 : 0.5)
    lights.current.rotation.y = m.spin
    const blink = Math.sin(t * (racing ? 14 : 5))
    kit.bulbs[0]!.emissiveIntensity = 0.5 + 0.5 * blink
    kit.bulbs[1]!.emissiveIntensity = 0.5 - 0.5 * blink
  })
  return (
    <group position={[0, sim.tower.giantY, 0]}>
      <group ref={body}>
        <mesh geometry={kit.funnelShape} material={kit.rainbow} castShadow receiveShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={kit.lipShape} material={kit.gold} />
        <mesh position={[0, -FUNNEL_DROP, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={kit.rimShape} material={kit.accent[0]} />
        <group ref={lights} position={[0, -FUNNEL_DROP, 0]}>
          <mesh geometry={kit.bulbsShape[0]} material={kit.bulbs[0]} />
          <mesh geometry={kit.bulbsShape[1]} material={kit.bulbs[1]} />
        </group>
      </group>
    </group>
  )
}

/**
 * The deck at topY: a round striped floor with a soft rim and a hatch of two half
 * doors in its middle. The doors slide apart under the floor while the slime comes up
 * through it and close under it once it stands on top.
 */
function Deck({ sim, kit }: { sim: Sim; kit: TowerKit }) {
  const doors = useRef<Mesh[]>([])
  const memo = useRef({ time: sim.time, open: 0 })
  useFrame(() => {
    const tower = sim.tower
    const s = sim.slime
    const t = sim.time
    const m = memo.current
    const dt = clamp(t - m.time, 0, 0.1)
    m.time = t
    const below = s.y < tower.topY - 0.02
    const coming = below && ((sim.phase === 'tower' && s.y + 2 * s.r > tower.topY - 1.4) || sim.phase === 'top')
    m.open = ease(m.open, coming ? 1 : 0, dt, 0.05)
    doors.current[0]!.position.z = m.open * (HATCH_R + 0.1)
    doors.current[1]!.position.z = -m.open * (HATCH_R + 0.1)
  })
  return (
    <group position={[0, sim.tower.topY, 0]}>
      <mesh geometry={kit.deckShape} material={kit.deck} castShadow receiveShadow />
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={kit.bumperShape} material={kit.accent[0]} castShadow />
      {[0, 1].map((k) => (
        <group key={k} rotation={[0, k * Math.PI, 0]}>
          <mesh ref={refAt(doors, k)} position={[0, -0.03, 0]} geometry={kit.doorShape} material={kit.accent[1]} receiveShadow />
        </group>
      ))}
    </group>
  )
}

/** One piece of confetti or one star: how it is thrown, how it spins, and, for the fountain, when in each round it goes. */
interface Flake {
  vx: number
  vy: number
  vz: number
  spinX: number
  spinY: number
  phase: number
  delay: number
  fountain: boolean
}

function flakes(count: number, burst: number, seed: number): Flake[] {
  const rand = mulberry32(seed)
  return Array.from({ length: count }, (_, i) => {
    const fountain = i >= burst
    const a = rand() * Math.PI * 2
    const speed = fountain ? 0.5 + rand() * 1.3 : 1 + rand() * 2.6
    return {
      vx: Math.cos(a) * speed,
      vy: (fountain ? 7 : 5) + rand() * 3,
      vz: Math.sin(a) * speed,
      spinX: 4 + rand() * 8,
      spinY: 3 + rand() * 6,
      phase: rand() * Math.PI * 2,
      delay: fountain ? ((i - burst) / (count - burst)) * FOUNTAIN_EVERY : rand() * 0.08,
      fountain,
    }
  })
}

/**
 * Where a flake is `age` seconds after it was thrown from `origin` with the air's drag,
 * fluttering a little, and how it is turned. It comes to rest on the deck at `floor`.
 * Writes the matrix into `dummy`, scaled by `size`.
 */
function placeFlake(f: Flake, age: number, origin: Vector3, floor: number, size: number) {
  const e = (1 - Math.exp(-DRAG * age)) / DRAG
  const y = origin.y + (f.vy + FALL / DRAG) * e - (FALL / DRAG) * age
  const landed = y <= floor
  dummy.position.set(origin.x + f.vx * e + 0.15 * Math.sin(age * 5 + f.phase), landed ? floor : y, origin.z + f.vz * e)
  if (landed) dummy.rotation.set(-Math.PI / 2, f.phase, 0)
  else dummy.rotation.set(age * f.spinX + f.phase, age * f.spinY, 0)
  dummy.scale.setScalar(size)
  dummy.updateMatrix()
}

/**
 * Places every flake of a list that is in the air or lying on the deck `open` seconds
 * after the lid popped: the burst ones once, the fountain ones round and round while
 * the box had nothing left to give.
 */
function throwFlakes(list: readonly Flake[], mesh: InstancedMesh, open: number, fountain: boolean, origin: Vector3, floor: number) {
  let n = 0
  for (let i = 0; i < list.length; i++) {
    const fl = list[i]!
    let age: number
    let size: number
    if (fl.fountain) {
      if (!fountain || open < fl.delay) continue
      age = mod(open - fl.delay, FOUNTAIN_EVERY)
      size = Math.min(1, (FOUNTAIN_EVERY - age) / 0.3)
    } else {
      age = open - fl.delay
      if (age < 0 || age > CONFETTI_LIFE) continue
      size = Math.min(1, (CONFETTI_LIFE - age) / 0.5)
    }
    placeFlake(fl, age, origin, floor, size)
    mesh.setMatrixAt(n++, dummy.matrix)
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
}

/**
 * The surprise box on the deck: red with a yellow ribbon and bow, a gold padlock on its
 * front. When the slime lands on top the key flies from its head into the lock; at
 * unlockAt it turns, the shackle pops and the lock drops off; the box shivers; at openAt
 * the lid pops off and lands beside it with a burst of confetti and stars, and the new
 * thing to wear rises out and flies onto the slime, where it sits by giftAt (when the
 * slime starts wearing it). With nothing left to give, a fountain of confetti and stars
 * keeps going instead.
 */
function SurpriseBox({ sim, kit }: { sim: Sim; kit: TowerKit }) {
  const tower = sim.tower
  const gift = sim.gift
  const shake = useRef<Group>(null!)
  const base = useRef<Group>(null!)
  const lid = useRef<Group>(null!)
  const lock = useRef<Group>(null!)
  const shackle = useRef<Mesh>(null!)
  const lockKey = useRef<Group>(null!)
  const flyingKey = useRef<Group>(null!)
  const giftRef = useRef<Group>(null!)
  const mouth = useRef<Mesh>(null!)
  const beam = useRef<Mesh>(null!)
  const trail = useRef<Mesh[]>([])
  const paper = useRef<InstancedMesh>(null!)
  const stars = useRef<InstancedMesh>(null!)
  const pieces = useMemo(() => ({ paper: flakes(CONFETTI, BURST, 77), stars: flakes(STARS, STAR_BURST, 99) }), [])
  const spots = useMemo(() => {
    const box = new Vector3(BOX_X, tower.topY, BOX_Z)
    return { box, keyhole: new Vector3(BOX_X, tower.topY + LOCK_Y + 0.03, BOX_Z + LOCK_Z + 0.105), mouth: new Vector3(BOX_X, tower.topY + BOX_H + 0.15, BOX_Z) }
  }, [tower.topY])
  useLayoutEffect(() => {
    const colours = palette.confetti.map((c) => new Color(c))
    for (let i = 0; i < CONFETTI; i++) paper.current.setColorAt(i, colours[i % colours.length]!)
    if (paper.current.instanceColor) paper.current.instanceColor.needsUpdate = true
  }, [])
  useFrame(() => {
    const f = sim.finish
    const s = sim.slime
    const t = sim.time
    const topY = tower.topY
    const r = s.r
    const sx = s.x
    const sy = s.y
    const sz = tower.z - s.z

    // The key flies from above the slime's head into the lock, then rides in the lock.
    const keyIn = f.topAt >= 0 && t - f.topAt >= KEY_FLY
    flyingKey.current.visible = f.topAt >= 0 && !keyIn
    if (flyingKey.current.visible) {
      const u = clamp01((t - f.topAt) / KEY_FLY)
      const e = smoothstep(0, 1, u)
      flyingKey.current.position.set(lerp(sx, spots.keyhole.x, e), lerp(sy + 2 * r + 0.5, spots.keyhole.y, e) + 0.9 * 4 * u * (1 - u), lerp(sz, spots.keyhole.z, e))
      flyingKey.current.rotation.set(0, (1 - e) * Math.PI * 4, 0)
    }
    const unlock = f.unlockAt >= 0 ? t - f.unlockAt : -1
    lockKey.current.visible = keyIn
    lockKey.current.rotation.z = unlock >= 0 ? (Math.PI / 2) * smoothstep(0, 0.2, unlock) : 0
    shackle.current.position.y = 0.13 + (unlock >= 0 ? 0.1 * smoothstep(0.12, 0.25, unlock) : 0)
    const fall = unlock - 0.35
    lock.current.visible = fall < 0.9
    if (fall > 0) {
      lock.current.position.set(0, LOCK_Y - Math.min(LOCK_Y - 0.12, 4.5 * fall * fall), LOCK_Z + 0.5 * fall)
      lock.current.rotation.x = -Math.min(1.3, 4 * fall)
      lock.current.scale.setScalar(fall < 0.6 ? 1 : 1 - (fall - 0.6) / 0.3)
    } else {
      lock.current.position.set(0, LOCK_Y, LOCK_Z)
      lock.current.rotation.x = 0
      lock.current.scale.setScalar(1)
    }

    // A shiver once the lock is off, until the lid pops; then the box squashes.
    const open = f.openAt >= 0 ? t - f.openAt : -1
    shake.current.rotation.z = unlock > 0.3 && open < 0 ? 0.08 * Math.sin(t * 28) * Math.max(0, Math.sin(t * 5)) : 0
    const pop = jiggle(t, f.openAt, 0.18, 4, 0.6)
    base.current.scale.set(1 + pop * 0.4, 1 - pop, 1 + pop * 0.4)
    mouth.current.visible = open >= 0
    beam.current.visible = open >= 0 && open < BEAM_FOR
    if (beam.current.visible) {
      kit.beam.opacity = 0.55 * (1 - open / BEAM_FOR)
      beam.current.scale.set(1 + open * 0.3, Math.min(1, open * 4), 1 + open * 0.3)
    }

    // The lid flies off in a high arc, turning over once, and lands on the deck beside the box.
    if (open < 0) {
      lid.current.position.set(0, BOX_H, 0)
      lid.current.rotation.set(0, 0, 0)
    } else {
      const u = clamp01(open / LID_FLY)
      lid.current.position.set(1.25 * u, lerp(BOX_H, 0, u) + 2 * 4 * u * (1 - u), 0.35 * u)
      lid.current.rotation.set(0, 0.4 * u, -Math.PI * 2 * u)
      lid.current.position.y += Math.abs(jiggle(t, f.openAt + LID_FLY, 0.08, 3, 0.4))
    }

    // The gift rises out of the box and arcs onto the slime, where it sits until the slime wears it.
    const flying = gift !== null && open >= 0 && f.giftAt < 0
    giftRef.current.visible = flying
    for (const m of trail.current) m.visible = false
    if (flying) {
      const slot = SLOT_AT[ITEMS[gift].slot]
      to.set(sx + slot[0] * r, sy + slot[1] * r, sz + slot[2] * r)
      for (let k = 0; k <= trail.current.length; k++) {
        const u = clamp01((open - 0.05) / GIFT_FLY - k * 0.06)
        const e = smoothstep(0, 1, u)
        at.set(lerp(spots.box.x, to.x, e), lerp(spots.box.y + BOX_H * 0.6, to.y, e) + (1.4 + r) * 4 * u * (1 - u), lerp(spots.box.z, to.z, e))
        if (k === 0) {
          giftRef.current.position.copy(at)
          giftRef.current.rotation.set(0, (1 - e) * Math.PI * 4, 0)
          giftRef.current.scale.setScalar(lerp(0.3, 1, smoothstep(0, 0.2, u)) * lerp(1, r * 1.15, smoothstep(0.5, 1, u)))
        } else if (u > 0 && u < 1) {
          const m = trail.current[k - 1]!
          m.visible = true
          m.position.copy(at)
          m.scale.setScalar(1 - k / (trail.current.length + 1))
        }
      }
    }

    // Confetti and stars: one burst when the lid pops, and a fountain for a box with nothing left to give.
    const p = paper.current
    const st = stars.current
    if (open < 0) {
      p.count = 0
      st.count = 0
      return
    }
    throwFlakes(pieces.paper, p, open, gift === null, spots.mouth, topY + 0.015)
    throwFlakes(pieces.stars, st, open, gift === null, spots.mouth, topY + 0.015)
  })
  return (
    <>
      <group position={[BOX_X, tower.topY, BOX_Z]}>
        <group ref={shake}>
          <group ref={base}>
            <mesh position={[0, BOX_H / 2, 0]} geometry={kit.baseShape} material={kit.box} castShadow receiveShadow />
            <mesh geometry={kit.baseBandsShape} material={kit.ribbon} />
            <mesh ref={mouth} position={[0, BOX_H + 0.004, 0]} geometry={kit.mouthShape} material={kit.mouth} visible={false} />
            <mesh ref={beam} position={[0, BOX_H, 0]} geometry={kit.beamShape} material={kit.beam} visible={false} />
          </group>
          <group ref={lid} position={[0, BOX_H, 0]}>
            <mesh geometry={kit.lidShape} material={kit.box} castShadow />
            <mesh geometry={kit.lidBandsShape} material={kit.ribbon} />
            <mesh geometry={kit.bowShape} material={kit.ribbon} castShadow />
          </group>
        </group>
        <group ref={lock} position={[0, LOCK_Y, LOCK_Z]}>
          <mesh geometry={kit.lockShape} material={kit.gold} />
          <mesh geometry={kit.keyholeShape} material={kit.dark} />
          <mesh ref={shackle} position={[0, 0.13, 0]} geometry={kit.shackleShape} material={kit.metal} />
          <group ref={lockKey} position={[0, 0.03, 0.105]} visible={false}>
            <mesh geometry={kit.keyShape} material={kit.gold} />
          </group>
        </group>
      </group>
      <group ref={flyingKey} visible={false}>
        <mesh geometry={kit.keyShape} material={kit.gold} />
      </group>
      <group ref={giftRef} visible={false}>{gift !== null && <ItemMesh item={gift} />}</group>
      {Array.from({ length: 5 }, (_, k) => (
        <mesh key={k} ref={refAt(trail, k)} geometry={kit.sparkShape} material={kit.burst} visible={false} />
      ))}
      <instancedMesh ref={paper} args={[kit.confettiShape, kit.confetti, CONFETTI]} frustumCulled={false} />
      <instancedMesh ref={stars} args={[kit.starShape, kit.star, STARS]} frustumCulled={false} />
    </>
  )
}
