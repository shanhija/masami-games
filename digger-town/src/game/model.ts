/**
 * Digger Town's state as plain numbers, and the measures the sim and the scene share: the
 * ground, the machines, the things they carry, the plants that change stuff, the town, the
 * jobs, what was said, and what the sim tells the game each frame. No three.js here. The sim
 * writes this state; the scene and the HUD read it and never write it.
 *
 * Axes: x east, z south (toward the camera), y up. Metres, seconds, radians.
 * A yaw of 0 faces +z, so forward is (sin yaw, cos yaw), and three's rotation.y = yaw turns a
 * model built facing +z the right way. Local +x is the driver's left, so yaw grows as a
 * machine turns left, and a steer above 0 is left. A local point (lx, lz) is at
 * x + lx * cos(yaw) + lz * sin(yaw), z - lx * sin(yaw) + lz * cos(yaw).
 */
import { clamp01 } from './math'

// ---------------------------------------------------------------------------------------
// The ground.

/** Metres between two height points. */
export const CELL = 0.5
/** Cells per side; the world is GRID * CELL = 96 m square, centred on (0, 0). */
export const GRID = 192
/** Height points per side. Every ground array is SIDE * SIDE long, row by row: index = ix + iz * SIDE, ix = (x + HALF) / CELL. */
export const SIDE = GRID + 1
export const HALF = (GRID * CELL) / 2
/** The ground point's share of the surface, for turning a height change into a volume. */
export const POINT_AREA = CELL * CELL
/** Cells per side of one chunk: the scene rebuilds only the chunks that changed. */
export const CHUNK = 32
export const CHUNKS = GRID / CHUNK
/** The hard floor under soft ground. Ordinary ground is 1.2 m of dirt on it, grass on top, level with y = 0: a child can dig anywhere. */
export const BEDROCK = -1.2
/** The steepest slope loose stuff keeps: rise per metre of run. */
export const REPOSE = 0.6

export const LOOSE_KINDS = ['dirt', 'sand', 'rock', 'gravel', 'concrete'] as const
/** What loose stuff is. */
export type LooseKind = (typeof LOOSE_KINDS)[number]
export const LOOSE_INDEX: Record<LooseKind, number> = { dirt: 0, sand: 1, rock: 2, gravel: 3, concrete: 4 }

export const SURFACE_KINDS = ['soft', 'road', 'slab', 'riverbed'] as const
/** What the hard level looks like where no loose stuff lies on it. */
export type SurfaceKind = (typeof SURFACE_KINDS)[number]
export const SURFACE_INDEX: Record<SurfaceKind, number> = { soft: 0, road: 1, slab: 2, riverbed: 3 }

/** Every array is SIDE * SIDE. The surface height at a point is hard + loose. */
export interface Terrain {
  /** The hard level: nothing digs below it. */
  hard: Float32Array
  /** Metres of diggable stuff on the hard level. */
  loose: Float32Array
  /** LOOSE_INDEX of what the loose stuff is: one kind per point, whatever last landed there. */
  kind: Uint8Array
  /** 1 is grass on top, 0 is bare: disturbed ground loses its grass. */
  turf: Float32Array
  /** SURFACE_INDEX of the hard level. */
  surface: Uint8Array
  /** The road (index into ROADS) a road-bed point belongs to, -1 elsewhere. */
  bed: Int8Array
  /** 0 to 1: how rolled a road-bed point is. At 1 it is road: loose gone, hard at ROAD_Y. */
  rolled: Float32Array
  /** CHUNKS * CHUNKS counters, one up each time anything in that chunk changes: the scene compares them with what it last drew. */
  version: Uint32Array
  /** Points whose slope may still need to settle, and whether each is on the list. */
  settling: Int32Array
  settlingCount: number
  isSettling: Uint8Array
  /** Cubic metres of loose stuff rolled into road, so the total stays provable. */
  packed: number
}

export const ROAD_Y = 0.02

// ---------------------------------------------------------------------------------------
// The machines.

export const MACHINE_KINDS = ['digger', 'dumper', 'dozer', 'roller', 'mixer', 'forklift', 'tower', 'semi', 'mobile'] as const
export type MachineKind = (typeof MACHINE_KINDS)[number]

/** What loose stuff a machine holds: cubic metres of one kind. The kind means nothing at 0. */
export interface Load {
  amount: number
  kind: LooseKind
}

/** A place on the ground to go to and how close counts. */
export interface Goal {
  x: number
  z: number
  within: number
  /** Back up to it instead of driving nose first (peruuta). */
  reverse: boolean
  /** Do the machine's big-button job on arriving ("kippaa kuoppaan" from far away). */
  thenPress: boolean
  /** Turn to this yaw on arriving, or null for any. */
  yaw: number | null
  /** Times the machine's top speed: 1 with the child at the wheel, 1.5 for a friend, 2.5 coming to the site or brought to a far job. */
  pace: number
}

