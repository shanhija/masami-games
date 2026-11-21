import { ALL_FILLINGS, ALL_FOODS, type Edible, type Food } from '../game/model'
import { C, INK, LINE, LINE_DETAIL, fillOval, groundShadow, inkOval, inked, roundRectPath, shaded, shine, strokeIt, strokeLine, TAU, type SheetEntry } from './look'

/**
 * The foods (plans/monster-lunch.md): every filling, the poop and the breads as one layer of a
 * pile seen from the slant (look.ts rule 1), the same foods lying on the course, and the
 * plate with its pile on it.
 *
 * A layer is a slab: an oval top where the next layer sits and a darker front band under
 * it, about a bun wide (FOOD_W) and LAYER[kind] thick, its origin at the bottom of its
 * front. Its top oval is centred RY + LAYER[kind] above the origin, so the next layer's
 * bottom lies exactly on it. Thin things wider than a bun (cheese, salad, ham, the fried
 * egg) hang over the layer below; sauces drip down it; pieces (pickles, banana, strawberry,
 * blueberries) lie about on it, the front ones at its edge, so in a pile they peek out from
 * under the next layer. In a pile every layer is inked thinner, or the outlines would hide
 * the thin layers. On the course a food lies as its layer, smaller, except the sauces,
 * which come in a bottle or a jar. Foods have no faces (rule 3); the poop has flies and a
 * smell instead.
 */

const F = {
  bun: '#F2A23A',
  bunLight: '#FBC867',
  bunDark: '#C8731F',
  crumb: '#FFE3A6',
  crumbEdge: '#F0BC62',
  sesame: '#FFF7DE',
  croissant: '#F0A23C',
  croissantLight: '#FCCB6E',
  croissantDark: '#C46E1E',
  croissantCrumb: '#FFE6B0',
  croissantFlake: '#E2A04E',
  patty: '#93502D',
  pattySide: '#6C3720',
  grill: '#4E2615',
  cheese: '#FFCC33',
  cheeseSide: '#F5A21B',
  cheeseHole: '#F2AC24',
  salad: '#7DD34A',
  saladSide: '#3E9C2C',
  saladVein: '#C4F48F',
  tomato: '#EE3B2F',
  tomatoSide: '#B8241D',
  tomatoFlesh: '#FF7462',
  tomatoJelly: '#FFB199',
  tomatoSeed: '#FFF0B3',
  egg: '#FFFFFF',
  eggSide: '#EDE3D3',
  yolk: '#FFB52E',
  yolkShade: '#F28A10',
  pickle: '#5AA83B',
  pickleSide: '#3B7A27',
  pickleFlesh: '#CFE683',
  pickleSeed: '#8DB848',
  onion: '#C565BE',
  onionSide: '#93408F',
  onionLight: '#F7DDF4',
  ketchup: '#EA2A2E',
  ketchupSide: '#B3151C',
  ketchupLight: '#FF6A5C',
  chocolate: '#76391B',
  chocolateSide: '#5E2D14',
  chocolateLight: '#9A5531',
  jam: '#DA2063',
  jamSide: '#A0124A',
  jamBit: '#FF7AA6',
  banana: '#FFF0B0',
  bananaSide: '#EFC95A',
  bananaRim: '#F5D576',
  bananaSeed: '#B08440',
  cream: '#FFFDF8',
  creamShade: '#F1E4D2',
  strawberry: '#F2333F',
  strawberrySide: '#BF1C2C',
  strawberryFlesh: '#FF8F98',
  strawberryCore: '#FFE1E3',
  strawberrySeed: '#FFE27A',
  leaf: '#4DB848',
  leafDark: '#2E8C38',
  ham: '#F68FA4',
  hamSide: '#D8627C',
  hamFat: '#FFD9E1',
  blueberry: '#4D63D9',
  blueberryShade: '#3343A8',
  blueberryCrown: '#2A2F6E',
  poop: '#9A6440',
  poopShade: '#774A2C',
  fly: '#3A3240',
  wing: 'rgba(255, 255, 255, 0.85)',
  stink: 'rgba(150, 196, 80, 0.8)',
  plate: '#FFFFFF',
  plateWell: '#EEF3F9',
  plateSide: '#D3DDEA',
  plateLine: '#8EC3F0',
  /** The jars and the bottle the sauces come in on the course. */
  glass: '#E4F3FF',
  bottleCap: '#FFFFFF',
  label: '#FFF8E6',
  lidRed: '#E8343A',
  spoon: '#D9E2EC',
} as const


/** The width of one layer, tiles: a bun's. */
export const FOOD_W = 1.0

/** Each layer's thickness in the pile, tiles: the next layer sits this much higher. */
export const LAYER: Record<Food, number> = {
  patty: 0.17,
  cheese: 0.07,
  salad: 0.1,
  tomato: 0.08,
  egg: 0.09,
  pickle: 0.07,
  onion: 0.08,
  ketchup: 0.06,
  chocolate: 0.07,
  jam: 0.07,
  banana: 0.08,
  cream: 0.12,
  strawberry: 0.1,
  ham: 0.07,
  blueberry: 0.1,
  poop: 0.24,
  bunBottom: 0.2,
  bunTop: 0.34,
  croissantBottom: 0.18,
  croissantTop: 0.32,
}

/** The slant (look.ts rule 1): a round top seen from above at an angle is an oval this much as deep as it is wide. A bun's top reaches RX either side and RY toward and away from the camera. */
const SLANT = 0.32
const RX = FOOD_W / 2
const RY = RX * SLANT

/** Points round each half of a wavy slab's outline: SMOOTH for lumps, frills and puffs, FINE for drips a few hundredths wide. A plain oval is traced with arcs instead. */
const SMOOTH = 36
const FINE = 72

/** How far a slab's rim reaches out at angle a, as a share more than its oval (0 for a plain oval). */
type Edge = (a: number) => number
const round: Edge = () => 0
/**
 * How a slab's outline hangs down: `sag` bends its top and its front edge down alike at x
 * (from its middle) and v (from -1 at the back of its top to 1 at the front), a cheese
 * corner drooping; `drip` pulls only its front edge down at x, a sauce's drips or a frill.
 */
interface Hang {
  sag: (x: number, v: number) => number
  drip: (x: number) => number
}
const none = () => 0
const level: Hang = { sag: none, drip: none }
/** A hang of the front edge only. */
const dripping = (drip: (x: number) => number): Hang => ({ sag: none, drip })

/** A drip's tongue: 1 long at x0, narrowing to a rounded point about w either side. */
const tongue = (x: number, x0: number, w: number) => Math.exp(-(((x - x0) / w) ** 2))

