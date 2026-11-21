import { SOLID, groundAt, type Course, type CourseId, type Ground } from '../game/model'
import { C, INK, LINE, LINE_BIG, LINE_DETAIL, band, blob, circlesPath, hash, inkOval, inked, lw, roundRectPath, shine, TAU, tube, type SheetEntry } from './look'

/**
 * The five places: their flat ground, tile by tile, and their solid tiles. The ground is
 * print seen from above (look.ts rule 2, no ink): grass with tufts, sandy (or cobbled)
 * paths whose edges soften into the grass, flower beds, turquoise water sunk below the
 * land with an earth bank and a light shore, and plank bridges from bank to bank. The
 * renderer bakes it, so it may be detailed, and every bit of it comes from a hash of the
 * tile, never from chance. What moves on the water (drawWaterShine) is drawn every frame
 * over the bake. The solid tiles stand up (rule 1), each place in its own style: the
 * park's round bushes, apple trees and boulders; the pond's reeds, weeping willow and
 * mossy stones; the garden's trimmed hedges, topiary and flower urns; the farm's fence,
 * oak and hay bales; the castle's wall, pine and stone blocks.
 */

/** A place's ground colours. */
export interface Land {
  grass: string
  grassLight: string
  grassDark: string
  path: string
  pathEdge: string
  pebble: string
  /** Cobbles and the gaps between them, for a cobbled path (the castle's); null for a sandy one. */
  cobble: string | null
  water: string
  waterShade: string
  shore: string
  bank: string
  bankDark: string
  petals: readonly string[]
  petalMiddle: string
  leaf: string
  plank: string
  plankShade: string
  plankGap: string
}

export const LAND: Record<CourseId, Land> = {
  park: {
    grass: '#8ED36B',
    grassLight: '#A6E084',
    grassDark: '#76BE56',
    path: '#F3DCA6',
    pathEdge: '#E2C58D',
    pebble: '#D5B783',
    cobble: null,
    water: '#22A9C3',
    waterShade: '#1A8EA9',
    shore: '#A9EEEC',
    bank: '#B98A57',
    bankDark: '#8F653D',
    petals: ['#FFFFFF', '#FFE45C', '#FF9BC4'],
    petalMiddle: '#FFB627',
    leaf: '#5FAE48',
    plank: '#D49D5F',
    plankShade: '#AE7845',
    plankGap: '#7E5232',
  },
  pond: {
    grass: '#6FC58E',
    grassLight: '#8AD6A4',
    grassDark: '#58AD77',
    path: '#E8DAAC',
    pathEdge: '#D2C192',
    pebble: '#C6B484',
    cobble: null,
    water: '#1D9EBA',
    waterShade: '#16829D',
    shore: '#9EE8E8',
    bank: '#9C7F52',
    bankDark: '#76603C',
    petals: ['#C3AEFF', '#FFFFFF', '#86D6FF'],
    petalMiddle: '#FFD23F',
    leaf: '#4E9E67',
    plank: '#C9965E',
    plankShade: '#A47343',
    plankGap: '#73502F',
  },
  garden: {
    grass: '#95D96F',
    grassLight: '#AEE48A',
    grassDark: '#7DC35A',
    path: '#F5E6CA',
    pathEdge: '#E3CCA7',
    pebble: '#D6BE98',
    cobble: null,
    water: '#24AAC6',
    waterShade: '#1B8FAB',
    shore: '#ABEFEE',
    bank: '#B98C5C',
    bankDark: '#8F6840',
    petals: ['#FF6FB5', '#FFD23F', '#B98CFF', '#FF8A3D', '#FFFFFF'],
    petalMiddle: '#FFF4B8',
    leaf: '#5BAF4A',
    plank: '#D49D5F',
    plankShade: '#AE7845',
    plankGap: '#7E5232',
  },
  farm: {
    grass: '#AAD35F',
    grassLight: '#C0DF79',
    grassDark: '#92BC4B',
    path: '#DDB47C',
    pathEdge: '#C99F69',
    pebble: '#B98F5C',
    cobble: null,
    water: '#28A6B6',
    waterShade: '#1F8B9B',
    shore: '#AEEBE6',
    bank: '#A97B4B',
    bankDark: '#835C35',
    petals: ['#FFD23F', '#FFFFFF', '#FF8A3D'],
    petalMiddle: '#F2A93B',
    leaf: '#7FA83E',
    plank: '#C99059',
    plankShade: '#A36E3E',
    plankGap: '#73502F',
  },
  castle: {
    grass: '#7DC880',
    grassLight: '#96D696',
    grassDark: '#66B16B',
    path: '#A9AEB7',
    pathEdge: '#9AA0AA',
    pebble: '#8E949E',
    cobble: '#C9CDD4',
    water: '#2A9EC3',
    waterShade: '#2183A8',
    shore: '#A6E6F0',
    bank: '#8F8A84',
    bankDark: '#6F6A65',
    petals: ['#FFFFFF', '#88C4FF', '#FFD23F'],
    petalMiddle: '#FFB627',
    leaf: '#4F9E5A',
    plank: '#B98A5A',
    plankShade: '#946A40',
    plankGap: '#6A4A2C',
  },
}

/** The solids' colours, place by place. */
const BUSH = { body: '#4DAF4B', light: '#74CC63', dark: '#3A9040', flower: '#FFFFFF' }
const APPLE_TREE = { crown: '#5CBD4E', light: '#80D46B', dark: '#45A040', trunk: '#9A6438', apple: '#FF4B3E' }
const BOULDER = { body: '#AEADA8', light: '#CBCAC5', dark: '#8E8D88' }
const REEDS = { blade: '#5E9E3A', light: '#82BE55', base: '#4D8A35', cattail: '#8A5A33', stalk: '#6E8F3A' }
const WILLOW = { crown: '#86C86B', light: '#A4DC86', dark: '#679F55', trunk: '#8A6A44' }
const MOSSY = { body: '#9DA59D', dark: '#7E867E', moss: '#6CAE4C', mossLight: '#8CC765' }
const TRIM = { top: '#5DC476', front: '#3FA75A', leaf: '#2F8A47', flower: '#FFFFFF', flowerPink: '#FF9ACB', middle: '#FFD23F' }
const TOPIARY = { ball: '#48B45F', light: '#6CCC7C', dark: '#358F4B', trunk: '#8A5A33', pot: '#E07F4F', potLight: '#F29C6C', potDark: '#B9603A' }
const URN = { stone: '#DDD7CA', light: '#F0ECE2', dark: '#B8B0A0', soil: '#7A5236', leaf: '#4FAE4A' }
const FENCE = { wood: '#D49A5B', light: '#EAB880', dark: '#A9733F', grass: '#7EAF3F', bed: '#8EBB4C' }
const OAK = { crown: '#6DAF3F', light: '#8DC757', dark: '#56933A', trunk: '#8B5E3A' }
const HAY = { top: '#FAD873', front: '#E9B84A', straw: '#C9963A', twine: '#B3542F' }
const WALL = { top: '#CDD1D7', front: '#A9AEB7', mortar: '#8C919B', light: '#E2E5EA' }
const PINE = { needles: '#3E9A5B', light: '#58B473', dark: '#2E7C48', trunk: '#7A5233' }
const STONE = { top: '#D2D5DB', front: '#ADB2BA', chip: '#8F949D' }
/** A trunk's darker side, every tree's. */
const BARK_SHADE = 'rgba(60, 30, 10, 0.25)'
/** The water's ripples, and the dark band a raised plank deck throws on the water. */
const RIPPLE = '#FFFFFF'


const isWater = (g: Ground) => g === 'water' || g === 'bridge'
const isPath = (g: Ground) => g === 'path' || g === 'bridge'

