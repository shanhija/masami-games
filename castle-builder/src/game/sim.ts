/**
 * Castle Builder, as plain numbers: no three.js in here, so vitest can run it for
 * minutes. The world is a round meadow island on the XZ plane, y up, with the keep at
 * the origin and a 7x7 grid of build cells around it. The hero runs about, stands next
 * to things and works on them; gathered goods fly to the yard at the foot of the keep;
 * the workshop people fetch them, make better goods and bring those back. The child
 * places pieces on the grid, the King on the keep wishes for things one at a time, and
 * the weather knocks bits off now and then for the hero to hammer back up.
 *
 * Nothing punishes. Repair is free, a fire never spreads, a storm always ends with a
 * rainbow, and every tap on anything makes something happen.
 */

import { mulberry32 } from './random'

// ---------------------------------------------------------------------------- goods

/** Raw goods come off the meadow; made goods come out of a workshop. */
export type Raw = 'wood' | 'stone' | 'ore' | 'wool' | 'flowers'
export type Made = 'planks' | 'blocks' | 'iron' | 'cloth' | 'colourcloth'
export type Good = Raw | Made
export const GOODS: readonly Good[] = ['wood', 'stone', 'ore', 'wool', 'flowers', 'planks', 'blocks', 'iron', 'cloth', 'colourcloth']

/** What stands on the meadow to gather from. A lost banner is a banner the wind took, lying where it landed. */
export type NodeKind = 'tree' | 'rock' | 'ore' | 'sheep' | 'flowers' | 'lostbanner'
export const NODE_KINDS: readonly NodeKind[] = ['tree', 'rock', 'ore', 'sheep', 'flowers', 'lostbanner']
export const NODE_GOOD: Record<NodeKind, Good> = { tree: 'wood', rock: 'stone', ore: 'ore', sheep: 'wool', flowers: 'flowers', lostbanner: 'colourcloth' }
/** How many units a node gives before it is bare, and how long it takes to grow back. */
export const NODE_MAX: Record<NodeKind, number> = { tree: 3, rock: 3, ore: 2, sheep: 2, flowers: 2, lostbanner: 1 }
export const REGROW: Record<NodeKind, number> = { tree: 40, rock: 30, ore: 35, sheep: 40, flowers: 25, lostbanner: 0 }

// --------------------------------------------------------------------------- pieces

export type Workshop = 'woodcutter' | 'mason' | 'smithy' | 'weaver' | 'dyer'
export type Building = 'wall' | 'tower' | 'gate' | 'room' | 'hall' | 'garden' | 'banner' | 'belltower'
export type PieceKind = Building | Workshop
export const WORKSHOPS: readonly Workshop[] = ['woodcutter', 'mason', 'smithy', 'weaver', 'dyer']
export const PIECE_KINDS: readonly PieceKind[] = ['wall', 'tower', 'gate', 'room', 'hall', 'garden', 'banner', 'belltower', 'woodcutter', 'mason', 'smithy', 'weaver', 'dyer']
export const isWorkshop = (kind: PieceKind): kind is Workshop => (WORKSHOPS as readonly string[]).includes(kind)

export type Cost = Partial<Record<Good, number>>
export const costEntries = (cost: Cost) => Object.entries(cost) as [Good, number][]
/** What a piece costs: at most two kinds, one to three each, so a child can count the pictures. */
export const COST: Record<PieceKind, Cost> = {
  wall: { blocks: 1 },
  tower: { blocks: 2, planks: 1 },
  gate: { blocks: 2, iron: 1 },
  room: { blocks: 2, planks: 2 },
  hall: { blocks: 3, colourcloth: 3 },
  garden: { flowers: 2 },
  banner: { colourcloth: 1 },
  belltower: { blocks: 2, iron: 2 },
  woodcutter: { wood: 2 },
  mason: { wood: 2 },
  smithy: { planks: 2, stone: 1 },
  weaver: { planks: 2 },
  dyer: { planks: 1, blocks: 1 },
}
/** Cells along each side: the dance hall is the one big piece. */
export const SIZE: Record<PieceKind, 1 | 2> = { wall: 1, tower: 1, gate: 1, room: 1, hall: 2, garden: 1, banner: 1, belltower: 1, woodcutter: 1, mason: 1, smithy: 1, weaver: 1, dyer: 1 }
/** How tall the walkable top of each piece is: the hero and the workers climb over everything. */
export const HEIGHT: Record<PieceKind, number> = { wall: 2.2, tower: 4, gate: 3, room: 3, hall: 4, garden: 0, banner: 0, belltower: 4.6, woodcutter: 2.8, mason: 2.8, smithy: 2.8, weaver: 2.8, dyer: 2.8 }
/** A tower grows a storey at a time, this much taller each, for this many blocks. */
export const STOREY_H = 1.4
export const MAX_STOREYS = 3
export const STOREY_COST = 2
/** Lightning sets these on fire; everything else it only breaks. */
export const WOODEN: readonly PieceKind[] = ['gate', 'room', 'hall', 'woodcutter', 'mason', 'smithy', 'weaver', 'dyer']
/** Colour cloth paints these. */
export const PAINTABLE: readonly PieceKind[] = ['tower', 'gate', 'room', 'hall', 'banner', 'belltower']
/** Lightning likes towers three times as much as anything else. */
export const STRIKE_WEIGHT: Record<PieceKind, number> = { wall: 1, tower: 3, gate: 1, room: 1, hall: 1, garden: 0, banner: 0, belltower: 0, woodcutter: 1, mason: 1, smithy: 1, weaver: 1, dyer: 1 }

export interface Recipe {
  inputs: Cost
  output: Made
  /** How long the person works on one unit at the bench. */
  seconds: number
}
export const RECIPE: Record<Workshop, Recipe> = {
  woodcutter: { inputs: { wood: 1 }, output: 'planks', seconds: 2.5 },
  mason: { inputs: { stone: 1 }, output: 'blocks', seconds: 2.5 },
  smithy: { inputs: { ore: 1 }, output: 'iron', seconds: 3 },
  weaver: { inputs: { wool: 1 }, output: 'cloth', seconds: 2.5 },
  dyer: { inputs: { cloth: 1, flowers: 1 }, output: 'colourcloth', seconds: 2.5 },
}
/** A workshop stops when the yard holds this many of what it makes: numbers stay small enough to count. */
export const OUTPUT_CAP = 9

/** The four dye colours: red, yellow, blue, purple. Flowers, dye pots, banners, dresses and confetti all use them. */
export type Colour = 0 | 1 | 2 | 3
export const COLOURS: readonly Colour[] = [0, 1, 2, 3]
/** A piece in its natural colours, not painted. */
export const UNPAINTED = -1

export type PieceState = 'ok' | 'burning' | 'broken'

export interface Piece {
  id: number
  kind: PieceKind
  /** Top-left cell; a size-2 piece also covers col + 1 and row + 1. */
  col: number
  row: number
  /** UNPAINTED, or a Colour for a banner or a painted roof. */
  colour: number
  /** Towers only, 1 to MAX_STOREYS. */
  storeys: number
  state: PieceState
  /** Sim time it was placed or last repaired: a fresh piece is safe from the weather for SAFE_FOR. */
  builtAt: number
  /** Sim time the state last changed: when the fire started, when it broke. */
  stateAt: number
  /** Progress of the repair or the dousing under way, 0 to 1. */
  repair: number
  /** Sim time a fire on it was last put out, or -1: the steam puff. */
  dousedAt: number
}

// --------------------------------------------------------------------------- people

export interface Hero {
  x: number
  z: number
  /** Height of whatever the hero stands on: 0 on the meadow, a piece's top on the castle. */
  y: number
  /** Radians, 0 along +X. */
  facing: number
  moving: boolean
  /** What the keys say, a unit vector or zero. */
  input: { dx: number; dz: number }
  /** Where a tap sent the hero, and how close counts as there. */
  target: { x: number; z: number; stop: number } | null
  /** The node the hero was sent to work on, or -1: it is preferred over whatever else is in reach. */
  focus: number
  job: Job | null
  /** Sim time of the last little hop, for the boing. */
  hopAt: number
  /** Sim time the hero last came to a stop: the crown slides over the eyes for a moment. */
  stoppedAt: number
  /** Sim time of the last swing of the tool, for the animation. */
  swungAt: number
}

