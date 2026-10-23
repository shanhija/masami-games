/**
 * Runs the land on the fake context: the print over the cells a bake covers, with dots or the
 * grid, at the game's cell sizes, in the start block, far out on the board and past its edge;
 * every cell of it again at every moment after a tap; every burrow in every stage, warning,
 * out, a friend, poked and waving hello, each wearing its own mark; heaps of every size, paw
 * prints walking out and fading, the basket. Nothing may crash, draw NaN, leave the context
 * changed, draw text or make a gradient, and each drawing stays in the box its callers bake or
 * place it by. Holds the print to the board and to its area (only the cells it covers are
 * painted, the ponds and the flowers sit where board.ts puts them), the burrow to its picture
 * rules (never a dark door, a face only when it should lean out), the heap to twelve and its
 * flag to six. Looks are judged on ?sheet=land.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { BURROWS, FLOWER_OF, GROUND, PONDS, cellOf, inCorner, xOf, yOf } from '../game/board'
import { HEAP_HINT, PAWS_FOR, STAGE_AT } from '../game/catalog'
import { CELLS, COLS, ROWS, STEP, THINGS } from '../game/model'
import type { Box } from '../game/where'
import { clipped, colours, edges, fakeContext, poking, resetPen } from './fakeContext'
import { HEAP_DRAWN, HELLO_FOR, POKE_FOR, SHEET, drawBasket, drawBurrow, drawCellPrint, drawHeap, drawPaws, drawPrint, type BurrowPic } from './land'
import { C, LAND, MUNCHER, pen } from './look'

afterEach(resetPen)

/** Ages in seconds since a tap: just now, mid-shake, settling, done, long ago, never. */
const AGES = [0, 0.05, 0.2, 0.45, 0.8, 1.3, 1e4, Infinity] as const
const TIMES = [0, 0.37, 2.9, 1e5 + 0.21] as const
/** The start block with its table round it, a stretch of the far east, and the board's south-east corner with the table past it: the areas the renderer bakes. */
const BOARD: Box = { x: -1, y: -1, w: 22, h: 14 }
const EAST: Box = { x: 38, y: 0, w: 24, h: 14 }
const CORNER_SE: Box = { x: 44, y: 28, w: 18, h: 10 }
const AREAS = [BOARD, EAST, CORNER_SE] as const
/** Whether cell c is one the area covers (a cell it touches). */
const covered = (a: Box, c: number) => xOf(c) < a.x + a.w && xOf(c) + 1 > a.x && yOf(c) < a.y + a.h && yOf(c) + 1 > a.y

describe('the print', () => {
  it('draws the print with dots or the grid over each area, inside it, filling it with the table', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const ppm of [30, 50, 80])
      for (const area of AREAS)
        for (const grid of [false, true]) {
          pen.ppm = ppm
          const what = `area ${area.x}, ${area.y}${grid ? ' grid' : ''} at ${ppm} px`
          const b = measure(() => check(what, () => drawPrint(clipped(ctx), grid, area), 'none'))
          out.push(...poking(what, b, edges(area, 0), 1e-9))
          // The table fills the whole area.
          expect([b.x0, b.y0, b.x1, b.y1], what).toEqual([area.x, area.y, area.x + area.w, area.y + area.h])
        }
    expect(out).toEqual([])
  })

  it('tints the flowers and draws the ponds and trees where board.ts puts them, only for the cells the area covers', () => {
    const everything: Box = { x: -1, y: -1, w: COLS + 2, h: ROWS + 2 }
    const used = colours((ctx) => drawPrint(ctx, false, everything))
    expect(used.filter((c) => c === LAND.flowerTint).length).toBe(1)
    expect(used.filter((c) => c === LAND.pond).length).toBe(PONDS.length)
    expect(used.filter((c) => c === LAND.tree).length).toBe(GROUND.filter((g) => g === 'tree').length)
    // Each area holds only its own trees and ponds: the print of the corner draws the corner's, not the whole board's.
    for (const area of AREAS) {
      const part = colours((ctx) => drawPrint(ctx, false, area))
      const cells = Array.from({ length: CELLS }, (_, c) => c).filter((c) => covered(area, c))
      expect(part.filter((c) => c === LAND.tree).length, `trees in ${area.x}, ${area.y}`).toBe(cells.filter((c) => GROUND[c] === 'tree').length)
      expect(part.filter((c) => c === LAND.pond).length, `ponds in ${area.x}, ${area.y}`).toBe(PONDS.filter((p) => covered(area, cellOf(p.x, p.y)) || covered(area, cellOf(p.x + p.w - 1, p.y + p.h - 1))).length)
    }
    expect(colours((ctx) => drawPrint(ctx, false, BOARD)).filter((c) => c === LAND.tree).length).toBe(GROUND.filter((g, c) => g === 'tree' && inCorner(xOf(c), yOf(c))).length)
  })

  it('draws every cell of the start block again for a tap, and some of every other stretch of the board, at every moment after it, inside its cell', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (let c = 0; c < CELLS; c++) {
      if (!inCorner(xOf(c), yOf(c)) && c % 11 !== 0 && GROUND[c] !== 'pond') continue
      const cell: Box = { x: xOf(c), y: yOf(c), w: 1, h: 1 }
      AGES.forEach((age, a) => {
        // Each cell at every age, the grid taking turns so both meet across the cells.
        const grid = (c + a) % 2 === 0
        pen.ppm = a % 2 === 0 ? 50 : 80
        const what = `cell ${xOf(c)}, ${yOf(c)} (${GROUND[c]}${FLOWER_OF[c]! >= 0 ? ', flowers' : ''}) at ${age}`
        const b = measure(() => check(what, () => drawCellPrint(clipped(ctx), grid, c, age), 'none'))
        // The corner dots are drawn whole (the same dots as the bake's next door); a shaken tree leans a little past its cell, a falling leaf a little more.
        out.push(...poking(what, b, edges(cell, 0), GROUND[c] === 'tree' ? 0.1 : 0.033))
      })
    }
    expect(out).toEqual([])
  })
})

