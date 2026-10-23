import { BURROWS, FLOWER_OF, GROUND, PAD, PAD_RING, cellOf, onBoard, stepCell, xOf, yOf } from './board'
import { padDrums, working } from './band'
import { beepTo, sendWhereWanted } from './beep'
import { hasMouths } from './belts'
import {
  AFTER_CARD,
  AFTER_PAUSE,
  BOWL_PER_MUNCHER,
  BURROW_WAKES,
  CAUGHT_MAX,
  CHEEKS,
  COUNT_AT,
  FLOWER_EXTRA,
  GRAB_EVERY,
  HELLO_SLEEP,
  HOME_STEP,
  HOP_OUT_EVERY,
  HUNGER,
  HUNGER_FULL,
  NAP_BOTTLE,
  NAP_OTHER,
  NIBBLE_FOR,
  OUT_FOR,
  PART_INFO,
  PICNIC_FOR,
  POLITE_FOR,
  QUIET_AFTER,
  REGROW,
  SCOUT_AFTER,
  SCOUT_CHEEKS,
  SCOUT_STEP,
  SESSION_CALM,
  SHRUG_FOR,
  SIZE,
  SLEEP,
  SUDS_STEP,
  TICKLED_STEP,
  TICKLE_FOR,
  TOUCHED_WITHIN,
  TOWER_AMMO_PER_BUBBLE,
  TOWER_EVERY,
  TOWER_FLIGHT,
  TOWER_REACH2,
  VISIT_BUSY,
  VISIT_CAP,
  WAIT_AT,
  WALK_ON,
  WALK_STEP,
  WARN,
  progressOf,
} from './catalog'
import { CELLS, COLS, DIRS, HZ, OVER, PARTS, PRED, SLOTS, STEP, THINGS, inSlot, isShiny, noCounts, outSlot, thingIndex, type Building, type Dir, type HomeWhy, type Kind, type Muncher, type MuncherMode, type State, type Target, type Thing, type Visit } from './model'
import { building, gives, pushHead } from './trade'
import { heapPoint, muncherPoint, type Point } from './where'

/**
 * The burrows, the munchers, the towers and the bowls (plans/rocket-factory.md, Munchers):
 * the hunger the factory's song wakes, the kind rules that hold a visit back, the visit out of
 * the door, every muncher's little acts, Beep's tickles, the towers' suds, the picnics, the
 * parent's switch, Good night and the launch's watchers. The seams with the other files are in
 * factory-game-work/wave2b-seams.md.
 *
 * Hunger (stepBurrows, once a second). A burrow that may wake (its card is found: burrow A
 * after Gears!, B after Nose! and C after More!, those two HELLO_SLEEP after they waved hello;
 * D, E and F never yet) grows hungry by the
 * HUNGER terms, band.ts `working` deciding what works and `padDrums` when the pad counts,
 * unless it sleeps, its munchers are out, it is night or the launch runs. At HUNGER_FULL the
 * WARN warning starts and the visit comes out after it; while the kind rules hold a visit
 * back, the hunger waits at WAIT_AT and asks again each second, and a rule that turns during
 * the warning sends it back there. A's first visit is the scout: A sleeps SCOUT_AFTER from
 * the first second it may wake, then its hunger is full at once.
 *
 * A visit. Its munchers wait in the doorway ('peek') and hop out HOP_OUT_EVERY apart, the
 * first one HOP_OUT_EVERY after the warning ends: to the burrow's bowl when it has one, else
 * onto the open cell beside the mound nearest the door. Then each one decides, in hop-out
 * order since each decides as it lands.
 *
 * A decision (waking, walking on, an edit that leaves it nowhere to go, a finished nibble)
 * picks the target: in the plan's preference (a bottle maker to nap on or a bottle belt cell
 * to sit on, then the workshop or a gear belt cell, then an oven or a bar belt cell), the one
 * nearest by walking distance, never one it tried this visit or another muncher has, ties to
 * the lower cell and then the lower building id. A belt cell's food is what rides it now and
 * what the buildings upstream of it put out (the net followed down from every spout), so a
 * line counts while it runs light. Walking distance is a search over the board's cells
 * with belts, flowers, ground and stumps open, and buildings, water, trees, mounds, the pad's
 * ring and hedges closed; only when nothing at all is in reach does it search with hedges
 * open, and then it nibbles the first hedge on its way. At every cell it reaches it takes the
 * next step of a fresh search toward its target, and decides again when no way without
 * hedges reaches the target any more. With nothing to go for it waves and hops home.
 *
 * The acts. Sitting ('sit') freezes its belt cell (belts.ts) and every GRAB_EVERY eats the
 * made thing trying to come in (a belt behind it, a side join, or the stack of the building
 * whose spout it sits on); full cheeks burp home, and with nothing coming for WALK_ON it walks
 * on. Napping ('nap') stops its machine (trade.ts, band.ts) for NAP_BOTTLE on a bottle maker
 * and NAP_OTHER elsewhere; waking, it takes one made thing off the roof stack, else from the
 * inputs, and hops home. Nibbling ('nibble') takes NIBBLE_FOR in three bites, one nibbler at
 * a time while the rest wait ('wait'); while it nibbles, its target is the hedge cell it
 * eats. A stump regrows REGROW after the last tick anybody stood on it (stumpAt). Home is a
 * straight hop to the door at HOME_STEP (TICKLED_STEP giggling, SUDS_STEP in suds); there its
 * cheeks land on the heap, and when the last one is in the visit is over and the burrow
 * sleeps by SLEEP. A muncher out OUT_FOR goes home whatever it is doing, unless it is caught
 * or at a picnic, which send it home anyway.
 *
 * A muncher's picture is where.ts muncherPoint: a hop while 'peek' (a still hop at the door),
 * 'out', 'bowl' (on the way), 'home' and 'watch' (on the way), else its cell and the cell it
 * steps toward. A napper is drawn on its building's roof; its events, and its hop when it
 * leaves, start at the footprint's middle, which is where the roof is in either orientation.
 * 'bowl' with its hop set is the hop to the bowl; with the hop over, since modeAt, the peer and
 * the shrug at an empty bowl, until it walks.
 *
 * Determinism: integers, squared distances, a fixed neighbour order and ties by cell or id. No
 * choice here needs the seeded generator.
 */

/** Burrow A, the first burrow: it sleeps until Gears!, and its first visit is the scout. */
const A = 0

/** Cells no muncher ever stands on, whatever is built: the pond, trees, the burrows' mounds, the pad and the cells round it. */
const NEVER: Uint8Array = (() => {
  const out = new Uint8Array(CELLS)
  for (let c = 0; c < CELLS; c++) {
    const g = GROUND[c]
    if (g === 'pond' || g === 'tree' || g === 'burrow' || PAD_RING.has(c)) out[c] = 1
  }
  return out
})()

/** For each burrow, each cell's place by its flowers: 2 on them, 1 within HUNGER.nearCells of them (in both directions, as a square round each flower), 0 neither. */
const ZONES: readonly Uint8Array[] = BURROWS.map((_, i) => {
  const out = new Uint8Array(CELLS)
  const n = HUNGER.nearCells
  for (let c = 0; c < CELLS; c++) {
    if (FLOWER_OF[c] !== i) continue
    for (let dy = -n; dy <= n; dy++)
      for (let dx = -n; dx <= n; dx++) {
        const x = xOf(c) + dx
        const y = yOf(c) + dy
        if (onBoard(x, y)) out[cellOf(x, y)] = 1
      }
  }
  for (let c = 0; c < CELLS; c++) if (FLOWER_OF[c] === i) out[c] = 2
  return out
})

