import { BEEP_FLY } from '../game/catalog'
import { STEP, THINGS, since, type BeepPic, type Thing } from '../game/model'
import type { Box } from '../game/where'
import { BEEP, THING, TAU, arch, blush, clamp01, detail, dieCut, eyes, fill, groundShadow, heldAge, loop, mix, openMouth, shine, smallEntry, smile, smooth, tipped, zees, type SheetEntry } from './look'
import { drawStillThing } from './things'

/**
 * Beep, the child's little helper (plans/rocket-factory.md, Beep and the child's hands): a
 * round coral tin-toy robot, the rocket's fin colour, so the rocket is plainly Beep's. A cream
 * face plate with two painted dot eyes and a smile (no face screen, no glowing eyes: a
 * hovering egg with a screen is somebody else's robot), a crimped seam with rivets round its
 * middle, a wind-up key turning on its back, short springy arms with mitten hands, and on top
 * a propeller that turns while it hovers and whirs while it flies, which is why it floats,
 * with an antenna ball that glows the colour of what it carries. Beep is never hurt, tired or
 * chased.
 *
 * A front-view sticker (look.ts rules 1 and 2), origin on the ground under its middle, where
 * its shadow lies, smaller the higher it hovers. `beepPicture` reads one frame of it off the
 * state's BeepPic, and `rig` poses it: the bob of the hover stays under 0.05 cell (rule 10).
 */

/** A frame of Beep: the pose and how long it has run, how far through a flight to its job it is (1 there), what it carries, which way it faces. */
export interface BeepPicture {
  pose: BeepPic['pose']
  /** Seconds since the pose began (a stamp's age: Infinity for never, held finite here). */
  age: number
  /** 0 to 1 through its flight to the job (where.ts beepPoint eases it there), 1 once it is there. */
  flight: number
  carrying: Thing | null
  facing: -1 | 1
}

/** Beep at sim time t, from the state's picture of it. */
export function beepPicture(b: BeepPic, t: number): BeepPicture {
  return { pose: b.pose, age: since(b.poseAt, t), flight: clamp01(since(b.movedAt, t) / (BEEP_FLY * STEP)), carrying: b.carrying, facing: b.facing }
}

/** Every pose with its length in seconds: a one-shot plays once and holds its end (its rest is a hover), a looping pose repeats on it. The sheet replays the one-shots. */
export const BEEP_POSES: Record<BeepPic['pose'], { len: number; loops: boolean }> = {
  float: { len: 2.4, loops: true },
  dig: { len: 0.5, loops: true },
  carry: { len: 2.4, loops: true },
  pat: { len: 0.8, loops: false },
  tickle: { len: 0.4, loops: true },
  point: { len: 1.2, loops: false },
  busy: { len: 0.9, loops: false },
  flip: { len: 0.85, loops: false },
  cheer: { len: 0.8, loops: true },
  wave: { len: 0.55, loops: true },
  stretch: { len: 2.2, loops: false },
  yawn: { len: 1.8, loops: false },
  sleep: { len: 3.2, loops: true },
  ride: { len: 1.4, loops: true },
}
export const POSES = Object.keys(BEEP_POSES) as BeepPic['pose'][]

