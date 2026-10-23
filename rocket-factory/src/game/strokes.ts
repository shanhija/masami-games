import { BASKET, FLOWER_OF, GROUND, PAD_RING, cellInLand, cellOf, dirTo, onBoard, rockOf, stepCell } from './board'
import { SIZE, START_STICKERS, STROKE_MAX, card } from './catalog'
import { cellBelt, deriveNet, hasMouths, owners, rebuild, runOf } from './belts'
import { CELLS, DIRS, OVER, PRED, THINGS, inSlot, newBuilding, opposite, outSlot, overIn, slotCell, thingIndex, type Building, type CellBelt, type Dir, type Edit, type Placeable, type State, type Sticker, type Thing } from './model'
import { building, everWants, gives, take, wants } from './trade'
import { slotPoint } from './where'

/**
 * Every change to the layout (plans/rocket-factory.md, Belts and Engineering): a plan for each
 * gesture, which the ghost, the commit, the hint's dotted paths, the scripted children and the
 * tests all call, so the end sign never lies, and `applyEdit`, which commits a plan and gives
 * back its inverse for Oops. Nothing here changes the State but applyEdit.
 *
 * The one total stroke table (planStroke). The finger's cells come axis-locked and L-filled;
 * going back over the cells just drawn rolls them up. Then where the stroke starts decides
 * what it does:
 *  - on the ground (a hedge or stump is taken back on the way): a new belt starts there;
 *  - in a building: it leads out of the first cell past the footprint (a spout), or crosses
 *    a plain straight belt running past that side straight on (a bridge whose lane the
 *    building feeds), as it would cross one further on;
 *  - on a belt, along its way: it rides along, and carries on past its dead end;
 *  - on a belt, against its way: it turns the belt round (re-point), and on to the belt's far
 *    end, so no head-on pair is left behind; past that end it carries on;
 *  - on a belt's first cell, away behind it or to its side: it extends the belt upstream;
 *  - on either of a dead end's last two cells, to the side: it carries on round the corner
 *    (from the one before the last, the old last cell rolls up in the same edit);
 *  - on a plain straight belt two or more cells from its end, to the side: a fork;
 *  - anything else on a belt stops.
 * And each cell it then reaches, laying from there: ground is laid; a building's edge ends it
 * in a mouth; a belt's tail ends it (feed); a plain straight belt's side is crossed straight
 * on (a bridge) or else ends it in a join: when the stroke ends there, ends one cell past it,
 * turns on it, or crosses a tower or bowl standing on it (its last cell points into that
 * side, so a stop sign there would lie); a belt's head, a bend's, a fork's or a bridge's
 * side, water, a tree, a burrow, the basket and closed land stop it, the ghost ending a cell
 * short under a stop sign (two short at a belt's head, never facing it). A stroke ending one
 * cell short of a building's edge, pointing at it, steps into the mouth; a wobbly trace of the
 * hint's dotted path (it starts and ends where the path does, and two thirds of its cells are
 * the path's) lays that path; at most STROKE_MAX cells. The end
 * sign is read off the layout the plan leaves, and no plan leaves a head-on pair.
 *
 * The helpful flip: a new belt between two buildings, or between a belt's side and a
 * building, turns round when nothing its far end can use would ride it as drawn and
 * something would ride it the other way (a fork into a building becomes a join, a join from
 * one becomes a fork). A stroke that turns its own belt round is never flipped.
 *
 * Every plan settles the forks it touches: a fork whose side no longer starts a belt, or
 * whose way on would land as a side join, becomes a plain straight belt.
 */

/** The sign the stroke's end wears: what lifting the finger will do there. */
export type EndSign = 'mouth' | 'zip' | 'hump' | 'split' | 'curl' | 'stop' | 'feed' | 'none'
export interface StrokePlan {
  /** The cells the stroke lays or changes, in its order: the ghost. */
  cells: number[]
  sign: EndSign
  /** The helpful flip turned it (the ghost shows the turned chevrons). */
  flipped: boolean
  /** What lifting commits, or null when nothing would change. */
  edit: Edit | null
}
/** Why a sticker's ghost is grey, each a thing she can see: water, a tree, a burrow, the pad or the cells round it, the basket, another building, closed land, rocks under a sticker that is not a digger, no rocks under a digger, no pond under the pump, no belt under a tower or a bowl, no flowers under a bowl; or no sticker of that kind left. */
export type Grey = 'water' | 'tree' | 'burrow' | 'pad' | 'basket' | 'building' | 'land' | 'rock' | 'noRock' | 'noPond' | 'noBelt' | 'noFlowers' | 'empty'
export interface PlacePlan {
  /** The spot the ghost snapped to: its footprint's top-left cell. */
  x: number
  y: number
  /** White (it can go there) or grey, with the reason. */
  ok: boolean
  reason: Grey | null
  /** The belt cells and hedges under it that go back (a tower or a bowl covers none: the belt runs under it). */
  covers: number[]
  hedges: number[]
  edit: Edit | null
}
/** A thing taken off a removed cell or out of a removed building, with the board point it was at, for the rules to send where it is wanted. */
export interface Displaced {
  thing: Thing
  x: number
  y: number
}

/** A lane of a cell: its main lane or its bridge's over lane. */
interface Piece {
  c: number
  over: boolean
}
/** A plan in the making: the cells as it leaves them, and the order it touched them in. */
interface Draft {
  s: State
  view: Map<number, CellBelt | null>
  order: number[]
}

// ---------------------------------------------------------------------------------------
// Small readings of the board and the belts

/** The stickers of a kind left in the tray: given at the start and by the cards found, less those on the board (a hedge or its stump); endless after the first launch. */
export function stickersLeft(s: State, sticker: Sticker): number {
  if (s.launches > 0) return Infinity
  let given = START_STICKERS[sticker] ?? 0
  for (const id of s.found) given += card(id).gives[sticker] ?? 0
  let placed = 0
  if (sticker === 'hedge') for (const h of s.hedge) placed += h !== 0 ? 1 : 0
  else for (const b of s.buildings) placed += b.kind === sticker ? 1 : 0
  return given - placed
}

