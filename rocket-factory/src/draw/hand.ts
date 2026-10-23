import { LANDS, xOf, yOf } from '../game/board'
import { inputHeld } from '../game/camera'
import { HAND_FOR, SIZE } from '../game/catalog'
import { choiceCard } from '../game/hud'
import { BODY, GRIP, gripLift, muncherDrawn, pictureSpot, screenBox, toScreen, type View } from '../game/layout'
import { STEP, since, type Placeable, type State, type Sticker } from '../game/model'
import { basketPoint, heapPoint, napSpot, stackBox, thingPoint, type Box } from '../game/where'
import { drawBuilding, restingPic } from './buildings'
import { BEEP, C, TAU, addCapsule, addCircle, addRoundRect, fill, heldAge, mix, scaled, smallEntry, smooth, stickerRim, type SheetEntry } from './look'
import { LAUNCH_BUTTON } from './rocket'

/**
 * The hint's hand (plans/rocket-factory.md, The one next step): HAND_AFTER with no touch
 * after the step began, it shows her the step as her own finger would do it. It taps a thing
 * twice, traces a belt's path, drags a sticker out of the tray onto its ghost, presses Oops or
 * the card that waits for her, and points at the choice card's two pictures in turn, tapping
 * neither (the choice is hers). hint.ts times it (State.handAt and handN) and her next touch
 * sends it away. A sticker it drags rides above its fingertip, held by its bottom edge as hers
 * is (layout.ts heldAt), and its drag ends with the fingertip under the ghost, so the sticker
 * settles onto the ghost as it lets go. Everything here is a pure function of the state,
 * the view and the time: the page draws the hand over the HUD (Hand.tsx), where the tray's
 * buttons are, and the renderer draws the dotted path the hand's trace leaves on the board
 * (handTrail), so both show the same moment.
 *
 * The hand is Beep's: its own cyan mitten on a coral cuff, as its hands are on its spring arms
 * (beep.ts), with a white die-cut rim and a soft shadow, so it shows on the mint ground, the
 * teal belts, the white tray and the indigo lab card alike. It comes in from below, the way
 * her own hand does, and its palm never lies over what it points at: the fingertip touches the
 * thing and the palm hangs off its edge, turned to stay on the screen near an edge. It moves
 * calmly, presses with its shadow closing in and a soft ring at the fingertip, and nothing on
 * it flashes. Its soft shadow is the silhouette in a few see-through layers, since a draw
 * function never blurs (look.ts rule 12).
 */

// ---------------------------------------------------------------------------------------
// What the hand does

/** A HUD button the hand presses or points at, found where the page laid it out (Hand.tsx reads the page): a sticker's button in the tray (the hedge's too), the peel, Oops, one of the choice's two pictures, and the card that waits for her tap. */
export type HandButton = { kind: 'sticker'; sticker: Sticker } | { kind: 'peel' } | { kind: 'oops' } | { kind: 'choice'; card: 'bubbles' | 'hedges' } | { kind: 'card' }

/**
 * What the fingertip goes to: a muncher (where it is drawn now), a picture standing at a board
 * point (its middle `up` cells above the point on screen, `r` cells round), a footprint of n
 * cells from its top-left cell, a spot in a footprint's upright picture (cells from the
 * picture's top-left, `r` round), or a HUD button.
 */
type Aim =
  | { kind: 'muncher'; id: number }
  | { kind: 'point'; x: number; y: number; up: number; r: number }
  | { kind: 'footprint'; x: number; y: number; n: number }
  | { kind: 'picture'; x: number; y: number; n: number; px: number; py: number; r: number }
  | { kind: 'button'; button: HandButton }

/** One move of the hand: two taps on an aim, a point at one (the fingertip hovering over it, never touching), a stroke traced through cells (their middles), or a sticker carried from its tray button onto its ghost's footprint. */
type Move = { kind: 'tap'; aim: Aim } | { kind: 'point'; aim: Aim } | { kind: 'trace'; cells: readonly number[] } | { kind: 'drag'; sticker: Placeable; from: Aim; to: Aim }