/** A slab's outline seen from the slant: the back half of its top oval round (cx, cy), then its front edge `th` lower, `n` points round each half (a plain oval that does not hang takes two arcs). */
function slabPath(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, th: number, edge: Edge, hang: Hang, n: number) {
  c.beginPath()
  if (edge === round && hang === level) {
    c.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU)
    c.ellipse(cx, cy + th, rx, ry, 0, 0, Math.PI)
    c.closePath()
    return
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1 + i / n)
    const r = 1 + edge(a)
    const x = rx * r * Math.cos(a)
    const y = cy + ry * r * Math.sin(a) + hang.sag(x, Math.sin(a))
    if (i === 0) c.moveTo(cx + x, y)
    else c.lineTo(cx + x, y)
  }
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n
    const r = 1 + edge(a)
    const x = rx * r * Math.cos(a)
    c.lineTo(cx + x, cy + ry * r * Math.sin(a) + th + hang.sag(x, Math.sin(a)) + hang.drip(x))
  }
  c.closePath()
}

/** A slab's top oval round (cx, cy), `n` points round each half (a plain one is one oval). */
function topPath(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, edge: Edge, hang: Hang, n: number) {
  c.beginPath()
  if (edge === round && hang === level) {
    c.ellipse(cx, cy, rx, ry, 0, 0, TAU)
    return
  }
  for (let i = 0; i < 2 * n; i++) {
    const a = (Math.PI * i) / n
    const r = 1 + edge(a)
    const x = rx * r * Math.cos(a)
    const y = cy + ry * r * Math.sin(a) + hang.sag(x, Math.sin(a))
    if (i === 0) c.moveTo(cx + x, y)
    else c.lineTo(cx + x, y)
  }
  c.closePath()
}

/** Lines inside a food are this much of its outline (LINE_DETAIL to LINE, look.ts rule 2). */
const DETAIL = LINE_DETAIL / LINE

/** A slab inked `line` wide: its front band in `side`, then its top in `top` with a thinner ink line where the two meet. */
function slab(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, th: number, edge: Edge, hang: Hang, n: number, top: string, side: string, line: number) {
  inked(c, (k) => slabPath(k, cx, cy, rx, ry, th, edge, hang, n), side, line)
  inked(c, (k) => topPath(k, cx, cy, rx, ry, edge, hang, n), top, line * DETAIL)
}

/** A smooth open line through the points (x, y pairs): straight to the first midpoint, then curves through each point's midpoint with its neighbour, for the caller to stroke. */
function smoothPath(c: CanvasRenderingContext2D, pts: readonly number[]) {
  c.beginPath()
  c.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < pts.length - 2; i += 2) c.quadraticCurveTo(pts[i]!, pts[i + 1]!, (pts[i]! + pts[i + 2]!) / 2, (pts[i + 1]! + pts[i + 3]!) / 2)
  c.lineTo(pts[pts.length - 2]!, pts[pts.length - 1]!)
}

/** Adds a round bump from the current point, at x0, to (x1, y1), rising steeply from each end to height `mid` in the middle: a croissant's roll. */
function arch(c: CanvasRenderingContext2D, x0: number, x1: number, y1: number, mid: number) {
  const xm = (x0 + x1) / 2
  c.quadraticCurveTo(x0, mid, xm, mid)
  c.quadraticCurveTo(x1, mid, x1, y1)
}

// ---------------------------------------------------------------------------------------
// The fillings, each inked `line` wide: LINE on its own, thinner in a pile, where every
// layer's outline would hide the thin layers between them.

type Layer = (c: CanvasRenderingContext2D, line: number) => void

/** The height of a layer's top oval's middle: where the next layer's bottom lies. */
const topOf = (kind: Food) => -RY - LAYER[kind]

const patty: Layer = (c, line) => {
  const cy = topOf('patty')
  const rx = RX * 0.97
  const ry = RY * 0.97
  // A pressed patty's rim is lumpy; the grill leaves three dark stripes across its top.
  const edge: Edge = (a) => 0.022 * Math.sin(11 * a) + 0.014 * Math.sin(5 * a + 1)
  slab(c, 0, cy, rx, ry, LAYER.patty, edge, level, SMOOTH, F.patty, F.pattySide, line)
  c.save()
  topPath(c, 0, cy, rx, ry, edge, level, SMOOTH)
  c.clip()
  for (const u of [-0.55, 0, 0.55]) strokeLine(c, F.grill, 0.05, (u - 0.3) * rx, cy - 0.85 * ry, (u + 0.3) * rx, cy + 0.85 * ry)
  c.restore()
  shine(c, 0.025, -0.33, cy - 0.06, -0.2, cy - 0.095)
}

/** Cheese holes on the slice's top: where (in shares of its half width and depth) and how big. */
const CHEESE_HOLES = [
  [-0.45, -0.05, 0.05],
  [0.05, -0.5, 0.04],
  [0.32, 0.1, 0.055],
  [-0.12, 0.42, 0.035],
] as const

const cheese: Layer = (c, line) => {
  const cy = topOf('cheese')
  const rx = 0.6
  const ry = rx * SLANT
  // A square slice turned corner-on is a rounded diamond on the slant. Past the bun it
  // bends down: its side corners sag and its front corner droops over the edge.
  const edge: Edge = (a) => (Math.abs(Math.cos(a)) ** 1.3 + Math.abs(Math.sin(a)) ** 1.3) ** (-1 / 1.3) - 1
  const hang: Hang = { sag: (x, v) => 0.2 * Math.max(0, (Math.abs(x) - 0.4) / 0.2) ** 2 + 0.15 * Math.max(0, (v - 0.55) / 0.45) ** 2, drip: none }
  slab(c, 0, cy, rx, ry, 0.035, edge, hang, SMOOTH, F.cheese, F.cheeseSide, line)
  for (const [u, v, r] of CHEESE_HOLES) {
    const x = u * rx
    const y = cy + v * ry + hang.sag(x, v)
    fillOval(c, x, y, r, r * 0.55, F.cheeseHole)
    fillOval(c, x + r * 0.15, y + r * 0.12, r * 0.7, r * 0.35, F.cheeseSide)
  }
  shine(c, 0.025, -0.3, cy - 0.05, -0.16, cy - 0.095)
}

const salad: Layer = (c, line) => {
  const cy = topOf('salad')
  const rx = 0.6
  const ry = rx * SLANT
  // A leaf with frills all round, ruffling down over the layer below.
  const edge: Edge = (a) => 0.055 * Math.sin(9 * a) + 0.025 * Math.sin(17 * a + 1)
  const hang = dripping((x) => 0.035 + 0.03 * Math.sin(x * 26 + 0.5))
  slab(c, 0, cy, rx, ry, LAYER.salad * 0.6, edge, hang, 2 * SMOOTH, F.salad, F.saladSide, line)
  // Its rib and veins.
  c.beginPath()
  c.moveTo(-0.42, cy + 0.02)
  c.quadraticCurveTo(0, cy - 0.06, 0.42, cy + 0.01)
  strokeIt(c, F.saladVein, 0.03)
  for (const x of [-0.28, -0.05, 0.18]) {
    strokeLine(c, F.saladVein, 0.02, x, cy - 0.015, x + 0.08, cy - 0.11)
    strokeLine(c, F.saladVein, 0.02, x, cy - 0.01, x + 0.09, cy + 0.08)
  }
}

