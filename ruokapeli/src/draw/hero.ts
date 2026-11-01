import { BONK_FOR, ZAP_FOR } from '../game/model'
import { C, INK, LINE, LINE_DETAIL, band, blob, blush, eye, groundShadow, inkOval, inked, lw, roundRectPath, smile, star, tube, type SheetEntry } from './look'

/**
 * The hero: a little cook who carries a big plate over her head with both hands. Her cues
 * are the two puffs of dark curly hair with a red band between them, warm brown skin, a
 * red-and-white gingham apron over a sunny t-shirt, blue shorts and red sneakers. Her
 * arms go up behind her big head, so her face always shows.
 * She is an upright picture (look.ts rule 1): the origin is the ground under her feet, -y
 * is up, and 'side' faces right (the caller mirrors her for left). drawHero draws no plate:
 * the renderer puts the plate and its pile at plateAnchor, which is where her hands are.
 */

/** Her colours. */
const HERO = {
  skin: '#C98552',
  skinFar: '#B0703F',
  hair: '#3D2620',
  curl: '#70493A',
  band: '#FF4A42',
  shirt: '#FFCB3A',
  shirtFar: '#F0A928',
  apron: '#FFFFFF',
  /** The gingham's bands: half see-through, so two crossing bands make the darker square. */
  check: 'rgba(255, 74, 66, 0.5)',
  tie: '#FF4A42',
  shorts: '#4F86E8',
  sock: '#FFFFFF',
  shoe: '#FF4A42',
  sole: '#FFFFFF',
  sweat: '#9FE3FF',
  ripple: '#FFFFFF',
  /** Her body under the water, seen through it. */
  underwater: 'rgba(20, 88, 110, 0.28)',
} as const

const TAU = Math.PI * 2

export type HeroAct = 'stand' | 'walk' | 'teeter' | 'bonk' | 'zap' | 'swim' | 'cheer' | 'ride'

/**
 * What to draw. face: 'down' toward the camera, 'up' her back, 'side' facing right. stride:
 * tiles walked in all (one walk cycle per CYCLE tiles). since: seconds in this act. t:
 * seconds, for blinking and breathing.
 */
export interface HeroPose {
  face: 'down' | 'up' | 'side'
  act: HeroAct
  stride: number
  since: number
  t: number
}

/** Her measures in tiles from her feet, facing the camera: the head's middle and radius, the shoulders, the hips. */
const HEAD_Y = -0.85
const HEAD_R = 0.29
const SHOULDER_X = 0.16
const SHOULDER_Y = -0.54
const HIP_X = 0.072
const HIP_Y = -0.27
/** Her feet stand this far either side of the middle, her ankles this high. */
const FOOT_X = 0.085
const ANKLE = -0.075
/** Limb widths, arm lengths (upper and fore), and the mitten hand's radius. */
const ARM_W = 0.11
const SLEEVE_W = 0.17
const LEG_W = 0.12
const UPPER_ARM = 0.46
const FOREARM = 0.48
const HAND_R = 0.068
/** The plate's bottom centre when she stands; how far either side of it her hands hold it (facing the camera, and in the side view the far hand and the near one); her hands sit UNDER below it, so the plate covers their tops. */
const PLATE_Y = -1.45
const GRIP = 0.21
const GRIP_FAR = 0.12
const GRIP_NEAR = -0.1
const UNDER = 0.035
/** Tiles walked in one walk cycle (two steps). */
const CYCLE = 0.9
/** The bonk's slide back lasts SLIDE, then she is dizzy until BONK_FOR. */
const SLIDE = 0.25
/** In the water she sinks this far: the water line is at her chest. */
const SWIM_SINK = 0.52
/** The gingham's band width. */
const CHECK = 0.042

type Eyes = 'open' | 'happy' | 'wide' | 'squeeze' | 'spiral'
type Mouth = 'smile' | 'open' | 'o' | 'wobbly' | 'grin'

