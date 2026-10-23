import type { Kind, Thing } from '../game/model'
import type { Box } from '../game/where'

/**
 * STICKER TABLE: the look every drawing shares, and the rules that keep several artists'
 * drawings one picture (plans/rocket-factory.md, The look). It must look like no other game
 * in the repo (Cat Hat Builder's navy ink and lit-top boxes, Pia Jump's plum line and shade
 * crescent, the 3D games) and like nothing from Factorio (dark metal, a gear logo, insects).
 *
 *  1. Plan view for where, a front-view picture for what. The ground, belts, hedges, bridges
 *     and footprints are seen from straight above. Every sticker's picture (buildings,
 *     burrows, Beep, munchers, things, the rocket lying on its pad) is a front-view picture
 *     standing upright on screen, each kind with its own die-cut outline inside its footprint.
 *     There is no depth sorting: plan-view layers first, pictures over them.
 *  2. Two layers. The land (ground, patches, the pond, flowers, trees, the table) is flat,
 *     low-contrast print with no rim. Everything placed, made or alive is a sticker: a white
 *     rim (RIM) round its die-cut outline and a flat shadow offset down-right on screen
 *     (`pen.shadow`) in C.shadow. A rim means it answers a touch.
 *  3. No ink lines, anywhere. A shape is one flat fill, one lighter shape and at most one
 *     darker fold; corners are rounded. No gradients except a pearl's sheen, made once at the
 *     module's top, never per call. Eyes and mouths use C.face, the one dark mark, only on
 *     faces.
 *  4. Every colour is a named token below. No colour literal anywhere else.
 *  5. Big stickers are soft and small ones bright: buildings share a band of low chroma
 *     (BUILDING), the lab is the one dark sticker, and things, Beep and the munchers are at
 *     full chroma. Berry pink (MUNCHER.body) is the munchers' alone: nothing else is pink.
 *  6. Faces only on Beep, the munchers and Moony, from the face kit (`eyes`, `smile`,
 *     `blush`). Machines, burrows and things have no faces (Moony and the friends are the
 *     only other living things).
 *  7. Units are cells, y down. A draw function's origin is where its caller puts it: a
 *     building's or a burrow's footprint's top-left corner, a character's feet (the ground
 *     under its middle), a thing's middle. It faces right; the caller mirrors, scales and
 *     counter-turns it for the upright board. An age in seconds since a stamp is Infinity for
 *     never, and draw functions clamp it (`heldAge`).
 *  8. Detail follows size on screen (`detail`): under 30 CSS px a thing is its silhouette,
 *     its key colour, one highlight and the rim; a bottle shows its recipe inside only at 40
 *     px and up. Everything is designed at 22 px first.
 *  9. One thing, one picture everywhere (`drawThing` in things.ts): on a belt, in Beep's
 *     arms, in a cheek, on the tray, on a card. Raw things are dull lumps, made things bright
 *     and smooth.
 * 10. Motion is calm. Only the hinted thing leaves the ground (it rises 0.2 cell on a 0.8 s
 *     period); a machine pushing out squashes 4 percent in place; idle loops stay under 3
 *     percent of a thing's height with periods of 1.2 to 3 s and a phase from its id
 *     (`phaseOf`). Nothing flashes, nothing lights the whole screen, and a light changes at
 *     most three times a second.
 * 11. No lookalikes: munchers are walking raspberries (bumps and a calyx, never a smooth pink
 *     ball with a tuft), Beep is a tin toy with a painted face (never a face screen with
 *     glowing eyes), bubbles are opaque pearls (never a see-through bubble with a creature
 *     inside), no studs on blocks, no gear logo.
 * 12. Every draw function leaves the context as it found it, draws no text (the only text on
 *     the canvas is the ?debug overlay's), creates no gradient or pattern per call, never
 *     touches ctx.filter, shadowBlur, shadowColor, Path2D, roundRect or conic gradients, has a
 *     sheet entry, and runs in its group's fake-context test (fakeContext.ts).
 */

