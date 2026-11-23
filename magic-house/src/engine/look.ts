/**
 * Magic House: the look, as made code sees it (step 7a, "every room a room"). Types and reference
 * text, as engine/api.ts is for the room: the builder that runs the look (engine/lookBuilder.ts), its
 * check (trial/lookCheck.ts) and the scene that draws it (scene/lookView.ts) are built on this.
 *
 * A room is made by two calls. The game's call chooses the theme and the shell and writes the play
 * (engine/api.ts); the look's call, asked once the trial has built the room, dresses it: the
 * wallpaper's motif, furniture and things of the theme, the plain ledges dressed as furniture, props
 * that answer a child, small lights and lamps. The engine joins the two by rules, so no third call
 * rewrites code that already passed.
 *
 * The look is the body of `function (r, room)`. It runs once, after the room code has built the room
 * at a level, with the look's own builder `r` and the room as built `room`, read through frozen faces
 * (RoomSeen). It has no `w`, no handlers and no frame function, its Math is its own (the room's seed
 * plus MATH.lookSeedOffset), and what it builds stays outside the World (LookBuilt): so by its very
 * shape it cannot change the play, and the trial and the bots never meet it. What moves and answers
 * is said as data (r.prop's react and idle), which the scene plays.
 *
 * As in engine/api.ts, every call and read has its one line in a const that satisfies the interface's
 * keys, so the compiler proves every call has exactly one line and no line names a call that does not
 * exist. Every number a line states comes from a const here or in engine/api.ts.
 */

import { PUFF_KINDS, type PuffKind, type Recipe, type Vec3 } from '../../../silly-billy/src/engine/types'
import { big, BUDGET, DEFAULTS, LAMPS_LIT, MODEL_SECTIONS, ROOM, type LampOpts, type Level, type Own, type Point, type RefSection, type Size } from './api'
import type { Model } from './gift'
import { HOUSE_SOUNDS, type HouseSound } from './sounds'
import type { HandleId, ModelId, RoomView, Solid } from './world'

// ------------------------------------------------------------------------------ the look's code

/** The look: the body of `function (r, room)`, run once after the room is built at a level. */
export type LookCode = (r: LookBuilder, room: RoomSeen) => void

/** What a prop does when a player passes in front of it or anyone taps it, at most once a second. */
export const REACTS = ['wobble', 'hop', 'spin', 'blink', 'swing'] as const
export type React = (typeof REACTS)[number]
/** How a prop moves all the time, gently. */
export const IDLES = ['bob', 'sway', 'spin', 'pulse'] as const
export type Idle = (typeof IDLES)[number]

export interface LookDecorOpts {
  readonly scale?: number
  readonly turn?: number
}

export interface PropOpts extends LookDecorOpts {
  readonly react?: React
  readonly idle?: Idle
  readonly sound?: HouseSound
  readonly puff?: PuffKind
}

export interface LightsOpts {
  readonly color?: string | readonly string[]
  readonly size?: number
  readonly twinkle?: boolean
}

export type LookLampOpts = Pick<LampOpts, 'color' | 'power' | 'reach'>

/** The look's builder. Every call works only while the look's code runs, and none gives anything back: the look keeps nothing to change later. */
export interface LookBuilder {
  wallpaper(model: Model): void
  dress(solid: SeenSolid, model: Model): void
  decor(at: Point, model: Model, opts?: LookDecorOpts): void
  prop(at: Point, model: Model, opts?: PropOpts): void
  lights(points: readonly Point[], opts?: LightsOpts): void
  lamp(at: Point, opts?: LookLampOpts): void
}

/** One of the play's still solids as built (RoomSeen.solids). */
export interface SeenSolid {
  at(): Point
  size(): Size
  shape(): 'box' | 'ramp' | 'ball'
  name(): string | null
  color(): string
  dressable(): boolean
}

/** One of the play's loose things where it starts (RoomSeen.things). */
export interface SeenThing {
  at(): Point
  size(): Size
  name(): string | null
}

