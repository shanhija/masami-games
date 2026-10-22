/**
 * The shapes and numbers every part of Cat Hat Builder agrees on: units, ids, the save
 * (Keep), the running state (State), what the child can do (Action), what a tap lands on
 * (Hit), what a step reports (SimEvent) and the shared timings. Nothing here does any work
 * beyond unit helpers; the rules live in rules.ts and road.ts, the geometry in layout.ts.
 *
 * Units: 1 is one metre. x runs right, y runs DOWN, the ground is y = 0, so everything
 * standing is at negative y. Two worlds: the street (the garage, the yard, the plots and
 * every house and room in them, x from 0 at the garage's left wall) and the road (x from 0
 * at the road's start, its ground height from the RoadDef).
 *
 * Time: the state steps HZ times a second. Every ...At field is a tick (a whole step
 * count), -1 for never. Constants are written in seconds and turned into ticks with
 * `ticks`. Drawing reads the sim time in seconds and measures a stamp with `since`.
 *
 * The stamp rule: events feed only sounds and particles. Anything drawn over time (a hop,
 * a crane lowering a room, a machine chugging) reads a tick stamp in the state, so a frame
 * can be drawn from the state alone.
 *
 * Credit at once, show later: a pickup counts when the truck reaches it, a batch spends and
 * credits when it starts, a room is paid when it is placed. Whatever the child sees moving is
 * a Flight in `State.flights`, a picture only, so the save is always just `Keep`.
 */

import type { ItemId } from './items'

export const HZ = 60
export const STEP = 1 / HZ
export const ticks = (seconds: number) => Math.round(seconds * HZ)
/** Seconds from the tick stamp `at` to the sim time `t` (seconds); Infinity for a stamp of -1. */
export const since = (at: number, t: number) => (at < 0 ? Infinity : t - at * STEP)

// ---------------------------------------------------------------------------------------
// Goods

/** Raw goods come off the road: logs, clay lumps, rocks (from boulders), sand sacks, gems. Drawn as lumps. */
export const RAWS = ['log', 'clay', 'rock', 'sand', 'gem'] as const
export type Raw = (typeof RAWS)[number]
/** Building materials come out of the machines, one for one. Drawn as blocks. */
export const MATERIALS = ['planks', 'bricks', 'concrete', 'glass', 'rainbow'] as const
export type Material = (typeof MATERIALS)[number]
export type Good = Raw | Material
export const GOODS: readonly Good[] = [...RAWS, ...MATERIALS]
export const isRaw = (g: Good): g is Raw => (RAWS as readonly string[]).includes(g)

/** One machine per raw good, in yard order from the garage. */
export const MACHINES = ['sawmill', 'oven', 'mixer', 'glassworks', 'rainbow'] as const
export type MachineId = (typeof MACHINES)[number]
/** A machine's pad: empty, a crate waiting to be opened, or the machine. */
export type MachineStage = 'pad' | 'crate' | 'built'

// ---------------------------------------------------------------------------------------
// The builder's look