/** Squared distance, in half cells, from burrow i's door to cell c's middle: what nearest the door means. */
function doorD2(i: number, c: number): number {
  const d = BURROWS[i]!.door
  const dx = 2 * xOf(c) + 1 - 2 * d.x
  const dy = 2 * yOf(c) + 1 - 2 * d.y
  return dx * dx + dy * dy
}
const byDoor = (i: number) => (a: number, b: number) => doorD2(i, a) - doorD2(i, b) || a - b
/** Each burrow's mound cells, nearest its door first. */
const MOUNDS: readonly (readonly number[])[] = BURROWS.map((site, i) => [cellOf(site.x, site.y), cellOf(site.x + 1, site.y), cellOf(site.x, site.y + 1), cellOf(site.x + 1, site.y + 1)].sort(byDoor(i)))
/** The cells beside each mound (sharing an edge with it), nearest its door first: where its munchers hop out to. */
const SIDES: readonly (readonly number[])[] = MOUNDS.map((mound, i) => {
  const out = new Set<number>()
  for (const c of mound)
    for (const d of DIRS) {
      const n = stepCell(c, d)
      if (n >= 0 && !mound.includes(n)) out.add(n)
    }
  return [...out].sort(byDoor(i))
})

/** Where the launch's watchers sit, on the pad's ring, one seat for each burrow (by burrow): A, B and C in the middle three seats of the row just below the pad, then D and E at its two ends and F beside the pad. */
const WATCH: readonly number[] = [
  cellOf(PAD.x, PAD.y + 3),
  cellOf(PAD.x + 1, PAD.y + 3),
  cellOf(PAD.x + 2, PAD.y + 3),
  cellOf(PAD.x + 3, PAD.y + 3),
  cellOf(PAD.x - 1, PAD.y + 3),
  cellOf(PAD.x + 3, PAD.y + 1),
]

/** The buildings a muncher naps on, by how much it wants each (the same as the belts): the bottle makers most, then the workshop, then ovens. */
const NAP_RANK: Partial<Record<Kind, number>> = { greenMaker: 0, orangeMaker: 0, workshop: 1, oven: 2 }
const bit = (t: Thing) => 1 << thingIndex(t)
const BOTTLES = bit('greenBottle') | bit('orangeBottle')
const GEARS = bit('gear')
const BARS = bit('blueBar') | bit('goldBar')
/** How much a muncher wants a belt cell by what rides it: bottles most (0), then gears, then bars; -1 for nothing it eats. */
const rankOf = (food: number) => (food & BOTTLES ? 0 : food & GEARS ? 1 : food & BARS ? 2 : -1)

// ---------------------------------------------------------------------------------------
// Small readings

const setMode = (s: State, m: Muncher, mode: MuncherMode) => {
  m.mode = mode
  m.modeAt = s.tick
}
const cheeksOf = (m: Muncher) => (m.scout ? SCOUT_CHEEKS : CHEEKS)
const sameTarget = (a: Target, b: Target | null) => b !== null && (a.kind === 'cell' ? b.kind === 'cell' && b.cell === a.cell : b.kind === 'building' && b.id === a.id)
/** The targets the other munchers out have: nobody takes another's. */
const takenBy = (s: State, m: Muncher): Target[] => s.munchers.flatMap((x) => (x === m || x.target === null ? [] : [x.target]))
const mid = (c: number): Point => ({ x: xOf(c) + 0.5, y: yOf(c) + 0.5 })

function visitOf(s: State): Visit {
  if (s.visit === null) throw new Error('no visit is out')
  return s.visit
}
function muncherOf(s: State, id: number): Muncher {
  const m = s.munchers.find((x) => x.id === id)
  if (m === undefined) throw new Error(`no muncher ${id}`)
  return m
}
/** The building muncher m naps on. */
function napsOn(s: State, m: Muncher): Building {
  const b = s.buildings.find((x) => x.napper === m.id)
  if (b === undefined) throw new Error(`muncher ${m.id} naps on no building`)
  return b
}
/** Every part of the rocket is full (no visit starts then; with Fuel! found the munchers out hop home for the launch). */
const rocketFull = (s: State) => PARTS.every((p, i) => s.rocket.got[i]! >= PART_INFO[p].n)

/** A cell a muncher may walk on now: under no building, never the pond, a tree, a mound or the pad's ring, and no hedge unless `hedges` is true (a stump is always open). */
function walkable(s: State, c: number, hedges: boolean): boolean {
  return NEVER[c] === 0 && s.owner[c]! < 0 && (hedges || s.hedge[c] !== 1)
}
/** A cell muncher m may stand on: one it may walk on, or its own mound (a burrow walled in all round holds its munchers at the door). */
const standable = (s: State, m: Muncher, c: number) => walkable(s, c, false) || MOUNDS[m.burrow]!.includes(c)
/** A belt cell a muncher may sit on: plain or bending, with no fork, no bridge and no tower or bowl on it, where it may walk. */
const seat = (s: State, c: number) => s.belts.out[c]! >= 0 && s.belts.fork[c]! < 0 && s.belts.over[c]! < 0 && walkable(s, c, false)
/** A cell a polite muncher sits on beside a line: open ground with no belt. */
const beside = (s: State, c: number) => s.belts.out[c]! < 0 && walkable(s, c, false)

/** The cell burrow i's munchers hop out onto: the open cell beside its mound nearest the door, else (a burrow walled in all round) its mound's door cell. */
export function doorCell(s: State, i: number): number {
  return SIDES[i]!.find((c) => walkable(s, c, false)) ?? MOUNDS[i]![0]!
}

/** Each belt cell's food: a bit (1 << THINGS index) for every thing that rides its main lane now or that the buildings upstream of it put out, following the net down from every spout. */
function foodOf(s: State): Uint8Array {
  const out = new Uint8Array(CELLS)
  const seen = new Uint8Array(SLOTS)
  const { next, next2, spouts } = s.net
  for (const b of s.buildings) {
    let bits = 0
    for (const t of gives(b)) bits |= bit(t)
    if (bits === 0) continue
    const todo = [...spouts.get(b.id)!]
    while (todo.length > 0) {
      const x = todo.pop()!
      if ((seen[x]! & bits) === bits) continue
      seen[x]! |= bits
      if (x < OVER) out[x >> 1]! |= bits
      if (next[x]! >= 0) todo.push(next[x]!)
      if (next2[x]! >= 0) todo.push(next2[x]!)
    }
  }
  const slot = s.belts.slot
  for (let x = 0; x < OVER; x++) if (slot[x]! >= 0) out[x >> 1]! |= 1 << slot[x]!
  return out
}

/** The cells a muncher walks to for a target: the cell itself, or the cells beside a building's footprint (it climbs onto the roof from there). */
function goalsOf(s: State, t: Target): number[] {
  if (t.kind === 'cell') return [t.cell]
  const b = building(s, t.id)
  const k = SIZE[b.kind]
  const out: number[] = []
  for (let y = b.y - 1; y <= b.y + k; y++)
    for (let x = b.x - 1; x <= b.x + k; x++) {
      const inside = x >= b.x && x < b.x + k && y >= b.y && y < b.y + k
      const corner = (x < b.x || x >= b.x + k) && (y < b.y || y >= b.y + k)
      if (!inside && !corner && onBoard(x, y)) out.push(cellOf(x, y))
    }
  return out.sort((a, c) => a - c)
}

