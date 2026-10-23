import { choose, waitAfter, type Profile } from './brain'
import { GROUND, LANDS, cellOf, inLand, xOf, yOf } from './board'
import { inputHeld } from './camera'
import type { Game } from './game'
import type { Ranked } from './hint'
import { SIZE } from './catalog'
import { trayOrder, type HudView } from './hud'
import { NO_INSETS, fingerFor, hitTest, targets, toScreen, trayBoxes, type Area, type HudFrame, type Insets, type View } from './layout'
import { DX, DY, STEP, sameTool, since, type Hit, type Placeable, type Script, type State, type Sticker, type Tool } from './model'
import { rng as seeded } from './random'
import { act, step } from './rules'
import type { Box, Point } from './where'

/**
 * The scripted children (plans/rocket-factory.md, Engineering, the scripted children):
 * five-year-olds who play whole games through the same doors as a real finger. A Child plays
 * a running Game once a frame: what it does next comes from brain.ts (`choose` and the PACE
 * of its profile), and the script of that step (hint.ts) becomes gestures. A finger on the
 * canvas goes through Game.pointer, so the stage's view (camera.ts viewAt) and the pointer
 * router (touch.ts) read it as they read a real one; a sticker dragged out of the tray goes
 * through Game.trayDown and Game.trayPointer; a HUD button is the very call its button makes
 * (Tray.tsx, Hud.tsx, Cards.tsx, Pause.tsx). The child never reaches past the router: a
 * gesture that lands on something else is a miss, as a real child's is, and the child looks
 * again at its next step.
 *
 * The gestures, from a script's actions:
 * - a tool is a tap on its tray button, skipped while it is in hand (its button is lit);
 *   a sticker held up is that sticker dragged off its tray button (touch.ts Router.tray) and
 *   carried, held by its bottom edge above the fingertip, until the sticker is over its
 *   footprint (layout.ts fingerFor), where the finger lifts with a tap's scatter;
 * - a tap is a finger on the hit's target (layout.ts targets), at a point the hit test gives
 *   to it; a dig a press on the patch held until its lift; a tickle a touch on the muncher
 *   where it is drawn now;
 * - a drag is a finger tracing the cells' middles at a finger's speed, one in HEEL_EVERY with
 *   the heel of the hand landing a moment before the fingertip and sliding with it;
 * - Oops, the card, the choice (on the choice card, or on a phone through the path's cards),
 *   Play, the path's close, Good night (the pause button, then the menu's) and the morning (the
 *   pause menu's Keep going over the sleeping factory) are the HUD's own calls.
 * While a card, the choice card, the path, the start card or the Good night card covers the
 * board, the only thing to tap is that layer (the cards take no tap until LOOK after they flip
 * up), and while the board takes no input (the land's ease, the turn, the launch, a phone held
 * upright) the child waits.
 *
 * The finger is measured in millimetres at the screen's CSS px per mm (Finger, Screen): taps
 * scatter, one in ten lands well off, taps last a while and slide, strokes wobble to their
 * very end, one drag in twenty loses contact for a moment, and on one stroke in HEEL_EVERY the
 * heel of the hand lands first. A thumb may rest on the glass all session, and a frantic
 * tapper hits at munchers every FRANTIC_EVERY while they are out. Besides the profiles that
 * follow the hint there are the chaos child (taps, strokes, stickers, peels and Oops anywhere)
 * and the belts-everywhere child (long strokes all over the land).
 *
 * The child's own generator gives every choice it makes, so a seed replays a game. Its
 * gestures are input, like a real finger's, so they may use floating point and trigonometry:
 * the sim's determinism rules (model.ts) hold for what the sim does with them.
 */

// ---------------------------------------------------------------------------------------
// Screens and fingers

/** CSS px per millimetre: an iPad's 264 pixels an inch at twice the CSS px (132 CSS px an inch), a phone's 326 at twice (163). */
export const IPAD_MM = 132 / 25.4
export const PHONE_MM = 163 / 25.4
/** The home indicator's strip along the bottom of an iPad with no home button. */
const HOME_BAR: Insets = { ...NO_INSETS, bottom: 20 }

/** A screen the children play on: the window in CSS px, the CSS px in a millimetre, the safe areas. */
export interface Screen {
  name: string
  w: number
  h: number
  mm: number
  safe: Insets
}

/** The plan's screens: the three iPad full screens, the same three in Safari with its bars, and a phone on its side (inside its safe areas). */
export const SCREENS: readonly Screen[] = [
  { name: '1180x820', w: 1180, h: 820, mm: IPAD_MM, safe: HOME_BAR },
  { name: '1024x768', w: 1024, h: 768, mm: IPAD_MM, safe: NO_INSETS },
  { name: '820x1180', w: 820, h: 1180, mm: IPAD_MM, safe: HOME_BAR },
  { name: '1024x662', w: 1024, h: 662, mm: IPAD_MM, safe: NO_INSETS },
  { name: '1180x710', w: 1180, h: 710, mm: IPAD_MM, safe: HOME_BAR },
  { name: '820x1070', w: 820, h: 1070, mm: IPAD_MM, safe: HOME_BAR },
  { name: '750x320', w: 750, h: 320, mm: PHONE_MM, safe: NO_INSETS },
]

/** The screen of that name. */
export function screenNamed(name: string): Screen {
  const s = SCREENS.find((x) => x.name === name)
  if (s === undefined) throw new Error(`no screen ${name}: use one of ${SCREENS.map((x) => x.name).join(', ')}`)
  return s
}

