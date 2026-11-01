import { BAR_HALF, POST_R, type CourseId, type Hue } from '../game/model'
import { drawHero, plateAnchor } from './hero'
import { C, HUE, INK, LINE, LINE_BIG, LINE_DETAIL, blob, blush, circlesPath, eye, groundShadow, hash, inkOval, inked, lw, roundRectPath, shine, smile, star, tube, type SheetEntry } from './look'

/**
 * The things on the course and the finale's animals. The poles say "do not touch" in one
 * voice: bold red-and-white candy stripes with dark red knobs, carried BAR_UP over a dark
 * shadow on the ground that is exactly where they hit. A closed gate stands in its hue with
 * dim lamps on its end posts and yellow crackles along it; it sinks into its slot to open
 * and its lamps light up. A button is a glossy dome that begs to be stepped on. Upright
 * things stand on their origin (look.ts rule 1) and draw no shadow of their own unless
 * their doc says so.
 */

/** The poles: candy stripes, the knobs at their ends, the slider's wheels and struts, the spinners' posts (a course's own paint), the groove a slider runs in. */
const POLE = { red: '#FF3F55', white: '#FFFFFF', knob: '#C92A44', wheel: '#5A4B66', hub: '#FFD23F', strut: '#8C8399' }
const POST_PAINT: Record<CourseId, string> = { park: '#3D9BFF', pond: '#1FB5A8', garden: '#B46CFF', farm: '#E8553D', castle: '#8A93A6' }
const GROOVE = { slot: 'rgba(60, 44, 16, 0.28)', lip: 'rgba(255, 255, 255, 0.35)' }
/** A gate's slot in the ground, and its lit lamps' white heart. */
const GATE = { slot: '#5B4636', glass: '#FFFFFF' }
/** A button's stone ring. */
const RING = { top: '#E3DCCF', side: '#B9AF9F' }
/** The flag: its pole, the pale flag before she reaches it, each course's bright one. */
const FLAG = { pole: '#F6F1E7', ball: '#FFD23F', pale: '#F3ECDD', base: '#B9AF9F' }
const FLAG_BRIGHT: Record<CourseId, string> = { park: '#FF5A4E', pond: '#3D9BFF', garden: '#FF5FAE', farm: '#FF8A3D', castle: '#9B6BFF' }
const FROG = { skin: '#5CC75A', light: '#86DB6F', dark: '#3E9F45', belly: '#F4F7C8', plate: '#FFFFFF', rim: '#E9E2D4' }
const DUCK = { body: '#FFD84A', shade: '#F2B530', beak: '#FF8A3D', ripple: '#FFFFFF' }
const FISH = { body: '#FF8A5C', light: '#FFB592', fin: '#E8603A', splash: '#FFFFFF' }
const PUPPY = { fur: '#F2D3A0', shade: '#DDB57C', ear: '#A8693A', nose: '#2E1A14', collar: '#FF4A5A', tag: '#FFD23F' }
const BIRD = { body: '#6FB7FF', belly: '#FFF0B3', wing: '#4A8FE0', beak: '#FFB627', leg: '#E08A2E' }

const TAU = Math.PI * 2

/** How high above the ground the pole bars are carried. */
export const BAR_UP = 0.55
/** A spinner's post: how tall, and how thick its round shaft is (its foot is POST_R wide). */
const POST_H = 0.85
const SHAFT = 0.12

/** The ground point (x, y) seen BAR_UP up. */
const up = (y: number) => y - BAR_UP

/**
 * A pole's bar between two ground points (relative to the origin), carried BAR_UP above
 * them: a bold round pole in red-and-white candy stripes that creep along it, dark red
 * knobs at its ends, a shine along its top.
 */
export function drawBar(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const w = 2 * BAR_HALF
  ctx.save()
  ctx.translate(x0, up(y0))
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0))
  const capsule = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    c.moveTo(0, -w / 2)
    c.lineTo(len, -w / 2)
    c.arc(len, 0, w / 2, -Math.PI / 2, Math.PI / 2)
    c.lineTo(0, w / 2)
    c.arc(0, 0, w / 2, Math.PI / 2, Math.PI * 1.5)
    c.closePath()
  }
  capsule(ctx)
  ctx.fillStyle = POLE.white
  ctx.fill()
  ctx.save()
  capsule(ctx)
  ctx.clip()
  ctx.beginPath()
  const step = 0.24
  const creep = (t * 0.25) % step
  for (let s = -step - w + creep; s < len + w; s += step) {
    ctx.moveTo(s, w)
    ctx.lineTo(s + step / 2, w)
    ctx.lineTo(s + step / 2 + w * 0.8, -w)
    ctx.lineTo(s + w * 0.8, -w)
    ctx.closePath()
  }
  ctx.fillStyle = POLE.red
  ctx.fill()
  // The knobs at both ends, and the darker underside of the round pole.
  ctx.beginPath()
  ctx.arc(0, 0, w / 2 + 0.01, 0, TAU)
  ctx.moveTo(len + w / 2 + 0.01, 0)
  ctx.arc(len, 0, w / 2 + 0.01, 0, TAU)
  ctx.fillStyle = POLE.knob
  ctx.fill()
  ctx.restore()
  shine(ctx, 0.028, Math.min(0.06, len / 2), -w * 0.22, Math.max(len - 0.06, len / 2), -w * 0.22)
  capsule(ctx)
  ctx.lineWidth = lw(LINE)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

