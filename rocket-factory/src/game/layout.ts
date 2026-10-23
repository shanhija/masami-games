import { BURROWS, FLOWER_OF, GROUND, cellOf, onBoard } from './board'
import { BEEP_FLY, GHOST_DELAY, HELP_FULL, SIZE } from './catalog'
import { COLS, ROWS, SLOTS, STEP, since, type BeepPic, type Hit, type Placeable, type State } from './model'
import { basketPoint, beepPoint, buildingBox, burrowBox, heapPoint, moonyPoint, muncherPoint, napSpot, stackBox, thingPoint, type Box, type Point } from './where'

/**
 * The board on the screen, as pure functions: the HUD's frame on a window (hudFrame), the
 * one board-to-screen map (View, toScreen, toBoard; the camera that makes a View is
 * camera.ts), the board cells a screen box shows (cellsIn), and what a touch lands on (targets,
 * hitTest) in the plan's hit order, only for what is in view. The renderer draws through the
 * same map at where.ts's points, so a picture and its tap never disagree; the sim never knows
 * where the view is. The design is plans/rocket-factory.md: The board and the view, Beep and
 * the child's hands, The HUD.
 */

// ---------------------------------------------------------------------------------------
// The HUD's frame

/** CSS px along each edge of the window that the system keeps (env(safe-area-inset-*)): the home indicator, a phone's notch. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * How the window is held. sideways: an iPad or a laptop; upright: an iPad held upright (a
 * taller window on the same board, its own tray row); phone: a phone on its side, the board
 * seen between the HUD's columns; turnMe: a phone held upright, which shows a picture asking her to turn it and takes
 * no board input (the HUD does not fit across it).
 */
export type Held = 'sideways' | 'upright' | 'phone' | 'turnMe'

/** The HUD's parts on a window, in CSS px. The HUD lays itself out in exactly these, and the board fits in `free`. */
export interface HudFrame {
  held: Held
  /** What the board is seen in: the window less the HUD, the side gutters and the safe areas. A touch outside it is on the table and never takes the board. */
  free: Box
  /** The top strip: pause at the left, the rocket card in the middle, the lab card at the right, and upright the peel and Oops too. Null on a phone. */
  strip: Box | null
  /** A phone's left column: pause, the rocket and lab cards, the peel and Oops. Null elsewhere. */
  column: Box | null
  /** The tray's band: its buttons sit in it in arrival order, `button` px a side and `gap` apart, in one row (on a phone in PHONE_COLS columns), where trayBoxes puts them. Null with the turn-me picture. */
  tray: Box | null
  button: number
  gap: number
}

/** The top strip's height. */
export const STRIP = 64
/** The tray is its buttons with TRAY_PAD above and below (88 px with 72 px buttons), and its bottom stands TRAY_LIFT plus the bottom inset above the screen's edge, so a sticker dragged up from a button's lower edge never starts the iPad's Dock swipe. */
export const TRAY_PAD = 8
export const TRAY_LIFT = 16
/** The side gutters: on a touch screen wide enough to keep a stroke from the left column out of Safari's back swipe. */
export const GUTTER = { touch: 20, mouse: 8 } as const
/** Tray buttons are 72 px on a window WIDE px across or more, 64 below, 60 upright and at most 56 on a phone, GAP apart; the gap closes to MIN_GAP before a button shrinks, so a full row always fits. */
const WIDE = 1100
const BUTTON = { wide: 72, narrow: 64, upright: 60, phone: 56 } as const
const GAP = 10
const MIN_GAP = 4
/** The most buttons in the tray's row: the pencil, the nine sticker kinds, the hedge, the peel and Oops. Upright the peel and Oops sit in the strip. */
const TRAY_ROW = { sideways: 13, upright: 11 } as const
/**
 * A window whose shorter side is under PHONE px is a phone. Its HUD keeps PHONE_PAD round the
 * board and between its buttons; its left column holds PHONE_COLUMN buttons (pause, the rocket
 * and lab cards, the peel and Oops), and its tray the eleven others in PHONE_COLS columns. A
 * button is 56 px wherever the column's height allows, as every target is (MIN_TARGET), so the
 * tray takes three columns' width: that costs a pixel of cell.
 */
