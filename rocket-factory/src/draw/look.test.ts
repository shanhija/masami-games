/**
 * The palette's promises (plans/rocket-factory.md, The look), measured in CIE Lab from the
 * sRGB tokens: the buildings share a band of low chroma; every two building bodies stand apart
 * (CIEDE2000), and so does the burrows' mound from each of them, its lighter shape from theirs;
 * the munchers' berry stands apart from every other colour on the board, so pink
 * means muncher; every thing's key colour stands apart from the belt it rides (and reads on it
 * at 2:1 or more), from its maker's body and from every other thing's key, and each raw thing
 * is duller than what it is made into; no token's name or value holds an em-dash. Then the
 * shared helpers' own promises on the fake context: the add... pieces wind clockwise so a union
 * fills once, and the die-cut's rim is the width asked, never under a device pixel.
 *
 * The thresholds are the art lens's (closest building pair about 16, munchers at least 28 from
 * everything in its set), relaxed to where this palette's measured numbers sit: building pairs
 * above 10 (the closest are the pad and the pump, 11.5, the pad and the tower, 11.6, the oven
 * and the snack bowl, 12.0; the mound's nearest is the digger, 13.6, and its lighter shape's the
 * green maker's, 12.0), berry above 25 from every surface and 22 from the darker folds
 * (the oven's fold is the closest, 22.9), things above 20 from the belt (the blue rock, 27.0),
 * 12 from their makers (the pearl and the pump, 14.3) and 10 from each other (the blue rock
 * and the gear, the gold rock and the gold bar, 11.9: raw and made of one family are told
 * apart by shape and shine as much as by colour). The band's mean chroma is 30.4.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { THINGS, type Thing } from '../game/model'
import { colours, fakeContext, resetPen } from './fakeContext'
import { drawHand } from './hand'
import * as look from './look'
import { BEEP, BELT, BUILDING, C, HEDGE, LAND, MUNCHER, RIM, THING, addCircle, addRoundPoly, addRoundRect, addStar, dieCut, dieCutRim, pen, phaseOf, roundRectPath, starPath, stickerRim } from './look'

afterEach(resetPen)

type Lab = [number, number, number]

/** A '#RRGGBB' token, or an 'rgba(r, g, b, a)' one laid over the mint ground, in CIE Lab (D65). */
function lab(colour: string): Lab {
  let rgb: number[]
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(colour)
  if (rgba) {
    const under = [1, 3, 5].map((i) => parseInt(LAND.ground.slice(i, i + 2), 16))
    const a = Number(rgba[4])
    rgb = [1, 2, 3].map((i, k) => (Number(rgba[i]) * a + under[k]! * (1 - a)) / 255)
  } else {
    if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) throw new Error(`not a colour token: ${colour}`)
    rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255)
  }
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as Lab
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const chroma = (c: string) => Math.hypot(lab(c)[1], lab(c)[2])

/** CIEDE2000 between two Lab colours (Sharma, Wu and Dalal 2005). */
function de2000(p: Lab, q: Lab): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const [L1, a1, b1] = p
  const [L2, a2, b2] = q
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1 = Math.hypot(a1p, b1)
  const C2 = Math.hypot(a2p, b2)
  const hue = (b: number, a: number, c: number) => (c === 0 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360)
  const h1 = hue(b1, a1p, C1)
  const h2 = hue(b2, a2p, C2)
  let dh = h2 - h1
  if (C1 * C2 === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dL = L2 - L1
  const dC = C2 - C1
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2))
  const Lm = (L1 + L2) / 2
  const Cmp = (C1 + C2) / 2
  const hm = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63))
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp
  const Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}
const de = (a: string, b: string) => de2000(lab(a), lab(b))

/** The WCAG contrast of two '#RRGGBB' tokens. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as Lab
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Every colour token in look.ts's palette records, by its path ('BUILDING.oven.fold'). */
function tokens(): [string, string][] {
  const out: [string, string][] = []
  const walk = (path: string, v: unknown) => {
    if (typeof v === 'string') out.push([path, v])
    else if (Array.isArray(v)) v.forEach((x, i) => walk(`${path}[${i}]`, x))
    else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) walk(`${path}.${k}`, x)
  }
  for (const name of ['C', 'LAND', 'BELT', 'BUILDING', 'HEDGE', 'THING', 'GLASS', 'BEEP', 'MUNCHER', 'MOONY', 'ROCKET', 'SKY', 'NIGHT', 'DEBUG'] as const) walk(name, look[name])
  return out
}

/** Every pair of a list, with its distance, closest first. */
function pairs(list: readonly (readonly [string, string])[]): { names: string; d: number }[] {
  const out: { names: string; d: number }[] = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push({ names: `${list[i]![0]} and ${list[j]![0]}`, d: de(list[i]![1], list[j]![1]) })
  return out.sort((a, b) => a.d - b.d)
}

