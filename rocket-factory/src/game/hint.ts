import { working } from './band'
import { dugAt, whereFromStack, whereWanted } from './beep'
import { cellBelt, downstream, hasMouths } from './belts'
import { BASKET, BURROWS, FLOWER_OF, GROUND, LANDS, PAD, PAD_RING, START_OVEN, cellInLand, cellOf, dirTo, inLand, onBoard, rockOf, stepCell, xOf, yOf } from './board'
import {
  BAKES,
  BLOCKED_HINT,
  BOTTLENECK_WAIT,
  BUSY_SHARE,
  DEFEND_KEPT,
  HAND_AFTER,
  HAND_AGAIN,
  HAND_TRIES,
  HEAP_HINT,
  HELP_FULL,
  HINT_EVERY,
  HINT_HOLD,
  LAB_DRINK,
  OOPS_HAND,
  OOPS_HINT,
  PART_INFO,
  PLACEABLE,
  RECIPES,
  SIZE,
  STACK,
  STAGE_AT,
  STROKE_MAX,
  TOWER_REACH2,
  type Recipe,
} from './catalog'
import { blockers, type Blocker } from './jams'
import { choiceWaits, labNeed, nextCard, openParts } from './machines'
import { BOTTLES, CARDS, CELLS, DIRS, KINDS, OVER, PARTS, PRED, THINGS, inSlot, isBottle, isMaker, newBuilding, opposite, outSlot, overIn, overOut, sameTool, slotCell, ticks, type Action, type Building, type CellBelt, type Counts, type Dir, type Edit, type HintMemo, type HintPlan, type Hit, type Kind, type Maker, type Land, type Placeable, type Script, type State, type Step, type Thing, type Tool } from './model'
import { pawsOf } from './munchers'
import { cloneState, launchReady } from './rules'
import { applyEdit, planHedge, planPeelBuilding, planPeelDrag, planPlace, planStroke, stickersLeft, type EndSign } from './strokes'
import { building, everWants, gives, openPart, wants } from './trade'
import { basketPoint } from './where'

/**
 * The one next step (plans/rocket-factory.md, The one next step). nextSteps ranks what she
 * could do now, each step with the exact actions that do it: rules.act runs them for the
 * scripted children and the fuzz, and the hand mimes them. stepHint picks the one that
 * bounces, keeps it bouncing, times the hand and counts her own links. The ranks, the first
 * match first (the plan's nine, and five the board waits on, placed where it waits on them):
 *  - At Good night only the kind bouncing in its nightcap ('tuck'), and nothing during the
 *    launch: the board is not hers then.
 *  - A card that waits for her tap ('card'): it covers the board.
 *  - While the lab's one choice waits, only its card's two pictures ('choose'), after a card
 *    that waits: the choice card covers the board, and nothing bounces behind it.
 *  - The launch button once the rocket is ready ('launch'): the whole game waits on it, and
 *    every muncher is on its way home.
 *  1. A muncher sitting or napping that no tower with suds in it can reach, and the scout as
 *     it comes (the hand shows that tickle at once).
 *  2. Oops, for OOPS_HINT after an edit that stopped a working machine or cut the lab or the
 *     pad off from something that reached it (Undo.broke, from reachOf and brokeBetween), but
 *     never for an edit a repair of the hint's makes (asked).
 *  - The next land's flaps after a Land! card ('flap'): its stickers want the new room.
 *  3. A New! sticker (a kind she has never placed) on the blueprint's spot for it, or the
 *     repair that clears the spot (the way back to the blueprint, below), else on a good spot
 *     near what it will link to; with no good spot for any, the peel over the fewest loose belt
 *     cells that frees one, and last the peel over her belts on the blueprint's spot ('free').
 *  4. The bottleneck: one more of the slowest machine, or a second belt out of an oven with
 *     bars to spare before one more oven.
 *  5. A thing blocking a starved machine (the peel of the belt that brought it, for a link that
 *     joined the wrong line), or one standing at a mouth that takes it at other times, then a
 *     full stack with no way out whose things are wanted on its own line (where Beep's carry
 *     takes them) and that rule 6's next link would not empty.
 *  6. The first missing link toward the lab's bottles, then toward the rocket's open parts,
 *     or the sticker the chain needs there when no building has some to spare, or with no
 *     sticker either the patch (or the pond) Beep digs by hand ('dig'), which comes first while
 *     the start oven has never baked a bar; for a building that gets none, the way back to the
 *     blueprint before a belt over its spots and belts.
 *  7. An empty tower once a burrow's face leans out ('refill'), then once a burrow's munchers
 *     have come out, the blueprint's defence for it (a tower with its bubble belt, a hedge line
 *     that turns them past a tower or holds them at the door, a bowl with its gold belt), and
 *     after they got away with DEFEND_KEPT things, a tower or a hedge line on their paw prints.
 *  8. A heap of HEAP_HINT or more, then the basket holding something wanted.
 *  9. Else Beep points at the rocket's part that fills, with no hand (beep.ts restBeep).
 *
 * Where things go comes from the blueprint (BLUEPRINT): the whole factory of the path laid
 * out for the one board, each machine's spot and each belt's cells, so a child who follows
 * the hint builds every line the cards ask for and launches the rocket. A machine she put
 * elsewhere, or a belt of hers across a planned one, leaves the rest to the searches: the
 * chain (rules 3, 4 and 6) counts things per RATE_SPAN as the plan's ratios do (one digger
 * feeds one oven, one oven one workshop or two green bottle makers, the lab drinks four
 * bottles while a bottle maker makes one), a new link takes a building with some to spare
 * and with none to spare a sticker of its kind is placed first, on a good spot found over the
 * whole land, and its belts go round the blueprint's open spots and belts while they can.
 *
 * When her strokes and stickers stand in the blueprint's way and nothing else leads on, the
 * hint repairs, gentlest first (repairOf): Oops while her newest stroke is the stray; the peel
 * over just her loose belts, hedges and stumps on a spot or a planned belt; the peel of a
 * machine of hers standing there (back to the tray with what it held); a machine on a spot
 * whose belts lead out of the land brought to the spot the factory needs now; then the old
 * searches over the blueprint's cells (a belt across them crosses the planned belts of the
 * machines on their spots only straight over, so those can still bridge it); then a machine of
 * hers off the blueprint brought onto it; and last the peel of her links in the way. A repair never takes the blueprint's own
 * (standingOf), and is tried on a copy of the board first, so the next step builds on it and
 * none undoes the last (leadsOn): the factory the hint leads back to only grows.
 *
 * Every path, spot and peel the hint shows is checked against strokes.ts's own planners
 * before it is offered, so following the hint always does what it shows. Those searches
 * (rules 3, 6 and 7's defence) are kept in s.hintMemo while the board stays the same, so the
 * look twice a second costs little between her edits.
 */

/** One ranked step and the actions that do it. */
export type Ranked = { step: Step; script: Script }

// ---------------------------------------------------------------------------------------
// Small pieces

const PENCIL: Tool = { kind: 'pencil' }
const PEEL: Tool = { kind: 'peel' }
const HEDGE: Tool = { kind: 'hedge' }
const stickerTool = (sticker: Placeable): Tool => ({ kind: 'sticker', sticker })
/** The tray tap that picks `tool`, or nothing when it is picked already: a tap on the picked button would put it back. */
const pick = (s: State, tool: Tool): Script => (sameTool(s.tool, tool) ? [] : [{ kind: 'tool', tool }])
/** A sticker held up with its footprint's middle over the spot, and let go there. */
const holdAt = (sticker: Placeable, x: number, y: number): Script => [
  { kind: 'hold', x: x + SIZE[sticker] / 2, y: y + SIZE[sticker] / 2 },
  { kind: 'release', commit: true },
]
/** Each stroke drawn and lifted (a belt past STROKE_MAX takes more than one). */
const strokesBody = (strokes: readonly (readonly number[])[]): Script => strokes.flatMap((cells): Script => [{ kind: 'drag', cells: [...cells] }, { kind: 'release', commit: true }])
/** A step as a plan: the tool its script picks first, then the rest. A plan does not depend on the tool in hand, so it can be kept (HintMemo). */
type Plan = HintPlan
const placePlan = (step: Step, sticker: Placeable, x: number, y: number): Plan => ({ step, tool: stickerTool(sticker), body: holdAt(sticker, x, y) })
/** The plan's step and its script for the board now: its tool picked unless it is in hand, and a peel's first tap on a building left out while the peel already holds it lifted (the next tap takes it off). */
function use(s: State, p: Plan): Ranked {
  const first = p.body[0]
  const lifted = first !== undefined && first.kind === 'tap' && first.hit.kind === 'building' && s.tool.kind === 'peel' && s.lifted !== null && s.lifted.kind === 'building' && s.lifted.id === first.hit.id
  return { step: p.step, script: [...pick(s, p.tool), ...(lifted ? p.body.slice(1) : p.body)] }
}
/** Her tap on what a step points at. With the peel in hand a tap on a thing, a roof stack or a building lifts it instead, so the peel goes back first (the pencil). */
const tapOn = (s: State, hit: Hit): Script => [...(s.tool.kind === 'peel' && (hit.kind === 'thing' || hit.kind === 'stack' || hit.kind === 'building') ? pick(s, PENCIL) : []), { kind: 'tap', hit }]

const total = (c: Counts) => c.reduce((a, n) => a + n, 0)
/** Squared distance between two cells' middles, in cells. */
function dist2(a: number, b: number): number {
  const dx = xOf(a) - xOf(b)
  const dy = yOf(a) - yOf(b)
  return dx * dx + dy * dy
}
function popcount(v: number): number {
  let n = 0
  for (let x = v; x !== 0; x &= x - 1) n++
  return n
}

interface Square {
  x: number
  y: number
  k: number
}
const squareOf = (b: Building): Square => ({ x: b.x, y: b.y, k: SIZE[b.kind] })
/** The fewest belt cells that could link two footprints: 0 when they share an edge, 1 with one cell between them (or meeting at a corner: one bend links them), and so on. */
function gap(a: Square, b: Square): number {
  const dx = Math.max(0, b.x - (a.x + a.k), a.x - (b.x + b.k))
  const dy = Math.max(0, b.y - (a.y + a.k), a.y - (b.y + b.k))
  const apart = (b.x >= a.x + a.k || a.x >= b.x + b.k) && (b.y >= a.y + a.k || a.y >= b.y + b.k)
  return dx + dy + (apart ? 1 : 0)
}

/** The cells along a footprint's four edges, outside it, clockwise from its top-left as belts.ts goes round for mouths and spouts, each with its side that faces the footprint. */
function ring(x: number, y: number, k: number): { cell: number; facing: Dir }[] {
  const out: { cell: number; facing: Dir }[] = []
  const add = (cx: number, cy: number, facing: Dir) => {
    if (onBoard(cx, cy)) out.push({ cell: cellOf(cx, cy), facing })
  }
  for (let i = 0; i < k; i++) add(x + i, y - 1, 1)
  for (let i = 0; i < k; i++) add(x + k, y + i, 2)
  for (let i = k - 1; i >= 0; i--) add(x + i, y + k, 3)
  for (let i = k - 1; i >= 0; i--) add(x - 1, y + i, 0)
  return out
}

const BASKET_CELL = cellOf(BASKET.x, BASKET.y)
/**
 * The board's fixed geometry as tables for the hint's searches, made once (an imported helper
 * costs a getter call each time under the tests' module runner): each cell's neighbour by
 * side (-1 off the board); in each land, whether a belt may run over it (open land that is
 * not water, a tree, a burrow or the basket: strokes.ts stops a stroke at those); its rocks
 * and its flowers.
 */
const NEIGHBOUR = new Int16Array(CELLS * 4)
for (let c = 0; c < CELLS; c++) for (const d of DIRS) NEIGHBOUR[c * 4 + d] = stepCell(c, d)
const OPEN: Record<Land, Uint8Array> = { 1: new Uint8Array(CELLS), 2: new Uint8Array(CELLS), 3: new Uint8Array(CELLS) }
for (const land of [1, 2, 3] as const)
  for (let c = 0; c < CELLS; c++) {
    const g = GROUND[c]
    OPEN[land][c] = cellInLand(land, c) && g !== 'pond' && g !== 'tree' && g !== 'burrow' && c !== BASKET_CELL ? 1 : 0
  }
const ROCK = Uint8Array.from({ length: CELLS }, (_, c) => (rockOf(c) !== null ? 1 : 0))
const FLOWERS = Uint8Array.from({ length: CELLS }, (_, c) => (FLOWER_OF[c]! >= 0 ? 1 : 0))
/** The pump can only stand on the pond, so until it does the cells round the pond stay open for its belts: buildings keep off them and belts go round them when they can. */
const POND_EDGE = (() => {
  const pond = [...Array(CELLS).keys()].filter((c) => GROUND[c] === 'pond')
  const x = Math.min(...pond.map(xOf))
  const y = Math.min(...pond.map(yOf))
  const out = new Uint8Array(CELLS)
  for (const r of ring(x, y, SIZE.pump)) out[r.cell] = 1
  return out
})()

/** A cell a new belt can be laid on touching nothing else: open land with no building, belt, hedge or stump on it and no belt pointing into it (it would join the new one). */
function freeCell(s: State, c: number): boolean {
  const { out, over, fork } = s.belts
  if (OPEN[s.land][c] === 0 || s.owner[c]! >= 0 || out[c]! >= 0 || s.hedge[c] !== 0) return false
  for (let d = 0; d < 4; d++) {
    const n = NEIGHBOUR[c * 4 + d]!
    const back = (d + 2) % 4
    if (n >= 0 && (out[n] === back || over[n] === back || fork[n] === back)) return false
  }
  return true
}

/** The kind that makes each thing: diggers dig the rocks, ovens bake the bars, and every other maker makes what its recipe makes. */
const MAKER: Record<Thing, Maker> = (() => {
  const out = new Map<Thing, Maker>()
  for (const [rock, bar] of Object.entries(BAKES) as [Thing, Thing][]) {
    out.set(rock, 'digger')
    out.set(bar, 'oven')
  }
  for (const [kind, r] of Object.entries(RECIPES) as [Maker, Recipe][]) if (r.makes !== null) out.set(r.makes, kind)
  return Object.fromEntries(
    THINGS.map((t) => {
      const m = out.get(t)
      if (m === undefined) throw new Error(`nothing makes a ${t}`)
      return [t, m]
    }),
  ) as Record<Thing, Maker>
})()

/** What a building of `kind` takes to make `thing`: an oven the rock it bakes into it, the workshop and the bottle makers their recipe; the lab and the pad take the thing itself. */
function inputsFor(kind: Kind, thing: Thing): Thing[] {
  switch (kind) {
    case 'oven':
      return (Object.keys(BAKES) as Thing[]).filter((rock) => BAKES[rock] === thing)
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return Object.keys(RECIPES[kind].takes) as Thing[]
    case 'lab':
    case 'pad':
      return [thing]
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return []
  }
}

/** What a sticker of `kind` puts out: a digger its rock (`rock`), an oven both bars, every other maker its recipe's thing; the lab, towers and bowls nothing. */
function productsOf(kind: Placeable, rock: Thing): Thing[] {
  switch (kind) {
    case 'digger':
      return [rock]
    case 'oven':
      return Object.values(BAKES) as Thing[]
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
    case 'pump':
      return [RECIPES[kind].makes!]
    case 'lab':
    case 'tower':
    case 'bowl':
      return []
  }
}

/** The belts a building of this kind needs room for round its edge: one in for each thing it takes (the lab two, for its green and its orange bottles), one out for what it makes. */
function beltsFor(kind: Placeable): number {
  const ins = kind === 'lab' ? 2 : kind === 'oven' ? 1 : kind === 'workshop' || kind === 'greenMaker' || kind === 'orangeMaker' ? Object.keys(RECIPES[kind].takes).length : 0
  return ins + (isMaker(kind) ? 1 : 0)
}

// ---------------------------------------------------------------------------------------
// What the layout carries, and the rates of the chain

/** Who feeds whom, read once a look: the buildings each building's spout belts reach, both ways, and what each puts out. */
interface Flow {
  to: Map<number, number[]>
  from: Map<number, number[]>
  /** An oven puts out only the bars of the rocks its belts bring; with none, the bars its takers want (Beep digs either), or both while it has no taker. Every other kind as trade.ts gives. */
  gives: Map<number, Thing[]>
  /** Ovens no belt brings rocks to. */
  open: Set<number>
}

function flowOf(s: State): Flow {
  const to = new Map<number, number[]>()
  const from = new Map<number, number[]>()
  const byId = new Map(s.buildings.map((b) => [b.id, b]))
  const ids = [...byId.keys()].sort((p, q) => p - q)
  for (const id of ids) {
    to.set(id, [])
    from.set(id, [])
  }
  for (const id of ids) {
    const spouts = s.net.spouts.get(id)!
    if (spouts.length === 0) continue
    for (const r of downstream(s, spouts, null)) {
      if (r === id) continue
      to.get(id)!.push(r)
      from.get(r)!.push(id)
    }
  }
  const given = new Map<number, Thing[]>()
  const open = new Set<number>()
  for (const b of s.buildings) {
    if (b.kind !== 'oven') {
      given.set(b.id, gives(b))
      continue
    }
    const rocks = new Set(from.get(b.id)!.flatMap((id) => gives(byId.get(id)!)).filter((t) => BAKES[t] !== undefined))
    if (rocks.size > 0) {
      given.set(b.id, gives(b).filter((bar) => [...rocks].some((rock) => BAKES[rock] === bar)))
      continue
    }
    // No belt brings it rocks: it bakes what its takers want (Beep digs either), or either while it has none.
    open.add(b.id)
    const wanted = gives(b).filter((bar) => to.get(b.id)!.some((id) => demandOf(s, byId.get(id)!.kind, bar) > 0))
    given.set(b.id, wanted.length > 0 ? wanted : gives(b))
  }
  return { to, from, gives: given, open }
}

/** Rates are things per RATE_SPAN, which every batch divides: a digger or an oven makes 2, the pump 4, the workshop and each bottle maker 1, and the lab drinks 4. */
const RATE_SPAN = ticks(4)
const rate = (n: number, span: number) => (n * RATE_SPAN) / span

/** How many of `thing` building b puts out a span: an oven fed both rocks bakes each half the time, and one only Beep feeds may bake either. */
function supply(flow: Flow, b: Building, thing: Thing): number {
  const given = flow.gives.get(b.id)!
  if (!given.includes(thing)) return 0
  switch (b.kind) {
    case 'oven':
      return rate(1, RECIPES.oven.for) / (flow.open.has(b.id) ? 1 : given.length)
    case 'digger':
    case 'pump':
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return rate(1, RECIPES[b.kind].for)
    case 'pad':
    case 'lab':
    case 'tower':
    case 'bowl':
      return 0
  }
}
/** How many of `thing` a building of `kind` uses a span: a maker its recipe's share, an oven a rock a batch, the lab a bottle a drink, the pad one maker's worth while an open part takes it. */
function demandOf(s: State, kind: Kind, thing: Thing): number {
  switch (kind) {
    case 'oven':
      return BAKES[thing] === undefined ? 0 : rate(1, RECIPES.oven.for)
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return rate(RECIPES[kind].takes[thing] ?? 0, RECIPES[kind].for)
    case 'lab':
      return isBottle(thing) ? rate(1, LAB_DRINK) : 0
    case 'pad':
      return openPart(s, thing) >= 0 ? rate(1, RECIPES[MAKER[thing]].for) : 0
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return 0
  }
}

/** What each building could still give and what each gets of each thing as the layout stands, by "id:thing": a building's things go round its takers in turn, so each gets an even share. */
interface Ledger {
  spare: Map<string, number>
  fed: Map<string, number>
}
function ledgerOf(s: State, flow: Flow, byId: (id: number) => Building): Ledger {
  const spare = new Map<string, number>()
  const fed = new Map<string, number>()
  for (const b of s.buildings)
    for (const t of flow.gives.get(b.id)!) {
      const takers = flow.to.get(b.id)!.map(byId).filter((r) => demandOf(s, r.kind, t) > 0)
      const give = supply(flow, b, t)
      let used = 0
      for (const r of takers) {
        const k = `${r.id}:${t}`
        fed.set(k, (fed.get(k) ?? 0) + Math.min(give / takers.length, demandOf(s, r.kind, t)))
        used += demandOf(s, r.kind, t)
      }
      spare.set(`${b.id}:${t}`, give - used)
    }
  return { spare, fed }
}

/** A sticker to place: what it makes (a digger: the rock it digs), and the building it is for when one already stands. */
interface Need {
  sticker: Placeable
  thing: Thing
  to: Building | null
}

