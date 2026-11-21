import { rect, type Rect } from '../game/layout'
import type { HairColor, HatColor, MachineId, Material, Raw, Skin, WearColor } from '../game/model'

/**
 * SUNNY SITE: the look every drawing shares, and the rules that keep about ten builders'
 * art one picture. Saturated toy primaries, one navy ink, flat fills, made things as boxes
 * with faces, a stepped flat sky. It must never look like pia-jump (pastels, plum ink, a
 * shade crescent along the bottom of every part).
 *
 *  1. One ink, three weights. Lines are INK only, at lw('edge') for silhouettes (characters,
 *     vehicles, rooms, the hat), lw('line') for parts and lw('detail') for inner marks. The
 *     widths are set in screen pixels and grow with the square root of the zoom (see `lw`),
 *     so a line reads as a picture-book line from the build view to the mirror. The one
 *     exception is a face's marks on a face too dark for ink (the darkest skins, a black
 *     cat): the face kit draws them in C.faceMark by itself (`faceMark`).
 *  2. Ink marks the play layer: anything the child can touch, and anything alive. Backdrops
 *     (sky, hills, far trees, clouds) never have ink and stay lighter than the play layer.
 *  3. Flat fills, with three exceptions and nothing else: (a) made things (rooms, made
 *     goods, machine bodies, crates, stacked blocks) are boxes with a top face in the `top`
 *     tint and a right face in the `side` tint, receding up-right at 45 degrees, never
 *     mirrored (`box`); (b) round glossy things (the hat, wellies, gems, glass, balls, the
 *     mixer drum) get one white shine tick at ten o'clock (`shine`); (c) everything standing
 *     casts a flat ground shadow (`groundShadow`). Alpha only for shadows, glass, ghosts and
 *     light spots.
 *  4. Every colour is a named token: the records below, or a theme file's own palette record
 *     at its top. No colour literal anywhere else.
 *  5. Faces only on people and animals, made from the shared face kit (`eyes`, `smile`,
 *     `blush`), told the colour of the face under it so it reads on every skin and coat.
 *     Machines, rooms and furniture have no faces. Cats are animals.ts's one cat.
 *  6. The cat-ear hard hat is only on the player's builder. Cats are the only other ears.
 *  7. Units are metres, y down. A draw function's origin is where its caller puts it: a
 *     character's or a vehicle's feet (the ground under its middle), a good's bottom centre,
 *     a room item's slot anchor (layout.ts SLOT_BOX), a room's top-left corner. It faces
 *     right; the caller mirrors and scales. An age in seconds since a stamp is Infinity for
 *     never, and draw functions clamp it.
 *  8. Sizes (SIZE below) are fixed: the builder 1.2 m, the truck 4.4 m long, a cell 2.4 m.
 *  9. One good, one pictogram everywhere (`drawGood` in goods.ts): raw goods are lumps, made
 *     goods are blocks.
 * 10. Motion is calm: an idle bob at most 3% of the height with a period of 1.2 to 3 s and a
 *     phase from the thing's id; a tap is a quick squash, a stretch, and settled within a
 *     second. Lights change at most three times a second; nothing flashes the screen.
 * 11. No IP lookalikes: no faces on machines (Bob the Builder), no studs on blocks (LEGO),
 *     mitten hands, a round head on a boxy body, no pixel textures, no dog in a hard hat,
 *     no bow on the hat.
 * 12. Every draw function leaves the context as it found it, draws no text (the one line
 *     of text on the canvas is the ?debug overlay's numbers, frame.ts, never the child's),
 *     creates no gradient or pattern per call, never touches ctx.filter, shadowBlur or
 *     Path2D, has a sheet entry, and runs in its group's fake-context test
 *     (draw/fakeContext.ts). The helpers here keep it too: `tube`, the face kit and `shine`
 *     set the caps they need and put the caller's back.
 */

/** The ink, the only line colour. */
export const INK = '#1F2A48'

/** Device and CSS pixels per metre for what is being drawn now: whoever draws sets it (the renderer per frame and per bake, a portrait per paint). */
export const pen = { ppm: 80, dpr: 2 }