interface MachineBase {
  /** It has come to the site: the child can hop in. */
  unlocked: boolean
  x: number
  z: number
  /** Ride height, pitch (nose up above 0) and roll (left side up above 0), smoothed over the ground under it. */
  y: number
  yaw: number
  pitch: number
  roll: number
  /** Metres per second along its nose, below 0 going backward. */
  speed: number
  /** -1 to 1, the wheels' turn now; above 0 is left. */
  steer: number
  /** Metres each side's wheels or tread have rolled: the scene spins them by it. */
  rollL: number
  rollR: number
  /** 0 to 1: how hard the engine works, for its sound and its smoke. */
  rev: number
  /** Where it is going, from a tap, a spoken word or a friend at the wheel. */
  goal: Goal | null
  /** A friend is driving it, not the child. */
  friend: boolean
  /** Seconds left of its honk. */
  honk: number
  /** The goal its hands set themselves (a dumper's turn, a forklift's seek, a crane's drive): the same object as `goal` until a tap or a word replaces it. */
  ownGoal: Goal | null
  /** The way round standing things that `route` found for `goal`, kept for 0.4 s so a machine keeps to one way. */
  route: { goal: Goal; at: number; aim: [number, number] | null } | null
  /** Where it stood a few seconds ago while it has a goal, to notice one stuck in a corner. */
  seen: { x: number; z: number; at: number } | null
}

/** The excavator: tracks, a turret on them, and a boom, a stick and a bucket in the turret's own vertical plane. */
export interface Digger extends MachineBase {
  kind: 'digger'
  /** The turret's turn from the tracks; above 0 is left. */
  swing: number
  /** The boom's angle above level. */
  boom: number
  /** The stick's angle from the boom's line: below 0 folds it down. */
  stick: number
  /** The bucket's angle from the stick's line: below 0 curls it in, so stuff stays in. */
  curl: number
  load: Load
  /** What its hands are doing in easy mode. */
  seq: 'rest' | 'reach' | 'bite' | 'lift' | 'hold' | 'swing' | 'open' | 'close'
  /** Seconds in this seq. */
  seqT: number
  /** The ground point the hands dig at, or the point over which they open. */
  aimX: number
  aimZ: number
  /** A press came during a sequence: it runs when the sequence ends. */
  pending: boolean
}

/** The dump truck. */
export interface Dumper extends MachineBase {
  kind: 'dumper'
  /** 0 flat to 1 fully up. */
  bed: number
  load: Load
  seq: 'rest' | 'turn' | 'up' | 'down'
  seqT: number
}

/** The bulldozer. */
export interface Dozer extends MachineBase {
  kind: 'dozer'
  /** 0 down on the ground, 1 fully up. */
  blade: number
  /** Raised on purpose: in easy mode only while the big button is held or after a spoken "nosta"; going forward from a tap or a goal clears it. The hands drop the blade going forward and lift it going backward. */
  bladeUp: boolean
  /** Cubic metres riding in front of the blade now, for the sound and the HUD. */
  pushing: number
}

/** The road roller. */
export interface Roller extends MachineBase {
  kind: 'roller'
  /** 0 to 1: how hard the drum shakes now. The big button stomps it up to 1 for a moment. */
  shake: number
}

/** The cement mixer truck: sand and water in, a turn of the drum, concrete out. */
export interface Mixer extends MachineBase {
  kind: 'mixer'
  /** Cubic metres of dry sand in the drum. */
  sand: number
  /** 0 to 1: how full of water. */
  water: number
  /** 0 to 1: how much of the drum is ready concrete; 1 is MIXER_SAND cubic metres of it. */
  concrete: number
  /** 0 to 1: how far along the mixing is once sand and water are both in. */
  mixed: number
  /** The drum's turn, radians. */
  drum: number
  /** 0 to 1: how far the chute is out. */
  chute: number
  seq: 'rest' | 'turn' | 'pour'
  seqT: number
}

/** The forklift. */
export interface Forklift extends MachineBase {
  kind: 'forklift'
  /** 0 on the ground to 1 at the top. */
  lift: number
  /** The id of the thing on the forks, or -1. */
  holding: number
  seq: 'rest' | 'seek' | 'raise' | 'lower'
  seqT: number
  /** The id of the thing the hands are going for, or -1. */
  aim: number
}

/** The tower crane: it stands still; the jib turns, the trolley runs along it, the hook goes up and down. */
export interface Tower extends MachineBase {
  kind: 'tower'
  /** 0 before it is put up to 1 standing: the mast grows when it arrives. */
  up: number
  /** The jib's turn (a world yaw). */
  jib: number
  /** The trolley's distance from the mast. */
  trolley: number
  /** The hook's height. */
  hookY: number
  /** The id of the thing on the hook, or -1. */
  holding: number
  /** How the hook swings away from under the trolley, metres. */
  swayX: number
  swayZ: number
  seq: 'rest' | 'over' | 'lower' | 'raise'
  seqT: number
  /** Where the hook is going, on the ground. */
  aimX: number
  aimZ: number
  /** The child tapped a point since the hook last picked something up. */
  tapped: boolean
  /** What the hook does once it is over its point. */
  then: 'stay' | 'lower'
  act: 'grab' | 'drop'
  /** The id of the thing the hook is going to grab, or -1. */
  target: number
}

/** The articulated lorry: a cab and a long trailer. */
export interface Semi extends MachineBase {
  kind: 'semi'
  /** The trailer's world yaw, and how it rides the ground under its hitch and its axle. */
  trailerYaw: number
  trailerY: number
  trailerPitch: number
  trailerRoll: number
  /** 0 to 1: how many of its logs it still has. */
  logs: number
  seq: 'rest' | 'unload'
  seqT: number
}

