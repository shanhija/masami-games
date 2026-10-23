import { BURROWS, FLOWER_OF, GROUND, PONDS, cellOf, inCorner, xOf, yOf, type PondSite } from '../game/board'
import { HEAP_HINT, PAWS_FOR, STAGE_AT, WARN } from '../game/catalog'
import { COLS, ROWS, STEP, THINGS, type Counts, type Thing } from '../game/model'
import { heapPoint, type Box } from '../game/where'
import { WAVE, drawMuncher, type MuncherPicture } from './critters'
import {
  C,
  LAND,
  MUNCHER,
  THING,
  TAU,
  addCircle,
  addRoundPoly,
  addRoundRect,
  arch,
  circlesPath,
  dieCut,
  dieCutRim,
  drawNightcap,
  fill,
  heartPath,
  heldAge,
  loop,
  mix,
  phaseOf,
  roundStroke,
  scaled,
  smooth,
  tipped,
  zees,
  type SheetEntry,
} from './look'
import { drawStillThing } from './things'

/**
 * The land and what lives on it. The print layer the renderer bakes over the cells in view:
 * the sea-mist table past the board's own edge, the mint ground with a small dot at each cell
 * corner (or full cell outlines, for under a ghost or a stroke), the flowers' faint lavender
 * tint and their five-petal marks, the ponds, the trees and the patch rocks (small rimmed
 * stickers set into the print: they answer a touch). Then what the renderer draws live: one
 * cell of the print again for a tap (a tree shaking and dropping a leaf, flowers swaying, rocks
 * jiggling for a dig), the burrows in every stage of hunger, their heaps and paw prints, and
 * Beep's basket.
 *
 * The land is flat print with no rim (look.ts rule 2). Burrows, heaps and the basket are
 * stickers, drawn at their own origin (look.ts rule 7). Every drawing is a function of plain
 * data and time.
 */

/** Seconds a tapped tree shakes, flowers sway and dug rocks jiggle, and a shaken tree's leaf takes to fall. */
const SHAKE_FOR = 0.7
const SWAY_FOR = 1
const JIGGLE_FOR = 0.45
const LEAF_FOR = 1.1
/** A tap on a sleeping burrow opens its door a crack for POKE_FOR, a burrow whose card was just found waves hello for HELLO_FOR (seconds). */
export const POKE_FOR = 1.8
export const HELLO_FOR = 4
/** A heap draws at most HEAP_DRAWN of its things. */
export const HEAP_DRAWN = 12

/** A number from 0 to 1 for two integers, the same every time: where a cell's flowers and rocks sit. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(b + 0x165667b1, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------------------
// The print, cell by cell

/** Where a cell's flowers may sit (cell-local), the corners first: a rock cell keeps to the corners so they peek out round its rocks. */
const FLOWER_SPOTS = [0.22, 0.24, 0.76, 0.22, 0.24, 0.78, 0.78, 0.76, 0.5, 0.5] as const

/** Cell c's flowers: two or three five-petal marks (two at the corners of a rock cell), swaying `age` seconds after a tap. */
function drawPetals(ctx: CanvasRenderingContext2D, c: number, age: number) {
  const a = heldAge(age)
  const rocky = GROUND[c] === 'blue' || GROUND[c] === 'gold'
  const n = rocky ? 2 : 2 + Math.floor(hash(c, 1) * 2)
  const first = Math.floor(hash(c, 2) * (rocky ? 4 : 5))
  const sway = 0.4 * (1 - smooth(0, SWAY_FOR, a))
  ctx.beginPath()
  const centres: number[] = []
  for (let k = 0; k < n; k++) {
    const spot = (first + k * (rocky ? 3 : 2)) % (rocky ? 4 : 5)
    const x = xOf(c) + FLOWER_SPOTS[2 * spot]! + (hash(c, 3 + k) - 0.5) * 0.08
    const y = yOf(c) + FLOWER_SPOTS[2 * spot + 1]! + (hash(c, 7 + k) - 0.5) * 0.08
    const turn = hash(c, 11 + k) * TAU + sway * Math.sin(a * 9 + k * 2)
    const dx = sway * 0.04 * Math.sin(a * 7 + k)
    for (let p = 0; p < 5; p++) addCircle(ctx, x + dx + Math.cos(turn + (p * TAU) / 5) * 0.062, y + Math.sin(turn + (p * TAU) / 5) * 0.062, 0.05)
    centres.push(x + dx, y)
  }
  fill(ctx, LAND.petal)
  ctx.beginPath()
  for (let k = 0; k < centres.length; k += 2) addCircle(ctx, centres[k]!, centres[k + 1]!, 0.036)
  fill(ctx, LAND.petalCentre)
}

