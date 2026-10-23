/**
 * Runs the land on the fake context: the print of every land, with dots or the grid, flat and
 * turned upright, at the game's cell sizes; every cell of it again at every moment after a
 * tap; the flaps folding open and their corner lifting; every burrow in every stage, warning,
 * out, a friend, poked and waving hello; heaps of every size, paw prints walking out and
 * fading, the basket. Nothing may crash, draw NaN, leave the context changed, draw text or make
 * a gradient, and each drawing stays in the box its callers bake or place it by. Holds the
 * print to the board (the flaps cover exactly the next land beyond this one, the pond and the
 * flowers sit where board.ts puts them), the burrow to its picture rules (never a dark door, a
 * face only when it should lean out), the heap to twelve and its flag to six. Looks are judged
 * on ?sheet=land.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { BURROWS, FLOWER_OF, GROUND, LANDS, cellInLand, cellOf, xOf, yOf } from '../game/board'
import { HEAP_HINT, PAWS_FOR, STAGE_AT } from '../game/catalog'
import { CELLS, STEP, THINGS, type Land } from '../game/model'
import type { Box } from '../game/where'
import { clipped, colours, edges, fakeContext, poking, resetPen } from './fakeContext'
import { HEAP_DRAWN, HELLO_FOR, POKE_FOR, SHEET, drawBasket, drawBurrow, drawCellPrint, drawFlapCorner, drawFlaps, drawHeap, drawPaws, drawPrint, flapCorner, flapWiggle, type BurrowPic } from './land'
import { C, LAND, MUNCHER, pen } from './look'

afterEach(resetPen)

/** Ages in seconds since a tap: just now, mid-shake, settling, done, long ago, never. */
const AGES = [0, 0.05, 0.2, 0.45, 0.8, 1.3, 1e4, Infinity] as const
const TIMES = [0, 0.37, 2.9, 1e5 + 0.21] as const
/** The board flat, and turned upright (east up), with the shadow turned to stay down-right on screen. */
const TURNS = [0, -Math.PI / 2] as const
const BOARD: Box = { x: -1, y: -1, w: 22, h: 14 }

const turnShadow = (turn: number) => {
  pen.shadowX = 0.06 * Math.cos(-turn) - 0.06 * Math.sin(-turn)
  pen.shadowY = 0.06 * Math.sin(-turn) + 0.06 * Math.cos(-turn)
}

describe('the print', () => {
  it('draws every land with dots or the grid, flat and upright, inside the area it is baked over', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const ppm of [30, 50, 80])
      for (const land of [1, 2, 3] as const)
        for (const grid of [false, true])
          for (const turn of TURNS) {
            pen.ppm = ppm
            turnShadow(turn)
            const what = `land ${land}${grid ? ' grid' : ''} turned ${turn.toFixed(2)} at ${ppm} px`
            const b = measure(() => check(what, () => drawPrint(clipped(ctx), land, grid, BOARD, turn), 'none'))
            out.push(...poking(what, b, edges(BOARD, 0), 1e-9))
            // The table fills the whole area.
            expect([b.x0, b.y0, b.x1, b.y1], what).toEqual([BOARD.x, BOARD.y, BOARD.x + BOARD.w, BOARD.y + BOARD.h])
          }
    expect(out).toEqual([])
  })

  it('tints the flowers where board.ts puts them, and the pond where it is', () => {
    // A print of land 3 fills the flowers' tint once, over every flower cell.
    const used = colours((ctx) => drawPrint(ctx, 3, false, BOARD, 0))
    expect(used.filter((c) => c === LAND.flowerTint).length).toBe(1)
    expect(used).toContain(LAND.pond)
    expect(used.filter((c) => c === LAND.tree).length).toBe(GROUND.filter((g) => g === 'tree').length)
    // Land 1 holds one burrow's flowers in part, and two of the trees.
    const land1 = colours((ctx) => drawPrint(ctx, 1, false, BOARD, 0))
    expect(land1.filter((c) => c === LAND.tree).length).toBe(GROUND.filter((g, c) => g === 'tree' && cellInLand(1, c)).length)
  })

  it('draws every cell of every land again for a tap, at every moment after it, inside its cell', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const land of [1, 2, 3] as const)
      for (let c = 0; c < CELLS; c++) {
        if (!cellInLand(land, c)) continue
        const cell: Box = { x: xOf(c), y: yOf(c), w: 1, h: 1 }
        AGES.forEach((age, a) => {
          // Each cell at every age, the grid and the turn taking turns so all meet across the cells.
          const grid = (c + a) % 2 === 0
          const turn = TURNS[(c + a + land) % 2]!
          pen.ppm = a % 2 === 0 ? 50 : 80
          turnShadow(turn)
          const what = `land ${land} cell ${xOf(c)}, ${yOf(c)} (${GROUND[c]}${FLOWER_OF[c]! >= 0 ? ', flowers' : ''}) at ${age}`
          const b = measure(() => check(what, () => drawCellPrint(clipped(ctx), land, grid, c, age, turn), 'none'))
          // The corner dots are drawn whole (the same dots as the bake's next door); a shaken tree leans a little past its cell, a falling leaf a little more.
          out.push(...poking(what, b, edges(cell, 0), GROUND[c] === 'tree' ? 0.1 : 0.033))
        })
      }
    expect(out).toEqual([])
  })

  it('will not draw a cell the land has not opened yet', () => {
    const { ctx } = fakeContext()
    expect(() => drawCellPrint(ctx, 1, false, cellOf(19, 11), Infinity, 0)).toThrow(/not in land 1/)
  })
})

