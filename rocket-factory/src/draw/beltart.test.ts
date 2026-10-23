/**
 * Runs the belts on the fake context: every lane (four straight, eight bends) with every cap,
 * fork, join, bridge and pattern; their moving marks at every phase; the bridges, paddles and
 * zips; a cell popping in and one curling away at every moment; hedges with every link, bite
 * and stump; the stroke ghost, every end sign and the hint's path. Nothing may crash, draw NaN,
 * leave the context changed, draw text or make a gradient, and each drawing stays in its cell
 * (or its own box). Holds the belts to their promises: the picture data read off the belt
 * arrays (caps where nothing feeds or takes, the zips' sides), every moving cell's marks as one
 * path, the same marks for the same hops (a jam stands still) and moved ones for more, a bridge
 * only where there is one. Looks are judged on ?sheet=beltart.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { cellOf, xOf, yOf } from '../game/board'
import { PATTERNS } from '../game/catalog'
import { CELLS, SLOTS, opposite, type Belts, type Dir } from '../game/model'
import type { Box } from '../game/where'
import {
  CURL,
  END_SIGNS,
  POP,
  SHEET,
  beltPic,
  drawBeltCurl,
  drawBeltMarks,
  drawBeltPop,
  drawBelts,
  drawBridges,
  drawEndSign,
  drawHedges,
  drawHintPath,
  drawPaddle,
  drawStrokeGhost,
  drawZip,
  hedgeLinks,
  type BeltPic,
  type HedgePic,
} from './beltart'
import { calls, clipped, edges, fakeContext, poking as pokingOut, resetPen } from './fakeContext'
import { BELT, C, pen } from './look'

afterEach(resetPen)

const DIRS = [0, 1, 2, 3] as const
/** Every lane a cell can have: in side and out side, never the same. */
const LANES = DIRS.flatMap((i) => DIRS.filter((o) => o !== i).map((o) => [i, o] as const))
const HOPS = [0, 0.3, 1, 7.5, 12, 1e5 + 0.5] as const
const AGES = [0, 0.05, 0.12, 0.2, 0.3, 0.34, 0.5, 1, 1e4, Infinity] as const
const C0 = cellOf(5, 5)
const cellBox = (c: number, grow: number): Box => ({ x: xOf(c) - grow, y: yOf(c) - grow, w: 1 + 2 * grow, h: 1 + 2 * grow })

/** Where a measured box pokes out of the box `r`, as sentences; none when it is inside. */
const poking = (what: string, b: { x0: number; y0: number; x1: number; y1: number }, r: Box) => pokingOut(what, b, edges(r, 0), 1e-9)

/** Every picture a cell's lane can have: plain, with caps, a fork to either side, joins, a bridge, each pattern taking turns. */
function pics(c: number): BeltPic[] {
  const out: BeltPic[] = []
  let k = 0
  for (const [i, o] of LANES) {
    const sides = DIRS.filter((d) => d !== i && d !== o)
    const straight = i === opposite(o)
    for (const start of [false, true])
      for (const end of [false, true]) {
        const base = { cell: c, in: i, out: o, fork: -1, over: -1, joins: [], pattern: k++ % PATTERNS.length, start, end } as BeltPic
        out.push(base)
        if (straight) for (const d of sides) out.push({ ...base, fork: d, pattern: k++ % PATTERNS.length }, { ...base, over: d, pattern: k++ % PATTERNS.length })
        out.push({ ...base, joins: sides.slice(0, 1) }, { ...base, joins: sides })
      }
  }
  return out
}
const label = (p: BeltPic) => `${p.in}>${p.out}${p.fork !== -1 ? ` fork ${p.fork}` : ''}${p.over !== -1 ? ` over ${p.over}` : ''}${p.joins.length ? ` joins ${p.joins.join('')}` : ''}${p.start ? ' start' : ''}${p.end ? ' end' : ''} ${PATTERNS[p.pattern]}`

