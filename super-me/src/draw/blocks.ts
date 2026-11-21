import { COLOR, INK, LINE, LINE_DETAIL, SHADE_BLOCK, inkPart, lw, roundRectPath, sparklePath } from '../../../pia-jump/src/draw/look'
import { SPRING_TOP } from '../../../pia-jump/src/game/model'
import type { Kind } from '../game/model'

/**
 * The things of a level that are Super Me's own, in Pia Jump's ink style: the four blocks,
 * the crates they come in, the presents and the finish arch. World units, y down; a block
 * draws from its first cell's top-left corner, a crate and a present from their cell's
 * centre, the arch from its foot.
 */

const WOOD = '#EDB271'
const WOOD_SHADE = '#C98447'
const RAIL = '#D99A5B'
const RAIL_SHADE = '#B07038'
/** Cubes take these toy colours in turn, as [lit, shade]. */
const CUBES = [
  ['#FF7A9C', '#D9547A'],
  ['#62B0FF', '#3E86D6'],
  ['#FFD447', '#E2A92C'],
  ['#66D693', '#3FAE6D'],
] as const
const MAT = '#5B6CFF'
const MAT_SHADE = '#3E4BD1'
const FRAME = '#FF7A9C'
const FRAME_SHADE = '#D9547A'
/** Presents in turn: paper, its shade, and the ribbon. */
const PRESENTS = [
  ['#FF8CC6', '#E0629F', '#FFE066'],
  ['#7FD4FF', '#4FAEE0', '#FF7A9C'],
  ['#B79CFF', '#8F72E0', '#8CE99A'],
] as const
const CRATE = '#F3D3A4'
const CRATE_SHADE = '#D9AE72'

/** A plank's board thickness: it is a shelf, so she stands on its top. */
const BOARD = 0.24

