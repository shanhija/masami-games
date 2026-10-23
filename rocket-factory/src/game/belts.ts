import { cellOf, dirTo, onBoard, stepCell } from './board'
import { SIZE } from './catalog'
import { CELLS, OVER, PRED, SLOTS, THINGS, inSlot, opposite, outSlot, overIn, overOut, slotCell, thingIndex, type Building, type CellBelt, type Dir, type Net, type State, type Thing } from './model'
import { building, give, pushHead, take, takeUnder, wants, wantsUnder } from './trade'

/**
 * The belts' slot engine (plans/rocket-factory.md, Belts and Engineering): `rebuildNet`
 * derives State.net from the belt cells and the buildings after every edit and every load,
 * and `hop` moves every thing one slot on a hop tick. `rebuild` refreshes everything derived
 * from the layout.
 *
 * The graph. A cell's main lane runs from its in slot to its out slot, and out(c) goes on to
 * the neighbour n by c's out side: in(n) when n's in side faces c; out(n) when n is a plain
 * straight belt and c points into its side (a side join, landing mid-cell and taking turns
 * with n's own in slot); overIn(n) when n is a bridge whose over lane runs c's way; the mouth
 * of the building whose footprint n is (-2 - id); else nowhere (-1), a dead end where things
 * queue nose to tail (a head-on pair, a bend's other sides, a bridge's side, the ground, the
 * edge). A bridge's over lane runs straight across its cell and goes on the same way. A fork's
 * out slot has a second way, in(m) of the belt that starts at its fork side, and never lands
 * as a side join. Towers and bowls sit on a belt cell and things pass under them: they have
 * no footprint for mouths and spouts.
 *
 * The hop, decided from the snapshot at its start and committed all at once:
 *  1. Every building pushes the head of its stack onto its free spouts, one thing a spout, in
 *     turn from its outTurn. A pushed thing waits for the next hop.
 *  2. A tower or a bowl takes one thing it wants from the belt under it, and every building
 *     takes what it wants from its mouths in turn from its inTurn, its room counted thing by
 *     thing (trade.ts).
 *  3. Every other thing moves to its successor when that slot is empty or empties this hop
 *     and the thing wins the slot's turn: a join's feeders take turns from joinTurn, the
 *     cell's own in slot first, then its side joins clockwise. A memoised walk downstream
 *     decides it, and a probe that runs into a slot still open on the walk has found a cycle
 *     with no way out: a full loop stands still, and a loop with a gap turns whole. On this
 *     walk a fork tries only the way its forkTurn names.
 *  4. A fork whose way stays shut then tries its other way, one fork at a time, the lowest
 *     cell first, its move freeing the things behind it before the next fork is asked. So a
 *     fork on a full loop sends things out of it, two forks on one full loop never wait for
 *     each other, a fork sends everything one way while the other is full, and the outcome
 *     never depends on the walk's order (belts.test.ts holds it against a slow reference that
 *     moves one thing at a time).
 * A cell where a muncher sits (mode 'sit') neither gives nor takes: its things stand still and
 * nothing enters it.
 */

/** A net with no belts: every slot a dead end with no feeders. */
export function emptyNet(): Net {
  return {
    next: new Int32Array(SLOTS).fill(-1),
    next2: new Int32Array(SLOTS).fill(-1),
    preds: new Int32Array(SLOTS * PRED).fill(-1),
    mouths: new Map(),
    spouts: new Map(),
  }
}

/** Each cell's building id, or -1. A tower or a bowl owns the belt cell it sits on. Throws on two buildings sharing a cell: strokes.ts never lets that happen. */
export function owners(s: State): Int16Array {
  const out = new Int16Array(CELLS).fill(-1)
  for (const b of s.buildings)
    for (let y = b.y; y < b.y + SIZE[b.kind]; y++)
      for (let x = b.x; x < b.x + SIZE[b.kind]; x++) {
        const c = cellOf(x, y)
        if (out[c] !== -1) throw new Error(`buildings ${out[c]} and ${b.id} share cell ${x}, ${y}`)
        out[c] = b.id
      }
  return out
}

