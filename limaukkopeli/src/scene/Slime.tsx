import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
} from 'three'

import { BABY_COLOURS, ITEMS, SLIME_COLOURS, type Outfit, type Pattern, type SlimeLook } from '../game/closet'
import { clamp, clamp01, ease, easeAngle, lerp, mod, mulberry32, smoothstep } from '../game/math'
import { HIDDEN_TOP, MAX_SIZE, R0, type Sim } from '../game/model'
import { Clothes, hatTop } from './Clothes'
import { palette } from './look'
import { ARM, EYE, MOUTH, handAt, newPose, onBody, restPose, type Pose } from './slimeShape'
import { ROUND, STILL, TAU, merged, placed, tint, type V3 } from './toy'

/**
 * The slime: one body of glossy see-through jelly for every slime in the game, built for a
 * radius of 1 (bottom at y = 0, centre at y = 1, facing +Z) and scaled by its owner.
 * Nothing here is React state: each owner turns the run or its clock into a Pose in one
 * frame callback, and `applyPose` moves the body's parts through refs. The player's slime
 * squashes, stretches and jiggles, waves its arms, rolls its eyes, goes flat as a puddle,
 * turns round to look at the child when something funny happens, and carries the babies
 * it found on its head; the idle slime (the map, the wardrobe) bounces and wiggles; the
 * babies are little slimes with big eyes.
 */

/** Every slime poses itself after the game has advanced the run (the stage's driver at -1) and before anything else, so its clothes (at the default 0) read this frame's pose. */
const BODY_PRIORITY = -0.5
/** A baby is about a third of the starting slime, with bigger eyes for its size. */
const BABY_R = R0 / 3
const BABY_EYES = 1.25
/** The little fish rides on the head this long (the sim's fishUntil is the landing plus this), then jumps off over FISH_OFF. */
const FISH_RIDE = 3
const FISH_OFF = 0.5
/** A found baby hops from where it waited onto the head over this long. */
const HOP_ON = 0.45

// ------------------------------------------------------------------ timing shapes

/** A damped jelly wobble after a kick at `at`: 1 at the kick, swinging through 0 `hz` times a second, gone after `dur`. A kick at -1 never happened. */
function wobble(t: number, at: number, hz: number, dur: number) {
  const since = t - at
  if (at < 0 || since < 0 || since > dur) return 0
  const fade = 1 - since / dur
  return Math.cos(TAU * hz * since) * fade * fade
}

/** 1 at `at`, easing away to 0 over `dur`. */
function kick(t: number, at: number, dur: number) {
  const since = t - at
  if (at < 0 || since < 0 || since > dur) return 0
  const fade = 1 - since / dur
  return fade * fade
}

/** Something that lasts `dur` from `at`: up to 1 within a fifth of a second, back to 0 by the end. */
function bump(t: number, at: number, dur: number) {
  const since = t - at
  if (at < 0 || since < 0 || since > dur) return 0
  return smoothstep(0, 0.2, since) * (1 - smoothstep(dur - 0.25, dur, since))
}

/** 0 until `since` reaches 0, then popping on past 1 and settling there by 0.4 s. */
function popIn(since: number) {
  if (since <= 0) return 0
  if (since >= 0.4) return 1
  const e = since / 0.4 - 1
  return 1 + 2.7 * e * e * e + 1.7 * e * e
}

/** How shut the eyes are in a quick blink every few seconds; `seed` keeps slimes from blinking together. */
function blinkAt(t: number, seed: number) {
  const period = 2.8 + 1.7 * seed
  const p = mod(t + 5.3 * seed, period)
  return p < 0.16 ? Math.sin((Math.PI * p) / 0.16) : 0
}

// ------------------------------------------------------------------ the jelly

/** A jelly's three colours: itself, the deeper shade at its rim, the light it glows with inside. */
interface JellyColours {
  body: string
  deep: string
  light: string
}

/** The babies' jellies: their colour, with a deeper and a lighter shade made from it. */
const BABIES: readonly JellyColours[] = BABY_COLOURS.map((body) => ({ body, deep: tint(body, -0.16), light: tint(body, 0.2) }))

const RAINBOW = ['#ff6b6b', '#ffa94d', '#ffe066', '#7fe07a', '#5ec8ff', '#b38bff']

/**
 * A pattern painted round the ball: the canvas is the sphere unrolled, left to right once
 * round and top to bottom pole to pole, so whatever should look the same size everywhere
 * is drawn wider toward the poles. Stripes and rainbow bands go by height, so they are
 * evenly spaced seen from the side.
 */
