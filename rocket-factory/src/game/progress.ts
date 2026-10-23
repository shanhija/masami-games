import { cellOf, onBoard, stepCell, xOf, yOf } from './board'
import { hasMouths, owners, rebuild } from './belts'
import { BAKES, HELLO_SLEEP, HOLD, HUNGER_FULL, PART_INFO, PATTERNS, PLACEABLE, REGROW, SIZE, SLEEP, STACK, TOWER_AMMO, TOWER_AMMO_PER_BUBBLE } from './catalog'
import {
  CARDS,
  CELLS,
  COLS,
  HOP,
  HZ,
  MUNCHER_MODES,
  PARTS,
  ROWS,
  THINGS,
  inSlot,
  newBuilding,
  noCounts,
  opposite,
  outSlot,
  overIn,
  overOut,
  thingIndex,
  ticks,
  type Building,
  type CardId,
  type Counts,
  type Dir,
  type PartId,
  type Placeable,
  type State,
  type Switches,
  type Thing,
} from './model'
import { blankState } from './rules'
import { blocked, headOn, planHedge, planPlace, settleForks } from './strokes'
import { gives, wants, wantsUnder } from './trade'

/**
 * The save (plans/rocket-factory.md, Save, pause and sessions): one JSON object under SAVE_KEY
 * in localStorage, its own shape (a Keep) and never the State. Belt cells are one string per
 * board row, buildings are kind names with their contents by thing name, counts are
 * {thing: count}, and every time is seconds (left, or since), never a tick: the tick starts
 * again with each page load. Sticker counts are derived (strokes.ts stickersLeft), never
 * stored, so a building that no longer fits is simply not placed and its sticker is back in
 * the tray. Munchers, flights and Oops are not kept: each muncher's cheeks go onto its
 * burrow's heap. A loaded game is a new day: no card, launch or night is kept, and nothing
 * is tucked in.
 *
 * Reading forgives, field by field: a bad cell is ground, a bad count 0, an unknown name
 * dropped, a building that does not fit stays in the tray, and what it or a dropped belt cell
 * held waits in Beep's basket. Only text that is not a version 2 object starts fresh. Ids,
 * letters and names are only ever added.
 */

/** Version 2 is the big map (60 x 36 cells, no lands or flaps) and lives under its own keys: a version 1 save (the 20 x 12 board, under 'rocket-factory' and 'rocket-factory-old') is never read, written or deleted. */
export const SAVE_KEY = 'rocket-factory-2'
/** Start again puts the factory aside here, the last OLD_MOST of them newest first, and Bring back fetches one: a curious child who learns the hold's ring and holds it again never throws away her real factory. */
export const OLD_KEY = 'rocket-factory-2-old'
export const OLD_MOST = 3

/** Whether Start again puts factory k aside in front of the newest one already there: not when k found fewer cards and flew no more rockets, so holding the ring again on a young board never pushes her real factory out. */
export const worthKeeping = (k: Keep, newest: Keep | undefined) => newest === undefined || k.found.length >= newest.found.length || k.launches > newest.launches

/** Things by name, only those there are some of. */
export type Named = Partial<Record<Thing, number>>

/** A building as kept: where it stands and what is in it. */
export interface KeptBuilding {
  id: number
  kind: Placeable
  x: number
  y: number
  /** A maker's inputs, the lab's shelf, a tower's bubbles, a bowl's gold bars. */
  held: Named
  /** An oven's rocks in arrival order. */
  queue: Thing[]
  /** Made things on its roof, oldest first. */
  stack: Thing[]
  /** The batch in progress: what it makes, seconds until it ends, seconds since it began. */
  batch: { makes: Thing; left: number; age: number } | null
  outTurn: number
  inTurn: number
  ammo: number
  stars: number
  /** The last seconds' working and starved bits (model.ts Building busyBits, starvedBits). */
  busy: number
  starved: number
}

