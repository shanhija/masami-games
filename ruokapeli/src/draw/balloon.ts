import { C, INK, LINE, LINE_BIG, LINE_DETAIL, fillOval, groundShadow, inkOval, inked, strokeIt, strokeLine, type SheetEntry } from './look'

/**
 * The hot air balloon (plans/ruokapeli.md): it waits at the end of every course, tied down
 * with ropes and tent pegs, and in the finale it floats over the monster's track and lets
 * the dish fall through a slot in its basket's floor. Its own look: red and white stripes
 * with a red gingham band like the picnic cloth, a gold cap on top, a woven basket.
 *
 * The origin is the basket's bottom middle, where the slot is. Seen from a little below:
 * the basket's underside shows, and with it the slot and its trap door.
 */

const B = {
  red: '#E8343A',
  white: '#FFF8EC',
  /** The envelope's shadowed side, laid over its stripes. */
  shade: 'rgba(120, 30, 40, 0.2)',
  gingham: '#E8343A',
  check: 'rgba(255, 255, 255, 0.55)',
  cap: '#FFD23F',
  skirt: '#B82329',
  /** Looking up into the envelope through its mouth. */
  inside: '#5A1A1E',
  rope: '#A47A4C',
  wicker: '#D9A35B',
  wickerDark: '#B57E3A',
  wickerLight: '#F0CB8C',
  rim: '#8B5A2B',
  floor: '#A8743E',
  slot: '#3A2418',
  burner: '#9AA6B4',
  burnerDark: '#66727F',
  flame: '#FFA63D',
  flameCore: '#FFF3A8',
  peg: '#B0814B',
  /** The stand-in rider on the sheet. */
  standIn: '#4AA3FF',
  standInFace: '#F2C9A0',
} as const

const TAU = Math.PI * 2

/** The basket's height, from its bottom to its rim. */
export const BASKET_H = 0.8
/** The whole balloon's height, from the basket's bottom to the envelope's top. */
export const BALLOON_H = 4.3

/** The envelope: its widest half width and the height of its middle there, its top, and its throat, where it has narrowed to `neck` over the skirt. */
const ENV = { r: 1.5, mid: -3.05, top: -BALLOON_H, throat: -1.6, neck: 0.36 } as const
/** The basket: half its width at the rim and at the bottom, how deep its rim's oval is, and its floor's thickness (the rider stands on it). */
const BASKET = { top: 0.58, bottom: 0.5, rim: 0.09, floor: 0.12 } as const
/** The skirt under the envelope, and the burner just under it, over the rider's head. */
const SKIRT = { top: ENV.throat, bottom: -1.45, half: 0.32 } as const
const BURNER_Y = -1.36
/** The stripes round the envelope, and the gingham band's top and bottom. */
const GORES = 8
const BAND = { top: -2.66, bottom: -2.38 } as const
/** Where the tether pegs stand, either side. */
const PEG_X = 1.64

/** The envelope's half width at height y: a round top over a cone curving in to the throat. */
function radius(y: number) {
  if (y <= ENV.mid) return ENV.r * Math.sqrt(Math.max(0, 1 - ((y - ENV.mid) / (ENV.mid - ENV.top)) ** 2))
  const u = Math.min(1, (y - ENV.mid) / (ENV.throat - ENV.mid))
  return ENV.neck + (ENV.r - ENV.neck) * Math.cos((u * Math.PI) / 2) ** 1.5
}

/** The heights down the envelope from its top to its throat, closer together over the round top. */
const DOWN: readonly number[] = [
  ...Array.from({ length: 14 }, (_, i) => ENV.mid - (ENV.mid - ENV.top) * Math.cos((i / 14) * (Math.PI / 2))),
  ...Array.from({ length: 13 }, (_, i) => ENV.mid + (ENV.throat - ENV.mid) * (i / 12)),
]

/** Adds the meridian at angle phi (-pi/2 the left edge, pi/2 the right) to the path, down from the top or (`up`) up from the throat. */
function meridian(c: CanvasRenderingContext2D, phi: number, up: boolean) {
  const s = Math.sin(phi)
  for (let i = 0; i < DOWN.length; i++) {
    const y = DOWN[up ? DOWN.length - 1 - i : i]!
    c.lineTo(s * radius(y), y)
  }
}

/** Adds the envelope's outline, moved by (dx, dy), to the path as a closed shape of its own. */
function outline(c: CanvasRenderingContext2D, dx: number, dy: number) {
  c.moveTo(dx, dy + ENV.top)
  for (let i = 0; i < DOWN.length; i++) c.lineTo(dx + radius(DOWN[i]!), dy + DOWN[i]!)
  for (let i = DOWN.length - 1; i >= 0; i--) c.lineTo(dx - radius(DOWN[i]!), dy + DOWN[i]!)
  c.closePath()
}