describe('the burrows', () => {
  const pic = (patch: Partial<BurrowPic>): BurrowPic => ({ burrow: 0, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: Infinity, ...patch })
  const HUNGERS = [0, 120, 399, 400, 550, 699, 700, 820, 899, 900, 960, 999, 1000] as const

  it('draw every burrow in every stage, warning, out, friend, poked and waving hello, at every moment, on their mound', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    let k = 0
    for (const burrow of [0, 1, 2, 3, 4, 5])
      for (const hunger of HUNGERS)
        for (const away of [false, true])
          for (const friend of [false, true])
            check(
              `burrow ${burrow} at ${hunger}${away ? ' out' : ''}${friend ? ' friend' : ''}`,
              () =>
                AGES.forEach((age, a) =>
                  TIMES.forEach((t, i) => {
                    // The warning, the poke and the hello each meet every age across the burrows and hungers.
                    const p = pic({ burrow, hunger, out: away, friend, warnAge: (a + i) % 3 === 0 ? age : Infinity, pokeAge: (a + i) % 3 === 1 ? age : Infinity, helloAge: (a + i) % 3 === 2 ? age : Infinity })
                    pen.ppm = [40, 50, 80, 160][k++ % 4]!
                    const b = measure(() => drawBurrow(clipped(ctx), p, t))
                    out.push(...poking(`burrow ${JSON.stringify(p)} at ${t}`, b, edges({ x: 0, y: 0, w: 2, h: 2 }, 0), 0.1))
                  }),
                ),
              'none',
            )
    expect(out).toEqual([])
  })

  it('light the door honey-gold inside in every stage, never dark, and show a face only when it should lean out', () => {
    const face = (p: BurrowPic, t: number) => colours((ctx) => drawBurrow(ctx, p, t)).includes(MUNCHER.body)
    for (const hunger of HUNGERS) {
      const used = colours((ctx) => drawBurrow(ctx, pic({ hunger }), 1))
      expect(used, `door at ${hunger}`).toContain(LAND.door)
      // The one dark mark is a face's eyes: with no face out, nothing dark at all.
      expect(used.includes(C.face), `dark marks at ${hunger}`).toBe(hunger >= STAGE_AT[2])
      expect(face(pic({ hunger }), 1), `face at ${hunger}`).toBe(hunger >= STAGE_AT[2])
      // The nightcap, on or slipping, only while it sleeps.
      expect(used.includes(MUNCHER.nightcap), `nightcap at ${hunger}`).toBe(hunger < STAGE_AT[1])
    }
    // The calyx tips over the sill between the second and third stage.
    expect(colours((ctx) => drawBurrow(ctx, pic({ hunger: 800 }), 1))).toContain(MUNCHER.calyx)
    expect(face(pic({ hunger: 0, warnAge: 1 }), 1), 'awake in the warning').toBe(true)
    expect(face(pic({ hunger: 0, warnAge: 5.01 }), 1), 'the warning over').toBe(false)
    expect(face(pic({ hunger: 0, pokeAge: 0.5 }), 1), 'peeking for a tap').toBe(true)
    expect(face(pic({ hunger: 0, pokeAge: POKE_FOR }), 1), 'back to sleep').toBe(false)
    expect(face(pic({ hunger: 0, helloAge: HELLO_FOR - 0.1 }), 1), 'waving hello').toBe(true)
    expect(face(pic({ hunger: 999, out: true }), 1), 'out: the room is empty').toBe(false)
    expect(colours((ctx) => drawBurrow(ctx, pic({ friend: true }), 1))).toContain(C.heart)
  })

  it('wear their own mark on the muncher that leans out, at a size its marks show (the freckles and stripes from M): a bow, freckles, a flower, a star, stripes, a diamond', () => {
    const marks = [MUNCHER.bow, MUNCHER.freckle, MUNCHER.flower, MUNCHER.star, MUNCHER.stripe, MUNCHER.diamond]
    pen.ppm = 80
    for (const burrow of [0, 1, 2, 3, 4, 5]) {
      const used = colours((ctx) => drawBurrow(ctx, pic({ burrow, hunger: 950 }), 1))
      marks.forEach((m, i) => expect(used.includes(m), `burrow ${burrow}, mark ${i}`).toBe(i === burrow))
    }
  })
})

