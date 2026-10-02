/**
 * The picture-book ink style every drawing shares, and the rules that keep five builders'
 * art one look:
 *
 * 1. Ink marks the play layer. Terrain, blocks, items, characters and hearts wear the INK
 *    line; backdrops never do and stay paler. Bubbles and water get a light rim instead,
 *    tiny particles get nothing.
 * 2. Faces mean alive: only Pia, kittens and enemies have faces.
 * 3. Cat ears mean Pia or a kitten.
 * 4. The five-point star is a star to collect. Night skies use dots and four-point
 *    sparkles, dizziness uses ink swirls.
 * 5. Light comes from straight above: every part's shade is a crescent along its bottom,
 *    so a sprite mirrored to face left stays lit the same way. Shine only on round glossy
 *    things.
 *
 * Every draw function works in world units (1 = a tile, y down) with the origin where its
 * caller put it (an entity's feet centre, a block's top-left corner), facing right; the
 * caller mirrors with the transform. It leaves the context as it found it, never draws
 * text, never creates gradients or patterns per call, and never touches ctx.filter,
 * shadowBlur or Path2D (none of them work everywhere this runs: Safari has no filter, node
 * has no Path2D).
 */

/** Where the camera is and how big a tile is, for one frame. */
export interface View {
  /** The canvas in device pixels. */
  width: number
  height: number
  /** Device pixels per tile, a whole number. */
  tile: number
  /** The world x at the screen's left edge, snapped so that left * tile is a whole number. */
  left: number
  /** Device-pixel y of the room's top edge (row 0). */
  top: number
}

/** Puts the context in world units for the view: 1 is a tile, the room's top-left at the origin. */
export function toWorld(ctx: CanvasRenderingContext2D, v: View) {
  ctx.setTransform(v.tile, 0, 0, v.tile, -v.left * v.tile, v.top)
}

/** Puts the origin at world point (x, y), facing right (1) or left (-1). */
export function toPoint(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, facing: -1 | 1) {
  ctx.setTransform(facing * v.tile, 0, 0, v.tile, (x - v.left) * v.tile, v.top + y * v.tile)
}

/** The ink and its widths in tiles: exposed terrain edges, everything else in the play layer, inner details. */
export const INK = '#3B2245'
export const LINE_EDGE = 0.08
export const LINE = 0.06
export const LINE_DETAIL = 0.035

/** Device pixels per tile for this frame, set by whoever draws; `lw` keeps every line at least 1.5 device pixels. */
export const pen = { px: 60 }
export const lw = (w: number) => Math.max(w, 1.5 / pen.px)

/** How far the lit face of a part is lifted over its shade: the shade crescent's thickness. */
export const SHADE_CHARACTER = 0.07
export const SHADE_BLOCK = 0.12

/** Colours shared across the picture. Each room's own palette is in world.ts; Pia's and the kittens' in hero.ts and critters.ts. */
export const COLOR = {
  star: '#FFD447',
  starShade: '#F2B33D',
  starShine: '#FFF8D6',
  heart: '#FF5C8A',
  sparkle: '#FFFFFF',
  sparkleWarm: '#FFF3B0',
  dust: '#FFFFFF',
  nightRim: '#C9C4FF',
  bubbleRim: '#8ADFFF',
  bubbleFilm: 'rgba(220, 248, 255, 0.35)',
  bubbleSheen: ['#FF9AD5', '#7FE0FF'],
  droplet: '#BFF0FF',
  rainbow: ['#FF6B6B', '#FFA94D', '#FFE066', '#8CE99A', '#74C0FC', '#B197FC'],
  confetti: ['#FF7AA8', '#FFD447', '#7FD4FF', '#8EE59B', '#C3A6FF', '#FFFFFF', '#FFA65C'],
  shadow: 'rgba(59, 34, 69, 0.18)',
  paper: 'rgba(59, 34, 69, 0.16)',
} as const

/** Draw a character's outline only, in this colour and this much wider than its ink, instead of the character: the night rim and the rainbow halo. null draws the character. */
export type Rim = { colour: string; width: number } | null

/**
 * One part in the house style: its shade colour, the lit colour lifted `k` over it and
 * clipped to the part (the crescent), then the ink. `trace` builds the part's path and must
 * begin it. With a rim, only the outline is stroked, in the rim's colour.
 */