/** The truck crane: it drives, stands on its legs, and swings a telescopic boom. */
export interface Mobile extends MachineBase {
  kind: 'mobile'
  /** 0 up to 1 down on the ground. */
  legs: number
  /** The boom's turn (a world yaw). */
  jib: number
  /** The hook's distance from the turret. */
  reach: number
  hookY: number
  holding: number
  swayX: number
  swayZ: number
  seq: 'rest' | 'drive' | 'legs' | 'over' | 'lower' | 'raise'
  seqT: number
  aimX: number
  aimZ: number
  /** The child tapped a point since the hook last picked something up. */
  tapped: boolean
  /** What the hook does once it is over its point. */
  then: 'stay' | 'lower'
  act: 'grab' | 'drop'
  /** The id of the thing the hook is going to grab, or -1. */
  target: number
}

export type Machine = Digger | Dumper | Dozer | Roller | Mixer | Forklift | Tower | Semi | Mobile
export type Machines = { digger: Digger; dumper: Dumper; dozer: Dozer; roller: Roller; mixer: Mixer; forklift: Forklift; tower: Tower; semi: Semi; mobile: Mobile }

/** Where a machine stands. */
export interface Spot {
  x: number
  z: number
  yaw: number
}

/** A machine at rest at a spot, its arms in their carrying pose, not yet come to the site. */
export function newMachine<K extends MachineKind>(kind: K, at: Spot): Machines[K] {
  const base: MachineBase = { unlocked: false, x: at.x, z: at.z, y: 0, yaw: at.yaw, pitch: 0, roll: 0, speed: 0, steer: 0, rollL: 0, rollR: 0, rev: 0, goal: null, friend: false, honk: 0, ownGoal: null, route: null, seen: null }
  const made: { [Q in MachineKind]: () => Machines[Q] } = {
    digger: () => ({ ...base, kind: 'digger', swing: 0, boom: CARRY.boom, stick: CARRY.stick, curl: CARRY.curl, load: { amount: 0, kind: 'dirt' }, seq: 'rest', seqT: 0, aimX: 0, aimZ: 0, pending: false }),
    dumper: () => ({ ...base, kind: 'dumper', bed: 0, load: { amount: 0, kind: 'sand' }, seq: 'rest', seqT: 0 }),
    dozer: () => ({ ...base, kind: 'dozer', blade: 0.4, bladeUp: false, pushing: 0 }),
    roller: () => ({ ...base, kind: 'roller', shake: 0 }),
    mixer: () => ({ ...base, kind: 'mixer', sand: 0, water: 0, concrete: 0, mixed: 0, drum: 0, chute: 0, seq: 'rest', seqT: 0 }),
    forklift: () => ({ ...base, kind: 'forklift', lift: 0.08, holding: -1, seq: 'rest', seqT: 0, aim: -1 }),
    tower: () => ({ ...base, kind: 'tower', up: 0, jib: at.yaw, trolley: 12, hookY: 10, holding: -1, swayX: 0, swayZ: 0, seq: 'rest', seqT: 0, aimX: at.x, aimZ: at.z, tapped: false, then: 'stay', act: 'grab', target: -1 }),
    semi: () => ({ ...base, kind: 'semi', trailerYaw: at.yaw, trailerY: 0, trailerPitch: 0, trailerRoll: 0, logs: 0, seq: 'rest', seqT: 0 }),
    mobile: () => ({ ...base, kind: 'mobile', legs: 0, jib: at.yaw, reach: 7, hookY: 6, holding: -1, swayX: 0, swayZ: 0, seq: 'rest', seqT: 0, aimX: at.x, aimZ: at.z, tapped: false, then: 'stay', act: 'grab', target: -1 }),
  }
  return made[kind]()
}

/** Every drivable machine's outline, top speed (m/s) and turn. A machine with `pivot` above 0 turns on the spot at that rate (rad/s); the others have a wheelbase and a steering lock. */
export const MACHINE_SPECS: Record<MachineKind, { length: number; width: number; height: number; top: number; pivot: number; wheelbase: number; lock: number; body: readonly (readonly [lz: number, r: number])[] }> = {
  digger: { length: 4.2, width: 2.8, height: 3.0, top: 5, pivot: 1.5, wheelbase: 0, lock: 0, body: [[0, 2.2]] },
  dumper: { length: 6.0, width: 2.6, height: 3.3, top: 8, pivot: 0, wheelbase: 3.6, lock: 0.75, body: [[1.6, 1.5], [-1.4, 1.6]] },
  dozer: { length: 5.2, width: 3.6, height: 3.4, top: 5, pivot: 1.6, wheelbase: 0, lock: 0, body: [[0, 2.2], [2.3, 1.2]] },
  roller: { length: 5.0, width: 2.9, height: 3.4, top: 5, pivot: 0, wheelbase: 3.2, lock: 0.8, body: [[1.3, 1.5], [-1.3, 1.5]] },
  mixer: { length: 6.8, width: 2.6, height: 3.7, top: 7, pivot: 0, wheelbase: 3.6, lock: 0.75, body: [[1.7, 1.5], [-1.5, 1.6]] },
  forklift: { length: 3.2, width: 1.8, height: 2.6, top: 6, pivot: 0, wheelbase: 1.7, lock: 1.0, body: [[0, 1.4]] },
  tower: { length: 3.6, width: 3.6, height: 22, top: 0, pivot: 0, wheelbase: 0, lock: 0, body: [[0, 2.4]] },
  semi: { length: 5.6, width: 2.6, height: 3.4, top: 9, pivot: 0, wheelbase: 3.4, lock: 0.7, body: [[1.2, 1.6]] },
  mobile: { length: 8.2, width: 2.8, height: 3.4, top: 6, pivot: 0, wheelbase: 5.0, lock: 0.7, body: [[2.6, 1.5], [0, 1.5], [-2.6, 1.5]] },
}