/** Her pose this frame, read from a HeroPose: everything drawHero and plateAnchor need. */
interface Figure {
  /** The figure turned about her feet (radians, clockwise: toward her front in the side view), lifted (a hop), shifted sideways (a shiver), sunk (the water), and squashed (y scale about the feet). */
  lean: number
  lift: number
  shift: number
  swim: number
  sy: number
  /** Everything above the legs lowered by this (the walk's bounce). */
  sink: number
  /** The feet's offsets from where they stand: the back one (screen left, or the far one in the side view), then the front one. */
  backFoot: [number, number]
  frontFoot: [number, number]
  /** The plate's bottom centre and the hands (back x, y, front x, y), in her own frame before the turn. */
  plate: [number, number]
  hands: [number, number, number, number]
  /** Only the back hand holds the plate; the front arm is free. */
  freeArm: boolean
  eyes: Eyes
  look: [number, number]
  blink: boolean
  mouth: Mouth
  /** Worried brows, a sweat drop, the hair standing up (0 to 1), the dizzy stars' turn (null for none), the zap's sparks, and seconds of the ripples round her in the water. */
  brows: boolean
  sweat: boolean
  zap: number
  stars: number | null
  sparks: boolean
  ripples: number
}

/** Her pose for a HeroPose: the act's own pose over the standing one, then her hands put where the plate is. */
function figure(p: HeroPose): Figure {
  const side = p.face === 'side'
  const breath = Math.sin((TAU * p.t) / 2.3)
  const f: Figure = {
    lean: 0,
    lift: 0,
    shift: 0,
    swim: 0,
    sy: 1 + 0.012 * breath,
    sink: 0,
    backFoot: [0, 0],
    frontFoot: [0, 0],
    plate: [side ? 0.03 : 0, PLATE_Y],
    hands: [0, 0, 0, 0],
    freeArm: false,
    eyes: 'open',
    look: [side ? 0.55 : 0, 0.2],
    blink: p.t % 3.4 < 0.13,
    mouth: 'smile',
    brows: false,
    sweat: false,
    zap: 0,
    stars: null,
    sparks: false,
    ripples: 0,
  }
  // The front hand's own spot when only the back hand holds the plate up.
  let free: [number, number] | null = null
  const s = p.since
  switch (p.act) {
    case 'stand':
      break
    case 'walk': {
      // Two bouncy steps a cycle: she is highest when a foot is up, and the plate lags a little.
      const ph = (TAU * p.stride) / CYCLE
      const sw = Math.sin(ph)
      const cw = Math.cos(ph)
      f.sink = 0.012 - 0.04 * Math.abs(sw)
      if (side) {
        f.backFoot = [-0.13 * sw, -0.06 * Math.max(0, -cw)]
        f.frontFoot = [0.13 * sw, -0.06 * Math.max(0, cw)]
        f.lean = 0.07
        f.plate[0] -= 0.015 * Math.abs(sw)
      } else {
        f.backFoot = [0, -0.07 * Math.max(0, sw)]
        f.frontFoot = [0, -0.07 * Math.max(0, -sw)]
        f.lean = 0.045 * sw
        f.plate[0] -= 0.02 * sw
      }
      break
    }
    case 'teeter': {
      // Rocking out over the water and back, the plate held up in one hand, the other arm going round.
      const rock = Math.sin(TAU * 2.2 * s)
      f.lean = side ? 0.12 + 0.17 * rock : 0.17 * rock
      f.plate = side ? [-0.08, PLATE_Y - 0.03] : [-0.13, PLATE_Y - 0.03]
      const a = TAU * 2 * s
      const x = side ? 0.02 : SHOULDER_X
      free = [x + 0.48 * Math.sin(a), SHOULDER_Y - 0.48 * Math.cos(a)]
      f.backFoot = side ? [-0.1, -0.08] : [0, -0.06]
      f.frontFoot = side ? [0.05, 0] : [0.02, 0]
      Object.assign(f, { eyes: 'wide', mouth: 'o', brows: true, sweat: true, look: [side ? 0.8 : 0, 0.7] })
      break
    }
    case 'bonk':
      if (s < SLIDE) {
        // Knocked: thrown back, the plate jolted up, eyes squeezed shut.
        const k = Math.min(1, s / 0.06)
        f.lean = -0.26 * k
        f.plate = [f.plate[0] - 0.05, PLATE_Y - 0.06 * k]
        f.frontFoot = side ? [0.12 * k, -0.1 * k] : [0.03, -0.08 * k]
        Object.assign(f, { eyes: 'squeeze', mouth: 'open', sy: 1 - 0.05 * k })
      } else {
        // Dizzy: swaying, spiral eyes, stars going round her head until the knock is over.
        const u = s - SLIDE
        f.lean = 0.09 * Math.sin(TAU * 1.6 * u)
        f.plate[0] += 0.04 * Math.sin(TAU * 1.6 * u + 0.6)
        Object.assign(f, { eyes: 'spiral', mouth: 'wobbly', stars: s < BONK_FOR ? TAU * 1.3 * u : null })
      }
      break
    case 'zap': {
      // A jolt: a quick shiver, the hair standing up, the plate hopping, all fading over the zap.
      const k = Math.max(0, 1 - s / ZAP_FOR)
      f.shift = 0.03 * k * Math.sin(TAU * 12 * s)
      f.lean = -0.1 * k
      f.zap = Math.min(1, 1.7 * k)
      f.plate[1] -= 0.05 * k
      Object.assign(f, { eyes: 'wide', mouth: 'o', look: [0, 0], sparks: s < 0.3 })
      break
    }
    case 'swim':
      // In to her chest, bobbing, the plate held up out of the water; first eyes squeezed, then a sheepish grin.
      f.swim = SWIM_SINK + 0.025 * Math.sin(TAU * 0.9 * s)
      f.ripples = s
      if (s < 0.45) Object.assign(f, { eyes: 'squeeze', mouth: 'wobbly' })
      else Object.assign(f, { mouth: 'grin', sweat: true, look: [side ? 0.2 : -0.6, -0.3] })
      break
    case 'cheer': {
      // Hopping for joy, the plate held high on straight arms.
      const u = (s % 0.5) / 0.5
      f.lift = 0.8 * u * (1 - u)
      f.sy = 1 - 0.05 * Math.cos(TAU * u)
      f.plate[1] = PLATE_Y - 0.07
      const tuck = -0.05 * Math.sin(Math.PI * u)
      f.backFoot = [0, tuck]
      f.frontFoot = [0, tuck]
      Object.assign(f, { eyes: 'happy', mouth: 'open' })
      break
    }
    case 'ride': {
      // In the basket: the plate up in one hand, the other waving.
      const wave = Math.sin(TAU * 1.6 * s)
      f.plate = side ? [-0.06, PLATE_Y] : [-0.14, PLATE_Y]
      free = side ? [0.4 + 0.1 * wave, -1.08 - 0.04 * wave] : [0.5 + 0.1 * wave, -1.05 - 0.04 * wave]
      Object.assign(f, { eyes: 'happy', mouth: 'open' })
      break
    }
  }
  f.plate[1] += f.sink
  const [px, py] = f.plate
  f.freeArm = free !== null
  if (free) f.hands = [px, py + UNDER, free[0], free[1] + f.sink]
  else if (side) f.hands = [px + GRIP_FAR, py + UNDER, px + GRIP_NEAR, py + UNDER]
  else f.hands = [px - GRIP, py + UNDER, px + GRIP, py + UNDER]
  return f
}

