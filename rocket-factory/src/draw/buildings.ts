import { BAKES, RECIPES, SIZE, STACK, TOWER_AMMO, TOWER_AMMO_PER_BUBBLE, BOWL_HOLD } from '../game/catalog'
import { CARDS, KINDS, PARTS, STICKERS, THINGS, newBuilding, type CardId, type Dir, type Kind, type Sticker, type Thing } from '../game/model'
import { stackBox, type Box, type Point } from '../game/where'
import {
  BELT,
  BUILDING,
  C,
  GLASS,
  HEDGE,
  LAND,
  RIM,
  SHADOW,
  THING,
  TAU,
  addCapsule,
  addCircle,
  addRoundPoly,
  addRoundRect,
  addStar,
  arch,
  clamp01,
  detail,
  drawNightcap,
  fill,
  groundShadow,
  heartPath,
  heldAge,
  loop,
  mix,
  pen,
  phaseOf,
  push,
  replay,
  roundRectPath,
  roundStroke,
  scaled,
  slap,
  smooth,
  starPath,
  sparklePath,
  stickerRim,
  stickerShadow,
  tipped,
  type SheetEntry,
} from './look'
import { drawLittleRocket, drawRocket } from './rocket'
import { ON_BELT, drawStillThing, drawThing } from './things'

/**
 * The buildings as stickers (plans/rocket-factory.md, Buildings and stickers, and The look):
 * each kind a front-view picture standing upright inside its plan-view footprint, with its
 * own die-cut outline, so the kinds read by shape alone: the digger a square with corner
 * treads round a big drill disc, the oven a round terracotta kiln with an arched mouth, the
 * workshop a scalloped edge round a turning gear, the green bottle maker a round-shouldered
 * flask, the orange bottle maker a tall flask with a star cork, the lab a night-indigo dome
 * with a ring (the one dark sticker, a little planetarium), the pump a drop with a spout
 * floating on the pond, the tower a sea-glass post with a bubble wand, the bowl a honey bowl.
 * The pad is the one plan-view sticker: pale concrete with coral rings (the rocket lying on
 * it is rocket.ts's).
 *
 * State is motion, never an icon: a working machine's part moves on its notes of the band
 * (`beat`), a waiting one stands still with what it wants faint in its mouth, one with
 * nowhere to put things piles up to STACK on its roof (where.ts stackBox) and stops. A push
 * squashes it 4 percent in place and a placing slaps it down, both about its ground point, so
 * a building never leaves the ground; only the hint's bounce lifts one (`rise`), over a soft
 * oval left on the ground as under a hopping muncher. Big stickers are soft and small ones bright: each body is its kind's
 * low-chroma BUILDING colours with one small bright part (the oven's mouth, a flask's fizz),
 * so the things riding the belts stay the loudest on the board.
 *
 * The 2x2 kinds are drawn in two layers, so the renderer can stamp the still one from a
 * bitmap per kind and size (`drawBody`, `BuildingPic.stamp`) and draw only what moves; the
 * pad, towers and bowls are drawn whole (a wand droops, bars come and go, the pad drums).
 * Mouth tabs and spouts (`drawTabs`) are plan view on the footprint's edges, drawn in the
 * board's frame with the belts, never turned with the picture.
 */

// ---------------------------------------------------------------------------------------
// The picture

/** How a building is doing: its part moves on its notes while it works; it stands still while it waits (what it wants faint in its mouth) and while it is stopped (its stack full on its roof, napped on, or tucked in). */
export type Mode = 'working' | 'waiting' | 'stopped'
/** How it is held: on the board; a ghost that fits (the real sticker held up, see-through, a long shadow); a ghost that cannot go (flat grey, no shadow, wobbling); lifted by the peel's first tap (wobbling on the hand). */
export type Hold = 'board' | 'ghost' | 'grey' | 'peel'
/** What comes out in a recipe bubble: a thing, or the lab's discovery (a star), a tower's suds, a bowl's picnic (a heart), the pad's rocket. */
export type Makes = Thing | 'star' | 'suds' | 'heart' | 'rocket'
/** A recipe bubble's pictures: the things that go in (two blue bars are two pictures) and what comes out, or null for nothing out. */
export interface Recipe {
  takes: readonly Thing[]
  makes: Makes | null
}

/** One frame of a building, as the renderer reads it off the state. Ages are seconds since a stamp, Infinity for never (held finite here). */
export interface BuildingPic {
  kind: Kind
  /** Its id: the phase of its slow loops, so two of a kind never move in step. */
  id: number
  mode: Mode
  /** 0 to 1 through the note its kind's part of the band is playing now (0 the note's start): what its part moves on while it works. */
  beat: number
  /** What it waits for (at most two), faint in its mouth while it waits. */
  wants: readonly Thing[]
  /** Made things on its roof, oldest first (at most STACK; only makers stack). */
  stack: readonly Thing[]
  /** What a tap's bubble shows (recipeOf). */
  recipe: Recipe
  /** Seconds since it was placed (the slap), last pushed a thing out (the squash), last took one in (the gulp), was last tapped (the recipe bubble, RECIPE_FOR long), and since a tower last shot. */
  placedAge: number
  pushAge: number
  gulpAge: number
  tapAge: number
  shotAge: number
  /** The lab's current card, 0 to 1: its dome's stars light up as it fills. */
  progress: number
  /** The card the lab has just found and seconds since (its stars join into the card's picture, CELEBRATE long), or null. */
  found: { card: CardId; age: number } | null
  /** A tower's shots left (0 to TOWER_AMMO, TOWER_AMMO_PER_BUBBLE a bubble held) and the stars it has earned (drawn up to 5); a bowl's gold bars (0 to BOWL_HOLD). */
  ammo: number
  stars: number
  bars: number
  /** Its bowl's picnic is on: a checked cloth under it, hearts rising. */
  picnic: boolean
  /** Good night: none; cap, its kind bounces in a nightcap for her tap; tucked, tucked in and asleep (the oven's mouth a night light). */
  night: 'none' | 'cap' | 'tucked'
  hold: Hold
  /** How high it stands off the ground now, cells: the hint's bounce (and Good night's), over a soft oval on the ground that shrinks as it goes up. 0 on the ground; the pad never bounces. */
  rise: number
  /** For a 2x2 kind not held grey: the bitmap of drawBody over bodyBox at this size, with its sticker shadow while it is on the board (drawBody and bodyBox with `shadow`), drawn in place of the body's paths (and of the shadow's); null draws the paths (always null for the pad, towers and bowls). */
  stamp: CanvasImageSource | null
}

/** Where a belt meets a footprint's edge: the side of the footprint (the direction out of it, toward the belt) and which cell along that side, counted from the footprint's top-left (along x on the north and south sides, along y on the east and west). */
export interface Tab {
  side: Dir
  at: number
}

/** The kinds whose bodies the renderer may stamp: the 2x2 ones, whose outlines never move. */
export type Stamped = 'digger' | 'oven' | 'workshop' | 'greenMaker' | 'orangeMaker' | 'lab' | 'pump'
export const STAMPED: readonly Stamped[] = ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump']
const isStamped = (k: Kind): k is Stamped => SIZE[k] === 2

/** A tap shows the recipe bubble this long, seconds. */
export const RECIPE_FOR = 2

/**
 * The recipe bubble of a kind. `varies` is what depends on where it stands or what is wanted:
 * the digger's rock, the oven's rock (the one it bakes next, or last baked), the bottles the
 * lab's card needs, the thing of the rocket's open part for the pad (none when no part is
 * open); empty for every other kind, whose recipe never changes.
 */
export function recipeOf(kind: Kind, varies: readonly Thing[]): Recipe {
  const one = () => {
    if (varies.length !== 1) throw new Error(`a ${kind}'s recipe needs one thing, not ${varies.length}`)
    return varies[0]!
  }
  const none = () => {
    if (varies.length !== 0) throw new Error(`a ${kind}'s recipe never varies`)
  }
  const fixed = (k: 'workshop' | 'greenMaker' | 'orangeMaker'): Recipe => {
    none()
    const r = RECIPES[k]
    return { takes: (Object.entries(r.takes) as [Thing, number][]).flatMap(([thing, n]) => Array<Thing>(n).fill(thing)), makes: r.makes }
  }
  switch (kind) {
    case 'digger':
      return { takes: [], makes: one() }
    case 'oven': {
      const rock = one()
      const bar = BAKES[rock]
      if (!bar) throw new Error(`an oven bakes rocks, not a ${rock}`)
      return { takes: [rock], makes: bar }
    }
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return fixed(kind)
    case 'lab':
      if (varies.length === 0) throw new Error('the lab drinks bottles')
      return { takes: varies, makes: 'star' }
    case 'pump':
      none()
      return { takes: [], makes: 'bubble' }
    case 'tower':
      none()
      return { takes: ['bubble'], makes: 'suds' }
    case 'bowl':
      none()
      return { takes: ['goldBar', 'goldBar'], makes: 'heart' }
    case 'pad':
      if (varies.length > 1) throw new Error('the rocket fills one part at a time')
      return { takes: varies, makes: 'rocket' }
  }
}

// ---------------------------------------------------------------------------------------
// Each kind's shapes, in its picture's frame: cells from the footprint's top-left, upright.