const WEIGHT = { edge: 3, line: 2.25, detail: 1.25 } as const
export type Weight = keyof typeof WEIGHT
/** A line width in metres: the weight in CSS pixels at 80 px/m, scaled by the square root of the zoom (held between 0.7 and 2.4), and never under one device pixel. */
export function lw(weight: Weight): number {
  const css = WEIGHT[weight] * Math.min(2.4, Math.max(0.7, Math.sqrt(pen.ppm / 80)))
  return Math.max(css, 1 / pen.dpr) / pen.ppm
}
/** How much detail to draw: L at 200 CSS px for the thing's height or more, M from 90, S below (silhouette, flat colour, big patterns only). */
export function detail(heightM: number): 'S' | 'M' | 'L' {
  const px = heightM * pen.ppm
  return px >= 200 ? 'L' : px >= 90 ? 'M' : 'S'
}

/** The fixed sizes, in metres. */
export const SIZE = {
  builder: 1.2,
  truck: { length: 4.4, height: 2.3 },
  machine: 2.4,
  good: 0.5,
  boulder: { small: 1.3, big: 1.8 },
  cat: 0.45,
  duck: 0.35,
  cell: 2.4,
} as const

// ---------------------------------------------------------------------------------------
// The palette

/** A made thing's three faces: front, top (lit) and right side (dark). */
export interface Faces {
  face: string
  top: string
  side: string
}

/** The shared colours. */
export const C = {
  paper: '#FFF4DC',
  white: '#FFFFFF',
  shadow: 'rgba(31, 42, 72, 0.18)',
  ghostFill: 'rgba(46, 107, 230, 0.18)',
  ghostLine: '#2E6BE6',
  light: 'rgba(255, 240, 170, 0.35)',
  blush: 'rgba(255, 96, 96, 0.28)',
  mouth: '#FF7F87',
  /** The face kit's marks on a face too dark for ink: a light warm tone (skin 1's), over 3:1 on skins 5 to 7 and on a black cat. */
  faceMark: '#F8CDAA',
  innerEar: '#FF9EBB',
  cloud: '#FFFFFF',
  hillFar: '#BFE6A8',
  hillNear: '#8FD27A',
  laneDash: '#FFF4DC',
  kerb: '#C9CFDA',
  tyre: '#2A2E3B',
  hub: '#C9CFDA',
  glassTint: '#BDE5F8',
  hazard: '#FFC21A',
  rope: '#B57446',
  sparkle: '#FFFFFF',
  sparkleWarm: '#FFF3B0',
  heart: '#FF5C8A',
  confetti: ['#FF5A5A', '#FFD93A', '#4FD36A', '#4AA8FF', '#A77BFF', '#FF7AB6', '#FFFFFF'],
  rainbow: ['#FF5A5A', '#FF9F3A', '#FFD93A', '#4FD36A', '#4AA8FF', '#A77BFF'],
} as const

/** Sky bands from the top to the horizon, and the flat sun with its pale ring (`flatSun`), per time of day. Evening (Good night) is a bright blue dusk, never dark. */
export const SKY = {
  day: { bands: ['#63BDF0', '#8ED0F5', '#BDE5F8'], sun: '#FFD84D', halo: '#FFEDAF' },
  sunset: { bands: ['#7C8CE8', '#F49BB0', '#FFD3A0'], sun: '#FFB347', halo: '#FFDDAC' },
  evening: { bands: ['#2F4C9E', '#4767BF', '#6C8AD6'], sun: '#FFF3C4', halo: '#FFFAE4' },
} as const

/** Box colours as face / top / side. */
export const BOX = {
  grass: { face: '#5CBF4E', top: '#84D46F', side: '#3F9A3A' },
  soil: { face: '#B57446', top: '#CF9467', side: '#8C5530' },
  asphalt: { face: '#565D70', top: '#6E7689', side: '#3F4558' },
  steel: { face: '#8E9AAE', top: '#B6C0CF', side: '#6B778C' },
  yellow: { face: '#FFC21A', top: '#FFD860', side: '#DB9A00' },
  orange: { face: '#FF7A1F', top: '#FF9E5A', side: '#D25A0B' },
  cobalt: { face: '#2E6BE6', top: '#5E90F0', side: '#1E4FB5' },
} as const satisfies Record<string, Faces>

