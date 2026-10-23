import { LIFTOFF, NIGHT_LEAD, PART_OF, padDrums } from './band'
import { BEEP_HOME, beepHome, beepPose, beepTo, carryBasket, carryHeap, carrySlot, carryStack, dig, digRefused, patSticker, restBeep, sendEach } from './beep'
import { BURROWS, LANDS, PAD, START_OVEN, xOf, yOf } from './board'
import { emptyNet, hop, owners, rebuild, thingsOn } from './belts'
import { CARD_FOR, CARD_IDLE, COUNT_AT, DIG_GAP, HELLO_SLEEP, HINT_EVERY, LAUNCH_FOR, LIFT_WAIT, NIGHT_TUCK, PART_INFO, SIZE, STICKER_WORD, UNDO_FOR, UNDO_MAX } from './catalog'
import { aimOf, brokeBetween, reachOf, stepHint } from './hint'
import { stepJams } from './jams'
import { hintGhost, hintPath } from './layout'
import { choiceWaits, stepMachines } from './machines'
import {
  CELLS,
  HOP,
  HZ,
  OVER,
  PARTS,
  SLOTS,
  STEP,
  newBuilding,
  noCounts,
  outSlot,
  overOut,
  sameTool,
  slotCell,
  type Action,
  type Building,
  type Burrow,
  type Edit,
  type Hit,
  type Kind,
  type Night,
  type SimEvent,
  type Placeable,
  type State,
  type Tool,
} from './model'
import { afterEdit, goodnightHome, stepBurrows, stepMunchers, stepTowers, tickle } from './munchers'
import { next } from './random'
import { applyEdit, planHedge, planPeelBuilding, planPeelDrag, planPlace, planRun, planStroke, stickersLeft, type Displaced } from './strokes'
import { basketPoint, beepPoint, burrowBox, heapPoint, moonyPoint } from './where'

/**
 * The whole game as a pure state: `newGame` for a fresh game (progress.ts stateFromKeep for a
 * save), `act` for every Action, `step` once a tick, `cloneState`. It orchestrates the files
 * that own each rule (belts.ts and strokes.ts, machines.ts, beep.ts, munchers.ts, hint.ts and
 * jams.ts) and holds what joins them: the taps by what they hit and the tool in hand, the
 * drags and their release (planned again and applied at once, with the Oops stack), the card's
 * close, the launch, Good night and sessions. The design is plans/rocket-factory.md.
 *
 * Events. `act` runs with s.events pointed at s.queued, so everything an action reports (and
 * every helper it calls) waits in the queue, and the next step reports it first: a step begins
 * with s.events = s.queued. Events feed sounds and particles only; what is drawn over time
 * reads a stamp, and every stamp a step writes is that step's s.tick (it goes up at the end).
 *
 * The step's order, every tick:
 *  1. the events (the queue first);
 *  2. the machines (machines.ts: batches end and start on hop ticks, the next card is found);
 *  3. on a hop tick the belts hop (belts.ts: pushes, tower and bowl takes, mouths, moves), so
 *     a batch's product goes out and a mouth refills on the very hop it ends on;
 *  4. the towers, then the munchers, then once a second the burrows (munchers.ts);
 *  5. the jams Beep lifts by itself (jams.ts);
 *  6. Beep's own: a held dig digs again, flights that landed are dropped;
 *  7. the card's close, the launch's timeline, the night's timeline, then Beep's calm rule
 *     (beep.ts restBeep), after anything that gave it a pose this tick;
 *  8. undo entries older than UNDO_FOR dropped;
 *  9. twice a second the one next step (hint.ts), last, so it sees everything this tick did;
 * 10. the clock.
 */

const PENCIL: Tool = { kind: 'pencil' }

const burrow = (): Burrow => ({ hunger: 0, sleepUntil: -1, warnAt: -1, heap: noCounts(), friend: false, visits: 0, helloAt: -1, pawsAt: -1 })

/**
 * A fresh game at tick 0: land 1, the pad (id 0) and the oven standing at the start (id 1),
 * no belts, the three burrows asleep in their own way (munchers.ts reads which may wake),
 * Beep by the basket, the pencil in hand, every switch on and the munchers on Many.
 */