/** Where the driver sits, local to the body. The digger's is local to the turret; the tower's to the jib's turning frame at the top of the mast (the cab turns with the jib); the mobile's to the truck's cab. `seatPoint` in machines.ts gives it in the world. */
export const SEAT: Record<MachineKind, readonly [x: number, y: number, z: number]> = {
  digger: [0.62, 1.5, 0.3],
  dumper: [0.42, 1.75, 2.0],
  dozer: [0, 1.95, -0.5],
  roller: [0, 1.95, -0.3],
  mixer: [0.42, 1.75, 2.1],
  forklift: [0, 1.15, -0.15],
  tower: [0.9, -1.0, 1.0],
  semi: [0.42, 2.0, 1.7],
  mobile: [0.45, 1.7, 3.2],
}

// The digger's arm, in the turret's own frame: forward is +z, the arm moves in the plane x = 0.
/** The boom's root: this far forward of the turret's middle and this high over the machine's y. */
export const BOOM_ROOT_Z = 0.7
export const BOOM_ROOT_Y = 1.45
export const BOOM_LEN = 3.3
export const STICK_LEN = 2.3
export const BUCKET_LEN = 1.0
export const BUCKET_WIDTH = 1.25
/** The boom's, the stick's and the bucket's ranges, and the pose it carries in. */
export const BOOM_RANGE = [-0.7, 1.15] as const
export const STICK_RANGE = [-2.7, -0.35] as const
export const CURL_RANGE = [-2.5, 0.9] as const
export const CARRY = { boom: 0.62, stick: -1.75, curl: -1.7 } as const
/** The ground a dig can reach, from the turret's middle. */
export const DIG_MIN = 3.2
export const DIG_MAX = 6.0
/** How far from the turret's middle the bucket can open over something. */
export const DUMP_MAX = 6.4
/** One bucketful, cubic metres. Toy scale: a bite you can see. */
export const SCOOP = 2

// The dump truck's bed: a hinge at the back, tipping up to BED_MAX.
export const BED_HINGE_Y = 1.25
export const BED_HINGE_Z = -2.7
export const BED_LEN = 3.6
export const BED_WIDTH = 2.3
export const BED_DEPTH = 0.85
export const BED_MAX = 0.95
export const DUMPER_CAP = 3 * SCOOP

// The dozer's blade, in front of its tracks.
export const BLADE_Z = 2.5
export const BLADE_WIDTH = 3.6
export const BLADE_RISE = 1.1

// The roller's drum and how wide it counts as for a road: one pass along a road rolls all of it.
export const DRUM_Z = 1.7
export const DRUM_R = 0.85
export const DRUM_WIDTH = 2.5
export const ROLL_WIDTH = 7

// The mixer: a hopper at the back that catches what a digger drops, and a chute under it.
export const HOPPER_Y = 3.1
export const HOPPER_Z = -3.0
export const HOPPER_R = 1.6
export const MIXER_SAND = 2 * SCOOP
export const DRUM_Y = 2.15
export const DRUM_LEN = 3.3
export const DRUM_RADIUS = 1.15

// The forklift's forks.
export const FORK_Z = 1.9
export const FORK_RISE = 3.2

// The tower crane.
export const MAST_H = 17
export const JIB_LEN = 25
export const COUNTER_JIB = 8
export const TROLLEY_RANGE = [5, 24] as const
export const HOOK_TOP_TOWER = 15.5

// The truck crane.
export const TURRET_Z = -1.2
export const REACH_RANGE = [5, 16] as const
export const HOOK_TOP_MOBILE = 11
/** The truck crane's outriggers: where their housings are along the carrier (local z), the beam's height, where a beam starts out from the middle, how far it slides, and how far past its end the jack's pad stands and how wide that is. */
export const OUTRIGGER_Z = [0.95, -4.1] as const
export const BEAM_Y = 1.35
export const BEAM_X0 = 0.4
export const SLIDE = 1.5
export const PAD_OUT = 0.75
export const PAD_R = 0.35
/** The legs value at which the beams are out; the jacks stamp down over the rest. */
export const BEAMS_OUT_AT = 0.55
/** A smooth step from 0 to 1 over 0 to 1. */
export const ease = (v: number) => v * v * (3 - 2 * v)
/** How far from the carrier's middle the pads stand at this `legs` value, as drawn: the beams slide out first. */
export const padX = (legs: number) => BEAM_X0 + SLIDE * ease(clamp01(legs / BEAMS_OUT_AT)) + PAD_OUT
/** The boom's root height. From the turret to the tip it is hypot(reach, HOOK_TOP_MOBILE - MOBILE_PIVOT_Y) long, its angle the atan2 of the same. Driving with its legs up the sim stows it: jib = yaw + PI, reach = REACH_RANGE[0], hookY = HOOK_TOP_MOBILE. */
export const MOBILE_PIVOT_Y = 2.4

// The lorry and its trailer.
export const HITCH_Z = -1.4
export const TRAILER_AXLE = 6.6
export const TRAILER_LEN = 9
/** What `Semi.logs` is with the trailer full. */
export const LOG_FULL = 1

// ---------------------------------------------------------------------------------------
// Things a fork or a hook can carry.

export const THING_KINDS = ['bricks', 'planks', 'pier', 'beam', 'slide', 'swing', 'climber', 'clock'] as const
export type ThingKind = (typeof THING_KINDS)[number]