/** A point of her own frame in the feet's frame: squashed, turned about the feet, lifted, sunk and shifted, the same steps drawHero takes. */
function place(f: Figure, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(f.lean)
  const s = Math.sin(f.lean)
  const yy = y * f.sy
  return { x: f.shift + c * x - s * yy, y: f.swim - f.lift + s * x + c * yy }
}

/** Where the plate's bottom centre sits, relative to her feet, for this pose: her hands are right under it. */
export function plateAnchor(pose: HeroPose): { x: number; y: number } {
  const f = figure(pose)
  return place(f, f.plate[0], f.plate[1])
}

// ---------------------------------------------------------------------------------------
// Drawing her

type Face = HeroPose['face']

/** Where the elbow goes for a shoulder at (sx, sy), a hand at (hx, hy) and an upper arm and forearm of lengths l1 and l2: bent to the side `bend` (+1 to the right of the way from shoulder to hand), or straight if the hand is out of reach. */
function elbow(sx: number, sy: number, hx: number, hy: number, bend: number, l1: number, l2: number): [number, number] {
  const d = Math.hypot(hx - sx, hy - sy)
  const ux = (hx - sx) / d
  const uy = (hy - sy) / d
  if (d >= l1 + l2) return [sx + (ux * d * l1) / (l1 + l2), sy + (uy * d * l1) / (l1 + l2)]
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  return [sx + ux * a - uy * h * bend, sy + uy * a + ux * h * bend]
}

