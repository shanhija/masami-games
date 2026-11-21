import { COLOR, INK, LINE, LINE_DETAIL, blob, heartPath, inkPart, pen, roundRectPath, sparklePath, starPath, type Rim } from '../../../pia-jump/src/draw/look'
import { DEG, TAU, arch, clamp01, flatPart, ink, lidPath, mix, smooth, tube } from '../../../pia-jump/src/draw/parts'
import { COLOURS, HAIR_COLOURS, SKINS, type Look, type Option, type Part } from '../game/closet'

/**
 * The person the child makes, in Pia Jump's ink style: a chibi with a big head (a bit over
 * a third of the height), round mitten hands and tube legs. A rig (sizes from the look's
 * height and build) and a body (angles and offsets from the pose) are painted back to
 * front: back hair, cape and wings, the back arm, legs with the bottom and shoes, the torso
 * with the top, the front arm, the face with its makeup and features, the fringe and the
 * hat, glasses, scarf. Every option changes the outline or a big patch of colour, so a
 * closet tile and a sprite under two tiles tall both show it. +x is the side the person
 * faces, -y is up; the face's parts are measured in face radii from the head's centre.
 */

/** What the body is doing. */
export type Act = 'stand' | 'walk' | 'run' | 'jump' | 'fall' | 'climb' | 'build' | 'dance' | 'wave'

export interface Pose {
  act: Act
  /** Tiles walked (or climbed) so far, only growing: the walk, run and climb cycles' phase. */
  stride: number
  /** Seconds since this act began: the build swing, the dance and the wave. */
  since: number
  /** Seconds on a clock that always runs: breathing and blinking. */
  t: number
  /** 0 to 1: how squashed the body is after a landing, 1 at the moment of landing. */
  squash: number
  /** 0 faces the viewer (the closet), 1 is turned toward +x, the way she walks (a level). */
  turn: number
}

/** The heights: the top of the hair above the feet, the face's radius, where the legs join, the arms' length. */
const HEIGHTS = {
  short: { top: 1.6, r: 0.28, hipY: -0.52, armLen: 0.36 },
  middle: { top: 1.75, r: 0.29, hipY: -0.62, armLen: 0.4 },
  tall: { top: 1.9, r: 0.3, hipY: -0.75, armLen: 0.44 },
} as const

/** The builds: half the torso's width at the shoulders and the hips, how far the tummy bulges, the legs' half spacing, the limbs' widths, the shoes. */
const BUILDS = {
  slim: { sw: 0.17, hw: 0.165, belly: 0, hipX: 0.075, armW: 0.075, legW: 0.085, shoeRx: 0.1 },
  middle: { sw: 0.215, hw: 0.215, belly: 0.012, hipX: 0.095, armW: 0.09, legW: 0.1, shoeRx: 0.11 },
  round: { sw: 0.25, hw: 0.29, belly: 0.055, hipX: 0.12, armW: 0.105, legW: 0.12, shoeRx: 0.12 },
} as const

/** How far the hair reaches above the face's crown: personTop is the crown plus this. */
const HAIR_TOP = 0.06

/** Every size of the figure for one height and build, in tiles. */
interface Rig {
  r: number
  headY: number
  shoulderY: number
  hipY: number
  armLen: number
  sw: number
  hw: number
  belly: number
  hipX: number
  armW: number
  legW: number
  shoeRx: number
  shoeRy: number
}

function rigOf(look: Look): Rig {
  const h = HEIGHTS[look.height]
  const headY = -(h.top - HAIR_TOP - h.r)
  return { ...BUILDS[look.build], r: h.r, headY, shoulderY: headY + h.r * 0.86, hipY: h.hipY, armLen: h.armLen, shoeRy: 0.07 }
}

/** The face shapes in face radii: half the width, the crown and the chin, and how square the lower quarters are (0.55 is a circle's). */
const FACES = {
  round: { w: 1, top: 1, chin: 1, k: 0.56 },
  oval: { w: 0.85, top: 1.04, chin: 1.13, k: 0.48 },
  wide: { w: 1.17, top: 0.93, chin: 0.86, k: 0.7 },
} as const

/** Each eye's half-width and half-height, and the radii its eye shadow arcs at, in face radii. */
const EYES: Record<Option<'eyes'>, { rx: number; ry: number; lidX: number; lid: number }> = {
  dots: { rx: 0.11, ry: 0.11, lidX: 0.2, lid: 0.22 },
  big: { rx: 0.18, ry: 0.25, lidX: 0.27, lid: 0.35 },
  happy: { rx: 0.2, ry: 0.12, lidX: 0.27, lid: 0.22 },
  sleepy: { rx: 0.18, ry: 0.21, lidX: 0.24, lid: 0.11 },
  sparkle: { rx: 0.21, ry: 0.28, lidX: 0.3, lid: 0.38 },
}

/** What no closet colour changes: the mouth, hair ties, the clown nose, the chef hat's shade, the star dress's night, the glasses, the wings, the face paint. */
const OWN = {
  mouth: '#B23A5E',
  tongue: '#FF8FA3',
  white: '#FFFFFF',
  tie: '#FF6FAE',
  tieOnPink: '#FFD447',
  clown: '#FF4757',
  chefShade: '#E4DCEC',
  night: '#2F3C8F',
  nightShade: '#232D6E',
  frame: '#E0457B',
  lens: '#DDF2FF',
  heel: '#5B3B30',
  beak: '#FF9F1C',
  leaf: '#5DBB63',
  ruby: '#E8384F',
  sapphire: '#3F7FE0',
  wing: '#F1E6FF',
  wingShine: '#D9F3FF',
  wingBlush: '#FFE0F2',
  wingVein: '#C4AEF0',
  iris: '#7C5CFF',
  butterfly: '#5B8DEF',
  butterflyLow: '#B07CFF',
  heartPaint: '#E8384F',
} as const

/** Eye shadow: one band, or the rainbow's five, red outermost. */
const SHADOWS: Record<Option<'shadow'>, readonly string[]> = {
  none: [],
  blue: ['#6FA8FF'],
  purple: ['#B07CFF'],
  pink: ['#FF8CC6'],
  green: ['#5FD08F'],
  rainbow: ['#4DABF7', '#69DB7C', '#FFE066', '#FFA94D', '#FF6B6B'],
}
const LIPS: Record<Exclude<Option<'lips'>, 'none'>, string> = { pink: '#FF7FB5', red: '#E0314B', purple: '#9B4FD0', glitter: '#FF8FCF' }
const BLUSH: Record<'pink' | 'peach', string> = { pink: '#FF9DBB', peach: '#FFAA80' }
const FLOWERS = ['#FF7FB5', '#FFFFFF', '#B79CFF', '#FFD447', '#7FD4FF'] as const

