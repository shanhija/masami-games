/**
 * Silly Billy's world as plain data: the room, the actors, the items, the puffs. Everything
 * here is numbers, strings and plain objects, so a world can be cloned (structuredClone),
 * saved, sent to the validation worker and stepped by vitest for minutes. The running
 * actions (generators) live beside the world in the Sim, never in it.
 *
 * Space: metres, y up, the ground at y = 0 (the pool's water is lower). A room spans
 * x and z from -ROOM_HALF to ROOM_HALF. A yaw of 0 faces +z and a yaw of PI/2 faces +x,
 * so forward is (sin yaw, cos yaw). An actor facing +z has its left hand on the +x side.
 */

import type { CastNames, Lang } from './lang'

export type Vec3 = [number, number, number]

export type RoomId = 'playground' | 'pool' | 'forest'
export const ROOMS: readonly RoomId[] = ['playground', 'pool', 'forest']
/** Half the width of every room: x and z run from -ROOM_HALF to ROOM_HALF. */
export const ROOM_HALF = 12
/** One sim step: generated code's `yield` waits exactly this long. */
export const STEP = 1 / 60

export type Hand = 'left' | 'right'
export const HANDS: readonly Hand[] = ['left', 'right']
/** Where a worn thing goes. A 'hand' thing is held in the right hand. */
export type Slot = 'hair' | 'head' | 'face' | 'body' | 'back' | 'hand'
export const SLOTS: readonly Slot[] = ['hair', 'head', 'face', 'body', 'back', 'hand']
export type Mood = 'happy' | 'sad' | 'surprised' | 'silly' | 'angry' | 'sleepy' | 'love' | 'scared'
export const MOODS: readonly Mood[] = ['happy', 'sad', 'surprised', 'silly', 'angry', 'sleepy', 'love', 'scared']
export type BodyKind = 'kid' | 'grownup' | 'cat' | 'dog'
export const BODY_KINDS: readonly BodyKind[] = ['kid', 'grownup', 'cat', 'dog']
export type Pronoun = 'she' | 'he' | 'they' | 'it'

/** A little built-in reaction an actor plays for a second or two, before its own steps: a shrug, a cheer, a puzzled tilt, a wave, a think, getting better after being sick (a lie-down and a happy hop). */
export type Reaction = 'shrug' | 'yay' | 'huh' | 'hello' | 'think' | 'better'

/**
 * A state a body is in for a while, shown by it and read by code, the brain and the
 * interpreter: sick (green, wobbly and slow; when it runs out the actor lies down a moment and
 * gets better), dizzy (stars round the head, wobbling), wet (drips), cold (shivers), sleepy
 * (a nodding head, slower), hot (red, sweating), glowing (lights up, and lights what is near).
 */
export type Effect = 'sick' | 'dizzy' | 'wet' | 'cold' | 'sleepy' | 'hot' | 'glowing'
export const EFFECTS: readonly Effect[] = ['sick', 'dizzy', 'wet', 'cold', 'sleepy', 'hot', 'glowing']

/** Whether a thing is food, and what kind: eating decides by this (nobody gets hurt: poison makes one sick for a while). */
export type Food = 'yummy' | 'yucky' | 'poison'
export const FOODS: readonly Food[] = ['yummy', 'yucky', 'poison']
export type Temp = 'hot' | 'cold'
export const TEMPS: readonly Temp[] = ['hot', 'cold']

/** Particles. Each kind has its own little shape in the scene. */
export type PuffKind = 'dust' | 'spark' | 'heart' | 'star' | 'drop' | 'note' | 'bubble' | 'leaf' | 'snow' | 'confetti' | 'smoke' | 'fire'
export const PUFF_KINDS: readonly PuffKind[] = ['dust', 'spark', 'heart', 'star', 'drop', 'note', 'bubble', 'leaf', 'snow', 'confetti', 'smoke', 'fire']

/** Every sound the game can make; anything else asked for plays 'pop'. */
export type SoundName =
  | 'boing' | 'pop' | 'whoosh' | 'splash' | 'ding' | 'bonk' | 'giggle' | 'meow' | 'woof' | 'magic'
  | 'crash' | 'yay' | 'step' | 'swim' | 'squeak' | 'drum' | 'bell' | 'snore' | 'munch' | 'zap'
export const SOUND_NAMES: readonly SoundName[] = [
  'boing', 'pop', 'whoosh', 'splash', 'ding', 'bonk', 'giggle', 'meow', 'woof', 'magic',
  'crash', 'yay', 'step', 'swim', 'squeak', 'drum', 'bell', 'snore', 'munch', 'zap',
]

/** One arm or leg, radians. swing: forward (+) or back (-) from hanging down (PI is straight up); raise: out to the side; bend: the elbow or knee. */
export interface Limb {
  swing: number
  raise: number
  bend: number
}