/** Rebuilds everything derived from the layout: the cells' owners and the belts' slot graph. Called after every edit and every load. */
export function rebuild(s: State): void {
  s.owner = owners(s)
  rebuildNet(s)
}

/** Derives `s.net` (every slot's successors and feeders, every building's mouths and spouts) from `s.belts` and `s.buildings`. */
export function rebuildNet(s: State): void {
  s.net = deriveNet(s)
}

/** A building with a footprint that trades through mouths and spouts: every kind but the tower and the bowl, which sit on a belt cell and let it run under them. */
export const hasMouths = (b: Building) => b.kind !== 'tower' && b.kind !== 'bowl'

/** Cell c's belt as an edit records it, or null where there is none. */
export function cellBelt(s: State, c: number): CellBelt | null {
  const b = s.belts
  return b.out[c]! < 0 ? null : { in: b.in[c]!, out: b.out[c]!, fork: b.fork[c]!, over: b.over[c]!, pattern: b.pattern[c]! }
}

/** The thing in a slot, or null. */
export const thingAt = (s: State, slot: number): Thing | null => (s.belts.slot[slot]! < 0 ? null : THINGS[s.belts.slot[slot]!]!)

/** The things riding these cells, slot by slot (each cell's in, out, then its over lane's). */
export function thingsOn(s: State, cells: readonly number[]): { slot: number; thing: Thing }[] {
  const out: { slot: number; thing: Thing }[] = []
  for (const c of cells)
    for (const x of [inSlot(c), outSlot(c), overIn(c), overOut(c)]) {
      const thing = thingAt(s, x)
      if (thing !== null) out.push({ slot: x, thing })
    }
  return out
}

/**
 * Walks the belts downstream from these slots, through forks, joins and bridges: the
 * buildings whose mouths they reach (lowest id first), and every cell on the way into `cells`
 * when it is given. A building's line is where its spouts' belts lead: the hint follows it, and
 * Beep's carry off a full stack keeps to it (beep.ts).
 */
export function downstream(s: State, slots: readonly number[], cells: Uint8Array | null): number[] {
  const { next, next2 } = s.net
  const over = OVER
  const seen = new Uint8Array(next.length)
  const reached = new Set<number>()
  const todo = [...slots]
  while (todo.length > 0) {
    const x = todo.pop()!
    if (seen[x] === 1) continue
    seen[x] = 1
    if (cells !== null) cells[x >= over ? (x - over) >> 1 : x >> 1] = 1
    for (const y of [next[x]!, next2[x]!]) {
      if (y >= 0) todo.push(y)
      else if (y <= -2) reached.add(-2 - y)
    }
  }
  return [...reached].sort((p, q) => p - q)
}

/**
 * The run through belt cell c, in the order things ride it: the lane pieces joined in slot to
 * out slot to in slot both ways from c, up to the next fork, join (a cell its side joins land
 * on) or building (a footprint, or a tower or bowl standing on the belt), none of which
 * belong to it. A fork, join or tower cell is a run of its own. The peel's first tap lifts it.
 * A bridge's run is its over lane, the one on top.
 */
export function runOf(s: State, c: number): number[] {
  const { net, belts } = s
  const bound = (n: number) => belts.fork[n]! >= 0 || s.owner[n]! >= 0 || net.preds[PRED * outSlot(n) + 1]! >= 0
  if (bound(c)) return [c]
  const first = belts.over[c]! >= 0 ? overIn(c) : inSlot(c)
  const down: number[] = []
  let o = first + 1
  for (; ; o = net.next[o]! + 1) {
    // Only in slots carry a run on; an out slot is a side join onto another belt.
    const y = net.next[o]!
    if (y < 0 || y % 2 === 1 || slotCell(y) === c || bound(slotCell(y))) break
    down.push(slotCell(y))
  }
  // A loop with no fork, join or building comes back round to c: it is all one run.
  if (net.next[o]! >= 0 && slotCell(net.next[o]!) === c) return [c, ...down]
  const up: number[] = []
  for (let i = first; ; ) {
    const p = net.preds[PRED * i]!
    if (p < 0 || slotCell(p) === c || bound(slotCell(p))) break
    up.push(slotCell(p))
    i = p - 1
  }
  return [...up.reverse(), c, ...down]
}