const button = (b: HandButton): Aim => ({ kind: 'button', button: b })
/** The lab's one choice, in the order the choice card shows it. */
const CHOICES = ['bubbles', 'hedges'] as const
const tap = (aim: Aim): Move[] => [{ kind: 'tap', aim }]
/** A sticker dragged out of the tray onto its ghost's footprint. */
const drop = (sticker: Placeable, x: number, y: number): Move => ({ kind: 'drag', sticker, from: button({ kind: 'sticker', sticker }), to: { kind: 'footprint', x, y, n: SIZE[sticker] } })

/**
 * The moves that show the step bouncing now, as its script does them (hint.ts): null for a
 * step the hand does not show (Beep pointing at the rocket: the factory runs and watching it
 * is play), and for a step that names something gone since the hint last looked (a building
 * peeled, a muncher home, a thing taken, an empty path), which the hint drops at its next look.
 */
function movesOf(s: State, t: number): Move[] | null {
  // The choice card covers the board: whatever bounces under it waits, and the hand points at its two pictures.
  if (choiceCard(s)) return CHOICES.map((card): Move => ({ kind: 'point', aim: button({ kind: 'choice', card }) }))
  const step = s.hint!.step
  const byId = (id: number) => s.buildings.find((b) => b.id === id)
  const footprint = (id: number): Move[] | null => {
    const b = byId(id)
    return b === undefined ? null : tap({ kind: 'footprint', x: b.x, y: b.y, n: SIZE[b.kind] })
  }
  switch (step.kind) {
    case 'muncher':
      return s.munchers.some((m) => m.id === step.id) ? tap({ kind: 'muncher', id: step.id }) : null
    case 'oops':
      return tap(button({ kind: 'oops' }))
    case 'place':
      return [drop(step.sticker, step.x, step.y)]
    case 'free':
      // The peel from the tray (unless it is in hand), then over the belts it rolls up.
      return step.cells.length === 0 ? null : [...(s.tool.kind === 'peel' ? [] : tap(button({ kind: 'peel' }))), { kind: 'trace', cells: step.cells }]
    case 'bottleneck':
      if (byId(step.id) === undefined) return null
      return step.sticker === null ? footprint(step.id) : [drop(step.sticker, step.x, step.y)]
    case 'unblock': {
      if (s.belts.slot[step.slot]! < 0) return null
      const p = thingPoint(s, step.slot, t)
      return tap({ kind: 'point', x: p.x, y: p.y, up: BODY.thing.up, r: BODY.thing.r })
    }
    case 'stack': {
      const b = byId(step.id)
      if (b === undefined || b.stack.length === 0) return null
      const st = stackBox(b)
      return tap({ kind: 'picture', x: b.x, y: b.y, n: SIZE[b.kind], px: st.x + st.w / 2, py: st.y + st.h / 2, r: st.h / 2 })
    }
    case 'link':
      return step.path.length === 0 || byId(step.from) === undefined || byId(step.to) === undefined ? null : [{ kind: 'trace', cells: step.path }]
    case 'dig':
      return tap({ kind: 'point', x: xOf(step.cell) + 0.5, y: yOf(step.cell) + 0.5, up: 0, r: 0.45 })
    case 'defend':
      if (step.sticker === 'hedge') return step.cells.length === 0 ? null : [...(s.tool.kind === 'hedge' ? [] : tap(button({ kind: 'sticker', sticker: 'hedge' }))), { kind: 'trace', cells: step.cells }]
      // The belt it needs first (a tower's bubbles, a bowl's gold bars), then the sticker onto it.
      return [...(step.cells.length > 0 ? [{ kind: 'trace' as const, cells: step.cells }] : []), drop(step.sticker, step.x, step.y)]
    case 'refill':
      return footprint(step.id)
    case 'heap': {
      if (s.burrows[step.burrow]!.heap.every((n) => n === 0)) return null
      const p = heapPoint(step.burrow)
      return tap({ kind: 'point', x: p.x, y: p.y, up: BODY.heap.up, r: BODY.heap.r })
    }
    case 'basket':
      return tap({ kind: 'point', x: basketPoint.x, y: basketPoint.y, up: BODY.basket.up, r: BODY.basket.r })
    case 'choose':
      // On a phone's lab card or in the path view, while no choice card is up: a pointing finger at each, the tap hers.
      return CHOICES.map((card): Move => ({ kind: 'point', aim: button({ kind: 'choice', card }) }))
    case 'flap': {
      if (s.land === 3) return null
      // The east flap's corner, the one that wiggles (land.ts drawFlapCorner).
      const l = LANDS[s.land]
      return tap({ kind: 'point', x: l.x1 + 1.2, y: l.y0 + 0.2, up: 0, r: 0.25 })
    }
    case 'launch': {
      const pad = s.buildings.find((b) => b.kind === 'pad')!
      return tap({ kind: 'picture', x: pad.x, y: pad.y, n: SIZE.pad, px: LAUNCH_BUTTON.x, py: LAUNCH_BUTTON.y, r: LAUNCH_BUTTON.r })
    }
    case 'card':
      return tap(button({ kind: 'card' }))
    case 'tuck': {
      // The machine of the kind that bounces in its nightcap: the one the hint's tap goes to.
      const b = s.buildings.find((x) => x.kind === step.machine && !x.tucked)
      return b === undefined ? null : footprint(b.id)
    }
    case 'rocket':
      return null
  }
}

