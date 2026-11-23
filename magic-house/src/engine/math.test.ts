import { describe, expect, it } from 'vitest'
import { acos, acosh, asin, asinh, atan, atan2, atanh, cbrt, cos, cosh, exp, expm1, hypot, log, log10, log1p, log2, madeMath, nextRandom, nextThrow, pow, sin, sinh, streamState, tan, tanh } from './math'

const f64 = new Float64Array(1)
const i64 = new BigInt64Array(f64.buffer)
/** The double's bits, as hex. */
function bits(x: number): string {
  f64[0] = x
  return (i64[0] & 0xffffffffffffffffn).toString(16).padStart(16, '0')
}
/** How many representable doubles lie between a and b. */
function ulps(a: number, b: number): number {
  if (Number.isNaN(a) && Number.isNaN(b)) return 0
  if (a === b) return 0
  const order = (x: number) => {
    f64[0] = x
    const v = i64[0]
    return v < 0n ? -(v & 0x7fffffffffffffffn) : v
  }
  const d = order(a) - order(b)
  return Number(d < 0n ? -d : d)
}

/** A plain stream of numbers for inputs, not the engine's own. */
function inputs(seed: number, n: number, lo: number, hi: number): number[] {
  let s = streamState(seed)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const [v, next] = nextThrow(s)
    s = next
    out.push(lo + (hi - lo) * v)
  }
  return out
}

const ONE: [string, (x: number) => number, (x: number) => number, number, number][] = [
  ['sin', sin, Math.sin, -50, 50],
  ['cos', cos, Math.cos, -50, 50],
  ['tan', tan, Math.tan, -20, 20],
  ['atan', atan, Math.atan, -100, 100],
  ['exp', exp, Math.exp, -700, 700],
  ['log', log, Math.log, 1e-300, 1e300],
]

describe('made code math', () => {
  for (const [name, mine, page, lo, hi] of ONE) {
    it(`${name} is within two ulps of the page's`, () => {
      let worst = 0
      for (const x of [...inputs(name.length, 4000, lo, hi), ...inputs(name.length + 9, 2000, -2, 2)]) {
        if (name === 'log' && x <= 0) continue
        worst = Math.max(worst, ulps(mine(x), page(x)))
      }
      expect(worst).toBeLessThanOrEqual(2)
    })
  }

  it('sin, cos and tan stay within two ulps far out, up to a million', () => {
    let worst = 0
    for (const x of inputs(3, 2000, -1e6, 1e6)) worst = Math.max(worst, ulps(sin(x), Math.sin(x)), ulps(cos(x), Math.cos(x)), ulps(tan(x), Math.tan(x)))
    expect(worst).toBeLessThanOrEqual(2)
  })

  it('atan2, pow and hypot are within two ulps of the page', () => {
    let worst = 0
    const ys = inputs(11, 3000, -50, 50)
    const xs = inputs(12, 3000, -50, 50)
    for (let i = 0; i < ys.length; i++) {
      worst = Math.max(worst, ulps(atan2(ys[i], xs[i]), Math.atan2(ys[i], xs[i])))
      worst = Math.max(worst, ulps(hypot(ys[i], xs[i]), Math.hypot(ys[i], xs[i])))
      const b = Math.abs(xs[i]) / 5
      const e = ys[i] / 4
      worst = Math.max(worst, ulps(pow(b, e), Math.pow(b, e)))
      worst = Math.max(worst, ulps(pow(-b, Math.round(e)), Math.pow(-b, Math.round(e))))
    }
    expect(worst).toBeLessThanOrEqual(2)
  })

  it('agrees with the page on the edges: zeros, infinities, NaN, whole powers', () => {
    const edge = [0, -0, 1, -1, 2, 0.5, Infinity, -Infinity, NaN, 1e-310, -1e-310, 1e308, Math.PI / 2, Math.PI]
    for (const x of edge) {
      for (const [name, mine, page] of ONE) {
        // Past 2^20 pi/2 the turns are reduced their own way (math.ts): finite and in range, not the page's.
        if (x === 1e308 && (name === 'sin' || name === 'cos' || name === 'tan')) expect(Math.abs(mine(x))).toBeLessThan(name === 'tan' ? Infinity : 1.0000001)
        else expect(Object.is(mine(x), page(x)) || ulps(mine(x), page(x)) <= 1).toBe(true)
      }
      for (const y of edge) {
        expect(Object.is(pow(x, y), Math.pow(x, y)) || ulps(pow(x, y), Math.pow(x, y)) <= 1).toBe(true)
        expect(Object.is(atan2(x, y), Math.atan2(x, y)) || ulps(atan2(x, y), Math.atan2(x, y)) <= 1).toBe(true)
        expect(Object.is(hypot(x, y), Math.hypot(x, y)) || ulps(hypot(x, y), Math.hypot(x, y)) <= 1).toBe(true)
      }
    }
    expect(hypot()).toBe(0)
    expect(hypot(3, 4)).toBe(5)
    expect(hypot(1, 2, 2)).toBe(3)
  })

  it('gives these exact bits, so a change to the port is caught', () => {
    // Each is the correctly rounded value of the function there, but exp(1), which is fdlibm's own (Java's StrictMath.exp(1)).
    expect(bits(sin(1))).toBe('3feaed548f090cee')
    expect(bits(cos(1))).toBe('3fe14a280fb5068c')
    expect(bits(tan(1))).toBe('3ff8eb245cbee3a6')
    expect(bits(atan2(1, 2))).toBe('3fddac670561bb4f')
    expect(bits(exp(1))).toBe('4005bf0a8b14576a')
    expect(bits(log(10))).toBe('40026bb1bbb55516')
    expect(bits(pow(2, 0.5))).toBe('3ff6a09e667f3bcd')
    expect(bits(pow(10, -3))).toBe(bits(0.001))
    expect(bits(sin(1e5))).toBe(bits(0.03574879797201651))
    expect(bits(sin(1e308))).toBe(bits(sin(1e308 % 6.283185307179586)))
  })
})

