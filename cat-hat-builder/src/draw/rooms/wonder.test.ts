/**
 * Runs the wonder rooms' art (bath, space, sauna) on the fake context: every wallpaper and
 * floor in its four colourings at a room and a big room, and every item idle and all
 * through its tap, at street, plot, room and close-up sizes, so art written without looking
 * cannot crash, draw NaN, leave the context changed or reach for an API that does not work
 * everywhere; holds each item to its slot box (with 10% to spare) and has it come back to
 * exactly its idle picture once its tap has settled. Looks are judged on ?sheet=rooms.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ITEMS, themeItems } from '../../game/items'
import { SLOT_BOX } from '../../game/layout'
import { fakeContext } from '../fakeContext'
import { pen } from '../look'
import { itemArt } from './art'
import { WONDER_ART } from './wonder'

/** CSS px per metre: the street, the plot, the room view, a close look. */
const SCALES = [40, 80, 160, 400] as const
/** Sim times: the start, moments through the first seconds, and a long session. */
const TIMES = [0, 0.4, 0.73, 1.5, 2.2, 2.9, 86_400.4] as const
/** A tap's moments: never, every 0.05 s through it and past it, long after, and an age that never comes. */
const PLAYS = [-1, ...Array.from({ length: 50 }, (_, i) => i * 0.05), 4, 1e6, Infinity] as const
const THEMES = ['bath', 'space', 'sauna'] as const

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** Each theme's items with their drawings. */
const itemsOf = (theme: (typeof THEMES)[number]) => themeItems(theme).map((id) => [id, itemArt(id)] as const)

describe('the wonder rooms', () => {
  // Each colouring in both rooms at every size, the time turning from one to the next.
  it('draw every wallpaper and floor colouring, in a room and a big room, at every size', () => {
    const { ctx, check } = fakeContext()
    for (const theme of THEMES) {
      const art = WONDER_ART[theme]
      SCALES.forEach((ppm, s) => {
        pen.ppm = ppm
        for (const v of [0, 1, 2, 3] as const)
          for (const [r, [w, h]] of (
            [
              [2.16, 2.1],
              [4.56, 4.5],
            ] as const
          ).entries()) {
            const t = TIMES[(v + 2 * s + 3 * r) % TIMES.length]!
            check(`${theme} wall ${v} ${w} at ${t}, ${ppm} px/m`, () => art.wall(ctx, w, h, t, v), 'none')
            check(`${theme} floor ${v} ${w} at ${t}, ${ppm} px/m`, () => art.floor(ctx, w, t, v), 'none')
          }
      })
    }
  })

  it('give the paint pot four different wallpaper colours and a window glow', () => {
    for (const theme of THEMES) {
      const { swatches, glow } = WONDER_ART[theme]
      expect(new Set(swatches).size, theme).toBe(4)
      expect(glow, theme).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  // Every other tap moment at each size, a different half at the next, the time turning from one moment to the next: each moment meets two sizes and two times, each size every time.
  it('draw every item idle and all through its tap, at every size and time, inside its slot box with 10% to spare', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const theme of THEMES)
      for (const [id, draw] of itemsOf(theme)) {
        const b = SLOT_BOX[ITEMS[id].slot]
        const mx = (b.x1 - b.x0) * 0.1
        const my = (b.y1 - b.y0) * 0.1
        SCALES.forEach((ppm, s) => {
          pen.ppm = ppm
          // One check holds an item's moments at a size together: a moment that leaves the context changed leaves it changed at the end of them too.
          check(
            `${id} through its tap at ${ppm} px/m`,
            () =>
              PLAYS.forEach((play, i) => {
                if ((i + s) % 2 !== 0) return
                const t = TIMES[(i + s) % TIMES.length]!
                const m = measure(() => draw(ctx, t, play))
                if (m.x0 < b.x0 - mx || m.x1 > b.x1 + mx || m.y0 < b.y0 - my || m.y1 > b.y1 + my) out.push(`${id} at ${t}, played ${play}, ${ppm} px/m: x ${m.x0.toFixed(3)} to ${m.x1.toFixed(3)}, y ${m.y0.toFixed(3)} to ${m.y1.toFixed(3)}`)
              }),
            'none',
          )
        })
      }
    expect(out).toEqual([])
  })

  it('bring every item back to exactly its idle picture once its tap has settled', () => {
    const { ctx, measure } = fakeContext()
    for (const theme of THEMES)
      for (const [id, draw] of itemsOf(theme))
        for (const t of [0, 1.7]) {
          const idle = measure(() => draw(ctx, t, -1))
          expect(measure(() => draw(ctx, t, 1.6)), `${id} at ${t}`).toEqual(idle)
          expect(measure(() => draw(ctx, t, 1e6)), `${id} at ${t}, long after`).toEqual(idle)
        }
  })
})
