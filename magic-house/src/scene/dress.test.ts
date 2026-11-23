import { describe, expect, it } from 'vitest'

import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import { GIFT_MARKERS } from '../engine/gift'
import { inColours } from './dress'
import { crowdOffsets, CROWD } from './Players'

describe('a worn thing in the colours of its wearer', () => {
  it('paints each shape of a marker colour in the colour of the wearer, and leaves every other shape as it is', () => {
    const recipe = buildRecipe((m) => {
      m.sphere(0.2, { color: GIFT_MARKERS.main })
      m.box(0.1, 0.1, 0.1, { color: GIFT_MARKERS.second })
      m.sphere(0.05, { color: '#123456' })
      return {}
    }, ['head']).recipe
    const worn = inColours(recipe, { main: '#ff0000', second: '#00ff00' })
    expect(worn.shapes.map((s) => s.color)).toEqual(['#ff0000', '#00ff00', '#123456'])
    expect(recipe.shapes[0]!.color).toBe(GIFT_MARKERS.main)
  })
})

describe('a crowd of kids on one spot', () => {
  it('is fanned out round its middle in seat order, the arrows stepped up by rank; a kid alone stays put', () => {
    const at = (x: number, y: number): [number, number, number] => [x, y, 0]
    const out = crowdOffsets([
      { seat: 2, at: at(3.7, 0) },
      { seat: 0, at: at(3.75, 0) },
      { seat: 1, at: at(3.6, 0) },
      { seat: 3, at: at(-2, 0) },
    ])
    expect(out.get(0)).toEqual({ dx: -CROWD.gap, rank: 0 })
    expect(out.get(1)).toEqual({ dx: 0, rank: 1 })
    expect(out.get(2)).toEqual({ dx: CROWD.gap, rank: 2 })
    expect(out.get(3)).toEqual({ dx: 0, rank: 0 })
    // One standing on another's head is not in their crowd.
    expect(crowdOffsets([{ seat: 0, at: at(1, 0) }, { seat: 1, at: at(1, 1.15) }]).get(1)).toEqual({ dx: 0, rank: 0 })
  })
})