export interface KeptBurrow {
  hunger: number
  /** Seconds it sleeps on, or null awake. */
  sleep: number | null
  heap: Named
  friend: boolean
  visits: number
}

export interface Keep {
  v: 2
  /** How far into its second the factory was, seconds from 0 to just under 1: a loaded game starts there, so every hop, every batch's end and every once-a-second rule keeps its beat. */
  second: number
  /** ROWS strings of COLS cells each, a space apart: '.' for no belt, else the cell's code (see CELL). */
  belts: string[]
  /** Hedges as [x, y], and stumps as [x, y, seconds until it regrows]. */
  hedges: [number, number][]
  stumps: [number, number, number][]
  /** Every building but the pad (always id 0 at its place), in the board's order. */
  buildings: KeptBuilding[]
  nextId: number
  nextMuncher: number
  basket: Named
  found: CardId[]
  choice: 'bubbles' | 'hedges' | null
  /** The lab's bottles toward its card, and seconds since it last drank (null for never). */
  lab: { green: number; orange: number; drank: number | null }
  rocket: Record<PartId, number>
  launches: number
  burrows: KeptBurrow[]
  patterns: number
  pattern: number
  help: { links: Record<string, number>; placed: Record<Placeable, number>; hedges: number }
  switches: Switches
}

/**
 * A belt cell's code: its in side, out side, fork side and bridge (over lane) side as digits
 * (0 east, 1 south, 2 west, 3 north, '-' for none), its pattern (base 36), its join turn and
 * its fork turn; then, when anything rides it, ':' and its slots' things as letters (THING_LETTER,
 * '-' empty): in and out, and on a bridge the over lane's in and out; then, when the thing at
 * its end has stood blocked, '@' and the seconds it has; and on a bridge, when the thing at its
 * hump's end has, '~' and its seconds. "20-0000:-b@2.5" is a straight belt from west to east
 * with a blue bar at its east end, blocked for 2.5 s.
 */
const CELL = /^([0-3])([0-3])([0-3-])([0-3-])([0-9a-z])([0-9])([0-9])(?::([^@~]+))?(?:@(\d+(?:\.\d+)?(?:e-?\d+)?))?(?:~(\d+(?:\.\d+)?(?:e-?\d+)?))?$/
/** The letter each thing rides a belt as in a saved row. Append only. */
const THING_LETTER: Record<Thing, string> = { blueRock: 'r', goldRock: 'n', bubble: 'o', blueBar: 'b', goldBar: 'y', gear: 'c', greenBottle: 'G', orangeBottle: 'O' }
const EMPTY = '-'
const LETTER_THING = new Map(Object.entries(THING_LETTER).map(([thing, letter]) => [letter, thing as Thing]))

/** A loaded game's tick starts this far in (plus its second), so every stamp a keep brings back as seconds since (at most AGE_MAX of them) is a real tick: a stamp before 0 would read as never. */
const AGE_MAX = 120
const LOAD_AT = ticks(AGE_MAX)
/** A burrow sleeps at most this long. */
const SLEEP_MOST = Math.max(SLEEP.max, HELLO_SLEEP) / HZ

/** One belt cell as the save reads and writes it. */
interface CellData {
  in: Dir
  out: Dir
  fork: number
  over: number
  pattern: number
  joinTurn: number
  forkTurn: number
  /** In, out, and on a bridge over in and over out. */
  slots: (Thing | null)[]
  /** Seconds the thing at its end has stood blocked, or null; and the same at its bridge's hump's end. */
  blocked: number | null
  overBlocked: number | null
}

const side = (d: number) => (d < 0 ? '-' : String(d))
const digit = (ch: string) => (ch === '-' ? -1 : Number(ch))

