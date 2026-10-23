/**
 * The designed board as the plan describes it: three burrows with whole flower rings, one in
 * each land, the pad and the start oven on grass in land 1, the pond far west, and the room the
 * roster is sized to (208 usable cells at land 3, plans/rocket-factory.md). The lints that
 * need belts and munchers (every burrow reaches the core, a tidy land 3 fits) live with them.
 */
import { describe, expect, it } from 'vitest'

import { BASKET, BURROWS, FLOWER_OF, GROUND, LANDS, MAP, PAD, PAD_RING, START_OVEN, cellOf, inLand, rockOf, stepCell, xOf, yOf } from './board'
import { CELLS, COLS, ROWS } from './model'

const cells = Array.from({ length: CELLS }, (_, c) => c)

describe('the board', () => {
  it('is 20 by 12 and every letter is known', () => {
    expect(MAP.length).toBe(ROWS)
    for (const row of MAP) expect(row.length).toBe(COLS)
    expect(GROUND.length).toBe(CELLS)
  })

  it('has one burrow in each land, opening with it, each in a whole ring of flowers', () => {
    expect(BURROWS.map((b) => b.land)).toEqual([1, 2, 3])
    BURROWS.forEach((b, i) => {
      const ring = cells.filter((c) => FLOWER_OF[c] === i)
      // A full ring round a 2x2 mound is 12 cells; burrow C's is cut by the board's east edge.
      expect(ring.length, `burrow ${i}`).toBe(i === 2 ? 8 : 12)
      for (const c of ring) expect(Math.max(Math.abs(xOf(c) - (b.x + 0.5)), Math.abs(yOf(c) - (b.y + 0.5)))).toBeLessThanOrEqual(1.5)
      expect(inLand(b.land, b.x, b.y) && inLand(b.land, b.x + 1, b.y + 1)).toBe(true)
      if (b.land > 1) expect(inLand((b.land - 1) as 1 | 2, b.x, b.y)).toBe(false)
    })
  })

  it('puts the pad, the start oven and the basket on grass in land 1, and the pond far west', () => {
    for (let y = PAD.y; y < PAD.y + 3; y++) for (let x = PAD.x; x < PAD.x + 3; x++) expect(GROUND[cellOf(x, y)]).toBe('pad')
    for (let y = START_OVEN.y; y < START_OVEN.y + 2; y++) for (let x = START_OVEN.x; x < START_OVEN.x + 2; x++) expect(GROUND[cellOf(x, y)]).toBe('grass')
    expect(GROUND[cellOf(BASKET.x, BASKET.y)]).toBe('grass')
    expect(inLand(1, BASKET.x, BASKET.y)).toBe(true)
    const pond = cells.filter((c) => GROUND[c] === 'pond')
    expect(pond.length).toBe(4)
    for (const c of pond) expect(xOf(c)).toBeLessThanOrEqual(1)
  })

  it('leaves 208 usable cells at land 3 (32 fixed: the pad, the pond, the trees, the mounds)', () => {
    const fixed = cells.filter((c) => ['pad', 'pond', 'tree', 'burrow'].includes(GROUND[c]!))
    expect(fixed.length).toBe(32)
    expect(CELLS - fixed.length).toBe(208)
  })

  it('has a blue and a gold digger spot in land 1, and the richest rocks touching the flowers', () => {
    const spots = (rock: 'blueRock' | 'goldRock', land: 1 | 2 | 3) => {
      let n = 0
      const w = LANDS[land]
      for (let y = w.y0; y < w.y1; y++)
        for (let x = w.x0; x < w.x1; x++) {
          const under = [cellOf(x, y), cellOf(x + 1, y), cellOf(x, y + 1), cellOf(x + 1, y + 1)]
          const free = under.every((c) => ['grass', 'blue', 'gold'].includes(GROUND[c]!))
          if (free && under.filter((c) => rockOf(c) === rock).length >= 2) n++
        }
      return n
    }
    expect(spots('blueRock', 1)).toBeGreaterThanOrEqual(1)
    expect(spots('goldRock', 1)).toBeGreaterThanOrEqual(1)
    expect(spots('goldRock', 2)).toBeGreaterThan(spots('goldRock', 1))
    expect(cells.some((c) => rockOf(c) !== null && FLOWER_OF[c] !== -1)).toBe(true)
  })

  it('keeps the munchers off the pad and the ring round it, and steps between cells', () => {
    expect(PAD_RING.size).toBe(25)
    expect(PAD_RING.has(cellOf(BASKET.x, BASKET.y))).toBe(true)
    expect(stepCell(cellOf(0, 0), 2)).toBe(-1)
    expect(stepCell(cellOf(0, 0), 0)).toBe(cellOf(1, 0))
    expect(stepCell(cellOf(19, 11), 1)).toBe(-1)
  })
})