/** A sticker's flat shadow lies this far down and this far right of it on screen, in cells. */
export const SHADOW = 0.06
/** CSS pixels per cell and the device pixel ratio for what is being drawn now, and the sticker shadow's offset in the drawing's own frame (down-right on screen, so the renderer turns it with the upright board). Whoever draws sets them: the renderer per frame and per bake, a portrait per paint. */
export const pen = { ppm: 50, dpr: 2, shadowX: SHADOW, shadowY: SHADOW }

/** The die-cut rim's width in cells, never under one device pixel, and how wide a sticker's outline grows for it. */
export const RIM = 0.06
export const rim = () => Math.max(RIM, 1 / (pen.dpr * pen.ppm))
/** How much to draw for a thing `cells` across: L at 40 CSS px or more, M from 30, S below. */
export function detail(cells: number): 'S' | 'M' | 'L' {
  const px = cells * pen.ppm
  return px >= 40 ? 'L' : px >= 30 ? 'M' : 'S'
}

// ---------------------------------------------------------------------------------------
// The palette

/** The shared colours. */
export const C = {
  white: '#FFFFFF',
  /** The one dark mark: eyes and mouths on faces, the countdown's dots. */
  face: '#2B2F4A',
  /** Sticker shadows: deep teal at 30 percent. */
  shadow: 'rgba(29, 92, 87, 0.30)',
  /** A held sticker's long shadow, and a ghost's dashed footprint. */
  liftShadow: 'rgba(29, 92, 87, 0.22)',
  ghostLine: '#1D5C57',
  grey: '#B9C4C2',
  blush: 'rgba(255, 120, 140, 0.35)',
  mouth: '#E8577A',
  sparkle: '#FFFFFF',
  warm: '#FFF1C9',
  heart: '#FF6F91',
  /** A held sticker's notes to a burrow: the song's notes' violet (LAND.petal), paler, as the ghost is paler than the sticker. */
  ghostNote: '#C9B8F6',
  /** The hint's ring under the bouncing thing, and its dotted path. */
  hint: '#FFFFFF',
  hintShadow: 'rgba(29, 92, 87, 0.35)',
  confetti: ['#5B98F6', '#FFC93C', '#3CCB6B', '#FF8A2B', '#A78BFA', '#4CC9E0', '#FFFFFF'],
} as const

/** The land: flat print, no rims. */
export const LAND = {
  ground: '#CDEFE0',
  dot: '#B7DCCB',
  /** Full cell outlines under a ghost or a stroke. */
  grid: '#A9D3C1',
  table: '#E4EEF2',
  tableEdge: '#CFDDE3',
  /** The next land's folded paper flap, its mint showing through at about 40 percent, so the paper plainly hides more land; its faint print of the corner dots, rocks and flowers under it, and its soft blobs of trees and burrows. */
  flap: '#E3F3EC',
  flapPrint: '#C8E4D7',
  flapTree: '#BADECF',
  flapMound: '#D2E5CA',
  pond: '#4CC9E0',
  pondLight: '#8FE0EE',
  tree: '#5AAE8A',
  treeLight: '#7CC9A2',
  trunk: '#A9805E',
  flowerTint: '#E4DCF7',
  petal: '#A98BEF',
  petalCentre: '#F6C97A',
  /** Rock patches: the rocks are rimmed stickers set into the print. */
  blueRock: '#8DA9CB',
  goldRock: '#D8B45E',
  /** A burrow's mound: a mossy olive, so the munchers' home never reads as the jade digger the blueprint sets beside it. */
  mound: '#A9C47A',
  moundLight: '#C2D79A',
  /** A burrow's doorway is lit warm inside, never a dark hole; its round wooden door, with a lit window. */
  door: '#F6C97A',
  doorDeep: '#E9AE5A',
  doorWood: '#B98A64',
  pad: '#D6E2DF',
  padRing: '#FF7F5E',
  basket: '#E3B887',
  basketDark: '#C99A68',
} as const