export type JobKind = 'gather' | 'repair' | 'douse'
export interface Job {
  kind: JobKind
  /** Node id for gather, piece id otherwise. */
  id: number
  /** Seconds of gathering since the last unit came off. */
  progress: number
  swings: number
}

export type WorkerState = 'wait' | 'fetch' | 'carry' | 'work'
export interface Worker {
  id: number
  piece: number
  kind: Workshop
  x: number
  z: number
  y: number
  facing: number
  /** wait: at the door, sitting if the yard has nothing for them. fetch: walking to the yard. carry: walking back with the goods. work: at the bench. */
  state: WorkerState
  stateAt: number
  carrying: Good | null
  /** Sim time of the last unit made: the person cheers for a moment. */
  madeAt: number
}

export type SheepState = 'graze' | 'follow' | 'huddle' | 'flipped'

export interface Node {
  id: number
  kind: NodeKind
  x: number
  z: number
  /** Units still on it; 0 is bare, growing back at regrowAt. */
  left: number
  regrowAt: number
  /** Sim time of the last swing at it: it wobbles. */
  hitAt: number
  /** Fixed per node, for the scene to vary the shape. */
  seed: number
  /** A lost banner: the banner piece it came off and its colour. */
  piece: number
  colour: number
  /** Sheep only: where it lives and roams, where it is heading, when it last hopped, whether the wind rolled it over. */
  hx: number
  hz: number
  tx: number
  tz: number
  wanderAt: number
  hopAt: number
  state: SheepState
  stateAt: number
}

// -------------------------------------------------------------------------- weather

/**
 * clear: sun. warning: the grumpy cloud drifts in, the sky dims, the sheep run for the
 * castle. thunder: one bolt, then rain. wind: everything leans, a banner flies, a wall
 * top comes off, the sheep roll over. rainbow: the cloud smiles and leaves.
 */
export type Weather = 'clear' | 'warning' | 'thunder' | 'wind' | 'rainbow'
export type Storm = 'thunder' | 'wind'

export interface Flight {
  id: number
  good: Good
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  at: number
  golden: boolean
}

export interface Puddle {
  id: number
  x: number
  z: number
  at: number
  splashedAt: number
}

/** Everything the build bar can hold: a piece to put down, the brush, or the hand that takes pieces back. */
export type BarKind = PieceKind | 'paint' | 'lift'
/** What the build bar has in hand, or nothing. */
export type Selection = BarKind | null
export type Phase = 'ready' | 'play'

export interface Wish {
  kind: PieceKind
  count: number
}
/** What the King asks for, in order. Each wish unlocks its piece in the build bar when it appears. */
export const WISHES: readonly Wish[] = [
  { kind: 'mason', count: 1 },
  { kind: 'wall', count: 3 },
  { kind: 'woodcutter', count: 1 },
  { kind: 'tower', count: 1 },
  { kind: 'smithy', count: 1 },
  { kind: 'gate', count: 1 },
  { kind: 'room', count: 2 },
  { kind: 'weaver', count: 1 },
  { kind: 'dyer', count: 1 },
  { kind: 'banner', count: 2 },
  { kind: 'garden', count: 1 },
  { kind: 'hall', count: 1 },
  { kind: 'belltower', count: 1 },
  { kind: 'tower', count: 3 },
  { kind: 'room', count: 4 },
  { kind: 'banner', count: 4 },
]

export type EventKind =
  | 'start'
  | 'swing'
  | 'gather'
  | 'golden'
  | 'regrow'
  | 'landed'
  | 'fetch'
  | 'work'
  | 'made'
  | 'select'
  | 'place'
  | 'lifted'
  | 'cannot'
  | 'repairTick'
  | 'repaired'
  | 'douseTick'
  | 'fireOut'
  | 'ignite'
  | 'broke'
  | 'lightning'
  | 'bong'
  | 'stormWarn'
  | 'stormStart'
  | 'rainStart'
  | 'rainbow'
  | 'blown'
  | 'chipped'
  | 'wish'
  | 'newWish'
  | 'allWishes'
  | 'cheer'
  | 'hop'
  | 'baa'
  | 'sheepFlip'
  | 'sheepUp'
  | 'grow'
  | 'paint'
  | 'dye'
  | 'splash'
  | 'keepGrew'
export interface SimEvent {
  kind: EventKind
  x: number
  z: number
  good: Good | null
  piece: PieceKind | null
  node: NodeKind | null
}

export interface Sim {
  time: number
  phase: Phase
  hero: Hero
  store: Record<Good, number>
  nodes: Node[]
  pieces: Piece[]
  /** GRID * GRID entries, row-major: the id of the piece on the cell, 0 for free, RESERVED for the keep and the yard. */
  cells: number[]
  workers: Worker[]
  flights: Flight[]
  puddles: Puddle[]
  selected: Selection
  /** The dyer's pot: what colour the next banner or coat of paint comes out. */
  dye: Colour
  /** The missing good the child last asked for, and when: the scene points at where it comes from for a moment. */
  hint: { good: Good; at: number } | null
  wishIndex: number
  wishDoneAt: number
  weather: Weather
  weatherAt: number
  storm: Storm
  storms: number
  lastStormEndAt: number
  /** The parent's switch in the pause menu. */
  stormsOn: boolean
  rainUntil: number
  /** True once this storm's bolt, gust and gust of chips have happened. */
  struck: boolean
  blew: boolean
  chipped: boolean
  tumbled: boolean
  /** The last bolt: when and where it hit, and how high the piece was, for the flash and the zigzag. */
  lightning: { at: number; x: number; z: number; y: number }
  /** The grumpy cloud's spot over the island: it comes in from the east and leaves the same way. */
  cloud: { x: number; z: number }
  /** Sim time everybody last cheered: every person hops for a moment. */
  cheerAt: number
  /** The camera circles the castle until this sim time; storms wait for it. */
  orbitUntil: number
  bongAt: number
  keepLevel: number
  nextId: number
  /** What happened this tick, for sounds and one-shot effects. The driver drains it every frame. */
  events: SimEvent[]
  random: () => number
}

// ------------------------------------------------------------------------- constants

