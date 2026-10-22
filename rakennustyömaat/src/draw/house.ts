import { HOME_COLS, HOUSE_GRID, SHAPE_SIZE } from '../game/catalog'
import { CELL, DEPTH, FLOOR_BAND, LIFT_W, POST, ROOF_H, SLAB, TOP, doorRects, gridLeft, rect, type Rect } from '../game/layout'
import { MATERIALS, ROOFS, SHAPES, type HouseKind, type Material, type RoofStyle, type Shape } from '../game/model'
import { drawCat } from './animals'
import {
  BOX,
  C,
  MATERIAL_LOOK,
  TAU,
  blob,
  box,
  circlePath,
  detail,
  groundShadow,
  heartPath,
  ink,
  loop,
  lw,
  mix,
  part,
  phaseOf,
  roundRectPath,
  scaled,
  shine,
  smooth,
  starPath,
  tube,
  type Faces,
  type SheetEntry,
} from './look'

/**
 * The houses: each room's frame in its material (posts, slab, top, with the top and right
 * faces where they show), the bare inside of a room with no theme yet, the roofs in four
 * styles, the tall house's glass lift and front door, the row house's doors, the blueprint
 * of an empty grid and the ghost of a room about to be placed.
 *
 * Everything built is a made thing in the material's MATERIAL_LOOK faces and marks: brick
 * courses in running bond, plank boards with grain and nails, concrete elements with seams
 * and tie holes, glass panes with glints, rainbow bands in C.rainbow order. One set of mark
 * helpers lays them out from the origin, so the marks of a room, the room on it and its roof
 * line up. Roofs are drawn over one column each and know nothing of their neighbours: every
 * style is built so that two columns of the same height join into one roof (a row of
 * gables, a row of domes on one drum, one terrace, one castle wall).
 */

// ---------------------------------------------------------------------------------------
// The palette beyond look.ts

/** The houses' own colours: the bare room, the lift's and railings' glass, the tower's window. */
const HOUSE = {
  /** The bare room: a plain warm wall, a skirting a shade darker, plain boards with their seams tone on tone. */
  bareWall: '#FFE4BC',
  bareSkirt: '#F9D3A0',
  bareFloor: '#E2B47E',
  bareSeam: '#D29E66',
  /** The lift's and the railings' glass: lighter than a glass room's frame, so what is behind it shows. */
  pane: 'rgba(214, 242, 252, 0.35)',
  paneSide: 'rgba(150, 214, 238, 0.55)',
  slit: '#3A4466',
} as const
/** The lift's car, a cheerful red so it reads through the glass at street size. */
const CAR: Faces = { face: '#FF5A5A', top: '#FF8A80', side: '#D93A3A' }
/** The tall house's lobby at the lift's foot: a little cream box. */
const LOBBY_LOOK: Faces = { face: '#FFF4DC', top: '#FFFFFF', side: '#E9DCC0' }
/** The front doors: the tall house's teal one, and the row house's homes left to right in red, yellow and green, so each home reads as its own (street.ts paints each home's mailbox in its door's colour). */
const TALL_DOOR: Faces = { face: '#1FB5A8', top: '#4FCBC0', side: '#138A80' }
export const HOME_DOORS: readonly Faces[] = [{ face: '#FF5A5A', top: '#FF8A80', side: '#D93A3A' }, BOX.yellow, { face: '#3FB45A', top: '#6CCB7F', side: '#2A8A41' }]
/** The row house's door windows, left to right: a second sign of whose door is whose. */
const ROW_WINDOWS = ['round', 'heart', 'star'] as const
/** The rainbow's bands on a lit top face and on a dark right face, in C.rainbow's order. */
const RAINBOW_TOP = ['#FF8A80', '#FFBC75', '#FFE680', '#84E394', '#86C6FF', '#C5A6FF'] as const
const RAINBOW_SIDE = ['#D93A3A', '#D97B1A', '#D9A800', '#2FA84A', '#2A82D9', '#7F55D9'] as const
/** The tower's flag on each material's house (the rainbow house flies a rainbow). */
const FLAG: Record<Material, string> = { planks: '#FF5A5A', bricks: '#FFD93A', concrete: '#FF7AB6', glass: '#FF9F3A', rainbow: '#FF5A5A' }
/** The roof terrace's railing on each material's house (the glass house has a glass balustrade under a steel rail). */
const RAIL_LOOK: Record<Material, string> = { planks: MATERIAL_LOOK.planks.side, bricks: C.white, concrete: BOX.steel.top, glass: BOX.steel.top, rainbow: C.white }
/** The roof garden's flowers. */
const FLOWERS = [C.heart, C.rainbow[2], C.rainbow[5]] as const

// ---------------------------------------------------------------------------------------
// The material marks

/** Bricks: a course is this tall, a brick this long. */
const COURSE = 0.1
const BRICK = 0.24
/** Planks: a board is this wide and this long between its butt joints; a nail's radius. */
const BOARD = 0.1
const BOARD_LEN = 1.2
const NAIL = 0.016
/** Concrete: a tie hole's radius, and the holes' spacing along an element. */
const TIE = 0.022
const TIE_EVERY = 0.6
/** Rainbow: each band is this wide. */
const BAND = 0.2

const mod = (n: number, m: number) => ((n % m) + m) % m
/** The first of the marks every `step` metres (shifted by `offset`) from the origin at or after `from`: marks laid out from the origin line up across parts. */
const first = (from: number, step: number, offset: number) => Math.ceil((from - offset - 1e-6) / step) * step + offset
/** A mark line's width: the detail weight, never under 12 mm so the marks read in the big views. */
const markW = () => Math.max(lw('detail'), 0.012)

/** Adds a segment to the current path. */
function seg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
}
/** Adds a round dot to the current path. */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arc(x, y, r, 0, TAU)
}
/** Strokes the current path in a mark colour (marks never carry ink) and begins a fresh one. */
function stroke(ctx: CanvasRenderingContext2D, colour: string, width: number) {
  ctx.lineWidth = width
  ctx.strokeStyle = colour
  ctx.stroke()
  ctx.beginPath()
}
/** Fills the current path flat and begins a fresh one. */
function fill(ctx: CanvasRenderingContext2D, colour: string) {
  ctx.fillStyle = colour
  ctx.fill()
  ctx.beginPath()
}
/** The top face over the front edge (x, y)-(x + w, y), receding up-right by d. */
function topPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + d, y - d)
  ctx.lineTo(x + w + d, y - d)
  ctx.lineTo(x + w, y)
  ctx.closePath()
}
/** The right face beside the front edge (x, y)-(x, y + h), receding up-right by d. */
function sidePath(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, d: number) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + d, y - d)
  ctx.lineTo(x + d, y + h - d)
  ctx.lineTo(x, y + h)
  ctx.closePath()
}

/**
 * A material's marks on the front face (x, y, w, h), clipped to it. A face wider than tall
 * is a lying member (a top, a slab, a parapet) and one taller than wide a standing one (a
 * post): bricks run in courses either way, boards and bands run along the member. At S
 * detail only the boldest mark stays.
 */