const tomato: Layer = (c, line) => {
  const cy = topOf('tomato')
  const rx = 0.47
  const ry = rx * SLANT
  slab(c, 0, cy, rx, ry, LAYER.tomato, round, level, SMOOTH, F.tomato, F.tomatoSide, line)
  fillOval(c, 0, cy, rx * 0.84, ry * 0.8, F.tomatoFlesh)
  // Four seed rooms round the core, each with its seeds, a little rounder than the slant would show so they read small.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const x = Math.cos(a) * rx * 0.47
    const y = cy + Math.sin(a) * ry * 0.5
    const tilt = Math.atan2(Math.sin(a) * ry, Math.cos(a) * rx)
    c.beginPath()
    c.ellipse(x, y, 0.1, 0.042, tilt, 0, TAU)
    c.fillStyle = F.tomatoJelly
    c.fill()
    for (const s of [-1, 0, 1]) fillOval(c, x + s * 0.042 * Math.cos(tilt), y + s * 0.042 * Math.sin(tilt), 0.015, 0.011, F.tomatoSeed)
  }
  shine(c, 0.025, -0.32, cy - 0.055, -0.18, cy - 0.095)
}

const egg: Layer = (c, line) => {
  const cy = topOf('egg')
  const rx = 0.56
  const ry = rx * SLANT
  // The white runs out unevenly and over the edge in two drips.
  const edge: Edge = (a) => 0.07 * Math.sin(3 * a + 0.6) + 0.045 * Math.sin(5 * a + 2.1) + 0.015 * Math.sin(9 * a)
  const hang = dripping((x) => 0.08 * tongue(x, 0.2, 0.05) + 0.05 * tongue(x, -0.3, 0.04))
  slab(c, 0, cy, rx, ry, 0.05, edge, hang, SMOOTH, F.egg, F.eggSide, line)
  // The yolk, a shiny dome a little left of the middle.
  const x = -0.05
  const y = cy - 0.03
  shaded(
    c,
    (k) => {
      k.beginPath()
      k.ellipse(x, y, 0.17, 0.115, 0, 0, TAU)
    },
    F.yolk,
    F.yolkShade,
    -0.03,
    -0.045,
    line,
  )
  shine(c, 0.03, x - 0.1, y - 0.01, x - 0.05, y - 0.065)
}

/** Round slices lying on the layer below at (u, v) of its top, back ones first, `r` wide and `th` thick, a little rounder than the slant would show so they read small. `inside` marks each cut face round its middle. */
function slices(c: CanvasRenderingContext2D, at: readonly (readonly [number, number])[], r: number, th: number, top: string, side: string, line: number, inside: (x: number, y: number) => void) {
  for (const [u, v] of at) {
    const x = u * RX
    const y = -RY + v * RY - th
    slab(c, x, y, r, r * 0.45, th, round, level, SMOOTH, top, side, line)
    inside(x, y)
  }
}

const PICKLES = [
  [-0.5, -0.55],
  [0.1, -0.65],
  [0.6, -0.3],
  [-0.68, 0.45],
  [-0.12, 0.6],
  [0.45, 0.75],
] as const

const pickle: Layer = (c, line) => {
  const r = 0.17
  slices(c, PICKLES, r, 0.035, F.pickle, F.pickleSide, line, (x, y) => {
    fillOval(c, x, y, r * 0.74, r * 0.74 * 0.45, F.pickleFlesh)
    // Its seeds in a ring.
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6 + 0.3
      fillOval(c, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4 * 0.45, 0.022, 0.014, F.pickleSeed)
    }
  })
}

const BANANAS = [
  [-0.45, -0.5],
  [0.2, -0.6],
  [0.62, -0.05],
  [-0.62, 0.5],
  [0.02, 0.62],
] as const

const banana: Layer = (c, line) => {
  const r = 0.2
  slices(c, BANANAS, r, 0.045, F.bananaRim, F.bananaSide, line, (x, y) => {
    fillOval(c, x, y, r * 0.8, r * 0.8 * 0.45, F.banana)
    // Its little dark seeds round the middle.
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 - Math.PI / 2
      fillOval(c, x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16 * 0.45, 0.016, 0.011, F.bananaSeed)
    }
  })
}

/** Onion rings lying on the layer below at (u, v) of its top, back ones first, each `r` wide. */
const RINGS = [
  [-0.4, -0.35, 0.2],
  [0.3, -0.45, 0.22],
  [-0.1, 0.4, 0.22],
  [0.5, 0.6, 0.16],
] as const

const onion: Layer = (c, line) => {
  const band = 0.06
  for (const [u, v, r] of RINGS) {
    const x = u * RX
    const y = -RY + v * RY - 0.03
    // The ring's cut side a little lower, then its top: each a band with ink on both edges.
    for (const [dy, colour] of [
      [0.03, F.onionSide],
      [0, F.onion],
    ] as const) {
      c.beginPath()
      c.ellipse(x, y + dy, r, r * 0.42, 0, 0, TAU)
      strokeIt(c, INK, band + 2 * line * DETAIL)
      strokeIt(c, colour, band)
    }
    // A red onion's white skin inside the ring.
    c.beginPath()
    c.ellipse(x, y, r - 0.012, (r - 0.012) * 0.42, 0, 0, TAU)
    strokeIt(c, F.onionLight, 0.014)
  }
}

/**
 * A sauce spread on the layer below and dripping down its front, each drip at x0, `len`
 * long and about `w` wide (uneven, so they read as drips and not as legs): its top in
 * `top`, its edge and drips in `side`, a gloss on the longest drip. Gives its top's middle
 * height, for what goes on it.
 */
function sauce(c: CanvasRenderingContext2D, kind: Food, rx: number, drips: readonly (readonly [number, number, number])[], top: string, side: string, line: number) {
  const cy = topOf(kind)
  const ry = rx * SLANT
  const edge: Edge = (a) => 0.035 * Math.sin(5 * a + 1) + 0.02 * Math.sin(8 * a)
  const hang = dripping((x) => drips.reduce((s, [x0, len, w]) => s + len * tongue(x, x0, w), 0))
  slab(c, 0, cy, rx, ry, LAYER[kind], edge, hang, FINE, top, side, line)
  const [x0, len] = drips.reduce((a, b) => (b[1] > a[1] ? b : a))
  const front = cy + ry * Math.sqrt(Math.max(0, 1 - (x0 / rx) ** 2)) + LAYER[kind]
  fillOval(c, x0 - 0.008, front + len - 0.035, 0.012, 0.018, C.shine)
  return cy
}

const KETCHUP_DRIPS = [
  [-0.3, 0.06, 0.028],
  [-0.12, 0.14, 0.034],
  [0.08, 0.05, 0.024],
  [0.25, 0.1, 0.03],
] as const