const PHONE = 500
const PHONE_PAD = 4
const PHONE_COLUMN = 5
const PHONE_COLS = 3

/**
 * The HUD's frame on a window w x h CSS px, on a touch screen or not, with its safe areas:
 * the 64 px top strip, the tray standing 16 px plus the bottom inset above the screen's edge,
 * side gutters of 20 px on a touch screen (8 with a mouse), and the board in what is left. A
 * phone on its side keeps its cards in a left column and its tray in PHONE_COLS columns at the
 * right, each inside the safe areas.
 */
export function hudFrame(w: number, h: number, touch: boolean, safe: Insets): HudFrame {
  const left = safe.left
  const right = w - safe.right
  const top = safe.top
  const bottom = h - safe.bottom
  const phone = Math.min(w, h) < PHONE
  if (phone && h > w) return { held: 'turnMe', free: { x: left, y: top, w: right - left, h: bottom - top }, strip: null, column: null, tray: null, button: 0, gap: 0 }
  if (phone) {
    // The buttons' height runs from under the top inset to TRAY_LIFT over the bottom one; the board takes the whole height between the columns.
    const rows = bottom - TRAY_LIFT - (top + PHONE_PAD)
    const button = Math.min(BUTTON.phone, Math.floor((rows - (PHONE_COLUMN - 1) * PHONE_PAD) / PHONE_COLUMN))
    const side = button + 2 * PHONE_PAD
    const trayW = PHONE_COLS * button + (PHONE_COLS + 1) * PHONE_PAD
    return {
      held: 'phone',
      free: { x: left + side, y: top + PHONE_PAD, w: right - trayW - (left + side), h: bottom - top - 2 * PHONE_PAD },
      strip: null,
      column: { x: left, y: top + PHONE_PAD, w: side, h: rows },
      tray: { x: right - trayW, y: top + PHONE_PAD, w: trayW, h: rows },
      button,
      gap: PHONE_PAD,
    }
  }
  const held = h > w ? 'upright' : 'sideways'
  const gutter = touch ? GUTTER.touch : GUTTER.mouse
  const n = TRAY_ROW[held]
  const inner = right - left - 2 * gutter - 2 * TRAY_PAD
  const base = held === 'upright' ? BUTTON.upright : w >= WIDE ? BUTTON.wide : BUTTON.narrow
  const gap = Math.min(GAP, Math.floor((inner - n * base) / (n - 1)))
  const button = gap >= MIN_GAP ? base : Math.floor((inner - (n - 1) * MIN_GAP) / n)
  const trayH = button + 2 * TRAY_PAD
  const tray = { x: left + gutter, y: bottom - TRAY_LIFT - trayH, w: right - left - 2 * gutter, h: trayH }
  return {
    held,
    free: { x: left + gutter, y: top + STRIP, w: right - left - 2 * gutter, h: tray.y - (top + STRIP) },
    strip: { x: left, y: top, w: right - left, h: STRIP },
    column: null,
    tray,
    button,
    gap: Math.max(MIN_GAP, gap),
  }
}

/**
 * The tray's backing paper and its n buttons in order (the pencil, the stickers in arrival
 * order, the hedge, and sideways the peel and Oops), CSS px: sideways and upright one row
 * centred in the frame's band, TRAY_PAD inside the backing; on a phone PHONE_COLS columns from
 * the band's top left, PHONE_PAD apart and in. Tray.tsx lays the tray out in exactly these and
 * the scripted children press them, so the two never disagree.
 */