/**
 * A five-year-old's finger, in millimetres and seconds. A tap (a dig, a tickle, a button, a
 * carried sticker's drop) lands round its aim with an RMS radius of `scatter` (a 2D normal,
 * never `miss[0]` or more off), except one tap in `missEvery`, which lands `miss` off; it lasts
 * `press` and slides up to `slide` meanwhile. A drag goes `speed` a second and sways up to
 * `wobble` off its line either way (the sway grows over its first half cell, as a finger lands
 * where she means, and a stroke's lasts to its end), and one drag in `loseEvery` loses contact
 * for `lose`. 0 for `missEvery` or `loseEvery` is never.
 */
export interface Finger {
  scatter: number
  missEvery: number
  miss: readonly [number, number]
  press: readonly [number, number]
  slide: number
  speed: readonly [number, number]
  wobble: number
  loseEvery: number
  lose: readonly [number, number]
}

/** The plan's finger. Its speed is a careful child's tracing a path with one finger. */
export const FINGER: Finger = { scatter: 2.5, missEvery: 10, miss: [5, 8], press: [0.1, 1], slide: 4, speed: [40, 90], wobble: 4, loseEvery: 20, lose: [0.05, 0.12] }
/** A finger that lands every gesture exactly on its aim and never skips: what each gesture does, apart from how a child misses. */
export const STEADY: Finger = { scatter: 0, missEvery: 0, miss: [0, 0], press: [0.15, 0.15], slide: 0, speed: [80, 80], wobble: 0, loseEvery: 0, lose: [0, 0] }

// ---------------------------------------------------------------------------------------
// Who plays

/** What the child plays by: a profile that follows the hint (brain.ts), the chaos child, or the belts-everywhere child. */
export type Play = Profile | 'chaos' | 'belts'

/**
 * A child: what it plays by, its finger, the screen's CSS px per mm under a view, where a
 * thumb rests on the glass all session (at a random spot by a side edge, or at a board point;
 * null for no thumb), whether it taps at munchers every FRANTIC_EVERY while they are out, and
 * how many game seconds it plays before it says Good night (Infinity for never).
 */
export interface Kid {
  play: Play
  finger: Finger
  mm: (view: View) => number
  thumb: 'edge' | Point | null
  frantic: boolean
  bedtime: number
}

/** Seconds a frantic tapper leaves between two taps at munchers while they are out. */
export const FRANTIC_EVERY = 0.4
/** A child taps a card no sooner than this after it flipped up: it looks first (and the card's layer takes no tap for its first Cards.tsx SETTLE, 1 s, anyway). */
const LOOK = 1.2
/** Seconds between two gestures of one step: the hand goes to the next thing. A frantic tapper's taps come FRANTIC_EVERY apart instead. */
const BETWEEN = [0.2, 0.6] as const
/** Real seconds the child looks at the pause menu before it presses Good night. */
const MENU_LOOK = [0.5, 1.5] as const
/** Seconds a drag's finger rests at its end before it lifts, and a sticker's press on its button before it moves. */
const SETTLE_END = [0.05, 0.2] as const
/** The finger's way is sent to the router this often (game seconds), however long a frame is: a fast-forwarded page traces as finely as a real one. */
const SAMPLE = 1 / 60
/** The thumb's jiggle while it rests, in mm: well within the router's STILL. */
const JIGGLE = 0.4
/** On the page (?autoplay) the child says Good night after BEDTIME game seconds of play; the still card stays up WAKE_AFTER real seconds before a grown-up's morning (the pause menu's Keep going). */
export const BEDTIME = 20 * 60
const WAKE_AFTER = 4
/** One stroke in HEEL_EVERY has the heel of the drawing hand on the glass HEEL_MM below the fingertip, landing HEEL_LEAD seconds before it and sliding with the hand: the router must give the fingertip the board. */
const HEEL_EVERY = 10
const HEEL_MM = [40, 60] as const
const HEEL_LEAD = [0.05, 0.3] as const
/** One session in THUMB_EVERY has a thumb resting on the glass. */
const THUMB_EVERY = 5

/** The page's CSS px per mm, which the browser does not tell: a phone's on a phone, else an iPad's. */
const pageMm = (v: View) => (v.hud.held === 'phone' || v.hud.held === 'turnMe' ? PHONE_MM : IPAD_MM)

/** The child that plays the page with ?autoplay: careful and eager, the plan's finger, a resting thumb in one session in THUMB_EVERY, and Good night at BEDTIME. */
export function pageChild(seed: number): Child {
  const thumb = seeded(seed ^ 0x7417)() * THUMB_EVERY < 1
  return new Child({ play: { pace: 'eager', behaviour: 'careful' }, finger: FINGER, mm: pageMm, thumb: thumb ? 'edge' : null, frantic: false, bedtime: BEDTIME }, seed)
}

/**
 * A scripted child on the pure sim, with no finger: when its rest is over it touches the board,
 * runs the script of what it chooses (if anything) through rules.act and lifts, and the sim
 * steps at 60 Hz in between. Every turn touches, whether or not it takes a step: a child who
 * skips the defence still plays, and the kind rules (a touch within TOUCHED_WITHIN) must see
 * her there. The demos reach their moments with it (fixtures.ts), the whole games are
 * measured with it (session.test.ts), and the finger children are held against it
 * (fingers.test.ts).
 */
export class PureChild {
  private readonly r: () => number
  /** The tick of its next turn. */
  private next = 0

  constructor(
    private readonly profile: Profile,
    seed: number,
  ) {
    this.r = seeded(seed)
  }

