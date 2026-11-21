import type { Hue } from '../game/model'

/**
 * SUNNY PICNIC: the look every drawing shares, and the rules that keep several artists'
 * drawings one picture (plans/monster-lunch.md, The look). It must look like no other game in
 * the repo: not Pia Jump's plum ink and shade crescent, not Cat Hat Builder's navy ink and
 * lit-top boxes, not Rocket Factory's rimmed stickers without ink, not the 3D games.
 *
 *  1. Seen from above at a slant. The ground is flat print seen from above: grass, paths,
 *     water, bridges. Anything that stands (bushes, trees, posts, gates, the hero, animals,
 *     the balloon) is an upright picture whose origin is the ground point under its middle,
 *     drawn upward (negative y). The renderer sorts them by that y, so nearer things cover
 *     farther ones. A solid block shows a lit top face and a darker front face below it.
 *  2. Chocolate ink. Everything in the play layer wears the INK outline: LINE for most
 *     shapes, LINE_BIG for big ones (a monster's body, a tree's crown, the balloon), and
 *     LINE_DETAIL for lines inside a shape. The ground's own print (grass tufts, pebbles,
 *     ripples) has no ink and stays low in contrast, so the play layer always stands out.
 *  3. Food is juicy: saturated colours, a lit top and a darker side, and one white `shine`
 *     stroke on anything glossy. Foods never have faces. Faces are for the hero, the
 *     monsters and the animals, drawn with the face kit below (`eye`, `smile`, `blush`).
 *  4. Shadows are flat ovals on the ground (`groundShadow`, C.shadow), drawn by whoever
 *     places a thing; a thing in the air keeps its shadow on the ground under it, smaller
 *     the higher it is. Draw functions of upright things do not draw their own shadow
 *     unless their doc says so.
 *  5. Light from above and a little left: shines sit top-left; the darker side of a block
 *     or a disc is its front (lower on screen).
 *  6. Units are tiles, y down. A draw function works where its caller put the origin,
 *     facing right or facing the camera; the caller mirrors and scales. It leaves the
 *     context as it found it (balanced save and restore, the same transform and alpha),
 *     draws no text, makes no gradient or pattern per call, and never touches ctx.filter,
 *     shadowBlur, shadowColor, letterSpacing, Path2D, roundRect, reset or conic gradients:
 *     they do not work everywhere this game runs (Safari has no filter, node has no Path2D).
 *     Every draw file exports a SHEET (its drawings in a labelled grid, `?sheet=<file>`) and
 *     runs every drawing in its own fake-context test.
 *  7. Every colour is a named token: the shared ones here, a file's own at its top. No
 *     colour literal anywhere else.
 *  8. Motion is bouncy but calm: idle loops of 1 to 3 seconds with a phase from where a
 *     thing stands, squash and stretch under 10 percent, nothing blinking faster than three
 *     times a second, nothing lighting the whole screen.
 */

/** The ink, and its widths in tiles. */
export const INK = '#4A2B22'
export const LINE = 0.05
export const LINE_BIG = 0.07
export const LINE_DETAIL = 0.03

/** Device pixels per tile for what is being drawn now; whoever draws sets it (the renderer per frame, a portrait or the sheet per paint). `lw` keeps every line at least 1.5 device pixels wide. */
export const pen = { px: 64 }
export const lw = (w: number) => Math.max(w, 1.5 / pen.px)

/** The colours every file shares. A file's own palette sits at its top. */
export const C = {
  white: '#FFFFFF',
  shadow: 'rgba(60, 44, 16, 0.22)',
  shine: '#FFFFFF',
  /** Eyes' dark, mouths' inside, tongues, cheeks. */
  eye: '#2E1A14',
  mouth: '#8E2B3A',
  tongue: '#FF7A8A',
  blush: 'rgba(255, 110, 120, 0.45)',
  star: '#FFD23F',
  starShade: '#F2A93B',
  heart: '#FF5C8A',
  sparkle: '#FFFFFF',
  sparkleWarm: '#FFF4B8',
  /** The zap's crackle round a closed gate. */
  zap: '#FFF36B',
  confetti: ['#FF6FB5', '#FFD23F', '#4AA3FF', '#46C46A', '#FF8A3D', '#B98CFF', '#FFFFFF'],
} as const

/** The gates' and buttons' three colours: base, lighter top, darker side. */
export const HUE: Record<Hue, { base: string; light: string; dark: string }> = {
  pink: { base: '#FF5FAE', light: '#FF9ACB', dark: '#D93A8A' },
  green: { base: '#3CC25E', light: '#7FE08F', dark: '#25984A' },
  blue: { base: '#3D9BFF', light: '#88C4FF', dark: '#2370D6' },
}