/** The slot graph of the layout as it stands: rebuildNet keeps it in `s.net`, and lintNet checks the two agree. */
export function deriveNet(s: State): Net {
  const net = emptyNet()
  const { in: ins, out, fork, over } = s.belts
  const foot = new Int16Array(CELLS).fill(-1)
  for (const b of s.buildings) if (hasMouths(b)) for (let y = b.y; y < b.y + SIZE[b.kind]; y++) for (let x = b.x; x < b.x + SIZE[b.kind]; x++) foot[cellOf(x, y)] = b.id
  /** Where a lane leaving cell c by side d goes; `joins` is false for a fork's out, which never lands as a side join. */
  const lead = (c: number, d: Dir, joins: boolean): number => {
    const n = stepCell(c, d)
    if (n < 0) return -1
    if (foot[n]! >= 0) return -2 - foot[n]!
    if (out[n]! < 0) return -1
    const back = opposite(d)
    if (ins[n] === back) return inSlot(n)
    if (over[n] === d) return overIn(n)
    if (joins && ins[n] === opposite(out[n] as Dir) && fork[n]! < 0 && over[n]! < 0 && out[n] !== back) return outSlot(n)
    return -1
  }
  for (let c = 0; c < CELLS; c++) {
    if (out[c]! < 0) continue
    net.next[inSlot(c)] = outSlot(c)
    net.next[outSlot(c)] = lead(c, out[c] as Dir, fork[c]! < 0)
    if (fork[c]! >= 0) {
      const m = stepCell(c, fork[c] as Dir)
      if (m >= 0 && out[m]! >= 0 && ins[m] === opposite(fork[c] as Dir)) net.next2[outSlot(c)] = inSlot(m)
    }
    if (over[c]! >= 0) {
      net.next[overIn(c)] = overOut(c)
      net.next[overOut(c)] = lead(c, over[c] as Dir, true)
    }
  }
  // Feeders in turn order: a main out slot's own in slot first, then its side joins clockwise from its in side.
  const key = (t: number, x: number) => (t >= OVER || t % 2 === 0 || x === t - 1 ? 0 : (dirTo(slotCell(t), slotCell(x)) - ins[slotCell(t)]! + 4) % 4)
  const add = (t: number, x: number) => {
    const base = PRED * t
    let k = 0
    while (k < PRED && net.preds[base + k]! >= 0) k++
    if (k === PRED) throw new Error(`slot ${t} has more than ${PRED} feeders`)
    for (; k > 0 && key(t, net.preds[base + k - 1]!) > key(t, x); k--) net.preds[base + k] = net.preds[base + k - 1]!
    net.preds[base + k] = x
  }
  for (let x = 0; x < SLOTS; x++) {
    if (net.next[x]! >= 0) add(net.next[x]!, x)
    if (net.next2[x]! >= 0) add(net.next2[x]!, x)
  }
  // Mouths and spouts round each footprint, clockwise from its top-left corner: each ring cell with the side that faces the footprint.
  for (const b of s.buildings) {
    const mouths: number[] = []
    const spouts: number[] = []
    if (hasMouths(b)) {
      const k = SIZE[b.kind]
      const ring: [number, number, Dir][] = []
      for (let i = 0; i < k; i++) ring.push([b.x + i, b.y - 1, 1])
      for (let i = 0; i < k; i++) ring.push([b.x + k, b.y + i, 2])
      for (let i = k - 1; i >= 0; i--) ring.push([b.x + i, b.y + k, 3])
      for (let i = k - 1; i >= 0; i--) ring.push([b.x - 1, b.y + i, 0])
      for (const [x, y, d] of ring) {
        if (!onBoard(x, y)) continue
        const c = cellOf(x, y)
        if (out[c]! < 0) continue
        if (out[c] === d) mouths.push(outSlot(c))
        if (over[c] === d) mouths.push(overOut(c))
        if (ins[c] === d) spouts.push(inSlot(c))
        if (over[c] === opposite(d)) spouts.push(overIn(c))
      }
    }
    net.mouths.set(b.id, mouths)
    net.spouts.set(b.id, spouts)
  }
  return net
}