export function blankState(seed: number): State {
  const s: State = {
    tick: 0,
    rng: seed | 0,
    land: 1,
    landFrom: 1,
    landAt: -1,
    flap: 0,
    belts: {
      out: new Int8Array(CELLS).fill(-1),
      in: new Int8Array(CELLS).fill(-1),
      fork: new Int8Array(CELLS).fill(-1),
      over: new Int8Array(CELLS).fill(-1),
      pattern: new Uint8Array(CELLS),
      joinTurn: new Uint8Array(CELLS),
      forkTurn: new Uint8Array(CELLS),
      moved: new Int32Array(CELLS),
      blockedSince: new Int32Array(2 * CELLS).fill(-1),
      laidAt: new Int32Array(CELLS).fill(-1),
      turnedAt: new Int32Array(CELLS).fill(-1),
      slot: new Int8Array(SLOTS).fill(-1),
      from: new Int16Array(SLOTS).fill(-1),
    },
    hedge: new Uint8Array(CELLS),
    stumpAt: new Int32Array(CELLS).fill(-1),
    buildings: [newBuilding(0, 'pad', PAD.x, PAD.y, -1), newBuilding(1, 'oven', START_OVEN.x, START_OVEN.y, -1)],
    nextId: 2,
    owner: new Int16Array(CELLS).fill(-1),
    net: emptyNet(),
    basket: noCounts(),
    found: [],
    choice: null,
    lab: { got: [0, 0], drinkAt: -1 },
    rocket: { got: [0, 0, 0, 0], fullAt: [-1, -1, -1, -1] },
    launch: null,
    popAt: -1,
    launches: 0,
    card: null,
    cardClosedAt: -1,
    cardWaits: false,
    burrows: BURROWS.map(burrow),
    munchers: [],
    nextMuncher: 1,
    visit: null,
    lastHomeAt: -1,
    shots: [],
    tickles: [],
    tickleAt: -1,
    beep: { x: BEEP_HOME.x, y: BEEP_HOME.y, fromX: BEEP_HOME.x, fromY: BEEP_HOME.y, movedAt: -1, pose: 'float', poseAt: -1, carrying: null, facing: 1 },
    flights: [],
    tool: { kind: 'pencil' },
    drag: null,
    lifted: null,
    undo: [],
    digging: null,
    jams: [],
    hint: null,
    hintMemo: null,
    handAt: -1,
    handN: 0,
    tries: 0,
    missAt: -1,
    lastTouchAt: -1,
    touching: false,
    turnedAt: -1,
    pauseClosedAt: -1,
    sessionAt: 0,
    playing: false,
    night: null,
    patterns: 1,
    pattern: 0,
    help: { links: {}, placed: { digger: 0, oven: 0, workshop: 0, greenMaker: 0, orangeMaker: 0, lab: 0, pump: 0, tower: 0, bowl: 0 }, hedges: 0 },
    switches: { sound: true, music: true, voice: true, munchers: 'many', science: 'normal', noFullscreen: false },
    events: [],
    queued: [],
  }
  s.owner = owners(s)
  return s
}

/** A fresh game ready to play: blankState with everything derived from the layout built (the cells' owners, the slot graph, every building's mouths and spouts). */
export function newGame(seed: number): State {
  const s = blankState(seed)
  rebuild(s)
  return s
}

/** A deep copy that steps exactly as the state itself does (structuredClone keeps the typed arrays and the net's Maps): the hint's look-ahead, the scripted children and the tests. */
export function cloneState(s: State): State {
  return structuredClone(s)
}

// ---------------------------------------------------------------------------------------
// Small pieces

const cellMiddle = (c: number) => ({ x: xOf(c) + 0.5, y: yOf(c) + 0.5 })
const footMiddle = (b: { kind: Kind; x: number; y: number }) => ({ x: b.x + SIZE[b.kind] / 2, y: b.y + SIZE[b.kind] / 2 })
const poke = (s: State, what: Extract<SimEvent, { kind: 'poke' }>['what'], p: { x: number; y: number }) => s.events.push({ kind: 'poke', what, x: p.x, y: p.y })

/** The building an event names, or -1 (a muncher's or a cell's events, and a peel's own, which names the building it took and carries its sticker). */
function buildingOf(e: SimEvent): number {
  switch (e.kind) {
    case 'place':
    case 'batch':
    case 'push':
    case 'gulp':
    case 'recipe':
    case 'full':
      return e.id
    case 'napStart':
    case 'napEnd':
      return e.building
    case 'shot':
      return e.tower
    default:
      return -1
  }
}

/** The side joins the lanes of these cells land as: each lane's out slot leading onto another cell's out slot (belts.ts), keyed by the pair, with the cell joined. */
function joinsOf(s: State, cells: readonly number[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of cells)
    for (const x of [outSlot(c), overOut(c)]) {
      const y = s.net.next[x]!
      if (y >= 0 && y < OVER && y % 2 === 1) out.set(`${x}>${y}`, slotCell(y))
    }
  return out
}