/**
 * Rule 6: the first thing missing from the chain that runs from what the lab and the rocket
 * want now back to the rocks, in the plan's fixed order (the lab's bottles, then each open
 * part, then the first gold bar for Science!), that she can do. What already feeds a building
 * is followed upstream first. What a building still lacks comes over a belt that can be drawn
 * from a building with some to spare (one whose things of that kind go nowhere yet first,
 * then the nearest; a second belt out of an oven with bars to spare comes before one more
 * oven), else from a sticker left in the tray on a good spot, else over a long belt from one
 * with some to spare; with nothing to spare and no sticker to place, a building that gets none
 * at all shares a busy one, and with no busy one either Beep digs its rocks by hand (digStep).
 */
function chainStep(look: Look): Plan | null {
  const s = look.s
  const flow = look.flow()
  const { spare, fed } = look.ledger()
  const seen = new Set<string>()
  const round = new Map<string, Plan | null>()
  const wide = new Map<string, Plan | null>()
  let answer: Plan | null = null
  const spareOf = (b: Building, t: Thing) => spare.get(`${b.id}:${t}`) ?? 0
  const fedOf = (r: Building, t: Thing) => fed.get(`${r.id}:${t}`) ?? 0
  /** Its things of kind t go to nobody yet. */
  const idle = (b: Building, t: Thing) => !flow.to.get(b.id)!.some((id) => everWants(look.byId(id).kind, t))
  /** The link step from b into r for t, worked out once a look: round the blueprint, or with `across` over it too when no belt goes round. */
  const belt = (b: Building, r: Building, t: Thing, across: boolean) => {
    const k = `${b.id}>${r.id}:${t}`
    if (!round.has(k)) round.set(k, linkStep(look, b, r, t, true))
    if (!across || round.get(k) !== null) return round.get(k)!
    if (!wide.has(k)) wide.set(k, acrossStep(look, b, r, t))
    return wide.get(k)!
  }
  /** An oven on its spot that no belt brings rocks to gives only the bars the blueprint plans out of the spot (Beep would dig their rocks): no line takes the gold oven for its blue bars. */
  const asPlanned = (b: Building, t: Thing) => !flow.open.has(b.id) || look.spotOf(b) < 0 || PLANNED.some((p) => p.from === look.spotOf(b) && p.thing === t)
  /** A belt into r for things of kind t from the best building that gives them over one that can be drawn (no longer than SHORT_LINK when `short`, over the blueprint too when `across`); only from one with some to spare unless `busy`. */
  const feeder = (r: Building, t: Thing, busy: boolean, short: boolean, across: boolean): Plan | null => {
    const key = (b: Building) => [idle(b, t) ? 0 : 1, gap(squareOf(b), squareOf(r)), b.id]
    const all = s.buildings.filter((b) => b.id !== r.id && flow.gives.get(b.id)!.includes(t) && asPlanned(b, t) && !flow.to.get(b.id)!.includes(r.id) && (busy || spareOf(b, t) > 0))
    for (const b of all.sort((p, q) => compare(key(p), key(q)))) {
      const step = belt(b, r, t, across)
      if (step !== null && step.step.kind === 'link' && (!short || step.step.path.length - 2 <= SHORT_LINK)) return step
    }
    return null
  }
  /** The blueprint's next belt into r for things of kind t: from the building on its spot while that does not feed r yet (or the way back to that belt), or the sticker for its open spot while one is left. */
  const planned = (r: Building, t: Thing, across: boolean): Plan | null => {
    const to = look.spotOf(r)
    for (const p of to < 0 ? [] : PLANNED) {
      if (p.to !== to || p.thing !== t) continue
      const b = look.on(p.from)
      const kind = SPOTS[p.from]!.kind
      const step = b !== null ? (flow.to.get(b.id)!.includes(r.id) ? null : belt(b, r, t, across)) : !across && kind !== 'pad' && stickersLeft(s, kind) > 0 && look.spots().includes(p.from) ? placeStep(look, { sticker: kind, thing: t, to: r }) : null
      if (step !== null) return step
    }
    return null
  }
  /** The next repair toward the piece of the blueprint that would feed r with t (goalOf), at a stage. */
  const repair = (r: Building, t: Thing, stage: Stage): Plan | null => {
    const goal = goalOf(look, r, t)
    return goal === null ? null : repairOf(look, goal, stage, chainStep)
  }
  const satisfy = (r: Building, t: Thing): void => {
    const k = `${r.id}:${t}`
    if (answer !== null || seen.has(k)) return
    seen.add(k)
    for (const id of flow.from.get(r.id)!) {
      const b = look.byId(id)
      // A feeder on the blueprint gets the inputs the blueprint plans for it (not blue rocks for the gold oven while the start oven feeds r blue bars too), and as r's own planned feeder for t even while it makes something else (her blue rocks in the gold oven); any other the inputs of what it makes. So does r's one feeder of t when r stands on its spot and no machine stands where the blueprint plans r's t from (an oven on the gold spot feeding the pad blue bars while the start oven's spot is bare): with the start oven there its own belt comes instead, and for a building of hers off the blueprint the blueprint's machines make what it plans for them.
      const j = look.spotOf(b)
      const to = look.spotOf(r)
      const makes = flow.gives.get(b.id)!.includes(t) || (j >= 0 && PLANNED.some((p) => p.from === j && p.to === to && p.thing === t))
      const only = to >= 0 && flow.from.get(r.id)!.every((f) => f === b.id || !flow.gives.get(f)!.includes(t)) && !PLANNED.some((p) => p.to === to && p.thing === t && p.from !== j && look.on(p.from) !== null)
      const ins = makes ? inputsFor(b.kind, t).filter((i) => j < 0 || only || PLANNED.some((p) => p.to === j && p.thing === i)) : []
      // An input the feeder gets none of comes before one it gets too little of: the orange maker's short bubble belt before the whole gear line behind its workshop.
      for (const i of ins.sort((p, q) => (fedOf(b, p) > 0 ? 1 : 0) - (fedOf(b, q) > 0 ? 1 : 0))) satisfy(b, i)
    }
    if (answer !== null || fedOf(r, t) >= demandOf(s, r.kind, t)) return
    const need: Need = { sticker: MAKER[t], thing: t, to: r }
    const left = stickersLeft(s, need.sticker) > 0
    const none = fedOf(r, t) === 0
    // Round the blueprint first; then for a building that gets none the gentle way back to it; then over it (a belt across a spot or a belt the blueprint keeps may want clearing later); then bringing a machine of hers onto it, and last the peel of her links in its way.
    answer =
      planned(r, t, false) ??
      feeder(r, t, false, true, false) ??
      (left ? stickerStep(look, need, chainStep) : null) ??
      feeder(r, t, false, false, false) ??
      (none ? (feeder(r, t, true, false, false) ?? repair(r, t, 'gentle')) : null) ??
      planned(r, t, true) ??
      feeder(r, t, false, true, true) ??
      feeder(r, t, false, false, true) ??
      (none ? (feeder(r, t, true, false, true) ?? repair(r, t, 'move')) : null) ??
      (left ? harshStickerStep(look, need, chainStep) : null) ??
      (none ? (repair(r, t, 'harsh') ?? digStep(s, r, t)) : null)
  }

  // Her first touch is the dig, the easiest gesture with the quickest answer: while the start oven has never baked a bar and no belt brings it rocks, Beep digs its rock by hand before its belt to the pad, which a bar on its roof then gives a reason.
  const start = unbaked(s)
  if (start !== null && flow.from.get(start.id)!.length === 0) answer = digStep(s, start, 'blueRock')
  const lab = s.buildings.find((b) => b.kind === 'lab') ?? null
  const bottles = BOTTLES.filter((_, i) => labNeed(s)[i]! > 0)
  if (answer === null && bottles.length > 0 && lab === null && stickersLeft(s, 'lab') > 0) {
    const need: Need = { sticker: 'lab', thing: bottles[0]!, to: null }
    answer = stickerStep(look, need, chainStep) ?? harshStickerStep(look, need, chainStep)
  }
  if (lab !== null) for (const bottle of bottles) satisfy(lab, bottle)
  const pad = s.buildings.find((b) => b.kind === 'pad')!
  for (const part of openParts(s)) satisfy(pad, PART_INFO[part].thing)
  // Science! comes with the first gold bar an oven bakes: the blueprint's gold oven fed by its gold digger (an oven on its spot first, or the way back to it); off the blueprint a gold digger into an oven, one no belt brings rocks to first, the nearest, but never one the blueprint feeds the other rock (its bars would choke that oven's line).
  const card = nextCard(s)
  const science = card !== null && card.needs.kind === 'goldBar'
  const goldOven = (stage: Stage): Plan | null => {
    const p = SPOTS[GOLD_LINE.to]!
    const need: Need = { sticker: 'oven', thing: 'goldBar', to: null }
    if (stage === 'gentle' && stickersLeft(s, 'oven') > 0 && openFor(look, need, GOLD_LINE.to)) return placePlan({ kind: 'place', sticker: 'oven', x: p.x, y: p.y }, 'oven', p.x, p.y)
    return repairOf(look, { kind: 'spot', spot: GOLD_LINE.to, belt: null, bring: null }, stage, chainStep)
  }
  if (answer === null && science) {
    const oven = look.on(GOLD_LINE.to)
    if (oven !== null) satisfy(oven, 'goldRock')
    else answer = goldOven('gentle')
  }
  const ovens = s.buildings.filter((b) => b.kind === 'oven' && (look.spotOf(b) < 0 || PLANNED.some((p) => p.to === look.spotOf(b) && p.thing === 'goldRock')))
  if (answer === null && science && !s.buildings.some((o) => o.kind === 'oven' && fedOf(o, 'goldRock') > 0)) {
    const byIdle = (b: Building) => [idle(b, 'goldRock') ? 0 : 1, b.id]
    for (const digger of s.buildings.filter((b) => flow.gives.get(b.id)!.includes('goldRock') && spareOf(b, 'goldRock') > 0).sort((p, q) => compare(byIdle(p), byIdle(q)))) {
      const byNear = (o: Building) => [flow.open.has(o.id) ? 0 : 1, gap(squareOf(o), squareOf(digger)), o.id]
      for (const oven of [...ovens].sort((p, q) => compare(byNear(p), byNear(q)))) answer ??= belt(digger, oven, 'goldRock', true)
    }
    const need: Need = { sticker: 'digger', thing: 'goldRock', to: null }
    if (answer === null && ovens.length > 0 && stickersLeft(s, 'digger') > 0) answer = stickerStep(look, need, chainStep) ?? harshStickerStep(look, need, chainStep)
    if (answer === null && look.on(GOLD_LINE.to) === null) answer = goldOven('move') ?? goldOven('harsh')
  }
  return answer
}

/** The oven standing at the start on its spot while it has never baked a bar (none on its roof, none pushed out), or null: rule 6 digs its rock before its belt to the pad. */
function unbaked(s: State): Building | null {
  const b = s.buildings.find((x) => x.kind === 'oven' && x.x === START_OVEN.x && x.y === START_OVEN.y)
  return b !== undefined && b.pushAt < 0 && b.stack.length === 0 ? b : null
}

/**
 * Beep digs it by hand: the bare cell nearest building r (Manhattan steps to its footprint,
 * the lower cell on a tie) of the patch that gives rock t, or of the pond for a bubble, where
 * a touch digs (open land with no building, belt or hedge on it). It is the chain's missing
 * link while nothing else can feed r, the first rule she learns: tap the rocks and Beep digs
 * one. Null for a thing no hand digs, or with no such cell in the land.
 */
function digStep(s: State, r: Building, t: Thing): Plan | null {
  if (MAKER[t] !== 'digger' && MAKER[t] !== 'pump') return null
  const k = SIZE[r.kind]
  let best = -1
  let bestSteps = Infinity
  for (let c = 0; c < CELLS; c++) {
    if (!cellInLand(s.land, c) || (t === 'bubble' ? GROUND[c] !== 'pond' : rockOf(c) !== t) || s.owner[c]! >= 0 || s.belts.out[c]! >= 0 || s.hedge[c] !== 0) continue
    const x = xOf(c)
    const y = yOf(c)
    const steps = Math.max(0, r.x - x, x - (r.x + k - 1)) + Math.max(0, r.y - y, y - (r.y + k - 1))
    if (steps < bestSteps) {
      best = c
      bestSteps = steps
    }
  }
  if (best < 0) return null
  return { step: { kind: 'dig', cell: best }, tool: PENCIL, body: [{ kind: 'dig', cell: best, down: true }, { kind: 'dig', cell: best, down: false }] }
}

/** Compares two keys element by element. */
function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return 0
}

// ---------------------------------------------------------------------------------------
// One look at the board

/** What the rules read, each part worked out the first time one asks. */
interface Look {
  s: State
  /** Whether this look keeps what its layout rules find in s.hintMemo (stepHint's look, inside the step: a query must not change the state). */
  writes: boolean
  /** Whether a repair this look offers is first tried on a copy of the board (leadsOn); the look on that copy does not try its own. */
  checks: boolean
  /** The key of everything the layout rules read (boardKey). */
  key(): string
  byId(id: number): Building
  flow(): Flow
  ledger(): Ledger
  /** The cells bubbles ride over (downstream of the pump), and gold bars (downstream of an oven that bakes them). */
  bubbles(): Uint8Array
  gold(): Uint8Array
  /** The blueprint's spots still open for their stickers (SPOTS, by place): nothing on any of their cells. */
  spots(): readonly number[]
  /** The building standing on a blueprint spot (its kind on its cell), or null. */
  on(spot: number): Building | null
  /** The blueprint spot a building stands on, or -1. */
  spotOf(b: Building): number
  /** The cells links keep off while they can: the blueprint's open spots and the free cells of its belts. */
  reserve(): ReadonlySet<number>
  /** The cells a sticker of this kind must leave: the blueprint's open spots for other kinds and the free cells of its belts. */
  kept(sticker: Placeable): ReadonlySet<number>
  /** The free cells a belt across the blueprint may only cross, and the ways it may cross each (crossingOf). */
  crossing(): ReadonlyMap<number, number>
  /** What of the blueprint stands on the board, cell by cell (standingOf), and how gently a repair can take each other cell (gradesOf). */
  standing(): Uint8Array
  grades(): Int8Array
}

function lookAt(s: State, writes: boolean, checks: boolean): Look {
  const ids = new Map(s.buildings.map((b) => [b.id, b]))
  const byId = (id: number) => {
    const b = ids.get(id)
    if (b === undefined) throw new Error(`no building ${id}`)
    return b
  }
  let flow: Flow | null = null
  let ledger: Ledger | null = null
  let bubbles: Uint8Array | null = null
  let gold: Uint8Array | null = null
  let spots: readonly number[] | null = null
  let standing: readonly (Building | null)[] | null = null
  let reserve: ReadonlySet<number> | null = null
  const kept = new Map<Placeable, ReadonlySet<number>>()
  let crossing: ReadonlyMap<number, number> | null = null
  let key: string | null = null
  let stands: Uint8Array | null = null
  let grades: Int8Array | null = null
  const look: Look = {
    s,
    writes,
    checks,
    key: () => (key ??= boardKey(s)),
    byId,
    flow: () => (flow ??= flowOf(s)),
    ledger: () => (ledger ??= ledgerOf(s, look.flow(), byId)),
    bubbles: () => (bubbles ??= cellsFrom(s, s.buildings.filter((b) => b.kind === 'pump').map((b) => b.id))),
    gold: () => (gold ??= cellsFrom(s, s.buildings.filter((b) => b.kind === 'oven' && look.flow().gives.get(b.id)!.includes('goldBar')).map((b) => b.id))),
    spots: () => (spots ??= openSpots(s)),
    on: (i) => (standing ??= SPOTS.map((p) => s.buildings.find((b) => b.kind === p.kind && b.x === p.x && b.y === p.y) ?? null))[i]!,
    spotOf: (b) => SPOTS.findIndex((p, i) => p.kind === b.kind && p.x === b.x && p.y === b.y && look.on(i) === b),
    reserve: () => (reserve ??= new Set([...look.spots().flatMap((i) => footprint(SPOTS[i]!)), ...freePlanned(s)])),
    kept: (sticker) => {
      let cells = kept.get(sticker)
      if (cells === undefined) {
        cells = new Set([...look.spots().flatMap((i) => (SPOTS[i]!.kind === sticker ? [] : footprint(SPOTS[i]!))), ...freePlanned(s)])
        kept.set(sticker, cells)
      }
      return cells
    },
    crossing: () => (crossing ??= crossingOf(look)),
    standing: () => (stands ??= standingOf(look)),
    grades: () => (grades ??= gradesOf(look)),
  }
  return look
}

/** The belt cells these buildings' things ride over: every cell downstream of their spouts. */
function cellsFrom(s: State, ids: readonly number[]): Uint8Array {
  const cells = new Uint8Array(CELLS)
  const spouts = ids.flatMap((id) => s.net.spouts.get(id)!)
  if (spouts.length > 0) downstream(s, spouts, cells)
  return cells
}

// ---------------------------------------------------------------------------------------
// Belt paths: a grid search, checked against planStroke

/** Where a new belt may end: in a building's mouth, on one of these free cells (a tower's spot), or on one of these belt cells, joining its side or feeding its tail. */
type End = { kind: 'mouth'; to: Building } | { kind: 'ground'; cells: ReadonlySet<number> } | { kind: 'belt'; cells: ReadonlySet<number> }

/** What each step of a path costs, in tenths of a cell: a turn a little more, a bridge more, the room round other buildings and the munchers' flowers a little more (buildings' sides stay free for their own belts), a hub's edge more (it keeps its ways out: HUBS), and rocks and the pond's edge before a pump stands much more: only a digger can use a patch, and the pump only the pond. */
const COST = { step: 10, turn: 3, bridge: 12, rock: 25, flower: 3, beside: 3, pond: 20, hub: 12 } as const
/** No cells spoken for: the board as it stands. */
const NONE: ReadonlySet<number> = new Set()
/** No cells a belt may only cross: every free cell is ground it may turn or end on. */
const ANYWAY: ReadonlyMap<number, number> = new Map()
/** A search state is a cell and the side it was entered going toward (cell * 4 + dir); a heap key packs the cost above it. */
const KEY = 4096

/**
 * The cheapest new belt from one of `from`'s free edge cells to `end`, as the cells a finger
 * traces: `from`'s footprint cell, the belt's cells (crossing a plain straight belt at a
 * right angle where it must, which makes a bridge), and, for a mouth, the target's footprint
 * cell, or for a belt end, the belt cell it joins; `standing` are stickers about to be placed
 * and `taken` cells new belts will have taken first. On a free cell of `crossing` it only goes
 * straight, the ways of that cell's parity (-1: none), as over a belt. It never starts from a
 * belt (no forks), never passes a cell another belt points into (no stray joins), and never
 * ends a cell past a crossing (the stroke table would join there). Null when there is no way.
 */