/** A cell no stroke goes into or starts on: closed land, water, a tree, a burrow's mound, the basket. The pond under the pump is the pump's footprint, so a stroke leads out of it and into it as with any building. The save reads its belt cells with it too (progress.ts). */
export function blocked(s: State, c: number): boolean {
  const g = GROUND[c]
  return !cellInLand(s.land, c) || (g === 'pond' && s.owner[c]! < 0) || g === 'tree' || g === 'burrow' || c === cellOf(BASKET.x, BASKET.y)
}
/** The building whose footprint covers cell c (the pad and the machines; towers and bowls stand on belts and are no footprint), or -1. */
function footAt(s: State, c: number): number {
  const id = s.owner[c]!
  return id >= 0 && hasMouths(building(s, id)) ? id : -1
}
const at = (d: Draft, c: number): CellBelt | null => (d.view.has(c) ? d.view.get(c)! : cellBelt(d.s, c))
const put = (d: Draft, c: number, b: CellBelt | null) => {
  d.view.set(c, b)
  if (!d.order.includes(c)) d.order.push(c)
}
const sameBelt = (a: CellBelt | null, b: CellBelt | null) => (a === null || b === null ? a === b : a.in === b.in && a.out === b.out && a.fork === b.fork && a.over === b.over && a.pattern === b.pattern)
const plainStraight = (b: CellBelt | null) => b !== null && b.in === opposite(b.out as Dir) && b.fork < 0 && b.over < 0
/** A cell's lanes: its main lane, and its bridge's over lane. */
const lanesOf = (b: CellBelt): { in: number; out: number; over: boolean }[] => (b.over >= 0 ? [{ in: b.in, out: b.out, over: false }, { in: opposite(b.over as Dir), out: b.over, over: true }] : [{ in: b.in, out: b.out, over: false }])
/** A lane of cell c leaving by `side` would face a lane of its neighbour whose out side faces back: a head-on pair. */
function facesHead(d: Draft, c: number, side: Dir): boolean {
  const n = stepCell(c, side)
  const nb = n < 0 ? null : at(d, n)
  return nb !== null && lanesOf(nb).some((l) => l.out === opposite(side))
}
/** facesHead on the layout as it stands: lintNet reports such a pair, and the save drops both of its cells (progress.ts). */
export const headOn = (s: State, c: number, side: Dir) => facesHead({ s, view: new Map(), order: [] }, c, side)
/** The neighbours whose lanes point into cell c's sides across its main lane: its side joins. */
function joiners(d: Draft, c: number): number[] {
  const b = at(d, c)!
  return DIRS.filter((side) => side !== b.in && side !== b.out).flatMap((side) => {
    const n = stepCell(c, side)
    const nb = n < 0 ? null : at(d, n)
    return nb !== null && lanesOf(nb).some((l) => l.out === opposite(side)) ? [n] : []
  })
}

/**
 * Settles the forks next to what the draft changed: a fork whose side no longer starts a belt
 * (its branch was rolled up, covered or turned round) or whose way on would land as a side
 * join becomes a plain straight belt, so a turned-round branch joins the belt it came from.
 */
function settle(d: Draft): void {
  const near = new Set<number>()
  for (const c of d.order) {
    near.add(c)
    for (const side of DIRS) if (stepCell(c, side) >= 0) near.add(stepCell(c, side))
  }
  for (const c of near) {
    const b = at(d, c)
    if (b === null || b.fork < 0) continue
    const m = stepCell(c, b.fork as Dir)
    const mb = m < 0 ? null : at(d, m)
    const n = stepCell(c, b.out as Dir)
    const nb = n < 0 ? null : at(d, n)
    const intoJoin = plainStraight(nb) && nb!.in !== opposite(b.out as Dir) && nb!.out !== opposite(b.out as Dir)
    if (mb === null || mb.in !== opposite(b.fork as Dir) || intoJoin) put(d, c, { ...b, fork: -1 })
  }
}

/** Every fork on the board settled as a plan settles the ones it touches: the save does this to the belts it reads (progress.ts), so a loaded layout holds no fork a stroke could not leave. */
export function settleForks(s: State): void {
  const d: Draft = { s, view: new Map(), order: [] }
  for (let c = 0; c < CELLS; c++) if (s.belts.fork[c]! >= 0) d.order.push(c)
  settle(d)
  for (const [c, b] of d.view) s.belts.fork[c] = b!.fork
}

/** The edit a draft makes: every cell it really changed, with the hedges it takes or plants and the buildings it adds or removes; null when it changes nothing. */
function editOf(d: Draft, hedges: Edit['hedges'], added: Edit['added'], removed: Edit['removed']): Edit | null {
  const belts = d.order.filter((c) => !sameBelt(cellBelt(d.s, c), at(d, c))).map((c) => ({ cell: c, before: cellBelt(d.s, c), after: at(d, c) }))
  return belts.length + hedges.length + added.length + removed.length === 0 ? null : { belts, removed, added, hedges }
}

/** The finger's cells as one path: repeats dropped, and a step back onto the cell before rolls the last cell up (`curl` when the last step did). */
function fingerPath(cells: readonly number[]): { path: number[]; curl: boolean } {
  const path: number[] = []
  let curl = false
  for (const c of cells) {
    if (path[path.length - 1] === c) continue
    if (path.length >= 2 && path[path.length - 2] === c) {
      path.pop()
      curl = true
      continue
    }
    if (path.length > 0) dirTo(path[path.length - 1]!, c)
    path.push(c)
    curl = false
  }
  return { path, curl }
}

/** Two ends of strokes are the same end: the same cell, or cells of one building's footprint. */
const sameEnd = (s: State, a: number, b: number) => a === b || (footAt(s, a) >= 0 && footAt(s, a) === footAt(s, b))

/**
 * Her finger's path is a wobbly trace of the hint's dotted path: it starts and ends where the
 * path does, and of her cells outside the footprints at its two ends (where her belt would
 * lie) at least two thirds are the path's. A different way between the same two buildings (a
 * row kept free, the other side of a tree) is hers, and lays as she drew it.
 */
