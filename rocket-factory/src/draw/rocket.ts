import { COUNT_AT, LAUNCH_FOR, PART_INFO } from '../game/catalog'
import { PARTS, STEP, type PartId } from '../game/model'
import type { Box, Point } from '../game/where'
import { drawBeep, type BeepPicture } from './beep'
import { drawMoony } from './critters'
import {
  BEEP,
  C,
  LAND,
  ROCKET,
  SKY,
  MOONY,
  THING,
  TAU,
  addCircle,
  addRoundPoly,
  addRoundRect,
  arch,
  clamp01,
  dieCut,
  eyes,
  fill,
  groundShadow,
  heldAge,
  loop,
  mix,
  pen,
  phaseOf,
  rim,
  roundStroke,
  scaled,
  shine,
  smile,
  smooth,
  sparklePath,
  spread,
  tipped,
  type SheetEntry,
} from './look'
import { drawStillThing } from './things'

/**
 * The rocket (plans/rocket-factory.md, The rocket): a side-view sticker lying on its pad in
 * four parts, the coral legs (its fins), the cream body with Beep's window, the coral nose and
 * the engine's nozzle. A part not yet built is a dotted outline, grey until its card opens it;
 * an open part fills from the bottom like a jar with the colour of the thing it takes, over a
 * faint picture of that thing, and pops on in its own colours with a burst of sparkles when it
 * is full. With the engine full and Fuel! found, a big launch button bounces beside it.
 *
 * The launch (drawLaunch, about 40 s): the rocket swings up to stand, Beep in its window, big
 * number stickers count down from 5 (each with that many dots), it lifts slowly on rainbow
 * puffs and never toward her, the board slides down (launchSlide) into a night sky of bands
 * and stars, the moon comes into view and the rocket settles on it. Beep hops out with the
 * flag, plants it beside the flags of the flights before and pats it; Moony peeks up out of
 * its crater and the two wave across the rocket; Beep hops over and the two fly up into the
 * window, both faces in it; then the sky slides away and the board comes home. After a
 * landing the same rocket waits on the pad again, its parts open and empty, to fill and fly
 * again.
 *
 * Units are cells. The rocket's own frame lies along +x from its engine's end (0, 0) to its
 * nose's tip (LENGTH, 0); drawRocket lays it on the pad, the launch stands it up.
 */

// ---------------------------------------------------------------------------------------
// The rocket's parts

/** One part of the rocket as a picture: open (its card found, or open from the start), how full (0 to 1), seconds since it filled (the pop; Infinity while not full). */
export interface PartPic {
  open: boolean
  fill: number
  fullAge: number
}
/** The rocket on the pad: its parts in PARTS order, and whether the launch waits for her tap (the button bounces). */
export interface RocketPic {
  parts: readonly PartPic[]
  ready: boolean
}

/** From the engine's end to the nose's tip, cells. */
const LENGTH = 2.56
/** Each part's shape in the rocket's frame: the nozzle, the body (and its window), the nose's ogive, and the legs (two swept fins, each with a round foot). Every piece is wound clockwise. */
const NOZZLE = [0, -0.3, 0.44, -0.2, 0.44, 0.2, 0, 0.3] as const
const BODY = [0.38, -0.4, 1.54, 0.8, 0.16] as const
const NOSE = { x: 1.88, h: 0.4 } as const
const FINS = [
  [0.24, -0.82, 0.52, -0.76, 1.1, -0.36, 0.42, -0.36],
  [0.42, 0.36, 1.1, 0.36, 0.52, 0.76, 0.24, 0.82],
] as const
const FEET = [0.27, -0.84, 0.27, 0.84] as const
const FOOT = 0.075
const WINDOW = { x: 1.52, y: 0, r: 0.2 } as const
/** Each part's box in the rocket's frame (a jar fills from its bottom to its top), and where its thing's faint picture sits while it waits. */
const PART_BOX: Record<PartId, { y0: number; y1: number; pic: Point }> = {
  legs: { y0: -0.92, y1: 0.92, pic: { x: 0.6, y: 0.6 } },
  body: { y0: -0.4, y1: 0.4, pic: { x: 1.05, y: 0 } },
  nose: { y0: -0.4, y1: 0.4, pic: { x: 2.12, y: 0 } },
  engine: { y0: -0.3, y1: 0.3, pic: { x: 0.2, y: 0 } },
}
/** The order the parts are drawn in, back to front: the fins behind the body, the nozzle under its end. */
const DRAW_ORDER: readonly PartId[] = ['legs', 'engine', 'body', 'nose']
/** Where the rocket lies on its pad: the engine's end, from the pad's top-left. */
const LYING = { x: 0.22, y: 1.5 } as const
/** The lying rocket's box on its pad, for the HUD's rocket card. */
export const ROCKET_BOX: Box = { x: 0.1, y: 0.52, w: 2.84, h: 1.98 }
/** The launch button beside the nose, in the pad's picture (cells from its top-left; the hint's hand taps it there), and how long a part's pop lasts. */
export const LAUNCH_BUTTON = { x: 2.32, y: 2.44, r: 0.3 } as const
const POP = 0.5

/** A part's pieces as part of the current path. */
function addPart(ctx: CanvasRenderingContext2D, part: PartId) {
  switch (part) {
    case 'engine':
      addRoundPoly(ctx, NOZZLE, 0.05)
      return
    case 'body':
      addRoundRect(ctx, ...BODY)
      return
    case 'nose':
      ctx.moveTo(NOSE.x, -NOSE.h)
      ctx.bezierCurveTo(NOSE.x + 0.34, -NOSE.h, LENGTH - 0.1, -0.18, LENGTH, 0)
      ctx.bezierCurveTo(LENGTH - 0.1, 0.18, NOSE.x + 0.34, NOSE.h, NOSE.x, NOSE.h)
      ctx.closePath()
      return
    case 'legs':
      for (const fin of FINS) addRoundPoly(ctx, fin, 0.06)
      for (let i = 0; i < FEET.length; i += 2) addCircle(ctx, FEET[i]!, FEET[i + 1]!, FOOT)
      return
  }
}
const partPath = (ctx: CanvasRenderingContext2D, part: PartId) => {
  ctx.beginPath()
  addPart(ctx, part)
}

/** The white die-cut rim round the current path, the caller's joins put back. */
function rimPath(ctx: CanvasRenderingContext2D) {
  const join = ctx.lineJoin
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2 * rim()
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.lineJoin = join
}