/** One of the zones the play shows in a colour (RoomSeen.zones). */
export interface SeenZone {
  at(): Point
  size(): Size
  color(): string
}

/** The room as built at the level the look is built at: read only, frozen, never the World itself. */
export interface RoomSeen {
  view(): RoomView
  level(): Level
  solids(): readonly SeenSolid[]
  things(): readonly SeenThing[]
  zones(): readonly SeenZone[]
  wayOut(): Point
  starts(): readonly Point[]
  spots(): readonly Point[]
}

// ------------------------------------------------------------------------------ the numbers the reference states

/**
 * The look's own limits, counted and never timed, apart from the room's (engine/api.ts BUDGET): its
 * pieces (each call 1, each shape of a model 1 each time it is placed, the wallpaper's model each
 * time it is repeated), its loop turns and calls, its props, its small lights, and the shapes of the
 * wallpaper's model. The lamps are the room's BUDGET.lamps, counted with the room code's. Pieces
 * start at 3,000, not more, until the triangles of that many kit shapes in one mesh are measured on
 * a tablet (step 7a, task 5).
 */
export const LOOK_BUDGET = { pieces: 3000, buildTurns: 500_000, props: 48, lights: 400, motifShapes: 12 } as const

/** The least a look must have: props that react, in at least this many of the room's four quarters (from the side its x halves by its y halves; from high up its x halves by its z halves). */
export const LOOK_LEAST = { answering: 8, quarters: 3 } as const

/**
 * Where look pieces may stand, metres; what breaks it is left out with a note (LOOK_NOTES), and a
 * look with more than leftOutMost of its pieces left out fails (LOOK_MISTAKES.tooManyLeftOut).
 * - behind: seen from the side, decor behind the play stands from the back wall to this z.
 * - frontFrom, frontLow: seen from the side, decor in front of the play stands from this z to the
 *   front edge, and is at most frontLow tall.
 * - flat, rim: seen from high up, a piece taller than flat stands within rim of the back wall or a
 *   side wall; a lower one anywhere on the floor.
 * - shadow: seen from high up the camera looks down at a slant from the open front, so a tall piece
 *   hides the floor behind it (toward -z), shadow metres for every metre of its height: at most 0.95 on
 *   every screen the game is played on (scene/highCamera.test.ts holds it).
 * - cover: how far round a place a player stands, a start, a step's place or the way out a piece
 *   may not reach, so it hides none of them.
 * - leftOutMost: the share of the look's pieces that may be left out before it fails.
 */
export const LOOK_PLACE = { behind: -1, frontFrom: 1, frontLow: 0.5, flat: 0.3, rim: 1.5, shadow: 1, cover: 0.3, leftOutMost: 1 / 3 } as const

/**
 * How the house lays the wallpaper's motif over the walls (step 7a, What the scene draws): its model
 * fitted into `size` metres, `off` in front of its wall, in rows `every` metres apart along it, each
 * row at its height (from the side three rows over the back wall, from high up two along the back
 * wall and each side wall). The look's builder counts a copy of its shapes for each place
 * (wallpaperSpots), and the scene draws one there, so the pieces counted are the pieces drawn.
 */
export const MOTIF = { size: 0.6, off: 0.02, every: 1.9, rows: { side: [2, 4.25, 6.5], high: [0.8, 1.7] } } as const

/** How a dressed solid's model must fit it, metres: its top within `top` of the solid's top, reaching at most `past` beyond the solid's sides, and to within `short` of each of them (left and right; from high up front and back too), so a model never leaves players standing on a ledge that is not drawn. */
export const DRESS_FIT = { top: 0.1, past: 0.3, short: 0.1 } as const

/** A small light's size, metres across: what it is when left out, and the most. */
export const LIGHTS = { size: 0.25, sizeMost: 0.6 } as const

/**
 * Where the house puts each copy of the wallpaper's motif: its middle, MOTIF.off in front of its
 * wall, and its turn round y so it faces into the room (radians counterclockwise from above, facing +z
 * at 0). Along a wall every MOTIF.every metres, every other row half a step on, each copy whole on its
 * wall: from the side 25 over the back wall, from high up 29 along the back wall and both side walls.
 */