/** A bar's shadow on the ground along exactly the line where it hits, 2 * BAR_HALF wide, dark at its core with a soft edge. */
export function drawBarShadow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineCap = 'round'
  ctx.strokeStyle = C.shadow
  ctx.lineWidth = lw(2 * BAR_HALF + 0.05)
  ctx.stroke()
  ctx.lineWidth = lw(2 * BAR_HALF)
  ctx.stroke()
  ctx.stroke()
}

/** A spinner's post, origin at its ground point: a round foot POST_R wide, a shaft in the course's paint with white bands, a collar where the bar turns, a golden cap. */
export function drawPost(ctx: CanvasRenderingContext2D, course: CourseId, t: number) {
  const paint = POST_PAINT[course]
  inkOval(ctx, 0, -0.03, POST_R, POST_R * 0.45, paint)
  const shaft = (c: CanvasRenderingContext2D) => roundRectPath(c, -SHAFT, -POST_H, 2 * SHAFT, POST_H - 0.03, 0.05)
  inked(ctx, shaft, paint)
  ctx.save()
  shaft(ctx)
  ctx.clip()
  ctx.fillStyle = POLE.white
  for (const y of [-0.3, -0.72]) ctx.fillRect(-SHAFT, y - 0.04, 2 * SHAFT, 0.08)
  ctx.restore()
  shine(ctx, 0.03, -SHAFT * 0.45, -POST_H + 0.12, -SHAFT * 0.45, -0.12)
  // The collar the bar turns on, ticking round, and the cap.
  inkOval(ctx, 0, up(0), SHAFT + 0.05, 0.07, POLE.knob)
  const tick = (t * 2) % 1
  ctx.beginPath()
  ctx.arc(0, up(0), SHAFT + 0.03, Math.PI * (0.1 + tick), Math.PI * (0.35 + tick))
  ctx.lineWidth = lw(0.025)
  ctx.lineCap = 'round'
  ctx.strokeStyle = POLE.white
  ctx.stroke()
  blob(ctx, POLE.hub, [0, -POST_H - 0.03, 0.09])
  shine(ctx, 0.022, -0.04, -POST_H - 0.05, -0.015, -POST_H - 0.08)
}

/** A wheel of radius `r` at (x, y) whose spokes have turned `turn` radians. */
function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
  inkOval(ctx, x, y, r, r, POLE.wheel)
  ctx.beginPath()
  for (let k = 0; k < 3; k++) {
    const a = turn + (k * TAU) / 6
    ctx.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7)
    ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7)
  }
  ctx.lineWidth = lw(0.025)
  ctx.lineCap = 'round'
  ctx.strokeStyle = POLE.strut
  ctx.stroke()
  inkOval(ctx, x, y, r * 0.3, r * 0.3, POLE.hub, LINE_DETAIL)
}

/** The slider's wheels: this big. */
const WHEEL_R = 0.13

/**
 * A slider, origin at its middle on the ground: a bar of half-length `half` lying at
 * `angle` (turns from +x), carried BAR_UP up on a strut at each end over a little wheel
 * that touches the ground; the wheels' spokes turn with `rolled` (tiles travelled).
 */
export function drawSlider(ctx: CanvasRenderingContext2D, half: number, angle: number, rolled: number, t: number) {
  const dx = Math.cos(angle * TAU) * half
  const dy = Math.sin(angle * TAU) * half
  // The far end's wheel and strut first, then the near one's, then the bar over both.
  const ends = dy >= 0 ? [-1, 1] : [1, -1]
  for (const k of ends) {
    const x = k * dx
    const y = k * dy
    tube(ctx, 0.07, POLE.strut, LINE, x, y - WHEEL_R, x, up(y))
    wheel(ctx, x, y - WHEEL_R, WHEEL_R, rolled / WHEEL_R)
  }
  drawBar(ctx, -dx, -dy, dx, dy, t)
}

/** A slider's groove in the ground between two points relative to the origin: a flat dark slot with a light lip, low in contrast (ground layer, no ink). */
export function drawGroove(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.lineCap = 'round'
  ctx.strokeStyle = GROOVE.lip
  ctx.lineWidth = lw(0.16)
  ctx.stroke()
  ctx.strokeStyle = GROOVE.slot
  ctx.lineWidth = lw(0.1)
  ctx.stroke()
}

/** 0 before a, 1 after b, smooth between. */
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** A gate's lamp at (x, y): lit, glowing in its hue with a white heart, or dim. */
function lamp(ctx: CanvasRenderingContext2D, x: number, y: number, hue: Hue, lit: boolean) {
  const k = HUE[hue]
  if (lit) {
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * 0.5
    ctx.beginPath()
    ctx.arc(x, y, 0.18, 0, TAU)
    ctx.fillStyle = k.light
    ctx.fill()
    ctx.globalAlpha = alpha
  }
  inkOval(ctx, x, y, 0.1, 0.1, lit ? k.light : k.dark)
  if (lit) {
    ctx.beginPath()
    ctx.arc(x, y, 0.055, 0, TAU)
    ctx.fillStyle = GATE.glass
    ctx.fill()
  }
  shine(ctx, 0.022, x - 0.055, y - 0.015, x - 0.03, y - 0.055)
}

/** A gate's end post standing at (x, y), `h` tall, with its lamp on top. */
function gatePost(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, hue: Hue, lit: boolean) {
  const k = HUE[hue]
  inked(ctx, (c) => roundRectPath(c, x - 0.075, y - h, 0.15, h, 0.04), k.dark)
  inked(ctx, (c) => roundRectPath(c, x - 0.1, y - h - 0.05, 0.2, 0.08, 0.03), k.base)
  lamp(ctx, x, y - h - 0.13, hue, lit)
}

