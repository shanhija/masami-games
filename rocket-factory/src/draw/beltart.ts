import { cellOf, stepCell, xOf, yOf } from '../game/board'
import { PATTERNS } from '../game/catalog'
import { DX, DY, THINGS, opposite, type Belts, type Dir } from '../game/model'
import {
  BELT,
  BUILDING,
  C,
  HEDGE,
  TAU,
  addCircle,
  addRoundPoly,
  addRoundRect,
  arch,
  clamp01,
  dieCut,
  fill,
  heartPath,
  loop,
  mix,
  pen,
  rim,
  roundStroke,
  smooth,
  type SheetEntry,
} from './look'
import { ON_BELT, drawThing } from './things'

/**
 * The belts as the layout draws them, seen from straight above (look.ts rule 1): a deep teal
 * body across each cell, straight or round a bend, its tone-on-tone pattern, a round cap where
 * a belt starts and an arrowhead where it ends on nothing, a fork's side branch, a join's
 * stub; over the bake, the moving marks (white rim ticks pointing downstream along both edges,
 * and the body's chevrons, each as one path for the whole board), a fork's paddle, a join's
 * zip and a bridge's hump with its over lane. Then the hedges and their stumps, a new cell's
 * pop and a rolled-up cell's curl, the stroke being drawn (see-through, grey past where it
 * stops) and the sign at its end, and the hint's dotted path.
 *
 * Everything is in board cells at the cell's own place, from plain data the renderer reads off
 * the state (`beltPic`, `hedgeLinks`); nothing here reads the state itself.
 *
 * A cell's lane runs from the middle of its in edge to the middle of its out edge (where.ts
 * lanePoint): `s` from 0 to 1 along it, `w` cells to the right of its middle line. A hop moves
 * a thing half a lane, so the marks of a cell that has made `hops` hops sit half a lane apart
 * at hops / 2 along it, gliding with the hop and standing still with a jam.
 */

/** The body's width across, in cells: two things of ON_BELT ride it with their rims, and a cell's middle leaves ground either side. */
export const BODY = 0.56
const H = BODY / 2
/** A belt's start cap is a half disc of the body's width; its dead end an arrowhead HEAD long whose barbs stand BARB past the body. */
const HEAD = 0.3
const BARB = 0.07
/** A rim tick: a chevron TICK long and TICK_W thick just inside the body's edge (TICK_IN from it, so it reads white on teal); a body chevron, CHEVRON long and CHEVRON_W across, pointed enough to read as an arrow round a bend too. */
const TICK = 0.07
const TICK_W = 0.05
const TICK_IN = 0.055
const CHEVRON = 0.14
const CHEVRON_W = 0.25
/** A bridge's rails: white lines along both sides of its over lane, RAIL thick. */
const RAIL = 0.05
/** A new cell pops down over POP seconds; a rolled-up one curls away over CURL. */
export const POP = 0.25
export const CURL = 0.35

/** One belt cell as the layout draws it, read off State.belts (`beltPic`). */
export interface BeltPic {
  cell: number
  in: Dir
  out: Dir
  /** A fork's second way out, or -1. */
  fork: Dir | -1
  /** A bridge's over lane: the side it leaves by, or -1. */
  over: Dir | -1
  /** The sides other belts join it from, each a stub with a zip. */
  joins: Dir[]
  /** Its pattern (catalog.ts PATTERNS). */
  pattern: number
  /** Nothing feeds it (no belt and no building at its in side): a round cap. */
  start: boolean
  /** Nothing takes from it (no belt and no building at its out side): an arrowhead. */
  end: boolean
}

/** A belt cell and the hops its things have made, with the glide of the hop now (State.belts.moved, plus the hop's fraction while it moved): its marks' phase. */
export interface BeltMarks {
  pic: BeltPic
  hops: number
}

/** Whether the belt across side d of cell c points into c: its lane or its bridge's over lane leaves toward c. */
function pointsAt(belts: Belts, c: number, d: Dir): boolean {
  const n = stepCell(c, d)
  return n >= 0 && (belts.out[n] === opposite(d) || belts.over[n] === opposite(d))
}
/** Whether the neighbour across side d of cell c gives things into c (`giving`) or takes them from it. Where it has a belt (a tower and a bowl stand on one) the belt decides; else a building's edge is a spout or a mouth. */
function meets(belts: Belts, owner: Int16Array, c: number, d: Dir, giving: boolean): boolean {
  const n = stepCell(c, d)
  if (n < 0) return false
  if (belts.in[n] !== -1) return giving ? pointsAt(belts, c, d) : true
  return owner[n] !== -1
}

/** Cell c's picture data from the belt arrays and the cells' owners (State.owner). Throws for a cell with no belt. */
export function beltPic(belts: Belts, owner: Int16Array, c: number): BeltPic {
  const i = belts.in[c]!
  const o = belts.out[c]!
  if (i < 0 || o < 0) throw new Error(`cell ${c} has no belt`)
  const fork = belts.fork[c]! as Dir | -1
  // A join is a belt ending on this one's side; buildings never feed a side.
  const joins: Dir[] = []
  for (const d of [0, 1, 2, 3] as const) if (d !== i && d !== o && d !== fork && pointsAt(belts, c, d)) joins.push(d)
  return {
    cell: c,
    in: i as Dir,
    out: o as Dir,
    fork,
    over: belts.over[c]! as Dir | -1,
    joins,
    pattern: belts.pattern[c]!,
    start: !meets(belts, owner, c, i as Dir, true),
    end: !meets(belts, owner, c, o as Dir, false) && (fork === -1 || !meets(belts, owner, c, fork, false)),
  }
}

// ---------------------------------------------------------------------------------------
// A lane's geometry

/** A bend's inner corner (kx, ky), the angle from it to the in edge's middle, and the quarter turn to the out edge's (plus clockwise on screen, a right turn). */
function bendOf(c: number, i: Dir, o: Dir) {
  const kx = xOf(c) + 0.5 + (DX[i] + DX[o]) * 0.5
  const ky = yOf(c) + 0.5 + (DY[i] + DY[o]) * 0.5
  const a0 = Math.atan2(-DY[o], -DX[o])
  let d = Math.atan2(-DY[i], -DX[i]) - a0
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return { kx, ky, a0, d }
}
/** The lane's length along its middle line, in cells. */
const laneLength = (i: Dir, o: Dir) => (i === opposite(o) ? 1 : Math.PI / 4)