/** The envelope's outline. */
function envelopePath(c: CanvasRenderingContext2D) {
  c.beginPath()
  outline(c, 0, 0)
}

/** The envelope: its stripes, the gingham band, the shade on its far side, the gold cap, the shine, and the skirt with the dark mouth under it. */
function envelope(c: CanvasRenderingContext2D) {
  envelopePath(c)
  c.fillStyle = B.white
  c.fill()
  c.save()
  envelopePath(c)
  c.clip()
  // Every other stripe red, each between two meridians, so they crowd together toward the edges like a ball's.
  for (let k = 0; k < GORES; k += 2) {
    c.beginPath()
    c.moveTo(0, ENV.top)
    meridian(c, -Math.PI / 2 + (k * Math.PI) / GORES, false)
    meridian(c, -Math.PI / 2 + ((k + 1) * Math.PI) / GORES, true)
    c.closePath()
    c.fillStyle = B.red
    c.fill()
  }
  // The gingham band: red, crossed by see-through white stripes down and one along it.
  c.fillStyle = B.gingham
  c.fillRect(-ENV.r, BAND.top, 2 * ENV.r, BAND.bottom - BAND.top)
  c.fillStyle = B.check
  for (let j = 0; j < 16; j += 2) {
    const a = Math.sin(-Math.PI / 2 + (j * Math.PI) / 16)
    const b = Math.sin(-Math.PI / 2 + ((j + 1) * Math.PI) / 16)
    c.beginPath()
    c.moveTo(a * radius(BAND.top), BAND.top)
    c.lineTo(b * radius(BAND.top), BAND.top)
    c.lineTo(b * radius(BAND.bottom), BAND.bottom)
    c.lineTo(a * radius(BAND.bottom), BAND.bottom)
    c.closePath()
    c.fill()
  }
  const mid = (BAND.top + BAND.bottom) / 2
  c.fillRect(-ENV.r, mid - 0.045, 2 * ENV.r, 0.09)
  for (const y of [BAND.top, BAND.bottom]) strokeLine(c, INK, LINE_DETAIL, -ENV.r, y, ENV.r, y)
  // The far side in shade: everything but the envelope moved toward the light.
  c.beginPath()
  c.rect(-ENV.r - 0.1, ENV.top - 0.1, 2 * ENV.r + 0.2, ENV.throat - ENV.top + 0.2)
  outline(c, -0.22, -0.16)
  c.fillStyle = B.shade
  c.fill('evenodd')
  c.restore()
  // The gold cap, the outline, the shine.
  c.save()
  envelopePath(c)
  c.clip()
  inkOval(c, 0, ENV.top + 0.04, 0.42, 0.13, B.cap, LINE_DETAIL)
  c.restore()
  envelopePath(c)
  strokeIt(c, INK, LINE_BIG)
  c.beginPath()
  c.ellipse(0, ENV.mid, ENV.r * 0.8, (ENV.mid - ENV.top) * 0.8, 0, Math.PI * 1.1, Math.PI * 1.32)
  strokeIt(c, C.shine, 0.07)
  // The skirt, and the dark mouth of the envelope inside it.
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-radius(SKIRT.top) - 0.01, SKIRT.top - 0.04)
      k.lineTo(radius(SKIRT.top) + 0.01, SKIRT.top - 0.04)
      k.lineTo(SKIRT.half, SKIRT.bottom)
      k.lineTo(-SKIRT.half, SKIRT.bottom)
      k.closePath()
    },
    B.skirt,
    LINE,
  )
  inkOval(c, 0, SKIRT.bottom, SKIRT.half, 0.07, B.inside, LINE_DETAIL)
}