/** Zap crackles along a closed gate within the box (x, y, w, h): two small yellow bolts that jump to new spots three times a second and fade in between. */
function crackles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const beat = Math.floor(t * 3)
  const alpha = ctx.globalAlpha
  ctx.globalAlpha = alpha * (1 - 0.6 * ((t * 3) % 1))
  for (let k = 0; k < 2; k++) {
    const cx = x + w * hash(beat, k, 1)
    const cy = y + h * hash(beat, k, 2)
    const s = 0.08 + 0.04 * hash(beat, k, 3)
    const d = hash(beat, k, 4) < 0.5 ? 1 : -1
    tube(ctx, 0.055, C.zap, LINE_DETAIL, cx - s, cy - s * d, cx - s * 0.2, cy + s * 0.3 * d, cx + s * 0.2, cy - s * 0.3 * d, cx + s, cy + s * d)
  }
  ctx.globalAlpha = alpha
}

/** How tall a closed gate's pickets stand, and its end posts; the heights of its two rails. */
const GATE_H = 0.78
const GATE_POST = 1.0
const RAILS = [0.2, 0.56] as const
/** A run's end posts stand this far from the middle of their tile. */
const END = 0.4

/** One picket standing at (x, gy) with `h` of it above the slot, `w` wide either side: a board in the gate's hue with a rounded top and a lit stripe. */
function picket(ctx: CanvasRenderingContext2D, x: number, gy: number, h: number, w: number, hue: Hue) {
  const k = HUE[hue]
  const top = gy - h
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(x - w, gy + 0.02)
      c.lineTo(x - w, Math.min(gy, top + w))
      c.quadraticCurveTo(x, top - 0.06, x + w, Math.min(gy, top + w))
      c.lineTo(x + w, gy + 0.02)
      c.closePath()
    },
    k.base,
  )
  if (h > 0.2) {
    ctx.fillStyle = k.light
    ctx.fillRect(x - w + 0.025, top + 0.1, 0.035, h - 0.16)
  }
}

/** A rail from (x0, y0) to (x1, y1), `w` wide either side of that line across (a rail along a row) or up the screen (along a column), inked along its length. */
function gateRail(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, hue: Hue) {
  const across = y0 === y1
  ctx.fillStyle = HUE[hue].dark
  if (across) ctx.fillRect(x0, y0 - 0.045, x1 - x0, 0.09)
  else ctx.fillRect(x0 - 0.035, y0, 0.07, y1 - y0)
  ctx.beginPath()
  if (across) {
    ctx.moveTo(x0, y0 - 0.045)
    ctx.lineTo(x1, y0 - 0.045)
    ctx.moveTo(x0, y0 + 0.045)
    ctx.lineTo(x1, y0 + 0.045)
  } else {
    ctx.moveTo(x0 - 0.035, y0)
    ctx.lineTo(x0 - 0.035, y1)
    ctx.moveTo(x0 + 0.035, y0)
    ctx.lineTo(x0 + 0.035, y1)
  }
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/**
 * One tile of a gate, origin at the tile's bottom centre (like drawSolid). Closed (open 0):
 * a sturdy picket gate in its hue, posts with round lamps at the run's ends, yellow
 * crackles flickering along it. Opening (0..1): it slides down into its slot. Open (1): only
 * the slot and low posts with glowing lamps remain. warn: the lamps blink three times a
 * second. along 'row': the run lies across the tile's middle, seen from the front; 'col':
 * it runs up the screen along the tile's middle, two pickets a tile with the rails between
 * them (its first tile the farthest up).
 */
export function drawGateTile(ctx: CanvasRenderingContext2D, hue: Hue, along: 'row' | 'col', part: 'single' | 'first' | 'middle' | 'last', open: number, warn: boolean, t: number) {
  const startEnd = part === 'single' || part === 'first'
  const endEnd = part === 'single' || part === 'last'
  const lit = open > 0 && !(warn && (t * 3) % 1 >= 0.5)
  const drop = GATE_H * smooth(0, 1, open)
  const h = GATE_H - drop
  const postH = GATE_POST - 0.72 * smooth(0, 1, open)
  if (along === 'row') {
    const gy = -0.5
    const x0 = startEnd ? -END : -0.5
    const x1 = endEnd ? END : 0.5
    ctx.fillStyle = GATE.slot
    ctx.fillRect(x0, gy - 0.045, x1 - x0, 0.09)
    if (h > 0.01) {
      for (const rh of RAILS) if (rh - drop > 0.03) gateRail(ctx, x0, gy - rh + drop, x1, gy - rh + drop, hue)
      for (const x of [-0.375, -0.125, 0.125, 0.375]) picket(ctx, x, gy, h, 0.08, hue)
      if (open === 0) crackles(ctx, x0 + 0.05, gy - GATE_H + 0.05, x1 - x0 - 0.1, GATE_H - 0.15, t)
    }
    if (startEnd) gatePost(ctx, -END, gy + 0.04, postH, hue, lit)
    if (endEnd) gatePost(ctx, END, gy + 0.04, postH, hue, lit)
    return
  }
  const y0 = startEnd ? -0.92 : -1
  const y1 = endEnd ? -0.08 : 0
  ctx.fillStyle = GATE.slot
  ctx.fillRect(-0.045, y0, 0.09, y1 - y0)
  if (startEnd) gatePost(ctx, 0, y0 + 0.04, postH, hue, lit)
  if (h > 0.01) {
    for (const rh of RAILS) if (rh - drop > 0.03) gateRail(ctx, 0, y0 - rh + drop, 0, y1 - rh + drop, hue)
    for (const gy of [-0.7, -0.3]) picket(ctx, 0, gy, h, 0.12, hue)
    if (open === 0) crackles(ctx, -0.2, y0 - GATE_H + 0.1, 0.4, y1 - y0 + 0.3, t)
  }
  if (endEnd) gatePost(ctx, 0, y1 + 0.02, postH, hue, lit)
}

/**
 * A big round push button set into the ground, origin at its middle, about 0.7 wide. Up
 * (down 0): a glossy dome in its hue on a stone ring with a soft ring of light pulsing out,
 * asking to be stepped on. Down (1): sunk flat with a glowing ring.
 */
export function drawButton(ctx: CanvasRenderingContext2D, hue: Hue, down: number, t: number) {
  const k = HUE[hue]
  const rise = 0.12 * (1 - down)
  inkOval(ctx, 0, 0, 0.36, 0.21, RING.top)
  ctx.beginPath()
  ctx.ellipse(0, 0.01, 0.285, 0.16, 0, 0, TAU)
  ctx.fillStyle = RING.side
  ctx.fill()
  if (down > 0.5) {
    ctx.beginPath()
    ctx.ellipse(0, 0.005, 0.31, 0.18, 0, 0, TAU)
    ctx.lineWidth = lw(0.05)
    ctx.strokeStyle = k.light
    ctx.stroke()
  }
  // The dome: its side from the ring up to its top, then the top.
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.ellipse(0, 0, 0.25, 0.14, 0, 0, Math.PI)
      c.lineTo(-0.25, -rise)
      c.ellipse(0, -rise, 0.25, 0.14, 0, Math.PI, TAU)
      c.closePath()
    },
    k.dark,
  )
  inkOval(ctx, 0, -rise, 0.25, 0.14, k.base)
  ctx.beginPath()
  ctx.ellipse(-0.02, -rise - 0.02, 0.15, 0.08, 0, 0, TAU)
  ctx.fillStyle = k.light
  ctx.fill()
  shine(ctx, 0.035, -0.15, -rise - 0.02, -0.07, -rise - 0.085)
  if (down < 0.5) {
    const u = (t / 1.6) % 1
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * 0.7 * (1 - u)
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.3 + 0.16 * u, 0.17 + 0.09 * u, 0, 0, TAU)
    ctx.lineWidth = lw(0.035)
    ctx.strokeStyle = C.white
    ctx.stroke()
    ctx.globalAlpha = alpha
  }
}