/** A built part in its own colours, over the rim the caller cut: coral fins with darker feet, a cream body with a light stripe and a fold under it, the coral nose with a lighter cheek, the nozzle. */
function paintPart(ctx: CanvasRenderingContext2D, part: PartId) {
  partPath(ctx, part)
  switch (part) {
    case 'legs': {
      fill(ctx, ROCKET.fin)
      ctx.beginPath()
      for (let i = 0; i < FEET.length; i += 2) addCircle(ctx, FEET[i]!, FEET[i + 1]!, FOOT)
      fill(ctx, BEEP.fold)
      return
    }
    case 'engine':
      fill(ctx, ROCKET.fold)
      ctx.beginPath()
      addRoundRect(ctx, 0.08, -0.26, 0.1, 0.52, 0.05)
      fill(ctx, ROCKET.body)
      return
    case 'body':
      fill(ctx, ROCKET.body)
      ctx.save()
      partPath(ctx, part)
      ctx.clip()
      ctx.beginPath()
      ctx.rect(BODY[0], BODY[1] + BODY[3] - 0.16, BODY[2], 0.16)
      fill(ctx, ROCKET.fold)
      ctx.beginPath()
      addRoundRect(ctx, BODY[0] + 0.14, BODY[1] + 0.12, BODY[2] - 0.5, 0.1, 0.05)
      fill(ctx, ROCKET.light)
      ctx.restore()
      return
    case 'nose':
      fill(ctx, ROCKET.fin)
      ctx.beginPath()
      ctx.ellipse(NOSE.x + 0.26, -0.18, 0.2, 0.07, -0.12, 0, TAU)
      fill(ctx, BEEP.light)
      return
  }
}

/** Who the window shows during the launch: Beep's eyes' mood, the rocket's turn (the faces turn back so they stay upright), how far Beep's face has popped in, and Moony's beside it on the way home (0 to 1 each). */
interface Rider {
  mood: 'open' | 'happy' | 'wide'
  turn: number
  k: number
  moony: number
}

/** Beep in the rocket's window at (x, 0) of the window, already turned upright: its coral head and cream face plate, two dot eyes and a smile. */
function drawBeepFace(ctx: CanvasRenderingContext2D, mood: 'open' | 'happy' | 'wide', x: number, k: number) {
  ctx.save()
  ctx.translate(x, 0)
  ctx.scale(k, k)
  ctx.beginPath()
  addCircle(ctx, 0, 0.05, 0.17)
  fill(ctx, BEEP.body)
  ctx.beginPath()
  ctx.ellipse(0, -0.14, 0.07, 0.03, 0, 0, TAU)
  fill(ctx, BEEP.prop)
  ctx.beginPath()
  addRoundRect(ctx, -0.12, -0.04, 0.24, 0.16, 0.07)
  fill(ctx, BEEP.plate)
  eyes(ctx, 0, 0.02, 0.045, 0.1, mood, BEEP.plate)
  smile(ctx, 0, 0.07, 0.07, mood !== 'open')
  ctx.restore()
}

/** Moony in the window beside Beep on the way home, at (x, 0) of the window, already turned upright: its round pale face with a crater, happy eyes and a smile. */
function drawMoonyFace(ctx: CanvasRenderingContext2D, x: number, k: number) {
  ctx.save()
  ctx.translate(x, 0)
  ctx.scale(k, k)
  ctx.beginPath()
  addCircle(ctx, 0, 0.04, 0.14)
  fill(ctx, MOONY.body)
  ctx.beginPath()
  addCircle(ctx, -0.07, -0.04, 0.025)
  fill(ctx, MOONY.fold)
  eyes(ctx, 0.01, 0.03, 0.04, 0.08, 'happy', MOONY.body)
  smile(ctx, 0.01, 0.08, 0.06, false)
  ctx.restore()
}

/** The window on a built body: its frame, its glass (during the launch Beep's face behind it, and Moony's beside it on the way home), its shine. */
function drawWindow(ctx: CanvasRenderingContext2D, riders: Rider | null) {
  ctx.beginPath()
  addCircle(ctx, WINDOW.x, WINDOW.y, WINDOW.r + 0.05)
  fill(ctx, ROCKET.fold)
  ctx.beginPath()
  addCircle(ctx, WINDOW.x, WINDOW.y, WINDOW.r)
  fill(ctx, ROCKET.window)
  if (riders !== null && (riders.k > 0.01 || riders.moony > 0.01)) {
    ctx.save()
    ctx.beginPath()
    addCircle(ctx, WINDOW.x, WINDOW.y, WINDOW.r)
    ctx.clip()
    ctx.translate(WINDOW.x, WINDOW.y)
    ctx.rotate(-riders.turn)
    // Two faces share the window: Beep's moves over to make room for Moony's.
    const share = smooth(0, 1, riders.moony)
    if (riders.moony > 0.01) drawMoonyFace(ctx, 0.1, riders.moony)
    if (riders.k > 0.01) drawBeepFace(ctx, riders.mood, -0.07 * share, riders.k * (1 - 0.2 * share))
    ctx.restore()
  }
  shine(ctx, WINDOW.x, WINDOW.y, WINDOW.r)
}

/** The whole rocket built, in its own frame: one die-cut round every part, then each in its colours and the window (with Beep in it during the launch). */
function drawBuilt(ctx: CanvasRenderingContext2D, beep: Rider | null) {
  dieCut(
    ctx,
    () => {
      ctx.beginPath()
      for (const part of DRAW_ORDER) addPart(ctx, part)
    },
    0,
  )
  for (const part of DRAW_ORDER) paintPart(ctx, part)
  drawWindow(ctx, beep)
}

/** The rocket standing, every part built, `size` tall and centred on the origin: the pad's recipe bubble shows it. */
export function drawLittleRocket(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save()
  ctx.translate(0, size / 2)
  scaled(ctx, size / LENGTH, () => tipped(ctx, -Math.PI / 2, 1, 1, () => drawBuilt(ctx, null)))
  ctx.restore()
}

/** The rocket's nose alone, standing with its tip up, `size` across and centred on the origin: Nose!'s card. */
export function drawLittleNose(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save()
  scaled(ctx, size / (2 * NOSE.h), () =>
    tipped(ctx, -Math.PI / 2, 1, 1, () => {
      ctx.translate(-(NOSE.x + LENGTH) / 2, 0)
      dieCut(ctx, () => partPath(ctx, 'nose'), 0)
      paintPart(ctx, 'nose')
    }),
  )
  ctx.restore()
}

