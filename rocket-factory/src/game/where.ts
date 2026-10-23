import { BEEP_FLY, SIZE } from './catalog'
import { BURROWS, BASKET, PAD, xOf, yOf } from './board'
import { DX, DY, HOP, OVER, STEP, opposite, since, slotCell, type BeepPic, type Belts, type Building, type Dir, type Flight, type Kind, type Muncher, type State } from './model'

/**
 * Where things are on the board as pictures, in board cells, as pure functions of the state's
 * stamps and the sim time `t` in seconds (the renderer's interpolated time). The renderer
 * draws there and the hit test (layout.ts) looks there, so what is drawn is what a tap hits.
 * Floating point is fine here, and trigonometry where only pictures read it, but two things
 * here feed the sim. A muncher's x and y (muncherPoint) start each of its hops in munchers.ts,
 * and so set how long the hop lasts: they use only + - * /, whose last bits every engine
 * agrees on (the hop's lift takes a sine, and it is a picture only). And the point a thing is
 * sent from (slotPoint, muncherPoint) picks the cell beep.ts measures where it is wanted from:
 * a bend's slotPoint takes a cosine and a sine, but its points lie a fifth of a cell or more
 * inside their cell, so the cell never depends on those last bits.
 */

export interface Point {
  x: number
  y: number
}
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const mid = (c: number): Point => ({ x: xOf(c) + 0.5, y: yOf(c) + 0.5 })
/** The middle of cell c's edge on side d. */
const edge = (c: number, d: Dir): Point => ({ x: xOf(c) + 0.5 + DX[d] * 0.5, y: yOf(c) + 0.5 + DY[d] * 0.5 })

/**
 * The point `u` of the way along a lane from its in edge to its out edge (u from 0 to 1): a
 * straight line through the middle, or on a bend a quarter circle of radius 0.5 round the
 * inner corner, so things ride round the bend instead of cutting it.
 */
export function lanePoint(c: number, inSide: Dir, outSide: Dir, u: number): Point {
  if (inSide === opposite(outSide)) {
    const a = edge(c, inSide)
    const b = edge(c, outSide)
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  }
  // The inner corner is where the in edge's and the out edge's sides meet.
  const cx = xOf(c) + 0.5 + (DX[inSide] + DX[outSide]) * 0.5
  const cy = yOf(c) + 0.5 + (DY[inSide] + DY[outSide]) * 0.5
  const a = edge(c, inSide)
  const b = edge(c, outSide)
  const a0 = Math.atan2(a.y - cy, a.x - cx)
  let a1 = Math.atan2(b.y - cy, b.x - cx)
  // The short way round: a quarter turn.
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI
  if (a0 - a1 > Math.PI) a1 += 2 * Math.PI
  const a2 = a0 + (a1 - a0) * u
  return { x: cx + Math.cos(a2) * 0.5, y: cy + Math.sin(a2) * 0.5 }
}

/** Where a slot's thing sits: an in slot a quarter of the way along its lane, an out slot three quarters; an over lane runs straight across. */
export function slotPoint(belts: Belts, slot: number): Point {
  const c = slotCell(slot)
  const u = slot % 2 === 0 ? 0.25 : 0.75
  if (slot >= OVER) {
    const o = belts.over[c]! as Dir
    return lanePoint(c, opposite(o), o, u)
  }
  return lanePoint(c, belts.in[c]! as Dir, belts.out[c]! as Dir, u)
}

/**
 * Where a thing that hopped from slot `from` to slot `to` is drawn, `u` of the way through the
 * hop: within one lane it follows the lane (round a bend), between two cells it goes straight
 * across their shared edge. `from` of -1 (it came out of a building or a hand), or `to` itself
 * (it stood still), shows it at `to`.
 */
export function gliding(belts: Belts, from: number, to: number, u: number): Point {
  if (from < 0 || from === to || u >= 1) return slotPoint(belts, to)
  const c = slotCell(to)
  if (slotCell(from) === c && (from >= OVER) === (to >= OVER)) {
    const lane = to >= OVER ? { i: opposite(belts.over[c]! as Dir), o: belts.over[c]! as Dir } : { i: belts.in[c]! as Dir, o: belts.out[c]! as Dir }
    return lanePoint(c, lane.i, lane.o, 0.25 + 0.5 * u)
  }
  const a = slotPoint(belts, from)
  const b = slotPoint(belts, to)
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
}

/**
 * How far through its hop a thing on a belt is drawn at sim time t, for a state at `tick`: 0
 * at the last hop the state holds (hops fall on the ticks that are multiples of HOP), rising to
 * 1 a hop later, so things glide at constant speed between hops. A frame drawn a little behind
 * the state's tick holds at 0, so a thing never shows past the hop and then jumps back.
 */