/** Belt arrays with nothing on them. */
function emptyBelts(): Belts {
  return {
    out: new Int8Array(CELLS).fill(-1),
    in: new Int8Array(CELLS).fill(-1),
    fork: new Int8Array(CELLS).fill(-1),
    over: new Int8Array(CELLS).fill(-1),
    pattern: new Uint8Array(CELLS),
    joinTurn: new Uint8Array(CELLS),
    forkTurn: new Uint8Array(CELLS),
    moved: new Int32Array(CELLS),
    blockedSince: new Int32Array(2 * CELLS).fill(-1),
    laidAt: new Int32Array(CELLS).fill(-1),
    turnedAt: new Int32Array(CELLS).fill(-1),
    slot: new Int8Array(SLOTS).fill(-1),
    from: new Int16Array(SLOTS).fill(-1),
  }
}
const lay = (b: Belts, c: number, i: Dir, o: Dir) => {
  b.in[c] = i
  b.out[c] = o
}

describe('the picture data', () => {
  it('caps a belt where nothing feeds it and where nothing takes from it, and zips the sides other belts join', () => {
    const belts = emptyBelts()
    const owner = new Int16Array(CELLS).fill(-1)
    // A run east from (2, 2) to (5, 2); a belt joining (4, 2) from the south; (5, 2) ends at a building's edge at (6, 2).
    for (let x = 2; x <= 5; x++) lay(belts, cellOf(x, 2), 2, 0)
    lay(belts, cellOf(4, 3), 1, 3)
    owner[cellOf(6, 2)] = 7
    const at = (x: number, y: number) => beltPic(belts, owner, cellOf(x, y))
    expect([at(2, 2).start, at(2, 2).end]).toEqual([true, false])
    expect([at(3, 2).start, at(3, 2).end]).toEqual([false, false])
    expect(at(4, 2).joins).toEqual([1])
    expect([at(5, 2).start, at(5, 2).end], 'into a mouth').toEqual([false, false])
    expect([at(4, 3).start, at(4, 3).end], 'the joining belt').toEqual([true, false])
    // A belt starting at a building's edge (a spout) has no start cap; one ending on nothing has its arrowhead.
    lay(belts, cellOf(7, 2), 2, 0)
    owner[cellOf(6, 2)] = 7
    expect([at(7, 2).start, at(7, 2).end]).toEqual([false, true])
    // A bridge's over lane feeds the cell it points at, and a fork's side takes from it.
    lay(belts, cellOf(10, 5), 2, 0)
    belts.over[cellOf(10, 5)] = 1
    lay(belts, cellOf(10, 6), 3, 1)
    expect(at(10, 6).start, 'fed over the bridge').toBe(false)
    lay(belts, cellOf(12, 8), 2, 0)
    belts.fork[cellOf(12, 8)] = 1
    lay(belts, cellOf(12, 9), 3, 1)
    expect(at(12, 8).end, 'its side takes things on').toBe(false)
    expect(at(12, 8).joins, 'its side is its own way out, not a join').toEqual([])
    // A tower stands on a belt cell: its belt decides, so a belt starting beside it, fed by nothing, still has its cap.
    lay(belts, cellOf(14, 4), 3, 1)
    owner[cellOf(14, 4)] = 9
    lay(belts, cellOf(15, 4), 2, 0)
    expect(at(15, 4).start, 'beside a tower whose belt runs past').toBe(true)
    lay(belts, cellOf(14, 5), 3, 1)
    expect(at(14, 5).start, 'fed through the tower').toBe(false)
    expect(() => at(15, 8)).toThrow(/no belt/)
  })

  it('links a hedge to the hedges beside it, never to a stump', () => {
    const hedge = new Uint8Array(CELLS)
    for (const c of [cellOf(3, 3), cellOf(4, 3), cellOf(4, 4)]) hedge[c] = 1
    hedge[cellOf(2, 3)] = 2
    expect(hedgeLinks(hedge, cellOf(3, 3))).toBe(1 << 0)
    expect(hedgeLinks(hedge, cellOf(4, 3))).toBe((1 << 2) | (1 << 1))
    expect(hedgeLinks(hedge, cellOf(0, 0))).toBe(0)
  })
})

