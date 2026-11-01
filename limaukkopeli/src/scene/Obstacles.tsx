import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import { clamp, lerp, mulberry32, smoothstep } from '../game/math'
import {
  FAN_R,
  FRAME_DEPTH,
  FRAME_H,
  GATE_DEPTH,
  GATE_GAP,
  GATE_H,
  HUB_Y,
  PAD_H,
  PAD_R,
  PADDLE_BOTTOM,
  PADDLE_IN,
  PADDLE_THICK,
  PADDLE_TOP,
  type FanSpec,
  type FrameSpec,
  type GateSpec,
  type PadSpec,
  type Sim,
  type Spinner,
  type SpinnerSpec,
} from '../game/model'
import {
  bands,
  candy,
  chevrons,
  clipToGround,
  easeOutBack,
  emissiveOf,
  foam,
  foamMap,
  ink,
  jiggle,
  merge,
  nearSlime,
  onTrack,
  placed,
  puck,
  refAt,
  roundedRectDistance,
  softBlob,
  teachGlow,
  tint,
  twinkle,
  useDrawNear,
  useOwned,
  uvFromPosition,
  vFromHeight,
} from './foam'
import { palette, toThree, type Theme } from './look'

// ------------------------------------------------------------------ spinners

const PADDLE_H = PADDLE_TOP - PADDLE_BOTTOM
const PADDLE_MID = (PADDLE_TOP + PADDLE_BOTTOM) / 2
/** One coloured and one white band along a paddle take this long. */
const PADDLE_STRIPE = 1.1
/** The paddle's eyes and smile, above and below its middle. */
const PADDLE_EYE_Y = 0.42
const PADDLE_SMILE_Y = -0.14
/** The post stands from this deep in the water up to the hub. */
const POST_BOTTOM = -1.2
/** The rods the paddle hangs from, between its top and the arm. */
const ROD_H = HUB_Y - PADDLE_TOP + 0.1
const ROD_Y = (HUB_Y + PADDLE_TOP) / 2
/** The soft shadow straight under a paddle, which shows a child where on the track it is. */
const SHADE = '#1e1a3a'
const SHADE_Y = 0.03

// ------------------------------------------------------------------ fans

const FAN_BASE_H = 0.32
/** The head's centre; its cage is FAN_CAGE_R round, so all of the fan stays inside the FAN_R bumper the slime slides round. */
const FAN_HEAD_Y = 1.75
const FAN_CAGE_R = 1.0
const FAN_STAND_H = FAN_HEAD_Y - FAN_CAGE_R + 0.15 - FAN_BASE_H
const FAN_FACE_Z = 0.3
const FAN_LAMP_Y = FAN_CAGE_R + 0.24
/** Where the four ribbons are tied round the front rim, as angles in the head's plane. */
const RIBBON_AT = [200, 340, 160, 20].map((deg) => (deg * Math.PI) / 180)
/** One arrow of the wind lane per this length of track. */
const LANE_TILE = 1.6
const LANE_Y = 0.025
const LAMP_CALM = new Color('#5ee06a')
const LAMP_WARN = new Color('#ffd23f')
const LAMP_HARD = new Color('#ff4f4f')

// ------------------------------------------------------------------ frames, pads, slides, gates

/** A frame's joints are balls this round at the corners of its collision box; its bars are a little thinner. */
const FRAME_JOINT = 0.095
const FRAME_BAR = 0.068
/** About this far between the posts of a frame. */
const FRAME_STEP = 0.95
const PAD_EDGE = 0.13
/** The ice strips: one arrow per this length, lying just over the track, crawling forward this fast. */
const ICE_TILE = 2
const ICE_Y = 0.012
const ICE_CRAWL = 0.45
const ICE = '#bfe8ff'
/** A gate lifts this high, over this long, sliding up its two poles. */
const GATE_LIFT = 3.2
const GATE_LIFT_FOR = 0.9
const GATE_LEG_R = 0.16
const GATE_POLE_TOP = GATE_H + GATE_LIFT + 0.3
/** The snow wall is a little thinner than the gate, under a cornice as deep as the gate. */
const GATE_WALL_DEPTH = 0.62
const GATE_CORNICE_H = 0.42
/** The bright blue band along the wall's underside that marks the low slot, and the face's half width (no icicles hang over it). */
const GATE_TRIM_H = 0.2
const GATE_FACE_HALF = 1.1

const dummy = new Object3D()

/**
 * The obstacles of a run, each a soft foam toy in the island's accent colours that shows
 * at a glance what it does and what to do about it, drawn exactly on the collision
 * shapes the sim uses (the constants in model.ts): spinners (hide), fans (step out of
 * their lane), climbing frames (jump), marshmallow pads (boing), ice slides (whee) and
 * snow gates (hide). Each reads the run every frame and is drawn only near the slime.
 * While the game teaches an obstacle, every one of that kind glows.
 */
