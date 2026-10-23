/**
 * The shapes and numbers every part of Pia Jump agrees on: units, the room, the sim's
 * state, its events and every tuning constant. Nothing here does any work beyond unit
 * helpers; the rules live in sim.ts.
 *
 * Units: 1 is one tile. x runs right and y runs DOWN, row 0 at the top. The tile
 * (col, row) covers [col, col + 1) x [row, row + 1), so its top surface is y = row. A
 * body's x is its centre and its y is its feet. vy < 0 is rising.
 *
 * Time: the sim steps HZ times a second. Every ...At and ...Until field is a tick (a
 * whole step count), -1 for never. Constants are written in seconds and turned into ticks
 * with `ticks`. Drawing reads the interpolated sim time in seconds and measures a stamp
 * with `since`.
 *
 * The sim holds only flat objects (numbers, booleans, string unions) and typed arrays, so
 * `cloneSim` is a cheap flat copy for the bot. Everything that never changes during a
 * visit lives in the parsed Room instead, shared by every clone.
 */

export const HZ = 120
export const STEP = 1 / HZ
export const ticks = (seconds: number) => Math.round(seconds * HZ)
/** Seconds from the tick stamp `at` to the sim time `t` (seconds); Infinity for a stamp of -1. */
export const since = (at: number, t: number) => (at < 0 ? Infinity : t - at * STEP)

export const ROWS = 15
/** Box edges are pulled in by this when finding the cells they cover, so a body resting exactly on a tile is not inside it. */
export const EPS = 1e-6
/** Nothing moves further than this in one step (the fastest thing, a spring launch, moves 0.175); the sim throws if anything does, which is what lets collision skip sweep tests. */
export const MAX_STEP_MOVE = 0.25

export type RoomId = 'garden' | 'kitchen' | 'bath' | 'toys' | 'roof'
export type KittenName = 'Sunny' | 'Coco' | 'Mochi' | 'Lulu' | 'Pepper'

// ---------------------------------------------------------------------------------------
// The room: parsed once from its map (room.ts), never changed by the sim.

/** Static tiles, as stored in Room.tiles. Gift boxes, cookie blocks and gates are blocks, not tiles. */
export const TILE = { air: 0, ground: 1, abc: 2, column: 3, shelf: 4 } as const
export type TileCode = (typeof TILE)[keyof typeof TILE]

/** gift: a gift box; cookie: big Pia breaks it from below, small Pia bumps it; gate: stands until the Big Grumble is beaten. */
export type BlockKind = 'gift' | 'cookie' | 'gate'
/** What a gift box holds: one star, a star per bump up to STARS_BOX_HITS, a power (a cupcake for small Pia, the wand otherwise), the rainbow ball. Cookies and gates hold 'none'. */
export type Gift = 'star' | 'stars' | 'power' | 'ball' | 'none'

export interface BlockDef {
  col: number
  row: number
  kind: BlockKind
  gift: Gift
}

export type EnemyKind = 'grumble' | 'snail' | 'bee' | 'boss'

export interface Spawn {
  kind: EnemyKind
  col: number
  row: number
}

export interface Cell {
  col: number
  row: number
}

/**
 * A lift as a room declares it: `width` tiles wide, its top at the top of `row`, its left
 * end at `col`. A ferry waits there until Pia stands on it, carries her (dx, dy) tiles at
 * FERRY_SPEED, waits, and goes home FERRY_WAIT after she steps off. A loop glides there and
 * back on its own every `period` seconds.
 */
export type LiftDef =
  | { kind: 'ferry'; col: number; row: number; width: number; dx: number; dy: number }
  | { kind: 'loop'; col: number; row: number; width: number; dx: number; dy: number; period: number }

/** A room as levels.ts writes it. The map legend is in room.ts. */
export interface RoomDef {
  id: RoomId
  /** What the child sees on the room's card: "Garden". */
  name: string
  kitten: KittenName
  map: readonly string[]
  lifts: readonly LiftDef[]
}

/** A gap in the floor: the columns [col0, col1) where nothing solid reaches the bottom row. */
export interface Gap {
  col0: number
  col1: number
}