/** Its ground point (the bottom middle it squashes about, and where the ground oval sits while it rises), the top a recipe bubble points at, its mouth (where what it wants shows faint), and its nightcap's brim (middle, half width, tilt). */
const SPOT: Record<Kind, { ground: Point; top: Point; mouth: Point; cap: { x: number; y: number; r: number; tilt: number } }> = {
  pad: { ground: { x: 1.5, y: 2.85 }, top: { x: 1.5, y: 0.15 }, mouth: { x: 1.5, y: 1.5 }, cap: { x: 2.28, y: 0.56, r: 0.3, tilt: 0.35 } },
  digger: { ground: { x: 1, y: 1.84 }, top: { x: 1, y: 0.16 }, mouth: { x: 1, y: 0.95 }, cap: { x: 1, y: 0.33, r: 0.3, tilt: 0.1 } },
  oven: { ground: { x: 1, y: 1.86 }, top: { x: 1, y: 0.13 }, mouth: { x: 1, y: 1.36 }, cap: { x: 1, y: 0.27, r: 0.28, tilt: 0.14 } },
  workshop: { ground: { x: 1, y: 1.86 }, top: { x: 1, y: 0.14 }, mouth: { x: 1, y: 1 }, cap: { x: 1, y: 0.26, r: 0.28, tilt: 0.12 } },
  greenMaker: { ground: { x: 1, y: 1.84 }, top: { x: 1, y: 0.14 }, mouth: { x: 1, y: 0.52 }, cap: { x: 1, y: 0.22, r: 0.28, tilt: 0.1 } },
  orangeMaker: { ground: { x: 1, y: 1.84 }, top: { x: 1, y: 0.07 }, mouth: { x: 1, y: 0.61 }, cap: { x: 1, y: 0.36, r: 0.25, tilt: 0.1 } },
  lab: { ground: { x: 1, y: 1.84 }, top: { x: 1, y: 0.5 }, mouth: { x: 1, y: 1.63 }, cap: { x: 1, y: 0.58, r: 0.3, tilt: 0.1 } },
  pump: { ground: { x: 0.9, y: 1.82 }, top: { x: 0.9, y: 0.22 }, mouth: { x: 0.9, y: 1 }, cap: { x: 0.9, y: 0.4, r: 0.24, tilt: 0.2 } },
  tower: { ground: { x: 0.5, y: 0.92 }, top: { x: 0.5, y: -0.13 }, mouth: { x: 0.23, y: 0.5 }, cap: { x: 0.5, y: 0.33, r: 0.17, tilt: 0.1 } },
  bowl: { ground: { x: 0.5, y: 0.9 }, top: { x: 0.5, y: 0.26 }, mouth: { x: 0.5, y: 0.42 }, cap: { x: 0.64, y: 0.47, r: 0.15, tilt: 0.35 } },
}

/** The digger: a body with a tread pod at each corner, and its drill disc in a light collar. */
const DIGGER = { body: [0.32, 0.3, 1.36, 1.3, 0.26], pod: { w: 0.48, h: 0.36, r: 0.15 }, pods: [0.13, 0.16, 1.39, 0.16, 0.13, 1.48, 1.39, 1.48], disc: { x: 1, y: 0.95, r: 0.5, collar: 0.6 } } as const
/** The oven: a round kiln on a foot with a knob on top, its arched mouth (bottom middle, width, height) in a lighter frame. */
const OVEN = { dome: { x: 1, y: 1.02, r: 0.8 }, foot: [0.28, 1.6, 1.44, 0.26, 0.12], knob: { x: 1, y: 0.24, r: 0.11 }, mouth: { x: 1, y: 1.62, w: 0.74, h: 0.66 }, frame: 0.1 } as const
/** The workshop: a disc with scallops round it, a light face, and its gear (tip radius, body radius, hole). */
const SHOP = { x: 1, y: 1, r: 0.7, scallops: 14, scallop: 0.16, face: 0.6, gear: { r: 0.5, body: 0.36, hole: 0.15, teeth: 8 } } as const
/** The green bottle maker: a round bulb, a neck and a lip; its fizz's line and the glass wall. */
const ROUND = { bulb: { x: 1, y: 1.2, rx: 0.78, ry: 0.64 }, neck: [0.76, 0.28, 0.48, 0.5, 0.08], lip: [0.66, 0.14, 0.68, 0.2, 0.1], fizz: 1.44, wall: 0.1 } as const
/** The orange bottle maker: a tall body, a neck, a cork and its gold star; its fizz's line and the glass wall. */
const TALL = { body: [0.59, 0.7, 0.82, 1.14, 0.32], neck: [0.8, 0.44, 0.4, 0.34, 0.06], cork: [0.75, 0.34, 0.5, 0.17, 0.07], star: { x: 1, y: 0.26, r: 0.19 }, fizz: 1.5, wall: 0.1 } as const
/** The lab: a dome on a drum, a ring round it, a door in the drum, and the planetarium's stars (x, y, size) in the order they light up. */
const LAB = {
  dome: { x: 1, y: 1.36, rx: 0.8, ry: 0.86 },
  drum: [0.16, 1.3, 1.68, 0.54, 0.14],
  ring: { x: 1, y: 1.22, rx: 0.86, ry: 0.19, tilt: -0.08, w: 0.1 },
  door: { x: 1, y: 1.8, w: 0.32, h: 0.36 },
  stars: [0.62, 1.04, 0.13, 1.16, 0.66, 0.15, 0.86, 0.78, 0.11, 1.42, 0.96, 0.12, 1.02, 0.96, 0.1, 0.72, 0.64, 0.09, 1.3, 0.74, 0.1, 0.48, 0.84, 0.09, 1.0, 0.63, 0.1],
} as const

/**
 * Each card's picture as the dome's nine stars draw it (x, y pairs in a box from -1 to 1, y
 * down, star i of LAB.stars going to point i): a gear's eight teeth round its hub, three
 * bubbles, a bush, a burrow's mound and door, a five-point star, a bowl with two bars, the
 * rocket, a flame; and for the cards before the lab, a digger's square, a bar, a flask.
 */
const CONSTELLATION: Record<CardId, readonly number[]> = {
  digger: [-0.7, -0.7, 0, -0.7, 0.7, -0.7, 0.7, 0, 0.7, 0.7, 0, 0.7, -0.7, 0.7, -0.7, 0, 0, 0],
  gold: [-0.9, -0.3, -0.3, -0.45, 0.3, -0.45, 0.9, -0.3, 0.9, 0.3, 0.3, 0.45, -0.3, 0.45, -0.9, 0.3, 0, 0],
  science: [0, -1, -0.25, -0.55, 0.25, -0.55, -0.75, 0.05, 0.75, 0.05, -0.6, 0.65, 0.6, 0.65, 0, 0.85, 0, 0.2],
  gears: [...Array.from({ length: 8 }, (_, k) => [Math.cos(((2 * k + 1) * Math.PI) / 8), Math.sin(((2 * k + 1) * Math.PI) / 8)]).flat(), 0, 0],
  bubbles: [-0.55, 0.05, -0.85, 0.6, -0.25, 0.6, 0.55, 0.05, 0.25, 0.6, 0.85, 0.6, 0, -0.95, -0.3, -0.4, 0.3, -0.4],
  hedges: [-0.95, 0.55, -1, 0, -0.6, -0.5, 0, -0.75, 0.6, -0.5, 1, 0, 0.95, 0.55, 0.3, 0.65, -0.3, 0.65],
  land2: [-1, 0.75, -0.85, 0.05, -0.45, -0.55, 0, -0.75, 0.45, -0.55, 0.85, 0.05, 1, 0.75, 0, 0.75, 0, 0.25],
  stars: [...Array.from({ length: 5 }, (_, k) => [Math.cos(-Math.PI / 2 + (k * 2 * Math.PI) / 5), Math.sin(-Math.PI / 2 + (k * 2 * Math.PI) / 5)]).flat(), ...Array.from({ length: 4 }, (_, k) => [0.42 * Math.cos(-Math.PI / 2 + Math.PI / 5 + (k * 2 * Math.PI) / 5), 0.42 * Math.sin(-Math.PI / 2 + Math.PI / 5 + (k * 2 * Math.PI) / 5)]).flat()],
  snacks: [-1, -0.1, -0.8, 0.35, -0.4, 0.62, 0, 0.7, 0.4, 0.62, 0.8, 0.35, 1, -0.1, -0.25, -0.5, 0.3, -0.55],
  land3: [-1, 0.75, -0.85, 0.05, -0.45, -0.55, 0, -0.75, 0.45, -0.55, 0.85, 0.05, 1, 0.75, 0, 0.75, 0, 0.25],
  rocket: [0, -1, -0.32, -0.45, 0.32, -0.45, -0.32, 0.4, 0.32, 0.4, -0.75, 0.85, 0.75, 0.85, 0, -0.1, 0, 0.9],
  fuel: [0, -1, 0.45, -0.35, 0.7, 0.2, 0.5, 0.65, 0, 0.85, -0.5, 0.65, -0.7, 0.2, -0.45, -0.35, 0, 0.25],
}
/** Where the constellation stands in the dome (its middle and half sizes, cells), and the celebration's moments: the stars join over JOIN, hold the picture, and shrink away by CELEBRATE as the card flips up. */
const SKY_IN_DOME = { x: 1, y: 0.94, w: 0.44, h: 0.33 } as const
const JOIN = 0.9
export const CELEBRATE = 2

/**
 * The lab's celebration `age` seconds after it found `card`: the dome brightens once (slowly,
 * never a flash), and its nine stars, all lit as the card filled, slide from their places into
 * the card's picture (CONSTELLATION), a little apart in time, twinkle there, and shrink away as
 * the card flips up. So the card she sees comes out of the dark sticker she fed all along.
 */
