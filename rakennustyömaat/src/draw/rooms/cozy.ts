import { FRIENDS } from '../../game/catalog'
import { FLOOR_BAND } from '../../game/layout'
import type { Look } from '../../game/model'
import { CAT_COATS, catAt, type CatPic } from '../animals'
import { HEAD, armTo, drawRig, inRig, mitten, posed, type Rig } from '../builder'
import {
  BOX,
  C,
  INK,
  TAU,
  arch,
  blob,
  blush,
  box,
  circlePath,
  clamp01,
  detail,
  eyes,
  groundShadow,
  heartPath,
  ink,
  loop,
  mix,
  part,
  phaseOf,
  puff,
  roundRectPath,
  shine,
  smile,
  smooth,
  sparkle,
  sparklePath,
  starPath,
  tube,
  turnAbout,
  type Faces,
} from '../look'
import type { FloorDraw, ItemDraw, ThemeArt, WallDraw } from './types'

/**
 * The cozy rooms: sleep, cat, kitchen. Each theme's wallpaper (four colourings), floor band
 * (four colourings), window glow and its five items.
 *
 * Sleep: a night wall of moons and sparkles over a row of clouds, a soft carpet, a mobile of
 * moon, stars and a cloud turning slowly, a star poster a shooting star crosses, a friend
 * asleep in bed who peeks, yawns and sleeps again, a teddy bear and a moon lamp.
 * Cat: paw prints on a warm wall, wooden boards, a fish lamp, a cat lazing on a shelf, a cat
 * tree whose two cats swap places and back, a cat popping out of a box, and a kitten who
 * pounces on a ball of yarn. Kitchen: big checker tiles, a checker floor, a lamp made of a
 * pot, a shelf of jars, an oven a cake rises in, a friend in a chef hat stirring a bowl, and a
 * pot that bubbles over.
 *
 * Walls and floors are backdrops: no ink, mid-light, one big tone-on-tone motif. Items are
 * the play layer: inked, made things as boxes, round glossy things with one shine tick, a
 * ground shadow under everything standing. Children are the builder rig; cats and the
 * teddy are made from the face kit. Cats are plain cats in five coats.
 */

// ---------------------------------------------------------------------------------------
// The palette

/** The Sleep wallpaper's four colourings: night blue, violet, teal and dawn blue, each with its moons and sparkles in a lighter tone and the clouds along the bottom between the two. */
const SLEEP_WALLS = [
  { base: '#3C5AA8', motif: '#5675C0', cloud: '#4A68B4' },
  { base: '#6955AC', motif: '#8470C2', cloud: '#7662B7' },
  { base: '#2E7B93', motif: '#4C96AC', cloud: '#3C889F' },
  { base: '#8DA4DD', motif: '#AABDE9', cloud: '#9BB0E3' },
] as const
/** The Sleep carpet's four colourings: the pile, its big soft dots, its front edge. */
const SLEEP_FLOORS = [
  { base: '#A595D9', dot: '#BBAEE4', edge: '#8A7AC4' },
  { base: '#8EB1E3', dot: '#AAC6EC', edge: '#7095CE' },
  { base: '#EDB39D', dot: '#F6CAB8', edge: '#D69580' },
  { base: '#98D2BC', dot: '#B6E1D0', edge: '#79B8A0' },
] as const
/** The Cat wallpaper's four colourings: apricot, sage, lilac and butter, with paw prints in a lighter tone and a wavy panel along the bottom. */
const CAT_WALLS = [
  { base: '#FFC7A3', motif: '#FFDDC6', panel: '#F6B48D' },
  { base: '#C3DBAC', motif: '#D9EAC9', panel: '#AFCC96' },
  { base: '#D6C4ED', motif: '#E7DBF6', panel: '#C4AFE2' },
  { base: '#FFDF98', motif: '#FFEDC4', panel: '#F4CC7C' },
] as const
/** The Cat floor's four woods: the boards, the seams between them, the front edge. */
const CAT_FLOORS = [
  { base: '#E2A566', seam: '#C68748', edge: '#B27538' },
  { base: '#B97C4E', seam: '#9C643B', edge: '#87542F' },
  { base: '#D8C6AC', seam: '#BCA88D', edge: '#A8947A' },
  { base: '#E8A79D', seam: '#CC897F', edge: '#B8766C' },
] as const
/** The Kitchen wallpaper's four tile colourings: the light tiles, the coloured tiles of the checker, the trim row at counter height. */
const KITCHEN_WALLS = [
  { base: '#EAF7EE', tile: '#D0EDD9', trim: '#A9DDB9' },
  { base: '#FFF7DA', tile: '#FFE9AE', trim: '#FFD36B' },
  { base: '#EAF4FC', tile: '#CFE4F7', trim: '#9CC6EE' },
  { base: '#FDEEF1', tile: '#F9D4DD', trim: '#F2A9B9' },
] as const
/** The Kitchen floor's four checkers: the coloured tiles, the light tiles, the front edge. */
const KITCHEN_FLOORS = [
  { a: '#FF9C8A', b: '#FFF1E3', edge: '#E07A6A' },
  { a: '#7FAEEA', b: '#F1F6FF', edge: '#5E8FD0' },
  { a: '#FFCF63', b: '#FFF7E0', edge: '#E0AE40' },
  { a: '#86CF94', b: '#F0FAF1', edge: '#66B275' },
] as const
/** The colour each theme's windows glow at Good night: a sleepy amber, a warm apricot, a bright kitchen yellow. */
const GLOW = { sleep: '#FFD58A', cat: '#FFCFA0', kitchen: '#FFF0AE' } as const

/** The made things' faces: wood for beds, shelves and tables, the mattress, the cat tree's two carpets, the cardboard box, the oven, the stove's cupboard. */
const WOOD: Faces = { face: '#E8A85C', top: '#F6CB8E', side: '#C07F3A' }
const MATTRESS: Faces = { face: '#D9E3F6', top: '#F3F6FD', side: '#B4C4E4' }
const CARPET: Faces = { face: '#4FC1B4', top: '#7DD3C9', side: '#2E9C90' }
const CUBBY: Faces = { face: '#A98AE6', top: '#C3AEEE', side: '#8566C7' }
const CARDBOARD: Faces = { face: '#D9A066', top: '#E8BC85', side: '#B57E45' }
const OVEN: Faces = { face: '#FF7E6B', top: '#FFA394', side: '#D95C4B' }
const CUPBOARD: Faces = { face: '#FFD25E', top: '#FFE291', side: '#E0AE30' }

/** Every other colour the cozy items use. */
const COZY = {
  cap: '#F5F3EC',
  woodMark: '#B5733A',
  moon: '#FFD95A',
  star: '#FFE680',
  cloud: '#FFFFFF',
  zee: '#FFFFFF',
  posterSky: '#2C3E8E',
  posterHill: '#3E8F7A',
  tape: '#FF9EBB',
  pillow: '#FFFFFF',
  blanket: '#FF8FB8',
  blanketStar: '#FFD0E2',
  sheet: '#FFFFFF',
  teddy: '#D69A5E',
  teddyFar: '#B97E45',
  teddyLight: '#F5D6A8',
  teddyNose: '#5B3A26',
  ribbon: '#4AA8FF',
  moonLamp: '#FFF1B5',
  crater: '#F3D88B',
  lampFoot: '#8E5CE0',
  fish: '#FF8C42',
  fishBelly: '#FFD08A',
  fishFin: '#F06A2C',
  fishEye: '#FFFFFF',
  bubble: '#D8F3FF',
  catNose: '#FF7F9E',
  sisal: '#EBD5A8',
  sisalMark: '#C9AC78',
  hole: '#5B3F8F',
  pompom: '#FFD93A',
  boxInside: '#8C5F33',
  boxTape: '#F2D3A2',
  yarn: '#FF7AB6',
  yarnMark: '#D94F8B',
  enamel: '#E8443A',
  enamelRim: '#FFFFFF',
  panHandle: '#3A3F52',
  bulb: '#FFF3B0',
  glass: 'rgba(205, 238, 250, 0.55)',
  lids: ['#FF7AB6', '#4AA8FF', '#FFC21A', '#3FB45A'],
  jam: '#E8443A',
  cookie: '#C98A4E',
  cookieDot: '#7A4A2A',
  pasta: '#FFD25E',
  pastaMark: '#E0A82A',
  peas: '#7CCB5A',
  peasMark: '#4E9E36',
  jamSeed: '#FFF4DC',
  ovenInside: '#6B3F2E',
  ovenWindow: '#8A4C33',
  ovenGlow: '#FFB25E',
  cake: '#F6C46A',
  cherry: '#E8443A',
  steam: '#FFFFFF',
  chefHat: '#FFFFFF',
  bowl: '#5E90F0',
  bowlIn: '#3F6FCF',
  batter: '#FFF0C9',
  soup: '#FF8A3D',
  soupLight: '#FFB47A',
  foam: '#FFF6E0',
  flame: '#FF9A3A',
} as const

// ---------------------------------------------------------------------------------------
// Shared helpers

/** Past this many seconds every reaction here has settled: a tap's age is held at it, so an infinite or huge age never reaches the trigonometry. */
const SETTLED = 4
/** A tap's age as the drawings read it: -1 before any tap, held at SETTLED after. */
const tapAge = (play: number) => (play < 0 ? -1 : Math.min(play, SETTLED))
/** A wave of `period` seconds at time t, from -1 to 1, shifted by `phase` (0 to 1). */
const wave = (t: number, period: number, phase: number) => Math.sin(TAU * loop(t, period, phase))
/** How much every item draws: by the floor box's height on screen, as the block tower reads it, so a room's items drop their marks together. */
const lodNow = () => detail(1.15)
/** Whether to draw the finer marks. */
const fineNow = () => lodNow() !== 'S'
/** 0 to 1 over [a, b] and back to 0 over [c, d]: a reaction's envelope. */
const hump = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) - smooth(c, d, x)
/** A blink: true for a moment every `period` seconds. */
const blinking = (t: number, period: number, id: string) => loop(t, period, phaseOf(id)) > 0.965

/** A ceiling item's hanging: a little cap on the ceiling and the cord down to `y`. */
function hang(ctx: CanvasRenderingContext2D, y: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, y)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.055, 0.032, 0, 0, Math.PI)
  ctx.closePath()
  part(ctx, COZY.cap, 'line')
}

/** A soft round light spot: two discs of the light colour, the inner one twice as bright. */
function glowSpot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = C.light
  circlePath(ctx, x, y, r)
  ctx.fill()
  circlePath(ctx, x, y, r * 0.64)
  ctx.fill()
}