export const GRID = 7
export const CELL = 4
export const GRID_MIN = -(GRID * CELL) / 2
export const KEEP_COL = 3
export const KEEP_ROW = 3
export const YARD_COL = 3
export const YARD_ROW = 4
export const RESERVED = -1
/** Where goods land and workers fetch from: the yard in front of the keep. */
export const YARD_X = 0
export const YARD_Z = 4.4
/** The keep is the one thing nobody walks through. */
export const KEEP_R = 2.4
export const ISLAND_R = 32
/** Nodes stand in a ring outside the grid's corners, sorted by kind around the island. */
export const NODE_R_MIN = 21.5
export const NODE_R_MAX = 28
export const HERO_SPEED = 6.5
export const WORKER_SPEED = 3.4
export const SHEEP_SPEED = 1.3
export const SHEEP_RUN = 4
/** The hero works on a node within this of its centre, and on a piece within this of its cell's edge. */
export const REACH = 2.6
export const PIECE_REACH = 1.6
/** Two swings per unit gathered; the swing is what makes the tree wobble and the chop sound. */
export const SWING = 0.6
export const SWINGS_PER_UNIT = 2
/** Now and then a gathered unit is golden and counts for three. */
export const GOLDEN_CHANCE = 1 / 15
export const GOLDEN_WORTH = 3
export const REPAIR_FOR = 3
/** A tap on a broken or burning piece with the hero in reach is this many seconds of hammering or one more bucket. */
export const TAP_HELPS = 0.5
export const DOUSE_FOR = 2
/** A fire burns this long, then the piece is broken. Rain puts it out in RAIN_DOUSE. */
export const FIRE_FOR = 10
export const RAIN_DOUSE = 4
export const FLIGHT_FOR = 0.9
/** One day in seconds; the evening starts at NIGHT_FROM and is over at dawn. Storms are a daytime thing. */
export const DAY = 300
export const NIGHT_FROM = 0.7
export const DAWN_FROM = 0.95
export const STORM_MIN_PIECES = 6
export const STORM_EVERY = 150
export const FIRST_STORM_AFTER = 90
export const WARN_FOR = 6
export const THUNDER_FOR = 24
export const WIND_FOR = 20
export const RAINBOW_FOR = 10
export const LIGHTNING_AT = 5
export const RAIN_AT = 7
export const BLOW_AT = 3
export const CHIP_AT = 9
export const TUMBLE_AT = 2
/** A piece built or repaired this recently is never struck or chipped. */
export const SAFE_FOR = 30
export const PUDDLES = 5
export const PUDDLE_FOR = 60
/** The look button and a finished wish circle the castle for this long; the weather waits for it. */
export const ORBIT_FOR = 7
/** A hint (the arrow in the world, the wiggle in the build bar) lasts this long after `hint.at`. */
export const HINT_FOR = 4
export const CLOUD_FAR_X = 46
export const SHEEP_ROAM = 5
export const SHEEP_FOLLOW_FOR = 12
/** A sheep on its back wiggles this long before it manages on its own. */
export const SHEEP_FLIP_FOR = 60
/** The keep grows a storey for every this many pieces, up to this many storeys. */
export const KEEP_EVERY = 5
export const KEEP_MAX_LEVEL = 4
/** What the yard starts with: enough for the first wish in the first fifteen seconds. */
export const STARTING_STORE: Cost = { wood: 3, stone: 3 }
export const SAVE_VERSION = 1

// ------------------------------------------------------------------------- geometry

export const cellIndex = (col: number, row: number) => row * GRID + col
export const inGrid = (col: number, row: number) => col >= 0 && col < GRID && row >= 0 && row < GRID
/** The cell under a world point, or null off the grid. */
export function cellAt(x: number, z: number): { col: number; row: number } | null {
  const col = Math.floor((x - GRID_MIN) / CELL)
  const row = Math.floor((z - GRID_MIN) / CELL)
  return inGrid(col, row) ? { col, row } : null
}
export const cellCentre = (col: number, row: number) => ({ x: GRID_MIN + (col + 0.5) * CELL, z: GRID_MIN + (row + 0.5) * CELL })
/** World centre of a piece, whatever its size. */
export const pieceCentre = (p: Piece) => ({ x: GRID_MIN + (p.col + SIZE[p.kind] / 2) * CELL, z: GRID_MIN + (p.row + SIZE[p.kind] / 2) * CELL })
/** Height of the top of a piece: towers grow, broken pieces have lost their top. */
export function pieceTop(p: Piece) {
  const h = HEIGHT[p.kind] + (p.kind === 'tower' ? (p.storeys - 1) * STOREY_H : 0)
  return p.state === 'broken' ? h * 0.75 : h
}
/**
 * Where a workshop's person stands: at the door on the front, or, when the keep is in
 * the way, on the back or a side. Every spot is a step clear of the walls of its own
 * workshop, so nobody ends up on their own roof.
 */
export function doorOf(p: Piece) {
  const c = pieceCentre(p)
  const out = (SIZE[p.kind] * CELL) / 2 + 0.7
  const sides = [
    { x: c.x, z: c.z + out },
    { x: c.x, z: c.z - out },
    { x: c.x + out, z: c.z },
    { x: c.x - out, z: c.z },
  ]
  const door = sides.find((d) => Math.hypot(d.x, d.z) >= KEEP_R + 0.6)
  if (!door) throw new Error(`no door for a ${p.kind} at ${p.col}, ${p.row}`)
  return door
}
export function pieceById(s: Sim, id: number): Piece {
  const p = s.pieces.find((p) => p.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}
export function nodeById(s: Sim, id: number): Node {
  const n = s.nodes.find((n) => n.id === id)
  if (!n) throw new Error(`no node ${id}`)
  return n
}
/** Height of the ground at a world point: the meadow, or the top of the piece there. */
export function groundAt(s: Sim, x: number, z: number) {
  const c = cellAt(x, z)
  if (!c) return 0
  const id = s.cells[cellIndex(c.col, c.row)]!
  return id > 0 ? pieceTop(pieceById(s, id)) : 0
}
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz)
/** Whether a world point is within `reach` of a piece's footprint. */
export function nearPiece(p: Piece, x: number, z: number, reach: number) {
  const half = (SIZE[p.kind] * CELL) / 2
  const c = pieceCentre(p)
  return Math.abs(x - c.x) < half + reach && Math.abs(z - c.z) < half + reach
}
export const dayFrac = (s: Sim) => (s.time % DAY) / DAY
export const isNight = (s: Sim) => dayFrac(s) >= NIGHT_FROM
/** How hard the wind blows right now, 0 to 1: the scene leans everything by it. */
export function windStrength(s: Sim) {
  const since = s.time - s.weatherAt
  if (s.weather === 'wind') return Math.min(1, since / 2) * Math.min(1, (WIND_FOR - since) / 2)
  if (s.weather === 'warning') return 0.3 * Math.min(1, since / WARN_FOR)
  if (s.weather === 'thunder') return 0.4
  return 0
}
export const raining = (s: Sim) => s.time < s.rainUntil
export const count = (s: Sim, kind: PieceKind) => s.pieces.filter((p) => p.kind === kind).length
export const hallOf = (s: Sim) => s.pieces.find((p) => p.kind === 'hall' && p.state === 'ok') ?? null

// ---------------------------------------------------------------------------- setup

const freshHero = (): Hero => ({ x: 0, z: 12, y: 0, facing: -Math.PI / 2, moving: false, input: { dx: 0, dz: 0 }, target: null, focus: -1, job: null, hopAt: -1, stoppedAt: 0, swungAt: -1 })

function freshStore(): Record<Good, number> {
  const store = Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<Good, number>
  for (const [g, n] of costEntries(STARTING_STORE)) store[g] = n
  return store
}

/** Every scalar at its starting value. The hero, the lists and the store are objects of their own. */
function freshFields(random: () => number) {
  return {
    time: 0,
    phase: 'ready' as Phase,
    selected: null as Selection,
    dye: 0 as Colour,
    hint: null,
    wishIndex: 0,
    wishDoneAt: -1,
    weather: 'clear' as Weather,
    weatherAt: 0,
    storm: 'thunder' as Storm,
    storms: 0,
    lastStormEndAt: -STORM_EVERY + FIRST_STORM_AFTER,
    stormsOn: true,
    rainUntil: -1,
    struck: false,
    blew: false,
    chipped: false,
    tumbled: false,
    lightning: { at: -1, x: 0, z: 0, y: 0 },
    cloud: { x: CLOUD_FAR_X, z: -6 },
    cheerAt: -1,
    orbitUntil: -1,
    bongAt: -1,
    keepLevel: 0,
    nextId: 1,
    random,
  }
}

/**
 * The meadow: each kind of node has its own side of the island, so the child learns
 * where wood is. Laid from a fixed seed, so the island is the same every visit.
 */
function plantNodes(s: Sim) {
  const rand = mulberry32(7)
  const lay = (kind: NodeKind, n: number, a0: number, a1: number) => {
    for (let i = 0; i < n; i++) {
      const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n + (rand() - 0.5) * ((a1 - a0) / n) * 0.6) * Math.PI) / 180
      const r = NODE_R_MIN + rand() * (NODE_R_MAX - NODE_R_MIN)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      s.nodes.push({ id: s.nextId++, kind, x, z, left: NODE_MAX[kind], regrowAt: -1, hitAt: -1, seed: Math.floor(rand() * 1e6), piece: -1, colour: UNPAINTED, hx: x, hz: z, tx: x, tz: z, wanderAt: 0, hopAt: -1, state: 'graze', stateAt: 0 })
    }
  }
  // Angles run clockwise seen from above with +Z toward the camera: the forest is at the back left, the sheep at the front.
  lay('tree', 9, 190, 260)
  lay('rock', 6, 270, 320)
  lay('ore', 5, 325, 370)
  lay('flowers', 6, 10, 55)
  lay('sheep', 6, 65, 115)
  lay('tree', 3, 125, 150)
  lay('flowers', 2, 160, 180)
}