const ketchup: Layer = (c, line) => {
  const rx = 0.46
  const cy = sauce(c, 'ketchup', rx, KETCHUP_DRIPS, F.ketchup, F.ketchupSide, line)
  // The squiggle it was squeezed in: a loopy rope along the top.
  const pts: number[] = []
  for (let i = 0; i <= 64; i++) {
    const s = i / 64
    pts.push((-0.72 + 1.44 * s + 0.11 * Math.cos(TAU * 3.5 * s)) * rx, cy - 0.5 * Math.sin(TAU * 3.5 * s) * rx * SLANT)
  }
  for (const [w, colour] of [
    [0.07 + 2 * line * DETAIL, INK],
    [0.07, F.ketchup],
    [0.018, F.ketchupLight],
  ] as const) {
    smoothPath(c, pts)
    strokeIt(c, colour, w)
  }
  shine(c, 0.02, -0.3, cy - 0.07, -0.22, cy - 0.09)
}

const CHOCOLATE_DRIPS = [
  [-0.33, 0.11, 0.032],
  [-0.16, 0.05, 0.026],
  [0.04, 0.09, 0.034],
  [0.24, 0.15, 0.036],
  [0.37, 0.05, 0.024],
] as const

const chocolate: Layer = (c, line) => {
  const rx = 0.47
  const cy = sauce(c, 'chocolate', rx, CHOCOLATE_DRIPS, F.chocolate, F.chocolateSide, line)
  // The swirl the knife left, and the gloss.
  const pts: number[] = []
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU * 1.6
    const r = 0.04 + 0.11 * (i / 40)
    pts.push(Math.cos(a) * r * 2, cy + Math.sin(a) * r * SLANT * 2)
  }
  smoothPath(c, pts)
  strokeIt(c, F.chocolateLight, 0.022)
  shine(c, 0.03, -0.34, cy - 0.04, -0.2, cy - 0.095)
}

const JAM_DRIPS = [
  [-0.27, 0.08, 0.03],
  [-0.06, 0.15, 0.038],
  [0.18, 0.05, 0.026],
  [0.33, 0.1, 0.03],
] as const
const JAM_BITS = [
  [-0.12, -0.06, 0.06],
  [0.15, 0.02, 0.07],
  [0.3, -0.07, 0.045],
  [-0.3, 0.05, 0.05],
] as const

const jam: Layer = (c, line) => {
  const rx = 0.46
  const cy = sauce(c, 'jam', rx, JAM_DRIPS, F.jam, F.jamSide, line)
  // Bits of fruit in it, each with a seed, and a big gloss.
  for (const [x, y, r] of JAM_BITS) {
    fillOval(c, x, cy + y, r, r * 0.55, F.jamBit)
    fillOval(c, x + r * 0.2, cy + y - r * 0.1, 0.012, 0.009, F.strawberrySeed)
  }
  shine(c, 0.03, -0.32, cy - 0.03, -0.24, cy - 0.08, -0.1, cy - 0.11)
}

const cream: Layer = (c, line) => {
  const cy = topOf('cream')
  const rx = 0.45
  const ry = rx * SLANT
  // Piped in puffs: the rim bulges at each one, and a soft peak curls up in the middle.
  const edge: Edge = (a) => 0.07 * Math.abs(Math.sin(5 * a)) - 0.03
  const hang = dripping((x) => 0.03 * Math.abs(Math.sin(x * 15)))
  slab(c, 0, cy, rx, ry, LAYER.cream, edge, hang, SMOOTH, F.cream, F.creamShade, line)
  shaded(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-0.22, cy + 0.03)
      k.quadraticCurveTo(-0.25, cy - 0.09, -0.08, cy - 0.13)
      k.quadraticCurveTo(0.03, cy - 0.16, 0.0, cy - 0.25)
      k.quadraticCurveTo(0.13, cy - 0.18, 0.17, cy - 0.09)
      k.quadraticCurveTo(0.26, cy - 0.04, 0.2, cy + 0.03)
      k.quadraticCurveTo(0, cy + 0.08, -0.22, cy + 0.03)
      k.closePath()
    },
    F.cream,
    F.creamShade,
    -0.03,
    -0.035,
    line,
  )
  // The fold of the swirl.
  c.beginPath()
  c.moveTo(-0.15, cy - 0.02)
  c.quadraticCurveTo(0.02, cy - 0.1, 0.15, cy - 0.04)
  strokeIt(c, INK, line * DETAIL)
}

/** A strawberry half lying cut side up, (x, y) the middle of its cut face, `s` its length: red with a pale heart, seeds round the rim and its leaves at the top. */
function strawberryHalf(c: CanvasRenderingContext2D, x: number, y: number, s: number, line: number) {
  const trace = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.moveTo(x, y - 0.4 * s)
    k.bezierCurveTo(x + 0.35 * s, y - 0.6 * s, x + 0.62 * s, y - 0.2 * s, x + 0.4 * s, y + 0.18 * s)
    k.quadraticCurveTo(x + 0.22 * s, y + 0.48 * s, x, y + 0.55 * s)
    k.quadraticCurveTo(x - 0.22 * s, y + 0.48 * s, x - 0.4 * s, y + 0.18 * s)
    k.bezierCurveTo(x - 0.62 * s, y - 0.2 * s, x - 0.35 * s, y - 0.6 * s, x, y - 0.4 * s)
    k.closePath()
  }
  /** The same outline shrunk toward its middle: the pale flesh and the white heart inside the red. */
  const inner = (k: number, fill: string) => {
    c.save()
    c.translate(x, y + 0.04 * s)
    c.scale(k, k)
    c.translate(-x, -y)
    trace(c)
    c.fillStyle = fill
    c.fill()
    c.restore()
  }
  // Leaves first, peeking out behind the top.
  for (const a of [-1, 0, 1]) inkLeaf(c, x + Math.sin(a) * 0.2 * s, y - 0.48 * s - Math.cos(a) * 0.1 * s, 0.17 * s, 0.07 * s, a * 0.7 + (a === 0 ? Math.PI / 2 : 0), line * DETAIL)
  c.save()
  c.translate(0, 0.07 * s)
  inked(c, trace, F.strawberrySide, line)
  c.restore()
  inked(c, trace, F.strawberry, line)
  inner(0.72, F.strawberryFlesh)
  inner(0.36, F.strawberryCore)
  for (const [u, v] of [
    [-0.3, -0.1],
    [0.32, -0.12],
    [-0.22, 0.25],
    [0.24, 0.24],
    [0, 0.45],
  ] as const)
    fillOval(c, x + u * s, y + v * s, 0.014, 0.01, F.strawberrySeed)
  shine(c, 0.022, x - 0.3 * s, y - 0.05 * s, x - 0.22 * s, y - 0.28 * s)
}

/** A green leaf: an inked oval `rx` long and `ry` wide at (x, y), turned by `tilt`. */
function inkLeaf(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, tilt: number, line: number) {
  inked(
    c,
    (k) => {
      k.beginPath()
      k.ellipse(x, y, rx, ry, tilt, 0, TAU)
    },
    F.leaf,
    line,
  )
}

const strawberry: Layer = (c, line) => {
  strawberryHalf(c, -0.27, -0.22, 0.36, line)
  strawberryHalf(c, 0.29, -0.23, 0.36, line)
  strawberryHalf(c, 0.01, -0.13, 0.38, line)
}