/** A crescent moon of radius r at (cx, cy): the disc less a 0.8 r disc shifted right by 0.45 r, its horns turned by `rot` from pointing right. Begins its own path. */
function crescentPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  const o = 0.45 * r
  const ri = 0.8 * r
  const x = (r * r - ri * ri + o * o) / (2 * o)
  const y = Math.sqrt(Math.max(0, r * r - x * x))
  const a = Math.atan2(y, x)
  const b = Math.atan2(y, x - o)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.arc(0, 0, r, a, TAU - a, false)
  ctx.arc(o, 0, ri, -b, b, true)
  ctx.closePath()
  ctx.restore()
}

/** A wooden wall shelf from x0 to x1, its top front edge at y, on two brackets. */
function shelf(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  for (const x of [x0 + 0.08, x1 - 0.13]) {
    ctx.beginPath()
    ctx.moveTo(x, y + 0.05)
    ctx.lineTo(x + 0.05, y + 0.05)
    ctx.lineTo(x + 0.05, y + 0.15)
    ctx.quadraticCurveTo(x, y + 0.13, x, y + 0.05)
    ctx.closePath()
    part(ctx, WOOD.side, 'line')
  }
  box(ctx, x0, y, x1 - x0, 0.055, WOOD, 0.07, true, true, 'line')
}

/** A wallpaper's motif grid: a motif every SPACE.x by SPACE.y metres, alternate rows shifted by half, so a cell holds four to six. */
const SPACE = { x: 0.92, y: 0.8 }
function motifs(w: number, h: number, draw: (x: number, y: number, n: number) => void) {
  for (let row = 0; row * SPACE.y < h + 0.3; row++) {
    const shift = (row % 2) * SPACE.x * 0.5
    for (let col = -1; col * SPACE.x < w + 0.5; col++) draw(0.4 + col * SPACE.x + shift, 0.42 + row * SPACE.y, col + row)
  }
}

/** The floor band's front edge, a darker strip along its bottom. */
function floorEdge(ctx: CanvasRenderingContext2D, w: number, colour: string) {
  ctx.fillStyle = colour
  ctx.fillRect(0, FLOOR_BAND - 0.035, w, 0.035)
}

// ---------------------------------------------------------------------------------------
// Cats hopping (animals.ts draws the cat)

/** A point along a jump from a to b at u (0 to 1), arching `lift` above the straight line. */
function jumpAt(a: readonly [number, number], b: readonly [number, number], u: number, lift: number): [number, number] {
  return [mix(a[0], b[0], u), mix(a[1], b[1], u) - lift * arch(u)]
}
/** A leaping body's tilt along a jump at u: nose up on the way up, down on the way down. */
function jumpTilt(a: readonly [number, number], b: readonly [number, number], u: number, lift: number): number {
  const [x0, y0] = jumpAt(a, b, Math.max(0, u - 0.02), lift)
  const [x1, y1] = jumpAt(a, b, Math.min(1, u + 0.02), lift)
  return Math.max(-0.7, Math.min(0.7, Math.atan2(y1 - y0, Math.abs(x1 - x0) + 1e-6)))
}

// ---------------------------------------------------------------------------------------
// Sleep

/** Clouds along the bottom of a wall, h - CLOUDS.h up, in big round puffs. */
const CLOUDS = { h: 0.42, step: 0.34 }

/** The Sleep wallpaper: big moons and four-point sparkles tone on tone, a row of clouds along the bottom. Still, so a baked room matches a live one. */
const sleepWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = SLEEP_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = c.motif
  motifs(w, h, (x, y, n) => {
    if (n % 2 === 0) crescentPath(ctx, x, y, 0.16, -0.75 + 0.25 * ((n * 7) % 3))
    else sparklePath(ctx, x, y, 0.3)
    ctx.fill()
    if (n % 2 !== 0) {
      // A little sparkle keeps the big one company.
      sparklePath(ctx, x + 0.2, y - 0.17, 0.1)
      ctx.fill()
    }
  })
  ctx.fillStyle = c.cloud
  ctx.fillRect(0, h - CLOUDS.h, w, CLOUDS.h)
  for (let i = 0; i * CLOUDS.step < w + CLOUDS.step; i++) {
    circlePath(ctx, i * CLOUDS.step + 0.12, h - CLOUDS.h + (i % 2) * 0.05, i % 2 ? 0.17 : 0.21)
    ctx.fill()
  }
  ctx.restore()
}

/** The Sleep floor: a soft carpet with big dots. */
const sleepFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = SLEEP_FLOORS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.dot
  for (let x = 0.16; x < w + 0.1; x += 0.32) {
    ctx.beginPath()
    ctx.ellipse(x, 0.075, 0.075, 0.034, 0, 0, TAU)
    ctx.fill()
  }
  floorEdge(ctx, w, c.edge)
  ctx.restore()
}

/** The mobile: the arms' reach from the hub, the hub's drop below the ceiling, how far the turning ring leans back (the boxes' 45 degrees, flattened), and how slowly it turns. */
const MOBILE = { reach: 0.29, hub: 0.14, lean: 0.3, period: 12 }
/** Its four hangings, a quarter turn apart: what hangs, how long its string is, its size. */
const HANGINGS = [
  { kind: 'moon', drop: 0.17, r: 0.1 },
  { kind: 'star', drop: 0.25, r: 0.085 },
  { kind: 'cloud', drop: 0.17, r: 0.08 },
  { kind: 'star', drop: 0.25, r: 0.068 },
] as const
/** Where the twinkles pop round the mobile on a tap. */
const MOBILE_TWINKLES = [
  [-0.38, 0.24],
  [0.37, 0.16],
  [-0.3, 0.5],
  [0.34, 0.5],
] as const

/**
 * The moon mobile: a moon, two stars and a cloud on a turning cross of dowels, the near ones
 * a little bigger. It turns once in twelve seconds; a tap spins it round once more within
 * 1.4 s, the hangings swing out and twinkles pop round it.
 */
const moonMobile: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const spin = loop(t, MOBILE.period, phaseOf('moonMobile')) + (p < 0 ? 0 : smooth(0, 1.4, p))
  const swing = p < 0 ? 0 : 0.35 * Math.sin(TAU * Math.min(p, 1.4) / 0.7) * (1 - smooth(0, 1.4, p))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  hang(ctx, MOBILE.hub)
  const placed = HANGINGS.map((h, i) => {
    const a = TAU * (spin + i / 4)
    const z = Math.sin(a) * MOBILE.reach
    return { h, a, z, x: Math.cos(a) * MOBILE.reach + z * MOBILE.lean, y: MOBILE.hub - z * MOBILE.lean }
  })
  const near = [...placed].sort((a, b) => b.z - a.z)
  const drawHanging = (it: (typeof placed)[number]) => {
    const k = 1 - 0.1 * (it.z / MOBILE.reach)
    const r = it.h.r * k
    const px = it.x - Math.sin(it.a) * it.h.drop * swing
    const py = it.y + it.h.drop
    ctx.beginPath()
    ctx.moveTo(it.x, it.y)
    ctx.lineTo(px, py - r * 0.8)
    ink(ctx, 'detail')
    if (it.h.kind === 'moon') {
      crescentPath(ctx, px, py, r, -0.6)
      part(ctx, COZY.moon, 'line')
    } else if (it.h.kind === 'star') {
      starPath(ctx, px, py, r)
      part(ctx, COZY.star, 'line')
    } else blob(ctx, [px - r * 0.55, py + r * 0.15, r * 0.55, px + r * 0.1, py - r * 0.2, r * 0.68, px + r * 0.7, py + r * 0.2, r * 0.5], COZY.cloud, 'line')
  }
  for (const it of near) if (it.z > 0) drawHanging(it)
  // The cross of dowels, then the hub bead.
  ctx.beginPath()
  for (const i of [0, 1]) {
    ctx.moveTo(placed[i]!.x, placed[i]!.y)
    ctx.lineTo(placed[i + 2]!.x, placed[i + 2]!.y)
  }
  tube(ctx, 0.018, WOOD.face)
  circlePath(ctx, 0, MOBILE.hub, 0.026)
  part(ctx, WOOD.side, 'line')
  for (const it of near) if (it.z <= 0) drawHanging(it)
  if (p >= 0)
    MOBILE_TWINKLES.forEach(([x, y], i) => {
      const k = hump(p, 0.1 + i * 0.12, 0.3 + i * 0.12, 0.6 + i * 0.12, 1.0 + i * 0.12)
      sparkle(ctx, x, y, 0.09 * k, C.sparkleWarm)
    })
  ctx.restore()
}

/** The poster's paper and its picture's border, and the little twinkles in its sky (x, y, size, phase). */
const POSTER = { w: 0.74, h: 0.52, border: 0.045 }
const POSTER_TWINKLES = [
  [-0.27, -0.15, 0.06, 0],
  [0.05, -0.17, 0.05, 0.35],
  [0.27, 0.05, 0.045, 0.6],
  [-0.24, 0.07, 0.04, 0.8],
] as const

/**
 * The star poster: a night picture on paper (a big star, a crescent moon, little twinkles
 * breathing slowly, a green hill), taped up at its top corners. On a tap a shooting star
 * streaks across it.
 */
const starPoster: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const { w, h, border } = POSTER
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.rotate(-0.025)
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.02)
  part(ctx, C.paper, 'line')
  const iw = w - 2 * border
  const ih = h - 2 * border
  ctx.save()
  ctx.beginPath()
  ctx.rect(-iw / 2, -ih / 2, iw, ih)
  ctx.fillStyle = COZY.posterSky
  ctx.fill()
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-iw / 2, ih / 2)
  ctx.lineTo(-iw / 2, ih / 2 - 0.07)
  ctx.quadraticCurveTo(-0.02, ih / 2 - 0.2, iw / 2, ih / 2 - 0.05)
  ctx.lineTo(iw / 2, ih / 2)
  ctx.closePath()
  ctx.fillStyle = COZY.posterHill
  ctx.fill()
  if (fine)
    for (const [x, y, s, ph] of POSTER_TWINKLES) {
      sparklePath(ctx, x, y, s * (0.75 + 0.25 * wave(t, 2.6, ph)))
      ctx.fillStyle = COZY.star
      ctx.fill()
    }
  starPath(ctx, -0.09, -0.01, 0.12)
  part(ctx, COZY.star, 'line')
  crescentPath(ctx, 0.19, -0.08, 0.075, -0.6)
  part(ctx, COZY.moon, 'line')
  if (p >= 0 && p < 1) {
    // The shooting star, its tail thinning behind it (never longer than the way it has come).
    const u = smooth(0.02, 0.9, p)
    const from = { x: -0.4, y: -0.2 }
    const dx = 0.82
    const dy = 0.26
    const x = from.x + dx * u
    const y = from.y + dy * u
    const len = Math.hypot(dx, dy)
    const tail = Math.min(0.2, len * u)
    const nx = -dy / len
    const ny = dx / len
    ctx.beginPath()
    ctx.moveTo(x + nx * 0.025, y + ny * 0.025)
    ctx.lineTo(x - (dx / len) * tail, y - (dy / len) * tail)
    ctx.lineTo(x - nx * 0.025, y - ny * 0.025)
    ctx.closePath()
    ctx.fillStyle = COZY.star
    ctx.fill()
    starPath(ctx, x, y, 0.045)
    part(ctx, C.sparkleWarm, 'detail')
  }
  ctx.restore()
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.translate(s * (w / 2 - 0.05), -h / 2 + 0.01)
    ctx.rotate(s * 0.65)
    ctx.beginPath()
    ctx.rect(-0.06, -0.022, 0.12, 0.044)
    part(ctx, COZY.tape, 'detail')
    ctx.restore()
  }
  ctx.restore()
}