/** Each building material: its faces and the colour of its marks (grain and nails, mortar, seams and tie holes, glints, stripes). */
export const MATERIAL_LOOK: Record<Material, Faces & { mark: string }> = {
  planks: { face: '#E8A85C', top: '#F6CB8E', side: '#C07F3A', mark: '#B5733A' },
  bricks: { face: '#D9533A', top: '#EE7A5E', side: '#B03C26', mark: '#F7E6CC' },
  concrete: { face: '#D9D3C7', top: '#ECE7DD', side: '#B5AE9F', mark: '#9C9585' },
  glass: { face: 'rgba(166, 234, 245, 0.8)', top: '#D2F6FB', side: '#6FCFE0', mark: '#FFFFFF' },
  rainbow: { face: '#FFD93A', top: '#FFE680', side: '#D9A800', mark: '#FF5A5A' },
}
/** Each raw good's lump colours: its body, a darker detail, a lighter detail. */
export const RAW_LOOK: Record<Raw, { body: string; dark: string; light: string }> = {
  log: { body: '#8A5A33', dark: '#C9965A', light: '#F0C88A' },
  clay: { body: '#C25F3A', dark: '#9E4528', light: '#E08A63' },
  rock: { body: '#9AA6BC', dark: '#6A768C', light: '#BAC4D6' },
  sand: { body: '#E8CF8E', dark: '#B57446', light: '#F6E3B4' },
  gem: { body: '#4AA8FF', dark: '#FF5A5A', light: '#FFD93A' },
}

export const SKIN_TONES: Record<Skin, string> = { 0: '#FFE3CF', 1: '#F8CDAA', 2: '#EBB38A', 3: '#D4986A', 4: '#B97B50', 5: '#976036', 6: '#774628', 7: '#57321D' }
export const HAIR_LOOK: Record<HairColor, string> = {
  black: '#2A2630',
  darkBrown: '#5B3A26',
  brown: '#8C5A34',
  red: '#B4462A',
  ginger: '#E3883A',
  blond: '#F3D06E',
  pink: '#FF86C2',
  blue: '#4C9DFF',
}
/** Clothes colours, each with a darker tint for seams and patterns. Jeans are always denim. */
export const WEAR_LOOK: Record<WearColor, { base: string; dark: string }> = {
  red: { base: '#E8443A', dark: '#B52E26' },
  orange: { base: '#FF8A1F', dark: '#D2660B' },
  yellow: { base: '#FFC93A', dark: '#DB9A00' },
  lime: { base: '#B7E03A', dark: '#8DB01E' },
  green: { base: '#3FB45A', dark: '#2A8A41' },
  teal: { base: '#1FB5A8', dark: '#138A80' },
  blue: { base: '#2E6BE6', dark: '#1E4FB5' },
  purple: { base: '#8E5CE0', dark: '#6A3EB8' },
  pink: { base: '#FF7AB6', dark: '#E0548F' },
  white: { base: '#F5F3EC', dark: '#CFCBBE' },
}
export const DENIM = { base: '#3D5A8C', dark: '#2C4269', light: '#6F8BBE' } as const
/** The hat's colours: its dome, the lit ridge, and the inner ears (white on the pink hat). */
export const HAT_LOOK: Record<HatColor, { base: string; top: string; inner: string }> = {
  yellow: { base: '#FFC21A', top: '#FFD860', inner: C.innerEar },
  orange: { base: '#FF7A1F', top: '#FF9E5A', inner: C.innerEar },
  red: { base: '#E8443A', top: '#EE7A5E', inner: C.innerEar },
  pink: { base: '#FF7AB6', top: '#FFA3CD', inner: '#FFFFFF' },
  purple: { base: '#8E5CE0', top: '#AE86EC', inner: C.innerEar },
  blue: { base: '#2E6BE6', top: '#5E90F0', inner: C.innerEar },
  green: { base: '#3FB45A', top: '#6CCB7F', inner: C.innerEar },
  white: { base: '#F5F3EC', top: '#FFFFFF', inner: C.innerEar },
}
/** Each machine's body colour on the shared machine kit (steel hopper and chute, hazard plinth). */
export const MACHINE_LOOK: Record<MachineId, Faces> = {
  sawmill: { face: '#3FB45A', top: '#6CCB7F', side: '#2A8A41' },
  oven: { face: '#E8443A', top: '#EE7A5E', side: '#B52E26' },
  mixer: { face: '#FF7A1F', top: '#FF9E5A', side: '#D25A0B' },
  glassworks: { face: '#1FB5A8', top: '#4FCBC0', side: '#138A80' },
  rainbow: { face: '#F5F3EC', top: '#FFFFFF', side: '#CFCBBE' },
}

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
/** (x, y) turned about (ox, oy) by a radians: a tail swinging about its root, a paw raised about its shoulder. */
export function turnAbout(x: number, y: number, ox: number, oy: number, a: number): [number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]
}
/** A phase from 0 to 1 for a thing's id, so many of a thing never move in step. */
export const phaseOf = (id: string | number) => {
  const s = String(id)
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
  return h / 997
}
/** A tap's squash and stretch at `age` seconds after it: a squash to 90% over 0.08 s, a stretch to 108% by 0.25 s, settled by 1 s. Returns [sx, sy]; [1, 1] for age < 0 or settled. */
export function squash(age: number): [number, number] {
  if (age < 0 || age >= 1) return [1, 1]
  const sy = age < 0.08 ? mix(1, 0.9, age / 0.08) : age < 0.25 ? mix(0.9, 1.08, (age - 0.08) / 0.17) : mix(1.08, 1, smooth(0.25, 1, age))
  return [1 / Math.sqrt(sy), sy]
}