/** How tall each thing stands, so a hook or forks hold it at the right height. */
export const THING_HEIGHT: Record<ThingKind, number> = { bricks: 1.2, planks: 0.9, pier: 3.2, beam: 0.8, slide: 3, swing: 2.6, climber: 2.6, clock: 2.4 }

export type Holder = 'forklift' | 'tower' | 'mobile'

export interface Thing {
  id: number
  kind: ThingKind
  x: number
  y: number
  z: number
  yaw: number
  heldBy: Holder | null
  /** Used up: it became part of a building. */
  gone: boolean
}

// ---------------------------------------------------------------------------------------
// Plants: where materials change.

export const PLANT_IDS = ['press', 'crusher', 'saw'] as const
export type PlantId = (typeof PLANT_IDS)[number]

/** The brick press (loose stuff to pallets of bricks), the rock crusher (loose stuff to a heap of gravel), the sawmill (logs to pallets of planks). A hopper takes any kind of loose stuff: nothing a child drops in can jam a job. */
export interface Plant {
  id: PlantId
  /** How much has gone in toward the next batch: cubic metres, or for the saw a share of the lorry's logs. */
  stored: number
  phase: 'idle' | 'work'
  /** Seconds in this phase. */
  t: number
  /** Batches made so far. */
  made: number
}

/** A floor's wooden frame: it shows when the digging is done, the mixer fills it, it sets hard. Every form exists from the start, one per FORMS entry of the map, at the same index, and is never removed. */
export interface Form {
  /** Its index in FORMS and in Sim.forms. */
  id: number
  /** Its index in LOTS. */
  lot: number
  /** The wooden frame stands. */
  shown: boolean
  /** 0 to 1: how full of wet concrete. */
  fill: number
  /** Seconds it has been setting, once full. */
  setting: number
  hard: boolean
}

export const BUILD_KINDS = ['house', 'bridge', 'playground', 'hall'] as const
export type BuildKind = (typeof BUILD_KINDS)[number]

/** Where a piece of a building goes: the hook brings a thing of this kind here and it becomes the piece. */
export interface PieceSpot {
  x: number
  y: number
  z: number
  yaw: number
  wants: ThingKind
}

/** Every building exists from the start, one per BUILDS entry of the map, at the same index, and is never removed: `shown` says when its ghost appears. */
export interface Build {
  /** Its index in BUILDS and in Sim.builds. */
  id: number
  /** Its index in LOTS, or -1 for the bridge and the playground. */
  lot: number
  /** Its ghost pieces show: a job is building it, or it has been built. */
  shown: boolean
  kind: BuildKind
  x: number
  z: number
  yaw: number
  /** The walls' colour. */
  colour: string
  spots: readonly PieceSpot[]
  /** How many pieces are in place, the first spots first. */
  placed: number
  /** Sim time of the last piece, for its pop. */
  placedAt: number
  /** Who moves in when it is done, or null. */
  owner: Species | null
}

/** A dug pool that fills with water. Exists from the start; `shown` once dug. */
export interface Pond {
  shown: boolean
  x: number
  z: number
  r: number
  /** 0 to 1: how full. */
  water: number
}

/** A stretch of bridge a machine can ride over the river on, ramping up from the ground over its last 2.5 m at each end of z. */
export interface Deck {
  x0: number
  x1: number
  z0: number
  z1: number
  y: number
}

// ---------------------------------------------------------------------------------------
// The town's animals.

export const SPECIES = ['hedgehog', 'bunny', 'duck', 'pig', 'cat', 'dog', 'cow', 'sheep', 'fox', 'bear', 'frog'] as const
export type Species = (typeof SPECIES)[number]

export interface Animal {
  id: number
  species: Species
  x: number
  /** Its feet: the sim sets it from the ground, a deck, or the slide or the water it is in. */
  y: number
  z: number
  yaw: number
  /** Where it is walking to. */
  goalX: number
  goalZ: number
  mood: 'walk' | 'idle' | 'wave' | 'cheer' | 'lick' | 'swim' | 'slide'
  /** Seconds in this mood. */
  t: number
  /** The holding it stays near, or -1. */
  home: number
  /** It is walking to a new home and moves in on arriving at the door. */
  movingIn: boolean
  /** Seconds a walker has gone without getting a metre from `markX`, `markZ`: held in a pocket between machines. Past a limit she walks on through them. */
  stuck: number
  markX: number
  markZ: number
}

// ---------------------------------------------------------------------------------------
// What the child does.

export type Mode = 'easy' | 'pro'

/** Pro mode's levers, each -1 to 1. What a, b, c and d move is per machine: see the table under Pro in the Controls section of plans/digger-town.md. */
export interface Levers {
  drive: number
  steer: number
  a: number
  b: number
  c: number
  d: number
}

export interface Hands {
  /** The finger or the mouse button on the ground now, or null. */
  point: { x: number; z: number } | null
  /** The big button is down. */
  action: boolean
  /** The button went down since the last tick, even if it is up again: a tap shorter than a frame still counts as one press. */
  tapped: boolean
  /** Seconds it has been down. A load-dropping press outside the step's ring takes a 1 s hold: the HUD fills a ring on the button by this. */
  heldFor: number
  /** After a hop the button does nothing until it has been let go and pressed again at least 0.6 s later, so mashing never carries into the next machine. */
  blocked: boolean
  levers: Levers
  /** The screen's "up" as a world yaw: left and right, spoken or pressed, follow the screen. */
  viewYaw: number
}

