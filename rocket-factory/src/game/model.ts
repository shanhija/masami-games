/**
 * The shapes and numbers every part of Rocket Factory agrees on: units, ids, the things, the
 * buildings, the belts' cells and slots, the munchers, the running state (State), what the
 * child can do (Action), what a touch lands on (Hit), what a step reports (SimEvent) and the
 * one next step (Step). Nothing here does any work beyond small helpers; the numbers live in
 * catalog.ts, the board in board.ts, where things are drawn in where.ts, the save in
 * progress.ts, and the rules in rules.ts and the files it calls. The design is
 * plans/rocket-factory.md.
 *
 * Units: 1 is one cell of the board. x runs right from 0 to COLS - 1, y runs DOWN from 0 to
 * ROWS - 1, and a cell's index is y * COLS + x. A point on the board is in cells: (x, y) is a
 * cell's top-left corner and (x + 0.5, y + 0.5) its middle. Directions are 0 east, 1 south,
 * 2 west, 3 north. The board never turns, and the sim never knows where the view is (the
 * camera is layout.ts and camera.ts).
 *
 * Time: the state steps HZ times a second. Every ...At field is a tick, -1 for never. The tick
 * starts at 0 with each page load and is never saved: the save holds seconds left. Every
 * speed is a whole number of ticks per cell, and every timing that trades with belts is a
 * multiple of HOP, so the sim needs no fractions.
 *
 * The stamp rule: events feed only sounds and particles. Anything drawn over time reads a
 * tick stamp in the state, so a frame can be drawn from the state alone.
 *
 * Credit at once, show later: a dug rock is in its oven the moment she taps, a sneezed
 * muncher's cheeks are where they are wanted the moment it sneezes. Whatever flies is a
 * Flight in `State.flights`, a picture only.
 *
 * Determinism: the sim uses integers and + - * / and Math.floor (squared distances, never
 * Math.sin, cos, atan2, pow, exp or hypot, whose last bits differ between engines), and no
 * rule draws a random number: every choice falls by cell, id or turn (where.ts has the board
 * points the sim reads). `State.rng` only seeds the next fresh game; the scripted children and
 * the demos draw from generators of their own (random.ts), and the draw code takes its variety
 * from a hash of an id and the tick. Nothing outside the State lives between steps.
 */

export const HZ = 60
export const STEP = 1 / HZ
export const ticks = (seconds: number) => Math.round(seconds * HZ)
/** Seconds from the tick stamp `at` to the sim time `t` (seconds); Infinity for a stamp of -1. */
export const since = (at: number, t: number) => (at < 0 ? Infinity : t - at * STEP)

/** The whole board, in cells: all of it open from the start (board.ts MAP). */
export const COLS = 60
export const ROWS = 36
export const CELLS = COLS * ROWS

/** Every belt hops half a cell together every HOP ticks: three hops a second, the eighth notes of the 90 bpm band. Machines trade with belts only on a hop tick. */
export const HOP = 20

/** 0 east (+x), 1 south (+y), 2 west (-x), 3 north (-y). */
export type Dir = 0 | 1 | 2 | 3
export const DIRS = [0, 1, 2, 3] as const
export const DX = [1, 0, -1, 0] as const
export const DY = [0, 1, 0, -1] as const
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir

// ---------------------------------------------------------------------------------------
// Things

/**
 * Everything that rides a belt. Raw things (rocks and bubbles) are dull lumps and made things
 * are bright and smooth. The order is the THINGS index used in typed arrays: append only.
 */
export const THINGS = ['blueRock', 'goldRock', 'bubble', 'blueBar', 'goldBar', 'gear', 'greenBottle', 'orangeBottle'] as const
export type Thing = (typeof THINGS)[number]
export const thingIndex = (t: Thing): number => THINGS.indexOf(t)
/** What munchers eat: the made things. Never a rock or a bubble (they do not like soap). */
export const isShiny = (t: Thing) => t !== 'blueRock' && t !== 'goldRock' && t !== 'bubble'
export const BOTTLES = ['greenBottle', 'orangeBottle'] as const
export type Bottle = (typeof BOTTLES)[number]
export const isBottle = (t: Thing): t is Bottle => t === 'greenBottle' || t === 'orangeBottle'
/** A count of each thing, by THINGS index (THINGS.length long). */
export type Counts = number[]

// ---------------------------------------------------------------------------------------
// Buildings and stickers