export function createSim(random: () => number): Sim {
  const s: Sim = {
    ...freshFields(random),
    hero: freshHero(),
    store: freshStore(),
    nodes: [],
    pieces: [],
    cells: Array.from({ length: GRID * GRID }, () => 0),
    workers: [],
    flights: [],
    puddles: [],
    events: [],
  }
  s.cells[cellIndex(KEEP_COL, KEEP_ROW)] = RESERVED
  s.cells[cellIndex(YARD_COL, YARD_ROW)] = RESERVED
  plantNodes(s)
  return s
}

/** Back to a fresh island, in place: the scene holds on to the sim object. */
export function resetSim(s: Sim, random: () => number) {
  const fresh = createSim(random)
  Object.assign(s, fresh)
  s.events = []
}

/** The whole game as JSON, for the browser to keep. */
export function serialize(s: Sim): string {
  const { random, events, ...rest } = s
  void random
  void events
  return JSON.stringify({ version: SAVE_VERSION, ...rest })
}

/**
 * Restores a saved game into the sim in place, and says whether the text was a castle it
 * could read: text that is not a castle from this version is left alone and the sim stays
 * fresh, so a damaged save is one visit to a new island, not a blank screen.
 */
export function restore(s: Sim, json: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null) return false
  const saved = parsed as { version: number } & Partial<Sim>
  if (saved.version !== SAVE_VERSION) return false
  const { version, ...rest } = saved
  void version
  Object.assign(s, rest)
  s.events = []
  s.phase = 'ready'
  s.selected = null
  s.hero.input = { dx: 0, dz: 0 }
  s.hero.target = null
  s.hero.job = null
  // A new day over the castle: sunshine, the cloud far away, and as long as on a fresh island before the first storm.
  s.weather = 'clear'
  s.weatherAt = s.time
  s.rainUntil = -1
  s.lastStormEndAt = s.time - STORM_EVERY + FIRST_STORM_AFTER
  s.cloud = { x: CLOUD_FAR_X, z: -6 }
  return true
}

const ev = (s: Sim, kind: EventKind, x: number, z: number, extra: Partial<Pick<SimEvent, 'good' | 'piece' | 'node'>> = {}) => {
  s.events.push({ kind, x, z, good: null, piece: null, node: null, ...extra })
}

// ---------------------------------------------------------------------------- input

/** The keys: a direction to run in, or zero. Running cancels any tap target. */
export function setMove(s: Sim, dx: number, dz: number) {
  const d = Math.hypot(dx, dz)
  s.hero.input = d > 0 ? { dx: dx / d, dz: dz / d } : { dx: 0, dz: 0 }
}

/** A tap on the ground: run there. */
export function walkTo(s: Sim, x: number, z: number) {
  const r = Math.hypot(x, z)
  const k = r > ISLAND_R - 1.5 ? (ISLAND_R - 1.5) / r : 1
  s.hero.target = { x: x * k, z: z * k, stop: 0.25 }
  s.hero.focus = -1
}

/** A tap on a node: run up to it and work on it. A sheep also hops and baas. */
export function tapNode(s: Sim, id: number) {
  const n = nodeById(s, id)
  if (n.kind === 'sheep') poke(s, n)
  s.hero.target = { x: n.x, z: n.z, stop: REACH - 0.8 }
  s.hero.focus = id
}

function poke(s: Sim, n: Node) {
  n.hopAt = s.time
  ev(s, 'baa', n.x, n.z, { node: 'sheep' })
  if (n.state === 'graze') {
    const a = s.random() * Math.PI * 2
    n.tx = n.hx + Math.cos(a) * SHEEP_ROAM
    n.tz = n.hz + Math.sin(a) * SHEEP_ROAM
    n.wanderAt = s.time + 3
  }
}

/** A tap on the keep: the bell rings and everybody hops. */
export function tapKeep(s: Sim) {
  s.bongAt = s.time
  s.cheerAt = s.time
  ev(s, 'bong', 0, 0)
}

/**
 * A tap on a piece. With the hand chosen the piece comes back up. The dyer's pot changes
 * colour whatever is in hand, so the brush can follow it. With the brush chosen the piece
 * is painted. Broken or burning, the hero runs to it, and a tap with the hero already
 * there is one more hammer blow or bucket. A tower grows a storey for two blocks. The
 * bell tower rings. Anything else, the hero just runs there.
 */
export function tapPiece(s: Sim, id: number) {
  const p = pieceById(s, id)
  const c = pieceCentre(p)
  const h = s.hero
  if (s.selected === 'lift') {
    lift(s, p)
    return
  }
  if (p.kind === 'dyer' && p.state === 'ok') {
    s.dye = ((s.dye + 1) % 4) as Colour
    ev(s, 'dye', c.x, c.z, { piece: 'dyer' })
    return
  }
  if (s.selected === 'paint') {
    if (!PAINTABLE.includes(p.kind)) {
      ev(s, 'cannot', c.x, c.z, { piece: p.kind })
      return
    }
    if (p.colour === s.dye) return
    if (s.store.colourcloth < 1) {
      cannot(s, 'colourcloth', c.x, c.z)
      return
    }
    s.store.colourcloth -= 1
    p.colour = s.dye
    ev(s, 'paint', c.x, c.z, { piece: p.kind })
    return
  }
  if (p.state !== 'ok') {
    if (nearPiece(p, h.x, h.z, PIECE_REACH) && h.job && h.job.id === id) {
      p.repair += TAP_HELPS / (p.state === 'broken' ? REPAIR_FOR : DOUSE_FOR)
      ev(s, p.state === 'broken' ? 'repairTick' : 'douseTick', c.x, c.z, { piece: p.kind })
      finishJob(s, p)
    } else {
      goToPiece(s, p)
    }
    return
  }
  switch (p.kind) {
    case 'tower':
      if (p.storeys >= MAX_STOREYS) break
      if (s.store.blocks < STOREY_COST) {
        cannot(s, 'blocks', c.x, c.z)
        return
      }
      s.store.blocks -= STOREY_COST
      p.storeys += 1
      p.builtAt = s.time
      s.cheerAt = s.time
      ev(s, 'grow', c.x, c.z, { piece: 'tower' })
      return
    case 'belltower':
      s.bongAt = s.time
      s.cheerAt = s.time
      ev(s, 'bong', c.x, c.z, { piece: 'belltower' })
      return
    default:
      break
  }
  goToPiece(s, p)
}

function goToPiece(s: Sim, p: Piece) {
  const c = pieceCentre(p)
  s.hero.target = { x: c.x, z: c.z, stop: (SIZE[p.kind] * CELL) / 2 + PIECE_REACH - 0.6 }
  s.hero.focus = -1
}

/**
 * The hand takes a piece back up: its cells are free again and every good that went into
 * it comes home, so a full grid or a piece in the wrong place is never the end of the
 * game. A workshop's person goes with it, and brings back whatever they had fetched.
 */