/** A part not built yet: its outline in dots, grey while it is closed and in its thing's colour once open. */
function drawDots(ctx: CanvasRenderingContext2D, part: PartId, colour: string) {
  ctx.save()
  partPath(ctx, part)
  ctx.setLineDash([0.001, 0.1])
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.06
  ctx.strokeStyle = colour
  ctx.stroke()
  ctx.restore()
}

/** An open part filling like a jar: a faint picture of its thing, then its thing's colour from the bottom up to `fill`, a lighter band on top that sways a little. */
function drawJar(ctx: CanvasRenderingContext2D, part: PartId, full: number, t: number) {
  const thing = PART_INFO[part].thing
  const box = PART_BOX[part]
  if (full < 1) {
    const was = ctx.globalAlpha
    ctx.globalAlpha = was * 0.4
    ctx.save()
    ctx.translate(box.pic.x, box.pic.y)
    drawStillThing(ctx, thing, 0.3, t, PARTS.indexOf(part))
    ctx.restore()
    ctx.globalAlpha = was
  }
  if (full <= 0) return
  const level = mix(box.y1, box.y0, clamp01(full))
  const sway = 0.015 * Math.sin(TAU * loop(t, 2.2, phaseOf(part)))
  ctx.save()
  partPath(ctx, part)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-0.2, level + sway)
  ctx.lineTo(LENGTH + 0.2, level - sway)
  ctx.lineTo(LENGTH + 0.2, box.y1 + 0.2)
  ctx.lineTo(-0.2, box.y1 + 0.2)
  ctx.closePath()
  fill(ctx, THING[thing].key)
  ctx.beginPath()
  ctx.moveTo(-0.2, level + sway)
  ctx.lineTo(LENGTH + 0.2, level - sway)
  ctx.lineTo(LENGTH + 0.2, level - sway + 0.05)
  ctx.lineTo(-0.2, level + sway + 0.05)
  ctx.closePath()
  fill(ctx, THING[thing].light)
  ctx.restore()
}

/** The middle of a part's box, which it pops about. */
const partMiddle = (part: PartId): Point => (part === 'legs' ? { x: 0.62, y: 0 } : part === 'engine' ? { x: 0.22, y: 0 } : part === 'body' ? { x: 1.15, y: 0 } : { x: 2.18, y: 0 })

/** The sparkles of a part popping on, `u` 0 to 1 through its pop: six of them flying out from its middle, mostly up and down so they stay on the pad, and shrinking away, in the confetti's colours. */
function drawPopSparkles(ctx: CanvasRenderingContext2D, part: PartId, u: number) {
  const m = partMiddle(part)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4
    const d = 0.3 + 0.45 * u
    const s = 0.2 * (1 - u)
    if (s < 0.01) continue
    sparklePath(ctx, m.x + Math.cos(a) * d * 0.45, m.y + Math.sin(a) * d * 0.9, s)
    fill(ctx, C.confetti[i % 6]!)
  }
}

/** The launch button: a coral round button with a white rocket-up arrow, bouncing like the hint (0.2 cell on a 0.8 s period over a soft white ring, its shadow shrinking). */
function drawButton(ctx: CanvasRenderingContext2D, t: number) {
  const { x, y, r } = LAUNCH_BUTTON
  const up = 0.2 * arch(loop(t, 0.8, 0))
  ctx.save()
  ctx.translate(x, y + r * 0.92)
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.2, r * 0.36, 0, 0, TAU)
  const was = ctx.globalAlpha
  ctx.globalAlpha = was * 0.7
  ctx.lineWidth = 0.05
  ctx.strokeStyle = C.hint
  ctx.stroke()
  ctx.globalAlpha = was
  groundShadow(ctx, r * 1.8, up)
  ctx.restore()
  ctx.save()
  ctx.translate(x, y - up)
  ctx.beginPath()
  addCircle(ctx, 0, 0, r)
  rimPath(ctx)
  fill(ctx, ROCKET.fin)
  ctx.beginPath()
  addCircle(ctx, -r * 0.12, -r * 0.14, r * 0.7)
  fill(ctx, BEEP.light)
  ctx.beginPath()
  addRoundPoly(ctx, [0, -r * 0.55, r * 0.42, -r * 0.05, r * 0.16, -r * 0.05, r * 0.16, r * 0.5, -r * 0.16, r * 0.5, -r * 0.16, -r * 0.05, -r * 0.42, -r * 0.05], 0.03)
  fill(ctx, C.white)
  ctx.restore()
}

/** The rocket lying on its pad at sim time t, origin the pad's top-left: every part built, filling or dotted as `pic` says, and the launch button when it waits for her. */
export function drawRocket(ctx: CanvasRenderingContext2D, pic: RocketPic, t: number): void {
  if (pic.parts.length !== PARTS.length) throw new Error(`the rocket has ${PARTS.length} parts, not ${pic.parts.length}`)
  const state = (part: PartId) => pic.parts[PARTS.indexOf(part)]!
  const built = (part: PartId) => state(part).fill >= 1
  const popping = (part: PartId) => built(part) && heldAge(state(part).fullAge) < POP
  ctx.save()
  ctx.translate(LYING.x, LYING.y)
  // One die-cut round the parts built and settled; a part popping on is cut on its own as it pops.
  const settled = DRAW_ORDER.filter((p) => built(p) && !popping(p))
  if (settled.length > 0)
    dieCut(
      ctx,
      () => {
        ctx.beginPath()
        for (const part of settled) addPart(ctx, part)
      },
      0,
    )
  for (const part of DRAW_ORDER) {
    const s = state(part)
    if (popping(part)) {
      const u = heldAge(s.fullAge) / POP
      const k = 1 + 0.2 * arch(u)
      const m = partMiddle(part)
      ctx.save()
      ctx.translate(m.x, m.y)
      ctx.scale(k, k)
      ctx.translate(-m.x, -m.y)
      dieCut(ctx, () => partPath(ctx, part), 0)
      paintPart(ctx, part)
      if (part === 'body') drawWindow(ctx, null)
      ctx.restore()
    } else if (built(part)) {
      paintPart(ctx, part)
      if (part === 'body') drawWindow(ctx, null)
    } else if (s.open) {
      drawJar(ctx, part, s.fill, t)
      drawDots(ctx, part, THING[PART_INFO[part].thing].fold)
    } else drawDots(ctx, part, ROCKET.dots)
  }
  for (const part of DRAW_ORDER) if (popping(part)) drawPopSparkles(ctx, part, heldAge(state(part).fullAge) / POP)
  ctx.restore()
  if (pic.ready) drawButton(ctx, t)
}