/** A Z of `size` at (x, y) in white over an ink edge: one Z of a sleeper's Zzz. */
function zee(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  if (size < 0.01) return
  const s = size / 2
  ctx.beginPath()
  ctx.moveTo(x - s, y - s)
  ctx.lineTo(x + s, y - s)
  ctx.lineTo(x - s, y + s)
  ctx.lineTo(x + s, y + s)
  tube(ctx, size * 0.24, COZY.zee)
}

/** The friend asleep in the bed, and where their feet rest and how big they are in it (the rig is about 1.05 m without a hat). */
const SLEEPER: Look = FRIENDS[3]!
const SLEEPER_AT = { x: 0.24, y: -0.56, scale: 0.55 }
/** The bed: the headboard and footboard posts, the mattress between them, how far its top recedes. */
const BED = { x0: -0.47, x1: 0.28, post: 0.09, mattress: -0.42, depth: 0.12 }

/** The blanket over the sleeper from `edge` (its top-left, under the chin) to the footboard, with a soft hump that breathes. Begins its own path. */
function blanketPath(ctx: CanvasRenderingContext2D, edge: number, top: number) {
  ctx.beginPath()
  ctx.moveTo(edge, -0.25)
  ctx.lineTo(edge, -0.52)
  ctx.quadraticCurveTo(edge + 0.01, top, edge + 0.12, top)
  ctx.quadraticCurveTo(0.1, top + 0.02, 0.15, top + 0.01)
  // The feet's bump.
  ctx.quadraticCurveTo(0.22, top - 0.05, 0.26, -0.62)
  ctx.quadraticCurveTo(BED.x1, -0.6, BED.x1, -0.55)
  ctx.lineTo(BED.x1, -0.25)
  // A scalloped hem.
  const n = 3
  const step = (BED.x1 - edge) / n
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(BED.x1 - (i + 0.5) * step, -0.2, BED.x1 - (i + 1) * step, -0.25)
  ctx.closePath()
}

/**
 * The bed with a friend asleep under a pink blanket, Zzz rising. On a tap they sit up and
 * peek, stretch in a big yawn, and lie back down to sleep again by 1.4 s.
 */
const bed: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const up = p < 0 ? 0 : hump(p, 0.02, 0.3, 1.0, 1.35)
  const yawn = p < 0 ? 0 : hump(p, 0.5, 0.64, 0.86, 1.0)
  const peeking = p >= 0.12 && p < 0.5
  const breathe = 0.012 * wave(t, 3.2, phaseOf('bed'))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.95)
  box(ctx, BED.x0, -0.88, BED.post, 0.86, WOOD, BED.depth, true, true, 'line')
  box(ctx, BED.x0 + BED.post, -0.3, BED.x1 - BED.x0 - BED.post, 0.18, WOOD, BED.depth, false, true, 'line')
  box(ctx, BED.x0 + BED.post, BED.mattress, BED.x1 - BED.x0 - BED.post, 0.12, MATTRESS, BED.depth, true, true, 'line')
  roundRectPath(ctx, -0.36, -0.59, 0.25, 0.13, 0.055)
  part(ctx, COZY.pillow, 'line')
  const rig: Rig = {
    ...posed('stand', 0),
    lift: 0,
    sy: 1,
    lean: 0.9 * up,
    nod: -0.2 * yawn,
    shoulder: [mix(0.05, 3.9, yawn), mix(0.1, 2.2, yawn)],
    elbow: [0.2, mix(0.25, 0.35, yawn)],
    tool: null,
    eyes: peeking ? (p < 0.3 ? 'wide' : 'open') : 'closed',
    mouth: yawn > 0.4,
  }
  ctx.save()
  ctx.translate(SLEEPER_AT.x, SLEEPER_AT.y)
  ctx.rotate(-Math.PI / 2)
  ctx.scale(SLEEPER_AT.scale, SLEEPER_AT.scale)
  drawRig(ctx, SLEEPER, rig)
  ctx.restore()
  // The blanket: up to the chin asleep, down at the waist sitting up.
  const edge = mix(-0.1, 0.02, up)
  const top = -0.665 + breathe
  blanketPath(ctx, edge, top)
  part(ctx, COZY.blanket, 'line')
  // The sheet folded down over the blanket's top edge, and the blanket's stars.
  ctx.save()
  blanketPath(ctx, edge, top)
  ctx.clip()
  ctx.fillStyle = COZY.sheet
  ctx.fillRect(edge - 0.01, top - 0.02, 0.075, 0.5)
  ctx.beginPath()
  ctx.moveTo(edge + 0.065, top)
  ctx.lineTo(edge + 0.065, -0.2)
  ink(ctx, 'line')
  if (fine) {
    for (const [x, y] of [
      [0.02, -0.42],
      [0.2, -0.36],
      [-0.06, -0.3],
      [0.12, -0.53],
    ] as const) {
      starPath(ctx, x, y, 0.035)
      ctx.fillStyle = COZY.blanketStar
      ctx.fill()
    }
  }
  ctx.restore()
  blanketPath(ctx, edge, top)
  ink(ctx, 'line')
  box(ctx, BED.x1, -0.62, BED.post, 0.6, WOOD, BED.depth, true, true, 'line')
  // The Zzz, hushed while awake.
  const hush = p < 0 ? 1 : p < 0.75 ? 1 - smooth(0, 0.15, p) : smooth(1.3, 1.5, p)
  for (let i = 0; i < 3; i++) {
    const u = loop(t, 2.7, i / 3)
    const size = (0.045 + 0.055 * u) * smooth(0, 0.15, u) * (1 - smooth(0.8, 1, u)) * hush
    zee(ctx, -0.16 + 0.3 * u + 0.025 * Math.sin(TAU * u), -0.76 - 0.3 * u, size)
  }
  ctx.restore()
}

/**
 * The teddy bear, sitting with its legs out: honey fur, a light tummy and muzzle, a blue
 * bow. It blinks now and then; on a tap (the renderer hops it) it beams and holds out its
 * arm for a hug.
 */
const teddyBear: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const glad = p >= 0 && p < 0.95
  const hug = p < 0 ? 0 : hump(p, 0, 0.15, 0.75, 0.95)
  const blink = blinking(t, 4.3, 'teddyBear')
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.58)
  // Far arm and leg, in the darker fur.
  ctx.beginPath()
  ctx.moveTo(-0.05, -0.32)
  ctx.lineTo(-0.13, -0.2)
  tube(ctx, 0.08, COZY.teddyFar)
  ctx.beginPath()
  ctx.ellipse(0.04, -0.075, 0.1, 0.07, -0.15, 0, TAU)
  part(ctx, COZY.teddyFar, 'line')
  ctx.beginPath()
  ctx.ellipse(-0.02, -0.22, 0.155, 0.185, 0, 0, TAU)
  part(ctx, COZY.teddy, 'line')
  ctx.beginPath()
  ctx.ellipse(0.045, -0.2, 0.085, 0.11, 0, 0, TAU)
  part(ctx, COZY.teddyLight, 'detail')
  // Near leg and its foot pad.
  ctx.beginPath()
  ctx.ellipse(0.09, -0.065, 0.115, 0.075, -0.1, 0, TAU)
  part(ctx, COZY.teddy, 'line')
  ctx.beginPath()
  ctx.ellipse(0.19, -0.075, 0.04, 0.062, 0, 0, TAU)
  part(ctx, COZY.teddyLight, 'line')
  // Ears behind the head, then the head.
  for (const [x, y] of [
    [-0.09, -0.6],
    [0.1, -0.615],
  ] as const) {
    circlePath(ctx, x, y, 0.055)
    part(ctx, COZY.teddy, 'line')
    if (fine) {
      circlePath(ctx, x + 0.005, y + 0.005, 0.028)
      ctx.fillStyle = COZY.teddyLight
      ctx.fill()
    }
  }
  circlePath(ctx, 0.02, -0.48, 0.15)
  part(ctx, COZY.teddy, 'line')
  ctx.beginPath()
  ctx.ellipse(0.11, -0.44, 0.068, 0.052, 0, 0, TAU)
  part(ctx, COZY.teddyLight, 'detail')
  ctx.beginPath()
  ctx.ellipse(0.158, -0.462, 0.026, 0.019, 0, 0, TAU)
  ctx.fillStyle = COZY.teddyNose
  ctx.fill()
  eyes(ctx, 0.085, -0.51, 0.042, 0.075, blink ? 'closed' : glad ? 'happy' : 'open', COZY.teddy)
  smile(ctx, 0.135, -0.425, 0.045, glad, COZY.teddyLight)
  if (fine) blush(ctx, 0.035, -0.42, 0.028)
  // The bow at the neck.
  ctx.beginPath()
  ctx.moveTo(0.03, -0.345)
  ctx.lineTo(-0.04, -0.38)
  ctx.lineTo(-0.04, -0.31)
  ctx.closePath()
  ctx.moveTo(0.03, -0.345)
  ctx.lineTo(0.1, -0.38)
  ctx.lineTo(0.1, -0.31)
  ctx.closePath()
  part(ctx, COZY.ribbon, 'line')
  circlePath(ctx, 0.03, -0.345, 0.02)
  part(ctx, COZY.ribbon, 'line')
  // The near arm, held out for a hug on a tap.
  const wag = 0.03 * Math.sin(TAU * Math.min(p, 1) * 3) * hug
  const hx = mix(0.12, 0.24, hug)
  const hy = mix(-0.2, -0.4, hug) + wag
  ctx.beginPath()
  ctx.moveTo(0.03, -0.31)
  ctx.lineTo(hx, hy)
  tube(ctx, 0.08, COZY.teddy)
  if (hug > 0.5) {
    // The paw pad, held out.
    circlePath(ctx, hx + 0.004, hy, 0.024)
    ctx.fillStyle = COZY.teddyLight
    ctx.fill()
  }
  ctx.restore()
}

/** The moon lamp's globe on the bedside table. */
const LAMP = { x: 0.03, y: -0.69, r: 0.16 }

