/**
 * Magic House: the room's API as made code sees it: types and reference text (plan.md, The
 * contract, in outline), built by engine/builder.ts and run by the sim.
 *
 * A room is the body of `function (r, w)`. It runs once, before play, and builds the whole room
 * with the builder `r` for exactly the party in front of it at `w.level()`; then it returns the
 * function that runs every frame, or nothing. `w` is the world as made code sees it.
 *
 * The reference is the prompt, and it is true. Beside every interface is its reference text, one
 * line a call, in a const that `satisfies Record<keyof TheInterface, string>` (or `Own<>` keys
 * where it extends another), so the compiler proves every call has exactly one line and no line
 * names a call that does not exist. ROOM_PREAMBLE, ROOM_RULES and the sections of ROOM_REFERENCE
 * are what the server's prompt (step 4) joins; a test in step 3 fails when the engine does not do
 * what a line says. Every number a line states comes from a const here (FEEL, ROOM, LIGHT_RANGE,
 * SIZES, DEFAULTS, BUDGET, PASS, TRIAL, WORDS_MAX, REFEREE), which the sim and the trial import, so
 * the text cannot drift from the engine.
 *
 * Written for a model that writes a whole room and its walkthrough cold, at low effort:
 * - One rule for reads: a handle has only calls, never fields (`p.at()`, `w.level()`). Handles are
 *   Proxies over frozen objects. A read of a key a handle lacks, a write, or a call used as a value
 *   (its conversion throws, so `zone.weight >= 1` and `p.at[0]` are caught) comes back as a
 *   MISTAKES sentence. A Proxy cannot catch truthiness (`if (p.holding)` is always true), so the
 *   trial's static scan of the room's text flags a call's name read without `(` in a condition,
 *   with the same notCalled sentence.
 * - Everything is built before play; things appear later by being built hidden and shown. So no
 *   builder call ever gives back null, the sim's arrays keep one shape for life (zones keep their
 *   members as a bitmask), and the bots' search knows every body from the start.
 * - One budget for all the build builds (BUDGET.pieces), with "build lighter" when it overruns.
 *   Every shape drawn counts, a reused model's shapes each time it is placed, because the tablet
 *   draws them all; reuse is cheaper only in the code's own counted turns.
 * - "Frame" always means 1/60 s; a "step" is only one of the room's list.
 * - Points are always [x, y, z], in either view. Every line that differs from high up says so, with
 *   every axis and sign given with the thing itself (step 6): the 'floor' stick, ramps rising 'back'
 *   or 'front', turns round y, belts and winds along z, the floor's frame. floor.test.ts proves them.
 * - Trailing option objects, and every field in them, are optional, with the default stated in
 *   the line: made code really has nothing to pass for most options, and a fix round costs a
 *   minute of Opus. Positional arguments are required, but for three trailing ones made code
 *   mostly has nothing for: w.finish's order (only a contest gives one), glow's pulse, and the
 *   walkthrough's w.until secs. This is the one place the repo's strict parameters are bent, on
 *   purpose, and only for what made code calls.
 *
 * The sim (step 2) follows FRAME_ORDER exactly, made code's Math is the engine's own (MATH below),
 * and every room is the same size, seen whole by a camera that never moves (ROOM, step 7a). The
 * room's shell, which the house draws round it, comes in the answer (Shell). The walkthrough's API
 * is `trial/api.ts`; the kit and a present are `engine/gift.ts`; the look, which another call
 * writes to dress the room, is `engine/look.ts`.
 */