/** The belts: deep teal bodies, white rim ticks pointing downstream, chevrons, tone-on-tone patterns. */
export const BELT = {
  body: '#3D6B69',
  pattern: '#345D5B',
  chevron: '#8FC1BC',
  tick: '#FFFFFF',
  /** A bridge's hump, and the over lane's body; the hump's lighter crown. */
  hump: '#4A7A77',
  humpTop: '#5E8E8A',
  /** A stroke being drawn: see-through, and grey where it would stop. */
  ghost: 'rgba(61, 107, 105, 0.45)',
  stop: 'rgba(185, 196, 194, 0.8)',
  /** The stroke's stop sign: a soft warm red, far from the munchers' berry. */
  stopSign: '#F0653F',
} as const

/** A building's body (soft, low chroma), its lighter shape and its darker fold, and its one bright part. */
export interface BodyColours {
  body: string
  light: string
  fold: string
  accent: string
}
export const BUILDING: Record<Kind, BodyColours> = {
  pad: { body: LAND.pad, light: '#E6EFEC', fold: '#BCCBC7', accent: LAND.padRing },
  digger: { body: '#74C99D', light: '#98D9B6', fold: '#57A97F', accent: '#F2F6F4' },
  oven: { body: '#E39A84', light: '#EDB6A5', fold: '#C77D68', accent: '#FF8A3D' },
  workshop: { body: '#9CCBF0', light: '#BBDCF5', fold: '#7DAED8', accent: '#F2F6F4' },
  greenMaker: { body: '#F1D98C', light: '#F6E6B1', fold: '#D6BC6C', accent: '#3CCB6B' },
  orangeMaker: { body: '#C6B5F2', light: '#D9CDF7', fold: '#A897D9', accent: '#FF8A2B' },
  lab: { body: '#4D52B0', light: '#6A6FC8', fold: '#3A3E8C', accent: '#FFF1C9' },
  pump: { body: '#F7ECD8', light: '#FBF5EA', fold: '#DDCFB8', accent: LAND.pond },
  tower: { body: '#A8DCD8', light: '#C4E8E5', fold: '#86C0BB', accent: '#EAF8FF' },
  bowl: { body: '#D8AE86', light: '#E7C6A5', fold: '#BD9068', accent: '#FFC93C' },
}
export const HEDGE = { body: '#3F9C63', light: '#5AB87C', fold: '#2F7D4E', stump: '#A9805E', ring: '#C9A27E' } as const

/** Each thing's key colour (what tells it apart on a belt), its lighter shape and its darker fold. Raw things dull, made things bright. */
export const THING: Record<Thing, { key: string; light: string; fold: string }> = {
  blueRock: { key: '#8C9DB4', light: '#AEBBCC', fold: '#6E8099' },
  goldRock: { key: '#C9A54A', light: '#DDBF70', fold: '#A8862F' },
  bubble: { key: '#EAF8FF', light: '#FFFFFF', fold: '#C9E4F2' },
  blueBar: { key: '#5B98F6', light: '#8DB8FA', fold: '#3E78D6' },
  goldBar: { key: '#FFC93C', light: '#FFDC78', fold: '#E3A812' },
  gear: { key: '#A78BFA', light: '#C3AEFC', fold: '#8668E0' },
  greenBottle: { key: '#3CCB6B', light: '#7BDD9A', fold: '#26A453' },
  orangeBottle: { key: '#FF8A2B', light: '#FFAF6E', fold: '#E06A0C' },
}
/** A bottle's glass and cork; the orange bottle's star cork. */
export const GLASS = { glass: '#EEF7F6', cork: '#C99A68', star: '#FFD23F' } as const

