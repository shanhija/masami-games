/**
 * Runs every monster in every mood on the fake context (measured through its clips, so a
 * shaded body's lit copy does not count): mouth shut and wide open, belly empty and full,
 * early and late in a mood, rolling both ways and looking both ways, at several sizes; and
 * the cart with its wheels turning. Nothing may crash, draw NaN, leave the context changed,
 * draw text or make a gradient. Holds each monster to its size (about 2.2 tall and 2 wide,
 * Gobble a fifth bigger) standing on its origin, and the cart to its seat. Looks are judged
 * on the sheet (?sheet=monster).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { clipped, fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { MONSTERS } from '../game/model'
import { pen } from './look'
import { CART_SEAT, MOODS, MOUTH_UP, drawCart, drawMonster, type MonsterPose } from './monster'

afterEach(() => {
  pen.px = 64
})

const pose = (patch: Partial<MonsterPose>): MonsterPose => ({ mouth: 0, belly: 0, mood: 'hungry', since: 0, lean: 0, look: 0, t: 0, ...patch })

describe('the monsters', () => {
  it('draws every monster in every mood, mouth, belly, moment, roll and look cleanly', () => {
    const { ctx, check } = fakeContext()
    for (const px of [30, 200]) {
      pen.px = px
      for (const id of MONSTERS)
        for (const mood of MOODS)
          check(
            `${id} ${mood} at ${px} px`,
            () => {
              for (const mouth of [0, 1])
                for (const belly of [0, 1])
                  for (const since of [0, 0.25, 0.7, 2])
                    for (const t of [0, 1.7])
                      for (const [lean, look] of [
                        [-1, 1],
                        [0.4, -1],
                      ] as const)
                        drawMonster(ctx, id, pose({ mood, mouth, belly, since, t, lean, look }))
            },
            'none',
          )
    }
  })

  it('stands each monster on its origin, about 2.2 tall and 2 wide, Gobble a fifth bigger, and keeps every pose in its box', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const id of MONSTERS) {
      const big = id === 'gobble' ? 1.2 : 1
      const still = measure(() => drawMonster(ctx, id, pose({ t: 1 })))
      expect(still.y1, `${id} stands on its origin`).toBeGreaterThan(-0.01)
      expect(still.y1, `${id} stands on its origin`).toBeLessThan(0.08)
      expect(-still.y0, `${id} is tall enough`).toBeGreaterThan(2.0 * big)
      expect(-still.y0, `${id} is not too tall`).toBeLessThan(2.45 * big)
      expect(still.x1 - still.x0, `${id} is wide enough`).toBeGreaterThan(1.8 * big)
      expect(still.x1 - still.x0, `${id} is not too wide`).toBeLessThan(2.6 * big)
      // Its mouth is in its body, under its eyes.
      expect(MOUTH_UP[id]).toBeGreaterThan(0.3 * -still.y0)
      expect(MOUTH_UP[id]).toBeLessThan(0.6 * -still.y0)
      for (const mood of MOODS)
        for (const since of [0.1, 0.3, 0.9])
          for (const belly of [0, 1]) {
            const box = measure(() => drawMonster(ctx, id, pose({ mood, since, belly, mouth: 1, lean: 1, look: 1, t: 2 })))
            expect(box.x1 - box.x0, `${id} ${mood} at ${since} s with belly ${belly}`).toBeLessThan(2.9 * big)
            expect(-box.y0, `${id} ${mood} at ${since} s with belly ${belly}`).toBeLessThan(3.05 * big)
            // Rolling tips it over about its bottom middle, so one foot dips a little into its seat.
            expect(box.y1, `${id} ${mood} at ${since} s with belly ${belly}`).toBeLessThan(0.17)
          }
    }
  })

  it('grows wider with a full belly', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const id of MONSTERS) {
      const empty = measure(() => drawMonster(ctx, id, pose({ mood: 'chew', since: 2, belly: 0 })))
      const full = measure(() => drawMonster(ctx, id, pose({ mood: 'chew', since: 2, belly: 1 })))
      expect(full.x1 - full.x0, id).toBeGreaterThan(empty.x1 - empty.x0 + 0.25)
    }
  })

  it('hops when happy and bounces in the dance, and stands still to chew', () => {
    const { ctx: raw, measure } = fakeContext()
    const ctx = clipped(raw)
    for (const id of MONSTERS) {
      const ground = measure(() => drawMonster(ctx, id, pose({ mood: 'chew', since: 2 }))).y1
      expect(measure(() => drawMonster(ctx, id, pose({ mood: 'happy', since: 0.22 }))).y1, id).toBeLessThan(ground - 0.15)
      // At the top of a dance bounce it sways furthest, one foot lower than the other.
      expect(measure(() => drawMonster(ctx, id, pose({ mood: 'dance', since: 0.3 }))).y1, id).toBeLessThan(ground - 0.07)
    }
  })

  it('draws the cart with turning wheels on the rails, its top at the seat', () => {
    const { ctx: raw, check, measure } = fakeContext()
    for (const wheel of [0, 1, 7.5]) for (const t of [0, 0.4, 1.3]) check(`the cart at ${wheel}`, () => drawCart(raw, wheel, t), 'none')
    const box = measure(() => drawCart(clipped(raw), 0.3, 0))
    expect(box.y1).toBeCloseTo(0, 2)
    expect(box.y0).toBeLessThan(-CART_SEAT)
    expect(box.y0).toBeGreaterThan(-CART_SEAT - 0.15)
    expect(box.x1 - box.x0).toBeLessThan(2.3)
  })
})