/**
 * The joints. They stay as set until something changes them; `rest` eases them back.
 * lean tips the upper body forward (+), tilt sideways (+ toward its left), twist turns it
 * (+ toward its left); bob lifts the whole body (metres); squash 1 is normal, 0.7
 * squashed, 1.3 stretched. For animals armL/armR are the front legs and legL/legR the back.
 */
export interface Pose {
  lean: number
  tilt: number
  twist: number
  bob: number
  squash: number
  tail: number
  head: { nod: number; turn: number; tilt: number }
  armL: Limb
  armR: Limb
  legL: Limb
  legR: Limb
}

export function restPose(): Pose {
  return {
    lean: 0,
    tilt: 0,
    twist: 0,
    bob: 0,
    squash: 1,
    tail: 0,
    head: { nod: 0, turn: 0, tilt: 0 },
    armL: { swing: 0, raise: 0, bend: 0 },
    armR: { swing: 0, raise: 0, bend: 0 },
    legL: { swing: 0, raise: 0, bend: 0 },
    legR: { swing: 0, raise: 0, bend: 0 },
  }
}

/** A worn thing: a library item kind, painted one colour or in its own colours. Worn things are part of the look, not items in the room: taking one off makes it an item again. */
export interface Worn {
  kind: string
  tint: string | null
}

/** How an avatar looks. Hair, hats, glasses, gowns, capes and wands are library items in `worn`. */
export interface Look {
  body: BodyKind
  /** Metres to the top of the head (ears for animals): a kid about 1.15, a grown-up 1.6, a cat 0.5. */
  height: number
  /** Body width: 0.8 thin, 1 normal, 1.3 round. */
  build: number
  /** Skin, or fur for animals. */
  skin: string
  eyes: string
  top: string
  bottom: string
  shoes: string
  /** A skirt instead of trousers (`bottom` is its colour). */
  skirt: boolean
  worn: Partial<Record<Slot, Worn>>
}

/** A speech bubble: a few simple words in the game's language (picked when said), shown until `until`. */
export interface Bubble {
  text: string
  until: number
}

/** "Thinking this through": a new action being invented for this actor. progress 0..1 is the designer's reply so far. */
export interface Thinking {
  about: string
  since: number
  progress: number
}

/**
 * A step waiting in an actor's queue or running: an action id and its arguments, still as
 * words. Each value is read by the action's param kind when the step starts:
 * an actor id ('steve'), an item instance ('#i12'), an item kind ('ball'), a place
 * ('x,z' in metres, or a thing as above), text, or a number as text.
 */
export interface Step {
  action: string
  args: Record<string, string>
  /** Which command it came from, to tell the HUD and the brain what finished. */
  serial: number
}

/** What an actor is doing now: the step that started and when. */
export interface Doing extends Step {
  since: number
}

export interface Actor {
  /** Stable lowercase id: 'alice'. A starting avatar keeps its id in both languages. */
  id: string
  /** Shown and spoken, in the game's language for a starting avatar: 'Aino' in Finnish, 'Alice' in English. */
  name: string
  /** What a recognizer may write for the name, lowercase: ['aino', 'ainoo', 'aina']. */
  calls: string[]
  /** A starting avatar's name in each language, which `name` and `calls` follow when the language changes; null once the child names it, and for an avatar the child made. */
  names: CastNames | null
  pronoun: Pronoun
  look: Look
  /** Feet position. y is the feet's height: the ground is 0, the pool's floor is lower, and in water deeper than about half its height it swims at the surface. */
  x: number
  y: number
  z: number
  /** Facing: 0 looks toward +z. */
  yaw: number
  /** Tip the whole body: pitch forward (+) or back, roll sideways. Lying on the back is pitch -PI/2. */
  pitch: number
  roll: number
  scale: number
  pose: Pose
  /** Item instance ids. A 'hug' item fills both hands. */
  hands: Record<Hand, string | null>
  /** The item instance it rides or sits on. */
  riding: string | null
  /** The thing whose top it got up onto (climbOnto) and stands on while its feet are over that top: jumps and flips there land on it again (absent is none). */
  on?: string | null
  mood: Mood
  moodUntil: number
  bubble: Bubble | null
  thinking: Thinking | null
  /** Waiting for the interpreter to make sense of words spoken to it. */
  listening: boolean
  doing: Doing | null
  queue: Step[]
  /** Another actor's action is moving this one: its own doing waits (w.join ended it), and a command of its own takes it out. */
  joinedBy: string | null
  /** The little reaction it is playing now, or null (absent is null): the camera moves in on it like on a doer. */
  reacting?: Reaction | null
  /** The named parts of the things it wears, as their processes and code pose them: the scene poses each worn model with its slot's. */
  wornParts?: Partial<Record<Slot, Record<string, PartPose>>>
  /** Walking speed, m/s. */
  speed: number
  /** The walk cycle's phase, radians, advanced by the movement helpers. */
  stride: number
  /** What pitch and roll turn the body round, as a share of its height: 0 the feet (absent is 0: lying down, falling over), 0.5 its middle (cartwheels, somersaults, flips). */
  pivot?: number
  /** The states it is in and the world time each runs out (absent is none). */
  effects?: Partial<Record<Effect, number>>
  /** What its states add on top of its pose this frame (sick and dizzy wobble, cold shivers, sleepy nods), set by the sim; absent is none. */
  sway?: Sway | null
}