function route(s: State, from: Building, end: End, standing: readonly Building[], taken: ReadonlySet<number>, crossing: ReadonlyMap<number, number>): { path: number[]; cost: number } | null {
  const n = CELLS
  const nb = NEIGHBOUR
  const open = OPEN[s.land]
  const { out, in: ins, fork, over } = s.belts
  const owner = s.owner
  const hedge = s.hedge
  const target = end.kind === 'mouth' ? end.to.id : -1
  const pond = s.buildings.some((b) => b.kind === 'pump') || from.kind === 'pump' ? 0 : COST.pond
  // Each cell's footprint (the building whose mouths and spouts are round it), or -1: towers and bowls stand on belts and have none. Stickers about to be placed (`standing`) count as standing.
  const foot = new Int16Array(n).fill(-1)
  for (const b of [...s.buildings, ...standing]) if (hasMouths(b)) for (let y = b.y; y < b.y + SIZE[b.kind]; y++) for (let x = b.x; x < b.x + SIZE[b.kind]; x++) foot[cellOf(x, y)] = b.id
  // The edges of the hubs other than the belt's own ends: belts keep off them so a hub keeps its ways out.
  const hubEdge = new Uint8Array(n)
  for (const b of s.buildings) if (HUBS.has(b.kind) && b.id !== from.id && b.id !== target) for (const r of ring(b.x, b.y, SIZE[b.kind])) hubEdge[r.cell] = 1
  // The cells a belt points into: a new belt there would join it.
  const pointed = new Uint8Array(n)
  for (let c = 0; c < n; c++) {
    if (out[c]! < 0) continue
    for (const side of [out[c]!, over[c]!, fork[c]!]) if (side >= 0 && nb[c * 4 + side]! >= 0) pointed[nb[c * 4 + side]!] = 1
  }
  // Each cell's class: 1 free ground, 2 a plain straight belt running east-west, 3 one running north-south, 4 free ground to cross going east or west only, 5 going north or south only, 0 none of these.
  const kind = new Uint8Array(n)
  const extra = new Int32Array(n)
  for (let c = 0; c < n; c++) {
    if (foot[c]! >= 0 || open[c] === 0 || taken.has(c)) continue
    if (owner[c]! < 0 && out[c]! < 0 && hedge[c] === 0 && pointed[c] === 0) {
      const ways = crossing.get(c)
      if (ways === -1) continue
      kind[c] = ways === undefined ? 1 : 4 + ways
      let beside = 0
      for (let d = 0; d < 4; d++) {
        const m = nb[c * 4 + d]!
        if (m >= 0 && foot[m]! >= 0 && foot[m] !== from.id && foot[m] !== target) beside = 1
      }
      extra[c] = ROCK[c]! * COST.rock + FLOWERS[c]! * COST.flower + beside * COST.beside + pond * POND_EDGE[c]! + COST.hub * hubEdge[c]!
    } else if (out[c]! >= 0 && ins[c] === (out[c]! + 2) % 4 && fork[c]! < 0 && over[c]! < 0 && owner[c]! < 0) kind[c] = out[c]! % 2 === 0 ? 2 : 3
  }
  /** A stroke ending on cell c going toward d would step on into a building's mouth a cell further. */
  /** A stroke ending on cell c going toward d would not end on bare ground: it points into a building's mouth or a belt there, or steps on into a mouth a cell further. */
  const stepsIn = (c: number, d: number) => {
    const g = nb[c * 4 + d]!
    if (g < 0) return false
    if (foot[g]! >= 0 || out[g]! >= 0) return true
    return open[g] === 1 && owner[g]! < 0 && nb[g * 4 + d]! >= 0 && foot[nb[g * 4 + d]!]! >= 0
  }
  /** Entering belt cell m going toward d ends the stroke on it: on its tail along its line (a feed), or on a plain straight belt's side (a join). */
  const joins = (m: number, d: number) => {
    if (out[m]! < 0) return false
    if (ins[m] === (d + 2) % 4) return s.net.preds[PRED * inSlot(m)]! < 0
    return ins[m] === (out[m]! + 2) % 4 && fork[m]! < 0 && over[m]! < 0 && out[m]! % 2 !== d % 2
  }
  /** Cell m may be crossed going toward d: free ground of `crossing` the ways of d's parity. */
  const passes = (m: number, d: number) => kind[m] === 4 + (d & 1)
  const step = COST.step
  const turn = COST.turn
  const bridge = COST.bridge
  const INF = 0x3fffffff
  const dist = new Int32Array(n * 4).fill(INF)
  const prev = new Int32Array(n * 4).fill(-1)
  const heap: number[] = []
  const relax = (st: number, cost: number, back: number) => {
    if (cost >= dist[st]!) return
    dist[st] = cost
    prev[st] = back
    heapPush(heap, cost * KEY + st)
  }
  // Out of the building onto free ground, or straight over a plain belt running past its side (the stroke bridges it there as it would further on).
  for (const r of ring(from.x, from.y, SIZE[from.kind])) {
    const d = (r.facing + 2) % 4
    if (kind[r.cell] === 1 || passes(r.cell, d)) relax(r.cell * 4 + d, step + extra[r.cell]!, -2 - nb[r.cell * 4 + r.facing]!)
    else if ((kind[r.cell] === 2 && d % 2 === 1) || (kind[r.cell] === 3 && d % 2 === 0)) relax(r.cell * 4 + d, step + bridge, -2 - nb[r.cell * 4 + r.facing]!)
  }
  let best = INF
  let bestState = -1
  let tail = -1
  while (heap.length > 0) {
    const key = heapPop(heap)
    const cost = Math.floor(key / KEY)
    const st = key - cost * KEY
    if (cost >= best) break
    if (cost > dist[st]!) continue
    const c = st >> 2
    const d = st & 3
    if (kind[c] !== 1) {
      // A crossing (over a belt, or over a cell of `crossing`) goes straight on, onto ground, over the next belt, or into the target's mouth (its lane feeds it).
      const m = nb[c * 4 + d]!
      if (m >= 0 && end.kind === 'mouth' && foot[m] === target && cost + step < best) {
        best = cost + step
        bestState = st
        tail = m
      }
      if (m >= 0 && (kind[m] === 1 || passes(m, d))) relax(m * 4 + d, cost + step + extra[m]!, st)
      else if (m >= 0 && ((kind[m] === 2 && d % 2 === 1) || (kind[m] === 3 && d % 2 === 0))) relax(m * 4 + d, cost + step + bridge, st)
      continue
    }
    if (end.kind === 'ground' && end.cells.has(c) && (prev[st]! < -1 || kind[prev[st]! >> 2] === 1) && !stepsIn(c, d)) {
      best = cost
      bestState = st
      tail = -1
      break
    }
    for (let k = 0; k < 3; k++) {
      const d2 = k === 0 ? d : (d + (k === 1 ? 1 : 3)) % 4
      const m = nb[c * 4 + d2]!
      if (m < 0) continue
      const next = cost + step + (k === 0 ? 0 : turn)
      if (((end.kind === 'mouth' && foot[m] === target) || (end.kind === 'belt' && end.cells.has(m) && joins(m, d2))) && next < best) {
        best = next
        bestState = st
        tail = m
      }
      if (kind[m] === 1 || passes(m, d2)) relax(m * 4 + d2, next + extra[m]!, st)
      else if ((kind[m] === 2 && d2 % 2 === 1) || (kind[m] === 3 && d2 % 2 === 0)) relax(m * 4 + d2, next + bridge, st)
    }
  }
  if (bestState < 0) return null
  const path: number[] = tail >= 0 ? [tail] : []
  for (let st = bestState; ; st = prev[st]!) {
    path.push(st >> 2)
    if (prev[st]! < -1) {
      path.push(-2 - prev[st]!)
      break
    }
  }
  return { path: path.reverse(), cost: best }
}

function heapPush(h: number[], v: number): void {
  let i = h.length
  h.push(v)
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h[p]! <= v) break
    h[i] = h[p]!
    i = p
  }
  h[i] = v
}
function heapPop(h: number[]): number {
  const top = h[0]!
  const last = h.pop()!
  if (h.length > 0) {
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      if (l >= h.length) break
      const c = l + 1 < h.length && h[l + 1]! < h[l]! ? l + 1 : l
      if (h[c]! >= last) break
      h[i] = h[c]!
      i = c
    }
    h[i] = last
  }
  return top
}

/** The cells planStroke changes laying these finger cells as one belt: all but a footprint at either end, the belt it ends on, and its first cell when that is a belt it only rides on (its lane, or its bridge's hump, going the stroke's way). */
function expected(s: State, cells: readonly number[]): number[] {
  const last = cells.length - 1
  return cells.filter((c, i) => {
    if (s.owner[c]! >= 0 && s.belts.out[c]! < 0) return false
    if (i === last && s.belts.out[c]! >= 0) return false
    if (i === 0 && s.belts.out[c]! >= 0) return s.belts.out[c] !== dirTo(c, cells[1]!) && s.belts.over[c] !== dirTo(c, cells[1]!)
    return true
  })
}
/** The same cells, in any order. */
function sameCells(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const p = [...a].sort((u, v) => u - v)
  const q = [...b].sort((u, v) => u - v)
  return p.every((c, i) => c === q[i])
}

/** planStroke over these cells (the hint's path its own) lays exactly them, unflipped, with one of these end signs. A building on a cell between the ends with no belt under it never lets it: the stroke would end there (in her lab's mouth, on a planned belt). */
function lays(s: State, cells: readonly number[], signs: readonly EndSign[]): boolean {
  if (cells.slice(1, -1).some((c) => s.owner[c]! >= 0 && s.belts.out[c]! < 0)) return false
  const plan = planStroke(s, cells, cells)
  return plan.edit !== null && !plan.flipped && signs.includes(plan.sign) && sameCells(plan.cells, expected(s, cells))
}

/**
 * The strokes that lay `path` as one belt, each checked against planStroke on the board the
 * strokes before it leave: one stroke, or past STROKE_MAX a first stroke ending on a free cell
 * and the rest carrying on from that dead end. The last ends with one of `signs`. Null when
 * the planner would lay something else.
 */
function strokesOf(s: State, path: readonly number[], signs: readonly EndSign[]): number[][] | null {
  if (path.length <= STROKE_MAX) return lays(s, path, signs) ? [[...path]] : null
  for (let k = STROKE_MAX - 1; k >= 2; k--) {
    const first = path.slice(0, k + 1)
    if (!lays(s, first, ['none', 'hump'])) continue
    const after = cloneState(s)
    applyEdit(after, planStroke(after, first, first).edit!)
    const rest = strokesOf(after, path.slice(k), signs)
    if (rest !== null) return [first, ...rest]
  }
  return null
}

/**
 * The strokes that lay planned belt `path`, riding, feeding and carrying on from the parts of it
 * already laid along it (her own stroke along the dotted path that stopped short, say): a stroke
 * for each gap, from the building or from where the laid part before it ends, to where the next
 * one begins or into the building at the far end, each checked on the board the strokes before
 * it leave. With no such part, strokesOf. Null when the planner would lay something else, or
 * nothing is left to lay.
 */
function plannedStrokes(s: State, path: readonly number[], signs: readonly EndSign[]): number[][] | null {
  const last = path.length - 1
  // Its last cell is a building's (whose mouth it ends in), or a belt cell of its own (a tower's or a bowl's spot), laid along it once the belt runs on straight over it.
  const into = path[last]!
  const end = s.owner[into]! >= 0 && hasMouths(building(s, s.owner[into]!)) ? last : last + 1
  const along = path.map((c, k) => {
    const b = k > 0 && k < end ? cellBelt(s, c) : null
    const d = k > 0 ? dirTo(path[k - 1]!, c) : -1
    const on = k < last ? dirTo(c, path[k + 1]!) : d
    return b !== null && ((b.in === opposite(d as Dir) && b.out === on) || (d === on && b.over === on))
  })
  if (!along.includes(true)) return strokesOf(s, path, signs)
  const out: number[][] = []
  let board = s
  let from = 0
  const lay = (part: readonly number[], ends: readonly EndSign[]): boolean => {
    const strokes = strokesOf(board, part, ends)
    if (strokes === null) return false
    board = cloneState(board)
    for (const cells of strokes) applyEdit(board, planStroke(board, cells, cells).edit!)
    out.push(...strokes)
    return true
  }
  for (let k = 1; k < end; k++) {
    if (!along[k]) continue
    if (k > from + 1 && !lay(path.slice(from, k + 1), ['feed'])) return null
    while (k + 1 < end && along[k + 1]) k++
    from = k
  }
  // What is left after the last laid part, unless that part already runs into the building at the end, or over the last cell.
  if (from < end - 1 && !lay(path.slice(from), signs)) return null
  return out.length > 0 ? out : null
}

/**
 * The cells of the belts that run into building r's mouths and only there (up to a fork), and
 * that keep moving: everything the buildings at their far end give is something r takes now
 * (a belt of blue bars into a full rocket part stands still, and a new belt joining it would
 * stand still too). A new belt may join or feed one of them so its things ride into r.
 */
function beltsInto(look: Look, r: Building): Set<number> {
  const s = look.s
  const spoutOf = new Map<number, Building>()
  for (const b of s.buildings) for (const x of s.net.spouts.get(b.id)!) spoutOf.set(x, b)
  const cells = new Set<number>()
  for (const x of s.net.mouths.get(r.id)!) {
    if (x >= OVER) continue
    // The buildings feeding this mouth's belt, up its lanes and their joins.
    const sources = new Set<Building>()
    const seen = new Set<number>()
    for (const todo = [x]; todo.length > 0; ) {
      const y = todo.pop()!
      if (seen.has(y)) continue
      seen.add(y)
      const b = spoutOf.get(y)
      if (b !== undefined) sources.add(b)
      for (let k = 0; k < PRED; k++) if (s.net.preds[PRED * y + k]! >= 0) todo.push(s.net.preds[PRED * y + k]!)
    }
    if (sources.size === 0 || [...sources].some((b) => !look.flow().gives.get(b.id)!.some((t) => demandOf(s, r.kind, t) > 0))) continue
    for (let c = x >> 1; !cells.has(c) && s.belts.fork[c]! < 0; ) {
      cells.add(c)
      const p = s.net.preds[PRED * inSlot(c)]!
      if (p < 0 || p >= OVER) break
      c = p >> 1
    }
  }
  return cells
}

/**
 * The link step from one building into another, round the blueprint's open spots and belts:
 * the blueprint's belt between their spots while the planner still lays it, else (`repairs`)
 * the way back to it when her loose belts stand on it (repairOf), else a belt of its own
 * (linkRoute). Null when no belt can go there round them: acrossStep is the last way.
 */
function linkStep(look: Look, from: Building, to: Building, thing: Thing, repairs: boolean): Plan | null {
  const planned = PLANNED.find((p) => p.from === look.spotOf(from) && p.to === look.spotOf(to) && p.thing === thing)
  const laid = planned === undefined ? null : plannedStrokes(look.s, planned.path, ['mouth', 'zip', 'feed'])
  if (planned !== undefined && laid !== null) return linkPlan(look, from, to, thing, [...planned.path], laid)
  return (planned !== undefined && repairs ? repairOf(look, { kind: 'belt', belt: planned }, 'gentle', chainStep) : null) ?? linkRoute(look, from, to, thing, look.reserve(), ANYWAY)
}

/**
 * A link across the blueprint's open spots and belts, when no belt can go round them and no
 * repair leads back to the blueprint: the old searches' last way, which a later repair may have
 * to clear. Over a free cell of a planned belt of a machine on its spot it only goes straight
 * across (crossingOf), so that belt can still bridge it there: one that turned or ran along it
 * would stand in the way of a belt the hint wants soon, whose repair would take it up, and the
 * link would come back (a loop).
 */
function acrossStep(look: Look, from: Building, to: Building, thing: Thing): Plan | null {
  return look.reserve().size > 0 ? linkRoute(look, from, to, thing, NONE, look.crossing()) : null
}

/** A belt into to's mouth, or when none can reach one, a belt joining (or feeding the tail of) a belt that already runs into it, keeping off the `kept` cells and only crossing those of `crossing` (route); null with neither. */
function linkRoute(look: Look, from: Building, to: Building, thing: Thing, kept: ReadonlySet<number>, crossing: ReadonlyMap<number, number>): Plan | null {
  const s = look.s
  const mouth = route(s, from, { kind: 'mouth', to }, [], kept, crossing)
  const strokes = mouth === null ? null : strokesOf(s, mouth.path, ['mouth'])
  if (mouth !== null && strokes !== null) return linkPlan(look, from, to, thing, mouth.path, strokes)
  const into = beltsInto(look, to)
  const join = into.size === 0 ? null : route(s, from, { kind: 'belt', cells: into }, [], kept, crossing)
  const joined = join === null ? null : strokesOf(s, join.path, ['zip', 'feed'])
  return join !== null && joined !== null ? linkPlan(look, from, to, thing, join.path, joined) : null
}

/** A link's step and its strokes: its dotted path shows in full for her first HELP_FULL belts of that kind of link. */
function linkPlan(look: Look, from: Building, to: Building, thing: Thing, path: number[], strokes: number[][]): Plan {
  const full = (look.s.help.links[linkKey(from.kind, to.kind, thing)] ?? 0) < HELP_FULL
  return { step: { kind: 'link', from: from.id, to: to.id, thing, path, full }, tool: PENCIL, body: strokesBody(strokes) }
}

/** The path search round the blueprint's open spots and belts when it can (Look.reserve), else across them. */
function routeAround(look: Look, from: Building, end: End): { path: number[]; cost: number } | null {
  const reserve = look.reserve()
  return route(look.s, from, end, [], reserve, ANYWAY) ?? (reserve.size > 0 ? route(look.s, from, end, [], NONE, ANYWAY) : null)
}

/** A kind of link, for help.links: its from kind, its to kind and its thing. */
export const linkKey = (from: Kind, to: Kind, thing: Thing) => `${from}>${to}:${thing}`

// ---------------------------------------------------------------------------------------
// Spots for stickers

/** What a building of this kind takes in through its mouths: the lab bottles, an oven rocks, the workshop and the bottle makers their recipe. */
function takesOf(kind: Kind): Thing[] {
  switch (kind) {
    case 'lab':
      return [...BOTTLES]
    case 'oven':
      return Object.keys(BAKES) as Thing[]
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return Object.keys(RECIPES[kind].takes) as Thing[]
    case 'pad':
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return []
  }
}

/** The buildings a new sticker will link to: what will feed it, and what it will feed. */
interface Anchors {
  feeders: readonly Building[]
  takers: readonly Building[]
}
/**
 * A sticker's anchors: the buildings that put out what it takes (with none yet, those that
 * feed the makers of what it takes: the lab before any bottle maker stands goes by the ovens,
 * where its bottle makers will), and the building it is for (else every one that takes what
 * it makes: the pad only while an open part does).
 */
function anchorsOf(look: Look, need: Need): Anchors {
  const s = look.s
  const giving = (things: readonly Thing[]) => s.buildings.filter((b) => things.some((t) => look.flow().gives.get(b.id)!.includes(t)))
  const takes = takesOf(need.sticker)
  const makes = productsOf(need.sticker, need.thing)
  const feeders = giving(takes)
  return {
    feeders: feeders.length > 0 ? feeders : giving([...new Set(takes.flatMap((t) => takesOf(MAKER[t])))]),
    takers: need.to !== null ? [need.to] : s.buildings.filter((b) => b.kind !== need.sticker && makes.some((t) => (b.kind === 'pad' ? openPart(s, t) >= 0 : everWants(b.kind, t)))),
  }
}

/** How a spot's distance to a building it links to scores: one belt cell between is best, touching is worse than a cell more. */
const gapScore = (g: number) => (g === 0 ? 3 : g - 1)

/** Towers and bowls are for the munchers: their spots score by how near a burrow in the land they stand. */
function burrowGap(s: State, c: number): number {
  let best = Infinity
  BURROWS.forEach((site) => {
    if (inLand(s.land, site.x, site.y)) best = Math.min(best, gap({ x: xOf(c), y: yOf(c), k: 1 }, { x: site.x, y: site.y, k: 2 }))
  })
  return best === Infinity ? 0 : best
}

/**
 * How good a spot (its top-left cell) is for the sticker, lower better, with the belt cells it
 * would cover; null when it is no good. A good spot's footprint fits (footprintFits) and it
 * has a free edge cell for each belt the sticker needs. It scores by how near it is to what it
 * links to, how open its edges are, the buildings it would touch, the munchers' flowers under
 * it and, for a hub, its ways out and the room round it. A tower stands on a belt bubbles
 * ride, a bowl on a belt gold bars ride over a burrow's flowers, the nearer a burrow the
 * better. planPlace has the last word.
 */
function spotScore(look: Look, need: Need, x: number, y: number, anchors: Anchors, cover: boolean): { score: number; base: number; covers: number[] } | null {
  const s = look.s
  const kind = need.sticker
  const k = SIZE[kind]
  const cells = footprintFits(look, need, x, y, cover)
  if (cells === null) return null
  const { flowers, covers } = cells
  if (kind === 'tower' || kind === 'bowl') {
    const c = cellOf(x, y)
    const b = cellBelt(s, c)
    if (b === null || b.fork >= 0 || b.over >= 0) return null
    if (kind === 'tower' ? look.bubbles()[c] !== 1 : FLOWER_OF[c]! < 0 || look.gold()[c] !== 1) return null
    return { score: burrowGap(s, c), base: 0, covers }
  }
  const edge = ring(x, y, k)
  const free = edge.filter((r) => freeCell(s, r.cell)).length
  if (free < beltsFor(kind)) return null
  const square = { x, y, k }
  const linked = [...anchors.feeders, ...anchors.takers]
  let base = 4 * flowers + 2 * (edge.length - free)
  // Touching a building wastes a side of each.
  for (const b of s.buildings) if (hasMouths(b) && !linked.includes(b) && gap(square, squareOf(b)) === 0) base += 3
  if (HUBS.has(kind)) {
    // A hub wants room round it, not just a way out: its later belts and the machines it will feed need space beside it.
    let room = 0
    for (let cy = y - HUB_MARGIN; cy < y + k + HUB_MARGIN; cy++) for (let cx = x - HUB_MARGIN; cx < x + k + HUB_MARGIN; cx++) if (onBoard(cx, cy) && freeCell(s, cellOf(cx, cy))) room++
    base += 6 * Math.max(0, HUB_EXITS - exits(s, square, () => false)) + Math.max(0, HUB_ROOM - room)
  }
  let score = base
  for (const group of [anchors.feeders, anchors.takers]) if (group.length > 0) score += 2 * Math.min(...group.map((b) => gapScore(gap(square, squareOf(b)))))
  if (linked.length === 0) score += 2 * gapScore(gap(square, squareOf(s.buildings.find((b) => b.kind === 'pad')!)))
  return { score, base, covers }
}