/** Beep: a coral tin toy (the rocket's fin colour), a cream face plate, a cyan propeller and mittens; the hint's hand, Beep's mitten drawn big, takes a lighter shape and a fold of the cyan. */
export const BEEP = { body: '#FF7F5E', light: '#FFA488', fold: '#E0603F', plate: '#FFF4E4', prop: '#4CC9E0', mittenLight: '#8FE0EE', mittenFold: '#2FA9C2', antenna: '#FFF1C9' } as const
/** The munchers: walking raspberries. Each burrow's mark: a bow, freckles, a flower. */
export const MUNCHER = { body: '#D93A78', light: '#EC6A9C', fold: '#B52860', belly: '#FFE3EC', calyx: '#4FAF5A', calyxLight: '#78C981', suds: '#FFFFFF', bow: '#4CC9E0', freckle: '#B52860', flower: '#FFD23F', nightcap: '#8FA8E8', flag: '#FFC93C', paw: 'rgba(217, 58, 120, 0.42)' } as const
export const MOONY = { body: '#FFF3B8', light: '#FFFAE0', fold: '#E8D98A' } as const
/** The rocket: cream with coral fins (Beep's colour), and the dotted outline of a part not yet built. */
export const ROCKET = { body: '#FFF8EC', light: '#FFFFFF', fold: '#E8DCC8', fin: BEEP.body, window: LAND.pond, dots: '#9FB7B3', flame: '#FFC93C' } as const
/** The launch's sky, from the top down, and its stars and moon. */
export const SKY = { bands: ['#2F3A7A', '#3F4E9A', '#5A6BB8'], star: '#FFF1C9', moon: '#FFF3B8' } as const
/** Good night's dusk over the board, and the tiny warm lights on the belts. */
export const NIGHT = { dusk: 'rgba(47, 58, 122, 0.35)', light: '#FFE9A8', nightcap: MUNCHER.nightcap } as const
/** The ?debug overlay, the one place text is drawn: the hit targets, the belts' slots (empty, holding), the panel behind its numbers and their ink. */
export const DEBUG = { target: '#1E7BE0', slot: '#20B8D0', held: '#F2A900', panel: 'rgba(255, 255, 255, 0.88)', text: C.face } as const

// ---------------------------------------------------------------------------------------
// Easing and loops

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
/** A loop of `period` seconds at time t, 0 to 1, shifted by `phase` (0 to 1). */
export const loop = (t: number, period: number, phase: number) => (((t / period + phase) % 1) + 1) % 1
/** A seconds-since stamp held finite (Infinity is never, or long ago; NaN counts as long ago), so trigonometry and division on it stay safe. */
export const heldAge = (age: number) => (Number.isFinite(age) ? Math.max(0, Math.min(age, 1e4)) : 1e4)
/** The i-th of a sequence spread evenly over 0 to 1, a different one for each step k (an irrational fraction): stars, puffs and clouds placed by it never bunch up, and neighbouring i lie far apart. */
export const spread = (i: number, k: number) => (((i + 1) * k) % 1 + 1) % 1
/** The golden ratio's fraction: the step that spreads a sequence most evenly. */
const GOLDEN = 0.6180339887
/**
 * A phase from 0 to 1 for a thing's id, so many of a thing never move in step: a number id
 * steps round by the golden ratio, so consecutive ids (a visit's munchers, a row of ovens)
 * land far apart; a name is hashed first (FNV-1a), so names that differ in one letter do too.
 */
export const phaseOf = (id: string | number) => {
  if (typeof id === 'number') return spread(id, GOLDEN)
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return spread(h >>> 0, GOLDEN)
}
/** A slap's squash and stretch `age` seconds after it: to 1.08 wide and 0.96 tall, back to 1 over 0.25 s. Returns [sx, sy]; [1, 1] for age < 0 or settled. */
export function slap(age: number): [number, number] {
  if (age < 0 || age >= 0.25) return [1, 1]
  const k = 1 - smooth(0, 0.25, age)
  return [mix(1, 1.08, k), mix(1, 0.96, k)]
}
/** A machine's push: a 4 percent squash in place over 0.2 s. Returns [sx, sy]. */
export function push(age: number): [number, number] {
  if (age < 0 || age >= 0.2) return [1, 1]
  const k = arch(age / 0.2)
  return [1 + 0.02 * k, 1 - 0.04 * k]
}