// ---------------------------------------------------------------------------------------
// Walking distances

/** Walking distances from one cell: each cell's steps from `start` (-1 out of reach) and the cell before it on a shortest way. */
interface Ways {
  start: number
  dist: Int16Array
  back: Int16Array
}
/** A search from `start` over the cells a muncher may walk on (hedges too when `hedges`), neighbours tried east, south, west, north, so ties always fall the same way. The start counts even when nobody may walk there (a muncher on its own mound). */
function ways(s: State, start: number, hedges: boolean): Ways {
  const cells = CELLS
  const cols = COLS
  const open = new Uint8Array(cells)
  for (let c = 0; c < cells; c++) open[c] = walkable(s, c, hedges) ? 1 : 0
  const dist = new Int16Array(cells).fill(-1)
  const back = new Int16Array(cells).fill(-1)
  const queue = new Int16Array(cells)
  dist[start] = 0
  queue[0] = start
  for (let head = 0, tail = 1; head < tail; head++) {
    const c = queue[head]!
    const x = c % cols
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? (x + 1 < cols ? c + 1 : -1) : k === 1 ? c + cols : k === 2 ? (x > 0 ? c - 1 : -1) : c - cols
      if (n < 0 || n >= cells || dist[n] !== -1 || open[n] === 0) continue
      dist[n] = dist[c]! + 1
      back[n] = c
      queue[tail++] = n
    }
  }
  return { start, dist, back }
}
/** The way from the search's start to cell c, both ends included. */
function wayTo(w: Ways, c: number): number[] {
  const out = [c]
  for (let x = c; x !== w.start; ) {
    x = w.back[x]!
    out.push(x)
  }
  return out.reverse()
}
/** The nearest of the goals in reach, ties to the lower cell; -1 for none. */
function nearestGoal(w: Ways, goals: readonly number[]): number {
  let best = -1
  for (const g of goals) if (w.dist[g]! >= 0 && (best < 0 || w.dist[g]! < w.dist[best]!)) best = g
  return best
}

/** Steps from cell `from` to every cell, -1 out of reach, with hedges closed or open: munchers.test.ts reads the munchers' ways with it (the board lint, the targets' walking distances). */
export function walkDistances(s: State, from: number, hedges: boolean): Int16Array {
  return ways(s, from, hedges).dist
}

// ---------------------------------------------------------------------------------------
// Targets and decisions

/** A target a muncher could go for, how much it wants it (0 most), the cells it walks to, and its tie key (cells before buildings, each lowest first). */
interface Aim {
  target: Target
  rank: number
  goals: number[]
  key: number
}

/** What a muncher could go for now: belt cells it may sit on by their food and the machines it may nap on (never for the scout), less what it tried this visit and what others have. */
function eatAims(s: State, scout: boolean, tried: readonly number[], taken: readonly Target[]): Aim[] {
  const food = foodOf(s)
  const out: Aim[] = []
  for (let c = 0; c < CELLS; c++) {
    const rank = rankOf(food[c]!)
    if (rank < 0 || !seat(s, c) || tried.includes(c)) continue
    const target: Target = { kind: 'cell', cell: c }
    if (!taken.some((t) => sameTarget(target, t))) out.push({ target, rank, goals: [c], key: c })
  }
  if (scout) return out
  for (const b of s.buildings) {
    const rank = NAP_RANK[b.kind]
    if (rank === undefined || b.napper !== -1 || tried.includes(-1 - b.id)) continue
    const target: Target = { kind: 'building', id: b.id }
    if (!taken.some((t) => sameTarget(target, t))) out.push({ target, rank, goals: goalsOf(s, target), key: CELLS + b.id })
  }
  return out
}

/** Where a polite muncher could sit: open ground beside a line or a machine a muncher would go for, ranked the same (beside the bottle line first), less what others have. */
function politeAims(s: State, taken: readonly Target[]): Aim[] {
  const food = foodOf(s)
  const rank = new Int8Array(CELLS).fill(-1)
  const mark = (c: number, r: number) => {
    for (const d of DIRS) {
      const n = stepCell(c, d)
      if (n >= 0 && beside(s, n) && (rank[n]! < 0 || r < rank[n]!)) rank[n] = r
    }
  }
  for (let c = 0; c < CELLS; c++) if (s.belts.out[c]! >= 0 && rankOf(food[c]!) >= 0) mark(c, rankOf(food[c]!))
  for (const b of s.buildings) {
    const r = NAP_RANK[b.kind]
    if (r === undefined) continue
    for (let y = b.y; y < b.y + SIZE[b.kind]; y++) for (let x = b.x; x < b.x + SIZE[b.kind]; x++) mark(cellOf(x, y), r)
  }
  const out: Aim[] = []
  for (let c = 0; c < CELLS; c++) {
    const target: Target = { kind: 'cell', cell: c }
    if (rank[c]! >= 0 && !taken.some((t) => sameTarget(target, t))) out.push({ target, rank: rank[c]!, goals: [c], key: c })
  }
  return out
}

/** A plan: the target, the cell it walks to, and the search that reaches it (with hedges open or not). */
interface Plan {
  target: Target
  goal: number
  ways: Ways
  hedges: boolean
}
/** The target a muncher on cell `from` goes for: the most wanted, then the nearest by walking distance, then the tie key; with hedges open only when nothing at all is in reach without them (never for a polite one). Null with nothing to go for. */
function plan(s: State, from: number, scout: boolean, tried: readonly number[], taken: readonly Target[], polite: boolean): Plan | null {
  const all = polite ? politeAims(s, taken) : eatAims(s, scout, tried, taken)
  if (all.length === 0) return null
  for (const hedges of polite ? [false] : [false, true]) {
    const w = ways(s, from, hedges)
    let best: { aim: Aim; goal: number; dist: number } | null = null
    for (const aim of all) {
      const goal = nearestGoal(w, aim.goals)
      if (goal < 0) continue
      const dist = w.dist[goal]!
      if (best === null || aim.rank < best.aim.rank || (aim.rank === best.aim.rank && (dist < best.dist || (dist === best.dist && aim.key < best.aim.key)))) best = { aim, goal, dist }
    }
    if (best !== null) return { target: best.aim.target, goal: best.goal, ways: w, hedges }
  }
  return null
}

/** A decision: the muncher picks its target afresh from where it stands and sets off, or with nothing to go for waves and hops home. */
function decide(s: State, m: Muncher): void {
  m.toward = m.cell
  const p = plan(s, m.cell, m.scout, m.tried, takenBy(s, m), s.switches.munchers === 'polite')
  if (p === null) return goHome(s, m, 'nothing')
  m.target = p.target
  setMode(s, m, 'walk')
  head(s, m, p.ways, p.goal)
}