// ---------------------------------------------------------------------------------------
// Shapes. Each path helper begins its own path.

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}
export function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, TAU)
}
/** The collectible-looking five-point star: outer radius r, inner 0.47 r, one point up. */
export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.47
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
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
/** Circles (x, y, r triples) as one path, each its own closed loop: a blob's outline, a cloud filled flat, or a clip. */
export function circlesPath(ctx: CanvasRenderingContext2D, xyr: readonly number[]) {
  ctx.beginPath()
  for (let i = 0; i < xyr.length; i += 3) {
    const r = Math.max(0, xyr[i + 2]!)
    ctx.moveTo(xyr[i]! + r, xyr[i + 1]!)
    ctx.arc(xyr[i]!, xyr[i + 1]!, r, 0, TAU)
  }
}

/** Strokes the current path in INK at a weight. */
export function ink(ctx: CanvasRenderingContext2D, weight: Weight) {
  ctx.lineWidth = lw(weight)
  ctx.strokeStyle = INK
  ctx.stroke()
}
/** Fills the current path with `colour` and inks it: a flat part. */
export function part(ctx: CanvasRenderingContext2D, colour: string, weight: Weight) {
  ctx.fillStyle = colour
  ctx.fill()
  ink(ctx, weight)
}
/** The current path stroked `w` metres wide in `colour` over an ink edge, with `cap` ends and round bends; the caller's caps and joins come back. */
function stroked(ctx: CanvasRenderingContext2D, w: number, colour: string, cap: CanvasLineCap) {
  const was = { cap: ctx.lineCap, join: ctx.lineJoin }
  ctx.lineCap = cap
  ctx.lineJoin = 'round'
  ctx.lineWidth = w + lw('line') * 2
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = w
  ctx.strokeStyle = colour
  ctx.stroke()
  ctx.lineCap = was.cap
  ctx.lineJoin = was.join
}
/** A limb, strap, rope, stalk or rod: the current path stroked `w` metres wide in `colour` over an ink edge, round at its ends and bends whatever caps the caller has set. */
export const tube = (ctx: CanvasRenderingContext2D, w: number, colour: string) => stroked(ctx, w, colour, 'round')
/** A cuff, a rail or a band: a `tube` cut square at its ends. */
export const bar = (ctx: CanvasRenderingContext2D, w: number, colour: string) => stroked(ctx, w, colour, 'butt')
/** Circles (x, y, r triples) as one inked blob with no seams inside: hair, foliage, clouds in the play layer, foam, steam. */
export function blob(ctx: CanvasRenderingContext2D, xyr: readonly number[], colour: string, weight: Weight) {
  circlesPath(ctx, xyr)
  ctx.lineWidth = lw(weight) * 2
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = colour
  ctx.fill()
}

