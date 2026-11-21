/**
 * The contract every part of Monster Lunch shares: the units, the course's ground and the
 * things on it, the foods and the dishes, the course sim's state and events, the finale's,
 * and every tuning number a parent might want to change.
 *
 * Lengths are in tiles with y down (row 0 at the top of the course); durations are in
 * seconds. The sims step HZ times a second and stamp moments in ticks, -1 for never.
 */

export const HZ = 120
export const STEP = 1 / HZ

/** Seconds from tick stamp `at` to tick `now`; Infinity for a stamp of -1 (never). */
export const since = (at: number, now: number) => (at < 0 ? Infinity : (now - at) * STEP)

// ---------------------------------------------------------------------------------------
// Foods and dishes

export const DISHES = ['burger', 'croissant'] as const
export type Dish = (typeof DISHES)[number]

/**
 * Each dish's fillings in the kitchen's order. The first FILLINGS_AT_START of each are
 * open from the start, and every course done opens the next one of each.
 */
export const FILLINGS = {
  burger: ['patty', 'cheese', 'salad', 'tomato', 'egg', 'pickle', 'onion', 'ketchup'],
  croissant: ['chocolate', 'jam', 'banana', 'cream', 'strawberry', 'ham', 'cheese', 'blueberry'],
} as const satisfies Record<Dish, readonly string[]>
export type Filling = (typeof FILLINGS)[Dish][number]
export const FILLINGS_AT_START = 4
/** At most this many fillings go in one dish. */
export const MAX_PICKS = 3

export type Bread = 'bunBottom' | 'bunTop' | 'croissantBottom' | 'croissantTop'
export const BREAD: Record<Dish, { bottom: Bread; top: Bread }> = {
  burger: { bottom: 'bunBottom', top: 'bunTop' },
  croissant: { bottom: 'croissantBottom', top: 'croissantTop' },
}

/** What lies on the ground and rides on the plate: a filling, or a poop. */
export type Edible = Filling | 'poop'
/** Everything the food artist draws: a filling, the poop, a bread. */
export type Food = Edible | Bread

/** Every filling once, both dishes' lists merged in order (cheese is in both). */
export const ALL_FILLINGS: readonly Filling[] = [...new Set<Filling>([...FILLINGS.burger, ...FILLINGS.croissant])]
export const ALL_FOODS: readonly Food[] = [...ALL_FILLINGS, 'poop', 'bunBottom', 'bunTop', 'croissantBottom', 'croissantTop']

// ---------------------------------------------------------------------------------------
// Courses and monsters

export const COURSES = ['park', 'pond', 'garden', 'farm', 'castle'] as const
export type CourseId = (typeof COURSES)[number]

export const MONSTERS = ['munch', 'gulp', 'nibble', 'chomp', 'gobble'] as const
export type MonsterId = (typeof MONSTERS)[number]
/** Who waits for lunch at the end of each course. */
export const MONSTER_OF: Record<CourseId, MonsterId> = { park: 'munch', pond: 'gulp', garden: 'nibble', farm: 'chomp', castle: 'gobble' }

/**
 * The ground of one tile. Grass, path, flowers and bridge are walkable. Hedge, tree and
 * rock are solid (each course draws them in its own way: a park bush, a garden hedge, a
 * farm fence, a castle wall). Water is neither: she teeters at its edge and falls in if she
 * keeps going.
 */
export type Ground = 'grass' | 'path' | 'flowers' | 'bridge' | 'water' | 'hedge' | 'tree' | 'rock'
export const WALKABLE: Record<Ground, boolean> = { grass: true, path: true, flowers: true, bridge: true, water: false, hedge: false, tree: false, rock: false }
export const SOLID: Record<Ground, boolean> = { grass: false, path: false, flowers: false, bridge: false, water: false, hedge: true, tree: true, rock: true }

export const HUES = ['pink', 'green', 'blue'] as const
export type Hue = (typeof HUES)[number]

/** A point on the course; a thing's spot is its tile's centre (column + 0.5, row + 0.5). */
export interface Spot {
  x: number
  y: number
}

/** A bar turning round a post. */
export interface Spinner {
  /** The post's centre. */
  x: number
  y: number
  /** How far each arm reaches from the post's centre. */
  reach: number
  /** One arm, or two opposite ones (a bar through the post). */
  arms: 1 | 2
  /** Turns a second; positive turns clockwise on screen (from +x toward +y). */
  speed: number
  /** Where the first arm points at tick 0, in turns from +x, clockwise on screen. */
  phase: number
}

