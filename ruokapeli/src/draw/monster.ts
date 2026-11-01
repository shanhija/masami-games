import { MONSTERS, type MonsterId } from '../game/model'
import { C, INK, LINE, LINE_BIG, LINE_DETAIL, blush, eye, fillOval, inkOval, inked, roundRectPath, shaded, smile, strokeIt, strokeLine, type SheetEntry } from './look'

/**
 * The five hungry monsters, one waiting at the end of each course (plans/ruokapeli.md), and
 * the cart each one rides along its track in the finale. Friendly and funny, never scary:
 * no claws, no fangs, no frowns, each its own colour and shape so a child can name them.
 *
 *   Munch   a round purple fuzzball with a tuft, two big eyes, stubby feet and arms.
 *   Gulp    a tall blue pear with two eyes on wobbly stalks and a very wide mouth.
 *   Nibble  a pink cloud of a body, three little eyes in a row, long floppy ears.
 *   Chomp   orange with tiger stripes, one big eye, two big buck teeth, round ears.
 *   Gobble  the biggest: sea green with pale spots, two little horns and a tiny gold crown.
 *
 * A monster faces the camera with its origin at its bottom middle (on its cart or on the
 * ground), about 2.2 tiles tall and 2 wide with an empty belly (Gobble a fifth bigger); a
 * full belly makes it wider and rounder. Its mouth's middle is MOUTH_UP above the origin,
 * where the finale catches the falling layers.
 */

/** Each monster's coat: body, its shade, the light tummy, and its own extra (stripes, spots, the inside of an ear). */
const COAT: Record<MonsterId, { body: string; shade: string; light: string; extra: string }> = {
  munch: { body: '#9C6BFF', shade: '#7A4CE0', light: '#C9AEFF', extra: '#B48CFF' },
  gulp: { body: '#45AEF5', shade: '#2B87D1', light: '#A8DDFF', extra: '#7CC8FA' },
  nibble: { body: '#FF8CC6', shade: '#E2639F', light: '#FFC9E3', extra: '#FFE3F1' },
  chomp: { body: '#FF9A3C', shade: '#E07220', light: '#FFD29A', extra: '#D9621C' },
  gobble: { body: '#2EC4A6', shade: '#1F9C85', light: '#A6F0DE', extra: '#C9F7EA' },
}

const X = {
  horn: '#FFF1C9',
  gold: '#FFD23F',
  goldShade: '#F2A93B',
  gemPink: '#FF6FB5',
  gemBlue: '#4AA3FF',
  tooth: '#FFFFFF',
  drool: '#CFF0FF',
  /** Yuck: a green tinge on the cheeks. */
  sick: 'rgba(110, 200, 80, 0.6)',
  cart: '#E8473B',
  cartDark: '#B8322A',
  cartRim: '#C93A2F',
  bulbOn: '#FFF27A',
  bulbOff: '#9C5A2A',
  glow: 'rgba(255, 244, 150, 0.6)',
  tire: '#4D4F5C',
  rim: '#B7C3D0',
  hub: '#FFD23F',
} as const

const TAU = Math.PI * 2
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

/**
 * One moment of a monster. mouth: 0 shut to 1 wide open (a big round catching mouth).
 * belly: 0 hungry to 1 full and round. since: seconds in this mood, for its one-shot
 * moves. lean: -1 to 1, the way it rolls. look: -1 to 1, where its eyes look across (in
 * 'hungry' they also look up, at the balloon). t: seconds, for blinking and breathing.
 */
export interface MonsterPose {
  mouth: number
  belly: number
  mood: 'hungry' | 'happy' | 'chew' | 'yuck' | 'dance'
  since: number
  lean: number
  look: number
  t: number
}
export const MOODS: readonly MonsterPose['mood'][] = ['hungry', 'chew', 'happy', 'yuck', 'dance']

/** How far above its origin each monster's mouth has its middle: the falling layers are caught there. */
export const MOUTH_UP: Record<MonsterId, number> = { munch: 1.1, gulp: 1.1, nibble: 1.1, chomp: 1.1, gobble: 1.15 }

/** The moods' one-shot lengths and the dance's beat, seconds. */
const CHEW_FOR = 0.5
const HOP_FOR = 0.45
const YUCK_FOR = 0.8
const BEAT = 0.6
const HEART_FOR = 1

/** One frame of a monster: its pose read into how its body and face look. */
interface Rig {
  /** The body's width and height against an empty belly standing still: belly, breath, squash. */
  w: number
  h: number
  /** How high it hops, how far it tips over about its bottom, and a sideways shudder. */
  lift: number
  tilt: number
  shake: number
  /** Where its pupils look (-1 to 1 each way) and its lids: 0 open, up to 0.9 a blink, 1 a happy squint. */
  lookX: number
  lookY: number
  shut: number
  /** Yuck: eyes squeezed shut, tongue out, green cheeks. */
  yuck: boolean
  /** The mouth from a smile line (0) to the big round catching mouth (1). */
  open: number
  /** Chewing: puffed cheeks over a shut mouth, 0 for none. */
  chew: number
  /** Arms from hanging (0) to up over its head (1), and their wave, -1 to 1. */
  arms: number
  wave: number
  /** The drool drop's progress (0 to 1, -1 for none), the tummy's rumble (0 to 1), the heart's rise (0 to 1, -1 for none). */
  drool: number
  rumble: number
  heart: number
  t: number
}