export interface Room {
  id: RoomId
  name: string
  kitten: KittenName
  cols: number
  /** TILE codes, row-major: the tile (col, row) is tiles[row * cols + col]. */
  tiles: Uint8Array
  /** The letter on each ABC block, by tile index; '' everywhere else. */
  letters: readonly string[]
  blocks: readonly BlockDef[]
  /** By tile index, the index into `blocks` of the block in that cell, or -1. */
  blockAt: Int16Array
  /** Stars the map places, each at the centre of its cell. */
  stars: readonly Cell[]
  spawns: readonly Spawn[]
  /** Each spring stands in its cell, its feet on the bottom edge. */
  springs: readonly Cell[]
  lifts: readonly LiftDef[]
  /** Pia's feet start at the bottom centre of this cell. */
  start: Cell
  /** The ribbon pole's foot is at the bottom centre of this cell; it rises POLE_HEIGHT. */
  pole: Cell
  /** The kitten's bed stands on the bottom centre of this cell. */
  bed: Cell
  /** Per column, the top row of the solid run that reaches the bottom row (the floor she walks on), or -1 in a gap. */
  floor: Int16Array
  gaps: readonly Gap[]
}

/** The part of a room the world art reads (world.ts): what another game's levels hand it to draw these same places. */
export type Ground = Pick<Room, 'id' | 'cols' | 'tiles' | 'letters' | 'floor' | 'gaps'>

// ---------------------------------------------------------------------------------------
// The sim: everything that changes. Flat objects only.

export interface Body {
  /** Centre x and feet y, now and at the start of the last step (the picture interpolates between them). */
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  w: number
  h: number
}

/** small: one tile tall. big: two tiles, breaks cookie blocks. bubble: big, and blows bubbles. */
export type Form = 'small' | 'big' | 'bubble'

/** What sent her up, which decides the gravity on the way: a jump rises gently only while held (and for MIN_JUMP_HOLD regardless); a spring and a stomp bounce always rise gently. */
export type Launch = 'none' | 'jump' | 'spring' | 'stomp'

export interface Hero extends Body {
  form: Form
  facing: -1 | 1
  grounded: boolean
  /** The lift she stands on, as an index into sim.lifts, or -1. */
  lift: number
  launch: Launch
  /** Tick she last stood on something: a jump within COYOTE of it still goes. */
  groundAt: number
  jumpedAt: number
  landedAt: number
  /** Tick her head last knocked something above her. */
  bonkedAt: number
  /** Tick her form last changed and the form it changed from: the grow and shrink tweens read them. */
  changedAt: number
  was: Form
  hurtAt: number
  /** Nothing hurts her before this tick: SAFE_FOR after a hit or a rescue. */
  safeUntil: number
  /** She reels and the controls do nothing until this tick: a hit while small. */
  dizzyUntil: number
  /** The rainbow ball's power lasts until this tick. */
  ballUntil: number
  /** Tick she last blew a bubble. */
  blewAt: number
  /** Stomps since she last stood on the ground: the next one pays one star more, up to CHAIN_MAX. */
  chain: number
  /** Ground distance covered, only ever growing: the run cycle's phase. */
  stride: number
  /** Ticks she has pushed the same direction on the ground: past RUN_AFTER she speeds up from a walk to a run. */
  pushTicks: number
  /** True while she pushes against her own speed on the ground. */
  skidding: boolean
  /** The last safe ground she stood on (see sim.ts), where the rescue bubble brings her. */
  safeX: number
  safeY: number
  /** A cupcake eaten under a ceiling too low for the big box: she grows as soon as there is room. */
  banked: boolean
}

/**
 * asleep: snoring until Pia is within WAKE_DIST along x. yawn: waking up for YAWN_FOR.
 * walk: patrolling (a bee hovers). shell: a stomped snail hiding, still, until SHELL_WAKE.
 * slide: a kicked shell. poof: a stomped grumble bursting into a happy fluff, gone after
 * POOF_FOR. knocked: flipped over by a bump from below, a shell or the rainbow ball,
 * tumbling out of the room. trapped: caught in a bubble, floating up, gone after
 * TRAPPED_FOR. dizzy: the Big Grumble just after a stomp, harmless and not stompable.
 * bunny: the beaten Big Grumble, now a little bunny hopping away. gone: off the stage for
 * good (enemies are never removed, so they stay aligned with room.spawns).
 */
export type EnemyState = 'asleep' | 'yawn' | 'walk' | 'shell' | 'slide' | 'poof' | 'knocked' | 'trapped' | 'dizzy' | 'bunny' | 'gone'

