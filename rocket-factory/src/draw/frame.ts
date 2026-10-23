import { bandOf, EIGHTH, PART_OF, padDrums, sinceNote, working, type Band } from '../game/band'
import { dugAt } from '../game/beep'
import { BURROWS, FLOWER_OF, LANDS, PAD, cellInLand, cellOf, dirTo, rockOf, stepCell, xOf, yOf } from '../game/board'
import { viewMoves } from '../game/camera'
import { GROW, PART_INFO, PAWS_FOR, RECIPES, REGROW, SIZE, STACK, STROKE_MAX, card } from '../game/catalog'
import { hintGhost, hintPath, muncherDrawn, targets, turnCS, fingerLift, type Area, type View } from '../game/layout'
import { labNeed, openParts } from '../game/machines'
import {
  CELLS,
  HOP,
  OVER,
  PARTS,
  SLOTS,
  STEP,
  THINGS,
  inSlot,
  opposite,
  outSlot,
  overIn,
  overOut,
  since,
  slotCell,
  thingIndex,
  type Building,
  type Dir,
  type Drag,
  type Hit,
  type Kind,
  type Muncher,
  type Placeable,
  type SimEvent,
  type State,
  type Thing,
} from '../game/model'
import { pawsOf } from '../game/munchers'
import { launchReady } from '../game/rules'
import { planHedge, planPeelDrag, planPlace, planStroke } from '../game/strokes'
import { LAY_GAP } from '../game/sounds'
import { basketPoint, beepPoint, flightPoint, heapPoint, hopProgress, moonyPoint, napSpot, slotPoint, thingPoint, type Box } from '../game/where'
import { beepPicture, drawBeep } from './beep'
import {
  CURL,
  POP,
  beltPic,
  drawBeltCurl,
  drawBeltMarks,
  drawBeltPop,
  drawBelts,
  drawBridges,
  drawEndSign,
  drawHedges,
  drawHintPath,
  drawPaddle,
  drawStrokeGhost,
  drawZip,
  hedgeLinks,
  type BeltMarks,
  type BeltPic,
  type EndSign,
  type GhostCell,
  type HedgePic,
} from './beltart'
import { CELEBRATE, RECIPE_FOR, STAMPED, bodyBox, drawBody, drawBuilding, drawFootprint, drawTabs, recipeOf, restingPic, type BuildingPic, type Mode, type Stamped, type Tab } from './buildings'
import { BUDGET, Cache } from './cache'
import { drawMoony, drawMuncher, muncherPicture } from './critters'
import { Effects, drawHintRing, hintLift } from './effects'
import { handTrail } from './hand'
import { drawBasket, drawBurrow, drawCellPrint, drawFlapCorner, drawFlaps, drawHeap, drawPaws, drawPrint, flapCorner, flapWiggle } from './land'
import { C, DEBUG, LAND, NIGHT, SHADOW, TAU, addCircle, addRoundRect, clamp01, fill, pen, roundStroke, scaled, smooth } from './look'
import { beepAway, drawLaunch, drawRocket, launchSlide, type RocketPic } from './rocket'
import { ON_BELT, drawLiftedThing, stamps } from './things'

/**
 * The picture, one frame at a time (plans/rocket-factory.md, The look and Drawing): the table;
 * the land's print, baked once per land, size and turn, its grid of cell outlines
 * cross-fading in under a stroke or a ghost; the next land's flaps; the print's cells live
 * again for a tap or a dig; the layout (belts, hedges, the mouths' tabs) baked after every
 * edit; the cells popping in and curling away; the belts' moving marks; the things riding
 * them, stamped from one bitmap per kind and size; bridges with their things lifted, paddles
 * and zips; the burrows, heaps and the basket; the buildings stamped from their still bodies
 * with their moving parts live, the rocket on its pad; the munchers, Moony and Beep; the
 * flights; the particles; the one next step; the finger's drag; the mouse's hover; Good
 * night's dusk; the launch; and ?debug's overlay.
 *
 * The art is the draw files'; this file only places it, at where.ts's points through
 * layout.ts's one map, so what is drawn is where a tap lands. Plan-view layers draw in the
 * board's own frame, turned with the upright board; every picture draws upright at its point;
 * and the sticker shadow's offset (look.ts pen) is turned with them, so shadows fall
 * down-right on screen in both. No DOM calls here: the stage hands in the canvases.
 */

// ---------------------------------------------------------------------------------------
// The picture's own timings and sizes (the sim's are in catalog.ts)

/** The grid of cell outlines cross-fades in over GRID_FADE seconds under a stroke or a ghost, and out again over it once the drag ends. */
const GRID_FADE = 0.2
/** A tapped tree, swaying flowers or dug rocks are their print cell drawn live over the bake for CELL_LIVE seconds. */
const CELL_LIVE = 1.2
/** A belt cell under a peel drag, or in a run the peel's first tap lifted, shows this far into its curl: peeled up, ready to go. */
const PEELED = 0.12
/** Dusk falls over DUSK seconds after Good night, and the things' warm lights come up with it, LIGHT cells round. */
const DUSK = 2
const LIGHT = 0.055
/** Things ride a bridge's over lane BRIDGE_SIZE times bigger with a longer shadow (BRIDGE_LIFT), and fly that big too. */
const BRIDGE_SIZE = 1.12
const BRIDGE_LIFT = 0.4
/** A thing is drawn from its paths, with its fizz, from LIVE_PX CSS px across; smaller, its picture never moves, so one stamp a kind and size draws it. */
const LIVE_PX = 40
/** A still thing's stamp has its shadow where the pen has it to a 32nd of the sticker shadow (a fifth of a device pixel on an iPad), so a picture that turns or squashes as it moves (a muncher's cheeks, what Beep carries) needs only a few. */
const SHADOW_STEP = SHADOW / 32
/** Moony home on the pad's ring is this much bigger than its picture, so the new friend reads from the sofa against the pale concrete (layout.ts BODY.moony still covers it). */
const MOONY_HOME = 1.4
/** The hint's ring under what bounces, cells round: a thing, a muncher, a heap, the basket, a building per cell of its side, and the flaps' dog-ear (its middle FLAP_RING cells in from the land's corner, both ways). */
const RING = { thing: 0.34, muncher: 0.42, heap: 0.46, basket: 0.46, building: 0.48, flap: 0.5 } as const
const FLAP_RING = 0.28
/** The end sign floats over the finger at least SIGN_PX CSS px across, or SIGN_CELLS of a cell; the stem under it is STEM px wide. */
const SIGN_PX = 44
const SIGN_CELLS = 0.9
const STEM = 2.5
/** Over a mouse pointer the sign sits up and to its right, this much of its size off the point (the hand covers nothing). */
const POINTER_OFF = 0.6
/** A held ghost's see-through hedge line, and the hint's. */
const GHOST_ALPHA = 0.6
/** The hover's outline, CSS px wide, over its shadow. */
const HOVER_LINE = 2.5
/** ?debug: its line of numbers DEBUG_Y CSS px down (under the HUD's top strip), and the slots' dots. */
const DEBUG_Y = 70
const SLOT_DOT = 2

// ---------------------------------------------------------------------------------------
// Transforms: [a, b, c, d, e, f] as the canvas has them, a point (x, y) going to (a x + c y + e, b x + d y + f)

type Matrix = [number, number, number, number, number, number]
/** p after q: a point mapped by q, then by p. */
const mul = (p: Matrix, q: Matrix): Matrix => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]]
function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
/** The bounding box of a box's four corners mapped by m. */
function mapped(m: Matrix, b: Box): { x0: number; y0: number; x1: number; y1: number } {
  const pts = [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x, b.y + b.h), apply(m, b.x + b.w, b.y + b.h)]
  return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }
}
/** A bake's name for the view it is painted at: the transform's turn and scale, and where its origin falls inside a device pixel (a whole pixel apart draws exactly). */
const viewKey = (m: Matrix) => `${m.slice(0, 4).map((v) => v.toFixed(4)).join(',')},${(((m[4] % 1) + 1) % 1).toFixed(3)},${(((m[5] % 1) + 1) % 1).toFixed(3)}`
/** v itself when it is a whole number but for float dust. */
const snap = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v)

// ---------------------------------------------------------------------------------------
// One frame

/** What bounces as the one next step: a building, a muncher, a thing on a belt, a heap, the basket, or a thing's picture over a cell (a link's thing over its path's middle cell, a dig's rock over its patch). The hint's sticker ghost bounces with it (hintGhost). */
type Bounce = { kind: 'building'; id: number } | { kind: 'muncher'; id: number } | { kind: 'slot'; slot: number } | { kind: 'heap'; burrow: number } | { kind: 'basket' } | { kind: 'picture'; cell: number; thing: Thing }

/** What one frame draws from. */
interface Frame {
  s: State
  t: number
  view: View
  /** Real seconds the particles move on: 0 when the picture's time stood still. */
  dt: number
  /** Board cells to device px: the board's transform with the launch's slide in it, and without it (what the bakes are named and painted by). */
  V: Matrix
  V0: Matrix
  /** Device px a cell. */
  k: number
  /** The board's angle on screen in radians (upright, east up: -PI/2), and the sticker shadow's offset in the board's frame, down-right on screen. */
  turn: number
  shadow: [number, number]
  /** The view holds still: bakes are named by it and painted at it; while it moves (the land easing out, the table turning) the latest held bake is drawn through it. */
  settled: boolean
  band: Band
  /** Each kind's place in its band part's note now (0 the note's start, 1 an eighth or more after it), worked out once a frame for the first machine of the kind. */
  beats: Map<Kind, number>
  /** Each stamped kind's still body at this frame's size, with its shadow and without, looked up once a frame. */
  bodies: Map<string, HTMLCanvasElement>
  bounce: Bounce | null
  /** Every belt cell's picture, and the cells left out of the layout's bake: popping in (their pop's age, under 0 before their turn) or peeled up (NaN). */
  pics: Map<number, BeltPic>
  live: Map<number, number>
  /** How far the grid of cell outlines has faded in, 0 to 1. */
  grid: number
  /** What the finger's drag will do (dragPlan), or null with no drag. */
  plan: DragPlan | null
}