/** A blink of 0.16 s every 3.6 s. */
function blink(t: number) {
  const k = (((t % 3.6) + 3.6) % 3.6) / 0.16
  return k < 1 ? 0.9 * Math.sin(Math.PI * k) : 0
}

function rig(p: MonsterPose): Rig {
  const s = Math.max(0, p.since)
  const breath = 0.015 * Math.sin((TAU * p.t) / 2.4)
  const lean = clamp1(p.lean)
  const r: Rig = {
    w: 1 + 0.22 * clamp01(p.belly) + breath + 0.05 * Math.abs(lean),
    h: 1 - breath - 0.05 * Math.abs(lean),
    lift: 0,
    tilt: 0.12 * lean,
    shake: 0,
    lookX: clamp1(p.look),
    lookY: 0,
    shut: blink(p.t),
    yuck: false,
    open: 0,
    chew: 0,
    arms: 0,
    wave: 0,
    drool: -1,
    rumble: 0,
    heart: -1,
    t: p.t,
  }
  if (p.mood === 'hungry') {
    // Eyes up at the balloon, the mouth ready, a drool drop forming and falling, and an empty tummy rumbling.
    r.lookY = -0.85
    r.open = clamp01(p.mouth)
    r.drool = (((p.t / 2.2) % 1) + 1) % 1
    r.rumble = clamp01((0.3 - p.belly) / 0.3)
  } else if (p.mood === 'chew') {
    // Two big munches over CHEW_FOR, the puffed cheeks going down after.
    const u = clamp01(s / CHEW_FOR)
    const munch = Math.abs(Math.sin(TAU * u)) * (1 - u)
    r.h *= 1 - 0.07 * munch
    r.w *= 1 + 0.05 * munch
    r.chew = 1 - 0.5 * u
    r.shut = 0.45
  } else if (p.mood === 'happy') {
    // A hop of joy, a happy squint and a big smile, a heart rising.
    r.shut = 1
    r.open = 0.45
    r.lift = s < HOP_FOR ? 0.2 * Math.sin((Math.PI * s) / HOP_FOR) : 0
    r.arms = s < HOP_FOR ? 0.7 : 0.15
    r.heart = s < HEART_FOR ? s / HEART_FOR : -1
  } else if (p.mood === 'yuck') {
    // A shudder that dies down over YUCK_FOR, tongue out, eyes squeezed.
    const u = clamp01(s / YUCK_FOR)
    r.yuck = true
    r.shake = 0.07 * Math.sin(TAU * 6 * s) * (1 - u)
    r.h *= 1 - 0.05 * (1 - u)
  } else {
    // Bouncing on the beat, landing in a squash, swaying every other beat, arms up and waving, the belly jiggling.
    const beat = (s / BEAT) % 1
    const up = Math.sin(Math.PI * beat)
    r.lift = 0.2 * up
    r.tilt += 0.14 * Math.sin((Math.PI * s) / BEAT)
    r.w *= 1 + 0.06 * (1 - up)
    r.h *= 1 - 0.06 * (1 - up)
    r.shut = 1
    r.open = 0.35
    r.arms = 1
    r.wave = Math.sin((TAU * s) / BEAT)
  }
  return r
}

/** A trace drawn stretched by the rig's body width and height (only its path: its ink keeps the house width). */
function stretched(r: Rig, trace: (k: CanvasRenderingContext2D) => void) {
  return (k: CanvasRenderingContext2D) => {
    k.save()
    k.scale(r.w, r.h)
    trace(k)
    k.restore()
  }
}

/** A round outline of `n` scallops round (cx, cy), radii rx and ry, each bulging `bulge(a)` out at angle a: fur, a cloud's puffs. */
function scallopPath(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, n: number, bulge: (a: number) => number) {
  c.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i * TAU) / n
    const x = cx + rx * Math.cos(a)
    const y = cy + ry * Math.sin(a)
    if (i === 0) {
      c.moveTo(x, y)
      continue
    }
    const m = a - Math.PI / n
    const b = bulge(m)
    c.quadraticCurveTo(cx + (rx + 2 * b) * Math.cos(m), cy + (ry + 2 * b) * Math.sin(m), x, y)
  }
  c.closePath()
}

/** A stubby arm from the shoulder (x, y) on `side` (-1 left, 1 right): hanging down and out at arms 0, up over its head at 1, waving by `wave`. Drawn before the body, so it comes out from behind. */
function arm(c: CanvasRenderingContext2D, x: number, y: number, side: number, len: number, thick: number, r: Rig, fill: string) {
  const a = -0.55 + 1.6 * r.arms + 0.3 * r.wave * r.arms * side
  const ex = x + side * Math.cos(a) * len
  const ey = y - Math.sin(a) * len
  strokeLine(c, INK, thick + 2 * LINE, x, y, ex, ey)
  strokeLine(c, fill, thick, x, y, ex, ey)
}