/** The ropes from the skirt down to the basket's rim, the burner between them and its flame flickering up into the envelope. */
function rigging(c: CanvasRenderingContext2D, t: number) {
  for (const [x0, x1] of [
    [-SKIRT.half, -BASKET.top + 0.04],
    [-SKIRT.half * 0.4, -BASKET.top * 0.4],
    [SKIRT.half * 0.4, BASKET.top * 0.4],
    [SKIRT.half, BASKET.top - 0.04],
  ] as const)
    strokeLine(c, B.rope, 0.03, x0, SKIRT.bottom, x1, -BASKET_H)
  // A soft flicker, its height wavering a few times a second.
  const h = 0.3 * (0.85 + 0.1 * Math.sin(TAU * 2.3 * t) + 0.05 * Math.sin(TAU * 5.1 * t + 1))
  const sway = 0.015 * Math.sin(TAU * 3.7 * t)
  const flame = (k: CanvasRenderingContext2D, w: number, tall: number) => {
    k.beginPath()
    k.moveTo(-w, BURNER_Y - 0.05)
    k.quadraticCurveTo(-w, BURNER_Y - 0.05 - tall * 0.55, sway, BURNER_Y - 0.05 - tall)
    k.quadraticCurveTo(w, BURNER_Y - 0.05 - tall * 0.55, w, BURNER_Y - 0.05)
    k.closePath()
  }
  inked(c, (k) => flame(k, 0.09, h), B.flame, LINE_DETAIL)
  flame(c, 0.045, h * 0.6)
  c.fillStyle = B.flameCore
  c.fill()
  inked(
    c,
    (k) => {
      k.beginPath()
      k.rect(-0.13, BURNER_Y - 0.06, 0.26, 0.12)
    },
    B.burner,
    LINE,
  )
  strokeLine(c, B.burnerDark, 0.03, -0.1, BURNER_Y + 0.02, 0.1, BURNER_Y + 0.02)
}

/** The basket's rim oval at its top. */
function rimOval(c: CanvasRenderingContext2D, a0: number, a1: number) {
  c.beginPath()
  c.ellipse(0, -BASKET_H, BASKET.top, BASKET.rim, 0, a0, a1)
}

/** The inside of the basket seen over its front: the dark back wall and the back half of the padded rim. */
function basketBack(c: CanvasRenderingContext2D) {
  rimOval(c, 0, TAU)
  c.fillStyle = B.wickerDark
  c.fill()
  rimOval(c, Math.PI, TAU)
  strokeIt(c, INK, 0.08 + 2 * LINE_DETAIL)
  strokeIt(c, B.rim, 0.08)
}

/** The basket's front wall, a little narrower at the bottom with round corners. */
function wallPath(c: CanvasRenderingContext2D) {
  const y1 = -BASKET.floor
  c.beginPath()
  c.moveTo(-BASKET.top, -BASKET_H)
  c.ellipse(0, -BASKET_H, BASKET.top, BASKET.rim, 0, Math.PI, 0, true)
  c.lineTo(BASKET.bottom, y1 - 0.06)
  c.quadraticCurveTo(BASKET.bottom - 0.01, y1, BASKET.bottom - 0.07, y1)
  c.lineTo(-BASKET.bottom + 0.07, y1)
  c.quadraticCurveTo(-BASKET.bottom + 0.01, y1, -BASKET.bottom, y1 - 0.06)
  c.closePath()
}

/**
 * The front of the basket over the rider: the woven wall, the front of the padded rim, and
 * the underside with the slot, dark when open (`slot` 0 shut to 1 open), its trap door
 * swinging down from the slot's front edge.
 */
function basketFront(c: CanvasRenderingContext2D, slot: number) {
  // The underside, seen from a little below.
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-BASKET.bottom + 0.04, -BASKET.floor)
      k.ellipse(0, -BASKET.floor, BASKET.bottom - 0.04, BASKET.floor, 0, Math.PI, 0, true)
      k.closePath()
    },
    B.floor,
    LINE,
  )
  const sw = 0.17
  const sy = -BASKET.floor * 0.5
  if (slot <= 0.02) strokeLine(c, INK, LINE_DETAIL, -sw, sy, sw, sy)
  else {
    // The gap, and the door swung down from its front edge (so the gap shows over it).
    const gap = 0.015 + 0.035 * slot
    inkOval(c, 0, sy, sw, gap, B.slot, LINE_DETAIL)
    const drop = 0.17 * Math.sin((Math.min(1, slot) * Math.PI) / 2)
    inked(
      c,
      (k) => {
        k.beginPath()
        k.moveTo(-sw * 0.95, sy + gap)
        k.lineTo(sw * 0.95, sy + gap)
        k.lineTo(sw * 0.88, sy + gap + drop)
        k.lineTo(-sw * 0.88, sy + gap + drop)
        k.closePath()
      },
      B.wicker,
      LINE_DETAIL,
    )
  }
  // The woven wall: rows of withies with stakes through them, lit along each row.
  c.save()
  wallPath(c)
  c.fillStyle = B.wicker
  c.fill()
  c.clip()
  for (let i = 0; i < 7; i++) {
    const y = -BASKET_H + 0.12 + i * 0.1
    strokeLine(c, B.wickerDark, 0.018, -0.7, y + 0.04, 0.7, y + 0.04)
    for (let x = -0.62 + (i % 2) * 0.09; x < 0.65; x += 0.18) strokeLine(c, B.wickerLight, 0.022, x, y, x + 0.08, y)
  }
  for (const x of [-0.36, -0.12, 0.12, 0.36]) strokeLine(c, B.wickerDark, 0.022, x, -BASKET_H, x * 0.9, 0)
  c.restore()
  wallPath(c)
  strokeIt(c, INK, LINE)
  rimOval(c, 0, Math.PI)
  strokeIt(c, INK, 0.08 + 2 * LINE_DETAIL)
  strokeIt(c, B.rim, 0.08)
}