function traces(s: State, path: readonly number[], hint: readonly number[]): boolean {
  const first = hint[0]!
  const last = hint[hint.length - 1]!
  if (!sameEnd(s, path[0]!, first) || !sameEnd(s, path[path.length - 1]!, last)) return false
  const ends = [footAt(s, first), footAt(s, last)].filter((id) => id >= 0)
  const way = path.filter((c) => !ends.includes(footAt(s, c)))
  return 3 * way.filter((c) => hint.includes(c)).length >= 2 * way.length
}

/** Everything that could ride a belt cell: what is on it and upstream of it now, and what the buildings feeding it give. */
function rides(s: State, c: number): Set<Thing> {
  const out = new Set<Thing>()
  const spoutOf = new Map<number, Building>()
  for (const b of s.buildings) for (const x of s.net.spouts.get(b.id)!) spoutOf.set(x, b)
  const seen = new Set<number>()
  for (const todo = [inSlot(c), outSlot(c)]; todo.length > 0; ) {
    const x = todo.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    if (s.belts.slot[x]! >= 0) out.add(THINGS[s.belts.slot[x]!]!)
    for (const t of spoutOf.has(x) ? gives(spoutOf.get(x)!) : []) out.add(t)
    for (let k = 0; k < PRED; k++) if (s.net.preds[PRED * x + k]! >= 0) todo.push(s.net.preds[PRED * x + k]!)
  }
  return out
}

// ---------------------------------------------------------------------------------------
// The stroke table