export interface Enemy extends Body {
  kind: EnemyKind
  state: EnemyState
  stateAt: number
  facing: -1 | 1
  grounded: boolean
  /** Stomps (or bubbles) it still takes: BOSS_HP for the Big Grumble, 1 for the rest. */
  hp: number
  /** A bee's hover centre (as feet y); the starting feet y for the rest. */
  baseY: number
}

/** cupcake: small to big. wand: the bubble form. ball: the rainbow ball's power. */
export type ItemKind = 'cupcake' | 'wand' | 'ball'

export interface Item extends Body {
  kind: ItemKind
  facing: -1 | 1
  grounded: boolean
  /** Tick it started rising out of its box; it touches nothing for RISE_FOR. */
  bornAt: number
  alive: boolean
}

/** A bubble Pia blew: it bounces along the floor and catches the first enemy it touches. */
export interface Bubble extends Body {
  bornAt: number
  alive: boolean
}

/** full: as placed. empty: a gift box with nothing left. broken: a cookie block big Pia broke (gone). open: a gate that has sunk away (gone). */
export type BlockState = 'full' | 'empty' | 'broken' | 'open'

export interface Block {
  state: BlockState
  /** Bumps it has answered: a many-stars box stops giving at STARS_BOX_HITS. */
  hits: number
  /** Tick it was last knocked from below, or -1: the picture hops it for BUMP_FOR. */
  bumpedAt: number
}

/** A ferry waits, goes, stays there, comes back; a loop always loops. */
export type LiftMode = 'wait' | 'go' | 'there' | 'back' | 'loop'

export interface Lift {
  /** Centre x and top y, now and at the start of the last step. Its width is its LiftDef's. */
  x: number
  y: number
  px: number
  py: number
  mode: LiftMode
  modeAt: number
}

/** What the player holds, set by the input layer through setMove, pressJump and the rest. */
export interface Input {
  move: -1 | 0 | 1
  jumpHeld: boolean
  /** Tick of the last jump press not yet used, or -1: it fires within JUMP_BUFFER of the press, the moment she can jump. */
  jumpAt: number
  bubbleHeld: boolean
  /** Tick of the last bubble press not yet used, or -1. */
  bubbleAt: number
}

/**
 * play: the player steers. freeze: she grows or shrinks and everything else holds still
 * for FREEZE_FOR. rescue: she fell out of the room and a bubble floats her from
 * (fromX, fromY) to (toX, toY) over RESCUE_FOR. pole: sliding down the ribbon pole.
 * walk: walking on her own to the kitten's bed. found: the kitten comes out and they hug
 * for FOUND_FOR. done: the visit is over; the game takes it from here.
 */
export type Phase = 'play' | 'freeze' | 'rescue' | 'pole' | 'walk' | 'found' | 'done'

export type EventKind =
  | 'jump' // n: her take-off speed along x
  | 'land' // a landing after falling more than a tile; n: the height fallen
  | 'skid'
  | 'bonk' // her head knocked something that did not answer
  | 'star' // a map star picked up
  | 'giftStar' // a star popped out of a gift box (and counted)
  | 'bump' // a block knocked from below that gave nothing
  | 'break' // a cookie block broke
  | 'sprout' // a power-up started rising out of its box
  | 'grow' // the cupcake
  | 'wand' // the bubble wand
  | 'ball' // the rainbow ball's power started
  | 'ballEnd' // and ran out
  | 'shrink' // a hit took a form away
  | 'hurt' // a hit while small: dizzy
  | 'stomp' // n: the stars it paid
  | 'kick' // a shell kicked
  | 'shellPop' // a shell popped at a wall; n: the stars it paid
  | 'knock' // an enemy knocked over
  | 'wake' // an enemy woke up
  | 'blow' // a bubble blown
  | 'trap' // a bubble caught an enemy
  | 'pop' // a bubble popped empty, or a trapped enemy floated off
  | 'spring'
  | 'fall' // she fell out of the room
  | 'rescued' // the bubble set her down; n: 1 if it carried her across the gap
  | 'pole' // she grabbed the pole; n: the stars it paid
  | 'kitten' // the kitten came out of its bed
  | 'bossHit' // n: stomps it still takes
  | 'bossDown' // the Big Grumble turned into a bunny
  | 'gate' // the gate sank away
  | 'done'