function drawCelebration(ctx: CanvasRenderingContext2D, card: CardId, age: number, t: number) {
  const b = BUILDING.lab
  const { dome } = LAB
  const was = ctx.globalAlpha
  ctx.globalAlpha = was * 0.55 * arch(clamp01(age / CELEBRATE))
  ctx.beginPath()
  ctx.moveTo(dome.x - dome.rx + 0.06, dome.y)
  ctx.ellipse(dome.x, dome.y, dome.rx - 0.06, dome.ry - 0.06, 0, Math.PI, TAU)
  ctx.closePath()
  fill(ctx, b.light)
  ctx.globalAlpha = was
  const to = CONSTELLATION[card]
  const n = LAB.stars.length / 3
  const away = 1 - smooth(CELEBRATE - 0.4, CELEBRATE, age)
  for (let i = 0; i < n; i++) {
    const u = smooth(i * 0.03, JOIN - (n - 1 - i) * 0.03, age)
    const x = mix(LAB.stars[3 * i]!, SKY_IN_DOME.x + to[2 * i]! * SKY_IN_DOME.w, u)
    const y = mix(LAB.stars[3 * i + 1]!, SKY_IN_DOME.y + to[2 * i + 1]! * SKY_IN_DOME.h, u)
    const twinkle = 1 + 0.12 * Math.sin(TAU * loop(t, 1.3, i / n)) * u
    const size = mix(LAB.stars[3 * i + 2]! * 1.5, 0.12, u) * twinkle * away
    if (size < 0.005) continue
    sparklePath(ctx, x, y, size)
    fill(ctx, b.accent)
  }
}
/** The pump: a drop (its tip, and its round bottom) with a spout to the right, the water inside, and where the spout lets a bubble drip. */
const PUMP = { tip: { x: 0.9, y: 0.22 }, bulb: { x: 0.9, y: 1.22, r: 0.6 }, spout: [1.36, 0.92, 1.66, 0.95, 1.86, 1.06, 1.88, 1.3, 1.68, 1.3, 1.66, 1.17, 1.36, 1.15], water: 1.38, drip: { x: 1.78, y: 1.3 } } as const
/** The tower: a foot, a post, a cup for its bubbles, and the wand on a pivot at the post's top (the stick's length, the ring's radius, its angle up and drooping); its stars up the post. */
const TOWER = { foot: [0.2, 0.77, 0.6, 0.15, 0.075], post: [0.36, 0.28, 0.28, 0.56, 0.13], cup: { x: 0.23, y: 0.57, r: 0.15 }, pivot: { x: 0.5, y: 0.31 }, stick: 0.25, ring: 0.13, up: -0.95, droop: 0.6, stars: [0.71, 0.625, 0.54, 0.455, 0.37] } as const
/** The bowl: its round body under a lip (middle, half width, depth), the inside's back, a foot, and where its gold bars stand in it (x, y, tilt). */
const BOWL = { x: 0.5, y: 0.5, rx: 0.38, ry: 0.32, lip: 0.09, inner: { rx: 0.31, ry: 0.06 }, foot: [0.37, 0.79, 0.26, 0.11, 0.05], bars: [0.37, 0.41, -0.55, 0.63, 0.39, 0.45, 0.5, 0.33, 0.02, 0.73, 0.46, 0.95] } as const
/** The pad: a concrete slab, its lighter panel, two coral rings round its middle and a coral light at each corner. */
const PADART = { slab: [0.15, 0.15, 2.7, 2.7, 0.44], panel: [0.35, 0.35, 2.3, 2.3, 0.28], rings: [1.18, 0.84], ring: 0.09, light: 0.46 } as const
/** The tray's hedge: a block with leafy bumps along its top. */
const SHRUB = { base: [0.14, 0.44, 0.72, 0.42, 0.16], bumps: [0.25, 0.47, 0.15, 0.42, 0.39, 0.17, 0.6, 0.39, 0.17, 0.76, 0.48, 0.14] } as const

/** The pump's water drop, clockwise: from its tip down its right side, round its bottom, up its left. */
function addDrop(ctx: CanvasRenderingContext2D, inset: number) {
  const { tip, bulb } = PUMP
  const r = bulb.r - inset
  ctx.moveTo(tip.x, tip.y + inset * 1.6)
  ctx.bezierCurveTo(tip.x + 0.12, tip.y + 0.28, bulb.x + r, bulb.y - 0.46, bulb.x + r, bulb.y)
  ctx.arc(bulb.x, bulb.y, r, 0, Math.PI)
  ctx.bezierCurveTo(bulb.x - r, bulb.y - 0.46, tip.x - 0.12, tip.y + 0.28, tip.x, tip.y + inset * 1.6)
  ctx.closePath()
}
/** An arch standing on (x - w/2 .. x + w/2, y), h tall to its round top, clockwise. */
function addArch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = w / 2
  ctx.moveTo(x - r, y)
  ctx.lineTo(x - r, y - h + r)
  ctx.arc(x, y - h + r, r, Math.PI, TAU)
  ctx.lineTo(x + r, y)
  ctx.closePath()
}
/** An ellipse as one closed piece of the current path, clockwise. */
function addEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, tilt: number) {
  ctx.moveTo(x + Math.cos(tilt) * rx, y + Math.sin(tilt) * rx)
  ctx.ellipse(x, y, rx, ry, tilt, 0, TAU)
}
/** A gear of `teeth` rounded teeth round a body, `r` its tips' radius, turned by `turn`. */
function addGear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, body: number, teeth: number, turn: number) {
  addCircle(ctx, x, y, body)
  const half = Math.PI / teeth
  for (let i = 0; i < teeth; i++) {
    const a = turn + i * 2 * half
    const pts: number[] = []
    for (const [rr, da] of [
      [body * 0.8, -half * 0.62],
      [r, -half * 0.42],
      [r, half * 0.42],
      [body * 0.8, half * 0.62],
    ] as const)
      pts.push(x + Math.cos(a + da) * rr, y + Math.sin(a + da) * rr)
    addRoundPoly(ctx, pts, 0.05)
  }
}
/** Where the tower's wand ring is for a wand at angle a. */
const wandRing = (a: number): Point => ({ x: TOWER.pivot.x + Math.cos(a) * (TOWER.stick + TOWER.ring), y: TOWER.pivot.y + Math.sin(a) * (TOWER.stick + TOWER.ring) })

/** A kind's die-cut outline as pieces of the current path; `wand` is the tower's wand angle (radians), the one outline that moves. */
function addOutline(ctx: CanvasRenderingContext2D, kind: Kind, wand: number) {
  switch (kind) {
    case 'pad':
      addRoundRect(ctx, ...PADART.slab)
      return
    case 'digger': {
      addRoundRect(ctx, ...DIGGER.body)
      const { w, h, r } = DIGGER.pod
      for (let i = 0; i < 8; i += 2) addRoundRect(ctx, DIGGER.pods[i]!, DIGGER.pods[i + 1]!, w, h, r)
      return
    }
    case 'oven':
      addCircle(ctx, OVEN.dome.x, OVEN.dome.y, OVEN.dome.r)
      addRoundRect(ctx, ...OVEN.foot)
      addCircle(ctx, OVEN.knob.x, OVEN.knob.y, OVEN.knob.r)
      return
    case 'workshop':
      addCircle(ctx, SHOP.x, SHOP.y, SHOP.r)
      for (let i = 0; i < SHOP.scallops; i++) {
        const a = (i / SHOP.scallops) * TAU - Math.PI / 2
        addCircle(ctx, SHOP.x + Math.cos(a) * SHOP.r, SHOP.y + Math.sin(a) * SHOP.r, SHOP.scallop)
      }
      return
    case 'greenMaker':
      addEllipse(ctx, ROUND.bulb.x, ROUND.bulb.y, ROUND.bulb.rx, ROUND.bulb.ry, 0)
      addRoundRect(ctx, ...ROUND.neck)
      addRoundRect(ctx, ...ROUND.lip)
      return
    case 'orangeMaker':
      addRoundRect(ctx, ...TALL.body)
      addRoundRect(ctx, ...TALL.neck)
      addRoundRect(ctx, ...TALL.cork)
      addStar(ctx, TALL.star.x, TALL.star.y, TALL.star.r)
      return
    case 'lab': {
      const { dome, ring } = LAB
      ctx.moveTo(dome.x - dome.rx, dome.y)
      ctx.ellipse(dome.x, dome.y, dome.rx, dome.ry, 0, Math.PI, TAU)
      ctx.closePath()
      addRoundRect(ctx, ...LAB.drum)
      addEllipse(ctx, ring.x, ring.y, ring.rx + ring.w / 2, ring.ry + ring.w / 2, ring.tilt)
      return
    }
    case 'pump':
      addDrop(ctx, 0)
      addRoundPoly(ctx, PUMP.spout, 0.06)
      return
    case 'tower': {
      const ring = wandRing(wand)
      addRoundRect(ctx, ...TOWER.foot)
      addRoundRect(ctx, ...TOWER.post)
      ctx.moveTo(TOWER.cup.x + TOWER.cup.r, TOWER.cup.y)
      ctx.arc(TOWER.cup.x, TOWER.cup.y, TOWER.cup.r, 0, Math.PI)
      ctx.closePath()
      addCapsule(ctx, TOWER.pivot.x, TOWER.pivot.y, ring.x, ring.y, 0.04)
      addCircle(ctx, ring.x, ring.y, TOWER.ring)
      return
    }
    case 'bowl':
      addEllipse(ctx, BOWL.x, BOWL.y, BOWL.rx, BOWL.lip, 0)
      ctx.moveTo(BOWL.x + BOWL.rx, BOWL.y)
      ctx.ellipse(BOWL.x, BOWL.y, BOWL.rx, BOWL.ry, 0, 0, Math.PI)
      ctx.closePath()
      addRoundRect(ctx, ...BOWL.foot)
      return
  }
}

// ---------------------------------------------------------------------------------------
// Sticker kit

/** A thing's own picture (things.ts), `size` cells across, centred at (x, y). */
function thingAt(ctx: CanvasRenderingContext2D, thing: Thing, x: number, y: number, size: number, t: number, seed: number) {
  ctx.save()
  ctx.translate(x, y)
  drawThing(ctx, thing, size, t, seed)
  ctx.restore()
}
/** Runs `draw` at `alpha` of the alpha it finds. */
function faded(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  const was = ctx.globalAlpha
  ctx.globalAlpha = was * alpha
  draw()
  ctx.globalAlpha = was
}
/** 1 at a note's start, easing to 0 by its end: a glow or a twinkle on the beat. */
const pulse = (beat: number) => (1 - clamp01(beat)) * (1 - clamp01(beat))
/** A part turning `speed` radians a second that surges forward at each note and eases after it, never stepping back while `kick` is under a third of `speed` (eighth notes are a third of a second). */
const surge = (t: number, beat: number, speed: number, kick: number) => {
  const b = clamp01(beat)
  return speed * t + kick * (1 - (1 - b) * (1 - b) - b)
}

