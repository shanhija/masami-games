import { cellOf, onBoard, xOf, yOf } from './board'
import { PLACEABLE, SIZE } from './catalog'
import { SLOP, areaDistance, gripLift, heldAt, hintGhost, hintPath, hitTest, pick, screenBox, toBoard, type Area, type View } from './layout'
import { COLS, HOP, ROWS, sameTool, type Action, type Hit, type Placeable, type State, type Sticker, type Tool } from './model'
import { blocked, planStroke } from './strokes'
import { buildingBox, burrowBox, muncherPoint, type Box, type Point } from './where'

/**
 * The pointer router: every finger on the board, read by the rules of "A touch is read"
 * (plans/rocket-factory.md, Beep and the child's hands) and turned into Actions through
 * `send`. It is pure and deterministic: no DOM, the caller's sim time in seconds (the time the
 * frame under the finger was drawn at), and the state and the view passed in with every call,
 * so the page, the scripted children and the tests read a touch the same way.
 *
 * - A touch near a muncher tickles at once, from any finger at any time. It never draws,
 *   places or peels, never takes the board and leaves a picked tool picked.
 * - On a bare patch or the pond it digs at once and never becomes a stroke.
 * - It is a tap on what it went down on when it lifts before it became anything else, within
 *   TAP_FOR seconds and no further than layout.SLOP off that thing; a press on a thing riding a
 *   belt follows the thing, so the lift carries what she pressed.
 * - A stroke begins on bare ground after STROKE_TRAVEL px with the finger in a second cell; from
 *   anything a tap answers (a machine, the pad, a belt, a thing, a heap) only once the finger
 *   is more than SLOP off it and in another cell, so a sloppy tap never edits her factory. It
 *   keeps its row against a wobbly finger, fills the corner of a fast or diagonal one, goes to
 *   the rules cell by cell as 'drag', and at the lift takes the turn into the cell under the
 *   finger when that turn is what she drew to (endTurn).
 * - With a sticker picked its ghost follows the finger as 'hold', held by its bottom edge above
 *   the fingertip (layout.heldAt); a drag from the hint's spot, or out of the tray, picks the
 *   sticker and holds it, and a drag out of the hedge's button draws a hedge line.
 * - A lift commits after BRIDGE, unless a touch within a cell goes on with it (one in the
 *   frame right after the lift's always may, however long that frame was: under ?fast a frame
 *   is longer than BRIDGE); a cancel, a window turn, a page hide or a pause drops it with nothing
 *   placed, and so does the rules' dropping it (another tool picked meanwhile).
 * - One finger has the board at a time: one that has started no stroke, dig or ghost hands it at
 *   once to the next finger that lands (a resting heel or thumb), a contact too wide for a
 *   fingertip never takes it, and a touch in a gutter or on the table never does.
 * - During the launch a press is only ever a tap, for the rules to answer, and nothing edits.
 */

/** A touch that lifts within TAP_FOR seconds, before it became a stroke, a dig or a ghost drag and no further than layout.SLOP off what it went down on, is a tap on it. */
export const TAP_FOR = 2
/** On bare ground a stroke begins after STROKE_TRAVEL px of travel with the finger in a second cell; a drag from the hint's spot after the same travel. */
export const STROKE_TRAVEL = 24
/** The axis lock: a stroke keeps its row (or column) until the finger strays LOCK cells from its middle line, and never less than LOCK_PX, so a wobbly finger draws straight. */
export const LOCK = 0.85
export const LOCK_PX = 20
/** At a stroke's lift the cell under the finger, next to the stroke's end, is its last turn when the stroke then ends in a mouth, a join or a feed, or on open ground once the finger is END_TURN cells into it: the axis lock must never eat the turn into what she draws to. */
export const END_TURN = 0.15
/** A lift followed within BRIDGE seconds by a touch within a cell of it goes on with the same stroke or drag: a fingertip that skips for a few frames never lays half a belt. */
export const BRIDGE = 0.15
/** A contact wider or taller than HEEL CSS px is the heel of a hand or a gripping thumb, not a fingertip (about 19 mm on an iPad: a fingertip, even a grown-up's, reports well under it). */
export const HEEL = 100