/** Adds a rectangle with its own radius at each corner (top-left, top-right, bottom-right, bottom-left) to the path. */
function cornerRect(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, tl: number, tr: number, br: number, bl: number) {
  ctx.moveTo(x0 + tl, y0)
  ctx.lineTo(x1 - tr, y0)
  ctx.arcTo(x1, y0, x1, y0 + tr, tr)
  ctx.lineTo(x1, y1 - br)
  ctx.arcTo(x1, y1, x1 - br, y1, br)
  ctx.lineTo(x0 + bl, y1)
  ctx.arcTo(x0, y1, x0, y1 - bl, bl)
  ctx.lineTo(x0, y0 + tl)
  ctx.arcTo(x0, y0, x0 + tl, y0, tl)
  ctx.closePath()
}

/** Fills the current path. */
function fill(ctx: CanvasRenderingContext2D, colour: string) {
  ctx.fillStyle = colour
  ctx.fill()
}

/** A tuft of grass blades at (x, y), `s` tall: three little strokes. */
function tuft(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  ctx.beginPath()
  ctx.moveTo(x - 0.45 * s, y - 0.7 * s)
  ctx.lineTo(x - 0.15 * s, y)
  ctx.lineTo(x, y - s)
  ctx.lineTo(x + 0.15 * s, y)
  ctx.lineTo(x + 0.45 * s, y - 0.7 * s)
  ctx.lineWidth = lw(0.028)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = colour
  ctx.stroke()
}

/** A five-petal flower at (x, y) of petal radius `p`. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, p: number, turn: number, petal: string, middle: string) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = turn + (i * TAU) / 5
    ctx.moveTo(x + Math.cos(a) * p * 1.15 + p, y + Math.sin(a) * p * 1.15)
    ctx.arc(x + Math.cos(a) * p * 1.15, y + Math.sin(a) * p * 1.15, p, 0, TAU)
  }
  fill(ctx, petal)
  ctx.beginPath()
  ctx.arc(x, y, p * 0.8, 0, TAU)
  fill(ctx, middle)
}

/** Tile (c, r)'s grass print: a few tufts, now and then a pebble or a tiny daisy; with `bed` a cluster of flowers with leaves. */
function grassPrint(ctx: CanvasRenderingContext2D, L: Land, c: number, r: number, bed: boolean) {
  for (let k = 0; k < 3; k++) {
    const x = 0.15 + 0.7 * hash(c, r, k)
    const y = 0.2 + 0.7 * hash(c, r, k + 3)
    tuft(ctx, x, y, 0.09 + 0.05 * hash(c, r, k + 6), k === 0 ? L.grassLight : L.grassDark)
  }
  const odd = hash(c, r, 9)
  if (!bed && odd < 0.18) {
    ctx.beginPath()
    ctx.ellipse(0.2 + 0.6 * hash(c, r, 10), 0.2 + 0.6 * hash(c, r, 11), 0.045, 0.03, 0, 0, TAU)
    fill(ctx, L.pebble)
  } else if (!bed && odd > 0.8) {
    flower(ctx, 0.2 + 0.6 * hash(c, r, 12), 0.2 + 0.6 * hash(c, r, 13), 0.025, hash(c, r, 14) * TAU, C.white, L.petalMiddle)
  }
  if (!bed) return
  const n = 4 + Math.floor(hash(c, r, 15) * 2)
  for (let k = 0; k < n; k++) {
    const x = 0.16 + 0.68 * ((k + hash(c, r, 20 + k)) / n)
    const y = 0.18 + 0.64 * hash(c, r, 30 + k)
    ctx.beginPath()
    ctx.ellipse(x - 0.06, y + 0.06, 0.06, 0.028, -0.5, 0, TAU)
    ctx.ellipse(x + 0.06, y + 0.065, 0.06, 0.028, 0.5, 0, TAU)
    fill(ctx, L.leaf)
    const petal = L.petals[Math.floor(hash(c, r, 40 + k) * L.petals.length)]!
    flower(ctx, x, y, 0.045, hash(c, r, 50 + k) * TAU, petal, L.petalMiddle)
  }
}

/** Tile (c, r)'s path: a soft edge band and the path inside it, both rounded where the path ends at grass; pebbles, or cobbles in the castle; grass tufts nibbling at the open edges. */
function pathPrint(ctx: CanvasRenderingContext2D, L: Land, course: Course, c: number, r: number) {
  const left = !isPath(groundAt(course, c - 1, r))
  const right = !isPath(groundAt(course, c + 1, r))
  const top = !isPath(groundAt(course, c, r - 1))
  const bottom = !isPath(groundAt(course, c, r + 1))
  const shape = (inset: number, round: number) => {
    ctx.beginPath()
    cornerRect(
      ctx,
      left ? inset : 0,
      top ? inset : 0,
      right ? 1 - inset : 1,
      bottom ? 1 - inset : 1,
      top && left ? round : 0,
      top && right ? round : 0,
      bottom && right ? round : 0,
      bottom && left ? round : 0,
    )
  }
  shape(0.05, 0.3)
  fill(ctx, L.pathEdge)
  shape(0.1, 0.25)
  fill(ctx, L.path)
  if (L.cobble) {
    // Cobbles in courses of five, every other course half a cobble along, so they run on from tile to tile.
    ctx.save()
    shape(0.1, 0.25)
    ctx.clip()
    ctx.beginPath()
    for (let k = 0; k < 5; k++) {
      const shift = k % 2 === 0 ? 0.1 : 0
      for (let i = 0; i < 6; i++) {
        const x = shift + i * 0.2
        ctx.moveTo(x + 0.08, 0.1 + k * 0.2)
        ctx.ellipse(x, 0.1 + k * 0.2, 0.08, 0.072, 0, 0, TAU)
      }
    }
    fill(ctx, L.cobble)
    ctx.restore()
  } else {
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const x = 0.2 + 0.6 * hash(c, r, 80 + k)
      const y = 0.2 + 0.6 * hash(c, r, 83 + k)
      ctx.moveTo(x + 0.035, y)
      ctx.ellipse(x, y, 0.035, 0.024, 0, 0, TAU)
    }
    fill(ctx, L.pebble)
  }
  // Tufts at the open edges, so the path softens into the grass.
  const along = 0.25 + 0.5 * hash(c, r, 86)
  if (left) tuft(ctx, 0.09, along, 0.09, L.grass)
  if (right) tuft(ctx, 0.91, 1 - along, 0.09, L.grass)
  if (top) tuft(ctx, along, 0.12, 0.08, L.grass)
  if (bottom) tuft(ctx, 1 - along, 0.97, 0.09, L.grass)
}

/** How tall the earth bank shows at the top of a water tile under land. */
const BANK = 0.16
/** The shore's light rim where land meets the water. */
const RIM = 0.06