  /** One tick of s: its turn first when it is due, then the sim's step. Returns the step it took this tick, or null. */
  step(s: State): Ranked | null {
    let took: Ranked | null = null
    if (s.tick >= this.next) {
      took = choose(s, this.profile.behaviour)
      act(s, { kind: 'touch', down: true })
      if (took !== null) for (const a of took.script) act(s, a)
      act(s, { kind: 'touch', down: false })
      this.next = s.tick + waitAfter(this.profile.pace, took !== null, this.r)
    }
    step(s)
    return took
  }
}

// ---------------------------------------------------------------------------------------
// From a script to gestures

type Pt = readonly [number, number]
/** A tray button: the pencil, the peel, or a sticker's (the hedge's too). */
type TrayKey = 'pencil' | 'peel' | Sticker

/** What the child means to do next, one gesture each: from a step's script, or its own. */
export type Intent =
  /** Pick this tool at its tray button, unless it is in hand. */
  | { kind: 'tool'; tool: Tool }
  /** Press this tray button, whatever it does now (the chaos child's). */
  | { kind: 'button'; key: TrayKey }
  /** Drag the sticker off its tray button to the board point (the footprint's middle) and lift there. */
  | { kind: 'carry'; sticker: Placeable; x: number; y: number }
  | { kind: 'tap'; hit: Hit }
  /** A tap at a screen point, whatever is there (the chaos child's). */
  | { kind: 'point'; x: number; y: number }
  | { kind: 'dig'; cell: number }
  | { kind: 'tickle'; id: number }
  | { kind: 'trace'; cells: readonly number[] }
  | { kind: 'oops' }
  | { kind: 'card' }
  | { kind: 'choose'; card: 'bubbles' | 'hedges' }
  | { kind: 'play' }
  | { kind: 'closePath' }
  | { kind: 'goodnight' }

/**
 * A step's script as the gestures that make it, for the board as it is: a sticker's tool and
 * its hold and release are one carry from the tray, a drag and its release one trace, a dig's
 * down and up one press. Throws on a script no finger or button makes.
 */
export function intentsOf(s: State, script: Script): Intent[] {
  const out: Intent[] = []
  let sticker: Placeable | null = s.tool.kind === 'sticker' ? s.tool.sticker : null
  for (let i = 0; i < script.length; i++) {
    const a = script[i]!
    const after = script[i + 1]
    const released = after !== undefined && after.kind === 'release' && after.commit
    switch (a.kind) {
      case 'tool':
        sticker = a.tool.kind === 'sticker' ? a.tool.sticker : null
        if (a.tool.kind !== 'sticker' || after === undefined || after.kind !== 'hold') out.push({ kind: 'tool', tool: a.tool })
        break
      case 'hold':
        if (sticker === null || !released) throw new Error(`a script holds ${sticker === null ? 'no sticker' : `a ${sticker} it never lets go of`}`)
        out.push({ kind: 'carry', sticker, x: a.x, y: a.y })
        sticker = null
        i++
        break
      case 'drag':
        if (!released) throw new Error('a script drags a stroke it never lifts')
        out.push({ kind: 'trace', cells: a.cells })
        i++
        break
      case 'dig':
        if (!a.down || after === undefined || after.kind !== 'dig' || after.down || after.cell !== a.cell) throw new Error(`a script's dig at ${a.cell} is not a press and its lift`)
        out.push({ kind: 'dig', cell: a.cell })
        i++
        break
      case 'tap':
        out.push({ kind: 'tap', hit: a.hit })
        break
      case 'tickle':
        out.push({ kind: 'tickle', id: a.id })
        break
      case 'oops':
      case 'card':
        out.push({ kind: a.kind })
        break
      case 'choose':
        out.push({ kind: 'choose', card: a.card })
        break
      default:
        throw new Error(`no finger or button makes a script's '${a.kind}'`)
    }
  }
  return out
}

const keyOf = (tool: Tool): TrayKey => (tool.kind === 'sticker' ? tool.sticker : tool.kind)
/** Two hits on the same thing. */
export function sameHit(a: Hit, b: Hit): boolean {
  if (a.kind !== b.kind) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return Object.keys(x).every((k) => x[k] === y[k])
}

/**
 * What a tray button's tap does now (Tray.tsx): the lit pencil gives the next pattern, else it
 * is picked; the peel is picked, or put back while it is picked; a sticker or the hedge is
 * picked, put back while it is picked, or for a used one the lab card peeks.
 */
function trayTap(game: Game, key: TrayKey): void {
  const tray = game.hud.tray
  const pencil: Tool = { kind: 'pencil' }
  if (key === 'pencil') return tray.pencil.lit ? game.dispatch({ kind: 'pattern' }) : game.button({ kind: 'tool', tool: pencil }, 'pick')
  if (key === 'peel') return game.button({ kind: 'tool', tool: tray.peel ? pencil : { kind: 'peel' } }, 'pick')
  const b = key === 'hedge' ? tray.hedge : (tray.stickers.find((x) => x.sticker === key) ?? null)
  if (b === null) throw new Error(`the tray has no ${key} button`)
  if (b.picked) game.button({ kind: 'tool', tool: pencil }, 'pick')
  else if (b.left <= 0) game.peekAt(key)
  else game.button({ kind: 'tool', tool: key === 'hedge' ? { kind: 'hedge' } : { kind: 'sticker', sticker: key } }, 'pick')
}