/** Every building. The pad is fixed on the board; every other kind is a sticker from the tray. The order is the save's: append only. */
export const KINDS = ['pad', 'digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'tower', 'bowl'] as const
export type Kind = (typeof KINDS)[number]
/** A building the child places. */
export type Placeable = Exclude<Kind, 'pad'>
/** What the tray holds: every placeable building, and hedges (drawn like a belt). */
export const STICKERS = ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'tower', 'bowl', 'hedge'] as const
export type Sticker = (typeof STICKERS)[number]
/** Buildings that make things in batches (catalog.ts RECIPES). */
export type Maker = 'digger' | 'oven' | 'workshop' | 'greenMaker' | 'orangeMaker' | 'pump'
export const isMaker = (k: Kind): k is Maker => k === 'digger' || k === 'oven' || k === 'workshop' || k === 'greenMaker' || k === 'orangeMaker' || k === 'pump'

/** A building on the board. Its footprint is SIZE[kind] cells a side from (x, y) (catalog.ts). */
export interface Building {
  /** Unique and never reused in a session: events, flights, munchers and the hint name buildings by it. */
  id: number
  kind: Kind
  /** The footprint's top-left cell. */
  x: number
  y: number
  /** Things waiting inside, by THINGS index: a maker's inputs (at most HOLD of each), the lab's shelf (uncapped), a tower's bubbles, a bowl's gold bars. An oven keeps its rocks in `queue` instead. */
  held: Counts
  /** An oven's rocks in arrival order (at most HOLD in all): it bakes them in that order. Empty for every other kind. */
  queue: Thing[]
  /** The batch in progress: what it makes (the lab's: the bottle it drinks), and the ticks it started and ends; null while idle. A batch spends its inputs when it starts. */
  batch: { makes: Thing; at: number; until: number } | null
  /** Made things waiting to go out, oldest first, at most STACK (drawn on its roof). */
  stack: Thing[]
  /** Whose turn it is among the belts it pushes onto, and among the mouths it takes from. */
  outTurn: number
  inTurn: number
  /** A tower's shots left (2 a bubble, at most 4). */
  ammo: number
  /** A tower's stars: munchers it sent home, drawn up to 5. */
  stars: number
  /** The muncher napping on it, or -1. */
  napper: number
  /** The last BUSY_WINDOW seconds, one bit a second (newest lowest): was it working, was it starved (a maker with a free batch slot and inputs missing). The bottleneck walk reads them. */
  busyBits: number
  starvedBits: number
  /** Tucked in for Good night: it makes nothing until morning. */
  tucked: boolean
  /** Stamps for the picture: placed (the slap), the last push out (the squash), the last thing taken in (the gulp), the last tap (the recipe bubble), a tower's last shot. */
  placedAt: number
  pushAt: number
  gulpAt: number
  tapAt: number
  shotAt: number
}

// ---------------------------------------------------------------------------------------
// Belts

/**
 * The belts, cell by cell: every array is CELLS long except the slots. A belt cell has an in
 * side and an out side (a straight belt's are opposite, a bend's are at right angles, stored
 * as drawn and never guessed from its neighbours). A fork cell (always straight) has a second
 * way out by `fork`. A bridge cell (always straight) has an over lane, straight across the
 * main lane's axis, leaving by `over`. The slot engine and the meaning of every case are in
 * belts.ts; the strokes that make them in strokes.ts.
 *
 * Slots: each cell has an in slot (2c, the half the things come in by) and an out slot
 * (2c + 1); a bridge's over lane has its own two (OVER + 2c, OVER + 2c + 1). A slot holds one
 * thing (its THINGS index) or -1.
 */
