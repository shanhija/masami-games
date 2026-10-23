import { THINGS, type Thing } from '../game/model'
import { C, GLASS, RIM, THING, TAU, addCircle, addRoundPoly, addRoundRect, addStar, detail, dieCutRim, fill, loop, phaseOf, roundStroke, scaled, shine, type SheetEntry } from './look'

/**
 * One picture per thing, the same everywhere (look.ts rule 9): on a belt, in Beep's arms, in
 * a cheek, on a heap, in the basket, on the tray and the cards. Raw things are dull lumps (a
 * slate-blue faceted rock, a round lumpy gold nugget with specks, an opaque pearl), made
 * things bright and smooth (a blue bar, a gold bar, a lilac cog with six chunky teeth, a round
 * flask of green fizz, a tall flask of orange fizz under a gold star cork), so she sees what a
 * machine did. Each is a die-cut sticker centred on its origin, `size` cells across with its
 * rim. Designed at 22 px first: under 30 px a thing is its silhouette, its key colour, one
 * highlight and the rim; from 30 px a darker fold joins, always a detail (the rock's facet, the
 * bar's stamp, the gear's hub, the pearl's edge, the fizz's surface) and never a shade along
 * the bottom, which is Pia Jump's; from 40 px the finer marks (the nugget's specks, the fizz's
 * bubbles) and the recipe inside each bottle (blue and gold swirling into green, the gear in a
 * bubble).
 *
 * Each picture is drawn in its own unit space, its outline inside the unit circle, scaled to
 * the size less the rim; the rim and the shadow stay in cells, so every thing on the board
 * casts the same shadow as every other sticker.
 */

/** How big a thing rides a belt, in cells: about 22 px at land 3's 50 px cells, so two in a cell sit nose to tail on the belt's body (beltart.ts BODY). */
export const ON_BELT = 0.46

/** A thing's rim: the stickers' RIM, thinner on a thing smaller than about 0.6 cell so its picture keeps its room. */
const rimOf = (size: number) => Math.min(RIM, 0.1 * size)

/** The blue rock's faceted chunk, clockwise; its lit top facet and its dark lower right facet (clipped to the chunk). */
const ROCK = [-0.96, 0.5, -0.86, -0.18, -0.36, -0.8, 0.3, -0.92, 0.88, -0.42, 0.98, 0.3, 0.6, 0.82, -0.5, 0.86] as const
const ROCK_TOP = [-0.86, -0.18, -0.36, -0.8, 0.3, -0.92, 0.88, -0.42, 0.26, -0.12, -0.5, 0.02] as const
const ROCK_FOLD = [0.26, -0.12, 0.88, -0.42, 0.98, 0.3, 0.6, 0.82, 0.1, 0.6] as const
/** The gold nugget's lumps (x, y, r): a potato of two big lumps with smaller ones on it. Its specks: the M ones, then the L ones. */
const NUGGET = [-0.28, 0.08, 0.64, 0.3, 0.02, 0.62, -0.08, -0.5, 0.42, 0.52, -0.42, 0.34, 0.36, 0.52, 0.4, -0.58, 0.46, 0.34] as const
const SPECKS = [0.34, 0.14, 0.1, -0.3, 0.3, 0.08, 0.02, -0.28, 0.07, -0.56, -0.06, 0.07, 0.12, 0.46, 0.06, 0.6, -0.16, 0.06] as const
const SPECKS_M = 3
/** The gear: a body of radius GEAR_BODY with six teeth to the unit circle, a hole of GEAR_HOLE. */
const GEAR_BODY = 0.7
const GEAR_HOLE = 0.25
/** The bottles: the round flask's bulb (centre y, radius) and the tall flask's body box, each with its fizz line (y) and the glass wall's width from M. */
const BULB = { y: 0.3, r: 0.68, fizz: -0.12 }
const TALL = { x: -0.5, y: -0.3, w: 1, h: 1.28, r: 0.34, fizz: 0.04 }
const WALL = 0.1

/** Six chunky teeth round a body, `r` the radius of the tips: a tooth up, each a rounded trapezoid sunk into the body so the union has no seam. */
function addGear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  addCircle(ctx, x, y, GEAR_BODY * r)
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    const c = Math.cos(a)
    const s = Math.sin(a)
    const pts: number[] = []
    for (const [along, across] of [
      [0.5, -0.27],
      [1, -0.21],
      [1, 0.21],
      [0.5, 0.27],
    ] as const)
      pts.push(x + (along * c - across * s) * r, y + (along * s + across * c) * r)
    addRoundPoly(ctx, pts, 0.1 * r)
  }
}