export const HAIRS = ['short', 'curly', 'long', 'ponytail', 'braids', 'puffs', 'spiky'] as const
export type Hair = (typeof HAIRS)[number]
export const HAIR_COLORS = ['black', 'darkBrown', 'brown', 'red', 'ginger', 'blond', 'pink', 'blue'] as const
export type HairColor = (typeof HAIR_COLORS)[number]
/** Eight skin tones, lightest first. */
export const SKINS = [0, 1, 2, 3, 4, 5, 6, 7] as const
export type Skin = (typeof SKINS)[number]
export const SHIRTS = ['tee', 'vest', 'stripes', 'hoodie', 'dress', 'star'] as const
type Shirt = (typeof SHIRTS)[number]
export const PANTS = ['jeans', 'dungarees', 'shorts', 'skirt', 'work'] as const
type Pants = (typeof PANTS)[number]
/** Clothes colours, for shirts and trousers. */
export const WEAR_COLORS = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'blue', 'purple', 'pink', 'white'] as const
export type WearColor = (typeof WEAR_COLORS)[number]
/** Shoes have no colour row: each kind has its own colours. lights: light-up sneakers. */
export const SHOES = ['boots', 'sneakers', 'wellies', 'lights', 'cowboy'] as const
export type Shoes = (typeof SHOES)[number]
export const GLASSES = ['none', 'round', 'sunglasses', 'goggles', 'stars', 'hearts'] as const
export type Glasses = (typeof GLASSES)[number]
export const BAGS = ['none', 'school', 'teddy', 'toolbox', 'jetpack', 'cat'] as const
export type Bag = (typeof BAGS)[number]
export const TOOLS = ['hammer', 'pickaxe', 'drill', 'shovel', 'wrench', 'wand'] as const
export type Tool = (typeof TOOLS)[number]
/** The cat-ear hard hat's colours. 'none' is for the friends in the rooms: only the player wears the hat. */
export const HAT_COLORS = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'white'] as const
export type HatColor = (typeof HAT_COLORS)[number]

export interface Look {
  hat: HatColor | 'none'
  hair: Hair
  hairColor: HairColor
  skin: Skin
  shirt: Shirt
  shirtColor: WearColor
  pants: Pants
  pantsColor: WearColor
  shoes: Shoes
  glasses: Glasses
  bag: Bag
  tool: Tool
}
/** The wardrobe's tabs, head to toe. */
export const PARTS = ['hat', 'hair', 'skin', 'glasses', 'shirt', 'bag', 'pants', 'shoes', 'tool'] as const
export type Part = (typeof PARTS)[number]

/**
 * Every pose the builder rig draws (the player's builder and the friends alike). Looping
 * poses loop by their own period; one-shot poses run once over their own length and then
 * hold their last frame. drive: seated, from the waist up shows over the cab door. hit: one
 * swing of the tool. hammer: a hammering loop with the tool. lever: pulling a machine's
 * lever. hop: a little jump for joy. float: weightless, arms out (space).
 */
export const POSES = ['stand', 'walk', 'run', 'drive', 'hit', 'hammer', 'lever', 'hop', 'wave', 'cheer', 'dance', 'play', 'jump', 'slide', 'bounce', 'sit', 'sleep', 'float'] as const
export type Pose = (typeof POSES)[number]

// ---------------------------------------------------------------------------------------
// Houses and rooms

/** tall: the kerrostalo, 3 columns by 5 floors. row: the rivitalo, 6 columns by 2 floors, three homes of 2 columns. */
export type HouseKind = 'tall' | 'row'
/** small 1x1, wide 2x1, tall 1x2, big 2x2 (columns x floors). */
export const SHAPES = ['small', 'wide', 'tall', 'big'] as const
export type Shape = (typeof SHAPES)[number]
export const ROOFS = ['pointed', 'round', 'garden', 'tower'] as const
export type RoofStyle = (typeof ROOFS)[number]

export const THEMES = ['disco', 'play', 'ballpit', 'slide', 'gym', 'sleep', 'music', 'crafts', 'cat', 'birthday', 'bath', 'space', 'kitchen', 'sauna'] as const
export type Theme = (typeof THEMES)[number]

/** Where an item goes in a room. */
export type SlotKind = 'ceiling' | 'wall' | 'floor'

/** A room in a plot's grid. `col` and `row` are its bottom-left cell (row 0 on the ground). */
export interface PlacedRoom {
  /** Unique in the keep, never reused: shots, flights and stamps name rooms by it. */
  id: number
  shape: Shape
  col: number
  row: number
  material: Material
  theme: Theme | null
  /** By slot index (layout.slotsOf(shape)), the item in that slot or null. */
  items: (ItemId | null)[]
  /** Which of the theme's four wallpaper and floor colourings. */
  wall: 0 | 1 | 2 | 3
  floor: 0 | 1 | 2 | 3
}