/** The muncher on its cell goes on toward `goal` along the search `w`: it arrives, or steps to the next cell, or finds a hedge there and nibbles it (or waits while another muncher nibbles). */
function head(s: State, m: Muncher, w: Ways, goal: number): void {
  if (goal === m.cell) return arrive(s, m)
  const next = wayTo(w, goal)[1]!
  if (s.hedge[next] === 1) {
    if (s.munchers.some((x) => x.mode === 'nibble')) return setMode(s, m, 'wait')
    m.target = { kind: 'cell', cell: next }
    setMode(s, m, 'nibble')
    s.events.push({ kind: 'nibble', cell: next })
    return
  }
  m.toward = next
  m.stepAt = s.tick
  m.stepFor = m.scout ? SCOUT_STEP : WALK_STEP
}

/** Its target is still there for it: a belt cell to sit on (open ground beside a line for a polite one), or a machine to nap on that nobody else naps on. */
function stillThere(s: State, m: Muncher): boolean {
  const t = m.target
  if (t === null) return false
  if (s.switches.munchers === 'polite') return t.kind === 'cell' && beside(s, t.cell)
  if (t.kind === 'cell') return seat(s, t.cell)
  const b = s.buildings.find((x) => x.id === t.id)
  return b !== undefined && NAP_RANK[b.kind] !== undefined && b.napper === -1 && !m.scout
}

/** A walking muncher at the end of a step: on toward its target while a way without hedges reaches it, else it decides again (a way through a hedge only when nothing else is in reach). */
function onward(s: State, m: Muncher): void {
  m.cell = m.toward
  if (!stillThere(s, m)) return decide(s, m)
  const w = ways(s, m.cell, false)
  const goal = nearestGoal(w, goalsOf(s, m.target!))
  if (goal < 0) return decide(s, m)
  head(s, m, w, goal)
}

/** It reached its target: it sits on the belt, climbs onto the machine's roof and naps, or (polite) sits down beside the line. */
function arrive(s: State, m: Muncher): void {
  m.toward = m.cell
  const t = m.target!
  if (s.switches.munchers === 'polite') return setMode(s, m, 'polite')
  if (t.kind === 'cell') {
    m.tried.push(t.cell)
    m.idleSince = s.tick
    return setMode(s, m, 'sit')
  }
  const b = building(s, t.id)
  b.napper = m.id
  m.tried.push(-1 - b.id)
  visitOf(s).naps++
  setMode(s, m, 'nap')
  s.events.push({ kind: 'napStart', id: m.id, building: b.id })
}

// ---------------------------------------------------------------------------------------
// Hops

/** Where muncher m is drawn now, its feet: a napper at its building's middle (the roof in either orientation), every other one where where.ts draws it. */
function feet(s: State, m: Muncher): Point {
  if (m.mode === 'nap') {
    const b = napsOn(s, m)
    return { x: b.x + SIZE[b.kind] / 2, y: b.y + SIZE[b.kind] / 2 }
  }
  const p = muncherPoint(m, s.tick * STEP)
  return { x: p.x, y: p.y }
}

/** The whole number at or below the square root of n (n a whole number): hop lengths without Math.sqrt in the sim. */
function isqrt(n: number): number {
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}
/** Ticks for a straight hop from a to b at `per` ticks a cell, measured in sixtieths of a cell. */
function hopTicks(a: Point, b: Point, per: number): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.max(1, Math.round((per * isqrt(Math.round((dx * dx + dy * dy) * 3600))) / 60))
}
/** A straight hop from where m is drawn now to the middle of cell c, at `per` ticks a cell; c is where it stands once the hop is over. */
function hopToCell(s: State, m: Muncher, c: number, per: number): void {
  const from = feet(s, m)
  const to = mid(c)
  m.hop = { x0: from.x, y0: from.y, x1: to.x, y1: to.y, at: s.tick, until: s.tick + hopTicks(from, to, per) }
  m.cell = c
  m.toward = c
}

/** It hops aside with a giggle onto the nearest cell it may walk on (between cell middles, ties to the lower cell): a sticker or a hedge came down where it stood. */
function hopAside(s: State, m: Muncher): void {
  let best = -1
  let bestD = Infinity
  for (let c = 0; c < CELLS; c++) {
    if (!walkable(s, c, false)) continue
    const dx = xOf(c) - xOf(m.cell)
    const dy = yOf(c) - yOf(m.cell)
    if (dx * dx + dy * dy < bestD) {
      best = c
      bestD = dx * dx + dy * dy
    }
  }
  if (best < 0) throw new Error('the land has no cell a muncher may stand on')
  hopToCell(s, m, best, TICKLED_STEP)
  const p = feet(s, m)
  s.events.push({ kind: 'giggle', id: m.id, x: p.x, y: p.y })
}

/** A napper wakes, and its machine starts again. */
function wake(s: State, m: Muncher): void {
  const b = napsOn(s, m)
  b.napper = -1
  s.events.push({ kind: 'napEnd', id: m.id, building: b.id })
}
/** A napper climbs down off the roof onto the cell it climbed up from. */
function offRoof(s: State, m: Muncher): void {
  hopToCell(s, m, m.cell, TICKLED_STEP)
  wake(s, m)
}

/** It hops straight home, `why` telling how it sets off; a napper wakes and jumps off its roof, a caught one leaves Beep's queue. */
function goHome(s: State, m: Muncher, why: HomeWhy): void {
  const from = feet(s, m)
  if (m.mode === 'nap') wake(s, m)
  dropTickle(s, m)
  const door = BURROWS[m.burrow]!.door
  const per = why === 'tickled' ? TICKLED_STEP : why === 'sudsed' ? SUDS_STEP : HOME_STEP
  m.hop = { x0: from.x, y0: from.y, x1: door.x, y1: door.y, at: s.tick, until: s.tick + hopTicks(from, door, per) }
  m.toward = m.cell
  m.homeWhy = why
  m.target = null
  setMode(s, m, 'home')
  s.events.push({ kind: 'home', id: m.id, why })
}

/** It sneezes what its cheeks hold back to where it is wanted (a tickle, suds, Good night). */
function sneeze(s: State, m: Muncher): void {
  const p = feet(s, m)
  s.events.push({ kind: 'sneeze', id: m.id, x: p.x, y: p.y })
  sendWhereWanted(s, m.cheeks, p, s.tick)
  m.cheeks = []
}

/** Home through the door: its cheeks land on the heap, and when the last muncher out is in, the visit is over and the burrow sleeps by what the visit cost and earned. */
function inDoor(s: State, m: Muncher): void {
  const b = s.burrows[m.burrow]!
  for (const thing of m.cheeks) {
    b.heap[thingIndex(thing)]!++
    s.events.push({ kind: 'heap', burrow: m.burrow, thing })
  }
  if (s.visit !== null) s.visit.kept += m.cheeks.length
  s.munchers = s.munchers.filter((x) => x !== m)
  if (s.munchers.length > 0) return
  s.lastHomeAt = s.tick
  const v = s.visit
  // The launch's watchers were no visit.
  if (v === null) return
  s.burrows[v.burrow]!.sleepUntil = s.tick + Math.min(SLEEP.max, SLEEP.base + SLEEP.perKept * v.kept + SLEEP.perTickled * v.tickled + SLEEP.perSent * (v.sent + v.fed) + SLEEP.perNap * v.naps)
  s.visit = null
  s.events.push({ kind: 'visitOver', burrow: v.burrow })
}

// ---------------------------------------------------------------------------------------
// Hunger and visits