export const hopProgress = (tick: number, t: number) => Math.min(1, Math.max(0, (t / STEP - Math.floor(tick / HOP) * HOP) / HOP))
/** Where the thing in `slot` is drawn at sim time t: on its way from the slot it held before the last hop. The renderer draws it here and a tap on it is a 'thing'. */
export const thingPoint = (s: State, slot: number, t: number): Point => gliding(s.belts, s.belts.from[slot]!, slot, hopProgress(s.tick, t))

/** A building's footprint. */
export const buildingBox = (b: Building): Box => ({ x: b.x, y: b.y, w: SIZE[b.kind], h: SIZE[b.kind] })

/**
 * Where a napping muncher curls up on a building's picture (its feet), in the same frame as
 * stackBox: cells from the footprint's top-left, upright on screen (on the upright board the
 * renderer turns the offset with the picture about the footprint's middle). critters.ts draws
 * the napper there, over the roof stack. Munchers nap only on ovens, the workshop and the
 * bottle makers (plans/rocket-factory.md, Munchers).
 */
const NAP: Partial<Record<Kind, Point>> = {
  oven: { x: 1, y: 0.16 },
  workshop: { x: 1, y: 0.16 },
  greenMaker: { x: 1, y: 0.16 },
  orangeMaker: { x: 1, y: 0.1 },
}
export function napSpot(b: Building): Point {
  const p = NAP[b.kind]
  if (!p) throw new Error(`munchers never nap on a ${b.kind}`)
  return p
}
export const padBox: Box = { x: PAD.x, y: PAD.y, w: 3, h: 3 }
export const basketPoint: Point = { x: BASKET.x + 0.5, y: BASKET.y + 0.5 }
/** A burrow's mound, and its heap, which sits just left of its door. */
export const burrowBox = (i: number): Box => ({ x: BURROWS[i]!.x, y: BURROWS[i]!.y, w: 2, h: 2 })
export const heapPoint = (i: number): Point => ({ x: BURROWS[i]!.door.x - 0.85, y: BURROWS[i]!.door.y - 0.2 })
/** Where a maker's roof stack is drawn, in its picture's own frame (cells from its footprint's top-left corner, upright on screen): up to STACK things in a row along the top of its outline, half over it. */
export const stackBox = (b: Building): Box => ({ x: 0.2, y: -0.3, w: SIZE[b.kind] - 0.4, h: 0.6 })
/**
 * Moony, home with Beep from the first launch, sits on the pad's outer coral ring and waves:
 * its feet. On the ring's upper right the rocket's nose is below it and the launch button far
 * from it, and on the upright board, where this point shows on the ring's upper left, it sits
 * above the rocket's fin and inside the pad: so it never covers the rocket filling again, a
 * tap on its button, or the belts round the pad.
 */
export const moonyPoint: Point = { x: PAD.x + 2.3, y: PAD.y + 0.88 }

/** Where a muncher stands at sim time t: along its straight hop, else between its cell and the cell it steps toward. `lift` is how high its hop carries it (cells), for the picture. */
export function muncherPoint(m: Muncher, t: number): Point & { lift: number } {
  if (m.hop) {
    const span = (m.hop.until - m.hop.at) * STEP
    const u = span <= 0 ? 1 : Math.min(1, Math.max(0, since(m.hop.at, t) / span))
    const d = Math.hypot(m.hop.x1 - m.hop.x0, m.hop.y1 - m.hop.y0)
    // A run of little bounces, one a cell, rather than one long arc.
    const bounces = Math.max(1, Math.round(d))
    const lift = 0.18 * Math.abs(Math.sin(u * bounces * Math.PI))
    return { x: m.hop.x0 + (m.hop.x1 - m.hop.x0) * u, y: m.hop.y0 + (m.hop.y1 - m.hop.y0) * u, lift }
  }
  const a = mid(m.cell)
  if (m.toward === m.cell) return { ...a, lift: 0 }
  const b = mid(m.toward)
  const u = Math.min(1, Math.max(0, since(m.stepAt, t) / (m.stepFor * STEP)))
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, lift: 0.08 * Math.sin(u * Math.PI) }
}

/** Where Beep hovers at sim time t: easing from its last spot to its job over at most BEEP_FLY. */
export function beepPoint(b: BeepPic, t: number): Point {
  const u = Math.min(1, Math.max(0, since(b.movedAt, t) / (BEEP_FLY * STEP)))
  const k = u * u * (3 - 2 * u)
  return { x: b.fromX + (b.x - b.fromX) * k, y: b.fromY + (b.y - b.fromY) * k }
}

/** Where a flying thing is at sim time t, and whether it has landed. */
export function flightPoint(f: Flight, t: number): Point & { lift: number; done: boolean } {
  const span = (f.until - f.at) * STEP
  const u = span <= 0 ? 1 : Math.min(1, Math.max(0, since(f.at, t) / span))
  return { x: f.x0 + (f.x1 - f.x0) * u, y: f.y0 + (f.y1 - f.y0) * u, lift: f.arc * 4 * u * (1 - u), done: u >= 1 }
}