// ---------------------------------------------------------------------------------------
// When it moves

/** Seconds: gliding in from below its first spot while it fades in, lifting away from its last spot while it fades out, gliding from one move to the next, a fingertip pressing onto the glass or lifting off it, a press held, and the rest after a lift. */
const IN = 0.45
const OUT = 0.4
const BETWEEN = 0.35
const DOWN = 0.14
const HELD = 0.1
const REST = 0.12
/** A whole tap gesture (gliding in, two taps, lifting away) lasts HAND_FOR, as catalog.ts says. */
const TAPS = HAND_FOR * STEP - IN - OUT
/** A trace runs TRACE_SPEED cells a second, faster on a path so long it would take more than TRACE_MOST; a drag carries the sticker over DRAG; a point hovers over its aim for POINT, bobbing POINT_BOB sizes. */
const TRACE_SPEED = 4
const TRACE_MOST = 3.5
const DRAG = 1
const POINT = 1.1
const POINT_BOB = 0.06
/** The ring at the fingertip after it touches the glass, seconds. */
const RIPPLE = 0.45

const ease = (u: number) => smooth(0, 1, u)

/** A tap move `u` seconds in: how far its fingertip is pressed, and the seconds since it last touched the glass (Infinity before the first touch). Two taps, each down, a moment on the glass and up again, then a rest. */
function tapping(u: number): [number, number] {
  const each = (TAPS - REST) / 2
  const j = Math.min(1, Math.floor(u / each))
  const v = u - j * each
  const press = u >= 2 * each ? 0 : v < DOWN ? ease(v / DOWN) : v < DOWN + HELD ? 1 : 1 - ease((v - DOWN - HELD) / DOWN)
  const touched = v >= DOWN ? j * each + DOWN : j > 0 ? (j - 1) * each + DOWN : -1
  return [press, touched < 0 ? Infinity : u - touched]
}

/** A trace's length in cells through its cells' middles, each cell's distance along it, and how long its glide takes. */
function traced(cells: readonly number[]) {
  const along = [0]
  for (let i = 1; i < cells.length; i++) along.push(along[i - 1]! + Math.hypot(xOf(cells[i]!) - xOf(cells[i - 1]!), yOf(cells[i]!) - yOf(cells[i - 1]!)))
  const length = along[along.length - 1]!
  return { along, length, glide: length / Math.max(TRACE_SPEED, length / TRACE_MOST) }
}

/** How long a move takes, from its first touch to its last rest. */
function moveLength(m: Move): number {
  switch (m.kind) {
    case 'tap':
      return TAPS
    case 'point':
      return POINT
    case 'trace':
      return DOWN + traced(m.cells).glide + DOWN + REST
    case 'drag':
      return DOWN + HELD + DRAG + DOWN + REST
  }
}

/** The hand now: its moves, each one's start (seconds into the gesture), the gesture's length, and how far into it the hand is. */
interface HandNow {
  moves: Move[]
  starts: number[]
  length: number
  age: number
}

/**
 * Whether the hand shows at sim time t, and where in its gesture it is: from State.handAt for
 * the gesture's length, while the step it came for still bounces (a new step began after it:
 * hint.at later than handAt), until her next touch (handN back to 0). Never before Play, during
 * the launch, while the view moves (the land easing out, the table turning), or over a card
 * other than the one that waits for her tap.
 */