/** An eye squeezed shut in disgust: a chevron pointing to the middle of the face, or a wiggle for an eye in the middle. */
function squeezed(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const side = Math.abs(x) < 0.05 ? 0 : Math.sign(x)
  c.beginPath()
  if (side === 0) {
    c.moveTo(x - size * 0.8, y)
    for (let i = 1; i <= 4; i++) c.lineTo(x - size * 0.8 + i * size * 0.4, y + (i % 2 === 0 ? 0 : size * 0.3))
  } else {
    c.moveTo(x + side * size * 0.75, y - size * 0.55)
    c.lineTo(x - side * size * 0.55, y)
    c.lineTo(x + side * size * 0.75, y + size * 0.55)
  }
  strokeIt(c, INK, LINE)
}

/** The eyes at each spot, `size` in radius: looking, blinking, squinting happily, or squeezed shut. Eyeballs on stalks (`balls`) keep their white ball round a squint. */
function eyes(c: CanvasRenderingContext2D, r: Rig, at: readonly (readonly [number, number])[], size: number, balls: boolean) {
  for (const [x, y] of at) {
    if (balls && (r.yuck || r.shut >= 1)) inkOval(c, x, y, size, size, C.white, LINE_DETAIL)
    if (r.yuck) squeezed(c, x, y, balls ? size * 0.75 : size)
    else eye(c, x, y, size, r.lookX, r.lookY, r.shut)
  }
}

/** Two big buck teeth hanging from (x, y). */
function buckTeeth(c: CanvasRenderingContext2D, x: number, y: number) {
  for (const s of [-1, 1]) {
    inked(
      c,
      (k) => {
        k.beginPath()
        k.moveTo(x + s * 0.005, y)
        k.lineTo(x + s * 0.005, y + 0.15)
        k.quadraticCurveTo(x + s * 0.005, y + 0.19, x + s * 0.045, y + 0.19)
        k.lineTo(x + s * 0.095, y + 0.19)
        k.quadraticCurveTo(x + s * 0.13, y + 0.19, x + s * 0.13, y + 0.15)
        k.lineTo(x + s * 0.13, y)
        k.closePath()
      },
      X.tooth,
      LINE_DETAIL,
    )
  }
}

/**
 * The mouth, its middle at (x, y), `w` wide, from the rig: a smile line opening into the
 * big round catching mouth (`tall` times as tall as wide); a munch with puffed cheeks in
 * `cheek`; or a "bleh" with the tongue out. `teeth` hangs two buck teeth from its top.
 */
function mouth(c: CanvasRenderingContext2D, r: Rig, x: number, y: number, w: number, tall: number, cheek: string, teeth: boolean) {
  if (r.yuck) {
    smile(c, x, y - 0.06, w * 0.45, 0.35)
    inked(
      c,
      (k) => {
        k.beginPath()
        k.moveTo(x - 0.08, y - 0.01)
        k.lineTo(x - 0.08, y + 0.12)
        k.arc(x, y + 0.12, 0.08, Math.PI, 0, true)
        k.lineTo(x + 0.08, y - 0.01)
        k.closePath()
      },
      C.tongue,
      LINE_DETAIL,
    )
    strokeLine(c, INK, LINE_DETAIL, x, y + 0.02, x, y + 0.11)
    if (teeth) buckTeeth(c, x, y - 0.1)
    return
  }
  if (r.chew > 0) {
    // Cheeks puffed out either side of a shut, munching mouth.
    for (const s of [-1, 1]) {
      const cx = x + s * w * 0.42
      const rr = 0.1 + 0.08 * r.chew
      c.beginPath()
      c.ellipse(cx, y - 0.02, rr, rr * 0.9, 0, 0, TAU)
      c.fillStyle = cheek
      c.fill()
      c.beginPath()
      c.ellipse(cx, y - 0.02, rr, rr * 0.9, 0, s > 0 ? -0.6 : Math.PI - 0.9, s > 0 ? 0.9 : Math.PI + 0.6)
      strokeIt(c, INK, LINE_DETAIL)
      blush(c, cx, y, rr * 0.7)
    }
    c.beginPath()
    c.moveTo(x - w * 0.22, y)
    for (let i = 1; i <= 4; i++) c.lineTo(x - w * 0.22 + i * w * 0.11, y + (i % 2 === 0 ? 0 : 0.035))
    strokeIt(c, INK, LINE)
    if (teeth) buckTeeth(c, x, y + 0.02)
    return
  }
  const open = r.open * tall
  const h = w * open
  const top = y - h / 2
  smile(c, x, top, w, open)
  if (teeth) buckTeeth(c, x, r.open > 0.05 ? top - 0.075 * h : y + 0.2 * w)
}

