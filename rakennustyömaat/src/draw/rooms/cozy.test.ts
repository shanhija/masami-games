/**
 * Runs the cozy themes' art (sleep, cat, kitchen) on the fake context: every wallpaper and
 * floor in its four colourings at a small, a wide and a tall room, and every item idle and
 * through a whole tap reaction at street, room and close-up sizes, so art written without
 * looking cannot crash, draw NaN, leave the context changed or reach for an API that does not
 * work everywhere; holds each item inside its slot box (with 10% to spare), and checks each
 * reaction settles back to the idle picture. art.test.ts follows every item frame by frame
 * through tap after tap. Looks are judged on ?sheet=rooms.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ITEMS, themeItems } from '../../game/items'
import { SLOT_BOX } from '../../game/layout'
import { fakeContext } from '../fakeContext'
import { pen } from '../look'
import { itemArt } from './art'
import { COZY_ART } from './cozy'

/** CSS px per metre: the street, the plot view, the room view of a big room and of a small one, a close-up. */
const SCALES = [40, 80, 100, 180, 400] as const
/** Inside sizes (w x h) of a small, a wide and a tall room. */
const ROOMS = [
  [2.16, 2.1],
  [4.56, 2.1],
  [2.16, 4.5],
] as const
/** Sim times, including a long session and a huge one. */
const TIMES = [0, 0.37, 1.9, 7.25, 3600.4, 1e7] as const
/** Tap ages: never, through the reaction, settled, long after, never again. */
const PLAYS = [-1, 0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.45, 1.6, 2.5, 60, 1e9, Infinity] as const

const THEMES = Object.keys(COZY_ART) as (keyof typeof COZY_ART)[]
const itemsOf = (theme: keyof typeof COZY_ART) => themeItems(theme).map((id) => [id, itemArt(id)] as const)

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

describe('the cozy themes', () => {
  it('have art for exactly their items, four distinct swatches and a glow', () => {
    for (const theme of THEMES) {
      expect(Object.keys(COZY_ART[theme].items).sort(), theme).toEqual(themeItems(theme).sort())
      expect(new Set(COZY_ART[theme].swatches).size, theme).toBe(4)
      expect(COZY_ART[theme].glow, theme).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('draw every wallpaper and floor colouring at every room size and zoom', () => {
    const { ctx, check } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const theme of THEMES)
        for (const v of [0, 1, 2, 3] as const)
          for (const [w, h] of ROOMS)
            for (const t of [0, 5.5]) {
              check(`${theme} wall ${v} ${w}x${h}`, () => COZY_ART[theme].wall(ctx, w, h, t, v), 'none')
              check(`${theme} floor ${v} ${w}`, () => COZY_ART[theme].floor(ctx, w, t, v), 'none')
            }
    }
  })

  // Every tap age at every zoom, the time turning from one age to the next: each age meets most of the times, each zoom all of them. One check holds an item's ages at a zoom together: an age that leaves the context changed leaves it changed at the end of them too.
  it('draw every item idle and through its tap, at every zoom and time, inside its slot box with 10% to spare', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const theme of THEMES)
        for (const [id, draw] of itemsOf(theme)) {
          const b = SLOT_BOX[ITEMS[id].slot]
          const mx = (b.x1 - b.x0) * 0.1
          const my = (b.y1 - b.y0) * 0.1
          check(
            `${id} through its tap at ${ppm} px/m`,
            () =>
              PLAYS.forEach((play, i) => {
                const t = TIMES[(i + s) % TIMES.length]!
                const m = measure(() => draw(ctx, t, play))
                if (m.x0 < b.x0 - mx || m.x1 > b.x1 + mx || m.y0 < b.y0 - my || m.y1 > b.y1 + my) out.push(`${id} at t ${t}, play ${play}, ${ppm} px/m: x ${m.x0.toFixed(3)} to ${m.x1.toFixed(3)}, y ${m.y0.toFixed(3)} to ${m.y1.toFixed(3)}`)
              }),
            'none',
          )
        }
    })
    expect(out).toEqual([])
  })

  it('settle every tap back to the idle picture within 1.5 s', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 180
    for (const theme of THEMES)
      for (const [id, draw] of itemsOf(theme))
        for (const t of [0, 1.3, 4.6]) {
          const idle = measure(() => draw(ctx, t, -1))
          for (const play of [1.5, 3, 1e6, Infinity]) {
            const m = measure(() => draw(ctx, t, play))
            // A spin of one whole turn lands back on the same angle up to rounding.
            for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(m[k], `${id} at t ${t}, ${play} s after a tap: ${k}`).toBeCloseTo(idle[k], 9)
          }
        }
  })
})
