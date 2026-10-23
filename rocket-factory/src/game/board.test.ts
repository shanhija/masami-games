/**
 * The designed board as the plan describes it: 60 x 36 cells, all open from the start, today's
 * first board unchanged in its north-west corner, six burrows with whole flower rings (A, B and
 * C in the corner, D, E and F far out east, south-east and south), blue and gold rock patches
 * that take diggers (the richest touching the far burrows' flowers), three ponds the pump fits,
 * and one connected land every burrow's door walks to the pad. The lints that need belts and
 * stickers (a tidy factory fits) live with them.
 */
import { describe, expect, it } from 'vitest'

import { BASKET, BURROWS, CORNER, FLOWER_OF, GROUND, MAP, PAD, PAD_RING, PONDS, START_OVEN, cellOf, inCorner, rockOf, stepCell, xOf, yOf } from './board'
import { CELLS, COLS, DIRS, ROWS } from './model'
import { doorCell } from './munchers'
import { blankState } from './rules'

const cells = Array.from({ length: CELLS }, (_, c) => c)

/** Today's first board as it was before the map grew: it stays at x 0..19, y 0..11 of the big map, and the east edge of burrow C's ring closes on column 20. */
const FIRST_BOARD = [
  '.........T..........',
  '..bbbb....ffff.....T',
  '.......bbbB11f.Tgg..',
  '.......bbbB11f..gg..',
  '.RRR......ffffgggGff',
  '.RRR..........gg.f33',
  '.RRR..OO.........f33',
  '......OO..gg.fffffff',
  'ww......T.gg.f22f...',
  'ww..T........f22f...',
  '............TfffBbbb',
  '.............T..bbbb',
] as const

/** The cells a 4-connected walk over `open` cells reaches from `starts`, with its steps. */
function reach(starts: readonly number[], open: (c: number) => boolean): Map<number, number> {
  const dist = new Map<number, number>(starts.map((c) => [c, 0]))
  const queue = [...starts]
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!
    for (const d of DIRS) {
      const n = stepCell(c, d)
      if (n >= 0 && !dist.has(n) && open(n)) {
        dist.set(n, dist.get(c)! + 1)
        queue.push(n)
      }
    }
  }
  return dist
}

/** The 4-connected patches of cells that are `rock`. */
function patches(rock: 'blueRock' | 'goldRock'): number[][] {
  const seen = new Set<number>()
  const out: number[][] = []
  for (const c of cells) {
    if (rockOf(c) !== rock || seen.has(c)) continue
    const patch = [...reach([c], (n) => rockOf(n) === rock).keys()]
    for (const p of patch) seen.add(p)
    out.push(patch)
  }
  return out
}
const bounds = (cs: readonly number[]) => ({ w: Math.max(...cs.map(xOf)) - Math.min(...cs.map(xOf)) + 1, h: Math.max(...cs.map(yOf)) - Math.min(...cs.map(yOf)) + 1 })
const buildable = (c: number) => ['grass', 'blue', 'gold'].includes(GROUND[c]!) && !PAD_RING.has(c) && c !== cellOf(BASKET.x, BASKET.y)
/** The top-left cells of the 2x2 footprints a digger could stand on over this patch: all four cells buildable, two or more of them its rock. */
function diggerSpots(patch: readonly number[], rock: 'blueRock' | 'goldRock'): number[] {
  const out: number[] = []
  for (const c of patch)
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
      const x = xOf(c) + dx
      const y = yOf(c) + dy
      if (x < 0 || y < 0 || x + 1 >= COLS || y + 1 >= ROWS) continue
      const under = [cellOf(x, y), cellOf(x + 1, y), cellOf(x, y + 1), cellOf(x + 1, y + 1)]
      if (under.every(buildable) && under.filter((u) => rockOf(u) === rock).length >= 2) out.push(cellOf(x, y))
    }
  return out
}