/** A drop of drool forming at the mouth's corner (x, y) and falling, `u` from 0 to 1 along its round. */
function drool(c: CanvasRenderingContext2D, x: number, y: number, u: number) {
  const grow = clamp01(u / 0.7)
  const fall = Math.max(0, u - 0.7) / 0.3
  const r = 0.025 + 0.03 * grow
  const dy = 0.06 * grow + 0.5 * fall * fall
  c.save()
  c.globalAlpha *= 1 - fall
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(x, y + dy - r * 1.6)
      k.quadraticCurveTo(x + r, y + dy - r * 0.6, x + r, y + dy)
      k.arc(x, y + dy, r, 0, Math.PI)
      k.quadraticCurveTo(x - r, y + dy - r * 0.6, x, y + dy - r * 1.6)
      k.closePath()
    },
    X.drool,
    LINE_DETAIL,
  )
  c.restore()
}

/** An empty tummy's rumble: little shaking arcs either side of it, `half` out from its middle at height y. */
function rumble(c: CanvasRenderingContext2D, half: number, y: number, k: number, t: number) {
  c.save()
  c.globalAlpha *= k
  const jig = 0.02 * Math.sin(TAU * 3 * t)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const r = 0.16 + 0.05 * i
      const x = s * (half + 0.1 + i * 0.1 + jig)
      const mid = s > 0 ? 0 : Math.PI
      c.beginPath()
      c.arc(x - s * r, y, r, mid - 0.45, mid + 0.45)
      strokeIt(c, INK, LINE_DETAIL)
    }
  }
  c.restore()
}

/** A heart rising from (x, y) and fading, `u` from 0 to 1 along its rise. */
function heart(c: CanvasRenderingContext2D, x: number, y: number, u: number) {
  const s = 0.13 + 0.07 * Math.min(1, u * 3)
  const hy = y - 0.45 * u
  c.save()
  c.globalAlpha *= 1 - u * u
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(x, hy + s * 0.9)
      k.bezierCurveTo(x - s * 1.4, hy - s * 0.1, x - s * 0.7, hy - s * 1.1, x, hy - s * 0.4)
      k.bezierCurveTo(x + s * 0.7, hy - s * 1.1, x + s * 1.4, hy - s * 0.1, x, hy + s * 0.9)
      k.closePath()
    },
    C.heart,
    LINE_DETAIL,
  )
  c.restore()
}

// ---------------------------------------------------------------------------------------
// The five monsters, each drawn round its origin from a rig

/** Where the point (x, y) of a still, empty-bellied body is on the rig's body. */
const on = (r: Rig, x: number, y: number) => [x * r.w, y * r.h] as const

/** The light tummy patch: an oval at (x, y) of the still body, stretched with it. */
function tummy(c: CanvasRenderingContext2D, r: Rig, x: number, y: number, rx: number, ry: number, fill: string) {
  fillOval(c, x * r.w, y * r.h, rx * r.w, ry * r.h, fill)
}

/**
 * The face: cheeks (rosy, or green with yuck), the eyes at `eyeAt` (`eyeSize` in radius),
 * and the mouth `mouthW` wide (opening `tall` times as tall) at its MOUTH_UP, with drool
 * while it waits.
 */
function face(c: CanvasRenderingContext2D, r: Rig, id: MonsterId, eyeAt: readonly (readonly [number, number])[], eyeSize: number, mouthW: number, tall: number, cheeks: readonly (readonly [number, number])[]) {
  for (const [x, y] of cheeks) {
    if (r.yuck) fillOval(c, x, y, 0.2, 0.13, X.sick)
    else blush(c, x, y, 0.13)
  }
  // The mouth first: wide open it reaches up to the eyes, and they sit over it.
  const [mx, my] = on(r, 0, -MOUTH_UP[id])
  mouth(c, r, mx, my, mouthW, tall, COAT[id].body, id === 'chomp')
  if (r.drool >= 0 && !r.yuck && r.chew === 0) drool(c, mx + mouthW * 0.3, my + 0.06 + mouthW * r.open * tall * 0.35, r.drool)
  eyes(c, r, eyeAt, eyeSize, id === 'gulp')
}

/** What rises round a monster: its tummy's rumble (`half` its body's half width) and a heart from the top of its head. */
function extras(c: CanvasRenderingContext2D, r: Rig, half: number, top: number) {
  if (r.rumble > 0) rumble(c, half, -0.55 * r.h, r.rumble, r.t)
  if (r.heart >= 0) heart(c, 0.45, top, r.heart)
}

/** Feet at the bottom and arms at the shoulders (x, y of the still body), drawn before the body so it stands on them and they come out from behind it. */
function limbs(c: CanvasRenderingContext2D, r: Rig, coat: (typeof COAT)[MonsterId], foot: number, shoulderX: number, shoulderY: number, len: number, thick: number) {
  for (const s of [-1, 1]) {
    const [fx, fy] = on(r, s * foot, -0.07)
    inkOval(c, fx, fy, 0.25, 0.12, coat.shade, LINE)
    const [ax, ay] = on(r, s * shoulderX, shoulderY)
    arm(c, ax, ay, s, len, thick, r, coat.body)
  }
}