const ham: Layer = (c, line) => {
  const cy = topOf('ham')
  const rx = 0.56
  const ry = rx * SLANT
  // A wavy slice with soft folds where it hangs over, a pale rim of fat round the pink.
  const edge: Edge = (a) => 0.03 * Math.sin(6 * a + 0.4) + 0.015 * Math.sin(11 * a)
  const hang = dripping((x) => 0.045 * (0.5 + 0.5 * Math.cos(x * 10)))
  slab(c, 0, cy, rx, ry, 0.035, edge, hang, SMOOTH, F.hamFat, F.hamSide, line)
  topPath(c, 0, cy + 0.004, rx * 0.86, ry * 0.8, edge, level, SMOOTH)
  c.fillStyle = F.ham
  c.fill()
  strokeLine(c, F.hamFat, 0.018, -0.3, cy - 0.02, -0.18, cy - 0.06, -0.05, cy - 0.04)
  strokeLine(c, F.hamFat, 0.018, 0.08, cy + 0.06, 0.2, cy + 0.03, 0.3, cy + 0.05)
  shine(c, 0.022, -0.36, cy - 0.04, -0.26, cy - 0.08)
}

/** Blueberries lying on the layer below at (u, v) of its top, back ones first. */
const BERRIES = [
  [-0.5, -0.65],
  [0.02, -0.8],
  [0.5, -0.6],
  [-0.8, 0.1],
  [0.82, 0.15],
  [-0.38, 0.75],
  [0.12, 0.9],
  [0.58, 0.72],
] as const
const BERRY_R = 0.1

/** A blueberry: a dark blue ball with the little star of its flower on top and a shine. */
function berry(c: CanvasRenderingContext2D, x: number, y: number, r: number, line: number) {
  shaded(
    c,
    (k) => {
      k.beginPath()
      k.arc(x, y, r, 0, TAU)
    },
    F.blueberry,
    F.blueberryShade,
    -r * 0.22,
    -r * 0.3,
    line,
  )
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const k = i % 2 === 0 ? r * 0.3 : r * 0.12
    c.lineTo(x + r * 0.15 + Math.cos(a) * k, y - r * 0.5 + Math.sin(a) * k * 0.6)
  }
  c.closePath()
  c.fillStyle = F.blueberryCrown
  c.fill()
  fillOval(c, x - r * 0.45, y - r * 0.15, r * 0.16, r * 0.12, C.shine)
}

const blueberry: Layer = (c, line) => {
  for (const [u, v] of BERRIES) berry(c, u * RX * 0.92, -RY + v * RY - BERRY_R * 0.9, BERRY_R, line)
}

// ---------------------------------------------------------------------------------------
// The poop

/** The poop's soft-serve tiers, bottom first: middle height, half width, half height. */
const TIERS = [
  [-0.1, 0.32, 0.11],
  [-0.2, 0.23, 0.085],
  [-0.29, 0.14, 0.065],
] as const

const poop: Layer = (c, line) => {
  for (const [y, rx, ry] of TIERS) {
    shaded(
      c,
      (k) => {
        k.beginPath()
        k.ellipse(0, y, rx, ry, 0, 0, TAU)
      },
      F.poop,
      F.poopShade,
      -rx * 0.12,
      -ry * 0.45,
      line,
    )
    shine(c, 0.022, -rx * 0.62, y - ry * 0.15, -rx * 0.38, y - ry * 0.55)
  }
  // The tip, curling over to one side.
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-0.08, -0.32)
      k.quadraticCurveTo(-0.07, -0.42, 0.03, -0.45)
      k.quadraticCurveTo(0.1, -0.46, 0.08, -0.4)
      k.quadraticCurveTo(0.03, -0.37, 0.08, -0.31)
      k.closePath()
    },
    F.poop,
    line,
  )
}

/** The flies: seconds a loop, where on it at time 0, its half width and half height, and its height over the poop's origin. */
const FLIES = [
  [1.7, 0, 0.42, 0.06, -0.3],
  [2.3, 0.4, 0.34, 0.08, -0.44],
] as const

/** Two flies buzzing round a poop at (x, y) on figure-of-eight loops, each with a fading trail, and (with `stink`) its smell rising in wavy green lines. */
function buzz(c: CanvasRenderingContext2D, x: number, y: number, t: number, stink: boolean) {
  if (stink) {
    for (let i = 0; i < 3; i++) {
      const u = (t / 2.1 + i / 3) % 1
      const lx = x + (i - 1) * 0.15
      const ly = y - 0.4 - 0.3 * u
      const pts: number[] = []
      for (let j = 0; j <= 6; j++) pts.push(lx + 0.03 * Math.sin(j * 1.5 + i * 2), ly - j * 0.032)
      c.save()
      c.globalAlpha *= Math.sin(Math.PI * u)
      smoothPath(c, pts)
      strokeIt(c, F.stink, 0.03)
      c.restore()
    }
  }
  for (const [period, phase, wx, wy, dy] of FLIES) {
    const at = (a: number) => [x + wx * Math.sin(a), y + dy + wy * Math.sin(2 * a)] as const
    const a = TAU * (t / period + phase)
    for (let k = 1; k <= 3; k++) {
      const [tx, ty] = at(a - k * 0.25)
      c.save()
      c.globalAlpha *= 0.55 - k * 0.15
      fillOval(c, tx, ty, 0.012, 0.012, F.fly)
      c.restore()
    }
    const [fx, fy] = at(a)
    inkOval(c, fx - 0.024, fy - 0.036, 0.032, 0.02, F.wing, LINE_DETAIL)
    inkOval(c, fx + 0.024, fy - 0.036, 0.032, 0.02, F.wing, LINE_DETAIL)
    fillOval(c, fx, fy, 0.04, 0.032, F.fly)
  }
}

// ---------------------------------------------------------------------------------------
// The breads

const bunBottom: Layer = (c, line) => {
  const h = LAYER.bunBottom
  const cy = -RY - h
  // The crust rounds in at the bottom corners; its baked bottom is darker and the top of its side catches the light.
  const hang = dripping((x) => -0.07 * (x / RX) ** 8)
  slabPath(c, 0, cy, RX, RY, h, round, hang, SMOOTH)
  c.fillStyle = F.bun
  c.fill()
  c.save()
  c.clip()
  c.beginPath()
  c.ellipse(0, -RY, RX, RY, 0, 0, Math.PI)
  strokeIt(c, F.bunDark, 0.11)
  c.beginPath()
  c.ellipse(0, cy + 0.045, RX, RY, 0, 0.12 * Math.PI, 0.88 * Math.PI)
  strokeIt(c, F.bunLight, 0.03)
  c.restore()
  slabPath(c, 0, cy, RX, RY, h, round, hang, SMOOTH)
  strokeIt(c, INK, line)
  // The cut face: soft crumb inside a rim of crust.
  inked(c, (k) => topPath(k, 0, cy, RX, RY, round, level, SMOOTH), F.crumbEdge, line * DETAIL)
  fillOval(c, 0, cy + 0.008, RX * 0.88, RY * 0.78, F.crumb)
}