// ---------------------------------------------------------------------------------------
// The launch

/** The launch as a picture: seconds since her tap on the launch button (0 to LAUNCH_FOR), what is on screen (in cells, upright as she sees it: the land and the table round it, turned with the board when the iPad stands upright), where the pad's top-left is in that frame, which side of the pad the countdown's number stickers stand on (-1 left, 1 right: away from the munchers watching), and how many flights have landed before this one (each left its flag on the moon). */
export interface LaunchPic {
  age: number
  view: Box
  pad: Point
  side: -1 | 1
  flags: number
  /** Seconds since her tap on the rocket popped the countdown's number (State.popAt), Infinity for none: the number bounces up a little and back. */
  pop: number
}

/**
 * The launch's moments, seconds after the tap, for the renderer and the sounds: the rocket
 * stands up; Beep is in the window; the countdown from 5, one a second; liftoff; the camera
 * climbs (the board slides away) to the moon; the rocket settles on it; Beep hops out with the
 * flag; plants it and pats it; Moony peeks up out of its crater and the two wave; Beep hops
 * over to Moony; the two fly up into the window; the sky slides away home; the end.
 */
export const LAUNCH_AT = {
  stand: [0.2, 1.4],
  beep: 1.1,
  count: COUNT_AT * STEP,
  lift: COUNT_AT * STEP + 5,
  climb: [COUNT_AT * STEP + 6.5, 21],
  settle: [21.2, 23.6],
  out: [23.6, 24.2],
  flag: 24.4,
  moony: 25.6,
  fetch: [27.3, 28.1],
  aboard: [28.3, 29],
  home: [30, 35.5],
  end: LAUNCH_FOR * STEP,
} as const
/** Beep's and Moony's sizes on the moon, times their sizes on the board: Beep about the rocket's body across, Moony a little bigger, so both read at the sky's distance; and in the window's door, where they go in. */
const MOON_BEEP = 1.1
const MOON_MOONY = 1.6
const DOOR_SIZE = 0.4
/**
 * Where things stand on the moon, cells along it from its middle (the rocket's foot): Beep
 * beside the right fin as it plants the new flag, the flag, Moony's crater on the left and
 * Beep beside it to fetch it, and the little flags of the flights before, outward in turn
 * (as many as the moon's width holds). The rocket's fins reach 0.84 either way.
 */
const ON_MOON = { plant: 1.3, flag: 1.85, moony: -1.85, fetch: -1.2, flags: [2.6, -2.75, 3.1, -3.25, 3.6, -3.75] } as const
/** A flight before's flag is this size of the new one. */
const LITTLE_FLAG = 0.55
/** Beep's feet below the window's middle as it goes in and comes out, cells (the window's bottom edge). */
const SILL = 0.16
/** A countdown number sticker is at least this many CSS px across; her tap on the rocket pops it a quarter bigger and back over NUMBER_POP seconds. */
const NUMBER_PX = 72
const NUMBER_POP = 0.3
/** Up from the pad, the rocket holds this far down the screen (its engine's end) while the sky streams by. */
const HOLD_AT = 0.44
/** The camera climbs this many screens to the moon. */
const CLIMB = 3
/** The puffs: one every PUFF_EVERY while the engine fires, each living PUFF_LIFE. */
const PUFF_EVERY = 0.13
const PUFF_LIFE = 1.4
const FIRING = [
  [LAUNCH_AT.lift, LAUNCH_AT.lift + 6],
  [LAUNCH_AT.settle[0], LAUNCH_AT.settle[1] + 0.2],
] as const

/** How far up the camera has climbed, in screens: the board slides down out of view over the first, the stars stream by over the rest, and it comes home at the end. */
const climbed = (age: number) => (age < LAUNCH_AT.home[0] ? CLIMB * smooth(LAUNCH_AT.climb[0], LAUNCH_AT.climb[1], age) : CLIMB * (1 - smooth(LAUNCH_AT.home[0], LAUNCH_AT.home[1], age)))
/** How far the board has slid down, 0 to 1 of the view's height, `age` seconds after the tap: the renderer draws the board (and the table round it) that far down and the launch over it. */
export const launchSlide = (age: number) => Math.min(1, climbed(heldAge(age)))
/** Whether Beep is away with the rocket `age` seconds after the tap (in its window, or out on the moon planting the flag and fetching Moony): the renderer draws no Beep on the board then (after it, Beep is home with Moony as the board comes back). */
export const beepAway = (age: number) => age >= LAUNCH_AT.beep && age < LAUNCH_AT.home[0]

/**
 * Beep out on the moon `age` seconds after the tap, or null while it is in the window: its
 * feet along the moon from its middle (dx) and up off the surface there, its size, its picture,
 * and whether it holds the flag. It hops out of the window over the right fin with the flag,
 * plants it and pats it, turns to wave to Moony across the rocket, hops over to it, and the two
 * fly up into the window, shrinking into its door.
 */
function moonBeep(age: number): { dx: number; up: number; k: number; pic: BeepPicture; flag: boolean } | null {
  const at = LAUNCH_AT
  const door = WINDOW.x - SILL
  const still = (pose: BeepPicture['pose'], from: number, facing: -1 | 1): BeepPicture => ({ pose, age: age - from, flight: 1, carrying: null, facing })
  if (age < at.out[0] || age >= at.aboard[1]) return null
  if (age < at.out[1]) {
    const u = smooth(at.out[0], at.out[1], age)
    return { dx: ON_MOON.plant * u, up: mix(door, 0, u) + 0.7 * arch(u), k: mix(DOOR_SIZE, MOON_BEEP, smooth(0, 0.5, u)), pic: { ...still('float', at.out[0], 1), flight: u }, flag: true }
  }
  if (age < at.flag) return { dx: ON_MOON.plant, up: 0, k: MOON_BEEP, pic: still('float', at.out[1], 1), flag: true }
  if (age < at.moony) return { dx: ON_MOON.plant, up: 0, k: MOON_BEEP, pic: still('pat', at.flag, 1), flag: false }
  if (age < at.fetch[0]) return { dx: ON_MOON.plant, up: 0, k: MOON_BEEP, pic: still('wave', at.moony, -1), flag: false }
  if (age < at.fetch[1]) {
    const u = smooth(at.fetch[0], at.fetch[1], age)
    return { dx: mix(ON_MOON.plant, ON_MOON.fetch, u), up: 0.5 * arch(u), k: MOON_BEEP, pic: { ...still('float', at.fetch[0], -1), flight: u }, flag: false }
  }
  if (age < at.aboard[0]) return { dx: ON_MOON.fetch, up: 0, k: MOON_BEEP, pic: still('carry', at.fetch[1], -1), flag: false }
  const u = smooth(at.aboard[0], at.aboard[1], age)
  return { dx: mix(ON_MOON.fetch, 0, u), up: mix(0, door, u) + 0.4 * arch(u), k: mix(MOON_BEEP, DOOR_SIZE, u), pic: still('carry', at.fetch[1], -1), flag: false }
}