/** A baked canvas and the board-to-pixel transform it was painted through. */
interface Bake {
  canvas: HTMLCanvasElement
  frame: Matrix
}
/** A stamp and the box it covers in its picture's frame, cells. */
interface Stamp {
  canvas: HTMLCanvasElement
  box: Box
}

/** What the finger's drag will do, for its picture (dragPlan). */
type DragPlan =
  | { kind: 'stroke'; cells: { cell: number; in: Dir; out: Dir; grey: boolean }[]; sign: EndSign | null; end: number }
  | { kind: 'hedge'; cells: number[] }
  | { kind: 'peel'; cells: number[] }
  | { kind: 'ghost'; sticker: Placeable; x: number; y: number; ok: boolean }

/** Seconds since a stamp, never under 0 (a stamp of this very tick is a hair ahead of the picture's time, which runs a step behind the sim), Infinity for never. */
const age = (at: number, t: number) => Math.max(0, since(at, t))
/** The two hits name the same thing. */
const sameHit = (a: Hit, b: Hit) => JSON.stringify(a) === JSON.stringify(b)

/**
 * What the finger's drag will do, for its picture, from strokes.ts's plans (the ones the
 * commit makes, so the ghost never lies): the stroke's cells as they will be laid (a bridge's
 * cell by its over lane), the finger's cells past where it stops grey, and the sign at its
 * end; the hedges a hedge line plants; the belts a peel drag rolls up; a held sticker's
 * snapped spot (the hint's spot first) and whether it fits there.
 */
function dragPlan(s: State, d: Drag, t: number): DragPlan {
  switch (d.kind) {
    case 'hedge':
      return { kind: 'hedge', cells: planHedge(s, d.cells).cells }
    case 'peel':
      return { kind: 'peel', cells: planPeelDrag(s, d.cells).cells.filter((c) => s.belts.out[c]! >= 0) }
    case 'ghost': {
      const hint = hintGhost(s, t)
      const p = planPlace(s, d.sticker, d.x, d.y, hint !== null && hint.sticker === d.sticker ? { x: hint.x, y: hint.y } : null)
      return { kind: 'ghost', sticker: d.sticker, x: p.x, y: p.y, ok: p.ok }
    }
    case 'stroke': {
      const p = planStroke(s, d.cells, hintPath(s))
      const after = new Map((p.edit?.belts ?? []).map((b) => [b.cell, b] as const))
      const cells: { cell: number; in: Dir; out: Dir; grey: boolean }[] = []
      for (const c of p.cells) {
        const b = after.get(c)
        if (b === undefined || b.after === null) continue
        // On a bridge the stroke is the over lane, straight across the belt it crosses.
        const over = b.after.over >= 0 && b.before !== null && b.before.over < 0
        cells.push({ cell: c, in: (over ? opposite(b.after.over as Dir) : b.after.in) as Dir, out: (over ? b.after.over : b.after.out) as Dir, grey: false })
      }
      // Where the finger went on past a stop: the cells it would have taken, grey.
      const path: number[] = []
      for (const c of d.cells) {
        if (path.length >= 2 && path[path.length - 2] === c) path.pop()
        else if (path[path.length - 1] !== c) path.push(c)
      }
      const reached = cells.length === 0 ? -1 : path.lastIndexOf(cells[cells.length - 1]!.cell)
      if (p.sign === 'stop')
        for (let i = reached + 1; i < Math.min(path.length, STROKE_MAX); i++) {
          const out: Dir = i + 1 < path.length ? dirTo(path[i]!, path[i + 1]!) : i > 0 ? dirTo(path[i - 1]!, path[i]!) : 0
          cells.push({ cell: path[i]!, in: i > 0 ? dirTo(path[i]!, path[i - 1]!) : opposite(out), out, grey: true })
        }
      return { kind: 'stroke', cells, sign: p.sign === 'none' ? null : p.sign, end: cells.length > 0 ? cells[cells.length - 1]!.cell : d.cells[d.cells.length - 1]! }
    }
  }
}

/**
 * Draws the game on one canvas. `makeCanvas` gives a fresh offscreen canvas for the bakes and
 * stamps; `debug` turns on the overlay.
 */
export class Renderer {
  private width = 1
  private height = 1
  private cache: Cache
  private effects = new Effects()
  /** Each held bake's board-to-pixel transform, by its cache key. */
  private frames = new Map<string, Matrix>()
  /** The last frame drawn, to draw nothing new while nothing moves (paused, or the Good night card); dirty when the canvas lost its picture or changed size. */
  private last: { s: State; t: number; tick: number; view: View; finger: string; hover: string; drag: State['drag']; tool: State['tool'] } | null = null
  private dirty = true
  /** ?debug: a smoothed frame time for the frame rate. */
  private frameTime = 1 / 60

  // What the picture remembers from the events: the state has no stamp for these, and each is only ever a moment's motion.
  /** Print cells tapped or dug (a tree shaking, flowers swaying, rocks hopping), when; Moony's and each burrow's last poke. */
  private pokes = new Map<number, number>()
  private moonyPoke = -Infinity
  private burrowPokes = [-Infinity, -Infinity, -Infinity]
  /** The last stroke's cells in the order she drew them, so they pop in one by one LAY_GAP apart as the rising ticks sound. */
  private layOrder = new Map<number, number>()
  /** Cells rolled up: last frame's belt picture of each (and the ones it showed peeled up, whose curl goes on from there), and when each curl begins. */
  private lastPics = new Map<number, BeltPic>()
  private lastPeeled = new Set<number>()
  private curls: { pic: BeltPic; at: number; from: number }[] = []
  /** Each join's merges (by cell and side, a tooth of its zip each), counted at the hop they happen, and the hop last counted. */
  private merges = new Map<number, number>()
  private hopSeen = -1
  /** Bites a nibbler has taken out of a hedge (by cell): one a crunch. */
  private bites = new Map<number, number>()
  /** The stroke being drawn: when its drag began, and when each of its cells first showed (they pop down). */
  private stroke: { at: number; seen: number[] } = { at: -1, seen: [] }
  /** When the grid began fading out (the drag ended), -Infinity while none is. */
  private gridOff = -Infinity
  private gridWas = false
  /** A burrow's paw prints, by the tap that showed them. */
  private paws = new Map<number, { at: number; cells: number[] }>()
  /** The drag's plan, made once for each drag the rules hold (each move of the finger makes a new one). */
  private planned: { drag: Drag; plan: DragPlan } | null = null
  /** Each riding thing's fizz seed, by the slot it holds, carried along with it at every hop (belts.from), so no two bottles fizz in step and none jumps in its fizz as it hops; a thing new on the belts gets the next seed. */
  private seeds = new Int32Array(SLOTS)
  private seedHop = -1
  private nextSeed = 1
  /** The frame being drawn, for the still things' stamps (things.ts stamps), or null between frames. */
  private drawing: Frame | null = null

  constructor(
    private ctx: CanvasRenderingContext2D,
    makeCanvas: () => HTMLCanvasElement,
    private debug: boolean,
  ) {
    this.cache = new Cache(makeCanvas, BUDGET)
  }

  /** The canvas's size in device pixels and its pixel ratio. */
  resize(width: number, height: number, dpr: number): void {
    this.width = width
    this.height = height
    pen.dpr = dpr
    this.dirty = true
  }