/** The robot in its own frame (its bottom at the origin, facing right, y down): the body, the face plate on it nudged to the front, the seam round its lower part. */
const BODY = { y: -0.3, rx: 0.31, ry: 0.3 }
const PLATE = { x: 0.05, y: -0.33, rx: 0.2, ry: 0.15 }
const FACE = { eyeY: -0.36, eye: 0.075, gap: 0.135, mouthY: -0.285, mouth: 0.095 }
const SEAM_Y = -0.135
/** It hovers with its bottom this high over the ground, bobbing by BOB either way. */
const HOVER = 0.1
const BOB = 0.022
/** The propeller: its stem rises from the top of the body to the blades, the antenna's short stem above them to the ball. */
const PROP = { y: -0.675, len: 0.22, w: 0.028 }
const BALL = { y: -0.775, r: 0.055 }
/** The arms spring from the shoulders; at rest the mittens hang just out from the body. */
const SHOULDER = { x: 0.27, y: -0.23 }
const REST = { x: 0.43, y: -0.12 }
const MITTEN = 0.072
/** The wind-up key on its back. */
const KEY = { x: -0.3, y: -0.33, out: 0.075, lobe: 0.05 }
/** Where it holds a thing it carries (in front of its lower body), and how big. */
const HOLD = { x: 0.02, y: -0.165, size: 0.34 }
/** Its height to the top of the antenna ball, cells: detail reads it at that size. */
const TALL = 0.9
/** The box every picture of Beep stays inside, from the ground under its middle: a cheer's hop, a flip, a point and the arms out on a ride, with the shadow they cast. */
export const BEEP_BOX: Box = { x: -0.7, y: -1.22, w: 1.4, h: 1.36 }

type Mood = 'open' | 'sleepy' | 'happy' | 'closed' | 'wide'
type Point = readonly [number, number]

/** Beep's pose in one frame, in the robot's frame. */
interface Rig {
  /** Its bottom's height over the ground: the hover, the bob, a hop, nothing when it rests there. */
  up: number
  /** Tipped about its middle (positive leans forward), a flip's turn about it, and a squash about its bottom. */
  tilt: number
  spin: number
  sx: number
  sy: number
  /** The back and the front mitten. */
  hands: readonly [Point, Point]
  eyes: Mood
  /** The eyes' glance toward the front and down. */
  lookX: number
  lookY: number
  mouth: 'smile' | 'grin' | 'o'
  open: number
  /** The propeller's and the key's turn, radians. */
  prop: number
  key: number
  zz: boolean
}

const rest = (side: -1 | 1, dy: number): Point => [side * REST.x, REST.y + dy]
/** The propeller's idle speed, turns a second, and where its blades stop while Beep sleeps. */
const SPIN = 0.8
const SLEEP_PROP = 0.4
/**
 * How far the propeller has turned `age` seconds into a pose, in seconds of idle speed, while
 * its speed eases from k0 to k1 (times the idle) over [from, to]: the turn is the speed's
 * integral, so a propeller speeding up or slowing down never leaps, however late in the day.
 */
function spun(age: number, from: number, to: number, k0: number, k1: number): number {
  const len = to - from
  const x = clamp01((age - from) / len)
  const eased = age <= from ? 0 : age >= to ? len / 2 + (age - to) : len * (x * x * x - (x * x * x * x) / 2)
  return k0 * age + (k1 - k0) * eased
}

