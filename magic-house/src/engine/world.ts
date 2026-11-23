/**
 * Magic House: the world as plain data. Written as types in step 1; the sim that keeps it is step 2
 * (engine/sim.ts). Step 2 only added fields, each marked "Added in step 2", and changed none: the
 * scene reads the rest as step 1 wrote it.
 *
 * This is the engine's whole state, and what the scene and the HUD read each frame: numbers, strings,
 * plain objects and arrays, no three.js and no functions, so a world can be cloned (structuredClone),
 * sent between the worker and the page, and stepped by vitest for minutes. Everything the engine
 * itself keeps from one frame to the next is here: the forgiving jump's state, the last floor a
 * player stood on, the freedom rule's count, last frame's contacts. What made code keeps lives
 * beside it in the sim, never in it, as Silly Billy keeps its running actions beside its world: the
 * closures (handlers, the frame function, each mover's place, w.after's timers), the room's own
 * variables, and the walkthrough's generator. Those cannot be copied, so a replay builds the room
 * again from its seed and plays the same inputs; the bots' search copies only a Player. The scene never changes it (coding-style.md:
 * the scene reads it and never mutates it): what happens once, a sound or a shake, comes as a cue
 * with a serial number, and the page plays the cues it has not played yet.
 *
 * Space and time are made code's (engine/api.ts): metres, x to the right, y up, z toward the viewer;
 * seconds on the game's clock, t, from the start of play; a frame is 1/60 s. Turns are radians,
 * counterclockwise on the screen. From high up (step 6) the same axes hold, the floor being x and z:
 * a turn is round y, counterclockwise as seen from above (+x turns toward -z), as three.js's
 * rotation.y turns it, and every body keeps its z.
 *
 * Every handle has an id (HandleId): the players take 0 to the party's size less one, in seat
 * order, and every handle the room builds takes the next, in build order, so the id is also the
 * order FRAME_ORDER goes by. The house's own solids (Solid.house: its floor, walls and ceiling) are
 * built once the room's code has returned, so they take the ids after the room's and every handle
 * the room builds keeps its id. Each kind's list keeps one shape for life: everything is built
 * before play, and appearing is a hidden handle shown.
 *
 * Step 7a (every room a room) changed fields here, which earlier steps did not: the room has one
 * size (engine/api.ts ROOM, so ROOM_BOUNDS, and no RoomSize), and the shell the house draws round it
 * (World.shell) in place of r.sky.
 */

import type { Words } from '../../../profiles/src/lang'
import type { Look, Puff, Recipe, Slot, Vec3 } from '../../../silly-billy/src/engine/types'
import type { Wearing } from '../saves'
import type { SeatIndex } from '../seats/types'
import { ROOM, type Count, type Level, type Rise, type Shell, type StickMode } from './api'
import type { HouseSound } from './sounds'

/** A handle's id: players first in seat order, then the room's handles in build order. */
export type HandleId = number
/** A model's index in World.models. */
export type ModelId = number

/** What the game rolled for a room, said to the designer in a plain sentence (plan.md, A model cannot roll dice, so the game does): played together, against each other or side by side. */
export type RoomKind = 'together' | 'contest' | 'side'
/** How the room is seen: from the side, or from high up (step 6: the floor is x and z, y is up; engine/api.ts ROOM_PREAMBLE). */
export type RoomView = 'side' | 'high'
/**
 * The room's box in each view (World.bounds): the inside of the house, from ROOM. From the side x and
 * y are the room's, z from the back wall to the open front; from high up x and z are the floor's and
 * y runs from the floor to the height players are held under. The same in every room.
 */
export const ROOM_BOUNDS: Readonly<Record<RoomView, { readonly min: Vec3; readonly max: Vec3 }>> = {
  side: { min: [-ROOM.side.width / 2, 0, ROOM.side.back], max: [ROOM.side.width / 2, ROOM.side.height, ROOM.side.front] },
  high: { min: [-ROOM.high.width / 2, 0, -ROOM.high.depth / 2], max: [ROOM.high.width / 2, ROOM.high.height, ROOM.high.depth / 2] },
}

/**
 * The house's own shell (step 7a): the rooms that are the house's and not a designer's (the end's
 * hall, the dressing room's bare stage) and the rooms tests build without an answer are drawn in it.
 * Cream walls with stripes, a floor of boards, a warm ceiling and dark wood trim, in full light.
 */
