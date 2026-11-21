/**
 * Runs every thing on the course and every animal in all its states on the fake context, so
 * art written without looking cannot crash, draw NaN, leave the context changed or reach
 * for an API that does not work everywhere; holds the poles to the line they hit along
 * (lifted BAR_UP) and their shadows to exactly that line, a gate tile to its column, a
 * button, a flag and the animals to their size, and the fish to nothing once its splash is
 * over. Looks are judged on ?sheet=things.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { clipped, fakeContext } from '../../../cat-hat-builder/src/draw/fakeContext'
import { BAR_HALF, COURSES, HUES, POST_R } from '../game/model'
import { pen } from './look'
import { BAR_UP, SHEET, drawBar, drawBarShadow, drawBird, drawButton, drawDuck, drawFish, drawFlag, drawFrog, drawGateTile, drawGroove, drawPost, drawPuppy, drawSlider } from './things'

afterEach(() => {
  pen.px = 64
})

const TIMES = [0, 0.17, 0.34, 1.9, 1e5 + 0.07]
const SINCE = [0, 0.05, 0.2, 0.4, 0.55, 0.79, 0.8, 1.2, 1.36, 3, 1e4]
const PARTS = ['single', 'first', 'middle', 'last'] as const
const OPEN = [0, 0.01, 0.3, 0.5, 0.9, 1]
/** Bars between ground points: across, up the screen, slanting, very short, and none at all. */
const BARS = [
  [0, 0, 1.6, 0],
  [0, 0, 0, 1.6],
  [0, 0, -1.1, -1.1],
  [0.3, -0.2, -0.9, 0.7],
  [0, 0, 0.01, 0],
  [0.5, 0.5, 0.5, 0.5],
] as const

type Box = { x0: number; y0: number; x1: number; y1: number }
const within = (b: Box, x0: number, y0: number, x1: number, y1: number) => b.x0 >= x0 - 1e-9 && b.y0 >= y0 - 1e-9 && b.x1 <= x1 + 1e-9 && b.y1 <= y1 + 1e-9
const show = (b: Box) => `${b.x0.toFixed(2)}..${b.x1.toFixed(2)} x ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`

describe('the poles', () => {
  it('carries the bars BAR_UP up along the line between their ground points, and their shadows on exactly that line', () => {
    expect(BAR_UP).toBe(0.55)
    const { ctx, check, measure } = fakeContext()
    for (const [x0, y0, x1, y1] of BARS)
      for (const t of TIMES) {
        check(`bar ${x0},${y0} ${x1},${y1} ${t}`, () => drawBar(ctx, x0, y0, x1, y1, t), 'none')
        check(`shadow ${x0},${y0} ${x1},${y1}`, () => drawBarShadow(ctx, x0, y0, x1, y1), 'none')
        const b = measure(() => drawBar(clipped(ctx), x0, y0, x1, y1, t))
        const r = BAR_HALF + 0.001
        expect(within(b, Math.min(x0, x1) - r, Math.min(y0, y1) - BAR_UP - r, Math.max(x0, x1) + r, Math.max(y0, y1) - BAR_UP + r), `bar ${show(b)}`).toBe(true)
        const s = measure(() => drawBarShadow(ctx, x0, y0, x1, y1))
        expect([s.x0, s.y0, s.x1, s.y1]).toEqual([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)])
      }
  })

  it('stands a spinner post POST_R wide, about 0.85 tall', () => {
    const { ctx, check, measure } = fakeContext()
    for (const course of COURSES)
      for (const t of TIMES) {
        check(`post ${course} ${t}`, () => drawPost(ctx, course, t), 'none')
        const b = measure(() => drawPost(clipped(ctx), course, t))
        expect(within(b, -POST_R, -1.05, POST_R, 0.1), `post ${show(b)}`).toBe(true)
        expect(b.y0).toBeLessThan(-0.85)
      }
  })

  it('rolls a slider on its wheels with its bar BAR_UP up, over its groove', () => {
    const { ctx, check, measure } = fakeContext()
    for (const half of [0.3, 0.8, 1.4])
      for (const angle of [0, 0.1, 0.25, 0.5, 0.62, 0.75, 0.99])
        for (const rolled of [0, 0.3, 7.7, -2.2])
          for (const t of TIMES) {
            check(`slider ${half} ${angle} ${rolled} ${t}`, () => drawSlider(ctx, half, angle, rolled, t), 'none')
            const b = measure(() => drawSlider(clipped(ctx), half, angle, rolled, t))
            expect(within(b, -half - 0.15, -half - BAR_UP - 0.15, half + 0.15, half + 0.01), `slider ${half} ${angle}: ${show(b)}`).toBe(true)
          }
    for (const [ax, ay, bx, by] of BARS) check(`groove ${ax},${ay}`, () => drawGroove(ctx, ax, ay, bx, by), 'none')
  })
})