/** Sesame seeds on the bun's dome: x, how far under the top, and tilt. */
const SESAME = [
  [-0.3, 0.1, 0.5],
  [-0.08, 0.06, -0.3],
  [0.16, 0.07, 0.4],
  [0.34, 0.16, 1.1],
  [-0.38, 0.26, -0.7],
  [-0.17, 0.2, 0.2],
  [0.07, 0.19, -0.6],
  [0.27, 0.3, 0.3],
  [-0.03, 0.33, 0.9],
] as const

const bunTop: Layer = (c, line) => {
  const rx = RX * 1.03
  const base = -RY
  const top = -LAYER.bunTop - 2 * RY
  const dome = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.moveTo(-rx, base)
    k.bezierCurveTo(-rx, top + 0.12, -rx * 0.55, top, 0, top)
    k.bezierCurveTo(rx * 0.55, top, rx, top + 0.12, rx, base)
    k.ellipse(0, base, rx, RY * 1.03, 0, 0, Math.PI)
    k.closePath()
  }
  shaded(c, dome, F.bun, F.bunDark, -0.05, -0.09, line)
  fillOval(c, -0.12, top + 0.15, 0.26, 0.09, F.bunLight)
  for (const [x, d, tilt] of SESAME) {
    c.beginPath()
    c.ellipse(x + 0.006, top + d + 0.01, 0.034, 0.018, tilt, 0, TAU)
    c.fillStyle = F.bunDark
    c.fill()
    c.beginPath()
    c.ellipse(x, top + d, 0.034, 0.018, tilt, 0, TAU)
    c.fillStyle = F.sesame
    c.fill()
  }
  shine(c, 0.035, -0.4, top + 0.2, -0.3, top + 0.08)
}

/** A croissant half's horns: their tips' x either side and height (a little under the layer's bottom, curling down over the layer below), and where each meets the body. */
const HORN = { x: 0.7, y: 0.12, base: 0.47 } as const

/** Strokes the lines where a croissant's rolls meet, clipped to its outline so they end on it: each from (x0, y0) bending by (cx, cy) to (x1, y1). */
function rolls(c: CanvasRenderingContext2D, outline: (k: CanvasRenderingContext2D) => void, lines: readonly (readonly number[])[], line: number) {
  c.save()
  outline(c)
  c.clip()
  for (const [x0, y0, cx, cy, x1, y1] of lines) {
    c.beginPath()
    c.moveTo(x0!, y0!)
    c.quadraticCurveTo(cx!, cy!, x1!, y1!)
    strokeIt(c, INK, line * DETAIL)
  }
  c.restore()
}

const BOTTOM_ROLLS = [
  [-0.47, -0.3, -0.52, -0.1, -0.45, 0.12],
  [-0.17, -0.3, -0.2, -0.12, -0.15, 0.12],
  [0.17, -0.3, 0.2, -0.12, 0.15, 0.12],
  [0.47, -0.3, 0.52, -0.1, 0.45, 0.12],
] as const

const croissantBottom: Layer = (c, line) => {
  const h = LAYER.croissantBottom
  const back = -h - 0.11
  // The cut face is a flat crescent from horn to horn; under its front edge the crust rolls in segments, its bottom bulging at each.
  const backEdge = (k: CanvasRenderingContext2D) => {
    k.moveTo(-HORN.x, HORN.y)
    k.bezierCurveTo(-0.64, -0.18, -0.42, back, 0, back)
    k.bezierCurveTo(0.42, back, 0.64, -0.18, HORN.x, HORN.y)
  }
  const frontEdge = (k: CanvasRenderingContext2D) => {
    k.bezierCurveTo(0.62, -0.06, 0.42, -h, 0, -h)
    k.bezierCurveTo(-0.42, -h, -0.62, -0.06, -HORN.x, HORN.y)
  }
  const outline = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    backEdge(k)
    k.quadraticCurveTo(0.6, 0.05, HORN.base, 0.01)
    arch(k, HORN.base, 0.17, 0.01, 0.035)
    arch(k, 0.17, -0.17, 0.01, 0.04)
    arch(k, -0.17, -HORN.base, 0.01, 0.035)
    k.quadraticCurveTo(-0.6, 0.05, -HORN.x, HORN.y)
    k.closePath()
  }
  shaded(c, outline, F.croissant, F.croissantDark, 0, -0.05, line)
  // The light along the crust's top, under the cut.
  c.save()
  outline(c)
  c.clip()
  c.translate(0, 0.05)
  c.beginPath()
  c.moveTo(HORN.x, HORN.y)
  frontEdge(c)
  strokeIt(c, F.croissantLight, 0.035)
  c.restore()
  rolls(c, outline, BOTTOM_ROLLS, line)
  inked(
    c,
    (k) => {
      k.beginPath()
      backEdge(k)
      frontEdge(k)
      k.closePath()
    },
    F.croissantCrumb,
    line * DETAIL,
  )
  // The flaky layers in the cut.
  for (const m of [0.35, 0.7]) {
    const y = -h + (back + h) * m
    c.beginPath()
    c.moveTo(-0.5, y + 0.07)
    c.quadraticCurveTo(0, y - 0.02, 0.5, y + 0.07)
    strokeIt(c, F.croissantFlake, 0.018)
  }
}

const TOP_ROLLS = [
  [-0.47, -0.32, -0.52, -0.12, -0.44, 0.06],
  [-0.24, -0.52, -0.3, -0.2, -0.2, 0.06],
  [0.24, -0.52, 0.3, -0.2, 0.2, 0.06],
  [0.47, -0.32, 0.52, -0.12, 0.44, 0.06],
] as const

const croissantTop: Layer = (c, line) => {
  const top = -LAYER.croissantTop - 2 * RY
  const outline = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    // Up the left horn's back to the first dip, over the three rolls (the middle one the biggest), down the right horn to its tip, and back along the bottom.
    k.moveTo(-HORN.x, HORN.y)
    k.quadraticCurveTo(-0.7, -0.17, -0.47, -0.27)
    arch(k, -0.47, -0.24, -0.44, -0.52)
    arch(k, -0.24, 0.24, -0.44, top)
    arch(k, 0.24, 0.47, -0.27, -0.52)
    k.quadraticCurveTo(0.7, -0.17, HORN.x, HORN.y)
    k.quadraticCurveTo(0.6, 0.03, HORN.base, 0.005)
    arch(k, HORN.base, -HORN.base, 0.005, 0.015)
    k.quadraticCurveTo(-0.6, 0.03, -HORN.x, HORN.y)
    k.closePath()
  }
  shaded(c, outline, F.croissant, F.croissantDark, -0.03, -0.08, line)
  rolls(c, outline, TOP_ROLLS, line)
  // The light on each roll's top, and the gloss of the egg wash.
  strokeLine(c, F.croissantLight, 0.05, -0.12, top + 0.075, 0.08, top + 0.065)
  for (const s of [-1, 1]) {
    strokeLine(c, F.croissantLight, 0.035, s * 0.3, -0.5, s * 0.41, -0.46)
    strokeLine(c, F.croissantLight, 0.03, s * 0.56, -0.22, s * 0.62, -0.14)
  }
  shine(c, 0.035, -0.17, top + 0.12, -0.05, top + 0.07)
}