/**
 * The footprint at (x, y) suits the sticker: open land with no building, hedge, belt (unless
 * `cover`: then the belt cells it would cover) or cell another sticker must leave, no water but
 * for the pump, no rock but its own for a digger (two or more of them), and off the pond's edge
 * until the pump stands. With the flowers under it.
 */
function footprintFits(look: Look, need: Need, x: number, y: number, cover: boolean): { flowers: number; covers: number[] } | null {
  const s = look.s
  const ground = groundFits(look, need, x, y, pumped(s))
  if (ground === null) return null
  const k = SIZE[need.sticker]
  const covers: number[] = []
  for (let dy = 0; dy < k; dy++)
    for (let dx = 0; dx < k; dx++) {
      const c = cellOf(x + dx, y + dy)
      if (s.owner[c]! >= 0 || s.hedge[c] !== 0 || look.kept(need.sticker).has(c)) return null
      if (k > 1 && s.belts.out[c]! >= 0) {
        if (!cover) return null
        covers.push(c)
      }
    }
  return { flowers: ground.flowers, covers }
}

/** The footprint at (x, y) suits the sticker by its ground alone, whatever stands on it: open land, no water but for the pump, no tree, burrow, pad, cell round the pad or basket, no rock but its own for a digger (two or more of them), and off the pond's edge until the pump stands (`pumped`). With the flowers under it. */
function groundFits(look: Look, need: Need, x: number, y: number, pumped: boolean): { flowers: number } | null {
  const s = look.s
  const kind = need.sticker
  const k = SIZE[kind]
  let rocks = 0
  let flowers = 0
  for (let dy = 0; dy < k; dy++)
    for (let dx = 0; dx < k; dx++) {
      const c = cellOf(x + dx, y + dy)
      const g = GROUND[c]
      if (!cellInLand(s.land, c) || g === 'tree' || g === 'burrow' || g === 'pad' || PAD_RING.has(c) || c === BASKET_CELL) return null
      if ((g === 'pond') !== (kind === 'pump')) return null
      const rock = rockOf(c)
      if (kind === 'digger' && rock === need.thing) rocks++
      else if (rock !== null) return null
      if (FLOWER_OF[c]! >= 0) flowers++
      if (POND_EDGE[c] === 1 && kind !== 'pump' && !pumped) return null
    }
  return kind === 'digger' && rocks < 2 ? null : { flowers }
}
/** The pump stands: the cells round the pond are free for stickers. */
const pumped = (s: State) => s.buildings.some((b) => b.kind === 'pump')

/** Every good spot for the sticker in the land, the best first. */
function spotsFor(look: Look, need: Need, anchors: Anchors, cover: boolean): { x: number; y: number; score: number; base: number; covers: number[] }[] {
  const s = look.s
  const k = SIZE[need.sticker]
  const w = LANDS[s.land]
  const out: { x: number; y: number; score: number; base: number; covers: number[] }[] = []
  for (let y = w.y0; y + k - 1 <= w.y1; y++)
    for (let x = w.x0; x + k - 1 <= w.x1; x++) {
      const r = spotScore(look, need, x, y, anchors, cover)
      if (r !== null) out.push({ x, y, ...r })
    }
  return out.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x)
}

/** planPlace puts the sticker exactly at (x, y) held over its middle. */
function fits(s: State, sticker: Placeable, x: number, y: number): boolean {
  const plan = planPlace(s, sticker, x + SIZE[sticker] / 2, y + SIZE[sticker] / 2, { x, y })
  return plan.ok && plan.x === x && plan.y === y
}

/** How many of the best good spots that fit are weighed together by the belts they would need (each a few path searches), and how many such batches are tried before a sticker waits in the tray. */
const ROOM_TRIES = 8
const ROOM_BATCHES = 4

/** A building keeps a way out when a free edge cell of it opens onto room: a free 2x2 block (a machine could stand there) or ROOM free cells. */
const ROOM = 20
/**
 * The one-of-a-kind buildings that will want more belts than they start with and that no
 * other sticker can stand in for: the pad and the lab take a line from each maker, the pump
 * feeds the towers and the orange bottle maker, the workshop the body and the orange bottle
 * maker, which feeds the lab and the engine. A placement leaves each of them a way out.
 */
const HUBS: ReadonlySet<Kind> = new Set(['pad', 'lab', 'pump', 'workshop', 'orangeMaker'])
/** A hub's spot scores better with up to HUB_EXITS ways out, and up to HUB_ROOM free cells within HUB_MARGIN of its footprint. */
const HUB_EXITS = 3
const HUB_MARGIN = 2
const HUB_ROOM = 24

/** How many of the square's free edge cells open onto room (ROOM), with the `shut` cells counted as taken. */
function exits(s: State, sq: Square, shut: (c: number) => boolean): number {
  const open = (c: number) => c >= 0 && !shut(c) && freeCell(s, c)
  let n = 0
  for (const r of ring(sq.x, sq.y, sq.k)) {
    if (!open(r.cell)) continue
    const seen = new Set([r.cell])
    let room = false
    for (const todo = [r.cell]; todo.length > 0 && !room; ) {
      const c = todo.pop()!
      // A free 2x2 block with c as its top-left corner.
      const east = NEIGHBOUR[c * 4]!
      const south = NEIGHBOUR[c * 4 + 1]!
      if (open(east) && open(south) && open(NEIGHBOUR[east * 4 + 1]!)) room = true
      for (let d = 0; d < 4; d++) {
        const m = NEIGHBOUR[c * 4 + d]!
        if (open(m) && !seen.has(m)) {
          seen.add(m)
          todo.push(m)
        }
      }
      if (seen.size >= ROOM) room = true
    }
    if (room) n++
  }
  return n
}

/**
 * What the sticker standing at (x, y) would cost in belts, as path searches' cost, each laid
 * on the board the ones before it leave: one in for each thing it takes (from the nearer of
 * the two nearest buildings that give it, or, when none can reach it, a long belt's worth
 * from a sticker of their kind still in the tray), then one out to the nearer of its two
 * nearest takers (into a mouth, or joining a belt that runs into one: beltsInto), round the
 * cells the blueprint keeps (Look.kept). Null when one of them could not be drawn, or when it
 * or a hub beside it would be left with no way out (HUBS). With the belts' cells and its
 * footprint.
 */
function beltsCost(look: Look, need: Need, x: number, y: number, anchors: Anchors): { cost: number; taken: Set<number> } | null {
  const s = look.s
  const here = newBuilding(s.nextId, need.sticker, x, y, -1)
  const taken = new Set(look.kept(need.sticker))
  if (!hasMouths(here)) return { cost: 0, taken }
  const square = squareOf(here)
  const nearest = (group: readonly Building[]) => [...group].sort((p, q) => gap(square, squareOf(p)) - gap(square, squareOf(q)) || p.id - q.id).slice(0, 2)
  let total = 0
  /** The cheaper belt of these no longer than LONG_BELT, its cells then spoken for; false with none. */
  const lay = (found: ({ path: number[]; cost: number } | null)[]): boolean => {
    const best = found.filter((f): f is { path: number[]; cost: number } => f !== null && f.path.length - 2 <= LONG_BELT).sort((p, q) => p.cost - q.cost)[0]
    if (best === undefined) return false
    total += best.cost
    for (const c of best.path) taken.add(c)
    return true
  }
  for (const t of takesOf(need.sticker)) {
    const givers = anchors.feeders.filter((b) => look.flow().gives.get(b.id)!.includes(t))
    if (givers.length === 0 || lay(nearest(givers).map((b) => route(s, b, { kind: 'mouth', to: here }, [here], taken, ANYWAY)))) continue
    // No giver can reach it: a sticker of the kind that makes the thing can still stand beside it.
    if (stickersLeft(s, MAKER[t]) <= 0) return null
    total += LONG_BELT * COST.step
  }
  if (anchors.takers.length > 0 && !lay(nearest(anchors.takers).flatMap((b) => [route(s, here, { kind: 'mouth', to: b }, [here], taken, ANYWAY), route(s, here, { kind: 'belt', cells: beltsInto(look, b) }, [here], taken, ANYWAY)]))) return null
  const inside = (c: number) => xOf(c) >= x && xOf(c) < x + square.k && yOf(c) >= y && yOf(c) < y + square.k
  const shut = (c: number) => taken.has(c) || inside(c)
  if (HUBS.has(need.sticker) && exits(s, square, shut) === 0) return null
  for (const b of s.buildings) {
    if (!HUBS.has(b.kind) || (gap(square, squareOf(b)) > 1 && !ring(b.x, b.y, SIZE[b.kind]).some((r) => taken.has(r.cell)))) continue
    if (exits(s, squareOf(b), shut) === 0 && exits(s, squareOf(b), () => false) > 0) return null
  }
  for (let dy = 0; dy < square.k; dy++) for (let dx = 0; dx < square.k; dx++) taken.add(cellOf(x + dx, y + dy))
  return { cost: total, taken }
}


// ---------------------------------------------------------------------------------------
// The blueprint: the factory the hint builds

/** A machine's spot in the blueprint: its kind and its footprint's top-left cell (a tower's or a bowl's one cell). */
interface Spot {
  kind: Kind
  x: number
  y: number
}
/** Towers and bowls stand on a belt cell and take what rides under them: their spots lie on the blueprint's belts. */
const onBelt = (kind: Kind): kind is 'tower' | 'bowl' => kind === 'tower' || kind === 'bowl'
/** A belt of the blueprint: from one spot to another (their places in SPOTS) for a thing, as the cells a finger traces, both ends' footprint cells with them. */
interface Planned {
  from: number
  to: number
  thing: Thing
  path: readonly number[]
}
const footprint = (p: Spot): number[] => Array.from({ length: SIZE[p.kind] * SIZE[p.kind] }, (_, i) => cellOf(p.x + (i % SIZE[p.kind]), p.y + Math.floor(i / SIZE[p.kind])))

/**
 * The factory the hint builds when she follows it, laid out for the one board (board.ts MAP):
 * each machine's spot in the order the cards bring them (the pad and the oven standing at the
 * start first), each tower's and bowl's cell on the belt that feeds it, each belt between two
 * of them as the cells a finger traces, in the order the hint draws them, and the hedge lines
 * that turn a burrow. The bottle line stands at burrow A's door, so its munchers come for it at
 * once: the green maker west of the gold oven, the lab under the start oven fed round the tree.
 * The pond is far west and the burrows east, so the bubble line is the longest of land 1: from
 * the pump past the pad and along row 4, bridged over the blue rock belt, to the tower beside
 * A's door, the second tower one cell before it. A's munchers come out between that tower and
 * A's hedge, so they nibble out under its suds; A's bowl stands on the gold oven's short belt
 * on A's flowers. The workshop sits over the bubble line in the north-west: its short belt into
 * the top of the pad brings the gears of the body and the nose, and its gears go down the one
 * free column beside the pad (bridged over the bubble line and the start oven's pad belt) to
 * the orange maker by the pump, which bridges its bottles over the bubble line into the pad.
 * The gear line runs along row 1 from the blue patch by A's mound to the oven in the corner
 * once land 2 opens it. No bubble line or gold belt reaches burrow B, so a fence of six hedges
 * closes its west and top. The third green maker waits for land 3 by B and C, fed gold along
 * row 6 from the gold oven and blue from the far blue patch; its bottles run west along B's
 * top, the one way past B to the lab, so that belt takes the top three hedges of the fence
 * back. A search over spots and belts found the first land and the rest was drawn by hand on
 * the same path search and planners (strokes.ts), every belt laid in the cards' order; the
 * scripted children launch on it.
 */
const BLUEPRINT: { spots: readonly [string, Kind, number, number][]; belts: readonly [string, string, Thing, readonly [number, number][]][]; hedges: readonly [number, readonly [number, number][]][] } = {
  spots: [
    ['pad', 'pad', 1, 4],
    ['startOven', 'oven', 6, 6],
    ['blueDigger', 'digger', 7, 2],
    ['goldDigger', 'digger', 10, 7],
    ['goldOven', 'oven', 11, 5],
    ['greenMaker', 'greenMaker', 8, 5],
    ['lab', 'lab', 6, 8],
    ['workshop', 'workshop', 5, 2],
    ['gearDigger', 'digger', 9, 2],
    ['gearOven', 'oven', 0, 1],
    ['pump', 'pump', 0, 8],
    ['tower1', 'tower', 9, 4],
    ['tower2', 'tower', 8, 4],
    ['orangeMaker', 'orangeMaker', 2, 8],
    ['bowlA', 'bowl', 12, 4],
    ['greenMaker3', 'greenMaker', 16, 5],
    ['land3Oven', 'oven', 17, 8],
    ['land3Digger', 'digger', 18, 10],
  ],
  belts: [
    ['startOven', 'pad', 'blueBar', [[6, 6], [5, 6], [4, 6], [3, 6]]],
    ['blueDigger', 'startOven', 'blueRock', [[7, 3], [7, 4], [7, 5], [7, 6]]],
    ['goldDigger', 'goldOven', 'goldRock', [[10, 7], [10, 6], [11, 6]]],
    ['greenMaker', 'lab', 'greenBottle', [[9, 6], [9, 7], [9, 8], [9, 9], [8, 9], [7, 9]]],
    ['startOven', 'greenMaker', 'blueBar', [[7, 7], [8, 7], [8, 6]]],
    ['goldOven', 'greenMaker', 'goldBar', [[11, 5], [10, 5], [9, 5]]],
    ['workshop', 'pad', 'gear', [[5, 3], [4, 3], [3, 3], [3, 4]]],
    ['startOven', 'workshop', 'blueBar', [[6, 6], [6, 5], [6, 4], [6, 3]]],
    ['pump', 'tower1', 'bubble', [[1, 8], [1, 7], [2, 7], [3, 7], [4, 7], [4, 6], [4, 5], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4]]],
    ['gearDigger', 'gearOven', 'blueRock', [[9, 2], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1]]],
    ['gearOven', 'workshop', 'blueBar', [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]],
    ['orangeMaker', 'lab', 'orangeBottle', [[3, 9], [3, 10], [4, 10], [5, 10], [6, 10], [6, 9]]],
    ['workshop', 'orangeMaker', 'gear', [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [4, 8], [3, 8]]],
    ['pump', 'orangeMaker', 'bubble', [[1, 9], [1, 10], [2, 10], [2, 9]]],
    ['goldOven', 'bowlA', 'goldBar', [[12, 5], [12, 4]]],
    ['greenMaker3', 'lab', 'greenBottle', [[16, 6], [16, 7], [15, 7], [14, 7], [13, 7], [12, 7], [12, 8], [12, 9], [11, 9], [10, 9], [10, 10], [9, 10], [8, 10], [7, 10], [7, 9]]],
    ['goldOven', 'greenMaker3', 'goldBar', [[12, 6], [13, 6], [14, 6], [15, 6], [16, 6]]],
    ['land3Oven', 'greenMaker3', 'blueBar', [[17, 8], [17, 7], [17, 6]]],
    ['land3Digger', 'land3Oven', 'blueRock', [[19, 10], [19, 9], [19, 8], [18, 8]]],
    ['orangeMaker', 'pad', 'orangeBottle', [[2, 8], [2, 7], [2, 6]]],
  ],
  hedges: [
    [0, [[10, 4]]],
    [1, [[15, 7], [14, 7], [13, 7], [13, 8], [13, 9], [13, 10]]],
  ],
}
const SPOTS: readonly Spot[] = BLUEPRINT.spots.map(([, kind, x, y]) => ({ kind, x, y }))
/** Each belt runs cell by cell out of its first spot into its second, or onto an earlier belt into it (a join). */
const PLANNED: readonly Planned[] = BLUEPRINT.belts.reduce<Planned[]>((out, [from, to, thing, cells]) => {
  const [i, j] = [from, to].map((name) => BLUEPRINT.spots.findIndex(([n]) => n === name)) as [number, number]
  const path = cells.map(([x, y]) => cellOf(x, y))
  const end = path[path.length - 1]!
  const lands = j >= 0 && (footprint(SPOTS[j]!).includes(end) || out.some((p) => p.to === j && p.path.slice(1, -1).includes(end)))
  if (i < 0 || !lands || !footprint(SPOTS[i]!).includes(path[0]!) || path.some((c, k) => k > 0 && dist2(c, path[k - 1]!) !== 1)) throw new Error(`the blueprint's belt ${from}>${to} must run cell by cell from its first spot into its second`)
  return [...out, { from: i, to: j, thing, path }]
}, [])
if (SPOTS[0]!.kind !== 'pad' || SPOTS[0]!.x !== PAD.x || SPOTS[0]!.y !== PAD.y || SPOTS[1]!.kind !== 'oven' || SPOTS[1]!.x !== START_OVEN.x || SPOTS[1]!.y !== START_OVEN.y) throw new Error('the blueprint starts with the pad and the start oven where they stand')
/** The blueprint's gold line, the gold digger into the oven whose first gold bar brings Science!. */
const GOLD_LINE: Planned = (() => {
  const p = PLANNED.find((q) => q.thing === 'goldRock')
  if (p === undefined || SPOTS[p.from]!.kind !== 'digger' || SPOTS[p.to]!.kind !== 'oven') throw new Error('the blueprint has a gold digger into an oven for Science!')
  return p
})()

/**
 * The blueprint's belts that bring a tower's or a bowl's spot what it takes, in the order they
 * are laid: the belt that ends on its cell or runs over it, after the belts into the tower spot
 * that one carries on from (the bubble line grows tower by tower, land by land). Each spot's
 * belt carries what it takes (bubbles to a tower, gold bars to a bowl), and a bowl's spot is on
 * a burrow's flowers, or the blueprint throws at load.
 */
const FEED: ReadonlyMap<number, readonly Planned[]> = (() => {
  const out = new Map<number, Planned[]>()
  const feed = (i: number): Planned[] => {
    const known = out.get(i)
    if (known !== undefined) return known
    const p = SPOTS[i]!
    const c = cellOf(p.x, p.y)
    const belt = PLANNED.find((q) => q.path.indexOf(c) > 0)
    if (belt === undefined || belt.thing !== (p.kind === 'tower' ? 'bubble' : 'goldBar') || rockOf(c) !== null || PAD_RING.has(c) || (p.kind === 'bowl' && FLOWER_OF[c]! < 0)) throw new Error(`the blueprint's ${p.kind} at ${p.x}, ${p.y} must stand on a belt of what it takes${p.kind === 'bowl' ? ", on a burrow's flowers" : ''}`)
    const chain = onBelt(SPOTS[belt.from]!.kind) ? [...feed(belt.from), belt] : [belt]
    out.set(i, chain)
    return chain
  }
  SPOTS.forEach((p, i) => {
    if (onBelt(p.kind)) feed(i)
  })
  return out
})()
/** The blueprint's hedge lines, in the order the hint offers them: the burrow each turns, and the cells a finger traces with the hedge tool. */
const HEDGE_LINES: readonly { burrow: number; cells: readonly number[] }[] = BLUEPRINT.hedges.map(([burrow, line]) => {
  const cells = line.map(([x, y]) => cellOf(x, y))
  if (BURROWS[burrow] === undefined || cells.some((c, k) => k > 0 && dist2(c, cells[k - 1]!) !== 1)) throw new Error(`the blueprint's hedge line from ${line[0]![0]}, ${line[0]![1]} must run cell by cell and turn a burrow`)
  return { burrow, cells }
})

/** The blueprint's spots still open for their stickers (the pad's never is): nothing on any of a machine's cells, and no building or hedge on a tower's or a bowl's cell (its belt is what it stands on). */
function openSpots(s: State): number[] {
  const out: number[] = []
  SPOTS.forEach((p, i) => {
    if (p.kind !== 'pad' && footprint(p).every((c) => s.owner[c]! < 0 && s.hedge[c] === 0 && (onBelt(p.kind) || s.belts.out[c]! < 0))) out.push(i)
  })
  return out
}

/** The cells of the blueprint's belts that nothing covers yet: other stickers leave them, and other belts go round them when they can. */
function freePlanned(s: State): number[] {
  return PLANNED.flatMap((p) => p.path.slice(1, -1).filter((c) => s.owner[c]! < 0 && s.belts.out[c]! < 0 && s.hedge[c] === 0))
}

/** A belt longer than LONG_BELT cells is no belt to plan a sticker's spot round: the spot is not near what it links to. A link from a building with things to spare longer than SHORT_LINK comes after a sticker placed beside the building that wants them, whose line then grows there. */
const LONG_BELT = 18
const SHORT_LINK = 10