/** A bar on two little wheels gliding to and fro along a groove in the ground. */
export interface Slider {
  /** The bar's middle glides from a to b and back. */
  ax: number
  ay: number
  bx: number
  by: number
  /** Half the bar's length. */
  half: number
  /** The bar's direction in turns from +x: 0 lies along a row, 0.25 along a column. */
  angle: number
  /** Seconds for a to b and back to a. */
  period: number
  /** Where in its trip it is at tick 0: 0 at a, 0.5 at b. */
  phase: number
}

/** A gate: a straight run of gate tiles, all opened by any button of its hue. */
export interface Gate {
  hue: Hue
  /** Its tiles in order, column and row; one to three of them. */
  tiles: { c: number; r: number }[]
  /** 'row' if the run lies along a row (she crosses it going up or down the screen), 'col' if along a column. */
  along: 'row' | 'col'
}

export interface Button {
  hue: Hue
  x: number
  y: number
}

/** A puppy that trots along a path and back again, leaving a poop every so often. */
export interface Puppy {
  /** The tile centres it trots between, in order and back. */
  path: Spot[]
  /** Seconds between poops. */
  every: number
}

export interface Course {
  id: CourseId
  cols: number
  rows: number
  /** Row by row, cols * rows of them. */
  ground: Ground[]
  start: Spot
  /** The balloon's middle. */
  balloon: Spot
  /** Checkpoint flags, in map order (row by row); the frog brings her back to the one she reached last. */
  flags: Spot[]
  /** Where a filling lies at the start; each spot gets one of the dish's fillings in turn. */
  foods: Spot[]
  poops: Spot[]
  gates: Gate[]
  buttons: Button[]
  /** Seconds a gate of each hue stays open after its button is pressed; null keeps it open for good. */
  openFor: Record<Hue, number | null>
  spinners: Spinner[]
  sliders: Slider[]
  puppies: Puppy[]
}

/** The tile at column c, row r; water outside the course. */
export function groundAt(course: Course, c: number, r: number): Ground {
  if (c < 0 || r < 0 || c >= course.cols || r >= course.rows) return 'water'
  return course.ground[r * course.cols + c]!
}

// ---------------------------------------------------------------------------------------
// The course sim

export type Facing = 'down' | 'up' | 'left' | 'right'

/**
 * What the hero is doing. walk: free (standing still counts). teeter: at the water's edge,
 * arms going round, still able to step back. bonk: knocked by a pole, sliding back and then
 * dizzy. zap: bounced off a closed gate. swim: in the water. frog: a frog carries her back
 * to the last flag. finish: at the balloon, walking in and climbing aboard; the course is over.
 */
export type Act = 'walk' | 'teeter' | 'bonk' | 'zap' | 'swim' | 'frog' | 'finish'

export interface Hero {
  /** Feet, and the feet one step ago (the renderer draws between them). */
  x: number
  y: number
  px: number
  py: number
  /** Her own walking velocity, tiles a second (0 when still). */
  vx: number
  vy: number
  face: Facing
  act: Act
  /** The tick `act` began. */
  actAt: number
  /** Seconds she has been pushing into the water at its edge. */
  teeter: number
  /** A knock's push, tiles a second, fading. */
  kx: number
  ky: number
  /** No pole or gate knocks her before this tick. */
  safeUntil: number
  /** Tiles walked in all, for the stride. */
  walked: number
}

/** A food or a poop off the plate: lying on the ground, flying off the plate after a knock, or gone. */
export interface Item {
  kind: Edible
  /** Where it lies, or where it will land. */
  x: number
  y: number
  state: 'ground' | 'flying' | 'gone'
  /** A flight: from this ground point (under the plate), launched at tick `at`, landing at tick `lands`. */
  fx: number
  fy: number
  /** The tick it was launched or last landed; -1 for one lying there from the start. */
  at: number
  lands: number
}

export interface GateState {
  open: boolean
  /** The tick it last opened or closed; -1 never. */
  at: number
  /** The tick it will close again; -1 never. */
  until: number
}

export interface PuppyState {
  x: number
  y: number
  /** Heading for path[target]; dir is +1 going forward along the path, -1 going back. */
  target: number
  dir: 1 | -1
  face: Facing
  walked: number
  /** The tick of its next poop. */
  poopAt: number
}

/** play: on the course. finish: walking to the balloon, the bread, climbing in, lifting off. done: the course is over, the finale is next. */
export type Phase = 'play' | 'finish' | 'done'