/** Radians added on top of the pose: the upper body's tilt and twist, the head's nod and turn. */
export interface Sway {
  tilt: number
  twist: number
  nod: number
  turn: number
}

/**
 * Offsets for a named part of an item's model, on top of the part's own pivot and rotation, and
 * how it is drawn on this one thing. The last three are absent until code sets them (and in
 * rooms saved before them): absent is as built.
 */
export interface PartPose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
  /** One colour for all of the part, or null for its own colours. */
  color?: string | null
  /** False hides the part. */
  show?: boolean
  /** True: its glowing shapes shine (a part without any glows all over); false: they are switched off; null: as the thing says. */
  glow?: boolean | null
}

export function restPart(): PartPose {
  return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, color: null, show: true, glow: null }
}

export interface Item {
  /** Instance id, '#' + a number: '#i12'. */
  id: string
  /** The library item kind: 'ball', 'christmas-tree'. */
  kind: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  scale: number
  /** Velocity and spin while loose (m/s, rad/s). */
  vx: number
  vy: number
  vz: number
  spin: number
  /** Under physics: falls, bounces, rolls and floats until it settles. */
  loose: boolean
  holder: { actor: string; hand: Hand } | null
  /** The actor riding or sitting on it. */
  rider: string | null
  parts: Record<string, PartPose>
  /** Numbers an action or the item's own process keeps with it. */
  state: Record<string, number>
  tint: string | null
  /** World time it appeared: it pops in. */
  born: number
  /** Built into the room (the slide, the pool ladder): physics never moves it, actions still may. */
  fixed: boolean
  /**
   * The fields below are absent until something sets them, and in rooms saved before them:
   * absent is null.
   *
   * True: its glowing shapes shine (a thing without any glows all over); false: they are switched
   * off (a lamp turned off, a fire put out); null: as built.
   */
  glow?: boolean | null
  /** One colour for all its glowing shapes, or null for their own. */
  glowColor?: string | null
  /** The colour of a real light it gives off round it (a torch), or null. Lamps and fires light what is near at night by themselves. */
  light?: string | null
  /** Fixed to another thing or an actor: it goes and turns with it. */
  attached?: Attachment | null
  /** Shapes code added to this one thing (a ladder on this treehouse), kept with it. */
  added?: Added | null
  /** Where it was picked up from, so it can be put back. */
  home?: Home | null
}

/** Where a thing is fixed: to an item ('#i3') or an actor ('alice'), at one of its anchors or parts (or its own frame), and its place and turn there. */
export interface Attachment {
  to: string
  /** The anchor or part of `to` it is fixed at, or null for its base point. */
  at: string | null
  x: number
  y: number
  z: number
  /** Its turn in that frame, as an item's yaw, pitch and roll. */
  yaw: number
  pitch: number
  roll: number
}

/** Shapes, parts and anchors added to one thing, in its own frame, with the same kit as models. */
export interface Added {
  /** New for every addition (an id from the world's count), so the scene builds this thing's model again. */
  key: number
  shapes: Shape[]
  parts: PartDef[]
  anchors: Recipe['anchors']
}

export interface Home {
  x: number
  y: number
  z: number
  yaw: number
}

/** A number or a colour on its way somewhere: from `from` at world time `start` to `to` over `secs`. */
export interface Fade {
  from: number | string
  to: number | string
  start: number
  secs: number
}

/** The sky, the light and the weather, the same in every room. It stays as code left it. */
export interface Sky {
  /** Hours, 0 to 24: 0 midnight, 6 sunrise, 12 noon, 18 sunset. */
  time: number
  /** 0 to 1: how hard it rains, snows; how foggy and windy it is. */
  rain: number
  snow: number
  fog: number
  wind: number
  /** The sky painted one colour, or null for the time of day's. */
  color: string | null
  /** The sunlight's colour, or null for the time of day's. */
  light: string | null
  fades: Partial<Record<SkyKey, Fade>>
}
export type SkyKey = 'time' | 'rain' | 'snow' | 'fog' | 'wind' | 'color' | 'light'