/** Tile (c, r)'s water: deep turquoise, a light shore where land meets it, and under land the land's earth bank going down to the water, which is in its shade. */
function waterPrint(ctx: CanvasRenderingContext2D, L: Land, course: Course, c: number, r: number) {
  const land = (dc: number, dr: number) => !isWater(groundAt(course, c + dc, r + dr))
  ctx.fillStyle = L.water
  ctx.fillRect(0, 0, 1, 1)
  // Two faint darker swells, baked.
  ctx.beginPath()
  for (let k = 0; k < 2; k++) {
    const x = 0.25 + 0.5 * hash(c, r, 90 + k)
    const y = 0.35 + 0.45 * hash(c, r, 92 + k)
    ctx.moveTo(x - 0.14, y)
    ctx.quadraticCurveTo(x - 0.07, y - 0.05, x, y)
    ctx.quadraticCurveTo(x + 0.07, y + 0.05, x + 0.14, y)
  }
  ctx.lineWidth = lw(0.03)
  ctx.lineCap = 'round'
  ctx.strokeStyle = L.waterShade
  ctx.stroke()
  ctx.beginPath()
  if (land(-1, 0)) ctx.rect(0, 0, RIM, 1)
  if (land(1, 0)) ctx.rect(1 - RIM, 0, RIM, 1)
  if (land(0, 1)) ctx.rect(0, 1 - RIM, 1, RIM)
  for (const [dc, dr] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    if (!land(dc, dr) || land(dc, 0) || land(0, dr)) continue
    // A quarter disc in this tile's corner, toward the land.
    const x = dc < 0 ? 0 : 1
    const y = dr < 0 ? 0 : 1
    const from = dr < 0 ? (dc < 0 ? 0 : Math.PI / 2) : dc < 0 ? Math.PI * 1.5 : Math.PI
    ctx.moveTo(x, y)
    ctx.arc(x, y, RIM * 1.5, from, from + Math.PI / 2)
    ctx.closePath()
  }
  fill(ctx, L.shore)
  if (land(0, -1)) {
    ctx.fillStyle = L.waterShade
    ctx.fillRect(0, BANK, 1, 0.1)
    ctx.fillStyle = L.bank
    ctx.fillRect(0, 0, 1, BANK)
    ctx.fillStyle = L.bankDark
    ctx.fillRect(0, BANK - 0.035, 1, 0.035)
    ctx.fillStyle = L.shore
    ctx.fillRect(0, BANK, 1, 0.03)
  }
}

/**
 * Which way the bridge that tile (c, r) belongs to runs: across the screen if going left
 * and right along it reaches land at both ends, else up and down. A bridge that reaches land
 * both ways (a square of planks) runs the shorter way.
 */
function bridgeRun(course: Course, c: number, r: number): 'across' | 'upDown' {
  const span = (dc: number, dr: number) => {
    let k = 1
    while (groundAt(course, c + dc * k, r + dr * k) === 'bridge') k++
    return { land: groundAt(course, c + dc * k, r + dr * k) !== 'water', length: k }
  }
  const left = span(-1, 0)
  const right = span(1, 0)
  const up = span(0, -1)
  const down = span(0, 1)
  const across = left.land && right.land
  const upDown = up.land && down.land
  if (across && upDown) return left.length + right.length <= up.length + down.length ? 'across' : 'upDown'
  return across ? 'across' : 'upDown'
}

/**
 * Tile (c, r)'s part of a bridge over its water: a plank deck from bank to bank. A bridge
 * several tiles wide is one deck: each tile's planks reach its edge where the bridge goes on
 * beside it, and only a side over the water has its beam and the deck's shade on the water.
 */
function bridgePrint(ctx: CanvasRenderingContext2D, L: Land, course: Course, c: number, r: number) {
  const upDown = bridgeRun(course, c, r) === 'upDown'
  // Drawn as if running up and down the screen; across the screen the same drawing turned a quarter (x and y swapped).
  const rect = (a: number, b: number, w: number, h: number) => (upDown ? ctx.fillRect(a, b, w, h) : ctx.fillRect(b, a, h, w))
  const beside = (k: -1 | 1) => (upDown ? groundAt(course, c + k, r) : groundAt(course, c, r + k)) !== 'bridge'
  const nearOpen = beside(-1)
  const farOpen = beside(1)
  const x0 = nearOpen ? 0.14 : 0
  const x1 = farOpen ? 0.86 : 1
  if (farOpen) {
    ctx.fillStyle = L.waterShade
    rect(0.86, 0, 0.09, 1)
  }
  ctx.fillStyle = L.plank
  rect(x0, 0, x1 - x0, 1)
  ctx.fillStyle = L.plankGap
  for (let k = 0; k < 5; k++) rect(x0, k * 0.2, x1 - x0, 0.025)
  ctx.fillStyle = L.plankShade
  for (let k = 0; k < 5; k++) rect(x0 + (x1 - x0 - 0.12) * hash(c, r, 95 + k), k * 0.2 + 0.09, 0.12, 0.02)
  if (nearOpen) rect(0.1, 0, 0.07, 1)
  if (farOpen) rect(0.83, 0, 0.07, 1)
  if (!upDown && farOpen) {
    // Across the screen its front edge shows: the deck's thickness, in shade.
    ctx.fillStyle = L.plankGap
    ctx.fillRect(0, 0.9, 1, 0.035)
  }
}

/**
 * The flat ground of tile (c, r), origin at the tile's top-left corner, filling exactly the
 * tile. Solid tiles get grass under them. It looks at the neighbours to blend: paths
 * soften into grass, water gets its shore and bank, a bridge runs from bank to bank.
 */
export function drawGround(ctx: CanvasRenderingContext2D, course: Course, c: number, r: number) {
  const L = LAND[course.id]
  const g = groundAt(course, c, r)
  if (isWater(g)) {
    waterPrint(ctx, L, course, c, r)
    if (g === 'bridge') bridgePrint(ctx, L, course, c, r)
    return
  }
  ctx.fillStyle = L.grass
  ctx.fillRect(0, 0, 1, 1)
  if (g === 'path') pathPrint(ctx, L, course, c, r)
  else grassPrint(ctx, L, c, r, g === 'flowers')
}

/** The moving part of a water tile, drawn every frame over the baked ground: two soft white ripples drifting and fading, each on its own beat. Nothing for any other tile. Origin at the tile's top-left. */
export function drawWaterShine(ctx: CanvasRenderingContext2D, course: Course, c: number, r: number, t: number) {
  if (groundAt(course, c, r) !== 'water') return
  const alpha = ctx.globalAlpha
  ctx.lineWidth = lw(0.032)
  ctx.lineCap = 'round'
  ctx.strokeStyle = RIPPLE
  for (let k = 0; k < 2; k++) {
    const period = 2.4 + 1.2 * hash(c, r, 70 + k)
    const u = (((t / period + hash(c, r, 72 + k)) % 1) + 1) % 1
    const x = 0.26 + 0.42 * hash(c, r, 74 + k) + 0.1 * u
    const y = 0.32 + 0.4 * hash(c, r, 76 + k)
    ctx.globalAlpha = alpha * 0.75 * Math.sin(Math.PI * u)
    ctx.beginPath()
    ctx.arc(x, y + 0.1, 0.12 + 0.05 * u, Math.PI * 1.27, Math.PI * 1.73)
    ctx.stroke()
  }
  ctx.globalAlpha = alpha
}

// ---------------------------------------------------------------------------------------
// Shapes the hero and the things share with the land

// ---------------------------------------------------------------------------------------
// The solid tiles

/** Which of a solid tile's four neighbours are the same kind: it joins them into one hedge, fence or wall. */
interface Joins {
  l: boolean
  r: boolean
  t: boolean
  b: boolean
}
const ALONE: Joins = { l: false, r: false, t: false, b: false }

/** A box standing on its tile, origin at the tile's bottom centre: x0..x1 across, its lit top face from yt down to the crease yc, its front face from yc down to yb, each corner's rounding. Joined sides reach the tile's edge; open sides stand in a little. */
interface Box {
  x0: number
  x1: number
  yt: number
  yc: number
  yb: number
  tl: number
  tr: number
  br: number
  bl: number
}

/** The box of a solid tile `h` tall: open sides `inset` in from the tile's edge, open corners rounded by `round`. */
function boxOf(j: Joins, h: number, inset: number, round: number): Box {
  return {
    x0: j.l ? -0.5 : -0.5 + inset,
    x1: j.r ? 0.5 : 0.5 - inset,
    yt: j.t ? -1 - h : -1 - h + inset,
    yc: -h,
    yb: j.b ? 0 : -inset,
    tl: j.t || j.l ? 0 : round,
    tr: j.t || j.r ? 0 : round,
    br: j.b || j.r ? 0 : round,
    bl: j.b || j.l ? 0 : round,
  }
}