export interface Sim {
  tick: number
  phase: Phase
  phaseAt: number
  /** The dish and its fillings, as picked in the kitchen. */
  dish: Dish
  picks: readonly Filling[]
  hero: Hero
  /** The pile on the plate, bottom first. */
  plate: Edible[]
  items: Item[]
  /** One per course gate, one per button, one per flag. */
  gates: GateState[]
  buttons: { down: boolean; at: number }[]
  flags: { at: number }[]
  /** The flag the frog brings her back to: an index into the course's flags, or -1 for the start. */
  flag: number
  puppies: PuppyState[]
  /** Where she wants to go: a direction of length at most 1. */
  input: { x: number; y: number }
  /** Foods lost to the water this visit. */
  lost: number
  /** The random generator's state (mulberry32). */
  seed: number
  /** What happened in the last step, in order; the game empties it after each step. */
  events: SimEvent[]
}

export type SimEvent =
  /** A food or poop hopped onto the plate; n is the pile after. */
  | { kind: 'pick'; food: Edible; n: number; x: number; y: number }
  /** A pole knocked her; n foods flew off. */
  | { kind: 'bonk'; n: number; x: number; y: number }
  /** A thrown food landed on the ground, to be picked up again. */
  | { kind: 'land'; food: Edible; x: number; y: number }
  /** A thrown food landed in the water: gone. */
  | { kind: 'sink'; food: Edible; x: number; y: number }
  /** She began teetering at the water's edge. */
  | { kind: 'teeter'; x: number; y: number }
  /** She fell in; n foods floated off the plate, these. */
  | { kind: 'splash'; n: number; foods: readonly Edible[]; x: number; y: number }
  /** The frog came for her. */
  | { kind: 'frog'; x: number; y: number }
  /** She is back on her feet at the flag. */
  | { kind: 'back'; x: number; y: number }
  | { kind: 'press'; hue: Hue; x: number; y: number }
  | { kind: 'open'; hue: Hue }
  /** A gate that closes again has GATE_WARN seconds left: its lamps blink fast. */
  | { kind: 'warn'; hue: Hue }
  | { kind: 'close'; hue: Hue }
  /** She touched a closed gate and bounced back; lost: the top food fell off. */
  | { kind: 'zap'; hue: Hue; lost: boolean; x: number; y: number }
  /** A closing gate pushed her out of its way. */
  | { kind: 'shove'; hue: Hue; x: number; y: number }
  | { kind: 'flag'; i: number; x: number; y: number }
  /** A puppy left a poop. */
  | { kind: 'puppy'; x: number; y: number }
  /** She reached the balloon. */
  | { kind: 'finish'; x: number; y: number }
  /** The bread closed round the pile: the dish is made. */
  | { kind: 'bread'; dish: Dish }
  /** She climbed into the basket. */
  | { kind: 'climb' }
  | { kind: 'liftoff' }

// ---------------------------------------------------------------------------------------
// The finale: the balloon over the monster's track

/** intro: the balloon floats in. drop: the dish falls a layer at a time. eat: the last layer is down, the monster dances. done: the stars. */
export type FeedPhase = 'intro' | 'drop' | 'eat' | 'done'

export interface Falling {
  kind: Food
  x: number
  y: number
  px: number
  py: number
  vy: number
  /** fall: on its way down. eaten: caught. spat: a poop the monster spat out (it flies off). missed: on the grass. */
  state: 'fall' | 'eaten' | 'spat' | 'missed'
  /** The tick it was dropped, and the tick it stopped falling (-1 while it falls). */
  at: number
  endAt: number
}

export interface Feed {
  tick: number
  phase: FeedPhase
  phaseAt: number
  course: CourseId
  dish: Dish
  /** The layers still in the basket, the next to fall first: the bottom bread, the pile from the bottom, the top bread. */
  queue: Food[]
  falling: Falling[]
  monster: {
    x: number
    px: number
    vx: number
    /** Ticks of the last catch, the last poop spat out, and the last miss; -1 never. */
    chewAt: number
    blehAt: number
    missAt: number
  }
  /** The balloon's middle, and the step before. */
  balloon: { x: number; px: number }
  nextDropAt: number
  /** Fillings eaten, breads eaten, poops spat, layers missed. */
  eaten: number
  breads: number
  spat: number
  missed: number
  /** The fillings the course had: what the stars count against. */
  total: number
  stars: number
  /** The steering: a direction from the keys, or a target x from a finger; the newest wins. */
  input: { dir: -1 | 0 | 1; to: number | null }
  events: FeedEvent[]
}