/** Moony on the moon `age` seconds after the tap, or null before it peeks up and once it is in the window: its feet along the moon (dx) and up off the surface, its size, and how far it has risen out of its crater (0 to 1). On the way to the window it rides at Beep's side. */
function moonMoony(age: number, beep: { dx: number; up: number; k: number } | null): { dx: number; up: number; k: number; rise: number } | null {
  const at = LAUNCH_AT
  if (age < at.moony || age >= at.aboard[1]) return null
  if (age < at.aboard[0]) return { dx: ON_MOON.moony, up: 0, k: MOON_MOONY, rise: smooth(at.moony, at.moony + 0.5, age) }
  if (beep === null) throw new Error('Moony flies up into the window at Beep\'s side, and Beep is out on the moon then')
  const u = smooth(at.aboard[0], at.aboard[1], age)
  return { dx: mix(ON_MOON.moony, beep.dx - 0.5 * beep.k, smooth(0, 0.4, u)), up: beep.up, k: mix(MOON_MOONY, DOOR_SIZE, u), rise: 1 }
}

/** The moon on screen while the camera is up: its middle and radius. */
function moon(view: Box): { x: number; y: number; r: number } {
  const r = Math.min(0.34 * view.h, 0.4 * view.w)
  return { x: view.x + view.w / 2, y: view.y + 0.9 * view.h + 0.3 * r, r }
}

/** Where the rocket is on screen `age` seconds after the tap: its engine's end, and its turn (0 lying on its side as on the pad, -pi/2 standing). */
function rocketAt(pic: LaunchPic, age: number): { x: number; y: number; turn: number } {
  const { view, pad } = pic
  const lie = { x: pad.x + LYING.x, y: pad.y + LYING.y }
  const stand = { x: pad.x + 1.5, y: pad.y + 2.62 }
  if (age < LAUNCH_AT.stand[1]) {
    // Swinging up to stand about its middle, so it never leaves its pad: a little past upright and back (an ease out with an overshoot).
    const u = clamp01((age - LAUNCH_AT.stand[0]) / (LAUNCH_AT.stand[1] - LAUNCH_AT.stand[0]))
    const turn = (-Math.PI / 2) * (1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2)
    const half = LENGTH / 2
    const mx = mix(lie.x + half, stand.x, smooth(0, 1, u))
    const my = mix(lie.y, stand.y - half, smooth(0, 1, u))
    return { x: mx - Math.cos(turn) * half, y: my - Math.sin(turn) * half, turn }
  }
  if (age < LAUNCH_AT.lift) {
    // Standing for the countdown, trembling a little at its end.
    const shiver = 0.012 * Math.sin(TAU * 9 * age) * smooth(LAUNCH_AT.lift - 2, LAUNCH_AT.lift - 0.5, age)
    return { x: stand.x + shiver, y: stand.y, turn: -Math.PI / 2 }
  }
  const m = moon(view)
  const top = m.y - m.r
  const held = { x: view.x + view.w / 2, y: view.y + HOLD_AT * view.h }
  const sway = 0.03 * Math.sin((TAU * age) / 3) * smooth(LAUNCH_AT.lift + 4, LAUNCH_AT.lift + 6, age) * (1 - smooth(LAUNCH_AT.settle[0], LAUNCH_AT.settle[1], age))
  if (age < LAUNCH_AT.settle[0]) {
    // Up from the pad slowly, then holding high on screen while the camera climbs with it.
    const u = smooth(LAUNCH_AT.lift, LAUNCH_AT.lift + 5, age)
    const k = u * u
    return { x: mix(stand.x, held.x, smooth(LAUNCH_AT.lift + 1, LAUNCH_AT.lift + 5, age)), y: mix(stand.y, held.y, k), turn: -Math.PI / 2 + sway }
  }
  // Settling onto the moon, then riding on it as the sky slides away home.
  const u = smooth(LAUNCH_AT.settle[0], LAUNCH_AT.settle[1], age)
  const home = (climbed(age) - CLIMB) * view.h
  return { x: held.x, y: mix(held.y, top, u) + home, turn: -Math.PI / 2 + sway }
}

/** The stars of the night sky, in screens above the view's top (x across it, 0 to 1), their sizes from tip to tip, and their twinkles' phases: fixed. */
const STARS = Array.from({ length: 64 }, (_, i) => ({ x: spread(i, 0.7548776662), up: 0.08 + spread(i, 0.5698402910) * (CLIMB + 0.6), size: 0.16 + 0.3 * spread(i, 0.381966), phase: spread(i, 0.618034) }))

/** A countdown number sticker: a white rounded square with the numeral in coral and that many dots under it, `r` its half width. Numerals are paths, never text. */
function drawNumber(ctx: CanvasRenderingContext2D, n: number, r: number) {
  dieCut(
    ctx,
    () => {
      ctx.beginPath()
      addRoundRect(ctx, -r, -r, 2 * r, 2 * r, r * 0.38)
    },
    0,
  )
  // The numeral in a box 0.62 r wide and r tall above the middle.
  const w = 0.62 * r
  const h = 1.0 * r
  const x0 = -w / 2
  const y0 = -0.76 * r
  const P = (u: number, v: number): [number, number] => [x0 + u * w, y0 + v * h]
  ctx.beginPath()
  switch (n) {
    case 1:
      ctx.moveTo(...P(0.2, 0.22))
      ctx.lineTo(...P(0.58, 0))
      ctx.lineTo(...P(0.58, 1))
      break
    case 2:
      ctx.moveTo(...P(0.02, 0.26))
      ctx.bezierCurveTo(...P(0.1, -0.06), ...P(1, -0.08), ...P(0.92, 0.32))
      ctx.bezierCurveTo(...P(0.86, 0.56), ...P(0.3, 0.74), ...P(0.02, 1))
      ctx.lineTo(...P(1, 1))
      break
    case 3:
      ctx.moveTo(...P(0.04, 0.12))
      ctx.bezierCurveTo(...P(0.3, -0.06), ...P(1, -0.04), ...P(0.9, 0.24))
      ctx.bezierCurveTo(...P(0.84, 0.42), ...P(0.6, 0.47), ...P(0.4, 0.47))
      ctx.bezierCurveTo(...P(0.7, 0.47), ...P(1, 0.56), ...P(0.96, 0.76))
      ctx.bezierCurveTo(...P(0.9, 1.06), ...P(0.24, 1.08), ...P(0.02, 0.86))
      break
    case 4:
      ctx.moveTo(...P(0.74, 1))
      ctx.lineTo(...P(0.74, 0))
      ctx.lineTo(...P(0, 0.68))
      ctx.lineTo(...P(1, 0.68))
      break
    case 5:
      ctx.moveTo(...P(0.94, 0))
      ctx.lineTo(...P(0.12, 0))
      ctx.lineTo(...P(0.06, 0.44))
      ctx.bezierCurveTo(...P(0.5, 0.3), ...P(1.04, 0.42), ...P(0.98, 0.7))
      ctx.bezierCurveTo(...P(0.92, 1.06), ...P(0.26, 1.08), ...P(0.02, 0.86))
      break
    default:
      throw new Error(`the countdown counts 5 to 1, not ${n}`)
  }
  roundStroke(ctx, 0.2 * r, ROCKET.fin)
  // The dots to count, in the one dark mark.
  ctx.beginPath()
  for (let i = 0; i < n; i++) addCircle(ctx, (i - (n - 1) / 2) * 0.3 * r, 0.62 * r, 0.085 * r)
  fill(ctx, C.face)
}