/** Reports what an edit did to belt cells, in `changes`' order (her stroke's): the cells laid, turned and rolled up, each bridge and fork it made, and each belt a changed lane now joins from the side that it did not join before (`before`, joinsOf before the edit). */
function report(s: State, changes: Edit['belts'], before: Map<string, number>): void {
  const cells = (ok: (b: Edit['belts'][number]) => boolean) => changes.filter(ok).map((b) => b.cell)
  const laid = cells((b) => b.before === null)
  const turned = cells((b) => b.before !== null && b.after !== null && (b.before.in !== b.after.in || b.before.out !== b.after.out))
  const rolled = cells((b) => b.after === null)
  if (laid.length > 0) s.events.push({ kind: 'lay', cells: laid })
  if (turned.length > 0) s.events.push({ kind: 'repoint', cells: turned })
  for (const b of changes) {
    if (b.after === null) continue
    if (b.after.over >= 0 && (b.before === null || b.before.over < 0)) s.events.push({ kind: 'bridge', cell: b.cell })
    if (b.after.fork >= 0 && (b.before === null || b.before.fork < 0)) s.events.push({ kind: 'fork', cell: b.cell })
  }
  for (const [key, cell] of joinsOf(s, changes.map((b) => b.cell))) if (!before.has(key)) s.events.push({ kind: 'join', cell })
  if (rolled.length > 0) s.events.push({ kind: 'rollUp', cells: rolled })
}

// ---------------------------------------------------------------------------------------
// Edits

/** After any edit, hers or Oops: the events of buildings it took off go with them, what it displaced goes where it is wanted from where it was, the peel's lifted thing is put down, and the munchers re-plan (munchers.ts afterEdit). */
function settle(s: State, edit: Edit, displaced: readonly Displaced[]): void {
  if (edit.removed.length > 0) {
    const gone = new Set(edit.removed.map((r) => r.id))
    s.events = s.events.filter((e) => !gone.has(buildingOf(e)))
  }
  sendEach(s, displaced, s.tick)
  s.lifted = null
  afterEdit(s)
}

/**
 * Commits an edit of hers at once, made with `tool`, with its undo entry (at most UNDO_MAX of
 * them): Undo.broke is the hint's Oops rule, read from what the layout fed before and after it
 * (hint.ts reachOf). It changed the board, so the hint's hand starts its waits over.
 */
function commit(s: State, edit: Edit, tool: Tool['kind']): void {
  const before = reachOf(s)
  const { inverse, displaced } = applyEdit(s, edit)
  s.undo.push({ edit, inverse, at: s.tick, broke: brokeBetween(before, reachOf(s)), tool })
  if (s.undo.length > UNDO_MAX) s.undo.shift()
  settle(s, edit, displaced)
  s.handN = 0
  s.tries = 0
}

/** A belt stroke she drew is laid, and reported cell by cell. */
function stroked(s: State, edit: Edit): void {
  const before = joinsOf(s, edit.belts.map((b) => b.cell))
  commit(s, edit, 'pencil')
  report(s, edit.belts, before)
}

/** A hedge line along these cells, while hedge stickers last; true when it planted any. The hedge tool's one use is over then. */
function hedgeLine(s: State, cells: readonly number[]): boolean {
  const plan = planHedge(s, cells)
  if (plan.edit === null) return false
  commit(s, plan.edit, 'hedge')
  s.help.hedges += plan.cells.length
  s.events.push({ kind: 'hedgeIn', cells: plan.cells })
  s.tool = PENCIL
  return true
}

/** The peel rolls these belt and hedge cells up (a drag, or a second tap on a lifted run): its one use is over. */
function rolledUp(s: State, cells: readonly number[], edit: Edit): void {
  commit(s, edit, 'peel')
  s.events.push({ kind: 'rollUp', cells: [...cells] })
  s.tool = PENCIL
}

/**
 * Her sticker lands with its footprint's middle at board point (x, y), snapped as its ghost
 * showed it (the hint's spot first, when the hint's ghost is that sticker): it slaps down and
 * Beep pats it, or on a grey spot it flies back to the tray with a boing, a try that did not
 * work (the hint's hand comes at once: missAt). Either way the sticker's one use is over and
 * the pencil is back. Her first of a kind says its name.
 */
function place(s: State, sticker: Placeable, x: number, y: number): void {
  s.tool = PENCIL
  const ghost = hintGhost(s, s.tick * STEP)
  const plan = planPlace(s, sticker, x, y, ghost !== null && ghost.sticker === sticker ? { x: ghost.x, y: ghost.y } : null)
  if (!plan.ok) {
    s.events.push({ kind: 'nope', x: plan.x + SIZE[sticker] / 2, y: plan.y + SIZE[sticker] / 2 })
    s.missAt = s.tick
    return
  }
  const edit = plan.edit!
  const added = edit.added[0]!
  commit(s, edit, 'sticker')
  s.events.push({ kind: 'place', id: added.id, sticker })
  if (s.help.placed[sticker]++ === 0) s.events.push({ kind: 'say', word: STICKER_WORD[sticker] })
  patSticker(s, added, s.tick)
}