/** A tray sticker's button on the screen, where layout.ts trayBoxes puts it: Tray.tsx lays the tray out in the very same boxes, in the order of hud.ts trayOrder. */
export function trayButton(f: HudFrame, tray: HudView['tray'], sticker: Sticker): Box {
  const keys = trayOrder(tray, f.held === 'sideways')
  const i = keys.indexOf(sticker)
  if (i < 0) throw new Error(`the tray has no ${sticker} button`)
  return trayBoxes(f, keys.length).buttons[i]!
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
/** Whether a touch at (x, y) lands on the canvas: the HUD's strip, column and tray take what lands on them. */
function onCanvas(f: HudFrame, x: number, y: number): boolean {
  return !([f.strip, f.column, f.tray] as (Box | null)[]).some((b) => b !== null && inBox(b, x, y))
}

/** Where in a box the child tries a tap, as fractions of it: the middle first, then round it (a stack or a napper can cover a building's middle). */
const PROBES = [
  [0.5, 0.5],
  [0.5, 0.25],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.5, 0.75],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const
const probes = (a: Area): Pt[] => (a.kind === 'disc' ? [[a.x, a.y]] : PROBES.map(([u, v]) => [a.x + a.w * u, a.y + a.h * v]))

/**
 * The screen point a tap on `hit` aims at in the frame at sim time t: a point of one of its
 * targets' areas on the canvas that the hit test gives to it (the next land's flaps: the
 * middle of the widest of the strips east, north and south of the land); null when there is
 * none now (it is gone, or something above it in the hit order covers it).
 */
export function aimAt(s: State, view: View, t: number, hit: Hit): Pt | null {
  const ok = (p: Pt) => onCanvas(view.hud, p[0], p[1]) && sameHit(hitTest(s, view, p[0], p[1], t), hit)
  if (hit.kind === 'flap') {
    // Each flap from the middle of the land's edge out to the free area's edge, in twentieths of a cell.
    const l = LANDS[s.land]
    const mx = (l.x0 + l.x1 + 1) / 2
    const my = (l.y0 + l.y1 + 1) / 2
    const sides = [
      [l.x1 + 1, my, 1, 0],
      [mx, l.y0, 0, -1],
      [mx, l.y1 + 1, 0, 1],
    ] as const
    let best: Pt | null = null
    let room = 0
    for (const [x, y, dx, dy] of sides) {
      let k = 0
      while (k < 80 && inBox(view.hud.free, ...toScreen(view, x + (dx * (k + 1)) / 20, y + (dy * (k + 1)) / 20))) k++
      if (k > room) {
        room = k
        best = toScreen(view, x + (dx * k) / 40, y + (dy * k) / 40)
      }
    }
    return best !== null && ok(best) ? best : null
  }
  for (const tg of targets(s, view, t)) {
    if (!sameHit(tg.hit, hit)) continue
    for (const p of probes(tg.area)) if (ok(p)) return p
  }
  return null
}

// ---------------------------------------------------------------------------------------
// Gestures

/** One gesture in progress. `run` does its part of the frame at sim time t; true once it is over. */
interface Gesture {
  readonly kind: string
  run(game: Game, t: number): boolean
}

/** A HUD button's press: the finger's down, and at its lift (`at`, in sim seconds, or with `real` in the game's real clock, which runs on while the pause menu holds the sim) the button's call. */
class Press implements Gesture {
  constructor(
    readonly kind: string,
    private readonly at: number,
    private readonly call: (game: Game) => void,
    private readonly real: boolean,
  ) {}

  run(game: Game, t: number): boolean {
    if ((this.real ? game.clock : t) < this.at) return false
    this.call(game)
    return true
  }
}

/** Two gestures at once, over once both are: the heel of the hand and the fingertip of one stroke. */
class Both implements Gesture {
  constructor(
    readonly kind: string,
    private readonly a: Gesture,
    private readonly b: Gesture,
  ) {}

  run(game: Game, t: number): boolean {
    const a = this.a.run(game, t)
    const b = this.b.run(game, t)
    return a && b
  }
}

/** Gestures one after another, each made when the one before is over (the pause button and then the menu's Good night). */
class Chain implements Gesture {
  private i = 0
  private now: Gesture | null = null
  constructor(
    readonly kind: string,
    private readonly parts: readonly ((game: Game, t: number) => Gesture)[],
  ) {}

  run(game: Game, t: number): boolean {
    for (;;) {
      if (this.now === null) {
        if (this.i === this.parts.length) return true
        this.now = this.parts[this.i++]!(game, t)
      }
      if (!this.now.run(game, t)) return false
      this.now = null
    }
  }
}

/**
 * A finger on the glass from `start` to `end` (sim seconds) along `way` (CSS px at a sim
 * time): its first contact on the canvas, or pressing a tray sticker's button; and with `lost`
 * set, lifted between those two times and down again (a fingertip that skipped). A contact
 * that lands on the HUD's strip, column or tray (not its own tray button) never reaches the
 * canvas. `onDown` hears where each canvas contact lands, just before the router does.
 */
class Touch implements Gesture {
  private contact = 0
  private down = false
  private canvas = false
  private id = 0
  /** The sim time the finger was last sent at. */
  private sent = 0
  private readonly spans: readonly (readonly [number, number])[]

  constructor(
    readonly kind: string,
    private readonly ids: () => number,
    private readonly way: (t: number) => Pt,
    start: number,
    end: number,
    lost: readonly [number, number] | null,
    private readonly tray: Placeable | null,
    private readonly onDown: (game: Game, p: Pt) => void,
  ) {
    this.spans = lost === null ? [[start, end]] : [[start, lost[0]], [lost[1], end]]
  }

  run(game: Game, t: number): boolean {
    while (this.contact < this.spans.length) {
      const [from, to] = this.spans[this.contact]!
      if (!this.down) {
        if (t < from) return false
        const p = this.way(from)
        this.down = true
        this.sent = from
        if (this.contact === 0 && this.tray !== null) {
          this.id = this.ids()
          this.canvas = false
          game.trayDown(this.id, this.tray, p[0], p[1], 'touch')
        } else if (onCanvas(game.view!.hud, p[0], p[1])) {
          this.id = this.ids()
          this.canvas = true
          this.onDown(game, p)
          game.pointer('down', this.id, p[0], p[1], 'touch')
        } else this.id = 0
      }
      const until = Math.min(t, to)
      for (let u = this.sent + SAMPLE; u < until; u += SAMPLE) this.send(game, 'move', this.way(u))
      this.sent = until
      if (t < to) {
        this.send(game, 'move', this.way(t))
        return false
      }
      this.send(game, 'up', this.way(to))
      this.down = false
      this.contact++
    }
    return true
  }

  /** A move or the lift of the contact down now: the canvas's pointer, or the tray's, or nothing for one that landed on the HUD. */
  private send(game: Game, kind: 'move' | 'up', p: Pt): void {
    if (this.id === 0) return
    if (this.canvas) game.pointer(kind, this.id, p[0], p[1], 'touch')
    else game.trayPointer(kind, this.id, p[0], p[1])
  }
}

/** A point `d` px off in a random direction. */
export function off(r: () => number, d: number): Pt {
  const a = 2 * Math.PI * r()
  return [Math.cos(a) * d, Math.sin(a) * d]
}

/** Where a tap lands round its aim, in px: a 2D normal of RMS radius `scatter` mm (per axis scatter / sqrt 2), cut short of `miss[0]`; one tap in `missEvery` lands `miss` mm off instead. */
export function landing(r: () => number, f: Finger, mm: number): Pt {
  if (f.missEvery > 0 && r() * f.missEvery < 1) return off(r, (f.miss[0] + r() * (f.miss[1] - f.miss[0])) * mm)
  return off(r, Math.min(f.miss[0], (f.scatter / Math.SQRT2) * Math.sqrt(-2 * Math.log(1 - r()))) * mm)
}

/** A finger's smooth sway off its line, up to `amp` px each way on each axis: two slow waves an axis, from the child's generator. */
function sway(r: () => number, amp: number): (t: number) => Pt {
  const wave = () => ({ f: 2 * Math.PI * (0.6 + 1.4 * r()), p: 2 * Math.PI * r() })
  const [a, b, c, d] = [wave(), wave(), wave(), wave()]
  return (t) => [amp * (0.7 * Math.sin(a.f * t + a.p) + 0.3 * Math.sin(b.f * t + b.p)), amp * (0.7 * Math.sin(c.f * t + c.p) + 0.3 * Math.sin(d.f * t + d.p))]
}

const between = (r: () => number, [lo, hi]: readonly [number, number]) => lo + r() * (hi - lo)

/** The point `d` px along a polyline of screen points, held at its ends. */
function along(pts: readonly Pt[], lengths: readonly number[], d: number): Pt {
  let i = 0
  while (i < lengths.length - 1 && d > lengths[i + 1]!) i++
  if (i >= pts.length - 1) return pts[pts.length - 1]!
  const seg = lengths[i + 1]! - lengths[i]!
  const u = seg === 0 ? 0 : Math.min(1, Math.max(0, (d - lengths[i]!) / seg))
  const [x0, y0] = pts[i]!
  const [x1, y1] = pts[i + 1]!
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]
}