/**
 * A box: its shadow on the ground in front (none when the next box in front covers it), its
 * darker front face, its lit top face, `decorate` clipped to it, and ink round its open
 * sides and along its crease. Joined sides get no ink, so a run of boxes reads as one.
 */
function drawBox(ctx: CanvasRenderingContext2D, j: Joins, b: Box, top: string, front: string, decorate: () => void) {
  if (!j.b) {
    ctx.beginPath()
    cornerRect(ctx, b.x0 - (j.l ? 0 : 0.02), b.yb - 0.03, b.x1 + (j.r ? 0 : 0.02), b.yb + 0.05, 0, 0, j.r ? 0 : 0.04, j.l ? 0 : 0.04)
    fill(ctx, C.shadow)
  }
  const outline = () => {
    ctx.beginPath()
    cornerRect(ctx, b.x0, b.yt, b.x1, b.yb, b.tl, b.tr, b.br, b.bl)
  }
  outline()
  fill(ctx, front)
  ctx.beginPath()
  cornerRect(ctx, b.x0, b.yt, b.x1, b.yc, b.tl, b.tr, 0, 0)
  fill(ctx, top)
  ctx.save()
  outline()
  ctx.clip()
  decorate()
  ctx.restore()
  ctx.beginPath()
  if (!j.t) {
    ctx.moveTo(b.x0, b.yt + b.tl)
    ctx.arcTo(b.x0, b.yt, b.x0 + b.tl, b.yt, b.tl)
    ctx.lineTo(b.x1 - b.tr, b.yt)
    ctx.arcTo(b.x1, b.yt, b.x1, b.yt + b.tr, b.tr)
  }
  if (!j.r) {
    ctx.moveTo(b.x1, b.yt + b.tr)
    ctx.lineTo(b.x1, b.yb - b.br)
  }
  if (!j.b) {
    ctx.moveTo(b.x1, b.yb - b.br)
    ctx.arcTo(b.x1, b.yb, b.x1 - b.br, b.yb, b.br)
    ctx.lineTo(b.x0 + b.bl, b.yb)
    ctx.arcTo(b.x0, b.yb, b.x0, b.yb - b.bl, b.bl)
  }
  if (!j.l) {
    ctx.moveTo(b.x0, b.yb - b.bl)
    ctx.lineTo(b.x0, b.yt + b.tl)
  }
  ctx.lineWidth = lw(LINE)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  if (!j.b) {
    ctx.beginPath()
    ctx.moveTo(b.x0, b.yc)
    ctx.lineTo(b.x1, b.yc)
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.stroke()
  }
}

/** A flat shadow band under a solid that stands on its tile's middle, running on into joined neighbours. */
function footShadow(ctx: CanvasRenderingContext2D, j: Joins, half: number) {
  ctx.beginPath()
  cornerRect(ctx, j.l ? -0.5 : -half, -0.55, j.r ? 0.5 : half, -0.3, 0, 0, j.r ? 0 : 0.12, j.l ? 0 : 0.12)
  fill(ctx, C.shadow)
}

/** Shades a round shape (its circles) from inside: a darker front below, lighter patches on top where the light falls, and a few leaf or stone marks. */
function shadeRound(ctx: CanvasRenderingContext2D, xyr: readonly number[], dark: string, darkAt: readonly number[], light: string, lightAt: readonly number[]) {
  ctx.save()
  circlesPath(ctx, xyr)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(darkAt[0]!, darkAt[1]!, darkAt[2]!, darkAt[3]!, 0, 0, TAU)
  fill(ctx, dark)
  circlesPath(ctx, lightAt)
  fill(ctx, light)
  ctx.restore()
}

/** Little arcs on a leafy or stony shape at hashed spots within the box (x, y, w, h): its texture. */
function marks(ctx: CanvasRenderingContext2D, c: number, r: number, n: number, x: number, y: number, w: number, h: number, colour: string) {
  ctx.beginPath()
  for (let k = 0; k < n; k++) {
    const mx = x + w * hash(c, r, 100 + k)
    const my = y + h * hash(c, r, 120 + k)
    ctx.moveTo(mx - 0.05, my)
    ctx.quadraticCurveTo(mx, my + 0.045, mx + 0.05, my)
  }
  ctx.lineWidth = lw(0.025)
  ctx.lineCap = 'round'
  ctx.strokeStyle = colour
  ctx.stroke()
}

/** A trunk from the ground at y = -0.42 up to `top`, `w` wide at its foot and narrowing, with a darker right side. */
function trunk(ctx: CanvasRenderingContext2D, w: number, top: number, colour: string) {
  const trace = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    c.moveTo(-w * 0.75, -0.4)
    c.quadraticCurveTo(-w * 0.45, -0.44, -w * 0.38, -0.55)
    c.lineTo(-w * 0.3, top)
    c.lineTo(w * 0.3, top)
    c.lineTo(w * 0.38, -0.55)
    c.quadraticCurveTo(w * 0.45, -0.44, w * 0.75, -0.4)
    c.closePath()
  }
  inked(ctx, trace, colour, LINE)
  ctx.save()
  trace(ctx)
  ctx.clip()
  ctx.fillStyle = BARK_SHADE
  ctx.fillRect(w * 0.08, top, w, -0.4 - top)
  ctx.restore()
}

/** A tree's sway: its crown turned a little about (0, y), on a slow beat of its own. */
function sway(ctx: CanvasRenderingContext2D, c: number, r: number, t: number, y: number) {
  ctx.translate(0, y)
  ctx.rotate(0.022 * Math.sin((TAU * t) / 3.2 + hash(c, r, 7) * TAU))
  ctx.translate(0, -y)
}

// The park: round bushes, apple trees, grey boulders.

function parkBush(ctx: CanvasRenderingContext2D, j: Joins, c: number, r: number) {
  footShadow(ctx, j, 0.44)
  const xyr = [0, -0.95, 0.42, -0.25, -0.78, 0.27, 0.25, -0.78, 0.27, -0.17, -1.2, 0.26, 0.17, -1.2, 0.26, 0, -1.3, 0.24]
  if (j.l) xyr.push(-0.39, -0.86, 0.2, -0.37, -1.08, 0.2)
  if (j.r) xyr.push(0.39, -0.86, 0.2, 0.37, -1.08, 0.2)
  if (j.b) xyr.push(0, -0.62, 0.32)
  blob(ctx, BUSH.body, xyr)
  shadeRound(ctx, xyr, BUSH.dark, [0.05, -0.56, 0.75, 0.26], BUSH.light, [-0.14, -1.22, 0.17, 0.12, -1.35, 0.1])
  marks(ctx, c, r, 5, -0.3, -1.15, 0.6, 0.45, BUSH.dark)
  for (let k = 0; k < 2; k++) flower(ctx, -0.25 + 0.5 * hash(c, r, 130 + k), -1.2 + 0.4 * hash(c, r, 132 + k), 0.03, hash(c, r, 134 + k) * TAU, BUSH.flower, LAND.park.petalMiddle)
}