function lift(s: Sim, p: Piece) {
  const c = pieceCentre(p)
  const size = SIZE[p.kind]
  for (const [g, n] of costEntries(COST[p.kind])) s.store[g] += n
  // A tower hands back the storeys the child paid extra blocks for as well.
  if (p.kind === 'tower') s.store.blocks += (p.storeys - 1) * STOREY_COST
  for (let r = p.row; r < p.row + size; r++) for (let col = p.col; col < p.col + size; col++) s.cells[cellIndex(col, r)] = 0
  s.pieces.splice(s.pieces.indexOf(p), 1)
  const person = s.workers.find((w) => w.piece === p.id)
  if (person) {
    if (person.carrying !== null) for (const [g, n] of costEntries(RECIPE[person.kind].inputs)) s.store[g] += n
    s.workers.splice(s.workers.indexOf(person), 1)
  }
  const lost = s.nodes.find((n) => n.kind === 'lostbanner' && n.piece === p.id)
  if (lost) {
    // The cloth out in the meadow has no pole to fly back to: it comes home to the yard.
    s.store.colourcloth += 1
    s.nodes.splice(s.nodes.indexOf(lost), 1)
  }
  if (s.hero.job && s.hero.job.id === p.id) s.hero.job = null
  s.keepLevel = Math.min(KEEP_MAX_LEVEL, Math.floor(s.pieces.length / KEEP_EVERY))
  ev(s, 'lifted', c.x, c.z, { piece: p.kind })
}

/** A build button. Picking a piece the yard cannot pay for still picks it, and says what is missing. */
export function select(s: Sim, sel: Selection) {
  s.selected = s.selected === sel ? null : sel
  const chosen = s.selected
  if (chosen === null) return
  const kind = chosen === 'paint' || chosen === 'lift' ? null : chosen
  ev(s, 'select', s.hero.x, s.hero.z, { piece: kind })
  // The hand costs nothing; the brush wants a colour cloth; a piece wants what it is made of.
  const missing = kind ? affordable(s, kind) : chosen === 'paint' && s.store.colourcloth < 1 ? 'colourcloth' : null
  if (missing) cannot(s, missing, s.hero.x, s.hero.z)
}

function cannot(s: Sim, good: Good, x: number, z: number) {
  s.hint = { good, at: s.time }
  ev(s, 'cannot', x, z, { good })
}

/** The first good the yard is short of for this piece, or null when it can be paid for. */
export function affordable(s: Sim, kind: PieceKind): Good | null {
  for (const [g, n] of costEntries(COST[kind])) if (s.store[g] < n) return g
  return null
}

/** Whether the yard cannot pay for a build button: the hand is free, the brush wants a colour cloth, a piece wants what it is made of. */
export const cannotPay = (s: Sim, kind: BarKind) => (kind === 'lift' ? false : kind === 'paint' ? s.store.colourcloth < 1 : affordable(s, kind) !== null)

/** Whether every cell the piece would cover is on the grid and free. */
export function canPlace(s: Sim, kind: PieceKind, col: number, row: number) {
  const size = SIZE[kind]
  for (let r = row; r < row + size; r++) for (let c = col; c < col + size; c++) if (!inGrid(c, r) || s.cells[cellIndex(c, r)] !== 0) return false
  return true
}

/**
 * Which pieces the build bar shows: everything the King has wished for so far, the brush
 * once the dyer is in, and the hand as soon as there is anything to take back.
 */
export function unlocked(s: Sim): BarKind[] {
  const kinds: BarKind[] = []
  const upTo = Math.min(WISHES.length - 1, s.wishIndex)
  for (let i = 0; i <= upTo; i++) if (!kinds.includes(WISHES[i]!.kind)) kinds.push(WISHES[i]!.kind)
  if (s.wishIndex >= WISHES.length) for (const k of PIECE_KINDS) if (!kinds.includes(k)) kinds.push(k)
  if (kinds.includes('dyer')) kinds.push('paint')
  if (s.pieces.length > 0) kinds.push('lift')
  return kinds
}

export const currentWish = (s: Sim): Wish | null => WISHES[s.wishIndex] ?? null
export const wishProgress = (s: Sim) => {
  const w = currentWish(s)
  return w ? Math.min(w.count, count(s, w.kind)) : 0
}

/** The piece in hand, or null when the brush, the hand or nothing is chosen. */
export const chosenPiece = (s: Sim): PieceKind | null => (s.selected === null || s.selected === 'paint' || s.selected === 'lift' ? null : s.selected)

/** Where the chosen piece would go if placed now: the free spot nearest the hero, or null when the grid is full. */
export function ghostCell(s: Sim): { col: number; row: number } | null {
  const kind = chosenPiece(s)
  if (!kind) return null
  const size = SIZE[kind]
  let best: { col: number; row: number } | null = null
  let bestD = Infinity
  for (let row = 0; row <= GRID - size; row++) {
    for (let col = 0; col <= GRID - size; col++) {
      if (!canPlace(s, kind, col, row)) continue
      const cx = GRID_MIN + (col + size / 2) * CELL
      const cz = GRID_MIN + (row + size / 2) * CELL
      const d = dist(cx, cz, s.hero.x, s.hero.z)
      if (d < bestD) {
        bestD = d
        best = { col, row }
      }
    }
  }
  return best
}

/** A tap on a cell with a piece chosen: the piece goes there, or the yard says what is missing. */
export function place(s: Sim, col: number, row: number): boolean {
  const kind = chosenPiece(s)
  if (!kind) return false
  const size = SIZE[kind]
  // The tapped cell is the top left corner when the big piece fits there; otherwise it fits with the tap inside it.
  let at: { col: number; row: number } | null = canPlace(s, kind, col, row) ? { col, row } : null
  for (let r = row - size + 1; r <= row && !at; r++) for (let c = col - size + 1; c <= col && !at; c++) if (canPlace(s, kind, c, r)) at = { col: c, row: r }
  const centre = cellCentre(col, row)
  if (!at) {
    ev(s, 'cannot', centre.x, centre.z, { piece: kind })
    return false
  }
  const missing = affordable(s, kind)
  if (missing) {
    cannot(s, missing, centre.x, centre.z)
    return false
  }
  for (const [g, n] of costEntries(COST[kind])) s.store[g] -= n
  const p: Piece = { id: s.nextId++, kind, col: at.col, row: at.row, colour: kind === 'banner' ? s.dye : UNPAINTED, storeys: 1, state: 'ok', builtAt: s.time, stateAt: s.time, repair: 0, dousedAt: -1 }
  s.pieces.push(p)
  for (let r = at.row; r < at.row + size; r++) for (let c = at.col; c < at.col + size; c++) s.cells[cellIndex(c, r)] = p.id
  const pc = pieceCentre(p)
  if (isWorkshop(kind)) s.workers.push({ id: s.nextId++, piece: p.id, kind, x: doorOf(p).x, z: doorOf(p).z, y: 0, facing: Math.PI / 2, state: 'wait', stateAt: s.time, carrying: null, madeAt: -1 })
  s.cheerAt = s.time
  ev(s, 'place', pc.x, pc.z, { piece: kind })
  const level = Math.min(KEEP_MAX_LEVEL, Math.floor(s.pieces.length / KEEP_EVERY))
  if (level > s.keepLevel) {
    s.keepLevel = level
    ev(s, 'keepGrew', 0, 0)
  }
  return true
}

/** The big button: starts the game, places the chosen piece where the ghost is, or just hops. */
export function press(s: Sim) {
  if (s.phase === 'ready') {
    s.phase = 'play'
    ev(s, 'start', s.hero.x, s.hero.z)
    return
  }
  const kind = chosenPiece(s)
  if (kind) {
    const g = ghostCell(s)
    if (g) place(s, g.col, g.row)
    else ev(s, 'cannot', s.hero.x, s.hero.z, { piece: kind })
    return
  }
  s.hero.hopAt = s.time
  ev(s, 'hop', s.hero.x, s.hero.z)
}

/** The look button: the camera circles the castle for a while, and the weather waits. */
export function look(s: Sim) {
  s.orbitUntil = s.time + ORBIT_FOR
}

/** The parent's switch. Turned off, the cloud gives up on the spot and leaves with its rainbow. */
export function setStorms(s: Sim, on: boolean) {
  s.stormsOn = on
  if (on || s.weather === 'clear' || s.weather === 'rainbow') return
  s.rainUntil = -1
  endStorm(s)
}