describe('the belts', () => {
  it('draw every lane with every cap, fork, join, bridge and pattern, at the game\'s sizes, inside its cell', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const ppm of [30, 50, 80]) {
      pen.ppm = ppm
      for (const p of pics(C0)) {
        const b = measure(() => check(label(p), () => drawBelts(clipped(ctx), [p]), 'none'))
        // Its body stays in the cell; its flat shadow reaches down and right.
        out.push(...poking(label(p), b, { x: xOf(C0) - 0.02, y: yOf(C0) - 0.02, w: 1.04 + pen.shadowX, h: 1.04 + pen.shadowY }))
      }
    }
    expect(out).toEqual([])
  })

  it('fill every body as one shape and every shadow as one, however many cells', () => {
    const { ctx, counts } = fakeContext()
    const row = Array.from({ length: 12 }, (_, k) => ({ cell: cellOf(2 + k, 3), in: 2, out: 0, fork: -1, over: -1, joins: [], pattern: 0, start: k === 0, end: k === 11 }) as BeltPic)
    drawBelts(ctx, row)
    expect(counts.fill).toBe(2)
  })

  it('draw their moving marks at every phase inside their cells, as one path of ticks and one of chevrons', () => {
    const { ctx, check, measure, counts } = fakeContext()
    const out: string[] = []
    const all = pics(C0)
    for (const hops of HOPS) {
      const before = counts.stroke ?? 0
      check(`marks at ${hops}`, () => drawBeltMarks(ctx, all.map((pic) => ({ pic, hops }))), 'none')
      expect((counts.stroke ?? 0) - before, 'two strokes for all of them').toBe(2)
      for (const p of all) out.push(...poking(`${label(p)} at ${hops}`, measure(() => drawBeltMarks(ctx, [{ pic: p, hops }])), cellBox(C0, 0)))
    }
    expect(out).toEqual([])
  })

  it('stand still in a jam and move on with the hops, ticks pointing downstream all the while', () => {
    const p: BeltPic = { cell: C0, in: 2, out: 0, fork: -1, over: -1, joins: [], pattern: 0, start: false, end: false }
    const at = (hops: number) => calls((ctx) => drawBeltMarks(ctx, [{ pic: p, hops }]))
    expect(at(7)).toEqual(at(7))
    expect(at(7)).not.toEqual(at(7.5))
    // Two hops later every mark is back where it was: a whole lane on.
    expect(at(7)).toEqual(at(9))
    // The chevrons point east: each one's tip is right of its arms.
    const pts = at(3)
      .filter((c) => c.startsWith('moveTo') || c.startsWith('lineTo'))
      .map((c) => c.slice(c.indexOf('(') + 1, -1).split(',').map(Number))
    for (let k = 0; k < pts.length; k += 3) {
      expect(pts[k + 1]![0]!).toBeGreaterThan(pts[k]![0]!)
      expect(pts[k + 1]![0]!).toBeGreaterThan(pts[k + 2]![0]!)
    }
  })

  it('draw the bridges only where there are bridges, inside their cells and their long shadow', () => {
    const { ctx, check, measure, counts } = fakeContext()
    const plain: BeltPic = { cell: C0, in: 2, out: 0, fork: -1, over: -1, joins: [], pattern: 0, start: false, end: false }
    drawBridges(ctx, [{ pic: plain, hops: 3 }])
    expect(counts.fill ?? 0).toBe(0)
    for (const [i, o] of LANES.filter(([a, b]) => a === opposite(b)))
      for (const d of DIRS.filter((d) => d !== i && d !== o))
        for (const hops of HOPS) {
          const p = { ...plain, in: i, out: o, over: d } as BeltPic
          const b = measure(() => check(`bridge ${label(p)} at ${hops}`, () => drawBridges(clipped(ctx), [{ pic: p, hops }]), 'none'))
          expect(poking(label(p), b, { x: xOf(C0), y: yOf(C0), w: 1 + pen.shadowX * 2.2, h: 1 + pen.shadowY * 2.2 })).toEqual([])
        }
  })

  it('flip a fork\'s paddle and close a join\'s zip a tooth at a time, inside the cell', () => {
    const { ctx, check, measure } = fakeContext()
    for (const p of pics(C0)) {
      if (p.fork !== -1)
        for (const k of [0, 0.25, 0.5, 0.9, 1]) expect(poking(`paddle ${label(p)} ${k}`, measure(() => check(`paddle ${k}`, () => drawPaddle(clipped(ctx), p, k), 'none')), cellBox(C0, 0))).toEqual([])
      for (const d of p.joins)
        for (let merges = 0; merges < 13; merges++) expect(poking(`zip ${label(p)} ${merges}`, measure(() => check(`zip ${merges}`, () => drawZip(clipped(ctx), p, d, merges), 'none')), cellBox(C0, 0))).toEqual([])
    }
    const plain: BeltPic = { cell: C0, in: 2, out: 0, fork: -1, over: -1, joins: [], pattern: 0, start: false, end: false }
    expect(() => drawPaddle(ctx, plain, 0)).toThrow(/not a fork/)
    expect(() => drawZip(ctx, plain, 1, 0)).toThrow(/no join/)
    // Each merge closes one more tooth, and the sixth opens them all again.
    const zipped = { ...plain, joins: [1] as Dir[] }
    expect(calls((c) => drawZip(c, zipped, 1, 2))).not.toEqual(calls((c) => drawZip(c, zipped, 1, 3)))
    expect(calls((c) => drawZip(c, zipped, 1, 0))).toEqual(calls((c) => drawZip(c, zipped, 1, 6)))
  })

  it('pop a new cell in from a little above, and curl a rolled-up one away until nothing is left', () => {
    const { ctx, check, measure } = fakeContext()
    for (const p of pics(C0).filter((_, k) => k % 3 === 0))
      for (const age of AGES) {
        const pop = measure(() => check(`pop ${label(p)} at ${age}`, () => drawBeltPop(clipped(ctx), p, age), 'none'))
        // Grown 1.14 about its middle, a start cap round a bend a hair past its edge (as in the bake), its lifted shadow long.
        expect(poking(`pop ${label(p)} at ${age}`, pop, cellBox(C0, 0.07 + 0.02 + 0.06 * 3.5))).toEqual([])
        const curl = measure(() => check(`curl ${label(p)} at ${age}`, () => drawBeltCurl(clipped(ctx), p, age), 'none'))
        if (age < CURL) expect(poking(`curl ${label(p)} at ${age}`, curl, cellBox(C0, 0.1))).toEqual([])
        else expect(curl.x0, `curl at ${age}: gone`).toBeGreaterThan(curl.x1)
      }
    // A settled pop is the bake's own cell.
    const p = pics(C0)[0]!
    expect(calls((c) => drawBeltPop(c, p, POP)).filter((c) => !c.startsWith('save') && !c.startsWith('restore') && !c.startsWith('translate') && !c.startsWith('scale')).length).toBeGreaterThan(0)
  })
})