export interface Belts {
  /** The side things leave by, or -1 where there is no belt. */
  out: Int8Array
  /** The side things come in by, or -1 where there is no belt. */
  in: Int8Array
  /** A fork's second way out (a side at right angles to `out`), or -1. */
  fork: Int8Array
  /** A bridge's over lane: the side it leaves by, or -1 for no bridge. */
  over: Int8Array
  /** The pattern printed in the belt's body (catalog.ts PATTERNS). */
  pattern: Uint8Array
  /** Whose turn it is: among a cell's feeders (0 its own in slot, then the side joins clockwise), and a fork's next way (0 straight, 1 the side). */
  joinTurn: Uint8Array
  forkTurn: Uint8Array
  /** Hops this cell's things have advanced: the chevrons' and rim ticks' phase. */
  moved: Int32Array
  /** Since when the thing at the end of each lane has stood still while the lane was full behind it, or -1: the hint and Beep's lifts read it. 2 * CELLS long, by a lane's slot halved: cell c's main lane at c, its bridge's over lane (the hump) at CELLS + c. */
  blockedSince: Int32Array
  /** When the cell was laid (it pops in), and when its direction last changed (a re-point), or -1. */
  laidAt: Int32Array
  turnedAt: Int32Array
  /** The things in the slots (THINGS index, -1 empty), SLOTS long. */
  slot: Int8Array
  /** Where each slot's thing was before the last hop: a slot, or -1 when it came from a building or a hand. The picture glides from there over the hop. */
  from: Int16Array
}
/** The over lanes' slots start here. */
export const OVER = 2 * CELLS
export const SLOTS = 4 * CELLS
export const inSlot = (c: number) => 2 * c
export const outSlot = (c: number) => 2 * c + 1
export const overIn = (c: number) => OVER + 2 * c
export const overOut = (c: number) => OVER + 2 * c + 1
/** The cell a slot belongs to. */
export const slotCell = (slot: number) => (slot >= OVER ? (slot - OVER) >> 1 : slot >> 1)

/**
 * What belts.ts derives from the belt cells and the buildings after every edit and every load
 * (rules.ts rebuild): each slot's successors and predecessors, and each building's mouths and
 * spouts. Never saved, never edited by hand.
 */
export interface Net {
  /** A slot's first successor: another slot (>= 0), a building's mouth (-2 - building id), or -1 for a dead end. */
  next: Int32Array
  /** A fork's out slot's second successor (the side), else -1. */
  next2: Int32Array
  /** For each slot, the slots that feed it, in turn order (at most 3), as a flat list: preds[PRED * slot + k], -1 padded. */
  preds: Int32Array
  /** For each building id: the out slots of the belts that end at its edge (its mouths) and the in slots of the belts that start at its edge (its spouts), in a fixed order round its footprint. */
  mouths: Map<number, number[]>
  spouts: Map<number, number[]>
}
export const PRED = 3

// ---------------------------------------------------------------------------------------
// The path: what the lab and the rocket find, in order

/** The milestones in order (catalog.ts PATH has what each needs and brings). bubbles and hedges are the one choice: either can come first. Append only: the save names them. */
export const CARDS = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel'] as const
export type CardId = (typeof CARDS)[number]

/** The rocket's four parts, each filled with one thing (catalog.ts PARTS). */
export const PARTS = ['legs', 'body', 'nose', 'engine'] as const
export type PartId = (typeof PARTS)[number]

// ---------------------------------------------------------------------------------------
// Munchers and burrows

/** The six burrows, A to F (board.ts BURROWS; catalog.ts BURROW_WAKES says which card wakes each). */
export interface Burrow {
  /** 0 to HUNGER_FULL (catalog.ts). Frozen while its munchers are out or it sleeps. */
  hunger: number
  /** Asleep until this tick (no hunger grows); -1 awake. */
  sleepUntil: number
  /** The 5 s warning began at this tick (the mound wobbles, boing boing), or -1. */
  warnAt: number
  /** What its munchers carried home, by THINGS index: the heap by its door. */
  heap: Counts
  /** Its first picnic made it a friend: a heart flag. */
  friend: boolean
  visits: number
  /** Its card was found at this tick (its munchers wave hello), or -1. */
  helloAt: number
  /** A tap showed its paw prints at this tick (5 s), or -1. */
  pawsAt: number
}

/**
 * What a muncher is doing. peek: in the doorway after the warning; out: hopping out of the
 * door; bowl: hopping to its burrow's bowl first; walk: stepping toward its target; sit:
 * sitting on a belt cell, munching; nap: asleep on a building's roof; nibble: eating through a
 * hedge; wait: queued behind a nibbler; caught: tapped, wiggling until Beep comes; picnic:
 * eating at its bowl; polite: sitting beside the bottle line, eating nothing; home: hopping
 * straight home (a burp, a wave, a giggle or suds); watch: sitting by the pad with a flag for
 * the launch.
 */