/** The peel's second tap on building b takes it off the board with everything inside (sent where wanted from its middle): its sticker is back in the tray, and Beep pats where it stood. */
function peelOff(s: State, b: Building): void {
  const edit = planPeelBuilding(s, b.id)
  const gone = edit.removed[0]!
  commit(s, edit, 'peel')
  s.events.push({ kind: 'peel', id: gone.id, sticker: gone.kind })
  s.tool = PENCIL
  patSticker(s, gone, s.tick)
}

/** The peel's tap on belt cell c: the first lifts its run (up to the next fork, join or building), a second on that run rolls it up. */
function peelBelt(s: State, c: number): void {
  // The belt may have gone since the finger went down (Oops, or the peel of her other hand): the ground puffs then.
  if (s.belts.out[c]! < 0) {
    s.lifted = null
    poke(s, 'ground', cellMiddle(c))
    return
  }
  const l = s.lifted
  if (l !== null && l.kind === 'run' && l.cells.includes(c)) {
    const plan = planPeelDrag(s, l.cells)
    if (plan.edit === null) throw new Error(`the run lifted at cell ${c} rolls up nothing`)
    rolledUp(s, plan.cells, plan.edit)
    return
  }
  s.lifted = { kind: 'run', cells: planRun(s, c).cells, at: s.tick }
  s.events.push({ kind: 'lift', ...cellMiddle(c) })
}

/** The peel's tap on building b: the first lifts it, a second peels it off; the pad never comes off (it wiggles, grey). */
function peelTap(s: State, b: Building): void {
  if (b.kind === 'pad') {
    s.lifted = null
    poke(s, 'grey', footMiddle(b))
    return
  }
  if (s.lifted !== null && s.lifted.kind === 'building' && s.lifted.id === b.id) return peelOff(s, b)
  s.lifted = { kind: 'building', id: b.id, at: s.tick }
  s.events.push({ kind: 'lift', ...footMiddle(b) })
}

/**
 * Oops: the newest edit of the last UNDO_FOR undone, its inverse applied (the newest first, so
 * every edit's own checks hold), what rode on the cells it takes away sent where it is wanted,
 * and reported with the cells that roll up and the ones that come back. It restores the
 * layout, never things, and is not undoable itself. With nothing to undo the button is grey
 * and nothing happens. It changed the board, so the hint's hand starts its waits over.
 */
function oops(s: State): void {
  const u = s.undo.pop()
  if (u === undefined) return
  const inverse = u.inverse
  const before = joinsOf(s, inverse.belts.map((b) => b.cell))
  const { displaced } = applyEdit(s, inverse)
  settle(s, inverse, displaced)
  s.handN = 0
  s.tries = 0
  s.events.push({ kind: 'oops' })
  report(s, inverse.belts, before)
  const planted = inverse.hedges.filter((h) => h.after !== 0).map((h) => h.cell)
  const taken = inverse.hedges.filter((h) => h.after === 0).map((h) => h.cell)
  if (planted.length > 0) s.events.push({ kind: 'hedgeIn', cells: planted })
  if (taken.length > 0) s.events.push({ kind: 'rollUp', cells: taken })
  for (const r of inverse.removed) s.events.push({ kind: 'peel', id: r.id, sticker: r.kind })
  for (const a of inverse.added) s.events.push({ kind: 'place', id: a.id, sticker: a.kind })
}

/** A stroke, hedge line, peel drag or ghost drops with nothing changed: a ghost's sticker goes back to the tray (the pencil), and a stroke or hedge line leaves its tool picked. */
function dropDrag(s: State): void {
  if (s.drag !== null && s.drag.kind === 'ghost') s.tool = PENCIL
  s.drag = null
}

/** The drag ends: planned again on the layout as it is at this moment and applied at once (commit), or dropped (dropDrag). A drag a turn, Good night or the launch already dropped leaves nothing to release. */
function release(s: State, commitIt: boolean): void {
  const d = s.drag
  if (d === null) return
  if (!commitIt) return dropDrag(s)
  s.drag = null
  switch (d.kind) {
    case 'stroke': {
      const plan = planStroke(s, d.cells, hintPath(s))
      if (plan.edit !== null) stroked(s, plan.edit)
      return
    }
    case 'hedge':
      hedgeLine(s, d.cells)
      return
    case 'peel': {
      const plan = planPeelDrag(s, d.cells)
      if (plan.edit !== null) rolledUp(s, plan.cells, plan.edit)
      return
    }
    case 'ghost':
      place(s, d.sticker, d.x, d.y)
      return
  }
}

