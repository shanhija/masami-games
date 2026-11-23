import { describe, expect, it } from 'vitest'

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { fixture } from './fixtures'
import { highToScreen, highView } from './highCamera'
import { crowdOffsets } from './Players'
import { pointAt, screenOf, type ShownView } from './RoomStage'
import { roomToScreen, sideView } from './sideCamera'

const screen = { width: 1280, height: 800, clearBottom: 200, clearTop: 90 }

describe('a tap seen from high up', () => {
  const { world } = fixture('courtyard')
  const v = highView(world.bounds, world.floorFrame!, screen, [0, 0])

  it('is the point where the line from the eye first meets something drawn', () => {
    const top: Vec3 = [5.5, 0.9, 4.2]
    const shown: ShownView = { view: null, high: { view: v, pick: () => top } }
    expect(pointAt(shown, world, screen, 600, 500)).toEqual(top)
  })

  it('meets the ground at the box bottom where it meets nothing drawn, and before the first frame goes by the view it will draw', () => {
    const [px, py] = highToScreen(v, [3, world.bounds.min[1], -2])
    const p = pointAt({ view: null, high: { view: v, pick: () => null } }, world, screen, px, py)
    expect(p[0]).toBeCloseTo(3, 6)
    expect(p[1]).toBeCloseTo(world.bounds.min[1], 6)
    expect(p[2]).toBeCloseTo(-2, 6)
    const first = pointAt({ view: null, high: null }, world, screen, px, py)
    expect(first[0]).toBeCloseTo(3, 6)
    expect(first[2]).toBeCloseTo(-2, 6)
  })

  it('from the side is a point on z = 0, as before', () => {
    const side = fixture('meadow').world
    const sv = sideView(side.camera, screen, [0, 0])
    const [px, py] = roomToScreen(sv, 7, 3)
    expect(pointAt({ view: sv, high: null }, side, screen, px, py)).toEqual([7, 3, 0])
    expect(screenOf({ view: sv, high: null }, [7, 3, 0])).toEqual([px, py])
    expect(screenOf({ view: null, high: null }, [7, 3, 0])).toBeNull()
  })
})

describe('a crowd seen from high up', () => {
  it('is only kids near each other on the floor: two at one x but metres apart in depth are not a crowd', () => {
    const out = crowdOffsets([
      { seat: 0, at: [1, 0, -3] },
      { seat: 1, at: [1.1, 0, 2] },
      { seat: 2, at: [4, 0, 1] },
      { seat: 3, at: [4.1, 0, 1.1] },
    ])
    expect(out.get(0)).toEqual({ dx: 0, rank: 0 })
    expect(out.get(1)).toEqual({ dx: 0, rank: 0 })
    expect(out.get(2)!.dx).toBeLessThan(0)
    expect(out.get(3)!.rank).toBe(1)
  })
})
