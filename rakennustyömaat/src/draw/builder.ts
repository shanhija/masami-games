import { DEFAULT_LOOK, FRIENDS } from '../game/catalog'
import { rect, type Rect } from '../game/layout'
import { BAGS, GLASSES, HAIRS, HAIR_COLORS, HAT_COLORS, PANTS, PARTS, POSES, SHIRTS, SHOES, SKINS, TOOLS, WEAR_COLORS, type Look, type Part, type Pose, type Shoes, type Tool } from '../game/model'
import { between, rng } from '../game/random'
import {
  C,
  DENIM,
  HAIR_LOOK,
  HAT_LOOK,
  INK,
  SIZE,
  SKIN_TONES,
  TAU,
  WEAR_LOOK,
  arch,
  at,
  bar,
  blob,
  blush,
  box,
  circlePath,
  circlesPath,
  clamp01,
  detail,
  eyes,
  groundShadow,
  heartPath,
  ink,
  loop,
  lw,
  mix,
  part,
  pen,
  roundRectPath,
  scaled,
  shine,
  smile,
  smooth,
  sparkle,
  starPath,
  tube,
  type Faces,
  type SheetEntry,
} from './look'

/**
 * The builder rig: one 3/4 side view facing right, the same on every screen, for the
 * player's builder (in the cat-ear hard hat) and the friends in the rooms (no hat, no
 * tool). 1.2 m to the ear tips, about 3.2 heads: a round head on a boxy body, chunky tube
 * limbs, mitten hands, bean eyes.
 *
 * Two records make every picture. A `Rig` is the pose skeleton at one moment (the hips'
 * height, the lean, every joint angle, the face, the hat's ears, the sneakers' lights);
 * `posed` makes it for any pose and time, and the truck adjusts the ears of the one it
 * gets. A `Look` says which part is drawn at each step. The parts are drawn in one fixed
 * order, back to front: far arm, bag, far leg, back hair, what of the bag peeks over the
 * shoulder, near leg, shirt, trousers, the tool on the belt, head (face, front hair, ear,
 * glasses, hat: far ear, dome, near ear), near arm, the tool and the mitten that grips it.
 * The legs come before the clothes so the trousers' seat and a dress cover their tops and
 * the legs come out from under them.
 *
 * Each part's outline is stroked twice: a backing pass first strokes every part wide in ink
 * behind the whole figure, so the silhouette reads at the edge weight and the lines between
 * parts at the line weight (at small sizes, S detail, the backing is left out: the lines
 * alone are heavy enough). Far limbs wear the clothes' darker tint, so two legs read as
 * two. "Near" is the side facing the viewer: front (right) for the eyes and the hat's ears,
 * as the face kit draws them.
 *
 * Every wardrobe option names itself by a big mark that survives street size (S detail):
 * jeans' turned-up cuffs, work trousers' knee pads, the vest's two silver bands, the
 * hoodie's hood and long sleeves, the pinafore's flare, a hair style's shape under the
 * brim, each shoe's height and colour, each bag's outline over the back.
 *
 * What a friend holds or wears (a chef's hat, a spoon, a microphone, a helmet) holds on to
 * the rig through this file alone: `inRig` draws in the rig's body, upper-body or head
 * frame, `handAt` and `armTo` find and place a hand, `rigPoint` says where a point of a
 * frame lands, HEAD, MOUTH and `mitten` give the head, the mouth and a hand round a grip,
 * and `mixRig` eases one pose into another. The road's tool button is `drawToolIcon`.
 */

/** Seconds a pose takes: a looping pose's period, or a one-shot pose's length (it holds its last frame after). */
export const POSE_LENGTH: Record<Pose, number> = {
  stand: 2.4,
  walk: 0.7,
  run: 0.45,
  drive: 1.6,
  hit: 0.45,
  hammer: 0.4,
  lever: 0.6,
  hop: 0.5,
  wave: 1.0,
  cheer: 0.9,
  dance: 0.8,
  play: 1.4,
  jump: 1.2,
  slide: 2.4,
  bounce: 0.9,
  sit: 3.0,
  sleep: 3.2,
  float: 3.0,
}
export const POSE_LOOPS: Record<Pose, boolean> = {
  stand: true,
  walk: true,
  run: true,
  drive: true,
  hit: false,
  hammer: true,
  lever: false,
  hop: false,
  wave: true,
  cheer: false,
  dance: true,
  play: true,
  jump: true,
  slide: true,
  bounce: true,
  sit: true,
  sleep: true,
  float: true,
}

// ---------------------------------------------------------------------------------------
// The builder's own colours

/** What the wardrobe is made of beyond the clothes, hair and skin colours: the tee under a vest or pinafore, shoes, bags, tools and lenses. */
const KIT = {
  /** The white tee under the pinafore. */
  tee: WEAR_LOOK.white,
  reflect: '#E3EAF3',
  belt: '#5B3A26',
  buckle: '#FFD860',
  /** Work trousers' knee pads: a slate that reads on every trouser colour. */
  pad: '#5A6378',
  boot: '#D98C3B',
  bootSole: '#5B3A26',
  lace: '#FFE7B0',
  sneaker: '#FFFFFF',
  sneakerTrim: '#2E6BE6',
  sneakerSole: '#C9CFDA',
  welly: '#E8443A',
  wellyRim: '#B52E26',
  /** Light-up sneakers: a purple upper on a dark sole, so the lit dots shine out of it. */
  glowShoe: '#8E5CE0',
  glowSole: '#3B2470',
  glowOn: '#FFF3B0',
  glowOff: '#6A3EB8',
  cowboy: '#9C5A2E',
  cowboyDark: '#6E3B1C',
  wood: '#E8A85C',
  steel: '#B6C0CF',
  steelDark: '#6B778C',
  drill: '#2E6BE6',
  wandStick: '#FF7AB6',
  star: '#FFD93A',
  school: '#2E6BE6',
  schoolDark: '#1E4FB5',
  teddy: '#C98A4E',
  teddyLight: '#F0C88A',
  toolbox: { face: '#E8443A', top: '#EE7A5E', side: '#B52E26' } satisfies Faces,
  tank: '#B6C0CF',
  tankFar: '#8E9AAE',
  tankCap: '#E8443A',
  flame: '#FFC21A',
  flameHot: '#FF7A1F',
  catBag: '#5A5F73',
  catBagLight: '#FFFFFF',
  lens: 'rgba(189, 229, 248, 0.45)',
  shades: '#2A3350',
  goggleFrame: '#FF7A1F',
  goggleStrap: '#2A3350',
  starFrame: '#FFD93A',
  heartFrame: '#FF5C8A',
  hairTie: '#FF5C8A',
  /** The wand's trail, in turn. */
  trail: ['#FFD93A', '#FFFFFF', '#FF7AB6'],
} as const

// ---------------------------------------------------------------------------------------
// The measures, in metres: feet at the origin, facing right, standing

/** The head's centre and radius, in the head's frame (`inRig` 'head'): a hat, a helmet or a headset sits on it. */
export const HEAD = { x: 0.02, y: -0.8, r: 0.19 } as const
/** The mouth's middle in the head's frame, where the smile is drawn: a party blower or a microphone meets it. */
export const MOUTH = { x: HEAD.x + 0.07, y: HEAD.y + 0.095 } as const
/** The head nods about the neck; the upper body leans about the hips' middle. */
const NECK = { x: 0.01, y: -0.62 }
const PIVOT_X = 0.01
const HIP_Y = -0.32
const TORSO = { x: -0.14, y: -0.64, w: 0.3, h: 0.34, r: 0.075 }
const SEAT = { x: -0.135, y: -0.35, w: 0.29, h: 0.085, r: 0.035 }
/** Per side, [far, near]: the far side is behind (left), the near side in front (right). */
const HIPS = [-0.045, 0.055] as const
const SHOULDERS = [-0.05, 0.035] as const
const SHOULDER_Y = -0.575
const THIGH = 0.135
const SHIN = 0.135
const LEG_W = 0.11
const UPPER = 0.14
const FORE = 0.14
const ARM_W = 0.085
/** The mitten's radius: a prop's grip is held in one (`mitten`). */
const MITTEN = 0.05
/** The face kit on the builder: bean eyes this tall, the near one here and the far one GAP behind it. */
const EYE = { x: HEAD.x + 0.095, y: HEAD.y + 0.005, size: 0.056, gap: 0.085 }
/** The ear: an upright oval on the hairline, low and well behind the far eye so it never reads as a third eye or a lens. */
const EAR = { x: HEAD.x - 0.07, y: HEAD.y + 0.04, rx: 0.03, ry: 0.044, tilt: -0.2 }
/** The hat on the head: the brim's line and the dome's half-ellipse sitting on it. */
const BRIM_Y = HEAD.y - 0.12
const DOME = { x: HEAD.x - 0.005, rx: 0.215, ry: 0.18 }
/** Lying on the back (`Rig.lie` 1): the figure turned head-left about its feet, shifted so its middle is over the origin and the back of its head rests on the ground. */
const LIE = { x: 0.56, y: 0.165 }
/** Where the wand's star is in the tool's frame, and its trail: a sparkle born there every TRAIL_LIFE / TRAIL_N seconds, rising TRAIL_RISE and shrinking away over TRAIL_LIFE. */
const WAND_TIP = -0.25
const TRAIL_N = 5
const TRAIL_LIFE = 0.7
const TRAIL_RISE = 0.2
const TRAIL_SIZE = 0.075
/** The jetpack fires (a flame and puffs) once the builder is this far off the ground: hops and jumps, not a run's bob. */
const JET_LIFT = 0.07
/** How far each shoe reaches up the leg above the ankle: jeans' cuffs sit on top of it, and tall boots take the jeans inside. */
const SHOE_TOP: Record<Shoes, number> = { boots: 0.088, sneakers: 0.032, lights: 0.032, wellies: 0.13, cowboy: 0.135 }
/** Pose times are held to this many seconds either way, so a stamp of never (Infinity) still makes a finite picture. */
const LONG = 1e6
const held = (u: number) => (Number.isNaN(u) ? 0 : Math.min(LONG, Math.max(-LONG, u)))

const SIDES = [0, 1] as const
type Side = (typeof SIDES)[number]

// ---------------------------------------------------------------------------------------
// The pose skeleton

/**
 * One moment of a pose. Limb angles are radians from straight down, positive swinging
 * forward; a knee bends the shin back and an elbow bends the forearm forward. Pairs are
 * [far, near].
 */
export interface Rig {
  /** The whole figure's lift (negative is up) and its squash (sy; the width keeps the volume). */
  lift: number
  sy: number
  /** Lying down on the back, 0 upright to 1 flat (head to the left, face up), laid with its middle over the origin. */
  lie: number
  /** The hips' height: -0.32 standing, nearer the ground sitting or kneeling. */
  hip: number
  /** The upper body's lean about the hips and the head's nod about the neck, positive forward. */
  lean: number
  nod: number
  thigh: readonly [number, number]
  knee: readonly [number, number]
  shoulder: readonly [number, number]
  elbow: readonly [number, number]
  /** The tool's angle in the near hand, from pointing up, positive tipping forward; null when the hands are busy (the tool hangs on the belt). */
  tool: number | null
  eyes: 'open' | 'happy' | 'closed' | 'wide'
  mouth: boolean
  /** The hat's ears: a flick (radians each ear turns, signed) and a fold back at speed (0 up, 1 laid back). */
  flick: number
  fold: number
  /** Light-up sneakers: which sole is lit, [far, near]. Each blinks on its own steps, at most three changes a second. */
  lights: readonly [boolean, boolean]
}

const DARK = [false, false] as const
const LIT = [true, true] as const

/** Standing at ease, the tool held up in front. */
const STAND: Rig = {
  lift: 0,
  sy: 1,
  lie: 0,
  hip: HIP_Y,
  lean: 0,
  nod: 0,
  thigh: [-0.05, 0.05],
  knee: [0, 0],
  shoulder: [0.1, 0.22],
  elbow: [0.2, 1.1],
  tool: 0.3,
  eyes: 'open',
  mouth: false,
  flick: 0,
  fold: 0,
  lights: DARK,
}
/** Sitting on the floor, legs out in front like a small child, hands on the knees. */
const SIT: Rig = { ...STAND, hip: -0.11, thigh: [1.5, 1.56], knee: [0.2, 0.15], shoulder: [0.55, 0.6], elbow: [0.5, 0.45], tool: null }
/** Crouched to spring: hops, jumps and cheers start and land here. */
const CROUCH: Rig = { ...STAND, sy: 0.9, hip: -0.29, thigh: [0.3, 0.35], knee: [0.6, 0.7], shoulder: [-0.3, -0.2], elbow: [0.3, 0.6], tool: 0.15 }