/** Burrow i is awake: the card that wakes it (catalog.ts BURROW_WAKES) is found. D, E and F have none: they sleep, snoring, and never visit. */
export function burrowAwake(s: State, i: number): boolean {
  const card = BURROW_WAKES[i]!
  return card !== null && s.found.includes(card)
}

/** Burrow i may wake: it is awake, and a burrow whose card has just come, B and C, HELLO_SLEEP after it waved hello. */
function mayWake(s: State, i: number): boolean {
  const b = s.burrows[i]!
  return burrowAwake(s, i) && (b.helloAt < 0 || s.tick - b.helloAt >= HELLO_SLEEP)
}

/** The working machines on the board, and those on burrow i's flowers and near them (a machine counts once, by its nearest cell). */
function songOf(s: State, i: number): { working: number; on: number; near: number } {
  const zone = ZONES[i]!
  let n = 0
  let on = 0
  let near = 0
  for (const b of s.buildings) {
    if (!working(b)) continue
    n++
    let z = 0
    for (let y = b.y; y < b.y + SIZE[b.kind]; y++) for (let x = b.x; x < b.x + SIZE[b.kind]; x++) z = Math.max(z, zone[cellOf(x, y)]!)
    if (z === 2) on++
    else if (z === 1) near++
  }
  return { working: n, on, near }
}

/** How much hungrier burrow i grows this second. The Few switch halves the sum, an odd one rounding up and down by turns, and drops the flower terms, the drumming pad's among them (it counts as a machine on every burrow's flowers). The scout's burrow is full the moment its sleep ends. */
function growth(s: State, i: number): number {
  if (i === A && s.burrows[A]!.visits === 0) return HUNGER_FULL
  const f = songOf(s, i)
  const sum = HUNGER.base + HUNGER.perWorking * Math.min(HUNGER.workingCap, f.working)
  if (s.switches.munchers === 'few') return (sum + (Math.floor(s.tick / HZ) % 2)) >> 1
  return sum + HUNGER.onFlowers * f.on + HUNGER.nearFlowers * f.near + (padDrums(s) ? HUNGER.pad : 0)
}

/** The kind rules hold burrow i's visit back now: one visit at a time (none out, no other burrow warning), QUIET_AFTER since the last one got home, a touch within TOUCHED_WITHIN (or a finger down), no card up or closed within AFTER_CARD, the pause menu closed long enough ago, the session older than SESSION_CALM, the rocket not full, no night and no launch. */
function heldBack(s: State, i: number): boolean {
  const t = s.tick
  const within = (at: number, span: number) => at >= 0 && t - at < span
  return (
    s.visit !== null ||
    s.munchers.length > 0 ||
    s.burrows.some((b, j) => j !== i && b.hunger === HUNGER_FULL && b.warnAt >= 0) ||
    within(s.lastHomeAt, QUIET_AFTER) ||
    !(s.touching || (s.lastTouchAt >= 0 && t - s.lastTouchAt <= TOUCHED_WITHIN)) ||
    s.card !== null ||
    within(s.cardClosedAt, AFTER_CARD) ||
    within(s.pauseClosedAt, AFTER_PAUSE) ||
    t - s.sessionAt <= SESSION_CALM ||
    rocketFull(s) ||
    s.night !== null ||
    s.launch !== null
  )
}

/** How many munchers burrow i sends now: 1, plus 1 for each working machine on its flowers (the drumming pad counts) up to FLOWER_EXTRA, plus 1 with VISIT_BUSY machines working, at most VISIT_CAP for how far the path has come; 1 with the Few switch. */
function visitSize(s: State, i: number): number {
  if (s.switches.munchers === 'few') return 1
  const f = songOf(s, i)
  const on = f.on + (padDrums(s) ? 1 : 0)
  return Math.min(VISIT_CAP[progressOf(s.found)], 1 + Math.min(FLOWER_EXTRA, on) + (f.working >= VISIT_BUSY ? 1 : 0))
}