  /**
   * One frame of state `s` at sim time t through `view`: `events` are this frame's, `dt` its
   * real seconds; `finger` is the finger the stroke's sign and a held ghost float above (CSS
   * px), `hover` what a mouse with no button down would take.
   */
  draw(s: State, t: number, view: View, events: readonly SimEvent[], dt: number, finger: { x: number; y: number; touch: boolean } | null, hover: Hit | null): void {
    const l = this.last
    const fingerKey = finger === null ? '' : `${finger.x},${finger.y},${finger.touch}`
    const hoverKey = hover === null ? '' : JSON.stringify(hover)
    const sameView = l !== null && (Object.keys(view) as (keyof View)[]).every((key) => key === 'hud' || l.view[key] === view[key])
    if (dt > 0) this.frameTime += (dt - this.frameTime) * 0.1
    // Paused or at the Good night card nothing moves: the picture on the canvas is the right one.
    if (!this.dirty && l !== null && l.s === s && l.t === t && l.tick === s.tick && sameView && l.finger === fingerKey && l.hover === hoverKey && l.drag === s.drag && l.tool === s.tool && events.length === 0) return
    const moved = l === null || l.t !== t
    // A new game (Start again, Bring back) starts the picture's memories over.
    if (l !== null && l.s !== s) this.forget()
    this.last = { s, t, tick: s.tick, view, finger: fingerKey, hover: hoverKey, drag: s.drag, tool: s.tool }
    this.dirty = false
    this.cache.tick()
    pen.ppm = view.cell
    pen.dpr = view.dpr
    this.remember(s, t, events)

    const [c, sn] = turnCS(view.turn)
    const k = view.dpr * view.cell
    const V0: Matrix = [k * c, -k * sn, k * sn, k * c, view.dpr * view.ox, view.dpr * view.oy]
    const slide = s.launch === null ? 0 : launchSlide(age(s.launch.at, t)) * view.h * view.dpr
    const f: Frame = {
      s,
      t,
      view,
      dt: moved ? dt : 0,
      V: [V0[0], V0[1], V0[2], V0[3], V0[4], V0[5] + slide],
      V0,
      k,
      turn: (-view.turn * Math.PI) / 2,
      shadow: [SHADOW * (c - sn), SHADOW * (sn + c)],
      settled: !viewMoves(s, t),
      band: bandOf(s),
      beats: new Map(),
      bodies: new Map(),
      bounce: bounceOf(s),
      pics: new Map(),
      live: new Map(),
      grid: this.gridAlpha(s, t),
      plan: this.planOf(s, t),
    }
    for (let cell = 0; cell < CELLS; cell++) if (s.belts.out[cell]! >= 0) f.pics.set(cell, beltPic(s.belts, s.owner, cell))
    this.drawing = f
    // A sticker she holds up where it fits sends the notes it would send there.
    this.effects.spawn(events, s, t, f.plan?.kind === 'ghost' && f.plan.ok ? { sticker: f.plan.sticker, x: f.plan.x, y: f.plan.y } : null)
    stamps.draw = this.still
    this.liveCells(f)
    this.countMerges(s)
    this.carrySeeds(s)

    const ctx = this.ctx
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = LAND.table
    ctx.fillRect(0, 0, this.width, this.height)
    this.land(f)
    this.belts(f)
    this.things(f, false)
    this.board(f)
    drawBridges(ctx, this.marks(f, true))
    this.things(f, true)
    this.board(f)
    this.mechanisms(f)
    this.burrows(f)
    if (s.landFrom !== s.land && since(s.landAt, t) < GROW * STEP) {
      // The old land's flaps fold open over the new land, and over the burrow on it: the paper lies on top until it stands up.
      this.board(f)
      drawFlaps(ctx, s.landFrom, age(s.landAt, t) / (GROW * STEP), 0)
    }
    const origins = this.buildings(f)
    this.characters(f, origins)
    this.flights(f)
    // The particles in the board's frame, each standing upright in it (effects.ts reads the turn off the transform).
    this.board(f)
    this.upright()
    this.effects.draw(ctx, t, f.dt)
    this.hint(f)
    this.drag(f, finger)
    this.hover(f, hover)
    this.night(f)
    if (s.launch !== null) this.launch(f)
    this.lastPics = f.pics
    this.lastPeeled = new Set([...f.live].filter(([, a]) => Number.isNaN(a)).map(([c]) => c))
    if (this.debug) this.overlay(f)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    // Whoever draws next (a portrait in the HUD) finds the pen's shadow down-right, and draws every thing from its paths.
    this.upright()
    stamps.draw = null
    this.drawing = null
  }

  /** Forget every baked canvas (a context was lost): everything is painted again. */
  invalidate(): void {
    this.cache.clear()
    this.frames.clear()
    this.dirty = true
  }

  /** Lets go of every canvas: the stage is gone. */
  dispose(): void {
    this.cache.clear()
    this.frames.clear()
  }

  // -------------------------------------------------------------------------------------
  // Frames and pens

  /** The board's frame on the context, the sticker shadow turned with it. */
  private board(f: Frame): void {
    this.ctx.setTransform(...f.V)
    pen.shadowX = f.shadow[0]
    pen.shadowY = f.shadow[1]
  }

  /** The sticker shadow as an upright picture casts it. */
  private upright(): void {
    pen.shadowX = SHADOW
    pen.shadowY = SHADOW
  }

  /** An upright picture's frame with its origin at board point (x, y), lifted `up` cells on screen. */
  private at(f: Frame, x: number, y: number, up: number): [number, number] {
    const [X, Y] = apply(f.V, x, y)
    this.ctx.setTransform(f.k, 0, 0, f.k, X, Y - up * f.k)
    return [X, Y - up * f.k]
  }

  /** A footprint's upright picture frame (an n-cell square with its top-left cell at (x, y)): its origin the picture's top-left, the footprint's middle where the board has it, lifted `up` cells. Returns the origin in device px. */
  private footprint(f: Frame, x: number, y: number, n: number, up: number): [number, number] {
    const [X, Y] = apply(f.V, x + n / 2, y + n / 2)
    const ox = X - (n / 2) * f.k
    const oy = Y - (n / 2) * f.k - up * f.k
    this.ctx.setTransform(f.k, 0, 0, f.k, ox, oy)
    return [ox, oy]
  }

  // -------------------------------------------------------------------------------------
  // Bakes and stamps

  /**
   * The bake of `content` over the board region `region`, in `group`: settled, the one painted
   * at this view or a new one (letting go of the group's others, which are stale); while the
   * view moves, the latest held one of the same content, or a new one at the view as it is.
   * `paint` gets the bake's context in the board's frame and the board box the bake covers.
   */
  private bake(f: Frame, group: string, content: string, region: Box, paint: (c: CanvasRenderingContext2D, area: Box) => void): Bake {
    // The cache's keys are one namespace: each names its group.
    const prefix = `${group}|${content}#`
    const key = prefix + viewKey(f.V0)
    const held = this.cache.find(key)
    if (held !== null) return { canvas: held, frame: this.frames.get(key)! }
    if (f.settled) this.dropGroup(group, (k) => k === key)
    else {
      const same = this.cache.keys(group).filter((k) => k.startsWith(prefix))
      if (same.length > 0) {
        const latest = same[same.length - 1]!
        return { canvas: this.cache.find(latest)!, frame: this.frames.get(latest)! }
      }
    }
    const r = mapped(f.V0, region)
    const x0 = Math.floor(r.x0)
    const y0 = Math.floor(r.y0)
    const frame: Matrix = [f.V0[0], f.V0[1], f.V0[2], f.V0[3], f.V0[4] - x0, f.V0[5] - y0]
    const w = Math.ceil(r.x1) - x0
    const h = Math.ceil(r.y1) - y0
    const a = mapped(invert(frame), { x: 0, y: 0, w, h })
    const canvas = this.cache.get(key, group, w, h, (c) => {
      c.setTransform(...frame)
      paint(c, { x: a.x0, y: a.y0, w: a.x1 - a.x0, h: a.y1 - a.y0 })
    })
    this.frames.set(key, frame)
    return { canvas, frame }
  }

  /** Lets go of every canvas of `group` that `keep` turns down, and of their transforms. */
  private dropGroup(group: string, keep: (key: string) => boolean): void {
    for (const key of this.cache.keys(group)) if (!keep(key)) this.frames.delete(key)
    this.cache.drop(group, keep)
  }

  /** A bake drawn through the frame's board transform at `alpha`: a whole number of pixels from where it was painted draws it exactly. */
  private drawBake(f: Frame, b: Bake, alpha: number): void {
    const ctx = this.ctx
    const m = mul(f.V, invert(b.frame))
    ctx.globalAlpha = alpha
    if (Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(b.canvas, snap(m[4]), snap(m[5]))
    } else {
      ctx.setTransform(...m)
      ctx.drawImage(b.canvas, 0, 0)
    }
    ctx.globalAlpha = 1
  }

  /**
   * A stamp of `name`, the picture `paint` draws over `box` (cells in its own upright frame),
   * at the frame's cell size: the one held, or a new one; settled, the stamps of other sizes
   * go; while the view moves, any held one of the name draws scaled.
   */
  private stamp(f: Frame, group: string, name: string, box: Box, paint: (c: CanvasRenderingContext2D) => void): Stamp {
    const prefix = `${group}|${name}#`
    const size = f.k.toFixed(3)
    let key = prefix + size
    let canvas = this.cache.find(key)
    if (canvas === null && !f.settled) {
      const same = this.cache.keys(group).filter((x) => x.startsWith(prefix))
      if (same.length > 0) {
        key = same[same.length - 1]!
        canvas = this.cache.find(key)!
      }
    }
    if (canvas === null) {
      if (f.settled) this.cache.drop(group, (x) => x.endsWith(`#${size}`))
      const k = f.k
      canvas = this.cache.get(key, group, box.w * k, box.h * k, (c) => {
        const was = [pen.shadowX, pen.shadowY] as const
        c.setTransform(k, 0, 0, k, -box.x * k, -box.y * k)
        this.upright()
        paint(c)
        pen.shadowX = was[0]
        pen.shadowY = was[1]
      })
    }
    const kk = Number(key.slice(prefix.length))
    return { canvas, box: { x: box.x, y: box.y, w: canvas.width / kk, h: canvas.height / kk } }
  }

  /** A stamped kind's still body at this size, for its BuildingPic: on the board with its sticker shadow, held up (a ghost, the peel's) without, which it casts long and soft itself. */
  private bodyStamp(f: Frame, kind: Stamped, shadow: boolean): HTMLCanvasElement {
    const name = shadow ? `${kind}:shadow` : kind
    let canvas = f.bodies.get(name)
    if (canvas === undefined) f.bodies.set(name, (canvas = this.stamp(f, 'bodies', name, bodyBox(kind, shadow), (c) => drawBody(c, kind, shadow)).canvas))
    return canvas
  }