/** What a child did, for the tests and the report: the steps it began by kind, its gestures by kind, how many of each landed on something else than they aimed at (by the hit test at the down), and how many it found nothing to aim at. */
export interface ChildLog {
  steps: Record<string, number>
  gestures: Record<string, number>
  missed: Record<string, number>
  unaimed: number
}

// ---------------------------------------------------------------------------------------
// The child

/**
 * A child at a running Game, one call a frame (the page's with ?autoplay, or a test's), after
 * the steps and against the view the stage drew last. When its rest is over it decides a step
 * (brain.ts choose, or its own as the chaos and belts children), and its gestures follow one
 * after another; after the step's last it rests (brain.ts waitAfter). A paused game waits for the
 * parent. After its bedtime it says Good night; on the still card it waits WAKE_AFTER real
 * seconds, and then a grown-up brings the morning through the pause menu.
 */
export class Child {
  readonly log: ChildLog = { steps: {}, gestures: {}, missed: {}, unaimed: 0 }
  private readonly r: () => number
  private gesture: Gesture | null = null
  private readonly queue: Intent[] = []
  /** Sim seconds: when it next looks for a step, and when its next gesture may start. */
  private nextAt = 0
  private readyAt = 0
  /** The gesture it runs is its own trip through the pause menu, so a paused game goes on for it. */
  private menu = false
  private ids = 0
  /** The thumb resting on the glass (its pointer and rest point), once it is down. */
  private thumb: { id: number; x: number; y: number } | null = null
  /** When it next taps at a muncher as a frantic tapper. */
  private franticAt = 0
  /** Game seconds played since it started or last woke, and the sim time it last counted from. */
  private played = 0
  private countedAt: number | null = null
  /** When the Good night card came up (the game's real clock), or null. */
  private sleptAt: number | null = null

  constructor(
    private readonly kid: Kid,
    seed: number,
  ) {
    this.r = seeded(seed)
  }

  /** Nothing in hand: no gesture runs and none waits. */
  get idle(): boolean {
    return this.gesture === null && this.queue.length === 0
  }

  /** Does this step next, from the board as it is: its script's gestures, from the next frame on. */
  take(s: State, r: Ranked): void {
    this.queue.push(...intentsOf(s, r.script))
    this.log.steps[r.step.kind] = (this.log.steps[r.step.kind] ?? 0) + 1
  }