/** Cell c's patch rocks: three small rimmed stickers (blue chunks, gold lumps) set into the print, hopping `age` seconds after a dig. */
function drawRocks(ctx: CanvasRenderingContext2D, c: number, age: number) {
  const a = heldAge(age)
  const blue = GROUND[c] === 'blue'
  const body = blue ? LAND.blueRock : LAND.goldRock
  const light = blue ? THING.blueRock.light : THING.goldRock.light
  for (const [k, sx, sy, r] of [
    [0, 0.3, 0.34, 0.15],
    [1, 0.7, 0.42, 0.13],
    [2, 0.42, 0.72, 0.13],
  ] as const) {
    const hop = 0.07 * Math.abs(Math.sin(a * 13 + k)) * (1 - smooth(0, JIGGLE_FOR, a))
    const outline = () => {
      ctx.beginPath()
      if (blue) {
        const pts: number[] = []
        for (let i = 0; i < 6; i++) {
          const ang = ((i + hash(c, 40 + k)) * TAU) / 6
          const rr = r * (0.82 + 0.22 * hash(c, 50 + 6 * k + i))
          pts.push(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.85)
        }
        addRoundPoly(ctx, pts, r * 0.3)
      } else {
        addCircle(ctx, -r * 0.25, r * 0.08, r * 0.72)
        addCircle(ctx, r * 0.32, -r * 0.02, r * 0.62)
        addCircle(ctx, 0, -r * 0.36, r * 0.48)
      }
    }
    ctx.save()
    ctx.translate(xOf(c) + sx + (hash(c, 20 + k) - 0.5) * 0.1, yOf(c) + sy + (hash(c, 30 + k) - 0.5) * 0.08)
    ctx.translate(0, -hop)
    dieCutRim(ctx, outline, 0, 0.03)
    outline()
    fill(ctx, body)
    ctx.save()
    outline()
    ctx.clip()
    ctx.beginPath()
    addCircle(ctx, -r * 0.45, -r * 0.5, r * 0.62)
    fill(ctx, light)
    ctx.restore()
    ctx.restore()
  }
}

/** Cell c's tree: a round leafy top on a short trunk, shaking from its foot `age` seconds after a tap and dropping a leaf. */
function drawTree(ctx: CanvasRenderingContext2D, c: number, age: number) {
  const a = heldAge(age)
  const shake = 0.11 * Math.sin(a * 24) * (1 - smooth(0, SHAKE_FOR, a))
  ctx.save()
  ctx.translate(xOf(c) + 0.5, yOf(c) + 0.5)
  ctx.save()
  ctx.translate(0, 0.4)
  ctx.rotate(shake)
  ctx.translate(0, -0.4)
  ctx.beginPath()
  addRoundRect(ctx, -0.065, 0.04, 0.13, 0.36, 0.05)
  fill(ctx, LAND.trunk)
  circlesPath(ctx, [0, -0.1, 0.29, -0.22, 0.02, 0.19, 0.22, 0.02, 0.19, -0.12, -0.26, 0.19, 0.13, -0.25, 0.2])
  fill(ctx, LAND.tree)
  circlesPath(ctx, [-0.11, -0.2, 0.12, 0.1, -0.08, 0.07])
  fill(ctx, LAND.treeLight)
  ctx.restore()
  if (a < LEAF_FOR) {
    // The leaf: off the right of the top, swinging down to the foot, gone as it lands.
    const u = a / LEAF_FOR
    const x = 0.2 + 0.16 * Math.sin(u * 7)
    const y = -0.04 + 0.42 * u
    const k = 1 - smooth(0.8, 1, u)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(0.6 * Math.sin(u * 7 + 1))
    ctx.beginPath()
    ctx.moveTo(-0.07 * k, 0)
    ctx.quadraticCurveTo(0, -0.05 * k, 0.07 * k, 0)
    ctx.quadraticCurveTo(0, 0.05 * k, -0.07 * k, 0)
    ctx.closePath()
    fill(ctx, LAND.tree)
    ctx.restore()
  }
  ctx.restore()
}

