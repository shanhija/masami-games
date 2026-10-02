import { INK, lw, type Rim } from './look'

/**
 * The strokes Pia, the kittens and the enemies share: hand-drawn ink marks that keep the
 * night rim, limbs and tails as round tubes, and the little marks faces and moods are made
 * of (closed eyes, spirals, swirls, a sleeping 'z'). Each path helper begins its own path.
 */

export const DEG = Math.PI / 180
export const TAU = Math.PI * 2
export const mix = (a: number, b: number, k: number) => a + (b - a) * k
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** 0 at or below a, 1 at or above b, smoothstepped between. */
export const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a))
  return u * u * (3 - 2 * u)
}
/** 0 to 1 and back to 0 as u runs 0 to 1: a hop's height. */
export const arch = (u: number) => 4 * u * (1 - u)

/** Strokes the current path as ink `w` wide, or with a rim as the rim instead: every mark a character draws by hand goes through here. */
export function ink(ctx: CanvasRenderingContext2D, w: number, rim: Rim) {
  if (rim) {
    ctx.lineWidth = lw(w) + rim.width * 2
    ctx.strokeStyle = rim.colour
  } else {
    ctx.lineWidth = lw(w)
    ctx.strokeStyle = INK
  }
  ctx.stroke()
}

/** A part too small for a shade crescent to show (a shoe, a sleeve, an ear): `trace` filled with `base` and inked; with a rim, only the rim. */
export function flatPart(ctx: CanvasRenderingContext2D, trace: (ctx: CanvasRenderingContext2D) => void, base: string, line: number, rim: Rim) {
  trace(ctx)
  if (!rim) {
    ctx.fillStyle = base
    ctx.fill()
  }
  ink(ctx, line, rim)
}

/**
 * A limb, tail or stalk: the current path stroked `w` wide in `colour`, with an ink edge
 * `edge` wide outside it; with a rim, only the rim. The caller sets round caps and joins.
 */
export function tube(ctx: CanvasRenderingContext2D, w: number, colour: string, edge: number, rim: Rim) {
  if (rim) {
    ctx.lineWidth = w + lw(edge) * 2 + rim.width * 2
    ctx.strokeStyle = rim.colour
    ctx.stroke()
    return
  }
  ctx.lineWidth = w + lw(edge) * 2
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = w
  ctx.strokeStyle = colour
  ctx.stroke()
}

/** A spiral of `turns` turns from (x, y) out to radius r, starting at angle a: dizzy eyes and swirls. */
export function spiralPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turns: number, a: number) {
  ctx.beginPath()
  const n = Math.ceil(turns * 14)
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const ang = a + u * turns * TAU
    ctx.lineTo(x + Math.cos(ang) * r * u, y + Math.sin(ang) * r * u)
  }
}

/** A closed eye as an arc of radius r around (x, y): bowing up for a happy '^', down for a blink or sleep. */
export function lidPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, up: boolean) {
  ctx.beginPath()
  if (up) ctx.arc(x, y + r * 0.45, r, Math.PI * 1.18, Math.PI * 1.82)
  else ctx.arc(x, y - r * 0.45, r, Math.PI * 0.18, Math.PI * 0.82)
}

/** A sleeping 'z', `size` tall, centred on (x, y). */
export function zeePath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2
  ctx.beginPath()
  ctx.moveTo(x - s * 0.75, y - s)
  ctx.lineTo(x + s * 0.75, y - s)
  ctx.lineTo(x - s * 0.75, y + s)
  ctx.lineTo(x + s * 0.75, y + s)
}

/** A short wavy line `w` wide centred on (x, y), `waves` bumps of height a: a wobbly mouth, a grumpy frown. */
export function wavePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, a: number, waves: number) {
  ctx.beginPath()
  const n = waves * 8
  for (let i = 0; i <= n; i++) {
    const u = i / n
    ctx.lineTo(x - w / 2 + w * u, y - a * Math.sin(u * waves * Math.PI))
  }
}