/** Munch's curls of hair on top: across, how tall, how far the tip leans. */
const TUFT = [
  [-0.13, 0.26, -0.12],
  [0.01, 0.36, 0.04],
  [0.14, 0.24, 0.12],
] as const

function munch(c: CanvasRenderingContext2D, r: Rig) {
  const k = COAT.munch
  limbs(c, r, k, 0.42, 0.82, -0.95, 0.36, 0.17)
  const sway = 0.05 * Math.sin((TAU * r.t) / 1.9)
  const [tx, ty] = on(r, 0, -1.86)
  for (const [dx, len, lean] of TUFT) {
    inked(
      c,
      (q) => {
        q.beginPath()
        q.moveTo(tx + dx - 0.07, ty + 0.06)
        q.quadraticCurveTo(tx + dx - 0.05 + sway, ty - len * 0.7, tx + dx + lean + sway, ty - len)
        q.quadraticCurveTo(tx + dx + 0.06 + sway * 0.5, ty - len * 0.45, tx + dx + 0.07, ty + 0.06)
        q.closePath()
      },
      k.body,
      LINE,
    )
  }
  // A ball of fur: its outline a ring of little scallops.
  shaded(c, stretched(r, (q) => scallopPath(q, 0, -1.0, 0.92, 0.92, 20, () => 0.05)), k.body, k.shade, -0.08, -0.12, LINE_BIG)
  tummy(c, r, 0, -0.55, 0.5, 0.34, k.light)
  face(c, r, 'munch', [on(r, -0.32, -1.47), on(r, 0.32, -1.47)], 0.25, 0.7, 0.85, [on(r, -0.6, -1.1), on(r, 0.6, -1.1)])
  extras(c, r, 0.95 * r.w, -2.05 * r.h)
}

/** Gulp's freckles on its head. */
const FRECKLES = [
  [-0.26, -1.66],
  [-0.14, -1.72],
  [0.2, -1.7],
  [0.3, -1.62],
] as const

function gulpPath(q: CanvasRenderingContext2D) {
  q.beginPath()
  q.moveTo(0, -1.85)
  q.bezierCurveTo(0.42, -1.85, 0.56, -1.62, 0.6, -1.38)
  q.bezierCurveTo(0.66, -1.08, 1.0, -0.9, 0.99, -0.48)
  q.bezierCurveTo(0.98, -0.08, 0.62, 0, 0, 0)
  q.bezierCurveTo(-0.62, 0, -0.98, -0.08, -0.99, -0.48)
  q.bezierCurveTo(-1.0, -0.9, -0.66, -1.08, -0.6, -1.38)
  q.bezierCurveTo(-0.56, -1.62, -0.42, -1.85, 0, -1.85)
  q.closePath()
}

function gulp(c: CanvasRenderingContext2D, r: Rig) {
  const k = COAT.gulp
  limbs(c, r, k, 0.46, 0.9, -0.7, 0.32, 0.16)
  // Its eyes ride on stalks rising from the top of its head, each wobbling on its own beat.
  const tops = [-1, 1].map((s) => {
    const sway = 0.06 * Math.sin((TAU * r.t) / 1.7 + s * 1.3)
    const [bx, by] = on(r, s * 0.18, -1.7)
    const ex = bx + s * 0.24 + sway
    const ey = -2.12 * r.h
    for (const [w, colour] of [
      [0.12 + 2 * LINE, INK],
      [0.12, k.body],
    ] as const) {
      c.beginPath()
      c.moveTo(bx, by)
      c.quadraticCurveTo(bx + s * 0.02, (by + ey) / 2, ex, ey)
      strokeIt(c, colour, w)
    }
    return [ex, ey] as const
  })
  shaded(c, stretched(r, gulpPath), k.body, k.shade, -0.08, -0.1, LINE_BIG)
  tummy(c, r, 0, -0.36, 0.55, 0.24, k.light)
  for (const [x, y] of FRECKLES) fillOval(c, x * r.w, y * r.h, 0.045, 0.035, k.extra)
  face(c, r, 'gulp', tops, 0.2, 1.0, 0.8, [on(r, -0.68, -1.12), on(r, 0.68, -1.12)])
  extras(c, r, 0.99 * r.w, -2.35 * r.h)
}