export function Obstacles({ sim, theme }: { sim: Sim; theme: Theme }) {
  const kit = useKit(theme)
  useFrame((state) => {
    const kind = sim.teach !== null ? sim.teach.kind : null
    const now = state.clock.elapsedTime
    teachGlow(kit.paddle, kit.glow.paddle, kind === 'spinner', now)
    teachGlow(kit.fanCage, kit.glow.fanCage, kind === 'fan', now)
    teachGlow(kit.frame, kit.glow.frame, kind === 'frame', now)
    teachGlow(kit.snow, kit.glow.snow, kind === 'gate', now)
  })
  return (
    <>
      {sim.spinners.map((s, i) => (
        <SpinnerToy key={i} sim={sim} index={i} spec={s.spec} kit={kit} />
      ))}
      {sim.fans.map((f, i) => (
        <FanToy key={i} sim={sim} index={i} spec={f.spec} kit={kit} />
      ))}
      {sim.course.frames.length > 0 && <Frames sim={sim} kit={kit} />}
      {sim.pads.map((p, i) => (
        <PadToy key={i} sim={sim} index={i} spec={p.spec} kit={kit} />
      ))}
      {sim.course.slides.length > 0 && <Slides sim={sim} kit={kit} />}
      {sim.gates.map((g, i) => (
        <GateToy key={i} sim={sim} index={i} spec={g.spec} kit={kit} />
      ))}
    </>
  )
}

type Kit = ReturnType<typeof useKit>

/** Everything the obstacles of one island share: materials in its colours, the textures, and the shapes that every spinner, fan, frame, pad and gate has alike. */
function useKit(theme: Theme) {
  return useOwned(
    (own) => {
      const night = theme.night
      const [a0, a1, a2, a3] = theme.accent
      const accent = theme.accent.map((c) => own(foam(c, night)))
      const sides = [1, -1] as const
      const zs = PADDLE_THICK / 2

      const fanBaseMap = own(bands([a2, '#ffffff'], 'u'))
      fanBaseMap.repeat.set(8, 1)
      const padMap = own(bands([tint(a1, 0.3), '#ffffff'], 'u'))
      padMap.repeat.set(10, 1)
      const iceMap = own(chevrons('#ffffff', ICE, true, true))

      const paddle = own(foamMap(own(bands([a0, '#ffffff'], 'u')), night))
      const fanCage = own(foam(a0, night))
      // Each copy of a frame bar has its own colour, so the frames' light from within is a little white.
      const frame = own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: night ? 0.12 : 0.05 }))
      const snow = own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, emissive: '#dff1ff', emissiveIntensity: night ? 0.35 : 0.1 }))

      return {
        accent,
        accentColours: theme.accent.map((c) => new Color(c)),
        white: own(foam('#ffffff', night)),
        eye: own(new MeshStandardMaterial({ color: palette.eye, roughness: 0.25 })),
        dark: own(ink()),
        blush: own(new MeshStandardMaterial({ color: palette.blush, roughness: 0.6 })),
        metal: own(new MeshStandardMaterial({ color: palette.metal, roughness: 0.35, metalness: 0.35 })),
        glow: { paddle: emissiveOf(paddle), fanCage: emissiveOf(fanCage), frame: emissiveOf(frame), snow: emissiveOf(snow) },

        // Spinners: an islet, a hub, rods, and a paddle face on both sides; the spinners' posts and the gates' poles are the same candy.
        paddle,
        candyPole: own(foamMap(own(candy('#ffffff', a0)), night)),
        islet: own(foam(theme.top, night)),
        isletShape: own(new SphereGeometry(1.1, 24, 12)),
        postShape: own(vFromHeight(new CylinderGeometry(0.2, 0.24, HUB_Y - POST_BOTTOM, 16), 1.3)),
        hubShape: own(new SphereGeometry(0.46, 20, 12)),
        knobShape: own(new SphereGeometry(0.17, 14, 10)),
        rodShape: own(new CylinderGeometry(0.05, 0.05, ROD_H, 8)),
        paddleEyes: own(merge(sides.flatMap((side) => [-0.33, 0.33].map((x) => [new SphereGeometry(0.24, 18, 12), placed([x, 0, side * zs], [0, 0, 0], [1, 1, 0.32])] as const)))),
        paddlePupils: own(merge(sides.flatMap((side) => [-0.31, 0.31].map((x) => [new SphereGeometry(0.12, 12, 8), placed([x, -0.05, side * (zs + 0.06)], [0, 0, 0], [1, 1, 0.4])] as const)))),
        paddleSmiles: own(merge(sides.map((side) => [new TorusGeometry(0.26, 0.05, 8, 20, Math.PI), placed([0, PADDLE_SMILE_Y, side * (zs + 0.01)], [0, side < 0 ? Math.PI : 0, Math.PI], [1, 1, 1])] as const))),

        // Fans: a striped bumper base, a stand, the head with its cage, blades, a face, a lamp and ribbons.
        fanCage,
        fanBase: own(foamMap(fanBaseMap, night)),
        fanBaseShape: own(puck(FAN_R, FAN_BASE_H, 0.14, 40)),
        fanStandShape: own(new CylinderGeometry(0.12, 0.15, FAN_STAND_H, 12)),
        fanBackShape: own(
          merge([
            [new CylinderGeometry(0.95, 0.95, 0.1, 36), placed([0, 0, -0.24], [Math.PI / 2, 0, 0], [1, 1, 1])],
            [new SphereGeometry(0.38, 20, 12), placed([0, 0, -0.33], [0, 0, 0], [1, 1, 0.7])],
          ]),
        ),
        fanCageShape: own(merge(fanCageParts())),
        fanBladesShape: own(merge(fanBladeParts())),
        fanFaceShape: own(new SphereGeometry(0.34, 20, 14).scale(1, 1, 0.55)),
        fanEyesShape: own(merge([-0.12, 0.12].map((x) => [new SphereGeometry(0.06, 10, 8), placed([x, 0.08, 0.16], [0, 0, 0], [1, 1.2, 0.5])] as const))),
        fanSmileShape: own(new TorusGeometry(0.1, 0.024, 6, 16, Math.PI).rotateZ(Math.PI).translate(0, -0.06, 0.17)),
        fanOhShape: own(new TorusGeometry(0.06, 0.026, 8, 18).translate(0, -0.09, 0.17)),
        cheekShape: own(new SphereGeometry(0.07, 10, 8).scale(1, 0.8, 0.5)),
        lampBaseShape: own(new CylinderGeometry(0.12, 0.14, 0.12, 12)),
        lampBulbShape: own(new SphereGeometry(0.2, 18, 14)),
        ribbonShape: own(new PlaneGeometry(0.11, 0.85, 1, 4).translate(0, -0.425, 0)),
        ribbons: [a2, a3].map((c) => {
          const ribbon = own(foam(c, night))
          ribbon.side = DoubleSide
          return ribbon
        }),
        laneMap: own(chevrons(theme.edge, null, false, true)),

        // Frames: every bar and ball of every frame comes from one unit shape, tinted per copy.
        frame,
        unitBar: own(new CylinderGeometry(1, 1, 1, 10)),
        unitBall: own(new SphereGeometry(1, 14, 10)),

        // Marshmallow pads with a face on top.
        pad: own(foamMap(padMap, night)),
        padShape: own(puck(PAD_R, PAD_H, PAD_EDGE, 48)),
        padEyesShape: own(merge([-0.26, 0.26].map((x) => [new SphereGeometry(0.075, 12, 8), placed([x, 0, 0], [0, 0, 0], [1, 0.35, 1.25])] as const))),
        padSmileShape: own(new TorusGeometry(0.17, 0.035, 8, 18, Math.PI).applyMatrix4(placed([0, 0.005, 0.12], [-Math.PI / 2, 0, Math.PI], [1, 1, 1]))),

        // Ice slides: a glossy strip with crawling arrows, and sparkles.
        iceMap,
        ice: own(new MeshStandardMaterial({ map: iceMap, roughness: 0.12, metalness: 0.05, emissive: '#cfeeff', emissiveIntensity: night ? 0.35 : 0.12, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
        sparkle: own(new MeshBasicMaterial({ map: own(twinkle()), transparent: true, depthWrite: false, toneMapped: false })),
        sparkleShape: own(new PlaneGeometry(1, 1)),

        // Snow gates: snow, an ice trim and icicles, a blue band along the slot, snowballs on the candy poles.
        snow,
        iceTrim: own(new MeshStandardMaterial({ color: '#bfe6ff', roughness: 0.15, metalness: 0.05, emissive: '#bfe6ff', emissiveIntensity: night ? 0.4 : 0.1 })),
        slotTrim: own(new MeshStandardMaterial({ color: '#4aa8f0', roughness: 0.2, metalness: 0.05, emissive: '#4aa8f0', emissiveIntensity: night ? 0.45 : 0.15 })),
        snowballShape: own(new SphereGeometry(0.26, 16, 12)),
      }
    },
    [theme],
  )
}