/** The point s along cell c's lane (in side i, out side o), w cells right of its middle, and the lane's direction there: [x, y, tx, ty]. */
function laneAt(c: number, i: Dir, o: Dir, s: number, w: number): [number, number, number, number] {
  if (i === opposite(o)) {
    const tx = DX[o]
    const ty = DY[o]
    return [xOf(c) + 0.5 + tx * (s - 0.5) - ty * w, yOf(c) + 0.5 + ty * (s - 0.5) + tx * w, tx, ty]
  }
  const b = bendOf(c, i, o)
  const a = b.a0 + b.d * s
  const sg = b.d > 0 ? 1 : -1
  // On a right turn the right of the lane is toward the inner corner.
  const r = 0.5 - sg * w
  return [b.kx + Math.cos(a) * r, b.ky + Math.sin(a) * r, -Math.sin(a) * sg, Math.cos(a) * sg]
}
/** A point in a lane frame [x, y, tx, ty]: u along the lane, v to its right. */
const local = (f: readonly number[], u: number, v: number): [number, number] => [f[0]! + f[2]! * u - f[3]! * v, f[1]! + f[3]! * u + f[2]! * v]

/** A band from (x0, y0) to (x1, y1), `half` either side, added clockwise. */
function addBand(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, half: number) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const nx = (-(y1 - y0) / len) * half
  const ny = ((x1 - x0) / len) * half
  ctx.moveTo(x0 - nx, y0 - ny)
  ctx.lineTo(x1 - nx, y1 - ny)
  ctx.lineTo(x1 + nx, y1 + ny)
  ctx.lineTo(x0 + nx, y0 + ny)
  ctx.closePath()
}

/** The part of cell c's lane from s0 to s1, `half` either side of its middle line, added clockwise: a band, or round a bend an annulus' quarter. */
function addLane(ctx: CanvasRenderingContext2D, c: number, i: Dir, o: Dir, s0: number, s1: number, half: number) {
  if (i === opposite(o)) {
    const a = laneAt(c, i, o, s0, 0)
    const b = laneAt(c, i, o, s1, 0)
    addBand(ctx, a[0], a[1], b[0], b[1], half)
    return
  }
  const b = bendOf(c, i, o)
  const p = b.a0 + b.d * s0
  const q = b.a0 + b.d * s1
  const lo = Math.min(p, q)
  const hi = Math.max(p, q)
  ctx.moveTo(b.kx + Math.cos(lo) * (0.5 + half), b.ky + Math.sin(lo) * (0.5 + half))
  ctx.arc(b.kx, b.ky, 0.5 + half, lo, hi, false)
  ctx.arc(b.kx, b.ky, Math.max(0, 0.5 - half), hi, lo, true)
  ctx.closePath()
}

/** Where a cell's body starts and ends along its lane: after its round cap, before its arrowhead. */
function span(p: BeltPic): [number, number] {
  const len = laneLength(p.in, p.out)
  return [p.start ? H / len : 0, p.end ? 1 - HEAD / len : 1]
}

/** A cell's body (its main lane with its caps, a fork's branch, the joins' stubs) added to the current path, every piece clockwise so one fill covers them once. */
function addBody(ctx: CanvasRenderingContext2D, p: BeltPic) {
  const [s0, s1] = span(p)
  addLane(ctx, p.cell, p.in, p.out, s0, s1, H)
  if (p.start) {
    const f = laneAt(p.cell, p.in, p.out, s0, 0)
    addCircle(ctx, f[0], f[1], H)
  }
  if (p.end) {
    const a = laneAt(p.cell, p.in, p.out, s1, -H - BARB)
    const tip = laneAt(p.cell, p.in, p.out, 1, 0)
    const b = laneAt(p.cell, p.in, p.out, s1, H + BARB)
    addRoundPoly(ctx, [a[0], a[1], tip[0], tip[1], b[0], b[1]], 0.05)
  }
  const mx = xOf(p.cell) + 0.5
  const my = yOf(p.cell) + 0.5
  if (p.fork !== -1) addBand(ctx, mx - DX[p.fork] * 0.1, my - DY[p.fork] * 0.1, mx + DX[p.fork] * 0.5, my + DY[p.fork] * 0.5, H)
  for (const d of p.joins) addBand(ctx, mx + DX[d] * 0.5, my + DY[d] * 0.5, mx - DX[d] * 0.1, my - DY[d] * 0.1, H)
}

/** A bridge's over lane, straight across its cell. */
function addOver(ctx: CanvasRenderingContext2D, p: BeltPic, half: number) {
  const o = p.over as Dir
  const mx = xOf(p.cell) + 0.5
  const my = yOf(p.cell) + 0.5
  addBand(ctx, mx - DX[o] * 0.5, my - DY[o] * 0.5, mx + DX[o] * 0.5, my + DY[o] * 0.5, half)
}

// ---------------------------------------------------------------------------------------
// The patterns, printed tone on tone in the body