export const HOUSE_SHELL: Shell = {
  walls: { color: '#f1dfbf', second: '#e6cc9e', pattern: 'stripes' },
  floor: { color: '#b9824f', second: '#a8723f', pattern: 'stripes' },
  ceiling: { color: '#fff4e0', second: '#fff4e0', pattern: 'plain' },
  trim: '#8a5a32',
  light: 1,
}

/** A value on its way somewhere: from `from` at world time `start` to `to` over `secs`, easing in and out with the engine's own ease; `to` from then on. secs 0 is there at once. */
export interface Ease<T> {
  from: T
  to: T
  start: number
  secs: number
}

/** A glow on a handle: glow(color, pulse); null is none. */
export interface Glow {
  color: string
  /** Slowly brighter and dimmer, to draw the eye. */
  pulse: boolean
}

/** What every handle the room builds has. */
interface Built {
  id: HandleId
  /** Its name for the walkthrough (w.get), or null. */
  name: string | null
  hidden: boolean
  /** The mover it was built in, or null. Then `at` and `turn` are measured from the mover's origin and turn, and the scene hangs it in the mover's group. */
  mover: HandleId | null
}

/** A handle the room builds with a place of its own, which putAt and slideTo move. */
interface Placed extends Built {
  /** Its middle, or for a thing and decor its foot; in the room, or from its mover's origin. */
  at: Vec3
  /** An engine slide under way (slideTo), which the bots' search sees coming, or null. `at` is kept where it is now. */
  slide: Ease<Vec3> | null
}

/** A model's parts as the room's code posed them (pose(part, rot, secs)): each part's turn from its pivot, radians round x, then y, then z. A part never posed is as built. */
export type PartTurns = Record<string, Ease<Vec3>>

/** A solid's shape, as built. */
export type SolidShape =
  | { kind: 'box'; size: Vec3 }
  /** A wedge in the box `size`, flat underneath, its top rising toward `rises`. */
  | { kind: 'ramp'; size: Vec3; rises: Rise }
  | { kind: 'ball'; radius: number }

/** How a solid's top treats who stands on it. */
export interface Surface {
  color: string
  /** Slippery: whoever walks on it slides. */
  ice: boolean
  /** Metres whoever lands on it is thrown above its top; 0 is no bounce. */
  bounce: number
  /** m/s whoever stands on it is carried along, [vx, vy, 0]; [0, 0, 0] is none. */
  belt: Vec3
  /** A floor one jumps up through from below. */
  through: boolean
}

export interface Solid extends Placed {
  shape: SolidShape
  /** Added in step 7a: one of the house's own solids, its floor, walls or ceiling, built after the room's code returned, with no handlers. The survey's lists and the still batch skip them, and scene/shell.ts draws them. */
  house: boolean
  /** Added in step 7a: the room's code gave it nothing of its own but its place, size, turn and name: no colour (so it took the shell's floor colour), model, handler (touch, land, use, tap) or surface option (ice, bounce, belt, through). Such a solid may be dressed by the look (engine/look.ts dressable). */
  plain: boolean
  surface: Surface
  /** Drawn by this model in place of the plain shape, or null for the plain shape in its colour. */
  model: ModelId | null
  /** Radians round its middle. */
  turn: number
  /** An engine turn under way (turnTo), or null. */
  turning: Ease<number> | null
  glow: Glow | null
  parts: PartTurns
}

/** A group that moves as one. Its parts (solids, decor, zones, lamps, signs) name it as their mover. Its place is a function of its own clock, kept in the sim. */
export interface Mover extends Built {
  /** Where its origin is now, from place(clock) and the offset. */
  at: Vec3
  /** Its turn now, from place(clock) and turnBy. */
  turn: number
  /** Its own clock, seconds, which place is asked at. */
  clock: number
  /** How fast its clock runs against the room's: 1, 0 stopped, -1 back (speed). */
  speed: number
  /** The offset from where its place puts it (slideBy), [0, 0, 0] at the start. */
  by: Ease<Vec3>
  /** The turn added to its place's (turnBy), 0 at the start. */
  turnBy: Ease<number>
  glow: Glow | null
}