describe('the flaps', () => {
  /** The cells the flaps of `land` cover, from their paper's fill: the next land's cells outside this one. */
  const nextOnly = (land: 1 | 2) => Array.from({ length: CELLS }, (_, c) => c).filter((c) => cellInLand((land + 1) as Land, c) && !cellInLand(land, c))

  it('fold open over every moment, corner lifted or not, inside the next land', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const land of [1, 2] as const) {
      const w = LANDS[(land + 1) as Land]
      const box: Box = { x: w.x0, y: w.y0, w: w.x1 + 1 - w.x0, h: w.y1 + 1 - w.y0 }
      for (const u of [0, 0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99, 1])
        for (const corner of [0, 0.3, 1])
          for (const ppm of [50, 80]) {
            pen.ppm = ppm
            const what = `land ${land} flaps at ${u}, corner ${corner}, ${ppm} px`
            const b = measure(() => check(what, () => drawFlaps(clipped(ctx), land, u, corner), 'none'))
            if (u < 1) out.push(...poking(what, b, edges(box, 0), 1e-9))
            else expect(b.x0, `${what}: nothing left once open`).toBeGreaterThan(b.x1)
          }
    }
    expect(out).toEqual([])
  })

  it('cover exactly the next land beyond this one, and land 3 has none', () => {
    for (const land of [1, 2] as const) {
      const { ctx, measure } = fakeContext()
      const b = measure(() => drawFlaps(clipped(ctx), land, 0, 0))
      const w = LANDS[(land + 1) as Land]
      expect([b.x0, b.y0, b.x1, b.y1]).toEqual([w.x0, w.y0, w.x1 + 1, w.y1 + 1])
      // Every cell the flaps cover is outside this land and inside the next.
      expect(nextOnly(land).length).toBe((w.x1 + 1 - w.x0) * (w.y1 + 1 - w.y0) - (LANDS[land].x1 + 1 - LANDS[land].x0) * (LANDS[land].y1 + 1 - LANDS[land].y0))
    }
    const { ctx, counts } = fakeContext()
    drawFlaps(ctx, 3, 0, 1)
    expect(counts.fill ?? 0).toBe(0)
  })

  it('wiggle their corner on a calm loop, never flat while it waits for her tap', () => {
    for (let t = 0; t < 4; t += 0.05) {
      expect(flapWiggle(t)).toBeGreaterThan(0.3)
      expect(flapWiggle(t)).toBeLessThanOrEqual(1)
    }
  })

  it('show the paper\'s warm back over a sticker\'s shadow and the ground under the corner only while it lifts', () => {
    const flat = colours((ctx) => drawFlaps(ctx, 1, 0, 0))
    const lifted = colours((ctx) => drawFlaps(ctx, 1, 0, 1))
    expect(flat).not.toContain(LAND.ground)
    expect(lifted.slice(flat.length)).toEqual([LAND.ground, C.shadow, C.warm])
  })

  it('lift their corner by more than half a cell, up to a whole one, at the land\'s north-east corner while it waits for her tap', () => {
    for (const land of [1, 2] as const) {
      const { ctx, measure } = fakeContext()
      const at = flapCorner(land)
      expect(at).toEqual({ x: LANDS[land].x1 + 1, y: LANDS[land].y0 })
      for (let t = 0; t < 1.6; t += 0.1) {
        const b = measure(() => drawFlapCorner(ctx, land, flapWiggle(t)))
        expect(b.x0, `land ${land} at ${t}`).toBeCloseTo(at.x, 9)
        expect(b.x1 - b.x0, `land ${land} at ${t}`).toBeGreaterThan(0.6)
        expect(b.x1 - b.x0, `land ${land} at ${t}`).toBeLessThan(1.2)
      }
    }
  })
})

describe('the burrows', () => {
  const pic = (patch: Partial<BurrowPic>): BurrowPic => ({ burrow: 0, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: Infinity, ...patch })
  const HUNGERS = [0, 120, 399, 400, 550, 699, 700, 820, 899, 900, 960, 999, 1000] as const

  it('draw every burrow in every stage, warning, out, friend, poked and waving hello, at every moment, on their mound', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    let k = 0
    for (const burrow of [0, 1, 2])
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

  it('wear their own mark on the muncher that leans out, at a size its marks show (the freckles from M)', () => {
    const marks = [MUNCHER.bow, MUNCHER.freckle, MUNCHER.flower]
    pen.ppm = 80
    for (const burrow of [0, 1, 2]) {
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
    expect(BURROWS.length).toBe(3)
  })
})
