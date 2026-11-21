/**
 * Runs the street's draw functions (the backdrop, the ground and its lamps, the garage, the
 * mirror, each plot's ground, the crane and the bulldozer, and the street sheet) over their
 * cases on the fake context, at street, cab, room and mirror sizes and at times far into a
 * session, so art written without looking cannot crash, draw NaN, leave the context changed
 * or reach for an API that does not work everywhere; and holds each drawing to the box its
 * doc comment states. Looks are judged on ?sheet=street and in the game.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { View } from '../game/camera'
import { GARAGE_W, PLOT_W } from '../game/layout'
import { fakeContext } from './fakeContext'
import { pen } from './look'
import { STREET_SHEET, drawBulldozer, drawCrane, drawGarage, drawMirror, drawPlotGround, drawStreetBackdrop, drawStreetGround } from './street'

/** CSS px per metre: the street, the cab, the room view, the mirror. */
const SCALES = [40, 80, 160, 400] as const
/** Sim times: the start, a moment, a minute, a long session. */
const TIMES = [0, 0.37, 61.3, 1e5] as const
const EVENINGS = [0, 0.2, 0.5, 0.75, 1] as const

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** Expects the measured box inside (x0, y0)-(x1, y1); a flat ground shadow `w` wide reaches 0.06 w under the ground (look.ts groundShadow), and the fake context measures it exactly. */
function within(what: string, b: { x0: number; y0: number; x1: number; y1: number }, x0: number, y0: number, x1: number, y1: number) {
  expect(b.x0, `${what}: left`).toBeGreaterThanOrEqual(x0)
  expect(b.y0, `${what}: top`).toBeGreaterThanOrEqual(y0)
  expect(b.x1, `${what}: right`).toBeLessThanOrEqual(x1)
  expect(b.y1, `${what}: bottom`).toBeLessThanOrEqual(y1)
}

describe('the backdrop', () => {
  it('draws for every shot of the street, at every time of day', () => {
    const { ctx, check } = fakeContext()
    const views: View[] = [
      { w: 1180, h: 820, dpr: 2, ppm: 42, x0: 0, y0: -16.8 },
      { w: 1180, h: 820, dpr: 2, ppm: 42, x0: 123.4, y0: -16.8 },
      { w: 820, h: 1180, dpr: 2, ppm: 54, x0: 48, y0: -20 },
      { w: 1180, h: 820, dpr: 1, ppm: 175, x0: 50.2, y0: -14.4 },
      { w: 1180, h: 820, dpr: 2, ppm: 267, x0: 7.6, y0: -2.25 },
      { w: 2560, h: 600, dpr: 3, ppm: 30, x0: 300, y0: -14 },
      { w: 1, h: 1, dpr: 1, ppm: 42, x0: 0, y0: 0 },
    ]
    for (const view of views)
      for (const e of EVENINGS)
        for (const t of TIMES) {
          pen.ppm = view.ppm
          check(`${JSON.stringify(view)} evening ${e} at ${t}`, () => drawStreetBackdrop(ctx, view, t, e), 'none')
        }
  })
})

describe('the ground', () => {
  const spans = [
    [-1, 27],
    [11.5, 38.5],
    [40, 70],
    [60.5, 61.5],
    [100, 141],
  ] as const

  it('draws every stretch at every size and time of day', () => {
    const { ctx, check } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const [x0, x1] of spans) for (const e of EVENINGS) for (const t of [0, 1e5]) check(`ground ${x0} to ${x1} evening ${e}`, () => drawStreetGround(ctx, x0, x1, t, e), 'none')
    }
  })

  it('draws exactly from x0 to x1, its lamps under 4 m', () => {
    const { ctx, measure } = fakeContext()
    for (const [x0, x1] of spans)
      for (const e of [0, 1]) {
        const b = measure(() => drawStreetGround(ctx, x0, x1, 3, e))
        expect(b.x0, `${x0} left`).toBeCloseTo(x0, 9)
        expect(b.x1, `${x1} right`).toBeCloseTo(x1, 9)
        expect(b.y0, `${x0} top`).toBeGreaterThanOrEqual(-4)
      }
  })
})