/** A tray button or its key: the tool picked, or the pencil back on a tap on the one already picked. A used-up sticker or hedge only wiggles (grey). Picking puts down what the peel lifted and drops a drag (a ghost's sticker goes back). */
function pickTool(s: State, tool: Tool): void {
  s.lifted = null
  const sticker = tool.kind === 'sticker' ? tool.sticker : tool.kind === 'hedge' ? 'hedge' : null
  if (sticker !== null && stickersLeft(s, sticker) <= 0) {
    poke(s, 'grey', basketPoint)
    return
  }
  dropDrag(s)
  s.tool = sameTool(s.tool, tool) ? PENCIL : tool
  s.events.push({ kind: 'tool' })
}

// ---------------------------------------------------------------------------------------
// Taps

/**
 * A tap on what a touch went down on (touch.ts), by what it hit and the tool in hand. Ground,
 * a tree, flowers, an empty belt, Beep and Moony answer with a poke. A thing on a belt, a roof
 * stack and a heap Beep carries where wanted; the basket gives what something wants. With the
 * pencil a building shows its recipe; with the peel the first tap lifts a building or a belt's
 * run and a second tap on it takes it back, and a hedge comes back at once. The hedge tool
 * plants one hedge where it can. A burrow shows its paw prints, the flaps fold open after a
 * Land! card, the hint's ghost is placed. At Good night a tap on the kind in its nightcap
 * tucks it in. A tap anywhere but on what the peel lifted puts that down.
 */
function tap(s: State, hit: Hit): void {
  const peel = s.tool.kind === 'peel'
  switch (hit.kind) {
    case 'none':
    case 'table':
      throw new Error(`the router never taps ${hit.kind}`)
    case 'muncher':
      tickle(s, hit.id)
      return
    case 'ground':
    case 'tree':
    case 'flowers': {
      s.lifted = null
      if (s.tool.kind === 'hedge' && hedgeLine(s, [hit.cell])) return
      const p = cellMiddle(hit.cell)
      poke(s, hit.kind, p)
      // Bare ground puffs and Beep looks over.
      if (hit.kind === 'ground' && s.beep.pose === 'float') s.beep.facing = p.x < beepPoint(s.beep, s.tick * STEP).x ? -1 : 1
      return
    }
    case 'patch':
    case 'pond':
      // Only the peel taps a patch (the drawing tools dig at the touch): it digs once all the same.
      s.lifted = null
      if (!dig(s, hit.cell, s.tick)) digRefused(s, hit.cell, s.tick)
      return
    case 'hedge': {
      // The hedge may have gone since the finger went down (Oops, a stroke or the peel of her other hand): the ground puffs then.
      if (s.hedge[hit.cell] === 0) {
        s.lifted = null
        poke(s, 'ground', cellMiddle(hit.cell))
        return
      }
      if (peel) {
        const plan = planPeelDrag(s, [hit.cell])
        rolledUp(s, plan.cells, plan.edit!)
        return
      }
      s.lifted = null
      // A hedge shakes like a tree and drops a leaf.
      poke(s, 'tree', cellMiddle(hit.cell))
      return
    }
    case 'belt':
      if (peel) return peelBelt(s, hit.cell)
      s.lifted = null
      // An empty belt's chevrons hop; on a belt with things on it, the things answer their own taps.
      if (thingsOn(s, [hit.cell]).length === 0) poke(s, 'belt', cellMiddle(hit.cell))
      return
    case 'thing': {
      const c = slotCell(hit.slot)
      if (peel) return peelBelt(s, c)
      s.lifted = null
      // The thing may have hopped on since the frame she tapped: its belt answers then.
      if (s.belts.slot[hit.slot]! < 0) poke(s, 'belt', cellMiddle(c))
      else carrySlot(s, hit.slot, s.tick)
      return
    }
    case 'building':
    case 'stack': {
      const b = s.buildings.find((x) => x.id === hit.id)
      // The building may have gone since the finger went down (Oops or the peel of her other hand): nothing is left to answer.
      if (b === undefined) return
      if (s.night !== null && s.night.kind === b.kind) return tuck(s, b.kind)
      if (peel) return peelTap(s, b)
      s.lifted = null
      if (hit.kind === 'stack' && b.stack.length > 0) return carryStack(s, b, s.tick)
      // The rocket ready on its pad bounces: her tap launches it.
      if (b.kind === 'pad' && launchReady(s)) return launch(s)
      b.tapAt = s.tick
      s.events.push({ kind: 'recipe', id: b.id })
      return
    }
    case 'burrow': {
      s.lifted = null
      s.burrows[hit.burrow]!.pawsAt = s.tick
      const box = burrowBox(hit.burrow)
      poke(s, 'burrow', { x: box.x + box.w / 2, y: box.y + box.h / 2 })
      return
    }
    case 'heap':
      s.lifted = null
      // A heap that flew home since the frame she tapped (a burrow's first picnic) leaves only the ground to puff.
      if (s.burrows[hit.burrow]!.heap.some((n) => n > 0)) carryHeap(s, hit.burrow, s.tick)
      else poke(s, 'ground', heapPoint(hit.burrow))
      return
    case 'basket':
      s.lifted = null
      // Nothing in it is wanted now: the basket only puffs.
      if (carryBasket(s, s.tick) === 0) poke(s, 'ground', basketPoint)
      return
    case 'beep':
      s.lifted = null
      beepPose(s, 'flip', s.tick)
      poke(s, 'beep', beepPoint(s.beep, s.tick * STEP))
      return
    case 'moony':
      s.lifted = null
      poke(s, 'moony', moonyPoint)
      return
    case 'flap':
      s.lifted = null
      flaps(s)
      return
    case 'spot': {
      s.lifted = null
      const ghost = hintGhost(s, s.tick * STEP)
      // The hint may have moved on since the frame she tapped: then there is no ghost to place.
      if (ghost !== null) place(s, ghost.sticker, ghost.x + SIZE[ghost.sticker] / 2, ghost.y + SIZE[ghost.sticker] / 2)
      return
    }
  }
}