export interface Plot {
  /** null until the child picks a house on the empty plot. */
  kind: HouseKind | null
  roof: RoofStyle
  rooms: PlacedRoom[]
}

// ---------------------------------------------------------------------------------------
// The save

/** An unlock a present can hold: a theme, or a wardrobe option. Written as 'theme:bath', 'bag:jetpack' and so on. */
export type Unlock = `theme:${Theme}` | `bag:${Bag}` | `tool:${Tool}` | `shoes:${Shoes}` | `glasses:${Glasses}`

/** Everything that outlives the page. Ids are save keys: never rename one, only add. Read leniently by progress.ts. */
export interface Keep {
  v: 1
  look: Look
  goods: Record<Good, number>
  machines: Record<MachineId, MachineStage>
  /** One to MAX_PLOTS; the last one is always the empty plot waiting, until the street is full. */
  plots: Plot[]
  /** Trips driven home. Trip 1 is the training road. */
  trips: number
  /** Presents opened, in order. */
  unlocked: Unlock[]
  /** The next room id. */
  nextId: number
  sound: boolean
  music: boolean
}

// ---------------------------------------------------------------------------------------
// The road

export const ROAD_KINDS = ['forest', 'beach', 'hills'] as const
export type RoadKind = (typeof ROAD_KINDS)[number]
/** Stretches of scenery along a road. Each road is a few of these in a row. */
export type Biome = 'meadow' | 'forest' | 'river' | 'dunes' | 'beach' | 'quarry' | 'tunnel' | 'town'
export type Crosser = 'ducks' | 'cats' | 'hedgehogs' | 'cows'
/** One special thing per trip besides the crossers: a train at a level crossing to wait for, or a hot-air balloon that drops a gem into the bed. */
export type Surprise = 'train' | 'balloon'

/** Something lying on or over the road, at x metres from the start. */
export type RoadThing =
  | { kind: 'pickup'; x: number; good: Raw }
  /** A boulder on the road: small takes 3 hits and gives 2 rocks, big 5 hits and 3 rocks; one in three hides a gem. */
  | { kind: 'boulder'; x: number; size: 'small' | 'big'; gem: boolean }
  | { kind: 'crosser'; x: number; who: Crosser }
  /** A ramp whose lip is at x; three gems hang in an arc past it, reached only at full speed; one more lies at its foot. */
  | { kind: 'ramp'; x: number }
  | { kind: 'present'; x: number }
  | { kind: 'surprise'; x: number; what: Surprise }

/** A road as generated from a seed: never changed while driving. */
export interface RoadDef {
  kind: RoadKind
  trip: number
  seed: number
  /** Metres from the start to the street sign where the trip ends. */
  length: number
  /** The ground's y every metre from x = 0 to x = length + 40 (y down, so a hill is negative). */
  ground: Float32Array
  biomes: readonly { from: number; to: number; biome: Biome }[]
  /** The plank bridge over the middle of each river stretch, from and to in metres: no family and no train's track crosses the road on one. */
  bridges: readonly { from: number; to: number }[]
  /** Sorted by x. */
  things: readonly RoadThing[]
  sky: 'day' | 'sunset'
  /** The ramp's gems, their centres: the arc's three past the lip (left to right), then the one lying at its foot. Empty on a road with no ramp. */
  rampGems: readonly { x: number; y: number }[]
}