/**
 * The night lamp: a glowing moon globe on a little bedside table, its soft glow breathing
 * over three seconds. On a tap (the renderer grows it) the glow swells and two twinkles pop.
 */
const nightLamp: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const bright = p < 0 ? 0 : hump(p, 0, 0.15, 0.4, 1.3)
  const glow = 1 + 0.06 * wave(t, 3.2, phaseOf('nightLamp')) + 0.3 * bright
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.5)
  glowSpot(ctx, LAMP.x, LAMP.y, 0.34 * glow)
  box(ctx, -0.22, -0.45, 0.4, 0.43, WOOD, 0.08, true, true, 'line')
  ctx.beginPath()
  ctx.rect(-0.17, -0.38, 0.3, 0.15)
  part(ctx, WOOD.top, 'detail')
  circlePath(ctx, -0.02, -0.305, 0.022)
  part(ctx, COZY.woodMark, 'detail')
  for (const x of [-0.2, 0.13]) {
    ctx.beginPath()
    ctx.rect(x, -0.03, 0.05, 0.03)
    part(ctx, WOOD.side, 'line')
  }
  ctx.beginPath()
  ctx.moveTo(LAMP.x - 0.08, -0.48)
  ctx.quadraticCurveTo(LAMP.x, -0.57, LAMP.x + 0.08, -0.48)
  ctx.closePath()
  part(ctx, COZY.lampFoot, 'line')
  circlePath(ctx, LAMP.x, LAMP.y, LAMP.r)
  part(ctx, COZY.moonLamp, 'line')
  if (fine)
    for (const [x, y, r] of [
      [0.05, -0.03, 0.035],
      [-0.06, 0.06, 0.025],
      [0.06, 0.08, 0.02],
    ] as const) {
      circlePath(ctx, LAMP.x + x, LAMP.y + y, r)
      ctx.fillStyle = COZY.crater
      ctx.fill()
    }
  shine(ctx, LAMP.x, LAMP.y, LAMP.r)
  if (p >= 0) {
    sparkle(ctx, LAMP.x - 0.25, LAMP.y - 0.17, 0.1 * hump(p, 0.1, 0.3, 0.6, 1.0), C.sparkleWarm)
    sparkle(ctx, LAMP.x + 0.26, LAMP.y - 0.05, 0.08 * hump(p, 0.25, 0.45, 0.75, 1.15), C.sparkleWarm)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Cat

/** A paw print `size` across at (x, y), turned by rot: the big pad and four toe beans. Begins its own path. */
function pawPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  const k = size / 0.3
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.moveTo(0.12 * k, 0.07 * k)
  ctx.ellipse(0, 0.07 * k, 0.12 * k, 0.095 * k, 0, 0, TAU)
  for (const [tx, ty] of [
    [-0.125, -0.06],
    [-0.045, -0.13],
    [0.045, -0.13],
    [0.125, -0.06],
  ] as const) {
    ctx.moveTo((tx + 0.045) * k, ty * k)
    ctx.ellipse(tx * k, ty * k, 0.045 * k, 0.057 * k, tx * 2, 0, TAU)
  }
  ctx.restore()
}

/** The Cat wall's panel along the bottom, h - PANEL.h up, its top a slow wave. */
const PANEL = { h: 0.46, wave: 0.36 }

/** The Cat wallpaper: paw prints walking up the wall in pairs, a wavy panel along the bottom. */
const catWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = CAT_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = c.motif
  motifs(w, h, (x, y, n) => {
    // Two prints a step apart, as if a cat walked up the wall.
    pawPath(ctx, x - 0.1, y + 0.1, 0.26, -0.25 + 0.1 * (n % 3))
    ctx.fill()
    pawPath(ctx, x + 0.14, y - 0.14, 0.26, 0.15 + 0.1 * (n % 2))
    ctx.fill()
  })
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, h - PANEL.h)
  for (let x = 0; x < w; x += PANEL.wave) {
    ctx.quadraticCurveTo(x + PANEL.wave * 0.25, h - PANEL.h - 0.06, x + PANEL.wave * 0.5, h - PANEL.h)
    ctx.quadraticCurveTo(x + PANEL.wave * 0.75, h - PANEL.h + 0.06, x + PANEL.wave, h - PANEL.h)
  }
  ctx.lineTo(w + PANEL.wave, h)
  ctx.closePath()
  ctx.fillStyle = c.panel
  ctx.fill()
  ctx.restore()
}

/** The boards: two rows, a seam every BOARD metres, the rows' seams half a board apart. */
const BOARD = 0.5
/** The Cat floor: wooden boards in two staggered rows. */
const catFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = CAT_FLOORS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.seam
  ctx.fillRect(0, 0.08, w, 0.012)
  for (let i = 0; i * BOARD < w + BOARD; i++) {
    ctx.fillRect(i * BOARD + 0.13, 0, 0.012, 0.08)
    ctx.fillRect(i * BOARD + 0.38, 0.092, 0.012, FLOOR_BAND - 0.092)
  }
  floorEdge(ctx, w, c.edge)
  ctx.restore()
}

/** The fish lamp's body: its centre, half length and half height. */
const FISH = { y: 0.36, rx: 0.24, ry: 0.13 }

/**
 * The fish lamp: a goldfish of a paper lantern hanging on its cord, a glow under its belly,
 * its tail fanning slowly. On a tap (the renderer shakes it) its tail flaps fast and two
 * bubbles blub out of its mouth.
 */
const fishLamp: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const flap = p < 0 ? 0 : 1 - smooth(0.2, 1.2, p)
  const fan = 0.12 * wave(t, 1.8, phaseOf('fishLamp')) + 0.3 * flap * Math.sin(TAU * 4 * Math.min(p, 1.2))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  glowSpot(ctx, 0, FISH.y + 0.06, 0.18 * (1 + 0.25 * flap))
  hang(ctx, FISH.y - FISH.ry + 0.01)
  // The tail, fanning about where it meets the body.
  ctx.save()
  ctx.translate(-FISH.rx + 0.03, FISH.y)
  ctx.rotate(fan)
  ctx.beginPath()
  ctx.moveTo(0.02, 0)
  ctx.quadraticCurveTo(-0.08, -0.08, -0.15, -0.12)
  ctx.quadraticCurveTo(-0.1, 0, -0.15, 0.12)
  ctx.quadraticCurveTo(-0.08, 0.08, 0.02, 0)
  ctx.closePath()
  part(ctx, COZY.fishFin, 'line')
  ctx.restore()
  // The top fin, then the body.
  ctx.beginPath()
  ctx.moveTo(-0.1, FISH.y - FISH.ry + 0.03)
  ctx.quadraticCurveTo(-0.04, FISH.y - FISH.ry - 0.08, 0.06, FISH.y - FISH.ry + 0.01)
  ctx.closePath()
  part(ctx, COZY.fishFin, 'line')
  ctx.beginPath()
  ctx.ellipse(0, FISH.y, FISH.rx, FISH.ry, 0, 0, TAU)
  part(ctx, COZY.fish, 'line')
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, FISH.y, FISH.rx, FISH.ry, 0, 0, TAU)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(0.02, FISH.y + 0.1, 0.22, 0.08, 0, 0, TAU)
  ctx.fillStyle = COZY.fishBelly
  ctx.fill()
  if (fine) {
    // Scales: rows of little arcs.
    ctx.beginPath()
    for (const [x, y] of [
      [-0.1, -0.04],
      [-0.02, -0.04],
      [-0.14, 0.02],
      [-0.06, 0.02],
      [0.02, 0.02],
    ] as const) {
      ctx.moveTo(x - 0.03, FISH.y + y - 0.02)
      ctx.quadraticCurveTo(x + 0.02, FISH.y + y, x - 0.03, FISH.y + y + 0.03)
    }
    ctx.lineWidth = 0.012
    ctx.strokeStyle = COZY.fishFin
    ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.ellipse(0, FISH.y, FISH.rx, FISH.ry, 0, 0, TAU)
  ink(ctx, 'line')
  // A gill line and a round lantern eye.
  ctx.beginPath()
  ctx.moveTo(0.1, FISH.y - 0.08)
  ctx.quadraticCurveTo(0.06, FISH.y, 0.1, FISH.y + 0.08)
  ink(ctx, 'detail')
  circlePath(ctx, 0.16, FISH.y - 0.03, 0.032)
  part(ctx, COZY.fishEye, 'detail')
  circlePath(ctx, 0.168, FISH.y - 0.03, 0.016)
  ctx.fillStyle = INK
  ctx.fill()
  shine(ctx, 0, FISH.y, FISH.ry)
  if (p >= 0)
    for (let i = 0; i < 2; i++) {
      const u = clamp01((p - 0.15 - i * 0.25) / 0.8)
      if (u <= 0 || u >= 1) continue
      const r = 0.035 * (1 - i * 0.25) * Math.sin(Math.PI * u)
      circlePath(ctx, 0.27 + 0.06 * u, FISH.y - 0.02 - 0.26 * u, r)
      part(ctx, COZY.bubble, 'detail')
    }
  ctx.restore()
}

/** The cat on the shelf: where it lies, its coat, and the pivot its tail hangs from over the shelf's front edge. */
const SHELF_CAT = { x: 0.02, y: 0.025, coat: 'tuxedo' } as const
const TAIL_PIVOT = { x: -0.24, y: 0.1 }
/** Where the shelf cat's meow comes from: its sound rings centre on its mouth. */
const MEOW = { x: 0.23, y: -0.17 }

/**
 * The shelf cat: a cat lazing as a loaf on a wall shelf, its tail hanging over the edge and
 * swaying. On a tap it lifts its head and meows with its eyes shut, sound rings going out
 * from its mouth, and its tail curls up.
 */