/** What pressed: a finger or a pen, the mouse's left button (the same), its right button (the peel's), or a contact too wide for a fingertip (the heel of her hand). */
export type Press = 'touch' | 'left' | 'right' | 'heel'
/** What the shell does itself for a key: the pause menu, or the browser's full screen. */
export type Shell = 'pause' | 'fullscreen'

type Axis = 'x' | 'y' | null
const PEEL: Tool = { kind: 'peel' }
/** What a tap answers beyond a poke: a press on one of these becomes a stroke only once it has slid more than SLOP off it. */
const ANSWERS: ReadonlySet<Hit['kind']> = new Set<Hit['kind']>(['building', 'stack', 'burrow', 'belt', 'thing', 'heap', 'basket', 'beep', 'moony'])

/**
 * One pointer from its down to its lift. Its role: inert (it tickled, went down on the table,
 * landed while another finger had the board, handed the board on, was a heel, or came while the
 * board took no input); press (down on something and nothing else yet: a tap if it lifts now);
 * dig; stroke (a belt, a hedge line or a peel drag); ghost (holding a sticker's ghost); tray
 * (pressed on a sticker in the tray and not out of it yet).
 */
interface Finger {
  id: number
  role: 'inert' | 'press' | 'dig' | 'stroke' | 'ghost' | 'tray'
  /** It went down on the board (on a muncher too): the kind rules count it as a touch. */
  touched: boolean
  /** A finger or a pen, not the mouse: a hand covers what is under it. */
  touch: boolean
  at: number
  x0: number
  y0: number
  /** The last point it was seen at. */
  x: number
  y: number
  hit: Hit
  area: Area | null
  /** It slid more than SLOP off what it went down on: it taps nothing. */
  strayed: boolean
  /** The cell it went down on; the footprint it went down on (a stroke from a machine, the pad or a burrow begins once it is SLOP off it), and the last cell it was in there. */
  cell: number
  footprint: Box | null
  last: number
  /** A stroke's cells so far, and the axis its end runs along. */
  cells: number[]
  axis: Axis
  /** A ghost's sticker, or the tray button's it pressed (the hedge's too), or the hint spot's. */
  sticker: Sticker | null
  /** Where a mouse holds a ghost from the pointer, in cells: a drag from the hint's spot keeps the spot where it took hold of it. A finger holds every ghost by its bottom edge (layout.heldAt). */
  dx: number
  dy: number
  /** The tool in hand when its stroke or ghost began: once another is picked (the other hand on the tray, a key) the rules have dropped it, and the finger lets go. */
  tool: Tool | null
  /** The last hop it followed the thing it pressed through. */
  hop: number
}

/** The board cell under board point (x, y), held on the board: a stroke dragged off the board runs on along its edge, where strokes.ts stops it. */
const cellAt = (x: number, y: number) => cellOf(Math.min(COLS - 1, Math.max(0, Math.floor(x))), Math.min(ROWS - 1, Math.max(0, Math.floor(y))))
const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
/** The last hop the state has stepped through (belts hop every HOP ticks, on the tick before s.tick). */
const hopOf = (s: State) => Math.floor((s.tick - 1) / HOP)

/**
 * Draws a stroke's path on toward the finger at board point (bx, by), appending cells as the
 * finger traced them (going back over cells appends them again, which strokes.ts reads as
 * rolling up). The path keeps its row (or column) while the finger stays within `lock` cells
 * of its middle line, so a wobbly finger draws straight; past that it goes round an L that
 * keeps the current direction first, which also fills in a fast or diagonal finger. The first
 * step goes the finger's longer way from the start. Returns the axis the path's end runs along.
 */