describe('the hedges', () => {
  it('draw every link, bite and stump, sprouting, inside their cells and a touch into a linked neighbour', () => {
    const { ctx, check, measure } = fakeContext()
    for (let links = 0; links < 16; links++)
      for (let bites = 0; bites <= 3; bites++)
        for (const [stump, sprout] of [
          [false, 0],
          [true, 0],
          [true, 0.5],
          [true, 1],
        ] as const) {
          const h: HedgePic = { cell: C0, stump, links: stump ? 0 : links, bites, sprout }
          const b = measure(() => check(`hedge ${links} ${bites} ${stump} ${sprout}`, () => drawHedges(clipped(ctx), [h]), 'none'))
          expect(poking(`hedge ${links} ${bites} ${stump}`, b, { x: xOf(C0) - 0.1, y: yOf(C0) - 0.1, w: 1.2 + pen.shadowX, h: 1.2 + pen.shadowY })).toEqual([])
        }
  })

  it('draw a line of hedges as one leafy sticker: one shadow, one rim, one body', () => {
    const hedge = new Uint8Array(CELLS)
    const line = [cellOf(2, 2), cellOf(3, 2), cellOf(4, 2), cellOf(4, 3)]
    for (const c of line) hedge[c] = 1
    const { ctx, counts } = fakeContext()
    drawHedges(
      ctx,
      line.map((cell) => ({ cell, stump: false, links: hedgeLinks(hedge, cell), bites: 0, sprout: 0 })),
    )
    // The die-cut (shadow and rim: two fills), the body, the light leaves and the dark ones.
    expect(counts.fill).toBe(5)
  })
})