/** One drawing on a sprite sheet: its label, the box it fits in (tiles, around its origin), and how to draw it at a time in seconds. */
export interface SheetEntry {
  label: string
  box: { x: number; y: number; w: number; h: number }
  draw: (ctx: CanvasRenderingContext2D, t: number) => void
}

/** Fills the path `trace` builds (it must begin it) and inks its outline. */
export function inked(ctx: CanvasRenderingContext2D, trace: (ctx: CanvasRenderingContext2D) => void, fill: string, line: number = LINE) {
  trace(ctx)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

/** A rounded rectangle as a new path (ctx.roundRect is too new to rely on). */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.lineTo(x + w - k, y)
  ctx.arcTo(x + w, y, x + w, y + k, k)
  ctx.lineTo(x + w, y + h - k)
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k)
  ctx.lineTo(x + k, y + h)
  ctx.arcTo(x, y + h, x, y + h - k, k)
  ctx.lineTo(x, y + k)
  ctx.arcTo(x, y, x + k, y, k)
  ctx.closePath()
}

/** A flat oval shadow on the ground, centred on the origin. */
export function groundShadow(ctx: CanvasRenderingContext2D, rx: number, ry: number = rx * 0.4) {
  if (rx <= 0 || ry <= 0) return
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.shadow
  ctx.fill()
}

/** A white shine stroke through the points (x, y pairs), `w` wide: the gloss on something juicy or shiny. */
export function shine(ctx: CanvasRenderingContext2D, w: number, ...xy: number[]) {
  ctx.beginPath()
  ctx.moveTo(xy[0]!, xy[1]!)
  for (let i = 2; i < xy.length; i += 2) ctx.lineTo(xy[i]!, xy[i + 1]!)
  ctx.lineWidth = lw(w)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = C.shine
  ctx.stroke()
}

// ---------------------------------------------------------------------------------------
// The face kit: one way to draw eyes, mouths and cheeks on everything alive

/**
 * An eye at (x, y) of radius r: a white ball with an ink rim and a dark pupil looking
 * toward (lookX, lookY), each from -1 to 1, with a glint. `shut` from 0 to 1 closes the
 * lid (a blink, or a happy squint when 1: then it is drawn as an upward arc).
 */
export function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lookX: number, lookY: number, shut: number) {
  if (shut >= 1) {
    ctx.beginPath()
    ctx.arc(x, y + r * 0.35, r * 0.75, Math.PI * 1.15, Math.PI * 1.85)
    ctx.lineWidth = lw(LINE)
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.stroke()
    return
  }
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * (1 - 0.92 * shut), 0, 0, Math.PI * 2)
  ctx.fillStyle = C.white
  ctx.fill()
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.clip()
  const pr = r * 0.55
  const px = x + lookX * (r - pr) * 0.8
  const py = y + lookY * (r - pr) * 0.8
  ctx.beginPath()
  ctx.arc(px, py, pr, 0, Math.PI * 2)
  ctx.fillStyle = C.eye
  ctx.fill()
  ctx.beginPath()
  ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.32, 0, Math.PI * 2)
  ctx.fillStyle = C.white
  ctx.fill()
  ctx.restore()
}

/**
 * A mouth centred at (x, y), `w` wide. open 0 is a smile line; open toward 1 opens it into a
 * round dark mouth `w * open` tall with a tongue at the bottom.
 */
export function smile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, open: number) {
  if (open <= 0.05) {
    ctx.beginPath()
    ctx.moveTo(x - w / 2, y)
    ctx.quadraticCurveTo(x, y + w * 0.45, x + w / 2, y)
    ctx.lineWidth = lw(LINE)
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.stroke()
    return
  }
  const h = w * open
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y)
  ctx.quadraticCurveTo(x, y - h * 0.15, x + w / 2, y)
  ctx.quadraticCurveTo(x + w / 2, y + h, x, y + h)
  ctx.quadraticCurveTo(x - w / 2, y + h, x - w / 2, y)
  ctx.closePath()
  ctx.fillStyle = C.mouth
  ctx.fill()
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(x, y + h, w * 0.32, h * 0.38, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.tongue
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y)
  ctx.quadraticCurveTo(x, y - h * 0.15, x + w / 2, y)
  ctx.quadraticCurveTo(x + w / 2, y + h, x, y + h)
  ctx.quadraticCurveTo(x - w / 2, y + h, x - w / 2, y)
  ctx.closePath()
  ctx.lineWidth = lw(LINE)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** A rosy cheek. */
export function blush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.blush
  ctx.fill()
}

