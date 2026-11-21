/**
 * Runs the one cat on the fake context in every pose, coat, mood and detail level, walking,
 * waving and as a kitten, at street, room and close-up sizes: it cannot crash, draw NaN or
 * leave the context changed. Holds it to its size (0.45 m to the ear tips sitting, its feet
 * on the ground), its walk to a loop that moves the legs, its wave to the near paw, and its
 * face to marks that read on every coat. Looks are judged on the sheet.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ANIMAL_SHEET, CAT_COATS, CAT_POSES, catAt, drawCat, type CatCoat, type CatPic } from './animals'
import { fakeContext } from './fakeContext'
import { contrast, faceMark, pen } from './look'

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

const COATS = Object.keys(CAT_COATS) as CatCoat[]
const cat = (patch: Partial<CatPic>): CatPic => ({ coat: 'ginger', pose: 'sit', eyes: 'open', meow: false, tail: 0, lift: 0, tilt: 0, step: 0, wave: 0, kitten: false, ...patch })

/** Every call a drawing makes with its arguments (numbers to six places): two drawings are the same picture when their traces match. */
function trace(draw: (ctx: CanvasRenderingContext2D) => void): string {
  const { ctx } = fakeContext()
  const calls: string[] = []
  const spy = new Proxy(ctx, {
    get(target, key) {
      const v = Reflect.get(target, key) as unknown
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        calls.push(`${String(key)}(${args.map((a) => (typeof a === 'number' ? a.toFixed(6) : String(a))).join(',')})`)
        return (v as (...a: unknown[]) => unknown)(...args)
      }
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
  draw(spy)
  return calls.join(';')
}

describe('the cat', () => {
  it('draws every pose, coat and mood, walking, waving, meowing and as a kitten, at every detail and size', () => {
    const { ctx, check } = fakeContext()
    // Every pose in every coat at every size; of its moods, details and moves a third, those whose places add up to a multiple of three, so every two of them still meet with every coat. One check holds a coat's moods together.
    for (const ppm of [40, 100, 400]) {
      pen.ppm = ppm
      for (const pose of CAT_POSES)
        COATS.forEach((coat, c) =>
          check(
            `${coat} ${pose} at ${ppm} px/m`,
            () =>
              (['open', 'happy', 'closed', 'wide'] as const).forEach((eyes, e) =>
                (['S', 'M', 'L'] as const).forEach((lod, l) =>
                  (
                    [
                      [0, 0, 0],
                      [0.3, 0, 0.4],
                      [0.75, 1, -0.3],
                    ] as const
                  ).forEach(([step, wave, tail], m) => {
                    if ((c + e + l + m) % 3 === 0) drawCat(ctx, cat({ coat, pose, eyes, step, wave, tail, meow: wave > 0, kitten: step > 0.5, lift: 0.03, tilt: -0.1 }), lod)
                  }),
                ),
              ),
            'none',
          ),
        )
      check('catAt', () => catAt(ctx, cat({}), 'M', 0.2, -0.3, -1, 0.7, 0.92, 0.3), 'none')
    }
  })

  it('sits 0.45 m to the ear tips with its paws on the ground, and every pose stays near that', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 180
    const sit = measure(() => drawCat(ctx, cat({}), 'L'))
    expect(sit.y0).toBeGreaterThan(-0.48)
    expect(sit.y0).toBeLessThan(-0.42)
    expect(sit.y1).toBeGreaterThan(-0.01)
    expect(sit.y1).toBeLessThan(0.01)
    for (const pose of CAT_POSES)
      for (const step of [0, 0.25, 0.5, 0.75]) {
        const b = measure(() => drawCat(ctx, cat({ pose, step, wave: step > 0.6 ? 1 : 0 }), 'L'))
        expect(Math.max(-b.x0, b.x1), `${pose} at ${step}: across`).toBeLessThan(0.42)
        expect(b.y0, `${pose} at ${step}: top`).toBeGreaterThan(-0.5)
        // A tail lying on the floor curves through a control point just under it.
        expect(b.y1, `${pose} at ${step}: bottom`).toBeLessThan(0.015)
      }
  })

  it('walks its legs round a loop, and holds them still in the other poses', () => {
    const at = (pose: CatPic['pose'], step: number) => trace((ctx) => drawCat(ctx, cat({ pose, step }), 'M'))
    expect(at('walk', 0.25)).not.toBe(at('walk', 0))
    expect(at('walk', 1)).toBe(at('walk', 0))
    expect(at('sit', 0.25)).toBe(at('sit', 0))
  })

  it('waves its near front paw up', () => {
    /** The highest paw: the paws are the 0.04 by 0.024 ovals. */
    const topPaw = (pic: CatPic) =>
      Math.min(
        ...trace((ctx) => drawCat(ctx, pic, 'M'))
          .split(';')
          .filter((call) => call.startsWith('ellipse(') && call.includes(',0.040000,0.024000,'))
          .map((call) => Number(call.slice('ellipse('.length).split(',')[1])),
      )
    for (const pose of ['sit', 'walk', 'lie', 'peek'] as const) expect(topPaw(cat({ pose, wave: 1 })), pose).toBeLessThan(topPaw(cat({ pose })) - 0.04)
  })

  it('marks its face at 3:1 or more on every coat, its eyes on the fur and its smile on the muzzle', () => {
    for (const coat of COATS) {
      const { fur, light } = CAT_COATS[coat]
      expect(contrast(faceMark(fur), fur), `${coat} eyes`).toBeGreaterThanOrEqual(3)
      expect(contrast(faceMark(light), light), `${coat} smile`).toBeGreaterThanOrEqual(3)
    }
  })

  it('draws its sheet', () => {
    const { ctx, check } = fakeContext()
    for (const entry of ANIMAL_SHEET) for (const t of [0, 0.7, 1.9]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
  })
})