export function wallpaperSpots(view: RoomView): { at: Vec3; turn: number }[] {
  const { every, off } = MOTIF
  const half = MOTIF.size / 2
  const spots: { at: Vec3; turn: number }[] = []
  const along = (from: number, to: number, row: number) => {
    const out: number[] = []
    const mid = (from + to) / 2
    for (let k = row % 2 === 0 ? every / 2 : 0; mid + k + half <= to; k += every) out.push(...(k === 0 ? [mid] : [mid - k, mid + k]))
    return out.sort((a, b) => a - b)
  }
  if (view === 'side') {
    const { width, back } = ROOM.side
    MOTIF.rows.side.forEach((y, row) => {
      for (const x of along(-width / 2, width / 2, row)) spots.push({ at: [x, y, back + off], turn: 0 })
    })
    return spots
  }
  const { width, depth } = ROOM.high
  MOTIF.rows.high.forEach((y, row) => {
    for (const x of along(-width / 2, width / 2, row)) spots.push({ at: [x, y, -depth / 2 + off], turn: 0 })
    for (const z of along(-depth / 2, depth / 2, row)) {
      spots.push({ at: [-width / 2 + off, y, z], turn: Math.PI / 2 })
      spots.push({ at: [width / 2 - off, y, z], turn: -Math.PI / 2 })
    }
  })
  return spots
}

/** How many times the house repeats the wallpaper's motif in each view: one for each of its places (wallpaperSpots), which the scene draws. The look's pieces count it each time, and the wallpaper's line says so. */
export const WALLPAPER_COPIES: Readonly<Record<RoomView, number>> = { side: wallpaperSpots('side').length, high: wallpaperSpots('high').length }

// ------------------------------------------------------------------------------ the reference

export const LOOK_BUILDER_REF = {
  wallpaper: `r.wallpaper(model)   a small model the house repeats in rows over the walls, as on wallpaper, about ${MOTIF.size} m across, over the walls' pattern: at most ${LOOK_BUDGET.motifShapes} shapes. It is repeated ${WALLPAPER_COPIES.side} times seen from the side and ${WALLPAPER_COPIES.high} times from high up, so of the look's pieces it costs 1 and its shapes as many times. Call it once at most`,
  dress: `r.dress(solid, model)   draws one of room.solids() as your model instead of its plain shape; only a solid whose dressable() is true. The model stands on the middle of the solid's bottom, facing +z, as built and never stretched, so build it to solid.size(): its top must be where the solid's top is (within ${DRESS_FIT.top} m), it must reach to within ${DRESS_FIT.short} m of the solid's left and right sides (seen from high up, of its front and back too), and it may reach at most ${DRESS_FIT.past} m past them. It still touches exactly as the solid does`,
  decor: `r.decor(at, model, { scale, turn })   a piece of the room's furniture or a thing of its theme, only seen: it touches nothing, and players pass in front of it. It stands at at, facing +z (the viewer), wholly inside the room. Seen from the side it stands behind the play, from the back wall at z ${ROOM.side.back} to z ${LOOK_PLACE.behind}, any height; or in front of it, from z ${LOOK_PLACE.frontFrom} to the front edge at z ${ROOM.side.front}, at most ${LOOK_PLACE.frontLow} m tall. Seen from high up, anything taller than ${LOOK_PLACE.flat} m stands within ${LOOK_PLACE.rim} m of the back wall or a side wall, and lower things anywhere on the floor. What breaks this, would stand inside a solid of the play, or would hide a place a player stands, a start, a step's place or the way out, is left out, and the check says so: seen from high up a tall piece hides what stands behind it (toward -z) as far back as it is tall`,
  prop: `r.prop(at, model, { scale, turn, react, idle, sound, puff })   decor that answers a child: when a player passes in front of it (seen from high up, over it) or anyone taps it, it does its react, with its sound and its puff, at most once a second; its idle moves it gently all the time. It stands as decor stands; it never takes a tap from the play, and the play never sees it. At most ${LOOK_BUDGET.props}`,
  lights: `r.lights([at, ...], { color, size, twinkle })   small lights, a glowing dot at each point, lighting nothing round them: color one colour, or a list taken in turn along the points (warm white if left out); size metres across (${LIGHTS.size} if left out, at most ${LIGHTS.sizeMost}); twinkle true: each slowly brighter and dimmer on its own. They shine the more the dimmer the room. At most ${LOOK_BUDGET.lights} in a room, in all calls together`,
  lamp: `r.lamp(at, { color, power, reach })   a lamp at at, lighting what is near it, as the room code's lamps do (warm white, power ${DEFAULTS.lampPower} and reach ${DEFAULTS.lampReach} m if left out); the room code's lamps and the look's are at most ${BUDGET.lamps} together, and the ${LAMPS_LIT} strongest light the room for real while the others shine as halos`,
} as const satisfies Record<keyof LookBuilder, string>