export type MuncherMode = 'peek' | 'out' | 'bowl' | 'walk' | 'sit' | 'nap' | 'nibble' | 'wait' | 'caught' | 'picnic' | 'polite' | 'home' | 'watch'
/** Why it goes home, for the picture: full (a burp), out of things to eat (a wave), tickled (a giggle and a sneeze), sudsed (a hat of suds), fed at a bowl, or its time was up. */
export type HomeWhy = 'full' | 'nothing' | 'tickled' | 'sudsed' | 'fed' | 'late' | 'night'
/** What a muncher goes for: a belt cell to sit on, or a building to nap on. */
export type Target = { kind: 'cell'; cell: number } | { kind: 'building'; id: number }

export interface Muncher {
  id: number
  burrow: number
  mode: MuncherMode
  modeAt: number
  /** Where it stands: its cell, the cell it steps toward (the same while still), when the step started and how many ticks it lasts (where.ts muncherPoint). */
  cell: number
  toward: number
  stepAt: number
  stepFor: number
  /** A straight hop over everything (out of the door, home, to the pad), from and to board points over [at, until]; null while it walks the grid. */
  hop: { x0: number; y0: number; x1: number; y1: number; at: number; until: number } | null
  homeWhy: HomeWhy | null
  target: Target | null
  /** The targets it tried this visit (a cell, or -1 - building id): walking on takes the nearest untried one. */
  tried: number[]
  cheeks: Thing[]
  /** When it last grabbed a thing (nom), and since when nothing has arrived at its cell. */
  grabAt: number
  idleSince: number
  /** When it left its door: it goes home OUT_FOR after, whatever it is doing. */
  outAt: number
  scout: boolean
  /** A tower's shot is flying at it (it cannot be shot again), or -1. */
  shotBy: number
}

/** The visit that is out: one at a time. */
export interface Visit {
  burrow: number
  at: number
  /** What it cost and what it earned the burrow's sleep (catalog.ts SLEEP). */
  kept: number
  tickled: number
  sent: number
  naps: number
  fed: number
}

/** A tower's puff of suds in the air: it lands on its muncher at `lands`. */
export interface Shot {
  tower: number
  muncher: number
  at: number
  lands: number
}

// ---------------------------------------------------------------------------------------
// Beep, flights and the child's tools

/** Beep as a picture: where it hovers (a board point), where its last flight began and when, what it is doing, what it carries. Every job was credited before the flight. */
export interface BeepPic {
  x: number
  y: number
  fromX: number
  fromY: number
  movedAt: number
  pose: 'float' | 'dig' | 'carry' | 'pat' | 'tickle' | 'point' | 'busy' | 'flip' | 'cheer' | 'wave' | 'stretch' | 'yawn' | 'sleep' | 'ride'
  poseAt: number
  carrying: Thing | null
  facing: -1 | 1
}

/** A thing in the air as a picture: from and to board points over [at, until], arcing `arc` cells high. */
export interface Flight {
  thing: Thing
  x0: number
  y0: number
  x1: number
  y1: number
  at: number
  until: number
  arc: number
}

/** The tray's tool in hand. The pencil is the default; every other tool lasts one use. */
export type Tool = { kind: 'pencil' } | { kind: 'sticker'; sticker: Placeable } | { kind: 'hedge' } | { kind: 'peel' }
/** The same tool: the same kind, and for a sticker the same sticker. A tap on the picked tool gives the pencil back (rules.ts), so the hint's scripts and the scripted children pick a tool only when it is not in hand. */
export const sameTool = (a: Tool, b: Tool) => a.kind === b.kind && (a.kind !== 'sticker' || (b.kind === 'sticker' && a.sticker === b.sticker))

/**
 * What a finger is doing on the board right now, with the plan the end sign and the ghost
 * show (strokes.ts): a belt stroke, a hedge line, a peel drag over belts and hedges, or a
 * sticker's ghost held at a board point. Nothing is real until 'release'.
 */
export type Drag =
  | { kind: 'stroke'; cells: number[]; at: number }
  | { kind: 'hedge'; cells: number[]; at: number }
  | { kind: 'peel'; cells: number[]; at: number }
  | { kind: 'ghost'; sticker: Placeable; x: number; y: number; at: number }

/** What the peel lifted with its first tap (a second tap peels it): a building, or a run of belt cells up to the next fork, join or building. */
export type Lifted = { kind: 'building'; id: number; at: number } | { kind: 'run'; cells: number[]; at: number }

/**
 * One undoable change to the layout, as strokes.ts applies it: the belt cells before and
 * after, the buildings removed and added, the hedges before and after. Undo restores the
 * layout, never things: what rode on removed cells goes where it is wanted.
 */