/**
 * The spot for the sticker: the blueprint's spot for it while one is open in the land and
 * planPlace agrees, one with a planned belt to the building it is for first; none while every
 * spot the blueprint gives its kind in the land is taken by its own kind and another waits in
 * a later land (waitsForSpot); else of the best good spots planPlace agrees with, ROOM_TRIES at
 * a time, the one whose own score and belts cost least; null when none of ROOM_BATCHES batches
 * has room for every belt it needs (the sticker waits in the tray, say for the next land).
 */
function spotFor(look: Look, need: Need, anchors: Anchors): { x: number; y: number } | null {
  const spot = blueprintSpots(look, need).find((i) => openFor(look, need, i))
  if (spot !== undefined) return { x: SPOTS[spot]!.x, y: SPOTS[spot]!.y }
  return waitsForSpot(look, need.sticker) ? null : searchSpot(look, need, anchors)
}

/** The blueprint's spots for the sticker in the land with nothing of its kind on them, whose ground suits it (a digger's its rock), one with a planned belt to the building it is for first. */
function blueprintSpots(look: Look, need: Need): number[] {
  const to = need.to === null ? -1 : look.spotOf(need.to)
  const linked = (i: number) => to >= 0 && PLANNED.some((p) => (p.from === i && p.to === to) || (p.from === to && p.to === i))
  const mine = SPOTS.flatMap((p, i) => (p.kind === need.sticker && look.on(i) === null && groundFits(look, need, p.x, p.y, pumped(look.s)) !== null ? [i] : []))
  return [...mine.filter(linked), ...mine.filter((i) => !linked(i))]
}

/** Blueprint spot i is open for the sticker and planPlace agrees. */
function openFor(look: Look, need: Need, i: number): boolean {
  const p = SPOTS[i]!
  return look.spots().includes(i) && footprintFits(look, need, p.x, p.y, false) !== null && fits(look.s, need.sticker, p.x, p.y)
}

/**
 * A sticker's step, the gentlest that leads on (plans/rocket-factory.md, The one next step):
 * the blueprint's spot for it when it is free; when her loose belts, hedges or a machine of
 * hers stand on it, the repair that clears it (repairOf), which `rule` (the rule asking) is
 * tried against; none while every spot of its kind in the land is taken and another waits in
 * a later land; else any good spot the searches find. harshStickerStep comes after the rest.
 */
function stickerStep(look: Look, need: Need, rule: Rule): Plan | null {
  const s = look.s
  // A spot of its kind by the pond waits for the pump, which its belts would box in: with a pump sticker left, the pump comes first.
  const byPond = (i: number) => SPOTS[i]!.kind === need.sticker && look.on(i) === null && groundFits(look, need, SPOTS[i]!.x, SPOTS[i]!.y, true) !== null && groundFits(look, need, SPOTS[i]!.x, SPOTS[i]!.y, false) === null
  if (need.sticker !== 'pump' && !pumped(s) && stickersLeft(s, 'pump') > 0 && SPOTS.some((_, i) => byPond(i))) return stickerStep(look, { sticker: 'pump', thing: 'bubble', to: null }, rule)
  for (const i of blueprintSpots(look, need)) {
    const p = SPOTS[i]!
    if (openFor(look, need, i)) return placePlan({ kind: 'place', sticker: need.sticker, x: p.x, y: p.y }, need.sticker, p.x, p.y)
    const fix = repairOf(look, { kind: 'spot', spot: i, belt: null, bring: null }, 'gentle', rule)
    if (fix !== null) return fix
  }
  if (waitsForSpot(look, need.sticker)) return null
  const spot = searchSpot(look, need, anchorsOf(look, need))
  return spot === null ? null : placePlan({ kind: 'place', sticker: need.sticker, x: spot.x, y: spot.y }, need.sticker, spot.x, spot.y)
}

/** A sticker with no spot that anything gentler leads to: the peel over every belt on the blueprint's spot for it, her links too, so it can stand there. */
function harshStickerStep(look: Look, need: Need, rule: Rule): Plan | null {
  if (waitsForSpot(look, need.sticker)) return null
  for (const i of blueprintSpots(look, need)) {
    const fix = repairOf(look, { kind: 'spot', spot: i, belt: null, bring: null }, 'harsh', rule)
    if (fix !== null) return fix
  }
  return null
}

/** Of the best good spots planPlace agrees with, ROOM_TRIES at a time, the one whose own score and belts cost least; null when none of ROOM_BATCHES batches has room for every belt it needs. */
function searchSpot(look: Look, need: Need, anchors: Anchors): { x: number; y: number } | null {
  const s = look.s
  const spots = spotsFor(look, need, anchors, false)
  // The best by their score first, ROOM_TRIES at a time: a crowded board may leave belts only from spots further down.
  for (let at = 0, batch = 0; at < spots.length && batch < ROOM_BATCHES; batch++) {
    const fitting: { x: number; y: number; base: number }[] = []
    for (; at < spots.length && fitting.length < ROOM_TRIES; at++) if (fits(s, need.sticker, spots[at]!.x, spots[at]!.y)) fitting.push(spots[at]!)
    const planned: { x: number; y: number; cost: number }[] = []
    for (const spot of fitting) {
      const belts = beltsCost(look, need, spot.x, spot.y, anchors)
      if (belts !== null) planned.push({ x: spot.x, y: spot.y, cost: spot.base * COST.step + belts.cost })
    }
    planned.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x)
    if (planned.length > 0) return { x: planned[0]!.x, y: planned[0]!.y }
  }
  return null
}

/** Every spot the blueprint gives this kind in the land has a sticker of its kind on it, and another of its spots is still open in a later land: the stickers left wait for that land. */
function waitsForSpot(look: Look, kind: Placeable): boolean {
  const s = look.s
  const inLand = (i: number) => footprint(SPOTS[i]!).every((c) => cellInLand(s.land, c))
  return look.spots().some((i) => SPOTS[i]!.kind === kind && !inLand(i)) && SPOTS.every((p, i) => p.kind !== kind || !inLand(i) || look.on(i) !== null)
}


/** A place step for the sticker on a good spot near what it links to, or null with none. */
function placeStep(look: Look, need: Need): Plan | null {
  const spot = spotFor(look, need, anchorsOf(look, need))
  return spot === null ? null : placePlan({ kind: 'place', sticker: need.sticker, x: spot.x, y: spot.y }, need.sticker, spot.x, spot.y)
}

/** The belt cells on a link: downstream of a building's spout and upstream of a building's mouth. A peel to free a spot leaves them: they carry things for the factory. */
function linkCells(s: State): Uint8Array {
  const down = cellsFrom(s, s.buildings.map((b) => b.id))
  const up = cellsUp(s, s.buildings.flatMap((b) => s.net.mouths.get(b.id)!))
  return Uint8Array.from(down, (d, c) => d & up[c]!)
}

/** Every slot upstream of these, through joins and bridges, these included. */
function walkUp(s: State, slots: readonly number[]): Set<number> {
  const seen = new Set<number>()
  for (const todo = [...slots]; todo.length > 0; ) {
    const x = todo.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    for (let k = 0; k < PRED; k++) if (s.net.preds[PRED * x + k]! >= 0) todo.push(s.net.preds[PRED * x + k]!)
  }
  return seen
}
/** The cells of every slot upstream of these, these included. */
function cellsUp(s: State, slots: readonly number[]): Uint8Array {
  const cells = new Uint8Array(CELLS)
  for (const x of walkUp(s, slots)) cells[slotCell(x)] = 1
  return cells
}

/**
 * With no good spot anywhere for a sticker: the peel over a spot's loose belt cells (none of
 * them on a link), the fewest first, where the sticker would be offered once they are gone
 * (the finger goes round the footprint, so it takes nothing else).
 */
function freeStep(look: Look, need: Need): Plan | null {
  const s = look.s
  if (SIZE[need.sticker] !== 2 || waitsForSpot(look, need.sticker)) return null
  const linked = linkCells(s)
  const spots = spotsFor(look, need, anchorsOf(look, need), true)
    .filter((p) => p.covers.length > 0 && p.covers.every((c) => linked[c] === 0) && fits(s, need.sticker, p.x, p.y))
    .sort((a, b) => a.covers.length - b.covers.length || a.score - b.score || a.y - b.y || a.x - b.x)
  for (const p of spots.slice(0, 4)) {
    const drag = [cellOf(p.x, p.y), cellOf(p.x + 1, p.y), cellOf(p.x + 1, p.y + 1), cellOf(p.x, p.y + 1)]
    const plan = planPeelDrag(s, drag)
    if (plan.edit === null || !sameCells(plan.cells, p.covers)) continue
    const after = cloneState(s)
    applyEdit(after, plan.edit)
    if (placeStep(lookAt(after, false, false), need) === null) continue
    return { step: { kind: 'free', sticker: need.sticker, cells: plan.cells }, tool: PEEL, body: [{ kind: 'drag', cells: drag }, { kind: 'release', commit: true }] }
  }
  return null
}

// ---------------------------------------------------------------------------------------
// The way back to the blueprint

/** A layout rule, for a repair to be tried against: what the rule would offer on a board. */
type Rule = (look: Look) => Plan | null

/**
 * What of the blueprint stands on the board, cell by cell: the footprint of every building on
 * a spot of its own kind, every belt cell laid along a planned belt the way it runs (a bridge's
 * over lane too, and at a tower's or a bowl's spot its own cell), and the hedges of its hedge
 * lines. A repair takes none of it, so the factory a repair leads back to only ever grows.
 */
function standingOf(look: Look): Uint8Array {
  const cells = new Uint8Array(CELLS)
  SPOTS.forEach((p, i) => {
    if (look.on(i) !== null) for (const c of footprint(p)) cells[c] = 1
  })
  for (let c = 0; c < CELLS; c++) if (alongPlan(c, cellBelt(look.s, c)) || (look.s.hedge[c] !== 0 && HEDGE_CELLS.has(c))) cells[c] = 1
  return cells
}

/** Each cell the blueprint's belts run over, with the ways they enter and leave it: every cell after a belt's first spot up to its second (a tower's or a bowl's spot itself too, the belt running on under it). */
const PLANNED_AT: ReadonlyMap<number, readonly { into: Dir; on: Dir }[]> = (() => {
  const out = new Map<number, { into: Dir; on: Dir }[]>()
  for (const p of PLANNED) {
    const end = onBelt(SPOTS[p.to]!.kind) ? p.path.length : p.path.length - 1
    for (let k = 1; k < end; k++) {
      const c = p.path[k]!
      const into = dirTo(p.path[k - 1]!, c)
      const on = k + 1 < p.path.length ? dirTo(c, p.path[k + 1]!) : into
      out.set(c, [...(out.get(c) ?? []), { into, on }])
    }
  }
  return out
})()
/**
 * The ways a belt across the blueprint may cross each cell of the planned belts into or out of
 * the machines standing on their spots, by their parity (route): straight over the planned belt
 * where it runs straight, so its stroke bridges the crossing later; -1, none, on a turn, a cell
 * two such belts cross or share, or the cell before a belt's end (a stroke ending there would
 * join the crossing belt). A planned belt between spots still empty it may take: a repair
 * clears it once the hint wants that belt.
 */
function crossingOf(look: Look): Map<number, number> {
  const out = new Map<number, number>()
  for (const p of PLANNED) {
    if (look.on(p.from) === null && look.on(p.to) === null) continue
    const end = onBelt(SPOTS[p.to]!.kind) ? p.path.length : p.path.length - 1
    for (let k = 1; k < end; k++) {
      const c = p.path[k]!
      const into = dirTo(p.path[k - 1]!, c)
      const ways = k + 2 < p.path.length && into === dirTo(c, p.path[k + 1]!) ? (into + 1) % 2 : -1
      out.set(c, out.has(c) && out.get(c) !== ways ? -1 : ways)
    }
  }
  return out
}

/** The cells of the blueprint's hedge lines. */
const HEDGE_CELLS: ReadonlySet<number> = new Set(HEDGE_LINES.flatMap((l) => l.cells))

/** A belt cell runs along a planned belt the way it goes: its own lane, or its bridge's over lane. */
function alongPlan(c: number, b: CellBelt | null): boolean {
  return b !== null && (PLANNED_AT.get(c) ?? []).some(({ into, on }) => (b.in === opposite(into) && b.out === on) || (into === on && b.over === on))
}

/** Every cell a piece of the blueprint needs: its spots' footprints and the cells round them (a belt there may point into one), and its belts' cells after their first spots. */
const BLUEPRINT_CELLS: ReadonlySet<number> = new Set([...SPOTS.flatMap((p) => [...footprint(p), ...ring(p.x, p.y, SIZE[p.kind]).map((r) => r.cell)]), ...PLANNED_AT.keys()])

/** Every planned belt of spot j leads to a spot outside the land: a machine on it can do nothing there yet. */
const ahead = (j: number, land: Land) => PLANNED.every((p) => (p.from !== j && p.to !== j) || !footprint(SPOTS[p.from === j ? p.to : p.from]!).every((c) => cellInLand(land, c)))

/**
 * The edit, made in land `land`, is one a repair of the hint's makes (repairOf): it took
 * something away but nothing of the blueprint's own (no building off its spot, unless the spot
 * is ahead of the land and the factory needs the machine elsewhere; no belt lane laid along a
 * planned belt; no hedge of a planned line), and every belt and hedge it took stood where a
 * piece of the blueprint needs the cell. She can make such an edit herself; then too the hint
 * leads on from it rather than back.
 */
function asked(edit: Edit, land: Land): boolean {
  const took = edit.removed.length > 0 || edit.hedges.some((h) => h.after === 0) || edit.belts.some((b) => b.after === null || (b.before !== null && b.before.over >= 0 && b.after.over < 0))
  const blueprint = edit.removed.some((r) => SPOTS.some((p, j) => p.kind === r.kind && p.x === r.x && p.y === r.y && !ahead(j, land))) || edit.hedges.some((h) => h.after === 0 && HEDGE_CELLS.has(h.cell)) || edit.belts.some((b) => alongPlan(b.cell, b.before) && !alongPlan(b.cell, b.after))
  return took && !blueprint && edit.belts.every((b) => BLUEPRINT_CELLS.has(b.cell)) && edit.hedges.every((h) => h.after !== 0 || BLUEPRINT_CELLS.has(h.cell))
}

/** A building ever takes `thing`: through a mouth, or for a tower or a bowl from the belt under it. */
const takesEver = (b: Building, thing: Thing) => (hasMouths(b) ? everWants(b.kind, thing) : thing === (b.kind === 'tower' ? 'bubble' : 'goldBar'))

/**
 * How gently a repair can take each cell that is not the blueprint's (-1 where there is
 * nothing to take): 0 a hedge or a stump, a belt cell on no link, or one whose things ride
 * only to buildings that never take them (a link that joined the wrong line); 1 a belt cell
 * some building's things ride over to a building that takes them (a link of hers at work).
 */
function gradesOf(look: Look): Int8Array {
  const s = look.s
  const gives = look.flow().gives
  const standing = look.standing()
  const sources = s.buildings.filter((b) => s.net.spouts.get(b.id)!.length > 0).map((b) => ({ b, cells: cellsFrom(s, [b.id]) }))
  const good = new Uint8Array(CELLS)
  for (const r of s.buildings) {
    const at = cellOf(r.x, r.y)
    const up = cellsUp(s, hasMouths(r) ? s.net.mouths.get(r.id)! : [inSlot(at), outSlot(at)])
    for (const f of sources) if (f.b.id !== r.id && gives.get(f.b.id)!.some((t) => takesEver(r, t))) for (let c = 0; c < CELLS; c++) good[c] |= f.cells[c]! & up[c]!
  }
  const grades = new Int8Array(CELLS).fill(-1)
  for (let c = 0; c < CELLS; c++) if (standing[c] === 0 && (s.belts.out[c]! >= 0 || s.hedge[c] !== 0)) grades[c] = s.belts.out[c]! >= 0 ? good[c]! : 0
  return grades
}

/**
 * A piece of the blueprint a repair clears the way for: a spot, with the planned belt out of
 * it that its sticker is wanted for (whose cells are cleared with it) and the building of its
 * kind to bring there when none is left in the tray; or a planned belt between two buildings
 * standing on their spots.
 */
type Goal = { kind: 'spot'; spot: number; belt: Planned | null; bring: Building | null } | { kind: 'belt'; belt: Planned }

/**
 * The piece of the blueprint that would feed building r with t: for r off the blueprint, the
 * first spot of its kind in the land with nothing of its kind on it, to bring r there; else the
 * first planned belt into r for t in the land that does not feed it yet, with its source's spot
 * while nothing of its kind stands there. Null when the blueprint has none.
 */
function goalOf(look: Look, r: Building, t: Thing): Goal | null {
  const s = look.s
  const inLand = (cells: readonly number[]) => cells.every((c) => cellInLand(s.land, c))
  const j = look.spotOf(r)
  if (j < 0) {
    const i = SPOTS.findIndex((p, k) => p.kind === r.kind && look.on(k) === null && inLand(footprint(p)))
    return i < 0 ? null : { kind: 'spot', spot: i, belt: null, bring: r }
  }
  for (const p of PLANNED) {
    if (p.to !== j || p.thing !== t || !inLand([...footprint(SPOTS[p.from]!), ...p.path])) continue
    const f = look.on(p.from)
    if (f === null) return { kind: 'spot', spot: p.from, belt: p, bring: null }
    if (!look.flow().to.get(f.id)!.includes(r.id)) return { kind: 'belt', belt: p }
  }
  return null
}

/** What rides a lane of a belt cell (its two slots), or would: what the buildings whose belts lead onto it put out. */
function ridersOf(look: Look, slots: readonly number[]): Thing[] {
  const s = look.s
  const up = walkUp(s, slots)
  return s.buildings.flatMap((b) => (s.net.spouts.get(b.id)!.some((x) => up.has(x)) ? look.flow().gives.get(b.id)! : []))
}

/**
 * What stands in a goal's way that is not the blueprint's, by how gently a repair can take it
 * (gradesOf): in a spot's footprint every belt, hedge, stump and building, and a belt pointing
 * into it that brings nothing its sticker takes (it would end at the machine with nowhere to
 * go); on a planned belt's cells every building and every belt lane its stroke could not ride
 * or cross straight over (her hedges there it takes back by itself), a bridge's lane of hers
 * over a belt of the blueprint's too. Null when something of the blueprint's own is in the way,
 * which on the board the blueprint was drawn for never is.
 */