export function inkPart(ctx: CanvasRenderingContext2D, trace: (ctx: CanvasRenderingContext2D) => void, base: string, shade: string, k: number, line: number, rim: Rim) {
  if (rim) {
    trace(ctx)
    ctx.lineWidth = lw(line) + rim.width * 2
    ctx.strokeStyle = rim.colour
    ctx.stroke()
    return
  }
  trace(ctx)
  ctx.fillStyle = shade
  ctx.fill()
  ctx.save()
  trace(ctx)
  ctx.clip()
  ctx.translate(0, -k)
  trace(ctx)
  ctx.fillStyle = base
  ctx.fill()
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** Every circle of a blob (x, y, r triples) as one path; overlapping circles make one union. */
function circles(ctx: CanvasRenderingContext2D, xyr: readonly number[]) {
  ctx.beginPath()
  for (let i = 0; i < xyr.length; i += 3) {
    ctx.moveTo(xyr[i]! + xyr[i + 2]!, xyr[i + 1]!)
    ctx.arc(xyr[i]!, xyr[i + 1]!, xyr[i + 2]!, 0, Math.PI * 2)
  }
}

/**
 * A cloud of circles with one outer ink line and no seams inside: hair, dust-bunny fluff,
 * frosting, clouds, foam. The ink goes on first at twice the width, then the fills cover
 * its inner half.
 */
export function blob(ctx: CanvasRenderingContext2D, xyr: readonly number[], base: string, shade: string, k: number, line: number, rim: Rim) {
  circles(ctx, xyr)
  if (rim) {
    ctx.lineWidth = (lw(line) + rim.width) * 2
    ctx.strokeStyle = rim.colour
    ctx.stroke()
    return
  }
  ctx.lineWidth = lw(line) * 2
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = shade
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.translate(0, -k)
  circles(ctx, xyr)
  ctx.fillStyle = base
  ctx.fill()
  ctx.restore()
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}

/** The collectible star's five points: outer radius r, inner 0.47 r, one point straight up. */
export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.47
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/** A four-point sparkle, `size` from tip to tip: night twinkles, bumps, pickups. Never a collectible. */
export function sparklePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const r = size / 2
  const n = r * 0.22
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.quadraticCurveTo(cx + n, cy - n, cx + r, cy)
  ctx.quadraticCurveTo(cx + n, cy + n, cx, cy + r)
  ctx.quadraticCurveTo(cx - n, cy + n, cx - r, cy)
  ctx.quadraticCurveTo(cx - n, cy - n, cx, cy - r)
  ctx.closePath()
}

/** A heart `size` wide, its centre at (cx, cy). */
export function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.9)
  ctx.bezierCurveTo(cx - s * 1.2, cy + s * 0.1, cx - s * 0.9, cy - s * 1.0, cx, cy - s * 0.4)
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.0, cx + s * 1.2, cy + s * 0.1, cx, cy + s * 0.9)
  ctx.closePath()
}

/** The soft oval a standing thing casts on the ground under its feet (origin at the feet). */
export function groundShadow(ctx: CanvasRenderingContext2D, w: number) {
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.45 * w, 0.07, 0, 0, Math.PI * 2)
  ctx.fillStyle = COLOR.shadow
  ctx.fill()
}

/** A soap bubble of radius r centred on the origin: see-through film, a light rim, two sheen arcs that turn with t, a shine. Bubbles Pia blows, trapped enemies, the rescue bubble. */
export function bubbleBall(ctx: CanvasRenderingContext2D, r: number, t: number) {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = COLOR.bubbleFilm
  ctx.fill()
  ctx.lineWidth = lw(0.05)
  ctx.strokeStyle = COLOR.bubbleRim
  ctx.stroke()
  const turn = t * 1.3
  ctx.lineWidth = lw(0.035)
  ctx.globalAlpha *= 0.7
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.78, turn + i * Math.PI, turn + i * Math.PI + 0.9)
    ctx.strokeStyle = COLOR.bubbleSheen[i]!
    ctx.stroke()
  }
  ctx.globalAlpha /= 0.7
  ctx.beginPath()
  ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.25, r * 0.12, -0.6, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
}