/** Her legs, socks and sneakers, from the hips (lowered with her body) down to her feet. */
function legs(ctx: CanvasRenderingContext2D, f: Figure, view: Face) {
  const side = view === 'side'
  for (const k of [-1, 1] as const) {
    const foot = k < 0 ? f.backFoot : f.frontFoot
    const far = side && k < 0
    const fx = (side ? 0.02 * k : FOOT_X * k) + foot[0]
    const fy = ANKLE + foot[1]
    tube(ctx, LEG_W, far ? HERO.skinFar : HERO.skin, LINE, side ? 0.03 * k : HIP_X * k, HIP_Y + f.sink, fx, fy)
    tube(ctx, LEG_W, HERO.sock, LINE, fx, fy - 0.03, fx, fy)
    // The sneaker: from the side a long shoe with a white sole, else a round toe (or heel) with a white cap.
    if (side) {
      inkOval(ctx, fx + 0.04, fy + 0.03, 0.115, 0.062, HERO.shoe, LINE)
      inkOval(ctx, fx + 0.05, fy + 0.07, 0.09, 0.022, HERO.sole, LINE_DETAIL)
    } else {
      inkOval(ctx, fx, fy + 0.03, 0.09, 0.062, HERO.shoe, LINE)
      inkOval(ctx, fx, fy + (view === 'down' ? 0.05 : 0.02), 0.05, 0.028, HERO.sole, LINE_DETAIL)
    }
  }
}

/** Fills the path `trace` builds with white gingham over the box (x0, y0)-(x1, y1), and inks its outline. */
function gingham(ctx: CanvasRenderingContext2D, trace: (c: CanvasRenderingContext2D) => void, x0: number, y0: number, x1: number, y1: number) {
  ctx.save()
  trace(ctx)
  ctx.fillStyle = HERO.apron
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = HERO.check
  for (let x = x0; x < x1; x += 2 * CHECK) ctx.fillRect(x, y0, CHECK, y1 - y0)
  for (let y = y0; y < y1; y += 2 * CHECK) ctx.fillRect(x0, y, x1 - x0, CHECK)
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(LINE)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** Shorts, t-shirt and apron, lowered with the walk's bounce. The t-shirt is `w` wide either side (narrower from the side); her chin hides its neck. */
function body(ctx: CanvasRenderingContext2D, f: Figure, view: Face) {
  const side = view === 'side'
  const w = side ? 0.12 : 0.155
  ctx.save()
  ctx.translate(0, f.sink)
  inked(ctx, (c) => roundRectPath(c, -w, -0.37, 2 * w, 0.15, 0.05), HERO.shorts)
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(-0.8 * w, -0.6)
      c.quadraticCurveTo(0, -0.63, 0.8 * w, -0.6)
      c.quadraticCurveTo(1.06 * w, -0.585, 1.06 * w, -0.48)
      c.lineTo(1.1 * w, -0.32)
      c.quadraticCurveTo(0, -0.28, -1.1 * w, -0.32)
      c.lineTo(-1.06 * w, -0.48)
      c.quadraticCurveTo(-1.06 * w, -0.585, -0.8 * w, -0.6)
      c.closePath()
    },
    HERO.shirt,
  )
  if (view === 'down') {
    // The apron from the front: a bib under her chin, a skirt to her knees with a pocket.
    gingham(
      ctx,
      (c) => {
        c.beginPath()
        c.moveTo(-0.09, -0.57)
        c.lineTo(0.09, -0.57)
        c.lineTo(0.095, -0.45)
        c.lineTo(0.135, -0.445)
        c.quadraticCurveTo(0.17, -0.32, 0.175, -0.225)
        c.quadraticCurveTo(0, -0.19, -0.175, -0.225)
        c.quadraticCurveTo(-0.17, -0.32, -0.135, -0.445)
        c.lineTo(-0.095, -0.45)
        c.closePath()
      },
      -0.18,
      -0.6,
      0.18,
      -0.18,
    )
    roundRectPath(ctx, -0.07, -0.37, 0.14, 0.09, 0.025)
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  } else if (side) {
    // From the side: the apron's front over her tummy, the bow's loop behind her waist.
    inkOval(ctx, -0.15, -0.43, 0.055, 0.032, HERO.tie, LINE_DETAIL)
    gingham(
      ctx,
      (c) => {
        c.beginPath()
        c.moveTo(0.03, -0.57)
        c.lineTo(0.11, -0.57)
        c.quadraticCurveTo(0.135, -0.5, 0.13, -0.445)
        c.quadraticCurveTo(0.17, -0.32, 0.18, -0.225)
        c.quadraticCurveTo(0.08, -0.2, -0.01, -0.225)
        c.quadraticCurveTo(-0.005, -0.34, 0.035, -0.445)
        c.closePath()
      },
      -0.02,
      -0.6,
      0.2,
      -0.18,
    )
  } else {
    // From behind: the straps crossing her back and the big bow at her waist.
    tube(ctx, 0.04, HERO.tie, LINE_DETAIL, -0.1, -0.58, 0.08, -0.44)
    tube(ctx, 0.04, HERO.tie, LINE_DETAIL, 0.1, -0.58, -0.08, -0.44)
    tube(ctx, 0.04, HERO.tie, LINE_DETAIL, -0.01, -0.42, -0.06, -0.32)
    tube(ctx, 0.04, HERO.tie, LINE_DETAIL, 0.01, -0.42, 0.06, -0.32)
    for (const k of [-1, 1]) {
      inked(
        ctx,
        (c) => {
          c.beginPath()
          c.ellipse(0.068 * k, -0.435, 0.065, 0.036, 0.35 * k, 0, TAU)
        },
        HERO.tie,
        LINE_DETAIL,
      )
    }
    inkOval(ctx, 0, -0.43, 0.028, 0.028, HERO.tie, LINE_DETAIL)
  }
  ctx.restore()
}