/** Something that happened in one step, where, and one number whose meaning the kind gives. Sounds and effects read these; anything drawn over time reads the stamps on the entities instead. */
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
  /** One per room.spawns, in the same order, never removed. */
  enemies: Enemy[]
  items: Item[]
  bubbles: Bubble[]
  /** One per room.blocks, in the same order. */
  blocks: Block[]
  /** One per room.lifts, in the same order. */
  lifts: Lift[]
  /** One per room.springs: the tick it last launched her, or -1. */
  springs: number[]
  /** One per room.stars: 1 once picked up. */
  taken: Uint8Array
  /** One per room.gaps: how often she fell into it this visit. HELP_AFTER falls into one gap and the rescue carries her across. */
  falls: Uint8Array
  /** Stars picked up this visit, every source together. It only ever grows. */
  stars: number
  /** The rescue bubble's flight. */
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** Stars the pole paid (0 before she grabs it), and the y her hands took it at. */
  poleBonus: number
  poleY: number
  /** Tick the gate opened, or -1. */
  gateAt: number
  /** What happened this step. The game drains it after every step. */
  events: SimEvent[]
}

// ---------------------------------------------------------------------------------------
// Tuning. Everything a parent might want to change is here, grouped by topic.

/** Pia's box, small and big (the bubble form is big). */
export const SMALL_W = 0.7
export const SMALL_H = 0.95
export const BIG_W = 0.8
export const BIG_H = 1.8

/**
 * Running, with no run button. Holding a direction speeds her up at ACCEL to WALK; after
 * RUN_AFTER seconds of pushing the same way on the ground, RUN_ACCEL takes her on to RUN.
 * Letting go slows her at FRICTION on the ground; in the air her speed is kept (no drag),
 * which is what saves a jump when the other thumb lets go. Pushing against her own speed
 * on the ground is a skid at SKID.
 */
export const WALK = 5
export const RUN = 7.5
export const ACCEL = 18
export const RUN_ACCEL = 6
export const RUN_AFTER = 1
export const FRICTION = 28
export const SKID = 36
export const AIR_ACCEL = 18

/**
 * Jumping, the Mario way. Take-off speed grows with running speed from JUMP_V standing to
 * JUMP_V_RUN at RUN. Gravity is G_LOW while she rises with the jump held (and always for
 * the first MIN_JUMP_HOLD, so a tap is a fair hop), and G otherwise. Measured at this step:
 * a tap rises about 2.3 tiles, a full jump about 3.7 standing and 4.6 at a run.
 */
export const JUMP_V = 15
export const JUMP_V_RUN = 17
export const G_LOW = 30
export const G = 75
export const MAX_FALL = 16
export const MIN_JUMP_HOLD = 0.1
/** A jump still goes this long after she walks off a ledge, and a press this long before she lands fires when she lands. */
export const COYOTE = 0.12
export const JUMP_BUFFER = 0.2
/** A head that hits a block by less than this much of its width slides past the corner (more room for the big box). */
export const HEAD_NUDGE_SMALL = 0.25
export const HEAD_NUDGE_BIG = 0.3
/** Falling past a ledge whose top is at most this far above her feet sets her on top of it. */
export const TOE_ASSIST = 0.35

/** A stomp bounces her to at least STOMP_V (STOMP_HELD_V with the jump held), rising gently whatever the button does. */
export const STOMP_V = 11
export const STOMP_HELD_V = 15
/** A spring launches her at SPRING_V, rising gently whatever the button does: about 7.3 tiles. */
export const SPRING_V = 21
/** A spring's pad is this far above its feet (where it is drawn and where she bounces). */
export const SPRING_TOP = 0.66
/** The stomp box is this much wider than the enemy on each side; the hurt box is this much narrower on each side and lower at the top. */
export const STOMP_PAD = 0.15
export const HURT_INSET = 0.1
/** Stomps before landing pay 1, 2, 3 stars and so on, up to this. */
export const CHAIN_MAX = 5

/** Growing or shrinking holds the world still this long. */
export const FREEZE_FOR = 0.5
/** Nothing hurts her this long after a hit or a rescue. */
export const SAFE_FOR = 2.5
/** A hit while small: she reels in place this long, the controls doing nothing. */
export const DIZZY_FOR = 0.5
/** The rescue bubble's float back to safe ground. */
export const RESCUE_FOR = 1.4
/** This many falls into one gap in a visit and the rescue carries her across it instead. */
export const HELP_AFTER = 3
/** The rescue sets her down at least this far from the edge of the ground it picks. */
export const SAFE_MARGIN = 1.5
/** The rainbow ball's power, the last BALL_BLINK of it blinking. */
export const BALL_FOR = 10
export const BALL_BLINK = 2