export function handNow(s: State, t: number): HandNow | null {
  const hint = s.hint
  if (!s.playing || hint === null || s.handN === 0 || s.handAt < hint.at || (s.card !== null && hint.step.kind !== 'card') || inputHeld(s, t)) return null
  const age = Math.max(0, since(s.handAt, t))
  const moves = movesOf(s, t)
  if (moves === null) return null
  const starts: number[] = []
  let at = IN
  for (const m of moves) {
    starts.push(at)
    at += moveLength(m) + BETWEEN
  }
  const length = at - BETWEEN + OUT
  return age >= length ? null : { moves, starts, length, age }
}

/** How see-through the hand is at its age: fading in as it glides in, out as it lifts away. */
const alphaAt = (now: HandNow) => smooth(0, IN * 0.7, now.age) * (1 - smooth(now.length - OUT, now.length - OUT * 0.15, now.age))

/**
 * The dotted path the hand's trace leaves on the board at sim time t: the trace's cells, how
 * much of the path it has drawn (0 to 1, growing behind the fingertip as it glides), and how
 * see-through it is (it fades with the hand). Null while no trace has begun.
 */
export function handTrail(s: State, t: number): { cells: readonly number[]; reach: number; alpha: number } | null {
  const now = handNow(s, t)
  if (now === null) return null
  const i = now.moves.findIndex((m) => m.kind === 'trace')
  const m = now.moves[i]
  if (m === undefined || m.kind !== 'trace' || now.age < now.starts[i]! + DOWN) return null
  const glide = traced(m.cells).glide
  return { cells: m.cells, reach: glide === 0 ? 1 : ease((now.age - now.starts[i]! - DOWN) / glide), alpha: alphaAt(now) }
}

// ---------------------------------------------------------------------------------------
// Where it is

/** A sticker the hand carries: the board's cell size, how far its footprint's bottom edge rides above the fingertip (CSS px: layout.ts GRIP cells, as a held sticker rides above her finger), and how much of it shows (0 to 1: it lifts off the tray as the finger presses, and settles into its ghost as the finger lets go). */
export interface Carry {
  sticker: Placeable
  cell: number
  lift: number
  shown: number
}

/** The hand on the screen: its fingertip (CSS px), its palm's way from straight down (radians, positive toward the right), how far its finger is pressed onto the glass (0 to 1), how see-through it is (0 to 1), seconds since the fingertip last touched down (Infinity for not lately), its size (CSS px from the fingertip to the cuff's end), and the sticker it carries. */
export interface HandPose {
  x: number
  y: number
  palm: number
  press: number
  alpha: number
  ripple: number
  size: number
  carry: Carry | null
}

/** The hand's size on a view: a little under two cells, never smaller than a phone's fingertip needs nor bigger than a child's hand on an iPad. */
export const handSize = (view: View) => Math.min(92, Math.max(64, 1.6 * view.cell))
/** The hand's canvas is HAND_ROOM sizes square with the fingertip at its middle: room for the hand turned any way its palm may go, its shadow and its ripple. */
export const HAND_ROOM = 2.6
/** How many sizes square the hand's canvas is for a pose: HAND_ROOM, or more for a sticker riding above the fingertip. */
export const handRoom = (pose: HandPose) => (pose.carry === null ? HAND_ROOM : Math.max(HAND_ROOM, (2 * (pose.carry.lift + 1.2 * SIZE[pose.carry.sticker] * pose.carry.cell)) / pose.size + 0.2))

/** The palm's way the hand likes (down and to the right, as a right hand comes from below), and the angles it may turn to near an edge. */
const PALM = (25 * Math.PI) / 180
const PALM_STEP = (5 * Math.PI) / 180
/** The knuckles lie this far from the fingertip (sizes): the palm is past them. */
const KNUCKLES_AT = 0.36

/** An aim on the screen: its middle and half its width and height, CSS px. */
interface Spot {
  x: number
  y: number
  hx: number
  hy: number
}