/** Each thing's die-cut outline in its own unit space, as pieces of one path. */
function outline(ctx: CanvasRenderingContext2D, thing: Thing) {
  switch (thing) {
    case 'blueRock':
      addRoundPoly(ctx, ROCK, 0.24)
      return
    case 'goldRock':
      for (let i = 0; i < NUGGET.length; i += 3) addCircle(ctx, NUGGET[i]!, NUGGET[i + 1]!, NUGGET[i + 2]!)
      return
    case 'bubble':
      addCircle(ctx, 0, 0, 1)
      return
    case 'blueBar':
    case 'goldBar':
      addRoundRect(ctx, -1, -0.56, 2, 1.12, 0.36)
      return
    case 'gear':
      addGear(ctx, 0, 0, 1)
      return
    case 'greenBottle':
      addCircle(ctx, 0, BULB.y, BULB.r)
      addRoundRect(ctx, -0.22, -0.72, 0.44, 0.6, 0.06)
      addRoundRect(ctx, -0.32, -0.84, 0.64, 0.19, 0.09)
      addRoundRect(ctx, -0.2, -1, 0.4, 0.24, 0.08)
      return
    case 'orangeBottle':
      addRoundRect(ctx, TALL.x, TALL.y, TALL.w, TALL.h, TALL.r)
      addRoundRect(ctx, -0.19, -0.56, 0.38, 0.34, 0.06)
      addStar(ctx, 0, -0.66, 0.36)
      return
  }
}

/** Fizz: three little bubbles rising through a bottle's liquid from `bottom` to the line `top` at x positions `xs`, popping there, on a 2.4 s loop with a phase from `seed`. */
function fizz(ctx: CanvasRenderingContext2D, xs: readonly number[], top: number, bottom: number, colour: string, t: number, seed: number) {
  ctx.beginPath()
  xs.forEach((x, i) => {
    const u = loop(t, 2.4, phaseOf(seed * 7 + i) + i / xs.length)
    const r = 0.075 * (1 - u * u * u)
    addCircle(ctx, x + 0.04 * Math.sin(u * TAU + i), bottom + (top - bottom) * u, r)
  })
  fill(ctx, colour)
}