/** A pond: one rounded pool over its cells, two ripples on it. */
function drawPond(ctx: CanvasRenderingContext2D, p: PondSite) {
  const x0 = p.x
  const y0 = p.y
  const x1 = p.x + p.w
  const y1 = p.y + p.h
  ctx.beginPath()
  addRoundRect(ctx, x0 + 0.08, y0 + 0.08, x1 - x0 - 0.16, y1 - y0 - 0.16, 0.5)
  fill(ctx, LAND.pond)
  ctx.beginPath()
  ctx.arc(x0 + (x1 - x0) * 0.38, y0 + (y1 - y0) * 0.4, 0.22, Math.PI * 1.1, Math.PI * 1.6)
  ctx.moveTo(x0 + (x1 - x0) * 0.62 + 0.16 * Math.cos(Math.PI * 0.1), y0 + (y1 - y0) * 0.66 + 0.16 * Math.sin(Math.PI * 0.1))
  ctx.arc(x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.66, 0.16, Math.PI * 0.1, Math.PI * 0.6)
  roundStroke(ctx, 0.05, LAND.pondLight)
}

/** The cell corners' dots, or with `grid` the cells' outlines, for the cells within [x0, x1) x [y0, y1): only the corners and edges inside the board. */
function drawMarks(ctx: CanvasRenderingContext2D, grid: boolean, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath()
  if (grid) {
    for (let x = Math.max(x0, 1); x <= Math.min(x1, COLS - 1); x++) {
      ctx.moveTo(x, Math.max(y0, 0))
      ctx.lineTo(x, Math.min(y1, ROWS))
    }
    for (let y = Math.max(y0, 1); y <= Math.min(y1, ROWS - 1); y++) {
      ctx.moveTo(Math.max(x0, 0), y)
      ctx.lineTo(Math.min(x1, COLS), y)
    }
    ctx.lineWidth = 0.025
    ctx.strokeStyle = LAND.grid
    ctx.stroke()
    return
  }
  for (let y = Math.max(y0, 1); y <= Math.min(y1, ROWS - 1); y++) for (let x = Math.max(x0, 1); x <= Math.min(x1, COLS - 1); x++) addCircle(ctx, x, y, 0.032)
  fill(ctx, LAND.dot)
}

/** What grows on cell c, `age` seconds after a tap or a dig: its flowers, its rocks, its tree. */
function drawGrowth(ctx: CanvasRenderingContext2D, c: number, age: number) {
  if (FLOWER_OF[c]! >= 0) drawPetals(ctx, c, age)
  if (GROUND[c] === 'blue' || GROUND[c] === 'gold') drawRocks(ctx, c, age)
  if (GROUND[c] === 'tree') drawTree(ctx, c, age)
}

/**
 * The print layer for the renderer's bake over `area` (board cells): the table over all of
 * `area`, the board's edge, the ground of the board's cells in it, their corner dots (or with
 * `grid` their cell outlines), the flowers' tint, the ponds, and the flowers, rocks and trees
 * of only the cells `area` touches: never the whole 60 x 36 board.
 */
export function drawPrint(ctx: CanvasRenderingContext2D, grid: boolean, area: Box): void {
  const x0 = Math.max(0, Math.floor(area.x))
  const y0 = Math.max(0, Math.floor(area.y))
  const x1 = Math.min(COLS, Math.ceil(area.x + area.w))
  const y1 = Math.min(ROWS, Math.ceil(area.y + area.h))
  ctx.save()
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip()
  fill(ctx, LAND.table)
  // The board's edge: a flat band down and right of all of it, on the table.
  ctx.beginPath()
  addRoundRect(ctx, 0.09, 0.09, COLS, ROWS, 0.22)
  fill(ctx, LAND.tableEdge)
  ctx.beginPath()
  addRoundRect(ctx, 0, 0, COLS, ROWS, 0.22)
  fill(ctx, LAND.ground)
  // The flowers' tint, one shape over all their cells so it has no seams.
  ctx.beginPath()
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (FLOWER_OF[cellOf(x, y)]! >= 0) ctx.rect(x, y, 1, 1)
  fill(ctx, LAND.flowerTint)
  drawMarks(ctx, grid, x0, y0, x1, y1)
  for (const p of PONDS) if (p.x < x1 && p.x + p.w > x0 && p.y < y1 && p.y + p.h > y0) drawPond(ctx, p)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) drawGrowth(ctx, cellOf(x, y), Infinity)
  ctx.restore()
}

/**
 * One cell of the print again over the bake, for the moment after a tap or a dig: its ground
 * (or tint), its corner dots or outlines, a part of its pond, and its flowers swaying, its
 * rocks hopping or its tree shaking `age` seconds after it (Infinity: at rest).
 */