/** Where an aim is on the screen at sim time t, or null when it is not there (a HUD button the page does not show now). */
function spotOf(s: State, view: View, t: number, aim: Aim, buttonAt: (b: HandButton) => Box | null): Spot | null {
  const k = view.cell
  switch (aim.kind) {
    case 'muncher': {
      // Its body's middle over its feet, where its tap lands (layout.ts): a napper's curled up on its building's roof.
      const m = s.munchers.find((x) => x.id === aim.id)!
      const bed = s.buildings.find((b) => b.napper === m.id)
      const r = BODY.muncher.r * k
      if (bed !== undefined) {
        const [x, y] = pictureSpot(view, bed.x, bed.y, SIZE[bed.kind], napSpot(bed).x, napSpot(bed).y - BODY.muncher.up)
        return { x, y, hx: r, hy: r }
      }
      const p = muncherDrawn(m, t, view.turn)
      const [x, y] = toScreen(view, p.x, p.y)
      return { x, y: y - (BODY.muncher.up + p.lift) * k, hx: r, hy: r }
    }
    case 'point': {
      const [x, y] = toScreen(view, aim.x, aim.y)
      return { x, y: y - aim.up * k, hx: aim.r * k, hy: aim.r * k }
    }
    case 'footprint': {
      const b = screenBox(view, { x: aim.x, y: aim.y, w: aim.n, h: aim.n })
      return { x: b.x + b.w / 2, y: b.y + b.h / 2, hx: b.w / 2, hy: b.h / 2 }
    }
    case 'picture': {
      const [x, y] = pictureSpot(view, aim.x, aim.y, aim.n, aim.px, aim.py)
      return { x, y, hx: aim.r * k, hy: aim.r * k }
    }
    case 'button': {
      const b = buttonAt(aim.button)
      return b === null ? null : { x: b.x + b.w / 2, y: b.y + b.h / 2, hx: b.w / 2, hy: b.h / 2 }
    }
  }
}

/** A fingertip on the screen and its palm's way. */
type Tip = { x: number; y: number; palm: number }

/**
 * The fingertip on a spot of a w x h screen and its palm's way. The fingertip goes to the
 * spot's middle, or toward its edge on a spot so big the knuckles would lie over it, so the
 * palm hangs off it. The palm goes the liked way, or the nearest way that keeps the whole hand
 * on the screen (its cuff's end and corners inside it): toward a side near the bottom (the
 * tray), and to the left near the right edge.
 */
function tipOn(spot: Spot, w: number, h: number, size: number): Tip {
  const at = (palm: number): Tip => {
    const px = Math.sin(palm)
    const py = Math.cos(palm)
    const edge = Math.min(Math.abs(px) < 1e-6 ? Infinity : spot.hx / Math.abs(px), Math.abs(py) < 1e-6 ? Infinity : spot.hy / Math.abs(py))
    const shift = Math.max(0, edge - 0.8 * KNUCKLES_AT * size)
    return { x: spot.x + px * shift, y: spot.y + py * shift, palm }
  }
  const side = 0.24 * size
  const fits = (p: Tip) => {
    const ex = p.x + size * Math.sin(p.palm)
    const ey = p.y + size * Math.cos(p.palm)
    return ex - side >= 0 && ex + side <= w && ey + side * 0.6 <= h
  }
  for (let k = 0; k * PALM_STEP <= Math.PI; k++)
    for (const a of [PALM + k * PALM_STEP, PALM - k * PALM_STEP]) {
      if (Math.abs(a) > Math.PI / 2) continue
      const p = at(a)
      if (fits(p)) return p
    }
  return at(PALM)
}

/**
 * The hand at sim time t on a view, or null while it does not show (handNow). `buttonAt`
 * finds a HUD button's box on the page (CSS px); a button the page does not show hides the
 * hand. Everything it touches is where the frame at t draws it.
 */