/**
 * A made thing as a box: its front face (x, y, w, h), its top face and its right face
 * receding up-right by `depth` at 45 degrees, in the faces' three colours, inked at `weight`
 * around the whole silhouette and along the two inner edges. `top` and `right` say whether
 * those faces show (a room with a room on top shows no top face).
 */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, faces: Faces, depth: number, top: boolean, right: boolean, weight: Weight) {
  if (top) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + depth, y - depth)
    ctx.lineTo(x + w + depth, y - depth)
    ctx.lineTo(x + w, y)
    ctx.closePath()
    part(ctx, faces.top, weight)
  }
  if (right) {
    ctx.beginPath()
    ctx.moveTo(x + w, y)
    ctx.lineTo(x + w + depth, y - depth)
    ctx.lineTo(x + w + depth, y + h - depth)
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    part(ctx, faces.side, weight)
  }
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  part(ctx, faces.face, weight)
}

/** One white shine tick at ten o'clock on a round thing of radius r centred at (x, y). */
export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const cap = ctx.lineCap
  ctx.beginPath()
  ctx.arc(x, y, r * 0.68, Math.PI * 1.08, Math.PI * 1.32)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(r * 0.16, lw('detail'))
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.lineCap = cap
}
/** The flat oval a standing thing `w` wide casts under its feet (origin at the feet). */
export function groundShadow(ctx: CanvasRenderingContext2D, w: number) {
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.5 * w, Math.max(0.04, 0.06 * w), 0, 0, TAU)
  ctx.fillStyle = C.shadow
  ctx.fill()
}
/** The flat sun of radius r at (x, y), no ink (it is backdrop): its pale ring (a SKY halo) 1.32 r out, then the disc. The street, the road and the rooms' skies draw this one sun. */
export function flatSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sun: string, halo: string) {
  circlePath(ctx, x, y, 1.32 * r)
  ctx.fillStyle = halo
  ctx.fill()
  circlePath(ctx, x, y, r)
  ctx.fillStyle = sun
  ctx.fill()
}

/** Runs `draw` scaled by k about the origin with the pen's zoom scaled too: its lines keep their weight on screen and its detail level follows its size there (a small friend, a toy, an icon). */
export function scaled(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const was = pen.ppm
  ctx.save()
  ctx.scale(k, k)
  pen.ppm = was * k
  draw()
  pen.ppm = was
  ctx.restore()
}

/** Under this many CSS px across, a shrinking puff, sparkle, bubble or drop is left out: its ink would linger as a speck. */
const SPECK = 2.5
/** Whether a round thing of radius r (metres) is too small on screen to draw now. */
export const speck = (r: number) => 2 * r * pen.ppm < SPECK
/** A puff of smoke, dust or steam of size r at (x, y): three circles as one inked blob. Puffs grow and shrink away rather than fade (a fading blob shows its inner rings), so the caller animates r; a speck is left out. */
export function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  if (speck(r)) return
  blob(ctx, [x, y, r, x - r * 0.8, y + r * 0.3, r * 0.7, x + r * 0.7, y + r * 0.35, r * 0.6], colour, 'detail')
}
/** A four-point sparkle `size` from tip to tip at (x, y), filled with `colour` and inked: a tap's twinkle, grown and shrunk by the caller; a speck is left out. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  if (speck(size / 2)) return
  sparklePath(ctx, x, y, size)
  part(ctx, colour, 'detail')
}

// ---------------------------------------------------------------------------------------
// The face kit, shared by people and animals.

/** The WCAG relative luminance of a '#RRGGBB' colour token. */
function luminance(hex: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`not a #RRGGBB colour: ${hex}`)
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
/** The WCAG contrast ratio of two '#RRGGBB' colours, from 1 (the same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
/** Ink marks on a face need this much contrast with it to read at street size. */
const MARK_CONTRAST = 3
/** Each face colour's marks, worked out once. */
const MARKS = new Map<string, string>()
/** The colour of the face kit's marks on a face of colour `face`: INK, or C.faceMark on a face where ink falls under 3:1 (skins 5 to 7, a black cat). */
export function faceMark(face: string): string {
  let mark = MARKS.get(face)
  if (mark === undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(face)) throw new Error(`the face kit needs the colour of the face under it, a '#RRGGBB' token: got ${face}`)
    mark = contrast(INK, face) >= MARK_CONTRAST ? INK : C.faceMark
    MARKS.set(face, mark)
  }
  return mark
}
/** Strokes the current path as a face's mark: round ends, the detail weight, in `mark`; the caller's caps come back. */
function markLine(ctx: CanvasRenderingContext2D, mark: string) {
  const cap = ctx.lineCap
  ctx.lineCap = 'round'
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = mark
  ctx.stroke()
  ctx.lineCap = cap
}