/** The flag's pole height, and how long the reached flag takes to run up. */
const FLAG_H = 1.5
const RUN_UP = 0.45

/**
 * A checkpoint flag about 1.5 tall, origin at its foot. Not reached: a small pale flag low
 * on the pole. Reached: it runs up to the top and turns the course's bright colour with a
 * burst of stars for the first 0.8 seconds, then waves.
 */
export function drawFlag(ctx: CanvasRenderingContext2D, course: CourseId, reached: boolean, since: number, t: number) {
  inkOval(ctx, 0, -0.02, 0.16, 0.07, FLAG.base)
  tube(ctx, 0.07, FLAG.pole, LINE, 0, -0.03, 0, -FLAG_H)
  const run = reached ? smooth(0, RUN_UP, since) : 0
  const bright = reached ? smooth(RUN_UP * 0.5, RUN_UP, since) : 0
  const top = -0.62 - run * (FLAG_H - 0.62 - 0.08)
  const w = 0.34 + 0.12 * run
  const fh = 0.24 + 0.06 * run
  const wave = (0.02 + 0.03 * run) * Math.sin(TAU * 1.4 * t)
  const flag = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    c.moveTo(0.035, top)
    c.quadraticCurveTo(w * 0.5, top - 0.05 + wave, w, top + wave)
    c.quadraticCurveTo(w - 0.06, top + fh / 2 + wave, w, top + fh + wave)
    c.quadraticCurveTo(w * 0.5, top + fh + 0.05 - wave, 0.035, top + fh)
    c.closePath()
  }
  inked(ctx, flag, FLAG.pale)
  if (bright > 0) {
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * bright
    flag(ctx)
    ctx.fillStyle = FLAG_BRIGHT[course]
    ctx.fill()
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(w * 0.5, top + fh / 2 + wave * 0.5, 0.05 * bright, 0, TAU)
    ctx.fillStyle = C.white
    ctx.fill()
    flag(ctx)
    ctx.lineWidth = lw(LINE)
    ctx.strokeStyle = INK
    ctx.stroke()
  }
  inkOval(ctx, 0, -FLAG_H - 0.05, 0.07, 0.07, FLAG.ball)
  if (reached && since < 0.8) {
    // The burst: stars flying out from the flag and fading.
    const u = since / 0.8
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = alpha * (1 - u * u)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3
      ctx.save()
      ctx.translate(w * 0.5 + Math.cos(a) * (0.18 + 0.45 * u), top + fh / 2 + Math.sin(a) * (0.14 + 0.35 * u))
      star(ctx, 0.09)
      ctx.restore()
    }
    ctx.globalAlpha = alpha
  }
}

// ---------------------------------------------------------------------------------------
// The animals

/** How long the frog's hop takes. */
const HOP = 0.55

/**
 * The big friendly frog that fetches her out of the water, about 1.3 tiles tall, hopping,
 * facing right, origin at its feet. With `rider` she sits on its back, waving, her empty
 * plate held up in her other hand.
 */