function trace(cells: number[], axis: Axis, bx: number, by: number, lock: number): Axis {
  const end = cells[cells.length - 1]!
  const ex = xOf(end)
  const ey = yOf(end)
  const to = cellAt(bx, by)
  const fx = xOf(to)
  const fy = yOf(to)
  // Straight on from the path's end to (x, y), which shares its row or its column.
  const go = (x: number, y: number) => {
    let cx = xOf(cells[cells.length - 1]!)
    let cy = yOf(cells[cells.length - 1]!)
    while (cx !== x || cy !== y) {
      cx += Math.sign(x - cx)
      cy += Math.sign(y - cy)
      cells.push(cellOf(cx, cy))
    }
  }
  if (axis === 'x' && Math.abs(by - (ey + 0.5)) < lock) {
    go(fx, ey)
    return 'x'
  }
  if (axis === 'y' && Math.abs(bx - (ex + 0.5)) < lock) {
    go(ex, fy)
    return 'y'
  }
  if (fx === ex && fy === ey) return axis
  const first = axis ?? (Math.abs(bx - (ex + 0.5)) >= Math.abs(by - (ey + 0.5)) ? 'x' : 'y')
  if (first === 'x') {
    go(fx, ey)
    go(fx, fy)
    return fy === ey ? 'x' : 'y'
  }
  go(ex, fy)
  go(fx, fy)
  return fx === ex ? 'y' : 'x'
}

/**
 * The router, one for the page and one for each scripted child. Every call passes the state
 * and the view of the frame under the finger, and the sim time; what it reads goes to `send`
 * at once, in order.
 */
export class Router {
  /** What a mouse pointer with no button down is over: the renderer outlines what a click would take. Null with no mouse over the board. */
  hover: Hit | null = null

  /** The finger drawing a stroke or holding a ghost, where it is now (CSS px) and whether it is a finger or the mouse, or null: the renderer floats the stroke's end sign layout.fingerLift above a finger. */
  get finger(): { x: number; y: number; touch: boolean } | null {
    const f = this.board
    return f !== null && (f.role === 'stroke' || f.role === 'ghost') ? { x: f.x, y: f.y, touch: f.touch } : null
  }
  private readonly fingers = new Map<number, Finger>()
  /** The finger that has the board: it may tap, dig, draw or hold a ghost. Any other finger only tickles. */
  private board: Finger | null = null
  /** The stroke or ghost whose finger lifted at `at` from (x, y), not released yet, and how many frames have ticked since: a touch within a cell of it within BRIDGE, or in the frame right after the lift's, goes on with it. */
  private bridge: { finger: Finger; at: number; x: number; y: number; ticks: number } | null = null
  /** How many fingers are down on the board, for the kind rules' touches. */
  private touching = 0
  /** A picked sticker's ghost follows the mouse with no button down. */
  private hovering = false

  constructor(private readonly send: (a: Action) => void) {}