/** A sticker's white rim round its outline, then the outline filled flat in `colour` (look.ts stickerRim at the stickers' RIM). */
const rimmed = (ctx: CanvasRenderingContext2D, outline: () => void, colour: string) => stickerRim(ctx, outline, RIM, colour)
/** A small sticker of its own (a tab, a bubble, a plank): shadow, rim and its flat fill. */
function little(ctx: CanvasRenderingContext2D, outline: () => void, colour: string) {
  stickerShadow(ctx, outline, 0, RIM)
  rimmed(ctx, outline, colour)
}

// ---------------------------------------------------------------------------------------
// The still body of a 2x2 kind

/** A stamped kind's body: its rim and the fills that never move, at rest, over its sticker shadow with `shadow` (on the board, where the shadow lies still under it). bodyBox is its box. */
export function drawBody(ctx: CanvasRenderingContext2D, kind: Stamped, shadow: boolean): void {
  const b = BUILDING[kind]
  const outline = () => {
    ctx.beginPath()
    addOutline(ctx, kind, 0)
  }
  const lod = detail(1)
  ctx.save()
  if (shadow) stickerShadow(ctx, outline, 0, RIM)
  rimmed(ctx, outline, b.body)
  switch (kind) {
    case 'digger': {
      // The tread pods behind the body, their grooves, the body over them, the disc's collar.
      const { w, h, r } = DIGGER.pod
      ctx.beginPath()
      for (let i = 0; i < 8; i += 2) addRoundRect(ctx, DIGGER.pods[i]!, DIGGER.pods[i + 1]!, w, h, r)
      fill(ctx, b.fold)
      if (lod !== 'S') {
        ctx.beginPath()
        for (let i = 0; i < 8; i += 2)
          for (const u of [0.28, 0.5, 0.72]) {
            const x = DIGGER.pods[i]! + w * u
            ctx.moveTo(x, DIGGER.pods[i + 1]! + 0.09)
            ctx.lineTo(x, DIGGER.pods[i + 1]! + h - 0.09)
          }
        roundStroke(ctx, 0.045, b.light)
      }
      ctx.beginPath()
      addRoundRect(ctx, ...DIGGER.body)
      fill(ctx, b.body)
      ctx.beginPath()
      addCircle(ctx, DIGGER.disc.x, DIGGER.disc.y, DIGGER.disc.collar)
      fill(ctx, b.light)
      break
    }
    case 'oven': {
      const { mouth, frame } = OVEN
      ctx.beginPath()
      addRoundRect(ctx, ...OVEN.foot)
      addCircle(ctx, OVEN.knob.x, OVEN.knob.y, OVEN.knob.r)
      fill(ctx, b.fold)
      ctx.beginPath()
      addArch(ctx, mouth.x, mouth.y, mouth.w + 2 * frame, mouth.h + frame)
      fill(ctx, b.light)
      // The mouth at rest: a dim kiln; the live layer lights it.
      ctx.beginPath()
      addArch(ctx, mouth.x, mouth.y, mouth.w, mouth.h)
      fill(ctx, b.fold)
      break
    }
    case 'workshop':
      ctx.beginPath()
      addCircle(ctx, SHOP.x, SHOP.y, SHOP.face)
      fill(ctx, b.light)
      break
    case 'greenMaker': {
      ctx.beginPath()
      addRoundRect(ctx, ...ROUND.lip)
      fill(ctx, b.fold)
      // The glass's shine high on the bulb's left.
      const { bulb } = ROUND
      ctx.beginPath()
      ctx.ellipse(bulb.x, bulb.y, bulb.rx - 0.2, bulb.ry - 0.18, 0, Math.PI * 1.08, Math.PI * 1.42)
      roundStroke(ctx, 0.09, b.light)
      break
    }
    case 'orangeMaker':
      ctx.beginPath()
      addRoundRect(ctx, ...TALL.neck)
      fill(ctx, b.fold)
      ctx.beginPath()
      addRoundRect(ctx, ...TALL.cork)
      fill(ctx, GLASS.cork)
      starPath(ctx, TALL.star.x, TALL.star.y, TALL.star.r)
      fill(ctx, GLASS.star)
      ctx.beginPath()
      addRoundRect(ctx, 0.7, 0.86, 0.1, 0.46, 0.05)
      fill(ctx, b.light)
      break
    case 'lab': {
      // The ring's far half behind the dome, the dome, the drum, the ring's near half in front, a highlight on the dome.
      const { dome, ring, door } = LAB
      ctx.beginPath()
      ctx.ellipse(ring.x, ring.y, ring.rx, ring.ry, ring.tilt, Math.PI, TAU)
      roundStroke(ctx, ring.w, b.light)
      ctx.beginPath()
      ctx.moveTo(dome.x - dome.rx, dome.y)
      ctx.ellipse(dome.x, dome.y, dome.rx, dome.ry, 0, Math.PI, TAU)
      ctx.closePath()
      fill(ctx, b.body)
      ctx.beginPath()
      addRoundRect(ctx, ...LAB.drum)
      fill(ctx, b.fold)
      ctx.beginPath()
      ctx.ellipse(ring.x, ring.y, ring.rx, ring.ry, ring.tilt, 0, Math.PI)
      roundStroke(ctx, ring.w, b.light)
      ctx.beginPath()
      ctx.ellipse(dome.x, dome.y, dome.rx - 0.16, dome.ry - 0.16, 0, Math.PI * 1.12, Math.PI * 1.36)
      roundStroke(ctx, 0.08, b.light)
      // The door's frame and the door at rest.
      ctx.beginPath()
      addArch(ctx, door.x, door.y, door.w + 0.1, door.h + 0.05)
      fill(ctx, b.light)
      ctx.beginPath()
      addArch(ctx, door.x, door.y, door.w, door.h)
      fill(ctx, b.body)
      break
    }
    case 'pump': {
      // The water inside the drop, the spout, the drop's shine.
      ctx.save()
      ctx.beginPath()
      addDrop(ctx, 0.08)
      ctx.clip()
      ctx.beginPath()
      ctx.moveTo(0.2, PUMP.water)
      for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(0.2 + (i - 0.5) * 0.36, PUMP.water + (i % 2 === 0 ? 0.05 : -0.05), 0.2 + i * 0.36, PUMP.water)
      ctx.lineTo(1.7, PUMP.bulb.y + PUMP.bulb.r)
      ctx.lineTo(0.2, PUMP.bulb.y + PUMP.bulb.r)
      ctx.closePath()
      fill(ctx, b.accent)
      ctx.restore()
      ctx.beginPath()
      addRoundPoly(ctx, PUMP.spout, 0.06)
      fill(ctx, b.fold)
      ctx.beginPath()
      ctx.arc(PUMP.bulb.x, PUMP.bulb.y, PUMP.bulb.r - 0.16, Math.PI * 1.1, Math.PI * 1.38)
      roundStroke(ctx, 0.08, b.light)
      break
    }
  }
  ctx.restore()
}
/** The box a stamped body covers, rim and all: its footprint, and with its `shadow` the shadow's reach down-right past it (the outline keeps a rim's width inside the footprint). */
export const bodyBox = (kind: Stamped, shadow: boolean): Box => ({ x: 0, y: 0, w: SIZE[kind] + (shadow ? SHADOW : 0), h: SIZE[kind] + (shadow ? SHADOW : 0) })

// ---------------------------------------------------------------------------------------
// What moves and changes

/** What it wants, faint in its mouth: one thing, or two side by side. */
function drawWants(ctx: CanvasRenderingContext2D, kind: Kind, wants: readonly Thing[], t: number, id: number) {
  if (wants.length === 0) return
  if (wants.length > 2) throw new Error(`a ${kind} shows at most two things it wants`)
  const m = SPOT[kind].mouth
  const size = wants.length === 1 ? 0.34 : 0.3
  faded(ctx, 0.45, () =>
    wants.forEach((thing, i) => {
      ctx.save()
      ctx.translate(m.x + (wants.length === 1 ? 0 : (i - 0.5) * 0.34), m.y)
      drawStillThing(ctx, thing, size, t, id * 7 + i)
      ctx.restore()
    }),
  )
}

/** The bubbles that rise in a flask while it works: `n` of them climbing from the fizz line `from` to `to`, one setting off on each note. */
function drawBubbles(ctx: CanvasRenderingContext2D, x: number, from: number, to: number, beat: number, colour: string, phase: number) {
  ctx.beginPath()
  for (let k = 0; k < 3; k++) {
    const h = (clamp01(beat) + k) / 3
    if (h > 0.94) continue
    addCircle(ctx, x + 0.13 * Math.sin(h * 7 + phase * TAU), mix(from, to, h), 0.045 + 0.03 * h)
  }
  fill(ctx, colour)
}

/** A flask's fizz: the accent below a line that ripples on the beat while it works, clipped to the glass inside. */
function drawFizz(ctx: CanvasRenderingContext2D, inside: () => void, level: number, x0: number, x1: number, colour: string, wave: number) {
  ctx.save()
  inside()
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(x0, level)
  const n = 4
  for (let i = 1; i <= n; i++) {
    const xa = mix(x0, x1, (i - 0.5) / n)
    const xb = mix(x0, x1, i / n)
    ctx.quadraticCurveTo(xa, level + (i % 2 === 0 ? 1 : -1) * (0.025 + wave), xb, level)
  }
  ctx.lineTo(x1, 2)
  ctx.lineTo(x0, 2)
  ctx.closePath()
  fill(ctx, colour)
  ctx.restore()
}