/** Beep in `pic` posed at time t (the sim's seconds: the bob, the blinks and the propeller run on it). */
function rig(pic: BeepPicture, t: number): Rig {
  const age = heldAge(pic.age)
  const { len, loops } = BEEP_POSES[pic.pose]
  const u = loops ? loop(age, len, 0) : clamp01(age / len)
  const blink = loop(t, 3.7, 0.2) > 0.965
  const bob = BOB * Math.sin(TAU * loop(t, 2.4, 0))
  const sway = 0.012 * Math.sin(TAU * loop(t, 1.2, 0))
  const r: Rig = {
    up: HOVER + bob,
    tilt: 0.03 * Math.sin(TAU * loop(t, 3.1, 0.4)),
    spin: 0,
    sx: 1,
    sy: 1,
    hands: [rest(-1, -sway), rest(1, sway)],
    eyes: blink ? 'closed' : 'open',
    lookX: 0,
    lookY: 0,
    mouth: 'smile',
    open: 0,
    prop: TAU * SPIN * t,
    key: TAU * 0.25 * t,
    zz: false,
  }
  /** Where the ground is in the robot's frame, for a mitten that reaches down to it. */
  const ground = () => r.up - 0.035
  switch (pic.pose) {
    case 'float':
      break
    case 'dig': {
      // A springy arm boings down and taps the rock under it, again and again while she holds.
      const e = u < 0.25 ? smooth(0, 0.25, u) : 1 - smooth(0.3, 0.75, u)
      r.hands = [rest(-1, -sway), [mix(REST.x, 0.2, e), mix(REST.y, ground(), e)]]
      r.tilt = 0.15 * e
      r.eyes = e > 0.8 ? 'happy' : 'open'
      r.lookY = 0.015
      break
    }
    case 'carry':
      // Both mittens round the thing in front of it.
      r.hands = [
        [-0.15, -0.145 + sway * 0.5],
        [0.19, -0.145 - sway * 0.5],
      ]
      break
    case 'pat': {
      // Pat pat on the new sticker under it with both mittens, then a happy look.
      const e = Math.max(arch(clamp01((age - 0.08) / 0.28)), arch(clamp01((age - 0.42) / 0.28)))
      r.hands = [
        [mix(-REST.x, -0.17, e), mix(REST.y, ground(), e)],
        [mix(REST.x, 0.17, e), mix(REST.y, ground(), e)],
      ]
      r.tilt = 0.06 * e
      r.up -= 0.025 * e
      r.eyes = 'happy'
      if (age > 0.7) {
        r.mouth = 'grin'
        r.open = 0.5
      }
      break
    }
    case 'tickle': {
      // Wiggling its mittens over a caught muncher, giggling with it.
      const w = Math.sin(TAU * u)
      r.hands = [
        [-0.41 + 0.03 * w, -0.42 + 0.06 * w],
        [0.43 - 0.03 * w, -0.42 - 0.06 * w],
      ]
      r.tilt = 0.06 * w
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.7
      break
    }
    case 'point': {
      // The front arm springs out level at what it means (a full oven, the rocket), overshooting once.
      const e = smooth(0, 0.22, age) + 0.12 * Math.sin(TAU * clamp01((age - 0.22) / 0.4)) * (1 - clamp01((age - 0.22) / 0.4))
      r.hands = [rest(-1, -sway), [mix(REST.x, 0.53, e), mix(REST.y, -0.33, e)]]
      r.lookX = 0.02
      r.tilt += 0.05 * e
      break
    }
    case 'busy': {
      // Its mittens are full: a quick fluster of a wiggle, a surprised look, then a smile.
      const k = 1 - smooth(0, len, age)
      const w = Math.sin(TAU * 3 * age) * k
      r.tilt = 0.14 * w
      r.hands = [
        [-0.4, -0.3 + 0.05 * w],
        [0.4, -0.3 - 0.05 * w],
      ]
      r.eyes = age < 0.5 ? 'wide' : 'happy'
      r.mouth = age < 0.5 ? 'o' : 'smile'
      r.open = 0.4
      break
    }
    case 'flip': {
      // A backflip in the air with its arms out, and a little squash as it lands.
      const f = clamp01((age - 0.05) / 0.62)
      r.spin = -TAU * smooth(0, 1, f)
      r.up += 0.18 * arch(f)
      r.hands = [
        [-0.43, -0.3],
        [0.43, -0.3],
      ]
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.8
      const land = clamp01((age - 0.67) / 0.18)
      if (land > 0 && land < 1) r.sy = 1 - 0.07 * arch(land)
      break
    }
    case 'cheer': {
      // Jumping under the confetti with both arms up in a V.
      const h = arch(u)
      r.up += 0.12 * h
      r.sy = u < 0.1 || u > 0.9 ? 0.94 : 1 + 0.03 * h
      r.hands = [
        [-0.4 - 0.02 * h, -0.6 - 0.04 * h],
        [0.4 + 0.02 * h, -0.6 - 0.04 * h],
      ]
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.85
      break
    }
    case 'wave':
      r.hands = [rest(-1, -sway), [0.43 + 0.06 * Math.sin(TAU * u), -0.52]]
      r.tilt += 0.04 * Math.sin(TAU * u)
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.5
      break
    case 'stretch': {
      // The morning: it rises off the ground with its arms straight up, stretching tall with a big "o", then a shake and a smile.
      const reach = smooth(0, 0.9, age) * (1 - smooth(1.4, 2.1, age))
      r.up = mix(0, HOVER, smooth(0.5, 1.5, age)) + bob * smooth(1.5, 2.2, age)
      r.hands = [
        [mix(-REST.x, -0.24, reach), mix(REST.y, -0.84, reach)],
        [mix(REST.x, 0.26, reach), mix(REST.y, -0.84, reach)],
      ]
      r.sy = 1 + 0.07 * reach
      r.sx = 1 - 0.035 * reach
      r.tilt = age > 0.9 && age < 1.4 ? 0.05 * Math.sin(TAU * 4 * age) : 0
      if (age < 1.3) {
        r.eyes = 'closed'
        r.mouth = 'o'
        r.open = reach
      } else if (age < 2.1) {
        r.mouth = 'grin'
        r.open = 0.6
      }
      // Its propeller, still while it slept, starts up as it rises.
      r.prop = SLEEP_PROP + TAU * SPIN * spun(age, 0.3, 1.6, 0, 1)
      break
    }
    case 'yawn': {
      // Sleepy: a big yawn with a mitten up by its mouth, sinking a little, its propeller slowing.
      const y = arch(clamp01((age - 0.15) / 1.3))
      r.mouth = 'o'
      r.open = y
      r.eyes = y > 0.2 ? 'closed' : 'sleepy'
      r.hands = [rest(-1, 0), [mix(REST.x, 0.24, y), mix(REST.y, -0.27, y)]]
      r.tilt = -0.05 * y
      r.up = HOVER * 0.75 + bob * 0.5
      if (age > 1.45) r.mouth = 'smile'
      r.prop = TAU * SPIN * (t - age + spun(age, 0, len, 1, 0.3))
      break
    }
    case 'sleep': {
      // Curled up on the ground beside the basket: tipped back, mittens folded, breathing slowly, Zz.
      const b = Math.sin(TAU * u)
      r.up = 0
      r.tilt = -0.28
      r.sx = 1.04
      r.sy = 0.93 + 0.015 * b
      r.hands = [
        [-0.2, -0.1],
        [0.22, -0.11],
      ]
      r.eyes = 'closed'
      r.prop = SLEEP_PROP
      r.key = 0
      r.zz = true
      break
    }
    case 'ride': {
      // Surfing a belt: standing on it, leaning into the ride with its arms out for balance.
      const b = Math.sin(TAU * u)
      r.up = 0.02
      r.tilt = 0.12 + 0.05 * b
      r.hands = [
        [-0.46, -0.34 + 0.04 * b],
        [0.46, -0.3 - 0.04 * b],
      ]
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.6
      r.prop = TAU * SPIN * 0.4 * t
      break
    }
  }
  if (pic.flight < 1) {
    // Flying to a job: it leans into the flight, its mittens trail and the propeller whirs.
    const f = arch(pic.flight)
    r.tilt += 0.22 * f
    r.hands = [
      [r.hands[0][0] - 0.05 * f, r.hands[0][1] - 0.05 * f],
      [r.hands[1][0] - 0.07 * f, r.hands[1][1] - 0.04 * f],
    ]
    r.prop += TAU * 1.5 * smooth(0, 1, pic.flight)
    r.lookX = 0.02 * f
  }
  return r
}