  /** A pointer went down at (sx, sy), CSS px on the canvas, at sim time t. */
  down(s: State, view: View, id: number, sx: number, sy: number, t: number, press: Press): void {
    this.settle(t, false)
    // The heel of her hand or a gripping thumb: nothing it lands on answers, and it never takes the board.
    if (press === 'heel') {
      this.track(id, sx, sy, t, press, { kind: 'table' }, null, 'inert', null)
      return
    }
    const { hit, area } = pick(s, view, sx, sy, t)
    const [bx, by] = toBoard(view, sx, sy)
    const f = this.track(id, sx, sy, t, press, hit, area, 'inert', null)
    f.cell = cellAt(bx, by)
    f.hop = hopOf(s)
    if (hit.kind !== 'table') this.touchedBoard(f)
    if (this.frozen(view)) return
    // The lift bridge first: a touch within a cell of a lifted stroke or ghost goes on with it, even within a muncher's reach, so a fingertip that skips by a muncher never lays half a belt.
    const b = this.bridge
    if (b !== null) {
      this.bridge = null
      if (Math.hypot(sx - b.x, sy - b.y) <= view.cell) {
        Object.assign(f, { role: b.finger.role, cells: b.finger.cells, axis: b.finger.axis, sticker: b.finger.sticker, dx: b.finger.dx, dy: b.finger.dy, tool: b.finger.tool })
        this.board = f
        this.follow(s, view, f, sx, sy)
        return
      }
      this.release(b.finger, true)
    }
    // Munchers win every other touch on the down, before the board and the tool are asked.
    if (hit.kind === 'muncher') {
      this.send({ kind: 'tickle', id: hit.id })
      return
    }
    if (hit.kind === 'table' || !this.take(f)) return
    // During the launch a press is a tap for the rules to answer (a tap on the rocket pops its number), never an edit.
    if (s.launch !== null) {
      f.role = 'press'
      return
    }
    let tool = s.tool
    if (press === 'right') {
      if (tool.kind !== 'peel') this.send({ kind: 'tool', tool: PEEL })
      tool = PEEL
    }
    if (tool.kind === 'sticker') {
      // The finger takes over a ghost that was following the mouse.
      this.hovering = false
      f.role = 'ghost'
      f.sticker = tool.sticker
      f.tool = tool
      this.send({ kind: 'hold', ...this.held(view, f, sx, sy) })
      return
    }
    // The drawing tools dig; the peel's touch on a patch is a tap, for the rules to answer.
    if ((hit.kind === 'patch' || hit.kind === 'pond') && tool.kind !== 'peel') {
      f.role = 'dig'
      f.cell = hit.cell
      this.send({ kind: 'dig', cell: hit.cell, down: true })
      return
    }
    f.role = 'press'
    if (hit.kind === 'spot') {
      const g = hintGhost(s, t)!
      f.sticker = g.sticker
      f.dx = g.x + SIZE[g.sticker] / 2 - bx
      f.dy = g.y + SIZE[g.sticker] / 2 - by
    }
    const fp = hit.kind === 'building' || hit.kind === 'stack' ? buildingBox(s.buildings.find((x) => x.id === hit.id)!) : hit.kind === 'burrow' ? burrowBox(hit.burrow) : null
    if (fp !== null && fp.w > 1 && inBox(fp, bx, by)) {
      f.footprint = fp
      f.last = f.cell
    }
  }

  /**
   * A finger pressed on a sticker in the tray (the HUD's button, the hedge's too) at (sx, sy):
   * dragged out of the tray onto the board, the sticker is picked and its ghost follows the
   * finger (the hedge's drag draws a hedge line); lifted without leaving the tray, the button's
   * own tap picks it and the router does nothing. The launch takes no tray press.
   */
  tray(s: State, view: View, id: number, sticker: Sticker, sx: number, sy: number, t: number, press: Press): void {
    this.settle(t, false)
    this.track(id, sx, sy, t, press, { kind: 'table' }, null, this.frozen(view) || s.launch !== null ? 'inert' : 'tray', sticker)
  }

  /** A pointer moved to (sx, sy) with its button down. */
  move(s: State, view: View, id: number, sx: number, sy: number, t: number): void {
    this.settle(t, false)
    const f = this.fingers.get(id)
    if (f === undefined || (sx === f.x && sy === f.y)) return
    f.x = sx
    f.y = sy
    if (f.role === 'inert' || f.role === 'dig' || this.frozen(view)) return
    this.follow(s, view, f, sx, sy)
  }