describe('the stroke, its sign and the hint', () => {
  it('draw the stroke ghost, see-through and grey past where it stops, popping cell by cell', () => {
    const { ctx, check, measure } = fakeContext()
    const cells = LANES.map(([i, o], k) => ({ cell: cellOf(1 + (k % 6), 1 + Math.floor(k / 6)), in: i, out: o, age: AGES[k % AGES.length]!, grey: k > 7 }))
    for (const t of [0, 0.4, 1e5]) {
      const b = measure(() => check(`ghost at ${t}`, () => drawStrokeGhost(clipped(ctx), cells, t), 'none'))
      expect(poking(`ghost at ${t}`, b, { x: 1, y: 1, w: 6, h: 2 })).toEqual([])
      const used: string[] = []
      const spy = new Proxy(ctx, {
        get: (target, key: string) => (key === 'fill' ? () => used.push(String(target.fillStyle)) : (Reflect.get(target, key) as unknown as (...a: unknown[]) => unknown)),
        set: (target, key, value) => Reflect.set(target, key, value),
      })
      drawStrokeGhost(spy, cells, t)
      expect(used).toEqual([BELT.ghost, BELT.stop])
    }
  })

  it('draw every end sign at every size as a round sticker in its own box', () => {
    const { ctx, check, measure } = fakeContext()
    for (const sign of END_SIGNS)
      for (const px of [44, 56, 80, 160]) {
        pen.ppm = 50
        const size = px / pen.ppm
        const b = measure(() => check(`${sign} ${px}`, () => drawEndSign(clipped(ctx), sign, size), 'none'))
        const shadow = 0.06 * (1 + 0.3 * 2.5)
        expect(poking(`${sign} ${px}`, b, { x: -size / 2, y: -size / 2, w: size + shadow, h: size + shadow })).toEqual([])
      }
  })

  it('march the hint\'s dots along its path, inside its cells, at every moment, and as far along it as the hand has traced', () => {
    const { ctx, check, measure } = fakeContext()
    const path = [cellOf(2, 2), cellOf(3, 2), cellOf(4, 2), cellOf(4, 3), cellOf(4, 4), cellOf(5, 4)]
    for (let n = 1; n <= path.length; n++)
      for (const t of [0, 0.13, 0.37, 2.9, 1e5 + 0.21])
        for (const reach of [0, 0.3, 0.77, 1]) {
          const b = measure(() => check(`hint ${n} at ${t}, ${reach} of it`, () => drawHintPath(clipped(ctx), path.slice(0, n), t, reach), 'none'))
          expect(poking(`hint ${n} at ${t}, ${reach} of it`, b, { x: 2, y: 2, w: 4, h: 3 })).toEqual([])
        }
    // Traced a third of the way, the path reaches no further than the third cell: its chevron rides with the fingertip.
    const third = measure(() => drawHintPath(ctx, path, 0.2, 1 / 3))
    expect(third.x1).toBeLessThan(4.62)
    expect(third.y1).toBeLessThan(2.7)
    expect(calls((c) => drawHintPath(c, path, 0.1, 1))).not.toEqual(calls((c) => drawHintPath(c, path, 0.3, 1)))
    expect(calls((c) => drawHintPath(c, path, 0.1, 0.5))).not.toEqual(calls((c) => drawHintPath(c, path, 0.1, 1)))
    expect(() => drawHintPath(ctx, [], 0, 1)).toThrow(/no cells/)
    expect(C.hint).not.toBe(C.hintShadow)
  })
})

describe('the sheet', () => {
  it('draws every entry of the belts', () => {
    const { ctx, check } = fakeContext()
    SHEET().forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 2.6] : [1.1, 9.7]) check(`beltart: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    })
  })
})