export function drawCellPrint(ctx: CanvasRenderingContext2D, grid: boolean, c: number, age: number): void {
  const x = xOf(c)
  const y = yOf(c)
  ctx.beginPath()
  ctx.rect(x, y, 1, 1)
  fill(ctx, FLOWER_OF[c]! >= 0 ? LAND.flowerTint : LAND.ground)
  drawMarks(ctx, grid, x, y, x + 1, y + 1)
  if (GROUND[c] === 'pond') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, 1, 1)
    ctx.clip()
    drawPond(ctx, PONDS.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)!)
    ctx.restore()
  }
  drawGrowth(ctx, c, age)
}

// ---------------------------------------------------------------------------------------
// Burrows

/** A burrow as its picture shows it, read off State.burrows and the visit. */
export interface BurrowPic {
  /** Which burrow (0 A to 5 F): the mark its munchers wear (a bow, freckles, a flower, a star, stripes, a diamond). */
  burrow: number
  /** 0 to 1000 (catalog.ts HUNGER_FULL): its stage shows on the mound (STAGE_AT). */
  hunger: number
  /** Seconds since its 5 s warning began (the mound wobbles), Infinity when it is not warning. */
  warnAge: number
  /** Its munchers are out: the door stands open on the lit, empty room. */
  out: boolean
  /** Its first picnic made it a friend: a heart flag on the mound. */
  friend: boolean
  /** Seconds since a tap on it (the door opens a crack and a sleepy face waves), and since its card was found (a face leans out and waves hello); Infinity for never. */
  pokeAge: number
  helloAge: number
}

/** The mound: a mossy dome on the footprint's bottom edge, its door at the middle of that edge. */
function moundPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(0.08, 1.9)
  ctx.bezierCurveTo(0.04, 1.05, 0.44, 0.52, 1, 0.52)
  ctx.bezierCurveTo(1.56, 0.52, 1.96, 1.05, 1.92, 1.9)
  ctx.closePath()
}
/** The doorway: a round arch on the ground, DOOR wide, its middle at x 1. */
const DOOR = { x0: 0.64, x1: 1.36, top: 1.18, base: 1.9 }
function doorPath(ctx: CanvasRenderingContext2D, inset: number) {
  const r = (DOOR.x1 - DOOR.x0) / 2 - inset
  ctx.beginPath()
  ctx.moveTo(1 - r, DOOR.base)
  ctx.lineTo(1 - r, DOOR.top + r + inset)
  ctx.arc(1, DOOR.top + r + inset, r, Math.PI, TAU)
  ctx.lineTo(1 + r, DOOR.base)
  ctx.closePath()
}
/** The door's round window, lit from inside. */
const WINDOW = { x: 1, y: 1.44, r: 0.15 }

/** The muncher in the doorway is the munchers' own picture (critters.ts) at this size, its feet on the door's sill, leaning out of the crack this far (radians) once it is out. */
const DOORWAY = 0.8
const LEAN = 0.32

/**
 * A burrow at its footprint's top-left corner (2 x 2 cells), at sim time t: the mossy mound
 * with its round wooden door and the door's window lit honey-gold inside, never dark. Its
 * hunger shows on it: a nightcap on and a snore (under STAGE_AT[0]), the nightcap slipping,
 * then the cap gone and the tips of a calyx over the window's sill, then the door open a crack
 * and a whole sleepy face leaning out, blinking and yawning; never eyes alone in the dark. The
 * warning wobbles the mound with the face awake; while its munchers are out the door stands
 * open on the lit room. A friend wears a heart flag. A tap peeks a sleepy face out with a wave;
 * a burrow whose card was just found waves hello.
 */