  frame(game: Game): void {
    const view = game.view
    if (view === null || (game.paused && !this.menu)) return
    const t = game.frameTime
    if (game.asleep) {
      // The still card: up a while, then the grown-up's morning, the pause menu's Keep going (a tap on the card only makes Beep murmur).
      this.sleptAt ??= game.clock
      if (game.clock - this.sleptAt >= WAKE_AFTER) {
        this.sleptAt = null
        this.played = 0
        game.openPause()
        game.keepGoing()
      }
      return
    }
    const s = game.state
    if (s.playing) {
      this.played += this.countedAt === null ? 0 : Math.max(0, t - this.countedAt)
      this.countedAt = t
      this.rest(game, view, t)
    }
    if (this.gesture !== null) {
      if (!this.gesture.run(game, t)) return
      this.over(t)
    }
    if (t < this.readyAt) return
    if (this.kid.frantic && s.munchers.some((m) => m.mode !== 'home' && m.mode !== 'watch')) {
      if (t < this.franticAt) return
      this.frenzy(game, view, t)
      if (this.gesture !== null && this.gesture.run(game, t)) this.over(t)
      return
    }
    if (this.queue.length === 0) {
      if (t < this.nextAt) return
      this.decide(game, view, t)
      if (this.queue.length === 0) return
    }
    const cover = this.cover(game, view, t)
    if (cover === 'wait') return
    const intent = cover ?? this.queue.shift()!
    this.gesture = this.start(game, view, t, intent)
    if (this.gesture === null) {
      if (this.queue.length === 0) this.nextAt = t + this.restAfterStep()
      return
    }
    this.log.gestures[this.gesture.kind] = (this.log.gestures[this.gesture.kind] ?? 0) + 1
    // A press or a tap that starts now does its first part in this very frame.
    if (this.gesture.run(game, t)) this.over(t)
  }

  /** The gesture in hand is over at t: the next waits BETWEEN (a frantic tap's next comes FRANTIC_EVERY after it began), and after a step's last the child rests. */
  private over(t: number): void {
    const frantic = this.gesture!.kind === 'frantic'
    this.gesture = null
    this.menu = false
    this.readyAt = frantic ? t : t + between(this.r, BETWEEN)
    if (!frantic && this.queue.length === 0) this.nextAt = t + this.restAfterStep()
  }

  /** How long it rests after a step: its pace's (brain.ts waitAfter), or the chaos child's quick whims and the belts child's breath between strokes. */
  private restAfterStep(): number {
    const play = this.kid.play
    if (play === 'chaos') return between(this.r, [0.3, 2.5])
    if (play === 'belts') return between(this.r, [0.5, 3])
    return waitAfter(play.pace, true, this.r) * STEP
  }

  /** A new pointer id: negative, so it never meets a real pointer's. */
  private newId = () => --this.ids

  /** What covers the board comes first: the start card's Play, the path's close (unless the child is choosing there), a card's tap once it has been up LOOK ('wait' before that; none more when the step is that tap), the choice card's Bubbles (the hint's own pick). Null when nothing covers it; 'wait' while the board takes no input. */
  private cover(game: Game, view: View, t: number): Intent | 'wait' | null {
    const s = game.state
    const next = this.queue[0]
    if (!s.playing) return { kind: 'play' }
    if (game.path) return next !== undefined && next.kind === 'choose' ? null : { kind: 'closePath' }
    if (s.card !== null) return since(s.card.at, t) < LOOK ? 'wait' : next !== undefined && next.kind === 'card' ? null : { kind: 'card' }
    if (game.hud.ask) return next !== undefined && next.kind === 'choose' ? null : { kind: 'choose', card: 'bubbles' }
    if (view.hud.held === 'turnMe' || inputHeld(s, t)) return 'wait'
    return null
  }

  /** Its next step: Good night at bedtime, else what brain.ts chooses for its profile, or the chaos or belts child's own. */
  private decide(game: Game, view: View, t: number): void {
    const s = game.state
    const play = this.kid.play
    if (play === 'chaos' || play === 'belts') {
      this.queue.push(...(play === 'chaos' ? this.chaos(game, view, t) : this.belts(s)))
      return
    }
    if (s.playing && this.played >= this.kid.bedtime && s.night === null && s.launch === null) {
      this.queue.push({ kind: 'goodnight' })
      return
    }
    const r = choose(s, play.behaviour)
    if (r === null) this.nextAt = t + waitAfter(play.pace, false, this.r) * STEP
    else this.take(s, r)
  }