const pair = (a: readonly [number, number], b: readonly [number, number], k: number) => [mix(a[0], b[0], k), mix(a[1], b[1], k)] as const
/** Two rigs mixed by k (0 is a, 1 is b); the face, the lights and the tool's hand come from the nearer one: a pose's keys, and a friend easing from one pose into another. */
export function mixRig(a: Rig, b: Rig, k: number): Rig {
  const near = k < 0.5 ? a : b
  return {
    lift: mix(a.lift, b.lift, k),
    sy: mix(a.sy, b.sy, k),
    lie: mix(a.lie, b.lie, k),
    hip: mix(a.hip, b.hip, k),
    lean: mix(a.lean, b.lean, k),
    nod: mix(a.nod, b.nod, k),
    thigh: pair(a.thigh, b.thigh, k),
    knee: pair(a.knee, b.knee, k),
    shoulder: pair(a.shoulder, b.shoulder, k),
    elbow: pair(a.elbow, b.elbow, k),
    tool: a.tool === null || b.tool === null ? near.tool : mix(a.tool, b.tool, k),
    eyes: near.eyes,
    mouth: near.mouth,
    flick: mix(a.flick, b.flick, k),
    fold: mix(a.fold, b.fold, k),
    lights: near.lights,
  }
}
/** A rig at `u` seconds from key rigs (time, rig), smoothstepped between neighbours, holding the last. */
function keyed(u: number, frames: readonly (readonly [number, Rig])[]): Rig {
  for (let i = 1; i < frames.length; i++) {
    const [t1, b] = frames[i]!
    const [t0, a] = frames[i - 1]!
    if (u < t1) return mixRig(a, b, smooth(t0, t1, u))
  }
  return frames[frames.length - 1]![1]
}

/** The hat's ears flicking `age` seconds after a success: a quick wobble that settles within 0.45 s (0 before and after). */
export function earFlick(age: number): number {
  if (!(age >= 0 && age < 0.45)) return 0
  return 0.35 * Math.sin(TAU * 4.4 * age) * (1 - age / 0.45)
}

/** The rig of `pose` at `u` seconds into it: looping poses by their period, one-shot poses held at their end. */
export function posed(pose: Pose, u: number): Rig {
  const v = held(u)
  const len = POSE_LENGTH[pose]
  const k = POSE_LOOPS[pose] ? loop(v, len, 0) : clamp01(v / len)
  const a = TAU * k
  const s = Math.sin(a)
  const c = Math.cos(a)
  // A blink every 3.7 s, 0.13 s long, in the calm poses.
  const blink = loop(v, 3.7, 0.3) > 0.965 ? 'closed' : 'open'
  switch (pose) {
    case 'stand':
      return { ...STAND, sy: 1 + 0.012 * s, nod: 0.03 * s, shoulder: [0.1 + 0.02 * s, 0.22], eyes: blink }
    case 'walk':
      // The near foot is planted (and its sole lit) while the far one swings, and the other way round.
      return {
        ...STAND,
        lift: -0.009 * (1 + Math.cos(2 * a)),
        lean: 0.05,
        nod: 0.02 * Math.cos(2 * a),
        thigh: [-0.42 * s, 0.42 * s],
        knee: [0.8 * Math.max(0, -c), 0.8 * Math.max(0, c)],
        shoulder: [0.1 + 0.45 * s, 0.25 - 0.18 * s],
        elbow: [0.35, 1.1],
        tool: 0.3 - 0.12 * s,
        eyes: blink,
        lights: [c > 0, c <= 0],
      }
    case 'run':
      // Too quick to blink by step within three changes a second: the lights stay on.
      return {
        ...STAND,
        lift: -0.025 * (1 + Math.cos(2 * a)) - 0.01,
        lean: 0.22,
        nod: -0.1,
        thigh: [-0.75 * s, 0.75 * s],
        knee: [0.25 + 1.2 * Math.max(0, -c), 0.25 + 1.2 * Math.max(0, c)],
        shoulder: [0.2 + 0.8 * s, 0.4 - 0.5 * s],
        elbow: [1.4, 1.3],
        tool: 0.7,
        mouth: true,
        fold: 0.25,
        lights: LIT,
      }
    case 'drive':
      return {
        ...STAND,
        hip: -0.19,
        lift: 0.006 * s,
        lean: -0.06,
        nod: 0.04 * Math.sin(2 * a),
        thigh: [1.45, 1.5],
        knee: [1.45, 1.5],
        shoulder: [1.05, 1.15],
        elbow: [0.55, 0.5],
        tool: null,
        eyes: blink,
      }
    case 'hit': {
      // At a boulder (taller than the builder, 0.4 m ahead) or a crate: the tool's head lands at hip height ahead.
      const ready: Rig = { ...STAND, thigh: [-0.22, 0.28], knee: [0.12, 0.18], shoulder: [0.2, 0.6], elbow: [0.3, 0.9], tool: 0.3 }
      const windUp: Rig = { ...ready, lean: -0.14, sy: 1.03, nod: -0.06, shoulder: [-0.4, 3.75], elbow: [0.3, 0.6], tool: -1.7 }
      const strike: Rig = { ...ready, lean: 0.24, sy: 0.94, nod: 0.12, shoulder: [0.5, 1.25], elbow: [0.4, 0.2], tool: 2.0, eyes: 'happy', mouth: true }
      const after: Rig = { ...ready, lean: 0.16, nod: 0.06, shoulder: [0.4, 1.05], elbow: [0.4, 0.3], tool: 1.75 }
      return keyed(v, [
        [0, ready],
        [0.17, windUp],
        [0.26, strike],
        [0.45, after],
      ])
    }
    case 'hammer': {
      // On the scaffold beside a new room, facing its wall: the hammer rises slowly in front of the hat's brim and knocks forward at head height.
      const rest: Rig = { ...STAND, hip: -0.31, thigh: [-0.22, 0.28], knee: [0.12, 0.2], shoulder: [0.75, 1.3], elbow: [0.7, 0.3], tool: 0.3 }
      const up: Rig = { ...rest, lean: -0.06, sy: 1.02, nod: -0.05, shoulder: [0.6, 1.95], elbow: [0.7, 0.55], tool: -0.6 }
      const knock: Rig = { ...rest, lean: 0.1, sy: 0.96, nod: 0.06, shoulder: [0.85, 1.3], elbow: [0.7, 0.22], tool: 0.45, eyes: 'happy', mouth: true }
      return keyed(k * len, [
        [0, rest],
        [0.24, up],
        [0.3, knock],
        [0.4, rest],
      ])
    }
    case 'lever': {
      const reach: Rig = { ...STAND, lean: 0.08, shoulder: [1.9, 2.05], elbow: [0.25, 0.2], tool: null }
      const pull: Rig = { ...reach, lean: -0.14, sy: 0.96, hip: -0.3, thigh: [-0.3, 0.22], knee: [0.25, 0.2], shoulder: [0.85, 0.95], elbow: [0.55, 0.5] }
      return keyed(v, [
        [0, { ...STAND, tool: null }],
        [0.12, reach],
        [0.36, pull],
        [0.6, { ...pull, sy: 1, lean: -0.06, eyes: 'happy', mouth: true }],
      ])
    }
    case 'hop': {
      const up: Rig = { ...STAND, lift: -0.17, sy: 1.06, thigh: [-0.2, 0.35], knee: [0.7, 0.6], shoulder: [4.1, 2.15], elbow: [-0.3, 0.15], tool: 0, eyes: 'happy', mouth: true, lights: LIT }
      const land: Rig = { ...CROUCH, sy: 0.92, eyes: 'happy', mouth: true, lights: LIT }
      const rig = keyed(v, [
        [0, STAND],
        [0.1, CROUCH],
        [0.25, up],
        [0.4, land],
        [0.5, { ...STAND, eyes: 'happy' }],
      ])
      return { ...rig, flick: earFlick(v - 0.05) }
    }
    case 'wave':
      // The near mitten waves just in front of the face, never over it.
      return {
        ...STAND,
        lean: 0.02 * s,
        nod: 0.05 * s,
        shoulder: [0.15, 1.75],
        elbow: [0.2, 0.45 + 0.25 * s],
        tool: null,
        eyes: 'happy',
        mouth: true,
      }
    case 'cheer': {
      // Both arms up in a V: the near one up in front of the face, the far one up behind the head.
      const up: Rig = { ...STAND, lift: -0.12, sy: 1.05, thigh: [-0.1, 0.15], knee: [0.3, 0.2], shoulder: [4.1, 2.15], elbow: [-0.3, 0.15], tool: 0, eyes: 'happy', mouth: true, lights: LIT }
      const down: Rig = { ...up, lift: 0, sy: 0.95, thigh: STAND.thigh, knee: STAND.knee }
      const rig = keyed(v, [
        [0, STAND],
        [0.15, { ...CROUCH, sy: 0.92 }],
        [0.35, up],
        [0.55, down],
        [0.9, { ...down, sy: 1, shoulder: [4.0, 2.1], lights: DARK }],
      ])
      return { ...rig, flick: earFlick(v - 0.3) }
    }
    case 'dance': {
      // Two beats a loop: the knees dip on each, the hips sway, the arms swap up and down, and the sneakers light one foot and then the other.
      const dip = 0.5 - 0.5 * Math.cos(2 * a)
      return {
        ...STAND,
        hip: HIP_Y + 0.025 * dip,
        sy: 1 - 0.03 * dip,
        lean: 0.1 * s,
        nod: 0.08 * Math.sin(2 * a),
        thigh: [-0.05 + 0.25 * dip, 0.05 + 0.3 * dip],
        knee: [0.5 * dip, 0.6 * dip],
        shoulder: [1.9 - 1.7 * s, 1.35 + 0.95 * s],
        elbow: [0.4, 0.3 - 0.2 * s],
        tool: null,
        eyes: 'happy',
        mouth: true,
        lights: [k < 0.5, k >= 0.5],
      }
    }
    case 'play':
      // Sitting at a toy on the floor past the feet, leaning in, the hands taking turns at it.
      return {
        ...SIT,
        lean: 0.24,
        nod: 0.12 + 0.04 * s,
        shoulder: [1.15 + 0.3 * s, 1.15 - 0.3 * s],
        elbow: [0.35, 0.35],
        eyes: k > 0.45 && k < 0.6 ? 'happy' : 'open',
        mouth: k > 0.45 && k < 0.75,
      }
    case 'jump': {
      const air: Rig = { ...STAND, lift: -0.25, sy: 1.05, thigh: [0.5, 0.6], knee: [0.9, 0.8], shoulder: [4.1, 2.15], elbow: [-0.3, 0.15], tool: null, eyes: 'happy', mouth: true, lights: LIT }
      return keyed(k * len, [
        [0, { ...STAND, tool: null }],
        [0.18, { ...CROUCH, tool: null }],
        [0.5, air],
        [0.85, { ...CROUCH, sy: 0.92, tool: null, eyes: 'happy', lights: LIT }],
        [1.2, { ...STAND, tool: null }],
      ])
    }
    case 'slide':
      // Sliding down on the seat, legs out straight, leaning back with the arms up: whee.
      return {
        ...SIT,
        hip: -0.11 - 0.01 * s,
        lean: -0.2,
        nod: -0.05 + 0.03 * s,
        thigh: [1.5, 1.55],
        knee: [0.05, 0.05],
        shoulder: [3.6 + 0.15 * s, 2.0 - 0.15 * s],
        elbow: [0.2, 0.25],
        eyes: 'happy',
        mouth: true,
      }
    case 'bounce': {
      const h = arch(k)
      return {
        ...STAND,
        lift: -0.2 * h,
        sy: k < 0.08 || k > 0.92 ? 0.93 : 1 + 0.04 * h,
        thigh: [-0.15 * h, 0.2 * h],
        knee: [0.3 * h, 0.4 * h],
        shoulder: [0.3 + 3.8 * h, 0.3 + 1.85 * h],
        elbow: [0.3 - 0.6 * h, 0.3 - 0.15 * h],
        tool: null,
        eyes: 'happy',
        mouth: h > 0.5,
        lights: h < 0.25 ? LIT : DARK,
      }
    }
    case 'sit':
      return { ...SIT, sy: 1 + 0.01 * s, nod: 0.04 * s, eyes: blink }
    case 'sleep':
      // Lying on the back, the head propped (a nod lifts it off the floor), one knee up, hands on the tummy, breathing slowly.
      return {
        ...STAND,
        lie: 1,
        lean: 0.025 * s,
        nod: 0.36 + 0.02 * s,
        thigh: [-0.3, 0.3],
        knee: [0, 1.2],
        shoulder: [0.5, 0.45],
        elbow: [2.0, 2.05],
        tool: null,
        eyes: 'closed',
        fold: 0.35,
      }
    case 'float':
      return {
        ...STAND,
        lift: -0.14 + 0.05 * s,
        lean: 0.12 * Math.sin(a + 1),
        nod: -0.05,
        thigh: [-0.3, 0.35],
        knee: [0.55, 0.35],
        shoulder: [3.9 + 0.15 * s, 1.65 - 0.15 * s],
        elbow: [-0.2, 0.2],
        tool: null,
        eyes: 'wide',
        mouth: true,
      }
  }
}

