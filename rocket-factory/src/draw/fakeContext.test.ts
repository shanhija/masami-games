import { describe, expect, it } from 'vitest'

import { fakeContext } from './fakeContext'

type Box = { x0: number; y0: number; x1: number; y1: number }
const near = (b: Box, e: readonly [number, number, number, number]) => [b.x0, b.y0, b.x1, b.y1].forEach((v, i) => expect(v).toBeCloseTo(e[i]!, 6))

describe('the fake context measures', () => {
  it('arcs and ellipses by their swept outline, the long way round when the canvas goes that way', () => {
    const { ctx, measure } = fakeContext()
    near(measure(() => ctx.arc(0, 0, 1, 0, Math.PI * 2)), [-1, -1, 1, 1])
    near(measure(() => ctx.arc(0, 0, 1, 0, Math.PI / 2)), [0, 0, 1, 1])
    near(measure(() => ctx.arc(0, 0, 1, 0, Math.PI / 2, true)), [-1, -1, 1, 1])
    near(measure(() => ctx.ellipse(0, 0, 2, 0.5, 0, 0, Math.PI * 2)), [-2, -0.5, 2, 0.5])
    near(measure(() => ctx.ellipse(0, 0, 2, 0.5, Math.PI / 2, 0, Math.PI * 2)), [-0.5, -2, 0.5, 2])
    near(measure(() => ctx.ellipse(0, 0, 1, 1, 0, Math.PI, Math.PI * 2)), [-1, -1, 1, 0])
  })

  it('in the frame of the transform at the call, through every transform inside it', () => {
    const { ctx, measure } = fakeContext()
    ctx.rotate(Math.PI / 4)
    near(measure(() => ctx.rect(0, 0, 1, 0)), [0, 0, 1, 0])
    const r = Math.SQRT1_2
    near(
      measure(() => {
        ctx.save()
        ctx.rotate(Math.PI / 4)
        ctx.rect(0, 0, 1, 0)
        ctx.restore()
      }),
      [0, 0, r, r],
    )
    near(
      measure(() => {
        ctx.save()
        ctx.rotate(Math.PI / 2)
        ctx.translate(1, 0)
        ctx.ellipse(0, 0, 2, 0.5, 0, 0, Math.PI * 2)
        ctx.restore()
      }),
      [-0.5, -1, 0.5, 3],
    )
  })
})