/** The drive. The truck's x is the middle between its wheels, on the ground at `y` unless airborne. */
export interface RoadState {
  def: RoadDef
  x: number
  y: number
  v: number
  vy: number
  airborne: boolean
  /** The truck's tilt in radians, positive nose down. */
  tilt: number
  /** Total distance the wheels have rolled, for the spokes. */
  roll: number
  /** The pedal is held (keys or touch), or a tap's push lasts until this tick. */
  pedal: boolean
  pushUntil: number
  /** By index into def.things: the tick it was collected, cracked, crossed or passed, or -1. */
  done: Int32Array
  /** What stops the truck now: the index of a boulder or crosser or surprise in def.things, or -1. */
  stop: number
  stopAt: number
  /** Hits on the boulder being broken, and when the last one landed. */
  hits: number
  hitAt: number
  /** The goods in the bed, in the order they landed (drawn as a heap). They were credited to the keep when they landed; the bed is a picture. */
  bed: Good[]
  honkAt: number
  /** The present box on this road is in the bed. */
  present: boolean
  /** The trip is over: the street sign was passed (or Home was pressed) at this tick. */
  endAt: number
  /** The last hit was the builder's own (no hit from the child for AUTO_HIT): their next comes AUTO_HIT_EVERY after it. */
  selfHit: boolean
  /** The crosser or the train (an index into def.things) that last answered the horn, and when; -1 for none. */
  answered: number
  answerAt: number
  /** By ramp gem (def.rampGems), the tick it was collected, or -1. */
  rampGot: Int32Array
  /** When the truck last left the ground (the ramp's lip) and last landed: the flight's pitch and the landing's bounce. */
  airAt: number
  landAt: number
}

// ---------------------------------------------------------------------------------------
// The running state

/** What the camera shows. mirror: the wardrobe at the garage. street: the street, panned to x. plot: one plot's house, to build. room: one room, to fill and play. road: a trip. */
export type Shot = { kind: 'mirror' } | { kind: 'street'; x: number } | { kind: 'plot'; plot: number } | { kind: 'room'; plot: number; room: number } | { kind: 'road' }

/** A question the child answers with a big picture card. house: which house on an empty plot. theme: which room. road: which road (the signpost). */
type Ask = { kind: 'house'; plot: number } | { kind: 'theme'; plot: number; room: number } | { kind: 'road' }

/** Where a flying good starts or lands. */
export type Place =
  | { kind: 'bed' }
  | { kind: 'heap'; good: Raw }
  | { kind: 'stack'; good: Material }
  | { kind: 'room'; plot: number; room: number }
  | { kind: 'road'; x: number; y: number }
  | { kind: 'present' }

/** A picture of goods in the air: `n` of `good` from `from` to `to`, leaving at tick `at`, landing `dur` ticks later. */
export interface Flight {
  good: Good
  n: number
  from: Place
  to: Place
  at: number
  dur: number
}

/** A machine's run: on while its heap lasts; the current batch started at `batchAt` and pops out `batchFor` ticks later. A crate's hits count in `hits`. */
export interface MachineRun {
  on: boolean
  batchAt: number
  batchFor: number
  /** When the last tap on it pushed or coughed, and when the crate was last hit (stamps for the picture). */
  pushAt: number
  coughAt: number
  hits: number
  hitAt: number
  /** When it was unfolded from its crate. */
  builtAt: number
}

/** Where the builder is, as a picture. They dash from `fromX` on the street over DASH, or pop in when it is further than a screen. A visit to a room stands at `x` on its floor line, set when the visit starts (rules.moveBuilder from layout.visitPoint), so an item put in beside them never moves them; only things going in while they stand in front of a floor thing pop them to where they hide the least (rules.stepAside). */
export type BuilderAt =
  | { kind: 'mirror' }
  | { kind: 'street'; x: number }
  | { kind: 'machine'; m: MachineId }
  | { kind: 'scaffold'; plot: number; x: number; y: number }
  | { kind: 'room'; plot: number; room: number; x: number }
  | { kind: 'truck' }

export interface BuilderPic {
  at: BuilderAt
  /** The street x a dash starts from (where they are, after a pop), and the tick the move starts: a dash lasts DASH from it, and the pose starts at poseAt, on arrival. */
  fromX: number
  movedAt: number
  pose: Pose
  poseAt: number
  facing: -1 | 1
}

/** The Good night ending: evening fell at `at`; each plot's lights went out at the tick in `dark` (-1 still lit); `doneAt` is when the last light went out. */
export interface Night {
  at: number
  dark: number[]
  doneAt: number
}

