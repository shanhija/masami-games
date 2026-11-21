import { buildRect, insets, roadZoom, shownRect, toScreen, tweening, viewAt, type View } from '../game/camera'
import { HOUSE_GRID, RECIPES, SHAPE_SIZE } from '../game/catalog'
import { BED, placePoint, shown } from '../game/flights'
import { ITEMS } from '../game/items'
import {
  CELL,
  DRIVE_FROM,
  GARAGE_W,
  MIRROR_BUILDER_X,
  MIRROR_X,
  PLOT_W,
  PRESENT_FOR,
  PRESENT_POP,
  PRESENT_X,
  ROOF_H,
  STATION_W,
  TRUCK,
  TRUCK_TIP_X,
  boulderRect,
  doorRects,
  gridLeft,
  groundAt,
  heapRect,
  houseRect,
  interiorRect,
  liftRect,
  machineRect,
  machineSpot,
  occupancy,
  plotLeft,
  plotRect,
  presentOpenAt,
  rect,
  roofRect,
  roomRect,
  slotsOf,
  stackRect,
  stationLeft,
  targets,
  truckOnStreet,
  validSpots,
  visitPoint,
  type Rect,
} from '../game/layout'
import { CROSS_FOR, DASH, HAMMER, LOWER, MACHINES, SHOT_TWEEN, STEP, since, type Flight, type Good, type Hit, type PlacedRoom, type Place, type Plot, type RoadDef, type SimEvent, type State } from '../game/model'
import { BALLOON_AWAY, BALLOON_LEAD, BALLOON_NEAR, GEM_R, TRAIN_FOR } from '../game/road'
import { DUSK, same } from '../game/rules'
import { drawBuilder } from './builder'
import { BUDGET, Cache } from './cache'
import { BULLDOZE, CRATE_DROP, Effects, findRoom, type World } from './effects'
import { drawGood } from './goods'
import { drawBlueprint, drawDoors, drawGhost, drawLift, drawRoof, drawRoomFrame } from './house'
import { drawBoulder, drawCrosser, drawHomeSign, drawPickup, drawPresent, drawRamp, drawRoadBackdrop, drawRoadFront, drawRoadGround, drawSurprise } from './land'
import { C, INK, SKY, TAU, arch, clamp01, heldAge, loop, lw, mix, pen, phaseOf, scaled, smooth, squash } from './look'
import { drawHeap, drawMachine, drawStack, type MachinePic } from './machines'
import { applyIdle, applyTap } from './motion'
import { THEME_ART, drawInside, itemArt } from './rooms/art'
import { MAILBOXES, drawBulldozer, drawCrane, drawGarage, drawMirror, drawPlotGround, drawStreetBackdrop, drawStreetGround } from './street'
import { drawTruck, type TruckPic } from './truck'

/**
 * The picture, one frame at a time: the camera's view, the backdrops, the street (garage,
 * mirror, yard, plots, houses baked per plot and zoom, the rooms that move or are looked at
 * drawn live over the bakes) or the road (ground baked in chunks, the things on it, the
 * truck), the flights, the builder, the particles, the hint's hop, Good night's dusk and
 * lights, the wipe between the two worlds, and the ?debug overlay (every hit target, the
 * shot's rect, the HUD's insets, the frame rate, the bakes). The art is the art files'; this
 * file only places it, at layout.ts's places, through camera.ts's view. No DOM calls here:
 * the stage hands in the canvases.
 */

// ---------------------------------------------------------------------------------------
// Timings and sizes of the picture's own moments (the sim's are in model.ts)

/**
 * A house bake's zoom: at least the screen's device pixels per metre rounded up to a power
 * of two (so the bake is only ever shrunk), but never so big that it holds more than
 * BAKE_MAX pixels or BAKE_SIDE on a side (iOS Safari's canvas limits), and never under
 * BAKE_MIN. BAKE_MAX stays under 2^23 pixels with room for the cache rounding the canvas up
 * to whole pixels: Chromium's software canvas pays 10 to 20 ms a frame to draw a bigger
 * source, as a tall house's bake at its room view's full zoom (2724 x 3840) would be.
 */
const BAKE_MAX = 8e6
const BAKE_SIDE = 4096
const BAKE_MIN = 8
/** Seconds after a tap (or a doorbell party reaching it) a room is drawn live over its house's bake: long enough for any item's own reaction. */
const PLAY_LIVE = 3
/** A roof's pop after its style changes: meanwhile the roofs are drawn live over a bake without them. */
const ROOF_POP = 1

/**
 * The road's ground is baked in chunks CHUNK metres wide, from ROAD_ABOVE above the highest
 * ground within ROAD_NEAR of the chunk to ROAD_BELOW under the lowest (the camera rides on
 * the ground averaged that far round the truck). On a short window (camera.isShort) the
 * road shot keeps the road above the pedal and shows up to about 6.5 m under the ground
 * line, so ROAD_BELOW covers every window at least 300 px tall. A chunk is baked at the
 * view's own zoom once it has held still for ZOOM_HELD seconds; until then (while the camera
 * zooms at the level crossing) at the nearest of ROAD_STEPS steps an octave from the road's
 * own zoom on the screen (camera.roadZoom), and drawn scaled to the view: an ease bakes again
 * only as it crosses a step, and only once more when it settles off a step. A frame that ran
 * no step of the state repeats the last zoom, so one repeat is not holding still.
 */
const CHUNK = 8
const ROAD_ABOVE = 12
const ROAD_BELOW = 7
const ROAD_NEAR = 20
const ROAD_STEPS = 4
const ZOOM_HELD = 0.25

/** The wipe between the street and the road: the old world closes to a circle on the truck over WIPE_CLOSE, the new one opens from the truck over WIPE_OPEN. The circle's centre stays WIPE_IN of the canvas inside its edges, so a truck still off screen (driving into the yard from the left) opens the street from the edge it comes in at. */
const WIPE_CLOSE = 0.3
const WIPE_OPEN = 0.45
const WIPE_IN = 0.1

/** The street truck's speed (for its puffs and its bob) is how far it moved over the last SPEED_OVER seconds of layout.truckOnStreet's path. */
const SPEED_OVER = 0.05
/** The bed shows at most this many goods. */
const BED_MAX = 30
/** The trip's present rides home on the load at the back of the bed, its bottom centre IN_BED from the truck's middle on the ground (on the bed's rim), at IN_BED.k of its size; it grows to its size as it flies out. */
const IN_BED = { x: BED.dx - 0.8, y: BED.dy - 0.12, k: 0.7 }
/** The open present shrinks away over PRESENT_GO once its card goes (layout.PRESENT_FOR after it opens). */
const PRESENT_GO = 0.3

/** The crane at a plot: its mast MAST_IN into the plot, its jib JIB_OVER over the top of the build view's rect (camera.buildRect: the whole house, on a short window the floors shown; under the HUD's top row), the hook at least HOOK_MIN under the jib and HOOK_IDLE under it standing by. */
const MAST_IN = 0.9
const JIB_OVER = 0.8
const HOOK_MIN = 0.6
const HOOK_IDLE = 1.2
/** A new room starts at most LOWER_FROM above its spot, lowers over model.LOWER and lands with a squash, the hook resting on it while the builder hammers (model.HAMMER); a crate's hook goes back up over HOOK_BACK. */
const LOWER_FROM = 3
const HOOK_BACK = 0.6
/** The hand tool lifts a room LIFT_UP (a hand's width) over LIFT_FOR, and it wobbles WOBBLE radians WOBBLE_HZ times a second. */
const LIFT_UP = 0.3
const LIFT_FOR = 0.25
const WOBBLE = 0.03
const WOBBLE_HZ = 1.2
/** A room taken back rises on the hook to the jib over CARRY_FOR, then shrinks away with a poof over SHRINK_FOR: done within the LOWER the rules give the crane. */
const CARRY_FOR = 0.85
const SHRINK_FOR = 0.25
/** A room whose own stamp in s.playAt is fresh (a doorbell party reaching it, a room on top of one being taken back) wiggles WIGGLE radians WIGGLE_HZ times a second, dying out over WIGGLE_FOR. */
const WIGGLE = 0.035
const WIGGLE_HZ = 5
const WIGGLE_FOR = 0.5
/** A new crate is lowered from CRATE_FROM above its pad (from s.crateAt over effects.CRATE_DROP) by a crane standing CRATE_CRANE tall at the station's left edge, its hook on the crate's lid at about CRATE_LID. */
const CRATE_FROM = 4
const CRATE_CRANE = 7
const CRATE_LID = -1.6
/** The builder dashing to the scaffold hops SCAFFOLD_HOP on the way up; at a boulder they stand BOULDER_GAP left of the rock. */
const SCAFFOLD_HOP = 0.5
const BOULDER_GAP = 0.4