/** A lane frame's local shape: `draw` adds a path in (u along, v right) coordinates round the point s, w of cell p's lane, and it is filled or stroked in the pattern's tone. */
function inFrame(ctx: CanvasRenderingContext2D, p: BeltPic, s: number, w: number, draw: () => void) {
  const f = laneAt(p.cell, p.in, p.out, s, w)
  ctx.save()
  ctx.transform(f[2], f[3], -f[3], f[2], f[0], f[1])
  draw()
  ctx.restore()
}
/** A polyline through the lane at (s, w) pairs, as a fresh path. */
function lanePolyline(ctx: CanvasRenderingContext2D, p: BeltPic, sw: readonly number[]) {
  ctx.beginPath()
  for (let k = 0; k < sw.length; k += 2) {
    const f = laneAt(p.cell, p.in, p.out, sw[k]!, sw[k + 1]!)
    if (k === 0) ctx.moveTo(f[0], f[1])
    else ctx.lineTo(f[0], f[1])
  }
}
/** Cell p's pattern in its body (clipped to it), in BELT.pattern on BELT.body: two repeats a lane, so a straight run lines up cell to cell. */
function drawPattern(ctx: CanvasRenderingContext2D, p: BeltPic) {
  const name = PATTERNS[p.pattern]
  if (name === undefined) throw new Error(`belt pattern ${p.pattern} is not in PATTERNS`)
  if (name === 'plain') return
  const tone = BELT.pattern
  ctx.save()
  ctx.beginPath()
  addBody(ctx, p)
  ctx.clip()
  switch (name) {
    case 'stripes':
      ctx.beginPath()
      for (let k = 0; k < 4; k++) {
        const s = (k + 0.5) / 4
        const a = laneAt(p.cell, p.in, p.out, s - 0.1, -H - 0.04)
        const b = laneAt(p.cell, p.in, p.out, s + 0.1, H + 0.04)
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
      }
      roundStroke(ctx, 0.075, tone)
      break
    case 'dots':
      ctx.beginPath()
      for (let k = 0; k < 4; k++) {
        const f = laneAt(p.cell, p.in, p.out, (k + 0.5) / 4, k % 2 === 0 ? -0.15 : 0.15)
        addCircle(ctx, f[0], f[1], 0.065)
      }
      fill(ctx, tone)
      break
    case 'zigzag': {
      const sw: number[] = []
      for (let k = 0; k <= 8; k++) sw.push(k / 8, k % 2 === 0 ? -0.14 : 0.14)
      lanePolyline(ctx, p, sw)
      roundStroke(ctx, 0.05, tone)
      break
    }
    case 'hearts':
      for (const [s, w] of [
        [0.25, -0.13],
        [0.75, 0.13],
      ] as const)
        inFrame(ctx, p, s, w, () => {
          // Pointing downstream.
          ctx.rotate(-Math.PI / 2)
          heartPath(ctx, 0, 0, 0.19)
          fill(ctx, tone)
        })
      break
    case 'waves':
      for (const w of [-0.13, 0.13]) {
        const sw: number[] = []
        for (let k = 0; k <= 16; k++) sw.push(k / 16, w + 0.045 * Math.sin((k / 16) * 2 * TAU))
        lanePolyline(ctx, p, sw)
        roundStroke(ctx, 0.045, tone)
      }
      break
    case 'checks':
      ctx.beginPath()
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          if ((i + j) % 2 !== 0) continue
          const pts: number[] = []
          for (const [s, w] of [
            [i / 4, -H + j * H],
            [(i + 1) / 4, -H + j * H],
            [(i + 1) / 4, j * H],
            [i / 4, j * H],
          ] as const) {
            const f = laneAt(p.cell, p.in, p.out, s, w)
            pts.push(f[0], f[1])
          }
          ctx.moveTo(pts[0]!, pts[1]!)
          for (let k = 2; k < 8; k += 2) ctx.lineTo(pts[k]!, pts[k + 1]!)
          ctx.closePath()
        }
      fill(ctx, tone)
      break
    case 'diamonds':
      for (const s of [0.25, 0.75])
        inFrame(ctx, p, s, 0, () => {
          ctx.beginPath()
          addRoundPoly(ctx, [-0.1, 0, 0, -0.15, 0.1, 0, 0, 0.15], 0.02)
          fill(ctx, tone)
        })
      break
    case 'scales':
      for (let k = 0; k < 4; k++)
        for (const w of [-0.13, 0.13])
          inFrame(ctx, p, (k + (w > 0 ? 0.5 : 0)) / 4, w, () => {
            ctx.beginPath()
            ctx.arc(0, 0, 0.085, -Math.PI / 2, Math.PI / 2)
            roundStroke(ctx, 0.04, tone)
          })
      break
    case 'leaves':
      for (const [s, w, a] of [
        [0.25, -0.12, 0.5],
        [0.75, 0.12, -0.5],
      ] as const)
        inFrame(ctx, p, s, w, () => {
          ctx.rotate(a)
          ctx.beginPath()
          ctx.moveTo(-0.13, 0)
          ctx.quadraticCurveTo(0, -0.1, 0.13, 0)
          ctx.quadraticCurveTo(0, 0.1, -0.13, 0)
          ctx.closePath()
          fill(ctx, tone)
        })
      break
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The layout bake

/** The belts of the layout bake: every cell's shadow as one shape, then every body as one shape (no seams between cells), then each cell's pattern. Bridges' over lanes are `drawBridges`'. */
export function drawBelts(ctx: CanvasRenderingContext2D, pics: readonly BeltPic[]): void {
  ctx.save()
  ctx.translate(pen.shadowX, pen.shadowY)
  ctx.beginPath()
  for (const p of pics) addBody(ctx, p)
  fill(ctx, C.shadow)
  ctx.restore()
  ctx.beginPath()
  for (const p of pics) addBody(ctx, p)
  fill(ctx, BELT.body)
  for (const p of pics) drawPattern(ctx, p)
}

// ---------------------------------------------------------------------------------------
// The moving marks

/** Whether a mark at s along p's lane sits where the lane is open to the side (a fork's branch, a join's stub) on the edge at w, or under its bridge. */
function hidden(p: BeltPic, s: number, w: number): boolean {
  const near = (d: Dir) => {
    // The side d's opening spans the middle of the lane on the edge toward d.
    const f = laneAt(p.cell, p.in, p.out, s, w)
    const mx = xOf(p.cell) + 0.5 + DX[d] * 0.5
    const my = yOf(p.cell) + 0.5 + DY[d] * 0.5
    return Math.abs((f[0] - mx) * DY[d] - (f[1] - my) * DX[d]) < H + 0.06 && (f[0] - mx) * DX[d] + (f[1] - my) * DY[d] > -0.5 + H - 0.04
  }
  if (p.over !== -1 && Math.abs(s - 0.5) < H + 0.08) return true
  if (p.fork !== -1 && w !== 0 && near(p.fork)) return true
  for (const d of p.joins) if (w !== 0 && near(d)) return true
  return false
}

/** Adds a chevron `long` along and `wide` across, pointing downstream, round the point v right of a lane frame's point. */
function addChevron(ctx: CanvasRenderingContext2D, f: readonly number[], v: number, long: number, wide: number) {
  const [ax, ay] = local(f, -long * 0.5, v - wide * 0.5)
  const [bx, by] = local(f, long * 0.5, v)
  const [cx, cy] = local(f, -long * 0.5, v + wide * 0.5)
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.lineTo(cx, cy)
}

/** Adds the marks of one lane: `ticks` along its edges (a bend's outer edge only: its inner one is too short for two) or the chevrons in the middle, two a lane at hops / 2 (ticks a quarter lane on), within [s0, s1]; `check` leaves out the ones over an opening or under a bridge. */
function addMarks(ctx: CanvasRenderingContext2D, p: BeltPic, i: Dir, o: Dir, hops: number, s0: number, s1: number, ticks: boolean, check: boolean) {
  const base = (((hops / 2 + (ticks ? 0.25 : 0)) % 0.5) + 0.5) % 0.5
  const edge = H - TICK_IN
  // A right turn's inner edge is on its right.
  const edges = i === opposite(o) ? [-edge, edge] : [bendOf(p.cell, i, o).d > 0 ? -edge : edge]
  for (let k = 0; k < 2; k++) {
    const s = base + k * 0.5
    if (s < s0 || s > s1) continue
    for (const w of ticks ? edges : [0]) {
      if (check && hidden(p, s, w)) continue
      const f = laneAt(p.cell, i, o, s, w)
      if (ticks) addChevron(ctx, f, 0, TICK, TICK * 1.4)
      else addChevron(ctx, f, 0, CHEVRON, CHEVRON_W)
    }
  }
}

/** The moving marks over the bake, each kind as one path for the whole board: every lane's white rim ticks along both edges and its chevrons in the body, at its hops (bridges' over lanes are `drawBridges`'). */
export function drawBeltMarks(ctx: CanvasRenderingContext2D, marks: readonly BeltMarks[]): void {
  for (const ticks of [true, false]) {
    ctx.beginPath()
    for (const m of marks) {
      const p = m.pic
      const [s0, s1] = span(p)
      const len = laneLength(p.in, p.out)
      addMarks(ctx, p, p.in, p.out, m.hops, s0 + (ticks ? TICK / len : 0.02), s1 - (ticks ? TICK / len : 0.02), ticks, true)
      if (ticks && p.fork !== -1) {
        // The fork's branch: a tick on each of its edges, pointing out of the side.
        const f = laneAt(p.cell, opposite(p.fork), p.fork, 0.84, 0)
        for (const v of [-H + TICK_IN, H - TICK_IN]) addChevron(ctx, f, v, TICK, TICK * 1.4)
      }
    }
    roundStroke(ctx, ticks ? TICK_W : 0.065, ticks ? BELT.tick : BELT.chevron)
  }
}

/** The bridges, over the things riding under them: each over lane's long shadow on the lane below, its hump with its lighter crown between two white rails, and its chevrons at its cell's hops, pointing its way moving or not. */
export function drawBridges(ctx: CanvasRenderingContext2D, marks: readonly BeltMarks[]): void {
  const bridges = marks.filter((m) => m.pic.over !== -1)
  if (bridges.length === 0) return
  ctx.save()
  ctx.translate(pen.shadowX * 2.2, pen.shadowY * 2.2)
  ctx.beginPath()
  for (const m of bridges) addOver(ctx, m.pic, H)
  fill(ctx, C.shadow)
  ctx.restore()
  ctx.beginPath()
  for (const m of bridges) addOver(ctx, m.pic, H)
  fill(ctx, BELT.hump)
  // The hump's crown: a lighter band across the middle of the over lane.
  ctx.beginPath()
  for (const m of bridges) {
    const o = m.pic.over as Dir
    const f = laneAt(m.pic.cell, opposite(o), o, 0.5, 0)
    const [ax, ay] = local(f, -0.13, 0)
    const [bx, by] = local(f, 0.13, 0)
    addBand(ctx, ax, ay, bx, by, H - RAIL)
  }
  fill(ctx, BELT.humpTop)
  ctx.beginPath()
  for (const m of bridges) {
    const o = m.pic.over as Dir
    for (const v of [-H + RAIL / 2, H - RAIL / 2]) {
      const a = laneAt(m.pic.cell, opposite(o), o, 0, v)
      const b = laneAt(m.pic.cell, opposite(o), o, 1, v)
      addBand(ctx, a[0], a[1], b[0], b[1], RAIL / 2)
    }
  }
  fill(ctx, C.white)
  ctx.beginPath()
  for (const m of bridges) {
    const o = m.pic.over as Dir
    addMarks(ctx, m.pic, opposite(o), o, m.hops, 0.04, 0.96, false, false)
  }
  roundStroke(ctx, 0.065, BELT.chevron)
}

/** A fork's paddle at its cell's middle, pointing straight on at k 0 and to its side at k 1 (between, it is flipping), with its own small shadow. */
export function drawPaddle(ctx: CanvasRenderingContext2D, p: BeltPic, k: number): void {
  if (p.fork === -1) throw new Error(`cell ${p.cell} is not a fork`)
  const a0 = Math.atan2(DY[p.out], DX[p.out])
  let d = Math.atan2(DY[p.fork], DX[p.fork]) - a0
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  const a = a0 + d * smooth(0, 1, k)
  const path = () => {
    ctx.beginPath()
    // A rounded flipper from its pivot at the middle, its tip toward the way things go.
    addRoundPoly(ctx, [-0.07, -0.1, 0.3, -0.045, 0.3, 0.045, -0.07, 0.1], 0.05)
  }
  ctx.save()
  ctx.translate(xOf(p.cell) + 0.5, yOf(p.cell) + 0.5)
  ctx.save()
  ctx.translate(pen.shadowX * 0.7, pen.shadowY * 0.7)
  ctx.rotate(a)
  path()
  fill(ctx, C.shadow)
  ctx.restore()
  ctx.rotate(a)
  path()
  fill(ctx, BELT.tick)
  ctx.beginPath()
  addCircle(ctx, 0, 0, 0.045)
  fill(ctx, BELT.chevron)
  ctx.restore()
}

/** A join's zip on the seam where the stub from side d meets the lane: five teeth across the stub, a zigzag where they have closed and two loose rows where they are open, a tooth closing with each merge (merges mod 6 closed, then it opens again). */
export function drawZip(ctx: CanvasRenderingContext2D, p: BeltPic, d: Dir, merges: number): void {
  if (!p.joins.includes(d)) throw new Error(`cell ${p.cell} has no join from side ${d}`)
  const closed = ((Math.floor(merges) % 6) + 6) % 6
  // The seam's middle, and the way across the stub (at right angles to d).
  const mx = xOf(p.cell) + 0.5 + DX[d] * (H + 0.01)
  const my = yOf(p.cell) + 0.5 + DY[d] * (H + 0.01)
  const ax = -DY[d]
  const ay = DX[d]
  const at = (k: number, off: number): [number, number] => {
    const t = -H + 0.06 + (k * (2 * H - 0.12)) / 4
    return [mx + ax * t + DX[d] * off, my + ay * t + DY[d] * off]
  }
  if (closed > 0) {
    ctx.beginPath()
    for (let k = 0; k < closed; k++) {
      const [x, y] = at(k, k % 2 === 0 ? 0.035 : -0.035)
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    if (closed === 1) {
      const [x, y] = at(0, -0.035)
      ctx.lineTo(x, y)
    }
    roundStroke(ctx, 0.05, BELT.tick)
  }
  ctx.beginPath()
  for (let k = closed; k < 5; k++)
    for (const side of [-1, 1]) {
      const [x, y] = at(k, side * 0.065)
      addRoundRect(ctx, x - 0.024, y - 0.024, 0.048, 0.048, 0.014)
    }
  fill(ctx, BELT.tick)
}

// ---------------------------------------------------------------------------------------
// A cell popping in, a cell curling away

/** A newly laid cell `age` seconds after it was laid (the renderer draws it live over the bake until POP): it lands from a little above, its shadow shortening, with its pattern. */
export function drawBeltPop(ctx: CanvasRenderingContext2D, p: BeltPic, age: number): void {
  const e = 1 - (1 - clamp01(age / POP)) ** 2
  const k = mix(1.14, 1, e)
  const lift = 0.5 * (1 - e)
  const mx = xOf(p.cell) + 0.5
  const my = yOf(p.cell) + 0.5
  /** The cell's body, grown by k about its middle (the shadow's offset stays in cells). */
  const body = () => {
    ctx.save()
    ctx.translate(mx, my)
    ctx.scale(k, k)
    ctx.translate(-mx, -my)
    ctx.beginPath()
    addBody(ctx, p)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(pen.shadowX * (1 + lift * 2.5), pen.shadowY * (1 + lift * 2.5))
  body()
  fill(ctx, lift > 0 ? C.liftShadow : C.shadow)
  ctx.restore()
  body()
  fill(ctx, BELT.body)
  ctx.save()
  ctx.translate(mx, my)
  ctx.scale(k, k)
  ctx.translate(-mx, -my)
  drawPattern(ctx, p)
  ctx.restore()
}

/** A rolled-up cell `age` seconds after the roll began (until CURL): its body rolls up from its in end toward its out end like a sticker peeled, the roll showing the sticker's white back. */
export function drawBeltCurl(ctx: CanvasRenderingContext2D, p: BeltPic, age: number): void {
  const u = clamp01(age / CURL)
  if (u >= 1) return
  const s = smooth(0, 1, u) * 0.96
  ctx.save()
  ctx.translate(pen.shadowX, pen.shadowY)
  ctx.beginPath()
  addLane(ctx, p.cell, p.in, p.out, s, 1, H)
  fill(ctx, C.shadow)
  ctx.restore()
  ctx.beginPath()
  addLane(ctx, p.cell, p.in, p.out, s, 1, H)
  fill(ctx, BELT.body)
  // The roll: a capsule across the lane, growing as it gathers the belt.
  const f = laneAt(p.cell, p.in, p.out, s, 0)
  const thick = mix(0.06, 0.16, u) * (1 - 0.6 * smooth(0.75, 1, u))
  const [ax, ay] = local(f, 0, -H - 0.02)
  const [bx, by] = local(f, 0, H + 0.02)
  ctx.save()
  ctx.translate(pen.shadowX * 1.5, pen.shadowY * 1.5)
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  roundStroke(ctx, thick + 2 * rim(), C.shadow)
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  roundStroke(ctx, thick + 2 * rim(), C.white)
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  roundStroke(ctx, thick * 0.45, BELT.chevron)
}

// ---------------------------------------------------------------------------------------
// Hedges and stumps

/** One hedge cell as the layout draws it: a hedge, or the stump a muncher left (sprouting 0 to 1 as it regrows); which sides join a hedge next to it (a bit per Dir); bites (0 to 3) a nibbler has taken. */
export interface HedgePic {
  cell: number
  stump: boolean
  links: number
  bites: number
  sprout: number
}

/** The sides of cell c (a bit per Dir) whose neighbour is a hedge (State.hedge 1), so a hedge line grows into one leafy row. */
export function hedgeLinks(hedge: Uint8Array, c: number): number {
  let links = 0
  for (const d of [0, 1, 2, 3] as const) {
    const n = stepCell(c, d)
    if (n >= 0 && hedge[n] === 1) links |= 1 << d
  }
  return links
}

/** A hedge cell's leafy bumps (x, y, r): its middle, four round its middle less one per bite, and one toward each linked side reaching its edge. */
function hedgeBumps(h: HedgePic): number[] {
  const x = xOf(h.cell) + 0.5
  const y = yOf(h.cell) + 0.5
  const out = [x, y, 0.27 - 0.03 * h.bites]
  // The bites go round from the top right.
  const corners = [
    [0.17, -0.17],
    [-0.17, 0.17],
    [-0.17, -0.17],
    [0.17, 0.17],
  ] as const
  corners.forEach(([dx, dy], k) => {
    if (k < h.bites) return
    out.push(x + dx, y + dy, 0.2)
  })
  for (const d of [0, 1, 2, 3] as const) if (h.links & (1 << d)) out.push(x + DX[d] * 0.36, y + DY[d] * 0.36, 0.22)
  return out
}

/** The hedges and stumps: the hedges as one leafy sticker (shadow, white rim, leaves, lighter leaves, a darker fold) so a line of them is one row, then each stump with its rings and its sprout. */
export function drawHedges(ctx: CanvasRenderingContext2D, hedges: readonly HedgePic[]): void {
  const leafy = hedges.filter((h) => !h.stump)
  const bumps = leafy.map(hedgeBumps)
  const all = () => {
    ctx.beginPath()
    for (const b of bumps) for (let i = 0; i < b.length; i += 3) addCircle(ctx, b[i]!, b[i + 1]!, b[i + 2]!)
  }
  if (leafy.length > 0) {
    dieCut(ctx, all, 0)
    all()
    fill(ctx, HEDGE.body)
    // Leaves on every bump, each turned its own way: a lighter one high on it, a darker one low on it.
    for (const [tone, dx, dy, len] of [
      [HEDGE.light, -0.28, -0.3, 0.7],
      [HEDGE.fold, 0.32, 0.34, 0.5],
    ] as const) {
      ctx.beginPath()
      for (const b of bumps)
        for (let i = 0; i < b.length; i += 3) {
          const r = b[i + 2]!
          const x = b[i]! + r * dx
          const y = b[i + 1]! + r * dy
          const a = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % TAU
          const l = (r * len) / 2
          const c = Math.cos(a) * l
          const s = Math.sin(a) * l
          ctx.moveTo(x - c, y - s)
          ctx.quadraticCurveTo(x + s * 0.6, y - c * 0.6, x + c, y + s)
          ctx.quadraticCurveTo(x - s * 0.6, y + c * 0.6, x - c, y - s)
          ctx.closePath()
        }
      fill(ctx, tone)
    }
  }
  for (const h of hedges) {
    if (!h.stump) continue
    const x = xOf(h.cell) + 0.5
    const y = yOf(h.cell) + 0.5
    dieCut(
      ctx,
      () => {
        ctx.beginPath()
        addCircle(ctx, x, y, 0.2)
      },
      0,
    )
    ctx.beginPath()
    addCircle(ctx, x, y, 0.2)
    fill(ctx, HEDGE.stump)
    ctx.beginPath()
    ctx.arc(x, y, 0.12, 0, TAU)
    ctx.moveTo(x + 0.05, y)
    ctx.arc(x, y, 0.05, 0, TAU)
    roundStroke(ctx, 0.03, HEDGE.ring)
    if (h.sprout > 0) {
      // A sprout of two leaves, growing as the hedge comes back.
      const k = smooth(0, 1, h.sprout)
      ctx.beginPath()
      for (const side of [-1, 1]) {
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + side * 0.12 * k, y - 0.12 * k, x + side * 0.2 * k, y - 0.03 * k)
        ctx.quadraticCurveTo(x + side * 0.08 * k, y + 0.02 * k, x, y)
        ctx.closePath()
      }
      fill(ctx, HEDGE.light)
    }
  }
}

// ---------------------------------------------------------------------------------------
// The stroke being drawn, its end sign, the hint's path

/** One cell of the stroke being drawn (strokes.ts plans it): its lane, how long ago the finger reached it (it pops down), and whether it lies past where the stroke stops (grey). */
export interface GhostCell {
  cell: number
  in: Dir
  out: Dir
  age: number
  grey: boolean
}

/** The stroke being drawn: see-through belt cells popping down one by one, chevrons marching the way things will ride, grey past where it stops. */
export function drawStrokeGhost(ctx: CanvasRenderingContext2D, cells: readonly GhostCell[], t: number): void {
  const pic = (g: GhostCell): BeltPic => ({ cell: g.cell, in: g.in, out: g.out, fork: -1, over: -1, joins: [], pattern: 0, start: false, end: false })
  for (const grey of [false, true]) {
    ctx.beginPath()
    for (const g of cells) {
      if (g.grey !== grey) continue
      const e = 1 - (1 - clamp01(g.age / POP)) ** 2
      const k = mix(0.7, 1, e)
      const mx = xOf(g.cell) + 0.5
      const my = yOf(g.cell) + 0.5
      ctx.save()
      ctx.translate(mx, my)
      ctx.scale(k, k)
      ctx.translate(-mx, -my)
      addBody(ctx, pic(g))
      ctx.restore()
    }
    fill(ctx, grey ? BELT.stop : BELT.ghost)
  }
  ctx.beginPath()
  for (const g of cells) if (!g.grey && g.age >= POP * 0.5) addMarks(ctx, pic(g), g.in, g.out, t * 3, 0.02, 0.98, false, false)
  roundStroke(ctx, 0.065, C.white)
}

/** What lifting the stroke will do, shown at its end: into a machine's mouth, a zip onto a belt's side, a hump over a belt, a split from a belt's side, a curl rolling belt up, a stop, or feeding a belt's tail. */
export type EndSign = 'mouth' | 'zip' | 'hump' | 'split' | 'curl' | 'stop' | 'feed'
export const END_SIGNS: readonly EndSign[] = ['mouth', 'zip', 'hump', 'split', 'curl', 'stop', 'feed']

/** A teal arrow band from (x0, y0) to (x1, y1) in a sign's unit space, `w` wide, with its head at the end. */
function signArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, colour: string) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const tx = (x1 - x0) / len
  const ty = (y1 - y0) / len
  const hx = x1 - tx * 0.32
  const hy = y1 - ty * 0.32
  ctx.beginPath()
  addBand(ctx, x0, y0, hx + tx * 0.02, hy + ty * 0.02, w / 2)
  addRoundPoly(ctx, [hx + ty * w * 0.95, hy - tx * w * 0.95, x1, y1, hx - ty * w * 0.95, hy + tx * w * 0.95], 0.06)
  fill(ctx, colour)
}

