import { afterEach, describe, expect, it } from 'vitest'

import { pen } from '../../../pia-jump/src/draw/look'
import { calls, clipped, colours, fakeContext } from '../../../rocket-factory/src/draw/fakeContext'
import { OPTIONS, PARTS, START_LOOK, withOption, type Look } from '../game/closet'
import { drawPerson, frameOf, personTop, type Act, type Pose } from './person'

const ACTS: readonly Act[] = ['stand', 'walk', 'run', 'jump', 'fall', 'climb', 'build', 'dance', 'wave']

/** Something on every part. */
const BUSY: Look = { ...START_LOOK, eyes: 'sparkle', hair: 'ponytail', hat: 'wizard', top: 'stars', bottom: 'tutu', shoes: 'rainboots', extra: 'cape', shadow: 'rainbow', lips: 'glitter', blush: 'hearts', paint: 'butterfly' }

/** The k-th moment of an act: every clock at its own odd step, squashed now and then. */
const pose = (act: Act, k: number, turn: number): Pose => ({ act, stride: k * 0.37, since: k * 0.09, t: k * 0.61, squash: (k % 4) / 3, turn })

const RIM = { colour: '#C9C4FF', width: 0.03 }

describe('drawPerson', () => {
  afterEach(() => {
    pen.px = 60
  })

  it('draws every option of every part, facing the closet, half turned and turned, and as a rim', () => {
    const { ctx, check } = fakeContext()
    for (const px of [40, 100]) {
      pen.px = px
      for (const part of PARTS)
        for (const option of OPTIONS[part] as readonly string[])
          for (const turn of [0, 0.5, 1])
            for (const rim of [null, RIM]) {
              const look = withOption(START_LOOK, part, option)
              check(`${part} ${option} at turn ${turn}${rim ? ' as a rim' : ''}`, () => drawPerson(ctx, look, pose('walk', 3, turn), rim), 'none')
            }
    }
  })

  it('draws every act through its loop, plain and busy, facing the closet and turned', () => {
    const { ctx, check } = fakeContext()
    pen.px = 100
    for (const act of ACTS)
      for (const look of [START_LOOK, BUSY, { ...BUSY, extra: 'wings', hair: 'pigtails', top: 'dress' } satisfies Look])
        for (let k = 0; k < 24; k++)
          for (const turn of [0, 1]) {
            check(`${act} ${k} at turn ${turn}`, () => drawPerson(ctx, look, pose(act, k, turn), null), 'none')
            check(`${act} ${k} at turn ${turn} as a rim`, () => drawPerson(ctx, look, pose(act, k, turn), RIM), 'none')
          }
  })

  it('draws a different picture for every option of a part', () => {
    pen.px = 100
    for (const part of PARTS) {
      const seen = new Map<string, string>()
      for (const option of OPTIONS[part] as readonly string[]) {
        const look = withOption(START_LOOK, part, option)
        const draw = (ctx: CanvasRenderingContext2D) => drawPerson(ctx, look, pose('stand', 2, 0), null)
        const picture = [...calls(draw), ...colours(draw)].join('\n')
        expect(seen.get(picture), `${part} ${option} looks like ${seen.get(picture)}`).toBeUndefined()
        seen.set(picture, option)
      }
    }
  })

  it('stands on the ground as tall as personTop says, about as wide as its hitbox', () => {
    const { ctx, measure } = fakeContext()
    const widths: number[] = []
    for (const height of OPTIONS.height)
      for (const build of OPTIONS.build)
        for (const hair of OPTIONS.hair) {
          const look: Look = { ...START_LOOK, height, build, hair }
          // Unsquashed, and what a clip hides does not count.
          const b = measure(() => drawPerson(clipped(ctx), look, pose('stand', 4, 0), null))
          expect(b.y1, `${height} ${build} ${hair}: feet on the ground`).toBeCloseTo(0, 2)
          expect(Math.abs(-b.y0 - personTop(look)), `${height} ${build} ${hair}: top ${-b.y0} for ${personTop(look)}`).toBeLessThan(0.13)
          if (hair === 'short') widths.push(b.x1 - b.x0)
        }
    // Slim, middle and round at each height (the head's width is the least of them), about the hitbox's 0.8 wide for a middle build with its arms (the measure counts paths, not the arms' stroke widths).
    for (let i = 0; i < widths.length; i += 3) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i + 1])
      expect(widths[i + 1]).toBeLessThan(widths[i + 2])
      expect(widths[i + 1]).toBeGreaterThan(0.55)
      expect(widths[i + 1]).toBeLessThan(0.9)
    }
  })

  it('frames the whole person, hats and all, in the box the closet shows it in', () => {
    const { ctx, measure } = fakeContext()
    for (const height of OPTIONS.height)
      for (const hat of OPTIONS.hat) {
        const look: Look = { ...START_LOOK, height, hat, extra: 'wings' }
        const b = measure(() => drawPerson(clipped(ctx), look, pose('stand', 4, 0), null))
        const [cx, cy, w, h] = frameOf(look, 'all')
        expect(b.y0, `${height} ${hat}`).toBeGreaterThan(cy - h / 2)
        expect(b.x0).toBeGreaterThan(cx - w / 2)
        expect(b.x1).toBeLessThan(cx + w / 2)
      }
  })
})