function obstaclesOf(look: Look, goal: Goal): Obstacles | null {
  const s = look.s
  const standing = look.standing()
  const grades = look.grades()
  const found: Obstacles = { loose: [], links: [], via: new Map(), buildings: [] }
  const add = (c: number, link: boolean) => {
    if (!found.loose.includes(c) && !found.links.includes(c)) (link ? found.links : found.loose).push(c)
  }
  /** One lane of belt cell c in the way: a bridge's hump comes off with a tap on its cell, its main lane with a drag along it from a free cell beside it. */
  const lane = (c: number, over: boolean, link: boolean) => {
    const b = cellBelt(s, c)!
    const beside = b.over < 0 || over ? undefined : [stepCell(c, b.out as Dir), stepCell(c, opposite(b.out as Dir))].find((n) => n >= 0 && s.belts.out[n]! < 0 && s.owner[n]! < 0 && s.hedge[n] === 0)
    if (beside !== undefined) found.via.set(c, beside)
    add(c, link)
  }
  /** The building on cell c in the way, unless it is the blueprint's (a tower or a bowl of its own on a planned belt is no obstacle there): false then. */
  const machine = (c: number, foot: boolean): boolean => {
    const b = look.byId(s.owner[c]!)
    if (look.spotOf(b) >= 0) return !foot && !hasMouths(b)
    if (!found.buildings.includes(b)) found.buildings.push(b)
    return true
  }
  const spot = goal.kind === 'spot' ? SPOTS[goal.spot]! : null
  if (spot !== null) {
    for (const c of footprint(spot)) {
      if (s.owner[c]! >= 0 ? !machine(c, true) : (s.belts.out[c]! >= 0 || s.hedge[c] !== 0) && standing[c] === 1) return null
      if (s.owner[c]! < 0 && (s.belts.out[c]! >= 0 || s.hedge[c] !== 0)) add(c, grades[c] === 1)
    }
    for (const r of ring(spot.x, spot.y, SIZE[spot.kind])) {
      const c = r.cell
      const b = cellBelt(s, c)
      if (s.owner[c]! >= 0 || b === null) continue
      // Her lane pointing into it, bringing nothing it takes.
      const over = b.over === r.facing
      const slots = over ? [overIn(c), overOut(c)] : [inSlot(c), outSlot(c)]
      if ((b.out !== r.facing && !over) || (PLANNED_AT.get(c) ?? []).some((q) => q.on === r.facing && (over ? q.into === q.on : b.in === opposite(q.into))) || ridersOf(look, slots).some((t) => everWants(spot.kind, t))) continue
      lane(c, over, laneGood(look, slots))
    }
  }
  const belt = goal.belt
  if (belt !== null) {
    const path = belt.path
    const end = onBelt(SPOTS[belt.to]!.kind) ? path.length : path.length - 1
    const lanesAt = (c: number) => {
      const b = cellBelt(s, c)
      return b === null ? [] : b.over >= 0 ? [{ over: false, in: b.in, out: b.out }, { over: true, in: opposite(b.over as Dir), out: b.over }] : [{ over: false, in: b.in, out: b.out }]
    }
    /** The lane of path cell k laid along the belt, the way it runs there. */
    const along = (k: number) => {
      const into = dirTo(path[k - 1]!, path[k]!)
      const on = k + 1 < path.length ? dirTo(path[k]!, path[k + 1]!) : into
      return k < end && s.owner[path[k]!]! < 0 ? lanesAt(path[k]!).find((l) => l.in === opposite(into) && l.out === on) : undefined
    }
    for (let k = 1; k < end; k++) {
      const c = path[k]!
      const into = dirTo(path[k - 1]!, c)
      const on = k + 1 < path.length ? dirTo(c, path[k + 1]!) : into
      if (s.owner[c]! >= 0) {
        if (!machine(c, false)) return null
        continue
      }
      const b = cellBelt(s, c)
      if (b === null) continue
      const lanes = lanesAt(c)
      // Laid along the belt already: in the way only as the last of such cells while it leads on elsewhere (into the side of a belt the stroke should cross), where no stroke can carry on from it.
      const laid = along(k)
      if (laid !== undefined) {
        const slots = laid.over ? [overIn(c), overOut(c)] : [inSlot(c), outSlot(c)]
        if (k + 1 < end && along(k + 1) === undefined && s.net.next[slots[1]!] !== -1) lane(c, laid.over, laneGood(look, slots))
        continue
      }
      // In the way: on a turn every lane; on a straight run a lane along its axis, and one across it the stroke could not bridge (a bend, a fork, or right before the belt's end on bare ground, where it would join).
      const bridged = (l: (typeof lanes)[number]) => into === on && (k + 2 < path.length || s.owner[path[path.length - 1]!]! >= 0) && b.fork < 0 && l.in === opposite(l.out as Dir) && l.out % 2 !== into % 2
      const blocking = lanes.filter((l) => !bridged(l))
      if (blocking.length === 0) continue
      const planned = PLANNED_AT.get(c) ?? []
      if (blocking.some((l) => planned.some((q) => l.in === opposite(q.into) && l.out === q.on))) return null
      const l = blocking.find((x) => x.over) ?? blocking[0]!
      lane(c, l.over, b.over < 0 ? grades[c] === 1 : laneGood(look, l.over ? [overIn(c), overOut(c)] : [inSlot(c), outSlot(c)]))
    }
  }
  return found
}

/** What a repair would take out of a goal's way (obstaclesOf): cells a repair may take gently and her links, by cell; the free cell beside a bridge whose main lane is in the way, which the drag that takes that lane alone starts from; and buildings. */
interface Obstacles {
  loose: number[]
  links: number[]
  via: Map<number, number>
  buildings: Building[]
}

/** A lane of a belt cell (its two slots) carries things from some building to one that takes them. */
function laneGood(look: Look, slots: readonly number[]): boolean {
  const s = look.s
  const up = walkUp(s, slots)
  const to = downstream(s, slots, null).map(look.byId)
  return s.buildings.some((b) => s.net.spouts.get(b.id)!.some((x) => up.has(x)) && to.some((r) => r.id !== b.id && look.flow().gives.get(b.id)!.some((t) => takesEver(r, t))))
}

/**
 * A finger's way over as many of these cells as one drag can take, each next to the one before:
 * from one with the fewest of the others beside it, on each time to the one beside it with the
 * fewest left beside that. The rest wait for the next drag.
 */
function dragOver(cells: readonly number[]): number[] {
  const left = new Set(cells)
  const beside = (c: number) => DIRS.map((d) => NEIGHBOUR[c * 4 + d]!).filter((n) => left.has(n))
  const fewest = (xs: readonly number[]) => [...xs].sort((p, q) => beside(p).length - beside(q).length)[0]
  const way: number[] = []
  for (let c = fewest(cells); c !== undefined; c = fewest(beside(c))) {
    way.push(c)
    left.delete(c)
  }
  return way
}

/** The peel taking building b off the board, everything inside it going where it is wanted: the peel, then two taps on it (the first lifts it). Its cell is the step's. */
const peelOf = (b: Building, sticker: Placeable): Plan => ({ step: { kind: 'free', sticker, cells: [cellOf(b.x, b.y)] }, tool: PEEL, body: [{ kind: 'tap', hit: { kind: 'building', id: b.id } }, { kind: 'tap', hit: { kind: 'building', id: b.id } }] })

/** Building b stands on a spot of the blueprint that is ahead of the land, so a spot of its kind the factory needs now may have it. */
const premature = (look: Look, b: Building) => look.spotOf(b) >= 0 && ahead(look.spotOf(b), look.s.land)

/**
 * Her newest edit, still in Oops's reach, did nothing but lay new belt cells, these loose ones
 * among them and none that carries things to a building that takes them (nor a bubble belt: the
 * hint's own defence lays those): Oops takes exactly that stroke back.
 */
function stray(look: Look, edit: Edit, cells: readonly number[]): boolean {
  const grades = look.grades()
  const laid = new Set(edit.belts.map((b) => b.cell))
  return edit.removed.length === 0 && edit.added.length === 0 && edit.hedges.length === 0 && edit.belts.every((b) => b.before === null && grades[b.cell] !== 1 && look.bubbles()[b.cell] === 0) && cells.every((c) => laid.has(c))
}

/**
 * The next repair toward a goal at a stage, the gentlest that leads on (plans/rocket-factory.md,
 * The one next step). 'gentle': Oops while her newest stroke is nothing but loose belt in its
 * way; the peel over just the loose belts, hedges and stumps in its way; the peel of a machine
 * standing in its way (it goes back to the tray with what it held); with the way clear and none
 * of its kind in the tray, the peel of one standing on a spot whose belts all lead out of the
 * land, so the hint's spot can have it. 'move': the peel of one of its kind standing off the
 * blueprint (the building the goal is to bring there first). 'harsh': the peel over every belt
 * in its way, links of hers too. Each is tried first on a copy of the board against `rule`, the
 * rule asking (leadsOn), so no repair undoes the last.
 */
function repairOf(look: Look, goal: Goal, stage: Stage, rule: Rule): Plan | null {
  const s = look.s
  const found = obstaclesOf(look, goal)
  if (found === null) return null
  const sticker = SPOTS[goal.kind === 'spot' ? goal.spot : goal.belt.from]!.kind
  if (sticker === 'pad') throw new Error('the pad is no sticker to clear a spot for')
  // A spot wants a sticker of its kind to come: one in the tray, else at this stage a machine of its kind to bring (gentle: one standing where it can do nothing yet; move: one off the blueprint, the goal's own first). Without one, clearing the spot leads nowhere yet.
  const left = goal.kind === 'belt' || stickersLeft(s, sticker) > 0
  if (stage === 'move' && left) return null
  const near = (b: Building) => b.kind === sticker && premature(look, b)
  const off = (b: Building) => b.kind === sticker && look.spotOf(b) < 0
  const come = left ? [] : goal.bring !== null ? (stage === 'gentle' ? [] : [goal.bring]) : s.buildings.filter(stage === 'gentle' ? near : stage === 'move' ? off : (b) => near(b) || off(b))
  if (!left && come.length === 0) return null
  const tries: Plan[] = []
  const peel = (cells: readonly number[]) => {
    // A bridge's main lane in the way comes off by a drag of its own along it; the rest of the cells one drag over as many as it can take.
    const lane = cells.find((c) => found.via.has(c))
    const takes = lane === undefined ? dragOver(cells) : [lane]
    const drag = lane === undefined ? takes : [found.via.get(lane)!, lane]
    const plan = planPeelDrag(s, drag)
    if (plan.edit !== null && sameCells(plan.cells, takes)) tries.push({ step: { kind: 'free', sticker, cells: drag }, tool: PEEL, body: [{ kind: 'drag', cells: drag }, { kind: 'release', commit: true }] })
  }
  const clear = found.loose.length === 0 && found.links.length === 0 && found.buildings.length === 0
  if (stage === 'harsh') {
    if (found.links.length > 0) peel([...found.loose, ...found.links])
  } else {
    const u = s.undo[s.undo.length - 1]
    if (u !== undefined && found.loose.length > 0 && stray(look, u.edit, found.loose)) tries.push({ step: { kind: 'oops' }, tool: PENCIL, body: [{ kind: 'oops' }] })
    if (found.loose.length > 0) peel(found.loose)
    for (const b of found.buildings) tries.push(peelOf(b, sticker))
    if (clear) for (const b of come.sort((p, q) => (working(p) ? 1 : 0) - (working(q) ? 1 : 0) || p.id - q.id)) tries.push(peelOf(b, sticker))
  }
  return tries.find((p) => leadsOn(look, p, goal, rule)) ?? null
}

/** How far a repair may go: 'gentle' takes her loose belts, hedges and machines in the way and brings a machine standing where it can do nothing yet; 'move' brings one of hers off the blueprint; 'harsh' takes every belt in the way, her links too. */
type Stage = 'gentle' | 'move' | 'harsh'

/** The cells a plan's script lays a belt on or stands a sticker over, and the kinds it places: its pencil strokes' cells and its stickers' footprints. */
function laysOf(p: Plan): { cells: number[]; kinds: Placeable[] } {
  const cells: number[] = []
  const kinds: Placeable[] = []
  let tool = p.tool
  for (const a of p.body) {
    if (a.kind === 'tool') tool = a.tool
    else if (a.kind === 'drag' && tool.kind === 'pencil') cells.push(...a.cells)
    else if (a.kind === 'hold' && tool.kind === 'sticker') {
      const k = SIZE[tool.sticker]
      cells.push(...footprint({ kind: tool.sticker, x: a.x - k / 2, y: a.y - k / 2 }))
      kinds.push(tool.sticker)
    } else if (a.kind === 'release') tool = PENCIL
  }
  return { cells, kinds }
}

/** The plan is the goal's own step on the board `look` reads: the sticker onto the goal's spot, or a belt between the goal's two buildings for its thing (its planned path, or one round what is left in the way). */
function follows(look: Look, p: Plan, goal: Goal): boolean {
  const st = p.step
  if (goal.kind === 'belt') {
    const from = look.on(goal.belt.from)
    const to = look.on(goal.belt.to)
    return st.kind === 'link' && from !== null && to !== null && st.from === from.id && st.to === to.id && st.thing === goal.belt.thing
  }
  const q = SPOTS[goal.spot]!
  return st.kind === 'place' && st.sticker === q.kind && st.x === q.x && st.y === q.y
}

/**
 * A repair leads on when, done on a copy of the board, `rule` comes next with the goal's own
 * step, one that builds on the repair (buildsOn), or a step that leaves what the repair cleared
 * alone: never with nothing (the repair did no good), and never with a step that takes the
 * cleared cells for something else, which the next repair would clear again (a loop). A look
 * that checks no repairs (the one on such a copy) takes each as it is.
 */
function leadsOn(look: Look, plan: Plan, goal: Goal, rule: Rule): boolean {
  if (!look.checks) return true
  const before = look.s
  const after = cloneState(before)
  const first = plan.body[0]!
  const edit = first.kind === 'oops' ? after.undo.pop()!.inverse : first.kind === 'drag' ? planPeelDrag(after, first.cells).edit! : first.kind === 'tap' && first.hit.kind === 'building' ? planPeelBuilding(after, first.hit.id) : null
  if (edit === null) throw new Error(`a repair does not begin with a ${first.kind}`)
  applyEdit(after, edit)
  const filled = (s: State, c: number) => s.belts.out[c]! >= 0 || s.hedge[c] !== 0 || s.owner[c]! >= 0
  const cleared = new Set<number>()
  for (let c = 0; c < CELLS; c++) if (filled(before, c) && !filled(after, c)) cleared.add(c)
  const ahead = lookAt(after, false, false)
  const next = rule(ahead)
  return next !== null && (follows(ahead, next, goal) || buildsOn(next, edit) || !laysOf(next).cells.some((c) => cleared.has(c)))
}

/** A layout plan that goes on from a repair: another repair, a step of the blueprint's own (its planned belt, a sticker on its spot), or one placing a kind the repair took off. */
function buildsOn(p: Plan, edit: Edit): boolean {
  const st = p.step
  if (st.kind === 'free' || st.kind === 'oops') return true
  if (st.kind === 'link' && PLANNED.some((q) => q.path.length === st.path.length && q.path.every((c, k) => c === st.path[k]))) return true
  if (st.kind === 'place' && SPOTS.some((q) => q.kind === st.sticker && q.x === st.x && q.y === st.y)) return true
  return laysOf(p).kinds.some((k) => edit.removed.some((r) => r.kind === k))
}

// ---------------------------------------------------------------------------------------
// The rules, in rank order

/** At Good night the kind in its nightcap: her tap on one of its machines tucks them all in. None while the kind has none awake (its last was peeled a moment ago: the night moves on at the next step). */
function tuckSteps(look: Look): Ranked[] {
  const night = look.s.night
  const machine = night === null ? null : night.kind
  const awake = machine === null ? undefined : look.s.buildings.find((b) => b.kind === machine && !b.tucked)
  return machine === null || awake === undefined ? [] : [{ step: { kind: 'tuck', machine }, script: tapOn(look.s, { kind: 'building', id: awake.id }) }]
}

function cardSteps(look: Look): Ranked[] {
  return look.s.card !== null && look.s.cardWaits ? [{ step: { kind: 'card' }, script: [{ kind: 'card' }] }] : []
}

/** The rocket ready on its pad: her tap on the pad launches it. */
function launchSteps(look: Look): Ranked[] {
  const pad = look.s.buildings.find((b) => b.kind === 'pad')!
  return launchReady(look.s) ? [{ step: { kind: 'launch' }, script: tapOn(look.s, { kind: 'building', id: pad.id }) }] : []
}

/** 1. Munchers sitting or napping that no tower with suds can reach (none already caught or under a shot), nappers first; and the scout from the moment it walks. */
function muncherSteps(look: Look): Ranked[] {
  const s = look.s
  const towers = s.buildings.filter((b) => b.kind === 'tower' && b.ammo > 0).map((b) => cellOf(b.x, b.y))
  const rank = { nap: 0, sit: 1, walk: 2 } as const
  return s.munchers
    .filter((m) => (m.mode === 'nap' || m.mode === 'sit' || (m.scout && m.mode === 'walk')) && m.shotBy === -1 && !s.tickles.includes(m.id) && !towers.some((t) => dist2(t, m.cell) <= TOWER_REACH2))
    .sort((a, b) => rank[a.mode as keyof typeof rank] - rank[b.mode as keyof typeof rank] || a.id - b.id)
    .map((m) => ({ step: { kind: 'muncher', id: m.id }, script: [{ kind: 'tickle', id: m.id }] }))
}

/** 2. Oops, while her newest edit broke something and is less than OOPS_HINT old, unless it is one a repair of the hint's makes (asked): Oops would undo the way back to the blueprint. */
function oopsSteps(look: Look): Ranked[] {
  const s = look.s
  const u = s.undo[s.undo.length - 1]
  return u !== undefined && u.broke && s.tick - u.at < OOPS_HINT && !asked(u.edit, s.land) ? [{ step: { kind: 'oops' }, script: [{ kind: 'oops' }] }] : []
}

function flapSteps(look: Look): Ranked[] {
  return look.s.flap !== 0 ? [{ step: { kind: 'flap' }, script: tapOn(look.s, { kind: 'flap' }) }] : []
}

/** What a New! sticker is for: a digger the rock fewer diggers dig (the first on a tie), the lab bottles, a tower bubbles, a bowl gold bars, every other maker what it makes. */
function newThing(s: State, kind: Placeable): Thing {
  const rocks = Object.keys(BAKES) as Thing[]
  const dug = (rock: Thing) => s.buildings.filter((b) => b.kind === 'digger' && gives(b).includes(rock)).length
  switch (kind) {
    case 'digger':
      return rocks.reduce((a, b) => (dug(b) < dug(a) ? b : a))
    case 'lab':
      return BOTTLES[0]
    case 'tower':
      return 'bubble'
    case 'bowl':
      return 'goldBar'
    case 'oven':
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
    case 'pump':
      return productsOf(kind, rocks[0]!)[0]!
  }
}

/** New! stickers in the order they are offered: what a line ends in before what feeds it, so each new machine goes down beside what it will feed. */
const NEW_ORDER: readonly Placeable[] = ['lab', 'orangeMaker', 'greenMaker', 'workshop', 'oven', 'digger', 'pump', 'tower', 'bowl']
if (NEW_ORDER.length !== PLACEABLE.length || PLACEABLE.some((k) => !NEW_ORDER.includes(k))) throw new Error('every sticker kind has its place in NEW_ORDER')

/**
 * 3. A New! sticker (a kind she has never placed) on a good spot: a machine on the
 * blueprint's spot for it, or the repair that clears the spot (stickerStep); a tower or a bowl
 * on the blueprint's first spot for it with the belt that feeds it drawn first, the hedge (new
 * while hedges came and none stands) along the blueprint's first hedge line; with no good
 * spot for any, the peel over loose belts that frees one, and last the peel over the belts of
 * hers on the blueprint's spot.
 */
function placeSteps(look: Look): Ranked[] {
  const plan = newPlan(look)
  return plan === null ? [] : [use(look.s, plan)]
}
/** The plans of rule 3 and rule 6, kept in s.hintMemo: besides the board they read her newest edit (Oops is a repair while it is in reach). */
const newPlan = (look: Look) => remembered(look, 'place', undoKey(look.s), () => newSticker(look))
const chainPlan = (look: Look) => remembered(look, 'chain', undoKey(look.s), () => chainStep(look))
const undoKey = (s: State) => String(s.undo.length === 0 ? -1 : s.undo[s.undo.length - 1]!.at)
function newSticker(look: Look): Plan | null {
  const s = look.s
  const fresh = NEW_ORDER.filter((k) => s.help.placed[k] === 0 && stickersLeft(s, k) > 0).map((k): Need => ({ sticker: k, thing: newThing(s, k), to: null }))
  for (const need of fresh) {
    const plan = onBelt(need.sticker) ? (plannedDefence(look, need.sticker, () => true) ?? placeStep(look, need)) : stickerStep(look, need, newSticker)
    if (plan !== null) return plan
  }
  if (stickersLeft(s, 'hedge') > 0 && s.hedge.every((h) => h === 0)) {
    const plan = plannedHedge(look, () => true)
    if (plan !== null) return plan
  }
  for (const need of fresh) {
    const plan = freeStep(look, need) ?? (onBelt(need.sticker) ? null : harshStickerStep(look, need, newSticker))
    if (plan !== null) return plan
  }
  return null
}

/** A belt into b's mouth (a hump's too) has stood full for BOTTLENECK_WAIT: the things behind it wait for b. */
function fullBehind(s: State, b: Building): boolean {
  return s.net.mouths.get(b.id)!.some((x) => s.belts.blockedSince[x >> 1]! >= 0 && s.tick - s.belts.blockedSince[x >> 1]! >= BOTTLENECK_WAIT)
}

/**
 * 4. The bottleneck: while the lab or the pad still wants things, the machine feeding it
 * (however far upstream) that was busy BUSY_SHARE of the last seconds with a belt into it
 * standing full BOTTLENECK_WAIT; the most upstream one. For an oven, a second belt out of
 * another oven with bars to spare comes before one more oven; else one more of its kind while
 * a sticker is left, beside it.
 */