export type FeedEvent =
  | { kind: 'drop'; food: Food; x: number }
  /** A catch; n is the fillings eaten so far. */
  | { kind: 'chomp'; food: Food; n: number; x: number }
  /** The monster caught a poop and spat it out. */
  | { kind: 'bleh'; x: number }
  /** A layer fell on the grass. */
  | { kind: 'miss'; food: Food; x: number }
  /** A bird hops in for a missed layer. */
  | { kind: 'bird'; x: number }
  /** The last layer is down: the happy dance. */
  | { kind: 'full' }
  | { kind: 'burp' }
  | { kind: 'stars'; n: number }

// ---------------------------------------------------------------------------------------
// Tuning: the hero

/** Walking speed, and how fast she gets to it or stops. */
export const HERO_SPEED = 3.6
export const HERO_ACCEL = 30
/** Half the square her feet take against hedges, trees, rocks and closed gates. */
export const HERO_HALF = 0.26
/** Her radius against poles. */
export const HERO_R = 0.3
/** A food within this of her feet hops onto the plate. */
export const PICK_R = 0.55
/** Seconds of pushing into the water before she falls in: long enough for a child pointing across the water to see her windmill and let go. */
export const TEETER_FOR = 0.8
/** In the water this long, then the frog carries her back over FROG_FOR. */
export const SWIM_FOR = 1.1
export const FROG_FOR = 1.0
/** A pole's knock: the push's speed, how long the knock lasts (the slide, then the dizzy stars), and how long after it nothing knocks her. */
export const BONK_PUSH = 4.5
export const BONK_FOR = 0.7
export const SAFE_FOR = 1.6
/** A closed gate's zap: the bounce's speed and how long it lasts. */
export const ZAP_PUSH = 3.5
export const ZAP_FOR = 0.45
/** Thrown foods: flight time, how far they land (between NEAR and FAR from her), how high they arc. */
export const FLY_FOR = 0.7
export const FLY_NEAR = 1.0
export const FLY_FAR = 2.4
export const FLY_HIGH = 1.1
/** A flag counts within this of her feet, a button within BUTTON_R of its middle. */
export const FLAG_R = 0.9
export const BUTTON_R = 0.45
/** Within this of the balloon's middle the course is over. */
export const BALLOON_R = 1.6
/** The finish: her walk into the basket, the bread closing, climbing in, lifting off. */
export const FINISH_WALK = 1.0
export const BREAD_FOR = 1.4
export const CLIMB_FOR = 0.6
export const LIFT_FOR = 1.6

// Tuning: the course's things

/** A pole's bar is this thick either side of its line; a spinner's post this wide. */
export const BAR_HALF = 0.09
export const POST_R = 0.22
/** A gate that closes again blinks fast for this long first. */
export const GATE_WARN = 2.5
/** A puppy's trot, and at most this many poops of its own lie about at once. */
export const PUPPY_SPEED = 1.5
export const PUPPY_POOPS = 3

// Tuning: the finale

/** The scene: FEED_W wide and FEED_H tall, the ground's top at FEED_GROUND, the track from TRACK_L to TRACK_R. */
export const FEED_W = 16
export const FEED_H = 10.5
export const FEED_GROUND = 9.4
export const TRACK_L = 1.6
export const TRACK_R = 14.4
/** The monster's top speed and acceleration along the track. */
export const MONSTER_SPEED = 8
export const MONSTER_ACCEL = 40
/** A layer is caught as it reaches MOUTH_Y within MOUTH_HALF of the monster's middle. */
export const MOUTH_Y = 8.0
export const MOUTH_HALF = 0.85
/** Layers start falling from the slot at BASKET_Y and fall under FALL_G. */
export const BASKET_Y = 4.4
export const FALL_G = 3.2
/** The balloon floats in for INTRO_FOR; the first layer falls DROP_FIRST later; then one every DROP_START seconds, quickening to DROP_END by the last. */
export const INTRO_FOR = 2.0
export const DROP_FIRST = 0.8
export const DROP_START = 1.7
export const DROP_END = 1.15
/** The happy dance lasts EAT_FOR before the stars. */
export const EAT_FOR = 3.0
/** The share of the course's fillings the monster must eat for three stars, and for two. */
export const STARS_3 = 0.8
export const STARS_2 = 0.4