const catShelf: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const meow = p < 0 ? 0 : hump(p, 0.02, 0.15, 0.75, 0.95)
  const swing = 0.22 * wave(t, 2.4, phaseOf('catShelf')) - 0.45 * meow * (1 + 0.3 * Math.sin(TAU * 3 * Math.min(p, 1)))
  const coat = SHELF_CAT.coat
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  shelf(ctx, -0.38, 0.38, 0.06)
  const mood = meow > 0.3 ? 'happy' : blinking(t, 3.9, 'catShelf') ? 'closed' : 'open'
  catAt(ctx, { coat, pose: 'lie', eyes: mood, meow: meow > 0.3, tail: 0, lift: 0.04 * meow, tilt: -0.2 * meow, step: 0, wave: 0, kitten: false }, lodNow(), SHELF_CAT.x, SHELF_CAT.y, 1, 1, 1, 0)
  // The tail, hanging over the front edge from the cat's rear and swaying.
  const [mx, my] = turnAbout(TAIL_PIVOT.x, TAIL_PIVOT.y + 0.1, TAIL_PIVOT.x, TAIL_PIVOT.y, swing)
  const [tx, ty] = turnAbout(TAIL_PIVOT.x + 0.05, TAIL_PIVOT.y + 0.19, TAIL_PIVOT.x, TAIL_PIVOT.y, swing * 1.4)
  ctx.beginPath()
  ctx.moveTo(-0.15, -0.03)
  ctx.quadraticCurveTo(TAIL_PIVOT.x - 0.01, -0.03, TAIL_PIVOT.x, TAIL_PIVOT.y)
  ctx.quadraticCurveTo(mx, my, tx, ty)
  tube(ctx, 0.046, CAT_COATS[coat].fur)
  if (meow > 0.05) {
    // Sound rings going out from the mouth.
    const u = clamp01((p - 0.1) / 0.8)
    ctx.beginPath()
    for (let i = 0; i < 2; i++) {
      const r = 0.09 + 0.055 * i + 0.03 * u
      ctx.moveTo(MEOW.x + Math.cos(-0.5) * r, MEOW.y + Math.sin(-0.5) * r)
      ctx.arc(MEOW.x, MEOW.y, r, -0.5, 0.5)
    }
    tube(ctx, 0.016 * meow, C.sparkleWarm)
  }
  ctx.restore()
}

/** The cat tree: the low cat's seat on the cubby and the high cat's on the platform, their coats and size. */
const TREE = { low: [-0.21, -0.47] as const, high: [0.2, -0.83] as const, scale: 0.7, lowCoat: 'grey', highCoat: 'calico' } as const
/** How high a cat hops to turn round once home. */
const TURN_HOP = 0.06

/**
 * The cat tree: a sisal post, a cubby with a round door and a platform on top, a pompom
 * dangling. Two cats sit on it looking at each other. On a tap they swap places with a leap
 * each (one over, one under), look out from their new seats, leap back and hop round to
 * face each other, by 1.4 s.
 */
const catTree: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const lod = lodNow()
  const fine = lod !== 'S'
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.9)
  box(ctx, -0.43, -0.08, 0.8, 0.07, CARPET, 0.06, true, true, 'line')
  ctx.beginPath()
  ctx.rect(0.1, -0.78, 0.1, 0.7)
  part(ctx, COZY.sisal, 'line')
  if (fine) {
    ctx.beginPath()
    for (let y = -0.74; y < -0.1; y += 0.045) {
      ctx.moveTo(0.1, y + 0.02)
      ctx.lineTo(0.2, y)
    }
    ctx.lineWidth = 0.012
    ctx.strokeStyle = COZY.sisalMark
    ctx.stroke()
  }
  box(ctx, -0.42, -0.44, 0.38, 0.36, CUBBY, 0.06, true, true, 'line')
  ctx.beginPath()
  ctx.ellipse(-0.23, -0.25, 0.085, 0.1, 0, 0, TAU)
  part(ctx, COZY.hole, 'line')
  box(ctx, -0.02, -0.8, 0.44, 0.06, CARPET, 0.06, true, true, 'line')
  // The pompom on its string, knocked swinging by the leaps.
  const knock = p < 0 ? 0 : 0.5 * Math.sin(TAU * Math.min(p, 2) / 0.9) * (1 - smooth(0.2, 1.6, p))
  const sway = 0.12 * wave(t, 2.3, phaseOf('catTree')) + knock
  const [px, py] = turnAbout(0.36, -0.52, 0.36, -0.74, sway)
  ctx.beginPath()
  ctx.moveTo(0.36, -0.74)
  ctx.lineTo(px, py)
  ink(ctx, 'detail')
  blob(ctx, [px, py + 0.02, 0.04, px - 0.02, py + 0.04, 0.03, px + 0.02, py + 0.045, 0.03], COZY.pompom, 'line')
  // The two cats: idle the low one faces right, the high one left. Each leaps there and back,
  // a little apart in time, the low one arching over while the high one swoops under it, and
  // once home each turns round to face the other with a hop.
  const blink = blinking(t, 4.1, 'catTree')
  const cats = [
    { coat: TREE.lowCoat, home: TREE.low, away: TREE.high, rest: 1, lift: 0.2, go: [0.1, 0.45], back: [0.88, 1.2], id: 0 },
    { coat: TREE.highCoat, home: TREE.high, away: TREE.low, rest: -1, lift: -0.1, go: [0.2, 0.52], back: [0.78, 1.12], id: 1 },
  ] as const
  for (const cat of cats) {
    const go = p < 0 ? 0 : smooth(cat.go[0], cat.go[1], p)
    const back = p < 0 ? 0 : smooth(cat.back[0], cat.back[1], p)
    const crouch = p < 0 ? 1 : 1 - 0.1 * (hump(p, cat.go[0] - 0.1, cat.go[0] - 0.04, cat.go[0] - 0.02, cat.go[0]) + hump(p, cat.back[0] - 0.1, cat.back[0] - 0.04, cat.back[0] - 0.02, cat.back[0]))
    // The turn: a hop of TURN_HOP over 0.18 s once home, flipping round at its top.
    const turnAt = cat.back[1] + 0.06
    const turning = p >= turnAt && p < turnAt + 0.18
    const hop = turning ? TURN_HOP * arch((p - turnAt) / 0.18) : 0
    const facing = back >= 1 && p >= turnAt + 0.09 ? cat.rest : back > 0 ? -cat.rest : cat.rest
    const leaping = go > 0 && go < 1 ? 'go' : back > 0 && back < 1 ? 'back' : null
    if (leaping) {
      const [from, to, u] = leaping === 'go' ? [cat.home, cat.away, go] : [cat.away, cat.home, back]
      const [x, y] = jumpAt(from, to, u, cat.lift)
      catAt(ctx, { coat: cat.coat, pose: 'jump', eyes: 'wide', meow: false, tail: 0.2, lift: 0, tilt: 0, step: 0, wave: 0, kitten: false }, lod, x, y + 0.03, facing, TREE.scale, 1, jumpTilt(from, to, u, cat.lift) * facing)
    } else {
      const away = go >= 1 && back <= 0
      const [x, y] = away ? cat.away : cat.home
      const mood = away ? 'happy' : blink ? 'closed' : 'open'
      catAt(ctx, { coat: cat.coat, pose: 'sit', eyes: mood, meow: away && cat.id === 0, tail: 0.15 * wave(t, 2.8, cat.id * 0.4), lift: 0, tilt: 0, step: 0, wave: 0, kitten: false }, lod, x, y - hop, facing, TREE.scale, crouch, 0)
    }
  }
  ctx.restore()
}

/** The cardboard box's front face and how far its top recedes. */
const CARTON = { x: -0.33, y: -0.36, w: 0.6, h: 0.36, d: 0.12 }
/** Where the cat crouches inside (its eyes just over the rim), how high it springs, how high it then sits up in the box, its coat and size. */
const BOX_CAT = { x: 0.0, y: -0.14, spring: 0.46, sitUp: 0.13, coat: 'ginger', scale: 0.82 } as const

/**
 * The box cat: a ginger cat hiding in an open cardboard box, only its ears, eyes and two
 * paws over the rim, looking about. On a tap it ducks, springs right up out of the box,
 * drops back to sit up tall in it with a meow, the flaps flapping, and sinks back in by 1.4 s.
 */
const boxCat: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const { x, y, w, h, d } = CARTON
  const duck = p < 0 ? 0 : 0.05 * hump(p, 0, 0.1, 0.1, 0.18)
  const spring = p < 0 ? 0 : (BOX_CAT.spring - BOX_CAT.sitUp) * hump(p, 0.1, 0.3, 0.3, 0.5)
  const rise = p < 0 ? 0 : BOX_CAT.sitUp * hump(p, 0.1, 0.3, 0.95, 1.35) + spring - duck
  const flap = p < 0 ? 0 : 0.6 * hump(p, 0.15, 0.3, 0.3, 0.7)
  const up = rise > 0.08
  const flying = spring > 0.05
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.78)
  // The back flap, standing up behind the opening.
  ctx.beginPath()
  ctx.moveTo(x + d, y - d)
  ctx.lineTo(x + w + d, y - d)
  ctx.lineTo(x + w + d + 0.03, y - d - 0.16 - 0.04 * flap)
  ctx.lineTo(x + d + 0.03, y - d - 0.16 - 0.04 * flap)
  ctx.closePath()
  part(ctx, CARDBOARD.top, 'line')
  // The dark inside, seen through the open top.
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + d, y - d)
  ctx.lineTo(x + w + d, y - d)
  ctx.lineTo(x + w, y)
  ctx.closePath()
  part(ctx, COZY.boxInside, 'line')
  // The left flap folded out.
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + d, y - d)
  ctx.lineTo(x + d - 0.13, y - d - 0.07 - 0.06 * flap)
  ctx.lineTo(x - 0.13, y - 0.07 - 0.06 * flap)
  ctx.closePath()
  part(ctx, CARDBOARD.top, 'line')
  const looking = 0.12 * wave(t, 3.4, phaseOf('boxCat'))
  const mood = up ? (flying ? 'wide' : 'happy') : blinking(t, 3.6, 'boxCat') ? 'closed' : 'open'
  catAt(ctx, { coat: BOX_CAT.coat, pose: 'sit', eyes: mood, meow: up && !flying, tail: 0.25 * wave(t, 2.2, 0.3), lift: 0, tilt: up ? 0 : looking, step: 0, wave: 0, kitten: false }, lodNow(), BOX_CAT.x, BOX_CAT.y - rise, 1, BOX_CAT.scale, flying ? 1.08 : 1, 0)
  box(ctx, x, y, w, h, CARDBOARD, d, false, true, 'line')
  if (fine) {
    ctx.beginPath()
    ctx.rect(x + w / 2 - 0.05, y + 0.1, 0.1, h - 0.1)
    ctx.fillStyle = COZY.boxTape
    ctx.fill()
  }
  // The right flap folded out, and the front flap folded down over the front.
  ctx.beginPath()
  ctx.moveTo(x + w, y)
  ctx.lineTo(x + w + d, y - d)
  ctx.lineTo(x + w + d + 0.13, y - d + 0.05 - 0.08 * flap)
  ctx.lineTo(x + w + 0.13, y + 0.05 - 0.08 * flap)
  ctx.closePath()
  part(ctx, CARDBOARD.top, 'line')
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w - 0.03, y + 0.12 - 0.05 * flap)
  ctx.lineTo(x + 0.03, y + 0.12 - 0.05 * flap)
  ctx.closePath()
  part(ctx, CARDBOARD.top, 'line')
  if (!flying) {
    // Two paws holding the rim.
    for (const px of [-0.03, 0.09]) {
      ctx.beginPath()
      ctx.ellipse(px, y - 0.005, 0.045, 0.028, 0, 0, TAU)
      part(ctx, CAT_COATS[BOX_CAT.coat].light, 'line')
    }
  }
  ctx.restore()
}