// ---------------------------------------------------------------------------------------
// The frames

/** The transform calls the rig's frames make: met by the canvas context, and by `affine` to find where the rig puts a point. */
interface Transform {
  translate(x: number, y: number): void
  rotate(a: number): void
  scale(x: number, y: number): void
}
/** A transform kept as numbers, to find where a point of the rig lands (the wand's trail follows its star). */
function affine() {
  let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0]
  return {
    translate(x: number, y: number) {
      e += a * x + c * y
      f += b * x + d * y
    },
    rotate(r: number) {
      const cs = Math.cos(r)
      const sn = Math.sin(r)
      ;[a, b, c, d] = [a * cs + c * sn, b * cs + d * sn, c * cs - a * sn, d * cs - b * sn]
    },
    scale(x: number, y: number) {
      a *= x
      b *= x
      c *= y
      d *= y
    },
    apply: (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f] as const,
  }
}
/** The whole figure: lifted, laid down by `lie`, and squashed about its feet. */
function bodyFrame(t: Transform, rig: Rig) {
  t.translate(LIE.x * rig.lie, rig.lift - LIE.y * rig.lie)
  t.rotate((-Math.PI / 2) * rig.lie)
  t.scale(1 / Math.sqrt(rig.sy), rig.sy)
}
/** The upper body inside the figure: leaned about the hips, raised or lowered with them. */
function upperFrame(t: Transform, rig: Rig) {
  t.translate(PIVOT_X, rig.hip)
  t.rotate(rig.lean)
  t.translate(-PIVOT_X, -HIP_Y)
}
/** The head inside the upper body: nodded about the neck. */
function nodFrame(t: Transform, rig: Rig) {
  t.translate(NECK.x, NECK.y)
  t.rotate(rig.nod)
  t.translate(-NECK.x, -NECK.y)
}

/** The rig's frames, outermost first: the whole figure, its upper body, its head. */
type RigFrame = 'body' | 'upper' | 'head'
/** Applies the rig's frames down to `frame`. */
function frameOf(t: Transform, rig: Rig, frame: RigFrame) {
  bodyFrame(t, rig)
  if (frame === 'body') return
  upperFrame(t, rig)
  if (frame === 'head') nodFrame(t, rig)
}
/**
 * Runs `draw` in one of the rig's frames as drawRig poses it, origin at the figure's feet:
 * 'body' is the whole figure lifted, laid down and squashed (the legs, a lap), 'upper' the
 * upper body leaned about the hips (the shirt, the arms, what the hands hold: `handAt`),
 * 'head' the head nodded about the neck (HEAD, MOUTH). What a friend holds or wears is drawn
 * in these, so it moves with the rig; no file copies the rig's measures.
 */
export function inRig(ctx: CanvasRenderingContext2D, rig: Rig, frame: RigFrame, draw: () => void): void {
  ctx.save()
  frameOf(ctx, rig, frame)
  draw()
  ctx.restore()
}
/** Where the point (x, y) of one of the rig's frames lands in the figure's own metres (feet at the origin, facing right): a wand's star, a hand seen from outside the rig. */
export function rigPoint(rig: Rig, frame: RigFrame, x: number, y: number): readonly [number, number] {
  const t = affine()
  frameOf(t, rig, frame)
  return t.apply(x, y)
}

// ---------------------------------------------------------------------------------------
// Drawing

/** One pass over the figure: what to draw with, how much, and whether this is the backing pass. */
interface Figure {
  ctx: CanvasRenderingContext2D
  look: Look
  rig: Rig
  lod: 'S' | 'M' | 'L'
  /** The hat's ears grow up to 40% when the head is small on screen. */
  earScale: number
  /** The head is under 18 CSS px: no inner-ear pink, no hat ridge. */
  tiny: boolean
  back: boolean
}

/** Fills the current path as a part (inked at the line weight), or in the backing pass strokes it wide so the edge weight shows outside. */
function fill(f: Figure, colour: string) {
  if (f.back) {
    f.ctx.lineWidth = 2 * lw('edge') - lw('line')
    f.ctx.strokeStyle = INK
    f.ctx.stroke()
  } else part(f.ctx, colour, 'line')
}
/** Strokes the current path `w` wide with round ends (look.ts `tube`) or square ones (`bar`), or in the backing pass their ink edge; the figure's strokes are round otherwise. */
function strokeWide(f: Figure, w: number, colour: string, cap: 'round' | 'butt') {
  const ctx = f.ctx
  if (f.back) {
    ctx.lineCap = cap
    ctx.lineWidth = w + 2 * lw('edge')
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineCap = 'round'
  } else if (cap === 'round') tube(ctx, w, colour)
  else bar(ctx, w, colour)
}
/** A limb, strap or handle: round ends. */
const limb = (f: Figure, w: number, colour: string) => strokeWide(f, w, colour, 'round')
/** A cuff or a shorts' leg: square ends. */
const band = (f: Figure, w: number, colour: string) => strokeWide(f, w, colour, 'butt')
/** Circles (x, y, r triples) as one blob (look.ts `blob`), or its backing. */
function curls(f: Figure, xyr: readonly number[], colour: string) {
  const ctx = f.ctx
  if (!f.back) {
    blob(ctx, xyr, colour, 'line')
    return
  }
  circlesPath(ctx, xyr)
  ctx.lineWidth = 2 * lw('edge')
  ctx.strokeStyle = INK
  ctx.stroke()
}
const dir = (a: number) => [Math.sin(a), Math.cos(a)] as const
/** A leg's joints for the rig: hip, knee, ankle, and the shin's angle. */
function legJoints(rig: Rig, side: Side) {
  const hx = HIPS[side]
  const hy = rig.hip
  const [tx, ty] = dir(rig.thigh[side])
  const kx = hx + tx * THIGH
  const ky = hy + ty * THIGH
  const shin = rig.thigh[side] - rig.knee[side]
  const [sx, sy] = dir(shin)
  return { hx, hy, kx, ky, ax: kx + sx * SHIN, ay: ky + sy * SHIN, shin }
}
/** An arm's joints in the upper body's frame: shoulder, elbow, hand, and the forearm's angle. */
function armJoints(rig: Rig, side: Side) {
  const sx = SHOULDERS[side]
  const sy = SHOULDER_Y
  const [ux, uy] = dir(rig.shoulder[side])
  const ex = sx + ux * UPPER
  const ey = sy + uy * UPPER
  const fore = rig.shoulder[side] + rig.elbow[side]
  const [fx, fy] = dir(fore)
  return { sx, sy, ex, ey, hx: ex + fx * FORE, hy: ey + fy * FORE, fore }
}
/** A hand of the rig (side 0 far, 1 near) in the upper body's frame (`inRig` 'upper'), and the forearm's angle from straight down: where a prop's grip goes. */
export function handAt(rig: Rig, side: Side): { x: number; y: number; angle: number } {
  const j = armJoints(rig, side)
  return { x: j.hx, y: j.hy, angle: j.fore }
}
/** The shoulder and elbow angles (as a Rig holds them) that put the hand of `side` at (x, y) in the upper body's frame, or reach as far towards it as the arm goes: a friend stirring a bowl or holding up a spoon. The arm's two bones are the same length. */
export function armTo(side: Side, x: number, y: number): [number, number] {
  const dx = x - SHOULDERS[side]
  const dy = y - SHOULDER_Y
  const d = Math.max(0.02, Math.min(Math.hypot(dx, dy), UPPER + FORE - 0.002))
  const inner = Math.acos(clamp01(d / (UPPER + FORE)))
  const base = Math.atan2(dx, dy)
  return [base - inner, 2 * inner]
}

const pantsColours = (look: Look) => (look.pants === 'jeans' ? DENIM : WEAR_LOOK[look.pantsColor])
/** The shirt's sleeves: under the vest a tee in the vest's own darker tint (so the arm stays part of the outfit), under a pinafore the white tee, long on a hoodie. */
function sleeveColours(look: Look): { base: string; dark: string } {
  const cloth = WEAR_LOOK[look.shirtColor]
  if (look.shirt === 'vest') return { base: cloth.dark, dark: cloth.dark }
  return look.shirt === 'dress' ? KIT.tee : cloth
}
/** The stripes' colour: white bands, the classic stripy top that still reads at street size (a darker tint vanishes there), and blue ones on a white shirt. */
const stripeColour = (look: Look) => (look.shirtColor === 'white' ? WEAR_LOOK.blue.base : WEAR_LOOK.white.base)
/** A skirt's or pinafore's hem: above the knees standing, and drawn up over the lap sitting so it rests on the floor rather than through it. */
const hemY = (rig: Rig) => -0.19 - 0.065 * clamp01((rig.hip - HIP_Y) / 0.2)
/** The builder wears the hat and owns the tool; friends have neither. */
const isPlayer = (look: Look) => look.hat !== 'none'

/** Runs `draw` in the upper body's frame (inside the figure's, which drawRig has set). */
function upper(f: Figure, draw: () => void) {
  f.ctx.save()
  upperFrame(f.ctx, f.rig)
  draw()
  f.ctx.restore()
}
/** Runs `draw` in the head's frame (inside the upper body's): nodded about the neck. */
function headFrame(f: Figure, draw: () => void) {
  upper(f, () => {
    f.ctx.save()
    nodFrame(f.ctx, f.rig)
    draw()
    f.ctx.restore()
  })
}

/** An arm: skin, its sleeve (short, or long on a hoodie with a cuff), and the mitten unless the tool's grip draws it later. */
function drawArm(f: Figure, side: Side, mitten: boolean) {
  const { ctx, look } = f
  const j = armJoints(f.rig, side)
  const skin = SKIN_TONES[look.skin]
  const cloth = sleeveColours(look)
  const sleeve = side === 0 ? cloth.dark : cloth.base
  const long = look.shirt === 'hoodie'
  ctx.beginPath()
  ctx.moveTo(j.sx, j.sy)
  ctx.lineTo(j.ex, j.ey)
  ctx.lineTo(j.hx, j.hy)
  limb(f, ARM_W, long ? sleeve : skin)
  ctx.beginPath()
  ctx.moveTo(j.sx, j.sy)
  if (long) {
    ctx.lineTo(j.ex, j.ey)
    ctx.lineTo(mix(j.ex, j.hx, 0.5), mix(j.ey, j.hy, 0.5))
    limb(f, ARM_W + 0.012, sleeve)
    if (f.lod !== 'S') {
      // The ribbed cuff.
      ctx.beginPath()
      ctx.moveTo(mix(j.ex, j.hx, 0.5), mix(j.ey, j.hy, 0.5))
      ctx.lineTo(mix(j.ex, j.hx, 0.62), mix(j.ey, j.hy, 0.62))
      band(f, ARM_W + 0.008, cloth.dark)
    }
  } else {
    ctx.lineTo(mix(j.sx, j.ex, 0.5), mix(j.sy, j.ey, 0.5))
    limb(f, ARM_W + 0.024, sleeve)
  }
  if (mitten) drawMitten(f, j.hx, j.hy)
}
function drawMitten(f: Figure, x: number, y: number) {
  circlePath(f.ctx, x, y, MITTEN)
  fill(f, SKIN_TONES[f.look.skin])
}
/** A mitten in `look`'s skin closed round a prop's grip at (x, y), k times the rig's own size (a far hand a little smaller), drawn as the rig draws its own so the hand holds the prop. */
export function mitten(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, k: number): void {
  circlePath(ctx, x, y, MITTEN * k)
  part(ctx, SKIN_TONES[look.skin], 'line')
}