/** The point and size of each mitten's thumb, on the side toward the body's middle and up. */
const thumb = (h: Point): [number, number, number] => [h[0] - Math.sign(h[0]) * MITTEN * 0.7, h[1] - MITTEN * 0.55, MITTEN * 0.48]

/**
 * Beep in `pic` at time t: origin on the ground under its middle, facing pic.facing, its
 * shadow on the ground under it, a sticker at the detail its size on screen calls for.
 * S keeps the silhouette, the face, the propeller and the ball; M adds the key, the blush and
 * the arms' coils; L adds the rivets on the seam.
 */
export function drawBeep(ctx: CanvasRenderingContext2D, pic: BeepPicture, t: number): void {
  const r = rig(pic, t)
  const lod = detail(TALL)
  ctx.save()
  tipped(ctx, 0, pic.facing, 1, () => {
    groundShadow(ctx, 0.5, r.up)
    ctx.translate(0, -r.up)
    tipped(ctx, 0, r.sx, r.sy, () => {
      ctx.translate(0, BODY.y)
      tipped(ctx, r.tilt + r.spin, 1, 1, () => {
        ctx.translate(0, -BODY.y)
        robot(ctx, pic, r, lod, t)
      })
    })
  })
  ctx.restore()
}

/** The robot in its posed frame: the die-cut round every part, the key behind, the body with its seam and shine, the face plate, the propeller and the ball, what it carries, the arms and the mittens. */
function robot(ctx: CanvasRenderingContext2D, pic: BeepPicture, r: Rig, lod: 'S' | 'M' | 'L', t: number) {
  const cap = ctx.lineCap
  const join = ctx.lineJoin
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const bodyPath = () => ctx.ellipse(0, BODY.y, BODY.rx, BODY.ry, 0, 0, TAU)
  // The blades sweep a flat ellipse round the stem: each runs from the hub to its tip, short when it points at her.
  const tips = [0, Math.PI].map((a) => [PROP.len * Math.cos(r.prop + a), PROP.y + 0.03 * Math.sin(r.prop + a)] as const)
  const blades = () => {
    for (const [tx, ty] of tips) {
      const mx = tx / 2
      const my = (PROP.y + ty) / 2
      const half = Math.hypot(tx, ty - PROP.y) / 2
      ctx.moveTo(mx + half + PROP.w, my)
      ctx.ellipse(mx, my, half + PROP.w, PROP.w, Math.atan2(ty - PROP.y, tx), 0, TAU)
    }
  }
  // The key's bow turns about the shaft, so from the front it narrows to an edge and widens again.
  const keyTurn = Math.cos(r.key)
  const keyLobes = () => {
    for (const side of [-1, 1]) {
      const ry = KEY.lobe * (0.25 + 0.75 * Math.abs(keyTurn))
      const ky = KEY.y + side * ry * 0.9
      ctx.moveTo(KEY.x - KEY.out + 0.035, ky)
      ctx.ellipse(KEY.x - KEY.out, ky, 0.035, ry, 0, 0, TAU)
    }
  }
  const arm = (h: Point, side: -1 | 1) => {
    // A coil spring from the shoulder to the mitten: a wiggle across the line, straight at S.
    const sx = side * SHOULDER.x
    const dx = h[0] - sx
    const dy = h[1] - SHOULDER.y
    const d = Math.hypot(dx, dy)
    const coils = lod === 'S' ? 0 : lod === 'M' ? 2 : 3
    ctx.moveTo(sx, SHOULDER.y)
    if (coils === 0 || d < 0.02) {
      ctx.lineTo(h[0], h[1])
      return
    }
    const nx = -dy / d
    const ny = dx / d
    const n = coils * 8
    for (let i = 1; i <= n; i++) {
      const k = i / n
      const a = 0.024 * Math.sin(TAU * coils * k) * Math.min(1, 6 * k, 6 * (1 - k))
      ctx.lineTo(sx + dx * k + nx * a, SHOULDER.y + dy * k + ny * a)
    }
  }
  const arms = () => {
    arm(r.hands[0], -1)
    arm(r.hands[1], 1)
  }
  const mittens = () => {
    for (const h of r.hands) {
      ctx.moveTo(h[0] + MITTEN, h[1])
      ctx.arc(h[0], h[1], MITTEN, 0, TAU)
      const [x, y, rr] = thumb(h)
      ctx.moveTo(x + rr, y)
      ctx.arc(x, y, rr, 0, TAU)
    }
  }
  dieCut(
    ctx,
    () => {
      ctx.beginPath()
      bodyPath()
      if (lod !== 'S') {
        ctx.moveTo(KEY.x + 0.02, KEY.y)
        ctx.lineTo(KEY.x - KEY.out, KEY.y)
        keyLobes()
      }
      ctx.moveTo(0, BODY.y - BODY.ry)
      ctx.lineTo(0, BALL.y)
      blades()
      ctx.moveTo(BALL.r, BALL.y)
      ctx.arc(0, BALL.y, BALL.r, 0, TAU)
      arms()
      mittens()
    },
    0,
  )
  // The wind-up key behind the body, turning slowly.
  if (lod !== 'S') {
    ctx.beginPath()
    ctx.moveTo(KEY.x + 0.02, KEY.y)
    ctx.lineTo(KEY.x - KEY.out, KEY.y)
    ctx.lineWidth = 0.035
    ctx.strokeStyle = BEEP.prop
    ctx.stroke()
    ctx.beginPath()
    keyLobes()
    fill(ctx, BEEP.prop)
  }
  // The tin body: coral, a light shine on its upper back, the darker lower shell under the crimped seam.
  ctx.beginPath()
  bodyPath()
  fill(ctx, BEEP.body)
  ctx.save()
  ctx.beginPath()
  bodyPath()
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(-0.17, -0.47, 0.085, 0.05, -0.6, 0, TAU)
  fill(ctx, BEEP.light)
  ctx.beginPath()
  ctx.moveTo(-BODY.rx - 0.01, SEAM_Y - 0.03)
  ctx.quadraticCurveTo(0, SEAM_Y + 0.07, BODY.rx + 0.01, SEAM_Y - 0.03)
  ctx.lineTo(BODY.rx + 0.01, 0.01)
  ctx.lineTo(-BODY.rx - 0.01, 0.01)
  ctx.closePath()
  fill(ctx, BEEP.fold)
  ctx.restore()
  if (lod === 'L') {
    // Rivets along the seam.
    ctx.beginPath()
    for (const k of [-0.62, -0.2, 0.2, 0.62]) {
      const x = k * BODY.rx
      const y = SEAM_Y - 0.03 + 0.1 * (1 - k * k) * 0.5 + 0.012
      ctx.moveTo(x + 0.016, y)
      ctx.arc(x, y, 0.016, 0, TAU)
    }
    fill(ctx, BEEP.light)
  }
  // The painted face on its cream plate.
  ctx.beginPath()
  ctx.ellipse(PLATE.x, PLATE.y, PLATE.rx, PLATE.ry, 0, 0, TAU)
  fill(ctx, BEEP.plate)
  const fx = PLATE.x + r.lookX
  eyes(ctx, fx, FACE.eyeY + r.lookY, FACE.eye, FACE.gap, r.eyes, BEEP.plate)
  const my = FACE.mouthY + r.lookY * 0.5
  if (r.mouth === 'smile') smile(ctx, fx, my, FACE.mouth, false)
  else if (r.mouth === 'grin') smile(ctx, fx, my - 0.005, FACE.mouth * (0.9 + 0.25 * r.open), true)
  else openMouth(ctx, fx, my - 0.01, 0.04 + 0.03 * r.open, 0.04 + 0.04 * r.open, true)
  if (lod !== 'S') {
    blush(ctx, fx - 0.13, -0.3, 0.032)
    blush(ctx, fx + 0.13, -0.3, 0.032)
  }
  // The propeller on its stem, and the antenna ball above it: plain, or glowing the colour of what it carries.
  ctx.beginPath()
  ctx.moveTo(0, BODY.y - BODY.ry + 0.01)
  ctx.lineTo(0, BALL.y)
  ctx.lineWidth = 0.032
  ctx.strokeStyle = BEEP.fold
  ctx.stroke()
  ctx.beginPath()
  blades()
  fill(ctx, BEEP.prop)
  ctx.beginPath()
  ctx.arc(0, PROP.y, 0.026, 0, TAU)
  fill(ctx, BEEP.fold)
  const glow = pic.carrying === null ? null : THING[pic.carrying]
  if (glow) {
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * 0.55
    ctx.beginPath()
    ctx.arc(0, BALL.y, BALL.r * (1.6 + 0.08 * Math.sin(TAU * loop(t, 1.6, 0))), 0, TAU)
    fill(ctx, glow.light)
    ctx.globalAlpha = alpha
  }
  ctx.beginPath()
  ctx.arc(0, BALL.y, BALL.r, 0, TAU)
  fill(ctx, glow ? glow.key : BEEP.antenna)
  shine(ctx, 0, BALL.y, BALL.r)
  // What it carries, in front of it and inside its mittens.
  if (pic.carrying !== null && pic.pose === 'carry') {
    ctx.save()
    ctx.translate(HOLD.x, HOLD.y)
    drawStillThing(ctx, pic.carrying, HOLD.size, t, 1)
    ctx.restore()
  }
  ctx.beginPath()
  arms()
  ctx.lineWidth = 0.03
  ctx.strokeStyle = BEEP.fold
  ctx.stroke()
  ctx.beginPath()
  mittens()
  fill(ctx, BEEP.prop)
  ctx.lineCap = cap
  ctx.lineJoin = join
  if (r.zz) zees(ctx, 0.12, BALL.y + 0.05, t, 0.1)
}