/** What the big button shows and does on the active machine now. */
export type ActionFace = 'dig' | 'dump' | 'tip' | 'bladeUp' | 'bladeDown' | 'stomp' | 'pick' | 'drop' | 'hook' | 'unhook' | 'pour' | 'unload' | 'none'

// ---------------------------------------------------------------------------------------
// What was said: one clause of Finnish speech, parsed. Any part can be missing: "kaivuri" only names a machine.

export type SpokenMove = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'around'
export type SpokenWork = 'take' | 'give' | 'push' | 'roll'
export const PLACE_IDS = ['sand', 'rock', 'hole', 'road', 'house', 'bridge', 'water', 'forest', 'saw', 'press', 'crusher', 'play', 'pond', 'clock', 'there'] as const
export type PlaceId = (typeof PLACE_IDS)[number]

export interface Spoken {
  /** The machine named: the driver hops into it, unless it is told to come. */
  who: MachineKind | null
  move: SpokenMove | null
  work: SpokenWork | null
  /** Where to go, or (with `work`) where to do the job. */
  to: PlaceId | MachineKind | null
  /** It is told to come here: a friend drives it over and the driver stays. */
  come: boolean
  honk: boolean
  stop: boolean
  help: boolean
}

// ---------------------------------------------------------------------------------------
// Jobs: the story and everything after it.

export const CHAPTER_IDS = ['road', 'house', 'bridge', 'play', 'clock'] as const
export type ChapterId = (typeof CHAPTER_IDS)[number]

/** A round place on the ground. */
export interface Zone {
  x: number
  z: number
  r: number
}

/** What a `digOut` leaves when it is done: the lot levelled and its form shown, or the pool carved and filling. */
export type DugFor = { form: number } | { pond: number }

/** What a `watch` waits for: read from the thing itself, never a timer of the step's own. */
export type Watched = { form: number } | { pond: number } | { plant: PlantId } | 'logs'

/**
 * One thing to do, for one machine. A job's steps run in order. `refill` is the step of the
 * same job to go back to if the load runs out early. A step counts what happened by whatever
 * route: `stuff` is for the pictures and for where the digger digs, and any loose stuff counts.
 */
export type Step =
  /** The digger puts `scoops` bucketfuls into `into`: done once (scoops - 0.2) * SCOOP cubic metres have arrived. A friend brings a truck or the mixer alongside. */
  | { kind: 'scoop'; into: 'dumper' | 'mixer' | PlantId; stuff: LooseKind; scoops: number; park: Spot; dig: Zone }
  /** The digger takes `scoops` bucketfuls out of `zone`, then what `makes` says appears. */
  | { kind: 'digOut'; zone: Zone; scoops: number; park: Spot; makes: DugFor }
  /** The dump truck tips `need` cubic metres inside `zone`. */
  | { kind: 'tip'; zone: Zone; stuff: LooseKind; need: number; refill: number }
  /** The dump truck tips `need` cubic metres into a plant's hopper. */
  | { kind: 'feed'; plant: PlantId; stuff: LooseKind; need: number; refill: number }
  /** The dozer pushes loose stuff until the hole in `hole` is `need` (0 to 1) filled up to `level`. If too little lies within 14 m and the truck is empty, back to `refill`. */
  | { kind: 'push'; hole: Zone; level: number; need: number; refill: number }
  /** The dozer pushes stuff off `zone` until at most `max` cubic metres stand above the ground in it. */
  | { kind: 'clear'; zone: Zone; max: number }
  /** The roller rolls `need` (0 to 1) of a road. */
  | { kind: 'roll'; road: number; need: number }
  /** The mixer stands under the water tower until it is mixed. */
  | { kind: 'water' }
  /** The mixer pours its concrete into a form. */
  | { kind: 'pour'; form: number; refill: number }
  /** The forklift brings `count` things of a kind to `ring`. */
  | { kind: 'carry'; thing: ThingKind; count: number; ring: Zone }
  /** A crane puts `pieces` more things into a building. */
  | { kind: 'lift'; crane: 'tower' | 'mobile'; build: number; pieces: number }
  /** A machine drives to `ring`. */
  | { kind: 'drive'; machine: MachineKind; ring: Zone }
  /** The lorry unloads its logs at the saw. */
  | { kind: 'unload' }
  /** Nothing to do but watch; the camera looks at (x, z). Each thing watched takes 6 s at most. */
  | { kind: 'watch'; what: Watched; x: number; z: number }

/** The small pictures a job's bubble is made of. */
export type Picture = MachineKind | LooseKind | ThingKind | 'hole' | 'road' | 'water' | 'logs' | 'house' | 'wall' | 'roof' | 'floor' | 'bridge' | 'playground' | 'pond' | 'clock' | 'iceCream' | 'arrow' | 'plus' | PlantId

export interface Job {
  id: string
  chapter: ChapterId | 'more'
  /** Who asks. */
  who: Species
  /** What the asker wants, as pictures. */
  wish: readonly Picture[]
  steps: readonly Step[]
  /** Machines that arrive when this job starts. */
  brings: readonly MachineKind[]
  /** Things that appear when this job starts, spread out around the place given. */
  setup: readonly { thing: ThingKind; count: number; x: number; z: number }[]
  /** Who moves in when this job is done, with the building (an index in BUILDS) they get, or null. */
  movesIn: { who: Species; build: number } | null
  /** Finish within this many seconds for three stars, within twice as long for two. Never fewer than one. */
  par: number
}