/** An end sign as a round white sticker `size` cells across centred on the origin (the renderer floats it above the finger). */
export function drawEndSign(ctx: CanvasRenderingContext2D, sign: EndSign, size: number): void {
  const r = size / 2 - rim()
  dieCut(
    ctx,
    () => {
      ctx.beginPath()
      addCircle(ctx, 0, 0, r)
    },
    0.3,
  )
  ctx.save()
  ctx.scale(r, r)
  const w = 0.36
  switch (sign) {
    case 'mouth':
      // An arrow into a machine.
      ctx.beginPath()
      addRoundRect(ctx, 0.08, -0.5, 0.58, 1, 0.18)
      fill(ctx, BUILDING.workshop.body)
      ctx.beginPath()
      addRoundRect(ctx, 0.08, -0.22, 0.2, 0.44, 0.08)
      fill(ctx, BUILDING.workshop.fold)
      signArrow(ctx, -0.72, 0, 0.26, 0, w, BELT.body)
      break
    case 'zip':
      // A belt joining another's side, the zip on the seam.
      ctx.beginPath()
      addBand(ctx, 0.26, -0.72, 0.26, 0.72, w / 2)
      fill(ctx, BELT.body)
      signArrow(ctx, -0.72, 0, 0.1, 0, w, BELT.body)
      ctx.beginPath()
      for (let k = 0; k < 3; k++) addRoundRect(ctx, 0.02 + (k % 2) * 0.06, -0.15 + k * 0.11, 0.08, 0.08, 0.02)
      fill(ctx, C.white)
      break
    case 'hump':
      // A belt over a belt, its shadow on the one under it.
      ctx.beginPath()
      addBand(ctx, -0.72, 0, 0.72, 0, w / 2)
      fill(ctx, BELT.body)
      ctx.beginPath()
      addBand(ctx, 0.08, -0.62, 0.08, 0.7, w / 2)
      fill(ctx, C.shadow)
      signArrow(ctx, 0, 0.66, 0, -0.72, w, BELT.hump)
      ctx.beginPath()
      addBand(ctx, 0, -0.12, 0, 0.12, w / 2 - 0.06)
      fill(ctx, BELT.humpTop)
      // The bridge's white rails where it crosses, as on the board.
      ctx.beginPath()
      for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) addBand(ctx, x, -0.34, x, 0.34, 0.035)
      fill(ctx, C.white)
      break
    case 'split':
      // A belt splitting: straight on, and off to the side.
      signArrow(ctx, -0.72, -0.18, 0.72, -0.18, w, BELT.body)
      signArrow(ctx, -0.08, -0.18, -0.08, 0.72, w, BELT.body)
      break
    case 'curl':
      // A belt rolling up from its end.
      ctx.beginPath()
      addBand(ctx, -0.72, 0.22, 0.12, 0.22, w / 2)
      fill(ctx, BELT.body)
      ctx.beginPath()
      addCircle(ctx, 0.32, 0.02, 0.38)
      fill(ctx, BELT.body)
      ctx.beginPath()
      ctx.moveTo(0.32, 0.02)
      for (let k = 1; k <= 14; k++) {
        const a = k * 0.62
        const rr = 0.025 * k
        ctx.lineTo(0.32 + Math.cos(a) * rr, 0.02 + Math.sin(a) * rr)
      }
      roundStroke(ctx, 0.07, C.white)
      break
    case 'stop':
      // A stop sign: a soft octagon with a white bar.
      ctx.beginPath()
      {
        const pts: number[] = []
        for (let k = 0; k < 8; k++) pts.push(Math.cos(((k + 0.5) * TAU) / 8) * 0.72, Math.sin(((k + 0.5) * TAU) / 8) * 0.72)
        addRoundPoly(ctx, pts, 0.1)
      }
      fill(ctx, BELT.stopSign)
      ctx.beginPath()
      addRoundRect(ctx, -0.42, -0.11, 0.84, 0.22, 0.08)
      fill(ctx, C.white)
      break
    case 'feed':
      // A new belt feeding the tail of one already there: one arrow from two.
      ctx.beginPath()
      addBand(ctx, -0.72, 0, -0.06, 0, w / 2)
      fill(ctx, BELT.hump)
      signArrow(ctx, 0.0, 0, 0.72, 0, w, BELT.body)
      ctx.beginPath()
      ctx.moveTo(-0.2, -0.1)
      ctx.lineTo(-0.1, 0)
      ctx.lineTo(-0.2, 0.1)
      roundStroke(ctx, 0.07, C.white)
      break
  }
  ctx.restore()
}