export function trayBoxes(f: HudFrame, n: number): { backing: Box; buttons: Box[] } {
  const band = f.tray
  if (band === null) throw new Error('no tray on this screen')
  const k = f.button + f.gap
  if (f.held === 'phone') {
    const cols = Math.min(PHONE_COLS, n)
    const rows = Math.ceil(n / PHONE_COLS)
    return {
      backing: { x: band.x, y: band.y, w: cols * k - f.gap + 2 * PHONE_PAD, h: rows * k - f.gap + 2 * PHONE_PAD },
      buttons: Array.from({ length: n }, (_, i) => ({ x: band.x + PHONE_PAD + (i % PHONE_COLS) * k, y: band.y + PHONE_PAD + Math.floor(i / PHONE_COLS) * k, w: f.button, h: f.button })),
    }
  }
  const w = n * k - f.gap + 2 * TRAY_PAD
  const x0 = band.x + (band.w - w) / 2
  return { backing: { x: x0, y: band.y, w, h: band.h }, buttons: Array.from({ length: n }, (_, i) => ({ x: x0 + TRAY_PAD + i * k, y: band.y + TRAY_PAD, w: f.button, h: f.button })) }
}

// ---------------------------------------------------------------------------------------
// The map

/** A frame's view (camera.ts viewOf): the canvas in CSS px and its pixel ratio, CSS px per cell, where the board's origin is on the screen, and the HUD's frame it is seen through. */
export interface View {
  w: number
  h: number
  dpr: number
  /** CSS px per cell. */
  cell: number
  /** The screen point (CSS px) of the board's point (0, 0). */
  ox: number
  oy: number
  hud: HudFrame
}

/** The screen point (CSS px) of board point (x, y), in cells. */
export const toScreen = (v: View, x: number, y: number): [number, number] => [v.ox + x * v.cell, v.oy + y * v.cell]

/** The board point (cells) under screen point (sx, sy): toScreen's inverse. */
export const toBoard = (v: View, sx: number, sy: number): [number, number] => [(sx - v.ox) / v.cell, (sy - v.oy) / v.cell]

/** The board point at the middle of the free area. */
export function middleOf(v: View): Point {
  const f = v.hud.free
  const [x, y] = toBoard(v, f.x + f.w / 2, f.y + f.h / 2)
  return { x, y }
}

/** The board cells [x0, x1) x [y0, y1) that a screen box (CSS px) touches, clamped to the board (empty when the box shows none of it): what a frame bakes and what a touch can land on. */
export function cellsIn(v: View, b: Box): { x0: number; y0: number; x1: number; y1: number } {
  const [bx0, by0] = toBoard(v, b.x, b.y)
  const [bx1, by1] = toBoard(v, b.x + b.w, b.y + b.h)
  const x0 = Math.min(COLS, Math.max(0, Math.floor(bx0)))
  const y0 = Math.min(ROWS, Math.max(0, Math.floor(by0)))
  return { x0, y0, x1: Math.max(x0, Math.min(COLS, Math.ceil(bx1))), y1: Math.max(y0, Math.min(ROWS, Math.ceil(by1))) }
}

/**
 * Feedback floats above the fingertip, since her hand comes from below and covers 40 to 55 px:
 * the stroke's end sign rides fingerLift px up the screen from the finger (touch.ts
 * Router.finger) on a thin stem, 0.8 cell and at least 44 px, while the stroke's cells are
 * drawn where they go.
 */
export const fingerLift = (v: View) => Math.max(0.8 * v.cell, 44)

/**
 * A held sticker rides wholly above the fingertip that holds it, for the same reason: a finger
 * holds it by its bottom edge, its footprint's middle n / 2 + GRIP cells up the screen from the
 * fingertip (its dashed rim, drawn 0.15 cell outside the footprint, just touches the fingertip).
 * Its picture is drawn over its own footprint, so it lands where she sees it, and the snap and
 * the hint's spot work where the sticker is. A mouse pointer covers nothing and holds a ghost
 * at the pointer.
 */
export const GRIP = 0.15
/** How far up the screen from the fingertip, CSS px, the footprint's middle of a held sticker of n cells rides. */
export const gripLift = (v: View, n: number) => (n / 2 + GRIP) * v.cell
/** The board point a finger at screen point (sx, sy) holds a sticker of n cells at: its footprint's middle, gripLift up the screen. */
export const heldAt = (v: View, sx: number, sy: number, n: number) => toBoard(v, sx, sy - gripLift(v, n))
/** Where a fingertip goes to hold a sticker of n cells with its footprint's middle at board point (x, y): heldAt's inverse, for the hint's hand and the scripted children's carries. */
export function fingerFor(v: View, x: number, y: number, n: number): [number, number] {
  const [sx, sy] = toScreen(v, x, y)
  return [sx, sy + gripLift(v, n)]
}