export interface CellBelt {
  in: number
  out: number
  fork: number
  over: number
  pattern: number
}
export interface PlacedBuilding {
  id: number
  kind: Placeable
  x: number
  y: number
}
export interface Edit {
  belts: { cell: number; before: CellBelt | null; after: CellBelt | null }[]
  removed: PlacedBuilding[]
  added: PlacedBuilding[]
  hedges: { cell: number; before: number; after: number }[]
}
export interface Undo {
  edit: Edit
  inverse: Edit
  at: number
  /** The working machines and what reached the lab and the pad before it, for the hint's Oops rule. */
  broke: boolean
  /** The tool she made it with: a pencil stroke, a sticker placed, a hedge line or the peel. A peel is picked from the tray, so the hint's hand waits its usual time before it taps Oops for one. */
  tool: Tool['kind']
}

// ---------------------------------------------------------------------------------------
// The one next step

/**
 * The step that bounces (hint.ts nextSteps, first match): what bounces, and the exact script
 * that does it, so the hand, the scripted children and the fuzz all do the same thing.
 */
export type Step =
  | { kind: 'muncher'; id: number }
  | { kind: 'oops' }
  | { kind: 'place'; sticker: Placeable; x: number; y: number }
  | { kind: 'free'; sticker: Placeable; cells: number[] }
  | { kind: 'bottleneck'; id: number; sticker: Placeable | null; x: number; y: number }
  | { kind: 'unblock'; slot: number }
  | { kind: 'stack'; id: number }
  | { kind: 'link'; from: number; to: number; thing: Thing; path: number[]; full: boolean }
  /** A bare patch (or the pond) to dig by hand: the chain's missing link while no digger (or pump) can feed the machine that wants its rock (or bubble). */
  | { kind: 'dig'; cell: number }
  /** A tower or a bowl at (x, y) with the belt that feeds it drawn first (cells: the finger's way along that belt, from a cell of the building it starts from, as a link's path), or a hedge line (cells: the hedges it plants). */
  | { kind: 'defend'; sticker: 'tower' | 'hedge' | 'bowl'; cells: number[]; x: number; y: number }
  | { kind: 'refill'; id: number }
  | { kind: 'heap'; burrow: number }
  | { kind: 'basket' }
  | { kind: 'choose' }
  | { kind: 'launch' }
  | { kind: 'card' }
  | { kind: 'tuck'; machine: Kind }
  | { kind: 'rocket' }

/** A step's script: the tool to pick, the taps (hits), the stroke's cells, the ghost's point. hint.ts writes them; child.ts and the fuzz run them through the same act. */
export type Script = Action[]

/** A step one of the hint's layout rules found: the tool its script picks first (unless it is in hand already), then the rest of its script. */
export interface HintPlan {
  step: Step
  tool: Tool
  body: Script
}
/** What the hint's layout rules (a sticker to place, the chain's next link, a defence for a burrow's paw prints) found for the board as it was: under `key`, a key of everything the board gives them, each rule's plan with what else that rule read (`also`). hint.ts works a rule out again only when one of the two changes. Derived, never saved. */
export interface HintMemo {
  key: string
  rules: Record<string, { also: string; plan: HintPlan | null }>
}

// ---------------------------------------------------------------------------------------
// The parent's switches and Good night

export const MUNCHER_MODES = ['many', 'few', 'polite', 'none'] as const
export type MunchersMode = (typeof MUNCHER_MODES)[number]
export type ScienceMode = 'normal' | 'quicker'

export interface Switches {
  sound: boolean
  music: boolean
  voice: boolean
  munchers: MunchersMode
  science: ScienceMode
  /** The parent turned full screen off in the pause menu: Play and Keep going no longer ask for it. */
  noFullscreen: boolean
}

/** Good night: dusk fell at `at`; one kind at a time bounces in a nightcap and her tap (or NIGHT_TUCK untapped) tucks every machine of it in; when the last is in Beep curls up (`doneAt`) and the still card shows. */
export interface Night {
  at: number
  /** The kind bouncing now and since when, or null once all are in. */
  kind: Kind | null
  kindAt: number
  doneAt: number
}

/** Fading help (plan: the one next step): her own belts of each kind of link, stickers placed by kind, and the hedges she has drawn (the hedge wears New! only until her first). Saved. */
export interface Help {
  links: Record<string, number>
  placed: Record<Placeable, number>
  hedges: number
}

