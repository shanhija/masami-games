/**
 * Slime Guy as plain numbers: the shapes of a course, the live state of a run, and the
 * constants the sim and the scene must agree on. No three.js in here.
 *
 * Sim space: x across the track (+x is to the right as the camera sees it), y up, z
 * forward along the course (the slime runs toward +z). The scene draws a sim point
 * (x, y, z) at three's (x, y, -z), so the default camera looking down three's -Z sees the
 * course run away from it with +x on the right. One unit is the width of the slime at the
 * start (radius R0). Every time is in sim seconds, which run slow while the game teaches.
 */

import type { ItemId } from './closet'

/** The five islands, in the order they open; their names are in words.ts. */
export type CourseId = 'park' | 'beach' | 'candy' | 'winter' | 'night'
export const COURSE_IDS: readonly CourseId[] = ['park', 'beach', 'candy', 'winter', 'night']

// ------------------------------------------------------------------ the slime

/** The slime's radius at the start; it grows to R0 * MAX_SIZE with every ball of the course. */
export const R0 = 0.5
export const MAX_SIZE = 3
/** Hidden (arms in, flat as a puddle) the slime is this tall whatever its size, so it fits under every paddle and gate. */
export const HIDDEN_TOP = 0.4
/** A tap on hide keeps the arms in this long; holding keeps them in for as long as it is held. */
export const HIDE_FOR = 1

/** The animals on the measuring pole, smallest first, and the size at which the slime counts as each. */
export const ANIMALS = ['mouse', 'cat', 'dog', 'pony', 'elephant'] as const
export type Animal = (typeof ANIMALS)[number]
export const ANIMAL_FROM: readonly number[] = [1, 1.4, 1.8, 2.2, 2.6]
/** The index into ANIMALS of the biggest animal the slime is at least as big as. */
export function animalFor(size: number) {
  let i = 0
  while (i + 1 < ANIMALS.length && size >= ANIMAL_FROM[i + 1]!) i++
  return i
}

// ------------------------------------------------------------------ the course

/** The main track is this wide either side of x = 0. Ground at x = 0 runs unbroken from the start to the finish, except for holes. */
export const TRACK_HALF = 3

/** A slab of track whose top is y = 0. Water is everywhere there is no slab. */
export interface Ground {
  x0: number
  x1: number
  z0: number
  z1: number
}
/** The water's surface lies this far under the track's top: a slime whose bottom goes below it splashes in. */
export const WATER_Y = -0.5

/** A round hole in the track with water under it. */
export interface HoleSpec {
  x: number
  z: number
  r: number
}

/**
 * A spinner: a post standing in the water beside the track, a hub on top of it at HUB_Y,
 * and one or two arms that turn level around it. From each arm hangs a soft foam paddle
 * reaching from PADDLE_IN to `reach` out from the post, from PADDLE_BOTTOM up to
 * PADDLE_TOP: too tall to jump, too wide to steer round, and only a hidden slime fits
 * under it.
 */
export interface SpinnerSpec {
  x: number
  z: number
  reach: number
  arms: 1 | 2
  /** Seconds per turn. */
  period: number
  /** Where arm 0 starts, as a share of a turn from +x toward +z. */
  phase: number
  /** +1 turns from +x toward +z, -1 the other way. */
  dir: 1 | -1
}
export const HUB_Y = 3.6
export const PADDLE_IN = 1.2
export const PADDLE_BOTTOM = 0.55
export const PADDLE_TOP = 2.8
export const PADDLE_THICK = 0.4

/**
 * A fan: a big round fan in a cage standing on the track at (x, z), facing the slime
 * (toward -z). It blows over x within `width` / 2 of its centre, from its cage back to
 * `reach` before it. It turns slowly for FAN_SOFT, speeds up over FAN_UP, blows hard for
 * FAN_HARD and slows over FAN_DOWN, round and round from `phase` seconds into that cycle.
 */
export interface FanSpec {
  x: number
  z: number
  width: number
  reach: number
  phase: number
}
/** The cage is a soft round bumper this wide around the fan's centre. */
export const FAN_R = 1.1
export const FAN_SOFT = 2.6
export const FAN_UP = 0.9
export const FAN_HARD = 2.2
export const FAN_DOWN = 0.6

/** A climbing frame across the track from x0 to x1, centred on z, FRAME_DEPTH deep and FRAME_H tall. Jump it, or the sticky slime climbs over slowly. */
export interface FrameSpec {
  z: number
  x0: number
  x1: number
}
export const FRAME_H = 0.75
export const FRAME_DEPTH = 0.6

/** A marshmallow cushion on the track (Candy Land): landing or running onto it throws the slime high. */
export interface PadSpec {
  x: number
  z: number
}
export const PAD_R = 1
export const PAD_H = 0.35