/** A room's ground and water, kept by each room. */
export interface Terrain {
  /** How full its water is: 0 dry, 1 full (the pool's surface at WATER_Y). */
  water: number
  /** The water's colour, or null for the room's own. */
  waterColor: string | null
  /** A colour washed over the ground ('white' for snow), or null for its own. */
  ground: string | null
  fades: Partial<Record<TerrainKey, Fade>>
}
export type TerrainKey = 'water' | 'waterColor' | 'ground'

export interface Puff {
  kind: PuffKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  color: string
  size: number
  born: number
  life: number
  /** Downward pull, m/s²: 0 floats, 9.8 falls. Negative rises. */
  gravity: number
}

/** A line to speak aloud by an actor's voice, in the game's language (or the child's own words). */
export interface Speech {
  actor: string
  text: string
}

/** What the brain and the HUD hear about from the sim. */
export type WorldEvent =
  | { type: 'started'; actor: string; step: Step }
  | { type: 'done'; actor: string; step: Step }
  | { type: 'failed'; actor: string; step: Step; error: string }
  | { type: 'hit'; item: string; actor: string }

export interface World {
  /** Seconds since the world began. */
  t: number
  /** The language the game is played in: bubbles and lines show in it, and things and starting avatars are called by it. */
  lang: Lang
  frame: number
  room: RoomId
  actors: Actor[]
  /** The current room's items. */
  items: Item[]
  /** The other rooms' items while we are not there. */
  away: Record<RoomId, Item[]>
  puffs: Puff[]
  /** Drained by the game every frame. */
  sounds: SoundName[]
  speech: Speech[]
  events: WorldEvent[]
  nextId: number
  /** mulberry32 state. */
  rng: number
  /** The actor the camera leans toward, or null. */
  spotlight: string | null
  /** The sky and the light, and each room's ground and water; absent (a world from before them) is the default, made when the sim takes the world in. */
  sky?: Sky
  terrain?: Record<RoomId, Terrain>
}

// ------------------------------------------------------------------------------ the items' models

export type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'torus' | 'capsule' | 'lathe' | 'extrude' | 'tube'

/**
 * One solid of an item's model, in its part's frame (the item's own frame when part is null).
 * dims by kind: box [w, h, d]; sphere [r]; cylinder [rTop, rBottom, h]; torus [r, tube];
 * capsule [r, length]; lathe []; extrude [depth]; tube [r]. points: lathe [[r, y]...],
 * extrude [[x, y]...], tube [[x, y, z]...].
 */
export interface Shape {
  kind: ShapeKind
  dims: number[]
  points: number[][] | null
  at: Vec3
  /** Euler angles, radians, three.js order 'XYZ'. */
  rot: Vec3
  scale: Vec3
  /** '#rrggbb'. */
  color: string
  /** Lit by itself, not by the sun: lamps, fire, magic. */
  glow: boolean
  part: string | null
}

/** A named piece of a model that moves together: its pivot `at` and rest rotation, in its parent's frame. */
export interface PartDef {
  name: string
  at: Vec3
  rot: Vec3
  parent: string | null
  /**
   * The name its pose goes by (an item's `parts` key, `item.part(name)`) when that is not its
   * own: a builder that makes a part again under the same name ('light0' for every other
   * bauble) gets a copy at its own pivot, named 'light0~2', posed as 'light0'.
   */
  pose?: string
}

/** What a thing is for beyond how it is handled: whether it is food, hot or cold, soft. */
export interface ItemTraits {
  food: Food | null
  temp: Temp | null
  soft: boolean
}

export interface ItemMeta {
  /** 'hand': one hand; 'hug': both arms; 'no': too big to carry. */
  carry: 'hand' | 'hug' | 'no'
  /** Can be ridden: an actor sits on its 'seat' anchor and goes where it goes. */
  ride: boolean
  /** Can be sat on. */
  sit: boolean
  /** Where it goes when worn, or null. */
  wear: Slot | null
  /** 0 a lump, 1 a super ball. */
  bouncy: number
  /** Blocks walking. */
  solid: boolean
}

/** A built model: what the scene draws and the sim measures. */
export interface Recipe {
  shapes: Shape[]
  parts: PartDef[]
  anchors: Record<string, { at: Vec3; part: string | null }>
  meta: ItemMeta
  traits: ItemTraits
  bounds: { min: Vec3; max: Vec3 }
}

/** What the sim knows about an item kind, from its recipe and its library entry. */
export interface ItemInfo {
  kind: string
  name: string
  /** The name in Finnish, nominative: 'joulukuusi'. */
  nameFi: string
  recipe: Recipe
  /** [w, h, d] of the bounds. */
  size: Vec3
  /** Footprint radius on the ground. */
  radius: number
  /** Still Haiku's quick draft: the final model is on its way. */
  rough: boolean
}