export const LOOK_DECOR_OPTS_REF = {
  scale: "scale   draws it at this many times its model's size; 1 if left out",
  turn: 'turn   radians round y, counterclockwise as seen from above (+x turns toward -z); 0 if left out',
} as const satisfies Record<keyof LookDecorOpts, string>

export const PROP_OPTS_REF = {
  react: `react   what it does when passed or tapped: ${REACTS.join(' ')}; wobble if left out`,
  idle: `idle   how it moves all the time: ${IDLES.join(' ')}; none if left out`,
  sound: `sound   a sound it makes as it reacts, quieter than the play's: ${HOUSE_SOUNDS.join(' ')}; none if left out`,
  puff: `puff   little shapes flying out of it as it reacts, unless another kind of the props' puffs is still in the air: ${PUFF_KINDS.join(' ')}; none if left out`,
} as const satisfies Record<Own<PropOpts, LookDecorOpts>, string>

/** The list of a face's reads as one line says them: "a, b and c". */
const reads = (lines: Readonly<Record<string, string>>) => {
  const all = Object.values(lines)
  return `${all.slice(0, -1).join(', ')} and ${all.at(-1)!}`
}

/** A seen solid's, thing's and zone's reads, each said inside its list's line in ROOM_SEEN_REF. */
export const SEEN_SOLID_REF = {
  at: 'at() (its middle)',
  size: 'size() [w, h, d]',
  shape: "shape() ('box', 'ramp' or 'ball')",
  name: 'name() (null without one)',
  color: 'color()',
  dressable: 'dressable() (true for a plain still box or ramp the room code gave no colour, model, handler, glow or surface of its own)',
} as const satisfies Record<keyof SeenSolid, string>

export const SEEN_THING_REF = {
  at: 'at() (its foot)',
  size: 'size()',
  name: 'name()',
} as const satisfies Record<keyof SeenThing, string>

export const SEEN_ZONE_REF = {
  at: 'at() (its middle)',
  size: 'size()',
  color: 'color()',
} as const satisfies Record<keyof SeenZone, string>

export const ROOM_SEEN_REF = {
  view: "room.view()   'side' or 'high', as the request said",
  level: 'room.level()   1, 2 or 3: the level the room was built at; what you read below is the room at that level',
  solids: `room.solids()   the play's still solids as built, in the order the room code built them (the house's floor, walls and ceiling and the solids in movers are not among them): each has ${reads(SEEN_SOLID_REF)}`,
  things: `room.things()   the play's loose things where they start: each has ${reads(SEEN_THING_REF)}`,
  zones: `room.zones()   the zones the play shows in a colour: each has ${reads(SEEN_ZONE_REF)}`,
  wayOut: "room.wayOut()   the way out's foot",
  starts: 'room.starts()   where each player starts, in seat order',
  spots: "room.spots()   where each step happens, in order (a handle's place as built)",
} as const satisfies Record<keyof RoomSeen, string>