/** The next land's folded flaps, tapped or dragged: after a Land! card they fold open (the view eases out over GROW from landAt; the new burrow's munchers wave hello and sleep HELLO_SLEEP); before one the corner only lifts. Land 3 has none. */
function flaps(s: State): void {
  if (s.land === 3) throw new Error('land 3 has no flaps')
  if (s.flap === 0) {
    const l = LANDS[s.land]
    poke(s, 'flap', { x: l.x1 + 1, y: l.y0 })
    return
  }
  const land = s.flap
  s.landFrom = s.land
  s.land = land
  s.landAt = s.tick
  s.flap = 0
  BURROWS.forEach((site, i) => {
    if (site.land !== land) return
    const b = s.burrows[i]!
    b.helloAt = s.tick
    b.sleepUntil = s.tick + HELLO_SLEEP
  })
  s.events.push({ kind: 'flap', land })
}

// ---------------------------------------------------------------------------------------
// The card, the launch and Good night

/** The card that is up closes, its stamp kept for the kind rules (no visit within AFTER_CARD of it). */
function closeCard(s: State): void {
  const c = s.card!
  s.card = null
  s.cardClosedAt = s.tick
  s.cardWaits = false
  s.events.push({ kind: 'cardClosed', id: c.id })
}

/** The launch can start: every part of the rocket is full, Fuel! is found and no launch runs; after a landing, the rocket her factory filled again flies again. The launch button bounces then (the HUD and the renderer ask this too). */
export const launchReady = (s: State) => s.launch === null && s.found.includes('fuel') && PARTS.every((p, i) => s.rocket.got[i]! >= PART_INFO[p].n)

/** Her tap launches the rocket: LAUNCH_FOR of countdown, liftoff and the flight to the moon and back (step), Beep in its window; a drag drops. It is credited only when it lands. */
function launch(s: State): void {
  s.launch = { at: s.tick, landsAt: s.tick + LAUNCH_FOR }
  dropDrag(s)
  s.lifted = null
  s.digging = null
  const pad = footMiddle(s.buildings.find((b) => b.kind === 'pad')!)
  beepTo(s, pad.x, pad.y, 'cheer', s.tick)
  s.beep.carrying = null
  s.events.push({ kind: 'launch' })
}

/**
 * A tap while the rocket flies, when nothing on the board changes and Beep is aboard (the
 * router sends no edit then): on the rocket during the countdown the number standing by the pad
 * pops with its sound; a tree shakes, flowers sway, and anywhere else on the land the ground
 * puffs where she tapped.
 */
function cheer(s: State, hit: Hit): void {
  if (hit.kind === 'building' || hit.kind === 'stack') {
    const b = s.buildings.find((x) => x.id === hit.id)
    // Gone since the finger went down (a key's Oops): nothing is left to answer.
    if (b === undefined) return
    const k = s.tick - s.launch!.at - COUNT_AT
    if (b.kind !== 'pad') poke(s, 'ground', footMiddle(b))
    else if (k >= 0 && k < 5 * HZ) {
      s.popAt = s.tick
      s.events.push({ kind: 'count', n: 5 - Math.floor(k / HZ) })
    }
    return
  }
  const cell = 'cell' in hit ? hit.cell : hit.kind === 'thing' ? slotCell(hit.slot) : -1
  if (cell >= 0) poke(s, hit.kind === 'tree' || hit.kind === 'flowers' ? hit.kind : 'ground', cellMiddle(cell))
}

