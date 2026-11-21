/**
 * The shared drawing helpers' own promises, on the fake context: a tube strokes with round
 * caps and joins whatever the caller set and puts the caller's back, a bar with square ends;
 * the face kit and the shine leave the caps as they found them; the face kit's marks reach
 * 3:1 on every skin; a speck of a puff or a sparkle is left out; the sheet helper draws at its
 * scale and puts the pen back; the ground shadow measures as the flat oval it is.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { rect } from '../game/layout'
import { SKINS } from '../game/model'
import { fakeContext } from './fakeContext'
import { C, INK, SKIN_TONES, at, bar, contrast, eyes, faceMark, flatSun, groundShadow, heldAge, pen, puff, shine, smile, sparkle, tube, turnAbout } from './look'

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** The fake context, also noting the caps, joins and colour of every stroke. */
function strokes() {
  const { ctx, check, measure, counts } = fakeContext()
  const seen: { cap: CanvasLineCap; join: CanvasLineJoin; colour: string }[] = []
  const spy = new Proxy(ctx, {
    get(target, key) {
      const v = Reflect.get(target, key) as unknown
      if (key === 'stroke') return () => seen.push({ cap: target.lineCap, join: target.lineJoin, colour: String(target.strokeStyle) })
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
  return { ctx: spy, check, measure, counts, seen }
}

describe('the strokes', () => {
  it('make a tube round at its ends and bends whatever caps the caller set, and put the caller back', () => {
    const { ctx, seen } = strokes()
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(1, 0)
    tube(ctx, 0.05, C.rope)
    expect(seen).toEqual([
      { cap: 'round', join: 'round', colour: INK },
      { cap: 'round', join: 'round', colour: C.rope },
    ])
    expect([ctx.lineCap, ctx.lineJoin]).toEqual(['butt', 'miter'])
    seen.length = 0
    ctx.lineCap = 'round'
    bar(ctx, 0.05, C.rope)
    expect(seen.map((s) => s.cap)).toEqual(['butt', 'butt'])
    expect(ctx.lineCap).toBe('round')
  })

  it('leave the caps as they found them in the face kit and the shine', () => {
    const { ctx, seen } = strokes()
    for (const cap of ['butt', 'round', 'square'] as const) {
      ctx.lineCap = cap
      for (const mood of ['open', 'happy', 'closed', 'wide'] as const) eyes(ctx, 0, 0, 0.05, 0.08, mood, SKIN_TONES[2])
      smile(ctx, 0, 0, 0.06, false, SKIN_TONES[7])
      smile(ctx, 0, 0, 0.06, true, SKIN_TONES[0])
      shine(ctx, 0, 0, 0.1)
      expect(ctx.lineCap, cap).toBe(cap)
    }
    expect(seen.every((s) => s.cap === 'round')).toBe(true)
  })
})

describe('the face kit', () => {
  it('marks every skin at 3:1 or more: ink on the light ones, the light mark on the darkest', () => {
    for (const skin of SKINS) {
      const face = SKIN_TONES[skin]
      expect(contrast(faceMark(face), face), `skin ${skin}`).toBeGreaterThanOrEqual(3)
    }
    expect(faceMark(SKIN_TONES[0])).toBe(INK)
    expect(faceMark(SKIN_TONES[7])).toBe(C.faceMark)
  })

  it('draws the darkest faces with light marks and a light rim round open eyes', () => {
    const { ctx, seen } = strokes()
    eyes(ctx, 0, 0, 0.05, 0.08, 'happy', SKIN_TONES[7])
    smile(ctx, 0, 0, 0.06, false, SKIN_TONES[7])
    expect(seen.map((s) => s.colour)).toEqual([C.faceMark, C.faceMark, C.faceMark])
    seen.length = 0
    eyes(ctx, 0, 0, 0.05, 0.08, 'happy', SKIN_TONES[1])
    expect(seen.map((s) => s.colour)).toEqual([INK, INK])
    const { ctx: plain, counts } = fakeContext()
    eyes(plain, 0, 0, 0.05, 0.08, 'open', SKIN_TONES[1])
    const light = counts.fill
    eyes(plain, 0, 0, 0.05, 0.08, 'open', SKIN_TONES[7])
    expect(counts.fill! - light!, 'a rim, a bean and a glint per eye').toBe(6)
  })

  it('needs the colour of the face under it', () => {
    const { ctx } = fakeContext()
    expect(() => eyes(ctx, 0, 0, 0.05, 0.08, 'open', 'rgba(0, 0, 0, 0.5)')).toThrow(/face kit/)
  })
})

describe('the small shapes', () => {
  it('leave out a puff or a sparkle too small to see, and draw one big enough', () => {
    const { ctx, counts } = fakeContext()
    pen.ppm = 40
    puff(ctx, 0, 0, 0.02, C.cloud)
    sparkle(ctx, 0, 0, 0.04, C.sparkle)
    puff(ctx, 0, 0, -0.1, C.cloud)
    expect(counts.fill ?? 0).toBe(0)
    puff(ctx, 0, 0, 0.1, C.cloud)
    sparkle(ctx, 0, 0, 0.2, C.sparkle)
    expect(counts.fill).toBe(2)
  })

  it('measure a ground shadow as the flat oval it is, and the sun with its ring', () => {
    const { ctx, measure } = fakeContext()
    const b = measure(() => groundShadow(ctx, 1))
    expect([b.x0, b.y0, b.x1, b.y1].map((v) => +v.toFixed(9))).toEqual([-0.5, -0.06, 0.5, 0.06])
    const sun = measure(() => flatSun(ctx, 1, 1, 0.5, '#FFD84D', '#FFEDAF'))
    expect(sun.x1).toBeCloseTo(1.66, 9)
  })

  it('turn a point about another, and hold a stamp of never finite', () => {
    const [x, y] = turnAbout(1, 0, 0, 0, Math.PI / 2)
    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(1, 12)
    expect([heldAge(Infinity), heldAge(NaN), heldAge(-3), heldAge(2)]).toEqual([1e4, 1e4, 0, 2])
  })
})

describe('the sheet helper', () => {
  it('draws at its own scale on the sheet and puts the pen back', () => {
    const { ctx, check } = fakeContext()
    let during = 0
    const entry = at(48, rect(-1, -2, 2, 2), 'street size', () => (during = pen.ppm))
    expect(entry.box).toEqual(rect(-0.4, -0.8, 0.8, 0.8))
    check('street size', () => entry.draw(ctx, 0), 'none')
    expect(during).toBe(48)
    expect(pen.ppm).toBe(80)
  })
})