/** The flag Beep plants: a pole and a coral flag with a cream moon on it, `size` times its height of a cell, its pole's foot at (x, y), growing up out of the ground `age` seconds after it is planted (Infinity: long since). */
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, size: number) {
  const k = clamp01(heldAge(age) / 0.3)
  const grow = k * (1 + 0.15 * arch(k))
  if (grow < 0.01) return
  ctx.save()
  ctx.translate(x, y)
  scaled(ctx, size, () => {
    ctx.scale(1, grow)
    const outline = () => {
      ctx.beginPath()
      addRoundRect(ctx, -0.04, -1.0, 0.08, 1.0, 0.04)
      addRoundRect(ctx, 0.02, -1.0, 0.58, 0.38, 0.06)
    }
    dieCut(ctx, outline, 0)
    ctx.beginPath()
    addRoundRect(ctx, -0.04, -1.0, 0.08, 1.0, 0.04)
    fill(ctx, ROCKET.fold)
    ctx.beginPath()
    addRoundRect(ctx, 0.02, -1.0, 0.58, 0.38, 0.06)
    fill(ctx, ROCKET.fin)
    ctx.beginPath()
    addCircle(ctx, 0.31, -0.81, 0.11)
    fill(ctx, ROCKET.body)
  })
  ctx.restore()
}

/** The night sky over the view, the camera `cam` screens up (the caller clips it to the top the board has left): flat bands darkening upward as it climbs, the stars twinkling slowly, the moon with its craters. */
function drawSky(ctx: CanvasRenderingContext2D, pic: LaunchPic, cam: number, t: number) {
  const { view } = pic
  const h = view.h
  // World heights above the view's top, on screen `cam` screens lower; each band from the top of the screen down to where it ends, the darker over the lighter.
  const sy = (up: number) => view.y - up * h + cam * h
  for (const [up, colour] of [
    [0, SKY.bands[2]],
    [0.45, SKY.bands[1]],
    [1.25, SKY.bands[0]],
  ] as const) {
    const foot = Math.min(view.y + h, sy(up))
    if (foot <= view.y) continue
    ctx.beginPath()
    ctx.rect(view.x, view.y, view.w, foot - view.y)
    fill(ctx, colour)
  }
  ctx.beginPath()
  for (const s of STARS) {
    const y = sy(s.up)
    if (y < view.y - 0.3 || y > view.y + h + 0.3) continue
    const k = 0.8 + 0.2 * Math.sin(TAU * loop(t, 2.6, s.phase))
    const r = (s.size * k) / 2
    const x = view.x + 0.04 * view.w + s.x * 0.92 * view.w
    // A four-point sparkle as part of one path, so the stars are one fill.
    ctx.moveTo(x, y - r)
    ctx.quadraticCurveTo(x + r * 0.22, y - r * 0.22, x + r, y)
    ctx.quadraticCurveTo(x + r * 0.22, y + r * 0.22, x, y + r)
    ctx.quadraticCurveTo(x - r * 0.22, y + r * 0.22, x - r, y)
    ctx.quadraticCurveTo(x - r * 0.22, y - r * 0.22, x, y - r)
    ctx.closePath()
  }
  fill(ctx, SKY.star)
  const m = moon(view)
  const my = m.y + (cam - CLIMB) * h
  if (my - m.r < view.y + h && my + m.r > view.y) {
    ctx.beginPath()
    addCircle(ctx, m.x, my, m.r)
    fill(ctx, SKY.moon)
    ctx.beginPath()
    ctx.ellipse(m.x - m.r * 0.32, my - m.r * 0.5, m.r * 0.28, m.r * 0.12, -0.4, 0, TAU)
    fill(ctx, MOONY.light)
    ctx.beginPath()
    for (const [u, v, rr] of [
      [-0.55, -0.2, 0.12],
      [0.42, -0.42, 0.08],
      [0.18, 0.1, 0.16],
      [-0.2, 0.42, 0.1],
      [0.62, 0.22, 0.07],
    ] as const)
      addCircle(ctx, m.x + u * m.r, my + v * m.r, rr * m.r)
    fill(ctx, MOONY.fold)
  }
}

/** The rainbow puffs the engine leaves while it fires: each where the engine was when it puffed (riding the world as the camera climbs), drifting down and out, growing and then shrinking away, in the confetti's colours. */
function drawPuffs(ctx: CanvasRenderingContext2D, pic: LaunchPic, age: number) {
  const h = pic.view.h
  const cam = climbed(age)
  let i = 0
  for (const [from, to] of FIRING)
    for (let s = from; s < to; s += PUFF_EVERY, i++) {
      if (s > age || age - s > PUFF_LIFE) continue
      const u = (age - s) / PUFF_LIFE
      const at = rocketAt(pic, s)
      const world = { x: at.x, y: at.y + 0.12 - climbed(s) * h }
      const side = (spread(i, 0.618034) - 0.5) * 1.6
      const r = (0.16 + 0.34 * smooth(0, 0.45, u)) * (1 - smooth(0.72, 1, u))
      if (r < 0.01) continue
      ctx.beginPath()
      addCircle(ctx, world.x + side * (age - s), world.y + cam * h + 0.7 * (age - s), r)
      fill(ctx, C.confetti[i % 6]!)
    }
}

