import { describe, it } from 'vitest'

import { fakeContext } from '../../../rocket-factory/src/draw/fakeContext'
import { KINDS } from '../game/model'
import { drawCrate, drawFinish, drawGhost, drawIcon, drawPiece, drawPresent } from './blocks'

describe('the blocks, crates, presents and the arch', () => {
  it('draw in every state without throwing, a NaN, text or a changed context', () => {
    const { ctx, check } = fakeContext()
    for (const kind of KINDS) {
      for (const size of kind === 'plank' ? [3] : kind === 'ladder' ? [2, 4] : [1]) {
        for (const dip of [0, 0.5, 1]) check(`${kind} of ${size}, dip ${dip}`, () => drawPiece(ctx, kind, size, 3, dip), 'none')
        check(`${kind} ghost`, () => drawGhost(ctx, kind, size, 1.3), 'none')
      }
      check(`${kind} icon`, () => drawIcon(ctx, kind, 0.8), 'none')
      check(`${kind} crate`, () => drawCrate(ctx, kind, 2.2, 7), 'none')
    }
    for (let i = 0; i < 3; i++) check(`present ${i}`, () => drawPresent(ctx, i, 1.7), 'none')
    check('finish', () => drawFinish(ctx, 4.2), 'none')
  })
})