function appleTree(ctx: CanvasRenderingContext2D, c: number, r: number, t: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.4, 0.55, 0.17, 0, 0, TAU)
  fill(ctx, C.shadow)
  trunk(ctx, 0.2, -1.25, APPLE_TREE.trunk)
  ctx.save()
  sway(ctx, c, r, t, -1.2)
  const xyr = [0, -1.65, 0.48, -0.36, -1.5, 0.3, 0.36, -1.5, 0.3, -0.22, -1.95, 0.3, 0.22, -1.95, 0.3, 0, -2.06, 0.27]
  blob(ctx, APPLE_TREE.crown, xyr, LINE_BIG)
  shadeRound(ctx, xyr, APPLE_TREE.dark, [0.05, -1.22, 0.85, 0.3], APPLE_TREE.light, [-0.2, -1.98, 0.2, 0.1, -2.1, 0.12, -0.4, -1.62, 0.1])
  marks(ctx, c, r, 6, -0.45, -1.95, 0.9, 0.6, APPLE_TREE.dark)
  for (const [x, y] of [
    [-0.3, -1.45],
    [0.06, -1.32],
    [0.34, -1.62],
    [-0.08, -1.82],
    [0.22, -2.0],
  ] as const) {
    inkOval(ctx, x, y, 0.065, 0.06, APPLE_TREE.apple, LINE_DETAIL)
    shine(ctx, 0.018, x - 0.03, y - 0.005, x - 0.012, y - 0.03)
  }
  ctx.restore()
}

function boulder(ctx: CanvasRenderingContext2D, c: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.36, 0.44, 0.15, 0, 0, TAU)
  fill(ctx, C.shadow)
  const k = hash(c, r, 140) < 0.5 ? 1 : -1
  const xyr = [0, -0.62, 0.34, -0.21 * k, -0.48, 0.25, 0.23 * k, -0.5, 0.22, 0.06 * k, -0.86, 0.22]
  blob(ctx, BOULDER.body, xyr)
  shadeRound(ctx, xyr, BOULDER.dark, [0.05, -0.36, 0.6, 0.18], BOULDER.light, [-0.1, -0.86, 0.15, -0.24, -0.62, 0.1])
  ctx.beginPath()
  ctx.moveTo(0.12 * k, -0.78)
  ctx.lineTo(0.05 * k, -0.66)
  ctx.lineTo(0.13 * k, -0.58)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

// The pond: reed beds, a weeping willow, mossy stones.

function reeds(ctx: CanvasRenderingContext2D, j: Joins, c: number, r: number, t: number) {
  footShadow(ctx, j, 0.42)
  const bend = 0.04 * Math.sin((TAU * t) / 2.6 + hash(c, r, 1) * TAU)
  for (let k = 0; k < 7; k++) {
    const x = -0.36 + (0.72 * (k + 0.5)) / 7 + (hash(c, r, k + 2) - 0.5) * 0.06
    const h = 0.72 + 0.4 * hash(c, r, k + 10)
    const lean = x * 0.3 + bend * h
    band(ctx, 0.085, k % 2 === 0 ? REEDS.blade : REEDS.light, LINE_DETAIL, (cx) => {
      cx.beginPath()
      cx.moveTo(x, -0.48)
      cx.quadraticCurveTo(x + lean * 0.3, -0.48 - h * 0.6, x + lean, -0.48 - h)
    })
  }
  for (const x of [-0.13, 0.17]) {
    const h = 0.95 + 0.15 * hash(c, r, x > 0 ? 20 : 21)
    const top = x + bend * h + x * 0.2
    tube(ctx, 0.035, REEDS.stalk, LINE_DETAIL, x, -0.5, top, -0.5 - h)
    inkOval(ctx, top, -0.5 - h + 0.12, 0.05, 0.12, REEDS.cattail, LINE_DETAIL)
  }
  const foot = [-0.24, -0.5, 0.15, 0, -0.47, 0.18, 0.24, -0.5, 0.15]
  if (j.l) foot.push(-0.42, -0.5, 0.12)
  if (j.r) foot.push(0.42, -0.5, 0.12)
  blob(ctx, REEDS.base, foot)
  marks(ctx, c, r, 3, -0.25, -0.58, 0.5, 0.08, REEDS.light)
}

function willow(ctx: CanvasRenderingContext2D, c: number, r: number, t: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.4, 0.62, 0.18, 0, 0, TAU)
  fill(ctx, C.shadow)
  trunk(ctx, 0.24, -1.5, WILLOW.trunk)
  ctx.save()
  sway(ctx, c, r, t, -1.6)
  // One crown: a rounded top flowing down into a curtain of hanging branches with a hem of lobes, strands drawn down it, lit on its upper left.
  const crown = (cx: CanvasRenderingContext2D) => {
    cx.beginPath()
    cx.moveTo(-0.3, -1.88)
    cx.quadraticCurveTo(-0.62, -1.78, -0.66, -1.3)
    cx.quadraticCurveTo(-0.7, -1.0, -0.62, -0.8)
    for (let k = 0; k < 6; k++) {
      const x0 = -0.62 + k * 0.2067
      const x1 = x0 + 0.2067
      cx.quadraticCurveTo((x0 + x1) / 2, -0.62 - 0.07 * (k % 2) - 0.05 * hash(c, r, 240 + k), x1, k === 5 ? -0.8 : -0.84 + 0.05 * (k % 2))
    }
    cx.quadraticCurveTo(0.7, -1.0, 0.66, -1.3)
    cx.quadraticCurveTo(0.62, -1.78, 0.3, -1.88)
    cx.quadraticCurveTo(0.24, -2.22, 0, -2.14)
    cx.quadraticCurveTo(-0.24, -2.22, -0.3, -1.88)
    cx.closePath()
  }
  inked(ctx, crown, WILLOW.crown, LINE_BIG)
  ctx.save()
  crown(ctx)
  ctx.clip()
  circlesPath(ctx, [-0.22, -1.86, 0.22, 0.08, -2.0, 0.14])
  fill(ctx, WILLOW.light)
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const x = -0.52 + k * 0.15
    ctx.moveTo(x * 0.7, -1.75)
    ctx.quadraticCurveTo(x * 1.05, -1.25, x * 1.02 + 0.02 * Math.sin(t * 1.3 + k), -0.72)
  }
  ctx.lineWidth = lw(0.03)
  ctx.lineCap = 'round'
  ctx.strokeStyle = WILLOW.dark
  ctx.stroke()
  ctx.restore()
  ctx.restore()
}

function mossy(ctx: CanvasRenderingContext2D, c: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.36, 0.46, 0.15, 0, 0, TAU)
  fill(ctx, C.shadow)
  const k = hash(c, r, 141) < 0.5 ? 1 : -1
  for (const [x, y, s] of [
    [0.1 * k, -0.62, 0.3],
    [-0.2 * k, -0.42, 0.2],
  ] as const) {
    const xyr = [x, y, s, x - 0.6 * s, y + 0.25 * s, s * 0.65, x + 0.6 * s, y + 0.2 * s, s * 0.7]
    blob(ctx, MOSSY.body, xyr)
    ctx.save()
    circlesPath(ctx, xyr)
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(x, y + s * 0.95, s * 1.6, s * 0.5, 0, 0, TAU)
    fill(ctx, MOSSY.dark)
    // The moss: a cap on the top with a wavy hem.
    ctx.beginPath()
    ctx.moveTo(x - 1.6 * s, y - 1.2 * s)
    ctx.lineTo(x + 1.6 * s, y - 1.2 * s)
    ctx.lineTo(x + 1.6 * s, y - 0.2 * s)
    for (let i = 4; i > 0; i--) ctx.quadraticCurveTo(x - 1.6 * s + (i - 0.5) * 0.8 * s, y + 0.1 * s * (i % 2 === 0 ? 1 : -1.6), x - 1.6 * s + (i - 1) * 0.8 * s, y - 0.2 * s)
    ctx.closePath()
    fill(ctx, MOSSY.moss)
    circlesPath(ctx, [x - 0.3 * s, y - 0.65 * s, 0.25 * s])
    fill(ctx, MOSSY.mossLight)
    ctx.restore()
  }
}