/** How to dress a room for these children: principles only, no list of what a room may hold and no example (plan.md, How Opus is asked). */
export const LOOK_RULES = `How to dress a room for these children:
- The room is full of its theme: its walls, the floor along them and the space under the ceiling carry things of it, and the ways the players go stay clear.
- The play stays the clearest thing in the room: what is far back is quieter than what is played with, and nothing behind the play looks like something to stand on.
- Wherever a child goes, something near answers when passed or tapped; these things are for fun, quieter than the play, and never look like the things the task is played with.
- Light it where the players play and where the theme would have light; a dim room shines with many small lights of its own.
- Nothing scary, nothing sad.`

export const LOOK_PREAMBLE = `LOOK CODE: the body of  function (r, room) { ... }
It runs once, after the room code has built the room at a level, and dresses it: r builds the look, room reads the play as it was built. Everything the look builds is only seen: players pass in front of it and through it, the room code never sees it, and it changes nothing in the play. It has no frame function and no handlers: what moves and answers is said with r.prop. Read where things are from room, never copy numbers from the room code: the room is built anew at each level, and a mend of the play may move things.

THE ROOM'S SHAPE. Points are [x, y, z], metres: x to the right, y up, z toward the viewer, as in the room code. Seen from the side the room is x from ${-ROOM.side.width / 2} to ${ROOM.side.width / 2} and y from 0 (the floor) to ${ROOM.side.height} (the ceiling); the back wall stands at z ${ROOM.side.back} and the floor runs from it to the open front at z ${ROOM.side.front}; everything the players touch stands on the plane z = 0, and floors and ledges reach about a metre in front of it and behind it. Seen from high up the floor is x from ${-ROOM.high.width / 2} to ${ROOM.high.width / 2} and z from ${-ROOM.high.depth / 2} (the back wall) to ${ROOM.high.depth / 2} (the open front), with walls ${ROOM.high.wallHigh} m high at the back and both sides, and no ceiling. The house draws the walls, floor and ceiling in the shell's paint; you dress them.

WEIGHT. The look has a budget of its own: ${big(LOOK_BUDGET.pieces)} pieces, each call 1 and each shape of a model 1 each time it is placed (the wallpaper's model each time it is repeated). Its code may take ${big(LOOK_BUDGET.buildTurns)} loop turns and calls.

THE CHECK. Before children see it, the game builds the look on the room at every level and checks it: it throws nothing and stays within its budget; at least ${LOOK_LEAST.answering} of its props react, in at least ${LOOK_LEAST.quarters} of the room's four quarters (its left and right halves by its lower and upper halves seen from the side, by its back and front halves from high up); what r.decor says is left out is left out, with a note; and a look with more than a third of its pieces left out fails.

CODE. Plain JavaScript: no imports, no async, no timers, no Date. Math.random() is the look's own dice.`

/** The look's whole reference, in order: LOOK_PREAMBLE, then these sections, then the kit's lines. LOOK_RULES goes in the system prompt beside it. */
export const LOOK_REFERENCE: readonly RefSection[] = [
  { title: "r, the look's builder: its calls work only while the look's code runs, and give nothing back.", lines: LOOK_BUILDER_REF },
  { title: 'r.decor and r.prop may take:', lines: LOOK_DECOR_OPTS_REF },
  { title: "A prop's own options (r.prop):", lines: PROP_OPTS_REF },
  { title: 'room, the room as built: read it by calling, as room.solids(); everything it gives back is frozen.', lines: ROOM_SEEN_REF },
  ...MODEL_SECTIONS,
]

// ------------------------------------------------------------------------------ the answer

/** What the look's designer answers. */
export interface LookAnswer {
  look: string
  wish: string
}

export const LOOK_ANSWER_REF = {
  look: 'Look code: the body of function (r, room), no header.',
  wish: "What you wanted for this room's look that the engine could not do, in a sentence; empty when nothing.",
} as const satisfies Record<keyof LookAnswer, string>

/** A look's fix: always the whole look again. */
export interface LookFix {
  look: string
}

export const LOOK_FIX_REF = { look: 'The whole look code again, mended.' } as const satisfies Record<keyof LookFix, string>

// ------------------------------------------------------------------------------ mistakes and notes