/** The yarn ball's home and size, and the kitten's home and size: it crouches left of the ball, watching. */
const YARN = { x: 0.18, r: 0.12 }
const KITTEN = { x: -0.21, scale: 0.62, coat: 'cream' } as const

/**
 * A ball of pink yarn with its loose end trailing, and a kitten crouched behind it watching,
 * its tail swishing. On a tap the kitten pounces onto the ball and rides it as it rolls,
 * then hops back to its spot by 1.4 s.
 */
const yarnBall: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const leap = p < 0 ? 0 : smooth(0.1, 0.45, p)
  const hopBack = p < 0 ? 0 : smooth(0.95, 1.35, p)
  const ride = p < 0 ? 0 : hump(p, 0.42, 0.5, 0.85, 0.95)
  const roll = 0.06 * ride * Math.sin(TAU * clamp01((p - 0.45) / 0.5))
  const bx = YARN.x + roll
  const by = -YARN.r
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.save()
  ctx.translate(bx, 0)
  groundShadow(ctx, 0.28)
  ctx.restore()
  ctx.save()
  ctx.translate(KITTEN.x, 0)
  groundShadow(ctx, 0.3)
  ctx.restore()
  // The loose end, trailing back towards the kitten's paws.
  ctx.beginPath()
  ctx.moveTo(bx - 0.06, by + 0.1)
  ctx.quadraticCurveTo(bx - 0.14, -0.005, -0.02, -0.012)
  ctx.quadraticCurveTo(-0.07, -0.02, -0.1, -0.008)
  tube(ctx, 0.014, COZY.yarn)
  circlePath(ctx, bx, by, YARN.r)
  part(ctx, COZY.yarn, 'line')
  if (fine) {
    ctx.save()
    circlePath(ctx, bx, by, YARN.r)
    ctx.clip()
    ctx.translate(bx, by)
    ctx.rotate(roll / YARN.r)
    ctx.beginPath()
    for (const [a, k] of [
      [0.5, 0.55],
      [-0.6, 0.75],
      [1.6, 0.4],
    ] as const) {
      ctx.save()
      ctx.rotate(a)
      ctx.moveTo(-YARN.r, -YARN.r * k + 0.04)
      ctx.quadraticCurveTo(0, -YARN.r * k - 0.04, YARN.r, -YARN.r * k + 0.04)
      ctx.moveTo(-YARN.r, -YARN.r * k + 0.08)
      ctx.quadraticCurveTo(0, -YARN.r * k, YARN.r, -YARN.r * k + 0.08)
      ctx.restore()
    }
    ctx.lineWidth = 0.012
    ctx.strokeStyle = COZY.yarnMark
    ctx.stroke()
    ctx.restore()
  }
  const home = [KITTEN.x, 0] as const
  const onBall = [YARN.x - 0.02, -2 * YARN.r + 0.03] as const
  const swish = 0.25 * wave(t, 1.9, phaseOf('yarnBall'))
  const kitten = (pose: 'lie' | 'jump', eyesOf: CatPic['eyes']): CatPic => ({ coat: KITTEN.coat, pose, eyes: eyesOf, meow: false, tail: swish, lift: 0, tilt: 0, step: 0, wave: 0, kitten: true })
  const lod = lodNow()
  if (leap > 0 && leap < 1) {
    const [x, y] = jumpAt(home, onBall, leap, 0.16)
    catAt(ctx, kitten('jump', 'wide'), lod, x, y, 1, KITTEN.scale, 1, jumpTilt(home, onBall, leap, 0.16))
  } else if (leap >= 1 && hopBack <= 0) {
    catAt(ctx, kitten('lie', 'happy'), lod, onBall[0] + roll, onBall[1], 1, KITTEN.scale, 1, -roll * 2.5)
  } else if (hopBack > 0 && hopBack < 1) {
    const [x, y] = jumpAt(onBall, home, hopBack, 0.12)
    catAt(ctx, kitten('lie', 'happy'), lod, x, y, 1, KITTEN.scale, 1.04, 0)
  } else {
    const wiggle = p < 0 ? 0 : hump(p, 0, 0.04, 0.06, 0.1)
    catAt(ctx, kitten('lie', blinking(t, 4.4, 'yarnBall') ? 'closed' : 'open'), lod, home[0], home[1], 1, KITTEN.scale, 1 - 0.08 * wiggle, 0)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Kitchen

/** The checker tiles' size, and how high the trim row runs above the floor line. */
const TILE = 0.36
const TRIM_AT = 1.08

/** The Kitchen wallpaper: a checker of big tiles with a trim row at counter height. */
const kitchenWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = KITCHEN_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = c.tile
  // Rows count up from the floor line, so a tile row always meets the floor.
  const floorLine = h - FLOOR_BAND
  for (let j = 0; floorLine - j * TILE > -TILE; j++)
    for (let i = 0; i * TILE < w; i++) if ((i + j) % 2 === 0) ctx.fillRect(i * TILE, floorLine - (j + 1) * TILE, TILE, TILE)
  ctx.fillStyle = c.trim
  ctx.fillRect(0, floorLine - TRIM_AT - 0.05, w, 0.1)
  ctx.restore()
}

/** The Kitchen floor: a checker of tiles in two rows, seen from a little above. */
const kitchenFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = KITCHEN_FLOORS[variant]
  ctx.save()
  ctx.fillStyle = c.b
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.a
  for (let i = 0; i * 0.2 < w; i++) ctx.fillRect(i * 0.2, (i % 2) * 0.085, 0.2, 0.085)
  floorEdge(ctx, w, c.edge)
  ctx.restore()
}

/** The pot lamp's shade: the upturned pot's top and rim heights, its half widths. */
const POT_SHADE = { top: 0.2, rim: 0.42, topW: 0.17, rimW: 0.2 }

/**
 * The pot lamp: an upturned red enamel saucepan for a shade, its long handle sticking out,
 * the bulb glowing under it, a little wooden spoon dangling on its pull cord. On a tap (the
 * renderer shakes it) the light glows up and the spoon swings.
 */
const potLamp: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const fine = fineNow()
  const bright = p < 0 ? 0 : hump(p, 0, 0.1, 0.5, 1.2)
  const swing = 0.15 * wave(t, 2.1, phaseOf('potLamp')) + (p < 0 ? 0 : 0.6 * Math.sin(TAU * Math.min(p, 1.5) / 0.75) * (1 - smooth(0, 1.5, p)))
  const { top, rim, topW, rimW } = POT_SHADE
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  glowSpot(ctx, 0, rim + 0.02, 0.15 * (1 + 0.3 * bright))
  hang(ctx, top)
  // The spoon on its pull cord, swinging from the rim.
  const [sx, sy] = turnAbout(-0.12, rim + 0.12, -0.12, rim, swing)
  ctx.beginPath()
  ctx.moveTo(-0.12, rim)
  ctx.lineTo(sx, sy)
  ink(ctx, 'detail')
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(swing)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 0.05)
  tube(ctx, 0.014, WOOD.face)
  ctx.beginPath()
  ctx.ellipse(0, 0.075, 0.022, 0.03, 0, 0, TAU)
  part(ctx, WOOD.face, 'detail')
  ctx.restore()
  circlePath(ctx, 0, rim + 0.01, 0.06)
  part(ctx, COZY.bulb, 'line')
  // The saucepan's long handle, then the pan upside down with its white enamel rim.
  ctx.beginPath()
  ctx.moveTo(rimW - 0.03, rim - 0.07)
  ctx.lineTo(0.41, rim - 0.14)
  tube(ctx, 0.04, COZY.panHandle)
  if (fine) {
    circlePath(ctx, 0.385, rim - 0.135, 0.009)
    ctx.fillStyle = C.white
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(-rimW, rim)
  ctx.lineTo(-topW, top + 0.04)
  ctx.quadraticCurveTo(-topW, top, -topW + 0.04, top)
  ctx.lineTo(topW - 0.04, top)
  ctx.quadraticCurveTo(topW, top, topW, top + 0.04)
  ctx.lineTo(rimW, rim)
  ctx.closePath()
  part(ctx, COZY.enamel, 'line')
  roundRectPath(ctx, -rimW - 0.02, rim - 0.035, 2 * rimW + 0.04, 0.045, 0.02)
  part(ctx, COZY.enamelRim, 'line')
  shine(ctx, -0.04, top + 0.12, 0.13)
  ctx.restore()
}

/** The jars on the shelf: where each stands, its size, how full, what is in it and its lid. */
const JARS = [
  { x: -0.26, w: 0.15, h: 0.25, full: 0.72, kind: 'jam', lid: 0 },
  { x: -0.085, w: 0.16, h: 0.19, full: 0.8, kind: 'cookie', lid: 1 },
  { x: 0.09, w: 0.15, h: 0.29, full: 0.74, kind: 'pasta', lid: 2 },
  { x: 0.26, w: 0.13, h: 0.18, full: 0.7, kind: 'peas', lid: 3 },
] as const
const JAR_FILL = { jam: COZY.jam, cookie: COZY.cookie, pasta: COZY.pasta, peas: COZY.peas } as const
const JAR_MARK = { jam: COZY.jamSeed, cookie: COZY.cookieDot, pasta: COZY.pastaMark, peas: COZY.peasMark } as const
/** The shelf's top front edge, and where the jars stand on it (half way back). */
const JAR_SHELF_Y = 0.15
const JAR_FOOT = JAR_SHELF_Y - 0.035

/** One jar standing at (x, foot): glass, what is in it, its lid, a glint. */
function drawJar(ctx: CanvasRenderingContext2D, jar: (typeof JARS)[number], foot: number, fine: boolean) {
  const { w, h } = jar
  const x0 = jar.x - w / 2
  const y0 = foot - h
  roundRectPath(ctx, x0, y0, w, h, 0.035)
  ctx.fillStyle = COZY.glass
  ctx.fill()
  ctx.save()
  roundRectPath(ctx, x0, y0, w, h, 0.035)
  ctx.clip()
  const level = foot - h * jar.full
  ctx.fillStyle = JAR_FILL[jar.kind]
  ctx.fillRect(x0, level, w, foot - level)
  if (fine) {
    ctx.fillStyle = JAR_MARK[jar.kind]
    for (let i = 0; i < 5; i++) {
      const mx = x0 + 0.03 + ((i * 0.047) % (w - 0.05))
      const my = level + 0.03 + ((i * 0.031) % Math.max(0.01, foot - level - 0.05))
      circlePath(ctx, mx, my, jar.kind === 'cookie' ? 0.012 : 0.009)
      ctx.fill()
    }
  }
  ctx.restore()
  roundRectPath(ctx, x0, y0, w, h, 0.035)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(x0 + 0.03, y0 + 0.04)
  ctx.lineTo(x0 + 0.03, y0 + h * 0.45)
  ctx.lineWidth = 0.014
  ctx.strokeStyle = C.white
  ctx.stroke()
  roundRectPath(ctx, x0 - 0.012, y0 - 0.045, w + 0.024, 0.05, 0.015)
  part(ctx, COZY.lids[jar.lid], 'line')
}