export function drawFrog(ctx: CanvasRenderingContext2D, rider: boolean, since: number, t: number) {
  const u = (since % HOP) / HOP
  const lift = 0.3 * 4 * u * (1 - u)
  const sy = 1 - 0.07 * Math.cos(TAU * u)
  ctx.save()
  ctx.translate(0, -lift)
  ctx.scale(2 - sy, sy)
  // The far back leg, then her (the body hides her legs), then the frog over her.
  inkOval(ctx, -0.3, -0.24, 0.3, 0.2, FROG.dark)
  if (rider) {
    ctx.save()
    ctx.translate(-0.06, -0.52)
    ctx.scale(0.8, 0.8)
    const pose = { face: 'side', act: 'ride', stride: 0, since, t } as const
    drawHero(ctx, pose)
    const a = plateAnchor(pose)
    inkOval(ctx, a.x, a.y - 0.07, 0.38, 0.09, FROG.plate)
    ctx.beginPath()
    ctx.ellipse(a.x, a.y - 0.08, 0.26, 0.05, 0, 0, TAU)
    ctx.fillStyle = FROG.rim
    ctx.fill()
    ctx.restore()
  }
  const body = [-0.05, -0.48, 0.42, 0.28, -0.52, 0.34, 0.2, -0.86, 0.14, 0.44, -0.84, 0.13]
  blob(ctx, FROG.skin, body, LINE_BIG)
  ctx.save()
  circlesPath(ctx, body)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(0.24, -0.25, 0.3, 0.2, 0, 0, TAU)
  ctx.fillStyle = FROG.belly
  ctx.fill()
  circlesPath(ctx, [-0.18, -0.74, 0.16, 0.02, -0.82, 0.1])
  ctx.fillStyle = FROG.light
  ctx.fill()
  ctx.restore()
  // The near back leg, folded, with its webbed foot; the front leg.
  inkOval(ctx, -0.26, -0.03, 0.22, 0.06, FROG.dark)
  blob(ctx, FROG.skin, [-0.28, -0.26, 0.2, -0.16, -0.18, 0.13])
  tube(ctx, 0.11, FROG.skin, LINE, 0.36, -0.35, 0.42, -0.05)
  inkOval(ctx, 0.47, -0.03, 0.1, 0.045, FROG.dark)
  // The face: eyes up on top, a wide smile, a rosy cheek.
  eye(ctx, 0.2, -0.88, 0.085, 0.4, -0.1, 0)
  eye(ctx, 0.44, -0.86, 0.08, 0.5, -0.1, 0)
  ctx.beginPath()
  ctx.moveTo(0.3, -0.58)
  ctx.quadraticCurveTo(0.5, -0.5, 0.6, -0.64)
  ctx.lineWidth = lw(LINE)
  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  blush(ctx, 0.5, -0.66, 0.05)
  ctx.restore()
}

/** A little duck swimming, facing right, origin at the waterline: it bobs, and only what is above the water shows, with ripples round it. */
export function drawDuck(ctx: CanvasRenderingContext2D, t: number, phase: number) {
  const b = 0.025 * Math.sin(TAU * (t / 1.4 + phase))
  ctx.save()
  ctx.beginPath()
  ctx.rect(-0.45, -0.45, 0.9, 0.45)
  ctx.clip()
  ctx.translate(0, b)
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(-0.26, -0.2)
      c.quadraticCurveTo(-0.2, -0.12, -0.12, -0.15)
      c.quadraticCurveTo(0.05, -0.2, 0.2, -0.12)
      c.quadraticCurveTo(0.28, -0.02, 0.18, 0.06)
      c.lineTo(-0.2, 0.06)
      c.quadraticCurveTo(-0.28, -0.05, -0.26, -0.2)
      c.closePath()
    },
    DUCK.body,
  )
  ctx.beginPath()
  ctx.moveTo(-0.12, -0.09)
  ctx.quadraticCurveTo(0.0, -0.02, 0.1, -0.08)
  ctx.lineWidth = lw(0.03)
  ctx.lineCap = 'round'
  ctx.strokeStyle = DUCK.shade
  ctx.stroke()
  inkOval(ctx, 0.27, -0.27, 0.075, 0.035, DUCK.beak)
  inkOval(ctx, 0.15, -0.28, 0.105, 0.1, DUCK.body)
  eye(ctx, 0.19, -0.3, 0.032, 0.5, 0, 0)
  ctx.restore()
  ctx.beginPath()
  ctx.ellipse(0, b, 0.3, 0.07, 0, 0.15, Math.PI - 0.15)
  ctx.moveTo(0.36, b - 0.01)
  ctx.lineTo(0.44, b - 0.01)
  ctx.moveTo(-0.44, b - 0.01)
  ctx.lineTo(-0.36, b - 0.01)
  ctx.lineWidth = lw(0.03)
  ctx.lineCap = 'round'
  ctx.strokeStyle = DUCK.ripple
  ctx.stroke()
}

/** A splash at (x, 0): a ring spreading on the water and a few drops, `u` from 0 to 1 through it. */
function splash(ctx: CanvasRenderingContext2D, x: number, u: number) {
  const alpha = ctx.globalAlpha
  ctx.globalAlpha = alpha * (1 - u)
  ctx.beginPath()
  ctx.ellipse(x, 0, 0.1 + 0.32 * u, 0.04 + 0.1 * u, 0, 0, TAU)
  ctx.lineWidth = lw(0.035)
  ctx.strokeStyle = FISH.splash
  ctx.stroke()
  ctx.beginPath()
  for (const d of [-1, 0, 1]) {
    const dx = x + d * (0.08 + 0.15 * u)
    const dy = -0.25 * 4 * u * (1 - u) * (d === 0 ? 1.3 : 1) - 0.02
    ctx.moveTo(dx + 0.03, dy)
    ctx.arc(dx, dy, 0.03, 0, TAU)
  }
  ctx.fillStyle = FISH.splash
  ctx.fill()
  ctx.globalAlpha = alpha
}