describe('the board', () => {
  it('is 60 by 36 and every letter is known', () => {
    expect(MAP.length).toBe(ROWS)
    for (const row of MAP) expect(row.length).toBe(COLS)
    expect(GROUND.length).toBe(CELLS)
    expect([COLS, ROWS]).toEqual([60, 36])
  })

  it("keeps today's first board unchanged in the north-west corner, with burrow C's ring closed on column 20", () => {
    expect(CORNER).toEqual({ x: 0, y: 0, w: 20, h: 12 })
    FIRST_BOARD.forEach((row, y) => expect(MAP[y]!.slice(0, 20), `row ${y}`).toBe(row))
    expect([PAD, START_OVEN, BASKET]).toEqual([{ x: 1, y: 4 }, { x: 6, y: 6 }, { x: 0, y: 5 }])
    for (let y = 4; y <= 7; y++) expect(MAP[y]![20], `row ${y}`).toBe('f')
    expect(inCorner(19, 11) && !inCorner(20, 11) && !inCorner(19, 12)).toBe(true)
  })

  it('has six burrows, each in a whole ring of 12 flowers, D, E and F far from the pad', () => {
    expect(BURROWS.length).toBe(6)
    BURROWS.forEach((b, i) => {
      const ring = cells.filter((c) => FLOWER_OF[c] === i)
      expect(ring.length, `burrow ${i}`).toBe(12)
      for (const c of ring) expect(Math.max(Math.abs(xOf(c) - (b.x + 0.5)), Math.abs(yOf(c) - (b.y + 0.5)))).toBeLessThanOrEqual(1.5)
      expect(b.door).toEqual({ x: b.x + 1, y: b.y + 2 })
    })
    // A, B and C are inside the corner; D, E and F are far out: east, south-east and south.
    BURROWS.slice(0, 3).forEach((b) => expect(inCorner(b.x, b.y) && inCorner(b.x + 1, b.y + 1)).toBe(true))
    const [d, e, f] = BURROWS.slice(3) as [(typeof BURROWS)[number], (typeof BURROWS)[number], (typeof BURROWS)[number]]
    expect(d.x).toBeGreaterThan(40)
    expect(d.y).toBeLessThan(12)
    expect(e.x).toBeGreaterThan(40)
    expect(e.y).toBeGreaterThan(22)
    expect(f.x).toBeGreaterThan(20)
    expect(f.x).toBeLessThan(40)
    expect(f.y).toBeGreaterThan(22)
    for (const b of [d, e, f]) expect(Math.hypot(b.x + 1 - (PAD.x + 1.5), b.y + 1 - (PAD.y + 1.5))).toBeGreaterThan(30)
  })

  it('puts the pad, the start oven and the basket on grass in the corner, and the first pond at the west edge', () => {
    for (let y = PAD.y; y < PAD.y + 3; y++) for (let x = PAD.x; x < PAD.x + 3; x++) expect(GROUND[cellOf(x, y)]).toBe('pad')
    for (let y = START_OVEN.y; y < START_OVEN.y + 2; y++) for (let x = START_OVEN.x; x < START_OVEN.x + 2; x++) expect(GROUND[cellOf(x, y)]).toBe('grass')
    expect(GROUND[cellOf(BASKET.x, BASKET.y)]).toBe('grass')
    expect(inCorner(BASKET.x, BASKET.y)).toBe(true)
    expect(PONDS[0]).toEqual({ x: 0, y: 8, w: 2, h: 2 })
  })

  it('has fixed cells (the pad, the ponds, the trees, the mounds) and room for the roster on the rest', () => {
    const fixed = cells.filter((c) => ['pad', 'pond', 'tree', 'burrow'].includes(GROUND[c]!))
    expect(fixed.length).toBe(145)
    expect(CELLS - fixed.length).toBe(2015)
  })

  it('has 10 blue and 7 gold patches, each of the 7 and 5 new ones 2x2 to 4x3 and able to take a digger, and rocks in the corner for the first diggers', () => {
    const blue = patches('blueRock')
    const gold = patches('goldRock')
    expect([blue.length, gold.length]).toEqual([10, 7])
    for (const [rock, list] of [['blueRock', blue], ['goldRock', gold]] as const)
      for (const patch of list) {
        expect(diggerSpots(patch, rock).length, `${rock} patch at ${xOf(patch[0]!)}, ${yOf(patch[0]!)}`).toBeGreaterThan(0)
        if (patch.every((c) => inCorner(xOf(c), yOf(c)))) continue
        const { w, h } = bounds(patch)
        expect(Math.min(w, h), `${rock} patch at ${xOf(patch[0]!)}, ${yOf(patch[0]!)}`).toBeGreaterThanOrEqual(2)
        expect(Math.max(w, h)).toBeLessThanOrEqual(4)
        expect(Math.min(w, h)).toBeLessThanOrEqual(3)
      }
    expect(blue.filter((p) => p.every((c) => !inCorner(xOf(c), yOf(c)))).length).toBe(7)
    expect(gold.filter((p) => p.every((c) => !inCorner(xOf(c), yOf(c)))).length).toBe(5)
    // The first screen has a blue and a gold digger spot, and the richest rocks touch the first burrows' flowers.
    expect(blue.some((p) => p.every((c) => inCorner(xOf(c), yOf(c))))).toBe(true)
    expect(gold.some((p) => p.every((c) => inCorner(xOf(c), yOf(c))))).toBe(true)
    expect(cells.some((c) => rockOf(c) !== null && FLOWER_OF[c] !== -1 && FLOWER_OF[c]! < 3)).toBe(true)
  })

  it("touches burrows D, E and F with a blue and a gold patch each, on their flowers, the richest of the map (11 cells or more)", () => {
    for (const i of [3, 4, 5])
      for (const [rock, list] of [['blueRock', patches('blueRock')], ['goldRock', patches('goldRock')]] as const) {
        const on = list.filter((p) => p.some((c) => FLOWER_OF[c] === i))
        expect(on.length, `burrow ${i}, ${rock}`).toBe(1)
        expect(on[0]!.length, `burrow ${i}, ${rock}`).toBeGreaterThanOrEqual(11)
        expect(diggerSpots(on[0]!, rock).length).toBeGreaterThan(0)
      }
    // Some small safe patches near home touch no burrow's flowers and no ring at all.
    const safe = patches('blueRock').concat(patches('goldRock')).filter((p) => p.every((c) => FLOWER_OF[c] === -1) && p.every((c) => yOf(c) >= 12 && xOf(c) < 20))
    expect(safe.length).toBeGreaterThanOrEqual(2)
  })

  it('has three ponds, each a rectangle of 2x2 or more that the pump fits, with a free grass cell beside its footprint for the belt', () => {
    expect(PONDS.length).toBe(3)
    expect(cells.filter((c) => GROUND[c] === 'pond').length).toBe(PONDS.reduce((n, p) => n + p.w * p.h, 0))
    for (const p of PONDS) {
      expect(p.w).toBeGreaterThanOrEqual(2)
      expect(p.h).toBeGreaterThanOrEqual(2)
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expect(GROUND[cellOf(x, y)]).toBe('pond')
      // A pump footprint on the pond's top-left 2x2 has a free neighbour outside the pond to start a belt from.
      const foot = [cellOf(p.x, p.y), cellOf(p.x + 1, p.y), cellOf(p.x, p.y + 1), cellOf(p.x + 1, p.y + 1)]
      const free = foot.flatMap((c) => DIRS.map((d) => stepCell(c, d))).filter((n) => n >= 0 && !foot.includes(n) && buildable(n) && GROUND[n] === 'grass')
      expect(free.length, `pond at ${p.x}, ${p.y}`).toBeGreaterThan(0)
    }
  })

  it('keeps the munchers off the pad and the ring round it, and steps between cells', () => {
    expect(PAD_RING.size).toBe(25)
    expect(PAD_RING.has(cellOf(BASKET.x, BASKET.y))).toBe(true)
    expect(stepCell(cellOf(0, 0), 2)).toBe(-1)
    expect(stepCell(cellOf(0, 0), 0)).toBe(cellOf(1, 0))
    expect(stepCell(cellOf(59, 35), 1)).toBe(-1)
    expect(stepCell(cellOf(59, 35), 0)).toBe(-1)
    expect(stepCell(cellOf(19, 11), 0)).toBe(cellOf(20, 11))
  })

  it("is one connected land: every burrow's door walks to the factory's core (the cells round the start oven and the pad's ring), and belts reach every free cell from the pad", () => {
    const s = blankState(1)
    const oven = new Set<number>()
    for (let y = START_OVEN.y; y < START_OVEN.y + 2; y++) for (let x = START_OVEN.x; x < START_OVEN.x + 2; x++) oven.add(cellOf(x, y))
    const walkable = (c: number) => !['pond', 'tree', 'burrow'].includes(GROUND[c]!) && !PAD_RING.has(c) && !oven.has(c)
    const core = cells.filter((c) => walkable(c) && DIRS.some((d) => PAD_RING.has(stepCell(c, d)) || oven.has(stepCell(c, d))))
    expect(core.length).toBeGreaterThan(15)
    const land = cells.filter(walkable)
    // Every walkable cell reaches every other: one piece.
    expect(reach([core[0]!], walkable).size).toBe(land.length)
    BURROWS.forEach((_, i) => {
      const door = doorCell(s, i)
      expect(walkable(door), `burrow ${i}'s door`).toBe(true)
      const walk = reach([door], walkable)
      for (const c of core) expect(walk.has(c), `burrow ${i} to core cell ${xOf(c)}, ${yOf(c)}`).toBe(true)
    })
    // Belts lie anywhere but ponds, trees, mounds and the basket: no island, so every patch and pond is reachable from the pad.
    const beltable = (c: number) => !['pond', 'tree', 'burrow', 'pad'].includes(GROUND[c]!) && c !== cellOf(BASKET.x, BASKET.y) && !oven.has(c)
    const pad = cells.filter((c) => GROUND[c] === 'pad')
    const sides = pad.flatMap((c) => DIRS.map((d) => stepCell(c, d))).filter((n) => n >= 0 && beltable(n))
    expect(reach(sides, beltable).size).toBe(cells.filter(beltable).length)
  })
})