/** A puff of curly hair at (x, y): a cloud of curls; in a zap (0 to 1) its upper curls stand up. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, zap: number) {
  const r = 0.09
  const xyr = [x, y, r]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU - Math.PI / 2
    const out = 1 + 1.6 * zap * Math.max(0, -Math.sin(a))
    xyr.push(x + Math.cos(a) * r * out, y + Math.sin(a) * r * out, 0.058 * (1 - 0.2 * zap))
  }
  blob(ctx, HERO.hair, xyr)
  ctx.beginPath()
  ctx.arc(x - 0.015, y + 0.005, 0.045, Math.PI * 0.9, Math.PI * 1.9)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.lineCap = 'round'
  ctx.strokeStyle = HERO.curl
  ctx.stroke()
}

/** One eye at (x, y) in its mood; `toward` is the way a squeezed eye's chevron points. */
function anEye(ctx: CanvasRenderingContext2D, f: Figure, x: number, y: number, toward: number) {
  const r = 0.07
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  if (f.eyes === 'open') eye(ctx, x, y, r, f.look[0], f.look[1], f.blink ? 0.88 : 0)
  else if (f.eyes === 'happy') eye(ctx, x, y, r, 0, 0, 1)
  else if (f.eyes === 'wide') eye(ctx, x, y, r * 1.15, f.look[0], f.look[1], 0)
  else if (f.eyes === 'squeeze') {
    ctx.beginPath()
    ctx.moveTo(x - toward * r * 0.7, y - r * 0.7)
    ctx.lineTo(x + toward * r * 0.6, y)
    ctx.lineTo(x - toward * r * 0.7, y + r * 0.7)
    ctx.lineWidth = lw(LINE)
    ctx.stroke()
  } else {
    ctx.beginPath()
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * TAU * 1.7 + (f.stars ?? 0) * 2
      const k = (r * i) / 18
      if (i === 0) ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
      else ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
    }
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.stroke()
  }
}