// ---------------------------------------------------------------------------------------
// The sheet

/** Beep in `pose`, replaying a one-shot with a rest, carrying nothing and settled, unless `patch` says otherwise. */
const posed = (pose: BeepPic['pose'], t: number, patch: Partial<BeepPicture>): BeepPicture => ({
  pose,
  age: BEEP_POSES[pose].loops ? t : t % (BEEP_POSES[pose].len + 1),
  flight: 1,
  carrying: null,
  facing: 1,
  ...patch,
})
const entry = (label: string, pic: (t: number) => BeepPicture): SheetEntry => ({ label, box: BEEP_BOX, draw: (ctx, t) => drawBeep(ctx, pic(t), t) })
/** Beep at k of the sheet's size, so the detail it picks there shows. */
const small = (label: string, k: number, pic: (t: number) => BeepPicture): SheetEntry => smallEntry(label, k, BEEP_BOX, (ctx, t) => drawBeep(ctx, pic(t), t))

/** ?sheet=beep: every pose (one-shots replaying), carrying each thing, flying, facing left, and smaller. */
export const SHEET: SheetEntry[] = [
  ...POSES.map((pose) => entry(BEEP_POSES[pose].loops ? pose : `${pose} (replays)`, (t) => posed(pose, t, {}))),
  ...THINGS.map((thing) => entry(`carry ${thing}`, (t) => posed('carry', t, { carrying: thing }))),
  entry('flying to a job (replays)', (t) => posed('float', t, { flight: clamp01((t % 1.2) / 0.35) })),
  entry('flying with a bar', (t) => posed('carry', t, { carrying: 'blueBar', flight: clamp01((t % 1.2) / 0.35) })),
  entry('facing left, pointing', (t) => posed('point', t, { facing: -1 })),
  entry('facing left, carrying', (t) => posed('carry', t, { facing: -1, carrying: 'gear' })),
  ...[0.6, 0.4].flatMap((k) => [small(`float at ${k}x`, k, (t) => posed('float', t, {})), small(`carry at ${k}x`, k, (t) => posed('carry', t, { carrying: 'greenBottle' })), small(`sleep at ${k}x`, k, (t) => posed('sleep', t, {}))]),
]