export function handPose(s: State, view: View, t: number, buttonAt: (b: HandButton) => Box | null): HandPose | null {
  const now = handNow(s, t)
  if (now === null) return null
  const size = handSize(view)
  // Every move's fingertips: a tap's one, a drag's two ends, a trace's cell middles.
  const tips: Tip[][] = []
  for (const m of now.moves) {
    if (m.kind === 'trace') {
      tips.push(
        m.cells.map((c) => {
          const [x, y] = toScreen(view, xOf(c) + 0.5, yOf(c) + 0.5)
          return tipOn({ x, y, hx: 0, hy: 0 }, view.w, view.h, size)
        }),
      )
      continue
    }
    const aims = m.kind === 'drag' ? [m.from, m.to] : [m.aim]
    const spots = aims.map((a) => spotOf(s, view, t, a, buttonAt))
    if (spots.some((p) => p === null)) return null
    // A drag ends with the fingertip gripLift under its footprint's middle, holding the sticker by its bottom edge right over the ghost, as her finger must for the sticker to snap there.
    tips.push(spots.map((p, i) => tipOn(i === 1 && m.kind === 'drag' ? { x: p!.x, y: p!.y + gripLift(view, SIZE[m.sticker]), hx: 0, hy: 0 } : p!, view.w, view.h, size)))
  }
  const first = tips[0]![0]!
  const lastMove = tips[tips.length - 1]!
  const last = lastMove[lastMove.length - 1]!
  const lerp = (a: Tip, b: Tip, u: number): Tip => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u), palm: mix(a.palm, b.palm, u) })
  /** A spot `away` sizes off the tip along its palm's way: where the hand comes in from and lifts away to. */
  const off = (p: Tip, away: number): Tip => ({ x: p.x + Math.sin(p.palm) * away * size, y: p.y + Math.cos(p.palm) * away * size, palm: p.palm })
  const pose = (p: Tip, press: number, ripple: number): HandPose => ({ x: p.x, y: p.y, palm: p.palm, press, alpha: alphaAt(now), ripple, size, carry: null })
  const age = now.age
  if (age < IN) return pose(lerp(off(first, 0.45), first, ease(age / IN)), 0, Infinity)
  for (let i = 0; i < now.moves.length; i++) {
    const m = now.moves[i]!
    const u = age - now.starts[i]!
    const end = moveLength(m)
    if (u < 0) {
      // Gliding over from the move before.
      const before = tips[i - 1]!
      return pose(lerp(before[before.length - 1]!, tips[i]![0]!, ease((u + BETWEEN) / BETWEEN)), 0, Infinity)
    }
    if (u >= end) continue
    const p = tips[i]!
    switch (m.kind) {
      case 'tap': {
        const [press, ripple] = tapping(u)
        return pose(p[0]!, press, ripple)
      }
      case 'point': {
        // Hovering just off the picture, bobbing a little toward it: look, this one.
        const tip = p[0]!
        const bob = POINT_BOB * size * (0.5 - 0.5 * Math.cos((2 * Math.PI * u) / (POINT / 2)))
        return pose(off(tip, 0.12 - bob / size), 0, Infinity)
      }
      case 'trace': {
        const { along, length, glide } = traced(m.cells)
        const press = u < DOWN ? ease(u / DOWN) : u < DOWN + glide ? 1 : 1 - ease((u - DOWN - glide) / DOWN)
        const d = length * ease((u - DOWN) / Math.max(glide, 1e-9))
        let k = 0
        while (k < along.length - 2 && along[k + 1]! < d) k++
        const seg = along[k + 1] === undefined ? 0 : along[k + 1]! - along[k]!
        const tip = seg === 0 ? p[k]! : lerp(p[k]!, p[k + 1]!, (d - along[k]!) / seg)
        return pose(tip, press, u >= DOWN ? u - DOWN : Infinity)
      }
      case 'drag': {
        const carry = u - DOWN - HELD
        const press = u < DOWN ? ease(u / DOWN) : carry < DRAG ? 1 : 1 - ease((carry - DRAG) / DOWN)
        // The sticker lifts off its button as the finger presses it and settles into its ghost, right under it, as the finger lets go.
        const settle = ease((carry - DRAG) / DOWN)
        return { ...pose(lerp(p[0]!, p[1]!, ease(carry / DRAG)), press, u >= DOWN ? u - DOWN : Infinity), carry: { sticker: m.sticker, cell: view.cell, lift: GRIP * view.cell, shown: ease(u / DOWN) * (1 - smooth(0.6, 1, settle)) } }
      }
    }
  }
  return pose(lerp(last, off(last, 0.45), ease((age - (now.length - OUT)) / OUT)), 0, Infinity)
}

// ---------------------------------------------------------------------------------------
// The picture