function bottleneckSteps(look: Look): Ranked[] {
  const s = look.s
  const flow = look.flow()
  const need = labNeed(s)
  const sinks = s.buildings.filter((b) => (b.kind === 'lab' && need[0] + need[1] > 0) || (b.kind === 'pad' && openParts(s).length > 0))
  let slow: { b: Building; depth: number } | null = null
  for (const sink of sinks) {
    const depth = new Map([[sink.id, 0]])
    for (const todo = [sink.id]; todo.length > 0; ) {
      const id = todo.shift()!
      for (const u of flow.from.get(id)!) {
        if (depth.has(u)) continue
        depth.set(u, depth.get(id)! + 1)
        todo.push(u)
      }
    }
    for (const [id, d] of depth) {
      const b = look.byId(id)
      if (!isTaker(b.kind) || popcount(b.busyBits) < BUSY_SHARE || !fullBehind(s, b)) continue
      if (slow === null || d > slow.depth || (d === slow.depth && b.id < slow.b.id)) slow = { b, depth: d }
    }
  }
  if (slow === null) return []
  const m = slow.b
  if (m.kind === 'oven') {
    const ledger = look.ledger()
    for (const id of flow.to.get(m.id)!) {
      const taker = look.byId(id)
      for (const bar of flow.gives.get(m.id)!) {
        if (demandOf(s, taker.kind, bar) <= 0) continue
        for (const o of s.buildings) {
          if (o.kind !== 'oven' || o.id === m.id || flow.to.get(o.id)!.includes(taker.id) || (ledger.spare.get(`${o.id}:${bar}`) ?? 0) <= 0) continue
          const second = linkStep(look, o, taker, bar, false) ?? acrossStep(look, o, taker, bar)
          if (second !== null) return [use(s, second)]
        }
      }
    }
  }
  const kind = m.kind
  if (!isTaker(kind) || stickersLeft(s, kind) <= 0) return []
  const spot = spotFor(look, { sticker: kind, thing: flow.gives.get(m.id)![0]!, to: null }, { feeders: flow.from.get(m.id)!.map(look.byId), takers: flow.to.get(m.id)!.map(look.byId) })
  return spot === null ? [] : [use(s, placePlan({ kind: 'bottleneck', id: m.id, sticker: kind, x: spot.x, y: spot.y }, kind, spot.x, spot.y))]
}
/** The machines that take things in, and so can hold a line up. */
const isTaker = (k: Kind): k is 'oven' | 'workshop' | 'greenMaker' | 'orangeMaker' => k === 'oven' || k === 'workshop' || k === 'greenMaker' || k === 'orangeMaker'

/**
 * A maker whose full stack has had no way out for BLOCKED_HINT (every belt out of it full at
 * its spout) while something on it is wanted on its own line, where Beep's carry takes it
 * (beep.ts whereFromStack: a stack stands because its line is backed up, and another line's
 * machine would choke on its things), or, with nothing on it wanted there, an oven whose belts
 * lead to a machine that wants a bar a rock waiting in it would bake and that no other building
 * gives (blue bars on the gold oven's roof, from blue rocks that came by hand, while the green
 * maker full of blue bars waits for gold): Beep carries them there, or into the basket. A
 * maker with no belt out is missing a link (rule 6), and so is one rule 6 draws a link out of
 * now (the pump's full stack, its bubble line full, while the orange maker waits for its bubble
 * belt): Beep's carry would only fill the stack again. Skipped, as the plan says, when its only
 * belt out leads to a full rocket part or to bare ground (where a sticker still to come will
 * stand), through the machines on the way (lineDone): the digger of an oven that fed the full
 * nose waits with it. Skipped too when Beep would carry something into a building of the
 * blueprint's that the blueprint feeds no such thing (her belt from the gold digger into the
 * start oven, whose gold bars the blue line would choke on).
 */
function stuck(look: Look, b: Building): boolean {
  const s = look.s
  if (!isMaker(b.kind) || b.napper !== -1 || b.stack.length < STACK || s.tick - Math.max(b.pushAt, b.placedAt) < BLOCKED_HINT) return false
  const spouts = s.net.spouts.get(b.id)!
  if (spouts.length === 0 || spouts.some((x) => s.belts.slot[x]! < 0)) return false
  const link = chainPlan(look)?.step
  if (link !== undefined && link.kind === 'link' && link.from === b.id) return false
  const flow = look.flow()
  const next = (bar: Thing) => flow.to.get(b.id)!.some((id) => wants(s, look.byId(id), bar) && flow.from.get(id)!.every((f) => f === b.id || !flow.gives.get(f)!.includes(bar)))
  const carried = b.stack.map((t) => ({ t, to: whereFromStack(s, b, t) }))
  if (!carried.some((c) => c.to !== null) && !b.queue.some((rock) => next(BAKES[rock]!))) return false
  const astray = (c: { t: Thing; to: Building | null }) => {
    const j = c.to === null ? -1 : look.spotOf(c.to)
    return j >= 0 && !PLANNED.some((p) => p.to === j && p.thing === c.t)
  }
  return !carried.some(astray) && (spouts.length > 1 || !lineDone(look, b, new Set()))
}

/** Every line out of building b stands because its work is done: it ends on bare ground, at the rocket for parts that take none of what b gives, or at machines whose own lines are done in the same way (`seen` the machines walked already). A line into the lab is never done. */
function lineDone(look: Look, b: Building, seen: Set<number>): boolean {
  const s = look.s
  seen.add(b.id)
  return downstream(s, s.net.spouts.get(b.id)!, null).every((id) => {
    const r = look.byId(id)
    if (r.kind === 'pad') return look.flow().gives.get(b.id)!.every((t) => openPart(s, t) < 0)
    return r.kind !== 'lab' && (seen.has(id) || lineDone(look, r, seen))
  })
}

/**
 * 5. Things blocking a starved machine for BLOCKED_HINT (the longest first), each one that came
 * over a link that joined the wrong line as the peel of that link (wrongRun); then a thing its
 * machine does not take now standing at a mouth as long (a bridge's hump tells its time too),
 * while a building up the belt behind it makes what the machine does take now (blue bars left
 * on the orange maker's belt into the pad once the legs are full: no blocker, for nothing it
 * wants is on the belt, which the thing holds up; gears left on the orange maker's hump once
 * the body and the nose are full); then full stacks with no way out.
 */
function blockedSteps(look: Look): Ranked[] {
  const s = look.s
  const out: Ranked[] = []
  const unblock = (slot: number): Ranked => ({ step: { kind: 'unblock', slot }, script: tapOn(s, { kind: 'thing', slot }) })
  for (const bl of blockers(s)) {
    const b = look.byId(bl.building)
    if (s.tick - bl.since < BLOCKED_HINT || !(b.kind === 'pad' || (b.starvedBits & 1) === 1)) continue
    out.push(wrongRun(look, bl) ?? unblock(bl.slot))
  }
  for (const b of s.buildings) {
    if (!hasMouths(b)) continue
    for (const x of s.net.mouths.get(b.id)!) {
      const since = s.belts.blockedSince[x >> 1]!
      if (since < 0 || s.tick - since < BLOCKED_HINT || s.belts.slot[x]! < 0 || wants(s, b, THINGS[s.belts.slot[x]!]!) || out.some((r) => r.step.kind === 'unblock' && r.step.slot === x)) continue
      const up = walkUp(s, [x])
      if (s.buildings.some((f) => look.flow().gives.get(f.id)!.some((t) => wants(s, b, t)) && s.net.spouts.get(f.id)!.some((y) => up.has(y)))) out.push(unblock(x))
    }
  }
  for (const b of s.buildings) if (stuck(look, b)) out.push({ step: { kind: 'stack', id: b.id }, script: tapOn(s, { kind: 'stack', id: b.id }) })
  return out
}

/**
 * The peel of the belt that brought a blocker its machine never takes (a link that joined the
 * wrong line): the cells a repair may take gently (gradesOf) first met up the lanes from the
 * mouth, on up that belt's own lane to where it leaves its source. Null when the machine takes
 * such a thing at other times, or no such belt brought it.
 */
function wrongRun(look: Look, bl: Blocker): Ranked | null {
  const s = look.s
  const thing = THINGS[s.belts.slot[bl.slot]!]!
  if (everWants(look.byId(bl.building).kind, thing)) return null
  const grades = look.grades()
  const gentle = (x: number) => grades[slotCell(x)] === 0
  const { preds } = s.net
  let start = -1
  const seen = new Set<number>()
  for (const todo = [bl.slot]; todo.length > 0 && start < 0; ) {
    const x = todo.shift()!
    if (seen.has(x)) continue
    seen.add(x)
    if (gentle(x)) start = x
    else for (let k = 0; k < PRED; k++) if (preds[PRED * x + k]! >= 0) todo.push(preds[PRED * x + k]!)
  }
  if (start < 0) return null
  const up: number[] = []
  for (let x = start; x >= 0 && gentle(x); x = preds[PRED * x]!) {
    if (up.includes(slotCell(x)) && up[up.length - 1] !== slotCell(x)) break
    if (up[up.length - 1] !== slotCell(x)) up.push(slotCell(x))
  }
  const cells = up.reverse()
  const plan = planPeelDrag(s, cells)
  if (plan.edit === null || !sameCells(plan.cells, cells)) return null
  const source = s.buildings.find((b) => s.net.spouts.get(b.id)!.some((x) => slotCell(x) === cells[0]))
  const sticker = source !== undefined && source.kind !== 'pad' ? source.kind : MAKER[thing]
  return use(s, { step: { kind: 'free', sticker, cells }, tool: PEEL, body: [{ kind: 'drag', cells }, { kind: 'release', commit: true }] })
}

/** 6. The first missing link of the chain a belt can be drawn for, or the sticker it needs on a good spot (chainStep). */
function linkSteps(look: Look): Ranked[] {
  const plan = chainPlan(look)
  return plan === null ? [] : [use(look.s, plan)]
}

/** The cell a tower stands on. */
const towerCell = (b: Building) => cellOf(b.x, b.y)
/** A tower with suds in it, or with bubbles riding to it. */
const armed = (look: Look, b: Building) => b.kind === 'tower' && (b.ammo > 0 || look.bubbles()[towerCell(b)] === 1)
/** Some cell of the way passes within a tower's reach of cell t. */
const passes = (way: readonly number[], t: number) => way.some((c) => dist2(c, t) <= TOWER_REACH2)

/** How many towers or hedge spots the defence tries against the munchers' recomputed way, at most: each try plays the edit on a copy of the board. */
const DEFENCE_TRIES = 4

/** After these strokes and this edit on a copy of the board, burrow i's munchers' way would pass within a tower's reach of one of the cells in `guards`. */
function wouldPass(s: State, burrow: number, strokes: readonly (readonly number[])[], place: { sticker: Placeable; x: number; y: number } | null, hedges: readonly number[] | null, guards: readonly number[]): boolean {
  const after = cloneState(s)
  for (const cells of strokes) {
    const plan = planStroke(after, cells, cells)
    if (plan.edit === null) return false
    applyEdit(after, plan.edit)
  }
  if (place !== null) {
    const plan = planPlace(after, place.sticker, place.x + 0.5, place.y + 0.5, { x: place.x, y: place.y })
    if (!plan.ok || plan.edit === null) return false
    applyEdit(after, plan.edit)
  }
  if (hedges !== null) {
    const plan = planHedge(after, hedges)
    if (plan.edit === null) return false
    applyEdit(after, plan.edit)
  }
  const way = pawsOf(after, burrow)
  return guards.some((t) => passes(way, t))
}

/**
 * A tower for burrow i's munchers: on a belt bubbles already ride within reach of their paw
 * prints, else at the end of a new bubble belt from the pump to a free cell within reach;
 * only where their way, recomputed with the tower standing, still passes within its reach.
 */
function towerStep(look: Look, burrow: number, trail: readonly number[]): Plan | null {
  const s = look.s
  if (stickersLeft(s, 'tower') <= 0) return null
  const reach = (c: number) => trail.some((t) => dist2(c, t) <= TOWER_REACH2)
  const near = (c: number) => Math.min(...trail.map((t) => dist2(c, t)))
  const onBelt: number[] = []
  for (let c = 0; c < CELLS; c++) if (look.bubbles()[c] === 1 && s.owner[c]! < 0 && s.belts.fork[c]! < 0 && s.belts.over[c]! < 0 && rockOf(c) === null && reach(c)) onBelt.push(c)
  onBelt.sort((a, b) => near(a) - near(b) || a - b)
  for (const c of onBelt.filter((c) => fits(s, 'tower', xOf(c), yOf(c))).slice(0, DEFENCE_TRIES)) {
    const place = { sticker: 'tower' as const, x: xOf(c), y: yOf(c) }
    if (wouldPass(s, burrow, [], place, null, [c])) return placePlan({ kind: 'defend', sticker: 'tower', cells: [], x: place.x, y: place.y }, 'tower', place.x, place.y)
  }
  const pump = s.buildings.find((b) => b.kind === 'pump')
  if (pump === undefined) return null
  const ends = new Set<number>()
  for (let c = 0; c < CELLS; c++) if (freeCell(s, c) && rockOf(c) === null && !PAD_RING.has(c) && reach(c)) ends.add(c)
  for (let k = 0; k < DEFENCE_TRIES && ends.size > 0; k++) {
    // Off the plan the bubble belt keeps round the blueprint's open spots and belts: a tower that took the orange maker's cells would cost the factory more than the munchers do.
    const path = route(s, pump, { kind: 'ground', cells: ends }, [], look.reserve(), ANYWAY)?.path ?? null
    if (path === null) return null
    const end = path[path.length - 1]!
    ends.delete(end)
    const strokes = strokesOf(s, path, ['none', 'hump'])
    const place = { sticker: 'tower' as const, x: xOf(end), y: yOf(end) }
    if (strokes === null || !wouldPass(s, burrow, strokes, place, null, [end])) continue
    return {
      step: { kind: 'defend', sticker: 'tower', cells: path, x: place.x, y: place.y },
      tool: PENCIL,
      body: [...strokesBody(strokes), { kind: 'tool', tool: stickerTool('tower') }, ...holdAt('tower', place.x, place.y)],
    }
  }
  return null
}

/** A hedge line across burrow i's paw prints, three cells wide, where their way recomputed round it would pass within reach of a tower that can shoot. */
function hedgeStep(look: Look, burrow: number, trail: readonly number[]): Plan | null {
  const s = look.s
  if (stickersLeft(s, 'hedge') <= 0) return null
  const guards = s.buildings.filter((b) => armed(look, b)).map(towerCell)
  if (guards.length === 0) return null
  let tries = 0
  for (let i = 1; i < trail.length && tries < DEFENCE_TRIES; i++) {
    const c = trail[i]!
    if (Math.abs(xOf(c) - xOf(trail[i - 1]!)) + Math.abs(yOf(c) - yOf(trail[i - 1]!)) !== 1) continue
    const d = dirTo(trail[i - 1]!, c)
    const line = [stepCell(c, ((d + 1) % 4) as Dir), c, stepCell(c, ((d + 3) % 4) as Dir)].filter((x) => x >= 0)
    const plan = planHedge(s, line)
    if (!plan.cells.includes(c)) continue
    tries++
    if (wouldPass(s, burrow, [], null, line, guards)) return { step: { kind: 'defend', sticker: 'hedge', cells: plan.cells, x: xOf(c), y: yOf(c) }, tool: HEDGE, body: [{ kind: 'drag', cells: line }, { kind: 'release', commit: true }] }
  }
  return null
}

/**
 * An empty tower no bubbles ride to while a burrow's face leans out (its visit is near): a
 * bubble belt from the pump joining the tower's belt upstream of it, or feeding its tail.
 */
function refillStep(look: Look): Ranked | null {
  const s = look.s
  if (s.visit !== null || !s.burrows.some((b, i) => inLand(s.land, BURROWS[i]!.x, BURROWS[i]!.y) && b.hunger >= STAGE_AT[2] && b.sleepUntil < s.tick)) return null
  const pump = s.buildings.find((b) => b.kind === 'pump')
  if (pump === undefined) return null
  for (const t of s.buildings) {
    if (t.kind !== 'tower' || t.ammo > 0 || look.bubbles()[towerCell(t)] === 1) continue
    // The tower's belt back up from it to where it starts.
    const run = new Set<number>()
    for (let x = inSlot(towerCell(t)); x >= 0 && !run.has(x >> 1); ) {
      run.add(x >> 1)
      const p = s.net.preds[PRED * x]!
      x = p < 0 || p >= OVER ? -1 : p - 1
    }
    const path = routeAround(look, pump, { kind: 'belt', cells: run })?.path ?? null
    const strokes = path === null ? null : strokesOf(s, path, ['zip', 'feed'])
    if (strokes !== null) return use(s, { step: { kind: 'refill', id: t.id }, tool: PENCIL, body: strokesBody(strokes) })
  }
  return null
}

/** A belt of the blueprint lies on the board: every cell of it past its first spot is a belt. */
const laid = (s: State, p: Planned) => p.path.every((c, k) => k === 0 || s.belts.out[c]! >= 0)

/**
 * The blueprint's tower or bowl on spot i with what feeds it: each of its belts (FEED) not on
 * the board yet, from the building standing on its first spot or on from the tower before it,
 * then the sticker held over its cell ('defend'; a 'place' when its belts lie already). Worked
 * out on a copy of the board, which comes back with the plan for the checks that read the
 * board after it. Null when a belt cannot be laid now (its first spot has no building yet, it
 * runs into closed land, or the planner would lay something else) or the sticker would not
 * stand there.
 */
function defencePlan(look: Look, i: number): { plan: Plan; after: State } | null {
  const s = look.s
  const spot = SPOTS[i]!
  if (!onBelt(spot.kind)) throw new Error(`the blueprint's spot ${i} is no tower or bowl`)
  const sticker = spot.kind
  const after = cloneState(s)
  const strokes: number[][] = []
  const cells: number[] = []
  for (const p of FEED.get(i)!) {
    if (laid(after, p)) continue
    if ((!onBelt(SPOTS[p.from]!.kind) && look.on(p.from) === null) || p.path.some((c) => !cellInLand(s.land, c))) return null
    const these = plannedStrokes(after, p.path, ['none', 'hump'])
    if (these === null) return null
    for (const cs of these) applyEdit(after, planStroke(after, cs, cs).edit!)
    strokes.push(...these)
    // The finger's way from the cell it starts on, as a link's path: a stroke that starts and ends where it does lays it (layout.ts hintPath).
    cells.push(...(cells.length === 0 ? p.path : p.path.slice(1)))
  }
  const place = planPlace(after, sticker, spot.x + 0.5, spot.y + 0.5, { x: spot.x, y: spot.y })
  if (!place.ok || place.x !== spot.x || place.y !== spot.y) return null
  applyEdit(after, place.edit!)
  if (strokes.length === 0) return { plan: placePlan({ kind: 'place', sticker, x: spot.x, y: spot.y }, sticker, spot.x, spot.y), after }
  return { plan: { step: { kind: 'defend', sticker, cells, x: spot.x, y: spot.y }, tool: PENCIL, body: [...strokesBody(strokes), { kind: 'tool', tool: stickerTool(sticker) }, ...holdAt(sticker, spot.x, spot.y)] }, after }
}

/** The blueprint's first open spot in the land for a tower or a bowl that can be built now and that `ok` accepts (with the board after it), while a sticker of its kind is left. */
function plannedDefence(look: Look, sticker: 'tower' | 'bowl', ok: (i: number, after: State) => boolean): Plan | null {
  const s = look.s
  if (stickersLeft(s, sticker) <= 0) return null
  for (const i of look.spots()) {
    const p = SPOTS[i]!
    if (p.kind !== sticker || !cellInLand(s.land, cellOf(p.x, p.y))) continue
    const found = defencePlan(look, i)
    if (found !== null && ok(i, found.after)) return found.plan
  }
  return null
}

/** The blueprint's first hedge line in the land with a hedge still to plant that `ok` accepts, while hedge stickers last: the hedge tool drawn along it. */
function plannedHedge(look: Look, ok: (line: (typeof HEDGE_LINES)[number]) => boolean): Plan | null {
  const s = look.s
  if (stickersLeft(s, 'hedge') <= 0) return null
  for (const line of HEDGE_LINES) {
    if (line.cells.some((c) => !cellInLand(s.land, c)) || !ok(line)) continue
    const plan = planHedge(s, line.cells)
    if (plan.edit !== null) return { step: { kind: 'defend', sticker: 'hedge', cells: plan.cells, x: xOf(line.cells[0]!), y: yOf(line.cells[0]!) }, tool: HEDGE, body: [{ kind: 'drag', cells: [...line.cells] }, { kind: 'release', commit: true }] }
  }
  return null
}

/** The blueprint still has defence to build in the land: an open tower or bowl spot with a sticker of its kind left, or a hedge line with a cell still to plant while hedge stickers last. */
function defenceLeft(look: Look): boolean {
  const s = look.s
  const open = (i: number) => {
    const p = SPOTS[i]!
    return onBelt(p.kind) && cellInLand(s.land, cellOf(p.x, p.y)) && stickersLeft(s, p.kind) > 0
  }
  return look.spots().some(open) || HEDGE_LINES.some((l) => l.cells.every((c) => cellInLand(s.land, c)) && planHedge(s, l.cells).edit !== null)
}