import type { Words } from '../../../profiles/src/lang'
import { KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import { PUFF_KINDS, type PuffKind } from '../../../silly-billy/src/engine/types'
import { KIT_SHAPES_REF, MODEL_PREAMBLE, ROOM_PART_REF, SHAPE_OPTS_REF, type Model } from './gift'
import { HOUSE_SOUNDS, type HouseSound } from './sounds'
import { PATTERN_ORDER, type PatternName } from '../patterns/patterns'
import type { LookBuilder } from './look'

// ------------------------------------------------------------------------------ the numbers the reference states

/**
 * How a player moves, as the reference states it; the sim's controller is tuned to give exactly
 * these, and a test holds it to them. Weight is counted in children: one child is 1.
 */
export const FEEL = {
  /** m/s², on players and loose things alike. */
  gravity: 20,
  height: KID_HEIGHT,
  width: 0.5,
  /** m/s. */
  walk: 4,
  /** Walked up onto without a jump, metres. */
  stepUp: 0.3,
  /** Degrees: steeper tops are slid down. */
  slope: 45,
  /** How high a held jump lifts the feet, and a short press. */
  jumpHigh: 1.6,
  jumpLow: 0.8,
  /** The widest gap a running jump clears, metres. */
  jumpAcross: 3,
  /** Where a throw while walking lands on the level, metres ahead. */
  throwAhead: 4,
  /** How fast a pushed thing moves, m/s. */
  pushSpeed: 2,
  /** How near the hands reach, metres from the player's edge: grab and use act within it, and a bot's goTo to a thing stops within it. */
  reach: 0.6,
  /** The heaviest thing grab picks up. */
  carryMax: 0.5,
} as const

/**
 * One size, the same in every room, seen whole by a camera that never moves (step 7a, replacing the
 * rolled 'one screen or bigger'). The size belongs to the engine, so a room plays the same on every
 * device, a kept room needs no size of its own, and the bots have one geometry.
 * - side: x from -width/2 to width/2, y from 0 (the house's floor) to height (the ceiling); the back
 *   wall at z back, the open front at z front.
 * - high: the floor x ±width/2 and z from -depth/2 (the back wall) to depth/2 (the open front);
 *   players held under height; the walls drawn wallHigh tall, and no ceiling.
 * - wall, beam, lip: how thick the house is round the inside, metres: its walls, the ceiling's beam
 *   and the floor's front lip. The camera's frame shows them (engine/camera.ts).
 * The house builds its floor, walls and ceiling as solids of its own once the room code has run
 * (world.ts Solid.house), so players are held inside by them and nobody falls out of the room.
 */
export const ROOM = {
  side: { width: 16, height: 8, back: -3, front: 1.5 },
  high: { width: 14, depth: 8, height: 3, wallHigh: 2.5 },
  wall: 0.3,
  beam: 0.4,
  lip: 0.4,
} as const

/** How bright a room may be (Shell.light): at least `least`, and below `dim` it is dim, and the scene helps it (step 7a, Light). */
export const LIGHT_RANGE = { least: 0.6, dim: 0.8 } as const

/** How many of the room's lamps and the look's light the room for real (the strongest shown); the others shine as halos. The scene and the look's lamp line share it, and the engine never imports the scene. */
export const LAMPS_LIT = 4

/** Sizes the engine's own things have, metres: the way out's door, a sign's height, and the least a thing that matters should measure across to read from far. */
export const SIZES = { doorWidth: 1.2, doorHeight: 2.2, signHeight: 0.6, smallest: 0.4 } as const

/** What an option left out is, where the line states it. */
export const DEFAULTS = {
  thingWeight: 0.3,
  lampPower: 0.7,
  lampReach: 6,
  puffCount: 12,
  puffMax: 40,
  puffSize: 0.15,
  shakeSecs: 0.5,
  popSecs: 1,
} as const

/**
 * Limits, counted and never timed (plan.md, One seed, and weight that is counted).
 * - pieces: the build's one budget. Each handle built is 1 piece, and each shape of a model is 1
 *   more every time that model is placed.
 * - buildTurns: loop turns and calls into the engine while the room's code first runs.
 * - frameTurns: the same for all the room's code that runs in one frame (the frame function, every
 *   handler and every mover's place).
 * - placeTurns: each call of a mover's place on its own, since the bots' search also asks it about
 *   future times.
 * - lamps, steps: the most a room may have.
 */
export const BUDGET = { pieces: 5000, buildTurns: 1_000_000, frameTurns: 20_000, placeTurns: 200, lamps: 12, steps: 8 } as const

/**
 * A clean pass by the bots, in seconds of the game's clock. The trial judges by the steps, never by
 * the end alone: a pass has every step done, in order, and the room finished by w.finish between
 * minSecs and maxSecs. A room with r.clock lasts its clock (clockMin to clockMax): its pass has every
 * step done before the clock runs out, and if w.finish ends it first, that is not before minSecs.
 * aimSecs is what a room is planned for, the middle of the range: the first rooms Opus made aimed at
 * the minute itself and came out short, since the bots know the way and lose no time.
 */
export const PASS = { minSecs: 60, maxSecs: 120, clockMin: 180, clockMax: 300, aimSecs: 90 } as const

/**
 * The trial's own numbers. The second seed is the room's seed plus secondSeedOffset (its
 * walkthrough's stream that plus MATH.walkSeedOffset, so no two streams meet). stillSecs of
 * everyone standing still and randomSecs of random pressing and tapping come before the
 * walkthrough; the random presses draw from a stream of the trial's own, the room's seed plus
 * randomSeedOffset (past the second seed's walkthrough stream). When the walkthrough's code ends
 * before the room does, the bots stand still and the room has doneSecs more to finish (a thing
 * thrown last still lands; a room may wait a little after its last step before w.finish). realSecs is the whole trial's budget in the worker's real time; the
 * page kills the worker well past it.
 */
export const TRIAL = { secondSeedOffset: 2, stillSecs: 30, randomSecs: 60, randomSeedOffset: 4, doneSecs: 10, realSecs: 60 } as const

/** The most words, in each language, for each kind of child's text. The trial counts them. */
export const WORDS_MAX = { button: 2, hint: 8, rule: 12, sign: 4, pop: 3, name: 4 } as const

/**
 * The referee's numbers: a change lasts at most changeSecs; a bonk stills for bonkSecs; size stays
 * within sizeMin..sizeMax; and the freedom rule. A player who has been bonked cannot be bonked again
 * for freeAfter seconds. A player held still by any mix of a bonk, a speed change below slow (which
 * counts as speed 0) and being pinned by p.putAt for freeAfter seconds in a row is free for the next
 * freeAfter seconds: bonk, a slow change and putAt do nothing to them then. Pinned means put by
 * p.putAt within the last pinSecs and still within pinRadius metres of where the run began, so a room
 * that moves a player along with putAt (a stick 'none' room) is not holding them, and a put every
 * other frame still is. So nobody is kept from playing for more than freeAfter seconds at a time.
 */
export const REFEREE = { freeAfter: 2, changeSecs: 20, bonkSecs: 1, sizeMin: 0.5, sizeMax: 2, slow: 0.25, pinSecs: 0.25, pinRadius: 0.25 } as const

/**
 * Made code's Math: the engine's own. `random` is the room's seeded stream; sin, cos, tan, atan,
 * atan2, exp, log, pow and hypot are computed from + - * / and sqrt only (an fdlibm port), and asin,
 * acos, the hyperbolic ones, expm1, log1p, log2, log10 and cbrt from those, because the browsers' own
 * may differ in the last bit between V8 and JavaScriptCore and one bit can flip a borderline pass;
 * the rest (floor, abs, min, max, sqrt...) are the page's, which are exact. The
 * sim uses the same functions for its own turns and eases. While a mover's place runs, `random`
 * throws (MISTAKES.randomInPlace): the bots' search calls place for future times, and a draw there
 * would move the room's stream, so the trial and the children would play different rooms. The
 * walkthrough draws from a stream of its own, the room's seed plus one, and the look (engine/look.ts)
 * one of its own at the room's seed plus lookSeedOffset: past every stream the trial draws (the
 * walkthrough +1, the second seed +2 and its walkthrough +3, the random pressing +4), so building the
 * look never moves the room's stream or meets another.
 */
export const MATH = { walkSeedOffset: 1, lookSeedOffset: 6 } as const

/** A big number as the reference says it: 1,000,000. */
export const big = (n: number) => n.toLocaleString('en')
/** A length the reference works out from its consts, said to the centimetre (3 - 1.15 is 1.85, never 1.8499999999999999). */
const metres = (v: number) => Math.round(v * 100) / 100

// ------------------------------------------------------------------------------ plain values

/** A point, metres: x to the right, y up, z toward the viewer. Always three numbers; what the engine gives back is frozen. */
export type Point = readonly [number, number, number]
/** A size, metres, along x, y and z: [w, h, d]. */
export type Size = readonly [number, number, number]
/** A turn of a model's part, radians, round x, then y, then z. */
export type Rot = readonly [number, number, number]
export type Level = 1 | 2 | 3
/** What a handle is, as `kind()` says it. */
export type Kind = 'solid' | 'mover' | 'thing' | 'decor' | 'zone' | 'lamp' | 'sign' | 'player'
/** Which way a ramp's slope goes up: 'right' (+x) and 'left' (-x) in either view; from high up also 'back' (-z, away from the viewer) and 'front' (+z). */
export type Rise = 'right' | 'left' | 'back' | 'front'
/** How the stick moves a player: 'walk' only from the side and 'floor' only from high up; 'fly' and 'none' in either view. */
export type StickMode = 'walk' | 'floor' | 'fly' | 'none'
/** A count shown as dots, `count` of `of` filled. */
export interface Count {
  readonly count: number
  readonly of: number
}
/** A ring that empties over `clock` seconds from when it is written, by itself. */
export interface SignClock {
  readonly clock: number
}
/** What a sign shows. */
export type SignText = number | Words | Count | SignClock

/** The keys an interface adds to the ones it extends: its own calls, which get their own lines. */
export type Own<T, Base> = Exclude<keyof T, keyof Base>

/** A section of reference text: a title line, then one line a call. The server's prompt joins them. */
export interface RefSection {
  readonly title: string
  readonly lines: Readonly<Record<string, string>>
}

// ------------------------------------------------------------------------------ the room's code

/** The room: the body of `function (r, w)`, compiled behind the guard. It returns its frame function, or nothing. */
export type RoomCode = (r: Builder, w: World) => Tick | void
/** Runs every frame of play, 60 a second; dt is always 1/60. */
export type Tick = (dt: number) => void

/**
 * The fixed order of one frame. Determinism depends on it (a replay, a second seed, vitest against
 * the worker), so the sim follows it exactly and a test holds it. Within a phase, handlers go by
 * the build order of the handle they belong to, then by seat.
 * - buttons: the seats' sticks and buttons (or the bots'); a room's own button press, hold and
 *   release, in seat order, button a before b.
 * - taps: taps and clicks in the order they came, each to its handle's tap or else r.tap; the
 *   pointers held are set.
 * - movers: clocks, places, slides and turns; what they carry and push; squeezes.
 * - players: controllers in seat order, with zones' pulls and surfaces; grab and use.
 * - things: loose things in build order: engine slides, then physics.
 * - contacts: touch and land begun this frame, by the touched handle's build order, then the
 *   toucher's (players by seat, then things by build order).
 * - zones: enter, stay and leave, by zone build order; within a zone players by seat, then things.
 * - timers: w.after callbacks that are due, in the order they were set.
 * - frame: the room's frame function.
 * - steps: the next step's done(); when true it is marked done, and the step after it is asked from
 *   the next frame on (the trial reports a step whose done() is true the first frame it is asked:
 *   WALK_MISTAKES.stepEarly).
 * - referee: falls, coming home, the freedom rule, the camera's frame, the helper (a ? press comes
 *   in FrameInput.help), then the end: a w.finish called this frame, or r.clock running out.
 */
export const FRAME_ORDER = ['buttons', 'taps', 'movers', 'players', 'things', 'contacts', 'zones', 'timers', 'frame', 'steps', 'referee'] as const
export type FramePhase = (typeof FRAME_ORDER)[number]

/** One step of the room's list (r.steps): the dots at the top of the screen and the helper read it. */
export interface StepSpec {
  readonly hint: Words
  readonly at: Point | Placed | Mover | Player
  readonly done: () => boolean
}

export const STEP_REF = {
  hint: `hint   what to try, { en, fi }, at most ${WORDS_MAX.hint} words in each, never the whole answer: when the children are stuck the helper flies to at, and later says this`,
  at: 'at   where it happens: a point, or a handle (the helper flies to it wherever it is then)',
  done: 'done()   true once the step is done. Only the next step is asked, every frame, so the steps are done in order; once it says true, the step stays done',
} as const satisfies Record<keyof StepSpec, string>

// ------------------------------------------------------------------------------ the builder's options

/** Options every builder call that gives back a handle may take. */
export interface SharedOpts {
  readonly name?: string
  readonly hidden?: boolean
  readonly tap?: (at: Point) => void
}

export const SHARED_OPTS_REF = {
  name: 'name   a word the walkthrough finds it by, w.get(name); every name different',
  hidden: 'hidden   true: built hidden (not drawn, touches and notices nothing, and a thing hangs where it was put, not falling) until .show()',
  tap: 'tap(at)   a tap or a click on it, from anyone (the room is not told who); at is the point: from the side on z = 0, from high up on what was tapped (where the line from the eye through the finger first meets something). A tap goes to the handle nearest the viewer under it that has a tap of its own (from high up, the highest at that point); one that lands on none goes to r.tap',
} as const satisfies Record<keyof SharedOpts, string>

/** What players and things do to a solid, a mover or a thing. */
export interface ContactOpts {
  readonly touch?: (who: Who) => void
  readonly land?: (who: Who) => void
  readonly use?: (p: Player) => void
}

export const CONTACT_OPTS_REF = {
  touch: 'touch(who)   a player or a thing began to touch it, once each time they meet',
  land: 'land(who)   a player or a thing came onto its top, by coming down on it or by walking on from something else',
  use: `use(p)   a player pressed the button whose job is grab within ${FEEL.reach} m of it, with empty or full hands (p.holding() says what they carry, which they keep); a thing with use is used, never carried. Give the players who should use it a button whose job is grab`,
} as const satisfies Record<keyof ContactOpts, string>

export interface SolidOpts extends SharedOpts, ContactOpts {
  readonly color?: string
  readonly model?: Model
  readonly turn?: number
  readonly ice?: boolean
  readonly bounce?: number
  readonly belt?: Point
  readonly through?: boolean
}

export const SOLID_OPTS_REF = {
  color: "color   '#rrggbb' or a colour name, where its colour matters to the play; left out, it takes the shell's floor colour, and the room's look may dress it as a thing of the theme",
  model: 'model   a model (m) => { ... } drawn in place of the plain shape, standing on the middle of its bottom and facing +z; it still touches as the plain shape, so keep its top where the shape\'s top is',
  turn: 'turn   radians round its middle: from the side round z, counterclockwise on the screen; from high up round y, counterclockwise as seen from above (+x turns toward -z)',
  ice: 'ice   true: slippery; whoever walks on it slides',
  bounce: 'bounce   metres: whoever lands on it is thrown that high above its top, however far they fell',
  belt: 'belt   m/s: whoever stands on it is carried along at that speed: [vx, vy, 0] from the side, [vx, 0, vz] along the floor from high up',
  through: 'through   true: a floor one jumps up through from below and stands on; from the side holding the stick down drops through it, from high up nothing drops through it',
} as const satisfies Record<Own<SolidOpts, SharedOpts & ContactOpts>, string>

/** A solid's surface, changed during play with `set`. */
export type SolidChanges = Pick<SolidOpts, 'color' | 'ice' | 'bounce' | 'belt' | 'through'>

/** Where a mover's origin is at t, the mover's own clock in seconds: a function of t alone. */
export interface MoverPlace {
  readonly at: Point
  readonly turn?: number
}

export type MoverOpts = SharedOpts & ContactOpts

export interface ThingOpts extends SharedOpts, ContactOpts {
  readonly weight?: number
  readonly round?: boolean
  readonly scale?: number
}

export const THING_OPTS_REF = {
  weight: `weight   how heavy, where one child is 1; ${DEFAULTS.thingWeight} if left out. Up to ${FEEL.carryMax} is carried with grab; a heavier thing is only pushed, and moves only while those pushing it weigh at least as much together (from high up, those pushing within 45 degrees of the way it goes)`,
  round: 'round   true: it touches as a ball and looks as if it rolls',
  scale: "scale   draws it, and it touches, at this many times its model's size; 1 if left out",
} as const satisfies Record<Own<ThingOpts, SharedOpts & ContactOpts>, string>

export interface DecorOpts extends SharedOpts {
  readonly scale?: number
}

export const DECOR_OPTS_REF = {
  scale: "scale   draws it at this many times its model's size; 1 if left out",
} as const satisfies Record<Own<DecorOpts, SharedOpts>, string>

export interface ZoneOpts extends SharedOpts {
  readonly color?: string
  readonly wind?: Point
  readonly pull?: number
  readonly gravity?: number
  readonly drag?: number
  readonly enter?: (who: Who) => void
  readonly stay?: (who: Who, dt: number) => void
  readonly leave?: (who: Who) => void
}

export const ZONE_OPTS_REF = {
  color: 'color   draws it as a soft see-through box of this colour, so the children see it; unseen if left out',
  wind: `wind   m/s², [ax, ay, 0] from the side and [ax, ay, az] from high up: pushes whoever is in it that way, a heavier body less (ay over ${FEEL.gravity} lifts a player)`,
  pull: 'pull   m/s² toward its middle; below 0 pushes out',
  gravity: 'gravity   how hard the world pulls in it: 1 as everywhere, 0 floating, below 0 lifting. From the side, where it is 0 or less, the stick also moves a walking player up and down; from high up the stick still walks them across and they float',
  drag: 'drag   0 to 1: slows whoever moves in it, 1 as thick as honey',
  enter: 'enter(who)   a player or a thing came in',
  stay: 'stay(who, dt)   every frame, for each player and thing in it',
  leave: 'leave(who)   a player or a thing went out, or was hidden',
} as const satisfies Record<Own<ZoneOpts, SharedOpts>, string>

/** A zone's pulls, changed during play with `set`. */
export type ZoneChanges = Pick<ZoneOpts, 'color' | 'wind' | 'pull' | 'gravity' | 'drag'>

export interface LampOpts extends SharedOpts {
  readonly color?: string
  readonly power?: number
  readonly reach?: number
}

export const LAMP_OPTS_REF = {
  color: "color   '#rrggbb' or a colour name; warm white if left out",
  power: `power   0 to 1; ${DEFAULTS.lampPower} if left out`,
  reach: `reach   metres it lights round it; ${DEFAULTS.lampReach} if left out`,
} as const satisfies Record<Own<LampOpts, SharedOpts>, string>

export type LampChanges = Pick<LampOpts, 'color' | 'power' | 'reach'>

export type SignOpts = SharedOpts

/** A surface of the shell: its colour, a second colour and a pattern of the game's set laid in it (patterns/patterns.ts). */
export interface Paint {
  readonly color: string
  readonly second: string
  readonly pattern: PatternName
}

/**
 * The room's shell, in the answer (RoomAnswer.shell): what the house draws round everything the room
 * code builds, before it runs, so a room whose look failed is still a room of its theme. The game's
 * designer owns the palette and the light, because its play's colours must read against them.
 */
export interface Shell {
  readonly walls: Paint
  readonly floor: Paint
  readonly ceiling: Paint
  readonly trim: string
  readonly light: number
}

export const SHELL_REF = {
  walls: `walls   the walls' paint { color, second, pattern }: color '#rrggbb' or a colour name; pattern one of ${PATTERN_ORDER.join(' ')}, laid in second over color all over them, softly: where second stands far from color the house draws it nearer to color, so the walls stay a calm background to the play in any light (plain: color alone)`,
  floor: "floor   the floor's paint { color, second, pattern }, as the walls' and as softly. Floors and ledges the room code builds without a colour take its color",
  ceiling: "ceiling   the ceiling's paint { color, second, pattern }, as the walls' and as softly (seen from high up there is no ceiling; give it all the same)",
  trim: "trim   a colour for the room's edges: the strips along the floor and under the ceiling, the walls' cut edges and the way out's frame",
  light: `light   how bright the room is, ${LIGHT_RANGE.least} to 1: 1 is a room by day where every part shows; below ${LIGHT_RANGE.dim} the room is dim, and its lamps, small lights and glowing shapes shine out`,
} as const satisfies Record<keyof Shell, string>

/** A job of the room's own, with what the pads show. */
export interface OwnButton {
  readonly word: Words
  readonly icon: Model
  readonly press?: (p: Player) => void
  readonly hold?: (p: Player, dt: number) => void
  readonly release?: (p: Player) => void
}

export const OWN_BUTTON_REF = {
  word: `word   what it does, { en, fi }, at most ${WORDS_MAX.button} words in each, shown beside the picture`,
  icon: "icon   a model of what it does, drawn small on the button: any model function will do, one of the room's own things' too",
  press: 'press(p)   p pressed it',
  hold: 'hold(p, dt)   every frame while p holds it down',
  release: 'release(p)   p let it go',
} as const satisfies Record<keyof OwnButton, string>

/** A button's one job for the whole room. */
export type ButtonJob = 'jump' | 'grab' | OwnButton

export interface Controls {
  readonly stick?: StickMode
  readonly a?: ButtonJob
  readonly b?: ButtonJob | null
}

export const CONTROLS_REF = {
  stick:
    "stick   how the stick moves them: from the side 'walk' (left and right, jumping with the button whose job is 'jump', and up and down where a zone's gravity is 0 or less); from high up 'floor' (any way on the floor: the stick's right walks them toward +x and its up toward -z, away from the viewer, jumping with the button whose job is 'jump'); in either view 'fly' (from the side any way in the plane, from high up any way across the floor at the height they are, the world not pulling them) or 'none' (not at all, and they still fall: the room reads p.stick() and moves them itself, with p.putAt each frame or p.push)",
  a: `a   the job of button a, all room long: 'jump', 'grab' (uses what has use within reach, with full hands too; else picks up a thing of weight up to ${FEEL.carryMax} or puts it down, throws it while walking), or a job of the room's own, { word, icon, press, hold, release }`,
  b: 'b   the job of button b, as a; null for no second button. The two buttons have different jobs',
} as const satisfies Record<keyof Controls, string>

// ------------------------------------------------------------------------------ the builder

/**
 * The builder. Its calls work only while the room's code first runs (MISTAKES.afterBuild). Every
 * call that builds gives back a handle, never null: past a limit the build stops with a sentence.
 * From the side, a body's z (a solid's, a mover's origin, a thing's, a zone's, a player's start)
 * is set to 0 whatever is given, and the survey notes it (SURVEY_NOTES.zSet); only decor keeps z.
 * The room's size and shell are the house's (ROOM, Shell), so the builder has no bounds or sky; its
 * face refuses the keys of BUILDER_REFUSED, each with its own sentence.
 */
export interface Builder {
  box(at: Point, size: Size, opts?: SolidOpts): Solid
  ramp(at: Point, size: Size, rises: Rise, opts?: SolidOpts): Solid
  ball(at: Point, radius: number, opts?: SolidOpts): Solid
  mover(build: (r: Builder) => void, place: (t: number) => MoverPlace, opts?: MoverOpts): Mover
  thing(at: Point, model: Model, opts?: ThingOpts): Thing
  decor(at: Point, model: Model, opts?: DecorOpts): Decor
  zone(at: Point, size: Size, opts?: ZoneOpts): Zone
  lamp(at: Point, opts?: LampOpts): Lamp
  sign(at: Point, what: SignText, opts?: SignOpts): Sign
  wayOut(at: Point): void
  controls(players: readonly Player[], spec: Controls): void
  steps(list: readonly StepSpec[]): void
  rule(words: Words): void
  clock(secs: number): void
  pushing(on: boolean): void
  tap(fn: (at: Point) => void): void
}

/**
 * Keys the builder's face refuses with a sentence of their own (engine/checks.ts face, `refused`),
 * so a room that reaches for them hears why: bounds and sky were the room's before step 7a and are
 * the house's now (MISTAKES.houseOwns); the look's own calls (engine/look.ts LookBuilder) belong to
 * the look's designer (MISTAKES.lookOnly).
 */
export const BUILDER_REFUSED = {
  houseOwns: ['bounds', 'sky'],
  lookOnly: ['wallpaper', 'dress', 'prop', 'lights'],
} as const satisfies { houseOwns: readonly string[]; lookOnly: readonly Exclude<keyof LookBuilder, keyof Builder>[] }

export const BUILDER_REF = {
  box: 'r.box(at, [w, h, d], opts)   a solid box, its middle at at: w along x, h along y, d along z. Gives back a solid',
  ramp: `r.ramp(at, [w, h, d], rises, opts)   a solid wedge filling the box [w, h, d] round at, flat underneath, its top going up from nothing at one end to h at the other, toward rises: 'right' (+x) or 'left' (-x); from high up also 'back' (-z, away from the viewer) or 'front' (+z, toward the viewer). Players walk up a slope of up to ${FEEL.slope} degrees and slide down a steeper one. Gives back a solid`,
  ball: 'r.ball(at, radius, opts)   a solid ball, its middle at at. Gives back a solid',
  mover: `r.mover(build, place, opts)   a group that moves as one. build(r) is called once, given this same builder r, and builds solids, decor, zones, lamps and signs at points measured from the mover's origin. place(t) gives where the origin is at t, the mover's own clock in seconds (0 as play starts), as { at, turn }: from the side at is [x, y, 0] and turn is radians counterclockwise on the screen round the origin; from high up at is [x, y, z] and turn is radians round y through the origin, counterclockwise as seen from above (+x turns toward -z); turn is 0 if left out. place must depend on t alone, so the same t always gives the same place: Math.random throws inside it, and each call may take ${BUDGET.placeTurns} loop turns and calls. A place that never changes, () => ({ at }), keeps it still until slideBy sends it. A mover carries whoever stands on it and pushes whoever it moves into; someone squeezed between it and something else slips through it. The handles built in it give back points in the room from at(), wherever the mover has taken them, and move only with the mover. Gives back a mover`,
  thing: `r.thing(at, model, opts)   a loose thing standing at at, drawn by its model: it falls, slides and comes to rest on what is under it, and can be stood on. It takes room: nobody stands where it lies, so leave a child room to stand beside each thing on its floor. It touches as the box round its model from its foot up, never below it (as a ball, if round), and never turns over. A player pushes it along at up to ${FEEL.pushSpeed} m/s by walking into it (from high up, the way they walk), and carries it with grab if it weighs ${FEEL.carryMax} or less: held over the head, touching nothing while carried, put down in front with grab, thrown about ${FEEL.throwAhead} m ahead with grab while walking (in front and ahead: from high up, the way they face, p.facing()). Gives back a thing`,
  decor: "r.decor(at, model, opts)   decor the play needs: what the room code shows, hides, moves, poses or lights up, or what rides a mover; the room's furniture and the things of its theme are the look's, not yours. Only seen, it touches nothing, standing at at and facing +z (the viewer). From the side it goes behind the play (z below 0) or in front of it (z above 0), where it hides what is behind it: keep it low and small there. From high up it stands anywhere on the floor, and players walk through it. Gives back decor",
  zone: 'r.zone(at, [w, h, d], opts)   a box of space that notices who is in it, its middle at at: a player or a thing is in it while any part of it overlaps the box, and a carried thing is where the hands carrying it are. Unseen unless given a colour. Gives back a zone',
  lamp: `r.lamp(at, opts)   a lamp at at, lighting what is near it: for a light the play turns on, off, brighter or another colour. The room code's lamps and the look's are at most ${BUDGET.lamps} together. Gives back a lamp`,
  sign: `r.sign(at, what, opts)   a sign floating in the room, facing the viewer, its middle at at, about ${SIZES.signHeight} m tall. what is a number; words { en, fi }, at most ${WORDS_MAX.sign} words in each; a count { count, of }, shown as a row of dots with count of them filled in (as numbers past 10); or a clock { clock: secs }, a ring that empties by itself over secs seconds from when it is shown. Gives back a sign`,
  wayOut: `r.wayOut(at)   where the way out is: a door ${SIZES.doorWidth} m wide and ${SIZES.doorHeight} m tall, its foot at at on a floor, set into the back wall behind that spot (seen from high up, into the wall nearest it, its foot moved there onto the floor at that wall), in plain sight. It stays shut, glowing softly, until the room is finished; then it opens and the party leaves through it. Call it once`,
  controls:
    "r.controls(players, spec)   how these players play, all room long: give w.players() for everyone, or some of them for parts of their own. spec is { stick, a, b }; what it leaves out stays as it was, and every player starts with { stick: 'walk', a: 'jump', b: 'grab' } from the side and { stick: 'floor', a: 'jump', b: 'grab' } from high up",
  steps: `r.steps(list)   the steps of the room, in order and the same for everyone, each { hint, at, done }: 1 to ${BUDGET.steps}, and exactly 1 in a contest. Dots at the top of the screen fill as they are done. Call it once`,
  rule: `r.rule(words)   in a contest only: how to win, { en, fi }, at most ${WORDS_MAX.rule} words in each, shown and said at the start`,
  clock: `r.clock(secs)   the room ends by itself after secs seconds of play (${PASS.clockMin} to ${PASS.clockMax}), and the screen shows the time left. Then the engine finishes it, a contest by score, most first. The children never lose by it, but the walkthrough must have every step done before it runs out`,
  pushing: 'r.pushing(on)   true: players push each other, for a contest; otherwise they walk through each other',
  tap: 'r.tap((at) => { ... })   runs for a tap or a click from anyone that no handle\'s own tap took: at is the point, from the side on z = 0, from high up on what was tapped. The room is not told who',
} as const satisfies Record<keyof Builder, string>

// ------------------------------------------------------------------------------ the world

export interface PuffOpts {
  readonly color?: string
  readonly count?: number
  readonly size?: number
}

export const PUFF_OPTS_REF = {
  color: "color   '#rrggbb' or a colour name; each kind has its own if left out",
  count: `count   how many shapes, at most ${DEFAULTS.puffMax}; ${DEFAULTS.puffCount} if left out`,
  size: `size   metres across each; ${DEFAULTS.puffSize} if left out`,
} as const satisfies Record<keyof PuffOpts, string>

/** The world as room code sees it: its calls work at any time, while building too; the acts that only make sense in play (puff, sound, shake, pop) wait for play to start. */
export interface World {
  time(): number
  level(): Level
  players(): readonly Player[]
  pointers(): readonly Point[]
  stepsDone(): number
  after(secs: number, fn: () => void): void
  puff(at: Point, kind: PuffKind, opts?: PuffOpts): void
  sound(name: HouseSound): void
  shake(strength: number): void
  pop(at: Point, what: number | Words): void
  finish(order?: readonly Player[]): void
}

export const WORLD_REF = {
  time: 'w.time()   seconds since play started; 0 while building',
  level: 'w.level()   1, 2 or 3, the same all room long: scale by it how much there is to do (counts, speeds, gaps), 1 the gentlest, never longer to stand, hold or wait',
  players: 'w.players()   the players, in seat order: always the same list of the same handles',
  pointers: 'w.pointers()   where fingers or the mouse are held down now, from anyone: a list of points (from the side on z = 0, from high up on what is under the finger), empty when none is',
  stepsDone: 'w.stepsDone()   how many of the steps are done',
  after: 'w.after(secs, fn)   runs fn once, secs seconds from now; to call it off, have fn look at a variable of yours',
  puff: `w.puff(at, kind, opts)   little shapes flying out from at and fading: kind is one of ${PUFF_KINDS.join(' ')}`,
  sound: `w.sound(name)   plays a sound: ${HOUSE_SOUNDS.join(' ')}. The engine already sounds footsteps, jumps, landings, bonks, picking up, putting down and each step done`,
  shake: `w.shake(strength)   shakes the view for ${DEFAULTS.shakeSecs} s, 0 to 1`,
  pop: `w.pop(at, what)   a number, or words { en, fi } of at most ${WORDS_MAX.pop} in each, rising from at and fading within ${DEFAULTS.popSecs} s`,
  finish:
    'w.finish(order)   ends the room at the end of this frame, after the next step\'s done() was asked, so it may come in the very frame the last step turns done; by then every step must be done. In a contest, order is every player in the order they came, the winner first; any other room gives none. A second call does nothing',
} as const satisfies Record<keyof World, string>

// ------------------------------------------------------------------------------ handles

/** A player or a thing: who a zone, a touch or a landing is about. */
export type Who = Player | Thing

/** Every handle, a player's too. */
export interface HandleView {
  kind(): Kind
}

export const HANDLE_VIEW_REF = {
  kind: "kind()   what it is: 'solid', 'mover', 'thing', 'decor', 'zone', 'lamp', 'sign' or 'player'",
} as const satisfies Record<keyof HandleView, string>

/** The reads of every handle the builder gives back but a mover's. */
export interface PlacedView extends HandleView {
  at(): Point
  hidden(): boolean
}

export const PLACED_VIEW_REF = {
  at: "at()   where it is now, [x, y, z]: a solid's, zone's or sign's middle, a thing's or decor's foot, a lamp's light",
  hidden: 'hidden()   true while it is hidden',
} as const satisfies Record<Own<PlacedView, HandleView>, string>

/** The acts of every handle the builder gives back but a mover's. Once a slideTo is under way the bots' search sees where it goes; it learns of a slide, a hide or a show only from the frame the room's code starts it, and never foresees putAt. */
export interface Placed extends PlacedView {
  putAt(at: Point): void
  slideTo(at: Point, secs: number): void
  hide(): void
  show(): void
}

export const PLACED_REF = {
  putAt: 'putAt(at)   puts it there at once. A solid moved a little every frame this way carries what stands on it; a thing also stops',
  slideTo: 'slideTo(at, secs)   moves it there in a straight line over secs seconds, easing in and out. A solid carries and pushes players and things on the way, and passes into other solids, which never stop it; a thing passes through everything and is loose again at the end',
  hide: 'hide()   hides it: not drawn, it touches and notices nothing and no zone notices it; a hidden thing hangs where it is, not falling, until shown; a carried thing is let go first',
  show: 'show()   shows it again where it is; anyone inside a solid shown is put beside it',
} as const satisfies Record<Own<Placed, PlacedView>, string>

/** Acts some handles share. */
export interface Glows {
  glow(color: string | null, pulse?: boolean): void
}
export interface Poses {
  pose(part: string, rot: Rot, secs: number): void
}
export interface Turns {
  turnTo(turn: number, secs: number): void
}

export const SHARED_ACTS_REF = {
  glow: 'glow(color, pulse)   lights all of it in that colour, with pulse true slowly brighter and dimmer to draw the eye; glow(null) stops it (solids, movers, things, decor, zones, players)',
  pose: "pose(part, [rx, ry, rz], secs)   turns its model's part named part to that turn (radians, round the part's pivot, x then y then z) over secs seconds, 0 at once; it stays so until posed again (solids with a model, things, decor)",
  turnTo: 'turnTo(turn, secs)   turns it round its middle to turn over secs seconds: radians counterclockwise on the screen from the side, round y counterclockwise as seen from above from high up (solids, decor)',
} as const satisfies Record<keyof (Glows & Poses & Turns), string>

export type SolidView = PlacedView
export interface Solid extends Placed, Glows, Poses, Turns {
  set(changes: SolidChanges): void
}

export const SOLID_REF = {
  set: 'solid.set(changes)   changes any of its color, ice, bounce, belt and through from now on',
} as const satisfies Record<Own<Solid, Placed & Glows & Poses & Turns>, string>

/** A mover's reads. Its clock runs at its speed; place, and a slideBy or turnBy under way, are exact functions of time, so the search foresees them from the frame they are set going. */
export interface MoverView extends HandleView {
  at(): Point
  turn(): number
  clock(): number
  moving(): boolean
  hidden(): boolean
}

export const MOVER_VIEW_REF = {
  at: 'mover.at()   where its origin is now, [x, y, z]',
  turn: 'mover.turn()   its turn now, radians',
  clock: 'mover.clock()   its own clock, seconds, which its place is asked at',
  moving: 'mover.moving()   true while a slideBy or a turnBy is under way',
  hidden: 'mover.hidden()   true while it is hidden',
} as const satisfies Record<Own<MoverView, HandleView>, string>

export interface Mover extends MoverView, Glows {
  speed(k: number): void
  slideBy(by: Point, secs: number): void
  turnBy(turn: number, secs: number): void
  hide(): void
  show(): void
}

export const MOVER_REF = {
  speed: 'mover.speed(k)   runs its clock at k times the room\'s from now on: 1 at the start, 0 stops it where it is, -1 runs it back',
  slideBy: 'mover.slideBy([dx, dy, dz], secs)   slides it smoothly over secs seconds until it is that far from where its place puts it (an offset, not a point; dz is 0 from the side); slideBy([0, 0, 0], secs) brings it back. A new slide starts from where it is',
  turnBy: 'mover.turnBy(turn, secs)   turns it smoothly over secs seconds, round its origin (from high up round y), until it is turned that much more than its place says; turnBy(0, secs) turns it back',
  hide: 'mover.hide()   hides all of it: not drawn, touching and noticing nothing; its clock goes on',
  show: 'mover.show()   shows all of it again; anyone inside it then is put beside it',
} as const satisfies Record<Own<Mover, MoverView & Glows>, string>

export interface ThingView extends PlacedView {
  velocity(): Point
  heldBy(): PlayerView | null
}

export const THING_VIEW_REF = {
  velocity: 'thing.velocity()   how fast it moves, [vx, vy, vz] m/s',
  heldBy: 'thing.heldBy()   the player carrying it, or null',
} as const satisfies Record<Own<ThingView, PlacedView>, string>

export interface Thing extends Placed, ThingView, Glows, Poses {
  heldBy(): Player | null
  push(v: Point): void
  goHome(): void
}

export const THING_REF = {
  push: `thing.push([vx, vy, vz])   adds that speed, m/s (vy 10 throws it about ${(10 * 10) / (2 * FEEL.gravity)} m up; vz is 0 from the side); a carried thing is let go first`,
  goHome: 'thing.goHome()   puts it back where it was built, with a puff',
} as const satisfies Record<Own<Thing, Placed & ThingView & Glows & Poses>, string>

export type DecorView = PlacedView
export interface Decor extends Placed, Glows, Poses, Turns {}

export interface ZoneView extends PlacedView {
  has(who: PlayerView | ThingView): boolean
  inside(): readonly (PlayerView | ThingView)[]
  weight(): number
}

export const ZONE_VIEW_REF = {
  has: 'zone.has(who)   true while that player or thing is in it (a carried thing, while the hands carrying it are)',
  inside: 'zone.inside()   the players and things in it now, carried things too; an empty list when none',
  weight: 'zone.weight()   the weight in it now: each player 1 (times a weight change), each thing its weight, carried things too',
} as const satisfies Record<Own<ZoneView, PlacedView>, string>

export interface Zone extends Placed, ZoneView, Glows {
  inside(): readonly Who[]
  set(changes: ZoneChanges): void
}

export const ZONE_REF = {
  set: 'zone.set(changes)   changes any of its color, wind, pull, gravity and drag from now on',
} as const satisfies Record<Own<Zone, Placed & ZoneView & Glows>, string>

export type LampView = PlacedView
export interface Lamp extends Placed {
  set(changes: LampChanges): void
}

export const LAMP_REF = {
  set: 'lamp.set(changes)   changes any of its color, power and reach from now on',
} as const satisfies Record<Own<Lamp, Placed>, string>

export interface SignView extends PlacedView {
  what(): SignText
}

export const SIGN_VIEW_REF = {
  what: 'sign.what()   what it shows now',
} as const satisfies Record<Own<SignView, PlacedView>, string>

export interface Sign extends Placed, SignView {
  write(what: SignText): void
}

export const SIGN_REF = {
  write: 'sign.write(what)   shows what from now on: a number, words, a count or a clock, as r.sign takes them',
} as const satisfies Record<Own<Sign, Placed & SignView>, string>

/** A player as anyone may read them: the walkthrough's bots have these reads too. */
export interface PlayerView extends HandleView {
  at(): Point
  velocity(): Point
  facing(): Point
  stick(): readonly [number, number]
  button(name: 'a' | 'b'): boolean
  holding(): ThingView | null
  standingOn(): PlacedView | PlayerView | null
  score(): number
  color(): string
}

export const PLAYER_VIEW_REF = {
  at: 'p.at()   where their feet are, [x, y, z]',
  velocity: 'p.velocity()   how fast they move, [vx, vy, vz] m/s',
  facing: 'p.facing()   the way they face: from the side [1, 0, 0] (right) or [-1, 0, 0] (left); from high up the way the stick last walked them, [x, 0, z], one metre long',
  stick: 'p.stick()   their stick now, [x, y], each -1 to 1: +x to the right, +y up (from high up its up walks toward -z, away from the viewer); [0, 0] when let go',
  button: "p.button(name)   true while they hold button 'a' or 'b' down",
  holding: 'p.holding()   the thing they carry, or null',
  standingOn: 'p.standingOn()   the solid, thing or player under their feet, or null while in the air',
  score: 'p.score()   their score, 0 at the start',
  color: "p.color()   their seat's colour, '#rrggbb', shown over them and free for the room to use",
} as const satisfies Record<Own<PlayerView, HandleView>, string>

export interface PlayerChanges {
  readonly speed?: number
  readonly jump?: number
  readonly size?: number
  readonly weight?: number
}

export const PLAYER_CHANGES_REF = {
  speed: `speed   times their walking speed; 0 keeps them still, but for at most ${REFEREE.freeAfter} s at a time (THE ENGINE), and below ${REFEREE.slow} counts as 0`,
  jump: 'jump   times their jump',
  size: `size   times their size, ${REFEREE.sizeMin} to ${REFEREE.sizeMax}; they grow only where there is room`,
  weight: 'weight   times their weight, as zone.weight() and pushing feel it',
} as const satisfies Record<keyof PlayerChanges, string>

export interface Player extends PlayerView, Glows {
  holding(): Thing | null
  standingOn(): Solid | Thing | Player | null
  putAt(at: Point): void
  push(v: Point): void
  change(changes: PlayerChanges, secs: number): void
  bonk(): void
  give(thing: Thing): void
  drop(): void
  addScore(n: number): void
}

export const PLAYER_REF = {
  putAt: `p.putAt(at)   while building: where they start (put every player somewhere, standing on a floor with room to move). In play: there at once, their speed gone, with a puff when it is a real jump; put in one spot again and again, they are held still, but for at most ${REFEREE.freeAfter} s at a time (THE ENGINE). Put a little further each frame, they are moved along and never held`,
  push: `p.push([vx, vy, vz])   adds that speed, m/s (vy 10 throws them about ${(10 * 10) / (2 * FEEL.gravity)} m up; vz is 0 from the side)`,
  change: `p.change(changes, secs)   changes them for secs seconds (at most ${REFEREE.changeSecs}); changes is any of { speed, jump, size, weight }, each times normal, 1 as they are; a new change takes the old one's place`,
  bonk: `p.bonk()   a gentle bonk: stars round their head and a little hop back; they cannot move for ${REFEREE.bonkSecs} s, and cannot be bonked again for ${REFEREE.freeAfter} s`,
  give: 'p.give(thing)   puts the thing in their arms, as if they had picked it up, whatever it weighs',
  drop: 'p.drop()   they put down what they carry, in front of them',
  addScore: 'p.addScore(n)   adds n to their score (below 0 takes away); a badge over them shows it from the first score given',
} as const satisfies Record<Own<Player, PlayerView & Glows>, string>

/** Any handle the walkthrough can find by name (w.get), with its reads. */
export type Seen = SolidView | MoverView | ThingView | DecorView | ZoneView | LampView | SignView

// ------------------------------------------------------------------------------ the answer

/** What the designer answers for a new room. The fields come in this order: the idea, then the shell, then the code. */
export interface RoomAnswer {
  theme: string
  task: string
  name: Words
  shell: Shell
  room: string
  walk: string
  wish: string
}

export const ROOM_ANSWER_REF = {
  theme: 'A few words for this room of the house: the one theme it is given over to.',
  task: 'One line: what the players do in it.',
  name: `The room's name, { en, fi }, at most ${WORDS_MAX.name} words in each.`,
  shell: "The room's shell: the walls, floor, ceiling, edges and light the house draws round everything the room code builds.",
  room: 'Room code: the body of function (r, w), no header.',
  walk: 'Walkthrough: the body of function* (bots, w), no header.',
  wish: 'What you wanted for this room that the engine could not do, in a sentence or two; empty when nothing.',
} as const satisfies Record<keyof RoomAnswer, string>

/** A fix answers only the code that changes; the other is empty and kept as it was. The name and the shell come back too, being short, so a sentence about either can be mended. */
export interface RoomFix {
  name: Words
  shell: Shell
  room: string
  walk: string
}

export const ROOM_FIX_REF = {
  name: `The room's name, { en, fi }, at most ${WORDS_MAX.name} words in each: the same as before, unless a sentence is about it.`,
  shell: 'The shell again: as it was, unless a sentence is about it.',
  room: 'The whole room code again, mended, only when the room must change; empty to keep it as it was.',
  walk: 'The whole walkthrough again, mended, only when it must change; empty to keep it as it was.',
} as const satisfies Record<keyof RoomFix, string>

// ------------------------------------------------------------------------------ what is said once

/** The children's principles, for the system prompt: principles only, no list of what a room may be and no example (plan.md, About children, as principles). */
export const ROOM_RULES = `How to build a room for these children:
- They cannot all read. A child sees what to do from the room itself: what matters is big, bright and on their way; what can be used glows, moves or answers with a sound; colours tell things apart.
- One clear idea, with a start, a middle and an end.
- Every press, touch and tap answers at once, with a sound, a puff, a pose or a glow, so a child knows it did something.
- In a room played together every player is needed, each with a part the others can see, and fewer could not finish it.
- Each button does one thing all room long, and its picture shows that thing.
- Nothing scary, nothing sad for long, nobody hurt.
- Nothing is told at the door. A hint says what to try, never the whole answer.
- The room is one room of the house, indoors, given over to one theme a child names at a glance, as unlike the earlier rooms as it can be: its colours, its surfaces and the things the players play with all belong to it.
- The whole room is in sight all the time: the play uses all of it, and the ways the players go stay clear.
- The things of the play answer a child who tries them before it is their turn too, without doing the task.
- A child sees every part of the room: a room is bright, and a theme that wants the dark is dim, never dark, and shines with lights of its own.`

export const ROOM_PREAMBLE = `ROOM CODE: the body of  function (r, w) { ... }
It runs once, before play, and builds the whole room with r, for exactly the players in front of it, at w.level(). Then it returns the function that runs every frame of play, (dt) => { ... }, or nothing. Everything is built now: to make something appear later, build it hidden and show it. Keep all the room remembers in your own variables (let, const, lists, a Map keyed by handles): its handlers and its frame function see them.

SPACE. Metres. x is to the right, y is up, z is toward the viewer. A point is [x, y, z] and a size is [w, h, d] (along x, y and z): always three numbers. A turn is in radians: from the side round z, counterclockwise as seen on the screen; from high up round y (up), counterclockwise as seen from above, so a quarter turn takes +x to -z. The request says which way the room is seen.
- Seen from the side: everything that moves or touches (solids, movers, things, zones, players) has its middle on the plane z = 0 and moves only in x and y: its z is 0 whatever you give. Decor stands in front (z above 0) or behind (z below 0). A solid's depth d only sets how deep it is drawn: give floors and ledges about 2, so their tops show.
- Seen from high up: the floor is x and z, and y is up. Everything keeps the z you give: solids, movers, things, zones and players stand anywhere on the floor and move in x, y and z. The camera looks down at the floor from the viewer's side (+z), at a slant and never turned: on the screen +x is to the right, -z is up (away from the viewer) and +z down (toward the viewer), and heights rise up the screen. A solid's depth d is as real as its width. The floor is the house's: build walls, ledges, raised floors and ramps that work every way on it. The players walk the floor with the stick and jump up onto tops. A tall solid hides what stands just behind it (toward -z), and a ledge hides what is under it: keep what matters in the open.
- A solid, a zone, a sign and a mover's origin are placed by their middle. A player, a thing and decor stand on the point they are placed at (their feet; a model's origin). So a box from y 1.5 to 2 has its middle at y 1.75 and h 0.5, and a player stands on it at y 2.
- The world pulls down at ${FEEL.gravity} m/s². A player is ${FEEL.height} m tall and ${FEEL.width} m wide (from high up, ${FEEL.width} m square on the floor). They walk at ${FEEL.walk} m/s, walk up onto anything ${FEEL.stepUp} m high without jumping, and walk up slopes of up to ${FEEL.slope} degrees. A held jump lifts their feet ${FEEL.jumpHigh} m, a short press ${FEEL.jumpLow} m, and a running jump clears a gap of ${FEEL.jumpAcross} m (from high up, any way across the floor, given room to run up to it). A fall from any height does no harm. A head stops at whatever is over it and at the room's top (the ceiling at y ${ROOM.side.height} seen from the side, y ${ROOM.high.height} seen from high up): a jump stopped so falls from there and carries the feet less far, so from a floor h m up a held jump lifts them at most the top less ${FEEL.height} less h metres. Seen from high up a held jump lifts the feet its whole ${FEEL.jumpHigh} m only from a floor at most ${metres(ROOM.high.height - FEEL.height - FEEL.jumpHigh)} m high, and no top a player must jump onto can be higher than ${metres(ROOM.high.height - FEEL.height)} m. They walk through each other and can stand on each other's heads.
- THE ROOM is the same size in every room, and the camera shows all of it all the time and never moves. Seen from the side: x from ${-ROOM.side.width / 2} to ${ROOM.side.width / 2}, y from 0 (the floor's top) to ${ROOM.side.height} (the ceiling), the back wall at z ${ROOM.side.back}. Seen from high up: the floor is x from ${-ROOM.high.width / 2} to ${ROOM.high.width / 2} and z from ${-ROOM.high.depth / 2} (the back wall) to ${ROOM.high.depth / 2} (the open front, toward the viewer), its top at y 0, with walls at the back and both sides and no ceiling, and the players are held under y ${ROOM.high.height}. The house builds the floor under the whole room, its walls and its ceiling, in the shell's paint, and holds the players inside them: nobody falls out of the room, so nothing brings back a player who has dropped where they cannot get out, and wherever a player can get down to, they can climb back up from. Build everything else inside it, standing on that floor or on each other, never below it. The room is seen from far: make whatever matters at least ${SIZES.smallest} m across.

TIME. Seconds. w.time() counts from the start of play. A frame is 1/60 s: the frame function runs 60 times a second, and its dt is always 1/60. (A step is one of the room's list of steps, never a frame.) In each frame, in this order: the players' buttons, taps, movers, players, things, touches and landings, zones, w.after, your frame function, the next step's done(), then the engine's own work and the end.

WHAT THE ROOM IS TOLD. The request says how many play (the room is for exactly that many: w.players()), how they play, and how the room is seen (from the side or from high up). A line that begins "How they played before" says how these players played their last rooms: how long they took against the bots' seconds, their restarts and hints, the rooms they left, and which they loved or did not like. Make this room easier where they took long, needed hints or left, and harder where they were quick without hints; it is still a new room. Together: one task that needs every player, and fewer could not finish it. Against each other: each tries to win; the room has one step, says its rule with r.rule, and finishes with the players in the order they came. Side by side: each player has a part of their own, alike for all, and nobody plays against anybody; a step is done when every player has done it; no order at the end, and no score unless the room gives one. In the code, w.level() is 1, 2 or 3, and each player has a colour, p.color().

HANDLES. A builder call gives back a handle (a solid, a mover, a thing, decor, a zone, a lamp, a sign); w.players() gives the players'. A handle has only calls: read it by calling, p.at(), never p.x. Keep each handle you will use again in your own variables: the room's w finds nothing by name (w.get is only the walkthrough's). It is frozen: give it no fields of your own. The same thing always comes as the same handle, so === compares them. A point or a list a call gives back is frozen too: make a new one ([x + 1, y, z]; [...w.players()] before sorting). Every builder call gives back its handle, never null: past a limit the build stops and says so. Only p.holding(), p.standingOn() and thing.heldBy() can give null. Points are always in the room, a handle built in a mover's too.

HANDLERS. Options named done, enter, stay, leave, touch, land, use, tap, press, hold and release are functions the engine calls in play, never while building, so each may use the handle its own call gave back: const z = r.zone(at, size, { enter: (who) => { ... z.at() ... } }).

WEIGHT. The build has one budget: ${big(BUDGET.pieces)} pieces. Each handle built counts 1, and each shape of a model 1 more every time the model is placed. The build's code may take ${big(BUDGET.buildTurns)} loop turns and calls. Over either, the build stops and asks you to build lighter. In play, all the room's code in one frame (the frame function, every handler and every mover's place) may take ${big(BUDGET.frameTurns)} loop turns and calls: the call that goes past them is stopped, and the rest of that frame's code is skipped.

WORDS. Every word a child sees or hears comes as { en: '...', fi: '...' }: plain words for a seven-year-old in each language, no dashes, never more than its line allows. Names, numbers and colours are not words.

CODE. Plain JavaScript: no imports, no async, no timers (w.after waits), no Date. Math.random() is the room's own dice: the same throws every time the room is played. A compare function given to sort must answer the same for the same two items every time: browsers call it in different orders, so one that draws Math.random() sorts differently on every device.

THE ENGINE. Whatever the code says: nobody is hurt or out; nobody is kept from playing for more than ${REFEREE.freeAfter} seconds at a time (a player bonked cannot be bonked again for ${REFEREE.freeAfter} s; a player held still by bonks, a speed 0 change or putAt in one spot for ${REFEREE.freeAfter} s in a row is then free of them for ${REFEREE.freeAfter} s; a player squeezed by a solid is put beside it); a player squeezed or put below the house's floor comes back onto the last floor they stood on, and a thing that leaves the room comes back to where it was built; a room is never lost, only finished or left. If your code throws while they play, that call is skipped and play goes on; a room whose code throws fails its check.

THE END. The room ends only by w.finish() or by r.clock. w.finish() takes effect at the end of the frame it is called in, after the next step's done() was asked, so it may come in the frame the last step turns done; by then every step must be done, in order. Then the way out opens, fireworks go up and everyone gets a present. In a contest, w.finish([first, second, ...]) gives the players in the order they came. A room with r.clock ends by itself when its time is up.

THE TRIAL. Before children play a room, the game builds it at every level and checks it: every player starts on a floor with room to move, and from every place they can walk, jump, drop or ride to from their start they can still get back to their start, to every step's place and zone they could get to from it, or to something that answers, can be pushed or carried, or moves; ${TRIAL.stillSecs} s of everyone standing still bonks nobody, drops nobody out of the room, does no step and ends nothing; ${TRIAL.randomSecs} s of random pressing and tapping finishes nothing and breaks nothing; and the walkthrough does every step, each turning done in order, and finishes the room in ${PASS.minSecs} to ${PASS.maxSecs} s of play (a room with r.clock: every step done before its clock runs out, and a w.finish not before ${PASS.minSecs} s). The bots know the way and lose no time: they cross the room's ${ROOM.side.width} m in ${ROOM.side.width / FEEL.walk} s walking and in ${ROOM.side.width / FEEL.pushSpeed} s pushing (seen from high up, its ${ROOM.high.width} m in ${ROOM.high.width / FEEL.walk} s and ${ROOM.high.width / FEEL.pushSpeed} s). Its seconds come from what there is to do, never from distance: the room is one screen. So add up the seconds each step asks at those speeds, and plan the room for about ${PASS.aimSecs} s of their play: it passes with time to spare. It plays the walkthrough at every level, and at the asking players' level again on a second seed. The levels must differ: a room built the same at levels 1, 2 and 3, whose walkthrough does its steps at the same seconds at each, fails. In a room played together or side by side, it also plays the walkthrough with each bot in turn standing still, and the room must then stay unfinished. Those seconds are the room's own play: what its steps ask of players who already know the way, and a short wait for what the room does. A minute made of standing, holding or waiting is not play: a room with less to do than that needs more for the players to do in it, never longer to stand, hold or wait, whether the room's code or the walkthrough asks it.`

/** The kit's lines every model in a room is built with, the room code's and the look's (engine/look.ts LOOK_REFERENCE): the last sections of both references. */
export const MODEL_SECTIONS: readonly RefSection[] = [
  { title: MODEL_PREAMBLE, lines: { ...KIT_SHAPES_REF, ...ROOM_PART_REF } },
  { title: 'Every shape takes opts { at, rot, scale, color, glow }, each optional:', lines: SHAPE_OPTS_REF },
]

/** The room's whole reference, in order: ROOM_PREAMBLE, then these sections, then the model sections. ROOM_RULES goes in the system prompt beside it. */
export const ROOM_REFERENCE: readonly RefSection[] = [
  { title: "r, the builder: its calls work only while the room's code first runs.", lines: BUILDER_REF },
  { title: 'Every call above that gives back a handle may also take these options:', lines: SHARED_OPTS_REF },
  { title: 'r.box, r.ramp, r.ball, r.mover and r.thing may also take:', lines: CONTACT_OPTS_REF },
  { title: "A solid's own options (r.box, r.ramp, r.ball):", lines: SOLID_OPTS_REF },
  { title: "A thing's own options (r.thing):", lines: THING_OPTS_REF },
  { title: "Decor's own options (r.decor):", lines: DECOR_OPTS_REF },
  { title: "A zone's own options (r.zone):", lines: ZONE_OPTS_REF },
  { title: "A lamp's own options (r.lamp):", lines: LAMP_OPTS_REF },
  { title: 'A step, in r.steps:', lines: STEP_REF },
  { title: 'r.controls spec:', lines: CONTROLS_REF },
  { title: "A job of the room's own, for button a or b:", lines: OWN_BUTTON_REF },
  { title: 'The shell, in the answer: the house draws it before the room code runs.', lines: SHELL_REF },
  { title: 'w, the world: its calls work at any time.', lines: WORLD_REF },
  { title: 'w.puff options:', lines: PUFF_OPTS_REF },
  { title: "Every handle, a player's too, has:", lines: HANDLE_VIEW_REF },
  {
    title:
      "A solid, a thing, decor, a zone, a lamp and a sign have these. Once a slideTo or turnTo is under way, the walkthrough's search sees where it goes; when your code starts one, or hides or shows something, the search learns of it only then, and it never foresees putAt.",
    lines: { ...PLACED_VIEW_REF, ...PLACED_REF },
  },
  { title: 'Some handles also have:', lines: SHARED_ACTS_REF },
  { title: 'A solid also has:', lines: SOLID_REF },
  { title: 'A thing also has:', lines: { ...THING_VIEW_REF, ...THING_REF } },
  { title: 'A zone also has:', lines: { ...ZONE_VIEW_REF, ...ZONE_REF } },
  { title: 'A lamp also has:', lines: LAMP_REF },
  { title: 'A sign also has:', lines: { ...SIGN_VIEW_REF, ...SIGN_REF } },
  {
    title:
      "A mover has these. The walkthrough's search sees where its place, at its clock's speed, and a slideBy or turnBy under way will take it; when your code changes its speed, starts a slide or a turn, or hides or shows it, the search learns of it only then.",
    lines: { ...MOVER_VIEW_REF, ...MOVER_REF },
  },
  { title: 'A player p has:', lines: { ...PLAYER_VIEW_REF, ...PLAYER_REF } },
  { title: 'p.change changes:', lines: PLAYER_CHANGES_REF },
  ...MODEL_SECTIONS,
]

/** The handles' reads only, as the walkthrough's reference shows them (trial/api.ts). */
export const READS_REFERENCE: readonly RefSection[] = [
  { title: "Every handle, a player's too, has:", lines: HANDLE_VIEW_REF },
  { title: 'A solid, a thing, decor, a zone, a lamp and a sign have:', lines: PLACED_VIEW_REF },
  { title: 'A thing also has:', lines: THING_VIEW_REF },
  { title: 'A zone also has:', lines: ZONE_VIEW_REF },
  { title: 'A sign also has:', lines: SIGN_VIEW_REF },
  { title: 'A mover has:', lines: MOVER_VIEW_REF },
  { title: 'A player, and every bot, has:', lines: PLAYER_VIEW_REF },
]

// ------------------------------------------------------------------------------ mistakes that teach

/**
 * What the engine says back when made code misreads the reference, each with the designer's own
 * line added by the sandbox. Every sentence names what was wrong and the one right way, so a fix
 * needs no guess. JavaScript's own errors for a frozen list or point ("Cannot assign to read only
 * property") are rewritten as frozenList.
 */
export const MISTAKES = {
  notCalled: (what: string, key: string) => `${key} of a ${what} is a call: write ${key}() (as p.at() gives [x, y, z])`,
  noField: (what: string, key: string, calls: readonly string[]) => `a ${what} has no ${key}: read it by calling, as .at(). A ${what}'s calls: ${calls.join(', ')}`,
  walkCall: (key: string, calls: readonly string[]) =>
    `w.${key} is the walkthrough's, not the room's: the room keeps each handle a builder call gives back in its own variables and uses that. The room's w has: ${calls.join(', ')}`,
  frozen: (what: string, key: string) => `a ${what} is frozen, so it takes no field ${key}: keep what you know about it in your own variables (a Map from handles to values works)`,
  frozenList: () => 'a point or a list the engine gave back is frozen: make a new one ([x + 1, y, z]; [...list] before sorting it)',
  notPoint: (call: string, arg: string, got: string) => `${call}: ${arg} is ${got}, but a point is always three numbers [x, y, z] (seen from the side, z is 0 for anything that moves or touches)`,
  notNumber: (call: string, arg: string) => `${call}: ${arg} has something that is not a number (NaN or Infinity)`,
  unknownOption: (call: string, key: string, known: readonly string[]) => `${call} has no option ${key}; its options are ${known.join(', ')}`,
  notWords: (where: string) => `${where}: words for a child come in both languages, { en: '...', fi: '...' }, short and plain`,
  tooManyWords: (where: string, lang: string, count: number, max: number) => `${where}: the ${lang} has ${count} words, and this kind of text has at most ${max}: say it shorter`,
  dash: (where: string) => `${where}: words for a child have no dashes; write two plain sentences instead`,
  afterBuild: (call: string) => `${call} builds, so it works only while the room's code first runs. To make something appear later, build it hidden ({ hidden: true }) and show it`,
  buildLighter: (pieces: number) => `the build used ${big(pieces)} pieces of its ${big(BUDGET.pieces)}: build it lighter, with fewer handles and fewer or simpler models; every shape counts each time its model is placed`,
  buildLong: () => `the build's code took more than ${big(BUDGET.buildTurns)} loop turns and calls and was stopped: build it lighter, with less work in its loops`,
  frameLong: (where: string) => `${where} took more than ${big(BUDGET.frameTurns)} loop turns and calls in one frame and was stopped: do less each frame`,
  tooManyLamps: (count: number) => `the room has ${count} lamps, and at most ${BUDGET.lamps} light it: use fewer, or glowing shapes`,
  stepCount: (count: number, contest: boolean) => (contest ? `a contest has exactly one step, and this room gave ${count}` : `a room has 1 to ${BUDGET.steps} steps, and this one gave ${count}`),
  noStart: (seat: number) => `player ${seat} was never put anywhere: put every player at their start with p.putAt([x, y, 0]) while building`,
  startInAir: (seat: number, at: Point) => `player ${seat} starts at ${at.join(', ')} with no floor under their feet: a start stands on a floor's top (the house's floor at y 0, or a box's middle y plus half its h)`,
  startStuck: (seat: number, at: Point, why: string) => `player ${seat} starts at ${at.join(', ')} with no room to move: ${why}. A start stands on a floor with ${FEEL.height} m of space above and room to walk to a side`,
  sortOrder: () =>
    "the room is built differently when sort calls its compare function in another order: a compare function that draws Math.random() or changes as it is called sorts differently in every browser, so children would get a room the trial never tried. To shuffle, swap each item with one Math.random() picks, in a loop",
  stillEnded: (secs: number) => `with everyone standing still the room ended after ${secs} s: nothing may end the room before the players do anything`,
  stillBonked: (seat: number, secs: number) => `with everyone standing still player ${seat} was bonked after ${secs} s: a child who only looks round must come to no bonk`,
  stillFell: (seat: number, secs: number) => `with everyone standing still player ${seat} fell out of the room after ${secs} s: a child who only looks round must stay on their floor`,
  /** Said by the trial's way back (trial/trial.ts trapIn): `at` and `start` are x, y from the side and x, y, z from high up; `missed` is the first place the play needs that the player loses there (a step's place or a zone). */
  trapped: (at: readonly number[], seat: number, start: readonly number[], missed: string) =>
    `a player who gets down to ${at.join(', ')} cannot get back to player ${seat}'s start at ${start.join(', ')}, nor to ${missed}, nor to anything that answers, can be pushed or carried, or moves: no walk, jump, drop or ride leads there. Nothing brings back a player who has dropped where they cannot get out, so wherever a player can get down to, they must be able to climb back up to the play from`,
  stillStep: (step: number, secs: number) => `with everyone standing still step ${step} turned done after ${secs} s: a step's done() must turn true only by what the players do`,
  /** `first` is when random input did step 1 and `last` when it did the last step (null in a room of one step), each with the tap just before it when there was one. */
  randomFinished: (secs: number, first: { readonly secs: number; readonly tap: string | null } | null, last: { readonly step: number; readonly secs: number; readonly tap: string | null } | null) =>
    `random pressing and tapping ${[first === null ? null : { step: 1, ...first }, last]
      .filter((d) => d !== null)
      .map((d) => `did step ${d.step} after ${d.secs} s${d.tap === null ? '' : `, right after a tap on ${d.tap}`}, `)
      .join('')}${first === null && last === null ? '' : 'and '}finished the room in ${secs} s: the children must work out what it wants, so pressing or tapping anything must not do it`,
  sameName: (name: string) => `two handles are named ${name}: every name must be different`,
  controlsWho: () => 'r.controls takes the players first, then the spec: r.controls(w.players(), { stick, a, b })',
  sameJob: (job: string) => `both buttons have the job ${job}: give the two buttons different jobs, or b null for one button`,
  noJump: (stick: string) => `a player whose stick is ${stick} has no jump: give the button another job`,
  noGrab: (what: string) => `${what} has use, but no player has a button whose job is grab, so nobody can use it`,
  inMover: (call: string) => `${call} cannot be built inside a mover: build it outside; a thing rides a mover by standing on it`,
  moverPart: (move: string) => `${move}: this is part of a mover and goes only where the mover takes it; move the whole mover with slideBy or turnBy, or build it outside the mover`,
  randomInPlace: () => "a mover's place may not use Math.random: the walkthrough's search asks it about times still to come. Make it depend on t alone",
  placeLong: () => `a mover's place took more than ${BUDGET.placeTurns} loop turns and calls in one call: it is asked every frame, so keep it a few lines of sums`,
  placeNotPure: (t: number) => `the mover's place gave two places for t = ${t}: it must depend on t alone (no variables that change)`,
  order: (contest: boolean) => (contest ? 'a contest finishes with every player in the order they came: w.finish([first, second, ...])' : 'only a contest gives an order: here, w.finish()'),
  ruleNotContest: () => 'r.rule is only for a contest; in any other room the room itself shows what to do',
  wayOut: (count: number) => `the room has ${count} ways out: call r.wayOut(at) exactly once`,
  clockSecs: (secs: number) => `r.clock(${secs}): a room that ends by its own clock lasts ${PASS.clockMin} to ${PASS.clockMax} seconds`,
  stepUndone: (step: number, of: number) => `w.finish() came while step ${step} of ${of} was not done: each step must turn done, in order, before the room finishes`,
  notColor: (call: string, arg: string, got: string) => `${call}: ${arg} is ${got}, which is not a colour: give '#rrggbb' or a colour name such as 'red'`,
  notFunction: (call: string, arg: string) => `${call}: ${arg} must be a function, as (who) => { ... }`,
  notOptions: (call: string, got: string) => `${call}: its options are one object { ... } after the other arguments, not ${got}`,
  notSize: (call: string, arg: string) => `${call}: each number of ${arg} must be more than 0`,
  notText: (call: string, arg: string) => `${call}: ${arg} is a word in quotes, as 'door'`,
  notChoice: (call: string, arg: string, got: string, choices: readonly string[]) => `${call}: ${arg} is ${got}, but it is one of ${choices.map((c) => `'${c}'`).join(', ')}`,
  notHandle: (call: string, arg: string, kinds: string) => `${call}: ${arg} must be ${kinds} this room built (its handle, as r.thing gave it back)`,
  notSign: (call: string) => `${call}: what is a number, words { en, fi }, a count { count, of } or a clock { clock: secs }`,
  notStep: (step: number) => `r.steps: step ${step} must be { hint, at, done }, with done a function that gives back true or false`,
  notList: (call: string, arg: string) => `${call}: ${arg} must be a list [ ... ]`,
  calledTwice: (call: string, count: number) => `${call} was called ${count} times: call it once`,
  notReturn: (got: string) => `the room's code gave back ${got}: give back the frame function (dt) => { ... }, or nothing`,
  notPlace: (got: string) => `a mover's place gave back ${got}: give back { at: [x, y, z], turn } (z 0 from the side)`,
  notDone: (step: number, got: string) => `step ${step}'s done() gave back ${got}: give back true or false`,
  noShapes: (call: string) => `${call}: the model made no shapes: build it with m.box, m.sphere and the other shapes`,
  houseOwns: (call: string) => `${call} is the house's: every room is the same size, seen whole and never followed, and its walls, floor, ceiling and light come from the answer's shell. Build only what is inside`,
  lookOnly: (call: string) => `${call} is the look's: another designer dresses the room from what you build. The room code builds the play`,
  /** Said of every body's box, zone, start, sign and the way out, with 5 cm of grace, and of decor's foot. */
  outside: (call: string, at: Point) =>
    `${call} at ${at.join(', ')} is outside the room: seen from the side everything stands within x ${-ROOM.side.width / 2} to ${ROOM.side.width / 2} and y 0 to ${ROOM.side.height}, on the house's floor or above it, and a solid is at most ${2 * Math.min(-ROOM.side.back, ROOM.side.front)} m deep; seen from high up within x ${-ROOM.high.width / 2} to ${ROOM.high.width / 2}, z ${-ROOM.high.depth / 2} to ${ROOM.high.depth / 2} and y 0 to ${ROOM.high.height}`,
  thrown: (where: string, message: string) => `${where} threw: ${message}. While children play, that call is skipped; a room that throws fails its check`,
} as const

/** Notes for the survey of the room as built: things the engine set right by itself, told so the designer knows, never a failure. */
export const SURVEY_NOTES = {
  zSet: (call: string, z: number) => `${call} was given z ${z}; seen from the side, everything that moves or touches stands on z = 0, so it was put there`,
  wayOutMoved: (at: Point, to: Point) => `r.wayOut was given ${at.join(', ')}; seen from high up a door stands in a wall, so its foot was moved to the wall nearest it, onto the floor there, at ${to.join(', ')}`,
  lightSet: (got: number, to: number) => `the shell's light ${got} is outside ${LIGHT_RANGE.least} to 1, so it was taken as ${to}`,
} as const
