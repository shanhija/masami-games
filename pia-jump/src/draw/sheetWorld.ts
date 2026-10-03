import { BALL_BOUNCE, BUBBLE_R, BUMP_FOR, POLE_HEIGHT, ROWS, STEP, type BlockDef, type Item, type ItemKind, type Room, type RoomId, type Sim } from '../game/model'
import { parseRoom } from '../game/room'
import { createSim } from '../game/sim'
import { drawKitten } from './critters'
import type { SheetCell } from './sheet'
import { drawBed, drawBlock, drawBubble, drawItem, drawLift, drawPicnic, drawPole, drawSpring, drawStar } from './things'
import { drawBackdrop, drawPits, drawTerrain } from './world'

/**
 * A small hand-made room, parsed in the colours of whichever room the sheet shows, so every
 * kind of block is there whatever the real rooms hold. Its left twelve columns are the
 * terrain swatch: an ABC word, a gap with its pit, a shelf, a step, a column and a ledge.
 */
const SWATCH_MAP = [
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '.........##.................',
  '............?c$pr.......x...',
  '..===...................x...',
  '..........||............x...',
  'CAT......#||..@.....!...x.h.',
  '####..######################',
  '####..######################',
]
/** The swatch's columns (from the left) and rows (from the bottom) shown in the terrain cell. */
const SWATCH_W = 12
const SWATCH_H = 7.5
/** The gate's column in the swatch. */
const GATE_COL = 24
/** The small poles are drawn at this scale, so all six fit. */
const POLE_SCALE = 0.5

/** The swatch room parsed in each room's colours. */
const swatches = new Map<RoomId, Room>()

/** The swatch room in `room`'s colours, parsed once. */
function swatch(room: Room): Room {
  const known = swatches.get(room.id)
  if (known) return known
  const parsed = parseRoom({ id: room.id, name: room.name, kitten: room.kitten, map: SWATCH_MAP, lifts: [] })
  swatches.set(room.id, parsed)
  return parsed
}

/** A cell drawn by `draw` at sheet time t, with the swatch room and a fresh sim of it; the context comes back as it was. */
function cell(label: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, t: number, room: Room, s: Sim) => void): SheetCell {
  return {
    label,
    w,
    h,
    draw: (ctx, room, t) => {
      const r = swatch(room)
      ctx.save()
      draw(ctx, t, r, createSim(r))
      ctx.restore()
    },
  }
}

/** A tick stamp `seconds` before sheet time t. */
const before = (t: number, seconds: number) => (t - seconds) / STEP

/** The first swatch block that `is` picks, in a state `set` gives it, standing on the feet line. */
function block(label: string, is: (b: BlockDef) => boolean, set: (s: Sim, i: number, t: number) => void): SheetCell {
  return cell(label, 1.6, 2, (ctx, t, r, s) => {
    const i = r.blocks.findIndex(is)
    set(s, i, t)
    ctx.translate(-0.5, -1)
    drawBlock(ctx, r, i, s, t)
  })
}

/** Picks the swatch's one-star gift box, or its cookie block. */
const gift = (b: BlockDef) => b.kind === 'gift' && b.gift === 'star'
const cookie = (b: BlockDef) => b.kind === 'cookie'

/** The swatch's whole gate on the feet line, standing or 0.3 s into sinking. */
function gate(label: string, sinking: boolean): SheetCell {
  return cell(label, 1.6, 5, (ctx, t, r, s) => {
    if (sinking) s.gateAt = before(t, 0.3)
    ctx.translate(-0.5 - GATE_COL, -13)
    r.blocks.forEach((b, i) => {
      if (b.kind !== 'gate') return
      if (sinking) s.blocks[i].state = 'open'
      ctx.save()
      ctx.translate(b.col, b.row)
      drawBlock(ctx, r, i, s, t)
      ctx.restore()
    })
  })
}

/** A power-up standing on the feet line, patched by `set`. */
function item(label: string, kind: ItemKind, set: Partial<Item>): SheetCell {
  return cell(label, 1.6, 1.8, (ctx, t, r) => {
    drawItem(ctx, { x: 3, y: 13, px: 3, py: 13, vx: 0, vy: 0, w: 0.7, h: 0.7, kind, facing: 1, grounded: true, bornAt: -1, alive: true, ...set }, r, t)
  })
}