/** The walk's default order: every slot, lowest first. */
const WALK: readonly number[] = Array.from({ length: SLOTS }, (_, i) => i)
/** A slot's state on the walk: not looked at yet (0), open on the walk, moving, staying. */
const OPEN = 1
const YES = 2
const NO = 3
/** Where a moving thing goes when a building takes it. */
const INTO = -2

/** One hop of every belt, called by the rules on every hop tick (the file comment has the order of it). */
export function hop(s: State): void {
  hopInOrder(s, WALK)
}

/** One hop with the walk visiting the slots in `walk`'s order (every slot once). `hop` walks them lowest first; belts.test.ts shuffles the order to show the outcome never depends on it. */
export function hopInOrder(s: State, walk: readonly number[]): void {
  const { belts, net } = s
  const { slot, from, fork, forkTurn, joinTurn } = belts
  const { next, next2, preds } = net
  // The tests' module runner reads every import through a getter, so the loops below read local copies.
  const over = OVER
  const pred = PRED
  const cells = CELLS
  const cellAt = (x: number) => (x >> 1) % cells
  const snap = slot.slice()
  const frozen = new Uint8Array(cells)
  for (const m of s.munchers) if (m.mode === 'sit') frozen[m.cell] = 1
  const still = (x: number) => frozen[cellAt(x)] === 1

  // 1. Each building pushes the head of its stack onto its free spouts, one a spout, in turn.
  for (const b of s.buildings) {
    const spouts = net.spouts.get(b.id)!
    const first = b.outTurn
    for (let i = 0; i < spouts.length && pushHead(b) !== null; i++) {
      const j = (first + i) % spouts.length
      const x = spouts[j]!
      if (slot[x]! >= 0 || still(x)) continue
      slot[x] = thingIndex(give(s, b))
      b.outTurn = (j + 1) % spouts.length
    }
  }

  // 2. Towers and bowls take from the belt under them, then every building from its mouths in turn. A fork's thing aims where its forkTurn says.
  const held: number[] = []
  for (let x = 0; x < snap.length; x++) if (snap[x]! >= 0) held.push(x)
  const state = new Uint8Array(snap.length)
  const dest = new Int32Array(snap.length)
  const isFork = (x: number) => x < over && x % 2 === 1 && fork[x >> 1]! >= 0
  const aim = (x: number) => (isFork(x) && forkTurn[x >> 1] === 1 ? next2[x]! : next[x]!)
  for (const b of s.buildings) {
    if (hasMouths(b)) continue
    const c = cellOf(b.x, b.y)
    for (const x of [2 * c + 1, 2 * c]) {
      if (snap[x]! < 0 || still(x) || !wantsUnder(b, THINGS[snap[x]!]!)) continue
      takeUnder(s, b, THINGS[snap[x]!]!)
      state[x] = YES
      dest[x] = INTO
      break
    }
  }
  for (const b of s.buildings) {
    const mouths = net.mouths.get(b.id)!
    const first = b.inTurn
    for (let i = 0; i < mouths.length; i++) {
      const j = (first + i) % mouths.length
      const x = mouths[j]!
      if (snap[x]! < 0 || still(x) || state[x] === YES || aim(x) !== -2 - b.id || !wants(s, b, THINGS[snap[x]!]!)) continue
      take(s, b, THINGS[snap[x]!]!)
      state[x] = YES
      dest[x] = INTO
      b.inTurn = (j + 1) % mouths.length
    }
  }

  // A slot's turn: the first of its feeders, from its turn, that holds a thing still on the belt (a join's turn is the cell's joinTurn).
  const winners = new Int32Array(snap.length).fill(-3)
  const winner = (y: number): number => {
    if (winners[y] !== -3) return winners[y]!
    let n = 0
    while (n < pred && preds[pred * y + n]! >= 0) n++
    const first = n > 0 && y < over && y % 2 === 1 ? joinTurn[y >> 1]! % n : 0
    let w = -1
    for (let i = 0; i < n && w < 0; i++) {
      const p = preds[pred * y + ((first + i) % n)]!
      if (snap[p]! >= 0 && !still(p) && state[p] !== YES) w = p
    }
    winners[y] = w
    return w
  }

  // 3. The memoised walk downstream. With every fork on one way the graph has one way out of each slot, so a probe into an open slot is a cycle with no way out, and every answer can be kept.
  const moves = (x: number): boolean => {
    if (state[x] !== 0) return state[x] === YES
    state[x] = OPEN
    const y = still(x) ? -1 : aim(x)
    const ok = y >= 0 && winner(y) === x && !still(y) && (snap[y]! < 0 || moves(y))
    if (ok) dest[x] = y
    state[x] = ok ? YES : NO
    return ok
  }
  for (const x of walk) if (snap[x]! >= 0) moves(x)

  // 4. Forks whose way stays shut try the other way, the lowest cell first, each move freeing the things behind it before the next fork is asked.
  const vacate = (v0: number) => {
    for (const todo = [v0]; todo.length > 0; ) {
      const v = todo.pop()!
      const w = winner(v)
      if (w < 0 || state[w] !== NO || aim(w) !== v) continue
      state[w] = YES
      dest[w] = v
      todo.push(w)
    }
  }
  const forks = held.filter(isFork)
  for (let moved = true; moved; ) {
    moved = false
    for (const x of forks) {
      if (state[x] !== NO || still(x)) continue
      const y = forkTurn[x >> 1] === 1 ? next[x]! : next2[x]!
      if (y >= 0) {
        if (winner(y) !== x || still(y) || (snap[y]! >= 0 && state[y] !== YES)) continue
        dest[x] = y
      } else if (y <= -2) {
        const b = building(s, -2 - y)
        if (!wants(s, b, THINGS[snap[x]!]!)) continue
        take(s, b, THINGS[snap[x]!]!)
        dest[x] = INTO
      } else continue
      state[x] = YES
      vacate(x)
      moved = true
      break
    }
  }

  // Commit every move at once, and the turns: a fork alternates, a join's turn passes its winner.
  from.fill(-1)
  for (const x of held) if (state[x] === YES) slot[x] = -1
  for (const x of held) {
    if (state[x] !== YES) {
      from[x] = x
      continue
    }
    const y = dest[x]!
    if (y >= 0) {
      slot[y] = snap[x]!
      from[y] = x
    }
    if (isFork(x)) forkTurn[x >> 1] = y >= 0 && y === next2[x] ? 0 : 1
    if (y >= 0 && y < over && y % 2 === 1 && preds[pred * y + 1]! >= 0) {
      let n = 0
      let k = 0
      for (; n < pred && preds[pred * y + n]! >= 0; n++) if (preds[pred * y + n] === x) k = n
      joinTurn[y >> 1] = (k + 1) % n
    }
  }
  // The chevrons run on every cell where nothing stood still, and the hint's stamp marks a thing standing at a lane's end with the lane full behind it: a cell's main lane, and a bridge's over lane (its hump), by the lane's in slot halved.
  const stayed = (x: number) => snap[x]! >= 0 && state[x] !== YES
  const stamp = (x: number) => (stayed(x + 1) && slot[x]! >= 0 ? (belts.blockedSince[x >> 1]! >= 0 ? belts.blockedSince[x >> 1]! : s.tick) : -1)
  for (let c = 0; c < cells; c++) {
    if (belts.out[c]! < 0) continue
    if (frozen[c] === 0 && !stayed(2 * c) && !stayed(2 * c + 1) && !stayed(over + 2 * c) && !stayed(over + 2 * c + 1)) belts.moved[c]!++
    belts.blockedSince[c] = stamp(2 * c)
    belts.blockedSince[cells + c] = belts.over[c]! >= 0 ? stamp(over + 2 * c) : -1
  }
}