/** The engine's flame while it fires, in the rocket's frame: a soft teardrop out of the nozzle, flickering slowly. */
function drawFlame(ctx: CanvasRenderingContext2D, age: number) {
  const len = 0.42 + 0.06 * Math.sin(TAU * 2.4 * age)
  ctx.beginPath()
  ctx.moveTo(0.02, -0.2)
  ctx.quadraticCurveTo(-len * 0.6, -0.2, -len, 0)
  ctx.quadraticCurveTo(-len * 0.6, 0.2, 0.02, 0.2)
  ctx.closePath()
  fill(ctx, ROCKET.flame)
  ctx.beginPath()
  ctx.moveTo(0.02, -0.1)
  ctx.quadraticCurveTo(-len * 0.35, -0.1, -len * 0.62, 0)
  ctx.quadraticCurveTo(-len * 0.35, 0.1, 0.02, 0.1)
  ctx.closePath()
  fill(ctx, C.warm)
}

/** How far each face shows in the rocket's window `age` seconds after the tap: Beep's popping in as it climbs aboard, gone while it is out on the moon, back with Moony's beside it, and both gone once they are home. */
function inWindow(age: number): { beep: number; moony: number } {
  const at = LAUNCH_AT
  if (age >= at.home[0]) return { beep: 0, moony: 0 }
  if (age >= at.aboard[1] - 0.05) return { beep: smooth(at.aboard[1] - 0.05, at.aboard[1] + 0.2, age), moony: smooth(at.aboard[1], at.aboard[1] + 0.3, age) }
  if (age >= at.out[0]) return { beep: 1 - smooth(at.out[0], at.out[0] + 0.15, age), moony: 0 }
  return { beep: smooth(at.beep, at.beep + 0.25, age), moony: 0 }
}

/**
 * The launch at sim time t: the night sky over the top of the view as the board slides down
 * (the renderer draws the board launchSlide(age) of the view's height lower, under this), the
 * rocket standing on the pad, counting down, lifting on rainbow puffs and settling on the
 * moon among the flags of the flights before, Beep out on the moon planting its flag and
 * fetching Moony from its crater, and the countdown's number stickers beside the pad. While it
 * runs the renderer draws no rocket on the pad and no Beep on the board: Beep is away with the
 * rocket until the sky slides away home.
 */