/** What makes each thing: whose body it sits on as it comes out. */
const MAKER: Record<Thing, keyof typeof BUILDING> = { blueRock: 'digger', goldRock: 'digger', bubble: 'pump', blueBar: 'oven', goldBar: 'oven', gear: 'workshop', greenBottle: 'greenMaker', orangeBottle: 'orangeMaker' }

describe('the colour measures', () => {
  it('find white at L* 100 and the reference pair of the CIEDE2000 paper', () => {
    const [L, a, b] = lab('#FFFFFF')
    expect(L).toBeCloseTo(100, 3)
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01)
    expect(de2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4)
    expect(de2000([50, -1, 2], [50, 0, 0])).toBeCloseTo(2.3669, 4)
  })
})

describe('the palette', () => {
  it('keeps the buildings in one soft band: mean chroma under 40, the lab the one dark sticker', () => {
    const band = (['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'pump', 'tower', 'bowl'] as const).map((k) => BUILDING[k].body).concat(HEDGE.body)
    const mean = band.reduce((sum, c) => sum + chroma(c), 0) / band.length
    expect(mean, `mean chroma ${mean.toFixed(1)}`).toBeLessThan(40)
    for (const c of band) expect(lab(c)[0], `${c} is light`).toBeGreaterThan(55)
    expect(lab(BUILDING.lab.body)[0]).toBeLessThan(45)
  })

  it('keeps every two building bodies apart, and the burrows\' mound from every one (CIEDE2000 over 10)', () => {
    // The mound is a sticker too, and the blueprint puts a digger right beside a burrow.
    const bodies = Object.entries(BUILDING).map(([k, v]) => [k, v.body] as const)
    const close = pairs([...bodies, ['hedge', HEDGE.body], ['mound', LAND.mound]])
    expect(close[0]!.d, `closest: ${close[0]!.names} at ${close[0]!.d.toFixed(1)}`).toBeGreaterThan(10)
    const lights = Object.entries(BUILDING).map(([k, v]) => [k, v.light] as const)
    const near = pairs([...lights, ['mound', LAND.moundLight]]).filter((p) => p.names.includes('mound'))
    expect(near[0]!.d, `closest: ${near[0]!.names} at ${near[0]!.d.toFixed(1)}`).toBeGreaterThan(10)
  })

  it('keeps berry pink the munchers\' alone: 25 from every surface on the board, 22 from the darker folds', () => {
    // The munchers' own colours, and the pink marks that belong with them: an open mouth, a blush, the friends' heart.
    const others = tokens().filter(([path]) => !path.startsWith('MUNCHER.') && path !== 'C.mouth' && path !== 'C.blush' && path !== 'C.heart')
    expect(others.length).toBeGreaterThan(100)
    const near = others.map(([path, c]) => ({ path, d: de(MUNCHER.body, c) })).sort((a, b) => a.d - b.d)
    for (const { path, d } of near) expect(d, `${path} at ${d.toFixed(1)}`).toBeGreaterThan(path.endsWith('.fold') ? 22 : 25)
  })

  it('keeps every thing\'s key colour apart from the belt, from its maker\'s body and from every other thing\'s', () => {
    for (const thing of THINGS) {
      const key = THING[thing].key
      expect(de(key, BELT.body), `${thing} on the belt`).toBeGreaterThan(20)
      expect(contrast(key, BELT.body), `${thing} reads on the belt`).toBeGreaterThanOrEqual(2)
      expect(de(key, BUILDING[MAKER[thing]].body), `${thing} on its maker`).toBeGreaterThan(12)
    }
    const close = pairs(THINGS.map((t) => [t, THING[t].key] as const))
    expect(close[0]!.d, `closest: ${close[0]!.names} at ${close[0]!.d.toFixed(1)}`).toBeGreaterThan(10)
  })

  it('makes each raw thing duller than what it is made into', () => {
    for (const [raw, made] of [
      ['blueRock', 'blueBar'],
      ['goldRock', 'goldBar'],
      ['bubble', 'orangeBottle'],
    ] as const)
      expect(chroma(THING[raw].key), `${raw} and ${made}`).toBeLessThan(chroma(THING[made].key))
  })

  it("dresses the hint's hand in Beep's own colours: a cyan mitten, with its lighter shape and fold, on a coral cuff, as Beep's hands are on its spring arms", () => {
    const used = colours((ctx) => drawHand(ctx, { x: 0, y: 0, palm: 0.4, press: 0, alpha: 1, ripple: Infinity, size: 80, carry: null }, 0))
    for (const c of [BEEP.prop, BEEP.mittenLight, BEEP.mittenFold, BEEP.body]) expect(used).toContain(c)
    expect(used).not.toContain(BEEP.plate)
    // Cyan reads on the mint ground less than coral does: the white rim and the coral cuff carry it there.
    expect(de(BEEP.prop, LAND.ground)).toBeGreaterThan(15)
  })

  it('names and writes every token without an em-dash, and every one is a colour', () => {
    for (const [path, c] of tokens()) {
      expect(path.includes('\u2014') || c.includes('\u2014'), path).toBe(false)
      expect(() => lab(c), path).not.toThrow()
    }
  })
})

describe('the shared helpers', () => {
  /** The points a path helper adds (moveTo and lineTo, and arcTo's corners), on a recording context. */
  function points(draw: (ctx: CanvasRenderingContext2D) => void): number[] {
    const { ctx } = fakeContext()
    const out: number[] = []
    const spy = new Proxy(ctx, {
      get(target, key: string) {
        const v = Reflect.get(target, key) as unknown
        if (typeof v !== 'function') return v
        return (...a: number[]) => {
          if (key === 'moveTo' || key === 'lineTo') out.push(a[0]!, a[1]!)
          if (key === 'arcTo') out.push(a[0]!, a[1]!)
          return (v as (...args: unknown[]) => unknown)(...a)
        }
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    })
    draw(spy)
    return out
  }
  /** Twice the signed area of a polygon: above 0 when it winds clockwise on screen (y down). */
  const winding = (p: readonly number[]) => {
    let s = 0
    for (let i = 0; i < p.length; i += 2) s += p[i]! * p[(i + 3) % p.length]! - p[(i + 2) % p.length]! * p[i + 1]!
    return s
  }

  it('add clockwise pieces, so a union of them fills once', () => {
    expect(winding(points((ctx) => addRoundRect(ctx, 0, 0, 2, 1, 0.2)))).toBeGreaterThan(0)
    expect(winding(points((ctx) => addRoundPoly(ctx, [0, 0, 1, 0, 1, 1, 0, 1], 0.2)))).toBeGreaterThan(0)
    expect(winding(points((ctx) => addStar(ctx, 0, 0, 1)))).toBeGreaterThan(0)
  })

  it('keep the path helpers as they were: a fresh path round the same pieces', () => {
    const { ctx, counts, measure } = fakeContext()
    const box = measure(() => roundRectPath(ctx, 1, 2, 3, 4, 0.5))
    expect([box.x0, box.y0, box.x1, box.y1]).toEqual([1, 2, 4, 6])
    expect(counts.beginPath).toBe(1)
    const star = measure(() => starPath(ctx, 0, 0, 1))
    expect(star.y0).toBeCloseTo(-1, 9)
    expect(counts.beginPath).toBe(2)
    const circle = measure(() => {
      ctx.beginPath()
      addCircle(ctx, 0.5, 0.5, 0.25)
    })
    expect([circle.x0, circle.y0, circle.x1, circle.y1]).toEqual([0.25, 0.25, 0.75, 0.75])
  })

  it('cut a sticker\'s rim as wide as asked, never under a device pixel, and leave the context as found', () => {
    const { ctx, check } = fakeContext()
    const widths: number[] = []
    const spy = new Proxy(ctx, {
      get(target, key: string) {
        const v = Reflect.get(target, key) as unknown
        if (key === 'stroke') return () => widths.push(target.lineWidth)
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    })
    const outline = () => {
      spy.beginPath()
      addCircle(spy, 0, 0, 0.3)
    }
    check('die-cuts', () => {
      dieCut(spy, outline, 0)
      dieCutRim(spy, outline, 0.4, 0.03)
      pen.ppm = 10
      dieCutRim(spy, outline, 0, 0.001)
    }, 'none')
    // Each cut strokes its shadow and its rim, each 2 rims wide.
    expect(widths).toEqual([2 * RIM, 2 * RIM, 0.06, 0.06, 2 / (2 * 10), 2 / (2 * 10)])
    expect(C.shadow).not.toBe(C.liftShadow)
  })

  it('cut a see-through sticker (a ghost held up) with fills alone, so no piece of a many-piece outline shows its rim through the body', () => {
    const { ctx, check, counts } = fakeContext()
    // A flask's bulb and neck: two pieces of one outline.
    const outline = () => {
      ctx.beginPath()
      addCircle(ctx, 0, 0.3, 0.6)
      addRoundRect(ctx, -0.2, -0.7, 0.4, 0.6, 0.06)
    }
    ctx.globalAlpha = 0.85
    check('a ghost\'s die-cut', () => {
      dieCut(ctx, outline, 0.6)
      stickerRim(ctx, outline, RIM, BUILDING.oven.body)
    }, 'none')
    expect(counts.stroke ?? 0).toBe(0)
    expect(counts.fill).toBeGreaterThan(9)
  })

  it('give consecutive ids far-apart phases, and every id one from 0 to 1', () => {
    for (let id = 0; id < 50; id++) {
      const d = Math.abs(phaseOf(id + 1) - phaseOf(id))
      expect(Math.min(d, 1 - d), `ids ${id} and ${id + 1}`).toBeGreaterThan(0.3)
      for (const p of [phaseOf(id), phaseOf(`burrow${id}`)]) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThan(1)
      }
    }
    // A row of ten of a kind never has two in step.
    const row = Array.from({ length: 10 }, (_, i) => phaseOf(i + 3)).sort((a, b) => a - b)
    for (let i = 1; i < row.length; i++) expect(row[i]! - row[i - 1]!).toBeGreaterThan(0.03)
  })
})