/** Where a good comes from, for the hint arrow: the nodes for a raw good, the workshop that makes a made one. */
export function sourceOf(s: Sim, good: Good): { x: number; z: number }[] {
  const nodeKind = NODE_KINDS.find((k) => k !== 'lostbanner' && NODE_GOOD[k] === good)
  if (nodeKind) return s.nodes.filter((n) => n.kind === nodeKind && n.left > 0).map((n) => ({ x: n.x, z: n.z }))
  const shop = WORKSHOPS.find((w) => RECIPE[w].output === good)!
  return s.pieces.filter((p) => p.kind === shop).map(pieceCentre)
}
/** The workshop that makes a made good, for the build bar to point at when none stands. */
export const makerOf = (good: Made): Workshop => WORKSHOPS.find((w) => RECIPE[w].output === good)!

// ----------------------------------------------------------------------------- tick

/** Slides a walker out of the keep and keeps it on the island. */
function confine(w: { x: number; z: number }) {
  const r = Math.hypot(w.x, w.z)
  if (r < KEEP_R && r > 1e-6) {
    w.x *= KEEP_R / r
    w.z *= KEEP_R / r
  } else if (r < 1e-6) {
    w.x = KEEP_R
  }
  const edge = ISLAND_R - 1.2
  if (r > edge) {
    w.x *= edge / r
    w.z *= edge / r
  }
}

/**
 * Where a walker at `w` should head to reach a point: the point itself, unless the
 * straight line crosses the keep, in which case the side of the keep first.
 */
function aim(w: { x: number; z: number }, tx: number, tz: number) {
  const dx = tx - w.x
  const dz = tz - w.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return { x: tx, z: tz }
  // Closest approach of the segment to the keep's centre.
  const t = Math.max(0, Math.min(1, -(w.x * dx + w.z * dz) / (len * len)))
  const px = w.x + dx * t
  const pz = w.z + dz * t
  const pr = Math.hypot(px, pz)
  if (pr >= KEEP_R + 0.6 || t <= 0 || t >= 1) return { x: tx, z: tz }
  if (pr < 0.3) return { x: (-dz / len) * (KEEP_R + 1.2), z: (dx / len) * (KEEP_R + 1.2) }
  const k = (KEEP_R + 1.2) / pr
  return { x: px * k, z: pz * k }
}

/** One step of a walker toward a point at a speed, around the keep. Returns true once it is there. */
function walk(w: { x: number; z: number; facing: number }, tx: number, tz: number, speed: number, dt: number): boolean {
  const len = dist(w.x, w.z, tx, tz)
  if (len <= speed * dt + 0.05) {
    w.x = tx
    w.z = tz
    confine(w)
    return true
  }
  const g = aim(w, tx, tz)
  const ex = g.x - w.x
  const ez = g.z - w.z
  const e = Math.hypot(ex, ez)
  if (e < 1e-6) return false
  const step = Math.min(e, speed * dt)
  w.x += (ex / e) * step
  w.z += (ez / e) * step
  w.facing = Math.atan2(ez, ex)
  confine(w)
  return false
}

function fly(s: Sim, good: Good, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, golden: boolean) {
  s.flights.push({ id: s.nextId++, good, x0, y0, z0, x1, y1, z1, at: s.time, golden })
}

/** A repair or a dousing that has reached the end: the piece is whole again. Returns true when it was. */
function finishJob(s: Sim, p: Piece): boolean {
  if (p.repair < 1) return false
  const c = pieceCentre(p)
  const was = p.state
  p.state = 'ok'
  p.stateAt = s.time
  p.repair = 0
  if (was === 'broken') {
    p.builtAt = s.time
    s.cheerAt = s.time
    ev(s, 'repaired', c.x, c.z, { piece: p.kind })
  } else {
    p.dousedAt = s.time
    ev(s, 'fireOut', c.x, c.z, { piece: p.kind })
  }
  if (s.hero.job && s.hero.job.id === p.id) s.hero.job = null
  return true
}

function tickHero(s: Sim, dt: number) {
  const h = s.hero
  const t = s.time
  let dx = 0
  let dz = 0
  if (h.input.dx !== 0 || h.input.dz !== 0) {
    dx = h.input.dx
    dz = h.input.dz
    h.target = null
    h.focus = -1
  } else if (h.target) {
    const d = dist(h.x, h.z, h.target.x, h.target.z)
    // A hair of tolerance: the last step lands exactly on the stop distance, give or take rounding.
    if (d <= h.target.stop + 1e-6) {
      h.target = null
    } else {
      const g = aim(h, h.target.x, h.target.z)
      const ex = g.x - h.x
      const ez = g.z - h.z
      const e = Math.hypot(ex, ez)
      const step = Math.min(1, (d - h.target.stop) / (HERO_SPEED * dt))
      dx = (ex / e) * step
      dz = (ez / e) * step
    }
  }
  const wasMoving = h.moving
  h.moving = dx !== 0 || dz !== 0
  if (h.moving) {
    h.x += dx * HERO_SPEED * dt
    h.z += dz * HERO_SPEED * dt
    h.facing = Math.atan2(dz, dx)
    confine(h)
    h.job = null
  } else if (wasMoving) {
    h.stoppedAt = t
  }
  h.y = groundAt(s, h.x, h.z)
  if (h.moving) return

  // Standing still, the hero works on whatever is in reach: a fire first, then something broken, then the tapped node, then the nearest.
  let job: Job | null = null
  let burning: Piece | null = null
  let broken: Piece | null = null
  for (const p of s.pieces) {
    if (p.state === 'ok' || !nearPiece(p, h.x, h.z, PIECE_REACH)) continue
    if (p.state === 'burning' && !burning) burning = p
    // A banner with its cloth out in the meadow wants fetching, not hammering: the cloth flies back on its own.
    if (p.state === 'broken' && !broken && !s.nodes.some((n) => n.kind === 'lostbanner' && n.piece === p.id)) broken = p
  }
  if (burning) job = { kind: 'douse', id: burning.id, progress: 0, swings: 0 }
  else if (broken) job = { kind: 'repair', id: broken.id, progress: 0, swings: 0 }
  else {
    let nearest: Node | null = null
    let nd = Infinity
    for (const n of s.nodes) {
      if (n.left <= 0) continue
      const d = dist(n.x, n.z, h.x, h.z)
      if (d > REACH) continue
      if (n.id === h.focus) {
        nearest = n
        break
      }
      if (d < nd) {
        nd = d
        nearest = n
      }
    }
    if (nearest) job = { kind: 'gather', id: nearest.id, progress: 0, swings: 0 }
  }
  if (!job) {
    h.job = null
    return
  }
  if (!h.job || h.job.kind !== job.kind || h.job.id !== job.id) h.job = job
  const j = h.job

  if (j.kind === 'gather') {
    const n = nodeById(s, j.id)
    h.facing = Math.atan2(n.z - h.z, n.x - h.x)
    j.progress += dt
    if (j.progress < SWING) return
    j.progress -= SWING
    j.swings += 1
    n.hitAt = t
    h.swungAt = t
    ev(s, 'swing', n.x, n.z, { node: n.kind })
    if (j.swings < SWINGS_PER_UNIT) return
    j.swings = 0
    n.left -= 1
    const good = NODE_GOOD[n.kind]
    const golden = n.kind !== 'lostbanner' && s.random() < GOLDEN_CHANCE
    s.store[good] += golden ? GOLDEN_WORTH : 1
    if (n.kind === 'lostbanner') {
      // The banner flies back onto its pole, and the pole is whole again.
      const p = pieceById(s, n.piece)
      const c = pieceCentre(p)
      s.store[good] -= 1
      p.state = 'ok'
      p.stateAt = t
      p.repair = 0
      fly(s, good, n.x, 0.5, n.z, c.x, 2.5, c.z, false)
      s.nodes.splice(s.nodes.indexOf(n), 1)
      ev(s, 'repaired', c.x, c.z, { piece: 'banner' })
      h.job = null
      return
    }
    fly(s, good, n.x, 1, n.z, YARD_X, 0.6, YARD_Z, golden)
    ev(s, golden ? 'golden' : 'gather', n.x, n.z, { good, node: n.kind })
    if (n.left <= 0) {
      n.regrowAt = t + REGROW[n.kind]
      if (n.kind === 'sheep') {
        n.state = 'follow'
        n.stateAt = t
        ev(s, 'baa', n.x, n.z, { node: 'sheep' })
      }
    }
    return
  }

  const p = pieceById(s, j.id)
  const c = pieceCentre(p)
  h.facing = Math.atan2(c.z - h.z, c.x - h.x)
  const took = j.kind === 'repair' ? REPAIR_FOR : DOUSE_FOR
  p.repair += dt / took
  j.progress += dt
  if (j.progress >= 0.5) {
    j.progress -= 0.5
    h.swungAt = t
    ev(s, j.kind === 'repair' ? 'repairTick' : 'douseTick', c.x, c.z, { piece: p.kind })
  }
  finishJob(s, p)
}