/** A board box on the screen. */
export function screenBox(v: View, b: Box): Box {
  const [x, y] = toScreen(v, b.x, b.y)
  return { x, y, w: b.w * v.cell, h: b.h * v.cell }
}

/** A spot in the picture of the n-cell footprint whose top-left cell is (x, y), given in cells from the picture's top-left (the frame of where.ts stackBox and napSpot), on the screen: the picture stands round the footprint's middle. */
export function pictureSpot(v: View, x: number, y: number, n: number, px: number, py: number): [number, number] {
  const [mx, my] = toScreen(v, x + n / 2, y + n / 2)
  return [mx + (px - n / 2) * v.cell, my + (py - n / 2) * v.cell]
}

// ---------------------------------------------------------------------------------------
// What a touch lands on

/** A tap area on the screen, CSS px: a box, or a disc round a point. */
export type Area = { kind: 'box'; x: number; y: number; w: number; h: number } | { kind: 'disc'; x: number; y: number; r: number }
/** A thing a touch can land on: its Hit, its place in the hit order (RANK, the lower wins) and its area on the screen. */
export interface Target {
  hit: Hit
  rank: number
  area: Area
}

/**
 * Every target is grown to at least MIN_TARGET px across (SLOP all round a point), since cells
 * of 43 to 53 px are paths for strokes, not tap targets; and a touch that slid no further than
 * SLOP off what it went down on is still a tap on it (touch.ts), as a press on a HUD button is
 * (onButton). A muncher answers a touch within muncherReach of where it is or was
 * MUNCHER_TRAIL seconds ago: at the start view one walks 60 px a second, and a five-year-old's tap lands
 * late and off. The reach is MUNCHER_REACH px where cells are big, at most REACH_CELLS cells
 * where they are small (a phone's 25 px cells, where three munchers out would otherwise leave
 * her drawing finger a third of the board), and never less than SLOP round the muncher's body.
 */
export const SLOP = 28
export const MIN_TARGET = 2 * SLOP
export const MUNCHER_REACH = 72
const REACH_CELLS = 1.5
export const MUNCHER_TRAIL = 0.25
export const muncherReach = (v: View) => Math.max(SLOP + BODY.muncher.r * v.cell, Math.min(MUNCHER_REACH, REACH_CELLS * v.cell))

/** Whether a press at (x, y) is on the HUD button with box b: inside it grown by SLOP all round. A button acts on a lift that is (Btn.tsx), so a press that slides a little still presses it, as a tap on the board does. */
export const onButton = (b: Box, x: number, y: number) => x >= b.x - SLOP && x <= b.x + b.w + SLOP && y >= b.y - SLOP && y <= b.y + b.h + SLOP

/**
 * The hit order, the lower first: munchers win every touch; then the hint's sticker ghost (a
 * tap places it, and the patch under a digger's ghost never digs), heaps and the basket, Moony,
 * towers and bowls, a maker's roof stack, machines and the pad and the burrows, things on
 * belts, belts, bare patches and the pond, Beep when idle, hedges, flowers, trees, bare ground.
 */
export const RANK = { muncher: 0, spot: 1, heap: 2, moony: 3, tower: 4, stack: 5, building: 6, thing: 7, belt: 8, patch: 9, beep: 10, hedge: 11, flowers: 12, tree: 13, ground: 14 } as const

/**
 * The pictures' tap areas round their points, in cells, upright on the screen: a character's
 * body is a disc of `r` centred `up` above its feet, a heap's pile grows up from its point,
 * the basket sits on its cell's middle and a thing on a belt is a disc of its size
 * (draw/things.ts ON_BELT across). Grown to MIN_TARGET, none is smaller than a fingertip. The
 * hint's hand (draw/hand.ts) taps these bodies too.
 */