describe('the heaps, the paw prints and the basket', () => {
  it('draw a heap of every size up to twelve things, with its flag from six, at every moment', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const n of [0, 1, 2, 5, 6, 7, 11, 12, 13, 30, 200])
      for (const t of TIMES) {
        const heap = THINGS.map((_, i) => Math.floor((n + i) / THINGS.length))
        const b = measure(() => check(`heap of ${n} at ${t}`, () => drawHeap(clipped(ctx), heap, t), 'none'))
        if (n > 0) out.push(...poking(`heap of ${n}`, b, edges({ x: -0.6, y: -1.2, w: 1.25, h: 1.3 }, 0), 0))
        // One shadow for each thing drawn, and one for the flag.
        const shadows = colours((c) => drawHeap(c, heap, t)).filter((c) => c === C.shadow).length / 2
        expect(shadows, `heap of ${n}`).toBe(Math.min(n, HEAP_DRAWN) + (n >= HEAP_HINT ? 1 : 0))
      }
    expect(out).toEqual([])
  })

  it('walk paw prints out along the path over a second and a half, and take them away at the end', () => {
    const { ctx, check, measure, counts } = fakeContext()
    const path = [cellOf(3, 3), cellOf(4, 3), cellOf(5, 3), cellOf(5, 4), cellOf(5, 5), cellOf(6, 5)]
    const box: Box = { x: 3, y: 3, w: 4, h: 3 }
    const prints = (age: number) => {
      const before = counts.ellipse ?? 0
      const b = measure(() => check(`paws at ${age}`, () => drawPaws(clipped(ctx), path, age), 'none'))
      if ((counts.ellipse ?? 0) > before) expect(poking(`paws at ${age}`, b, edges(box, 0), 0)).toEqual([])
      return (counts.ellipse ?? 0) - before
    }
    expect(prints(0)).toBe(0)
    expect(prints(0.6)).toBeGreaterThan(0)
    expect(prints(0.6)).toBeLessThan(prints(2))
    expect(prints(2)).toBe((path.length - 1) * 2)
    expect(prints(PAWS_FOR * STEP)).toBe(0)
    expect(prints(Infinity)).toBe(0)
    expect(prints(1e4)).toBe(0)
    // A path of one cell has no way to show.
    expect(() => drawPaws(ctx, [cellOf(3, 3)], 1)).not.toThrow()
  })

  it('show up to five things peeking out of the basket', () => {
    const { ctx, check, measure } = fakeContext()
    for (const n of [0, 1, 3, 5, 6, 40]) {
      const basket = THINGS.map((_, i) => (i === 3 ? n : 0))
      const b = measure(() => check(`basket of ${n}`, () => drawBasket(clipped(ctx), basket), 'none'))
      expect(poking(`basket of ${n}`, b, edges({ x: -0.55, y: -0.45, w: 1.1, h: 0.95 }, 0), 0)).toEqual([])
      const shadows = colours((c) => drawBasket(c, basket)).filter((c) => c === C.shadow).length / 2
      expect(shadows, `basket of ${n}`).toBe(Math.min(n, 5) + 1)
    }
  })
})

describe('the sheet', () => {
  it('draws every entry of the land', () => {
    const { ctx, check } = fakeContext()
    const sheet = SHEET()
    sheet.forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 2.6] : [1.1, 9.7]) check(`land: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    })
    expect(sheet.some((e) => e.label.startsWith('burrow'))).toBe(true)
    expect(BURROWS.length).toBe(6)
  })
})
