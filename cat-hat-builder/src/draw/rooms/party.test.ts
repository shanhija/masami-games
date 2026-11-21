/**
 * Runs the party themes' art (disco, birthday, music, crafts) on the fake context: every
 * wallpaper and floor in its four colourings at a small, a wide, a tall and a big room, and
 * every item idle and through a whole tap reaction at street, room and close-up sizes, so
 * art written without looking cannot crash, draw NaN, leave the context changed or reach for
 * an API that does not work everywhere; holds each item inside its slot box (with 10% to
 * spare) and checks each reaction settles back to the idle picture. art.test.ts follows
 * every item frame by frame through tap after tap. Looks are judged on ?sheet=rooms and in
 * the game.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ITEMS, themeItems, type ItemId } from '../../game/items'
import { SLOT_BOX } from '../../game/layout'
import { fakeContext } from '../fakeContext'
import { pen } from '../look'
import { itemArt } from './art'
import { PARTY_ART } from './party'

/** CSS px per metre: the street, the plot view, the room view of a big room and of a small one, a close-up. */
const SCALES = [40, 80, 100, 160, 400] as const
/** Inside sizes (w x h) of a small, a wide, a tall and a big room. */
const ROOMS = [
  [2.16, 2.1],
  [4.56, 2.1],
  [2.16, 4.5],
  [4.56, 4.5],
] as const
/** Sim times, including a long session and a huge one. */
const TIMES = [-2.6, 0, 0.37, 1.9, 7.25, 3600.4, 1e7] as const
/** Wallpaper times: before the start, the start, a while in, a huge one. */
const WALL_TIMES = [-2.6, 0, 5.5, 1e7] as const
/** Tap ages: never, through the reaction, settled, long after, and an age of never. */
const PLAYS = [-1, 0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.45, 1.6, 2.5, 60, 1e9, Infinity] as const

type Theme = keyof typeof PARTY_ART
const THEMES = Object.keys(PARTY_ART) as Theme[]
const itemsOf = (theme: Theme) => themeItems(theme).map((id) => [id, itemArt(id)] as const)

/** An item's slot box grown by 10% each way: where its drawing must stay. */
function bounds(id: ItemId) {
  const b = SLOT_BOX[ITEMS[id].slot]
  const mx = (b.x1 - b.x0) * 0.1
  const my = (b.y1 - b.y0) * 0.1
  return { x0: b.x0 - mx, y0: b.y0 - my, x1: b.x1 + mx, y1: b.y1 + my }
}

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

describe('the party themes', () => {
  it('have art for exactly their items, four distinct swatches and a glow', () => {
    for (const theme of THEMES) {
      expect(Object.keys(PARTY_ART[theme].items).sort(), theme).toEqual(themeItems(theme).sort())
      expect(new Set(PARTY_ART[theme].swatches).size, theme).toBe(4)
      expect(PARTY_ART[theme].glow, theme).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('give every theme its own first wall colour', () => {
    expect(new Set(THEMES.map((theme) => PARTY_ART[theme].swatches[0])).size).toBe(THEMES.length)
  })

  // Each colouring in every room size, the zoom and the time turning from one to the next.
  it('draw every wallpaper and floor colouring at every room size, zoom and time', () => {
    const { ctx, check } = fakeContext()
    for (const theme of THEMES)
      for (const v of [0, 1, 2, 3] as const)
        ROOMS.forEach(([w, h], r) => {
          pen.ppm = SCALES[(v + r) % SCALES.length]
          const t = WALL_TIMES[(v + 2 * r) % WALL_TIMES.length]!
          check(`${theme} wall ${v} ${w}x${h} at ${t}, ${pen.ppm} px/m`, () => PARTY_ART[theme].wall(ctx, w, h, t, v), 'none')
          check(`${theme} floor ${v} ${w} at ${t}, ${pen.ppm} px/m`, () => PARTY_ART[theme].floor(ctx, w, t, v), 'none')
        })
  })

  // Every tap age at every zoom, the time turning from one age to the next: each age meets most of the times, each zoom all of them. One check holds an item's ages at a zoom together: an age that leaves the context changed leaves it changed at the end of them too.
  it('draw every item idle and through its tap, at every zoom and time, inside its slot box with 10% to spare', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const theme of THEMES)
        for (const [id, draw] of itemsOf(theme)) {
          const b = bounds(id)
          check(
            `${id} through its tap at ${ppm} px/m`,
            () =>
              PLAYS.forEach((play, i) => {
                const t = TIMES[(i + s) % TIMES.length]!
                const m = measure(() => draw(ctx, t, play))
                if (m.x0 < b.x0 || m.x1 > b.x1 || m.y0 < b.y0 || m.y1 > b.y1) out.push(`${id} at t ${t}, play ${play}, ${ppm} px/m: x ${m.x0.toFixed(3)} to ${m.x1.toFixed(3)}, y ${m.y0.toFixed(3)} to ${m.y1.toFixed(3)}`)
              }),
            'none',
          )
        }
    })
    expect(out).toEqual([])
  })

  it('settle every tap back to the idle picture within 1.5 s', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 160
    for (const theme of THEMES)
      for (const [id, draw] of itemsOf(theme))
        for (const t of [0, 1.3, 4.6]) {
          const idle = measure(() => draw(ctx, t, -1))
          for (const play of [1.5, 3, 1e6, Infinity]) {
            const m = measure(() => draw(ctx, t, play))
            for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(m[k], `${id} at t ${t}, ${play} s after a tap: ${k}`).toBeCloseTo(idle[k], 9)
          }
        }
  })

  it('stand the floor items and friends on the floor line', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 160
    for (const theme of THEMES)
      for (const [id, draw] of itemsOf(theme)) {
        if (ITEMS[id].slot !== 'floor') continue
        const m = measure(() => draw(ctx, 0, -1))
        expect(m.y1, id).toBeGreaterThan(-0.01)
        expect(m.y1, id).toBeLessThan(0.08)
      }
  })
})