  /**
   * A thing's still picture at the frame's cell size: `size` cells across, `lift` off the
   * table, painted at `alpha` (its layers composited as they would be on the board) with the
   * pen's sticker shadow at (sx, sy) SHADOW_STEPs in its own frame (down-right upright, turned
   * and squashed with a picture that is): one stamp a kind, size, lift, alpha and shadow.
   */
  private thingStamp(f: Frame, thing: Thing, size: number, lift: number, alpha: number, sx: number, sy: number): Stamp {
    const reach = size / 2 + 0.02
    const dx = sx * SHADOW_STEP * (1 + lift * 2.5)
    const dy = sy * SHADOW_STEP * (1 + lift * 2.5)
    const box = { x: -reach + Math.min(0, dx), y: -reach + Math.min(0, dy), w: 2 * reach + Math.abs(dx), h: 2 * reach + Math.abs(dy) }
    return this.stamp(f, 'things', `${thing}:${size.toFixed(3)}:${lift}:${alpha}:${sx},${sy}`, box, (c) => {
      pen.shadowX = sx * SHADOW_STEP
      pen.shadowY = sy * SHADOW_STEP
      c.globalAlpha = alpha
      drawLiftedThing(c, thing, size, 0, 0, lift)
      c.globalAlpha = 1
    })
  }

  /**
   * things.ts `stamps.draw` while a frame is drawn: a still thing (a roof stack's, a heap's,
   * the basket's, a bowl's bars, what Beep carries or a muncher's cheeks hold, the faint ones
   * in a mouth or a rocket part) drawn from its stamp where that comes out as its paths would:
   * on the board's canvas at the frame's own scale, under the picture's own transform with its
   * shadow as the pen has it there (to a SHADOW_STEP). A see-through one is painted into its
   * stamp at its alpha and the stamp drawn whole, which composites the same as its layers
   * drawn one by one. Anywhere else (another scale, a bake) it is drawn from its paths.
   */
  private still = (ctx: CanvasRenderingContext2D, thing: Thing, size: number): boolean => {
    const f = this.drawing
    if (f === null || ctx !== this.ctx || pen.ppm !== f.view.cell) return false
    const alpha = ctx.globalAlpha
    const st = this.thingStamp(f, thing, size, 0, alpha, Math.round(pen.shadowX / SHADOW_STEP), Math.round(pen.shadowY / SHADOW_STEP))
    ctx.globalAlpha = 1
    ctx.drawImage(st.canvas, st.box.x, st.box.y, st.box.w, st.box.h)
    ctx.globalAlpha = alpha
    return true
  }

  /** A thing off the belts at device point (X, Y), from its paths: flying, bouncing as the hint, its shadow `lift` long, fizzing on its own `seed`. */
  private flying(f: Frame, thing: Thing, X: number, Y: number, size: number, lift: number, seed: number): void {
    this.ctx.setTransform(f.k, 0, 0, f.k, X, Y)
    this.upright()
    drawLiftedThing(this.ctx, thing, size, f.t, seed, lift)
  }

  // -------------------------------------------------------------------------------------
  // What the picture remembers

