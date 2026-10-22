/**
 * The style keys sheet and the goods, on the fake context: what no other test draws. Every
 * keys entry (the brick Play room put together as the renderer puts a room together among
 * them) at a few moments, the composed room inside its cell, and the goods held to their
 * 0.6 m square and drawn from their sheet. Each group's own art is run by its own test file;
 * looks are judged on ?sheet=keys.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { GOODS } from '../game/model'
import { clipped, fakeContext } from './fakeContext'
import { GOODS_SHEET, drawGood } from './goods'
import { KEYS_SHEET } from './keys'
import { pen } from './look'

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

describe('the style keys', () => {
  it('draw every entry at a few moments, the composed room inside its cell', () => {
    const { ctx, check, measure } = fakeContext()
    for (const entry of KEYS_SHEET) for (const t of [0, 1.1, 2.6, 5.3]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    const room = KEYS_SHEET.find((entry) => entry.label.startsWith('brick room'))!
    for (const t of [0, 1.1, 2.6, 5.3]) {
      const m = measure(() => room.draw(clipped(ctx), t))
      expect(m.x0, `left at ${t}`).toBeGreaterThanOrEqual(room.box.x)
      expect(m.y0, `top at ${t}`).toBeGreaterThanOrEqual(room.box.y)
      expect(m.x1, `right at ${t}`).toBeLessThanOrEqual(room.box.x + room.box.w)
      expect(m.y1, `bottom at ${t}`).toBeLessThanOrEqual(room.box.y + room.box.h)
    }
  })
})

describe('the goods', () => {
  it('each fit a 0.6 m square standing on its bottom centre, at every size and moment, and draw from their sheet', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of [36, 80, 400]) {
      pen.ppm = ppm
      for (const good of GOODS)
        for (const t of [0, 0.4, 0.9, 1.7]) {
          check(good, () => drawGood(ctx, good, t), 'none')
          const b = measure(() => drawGood(ctx, good, t))
          expect(b.x0, `${good} left`).toBeGreaterThanOrEqual(-0.3)
          expect(b.x1, `${good} right`).toBeLessThanOrEqual(0.3)
          expect(b.y0, `${good} top`).toBeGreaterThanOrEqual(-0.6)
          expect(b.y1, `${good} bottom`).toBeLessThanOrEqual(0.001)
        }
    }
    for (const entry of GOODS_SHEET) for (const t of [0, 1.1, 2.6]) check(`goods: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
  })
})