/** Enemies sleep until she is this close along x, then yawn for YAWN_FOR and stay awake. */
export const WAKE_DIST = 13
export const YAWN_FOR = 0.5
export const GRUMBLE_SPEED = 1.4
export const SNAIL_SPEED = 1.1
/** Enemy boxes as [w, h]. A shell is a stomped snail. */
export const GRUMBLE_BOX = [0.8, 0.7] as const
export const SNAIL_BOX = [0.9, 0.85] as const
export const SHELL_BOX = [0.8, 0.7] as const
export const BEE_BOX = [0.7, 0.6] as const
/** A kicked shell slides at SHELL_SPEED, knocks over every enemy it meets, never hurts her, and pops into SHELL_STARS at the first wall; it is gone once SHELL_FAR from her. A resting shell peeks at SHELL_PEEK and walks again at SHELL_WAKE. */
export const SHELL_SPEED = 8
export const SHELL_STARS = 3
export const SHELL_FAR = 20
export const SHELL_PEEK = 4.5
export const SHELL_WAKE = 6
/** A bee hovers BEE_RANGE above and below its centre, there and back every BEE_PERIOD; its path is a smoothed triangle wave (no sin in the sim). */
export const BEE_RANGE = 1.25
export const BEE_PERIOD = 3
export const POOF_FOR = 1
export const TRAPPED_FOR = 1.2
/** The Big Grumble: stomps to beat; its box and walking speed by stomps left (index hp - 1); it hops every BOSS_HOP_EVERY at BOSS_HOP_V and reels BOSS_DIZZY after each stomp. It never hurts her: touching it pushes her back at BOSS_PUSH. */
export const BOSS_HP = 3
export const BOSS_BOX = [
  [1.3, 1.2],
  [1.8, 1.7],
  [2.4, 2.2],
] as const
export const BOSS_SPEED = [1.4, 1.2, 1] as const
export const BOSS_HOP_EVERY = 1.6
export const BOSS_HOP_V = 9
export const BOSS_DIZZY = 2
export const BOSS_PUSH = 6
export const BUNNY_SPEED = 4

/** Power-ups rise out of their box over RISE_FOR. The cupcake then slides away from her at CUPCAKE_SPEED; the ball bounces along at BALL_SPEED, BALL_BOUNCE high. Both turn at walls and at pit edges, so neither is ever lost. The wand stays put. */
export const ITEM_BOX = [0.7, 0.7] as const
export const RISE_FOR = 0.5
export const CUPCAKE_SPEED = 2.2
export const BALL_SPEED = 3
export const BALL_BOUNCE = 11
/** A many-stars box gives a star per bump, this many in all. */
export const STARS_BOX_HITS = 8
/** A block knocked from below hops this long. */
export const BUMP_FOR = 0.15

/** Bubbles: at most BUBBLES_MAX out, one more every BUBBLE_EVERY while the button is held. Each is BUBBLE_R in radius, rolls at BUBBLE_SPEED, bounces BUBBLE_BOUNCE under BUBBLE_G, and pops at a wall or after BUBBLE_FOR. */
export const BUBBLES_MAX = 3
export const BUBBLE_EVERY = 0.4
export const BUBBLE_R = 0.45
export const BUBBLE_SPEED = 6
export const BUBBLE_BOUNCE = 7
export const BUBBLE_G = 50
export const BUBBLE_FOR = 2.5

/** The ribbon pole: this tall above its foot, worth 1 star at the foot up to POLE_STARS at the bow; she slides down at POLE_SLIDE, walks to the bed at WALK_HOME, and the hug lasts FOUND_FOR. */
export const POLE_HEIGHT = 9
export const POLE_STARS = 5
export const POLE_SLIDE = 7
export const WALK_HOME = 3
export const FOUND_FOR = 3

/** A ferry lift moves at FERRY_SPEED and goes home FERRY_WAIT after she steps off at the far end. */
export const FERRY_SPEED = 2.5
export const FERRY_WAIT = 1
