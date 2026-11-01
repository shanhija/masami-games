/**
 * Runs the balloon on the fake context (measured through its clips): free and tied down,
 * its slot shut, half and wide open, at several times and sizes, with and without a rider.
 * Nothing may crash, draw NaN, leave the context changed, draw text or make a gradient.
 * Holds it to its size (BALLOON_H tall, about 3 wide), its rider to the basket's floor
 * between the back of the basket and its front, and its trap door to hanging open only
 * when the slot is. Looks are judged on the sheet (?sheet=balloon).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { clipped, fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { BALLOON_H, BASKET_H, drawBalloon } from './balloon'
import { pen } from './look'

afterEach(() => {
  pen.px = 64
})

/** A rider that draws a little box standing on its origin. */
const box = (c: CanvasRenderingContext2D) => {
  c.beginPath()
  c.rect(-0.2, -1.1, 0.4, 1.1)
  c.fill()
}

describe('the balloon', () => {
  it('draws free and tied down, its slot shut to open, with and without a rider, cleanly', () => {
    const { ctx, check } = fakeContext()
    for (const px of [30, 64, 200]) {
      pen.px = px
      for (const pegs of [false, true])
        for (const slot of [0, 0.3, 1])
          for (const t of [0, 0.7, 2.3])
            for (const rider of [null, box]) check(`balloon ${pegs ? 'tied' : 'free'} slot ${slot} at ${t} s`, () => drawBalloon(ctx, { t, slot, pegs }, rider), 'none')
    }
  })

  it('stands BALLOON_H tall from the basket bottom, the envelope about 3 wide, the pegs a little wider', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const t of [0, 0.85, 1.7, 2.55]) {
      const free = measure(() => drawBalloon(ctx, { t, slot: 0, pegs: false }, null))
      expect(free.y0 + BALLOON_H, `the top at ${t} s`).toBeCloseTo(0, 1)
      expect(free.y1, `the bottom at ${t} s`).toBeCloseTo(0, 1)
      expect(free.x1 - free.x0).toBeGreaterThan(2.9)
      expect(free.x1 - free.x0).toBeLessThan(3.3)
      const tied = measure(() => drawBalloon(ctx, { t, slot: 0, pegs: true }, null))
      expect(tied.x1 - tied.x0).toBeLessThan(3.6)
      expect(-tied.y0).toBeLessThan(4.8)
      // The pegs stand a little in front of the basket, their shadows on the ground under them.
      expect(tied.y1).toBeLessThan(0.08)
    }
  })

  it('hangs its trap door below the basket only while the slot is open', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    // Free at time 0, where its bob is level; tied down, the pegs' shadows would reach under it.
    const shut = measure(() => drawBalloon(ctx, { t: 0, slot: 0, pegs: false }, null))
    const open = measure(() => drawBalloon(ctx, { t: 0, slot: 1, pegs: false }, null))
    expect(shut.y1).toBeLessThan(0.02)
    expect(open.y1).toBeGreaterThan(0.1)
  })

  it('stands the rider on the basket floor, after the envelope and before the basket front', () => {
    const { ctx } = fakeContext()
    const calls: string[] = []
    const spy = new Proxy(ctx, {
      get(target, key) {
        const v = Reflect.get(target, key) as unknown
        if (typeof v !== 'function') return v
        return (...args: unknown[]) => {
          calls.push(String(key))
          return (v as (...a: unknown[]) => unknown)(...args)
        }
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    })
    let at: DOMMatrix | null = null
    drawBalloon(spy, { t: 0, slot: 0, pegs: true }, (c) => {
      at = c.getTransform()
      calls.push('rider')
    })
    const m = at as unknown as { e: number; f: number }
    expect(m.e).toBeCloseTo(0, 6)
    expect(m.f).toBeLessThan(0)
    expect(m.f).toBeGreaterThan(-BASKET_H / 2)
    const rider = calls.indexOf('rider')
    const paints = (from: number, to: number) => calls.slice(from, to).filter((k) => k === 'fill' || k === 'stroke').length
    expect(paints(0, rider), 'the envelope and the basket back before').toBeGreaterThan(20)
    expect(paints(rider, calls.length), 'the basket front after').toBeGreaterThan(10)
  })
})