/** A loose thing: it falls, slides, rests, is stood on, pushed, carried and thrown. */
export interface Thing extends Placed {
  /** Its kit model, in World.models. */
  model: ModelId
  scale: number
  /** It touches as a ball and looks as if it rolls. */
  round: boolean
  /** How heavy, one child being 1. */
  weight: number
  velocity: Vec3
  /** How far it has rolled, radians, for a round thing's drawn turn. From high up it counts up whichever way it rolls (engine/floorThings.ts), and the scene turns it round the level line square to its velocity. */
  roll: number
  /** Where it was built: it comes back here when it leaves the room, or by goHome. */
  home: Vec3
  /** The seat carrying it, or null. A carried thing is drawn over its carrier's head and touches nothing. */
  heldBy: SeatIndex | null
  /** Room code moved it with putAt this frame or the one before: the bots' search cannot foresee it. */
  codeMoved: boolean
  /** Added in step 2: the frame room code last put it somewhere (putAt), -1 for never; codeMoved follows from it. */
  putFrame: number
  /** Added in step 2: what it rests on, a solid or another thing by id, or null in the air or carried. */
  on: HandleId | null
  /** Added in step 2: the box it touches as, from its foot (`at`): its model's bounds times its scale. A round thing touches as the ball in this box. */
  box: { min: Vec3; max: Vec3 }
  glow: Glow | null
  parts: PartTurns
}

/** A model that is only seen. */
export interface Decor extends Placed {
  model: ModelId
  scale: number
  turn: number
  turning: Ease<number> | null
  glow: Glow | null
  parts: PartTurns
  /** False until room code first moves, turns, poses, glows or hides it. The scene merges the decor that never changed and was built outside any mover into one mesh (plan.md, The look, people and presents) and takes a piece out of it when this turns true; decor in a mover is drawn in its mover's group, never in that mesh. */
  changed: boolean
}

/** A box of space that notices who is in it. */
export interface Zone extends Placed {
  size: Vec3
  /** Drawn as a soft see-through box of this colour, or null: unseen. */
  color: string | null
  /** m/s², [ax, ay, 0]. */
  wind: Vec3
  /** m/s² toward its middle; below 0 pushes out. */
  pull: number
  /** How hard the world pulls in it: 1 as everywhere. */
  gravity: number
  /** 0 to 1. */
  drag: number
  /** Who is in it now, players and things, by id: the sim's bitmask turned out as a list in id order. */
  inside: HandleId[]
  glow: Glow | null
}

export interface Lamp extends Placed {
  color: string
  power: number
  reach: number
}

/** What a sign shows, with a clock's start: a ring that empties over `clock` seconds from `from`. */
export type SignShown = number | Words | Count | { clock: number; from: number }

export interface Sign extends Placed {
  what: SignShown
}

/** What a button does, as its pad and the HUD show it: the engine's jump or grab, a job of the room's own with its word and picture, or no button. */
export type ButtonShown = 'jump' | 'grab' | { word: Words; icon: ModelId } | null

/** A player's body as Silly Billy's rig dresses it, from their gallery face: the kid's colours and build. The height is the kid's (KID_HEIGHT) times `size`. */
export type BodyLook = Pick<Look, 'skin' | 'eyes' | 'top' | 'bottom' | 'shoes' | 'skirt' | 'build'>

/** A change the room made to a player (p.change), until `until`. */
export interface Change {
  speed: number
  jump: number
  size: number
  weight: number
  until: number
}

/**
 * A player: a Silly Billy kid, posed each frame by this game's own animator from what is here.
 * The animator turns the facts below into Silly Billy's Pose (walk cycle from stride, a crouch
 * before a jump, a squash on landing, arms up while carrying, a lean while pushing, stars while
 * bonked); the sim never poses.
 */