/**
 * Evening falls over the rules' DUSK; the street under the evening sky is washed NIGHT_TINT
 * of the dusk's colour, except the rooms whose lights are on; a house's rooms go dark one by
 * one LIGHTS_EVERY apart (lights change at most three times a second), top floor first. A
 * lit room's opening is washed GLOW_WASH of its theme's glow colour and ringed with it
 * GLOW_RIM wide, inside the frame's ink line: drawn over the house's bake, so lights going
 * out never bake a house again.
 */
const NIGHT_TINT = 0.32
const LIGHTS_EVERY = 0.35
const GLOW_WASH = 0.25
const GLOW_RIM = 0.08

/** The one next step hops HINT_HOP every HINT_EVERY, each hop HINT_UP long (the HUD's hand taps it after s.handAt). */
const HINT_HOP = 0.14
const HINT_EVERY = 1.5
const HINT_UP = 0.45

/** A flight arcs ARC metres over the straight line plus ARC_PER_M per metre it travels, at most ARC_MAX; a flight of many shows FLIGHT_SHOWN of them, each FLIGHT_TRAIL of the way behind the one before. */
const ARC = 0.8
const ARC_PER_M = 0.12
const ARC_MAX = 3.5
const FLIGHT_SHOWN = 3
const FLIGHT_TRAIL = 0.07

/** ?debug's colours (hit targets, the shot's rect, the HUD's insets, the panel behind the numbers), and its line of numbers DEBUG_Y CSS pixels down: under the HUD's top row on every screen. */
const DEBUG = { target: '#E8384F', shot: '#2E6BE6', inset: 'rgba(255, 194, 26, 0.25)', panel: 'rgba(255, 255, 255, 0.85)', text: INK } as const
const DEBUG_Y = 100
const SHOT_DASH = [0.3, 0.2]
const NO_DASH: number[] = []

// ---------------------------------------------------------------------------------------

/** What one frame draws from: the state, the sim time, the view, the world box it shows and the seconds the particles move on (0 while the sim holds still). */
interface Frame {
  s: State
  t: number
  view: View
  x0: number
  x1: number
  y0: number
  y1: number
  dt: number
}

/**
 * How much of a room moves: nothing (in a bake: everything at time 0, nobody visiting),
 * its plays (the reactions to taps and to a doorbell party, a wiggle, the builder visiting,
 * with its idle loops held still: a room seen from the street or the build view), or all of
 * it (the room being looked at: its idle loops, wallpaper and floor too).
 */
type Motion = 'still' | 'plays' | 'all'

/** A room drawn apart from its house: lowered by the crane, lifted by the hand tool or carried away. How far over its top the hook holds it (its roof's height when its roof rides along), its offset up, its turn about the hook, its squash and its shrink about its bottom centre. */
interface Move {
  plot: number
  room: PlacedRoom
  lid: number
  dy: number
  rot: number
  sx: number
  sy: number
  shrink: number
}

/** A crane to draw: the mast's foot, the jib's height and where the hook hangs. */
interface Crane {
  mastX: number
  jibY: number
  hookX: number
  hookY: number
}

/** Where the builder stands and how, when they are not in a room or the truck. */
interface Stance {
  x: number
  y: number
  pose: State['builder']['pose']
  u: number
  facing: number
}

/** A short stable name for a text (FNV-1a): a bake's content in its key. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Seconds since a stamp, never under 0 (a stamp of this very tick is a hair ahead of the picture's time), Infinity for never. */
const age = (at: number, t: number) => Math.max(0, since(at, t))

/** Whether something reaching `half` metres either side of x shows in the frame: the truck, the present and the builder are left out off screen (the build and room views never show the garage). */
const shows = (f: Frame, x: number, half: number) => x + half > f.x0 && x - half < f.x1
/** How far the truck reaches either side of its middle (its puffs and shadow), and the builder and the present. */
const TRUCK_REACH = TRUCK.length / 2 + 1
const REACH = 1

/** The room on top of column `col`, or null where the column is empty. */
function topRoom(p: Plot, col: number): PlacedRoom | null {
  let best: PlacedRoom | null = null
  for (const room of p.rooms) {
    const { w, h } = SHAPE_SIZE[room.shape]
    if (col >= room.col && col < room.col + w && (!best || room.row + h > best.row + SHAPE_SIZE[best.shape].h)) best = room
  }
  return best
}

/** A room's top face shows when no room rests on it, its right face when no room stands right of it. */
function faces(room: PlacedRoom, taken: Map<string, PlacedRoom>) {
  const { w, h } = SHAPE_SIZE[room.shape]
  let top = true
  let right = true
  for (let c = 0; c < w; c++) if (taken.has(`${room.col + c},${room.row + h}`)) top = false
  for (let r = 0; r < h; r++) if (taken.has(`${room.col + w},${room.row + r}`)) right = false
  return { top, right }
}

/** The house bake's zoom for a screen at `devicePpm` device pixels per metre (see BAKE_MAX): the largest that fits, so a tall house's room view is as sharp as the cap allows. It depends only on the house's rect, so the bake's name stays put. */
function bucket(devicePpm: number, r: Rect): number {
  const want = 2 ** Math.ceil(Math.log2(Math.max(BAKE_MIN, devicePpm)))
  const fit = Math.floor(Math.min(Math.sqrt(BAKE_MAX / (r.w * r.h)), BAKE_SIDE / Math.max(r.w, r.h)))
  return Math.max(BAKE_MIN, Math.min(want, fit))
}

/** Which world a flight flies in: the road's if either end is on the road (the bed is on the road while a trip is on). */
function flightWorld(s: State, f: Flight): World {
  const onRoad = (p: Place) => p.kind === 'road' || (p.kind === 'bed' && s.road !== null)
  return onRoad(f.from) || onRoad(f.to) ? 'road' : 'street'
}

/** The point u of the way along a flight from a to b: an arc ARC metres over the straight line plus ARC_PER_M per metre it travels, at most ARC_MAX. */
function arcAt(a: { x: number; y: number }, b: { x: number; y: number }, u: number) {
  const high = Math.min(ARC_MAX, ARC + ARC_PER_M * Math.abs(b.x - a.x))
  return { x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) - high * arch(u) }
}

/** A tick stamp's age as an item's `play`: seconds since it, or -1 before it or never. */
function playOf(s: State, room: PlacedRoom, slot: number, t: number): number {
  const at = Math.max(s.playAt[`${room.id}:${slot}`] ?? -1, s.playAt[`${room.id}`] ?? -1)
  const played = since(at, t)
  return played >= 0 && played < Infinity ? played : -1
}

/** Seconds into a room's wiggle (its own stamp in s.playAt, from a doorbell party reaching it or a room under it held by the hand), or -1 when it is not wiggling. */
function wiggleOf(s: State, room: PlacedRoom, t: number): number {
  const w = since(s.playAt[`${room.id}`] ?? -1, t)
  return w >= 0 && w < WIGGLE_FOR ? w : -1
}