  /**
   * A pointer lifted at (sx, sy). A press is a tap on what it went down on, within TAP_FOR
   * and SLOP of it; a dig ends; a ghost whose footprint's middle is over the tray goes back with
   * nothing placed; any other stroke or ghost waits BRIDGE for a touch that goes on with it, then
   * commits. The finger is forgotten whatever the rules make of what it sends.
   */
  up(s: State, view: View, id: number, sx: number, sy: number, t: number): void {
    const f = this.fingers.get(id)
    if (f === undefined) return
    try {
      this.move(s, view, id, sx, sy, t)
      if (this.board !== f) return
      // While the view moves under it, a lift only lets go.
      if (this.frozen(view)) return this.stop(f)
      if (f.role === 'stroke') {
        this.endTurn(s, view, f, sx, sy)
        this.bridge = { finger: f, at: t, x: sx, y: sy, ticks: 0 }
      } else if (f.role === 'ghost') {
        const [mx, my] = f.touch ? [sx, sy - gripLift(view, SIZE[f.sticker as Placeable])] : [sx, sy]
        if (view.hud.tray !== null && inBox(view.hud.tray, mx, my)) this.stop(f)
        else this.bridge = { finger: f, at: t, x: sx, y: sy, ticks: 0 }
      } else if (f.role === 'press' && !f.strayed && t - f.at <= TAP_FOR) {
        this.ride(s, f)
        this.board = null
        f.role = 'inert'
        this.send({ kind: 'tap', hit: f.hit })
      } else this.stop(f)
    } finally {
      this.forget(f)
    }
  }

  /** A pointer was cancelled (iPadOS took the touch): its stroke or ghost drops with nothing placed, its dig ends, and it taps nothing. */
  cancel(id: number, t: number): void {
    this.settle(t, false)
    const f = this.fingers.get(id)
    if (f === undefined) return
    this.forget(f)
    if (this.board === f) this.stop(f)
  }

  /** The mouse moved to (sx, sy) with no button down: hover names what a click would take, and a picked sticker's ghost follows the pointer (over the table it greys, strokes.ts). */
  hoverAt(s: State, view: View, sx: number, sy: number, t: number): void {
    this.settle(t, false)
    if (this.board !== null || this.frozen(view) || s.launch !== null) {
      this.hover = null
      return
    }
    this.hover = hitTest(s, view, sx, sy, t)
    if (s.tool.kind !== 'sticker') return
    const [bx, by] = toBoard(view, sx, sy)
    this.hovering = true
    this.send({ kind: 'hold', x: bx, y: by })
  }

  /** The mouse left the canvas (for the HUD, or the window): nothing is hovered, and a hovering ghost goes with nothing placed. */
  leave(): void {
    this.hover = null
    if (!this.hovering) return
    this.hovering = false
    this.send({ kind: 'release', commit: false })
  }

  /**
   * The frame's tick at sim time t: a lifted stroke or ghost that nothing went on with commits;
   * a press on a riding thing follows it through the hop; under the turn-me picture the
   * board's finger lets go with nothing done; and once a
   * launch runs a stroke, a ghost or a dig lets go too, while a press waits to be its tap.
   */
  tick(s: State, view: View, t: number): void {
    this.settle(t, true)
    if (this.bridge !== null) this.bridge.ticks++
    const f = this.board
    if (f !== null && f.role === 'press') this.ride(s, f)
    if (this.frozen(view)) {
      this.bridge = null
      if (f !== null) this.stop(f)
    } else if (s.launch !== null) {
      this.bridge = null
      if (f !== null && f.role !== 'press') this.stop(f)
    }
  }

  /** The window turned, the page hid or the game paused: a stroke or ghost drops with nothing placed (a lifted one too), a dig ends, a hovering ghost goes, and every finger down is forgotten, so its lift taps nothing. */
  drop(): void {
    this.bridge = null
    if (this.board !== null) this.stop(this.board)
    this.leave()
    if (this.touching > 0) this.send({ kind: 'touch', down: false })
    this.touching = 0
    this.fingers.clear()
  }

  /** Whether the board takes no input at all: a phone held upright shows the turn-me picture. (During the launch it takes taps: `s.launch`.) */
  private frozen(view: View): boolean {
    return view.hud.held === 'turnMe'
  }