/** A leg from the hip down, the shorts' leg, the jeans' cuff or the work trousers' knee pad over it, and its shoe. */
function drawLeg(f: Figure, side: Side) {
  const { ctx, look } = f
  const j = legJoints(f.rig, side)
  const pants = pantsColours(look)
  const cloth = side === 0 ? pants.dark : pants.base
  const bare = look.pants === 'shorts' || look.pants === 'skirt'
  const along = (k: number) => (k < 1 ? ([mix(j.hx, j.kx, k), mix(j.hy, j.ky, k)] as const) : ([mix(j.kx, j.ax, k - 1), mix(j.ky, j.ay, k - 1)] as const))
  /** A band over the leg from k0 to k1 (0 the hip, 1 the knee, 2 the ankle). */
  const piece = (k0: number, k1: number, w: number, colour: string) => {
    ctx.beginPath()
    ctx.moveTo(...along(k0))
    if (k0 < 1 && k1 > 1) ctx.lineTo(j.kx, j.ky)
    ctx.lineTo(...along(k1))
    band(f, w, colour)
  }
  ctx.beginPath()
  ctx.moveTo(j.hx, j.hy)
  ctx.lineTo(j.kx, j.ky)
  ctx.lineTo(j.ax, j.ay)
  limb(f, LEG_W, bare ? SKIN_TONES[look.skin] : cloth)
  // Under a pinafore the trousers are leggings: no shorts' legs, no cuffs, no pads.
  if (look.shirt !== 'dress') {
    // The shorts' leg ends square, well above the knee, so the knee shows.
    if (look.pants === 'shorts') piece(0, 0.6, LEG_W + 0.026, cloth)
    if (look.pants === 'work' && !f.back) {
      // A round knee pad on the front of the knee, small enough that the trousers show round it.
      ctx.beginPath()
      ctx.ellipse(j.kx + 0.018, j.ky, 0.042, 0.034, j.shin, 0, TAU)
      part(ctx, KIT.pad, 'detail')
    }
    // The turned-up cuff: a light band of the jeans' inside, wider than the leg, sitting on the shoe (tall boots take the jeans inside).
    const top = SHOE_TOP[look.shoes]
    if (look.pants === 'jeans' && top < 0.1) piece(2 - (top + 0.042) / SHIN, 2 - (top - 0.004) / SHIN, LEG_W + 0.026, DENIM.light)
  }
  drawShoe(f, j.ax, j.ay, -j.shin * 0.7, side)
}

/** A shoe at the ankle (x, y), turned by `rot`; its sole is 0.05 below the ankle, its toe 0.14 ahead. */
function drawShoe(f: Figure, x: number, y: number, rot: number, side: Side) {
  const { ctx, look } = f
  const paint = !f.back
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  /** The shoe's upper: a shaft up to `top`, a round toe (pointed for cowboy boots). */
  const body = (top: number, colour: string, pointed: boolean) => {
    ctx.beginPath()
    ctx.moveTo(-0.058, top)
    ctx.lineTo(0.04, top)
    ctx.lineTo(0.045, -0.012)
    if (pointed) {
      ctx.quadraticCurveTo(0.11, -0.012, 0.16, 0.024)
      ctx.lineTo(0.155, 0.03)
    } else ctx.quadraticCurveTo(0.138, -0.024, 0.14, 0.03)
    ctx.lineTo(-0.06, 0.03)
    ctx.closePath()
    fill(f, colour)
  }
  /** The sole under it, `h` thick. */
  const sole = (colour: string, h: number) => {
    roundRectPath(ctx, -0.068, 0.052 - h, 0.214, h, h / 2)
    fill(f, colour)
  }
  switch (look.shoes) {
    case 'boots':
      body(-SHOE_TOP.boots + 0.013, KIT.boot, false)
      sole(KIT.bootSole, 0.032)
      if (paint) {
        // The padded collar, and from M the toe cap's seam and two eyelets.
        roundRectPath(ctx, -0.062, -SHOE_TOP.boots, 0.108, 0.028, 0.012)
        part(ctx, KIT.bootSole, 'detail')
        if (f.lod !== 'S') {
          ctx.beginPath()
          ctx.moveTo(0.082, 0.02)
          ctx.quadraticCurveTo(0.072, -0.004, 0.1, -0.016)
          ink(ctx, 'detail')
          for (const ly of [-0.044, -0.022]) {
            circlePath(ctx, 0.026, ly, 0.008)
            ctx.fillStyle = KIT.lace
            ctx.fill()
          }
        }
      }
      break
    case 'sneakers':
    case 'lights': {
      const glow = look.shoes === 'lights'
      body(-SHOE_TOP[look.shoes], glow ? KIT.glowShoe : KIT.sneaker, false)
      sole(glow ? KIT.glowSole : KIT.sneakerSole, 0.03)
      if (paint) {
        if (glow) {
          // Three lights along the sole, lit on this foot's steps.
          const lit = f.rig.lights[side]
          for (const lx of [-0.03, 0.03, 0.09]) {
            circlePath(ctx, lx, 0.037, lit ? 0.016 : 0.011)
            ctx.fillStyle = lit ? KIT.glowOn : KIT.glowOff
            ctx.fill()
          }
        } else {
          // A bold toe cap and a stripe in the trim colour: the mark that names them at any size.
          ctx.beginPath()
          ctx.moveTo(0.072, 0.03)
          ctx.quadraticCurveTo(0.068, -0.012, 0.098, -0.018)
          ctx.quadraticCurveTo(0.136, -0.012, 0.14, 0.03)
          ctx.closePath()
          part(ctx, KIT.sneakerTrim, 'detail')
          ctx.beginPath()
          ctx.moveTo(-0.04, 0.016)
          ctx.lineTo(0.03, -0.022)
          ctx.lineCap = 'round'
          ctx.lineWidth = 0.016
          ctx.strokeStyle = KIT.sneakerTrim
          ctx.stroke()
        }
      }
      break
    }
    case 'wellies':
      body(-SHOE_TOP.wellies + 0.015, KIT.welly, false)
      sole(KIT.bootSole, 0.024)
      if (paint) {
        roundRectPath(ctx, -0.064, -SHOE_TOP.wellies, 0.112, 0.03, 0.012)
        part(ctx, KIT.wellyRim, 'detail')
        shine(ctx, 0.0, -0.055, 0.07)
      }
      break
    case 'cowboy':
      body(-SHOE_TOP.cowboy + 0.02, KIT.cowboy, true)
      // The heel block, and the scalloped top of the shaft.
      ctx.beginPath()
      ctx.rect(-0.062, 0.022, 0.05, 0.032)
      fill(f, KIT.cowboyDark)
      ctx.beginPath()
      ctx.moveTo(-0.062, -0.1)
      ctx.lineTo(-0.062, -SHOE_TOP.cowboy)
      ctx.quadraticCurveTo(-0.01, -SHOE_TOP.cowboy + 0.03, 0.044, -SHOE_TOP.cowboy)
      ctx.lineTo(0.044, -0.1)
      ctx.closePath()
      fill(f, KIT.cowboyDark)
      if (paint) {
        starPath(ctx, -0.008, -0.05, f.lod === 'S' ? 0.034 : 0.026)
        part(ctx, KIT.star, 'detail')
      }
      break
  }
  ctx.restore()
}

/** The torso in the shirt and its marks, a hoodie's hood, a pinafore over a tee, and the bag's strap. */
function drawShirt(f: Figure) {
  const { ctx, look } = f
  const paint = !f.back
  const cloth = WEAR_LOOK[look.shirtColor]
  const t = TORSO
  if (look.shirt === 'hoodie' && f.rig.lie < 0.5) {
    // The hood, lying on the back behind the neck: a round hump the whole silhouette shows (under a sleeper, on the floor).
    ctx.beginPath()
    ctx.ellipse(t.x + 0.035, t.y + 0.035, 0.105, 0.08, -0.35, 0, TAU)
    fill(f, cloth.base)
    if (paint) {
      ctx.beginPath()
      ctx.ellipse(t.x + 0.05, t.y + 0.03, 0.06, 0.04, -0.35, 0, TAU)
      part(ctx, cloth.dark, 'detail')
    }
  }
  roundRectPath(ctx, t.x, t.y, t.w, t.h + (look.shirt === 'hoodie' ? 0.02 : 0), t.r)
  fill(f, look.shirt === 'dress' ? KIT.tee.base : cloth.base)
  switch (look.shirt) {
    case 'vest':
      if (!paint) break
      // The hi-vis vest: the tee's V at the neck, two silver bands, and from M the zip.
      ctx.beginPath()
      ctx.moveTo(0.02, t.y + 0.004)
      ctx.lineTo(0.14, t.y + 0.004)
      ctx.lineTo(0.085, t.y + 0.1)
      ctx.closePath()
      part(ctx, cloth.dark, 'detail')
      for (const by of [-0.51, -0.41]) {
        ctx.beginPath()
        ctx.rect(t.x, by, t.w, 0.045)
        ctx.fillStyle = KIT.reflect
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(t.x, by)
        ctx.lineTo(t.x + t.w, by)
        ctx.moveTo(t.x, by + 0.045)
        ctx.lineTo(t.x + t.w, by + 0.045)
        ink(ctx, 'detail')
      }
      if (f.lod !== 'S') {
        ctx.beginPath()
        ctx.moveTo(0.085, t.y + 0.1)
        ctx.lineTo(0.085, t.y + t.h)
        ink(ctx, 'detail')
      }
      break
    case 'stripes':
      if (!paint) break
      for (const by of [-0.59, -0.495, -0.4]) {
        ctx.beginPath()
        ctx.rect(t.x + 0.004, by, t.w - 0.008, 0.052)
        ctx.fillStyle = stripeColour(look)
        ctx.fill()
      }
      break
    case 'star':
      if (!paint) break
      // On the middle of the torso, where the near arm hanging in front leaves it showing.
      starPath(ctx, -0.035, -0.47, f.lod === 'S' ? 0.115 : 0.1)
      part(ctx, look.shirtColor === 'yellow' ? C.white : KIT.star, 'detail')
      break
    case 'hoodie':
      if (!paint) break
      // The hem's band, and from M the pocket and two strings.
      ctx.beginPath()
      ctx.rect(t.x + 0.004, t.y + t.h - 0.015, t.w - 0.008, 0.03)
      ctx.fillStyle = cloth.dark
      ctx.fill()
      if (f.lod !== 'S') {
        roundRectPath(ctx, -0.02, -0.44, 0.16, 0.1, 0.035)
        part(ctx, cloth.dark, 'detail')
        ctx.beginPath()
        ctx.moveTo(0.07, t.y + 0.02)
        ctx.lineTo(0.072, t.y + 0.12)
        ctx.moveTo(0.12, t.y + 0.02)
        ctx.lineTo(0.125, t.y + 0.11)
        ctx.lineCap = 'round'
        ink(ctx, 'detail')
      }
      break
    case 'dress': {
      // The pinafore over the tee: a flared skirt from the waist to above the knees, a bib on the chest and straps over the shoulders.
      const hem = hemY(f.rig) - 0.01
      ctx.beginPath()
      ctx.moveTo(t.x + 0.01, -0.43)
      ctx.lineTo(t.x + t.w - 0.01, -0.43)
      ctx.lineTo(t.x + t.w + 0.075, hem)
      ctx.quadraticCurveTo(PIVOT_X + 0.02, hem + 0.035, t.x - 0.065, hem)
      ctx.closePath()
      fill(f, cloth.base)
      roundRectPath(ctx, -0.005, -0.56, 0.15, 0.15, 0.025)
      fill(f, cloth.base)
      ctx.beginPath()
      ctx.moveTo(0.005, -0.55)
      ctx.lineTo(-0.085, t.y + 0.012)
      ctx.moveTo(0.13, -0.55)
      ctx.lineTo(0.115, t.y + 0.012)
      limb(f, 0.028, cloth.base)
      if (paint) {
        for (const bx of [0.012, 0.123]) {
          circlePath(ctx, bx, -0.535, 0.014)
          part(ctx, C.white, 'detail')
        }
        if (f.lod !== 'S') {
          // A big pocket on the skirt, and a heart on the bib.
          heartPath(ctx, 0.07, -0.485, 0.06)
          part(ctx, cloth.dark, 'detail')
          ctx.beginPath()
          ctx.moveTo(-0.13, hem - 0.07)
          ctx.quadraticCurveTo(-0.02, hem - 0.05, 0.1, hem - 0.07)
          ink(ctx, 'detail')
        }
      }
      break
    }
    case 'tee':
      if (paint && f.lod !== 'S') {
        ctx.beginPath()
        ctx.arc(0.07, t.y - 0.02, 0.06, 0.35, Math.PI - 0.35)
        ink(ctx, 'detail')
      }
      break
  }
  if (look.bag !== 'none' && f.rig.lie < 0.5) {
    // The bag's strap over the shoulder; the teddy hugs instead, its arm over the shoulder and a paw on the chest.
    ctx.beginPath()
    ctx.moveTo(-0.1, t.y + 0.01)
    ctx.quadraticCurveTo(-0.03, t.y + 0.04, -0.015, t.y + 0.22)
    limb(f, look.bag === 'teddy' ? 0.05 : 0.032, bagColour(look))
    if (look.bag === 'teddy') {
      circlePath(ctx, -0.012, t.y + 0.23, 0.035)
      fill(f, KIT.teddy)
    }
  }
}

