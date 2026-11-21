/**
 * Runs the five places' ground, water shine and solids on the fake context, over hand-made
 * maps and maps made from seeds with every kind of ground beside every other, so art
 * written without looking cannot crash, draw NaN, leave the context changed or reach for
 * an API that does not work everywhere. Holds the ground to its tile (the renderer bakes
 * it tile by tile), the solids to their column, and every tile to the same drawing each
 * time. Looks are judged on ?sheet=world.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { clipped, fakeContext } from '../../../cat-hat-builder/src/draw/fakeContext'
import { COURSES, SOLID, groundAt, type Course, type Ground } from '../game/model'
import { pen } from './look'
import { ACROSS, ALONE_MAPS, SAMPLE, SHEET, drawGround, drawSolid, drawWaterShine, mapCourse } from './world'

afterEach(() => {
  pen.px = 64
})

const LETTERS = 'ggggppffbwwwHHHTR'

/** A map of every kind of ground side by side, made from a seed (the same every run). */
function seeded(seed: number, cols: number, rows: number): string[] {
  let s = seed * 2654435761
  const next = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 4294967296
  }
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => LETTERS[Math.floor(next() * LETTERS.length)]!).join(''))
}

const MAPS: readonly (readonly string[])[] = [SAMPLE, ACROSS, ...Object.values(ALONE_MAPS), ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) => seeded(seed, 7, 6)), ['H'], ['w'], ['b'], ['HHH', 'HHH', 'HHH']]
const COURSE_MAPS: readonly Course[] = COURSES.flatMap((id) => MAPS.map((rows) => mapCourse(id, rows)))
const TIMES = [0, 0.4, 2.71, 1e5 + 0.13]

/** Every tile of a course and the ring of water round it. */
function* tiles(course: Course): Generator<[number, number, Ground]> {
  for (let r = -1; r <= course.rows; r++) for (let c = -1; c <= course.cols; c++) yield [c, r, groundAt(course, c, r)]
}

describe('the ground', () => {
  it('draws every tile of every place, and the water round it, leaving the context as it found it', { timeout: 120_000 }, () => {
    const { ctx, check } = fakeContext()
    for (const px of [16, 64, 160]) {
      pen.px = px
      for (const course of COURSE_MAPS)
        for (const [c, r] of tiles(course)) {
          check(`${course.id} ground (${c}, ${r})`, () => drawGround(ctx, course, c, r), 'none')
          for (const t of TIMES) check(`${course.id} shine (${c}, ${r}) ${t}`, () => drawWaterShine(ctx, course, c, r, t), 'none')
        }
    }
  })

  it('stays inside its tile, the water shine too', { timeout: 60_000 }, () => {
    const { ctx, measure } = fakeContext()
    const out: string[] = []
    const inside = (what: string, b: { x0: number; y0: number; x1: number; y1: number }) => {
      if (b.x0 > b.x1) return
      if (b.x0 < -1e-6 || b.y0 < -1e-6 || b.x1 > 1 + 1e-6 || b.y1 > 1 + 1e-6) out.push(`${what}: ${b.x0.toFixed(3)}..${b.x1.toFixed(3)} x ${b.y0.toFixed(3)}..${b.y1.toFixed(3)}`)
    }
    for (const course of COURSE_MAPS)
      for (const [c, r, g] of tiles(course)) {
        inside(`${course.id} ${g} (${c}, ${r})`, measure(() => drawGround(clipped(ctx), course, c, r)))
        for (const t of TIMES) inside(`${course.id} shine (${c}, ${r}) ${t}`, measure(() => drawWaterShine(ctx, course, c, r, t)))
      }
    expect(out).toEqual([])
  })

  it('shines only on water', () => {
    const { ctx, measure } = fakeContext()
    for (const course of COURSE_MAPS)
      for (const [c, r, g] of tiles(course)) {
        const b = measure(() => drawWaterShine(ctx, course, c, r, 1.3))
        if (g !== 'water') expect(b.x0 > b.x1, `${course.id} ${g} (${c}, ${r})`).toBe(true)
      }
  })

  it('draws a tile the same every time: its tufts, pebbles and flowers come from where it is', () => {
    const record = (course: Course, c: number, r: number) => {
      const { ctx } = fakeContext()
      const calls: string[] = []
      const spy = new Proxy(ctx, {
        get: (target, key: string) => {
          const v = Reflect.get(target, key) as unknown
          return typeof v === 'function' ? (...a: unknown[]) => (calls.push(`${key}(${a.join(',')})`), (v as (...x: unknown[]) => unknown)(...a)) : v
        },
        set: (target, key, value) => (calls.push(`${String(key)}=${String(value)}`), Reflect.set(target, key, value)),
      })
      drawGround(spy, course, c, r)
      return calls
    }
    for (const course of COURSE_MAPS.slice(0, 20)) for (const [c, r] of tiles(course)) expect(record(course, c, r)).toEqual(record(course, c, r))
  })
})

describe('the solids', () => {
  it('draws every solid of every place at every moment, leaving the context as it found it', { timeout: 120_000 }, () => {
    const { ctx, check } = fakeContext()
    for (const px of [16, 64, 160]) {
      pen.px = px
      for (const course of COURSE_MAPS)
        for (const [c, r, g] of tiles(course)) if (SOLID[g]) for (const t of TIMES) check(`${course.id} ${g} (${c}, ${r}) ${t}`, () => drawSolid(ctx, course, c, r, t), 'none')
    }
  })

  it('stands in its column (hedges and rocks within 0.6 of the middle, trees within 1.1), on its tile, trees about 2.3 tall', { timeout: 60_000 }, () => {
    const { ctx, measure } = fakeContext()
    const out: string[] = []
    for (const course of COURSE_MAPS)
      for (const [c, r, g] of tiles(course)) {
        if (!SOLID[g]) continue
        for (const t of TIMES) {
          const b = measure(() => drawSolid(clipped(ctx), course, c, r, t))
          const half = g === 'tree' ? 1.1 : 0.6
          const tall = g === 'tree' ? b.y0 < -2.5 || b.y0 > -1.9 : b.y0 < -2.1
          if (b.x0 < -half || b.x1 > half || b.y1 > 0.05 || tall) out.push(`${course.id} ${g} (${c}, ${r}) ${t}: ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} x ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`)
        }
      }
    expect(out).toEqual([])
  })

  it('joins a hedge to its neighbours: a hedge in the middle of a run reaches both edges of its tile', () => {
    const { ctx, measure } = fakeContext()
    for (const id of COURSES) {
      const run = mapCourse(id, ['HHH'])
      const b = measure(() => drawSolid(clipped(ctx), run, 1, 0, 0))
      expect(b.x0, id).toBeLessThanOrEqual(-0.5 + 1e-6)
      expect(b.x1, id).toBeGreaterThanOrEqual(0.5 - 1e-6)
    }
  })

  it('refuses a tile that is not solid', () => {
    const { ctx } = fakeContext()
    expect(() => drawSolid(ctx, mapCourse('park', ['g']), 0, 0, 0)).toThrow(/not solid/)
  })
})

describe('the sheet', () => {
  it('draws every place', () => {
    const { ctx, check } = fakeContext()
    for (const e of SHEET()) for (const t of [0, 1.7]) check(e.label, () => e.draw(ctx, t), 'none')
  })
})