/** Dots along the hint's path this far apart, this big, marching toward its end at this speed (cells a second). */
const HINT_GAP = 0.25
const HINT_DOT = 0.065
const HINT_SPEED = 0.5

/**
 * The hint's dotted path through the middles of `cells`, white dots with a teal shadow
 * marching toward its end, and a chevron at its end pointing on; `reach` of it (0 to 1 of its
 * length): the hint's hand leaves it behind its fingertip as it traces, the chevron riding
 * just ahead of the dots.
 */
export function drawHintPath(ctx: CanvasRenderingContext2D, cells: readonly number[], t: number, reach: number): void {
  if (cells.length === 0) throw new Error('the hint path has no cells')
  const whole = cells.map((c) => [xOf(c) + 0.5, yOf(c) + 0.5] as const)
  const end = Math.min(1, Math.max(0, reach)) * whole.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - whole[k]![0], p[1] - whole[k]![1]), 0)
  // The points it reaches, the last one cut short where its reach ends.
  const pts: (readonly [number, number])[] = [whole[0]!]
  let total = 0
  for (let k = 1; k < whole.length && total < end; k++) {
    const a = whole[k - 1]!
    const b = whole[k]!
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l === 0) continue
    const u = Math.min(1, (end - total) / l)
    pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
    total += l * u
  }
  const add = (dx: number, dy: number) => {
    ctx.beginPath()
    let seg = 0
    let walked = 0
    // The first dot rides in from the start and the last stops short of the end chevron.
    for (let d = loop(t, HINT_GAP / HINT_SPEED, 0) * HINT_GAP; d <= total - 0.18; d += HINT_GAP) {
      while (seg < pts.length - 2 && d > walked + Math.hypot(pts[seg + 1]![0] - pts[seg]![0], pts[seg + 1]![1] - pts[seg]![1])) {
        walked += Math.hypot(pts[seg + 1]![0] - pts[seg]![0], pts[seg + 1]![1] - pts[seg]![1])
        seg++
      }
      const a = pts[seg]!
      const b = pts[Math.min(seg + 1, pts.length - 1)]!
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      const u = l === 0 ? 0 : (d - walked) / l
      // Dots grow in from the start and shrink into the end, so the march has no pop.
      const k = smooth(0, 0.2, d) * (1 - smooth(total - 0.4, total - 0.18, d) * 0.5)
      addCircle(ctx, a[0] + (b[0] - a[0]) * u + dx, a[1] + (b[1] - a[1]) * u + dy, HINT_DOT * k)
    }
    if (pts.length > 1) {
      const a = pts[pts.length - 2]!
      const b = pts[pts.length - 1]!
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      const tx = (b[0] - a[0]) / l
      const ty = (b[1] - a[1]) / l
      ctx.moveTo(b[0] - tx * 0.12 + ty * 0.11 + dx, b[1] - ty * 0.12 - tx * 0.11 + dy)
      ctx.lineTo(b[0] + tx * 0.02 + dx, b[1] + ty * 0.02 + dy)
      ctx.lineTo(b[0] - tx * 0.12 - ty * 0.11 + dx, b[1] - ty * 0.12 + tx * 0.11 + dy)
    } else {
      addCircle(ctx, pts[0]![0] + dx, pts[0]![1] + dy, HINT_DOT * 1.4)
    }
  }
  add(pen.shadowX * 0.6, pen.shadowY * 0.6)
  ctx.fillStyle = C.hintShadow
  ctx.fill()
  roundStroke(ctx, 0.07, C.hintShadow)
  add(0, 0)
  ctx.fillStyle = C.hint
  ctx.fill()
  roundStroke(ctx, 0.07, C.hint)
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A row of straight cells across from (x, y) eastward, n long, every cell pointing east; the first a start and the last an end. */
function run(x: number, y: number, n: number, pattern: number): BeltPic[] {
  return Array.from({ length: n }, (_, k) => ({ cell: cellOf(x + k, y), in: 2, out: 0, fork: -1, over: -1, joins: [], pattern, start: k === 0, end: k === n - 1 }) as BeltPic)
}
const P = (cell: number, i: Dir, o: Dir, patch: Partial<BeltPic>): BeltPic => ({ cell, in: i, out: o, fork: -1, over: -1, joins: [], pattern: 0, start: false, end: false, ...patch })