export const BODY = {
  muncher: { up: 0.38, r: 0.36 },
  beep: { up: 0.35, r: 0.33 },
  moony: { up: 0.3, r: 0.3 },
  heap: { up: 0.2, r: 0.32 },
  basket: { up: 0, r: 0.4 },
  thing: { up: 0, r: 0.23 },
} as const

/** Beep answers a tap only while idle (floating, waving, stretching, yawning, asleep or cheering, and not on its way to a job): a working Beep takes no taps, so the taps meant for its job go through. */
const IDLE: ReadonlySet<BeepPic['pose']> = new Set(['float', 'wave', 'stretch', 'yawn', 'sleep', 'cheer'])

/**
 * The hint's sticker ghost on the board at sim time t, or null: a New! sticker, one more of
 * the slowest machine, or a tower or a bowl of the planned defence, at the step's spot (the
 * footprint's top-left cell). A tower or a bowl shows none until the belt under its cell
 * exists: before that its dotted belt is the step (frame.ts), and a tap on a ghost with no belt
 * under it could only fly back. A kind she has placed HELP_FULL times herself shows its ghost only
 * GHOST_DELAY after the step came, and one more of a machine peeled since the hint looked
 * shows none. Nor does a ghost whose spot a machine took since the hint looked (the one she
 * just placed there): the hint looks again only every HINT_EVERY, and until then a touch on
 * her new machine is the machine's, so a belt drawn straight out of it is a belt. The
 * renderer draws it here and a tap on it is a 'spot'.
 */
export function hintGhost(s: State, t: number): { sticker: Placeable; x: number; y: number } | null {
  if (s.hint === null) return null
  const step = s.hint.step
  const ghost =
    step.kind === 'place'
      ? { sticker: step.sticker, x: step.x, y: step.y }
      : step.kind === 'bottleneck' && step.sticker !== null && s.buildings.some((b) => b.id === step.id)
        ? { sticker: step.sticker, x: step.x, y: step.y }
        : step.kind === 'defend' && step.sticker !== 'hedge' && s.belts.out[cellOf(step.x, step.y)]! >= 0
          ? { sticker: step.sticker, x: step.x, y: step.y }
          : null
  if (ghost === null || s.owner[cellOf(ghost.x, ghost.y)]! >= 0 || (s.help.placed[ghost.sticker] >= HELP_FULL && since(s.hint.at, t) < GHOST_DELAY * STEP)) return null
  return ghost
}

/** The hint's dotted path while a link or the belt a tower or a bowl of the defence needs bounces, else null: a stroke that traces it lays it (strokes.ts planStroke), so the ghost, the router's lift and the commit all plan with it. */
export function hintPath(s: State): readonly number[] | null {
  if (s.hint === null) return null
  const step = s.hint.step
  if (step.kind === 'link') return step.path
  return step.kind === 'defend' && step.sticker !== 'hedge' && step.cells.length > 0 ? step.cells : null
}

/**
 * Every target in view at sim time t, where the frame at t draws it (where.ts), in no
 * particular order: what a tap can land on, and what ?debug outlines. Munchers count anywhere;
 * of the rest only what the free area shows (the cells a finger there could land on, and the
 * buildings, burrows and things whose boxes touch it): off the board there is nothing else
 * (hitTest answers 'table' there).
 */