describe('the seeded stream', () => {
  it('gives the same throws from the same seed, in [0, 1), and others from another', () => {
    const a = { rng: streamState(42) }
    const b = { rng: streamState(42) }
    const c = { rng: streamState(43) }
    const ta = Array.from({ length: 1000 }, () => nextRandom(a))
    const tb = Array.from({ length: 1000 }, () => nextRandom(b))
    const tc = Array.from({ length: 1000 }, () => nextRandom(c))
    expect(ta).toEqual(tb)
    expect(ta).not.toEqual(tc)
    expect(Math.min(...ta)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ta)).toBeLessThan(1)
    const mean = ta.reduce((s, v) => s + v, 0) / ta.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
  })

  it('keeps its whole state in one number, which a clone carries on from', () => {
    const a = { rng: streamState(5) }
    nextRandom(a)
    const b = structuredClone(a)
    expect(nextRandom(a)).toBe(nextRandom(b))
    expect(bits(nextRandom({ rng: streamState(1) }))).toBe(bits(nextRandom({ rng: streamState(1) })))
  })

  it('builds the rest close to the page, exact on whole powers and cubes', () => {
    const REST: [string, (x: number) => number, (x: number) => number, number, number][] = [
      ['asin', asin, Math.asin, -1, 1],
      ['acos', acos, Math.acos, -1, 1],
      ['sinh', sinh, Math.sinh, -20, 20],
      ['cosh', cosh, Math.cosh, -20, 20],
      ['tanh', tanh, Math.tanh, -20, 20],
      ['asinh', asinh, Math.asinh, -1e6, 1e6],
      ['acosh', acosh, Math.acosh, 1, 1e6],
      ['atanh', atanh, Math.atanh, -0.999, 0.999],
      ['expm1', expm1, Math.expm1, -5, 5],
      ['log1p', log1p, Math.log1p, -0.9, 100],
      ['log2', log2, Math.log2, 1e-6, 1e6],
      ['log10', log10, Math.log10, 1e-6, 1e6],
      ['cbrt', cbrt, Math.cbrt, -1e6, 1e6],
    ]
    for (const [name, mine, page, lo, hi] of REST) {
      const nearZero = lo < 0 && hi > 0 ? inputs(name.length + 40, 300, -1e-3, 1e-3) : []
      for (const x of [...inputs(name.length + 30, 1000, lo, hi), ...nearZero]) {
        const want = page(x)
        expect(Math.abs(mine(x) - want), `${name}(${x})`).toBeLessThanOrEqual(1e-13 * Math.max(1, Math.abs(want)))
      }
    }
    expect([log2(8), log2(1 / 1024), log10(1000), log10(1e-5), cbrt(27), cbrt(-8), atanh(1), asin(1), acos(1)]).toEqual([3, -10, 3, -5, 3, -2, Infinity, Math.PI / 2, 0])
    expect(Number.isNaN(asin(2)) && Number.isNaN(acosh(0.5)) && Number.isNaN(atanh(1.5))).toBe(true)
  })

  it("is made code's Math.random, with the engine's functions and the page's others, frozen", () => {
    const world = { rng: streamState(9) }
    const m = madeMath(() => nextRandom(world))
    const expected = nextRandom({ rng: streamState(9) })
    expect(m.random()).toBe(expected)
    expect(m.sin).toBe(sin)
    expect(m.acos).toBe(acos)
    expect(m.log10).toBe(log10)
    expect(m.floor).toBe(Math.floor)
    expect(m.PI).toBe(Math.PI)
    expect(Object.isFrozen(m)).toBe(true)
  })
})