/** The trousers' seat and belt, a dungarees' bib, a skirt; under a pinafore only the legs show. */
function drawTrousers(f: Figure) {
  const { ctx, look } = f
  if (look.shirt === 'dress') return
  const pants = pantsColours(look)
  const s = SEAT
  if (look.pants === 'skirt') {
    const hem = hemY(f.rig)
    ctx.beginPath()
    ctx.moveTo(s.x + 0.005, s.y)
    ctx.lineTo(s.x + s.w - 0.005, s.y)
    ctx.lineTo(s.x + s.w + 0.07, hem)
    ctx.quadraticCurveTo(PIVOT_X + 0.02, hem + 0.04, s.x - 0.065, hem)
    ctx.closePath()
    fill(f, pants.base)
    if (!f.back) {
      // The waistband, and from M two big pleats.
      ctx.beginPath()
      ctx.rect(s.x + 0.006, s.y + 0.002, s.w - 0.012, 0.026)
      ctx.fillStyle = pants.dark
      ctx.fill()
      if (f.lod !== 'S') {
        ctx.beginPath()
        ctx.moveTo(-0.045, s.y + 0.03)
        ctx.lineTo(-0.08, hem - 0.01)
        ctx.moveTo(0.075, s.y + 0.03)
        ctx.lineTo(0.105, hem - 0.005)
        ink(ctx, 'detail')
      }
    }
    return
  }
  roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r)
  fill(f, pants.base)
  if (look.pants === 'dungarees') {
    // The bib over the chest, its straps over the shoulders and two buttons: all of it at every size.
    roundRectPath(ctx, -0.04, -0.53, 0.185, 0.2, 0.03)
    fill(f, pants.base)
    ctx.beginPath()
    ctx.moveTo(-0.03, -0.52)
    ctx.lineTo(-0.105, TORSO.y + 0.012)
    ctx.moveTo(0.135, -0.52)
    ctx.lineTo(0.12, TORSO.y + 0.012)
    limb(f, 0.028, pants.base)
    if (f.back) return
    for (const bx of [-0.018, 0.122]) {
      circlePath(ctx, bx, -0.505, 0.015)
      part(ctx, KIT.buckle, 'detail')
    }
    if (f.lod !== 'S') {
      roundRectPath(ctx, 0.005, -0.475, 0.095, 0.07, 0.015)
      part(ctx, pants.dark, 'detail')
    }
    return
  }
  if (f.back || f.lod === 'S') return
  // A belt (a waistband on shorts and work trousers); at L a buckle; work trousers' side pocket.
  ctx.beginPath()
  ctx.rect(s.x + 0.004, s.y + 0.004, s.w - 0.008, 0.028)
  ctx.fillStyle = look.pants === 'jeans' ? KIT.belt : pants.dark
  ctx.fill()
  if (f.lod === 'L' && look.pants === 'jeans') {
    roundRectPath(ctx, 0.06, s.y, 0.05, 0.036, 0.008)
    part(ctx, KIT.buckle, 'detail')
  }
  if (look.pants === 'work') {
    roundRectPath(ctx, -0.11, s.y + 0.042, 0.085, 0.07, 0.014)
    part(ctx, pants.dark, 'detail')
  }
}

/** The bag's strap colour. */
function bagColour(look: Look): string {
  switch (look.bag) {
    case 'school':
      return KIT.schoolDark
    case 'teddy':
      return KIT.teddy
    case 'toolbox':
      return KIT.toolbox.side
    case 'jetpack':
    case 'cat':
    case 'none':
      return KIT.steelDark
  }
}

/**
 * The bag on the back, behind the torso. 'back' is the bag itself; 'top' is what peeks
 * over the shoulder, drawn after the back hair so long hair never hides it: the teddy's
 * head. Animals on a bag look back over the builder's shoulder (mirrored face kit).
 */
function drawBag(f: Figure, layer: 'back' | 'top') {
  const { ctx, look, rig } = f
  const paint = !f.back
  /** A face kit face looking back (left), centred at (x, y) on a face of colour `face`: eyes `size` tall. */
  const backFace = (x: number, y: number, size: number, gap: number, mood: 'open' | 'happy', face: string) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(-1, 1)
    eyes(ctx, gap / 2, 0, size, gap, mood, face)
    ctx.restore()
  }
  switch (look.bag) {
    case 'none':
      return
    case 'school':
      if (layer === 'top') return
      // A tall soft bag, a pocket bulging out at the back, its flap with a buckle.
      roundRectPath(ctx, -0.32, -0.63, 0.2, 0.3, 0.07)
      fill(f, KIT.school)
      roundRectPath(ctx, -0.35, -0.5, 0.12, 0.15, 0.045)
      fill(f, KIT.schoolDark)
      if (paint) {
        ctx.beginPath()
        ctx.moveTo(-0.315, -0.565)
        ctx.quadraticCurveTo(-0.22, -0.53, -0.125, -0.57)
        ctx.lineTo(-0.125, -0.6)
        ctx.quadraticCurveTo(-0.13, -0.63, -0.18, -0.63)
        ctx.lineTo(-0.26, -0.63)
        ctx.quadraticCurveTo(-0.315, -0.63, -0.315, -0.59)
        ctx.closePath()
        part(ctx, KIT.schoolDark, 'detail')
        roundRectPath(ctx, -0.235, -0.56, 0.035, 0.035, 0.008)
        part(ctx, KIT.buckle, 'detail')
      }
      return
    case 'teddy': {
      const hx = -0.215
      const hy = -0.665
      if (layer === 'back') {
        // The teddy's body on the back, a light tummy and two feet.
        for (const fx of [-0.3, -0.19]) {
          circlePath(ctx, fx, -0.34, 0.035)
          fill(f, KIT.teddy)
        }
        roundRectPath(ctx, -0.33, -0.57, 0.21, 0.24, 0.095)
        fill(f, KIT.teddy)
        if (paint) {
          ctx.beginPath()
          ctx.ellipse(-0.245, -0.45, 0.06, 0.07, 0, 0, TAU)
          ctx.fillStyle = KIT.teddyLight
          ctx.fill()
        }
        return
      }
      // Its head over the shoulder: round ears, a muzzle, a nose, looking back.
      for (const [ex, ey] of [
        [hx - 0.065, hy - 0.06],
        [hx + 0.06, hy - 0.07],
      ] as const) {
        circlePath(ctx, ex, ey, 0.034)
        fill(f, KIT.teddy)
        if (paint && f.lod !== 'S') {
          circlePath(ctx, ex, ey, 0.016)
          ctx.fillStyle = KIT.teddyLight
          ctx.fill()
        }
      }
      circlePath(ctx, hx, hy, 0.085)
      fill(f, KIT.teddy)
      if (paint) {
        ctx.beginPath()
        ctx.ellipse(hx - 0.03, hy + 0.028, 0.038, 0.03, 0, 0, TAU)
        ctx.fillStyle = KIT.teddyLight
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(hx - 0.04, hy + 0.012, 0.014, 0.01, 0, 0, TAU)
        ctx.fillStyle = INK
        ctx.fill()
        backFace(hx + 0.005, hy - 0.02, f.lod === 'S' ? 0.03 : 0.024, 0.05, 'open', KIT.teddy)
      }
      return
    }
    case 'toolbox': {
      if (layer === 'top') return
      // A red box with a steel handle and latch: a made thing, so a box with faces.
      const [x, y, w, h, d] = [-0.35, -0.56, 0.22, 0.22, 0.045] as const
      ctx.beginPath()
      ctx.moveTo(x + 0.06, y - d - 0.035)
      ctx.lineTo(x + 0.06, y - d)
      ctx.moveTo(x + 0.16, y - d)
      ctx.lineTo(x + 0.16, y - d - 0.035)
      ctx.lineTo(x + 0.06, y - d - 0.035)
      limb(f, 0.022, KIT.steel)
      if (f.back) {
        ctx.beginPath()
        ctx.moveTo(x, y + h)
        ctx.lineTo(x, y)
        ctx.lineTo(x + d, y - d)
        ctx.lineTo(x + w + d, y - d)
        ctx.lineTo(x + w + d, y + h - d)
        ctx.lineTo(x + w, y + h)
        ctx.closePath()
        fill(f, KIT.toolbox.face)
        return
      }
      box(ctx, x, y, w, h, KIT.toolbox, d, true, true, 'line')
      ctx.beginPath()
      ctx.moveTo(x, y + 0.07)
      ctx.lineTo(x + w, y + 0.07)
      ink(ctx, 'detail')
      roundRectPath(ctx, x + 0.085, y + 0.05, 0.05, 0.045, 0.01)
      part(ctx, KIT.steel, 'detail')
      return
    }
    case 'jetpack': {
      if (layer === 'top') return
      // Two tanks, the far one behind and higher, red domed caps, nozzles; off the ground each fires a flame with a puff below.
      const fire = clamp01((-rig.lift - JET_LIFT) / 0.15)
      for (const [tx, ty, colour] of [
        [-0.37, -0.68, KIT.tankFar],
        [-0.28, -0.65, KIT.tank],
      ] as const) {
        const w = 0.095
        const bottom = ty + 0.3
        if (paint && fire > 0) {
          const h = 0.06 + 0.16 * fire
          ctx.beginPath()
          ctx.moveTo(tx + 0.012, bottom + 0.04)
          ctx.quadraticCurveTo(tx + w / 2, bottom + 0.04 + h * 1.7, tx + w - 0.012, bottom + 0.04)
          ctx.closePath()
          part(ctx, KIT.flame, 'detail')
          ctx.beginPath()
          ctx.moveTo(tx + 0.03, bottom + 0.04)
          ctx.quadraticCurveTo(tx + w / 2, bottom + 0.04 + h, tx + w - 0.03, bottom + 0.04)
          ctx.closePath()
          ctx.fillStyle = KIT.flameHot
          ctx.fill()
          const r = 0.022 + 0.03 * fire
          blob(ctx, [tx + w / 2 - r * 0.7, bottom + 0.06 + h * 1.5, r, tx + w / 2 + r * 0.8, bottom + 0.05 + h * 1.6, r * 0.8], C.cloud, 'detail')
        }
        ctx.beginPath()
        ctx.moveTo(tx + 0.02, bottom - 0.01)
        ctx.lineTo(tx + w - 0.02, bottom - 0.01)
        ctx.lineTo(tx + w - 0.01, bottom + 0.04)
        ctx.lineTo(tx + 0.01, bottom + 0.04)
        ctx.closePath()
        fill(f, KIT.steelDark)
        roundRectPath(ctx, tx, ty, w, 0.3, w / 2)
        fill(f, colour)
        ctx.beginPath()
        ctx.arc(tx + w / 2, ty + w / 2, w / 2, Math.PI, TAU)
        ctx.closePath()
        fill(f, KIT.tankCap)
        if (paint) shine(ctx, tx + w / 2, ty + 0.12, w * 0.55)
      }
      return
    }
    case 'cat': {
      if (layer === 'top') return
      // A bag shaped like a cat's head: two ears on top, a white muzzle, eyes looking back.
      // Low enough on the back that both ears stand clear of the builder's head and hair.
      for (const [ex, lean] of [
        [-0.335, -0.012],
        [-0.205, 0.008],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(ex - 0.042, -0.56)
        ctx.lineTo(ex + lean, -0.675)
        ctx.lineTo(ex + 0.042, -0.56)
        ctx.closePath()
        fill(f, KIT.catBag)
        if (paint && !f.tiny) {
          ctx.beginPath()
          ctx.moveTo(ex - 0.02, -0.575)
          ctx.lineTo(ex + lean * 0.7, -0.64)
          ctx.lineTo(ex + 0.02, -0.575)
          ctx.closePath()
          ctx.fillStyle = C.innerEar
          ctx.fill()
        }
      }
      roundRectPath(ctx, -0.37, -0.61, 0.24, 0.28, 0.1)
      fill(f, KIT.catBag)
      if (paint) {
        ctx.beginPath()
        ctx.ellipse(-0.27, -0.44, 0.07, 0.05, 0, 0, TAU)
        ctx.fillStyle = KIT.catBagLight
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(-0.285, -0.475)
        ctx.lineTo(-0.255, -0.475)
        ctx.lineTo(-0.27, -0.46)
        ctx.closePath()
        ctx.fillStyle = C.innerEar
        ctx.fill()
        backFace(-0.265, -0.525, f.lod === 'S' ? 0.04 : 0.034, 0.075, 'happy', KIT.catBag)
      }
      return
    }
  }
}