/** A little layout on the sheet: a loop of bends, a fork with its paddle, a join with its zip, a bridge, caps at both ends. */
function layout(): BeltPic[] {
  return [
    // A loop of four bends and four straights round (1..3, 1..3).
    P(cellOf(1, 1), 1, 0, {}),
    P(cellOf(2, 1), 2, 0, {}),
    P(cellOf(3, 1), 2, 1, {}),
    P(cellOf(3, 2), 3, 1, {}),
    P(cellOf(3, 3), 3, 2, {}),
    P(cellOf(2, 3), 0, 2, {}),
    P(cellOf(1, 3), 0, 3, {}),
    P(cellOf(1, 2), 1, 3, {}),
    // A run from (5, 1) east with a fork down at (6, 1), the branch ending on nothing.
    P(cellOf(5, 1), 2, 0, { start: true }),
    P(cellOf(6, 1), 2, 0, { fork: 1 }),
    P(cellOf(7, 1), 2, 0, {}),
    P(cellOf(8, 1), 2, 0, { end: true }),
    P(cellOf(6, 2), 3, 1, { end: true }),
    // A run from (5, 4) east crossed by a bridge at (7, 4) going north, and a belt joining its side at (9, 4) from the south.
    P(cellOf(5, 4), 2, 0, { start: true }),
    P(cellOf(6, 4), 2, 0, {}),
    P(cellOf(7, 4), 2, 0, { over: 3 }),
    P(cellOf(8, 4), 2, 0, {}),
    P(cellOf(9, 4), 2, 0, { joins: [1] }),
    P(cellOf(10, 4), 2, 0, { end: true }),
    P(cellOf(7, 5), 1, 3, { start: true }),
    P(cellOf(7, 3), 1, 3, { end: true }),
    P(cellOf(9, 5), 1, 3, { start: true }),
  ]
}