/** Blocks, items, lifts, springs, the pole, the bed, the picnic, a terrain swatch and a backdrop strip, for ?sheet=world. */
export const WORLD_SHEET: readonly SheetCell[] = [
  block('gift full', gift, () => {}),
  block('gift bumped', gift, (s, i, t) => (s.blocks[i].bumpedAt = before(t, BUMP_FOR / 2))),
  block('gift empty', gift, (s, i) => (s.blocks[i].state = 'empty')),
  block('cookie', cookie, () => {}),
  block('cookie bumped', cookie, (s, i, t) => (s.blocks[i].bumpedAt = before(t, BUMP_FOR / 2))),
  gate('gate', false),
  gate('gate sinking', true),
  cell('star', 1.2, 1.5, (ctx, t) => {
    ctx.translate(0, -0.5)
    drawStar(ctx, t, 0)
  }),
  item('cupcake', 'cupcake', {}),
  item('cupcake sliding', 'cupcake', { vx: 2.2 }),
  item('wand', 'wand', {}),
  item('ball', 'ball', { grounded: false, vy: -3 }),
  item('ball bounce', 'ball', { grounded: false, vy: -BALL_BOUNCE }),
  cell('bubble', 1.4, 1.6, (ctx, t) => drawBubble(ctx, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: BUBBLE_R * 2, h: BUBBLE_R * 2, bornAt: -1, alive: true }, t)),
  cell('spring', 1.4, 1.4, (ctx, t, r) => drawSpring(ctx, r, -1, t)),
  cell('spring squashed', 1.4, 1.4, (ctx, t, r) => drawSpring(ctx, r, before(t, 0.03), t)),
  cell('spring wobble', 1.4, 1.4, (ctx, t, r) => drawSpring(ctx, r, before(t, 0.14), t)),
  cell('lift', 3.8, 1.4, (ctx, t, r) => {
    ctx.translate(0, -0.7)
    drawLift(ctx, r, { kind: 'ferry', col: 0, row: 0, width: 3, dx: 6, dy: 0 }, t)
  }),
  cell('lift hanging', 3.8, 2.4, (ctx, t, r) => {
    ctx.translate(0, -0.7)
    drawLift(ctx, r, { kind: 'loop', col: 0, row: 0, width: 3, dx: 0, dy: -3, period: 5 }, t)
  }),
  cell('bed', 3.2, 3.2, (ctx, t, r) => drawBed(ctx, r, 0, t)),
  cell('bed squash', 3.2, 3.2, (ctx, t, r) => drawBed(ctx, r, 0.2, t)),
  cell('bed open', 3.2, 3.2, (ctx, t, r) => drawBed(ctx, r, 1, t)),
  cell('bed and kitten', 3.2, 3.2, (ctx, t, r) => {
    drawBed(ctx, r, 0, t)
    drawKitten(ctx, r.kitten, 'hidden', t, null)
  }),
  cell('pole top', 4.6, 3.6, (ctx, t, r, s) => {
    s.poleBonus = 5
    ctx.translate(-1.3, POLE_HEIGHT - 2.5)
    drawPole(ctx, r, s, t)
  }),
  ...[0, 1, 2, 3, 4, 5].map((n) =>
    cell(`pole ${n}`, 2.1, 5.4, (ctx, t, r, s) => {
      s.poleBonus = n
      ctx.translate(-0.35, 0)
      ctx.scale(POLE_SCALE, POLE_SCALE)
      drawPole(ctx, r, s, t)
    }),
  ),
  cell('picnic', 7.6, 4.4, (ctx, t) => drawPicnic(ctx, t)),
  cell('terrain', SWATCH_W, SWATCH_H, (ctx, t, r) => {
    // The backdrop behind it at the same scale, as the stage draws it.
    const m = ctx.getTransform()
    const px = m.a
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, m.e - (SWATCH_W / 2) * px, m.f - (SWATCH_H - 0.5) * px)
    drawBackdrop(ctx, r, { width: SWATCH_W * px, height: SWATCH_H * px, tile: px, left: 0, top: -(ROWS - SWATCH_H) * px }, t)
    ctx.restore()
    ctx.translate(-SWATCH_W / 2, 0.5 - ROWS)
    drawPits(ctx, r, 0, SWATCH_W, t)
    drawTerrain(ctx, r, 0, SWATCH_W)
  }),
  cell('backdrop', 12, 4.5, (ctx, t, r) => {
    // The whole room's height in the strip, scrolled into the room a little.
    const m = ctx.getTransform()
    const px = m.a
    ctx.setTransform(1, 0, 0, 1, m.e - 6 * px, m.f - 4 * px)
    drawBackdrop(ctx, r, { width: 12 * px, height: 4.5 * px, tile: (4.5 * px) / ROWS, left: 30, top: 0 }, t)
  }),
]