/** The trip's present riding in the truck's bed, over the truck just drawn, the context at the truck's middle on the ground. */
function bedPresent(g: CanvasRenderingContext2D, t: number): void {
  g.save()
  g.translate(IN_BED.x, IN_BED.y)
  scaled(g, IN_BED.k, () => drawPresent(g, t, -1))
  g.restore()
}

/**
 * Draws the game on one canvas. `makeCanvas` gives a fresh offscreen canvas for the bakes;
 * `debug` turns on the overlay.
 */
export class Renderer {
  private width = 1
  private height = 1
  private cache: Cache
  private effects = new Effects()
  /** The world drawn last frame (null before the first), and the truck's place on the canvas then (device pixels): the wipe closes on it. */
  private world: World | null = null
  private focus = { x: 0, y: 0 }
  /** A wipe running: where its circle closes, and whether the old world's last frame was kept to close over. */
  private wipe: { x: number; y: number; snap: boolean } | null = null
  /** Per plot: its bake's name, the frame's inputs it was last checked against, and what the bake shows (the house's kind and roof, the rooms left out; each room's place and inside). */
  private sigs: { from: string; sig: string; base: string; rooms: Map<number, readonly [string, string]> }[] = []
  /** When goods land in the bed (sim time), the latest one already landed first: the truck's ears flick on each. Flights leave the state as they land, so the picture keeps their times. */
  private bedLandings: number[] = [-Infinity]
  /** The carry-away whose poof is done (its s.craneAt). */
  private poofed = -1
  /** The road whose ground chunks the cache holds, by name (their zoom in it), the zoom the last road frame drew at (device pixels per metre), and the frame time it has held since. */
  private road = ''
  private drawnZoom = 0
  private zoomFrom = 0
  /** The last frame's state, its keep and its last input, time and view, to draw nothing new while nothing moves (paused, or at the Good night card); dirty when the canvas lost its picture. */
  private last: { s: State; keep: State['keep']; input: number; t: number; view: View } | null = null
  private dirty = true
  /** ?debug: a smoothed frame time for the frame rate. */
  private frameTime = 1 / 60

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

  /** One frame of state `s` at sim time t through `view`; `events` are this frame's, `dt` its real seconds. */
  draw(s: State, t: number, view: View, events: readonly SimEvent[], dt: number): void {
    const l = this.last
    const same = l !== null && l.s === s && l.keep === s.keep && l.input === s.lastInputAt && l.t === t && l.view.x0 === view.x0 && l.view.y0 === view.y0 && l.view.ppm === view.ppm && l.view.w === view.w && l.view.h === view.h
    const still = same && events.length === 0 && !this.dirty && !this.wipe
    if (dt > 0) this.frameTime += (dt - this.frameTime) * 0.1
    // Paused or at the Good night card, nothing moves: the picture on the canvas is the right one.
    if (still) return
    const moved = l === null || t !== l.t
    this.last = { s, keep: s.keep, input: s.lastInputAt, t, view }
    this.dirty = false
    const ctx = this.ctx
    const world: World = s.shot.kind === 'road' ? 'road' : 'street'
    this.cache.tick()

    // Crossing between the worlds: the last frame is kept for the wipe to close over.
    if (this.world !== null && world !== this.world) {
      this.effects.clear()
      this.cache.drop('wipe', () => false)
      const snap = since(s.shotAt, t) < WIPE_CLOSE
      if (snap) this.cache.get('wipe', 'wipe', this.width, this.height, (c) => c.drawImage(ctx.canvas, 0, 0))
      this.wipe = since(s.shotAt, t) < WIPE_CLOSE + WIPE_OPEN ? { ...this.focus, snap } : null
    }
    this.world = world
    // The snapshot is drawn last: marked used now, no bake this frame can let it go.
    if (this.wipe?.snap) this.cache.find('wipe')
    // The particles of this frame's events.
    this.effects.spawn(s, events)
    const landings = this.bedLandings
    for (const fl of s.flights) if (fl.to.kind === 'bed' && !landings.includes((fl.at + fl.dur) * STEP)) landings.push((fl.at + fl.dur) * STEP)
    this.bedLandings = [Math.max(...landings.filter((x) => x <= t)), ...landings.filter((x) => x > t)]

    const f: Frame = { s, t, view, x0: view.x0, x1: view.x0 + view.w / view.ppm, y0: view.y0, y1: view.y0 + view.h / view.ppm, dt: moved ? dt : 0 }
    pen.ppm = view.ppm
    pen.dpr = view.dpr
    ctx.globalAlpha = 1
    // A clean canvas: nothing of the last frame shows through wherever a backdrop leaves a gap.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    if (world === 'road') this.drawRoad(f)
    else this.drawStreet(f)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (this.wipe) this.drawWipe(f)
    if (this.debug) this.overlay(f)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
  }

  /** Forget every baked canvas (a context was lost): everything is painted again. */
  invalidate(): void {
    this.cache.clear()
    this.sigs = []
    this.road = ''
    this.wipe = null
    this.dirty = true
  }

  /** Lets go of every canvas: the stage is gone. */
  dispose(): void {
    this.cache.clear()
  }

  // -------------------------------------------------------------------------------------
  // The street