function faceMarks(ctx: CanvasRenderingContext2D, m: Material, x: number, y: number, w: number, h: number, lod: 'S' | 'M' | 'L') {
  const look = MATERIAL_LOOK[m]
  const fine = lod !== 'S'
  const across = w >= h
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.beginPath()
  switch (m) {
    case 'bricks': {
      // Running bond; a standing member a brick end on, its joints half a brick up the middle.
      if (fine) {
        const wide = w >= BRICK
        for (let c = 0; c * COURSE < h - 1e-6; c++) {
          const cy = y + c * COURSE
          if (c > 0 || !wide) seg(ctx, x, cy, x + w, cy)
          const odd = mod(Math.round(cy / COURSE), 2) === 1
          const foot = Math.min(cy + COURSE, y + h)
          if (wide) for (let jx = x + (odd ? BRICK : BRICK / 2); jx < x + w - 0.01; jx += BRICK) seg(ctx, jx, cy, jx, foot)
          else if (odd) seg(ctx, x + w / 2, cy, x + w / 2, foot)
        }
      } else if (across && h >= 2 * COURSE - 1e-6) seg(ctx, x, y + h / 2, x + w, y + h / 2)
      stroke(ctx, look.mark, markW())
      break
    }
    case 'planks': {
      // Boards along the member, butt joints a board length apart and staggered, grain, a nail by every board end.
      const len = across ? w : h
      const n = Math.max(1, Math.round((across ? h : w) / BOARD))
      const bt = (across ? h : w) / n
      const at = (u: number, v: number): [number, number] => (across ? [x + u, y + v] : [x + v, y + u])
      const line = (u0: number, v0: number, u1: number, v1: number) => seg(ctx, ...at(u0, v0), ...at(u1, v1))
      const ends: [number, number][] = []
      for (let i = 0; i < n; i++) {
        if (i > 0) line(0, i * bt, len, i * bt)
        ends.push([0.05, i], [len - 0.05, i])
        for (let u = BOARD_LEN * (i % 2 === 1 ? 0.5 : 1); u < len - 0.15; u += BOARD_LEN) {
          line(u, i * bt, u, (i + 1) * bt)
          ends.push([u - 0.05, i], [u + 0.05, i])
        }
      }
      stroke(ctx, look.mark, markW())
      if (!fine) break
      for (let i = 0; i < n; i++)
        for (let u = 0.3 + (i % 2) * 0.45; u < len - 0.5; u += 0.9) {
          ctx.moveTo(...at(u, (i + 0.62) * bt))
          ctx.quadraticCurveTo(...at(u + 0.2, (i + 0.22) * bt), ...at(u + 0.45, (i + 0.55) * bt))
        }
      stroke(ctx, look.mark, markW())
      for (const [u, i] of ends) dot(ctx, ...at(u, (i + 0.5) * bt), NAIL)
      fill(ctx, look.mark)
      break
    }
    case 'concrete': {
      // An element per cell, a seam between them; tie holes in a row along the middle.
      if (across) for (let sx = first(x + 0.01, CELL, 0); sx < x + w - 0.01; sx += CELL) seg(ctx, sx, y, sx, y + h)
      else for (let sy = first(y + 0.01, CELL, 0); sy < y + h - 0.01; sy += CELL) seg(ctx, x, sy, x + w, sy)
      stroke(ctx, look.mark, markW())
      if (across && (fine || h >= SLAB - 1e-6)) for (let hx = first(x + 0.05, TIE_EVERY, TIE_EVERY / 2); hx < x + w - 0.05; hx += TIE_EVERY) dot(ctx, hx, y + h / 2, h < SLAB - 1e-6 ? TIE * 0.7 : TIE)
      else if (!across && fine) for (let hy = first(y + 0.3, TIE_EVERY, 0); hy < y + h - 0.2; hy += TIE_EVERY) dot(ctx, x + w / 2, hy, TIE * 0.8)
      fill(ctx, look.mark)
      break
    }
    case 'glass': {
      // A pane's edge every half cell, and glints in diagonal pairs.
      if (across) for (let sx = first(x + 0.05, CELL / 2, 0); sx < x + w - 0.05; sx += CELL / 2) seg(ctx, sx, y, sx, y + h)
      else for (let sy = first(y + 0.05, CELL / 2, 0); sy < y + h - 0.05; sy += CELL / 2) seg(ctx, x, sy, x + w, sy)
      stroke(ctx, look.mark, markW())
      ctx.lineCap = 'round'
      if (across && h >= 0.15)
        for (let gx = first(x, 0.8, 0.25); gx < x + w - 0.2; gx += 0.8) {
          seg(ctx, gx, y + h - 0.04, gx + 0.1, y + 0.04)
          seg(ctx, gx + 0.1, y + h - 0.04, gx + 0.16, y + h * 0.45)
        }
      else if (!across && fine) for (let gy = first(y, 0.9, 0.4); gy < y + h - 0.3; gy += 0.9) seg(ctx, x + 0.03, gy + 0.18, x + w - 0.03, gy)
      stroke(ctx, look.mark, Math.max(lw('line'), 0.02))
      ctx.lineCap = 'butt'
      break
    }
    case 'rainbow': {
      // Bands across a lying member, stripes up a standing one, three colours on so a corner never repeats one.
      if (across)
        for (let i = Math.floor(x / BAND); i * BAND < x + w; i++) {
          ctx.rect(i * BAND, y, BAND, h)
          fill(ctx, C.rainbow[mod(i, C.rainbow.length)]!)
        }
      else
        for (let i = Math.floor(y / BAND); i * BAND < y + h; i++) {
          ctx.rect(x, i * BAND, w, BAND)
          fill(ctx, C.rainbow[mod(i + 3, C.rainbow.length)]!)
        }
      break
    }
  }
  ctx.restore()
}

/** A material's marks on the right face beside (x, y)-(x, y + h), receding by d, clipped to it: the courses and boards run back along it. */
function sideMarks(ctx: CanvasRenderingContext2D, m: Material, x: number, y: number, h: number, d: number, lod: 'S' | 'M' | 'L') {
  const look = MATERIAL_LOOK[m]
  const fine = lod !== 'S'
  ctx.save()
  sidePath(ctx, x, y, h, d)
  ctx.clip()
  ctx.beginPath()
  switch (m) {
    case 'bricks':
      if (!fine) break
      for (let cy = first(y, COURSE, 0); cy < y + h + 1e-6; cy += COURSE) {
        seg(ctx, x, cy, x + d, cy - d)
        if (lod === 'L' && cy < y + h - 1e-6 && mod(Math.round(cy / COURSE), 2) === 0) seg(ctx, x + d / 2, cy - d / 2, x + d / 2, cy - d / 2 + COURSE)
      }
      stroke(ctx, look.mark, markW())
      break
    case 'planks':
      for (let cy = first(y + 0.01, 2 * BOARD, 0); cy < y + h - 0.01; cy += 2 * BOARD) seg(ctx, x, cy, x + d, cy - d)
      stroke(ctx, look.mark, markW())
      break
    case 'concrete':
      for (let cy = first(y + 0.01, CELL, 0); cy < y + h - 0.01; cy += CELL) seg(ctx, x, cy, x + d, cy - d)
      stroke(ctx, look.mark, markW())
      if (fine) for (let cy = first(y + 0.2, TIE_EVERY, TIE_EVERY / 2); cy < y + h - 0.1; cy += TIE_EVERY) dot(ctx, x + d / 2, cy - d / 2, TIE * 0.8)
      fill(ctx, look.mark)
      break
    case 'glass':
      ctx.lineCap = 'round'
      for (let cy = first(y + 0.3, CELL / 2, 0.4); cy < y + h - 0.1; cy += CELL / 2) {
        seg(ctx, x + d * 0.25, cy + 0.06, x + d * 0.7, cy - 0.3)
        if (fine) seg(ctx, x + d * 0.55, cy + 0.1, x + d * 0.8, cy - 0.08)
      }
      stroke(ctx, look.mark, Math.max(lw('line'), 0.02))
      ctx.lineCap = 'butt'
      break
    case 'rainbow':
      for (let i = Math.floor(y / BAND); i * BAND < y + h; i++) {
        ctx.moveTo(x, i * BAND)
        ctx.lineTo(x + d, i * BAND - d)
        ctx.lineTo(x + d, (i + 1) * BAND - d)
        ctx.lineTo(x, (i + 1) * BAND)
        ctx.closePath()
        fill(ctx, RAINBOW_SIDE[mod(i + 3, RAINBOW_SIDE.length)]!)
      }
      break
  }
  ctx.restore()
}

/** A material's marks on the top face over (x, y)-(x + w, y), receding by d, clipped to it. */
function topMarks(ctx: CanvasRenderingContext2D, m: Material, x: number, y: number, w: number, d: number, lod: 'S' | 'M' | 'L') {
  const look = MATERIAL_LOOK[m]
  ctx.save()
  topPath(ctx, x, y, w, d)
  ctx.clip()
  ctx.beginPath()
  switch (m) {
    case 'bricks':
      // Two courses of bricks lying across the top, at L.
      if (lod !== 'L') break
      seg(ctx, x + d / 2, y - d / 2, x + w + d / 2, y - d / 2)
      for (let jx = x + BRICK / 2; jx < x + w; jx += BRICK) seg(ctx, jx, y, jx + d / 2, y - d / 2)
      for (let jx = x + BRICK; jx < x + w; jx += BRICK) seg(ctx, jx + d / 2, y - d / 2, jx + d, y - d)
      stroke(ctx, look.mark, markW())
      break
    case 'planks':
      seg(ctx, x + d / 2, y - d / 2, x + w + d / 2, y - d / 2)
      stroke(ctx, look.mark, markW())
      break
    case 'concrete':
      for (let sx = first(x + 0.01, CELL, 0); sx < x + w - 0.01; sx += CELL) seg(ctx, sx, y, sx + d, y - d)
      stroke(ctx, look.mark, markW())
      break
    case 'glass':
      for (let sx = first(x + 0.05, CELL / 2, 0); sx < x + w - 0.05; sx += CELL / 2) seg(ctx, sx, y, sx + d, y - d)
      stroke(ctx, look.mark, markW())
      break
    case 'rainbow':
      for (let i = Math.floor(x / BAND); i * BAND < x + w; i++) {
        ctx.moveTo(i * BAND, y)
        ctx.lineTo(i * BAND + d, y - d)
        ctx.lineTo((i + 1) * BAND + d, y - d)
        ctx.lineTo((i + 1) * BAND, y)
        ctx.closePath()
        fill(ctx, RAINBOW_TOP[mod(i, RAINBOW_TOP.length)]!)
      }
      break
  }
  ctx.restore()
}