/**
 * What the look's check says back, as engine/api.ts MISTAKES does for the room. The look shares the
 * room's sentences for what both misread the same way (notPoint, notNumber, notColor, notChoice,
 * notSize, notList, unknownOption, notOptions, notFunction, noShapes, calledTwice, frozen, frozenList,
 * noField, notCalled, houseOwns). A throw has its own sentence: the room's says the call is skipped
 * in play, and a look has no calls in play.
 */
export const LOOK_MISTAKES = {
  notLooks: (call: string) => `${call} builds play, so it is the room code's: the look builds with r.wallpaper, r.dress, r.decor, r.prop, r.lights and r.lamp`,
  lookLighter: (pieces: number) => `the look used ${big(pieces)} pieces of its ${big(LOOK_BUDGET.pieces)}: dress it lighter, with fewer or simpler models; the wallpaper's model counts each time it is repeated`,
  lookLong: () => `the look's code took more than ${big(LOOK_BUDGET.buildTurns)} loop turns and calls and was stopped: do less work in its loops`,
  tooManyProps: (n: number) => `the look has ${n} props, and a room has at most ${LOOK_BUDGET.props}`,
  tooManyLights: (n: number) => `the look has ${n} small lights, and a room has at most ${LOOK_BUDGET.lights}`,
  motifHeavy: (n: number) => `the wallpaper's model has ${n} shapes, and it has at most ${LOOK_BUDGET.motifShapes}`,
  lampsTogether: (room: number, look: number) => `the room code has ${room} lamps and the look ${look}: together at most ${BUDGET.lamps}; use small lights or glowing shapes for the rest`,
  /** bare names a quarter that has none, as "the upper left quarter"; null when every quarter has one and there are only too few. */
  fewAnswer: (n: number, bare: string | null) =>
    `the look has ${n} props that react, and a room has at least ${LOOK_LEAST.answering} all over it, in at least ${LOOK_LEAST.quarters} of its quarters${bare === null ? '' : `: ${bare} has none`}`,
  notDressable: (at: Point, why: string) => `r.dress: the solid at ${at.join(', ')} cannot be dressed: ${why}. Dress only a solid whose dressable() is true`,
  tooManyLeftOut: (n: number, of: number) => `${n} of the look's ${of} pieces were left out (the notes say why): keep the look off the play`,
  notSolid: (got: string) => `r.dress: solid is ${got}, but it must be one of room.solids(), as room.solids() gave it`,
  /** What the look's code threw that was no misreading, with the designer's line where the browser tells it. */
  thrown: (said: string) => `the look's code threw: ${said}. A look that throws is not drawn, and fails its check`,
  /** The room the look dresses did not build, so the look could not be built on it: the room's fault, not the look's. */
  roomUnbuilt: (said: string) => `the room's code did not build, so the look could not be checked on it: ${said}`,
} as const

/** Why a piece was left out or a solid could not be dressed, as LOOK_NOTES and LOOK_MISTAKES.notDressable say it. Every number comes from LOOK_PLACE, DRESS_FIT and ROOM. */
export const LOOK_WHY = {
  notPlain: 'the room code gave it a colour, a model, a handler or a surface of its own',
  hidden: 'it is hidden as play starts',
  glows: 'it glows',
  ball: 'it is a ball',
  topOff: (top: number, solidTop: number) => `its top is ${top} m above the solid's bottom, where the solid's top is ${solidTop} m`,
  pastSide: (by: number) => `it reaches ${by} m past the solid's side`,
  shortOf: (by: number) => `it stops ${by} m short of the solid's side`,
  outsideSide: `seen from the side a piece stands wholly inside the room, x ${-ROOM.side.width / 2} to ${ROOM.side.width / 2} and y 0 to ${ROOM.side.height}`,
  outsideHigh: `seen from high up a piece stands wholly inside the room, x ${-ROOM.high.width / 2} to ${ROOM.high.width / 2} and z ${-ROOM.high.depth / 2} to ${ROOM.high.depth / 2}, on the floor or above it`,
  betweenBands: (z0: number, z1: number) =>
    `seen from the side a piece stands behind the play, from z ${ROOM.side.back} to ${LOOK_PLACE.behind}, or in front of it, from z ${LOOK_PLACE.frontFrom} to ${ROOM.side.front}; this one reaches from z ${z0} to ${z1}`,
  frontTall: (h: number) => `in front of the play a piece is at most ${LOOK_PLACE.frontLow} m tall, and this one is ${h} m`,
  offWall: (h: number, d: number) => `seen from high up a piece taller than ${LOOK_PLACE.flat} m stands within ${LOOK_PLACE.rim} m of the back wall or a side wall; this one is ${h} m tall and ${d} m from the nearest`,
  start: (seat: number) => `player ${seat}'s start`,
  step: (step: number) => `step ${step}'s place`,
  wayOut: 'the way out',
  floor: (solid: string) => `the top of ${solid}, where players stand`,
  /** The room's four quarters as LOOK_MISTAKES.fewAnswer names a bare one: the left and right halves by the lower and upper halves from the side, by the back and front halves from high up. */
  quarters: {
    side: ['the lower left quarter', 'the lower right quarter', 'the upper left quarter', 'the upper right quarter'],
    high: ['the back left quarter', 'the back right quarter', 'the front left quarter', 'the front right quarter'],
  } satisfies Record<RoomView, readonly string[]>,
} as const