/** The kinds that bounce in a nightcap at Good night, in the band's order (band.ts PART_OF), so the tucks walk the factory down to sleep. Towers and bowls play no part. */
const NIGHT_KINDS = Object.keys(PART_OF) as (keyof typeof PART_OF)[]
/** A kind still awake at night: a machine of it on the board not tucked in; the pad while it drums. */
const awake = (s: State, kind: Kind) => (kind === 'pad' ? padDrums(s) : s.buildings.some((b) => b.kind === kind && !b.tucked))

/** The next kind bounces in its nightcap, from now: the first kind still awake. With none left the factory is asleep (doneAt): Beep curls up by the basket and the still card shows. */
function nextKind(s: State, night: Night): void {
  night.kind = NIGHT_KINDS.find((k) => awake(s, k)) ?? null
  night.kindAt = s.tick
  if (night.kind !== null) return
  night.doneAt = s.tick
  beepHome(s, 'sleep', s.tick)
  s.events.push({ kind: 'sleep' })
}

/** Every machine of `kind` is tucked in (it makes nothing until morning; the pad stops drumming), and the next kind bounces. */
function tuck(s: State, kind: Kind): void {
  for (const b of s.buildings) if (b.kind === kind) b.tucked = true
  s.events.push({ kind: 'tuck', machine: kind })
  nextKind(s, s.night!)
}

/** Morning: every machine untucked, the night over, Beep stretching at home. */
function wake(s: State): void {
  if (s.night === null) return
  for (const b of s.buildings) b.tucked = false
  s.night = null
  beepHome(s, 'stretch', s.tick)
  s.events.push({ kind: 'wake' })
}

// ---------------------------------------------------------------------------------------
// Act and step

/**
 * One action of the child's (or the parent's, or a scripted child's), in one exhaustive switch;
 * what it reports waits in the queue for the next step. What it is to the step that bounces
 * (hint.ts aimOf, read before it acts) times the hint's hand: her dig of the step's rock does
 * the step, which starts the hand's waits over as an edit does; a tap on what the step shows
 * that cannot do it brings the hand at once.
 */
export function act(s: State, a: Action): void {
  const stepEvents = s.events
  s.events = s.queued
  const aim = aimOf(s, a)
  switch (a.kind) {
    case 'play':
      s.playing = true
      s.events.push({ kind: 'play' })
      wake(s)
      break
    case 'tap':
      if (s.launch !== null) cheer(s, a.hit)
      else tap(s, a.hit)
      break
    case 'touch':
      // A touch counts as a try until it changes the board or does the step (hint.ts stepHint): a child who keeps trying sees the hand.
      s.touching = a.down
      if (a.down) {
        s.lastTouchAt = s.tick
        s.tries++
      }
      break
    case 'dig':
      if (a.down) {
        s.digging = { cell: a.cell, at: s.tick }
        if (!dig(s, a.cell, s.tick)) digRefused(s, a.cell, s.tick)
      } else s.digging = null
      break
    case 'tickle':
      tickle(s, a.id)
      break
    case 'tool':
      pickTool(s, a.tool)
      break
    case 'drag': {
      const tool = s.tool.kind
      // A sticker picked mid-stroke (a key) dropped the stroke: the rest of it draws nothing.
      if (tool === 'sticker') break
      const kind = tool === 'pencil' ? 'stroke' : tool
      s.lifted = null
      s.drag = { kind, cells: [...a.cells], at: s.drag !== null && s.drag.kind === kind ? s.drag.at : s.tick }
      break
    }
    case 'hold': {
      const tool = s.tool
      // The pencil picked mid-ghost (a key) dropped the ghost: the rest of the drag holds nothing.
      if (tool.kind !== 'sticker') break
      const was = s.drag
      s.drag = { kind: 'ghost', sticker: tool.sticker, x: a.x, y: a.y, at: was !== null && was.kind === 'ghost' && was.sticker === tool.sticker ? was.at : s.tick }
      break
    }
    case 'release':
      release(s, a.commit)
      break
    case 'pattern':
      s.pattern = (s.pattern + 1) % s.patterns
      s.events.push({ kind: 'pattern', pattern: s.pattern })
      break
    case 'oops':
      oops(s)
      break
    case 'choose':
      if (choiceWaits(s)) s.choice = a.card
      break
    case 'flap':
      flaps(s)
      break
    case 'launch':
      // A second tap on the launch button, or one on a button the state has already left behind, does nothing.
      if (launchReady(s)) launch(s)
      break
    case 'card':
      if (s.card !== null) closeCard(s)
      break
    case 'turned':
      s.turnedAt = s.tick
      dropDrag(s)
      break
    case 'session':
      // The hint's hand shows at once from the session's stamp (hint.ts stepHint).
      s.sessionAt = s.tick
      beepHome(s, 'stretch', s.tick)
      s.events.push({ kind: 'session' })
      break
    case 'unpaused':
      s.pauseClosedAt = s.tick
      break
    case 'goodnight':
      // One night at a time, and never during the launch's 40 s.
      if (s.night !== null || s.launch !== null) break
      s.night = { at: s.tick, kind: null, kindAt: -1, doneAt: -1 }
      dropDrag(s)
      s.lifted = null
      goodnightHome(s)
      beepHome(s, 'yawn', s.tick)
      s.events.push({ kind: 'goodnight' })
      break
    case 'tuck':
      // A tap on a kind that has stopped bouncing (it tucked itself in a moment ago) does nothing.
      if (s.night !== null && s.night.kind === a.machine) tuck(s, a.machine)
      break
    case 'wake':
      wake(s)
      break
    case 'fresh':
      // A new game in place from the next random number, the clock and the parent's switches kept. Its events start empty: the old game's, queued or from its last step, name buildings that are gone.
      Object.assign(s, newGame(next(s.rng)[1]), { tick: s.tick, sessionAt: s.tick, playing: s.playing, switches: s.switches })
      return
    case 'sound':
      s.switches.sound = a.on
      break
    case 'music':
      s.switches.music = a.on
      break
    case 'voice':
      s.switches.voice = a.on
      break
    case 'munchers':
      s.switches.munchers = a.mode
      break
    case 'science':
      s.switches.science = a.mode
      break
    case 'fullscreen':
      s.switches.noFullscreen = !a.on
      break
    default: {
      const never: never = a
      throw new Error(`unknown action ${JSON.stringify(never)}`)
    }
  }
  if (aim === 'does') {
    s.handN = 0
    s.tries = 0
  } else if (aim === 'misses') s.missAt = s.tick
  s.queued = s.events
  s.events = stepEvents
}

