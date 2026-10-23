import type { Ground, RoomId } from '../../../pia-jump/src/game/model'
import type { Reward } from './closet'

/**
 * Super Me's units, state and tuning. One unit is a tile; x grows right, y grows down; a
 * body's x is its centre and its y its feet. Every level is one of Pia Jump's five places,
 * drawn by Pia Jump's world art, and the person runs and jumps like big Pia: the movement
 * constants are Pia Jump's own (pia-jump/src/game/model.ts), imported where they are used.
 */

/** The four blocks the person builds with. */
export type Kind = 'plank' | 'cube' | 'trampoline' | 'ladder'
export const KINDS: readonly Kind[] = ['plank', 'cube', 'trampoline', 'ladder']

export interface Cell {
  col: number
  row: number
}

/** A crate of one block, standing in its cell. */
export interface Crate extends Cell {
  kind: Kind
}

/** A present, standing in its cell, and the closet item inside. */
export interface Present extends Cell {
  reward: Reward
}

/** A level as levels.ts writes it. The map legend is in map.ts. */
export interface LevelDef {
  /** Which of Pia Jump's places it is: its look, its tune and its id. */
  id: RoomId
  /** What the child sees on the level's card. */
  name: string
  map: readonly string[]
  /** The presents' items, in the order map.ts reads the presents (left to right, then top to bottom). */
  rewards: readonly [Reward, Reward, Reward]
}

/** A parsed level, never changed by the sim. The fields of Ground are what Pia Jump's world art draws. */
export interface Level extends Ground {
  name: string
  crates: readonly Crate[]
  presents: readonly Present[]
  /** The person's feet start at the bottom centre of this cell. */
  start: Cell
  /** The finish arch's foot is the bottom centre of this cell. */
  finish: Cell
}

/** What a built block is to the cell it fills: a cube is solid, a plank is a shelf, a ladder is climbed (its top cell is also a shelf), a trampoline throws her up. */
export const BUILT = { none: 0, cube: 1, plank: 2, ladder: 3, ladderTop: 4, trampoline: 5 } as const

/** A block she built: its kind, its first cell (a plank's left end, a ladder's top), how many cells it fills (a plank across, a ladder down), and when. */
export interface Piece extends Cell {
  kind: Kind
  size: number
  at: number
  /** A trampoline's last bounce, or -1. */
  usedAt: number
}

export interface Hero {
  /** Centre x and feet y, now and at the start of the last step (the picture interpolates between them). */
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  w: number
  h: number
  facing: -1 | 1
  grounded: boolean
  /** A jump rises gently only while held (and for MIN_JUMP_HOLD), a trampoline always: what sent her up. */
  launch: 'none' | 'jump' | 'trampoline'
  /** Tick she last stood on something: a jump within COYOTE of it still goes. */
  groundAt: number
  jumpedAt: number
  landedAt: number
  bonkedAt: number
  /** On a ladder, going up on her own. */
  climbing: boolean
  /** She jumped off a ladder: no ladder takes her again before this tick. */
  letGoUntil: number
  /** Tick she last put a block down, and last tried where none fits. */
  builtAt: number
  nopeAt: number
  /** Distance walked or climbed, only ever growing: the walk and climb cycles' phase. */
  stride: number
  /** Ticks she has pushed the same way on the ground: past RUN_AFTER she runs. */
  pushTicks: number
  skidding: boolean
  /** The last safe ground she stood on, where the rescue bubble brings her. */
  safeX: number
  safeY: number
}

/** What the player holds, set through setMove, pressJump, releaseJump and pressBuild. */
export interface Input {
  move: -1 | 0 | 1
  jumpHeld: boolean
  /** Tick of the last jump press not yet used, or -1. */
  jumpAt: number
  /** Tick of a build press not yet used, or -1. */
  buildAt: number
}

/**
 * play: the player steers. rescue: she fell out of the level and a bubble floats her from
 * (fromX, fromY) to (toX, toY) over RESCUE_FOR. present: a present opens and everything
 * holds still for PRESENT_FOR. finish: she reached the arch and dances for FINISH_FOR.
 * done: the level is over; the game takes it from here.
 */
export type Phase = 'play' | 'rescue' | 'present' | 'finish' | 'done'

export type EventKind =
  | 'jump' // n: her take-off speed along x
  | 'land' // a landing after a fall of more than a tile; n: the height
  | 'skid'
  | 'bonk' // her head knocked a ceiling
  | 'bounce' // a trampoline threw her up
  | 'climb' // she took hold of a ladder
  | 'crate' // a crate picked up; n: the index into KINDS of its block
  | 'refill' // every crate came back: her hands and the level were empty
  | 'build' // a block put down; n: the index into KINDS
  | 'nope' // no room for the chosen block there, or none in her hands
  | 'present' // a present opened; n: its index into level.presents
  | 'fall' // she fell out of the level
  | 'rescued' // the bubble set her down; n: 1 if it carried her across the gap
  | 'finish' // she reached the arch
  | 'done'

/** Something that happened in one step, where, and one number whose meaning the kind gives. */
export interface SimEvent {
  kind: EventKind
  x: number
  y: number
  n: number
}

export interface Sim {
  tick: number
  phase: Phase
  phaseAt: number
  input: Input
  hero: Hero
  /** Blocks in her hands, by kind. */
  hand: Record<Kind, number>
  /** The block the build button puts down. */
  chosen: Kind
  /** Every block she built, in the order she built them. */
  pieces: Piece[]
  /** BUILT codes by tile index: what her blocks make of each cell. */
  built: Uint8Array
  /** One per level.crates: 1 once picked up (all come back with a refill). */
  taken: Uint8Array
  /** One per level.presents: 1 once opened. */
  opened: Uint8Array
  /** One per level.gaps: how often she fell into it this visit. */
  falls: Uint8Array
  /** The present opening now, or -1. */
  present: number
  /** The rescue bubble's flight. */
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** What happened this step. The game drains it after every step. */
  events: SimEvent[]
}

// ---------------------------------------------------------------------------------------
// Tuning. Running, jumping, gravity, the trampoline's throw and the rescue are Pia Jump's.

/** Her box: big Pia's width, a little shorter, so she walks through two-tile tunnels. */
export const HERO_W = 0.8
export const HERO_H = 1.7
/** A plank is this many cells across; a ladder this many cells up from the floor, or fewer under a ceiling, but never fewer than LADDER_MIN. */
export const PLANK = 3
export const LADDER = 4
export const LADDER_MIN = 2
/** On the ground a plank may start this many solid cells past her front, so a bridge still reaches the gap from a step before its edge. */
export const PLANK_SKIP = 2
/** She climbs this fast (tiles/s), and pushing sideways on a ladder moves her this fast. */
export const CLIMB = 4
export const CLIMB_SIDE = 2.5
/** After a jump off a ladder no ladder takes her for this long (s). */
export const LET_GO = 0.3
/** She bounces off a trampoline when her feet cross its top within this of its centre along x: her box and its mat overlap. */
export const TRAMPOLINE_REACH = 0.8
/** A crate or a present is picked up by touching a square this wide around its cell's centre. */
export const CRATE_BOX = 0.8
/** A present holds everything still this long while it opens; the finish dance lasts this long. */
export const PRESENT_FOR = 1.6
export const FINISH_FOR = 2.5