/** A swirl: a spiral from radius r0 at angle a0 inward to r1 over `turn` radians round (x, y), as a fresh path. */
function swirl(ctx: CanvasRenderingContext2D, x: number, y: number, a0: number, turn: number, r0: number, r1: number) {
  ctx.beginPath()
  for (let i = 0; i <= 12; i++) {
    const u = i / 12
    const a = a0 + turn * u
    const r = r0 + (r1 - r0) * u
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
}

/** A thing's parts inside its outline, in its unit space: its key colour, its lighter shape, from M its darker fold, from L its finer marks. */
function parts(ctx: CanvasRenderingContext2D, thing: Thing, lod: 'S' | 'M' | 'L', t: number, seed: number) {
  const look = THING[thing]
  const clipTo = () => {
    ctx.beginPath()
    outline(ctx, thing)
    ctx.clip()
  }
  ctx.save()
  switch (thing) {
    case 'blueRock': {
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, look.key)
      clipTo()
      ctx.beginPath()
      addRoundPoly(ctx, ROCK_TOP, 0.12)
      fill(ctx, look.light)
      if (lod !== 'S') {
        ctx.beginPath()
        addRoundPoly(ctx, ROCK_FOLD, 0.12)
        fill(ctx, look.fold)
      }
      break
    }
    case 'goldRock': {
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, look.key)
      clipTo()
      ctx.beginPath()
      ctx.ellipse(-0.3, -0.34, 0.4, 0.26, -0.5, 0, TAU)
      fill(ctx, look.light)
      if (lod !== 'S') {
        ctx.beginPath()
        const n = lod === 'L' ? SPECKS.length / 3 : SPECKS_M
        for (let i = 0; i < n; i++) addCircle(ctx, SPECKS[3 * i]!, SPECKS[3 * i + 1]!, SPECKS[3 * i + 2]! * (lod === 'M' ? 1.3 : 1))
        fill(ctx, look.fold)
      }
      break
    }
    case 'bubble': {
      // An opaque pearl: its body and one white sheen arc high on the left, from M glowing pale blue round it (a sheen, never a shade).
      ctx.beginPath()
      addCircle(ctx, 0, 0, 1)
      fill(ctx, look.key)
      if (lod !== 'S') {
        ctx.beginPath()
        ctx.arc(-0.05, -0.05, 0.62, Math.PI * 0.98, Math.PI * 1.46)
        roundStroke(ctx, 0.36, look.fold)
      }
      ctx.beginPath()
      ctx.arc(-0.05, -0.05, 0.62, Math.PI * 1.02, Math.PI * 1.42)
      roundStroke(ctx, 0.2, look.light)
      break
    }
    case 'blueBar':
    case 'goldBar': {
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, look.key)
      ctx.beginPath()
      addRoundRect(ctx, -0.72, -0.38, 1.44, 0.24, 0.12)
      fill(ctx, look.light)
      if (lod !== 'S') {
        // The fold: the bar's stamp, a darker pill low in its middle.
        ctx.beginPath()
        addRoundRect(ctx, -0.34, 0.08, 0.68, 0.2, 0.1)
        fill(ctx, look.fold)
      }
      if (lod === 'L') {
        ctx.beginPath()
        addCircle(ctx, -0.82, -0.26, 0.07)
        fill(ctx, C.white)
      }
      break
    }
    case 'gear': {
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, look.key)
      ctx.beginPath()
      ctx.arc(0, 0, 0.5, Math.PI * 0.95, Math.PI * 1.6)
      roundStroke(ctx, 0.18, look.light)
      if (lod !== 'S') {
        // The fold: a darker hub ring round the hole.
        ctx.beginPath()
        ctx.arc(0, 0, GEAR_HOLE + 0.08, 0, TAU)
        roundStroke(ctx, 0.12, look.fold)
      }
      // The hole shows the sticker's white backing.
      ctx.beginPath()
      addCircle(ctx, 0, 0, GEAR_HOLE)
      fill(ctx, C.white)
      break
    }
    case 'greenBottle': {
      const inner = BULB.r - (lod === 'S' ? 0 : WALL)
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, GLASS.glass)
      ctx.beginPath()
      addRoundRect(ctx, -0.2, -1, 0.4, 0.24, 0.08)
      fill(ctx, GLASS.cork)
      // The fizz fills the bulb inside its glass wall up to its line.
      ctx.save()
      ctx.beginPath()
      addCircle(ctx, 0, BULB.y, inner)
      ctx.clip()
      ctx.beginPath()
      ctx.rect(-1, BULB.fizz, 2, 2)
      ctx.clip()
      fill(ctx, look.key)
      if (lod !== 'S') {
        // The fold: the fizz's surface, a darker band along its line.
        ctx.beginPath()
        ctx.rect(-1, BULB.fizz, 2, 0.13)
        fill(ctx, look.fold)
      }
      if (lod === 'L') {
        // The recipe: blue and gold swirling into the green, two arms of one swirl.
        const sy = BULB.y + 0.12
        swirl(ctx, 0, sy, Math.PI, Math.PI * 1.15, 0.4, 0.08)
        roundStroke(ctx, 0.11, THING.blueBar.key)
        swirl(ctx, 0, sy, 0, Math.PI * 1.15, 0.4, 0.08)
        roundStroke(ctx, 0.11, THING.goldBar.key)
        fizz(ctx, [-0.34, 0.06, 0.36], BULB.fizz + 0.06, BULB.y + 0.5, look.light, t, seed)
      }
      ctx.restore()
      shine(ctx, 0, BULB.y, inner)
      break
    }
    case 'orangeBottle': {
      const wall = lod === 'S' ? 0 : WALL
      ctx.beginPath()
      outline(ctx, thing)
      fill(ctx, GLASS.glass)
      // The star cork, its points softened by a stroke of its own colour.
      ctx.beginPath()
      addStar(ctx, 0, -0.66, 0.36)
      fill(ctx, GLASS.star)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 0.1
      ctx.strokeStyle = GLASS.star
      ctx.stroke()
      ctx.save()
      ctx.beginPath()
      addRoundRect(ctx, TALL.x + wall, TALL.y + wall, TALL.w - 2 * wall, TALL.h - 2 * wall, TALL.r - wall)
      ctx.clip()
      ctx.beginPath()
      ctx.rect(-1, TALL.fizz, 2, 2)
      fill(ctx, look.key)
      if (lod !== 'S') {
        // The fold: the fizz's surface, a darker band along its line.
        ctx.beginPath()
        ctx.rect(-1, TALL.fizz, 2, 0.13)
        fill(ctx, look.fold)
      }
      if (lod === 'L') {
        // The recipe: a gear inside a bubble, riding in the fizz.
        ctx.beginPath()
        addCircle(ctx, 0, 0.5, 0.3)
        fill(ctx, THING.bubble.key)
        ctx.beginPath()
        addGear(ctx, 0, 0.5, 0.2)
        fill(ctx, THING.gear.key)
        ctx.beginPath()
        addCircle(ctx, 0, 0.5, 0.2 * GEAR_HOLE)
        fill(ctx, THING.bubble.key)
        fizz(ctx, [-0.27, 0.27], TALL.fizz + 0.08, TALL.y + TALL.h - 0.12, look.light, t, seed)
      }
      ctx.restore()
      // A tall bottle's glint: one white stroke down the glass of its left shoulder.
      ctx.beginPath()
      ctx.moveTo(-0.28, -0.12)
      ctx.lineTo(-0.28, TALL.fizz - 0.1)
      roundStroke(ctx, 0.11, C.white)
      break
    }
  }
  ctx.restore()
}