/** The fan's cage: a front and a back rim, the bars between them, and the front grille of two rings and eight spokes. */
function fanCageParts() {
  const rim = FAN_CAGE_R - 0.07
  const parts: (readonly [BufferGeometry, Matrix4])[] = []
  for (const z of [-0.2, 0.2]) parts.push([new TorusGeometry(rim, 0.07, 10, 48), placed([0, 0, z], [0, 0, 0], [1, 1, 1])])
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    parts.push([new CylinderGeometry(0.03, 0.03, 0.4, 6), placed([Math.cos(a) * rim, Math.sin(a) * rim, 0], [Math.PI / 2, 0, 0], [1, 1, 1])])
  }
  for (const r of [0.34, 0.64]) parts.push([new TorusGeometry(r, 0.024, 6, 40), placed([0, 0, 0.2], [0, 0, 0], [1, 1, 1])])
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    const mid = (0.1 + rim) / 2
    parts.push([new CylinderGeometry(0.022, 0.022, rim - 0.1, 6), placed([Math.cos(a) * mid, Math.sin(a) * mid, 0.2], [0, 0, a - Math.PI / 2], [1, 1, 1])])
  }
  return parts
}

/** Four rounded blades round a hub, each twisted a little like a propeller's. */
function fanBladeParts() {
  const parts: (readonly [BufferGeometry, Matrix4])[] = [[new SphereGeometry(0.14, 12, 8), placed([0, 0, 0], [0, 0, 0], [1, 1, 0.8])]]
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const m = new Matrix4()
      .makeTranslation(Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0)
      .multiply(new Matrix4().makeRotationZ(a - Math.PI / 2))
      .multiply(new Matrix4().makeRotationY(0.45))
      .multiply(new Matrix4().makeScale(0.2, 0.4, 0.05))
    parts.push([new SphereGeometry(1, 16, 10), m])
  }
  return parts
}

/** How near the point (x, z) comes to either of a spinner's paddles, in the track's plane. */
function paddleDistance(s: Spinner, x: number, z: number) {
  let best = Infinity
  for (let k = 0; k < s.spec.arms; k++) {
    const a = s.angle + k * Math.PI
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const rx = x - s.spec.x
    const rz = z - s.spec.z
    const along = clamp(rx * dx + rz * dz, PADDLE_IN, s.spec.reach)
    best = Math.min(best, Math.hypot(rx - dx * along, rz - dz * along))
  }
  return best
}