function encodeCell(d: CellData): string {
  if (d.pattern >= 36 || d.joinTurn > 9 || d.forkTurn > 9) throw new Error(`a belt cell's pattern ${d.pattern} or turns ${d.joinTurn}, ${d.forkTurn} do not fit the save's one character each`)
  let code = `${d.in}${d.out}${side(d.fork)}${side(d.over)}${d.pattern.toString(36)}${d.joinTurn}${d.forkTurn}`
  if (d.slots.some((t) => t !== null)) code += `:${d.slots.map((t) => (t === null ? EMPTY : THING_LETTER[t])).join('')}`
  if (d.blocked !== null) code += `@${d.blocked}`
  if (d.overBlocked !== null) code += `~${d.overBlocked}`
  return code
}

/**
 * A saved cell's code read alone, or null when it is ground or bad: sides that are not a
 * belt (in and out the same, a fork or a bridge on a bend or along its own lane, both on one
 * cell), or things for lanes it does not have. An unknown thing letter leaves its slot empty,
 * a pattern the game does not know is the plain one.
 */
function decodeCell(code: string): CellData | null {
  const m = CELL.exec(code)
  if (m === null) return null
  const d: CellData = { in: Number(m[1]) as Dir, out: Number(m[2]) as Dir, fork: digit(m[3]!), over: digit(m[4]!), pattern: parseInt(m[5]!, 36), joinTurn: Number(m[6]), forkTurn: Number(m[7]), slots: [], blocked: null, overBlocked: null }
  if (d.in === d.out) return null
  const straight = d.in === opposite(d.out)
  if ((d.fork >= 0 || d.over >= 0) && !straight) return null
  if (d.fork >= 0 && d.over >= 0) return null
  if ([d.fork, d.over].some((x) => x === d.in || x === d.out)) return null
  if (d.pattern >= PATTERNS.length) d.pattern = 0
  const lanes = d.over >= 0 ? 4 : 2
  const letters = m[8] ?? EMPTY.repeat(lanes)
  if (letters.length !== lanes) return null
  d.slots = [...letters].map((ch) => LETTER_THING.get(ch) ?? null)
  d.blocked = m[9] === undefined ? null : Math.min(AGE_MAX, Number(m[9]))
  d.overBlocked = m[10] === undefined || d.over < 0 ? null : Math.min(AGE_MAX, Number(m[10]))
  return d
}

/** Cell c's data in the state, or null with no belt. */
function cellData(s: State, c: number): CellData | null {
  const b = s.belts
  if (b.out[c]! < 0) return null
  const slots = b.over[c]! >= 0 ? [inSlot(c), outSlot(c), overIn(c), overOut(c)] : [inSlot(c), outSlot(c)]
  return {
    in: b.in[c] as Dir,
    out: b.out[c] as Dir,
    fork: b.fork[c]!,
    over: b.over[c]!,
    pattern: b.pattern[c]!,
    joinTurn: b.joinTurn[c]!,
    forkTurn: b.forkTurn[c]!,
    slots: slots.map((x) => (b.slot[x]! < 0 ? null : THINGS[b.slot[x]!]!)),
    blocked: b.blockedSince[c]! < 0 ? null : Math.min(AGE_MAX * HZ, s.tick - b.blockedSince[c]!) / HZ,
    overBlocked: b.over[c]! < 0 || b.blockedSince[CELLS + c]! < 0 ? null : Math.min(AGE_MAX * HZ, s.tick - b.blockedSince[CELLS + c]!) / HZ,
  }
}

/** Counts by THINGS index as names, only those there are some of. */
function named(counts: Counts): Named {
  const out: Named = {}
  counts.forEach((n, i) => {
    if (n > 0) out[THINGS[i]!] = n
  })
  return out
}
/** Names as counts by THINGS index. */
function counted(n: Named): Counts {
  const out = noCounts()
  for (const [thing, k] of Object.entries(n)) out[thingIndex(thing as Thing)] = k
  return out
}
/** Named things one by one, in THINGS order. */
const each = (n: Named): Thing[] => THINGS.flatMap((t) => Array.from({ length: n[t] ?? 0 }, () => t))