/** The tethers: a rope from the envelope's side and one from the basket's to a tent peg in the ground either side. */
function tethers(c: CanvasRenderingContext2D) {
  for (const s of [-1, 1]) {
    const px = s * PEG_X
    c.save()
    c.translate(px, 0.02)
    groundShadow(c, 0.1, 0.04)
    c.restore()
    strokeLine(c, B.rope, 0.03, s * radius(BAND.bottom) * 0.96, BAND.bottom, px, -0.1)
    strokeLine(c, B.rope, 0.03, s * BASKET.top, -BASKET_H + 0.1, px, -0.1)
    inked(
      c,
      (k) => {
        k.beginPath()
        k.moveTo(px - 0.04, -0.2)
        k.lineTo(px + 0.04, -0.2)
        k.lineTo(px + 0.035, 0.02)
        k.lineTo(px - 0.035, 0.02)
        k.closePath()
      },
      B.peg,
      LINE_DETAIL,
    )
    inkOval(c, px, -0.2, 0.06, 0.025, B.peg, LINE_DETAIL)
  }
}

/** A balloon: `slot` 0 shut to 1 open, `pegs` tied down to the ground (at the end of a course) or free (floating, swaying gently with `t`). */
export interface BalloonPose {
  t: number
  slot: number
  pegs: boolean
}

/** Where the rider stands: on the basket's floor, inside it. */
const FLOOR_Y = -BASKET.floor

/**
 * The balloon, its origin at the basket's bottom middle: the envelope, the rigging and the
 * basket's back, then `rider` drawn with the origin moved to the middle of the basket's
 * floor, then the basket's front over the rider's legs. A free balloon bobs and sways
 * gently about its basket; a tied one only stirs.
 */
export function drawBalloon(ctx: CanvasRenderingContext2D, pose: BalloonPose, rider: ((ctx: CanvasRenderingContext2D) => void) | null) {
  const t = pose.t
  const sway = (pose.pegs ? 0.01 : 0.03) * Math.sin((TAU * t) / 3.4)
  const bob = pose.pegs ? 0 : 0.03 * Math.sin((TAU * t) / 2.6)
  if (pose.pegs) tethers(ctx)
  ctx.save()
  ctx.translate(0, bob)
  // The envelope sways about the rim of the basket hanging under it.
  ctx.save()
  ctx.translate(0, -BASKET_H)
  ctx.rotate(sway)
  ctx.translate(0, BASKET_H)
  envelope(ctx)
  rigging(ctx, t)
  ctx.restore()
  basketBack(ctx)
  if (rider) {
    ctx.save()
    ctx.translate(0, FLOOR_Y)
    rider(ctx)
    ctx.restore()
  }
  basketFront(ctx, pose.slot)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A stand-in rider: a body and a round head, standing on the basket's floor. */
function standIn(c: CanvasRenderingContext2D) {
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-0.22, 0)
      k.lineTo(-0.25, -0.78)
      k.quadraticCurveTo(0, -0.9, 0.25, -0.78)
      k.lineTo(0.22, 0)
      k.closePath()
    },
    B.standIn,
    LINE,
  )
  inkOval(c, 0, -1.02, 0.25, 0.25, B.standInFace, LINE)
  fillOval(c, -0.08, -1.04, 0.03, 0.03, INK)
  fillOval(c, 0.08, -1.04, 0.03, 0.03, INK)
}

const BOX = { x: -1.95, y: -4.45, w: 3.9, h: 4.8 }

export const SHEET: SheetEntry[] = [
  { label: 'free, slot shut', box: BOX, draw: (c, t) => drawBalloon(c, { t, slot: 0, pegs: false }, standIn) },
  { label: 'free, slot open', box: BOX, draw: (c, t) => drawBalloon(c, { t, slot: 1, pegs: false }, standIn) },
  { label: 'free, slot opening', box: BOX, draw: (c, t) => drawBalloon(c, { t, slot: 0.5 + 0.5 * Math.sin(t * 2), pegs: false }, standIn) },
  { label: 'tied down with pegs', box: BOX, draw: (c, t) => drawBalloon(c, { t, slot: 0, pegs: true }, standIn) },
  { label: 'empty basket', box: BOX, draw: (c, t) => drawBalloon(c, { t, slot: 0, pegs: true }, null) },
]