/** The live layer of a stamped kind, over its body: the moving part, the glows, what it wants. */
function drawParts(ctx: CanvasRenderingContext2D, pic: BuildingPic, t: number) {
  const b = BUILDING[pic.kind]
  const working = pic.mode === 'working'
  const ph = phaseOf(pic.id)
  const beat = working ? pic.beat : 0
  const gulp = 1 + 0.12 * arch(clamp01(heldAge(pic.gulpAge) / 0.25))
  switch (pic.kind) {
    case 'digger': {
      // The drill disc's spiral turns while it digs, so it seems to bore in, surging on the shaker's notes; still, it rests where its id left it.
      const { x, y, r } = DIGGER.disc
      const turn = working ? surge(t, beat, 4, 0.9) : ph * TAU
      ctx.beginPath()
      addCircle(ctx, x, y, r)
      fill(ctx, b.accent)
      ctx.beginPath()
      for (let i = 0; i <= 28; i++) {
        const u = i / 28
        const a = turn + u * TAU * 1.6
        const rr = 0.07 + (r - 0.13) * u
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      roundStroke(ctx, 0.09, b.fold)
      ctx.beginPath()
      addCircle(ctx, x, y, 0.1)
      fill(ctx, b.fold)
      break
    }
    case 'oven': {
      // The mouth glows on the bass's notes while it bakes; tucked in, it is a steady night light; stopped, an ember; waiting, dark with the rock it wants.
      const { mouth } = OVEN
      const lit = working || pic.night === 'tucked'
      ctx.save()
      ctx.translate(mouth.x, mouth.y)
      ctx.scale(gulp, gulp)
      ctx.translate(-mouth.x, -mouth.y)
      if (lit) {
        ctx.beginPath()
        addArch(ctx, mouth.x, mouth.y, mouth.w, mouth.h)
        fill(ctx, b.accent)
        const glow = working ? 0.42 + 0.3 * pulse(beat) : 0.5
        ctx.beginPath()
        addArch(ctx, mouth.x, mouth.y, mouth.w * 0.56, mouth.h * glow)
        fill(ctx, C.warm)
      } else if (pic.mode === 'stopped') {
        ctx.beginPath()
        ctx.ellipse(mouth.x, mouth.y - 0.06, 0.2, 0.06, 0, 0, TAU)
        fill(ctx, b.accent)
      }
      ctx.restore()
      break
    }
    case 'workshop': {
      // The gear turns, surging on the woodblock's notes; its hole shows the bars it wants.
      const g = SHOP.gear
      const turn = working ? surge(t, beat, 1.6, 0.45) : ph * TAU
      ctx.beginPath()
      addGear(ctx, SHOP.x, SHOP.y, g.r, g.body, g.teeth, turn)
      fill(ctx, b.accent)
      ctx.beginPath()
      addCircle(ctx, SHOP.x, SHOP.y, g.hole * gulp)
      fill(ctx, b.fold)
      break
    }
    case 'greenMaker': {
      const { bulb, fizz, wall } = ROUND
      const inside = () => {
        ctx.beginPath()
        addEllipse(ctx, bulb.x, bulb.y, bulb.rx - wall, bulb.ry - wall, 0)
      }
      drawFizz(ctx, inside, fizz, bulb.x - bulb.rx, bulb.x + bulb.rx, b.accent, (working ? 0.03 * pulse(beat) : 0) + 0.25 * (gulp - 1))
      if (working) drawBubbles(ctx, bulb.x, fizz - 0.04, bulb.y - bulb.ry + 0.16, beat, THING.greenBottle.light, ph)
      break
    }
    case 'orangeMaker': {
      const [x, y, w, h, r] = TALL.body
      const { fizz, wall } = TALL
      const inside = () => {
        ctx.beginPath()
        addRoundRect(ctx, x + wall, y + wall, w - 2 * wall, h - 2 * wall, r - wall)
      }
      drawFizz(ctx, inside, fizz, x, x + w, b.accent, (working ? 0.03 * pulse(beat) : 0) + 0.25 * (gulp - 1))
      if (working) drawBubbles(ctx, x + w / 2, fizz - 0.04, y + 0.2, beat, THING.orangeBottle.light, ph)
      break
    }
    case 'lab': {
      if (pic.found !== null) {
        drawCelebration(ctx, pic.found.card, pic.found.age, t)
        break
      }
      // The planetarium: a star lights for each part of the card, the newest twinkling on the chimes; the door glows while it drinks.
      const n = LAB.stars.length / 3
      const lit = Math.floor(clamp01(pic.progress) * n + 1e-9)
      const lod = detail(1)
      ctx.beginPath()
      for (let i = lit; i < n && lod !== 'S'; i++) addCircle(ctx, LAB.stars[3 * i]!, LAB.stars[3 * i + 1]!, 0.028)
      fill(ctx, b.light)
      for (let i = 0; i < lit; i++) {
        const k = i === lit - 1 && working ? 1 + 0.45 * pulse(beat) : 1
        sparklePath(ctx, LAB.stars[3 * i]!, LAB.stars[3 * i + 1]!, LAB.stars[3 * i + 2]! * 1.5 * k)
        fill(ctx, b.accent)
      }
      if (working) {
        const { door } = LAB
        ctx.beginPath()
        addArch(ctx, door.x, door.y, door.w * gulp, door.h * gulp)
        fill(ctx, C.warm)
      }
      break
    }
    case 'pump': {
      // A bubble grows at the spout over each pluck and drops into the pond as the next one starts.
      if (!working) break
      const { drip } = PUMP
      const grow = 0.08 + 0.17 * clamp01(beat)
      thingAt(ctx, 'bubble', drip.x, drip.y + grow / 2, grow, t, pic.id)
      if (beat < 0.35) {
        const u = beat / 0.35
        thingAt(ctx, 'bubble', drip.x, drip.y + 0.15 + 0.4 * u * u, 0.25 * (1 - 0.6 * u), t, pic.id + 1)
      }
      break
    }
  }
  if (pic.mode === 'waiting') drawWants(ctx, pic.kind, pic.wants, t, pic.id)
}

/** The tower whole after its shadow: its post and cup, its stars, the bubbles it holds, its wand (up while it holds suds, drooping when empty, flicking as it shoots) and its shot's puff. */
function drawTower(ctx: CanvasRenderingContext2D, pic: BuildingPic, wand: number, t: number) {
  const b = BUILDING.tower
  const outline = () => {
    ctx.beginPath()
    addOutline(ctx, 'tower', wand)
  }
  rimmed(ctx, outline, b.body)
  ctx.beginPath()
  addRoundRect(ctx, ...TOWER.foot)
  fill(ctx, b.fold)
  ctx.beginPath()
  ctx.moveTo(TOWER.cup.x + TOWER.cup.r, TOWER.cup.y)
  ctx.arc(TOWER.cup.x, TOWER.cup.y, TOWER.cup.r, 0, Math.PI)
  ctx.closePath()
  fill(ctx, b.light)
  const ring = wandRing(wand)
  ctx.beginPath()
  addCapsule(ctx, TOWER.pivot.x, TOWER.pivot.y, ring.x, ring.y, 0.04)
  fill(ctx, b.fold)
  ctx.beginPath()
  addCircle(ctx, ring.x, ring.y, TOWER.ring)
  fill(ctx, b.fold)
  // The ring holds a film of suds while it has shots; empty, it is a bare ring.
  ctx.beginPath()
  addCircle(ctx, ring.x, ring.y, TOWER.ring * 0.62)
  fill(ctx, pic.ammo > 0 ? b.accent : b.light)
  for (let i = 0; i < Math.min(5, pic.stars); i++) {
    starPath(ctx, TOWER.post[0] + TOWER.post[2] / 2, TOWER.stars[i]!, 0.06)
    fill(ctx, GLASS.star)
  }
  // The bubbles it holds sit in its cup, the second on the first; a half-used one is smaller, and the newest pops in as it takes one.
  const held = Math.ceil(pic.ammo / TOWER_AMMO_PER_BUBBLE)
  const gulp = 1 + 0.25 * arch(clamp01(heldAge(pic.gulpAge) / 0.25))
  for (let i = 0; i < held; i++) {
    const last = i === held - 1 && pic.ammo % TOWER_AMMO_PER_BUBBLE === 1
    const size = (last ? 0.15 : 0.2) * (i === held - 1 ? gulp : 1)
    thingAt(ctx, 'bubble', TOWER.cup.x, TOWER.cup.y - 0.02 - i * 0.16 - size / 2 + 0.06, size, t, pic.id * 3 + i)
  }
  if (pic.ammo === 0) drawWants(ctx, 'tower', ['bubble'], t, pic.id)
  const shot = heldAge(pic.shotAge)
  if (shot < 0.45) {
    // The puff leaves the ring, growing and thinning out, then flies on (effects draw the flight).
    const u = shot / 0.45
    const d = 0.1 + 0.16 * u
    const r = 0.04 + 0.05 * Math.sin(Math.PI * u)
    ctx.beginPath()
    for (const [da, k] of [
      [-0.4, 1],
      [0, 1.2],
      [0.45, 0.9],
    ] as const)
      addCircle(ctx, ring.x + Math.cos(wand + da) * d, ring.y + Math.sin(wand + da) * d, r * k)
    fill(ctx, THING.bubble.key)
  }
}

/** A picnic at a bowl: a checked cloth on the ground under it, drawn before the bowl's shadow. */
function drawCloth(ctx: CanvasRenderingContext2D) {
  const b = BUILDING.bowl
  ctx.save()
  ctx.beginPath()
  addEllipse(ctx, 0.5, 0.88, 0.5, 0.12, 0)
  fill(ctx, b.light)
  ctx.clip()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.rect(i * 0.1, 0.76 + j * 0.08, 0.1, 0.08)
  fill(ctx, C.white)
  ctx.restore()
}
/** A picnic's hearts, rising from the bowl two at a time and shrinking away. */
function drawHearts(ctx: CanvasRenderingContext2D, t: number, id: number) {
  for (let i = 0; i < 2; i++) {
    const u = loop(t, 1.8, phaseOf(id) + i / 2)
    const size = 0.17 * (1 - 0.4 * u) * (1 - smooth(0.8, 1, u))
    if (size < 0.01) continue
    heartPath(ctx, 0.5 + (i === 0 ? -0.15 : 0.16) + 0.04 * Math.sin(TAU * u), 0.32 - 0.44 * u, size)
    fill(ctx, C.heart)
  }
}

/** The bowl whole after its shadow: its lip and inside, the gold bars it holds standing in it, its front, its foot; what it wants while empty. */
function drawBowl(ctx: CanvasRenderingContext2D, pic: BuildingPic, t: number) {
  const b = BUILDING.bowl
  const outline = () => {
    ctx.beginPath()
    addOutline(ctx, 'bowl', 0)
  }
  rimmed(ctx, outline, b.body)
  ctx.beginPath()
  addEllipse(ctx, BOWL.x, BOWL.y, BOWL.rx, BOWL.lip, 0)
  fill(ctx, b.light)
  ctx.beginPath()
  addEllipse(ctx, BOWL.x, BOWL.y, BOWL.inner.rx, BOWL.inner.ry, 0)
  fill(ctx, b.fold)
  // Its bars stand in it, the newest popping in as it takes one.
  const bars = Math.min(BOWL_HOLD, pic.bars)
  const gulp = 1 + 0.25 * arch(clamp01(heldAge(pic.gulpAge) / 0.25))
  for (let i = 0; i < bars; i++) {
    ctx.save()
    ctx.translate(BOWL.bars[3 * i]!, BOWL.bars[3 * i + 1]!)
    ctx.rotate(BOWL.bars[3 * i + 2]!)
    // The newest grows as it comes in; the rest keep their size.
    if (i === bars - 1 && gulp !== 1) drawThing(ctx, 'goldBar', 0.3 * gulp, t, pic.id * 5 + i)
    else drawStillThing(ctx, 'goldBar', 0.3, t, pic.id * 5 + i)
    ctx.restore()
  }
  // The front: the round body over the bars' feet, then the near half of the lip.
  ctx.beginPath()
  ctx.moveTo(BOWL.x + BOWL.rx, BOWL.y)
  ctx.ellipse(BOWL.x, BOWL.y, BOWL.rx, BOWL.ry, 0, 0, Math.PI)
  ctx.closePath()
  fill(ctx, b.body)
  ctx.beginPath()
  ctx.ellipse(BOWL.x, BOWL.y, BOWL.rx, BOWL.lip, 0, 0, Math.PI)
  ctx.ellipse(BOWL.x, BOWL.y, BOWL.inner.rx, BOWL.inner.ry, 0, Math.PI, 0, true)
  ctx.closePath()
  fill(ctx, b.light)
  ctx.beginPath()
  addRoundRect(ctx, ...BOWL.foot)
  fill(ctx, b.fold)
  if (pic.bars === 0) drawWants(ctx, 'bowl', ['goldBar'], t, pic.id)
  if (pic.picnic) drawHearts(ctx, t, pic.id)
}

/** The pad whole after its shadow, seen from above: the slab, its panel, its coral rings and corner lights; from Rocket! on it drums, its rings pulsing out on each beat. */
function drawPad(ctx: CanvasRenderingContext2D, pic: BuildingPic) {
  const b = BUILDING.pad
  const outline = () => {
    ctx.beginPath()
    addOutline(ctx, 'pad', 0)
  }
  rimmed(ctx, outline, b.body)
  ctx.beginPath()
  addRoundRect(ctx, ...PADART.panel)
  fill(ctx, b.light)
  const drum = pic.mode === 'working' ? pulse(pic.beat) : 0
  ctx.beginPath()
  for (const r of PADART.rings) addCircle(ctx, 1.5, 1.5, r + 0.05 * drum)
  roundStroke(ctx, PADART.ring, b.accent)
  ctx.beginPath()
  const l = PADART.light
  for (const [x, y] of [
    [l, l],
    [3 - l, l],
    [l, 3 - l],
    [3 - l, 3 - l],
  ] as const)
    addCircle(ctx, x, y, 0.075)
  fill(ctx, b.accent)
  if (pic.mode === 'working' && pic.beat < 1) {
    // The drum's ripple runs out from the middle and thins away to nothing at the beat's end.
    const u = clamp01(pic.beat)
    ctx.beginPath()
    addCircle(ctx, 1.5, 1.5, mix(0.5, 1.38, u))
    roundStroke(ctx, PADART.ring * (1 - u), b.accent)
  }
}

/**
 * The roof stack: up to STACK things in a row along the top of the outline, half over it
 * (where.ts stackBox, where the hit test finds it), standing on a little plank in the kind's
 * fold so they read as piled on the roof whatever its shape.
 */
function drawStack(ctx: CanvasRenderingContext2D, pic: BuildingPic, t: number) {
  const n = pic.stack.length
  if (n === 0) return
  if (n > STACK) throw new Error(`a roof stack holds at most ${STACK}, not ${n}`)
  if (!isStamped(pic.kind) || pic.kind === 'lab') throw new Error(`a ${pic.kind} never stacks what it makes`)
  const box = stackBox(newBuilding(pic.id, pic.kind, 0, 0, -1))
  const step = box.w / STACK
  const size = step * 0.88
  const mid = box.x + box.w / 2
  const y = box.y + box.h / 2
  const plank = () => {
    ctx.beginPath()
    addRoundRect(ctx, mid - (n * step) / 2, y + size / 2 - 0.02, n * step, 0.09, 0.045)
  }
  little(ctx, plank, BUILDING[pic.kind].fold)
  pic.stack.forEach((thing, i) => {
    ctx.save()
    ctx.translate(mid + (i - (n - 1) / 2) * step, y - 0.02)
    drawStillThing(ctx, thing, size, t, pic.id * 11 + i)
    ctx.restore()
  })
}

/** The recipe bubble over its top, RECIPE_FOR after a tap: the things in, an arrow, what comes out, popping up and away. */
function drawRecipe(ctx: CanvasRenderingContext2D, kind: Kind, recipe: Recipe, age: number, t: number, id: number) {
  const ITEM = 0.5
  const GAP = 0.07
  const ARROW = 0.3
  const PAD = 0.13
  const pictures = recipe.takes.length + (recipe.makes === null ? 0 : 1)
  if (pictures === 0) throw new Error(`a ${kind}'s recipe shows nothing`)
  const arrow = recipe.makes !== null && recipe.takes.length > 0
  const w = pictures * ITEM + (pictures - 1) * GAP + (arrow ? ARROW + GAP : 0) + 2 * PAD
  const h = ITEM + 1.4 * PAD
  const tip = { x: SPOT[kind].top.x, y: SPOT[kind].top.y - 0.04 }
  const top = tip.y - 0.13 - h
  // Pops up from its tail with a little overshoot, and back down at the end.
  const k = age < 0.18 ? mix(0, 1, smooth(0, 1, age / 0.18)) * (1 + 0.12 * arch(age / 0.18)) : 1 - smooth(RECIPE_FOR - 0.18, RECIPE_FOR, age)
  if (k <= 0.01) return
  ctx.save()
  ctx.translate(tip.x, tip.y)
  scaled(ctx, k, () => {
    ctx.translate(-tip.x, -tip.y)
    const outline = () => {
      ctx.beginPath()
      addRoundRect(ctx, tip.x - w / 2, top, w, h, h / 2)
      ctx.moveTo(tip.x - 0.11, top + h - 0.02)
      ctx.lineTo(tip.x + 0.11, top + h - 0.02)
      ctx.lineTo(tip.x, tip.y)
      ctx.closePath()
    }
    little(ctx, outline, C.white)
    let x = tip.x - w / 2 + PAD + ITEM / 2
    const y = top + h / 2
    for (const thing of recipe.takes) {
      thingAt(ctx, thing, x, y, ITEM * 0.9, t, id * 13 + Math.round(x * 10))
      x += ITEM + GAP
    }
    if (arrow) {
      const ax = x - ITEM / 2 + ARROW / 2 - 0.02
      ctx.beginPath()
      addRoundPoly(ctx, [ax - 0.14, y - 0.045, ax + 0.02, y - 0.045, ax + 0.02, y - 0.11, ax + 0.15, y, ax + 0.02, y + 0.11, ax + 0.02, y + 0.045, ax - 0.14, y + 0.045], 0.02)
      fill(ctx, BELT.body)
      x += ARROW + GAP
    }
    switch (recipe.makes) {
      case null:
        break
      case 'star':
        starPath(ctx, x, y + 0.02, ITEM * 0.48)
        fill(ctx, GLASS.star)
        break
      case 'suds':
        ctx.beginPath()
        addCircle(ctx, x - 0.1, y + 0.06, 0.12)
        addCircle(ctx, x + 0.1, y + 0.05, 0.11)
        addCircle(ctx, x, y - 0.08, 0.13)
        fill(ctx, THING.bubble.fold)
        ctx.beginPath()
        addCircle(ctx, x - 0.02, y - 0.1, 0.07)
        addCircle(ctx, x - 0.12, y + 0.04, 0.06)
        fill(ctx, THING.bubble.key)
        break
      case 'heart':
        heartPath(ctx, x, y + 0.02, ITEM * 0.8)
        fill(ctx, C.heart)
        break
      case 'rocket':
        ctx.save()
        ctx.translate(x, y)
        drawLittleRocket(ctx, ITEM * 1.05)
        ctx.restore()
        break
      default:
        thingAt(ctx, recipe.makes, x, y, ITEM * 0.9, t, id * 17)
    }
  })
  ctx.restore()
}

/** The tower's wand angle now: up while it holds shots (flicking forward as it shoots), drooping once the last shot is gone. */
function wandAngle(pic: BuildingPic): number {
  const shot = heldAge(pic.shotAge)
  if (pic.ammo > 0) return TOWER.up + 0.6 * (shot < 0.3 ? arch(shot / 0.3) : 0)
  return mix(TOWER.up, TOWER.droop, smooth(0.1, 0.7, shot))
}

/**
 * A building's picture at sim time t, origin its footprint's top-left, upright: held as `hold`
 * says, squashed by its slap and its push about its ground point, risen by `rise` over a soft
 * oval on the ground; its body, its moving part, its roof stack, its nightcap, and over it all
 * (on the board only) the recipe bubble for RECIPE_FOR after a tap.
 */
export function drawBuilding(ctx: CanvasRenderingContext2D, pic: BuildingPic, t: number): void {
  const n = SIZE[pic.kind]
  const g = SPOT[pic.kind].ground
  if (pic.stamp !== null && (!isStamped(pic.kind) || pic.hold === 'grey')) throw new Error(`a ${pic.kind} held ${pic.hold} is drawn from its paths`)
  if (pic.kind === 'pad' && (pic.hold !== 'board' || pic.rise !== 0)) throw new Error('the pad is fixed on the board: it is never held and never bounces (its launch button does)')
  const wand = pic.kind === 'tower' ? wandAngle(pic) : 0
  const outline = () => {
    ctx.beginPath()
    addOutline(ctx, pic.kind, wand)
  }
  const lift = pic.hold === 'ghost' ? 0.6 : pic.hold === 'peel' ? 0.4 : 0
  const wobble = pic.hold === 'grey' ? 0.07 * Math.sin(TAU * 2.2 * t) : pic.hold === 'peel' ? -0.05 + 0.03 * Math.sin(TAU * 1.6 * t) : 0
  // The pump floats: it rocks slowly on the pond.
  const bob = pic.kind === 'pump' ? 0.035 * Math.sin(TAU * loop(t, 2.6, phaseOf(pic.id))) : 0
  const [ax, ay] = slap(heldAge(pic.placedAge))
  const [px, py] = push(heldAge(pic.pushAge))
  const grow = pic.hold === 'ghost' ? 1.06 : pic.hold === 'peel' ? 1.04 : 1
  ctx.save()
  if (pic.hold === 'ghost') ctx.globalAlpha *= 0.85
  if (pic.kind === 'pump' && pic.hold === 'board') {
    // Its ripple on the water, under the sticker.
    ctx.beginPath()
    ctx.ellipse(g.x, g.y - 0.02, 0.72 + 0.03 * Math.sin(TAU * loop(t, 2.6, phaseOf(pic.id) + 0.25)), 0.13, 0, 0, TAU)
    roundStroke(ctx, 0.05, LAND.pondLight)
  }
  ctx.translate(n / 2, n / 2)
  tipped(ctx, 0, grow, grow, () => {
    ctx.translate(g.x - n / 2, g.y - n / 2)
    tipped(ctx, wobble + bob, ax * px, ay * py, () => {
      ctx.translate(-g.x, -g.y)
      if (pic.hold === 'grey') {
        rimmed(ctx, outline, C.grey)
        return
      }
      if (pic.kind === 'bowl' && pic.picnic) drawCloth(ctx)
      if (pic.rise > 0) {
        // Off the ground (the hint's bounce), a soft oval stays on the ground under it, smaller the higher it goes, as under a hopping muncher.
        ctx.save()
        ctx.translate(g.x, g.y - 0.08)
        groundShadow(ctx, 0.7 * n, pic.rise)
        ctx.restore()
        ctx.translate(0, -pic.rise)
      }
      // On the board a stamped body's bitmap holds its shadow.
      const stamped = pic.stamp !== null && pic.hold === 'board'
      if (!stamped) stickerShadow(ctx, outline, lift, RIM)
      if (pic.kind === 'tower') drawTower(ctx, pic, wand, t)
      else if (pic.kind === 'bowl') drawBowl(ctx, pic, t)
      else if (pic.kind === 'pad') drawPad(ctx, pic)
      else {
        if (pic.stamp === null) drawBody(ctx, pic.kind, false)
        else {
          const box = bodyBox(pic.kind, stamped)
          ctx.drawImage(pic.stamp, box.x, box.y, box.w, box.h)
        }
        drawParts(ctx, pic, t)
      }
      drawStack(ctx, pic, t)
      if (pic.night !== 'none') {
        const cap = SPOT[pic.kind].cap
        drawNightcap(ctx, cap.x, cap.y, cap.r, cap.tilt)
      }
    })
  })
  ctx.restore()
  if (pic.hold === 'board' && heldAge(pic.tapAge) < RECIPE_FOR) {
    ctx.save()
    ctx.translate(0, -pic.rise)
    drawRecipe(ctx, pic.kind, pic.recipe, heldAge(pic.tapAge), t, pic.id)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------------------
// Plan view on the footprint: the mouths and spouts, and a ghost's footprint

/**
 * The mouth tabs and spouts on a footprint's edges, plan view in the board's frame (origin the
 * footprint's top-left, never turned with the picture): a mouth (a belt feeds in) is a tab in
 * the kind's fold with the belt's dark throat at the edge; a spout (a belt leads out) is a tab
 * in its lighter colour whose lip pokes out over the belt's start. The renderer bakes them
 * with the belts, under the pictures.
 */
export function drawTabs(ctx: CanvasRenderingContext2D, kind: Kind, mouths: readonly Tab[], spouts: readonly Tab[]): void {
  const n = SIZE[kind]
  const b = BUILDING[kind]
  for (const [tabs, out] of [
    [mouths, false],
    [spouts, true],
  ] as const)
    for (const tab of tabs) {
      if (tab.at < 0 || tab.at >= n || !Number.isInteger(tab.at)) throw new Error(`a ${kind} has no cell ${tab.at} along its side`)
      const x = tab.side === 0 ? n : tab.side === 2 ? 0 : tab.at + 0.5
      const y = tab.side === 1 ? n : tab.side === 3 ? 0 : tab.at + 0.5
      const lip = out ? 0.07 : 0
      ctx.save()
      ctx.translate(x, y)
      tipped(ctx, (tab.side * Math.PI) / 2, 1, 1, () => {
        little(
          ctx,
          () => {
            ctx.beginPath()
            addRoundRect(ctx, -0.3, -0.22, 0.3 + lip, 0.44, 0.1)
          },
          out ? b.light : b.fold,
        )
        ctx.beginPath()
        addRoundRect(ctx, -0.1, -0.12, 0.1 + lip, 0.24, 0.05)
        fill(ctx, BELT.body)
      })
      ctx.restore()
    }
}

/** A ghost's footprint where it will land, plan view at the snapped cells: a dashed outline 0.15 cell outside them over a faint tint, deep teal where it fits and grey where it cannot go. */
export function drawFootprint(ctx: CanvasRenderingContext2D, kind: Kind, ok: boolean): void {
  const n = SIZE[kind]
  const m = 0.15
  ctx.save()
  roundRectPath(ctx, -m, -m, n + 2 * m, n + 2 * m, 0.28)
  faded(ctx, 0.5, () => fill(ctx, ok ? C.liftShadow : C.grey))
  ctx.setLineDash([0.17, 0.11])
  ctx.lineWidth = Math.max(0.05, 1.5 / (pen.dpr * pen.ppm))
  ctx.lineCap = 'round'
  ctx.strokeStyle = ok ? C.ghostLine : C.grey
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The tray's stickers

/** A building at rest on the board: waiting for nothing, never placed, pushed or tapped; the lab's card a third full, a tower full of suds, a bowl with two bars. The tray, the sheet and the tests start from it. */
export function restingPic(kind: Kind): BuildingPic {
  return {
    kind,
    id: KINDS.indexOf(kind) + 1,
    mode: 'waiting',
    beat: 0,
    wants: [],
    stack: [],
    recipe: recipeOf(kind, kind === 'digger' || kind === 'oven' ? ['blueRock'] : kind === 'lab' ? ['greenBottle'] : kind === 'pad' ? ['blueBar'] : []),
    placedAge: Infinity,
    pushAge: Infinity,
    gulpAge: Infinity,
    tapAge: Infinity,
    shotAge: Infinity,
    progress: 0.34,
    found: null,
    ammo: TOWER_AMMO,
    stars: 0,
    bars: 2,
    picnic: false,
    night: 'none',
    hold: 'board',
    rise: 0,
    stamp: null,
  }
}

/** Every tray sticker fits this box: the HUD's portraits of the tray draw it there. */
export const STICKER_BOX: Box = { x: 0, y: 0, w: 1, h: 1 }
/** How each sticker sits in STICKER_BOX: its scale and offset from its footprint's top-left. */
const TRAY: Record<Sticker, { k: number; x: number; y: number }> = {
  digger: { k: 0.5, x: 0, y: 0 },
  oven: { k: 0.5, x: 0, y: 0 },
  workshop: { k: 0.5, x: 0, y: 0 },
  greenMaker: { k: 0.5, x: 0, y: 0 },
  orangeMaker: { k: 0.5, x: 0, y: 0 },
  lab: { k: 0.5, x: 0, y: -0.08 },
  pump: { k: 0.5, x: 0.01, y: 0 },
  tower: { k: 0.86, x: 0.04, y: 0.12 },
  bowl: { k: 1, x: 0, y: -0.06 },
  hedge: { k: 1, x: 0, y: -0.04 },
}

/** The tray's hedge: a little hedge block with leafy bumps, in the hedges' greens. */
function drawShrub(ctx: CanvasRenderingContext2D) {
  const outline = () => {
    ctx.beginPath()
    addRoundRect(ctx, ...SHRUB.base)
    for (let i = 0; i < SHRUB.bumps.length; i += 3) addCircle(ctx, SHRUB.bumps[i]!, SHRUB.bumps[i + 1]!, SHRUB.bumps[i + 2]!)
  }
  little(ctx, outline, HEDGE.body)
  ctx.beginPath()
  for (let i = 0; i < SHRUB.bumps.length; i += 3) addCircle(ctx, SHRUB.bumps[i]! - 0.03, SHRUB.bumps[i + 1]! - 0.04, SHRUB.bumps[i + 2]! * 0.55)
  fill(ctx, HEDGE.light)
  const [x, y, w, h] = SHRUB.base
  ctx.beginPath()
  addRoundRect(ctx, x, y + h - 0.13, w, 0.13, 0.1)
  fill(ctx, HEDGE.fold)
}

/** A tray button's sticker in STICKER_BOX: the building as its sticker at rest (the pump still bobbing), the hedge as a little hedge. */
export function drawSticker(ctx: CanvasRenderingContext2D, sticker: Sticker, t: number): void {
  const fit = TRAY[sticker]
  ctx.save()
  ctx.translate(fit.x, fit.y)
  scaled(ctx, fit.k, () => (sticker === 'hedge' ? drawShrub(ctx) : drawBuilding(ctx, restingPic(sticker), t)))
  ctx.restore()
}

/** The die-cut hole a used sticker leaves on the tray's backing sheet, in STICKER_BOX: its outline as one flat soft teal shadow (one fill, so the pieces of a many-piece outline never show their own edges). */
export function drawHole(ctx: CanvasRenderingContext2D, sticker: Sticker): void {
  const fit = TRAY[sticker]
  ctx.save()
  ctx.translate(fit.x, fit.y)
  scaled(ctx, fit.k, () => {
    ctx.beginPath()
    if (sticker === 'hedge') {
      addRoundRect(ctx, ...SHRUB.base)
      for (let i = 0; i < SHRUB.bumps.length; i += 3) addCircle(ctx, SHRUB.bumps[i]!, SHRUB.bumps[i + 1]!, SHRUB.bumps[i + 2]!)
    } else addOutline(ctx, sticker, TOWER.up)
    fill(ctx, C.liftShadow)
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** The sheet's stand-in for the band: how long each kind's note is, seconds (90 bpm: an eighth is a third of a second). */
const NOTE: Record<Kind, number> = { pad: 2 / 3, digger: 1 / 3, oven: 2 / 3, workshop: 2 / 3, greenMaker: 2 / 3, orangeMaker: 2 / 3, lab: 4 / 3, pump: 1, tower: 1, bowl: 1 }
/** What each kind waits for on the sheet. */
const WANTS: Record<Kind, readonly Thing[]> = { pad: [], digger: [], oven: ['blueRock'], workshop: ['blueBar'], greenMaker: ['blueBar', 'goldBar'], orangeMaker: ['gear'], lab: ['greenBottle'], pump: [], tower: [], bowl: [] }
/** What each maker stacks on the sheet. */
const MAKES: Partial<Record<Kind, Thing>> = { digger: 'goldRock', oven: 'blueBar', workshop: 'gear', greenMaker: 'greenBottle', orangeMaker: 'orangeBottle', pump: 'bubble' }

/** ?sheet=buildings: every kind in every state, the lab's stars, the tower's ammo, stars and shots, the bowl's bars and picnic, the pad drumming, tabs, ghosts and footprints, and the tray's stickers and holes. */
export const SHEET = (): SheetEntry[] => {
  const out: SheetEntry[] = []
  const at = (kind: Kind, label: string, top: number, side: number, patch: (t: number) => Partial<BuildingPic>) => {
    const n = SIZE[kind]
    out.push({ label: `${kind} ${label}`, box: { x: -0.15 - side, y: -0.15 - top, w: n + 0.3 + 2 * side, h: n + 0.3 + top }, draw: (ctx, t) => drawBuilding(ctx, { ...restingPic(kind), ...patch(t) }, t) })
  }
  for (const kind of KINDS) {
    const made = MAKES[kind]
    const tall = kind === 'tower' ? 0.15 : 0
    at(kind, 'at rest', tall, 0, () => ({}))
    at(kind, 'working', tall, 0, (t) => ({ mode: 'working', beat: loop(t, NOTE[kind], 0) }))
    if (WANTS[kind].length > 0) at(kind, 'waiting', tall, 0, () => ({ mode: 'waiting', wants: WANTS[kind] }))
    if (made) {
      at(kind, 'stopped, a stack of 4', 0.4, 0, () => ({ mode: 'stopped', stack: [made, made, made, made] }))
      at(kind, 'stack 0 to 4', 0.4, 0, (t) => ({ mode: 'working', beat: loop(t, NOTE[kind], 0), stack: Array<Thing>(Math.floor(t) % 5).fill(made) }))
    }
    at(kind, 'slap (replays)', tall, 0.1, (t) => ({ placedAge: replay(t, 0.3) }))
    at(kind, 'push (replays)', tall, 0.1, (t) => ({ mode: 'working', beat: loop(t, NOTE[kind], 0), pushAge: replay(t, 0.25) }))
    at(kind, 'gulp (replays)', tall, 0, (t) => ({ gulpAge: replay(t, 0.3) }))
    at(kind, 'recipe (replays)', 1, 0.4, (t) => ({ tapAge: replay(t, RECIPE_FOR) }))
    at(kind, 'in a nightcap', 0.5, 0, () => ({ night: 'cap' }))
    at(kind, 'tucked in', 0.5, 0, () => ({ night: 'tucked', mode: 'stopped' }))
    if (kind !== 'pad') {
      at(kind, 'ghost', 0.2, 0.25, () => ({ hold: 'ghost' }))
      at(kind, 'grey ghost', tall + 0.1, 0.1, () => ({ hold: 'grey' }))
      at(kind, 'peeled', 0.2, 0.2, () => ({ hold: 'peel' }))
    }
    if (kind !== 'pad') at(kind, 'bouncing', 0.25, 0, (t) => ({ rise: 0.2 * arch(loop(t, 0.8, 0)) }))
  }
  for (const p of [0, 0.34, 0.67, 1]) at('lab', `card ${Math.round(p * 100)} percent`, 0, 0, () => ({ progress: p }))
  at('lab', 'card filling', 0, 0, (t) => ({ mode: 'working', beat: loop(t, NOTE.lab, 0), progress: (t / 12) % 1.1 }))
  for (const card of CARDS) at('lab', `found ${card}: its stars join into the card's picture (replays)`, 0, 0, (t) => ({ found: { card, age: replay(t, CELEBRATE) } }))
  for (let a = 0; a <= TOWER_AMMO; a++) at('tower', `${a} shots`, 0.15, 0, () => ({ ammo: a }))
  for (let s = 0; s <= 5; s++) at('tower', `${s} stars`, 0.15, 0, () => ({ stars: s }))
  at('tower', 'shooting (replays)', 0.15, 0.1, (t) => ({ shotAge: replay(t, 1), ammo: 3 }))
  at('tower', 'last shot, drooping (replays)', 0.15, 0.1, (t) => ({ shotAge: replay(t, 1.5), ammo: 0 }))
  for (let n = 0; n <= BOWL_HOLD; n++) at('bowl', `${n} gold bars`, 0, 0, () => ({ bars: n }))
  at('bowl', 'picnic', 0.3, 0, () => ({ picnic: true, bars: 2 }))
  for (const kind of ['oven', 'greenMaker', 'pad'] as const) {
    const n = SIZE[kind]
    out.push({
      label: `${kind} tabs: mouths west and north, spouts east and south`,
      box: { x: -0.25, y: -0.25, w: n + 0.5, h: n + 0.5 },
      draw: (ctx, t) => {
        drawTabs(ctx, kind, [{ side: 2, at: 0 }, { side: 3, at: n - 1 }], [{ side: 0, at: 0 }, { side: 1, at: n - 1 }])
        drawBuilding(ctx, restingPic(kind), t)
      },
    })
  }
  // The pad with its rocket lying on it, as the renderer draws them: at the start, on the way, and built with the launch waiting.
  for (const [label, rocket] of [
    ['at the start', { parts: PARTS.map((_, i) => ({ open: i === 0, fill: 0, fullAge: Infinity })), ready: false }],
    ['on the way', { parts: PARTS.map((_, i) => ({ open: i <= 2, fill: i < 2 ? 1 : i === 2 ? 0.4 : 0, fullAge: Infinity })), ready: false }],
    ['ready to launch', { parts: PARTS.map(() => ({ open: true, fill: 1, fullAge: Infinity })), ready: true }],
  ] as const)
    out.push({
      label: `pad with its rocket ${label}`,
      box: { x: -0.15, y: -0.15, w: 3.3, h: 3.3 },
      draw: (ctx, t) => {
        drawBuilding(ctx, restingPic('pad'), t)
        drawRocket(ctx, rocket, t)
      },
    })
  for (const kind of ['tower', 'oven', 'pad'] as const)
    for (const ok of [true, false]) {
      const n = SIZE[kind]
      out.push({ label: `${kind} footprint ${ok ? 'fits' : 'cannot go'}`, box: { x: -0.25, y: -0.25, w: n + 0.5, h: n + 0.5 }, draw: (ctx) => drawFootprint(ctx, kind, ok) })
    }
  // Every 2x2 kind working in a row over a belt full of things: the band should be soft enough that the things stay the loudest.
  out.push({
    label: 'the band beside a belt of things',
    box: { x: -0.1, y: -0.1, w: 14.2, h: 3.1 },
    draw: (ctx, t) => {
      ctx.beginPath()
      ctx.rect(-0.1, 2.2, 14.2, 0.6)
      fill(ctx, BELT.body)
      for (let i = 0; i < 28; i++) thingAt(ctx, THINGS[i % THINGS.length]!, 0.25 + i * 0.5, 2.5, ON_BELT, t, i)
      STAMPED.forEach((kind, i) => {
        ctx.save()
        ctx.translate(i * 2, 0)
        drawBuilding(ctx, { ...restingPic(kind), mode: 'working', beat: loop(t, NOTE[kind], 0) }, t)
        ctx.restore()
      })
    },
  })
  out.push({ label: 'tray stickers', box: { x: -0.05, y: -0.05, w: 1.2 * 10, h: 1.1 }, draw: (ctx, t) => trayRow(ctx, (s) => drawSticker(ctx, s, t)) })
  out.push({ label: 'tray holes', box: { x: -0.05, y: -0.05, w: 1.2 * 10, h: 1.1 }, draw: (ctx) => trayRow(ctx, (s) => drawHole(ctx, s)) })
  return out
}

/** Draws one thing per tray sticker in a row, 1.2 apart. */
function trayRow(ctx: CanvasRenderingContext2D, draw: (s: Sticker) => void) {
  STICKERS.forEach((s, i) => {
    ctx.save()
    ctx.translate(i * 1.2, 0)
    draw(s)
    ctx.restore()
  })
}