/** Seconds from tick `at` to tick `now`, at most AGE_MAX. */
const ago = (now: number, at: number) => Math.min(AGE_MAX * HZ, now - at) / HZ

/**
 * The keep of a state: what the save holds. Every muncher out is sent home in it, its cheeks
 * on its burrow's heap; a batch, a burrow's sleep and a stump keep their seconds left, a
 * blocked belt and the lab's last drink their seconds since.
 */
export function keepOf(s: State): Keep {
  const now = s.tick
  const heaps = s.burrows.map((b) => [...b.heap])
  for (const m of s.munchers) for (const thing of m.cheeks) heaps[m.burrow]![thingIndex(thing)]!++
  const belts: string[] = []
  for (let y = 0; y < ROWS; y++) {
    const row: string[] = []
    for (let x = 0; x < COLS; x++) {
      const d = cellData(s, cellOf(x, y))
      row.push(d === null ? '.' : encodeCell(d))
    }
    belts.push(row.join(' '))
  }
  const hedges: [number, number][] = []
  const stumps: [number, number, number][] = []
  for (let c = 0; c < CELLS; c++) {
    if (s.hedge[c] === 1) hedges.push([xOf(c), yOf(c)])
    if (s.hedge[c] === 2) stumps.push([xOf(c), yOf(c), s.stumpAt[c]! < 0 ? 0 : Math.max(0, s.stumpAt[c]! + REGROW - now) / HZ])
  }
  return {
    v: 2,
    second: (now % HZ) / HZ,
    belts,
    hedges,
    stumps,
    buildings: s.buildings
      .filter((b) => b.kind !== 'pad')
      .map((b) => ({
        id: b.id,
        kind: b.kind as Placeable,
        x: b.x,
        y: b.y,
        held: named(b.held),
        queue: [...b.queue],
        stack: [...b.stack],
        batch: b.batch === null ? null : { makes: b.batch.makes, left: Math.max(0, b.batch.until - now) / HZ, age: ago(now, b.batch.at) },
        outTurn: b.outTurn,
        inTurn: b.inTurn,
        ammo: b.ammo,
        stars: b.stars,
        busy: b.busyBits,
        starved: b.starvedBits,
      })),
    nextId: s.nextId,
    nextMuncher: s.nextMuncher,
    basket: named(s.basket),
    found: [...s.found],
    choice: s.choice,
    lab: { green: s.lab.got[0], orange: s.lab.got[1], drank: s.lab.drinkAt < 0 ? null : ago(now, s.lab.drinkAt) },
    rocket: Object.fromEntries(PARTS.map((p, i) => [p, s.rocket.got[i]!])) as Record<PartId, number>,
    launches: s.launches,
    burrows: s.burrows.map((b, i) => ({ hunger: b.hunger, sleep: b.sleepUntil > now ? (b.sleepUntil - now) / HZ : null, heap: named(heaps[i]!), friend: b.friend, visits: b.visits })),
    patterns: s.patterns,
    pattern: s.pattern,
    help: { links: { ...s.help.links }, placed: { ...s.help.placed }, hedges: s.help.hedges },
    switches: { ...s.switches },
  }
}

/** A new game's keep: the board as it comes, the oven standing at the start, every switch on. */
export function freshKeep(): Keep {
  return keepOf(blankState(0))
}