/**
 * Two bean eyes on a face of colour `face`, `size` tall (about 0.056 m on the builder), the
 * near one at (x, y) and the far one `gap` behind it (to the left, facing right). `mood`:
 * open or wide (an ink bean with a white glint, the glint bigger when the eye is under 4 CSS
 * px so it stays a bright dot), happy arcs, or closed (asleep). On a face too dark for ink
 * (`faceMark`) an open eye sits in a light rim and the arcs are drawn light.
 */
export function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, gap: number, mood: 'open' | 'happy' | 'closed' | 'wide', face: string) {
  const mark = faceMark(face)
  for (const [ex, k] of [
    [x, 1],
    [x - gap, 0.85],
  ] as const) {
    const h = size * k
    if (mood === 'open' || mood === 'wide') {
      const rx = h * (mood === 'wide' ? 0.5 : 0.36)
      if (mark !== INK) {
        const rim = Math.max(lw('detail'), h * 0.12)
        ctx.beginPath()
        ctx.ellipse(ex, y, rx + rim, h / 2 + rim, 0, 0, TAU)
        ctx.fillStyle = mark
        ctx.fill()
      }
      ctx.beginPath()
      ctx.ellipse(ex, y, rx, h / 2, 0, 0, TAU)
      ctx.fillStyle = INK
      ctx.fill()
      ctx.beginPath()
      ctx.arc(ex + h * 0.1, y - h * 0.18, h * (h * pen.ppm < 4 ? 0.22 : 0.16), 0, TAU)
      ctx.fillStyle = C.white
      ctx.fill()
    } else {
      ctx.beginPath()
      if (mood === 'happy') ctx.arc(ex, y + h * 0.25, h * 0.45, Math.PI * 1.15, Math.PI * 1.85)
      else ctx.arc(ex, y - h * 0.25, h * 0.45, Math.PI * 0.15, Math.PI * 0.85)
      markLine(ctx, mark)
    }
  }
}
/** A smile `w` wide centred at (x, y) on a face of colour `face`; open shows the mouth colour inside. Its line is the face's mark (`faceMark`). */
export function smile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, open: boolean, face: string) {
  ctx.beginPath()
  if (open) {
    ctx.moveTo(x - w / 2, y)
    ctx.quadraticCurveTo(x, y + w * 0.9, x + w / 2, y)
    ctx.closePath()
    ctx.fillStyle = C.mouth
    ctx.fill()
  } else {
    ctx.moveTo(x - w / 2, y)
    ctx.quadraticCurveTo(x, y + w * 0.55, x + w / 2, y)
  }
  markLine(ctx, faceMark(face))
}
export function blush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU)
  ctx.fillStyle = C.blush
  ctx.fill()
}

// ---------------------------------------------------------------------------------------
// Sheets

/** One cell of a sprite sheet (?sheet=<group>): a label, the world box to fit (origin as the draw function expects), and the drawing at sim time t. */
export interface SheetEntry {
  label: string
  box: Rect
  draw: (ctx: CanvasRenderingContext2D, t: number) => void
}

/** The sheets' own scale, Sheet.tsx's default px per metre. */
const SHEET_PPM = 120
/** A sheet entry that draws as a screen at `ppm` CSS px per metre would (its line widths, its detail level, the hat's ear size), scaled onto the sheet so it shows at that size there; `box` is in the drawing's own metres. */
export function at(ppm: number, box: Rect, label: string, draw: (ctx: CanvasRenderingContext2D, t: number) => void): SheetEntry {
  const k = ppm / SHEET_PPM
  return {
    label,
    box: rect(box.x * k, box.y * k, box.w * k, box.h * k),
    draw: (ctx, t) => {
      const was = pen.ppm
      ctx.save()
      ctx.scale(k, k)
      pen.ppm = ppm
      draw(ctx, t)
      pen.ppm = was
      ctx.restore()
    },
  }
}