export function targets(s: State, view: View, t: number): Target[] {
  const out: Target[] = []
  const k = view.cell
  const reach = muncherReach(view)
  // What is in view: the cells of the free area grown by MIN_TARGET all round (a touch outside it is on the table), and the boxes, a cell larger all round, that touch them.
  const f = view.hud.free
  const seen = cellsIn(view, { x: f.x - MIN_TARGET, y: f.y - MIN_TARGET, w: f.w + 2 * MIN_TARGET, h: f.h + 2 * MIN_TARGET })
  const shows = (b: Box) => b.x - 1 < seen.x1 && b.x + b.w + 1 > seen.x0 && b.y - 1 < seen.y1 && b.y + b.h + 1 > seen.y0
  const box = (hit: Hit, rank: number, b: Box) => out.push({ hit, rank, area: { kind: 'box', ...screenBox(view, b) } })
  const disc = (hit: Hit, rank: number, p: Point, up: number, r: number) => {
    const [x, y] = toScreen(view, p.x, p.y)
    out.push({ hit, rank, area: { kind: 'disc', x, y: y - up * k, r } })
  }
  // A napper answers anywhere on the building it naps on, and round where its picture curls up on the roof (where.ts napSpot, in the picture's frame from the footprint's top-left on the screen).
  const nappers = new Set<number>()
  for (const b of s.buildings) {
    if (b.napper < 0) continue
    nappers.add(b.napper)
    box({ kind: 'muncher', id: b.napper }, RANK.muncher, buildingBox(b))
    const p = napSpot(b)
    const [x, y] = pictureSpot(view, b.x, b.y, SIZE[b.kind], p.x, p.y - BODY.muncher.up)
    out.push({ hit: { kind: 'muncher', id: b.napper }, rank: RANK.muncher, area: { kind: 'disc', x, y, r: reach } })
  }
  // Every other muncher where it is and where it was a moment ago; watching the launch by the pad, it takes no taps.
  for (const m of s.munchers) {
    if (m.mode === 'watch' || nappers.has(m.id)) continue
    for (const at of [t, t - MUNCHER_TRAIL]) {
      const p = muncherPoint(m, at)
      disc({ kind: 'muncher', id: m.id }, RANK.muncher, p, BODY.muncher.up + p.lift, reach)
    }
  }
  const ghost = hintGhost(s, t)
  if (ghost !== null) box({ kind: 'spot' }, RANK.spot, { x: ghost.x, y: ghost.y, w: SIZE[ghost.sticker], h: SIZE[ghost.sticker] })
  s.burrows.forEach((b, i) => {
    const p = heapPoint(i)
    if (b.heap.some((n) => n > 0) && shows({ x: p.x, y: p.y, w: 0, h: 0 })) disc({ kind: 'heap', burrow: i }, RANK.heap, p, BODY.heap.up, BODY.heap.r * k)
  })
  disc({ kind: 'basket' }, RANK.heap, basketPoint, BODY.basket.up, BODY.basket.r * k)
  if (s.launches > 0) disc({ kind: 'moony' }, RANK.moony, moonyPoint, BODY.moony.up, BODY.moony.r * k)
  for (const b of s.buildings) {
    if (!shows(buildingBox(b))) continue
    if (b.kind === 'tower' || b.kind === 'bowl') {
      box({ kind: 'building', id: b.id }, RANK.tower, buildingBox(b))
      continue
    }
    // The stack is part of the upright picture: its box is in the picture's frame, from the footprint's top-left corner on the screen.
    if (b.stack.length > 0) {
      const st = stackBox(b)
      const [x, y] = pictureSpot(view, b.x, b.y, SIZE[b.kind], st.x, st.y)
      out.push({ hit: { kind: 'stack', id: b.id }, rank: RANK.stack, area: { kind: 'box', x, y, w: st.w * k, h: st.h * k } })
    }
    box({ kind: 'building', id: b.id }, RANK.building, buildingBox(b))
  }
  BURROWS.forEach((_, i) => {
    if (shows(burrowBox(i))) box({ kind: 'burrow', burrow: i }, RANK.building, burrowBox(i))
  })
  for (let slot = 0; slot < SLOTS; slot++) if (s.belts.slot[slot]! >= 0) disc({ kind: 'thing', slot }, RANK.thing, thingPoint(s, slot, t), BODY.thing.up, BODY.thing.r * k)
  if (IDLE.has(s.beep.pose) && since(s.beep.movedAt, t) >= BEEP_FLY * STEP) disc({ kind: 'beep' }, RANK.beep, beepPoint(s.beep, t), BODY.beep.up, BODY.beep.r * k)
  // Each cell in view no building covers (the pad and the mounds are covered), as its one kind: a belt, a hedge or stump, a bare patch, a pond, a tree, flowers or bare ground. A rock cell under a belt or a hedge is not bare, so it never digs.
  for (let y = seen.y0; y < seen.y1; y++)
    for (let x = seen.x0; x < seen.x1; x++) {
      const c = cellOf(x, y)
      if (s.owner[c]! >= 0) continue
      const g = GROUND[c]!
      const cell = { x, y, w: 1, h: 1 }
      if (s.belts.out[c]! >= 0) box({ kind: 'belt', cell: c }, RANK.belt, cell)
      else if (s.hedge[c]! > 0) box({ kind: 'hedge', cell: c }, RANK.hedge, cell)
      else if (g === 'blue' || g === 'gold') box({ kind: 'patch', cell: c }, RANK.patch, cell)
      else if (g === 'pond') box({ kind: 'pond', cell: c }, RANK.patch, cell)
      else if (g === 'tree') box({ kind: 'tree', cell: c }, RANK.tree, cell)
      else if (FLOWER_OF[c]! >= 0) box({ kind: 'flowers', cell: c }, RANK.flowers, cell)
      else if (g === 'grass') box({ kind: 'ground', cell: c }, RANK.ground, cell)
    }
  return out
}