/**
 * The jar shelf: four glass jars of jam, cookies, pasta and peas on a wooden wall shelf. On a
 * tap (the renderer shakes the shelf) the jars hop one after another, clinking.
 */
const jarShelf: ItemDraw = (ctx, t, play) => {
  void t
  const p = tapAge(play)
  const fine = fineNow()
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  shelf(ctx, -0.39, 0.38, JAR_SHELF_Y)
  JARS.forEach((jar, i) => {
    const u = p < 0 ? -1 : (p - 0.05 - i * 0.12) / 0.28
    const lift = u > 0 && u < 1 ? 0.07 * arch(u) : 0
    drawJar(ctx, jar, JAR_FOOT - lift, fine)
  })
  if (p >= 0)
    for (let i = 0; i < 3; i++) {
      const k = hump(p, 0.3 + i * 0.12, 0.38 + i * 0.12, 0.45 + i * 0.12, 0.6 + i * 0.12)
      const x = (JARS[i]!.x + JARS[i + 1]!.x) / 2
      sparkle(ctx, x, JAR_FOOT - 0.22, 0.09 * k, C.sparkleWarm)
    }
  ctx.restore()
}

/** The oven's body, its door (hinged along its bottom), and the cake tin inside. */
const OVEN_BODY = { x: -0.38, y: -0.88, w: 0.7, h: 0.86, d: 0.1 }
const DOOR = { x: -0.32, y: -0.72, w: 0.58, h: 0.5 }
/** How much an opening door seems to come towards the viewer: the boxes' depth, flattened. */
const DOOR_LEAN = 0.35

/**
 * The oven: a coral range with a hob on top, three knobs, a window glowing warm and a
 * drawer. On a tap the door drops open, a cake rises up in its tin with a puff of steam and
 * a ding, and the door closes again by 1.35 s.
 */
const oven: ItemDraw = (ctx, t, play) => {
  void t
  const p = tapAge(play)
  const fine = fineNow()
  const open = p < 0 ? 0 : hump(p, 0, 0.25, 1.0, 1.35)
  const rise = p < 0 ? 0 : smooth(0.2, 0.6, p)
  const { x, y, w, h, d } = OVEN_BODY
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.8)
  for (const fx of [x + 0.04, x + w - 0.1]) {
    ctx.beginPath()
    ctx.rect(fx, -0.03, 0.06, 0.03)
    part(ctx, BOX.steel.side, 'line')
  }
  box(ctx, x, y, w, h - 0.02, OVEN, d, true, true, 'line')
  // The hob's two burners on the top.
  for (const bx of [x + 0.2, x + 0.48]) {
    ctx.beginPath()
    ctx.ellipse(bx + d / 2, y - d / 2, 0.09, 0.025, 0, 0, TAU)
    part(ctx, BOX.steel.side, 'detail')
  }
  // The control strip: three knobs and a little light.
  ctx.beginPath()
  ctx.rect(x + 0.04, y + 0.04, w - 0.08, 0.1)
  part(ctx, OVEN.top, 'detail')
  for (const kx of [x + 0.12, x + 0.24, x + 0.36]) {
    circlePath(ctx, kx, y + 0.09, 0.03)
    part(ctx, C.white, 'detail')
  }
  ctx.beginPath()
  ctx.rect(x + w - 0.2, y + 0.07, 0.12, 0.04)
  part(ctx, open > 0 ? C.sparkleWarm : COZY.ovenGlow, 'detail')
  // The drawer.
  ctx.beginPath()
  ctx.rect(DOOR.x, -0.19, DOOR.w, 0.13)
  part(ctx, OVEN.top, 'line')
  ctx.beginPath()
  ctx.moveTo(DOOR.x + 0.2, -0.125)
  ctx.lineTo(DOOR.x + DOOR.w - 0.2, -0.125)
  tube(ctx, 0.02, BOX.steel.top)
  // Inside, while the door is open: the warm cavity and the cake rising in its tin.
  if (open > 0.02) {
    ctx.beginPath()
    ctx.rect(DOOR.x, DOOR.y, DOOR.w, DOOR.h)
    part(ctx, COZY.ovenInside, 'line')
    glowSpot(ctx, DOOR.x + DOOR.w / 2, DOOR.y + DOOR.h * 0.6, 0.2)
    const tin = DOOR.y + DOOR.h - 0.1
    const tall = 0.05 + 0.15 * rise
    ctx.beginPath()
    ctx.moveTo(-0.15, tin)
    ctx.bezierCurveTo(-0.15, tin - tall * 1.3, 0.11, tin - tall * 1.3, 0.11, tin)
    ctx.closePath()
    part(ctx, COZY.cake, 'line')
    if (fine && rise > 0.3) {
      ctx.beginPath()
      ctx.moveTo(-0.12, tin - tall * 0.55)
      ctx.quadraticCurveTo(-0.02, tin - tall * 0.9, 0.08, tin - tall * 0.55)
      ink(ctx, 'detail')
    }
    if (rise > 0.5) {
      const r = 0.035 * smooth(0.5, 0.8, rise)
      circlePath(ctx, -0.02, tin - tall * 0.98 - r, r)
      part(ctx, COZY.cherry, 'detail')
      shine(ctx, -0.02, tin - tall * 0.98 - r, r)
    }
    ctx.beginPath()
    ctx.rect(-0.17, tin, 0.3, 0.07)
    part(ctx, BOX.steel.face, 'line')
  }
  // The door, hinged along its bottom: its outer face while it tips, its inner face once it lies open.
  const a = (Math.PI / 2) * open
  const hinge = DOOR.y + DOOR.h
  const topY = hinge - DOOR.h * Math.cos(a) + DOOR.h * Math.sin(a) * DOOR_LEAN
  const shift = -DOOR.h * Math.sin(a) * DOOR_LEAN
  ctx.beginPath()
  ctx.moveTo(DOOR.x, hinge)
  ctx.lineTo(DOOR.x + DOOR.w, hinge)
  ctx.lineTo(DOOR.x + DOOR.w + shift, topY)
  ctx.lineTo(DOOR.x + shift, topY)
  ctx.closePath()
  const outer = topY < hinge - 0.005
  part(ctx, outer ? OVEN.top : BOX.steel.top, 'line')
  if (outer) {
    // The window and the handle, squeezed with the door.
    const k = (hinge - topY) / DOOR.h
    const at = (u: number, v: number): [number, number] => [DOOR.x + u * DOOR.w + shift * v, hinge - (hinge - topY) * v]
    const wy0 = 0.18
    const wy1 = 0.72
    const [ax, ay] = at(0.14, wy1)
    const [bx2] = at(0.86, wy1)
    const [, cy] = at(0.14, wy0)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx2, ay)
    ctx.lineTo(bx2 - shift * (wy1 - wy0), cy)
    ctx.lineTo(ax - shift * (wy1 - wy0), cy)
    ctx.closePath()
    part(ctx, COZY.ovenWindow, 'line')
    if (fine && k > 0.5) {
      ctx.save()
      ctx.clip()
      glowSpot(ctx, (ax + bx2) / 2, (ay + cy) / 2 + 0.04, 0.16)
      ctx.restore()
      ctx.beginPath()
      ctx.moveTo(ax + 0.05, ay + 0.1 * k)
      ctx.lineTo(ax + 0.11, ay + 0.03 * k)
      ctx.moveTo(ax + 0.09, ay + 0.13 * k)
      ctx.lineTo(ax + 0.15, ay + 0.06 * k)
      ctx.lineWidth = 0.012
      ctx.strokeStyle = C.white
      ctx.stroke()
    }
    const [hx0, hy] = at(0.18, 0.88)
    const [hx1] = at(0.82, 0.88)
    ctx.beginPath()
    ctx.moveTo(hx0, hy)
    ctx.lineTo(hx1, hy)
    tube(ctx, 0.028, BOX.steel.top)
  }
  if (p >= 0) {
    // The puff of steam out of the opening, and the ding's twinkle by the light.
    const u = clamp01((p - 0.25) / 0.9)
    puff(ctx, -0.05 + 0.05 * u, DOOR.y - 0.05 - 0.28 * u, 0.1 * Math.sin(Math.PI * u), COZY.steam)
    sparkle(ctx, x + w - 0.04, y - 0.06, 0.12 * hump(p, 0.18, 0.3, 0.45, 0.7), C.sparkleWarm)
  }
  ctx.restore()
}

/** The friend cooking, and how big they stand (the chef's hat on top makes them 1.2 m). */
const CHEF: Look = FRIENDS[5]!
const CHEF_SCALE = 0.86
/** The mixing bowl held at the tummy: its rim's centre and half width, and how deep it is. */
const BOWL = { x: 0.33, y: -0.5, rx: 0.13, ry: 0.032, deep: 0.13 }

/** The chef's hat on the rig's head (in its head frame): a band and a puffy top. */
function chefHat(ctx: CanvasRenderingContext2D) {
  const { x, y, r } = HEAD
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.08)
  blob(ctx, [-0.09, -0.27, 0.095, 0.02, -0.31, 0.11, 0.12, -0.26, 0.09], COZY.chefHat, 'line')
  roundRectPath(ctx, -r * 0.92, -r - 0.025, r * 1.84, 0.1, 0.03)
  part(ctx, COZY.chefHat, 'line')
  ctx.restore()
}

/**
 * The cook: a friend in a chef's hat stirring a bowl of batter held at their tummy. On a tap
 * they lift the spoon for a taste, shut their eyes, then beam with a little hop and a heart,
 * and go back to stirring by 1.3 s.
 */