// The garden: trimmed hedges with little flowers, round topiary in a pot, stone urns of flowers.

function trimHedge(ctx: CanvasRenderingContext2D, j: Joins, c: number, r: number) {
  const b = boxOf(j, 0.6, 0.05, 0.12)
  drawBox(ctx, j, b, TRIM.top, TRIM.front, () => {
    // Leafy scallops in rows that run on from tile to tile, on the front and, sparser, on the top.
    ctx.beginPath()
    for (let row = 0; row < 3; row++) {
      const y = b.yc + 0.14 + row * 0.17
      for (let i = 0; i < 7; i++) {
        const x = -0.5 + (i + (row % 2) * 0.5) * 0.17
        ctx.moveTo(x - 0.06, y)
        ctx.quadraticCurveTo(x, y - 0.07, x + 0.06, y)
      }
    }
    ctx.lineWidth = lw(0.025)
    ctx.lineCap = 'round'
    ctx.strokeStyle = TRIM.leaf
    ctx.stroke()
    marks(ctx, c, r, 5, -0.4, b.yt + 0.12, 0.8, 0.75, TRIM.front)
    for (let k = 0; k < 3; k++) {
      const onTop = k < 2
      const x = -0.34 + 0.68 * hash(c, r, 150 + k)
      const y = onTop ? b.yt + 0.18 + 0.6 * hash(c, r, 153 + k) : b.yc + 0.15 + 0.3 * hash(c, r, 153 + k)
      flower(ctx, x, y, 0.035, hash(c, r, 156 + k) * TAU, k === 1 ? TRIM.flowerPink : TRIM.flower, TRIM.middle)
    }
  })
}

function topiary(ctx: CanvasRenderingContext2D, c: number, r: number, t: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.4, 0.5, 0.16, 0, 0, TAU)
  fill(ctx, C.shadow)
  ctx.save()
  sway(ctx, c, r, t, -0.7)
  tube(ctx, 0.1, TOPIARY.trunk, LINE, 0, -0.72, 0, -1.5)
  for (const [y, s] of [
    [-1.06, 0.22],
    [-1.78, 0.45],
  ] as const) {
    const xyr = [0, y, s]
    blob(ctx, TOPIARY.ball, xyr, s > 0.3 ? LINE_BIG : LINE)
    shadeRound(ctx, xyr, TOPIARY.dark, [0.05, y + s * 0.85, s * 1.3, s * 0.55], TOPIARY.light, [-s * 0.35, y - s * 0.4, s * 0.38])
    marks(ctx, c, r + (s > 0.3 ? 0 : 7), s > 0.3 ? 6 : 2, -s * 0.6, y - s * 0.6, s * 1.2, s * 1.1, TOPIARY.dark)
  }
  ctx.restore()
  // The pot: a lit rim over a tapering terracotta body.
  inked(
    ctx,
    (cx) => {
      cx.beginPath()
      cx.moveTo(-0.24, -0.72)
      cx.lineTo(0.24, -0.72)
      cx.lineTo(0.18, -0.4)
      cx.quadraticCurveTo(0, -0.37, -0.18, -0.4)
      cx.closePath()
    },
    TOPIARY.pot,
  )
  inked(ctx, (cx) => roundRectPath(cx, -0.29, -0.8, 0.58, 0.12, 0.04), TOPIARY.potLight)
  ctx.beginPath()
  ctx.moveTo(0.08, -0.66)
  ctx.lineTo(0.06, -0.45)
  ctx.lineWidth = lw(0.035)
  ctx.lineCap = 'round'
  ctx.strokeStyle = TOPIARY.potDark
  ctx.stroke()
}

function urn(ctx: CanvasRenderingContext2D, c: number, r: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.38, 0.38, 0.13, 0, 0, TAU)
  fill(ctx, C.shadow)
  // Foot, bowl, and the flowers in it.
  inked(ctx, (cx) => roundRectPath(cx, -0.2, -0.56, 0.4, 0.18, 0.04), URN.dark)
  inked(
    ctx,
    (cx) => {
      cx.beginPath()
      cx.moveTo(-0.38, -0.98)
      cx.quadraticCurveTo(-0.36, -0.62, -0.12, -0.56)
      cx.lineTo(0.12, -0.56)
      cx.quadraticCurveTo(0.36, -0.62, 0.38, -0.98)
      cx.closePath()
    },
    URN.stone,
  )
  ctx.beginPath()
  ctx.moveTo(0.22, -0.9)
  ctx.quadraticCurveTo(0.22, -0.7, 0.08, -0.62)
  ctx.lineWidth = lw(0.04)
  ctx.lineCap = 'round'
  ctx.strokeStyle = URN.dark
  ctx.stroke()
  inkOval(ctx, 0, -0.98, 0.4, 0.1, URN.light)
  inkOval(ctx, 0, -0.98, 0.31, 0.065, URN.soil, LINE_DETAIL)
  const petals = LAND.garden.petals
  for (const [x, y] of [
    [-0.24, -1.08],
    [0.24, -1.1],
    [-0.05, -1.24],
    [0.1, -1.06],
  ] as const) {
    inkOval(ctx, x - 0.05, y + 0.08, 0.06, 0.03, URN.leaf, LINE_DETAIL)
    tube(ctx, 0.02, URN.leaf, 0.006, x, y + 0.1, x, y)
  }
  for (let k = 0; k < 4; k++) {
    const x = [-0.24, 0.24, -0.05, 0.1][k]!
    const y = [-1.08, -1.1, -1.24, -1.06][k]!
    blob(ctx, petals[Math.floor(hash(c, r, 160 + k) * petals.length)]!, [x - 0.04, y, 0.04, x + 0.04, y, 0.04, x, y - 0.04, 0.04, x, y + 0.04, 0.04], LINE_DETAIL)
    circlesPath(ctx, [x, y, 0.025])
    fill(ctx, LAND.garden.petalMiddle)
  }
}

// The farm: a wooden fence in long grass, a big oak, hay bales.