/** The head: the skull and face, the hair over it, the ear, the glasses and the hat. */
function drawHead(f: Figure) {
  const { ctx, look, rig } = f
  const paint = !f.back
  const skin = SKIN_TONES[look.skin]
  circlePath(ctx, HEAD.x, HEAD.y, HEAD.r)
  fill(f, skin)
  if (paint) {
    const small = f.lod === 'S'
    eyes(ctx, EYE.x, EYE.y, EYE.size * (small ? 1.25 : 1), EYE.gap, rig.eyes, skin)
    if (!small) {
      blush(ctx, EYE.x + 0.035, HEAD.y + 0.07, 0.034)
      blush(ctx, EYE.x - EYE.gap - 0.025, HEAD.y + 0.07, 0.024)
    }
    smile(ctx, MOUTH.x, MOUTH.y, small ? 0.08 : 0.065, rig.mouth, skin)
  }
  drawHair(f, 'front')
  if (look.hair !== 'long' && look.hair !== 'curly') {
    // The ear on the hairline: an upright oval, and from M its rim's curve at the back.
    ctx.beginPath()
    ctx.ellipse(EAR.x, EAR.y, EAR.rx, EAR.ry, EAR.tilt, 0, TAU)
    fill(f, skin)
    if (paint && f.lod !== 'S') {
      ctx.beginPath()
      ctx.ellipse(EAR.x + 0.006, EAR.y + 0.002, EAR.rx * 0.5, EAR.ry * 0.58, EAR.tilt, Math.PI * 0.55, Math.PI * 1.4)
      ctx.lineCap = 'round'
      ink(ctx, 'detail')
    }
  }
  drawGlasses(f)
  if (look.hat !== 'none') drawHat(f)
}

/**
 * The hair. Every style is designed from the hat's brim down: under the hat the back, the
 * nape and a fringe under the brim show, each style with its own shape there, and a friend
 * (no hat) shows the whole of it. 'back' is what hangs behind the body (long hair, a
 * ponytail, a braid, puffs, curls at the nape); 'front' is the cap over the skull and what
 * falls beside the face.
 */
function drawHair(f: Figure, layer: 'back' | 'front') {
  const { ctx, look, rig } = f
  const colour = HAIR_LOOK[look.hairColor]
  const hat = look.hat !== 'none'
  const { x: hx, y: hy, r } = HEAD
  // Hair swings back against a lean.
  const swing = Math.max(-0.07, Math.min(0.07, -rig.lean * 0.5))
  /**
   * The cap: from the nape round the back and over the top to the forehead, a fringe under
   * the brim, and the hairline down in front of the ear. `rise` lifts it off the skull;
   * spikes zigzag its back and top; a curtain (long hair) falls past the ear to the jaw.
   */
  const cap = (rise: number, top: 'smooth' | 'spikes', fringe: 'soft' | 'spiky', curtain: boolean) => {
    const R = r + rise
    ctx.beginPath()
    ctx.moveTo(hx - (curtain ? 0.06 : 0.085), hy + (curtain ? 0.28 : 0.165))
    if (top === 'spikes') {
      const n = 11
      for (let i = 0; i <= n; i++) {
        const a = 2.1 + ((5.55 - 2.1) * i) / n
        const rr = i % 2 === 0 ? R : R + 0.075
        ctx.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr)
      }
    } else ctx.arc(hx, hy, R, 2.1, 5.55)
    if (fringe === 'spiky') {
      ctx.lineTo(hx + 0.17, hy - 0.07)
      ctx.lineTo(hx + 0.12, hy - 0.1)
      ctx.lineTo(hx + 0.1, hy - 0.04)
      ctx.lineTo(hx + 0.06, hy - 0.09)
      ctx.lineTo(hx + 0.03, hy - 0.03)
      ctx.lineTo(hx + 0.0, hy - 0.08)
    } else {
      ctx.quadraticCurveTo(hx + 0.13, hy - 0.075, hx + 0.08, hy - 0.07)
      ctx.quadraticCurveTo(hx + 0.05, hy - 0.04, hx + 0.02, hy - 0.08)
    }
    if (curtain) {
      ctx.quadraticCurveTo(hx - 0.07, hy - 0.03, hx - 0.06, hy + 0.13)
      ctx.quadraticCurveTo(hx - 0.055, hy + 0.23, hx - 0.06, hy + 0.28)
    } else {
      ctx.quadraticCurveTo(hx - 0.04, hy - 0.04, hx - 0.06, hy + 0.04)
      ctx.quadraticCurveTo(hx - 0.07, hy + 0.12, hx - 0.085, hy + 0.165)
    }
    ctx.closePath()
    fill(f, colour)
  }
  /** A braid hanging from (bx, by): four beads, swinging, and a tie at the end. */
  const braid = (bx: number, by: number) => {
    const xyr: number[] = []
    for (let i = 0; i < 4; i++) xyr.push(bx + swing * i * 0.35, by + i * 0.062, 0.04 - i * 0.003)
    curls(f, xyr, colour)
    circlePath(ctx, bx + swing * 1.3, by + 0.245, 0.024)
    fill(f, KIT.hairTie)
  }
  switch (look.hair) {
    case 'short':
      if (layer === 'back') return
      cap(0.022, 'smooth', 'soft', false)
      if (!hat) {
        // A tuft standing up on top.
        ctx.beginPath()
        ctx.moveTo(hx - 0.07, hy - r - 0.01)
        ctx.quadraticCurveTo(hx - 0.06, hy - r - 0.09, hx + 0.03, hy - r - 0.08)
        ctx.quadraticCurveTo(hx - 0.01, hy - r - 0.04, hx + 0.02, hy - r + 0.01)
        ctx.closePath()
        fill(f, colour)
      }
      return
    case 'spiky':
      if (layer === 'back') {
        if (!hat) return
        // Spikes poking out under the brim at the back.
        ctx.beginPath()
        ctx.moveTo(hx - 0.14, hy - 0.11)
        ctx.lineTo(hx - 0.28, hy - 0.08)
        ctx.lineTo(hx - 0.2, hy - 0.03)
        ctx.lineTo(hx - 0.29, hy + 0.03)
        ctx.lineTo(hx - 0.19, hy + 0.05)
        ctx.lineTo(hx - 0.25, hy + 0.12)
        ctx.lineTo(hx - 0.13, hy + 0.1)
        ctx.closePath()
        fill(f, colour)
        return
      }
      cap(0.02, hat ? 'smooth' : 'spikes', 'spiky', false)
      return
    case 'curly': {
      if (layer === 'back') {
        // Curls down to the neck behind.
        curls(f, [hx - 0.14, hy + 0.12, 0.075, hx - 0.06, hy + 0.17, 0.065], colour)
        return
      }
      // A ring of curls round the back and over the top to a curly fringe; under the hat the brim cuts it, and curls stick out below.
      const ring: number[] = []
      const n = 10
      for (let i = 0; i < n; i++) {
        const a = 1.95 + (3.7 * i) / (n - 1)
        const front = i >= n - 2
        ring.push(hx + Math.cos(a) * (r + (front ? -0.02 : 0.015)), hy + Math.sin(a) * (r + (front ? -0.02 : 0.015)), front ? 0.055 : 0.078)
      }
      curls(f, ring, colour)
      if (!f.back && f.lod !== 'S') {
        ctx.beginPath()
        for (const [cx, cy] of [
          [hx - 0.13, hy - 0.02],
          [hx - 0.04, hy - 0.16],
          [hx - 0.16, hy + 0.1],
        ] as const) {
          ctx.moveTo(cx + 0.03, cy)
          ctx.arc(cx, cy, 0.03, 0, Math.PI * 1.3)
        }
        ink(ctx, 'detail')
      }
      return
    }
    case 'long':
      if (layer === 'back') {
        // A sheet down the back to the shoulder blades, its ends flicking out.
        ctx.beginPath()
        ctx.moveTo(hx - 0.12, hy - 0.15)
        ctx.quadraticCurveTo(hx - 0.27, hy - 0.05, hx - 0.25 + swing * 0.6, hy + 0.2)
        ctx.quadraticCurveTo(hx - 0.25 + swing, hy + 0.3, hx - 0.29 + swing, hy + 0.36)
        ctx.quadraticCurveTo(hx - 0.15 + swing, hy + 0.39, hx - 0.03 + swing * 0.5, hy + 0.32)
        ctx.lineTo(hx + 0.0, hy + 0.05)
        ctx.closePath()
        fill(f, colour)
        return
      }
      cap(0.025, 'smooth', 'soft', true)
      return
    case 'ponytail':
      if (layer === 'back') {
        // A tail from under the brim (from the crown with no hat), swinging, with a tie at its root.
        const bx = hx - 0.17
        const by = hat ? hy - 0.05 : hy - 0.13
        ctx.beginPath()
        ctx.moveTo(bx + 0.03, by - 0.045)
        ctx.quadraticCurveTo(bx - 0.17 + swing * 0.5, by - 0.02, bx - 0.13 + swing, by + 0.2)
        ctx.quadraticCurveTo(bx - 0.1 + swing, by + 0.28, bx - 0.04 + swing * 0.8, by + 0.26)
        ctx.quadraticCurveTo(bx - 0.08 + swing * 0.5, by + 0.14, bx + 0.02, by + 0.045)
        ctx.closePath()
        fill(f, colour)
        circlePath(ctx, bx + 0.01, by, 0.034)
        fill(f, KIT.hairTie)
        return
      }
      cap(0.018, 'smooth', 'soft', false)
      return
    case 'braids':
      if (layer === 'back') {
        braid(hx - 0.17, hy + 0.08)
        return
      }
      cap(0.018, 'smooth', 'soft', false)
      braid(hx - 0.1, hy + 0.15)
      return
    case 'puffs':
      if (layer === 'back') {
        // Round puffs at the back, the far one higher: never on top, where they would read as ears. Under the hat, one big puff below the brim.
        if (hat) curls(f, [hx - 0.2, hy - 0.01, 0.095], colour)
        else curls(f, [hx - 0.16, hy - 0.14, 0.105, hx - 0.215, hy + 0.04, 0.09], colour)
        return
      }
      cap(0.012, 'smooth', 'soft', false)
      return
  }
}

/** The glasses over the eyes: the near lens round the near eye, the far one smaller, an arm back to the ear; goggles are one wide lens on a strap. */
function drawGlasses(f: Figure) {
  const { ctx, look } = f
  if (look.glasses === 'none') return
  const nx = EYE.x
  const fx = EYE.x - EYE.gap
  const y = EYE.y
  // At street size the frames grow a little, so their shapes still read.
  const big = f.lod === 'S' ? 1.15 : 1
  if (look.glasses === 'goggles') {
    // Safety goggles: the strap runs back round the head just under the brim; one wide lens in a bright frame.
    ctx.beginPath()
    ctx.moveTo(fx - 0.02, y - 0.03)
    ctx.lineTo(HEAD.x - 0.175, BRIM_Y + 0.035)
    limb(f, 0.034, KIT.goggleStrap)
    roundRectPath(ctx, fx - 0.055, y - 0.058, nx - fx + 0.12, 0.112, 0.045)
    if (f.back) {
      fill(f, KIT.lens)
      return
    }
    ctx.fillStyle = KIT.lens
    ctx.fill()
    ctx.lineWidth = Math.max(0.022, lw('line') * 2.2)
    ctx.strokeStyle = KIT.goggleFrame
    ctx.stroke()
    ink(ctx, 'detail')
    roundRectPath(ctx, fx - 0.055 - 0.011, y - 0.058 - 0.011, nx - fx + 0.12 + 0.022, 0.112 + 0.022, 0.056)
    ink(ctx, 'detail')
    shine(ctx, nx + 0.02, y + 0.005, 0.05)
    return
  }
  const lens = (x: number, s: number) => {
    switch (look.glasses) {
      case 'round':
        circlePath(ctx, x, y, 0.046 * s)
        break
      case 'sunglasses':
        roundRectPath(ctx, x - 0.052 * s, y - 0.04 * s, 0.104 * s, 0.08 * s, 0.035 * s)
        break
      case 'stars':
        starPath(ctx, x, y + 0.004, 0.072 * s)
        break
      case 'hearts':
        heartPath(ctx, x, y + 0.004, 0.115 * s)
        break
    }
  }
  const frame = look.glasses === 'stars' ? KIT.starFrame : look.glasses === 'hearts' ? KIT.heartFrame : INK
  const glass = look.glasses === 'sunglasses' ? KIT.shades : KIT.lens
  // The arm back to the ear and the bridge.
  ctx.beginPath()
  ctx.moveTo(fx - 0.04, y - 0.01)
  ctx.lineTo(EAR.x + 0.02, y + 0.005)
  ctx.moveTo(fx + 0.035, y - 0.008)
  ctx.lineTo(nx - 0.045, y - 0.008)
  if (f.back) return
  ink(ctx, 'line')
  for (const [x, s] of [
    [fx, 0.85 * big],
    [nx, big],
  ] as const) {
    lens(x, s)
    ctx.fillStyle = glass
    ctx.fill()
    if (frame !== INK) {
      ctx.lineWidth = Math.max(0.016, lw('line') * 1.8)
      ctx.strokeStyle = frame
      ctx.stroke()
      ink(ctx, 'detail')
    } else ink(ctx, 'line')
    if (look.glasses === 'sunglasses') shine(ctx, x, y, 0.05 * s)
  }
}