/** Her face: eyes, cheeks, mouth and worried brows, facing the camera or (side) to the right. */
function face(ctx: CanvasRenderingContext2D, f: Figure, side: boolean) {
  const eyes = side ? [0.17] : [-0.105, 0.105]
  const ey = HEAD_Y + 0.035
  for (const x of eyes) {
    anEye(ctx, f, x, ey, side ? 1 : -Math.sign(x))
    blush(ctx, side ? x + 0.015 : x * 1.8, HEAD_Y + 0.125, 0.05)
    if (f.brows) {
      const out = side ? -1 : Math.sign(x)
      ctx.beginPath()
      ctx.moveTo(x + out * 0.055, ey - 0.1)
      ctx.lineTo(x - out * 0.045, ey - 0.13)
      ctx.lineWidth = lw(LINE_DETAIL)
      ctx.lineCap = 'round'
      ctx.strokeStyle = INK
      ctx.stroke()
    }
  }
  const mx = side ? 0.235 : 0
  const my = HEAD_Y + 0.135
  const w = side ? 0.08 : 0.11
  if (f.mouth === 'smile') smile(ctx, mx, my, w, 0)
  else if (f.mouth === 'open') smile(ctx, mx, my - 0.01, w * 1.1, 0.6)
  else if (f.mouth === 'o') smile(ctx, mx, my - 0.01, w * 0.55, 1)
  else if (f.mouth === 'grin') {
    ctx.save()
    ctx.translate(mx + 0.01, my)
    ctx.rotate(-0.25)
    smile(ctx, 0, 0, w, 0)
    ctx.restore()
  } else {
    ctx.beginPath()
    ctx.moveTo(mx - w / 2, my + 0.01)
    for (let i = 1; i <= 4; i++) ctx.lineTo(mx - w / 2 + (w * i) / 4, my + (i % 2 === 0 ? 0.01 : -0.012))
    ctx.lineWidth = lw(LINE_DETAIL * 1.4)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK
    ctx.stroke()
  }
}

/** Her puffs, head, hair, red band and face, lowered with the walk's bounce. */
function head(ctx: CanvasRenderingContext2D, f: Figure, view: Face) {
  const side = view === 'side'
  const hx = side ? 0.02 : 0
  ctx.save()
  ctx.translate(0, f.sink)
  if (side) puff(ctx, -0.21, HEAD_Y - 0.17, f.zap)
  else for (const k of [-1, 1]) puff(ctx, 0.25 * k, HEAD_Y - 0.19, f.zap)
  if (view === 'up') {
    // From behind: all hair, curly at the nape.
    blob(ctx, HERO.hair, [hx, HEAD_Y - 0.01, HEAD_R + 0.015, -0.15, HEAD_Y + 0.2, 0.08, 0, HEAD_Y + 0.23, 0.08, 0.15, HEAD_Y + 0.2, 0.08])
    ctx.beginPath()
    ctx.arc(-0.1, HEAD_Y + 0.0, 0.06, Math.PI * 0.9, Math.PI * 1.9)
    ctx.moveTo(0.16, HEAD_Y + 0.06)
    ctx.arc(0.1, HEAD_Y + 0.06, 0.06, 0, Math.PI)
    ctx.moveTo(-0.02, HEAD_Y + 0.16)
    ctx.arc(-0.07, HEAD_Y + 0.16, 0.05, 0, Math.PI * 0.9)
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.lineCap = 'round'
    ctx.strokeStyle = HERO.curl
    ctx.stroke()
  } else {
    // Her face (from the side with a little nose), and the hair over it: a dome with curly bangs.
    blob(ctx, HERO.skin, side ? [hx, HEAD_Y, HEAD_R, 0.305, HEAD_Y + 0.05, 0.035] : [hx, HEAD_Y, HEAD_R])
    inked(
      ctx,
      (c) => {
        c.beginPath()
        if (side) {
          c.arc(hx, HEAD_Y, HEAD_R + 0.02, Math.PI * 0.62, Math.PI * 1.9)
          c.quadraticCurveTo(0.25, HEAD_Y - 0.035, 0.17, HEAD_Y - 0.115)
          c.quadraticCurveTo(0.11, HEAD_Y - 0.035, 0.045, HEAD_Y - 0.105)
          c.quadraticCurveTo(0.0, HEAD_Y + 0.025, -0.05, HEAD_Y)
          c.quadraticCurveTo(-0.035, HEAD_Y + 0.14, -0.09, HEAD_Y + 0.255)
        } else {
          c.arc(hx, HEAD_Y, HEAD_R + 0.02, Math.PI * 0.93, Math.PI * 2.07)
          c.quadraticCurveTo(0.28, HEAD_Y - 0.08, 0.2, HEAD_Y - 0.1)
          c.quadraticCurveTo(0.15, HEAD_Y - 0.025, 0.08, HEAD_Y - 0.11)
          c.quadraticCurveTo(0, HEAD_Y - 0.035, -0.08, HEAD_Y - 0.11)
          c.quadraticCurveTo(-0.15, HEAD_Y - 0.025, -0.2, HEAD_Y - 0.1)
          c.quadraticCurveTo(-0.28, HEAD_Y - 0.08, -0.3025, HEAD_Y + 0.068)
        }
        c.closePath()
      },
      HERO.hair,
    )
    if (side) inkOval(ctx, -0.005, HEAD_Y + 0.035, 0.048, 0.058, HERO.skin, LINE_DETAIL)
    face(ctx, f, side)
  }
  // The red band over the top of her head, from puff to puff.
  band(ctx, 0.07, HERO.band, LINE_DETAIL, (c) => {
    c.beginPath()
    if (side) c.arc(hx, HEAD_Y, HEAD_R - 0.005, Math.PI * 1.12, Math.PI * 1.72)
    else c.arc(hx, HEAD_Y, HEAD_R - 0.005, Math.PI * 1.2, Math.PI * 1.8)
  })
  ctx.restore()
}