// ---------------------------------------------------------------------------------------
// Shapes. Each ...Path helper begins its own path. Each add... helper instead adds one closed
// piece to the current path, wound clockwise on screen, so a die-cut outline can be several
// pieces filled as one shape (a flask's bulb, neck and cork) with one rim round them all.

export function addRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}
export function addCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const q = Math.max(0, r)
  ctx.moveTo(x + q, y)
  ctx.arc(x, y, q, 0, TAU)
}
/** A polygon (x, y pairs, clockwise on screen) with every corner rounded by r, or less where its sides are too short for r. */
export function addRoundPoly(ctx: CanvasRenderingContext2D, pts: readonly number[], r: number) {
  const n = pts.length / 2
  const at = (i: number) => (((i % n) + n) % n) * 2
  // Start halfway along the last side, so every corner (the first one too) is an arcTo.
  ctx.moveTo((pts[at(-1)]! + pts[0]!) / 2, (pts[at(-1) + 1]! + pts[1]!) / 2)
  for (let i = 0; i < n; i++) {
    const a = at(i)
    const b = at(i + 1)
    const p = at(i - 1)
    const side = Math.min(Math.hypot(pts[b]! - pts[a]!, pts[b + 1]! - pts[a + 1]!), Math.hypot(pts[p]! - pts[a]!, pts[p + 1]! - pts[a + 1]!))
    ctx.arcTo(pts[a]!, pts[a + 1]!, pts[b]!, pts[b + 1]!, Math.min(r, side * 0.45))
  }
  ctx.closePath()
}
/** A five-point star: outer radius r, inner 0.47 r, one point up. */
export function addStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.47
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}
/** A stick from (x0, y0) to (x1, y1) with round ends, `r` its half width: a wand, a stubby arm. */
export function addCapsule(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = Math.atan2(y1 - y0, x1 - x0)
  ctx.moveTo(x0 + Math.cos(a - Math.PI / 2) * r, y0 + Math.sin(a - Math.PI / 2) * r)
  ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2)
  ctx.arc(x0, y0, r, a + Math.PI / 2, a + (3 * Math.PI) / 2)
  ctx.closePath()
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  addRoundRect(ctx, x, y, w, h, r)
}
export function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, TAU)
}
/** A five-point star: outer radius r, inner 0.47 r, one point up. */
export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  addStar(ctx, cx, cy, r)
}
/** A four-point sparkle, `size` from tip to tip. */
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
export function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.9)
  ctx.bezierCurveTo(cx - s * 1.2, cy + s * 0.1, cx - s * 0.9, cy - s * 1.0, cx, cy - s * 0.4)
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.0, cx + s * 1.2, cy + s * 0.1, cx, cy + s * 0.9)
  ctx.closePath()
}
/** Circles (x, y, r triples) as one path, each its own closed loop: a bumpy outline filled flat, or a clip. */
export function circlesPath(ctx: CanvasRenderingContext2D, xyr: readonly number[]) {
  ctx.beginPath()
  for (let i = 0; i < xyr.length; i += 3) addCircle(ctx, xyr[i]!, xyr[i + 1]!, xyr[i + 2]!)
}

// ---------------------------------------------------------------------------------------
// Stickers

/**
 * A sticker's die-cut base: its outline path (drawn by `outline`, which begins its own path)
 * as a flat shadow offset by `pen.shadow`, then as the white rim RIM wide all round. The
 * caller then fills its parts inside the outline. `lift` raises it off the table (a held
 * sticker, a thing on a bridge): the shadow lengthens and softens.
 */
export function dieCut(ctx: CanvasRenderingContext2D, outline: () => void, lift: number) {
  dieCutRim(ctx, outline, lift, RIM)
}
/** `dieCut` with a rim `width` cells wide (never under one device pixel): a sticker much smaller than a cell (a thing, a patch's rock) keeps its rim in proportion. */
export function dieCutRim(ctx: CanvasRenderingContext2D, outline: () => void, lift: number, width: number) {
  stickerShadow(ctx, outline, lift, width)
  stickerRim(ctx, outline, width, C.white)
}
/**
 * The die-cut's shadow alone: the outline grown by the rim's `width` (never under a device
 * pixel), offset down-right by pen.shadow, longer and softer for a held sticker (`lift`). Seen
 * through (globalAlpha under 1, a ghost held up) it is the outline's fill alone, since its
 * stroke would show each piece of a many-piece outline through the shadow.
 */