/** A plank `size` cells wide: a board along the top of its row, a nail at each end. */
export function drawPlank(ctx: CanvasRenderingContext2D, size: number) {
  inkPart(ctx, (c) => roundRectPath(c, 0.02, 0, size - 0.04, BOARD, 0.07), WOOD, WOOD_SHADE, BOARD * 0.35, LINE, null)
  ctx.beginPath()
  for (let x = 0.7; x < size - 0.3; x += 0.9) {
    ctx.moveTo(x, BOARD * 0.45)
    ctx.lineTo(x + 0.35, BOARD * 0.45)
  }
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = WOOD_SHADE
  ctx.stroke()
  ctx.fillStyle = INK
  for (const x of [0.2, size - 0.2]) {
    ctx.beginPath()
    ctx.arc(x, BOARD / 2, 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A toy cube filling its cell, the `index`-th built: a bevelled block with a dot on its face. */
export function drawCube(ctx: CanvasRenderingContext2D, index: number) {
  const [lit, shade] = CUBES[index % CUBES.length]!
  inkPart(ctx, (c) => roundRectPath(c, 0.03, 0.03, 0.94, 0.94, 0.14), lit, shade, SHADE_BLOCK, LINE, null)
  ctx.beginPath()
  roundRectPath(ctx, 0.22, 0.2, 0.56, 0.56, 0.1)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = shade
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0.5, 0.48, 0.1, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
}

/** A trampoline in its cell: a round mat SPRING_TOP above the cell's floor on two legs; `dip` (0 to 1) pushes the mat down just after a bounce. */
export function drawTrampoline(ctx: CanvasRenderingContext2D, dip: number) {
  const top = 1 - SPRING_TOP + dip * 0.12
  ctx.beginPath()
  ctx.moveTo(0.18, top + 0.06)
  ctx.lineTo(0.1, 0.98)
  ctx.moveTo(0.82, top + 0.06)
  ctx.lineTo(0.9, 0.98)
  ctx.lineWidth = lw(0.07)
  ctx.strokeStyle = INK
  ctx.stroke()
  inkPart(ctx, (c) => {
    c.beginPath()
    c.ellipse(0.5, top + 0.04, 0.46, 0.13, 0, 0, Math.PI * 2)
  }, FRAME, FRAME_SHADE, 0.05, LINE, null)
  inkPart(ctx, (c) => {
    c.beginPath()
    c.ellipse(0.5, top + 0.03 + dip * 0.03, 0.34, 0.07, 0, 0, Math.PI * 2)
  }, MAT, MAT_SHADE, 0.03, LINE_DETAIL, null)
}

/** A ladder `size` cells tall from the top of its first cell: two rails and a rung every half cell. */
export function drawLadder(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath()
  for (let y = 0.3; y < size; y += 0.5) {
    ctx.moveTo(0.2, y)
    ctx.lineTo(0.8, y)
  }
  ctx.lineWidth = lw(0.09)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = lw(0.05)
  ctx.strokeStyle = RAIL
  ctx.stroke()
  for (const x of [0.12, 0.8]) inkPart(ctx, (c) => roundRectPath(c, x, -0.08, 0.08, size + 0.08, 0.04), RAIL, RAIL_SHADE, 0.02, LINE_DETAIL, null)
}

/** A block of `kind` as built: `size` cells, the `index`-th piece, its trampoline `dip`. */
export function drawPiece(ctx: CanvasRenderingContext2D, kind: Kind, size: number, index: number, dip: number) {
  if (kind === 'plank') drawPlank(ctx, size)
  else if (kind === 'cube') drawCube(ctx, index)
  else if (kind === 'trampoline') drawTrampoline(ctx, dip)
  else drawLadder(ctx, size)
}

/** Where the chosen block would go: the block itself, faint and breathing. */
export function drawGhost(ctx: CanvasRenderingContext2D, kind: Kind, size: number, t: number) {
  ctx.save()
  ctx.globalAlpha = 0.3 + 0.12 * Math.sin(t * 5)
  drawPiece(ctx, kind, size, 0, 0)
  ctx.restore()
}

/** A block of `kind` small and centred on the origin, `scale` tiles across: on a crate and in the HUD's tray. */
export function drawIcon(ctx: CanvasRenderingContext2D, kind: Kind, scale: number) {
  ctx.save()
  if (kind === 'plank') {
    // Two short boards, one on the other: a long thin one would be a stick at this size.
    ctx.scale(scale / 1.3, scale / 1.3)
    ctx.rotate(-0.3)
    ctx.translate(-0.6, -0.3)
    drawPlank(ctx, 1.2)
    ctx.translate(0.05, 0.32)
    drawPlank(ctx, 1.2)
  } else if (kind === 'ladder') {
    ctx.scale(scale / 1.6, scale / 1.6)
    ctx.translate(-0.5, -0.8)
    drawLadder(ctx, 1.6)
  } else {
    ctx.scale(scale, scale)
    ctx.translate(-0.5, kind === 'trampoline' ? -0.68 : -0.5)
    drawPiece(ctx, kind, 1, 1, 0)
  }
  ctx.restore()
}

/** A crate of one block, bobbing on its cell's centre: a light wooden box with the block on its front. */
export function drawCrate(ctx: CanvasRenderingContext2D, kind: Kind, t: number, phase: number) {
  const bob = Math.sin(t * 3 + phase) * 0.05
  ctx.save()
  ctx.translate(0, bob)
  inkPart(ctx, (c) => roundRectPath(c, -0.36, -0.36, 0.72, 0.72, 0.1), CRATE, CRATE_SHADE, SHADE_BLOCK * 0.6, LINE, null)
  drawIcon(ctx, kind, 0.5)
  ctx.restore()
}

/** A present, bobbing and twinkling on its cell's centre: the `index`-th of its level's three, each in its own paper. */
export function drawPresent(ctx: CanvasRenderingContext2D, index: number, t: number) {
  const [paper, shade, ribbon] = PRESENTS[index % PRESENTS.length]!
  const bob = Math.sin(t * 2.5 + index) * 0.06
  ctx.save()
  ctx.translate(0, bob)
  inkPart(ctx, (c) => roundRectPath(c, -0.36, -0.28, 0.72, 0.62, 0.08), paper, shade, SHADE_BLOCK * 0.6, LINE, null)
  ctx.fillStyle = ribbon
  ctx.fillRect(-0.07, -0.28, 0.14, 0.62)
  inkPart(ctx, (c) => roundRectPath(c, -0.4, -0.4, 0.8, 0.16, 0.05), paper, shade, 0.04, LINE, null)
  ctx.fillRect(-0.07, -0.4, 0.14, 0.16)
  // The bow: two loops.
  for (const side of [-1, 1]) {
    inkPart(ctx, (c) => {
      c.beginPath()
      c.ellipse(side * 0.13, -0.47, 0.12, 0.08, side * 0.5, 0, Math.PI * 2)
    }, ribbon, shade, 0.02, LINE_DETAIL, null)
  }
  ctx.beginPath()
  sparklePath(ctx, 0.36, -0.5, 0.18 + 0.08 * Math.sin(t * 4 + index * 2))
  ctx.fillStyle = COLOR.sparkle
  ctx.fill()
  ctx.restore()
}

/** The finish: a rainbow arch over the floor, its foot at the origin, the stripes shimmering. */
export function drawFinish(ctx: CanvasRenderingContext2D, t: number) {
  const r = 1.3
  const bands = COLOR.rainbow
  const w = 0.11
  ctx.lineCap = 'butt'
  for (let i = 0; i < bands.length; i++) {
    const rr = r - i * w
    ctx.beginPath()
    ctx.moveTo(-rr, 0)
    ctx.lineTo(-rr, -1.6)
    ctx.arc(0, -1.6, rr, Math.PI, 0)
    ctx.lineTo(rr, 0)
    ctx.lineWidth = lw(w + 0.01)
    ctx.strokeStyle = bands[i]!
    ctx.stroke()
  }
  ctx.beginPath()
  for (const rr of [r + w / 2, r - (bands.length - 0.5) * w]) {
    ctx.moveTo(-rr, 0)
    ctx.lineTo(-rr, -1.6)
    ctx.arc(0, -1.6, rr, Math.PI, 0)
    ctx.lineTo(rr, 0)
  }
  ctx.lineWidth = lw(LINE)
  ctx.strokeStyle = INK
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + ((i + 1) / 4) * Math.PI + Math.sin(t * 2 + i) * 0.1
    ctx.beginPath()
    sparklePath(ctx, Math.cos(a) * (r + 0.25), -1.6 + Math.sin(a) * (r + 0.25), 0.2 + 0.06 * Math.sin(t * 5 + i))
    ctx.fillStyle = COLOR.sparkleWarm
    ctx.fill()
  }
}