/** The hand in its own frame: the fingertip at the origin and the hand reaching down +y to its cuff's end at 1 (one unit is the hand's size). A right hand: the index finger out, the other three curled on its right, the thumb tucked on its left. */
const FINGER = { y0: 0.075, y1: 0.42, r: 0.075 }
const FIST = { x: -0.16, y: 0.34, w: 0.41, h: 0.46, r: 0.15 }
const KNUCKLES = [
  [0.13, 0.42, 0.085],
  [0.195, 0.525, 0.08],
  [0.205, 0.635, 0.074],
] as const
const THUMB = { x0: -0.125, y0: 0.66, x1: -0.215, y1: 0.48, r: 0.062 }
const CUFF = { x: -0.19, y: 0.76, w: 0.46, h: 0.22, r: 0.07 }
/** The die-cut rim round the glove, units. */
const HAND_RIM = 0.03
/** The soft shadow: its offset down-right on the screen lifted and pressed (units), its layers, each a little bigger than the one before, and how dark each is. */
const SHADOW_UP = [0.09, 0.13] as const
const SHADOW_DOWN = [0.03, 0.045] as const
const SHADOW_LAYERS = 4
const SHADOW_GROW = 0.035
const SHADOW_ALPHA = 0.36

/** The glove's outline as part of the current path, every piece wound clockwise. */
function addGlove(ctx: CanvasRenderingContext2D) {
  addCapsule(ctx, 0, FINGER.y0, 0, FINGER.y1, FINGER.r)
  addRoundRect(ctx, FIST.x, FIST.y, FIST.w, FIST.h, FIST.r)
  for (const [x, y, r] of KNUCKLES) addCircle(ctx, x, y, r)
  addCapsule(ctx, THUMB.x0, THUMB.y0, THUMB.x1, THUMB.y1, THUMB.r)
  addRoundRect(ctx, CUFF.x, CUFF.y, CUFF.w, CUFF.h, CUFF.r)
}

/**
 * The hand at a pose at sim time t, origin its fingertip, one unit its size (the caller
 * scales): the ring spreading from the fingertip after it touches down, the sticker it carries
 * riding above the fingertip by its bottom edge (the real sticker held up, see-through, as her
 * own held sticker is drawn) and settling into its ghost as it lets go, the soft shadow
 * down-right on the screen (closer and smaller while it presses), and the glove turned so its
 * palm goes the pose's way, a little smaller while it presses. `alpha` is the caller's (the
 * page fades the canvas).
 */