/** The plan for a belt stroke over the finger's cells (in order, neighbours, as the pointer router sends them); `hintPath` is the hint's dotted path, or null. */
export function planStroke(s: State, cells: readonly number[], hintPath: readonly number[] | null): StrokePlan {
  const finger = fingerPath(cells)
  let p = finger.path
  if (hintPath !== null && p.length >= 2 && hintPath.length >= 2 && traces(s, p, hintPath)) p = [...hintPath]
  // A stroke begun on water, a tree, a burrow or closed land starts where the finger first finds room.
  while (p.length > 0 && blocked(s, p[0]!)) p = p.slice(1)
  let stopped = p.length > STROKE_MAX
  p = p.slice(0, STROKE_MAX)
  if (p.length < 2) return { cells: [], sign: finger.curl ? 'curl' : 'none', flipped: false, edit: null }

  const d: Draft = { s, view: new Map(), order: [] }
  const net = s.net
  const fresh = (c: number) => d.view.get(c) != null && cellBelt(s, c) === null
  const layable = (c: number) => !blocked(s, c) && s.owner[c]! < 0 && at(d, c) === null
  const laneOut = (pc: Piece) => (pc.over ? at(d, pc.c)!.over : at(d, pc.c)!.out) as Dir
  const pieceIn = (pc: Piece) => (pc.over ? overIn(pc.c) : inSlot(pc.c))
  /** The slot feeding a lane, in the graph as it stands. */
  const feeder = (pc: Piece) => net.preds[PRED * pieceIn(pc)]!
  const pieceOf = (x: number): Piece => ({ c: slotCell(x), over: x >= OVER })
  const lay = (c: number, inSide: Dir, outSide: Dir) => put(d, c, { in: inSide, out: outSide, fork: -1, over: -1, pattern: s.pattern })
  /** The lanes of the belt being laid, in riding order from where laying began: the last one is the stroke's end. */
  const chain: Piece[] = []
  let bridged = false
  let forked = false
  let repointed = false
  /** The first new cell, when the stroke began a new belt (from the ground or out of a building). */
  let head = -1

  /** Points a lane's way out at `side`: a new cell always (its way was a guess); an existing belt only as it carries on from its dead end: a plain cell, its side joins kept, never into a belt's head. A bridge's lane never turns. */
  const aim = (pc: Piece, side: Dir): boolean => {
    const b = at(d, pc.c)!
    if (laneOut(pc) === side) return true
    if (pc.over || b.in === side) return false
    if (!fresh(pc.c) && (b.fork >= 0 || b.over >= 0 || facesHead(d, pc.c, side) || (side !== opposite(b.in as Dir) && joiners(d, pc.c).length > 0))) return false
    put(d, pc.c, { ...b, out: side })
    return true
  }
  /** Can belt cell c fork toward `side`: a plain straight cell with no sticker on it and no side joins (but the one from cell `except`, whose join the flip turns into this fork), two or more cells from its end. */
  const canFork = (c: number, side: Dir, except: number): boolean => {
    const b = at(d, c)
    if (b === null || !plainStraight(b) || s.owner[c]! >= 0 || side === b.in || side === b.out || joiners(d, c).some((n) => n !== except)) return false
    for (let k = 0, x = outSlot(c); k < 2; k++) {
      const y = net.next[x]!
      if (y < 0 || y % 2 === 1) return false
      x = y + 1
    }
    return true
  }

  /** Lays on from lane `start` over p[i0..], each cell it reaches deciding what happens there. */
  const forward = (i0: number, start: Piece) => {
    let pc = start
    chain.push(pc)
    for (let i = i0; i < p.length; i++) {
      const c = p[i]!
      const side = dirTo(p[i - 1]!, c)
      const back = opposite(side)
      const b = at(d, c)
      const stop = () => {
        if (fresh(pc.c)) aim(pc, side)
        stopped = true
      }
      if (blocked(s, c)) return stop()
      if (footAt(s, c) >= 0) return void (aim(pc, side) || stop())
      if (d.view.has(c)) {
        // Its own new belt: back into its first cell closes a loop.
        if (c !== head || at(d, head)!.out === back || !aim(pc, side)) return stop()
        return put(d, head, { ...at(d, head)!, in: back })
      }
      if (b !== null) {
        const lanes = lanesOf(b)
        // Onto a belt's tail along its line it feeds that belt and ends; onto its head, or a bend's or a fork's or a bridge's side, it stops.
        if (lanes.some((l) => l.in === back)) return void (aim(pc, side) || stop())
        if (lanes.some((l) => l.out === back) || !plainStraight(b)) return stop()
        const ahead = i + 1 < p.length ? p[i + 1]! : -1
        const across = ahead >= 0 && dirTo(c, ahead) === side
        if (!across || (i + 2 === p.length && layable(ahead)) || blocked(s, ahead) || s.owner[c]! >= 0 || joiners(d, c).some((n) => n !== pc.c)) {
          // Ending on a plain straight belt's side, one cell past it, or turning on it: a join, never from a fork's way on.
          const fromFork = !fresh(pc.c) && !pc.over && at(d, pc.c)!.fork >= 0
          return void (fromFork || !aim(pc, side) ? stop() : undefined)
        }
        if (!aim(pc, side)) return stop()
        put(d, c, { ...b, over: side })
        bridged = true
        pc = { c, over: true }
        chain.push(pc)
        continue
      }
      if (!aim(pc, side)) return stop()
      lay(c, back, side)
      pc = { c, over: false }
      chain.push(pc)
    }
    // One cell short of a building's edge, pointing at it: step into the mouth.
    const g = stepCell(pc.c, laneOut(pc))
    if (!stopped && fresh(pc.c) && d.order.length < STROKE_MAX && g >= 0 && layable(g) && stepCell(g, laneOut(pc)) >= 0 && footAt(s, stepCell(g, laneOut(pc))) >= 0) {
      lay(g, opposite(laneOut(pc)), laneOut(pc))
      chain.push({ c: g, over: false })
    }
  }

  /** Rides lane `start` along its way over p[i0..]; past its dead end the stroke carries on. */
  const follow = (i0: number, start: Piece) => {
    let pc = start
    for (let i = i0; i < p.length; i++) {
      const y = net.next[pieceIn(pc) + 1]!
      const side = dirTo(p[i - 1]!, p[i]!)
      if (side === laneOut(pc) && y >= 0 && y % 2 === 0 && slotCell(y) === p[i]) {
        pc = pieceOf(y)
        continue
      }
      if (y === -1) return forward(i, pc)
      if (side !== laneOut(pc)) stopped = true
      return
    }
  }

  /** Extends the belt whose first cell is p[0] upstream along p[1..], each new cell pointing into the one before; returns the sign at its new start. */
  const extend = (): EndSign => {
    let prev = p[0]!
    for (let i = 1; i < p.length; i++) {
      const c = p[i]!
      const side = dirTo(p[i - 1]!, c)
      const back = opposite(side)
      const b = at(d, c)
      // The belt's own first cell already faces the way (turned before, if the stroke left it to the side); each new cell turns to face the next.
      const into = () => {
        if (prev !== p[0]) put(d, prev, { ...at(d, prev)!, in: side })
      }
      if (blocked(s, c) || d.view.has(c)) {
        stopped = true
        return 'stop'
      }
      if (footAt(s, c) >= 0) {
        into()
        return 'mouth'
      }
      if (b !== null) {
        // A dead end pointing at it now feeds it; a plain straight belt beside it forks into it.
        const lane = lanesOf(b).find((l) => l.out === back)
        if (lane !== undefined && net.next[lane.over ? overIn(c) + 1 : outSlot(c)] === -1) {
          into()
          return 'feed'
        }
        if (canFork(c, back, -1)) {
          into()
          put(d, c, { ...b, fork: back })
          forked = true
          return 'split'
        }
        stopped = true
        return 'stop'
      }
      into()
      lay(c, side, back)
      prev = c
    }
    return 'none'
  }

  /** Turns lane `start` round against its way, along the stroke while it follows the belt upstream and then on to the belt's far end, so no head-on pair is left behind; past that end the stroke carries on. */
  const repoint = (start: Piece) => {
    repointed = true
    const done = new Set<string>()
    const turn = (pc: Piece) => {
      const b = at(d, pc.c)!
      put(d, pc.c, pc.over ? { ...b, over: opposite(b.over as Dir) } : { ...b, in: b.out, out: b.in })
      done.add(`${pc.c}:${pc.over}`)
    }
    // The lane upstream, unless that is a fork's side (the fork then settles into a join) or a lane already turned (a loop).
    const upstream = (pc: Piece): Piece | null => {
      const f = feeder(pc)
      return f < 0 || net.next2[f] === pieceIn(pc) || done.has(`${slotCell(f)}:${f >= OVER}`) ? null : pieceOf(f)
    }
    let pc = start
    turn(pc)
    let i = 1
    for (let up = upstream(pc); i < p.length && up !== null && up.c === p[i]; up = upstream(pc), i++) {
      pc = up
      turn(pc)
    }
    const farEnd = feeder(pc) < 0
    for (let up = upstream(pc); up !== null; up = upstream(pc)) {
      pc = up
      turn(pc)
    }
    if (i < p.length && farEnd) return forward(i, pc)
    if (i < p.length) stopped = true
    chain.push(pc)
  }

  // Where the stroke starts decides what it does.
  const c0 = p[0]!
  const d0 = dirTo(c0, p[1]!)
  const b0 = at(d, c0)
  let fixed: EndSign | null = null
  const f0 = footAt(s, c0)
  if (f0 >= 0) {
    // Out of a building: the first cell past its footprint starts a belt, rides one that already leads out, or bridges one running past.
    let i = 1
    while (i < p.length && footAt(s, p[i]!) === f0) i++
    const c = i < p.length ? p[i]! : -1
    const back = c >= 0 ? opposite(dirTo(p[i - 1]!, c)) : d0
    const lane = c >= 0 && at(d, c) !== null ? lanesOf(at(d, c)!).find((l) => l.in === back) : undefined
    const b = c >= 0 ? at(d, c) : null
    const ahead = i + 1 < p.length ? p[i + 1]! : -1
    if (c >= 0 && layable(c)) {
      lay(c, back, opposite(back))
      head = c
      forward(i + 1, { c, over: false })
    } else if (lane !== undefined) follow(i + 1, { c, over: lane.over })
    else if (b !== null && plainStraight(b) && b.in !== back && b.out !== back && s.owner[c]! < 0 && joiners(d, c).length === 0 && ahead >= 0 && dirTo(c, ahead) === opposite(back) && !blocked(s, ahead) && !(i + 2 === p.length && layable(ahead))) {
      // A plain straight belt running past the building's side: the stroke bridges it straight out, as it bridges one further on (ending one cell past it would be a join there, so it stops).
      put(d, c, { ...b, over: opposite(back) })
      bridged = true
      forward(i + 1, { c, over: true })
    } else fixed = 'stop'
  } else if (b0 !== null) {
    const lane = lanesOf(b0).find((l) => l.in === d0 || l.out === d0) ?? lanesOf(b0)[0]!
    const start: Piece = { c: c0, over: lane.over }
    const inN = stepCell(c0, b0.in as Dir)
    if (d0 === lane.out) follow(1, start)
    else if (d0 === lane.in) {
      // Against its way: turn it round. Behind its first cell: extend it upstream.
      if (feeder(start) >= 0 || footAt(s, p[1]!) >= 0) repoint(start)
      else fixed = extend()
    } else {
      const y = net.next[outSlot(c0)]!
      const deadEnd = y === -1 || (y >= 0 && y % 2 === 0 && net.next[y + 1] === -1)
      const first = feeder(start) < 0 && (inN < 0 || footAt(s, inN) < 0)
      const tail = at(d, p[1]!)
      if (deadEnd) {
        forward(1, start)
        // Turned on the second-to-last cell, the old last cell is left with nothing feeding it: it rolls up in the same edit (its things go where they are wanted), unless the stroke runs over it or into it, a sticker holds it down or a side join still feeds it. Under a bridge only its own lane goes.
        const n = y >= 0 && y < OVER ? slotCell(y) : -1
        const nb = n >= 0 ? at(d, n)! : null
        const into = (c: number) => at(d, c) !== null && lanesOf(at(d, c)!).some((l) => stepCell(c, l.out as Dir) === n)
        if (nb !== null && at(d, c0)!.out !== b0.out && !d.view.has(n) && !d.order.some(into) && s.owner[n]! < 0 && nb.fork < 0 && net.preds[PRED * outSlot(n) + 1]! < 0)
          put(d, n, nb.over >= 0 ? { in: opposite(nb.over as Dir), out: nb.over, fork: -1, over: -1, pattern: nb.pattern } : null)
      } else if (first && b0.fork < 0 && b0.over < 0 && joiners(d, c0).length === 0) {
        put(d, c0, { ...b0, in: d0 })
        fixed = extend()
      } else if (canFork(c0, d0, -1) && layable(p[1]!)) {
        put(d, c0, { ...b0, fork: d0 })
        forked = true
        lay(p[1]!, opposite(d0), d0)
        forward(2, { c: p[1]!, over: false })
      } else if (canFork(c0, d0, -1) && tail !== null && tail.in === opposite(d0) && feeder({ c: p[1]!, over: false }) < 0) {
        put(d, c0, { ...b0, fork: d0 })
        forked = true
        fixed = 'split'
      } else fixed = 'stop'
    }
  } else {
    lay(c0, opposite(d0), d0)
    head = c0
    forward(1, { c: c0, over: false })
  }
  if (fixed === 'stop') stopped = true

  // No head-on pair: a new last cell facing a belt's head goes, and a bridge into one comes off (the lane before it then joins that belt).
  for (let last = chain[chain.length - 1]; last !== undefined && facesHead(d, last.c, laneOut(last)); last = chain[chain.length - 1]) {
    if (fresh(last.c)) {
      d.view.delete(last.c)
      d.order.splice(d.order.indexOf(last.c), 1)
    } else if (last.over && cellBelt(s, last.c)!.over < 0) put(d, last.c, cellBelt(s, last.c))
    else break
    chain.pop()
    stopped = true
  }

  // The end sign, read off the layout the plan leaves.
  const last = chain[chain.length - 1]
  let end: EndSign = fixed ?? (stopped ? 'stop' : 'none')
  let endCell = -1
  if (fixed === null && last !== undefined) {
    endCell = stepCell(last.c, laneOut(last))
    const nb = endCell < 0 ? null : at(d, endCell)
    const back = opposite(laneOut(last))
    if (endCell >= 0 && footAt(s, endCell) >= 0) end = 'mouth'
    else if (nb !== null && lanesOf(nb).some((l) => l.in === back)) end = 'feed'
    else if (nb !== null && plainStraight(nb) && nb.out !== back) end = 'zip'
  }

  // The helpful flip, for a new belt between two buildings or between a belt's side and a building.
  let flipped = false
  // The cells the stroke laid: new ones, and the over lanes it bridged (a dead end's old last cell it rolled up has no belt left).
  const laid = d.order.filter((c) => fresh(c) || (cellBelt(s, c) !== null && cellBelt(s, c)!.over < 0 && at(d, c) !== null && at(d, c)!.over >= 0))
  if (!repointed && last !== undefined && laid.length > 0) {
    const inHead = head >= 0 ? stepCell(head, at(d, head)!.in as Dir) : -1
    const from = inHead >= 0 ? footAt(s, inHead) : -1
    const to = end === 'mouth' ? footAt(s, endCell) : -1
    const joins = end === 'zip' && fresh(last.c) ? endCell : -1
    const joinSide = opposite(laneOut(last))
    const usedBy = (things: Iterable<Thing>, id: number) => [...things].some((t) => everWants(building(s, id).kind, t))
    const turn =
      from >= 0 && to >= 0
        ? !usedBy(gives(building(s, from)), to) && usedBy(gives(building(s, to)), from)
        : forked && to >= 0
          ? !usedBy(rides(s, c0), to) && gives(building(s, to)).length > 0
          : from >= 0 && joins >= 0 && gives(building(s, from)).length === 0 && usedBy(rides(s, joins), from) && canFork(joins, joinSide, last.c)
    if (turn) {
      for (const c of laid) {
        const b = at(d, c)!
        put(d, c, fresh(c) ? { ...b, in: b.out, out: b.in } : { ...b, over: opposite(b.over as Dir) })
      }
      if (forked && to >= 0) {
        put(d, c0, { ...at(d, c0)!, fork: -1 })
        end = 'zip'
      } else if (joins >= 0) {
        put(d, joins, { ...at(d, joins)!, fork: joinSide })
        end = 'split'
      } else end = 'mouth'
      flipped = true
    }
  }

  settle(d)
  const hedges = d.order.filter((c) => fresh(c) && s.hedge[c] !== 0).map((c) => ({ cell: c, before: s.hedge[c]!, after: 0 }))
  const edit = editOf(d, hedges, [], [])
  const sign: EndSign = finger.curl ? 'curl' : edit === null ? (stopped ? 'stop' : 'none') : end !== 'none' ? end : bridged ? 'hump' : forked ? 'split' : 'none'
  return { cells: d.order.filter((c) => !sameBelt(cellBelt(s, c), at(d, c))), sign, flipped, edit }
}