  /** A new finger in the router's map, down at (sx, sy) at t on `hit`. */
  private track(id: number, sx: number, sy: number, t: number, press: Press, hit: Hit, area: Area | null, role: Finger['role'], sticker: Sticker | null): Finger {
    const f: Finger = { id, role, touched: false, touch: press === 'touch' || press === 'heel', at: t, x0: sx, y0: sy, x: sx, y: sy, hit, area, strayed: false, cell: -1, footprint: null, last: -1, cells: [], axis: null, sticker, dx: 0, dy: 0, tool: null, hop: -1 }
    this.fingers.set(id, f)
    return f
  }

  /** Finger f is on the board: a touch for the kind rules. */
  private touchedBoard(f: Finger): void {
    f.touched = true
    this.touching++
    this.send({ kind: 'touch', down: true })
  }

  /** Finger f lifted or was cancelled: the last one off the board tells the kind rules. */
  private forget(f: Finger): void {
    this.fingers.delete(f.id)
    if (!f.touched) return
    this.touching--
    if (this.touching === 0) this.send({ kind: 'touch', down: false })
  }

  /** The board for finger f: when it is free, or from a finger that has started no stroke and no ghost, which hands it on at once and is inert from then on (a heel or a thumb resting on the glass; one resting on a patch or the pond stops digging). A stroke or a ghost keeps it. */
  private take(f: Finger): boolean {
    const b = this.board
    if (b !== null) {
      if (b.role === 'stroke' || b.role === 'ghost') return false
      this.stop(b)
    }
    this.board = f
    return true
  }

  /** The board's finger f lets go with nothing done: a stroke or a ghost drops with nothing placed, a dig ends. */
  private stop(f: Finger): void {
    if (f.role === 'stroke' || f.role === 'ghost') this.send({ kind: 'release', commit: false })
    if (f.role === 'dig') this.send({ kind: 'dig', cell: f.cell, down: false })
    f.role = 'inert'
    if (this.board === f) this.board = null
  }

  /** Finger f's stroke or ghost ends: laid or placed (commit), or dropped. */
  private release(f: Finger, commit: boolean): void {
    this.send({ kind: 'release', commit })
    f.role = 'inert'
    if (this.board === f) this.board = null
  }

  /** Finger f's stroke or ghost was dropped by the rules (another tool picked meanwhile): it lets go, sending nothing more, and is inert. */
  private letGo(f: Finger): void {
    f.role = 'inert'
    if (this.board === f) this.board = null
  }

  /** A lifted stroke or ghost that nothing went on with within BRIDGE commits: at a frame's tick (`ticked`), or as another pointer comes, unless that comes in the frame right after the lift's (a frame under ?fast is longer than BRIDGE, and a fingertip back on the glass a moment after it skipped comes in the next one). */
  private settle(t: number, ticked: boolean): void {
    const b = this.bridge
    if (b === null || t - b.at <= BRIDGE || (!ticked && b.ticks === 1)) return
    this.bridge = null
    this.release(b.finger, true)
  }

  /** Where finger f at (sx, sy) holds its ghost: a finger by the sticker's bottom edge, its footprint's middle above the fingertip; the mouse at the pointer (where it took hold of the hint's spot). */
  private held(view: View, f: Finger, sx: number, sy: number): { x: number; y: number } {
    if (f.touch) {
      const [x, y] = heldAt(view, sx, sy, SIZE[f.sticker as Placeable])
      return { x, y }
    }
    const [bx, by] = toBoard(view, sx, sy)
    return { x: bx + f.dx, y: by + f.dy }
  }

  /** A press on a thing riding a belt follows it through each hop since it last looked (belts.from), so the tap at its lift carries the thing she pressed wherever it has ridden; gone into a machine, the slot's own answer is left. */
  private ride(s: State, f: Finger): void {
    if (f.hit.kind !== 'thing') return
    const hop = hopOf(s)
    if (hop === f.hop) return
    f.hop = hop
    const now = s.belts.from.indexOf(f.hit.slot)
    if (now >= 0) f.hit = { kind: 'thing', slot: now }
  }