export function drawHand(ctx: CanvasRenderingContext2D, pose: HandPose, t: number): void {
  const press = Math.min(1, Math.max(0, pose.press))
  const k = 1 - 0.06 * press
  const was = ctx.globalAlpha
  ctx.save()
  const carry = pose.carry
  if (carry !== null && carry.shown > 0.01) {
    const n = SIZE[carry.sticker]
    const cell = carry.cell / pose.size
    ctx.globalAlpha = was * carry.shown
    // Riding with its footprint's bottom edge `lift` over the fingertip.
    ctx.save()
    ctx.translate((-n / 2) * cell, -carry.lift / pose.size - n * cell)
    scaled(ctx, cell, () => drawBuilding(ctx, { ...restingPic(carry.sticker), hold: 'ghost', stamp: null }, t))
    ctx.restore()
    ctx.globalAlpha = was
  }
  const ripple = heldAge(pose.ripple)
  if (ripple < RIPPLE) {
    const u = ripple / RIPPLE
    const r = 0.06 + 0.26 * smooth(0, 1, u)
    for (const [dx, colour, a] of [
      [0.012, C.hintShadow, 0.8],
      [0, C.hint, 1],
    ] as const) {
      ctx.beginPath()
      ctx.arc(dx, dx, r, 0, TAU)
      ctx.globalAlpha = was * a * 0.75 * (1 - u)
      ctx.lineWidth = 0.035 * (1 - u) + 0.008
      ctx.strokeStyle = colour
      ctx.stroke()
    }
    ctx.globalAlpha = was
  }
  // The shadow: the glove's silhouette in see-through layers, offset down-right on the screen whichever way the hand is turned.
  const dx = mix(SHADOW_UP[0], SHADOW_DOWN[0], press)
  const dy = mix(SHADOW_UP[1], SHADOW_DOWN[1], press)
  for (let i = 0; i < SHADOW_LAYERS; i++) {
    const grow = 1 + SHADOW_GROW * i * (1 - 0.5 * press)
    ctx.save()
    ctx.translate(dx, dy)
    ctx.rotate(-pose.palm)
    ctx.scale(k, k)
    ctx.translate(0, 0.5)
    ctx.scale(grow, grow)
    ctx.translate(0, -0.5)
    ctx.beginPath()
    addGlove(ctx)
    ctx.globalAlpha = was * SHADOW_ALPHA
    fill(ctx, C.liftShadow)
    ctx.restore()
  }
  ctx.globalAlpha = was
  ctx.rotate(-pose.palm)
  ctx.scale(k, k)
  stickerRim(
    ctx,
    () => {
      ctx.beginPath()
      addGlove(ctx)
    },
    HAND_RIM,
    BEEP.prop,
  )
  // Beep's own cyan mitten: the back of the hand and the finger catch the light; folds part the curled fingers.
  ctx.beginPath()
  ctx.ellipse(0.045, 0.55, 0.085, 0.13, -0.15, 0, TAU)
  addCapsule(ctx, -0.028, 0.13, -0.028, 0.31, 0.022)
  fill(ctx, BEEP.mittenLight)
  ctx.beginPath()
  addCapsule(ctx, 0.075, 0.475, 0.2, 0.468, 0.013)
  addCapsule(ctx, 0.085, 0.58, 0.215, 0.578, 0.013)
  addCapsule(ctx, -0.095, 0.62, -0.15, 0.5, 0.012)
  fill(ctx, BEEP.mittenFold)
  // The cuff in Beep's coral, where its spring arm meets the mitten.
  ctx.beginPath()
  addRoundRect(ctx, CUFF.x, CUFF.y, CUFF.w, CUFF.h, CUFF.r)
  fill(ctx, BEEP.body)
  ctx.beginPath()
  addRoundRect(ctx, CUFF.x + 0.03, CUFF.y + 0.045, CUFF.w - 0.06, 0.05, 0.025)
  fill(ctx, BEEP.light)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A hand at rest at the origin, its palm `deg` degrees off straight down, as big as on an iPad (the sheet draws one unit a size). */
const resting = (deg: number, press: number, ripple: number): HandPose => ({ x: 0, y: 0, palm: (deg * Math.PI) / 180, press, alpha: 1, ripple, size: 92, carry: null })
const BOX: Box = { x: -1.2, y: -0.4, w: 2.4, h: 1.65 }
/** A hand carrying an oven over land 3's 55 px cells by its bottom edge, `settle` of the way into its ghost. */
const carrying = (settle: number): HandPose => ({ ...resting(25, 1, Infinity), carry: { sticker: 'oven', cell: 55, lift: GRIP * 55, shown: 1 - smooth(0.6, 1, settle) } })

/** ?sheet=hand: the hand at rest, pressing with its ring, turned the ways it turns near the screen's edges, tapping twice as a tap gesture does (looping), carrying a sticker and dropping it (looping), and at a phone's size. */
export const SHEET: SheetEntry[] = [
  { label: 'at rest, palm down and right', box: BOX, draw: (ctx, t) => drawHand(ctx, resting(25, 0, Infinity), t) },
  { label: 'pressed, its ring spreading', box: BOX, draw: (ctx, t) => drawHand(ctx, resting(25, 1, 0.15), t) },
  { label: 'palm down and left, by the right edge', box: BOX, draw: (ctx, t) => drawHand(ctx, resting(-25, 0, Infinity), t) },
  { label: 'palm to the right, over the tray', box: BOX, draw: (ctx, t) => drawHand(ctx, resting(70, 0, Infinity), t) },
  { label: 'palm to the left, over the tray by the right edge', box: BOX, draw: (ctx, t) => drawHand(ctx, resting(-70, 0, Infinity), t) },
  {
    label: 'tapping twice (loops)',
    box: BOX,
    draw: (ctx, t) => {
      const [press, ripple] = tapping(t % (TAPS + 0.6))
      drawHand(ctx, resting(25, press, ripple), t)
    },
  },
  { label: 'carrying a sticker by its bottom edge', box: { x: -1.2, y: -1.85, w: 2.4, h: 3.1 }, draw: (ctx, t) => drawHand(ctx, carrying(0), t) },
  { label: 'letting it settle into its ghost (loops)', box: { x: -1.2, y: -1.85, w: 2.4, h: 3.1 }, draw: (ctx, t) => drawHand(ctx, carrying(Math.min(1, (t % 1.6) / 1.2)), t) },
  smallEntry('at a phone size', 0.7, BOX, (ctx, t) => drawHand(ctx, resting(25, 0, Infinity), t)),
]