export interface State {
  keep: Keep
  tick: number
  /** The shot shown, the shot before it and when the change started: the camera tweens between them. */
  shot: Shot
  shotFrom: Shot
  shotAt: number
  ask: Ask | null
  askAt: number
  /** A finger is down on this target since tick `at`: a spot shows its ghost pressed (lifting the finger places the room). */
  press: { hit: Hit; at: number } | null
  /** The wardrobe's open tab. */
  tab: Part
  /** The build view's sticky picks. */
  material: Material
  shape: Shape
  /** The hand (take-back) tool is on, and the room lifted on its hook (or -1) since when. */
  hand: boolean
  lifted: number
  liftedAt: number
  /** The room the crane is lowering or carrying away, for the picture: placedAt/removedAt stamps per room id live here. */
  craneRoom: number
  craneAt: number
  craneOut: boolean
  /** The floors a short window's build view showed as the crane last changed, which camera.shownFloors eases on from; -1 to ease from the house's rooms. */
  craneFrom: number
  /** Rooms taken back, as they were: gone from the keep, but the crane carrying one away and the goods flying home from them still draw them. Each leaves this list when the crane and its goods are done. */
  gone: { plot: number; room: PlacedRoom }[]
  /** Per room id, when it was last tapped to play, and when a doorbell party reaches it. Per item: key `${roomId}:${slot}`. */
  playAt: Record<string, number>
  /** Per item key `${roomId}:${slot}`, the tick the item went in: when a slot kind is full, the tray replaces its oldest item (a key missing here is older than any). */
  placedAt: Record<string, number>
  /** Per plot, the doorbell party's start tick, or -1. */
  partyAt: number[]
  /** Per plot, bumps whenever its house changes: the renderer re-bakes the house. */
  rev: number[]
  /** When each plot appeared (the bulldozer) and each roof last changed. */
  plotAt: number[]
  roofAt: number[]
  machines: Record<MachineId, MachineRun>
  /** Per machine, when the crane dropped its crate on the empty pad, or -1: the drop is a picture. */
  crateAt: Record<MachineId, number>
  /** The trip's present, holding `presentGot`: it rides home in the truck's bed, pops out as the truck tips (`presentAt` starts as `tipAt`) and opens where it lands in the yard (layout.presentOpenAt); a tap on it while its card shows opens it again (or -1 and null with no present). */
  presentAt: number
  presentGot: Unlock | 'gems' | null
  builder: BuilderPic
  /** The road while a trip is on; null on the street. */
  road: RoadState | null
  /** The truck's last trip home: it drives into the yard over DRIVE_IN and tips its bed at this tick (its load flies to the heaps from then), or -1. Ahead of `tick` while it drives in. */
  tipAt: number
  flights: Flight[]
  night: Night | null
  /** The one thing that bounces as the next step, and when the hand last showed (ahead of `tick` while the camera first brings the thing into view). */
  hint: Hit | null
  handAt: number
  /** When the hint last changed or a street shot settled, while the camera has yet to look whether the thing bouncing is in sight; -1 once it has, or since a drag. */
  glanceAt: number
  /** The screen the game last drew on, in CSS pixels: what is in sight on it (null before the first frame, and for the rules alone). */
  screen: { w: number; h: number } | null
  lastInputAt: number
  /** A finger is down on the canvas: off the road, input that lasts, so the glance and the hand wait until a beat after it lifts; on the road it counts once, as it goes down. */
  touching: boolean
  /** The dice's undo: the looks before the last rolls, newest last, at most 5. */
  lookUndo: Look[]
  /** The seeded random number generator's state (random.ts). */
  rng: number
  /** This step's events, cleared at the start of every step. */
  events: SimEvent[]
  /** What the actions since the last step reported: the next step puts them first in `events`, so every event reaches the sounds through the one place the clock reads. */
  queued: SimEvent[]
}

// ---------------------------------------------------------------------------------------
// Input

/**
 * Everything the child can do, from a DOM button or a canvas tap. `act` handles each in
 * one exhaustive switch; game.ts turns keys, pointers and HUD buttons into these.
 */