  /**
   * Finger f is at (sx, sy): a ghost follows it, a stroke draws on toward it, a tray press
   * that left the tray picks its sticker and holds it (the hedge's starts a hedge line), and a
   * press may become a stroke or a ghost drag from the hint's spot. A stroke or a ghost whose
   * tool another pick has replaced lets go.
   */
  private follow(s: State, view: View, f: Finger, sx: number, sy: number): void {
    const [bx, by] = toBoard(view, sx, sy)
    const pickSticker = (sticker: Placeable) => {
      if (s.tool.kind !== 'sticker' || s.tool.sticker !== sticker) this.send({ kind: 'tool', tool: { kind: 'sticker', sticker } })
      f.role = 'ghost'
      f.sticker = sticker
      f.tool = s.tool
      this.send({ kind: 'hold', ...this.held(view, f, sx, sy) })
    }
    switch (f.role) {
      case 'ghost':
        if (!sameTool(s.tool, f.tool!)) return this.letGo(f)
        this.send({ kind: 'hold', ...this.held(view, f, sx, sy) })
        return
      case 'stroke':
        if (!sameTool(s.tool, f.tool!)) return this.letGo(f)
        this.draw(f, bx, by, view)
        return
      case 'tray':
        if (inBox(view.hud.tray!, sx, sy)) return
        if (!this.take(f)) {
          f.role = 'inert'
          return
        }
        this.touchedBoard(f)
        if (f.sticker !== 'hedge') return pickSticker(f.sticker!)
        // The hedge's button dragged out: the hedge in hand, and its line from the first open cell the finger enters.
        if (s.tool.kind !== 'hedge') this.send({ kind: 'tool', tool: { kind: 'hedge' } })
        f.role = 'stroke'
        f.tool = s.tool
        f.cells = []
        f.axis = null
        this.draw(f, bx, by, view)
        return
      case 'press': {
        if (f.area !== null && areaDistance(f.area, sx, sy) > SLOP) f.strayed = true
        // During the launch a press stays a tap.
        if (s.launch !== null) return
        const travel = Math.hypot(sx - f.x0, sy - f.y0)
        if (f.hit.kind === 'spot') {
          if (travel >= STROKE_TRAVEL) pickSticker(f.sticker as Placeable)
          return
        }
        const cell = cellAt(bx, by)
        if (f.footprint !== null) {
          if (inBox(f.footprint, bx, by)) {
            f.last = cell
            return
          }
          // Just off the footprint it is still a tap on the machine: a stroke begins SLOP off it, from the cell it left by.
          if (areaDistance({ kind: 'box', ...screenBox(view, f.footprint) }, sx, sy) <= SLOP) return
          f.cells = [f.last]
        } else if (ANSWERS.has(f.hit.kind)) {
          if (!f.strayed || cell === f.cell) return
          f.cells = [f.cell]
        } else {
          if (travel < STROKE_TRAVEL || cell === f.cell) return
          f.cells = [f.cell]
        }
        f.role = 'stroke'
        f.axis = null
        f.tool = s.tool
        this.draw(f, bx, by, view)
        return
      }
      case 'inert':
      case 'dig':
        return
    }
  }

  /** A stroke draws on toward board point (bx, by): the cells so far go to the rules whenever they change. A hedge line out of the tray begins at the first open cell the finger enters. */
  private draw(f: Finger, bx: number, by: number, view: View): void {
    if (f.cells.length === 0) {
      if (!onBoard(Math.floor(bx), Math.floor(by))) return
      f.cells.push(cellAt(bx, by))
      this.send({ kind: 'drag', cells: [...f.cells] })
      return
    }
    const n = f.cells.length
    f.axis = trace(f.cells, f.axis, bx, by, Math.max(LOCK, LOCK_PX / view.cell))
    if (f.cells.length !== n) this.send({ kind: 'drag', cells: [...f.cells] })
  }

