/**
 * Holds every theme's art together: each item stays inside its slot box all through its idle
 * loop and through tap after tap, frame by frame (the per-theme tests sample a few moments
 * at many sizes), every wallpaper but disco's (the one dark theme) stays clear of the ink so
 * inked items keep their outline on it, and a room's inside draws through `drawInside` for
 * every theme and for a room with none yet.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ITEMS, themeItems } from '../../game/items'
import { SLOT_BOX } from '../../game/layout'
import { THEMES } from '../../game/model'
import { fakeContext } from '../fakeContext'
import { INK, contrast, pen } from '../look'
import { THEME_ART, drawInside, itemArt } from './art'

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** Taps two seconds apart, so the balloon that pops and the easel's picture (party.ts tapSlot) take every turn. */
const TAPS = [0, 2, 4, 6, 8] as const
/** Seconds of a tap's reaction to follow: 1.5 at most, and the block tower builds itself again by 1.6. */
const REACTION = 1.7

describe('the rooms', () => {
  // Each tap's reaction ten frames a second, each tap a fiftieth of a second on from the one before, so together the taps see it fifty frames a second; the idle loop five frames a second, as look.ts rule 10 keeps it calm (a period of 1.2 to 3 s).
  it.each(THEMES)('keep every %s item inside its slot box, with a tenth to spare, all through its idle loop and through tap after tap', (theme) => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 100
    const out: string[] = []
    for (const id of themeItems(theme)) {
      const draw = itemArt(id)
      const b = SLOT_BOX[ITEMS[id].slot]
      const mx = (b.x1 - b.x0) * 0.1
      const my = (b.y1 - b.y0) * 0.1
      const reach = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      const frame = (t: number, play: number) => {
        const m = measure(() => draw(ctx, t, play))
        reach.x0 = Math.min(reach.x0, m.x0)
        reach.y0 = Math.min(reach.y0, m.y0)
        reach.x1 = Math.max(reach.x1, m.x1)
        reach.y1 = Math.max(reach.y1, m.y1)
      }
      for (let t = 0; t < 10; t += 0.2) frame(t, -1)
      TAPS.forEach((at, k) => {
        for (let play = k * 0.02; play < REACTION; play += 0.1) frame(at + play, play)
      })
      if (reach.x0 < b.x0 - mx || reach.x1 > b.x1 + mx || reach.y0 < b.y0 - my || reach.y1 > b.y1 + my)
        out.push(`${id}: x ${reach.x0.toFixed(3)} to ${reach.x1.toFixed(3)}, y ${reach.y0.toFixed(3)} to ${reach.y1.toFixed(3)}`)
    }
    expect(out).toEqual([])
  })

  it('keep every wallpaper but disco at least 2:1 off the ink, so inked items keep their outline', () => {
    const dark = THEMES.filter((theme) => theme !== 'disco').flatMap((theme) => THEME_ART[theme].swatches.filter((wall) => contrast(wall, INK) < 2).map((wall) => `${theme} ${wall}`))
    expect(dark).toEqual([])
  })

  it('draw a room inside for every theme and with no theme yet, at a small, a wide and a tall size', () => {
    const { ctx, check } = fakeContext()
    for (const ppm of [40, 160]) {
      pen.ppm = ppm
      for (const theme of [...THEMES, null])
        for (const [w, h] of [
          [2.16, 2.1],
          [4.56, 2.1],
          [2.16, 4.5],
        ] as const)
          for (const v of [0, 3] as const) check(`${theme} ${w}x${h} ${v}`, () => drawInside(ctx, theme, w, h, 1.3, v, v), 'none')
    }
  })
})