/** Notes for the look's check: pieces left out or drawn plain, told so the designer knows. Too many left out fail the look (LOOK_MISTAKES.tooManyLeftOut). */
export const LOOK_NOTES = {
  inPlay: (call: string, at: Point, what: string) => `${call} at ${at.join(', ')} would stand inside ${what}, so it was left out`,
  hides: (call: string, at: Point, what: string) => `${call} at ${at.join(', ')} would hide ${what} from the children, so it was left out`,
  outOfPlace: (call: string, at: Point, rule: string) => `${call} at ${at.join(', ')} was left out: ${rule}`,
  dressMisfit: (at: Point, why: string) => `r.dress: the model for the solid at ${at.join(', ')} does not fit it (${why}), so the solid keeps its plain shape: build the model to solid.size()`,
} as const

// ------------------------------------------------------------------------------ what the look builds

/**
 * Whether the look may dress a solid (SeenSolid.dressable, and the survey's marks): a box or a ramp
 * shown when built, not in a mover, that the room code gave nothing of its own but its place, size,
 * turn and name (Solid.plain: no colour, model, handler or surface option), that glows not, and is
 * not one of the house's own. A colour the game gave means it matters to the play, so the look keeps
 * it. Read once the room is built, before play.
 */
export function dressable(solid: Solid): boolean {
  return solid.plain && !solid.house && solid.mover === null && !solid.hidden && solid.glow === null && solid.shape.kind !== 'ball'
}

/**
 * What the look's builder (engine/lookBuilder.ts buildLook) gives back: the look as plain data,
 * beside the World and never in it, so the World and its random stream are the same with a look or
 * without one. Its models are its own list (ModelId here indexes `models`, not World.models). The
 * scene draws it (scene/lookView.ts); the check reads its notes and counts (trial/lookCheck.ts).
 */
export interface LookBuilt {
  models: Recipe[]
  wallpaper: ModelId | null
  dressed: { solid: HandleId; model: ModelId }[]
  decor: { at: Vec3; model: ModelId; scale: number; turn: number }[]
  props: { at: Vec3; model: ModelId; scale: number; turn: number; react: React; idle: Idle | null; sound: HouseSound | null; puff: PuffKind | null }[]
  lights: { at: Vec3; color: string; size: number; twinkle: boolean }[]
  lamps: { at: Vec3; color: string; power: number; reach: number }[]
  /** LOOK_NOTES sentences: pieces left out and dressings that did not fit. */
  notes: string[]
  /** pieces as LOOK_BUDGET counts them; props those built; answering those of them not left out (every prop reacts); quarters how many of the room's four have one; leftOut of `of` pieces placed. */
  counts: { pieces: number; props: number; answering: number; quarters: number; lights: number; lamps: number; leftOut: number; of: number }
}