// ---------------------------------------------------------------------------------------
// One layer, and the foods on the course

const LAYERS: Record<Food, Layer> = {
  patty,
  cheese,
  salad,
  tomato,
  egg,
  pickle,
  onion,
  ketchup,
  chocolate,
  jam,
  banana,
  cream,
  strawberry,
  ham,
  blueberry,
  poop,
  bunBottom,
  bunTop,
  croissantBottom,
  croissantTop,
}

/** One layer of `kind` seen from the slant, its origin at the bottom of its front; a poop's flies buzz round it on time `t`. */
export function drawFood(ctx: CanvasRenderingContext2D, kind: Food, t: number) {
  LAYERS[kind](ctx, LINE)
  if (kind === 'poop') buzz(ctx, 0, 0, t, true)
}

/** The ketchup on the course: a red squeeze bottle with a white cap and a tomato on its label. */
function ketchupBottle(c: CanvasRenderingContext2D) {
  const body = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.moveTo(-0.15, -0.36)
    k.lineTo(-0.15, -0.03)
    k.quadraticCurveTo(-0.15, 0.02, -0.09, 0.02)
    k.lineTo(0.09, 0.02)
    k.quadraticCurveTo(0.15, 0.02, 0.15, -0.03)
    k.lineTo(0.15, -0.36)
    k.quadraticCurveTo(0.15, -0.47, 0.07, -0.48)
    k.lineTo(-0.07, -0.48)
    k.quadraticCurveTo(-0.15, -0.47, -0.15, -0.36)
    k.closePath()
  }
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-0.035, -0.54)
      k.lineTo(-0.015, -0.63)
      k.lineTo(0.015, -0.63)
      k.lineTo(0.035, -0.54)
      k.closePath()
    },
    F.bottleCap,
    LINE,
  )
  inked(c, (k) => roundRectPath(k, -0.09, -0.56, 0.18, 0.1, 0.03), F.bottleCap, LINE)
  shaded(c, body, F.ketchup, F.ketchupSide, -0.05, 0, LINE)
  c.save()
  body(c)
  c.clip()
  c.fillStyle = F.label
  c.fillRect(-0.2, -0.32, 0.4, 0.16)
  c.restore()
  body(c)
  strokeIt(c, INK, LINE)
  inkOval(c, 0, -0.235, 0.05, 0.045, F.tomato, LINE_DETAIL)
  fillOval(c, 0, -0.275, 0.028, 0.012, F.leaf)
  shine(c, 0.03, -0.1, -0.38, -0.1, -0.08)
}

/** A glass jar of something to spread, its colour showing through: jam wears a red gingham lid; the chocolate stands open with a spoon in it. */
function spreadJar(c: CanvasRenderingContext2D, fill: string, side: string, open: boolean) {
  const w = 0.19
  const h = 0.36
  const glass = (k: CanvasRenderingContext2D) => roundRectPath(k, -w, -h, 2 * w, h + 0.02, 0.07)
  if (open) {
    // The spoon's handle, behind the rim.
    strokeLine(c, INK, 0.06 + 2 * LINE, 0.02, -h + 0.05, 0.16, -h - 0.17)
    strokeLine(c, F.spoon, 0.06, 0.02, -h + 0.05, 0.16, -h - 0.17)
  }
  inked(c, glass, F.glass, LINE)
  c.save()
  glass(c)
  c.clip()
  c.fillStyle = fill
  c.fillRect(-w, -h + 0.06, 2 * w, h)
  c.fillStyle = side
  c.fillRect(w * 0.45, -h + 0.06, w, h)
  c.restore()
  glass(c)
  strokeIt(c, INK, LINE)
  if (open) {
    inkOval(c, 0, -h + 0.03, w - 0.02, 0.05, fill, LINE_DETAIL)
    shine(c, 0.025, -0.1, -h + 0.02, -0.03, -h + 0.005)
  } else {
    const lid = (k: CanvasRenderingContext2D) => roundRectPath(k, -w - 0.025, -h - 0.08, 2 * w + 0.05, 0.11, 0.035)
    lid(c)
    c.fillStyle = F.lidRed
    c.fill()
    c.save()
    c.clip()
    c.globalAlpha *= 0.5
    c.fillStyle = C.white
    for (let x = -w; x < w + 0.03; x += 0.08) c.fillRect(x, -h - 0.09, 0.04, 0.13)
    c.fillRect(-w - 0.03, -h - 0.04, 2 * w + 0.06, 0.035)
    c.restore()
    lid(c)
    strokeIt(c, INK, LINE)
  }
  shine(c, 0.03, -w + 0.06, -h + 0.1, -w + 0.06, -0.08)
}

/** The sauces lie on the course in what they come in; every other food as its layer, smaller. */
const CONTAINED: Partial<Record<Edible, (c: CanvasRenderingContext2D) => void>> = {
  ketchup: ketchupBottle,
  chocolate: (c) => spreadJar(c, F.chocolate, F.chocolateSide, true),
  jam: (c) => spreadJar(c, F.jam, F.jamSide, false),
}
/** A layer lies on the course this much of its size. */
const GROUND = 0.75
/** Seconds for one hop of a food waiting on the course. */
const BOB = 1.6

/**
 * A food or poop lying on the course, its origin at the ground point under it, with its own
 * small shadow. A food bobs gently (BOB seconds a round, `phase` 0 to 1 along it) to say
 * "pick me up"; a poop just sits there with its flies.
 */
export function drawGroundFood(ctx: CanvasRenderingContext2D, kind: Edible, t: number, phase: number) {
  const up = kind === 'poop' ? 0 : 0.02 + 0.07 * (0.5 - 0.5 * Math.cos(TAU * (t / BOB + phase)))
  groundShadow(ctx, 0.3 - up, 0.1 - up * 0.3)
  ctx.save()
  ctx.translate(0, -up)
  const own = CONTAINED[kind]
  if (own) own(ctx)
  else if (kind === 'poop') poop(ctx, LINE)
  else {
    // Its bottom oval's middle on the ground point, its ink the house width at the smaller size.
    ctx.translate(0, RY * GROUND)
    ctx.scale(GROUND, GROUND)
    LAYERS[kind](ctx, LINE / GROUND)
  }
  ctx.restore()
  if (kind === 'poop') buzz(ctx, 0, 0, t, true)
}

// ---------------------------------------------------------------------------------------
// The plate and the pile

