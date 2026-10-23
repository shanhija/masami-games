import { HOP, ticks, type CardId, type Kind, type Land, type PartId, type Placeable, type Sticker, type Thing } from './model'

/**
 * The data every rule reads: sizes, recipes and rates, the path and what each card brings,
 * the rocket's parts, the munchers' numbers and the hint's waits. Every time is a whole number
 * of ticks, and every timing that trades with belts is a multiple of HOP. The tables in
 * plans/rocket-factory.md are these; the tuning lives here, and the scripted children's tests
 * (child.ts, session.test.ts) say whether it still paces right.
 */

// ---------------------------------------------------------------------------------------
// Buildings

/** A footprint's side, in cells. */
export const SIZE: Record<Kind, number> = { pad: 3, digger: 2, oven: 2, workshop: 2, greenMaker: 2, orangeMaker: 2, lab: 2, pump: 2, tower: 1, bowl: 1 }

/** A maker holds at most HOLD of each input (an oven HOLD rocks in all), and stacks at most STACK made things on its roof before it stops. */
export const HOLD = 4
export const STACK = 4

/** One batch: what a maker takes for it and how long it lasts. A digger digs the rock of the patch under it (board.ts), an oven bakes the rock at the head of its queue (BAKES), and the pump lifts a bubble. */
export interface Recipe {
  takes: Partial<Record<Thing, number>>
  /** What it makes; null where the batch decides (the digger's patch, the oven's rock). */
  makes: Thing | null
  for: number
}
export const RECIPES: Record<'digger' | 'oven' | 'workshop' | 'greenMaker' | 'orangeMaker' | 'pump', Recipe> = {
  digger: { takes: {}, makes: null, for: ticks(2) },
  oven: { takes: {}, makes: null, for: ticks(2) },
  workshop: { takes: { blueBar: 2 }, makes: 'gear', for: ticks(4) },
  greenMaker: { takes: { blueBar: 1, goldBar: 1 }, makes: 'greenBottle', for: ticks(4) },
  orangeMaker: { takes: { gear: 1, bubble: 1 }, makes: 'orangeBottle', for: ticks(4) },
  pump: { takes: {}, makes: 'bubble', for: ticks(1) },
}
/** What an oven bakes each rock into. */
export const BAKES: Partial<Record<Thing, Thing>> = { blueRock: 'blueBar', goldRock: 'goldBar' }
/** The lab drinks one bottle every LAB_DRINK, toward the current card. */
export const LAB_DRINK = ticks(1)

/** A bubble tower: shots per bubble and at most this many shots held (2 bubbles); a shot every TOWER_EVERY at a muncher whose cell is within TOWER_REACH2 (squared cells between cell middles: 3.5 cells); the suds land TOWER_FLIGHT after. */
export const TOWER_AMMO_PER_BUBBLE = 2
export const TOWER_AMMO = 4
export const TOWER_EVERY = ticks(1.5)
export const TOWER_REACH2 = 12
export const TOWER_FLIGHT = ticks(0.4)
/** A snack bowl holds BOWL_HOLD gold bars; a picnic takes BOWL_PER_MUNCHER from it. */
export const BOWL_HOLD = 4
export const BOWL_PER_MUNCHER = 2

for (const r of Object.values(RECIPES)) if (r.for % HOP !== 0) throw new Error('a batch must be a whole number of hops')
if (LAB_DRINK % HOP !== 0) throw new Error('the lab drinks on a hop')

// ---------------------------------------------------------------------------------------
// The path and the rocket

/** What a card needs before it comes. */
export type Needs =
  /** This many blue bars in the rocket's legs. */
  | { kind: 'legs'; n: number }
  /** A gold bar baked while this card is the next one and no card is up (machines.ts). */
  | { kind: 'goldBar' }
  /** Bottles drunk by the lab (scaled by the cost dial and the parent's Science switch). */
  | { kind: 'bottles'; green: number; orange: number }

export interface Card {
  id: CardId
  /** The card's one word, which Beep says aloud. */
  word: string
  needs: Needs
  /** The stickers it brings. */
  gives: Partial<Record<Sticker, number>>
  /** What it opens: the next land, a rocket part, the launch. */
  land: Land | null
  part: PartId | null
  launch: boolean
  /** It brings one more belt pattern. */
  pattern: boolean
}

/**
 * The path in order. 'bubbles' and 'hedges' are the one choice: after 'gears' the lab card
 * shows both and the one she picks comes first (CHOICE). Lab cards need bottles; the first
 * three come from the rocket and the ovens. The costs are about 5 to 6 minutes of the bottle
 * lines the hint has built by each card (one green maker until the second Land!, two after,
 * and the orange maker from Stars!), so the factory sets the clock and no card keeps her
 * waiting 8 minutes; Fuel! is the long last card, where waiting is the countdown's (the
 * scripted children's measurements, session.test.ts and plans/rocket-factory.md, Science).
 */