/** A thing as a die-cut sticker centred on the origin, `size` cells across with its rim, at sim time t; `seed` gives a thing of many its own phase (the fizz). */
export function drawThing(ctx: CanvasRenderingContext2D, thing: Thing, size: number, t: number, seed: number): void {
  drawLiftedThing(ctx, thing, size, t, seed, 0)
}

/**
 * The renderer's stamps of still things (frame.ts): while it draws a frame of the board it
 * sets `draw`, which draws a thing `size` cells across, as see-through as the context's
 * alpha and with its shadow where the pen has it, from one bitmap a kind, size, alpha and
 * shadow where the picture would come out the same from its paths (its own canvas at the
 * board's own scale), and says whether it did. Null everywhere else (the HUD's portraits, the hand, the sheets, the
 * tests): every thing from its paths.
 */
export const stamps: { draw: ((ctx: CanvasRenderingContext2D, thing: Thing, size: number) => boolean) | null } = { draw: null }

/** `drawThing` for a thing that keeps its size and how see-through it is from frame to frame (a roof stack, a heap, the basket, what Beep carries, a muncher's cheeks and its picnic bar, what a machine wants faint in its mouth, a rocket part's faint picture): below 40 px its picture never moves, so the renderer draws it from a stamp (`stamps`). */
export function drawStillThing(ctx: CanvasRenderingContext2D, thing: Thing, size: number, t: number, seed: number): void {
  if (detail(size) !== 'L' && stamps.draw !== null && stamps.draw(ctx, thing, size)) return
  drawThing(ctx, thing, size, t, seed)
}

/** `drawThing` raised off the table by `lift` (0 to 1): a thing riding over a bridge, held up or flying, its shadow longer and softer. */
export function drawLiftedThing(ctx: CanvasRenderingContext2D, thing: Thing, size: number, t: number, seed: number, lift: number): void {
  const r = rimOf(size)
  const k = size / 2 - r
  const lod = detail(size)
  ctx.save()
  dieCutRim(
    ctx,
    () => {
      ctx.beginPath()
      ctx.save()
      ctx.scale(k, k)
      outline(ctx, thing)
      ctx.restore()
    },
    lift,
    r,
  )
  scaled(ctx, k, () => parts(ctx, thing, lod, t, seed))
  ctx.restore()
}

/** The sizes the sheet shows each thing at, in CSS px at the game's 50 px cells (open it with &px=50): on a belt at land 3, at land 2, on the tray and land 1, on a card. */
const SHEET_PX = [22, 30, 40, 80] as const

/** ?sheet=things: every thing at every size, and raised. */
export const SHEET: SheetEntry[] = [
  ...SHEET_PX.flatMap((px) =>
    THINGS.map((thing): SheetEntry => {
      const size = px / 50
      return { label: `${thing} ${px}`, box: { x: -size / 2 - 0.02, y: -size / 2 - 0.02, w: size + 0.12, h: size + 0.12 }, draw: (ctx, t) => drawThing(ctx, thing, size, t, 3) }
    }),
  ),
  ...THINGS.map((thing): SheetEntry => ({ label: `${thing} lifted`, box: { x: -0.32, y: -0.32, w: 0.8, h: 0.8 }, draw: (ctx, t) => drawLiftedThing(ctx, thing, ON_BELT * 1.12, t, 5, 0.4) })),
]