const cook: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const taste = p < 0 ? 0 : hump(p, 0, 0.3, 0.95, 1.3)
  const happy = p >= 0.55 && p < 1.05
  const phi = TAU * loop(t, 1.3, phaseOf('cook'))
  const stir = { x: BOWL.x - 0.02 + 0.04 * Math.cos(phi), y: BOWL.y - 0.08 + 0.012 * Math.sin(phi) }
  const lips = { x: 0.21, y: -0.66 }
  const hx = mix(stir.x, lips.x, taste)
  const hy = mix(stir.y, lips.y, taste)
  const [shoulder, elbow] = armTo(1, hx, hy)
  const base = posed('stand', t)
  const rig: Rig = {
    ...base,
    lift: 0,
    sy: 1,
    lean: 0,
    nod: 0,
    tool: null,
    shoulder: [0.95, shoulder],
    elbow: [0.85, elbow],
    eyes: happy ? 'happy' : p >= 0.3 && p < 0.55 ? 'closed' : base.eyes,
    mouth: happy,
  }
  const hop = p < 0 ? 0 : -0.05 * arch(clamp01((p - 0.55) / 0.3))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.scale(CHEF_SCALE, CHEF_SCALE)
  groundShadow(ctx, 0.55)
  ctx.translate(0, hop)
  drawRig(ctx, CHEF, rig)
  inRig(ctx, rig, 'head', () => chefHat(ctx))
  // The batter in the bowl, the spoon in it (or at the lips), the bowl's front, the mitten round the spoon.
  ctx.beginPath()
  ctx.ellipse(BOWL.x, BOWL.y, BOWL.rx, BOWL.ry, 0, 0, TAU)
  part(ctx, COZY.bowlIn, 'line')
  ctx.beginPath()
  ctx.ellipse(BOWL.x, BOWL.y + 0.006, BOWL.rx - 0.02, BOWL.ry - 0.008, 0, 0, TAU)
  ctx.fillStyle = COZY.batter
  ctx.fill()
  const point = mix(Math.PI / 2 - 0.15, Math.PI + 0.45, taste)
  const ux = Math.cos(point)
  const uy = Math.sin(point)
  ctx.beginPath()
  ctx.moveTo(hx - ux * 0.05, hy - uy * 0.05)
  ctx.lineTo(hx + ux * 0.13, hy + uy * 0.13)
  tube(ctx, 0.022, WOOD.face)
  ctx.save()
  ctx.translate(hx + ux * 0.16, hy + uy * 0.16)
  ctx.rotate(point)
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.04, 0.026, 0, 0, TAU)
  part(ctx, WOOD.face, 'detail')
  if (taste > 0.5) {
    ctx.beginPath()
    ctx.ellipse(0.005, 0, 0.024, 0.015, 0, 0, TAU)
    ctx.fillStyle = COZY.batter
    ctx.fill()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(BOWL.x - BOWL.rx, BOWL.y)
  ctx.bezierCurveTo(BOWL.x - BOWL.rx, BOWL.y + BOWL.deep * 1.1, BOWL.x + BOWL.rx, BOWL.y + BOWL.deep * 1.1, BOWL.x + BOWL.rx, BOWL.y)
  ctx.ellipse(BOWL.x, BOWL.y, BOWL.rx, BOWL.ry, 0, 0, Math.PI)
  ctx.closePath()
  part(ctx, COZY.bowl, 'line')
  shine(ctx, BOWL.x - 0.01, BOWL.y + 0.02, BOWL.rx * 0.8)
  // The far hand holding the bowl's side, and the near one round the spoon.
  mitten(ctx, CHEF, BOWL.x - BOWL.rx + 0.005, BOWL.y + 0.045, 0.9)
  mitten(ctx, CHEF, hx, hy, 1)
  if (p >= 0) {
    const u = clamp01((p - 0.6) / 0.6)
    const s = 0.11 * Math.sin(Math.PI * u)
    if (s > 0.01) {
      heartPath(ctx, 0.28, -1.08 - 0.1 * u, s)
      part(ctx, C.heart, 'detail')
    }
  }
  ctx.restore()
}

/** The stove's cupboard and the pot on its hob: the pot's middle, half width, foot and rim heights. */
const CUPBOARD_BOX = { x: -0.38, y: -0.5, w: 0.72, h: 0.48, d: 0.1 }
const POT = { x: 0.02, w: 0.2, foot: -0.55, rim: -0.84 }
/** Where the foam drips down the pot's front when it bubbles over (x from the pot's middle) and how far. */
const FOAM_DRIPS = [
  [-0.11, 0.12],
  [0.08, 0.07],
] as const

/**
 * The stove pot: a cobalt pot of orange soup bubbling on a little hob on a yellow cupboard,
 * steam curling up and a ladle leaning in it. On a tap it bubbles over: foam swells over the
 * rim and dribbles down the front, then settles back by 1.4 s.
 */
const stovePot: ItemDraw = (ctx, t, play) => {
  const p = tapAge(play)
  const over = p < 0 ? 0 : hump(p, 0, 0.3, 0.8, 1.4)
  const drip = p < 0 ? 0 : hump(p, 0.2, 0.6, 0.9, 1.35)
  const { x, y, w, h, d } = CUPBOARD_BOX
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.8)
  box(ctx, x, y, w, h, CUPBOARD, d, true, true, 'line')
  // Two doors with bar handles, and the knobs along the top.
  for (const [dx, hx] of [
    [x + 0.05, x + w / 2 - 0.06],
    [x + w / 2 + 0.01, x + w / 2 + 0.05],
  ] as const) {
    ctx.beginPath()
    ctx.rect(dx, y + 0.13, w / 2 - 0.06, h - 0.18)
    part(ctx, CUPBOARD.top, 'detail')
    ctx.beginPath()
    ctx.moveTo(hx, y + 0.2)
    ctx.lineTo(hx, y + 0.3)
    tube(ctx, 0.018, BOX.steel.face)
  }
  for (const kx of [x + 0.12, x + 0.24, x + 0.36]) {
    circlePath(ctx, kx, y + 0.065, 0.025)
    part(ctx, C.white, 'detail')
  }
  // The burner glowing under the pot, flames licking out at its sides.
  ctx.beginPath()
  ctx.ellipse(POT.x + 0.02, POT.foot, POT.w + 0.02, 0.035, 0, 0, TAU)
  part(ctx, BOX.steel.side, 'detail')
  for (const s of [-1, 1]) {
    const fx = POT.x + 0.02 + s * (POT.w - 0.02)
    const lick = 0.008 * wave(t, 0.9, s > 0 ? 0.3 : 0.7)
    ctx.beginPath()
    ctx.moveTo(fx - 0.03, POT.foot + 0.005)
    ctx.quadraticCurveTo(fx - 0.03 + s * 0.01, POT.foot - 0.04, fx + s * 0.02, POT.foot - 0.07 - lick)
    ctx.quadraticCurveTo(fx + 0.03, POT.foot - 0.03, fx + 0.03, POT.foot + 0.005)
    ctx.closePath()
    part(ctx, COZY.flame, 'detail')
  }
  // The pot: handles, body, rim, the soup and its bubbles.
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(POT.x + s * POT.w, POT.rim + 0.06)
    ctx.lineTo(POT.x + s * (POT.w + 0.06), POT.rim + 0.05)
    tube(ctx, 0.026, BOX.steel.side)
  }
  ctx.beginPath()
  ctx.moveTo(POT.x - POT.w, POT.rim)
  ctx.lineTo(POT.x - POT.w, POT.foot - 0.05)
  ctx.quadraticCurveTo(POT.x - POT.w, POT.foot, POT.x - POT.w + 0.05, POT.foot)
  ctx.lineTo(POT.x + POT.w - 0.05, POT.foot)
  ctx.quadraticCurveTo(POT.x + POT.w, POT.foot, POT.x + POT.w, POT.foot - 0.05)
  ctx.lineTo(POT.x + POT.w, POT.rim)
  ctx.closePath()
  part(ctx, BOX.cobalt.face, 'line')
  shine(ctx, POT.x - 0.04, POT.rim + 0.12, 0.14)
  ctx.beginPath()
  ctx.ellipse(POT.x, POT.rim, POT.w, 0.05, 0, 0, TAU)
  part(ctx, BOX.cobalt.top, 'line')
  ctx.beginPath()
  ctx.ellipse(POT.x, POT.rim + 0.005, POT.w - 0.03, 0.033, 0, 0, TAU)
  ctx.fillStyle = COZY.soup
  ctx.fill()
  for (let i = 0; i < 3; i++) {
    const u = loop(t, 1.3, i / 3 + phaseOf('stovePot'))
    const r = 0.028 * Math.sin(Math.PI * u) * (1 + over)
    if (r < 0.004) continue
    circlePath(ctx, POT.x - 0.09 + i * 0.085, POT.rim - 0.005 - r * 0.5, r)
    part(ctx, COZY.soupLight, 'detail')
  }
  // The ladle leaning in it.
  ctx.beginPath()
  ctx.moveTo(POT.x + 0.06, POT.rim + 0.01)
  ctx.lineTo(POT.x + 0.22, POT.rim - 0.17)
  tube(ctx, 0.024, BOX.steel.top)
  if (over > 0.01) {
    // The drips running down the front, their tops under the foam's edge.
    if (drip > 0.02) {
      const drops: number[] = []
      for (const [dx, len] of FOAM_DRIPS) for (const f of [0.35, 0.7, 1]) drops.push(POT.x + dx, POT.rim + 0.02 + len * drip * f, (0.018 + 0.01 * f) * Math.min(1, drip * 2))
      blob(ctx, drops, COZY.foam, 'line')
    }
    // The foam, one band of bubbles swelling up out of the pot over its rim.
    ctx.save()
    ctx.translate(0, POT.rim)
    ctx.scale(1, over)
    const foam: number[] = []
    for (let i = 0; i < 6; i++) foam.push(POT.x - 0.165 + i * 0.066, i % 2 ? -0.035 : -0.05, 0.055)
    blob(ctx, foam, COZY.foam, 'line')
    ctx.restore()
  }
  // Steam curling up, more of it on a tap.
  for (let i = 0; i < 2; i++) {
    const u = loop(t, 2.4, i / 2 + phaseOf('stovePot'))
    const r = (0.04 + 0.025 * over) * Math.sin(Math.PI * u)
    puff(ctx, POT.x - 0.06 + 0.06 * i + 0.03 * Math.sin(TAU * u), POT.rim - 0.12 - 0.2 * u, r, COZY.steam)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The themes

/** A theme's four wallpaper base colours, for the HUD's paint pot. */
function swatchesOf(walls: readonly [{ base: string }, { base: string }, { base: string }, { base: string }]): readonly [string, string, string, string] {
  return [walls[0].base, walls[1].base, walls[2].base, walls[3].base]
}

export const COZY_ART: { [T in 'sleep' | 'cat' | 'kitchen']: ThemeArt<T> } = {
  sleep: {
    wall: sleepWall,
    floor: sleepFloor,
    glow: GLOW.sleep,
    swatches: swatchesOf(SLEEP_WALLS),
    items: { moonMobile, starPoster, bed, teddyBear, nightLamp },
  },
  cat: {
    wall: catWall,
    floor: catFloor,
    glow: GLOW.cat,
    swatches: swatchesOf(CAT_WALLS),
    items: { fishLamp, catShelf, catTree, boxCat, yarnBall },
  },
  kitchen: {
    wall: kitchenWall,
    floor: kitchenFloor,
    glow: GLOW.kitchen,
    swatches: swatchesOf(KITCHEN_WALLS),
    items: { potLamp, jarShelf, oven, cook, stovePot },
  },
}