/** A block of the material, as look.ts `box` draws one, with the material's marks on every face that shows. */
function solid(ctx: CanvasRenderingContext2D, m: Material, x: number, y: number, w: number, h: number, d: number, top: boolean, right: boolean, lod: 'S' | 'M' | 'L') {
  const look = MATERIAL_LOOK[m]
  if (top) {
    topPath(ctx, x, y, w, d)
    fill(ctx, look.top)
    topMarks(ctx, m, x, y, w, d, lod)
  }
  if (right) {
    sidePath(ctx, x + w, y, h, d)
    fill(ctx, look.side)
    sideMarks(ctx, m, x + w, y, h, d, lod)
  }
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  fill(ctx, look.face)
  faceMarks(ctx, m, x, y, w, h, lod)
  if (top) {
    topPath(ctx, x, y, w, d)
    ink(ctx, 'edge')
  }
  if (right) {
    sidePath(ctx, x + w, y, h, d)
    ink(ctx, 'edge')
  }
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ink(ctx, 'edge')
}

// ---------------------------------------------------------------------------------------
// The room frame

/**
 * A room's frame, drawn over its inside; origin at the room rect's top-left (layout.roomRect).
 * `top` and `right`: the top and right faces show (nothing on top of it, nothing right of it).
 *
 * The frame is the cut through the room's walls and slabs, as in a doll's house: the slab
 * under it (SLAB), a post at each side (POST) and the top (TOP), in the material's face
 * colour with its marks, and where nothing stands against it the outside of the wall: a top
 * face and a right face receding up-right by DEPTH in the material's top and side tints.
 * The outline is inked at the edge weight, the opening and the seams between the faces at
 * the line weight, the material's marks (mortar, grain and nails, seams and tie holes,
 * glints, stripes) in its mark colour; at S detail only the boldest marks stay. A glass
 * frame is see-through and leaves the opening clear, so the room inside shows as well as
 * any other.
 */
export function drawRoomFrame(ctx: CanvasRenderingContext2D, shape: Shape, material: Material, top: boolean, right: boolean, t: number): void {
  void t
  const { w: cols, h: rows } = SHAPE_SIZE[shape]
  const W = cols * CELL
  const H = rows * CELL
  const D = DEPTH
  const look = MATERIAL_LOOK[material]
  const lod = detail(H)
  const members = [
    [0, 0, W, TOP],
    [0, H - SLAB, W, SLAB],
    [0, TOP, POST, H - TOP - SLAB],
    [W - POST, TOP, POST, H - TOP - SLAB],
  ] as const
  ctx.save()
  ctx.lineJoin = 'round'
  if (top) {
    topPath(ctx, 0, 0, W, D)
    fill(ctx, look.top)
    topMarks(ctx, material, 0, 0, W, D, lod)
  }
  if (right) {
    sidePath(ctx, W, 0, H, D)
    fill(ctx, look.side)
    sideMarks(ctx, material, W, 0, H, D, lod)
  }
  ctx.beginPath()
  for (const [x, y, w, h] of members) ctx.rect(x, y, w, h)
  fill(ctx, look.face)
  for (const [x, y, w, h] of members) faceMarks(ctx, material, x, y, w, h, lod)

  // Ink: the opening and the seams at the line weight, the outline at the edge weight.
  ctx.beginPath()
  ctx.rect(POST, TOP, W - 2 * POST, H - TOP - SLAB)
  if (top) seg(ctx, 0, 0, W, 0)
  if (right) seg(ctx, W, 0, W, H)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, 0)
  if (top) {
    ctx.lineTo(D, -D)
    ctx.lineTo(W + D, -D)
    if (!right) ctx.lineTo(W, 0)
  } else {
    ctx.lineTo(W, 0)
    if (right) ctx.lineTo(W + D, -D)
  }
  if (right) ctx.lineTo(W + D, H - D)
  ctx.lineTo(W, H)
  ctx.closePath()
  ink(ctx, 'edge')
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The bare room

/** The bare room's sign: its board, how far under the ceiling it hangs, its sleepy sway (a tilt, how far either way, the period), and how it grows with the room (from a small room's inside up to GROW times). */
const SIGN = { w: 0.68, h: 0.54, hang: 0.4, tilt: -0.07, sway: 0.05, period: 3.4, room: 2.16 * 2.1, grow: 1.35 }
/** The skirting along the bare wall's foot. */
const SKIRT = 0.12

/**
 * The inside of a room with no theme yet: a plain warm wall with a skirting, plain boards,
 * and a little sign hanging crooked from the ceiling on two strings with a big cobalt
 * question mark, swaying sleepily: an empty room that says "pick me". Origin at the
 * interior's top-left, w x h (the caller clips). The wall and the floor are backdrop (no
 * ink); the sign is inked, a thing in the room.
 */
export function drawBareRoom(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.save()
  ctx.fillStyle = HOUSE.bareWall
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = HOUSE.bareSkirt
  ctx.fillRect(0, h - FLOOR_BAND - SKIRT, w, SKIRT)
  ctx.fillStyle = HOUSE.bareFloor
  ctx.fillRect(0, h - FLOOR_BAND, w, FLOOR_BAND)
  ctx.beginPath()
  for (let sx = 0.45; sx < w; sx += 0.9) seg(ctx, sx, h - FLOOR_BAND, sx, h)
  seg(ctx, 0, h - FLOOR_BAND / 2, w, h - FLOOR_BAND / 2)
  stroke(ctx, HOUSE.bareSeam, markW())

  // The sign, bigger in a bigger room, hanging from a hook in the ceiling's middle.
  const k = Math.min(SIGN.grow, Math.max(1, Math.sqrt((w * h) / SIGN.room)))
  const sway = SIGN.tilt + SIGN.sway * Math.sin(TAU * loop(t, SIGN.period, 0))
  ctx.translate(w / 2, 0)
  ctx.scale(k, k)
  ctx.rotate(sway)
  const sw = SIGN.w / 2
  const top = SIGN.hang
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-sw + 0.08, top + 0.02)
  ctx.lineTo(0, 0.04)
  ctx.lineTo(sw - 0.08, top + 0.02)
  ink(ctx, 'detail')
  circlePath(ctx, 0, 0.04, 0.03)
  part(ctx, BOX.steel.top, 'detail')
  roundRectPath(ctx, -sw, top, SIGN.w, SIGN.h, 0.07)
  part(ctx, C.paper, 'line')
  for (const nx of [-sw + 0.08, sw - 0.08]) {
    circlePath(ctx, nx, top + 0.05, 0.02)
    part(ctx, BOX.steel.top, 'detail')
  }
  // The question mark: a hook and a dot, breathing slowly as if dozing.
  const breath = 1 + 0.04 * Math.sin(TAU * loop(t, SIGN.period / 2, 0.25))
  ctx.translate(0, top + SIGN.h / 2)
  ctx.scale(breath, breath)
  ctx.beginPath()
  ctx.arc(0, -0.07, 0.1, Math.PI * 1.05, Math.PI * 2.25)
  ctx.quadraticCurveTo(0, 0, 0, 0.06)
  tube(ctx, 0.065, BOX.cobalt.face)
  circlePath(ctx, 0, 0.155, 0.045)
  part(ctx, BOX.cobalt.face, 'detail')
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The roofs

/** A roof's pop when its style changes: it grows from its foot to a little over its size by POP_UP, and settles by POP_SETTLE. */
const POP_UP = 0.18
const POP_SETTLE = 0.7
const POP_OVER = 1.08
/** The pointed roof: its eaves stick out this far either side, its peak this high; TILE_ROWS rows of tiles (one per rainbow colour), the fish-scale tiles this round; the attic window's radius. */
const EAVE = 0.08
const PEAK = 1.3
const TILE_ROWS = 6
const SCALE_R = 0.1
const ATTIC = 0.19
/** The round roof: a drum DRUM tall, the dome DOME tall on it, the knob on top. */
const DRUM = 0.24
const DOME = 0.92
const KNOB = 0.075
/** The flat roof: its parapet slab, the railing's height over it, a post every RAIL_EVERY. */
const PARAPET = 0.2
const RAIL = 0.42
const RAIL_EVERY = 0.6
/** The tower roof: the castle wall along the column and its merlons, one every MERLON_EVERY; the tower behind it; the flagpole's top. */
const WALL = 0.34
const MERLON = { w: 0.3, h: 0.18 }
const MERLON_EVERY = 0.6
const TOWER = { w: 1.1, top: 1.2 }
const POLE_TOP = 1.74
/** Every style through its pop stays within this much left of its column, right of its receding faces (w + DEPTH) and over ROOF_H (the build view keeps 0.6 m over the roofs). */
const ROOF_REACH = { side: 0.3, up: 0.6 }

/**
 * A roof piece over one column, origin at its bottom-left, `w` wide and ROOF_H tall; `age`
 * seconds since the style changed (a pop). Over a column of the material of its top room:
 *
 * - pointed: a gable of tiles (fish scales of clay, wooden shingles, concrete tiles, glass
 *   panes, rows of the rainbow) with a round attic window, its right slope receding lit;
 *   neighbours make a row of gables.
 * - round: a dome on a drum with a gold knob (a rainbow dome is a rainbow, a glass one
 *   shines); neighbours share one drum.
 * - garden: a flat roof whose lawn holds a little apple tree and flowers behind a railing;
 *   neighbours share one terrace and one rail.
 * - tower: a castle wall with merlons and a tower behind it flying a flag; neighbours make
 *   one wall with a row of towers.
 *
 * It reaches up to ROOF_H + 0.4 (the flag) and right to w + DEPTH. `left` is false when the
 * column on its left stands taller, `right` when the column on its right does: the roof then
 * stops at that column's wall (x = 0 or x = w), so its eave and its receding faces never
 * paint over the rooms beside it, as the rooms are drawn before the roofs.
 */