// ---------------------------------------------------------------------------------------
// The running state

export interface State {
  tick: number
  /** The seed the next fresh game (Start again, Bring back) is made from; no rule draws from it. */
  rng: number
  belts: Belts
  /** 0 none, 1 a hedge, 2 a stump; and when each stump was nibbled (it regrows REGROW after, once nobody stands on it). CELLS long. */
  hedge: Uint8Array
  stumpAt: Int32Array
  buildings: Building[]
  nextId: number
  /** Derived by rebuild(): each cell's building id or -1, and the slot graph. */
  owner: Int16Array
  net: Net
  /** Beep's basket beside the pad: what nothing wants yet, by THINGS index. */
  basket: Counts
  /** The path's cards found, in order. */
  found: CardId[]
  /** The lab card's one choice after Gears!: which of the two the lab works on first, or null until her tap. */
  choice: 'bubbles' | 'hedges' | null
  /** The lab's bottles toward the current card, by bottle (0 green, 1 orange). */
  lab: { got: [number, number]; drinkAt: number }
  /** The rocket's parts, by PARTS index: things in, and when each filled (-1 not yet). */
  rocket: { got: number[]; fullAt: number[] }
  /** The launch in progress: the tap at `at`, the flight landing (and Moony coming home) at `landsAt`; null otherwise. Credited only when it lands. */
  launch: { at: number; landsAt: number } | null
  /** Her last tap on the rocket while it counts down, a tick (-1 for none): the number standing by the pad pops (draw/rocket.ts). */
  popAt: number
  launches: number
  /** The card that is up (a celebration), since when; and when the last one closed. */
  card: { id: CardId; at: number } | null
  cardClosedAt: number
  /** The card that is up came when nobody had touched the board for CARD_IDLE: it stays up until her tap (the 'card' action) instead of closing CARD_FOR after it came. */
  cardWaits: boolean
  burrows: Burrow[]
  munchers: Muncher[]
  nextMuncher: number
  visit: Visit | null
  /** When the last muncher of the last visit got home, or -1. */
  lastHomeAt: number
  shots: Shot[]
  /** Caught munchers in tap order (at most CAUGHT_MAX); Beep works the first, since `tickleAt`. */
  tickles: number[]
  tickleAt: number
  beep: BeepPic
  flights: Flight[]
  tool: Tool
  drag: Drag | null
  lifted: Lifted | null
  /** The undo stack, newest last, at most UNDO_MAX, only edits from the last UNDO_FOR. */
  undo: Undo[]
  /** A finger digging a bare patch or the pond: the cell, and when it last dug (or went down, if nothing wanted the thing then); null otherwise. Held, it digs again DIG_GAP after that while something wants the thing. */
  digging: { cell: number; at: number } | null
  /** Blocking things Beep lifts by itself: the jam's machine and when it last lifted one (catalog.ts LIFT_AGAIN). */
  jams: { building: number; at: number }[]
  hint: { step: Step; at: number } | null
  /** The hint's cache of its layout rules (HintMemo); stepHint writes it, inside the step. Null until the first look. */
  hintMemo: HintMemo | null
  /** When the hint's hand last showed and how many times since the step began or her last touch that changed the board or did the step (the waits grow: HAND_AFTER). */
  handAt: number
  handN: number
  /** A child who keeps trying sees the hand at once (hint.ts stepHint): her touches on the board since the step began, the hand last showed or her last touch that changed the board or did the step, and the last tick she tried what the step shows and it did not do it (a tap on it, or a sticker that flew back to the tray), -1 for never. */
  tries: number
  missAt: number
  /** Touches: the last one down, whether a finger is down now. A visit needs a touch in the last TOUCHED_WITHIN. */
  lastTouchAt: number
  touching: boolean
  /** When the pause menu last closed, and this session began (a return after SESSION_GAP away begins a new one). */
  pauseClosedAt: number
  sessionAt: number
  /** The start card's Play was pressed. */
  playing: boolean
  night: Night | null
  /** The patterns found (the plain one, then one more a lab card) and the pencil's pattern now. */
  patterns: number
  pattern: number
  help: Help
  switches: Switches
  /** This step's events, cleared at the start of every step; what actions reported since the last step goes first. */
  events: SimEvent[]
  queued: SimEvent[]
}

// ---------------------------------------------------------------------------------------
// Input