// ---------------------------------------------------------------------------------------
// Hedges, the peel, stickers

/**
 * A hedge line along the finger's cells while hedge stickers last: belt cells, the cells round
 * the pad and cells already hedged are skipped (a gap in the line), and the line stops at a
 * building, water, a tree, a burrow, the basket or closed land. A hedge may stand on rocks, as
 * a belt may: a digger placed there later takes it back into the tray, so a patch stays free
 * for one, and a fence can close a burrow's ring where its flowers grow on rocks.
 */
export function planHedge(s: State, cells: readonly number[]): { cells: number[]; edit: Edit | null } {
  let left = stickersLeft(s, 'hedge')
  const planted: number[] = []
  for (const c of fingerPath(cells).path.slice(0, STROKE_MAX)) {
    if (s.owner[c]! >= 0 || blocked(s, c)) break
    if (s.belts.out[c]! >= 0 || s.hedge[c] !== 0 || PAD_RING.has(c)) continue
    if (left <= 0) break
    planted.push(c)
    left--
  }
  return { cells: planted, edit: planted.length === 0 ? null : { belts: [], removed: [], added: [], hedges: planted.map((c) => ({ cell: c, before: 0, after: 1 })) } }
}

/**
 * What a peel drag over these cells rolls up: every belt and hedge (or stump) it passes, but
 * not the belt under a tower or a bowl (the sticker holds it down: peel the sticker first).
 * On a bridge it takes the lane it runs along, the hump on top when it only taps the cell.
 */