  private drawStreet(f: Frame): void {
    const { s, t, view } = f
    const ctx = this.ctx
    const evening = s.night ? smooth(0, DUSK, since(s.night.at, t)) : 0
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawStreetBackdrop(ctx, view, t, evening)
    // By evening the street is drawn on a layer of its own, so the dusk can wash over everything on it but the sky and the lit rooms.
    let g = ctx
    let layer: HTMLCanvasElement | null = null
    if (evening > 0) {
      const key = `night|${this.width}x${this.height}`
      this.cache.drop('night', (k) => k === key)
      layer = this.cache.get(key, 'night', this.width, this.height, () => {})
      g = this.cache.context(key)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, this.width, this.height)
    } else this.cache.drop('night', () => false)
    this.toWorld(g, view)
    const lit = this.streetWorld(g, f, evening)
    if (layer) {
      g.save()
      g.globalCompositeOperation = 'source-atop'
      g.beginPath()
      g.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0)
      for (const r of lit) g.rect(r.x, r.y, r.w, r.h)
      g.globalAlpha = NIGHT_TINT * evening
      g.fillStyle = SKY.evening.bands[0]
      g.fill('evenodd')
      g.restore()
      g.setTransform(1, 0, 0, 1, 0, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layer, 0, 0)
    }
  }

  /**
   * Everything of the street but the sky, in world units; returns what the dusk leaves out
   * by the even-odd rule: the rooms whose lights are on (bright), and the parts of the front
   * doors standing in front of them (back in the dusk, so a door is washed evenly).
   */
  private streetWorld(g: CanvasRenderingContext2D, f: Frame, evening: number): Rect[] {
    const { s, t, view } = f
    const keep = s.keep
    drawStreetGround(g, f.x0 - 1, f.x1 + 1, t, evening)
    if (f.x0 < GARAGE_W + 1) {
      drawGarage(g, t, evening)
      g.save()
      g.translate(MIRROR_X, 0)
      drawMirror(g, t)
      g.restore()
    }

    // The plots, their houses, the crane and the rooms on its hook, the ghosts.
    const { moves, cranes } = this.crane(f)
    const lit: Rect[] = []
    keep.plots.forEach((p, plot) => {
      const pr = plotRect(plot)
      if (pr.x > f.x1 + 1 || pr.x + pr.w < f.x0 - 1) return
      const hop = this.hop(s, t, { kind: 'plot', plot })
      const levelled = heldAge(since(s.plotAt[plot]!, t))
      const fronts = this.fronts(s, t, plot, p)
      g.save()
      g.translate(pr.x, hop)
      drawPlotGround(g, p.kind, levelled, t, fronts.mailboxes)
      if (levelled < BULLDOZE) {
        g.translate((levelled / BULLDOZE) * PLOT_W, 0)
        drawBulldozer(g, levelled / BULLDOZE, t)
      }
      g.restore()
      if (p.kind === null) return
      const lights = this.lights(s, t, p, plot, evening)
      const doors = doorRects(plot, p)
      for (const room of p.rooms) {
        if (!lights.has(room.id)) continue
        const r = roomRect(plot, room)
        lit.push({ ...r, y: r.y + hop })
        for (const d of doors) {
          const x0 = Math.max(r.x, d.x)
          const x1 = Math.min(r.x + r.w, d.x + d.w)
          const y0 = Math.max(r.y, d.y)
          const y1 = Math.min(r.y + r.h, d.y + d.h)
          if (x1 > x0 && y1 > y0) lit.push(rect(x0, y0 + hop, x1 - x0, y1 - y0))
        }
      }
      this.house(g, f, plot, p, moves, hop, lights, fronts)
    })
    if (s.shot.kind === 'plot' && !s.hand) {
      const plot = s.shot.plot
      const pressed = s.press?.hit
      for (const spot of validSpots(keep.plots[plot]!, s.shape)) {
        const r = roomRect(plot, { shape: s.shape, col: spot.col, row: spot.row })
        g.save()
        g.translate(r.x, r.y)
        drawGhost(g, s.shape, pressed !== undefined && same(pressed, { kind: 'spot', plot, col: spot.col, row: spot.row }), t)
        g.restore()
      }
    }
    for (const c of cranes) {
      g.save()
      g.translate(c.mastX, 0)
      drawCrane(g, -c.jibY, c.hookX - c.mastX, Math.max(0, c.hookY - c.jibY), t)
      g.restore()
    }
    for (const m of moves.values()) this.moved(g, f, m)

    // The yard: each station's heap, machine (a new crate lowered onto its pad) and stack.
    for (const m of MACHINES) {
      const left = stationLeft(m)
      if (left > f.x1 + 1 || left + STATION_W < f.x0 - 1) continue
      const { takes, makes } = RECIPES[m]
      const heap = shown(s, { kind: 'heap', good: takes }, takes, t)
      const h = heapRect(m)
      g.save()
      g.translate(h.x + h.w / 2, 0)
      drawHeap(g, takes, heap, t)
      g.restore()
      const run = s.machines[m]
      const stage = keep.machines[m]
      const pic: MachinePic = {
        stage,
        on: run.on,
        batchAge: age(run.batchAt, t),
        batchFor: run.batchFor * STEP,
        pushAge: age(run.pushAt, t),
        coughAge: age(run.coughAt, t),
        hits: run.hits,
        hitAge: age(run.hitAt, t),
        builtAge: age(run.builtAt, t),
        ready: stage === 'built' && heap > 0,
      }
      const r = machineRect(m)
      const dropAge = since(s.crateAt[m], t)
      const drop = stage === 'crate' && dropAge >= 0 && dropAge < CRATE_DROP ? -CRATE_FROM * (1 - smooth(0, CRATE_DROP, dropAge)) : 0
      if (stage === 'crate' && dropAge >= 0 && dropAge < CRATE_DROP + HOOK_BACK) {
        const mastX = left
        const lid = CRATE_LID + drop
        const hookY = dropAge < CRATE_DROP ? lid : mix(lid, -CRATE_CRANE + HOOK_IDLE, smooth(CRATE_DROP, CRATE_DROP + HOOK_BACK, dropAge))
        g.save()
        g.translate(mastX, 0)
        drawCrane(g, CRATE_CRANE, r.x + r.w / 2 - mastX, hookY + CRATE_CRANE, t)
        g.restore()
      }
      g.save()
      g.translate(r.x + r.w / 2, drop + this.hop(s, t, { kind: 'machine', m }))
      drawMachine(g, m, pic, t)
      g.restore()
      const k = stackRect(m)
      g.save()
      g.translate(k.x + k.w / 2, 0)
      drawStack(g, makes, shown(s, { kind: 'stack', good: makes }, makes, t), t)
      g.restore()
    }

    // The truck where layout.ts puts its tap target (with the trip's present in its bed while it drives in), the present, the builder.
    const truck = truckOnStreet(s, t)
    const home = s.presentAt >= 0 && s.presentAt === s.tipAt
    const popped = since(s.presentAt, t)
    // The present the truck brings home pops out of the bed as it tips (s.presentAt is then s.tipAt) and flies over PRESENT_POP to the yard behind the tipped bed (layout.PRESENT_X), opening as it lands; a tap opens it again where it stands. When its card goes it shrinks away. In the air it is drawn over the truck; landed, under it, so the truck backing home passes in front of it.
    const opened = since(presentOpenAt(s), t)
    const going = opened - PRESENT_FOR
    const u = home ? popped / PRESENT_POP : 1
    const present = () => {
      if (s.presentAt < 0 || (home && popped < 0) || going >= PRESENT_GO) return
      const at = u < 1 ? arcAt({ x: TRUCK_TIP_X + IN_BED.x, y: IN_BED.y }, { x: PRESENT_X, y: 0 }, u) : { x: PRESENT_X, y: this.hop(s, t, { kind: 'present' }) }
      const k = 1 - smooth(0, PRESENT_GO, going)
      if (!shows(f, at.x, REACH) || k <= 0.01) return
      g.save()
      g.translate(at.x, at.y)
      g.scale(k, k)
      if (u < 1) scaled(g, mix(IN_BED.k, 1, u), () => drawPresent(g, t, -1))
      else drawPresent(g, t, opened)
      g.restore()
    }
    if (u >= 1) present()
    const bed: Good[] = []
    if (s.road === null) for (const fl of s.flights) if (fl.from.kind === 'bed' && t < fl.at * STEP) for (let i = 0; i < fl.n && bed.length < BED_MAX; i++) bed.push(fl.good)
    if (shows(f, truck.x, TRUCK_REACH)) {
      g.save()
      g.translate(truck.x, this.hop(s, t, { kind: 'truck' }))
      const speed = Math.abs(truck.x - truckOnStreet(s, t - SPEED_OVER).x) / SPEED_OVER
      drawTruck(g, { look: keep.look, bed, tip: truck.tip, roll: truck.x - (TRUCK_TIP_X - DRIVE_FROM), speed, honk: Infinity, flick: Infinity, stickers: keep.trips, driver: truck.driver, t })
      if (home && popped < 0) bedPresent(g, t)
      g.restore()
    }
    const [fx, fy] = toScreen(view, truck.x, -TRUCK.height / 2)
    this.focus = { x: fx * view.dpr, y: fy * view.dpr }
    if (u < 1) present()
    const b = this.stance(s, t)
    if (b && shows(f, b.x, REACH)) this.builder(g, s, b)

    this.flights(g, f, 'street')
    this.effects.draw(g, 'street', f.dt)
    return lit
  }

  /** At Good night, the rooms of a plot whose lights are on: every room from evening 0.5, until the child taps the house and they go out one by one, top floor first, left to right. None by day. */
  private lights(s: State, t: number, p: Plot, plot: number, evening: number): Set<number> {
    const on = new Set<number>()
    if (!s.night || evening < 0.5) return on
    const dark = s.night.dark[plot]!
    const order = [...p.rooms].sort((a, b) => b.row + SHAPE_SIZE[b.shape].h - (a.row + SHAPE_SIZE[a.shape].h) || a.col - b.col)
    order.forEach((room, i) => {
      if (dark < 0 || since(dark, t) < i * LIGHTS_EVERY) on.add(room.id)
    })
    return on
  }

  /**
   * One plot's house: its bake, then live over it the rooms that move (the room shot's, the
   * builder's, any that played within PLAY_LIVE: a tap, a doorbell party reaching it) and
   * the roofs while they pop, then the glow of the rooms lit at Good night, the lift and the
   * doors. The rooms on the crane are left out of the bake and drawn by `moved`. Only the
   * room being looked at runs its idle loops.
   */
  private house(g: CanvasRenderingContext2D, f: Frame, plot: number, p: Plot, moves: Map<number, Move>, hop: number, lights: ReadonlySet<number>, fronts: { doors: readonly number[] }): void {
    const { s, t } = f
    const shot = s.shot
    const moving = new Set<number>()
    for (const m of moves.values()) if (m.plot === plot) moving.add(m.room.id)
    const popping = since(s.roofAt[plot]!, t) < ROOF_POP
    const over = this.liveRooms(s, t, plot, p)
    g.save()
    g.translate(0, hop)
    const { canvas, r, b } = this.bake(f, plot, p, moving, over, !popping)
    // The live rooms in the bake's order, each one's faces under its neighbours; a wiggling room's place is cut out of the bake, so its still copy never shows round its turned corners.
    const live = p.rooms.filter((room) => over.has(room.id) && !moving.has(room.id)).sort((a, b) => a.row - b.row || a.col - b.col)
    const wiggling = live.filter((room) => wiggleOf(s, room, t) >= 0)
    g.save()
    if (wiggling.length > 0) {
      g.beginPath()
      g.rect(r.x, r.y, r.w, r.h)
      for (const room of wiggling) {
        const rr = roomRect(plot, room)
        g.rect(rr.x, rr.y, rr.w, rr.h)
      }
      g.clip('evenodd')
    }
    g.drawImage(canvas, r.x, r.y, canvas.width / b, canvas.height / b)
    g.restore()
    const taken = occupancy({ ...p, rooms: p.rooms.filter((room) => !moving.has(room.id)) })
    for (const room of live) {
      this.room(g, f, plot, room, shot.kind === 'room' && shot.room === room.id ? 'all' : 'plays', taken)
      if (!popping) this.toppedRoofs(g, f, plot, p, room, true)
    }
    if (popping)
      for (let col = 0; col < HOUSE_GRID[p.kind!].cols; col++) {
        const top = topRoom(p, col)
        if (top && !moving.has(top.id)) this.roof(g, f, plot, p, col, top, true)
      }
    for (const room of p.rooms) if (lights.has(room.id) && !moving.has(room.id)) this.glow(g, plot, room)
    const lift = liftRect(plot, p)
    if (lift) {
      g.save()
      g.translate(lift.x, lift.y + lift.h)
      drawLift(g, lift.h, t)
      g.restore()
    }
    g.save()
    g.translate(gridLeft(plot), 0)
    drawDoors(g, p.kind!, t, fronts.doors)
    g.restore()
    g.restore()
  }

  /**
   * How much of each front door of a plot, and of each row-house home's mailbox, shows, 0
   * to 1: in a room view the ones in front of the room being looked at are left out, so they
   * hide none of it, fading out and in as the camera comes and goes.
   */
  private fronts(s: State, t: number, plot: number, p: Plot): { doors: number[]; mailboxes: number[] } {
    const doors = p.kind === null ? [] : doorRects(plot, p)
    const left = plotLeft(plot)
    const mailboxes = p.kind === 'row' ? MAILBOXES.map((m) => rect(left + m.x, m.y, m.w, m.h)) : []
    const shown = (shot: State['shot']) => {
      const room = shot.kind === 'room' && shot.plot === plot ? p.rooms.find((r) => r.id === shot.room) : undefined
      const r = room ? roomRect(plot, room) : null
      return (d: Rect) => (r && d.x < r.x + r.w && d.x + d.w > r.x && d.y < r.y + r.h && d.y + d.h > r.y ? 0 : 1)
    }
    const to = shown(s.shot)
    if (!tweening(s, t)) return { doors: doors.map(to), mailboxes: mailboxes.map(to) }
    const from = shown(s.shotFrom)
    const k = smooth(0, SHOT_TWEEN, since(s.shotAt, t))
    const fade = (d: Rect) => mix(from(d), to(d), k)
    return { doors: doors.map(fade), mailboxes: mailboxes.map(fade) }
  }

  /** The rooms of a plot drawn live over its bake: the room being looked at, the one the builder visits, and every room that played (or holds an item that played) within PLAY_LIVE. */
  private liveRooms(s: State, t: number, plot: number, p: Plot): Set<number> {
    const over = new Set<number>()
    const shot = s.shot
    if (shot.kind === 'room' && shot.plot === plot) over.add(shot.room)
    const at = s.builder.at
    if (at.kind === 'room' && at.plot === plot) over.add(at.room)
    const fresh = (key: string) => since(s.playAt[key] ?? -1, t) < PLAY_LIVE
    for (const room of p.rooms) if (fresh(`${room.id}`) || room.items.some((_, i) => fresh(`${room.id}:${i}`))) over.add(room.id)
    return over
  }

  /** A lit room at Good night: its opening washed with its theme's glow colour (a bare room's is the house's warm light) and ringed with it inside the frame's ink line. */
  private glow(g: CanvasRenderingContext2D, plot: number, room: PlacedRoom): void {
    const inner = interiorRect(plot, room)
    const colour = room.theme ? THEME_ART[room.theme].glow : C.sparkleWarm
    const inset = lw('line') / 2 + GLOW_RIM / 2
    g.save()
    g.fillStyle = colour
    g.globalAlpha = GLOW_WASH
    g.fillRect(inner.x, inner.y, inner.w, inner.h)
    g.globalAlpha = 1
    g.lineWidth = GLOW_RIM
    g.strokeStyle = colour
    g.strokeRect(inner.x + inset, inner.y + inset, inner.w - 2 * inset, inner.h - 2 * inset)
    g.restore()
  }

  /**
   * The bake of a plot's house without the rooms in `skip` (and without its roofs unless
   * `roofs`), at the zoom the camera is heading for: the one held, or while the camera moves
   * any held bake of the same house (a new one waits for the camera to settle), or a new
   * one. The rooms in `over` are drawn live over it, so what is inside them does not name
   * the bake: tapping items in the room view, a doorbell party, or going from room to room,
   * never bakes the house again.
   */
  private bake(f: Frame, plot: number, p: Plot, skip: ReadonlySet<number>, over: ReadonlySet<number>, roofs: boolean): { canvas: HTMLCanvasElement; r: Rect; b: number } {
    const { s, t, view } = f
    const r = houseRect(plot, p)
    const moving = tweening(s, t)
    const to = moving ? viewAt(s, s.shotAt * STEP + SHOT_TWEEN, view.w, view.h, view.dpr) : view
    const b = bucket(to.ppm * to.dpr, r)
    const group = `house${plot}`
    const prefix = `${group}|${this.signature(s, plot, p, skip, over, roofs)}|`
    const key = `${prefix}${b}`
    const held = this.cache.find(key)
    if (held) return { canvas: held, r, b }
    if (moving) {
      const other = this.cache.keys(group).filter((k) => k.startsWith(prefix))
      if (other.length > 0) {
        const k = other[other.length - 1]!
        return { canvas: this.cache.find(k)!, r, b: Number(k.slice(prefix.length)) }
      }
    }
    this.cache.drop(group, (k) => k.startsWith(prefix))
    const canvas = this.cache.get(key, group, r.w * b, r.h * b, (c) => {
      const ppm = pen.ppm
      const dpr = pen.dpr
      // Lines as thick as they will look at the zoom the camera is heading for, never under one of the bake's pixels.
      pen.ppm = to.ppm
      pen.dpr = b / to.ppm
      c.setTransform(b, 0, 0, b, -r.x * b, -r.y * b)
      this.paintHouse(c, f, plot, p, skip, roofs)
      pen.ppm = ppm
      pen.dpr = dpr
    })
    return { canvas, r, b }
  }

  /**
   * The name of what a plot's bake shows, checked again only when the plot's rev, the rooms
   * left out or drawn over, or the roofs being baked change. The name stays while nothing
   * changed but inside the rooms drawn live over the bake.
   */
  private signature(s: State, plot: number, p: Plot, skip: ReadonlySet<number>, over: ReadonlySet<number>, roofs: boolean): string {
    const ids = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b).join(',')
    const base = `${p.kind}|${roofs ? p.roof : 'no roofs'}|${ids(skip)}`
    const from = `${s.rev[plot]}|${base}|${ids(over)}`
    const memo = this.sigs[plot]
    if (memo !== undefined && memo.from === from) return memo.sig
    const rooms = new Map<number, readonly [string, string]>()
    for (const r of p.rooms) if (!skip.has(r.id)) rooms.set(r.id, [`${r.shape}:${r.col}:${r.row}:${r.material}`, `${r.theme}:${r.wall}:${r.floor}:${r.items.join('.')}`])
    const kept =
      memo !== undefined &&
      memo.base === base &&
      memo.rooms.size === rooms.size &&
      [...rooms].every(([id, [place, inside]]) => {
        const was = memo.rooms.get(id)
        return was !== undefined && was[0] === place && (was[1] === inside || over.has(id))
      })
    if (kept) {
      memo.from = from
      return memo.sig
    }
    let text = base
    for (const [id, [place, inside]] of rooms) text += `|${id}:${place}:${inside}`
    const sig = hash(text)
    this.sigs[plot] = { from, sig, base, rooms }
    return sig
  }

  /** A house as it stands without the rooms in `skip`, all of it still: the blueprint, the rooms bottom up and left to right (each one's faces under its neighbours), the roofs if `roofs`. */
  private paintHouse(g: CanvasRenderingContext2D, f: Frame, plot: number, p: Plot, skip: ReadonlySet<number>, roofs: boolean): void {
    const kind = p.kind!
    g.save()
    g.translate(gridLeft(plot), 0)
    drawBlueprint(g, kind, 0)
    g.restore()
    const standing = p.rooms.filter((r) => !skip.has(r.id)).sort((a, b) => a.row - b.row || a.col - b.col)
    const taken = occupancy({ ...p, rooms: standing })
    for (const room of standing) this.room(g, f, plot, room, 'still', taken)
    if (!roofs) return
    for (let col = 0; col < HOUSE_GRID[kind].cols; col++) {
      const top = topRoom(p, col)
      if (top && !skip.has(top.id)) this.roof(g, f, plot, p, col, top, false)
    }
  }

  /** The roofs of the columns `room` tops. */
  private toppedRoofs(g: CanvasRenderingContext2D, f: Frame, plot: number, p: Plot, room: PlacedRoom, live: boolean): void {
    const { w } = SHAPE_SIZE[room.shape]
    for (let col = room.col; col < room.col + w; col++) if (topRoom(p, col) === room) this.roof(g, f, plot, p, col, room, live)
  }

  /** The roof over column `col`, topped by `top`, cut at each wall where the column on that side stands taller; `live`: popping after a change of style, otherwise still. */
  private roof(g: CanvasRenderingContext2D, f: Frame, plot: number, p: Plot, col: number, top: PlacedRoom, live: boolean): void {
    const r = roofRect(plot, p, col)!
    const lower = (side: Rect | null) => side === null || side.y >= r.y
    g.save()
    g.translate(r.x, r.y + r.h)
    drawRoof(g, p.roof, top.material, r.w, lower(roofRect(plot, p, col - 1)), lower(roofRect(plot, p, col + 1)), heldAge(live ? since(f.s.roofAt[plot]!, f.t) : Infinity), live ? f.t : 0)
    g.restore()
  }

  /**
   * One room at its place, in the order rooms/types.ts gives: its inside (rooms/art.ts
   * drawInside), its items at their slots, the builder visiting, then the frame over all.
   * `motion` says how much of it moves.
   */
  private room(g: CanvasRenderingContext2D, f: Frame, plot: number, room: PlacedRoom, motion: Motion, taken: Map<string, PlacedRoom>): void {
    const { s } = f
    const t = motion === 'all' ? f.t : 0
    const r = roomRect(plot, room)
    const inner = interiorRect(plot, room)
    g.save()
    const wiggle = motion === 'still' ? -1 : wiggleOf(s, room, f.t)
    if (wiggle >= 0) {
      g.translate(r.x + r.w / 2, r.y + r.h)
      g.rotate(WIGGLE * Math.sin(TAU * WIGGLE_HZ * wiggle) * (1 - wiggle / WIGGLE_FOR))
      g.translate(-(r.x + r.w / 2), -(r.y + r.h))
    }
    g.save()
    g.translate(inner.x, inner.y)
    drawInside(g, room.theme, inner.w, inner.h, t, room.wall, room.floor)
    g.restore()
    slotsOf(room.shape).forEach((slot, i) => {
      const id = room.items[i]
      if (!id) return
      const play = motion === 'still' ? -1 : playOf(s, room, i, f.t)
      g.save()
      g.translate(r.x + slot.x, r.y + slot.y)
      if (motion === 'all') applyIdle(g, ITEMS[id].idle, t, phaseOf(`${id}:${i}`))
      applyTap(g, ITEMS[id].tap, play)
      itemArt(id)(g, t, play)
      g.restore()
    })
    const at = s.builder.at
    if (motion !== 'still' && at.kind === 'room' && at.room === room.id) this.builder(g, s, { x: at.x, y: visitPoint(plot, room).y, pose: s.builder.pose, u: this.poseTime(s, f.t), facing: s.builder.facing })
    const { top, right } = faces(room, taken)
    g.translate(r.x, r.y)
    drawRoomFrame(g, room.shape, room.material, top, right, t)
    g.restore()
  }

  /**
   * The cranes this frame and the rooms on their hooks: a new room lowered (and its
   * landing's squash), a room lifted by the hand tool, a room taken back carried away; and in
   * the build view the crane standing by.
   */
  private crane(f: Frame): { moves: Map<number, Move>; cranes: Crane[] } {
    const { s, t } = f
    const moves = new Map<number, Move>()
    const cranes: Crane[] = []
    const jibOf = (plot: number) => buildRect(s, plot, f.view.w, f.view.h, t).y - JIB_OVER
    // A room on the hook tops its columns and carries their roofs (a room taken back leaves its roof on the house).
    const lidOf = (plot: number, room: PlacedRoom) => (s.keep.plots[plot]!.rooms.includes(room) ? ROOF_H : 0)
    const hookOn = (plot: number, x: number, y: number) => cranes.push({ mastX: plotLeft(plot) + MAST_IN, jibY: jibOf(plot), hookX: x, hookY: y })
    const idleHook = (plot: number) => {
      const p = s.keep.plots[plot]!
      return { x: gridLeft(plot) + (HOUSE_GRID[p.kind!].cols * CELL) / 2, y: jibOf(plot) + HOOK_IDLE }
    }
    if (s.craneRoom >= 0) {
      const { plot, room } = findRoom(s, s.craneRoom)
      const r = roomRect(plot, room)
      const cx = r.x + r.w / 2
      const lowered = age(s.craneAt, t)
      const lid = lidOf(plot, room)
      const rise = Math.max(0, r.y - lid - (jibOf(plot) + HOOK_MIN))
      if (s.craneOut && lowered < CARRY_FOR + SHRINK_FOR) {
        const dy = -rise * smooth(0, CARRY_FOR, lowered)
        moves.set(room.id, { plot, room, lid, dy, rot: 0, sx: 1, sy: 1, shrink: 1 - smooth(CARRY_FOR, CARRY_FOR + SHRINK_FOR, lowered) })
        hookOn(plot, cx, r.y - lid + dy)
        if (lowered >= CARRY_FOR && this.poofed !== s.craneAt) {
          this.poofed = s.craneAt
          this.effects.poof('street', cx, r.y + dy + r.h / 2, Math.min(r.w, r.h) / 2)
        }
      } else if (!s.craneOut && lowered < LOWER + HAMMER) {
        // The rules keep craneRoom until the hammering is done: the room is on the hook till then, squashing as it lands.
        const [sx, sy] = lowered >= LOWER ? squash(lowered - LOWER) : [1, 1]
        const dy = -Math.min(LOWER_FROM, rise) * (1 - smooth(0, LOWER, lowered))
        moves.set(room.id, { plot, room, lid, dy, rot: 0, sx, sy, shrink: 1 })
        hookOn(plot, cx, r.y - lid + dy)
      }
    }
    if (s.lifted >= 0) {
      const { plot, room } = findRoom(s, s.lifted)
      const r = roomRect(plot, room)
      const lifted = age(s.liftedAt, t)
      const dy = -LIFT_UP * smooth(0, LIFT_FOR, lifted)
      const lid = lidOf(plot, room)
      moves.set(room.id, { plot, room, lid, dy, rot: WOBBLE * Math.sin(TAU * WOBBLE_HZ * lifted), sx: 1, sy: 1, shrink: 1 })
      hookOn(plot, r.x + r.w / 2, r.y - lid + dy)
    }
    const shot = s.shot
    if (shot.kind === 'plot' && s.keep.plots[shot.plot]!.kind !== null && !cranes.some((c) => c.mastX === plotLeft(shot.plot) + MAST_IN)) {
      const idle = idleHook(shot.plot)
      hookOn(shot.plot, idle.x, idle.y)
    }
    return { moves, cranes }
  }

  /** A room on the crane's hook, turned about the hook and squashed or shrunk about its bottom, with its roofs riding along. */
  private moved(g: CanvasRenderingContext2D, f: Frame, m: Move): void {
    if (m.shrink <= 0.01) return
    const r = roomRect(m.plot, m.room)
    const cx = r.x + r.w / 2
    const p = f.s.keep.plots[m.plot]!
    g.save()
    g.translate(cx, r.y - m.lid + m.dy)
    g.rotate(m.rot)
    g.translate(0, m.lid + r.h)
    g.scale(m.sx * m.shrink, m.sy * m.shrink)
    g.translate(-cx, -(r.y + r.h))
    this.room(g, f, m.plot, m.room, 'plays', occupancy(p))
    this.toppedRoofs(g, f, m.plot, p, m.room, true)
    g.restore()
  }

  // -------------------------------------------------------------------------------------
  // The road

  private drawRoad(f: Frame): void {
    const { s, t, view } = f
    const ctx = this.ctx
    const road = s.road!
    const def = road.def
    const look = s.keep.look
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawRoadBackdrop(ctx, def, view, t)
    this.roadGround(f, def)
    this.toWorld(ctx, view)
    const home = groundAt(def, def.length)
    ctx.save()
    ctx.translate(def.length, home)
    drawHomeSign(ctx, t)
    ctx.restore()

    // What is still on the road.
    const stop = road.stop >= 0 ? def.things[road.stop]! : null
    def.things.forEach((th, i) => {
      if (th.x < f.x0 - 6 || th.x > f.x1 + 6) return
      const done = road.done[i]! >= 0
      // The ramp stays, and the crossing with its barrier up; the balloon drifts off with its gem dropped; everything else done is gone.
      if (done && th.kind !== 'ramp' && !(th.kind === 'surprise' && (th.what === 'train' || since(road.done[i]!, t) < BALLOON_AWAY))) return
      const stopped = road.stop === i
      ctx.save()
      ctx.translate(th.x, groundAt(def, th.x))
      switch (th.kind) {
        case 'pickup':
          drawPickup(ctx, th.good, t, phaseOf(i))
          break
        case 'boulder':
          drawBoulder(ctx, th.size, th.gem, stopped ? road.hits : 0, heldAge(stopped && road.hitAt >= road.stopAt ? since(road.hitAt, t) : Infinity), look.tool, t)
          break
        case 'crosser':
          drawCrosser(ctx, th.who, stopped ? clamp01(since(road.stopAt, t) / CROSS_FOR) : 0, heldAge(road.answered === i ? since(road.answerAt, t) : Infinity), t)
          break
        case 'ramp':
          drawRamp(ctx, t)
          break
        case 'present':
          drawPresent(ctx, t, -1)
          break
        case 'surprise': {
          const u =
            th.what === 'train'
              ? stopped
                ? clamp01(since(road.stopAt, t) / TRAIN_FOR)
                : done
                  ? 1
                  : 0
              : done
                ? 0.5 + 0.5 * clamp01(since(road.done[i]!, t) / BALLOON_AWAY)
                : 0.5 * clamp01(1 - (th.x - BALLOON_LEAD - road.x) / BALLOON_NEAR)
          drawSurprise(ctx, th.what, u, t)
          break
        }
      }
      ctx.restore()
    })
    // The ramp's gems not yet caught, as pickups hanging where a flying truck passes (road.ts lays them out).
    def.rampGems.forEach((gem, k) => {
      if (road.rampGot[k]! >= 0 || gem.x < f.x0 - 1 || gem.x > f.x1 + 1) return
      ctx.save()
      ctx.translate(gem.x, gem.y + GEM_R)
      drawPickup(ctx, 'gem', t, phaseOf(`ramp${k}`))
      ctx.restore()
    })

    // The truck (with the present in its bed once it is picked up), and the builder out of the cab breaking the boulder it stopped at.
    const atBoulder = stop !== null && stop.kind === 'boulder'
    const pic: TruckPic = { look, bed: road.bed, tip: 0, roll: road.roll, speed: road.v, honk: age(road.honkAt, t), flick: t - this.bedLandings[0]!, stickers: s.keep.trips, driver: !atBoulder, t }
    ctx.save()
    ctx.translate(road.x, road.y + this.hop(s, t, { kind: 'truck' }))
    ctx.rotate(road.tilt)
    drawTruck(ctx, pic)
    if (road.present) bedPresent(ctx, t)
    ctx.restore()
    const [fx, fy] = toScreen(view, road.x, road.y - TRUCK.height / 2)
    this.focus = { x: fx * view.dpr, y: fy * view.dpr }
    if (atBoulder) {
      const x = stop.x - boulderRect(def, stop.x, stop.size).w / 2 - BOULDER_GAP
      const hit = road.hitAt >= road.stopAt
      this.builder(ctx, s, { x, y: groundAt(def, x), pose: hit ? 'hit' : 'stand', u: age(hit ? road.hitAt : road.stopAt, t), facing: 1 })
    }

    drawRoadFront(ctx, def, f.x0 - 1, f.x1 + 1, t)
    this.flights(ctx, f, 'road')
    this.effects.draw(ctx, 'road', f.dt)
  }

  /** The road's ground from its chunk bakes, drawn scaled to the view on whole device pixels so no seam shows: at the view's own zoom once it has held still for ZOOM_HELD, at the nearest of ROAD_STEPS steps until then. The chunks behind the view are let go, and one ahead is baked in a frame that baked nothing else. */
  private roadGround(f: Frame, def: RoadDef): void {
    const { view } = f
    const ctx = this.ctx
    const b = view.ppm * view.dpr
    const usual = roadZoom(view.w, view.h) * view.dpr
    if (b !== this.drawnZoom) {
      this.drawnZoom = b
      this.zoomFrom = f.t
    }
    const bake = f.t - this.zoomFrom >= ZOOM_HELD ? b : usual * 2 ** (Math.round(Math.log2(b / usual) * ROAD_STEPS) / ROAD_STEPS)
    const scale = b / bake
    const painted = this.cache.painted
    const name = `road|${def.kind}|${def.trip}|${def.seed}|${bake.toFixed(3)}`
    if (name !== this.road) {
      this.cache.drop('road', () => false)
      this.road = name
    }
    const last = Math.floor((def.ground.length - 1) / CHUNK)
    const k0 = Math.max(-1, Math.floor(f.x0 / CHUNK))
    const k1 = Math.min(last, Math.floor(f.x1 / CHUNK))
    this.cache.drop('road', (key) => Number(key.slice(name.length + 1)) >= k0)
    const chunk = (k: number) => {
      let lo = Infinity
      let hi = -Infinity
      for (let x = Math.max(0, k * CHUNK - ROAD_NEAR); x <= Math.min(def.ground.length - 1, (k + 1) * CHUNK + ROAD_NEAR); x++) {
        lo = Math.min(lo, def.ground[x]!)
        hi = Math.max(hi, def.ground[x]!)
      }
      const top = lo - ROAD_ABOVE
      const h = hi + ROAD_BELOW - top
      // Two of the bake's pixels past the chunk's end: drawn a step smaller, it still reaches the next chunk's first whole pixel.
      const canvas = this.cache.get(`${name}|${k}`, 'road', CHUNK * bake + 2, h * bake, (c) => {
        c.setTransform(bake, 0, 0, bake, -k * CHUNK * bake, -top * bake)
        c.beginPath()
        c.rect(k * CHUNK, top, CHUNK + 2 / bake, h)
        c.clip()
        drawRoadGround(c, def, k * CHUNK - 1, (k + 1) * CHUNK + 1, 0)
      })
      return { canvas, top }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let k = k0; k <= k1; k++) {
      const { canvas, top } = chunk(k)
      ctx.drawImage(canvas, Math.round((k * CHUNK - view.x0) * b), Math.round((top - view.y0) * b), canvas.width * scale, canvas.height * scale)
    }
    if (k1 + 1 <= last && this.cache.painted === painted && this.cache.find(`${name}|${k1 + 1}`) === null) chunk(k1 + 1)
  }

  // -------------------------------------------------------------------------------------
  // Shared by both worlds

  /** The world transform: metres to device pixels through the view. */
  private toWorld(g: CanvasRenderingContext2D, view: View): void {
    const k = view.ppm * view.dpr
    g.setTransform(k, 0, 0, k, -view.x0 * k, -view.y0 * k)
  }

  /** The hint's hop: how far up the thing `hit` is drawn now, 0 unless it is the one next step. */
  private hop(s: State, t: number, hit: Hit): number {
    if (s.hint === null || !same(s.hint, hit)) return 0
    const u = (loop(t, HINT_EVERY, 0) * HINT_EVERY) / HINT_UP
    return u < 1 ? -HINT_HOP * arch(u) : 0
  }

  /** Seconds into the builder's pose (their loop from the sim's start before any pose was set). */
  private poseTime(s: State, t: number): number {
    return s.builder.poseAt < 0 ? t : age(s.builder.poseAt, t)
  }

  /**
   * Where the builder is drawn on the street, or null in a room (drawn with it) or the truck
   * (drawn in it). A dash is the rules' to decide (they start its pose on arrival, after
   * movedAt): it runs from fromX over DASH, a hop on the way up to a scaffold. Any other
   * move is a pop, drawn where the builder now is from its first frame.
   */
  private stance(s: State, t: number): Stance | null {
    const b = s.builder
    const at = b.at
    if (at.kind === 'room' || at.kind === 'truck') return null
    const to = at.kind === 'mirror' ? { x: MIRROR_BUILDER_X, y: 0 } : at.kind === 'street' ? { x: at.x, y: 0 } : at.kind === 'machine' ? { x: machineSpot(at.m), y: 0 } : { x: at.x, y: at.y }
    const moved = since(b.movedAt, t)
    const dashing = b.poseAt > b.movedAt && moved < DASH && Math.abs(to.x - b.fromX) > 0.3
    if (!dashing) return { x: to.x, y: to.y, pose: b.pose, u: this.poseTime(s, t), facing: b.facing }
    const k = smooth(0, DASH, moved)
    return { x: mix(b.fromX, to.x, k), y: mix(0, to.y, k) - (to.y < 0 ? SCAFFOLD_HOP * arch(k) : 0), pose: 'run', u: Math.max(0, moved), facing: to.x > b.fromX ? 1 : -1 }
  }

  private builder(g: CanvasRenderingContext2D, s: State, b: Stance): void {
    g.save()
    g.translate(b.x, b.y)
    g.scale(b.facing, 1)
    drawBuilder(g, s.keep.look, b.pose, b.u)
    g.restore()
  }

  /** The goods in the air in `world`, each on an arc from where it left to where it lands. */
  private flights(g: CanvasRenderingContext2D, f: Frame, world: World): void {
    const { s, t } = f
    for (const fl of s.flights) {
      const start = fl.at * STEP
      const end = (fl.at + fl.dur) * STEP
      if (t < start || t >= end || flightWorld(s, fl) !== world) continue
      const a = placePoint(s, fl.from)
      const b = placePoint(s, fl.to)
      const u0 = (t - start) / (end - start)
      for (let i = Math.min(fl.n, FLIGHT_SHOWN) - 1; i >= 0; i--) {
        const at = arcAt(a, b, Math.max(0, u0 - i * FLIGHT_TRAIL))
        g.save()
        g.translate(at.x, at.y)
        drawGood(g, fl.good, t)
        g.restore()
      }
    }
  }

  /** The wipe: the old world (the snapshot) closing to a circle on the truck, then the new world opening from its truck, the circle's centre kept on the canvas (WIPE_IN). */
  private drawWipe(f: Frame): void {
    const ctx = this.ctx
    const wipe = this.wipe!
    const u = since(f.s.shotAt, f.t)
    if (u >= WIPE_CLOSE + WIPE_OPEN) {
      this.wipe = null
      this.cache.drop('wipe', () => false)
      return
    }
    const closing = u < WIPE_CLOSE
    const truck = closing ? wipe : this.focus
    if (closing && wipe.snap) ctx.drawImage(this.cache.find('wipe')!, 0, 0)
    const W = this.width
    const H = this.height
    const at = { x: Math.min(Math.max(truck.x, WIPE_IN * W), (1 - WIPE_IN) * W), y: Math.min(Math.max(truck.y, WIPE_IN * H), (1 - WIPE_IN) * H) }
    const full = Math.hypot(Math.max(at.x, W - at.x), Math.max(at.y, H - at.y))
    const r = full * (closing ? (wipe.snap ? 1 - smooth(0, WIPE_CLOSE, u) : 0) : smooth(WIPE_CLOSE, WIPE_CLOSE + WIPE_OPEN, u))
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(at.x, at.y, Math.max(0, r), 0, TAU)
    ctx.fillStyle = INK
    ctx.fill('evenodd')
  }

  /** ?debug: every hit target and the shot's rect in world units, the HUD's insets, and a line of numbers (the one text drawn on the canvas, look.ts rule 12). */
  private overlay(f: Frame): void {
    const { s, view } = f
    const ctx = this.ctx
    this.toWorld(ctx, view)
    ctx.lineWidth = 2 / view.ppm
    ctx.strokeStyle = DEBUG.target
    for (const x of targets(s)) ctx.strokeRect(x.rect.x, x.rect.y, x.rect.w, x.rect.h)
    const r = shownRect(s, s.shot, view.w, view.h, f.t).r
    ctx.setLineDash(SHOT_DASH)
    ctx.strokeStyle = DEBUG.shot
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.setLineDash(NO_DASH)
    const k = view.dpr
    ctx.setTransform(k, 0, 0, k, 0, 0)
    const ins = insets(s.shot, view.w, view.h)
    ctx.fillStyle = DEBUG.inset
    ctx.fillRect(0, 0, view.w, ins.top)
    ctx.fillRect(0, view.h - ins.bottom, view.w, ins.bottom)
    ctx.fillRect(0, ins.top, ins.left, view.h - ins.top - ins.bottom)
    ctx.fillRect(view.w - ins.right, ins.top, ins.right, view.h - ins.top - ins.bottom)
    const text = `fps ${(1 / this.frameTime).toFixed(0)}  ${s.shot.kind}  ${view.ppm.toFixed(1)} px/m  dpr ${view.dpr.toFixed(2)}  bakes ${this.cache.count} held, ${(this.cache.pixels / 1e6).toFixed(1)}M px, ${this.cache.painted} painted  particles ${this.effects.alive}`
    ctx.font = '600 13px ui-monospace, monospace'
    ctx.textBaseline = 'top'
    ctx.fillStyle = DEBUG.panel
    ctx.fillRect(8, DEBUG_Y, ctx.measureText(text).width + 12, 21)
    ctx.fillStyle = DEBUG.text
    ctx.fillText(text, 14, DEBUG_Y + 4)
  }
}