describe('gates and buttons', () => {
  it('draws every gate tile in every hue, way, part and state within its column, on its tile', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const px of [20, 64])
      for (const hue of HUES)
        for (const along of ['row', 'col'] as const)
          for (const part of PARTS)
            for (const open of OPEN)
              for (const warn of [false, true])
                for (const t of TIMES) {
                  pen.px = px
                  check(`gate ${hue} ${along} ${part} ${open} ${warn} ${t}`, () => drawGateTile(ctx, hue, along, part, open, warn, t), 'none')
                  const b = measure(() => drawGateTile(ctx, hue, along, part, open, warn, t))
                  if (!within(b, -0.6, -2.2, 0.6, 0.05)) out.push(`gate ${along} ${part} ${open}: ${show(b)}`)
                }
    expect(out).toEqual([])
  })

  it('sinks a gate as it opens: an open gate is low, a closed one tall', () => {
    const { ctx, measure } = fakeContext()
    for (const along of ['row', 'col'] as const) {
      const closed = measure(() => drawGateTile(ctx, 'pink', along, 'middle', 0, false, 0))
      const open = measure(() => drawGateTile(ctx, 'pink', along, 'middle', 1, false, 0))
      expect(closed.y0, along).toBeLessThan(open.y0 - 0.5)
    }
  })

  it('draws every button up and down, about 0.7 wide', () => {
    const { ctx, check, measure } = fakeContext()
    for (const hue of HUES)
      for (const down of [0, 0.2, 0.5, 0.8, 1])
        for (const t of TIMES) {
          check(`button ${hue} ${down} ${t}`, () => drawButton(ctx, hue, down, t), 'none')
          const b = measure(() => drawButton(ctx, hue, down, t))
          expect(within(b, -0.5, -0.4, 0.5, 0.3), `button ${show(b)}`).toBe(true)
          expect(b.x1 - b.x0).toBeGreaterThan(0.68)
        }
  })
})

describe('flags and animals', () => {
  it('draws every flag waiting and reached, about 1.5 tall', () => {
    const { ctx, check, measure } = fakeContext()
    for (const course of COURSES)
      for (const reached of [false, true])
        for (const since of SINCE)
          for (const t of TIMES) {
            check(`flag ${course} ${reached} ${since} ${t}`, () => drawFlag(ctx, course, reached, since, t), 'none')
            const b = measure(() => drawFlag(ctx, course, reached, since, t))
            expect(within(b, -0.55, -1.85, 1.0, 0.1), `flag ${reached} ${since}: ${show(b)}`).toBe(true)
          }
  })

  it('draws the frog with and without her, the duck, the fish, the puppy and the bird, each its size', () => {
    const { ctx, check, measure } = fakeContext()
    for (const t of TIMES) {
      for (const since of SINCE)
        for (const rider of [false, true]) {
          check(`frog ${rider} ${since} ${t}`, () => drawFrog(ctx, rider, since, t), 'none')
          const b = measure(() => drawFrog(ctx, rider, since, t))
          expect(within(b, -0.9, rider ? -2.4 : -1.5, 0.9, 0.1), `frog ${rider} ${since}: ${show(b)}`).toBe(true)
        }
      for (const phase of [0, 0.37, 0.9]) {
        check(`duck ${phase} ${t}`, () => drawDuck(ctx, t, phase), 'none')
        const b = measure(() => drawDuck(ctx, t, phase))
        expect(within(b, -0.5, -0.5, 0.5, 0.15), `duck ${show(b)}`).toBe(true)
      }
      for (const face of ['down', 'up', 'side'] as const)
        for (const walked of [0, 0.1, 0.33, 0.61, 17.2]) {
          check(`puppy ${face} ${walked} ${t}`, () => drawPuppy(ctx, face, walked, t), 'none')
          const b = measure(() => drawPuppy(ctx, face, walked, t))
          expect(within(b, -0.5, -0.85, 0.5, 0.05), `puppy ${face}: ${show(b)}`).toBe(true)
          expect(b.y0).toBeLessThan(-0.6)
        }
      for (const act of ['fly', 'hop', 'peck'] as const)
        for (const since of SINCE) {
          check(`bird ${act} ${since} ${t}`, () => drawBird(ctx, act, since, t), 'none')
          const b = measure(() => drawBird(ctx, act, since, t))
          expect(within(b, -0.4, -0.55, 0.4, 0.05), `bird ${act}: ${show(b)}`).toBe(true)
        }
    }
    for (const since of SINCE) {
      check(`fish ${since}`, () => drawFish(ctx, since), 'none')
      const b = measure(() => drawFish(clipped(ctx), since))
      if (since >= 1.36) expect(b.x0 > b.x1, `fish ${since} is gone`).toBe(true)
      else expect(within(b, -0.6, -1.05, 0.9, 0.2), `fish ${since}: ${show(b)}`).toBe(true)
    }
  })
})

describe('the sheet', () => {
  it('draws everything on it', () => {
    const { ctx, check } = fakeContext()
    for (const e of SHEET()) for (const t of [0, 1.1]) check(e.label, () => e.draw(ctx, t), 'none')
  })
})