/** A fence rail across from xa to xb at height y: a plank with a lit top, inked along its length and at its open ends only. */
function rail(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, openL: boolean, openR: boolean) {
  ctx.fillStyle = FENCE.wood
  ctx.fillRect(xa, y - 0.045, xb - xa, 0.09)
  ctx.fillStyle = FENCE.light
  ctx.fillRect(xa, y - 0.045, xb - xa, 0.025)
  ctx.beginPath()
  ctx.moveTo(xa, y - 0.045)
  ctx.lineTo(xb, y - 0.045)
  ctx.moveTo(xa, y + 0.045)
  ctx.lineTo(xb, y + 0.045)
  if (openL) {
    ctx.moveTo(xa, y - 0.045)
    ctx.lineTo(xa, y + 0.045)
  }
  if (openR) {
    ctx.moveTo(xb, y - 0.045)
    ctx.lineTo(xb, y + 0.045)
  }
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** A fence post standing at (x, y): a little box with a lit top. */
function post(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBox(ctx, ALONE, { x0: x - 0.07, x1: x + 0.07, yt: y - 0.7, yc: y - 0.62, yb: y, tl: 0.03, tr: 0.03, br: 0.02, bl: 0.02 }, FENCE.light, FENCE.wood, () => {
    ctx.beginPath()
    ctx.moveTo(x + 0.02, y - 0.55)
    ctx.lineTo(x + 0.015, y - 0.12)
    ctx.lineWidth = lw(0.02)
    ctx.strokeStyle = FENCE.dark
    ctx.stroke()
  })
}

function fence(ctx: CanvasRenderingContext2D, j: Joins, c: number, r: number) {
  const gy = -0.5
  // Long grass over the fence's whole footprint, running on into joined neighbours: it is in the way too.
  ctx.beginPath()
  cornerRect(ctx, j.l ? -0.5 : -0.46, j.t ? -1 : -0.94, j.r ? 0.5 : 0.46, j.b ? 0 : -0.06, j.t || j.l ? 0 : 0.2, j.t || j.r ? 0 : 0.2, j.b || j.r ? 0 : 0.2, j.b || j.l ? 0 : 0.2)
  fill(ctx, FENCE.bed)
  for (let k = 0; k < 4; k++) tuft(ctx, -0.38 + 0.25 * k + 0.06 * hash(c, r, 170 + k), gy - 0.25, 0.13, FENCE.grass)
  // A run up the screen: its rails seen end on, from this post back to the one above.
  if (j.t) inked(ctx, (cx) => roundRectPath(cx, -0.045, gy - 1.42, 0.09, 1.22, 0.03), FENCE.wood, LINE_DETAIL)
  const xa = j.l ? -0.5 : -0.42
  const xb = j.r ? 0.5 : 0.42
  for (const h of [0.45, 0.22]) rail(ctx, xa, xb, gy - h, !j.l, !j.r)
  post(ctx, 0, gy)
  if (!j.l) post(ctx, -0.42, gy)
  if (!j.r) post(ctx, 0.42, gy)
  for (let k = 0; k < 5; k++) tuft(ctx, -0.42 + 0.21 * k + 0.05 * hash(c, r, 175 + k), gy + 0.3, 0.16, FENCE.grass)
}

function oak(ctx: CanvasRenderingContext2D, c: number, r: number, t: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.38, 0.8, 0.2, 0, 0, TAU)
  fill(ctx, C.shadow)
  trunk(ctx, 0.3, -1.3, OAK.trunk)
  ctx.save()
  sway(ctx, c, r, t, -1.25)
  const xyr = [0, -1.7, 0.5, -0.52, -1.55, 0.38, 0.52, -1.55, 0.38, -0.3, -2.0, 0.34, 0.3, -2.0, 0.34, -0.78, -1.36, 0.25, 0.78, -1.36, 0.25]
  blob(ctx, OAK.crown, xyr, LINE_BIG)
  shadeRound(ctx, xyr, OAK.dark, [0.05, -1.14, 1.2, 0.32], OAK.light, [-0.32, -2.04, 0.2, 0.2, -2.12, 0.13, -0.66, -1.58, 0.13])
  marks(ctx, c, r, 9, -0.8, -2.0, 1.6, 0.75, OAK.dark)
  ctx.restore()
}

function hayBale(ctx: CanvasRenderingContext2D, c: number, r: number) {
  const b = boxOf(ALONE, 0.5, 0.1, 0.14)
  drawBox(ctx, ALONE, b, HAY.top, HAY.front, () => {
    ctx.beginPath()
    for (let k = 0; k < 16; k++) {
      const x = b.x0 + 0.06 + (b.x1 - b.x0 - 0.12) * hash(c, r, 180 + k)
      const y = b.yt + 0.06 + (b.yb - b.yt - 0.12) * hash(c, r, 200 + k)
      const a = (hash(c, r, 220 + k) - 0.5) * 1.2
      ctx.moveTo(x - 0.06 * Math.cos(a), y - 0.06 * Math.sin(a))
      ctx.lineTo(x + 0.06 * Math.cos(a), y + 0.06 * Math.sin(a))
    }
    ctx.lineWidth = lw(0.022)
    ctx.lineCap = 'round'
    ctx.strokeStyle = HAY.straw
    ctx.stroke()
    ctx.beginPath()
    for (const x of [-0.17, 0.17]) {
      ctx.moveTo(x, b.yt)
      ctx.lineTo(x, b.yb)
    }
    ctx.lineWidth = lw(0.04)
    ctx.strokeStyle = HAY.twine
    ctx.stroke()
  })
}

// The castle: a crenellated stone wall, a pine, cut stone blocks.

/** A merlon on the wall's top, its foot's front edge at (x, y). */
function merlon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBox(ctx, ALONE, { x0: x - 0.12, x1: x + 0.12, yt: y - 0.36, yc: y - 0.18, yb: y, tl: 0.03, tr: 0.03, br: 0.03, bl: 0.03 }, WALL.top, WALL.front, () => {
    ctx.beginPath()
    ctx.moveTo(x - 0.08, y - 0.33)
    ctx.lineTo(x + 0.06, y - 0.33)
    ctx.lineWidth = lw(0.025)
    ctx.strokeStyle = WALL.light
    ctx.stroke()
  })
}

function wall(ctx: CanvasRenderingContext2D, j: Joins) {
  const b = boxOf(j, 0.8, 0.03, 0.04)
  drawBox(ctx, j, b, WALL.top, WALL.front, () => {
    // Courses of stone on the front, every other course's joints half a stone along; flagstones on the top.
    ctx.beginPath()
    for (let k = 0; k < 4; k++) {
      const y = b.yc + k * 0.2
      if (k > 0) {
        ctx.moveTo(-0.5, y)
        ctx.lineTo(0.5, y)
      }
      for (let i = 0; i < 5; i++) {
        const x = -0.5 + (k % 2 === 0 ? 0.125 : 0) + i * 0.25
        ctx.moveTo(x, y + 0.03)
        ctx.lineTo(x, y + 0.17)
      }
    }
    ctx.moveTo(0, -1.8)
    ctx.lineTo(0, b.yc)
    ctx.moveTo(-0.5, b.yc - 0.5)
    ctx.lineTo(0.5, b.yc - 0.5)
    ctx.lineWidth = lw(0.022)
    ctx.lineCap = 'round'
    ctx.strokeStyle = WALL.mortar
    ctx.stroke()
  })
  if (!j.t) for (const x of [-0.25, 0.25]) merlon(ctx, x, b.yt + 0.2)
}

function pine(ctx: CanvasRenderingContext2D, c: number, r: number, t: number) {
  ctx.beginPath()
  ctx.ellipse(0, -0.4, 0.55, 0.16, 0, 0, TAU)
  fill(ctx, C.shadow)
  trunk(ctx, 0.18, -0.85, PINE.trunk)
  ctx.save()
  sway(ctx, c, r, t, -0.8)
  // Three tiers, the lowest first: each a rounded cone with a scalloped hem, lit on the left.
  for (const [base, w, apex] of [
    [-0.66, 0.62, -1.5],
    [-1.12, 0.5, -1.92],
    [-1.56, 0.38, -2.34],
  ] as const) {
    const tier = (cx: CanvasRenderingContext2D) => {
      cx.beginPath()
      cx.moveTo(0, apex)
      cx.quadraticCurveTo(-w * 0.35, (apex + base) / 2, -w, base)
      for (let i = 0; i < 4; i++) cx.quadraticCurveTo(-w + (i + 0.5) * (w / 2), base + 0.09, -w + (i + 1) * (w / 2), base)
      cx.quadraticCurveTo(w * 0.35, (apex + base) / 2, 0, apex)
      cx.closePath()
    }
    inked(ctx, tier, PINE.needles, LINE_BIG)
    ctx.save()
    tier(ctx)
    ctx.clip()
    ctx.beginPath()
    ctx.moveTo(0, apex)
    ctx.lineTo(-w * 1.2, base + 0.1)
    ctx.lineTo(-w * 0.3, base + 0.1)
    ctx.closePath()
    fill(ctx, PINE.light)
    ctx.beginPath()
    ctx.ellipse(0.1, base + 0.05, w * 1.1, 0.08, 0, 0, TAU)
    fill(ctx, PINE.dark)
    ctx.restore()
  }
  ctx.restore()
}