export function stickerShadow(ctx: CanvasRenderingContext2D, outline: () => void, lift: number, width: number) {
  const r = Math.max(width, 1 / (pen.dpr * pen.ppm))
  const k = 1 + lift * 2.5
  const colour = lift > 0 ? C.liftShadow : C.shadow
  ctx.save()
  ctx.translate(pen.shadowX * k, pen.shadowY * k)
  outline()
  ctx.fillStyle = colour
  ctx.fill()
  if (ctx.globalAlpha >= 1) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2 * r
    ctx.strokeStyle = colour
    ctx.stroke()
  }
  ctx.restore()
}
/**
 * The die-cut's white rim, `width` cells all round the outline (never under a device pixel),
 * and the outline filled flat in `colour` inside it. Seen through (a ghost held up) the rim is
 * the outline filled white a rim's width out in eight directions instead of stroked, so no
 * piece of a many-piece outline (a flask's bulb and neck) shows its own edge through the body.
 */
export function stickerRim(ctx: CanvasRenderingContext2D, outline: () => void, width: number, colour: string) {
  const r = Math.max(width, 1 / (pen.dpr * pen.ppm))
  if (ctx.globalAlpha < 1) {
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.translate(Math.cos((i * TAU) / 8) * r, Math.sin((i * TAU) / 8) * r)
      outline()
      fill(ctx, C.white)
      ctx.restore()
    }
    outline()
    fill(ctx, colour)
    return
  }
  const join = ctx.lineJoin
  outline()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2 * r
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.lineJoin = join
  fill(ctx, colour)
}
/** Fills the current path flat. */
export function fill(ctx: CanvasRenderingContext2D, colour: string) {
  ctx.fillStyle = colour
  ctx.fill()
}
/** Strokes the current path `w` wide in `colour`, round at its ends and corners (a mark, a swirl, a rail; never an outline); the caller's caps and joins come back. */
export function roundStroke(ctx: CanvasRenderingContext2D, w: number, colour: string) {
  const cap = ctx.lineCap
  const join = ctx.lineJoin
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = w
  ctx.strokeStyle = colour
  ctx.stroke()
  ctx.lineCap = cap
  ctx.lineJoin = join
}

/** One white shine tick at ten o'clock on a round thing of radius r centred at (x, y). */
export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const cap = ctx.lineCap
  ctx.beginPath()
  ctx.arc(x, y, r * 0.66, Math.PI * 1.08, Math.PI * 1.34)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(r * 0.18, 1 / (pen.dpr * pen.ppm))
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.lineCap = cap
}

/**
 * Runs `draw` turned by `tilt` radians and scaled by (sx, sy) about the origin, with the
 * sticker shadow's offset (pen.shadow) carried back through the turn and the scale, so a
 * mirrored, tipped, flipped or squashed sticker (a slipping cap, a tilted face, a picture
 * facing left by sx = -1) still casts its shadow down-right on screen.
 */
export function tipped(ctx: CanvasRenderingContext2D, tilt: number, sx: number, sy: number, draw: () => void) {
  const wasX = pen.shadowX
  const wasY = pen.shadowY
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  ctx.save()
  ctx.rotate(tilt)
  ctx.scale(sx, sy)
  // The offset that rotate-then-scale carries to the one the pen had: unrotated, then unscaled.
  pen.shadowX = (c * wasX + s * wasY) / sx
  pen.shadowY = (-s * wasX + c * wasY) / sy
  draw()
  pen.shadowX = wasX
  pen.shadowY = wasY
  ctx.restore()
}