/**
 * Everything the child (or the parent, or a scripted child) can do. The pointer router
 * (touch.ts) turns fingers into these through the view and the hit test; HUD buttons and keys
 * send them directly. `act` handles each in one exhaustive switch.
 */
export type Action =
  /** The start card's Play. */
  | { kind: 'play' }
  /** A touch that lifted without becoming a stroke, a dig or a ghost drag: a tap on what it went down on. */
  | { kind: 'tap'; hit: Hit }
  /** A finger went down on the board, or the last one lifted: the kind rules count touches. */
  | { kind: 'touch'; down: boolean }
  /** A finger digging a bare patch or the pond: down at once, and up. */
  | { kind: 'dig'; cell: number; down: boolean }
  /** A finger landed on or near a muncher: it is caught for Beep's tickle. */
  | { kind: 'tickle'; id: number }
  /** A tray button: pick a tool (a tap on the picked one puts it back: the pencil). */
  | { kind: 'tool'; tool: Tool }
  /** The stroke, hedge line or peel drag so far, as board cells in order (the router has already locked the axis and filled the L's). */
  | { kind: 'drag'; cells: number[] }
  /** The picked sticker's ghost held at a board point (cells, the finger's point; strokes.ts snaps it). */
  | { kind: 'hold'; x: number; y: number }
  /** The drag or the ghost ends: laid, placed or rolled up (commit), or dropped with nothing changed. */
  | { kind: 'release'; commit: boolean }
  /** A tap on the lit pencil: the next belt pattern. */
  | { kind: 'pattern' }
  | { kind: 'oops' }
  /** The lab card's choice: which of the two cards the lab works on first. */
  | { kind: 'choose'; card: 'bubbles' | 'hedges' }
  | { kind: 'launch' }
  /** Her tap on the card that is up closes it (the rules also close it CARD_FOR after it came, unless it waits for this tap: State.cardWaits). */
  | { kind: 'card' }
  /** A new session after SESSION_GAP away: the wake-up and the calm minutes. */
  | { kind: 'session' }
  /** The pause menu closed: visits wait AFTER_PAUSE. */
  | { kind: 'unpaused' }
  | { kind: 'goodnight' }
  /** Good night's tap on the kind that bounces in its nightcap. */
  | { kind: 'tuck'; machine: Kind }
  | { kind: 'wake' }
  /** Start again (the shell keeps the old save; the rules start fresh, the switches kept). */
  | { kind: 'fresh' }
  | { kind: 'sound'; on: boolean }
  | { kind: 'music'; on: boolean }
  | { kind: 'voice'; on: boolean }
  | { kind: 'munchers'; mode: MunchersMode }
  | { kind: 'science'; mode: ScienceMode }
  | { kind: 'fullscreen'; on: boolean }

/** What a point on the board lands on (layout.ts hitTest, in the plan's hit order: munchers first). */
export type Hit =
  | { kind: 'none' }
  /** Off the board: the table round it, or a gutter. It never takes the board. */
  | { kind: 'table' }
  | { kind: 'ground'; cell: number }
  /** A bare rock cell (no digger on it): a touch digs. */
  | { kind: 'patch'; cell: number }
  | { kind: 'pond'; cell: number }
  | { kind: 'tree'; cell: number }
  | { kind: 'flowers'; cell: number }
  | { kind: 'hedge'; cell: number }
  | { kind: 'belt'; cell: number }
  /** A thing riding a belt, by its slot. */
  | { kind: 'thing'; slot: number }
  | { kind: 'building'; id: number }
  /** A building's roof stack. */
  | { kind: 'stack'; id: number }
  | { kind: 'muncher'; id: number }
  | { kind: 'burrow'; burrow: number }
  | { kind: 'heap'; burrow: number }
  | { kind: 'basket' }
  | { kind: 'beep' }
  | { kind: 'moony' }
  /** The hint's sticker ghost on the board: a tap places it there. */
  | { kind: 'spot' }

// ---------------------------------------------------------------------------------------
// Events: what a step reports, for sounds and particles only. Each says where it happens (a
// board point in cells) when it happens somewhere.