/** Hex colour a mixed k of the way to hex colour b; remembered, since the same few come back every frame. */
const mixed = new Map<string, string>()
function tint(a: string, b: string, k: number): string {
  const key = `${a}${b}${k}`
  let out = mixed.get(key)
  if (out === undefined) {
    const p = parseInt(a.slice(1), 16)
    const q = parseInt(b.slice(1), 16)
    const ch = (shift: number) => Math.round(mix((p >> shift) & 255, (q >> shift) & 255, k))
    out = `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
    mixed.set(key, out)
  }
  return out
}
const shadeOf = (c: string) => tint(c, INK, 0.22)

/** The top's colour: the closet's, or night blue for the star dress. */
const topColour = (look: Look) => (look.top === 'stars' ? OWN.night : COLOURS[look.topColour])

/** Adds an ellipse to the current path as a closed piece of its own. */
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU)
}

/** What the pose does to the rig. Arm angles are in degrees, 0 hanging down and + swung toward +x; feet are offsets from where they stand, - up. */
interface Body {
  /** All of it lifted off the ground: a dance hop. */
  rise: number
  /** The upper body's bob, + up: breathing, the stride. */
  bob: number
  /** Radians the upper body leans forward about the hips. */
  lean: number
  /** Radians all of it sways about the feet. */
  tilt: number
  back: number
  front: number
  /** Degrees the elbows bend forward: a run's arms, a wave's hand. */
  bend: number
  /** The back foot's dx and dy, then the front foot's. */
  feet: readonly [number, number, number, number]
  /** The eyes shut for a blink. */
  closed: boolean
  /** 0 to 1: how far the cape, the scarf and the hair stream back. */
  flow: number
  /** Radians the ponytail and the pigtails swing. */
  swing: number
}

function bodyOf(p: Pose, turn: number, g: Rig): Body {
  const breath = Math.sin((TAU * p.t) / 2.6)
  // A blink every 3.3 s, then 3.7 s.
  const c7 = ((p.t % 7) + 7) % 7
  // The arms hang a little out from the sides, further past a round tummy.
  const hang = mix(12, 6, turn) + 120 * g.belly
  const b = {
    rise: 0,
    bob: 0.008 * breath,
    lean: 0,
    tilt: 0,
    back: -hang,
    front: hang,
    bend: 0,
    feet: [0, 0, 0, 0] as [number, number, number, number],
    closed: c7 < 0.13 || (c7 > 3.3 && c7 < 3.43),
    flow: 0,
    swing: 0.04 * breath,
  }
  switch (p.act) {
    case 'stand':
      break
    case 'walk':
    case 'run': {
      // One stride cycle per 1.6 tiles walked (1.9 run): each foot lifts while it swings forward, the arms swing against the legs, the body is lowest with the feet apart.
      const run = p.act === 'run'
      const phase = (TAU * p.stride) / (run ? 1.9 : 1.6)
      const s = Math.sin(phase)
      const c = Math.cos(phase)
      const reach = run ? 0.2 : 0.14
      const lift = run ? 0.15 : 0.07
      const swing = run ? 50 : 26
      b.feet = [-s * reach, -lift * Math.max(0, -c), s * reach, -lift * Math.max(0, c)]
      b.bob = (run ? 0.035 : 0.02) * (Math.abs(c) - 1)
      b.front = (run ? 10 : 3) - s * swing
      b.back = (run ? 10 : -3) + s * swing
      b.bend = run ? 80 : 12
      b.lean = (run ? 10 : 3) * DEG
      b.flow = run ? 1 : 0.4
      b.swing = s * (run ? 0.25 : 0.12)
      break
    }
    case 'jump':
      b.feet = [-0.04, -0.1, 0.07, -0.17]
      b.front = 160
      b.back = 200
      b.flow = 0.5
      b.swing = -0.12
      break
    case 'fall': {
      const w = Math.sin(TAU * 1.6 * p.t)
      b.feet = [-0.05, -0.02 + 0.015 * w, 0.05, -0.05 - 0.015 * w]
      b.front = 118 + 10 * w
      b.back = -118 - 10 * w
      b.flow = 0.7
      b.swing = 0.15 * w
      break
    }
    case 'climb': {
      // Hand over hand, one cycle per 0.8 tiles climbed, each foot stepping up with the other hand.
      const s = Math.sin((TAU * p.stride) / 0.8)
      b.front = mix(150 + 14 * s, 140 + 22 * s, turn)
      b.back = mix(210 + 14 * s, 140 - 22 * s, turn)
      b.feet = [0.03 * turn, -0.13 * Math.max(0, s), 0.03 * turn, -0.13 * Math.max(0, -s)]
      b.bob = 0.015 * Math.abs(s)
      break
    }
    case 'build': {
      // The front hand comes down and forward in the first quarter second, putting the block down, then drops back.
      const down = smooth(0, 0.25, p.since)
      const after = smooth(0.45, 0.8, p.since)
      b.front = mix(mix(150, 50, down), hang, after)
      b.lean = 8 * DEG * down * (1 - after)
      break
    }
    case 'dance': {
      // Two hops a second, both arms up swaying with the body.
      const hop = arch((((p.since * 2) % 1) + 1) % 1)
      const sway = Math.sin(TAU * p.since)
      b.rise = 0.09 * hop
      b.front = 150 + 22 * sway
      b.back = -150 + 22 * sway
      b.tilt = 0.08 * sway
      b.feet = [0, -0.04 * hop, 0, -0.04 * hop]
      b.swing = 0.25 * sway
      break
    }
    case 'wave': {
      const w = Math.sin(TAU * 2.2 * p.since)
      b.front = 150 + 14 * w
      b.bend = 24 * w
      b.tilt = 0.025 * Math.sin(TAU * p.since)
      break
    }
  }
  return b
}

/** Where the face goes and its features sit, in tiles from the head's centre; the turn moves the features toward +x and squeezes the far side. */
interface Face {
  r: number
  w: number
  top: number
  chin: number
  k: number
  turn: number
  ey: number
  /** The near eye (-x) and the far one: centre x and how much the turn squeezes it. */
  eyes: readonly [{ x: number; k: number }, { x: number; k: number }]
}

/** A point x from the face's middle, moved by the turn: the near side (-x) slides over whole, the far side bunches up. */
function across(r: number, turn: number, x: number): number {
  return 0.34 * r * turn + x * (x > 0 ? 1 - 0.3 * turn : 1 - 0.05 * turn)
}

function faceOf(look: Look, r: number, turn: number): Face {
  const F = FACES[look.face]
  const ex = 0.37 * r * F.w
  return {
    r,
    w: r * F.w,
    top: r * F.top,
    chin: r * F.chin,
    k: F.k,
    turn,
    ey: 0.08 * r,
    eyes: [
      { x: across(r, turn, -ex), k: 1 },
      { x: across(r, turn, ex), k: 1 - 0.3 * turn },
    ],
  }
}

function facePath(ctx: CanvasRenderingContext2D, f: Face) {
  const { w, top: t, chin: c, k } = f
  ctx.beginPath()
  ctx.moveTo(0, -t)
  ctx.bezierCurveTo(w * 0.552, -t, w, -t * 0.552, w, 0)
  ctx.bezierCurveTo(w, c * k, w * k, c, 0, c)
  ctx.bezierCurveTo(-w * k, c, -w, c * k, -w, 0)
  ctx.bezierCurveTo(-w, -t * 0.552, -w * 0.552, -t, 0, -t)
  ctx.closePath()
}

/** The hair, in face radii from the head's centre (the caller stretches them to the face): x, y, r triples for blob. The cap covers the crown behind every style but the curls and the spikes. */
const CAP = [0, -0.1, 1.07]
/** Long hair hanging behind the shoulders. */
const CURTAIN = [-0.8, 0.45, 0.42, 0.8, 0.45, 0.42, -0.82, 0.95, 0.38, 0.82, 0.95, 0.38, -0.72, 1.4, 0.32, 0.72, 1.4, 0.32, 0, 0.9, 0.72, 0, 1.35, 0.6]
/** A pigtail below its tie, for the +x side. */
const BUNCH = [0.17, 0.24, 0.28, 0.29, 0.6, 0.25, 0.25, 0.94, 0.2, 0.13, 1.2, 0.13]
/** The ponytail below its tie, sweeping out to -x. */
const TAIL = [-0.2, 0.12, 0.27, -0.46, 0.34, 0.26, -0.62, 0.69, 0.24, -0.65, 1.06, 0.21, -0.56, 1.4, 0.17, -0.4, 1.66, 0.11]
/** The curls: a ring of puffs round a big middle, down to the jaw. */
const CLOUD: readonly number[] = (() => {
  const out = [0, -0.1, 1.05]
  for (let a = 150; a <= 390; a += 30) out.push(Math.cos(a * DEG), -0.1 + Math.sin(a * DEG), 0.36)
  return out
})()
/** The fringes over the forehead: a scalloped one, long hair's side locks, a side-swept one, a row of curls. */
const FRINGE = [-0.6, -0.6, 0.32, -0.2, -0.78, 0.38, 0.25, -0.78, 0.38, 0.62, -0.58, 0.3]
const LOCKS = [-0.9, -0.1, 0.25, 0.9, -0.1, 0.25, -0.92, 0.32, 0.21, 0.92, 0.32, 0.21, -0.88, 0.66, 0.17, 0.88, 0.66, 0.17]
const SWEPT = [-0.58, -0.66, 0.34, -0.05, -0.84, 0.36, 0.42, -0.72, 0.3, 0.72, -0.46, 0.2]
const CURLS = [-0.84, -0.32, 0.2, -0.6, -0.6, 0.24, -0.22, -0.76, 0.26, 0.18, -0.77, 0.26, 0.56, -0.62, 0.24, 0.82, -0.34, 0.2]

/** A bunch's circles hung from its tie at (tx, ty): mirrored to side s and swung by angle a about the tie (+ swings the bottom toward -x). */
function swung(xyr: readonly number[], s: number, tx: number, ty: number, a: number): number[] {
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const out: number[] = []
  for (let i = 0; i < xyr.length; i += 3) {
    const x = s * xyr[i]
    const y = xyr[i + 1]
    out.push(tx + x * cos - y * sin, ty + x * sin + y * cos, xyr[i + 2])
  }
  return out
}

/** The spiky hair behind the head: seven spikes round the crown. */
function spikes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (let i = 0; i <= 14; i++) {
    const a = mix(165, 375, i / 14) * DEG
    const rr = (i % 2 === 1 ? 1.38 : 1) * r
    ctx.lineTo(Math.cos(a) * rr, -0.08 * r + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/** The spiky fringe: a zigzag over the forehead, five points down. */
function zigzag(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-0.97 * r, -0.12 * r)
  for (let i = 0; i <= 8; i++) ctx.lineTo(mix(-0.82, 0.82, i / 8) * r, (i % 2 === 0 ? -0.3 : -0.62) * r)
  ctx.lineTo(0.97 * r, -0.12 * r)
  ctx.quadraticCurveTo(0.95 * r, -0.95 * r, 0, -r)
  ctx.quadraticCurveTo(-0.95 * r, -0.95 * r, -0.97 * r, -0.12 * r)
  ctx.closePath()
}

/** The hair behind the head and body, with its ties. */
function hairBack(ctx: CanvasRenderingContext2D, look: Look, r: number, b: Body, turn: number, rim: Rim, detail: boolean) {
  const base = HAIR_COLOURS[look.hairColour]
  const shade = tint(base, INK, 0.25)
  if (look.hair === 'spiky') {
    inkPart(ctx, (c) => spikes(c, r), base, shade, 0.03, LINE, rim)
    return
  }
  const xyr = look.hair === 'curly' ? [...CLOUD] : [...CAP]
  // Hair ties: x, y, radius.
  const ties: number[] = []
  switch (look.hair) {
    case 'long':
      xyr.push(...CURTAIN)
      break
    case 'pigtails':
      for (const s of [-1, 1]) {
        xyr.push(...swung(BUNCH, s, s * 1.06, -0.26, b.swing + 0.3 * b.flow * turn))
        ties.push(s * 1.06, -0.26, 0.14)
      }
      break
    case 'ponytail':
      xyr.push(...swung(TAIL, 1, -0.8, -0.74, b.swing + 0.5 * b.flow))
      ties.push(-0.8, -0.74, 0.12)
      break
    case 'bun':
      // On top facing the closet, at the back turned.
      xyr.push(mix(0, -0.5, turn), mix(-1.2, -1.02, turn), 0.34)
      break
    case 'short':
    case 'curly':
      break
  }
  blob(
    ctx,
    xyr.map((v) => v * r),
    base,
    shade,
    0.035,
    LINE,
    rim,
  )
  if (ties.length > 0) {
    flatPart(
      ctx,
      (c) => {
        c.beginPath()
        for (let i = 0; i < ties.length; i += 3) oval(c, ties[i] * r, ties[i + 1] * r, ties[i + 2] * r, ties[i + 2] * r, 0)
      },
      look.hairColour === 'pink' ? OWN.tieOnPink : OWN.tie,
      LINE_DETAIL,
      rim,
    )
  }
  if (detail && look.hair === 'curly') {
    // A little curl drawn into each puff.
    ctx.beginPath()
    for (let i = 3; i < CLOUD.length; i += 3) {
      const x = CLOUD[i] * r
      const y = CLOUD[i + 1] * r
      ctx.moveTo(x + 0.13 * r, y)
      ctx.arc(x, y, 0.13 * r, 0, Math.PI * 1.3)
    }
    ctx.lineWidth = 0.05 * r
    ctx.strokeStyle = shade
    ctx.stroke()
  }
}

/** The hair over the face: a fringe, with locks down the sides for long hair, a row of curls, or a zigzag of spikes. */
function hairFront(ctx: CanvasRenderingContext2D, look: Look, r: number, rim: Rim) {
  const base = HAIR_COLOURS[look.hairColour]
  const shade = tint(base, INK, 0.25)
  if (look.hair === 'spiky') {
    inkPart(ctx, (c) => zigzag(c, r), base, shade, 0.025, LINE, rim)
    return
  }
  const xyr = look.hair === 'long' ? [...FRINGE, ...LOCKS] : look.hair === 'ponytail' ? SWEPT : look.hair === 'curly' ? CURLS : FRINGE
  blob(
    ctx,
    xyr.map((v) => v * r),
    base,
    shade,
    0.025,
    LINE,
    rim,
  )
}

/** The hat, in the hair's frame: it sits on the hair and stretches with the face. */
function hat(ctx: CanvasRenderingContext2D, look: Look, r: number, turn: number, rim: Rim, detail: boolean) {
  const c = COLOURS[look.hatColour]
  const s = shadeOf(c)
  const u = (v: number) => v * r
  switch (look.hat) {
    case 'none':
      return
    case 'cap':
      // The dome over the crown, the visor facing the closet or sticking out ahead, a button on top.
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          c2.ellipse(0, u(-0.36), u(1.06), u(0.8), 0, Math.PI, TAU)
          c2.closePath()
        },
        c,
        s,
        0.03,
        LINE,
        rim,
      )
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          oval(c2, u(mix(0, 0.8, turn)), u(-0.34), u(mix(0.92, 0.62, turn)), u(0.19), 0)
        },
        s,
        LINE,
        rim,
      )
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          oval(c2, 0, u(-1.16), u(0.09), u(0.07), 0)
        },
        s,
        LINE_DETAIL,
        rim,
      )
      return
    case 'bow': {
      // Two loops and a knot on top, a little to the side.
      ctx.save()
      ctx.translate(u(0.42), u(-0.98))
      ctx.rotate(0.3)
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          for (const sd of [-1, 1]) {
            c2.moveTo(0, 0)
            c2.bezierCurveTo(u(sd * 0.22), u(-0.42), u(sd * 0.62), u(-0.3), u(sd * 0.56), u(0.02))
            c2.bezierCurveTo(u(sd * 0.5), u(0.26), u(sd * 0.2), u(0.14), 0, 0)
          }
        },
        c,
        s,
        0.03,
        LINE,
        rim,
      )
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          oval(c2, 0, 0, u(0.13), u(0.12), 0)
        },
        s,
        LINE_DETAIL,
        rim,
      )
      ctx.restore()
      return
    }
    case 'ears': {
      // A headband with two round animal ears.
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          for (const sd of [-1, 1]) oval(c2, u(sd * 0.68), u(-1.0), u(0.36), u(0.36), 0)
        },
        c,
        s,
        0.03,
        LINE,
        rim,
      )
      if (!rim) {
        ctx.beginPath()
        for (const sd of [-1, 1]) oval(ctx, u(sd * 0.68), u(-0.97), u(0.2), u(0.2), 0)
        ctx.fillStyle = tint(c, OWN.white, 0.55)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(0, u(-0.08), u(1.02), Math.PI * 1.13, Math.PI * 1.87)
      tube(ctx, u(0.12), s, LINE_DETAIL, rim)
      return
    }
    case 'flowers': {
      // A crown of five big flowers along the crown of the head, leaves between them.
      const at = (i: number) => {
        const a = mix(205, 335, i / 4) * DEG
        return [Math.cos(a) * u(1), u(-0.1) + Math.sin(a) * u(0.98)] as const
      }
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          for (let i = 0; i < 4; i++) {
            const [x, y] = at(i + 0.5)
            oval(c2, x, y - u(0.1), u(0.2), u(0.09), (mix(205, 335, (i + 0.5) / 4) + 90) * DEG)
          }
        },
        OWN.leaf,
        LINE_DETAIL * 0.8,
        rim,
      )
      for (let i = 0; i < 5; i++) {
        const [x, y] = at(i)
        flatPart(
          ctx,
          (c2) => {
            c2.beginPath()
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * TAU + i
              oval(c2, x + Math.cos(a) * u(0.16), y + Math.sin(a) * u(0.16), u(0.15), u(0.15), 0)
            }
          },
          FLOWERS[i % FLOWERS.length],
          LINE_DETAIL * 0.8,
          rim,
        )
        if (!rim) {
          ctx.beginPath()
          oval(ctx, x, y, u(0.09), u(0.09), 0)
          ctx.fillStyle = i % 2 === 0 ? COLOR.star : '#FFA94D'
          ctx.fill()
        }
      }
      return
    }
    case 'chef':
      // A white band on the forehead and a tall puff over it.
      blob(
        ctx,
        [-0.5, -1.42, 0.42, 0.05, -1.62, 0.48, 0.58, -1.4, 0.42, 0, -1.2, 0.5].map(u),
        OWN.white,
        OWN.chefShade,
        0.03,
        LINE,
        rim,
      )
      inkPart(ctx, (c2) => roundRectPath(c2, u(-0.8), u(-1.1), u(1.6), u(0.48), u(0.12)), OWN.white, OWN.chefShade, 0.02, LINE, rim)
      if (detail) {
        ctx.beginPath()
        for (const x of [-0.4, 0, 0.4]) {
          ctx.moveTo(u(x), u(-1.02))
          ctx.lineTo(u(x * 1.1), u(-0.7))
        }
        ink(ctx, LINE_DETAIL * 0.6, null)
      }
      return
    case 'crown':
      // Gold, three points with balls on them, a ruby and two sapphires.
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          c2.moveTo(u(-0.66), u(-0.8))
          c2.lineTo(u(-0.78), u(-1.38))
          c2.lineTo(u(-0.38), u(-1.1))
          c2.lineTo(0, u(-1.52))
          c2.lineTo(u(0.38), u(-1.1))
          c2.lineTo(u(0.78), u(-1.38))
          c2.lineTo(u(0.66), u(-0.8))
          c2.quadraticCurveTo(0, u(-0.7), u(-0.66), u(-0.8))
          c2.closePath()
        },
        COLOR.star,
        COLOR.starShade,
        0.04,
        LINE,
        rim,
      )
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          for (const [x, y] of [
            [-0.78, -1.38],
            [0, -1.52],
            [0.78, -1.38],
          ] as const)
            oval(c2, u(x), u(y), u(0.08), u(0.08), 0)
        },
        COLOR.star,
        LINE_DETAIL,
        rim,
      )
      if (!rim) {
        flatPart(
          ctx,
          (c2) => {
            c2.beginPath()
            oval(c2, 0, u(-0.95), u(0.1), u(0.12), 0)
          },
          OWN.ruby,
          LINE_DETAIL * 0.7,
          null,
        )
        flatPart(
          ctx,
          (c2) => {
            c2.beginPath()
            for (const x of [-0.42, 0.42]) oval(c2, u(x), u(-0.92), u(0.07), u(0.08), 0)
          },
          OWN.sapphire,
          LINE_DETAIL * 0.7,
          null,
        )
      }
      return
    case 'wizard':
      // A wide brim and a tall cone bending back, with gold stars and a sparkle.
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          oval(c2, 0, u(-0.68), u(1.3), u(0.25), 0)
        },
        c,
        s,
        0.03,
        LINE,
        rim,
      )
      inkPart(
        ctx,
        (c2) => {
          c2.beginPath()
          c2.moveTo(u(-0.72), u(-0.74))
          c2.quadraticCurveTo(u(-0.45), u(-1.55), u(-0.5), u(-2.25))
          c2.quadraticCurveTo(u(0.25), u(-1.5), u(0.72), u(-0.74))
          c2.quadraticCurveTo(0, u(-0.6), u(-0.72), u(-0.74))
          c2.closePath()
        },
        c,
        s,
        0.04,
        LINE,
        rim,
      )
      if (!rim) {
        for (const [x, y, size] of [
          [0.12, -1.08, 0.15],
          [-0.28, -1.62, 0.1],
        ] as const) {
          starPath(ctx, u(x), u(y), u(size))
          ctx.fillStyle = COLOR.star
          ctx.fill()
          ink(ctx, LINE_DETAIL * 0.6, null)
        }
        sparklePath(ctx, u(0.3), u(-1.45), u(0.2))
        ctx.fillStyle = OWN.white
        ctx.fill()
      }
      return
  }
}

/** The face: ears, skin, then makeup, face paint and the features, all inside its outline, so a rim pass draws only the outline. */
function face(ctx: CanvasRenderingContext2D, look: Look, f: Face, b: Body, rim: Rim, detail: boolean) {
  const r = f.r
  const skin = SKINS[look.skin]
  for (const side of [-1, 1] as const) {
    // Turned, the far ear hides behind the face.
    if (side > 0 && f.turn > 0.5) continue
    flatPart(
      ctx,
      (c) => {
        c.beginPath()
        oval(c, side * f.w * mix(0.95, 0.88, f.turn), 0.12 * r, 0.16 * r, 0.21 * r, 0)
      },
      skin,
      LINE_DETAIL,
      rim,
    )
  }
  inkPart(ctx, (c) => facePath(c, f), skin, tint(skin, INK, 0.16), 0.03, LINE, rim)
  if (rim) return
  const eye = EYES[look.eyes]
  const ey = f.ey

  // Blush on both cheeks: soft ovals, or little hearts.
  const blush = look.blush
  if (blush !== 'none') {
    for (const [i, s] of ([-1, 1] as const).entries()) {
      const x = across(r, f.turn, s * 0.62 * f.w)
      const k = f.eyes[i].k
      if (blush === 'hearts') {
        heartPath(ctx, x, 0.42 * r, 0.3 * r * k)
        ctx.fillStyle = COLOR.heart
      } else {
        ctx.beginPath()
        oval(ctx, x, 0.42 * r, 0.17 * r * k, 0.1 * r, 0)
        ctx.fillStyle = BLUSH[blush]
      }
      ctx.fill()
    }
  }

  // Eye shadow: arcs over the eyes, one colour or the rainbow's five.
  const bands = SHADOWS[look.shadow]
  bands.forEach((colour, i) => {
    const off = bands.length > 1 ? (i - 0.5) * 0.07 * r : 0
    ctx.beginPath()
    for (const e of f.eyes) {
      const rx = (eye.lidX * r + off) * e.k
      const ry = eye.lid * r + off
      ctx.moveTo(e.x + rx * Math.cos(Math.PI * 1.1), ey + ry * Math.sin(Math.PI * 1.1))
      ctx.ellipse(e.x, ey, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9)
    }
    ctx.lineWidth = (bands.length > 1 ? 0.075 : 0.13) * r
    ctx.strokeStyle = colour
    ctx.stroke()
  })

  // Face paint, under the features: a star or a heart on the near cheek, whiskers on both, a butterfly round the near eye.
  const px = across(r, f.turn, -0.6 * f.w)
  switch (look.paint) {
    case 'none':
      break
    case 'star':
      starPath(ctx, px, 0.45 * r, 0.17 * r)
      ctx.fillStyle = COLOR.star
      ctx.fill()
      ink(ctx, LINE_DETAIL * 0.7, null)
      break
    case 'heart':
      heartPath(ctx, px, 0.45 * r, 0.3 * r)
      ctx.fillStyle = OWN.heartPaint
      ctx.fill()
      ink(ctx, LINE_DETAIL * 0.7, null)
      break
    case 'whiskers':
      ctx.beginPath()
      for (const s of [-1, 1]) {
        for (const k of [-1, 0, 1]) {
          ctx.moveTo(across(r, f.turn, s * 0.42 * f.w), (0.48 + k * 0.08) * r)
          ctx.lineTo(across(r, f.turn, s * 0.88 * f.w), (0.46 + k * 0.15) * r)
        }
      }
      ink(ctx, LINE_DETAIL * 0.75, null)
      break
    case 'butterfly': {
      const e = f.eyes[0]
      const wing = (dx: number, dy: number, rx: number, ry: number, rot: number) => oval(ctx, e.x + dx * r, ey + dy * r, rx * r, ry * r, rot)
      ctx.beginPath()
      wing(-0.26, -0.13, 0.2, 0.15, -0.5)
      wing(0.26, -0.13, 0.2, 0.15, 0.5)
      ctx.fillStyle = OWN.butterfly
      ctx.fill()
      ink(ctx, LINE_DETAIL * 0.6, null)
      ctx.beginPath()
      wing(-0.19, 0.22, 0.13, 0.1, 0.6)
      wing(0.19, 0.22, 0.13, 0.1, -0.6)
      ctx.fillStyle = OWN.butterflyLow
      ctx.fill()
      ink(ctx, LINE_DETAIL * 0.6, null)
      if (detail) {
        ctx.beginPath()
        for (const s of [-1, 1]) oval(ctx, e.x + s * 0.3 * r, ey - 0.17 * r, 0.04 * r, 0.04 * r, 0)
        ctx.fillStyle = OWN.white
        ctx.fill()
      }
      break
    }
  }

  // The eyes; a blink shuts all but the happy ones, which are shut already.
  for (const e of f.eyes) {
    const rx = eye.rx * r * e.k
    const ry = eye.ry * r
    if (b.closed && look.eyes !== 'happy') {
      lidPath(ctx, e.x, ey, Math.max(rx, 0.15 * r), false)
      ink(ctx, LINE_DETAIL, null)
      continue
    }
    switch (look.eyes) {
      case 'dots':
        ctx.beginPath()
        oval(ctx, e.x, ey, rx, ry, 0)
        ctx.fillStyle = INK
        ctx.fill()
        break
      case 'big':
        ctx.beginPath()
        oval(ctx, e.x, ey, rx, ry, 0)
        ctx.fillStyle = INK
        ctx.fill()
        ctx.beginPath()
        oval(ctx, e.x - rx * 0.3, ey - ry * 0.38, rx * 0.45, rx * 0.45, 0)
        oval(ctx, e.x + rx * 0.35, ey + ry * 0.42, rx * 0.2, rx * 0.2, 0)
        ctx.fillStyle = OWN.white
        ctx.fill()
        break
      case 'happy':
        lidPath(ctx, e.x, ey + 0.05 * r, rx, true)
        ink(ctx, LINE_DETAIL * 1.2, null)
        break
      case 'sleepy':
        // The lower half of an eye under a heavy lid.
        ctx.beginPath()
        ctx.ellipse(e.x, ey, rx, ry, 0, 0, Math.PI)
        ctx.closePath()
        ctx.fillStyle = INK
        ctx.fill()
        ctx.beginPath()
        oval(ctx, e.x - rx * 0.3, ey + ry * 0.38, rx * 0.25, rx * 0.25, 0)
        ctx.fillStyle = OWN.white
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(e.x - rx * 1.25, ey - 0.01 * r)
        ctx.quadraticCurveTo(e.x, ey - 0.05 * r, e.x + rx * 1.25, ey - 0.01 * r)
        ink(ctx, LINE_DETAIL, null)
        break
      case 'sparkle':
        // Big eyes with a violet glow below and star glints.
        ctx.beginPath()
        oval(ctx, e.x, ey, rx, ry, 0)
        ctx.fillStyle = INK
        ctx.fill()
        ctx.beginPath()
        oval(ctx, e.x, ey + ry * 0.24, rx * 0.8, ry * 0.62, 0)
        ctx.fillStyle = OWN.iris
        ctx.fill()
        sparklePath(ctx, e.x - rx * 0.28, ey - ry * 0.3, rx * 1.15)
        ctx.fillStyle = OWN.white
        ctx.fill()
        sparklePath(ctx, e.x + rx * 0.4, ey + ry * 0.38, rx * 0.55)
        ctx.fill()
        break
    }
  }

  // The nose: a little button, a dot, or a big red clown's ball.
  const nx = across(r, f.turn, 0) + 0.07 * r * f.turn
  const ny = 0.27 * r
  switch (look.nose) {
    case 'button':
      flatPart(
        ctx,
        (c) => {
          c.beginPath()
          oval(c, nx, ny, 0.1 * r, 0.075 * r, 0)
        },
        tint(skin, '#E0607A', 0.25),
        LINE_DETAIL * 0.65,
        null,
      )
      break
    case 'dot':
      ctx.beginPath()
      oval(ctx, nx, ny, 0.045 * r, 0.04 * r, 0)
      ctx.fillStyle = INK
      ctx.fill()
      break
    case 'clown':
      inkPart(
        ctx,
        (c) => {
          c.beginPath()
          oval(c, nx, ny + 0.02 * r, 0.19 * r, 0.19 * r, 0)
        },
        OWN.clown,
        shadeOf(OWN.clown),
        0.025,
        LINE_DETAIL,
        null,
      )
      ctx.beginPath()
      oval(ctx, nx - 0.07 * r, ny - 0.06 * r, 0.06 * r, 0.04 * r, -0.5)
      ctx.fillStyle = OWN.white
      ctx.fill()
      break
  }

  // The mouth, lips coloured under it.
  ctx.save()
  ctx.translate(across(r, f.turn, 0) + 0.02 * r * f.turn, Math.max(0.52 * r, 0.54 * f.chin))
  ctx.scale(1 - 0.15 * f.turn, 1)
  const lip = look.lips === 'none' ? null : LIPS[look.lips]
  switch (look.mouth) {
    case 'smile':
    case 'tongue':
      if (lip) {
        ctx.beginPath()
        ctx.moveTo(-0.21 * r, -0.03 * r)
        ctx.quadraticCurveTo(0, -0.17 * r, 0.21 * r, -0.03 * r)
        ctx.quadraticCurveTo(0, 0.2 * r, -0.21 * r, -0.03 * r)
        ctx.closePath()
        ctx.fillStyle = lip
        ctx.fill()
      }
      if (look.mouth === 'tongue') {
        ctx.beginPath()
        ctx.moveTo(-0.03 * r, 0.03 * r)
        ctx.bezierCurveTo(-0.04 * r, 0.25 * r, 0.15 * r, 0.25 * r, 0.13 * r, 0.02 * r)
        ctx.closePath()
        ctx.fillStyle = OWN.tongue
        ctx.fill()
        ink(ctx, LINE_DETAIL * 0.8, null)
      }
      ctx.beginPath()
      ctx.arc(0, -0.13 * r, 0.18 * r, 0.22 * Math.PI, 0.78 * Math.PI)
      ink(ctx, LINE_DETAIL, null)
      break
    case 'grin': {
      // A wide D with a row of teeth along its top.
      const trace = () => {
        ctx.beginPath()
        ctx.moveTo(-0.21 * r, -0.05 * r)
        ctx.lineTo(0.21 * r, -0.05 * r)
        ctx.ellipse(0, -0.05 * r, 0.21 * r, 0.24 * r, 0, 0, Math.PI)
        ctx.closePath()
      }
      if (lip) {
        trace()
        ctx.lineWidth = 0.15 * r
        ctx.strokeStyle = lip
        ctx.stroke()
      }
      trace()
      ctx.fillStyle = OWN.mouth
      ctx.fill()
      ctx.save()
      trace()
      ctx.clip()
      ctx.fillStyle = OWN.white
      ctx.fillRect(-0.25 * r, -0.06 * r, 0.5 * r, 0.1 * r)
      ctx.restore()
      trace()
      ink(ctx, LINE_DETAIL, null)
      break
    }
    case 'open': {
      const trace = () => {
        ctx.beginPath()
        oval(ctx, 0, 0.03 * r, 0.11 * r, 0.14 * r, 0)
      }
      if (lip) {
        trace()
        ctx.lineWidth = 0.14 * r
        ctx.strokeStyle = lip
        ctx.stroke()
      }
      trace()
      ctx.fillStyle = OWN.mouth
      ctx.fill()
      ctx.save()
      trace()
      ctx.clip()
      ctx.beginPath()
      oval(ctx, 0, 0.16 * r, 0.09 * r, 0.06 * r, 0)
      ctx.fillStyle = OWN.tongue
      ctx.fill()
      ctx.restore()
      trace()
      ink(ctx, LINE_DETAIL, null)
      break
    }
  }
  if (look.lips === 'glitter') {
    ctx.fillStyle = OWN.white
    for (const [x, y, size] of [
      [-0.11, -0.03, 0.11],
      [0.1, 0.05, 0.09],
      [0.02, -0.08, 0.07],
    ] as const) {
      sparklePath(ctx, x * r, y * r, size * r)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Round glasses over the eyes: tinted lenses in a pink frame, the bridge, the arms back to the ears (the far one hides when turned). */
function glasses(ctx: CanvasRenderingContext2D, f: Face) {
  const r = f.r
  const [a, b] = f.eyes
  const lx = 0.28 * r
  const ly = 0.26 * r
  const lens = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    for (const e of f.eyes) oval(c, e.x, f.ey, lx * e.k, ly, 0)
  }
  const alpha = ctx.globalAlpha
  lens(ctx)
  ctx.globalAlpha = alpha * 0.5
  ctx.fillStyle = OWN.lens
  ctx.fill()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(a.x + lx * a.k, f.ey - 0.04 * r)
  ctx.quadraticCurveTo((a.x + b.x) / 2, f.ey - 0.16 * r, b.x - lx * b.k, f.ey - 0.04 * r)
  ctx.moveTo(a.x - lx, f.ey - 0.06 * r)
  ctx.lineTo(-f.w * 0.96, f.ey - 0.1 * r)
  if (f.turn < 0.5) {
    ctx.moveTo(b.x + lx * b.k, f.ey - 0.06 * r)
    ctx.lineTo(f.w * 0.96, f.ey - 0.1 * r)
  }
  tube(ctx, 0.06 * r, OWN.frame, LINE_DETAIL * 0.6, null)
  lens(ctx)
  tube(ctx, 0.075 * r, OWN.frame, LINE_DETAIL * 0.6, null)
  // A glint on each lens.
  ctx.beginPath()
  for (const e of f.eyes) {
    const gx = 0.17 * r * e.k
    const gy = 0.17 * r
    ctx.moveTo(e.x + gx * Math.cos(Math.PI * 1.15), f.ey + gy * Math.sin(Math.PI * 1.15))
    ctx.ellipse(e.x, f.ey, gx, gy, 0, Math.PI * 1.15, Math.PI * 1.42)
  }
  ctx.lineWidth = 0.05 * r
  ctx.strokeStyle = OWN.white
  ctx.stroke()
}

/** One arm from its shoulder, elbow bent by `bend`, a round mitten hand at the end (a tiny circle in the tube's path, so the wrist has no seam), a short sleeve over the top. */
function arm(ctx: CanvasRenderingContext2D, look: Look, g: Rig, side: -1 | 1, angle: number, bend: number, turn: number, rim: Rim) {
  const sx = side * (g.sw * mix(1, 0.9, turn) - g.armW * 0.3)
  const sy = g.shoulderY + 0.075
  const a = angle * DEG
  const a2 = (angle + bend) * DEG
  const half = g.armLen / 2
  const ex = sx + Math.sin(a) * half
  const ey = sy + Math.cos(a) * half
  const hx = ex + Math.sin(a2) * half
  const hy = ey + Math.cos(a2) * half
  const hr = g.armW * 0.24
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.lineTo(hx, hy)
  ctx.moveTo(hx + hr, hy)
  ctx.arc(hx, hy, hr, 0, TAU)
  tube(ctx, g.armW, SKINS[look.skin], LINE_DETAIL, rim)
  // A dress puffs its sleeves.
  const dress = look.top === 'dress' || look.top === 'stars'
  const len = dress ? 0.05 : 0.11
  ctx.beginPath()
  ctx.moveTo(sx, sy - 0.015)
  ctx.lineTo(sx + Math.sin(a) * len, sy + Math.cos(a) * len)
  tube(ctx, g.armW + (dress ? 0.08 : 0.045), topColour(look), LINE_DETAIL, rim)
}

/** The torso's outline: shoulders, the sides (bulging with a round tummy), down to a shirt's hem at the hips or flaring out to a dress's hem over the thighs. */
function topPath(ctx: CanvasRenderingContext2D, g: Rig, turn: number, dress: boolean) {
  const sw = g.sw * mix(1, 0.9, turn)
  const hw = g.hw * mix(1, 0.92, turn)
  const bl = g.belly
  const y0 = g.shoulderY - 0.01
  const yw = g.hipY - 0.05
  const y1 = dress ? g.hipY + 0.2 - 0.25 * (g.hipY + 0.62) : g.hipY + 0.035
  const w1 = dress ? hw + 0.11 : hw
  ctx.beginPath()
  ctx.moveTo(-sw * 0.5, y0)
  ctx.quadraticCurveTo(-sw, y0, -sw, y0 + 0.08)
  if (dress) {
    ctx.bezierCurveTo(-sw - bl, mix(y0, yw, 0.5), -hw - bl, yw - 0.06, -hw, yw)
    ctx.lineTo(-w1, y1)
  } else {
    ctx.bezierCurveTo(-sw - bl, mix(y0, y1, 0.45), -hw - bl * 1.3, y1 - 0.12, -hw, y1)
  }
  ctx.quadraticCurveTo(0, y1 + (dress ? 0.06 : 0.03), w1, y1)
  if (dress) {
    ctx.lineTo(hw, yw)
    ctx.bezierCurveTo(hw + bl, yw - 0.06, sw + bl, mix(y0, yw, 0.5), sw, y0 + 0.08)
  } else {
    ctx.bezierCurveTo(hw + bl * 1.3, y1 - 0.12, sw + bl, mix(y0, y1, 0.45), sw, y0 + 0.08)
  }
  ctx.quadraticCurveTo(sw, y0, sw * 0.5, y0)
  ctx.closePath()
}

/** Where the star dress's stars and dots sit: across the dress's half-width and down from the shoulders to the hem (and each star's size). */
const STARRY = [
  [-0.45, 0.2, 0.04],
  [0.4, 0.36, 0.035],
  [-0.12, 0.6, 0.045],
  [0.55, 0.8, 0.04],
  [-0.62, 0.9, 0.035],
  [0.12, 0.95, 0.03],
] as const
const DOTS = [
  [0.1, 0.14],
  [-0.55, 0.5],
  [0.3, 0.64],
  [-0.3, 0.84],
  [0.72, 0.55],
  [0, 0.34],
] as const

/** The torso in its top: a plain tee, stripes, a dress with a ribbon at the waist, or the star dress. */
function torso(ctx: CanvasRenderingContext2D, look: Look, g: Rig, turn: number, rim: Rim) {
  const dress = look.top === 'dress' || look.top === 'stars'
  const c = topColour(look)
  const trace = (c2: CanvasRenderingContext2D) => topPath(c2, g, turn, dress)
  inkPart(ctx, trace, c, look.top === 'stars' ? OWN.nightShade : shadeOf(c), 0.05, LINE, rim)
  if (rim || look.top === 'tee') return
  ctx.save()
  trace(ctx)
  ctx.clip()
  const spread = g.hw + 0.08
  const down = (v: number) => mix(g.shoulderY, g.hipY + 0.2, v)
  if (look.top === 'stripes') {
    ctx.fillStyle = look.topColour === 'white' ? COLOURS.blue : tint(c, OWN.white, 0.72)
    for (let y = g.shoulderY + 0.1; y < g.hipY + 0.04; y += 0.115) ctx.fillRect(-0.6, y, 1.2, 0.05)
  } else if (look.top === 'dress') {
    ctx.fillStyle = tint(c, OWN.white, 0.6)
    ctx.fillRect(-0.6, g.hipY - 0.1, 1.2, 0.045)
  } else {
    ctx.fillStyle = COLOR.star
    for (const [x, y, size] of STARRY) {
      starPath(ctx, x * spread, down(y), size)
      ctx.fill()
    }
    ctx.beginPath()
    for (const [x, y] of DOTS) oval(ctx, x * spread, down(y), 0.012, 0.012, 0)
    ctx.fillStyle = OWN.white
    ctx.fill()
  }
  ctx.restore()
  trace(ctx)
  ink(ctx, LINE, null)
}

/** The legs from the hips to the shoes, knees bending (out facing the closet, forward turned) when a foot comes up; the bottom over them. */
function legs(ctx: CanvasRenderingContext2D, look: Look, g: Rig, b: Body, turn: number, rim: Rim, detail: boolean) {
  const skin = SKINS[look.skin]
  const cloth = COLOURS[look.bottomColour]
  const hipY = g.hipY - b.bob
  const ankle = -g.shoeRy * 1.3
  // Half a straight leg, so a leg standing is straight and a lifted foot bends the knee.
  const bone = (ankle - g.hipY) / 2
  for (const side of [-1, 1] as const) {
    const i = side < 0 ? 0 : 2
    const ix = side * g.hipX * mix(1, 0.45, turn)
    const fx = side * g.hipX * mix(1.1, 0.35, turn) + b.feet[i]
    const fy = b.feet[i + 1]
    const ax = fx - g.shoeRx * 0.25 * turn
    const ay = ankle + fy
    const d = Math.hypot(ax - ix, ay - hipY)
    const bend = Math.sqrt(Math.max(0, bone * bone - (d * d) / 4)) * mix(side, 1, turn)
    const kx = (ix + ax) / 2 + ((ay - hipY) / d) * bend
    const ky = (hipY + ay) / 2 - ((ax - ix) / d) * bend
    ctx.beginPath()
    ctx.moveTo(ix, hipY)
    ctx.lineTo(kx, ky)
    ctx.lineTo(ax, ay)
    tube(ctx, g.legW, skin, LINE_DETAIL, rim)
    if (look.bottom === 'pants') {
      ctx.beginPath()
      ctx.moveTo(ix, hipY)
      ctx.lineTo(kx, ky)
      ctx.lineTo(mix(kx, ax, 0.92), mix(ky, ay, 0.92))
      tube(ctx, g.legW + 0.035, cloth, LINE_DETAIL, rim)
    } else if (look.bottom === 'shorts') {
      ctx.beginPath()
      ctx.moveTo(ix, hipY)
      ctx.lineTo(mix(ix, kx, 0.62), mix(hipY, ky, 0.62))
      tube(ctx, g.legW + 0.05, cloth, LINE_DETAIL, rim)
    }
    shoe(ctx, look, g, fx, fy, ax, ay, kx, ky, turn, rim, detail)
  }
  const w = g.hw * mix(1, 0.92, turn) + 0.012
  const shade = shadeOf(cloth)
  switch (look.bottom) {
    case 'pants':
    case 'shorts':
      inkPart(ctx, (c) => roundRectPath(c, -w, hipY - 0.11, 2 * w, 0.19, 0.07), cloth, shade, 0.04, LINE, rim)
      break
    case 'skirt': {
      const y1 = hipY + 0.2
      const trace = (c: CanvasRenderingContext2D) => {
        c.beginPath()
        c.moveTo(-w, hipY - 0.11)
        c.lineTo(w, hipY - 0.11)
        c.lineTo(w + 0.1, y1)
        c.quadraticCurveTo(0, y1 + 0.05, -w - 0.1, y1)
        c.closePath()
      }
      inkPart(ctx, trace, cloth, shade, 0.045, LINE, rim)
      if (detail) {
        ctx.beginPath()
        for (const x of [-0.5, 0, 0.5]) {
          ctx.moveTo(x * w * 0.8, hipY - 0.02)
          ctx.lineTo(x * (w + 0.1) * 0.85, y1 + 0.01)
        }
        ink(ctx, LINE_DETAIL * 0.7, null)
      }
      break
    }
    case 'tutu': {
      // A puffy ring round the hips, much wider than them, two rows of puffs.
      const xyr: number[] = []
      for (let k = 0; k <= 6; k++) xyr.push(mix(-w - 0.08, w + 0.08, k / 6), hipY + 0.03 + (k % 2) * 0.025, 0.075)
      for (let k = 0; k <= 4; k++) xyr.push(mix(-w, w, k / 4), hipY - 0.04, 0.07)
      blob(ctx, xyr, tint(cloth, OWN.white, 0.35), cloth, 0.035, LINE, rim)
      break
    }
  }
}

/** A shoe whose sole is at (fx, fy), on a shin from the ankle (ax, ay) to the knee (kx, ky): a sneaker with a white sole, a boot with a cuff, a sandal showing the toes, a tall rain boot with a duck on the toe. */
function shoe(ctx: CanvasRenderingContext2D, look: Look, g: Rig, fx: number, fy: number, ax: number, ay: number, kx: number, ky: number, turn: number, rim: Rim, detail: boolean) {
  const c = COLOURS[look.shoesColour]
  const cx = fx + g.shoeRx * 0.25 * turn
  const rx = g.shoeRx * mix(0.9, 1, turn)
  const ry = g.shoeRy
  const shin = Math.hypot(kx - ax, ky - ay)
  /** The point h up the shin from the ankle. */
  const up = (h: number) => {
    const k = Math.min(1, h / shin)
    return [mix(ax, kx, k), mix(ay, ky, k)] as const
  }
  const foot = (grow: number) => (c2: CanvasRenderingContext2D) => {
    c2.beginPath()
    oval(c2, cx, fy - ry * grow, rx * grow, ry * grow, 0)
  }
  /** A tube up the shin from the ankle, from h0 to h1. */
  const shaft = (h0: number, h1: number, w: number, colour: string, r2: Rim) => {
    const [x0, y0] = up(h0)
    const [x1, y1] = up(h1)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    tube(ctx, w, colour, LINE_DETAIL, r2)
  }
  /** Fills the bottom of a shoe's outline in another colour, then inks the outline again. */
  const sole = (trace: (c2: CanvasRenderingContext2D) => void, colour: string, from: number) => {
    ctx.save()
    trace(ctx)
    ctx.clip()
    ctx.fillStyle = colour
    ctx.fillRect(cx - rx * 1.3, fy - from, rx * 2.6, from + 0.05)
    ctx.restore()
    trace(ctx)
    ink(ctx, LINE_DETAIL, null)
  }
  switch (look.shoes) {
    case 'sneakers': {
      const trace = foot(1)
      flatPart(ctx, trace, c, LINE_DETAIL, rim)
      if (!rim) sole(trace, OWN.white, ry * 0.55)
      if (detail) {
        ctx.beginPath()
        ctx.moveTo(cx - rx * 0.3, fy - ry * 1.55)
        ctx.lineTo(cx + rx * 0.2, fy - ry * 1.55)
        ctx.lineWidth = ry * 0.28
        ctx.strokeStyle = OWN.white
        ctx.stroke()
      }
      return
    }
    case 'boots': {
      shaft(0, 0.16, g.legW + 0.045, c, rim)
      shaft(0.13, 0.16, g.legW + 0.075, tint(c, OWN.white, 0.5), rim)
      const trace = foot(1.08)
      flatPart(ctx, trace, c, LINE_DETAIL, rim)
      if (!rim) sole(trace, OWN.heel, ry * 0.5)
      return
    }
    case 'sandals': {
      flatPart(ctx, foot(1), SKINS[look.skin], LINE_DETAIL, rim)
      flatPart(ctx, (c2) => roundRectPath(c2, cx - rx * 1.1, fy - 0.045, rx * 2.2, 0.05, 0.022), c, LINE_DETAIL, rim)
      if (!rim) {
        // A wide strap over the toes and one round the ankle.
        ctx.beginPath()
        ctx.moveTo(cx - rx * 0.6, fy - ry * 1.15)
        ctx.lineTo(cx + rx * 0.55, fy - ry * 1.15)
        ctx.moveTo(ax - g.legW * 0.55, ay)
        ctx.lineTo(ax + g.legW * 0.55, ay)
        tube(ctx, 0.032, c, LINE_DETAIL * 0.6, null)
      }
      return
    }
    case 'rainboots': {
      shaft(0, 0.3, g.legW + 0.055, c, rim)
      const trace = foot(1.15)
      flatPart(ctx, trace, c, LINE_DETAIL, rim)
      if (rim) return
      // The rubber's shine down the shaft, and a duck on the toe: an orange beak and an eye.
      const [sx, sy] = up(0.05)
      const [qx, qy] = up(0.24)
      ctx.beginPath()
      ctx.moveTo(sx - g.legW * 0.3, sy)
      ctx.lineTo(qx - g.legW * 0.3, qy)
      ctx.lineWidth = 0.022
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.stroke()
      const bx = cx + rx * 1.05 * turn
      flatPart(
        ctx,
        (c2) => {
          c2.beginPath()
          oval(c2, bx, fy - ry, rx * 0.42, ry * 0.36, 0)
        },
        OWN.beak,
        LINE_DETAIL * 0.6,
        null,
      )
      if (detail) {
        ctx.beginPath()
        oval(ctx, bx - rx * mix(0.3, 0.45, turn), fy - ry * 1.7, 0.012, 0.012, 0)
        ctx.fillStyle = INK
        ctx.fill()
      }
      return
    }
  }
}

/** The cape behind the body: wider than it at the hem, flowing back the faster the person goes. */
function cape(ctx: CanvasRenderingContext2D, look: Look, g: Rig, b: Body, t: number, turn: number, rim: Rim) {
  const c = COLOURS[look.extraColour]
  const y0 = g.shoulderY + 0.02
  const y1 = g.hipY + 0.3 - 0.12 * b.flow * turn
  const wave = 0.02 * Math.sin(TAU * 1.2 * t) + 0.03 * b.flow * Math.sin(TAU * 3 * t)
  const back = -0.28 * b.flow * turn
  const l0 = -g.sw * mix(0.85, 0.75, turn)
  const r0 = g.sw * mix(0.85, 0.3, turn)
  const l1 = mix(-g.sw - 0.15, -g.sw - 0.2, turn) + back + wave
  const r1 = mix(g.sw + 0.15, -0.02, turn) + back * 0.6 + wave
  inkPart(
    ctx,
    (c2) => {
      c2.beginPath()
      c2.moveTo(l0, y0)
      c2.quadraticCurveTo(l1 + 0.03, mix(y0, y1, 0.5), l1, y1)
      c2.quadraticCurveTo(mix(l1, r1, 0.25), y1 + 0.05, mix(l1, r1, 0.5), y1 + 0.01)
      c2.quadraticCurveTo(mix(l1, r1, 0.75), y1 + 0.05, r1, y1)
      c2.quadraticCurveTo(r1 - 0.03, mix(y0, y1, 0.5), r0, y0)
      c2.closePath()
    },
    c,
    shadeOf(c),
    0.05,
    LINE,
    rim,
  )
}

/** Fairy wings on the back, pale and shimmering between blue and pink, fluttering; turned, both sweep back and the far pair shows less. */
function wings(ctx: CanvasRenderingContext2D, g: Rig, t: number, turn: number, rim: Rim, detail: boolean) {
  const flap = 0.1 * Math.sin(TAU * 1.3 * t)
  const glow = 0.5 + 0.5 * Math.sin(TAU * 0.6 * t)
  // The far (+x) pair first.
  for (const side of [1, -1] as const) {
    const dir = side < 0 ? -1 : mix(1, -0.55, turn)
    if (Math.abs(dir) < 0.08) continue
    ctx.save()
    ctx.translate(mix(side * 0.05, side > 0 ? -0.02 : -0.1, turn), g.shoulderY + mix(0.15, side > 0 ? 0.09 : 0.15, turn))
    ctx.scale(dir, 1)
    ctx.rotate(-flap)
    const trace = (c: CanvasRenderingContext2D) => {
      c.beginPath()
      oval(c, 0.2, -0.12, 0.22, 0.14, -0.6)
      oval(c, 0.15, 0.08, 0.14, 0.085, 0.45)
    }
    flatPart(ctx, trace, OWN.wing, LINE_DETAIL, rim)
    if (!rim) {
      const alpha = ctx.globalAlpha
      trace(ctx)
      ctx.globalAlpha = alpha * glow
      ctx.fillStyle = OWN.wingShine
      ctx.fill()
      ctx.globalAlpha = alpha * (1 - glow)
      ctx.fillStyle = OWN.wingBlush
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.moveTo(0.03, -0.02)
      ctx.lineTo(0.3, -0.2)
      ctx.moveTo(0.03, 0.01)
      ctx.lineTo(0.2, 0.1)
      ctx.lineWidth = 0.014
      ctx.strokeStyle = OWN.wingVein
      ctx.stroke()
      trace(ctx)
      ink(ctx, LINE_DETAIL, null)
      if (detail) {
        sparklePath(ctx, 0.26, -0.15, 0.06 + 0.03 * glow)
        ctx.fillStyle = OWN.white
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

/** A scarf round the neck, its end hanging down the front and streaming back on the move. */
function scarf(ctx: CanvasRenderingContext2D, look: Look, g: Rig, b: Body, turn: number, rim: Rim, detail: boolean) {
  const c = COLOURS[look.extraColour]
  const s = shadeOf(c)
  const y = g.shoulderY + 0.005
  const w = g.sw * mix(0.95, 0.88, turn) + 0.025
  const dx = 0.03 * turn
  inkPart(ctx, (c2) => roundRectPath(c2, dx - w, y - 0.065, 2 * w, 0.125, 0.06), c, s, 0.035, LINE, rim)
  ctx.save()
  ctx.translate(dx + mix(-0.09, -0.05, turn), y + 0.02)
  ctx.rotate(0.12 + 0.9 * b.flow * turn)
  const tail = (c2: CanvasRenderingContext2D) => roundRectPath(c2, -0.048, -0.03, 0.096, 0.27, 0.04)
  inkPart(ctx, tail, c, s, 0.03, LINE_DETAIL, rim)
  if (!rim) {
    ctx.save()
    tail(ctx)
    ctx.clip()
    ctx.fillStyle = tint(c, OWN.white, 0.55)
    ctx.fillRect(-0.06, 0.09, 0.12, 0.04)
    ctx.fillRect(-0.06, 0.17, 0.12, 0.04)
    ctx.restore()
    tail(ctx)
    ink(ctx, LINE_DETAIL, null)
    if (detail) {
      ctx.beginPath()
      for (const x of [-0.028, 0, 0.028]) {
        ctx.moveTo(x, 0.24)
        ctx.lineTo(x * 1.1, 0.285)
      }
      ink(ctx, LINE_DETAIL * 0.7, null)
    }
  }
  ctx.restore()
}

/** Draws the person with its feet's centre at the origin, facing +x, one unit a tile, y down; the caller mirrors for -x. With a rim, only the outline, in the rim's colour (a night room draws the rim pass first). */
export function drawPerson(ctx: CanvasRenderingContext2D, look: Look, pose: Pose, rim: Rim): void {
  const g = rigOf(look)
  const turn = clamp01(pose.turn)
  const b = bodyOf(pose, turn, g)
  const f = faceOf(look, g.r, turn)
  const F = FACES[look.face]
  const detail = !rim && pen.px >= 70
  const squash = clamp01(pose.squash)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Squashed about the feet after a landing; a dance sways it all about them and hops it.
  ctx.scale(1 + 0.12 * squash, 1 - 0.13 * squash)
  ctx.rotate(b.tilt)
  ctx.translate(0, -b.rise)
  /** Everything above the hips: bobbed up and leaned forward about the hips. */
  const upper = (draw: () => void) => {
    ctx.save()
    ctx.translate(0, g.hipY - b.bob)
    ctx.rotate(b.lean)
    ctx.translate(0, -g.hipY)
    draw()
    ctx.restore()
  }
  /** The head's own frame, its centre at the origin, moved dx; `hair` also stretches it to the face's shape, for the hair and the hat. */
  const head = (dx: number, hair: boolean, draw: () => void) =>
    upper(() => {
      ctx.translate(dx, g.headY)
      if (hair) ctx.scale(F.w, F.top)
      draw()
    })

  head(-0.05 * g.r * turn, true, () => hairBack(ctx, look, g.r, b, turn, rim, detail))
  upper(() => {
    if (look.extra === 'cape') cape(ctx, look, g, b, pose.t, turn, rim)
    if (look.extra === 'wings') wings(ctx, g, pose.t, turn, rim, detail)
    arm(ctx, look, g, -1, b.back, b.bend, turn, rim)
  })
  legs(ctx, look, g, b, turn, rim, detail)
  upper(() => {
    torso(ctx, look, g, turn, rim)
    // The cape's gold clasp, just under the chin.
    if (look.extra === 'cape') {
      flatPart(
        ctx,
        (c) => {
          c.beginPath()
          oval(c, 0.04 * turn, g.shoulderY + 0.06, 0.038, 0.038, 0)
        },
        COLOR.star,
        LINE_DETAIL,
        rim,
      )
    }
    arm(ctx, look, g, 1, b.front, b.bend, turn, rim)
  })
  head(0, false, () => face(ctx, look, f, b, rim, detail))
  head(0.06 * g.r * turn, true, () => {
    hairFront(ctx, look, g.r, rim)
    hat(ctx, look, g.r, turn, rim, detail)
  })
  // The glasses lie inside the face's outline, so a rim pass skips them.
  if (look.extra === 'glasses' && !rim) head(0, false, () => glasses(ctx, f))
  if (look.extra === 'scarf') upper(() => scarf(ctx, look, g, b, turn, rim, detail))
  ctx.restore()
}

/** How far above the feet the top of the person's hair reaches, in tiles: for framing. A tall hat (the chef's, the wizard's) reaches up to 0.45 more. */
export function personTop(look: Look): number {
  return HEIGHTS[look.height].top
}

/**
 * The box a picture of the person frames for `zoom`, [centre x, centre y, width, height]
 * in tiles from the feet: the whole person in one box for every height and build (so
 * their tiles show the difference), the face's parts close on the head or on their own
 * feature, the clothes on their part of the body.
 */
export function frameOf(look: Look, zoom: Part | 'all'): readonly [number, number, number, number] {
  const g = rigOf(look)
  const y = g.headY
  const r = g.r
  switch (zoom) {
    case 'all':
    case 'height':
    case 'build':
      return [0, -1.1, 1.5, 2.4]
    case 'face':
    case 'skin':
      return [0, y + 0.02, 0.86, 0.86]
    case 'hair':
      return [0, y + 0.1, 1.2, 1.2]
    case 'hat':
      return [0, y - 0.2, 1.2, 1.2]
    case 'eyes':
    case 'shadow':
      return [0, y - 0.01, 0.46, 0.46]
    case 'nose':
      return [0, y + 0.27 * r, 0.38, 0.38]
    case 'mouth':
    case 'lips':
      return [0, y + 0.5 * r, 0.42, 0.42]
    case 'blush':
      return [0, y + 0.32 * r, 0.64, 0.64]
    case 'paint':
      return [-0.07, y + 0.22 * r, 0.54, 0.54]
    case 'top':
      return [0, (g.shoulderY + g.hipY) / 2 + 0.03, 1.05, 1.05]
    case 'extra':
      return [0, (y + g.hipY) / 2, 1.4, 1.4]
    case 'bottom':
      return [0, g.hipY / 2 + 0.02, 1.1, 1.1]
    case 'shoes':
      return [0, -0.15, 0.56, 0.56]
  }
}