/** One arm, `k` -1 for the back one (screen left, or the far one from the side) and 1 for the front: sleeve, arm bent at the elbow, mitten hand. */
function arm(ctx: CanvasRenderingContext2D, f: Figure, k: -1 | 1, view: Face) {
  const side = view === 'side'
  const far = side && k < 0
  const sx = side ? 0.02 * k : SHOULDER_X * k
  const sy = SHOULDER_Y + f.sink
  const hx = k < 0 ? f.hands[0] : f.hands[2]
  const hy = k < 0 ? f.hands[1] : f.hands[3]
  // Elbows go out to her sides, or back behind her head from the side. A free arm (waving, going round) is nearly straight whatever its reach.
  const reach = k > 0 && f.freeArm ? (1.05 * Math.hypot(hx - sx, hy - sy)) / (UPPER_ARM + FOREARM) : 1
  const [ex, ey] = elbow(sx, sy, hx, hy, side ? -1 : k, UPPER_ARM * reach, FOREARM * reach)
  const skin = far ? HERO.skinFar : HERO.skin
  tube(ctx, ARM_W, skin, LINE, sx, sy, ex, ey, hx, hy)
  tube(ctx, SLEEVE_W, far ? HERO.shirtFar : HERO.shirt, LINE, sx, sy, sx + (ex - sx) * 0.16, sy + (ey - sy) * 0.16)
  inkOval(ctx, hx, hy, HAND_R, HAND_R, skin, LINE)
}

/** The moment's extras round her head: a sweat drop, the zap's sparks, the dizzy stars. */
function extras(ctx: CanvasRenderingContext2D, f: Figure, view: Face) {
  ctx.save()
  ctx.translate(0, f.sink)
  if (f.sweat && view !== 'up') {
    const x = view === 'side' ? 0.37 : 0.35
    const y = view === 'side' ? HEAD_Y - 0.12 : HEAD_Y + 0.02
    inked(
      ctx,
      (c) => {
        c.beginPath()
        c.moveTo(x, y - 0.07)
        c.quadraticCurveTo(x + 0.04, y - 0.02, x + 0.04, y + 0.01)
        c.arc(x, y + 0.01, 0.04, 0, Math.PI)
        c.quadraticCurveTo(x - 0.04, y - 0.02, x, y - 0.07)
        c.closePath()
      },
      HERO.sweat,
      LINE_DETAIL,
    )
  }
  if (f.sparks) {
    for (const k of [-1, 1]) {
      const x = 0.46 * k
      tube(ctx, 0.06, C.zap, LINE_DETAIL, x - 0.03 * k, -0.95, x + 0.05 * k, -0.84, x - 0.02 * k, -0.8, x + 0.06 * k, -0.68)
    }
  }
  if (f.stars !== null) {
    for (let i = 0; i < 3; i++) {
      const a = f.stars + (i * TAU) / 3
      ctx.save()
      ctx.translate(0.36 * Math.cos(a), -1.22 + 0.08 * Math.sin(a))
      star(ctx, Math.sin(a) < 0 ? 0.085 : 0.105)
      ctx.restore()
    }
  }
  ctx.restore()
}