export function drawLaunch(ctx: CanvasRenderingContext2D, pic: LaunchPic, t: number): void {
  const age = heldAge(pic.age)
  const { view } = pic
  const cam = climbed(age)
  const edge = view.y + Math.min(1, cam) * view.h
  const onMoon = age >= LAUNCH_AT.settle[1]
  const firing = FIRING.some(([a, b]) => age >= a && age < b)
  const at = rocketAt(pic, age)
  const m = moon(view)
  const moonY = m.y + (cam - CLIMB) * view.h
  const surface = (dx: number) => moonY - Math.sqrt(Math.max(0, m.r * m.r - dx * dx))
  // Once the sky slides away home the moon goes up past the screen's top, and with it whatever stands on it.
  const shows = (foot: number) => foot > view.y && moonY - m.r < view.y + view.h
  const skyClip = () => {
    ctx.beginPath()
    ctx.rect(view.x, view.y, view.w, Math.max(0, edge - view.y))
    ctx.clip()
  }
  // The launch fills the screen and nothing of it shows past it: puffs fall off its bottom as the camera climbs.
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.x, view.y, view.w, view.h)
  ctx.clip()
  if (cam > 0.001) {
    ctx.save()
    skyClip()
    drawSky(ctx, pic, cam, t)
    // The flags the flights before left, as many as the moon holds, and Moony's crater, there from the first sight of the moon.
    for (const dx of ON_MOON.flags.filter((x) => Math.abs(x) <= 0.88 * m.r).slice(0, pic.flags)) if (shows(surface(dx))) drawFlag(ctx, m.x + dx, surface(dx), Infinity, LITTLE_FLAG)
    if (shows(surface(ON_MOON.moony))) {
      ctx.beginPath()
      ctx.ellipse(m.x + ON_MOON.moony, surface(ON_MOON.moony) + 0.08, 0.4, 0.11, 0, 0, TAU)
      fill(ctx, MOONY.fold)
    }
    if (age >= LAUNCH_AT.flag && shows(surface(ON_MOON.flag))) drawFlag(ctx, m.x + ON_MOON.flag, surface(ON_MOON.flag), age - LAUNCH_AT.flag, 1)
    ctx.restore()
    // Soft clouds along the board's edge, hiding the seam where the sky meets the table; they sink away under the screen with it.
    const horizon = view.y + cam * view.h
    if (horizon < view.y + view.h + 0.6) {
      ctx.beginPath()
      for (let x = view.x - 0.3, i = 0; x < view.x + view.w + 0.6; x += 0.8, i++) addCircle(ctx, x, horizon + 0.1, 0.42 + 0.2 * spread(i, 0.618034))
      fill(ctx, C.white)
    }
  }
  drawPuffs(ctx, pic, age)
  if (!onMoon || shows(at.y)) {
    ctx.save()
    if (onMoon) skyClip()
    ctx.translate(at.x, at.y)
    tipped(ctx, at.turn, 1, 1, () => {
      if (firing) drawFlame(ctx, age)
      const mood = age >= LAUNCH_AT.lift && age < LAUNCH_AT.lift + 1.2 ? 'wide' : age >= LAUNCH_AT.lift ? 'happy' : 'open'
      const faces = inWindow(age)
      drawBuilt(ctx, { mood, turn: at.turn, k: faces.beep, moony: faces.moony })
    })
    ctx.restore()
  }
  // Beep and Moony out on the moon, in front of the rocket: Moony rising out of its crater (hidden under the crater's middle until it is out), Beep with the flag in its front mitten until it plants it.
  const beep = moonBeep(age)
  const moony = moonMoony(age, beep)
  if (moony !== null) {
    const foot = surface(moony.dx) - moony.up
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.x, view.y, view.w, Math.max(0, surface(moony.dx) + 0.08 - view.y))
    ctx.clip()
    ctx.translate(m.x + moony.dx, foot + (1 - moony.rise) * 0.7 * moony.k)
    scaled(ctx, moony.k, () => drawMoony(ctx, t, age - LAUNCH_AT.moony))
    ctx.restore()
  }
  if (beep !== null) {
    const x = m.x + beep.dx
    const foot = surface(beep.dx) - beep.up
    if (beep.flag) drawFlag(ctx, x + 0.4 * beep.k * beep.pic.facing, foot - 0.2 * beep.k, Infinity, 0.5 * beep.k)
    ctx.save()
    ctx.translate(x, foot)
    scaled(ctx, beep.k, () => drawBeep(ctx, beep.pic, t))
    ctx.restore()
  }
  if (age >= LAUNCH_AT.count && age < LAUNCH_AT.lift) {
    // The number stickers pop on one a second beside the pad, on its side away from the watchers.
    const n = 5 - Math.floor(age - LAUNCH_AT.count)
    const u = (age - LAUNCH_AT.count) % 1
    const k = (u < 0.22 ? smooth(0, 1, u / 0.22) * (1 + 0.15 * arch(u / 0.22)) : 1 - smooth(0.86, 1, u)) * (1 + 0.25 * arch(Math.min(1, pic.pop / NUMBER_POP)))
    if (k > 0.01) {
      // At least NUMBER_PX across on the screen, so a phone's small cells still show a number a child reads from the sofa.
      const r = Math.max(0.8, NUMBER_PX / 2 / pen.ppm)
      ctx.save()
      ctx.translate(pic.side > 0 ? pic.pad.x + 3.4 + r : pic.pad.x - 0.4 - r, pic.pad.y + 0.9)
      scaled(ctx, k, () => drawNumber(ctx, n, r))
      ctx.restore()
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A rocket with every part at `fill` (open or not), none popping. */
const even = (open: boolean, full: number): RocketPic => ({ parts: PARTS.map(() => ({ open, fill: full, fullAge: Infinity })), ready: false })
/** The rocket as the game sees it on the way: the parts before `n` full, part `n` at `fill`, the ones after closed. */
const onTheWay = (n: number, full: number): RocketPic => ({
  parts: PARTS.map((_, i) => ({ open: i <= n, fill: i < n ? 1 : i === n ? full : 0, fullAge: Infinity })),
  ready: false,
})
/** The pad's box on the sheet, and a launch's view: a land-1-sized screen with the pad at the board's pad. */
const PAD_BOX: Box = { x: -0.1, y: -0.1, w: 3.2, h: 3.2 }
const VIEW: Box = { x: 0, y: 0, w: 14, h: 9 }
const launch = (age: number, flags: number): LaunchPic => ({ age, view: VIEW, pad: { x: 1, y: 3.6 }, side: 1, flags, pop: Infinity })
/** Land 3's screen, where every launch really flies: its bigger moon holds every flight's flag. */
const VIEW3: Box = { x: 0, y: 0, w: 22, h: 15 }
const launch3 = (age: number, flags: number): LaunchPic => ({ age, view: VIEW3, pad: { x: 1, y: 4.5 }, side: 1, flags, pop: Infinity })

/** ?sheet=rocket: the dotted rocket, each part closed, open and filling at several fills, popping on, built, ready to launch; the little rocket; the launch at several moments and running, the first flight's and a fourth's (three flags already on the moon); the same rocket open again after it. */
export const SHEET = (): SheetEntry[] => [
  { label: 'the start: legs open, the rest dotted', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, onTheWay(0, 0), t) },
  ...[0.25, 0.5, 0.75].flatMap((f) => PARTS.map((part, i): SheetEntry => ({ label: `${part} ${f * 100} percent`, box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, onTheWay(i, f), t) }))),
  ...PARTS.map((part, i): SheetEntry => ({ label: `${part} filling and popping (replays)`, box: PAD_BOX, draw: (ctx, t) => {
    const u = t % 5
    const p = onTheWay(i, Math.min(1, u / 3.5))
    drawRocket(ctx, { ...p, parts: p.parts.map((s, j) => (j === i && u >= 3.5 ? { ...s, fullAge: u - 3.5 } : s)) }, t)
  } })),
  { label: 'all dotted, closed', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, even(false, 0), t) },
  { label: 'all open, empty', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, even(true, 0), t) },
  { label: 'built', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, even(true, 1), t) },
  { label: 'built, ready to launch', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, { ...even(true, 1), ready: true }, t) },
  { label: 'the HUD card box', box: ROCKET_BOX, draw: (ctx, t) => drawRocket(ctx, onTheWay(1, 0.6), t) },
  { label: 'little rocket', box: { x: -0.4, y: -0.4, w: 0.8, h: 0.8 }, draw: (ctx) => drawLittleRocket(ctx, 0.6) },
  ...[0.8, 2.5, 4.4, 6.5, 8.6, 10.5, 12, 15, 20, 22.5, 23.9, 24.8, 26.2, 27.7, 28.6, 29.4, 31.5, 33.5, 37].map((age): SheetEntry => ({ label: `launch at ${age} s`, box: VIEW, draw: (ctx, t) => launchOnBoard(ctx, launch(age, 0), t) })),
  ...[24.8, 29.4].map((age): SheetEntry => ({ label: `a fourth launch at ${age} s on land 3's screen: three flags already there`, box: VIEW3, draw: (ctx, t) => launchOnBoard(ctx, launch3(age, 3), t) })),
  { label: 'launch, running', box: VIEW, draw: (ctx, t) => launchOnBoard(ctx, launch(t % (LAUNCH_FOR * STEP), 1), t) },
  { label: 'after the launch: the same rocket open again, filling', box: PAD_BOX, draw: (ctx, t) => drawRocket(ctx, { parts: PARTS.map((_, i) => ({ open: true, fill: (t / 8 + i * 0.2) % 1, fullAge: Infinity })), ready: false }, t) },
]

/** The sheet's stand-in for the renderer during a launch: a plain board slid down by launchSlide with the pad on it, then the launch over it. */
function launchOnBoard(ctx: CanvasRenderingContext2D, pic: LaunchPic, t: number) {
  const slide = launchSlide(pic.age) * pic.view.h
  ctx.save()
  ctx.beginPath()
  ctx.rect(pic.view.x, pic.view.y, pic.view.w, pic.view.h)
  ctx.clip()
  ctx.beginPath()
  ctx.rect(pic.view.x, pic.view.y + slide, pic.view.w, pic.view.h)
  fill(ctx, LAND.ground)
  ctx.beginPath()
  addRoundRect(ctx, pic.pad.x + 0.15, pic.pad.y + 0.15 + slide, 2.7, 2.7, 0.44)
  fill(ctx, LAND.pad)
  drawLaunch(ctx, pic, t)
  ctx.restore()
}