  /** The frame's events, for what the picture shows over time with no stamp in the state: taps on the print, Moony and burrows, a stroke's order, cells rolled up, a nibbler's bites. */
  private remember(s: State, t: number, events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'dig':
        case 'full':
          this.pokes.set(e.cell, t)
          break
        case 'poke': {
          if (e.what === 'tree' || e.what === 'flowers') this.pokes.set(cellOf(Math.floor(e.x), Math.floor(e.y)), t)
          if (e.what === 'moony') this.moonyPoke = t
          // A burrow's poke names its point: the nearest mound's.
          if (e.what === 'burrow') this.burrowPokes[nearestBurrow(e.x, e.y)] = t
          break
        }
        case 'lay':
          e.cells.forEach((c, i) => this.layOrder.set(c, i))
          break
        case 'rollUp':
          // Each cell's curl begins LAY_GAP after the one before, a peeled-up one going on from where it was; a cell this picture never saw with a belt (laid and rolled up between two frames) has nothing to curl.
          e.cells.forEach((c, i) => {
            const pic = this.lastPics.get(c)
            if (pic !== undefined) this.curls.push({ pic, at: t + i * LAY_GAP, from: this.lastPeeled.has(c) ? PEELED : 0 })
          })
          break
        case 'nibble':
          this.bites.set(e.cell, 0)
          break
        case 'crunch':
          this.bites.set(e.cell, Math.min(3, (this.bites.get(e.cell) ?? 0) + 1))
          break
        default:
          break
      }
    }
    for (const [c, at] of this.pokes) if (t - at > CELL_LIVE) this.pokes.delete(c)
    this.curls = this.curls.filter((cu) => t - cu.at + cu.from < CURL)
    for (const c of this.bites.keys()) if (s.hedge[c] !== 1) this.bites.delete(c)
  }

  /** Forgets what the picture remembered of the game before: a new one has begun. */
  private forget(): void {
    this.pokes.clear()
    this.moonyPoke = -Infinity
    this.burrowPokes = [-Infinity, -Infinity, -Infinity]
    this.layOrder.clear()
    this.lastPics.clear()
    this.lastPeeled.clear()
    this.curls = []
    this.merges.clear()
    this.hopSeen = -1
    this.bites.clear()
    this.stroke = { at: -1, seen: [] }
    this.planned = null
    this.gridOff = -Infinity
    this.gridWas = false
    this.paws.clear()
    this.seedHop = -1
    this.effects.clear()
  }

  /** The drag's plan (dragPlan), planned again only when the drag changes. */
  private planOf(s: State, t: number): DragPlan | null {
    if (s.drag === null) return null
    if (this.planned === null || this.planned.drag !== s.drag) this.planned = { drag: s.drag, plan: dragPlan(s, s.drag, t) }
    return this.planned.plan
  }

  /** How far the grid has faded in: in over GRID_FADE once a stroke, a hedge line or a ghost is held, out over it once the drag ends. */
  private gridAlpha(s: State, t: number): number {
    const d = s.drag
    const on = d !== null && d.kind !== 'peel'
    if (this.gridWas && !on) this.gridOff = t
    this.gridWas = on
    return on ? smooth(0, GRID_FADE, age(d.at, t)) : 1 - smooth(0, GRID_FADE, t - this.gridOff)
  }

  /**
   * The belt cells drawn live over the layout's bake: each stroke's cells popping in, LAY_GAP
   * apart in the order she drew them, until the stroke's last one has landed (POP after its
   * turn; the stroke's cells share their laidAt, and a stroke whose 'lay' this picture never
   * saw pops in all at once), and the cells a peel drag or the peel's first tap has lifted.
   */
  private liveCells(f: Frame): void {
    const { s, t } = f
    const strokes = new Map<number, number[]>()
    for (const [c] of f.pics) {
      const at = s.belts.laidAt[c]!
      if (at < 0 || since(at, t) > POP + STROKE_MAX * LAY_GAP) continue
      const cells = strokes.get(at) ?? []
      cells.push(c)
      strokes.set(at, cells)
    }
    for (const [at, cells] of strokes) {
      const order = cells.map((c) => this.layOrder.get(c) ?? 0)
      const last = Math.max(...order)
      if (age(at, t) >= POP + last * LAY_GAP) continue
      cells.forEach((c, i) => f.live.set(c, age(at, t) - order[i]! * LAY_GAP))
    }
    const peeled = f.plan?.kind === 'peel' ? f.plan.cells : s.lifted?.kind === 'run' ? s.lifted.cells : []
    for (const c of peeled) if (f.pics.has(c)) f.live.set(c, NaN)
  }

  /** On a new hop: each thing's fizz seed follows it to the slot it hopped to, and a thing that came onto the belts (or every thing, on the picture's first look) gets a new one. */
  private carrySeeds(s: State): void {
    const hop = Math.floor(s.tick / HOP)
    if (hop === this.seedHop) return
    const fresh = this.seedHop < 0
    this.seedHop = hop
    const was = this.seeds.slice()
    const { slot, from } = s.belts
    for (let x = 0; x < SLOTS; x++) if (slot[x]! >= 0) this.seeds[x] = !fresh && from[x]! >= 0 ? was[from[x]!]! : this.nextSeed++
  }

  /** On a new hop: each join whose side feeder moved a thing into it gets one more tooth closed on its zip. */
  private countMerges(s: State): void {
    const hop = Math.floor(s.tick / HOP)
    if (hop === this.hopSeen) return
    this.hopSeen = hop
    const { from, out, over } = s.belts
    for (let c = 0; c < CELLS; c++) {
      if (out[c]! < 0) continue
      for (const d of [0, 1, 2, 3] as const) {
        const n = stepCell(c, d)
        if (n < 0 || (out[n] !== opposite(d) && over[n] !== opposite(d))) continue
        if (from[outSlot(c)] === outSlot(n) || from[outSlot(c)] === overOut(n)) this.merges.set(c * 4 + d, (this.merges.get(c * 4 + d) ?? 0) + 1)
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // The land

  /**
   * The print (baked, or live while the table turns, so its trees and rocks stay upright all
   * the way round), the grid cross-fading over it, the flaps' corner wiggling for her tap, and
   * the print's cells live again after a tap or a dig.
   */
  private land(f: Frame): void {
    const { s, t } = f
    const ctx = this.ctx
    const next = LANDS[s.land === 3 ? 3 : ((s.land + 1) as 2 | 3)]
    const region: Box = { x: next.x0 - 0.3, y: next.y0 - 0.3, w: next.x1 + 1 - next.x0 + 0.6, h: next.y1 + 1 - next.y0 + 0.6 }
    const turning = f.view.turn !== 0 && f.view.turn !== 1
    for (const grid of f.grid >= 1 ? [true] : f.grid > 0 ? [false, true] : [false]) {
      const alpha = grid && f.grid < 1 ? f.grid : 1
      if (turning) {
        this.board(f)
        ctx.globalAlpha = alpha
        const a = mapped(invert(f.V), { x: 0, y: 0, w: this.width, h: this.height })
        drawPrint(ctx, s.land, grid, { x: a.x0, y: a.y0, w: a.x1 - a.x0, h: a.y1 - a.y0 }, f.turn)
        ctx.globalAlpha = 1
        continue
      }
      const b = this.bake(f, grid ? 'grid' : 'print', `${s.land}`, region, (c, area) => {
        pen.shadowX = f.shadow[0]
        pen.shadowY = f.shadow[1]
        drawPrint(c, s.land, grid, area, f.turn)
      })
      this.drawBake(f, b, alpha)
    }
    this.board(f)
    if (s.flap !== 0 && s.land !== 3) {
      if (s.hint?.step.kind === 'flap') {
        // The one next step's ring under the corner that wiggles for her tap, as under every other next step.
        const p = flapCorner(s.land)
        this.upright()
        this.at(f, p.x + FLAP_RING, p.y + FLAP_RING, 0)
        drawHintRing(ctx, RING.flap, t)
        this.board(f)
      }
      drawFlapCorner(ctx, s.land, flapWiggle(t))
    }
    for (const [c, at] of this.pokes) if (cellInLand(s.land, c)) drawCellPrint(ctx, s.land, f.grid >= 0.5, c, t - at, f.turn)
  }

  // -------------------------------------------------------------------------------------
  // The belts and what rides them

  /** The hedges as their pictures: every hedge with its links and bites, or the stumps with their sprouts. */
  private hedges(s: State, t: number, stumps: boolean): HedgePic[] {
    const out: HedgePic[] = []
    for (let c = 0; c < CELLS; c++) {
      const h = s.hedge[c]!
      if (h === 0 || (h === 2) !== stumps) continue
      out.push({ cell: c, stump: h === 2, links: h === 1 ? hedgeLinks(s.hedge, c) : 0, bites: this.bites.get(c) ?? 0, sprout: h === 2 ? clamp01(age(s.stumpAt[c]!, t) / (REGROW * STEP)) : 0 })
    }
    return out
  }

  /** The layout's bake (belts but the live cells, hedges, the buildings' tabs), then the live cells: popping in, curling away, peeled up, and the stumps. */
  private belts(f: Frame): void {
    const { s, t } = f
    const ctx = this.ctx
    const baked = [...f.pics.values()].filter((p) => !f.live.has(p.cell))
    const hedges = this.hedges(s, t, false)
    const tabs = s.buildings.filter((b) => b.kind !== 'tower' && b.kind !== 'bowl').map((b) => ({ b, ...tabsOf(s, b) }))
    // The layout's name: everything it shows.
    let sig = `${baked.map((p) => `${p.cell}:${p.in}${p.out}${p.fork}${p.over}${p.joins.join('')}${p.pattern}${+p.start}${+p.end}`).join(',')}|${hedges.map((h) => `${h.cell}:${h.links}:${h.bites}`).join(',')}|`
    for (const { b, mouths, spouts } of tabs) sig += `${b.kind}@${b.x},${b.y}:${mouths.map((m) => m.side * 9 + m.at).join('.')}/${spouts.map((m) => m.side * 9 + m.at).join('.')};`
    const land = LANDS[s.land]
    const region: Box = { x: land.x0 - 0.4, y: land.y0 - 0.4, w: land.x1 + 1 - land.x0 + 0.8, h: land.y1 + 1 - land.y0 + 0.8 }
    const b = this.bake(f, 'layout', hash(sig), region, (c) => {
      pen.shadowX = f.shadow[0]
      pen.shadowY = f.shadow[1]
      drawBelts(c, baked)
      drawHedges(c, hedges)
      for (const tab of tabs) {
        c.save()
        c.translate(tab.b.x, tab.b.y)
        drawTabs(c, tab.b.kind, tab.mouths, tab.spouts)
        c.restore()
      }
    })
    this.drawBake(f, b, 1)
    this.board(f)
    for (const [c, a] of f.live) {
      const pic = f.pics.get(c)!
      if (Number.isNaN(a)) drawBeltCurl(ctx, pic, PEELED)
      else if (a >= 0) drawBeltPop(ctx, pic, a)
    }
    for (const cu of this.curls) if (t >= cu.at) drawBeltCurl(ctx, cu.pic, t - cu.at + cu.from)
    drawHedges(ctx, this.hedges(s, t, true))
    drawBeltMarks(ctx, this.marks(f, false))
  }

  /**
   * The belts' moving marks: each cell's hops (belts.moved), gliding on through the hop now
   * while the cell moved at the last one (none of its things stood still and no muncher sits
   * on it), so marks and things glide together and a jam stands still. `bridges` keeps the
   * bridge cells only, for drawBridges. A cell still popping in shows its marks once it has
   * nearly landed; a peeled one none.
   */
  private marks(f: Frame, bridges: boolean): BeltMarks[] {
    const { s, t } = f
    const { from, moved } = s.belts
    const u = hopProgress(s.tick, t)
    const sitting = new Set(s.munchers.filter((m) => m.mode === 'sit').map((m) => m.cell))
    const out: BeltMarks[] = []
    for (const [c, pic] of f.pics) {
      if (bridges && pic.over === -1) continue
      const a = f.live.get(c)
      if (a !== undefined && !(a >= POP * 0.6)) continue
      const glides = !sitting.has(c) && [inSlot(c), outSlot(c), overIn(c), overOut(c)].every((x) => from[x] !== x)
      out.push({ pic, hops: moved[c]! - (glides ? 1 - u : 0) })
    }
    return out
  }

  /**
   * The things on the main lanes (or with `over`, on the bridges' over lanes, bigger and
   * lifted) at where.ts's points, the bouncing one raised over its ring. Below LIVE_PX on
   * screen a riding thing's picture never moves, so one stamp a kind (looked up once a frame)
   * draws it; bigger it is drawn from its paths, its fizz moving.
   */
  private things(f: Frame, over: boolean): void {
    const { s, t } = f
    const ctx = this.ctx
    const slots = s.belts.slot
    const size = over ? ON_BELT * BRIDGE_SIZE : ON_BELT
    const lift = over ? BRIDGE_LIFT : 0
    const live = size * f.view.cell >= LIVE_PX
    const stamps: (Stamp | null)[] = THINGS.map(() => null)
    const upright = SHADOW / SHADOW_STEP
    for (let x = over ? OVER : 0; x < (over ? SLOTS : OVER); x++) {
      const k = slots[x]!
      if (k < 0) continue
      const p = thingPoint(s, x, t)
      const [X, Y] = apply(f.V, p.x, p.y)
      if (f.bounce?.kind === 'slot' && f.bounce.slot === x) {
        ctx.setTransform(f.k, 0, 0, f.k, X, Y)
        this.upright()
        drawHintRing(ctx, RING.thing, t)
        this.flying(f, THINGS[k]!, X, Y - hintLift(t) * f.k, size, Math.max(lift, hintLift(t)), this.seeds[x]!)
      } else if (live) this.flying(f, THINGS[k]!, X, Y, size, lift, this.seeds[x]!)
      else {
        const st = (stamps[k] ??= this.thingStamp(f, THINGS[k]!, size, lift, 1, upright, upright))
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(st.canvas, X + st.box.x * f.k, Y + st.box.y * f.k, st.box.w * f.k, st.box.h * f.k)
      }
    }
  }

  /** The forks' paddles (pointing the way the thing leaving at the last hop went, flipping late in the hop to the way the next one goes) and the joins' zips (a tooth closed per merge). */
  private mechanisms(f: Frame): void {
    const { s } = f
    const { from, forkTurn } = s.belts
    const u = hopProgress(s.tick, f.t)
    /** Whether a thing hopped from slot x into one of cell c's slots at the last hop. */
    const into = (x: number, c: number) => c >= 0 && [inSlot(c), outSlot(c), overIn(c)].some((y) => from[y] === x)
    for (const [c, pic] of f.pics) {
      if (f.live.has(c)) continue
      if (pic.fork !== -1) {
        const next = forkTurn[c]!
        const went = into(outSlot(c), stepCell(c, pic.fork)) ? 1 : into(outSlot(c), stepCell(c, pic.out)) ? 0 : next
        drawPaddle(this.ctx, pic, went + (next - went) * smooth(0.45, 1, u))
      }
      for (const d of pic.joins) drawZip(this.ctx, pic, d, this.merges.get(c * 4 + d) ?? 0)
    }
  }

  // -------------------------------------------------------------------------------------
  // The burrows, heaps and the basket

  private burrows(f: Frame): void {
    const { s, t } = f
    const ctx = this.ctx
    BURROWS.forEach((site, i) => {
      if (site.land > s.land) return
      const b = s.burrows[i]!
      const paws = age(b.pawsAt, t)
      if (paws < PAWS_FOR * STEP) {
        let memo = this.paws.get(i)
        if (memo === undefined || memo.at !== b.pawsAt) {
          memo = { at: b.pawsAt, cells: pawsOf(s, i) }
          this.paws.set(i, memo)
        }
        this.board(f)
        drawPaws(ctx, memo.cells, paws)
      }
    })
    this.upright()
    BURROWS.forEach((site, i) => {
      if (site.land > s.land) return
      const b = s.burrows[i]!
      this.footprint(f, site.x, site.y, 2, 0)
      drawBurrow(ctx, { burrow: i, hunger: b.hunger, warnAge: since(b.warnAt, t), out: s.munchers.some((m) => m.burrow === i), friend: b.friend, pokeAge: t - this.burrowPokes[i]!, helloAge: since(b.helloAt, t) }, t)
    })
    BURROWS.forEach((site, i) => {
      if (site.land > s.land) return
      const p = heapPoint(i)
      const bounce = f.bounce?.kind === 'heap' && f.bounce.burrow === i
      if (bounce) {
        this.at(f, p.x, p.y, 0)
        drawHintRing(ctx, RING.heap, t)
      }
      this.at(f, p.x, p.y, bounce ? hintLift(t) : 0)
      drawHeap(ctx, s.burrows[i]!.heap, t)
    })
    const bounce = f.bounce?.kind === 'basket'
    if (bounce) {
      this.at(f, basketPoint.x, basketPoint.y, 0)
      drawHintRing(ctx, RING.basket, t)
    }
    this.at(f, basketPoint.x, basketPoint.y, bounce ? hintLift(t) : 0)
    drawBasket(ctx, s.basket)
  }

  // -------------------------------------------------------------------------------------
  // The buildings and the rocket

  /** One building as its picture shows it now. */
  private buildingPic(f: Frame, b: Building): BuildingPic {
    const { s, t } = f
    const kind = b.kind
    const mode: Mode = kind === 'pad' ? (padDrums(s) ? 'working' : 'waiting') : working(b) ? 'working' : b.stack.length >= STACK || b.napper !== -1 || b.tucked ? 'stopped' : 'waiting'
    const night = s.night === null ? 'none' : b.tucked ? 'tucked' : s.night.kind === kind ? 'cap' : 'none'
    const hold = s.lifted?.kind === 'building' && s.lifted.id === b.id ? 'peel' : 'board'
    const tapped = age(b.tapAt, t) < RECIPE_FOR
    const need = kind === 'lab' ? labNeed(s) : ([0, 0] as const)
    const got = s.lab.got[0] + s.lab.got[1]
    return {
      kind,
      id: b.id,
      mode,
      beat: kind === 'tower' || kind === 'bowl' ? 0 : beatOf(f, kind),
      wants: mode === 'waiting' ? wantsOf(s, b, need) : [],
      stack: b.stack,
      recipe: tapped ? recipeOf(kind, variesOf(s, b, need)) : { takes: [], makes: null },
      placedAge: since(b.placedAt, t),
      pushAge: since(b.pushAt, t),
      gulpAge: since(b.gulpAt, t),
      tapAge: since(b.tapAt, t),
      shotAge: since(b.shotAt, t),
      // Once Fuel! is found the lab drinks for no card (machines.ts): its whole dome of stars stays lit, the newest twinkling on its chimes.
      progress: s.found.includes('fuel') ? 1 : got + need[0] + need[1] > 0 ? got / (got + need[0] + need[1]) : 0,
      found: kind === 'lab' && s.card !== null && card(s.card.id).needs.kind === 'bottles' && since(s.card.at, t) < CELEBRATE ? { card: s.card.id, age: age(s.card.at, t) } : null,
      ammo: b.ammo,
      stars: b.stars,
      bars: b.held[thingIndex('goldBar')]!,
      picnic: kind === 'bowl' && s.munchers.some((m) => m.mode === 'picnic' && m.burrow === FLOWER_OF[cellOf(b.x, b.y)]),
      night,
      hold,
      rise: bouncing(f, b) ? hintLift(t) : 0,
      stamp: (STAMPED as readonly Kind[]).includes(kind) ? this.bodyStamp(f, kind as Stamped, hold === 'board') : null,
    }
  }

  /** The buildings in screen order (their feet lowest last), each over its ring while it bounces, the rocket lying on its pad. Returns each picture's origin (device px), for the munchers that nap on them. */
  private buildings(f: Frame): Map<number, [number, number]> {
    const { s, t } = f
    const ctx = this.ctx
    const origins = new Map<number, [number, number]>()
    this.upright()
    const order = s.buildings.map((b) => ({ b, foot: apply(f.V, b.x + SIZE[b.kind] / 2, b.y + SIZE[b.kind] / 2)[1] + (SIZE[b.kind] / 2) * f.k })).sort((a, c) => a.foot - c.foot)
    for (const { b } of order) {
      const pic = this.buildingPic(f, b)
      const n = SIZE[b.kind]
      if (bouncing(f, b)) {
        const [X, Y] = apply(f.V, b.x + n / 2, b.y + n / 2)
        ctx.setTransform(f.k, 0, 0, f.k, X, Y)
        drawHintRing(ctx, RING.building * n, t)
      }
      origins.set(b.id, this.footprint(f, b.x, b.y, n, pic.rise))
      drawBuilding(ctx, pic, t)
      if (b.kind === 'pad' && s.launch === null) drawRocket(ctx, rocketPic(s, t), t)
    }
    return origins
  }

  // -------------------------------------------------------------------------------------
  // The munchers, Moony and Beep

  private characters(f: Frame, origins: Map<number, [number, number]>): void {
    const { s, t } = f
    const ctx = this.ctx
    this.upright()
    const feet = s.munchers.map((m) => ({ m, at: this.muncherAt(f, m, origins) })).sort((a, b) => a.at[1] - b.at[1])
    for (const { m, at } of feet) {
      const up = f.bounce?.kind === 'muncher' && f.bounce.id === m.id ? hintLift(t) : 0
      ctx.setTransform(f.k, 0, 0, f.k, at[0], at[1])
      if (f.bounce?.kind === 'muncher' && f.bounce.id === m.id) drawHintRing(ctx, RING.muncher, t)
      ctx.setTransform(f.k, 0, 0, f.k, at[0], at[1] - up * f.k)
      drawMuncher(ctx, muncherPicture(s, m, t), t)
    }
    if (s.launches > 0 && s.launch === null) {
      this.at(f, moonyPoint.x, moonyPoint.y, 0)
      scaled(ctx, MOONY_HOME, () => drawMoony(ctx, t, t - this.moonyPoke))
    }
    if (s.launch !== null && beepAway(age(s.launch.at, t))) return
    const p = beepPoint(s.beep, t)
    this.at(f, p.x, p.y, 0)
    drawBeep(ctx, beepPicture(s.beep, t), t)
  }

  /** Where a muncher's feet are drawn (device px): layout.ts muncherDrawn (out of the door its burrow's picture shows), or curled up on the roof of the building it naps on. */
  private muncherAt(f: Frame, m: Muncher, origins: Map<number, [number, number]>): [number, number] {
    if (m.mode !== 'nap') {
      const p = muncherDrawn(m, f.t, f.view.turn)
      return apply(f.V, p.x, p.y)
    }
    const b = f.s.buildings.find((x) => x.napper === m.id)
    if (b === undefined) throw new Error(`muncher ${m.id} naps on no building`)
    const o = origins.get(b.id)!
    const spot = napSpot(b)
    return [o[0] + spot.x * f.k, o[1] + spot.y * f.k]
  }

  /** What flies: each thing on its arc, a little bigger than on a belt and lifted, its shadow longer the higher it goes. */
  private flights(f: Frame): void {
    const { s, t } = f
    for (const fl of s.flights) {
      if (since(fl.at, t) < 0) continue
      const p = flightPoint(fl, t)
      if (p.done) continue
      const [X, Y] = apply(f.V, p.x, p.y)
      this.flying(f, fl.thing, X, Y - p.lift * f.k, ON_BELT * BRIDGE_SIZE, clamp01(0.3 + p.lift / Math.max(fl.arc, 0.5)), fl.at + Math.round(31 * fl.x0 + 17 * fl.y0))
    }
  }

  // -------------------------------------------------------------------------------------
  // The one next step, the finger's drag and the hover

  /**
   * The hint's dotted path (a link shown in full, a peel's way through, the belt a tower or a
   * bowl of the defence needs, a hedge line to draw), the dotted path the hint's hand leaves
   * behind it as it traces a path not shown in full (a link she has drawn often), a thing's
   * picture bouncing over its cell (a link's, a dig's, a tower's or a bowl's belt's), and the
   * hint's sticker ghost on its spot. A tower's belt stays shown, as a link does for her first
   * belts of a kind: a long belt with turns and bridges is more than a five-year-old keeps in
   * mind from the hand's one trace.
   */
  private hint(f: Frame): void {
    const { s, t } = f
    const ctx = this.ctx
    const step = s.hint?.step
    if (step === undefined) return
    const path = step.kind === 'link' ? (step.full ? step.path : []) : step.kind === 'free' || (step.kind === 'defend' && step.sticker !== 'hedge') ? step.cells : []
    const shown = path.length > 0
    if (shown) {
      this.board(f)
      drawHintPath(ctx, path, t, 1)
    }
    const trail = shown || (step.kind === 'defend' && step.sticker === 'hedge') ? null : handTrail(s, t)
    if (trail !== null) {
      this.board(f)
      ctx.globalAlpha = trail.alpha
      drawHintPath(ctx, trail.cells, t, trail.reach)
      ctx.globalAlpha = 1
    }
    if (step.kind === 'defend' && step.sticker === 'hedge') {
      this.board(f)
      ctx.globalAlpha = GHOST_ALPHA
      drawHedges(ctx, hedgeLine(s, step.cells))
      ctx.globalAlpha = 1
    }
    if (f.bounce?.kind === 'picture') {
      const b = f.bounce
      this.upright()
      const [X, Y] = this.at(f, xOf(b.cell) + 0.5, yOf(b.cell) + 0.5, 0)
      drawHintRing(ctx, RING.thing, t)
      this.flying(f, b.thing, X, Y - hintLift(t) * f.k, ON_BELT * BRIDGE_SIZE, hintLift(t), b.cell)
    }
    const ghost = hintGhost(s, t)
    if (ghost !== null) {
      const n = SIZE[ghost.sticker]
      this.board(f)
      ctx.save()
      ctx.translate(ghost.x, ghost.y)
      drawFootprint(ctx, ghost.sticker, true)
      ctx.restore()
      this.upright()
      const [X, Y] = apply(f.V, ghost.x + n / 2, ghost.y + n / 2)
      ctx.setTransform(f.k, 0, 0, f.k, X, Y)
      drawHintRing(ctx, RING.building * n, t)
      this.footprint(f, ghost.x, ghost.y, n, hintLift(t))
      drawBuilding(ctx, this.ghostPic(f, ghost.sticker, true), t)
    }
  }

  /** A sticker held up as its ghost: the real sticker, see-through if it fits, grey if not. */
  private ghostPic(f: Frame, sticker: Placeable, ok: boolean): BuildingPic {
    const stamped = (STAMPED as readonly Kind[]).includes(sticker) && ok
    return { ...restingPic(sticker), hold: ok ? 'ghost' : 'grey', stamp: stamped ? this.bodyStamp(f, sticker as Stamped, false) : null }
  }

  /**
   * The finger's drag (dragPlan): the stroke's see-through cells popping down as the finger
   * reaches them, with the sign of what lifting will do floating over the finger on a thin
   * stem; a held sticker's footprint at its snapped cells with its picture over it (held above
   * the fingertip, so the finger never covers it); a hedge line see-through. A peel drag's belts
   * are drawn peeled up with the live cells.
   */
  private drag(f: Frame, finger: { x: number; y: number; touch: boolean } | null): void {
    const { s, t, view } = f
    const ctx = this.ctx
    const d = s.drag
    const plan = f.plan
    if (d === null || plan === null || plan.kind === 'peel') return
    if (plan.kind === 'hedge') {
      this.board(f)
      ctx.globalAlpha = GHOST_ALPHA
      drawHedges(ctx, hedgeLine(s, plan.cells))
      ctx.globalAlpha = 1
      return
    }
    if (plan.kind === 'stroke') {
      // The end sign floats over a finger (her hand covers what is under it; the finger is the pen), up and to the side of a mouse pointer, or over the drag's end with neither.
      const lift = fingerLift(view)
      // A cell pops down as the finger reaches it; the cells a drag already had when this picture first saw it popped from the drag's start.
      if (this.stroke.at !== d.at) this.stroke = { at: d.at, seen: plan.cells.map(() => Math.min(t, d.at * STEP)) }
      plan.cells.forEach((_, i) => (this.stroke.seen[i] ??= t))
      const cells: GhostCell[] = plan.cells.map((g, i) => ({ ...g, age: t - this.stroke.seen[i]! }))
      this.board(f)
      if (cells.length > 0) drawStrokeGhost(ctx, cells, t)
      if (plan.sign === null) return
      const size = Math.max(SIGN_PX, SIGN_CELLS * view.cell)
      const [ex, ey] = apply(f.V, xOf(plan.end) + 0.5, yOf(plan.end) + 0.5)
      const at = finger === null ? { x: ex / view.dpr, y: ey / view.dpr - lift - size / 2 } : finger.touch ? { x: finger.x, y: finger.y - lift - size / 2 } : { x: finger.x + POINTER_OFF * size, y: finger.y - POINTER_OFF * size }
      if (finger?.touch === true) this.stem(f, finger, finger.y - lift)
      this.upright()
      ctx.setTransform(f.k, 0, 0, f.k, at.x * view.dpr, at.y * view.dpr)
      drawEndSign(ctx, plan.sign, size / view.cell)
      return
    }
    // A held sticker is drawn over its own snapped footprint, so it lands where she sees it: a finger holds it by its bottom edge above the fingertip (layout.ts heldAt), the mouse at the pointer.
    const n = SIZE[plan.sticker]
    this.board(f)
    ctx.save()
    ctx.translate(plan.x, plan.y)
    drawFootprint(ctx, plan.sticker, plan.ok)
    ctx.restore()
    this.upright()
    this.footprint(f, plan.x, plan.y, n, 0)
    drawBuilding(ctx, this.ghostPic(f, plan.sticker, plan.ok), t)
  }

  /** The thin stem from the finger up to what floats over it, CSS px. */
  private stem(f: Frame, finger: { x: number; y: number }, top: number): void {
    const ctx = this.ctx
    ctx.setTransform(f.view.dpr, 0, 0, f.view.dpr, 0, 0)
    for (const [dx, w, colour] of [
      [1, STEM + 1.5, C.hintShadow],
      [0, STEM, C.hint],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(finger.x + dx, finger.y - 8 + dx)
      ctx.lineTo(finger.x + dx, top + dx)
      roundStroke(ctx, w, colour)
    }
  }

  /** The mouse's hover: an outline round what a click would take, where layout.ts finds it. */
  private hover(f: Frame, hover: Hit | null): void {
    if (hover === null) return
    const target = targets(f.s, f.view, f.t).find((x) => sameHit(x.hit, hover))
    // A hover names what was under the pointer when it last moved; what it named may have gone since.
    if (target === undefined) return
    const ctx = this.ctx
    ctx.setTransform(f.view.dpr, 0, 0, f.view.dpr, 0, (f.V[5] - f.V0[5]))
    for (const [w, colour] of [
      [HOVER_LINE + 2, C.hintShadow],
      [HOVER_LINE, C.hint],
    ] as const) {
      areaPath(ctx, target.area)
      roundStroke(ctx, w, colour)
    }
  }

  // -------------------------------------------------------------------------------------
  // Good night, the launch, ?debug

  /** Good night's dusk over everything, falling over DUSK, and a tiny warm light on each thing riding the belts. */
  private night(f: Frame): void {
    const { s, t } = f
    if (s.night === null) return
    const k = smooth(0, DUSK, age(s.night.at, t))
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = k
    ctx.fillStyle = NIGHT.dusk
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.setTransform(f.k, 0, 0, f.k, 0, 0)
    ctx.beginPath()
    for (let x = 0; x < SLOTS; x++) {
      if (s.belts.slot[x]! < 0) continue
      const p = thingPoint(s, x, t)
      const [X, Y] = apply(f.V, p.x, p.y)
      addCircle(ctx, X / f.k, Y / f.k - ON_BELT * 0.2, LIGHT)
    }
    fill(ctx, NIGHT.light)
    ctx.globalAlpha = 1
  }

  /**
   * The launch over the board as it slides down: the sky over the top it leaves, the rocket
   * from the pad to the moon, the countdown's numbers, Moony on the moon. The numbers stand
   * beside the pad on the side away from the munchers watching (upright they sit on its
   * right), else toward the screen's middle.
   */
  private launch(f: Frame): void {
    const { s, t, view } = f
    const [px, py] = apply(f.V0, PAD.x + 1.5, PAD.y + 1.5)
    const watchers = s.munchers.filter((m) => m.mode === 'watch')
    const wx = watchers.reduce((sum, m) => sum + apply(f.V0, xOf(m.cell) + 0.5, yOf(m.cell) + 0.5)[0], 0) / Math.max(1, watchers.length)
    const side = watchers.length > 0 && wx > px + f.k ? -1 : (watchers.length > 0 && wx < px - f.k) || px < (view.w * view.dpr) / 2 ? 1 : -1
    this.upright()
    this.ctx.setTransform(f.k, 0, 0, f.k, 0, 0)
    drawLaunch(this.ctx, { age: age(s.launch!.at, t), view: { x: 0, y: 0, w: view.w / view.cell, h: view.h / view.cell }, pad: { x: px / f.k - 1.5, y: py / f.k - 1.5 }, side, flags: s.launches, pop: s.popAt < s.launch!.at ? Infinity : age(s.popAt, t) }, t)
  }

  /** ?debug: every hit target where layout.ts finds it, every belt slot (filled while it holds a thing), each open burrow's hunger, and a line of numbers: the frame rate, the cell, the bakes and the particles. The one text drawn on the canvas. */
  private overlay(f: Frame): void {
    const { s, t, view } = f
    const ctx = this.ctx
    const dpr = view.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, f.V[5] - f.V0[5])
    ctx.lineWidth = 1
    ctx.strokeStyle = DEBUG.target
    for (const target of targets(s, view, t)) {
      areaPath(ctx, target.area)
      ctx.stroke()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (const held of [false, true]) {
      ctx.beginPath()
      for (const [c] of f.pics)
        for (const x of s.belts.over[c]! >= 0 ? [inSlot(c), outSlot(c), overIn(c), overOut(c)] : [inSlot(c), outSlot(c)]) {
          if (s.belts.slot[x]! >= 0 !== held) continue
          const p = slotPoint(s.belts, x)
          const [X, Y] = apply(f.V, p.x, p.y)
          addCircle(ctx, X, Y, SLOT_DOT * dpr)
        }
      fill(ctx, held ? DEBUG.held : DEBUG.slot)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = '600 12px ui-monospace, monospace'
    ctx.textBaseline = 'top'
    BURROWS.forEach((site, i) => {
      if (site.land > s.land) return
      const [X, Y] = apply(f.V, site.x + 1, site.y)
      const text = `${Math.round(s.burrows[i]!.hunger)}`
      ctx.fillStyle = DEBUG.panel
      ctx.fillRect(X / dpr - 16, Y / dpr - 18, 32, 16)
      ctx.fillStyle = DEBUG.text
      ctx.fillText(text, X / dpr - 13, Y / dpr - 16)
    })
    const text = `fps ${(1 / this.frameTime).toFixed(0)}  cell ${view.cell.toFixed(1)} px  dpr ${dpr.toFixed(2)}  bakes ${this.cache.count} held, ${(this.cache.pixels / 1e6).toFixed(2)}M px of ${(BUDGET / 1e6).toFixed(0)}M, ${this.cache.painted} painted  particles ${this.effects.alive}`
    ctx.font = '600 13px ui-monospace, monospace'
    ctx.fillStyle = DEBUG.panel
    ctx.fillRect(8, DEBUG_Y, ctx.measureText(text).width + 12, 21)
    ctx.fillStyle = DEBUG.text
    ctx.fillText(text, 14, DEBUG_Y + 4)
  }
}

// ---------------------------------------------------------------------------------------
// Reading pictures off the state

/** A short stable name for a text (FNV-1a): a bake's content in its key. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return `${(h >>> 0).toString(36)}.${text.length}`
}

/** Where kind's band part is in its note now, 0 to 1 over the eighth after the note (band.ts sinceNote), once a frame for each kind. */
function beatOf(f: Frame, kind: Exclude<Kind, 'tower' | 'bowl'>): number {
  let beat = f.beats.get(kind)
  if (beat === undefined) {
    beat = clamp01(sinceNote(f.band, PART_OF[kind], f.t, f.s.switches.music) / EIGHTH)
    f.beats.set(kind, beat)
  }
  return beat
}

/** Whether building b bounces now as the one next step (never the pad, which is fixed on the board: its launch button bounces). */
const bouncing = (f: Frame, b: Building) => b.kind !== 'pad' && f.bounce?.kind === 'building' && f.bounce.id === b.id

/**
 * What bounces as the one next step (plans/rocket-factory.md, The one next step): the step's
 * thing on the board, if it has one. s.hint is what the hint saw at its last look, up to
 * HINT_EVERY ago: a step naming what has gone since (a link's building peeled, a heap fetched,
 * an empty path) bounces nothing until the hint looks again. At Good night every machine of
 * the kind wears its nightcap and the one her tap goes to (the hint's) bounces.
 */
function bounceOf(s: State): Bounce | null {
  const step = s.hint?.step
  if (step === undefined) return null
  switch (step.kind) {
    case 'muncher':
      return { kind: 'muncher', id: step.id }
    case 'bottleneck':
      // With a sticker left, its ghost bounces (one more of the slowest machine); else the machine.
      return step.sticker === null ? { kind: 'building', id: step.id } : null
    case 'stack':
    case 'refill':
      return { kind: 'building', id: step.id }
    case 'unblock':
      return { kind: 'slot', slot: step.slot }
    case 'heap':
      return s.burrows[step.burrow]!.heap.some((n) => n > 0) ? { kind: 'heap', burrow: step.burrow } : null
    case 'basket':
      return { kind: 'basket' }
    case 'link':
      if (step.path.length === 0 || !s.buildings.some((b) => b.id === step.from) || !s.buildings.some((b) => b.id === step.to)) return null
      return { kind: 'picture', cell: step.path[Math.floor(step.path.length / 2)]!, thing: step.thing }
    case 'dig':
      return { kind: 'picture', cell: step.cell, thing: dugAt(step.cell) }
    case 'defend':
      // A tower's or a bowl's belt to draw: what will ride it bounces over its middle until the belt runs under the spot, when the sticker's ghost takes over.
      if (step.sticker === 'hedge' || step.cells.length === 0 || s.belts.out[cellOf(step.x, step.y)]! >= 0) return null
      return { kind: 'picture', cell: step.cells[Math.floor(step.cells.length / 2)]!, thing: step.sticker === 'tower' ? 'bubble' : 'goldBar' }
    case 'tuck': {
      const b = s.buildings.find((x) => x.kind === step.machine && !x.tucked)
      return b === undefined ? null : { kind: 'building', id: b.id }
    }
    case 'oops':
    case 'place':
    case 'free':
    case 'choose':
    case 'flap':
    case 'launch':
    case 'card':
    case 'rocket':
      return null
  }
}

/** A building's mouths and spouts as tabs on its footprint's edges: the side facing the belt and the cell along it. */
function tabsOf(s: State, b: Building): { mouths: Tab[]; spouts: Tab[] } {
  const tab = (slot: number, side: Dir): Tab => {
    const c = slotCell(slot)
    return { side, at: side === 0 || side === 2 ? yOf(c) - b.y : xOf(c) - b.x }
  }
  const { out, over, in: ins } = s.belts
  return {
    mouths: s.net.mouths.get(b.id)!.map((x) => tab(x, opposite((x >= OVER ? over : out)[slotCell(x)]! as Dir))),
    spouts: s.net.spouts.get(b.id)!.map((x) => tab(x, x >= OVER ? (over[slotCell(x)]! as Dir) : opposite(ins[slotCell(x)]! as Dir))),
  }
}

/** What a waiting machine wants, faint in its mouth: a maker the inputs its batch lacks, an oven the rock its belts bring (or either), the lab the bottles its card still needs. */
function wantsOf(s: State, b: Building, need: readonly [number, number]): Thing[] {
  switch (b.kind) {
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return (Object.entries(RECIPES[b.kind].takes) as [Thing, number][]).filter(([thing, n]) => b.held[thingIndex(thing)]! < n).map(([thing]) => thing)
    case 'oven': {
      if (b.queue.length > 0) return []
      const rocks = new Set<Thing>()
      for (const x of s.net.mouths.get(b.id)!)
        for (const y of [x, x - 1]) {
          const thing = THINGS[s.belts.slot[y]!]
          if (thing === 'blueRock' || thing === 'goldRock') rocks.add(thing)
        }
      return rocks.size > 0 ? [...rocks].slice(0, 2) : ['blueRock', 'goldRock']
    }
    case 'lab':
      return [...(need[0] > 0 ? (['greenBottle'] as const) : []), ...(need[1] > 0 ? (['orangeBottle'] as const) : [])]
    case 'pad':
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return []
  }
}

/** What a building's recipe bubble varies by (buildings.ts recipeOf): the digger's patch, the oven's rock (baking, next, or the one it wants), the lab's bottles, the rocket's open part. */
function variesOf(s: State, b: Building, need: readonly [number, number]): Thing[] {
  switch (b.kind) {
    case 'digger':
      return [rockOf(cellOf(b.x, b.y)) ?? rockOf(cellOf(b.x + 1, b.y + 1))!]
    case 'oven': {
      const baking = b.batch === null ? null : b.batch.makes === 'goldBar' ? 'goldRock' : 'blueRock'
      return [b.queue[0] ?? baking ?? wantsOf(s, b, need)[0]!]
    }
    case 'lab': {
      const bottles: Thing[] = [...(need[0] > 0 ? (['greenBottle'] as const) : []), ...(need[1] > 0 ? (['orangeBottle'] as const) : [])]
      // With no card to work on it still drinks every bottle.
      return bottles.length > 0 ? bottles : ['greenBottle', 'orangeBottle']
    }
    case 'pad': {
      const part = openParts(s)[0]
      return part === undefined ? [] : [PART_INFO[part].thing]
    }
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
    case 'pump':
    case 'tower':
    case 'bowl':
      return []
  }
}

/** The rocket on its pad: each part open (from the start or by its card) and how full. A landing empties it (rules.ts), and the same rocket waits there again, every part open, to fill and fly again. The launch button waits while a tap would launch it (rules.ts launchReady). */
function rocketPic(s: State, t: number): RocketPic {
  return {
    parts: PARTS.map((part, i) => {
      const info = PART_INFO[part]
      return { open: info.opens === null || s.found.includes(info.opens), fill: s.rocket.got[i]! / info.n, fullAge: since(s.rocket.fullAt[i]!, t) }
    }),
    ready: launchReady(s),
  }
}

/** The burrow whose mound's middle is nearest the board point (x, y). */
function nearestBurrow(x: number, y: number): number {
  const d = BURROWS.map((b) => (b.x + 1 - x) ** 2 + (b.y + 1 - y) ** 2)
  return d.indexOf(Math.min(...d))
}

/** A line of hedges for a picture: the cells as hedges, linked to each other and to the hedges beside them. */
function hedgeLine(s: State, cells: readonly number[]): HedgePic[] {
  const hedge = s.hedge.slice()
  for (const c of cells) hedge[c] = 1
  return cells.map((cell) => ({ cell, stump: false, links: hedgeLinks(hedge, cell), bites: 0, sprout: 0 }))
}

/** A tap area's outline as a fresh path, CSS px: a box with round corners, or a circle. */
function areaPath(ctx: CanvasRenderingContext2D, a: Area): void {
  ctx.beginPath()
  if (a.kind === 'box') addRoundRect(ctx, a.x, a.y, a.w, a.h, Math.min(10, a.w / 2, a.h / 2))
  else ctx.arc(a.x, a.y, a.r, 0, TAU)
}