  /** The gesture for an intent, against the board on screen now; null when there is nothing to do (the tool is in hand, the sticker used up, nothing to aim at). */
  private start(game: Game, view: View, t: number, intent: Intent): Gesture | null {
    const s = game.state
    const finger = this.kid.finger
    const mm = this.kid.mm(view)
    const press = (kind: string, call: (g: Game) => void) => new Press(kind, t + between(this.r, finger.press), call, false)
    switch (intent.kind) {
      case 'tool':
        return sameTool(s.tool, intent.tool) ? null : press('tool', (g) => trayTap(g, keyOf(intent.tool)))
      case 'button':
        return press('button', (g) => trayTap(g, intent.key))
      case 'oops':
        return press('oops', (g) => {
          if (g.hud.tray.oops) g.dispatch({ kind: 'oops' })
        })
      case 'card':
        return press('card', (g) => g.dispatch({ kind: 'card' }))
      case 'play':
        return press('play', (g) => g.play())
      case 'closePath':
        return press('closePath', (g) => g.closePath())
      case 'choose':
        // A phone's narrow lab card shows one picture: its tap opens the path, where she picks (the choice card, while it is up, has both).
        if (view.hud.held === 'phone' && !game.path && !game.hud.ask) {
          this.queue.unshift(intent)
          return press('labCard', (g) => g.openPath())
        }
        return press('choose', (g) => g.choose(intent.card))
      case 'goodnight':
        // The menu holds the sim, so its Good night waits on the real clock: a look at the menu, then the press.
        this.menu = true
        return new Chain('goodnight', [() => press('pause', (g) => g.openPause()), (g) => new Press('goodnight', g.clock + between(this.r, MENU_LOOK) + between(this.r, finger.press), (h) => h.goodnight(), true)])
      case 'tap':
        return this.tap(s, view, t, 'tap', intent.hit, finger.press)
      case 'dig':
        return this.tap(s, view, t, 'dig', { kind: GROUND[intent.cell] === 'pond' ? 'pond' : 'patch', cell: intent.cell }, finger.press)
      case 'tickle':
        return this.tap(s, view, t, 'tickle', { kind: 'muncher', id: intent.id }, finger.press)
      case 'point': {
        const p: Pt = [intent.x, intent.y]
        return new Touch('point', this.newId, () => p, t, t + between(this.r, finger.press), null, null, () => {})
      }
      case 'trace': {
        const pts = intent.cells.map((c): Pt => toScreen(view, xOf(c) + 0.5, yOf(c) + 0.5))
        return this.drag(view, t, 'trace', pts, null)
      }
      case 'carry': {
        const b = game.hud.tray.stickers.find((x) => x.sticker === intent.sticker)
        // A used-up sticker is a hole in the backing paper: nothing to drag off it.
        if (b === undefined || b.left <= 0) return null
        const box = trayButton(view.hud, game.hud.tray, intent.sticker)
        const [dx, dy] = landing(this.r, finger, mm)
        const from: Pt = [box.x + box.w / 2 + dx, box.y + box.h / 2 + dy]
        // She aims the sticker she holds above her fingertip, not her fingertip, and her finger stops where it lands with a tap's scatter.
        const [ax, ay] = fingerFor(view, intent.x, intent.y, SIZE[intent.sticker])
        const [ex, ey] = landing(this.r, finger, mm)
        return this.drag(view, t, 'carry', [from, [ax + ex, ay + ey]], intent.sticker)
      }
    }
  }

  /** A tap (or a dig's press, or a tickle) on `hit`: aimed at a point the hit test gives to it, landing with the finger's scatter, lasting `span` and sliding meanwhile; null with nothing to aim at. */
  private tap(s: State, view: View, t: number, kind: string, hit: Hit, span: readonly [number, number]): Gesture | null {
    const target = aimAt(s, view, t, hit)
    if (target === null) {
      this.log.unaimed++
      return null
    }
    const mm = this.kid.mm(view)
    const f = this.kid.finger
    const [dx, dy] = landing(this.r, f, mm)
    const [sx, sy] = off(this.r, this.r() * f.slide * mm)
    const start = t
    const end = t + between(this.r, span)
    const way = (u: number): Pt => {
      const k = end > start ? Math.min(1, Math.max(0, (u - start) / (end - start))) : 1
      return [target[0] + dx + sx * k, target[1] + dy + sy * k]
    }
    return new Touch(kind, this.newId, way, start, end, null, null, (g, p) => {
      if (!sameHit(hitTest(g.state, g.view!, p[0], p[1], g.frameTime), hit)) this.log.missed[kind] = (this.log.missed[kind] ?? 0) + 1
    })
  }

  /**
   * A drag through screen points at the finger's speed, swaying, resting a moment at its end,
   * and one in loseEvery skipping off the glass part way; from a tray sticker's button when
   * `tray` is set (a carry, whose sway dies away as the finger settles onto its aim). A stroke on
   * the board has the heel of the hand land first one time in HEEL_EVERY.
   */
  private drag(view: View, t: number, kind: string, pts: readonly Pt[], tray: Placeable | null): Gesture {
    const f = this.kid.finger
    const mm = this.kid.mm(view)
    const lengths = [0]
    for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
    const total = lengths[lengths.length - 1]!
    const speed = between(this.r, f.speed) * mm
    const wobble = sway(this.r, f.wobble * mm)
    // A sticker is pressed a moment on its button before it moves; every drag rests a moment at its end.
    const go = t + (tray === null ? 0 : between(this.r, SETTLE_END))
    const arrive = go + total / speed
    const end = arrive + between(this.r, SETTLE_END)
    const lost = f.loseEvery > 0 && this.r() * f.loseEvery < 1 ? ((at: number): readonly [number, number] => [at, at + between(this.r, f.lose)])(go + (arrive - go) * between(this.r, [0.25, 0.75])) : null
    // The sway grows over the first half cell, as the finger lands where she means; a stroke's lasts to its end (the router's turn at the lift answers it), a carry's dies away over the last half cell as she settles the sticker.
    const ease = view.cell / 2
    const way = (u: number): Pt => {
      const d = Math.min(total, Math.max(0, (u - go) * speed))
      const [x, y] = along(pts, lengths, d)
      const [wx, wy] = wobble(u)
      const k = Math.min(1, d / ease, tray === null ? 1 : (total - d) / ease)
      return [x + wx * k, y + wy * k]
    }
    if (tray !== null || this.r() * HEEL_EVERY >= 1) return new Touch(kind, this.newId, way, t, end, lost, tray, () => {})
    // The heel lands first, below the fingertip's first point, and slides with the hand; the fingertip comes a moment later.
    const lead = between(this.r, HEEL_LEAD)
    const below = between(this.r, HEEL_MM) * mm
    const late = (u: number) => way(u - lead)
    const heel = new Touch('heel', this.newId, (u) => [late(u)[0], late(u)[1] + below], t, end + lead, null, null, () => {})
    return new Both(kind, heel, new Touch(kind, this.newId, late, t + lead, end + lead, lost === null ? null : [lost[0] + lead, lost[1] + lead], null, () => {}))
  }