/** Rings of ripples on the water round her, spreading and fading. */
function ripples(ctx: CanvasRenderingContext2D, s: number) {
  const alpha = ctx.globalAlpha
  ctx.strokeStyle = HERO.ripple
  ctx.lineWidth = lw(0.035)
  for (let k = 0; k < 3; k++) {
    const u = (s * 0.8 + k / 3) % 1
    const rx = 0.32 + 0.4 * u
    ctx.globalAlpha = alpha * 0.85 * (1 - u)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, rx * 0.32, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = alpha
}

/**
 * The hero in her pose, origin at her feet, facing the camera, away or (side) to the right.
 * She stands about 1.2 tiles to the top of her head and her hands are where plateAnchor
 * says; the plate and its pile are the renderer's. In the water only what is above the
 * water line at the origin shows, with ripples round her.
 */
export function drawHero(ctx: CanvasRenderingContext2D, pose: HeroPose) {
  const f = figure(pose)
  const view = pose.face
  ctx.save()
  if (f.swim > 0) {
    ripples(ctx, f.ripples)
    ctx.beginPath()
    ctx.ellipse(0, 0.09, 0.22, 0.08, 0, 0, TAU)
    ctx.fillStyle = HERO.underwater
    ctx.fill()
    ctx.beginPath()
    ctx.rect(-0.9, -1.8, 1.8, 1.8)
    ctx.clip()
  }
  ctx.translate(f.shift, f.swim - f.lift)
  ctx.rotate(f.lean)
  ctx.scale(1, f.sy)
  // Her arms go up behind her head, so her face always shows; from the side the far arm is behind her body too, and a free near arm in front of it.
  if (view === 'side') arm(ctx, f, -1, view)
  legs(ctx, f, view)
  body(ctx, f, view)
  if (view !== 'side') arm(ctx, f, -1, view)
  if (!(view === 'side' && f.freeArm)) arm(ctx, f, 1, view)
  head(ctx, f, view)
  if (view === 'side' && f.freeArm) arm(ctx, f, 1, view)
  extras(ctx, f, view)
  ctx.restore()
  if (f.swim > 0) {
    // The water's edge round her chest, over the cut.
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.26, 0.075, 0, 0.05, Math.PI - 0.05)
    ctx.lineWidth = lw(0.04)
    ctx.lineCap = 'round'
    ctx.strokeStyle = HERO.ripple
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------------------
// The sheet

export const FACES = ['down', 'up', 'side'] as const
export const HERO_ACTS: readonly HeroAct[] = ['stand', 'walk', 'teeter', 'bonk', 'zap', 'swim', 'cheer', 'ride']

/** The moments the sheet shows each act at: strides for the walk (eight a cycle), times for standing (the second one blinks), seconds into the act for the rest. */
const MOMENTS: Record<HeroAct, readonly number[]> = {
  stand: [0.6, 3.45],
  walk: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * CYCLE) / 8),
  teeter: [0.05, 0.16, 0.28, 0.4],
  bonk: [0.04, 0.15, 0.32, 0.55],
  zap: [0.02, 0.09, 0.2, 0.38],
  swim: [0.1, 0.3, 0.6, 1.0],
  cheer: [0.02, 0.12, 0.25, 0.4],
  ride: [0, 0.15, 0.3],
}

/** The pose the sheet draws for an act at one of its moments (and at time t for the blink and breath). */
function sheetPose(face: Face, act: HeroAct, m: number, t: number): HeroPose {
  if (act === 'walk') return { face, act, stride: m, since: m, t }
  if (act === 'stand') return { face, act, stride: 0, since: m, t: m }
  return { face, act, stride: 0, since: m, t }
}

/** A stand-in plate (the renderer draws the real one) whose bottom centre is at the anchor, to check her hands. */
function standInPlate(ctx: CanvasRenderingContext2D, a: { x: number; y: number }) {
  inkOval(ctx, a.x, a.y - 0.07, 0.42, 0.09, C.white, LINE)
}

const BOX = { x: -0.9, y: -1.8, w: 1.8, h: 2.0 }

export const SHEET: SheetEntry[] = HERO_ACTS.flatMap((act) =>
  FACES.flatMap((face) =>
    MOMENTS[act].map(
      (m): SheetEntry => ({
        label: `${act} ${face} ${m.toFixed(2)}`,
        box: BOX,
        draw: (ctx, t) => {
          const p = sheetPose(face, act, m, t)
          if (act !== 'swim') groundShadow(ctx, 0.28, 0.1)
          drawHero(ctx, p)
          standInPlate(ctx, plateAnchor(p))
        },
      }),
    ),
  ),
)
