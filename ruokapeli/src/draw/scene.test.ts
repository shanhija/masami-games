/**
 * Runs the finale's backdrop and track for every course over the scene, over ranges a wide
 * or narrow screen shows, and over a very long time, on the fake context: no crash, no NaN,
 * the context left as found, no text and no gradient made per call. Holds the backdrop to
 * covering the whole range it is given down to the ground, and the track to lying along
 * the ground's top from TRACK_L - 0.8 to TRACK_R + 0.8 with the ground under it. Looks are
 * judged on ?sheet=scene.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { COURSES, FEED_GROUND, FEED_H, FEED_W, TRACK_L, TRACK_R } from '../game/model'
import { pen } from './look'
import { SHEET, drawBackdrop, drawTrack } from './scene'

afterEach(() => {
  pen.px = 64
})

/** Ranges a screen may show: the scene, wider and narrower ones, and ones off to the sides. */
const RANGES = [
  [0, FEED_W, 0, FEED_H],
  [-7, FEED_W + 7, -1.2, FEED_H + 0.6],
  [3.3, 9.1, 2, FEED_H],
  [-20, -4, 0, FEED_H],
  [14, 40, -3, FEED_H + 2],
] as const
const TIMES = [0, 0.5, 17.3, 1e5 + 0.4]

describe('the finale scene', () => {
  it('draws every course over every range and moment, leaving the context as it found it', () => {
    const { ctx, check } = fakeContext()
    for (const px of [20, 70])
      for (const course of COURSES)
        for (const [x0, x1, y0, y1] of RANGES)
          for (const t of TIMES) {
            pen.px = px
            check(`backdrop ${course} ${x0}..${x1} ${t}`, () => drawBackdrop(ctx, course, x0, x1, y0, y1, t), 'none')
            check(`track ${course} ${x0}..${x1} ${t}`, () => drawTrack(ctx, course, x0, x1, t), 'none')
          }
  })

  it('fills the whole range behind the track with sky and land', () => {
    const { ctx, measure } = fakeContext()
    for (const course of COURSES)
      for (const [x0, x1, y0, y1] of RANGES)
        for (const t of TIMES) {
          const b = measure(() => drawBackdrop(ctx, course, x0, x1, y0, y1, t))
          expect(b.x0, `${course} ${x0}..${x1}`).toBeLessThanOrEqual(x0)
          expect(b.x1, `${course} ${x0}..${x1}`).toBeGreaterThanOrEqual(x1)
          expect(b.y0, `${course} ${x0}..${x1}`).toBeLessThanOrEqual(y0)
          expect(b.y1, `${course} ${x0}..${x1}`).toBeGreaterThanOrEqual(FEED_GROUND)
        }
  })

  it('lays the track along the ground from TRACK_L - 0.8 to TRACK_R + 0.8, the ground under it down past the scene', () => {
    const { ctx, measure } = fakeContext()
    for (const course of COURSES)
      for (const [x0, x1] of RANGES) {
        const b = measure(() => drawTrack(ctx, course, x0, x1, 0.3))
        expect(b.x0).toBeLessThanOrEqual(Math.min(x0, TRACK_L - 0.8))
        expect(b.x1).toBeGreaterThanOrEqual(Math.max(x1, TRACK_R + 0.8))
        expect(b.y0).toBeGreaterThan(FEED_GROUND - 0.9)
        expect(b.y1).toBeGreaterThanOrEqual(FEED_H)
      }
  })

  it('draws its sheet', () => {
    const { ctx, check } = fakeContext()
    for (const e of SHEET()) for (const t of [0, 2.2]) check(e.label, () => e.draw(ctx, t), 'none')
  })
})