export function planPeelDrag(s: State, cells: readonly number[]): { cells: number[]; edit: Edit | null } {
  const path = fingerPath(cells).path
  const d: Draft = { s, view: new Map(), order: [] }
  const hedges: Edit['hedges'] = []
  path.forEach((c, i) => {
    const b = cellBelt(s, c)
    if (s.hedge[c] !== 0) hedges.push({ cell: c, before: s.hedge[c]!, after: 0 })
    if (b === null || s.owner[c]! >= 0) return
    if (b.over < 0) return put(d, c, null)
    const ways = [i > 0 ? dirTo(path[i - 1]!, c) : -1, i + 1 < path.length ? dirTo(c, path[i + 1]!) : -1].filter((w) => w >= 0)
    const alongMain = ways.length > 0 && ways.every((w) => w === b.in || w === b.out)
    put(d, c, alongMain ? { ...b, in: opposite(b.over as Dir), out: b.over, over: -1 } : { ...b, over: -1 })
  })
  settle(d)
  return { cells: [...d.order.filter((c) => !sameBelt(cellBelt(s, c), at(d, c))), ...hedges.map((h) => h.cell)], edit: editOf(d, hedges, [], []) }
}

/** The peel's first tap on a belt: its run up to the next fork, join or building (belts.ts runOf), and what a second tap would roll up. */
export function planRun(s: State, cell: number): { cells: number[]; edit: Edit | null } {
  const cells = runOf(s, cell)
  return { cells, edit: planPeelDrag(s, cells).edit }
}

/** The peel's tap on a building: it comes off the board with everything inside (applyEdit hands its things back). The pad never comes off. */
export function planPeelBuilding(s: State, id: number): Edit {
  const b = building(s, id)
  if (b.kind === 'pad') throw new Error('the pad never comes off')
  return { belts: [], removed: [{ id, kind: b.kind, x: b.x, y: b.y }], added: [], hedges: [] }
}

/** Why sticker `sticker` cannot stand with its footprint's top-left at (x, y), or null when it can. */
function greyAt(s: State, sticker: Placeable, x: number, y: number): Grey | null {
  if (stickersLeft(s, sticker) <= 0) return 'empty'
  const k = SIZE[sticker]
  const cells: number[] = []
  for (let dy = 0; dy < k; dy++)
    for (let dx = 0; dx < k; dx++) {
      if (!onBoard(x + dx, y + dy) || !cellInLand(s.land, cellOf(x + dx, y + dy))) return 'land'
      cells.push(cellOf(x + dx, y + dy))
    }
  for (const c of cells) {
    const g = GROUND[c]
    if (g === 'pond' && sticker !== 'pump') return 'water'
    if (g === 'tree') return 'tree'
    if (g === 'burrow') return 'burrow'
    if (c === cellOf(BASKET.x, BASKET.y)) return 'basket'
    if (g === 'pad' || PAD_RING.has(c)) return 'pad'
    if (s.owner[c]! >= 0) return 'building'
    if (sticker !== 'digger' && rockOf(c) !== null) return 'rock'
  }
  if (sticker === 'digger' && !(['blueRock', 'goldRock'] as const).some((rock) => cells.filter((c) => rockOf(c) === rock).length >= 2)) return 'noRock'
  if (sticker === 'pump' && cells.some((c) => GROUND[c] !== 'pond')) return 'noPond'
  if (sticker === 'tower' || sticker === 'bowl') {
    const b = cellBelt(s, cells[0]!)
    if (b === null || b.fork >= 0 || b.over >= 0) return 'noBelt'
    if (sticker === 'bowl' && FLOWER_OF[cells[0]!]! < 0) return 'noFlowers'
  }
  return null
}

/**
 * A sticker's ghost held at the finger's board point (x, y): snapped to the nearest spot it
 * can stand on within 0.6 cell of the finger (the hint's spot `prefer` first), else grey at
 * the spot under the finger with the reason. A machine covers the belts and hedges under its
 * footprint, which go back; a tower or a bowl stands on its belt cell and the belt runs on
 * under it. A muncher under the ghost never greys it: it hops aside when the sticker lands.
 */