/** Whether an area, grown to MIN_TARGET across, holds the point. */
function holds(a: Area, x: number, y: number): boolean {
  if (a.kind === 'disc') return (x - a.x) ** 2 + (y - a.y) ** 2 <= Math.max(a.r, SLOP) ** 2
  const gx = Math.max(0, (MIN_TARGET - a.w) / 2)
  const gy = Math.max(0, (MIN_TARGET - a.h) / 2)
  return x >= a.x - gx && x <= a.x + a.w + gx && y >= a.y - gy && y <= a.y + a.h + gy
}

/** How far the point (CSS px) is outside an area, 0 inside it. */
export function areaDistance(a: Area, x: number, y: number): number {
  if (a.kind === 'disc') return Math.max(0, Math.hypot(x - a.x, y - a.y) - a.r)
  return Math.hypot(Math.max(a.x - x, 0, x - (a.x + a.w)), Math.max(a.y - y, 0, y - (a.y + a.h)))
}

/**
 * What the CSS-px point (sx, sy) lands on at sim time t, and the area of the target it
 * landed on (null off the board): the router keeps the area, to tell whether a touch slid more
 * than SLOP off it. A muncher first, anywhere. Then outside the free area, or off the board,
 * the table (the gutters and the table round the board never take it). On the board, the
 * first target in the hit order whose area, grown to MIN_TARGET, holds the point; among equals
 * the nearest middle.
 */
export function pick(s: State, view: View, sx: number, sy: number, t: number): { hit: Hit; area: Area | null } {
  const all = targets(s, view, t)
  const best = (munchers: boolean): Target | null => {
    let win: Target | null = null
    let winD = Infinity
    for (const tg of all) {
      if ((tg.rank === RANK.muncher) !== munchers || !holds(tg.area, sx, sy)) continue
      const a = tg.area
      const d = a.kind === 'disc' ? Math.hypot(sx - a.x, sy - a.y) : Math.hypot(sx - (a.x + a.w / 2), sy - (a.y + a.h / 2))
      if (win === null || tg.rank < win.rank || (tg.rank === win.rank && d < winD)) {
        win = tg
        winD = d
      }
    }
    return win
  }
  const muncher = best(true)
  if (muncher !== null) return { hit: muncher.hit, area: muncher.area }
  const table = { hit: { kind: 'table' } as const, area: null }
  const f = view.hud.free
  if (sx < f.x || sx > f.x + f.w || sy < f.y || sy > f.y + f.h) return table
  const [bx, by] = toBoard(view, sx, sy)
  if (!onBoard(Math.floor(bx), Math.floor(by))) return table
  const tg = best(false)
  if (tg === null) throw new Error(`no target at board point ${bx}, ${by}: every open cell is one`)
  return { hit: tg.hit, area: tg.area }
}

/** What the CSS-px point (sx, sy) on the view lands on at sim time t (pick's hit). */
export const hitTest = (s: State, view: View, sx: number, sy: number, t: number): Hit => pick(s, view, sx, sy, t).hit