/**
 * A spinner: a candy post on a little islet in the water, a hub on top, and one or two
 * arms turning level by the sim's angle, each with a soft striped foam paddle hanging
 * from it exactly where the sim's paddle box is (PADDLE_IN to reach along the arm,
 * PADDLE_BOTTOM to PADDLE_TOP, PADDLE_THICK thick), so the gap a flat slime slides
 * through is the gap a child sees. A friendly face on both sides of each paddle goes
 * sleepy once the spinner has slowed down for being missed, and squeezes shut when the
 * paddle bonks the slime; a soft shadow sweeps the track right under each paddle.
 */
function SpinnerToy({ sim, index, spec, kit }: { sim: Sim; index: number; spec: SpinnerSpec; kit: Kit }) {
  const root = useRef<Group>(null!)
  const rotor = useRef<Group>(null!)
  const paddles = useRef<Group[]>([])
  const eyes = useRef<Group[]>([])
  const seen = useRef({ hitAt: -1, mine: false })
  const len = spec.reach - PADDLE_IN
  const near = useDrawNear(sim, spec.z - spec.reach - 1, spec.z + spec.reach + 1)
  const parts = useOwned(
    (own) => {
      const w = len + 0.7
      const d = PADDLE_THICK + 1
      const ppu = 256 / w
      const blob = own(softBlob(256, Math.max(8, Math.round(d * ppu)), 0.35 * ppu, (x, y) => roundedRectDistance(x, y, (len / 2) * ppu, (PADDLE_THICK / 2 + 0.05) * ppu, 0.2 * ppu)))
      const shade = own(new MeshBasicMaterial({ color: SHADE, transparent: true, opacity: 0.32, alphaMap: blob, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }))
      clipToGround(shade, sim.course, spec.x - spec.reach - 1, spec.x + spec.reach + 1, spec.z - spec.reach - 1, spec.z + spec.reach + 1)
      return {
        shade,
        paddle: own(uvFromPosition(new RoundedBoxGeometry(len, PADDLE_H, PADDLE_THICK, 4, 0.16), -len / 2, PADDLE_STRIPE, 0, 1)),
        footprint: own(new PlaneGeometry(w, d)),
        arm: own(new CapsuleGeometry(0.12, spec.reach, 4, 10)),
      }
    },
    [spec, sim.course, len],
  )
  useFrame(() => {
    const show = near()
    root.current.visible = show
    if (!show) return
    const s = sim.spinners[index]!
    const slime = sim.slime
    const t = sim.time
    rotor.current.rotation.y = s.angle
    // A new bonk is this spinner's when one of its paddles is right by the slime.
    if (slime.hitAt !== seen.current.hitAt) {
      seen.current.hitAt = slime.hitAt
      seen.current.mine = slime.hitAt >= 0 && paddleDistance(s, slime.x, slime.z) < slime.r + PADDLE_THICK + 1
    }
    const mine = seen.current.mine
    const squish = mine ? jiggle(t, slime.hitAt, 0.12, 4, 0.8) : 0
    const lid = mine && t - slime.hitAt < 0.45 ? 0.12 : s.easy ? 0.45 : 1
    for (let k = 0; k < spec.arms; k++) {
      paddles.current[k]!.scale.set(1 - squish * 0.3, 1 + squish, 1 - squish)
      eyes.current[k]!.scale.y = lid
    }
  })
  return (
    <group ref={root} position={toThree(spec.x, 0, spec.z)}>
      <mesh position={[0, -0.6, 0]} scale={[1, 0.45, 1]} geometry={kit.isletShape} material={kit.islet} receiveShadow />
      <mesh position={[0, (POST_BOTTOM + HUB_Y) / 2, 0]} geometry={kit.postShape} material={kit.candyPole} />
      <mesh position={[0, HUB_Y, 0]} scale={[1, 0.62, 1]} geometry={kit.hubShape} material={kit.accent[1]} />
      <mesh position={[0, HUB_Y + 0.32, 0]} geometry={kit.knobShape} material={kit.accent[3]} />
      <group ref={rotor}>
        {[0, 1].slice(0, spec.arms).map((k) => (
          <group key={k} rotation={[0, k * Math.PI, 0]}>
            <mesh position={[spec.reach / 2, HUB_Y, 0]} rotation={[0, 0, Math.PI / 2]} geometry={parts.arm} material={kit.accent[1]} />
            {[PADDLE_IN + 0.35, spec.reach - 0.35].map((x) => (
              <mesh key={x} position={[x, ROD_Y, 0]} geometry={kit.rodShape} material={kit.metal} />
            ))}
            <group ref={refAt(paddles, k)} position={[PADDLE_IN + len / 2, PADDLE_MID, 0]}>
              <mesh geometry={parts.paddle} material={kit.paddle} />
              <group ref={refAt(eyes, k)} position={[0, PADDLE_EYE_Y, 0]}>
                <mesh geometry={kit.paddleEyes} material={kit.eye} />
                <mesh geometry={kit.paddlePupils} material={kit.dark} />
              </group>
              <mesh geometry={kit.paddleSmiles} material={kit.dark} />
            </group>
            <mesh position={[PADDLE_IN + len / 2, SHADE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={parts.footprint} material={parts.shade} />
          </group>
        ))}
      </group>
    </group>
  )
}

/**
 * A fan: a big round fan on a striped bumper base exactly FAN_R round (the cushion the
 * slime slides round), its head facing the slime. The blades turn with the sim's power.
 * Before it blows hard its lamp blinks yellow, its cheeks puff and it leans back; blowing
 * hard the lamp is red, it shouts "O", the ribbons stream toward the slime and the arrows
 * of its wind lane on the track brighten and race toward the slime, which shows exactly
 * where not to stand. Once it has been made gentle, it never blows its ribbons straight.
 */
function FanToy({ sim, index, spec, kit }: { sim: Sim; index: number; spec: FanSpec; kit: Kit }) {
  const root = useRef<Group>(null!)
  const base = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  const blades = useRef<Group>(null!)
  const eyes = useRef<Group>(null!)
  const smile = useRef<Mesh>(null!)
  const oh = useRef<Mesh>(null!)
  const cheeks = useRef<Mesh[]>([])
  const ribbons = useRef<Group[]>([])
  const memo = useRef({ time: sim.time, power: sim.fans[index]!.power, rising: false, spin: 0, bumpAt: -1, mine: false })
  const near = useDrawNear(sim, spec.z - spec.reach, spec.z + FAN_R)
  const parts = useOwned(
    (own) => {
      const laneMap = own(kit.laneMap.clone())
      laneMap.repeat.set(1, spec.reach / LANE_TILE)
      const lane = own(new MeshBasicMaterial({ map: laneMap, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }))
      clipToGround(lane, sim.course, spec.x - spec.width / 2, spec.x + spec.width / 2, spec.z - spec.reach, spec.z)
      return {
        laneMap,
        lane,
        laneShape: own(new PlaneGeometry(spec.width, spec.reach)),
        lamp: own(new MeshStandardMaterial({ color: LAMP_CALM, roughness: 0.3, emissive: LAMP_CALM, emissiveIntensity: 0.8 })),
      }
    },
    [spec, sim.course, kit],
  )
  useFrame((state) => {
    const show = near()
    root.current.visible = show
    if (!show) return
    const fan = sim.fans[index]!
    const slime = sim.slime
    const t = sim.time
    const m = memo.current
    const dt = clamp(t - m.time, 0, 0.1)
    m.time = t
    const p = fan.power
    // Whether it is speeding up, read from how the power moves; a paused run keeps what it was.
    if (p > m.power + 1e-5) m.rising = p < 0.97
    else if (p < m.power - 1e-5 || p >= 0.97 || p < 0.2) m.rising = false
    m.power = p
    const strength = fan.easy ? 0.45 : 1
    const blow = smoothstep(0.5, 0.95, p) * strength
    const warn = m.rising && p < 0.97 ? smoothstep(0.15, 0.55, p) : 0
    const now = state.clock.elapsedTime

    m.spin += dt * (1.5 + 26 * p)
    blades.current.rotation.z = -m.spin
    head.current.rotation.x = -0.16 * warn + 0.05 * blow + 0.025 * blow * Math.sin(t * 41)

    // A traffic light a child knows: green calm, yellow blinking before the gust, red while it blows.
    const lamp = parts.lamp
    if (m.rising) {
      lamp.emissive.copy(LAMP_WARN)
      lamp.emissiveIntensity = Math.sin(now * 19) > 0 ? 1.4 : 0.2
    } else {
      lamp.emissive.lerpColors(LAMP_CALM, fan.easy ? LAMP_WARN : LAMP_HARD, smoothstep(0.45, 0.9, p))
      lamp.emissiveIntensity = 0.8 + 0.5 * blow * (0.5 + 0.5 * Math.sin(now * 8))
    }
    lamp.color.copy(lamp.emissive)

    const puff = 1 + 0.9 * warn * (1 - blow)
    for (const c of cheeks.current) c.scale.setScalar(puff)
    const shouting = blow > 0.25 || warn > 0.3
    smile.current.visible = !shouting
    oh.current.visible = shouting
    oh.current.scale.setScalar(0.7 + 0.8 * Math.max(blow, warn * 0.6))
    eyes.current.scale.y = 1 - 0.55 * blow

    for (let k = 0; k < RIBBON_AT.length; k++) {
      const r = ribbons.current[k]!
      const side = Math.cos(RIBBON_AT[k]!) < 0 ? -1 : 1
      const flutter = (0.08 + 0.3 * blow) * Math.sin(t * (5 + 16 * blow) + k * 1.7)
      r.rotation.x = -(Math.PI / 2 - 0.12) * blow + flutter
      r.rotation.z = side * (0.3 * blow + 0.05 * Math.sin(t * 2 + k))
    }

    const teaching = sim.teach !== null && sim.teach.kind === 'fan'
    parts.lane.opacity = 0.16 + 0.55 * blow + (teaching ? 0.2 + 0.15 * Math.sin(now * 9) : 0)
    parts.laneMap.offset.y += dt * (0.25 + 3.2 * blow)

    // A bump off the cage squashes the base and wobbles the head.
    if (slime.bumpAt !== m.bumpAt) {
      m.bumpAt = slime.bumpAt
      m.mine = slime.bumpAt >= 0 && Math.hypot(slime.x - spec.x, slime.z - spec.z) < FAN_R + slime.r + 0.6
    }
    const knock = m.mine ? jiggle(t, slime.bumpAt, 0.14, 4.5, 0.6) : 0
    base.current.scale.set(1 + knock, 1 - knock, 1 + knock)
    head.current.rotation.z = knock * 0.6
  })
  return (
    <group ref={root} position={toThree(spec.x, 0, spec.z)}>
      <mesh position={[0, LANE_Y, spec.reach / 2]} rotation={[-Math.PI / 2, 0, 0]} geometry={parts.laneShape} material={parts.lane} />
      <group ref={base}>
        <mesh geometry={kit.fanBaseShape} material={kit.fanBase} castShadow receiveShadow />
      </group>
      <mesh position={[0, FAN_BASE_H + FAN_STAND_H / 2 - 0.05, 0]} geometry={kit.fanStandShape} material={kit.metal} castShadow />
      <group ref={head} position={[0, FAN_HEAD_Y, 0]}>
        <mesh geometry={kit.fanBackShape} material={kit.accent[1]} castShadow />
        <mesh geometry={kit.fanCageShape} material={kit.fanCage} castShadow />
        <group ref={blades} position={[0, 0, 0.02]}>
          <mesh geometry={kit.fanBladesShape} material={kit.white} />
        </group>
        <group position={[0, 0, FAN_FACE_Z]}>
          <mesh geometry={kit.fanFaceShape} material={kit.eye} />
          <group ref={eyes} position={[0, 0.08, 0]}>
            <mesh position={[0, -0.08, 0]} geometry={kit.fanEyesShape} material={kit.dark} />
          </group>
          <mesh ref={smile} geometry={kit.fanSmileShape} material={kit.dark} />
          <mesh ref={oh} geometry={kit.fanOhShape} material={kit.dark} />
          {[-1, 1].map((side, k) => (
            <mesh key={side} ref={refAt(cheeks, k)} position={[side * 0.21, -0.04, 0.12]} geometry={kit.cheekShape} material={kit.blush} />
          ))}
        </group>
        <mesh position={[0, FAN_LAMP_Y - 0.14, 0]} geometry={kit.lampBaseShape} material={kit.metal} />
        <mesh position={[0, FAN_LAMP_Y, 0]} geometry={kit.lampBulbShape} material={parts.lamp} />
        {RIBBON_AT.map((a, k) => (
          <group key={k} ref={refAt(ribbons, k)} position={[Math.cos(a) * (FAN_CAGE_R - 0.07), Math.sin(a) * (FAN_CAGE_R - 0.07), 0.2]}>
            <mesh geometry={kit.ribbonShape} material={kit.ribbons[k % 2]} />
          </group>
        ))}
      </group>
    </group>
  )
}

/**
 * Every climbing frame of the course as two instanced meshes, bars and balls, tinted per
 * copy in the island's colours: low monkey-bar frames whose outer balls touch exactly the
 * corners of the sim's box (x0 to x1, FRAME_DEPTH deep, FRAME_H tall).
 */
function Frames({ sim, kit }: { sim: Sim; kit: Kit }) {
  const bars = useRef<InstancedMesh>(null!)
  const balls = useRef<InstancedMesh>(null!)
  const layout = useMemo(() => frameLayout(sim.course.frames), [sim.course])
  useLayoutEffect(() => {
    layout.bars.forEach((b, i) => {
      bars.current.setMatrixAt(i, b.matrix)
      bars.current.setColorAt(i, kit.accentColours[b.colour]!)
    })
    layout.balls.forEach((b, i) => {
      balls.current.setMatrixAt(i, b.matrix)
      balls.current.setColorAt(i, kit.accentColours[b.colour]!)
    })
    for (const mesh of [bars.current, balls.current]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [layout, kit])
  return (
    <>
      <instancedMesh key={`bars${layout.bars.length}`} ref={bars} args={[kit.unitBar, kit.frame, layout.bars.length]} castShadow receiveShadow />
      <instancedMesh key={`balls${layout.balls.length}`} ref={balls} args={[kit.unitBall, kit.frame, layout.balls.length]} castShadow />
    </>
  )
}

/** Where every bar and ball of the frames goes and which accent colour it has: posts, top and middle rails, monkey-bar rungs, corner balls and little feet. */
function frameLayout(frames: readonly FrameSpec[]) {
  const bars: { matrix: Matrix4; colour: number }[] = []
  const balls: { matrix: Matrix4; colour: number }[] = []
  const yTop = FRAME_H - FRAME_JOINT
  const yMid = FRAME_H * 0.45
  const d = FRAME_DEPTH / 2 - FRAME_JOINT
  for (const f of frames) {
    const z = -f.z
    const left = f.x0 + FRAME_JOINT
    const right = f.x1 - FRAME_JOINT
    const n = Math.max(2, Math.round((right - left) / FRAME_STEP) + 1)
    const xs = Array.from({ length: n }, (_, i) => lerp(left, right, i / (n - 1)))
    const across = right - left
    for (const side of [-d, d]) {
      bars.push({ matrix: placed([(left + right) / 2, yTop, z + side], [0, 0, Math.PI / 2], [FRAME_BAR, across, FRAME_BAR]), colour: 0 })
      bars.push({ matrix: placed([(left + right) / 2, yMid, z + side], [0, 0, Math.PI / 2], [FRAME_BAR * 0.85, across, FRAME_BAR * 0.85]), colour: 1 })
      for (const x of xs) {
        bars.push({ matrix: placed([x, yTop / 2, z + side], [0, 0, 0], [FRAME_BAR, yTop, FRAME_BAR]), colour: 2 })
        balls.push({ matrix: placed([x, yTop, z + side], [0, 0, 0], [FRAME_JOINT, FRAME_JOINT, FRAME_JOINT]), colour: 3 })
        balls.push({ matrix: placed([x, 0.02, z + side], [0, 0, 0], [FRAME_BAR * 1.6, FRAME_BAR * 0.9, FRAME_BAR * 1.6]), colour: 2 })
      }
    }
    for (const x of xs) bars.push({ matrix: placed([x, yTop, z], [Math.PI / 2, 0, 0], [FRAME_BAR * 0.9, 2 * d, FRAME_BAR * 0.9]), colour: 1 })
  }
  return { bars, balls }
}

/** A marshmallow cushion with a happy face on top, PAD_R round and PAD_H tall, that squashes and springs back when it throws the slime, its eyes squeezed shut with joy. */
function PadToy({ sim, index, spec, kit }: { sim: Sim; index: number; spec: PadSpec; kit: Kit }) {
  const root = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const eyes = useRef<Mesh>(null!)
  const near = useDrawNear(sim, spec.z - PAD_R, spec.z + PAD_R)
  useFrame(() => {
    const show = near()
    root.current.visible = show
    if (!show) return
    const pad = sim.pads[index]!
    const t = sim.time
    const squash = jiggle(t, pad.boingAt, 0.5, 2.4, 0.9)
    body.current.scale.set(1 + 0.35 * squash, 1 - squash, 1 + 0.35 * squash)
    eyes.current.scale.z = pad.boingAt >= 0 && t - pad.boingAt < 0.5 ? 0.25 : 1
  })
  return (
    <group ref={root} position={toThree(spec.x, 0, spec.z)}>
      <group ref={body}>
        <mesh geometry={kit.padShape} material={kit.pad} castShadow receiveShadow />
        <group position={[0, PAD_H, 0]}>
          <mesh ref={eyes} position={[0, 0, -0.14]} geometry={kit.padEyesShape} material={kit.dark} />
          <mesh geometry={kit.padSmileShape} material={kit.dark} />
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.46, 0.005, 0]} scale={[1.3, 0.25, 1]} geometry={kit.cheekShape} material={kit.blush} />
          ))}
        </group>
      </group>
    </group>
  )
}