  /**
   * A belt stroke's lift at (sx, sy): the cell under the finger, next to the stroke's end and not the
   * cell before it, is the stroke's last turn when the stroke then ends in a mouth, a join or a
   * feed (what she drew to), or on open ground once the finger is END_TURN cells into it. The
   * axis lock keeps a wobbly finger in its row until it is LOCK off the row's middle; a finger
   * that stops on the turn into a machine is already where she means.
   */
  private endTurn(s: State, view: View, f: Finger, sx: number, sy: number): void {
    const cells = f.cells
    // A belt's turn: a hedge line or a peel drag has no mouth to end in, and the peel would take the cell next door.
    if (cells.length === 0 || f.tool!.kind !== 'pencil') return
    const [bx, by] = toBoard(view, sx, sy)
    const c = cellAt(bx, by)
    const end = cells[cells.length - 1]!
    const dx = xOf(c) - xOf(end)
    const dy = yOf(c) - yOf(end)
    if (Math.abs(dx) + Math.abs(dy) !== 1 || c === cells[cells.length - 2]) return
    const longer = [...cells, c]
    const sign = planStroke(s, longer, hintPath(s)).sign
    // How far the finger is into c from the edge it shares with the end.
    const into = dx > 0 ? bx - xOf(c) : dx < 0 ? xOf(c) + 1 - bx : dy > 0 ? by - yOf(c) : yOf(c) + 1 - by
    const open = s.belts.out[c]! < 0 && s.owner[c]! < 0 && s.hedge[c] === 0 && !blocked(s, c)
    if (sign !== 'mouth' && sign !== 'zip' && sign !== 'feed' && !(open && sign !== 'stop' && into >= END_TURN)) return
    f.cells = longer
    this.send({ kind: 'drag', cells: [...longer] })
  }
}

/**
 * A key down (KeyboardEvent.code, `ctrl` with Ctrl or Cmd held) as an Action for the rules or
 * a command for the shell, at sim time t; null when the game leaves the key to the browser.
 * 1 to 9 pick the sticker kinds in PLACEABLE's order (the digger is always 1, the oven 2), B
 * the pencil (on the lit pencil its next pattern, as a tap on its button), H the hedge, X the
 * peel, Z or Ctrl+Z Oops, Space tickles the muncher nearest the view's middle (`middle`, a board point), Enter presses
 * Play and closes a card, Esc or P the pause menu, M the sound, F full screen.
 */
export function keyAction(s: State, t: number, code: string, ctrl: boolean, middle: Point): Action | Shell | null {
  if (ctrl) return code === 'KeyZ' ? { kind: 'oops' } : null
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  if (digit !== null) return { kind: 'tool', tool: { kind: 'sticker', sticker: PLACEABLE[Number(digit[1]) - 1]! } }
  switch (code) {
    case 'KeyB':
      return s.tool.kind === 'pencil' ? { kind: 'pattern' } : { kind: 'tool', tool: { kind: 'pencil' } }
    case 'KeyH':
      return { kind: 'tool', tool: { kind: 'hedge' } }
    case 'KeyX':
      return { kind: 'tool', tool: PEEL }
    case 'KeyZ':
      return { kind: 'oops' }
    case 'Space': {
      // The muncher nearest the view's middle that a tickle would still send home.
      let best: { id: number; d: number } | null = null
      for (const m of s.munchers) {
        if (m.mode === 'home' || m.mode === 'watch' || m.mode === 'caught') continue
        const p = muncherPoint(m, t)
        const d = (p.x - middle.x) ** 2 + (p.y - middle.y) ** 2
        if (best === null || d < best.d) best = { id: m.id, d }
      }
      return best === null ? null : { kind: 'tickle', id: best.id }
    }
    case 'Enter':
      return !s.playing ? { kind: 'play' } : s.card !== null ? { kind: 'card' } : null
    case 'Escape':
    case 'KeyP':
      return 'pause'
    case 'KeyM':
      return { kind: 'sound', on: !s.switches.sound }
    case 'KeyF':
      return 'fullscreen'
  }
  return null
}
