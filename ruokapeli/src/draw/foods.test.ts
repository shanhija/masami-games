/**
 * Runs every food on the fake context (measured through its clips, so a shaded thing's lit
 * copy, clipped to it, does not count): each layer, each food on the ground through its bob,
 * piles of 0, 1, 5 and 25 layers at every lean, at several times and sizes. Nothing may
 * crash, draw NaN, leave the context changed, draw text or make a gradient. Holds the
 * drawings to their sizes: a layer about a bun wide, a food on the course under a tile, a
 * pile's top at pileHeight, its lean bending the top and not the plate. Looks are judged on
 * the sheet (?sheet=foods).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { clipped, fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { ALL_FILLINGS, ALL_FOODS, type Edible, type Food } from '../game/model'
import { FOOD_W, LAYER, drawFood, drawGroundFood, drawPile, pileHeight, pileLayer } from './foods'
import { pen } from './look'

afterEach(() => {
  pen.px = 64
})

const EDIBLES: readonly Edible[] = [...ALL_FILLINGS, 'poop']
const TIMES = [0, 0.37, 1.1, 2.9]
/** A pile of n layers going round every food in turn. */
const pileOf = (n: number): Food[] => Array.from({ length: n }, (_, i) => ALL_FOODS[i % ALL_FOODS.length]!)

describe('the foods', () => {
  it('draws every layer, every food on the ground and every pile cleanly at every size and time', () => {
    const { ctx, check } = fakeContext()
    for (const px of [30, 64, 200]) {
      pen.px = px
      for (const t of TIMES) {
        for (const kind of ALL_FOODS) check(`${kind} at ${t} s`, () => drawFood(ctx, kind, t), 'none')
        for (const kind of EDIBLES) for (const phase of [0, 0.5, 0.99]) check(`${kind} on the ground at ${phase}`, () => drawGroundFood(ctx, kind, t, phase), 'none')
        for (const n of [0, 1, 5, 25]) for (const lean of [-0.45, 0, 0.45]) check(`a pile of ${n} leaning ${lean}`, () => drawPile(ctx, pileOf(n), lean, t), 'none')
      }
    }
  })

  it('draws each layer about a bun wide, from its origin up by about its thickness and the top it shows', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const kind of ALL_FOODS) {
      expect(LAYER[kind], kind).toBeGreaterThan(0)
      const box = measure(() => drawFood(ctx, kind, 0))
      // The poop's flies buzz round it wider than the pile; everything else stays near a bun's width.
      expect(box.x1 - box.x0, kind).toBeGreaterThan(0.6 * FOOD_W)
      expect(box.x1 - box.x0, kind).toBeLessThan(kind === 'poop' ? 1.1 : 1.45 * FOOD_W)
      expect(box.x0 + box.x1, `${kind} is centred`).toBeCloseTo(0, 0)
      // Drips, droops and horns may hang a little over the layer below.
      expect(box.y1, kind).toBeLessThan(0.2)
      expect(box.y1, kind).toBeGreaterThan(-0.05)
      expect(box.y0, kind).toBeGreaterThan(-(LAYER[kind] + 0.7))
      expect(box.y0, kind).toBeLessThan(-(LAYER[kind] + 0.1))
    }
  })

  it('lays a food on the course under a tile wide, bobbing over its own shadow, a poop sitting still', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const kind of EDIBLES) {
      const low = measure(() => drawGroundFood(ctx, kind, 0, 0))
      const high = measure(() => drawGroundFood(ctx, kind, 0.8, 0))
      expect(low.x1 - low.x0, kind).toBeLessThan(1.05)
      expect(low.x1 - low.x0, kind).toBeGreaterThan(0.55)
      expect(low.y1, kind).toBeLessThan(0.25)
      expect(high.y0, kind).toBeGreaterThan(kind === 'poop' ? -1 : -0.8)
      if (kind === 'poop') expect(high.y1).toBeCloseTo(low.y1, 6)
      else expect(high.y0, `${kind} bobs up`).toBeLessThan(low.y0 - 0.05)
    }
  })

  it('stacks a pile up to pileHeight, every top food reaching about there', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    expect(pileHeight([])).toBeGreaterThan(0.3)
    expect(Math.abs(measure(() => drawPile(ctx, [], 0, 0)).y0 + pileHeight([]))).toBeLessThan(0.02)
    for (const top of ALL_FOODS) {
      if (top === 'poop') continue
      const pile: Food[] = ['bunBottom', 'patty', 'cheese', 'salad', top]
      const box = measure(() => drawPile(ctx, pile, 0, 0))
      // The curls of a croissant's rolls and the cream's peak rise a little over the line; flat tops sit on it.
      expect(Math.abs(box.y0 + pileHeight(pile)), top).toBeLessThan(0.2)
    }
    for (const top of ['bunTop', 'patty', 'tomato', 'bunBottom'] as const) {
      const pile: Food[] = ['bunBottom', 'ham', top]
      expect(Math.abs(measure(() => drawPile(ctx, pile, 0, 0)).y0 + pileHeight(pile)), top).toBeLessThan(0.04)
    }
    expect(pileHeight(pileOf(25))).toBeGreaterThan(pileHeight(pileOf(5)) + 1.5)
  })

  it('bends a leaning pile over at the top, never at the plate', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    const pile = pileOf(25)
    const upright = measure(() => drawPile(ctx, pile, 0, 0))
    for (const lean of [-0.45, 0.45]) {
      expect(pileLayer(pile, 0, lean).x).toBeCloseTo(0, 9)
      const top = pileLayer(pile, pile.length, lean)
      expect(Math.sign(top.x)).toBe(Math.sign(lean))
      expect(Math.abs(top.x)).toBeGreaterThan(0.5)
      expect(Math.sign(top.tilt)).toBe(Math.sign(lean))
      // Higher layers are further over.
      expect(Math.abs(pileLayer(pile, 20, lean).x)).toBeGreaterThan(Math.abs(pileLayer(pile, 10, lean).x))
      const box = measure(() => drawPile(ctx, pile, lean, 0))
      expect(box.y1).toBeCloseTo(upright.y1, 6)
      if (lean > 0) expect(box.x1).toBeGreaterThan(upright.x1 + 0.4)
      else expect(box.x0).toBeLessThan(upright.x0 - 0.4)
    }
  })
})