/** The ice slides: glossy strips lying on the track with white arrows crawling forward, frosty dashes along their edges, and sparkles twinkling on them. */
function Slides({ sim, kit }: { sim: Sim; kit: Kit }) {
  const sparkles = useRef<InstancedMesh>(null!)
  const memo = useRef({ time: sim.time })
  const parts = useOwned(
    (own) => {
      const course = sim.course
      const rand = mulberry32(Math.round(course.finishZ * 131) >>> 0)
      const strips = course.slides.map((sl) => {
        const w = sl.x1 - sl.x0
        const l = sl.z1 - sl.z0
        const cx = (sl.x0 + sl.x1) / 2
        const cz = (sl.z0 + sl.z1) / 2
        // Across the strip u runs 0 to 1 (one arrow across); along it v counts tiles of the world, so every strip's arrows line up and crawl together.
        const shape = own(new PlaneGeometry(w, l).rotateX(-Math.PI / 2))
        const position = shape.getAttribute('position')
        const uv = shape.getAttribute('uv')
        for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + w / 2) / w, (cz - position.getZ(i)) / ICE_TILE)
        uv.needsUpdate = true
        const material = own(kit.ice.clone())
        clipToGround(material, course, sl.x0, sl.x1, sl.z0, sl.z1)
        return { shape, material, position: toThree(cx, ICE_Y, cz) }
      })
      const glints: { x: number; z: number; phase: number }[] = []
      for (const sl of course.slides) {
        const count = Math.min(40, Math.ceil(((sl.x1 - sl.x0) * (sl.z1 - sl.z0)) / 2.2))
        for (let i = 0; i < count; i++) {
          const x = lerp(sl.x0 + 0.2, sl.x1 - 0.2, rand())
          const z = lerp(sl.z0 + 0.2, sl.z1 - 0.2, rand())
          if (onTrack(course, x, z)) glints.push({ x, z, phase: rand() * Math.PI * 2 })
        }
      }
      return { strips, glints }
    },
    [sim.course, kit],
  )
  useFrame((state) => {
    const t = sim.time
    const dt = clamp(t - memo.current.time, 0, 0.1)
    memo.current.time = t
    kit.iceMap.offset.y -= dt * ICE_CRAWL
    const mesh = sparkles.current
    let n = 0
    for (const g of parts.glints) {
      if (!nearSlime(sim, g.z, g.z)) continue
      const tw = Math.max(0, Math.sin(t * 2.4 + g.phase))
      const size = 0.36 * tw * tw * tw * tw
      if (size < 0.02) continue
      dummy.position.set(g.x, 0.06 + size * 0.4, -g.z)
      dummy.quaternion.copy(state.camera.quaternion)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      mesh.setMatrixAt(n++, dummy.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      {parts.strips.map((s, i) => (
        <mesh key={i} position={s.position} geometry={s.shape} material={s.material} receiveShadow />
      ))}
      <instancedMesh key={parts.glints.length} ref={sparkles} args={[kit.sparkleShape, kit.sparkle, Math.max(1, parts.glints.length)]} frustumCulled={false} />
    </>
  )
}

/**
 * A snow gate: a soft snow wall across x0 to x1 whose underside is exactly GATE_GAP over
 * the track and whose top is GATE_H, with a cornice as deep as the gate, icicles, an
 * ice-blue trim marking the low slot under it, and a snowman's coal face. It hangs
 * between two candy poles (in the water beside the track, or just inside the gate where
 * the track goes on past its end) and slides up them, out of the way, at liftAt. A bump
 * jiggles it.
 */
function GateToy({ sim, index, spec, kit }: { sim: Sim; index: number; spec: GateSpec; kit: Kit }) {
  const root = useRef<Group>(null!)
  const lift = useRef<Group>(null!)
  const wall = useRef<Group>(null!)
  const seen = useRef({ bumpAt: -1, mine: false })
  const near = useDrawNear(sim, spec.z - 2, spec.z + 2)
  const w = spec.x1 - spec.x0
  const cx = (spec.x0 + spec.x1) / 2
  const parts = useOwned(
    (own) => {
      const wallH = GATE_H - GATE_CORNICE_H + 0.12 - GATE_GAP
      const rand = mulberry32(Math.round(spec.z * 31 + spec.x0 * 7) >>> 0)
      // Icicles hang all along the cornice's front, except over the face.
      const count = Math.max(3, Math.floor(w / 0.4))
      const icicles = Array.from({ length: count }, (_, i) => lerp(-w / 2 + 0.22, w / 2 - 0.22, i / (count - 1)))
        .filter((x) => Math.abs(x) > GATE_FACE_HALF)
        .map((x) => {
          const length = 0.18 + rand() * 0.3
          return [new ConeGeometry(0.055, length, 8), placed([x, GATE_CORNICE_H * -0.5 - length / 2 + 0.02, GATE_DEPTH / 2 - 0.06], [Math.PI, 0, 0], [1, 1, 1])] as const
        })
      const front = GATE_WALL_DEPTH / 2 + 0.01
      const coal = [
        ...[-0.48, 0.48].map((x) => [new SphereGeometry(0.14, 14, 10), placed([x, 0.3, front], [0, 0, 0], [1, 1.15, 0.5])] as const),
        ...Array.from({ length: 7 }, (_, i) => {
          const a = Math.PI * (1.2 + (0.6 * i) / 6)
          return [new SphereGeometry(0.075, 10, 8), placed([Math.cos(a) * 0.5, Math.sin(a) * 0.5 + 0.12, front], [0, 0, 0], [1, 1, 0.5])] as const
        }),
      ]
      // A leg stands just outside the gate's end when that is water, or just inside when the track goes on there.
      const legs = ([-1, 1] as const).map((side) => {
        const end = side < 0 ? spec.x0 : spec.x1
        const outside = end + side * (GATE_LEG_R + 0.02)
        const x = onTrack(sim.course, outside, spec.z) ? end - side * (GATE_LEG_R + 0.02) : outside
        const bottom = onTrack(sim.course, x, spec.z) ? 0 : -2
        return { x: x - cx, bottom, shape: own(vFromHeight(new CylinderGeometry(GATE_LEG_R, GATE_LEG_R, GATE_POLE_TOP - bottom, 14), 1)) }
      })
      return {
        legs,
        wallH,
        wallShape: own(new RoundedBoxGeometry(w - 0.06, wallH, GATE_WALL_DEPTH, 4, 0.24)),
        corniceShape: own(new RoundedBoxGeometry(w, GATE_CORNICE_H, GATE_DEPTH, 4, 0.2)),
        trimShape: own(new RoundedBoxGeometry(w - 0.1, GATE_TRIM_H, GATE_WALL_DEPTH + 0.06, 2, 0.07)),
        // A gate too narrow for anything but its face has no icicles.
        iciclesShape: icicles.length > 0 ? own(merge(icicles)) : null,
        coalShape: own(merge(coal)),
      }
    },
    [spec, sim.course, w, cx],
  )
  useFrame(() => {
    const show = near()
    root.current.visible = show
    if (!show) return
    const gate = sim.gates[index]!
    const slime = sim.slime
    const t = sim.time
    lift.current.position.y = gate.liftAt >= 0 ? GATE_LIFT * easeOutBack((t - gate.liftAt) / GATE_LIFT_FOR) : 0
    if (slime.bumpAt !== seen.current.bumpAt) {
      seen.current.bumpAt = slime.bumpAt
      seen.current.mine = slime.bumpAt >= 0 && Math.abs(slime.z - spec.z) < GATE_DEPTH / 2 + slime.r + 1.2 && slime.x > spec.x0 - slime.r - 0.5 && slime.x < spec.x1 + slime.r + 0.5
    }
    const j = seen.current.mine ? jiggle(t, slime.bumpAt, 0.07, 5, 0.6) : 0
    wall.current.scale.set(1 + j * 0.5, 1 - j, 1 + j)
  })
  const wallMid = parts.wallH / 2
  return (
    <group ref={root} position={toThree(cx, 0, spec.z)}>
      {parts.legs.map((leg) => (
        <group key={leg.x} position={[leg.x, 0, 0]}>
          <mesh position={[0, (leg.bottom + GATE_POLE_TOP) / 2, 0]} geometry={leg.shape} material={kit.candyPole} castShadow />
          <mesh position={[0, GATE_POLE_TOP + 0.12, 0]} geometry={kit.snowballShape} material={kit.snow} castShadow />
        </group>
      ))}
      <group ref={lift}>
        <group ref={wall} position={[0, GATE_GAP, 0]}>
          <mesh position={[0, wallMid, 0]} geometry={parts.wallShape} material={kit.snow} castShadow receiveShadow />
          <mesh position={[0, GATE_TRIM_H / 2, 0]} geometry={parts.trimShape} material={kit.slotTrim} />
          <group position={[0, GATE_H - GATE_GAP - GATE_CORNICE_H / 2, 0]}>
            <mesh geometry={parts.corniceShape} material={kit.snow} castShadow />
            {parts.iciclesShape !== null && <mesh geometry={parts.iciclesShape} material={kit.iceTrim} />}
          </group>
          <group position={[0, wallMid - 0.05, 0]}>
            <mesh geometry={parts.coalShape} material={kit.dark} />
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.86, 0.02, GATE_WALL_DEPTH / 2]} scale={[2, 1.5, 1]} geometry={kit.cheekShape} material={kit.blush} />
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}