export interface Player {
  id: HandleId
  seat: SeatIndex
  /** Their feet. */
  at: Vec3
  velocity: Vec3
  /** +1 facing right, -1 facing left. From high up it follows heading's x. */
  facing: 1 | -1
  /** Added in step 6: from high up, the way they face, a unit vector on the floor [x, 0, z], where the stick last pointed (grab puts down and throws that way); [1, 0, 0] from the side, where facing says it. */
  heading: Vec3
  /** On something: a solid, a thing or a player, by id, or null in the air. */
  on: HandleId | null
  /** Metres walked on a floor since play began: the animator's walk cycle follows it, so feet never slide. */
  stride: number
  /** World times of the last jump, landing, throw and pick-up, for the animator's moves; -Infinity before the first (the world is cloned with structuredClone, which keeps it, never with JSON). */
  jumpedAt: number
  landedAt: number
  threwAt: number
  grabbedAt: number
  /** How fast they were falling when they last landed, m/s, for how hard the squash is. */
  landSpeed: number
  /** The thing they carry, or null. */
  holding: HandleId | null
  /** The thing they push now, or null. */
  pushing: HandleId | null
  /** Still after a bonk until this time; -Infinity when not bonked. It cannot be bonked again until bonkedUntil - REFEREE.bonkSecs + REFEREE.freeAfter. */
  bonkedUntil: number
  /** The freedom rule (engine/api.ts REFEREE): when the run of frames they could not move by their own stick (bonked, a speed 0 change, put somewhere by putAt) began, or null while they can; and the time until which bonk, speed 0 and putAt do nothing to them, -Infinity when never freed. */
  heldSince: number | null
  freeUntil: number
  /** Their pad as the sim read it last frame: p.stick() and p.button() read it, and a release is a button held then and not now. */
  input: { stick: [number, number]; a: boolean; b: boolean }
  /** The forgiving jump (Pia Jump's model.ts): when their feet last left a floor without a jump (a jump within coyote time still counts), until when a press made in the air is kept for the landing, and whether the jump that lifted them is still held (let go early, it is the short hop). -Infinity for never. */
  leftGroundAt: number
  jumpKeptUntil: number
  jumpHeld: boolean
  /** The last floor they stood on and where, for coming back after a fall onto it; null until they first stand. `at` is measured from the floor's middle, so a floor that moves takes them back to where it is now. */
  lastFloor: { on: HandleId; at: Vec3 } | null
  change: Change | null
  /** Added in step 2: where their feet were when the jump that lifted them began, for the short hop's height. */
  jumpFrom: number
  /** Added in step 2: what they stand on is steeper than FEEL.slope, so they slide down it and the stick cannot walk them up. */
  steep: boolean
  /** Added in step 2: their size now, times normal: it follows change.size, growing only where there is room. Their box is FEEL.width by FEEL.height times it. */
  size: number
  /** Added in step 2: where they started (p.putAt while building): they come back here after a fall when their last floor is gone. */
  start: Vec3
  /** Added in step 2: the frame room code last put them somewhere (p.putAt in play), -1 for never: the freedom rule counts it. */
  putFrame: number
  /** Added in step 2: where they stood when the run of being held began (heldSince): a putAt counts as holding them only while they stay near it (REFEREE.pinRadius). */
  heldAt: Vec3
  /** Coming back after a fall: drawn fading in from here until `until`, or null. */
  back: { from: Vec3; until: number } | null
  /** How the stick moves them, and what each button shows (r.controls). */
  stick: StickMode
  a: ButtonShown
  b: ButtonShown
  /** Their seat's colour, '#rrggbb'. */
  color: string
  score: number
  /** The badge over them shows their score from the first score given. */
  badge: boolean
  glow: Glow | null
  body: BodyLook
  /** What they wear in each slot: from their saves, and where a slot is left out there, from their gallery face. The scene finds each thing's recipe by its id (a present in the library, or the starting wardrobe). */
  wear: Partial<Record<Slot, Wearing>>
}

/** One step of the room's list, as the dots at the top and the helper read it. */
export interface StepShown {
  hint: Words
  /** Added in step 2: the handle the step happens at, whose place `at` follows each frame, or null for a fixed point. */
  target: HandleId | null
  /** Where it happens now: a point, or the handle's place this frame. */
  at: Vec3
  /** When it turned done, or null while it is not. */
  doneAt: number | null
}

/** Where the camera looks: the rectangle of the room it shows, on z = 0. The sim keeps it (engine/camera.ts), the players are held inside it, and the scene draws exactly it, fitted above the touch pads. Every room has one size (engine/api.ts ROOM), so it never moves: the inside with the house's walls, floor and beam round it. From high up (step 6) it is the box's front, x and y: the floor frame's x and width (World.floorFrame), and the room's box from its bottom to its top. */
export interface Camera {
  /** Its middle. */
  x: number
  y: number
  /** Its size, metres. */
  width: number
  height: number
}

/**
 * Added in step 6. From high up, where the camera looks: a rectangle of the floor, x ± width / 2 by
 * z ± depth / 2, with the room's whole height over it (the box from bounds.min[1] to bounds.max[1]).
 * The camera sees it from the viewer's side (+z), looking down at a slant with no turn, so x is the
 * screen's right and -z its up. The sim keeps it (engine/camera.ts), the players are held inside it
 * on the floor, and the scene draws that box whole. Every room has one size, so it never moves.
 */
export interface FloorFrame {
  /** Its middle on the floor. */
  x: number
  z: number
  /** Its size, metres, along x and along z. */
  width: number
  depth: number
}

/** A number or words rising from a point and fading (w.pop). */
export interface Pop {
  at: Vec3
  what: number | Words
  born: number
}