describe('the garage and the mirror', () => {
  it('draws the garage by day and evening inside its GARAGE_W, its sign on the roof', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const e of EVENINGS)
        for (const t of TIMES) {
          check(`garage ${ppm} ${e} ${t}`, () => drawGarage(ctx, t, e), 'none')
          within(`garage ${ppm} ${e}`, measure(() => drawGarage(ctx, t, e)), -0.15, -7.4, GARAGE_W, 0.01)
        }
    }
  })

  it('keeps the mirror inside its tap target', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const t of [...TIMES, 1.6, 1.9, 2.2]) {
        check(`mirror ${ppm} ${t}`, () => drawMirror(ctx, t), 'none')
        within(`mirror ${ppm} ${t}`, measure(() => drawMirror(ctx, t)), -0.6, -2.05, 0.6, 0.08)
      }
    }
  })
})

describe('the plots', () => {
  /** Seconds since the bulldozer: on its way, just done, the fence and sign popping, settled, long ago, never. */
  const AGES = [0, 0.3, 1.2, 2.39, 2.4, 2.55, 2.75, 3.1, 6, 9, 1e4, Infinity] as const

  it('draws an empty, a tall and a row plot at every age, inside the plot and behind the pavement', () => {
    const { ctx, check, measure } = fakeContext()
    // Every age at every size, the moment turning from age to age.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const kind of [null, 'tall', 'row'] as const)
        AGES.forEach((age, a) => {
          const t = TIMES[(a + s) % TIMES.length]!
          within(`${kind} ${age} ${t} ${ppm}`, measure(() => check(`${kind} ${age} ${t} ${ppm}`, () => drawPlotGround(ctx, kind, age, t), 'none')), 0, -3.6, PLOT_W, 0.85)
        })
    })
  })

  it('shows no dirt ahead of the bulldozer blade while it levels', () => {
    const { ctx, measure } = fakeContext()
    for (const u of [0.1, 0.4, 0.8]) {
      const b = measure(() => drawPlotGround(ctx, null, u * 2.4, 0))
      expect(b.x1, `at ${u}`).toBeLessThanOrEqual(u * PLOT_W + 0.9)
    }
  })
})

describe('the crane and the bulldozer', () => {
  it('draws the crane short and tall, near and far, the hook high and low, inside its reach', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const height of [7, 7.6, 14.8])
        for (const reach of [2.1, 3.5, 9, 14.1])
          for (const drop of [0, 0.6, 3, 5.4]) {
            check(`crane ${height} ${reach} ${drop}`, () => drawCrane(ctx, height, reach, drop, 1.2), 'none')
            within(`crane ${height} ${reach} ${drop}`, measure(() => drawCrane(ctx, height, reach, drop, 1.2)), -2.8, -height - 1.9, reach + 2.2, 0.11)
          }
    }
  })

  it('draws the bulldozer across its whole run and long after', () => {
    const { ctx, check, measure } = fakeContext()
    // Every step of the run at every size, the moment turning from step to step.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (let u = 0, k = 0; u <= 1; u += 0.05, k++) {
        const t = TIMES[(k + s) % TIMES.length]!
        within(`bulldozer ${u} ${t} ${ppm}`, measure(() => check(`bulldozer ${u} ${t} ${ppm}`, () => drawBulldozer(ctx, u, t), 'none')), -1.35, -2.4, 2.3, 0.16)
      }
    })
  })
})

describe('the street sheet', () => {
  it('draws every entry', () => {
    const { ctx, check } = fakeContext()
    for (const entry of STREET_SHEET) for (const t of [0, 1.1, 2.6, 6.5]) check(`street: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
  })
})