/** How long the fish's leap takes, and its splash after. */
const LEAP = 0.8
const SPLASH = 0.55

/** A fish leaping out of the water to gulp a food that fell in at the origin (a splash as it jumps, an arc of LEAP seconds), then a splash ring where it dives back in; nothing after. */
export function drawFish(ctx: CanvasRenderingContext2D, since: number) {
  if (since < LEAP) {
    const u = since / LEAP
    if (u < 0.35) splash(ctx, -0.12, u / 0.35)
    const x = -0.12 + 0.6 * u
    const y = 0.1 - 0.85 * 4 * u * (1 - u)
    ctx.save()
    ctx.beginPath()
    ctx.rect(-0.6, -1.05, 1.5, 1.05)
    ctx.clip()
    ctx.translate(x, y)
    ctx.rotate(Math.atan2(-0.85 * 4 * (1 - 2 * u), 0.6))
    // Tail, body, fin, eye, and the mouth: wide open at first for the gulp.
    inked(
      ctx,
      (c) => {
        c.beginPath()
        c.moveTo(-0.14, 0)
        c.lineTo(-0.27, -0.08)
        c.quadraticCurveTo(-0.24, 0, -0.27, 0.08)
        c.closePath()
      },
      FISH.fin,
    )
    inkOval(ctx, 0, 0, 0.17, 0.095, FISH.body)
    ctx.beginPath()
    ctx.ellipse(0.02, 0.03, 0.11, 0.045, 0, 0, TAU)
    ctx.fillStyle = FISH.light
    ctx.fill()
    inkOval(ctx, -0.03, -0.085, 0.06, 0.03, FISH.fin, LINE_DETAIL)
    eye(ctx, 0.08, -0.02, 0.035, 0.5, 0, 0)
    if (u < 0.3) smile(ctx, 0.15, 0.01, 0.06, 1)
    else smile(ctx, 0.13, 0.025, 0.05, 0)
    ctx.restore()
    return
  }
  if (since < LEAP + SPLASH) splash(ctx, 0.48, (since - LEAP) / SPLASH)
}

/** Tiles the puppy trots in one cycle of its legs. */
const TROT = 0.6

/** A cute puppy (the farm's) trotting, about 0.7 tiles tall, origin at its feet; 'side' faces right. */
export function drawPuppy(ctx: CanvasRenderingContext2D, face: 'down' | 'up' | 'side', walked: number, t: number) {
  const ph = (TAU * walked) / TROT
  const s = Math.sin(ph)
  const bounce = -0.03 * Math.abs(Math.cos(ph))
  const wag = 0.5 * Math.sin(TAU * 3 * t)
  if (face === 'side') {
    // Far legs, tail, body, near legs, head with its floppy ear and collar.
    for (const [x, k] of [
      [-0.14, -1],
      [0.12, 1],
    ] as const)
      tube(ctx, 0.08, PUPPY.shade, LINE, x, -0.25 + bounce, x - 0.06 * s * k, -0.03)
    ctx.save()
    ctx.translate(-0.24, -0.38 + bounce)
    ctx.rotate(-0.6 + wag * 0.4)
    tube(ctx, 0.07, PUPPY.fur, LINE, 0, 0, -0.04, -0.14)
    ctx.restore()
    inkOval(ctx, -0.02, -0.32 + bounce, 0.25, 0.15, PUPPY.fur)
    for (const [x, k] of [
      [-0.1, 1],
      [0.16, -1],
    ] as const) {
      tube(ctx, 0.085, PUPPY.fur, LINE, x, -0.24 + bounce, x + 0.06 * s * k, -0.04)
      inkOval(ctx, x + 0.06 * s * k + 0.02, -0.03, 0.05, 0.03, PUPPY.fur, LINE_DETAIL)
    }
    tube(ctx, 0.06, PUPPY.collar, LINE_DETAIL, 0.1, -0.44 + bounce, 0.22, -0.4 + bounce)
    blob(ctx, PUPPY.fur, [0.22, -0.55 + bounce, 0.16, 0.35, -0.5 + bounce, 0.085])
    inkOval(ctx, 0.43, -0.53 + bounce, 0.035, 0.03, PUPPY.nose, LINE_DETAIL)
    eye(ctx, 0.27, -0.6 + bounce, 0.04, 0.6, 0, 0)
    smile(ctx, 0.37, -0.46 + bounce, 0.05, 0)
    ctx.save()
    ctx.translate(0.13, -0.62 + bounce)
    ctx.rotate(0.35 + 0.1 * s)
    inkOval(ctx, 0, 0.07, 0.055, 0.11, PUPPY.ear)
    ctx.restore()
    inkOval(ctx, 0.17, -0.38 + bounce, 0.03, 0.03, PUPPY.tag, LINE_DETAIL)
    return
  }
  // Facing the camera or away: legs stepping in turn, a round body, the head with both ears.
  for (const [x, k] of [
    [-0.1, 1],
    [0.1, -1],
  ] as const) {
    const lift = -0.04 * Math.max(0, s * k)
    tube(ctx, 0.085, PUPPY.fur, LINE, x, -0.2 + bounce, x, -0.04 + lift)
    inkOval(ctx, x, -0.03 + lift, 0.05, 0.03, PUPPY.fur, LINE_DETAIL)
  }
  inkOval(ctx, 0, -0.27 + bounce, 0.17, 0.14, PUPPY.fur)
  blob(ctx, PUPPY.fur, [0, -0.5 + bounce, 0.17])
  if (face === 'up') {
    // From behind, its tail wags over its back.
    ctx.save()
    ctx.translate(0, -0.2 + bounce)
    ctx.rotate(wag * 0.6)
    tube(ctx, 0.07, PUPPY.fur, LINE, 0, 0, 0.03, -0.17)
    ctx.restore()
  }
  tube(ctx, 0.06, PUPPY.collar, LINE_DETAIL, -0.1, -0.36 + bounce, 0.1, -0.36 + bounce)
  for (const k of [-1, 1]) {
    ctx.save()
    ctx.translate(0.14 * k, -0.6 + bounce)
    ctx.rotate(-0.35 * k + 0.08 * s)
    inkOval(ctx, 0, 0.09, 0.06, 0.12, PUPPY.ear)
    ctx.restore()
  }
  if (face === 'down') {
    inkOval(ctx, 0, -0.33 + bounce, 0.03, 0.03, PUPPY.tag, LINE_DETAIL)
    eye(ctx, -0.07, -0.53 + bounce, 0.04, 0, 0.2, 0)
    eye(ctx, 0.07, -0.53 + bounce, 0.04, 0, 0.2, 0)
    inkOval(ctx, 0, -0.45 + bounce, 0.07, 0.05, PUPPY.shade, LINE_DETAIL)
    inkOval(ctx, 0, -0.47 + bounce, 0.03, 0.022, PUPPY.nose, LINE_DETAIL)
    smile(ctx, 0, -0.42 + bounce, 0.06, 0.5)
  }
}