/** After planting these hedges on a copy of the board, burrow i's munchers reach nothing without nibbling: the fence holds them at its door, where a tickle or a tower gets them. */
function holds(s: State, burrow: number, hedges: readonly number[]): boolean {
  const after = cloneState(s)
  const plan = planHedge(after, hedges)
  if (plan.edit === null) return false
  applyEdit(after, plan.edit)
  return pawsOf(after, burrow).some((c) => after.hedge[c] !== 0)
}

/**
 * A defence for burrow i, whose munchers' way (`trail`) passes no tower that can shoot
 * (`guards`): the blueprint's open tower spot their way passes within reach of once it stands,
 * else a hedge line of the blueprint for the burrow that turns their way past a tower that can
 * shoot, else the blueprint's bowl on their flowers, else its hedge line that holds them at the
 * door (a burrow no bubble line or gold belt reaches); and when they got away with things
 * (`kept`) on a board the blueprint does not fit, a tower or a hedge line found on the trail
 * itself.
 */
function defenceFor(look: Look, i: number, trail: readonly number[], guards: readonly number[], kept: boolean): Plan | null {
  return (
    plannedDefence(look, 'tower', (j, after) => passes(pawsOf(after, i), cellOf(SPOTS[j]!.x, SPOTS[j]!.y))) ??
    (guards.length === 0 ? null : plannedHedge(look, (line) => line.burrow === i && wouldPass(look.s, i, [], null, line.cells, guards))) ??
    plannedDefence(look, 'bowl', (j) => FLOWER_OF[cellOf(SPOTS[j]!.x, SPOTS[j]!.y)] === i) ??
    plannedHedge(look, (line) => line.burrow === i && holds(look.s, i, line.cells)) ??
    (kept ? (towerStep(look, i, trail) ?? hedgeStep(look, i, trail)) : null)
  )
}

/**
 * 7. An empty tower to refill, then a defence for the first burrow in the land whose way passes
 * no tower that can shoot, once its munchers have come out (the need before the tool: the
 * blueprint's defence for it) and again whenever they got away with DEFEND_KEPT things.
 */
function defendSteps(look: Look): Ranked[] {
  const s = look.s
  const out: Ranked[] = []
  const refill = refillStep(look)
  if (refill !== null) out.push(refill)
  if (s.visit !== null) return out
  const left = defenceLeft(look)
  for (let i = 0; i < s.burrows.length; i++) {
    const site = BURROWS[i]!
    const kept = total(s.burrows[i]!.heap) >= DEFEND_KEPT
    if (!inLand(s.land, site.x, site.y) || (!kept && (s.burrows[i]!.visits === 0 || !left))) continue
    const trail = pawsOf(s, i)
    const guards = s.buildings.filter((b) => armed(look, b)).map(towerCell)
    if (trail.length === 0 || guards.some((t) => passes(trail, t))) continue
    // Each tower or hedge line tried is played on a copy of the board, so the defence is kept while the board, the trail and the towers that can shoot stay the same. The munchers' way recomputed on the copy also reads what they would go for, which can change under the same trail: the kept defence is then one that may no longer turn them, never an edit that does not apply.
    const plan = remembered(look, `defend ${i}`, `${guards.join(',')} ${trail.join(',')} ${kept}`, () => defenceFor(look, i, trail, guards, kept))
    if (plan !== null) {
      out.push(use(s, plan))
      break
    }
  }
  return out
}

/** 8. Heaps of HEAP_HINT or more, then the basket while it holds something wanted. */
function heapSteps(look: Look): Ranked[] {
  const s = look.s
  const out: Ranked[] = []
  s.burrows.forEach((b, i) => {
    if (total(b.heap) >= HEAP_HINT) out.push({ step: { kind: 'heap', burrow: i }, script: tapOn(s, { kind: 'heap', burrow: i }) })
  })
  if (THINGS.some((t, i) => s.basket[i]! > 0 && whereWanted(s, t, basketPoint) !== null)) out.push({ step: { kind: 'basket' }, script: tapOn(s, { kind: 'basket' }) })
  return out
}

/** The choice card's two pictures while the lab's one choice waits: the hint, and so the scripted children, pick Bubbles!. */
function chooseSteps(look: Look): Ranked[] {
  return choiceWaits(look.s) ? [{ step: { kind: 'choose' }, script: [{ kind: 'choose', card: 'bubbles' }] }] : []
}

/** 9. Beep points at the rocket (beep.ts restBeep flies it there, with no hand): a tap on the pad shows what it wants. */
function rocketStep(look: Look): Ranked {
  const pad = look.s.buildings.find((b) => b.kind === 'pad')!
  return { step: { kind: 'rocket' }, script: tapOn(look.s, { kind: 'building', id: pad.id }) }
}

const RULES: readonly ((look: Look) => Ranked[])[] = [cardSteps, launchSteps, muncherSteps, oopsSteps, flapSteps, placeSteps, bottleneckSteps, blockedSteps, linkSteps, defendSteps, heapSteps]

/** The ranked steps one rule at a time, so a caller that needs only the first stops the searches there. */
function* ranked(s: State, writes: boolean): Generator<Ranked> {
  if (s.launch !== null) return
  const look = lookAt(s, writes, true)
  if (s.night !== null) {
    yield* tuckSteps(look)
    return
  }
  // While the choice waits its card covers the board (hud.ts choiceCard), a card that waits for her tap aside: its two pictures are the step, and nothing bounces behind it.
  if (choiceWaits(s)) {
    yield* cardSteps(look)
    yield* chooseSteps(look)
    return
  }
  let any = false
  for (const rule of RULES)
    for (const r of rule(look)) {
      any = true
      yield r
    }
  if (!any) yield rocketStep(look)
}

/** Every step she could take now, the one that should bounce first (the file comment has the ranks), each with the actions that do it. */
export function nextSteps(s: State): Ranked[] {
  return [...ranked(s, false)]
}

/** The first of nextSteps, its searches stopped there: what a scripted child does next. */
export function firstStep(s: State): Ranked | null {
  for (const r of ranked(s, false)) return r
  return null
}

/**
 * The key of everything the layout rules read from the board: the land, the cards found and
 * the choice, the launches, the stickers she has placed and her links counted, which bottles
 * the lab and which parts the rocket take now, whether the start oven has baked its first bar
 * (unbaked), and every belt cell, hedge and building. Two
 * 32-bit hashes of them: a sticker or a link kept under the same key is the one the rules
 * would find again (the defence reads more, which it keeps beside its plan: remembered).
 */
function boardKey(s: State): string {
  let a = 0x811c9dc5 | 0
  let b = 0x1234567
  const mix = (v: number) => {
    a = Math.imul(a ^ v, 0x01000193)
    b = Math.imul(b + v, 0x5bd1e995) ^ (b >>> 15)
  }
  mix(s.land)
  mix(s.launches)
  mix(s.choice === null ? 0 : s.choice === 'bubbles' ? 1 : 2)
  for (const id of s.found) mix(CARDS.indexOf(id) + 1)
  for (const k of PLACEABLE) mix(s.help.placed[k] + 100)
  for (const k of Object.keys(s.help.links).sort()) {
    for (let i = 0; i < k.length; i++) mix(k.charCodeAt(i))
    mix(s.help.links[k]!)
  }
  const need = labNeed(s)
  mix(need[0] > 0 ? 7 : 8)
  mix(need[1] > 0 ? 7 : 8)
  for (const part of openParts(s)) mix(PARTS.indexOf(part) + 200)
  mix(unbaked(s) === null ? 9 : 10)
  const { in: ins, out, fork, over } = s.belts
  const n = CELLS
  for (let c = 0; c < n; c++) {
    mix(out[c]! + 2)
    if (out[c]! >= 0) mix(ins[c]! * 25 + (fork[c]! + 1) * 5 + over[c]! + 1)
    mix(s.hedge[c]! + 300)
  }
  for (const bd of s.buildings) mix(((bd.id * 16 + KINDS.indexOf(bd.kind)) * 32 + bd.x) * 16 + bd.y)
  return `${a >>> 0}:${b >>> 0}`
}

/**
 * A layout rule's plan, kept in s.hintMemo under the board's key with what else the rule read
 * (`also`, empty for a rule that reads only what the key holds): worked out again only when
 * either changes. Only stepHint's look keeps it; a rule keeps one plan, so the memo stays small.
 */
function remembered(look: Look, rule: string, also: string, work: () => Plan | null): Plan | null {
  const s = look.s
  const kept = s.hintMemo !== null && s.hintMemo.key === look.key() ? s.hintMemo.rules[rule] : undefined
  if (kept !== undefined && kept.also === also) return kept.plan
  const plan = work()
  if (look.writes) {
    if (s.hintMemo === null || s.hintMemo.key !== look.key()) s.hintMemo = { key: look.key(), rules: {} } satisfies HintMemo
    s.hintMemo.rules[rule] = { also, plan }
  }
  return plan
}

// ---------------------------------------------------------------------------------------
// The step that bounces, the hand, and her own links

/** What makes two steps the same step while the board changes under it: the same muncher, the same sticker, the same link, and so on. */
function stepKey(step: Step): string {
  switch (step.kind) {
    case 'muncher':
      return `muncher ${step.id}`
    case 'place':
    case 'free':
      return `${step.kind} ${step.sticker}`
    case 'bottleneck':
      return `bottleneck ${step.id} ${step.sticker}`
    case 'unblock':
      return `unblock ${step.slot}`
    case 'stack':
    case 'refill':
      return `${step.kind} ${step.id}`
    case 'link':
      return `link ${step.from} ${step.to} ${step.thing}`
    case 'dig':
      return `dig ${step.cell}`
    case 'defend':
      return `defend ${step.sticker} ${step.x} ${step.y}`
    case 'heap':
      return `heap ${step.burrow}`
    case 'tuck':
      return `tuck ${step.machine}`
    case 'oops':
    case 'basket':
    case 'choose':
    case 'flap':
    case 'launch':
    case 'card':
    case 'rocket':
      return step.kind
  }
}
export const sameStep = (a: Step, b: Step) => stepKey(a) === stepKey(b)

/**
 * Every HINT_EVERY ticks (rules.step): counts the links she laid since the last look, picks
 * the step that bounces and times the hand. A step that bounces keeps bouncing at least
 * HINT_HOLD (its newest version, its `at` kept, so the ghost's GHOST_DELAY and the hand's
 * waits run on) unless it is done or a muncher step takes over. The hand shows after
 * HAND_AFTER of no touch (OOPS_HAND for Oops after a pencil stroke or a sticker that broke
 * something: a peel is picked from the tray on purpose, so its Oops waits as long as any
 * step), each next wait longer and the last repeating; at once after a session began or when
 * the scout is the step; and at once for a child who keeps trying, after HAND_TRIES touches
 * that did not do the step or a try at what it shows that did not work (s.missAt, from
 * rules.act and aimOf), but never sooner than HAND_AGAIN after the last hand, so its gesture
 * plays out. A new step starts the waits over, and so does her touch that changes the board or
 * does the step (rules.act). The hand never shows for Beep pointing at the rocket: then the
 * factory runs, and watching it is play.
 */
export function stepHint(s: State): void {
  countLinks(s)
  const held = s.hint
  const holding = held !== null && s.tick - held.at < HINT_HOLD ? held.step : null
  let top: Ranked | null = null
  let kept: Ranked | null = null
  for (const r of ranked(s, true)) {
    top ??= r
    if (holding === null) break
    if (sameStep(r.step, holding)) {
      kept = r
      break
    }
    if (r.step.kind === 'muncher' && holding.kind !== 'muncher') break
  }
  const next = kept ?? top
  if (next === null) {
    s.hint = null
    return
  }
  const again = held !== null && sameStep(next.step, held.step)
  s.hint = { step: next.step, at: again ? held.at : s.tick }
  if (!again) {
    s.handN = 0
    s.tries = 0
  }
  const step = s.hint.step
  if (!s.playing || step.kind === 'rocket') return
  const quick = step.kind === 'oops' && s.handN === 0 && s.undo[s.undo.length - 1]!.tool !== 'peel'
  const wait = quick ? OOPS_HAND : HAND_AFTER[Math.min(s.handN, HAND_AFTER.length - 1)]!
  const since = Math.max(s.lastTouchAt, s.hint.at, s.handN > 0 ? s.handAt : -1)
  const scout = step.kind === 'muncher' && s.munchers.some((m) => m.id === step.id && m.scout) && s.handAt < s.hint.at
  const session = s.sessionAt > s.handAt && s.sessionAt >= s.lastTouchAt
  const tried = (s.tries >= HAND_TRIES || (s.missAt >= s.hint.at && s.missAt > s.handAt)) && s.tick - s.handAt >= HAND_AGAIN
  if (scout || session || tried || s.tick - since >= wait) {
    s.handAt = s.tick
    s.handN++
    s.tries = 0
  }
}

/**
 * What her action is to the step that bounces, for its hand (rules.act asks before it acts):
 * 'does' for her dig of the rock a dig step digs (that step stays while the oven wants more,
 * and each dig does it again); 'misses' for her tap with the pencil on what the step shows that
 * a tap cannot do: a link's dotted path or its two machines, a tower's or a bowl's belt (from
 * the machine it starts at) or its spot, the cells a peel or a hedge line takes, a sticker's
 * footprint while its ghost waits to show, the machine under a full roof stack or a tower to
 * refill. The hand then comes at once. Null for anything else, and when nothing bounces.
 */
export function aimOf(s: State, a: Action): 'does' | 'misses' | null {
  if (s.hint === null) return null
  const step = s.hint.step
  if (a.kind === 'dig') return a.down && step.kind === 'dig' && dugAt(a.cell) === dugAt(step.cell) ? 'does' : null
  if (a.kind !== 'tap' || s.tool.kind !== 'pencil') return null
  const hit = a.hit
  const cell = 'cell' in hit ? hit.cell : hit.kind === 'thing' ? slotCell(hit.slot) : -1
  const id = hit.kind === 'building' || hit.kind === 'stack' ? hit.id : -1
  /** The tap landed on one of these cells, or on a building standing on one. */
  const on = (cells: readonly number[]) => (cell >= 0 && cells.includes(cell)) || (id >= 0 && cells.some((c) => s.owner[c] === id))
  switch (step.kind) {
    case 'link':
      return on(step.path) ? 'misses' : null
    case 'defend':
    case 'free':
      return on(step.cells) ? 'misses' : null
    case 'place':
      return on(footprint({ kind: step.sticker, x: step.x, y: step.y })) ? 'misses' : null
    case 'bottleneck':
      return step.sticker === null ? (hit.kind === 'building' && hit.id === step.id ? 'misses' : null) : on(footprint({ kind: step.sticker, x: step.x, y: step.y })) ? 'misses' : null
    case 'refill':
    case 'stack':
      return hit.kind === 'building' && hit.id === step.id ? 'misses' : null
    case 'muncher':
    case 'oops':
    case 'unblock':
    case 'dig':
    case 'heap':
    case 'basket':
    case 'choose':
    case 'flap':
    case 'launch':
    case 'card':
    case 'tuck':
    case 'rocket':
      return null
  }
}

/**
 * Counts into help.links each kind of link (from kind, to kind, thing) that her edits since
 * the last look laid belt for: every pair of a building upstream of a new cell that gives a
 * thing and one downstream of it that takes it. Read from the undo stack, so a load counts
 * nothing again and Oops counts nothing.
 */
function countLinks(s: State): void {
  const fresh = s.undo.filter((u) => u.at > s.tick - HINT_EVERY && u.at <= s.tick)
  if (fresh.length === 0) return
  const spoutOf = new Map<number, Building>()
  for (const b of s.buildings) for (const x of s.net.spouts.get(b.id)!) spoutOf.set(x, b)
  const byId = new Map(s.buildings.map((b) => [b.id, b]))
  for (const u of fresh) {
    const kinds = new Set<string>()
    for (const ch of u.edit.belts) {
      const c = ch.cell
      if (ch.after === null || s.belts.out[c]! < 0) continue
      const slots = [inSlot(c), outSlot(c), ...(s.belts.over[c]! >= 0 ? [overIn(c), overOut(c)] : [])]
      const ups = new Set<Building>()
      const seen = new Set<number>()
      for (const todo = [...slots]; todo.length > 0; ) {
        const x = todo.pop()!
        if (seen.has(x)) continue
        seen.add(x)
        const b = spoutOf.get(x)
        if (b !== undefined) ups.add(b)
        for (let k = 0; k < PRED; k++) if (s.net.preds[PRED * x + k]! >= 0) todo.push(s.net.preds[PRED * x + k]!)
      }
      const downs = downstream(s, slots, null).map((id) => byId.get(id)!)
      for (const f of ups) for (const t of gives(f)) for (const r of downs) if (r.id !== f.id && everWants(r.kind, t)) kinds.add(linkKey(f.kind, r.kind, t))
    }
    for (const k of kinds) s.help.links[k] = (s.help.links[k] ?? 0) + 1
  }
}

// ---------------------------------------------------------------------------------------
// The Oops rule's reach

/** What the layout feeds, from the net and the buildings alone: rules.act takes it before and after every edit, and brokeBetween compares the two into Undo.broke. */
export interface Reach {
  /** Every building on the board, and the machines working (band.ts working), by id. */
  readonly ids: readonly number[]
  readonly working: readonly number[]
  /** The lab and the pad, by id. */
  readonly sinks: readonly number[]
  /** What a belt brings each building from one that gives it (the pad: only what an open part takes). */
  readonly feeds: ReadonlyMap<number, readonly Thing[]>
  /** The buildings each building's things reach that take one of them. */
  readonly outs: ReadonlyMap<number, readonly number[]>
  /** Every cell's belt sides, four a cell: in, out, fork and over (-1 for none). */
  readonly sides: Int8Array
}

/** The things a belt from building b brings building r: what b gives that r takes (the pad only an open part's things). */
const carried = (s: State, flow: Flow, b: Building, r: Building) => flow.gives.get(b.id)!.filter((t) => (r.kind === 'pad' ? openPart(s, t) >= 0 : everWants(r.kind, t)))

export function reachOf(s: State): Reach {
  const flow = flowOf(s)
  const byId = new Map(s.buildings.map((b) => [b.id, b]))
  const feeds = new Map<number, Thing[]>()
  const outs = new Map<number, number[]>()
  for (const b of s.buildings) {
    const into = new Set<Thing>()
    for (const id of flow.from.get(b.id)!) for (const t of carried(s, flow, byId.get(id)!, b)) into.add(t)
    feeds.set(b.id, [...into])
    outs.set(
      b.id,
      flow.to.get(b.id)!.filter((id) => carried(s, flow, b, byId.get(id)!).length > 0),
    )
  }
  const sides = new Int8Array(4 * CELLS)
  for (let c = 0; c < CELLS; c++) sides.set([s.belts.in[c]!, s.belts.out[c]!, s.belts.fork[c]!, s.belts.over[c]!], 4 * c)
  return {
    ids: s.buildings.map((b) => b.id),
    working: s.buildings.filter((b) => working(b)).map((b) => b.id),
    sinks: s.buildings.filter((b) => b.kind === 'lab' || b.kind === 'pad').map((b) => b.id),
    feeds,
    outs,
    sides,
  }
}

/**
 * An edit between these two stopped a working machine (took it away, or cut a feed or a way
 * out it had) or cut the lab or the pad off from a thing that reached it: the hint's Oops rule
 * (Undo.broke). One that takes nothing away (no building, no belt cell, no fork's or bridge's
 * lane, no cell turned round) cuts nothing: only lays, forks, bridges and places. A new rock
 * belt into an oven no belt fed narrows the bars it is reckoned to bake (flowOf), which is no
 * feed lost.
 */
export function brokeBetween(before: Reach, after: Reach): boolean {
  const a = before.sides
  const b = after.sides
  let cut = before.ids.some((id) => !after.ids.includes(id))
  for (let i = 0; i < a.length && !cut; i += 4) cut = a[i + 1]! >= 0 && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || (a[i + 2]! >= 0 && a[i + 2] !== b[i + 2]) || (a[i + 3]! >= 0 && a[i + 3] !== b[i + 3]))
  if (!cut) return false
  const lost = (id: number, all: boolean) => {
    const feeds = after.feeds.get(id)
    const outs = after.outs.get(id)
    if (feeds === undefined || outs === undefined) return true
    return before.feeds.get(id)!.some((t) => !feeds.includes(t)) || (all && before.outs.get(id)!.some((r) => !outs.includes(r)))
  }
  return before.working.some((id) => lost(id, true)) || before.sinks.some((id) => before.feeds.get(id)!.length > 0 && lost(id, false))
}