/** The warning is over and nothing holds it back: burrow i's visit comes into its doorway, its hunger back to 0. */
function startVisit(s: State, i: number): void {
  const b = s.burrows[i]!
  const scout = i === A && b.visits === 0
  const n = scout ? 1 : visitSize(s, i)
  s.visit = { burrow: i, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
  b.visits++
  b.hunger = 0
  const door = BURROWS[i]!.door
  const cell = doorCell(s, i)
  for (let k = 0; k < n; k++)
    s.munchers.push({
      id: s.nextMuncher++,
      burrow: i,
      mode: 'peek',
      modeAt: s.tick,
      cell,
      toward: cell,
      stepAt: s.tick,
      stepFor: scout ? SCOUT_STEP : WALK_STEP,
      hop: { x0: door.x, y0: door.y, x1: door.x, y1: door.y, at: s.tick, until: s.tick },
      homeWhy: null,
      target: null,
      tried: [],
      cheeks: [],
      grabAt: -1,
      idleSince: -1,
      outAt: -1,
      scout,
      shotBy: -1,
    })
}

/**
 * Once a second (rules.step when the tick is a multiple of HZ): every burrow's hunger, its
 * warning and its visit coming out (the file comment has the rules). The None switch keeps
 * every burrow asleep with its hunger at 0.
 */
export function stepBurrows(s: State): void {
  const none = s.switches.munchers === 'none'
  s.burrows.forEach((b, i) => {
    if (none) {
      b.hunger = 0
      b.warnAt = -1
      return
    }
    if (!mayWake(s, i)) return
    if (i === A && b.visits === 0 && b.sleepUntil < 0 && b.hunger === 0) b.sleepUntil = s.tick + SCOUT_AFTER
    if (b.sleepUntil > s.tick || s.munchers.some((m) => m.burrow === i)) return
    const warning = b.hunger === HUNGER_FULL && b.warnAt >= 0
    if (s.night !== null || s.launch !== null) {
      if (warning) {
        b.hunger = WAIT_AT
        b.warnAt = -1
      }
      return
    }
    if (warning) {
      if (s.tick - b.warnAt < WARN) return
      if (!heldBack(s, i)) return startVisit(s, i)
      b.hunger = WAIT_AT
      b.warnAt = -1
      return
    }
    b.hunger = Math.min(HUNGER_FULL, b.hunger + growth(s, i))
    if (b.hunger < HUNGER_FULL) return
    if (heldBack(s, i)) b.hunger = WAIT_AT
    else {
      b.warnAt = s.tick
      s.events.push({ kind: 'warn', burrow: i })
    }
  })
}

/** Burrow i's hunger grows from its flowers now (land open, allowed to wake, awake, its munchers in, the Many or Polite switch, no night or launch, not yet waiting): the renderer's music notes fly to it then. */
export function listening(s: State, burrow: number): boolean {
  const b = s.burrows[burrow]!
  const mode = s.switches.munchers
  return (mode === 'many' || mode === 'polite') && mayWake(s, burrow) && b.sleepUntil <= s.tick && !s.munchers.some((m) => m.burrow === burrow) && s.night === null && s.launch === null && b.hunger < WAIT_AT
}

/** Cell c is on burrow `burrow`'s flowers, near them (within HUNGER.nearCells), or neither: a machine with a cell there counts for its hunger. */
export function nearFlowers(burrow: number, c: number): 'on' | 'near' | null {
  const z = ZONES[burrow]![c]!
  return z === 2 ? 'on' : z === 1 ? 'near' : null
}

// ---------------------------------------------------------------------------------------
// The munchers' acts

/** The made thing trying to come into belt cell c while a muncher sits there: from a belt behind it or a side join, else off the roof stack of the building whose spout c is; null when nothing it eats is coming. */
function coming(s: State, c: number): { thing: Thing; slot: number; from: Building | null } | null {
  const { preds } = s.net
  const own = inSlot(c)
  for (const t of [inSlot(c), outSlot(c)])
    for (let k = 0; k < PRED; k++) {
      const x = preds[PRED * t + k]!
      if (x < 0) break
      const v = s.belts.slot[x]!
      if (x !== own && v >= 0 && isShiny(THINGS[v]!)) return { thing: THINGS[v]!, slot: x, from: null }
    }
  const side = s.belts.in[c]!
  if (side < 0) throw new Error(`a muncher sits on cell ${c}, where there is no belt`)
  const n = stepCell(c, side as Dir)
  const id = n < 0 ? -1 : s.owner[n]!
  if (id < 0) return null
  const b = building(s, id)
  const top = hasMouths(b) ? pushHead(b) : null
  return top !== null && isShiny(top) ? { thing: top, slot: -1, from: b } : null
}

/** Sitting: every GRAB_EVERY it eats what is trying to come in (nom nom), full cheeks burp home, and with nothing coming for WALK_ON it walks on. */
function sit(s: State, m: Muncher): void {
  const food = coming(s, m.cell)
  if (food === null) {
    if (s.tick - m.idleSince >= WALK_ON) decide(s, m)
    return
  }
  m.idleSince = s.tick
  if (s.tick - Math.max(m.grabAt, m.modeAt) < GRAB_EVERY) return
  if (food.from !== null) food.from.stack.shift()
  else s.belts.slot[food.slot] = -1
  m.cheeks.push(food.thing)
  m.grabAt = s.tick
  const p = feet(s, m)
  s.events.push({ kind: 'nom', id: m.id, thing: food.thing, x: p.x, y: p.y })
  if (m.cheeks.length < cheeksOf(m)) return
  s.events.push({ kind: 'burp', id: m.id, x: p.x, y: p.y })
  goHome(s, m, 'full')
}

/** Napping: when its nap is over it takes one made thing (off the roof stack, else the most wanted of the inputs; never a rock) and hops home. */
function nap(s: State, m: Muncher): void {
  const b = napsOn(s, m)
  if (s.tick - m.modeAt < (b.kind === 'greenMaker' || b.kind === 'orangeMaker' ? NAP_BOTTLE : NAP_OTHER)) return
  // Its own nap is what keeps trade.ts pushHead from offering the stack, so it reads the roof itself.
  const top = b.stack.length > 0 ? b.stack[0]! : null
  if (top !== null && isShiny(top)) {
    b.stack.shift()
    m.cheeks.push(top)
  } else
    for (let k = THINGS.length - 1; k >= 0; k--)
      if (isShiny(THINGS[k]!) && b.held[k]! > 0) {
        b.held[k]!--
        m.cheeks.push(THINGS[k]!)
        break
      }
  goHome(s, m, 'nothing')
}

/** The hedge cell nibbler m eats: its target. */
function hedgeOf(m: Muncher): number {
  const t = m.target
  if (t === null || t.kind !== 'cell') throw new Error(`muncher ${m.id} nibbles no hedge`)
  return t.cell
}

/** Nibbling the hedge that is its target: a crunch at each of three bites, and after NIBBLE_FOR a stump and a fresh decision. An edit that takes the hedge back stops the nibble first (afterEdit), so a hedge is always there to leave its stump. */
function nibble(s: State, m: Muncher): void {
  const cell = hedgeOf(m)
  const age = s.tick - m.modeAt
  const bite = Math.floor(NIBBLE_FOR / 3)
  if (age < NIBBLE_FOR) {
    if (age % bite === Math.floor(bite / 4)) s.events.push({ kind: 'crunch', cell })
    return
  }
  if (s.hedge[cell] !== 1) throw new Error(`muncher ${m.id} nibbled cell ${cell}, where there is no hedge`)
  s.hedge[cell] = 2
  s.stumpAt[cell] = s.tick
  decide(s, m)
}

/** At the bowl: two gold bars there make a picnic (a burrow's first makes it a friend and its heap flies home); fewer, it peers in and shrugs. */
function atBowl(s: State, m: Muncher): void {
  m.hop = null
  if (!standable(s, m, m.cell)) {
    setMode(s, m, 'out')
    return hopAside(s, m)
  }
  const t = m.target
  const bowl = t !== null && t.kind === 'building' ? s.buildings.find((b) => b.id === t.id && b.kind === 'bowl') : undefined
  const gold = thingIndex('goldBar')
  if (bowl === undefined || bowl.held[gold]! < BOWL_PER_MUNCHER) {
    m.modeAt = s.tick
    s.events.push({ kind: 'shrug', id: m.id })
    return
  }
  bowl.held[gold]! -= BOWL_PER_MUNCHER
  visitOf(s).fed++
  setMode(s, m, 'picnic')
  s.events.push({ kind: 'picnic', id: m.id, burrow: m.burrow })
  const home = s.burrows[m.burrow]!
  if (home.friend) return
  home.friend = true
  s.events.push({ kind: 'friend', burrow: m.burrow })
  const things: Thing[] = []
  home.heap.forEach((n, k) => {
    for (let j = 0; j < n; j++) things.push(THINGS[k]!)
  })
  home.heap = noCounts()
  sendWhereWanted(s, things, heapPoint(m.burrow), s.tick)
}

/** The bowl muncher m hops to first: one standing on its burrow's flowers with a cell beside it to stand on, the one with the most gold bars not already promised to a muncher hopping there, then the nearest its door, then the lower id. Null with none. */
function bowlFor(s: State, m: Muncher): { id: number; cell: number } | null {
  let best: { id: number; cell: number; bars: number; d: number } | null = null
  for (const b of s.buildings) {
    const c = cellOf(b.x, b.y)
    if (b.kind !== 'bowl' || FLOWER_OF[c] !== m.burrow) continue
    let cell = -1
    for (const d of DIRS) {
      const n = stepCell(c, d)
      if (n >= 0 && walkable(s, n, false) && (cell < 0 || byDoor(m.burrow)(n, cell) < 0)) cell = n
    }
    if (cell < 0) continue
    const promised = s.munchers.filter((x) => x.mode === 'bowl' && x.hop !== null && sameTarget({ kind: 'building', id: b.id }, x.target)).length
    const bars = b.held[thingIndex('goldBar')]! - BOWL_PER_MUNCHER * promised
    const d = doorD2(m.burrow, cell)
    if (best === null || bars > best.bars || (bars === best.bars && (d < best.d || (d === best.d && b.id < best.id)))) best = { id: b.id, cell, bars, d }
  }
  return best === null ? null : { id: best.id, cell: best.cell }
}

/** The next muncher in the doorway hops out: to its bowl first when its burrow has one, else onto the cell by the door. */
function hopOut(s: State, m: Muncher): void {
  m.outAt = s.tick
  s.events.push({ kind: 'hopOut', id: m.id, burrow: m.burrow })
  const bowl = bowlFor(s, m)
  if (bowl === null) {
    hopToCell(s, m, doorCell(s, m.burrow), HOME_STEP)
    return setMode(s, m, 'out')
  }
  hopToCell(s, m, bowl.cell, HOME_STEP)
  m.target = { kind: 'building', id: bowl.id }
  setMode(s, m, 'bowl')
}

/** The visit's munchers in the doorway hop out HOP_OUT_EVERY apart, the lowest id first, the first HOP_OUT_EVERY after the visit came. */
function hopOuts(s: State): void {
  const v = s.visit
  if (v === null) return
  let last = v.at
  let first: Muncher | null = null
  for (const m of s.munchers) {
    last = Math.max(last, m.outAt)
    if (first === null && m.mode === 'peek') first = m
  }
  if (first !== null && s.tick - last >= HOP_OUT_EVERY) hopOut(s, first)
}

/** One muncher's tick: the switch, the launch and the 60 s limit first, then its act. */
function act(s: State, m: Muncher): void {
  const mode = s.switches.munchers
  if (m.mode === 'home') {
    if (s.tick >= m.hop!.until) inDoor(s, m)
    return
  }
  if (m.mode === 'watch') {
    if (mode === 'none' || s.launch === null) goHome(s, m, 'late')
    else if (m.hop !== null && s.tick >= m.hop.until) m.hop = null
    return
  }
  // The None switch, and the rocket full with Fuel! found: everyone out hops home. The Few switch keeps the visit's first muncher out and sends the rest home, as a visit under Few is one muncher: the parent's gentle first try changes the visit he sees at once.
  if (mode === 'none' || (rocketFull(s) && s.found.includes('fuel'))) return goHome(s, m, 'late')
  if (mode === 'few' && m.mode !== 'caught' && m.mode !== 'picnic' && s.munchers.some((x) => x.id < m.id && x.mode !== 'home' && x.mode !== 'watch')) return goHome(s, m, 'late')
  if (m.outAt >= 0 && s.tick - m.outAt >= OUT_FOR && m.mode !== 'caught' && m.mode !== 'picnic') return goHome(s, m, 'late')
  const polite = mode === 'polite'
  switch (m.mode) {
    case 'peek':
      return
    case 'out':
      if (s.tick < m.hop!.until) return
      m.hop = null
      if (!standable(s, m, m.cell)) return hopAside(s, m)
      return decide(s, m)
    case 'bowl':
      if (m.hop !== null) {
        if (s.tick >= m.hop.until) atBowl(s, m)
      } else if (s.tick - m.modeAt >= SHRUG_FOR) decide(s, m)
      return
    case 'walk':
      if (s.tick >= m.stepAt + m.stepFor) onward(s, m)
      return
    case 'sit':
      return polite ? decide(s, m) : sit(s, m)
    case 'nap':
      if (!polite) return nap(s, m)
      offRoof(s, m)
      return setMode(s, m, 'out')
    case 'nibble':
      return polite ? decide(s, m) : nibble(s, m)
    case 'wait':
      if (polite || !s.munchers.some((x) => x.mode === 'nibble')) decide(s, m)
      return
    case 'caught':
      if (m.hop !== null) {
        if (s.tick < m.hop.until) return
        m.hop = null
        if (!standable(s, m, m.cell)) hopAside(s, m)
      } else if (m.toward !== m.cell && s.tick >= m.stepAt + m.stepFor) m.cell = m.toward
      return
    case 'picnic':
      if (s.tick - m.modeAt >= PICNIC_FOR) goHome(s, m, 'fed')
      return
    case 'polite':
      if (!polite) decide(s, m)
      else if (s.tick - m.modeAt >= POLITE_FOR) goHome(s, m, 'late')
      return
  }
}

/** The launch: from her tap every burrow awake sends a watcher (once it has no visit out) to sit by the pad with a little flag, hopping there in time for the count. */
function sendWatchers(s: State): void {
  if (s.launch === null || s.visit !== null || s.night !== null || s.switches.munchers === 'none') return
  BURROWS.forEach((site, i) => {
    if (!burrowAwake(s, i) || s.munchers.some((m) => m.burrow === i && m.mode === 'watch')) return
    const door = site.door
    const spot = WATCH[i]!
    const to = mid(spot)
    s.munchers.push({
      id: s.nextMuncher++,
      burrow: i,
      mode: 'watch',
      modeAt: s.tick,
      cell: spot,
      toward: spot,
      stepAt: s.tick,
      stepFor: WALK_STEP,
      hop: { x0: door.x, y0: door.y, x1: to.x, y1: to.y, at: s.tick, until: s.tick + Math.min(COUNT_AT, hopTicks(door, to, HOME_STEP)) },
      homeWhy: null,
      target: null,
      tried: [],
      cheeks: [],
      grabAt: -1,
      idleSince: -1,
      outAt: s.tick,
      scout: false,
      shotBy: -1,
    })
    s.events.push({ kind: 'hopOut', id: s.nextMuncher - 1, burrow: i })
  })
}

/** A stump somebody stands on (or steps onto) keeps its stamp fresh; REGROW after the last one left, it is a hedge again. */
function regrow(s: State): void {
  const { hedge, stumpAt } = s
  for (const m of s.munchers)
    if (m.hop === null) {
      if (hedge[m.cell] === 2) stumpAt[m.cell] = s.tick
      if (hedge[m.toward] === 2) stumpAt[m.toward] = s.tick
    }
  const cells = CELLS
  const regrowFor = REGROW
  for (let c = 0; c < cells; c++)
    if (hedge[c] === 2 && s.tick - stumpAt[c]! >= regrowFor) {
      hedge[c] = 1
      s.events.push({ kind: 'regrow', cell: c })
    }
}

/**
 * Every tick (rules.step, after the belts' hop and stepTowers): Beep's tickles, the next
 * muncher out of the doorway, the launch's watchers, each muncher's act (walking, sitting and
 * grabbing, napping, nibbling, the bowl and the picnic, polite sitting, going home, the 60 s
 * limit and the switch), and the stumps.
 */
export function stepMunchers(s: State): void {
  tickles(s)
  hopOuts(s)
  sendWatchers(s)
  for (const m of [...s.munchers]) act(s, m)
  regrow(s)
}

// ---------------------------------------------------------------------------------------
// Tickles

/** Where a caught muncher comes to rest: the end of its hop or of its step. */
function restOf(m: Muncher): Point {
  return m.hop !== null ? { x: m.hop.x1, y: m.hop.y1 } : mid(m.toward)
}
/** Beep flies to the first caught muncher, to its side, facing it. */
function beepOn(s: State): void {
  const p = restOf(muncherOf(s, s.tickles[0]!))
  const x = s.beep.x > p.x ? p.x + 0.55 : p.x - 0.55
  s.tickleAt = s.tick
  beepTo(s, x, p.y, 'tickle', s.tick)
  s.beep.facing = x < p.x ? 1 : -1
}
/** It leaves Beep's queue (tickled, sudsed, or gone home); when it was the one Beep was tickling, Beep goes on to the next. */
function dropTickle(s: State, m: Muncher): void {
  const k = s.tickles.indexOf(m.id)
  if (k < 0) return
  s.tickles.splice(k, 1)
  if (k === 0 && s.tickles.length > 0) beepOn(s)
}
/** Beep tickles the caught munchers in tap order, TICKLE_FOR each: a sneeze sends its cheeks where they are wanted and it giggles home. */
function tickles(s: State): void {
  if (s.tickles.length === 0 || s.tick - s.tickleAt < TICKLE_FOR) return
  const m = muncherOf(s, s.tickles[0]!)
  sneeze(s, m)
  visitOf(s).tickled++
  goHome(s, m, 'tickled')
}

/**
 * The 'tickle' action, from any finger at any time: the muncher is caught at once and waits
 * wiggling for Beep (a napper climbs down, one in the doorway pops out of it); with CAUGHT_MAX
 * caught already it only giggles and looks up. One going home, already caught, or watching
 * the launch is left as it is.
 */
export function tickle(s: State, id: number): void {
  const m = muncherOf(s, id)
  if (m.mode === 'home' || m.mode === 'watch' || m.mode === 'caught') return
  if (s.tickles.length >= CAUGHT_MAX) {
    s.events.push({ kind: 'tickleBusy', id })
    return
  }
  if (m.mode === 'nap') offRoof(s, m)
  else if (m.mode === 'peek') {
    hopToCell(s, m, doorCell(s, m.burrow), TICKLED_STEP)
    m.outAt = s.tick
  }
  m.target = null
  setMode(s, m, 'caught')
  s.events.push({ kind: 'caught', id })
  s.tickles.push(id)
  if (s.tickles.length === 1) beepOn(s)
}

// ---------------------------------------------------------------------------------------
// Towers

/** What tower b shoots at: a muncher whose cell is within TOWER_REACH2 of it, not going home, caught, watching or already shot at; sitting and napping ones first, then the nearest, then the lower id. */
function aimOf(s: State, b: Building): Muncher | null {
  let best: Muncher | null = null
  let bestKey = Infinity
  for (const m of s.munchers) {
    if (m.mode === 'home' || m.mode === 'watch' || m.mode === 'caught' || m.shotBy >= 0) continue
    const dx = xOf(m.cell) - b.x
    const dy = yOf(m.cell) - b.y
    const d2 = dx * dx + dy * dy
    if (d2 > TOWER_REACH2) continue
    const key = (m.mode === 'sit' || m.mode === 'nap' ? 0 : TOWER_REACH2 + 1) + d2
    if (key < bestKey) {
      best = m
      bestKey = key
    }
  }
  return best
}

/**
 * Every tick (rules.step, after the belts' hop): the suds that land now (the muncher sneezes
 * its cheeks back and floats home in suds, the tower earns a star) and the towers that shoot
 * now: every TOWER_EVERY a tower with ammo shoots at the muncher aimOf picks, reserving it,
 * one shot of ammo a puff and one bubble of `held` when a bubble's second shot goes.
 */
export function stepTowers(s: State): void {
  if (s.shots.some((x) => x.lands <= s.tick)) {
    const now = s.shots.filter((x) => x.lands <= s.tick)
    s.shots = s.shots.filter((x) => x.lands > s.tick)
    for (const shot of now) {
      const m = s.munchers.find((x) => x.id === shot.muncher)
      if (m === undefined || m.mode === 'home' || m.mode === 'watch') continue
      const p = feet(s, m)
      s.events.push({ kind: 'suds', id: m.id, x: p.x, y: p.y })
      sneeze(s, m)
      visitOf(s).sent++
      const tower = s.buildings.find((x) => x.id === shot.tower)
      if (tower !== undefined) tower.stars++
      goHome(s, m, 'sudsed')
    }
  }
  for (const b of s.buildings) {
    if (b.kind !== 'tower' || b.ammo <= 0 || (b.shotAt >= 0 && s.tick - b.shotAt < TOWER_EVERY)) continue
    const m = aimOf(s, b)
    if (m === null) continue
    m.shotBy = b.id
    b.ammo--
    if (b.ammo % TOWER_AMMO_PER_BUBBLE === 0) b.held[thingIndex('bubble')]!--
    b.shotAt = s.tick
    s.shots.push({ tower: b.id, muncher: m.id, at: s.tick, lands: s.tick + TOWER_FLIGHT })
    s.events.push({ kind: 'shot', tower: b.id, muncher: m.id })
  }
}

// ---------------------------------------------------------------------------------------
// Good night, edits, and what the others read

/** Good night: every muncher out sneezes its cheeks back and yawns home. */
export function goodnightHome(s: State): void {
  for (const m of [...s.munchers]) {
    if (m.mode === 'home') continue
    sneeze(s, m)
    goHome(s, m, 'night')
  }
}

/** A nibbler keeps nibbling through an edit only while the hedge it eats still stands, nothing is in reach without hedges, and that hedge is still the first on its way. A hedge taken back under its bites (the peel, Oops, a stroke over it) lets it decide again: it walks on through the gap, or steps in and nibbles the next hedge behind it. */
function stillNibbling(s: State, m: Muncher): boolean {
  const cell = hedgeOf(m)
  if (s.hedge[cell] !== 1) return false
  const p = plan(s, m.cell, m.scout, m.tried, takenBy(s, m), false)
  return p !== null && p.hedges && p.goal !== m.cell && wayTo(p.ways, p.goal)[1] === cell
}

/**
 * After every applied edit (rules.act: a stroke, a place, a peel, a hedge line, Oops). One
 * standing where a sticker or a hedge came down hops aside with a giggle, and a napper whose
 * machine Oops took away hops down; one sitting on a cell that is no longer a belt to sit on
 * walks on, a polite one whose spot is gone finds another, one waiting behind a nibbler looks
 * again, and a nibbler stops when a way opened. Walkers find their way afresh at their next
 * cell, and munchers in the air look where to go when they land.
 */
export function afterEdit(s: State): void {
  for (const m of [...s.munchers]) {
    if (m.mode === 'peek' || m.mode === 'out' || m.mode === 'bowl' || m.mode === 'home' || m.mode === 'watch') continue
    if (m.mode === 'nap') {
      if (s.buildings.some((b) => b.napper === m.id)) continue
      setMode(s, m, 'out')
      hopAside(s, m)
      continue
    }
    if (!standable(s, m, m.cell) || !standable(s, m, m.toward)) {
      if (m.mode !== 'caught') setMode(s, m, 'out')
      hopAside(s, m)
      continue
    }
    if ((m.mode === 'sit' && !seat(s, m.cell)) || (m.mode === 'polite' && !beside(s, m.cell)) || m.mode === 'wait' || (m.mode === 'nibble' && !stillNibbling(s, m))) decide(s, m)
  }
}

/** The muncher sitting on belt cell `cell`, or null. */
export function sittingAt(s: State, cell: number): Muncher | null {
  return s.munchers.find((m) => m.mode === 'sit' && m.cell === cell) ?? null
}

/** The way burrow `burrow`'s first muncher would walk now from its door to its first target, cell by cell (empty with nothing to go for), its own visit's targets left free: the paw prints a tap on the burrow shows, and the hint's trail for a tower or a hedge line. */
export function pawsOf(s: State, burrow: number): number[] {
  const others = s.munchers.flatMap((m) => (m.burrow === burrow || m.target === null ? [] : [m.target]))
  const p = plan(s, doorCell(s, burrow), burrow === A && s.burrows[A]!.visits === 0, [], others, s.switches.munchers === 'polite')
  return p === null ? [] : wayTo(p.ways, p.goal)
}