/**
 * The cat-ear hard hat: the brightest thing on the figure, inked at the edge weight all
 * round so its M-shaped silhouette (two ears with the dome between) reads at any size.
 * The far ear stands behind the dome, the near ear in front of it, both moulded on (no line
 * at their base). The ears grow with `earScale`, flick and fold back with the rig.
 */
function drawHat(f: Figure) {
  const { ctx, look, rig } = f
  if (look.hat === 'none') return
  const hat = HAT_LOOK[look.hat]
  const paint = !f.back
  /** The dome and the brim: inked at the edge weight all round, or their backing. */
  const shell = () => (f.back ? fill(f, hat.base) : part(ctx, hat.base, 'edge'))
  /** One ear on the dome: its base from (x0, y0) to (x1, y1), its tip at (tx, ty), sized by `s`. */
  const ear = (x0: number, y0: number, x1: number, y1: number, tx: number, ty: number, s: number, turn: number, front: boolean) => {
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(turn)
    ctx.scale(s * f.earScale, s * f.earScale)
    const a = [x0 - mx, y0 - my] as const
    const b = [x1 - mx, y1 - my] as const
    const t = [tx - mx, ty - my] as const
    // A rounded tip: the two edges meet in a short curve.
    const trace = () => {
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(mix(a[0], t[0], 0.82), mix(a[1], t[1], 0.82))
      ctx.quadraticCurveTo(t[0], t[1], mix(b[0], t[0], 0.82), mix(b[1], t[1], 0.82))
      ctx.lineTo(b[0], b[1])
    }
    ctx.beginPath()
    trace()
    if (f.back) {
      // Undo the ear's scale in the line width, so the backing is as wide as everywhere else.
      ctx.lineWidth = (2 * lw('edge')) / (s * f.earScale)
      ctx.strokeStyle = INK
      ctx.stroke()
    } else {
      ctx.closePath()
      ctx.fillStyle = hat.base
      ctx.fill()
      ctx.beginPath()
      trace()
      if (!front) ctx.closePath()
      ctx.lineWidth = lw('edge') / (s * f.earScale)
      ctx.strokeStyle = INK
      ctx.stroke()
      if (!f.tiny) {
        // The inner ear, a smaller triangle up from the base.
        const k = 0.52
        const c = [0, 0.012] as const
        ctx.beginPath()
        ctx.moveTo(mix(c[0], a[0], k), mix(c[1], a[1], k))
        ctx.quadraticCurveTo(mix(c[0], t[0], 0.78), mix(c[1], t[1], 0.78), mix(c[0], b[0], k), mix(c[1], b[1], k))
        ctx.closePath()
        ctx.fillStyle = hat.inner
        ctx.fill()
      }
    }
    ctx.restore()
  }
  const hx = DOME.x
  const top = BRIM_Y - DOME.ry
  const flick = rig.flick
  const fold = -0.9 * rig.fold
  // The far ear (back, left), smaller, behind the dome.
  ear(hx - 0.185, BRIM_Y - 0.075, hx - 0.025, top + 0.006, hx - 0.15, BRIM_Y - 0.28, 0.92, fold - flick, false)
  // The dome on the brim line.
  ctx.beginPath()
  ctx.ellipse(hx, BRIM_Y, DOME.rx, DOME.ry, 0, Math.PI, TAU)
  ctx.closePath()
  shell()
  if (paint && !f.tiny && f.lod !== 'S') {
    // The lit ridge from the front to the back over the top.
    ctx.beginPath()
    ctx.ellipse(hx + 0.01, BRIM_Y + 0.004, DOME.rx * 0.74, DOME.ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9)
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.042
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineWidth = 0.042 - 2 * lw('detail')
    ctx.strokeStyle = hat.top
    ctx.stroke()
  }
  if (paint) shine(ctx, hx - 0.02, BRIM_Y - 0.02, DOME.ry * 0.95)
  // The brim, its peak jutting forward over the face.
  ctx.beginPath()
  ctx.moveTo(hx - DOME.rx - 0.025, BRIM_Y - 0.02)
  ctx.lineTo(hx + DOME.rx - 0.01, BRIM_Y - 0.02)
  ctx.quadraticCurveTo(hx + DOME.rx + 0.07, BRIM_Y - 0.02, hx + DOME.rx + 0.085, BRIM_Y + 0.012)
  ctx.quadraticCurveTo(hx + DOME.rx + 0.09, BRIM_Y + 0.028, hx + DOME.rx + 0.06, BRIM_Y + 0.028)
  ctx.lineTo(hx - DOME.rx - 0.025, BRIM_Y + 0.022)
  ctx.quadraticCurveTo(hx - DOME.rx - 0.045, BRIM_Y + 0.001, hx - DOME.rx - 0.025, BRIM_Y - 0.02)
  ctx.closePath()
  shell()
  // The near ear (front, right), over the dome.
  ear(hx + 0.035, top + 0.004, hx + 0.19, BRIM_Y - 0.085, hx + 0.155, BRIM_Y - 0.285, 1, fold + flick, true)
}

/**
 * The tool, its grip at (x, y), pointing up and turned by `angle` (from up, positive tipping
 * forward), scaled by `size`. Each one has its own silhouette at street size: a hammer's T,
 * a pickaxe's arc, a drill's L, a shovel's long blade, a wrench's open jaw, a wand's star.
 */
function drawTool(f: Figure, x: number, y: number, angle: number, size: number) {
  const { ctx, look } = f
  const paint = !f.back
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.scale(size, size)
  const handle = (y0: number, y1: number, colour: string) => {
    ctx.beginPath()
    ctx.moveTo(0, y0)
    ctx.lineTo(0, y1)
    limb(f, 0.036, colour)
  }
  switch (look.tool) {
    case 'hammer':
      handle(0.06, -0.21, KIT.wood)
      // The head: a striking face forward, a claw curling back.
      ctx.beginPath()
      ctx.moveTo(0.075, -0.275)
      ctx.lineTo(0.075, -0.205)
      ctx.lineTo(-0.025, -0.215)
      ctx.quadraticCurveTo(-0.07, -0.215, -0.11, -0.185)
      ctx.quadraticCurveTo(-0.085, -0.255, -0.03, -0.27)
      ctx.closePath()
      fill(f, KIT.steel)
      if (paint && f.lod !== 'S') {
        ctx.beginPath()
        ctx.rect(0.045, -0.275, 0.03, 0.07)
        ctx.fillStyle = KIT.steelDark
        ctx.fill()
        ink(ctx, 'detail')
      }
      break
    case 'pickaxe':
      handle(0.06, -0.25, KIT.wood)
      ctx.beginPath()
      ctx.moveTo(-0.17, -0.18)
      ctx.quadraticCurveTo(-0.05, -0.305, 0.0, -0.305)
      ctx.quadraticCurveTo(0.05, -0.305, 0.17, -0.18)
      ctx.quadraticCurveTo(0.05, -0.25, 0.0, -0.25)
      ctx.quadraticCurveTo(-0.05, -0.25, -0.17, -0.18)
      ctx.closePath()
      fill(f, KIT.steel)
      if (paint && f.lod !== 'S') {
        roundRectPath(ctx, -0.028, -0.31, 0.056, 0.07, 0.014)
        part(ctx, KIT.steelDark, 'detail')
      }
      break
    case 'drill':
      // A pistol grip with a battery under it, the blue body over the hand, the bit forward.
      roundRectPath(ctx, -0.03, 0.03, 0.07, 0.05, 0.015)
      fill(f, KIT.steelDark)
      roundRectPath(ctx, -0.025, -0.11, 0.055, 0.15, 0.02)
      fill(f, KIT.drill)
      ctx.beginPath()
      ctx.moveTo(0.1, -0.15)
      ctx.lineTo(0.2, -0.15)
      limb(f, 0.018, KIT.steel)
      roundRectPath(ctx, 0.08, -0.175, 0.045, 0.05, 0.012)
      fill(f, KIT.steelDark)
      roundRectPath(ctx, -0.07, -0.2, 0.17, 0.1, 0.04)
      fill(f, KIT.drill)
      if (paint) shine(ctx, -0.02, -0.155, 0.045)
      break
    case 'shovel':
      handle(0.08, -0.3, KIT.wood)
      ctx.beginPath()
      ctx.moveTo(-0.065, -0.3)
      ctx.lineTo(0.065, -0.3)
      ctx.quadraticCurveTo(0.08, -0.41, 0.0, -0.47)
      ctx.quadraticCurveTo(-0.08, -0.41, -0.065, -0.3)
      ctx.closePath()
      fill(f, KIT.steel)
      if (paint && f.lod !== 'S') {
        ctx.beginPath()
        ctx.moveTo(0, -0.31)
        ctx.lineTo(0, -0.4)
        ctx.lineCap = 'round'
        ink(ctx, 'detail')
      }
      break
    case 'wrench':
      // A steel bar, and an open jaw: a U whose prongs point up.
      handle(0.06, -0.2, KIT.steel)
      ctx.beginPath()
      ctx.arc(0, -0.255, 0.05, -Math.PI / 2 + 0.75, (3 * Math.PI) / 2 - 0.75)
      limb(f, 0.042, KIT.steel)
      break
    case 'wand':
      handle(0.06, -0.19, KIT.wandStick)
      starPath(ctx, 0, WAND_TIP, 0.09)
      fill(f, KIT.star)
      if (paint && f.lod !== 'S') shine(ctx, 0, WAND_TIP, 0.06)
      break
  }
  ctx.restore()
}

/** The whole figure in back-to-front order (see the file's header). */
function drawFigure(f: Figure) {
  const { look, rig } = f
  const player = isPlayer(look)
  const holding = rig.tool !== null && player
  const lying = rig.lie >= 0.5
  upper(f, () => drawArm(f, 0, true))
  if (!lying) upper(f, () => drawBag(f, 'back'))
  drawLeg(f, 0)
  // Lying down, what hangs down the back is under the sleeper, on the floor.
  if (!lying) headFrame(f, () => drawHair(f, 'back'))
  if (!lying) upper(f, () => drawBag(f, 'top'))
  drawLeg(f, 1)
  upper(f, () => {
    drawShirt(f)
    drawTrousers(f)
    // With the hands busy and on the feet, the tool hangs on the belt, head up.
    if (player && !holding && !lying && rig.hip < -0.25) drawTool(f, 0.1, -0.13, -0.18, 0.78)
  })
  headFrame(f, () => drawHead(f))
  upper(f, () => {
    drawArm(f, 1, !holding)
    if (!holding) return
    const j = armJoints(rig, 1)
    drawTool(f, j.hx, j.hy, rig.tool!, 1)
    drawMitten(f, j.hx, j.hy)
  })
}

/** The rig drawn in `look`, feet at the origin, facing right; no ground shadow (the caller puts the figure where it stands or sits). */
export function drawRig(ctx: CanvasRenderingContext2D, look: Look, rig: Rig): void {
  const headPx = 2 * HEAD.r * pen.ppm
  const lod = detail(SIZE.builder)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  bodyFrame(ctx, rig)
  const f: Figure = { ctx, look, rig, lod, earScale: Math.min(1.4, Math.max(1, 22 / headPx)), tiny: headPx < 18, back: lod !== 'S' }
  if (f.back) drawFigure(f)
  f.back = false
  drawFigure(f)
  ctx.restore()
}