/** Nibble's long ear from its base on the head, flopping out to the right and down; and the paler stripe down its inside. */
function earPath(q: CanvasRenderingContext2D) {
  q.beginPath()
  q.moveTo(-0.12, 0.05)
  q.bezierCurveTo(-0.1, -0.5, 0.45, -0.62, 0.7, -0.2)
  q.bezierCurveTo(0.84, 0.05, 0.86, 0.45, 0.8, 0.72)
  q.quadraticCurveTo(0.74, 0.86, 0.64, 0.74)
  q.bezierCurveTo(0.64, 0.4, 0.6, 0.0, 0.44, -0.18)
  q.bezierCurveTo(0.32, -0.32, 0.14, -0.22, 0.12, 0.08)
  q.closePath()
}
function earInsidePath(q: CanvasRenderingContext2D) {
  q.beginPath()
  q.moveTo(0.52, -0.16)
  q.bezierCurveTo(0.68, 0.05, 0.74, 0.38, 0.73, 0.62)
  q.quadraticCurveTo(0.71, 0.7, 0.68, 0.62)
  q.bezierCurveTo(0.66, 0.36, 0.62, 0.08, 0.52, -0.16)
  q.closePath()
}

function nibble(c: CanvasRenderingContext2D, r: Rig) {
  const k = COAT.nibble
  limbs(c, r, k, 0.42, 0.86, -0.85, 0.3, 0.16)
  for (const s of [-1, 1]) {
    // Swinging gently, and flapping in the dance.
    const swing = 0.07 * Math.sin((TAU * r.t) / 2.1 + s) + 0.18 * r.arms * r.wave * s
    const [bx, by] = on(r, s * 0.3, -1.6)
    c.save()
    c.translate(bx, by)
    c.rotate(s * swing)
    c.scale(s, 1)
    inked(c, earPath, k.body, LINE)
    earInsidePath(c)
    c.fillStyle = k.extra
    c.fill()
    c.restore()
  }
  // A cloud of a body: big puffs over the top and sides, flatter underneath.
  const cloud = (q: CanvasRenderingContext2D) => scallopPath(q, 0, -0.92, 0.93, 0.86, 9, (a) => (Math.sin(a) > 0.4 ? 0.02 : 0.1))
  shaded(c, stretched(r, cloud), k.body, k.shade, -0.08, -0.1, LINE_BIG)
  tummy(c, r, 0, -0.55, 0.5, 0.32, k.light)
  face(c, r, 'nibble', [on(r, -0.34, -1.42), on(r, 0, -1.47), on(r, 0.34, -1.42)], 0.13, 0.6, 0.85, [on(r, -0.62, -1.05), on(r, 0.62, -1.05)])
  extras(c, r, 1.0 * r.w, -2.0 * r.h)
}

/** Chomp's tiger stripes either side: how high, and how far in. */
const STRIPES = [
  [-1.62, 0.3],
  [-1.22, 0.38],
  [-0.82, 0.32],
  [-0.44, 0.24],
] as const

function chompPath(q: CanvasRenderingContext2D) {
  q.beginPath()
  q.moveTo(0, -2.0)
  q.bezierCurveTo(0.62, -2.0, 0.92, -1.86, 0.94, -1.36)
  q.bezierCurveTo(0.96, -0.86, 1.0, -0.42, 0.92, -0.2)
  q.bezierCurveTo(0.84, 0.0, 0.5, 0, 0, 0)
  q.bezierCurveTo(-0.5, 0, -0.84, 0.0, -0.92, -0.2)
  q.bezierCurveTo(-1.0, -0.42, -0.96, -0.86, -0.94, -1.36)
  q.bezierCurveTo(-0.92, -1.86, -0.62, -2.0, 0, -2.0)
  q.closePath()
}

function chomp(c: CanvasRenderingContext2D, r: Rig) {
  const k = COAT.chomp
  limbs(c, r, k, 0.44, 0.88, -0.85, 0.24, 0.2)
  for (const s of [-1, 1]) {
    const [ex, ey] = on(r, s * 0.6, -1.88)
    inkOval(c, ex, ey, 0.19, 0.17, k.body, LINE)
    fillOval(c, ex, ey + 0.01, 0.1, 0.09, k.light)
  }
  const body = stretched(r, chompPath)
  shaded(c, body, k.body, k.shade, -0.08, -0.1, LINE_BIG)
  // Tiger stripes coming in from either side and down from the top, then the outline again over their ends.
  c.save()
  body(c)
  c.clip()
  c.fillStyle = k.extra
  for (const [y, len] of STRIPES) {
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(s * 1.1 * r.w, (y - 0.09) * r.h)
      c.quadraticCurveTo(s * (1 - len * 0.5) * r.w, (y - 0.03) * r.h, s * (1 - len) * r.w, (y + 0.03) * r.h)
      c.quadraticCurveTo(s * (1 - len * 0.5) * r.w, (y + 0.05) * r.h, s * 1.1 * r.w, (y + 0.08) * r.h)
      c.closePath()
      c.fill()
    }
  }
  for (const x of [-0.28, 0, 0.28]) {
    c.beginPath()
    c.moveTo((x - 0.08) * r.w, -2.1 * r.h)
    c.quadraticCurveTo((x - 0.02) * r.w, -1.95 * r.h, (x + 0.02) * r.w, -1.78 * r.h)
    c.quadraticCurveTo((x + 0.05) * r.w, -1.95 * r.h, (x + 0.08) * r.w, -2.1 * r.h)
    c.closePath()
    c.fill()
  }
  c.restore()
  body(c)
  strokeIt(c, INK, LINE_BIG)
  tummy(c, r, 0, -0.4, 0.55, 0.28, k.light)
  face(c, r, 'chomp', [on(r, 0, -1.58)], 0.32, 0.78, 0.72, [on(r, -0.62, -1.08), on(r, 0.62, -1.08)])
  extras(c, r, 0.97 * r.w, -2.1 * r.h)
}