function stoneBlock(ctx: CanvasRenderingContext2D, c: number, r: number) {
  const b = boxOf(ALONE, 0.5, 0.1, 0.06)
  drawBox(ctx, ALONE, b, STONE.top, STONE.front, () => {
    const k = hash(c, r, 230) < 0.5 ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(0.18 * k, b.yc + 0.06)
    ctx.lineTo(0.1 * k, b.yc + 0.2)
    ctx.lineTo(0.16 * k, b.yc + 0.3)
    ctx.moveTo(-0.3 * k, b.yt + 0.3)
    ctx.lineTo(-0.2 * k, b.yt + 0.36)
    ctx.lineWidth = lw(0.025)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = STONE.chip
    ctx.stroke()
    shine(ctx, 0.03, b.x0 + 0.1, b.yt + 0.08, b.x1 - 0.25, b.yt + 0.08)
  })
}

/** Solids that stand on a spot rather than fill their tile like a box stand FORWARD nearer its front edge, so they cover the footprint she bumps into. */
const FORWARD = 0.18
function forward<A extends unknown[]>(art: (ctx: CanvasRenderingContext2D, ...a: A) => void) {
  return (ctx: CanvasRenderingContext2D, ...a: A) => {
    ctx.save()
    ctx.translate(0, FORWARD)
    art(ctx, ...a)
    ctx.restore()
  }
}

/** How each place draws its three solid kinds: a hedge joins its neighbours; a tree or rock stands alone. */
const SOLIDS: Record<
  CourseId,
  {
    hedge: (ctx: CanvasRenderingContext2D, j: Joins, c: number, r: number, t: number) => void
    tree: (ctx: CanvasRenderingContext2D, c: number, r: number, t: number) => void
    rock: (ctx: CanvasRenderingContext2D, c: number, r: number) => void
  }
> = {
  park: { hedge: forward(parkBush), tree: forward(appleTree), rock: forward(boulder) },
  pond: { hedge: forward(reeds), tree: forward(willow), rock: forward(mossy) },
  garden: { hedge: trimHedge, tree: forward(topiary), rock: forward(urn) },
  farm: { hedge: fence, tree: forward(oak), rock: hayBale },
  castle: { hedge: wall, tree: forward(pine), rock: stoneBlock },
}

/**
 * The solid tile at (c, r), in its place's style, origin at the tile's bottom centre
 * (c + 0.5, r + 1 on the course), with its own shadow. A box stands on the tile's footprint
 * with its lit top lifted by its height (reaching up to about y = -(1 + height)); a
 * hedge, fence or wall joins its neighbours of the same kind into one; trees reach about
 * 2.3 up and sway a little.
 */
export function drawSolid(ctx: CanvasRenderingContext2D, course: Course, c: number, r: number, t: number) {
  const g = groundAt(course, c, r)
  const art = SOLIDS[course.id]
  if (g === 'hedge') {
    const same = (dc: number, dr: number) => groundAt(course, c + dc, r + dr) === 'hedge'
    art.hedge(ctx, { l: same(-1, 0), r: same(1, 0), t: same(0, -1), b: same(0, 1) }, c, r, t)
  } else if (g === 'tree') art.tree(ctx, c, r, t)
  else if (g === 'rock') art.rock(ctx, c, r)
  else throw new Error(`drawSolid: tile (${c}, ${r}) of ${course.id} is ${g}, not solid`)
}

// ---------------------------------------------------------------------------------------
// The sheet

/** The letters of a hand-made course map. */
const KEY: Record<string, Ground> = { g: 'grass', p: 'path', f: 'flowers', b: 'bridge', w: 'water', H: 'hedge', T: 'tree', R: 'rock' }

/** A course of place `id` from a map, one string per row, with nothing on it: for the sheet and the tests. */
export function mapCourse(id: CourseId, rows: readonly string[]): Course {
  const ground = rows.flatMap((row) =>
    [...row].map((ch) => {
      const g = KEY[ch]
      if (!g) throw new Error(`mapCourse: no ground for '${ch}'`)
      return g
    }),
  )
  const cols = rows[0]!.length
  if (rows.some((row) => row.length !== cols)) throw new Error('mapCourse: rows of different lengths')
  return {
    id,
    cols,
    rows: rows.length,
    ground,
    start: { x: 0.5, y: 0.5 },
    balloon: { x: 0.5, y: 0.5 },
    flags: [],
    foods: [],
    poops: [],
    gates: [],
    buttons: [],
    openFor: { pink: null, green: null, blue: null },
    spinners: [],
    sliders: [],
    puppies: [],
  }
}

/** A small place with every kind of ground: a hedge run with a corner, a river with a bridge, a pond's corner, a tree, a rock. */
export const SAMPLE = ['ggffggggg', 'gHHHgppTg', 'gHpppfggf', 'wwwbwwpww', 'wwwbwwgRg', 'ggppgwwgg', 'fgpgggfgg'] as const
/** A stream with a bridge across it, and each solid alone. */
export const ACROSS = ['gwg', 'pbp', 'gwg'] as const
/** Bridges more than a tile wide, each one deck: three wide across a river, two wide up and down a stream. */
export const WIDE = ['wwwwwwwgbbg', 'gbbbbbgwbbw', 'pbbbbbpwbbw', 'gbbbbbgwbbw', 'wwwwwwwgbbg'] as const
export const ALONE_MAPS = { hedge: ['ggg', 'gHg', 'ggg'], tree: ['ggg', 'gTg', 'ggg'], rock: ['ggg', 'gRg', 'ggg'] } as const

/** A course as the renderer draws it: every ground tile, the water's shine, then the solids row by row. */
export function drawCourse(ctx: CanvasRenderingContext2D, course: Course, t: number) {
  for (let r = 0; r < course.rows; r++)
    for (let c = 0; c < course.cols; c++) {
      ctx.save()
      ctx.translate(c, r)
      drawGround(ctx, course, c, r)
      drawWaterShine(ctx, course, c, r, t)
      ctx.restore()
    }
  for (let r = 0; r < course.rows; r++)
    for (let c = 0; c < course.cols; c++) {
      if (!SOLID[groundAt(course, c, r)]) continue
      ctx.save()
      ctx.translate(c + 0.5, r + 1)
      drawSolid(ctx, course, c, r, t)
      ctx.restore()
    }
}

const PLACES: readonly CourseId[] = ['park', 'pond', 'garden', 'farm', 'castle']

export const SHEET = (): SheetEntry[] =>
  PLACES.flatMap((id): SheetEntry[] => {
    const sample = mapCourse(id, SAMPLE)
    const across = mapCourse(id, ACROSS)
    const wide = mapCourse(id, WIDE)
    return [
      { label: `${id}`, box: { x: 0, y: -1.5, w: sample.cols, h: sample.rows + 1.5 }, draw: (ctx, t) => drawCourse(ctx, sample, t) },
      { label: `${id} bridge across`, box: { x: 0, y: -0.2, w: 3, h: 3.2 }, draw: (ctx, t) => drawCourse(ctx, across, t) },
      { label: `${id} wide bridges`, box: { x: 0, y: -0.2, w: wide.cols, h: wide.rows + 0.2 }, draw: (ctx, t) => drawCourse(ctx, wide, t) },
      ...(['hedge', 'tree', 'rock'] as const).map((kind): SheetEntry => {
        const one = mapCourse(id, ALONE_MAPS[kind])
        return { label: `${id} ${kind}`, box: { x: 0, y: -1.5, w: 3, h: 4.5 }, draw: (ctx, t) => drawCourse(ctx, one, t) }
      }),
    ]
  })