export function drawBurrow(ctx: CanvasRenderingContext2D, b: BurrowPic, t: number): void {
  const warnAge = heldAge(b.warnAge)
  const warning = !b.out && warnAge < WARN * STEP
  const hello = !b.out && !warning && heldAge(b.helloAge) < HELLO_FOR
  const pokeAge = heldAge(b.pokeAge)
  const stage = b.hunger >= STAGE_AT[2] ? 3 : b.hunger >= STAGE_AT[1] ? 2 : b.hunger >= STAGE_AT[0] ? 1 : 0
  const awake = b.out || warning || hello
  const poke = !awake && stage < 3 && pokeAge < POKE_FOR
  const phase = phaseOf(`burrow${b.burrow}`)
  // The door: 1 shut, a crack, or swung wide; a poke opens and closes it over its time.
  const crack = 0.5
  const panel = b.out ? 0.16 : warning || hello || stage === 3 ? crack : poke ? mix(1, crack, arch(pokeAge / POKE_FOR) ** 0.4) : 1
  const asleep = !awake && stage <= 1
  const breathe = asleep ? 0.013 * Math.sin(((t + phase * 2.6) * TAU) / 2.6) : 0
  const wobble = warning ? 0.06 * Math.sin(warnAge * TAU * 2.2) : 0
  const squash = warning ? 0.035 * Math.abs(Math.sin(warnAge * TAU * 2.2)) : 0
  ctx.save()
  ctx.translate(1, 1.9)
  tipped(ctx, wobble, 1, 1, () => {
    ctx.scale(1 + squash, 1 + breathe - squash)
    ctx.translate(-1, -1.9)
    dieCut(ctx, () => moundPath(ctx), 0)
    moundPath(ctx)
    fill(ctx, LAND.mound)
    ctx.save()
    moundPath(ctx)
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(0.56, 1.02, 0.26, 0.14, -0.5, 0, TAU)
    ctx.moveTo(1.68, 1.32)
    ctx.ellipse(1.5, 1.32, 0.18, 0.1, 0.4, 0, TAU)
    ctx.moveTo(1.07, 0.72)
    ctx.ellipse(0.92, 0.72, 0.15, 0.07, -0.2, 0, TAU)
    fill(ctx, LAND.moundLight)
    ctx.restore()
    // The doorway, lit warm inside.
    doorPath(ctx, 0)
    fill(ctx, LAND.door)
    ctx.beginPath()
    ctx.ellipse(1, DOOR.base - 0.05, 0.3, 0.07, 0, 0, TAU)
    fill(ctx, LAND.doorDeep)
    // The door, swung toward us on its left hinge as far as `panel` shows it.
    ctx.save()
    ctx.translate(DOOR.x0, 0)
    ctx.scale(panel, 1)
    ctx.translate(-DOOR.x0, 0)
    doorPath(ctx, 0.035)
    fill(ctx, LAND.doorWood)
    ctx.beginPath()
    addCircle(ctx, WINDOW.x, WINDOW.y, WINDOW.r)
    fill(ctx, LAND.door)
    if (stage === 2 && !awake && !poke) {
      // The tips of a calyx over the window's sill, bobbing as someone inside stirs.
      const bob = 0.03 * Math.sin(((t + phase) * TAU) / 2.2)
      ctx.save()
      ctx.beginPath()
      addCircle(ctx, WINDOW.x, WINDOW.y, WINDOW.r)
      ctx.clip()
      ctx.beginPath()
      for (const [dx, h] of [
        [-0.07, 0.09],
        [0, 0.12],
        [0.07, 0.09],
      ] as const) {
        const sill = WINDOW.y + WINDOW.r
        ctx.moveTo(WINDOW.x + dx - 0.04, sill + 0.02)
        ctx.quadraticCurveTo(WINDOW.x + dx - 0.03, sill - h + bob, WINDOW.x + dx, sill - h - 0.05 + bob)
        ctx.quadraticCurveTo(WINDOW.x + dx + 0.03, sill - h + bob, WINDOW.x + dx + 0.04, sill + 0.02)
        ctx.closePath()
      }
      fill(ctx, MUNCHER.calyx)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.rect(WINDOW.x - 0.012, WINDOW.y - WINDOW.r, 0.024, WINDOW.r * 2)
    ctx.rect(WINDOW.x - WINDOW.r, WINDOW.y - 0.012, WINDOW.r * 2, 0.024)
    addCircle(ctx, 1.2, 1.68, 0.035)
    fill(ctx, LAND.doorDeep)
    ctx.restore()
    // A muncher in the crack, leaning out from behind the door: sleepy and yawning from 900, bouncing awake in the warning, waving for a poke or hello. Only what is out of the crack shows.
    if (!b.out && (warning || hello || poke || stage === 3)) {
      const gap = DOOR.x0 + (DOOR.x1 - DOOR.x0) * panel
      const out = poke ? arch(pokeAge / POKE_FOR) ** 0.4 : 1
      const pic: MuncherPicture = {
        burrow: b.burrow,
        mode: warning ? 'out' : 'peek',
        why: null,
        age: t + 4 * phase,
        cheeks: [],
        nom: Infinity,
        shrug: Infinity,
        wave: hello ? heldAge(b.helloAge) % WAVE : poke ? pokeAge : Infinity,
        rise: 1,
        lift: warning ? 0.04 * Math.abs(Math.sin(warnAge * TAU * 2.2)) : 0,
        step: 0,
        facing: 1,
        phase,
        scout: false,
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(gap, 0, 2 - gap, DOOR.base + 0.1)
      ctx.clip()
      ctx.translate(mix(gap - 0.35, gap + 0.1, out), DOOR.base)
      tipped(ctx, LEAN * out, 1, 1, () => scaled(ctx, DOORWAY, () => drawMuncher(ctx, pic, t)))
      ctx.restore()
    }
    // The nightcap: on, or slipping; it has fallen off once the calyx shows. The snore rises from it.
    if (asleep) {
      const k = stage === 1 ? smooth(STAGE_AT[0], STAGE_AT[1], b.hunger) : 0
      drawNightcap(ctx, 1 + 0.3 * k, 0.6 + 0.14 * k, 0.3, 0.85 * k)
      zees(ctx, 1.36 + 0.24 * k, 0.5, t, phase)
    }
    if (b.friend) {
      // A heart flag on the mound's shoulder, fluttering.
      const flutter = 0.025 * Math.sin(((t + phase) * TAU) / 1.4)
      const flag = () => {
        ctx.beginPath()
        addRoundRect(ctx, 1.49, 0.24, 0.04, 0.52, 0.02)
        addRoundPoly(ctx, [1.53, 0.24, 1.86, 0.33 + flutter, 1.53, 0.46], 0.03)
      }
      dieCutRim(ctx, flag, 0, 0.025)
      ctx.beginPath()
      addRoundRect(ctx, 1.49, 0.24, 0.04, 0.52, 0.02)
      fill(ctx, LAND.trunk)
      ctx.beginPath()
      addRoundPoly(ctx, [1.53, 0.24, 1.86, 0.33 + flutter, 1.53, 0.46], 0.03)
      fill(ctx, MUNCHER.flag)
      heartPath(ctx, 1.64, 0.35 + flutter * 0.4, 0.12)
      fill(ctx, C.heart)
    }
  })
  ctx.restore()
}

/** Where a heap's things sit round its point, bottom row first: the heap grows up. */
const HEAP_SPOTS = [-0.1, -0.12, 0.16, -0.12, -0.36, -0.11, 0.42, -0.11, 0.03, -0.3, -0.23, -0.29, 0.29, -0.29, -0.1, -0.47, 0.16, -0.47, -0.36, -0.28, 0.03, -0.63, 0.42, -0.28] as const

/** A burrow's heap at its point (where.ts heapPoint, on the ground): up to HEAP_DRAWN of what its munchers carried home, bottom row first, and a little flag on top from HEAP_HINT things, fluttering at sim time t. */
export function drawHeap(ctx: CanvasRenderingContext2D, heap: Counts, t: number): void {
  const things: Thing[] = []
  THINGS.forEach((thing, i) => {
    for (let k = 0; k < heap[i]! && things.length < HEAP_DRAWN; k++) things.push(thing)
  })
  const total = heap.reduce((a, b) => a + b, 0)
  // Back to front: the top of the heap first, so the bottom row sits in front of it.
  for (let k = things.length - 1; k >= 0; k--) {
    ctx.save()
    ctx.translate(HEAP_SPOTS[2 * k]!, HEAP_SPOTS[2 * k + 1]!)
    drawStillThing(ctx, things[k]!, 0.3, t, k)
    ctx.restore()
  }
  if (total >= HEAP_HINT) {
    const top = Math.min(...things.map((_, k) => HEAP_SPOTS[2 * k + 1]!)) - 0.12
    const flutter = 0.02 * Math.sin(t * 4.5)
    const flag = () => {
      ctx.beginPath()
      addRoundRect(ctx, 0.01, top - 0.42, 0.035, 0.44, 0.017)
      addRoundPoly(ctx, [0.045, top - 0.42, 0.3, top - 0.34 + flutter, 0.045, top - 0.25], 0.025)
    }
    dieCutRim(ctx, flag, 0, 0.025)
    ctx.beginPath()
    addRoundRect(ctx, 0.01, top - 0.42, 0.035, 0.44, 0.017)
    fill(ctx, LAND.trunk)
    ctx.beginPath()
    addRoundPoly(ctx, [0.045, top - 0.42, 0.3, top - 0.34 + flutter, 0.045, top - 0.25], 0.025)
    fill(ctx, MUNCHER.flag)
  }
}

/** Paw prints along `cells` (a burrow's way to its munchers' first targets), `age` seconds after the tap: they walk out from the first cell over the first 1.4 s, stay, and shrink away at the end of PAWS_FOR. */
export function drawPaws(ctx: CanvasRenderingContext2D, cells: readonly number[], age: number): void {
  const a = heldAge(age)
  const total = PAWS_FOR * STEP
  if (a >= total || cells.length < 2) return
  const n = (cells.length - 1) * 2
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const from = cells[i >> 1]!
    const to = cells[(i >> 1) + 1]!
    const dx = xOf(to) - xOf(from)
    const dy = yOf(to) - yOf(from)
    const len = Math.hypot(dx, dy)
    const tx = dx / len
    const ty = dy / len
    const u = (i % 2) * 0.5 + 0.25
    const side = i % 2 === 0 ? -1 : 1
    const x = xOf(from) + 0.5 + dx * u - ty * side * 0.11
    const y = yOf(from) + 0.5 + dy * u + tx * side * 0.11
    const at = (1.4 * i) / n
    const k = smooth(at, at + 0.15, a) * (1 - smooth(total - 0.5, total, a))
    if (k <= 0) continue
    // The pad behind, three toes ahead.
    ctx.moveTo(x + 0.06 * k, y)
    ctx.ellipse(x, y, 0.065 * k, 0.055 * k, Math.atan2(ty, tx), 0, TAU)
    for (const toe of [-0.6, 0, 0.6]) {
      const ox = x + (tx * Math.cos(toe) - ty * Math.sin(toe)) * 0.1 * k
      const oy = y + (ty * Math.cos(toe) + tx * Math.sin(toe)) * 0.1 * k
      addCircle(ctx, ox, oy, 0.026 * k)
    }
  }
  fill(ctx, MUNCHER.paw)
}

/** Where the basket shows what it holds, peeking over its rim, back row first. */
const BASKET_SPOTS = [-0.13, -0.26, 0.13, -0.26, -0.24, -0.1, 0.24, -0.1, 0, -0.12] as const

/** Beep's basket at its cell's middle (where.ts basketPoint): a woven sticker with up to five of what it holds peeking over its rim. */
export function drawBasket(ctx: CanvasRenderingContext2D, basket: Counts): void {
  const things: Thing[] = []
  THINGS.forEach((thing, i) => {
    for (let k = 0; k < basket[i]! && things.length < BASKET_SPOTS.length / 2; k++) things.push(thing)
  })
  things.forEach((thing, k) => {
    ctx.save()
    ctx.translate(BASKET_SPOTS[2 * k]!, BASKET_SPOTS[2 * k + 1]!)
    drawStillThing(ctx, thing, 0.3, 0, k)
    ctx.restore()
  })
  const body = () => {
    ctx.beginPath()
    addRoundPoly(ctx, [-0.4, -0.08, 0.4, -0.08, 0.3, 0.38, -0.3, 0.38], 0.08)
    addCircle(ctx, -0.42, 0.02, 0.07)
    addCircle(ctx, 0.42, 0.02, 0.07)
  }
  dieCut(ctx, body, 0)
  body()
  fill(ctx, LAND.basket)
  // The weave: two bands round it and the rim along its top, in the darker straw.
  ctx.save()
  body()
  ctx.clip()
  ctx.beginPath()
  ctx.rect(-0.5, 0.08, 1, 0.05)
  ctx.rect(-0.5, 0.22, 1, 0.05)
  for (let k = 0; k < 5; k++) ctx.rect(-0.26 + k * 0.13 - 0.018, 0.0, 0.036, 0.38)
  fill(ctx, LAND.basketDark)
  ctx.restore()
  ctx.beginPath()
  addRoundRect(ctx, -0.44, -0.12, 0.88, 0.1, 0.05)
  fill(ctx, LAND.basketDark)
}

// ---------------------------------------------------------------------------------------
// The sheet

/** The start block with its table round it. */
const CORNER_BOX: Box = { x: -0.4, y: -0.4, w: 20.8, h: 12.8 }
/** A burrow's own box on the sheet, its heap at where.ts's heap point relative to it. */
const HEAP_AT = { x: heapPoint(0).x - BURROWS[0]!.x, y: heapPoint(0).y - BURROWS[0]!.y }

/** ?sheet=land: the print of the start block and of the far burrows and ponds (open it with &px=50 or &px=80), its grid, a tapped tree, flowers and a dug patch, every stage of a burrow with its heap, heaps of every size, paw prints and the basket. */
export const SHEET = (): SheetEntry[] => {
  const burrow = (label: string, b: Partial<BurrowPic>, heap: number): SheetEntry => ({
    label,
    box: { x: -0.7, y: -0.1, w: 2.9, h: 2.2 },
    draw: (ctx, t) => {
      drawBurrow(ctx, { burrow: 0, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: Infinity, ...b }, t)
      const counts = THINGS.map((_, i) => (i === 3 ? Math.ceil(heap / 2) : i === 6 ? Math.floor(heap / 2) : 0))
      ctx.save()
      ctx.translate(HEAP_AT.x, HEAP_AT.y)
      drawHeap(ctx, counts, t)
      ctx.restore()
    },
  })
  const tree = GROUND.findIndex((g, c) => g === 'tree' && inCorner(xOf(c), yOf(c)))
  const flower = FLOWER_OF.findIndex((f, c) => f >= 0 && GROUND[c] === 'grass' && inCorner(xOf(c), yOf(c)))
  const patch = GROUND.findIndex((g, c) => g === 'blue' && inCorner(xOf(c), yOf(c)))
  const around = (i: number, w: number, h: number): Box => ({ x: BURROWS[i]!.x - (w - 2) / 2, y: BURROWS[i]!.y - 2, w, h })
  const near = (c: number): Box => ({ x: xOf(c) - 1, y: yOf(c) - 1, w: 3, h: 3 })
  return [
    { label: 'the start block', box: CORNER_BOX, draw: (ctx) => drawPrint(ctx, false, CORNER_BOX) },
    { label: 'the start block, grid', box: CORNER_BOX, draw: (ctx) => drawPrint(ctx, true, CORNER_BOX) },
    ...([3, 4, 5] as const).map((i): SheetEntry => ({ label: `burrow ${'ABCDEF'[i]}'s land`, box: around(i, 12, 9), draw: (ctx) => drawPrint(ctx, false, around(i, 12, 9)) })),
    ...PONDS.slice(1).map((p, i): SheetEntry => ({ label: `pond ${i + 2}`, box: { x: p.x - 3, y: p.y - 2, w: p.w + 6, h: p.h + 4 }, draw: (ctx) => drawPrint(ctx, false, { x: p.x - 3, y: p.y - 2, w: p.w + 6, h: p.h + 4 }) })),
    {
      label: 'tree tapped',
      box: near(tree),
      draw: (ctx, t) => {
        drawPrint(ctx, false, near(tree))
        drawCellPrint(ctx, false, tree, loop(t, 2, 0) * 2)
      },
    },
    {
      label: 'flowers tapped',
      box: near(flower),
      draw: (ctx, t) => {
        drawPrint(ctx, false, near(flower))
        drawCellPrint(ctx, false, flower, loop(t, 2, 0) * 2)
      },
    },
    {
      label: 'rocks dug',
      box: near(patch),
      draw: (ctx, t) => {
        drawPrint(ctx, false, near(patch))
        drawCellPrint(ctx, false, patch, loop(t, 1.2, 0) * 1.2)
      },
    },
    burrow('burrow asleep', { hunger: 100 }, 0),
    burrow('burrow cap slipping', { hunger: 600 }, 2),
    burrow('burrow calyx tips', { hunger: 800 }, 4),
    burrow('burrow face', { hunger: 950, burrow: 1 }, 6),
    burrow('burrow warning', { hunger: 1000, warnAge: 1.3, burrow: 2 }, 9),
    burrow('burrow out', { out: true }, 12),
    burrow('burrow friend', { hunger: 200, friend: true }, 0),
    burrow('burrow poked', { hunger: 100, pokeAge: 0.6 }, 0),
    burrow('burrow hello', { helloAge: 1.2, burrow: 1 }, 0),
    ...[1, 3, 6, 9, 12, 20].map(
      (n): SheetEntry => ({
        label: `heap ${n}`,
        box: { x: -0.65, y: -1.25, w: 1.3, h: 1.35 },
        draw: (ctx, t) => drawHeap(ctx, THINGS.map((_, i) => Math.floor((n + i) / THINGS.length)), t),
      }),
    ),
    {
      label: 'paw prints',
      box: { x: 0.6, y: 0.6, w: 5.8, h: 3.8 },
      draw: (ctx, t) => drawPaws(ctx, [cellOf(1, 1), cellOf(2, 1), cellOf(3, 1), cellOf(3, 2), cellOf(4, 2), cellOf(5, 2), cellOf(5, 3)], loop(t, PAWS_FOR * STEP + 0.6, 0) * (PAWS_FOR * STEP + 0.6)),
    },
    ...[0, 2, 5].map(
      (n): SheetEntry => ({
        label: `basket ${n}`,
        box: { x: -0.6, y: -0.55, w: 1.2, h: 1.05 },
        draw: (ctx) => drawBasket(ctx, THINGS.map((_, i) => (i < n ? 1 : 0))),
      }),
    ),
  ]
}