export type Action =
  | { kind: 'tap'; hit: Hit }
  /** A finger went down on (or slid onto) a target, or left it (null). */
  | { kind: 'press'; hit: Hit | null }
  /** A finger went down on the canvas, or lifted. */
  | { kind: 'touch'; down: boolean }
  | { kind: 'pedal'; down: boolean }
  | { kind: 'push' }
  | { kind: 'horn' }
  | { kind: 'whack' }
  | { kind: 'back' }
  | { kind: 'home' }
  | { kind: 'mirror' }
  | { kind: 'tab'; part: Part }
  | { kind: 'go' }
  | { kind: 'wear'; patch: Partial<Look> }
  | { kind: 'dice' }
  | { kind: 'undoDice' }
  | { kind: 'house'; house: HouseKind }
  | { kind: 'road'; road: RoadKind }
  | { kind: 'theme'; theme: Theme | null }
  | { kind: 'askTheme' }
  | { kind: 'material'; material: Material }
  | { kind: 'shape'; shape: Shape }
  | { kind: 'hand'; on: boolean }
  /** The build tray's roof button: the house in view gets its next roof. */
  | { kind: 'roof' }
  | { kind: 'item'; item: ItemId }
  | { kind: 'paint'; what: 'wall' | 'floor' }
  | { kind: 'doorbell' }
  | { kind: 'pan'; x: number }
  | { kind: 'goodnight' }
  | { kind: 'wake' }
  | { kind: 'fresh' }
  | { kind: 'sound'; on: boolean }
  | { kind: 'music'; on: boolean }

/** What a point on the canvas lands on (layout.hitTest). */
export type Hit =
  | { kind: 'none' }
  | { kind: 'ground'; x: number }
  | { kind: 'truck' }
  | { kind: 'mirror' }
  | { kind: 'builder' }
  /** A part of the big builder at the mirror: opens that part's tab. */
  | { kind: 'part'; part: Part }
  | { kind: 'machine'; m: MachineId }
  /** A plot on the street; in the build view of an empty plot, its sign (it asks which house again). */
  | { kind: 'plot'; plot: number }
  | { kind: 'roof'; plot: number }
  /** A front door of the house in view: it rings the doorbell party. */
  | { kind: 'door'; plot: number }
  /** A valid spot for the picked shape: its bottom-left cell. */
  | { kind: 'spot'; plot: number; col: number; row: number }
  | { kind: 'room'; plot: number; room: number }
  | { kind: 'item'; plot: number; room: number; slot: number }
  | { kind: 'boulder' }
  | { kind: 'crosser'; i: number }
  | { kind: 'present' }

// ---------------------------------------------------------------------------------------
// Events: what a step reports, for sounds and particles only