/** A sound to play once. `serial` counts up over the world's life: the page plays each cue whose serial is past the last it played. The sim keeps a second of them. */
export interface SoundCue {
  name: HouseSound
  serial: number
  /** Where it comes from, for its side in the speakers; null from nowhere in particular. */
  at: Vec3 | null
  /** Added in step 2: when it was made, so the sim keeps a second of them. */
  born: number
}

/** A shake of the view, half a second from `born` (w.shake). */
export interface Shake {
  strength: number
  born: number
  serial: number
}

/** When the helper comes: flySecs with no step done, it flies to the next step's spot; saySecs after that, it says the hint. A ? press (seats/types.ts FrameInput.help) does both at once. */
export const HELPER = { flySecs: 40, saySecs: 40 } as const

/** The house's helper, a small lantern with a face (plan.md, Help, and how hard). The sim moves it in the referee's phase; the HUD shows and says its words. */
export interface Helper {
  at: Vec3
  /** The step it flies to, by index, or null while it waits at home. */
  step: number | null
  /** The hint it says now, or null. Said aloud once, when it starts. */
  says: Words | null
  saidAt: number
  /** When a step was last done, or play began: it comes when nothing is done for a while after this. */
  quietSince: number
  /** How many hints it has said, its own and those called with ?: the room's result counts them. */
  hints: number
}

/** How the room ended. */
export interface End {
  at: number
  /** By w.finish, or by r.clock running out. */
  by: 'finish' | 'clock'
  /** In a contest, the seats in the order they came, the winner first; null in any other room. */
  order: SeatIndex[] | null
}

/** The way out: a door that opens when the room is finished. */
export interface WayOut {
  /** Its foot. */
  at: Vec3
  open: boolean
}

/** The world: the sim's whole state, read by the scene and the HUD every frame. */
export interface World {
  /** Seconds of play; 0 while building. */
  t: number
  frame: number
  /** The room's seed, and the state of the room's own random stream (made code's Math.random), so a clone plays on exactly as the original. */
  seed: number
  rng: number
  level: Level
  kind: RoomKind
  view: RoomView
  /** The room's box: ROOM_BOUNDS of its view, the same in every room. The players' holds and the bots' graphs read it. */
  bounds: { min: Vec3; max: Vec3 }
  camera: Camera
  /** Added in step 6: from high up, the frame on the floor the players are held in; null from the side. */
  floorFrame: FloorFrame | null
  /** Added in step 7a: the room's shell from its answer (engine/api.ts Shell), which the house draws round the room and lights it by: its colours parsed by the kit's parseColor to '#rrggbb', its light within LIGHT_RANGE.least to 1 (taken there with SURVEY_NOTES.lightSet). */
  shell: Shell
  /** Every model the room built, once each however often it is placed: things, decor, solids' models and buttons' pictures point here by index. Built by Silly Billy's kit. */
  models: Recipe[]
  solids: Solid[]
  movers: Mover[]
  things: Thing[]
  decor: Decor[]
  zones: Zone[]
  lamps: Lamp[]
  signs: Sign[]
  /** Added in step 7a: the handles the room code built with a use handler (a solid, a mover or a thing), set once the build is done, so the scene can give them a faint halo in a dim room. */
  uses: HandleId[]
  /** In seat order. */
  players: Player[]
  /** Added in step 2: where fingers or the mouse are held down now (FrameInput.pointing.held), on z = 0 from the side and on what is under them from high up: what w.pointers() gives. */
  pointers: Vec3[]
  /** Players push each other (r.pushing): a contest's choice. */
  pushing: boolean
  steps: StepShown[]
  /** The index of the step the room waits for, steps.length when all are done. */
  next: number
  /** How to win, shown and said at the start of a contest (r.rule), or null. */
  rule: Words | null
  /** When the room ends by itself (r.clock), or null. The screen shows the time left. */
  clock: number | null
  wayOut: WayOut
  helper: Helper
  /** Silly Billy's puffs, so its Effects draws them (PuffSource reads t and these). */
  puffs: Puff[]
  pops: Pop[]
  sounds: SoundCue[]
  shakes: Shake[]
  /** The last serial given to a sound or a shake. */
  serial: number
  /** The pairs that touched at the end of last frame, [touched, toucher] by id, so touch and land fire once each time they meet. */
  contacts: [HandleId, HandleId][]
  /** A w.finish called this frame, which takes effect in the referee's phase after the steps are asked, with its order (null in a room that gives none); null when none was called. */
  finishing: { order: SeatIndex[] | null } | null
  /** Null while the room plays. */
  end: End | null
}