export function drawRoof(ctx: CanvasRenderingContext2D, style: RoofStyle, material: Material, w: number, left: boolean, right: boolean, age: number, t: number): void {
  const a = Math.min(Math.max(age, 0), POP_SETTLE)
  const sy = a < POP_UP ? mix(0.2, POP_OVER, smooth(0, POP_UP, a)) : mix(POP_OVER, 1, smooth(POP_UP, POP_SETTLE, a))
  const sx = sy < 1 ? mix(0.9, 1, sy) : 1 / Math.sqrt(sy)
  const look = MATERIAL_LOOK[material]
  const lod = detail(CELL)
  const fine = lod !== 'S'
  const D = DEPTH
  ctx.save()
  if (!left || !right) {
    // Cut at a taller column's wall before the pop's scale, so the cut stays on the wall while the roof pops.
    const x0 = left ? -ROOF_REACH.side : 0
    const x1 = right ? w + D + ROOF_REACH.side : w
    ctx.beginPath()
    ctx.rect(x0, -ROOF_H - ROOF_REACH.up, x1 - x0, ROOF_H + ROOF_REACH.up)
    ctx.clip()
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.translate(w / 2 + D / 2, 0)
  ctx.scale(sx, sy)
  ctx.translate(-w / 2 - D / 2, 0)
  switch (style) {
    case 'pointed': {
      const l = -EAVE
      const r = w + EAVE
      const X = w / 2
      const Y = -PEAK
      const rh = PEAK / TILE_ROWS
      /** The right slope's edge at height y (y from -PEAK to 0). */
      const edge = (y: number) => mix(r, X, -y / PEAK)
      const lines = material === 'bricks' ? look.side : material === 'rainbow' ? C.white : look.mark
      // The right slope, receding up-right as the lit face, its rows running back along it.
      const slope = () => {
        ctx.beginPath()
        ctx.moveTo(X, Y)
        ctx.lineTo(r, 0)
        ctx.lineTo(r + D, -D)
        ctx.lineTo(X + D, Y - D)
        ctx.closePath()
      }
      slope()
      fill(ctx, look.top)
      for (let i = 0; i < TILE_ROWS; i++) {
        const y0 = Y + i * rh
        const y1 = y0 + rh
        if (material === 'rainbow') {
          ctx.moveTo(edge(y0), y0)
          ctx.lineTo(edge(y1), y1)
          ctx.lineTo(edge(y1) + D, y1 - D)
          ctx.lineTo(edge(y0) + D, y0 - D)
          ctx.closePath()
          fill(ctx, RAINBOW_TOP[i]!)
        } else if (i > 0 && (fine || i % 2 === 0)) seg(ctx, edge(y0), y0, edge(y0) + D, y0 - D)
      }
      stroke(ctx, material === 'bricks' ? look.face : lines, markW())
      slope()
      ink(ctx, 'edge')
      // The gable: its rows of tiles, then the attic window.
      const front = () => {
        ctx.beginPath()
        ctx.moveTo(l, 0)
        ctx.lineTo(X, Y)
        ctx.lineTo(r, 0)
        ctx.closePath()
      }
      front()
      fill(ctx, look.face)
      ctx.save()
      front()
      ctx.clip()
      ctx.beginPath()
      if (material === 'rainbow')
        for (let i = 0; i < TILE_ROWS; i++) {
          ctx.rect(l, Y + i * rh, r - l, rh)
          fill(ctx, C.rainbow[i]!)
        }
      for (let i = 1; i <= TILE_ROWS; i++) {
        const yb = Y + i * rh
        /** The gable's half width at the row's foot: the tiles stop at its edges. */
        const half = ((r - l) / 2) * (i / TILE_ROWS)
        if (!fine) {
          if (i % 2 === 0 && i < TILE_ROWS) seg(ctx, l, yb, r, yb)
          continue
        }
        switch (material) {
          case 'bricks':
          case 'rainbow':
            // Fish scales: each row's tiles round at the foot, every other row half a tile over.
            for (let cx = X + (i % 2) * SCALE_R - Math.ceil(half / (2 * SCALE_R)) * 2 * SCALE_R; cx < X + half + SCALE_R; cx += 2 * SCALE_R) {
              ctx.moveTo(cx + SCALE_R, yb - SCALE_R)
              ctx.arc(cx, yb - SCALE_R, SCALE_R, 0, Math.PI)
            }
            break
          case 'planks':
          case 'concrete': {
            // Boards across the gable, their butt joints staggered row on row; concrete tiles square in a grid.
            const step = material === 'planks' ? BOARD_LEN * 0.75 : 0.4
            if (i < TILE_ROWS) seg(ctx, l, yb, r, yb)
            const shift = material === 'planks' ? (i % 2) * step * 0.5 : 0
            for (let jx = X + shift - Math.floor(half / step) * step; jx < X + half; jx += step) seg(ctx, jx, yb - rh, jx, yb)
            break
          }
          case 'glass':
            if (i === 2 || i === 4) seg(ctx, l, yb, r, yb)
            break
        }
      }
      if (material === 'glass') {
        for (const k of [-2, -1, 0, 1, 2]) seg(ctx, X, Y, X + (k * (r - l)) / 5, 0)
        stroke(ctx, lines, markW())
        ctx.lineCap = 'round'
        for (const [gx, gy] of [
          [X - 0.42, -0.25],
          [X + 0.2, -0.62],
        ] as const) {
          seg(ctx, gx, gy, gx + 0.12, gy - 0.2)
          seg(ctx, gx + 0.1, gy + 0.02, gx + 0.17, gy - 0.1)
        }
        stroke(ctx, lines, Math.max(lw('line'), 0.022))
      } else stroke(ctx, lines, markW())
      if (material === 'planks' && fine) {
        // The boards' grain, a lazy curve on each, the rows wider down the gable.
        for (let i = 1; i < TILE_ROWS; i++) {
          const yb = Y + (i + 1) * rh
          const half = ((r - l) / 2) * ((i + 1) / TILE_ROWS)
          for (let gx = X - half + 0.15 + (i % 2) * 0.3; gx < X + half - 0.45; gx += 0.75) {
            ctx.moveTo(gx, yb - rh * 0.4)
            ctx.quadraticCurveTo(gx + 0.15, yb - rh * 0.75, gx + 0.32, yb - rh * 0.45)
          }
        }
        stroke(ctx, lines, markW())
      }
      ctx.restore()
      if (material !== 'glass') {
        // A round attic window with a cross and a shine, in a cream ring.
        const wy = Y + PEAK * 0.58
        circlePath(ctx, X, wy, ATTIC + 0.045)
        part(ctx, C.paper, 'line')
        circlePath(ctx, X, wy, ATTIC)
        part(ctx, C.glassTint, 'detail')
        if (fine) {
          ctx.beginPath()
          seg(ctx, X - ATTIC, wy, X + ATTIC, wy)
          seg(ctx, X, wy - ATTIC, X, wy + ATTIC)
          ink(ctx, 'detail')
          shine(ctx, X, wy, ATTIC)
        }
      }
      front()
      ink(ctx, 'edge')
      break
    }
    case 'round': {
      solid(ctx, material, 0, -DRUM, w, DRUM, D, true, true, lod)
      const cx = w / 2 + D / 2
      const by = -DRUM - D / 2
      const rx = w / 2 - 0.14
      const dome = () => {
        ctx.beginPath()
        ctx.ellipse(cx, by, rx, DOME, 0, Math.PI, TAU)
        ctx.closePath()
      }
      // The knob's stalk behind the dome's top, then the dome and its marks.
      ctx.beginPath()
      ctx.moveTo(cx, by - DOME + 0.05)
      ctx.lineTo(cx, by - DOME - 0.12)
      tube(ctx, 0.04, BOX.yellow.side)
      dome()
      fill(ctx, look.face)
      ctx.save()
      dome()
      ctx.clip()
      ctx.beginPath()
      switch (material) {
        case 'bricks': {
          // Courses of bricks round the dome, staggered.
          const step = 0.15
          for (let i = 1; i * step < DOME; i++) {
            const cy = by - i * step
            seg(ctx, cx - rx, cy, cx + rx, cy)
            if (fine) for (let jx = cx - rx + (i % 2) * 0.15; jx < cx + rx; jx += 0.3) seg(ctx, jx, cy, jx, cy + step)
          }
          if (fine) for (let jx = cx - rx + 0.15; jx < cx + rx; jx += 0.3) seg(ctx, jx, by - step, jx, by)
          stroke(ctx, look.mark, markW())
          break
        }
        case 'planks':
        case 'concrete':
        case 'glass': {
          // Staves (planks), element seams (concrete) or mullions (glass) from the knob to the drum, and a hoop round the middle.
          const n = material === 'planks' ? 3 : 2
          for (let k = 1; k <= n; k++) {
            const r = (rx * k) / (n + 1)
            ctx.moveTo(cx - r, by)
            ctx.ellipse(cx, by, r, DOME, 0, Math.PI, TAU)
          }
          seg(ctx, cx, by, cx, by - DOME)
          if (material !== 'concrete') seg(ctx, cx - rx, by - DOME * 0.45, cx + rx, by - DOME * 0.45)
          stroke(ctx, look.mark, material === 'glass' ? Math.max(lw('line'), 0.02) : markW())
          if (material === 'concrete') {
            for (const hx of [-0.62, -0.2, 0.2, 0.62]) dot(ctx, cx + hx * rx, by - DOME * 0.28, TIE)
            fill(ctx, look.mark)
          }
          break
        }
        case 'rainbow':
          // A rainbow: the arcs from red outside to purple inside.
          C.rainbow.forEach((colour, i) => {
            const k = 1 - i / C.rainbow.length
            ctx.ellipse(cx, by, rx * k, DOME * k, 0, Math.PI, TAU)
            ctx.closePath()
            fill(ctx, colour)
          })
          break
      }
      ctx.restore()
      if (material === 'glass') shine(ctx, cx, by - DOME * 0.3, DOME * 0.72)
      dome()
      ink(ctx, 'edge')
      circlePath(ctx, cx, by - DOME - 0.12 - KNOB * 0.6, KNOB)
      part(ctx, BOX.yellow.face, 'line')
      if (fine) shine(ctx, cx, by - DOME - 0.12 - KNOB * 0.6, KNOB)
      break
    }
    case 'garden': {
      // The terrace: a parapet slab of the material with a lawn on top.
      solid(ctx, material, 0, -PARAPET, w, PARAPET, D, false, true, lod)
      topPath(ctx, 0, -PARAPET, w, D)
      part(ctx, BOX.grass.top, 'edge')
      // The little garden on the lawn's middle line: an apple tree and three flowers.
      const base = -PARAPET - D / 2
      const tx = 0.62 + D / 2
      ctx.save()
      ctx.translate(tx, base)
      groundShadow(ctx, 0.5)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -0.42)
      tube(ctx, 0.08, BOX.soil.face)
      blob(ctx, [0, -0.66, 0.27, -0.2, -0.52, 0.18, 0.2, -0.5, 0.19, 0.06, -0.86, 0.18], BOX.grass.face, 'line')
      if (fine) {
        ctx.beginPath()
        for (const [ax, ay] of [
          [-0.12, -0.6],
          [0.14, -0.7],
          [0.02, -0.48],
        ] as const)
          dot(ctx, ax, ay, 0.045)
        fill(ctx, C.rainbow[0])
      }
      ctx.restore()
      FLOWERS.forEach((colour, i) => {
        const fx = 1.32 + i * 0.3 + D / 2
        const fh = [0.3, 0.38, 0.28][i]!
        ctx.save()
        ctx.translate(fx, base)
        ctx.rotate(0.06 * Math.sin(TAU * loop(t, 2.4, phaseOf(`flower${i}`))))
        groundShadow(ctx, 0.16)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(0, -fh)
        tube(ctx, 0.022, BOX.grass.side)
        const petals: number[] = []
        for (let p = 0; p < 5; p++) petals.push(Math.cos((p * TAU) / 5) * 0.055, -fh + Math.sin((p * TAU) / 5) * 0.055, 0.045)
        blob(ctx, fine ? petals : [0, -fh, 0.08], colour, 'detail')
        circlePath(ctx, 0, -fh, 0.035)
        fill(ctx, C.hazard)
        ctx.restore()
      })
      // The railing along the front edge, posts every RAIL_EVERY so neighbours' posts keep step.
      const rail = RAIL_LOOK[material]
      const ry = -PARAPET - RAIL
      if (material === 'glass') {
        ctx.beginPath()
        ctx.rect(0, ry, w, RAIL)
        fill(ctx, HOUSE.pane)
        ctx.rect(0, ry, w, RAIL)
        ink(ctx, 'line')
        for (let gx = 0.3; gx < w; gx += 0.8) {
          seg(ctx, gx, -PARAPET - 0.08, gx + 0.12, ry + 0.1)
          seg(ctx, gx + 0.12, -PARAPET - 0.08, gx + 0.18, ry + 0.24)
        }
        stroke(ctx, C.white, Math.max(lw('line'), 0.02))
      } else {
        for (let i = 0, px = RAIL_EVERY / 2; px < w; px += RAIL_EVERY, i++) {
          ctx.beginPath()
          ctx.moveTo(px, -PARAPET)
          ctx.lineTo(px, ry)
          tube(ctx, 0.045, material === 'rainbow' ? C.rainbow[mod(i, C.rainbow.length)]! : rail)
        }
        ctx.beginPath()
        ctx.moveTo(0, -PARAPET - RAIL * 0.45)
        ctx.lineTo(w, -PARAPET - RAIL * 0.45)
        tube(ctx, 0.03, rail)
      }
      ctx.beginPath()
      ctx.moveTo(0, ry)
      ctx.lineTo(w, ry)
      tube(ctx, 0.055, rail)
      break
    }
    case 'tower': {
      // The tower stands on the roof's middle line, behind the wall; its flag flies from a pole on its top.
      const tx = w / 2 - TOWER.w / 2 + D / 2
      const foot = -WALL - D / 2
      solid(ctx, material, tx, -TOWER.top, TOWER.w, TOWER.top + foot, D, true, true, lod)
      const px = tx + TOWER.w / 2 + D / 2
      ctx.beginPath()
      ctx.moveTo(px, -TOWER.top - D / 2)
      ctx.lineTo(px, -POLE_TOP)
      tube(ctx, 0.035, BOX.steel.face)
      // The pennant, its tip and its edges rippling in the wind.
      const wave = Math.sin(TAU * loop(t, 1.3, 0))
      const wave2 = Math.sin(TAU * loop(t, 1.3, 0.3))
      const flag = () => {
        ctx.beginPath()
        ctx.moveTo(px, -POLE_TOP + 0.04)
        ctx.quadraticCurveTo(px + 0.22, -POLE_TOP + 0.04 + 0.05 * wave, px + 0.5, -POLE_TOP + 0.17 + 0.03 * wave2)
        ctx.quadraticCurveTo(px + 0.22, -POLE_TOP + 0.3 + 0.05 * wave, px, -POLE_TOP + 0.34)
        ctx.closePath()
      }
      flag()
      fill(ctx, FLAG[material])
      if (material === 'rainbow') {
        ctx.save()
        flag()
        ctx.clip()
        ctx.beginPath()
        C.rainbow.forEach((colour, i) => {
          ctx.rect(px, -POLE_TOP + 0.04 + i * 0.05, 0.6, 0.05)
          fill(ctx, colour)
        })
        ctx.restore()
      }
      flag()
      ink(ctx, 'line')
      circlePath(ctx, px, -POLE_TOP, 0.045)
      part(ctx, BOX.yellow.face, 'detail')
      // The tower's merlons, and an arched window.
      for (const mx of [0, (TOWER.w - MERLON.w) / 2, TOWER.w - MERLON.w]) solid(ctx, material, tx + mx, -TOWER.top - MERLON.h, MERLON.w, MERLON.h, D * 0.5, true, true, lod)
      if (material !== 'glass') {
        const wx = tx + TOWER.w / 2
        const wt = -TOWER.top + 0.3
        ctx.beginPath()
        ctx.moveTo(wx - 0.1, wt + 0.32)
        ctx.lineTo(wx - 0.1, wt)
        ctx.arc(wx, wt, 0.1, Math.PI, TAU)
        ctx.lineTo(wx + 0.1, wt + 0.32)
        ctx.closePath()
        part(ctx, HOUSE.slit, 'line')
      }
      // The castle wall along the column, and its merlons in step with the neighbours'.
      solid(ctx, material, 0, -WALL, w, WALL, D, true, true, lod)
      for (let mx = (MERLON_EVERY - MERLON.w) / 2; mx < w; mx += MERLON_EVERY) solid(ctx, material, mx, -WALL - MERLON.h, MERLON.w, MERLON.h, D * 0.5, true, true, lod)
      break
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The lift

/** The lift's steel: its two posts this wide, a beam this tall at every floor (level with the rooms' slabs), and the cap on top. */
const SHAFT_POST = 0.1
const CAP = 0.26
/** The car: its sides this far in from the shaft's, this tall over its floor; its floor and roof this thick. */
const CAR_IN = 0.14
const CAR_H = 1.5
const CAR_FLOOR = 0.12
/** The car waits LIFT_WAIT at a floor and rides one floor over LIFT_RIDE, up to the top and back down; the cat waves for the first CAT_WAVE of each wait. A lift one floor tall waits for good, the cat waving every LIFT_ALONE. */
const LIFT_WAIT = 1.8
const LIFT_RIDE = 1.6
const CAT_WAVE = 1.3
const LIFT_ALONE = 4
/** The lift's cat (animals.ts's one cat) is grown a little over SIZE.cat so it reads through the glass. */
const CAT_K = 1.3

/** Where the car is at sim time t in a lift of n floors: its floor (fractional while it rides), and how long it has waited there (-1 riding). */
function ride(n: number, t: number): { at: number; waited: number } {
  if (n <= 1) return { at: 0, waited: loop(t, LIFT_ALONE, 0) * LIFT_ALONE }
  const leg = LIFT_WAIT + LIFT_RIDE
  const legs = 2 * (n - 1)
  const s = loop(t, legs * leg, 0) * legs
  const i = Math.min(legs - 1, Math.floor(s))
  const into = (s - i) * leg
  const up = i < n - 1
  const from = up ? i : legs - i
  return { at: from + (up ? 1 : -1) * smooth(LIFT_WAIT, leg, into), waited: into < LIFT_WAIT ? into : -1 }
}

/**
 * The tall house's outside glass lift, origin at its bottom-left, LIFT_W wide and `h` tall,
 * its car riding up and down with a cat in it. A steel shaft (two posts, a beam level with
 * every floor's slab, a cap on top with a lit top and a dark right face) glazed in light
 * glass, see-through to the house behind; the red car waits at each floor and rides to the
 * next, up to the top and back down, and the ginger cat inside waves at every stop.
 */
export function drawLift(ctx: CanvasRenderingContext2D, h: number, t: number): void {
  const D = DEPTH
  const n = Math.max(1, Math.round(h / CELL))
  const lod = detail(CELL)
  const fine = lod !== 'S'
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // The shaft's right face and its back, faintly glazed.
  sidePath(ctx, LIFT_W, -h, h, D)
  part(ctx, HOUSE.paneSide, 'line')
  ctx.beginPath()
  ctx.rect(0, -h, LIFT_W, h)
  fill(ctx, HOUSE.pane)

  // The car and its cable.
  const { at, waited } = ride(n, t)
  const floor = -at * CELL - SLAB
  const cx0 = CAR_IN
  const cw = LIFT_W - 2 * CAR_IN
  const roof = floor - CAR_H
  ctx.beginPath()
  ctx.moveTo(LIFT_W / 2 + 0.05, roof - 0.08)
  ctx.lineTo(LIFT_W / 2 + 0.05, -h + 0.1)
  ink(ctx, 'detail')
  ctx.beginPath()
  ctx.rect(cx0, roof, cw, CAR_H)
  fill(ctx, C.paper)
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(cx0 + 0.05, floor - 0.62)
    ctx.lineTo(cx0 + cw - 0.05, floor - 0.62)
    tube(ctx, 0.03, BOX.steel.top)
  }
  // The ginger cat sitting up in the car, waving at each stop with its eyes happy and its mouth open, blinking now and then.
  const raise = waited < 0 ? 0 : smooth(0, 0.25, waited) * (1 - smooth(CAT_WAVE - 0.25, CAT_WAVE, waited))
  const glad = raise > 0.5
  ctx.save()
  ctx.translate(cx0 + cw * 0.42, floor - CAR_FLOOR)
  scaled(ctx, CAT_K, () =>
    drawCat(
      ctx,
      {
        coat: 'ginger',
        pose: 'sit',
        eyes: loop(t, 3.7, 0.2) > 0.96 ? 'closed' : glad ? 'happy' : 'open',
        meow: glad,
        tail: 0.25 * Math.sin(TAU * loop(t, 2.2, 0.4)),
        lift: 0,
        tilt: 0,
        step: 0,
        wave: raise * (0.8 + 0.2 * Math.sin(TAU * 2.2 * Math.max(0, waited))),
        kitten: false,
      },
      lod,
    ),
  )
  ctx.restore()
  for (const px of [cx0, cx0 + cw - 0.07]) {
    ctx.beginPath()
    ctx.rect(px, roof, 0.07, CAR_H)
    part(ctx, CAR.face, 'line')
  }
  box(ctx, cx0 - 0.03, roof, cw + 0.06, 0.14, CAR, 0.1, true, true, 'line')
  box(ctx, cx0 - 0.03, floor - CAR_FLOOR, cw + 0.06, CAR_FLOOR, CAR, 0.1, false, true, 'line')

  // The shaft's front: the glass's glints, the beams level with the floors, the posts, the cap.
  ctx.beginPath()
  for (let k = 0; k < n; k++) {
    const gy = -k * CELL - 1.3
    seg(ctx, 0.22, gy + 0.3, 0.38, gy)
    if (fine) seg(ctx, 0.36, gy + 0.36, 0.46, gy + 0.18)
  }
  stroke(ctx, C.white, Math.max(lw('line'), 0.022))
  for (let k = 0; k <= n; k++) {
    const by = Math.max(-h, -k * CELL - (k === n ? 0 : SLAB))
    ctx.rect(0, by, LIFT_W, k === n ? 0.12 : SLAB)
  }
  ctx.rect(0, -h, SHAFT_POST, h)
  ctx.rect(LIFT_W - SHAFT_POST, -h, SHAFT_POST, h)
  part(ctx, BOX.steel.face, 'line')
  box(ctx, -0.05, -h - CAP, LIFT_W + 0.1, CAP, BOX.steel, D, true, true, 'edge')
  ctx.beginPath()
  ctx.rect(0, -h, LIFT_W, h)
  ink(ctx, 'edge')
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The doors

/** The tall house's lobby box recedes this far, less than a room's DEPTH (it is a small box), so all of it stands in layout's LOBBY rect. */
const LOBBY_D = 0.12
/**
 * A row house's front door in its layout ROW_DOOR rect: two concrete steps up to the floor
 * line at `foot`, a door `frame` wide (its leaf in the home's colour inside the frame), a
 * flat hood `hood` thick over it; the steps and the hood recede `d`.
 */
const ROW = { foot: -0.28, frame: 0.52, hood: 0.1, d: 0.06 }
/** A door's cream frame round its leaf is this wide. */
const FRAME = 0.05

/** A house of `kind`'s front doors in grid-local metres (origin at the grid's bottom-left), from layout.doorRects: a door is drawn exactly where a tap on it rings the doorbell. */
function doorsOf(kind: HouseKind): Rect[] {
  const x = gridLeft(0)
  return doorRects(0, { kind, roof: 'pointed', rooms: [] }).map((r) => rect(r.x - x, r.y, r.w, r.h))
}

/** A front door `w` wide from `foot` up to `top`, centred on x: a cream frame round a square door in `faces` with a window of `glass` shape near its top, a knob and (from M) a panel. */
function door(ctx: CanvasRenderingContext2D, x: number, foot: number, top: number, w: number, faces: Faces, glass: (typeof ROW_WINDOWS)[number], fine: boolean) {
  ctx.beginPath()
  ctx.rect(x - w / 2, top, w, foot - top)
  part(ctx, C.paper, 'line')
  const half = w / 2 - FRAME
  const lt = top + FRAME
  ctx.beginPath()
  ctx.rect(x - half, lt, 2 * half, foot - lt)
  part(ctx, faces.face, 'line')
  const gs = Math.min(0.18, half * 0.85)
  const gy = lt + 0.05 + gs / 2
  if (glass === 'round') circlePath(ctx, x, gy, gs * 0.5)
  else if (glass === 'heart') heartPath(ctx, x, gy, gs)
  else starPath(ctx, x, gy, gs * 0.6)
  part(ctx, C.glassTint, 'detail')
  if (fine) {
    roundRectPath(ctx, x - half * 0.6, gy + gs * 0.75, half * 1.2, (foot - gy) * 0.5, 0.02)
    ctx.strokeStyle = faces.side
    ctx.lineWidth = markW()
    ctx.stroke()
  }
  circlePath(ctx, x + half * 0.68, (foot + lt) / 2 + 0.06, 0.03)
  part(ctx, BOX.steel.top, 'detail')
}
/** A little pointed canopy over a door: a gable `w` wide at y, `peak` tall, its right slope receding lit by d. */
function canopy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, peak: number, d: number, faces: Faces) {
  ctx.beginPath()
  ctx.moveTo(x, y - peak)
  ctx.lineTo(x + w / 2, y)
  ctx.lineTo(x + w / 2 + d, y - d)
  ctx.lineTo(x + d, y - peak - d)
  ctx.closePath()
  part(ctx, faces.top, 'line')
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y)
  ctx.lineTo(x, y - peak)
  ctx.lineTo(x + w / 2, y)
  ctx.closePath()
  part(ctx, faces.face, 'line')
}

/** The tall house's lobby filling its rect r: a little cream box with a step, a teal door under a pointed canopy, a warm lamp and the doorbell. */
function drawLobby(ctx: CanvasRenderingContext2D, r: Rect, fine: boolean): void {
  const d = LOBBY_D
  const fw = r.w - d
  const cx = r.x + fw / 2
  box(ctx, r.x, r.y + d, fw, r.h - d, LOBBY_LOOK, d, true, true, 'edge')
  box(ctx, cx - 0.3, -0.1, 0.6, 0.1, MATERIAL_LOOK.concrete, 0.06, true, true, 'line')
  door(ctx, cx, -0.16, -1.32, 0.5, TALL_DOOR, 'round', fine)
  canopy(ctx, cx, -1.38, 0.62, 0.2, 0.08, TALL_DOOR)
  const lx = r.x + fw - 0.07
  circlePath(ctx, lx, -1.1, 0.05)
  part(ctx, C.sparkleWarm, 'detail')
  circlePath(ctx, lx, -0.86, 0.035)
  part(ctx, BOX.yellow.face, 'detail')
}

/**
 * One row-house home's front door filling its rect r (centred on the home's left edge,
 * over its outer post and the home before it's): two concrete steps up to the floor line,
 * the door in the home's colour in a cream frame with a window (round, heart, star), and a
 * flat hood in the home's colour.
 */
function drawRowDoor(ctx: CanvasRenderingContext2D, r: Rect, home: number, fine: boolean): void {
  const faces = HOME_DOORS[home]!
  const d = ROW.d
  const cx = r.x + (r.w - d) / 2
  const step = (-ROW.foot - d) / 2
  box(ctx, r.x, -step, r.w - d, step, MATERIAL_LOOK.concrete, d, true, true, 'line')
  box(ctx, r.x + 0.1, -2 * step, r.w - d - 0.2, step, MATERIAL_LOOK.concrete, d, true, true, 'line')
  door(ctx, cx, ROW.foot, r.y + d + ROW.hood, ROW.frame, faces, ROW_WINDOWS[home]!, fine)
  box(ctx, r.x, r.y + d, r.w - d, ROW.hood, faces, d, true, true, 'line')
}

/**
 * The front doors at the foot of a house of `kind`, origin at the grid's bottom-left, each
 * filling its layout.doorRects rect: the tall house's lobby against the lift's foot, right
 * of it (drawLobby), and the row house's three doors on each home's left edge, each in its
 * home's colour (drawRowDoor). A row door covers the outer edge of the floor slots either
 * side of it, so it reads as a door a builder fits through. `shown` says how much of each
 * door shows, 0 to 1 (all of every door when left out): a room view leaves out the doors in
 * front of its room.
 */
export function drawDoors(ctx: CanvasRenderingContext2D, kind: HouseKind, t: number, shown: readonly number[] = []): void {
  void t
  const fine = detail(CELL) !== 'S'
  const doors = doorsOf(kind)
  ctx.save()
  ctx.lineJoin = 'round'
  doors.forEach((r, i) => {
    const a = shown[i] ?? 1
    if (a <= 0) return
    ctx.save()
    ctx.globalAlpha *= a
    if (kind === 'tall') drawLobby(ctx, r, fine)
    else drawRowDoor(ctx, r, i, fine)
    ctx.restore()
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The blueprint and the ghosts

/** The blueprint's and the ghosts' dashes, in metres: about a hand long at street size. */
const DASH = [0.2, 0.13]
const HOME_DASH = [0.42, 0.13]
/** The blueprint is this faint, so the rooms built over it read first. */
const BLUEPRINT_ALPHA = 0.55
const BLUEPRINT_FILL = 0.4
/** A ghost sits this far inside its room rect, so two neighbouring ghosts show apart; pressed it grows by GHOST_PRESS. Its plus is this long, pulsing GHOST_PULSE either way once a second. */
const GHOST_IN = 0.1
const GHOST_PRESS = 1.05
const PLUS = 0.56
const GHOST_PULSE = 0.08

/**
 * The faint blueprint of a whole house grid, origin at the grid's bottom-left: a cobalt
 * wash, every cell's edge dashed, the outline of the whole box (its top and right faces)
 * dashed at the line weight, and in the row house the edges between the three homes in
 * longer dashes, so the child sees the house's full size and its homes from the start.
 */
export function drawBlueprint(ctx: CanvasRenderingContext2D, kind: HouseKind, t: number): void {
  void t
  const g = HOUSE_GRID[kind]
  const W = g.cols * CELL
  const H = g.rows * CELL
  const D = DEPTH
  ctx.save()
  ctx.globalAlpha *= BLUEPRINT_ALPHA
  ctx.save()
  ctx.globalAlpha *= BLUEPRINT_FILL
  ctx.beginPath()
  ctx.rect(0, -H, W, H)
  fill(ctx, C.ghostFill)
  ctx.restore()
  ctx.lineCap = 'round'
  ctx.setLineDash(DASH)
  for (let c = 1; c < g.cols; c++) if (kind === 'tall' || c % HOME_COLS !== 0) seg(ctx, c * CELL, -H, c * CELL, 0)
  for (let r = 1; r < g.rows; r++) seg(ctx, 0, -r * CELL, W, -r * CELL)
  stroke(ctx, C.ghostLine, lw('detail'))
  topPath(ctx, 0, -H, W, D)
  ctx.rect(0, -H, W, H)
  ctx.moveTo(W + D, -H - D)
  ctx.lineTo(W + D, -D)
  ctx.lineTo(W, 0)
  stroke(ctx, C.ghostLine, lw('line'))
  if (kind === 'row') {
    ctx.setLineDash(HOME_DASH)
    for (let c = HOME_COLS; c < g.cols; c += HOME_COLS) seg(ctx, c * CELL, -H, c * CELL, 0)
    stroke(ctx, C.ghostLine, lw('line'))
  }
  ctx.restore()
}

/** The ghost of a room about to be placed: a dashed cobalt outline, a light cobalt fill, a white plus pulsing at 1 Hz; `pressed` while the finger is down on it. Origin at the room rect's top-left. */
export function drawGhost(ctx: CanvasRenderingContext2D, shape: Shape, pressed: boolean, t: number): void {
  const { w, h } = SHAPE_SIZE[shape]
  const W = w * CELL
  const H = h * CELL
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.translate(W / 2, H / 2)
  if (pressed) ctx.scale(GHOST_PRESS, GHOST_PRESS)
  roundRectPath(ctx, -W / 2 + GHOST_IN, -H / 2 + GHOST_IN, W - 2 * GHOST_IN, H - 2 * GHOST_IN, 0.14)
  ctx.fillStyle = C.ghostFill
  ctx.fill()
  if (pressed) ctx.fill()
  ctx.setLineDash(DASH)
  ctx.lineWidth = lw(pressed ? 'edge' : 'line') * (pressed ? 1.3 : 1)
  ctx.strokeStyle = C.ghostLine
  ctx.stroke()
  ctx.setLineDash([])
  // The plus: a white cross edged in cobalt, breathing once a second.
  const k = (1 + GHOST_PULSE * Math.sin(TAU * loop(t, 1, 0))) * (pressed ? 1.15 : 1) * Math.min(1.3, Math.sqrt(w * h))
  const arm = (PLUS / 2) * k
  const bar = 0.13 * k
  ctx.beginPath()
  seg(ctx, -arm, 0, arm, 0)
  seg(ctx, 0, -arm, 0, arm)
  ctx.lineWidth = bar + lw('line') * 2
  ctx.strokeStyle = C.ghostLine
  ctx.stroke()
  ctx.lineWidth = bar
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A bare room's inside for the sheet, clipped to the interior of a room of `shape` whose rect's top-left is the origin, as the renderer draws it. */
function bareInside(ctx: CanvasRenderingContext2D, shape: Shape, t: number) {
  const { w, h } = SHAPE_SIZE[shape]
  ctx.save()
  ctx.beginPath()
  ctx.rect(POST, TOP, w * CELL - 2 * POST, h * CELL - TOP - SLAB)
  ctx.clip()
  ctx.translate(POST, TOP)
  drawBareRoom(ctx, w * CELL - 2 * POST, h * CELL - TOP - SLAB, t)
  ctx.restore()
}

/** A small house for the sheet, composed as the renderer composes one (frame.ts): the blueprint, each room's bare inside and frame bottom up (its faces where nothing stands on or right of it), the roofs over each column's top room, the lift and the doors. Rooms are [shape, col, row, material]. */
function sheetHouse(ctx: CanvasRenderingContext2D, kind: HouseKind, rooms: readonly (readonly [Shape, number, number, Material])[], roof: RoofStyle, t: number) {
  const taken = new Map<string, number>()
  rooms.forEach(([shape, col, row], i) => {
    const { w, h } = SHAPE_SIZE[shape]
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) taken.set(`${col + c},${row + r}`, i)
  })
  drawBlueprint(ctx, kind, t)
  const order = [...rooms].sort((a, b) => a[2] - b[2] || a[1] - b[1])
  for (const [shape, col, row, material] of order) {
    const { w, h } = SHAPE_SIZE[shape]
    let top = true
    let right = true
    for (let c = 0; c < w; c++) if (taken.has(`${col + c},${row + h}`)) top = false
    for (let r = 0; r < h; r++) if (taken.has(`${col + w},${row + r}`)) right = false
    ctx.save()
    ctx.translate(col * CELL, -(row + h) * CELL)
    bareInside(ctx, shape, t)
    drawRoomFrame(ctx, shape, material, top, right, t)
    ctx.restore()
  }
  // Each column's height in rooms and its top room's material; a roof stops at a taller column on either side.
  const tops = Array.from({ length: HOUSE_GRID[kind].cols + 1 }, (_, col) => {
    let height = 0
    let material: Material = 'bricks'
    for (const [shape, c0, row, m] of rooms) {
      const { w, h } = SHAPE_SIZE[shape]
      if (col >= c0 && col < c0 + w && row + h > height) {
        height = row + h
        material = m
      }
    }
    return { height, material }
  })
  const tallest = Math.max(...tops.map((c) => c.height))
  for (let col = 0; col < HOUSE_GRID[kind].cols; col++) {
    const { height, material } = tops[col]!
    if (height === 0) continue
    ctx.save()
    ctx.translate(col * CELL, -height * CELL)
    drawRoof(ctx, roof, material, CELL, col === 0 || tops[col - 1]!.height <= height, tops[col + 1]!.height <= height, 1e4, t)
    ctx.restore()
  }
  if (kind === 'tall' && tallest > 0) {
    ctx.save()
    ctx.translate(HOUSE_GRID.tall.cols * CELL, 0)
    drawLift(ctx, tallest * CELL, t)
    ctx.restore()
  }
  drawDoors(ctx, kind, t)
}

const frameBox = (shape: Shape) => rect(-0.1, -0.35, SHAPE_SIZE[shape].w * CELL + 0.45, SHAPE_SIZE[shape].h * CELL + 0.45)
const roofBox = rect(-0.2, -ROOF_H - 0.5, CELL + DEPTH + 0.4, ROOF_H + 0.6)
const liftBox = (floors: number) => rect(-0.15, -floors * CELL - CAP - 0.35, LIFT_W + DEPTH + 0.3, floors * CELL + CAP + 0.45)
const SHOWCASE: readonly (readonly [Shape, number, number, Material])[] = [
  ['wide', 0, 0, 'bricks'],
  ['small', 2, 0, 'planks'],
  ['small', 0, 1, 'glass'],
  ['tall', 1, 1, 'concrete'],
  ['small', 2, 1, 'rainbow'],
  ['small', 0, 2, 'bricks'],
]

export const HOUSE_SHEET: SheetEntry[] = [
  ...MATERIALS.flatMap((m) =>
    SHAPES.map((shape): SheetEntry => ({ label: `frame ${m} ${shape}`, box: frameBox(shape), draw: (ctx, t) => drawRoomFrame(ctx, shape, m, true, true, t) })),
  ),
  ...MATERIALS.map((m): SheetEntry => ({ label: `frame ${m}, nothing on top or right`, box: frameBox('small'), draw: (ctx, t) => drawRoomFrame(ctx, 'small', m, false, false, t) })),
  ...SHAPES.map(
    (shape): SheetEntry => ({
      label: `bare room ${shape}`,
      box: frameBox(shape),
      draw: (ctx, t) => {
        bareInside(ctx, shape, t)
        drawRoomFrame(ctx, shape, 'planks', true, true, t)
      },
    }),
  ),
  ...ROOFS.flatMap((style) =>
    MATERIALS.map((m): SheetEntry => ({ label: `roof ${style} ${m}`, box: roofBox, draw: (ctx, t) => drawRoof(ctx, style, m, CELL, true, true, 1e4, t) })),
  ),
  ...ROOFS.map((style): SheetEntry => ({ label: `roof ${style} pops (every 2 s)`, box: roofBox, draw: (ctx, t) => drawRoof(ctx, style, 'bricks', CELL, true, true, t % 2, t) })),
  ...ROOFS.map((style): SheetEntry => ({ label: `roof ${style} against a taller column on the right, popping (every 2 s)`, box: roofBox, draw: (ctx, t) => drawRoof(ctx, style, 'planks', CELL, true, false, t % 2, t) })),
  ...ROOFS.map((style): SheetEntry => ({ label: `roof ${style} against a taller column on the left, popping (every 2 s)`, box: roofBox, draw: (ctx, t) => drawRoof(ctx, style, 'planks', CELL, false, true, t % 2, t) })),
  ...ROOFS.flatMap((style) =>
    (
      [
        [
          'a low column beside two that share a height',
          [
            ['small', 0, 0, 'bricks'],
            ['wide', 1, 0, 'planks'],
            ['wide', 1, 1, 'rainbow'],
          ],
        ],
        [
          'a low column between two taller ones',
          [
            ['tall', 0, 0, 'bricks'],
            ['small', 1, 0, 'planks'],
            ['tall', 2, 0, 'rainbow'],
          ],
        ],
      ] as const
    ).map(
      ([what, rooms]): SheetEntry => ({
        label: `roofs ${style}: ${what}`,
        box: rect(-0.6, -2 * CELL - 2.2, 3 * CELL + LIFT_W + 2.4, 2 * CELL + 2.4),
        draw: (ctx, t) => sheetHouse(ctx, 'tall', rooms, style, t),
      }),
    ),
  ),
  ...[1, 2, 3, 5].map((floors): SheetEntry => ({ label: `lift ${floors} floor${floors > 1 ? 's' : ''}`, box: liftBox(floors), draw: (ctx, t) => drawLift(ctx, floors * CELL, t) })),
  ...[0, 1.2, 2.6, 4.4].map((at): SheetEntry => ({ label: `lift 3 floors at ${at} s`, box: liftBox(3), draw: (ctx) => drawLift(ctx, 3 * CELL, at) })),
  {
    label: 'doors tall, with the lift',
    box: rect(6.9, -3.2, 3.2, 3.4),
    draw: (ctx, t) => {
      ctx.save()
      ctx.translate(HOUSE_GRID.tall.cols * CELL, 0)
      drawLift(ctx, CELL, t)
      ctx.restore()
      drawDoors(ctx, 'tall', t)
    },
  },
  ...[0, 1, 2].map(
    (home): SheetEntry => ({
      label: `row door ${home}`,
      box: rect(-0.5, -1.95, 1.0, 2.05),
      draw: (ctx) => {
        const r = doorsOf('row')[home]!
        ctx.save()
        ctx.translate(-home * HOME_COLS * CELL, 0)
        drawRowDoor(ctx, r, home, detail(CELL) !== 'S')
        ctx.restore()
      },
    }),
  ),
  { label: 'doors row, over the blueprint', box: rect(-0.6, -2 * CELL - 0.5, 6 * CELL + 1.0, 2 * CELL + 0.7), draw: (ctx, t) => (drawBlueprint(ctx, 'row', t), drawDoors(ctx, 'row', t)) },
  { label: 'blueprint tall', box: rect(-0.2, -5 * CELL - 0.4, 3 * CELL + 0.6, 5 * CELL + 0.5), draw: (ctx, t) => drawBlueprint(ctx, 'tall', t) },
  { label: 'blueprint row', box: rect(-0.2, -2 * CELL - 0.4, 6 * CELL + 0.6, 2 * CELL + 0.5), draw: (ctx, t) => drawBlueprint(ctx, 'row', t) },
  ...SHAPES.flatMap((shape) =>
    [false, true].map((pressed): SheetEntry => ({ label: `ghost ${shape}${pressed ? ' pressed' : ''}`, box: frameBox(shape), draw: (ctx, t) => drawGhost(ctx, shape, pressed, t) })),
  ),
  ...ROOFS.map(
    (roof): SheetEntry => ({
      label: `tall house, ${roof} roofs`,
      box: rect(-0.6, -3 * CELL - 2.2, 3 * CELL + LIFT_W + 2.4, 3 * CELL + 2.4),
      draw: (ctx, t) => sheetHouse(ctx, 'tall', SHOWCASE, roof, t),
    }),
  ),
  ...(['tall', 'row'] as const).map(
    (kind): SheetEntry => ({
      label: `${kind} house, no rooms yet, its ground floor ghosts (one pressed)`,
      box: rect(-0.6, -HOUSE_GRID[kind].rows * CELL - 0.5, HOUSE_GRID[kind].cols * CELL + (kind === 'tall' ? LIFT_W + 1.4 : 0) + 1.0, HOUSE_GRID[kind].rows * CELL + 0.7),
      draw: (ctx, t) => {
        sheetHouse(ctx, kind, [], 'pointed', t)
        for (let col = 0; col < HOUSE_GRID[kind].cols; col++) {
          ctx.save()
          ctx.translate(col * CELL, -CELL)
          drawGhost(ctx, 'small', col === 1, t)
          ctx.restore()
        }
      },
    }),
  ),
  {
    label: 'row house, pointed roofs',
    box: rect(-0.6, -2 * CELL - 2.2, 6 * CELL + 1.0, 2 * CELL + 2.4),
    draw: (ctx, t) =>
      sheetHouse(
        ctx,
        'row',
        [
          ['wide', 0, 0, 'bricks'],
          ['small', 0, 1, 'bricks'],
          ['tall', 2, 0, 'planks'],
          ['small', 3, 0, 'planks'],
          ['big', 4, 0, 'concrete'],
        ],
        'pointed',
        t,
      ),
  },
]