  /** The thumb, for a child that rests one on the glass: down once the game is playing, at its rest point, and jiggling there all session. */
  private rest(game: Game, view: View, t: number): void {
    const at = this.kid.thumb
    if (at === null) return
    const mm = this.kid.mm(view)
    if (this.thumb === null) {
      if (inputHeld(game.state, t)) return
      let x: number
      let y: number
      const f = view.hud.free
      if (at === 'edge') {
        const d = (3 + 9 * this.r()) * mm
        x = this.r() < 0.5 ? d : view.w - d
        y = f.y + f.h * (0.2 + 0.6 * this.r())
      } else [x, y] = toScreen(view, at.x, at.y)
      this.thumb = { id: this.newId(), x, y }
      game.pointer('down', this.thumb.id, x, y, 'touch')
      return
    }
    const [jx, jy] = off(this.r, this.r() * JIGGLE * mm)
    game.pointer('move', this.thumb.id, this.thumb.x + jx, this.thumb.y + jy, 'touch')
  }

  /** A frantic tapper's quick tap at one of the munchers out, any one, FRANTIC_EVERY after the last. */
  private frenzy(game: Game, view: View, t: number): void {
    const out = game.state.munchers.filter((m) => m.mode !== 'home' && m.mode !== 'watch')
    const m = out[Math.floor(this.r() * out.length)]!
    this.franticAt = t + FRANTIC_EVERY
    this.gesture = this.tap(game.state, view, t, 'frantic', { kind: 'muncher', id: m.id }, [0.1, 0.3])
    if (this.gesture !== null) this.log.gestures.frantic = (this.log.gestures.frantic ?? 0) + 1
  }

  /** A cell of the open land, at random. */
  private cell(s: State): number {
    const l = LANDS[s.land]
    return cellOf(l.x0 + Math.floor(this.r() * (l.x1 - l.x0 + 1)), l.y0 + Math.floor(this.r() * (l.y1 - l.y0 + 1)))
  }

  /** A walk of about `n` cells over the open land from cell c: straight runs of up to `run` cells, then a turn left or right. */
  private walk(s: State, c: number, n: number, run: number): number[] {
    const cells = [c]
    let d = Math.floor(this.r() * 4)
    for (let tries = 0; cells.length < n && tries < 4 * n; tries++) {
      const k = 1 + Math.floor(this.r() * run)
      for (let i = 0; i < k && cells.length < n; i++) {
        const last = cells[cells.length - 1]!
        const x = xOf(last) + DX[d]!
        const y = yOf(last) + DY[d]!
        if (!inLand(s.land, x, y)) break
        cells.push(cellOf(x, y))
      }
      d = (d + (this.r() < 0.5 ? 1 : 3)) % 4
    }
    return cells
  }

  /** The chaos child's whim: a tap anywhere, a short stroke, a sticker dropped anywhere, the peel on anything (and again), Oops, a tray button, a hedge line, a muncher tickled. */
  private chaos(game: Game, view: View, t: number): Intent[] {
    const s = game.state
    const tray = game.hud.tray
    const f = view.hud.free
    const u = this.r()
    const anywhere = (): Intent => ({ kind: 'point', x: f.x + this.r() * f.w, y: f.y + this.r() * f.h })
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(this.r() * xs.length)]!
    if (u < 0.3) return [anywhere()]
    if (u < 0.5) return [{ kind: 'trace', cells: this.walk(s, this.cell(s), 2 + Math.floor(this.r() * 9), 4) }]
    if (u < 0.65) {
      const left = tray.stickers.filter((b) => b.left > 0)
      if (left.length === 0) return [anywhere()]
      const l = LANDS[s.land]
      return [{ kind: 'carry', sticker: pick(left).sticker as Placeable, x: l.x0 + this.r() * (l.x1 + 1 - l.x0), y: l.y0 + this.r() * (l.y1 + 1 - l.y0) }]
    }
    if (u < 0.75) {
      const things = targets(s, view, t).filter((tg) => tg.hit.kind === 'building' || tg.hit.kind === 'belt' || tg.hit.kind === 'hedge' || tg.hit.kind === 'thing')
      if (things.length === 0) return [anywhere()]
      const hit = pick(things).hit
      const tap: Intent = { kind: 'tap', hit }
      return this.r() < 0.5 ? [{ kind: 'tool', tool: { kind: 'peel' } }, tap, tap] : [{ kind: 'tool', tool: { kind: 'peel' } }, tap]
    }
    if (u < 0.83) return [{ kind: 'oops' }]
    if (u < 0.9) return [{ kind: 'button', key: pick<TrayKey>(['pencil', 'peel', ...tray.stickers.map((b) => b.sticker), ...(tray.hedge === null ? [] : ['hedge' as const])]) }]
    if (u < 0.95 && tray.hedge !== null && tray.hedge.left > 0) return [{ kind: 'tool', tool: { kind: 'hedge' } }, { kind: 'trace', cells: this.walk(s, this.cell(s), 2 + Math.floor(this.r() * 5), 3) }]
    const out = s.munchers.filter((m) => m.mode !== 'watch')
    return out.length === 0 ? [anywhere()] : [{ kind: 'tickle', id: pick(out).id }]
  }

  /** The belts-everywhere child's stroke: the pencil, then a long snake of 10 to 40 cells from anywhere on the land. */
  private belts(s: State): Intent[] {
    return [{ kind: 'tool', tool: { kind: 'pencil' } }, { kind: 'trace', cells: this.walk(s, this.cell(s), 10 + Math.floor(this.r() * 31), 10) }]
  }
}