export const PATH: readonly Card[] = [
  { id: 'digger', word: 'Digger!', needs: { kind: 'legs', n: 3 }, gives: { digger: 1 }, land: null, part: null, launch: false, pattern: false },
  { id: 'gold', word: 'Gold!', needs: { kind: 'legs', n: 20 }, gives: { digger: 1, oven: 1 }, land: null, part: null, launch: false, pattern: false },
  { id: 'science', word: 'Science!', needs: { kind: 'goldBar' }, gives: { greenMaker: 1, lab: 1 }, land: null, part: null, launch: false, pattern: false },
  { id: 'gears', word: 'Gears!', needs: { kind: 'bottles', green: 5, orange: 0 }, gives: { workshop: 1, digger: 1, oven: 1 }, land: null, part: 'body', launch: false, pattern: true },
  { id: 'bubbles', word: 'Bubbles!', needs: { kind: 'bottles', green: 80, orange: 0 }, gives: { pump: 1, tower: 2 }, land: null, part: null, launch: false, pattern: true },
  { id: 'hedges', word: 'Hedges!', needs: { kind: 'bottles', green: 80, orange: 0 }, gives: { hedge: 8 }, land: null, part: null, launch: false, pattern: true },
  { id: 'land2', word: 'Land!', needs: { kind: 'bottles', green: 90, orange: 0 }, gives: { tower: 1, hedge: 3 }, land: 2, part: 'nose', launch: false, pattern: true },
  { id: 'stars', word: 'Stars!', needs: { kind: 'bottles', green: 85, orange: 0 }, gives: { orangeMaker: 1 }, land: null, part: null, launch: false, pattern: true },
  { id: 'snacks', word: 'Snacks!', needs: { kind: 'bottles', green: 75, orange: 20 }, gives: { bowl: 2 }, land: null, part: null, launch: false, pattern: true },
  { id: 'land3', word: 'Land!', needs: { kind: 'bottles', green: 90, orange: 45 }, gives: { digger: 1, oven: 1, greenMaker: 1, tower: 1, bowl: 1, hedge: 3 }, land: 3, part: null, launch: false, pattern: true },
  { id: 'rocket', word: 'Rocket!', needs: { kind: 'bottles', green: 130, orange: 40 }, gives: {}, land: null, part: 'engine', launch: false, pattern: true },
  { id: 'fuel', word: 'Fuel!', needs: { kind: 'bottles', green: 180, orange: 0 }, gives: {}, land: null, part: null, launch: true, pattern: true },
]
const CARD_OF = new Map(PATH.map((c) => [c.id, c] as const))
export const card = (id: CardId): Card => CARD_OF.get(id)!
/** The fork in the path: both come after 'gears', in the order she picks. */
export const CHOICE = ['bubbles', 'hedges'] as const
/** The stickers she has before any card: the oven already standing on the board. */
export const START_STICKERS: Partial<Record<Sticker, number>> = { oven: 1 }

/** Every bottle cost is multiplied by this and rounded up: the one dial for the whole pace. The parent's Science switch multiplies it by QUICKER. */
export const COST_SCALE = 1
export const QUICKER = 0.6

/** The rocket's parts: the thing each takes, how many, and the card that opens it (null: open from the start). Each fills from the bottom like a jar. The nose takes gears like the body, so the workshop's belt to the pad fills both: no gold line has to find its way to the pad round the bubble line (hint.ts, the blueprint). */
export const PART_INFO: Record<PartId, { thing: Thing; n: number; opens: CardId | null }> = {
  legs: { thing: 'blueBar', n: 20, opens: null },
  body: { thing: 'gear', n: 30, opens: 'gears' },
  nose: { thing: 'gear', n: 10, opens: 'land2' },
  engine: { thing: 'orangeBottle', n: 40, opens: 'rocket' },
}

/** The belt patterns, printed tone on tone: the plain one at the start, then one more with each card that brings one. The save stores indices: append only. */
export const PATTERNS = ['plain', 'stripes', 'dots', 'zigzag', 'hearts', 'waves', 'checks', 'diamonds', 'scales', 'leaves'] as const
export type Pattern = (typeof PATTERNS)[number]

// ---------------------------------------------------------------------------------------
// Munchers

/** A burrow wakes at HUNGER_FULL; while the kind rules hold a visit back it waits at WAIT_AT (the face leaning out). Its stages show on the mound from STAGE_AT: the nightcap slipping, the calyx over the sill, the sleepy face. */
export const HUNGER_FULL = 1000
export const WAIT_AT = 999
export const STAGE_AT = [400, 700, 900] as const
/**
 * Each second a burrow's hunger grows by `base`, plus `perWorking` for each working machine on
 * the board (up to `workingCap` of them), plus `onFlowers` for each working machine with a
 * cell on its flowers and `nearFlowers` for each within `nearCells` of them (and not on
 * them); from Rocket! on, the drumming pad adds `pad` to every burrow. The Few switch halves
 * the sum and drops the flower terms.
 */