/** One tick, in the order the file comment gives. */
export function step(s: State): void {
  s.events = s.queued
  s.queued = []
  const tick = s.tick
  stepMachines(s)
  if (tick % HOP === 0) hop(s)
  stepTowers(s)
  stepMunchers(s)
  if (tick % HZ === 0) stepBurrows(s)
  stepJams(s)

  // A held dig digs again DIG_GAP after its last dig while something wants the thing; when nothing does, Beep stops digging and points at the full oven.
  const dg = s.digging
  if (dg !== null && tick - dg.at >= DIG_GAP) {
    if (dig(s, dg.cell, tick)) dg.at = tick
    else if (s.beep.pose === 'dig') digRefused(s, dg.cell, tick)
  }
  if (s.flights.some((f) => f.until <= tick)) s.flights = s.flights.filter((f) => f.until > tick)

  // The card that came this tick waits for her tap when nobody had touched the board for CARD_IDLE; any other closes CARD_FOR after it came, held at most LIFT_WAIT more by a finger down.
  const card = s.card
  if (card !== null) {
    if (card.at === tick) {
      s.cardWaits = !s.touching && (s.lastTouchAt < 0 || tick - s.lastTouchAt >= CARD_IDLE)
      beepPose(s, 'cheer', tick)
    } else if (!s.cardWaits && tick >= card.at + CARD_FOR && (!s.touching || tick >= card.at + CARD_FOR + LIFT_WAIT)) closeCard(s)
  }

  // The launch: the count from 5 to 1 a second apart from COUNT_AT, liftoff, and at landsAt the flight lands: credited, every sticker endless, and a new rocket on the pad whose four parts open again (trade.ts partOpen) for the next launch.
  const l = s.launch
  if (l !== null) {
    const k = tick - l.at - COUNT_AT
    if (k >= 0 && k % HZ === 0 && k < 5 * HZ) s.events.push({ kind: 'count', n: 5 - k / HZ })
    if (tick === l.at + LIFTOFF) s.events.push({ kind: 'liftoff' })
    if (tick >= l.landsAt) {
      s.launch = null
      s.launches++
      s.rocket = { got: PARTS.map(() => 0), fullAt: PARTS.map(() => -1) }
      beepHome(s, 'wave', tick)
      s.events.push({ kind: 'landed' })
    }
  }

  // Good night: NIGHT_LEAD after dusk the first kind bounces in its nightcap; untapped for NIGHT_TUCK it tucks itself in; a kind with nothing left awake (peeled meanwhile) gives way at once.
  const night = s.night
  if (night !== null && night.doneAt < 0) {
    if (night.kind === null) {
      if (tick >= night.at + NIGHT_LEAD) nextKind(s, night)
    } else if (tick >= night.kindAt + NIGHT_TUCK) tuck(s, night.kind)
    else if (!awake(s, night.kind)) nextKind(s, night)
  }

  restBeep(s)
  while (s.undo.length > 0 && tick - s.undo[0]!.at >= UNDO_FOR) s.undo.shift()
  if (tick % HINT_EVERY === 0) stepHint(s)
  s.tick++
}
