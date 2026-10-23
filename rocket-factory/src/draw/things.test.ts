/**
 * Runs every thing on the fake context at every size the game shows one (a cheek, a heap, a
 * belt at land 3 and land 1, the tray, a card), at moments from the start to a very long
 * session, with several seeds and lifts: it cannot crash, draw NaN, leave the context
 * changed, draw text or make a gradient, and it stays inside its size with its rim (its shadow
 * reaching only down and right). Holds each thing to its detail levels (the fold from 30 px,
 * the recipe inside a bottle from 40 px), to its key colour at every size, and to being a
 * die-cut sticker. Looks are judged on ?sheet=things.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { THINGS, type Thing } from '../game/model'
import { clipped, colours, fakeContext, resetPen } from './fakeContext'
import { C, THING, pen } from './look'
import { ON_BELT, SHEET, drawLiftedThing, drawThing } from './things'

afterEach(resetPen)

/** CSS px across: specks, a cheek, a heap, a belt at land 3 and 1, the edges of each detail level, a card. */
const PX = [6, 14, 22, 29.9, 30, 39.9, 40, 80, 160] as const
/** Moments: the start, a little in, a few seconds, a very long session. */
const TIMES = [0, 0.37, 2.9, 1e5 + 0.21] as const
const SEEDS = [0, 3, 17, 999] as const
const LIFTS = [0, 0.4, 1] as const

describe('the things', () => {
  it('draw every thing at every size, moment, seed and lift, inside their size and shadow', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const ppm of [50, 80]) {
      pen.ppm = ppm
      for (const thing of THINGS)
        PX.forEach((px, p) =>
          check(
            `${thing} at ${px} px, ${ppm} px a cell`,
            () =>
              TIMES.forEach((t, i) =>
                SEEDS.forEach((seed, s) => {
                  // A third of the lifts, turning with the moment and the seed, so each meets every size.
                  const lift = LIFTS[(i + s + p) % LIFTS.length]!
                  const size = px / ppm
                  const b = measure(() => drawLiftedThing(clipped(ctx), thing, size, t, seed, lift))
                  const reach = size / 2 + 1e-9
                  const shadow = 0.06 * (1 + lift * 2.5)
                  if (b.x0 < -reach || b.y0 < -reach || b.x1 > reach + shadow || b.y1 > reach + shadow)
                    out.push(`${thing} ${px} px, lift ${lift}: ${[b.x0, b.y0, b.x1, b.y1].map((v) => (v / size).toFixed(3)).join(', ')} sizes`)
                }),
              ),
            'none',
          ),
        )
    }
    expect(out).toEqual([])
  })

  it('draw a thing as drawLiftedThing does at no lift', () => {
    for (const thing of THINGS) expect(colours((ctx) => drawThing(ctx, thing, 0.5, 1.3, 7))).toEqual(colours((ctx) => drawLiftedThing(ctx, thing, 0.5, 1.3, 7, 0)))
  })

  it('are die-cut stickers: a shadow and a white rim first, then the key colour, at every size', () => {
    for (const thing of THINGS)
      for (const px of [14, 22, 35, 80]) {
        const used = colours((ctx) => drawThing(ctx, thing, px / pen.ppm, 0, 0))
        expect(used.slice(0, 4), `${thing} ${px} px`).toEqual([C.shadow, C.shadow, C.white, C.white])
        expect(used, `${thing} ${px} px`).toContain(THING[thing].key)
      }
    const lifted = colours((ctx) => drawLiftedThing(ctx, 'gear', ON_BELT, 0, 0, 0.5))
    expect(lifted.slice(0, 2)).toEqual([C.liftShadow, C.liftShadow])
  })

  it('show their darker fold only from 30 px, and nothing more than silhouette, key, one highlight and rim below it', () => {
    // The made things' folds are their own darker tone; under 30 px none of them is drawn.
    for (const thing of THINGS) {
      const small = colours((ctx) => drawThing(ctx, thing, 29 / pen.ppm, 0, 0))
      const big = colours((ctx) => drawThing(ctx, thing, 30 / pen.ppm, 0, 0))
      expect(small, `${thing} at 29 px`).not.toContain(THING[thing].fold)
      expect(big, `${thing} at 30 px`).toContain(THING[thing].fold)
    }
  })

  it('show the recipe inside a bottle only from 40 px: blue and gold swirling in the green, the gear in a bubble in the orange', () => {
    const recipe: Record<'greenBottle' | 'orangeBottle', Thing[]> = { greenBottle: ['blueBar', 'goldBar'], orangeBottle: ['gear', 'bubble'] }
    for (const bottle of ['greenBottle', 'orangeBottle'] as const)
      for (const part of recipe[bottle]) {
        expect(colours((ctx) => drawThing(ctx, bottle, 39.9 / pen.ppm, 0, 0)), `${bottle} at 39.9 px`).not.toContain(THING[part].key)
        expect(colours((ctx) => drawThing(ctx, bottle, 40 / pen.ppm, 0, 0)), `${bottle} at 40 px`).toContain(THING[part].key)
      }
  })

  it('ride a belt at ON_BELT: about 22 px at land 3, two to a cell with room between', () => {
    expect(ON_BELT * 49).toBeGreaterThanOrEqual(22)
    expect(ON_BELT).toBeLessThan(0.5)
  })

  it('draw every entry of the sheet', () => {
    const { ctx, check } = fakeContext()
    SHEET.forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 2.6] : [1.1, 9.7]) check(`things: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    })
    expect(SHEET.length).toBe(THINGS.length * 5)
  })
})