type Data = Record<string, unknown>
const isObject = (x: unknown): x is Data => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const count = (x: unknown) => (isCount(x) ? x : 0)
/** A time in seconds: a finite number from 0 to `most`, else null. */
const seconds = (x: unknown, most: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(x, most) : null)
/** `x` if it is one of `options`, else `fallback`. */
const oneOf = <T>(options: readonly T[], x: unknown, fallback: T): T => (options.includes(x as T) ? (x as T) : fallback)
const array = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const isThing = (x: unknown): x is Thing => (THINGS as readonly unknown[]).includes(x)
/** Counts by thing name: an unknown name is dropped, a bad count is 0 (and left out). */
function readNamed(x: unknown): Named {
  const d = isObject(x) ? x : {}
  const out: Named = {}
  for (const t of THINGS) if (count(d[t]) > 0) out[t] = count(d[t])
  return out
}
/** A list of thing names, an unknown name dropped. */
const readThings = (x: unknown): Thing[] => array(x).filter(isThing)
/** A board cell [x, y] with whole numbers on the board, and its rest. */
function readPlace(x: unknown): { x: number; y: number; rest: unknown[] } | null {
  const a = array(x)
  if (!isCount(a[0]) || !isCount(a[1]) || !onBoard(a[0], a[1])) return null
  return { x: a[0], y: a[1], rest: a.slice(2) }
}

function readBuilding(x: unknown): KeptBuilding | null {
  if (!isObject(x)) return null
  const kind = oneOf<Placeable | null>(PLACEABLE, x.kind, null)
  if (kind === null || !isCount(x.x) || !isCount(x.y)) return null
  const b = isObject(x.batch) ? x.batch : null
  const left = b === null ? null : seconds(b.left, AGE_MAX)
  const age = b === null ? null : seconds(b.age, AGE_MAX)
  return {
    id: count(x.id),
    kind,
    x: x.x,
    y: x.y,
    held: readNamed(x.held),
    queue: readThings(x.queue),
    stack: readThings(x.stack),
    batch: b !== null && isThing(b.makes) && left !== null && age !== null ? { makes: b.makes, left, age } : null,
    outTurn: count(x.outTurn),
    inTurn: count(x.inTurn),
    ammo: count(x.ammo),
    stars: count(x.stars),
    busy: count(x.busy),
    starved: count(x.starved),
  }
}

/**
 * Reads a saved keep. Null, text that is not JSON, and JSON that is not an object with
 * `v: 2` start fresh; anything else is kept field by field (the file's header). What only
 * the board can judge (a building that no longer fits, a belt where none can be) waits for
 * stateFromKeep.
 */
export function parseKeep(text: string | null): Keep {
  return (text === null ? null : readKeep(json(text))) ?? freshKeep()
}

/** Whether `text` is a save at all, a version 2 keep: a copy brought back from a file must be one. */
export const isKeep = (text: string) => readKeep(json(text)) !== null

/** The factories Start again put aside (OLD_KEY), newest first and at most OLD_MOST: a list of keeps, or the one keep an older save held there. Anything that is not a keep is left out. */
export function parseOld(text: string | null): Keep[] {
  if (text === null) return []
  const data = json(text)
  return (Array.isArray(data) ? data : [data])
    .map(readKeep)
    .filter((k) => k !== null)
    .slice(0, OLD_MOST)
}

export const serializeOld = (old: readonly Keep[]) => JSON.stringify(old)