export function planPlace(s: State, sticker: Placeable, x: number, y: number, prefer: { x: number; y: number } | null): PlacePlan {
  const k = SIZE[sticker]
  const near = (sx: number, sy: number) => (sx + k / 2 - x) * (sx + k / 2 - x) + (sy + k / 2 - y) * (sy + k / 2 - y)
  const under = { x: Math.round(x - k / 2), y: Math.round(y - k / 2) }
  const spots = [under]
  for (let sy = Math.floor(y - k / 2); sy <= Math.ceil(y - k / 2); sy++) for (let sx = Math.floor(x - k / 2); sx <= Math.ceil(x - k / 2); sx++) if (near(sx, sy) <= 0.36 && (sx !== under.x || sy !== under.y)) spots.push({ x: sx, y: sy })
  spots.sort((a, b) => near(a.x, a.y) - near(b.x, b.y) || a.y - b.y || a.x - b.x)
  if (prefer !== null && spots.some((p) => p.x === prefer.x && p.y === prefer.y)) spots.unshift(prefer)
  const spot = spots.find((p) => greyAt(s, sticker, p.x, p.y) === null)
  if (spot === undefined) return { x: under.x, y: under.y, ok: false, reason: greyAt(s, sticker, under.x, under.y), covers: [], hedges: [], edit: null }
  const d: Draft = { s, view: new Map(), order: [] }
  const hedges: Edit['hedges'] = []
  if (k > 1)
    for (let dy = 0; dy < k; dy++)
      for (let dx = 0; dx < k; dx++) {
        const c = cellOf(spot.x + dx, spot.y + dy)
        if (s.belts.out[c]! >= 0) put(d, c, null)
        if (s.hedge[c] !== 0) hedges.push({ cell: c, before: s.hedge[c]!, after: 0 })
      }
  const covers = [...d.order]
  settle(d)
  return { x: spot.x, y: spot.y, ok: true, reason: null, covers, hedges: hedges.map((h) => h.cell), edit: editOf(d, hedges, [{ id: s.nextId, kind: sticker, x: spot.x, y: spot.y }], []) }
}

// ---------------------------------------------------------------------------------------
// Committing

/**
 * Commits an edit: buildings removed (their things handed back), belt cells changed, hedges
 * planted or taken, buildings added, and the derived layout rebuilt. Things on a lane that
 * stays keep their places (a turned-round lane swaps its two slots, so each thing stays where
 * it was drawn); things on a lane that goes hop into a building dropped on their belt if it
 * wants them, else onto the belt going on out of it, else they are handed back. Returns the
 * inverse, for Oops, and what was handed back, for the rules to send where it is wanted.
 */
export function applyEdit(s: State, edit: Edit): { inverse: Edit; displaced: Displaced[] } {
  const displaced: Displaced[] = []
  const belts = s.belts
  for (const r of edit.removed) {
    const b = building(s, r.id)
    const mid = { x: b.x + SIZE[b.kind] / 2, y: b.y + SIZE[b.kind] / 2 }
    const inside: Thing[] = [...b.queue, ...b.stack, ...(b.batch === null ? [] : [b.batch.makes])]
    b.held.forEach((n, i) => inside.push(...Array.from({ length: n }, () => THINGS[i]!)))
    for (const thing of inside) displaced.push({ thing, ...mid })
    s.buildings.splice(s.buildings.indexOf(b), 1)
  }
  const loose: (Displaced & { cell: number })[] = []
  for (const ch of edit.belts) {
    const c = ch.cell
    if (!sameBelt(cellBelt(s, c), ch.before)) throw new Error(`cell ${c} is not as the edit expects`)
    // Each lane's things, matched to a lane of the cell as it will be: the same lane, the same lane turned round, or the same lane with one end moved.
    const was = ch.before === null ? [] : lanesOf(ch.before)
    const will = ch.after === null ? [] : lanesOf(ch.after)
    const slotsOf = (over: boolean) => (over ? [overIn(c), overIn(c) + 1] : [inSlot(c), outSlot(c)])
    const kept: { slot: number; v: number }[] = []
    const used = new Set<number>()
    for (const l of was) {
      const old = slotsOf(l.over)
      const things = old.map((x) => belts.slot[x]!)
      if (things.every((v) => v < 0)) continue
      const match = [(m: (typeof will)[number]) => m.in === l.in && m.out === l.out, (m: (typeof will)[number]) => m.in === l.out && m.out === l.in, (m: (typeof will)[number]) => m.over === l.over && (m.in === l.in || m.out === l.out)]
        .map((test) => will.findIndex((m, j) => !used.has(j) && test(m)))
        .map((j, rank) => ({ j, rank }))
        .find((m) => m.j >= 0)
      if (match === undefined) {
        old.forEach((x, i) => {
          if (things[i]! >= 0) loose.push({ thing: THINGS[things[i]!]!, ...slotPoint(belts, x), cell: c })
        })
        continue
      }
      used.add(match.j)
      const now = slotsOf(will[match.j]!.over)
      const order = match.rank === 1 ? [1, 0] : [0, 1]
      order.forEach((from, i) => kept.push({ slot: now[i]!, v: things[from]! }))
    }
    for (const x of [...slotsOf(false), ...slotsOf(true)]) {
      belts.slot[x] = -1
      belts.from[x] = -1
    }
    for (const k of kept) belts.slot[k.slot] = k.v
    const a = ch.after
    belts.in[c] = a === null ? -1 : a.in
    belts.out[c] = a === null ? -1 : a.out
    belts.fork[c] = a === null ? -1 : a.fork
    belts.over[c] = a === null ? -1 : a.over
    belts.pattern[c] = a === null ? 0 : a.pattern
    belts.blockedSince[c] = -1
    belts.blockedSince[CELLS + c] = -1
    if (a === null || ch.before === null) {
      belts.joinTurn[c] = 0
      belts.forkTurn[c] = 0
      belts.moved[c] = 0
    }
    belts.laidAt[c] = a === null ? -1 : ch.before === null ? s.tick : belts.laidAt[c]!
    const turned = a !== null && ch.before !== null && (a.in !== ch.before.in || a.out !== ch.before.out || a.over !== ch.before.over)
    belts.turnedAt[c] = a === null || ch.before === null ? -1 : turned ? s.tick : belts.turnedAt[c]!
  }
  for (const h of edit.hedges) {
    s.hedge[h.cell] = h.after
    s.stumpAt[h.cell] = -1
  }
  for (const a of edit.added) {
    s.buildings.push(newBuilding(a.id, a.kind, a.x, a.y, s.tick))
    s.nextId = Math.max(s.nextId, a.id + 1)
  }
  rebuild(s)
  // Things off a covered belt go into the building dropped on it if it wants them, else onto the belt going on out of it.
  for (const t of loose) {
    const id = s.owner[t.cell]!
    const b = id >= 0 && edit.added.some((a) => a.id === id) ? building(s, id) : null
    if (b !== null && wants(s, b, t.thing)) {
      take(s, b, t.thing)
      continue
    }
    const free = b === null ? undefined : s.net.spouts.get(b.id)!.flatMap((x) => [x, x + 1]).find((x) => belts.slot[x]! < 0)
    if (free !== undefined) belts.slot[free] = thingIndex(t.thing)
    else displaced.push({ thing: t.thing, x: t.x, y: t.y })
  }
  const inverse: Edit = {
    belts: [...edit.belts].reverse().map((b) => ({ cell: b.cell, before: b.after, after: b.before })),
    removed: edit.added,
    added: edit.removed,
    hedges: [...edit.hedges].reverse().map((h) => ({ cell: h.cell, before: h.after, after: h.before })),
  }
  return { inverse, displaced }
}