/** A soft oval shadow on the ground under something off it, at the origin: `w` wide at rest, smaller the higher it is (`up`, cells), never faded. Beep, a hopping muncher, Moony, a bouncing building, the launch button. */
export function groundShadow(ctx: CanvasRenderingContext2D, w: number, up: number) {
  const k = clamp01(1 - 1.4 * up)
  ctx.beginPath()
  ctx.ellipse(pen.shadowX * 0.6, pen.shadowY * 0.3, (w / 2) * (0.55 + 0.45 * k), w * 0.12 * (0.55 + 0.45 * k), 0, 0, TAU)
  fill(ctx, C.liftShadow)
}

/** A nightcap sticker on its brim's middle (x, y), `r` half the brim's width, tipped by `tilt`: a soft periwinkle cone flopping to the right with a white trim and a pompom. Good night's machines wear it, and a sleeping burrow. */
export function drawNightcap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number) {
  const tip = { x: r * 1.25, y: -r * 1.05 }
  const trim = () => {
    addRoundRect(ctx, -r * 1.05, -r * 0.3, r * 2.1, r * 0.46, r * 0.23)
    addCircle(ctx, tip.x, tip.y, r * 0.3)
  }
  const outline = () => {
    ctx.beginPath()
    ctx.moveTo(-r * 0.92, 0)
    ctx.bezierCurveTo(-r * 0.8, -r * 1.7, r * 0.45, -r * 2.05, tip.x, tip.y)
    ctx.bezierCurveTo(r * 0.55, -r * 1.25, r * 0.78, -r * 0.6, r * 0.92, 0)
    ctx.closePath()
    trim()
  }
  ctx.save()
  ctx.translate(x, y)
  tipped(ctx, tilt, 1, 1, () => {
    stickerShadow(ctx, outline, 0, RIM)
    stickerRim(ctx, outline, RIM, NIGHT.nightcap)
    ctx.beginPath()
    trim()
    fill(ctx, C.white)
  })
  ctx.restore()
}