/** Gobble's pale spots: where, and how big. */
const SPOTS = [
  [-0.72, -1.55, 0.14],
  [0.8, -1.72, 0.1],
  [-0.9, -0.78, 0.12],
  [0.94, -0.98, 0.16],
  [0.5, -2.17, 0.08],
  [-0.4, -2.2, 0.07],
  [0.64, -0.42, 0.09],
  [-0.55, -0.24, 0.07],
] as const

function gobblePath(q: CanvasRenderingContext2D) {
  q.beginPath()
  q.moveTo(0, -2.45)
  q.bezierCurveTo(0.72, -2.45, 1.18, -1.95, 1.2, -1.22)
  q.bezierCurveTo(1.22, -0.48, 0.95, 0, 0, 0)
  q.bezierCurveTo(-0.95, 0, -1.22, -0.48, -1.2, -1.22)
  q.bezierCurveTo(-1.18, -1.95, -0.72, -2.45, 0, -2.45)
  q.closePath()
}

/** A tiny gold crown with three gems, its base's middle at (x, y), a little crooked. */
function crown(c: CanvasRenderingContext2D, x: number, y: number) {
  c.save()
  c.translate(x, y)
  c.rotate(0.15)
  inked(
    c,
    (q) => {
      q.beginPath()
      q.moveTo(-0.2, 0.02)
      q.lineTo(-0.23, -0.2)
      q.lineTo(-0.11, -0.09)
      q.lineTo(0, -0.25)
      q.lineTo(0.11, -0.09)
      q.lineTo(0.23, -0.2)
      q.lineTo(0.2, 0.02)
      q.closePath()
    },
    X.gold,
    LINE,
  )
  strokeLine(c, X.goldShade, 0.035, -0.17, -0.025, 0.17, -0.025)
  fillOval(c, 0, -0.07, 0.035, 0.035, X.gemPink)
  fillOval(c, -0.12, -0.05, 0.025, 0.025, X.gemBlue)
  fillOval(c, 0.12, -0.05, 0.025, 0.025, X.gemBlue)
  c.restore()
}

function gobble(c: CanvasRenderingContext2D, r: Rig) {
  const k = COAT.gobble
  limbs(c, r, k, 0.52, 1.1, -1.0, 0.36, 0.2)
  for (const s of [-1, 1]) {
    const [hx, hy] = on(r, s * 0.45, -2.25)
    inked(
      c,
      (q) => {
        q.beginPath()
        q.moveTo(hx - s * 0.13, hy + 0.08)
        q.quadraticCurveTo(hx - s * 0.06, hy - 0.22, hx + s * 0.16, hy - 0.3)
        q.quadraticCurveTo(hx + s * 0.06, hy - 0.08, hx + s * 0.13, hy + 0.1)
        q.closePath()
      },
      X.horn,
      LINE,
    )
  }
  const body = stretched(r, gobblePath)
  shaded(c, body, k.body, k.shade, -0.1, -0.12, LINE_BIG)
  c.save()
  body(c)
  c.clip()
  for (const [x, y, rr] of SPOTS) fillOval(c, x * r.w, y * r.h, rr, rr * 0.85, k.extra)
  c.restore()
  body(c)
  strokeIt(c, INK, LINE_BIG)
  tummy(c, r, 0, -0.58, 0.68, 0.4, k.light)
  face(c, r, 'gobble', [on(r, -0.4, -1.8), on(r, 0.4, -1.8)], 0.23, 0.85, 1, [on(r, -0.76, -1.3), on(r, 0.76, -1.3)])
  crown(c, ...on(r, 0.08, -2.4))
  extras(c, r, 1.2 * r.w, -2.75 * r.h)
}

const DRAW: Record<MonsterId, (c: CanvasRenderingContext2D, r: Rig) => void> = { munch, gulp, nibble, chomp, gobble }