/**
 * Everything wrong with the layout, as short notes (none for a good one): cells that are not
 * a belt as the engine reads them, a belt where none can be, a head-on pair, a slot with more
 * than PRED feeders, a fork into a join, a tower or bowl off a plain or bending belt, a hedge
 * on a belt or under a building, things on a lane that is not there, and a slot graph or
 * owners that disagree with the cells.
 */
export function lintNet(s: State): string[] {
  const bad: string[] = []
  const b = s.belts
  const owner = owners(s)
  for (let c = 0; c < owner.length; c++) {
    const where = `${c % 20},${Math.floor(c / 20)}`
    const cb = cellBelt(s, c)
    if (cb === null) {
      if (b.in[c] !== -1 || b.fork[c] !== -1 || b.over[c] !== -1) bad.push(`cell ${where} has sides but no belt`)
      for (const x of [inSlot(c), outSlot(c), overIn(c), overIn(c) + 1]) if (b.slot[x]! >= 0) bad.push(`a thing on ${where} with no belt`)
    } else {
      if (cb.in < 0 || cb.in > 3 || cb.out > 3 || cb.in === cb.out) bad.push(`cell ${where} runs from ${cb.in} to ${cb.out}`)
      if ((cb.fork >= 0 || cb.over >= 0) && !plainStraight({ ...cb, fork: -1, over: -1 })) bad.push(`a fork or bridge on a bend at ${where}`)
      if (cb.fork >= 0 && cb.over >= 0) bad.push(`a fork on a bridge at ${where}`)
      for (const side of [cb.fork, cb.over]) if (side >= 0 && (side === cb.in || side === cb.out)) bad.push(`a fork or bridge along its own lane at ${where}`)
      if (cb.over < 0) for (const x of [overIn(c), overIn(c) + 1]) if (b.slot[x]! >= 0) bad.push(`a thing on the missing over lane of ${where}`)
      if (blocked(s, c) && cellInLand(s.land, c)) bad.push(`a belt on ${GROUND[c]} at ${where}`)
      if (owner[c]! >= 0 && hasMouths(building(s, owner[c]!))) bad.push(`a belt under building ${owner[c]} at ${where}`)
      for (const l of lanesOf(cb)) if (headOn(s, c, l.out as Dir)) bad.push(`a head-on pair at ${where}`)
      if (cb.fork >= 0) {
        for (const side of [cb.out, cb.fork]) {
          const n = stepCell(c, side as Dir)
          const nb = n < 0 ? null : cellBelt(s, n)
          if (plainStraight(nb) && nb!.in !== opposite(side as Dir) && nb!.out !== opposite(side as Dir)) bad.push(`a fork into a join at ${where}`)
        }
      }
    }
    if (s.hedge[c] !== 0 && (cb !== null || owner[c]! >= 0)) bad.push(`a hedge on a belt or under a building at ${where}`)
  }
  for (const bd of s.buildings) {
    if (hasMouths(bd)) continue
    const cb = cellBelt(s, cellOf(bd.x, bd.y))
    if (cb === null || cb.fork >= 0 || cb.over >= 0) bad.push(`the ${bd.kind} ${bd.id} stands on no plain or bending belt`)
    else if (bd.kind === 'bowl' && FLOWER_OF[cellOf(bd.x, bd.y)]! < 0) bad.push(`the bowl ${bd.id} is off the flowers`)
  }
  const net = deriveNet(s)
  const feeders = new Int32Array(net.next.length)
  for (let x = 0; x < net.next.length; x++) {
    if (net.next[x] !== s.net.next[x] || net.next2[x] !== s.net.next2[x]) bad.push(`slot ${x} leads elsewhere than its cells say`)
    for (const y of [net.next[x]!, net.next2[x]!]) if (y >= 0 && ++feeders[y]! === PRED + 1) bad.push(`slot ${y} has more than ${PRED} feeders`)
  }
  if (net.preds.some((v, i) => v !== s.net.preds[i])) bad.push('the feeders disagree with the cells')
  for (const bd of s.buildings) if (JSON.stringify(net.mouths.get(bd.id)) !== JSON.stringify(s.net.mouths.get(bd.id)) || JSON.stringify(net.spouts.get(bd.id)) !== JSON.stringify(s.net.spouts.get(bd.id))) bad.push(`building ${bd.id}'s mouths or spouts disagree with the cells`)
  if (owner.some((v, i) => v !== s.owner[i])) bad.push('the owners disagree with the buildings')
  return bad
}