/** Runs `draw` scaled by k about the origin with the pen's zoom scaled too, so its rims keep their width on screen and its detail follows its size there (a thing in a cheek, a sticker on the tray). */
export function scaled(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const was = pen.ppm
  ctx.save()
  ctx.scale(k, k)
  pen.ppm = was * k
  draw()
  pen.ppm = was
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The face kit: Beep, the munchers and Moony.

/**
 * Two dot eyes `size` tall, `gap` apart, centred at (x, y). open: a dot with a white glint;
 * sleepy: a dot under a lid (the munchers' resting look); happy: arcs; closed: asleep; wide:
 * surprised. Every mark is C.face.
 */
export function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, gap: number, mood: 'open' | 'sleepy' | 'happy' | 'closed' | 'wide', lid: string) {
  const cap = ctx.lineCap
  for (const ex of [x - gap / 2, x + gap / 2]) {
    const h = size
    if (mood === 'open' || mood === 'wide' || mood === 'sleepy') {
      const r = h * (mood === 'wide' ? 0.6 : 0.5)
      circlePath(ctx, ex, y, r)
      fill(ctx, C.face)
      circlePath(ctx, ex + r * 0.3, y - r * 0.35, r * (h * pen.ppm < 4 ? 0.42 : 0.32))
      fill(ctx, C.white)
      if (mood === 'sleepy') {
        // A lid in the face's own colour over the top half.
        ctx.beginPath()
        ctx.arc(ex, y, r * 1.08, Math.PI, TAU)
        ctx.closePath()
        fill(ctx, lid)
      }
    } else {
      ctx.beginPath()
      if (mood === 'happy') ctx.arc(ex, y + h * 0.25, h * 0.45, Math.PI * 1.15, Math.PI * 1.85)
      else ctx.arc(ex, y - h * 0.25, h * 0.45, Math.PI * 0.15, Math.PI * 0.85)
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(h * 0.22, 1 / (pen.dpr * pen.ppm))
      ctx.strokeStyle = C.face
      ctx.stroke()
    }
  }
  ctx.lineCap = cap
}
/** A small soft smile `w` wide centred at (x, y); open shows the mouth colour inside. */
export function smile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, open: boolean) {
  const cap = ctx.lineCap
  ctx.beginPath()
  if (open) {
    ctx.moveTo(x - w / 2, y)
    ctx.quadraticCurveTo(x, y + w * 0.9, x + w / 2, y)
    ctx.closePath()
    fill(ctx, C.mouth)
  } else {
    ctx.moveTo(x - w / 2, y)
    ctx.quadraticCurveTo(x, y + w * 0.5, x + w / 2, y)
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(w * 0.16, 1 / (pen.dpr * pen.ppm))
    ctx.strokeStyle = C.face
    ctx.stroke()
  }
  ctx.lineCap = cap
}
export function blush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU)
  fill(ctx, C.blush)
}
/** An open mouth w wide and h tall in the face's dark mark with a tongue in the mouth colour, its top edge at y: round for a yawn, a burp or an "o", a flat-topped D for a giggle or a chomp. The kit's open smile is the mouth colour alone, which vanishes on berry pink. */
export function openMouth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, round: boolean) {
  ctx.beginPath()
  if (round) ctx.ellipse(x, y + h / 2, w / 2, h / 2, 0, 0, TAU)
  else {
    ctx.ellipse(x, y, w / 2, h, 0, 0, Math.PI)
    ctx.closePath()
  }
  fill(ctx, C.face)
  // The tongue only where it is a pixel or two.
  if (h * pen.ppm < 3) return
  ctx.beginPath()
  ctx.ellipse(x, y + h * (round ? 0.7 : 0.62), w * (round ? 0.26 : 0.24), h * (round ? 0.19 : 0.26), 0, 0, TAU)
  fill(ctx, C.mouth)
}
/** Sleep's Zz as shapes, never text: three Zs rising from (x, y) up and to the right in turn, each growing and then shrinking away (never fading), in the night's soft blue over a white edge that keeps them on any roof. */
export function zees(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, phase: number) {
  const cap = ctx.lineCap
  const join = ctx.lineJoin
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < 3; i++) {
    const u = loop(t, 3, phase + i / 3)
    const h = 0.055 * Math.sin(Math.PI * u) * (0.7 + 0.5 * u)
    if (h * pen.ppm < 0.5) continue
    const zx = x + 0.2 * u + 0.025 * Math.sin(TAU * u)
    const zy = y - 0.36 * u
    for (const [colour, w] of [
      [C.white, 0.5],
      [NIGHT.nightcap, 0.26],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(zx - h, zy - h)
      ctx.lineTo(zx + h, zy - h)
      ctx.lineTo(zx - h, zy + h)
      ctx.lineTo(zx + h, zy + h)
      ctx.lineWidth = Math.max(h * w, 1 / (pen.dpr * pen.ppm))
      ctx.strokeStyle = colour
      ctx.stroke()
    }
  }
  ctx.lineCap = cap
  ctx.lineJoin = join
}

// ---------------------------------------------------------------------------------------
// Sheets

/** One cell of a sprite sheet (?sheet=<group>): a label, the board box to fit (in the drawing's own cells, origin as the draw function expects), and the drawing at sim time t. */
export interface SheetEntry {
  label: string
  box: Box
  draw: (ctx: CanvasRenderingContext2D, t: number) => void
}
/** On a sheet, one act replaying: its age at time t runs to `len` and starts again after a second's rest. */
export const replay = (t: number, len: number) => t % (len + 1)
/** A sheet entry drawn at k of the sheet's size (its box shrunk with it), so the detail a smaller drawing picks shows on a sheet at 50 or 80 px a cell. */
export const smallEntry = (label: string, k: number, box: Box, draw: (ctx: CanvasRenderingContext2D, t: number) => void): SheetEntry => ({
  label,
  box: { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k },
  draw: (ctx, t) => scaled(ctx, k, () => draw(ctx, t)),
})