export type SimEvent =
  | { kind: 'pickup'; good: Good; x: number; y: number }
  | { kind: 'whack'; tool: Tool; x: number; y: number }
  | { kind: 'crack'; x: number; y: number; gem: boolean }
  | { kind: 'stop'; why: 'boulder' | 'crosser' | 'surprise' }
  /** The road's events that the renderer places carry where they happen in the road's world: the truck's middle on its wheels' line (honk, ramp, land), the answerer on the ground (answer). They can come in the step the trip ends, when s.road is already null. */
  | { kind: 'honk'; x: number; y: number }
  | { kind: 'answer'; who: Crosser | 'train'; x: number; y: number }
  | { kind: 'ramp'; x: number; y: number }
  | { kind: 'land'; hard: boolean; x: number; y: number }
  /** The present box: into the bed on the road, and opening as it lands in the yard after the tip (and again on a tap). */
  | { kind: 'present' }
  | { kind: 'unlock'; what: Unlock | 'gems' }
  /** The road's: the truck passes the street sign and the trip is over. */
  | { kind: 'arrive' }
  /** The homecoming at the yard: the truck has driven in and tips its bed (at State.tipAt). */
  | { kind: 'tip' }
  | { kind: 'crate'; m: MachineId }
  | { kind: 'crateHit'; m: MachineId }
  | { kind: 'machineBuilt'; m: MachineId }
  | { kind: 'batch'; m: MachineId }
  | { kind: 'push'; m: MachineId }
  | { kind: 'cough'; m: MachineId }
  | { kind: 'house'; plot: number }
  | { kind: 'build'; plot: number; room: number; material: Material }
  | { kind: 'landed'; plot: number; room: number }
  | { kind: 'lift'; plot: number; room: number }
  | { kind: 'takeBack'; plot: number; room: number }
  | { kind: 'nope'; good: Good }
  /** The hand tried to lift a room that holds others up: each room on top of it wiggles. */
  | { kind: 'wiggle'; plot: number; room: number }
  /** A room got its theme. Room events say where they happen (a room id, and an item's slot index), so the particles go exactly there. */
  | { kind: 'theme'; theme: Theme; plot: number; room: number }
  | { kind: 'itemIn'; item: ItemId; plot: number; room: number; slot: number }
  | { kind: 'itemOut'; item: ItemId; plot: number; room: number; slot: number }
  | { kind: 'play'; item: ItemId; plot: number; room: number; slot: number }
  | { kind: 'paint' }
  | { kind: 'roof'; plot: number }
  | { kind: 'doorbell'; plot: number }
  | { kind: 'visit'; theme: Theme }
  | { kind: 'newPlot'; plot: number }
  | { kind: 'wear'; part: Part }
  | { kind: 'dice' }
  | { kind: 'zoom' }
  | { kind: 'goodnight' }
  | { kind: 'lightsOut'; plot: number }
  | { kind: 'sleep' }
  | { kind: 'wake' }
  | { kind: 'tap' }
export type EventKind = SimEvent['kind']

// ---------------------------------------------------------------------------------------
// Shared timings (seconds) and the economy

/** The builder's dash to anything on the street. */
export const DASH = 0.6
/** A shot change: the camera tweens this long. Canvas taps wait for it; HUD buttons do not. */
export const SHOT_TWEEN = 0.6
/** A machine batch, and the shortest a tap's push can make one. */
export const BATCH = 0.8
export const BATCH_PUSHED = 0.15
/** A crate opens on the third hit. */
export const CRATE_HITS = 3
/** The crane lowers a new room over LOWER, it lands with a squash, and the builder hammers on it for HAMMER. */
export const LOWER = 1.2
export const HAMMER = 0.8
/** Home from a trip, the truck drives into the yard over DRIVE_IN (the street shows it coming), so it tips DRIVE_IN after the homecoming. */
export const DRIVE_IN = 3
/** The truck tips its bed over TIP; goods leave it FLY_EVERY apart and fly for FLY_FOR. */
export const TIP = 1.2
export const FLY_EVERY = 0.08
export const FLY_FOR = 0.7
/** A room costs this many of its material per cell. */
export const CELL_COST = 2
/** The street holds at most this many plots. */
export const MAX_PLOTS = 6
/** The one next step bounces; after HINT_IDLE seconds with no input a hand taps it. */
export const HINT_IDLE = 8
/** A doorbell party plays one room every PARTY_EVERY, bottom floor first. */
export const PARTY_EVERY = 0.3
/** A boulder: hits to break it, and the builder hits on their own after AUTO_HIT with no hit, then every AUTO_HIT_EVERY. */
export const BOULDER_HITS = { small: 3, big: 5 } as const
/** The rocks a burst boulder gives: few, as they count toward the trip's raw goods with the pickups (catalog.ts ROADS has the sums). */
export const BOULDER_ROCKS = { small: 2, big: 3 } as const
export const AUTO_HIT = 6
export const AUTO_HIT_EVERY = 1.2
/** Crossers take this long to cross. */
export const CROSS_FOR = 3
/** No input for this long pauses the game. */
export const IDLE_PAUSE = 60