function tickNodes(s: Sim, dt: number) {
  const t = s.time
  const h = s.hero
  for (const n of s.nodes) {
    if (n.left <= 0 && n.regrowAt >= 0 && t >= n.regrowAt && n.kind !== 'lostbanner') {
      n.left = NODE_MAX[n.kind]
      n.regrowAt = -1
      ev(s, 'regrow', n.x, n.z, { node: n.kind })
      if (n.kind === 'sheep' && n.state === 'follow') n.state = 'graze'
    }
    if (n.kind !== 'sheep') continue
    const near = dist(n.x, n.z, h.x, h.z)
    if (n.state === 'flipped') {
      // On its back, legs wiggling, until the hero comes and rights it, or it manages on its own.
      if (near < 1.9 || t - n.stateAt > SHEEP_FLIP_FOR) {
        n.state = 'graze'
        n.stateAt = t
        n.hopAt = t
        ev(s, 'sheepUp', n.x, n.z, { node: 'sheep' })
      }
      continue
    }
    if (n.state === 'follow' && t - n.stateAt > SHEEP_FOLLOW_FOR) n.state = 'graze'
    const storm = s.weather === 'warning' || s.weather === 'thunder' || s.weather === 'wind'
    if (storm && n.state === 'graze') n.state = 'huddle'
    if (!storm && n.state === 'huddle') n.state = 'graze'
    if (near < 3 && t - n.hopAt > 5 && n.state !== 'follow') {
      n.hopAt = t
      ev(s, 'baa', n.x, n.z, { node: 'sheep' })
    }
    // Where to: a spot in its own meadow, the hero's heels, or the front of the castle when a storm is coming.
    if (n.state === 'follow') {
      n.tx = h.x
      n.tz = h.z
    } else if (n.state === 'huddle') {
      n.tx = (n.hx / Math.hypot(n.hx, n.hz)) * 18
      n.tz = (n.hz / Math.hypot(n.hx, n.hz)) * 18
    } else if (t >= n.wanderAt) {
      const a = s.random() * Math.PI * 2
      const r = s.random() * SHEEP_ROAM
      n.tx = n.hx + Math.cos(a) * r
      n.tz = n.hz + Math.sin(a) * r
      n.wanderAt = t + 2 + s.random() * 4
    }
    const d = dist(n.x, n.z, n.tx, n.tz)
    const stop = n.state === 'follow' ? 2.2 : 0.2
    if (d > stop) {
      const speed = n.state === 'graze' && t - n.hopAt > 2.5 ? SHEEP_SPEED : SHEEP_RUN
      const step = Math.min(d - stop, speed * dt)
      n.x += ((n.tx - n.x) / d) * step
      n.z += ((n.tz - n.z) / d) * step
      confine(n)
    }
  }
}

function tickWorkers(s: Sim, dt: number) {
  const t = s.time
  for (const w of s.workers) {
    const p = pieceById(s, w.piece)
    const c = pieceCentre(p)
    const door = doorOf(p)
    const recipe = RECIPE[w.kind]
    const yard = { x: YARD_X + ((w.id % 5) - 2) * 0.7, z: YARD_Z + 1.4 }
    switch (w.state) {
      case 'wait': {
        if (p.state !== 'ok' || s.store[recipe.output] >= OUTPUT_CAP) break
        if (costEntries(recipe.inputs).some(([g, n]) => s.store[g] < n)) break
        w.state = 'fetch'
        w.stateAt = t
        break
      }
      case 'fetch': {
        if (!walk(w, yard.x, yard.z, WORKER_SPEED, dt)) break
        if (costEntries(recipe.inputs).some(([g, n]) => s.store[g] < n)) {
          // Somebody built with it first: back to the door to wait.
          w.state = 'carry'
          w.stateAt = t
          w.carrying = null
          break
        }
        for (const [g, n] of costEntries(recipe.inputs)) s.store[g] -= n
        w.carrying = costEntries(recipe.inputs)[0]![0]
        w.state = 'carry'
        w.stateAt = t
        ev(s, 'fetch', w.x, w.z, { good: w.carrying })
        break
      }
      case 'carry': {
        if (!walk(w, door.x, door.z, WORKER_SPEED, dt)) break
        if (w.carrying === null) {
          w.state = 'wait'
          w.stateAt = t
          break
        }
        w.state = 'work'
        w.stateAt = t
        w.facing = -Math.PI / 2
        break
      }
      case 'work': {
        if (p.state !== 'ok') {
          // The bench is on fire or in bits: the goods wait with the person at the door.
          w.state = 'wait'
          w.stateAt = t
          for (const [g, n] of costEntries(recipe.inputs)) s.store[g] += n
          w.carrying = null
          break
        }
        const before = Math.floor((t - dt - w.stateAt) / 0.5)
        const after = Math.floor((t - w.stateAt) / 0.5)
        if (after > before) ev(s, 'work', c.x, c.z, { piece: w.kind })
        if (t - w.stateAt < recipe.seconds) break
        s.store[recipe.output] += 1
        w.carrying = null
        w.madeAt = t
        w.state = 'wait'
        w.stateAt = t
        fly(s, recipe.output, c.x, HEIGHT[w.kind] + 0.5, c.z, YARD_X, 0.6, YARD_Z, false)
        ev(s, 'made', c.x, c.z, { good: recipe.output, piece: w.kind })
        break
      }
    }
    w.y = groundAt(s, w.x, w.z)
  }
}

function tickFlights(s: Sim) {
  for (let i = s.flights.length - 1; i >= 0; i--) {
    const f = s.flights[i]!
    if (s.time - f.at < FLIGHT_FOR) continue
    s.flights.splice(i, 1)
    ev(s, 'landed', f.x1, f.z1, { good: f.good })
  }
}

function tickPuddles(s: Sim) {
  const h = s.hero
  for (let i = s.puddles.length - 1; i >= 0; i--) {
    const p = s.puddles[i]!
    if (s.time - p.at > PUDDLE_FOR) {
      s.puddles.splice(i, 1)
      continue
    }
    if (h.moving && dist(p.x, p.z, h.x, h.z) < 1.1 && s.time - p.splashedAt > 1) {
      p.splashedAt = s.time
      ev(s, 'splash', p.x, p.z)
    }
  }
}