/** A five-point star of outer radius r at the origin, inked: a star won. */
export function star(ctx: CanvasRenderingContext2D, r: number) {
  const trace = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const k = i % 2 === 0 ? r : r * 0.48
      if (i === 0) c.moveTo(Math.cos(a) * k, Math.sin(a) * k)
      else c.lineTo(Math.cos(a) * k, Math.sin(a) * k)
    }
    c.closePath()
  }
  inked(ctx, trace, C.star, LINE)
  shine(ctx, r * 0.12, -r * 0.32, -r * 0.18, -r * 0.12, -r * 0.42)
}

/** A full turn in radians. */
export const TAU = Math.PI * 2

/** A smooth 0..1..0 bob on a period of `period` seconds, its phase from a position (so things side by side do not bob together). */
export function bob(t: number, period: number, x: number, y: number) {
  return 0.5 - 0.5 * Math.cos(((t / period + (x * 0.37 + y * 0.61)) % 1) * Math.PI * 2)
}

// ---------------------------------------------------------------------------------------
// Shapes every artist shares

/** A number from 0 to 1 for a tile and a key, the same every time: where its tufts, pebbles and flowers sit. */
export function hash(c: number, r: number, k: number): number {
  let h = Math.imul(c + 0x3c6ef372, 0x9e3779b1) ^ Math.imul(r - 0x61c88647, 0x85ebca77) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae3d)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Adds circles (x, y, r triples) to a new path. */
export function circlesPath(ctx: CanvasRenderingContext2D, xyr: readonly number[]) {
  ctx.beginPath()
  for (let i = 0; i < xyr.length; i += 3) {
    ctx.moveTo(xyr[i]! + xyr[i + 2]!, xyr[i + 1]!)
    ctx.arc(xyr[i]!, xyr[i + 1]!, xyr[i + 2]!, 0, TAU)
  }
}

/** Circles (x, y, r triples) as one inked shape: the ink goes round their union, not between them (stroked twice as wide first, then filled over its inner half). */
export function blob(ctx: CanvasRenderingContext2D, colour: string, xyr: readonly number[], line: number = LINE) {
  circlesPath(ctx, xyr)
  ctx.lineWidth = lw(2 * line)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = colour
  ctx.fill()
}

/** Strokes the path `trace` builds as a band `w` wide: ink with `colour` inside, `line` of ink on each side like `inked`. */
export function band(ctx: CanvasRenderingContext2D, w: number, colour: string, line: number, trace: (c: CanvasRenderingContext2D) => void) {
  trace(ctx)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.lineWidth = lw(w + line)
  ctx.stroke()
  ctx.strokeStyle = colour
  ctx.lineWidth = lw(w - line)
  ctx.stroke()
}

/** A band along the points (x, y pairs): an arm, a leg, a stalk, a bolt. */
export function tube(ctx: CanvasRenderingContext2D, w: number, colour: string, line: number, ...xy: number[]) {
  band(ctx, w, colour, line, (c) => {
    c.beginPath()
    c.moveTo(xy[0]!, xy[1]!)
    for (let i = 2; i < xy.length; i += 2) c.lineTo(xy[i]!, xy[i + 1]!)
  })
}

/** An inked oval. */
export function inkOval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string, line: number = LINE) {
  inked(
    ctx,
    (c) => {
      c.beginPath()
      c.ellipse(x, y, rx, ry, 0, 0, TAU)
    },
    colour,
    line,
  )
}

/** A plain filled oval, no ink. */
export function fillOval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, TAU)
  c.fillStyle = fill
  c.fill()
}

/** Strokes the path just traced, `w` wide in `colour`, with round ends. */
export function strokeIt(c: CanvasRenderingContext2D, colour: string, w: number) {
  c.lineWidth = lw(w)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.strokeStyle = colour
  c.stroke()
}

/** A line through the points (x, y pairs) in one colour, `w` wide. */
export function strokeLine(c: CanvasRenderingContext2D, colour: string, w: number, ...xy: number[]) {
  c.beginPath()
  c.moveTo(xy[0]!, xy[1]!)
  for (let i = 2; i < xy.length; i += 2) c.lineTo(xy[i]!, xy[i + 1]!)
  strokeIt(c, colour, w)
}

/**
 * Fills the shape `trace` makes darker on its lower side and inks it: the shade, then the
 * shape again moved by (dx, dy) toward the light in `fill`, clipped to itself. Round things
 * lit from the top left (look.ts rule 5): a yolk, a berry, the poop, a bun's dome.
 */
export function shaded(c: CanvasRenderingContext2D, trace: (k: CanvasRenderingContext2D) => void, fill: string, shade: string, dx: number, dy: number, line: number) {
  c.save()
  trace(c)
  c.fillStyle = shade
  c.fill()
  c.clip()
  c.translate(dx, dy)
  trace(c)
  c.fillStyle = fill
  c.fill()
  c.restore()
  trace(c)
  strokeIt(c, INK, line)
}