export type SimEvent =
  | { kind: 'play' }
  | { kind: 'dig'; cell: number; thing: Thing }
  /** A dig with nowhere to go: Beep taps the patch and points at the full oven. */
  | { kind: 'full'; cell: number; id: number }
  | { kind: 'lay'; cells: number[] }
  | { kind: 'repoint'; cells: number[] }
  | { kind: 'bridge'; cell: number }
  | { kind: 'join'; cell: number }
  | { kind: 'fork'; cell: number }
  | { kind: 'rollUp'; cells: number[] }
  | { kind: 'hedgeIn'; cells: number[] }
  | { kind: 'place'; id: number; sticker: Placeable }
  | { kind: 'peel'; id: number; sticker: Placeable }
  | { kind: 'lift'; x: number; y: number }
  /** A ghost lifted where it cannot go: the sticker flies back with a soft boing. */
  | { kind: 'nope'; x: number; y: number }
  | { kind: 'oops' }
  | { kind: 'pattern'; pattern: number }
  /** A machine started a batch, pushed a thing out, took one in. */
  | { kind: 'batch'; id: number }
  | { kind: 'push'; id: number; thing: Thing }
  | { kind: 'gulp'; id: number; thing: Thing }
  | { kind: 'drink'; bottle: Bottle }
  | { kind: 'fill'; part: PartId; thing: Thing }
  | { kind: 'partFull'; part: PartId }
  | { kind: 'card'; id: CardId }
  | { kind: 'cardClosed'; id: CardId }
  /** Beep carried something (a tap on a thing, a stack, a heap, the basket) or lifted a blocker. */
  | { kind: 'carry'; thing: Thing; x: number; y: number }
  | { kind: 'warn'; burrow: number }
  | { kind: 'hopOut'; id: number; burrow: number }
  | { kind: 'nom'; id: number; thing: Thing; x: number; y: number }
  | { kind: 'napStart'; id: number; building: number }
  | { kind: 'napEnd'; id: number; building: number }
  | { kind: 'burp'; id: number; x: number; y: number }
  | { kind: 'home'; id: number; why: HomeWhy }
  | { kind: 'heap'; burrow: number; thing: Thing }
  | { kind: 'caught'; id: number }
  | { kind: 'giggle'; id: number; x: number; y: number }
  | { kind: 'sneeze'; id: number; x: number; y: number }
  | { kind: 'shot'; tower: number; muncher: number }
  | { kind: 'suds'; id: number; x: number; y: number }
  | { kind: 'picnic'; id: number; burrow: number }
  | { kind: 'shrug'; id: number }
  | { kind: 'friend'; burrow: number }
  | { kind: 'nibble'; cell: number }
  | { kind: 'crunch'; cell: number }
  | { kind: 'regrow'; cell: number }
  | { kind: 'visitOver'; burrow: number }
  | { kind: 'launch' }
  | { kind: 'count'; n: number }
  | { kind: 'liftoff' }
  | { kind: 'landed' }
  /** A tap's answer where nothing else happens: a tree shakes, flowers sway, ground puffs, an empty belt hops, a burrow peeks. */
  | { kind: 'poke'; what: 'tree' | 'flowers' | 'ground' | 'belt' | 'burrow' | 'beep' | 'moony' | 'grey'; x: number; y: number }
  | { kind: 'recipe'; id: number }
  | { kind: 'tickleBusy'; id: number }
  | { kind: 'goodnight' }
  | { kind: 'tuck'; machine: Kind }
  | { kind: 'sleep' }
  | { kind: 'wake' }
  | { kind: 'session' }
  /** Beep says a word aloud (a card's word, a new sticker's name), with the Voice switch on. */
  | { kind: 'say'; word: Said }
  | { kind: 'tool' }
export type EventKind = SimEvent['kind']
/** What a 'say' event says, as an id: a card's word or a new sticker's name (src/words.ts has the words). */
export type Said = { card: CardId } | { sticker: Placeable }

// ---------------------------------------------------------------------------------------
// Small constructors every part uses

/** A count of nothing of each thing. */
export const noCounts = (): Counts => THINGS.map(() => 0)

/** A new building, idle and empty, placed at tick `at`. */
export function newBuilding(id: number, kind: Kind, x: number, y: number, at: number): Building {
  return {
    id,
    kind,
    x,
    y,
    held: noCounts(),
    queue: [],
    batch: null,
    stack: [],
    outTurn: 0,
    inTurn: 0,
    ammo: 0,
    stars: 0,
    napper: -1,
    busyBits: 0,
    starvedBits: 0,
    tucked: false,
    placedAt: at,
    pushAt: -1,
    gulpAt: -1,
    tapAt: -1,
    shotAt: -1,
  }
}