/** The job under way. */
export interface JobRun {
  job: Job
  step: number
  startedAt: number
  stepAt: number
  /** How much of this step is done, in the step's own unit. */
  count: number
  /** Whatever the step measures from, read when it starts. */
  base: number
  /** The closest the step's machine has come to its pointer in this step: getting closer counts as progress for `Sim.idle`. */
  nearest: number
  /** Cubic metres, or things, that have arrived in a scoop, digOut or tip step, and the reading they are counted from (null before the first). */
  arrived: number
  prev: number | null
  /** For push and clear: 0 go back behind the heap (the blade lifts by itself in easy mode), 1 push it through. */
  phase: 0 | 1
  /** Passes made so far: each clearing pass takes a line a blade's width aside of the last, so the wings a heap leaves are swept too. */
  passes: number
  /** For push and clear: when the dozer first stood at the start of a pass with a machine driving across its way, or null. */
  holdFrom: number | null
  /** The heap the dozer works on, read at `at` and kept for 0.25 s: its middle, its volume and how far out from the middle it reaches. */
  heap: { x: number; z: number; volume: number; reach: number; at: number } | null
  /** Where the roller's marker is, set at `at` and kept for 0.25 s. */
  roll: { x: number; z: number; at: number } | null
  /** When the builder hops to the step's machine by itself, or null. */
  autoHopAt: number | null
  /** When a friend last sent a machine alongside or home. */
  partnerAt: number
}

/** A step as the bubble shows it: its pictures, and its progress as `done` of `of` dots. */
export interface StepView {
  pictures: readonly Picture[]
  done: number
  of: number
}

/** What the world marker shows and what the HUD asks for. */
export interface Pointer {
  /** The machine the step needs: its portrait pulses when the child is in another. */
  machine: MachineKind
  x: number
  y: number
  z: number
  /** A ring on the ground this big, or 0 for none. */
  ring: number
  /** The big button is what the step wants now. */
  press: boolean
}

export type Card =
  | { kind: 'chapter'; chapter: ChapterId }
  | { kind: 'chapterDone'; chapter: ChapterId; stars: number }
  | { kind: 'theEnd'; stars: number }

/** The celebration after a chapter's last job: the camera goes to `x, z`, the animals gather, the chapter's own show runs. */
export interface Party {
  chapter: ChapterId
  t: number
  x: number
  z: number
}

export interface Score {
  coins: number
  stars: number
}

/** A stream of stuff falling, for the effects: from a bucket, a bed, a chute, a water pipe or a plant's spout. */
export interface Stream {
  stuff: LooseKind | 'water'
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  /** 0 to 1. */
  rate: number
}

export type SimEvent =
  | { kind: 'bite'; x: number; y: number; z: number; stuff: LooseKind }
  | { kind: 'dump'; x: number; y: number; z: number; stuff: LooseKind }
  | { kind: 'tip'; x: number; y: number; z: number; stuff: LooseKind }
  | { kind: 'landed'; x: number; y: number; z: number; stuff: LooseKind }
  | { kind: 'coin'; amount: number; x: number; y: number; z: number }
  | { kind: 'hop'; from: MachineKind; to: MachineKind }
  | { kind: 'honk'; machine: MachineKind }
  | { kind: 'uhuh'; machine: MachineKind }
  | { kind: 'ack'; machine: MachineKind }
  | { kind: 'comes'; machine: MachineKind }
  | { kind: 'pick'; x: number; y: number; z: number; thing: ThingKind }
  | { kind: 'drop'; x: number; y: number; z: number; thing: ThingKind }
  | { kind: 'place'; x: number; y: number; z: number; build: number }
  | { kind: 'rolled'; x: number; z: number }
  | { kind: 'stomp'; x: number; z: number }
  | { kind: 'push'; x: number; z: number }
  | { kind: 'plantStart'; plant: PlantId }
  | { kind: 'plantThump'; plant: PlantId }
  | { kind: 'plantDone'; plant: PlantId }
  | { kind: 'water'; x: number; z: number }
  | { kind: 'mixed'; x: number; z: number }
  | { kind: 'pour'; x: number; z: number }
  | { kind: 'set'; form: number }
  | { kind: 'splash'; x: number; z: number }
  | { kind: 'stepDone'; x: number; y: number; z: number }
  | { kind: 'jobDone'; stars: number }
  | { kind: 'wish'; who: Species }
  | { kind: 'chapterDone'; chapter: ChapterId }
  | { kind: 'moveIn'; x: number; z: number; who: Species }
  | { kind: 'party'; chapter: ChapterId }
  | { kind: 'fireworks' }
  | { kind: 'hint' }

/** The driver's flight from one cab to another. */
export interface Hop {
  from: MachineKind
  to: MachineKind
  /** 0 to 1. */
  t: number
}

/** Seconds a hop takes. The child can drive the new machine at once. */
export const HOP_FOR = 0.9

