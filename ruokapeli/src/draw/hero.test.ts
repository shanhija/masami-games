/**
 * Runs the hero through every act in every face at many moments on the fake context, so
 * art written without looking cannot crash, draw NaN, leave the context changed or reach
 * for an API that does not work everywhere; holds her to the box the renderer expects
 * (about one tile wide and 1.7 tall, the dizzy stars and a waving arm a little more) and
 * her plate anchor to where her hands can reach. Looks are judged on ?sheet=hero.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { FACES, HERO_ACTS, SHEET, drawHero, plateAnchor, type HeroPose } from './hero'
import { pen } from './look'

afterEach(() => {
  pen.px = 64
})

/** Moments: strides for the walk over two cycles, seconds into every other act from its start to long after. */
const MOMENTS = [0, 0.03, 0.11, 0.2, 0.26, 0.37, 0.45, 0.52, 0.69, 0.71, 0.9, 1.33, 2.6, 1e4 + 0.17]
const TIMES = [0, 0.06, 1.7, 3.41, 1e5 + 0.3]

function* poses(): Generator<HeroPose> {
  for (const act of HERO_ACTS)
    for (const face of FACES)
      for (const m of MOMENTS)
        for (const t of TIMES) yield { face, act, stride: act === 'walk' ? m : 0, since: m, t }
}

describe('drawHero', () => {
  it('draws every act in every face at every moment and leaves the context as it found it', () => {
    const { ctx, check } = fakeContext()
    for (const px of [20, 64, 200]) {
      pen.px = px
      for (const p of poses()) check(`${p.act} ${p.face} ${p.since} ${p.t}`, () => drawHero(ctx, p), 'none')
    }
  })

  it('stays in her box: about a tile wide and 1.7 tall, more only for a free arm, a hop, the stars and the water', () => {
    const { ctx, measure } = fakeContext()
    // Each act's and face's box over all its moments, against the most it may reach.
    const boxes = new Map<string, { x0: number; x1: number; y0: number; y1: number }>()
    for (const p of poses()) {
      const b = measure(() => drawHero(ctx, p))
      const key = `${p.act} ${p.face}`
      const was = boxes.get(key) ?? b
      boxes.set(key, { x0: Math.min(was.x0, b.x0), x1: Math.max(was.x1, b.x1), y0: Math.min(was.y0, b.y0), y1: Math.max(was.y1, b.y1) })
    }
    const out: string[] = []
    for (const [key, b] of boxes) {
      const act = key.split(' ')[0]!
      // In the water the box is the clip that cuts her at the water line (the fake context measures what is cut away too).
      const half = act === 'teeter' || act === 'ride' ? 0.8 : act === 'bonk' || act === 'zap' ? 0.7 : act === 'swim' ? 0.9 : 0.5
      const top = act === 'cheer' || act === 'swim' ? -1.9 : -1.75
      const bottom = act === 'swim' ? 0.62 : 0.12
      if (b.x0 < -half || b.x1 > half || b.y0 < top || b.y1 > bottom) out.push(`${key}: ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} x ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`)
    }
    expect(out).toEqual([])
  })

  it('holds the plate where her hands are: over her head, low over the water, swaying in a teeter', () => {
    for (const p of poses()) {
      const a = plateAnchor(p)
      expect(Number.isFinite(a.x) && Number.isFinite(a.y), `${p.act} ${p.face}`).toBe(true)
      expect(Math.abs(a.x), `${p.act} ${p.face} ${p.since} x`).toBeLessThan(0.5)
      if (p.act === 'swim') expect(a.y, `${p.act} ${p.face} ${p.since}`).toBeGreaterThan(-1.0)
      else expect(a.y, `${p.act} ${p.face} ${p.since}`).toBeLessThan(-1.3)
      expect(a.y, `${p.act} ${p.face} ${p.since}`).toBeGreaterThan(-1.85)
    }
    const stand = plateAnchor({ face: 'down', act: 'stand', stride: 0, since: 0, t: 0 })
    expect(stand.x).toBeCloseTo(0, 5)
    expect(stand.y).toBeCloseTo(-1.45, 1)
  })

  it('bobs the plate with the walk and sways it in a teeter', () => {
    const ys = [0, 0.11, 0.22, 0.34].map((s) => plateAnchor({ face: 'down', act: 'walk', stride: s, since: s, t: 0 }).y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.02)
    const xs = [0, 0.1, 0.2, 0.3].map((s) => plateAnchor({ face: 'side', act: 'teeter', stride: 0, since: s, t: 0 }).x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2)
  })

  it('draws its sheet', () => {
    const { ctx, check } = fakeContext()
    for (const e of SHEET) for (const t of [0, 1.3]) check(e.label, () => e.draw(ctx, t), 'none')
  })
})