export const HUNGER = { base: 4, perWorking: 1, workingCap: 8, onFlowers: 5, nearFlowers: 2, nearCells: 2, pad: 5 } as const

/** The 5 s warning, then the munchers hop out of the door HOP_OUT_EVERY apart. */
export const WARN = ticks(5)
export const HOP_OUT_EVERY = ticks(1)
/** The kind rules: a visit starts only when the last muncher got home QUIET_AFTER ago, the board was touched within TOUCHED_WITHIN, no card closed within AFTER_CARD, the pause menu did not close within AFTER_PAUSE, the board did not turn within AFTER_TURN, and the session is older than SESSION_CALM. */
export const QUIET_AFTER = ticks(60)
export const TOUCHED_WITHIN = ticks(30)
export const AFTER_CARD = ticks(20)
export const AFTER_PAUSE = ticks(20)
export const AFTER_TURN = ticks(10)
export const SESSION_CALM = ticks(120)
/** Burrow A sleeps until Gears!, and its scout comes SCOUT_AFTER later: one slow muncher with small cheeks that never naps. */
export const SCOUT_AFTER = ticks(90)
export const SCOUT_STEP = 75
export const SCOUT_CHEEKS = 2
/** A visit is 1 muncher, plus one for each working machine on its flowers (at most FLOWER_EXTRA), plus one when VISIT_BUSY or more machines work; at most VISIT_CAP for the land that is open. */
export const FLOWER_EXTRA = 2
export const VISIT_BUSY = 8
export const VISIT_CAP: Record<Land, number> = { 1: 2, 2: 3, 3: 3 }
/** Ticks a cell: walking (1.2 cells a second), hopping home (1), giggling home after a tickle (2), floating home in suds (1.5). */
export const WALK_STEP = 50
export const HOME_STEP = 60
export const TICKLED_STEP = 30
export const SUDS_STEP = 40
/** Cheeks hold CHEEKS things; a sitting muncher grabs the thing trying to enter its cell every GRAB_EVERY, and walks on after WALK_ON with nothing arriving. */
export const CHEEKS = 4
export const GRAB_EVERY = ticks(1.5)
export const WALK_ON = ticks(5)
/** A nap: on a bottle maker, elsewhere. The long nap on a bottle maker is what a child who never defends loses most, and what a tower by the bottle line takes back at once. */
export const NAP_BOTTLE = ticks(45)
export const NAP_OTHER = ticks(20)
/** Out for OUT_FOR, a muncher goes home whatever it is doing. */
export const OUT_FOR = ticks(60)
/** A boxed-in muncher nibbles a hedge for NIBBLE_FOR (three bites); the stump regrows REGROW after nobody stands on it. */
export const NIBBLE_FOR = ticks(8)
export const REGROW = ticks(30)
/** Beep tickles one caught muncher every TICKLE_FOR; at most CAUGHT_MAX wait caught. */
export const TICKLE_FOR = ticks(1.5)
export const CAUGHT_MAX = 3
/** A burrow's sleep after a visit (each term per muncher or thing), at most `max`. */
export const SLEEP = { base: ticks(40), perKept: ticks(5), perTickled: ticks(15), perSent: ticks(30), perNap: ticks(20), max: ticks(240) } as const
/** A new burrow waves hello and sleeps this long when its land opens. */
export const HELLO_SLEEP = ticks(120)
/** Polite munchers sit beside the bottle line this long and go home. */
export const POLITE_FOR = ticks(20)
/** At an empty bowl a muncher peers in and shrugs for SHRUG_FOR before it goes looking for fizz (draw/critters.ts plays its shrug over the same time); at a full one its picnic, a bite of each gold bar, lasts PICNIC_FOR. */
export const SHRUG_FOR = ticks(1.2)
export const PICNIC_FOR = ticks(3)
/** A tap on a burrow shows its paw prints this long. */
export const PAWS_FOR = ticks(5)

// ---------------------------------------------------------------------------------------
// Beep, jams and the hint