/** Everything the sim holds. Plain data: a test can run it for minutes. */
export interface Sim {
  time: number
  mode: Mode
  terrain: Terrain
  machines: Machines
  active: MachineKind
  hop: Hop | null
  /** The last hop's machine and when, so "kippiauto, tule" heard as two breaths hops back. */
  lastHop: { from: MachineKind; at: number } | null
  /** When the child last hopped by their own choice (a tap, a key, a spoken name), not the job's automatic hop: only this cancels the job's hop for the step. */
  ownHopAt: number | null
  hands: Hands
  things: Thing[]
  /** The next thing's id. */
  nextThing: number
  plants: Record<PlantId, Plant>
  /** The water tower is pouring. */
  watering: boolean
  forms: Form[]
  builds: Build[]
  ponds: Pond[]
  decks: Deck[]
  animals: Animal[]
  /** The job under way, or null between jobs. */
  job: JobRun | null
  /** Story jobs done; past the end of the story the jobs come from the generator. */
  storyDone: number
  /** Jobs done after the story. */
  moreDone: number
  /** Seconds until the next job's wish shows, between jobs. */
  nextJobIn: number
  card: Card | null
  party: Party | null
  /** A chapter's party that waits for the machines it would show to drive out of its frame, and the seconds it has waited, or null. */
  partyWait: { chapter: ChapterId; t: number } | null
  score: Score
  /** Rebuilt every tick. */
  streams: Stream[]
  /** Filled by tick; the game drains it every frame. */
  events: SimEvent[]
  /** Seconds since the step last made progress (its count grew, or its machine came closer to the pointer). Honking and driving in circles do not reset it. The hints grow with it. */
  idle: number
  /** 0 to 1, the time of day: the sim eases it toward the chapter's DAY_OF; the scene lights the world from it. */
  day: number
  /** The generator's random state: any whole number. */
  seed: number
  /** The last generated job's template (an index in MORE_TEMPLATES), or -1: no template comes twice running. */
  lastTemplate: number
  /** Space was pressed in pro mode: it reaches the next frame. */
  leverTap: boolean
  /** A spoken press: the next frame's button press skips the hold and the block after a hop. */
  pressNext: boolean
  /** A spoken tap on the ground for a crane: the point is let go after one frame. */
  releasePoint: boolean
  /** A spoken "kaada" for a crane still moving its hook: the press comes once it rests. */
  cranePress: boolean
  /** Stars earned in the chapter so far, for its card. */
  chapterStars: number
  /** Sim time the card appeared. */
  cardAt: number
}

// ---------------------------------------------------------------------------------------
// The score.

/** Coins per thing done: small and often, so something always rings. */
export const COINS = { scoop: 1, tip: 2, pick: 1, place: 3, stepDone: 3, jobDone: 10, rolledMetre: 0.25, pushed: 1 } as const

/** The rank a child's stars earn: its name and hat colour show as a small hat beside the star counter, and once the story is told the driver's own hard hat turns golden. */
export const RANKS: readonly { stars: number; name: string; hat: string }[] = [
  { stars: 0, name: 'Helper', hat: '#ffd23f' },
  { stars: 10, name: 'Builder', hat: '#ff9f43' },
  { stars: 25, name: 'Big Builder', hat: '#ff5e5e' },
  { stars: 45, name: 'Boss', hat: '#5ec8ff' },
  { stars: 60, name: 'Golden Builder', hat: '#ffcf3f' },
]

// ---------------------------------------------------------------------------------------
// The paint shop and the builder.

export const PAINTS = [
  { id: 'yellow', colour: '#f7b500', price: 0 },
  { id: 'orange', colour: '#f26a21', price: 0 },
  { id: 'red', colour: '#e03a3e', price: 30 },
  { id: 'blue', colour: '#1f7fd6', price: 30 },
  { id: 'green', colour: '#2fa84f', price: 60 },
  { id: 'pink', colour: '#ff6fa8', price: 60 },
  { id: 'purple', colour: '#8a5cd6', price: 100 },
  { id: 'white', colour: '#f2f4f7', price: 100 },
  { id: 'gold', colour: '#d9a520', price: 200 },
] as const
export type PaintId = (typeof PAINTS)[number]['id']

/** The colour each machine wears until the child picks another. */
export const FIRST_PAINT: Record<MachineKind, PaintId> = { digger: 'yellow', dumper: 'orange', dozer: 'yellow', roller: 'green', mixer: 'pink', forklift: 'blue', tower: 'red', semi: 'blue', mobile: 'red' }

/** The time of day each chapter plays in: morning, noon, afternoon, sunset, night; jobs after the story are back in the morning. */
export const DAY_OF: Record<ChapterId | 'more', number> = { road: 0.12, house: 0.3, bridge: 0.48, play: 0.68, clock: 0.9, more: 0.12 }

/** Who sits in a machine's cab when a friend drives it. */
export const FRIEND_OF: Record<MachineKind, Species> = { digger: 'bear', dumper: 'pig', dozer: 'dog', roller: 'sheep', mixer: 'duck', forklift: 'frog', tower: 'cat', semi: 'cow', mobile: 'fox' }

/** The amber beacon turns: the machine is moving or its hands are at work. */
export function isWorking(m: Machine): boolean {
  if (Math.abs(m.speed) > 0.2 || m.goal !== null) return true
  switch (m.kind) {
    case 'digger':
    case 'dumper':
    case 'mixer':
    case 'forklift':
    case 'tower':
    case 'semi':
    case 'mobile':
      return m.seq !== 'rest' && (m.kind !== 'digger' || m.seq !== 'hold')
    case 'dozer':
      return m.pushing > 0
    case 'roller':
      return m.shake > 0
  }
}

/** Who can be the child's builder. */
export const DRIVER_SPECIES = ['bunny', 'cat', 'dog', 'fox', 'bear', 'frog'] as const satisfies readonly Species[]
export type DriverSpecies = (typeof DRIVER_SPECIES)[number]
export const HAT_COLOURS = ['#ffd23f', '#ff7f50', '#ff6fa8', '#5ec8ff', '#7fe07a', '#ffffff'] as const

export interface DriverLook {
  species: DriverSpecies
  hat: string
}
