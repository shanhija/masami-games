/**
 * The puffs fly (engine/effects.ts): the sim moves World.puffs a frame at a time by Silly Billy's own
 * stepping, with no wind, the same on every run.
 */

import { describe, expect, it } from 'vitest'

import type { Puff } from '../../../silly-billy/src/engine/types'
import { NO_POINTING } from '../seats/types'
import { flyPuffs } from './effects'
import type { Room } from './room'
import { idle, NEVER, plainRoom, playRoom, roomStart, testRoom } from './testing'

const S1 = roomStart(1, 'together', 1, 11)

/** A room that puffs a heart (it rises) and drops (they fall) from one spot in its first frame. */
function puffing(): Room {
  return testRoom((r, w) => {
    plainRoom(r, w, NEVER)
    return () => {
      if (w.time() < 0.02) {
        w.puff([0, 4, 0], 'heart')
        w.puff([0, 4, 0], 'drop')
      }
    }
  }, S1)
}

const frames = (room: Room, n: number) => playRoom(room, n, idle(room), () => NO_POINTING)

describe('the puffs fly', () => {
  it('a frame at a time in the sim: out from where they were born, the drops falling and the hearts rising, the same on every run', () => {
    const room = puffing()
    frames(room, 1)
    const born = room.world.puffs.map((p) => [p.x, p.y, p.z])
    expect(born.length).toBeGreaterThan(0)
    frames(room, 20)
    const puffs = room.world.puffs
    expect(puffs.map((p) => [p.x, p.y, p.z])).not.toEqual(born)
    const mean = (kind: Puff['kind']) => {
      const ys = puffs.filter((p) => p.kind === kind).map((p) => p.y)
      return ys.reduce((a, b) => a + b, 0) / ys.length
    }
    expect(mean('drop')).toBeLessThan(mean('heart'))
    expect(mean('drop')).toBeLessThan(4)
    const again = puffing()
    frames(again, 21)
    expect(again.world.puffs).toEqual(puffs)
  })

  it('with no wind, slowing by the drag, and gone past their life', () => {
    const puff = (born: number): Puff => ({ kind: 'star', x: 0, y: 1, z: 0, vx: 1, vy: 0, vz: 0, color: '#ffffff', size: 0.2, born, life: 1, gravity: 0 })
    const list = { t: 1.5, puffs: [puff(0), puff(1)] }
    flyPuffs(list, 0.1)
    expect(list.puffs).toHaveLength(1)
    const [p] = list.puffs
    expect([p!.x, p!.y, p!.z]).toEqual([expect.closeTo(0.1, 9), 1, 0])
    expect(p!.vx).toBeLessThan(1)
    flyPuffs(list, 0)
    expect(p!.x).toBeCloseTo(0.1, 9)
  })
})