/** A little round bird, origin at its feet, facing right: flying (wings beating, legs tucked), hopping, or pecking at the ground. */
export function drawBird(ctx: CanvasRenderingContext2D, act: 'fly' | 'hop' | 'peck', since: number, t: number) {
  const hop = act === 'hop' ? 0.12 * Math.abs(Math.sin(TAU * 1.6 * since)) : 0
  const tilt = act === 'peck' ? 0.7 * Math.max(0, Math.sin(TAU * 1.5 * since)) : 0
  ctx.save()
  ctx.translate(0, -hop)
  if (act !== 'fly') {
    ctx.beginPath()
    ctx.moveTo(-0.03, -0.06)
    ctx.lineTo(-0.04, 0)
    ctx.moveTo(0.03, -0.06)
    ctx.lineTo(0.04, 0)
    ctx.lineWidth = lw(0.03)
    ctx.lineCap = 'round'
    ctx.strokeStyle = BIRD.leg
    ctx.stroke()
  }
  ctx.translate(0, -0.05)
  ctx.rotate(tilt)
  ctx.translate(0, 0.05)
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(-0.1, -0.18)
      c.lineTo(-0.24, -0.27)
      c.lineTo(-0.22, -0.16)
      c.closePath()
    },
    BIRD.wing,
    LINE_DETAIL,
  )
  inkOval(ctx, 0, -0.18, 0.14, 0.13, BIRD.body)
  ctx.beginPath()
  ctx.ellipse(0.04, -0.13, 0.09, 0.075, 0, 0, TAU)
  ctx.fillStyle = BIRD.belly
  ctx.fill()
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(0.12, -0.22)
      c.lineTo(0.22, -0.19)
      c.lineTo(0.12, -0.16)
      c.closePath()
    },
    BIRD.beak,
    LINE_DETAIL,
  )
  eye(ctx, 0.06, -0.22, 0.035, 0.5, 0, 0)
  // The wing: folded on its side, or beating.
  const flap = act === 'fly' ? Math.sin(TAU * 5 * t) : 0
  ctx.save()
  ctx.translate(-0.04, -0.18)
  ctx.rotate(act === 'fly' ? -0.6 - 0.9 * flap : 0.2)
  inkOval(ctx, -0.06, 0, 0.1, 0.055, BIRD.wing, LINE_DETAIL)
  ctx.restore()
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A whole spinner in one go, origin at its post, its first arm pointing `turn` turns from +x: the bars' shadows and the post's, the arms behind the post, the post, the arms in front (for the sheet, or a renderer that need not sort the arms among other things). */
export function drawSpinner(ctx: CanvasRenderingContext2D, course: CourseId, arms: 1 | 2, reach: number, turn: number, t: number) {
  const ends = Array.from({ length: arms }, (_, k) => {
    const a = (turn + k / 2) * TAU
    return [Math.cos(a) * reach, Math.sin(a) * reach] as const
  })
  for (const [x, y] of ends) drawBarShadow(ctx, 0, 0, x, y)
  groundShadow(ctx, POST_R + 0.04, 0.12)
  for (const [x, y] of ends) if (y < 0) drawBar(ctx, 0, 0, x, y, t)
  drawPost(ctx, course, t)
  for (const [x, y] of ends) if (y >= 0) drawBar(ctx, 0, 0, x, y, t)
}

const COURSE_IDS: readonly CourseId[] = ['park', 'pond', 'garden', 'farm', 'castle']
const HUE_IDS: readonly Hue[] = ['pink', 'green', 'blue']
/** A gate's states on the sheet: closed, half sunk, open, open and about to close. */
const GATE_STATES = [
  ['closed', 0, false],
  ['opening', 0.5, false],
  ['open', 1, false],
  ['warn', 1, true],
] as const