/** A monster in its pose, its origin at its bottom middle, facing the camera. */
export function drawMonster(ctx: CanvasRenderingContext2D, id: MonsterId, pose: MonsterPose) {
  const r = rig(pose)
  ctx.save()
  ctx.translate(r.shake, -r.lift)
  ctx.rotate(r.tilt)
  DRAW[id](ctx, r)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The cart

/** How high over the rails a monster sits on its cart: the cart's top. */
export const CART_SEAT = 0.45
/** The near wheels: their radius, and how far either side of the middle. */
export const WHEEL_R = 0.27
const AXLE = 0.6
/** The fairground bulbs along the cart's front: across, glowing in turn. */
const BULBS = [-0.6, -0.2, 0.2, 0.6] as const

/** A spoked wheel round (x, y), turned by `turn` radians. */
function wheelAt(c: CanvasRenderingContext2D, x: number, y: number, turn: number) {
  inkOval(c, x, y, WHEEL_R, WHEEL_R, X.tire, LINE)
  fillOval(c, x, y, WHEEL_R * 0.7, WHEEL_R * 0.7, X.rim)
  for (let i = 0; i < 6; i++) {
    const a = turn + (i * Math.PI) / 3
    strokeLine(c, INK, LINE_DETAIL, x, y, x + Math.cos(a) * WHEEL_R * 0.7, y + Math.sin(a) * WHEEL_R * 0.7)
  }
  inkOval(c, x, y, WHEEL_R * 0.24, WHEEL_R * 0.24, X.hub, LINE_DETAIL)
}

/**
 * The little cart a monster rides along its track in the finale: a red fairground car on
 * two spoked wheels turned by `wheel` radians, rubber bumpers at its ends and bulbs along
 * its front that glow in turn (one round every 1.6 s). The origin is on the rails' top
 * under its middle; the monster sits CART_SEAT higher.
 */
export function drawCart(ctx: CanvasRenderingContext2D, wheel: number, t: number) {
  for (const s of [-1, 1]) wheelAt(ctx, s * AXLE, -WHEEL_R, wheel)
  for (const s of [-1, 1]) inkOval(ctx, s * 0.98, -0.33, 0.1, 0.12, X.tire, LINE)
  shaded(
    ctx,
    (q) => {
      q.beginPath()
      q.moveTo(-0.96, -CART_SEAT)
      q.lineTo(0.96, -CART_SEAT)
      q.lineTo(0.9, -0.24)
      q.quadraticCurveTo(0.88, -0.2, 0.83, -0.2)
      q.lineTo(-0.83, -0.2)
      q.quadraticCurveTo(-0.88, -0.2, -0.9, -0.24)
      q.closePath()
    },
    X.cart,
    X.cartDark,
    0,
    -0.06,
    LINE,
  )
  inked(ctx, (q) => roundRectPath(q, -1.02, -CART_SEAT - 0.06, 2.04, 0.1, 0.04), X.cartRim, LINE)
  BULBS.forEach((x, i) => {
    const lit = Math.sin(TAU * (t / 1.6 - i / BULBS.length)) > 0
    if (lit) fillOval(ctx, x, -0.32, 0.1, 0.09, X.glow)
    inkOval(ctx, x, -0.32, 0.055, 0.055, lit ? X.bulbOn : X.bulbOff, LINE_DETAIL)
    fillOval(ctx, x - 0.016, -0.338, 0.015, 0.015, C.white)
  })
}

// ---------------------------------------------------------------------------------------
// The sheet

const pose = (patch: Partial<MonsterPose>): MonsterPose => ({ mouth: 0, belly: 0, mood: 'hungry', since: 0, lean: 0, look: 0, t: 0, ...patch })
const MONSTER_BOX = { x: -1.6, y: -3.05, w: 3.2, h: 3.2 }

export const SHEET: SheetEntry[] = [
  ...MONSTERS.flatMap((id): SheetEntry[] => [
    { label: `${id} hungry`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, since: t })) },
    { label: `${id} hungry mouth open`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, since: t, mouth: 1, look: 0.6 })) },
    { label: `${id} hungry full`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, since: t, belly: 1 })) },
    { label: `${id} hungry full mouth open`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, since: t, belly: 1, mouth: 1, look: -0.6 })) },
    { label: `${id} chew`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, mood: 'chew', since: t % 0.8, belly: 0.5 })) },
    { label: `${id} happy`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, mood: 'happy', since: (t % 1.6) * 0.3, belly: 0.8 })) },
    { label: `${id} yuck`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, mood: 'yuck', since: (t % 1.4) * 0.3, mouth: 0.3, belly: 0.4 })) },
    { label: `${id} dance`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, mood: 'dance', since: t, belly: 1 })) },
    { label: `${id} dance landing`, box: MONSTER_BOX, draw: (c, t) => drawMonster(c, id, pose({ t, mood: 'dance', since: t + 0.5 - (t % BEAT), belly: 1 })) },
  ]),
  { label: 'cart', box: { x: -1.15, y: -0.6, w: 2.3, h: 0.7 }, draw: (c, t) => drawCart(c, t * 4, t) },
  ...MONSTERS.map(
    (id): SheetEntry => ({
      label: `${id} on its cart`,
      box: { x: -1.6, y: -3.5, w: 3.2, h: 3.6 },
      draw: (c, t) => {
        drawCart(c, t * 3, t)
        c.save()
        c.translate(0, -CART_SEAT)
        drawMonster(c, id, pose({ t, since: t, lean: 0.6 * Math.sin(t * 1.3), mouth: 0.5 + 0.5 * Math.sin(t * 2), belly: 0.3 }))
        c.restore()
      },
    }),
  ),
]