function patternTexture(c: JellyColours, pattern: 'dots' | 'stripes' | 'glitter' | 'rainbow') {
  const W = 512
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (g === null) throw new Error('the slime pattern needs a 2D canvas')
  g.fillStyle = c.body
  g.fillRect(0, 0, W, H)
  const rowHeight = (y: number) => Math.cos(((y + 0.5) / H) * Math.PI)
  switch (pattern) {
    case 'dots': {
      const rows = 6
      const dot = 0.17
      g.fillStyle = '#ffffff'
      for (let row = 0; row < rows; row++) {
        const polar = ((row + 0.5) / rows) * Math.PI
        const across = Math.max(2, Math.round(8 * Math.sin(polar)))
        const ry = (dot / Math.PI) * H
        const rx = (dot / Math.max(0.3, Math.sin(polar)) / TAU) * W
        for (let i = 0; i < across; i++) {
          const x = ((i + (row % 2) * 0.5) / across) * W
          for (let wrap = -1; wrap <= 1; wrap++) {
            g.beginPath()
            g.ellipse(x + wrap * W, (polar / Math.PI) * H, rx, ry, 0, 0, TAU)
            g.fill()
          }
        }
      }
      break
    }
    case 'stripes': {
      const band = 0.26
      g.fillStyle = 'rgba(255, 255, 255, 0.82)'
      for (let y = 0; y < H; y++) if (Math.floor((rowHeight(y) + 1) / band) % 2 === 1) g.fillRect(0, y, W, 1)
      break
    }
    case 'glitter': {
      const rand = mulberry32(7)
      const specks = ['#ffffff', c.light, palette.gold, '#ffd1ea', '#c8ecff']
      for (let i = 0; i < 1500; i++) {
        g.globalAlpha = 0.55 + 0.45 * rand()
        g.fillStyle = specks[Math.floor(rand() * specks.length)]!
        const size = 1 + 2 * rand()
        g.fillRect(rand() * W, rand() * H, size, size)
      }
      g.globalAlpha = 1
      break
    }
    case 'rainbow': {
      const colours = RAINBOW.map((hex) => new Color(hex))
      const body = new Color(c.body)
      const mix = new Color()
      for (let y = 0; y < H; y++) {
        const f = ((1 - rowHeight(y)) / 2) * colours.length - 0.5
        const i = clamp(Math.floor(f), 0, colours.length - 1)
        const next = clamp(i + 1, 0, colours.length - 1)
        mix.lerpColors(colours[i]!, colours[next]!, smoothstep(0.6, 1, f - Math.floor(f))).lerp(body, 0.15)
        g.fillStyle = `#${mix.getHexString()}`
        g.fillRect(0, y, W, 1)
      }
      break
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** The clock the glitter twinkles by, shared by every jelly; the slime on screen sets it each frame. */
const sparkle = { value: 0 }
const jellies = new Map<string, MeshPhysicalMaterial>()

/**
 * The glossy see-through jelly of a colour and a pattern, made once and shared: clearcoat
 * over a soft body, deeper and thicker toward the rim (where you look through more of it),
 * a glow of its light colour in the middle as if lit from inside, and for glitter and gold
 * little sparks that twinkle on and off over the surface.
 */
function jelly(colours: JellyColours, pattern: Pattern | null) {
  const key = `${colours.body}:${pattern ?? 'plain'}`
  const known = jellies.get(key)
  if (known !== undefined) return known
  const gold = pattern === 'gold'
  const map = pattern === null || gold ? null : patternTexture(colours, pattern)
  const m = new MeshPhysicalMaterial({
    color: gold ? '#ffd84a' : map !== null ? '#ffffff' : colours.body,
    map,
    roughness: gold ? 0.22 : 0.3,
    metalness: gold ? 0.12 : 0,
    emissive: gold ? '#ffb000' : '#000000',
    emissiveIntensity: gold ? 0.12 : 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: gold ? 0.95 : 0.86,
  })
  const deep = new Color(gold ? palette.goldDeep : colours.deep)
  const light = new Color(gold ? '#fff2b0' : colours.light)
  const glitter = pattern === 'glitter' ? 1 : gold ? 0.9 : 0
  m.onBeforeCompile = (shader) => {
    shader.uniforms.jellyDeep = { value: deep }
    shader.uniforms.jellyLight = { value: light }
    shader.uniforms.jellyGlitter = { value: glitter }
    shader.uniforms.jellyTime = sparkle
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJelly;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJelly = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJelly;\nuniform vec3 jellyDeep;\nuniform vec3 jellyLight;\nuniform float jellyGlitter;\nuniform float jellyTime;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float jellyRim = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
        float jellyEdge = jellyRim * jellyRim;
        diffuseColor.rgb = mix( diffuseColor.rgb, jellyDeep, jellyEdge * 0.6 );
        diffuseColor.a = mix( diffuseColor.a, 1.0, jellyEdge );
        totalEmissiveRadiance += jellyLight * ( 1.0 - jellyRim ) * 0.22;
        vec3 jellyCell = floor( vJelly * 15.0 );
        float jellyHash = fract( sin( dot( jellyCell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
        float jellySpark = smoothstep( 0.3, 0.06, length( fract( vJelly * 15.0 ) - 0.5 ) ) * step( 0.5, jellyHash );
        float jellyTwinkle = pow( max( 0.0, sin( jellyTime * 2.6 + jellyHash * 60.0 ) ), 10.0 );
        totalEmissiveRadiance += vec3( 1.6 ) * jellyGlitter * jellySpark * jellyTwinkle;`,
      )
  }
  jellies.set(key, m)
  return m
}

// ------------------------------------------------------------------ shared parts

/** The jelly ball, its bottom on y = 0. */
const BALL = new SphereGeometry(1, 48, 32).translate(0, 1, 0)
/** An arm hanging from its shoulder at the origin: a little capsule with a round hand on the end. */
const ARM_SHAPE = merged([new CapsuleGeometry(0.12, 0.2, 6, 12).translate(0, -0.17, 0), new SphereGeometry(0.16, 16, 12).translate(0, -ARM.len, 0)])
/** The closed smile: a flat U with round ends, facing out only, so it never shows through the back of the jelly. */
const SMILE = (() => {
  const r = 0.17
  const w = 0.034
  const s = new Shape()
  s.absarc(0, 0, r + w, Math.PI, TAU, false)
  s.absarc(r, 0, w, 0, Math.PI, false)
  s.absarc(0, 0, r - w, TAU, Math.PI, true)
  s.absarc(-r, 0, w, 0, Math.PI, false)
  return new ShapeGeometry(s, 24)
})()
/** The open grin: a half disc hanging from a straight top, one unit wide either side, and the tongue at its bottom. */
const GRIN = (() => {
  const s = new Shape()
  s.moveTo(1, 0)
  s.absarc(0, 0, 1, 0, Math.PI, true)
  return new ShapeGeometry(s, 16)
})()
const TONGUE = (() => {
  const s = new Shape()
  s.absellipse(0, -0.7, 0.5, 0.26, 0, TAU, false, 0)
  return new ShapeGeometry(s, 16)
})()
const DISC = new CircleGeometry(1, 28)

const EYE_WHITE = new MeshStandardMaterial({ color: palette.eye, roughness: 0.16, emissive: palette.eye, emissiveIntensity: 0.14 })
const PUPIL = new MeshStandardMaterial({ color: palette.pupil, roughness: 0.25 })
const GLINT = new MeshBasicMaterial({ color: '#ffffff' })
const INK = new MeshStandardMaterial({ color: palette.ink, roughness: 0.5 })
const MOUTH_IN = new MeshStandardMaterial({ color: '#7a2048', roughness: 0.6 })
const TONGUE_PINK = new MeshStandardMaterial({ color: '#ff7aa0', roughness: 0.6 })
const BLUSH = new MeshStandardMaterial({ color: palette.blush, roughness: 0.7 })
const SHINE = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })
const PUFF = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false })
const FISH = new MeshStandardMaterial({ color: palette.fish, roughness: 0.4 })
const FIN = new MeshStandardMaterial({ color: '#ff7a2a', roughness: 0.5 })

/** The soft white shine on the jelly, in one piece: a big blob and a small one at the upper left as the run camera sees its back, and the same as the front is seen. */
const SHINE_SPOTS = merged(
  [
    { at: onBody(0.42, 0.74, -0.53, 0.012, 0.7), size: [0.21, 0.12, 0.03] as V3 },
    { at: onBody(0.66, 0.5, -0.56, 0.012, 0.7), size: [0.07, 0.045, 0.02] as V3 },
    { at: onBody(-0.84, 0.5, 0.2, 0.012, -0.9), size: [0.17, 0.1, 0.03] as V3 },
    { at: onBody(-0.9, 0.22, 0.38, 0.012, -0.9), size: [0.06, 0.04, 0.02] as V3 },
  ].map(({ at, size }) => placed(ROUND, at.position, at.rotation, size)),
)
/** The two blushes, flat ovals in one piece, facing out only. */
const BLUSHES = merged(
  [1, -1].map((side) => {
    const at = onBody(side * 0.66, 0.18, 0.73, 0.012, 0)
    return placed(DISC, at.position, at.rotation, [0.17, 0.1, 1])
  }),
)
/** An eye's two glints, in one piece, in the pupil's frame. */
const GLINTS = merged([placed(ROUND, [0.17, 0.19, 0.18], STILL, 0.15), placed(ROUND, [-0.15, -0.16, 0.2], STILL, 0.07)])

// ------------------------------------------------------------------ the body

/** The parts of one drawn slime that its pose moves. */
interface Rig {
  tilt: Group
  squash: Group
  wear: Group
  face: Group
  smile: Mesh
  grin: Group
  oh: Mesh
  eyes: Group
  eye: Group[]
  pupil: Group[]
  iris: Group[]
  arms: Group[]
  fish: Group
  tail: Group
  puff: Group
  puffs: Mesh[]
  bubble: Mesh
  /** How big its eyes are for its body (babies have bigger ones), and how far its hat reaches above its head. */
  eyeScale: number
  hatTop: number
}

const newRig = (): Rig => ({
  tilt: null!,
  squash: null!,
  wear: null!,
  face: null!,
  smile: null!,
  grin: null!,
  oh: null!,
  eyes: null!,
  eye: [],
  pupil: [],
  iris: [],
  arms: [],
  fish: null!,
  tail: null!,
  puff: null!,
  puffs: [],
  bubble: null!,
  eyeScale: 1,
  hatTop: 0,
})

/**
 * One slime, drawn for a radius of 1: the jelly ball with its shine, the face (blushes and
 * a mouth that smiles, grins or goes O), whatever it wears, two big bulging eyes high on
 * the front that stick out past its sides so they read from behind too, two small arms,
 * and the little extras that come and go (the fish on its head, a sneeze's puff, a burp's
 * bubble). It only fills `rig`; its owner moves it.
 */
function Body({ rig, pose, colours, pattern, outfit, eyes }: { rig: Rig; pose: Pose; colours: JellyColours; pattern: Pattern | null; outfit: Outfit | null; eyes: number }) {
  const goo = jelly(colours, pattern)
  rig.eyeScale = eyes
  rig.hatTop = outfit === null ? 0 : hatTop(outfit)
  return (
    <group
      ref={(g) => {
        if (g) rig.tilt = g
      }}
    >
      <group
        ref={(g) => {
          if (g) rig.squash = g
        }}
      >
        <mesh geometry={BALL} material={goo} castShadow />
        <mesh geometry={SHINE_SPOTS} material={SHINE} />
        <group
          ref={(g) => {
            if (g) rig.face = g
          }}
        >
          <mesh geometry={BLUSHES} material={BLUSH} />
          <group position={[0, MOUTH.y, MOUTH.z + 0.025]} rotation={[-Math.asin(MOUTH.y - 1), 0, 0]}>
            <mesh
              ref={(m) => {
                if (m) rig.smile = m
              }}
              geometry={SMILE}
              material={INK}
              position={[0, 0.08, 0]}
            />
            <group
              ref={(g) => {
                if (g) rig.grin = g
              }}
              position={[0, 0.08, 0.004]}
            >
              <mesh geometry={GRIN} material={MOUTH_IN} />
              <mesh geometry={TONGUE} material={TONGUE_PINK} position={[0, 0, 0.003]} />
            </group>
            <mesh
              ref={(m) => {
                if (m) rig.oh = m
              }}
              geometry={DISC}
              material={MOUTH_IN}
              position={[0, -0.01, 0.004]}
            />
          </group>
        </group>
        <group
          ref={(g) => {
            if (g) rig.wear = g
          }}
        >
          {outfit !== null && <Clothes outfit={outfit} pose={pose} />}
        </group>
      </group>
      <group
        ref={(g) => {
          if (g) rig.eyes = g
        }}
      >
        {[1, -1].map((side, i) => (
          <group key={side} position={[side * EYE.x, 0, 0]}>
            <group
              ref={(g) => {
                if (g) rig.eye[i] = g
              }}
            >
              <mesh geometry={ROUND} material={EYE_WHITE} />
              <group
                ref={(g) => {
                  if (g) rig.pupil[i] = g
                }}
              >
                <group
                  ref={(g) => {
                    if (g) rig.iris[i] = g
                  }}
                  position={[0, 0, 0.84]}
                >
                  <mesh geometry={ROUND} material={PUPIL} scale={[0.5, 0.5, 0.22]} />
                  <mesh geometry={GLINTS} material={GLINT} />
                </group>
              </group>
            </group>
          </group>
        ))}
      </group>
      {[1, -1].map((side, i) => (
        <group
          key={side}
          ref={(g) => {
            if (g) rig.arms[i] = g
          }}
        >
          <mesh geometry={ARM_SHAPE} material={goo} castShadow />
        </group>
      ))}
      <group
        ref={(g) => {
          if (g) rig.fish = g
        }}
        visible={false}
      >
        <mesh geometry={ROUND} material={FISH} position={[0, 0.2, 0]} scale={[0.3, 0.2, 0.15]} castShadow />
        <mesh geometry={ROUND} material={FIN} position={[0.02, 0.38, 0]} rotation={[0, 0, -0.3]} scale={[0.11, 0.07, 0.025]} />
        <group
          ref={(g) => {
            if (g) rig.tail = g
          }}
          position={[-0.27, 0.2, 0]}
        >
          <mesh geometry={ROUND} material={FIN} position={[-0.1, 0.06, 0]} rotation={[0, 0, 0.55]} scale={[0.13, 0.065, 0.03]} />
          <mesh geometry={ROUND} material={FIN} position={[-0.1, -0.06, 0]} rotation={[0, 0, -0.55]} scale={[0.13, 0.065, 0.03]} />
        </group>
        {[1, -1].map((side) => (
          <group key={side} position={[0.15, 0.25, side * 0.11]}>
            <mesh geometry={ROUND} material={EYE_WHITE} scale={0.065} />
            <mesh geometry={ROUND} material={PUPIL} position={[0.02, 0, side * 0.04]} scale={0.035} />
          </group>
        ))}
        <mesh geometry={ROUND} material={MOUTH_IN} position={[0.295, 0.15, 0]} scale={[0.02, 0.025, 0.04]} />
      </group>
      <group
        ref={(g) => {
          if (g) rig.puff = g
        }}
        visible={false}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) rig.puffs[i] = m
            }}
            geometry={ROUND}
            material={PUFF}
          />
        ))}
      </group>
      <mesh
        ref={(m) => {
          if (m) rig.bubble = m
        }}
        geometry={ROUND}
        material={goo}
        visible={false}
      />
    </group>
  )
}

const hand = { x: 0, y: 0, z: 0 }

/**
 * Moves a body to its pose. The jelly stretches and squashes about its bottom keeping its
 * size; flat it spreads into a puddle with the arms sucked in and only the eyes (shrunk
 * to `peek`) looking over its front edge. The eyes ride the jelly's top front, blink,
 * widen when scared and send their pupils where it looks (or round in circles when
 * dizzy). Writes the jelly's scale, the eyes' frame and the right hand back into the pose
 * for the clothes.
 */
function applyPose(rig: Rig, p: Pose) {
  const h = p.hidden
  const k = p.stretch
  const up = k * lerp(1, p.flat / 2, h)
  const out = lerp(1, p.spread, h) / Math.sqrt(k)
  rig.squash.scale.set(out, up, out)
  rig.tilt.rotation.set(p.tip, 0, p.roll)
  // Flat, the clothes are pulled into the puddle with the arms (a little narrower than it, a little lower than its top), and show through the jelly.
  const pull = lerp(1, 0.8 / p.spread, h)
  const press = lerp(1, 0.85, h)
  rig.wear.scale.set(pull, press, pull)
  p.sx = out * pull
  p.sy = up * press
  p.sz = out * pull
  rig.face.visible = h < 0.5

  const eyeS = lerp(1, p.peek, h) * (1 + 0.25 * p.scared) * rig.eyeScale
  p.eyeY = lerp(EYE.y * up, 0.85 * k * p.flat, h)
  p.eyeZ = lerp(EYE.z * out, 0.62 * p.spread, h)
  p.eyeS = eyeS
  rig.eyes.position.set(0, p.eyeY, p.eyeZ)
  rig.eyes.scale.setScalar(eyeS)
  const shut = 1 - 0.92 * p.blink
  const pupil = 1 - 0.42 * p.scared
  for (let i = 0; i < 2; i++) {
    rig.eye[i]!.scale.set(EYE.r, EYE.r * shut, EYE.r)
    const round = p.t * 10 * (i === 0 ? 1 : -1)
    const lx = lerp(p.lookX, 0.8 * Math.cos(round), p.dizzy)
    const ly = lerp(p.lookY, 0.8 * Math.sin(round), p.dizzy)
    rig.pupil[i]!.rotation.set(-0.55 * ly - 0.14, 0.6 * lx, 0)
    rig.iris[i]!.scale.setScalar(pupil)
  }

  const o = p.round
  const g = p.open * (1 - o)
  rig.smile.visible = g < 0.2 && o < 0.3
  rig.grin.visible = g >= 0.2
  rig.grin.scale.set(0.19 + 0.03 * g, 0.2 * g, 1)
  rig.oh.visible = o >= 0.3
  rig.oh.scale.set(0.1 * o, 0.12 * o, 1)

  const reach = lerp(1, 0.22, h)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const x = side * lerp(ARM.x * out, 0.3, h)
    const y = lerp(ARM.y * up, up, h)
    const a = rig.arms[i]!
    a.position.set(x, y, 0)
    a.rotation.set(-p.swing[i]!, 0, side * p.lift[i]!)
    a.scale.setScalar(reach)
    if (side === -1) handAt(hand, -1, p.lift[i]!, p.swing[i]!, x, y, reach)
  }
  p.handX = hand.x / p.sx
  p.handY = hand.y / p.sy
  p.handZ = hand.z / p.sz

  const fishOn = p.fish >= 0
  rig.fish.visible = fishOn
  if (fishOn) {
    const leave = clamp01((p.fish - FISH_RIDE) / FISH_OFF)
    rig.fish.position.set(1.1 * leave, (2 + rig.hatTop * press) * up + 0.9 * Math.sin(Math.PI * leave) - 0.03, -0.05)
    rig.fish.rotation.set(0, 0, 0.3 * Math.sin(p.t * 9) - 1.2 * leave)
    rig.fish.scale.setScalar(popIn(p.fish) * (1 - smoothstep(0.7, 1, leave)))
    rig.tail.rotation.y = 0.7 * Math.sin(p.t * 17)
  }

  const puffOn = p.sneeze >= 0 && p.sneeze < 0.7
  rig.puff.visible = puffOn
  if (puffOn) {
    const e = p.sneeze / 0.7
    rig.puff.position.set(0, MOUTH.y * up, (MOUTH.z + 0.1) * out)
    const far = 0.15 + 1.1 * Math.sqrt(e)
    for (let i = 0; i < rig.puffs.length; i++) {
      const a = (i / rig.puffs.length) * TAU + 0.4
      const m = rig.puffs[i]!
      m.position.set(0.38 * far * Math.cos(a), 0.3 * far * Math.sin(a) + 0.15 * e, far)
      m.scale.setScalar(0.12 + 0.22 * e)
    }
    PUFF.opacity = 0.85 * (1 - e)
  }

  const bubbleOn = p.burp >= 0 && p.burp < 0.9
  rig.bubble.visible = bubbleOn
  if (bubbleOn) {
    const e = p.burp / 0.9
    rig.bubble.position.set(0.06 * Math.sin(p.burp * 9), (MOUTH.y + 0.1 + 0.8 * e) * up, (MOUTH.z + 0.2) * out)
    rig.bubble.scale.setScalar(0.05 + 0.13 * e)
  }
}

/** A baby's pose for this frame: bouncing and waving both arms when `wave` (waiting to be found, cheering), else breathing and looking about. Returns how high it hops, in its radii. */
function babyPose(p: Pose, t: number, wave: boolean, seed: number) {
  restPose(p)
  p.t = t
  p.blink = blinkAt(t, seed)
  if (!wave) {
    p.stretch = 1 + 0.04 * Math.sin(t * 3 + seed * 5)
    p.lookX = 0.4 * Math.sin(t * 0.7 + seed * 3)
    p.lift[0] = 0.45
    p.lift[1] = 0.45
    return 0
  }
  const hop = Math.abs(Math.sin(t * 2.2 * Math.PI + seed * 2))
  p.stretch = 0.9 + 0.2 * hop
  p.lift[0] = 2.5 + 0.45 * Math.sin(t * 13 + seed)
  p.lift[1] = 2.5 + 0.45 * Math.sin(t * 13 + seed + Math.PI)
  p.swing[0] = 0.2
  p.swing[1] = 0.2
  p.open = 0.85
  p.lookY = 0.25
  return 0.9 * hop
}

// ------------------------------------------------------------------ the owners

/** What a player's slime keeps from frame to frame: the springs and running loops that the sim's timestamps cannot give. */
interface Keep {
  /** Sim time of the last frame, -1 before the first. */
  last: number
  /** The drawn radius and its speed (a spring after the real one). */
  r: number
  rv: number
  /** The facing, eased; the lean forward and to the side; how much it is running and how much flying, eased. */
  yaw: number
  leanX: number
  leanZ: number
  gait: number
  air: number
  /** Distance run, for the steps; the skirt's turn and its speed; the bag's swing and its speed; the sideways speed last frame. */
  stride: number
  twirl: number
  twirlV: number
  sway: number
  swayV: number
  side: number
  /** Balls last frame, when the last one went in, when its colour or pattern last changed. */
  balls: number
  gulpAt: number
  lookAt: number
  /** When the friendly fish's arc began (-1 outside it), and the somersault it does on the way. */
  arcAt: number
  flip: number
}

/** Where the babies sit on the head, for one, two and three of them: across (toward its left) and up from the top of its head, in world units. */
const RIDE_SLOTS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [
    [0.17, 0],
    [-0.17, 0],
  ],
  [
    [0.18, 0],
    [-0.18, 0],
    [0, 0.27],
  ],
]

/** One baby riding on the player's slime: its group, body and pose, and where on the head it sits now (eased toward its slot). */
interface Rider {
  group: Group
  rig: Rig
  pose: Pose
  x: number
  y: number
}

/**
 * The player's slime, read from the run every frame. It stands where the sim puts it
 * (facing down the course while running, toward the camera at the start, in the tower and
 * on the top), at a drawn size that springs after the sim's radius so every ball is a
 * little wobble of growth, and acts out everything the sim's timestamps say: hops along
 * as it runs, stretches on take-off and squashes on landing, giggles flat as a puddle,
 * teeters with its arms windmilling at an edge, goes dizzy from a paddle, sneezes in the
 * wind, burps, climbs, splashes and somersaults home on the fish's arc with a little fish
 * on its head. The babies it found ride on its head and jump down to cheer when the box
 * opens on the top.
 */
export function PlayerSlime({ sim, look }: { sim: Sim; look: SlimeLook }) {
  const place = useRef<Group>(null!)
  const turn = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const rig = useMemo(newRig, [])
  const pose = useMemo(newPose, [])
  const riders = useMemo<Rider[]>(() => [0, 1, 2].map(() => ({ group: null!, rig: newRig(), pose: newPose(), x: 0, y: 0 })), [])
  const keep = useRef<Keep>({ last: -1, r: 0, rv: 0, yaw: 0, leanX: 0, leanZ: 0, gait: 0, air: 0, stride: 0, twirl: 0, twirlV: 0, sway: 0, swayV: 0, side: 0, balls: 0, gulpAt: -1, lookAt: -1, arcAt: -1, flip: 0 }).current
  const seen = useRef(look)

  useFrame(({ camera }) => {
    const s = sim.slime
    const t = sim.time
    const first = keep.last < 0
    const dt = first ? 0 : clamp(t - keep.last, 0, 0.1)
    keep.last = t
    sparkle.value = t
    if (first) {
      keep.r = s.r
      keep.balls = s.balls
    }
    if (seen.current.colour !== look.colour || seen.current.pattern !== look.pattern) keep.lookAt = t
    seen.current = look

    keep.rv += ((s.r - keep.r) * 160 - keep.rv * 9) * dt
    keep.r += keep.rv * dt
    const r = keep.r
    if (s.balls > keep.balls) keep.gulpAt = t
    keep.balls = s.balls
    const big = clamp01((s.size - 1) / (MAX_SIZE - 1))
    const phase = sim.phase
    const fin = sim.finish
    const tower = sim.tower

    // What it is doing.
    const hidden = s.hidden ? clamp01((t - s.hiddenAt) / 0.07) : s.shownAt >= 0 ? 1 - clamp01((t - s.shownAt) / 0.12) : 0
    const onCourse = phase === 'run' || phase === 'finish'
    const climbing = onCourse && s.climbAt >= 0
    const flying = !s.grounded && !climbing && (onCourse || phase === 'splash')
    const speed = Math.hypot(s.vx, s.vz)
    const running = onCourse && s.grounded && !climbing && speed > 0.6
    const sliding = running && s.vz > 7.2
    keep.gait = ease(keep.gait, running && !sliding && hidden < 0.5 ? 1 : 0, dt, 0.08)
    keep.air = ease(keep.air, flying ? 1 : 0, dt, 0.06)
    if (running) keep.stride += speed * dt
    const gait = keep.gait
    const air = keep.air
    const rising = s.vy > 0
    const step = (keep.stride / (1.05 + 0.85 * big)) * Math.PI
    const measuring = fin.measureAt >= 0 && t - fin.measureAt < 2
    const inTower = phase === 'tower'
    let babyAt = -1
    let found = 0
    for (let i = 0; i < sim.babies.length; i++) {
      const b = sim.babies[i]!
      if (b.takenAt >= 0) found++
      if (!b.home && b.takenAt > babyAt) babyAt = b.takenAt
    }
    let popAt = -1
    for (let i = 0; i < tower.circles.length; i++) popAt = Math.max(popAt, tower.circles[i]!.poppedAt)
    const backAt = s.fishUntil > 0 ? s.fishUntil - FISH_RIDE : -1

    // Where it faces: down the course, turned a little into the way it runs, or round at the child for a funny moment.
    const glance = onCourse || phase === 'splash' ? Math.max(bump(t, s.hitAt, 1.5), bump(t, s.burpAt, 1.1), bump(t, s.sneezeAt, 1.2), bump(t, babyAt, 1.1), bump(t, backAt, 1.4)) : 0
    const heading = Math.atan2(s.vx, Math.max(2, Math.abs(s.vz)))
    let face = 0
    // At the start it looks straight at the child, wherever the camera stands (sim z is three's -z).
    if (phase === 'ready') face = Math.atan2(camera.position.x - s.x, camera.position.z + s.z)
    else if (phase === 'run' || phase === 'splash' || (phase === 'finish' && !measuring)) face = Math.PI - 0.7 * heading + 0.85 * Math.PI * glance
    else if (phase === 'finish') face = 0.3
    else if (phase === 'tower' || phase === 'fall') face = 0.35 * clamp(s.vx / 5, -1, 1)
    else if (phase === 'top') face = fin.unlockAt >= 0 && fin.giftAt < 0 ? 0.5 : 0.18 * Math.sin(t * 2.4)
    else if (phase === 'done') face = 0.2 * Math.sin(t * 2.4)
    keep.yaw = first ? face : easeAngle(keep.yaw, face, dt, 0.11)
    const yaw = keep.yaw + s.spin
    const side = s.vx * Math.cos(yaw) + s.vz * Math.sin(yaw)

    restPose(pose)
    pose.t = t

    // The jelly: a bounce at every step, stretched on take-off and in flight, squashed and wobbling after every landing, knock and bump.
    let k = 1 - 0.07 * Math.cos(2 * step) * gait
    k += 0.24 * kick(t, s.jumpedAt, 0.35)
    k -= (0.22 + 0.12 * big) * wobble(t, s.landedAt, 3.2, 0.6)
    k -= 0.36 * wobble(t, s.bounceAt, 2.6, 0.75)
    k -= 0.22 * wobble(t, s.hitAt, 4, 0.8)
    k -= 0.18 * wobble(t, s.bumpAt, 4.5, 0.6)
    k += 0.08 * wobble(t, keep.gulpAt, 5.5, 0.35)
    k += 0.28 * wobble(t, s.shownAt + 0.12, 3, 0.55)
    k += 0.12 * wobble(t, keep.lookAt, 4, 0.8)
    k += air * clamp(Math.abs(s.vy) * 0.022, 0, 0.16)
    if (s.hidden) k += 0.12 * Math.sin((t - s.hiddenAt) * 30) * kick(t, s.hiddenAt, 0.7)
    pose.hidden = hidden
    pose.flat = HIDDEN_TOP / r
    pose.spread = lerp(1.45, 1.15, big)
    pose.peek = clamp(0.13 / (EYE.r * r), 0.2, 1)
    pose.roll = s.edge * 0.22 * Math.sin(t * 17) + 0.07 * wobble(t, s.hitAt, 3, 0.9)
    pose.tip = 0.08 * wobble(t, s.bumpAt, 3, 0.6) - (sliding ? 0.12 : 0)

    // The face: blinking, looking where it goes (up in a jump, down to the landing), at the child when it turns round.
    pose.blink = blinkAt(t, 0)
    pose.scared = s.edge
    pose.dizzy = Math.max(bump(t, s.hitAt, 1.6), bump(t, tower.bonkAt, 1.4))
    pose.lookX = clamp(side / 6, -1, 1) * (1 - glance)
    pose.lookY = lerp(air * (rising ? 0.35 : -0.45), 0.15, glance)
    pose.open = Math.max(air * (rising ? 0.85 : 0.5), t - keep.gulpAt < 0.14 ? 0.5 : 0)

    // The arms: swinging with the steps, the outside one up for balance in a turn, up in the air.
    const sw = 0.55 * Math.sin(step) * gait
    for (let i = 0; i < 2; i++) {
      const outside = i === 0 ? Math.max(0, -side / 5) : Math.max(0, side / 5)
      pose.lift[i] = lerp(0.32 + 0.14 * Math.abs(Math.sin(step)) * gait + 0.8 * Math.min(1, outside), rising ? 2.4 : 1.6 + 0.4 * Math.sin(t * 17 + i * 2), air)
      pose.swing[i] = lerp(i === 0 ? sw : -sw, 0.3, air)
      if (sliding) {
        pose.lift[i] = 1.45 + 0.1 * Math.sin(t * 3 + i)
        pose.swing[i] = 0.15
      }
    }

    // Teetering at an edge: the arms windmill.
    const teeter = smoothstep(0.3, 0.8, s.edge)
    if (teeter > 0) {
      for (let i = 0; i < 2; i++) {
        pose.lift[i] = lerp(pose.lift[i]!, 1.7 + 0.9 * Math.sin(t * 15 + i * Math.PI), teeter)
        pose.swing[i] = lerp(pose.swing[i]!, 1.3 * Math.cos(t * 15 + i * Math.PI), teeter)
      }
      pose.round = teeter * 0.7
    }

    // Climbing a frame: reaching up hand over hand.
    if (climbing) {
      for (let i = 0; i < 2; i++) {
        pose.lift[i] = 2.5 + 0.45 * Math.sin(t * 11 + i * Math.PI)
        pose.swing[i] = 0.9
      }
      k += 0.06 * Math.sin(t * 11)
      pose.lookY = 0.6
      pose.open = 0.25
    }

    // Hard wind: squinting, arms blown back, a long "ooo".
    if (s.windAt >= 0 && t - s.windAt < 0.25) {
      pose.blink = Math.max(pose.blink, 0.55)
      pose.round = Math.max(pose.round, 0.7)
      pose.scared = Math.max(pose.scared, 0.3)
      for (let i = 0; i < 2; i++) {
        pose.lift[i] = 1.1 + 0.2 * Math.sin(t * 19 + i)
        pose.swing[i] = -1.3
      }
    }

    // A paddle's knock: arms flailing, an O, the hat off.
    const knocked = Math.max(bump(t, s.hitAt, 0.9), bump(t, tower.bonkAt, 0.9))
    if (knocked > 0) {
      for (let i = 0; i < 2; i++) {
        pose.lift[i] = lerp(pose.lift[i]!, 2.3 + 0.5 * Math.sin(t * 21 + i), knocked)
        pose.swing[i] = lerp(pose.swing[i]!, 0.7 * Math.sin(t * 16 + i * 2), knocked)
      }
      pose.round = Math.max(pose.round, knocked * 0.8)
    }
    const knockAt = Math.max(s.hitAt, tower.bonkAt)
    if (knockAt >= 0 && t - knockAt < 0.95) {
      const since = Math.max(0, t - knockAt)
      pose.hatUp = Math.sin((Math.PI * since) / 0.95)
      pose.hatSpin = (TAU * 1.5 * since) / 0.95
    }
    if (s.bounceAt >= 0 && t - s.bounceAt < 0.45) pose.hatUp = Math.max(pose.hatUp, 0.25 * Math.sin((Math.PI * (t - s.bounceAt)) / 0.45))

    // The sneeze: "ah..." leaning back with the eyes closing, then "choo!" forward with a puff.
    if (s.sneezeAt >= 0 && t - s.sneezeAt < 0.9) {
      const since = t - s.sneezeAt
      if (since < 0.3) {
        const e = since / 0.3
        k += 0.14 * e
        pose.tip = -0.22 * e
        pose.blink = 0.65 * e
        pose.round = 0.55
        pose.lookY = 0.4
      } else {
        const e = (since - 0.3) / 0.6
        pose.tip = 0.38 * (1 - e) * (1 - e)
        k -= 0.2 * (1 - e) * (1 - e)
        pose.blink = 1 - e
        pose.open = 1 - e
        pose.round = 0
        pose.sneeze = since - 0.3
      }
    }

    // The burp: an O and a little jelly bubble.
    if (s.burpAt >= 0 && t - s.burpAt < 0.9) {
      const since = t - s.burpAt
      pose.round = since < 0.5 ? 1 : 1 - (since - 0.5) / 0.4
      pose.blink = Math.max(pose.blink, 0.45)
      pose.burp = since
      k += 0.12 * wobble(t, s.burpAt + 0.05, 4, 0.5)
    }

    // The water: scared and flailing in it, arms up and a somersault on the fish's arc home.
    if (phase === 'splash') {
      const since = t - s.splashAt
      if (keep.arcAt < 0 && since > 0.3 && s.vy > 1) keep.arcAt = t
      if (keep.arcAt < 0) {
        pose.scared = 1
        pose.round = 1
        for (let i = 0; i < 2; i++) {
          pose.lift[i] = 2.5 + 0.5 * Math.sin(t * 16 + i * Math.PI)
          pose.swing[i] = 0.5 * Math.sin(t * 13 + i)
        }
        k += 0.08 * Math.sin(t * 9)
      } else {
        pose.open = 1
        pose.lift[0] = 2.8
        pose.lift[1] = 2.8
        keep.flip = -TAU * smoothstep(0, 1, (t - keep.arcAt) / 0.9)
      }
    } else {
      keep.arcAt = -1
      const home = Math.round(keep.flip / TAU) * TAU
      keep.flip = ease(keep.flip, home, dt, 0.1)
      if (Math.abs(keep.flip - home) < 0.001) keep.flip = 0
    }
    pose.fish = s.fishUntil > 0 && t >= backAt && t < s.fishUntil + FISH_OFF ? t - backAt : -1
    if (pose.fish >= 0 && pose.fish < 1.4) pose.lookY = 0.8

    // A new colour or pattern while it runs (a full star jar): a happy wiggle.
    const proud = bump(t, keep.lookAt, 1.2)

    // Ready at the start: facing the child and waving.
    if (phase === 'ready') {
      k = 1 + 0.04 * Math.sin(t * 4)
      pose.lift[1] = 2.55 + 0.35 * Math.sin(t * 9)
      pose.lift[0] = 0.45
      pose.open = 0.45
      pose.lookY = 0.15
    }

    // The finish: arms up for the key, standing tall and proud at the measuring pole.
    const yay = Math.max(bump(t, fin.keyAt, 0.9), proud)
    if (yay > 0) {
      for (let i = 0; i < 2; i++) pose.lift[i] = lerp(pose.lift[i]!, 2.7 + 0.25 * Math.sin(t * 14 + i * Math.PI), yay)
      pose.open = Math.max(pose.open, 0.9 * yay)
    }
    if (phase === 'finish' && measuring) {
      const since = t - fin.measureAt
      k += 0.08 * smoothstep(0, 0.3, since)
      pose.lift[0] = 2.6 + 0.3 * Math.sin(t * 9)
      pose.lift[1] = since < 0.8 ? 2.6 : 0.5
      pose.open = 0.7
      pose.lookX = 0
      pose.lookY = 0.15
    }

    // The tower: arms straight up like a rocket, looking up at the circles; arms pumping at every pop; squeezed thin through the giant circle's hole.
    if (inTower) {
      k = 1.12 + 0.3 * kick(t, tower.launchAt, 0.5)
      pose.lift[0] = 2.95
      pose.lift[1] = 2.95
      pose.lookY = 0.85
      pose.open = 0.55
      const pop = bump(t, popAt, 0.6)
      if (pop > 0) {
        for (let i = 0; i < 2; i++) pose.lift[i] = lerp(2.95, 2.4 + 0.6 * Math.sin(t * 18 + i * Math.PI), pop)
        pose.open = 1
      }
    }
    if (phase === 'fall') {
      pose.round = Math.max(pose.round, 0.8)
      pose.roll = 0.3 * Math.sin(t * 8)
      for (let i = 0; i < 2; i++) {
        pose.lift[i] = 2.2 + 0.6 * Math.sin(t * 18 + i * 2)
        pose.swing[i] = 0.6 * Math.sin(t * 14 + i)
      }
    }
    const squeeze = bump(t, tower.funnelAt, 0.7)
    if (squeeze > 0) {
      k = lerp(k, 1.45, squeeze)
      pose.lift[0] = lerp(pose.lift[0], 3.05, squeeze)
      pose.lift[1] = lerp(pose.lift[1], 3.05, squeeze)
      pose.scared = Math.max(pose.scared, 0.5 * squeeze)
      pose.round = Math.max(pose.round, 0.7 * squeeze)
    }

    // The top: popping out, looking at the box while the key turns, surprised as the lid pops, then happy with the new thing on, waving.
    if (phase === 'top' || phase === 'done') {
      k -= 0.3 * wobble(t, fin.topAt, 3, 0.7)
      k -= 0.25 * wobble(t, fin.giftAt, 3.5, 0.6)
      const happy = phase === 'done' || fin.giftAt >= 0
      if (happy) {
        k += 0.05 * Math.sin(t * 5)
        pose.lift[1] = 2.55 + 0.35 * Math.sin(t * 8)
        pose.lift[0] = 2.2 + 0.3 * Math.sin(t * 8 + 1.5)
        pose.open = 0.85
        pose.lookY = 0.15
      } else if (fin.openAt >= 0 && t >= fin.openAt) {
        pose.scared = 0.6
        pose.round = 1
        pose.lift[0] = 2.6
        pose.lift[1] = 2.6
      } else if (fin.unlockAt >= 0) {
        pose.lookX = 0.85
        pose.lookY = -0.1
        pose.open = 0.3
      } else {
        pose.lift[0] = 2.2
        pose.lift[1] = 2.2
        pose.open = 0.6
      }
      // The new thing from the box goes on (the box's flight leaves it on the slime at giftAt) with a boing.
      if (sim.gift !== null && fin.giftAt >= 0) {
        pose.giftSlot = ITEMS[sim.gift].slot
        pose.giftOn = 1 + 0.3 * wobble(t, fin.giftAt, 3, 0.6)
      }
    }
    pose.stretch = clamp(k, 0.55, 1.5)

    // The clothes: the skirt twirls up in a jump, the bags swing behind the turns, the backpack hops with the steps, the scarf streams.
    const spinUp = flying || inTower ? 9 : phase === 'done' ? 2.5 : 0
    keep.twirlV = ease(keep.twirlV, spinUp, dt, 0.3)
    keep.twirl += keep.twirlV * dt
    pose.twirl = keep.twirl + 0.12 * Math.sin(step) * gait
    pose.flare = clamp01(keep.twirlV / 9) * 0.9 + 0.1 * air
    const shove = dt > 0 ? (side - keep.side) / dt : 0
    keep.side = side
    keep.swayV += (-45 * keep.sway - 3.5 * keep.swayV - 0.035 * shove + 5 * Math.cos(step) * gait) * dt
    keep.sway = clamp(keep.sway + keep.swayV * dt, -0.9, 0.9)
    pose.sway = keep.sway
    pose.bounce = 0.05 * Math.abs(Math.sin(step)) * gait - 0.08 * wobble(t, s.landedAt, 3, 0.5) + 0.06 * air
    pose.flutter = clamp01(onCourse ? speed / 6 : 0) + 0.5 * air + (inTower ? 1 : 0)

    applyPose(rig, pose)

    // Placing it: where the sim says (toThree), hopping a little with the steps, leaning into the way it goes.
    const bob = 0.06 * r * Math.abs(Math.sin(step)) * gait
    place.current.position.set(s.x, s.y + bob, -s.z)
    keep.leanZ = ease(keep.leanZ, -0.16 * clamp(s.vx / 5, -1, 1) * (1 - 0.6 * hidden), dt, 0.12)
    keep.leanX = ease(keep.leanX, onCourse ? -0.09 * clamp(s.vz / 6, -1, 1) - (sliding ? 0.1 : 0) : 0, dt, 0.15)
    place.current.rotation.set(keep.leanX, 0, keep.leanZ)
    turn.current.rotation.y = yaw
    const f = keep.flip
    const b = body.current
    b.scale.setScalar(r)
    b.rotation.x = f
    b.position.set(0, r * (1 - Math.cos(f)), -r * Math.sin(f))

    // The babies: on top of its head (or its hat), hopping on as they are found, flat when it hides, down beside it cheering on the top.
    const head = r * (2 * rig.squash.scale.y + rig.hatTop * pose.sy) + 0.3 * r * pose.hatUp - r
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    let j = 0
    for (let i = 0; i < 3; i++) {
      const baby = sim.babies[i]!
      const rd = riders[i]!
      rd.group.visible = baby.takenAt >= 0
      if (baby.takenAt < 0) continue
      const slot = RIDE_SLOTS[found - 1]![j]!
      j++
      // Flat with the slime, the one on top comes down between the other two.
      rd.x = first ? slot[0] : ease(rd.x, slot[0], dt, 0.12)
      rd.y = first ? slot[1] : ease(rd.y, slot[1] * (1 - hidden), dt, 0.08)
      const down = fin.openAt >= 0 ? clamp01((t - fin.openAt - 0.25 - 0.15 * i) / 0.5) : 0
      const on = baby.home ? 1 : clamp01((t - baby.takenAt) / HOP_ON)
      let hop = 0
      if (down >= 1) hop = babyPose(rd.pose, t, true, 0.3 + 0.27 * i)
      else {
        babyPose(rd.pose, t, false, 0.3 + 0.27 * i)
        rd.pose.hidden = hidden
        rd.pose.flat = 0.5
        rd.pose.peek = 0.6
        rd.pose.dizzy = pose.dizzy * 0.7
        rd.pose.scared = pose.scared
        if (air > 0.5 || on < 1 || down > 0 || inTower) {
          rd.pose.lift[0] = 2.6
          rd.pose.lift[1] = 2.6
          rd.pose.open = 0.8
        }
      }
      applyPose(rd.rig, rd.pose)
      const up = head + rd.y * rd.pose.sy
      const lx = rd.x
      const ly = r + up * Math.cos(f)
      const lz = -0.14 * r + up * Math.sin(f)
      let x = lx * cos + lz * sin
      let y = ly + 0.03 * Math.abs(Math.sin(step + i)) * gait
      let z = -lx * sin + lz * cos
      let ry = yaw
      let rx = f
      if (on < 1) {
        const q = smoothstep(0, 1, on)
        x = lerp(baby.x - s.x, x, q)
        y = lerp(baby.y - s.y, y, q) + 0.9 * Math.sin(Math.PI * on)
        z = lerp(s.z - baby.z, z, q)
        ry += TAU * (1 - q)
      }
      if (down > 0) {
        const q = smoothstep(0, 1, down)
        x = lerp(x, -(r + 0.4 + 0.42 * i), q)
        y = lerp(y, hop * BABY_R, q) + 0.8 * Math.sin(Math.PI * down)
        z = lerp(z, 0.45 + 0.1 * i, q)
        ry = lerp(ry, 0, q)
        rx = lerp(rx, 0, q)
      }
      rd.group.position.set(x, y, z)
      rd.group.rotation.set(rx, ry, 0, 'YXZ')
    }
  }, BODY_PRIORITY)

  return (
    <group ref={place}>
      <group ref={turn}>
        <group ref={body}>
          <Body rig={rig} pose={pose} colours={SLIME_COLOURS[look.colour]} pattern={look.pattern} outfit={look.outfit} eyes={1} />
        </group>
      </group>
      {riders.map((rd, i) => (
        <group
          key={i}
          ref={(g) => {
            if (g) rd.group = g
          }}
          visible={false}
        >
          <group scale={BABY_R}>
            <Body rig={rd.rig} pose={rd.pose} colours={BABIES[i]!} pattern={null} outfit={null} eyes={BABY_EYES} />
          </group>
        </group>
      ))}
    </group>
  )
}

/**
 * A slime standing and bouncing gently in place, facing +Z, radius 1 (the map, the
 * wardrobe): it breathes, blinks, looks about and sways its arms. `happy` makes it hop,
 * wiggle, twirl its skirt and wave both arms, easing in and out of it.
 */
export function IdleSlime({ look, clock, happy }: { look: SlimeLook; clock: () => number; happy: boolean }) {
  const root = useRef<Group>(null!)
  const rig = useMemo(newRig, [])
  const pose = useMemo(newPose, [])
  const keep = useRef({ last: -1, joy: 0, twirl: 0 }).current
  useFrame(() => {
    const t = clock()
    const dt = keep.last < 0 ? 0 : clamp(t - keep.last, 0, 0.1)
    keep.last = t
    sparkle.value = t
    keep.joy = ease(keep.joy, happy ? 1 : 0, dt, 0.12)
    const joy = keep.joy
    keep.twirl += 7 * joy * dt
    const w = t * 8.5
    const hop = Math.abs(Math.sin(t * Math.PI * 2.6))
    restPose(pose)
    pose.t = t
    pose.stretch = lerp(1 + 0.035 * Math.sin(t * TAU * 0.8), 0.88 + 0.26 * hop, joy)
    pose.blink = blinkAt(t, 0.15) * (1 - joy)
    pose.lookX = lerp(0.3 * Math.sin(t * 0.45), 0, joy)
    pose.lookY = lerp(0.12 + 0.1 * Math.sin(t * 0.33), 0.2, joy)
    pose.open = 0.85 * joy
    pose.lift[0] = lerp(0.34 + 0.06 * Math.sin(t * 1.7), 2.45 + 0.42 * Math.sin(w), joy)
    pose.lift[1] = lerp(0.34 + 0.06 * Math.sin(t * 1.7 + 1), 2.45 + 0.42 * Math.sin(w + Math.PI), joy)
    pose.swing[0] = lerp(0.1 * Math.sin(t * 1.3), 0.25, joy)
    pose.swing[1] = lerp(-0.1 * Math.sin(t * 1.3), 0.25, joy)
    pose.roll = 0.14 * joy * Math.sin(w * 0.5)
    pose.twirl = 0.15 * Math.sin(t * 1.2) + keep.twirl
    pose.flare = 0.6 * joy
    pose.sway = 0.1 * Math.sin(t * 1.9) + 0.4 * joy * Math.sin(w)
    pose.bounce = 0.06 * joy * hop
    pose.flutter = 0.15 + 0.5 * joy
    applyPose(rig, pose)
    root.current.position.y = 0.22 * joy * hop
    root.current.rotation.y = 0.32 * joy * Math.sin(t * 6.5)
  }, BODY_PRIORITY)
  return (
    <group ref={root}>
      <Body rig={rig} pose={pose} colours={SLIME_COLOURS[look.colour]} pattern={look.pattern} outfit={look.outfit} eyes={1} />
    </group>
  )
}

/**
 * A baby slime (index into BABY_COLOURS), a third of the starting slime's size, its bottom
 * at its group's origin, facing +Z, no clothes and big eyes. `wave` makes it hop and wave
 * both arms (waiting to be found, cheering); otherwise it breathes and looks about.
 */
export function BabySlime({ index, clock, wave }: { index: 0 | 1 | 2; clock: () => number; wave: boolean }) {
  const hop = useRef<Group>(null!)
  const rig = useMemo(newRig, [])
  const pose = useMemo(newPose, [])
  useFrame(() => {
    const t = clock()
    hop.current.position.y = babyPose(pose, t, wave, 0.3 + 0.27 * index)
    applyPose(rig, pose)
  }, BODY_PRIORITY)
  return (
    <group scale={BABY_R}>
      <group ref={hop}>
        <Body rig={rig} pose={pose} colours={BABIES[index]!} pattern={null} outfit={null} eyes={BABY_EYES} />
      </group>
    </group>
  )
}