/** A gate run of three tiles and a single one, each at its tile's bottom centre. */
function gateRun(ctx: CanvasRenderingContext2D, hue: Hue, along: 'row' | 'col', open: number, warn: boolean, t: number) {
  const parts = ['first', 'middle', 'last'] as const
  parts.forEach((part, i) => {
    ctx.save()
    if (along === 'row') ctx.translate(0.5 + i, 1)
    else ctx.translate(0.5, 1 + i)
    drawGateTile(ctx, hue, along, part, open, warn, t)
    ctx.restore()
  })
  ctx.save()
  if (along === 'row') ctx.translate(4.2, 1)
  else ctx.translate(2.2, 1)
  drawGateTile(ctx, hue, along, 'single', open, warn, t)
  ctx.restore()
}

export const SHEET = (): SheetEntry[] => [
  ...[0, 0.12, 0.3, 0.55, 0.8].flatMap((turn): SheetEntry[] =>
    ([1, 2] as const).map((arms) => ({
      label: `spinner ${arms} arm ${turn}`,
      box: { x: -1.9, y: -2.3, w: 3.8, h: 4.1 },
      draw: (ctx, t) => drawSpinner(ctx, COURSE_IDS[Math.round(turn * 10) % 5]!, arms, 1.6, turn, t),
    })),
  ),
  ...COURSE_IDS.map((course): SheetEntry => ({ label: `post ${course}`, box: { x: -0.4, y: -1.05, w: 0.8, h: 1.15 }, draw: (ctx, t) => drawPost(ctx, course, t) })),
  ...[0, 0.25, 0.1].map(
    (angle): SheetEntry => ({
      label: `slider ${angle}`,
      box: { x: -1.8, y: -1.4, w: 3.6, h: 2.6 },
      draw: (ctx, t) => {
        const x = 0.9 * Math.sin(t)
        drawGroove(ctx, -1.2, 0, 1.2, 0)
        ctx.save()
        ctx.translate(x, 0)
        drawBarShadow(ctx, -0.8 * Math.cos(angle * TAU), -0.8 * Math.sin(angle * TAU), 0.8 * Math.cos(angle * TAU), 0.8 * Math.sin(angle * TAU))
        drawSlider(ctx, 0.8, angle, x, t)
        ctx.restore()
      },
    }),
  ),
  ...HUE_IDS.flatMap((hue): SheetEntry[] =>
    (['row', 'col'] as const).flatMap((along): SheetEntry[] =>
      GATE_STATES.map(([state, open, warn]) => ({
        label: `gate ${hue} ${along} ${state}`,
        box: along === 'row' ? { x: -0.1, y: -0.8, w: 4.85, h: 2.0 } : { x: -0.3, y: -0.8, w: 3.0, h: 4.0 },
        draw: (ctx, t) => gateRun(ctx, hue, along, open, warn, t),
      })),
    ),
  ),
  ...HUE_IDS.flatMap((hue): SheetEntry[] =>
    [0, 0.5, 1].map((down) => ({ label: `button ${hue} ${down}`, box: { x: -0.5, y: -0.4, w: 1, h: 0.75 }, draw: (ctx, t) => drawButton(ctx, hue, down, t) })),
  ),
  ...COURSE_IDS.flatMap((course): SheetEntry[] =>
    [-1, 0.1, 0.3, 0.6, 2].map((since) => ({
      label: `flag ${course} ${since < 0 ? 'waiting' : since}`,
      box: { x: -0.6, y: -1.75, w: 1.4, h: 1.85 },
      draw: (ctx, t) => drawFlag(ctx, course, since >= 0, Math.max(0, since), t),
    })),
  ),
  ...[false, true].flatMap((rider): SheetEntry[] =>
    [0, 0.14, 0.28, 0.42].map((since) => ({
      label: `frog ${rider ? 'rider' : 'alone'} ${since}`,
      box: { x: -0.8, y: -2.3, w: 1.7, h: 2.4 },
      draw: (ctx, t) => drawFrog(ctx, rider, since, t),
    })),
  ),
  ...[0, 0.5].map((phase): SheetEntry => ({ label: `duck ${phase}`, box: { x: -0.5, y: -0.45, w: 1, h: 0.6 }, draw: (ctx, t) => drawDuck(ctx, t, phase) })),
  ...[0.05, 0.2, 0.4, 0.6, 0.75, 0.9, 1.1].map((since): SheetEntry => ({ label: `fish ${since}`, box: { x: -0.5, y: -0.95, w: 1.5, h: 1.15 }, draw: (ctx) => drawFish(ctx, since) })),
  ...(['side', 'down', 'up'] as const).flatMap((face): SheetEntry[] =>
    [0, 0.15, 0.3, 0.45].map((walked) => ({ label: `puppy ${face} ${walked}`, box: { x: -0.45, y: -0.8, w: 0.95, h: 0.85 }, draw: (ctx, t) => drawPuppy(ctx, face, walked, t) })),
  ),
  ...(['fly', 'hop', 'peck'] as const).flatMap((act): SheetEntry[] =>
    [0, 0.15, 0.3].map((since) => ({ label: `bird ${act} ${since}`, box: { x: -0.35, y: -0.5, w: 0.65, h: 0.55 }, draw: (ctx, t) => drawBird(ctx, act, since, t) })),
  ),
]