/**
 * The magic wand's trail: a sparkle born at the star every TRAIL_LIFE / TRAIL_N seconds
 * where the star was then, rising and shrinking away, so a swing leaves a curve of
 * sparkles and a wand held still fizzes gently.
 */
function drawTrail(ctx: CanvasRenderingContext2D, pose: Pose, u: number) {
  const v = held(u)
  const big = detail(SIZE.builder) === 'S' ? 1.4 : 1
  for (let i = 0; i < TRAIL_N; i++) {
    const age = loop(v, TRAIL_LIFE, i / TRAIL_N) * TRAIL_LIFE
    const then = posed(pose, v - age)
    if (then.tool === null) continue
    // The star sits WAND_TIP up the tool from the hand, the tool turned by its angle.
    const hand = handAt(then, 1)
    const [x, y] = rigPoint(then, 'upper', hand.x - Math.sin(then.tool) * WAND_TIP, hand.y + Math.cos(then.tool) * WAND_TIP)
    const k = age / TRAIL_LIFE
    // Which sparkle this is, counted over time, so each keeps its colour and drift for its whole life.
    const n = Math.floor(v / TRAIL_LIFE - i / TRAIL_N + 1)
    const id = n * TRAIL_N + i
    sparkle(ctx, x + 0.06 * k * Math.sin(id * 2.4), y - TRAIL_RISE * k, TRAIL_SIZE * big * Math.sin(Math.PI * k), KIT.trail[((id % KIT.trail.length) + KIT.trail.length) % KIT.trail.length]!)
  }
}

/** The builder with their feet at the origin, facing right, in `pose`, `u` seconds into it, on a ground shadow (none while driving). A look with hat 'none' is a friend, who never holds the tool. */
export function drawBuilder(ctx: CanvasRenderingContext2D, look: Look, pose: Pose, u: number): void {
  const rig = posed(pose, u)
  ctx.save()
  if (pose !== 'drive') groundShadow(ctx, mix(rig.hip > -0.2 ? 0.62 : 0.5, 1.1, rig.lie) * clamp01(1 + rig.lift * 1.5))
  drawRig(ctx, look, rig)
  if (look.tool === 'wand' && isPlayer(look) && rig.tool !== null) drawTrail(ctx, pose, u)
  ctx.restore()
}

/** Each tool on its icon: its length from the handle's end to the top of its head (the icon makes it ICON.h long), and the point of it, in its own frame (grip at the origin, pointing up), that sits on the icon's centre so the tipped tool is in the middle of its button. */
const TOOL_ICON: Record<Tool, { length: number; x: number; y: number }> = {
  hammer: { length: 0.38, x: 0.023, y: -0.133 },
  pickaxe: { length: 0.41, x: 0.018, y: -0.146 },
  drill: { length: 0.32, x: 0.052, y: -0.096 },
  shovel: { length: 0.59, x: 0.019, y: -0.205 },
  wrench: { length: 0.41, x: 0.01, y: -0.131 },
  wand: { length: 0.435, x: 0.019, y: -0.151 },
}
/** The tool icon: this tall, tipped forward this far (radians from up), and its head twinkling once every ICON.twinkle seconds. */
const ICON = { h: 0.5, tilt: 0.5, twinkle: 1.6 } as const

/**
 * The builder's tool alone, for the road's tool button (the button the child presses to hit
 * a boulder): centred on the origin, ICON.h tall, tipped forward so it points up and right,
 * inked as the rig inks it, and a warm sparkle growing and shrinking by its head with t.
 */
export function drawToolIcon(ctx: CanvasRenderingContext2D, tool: Tool, t: number): void {
  const icon = TOOL_ICON[tool]
  const lod = detail(ICON.h)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.rotate(ICON.tilt)
  scaled(ctx, ICON.h / icon.length, () => {
    ctx.translate(-icon.x, -icon.y)
    const f: Figure = { ctx, look: { ...DEFAULT_LOOK, tool }, rig: STAND, lod, earScale: 1, tiny: false, back: lod !== 'S' }
    if (f.back) drawTool(f, 0, 0, 0, 1)
    f.back = false
    drawTool(f, 0, 0, 0, 1)
    // The twinkle just past the head's front.
    sparkle(ctx, icon.x + 0.12, 0.08 - icon.length + 0.01, 0.12 * arch(clamp01(2 * loop(t, ICON.twinkle, 0))), C.sparkleWarm)
  })
  ctx.restore()
}

/** The box (builder-local metres, standing pose) a wardrobe button for each part shows: the HUD crops drawBuilder to it, so an option's button is the real builder wearing it. */
export const PART_BOX: Record<Part, Rect> = {
  hat: rect(-0.33, -1.27, 0.7, 0.62),
  hair: rect(-0.42, -1.25, 0.82, 0.82),
  skin: rect(-0.2, -1.03, 0.47, 0.47),
  glasses: rect(-0.14, -0.96, 0.4, 0.34),
  shirt: rect(-0.25, -0.71, 0.55, 0.55),
  bag: rect(-0.44, -0.8, 0.6, 0.56),
  pants: rect(-0.27, -0.58, 0.58, 0.6),
  shoes: rect(-0.16, -0.36, 0.42, 0.4),
  tool: rect(0.05, -0.9, 0.5, 0.54),
}

// ---------------------------------------------------------------------------------------
// The sheet: every pose (one-shots at a few moments), every option of every part, the
// friends, the wardrobe buttons, and mixed outfits at street size

/** A standing builder's cell, and the one that fits every pose (the jump's top, the sleeper's length). */
const STANDING = rect(-0.5, -1.3, 1.0, 1.36)
/** The tool icon's cell. */
export const TOOL_ICON_BOX = rect(-0.35, -0.35, 0.7, 0.7)
const ANY_POSE = rect(-0.75, -1.6, 1.5, 1.66)
/** A one-shot pose replays on the sheet with a second's rest between. */
const replay = (pose: Pose, t: number) => (POSE_LOOPS[pose] ? t : t % (POSE_LENGTH[pose] + 1))
/** The builder in `look` doing `pose` (a one-shot replaying), in the cell `area`. */
const dressed = (label: string, area: Rect, look: Look, pose: Pose): SheetEntry => ({ label, box: area, draw: (ctx, t) => drawBuilder(ctx, look, pose, replay(pose, t)) })
/** The default builder changed by `patch`, standing. */
const option = (label: string, patch: Partial<Look>) => dressed(label, STANDING, { ...DEFAULT_LOOK, ...patch }, 'stand')

/** 48 outfits rolled from a fixed seed, every part at random, for judging silhouettes at street size. */
function mixedLooks(): Look[] {
  const next = rng(20251)
  const pick = <T>(list: readonly T[]) => list[between(next(), 0, list.length - 1)]!
  return Array.from({ length: 48 }, (_, i) => ({
    hat: i % 8 === 7 ? 'none' : pick(HAT_COLORS),
    hair: pick(HAIRS),
    hairColor: pick(HAIR_COLORS),
    skin: pick(SKINS),
    shirt: pick(SHIRTS),
    shirtColor: pick(WEAR_COLORS),
    pants: pick(PANTS),
    pantsColor: pick(WEAR_COLORS),
    shoes: pick(SHOES),
    glasses: pick(GLASSES),
    bag: pick(BAGS),
    tool: pick(TOOLS),
  }))
}
/** The poses friends take in the rooms, one per friend on the sheet. */
const VISITS: readonly Pose[] = ['sit', 'play', 'slide', 'dance', 'sleep', 'jump', 'bounce', 'float']
const STREET_PPM = 48
const STREET_POSES: readonly Pose[] = ['stand', 'walk', 'stand', 'wave', 'stand', 'hop']

export const BUILDER_SHEET: SheetEntry[] = [
  ...POSES.flatMap((pose): SheetEntry[] => [
    dressed(POSE_LOOPS[pose] ? pose : `${pose} (replays)`, ANY_POSE, DEFAULT_LOOK, pose),
    ...[0.25, 0.5, 0.75, 1].map((q): SheetEntry => {
      const u = q * POSE_LENGTH[pose]
      return { label: `${pose} at ${u.toFixed(2)} s`, box: ANY_POSE, draw: (ctx) => drawBuilder(ctx, DEFAULT_LOOK, pose, u) }
    }),
  ]),
  { label: 'drawRig: the ears flick every 1.5 s', box: STANDING, draw: (ctx, t) => drawRig(ctx, DEFAULT_LOOK, { ...posed('stand', t), flick: earFlick(t % 1.5) }) },
  { label: 'drawRig: the ears laid back at speed', box: STANDING, draw: (ctx, t) => drawRig(ctx, DEFAULT_LOOK, { ...posed('stand', t), fold: 1 }) },
  ...HAT_COLORS.map((hat) => option(`hat ${hat}`, { hat })),
  ...HAIRS.flatMap((hair) => [option(`hair ${hair}`, { hair }), option(`hair ${hair} no hat`, { hair, hat: 'none' })]),
  ...HAIR_COLORS.map((hairColor) => option(`hair colour ${hairColor}`, { hairColor, hair: 'long' })),
  ...SKINS.map((skin) => option(`skin ${skin}`, { skin })),
  ...SKINS.map((skin) => at(400, rect(-0.3, -1.25, 0.66, 0.66), `skin ${skin} face, mirror size`, (ctx, t) => drawBuilder(ctx, { ...DEFAULT_LOOK, skin }, 'stand', t))),
  // The face's marks on every skin where they are thinnest: happy arcs and a closed smile, and asleep, at street size.
  ...SKINS.map((skin) => at(STREET_PPM, STANDING, `skin ${skin} happy, street size`, (ctx, t) => drawRig(ctx, { ...FRIENDS[7]!, skin }, { ...posed('stand', t), eyes: 'happy' }))),
  ...SKINS.map((skin) => at(STREET_PPM, ANY_POSE, `skin ${skin} asleep, street size`, (ctx, t) => drawRig(ctx, { ...FRIENDS[7]!, skin }, posed('sleep', t)))),
  ...SHIRTS.map((shirt) => option(`shirt ${shirt}`, { shirt })),
  ...SHIRTS.flatMap((shirt) => WEAR_COLORS.map((shirtColor) => at(STREET_PPM, STANDING, `shirt ${shirt} ${shirtColor}, street size`, (ctx, t) => drawBuilder(ctx, { ...DEFAULT_LOOK, shirt, shirtColor }, 'stand', t)))),
  ...PANTS.map((pants) => dressed(`pants ${pants}`, STANDING, { ...DEFAULT_LOOK, pants, pantsColor: 'green' }, 'walk')),
  ...WEAR_COLORS.map((pantsColor) => option(`pants colour ${pantsColor}`, { pants: 'work', pantsColor })),
  ...SHOES.map((shoes) => dressed(`shoes ${shoes}`, STANDING, { ...DEFAULT_LOOK, shoes }, 'walk')),
  ...GLASSES.map((glasses) => option(`glasses ${glasses}`, { glasses })),
  ...BAGS.map((bag) => option(`bag ${bag}`, { bag })),
  ...BAGS.map((bag) => dressed(`bag ${bag} hopping (replays)`, ANY_POSE, { ...DEFAULT_LOOK, bag }, 'hop')),
  ...TOOLS.map((tool) => option(`tool ${tool}`, { tool })),
  ...TOOLS.map((tool) => dressed(`tool ${tool} hitting (replays)`, ANY_POSE, { ...DEFAULT_LOOK, tool }, 'hit')),
  ...TOOLS.map((tool): SheetEntry => ({ label: `road tool button ${tool}`, box: TOOL_ICON_BOX, draw: (ctx, t) => drawToolIcon(ctx, tool, t) })),
  ...TOOLS.map((tool) => at(150, TOOL_ICON_BOX, `road tool button ${tool}, on the button`, (ctx, t) => drawToolIcon(ctx, tool, t))),
  ...FRIENDS.map((look, i) => dressed(`friend ${i}`, STANDING, look, i % 2 === 0 ? 'stand' : 'wave')),
  ...FRIENDS.map((look, i) => {
    const pose = VISITS[i % VISITS.length]!
    return dressed(`friend ${i} ${pose}`, ANY_POSE, look, pose)
  }),
  ...PARTS.map((p): SheetEntry => ({ label: `button ${p}`, box: PART_BOX[p], draw: (ctx) => drawBuilder(ctx, DEFAULT_LOOK, 'stand', 0.6) })),
  ...mixedLooks().map((look, i) => {
    const pose = STREET_POSES[i % STREET_POSES.length]!
    return at(STREET_PPM, STANDING, `mixed ${i}, street size`, (ctx, t) => drawBuilder(ctx, look, pose, replay(pose, t + i * 0.37)))
  }),
]