/** The plate: its rim's half width and depth, how far its rim's front stands over its foot's, and its foot's half width. */
const PLATE_RX = 0.625
const PLATE_RY = PLATE_RX * SLANT
const PLATE_H = 0.12
const PLATE_FOOT = 0.4
/** The middle of the plate's top, and of the well sunk in it where the pile stands. */
const PLATE_MID = -PLATE_H - PLATE_RY
const WELL = PLATE_MID + 0.015
/** How high over the plate's origin the pile's first layer has its origin: that layer's bottom oval lies on the well. */
const FLOOR = -WELL - RY
/** The layers of a pile are inked thinner than a food on its own: in a tall pile every layer's outline would hide the thin ones between. */
const PILE_LINE = LINE_DETAIL

/** The plate: white, with a blue line round its rim and a shaded underside narrowing to its foot. */
function plate(c: CanvasRenderingContext2D) {
  const footRy = PLATE_FOOT * SLANT
  inked(
    c,
    (k) => {
      k.beginPath()
      k.moveTo(-PLATE_RX, PLATE_MID)
      k.quadraticCurveTo(-PLATE_RX + 0.04, PLATE_MID + 0.11, -PLATE_FOOT, -footRy)
      k.ellipse(0, -footRy, PLATE_FOOT, footRy, 0, Math.PI, 0, true)
      k.quadraticCurveTo(PLATE_RX - 0.04, PLATE_MID + 0.11, PLATE_RX, PLATE_MID)
      k.ellipse(0, PLATE_MID, PLATE_RX, PLATE_RY, 0, 0, Math.PI)
      k.closePath()
    },
    F.plateSide,
    LINE,
  )
  inkOval(c, 0, PLATE_MID, PLATE_RX, PLATE_RY, F.plate, LINE)
  c.beginPath()
  c.ellipse(0, PLATE_MID, PLATE_RX * 0.9, PLATE_RY * 0.86, 0, 0, TAU)
  strokeIt(c, F.plateLine, 0.022)
  fillOval(c, 0, WELL, PLATE_RX * 0.7, PLATE_RY * 0.64, F.plateWell)
  c.beginPath()
  c.ellipse(0, WELL, PLATE_RX * 0.7, PLATE_RY * 0.64, 0, Math.PI, TAU)
  strokeIt(c, F.plateSide, LINE_DETAIL)
}

/** Every layer's LAYER added up. */
const stack = (pile: readonly Food[]) => pile.reduce((s, kind) => s + LAYER[kind], 0)

/** A pile thinner than this bends as if it were this thick, so a few layers lean only a little. */
const BEND_MIN = 0.6

/**
 * Where the layer `s` up a pile `total` thick sits when the pile leans by `lean` radians:
 * the pile bends like a wobbly tower, each layer further over the higher it is (the plate
 * stays put, the top is `lean` off upright as seen from the plate), and each layer tilts
 * half as much as the tower does there.
 */
function bend(s: number, total: number, lean: number) {
  const k = Math.tan(lean) / Math.max(total, BEND_MIN)
  return { x: k * s * s, y: -FLOOR - s, tilt: 0.5 * Math.atan(2 * k * s) }
}

/** Where layer `i` of a pile leaning by `lean` sits: its origin from the plate's, and its tilt. Layer pile.length is where the next food lands. */
export function pileLayer(pile: readonly Food[], i: number, lean: number) {
  return bend(stack(pile.slice(0, i)), stack(pile), lean)
}

/** The height from the plate's bottom to the top of the last layer, standing upright (to the rim's back for an empty plate). */
export function pileHeight(pile: readonly Food[]) {
  return pile.length === 0 ? PLATE_H + 2 * PLATE_RY : FLOOR + stack(pile) + 2 * RY
}

/**
 * The plate and the pile on it, the plate's origin at its bottom middle: the layers bottom
 * first, bending over by `lean` radians (-0.45 to 0.45), then the flies round every poop in
 * it (the top one's smell rising too).
 */
export function drawPile(ctx: CanvasRenderingContext2D, pile: readonly Food[], lean: number, t: number) {
  plate(ctx)
  const total = stack(pile)
  const poops: { x: number; y: number }[] = []
  let s = 0
  for (const kind of pile) {
    const at = bend(s, total, lean)
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.rotate(at.tilt)
    LAYERS[kind](ctx, PILE_LINE)
    ctx.restore()
    if (kind === 'poop') poops.push(at)
    s += LAYER[kind]
  }
  poops.forEach((p, i) => buzz(ctx, p.x, p.y, t + i * 0.7, i === poops.length - 1 && pile[pile.length - 1] === 'poop'))
}

// ---------------------------------------------------------------------------------------
// The sheet

const EDIBLES: readonly Edible[] = [...ALL_FILLINGS, 'poop']
const BURGER: readonly Food[] = ['bunBottom', 'patty', 'cheese', 'salad', 'bunTop']
const CROISSANT_DISH: readonly Food[] = ['croissantBottom', 'chocolate', 'banana', 'croissantTop']
const TALL: readonly Food[] = ['bunBottom', 'patty', 'cheese', 'salad', 'tomato', 'egg', 'pickle', 'onion', 'ketchup', 'ham', 'banana', 'cream', 'strawberry', 'bunTop']
const POOPY: readonly Food[] = ['bunBottom', 'patty', 'salad', 'poop']

const LAYER_BOX = { x: -0.75, y: -0.8, w: 1.5, h: 1.05 }
const GROUND_BOX = { x: -0.5, y: -0.8, w: 1.0, h: 0.95 }
const DISH_BOX = { x: -0.8, y: -1.45, w: 1.6, h: 1.55 }
const TALL_BOX = { x: -1.25, y: -2.3, w: 2.5, h: 2.4 }

export const SHEET: SheetEntry[] = [
  ...ALL_FOODS.map((kind) => ({ label: kind, box: LAYER_BOX, draw: (c: CanvasRenderingContext2D, t: number) => drawFood(c, kind, t) })),
  ...EDIBLES.map((kind, i) => ({ label: `${kind} on the ground`, box: GROUND_BOX, draw: (c: CanvasRenderingContext2D, t: number) => drawGroundFood(c, kind, t, i / EDIBLES.length) })),
  { label: 'burger', box: DISH_BOX, draw: (c, t) => drawPile(c, BURGER, 0, t) },
  { label: 'croissant with chocolate and banana', box: DISH_BOX, draw: (c, t) => drawPile(c, CROISSANT_DISH, 0, t) },
  ...[0, -0.3, 0.3].map((lean) => ({ label: `tall pile leaning ${lean}`, box: TALL_BOX, draw: (c: CanvasRenderingContext2D, t: number) => drawPile(c, TALL, lean, t) })),
  { label: 'a pile of 22 leaning all the way', box: { x: -1.2, y: -3.0, w: 3.0, h: 3.1 }, draw: (c, t) => drawPile(c, [...TALL, ...TALL.slice(1, 9)], 0.45, t) },
  { label: 'poop on top', box: DISH_BOX, draw: (c, t) => drawPile(c, POOPY, 0, t) },
  { label: 'empty plate', box: { x: -0.75, y: -0.65, w: 1.5, h: 0.75 }, draw: (c, t) => drawPile(c, [], 0, t) },
]