/** ?sheet=beltart: belts as at land 3 (open it with &px=50 or &px=80): a layout moving and jammed, every pattern straight and round a bend, the pop and the curl, hedges, the stroke ghost, the end signs and the hint's path. */
export const SHEET = (): SheetEntry[] => {
  const lay = layout()
  const fork = lay.find((p) => p.fork !== -1)!
  const join = lay.find((p) => p.joins.length > 0)!
  const marks = (t: number, jam: boolean) => lay.map((pic) => ({ pic, hops: jam ? 7 : t * 3 }))
  /** Every thing riding the lower run, one a slot, gliding east at the belts' speed. */
  const riding = (ctx: CanvasRenderingContext2D, t: number) => {
    for (let k = 0; k < THINGS.length; k++) {
      const x = 5.25 + ((k * 0.5 + t * 1.5) % 5.5)
      ctx.save()
      ctx.translate(x, 4.5)
      drawThing(ctx, THINGS[k]!, ON_BELT, t, k)
      ctx.restore()
    }
  }
  const box = { x: 0.5, y: 0.5, w: 11, h: 5.5 }
  const out: SheetEntry[] = [
    {
      label: 'layout moving',
      box,
      draw: (ctx, t) => {
        drawBelts(ctx, lay)
        drawBeltMarks(ctx, marks(t, false))
        riding(ctx, t)
        drawBridges(ctx, marks(t, false))
        drawPaddle(ctx, fork, arch(loop(t, 2, 0)))
        drawZip(ctx, join, join.joins[0]!, t * 1.5)
      },
    },
    {
      label: 'layout jammed',
      box,
      draw: (ctx) => {
        drawBelts(ctx, lay)
        drawBeltMarks(ctx, marks(0, true))
        drawBridges(ctx, marks(0, true))
        drawPaddle(ctx, fork, 1)
        drawZip(ctx, join, join.joins[0]!, 3)
      },
    },
  ]
  // Every pattern on a straight run and round a bend.
  PATTERNS.forEach((name, k) => {
    out.push({
      label: `pattern ${name}`,
      box: { x: 0.8, y: 0.8, w: 3.4, h: 2.4 },
      draw: (ctx, t) => {
        const pics = [...run(1, 1, 2, k), P(cellOf(3, 1), 2, 1, { pattern: k }), P(cellOf(3, 2), 3, 1, { pattern: k, end: true })]
        pics[1] = { ...pics[1]!, end: false }
        drawBelts(ctx, pics)
        drawBeltMarks(
          ctx,
          pics.map((pic) => ({ pic, hops: t * 3 })),
        )
      },
    })
  })
  out.push(
    {
      label: 'pop and curl',
      box: { x: 0.8, y: 0.8, w: 4.4, h: 1.4 },
      draw: (ctx, t) => {
        drawBeltPop(ctx, P(cellOf(1, 1), 2, 0, { start: true }), loop(t, 1.2, 0) * 1.2 - 0.2)
        drawBeltPop(ctx, P(cellOf(2, 1), 2, 0, { pattern: 3 }), loop(t, 1.2, 0) * 1.2 - 0.35)
        drawBeltCurl(ctx, P(cellOf(4, 1), 2, 0, { pattern: 1 }), loop(t, 1.2, 0) * 0.6)
      },
    },
    {
      label: 'hedges and stumps',
      box: { x: 0.8, y: 0.8, w: 6.4, h: 3.4 },
      draw: (ctx, t) => {
        const hedge = new Uint8Array(240)
        for (const c of [cellOf(1, 1), cellOf(2, 1), cellOf(3, 1), cellOf(3, 2), cellOf(3, 3), cellOf(5, 1), cellOf(6, 3)]) hedge[c] = 1
        hedge[cellOf(4, 1)] = 2
        hedge[cellOf(5, 3)] = 2
        const pics: HedgePic[] = []
        hedge.forEach((h, c) => {
          if (h !== 0) pics.push({ cell: c, stump: h === 2, links: h === 1 ? hedgeLinks(hedge, c) : 0, bites: c === cellOf(6, 3) ? Math.floor(loop(t, 4, 0) * 4) : 0, sprout: c === cellOf(5, 3) ? loop(t, 3, 0) : 0 })
        })
        drawHedges(ctx, pics)
      },
    },
    {
      label: 'stroke ghost',
      box: { x: 0.8, y: 0.8, w: 6.4, h: 2.4 },
      draw: (ctx, t) => {
        const cells: GhostCell[] = [
          { cell: cellOf(1, 1), in: 2, out: 0, age: 1, grey: false },
          { cell: cellOf(2, 1), in: 2, out: 0, age: 1, grey: false },
          { cell: cellOf(3, 1), in: 2, out: 1, age: 1, grey: false },
          { cell: cellOf(3, 2), in: 3, out: 0, age: loop(t, 1, 0) * 0.5, grey: false },
          { cell: cellOf(4, 2), in: 2, out: 0, age: 1, grey: true },
          { cell: cellOf(5, 2), in: 2, out: 0, age: 1, grey: true },
        ]
        drawStrokeGhost(ctx, cells, t)
      },
    },
    ...END_SIGNS.map(
      (sign): SheetEntry => ({
        label: `sign ${sign}`,
        box: { x: -0.55, y: -0.55, w: 1.2, h: 1.2 },
        draw: (ctx) => drawEndSign(ctx, sign, 0.96),
      }),
    ),
    {
      label: 'hint path',
      box: { x: 0.8, y: 0.8, w: 5.4, h: 3.4 },
      draw: (ctx, t) => drawHintPath(ctx, [cellOf(1, 1), cellOf(2, 1), cellOf(3, 1), cellOf(3, 2), cellOf(3, 3), cellOf(4, 3), cellOf(5, 3)], t, 1),
    },
  )
  return out
}