/** The bolt: the bell tower catches it and rings, otherwise a piece the child has had a while breaks, or burns if it is wooden. */
function strike(s: Sim) {
  const t = s.time
  const bell = s.pieces.find((p) => p.kind === 'belltower' && p.state === 'ok')
  if (bell) {
    const c = pieceCentre(bell)
    s.lightning = { at: t, x: c.x, z: c.z, y: pieceTop(bell) + 1.2 }
    s.bongAt = t
    s.store.iron += 1
    fly(s, 'iron', c.x, pieceTop(bell), c.z, YARD_X, 0.6, YARD_Z, false)
    ev(s, 'lightning', c.x, c.z, { piece: 'belltower' })
    ev(s, 'bong', c.x, c.z, { piece: 'belltower' })
    return
  }
  const targets = s.pieces.filter((p) => p.state === 'ok' && t - p.builtAt > SAFE_FOR && STRIKE_WEIGHT[p.kind] > 0)
  const total = targets.reduce((sum, p) => sum + STRIKE_WEIGHT[p.kind], 0)
  if (total === 0) {
    // Nothing old enough to hit: the bolt lands on the meadow, all show.
    s.lightning = { at: t, x: 20, z: -16, y: 0 }
    ev(s, 'lightning', 20, -16)
    return
  }
  let pick = s.random() * total
  let hit = targets[targets.length - 1]!
  for (const p of targets) {
    pick -= STRIKE_WEIGHT[p.kind]
    if (pick <= 0) {
      hit = p
      break
    }
  }
  const c = pieceCentre(hit)
  s.lightning = { at: t, x: c.x, z: c.z, y: pieceTop(hit) }
  ev(s, 'lightning', c.x, c.z, { piece: hit.kind })
  hit.stateAt = t
  hit.repair = 0
  if (WOODEN.includes(hit.kind)) {
    hit.state = 'burning'
    ev(s, 'ignite', c.x, c.z, { piece: hit.kind })
  } else {
    hit.state = 'broken'
    ev(s, 'broke', c.x, c.z, { piece: hit.kind })
  }
}

/** The gust: one banner's cloth flies off across the meadow, where the hero can fetch it. */
function blow(s: Sim) {
  const banners = s.pieces.filter((p) => p.kind === 'banner' && p.state === 'ok')
  if (banners.length === 0) return
  const b = banners[Math.floor(s.random() * banners.length)]!
  const c = pieceCentre(b)
  b.state = 'broken'
  b.stateAt = s.time
  const a = s.random() * Math.PI * 2
  const r = NODE_R_MIN - 3 + s.random() * 6
  const x = Math.cos(a) * r
  const z = Math.sin(a) * r
  s.nodes.push({ id: s.nextId++, kind: 'lostbanner', x, z, left: 1, regrowAt: -1, hitAt: -1, seed: b.id, piece: b.id, colour: b.colour, hx: x, hz: z, tx: x, tz: z, wanderAt: 0, hopAt: -1, state: 'graze', stateAt: 0 })
  fly(s, 'colourcloth', c.x, 2.5, c.z, x, 0.3, z, false)
  ev(s, 'blown', c.x, c.z, { piece: 'banner' })
}

/** The gust that takes the top off one wall the child has had a while. */
function chip(s: Sim) {
  const walls = s.pieces.filter((p) => p.kind === 'wall' && p.state === 'ok' && s.time - p.builtAt > SAFE_FOR)
  if (walls.length === 0) return
  const w = walls[Math.floor(s.random() * walls.length)]!
  const c = pieceCentre(w)
  w.state = 'broken'
  w.stateAt = s.time
  w.repair = 0
  ev(s, 'chipped', c.x, c.z, { piece: 'wall' })
}

function tumble(s: Sim) {
  for (const n of s.nodes) {
    if (n.kind !== 'sheep' || s.random() > 0.6) continue
    n.state = 'flipped'
    n.stateAt = s.time
    ev(s, 'sheepFlip', n.x, n.z, { node: 'sheep' })
  }
}

function tickWeather(s: Sim, dt: number) {
  // The sky is the child's to meet: nothing at all brews while the start card is up.
  if (s.phase !== 'play') return
  const t = s.time
  const since = t - s.weatherAt
  // The cloud drifts toward its spot: over the castle during a storm, off the east edge otherwise.
  const wantX = s.weather === 'clear' || s.weather === 'rainbow' ? CLOUD_FAR_X : 2
  s.cloud.x += (wantX - s.cloud.x) * (1 - Math.exp(-dt / (s.weather === 'rainbow' ? 2.5 : 2)))
  // The camera is circling the castle: a storm already running holds still and carries on after the lap.
  if ((s.weather === 'thunder' || s.weather === 'wind') && t < s.orbitUntil) {
    s.weatherAt += dt
    return
  }
  switch (s.weather) {
    case 'clear': {
      const due = t - s.lastStormEndAt >= STORM_EVERY
      const calm = s.stormsOn && !isNight(s) && t >= s.orbitUntil && s.pieces.length >= STORM_MIN_PIECES
      if (!due || !calm) return
      s.weather = 'warning'
      s.weatherAt = t
      s.storm = s.storms % 2 === 0 ? 'thunder' : 'wind'
      s.struck = false
      s.blew = false
      s.chipped = false
      s.tumbled = false
      ev(s, 'stormWarn', 0, 0)
      return
    }
    case 'warning': {
      if (since < WARN_FOR) return
      s.weather = s.storm
      s.weatherAt = t
      ev(s, 'stormStart', 0, 0)
      return
    }
    case 'thunder': {
      if (!s.struck && since >= LIGHTNING_AT) {
        s.struck = true
        strike(s)
      }
      if (since >= RAIN_AT && s.rainUntil < t) {
        s.rainUntil = s.weatherAt + THUNDER_FOR
        ev(s, 'rainStart', 0, 0)
      }
      if (since < THUNDER_FOR) return
      endStorm(s)
      for (let i = 0; i < PUDDLES; i++) {
        const a = s.random() * Math.PI * 2
        const r = 8 + s.random() * 18
        s.puddles.push({ id: s.nextId++, x: Math.cos(a) * r, z: Math.sin(a) * r, at: t, splashedAt: -1 })
      }
      return
    }
    case 'wind': {
      if (!s.tumbled && since >= TUMBLE_AT) {
        s.tumbled = true
        tumble(s)
      }
      if (!s.blew && since >= BLOW_AT) {
        s.blew = true
        blow(s)
      }
      if (!s.chipped && since >= CHIP_AT) {
        s.chipped = true
        chip(s)
      }
      if (since < WIND_FOR) return
      endStorm(s)
      return
    }
    case 'rainbow': {
      if (since < RAINBOW_FOR) return
      s.weather = 'clear'
      s.weatherAt = t
      return
    }
  }
}

function endStorm(s: Sim) {
  s.weather = 'rainbow'
  s.weatherAt = s.time
  s.storms += 1
  s.lastStormEndAt = s.time
  ev(s, 'rainbow', 0, 0)
}

/** Fire burns out into a broken piece unless the hero or the rain gets there first. */
function tickFires(s: Sim, dt: number) {
  const t = s.time
  for (const p of s.pieces) {
    if (p.state !== 'burning') continue
    const c = pieceCentre(p)
    if (raining(s)) {
      p.repair += dt / RAIN_DOUSE
      if (finishJob(s, p)) continue
    }
    if (t - p.stateAt < FIRE_FOR) continue
    p.state = 'broken'
    p.stateAt = t
    p.repair = 0
    if (s.hero.job && s.hero.job.id === p.id) s.hero.job = null
    ev(s, 'broke', c.x, c.z, { piece: p.kind })
  }
}

function tickWishes(s: Sim) {
  if (s.wishDoneAt >= 0 && s.time - s.wishDoneAt < ORBIT_FOR) return
  const w = currentWish(s)
  if (!w || count(s, w.kind) < w.count) return
  s.wishIndex += 1
  s.wishDoneAt = s.time
  s.cheerAt = s.time
  s.orbitUntil = s.time + ORBIT_FOR
  ev(s, 'wish', 0, 0, { piece: w.kind })
  const next = currentWish(s)
  if (next) ev(s, 'newWish', 0, 0, { piece: next.kind })
  else ev(s, 'allWishes', 0, 0)
}

export function tick(s: Sim, dt: number) {
  s.time += dt
  tickHero(s, dt)
  tickNodes(s, dt)
  tickWorkers(s, dt)
  tickFlights(s)
  tickPuddles(s)
  tickWeather(s, dt)
  tickFires(s, dt)
  tickWishes(s)
}