/** Beep's flight to a job, at most. */
export const BEEP_FLY = ticks(0.35)
/** Beep rests this long after a job's pose began, then floats home to its spot by the basket (beep.ts restBeep). */
export const BEEP_REST = ticks(3)
/** While the hint has nothing for her to do, Beep points at the rocket's part that fills (or the lab), its arm springing out again this often: the waiting reads as watching, and nothing flashes. */
export const BEEP_POINT_AGAIN = ticks(12)
/** A held dig digs again at most this often, and only while an oven has room. */
export const DIG_GAP = ticks(0.5)
/** A carry flies at most FLIGHT_MAX pictures; the rest are credited at once. */
export const FLIGHT_MAX = 8
/** A thing blocking a starved machine becomes the hint after BLOCKED_HINT; Beep lifts it away LIFT_AFTER later, and the jam's next blocker every LIFT_AGAIN until the machine takes something. */
export const BLOCKED_HINT = ticks(5)
export const LIFT_AFTER = ticks(20)
export const LIFT_AGAIN = ticks(2)

/** Once a thing bounces it keeps bouncing at least HINT_HOLD; the hand shows after each wait of HAND_AFTER with no touch (the last one repeats) and taps for HAND_FOR. */
export const HINT_HOLD = ticks(4)
export const HAND_AFTER = [ticks(8), ticks(20), ticks(40)] as const
export const HAND_FOR = ticks(2)
/** A child who keeps trying sees the hand at once: after HAND_TRIES touches that did not do the step, a tap on what it shows that cannot do it, or a sticker that flew back; never sooner than HAND_AGAIN after the last hand, so its gesture plays out (under 7 s at the longest: a tower's belt traced and its sticker carried). */
export const HAND_TRIES = 3
export const HAND_AGAIN = ticks(8)
/** The bottleneck rule jumps up when the lab or the pad has waited BOTTLENECK_WAIT with a belt upstream full; a machine counts as the slowest when busy BUSY_SHARE of the last BUSY_WINDOW seconds. */
export const BOTTLENECK_WAIT = ticks(20)
export const BUSY_WINDOW = 30
export const BUSY_SHARE = 27
/** The dotted path shows in full for her first HELP_FULL belts of each kind of link; a sticker kind placed HELP_FULL times shows its ghost only after GHOST_DELAY. */
export const HELP_FULL = 3
export const GHOST_DELAY = ticks(10)
/** Oops bounces for OOPS_HINT after an edit that broke the factory, and the hand taps it after OOPS_HAND. */
export const OOPS_HINT = ticks(10)
export const OOPS_HAND = ticks(4)
/** A heap this big bounces. */
export const HEAP_HINT = 6
/** The hint looks again every HINT_EVERY ticks (rules.step calls hint.ts stepHint on those ticks), and counts the links she laid in that span into help.links. */
export const HINT_EVERY = ticks(0.5)
/** A burrow whose heap holds DEFEND_KEPT or more things (its munchers got away with that much) gets the hint's defence: a tower or a hedge line on its paw prints. */
export const DEFEND_KEPT = 4

// ---------------------------------------------------------------------------------------
// Edits, cards, the land, the launch and the night

export const STROKE_MAX = 40
export const UNDO_MAX = 10
export const UNDO_FOR = ticks(60)
/** The land's flaps fold open and the view eases out over GROW. */
export const GROW = ticks(2)
/** A card closes after CARD_FOR, unless nobody touched the board for CARD_IDLE before it came: then it waits for a tap. */
export const CARD_FOR = ticks(4)
export const CARD_IDLE = ticks(30)
/** A finger down holds a card, the land's ease and the launch back at most this long. */
export const LIFT_WAIT = ticks(3)
/** The launch: the countdown from 5 starts COUNT_AT after the tap, one a second; liftoff, then the flight lands LAUNCH_FOR after the tap. */
export const COUNT_AT = ticks(3)
export const LAUNCH_FOR = ticks(40)
/** Good night: a kind bouncing in its nightcap tucks itself in after NIGHT_TUCK untapped. */
export const NIGHT_TUCK = ticks(8)

/** Real seconds (the shell's clock, not ticks): a return after SESSION_GAP away starts a new session; IDLE_PAUSE untouched pauses the game, but while a machine works or a muncher is out she may be watching it, which is play, so then it waits up to IDLE_MOST. */
export const SESSION_GAP = 10 * 60
export const IDLE_PAUSE = 3 * 60
export const IDLE_MOST = 10 * 60

/** Every kind the child places, in the save's order. */
export const PLACEABLE: readonly Placeable[] = ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'tower', 'bowl']
/** What Beep says the first time she places a sticker of each kind: a word or two a five-year-old knows, and one name per thing, so a sticker a card brings alone is called by its card's word (the orange bottle maker is Stars!, as its card is; the snack bowl comes with Snacks!). */
export const STICKER_WORD: Record<Placeable, string> = {
  digger: 'Digger!',
  oven: 'Oven!',
  workshop: 'Workshop!',
  greenMaker: 'Green bottles!',
  orangeMaker: 'Stars!',
  lab: 'Lab!',
  pump: 'Pump!',
  tower: 'Bubble tower!',
  bowl: 'Snack bowl!',
}