/** Text as JSON, or null for text that is not JSON: junk like any other (JSON.parse has no way to say so but throwing). */
function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A keep read field by field from JSON (the file's header), or null when it is not an object with `v: 2`. */
function readKeep(data: unknown): Keep | null {
  if (!isObject(data) || data.v !== 2) return null
  const fresh = freshKeep()
  const found: CardId[] = []
  for (const id of array(data.found)) if ((CARDS as readonly unknown[]).includes(id) && !found.includes(id as CardId)) found.push(id as CardId)
  const rows = array(data.belts)
  const belts = Array.from({ length: ROWS }, (_, y) => {
    const row = rows[y]
    const codes = typeof row === 'string' ? row.split(' ') : []
    return Array.from({ length: COLS }, (_, x) => {
      const d = decodeCell(codes[x] ?? '.')
      return d === null ? '.' : encodeCell(d)
    }).join(' ')
  })
  const seen = new Set<number>()
  const fresh1 = (p: { x: number; y: number }) => {
    const c = cellOf(p.x, p.y)
    if (seen.has(c)) return false
    seen.add(c)
    return true
  }
  const hedges: [number, number][] = []
  for (const h of array(data.hedges)) {
    const p = readPlace(h)
    if (p !== null && fresh1(p)) hedges.push([p.x, p.y])
  }
  const stumps: [number, number, number][] = []
  for (const h of array(data.stumps)) {
    const p = readPlace(h)
    const left = p === null ? null : seconds(p.rest[0], REGROW / HZ)
    if (p !== null && left !== null && fresh1(p)) stumps.push([p.x, p.y, left])
  }
  const buildings = array(data.buildings)
    .map(readBuilding)
    .filter((b) => b !== null)
  const lab = isObject(data.lab) ? data.lab : {}
  const rocket = isObject(data.rocket) ? data.rocket : {}
  const savedBurrows = array(data.burrows)
  const burrows = fresh.burrows.map((f, i): KeptBurrow => {
    const b = savedBurrows[i]
    if (!isObject(b)) return f
    return { hunger: Math.min(HUNGER_FULL, count(b.hunger)), sleep: seconds(b.sleep, SLEEP_MOST), heap: readNamed(b.heap), friend: b.friend === true, visits: count(b.visits) }
  })
  const patterns = Math.min(PATTERNS.length, Math.max(1, count(data.patterns)))
  const help = isObject(data.help) ? data.help : {}
  const links: Record<string, number> = {}
  if (isObject(help.links)) for (const [k, n] of Object.entries(help.links)) if (isCount(n)) links[k] = n
  const placed = isObject(help.placed) ? help.placed : {}
  const sw = isObject(data.switches) ? data.switches : {}
  return {
    v: 2,
    second: seconds(data.second, 1 - 1 / HZ) ?? 0,
    belts,
    hedges,
    stumps,
    buildings,
    nextId: Math.max(2, count(data.nextId)),
    nextMuncher: Math.max(1, count(data.nextMuncher)),
    basket: readNamed(data.basket),
    found,
    choice: oneOf(['bubbles', 'hedges', null] as const, data.choice, null),
    lab: { green: count(lab.green), orange: count(lab.orange), drank: seconds(lab.drank, AGE_MAX) },
    rocket: Object.fromEntries(PARTS.map((p) => [p, Math.min(PART_INFO[p].n, count(rocket[p]))])) as Record<PartId, number>,
    launches: count(data.launches),
    burrows,
    patterns,
    pattern: Math.min(patterns - 1, count(data.pattern)),
    help: { links, placed: Object.fromEntries(PLACEABLE.map((k) => [k, count(placed[k])])) as Record<Placeable, number>, hedges: count(help.hedges) },
    switches: {
      sound: typeof sw.sound === 'boolean' ? sw.sound : true,
      music: typeof sw.music === 'boolean' ? sw.music : true,
      voice: typeof sw.voice === 'boolean' ? sw.voice : true,
      munchers: oneOf(MUNCHER_MODES, sw.munchers, 'many'),
      science: oneOf(['normal', 'quicker'] as const, sw.science, 'normal'),
      noFullscreen: sw.noFullscreen === true,
    },
  }
}

export function serializeKeep(k: Keep): string {
  return JSON.stringify(k)
}

/**
 * Whether building b, being loaded, takes `thing` back among its held things: what its mouths
 * take now (trade.ts wants: a maker its recipe's inputs, HOLD of each, the lab every bottle), a
 * bowl the gold bars it takes from its belt (wantsUnder), a tower the bubbles behind its shots
 * (two a bubble; wantsUnder asks about room for more shots, which is another question). An
 * oven's rocks wait in its queue, never among its held things.
 */
function holds(s: State, b: Building, thing: Thing): boolean {
  if (b.kind === 'tower') return thing === 'bubble' && b.held[thingIndex(thing)]! < TOWER_AMMO / TOWER_AMMO_PER_BUBBLE
  if (b.kind === 'bowl') return wantsUnder(b, thing)
  return b.kind !== 'oven' && wants(s, b, thing)
}

/**
 * A game from a keep, at a tick of its own (LOAD_AT and the keep's second): blankState, then
 * the keep applied and judged against the board by the stroke table's own rules (strokes.ts):
 * a belt cell where no stroke goes (blocked: water, a tree, a burrow, the basket)
 * or under a machine or the pad is ground, both cells of a head-on pair too (headOn), and a
 * fork left with no branch or leading into a join is a plain belt (settleForks); a building
 * goes back on the board only where its sticker could be placed now (planPlace), within the
 * stickers the cards have given; a hedge or a stump only where her hedge tool could draw one
 * (planHedge). Whatever a dropped cell or building held waits in Beep's basket. The session
 * starts at the load, and Play has not been pressed: the start card shows.
 */
export function stateFromKeep(k: Keep, seed: number): State {
  const s = blankState(seed)
  const now = (s.tick = LOAD_AT + Math.round(k.second * HZ))
  const at = (ago: number) => now - Math.round(ago * HZ)
  s.sessionAt = now
  s.found = [...k.found]
  s.choice = k.choice
  s.launches = k.launches
  s.patterns = k.patterns
  s.pattern = k.pattern
  s.help = { links: { ...k.help.links }, placed: { ...k.help.placed }, hedges: k.help.hedges }
  s.switches = { ...k.switches }
  s.nextMuncher = k.nextMuncher
  s.rocket.got = PARTS.map((p) => k.rocket[p])
  s.lab = { got: [k.lab.green, k.lab.orange], drinkAt: k.lab.drank === null ? -1 : at(k.lab.drank) }
  k.burrows.forEach((kb, i) => {
    const b = s.burrows[i]!
    b.hunger = kb.hunger
    b.sleepUntil = kb.sleep === null ? -1 : now + Math.round(kb.sleep * HZ)
    b.heap = counted(kb.heap)
    b.friend = kb.friend
    b.visits = kb.visits
  })
  const lost: Thing[] = each(k.basket)
  const belts = s.belts
  const clear = (c: number) => {
    for (const x of [inSlot(c), outSlot(c), overIn(c), overOut(c)]) {
      if (belts.slot[x]! >= 0) lost.push(THINGS[belts.slot[x]!]!)
      belts.slot[x] = -1
    }
    for (const a of [belts.in, belts.out, belts.fork, belts.over]) a[c] = -1
    belts.pattern[c] = belts.joinTurn[c] = belts.forkTurn[c] = 0
    belts.blockedSince[c] = belts.blockedSince[CELLS + c] = -1
  }
  k.belts.forEach((row, y) =>
    row.split(' ').forEach((code, x) => {
      const d = decodeCell(code)
      if (d === null || x >= COLS) return
      const c = cellOf(x, y)
      const lanes = [inSlot(c), outSlot(c), overIn(c), overOut(c)]
      if (blocked(s, c)) {
        for (const t of d.slots) if (t !== null) lost.push(t)
        return
      }
      belts.in[c] = d.in
      belts.out[c] = d.out
      belts.fork[c] = d.fork
      belts.over[c] = d.over
      belts.pattern[c] = d.pattern
      belts.joinTurn[c] = d.joinTurn
      belts.forkTurn[c] = d.forkTurn
      belts.blockedSince[c] = d.blocked === null ? -1 : at(d.blocked)
      belts.blockedSince[CELLS + c] = d.overBlocked === null ? -1 : at(d.overBlocked)
      d.slots.forEach((t, i) => (belts.slot[lanes[i]!] = t === null ? -1 : thingIndex(t)))
    }),
  )
  // Both cells of a head-on pair go: neither way is the one she drew.
  const facing = new Set<number>()
  for (let c = 0; c < CELLS; c++) {
    if (belts.out[c]! < 0) continue
    for (const d of [belts.out[c]!, belts.over[c]!]) if (d >= 0 && headOn(s, c, d as Dir)) facing.add(c).add(stepCell(c, d as Dir))
  }
  for (const c of facing) clear(c)

  // The buildings, in the board's order, each where its sticker could be placed now.
  s.buildings = [s.buildings[0]!]
  s.owner = owners(s)
  // Ids are names in events and the hint: a repeated one gets a new id past every other.
  const used = new Set([0])
  let spare = Math.max(k.nextId, 2, ...k.buildings.map((b) => b.id + 1))
  for (const kb of k.buildings) {
    const n = SIZE[kb.kind]
    const p = planPlace(s, kb.kind, kb.x + n / 2, kb.y + n / 2, { x: kb.x, y: kb.y })
    if (!p.ok || p.x !== kb.x || p.y !== kb.y) {
      lost.push(...each(kb.held), ...kb.queue, ...kb.stack, ...(kb.batch === null ? [] : [kb.batch.makes]))
      continue
    }
    const b = newBuilding(used.has(kb.id) ? spare++ : kb.id, kb.kind, kb.x, kb.y, -1)
    used.add(b.id)
    for (const thing of each(kb.held)) {
      if (holds(s, b, thing)) b.held[thingIndex(thing)]!++
      else lost.push(thing)
    }
    for (const thing of kb.queue) {
      if (b.kind === 'oven' && BAKES[thing] !== undefined && b.queue.length < HOLD) b.queue.push(thing)
      else lost.push(thing)
    }
    const makes = b.kind === 'lab' ? (['greenBottle', 'orangeBottle'] as Thing[]) : gives(b)
    for (const thing of kb.stack) {
      if (b.kind !== 'lab' && makes.includes(thing) && b.stack.length < STACK) b.stack.push(thing)
      else lost.push(thing)
    }
    if (kb.batch !== null) {
      // A batch ends on a hop: the keep's own second keeps it there, and a broken one is put back on the next.
      if (makes.includes(kb.batch.makes)) b.batch = { makes: kb.batch.makes, at: at(kb.batch.age), until: Math.ceil((now + Math.round(kb.batch.left * HZ)) / HOP) * HOP }
      else lost.push(kb.batch.makes)
    }
    b.outTurn = kb.outTurn
    b.inTurn = kb.inTurn
    if (b.kind === 'tower') {
      b.ammo = Math.min(TOWER_AMMO, kb.ammo)
      b.stars = kb.stars
    }
    b.busyBits = kb.busy
    b.starvedBits = kb.starved
    s.buildings.push(b)
    s.owner = owners(s)
  }
  s.nextId = spare

  // No belt under a machine (the pad's cells too); a fork with no branch, or into a join, is a plain belt, as a stroke would leave it.
  for (let c = 0; c < CELLS; c++) if (belts.out[c]! >= 0 && s.owner[c]! >= 0 && hasMouths(s.buildings.find((b) => b.id === s.owner[c])!)) clear(c)
  settleForks(s)

  // Hedges and stumps where her hedge tool could draw one now (strokes.ts planHedge: on grass or rocks, off belts, buildings and the pad's ring), within the stickers given.
  const plant = (x: number, y: number, kind: 1 | 2) => {
    const c = cellOf(x, y)
    if (planHedge(s, [c]).edit === null) return false
    s.hedge[c] = kind
    return true
  }
  for (const [x, y] of k.hedges) plant(x, y, 1)
  for (const [x, y, left] of k.stumps) if (plant(x, y, 2)) s.stumpAt[cellOf(x, y)] = now + Math.round(left * HZ) - REGROW

  s.basket = noCounts()
  for (const thing of lost) s.basket[thingIndex(thing)]!++
  rebuild(s)
  return s
}