/** An ice slide on the track (Snow Land): the slime runs faster while on it. */
export interface SlideSpec {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** A low snow gate across the track (Snow Land): an arch whose underside is GATE_GAP above the track, so only a hidden slime gets under. */
export interface GateSpec {
  z: number
  x0: number
  x1: number
}
export const GATE_GAP = 0.5
export const GATE_H = 2.4
export const GATE_DEPTH = 0.8

/** A checkpoint flag on the track at z: water brings the slime back to the last one passed. */
export interface FlagSpec {
  z: number
}

/** A slime ball floating with its centre at (x, y, z). */
export interface BallSpec {
  x: number
  y: number
  z: number
}
export const BALL_R = 0.28

/** A lost baby slime waiting with its bottom at (x, y, z). */
export interface BabySpec {
  x: number
  y: number
  z: number
}

/** A circle in the tower: its number, and its centre across the shaft and up from the tower floor. */
export type CircleNumber = 1 | 5 | 100
export interface CircleSpec {
  n: CircleNumber
  x: number
  y: number
}

export interface Course {
  id: CourseId
  ground: readonly Ground[]
  holes: readonly HoleSpec[]
  spinners: readonly SpinnerSpec[]
  fans: readonly FanSpec[]
  frames: readonly FrameSpec[]
  pads: readonly PadSpec[]
  slides: readonly SlideSpec[]
  gates: readonly GateSpec[]
  flags: readonly FlagSpec[]
  balls: readonly BallSpec[]
  babies: readonly [BabySpec, BabySpec, BabySpec]
  /** The finish arch stands across the track at this z, with the key floating under it. */
  finishZ: number
  /** The tower's circles, bottom to top; the giant circle sits GIANT_GAP above the last one. */
  circles: readonly CircleSpec[]
}

// ------------------------------------------------------------------ after the finish

/** The measuring pole stands this far past the arch, at x = POLE_X. */
export const POLE_DZ = 4
export const POLE_X = 2.4
/** The trampoline at the foot of the tower is this far past the arch, at x = 0; the tower stands over it. */
export const TRAMPOLINE_DZ = 12
export const TRAMPOLINE_R = 1.6
/** The tower's shaft: the slime rises in the plane z = the tower's z, between x = -TOWER_HALF and +TOWER_HALF. */
export const TOWER_HALF = 6
/** The giant circle sits this far above the last circle; its hole has a radius of GIANT_HOLE, so the biggest slime fits through; the top platform is TOP_DY above it. */
export const GIANT_GAP = 5
export const GIANT_HOLE = 2
export const TOP_DY = 2.5
/** The box on the top platform stands at this x, beside where the slime comes up. */
export const BOX_X = 1.8

// ------------------------------------------------------------------ the live run

/**
 * ready: standing at the start until Go. run: the course. splash: fell in; the friendly
 * fish spits the slime back to the last flag. finish: through the arch with the key, a
 * stop at the measuring pole, then on to the trampoline. tower: rising between the
 * circles. fall: hit a circle, dropping back to the trampoline. top: out on the top, the
 * key opens the box. done: the gift is on; waiting for Again or the map.
 */
export type Phase = 'ready' | 'run' | 'splash' | 'finish' | 'tower' | 'fall' | 'top' | 'done'

export interface Slime {
  /** The bottom centre of the body: y = 0 standing on the track. In the tower, x is across the shaft, y the height above the tower floor and z the tower's z. */
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Balls carried. The size follows: 1 with none, MAX_SIZE with every ball of the course. */
  balls: number
  size: number
  /** The body's radius now: R0 * size. Standing, the slime is 2r tall and 2r wide. */
  r: number
  grounded: boolean
  hidden: boolean
  /** When it last went flat, and when it last came back up, or -1. */
  hiddenAt: number
  shownAt: number
  jumpedAt: number
  landedAt: number
  /** When a big slime did its extra bounce after landing, or -1. */
  bounceAt: number
  /** When a paddle last hit it (dizzy eyes, balls knocked off), or -1. */
  hitAt: number
  /** Paddles pass through it until then, so one sweep hits once and a slime that does nothing still gets by. */
  ghostUntil: number
  /** When a soft thing (a gate, a fan's cage) last bumped it back, or -1. */
  bumpAt: number
  /** Stuck to a frame and climbing over it since then, or -1. */
  climbAt: number
  /** When hard wind last pushed it, or -1; `spin` is how far round the wind has turned it, radians, eased back to 0. */
  windAt: number
  spin: number
  sneezeAt: number
  burpAt: number
  /** When and where it fell in the water, or -1. */
  splashAt: number
  splashX: number
  splashZ: number
  /** A little fish rides on its head until then (after the big fish spat it out). */
  fishUntil: number
  /** 0 safely on the track to 1 with its centre at the very edge: the scene wobbles it and widens its eyes. */
  edge: number
  /** Over an ice slide now (in the air too), where it runs faster. */
  sliding: boolean
}
/** After a splash, from splashAt: the big fish comes up at FISH_AT and spits the slime out at SPIT_AT. Back on the track, the little fish rides on its head for FISH_RIDE (until fishUntil). */
export const FISH_AT = 0.6
export const SPIT_AT = 1
export const FISH_RIDE = 3

export interface Ball {
  id: number
  x: number
  y: number
  z: number
  /** When the slime took it, or -1 while it floats. A taken ball flies into the slime. */
  takenAt: number
  /** -1 for a ball of the course; for one knocked off by a paddle, when it flew off from (fromX, fromY, fromZ) to land at (x, y, z) DROP_FOR later. */
  droppedAt: number
  fromX: number
  fromY: number
  fromZ: number
}
/** A knocked-off ball flies this long before it lands and can be taken again. */
export const DROP_FOR = 0.6

export interface Baby {
  index: 0 | 1 | 2
  x: number
  y: number
  z: number
  /** When the slime took it onto its head, or -1 while it waits. One found on an earlier run rides from the start (`home`, taken at 0). */
  takenAt: number
  home: boolean
}

export interface Spinner {
  spec: SpinnerSpec
  /** Arm 0 points from the post toward (cos angle, sin angle) in the x-z plane; a second arm is opposite. */
  angle: number
  hits: number
  /** Slowed to half speed after EASY_AFTER hits. */
  easy: boolean
}

export interface Fan {
  spec: FanSpec
  /** 0 still to 1 blowing hard; the blades turn and the wind pushes by it. */
  power: number
  /** How many times hard wind has caught the slime. */
  pushes: number
  /** Blows at under half strength after EASY_AFTER pushes. */
  easy: boolean
}

export interface Hole {
  spec: HoleSpec
  falls: number
  /** When a lily pad floated into the hole after EASY_AFTER falls, or -1. With the pad in, the hole holds the slime like track. */
  raftAt: number
}

/** Soft foam rails along both edges of the track from z0 to z1, raised at `at` once the slime has fallen off the sides EASY_AFTER times in that stretch. */
export interface Rail {
  z0: number
  z1: number
  at: number
}

export interface Gate {
  spec: GateSpec
  bumps: number
  /** When the gate lifted out of the way after EASY_AFTER bumps, or -1. */
  liftAt: number
}

export interface Pad {
  spec: PadSpec
  /** When it last threw the slime, or -1. */
  boingAt: number
}

export interface Flag {
  spec: FlagSpec
  /** When the slime passed it, or -1. */
  reachedAt: number
}

export interface Circle {
  n: CircleNumber
  /** Where its spec puts it; 1 stays there, 5 slides side to side about it, 100 goes round a small ring about it. */
  baseX: number
  baseY: number
  x: number
  y: number
  r: number
  /** When the slime got past it without touching (it pops into n stars), or -1. */
  poppedAt: number
}

export interface Tower {
  /** The tower's z: the course's finishZ + TRAMPOLINE_DZ. */
  z: number
  circles: Circle[]
  /** Height above the tower floor of the giant circle and of the top platform. */
  giantY: number
  topY: number
  hits: number
  /** The circles move at half speed and shrink after EASY_AFTER hits. */
  easy: boolean
  /** When the trampoline last launched the slime, when it last hit a circle, when it reached the giant circle; -1 before. */
  launchAt: number
  bonkAt: number
  funnelAt: number
}

export interface Finish {
  /** When the key was taken under the arch, or -1. */
  keyAt: number
  /** When the slime stood by the measuring pole, and the animal it measured (index into ANIMALS), or -1. */
  measureAt: number
  animal: number
  /** When it landed on the top, the key turned in the lock, the lid popped, and the gift went on; -1 before. */
  topAt: number
  unlockAt: number
  openAt: number
  giftAt: number
}
/** The slime stands at the pole for MEASURE_FOR from measureAt. On the top, from topAt: the key turns at UNLOCK_AT, the lid pops at OPEN_AT, the gift flies out at GIFT_AT. */
export const MEASURE_FOR = 2.2
export const UNLOCK_AT = 0.8
export const OPEN_AT = 1.6
export const GIFT_AT = 2.4

/** What each obstacle teaches the first time it comes, and the button that answers it; 'circle' is the tower's circles. */
export type Teachable = 'spinner' | 'fan' | 'frame' | 'hole' | 'gate' | 'circle'
export type Action = 'jump' | 'hide' | 'left' | 'right'
export interface Teach {
  kind: Teachable
  action: Action
  at: number
}
/** Time runs this fast while the game teaches. */
export const TEACH_SCALE = 0.15
/** A spinner, fan, hole, gate or the tower gets easier after this many misses. */
export const EASY_AFTER = 3

export interface Sim {
  course: Course
  time: number
  phase: Phase
  phaseAt: number
  slime: Slime
  balls: Ball[]
  babies: Baby[]
  spinners: Spinner[]
  fans: Fan[]
  holes: Hole[]
  gates: Gate[]
  pads: Pad[]
  flags: Flag[]
  /** The foam rails raised so far; none at the start. */
  rails: Rail[]
  tower: Tower
  finish: Finish
  /** The last flag passed (index into flags), or -1 for the start: water brings the slime back there. */
  checkpoint: number
  /** Stars popped out of circles on this run. */
  stars: number
  /** What the box holds, chosen from the save when the run was made; null once every item is found (the box then holds confetti). */
  gift: ItemId | null
  /** The obstacle kinds already taught; the first of any other kind slows time and pulses its button. */
  learned: Teachable[]
  teach: Teach | null
  /** 1, or eased down to TEACH_SCALE while teaching. */
  timeScale: number
  /** What the player holds: the steering, the hide button, and when jump was last pressed (a press counts a moment early). */
  input: { steer: -1 | 0 | 1; hide: boolean; jumpAt: number }
  nextId: number
  /** What happened since the game last read them, in order; the game empties the list every frame. */
  events: SimEvent[]
  /** What is under way, for the sim and its bot; the scene never reads it. */
  doing: Doing
}

/** The bookkeeping of the sim and its bot between steps: scripted moves, timers, and what the wind and the lessons remember. */
export interface Doing {
  /** Running and steering are taken from the slime until then: a paddle knocked it back or a gate bumped it. */
  knockUntil: number
  /** A tap on hide keeps the arms in until then. */
  hideUntil: number
  /** The frame being climbed (index into the course's frames), where the climb started and the z where it ends; -1 when not climbing. */
  climbFrame: number
  climbFromZ: number
  climbFromY: number
  climbToZ: number
  /** A jump from a climb hops over this frame, which does not hold the slime again until it lands; or -1. */
  hopFrame: number
  /** This flight is the big slime's extra bounce, so its landing does not bounce again. */
  bouncing: boolean
  /** A jump pressed during a lesson a moment early, done as soon as it clears what is taught. */
  heldJump: boolean
  /** When a fan's cage last sounded a bump (at most once a second), and when the wind last sounded a spin. */
  bumpSoundAt: number
  spunAt: number
  /** Per fan: the gust that last caught the slime (a gust counts once), whether the slime is in its hard wind now, and the cycle whose speeding up was last announced. */
  fanGust: number[]
  fanIn: boolean[]
  fanUp: number[]
  /** The obstacle the lesson in `teach` is about: an index into the course's list of that kind. */
  teachIndex: number
  /** A scripted flight (the fish's spit, the hop onto the trampoline, the drop back down the tower): from, to, when it started, how long it takes and how high it arcs. */
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  moveAt: number
  moveFor: number
  moveArc: number
  /** After the arch: walking to the pole, standing at it, running on to the trampoline, hopping onto it. */
  finishStep: 'pole' | 'measure' | 'trampoline' | 'hop'
  /** The circles' own clock: sim seconds, running at half rate once the tower is easy. */
  towerClock: number
  /** Out of the giant circle's hole and popping up onto the top platform. */
  emerging: boolean
}

export type SimEvent =
  | { kind: 'go' }
  | { kind: 'jump'; big: boolean }
  | { kind: 'land'; big: boolean }
  | { kind: 'bounce' }
  | { kind: 'hide' }
  | { kind: 'show' }
  | { kind: 'ball'; balls: number }
  | { kind: 'burp' }
  | { kind: 'baby'; index: 0 | 1 | 2 }
  | { kind: 'hit'; dropped: number }
  | { kind: 'bump' }
  | { kind: 'climb' }
  | { kind: 'over' }
  | { kind: 'windUp'; fan: number }
  | { kind: 'spun' }
  | { kind: 'sneeze' }
  | { kind: 'pad' }
  | { kind: 'slide' }
  | { kind: 'splash' }
  | { kind: 'fish' }
  | { kind: 'back' }
  | { kind: 'flag'; index: number }
  | { kind: 'easy'; what: Teachable | 'tower' | 'edge' }
  | { kind: 'key' }
  | { kind: 'measure'; animal: number }
  | { kind: 'trampoline' }
  | { kind: 'pop'; n: CircleNumber }
  | { kind: 'bonk' }
  | { kind: 'funnel' }
  | { kind: 'top' }
  | { kind: 'unlock' }
  | { kind: 'open' }
  | { kind: 'gift'; item: ItemId | null }
  | { kind: 'cheer' }
  | { kind: 'done' }
  | { kind: 'teach'; action: Action }
  | { kind: 'learned'; what: Teachable }
export type EventKind = SimEvent['kind']
