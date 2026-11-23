/**
 * Magic House: made code's Math, and the sim's own (engine/api.ts MATH).
 *
 * Two parts:
 * - The room's seeded stream: a mulberry32 generator whose whole state is one uint32, kept in the
 *   World (World.rng), so a clone of the world plays on with the same throws. `nextRandom(world)`
 *   draws from it; `streamState(seed)` turns a room's seed into a first state.
 * - sin, cos, tan, atan, atan2, exp, log, pow and hypot computed from + - * /, sqrt and the IEEE
 *   bits of a double only: a port of fdlibm (as musl carries it). The browsers' own may differ in
 *   the last bit between V8 and JavaScriptCore, and one bit can flip a borderline pass, so made
 *   code and the sim both use these. Every operation here is IEEE double arithmetic rounded to
 *   nearest, exact integer work on the bits, or Math.sqrt / abs / floor / trunc, which every
 *   engine gets exactly right, so the results are the same to the bit everywhere.
 * - asin, acos, sinh, cosh, tanh, their inverses, expm1, log1p, log2, log10 and cbrt, built from
 *   those. The rest of made code's Math (floor, abs, min, max, sqrt, the constants) is the page's,
 *   which is exact.
 *
 * Arguments of sin, cos and tan past 2^20 * pi/2 (about 1.6 million) are first taken modulo the
 * double nearest 2 pi with `%`, which is exact in every engine, instead of fdlibm's long table of pi:
 * the result is still the same everywhere and in range, but no longer the page's. Nothing in a room
 * turns that far. fdlibm is not correctly rounded everywhere, so a few results differ from V8's by
 * an ulp (exp(1) is 2.7182818284590455, as Java's StrictMath gives it); what matters is that they are
 * the same on every engine.
 */

// ------------------------------------------------------------------------------ the bits of a double

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
/** Which of the two words holds the sign and the exponent: the second on a little-endian machine. */
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0
const LO = 1 - HI

/** The high word, as a signed 32-bit integer (the sign bit is its sign). */
function high(x: number): number {
  f64[0] = x
  return u32[HI] | 0
}
/** The low word, unsigned. */
function low(x: number): number {
  f64[0] = x
  return u32[LO]
}
/** The double made of these two words. */
function words(hi: number, lo: number): number {
  u32[HI] = hi >>> 0
  u32[LO] = lo >>> 0
  return f64[0]
}
/** x with its low word cleared: fdlibm's SET_LOW_WORD(x, 0). */
function cutLow(x: number): number {
  f64[0] = x
  u32[LO] = 0
  return f64[0]
}
/** x with its high word replaced. */
function withHigh(x: number, hi: number): number {
  f64[0] = x
  u32[HI] = hi >>> 0
  return f64[0]
}

/** x times 2^n, exactly where the result is representable (musl's scalbn). */
function scalbn(x: number, n: number): number {
  let y = x
  if (n > 1023) {
    y *= 8.98846567431158e307 // 2^1023
    n -= 1023
    if (n > 1023) {
      y *= 8.98846567431158e307
      n -= 1023
      if (n > 1023) n = 1023
    }
  } else if (n < -1022) {
    y *= 2.2250738585072014e-308 * 9007199254740992 // 2^-1022 * 2^53
    n += 1022 - 53
    if (n < -1022) {
      y *= 2.2250738585072014e-308 * 9007199254740992
      n += 1022 - 53
      if (n < -1022) n = -1022
    }
  }
  return y * words((0x3ff + n) << 20, 0)
}

// ------------------------------------------------------------------------------ the seeded stream

/** A first state of the stream for a room's seed: any number gives a uint32, the same everywhere. */
export function streamState(seed: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** The next throw of a stream whose state is `state`: [the throw in [0, 1), the new state]. mulberry32. */
export function nextThrow(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0
  let t = Math.imul(s ^ (s >>> 15), s | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

/** Draws from the room's own stream, which lives in the world: made code's Math.random. */
export function nextRandom(world: { rng: number }): number {
  const [v, s] = nextThrow(world.rng)
  world.rng = s
  return v
}

// ------------------------------------------------------------------------------ sin, cos and tan

const TOINT = 1.5 / 2.220446049250313e-16
/** Past this high word, |x| >= 2^20 * pi/2: sin, cos and tan take x modulo TWO_PI first. */
const MEDIUM = 0x413921fb
const TWO_PI = 6.283185307179586
const PIO4 = 7.85398163397448278999e-1
const INVPIO2 = 6.36619772367581382433e-1
const PIO2_1 = 1.57079632673412561417
const PIO2_1T = 6.07710050650619224932e-11
const PIO2_2 = 6.0771005063039659766e-11
const PIO2_2T = 2.02226624879595063154e-21
const PIO2_3 = 2.0222662487111664558e-21
const PIO2_3T = 8.47842766036889956997e-32

/** x reduced by pi/2: x = n * pi/2 + (y0 + y1), |y0 + y1| <= pi/4. Gives n mod 4 and sets REM. fdlibm's medium case, used for every size. */
const REM = [0, 0]
function remPio2(x: number): number {
  const ix = high(x) & 0x7fffffff
  let fn = x * INVPIO2 + TOINT - TOINT
  let r = x - fn * PIO2_1
  let w = fn * PIO2_1T
  if (r - w < -PIO4) {
    fn--
    r = x - fn * PIO2_1
    w = fn * PIO2_1T
  } else if (r - w > PIO4) {
    fn++
    r = x - fn * PIO2_1
    w = fn * PIO2_1T
  }
  let y0 = r - w
  const ex = ix >>> 20
  let ey = (high(y0) >>> 20) & 0x7ff
  if (ex - ey > 16) {
    let t = r
    w = fn * PIO2_2
    r = t - w
    w = fn * PIO2_2T - (t - r - w)
    y0 = r - w
    ey = (high(y0) >>> 20) & 0x7ff
    if (ex - ey > 49) {
      t = r
      w = fn * PIO2_3
      r = t - w
      w = fn * PIO2_3T - (t - r - w)
      y0 = r - w
    }
  }
  REM[0] = y0
  REM[1] = r - y0 - w
  // fn is a whole number held exactly: its remainder by 4 is exact too.
  return ((fn % 4) + 4) % 4
}

const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.98412698298579493134e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.58969099521155010221e-10

function kSin(x: number, y: number, iy: boolean): number {
  const z = x * x
  const w = z * z
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6)
  const v = z * x
  if (!iy) return x + v * (S1 + z * r)
  return x - (z * (0.5 * y - v * r) - y - v * S1)
}

const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.0875723212981748279e-9
const C6 = -1.13596475577881948265e-11

function kCos(x: number, y: number): number {
  const z = x * x
  let w = z * z
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6))
  const hz = 0.5 * z
  w = 1 - hz
  return w + (1 - w - hz + (z * r - x * y))
}

const T = [
  3.33333333333334091986e-1, 1.33333333333201242699e-1, 5.39682539762260521377e-2, 2.18694882948595424599e-2, 8.86323982359930005737e-3, 3.59207910759131235356e-3,
  1.45620945432529025516e-3, 5.88041240820264096874e-4, 2.46463134818469906812e-4, 7.817944429395570923e-5, 7.14072491382608190305e-5, -1.85586374855275456654e-5,
  2.59073051863633712884e-5,
]
const PIO4LO = 3.06161699786838301793e-17

function kTan(x: number, y: number, odd: boolean): number {
  const hx = high(x)
  const big = (hx & 0x7fffffff) >= 0x3fe59428
  const negative = hx < 0
  if (big) {
    if (negative) {
      x = -x
      y = -y
    }
    x = PIO4 - x + (PIO4LO - y)
    y = 0
  }
  const z = x * x
  let w = z * z
  let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))))
  let v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))))
  let s = z * x
  r = y + z * (s * (r + v) + y) + s * T[0]
  w = x + r
  if (big) {
    s = odd ? -1 : 1
    v = s - 2 * (x + (r - (w * w) / (w + s)))
    return negative ? -v : v
  }
  if (!odd) return w
  const w0 = cutLow(w)
  v = r - (w0 - x)
  const a = -1 / w
  const a0 = cutLow(a)
  return a0 + a * (1 + a0 * w0 + a0 * v)
}

export function sin(x: number): number {
  let ix = high(x) & 0x7fffffff
  if (ix >= MEDIUM && ix < 0x7ff00000) {
    x %= TWO_PI
    ix = high(x) & 0x7fffffff
  }
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e500000) return x
    return kSin(x, 0, false)
  }
  if (ix >= 0x7ff00000) return x - x
  const n = remPio2(x)
  if (n === 0) return kSin(REM[0], REM[1], true)
  if (n === 1) return kCos(REM[0], REM[1])
  if (n === 2) return -kSin(REM[0], REM[1], true)
  return -kCos(REM[0], REM[1])
}

export function cos(x: number): number {
  let ix = high(x) & 0x7fffffff
  if (ix >= MEDIUM && ix < 0x7ff00000) {
    x %= TWO_PI
    ix = high(x) & 0x7fffffff
  }
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e46a09e) return 1
    return kCos(x, 0)
  }
  if (ix >= 0x7ff00000) return x - x
  const n = remPio2(x)
  if (n === 0) return kCos(REM[0], REM[1])
  if (n === 1) return -kSin(REM[0], REM[1], true)
  if (n === 2) return -kCos(REM[0], REM[1])
  return kSin(REM[0], REM[1], true)
}

export function tan(x: number): number {
  let ix = high(x) & 0x7fffffff
  if (ix >= MEDIUM && ix < 0x7ff00000) {
    x %= TWO_PI
    ix = high(x) & 0x7fffffff
  }
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e400000) return x
    return kTan(x, 0, false)
  }
  if (ix >= 0x7ff00000) return x - x
  const n = remPio2(x)
  return kTan(REM[0], REM[1], (n & 1) === 1)
}

// ------------------------------------------------------------------------------ atan and atan2

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558]
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
]

export function atan(x: number): number {
  const hx = high(x)
  const negative = hx < 0
  const ix = hx & 0x7fffffff
  if (ix >= 0x44100000) {
    if (x !== x) return x
    const z = ATANHI[3] + 7.52316384526264e-37
    return negative ? -z : z
  }
  let id: number
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e400000) return x
    id = -1
  } else {
    x = Math.abs(x)
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0
        x = (2 * x - 1) / (2 + x)
      } else {
        id = 1
        x = (x - 1) / (x + 1)
      }
    } else if (ix < 0x40038000) {
      id = 2
      x = (x - 1.5) / (1 + 1.5 * x)
    } else {
      id = 3
      x = -1 / x
    }
  }
  let z = x * x
  const w = z * z
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))))
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))))
  if (id < 0) return x - x * (s1 + s2)
  z = ATANHI[id] - (x * (s1 + s2) - ATANLO[id] - x)
  return negative ? -z : z
}

const PI = 3.141592653589793116
const PI_LO = 1.2246467991473531772e-16

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y
  let ix = high(x)
  const lx = low(x)
  let iy = high(y)
  const ly = low(y)
  if (ix === 0x3ff00000 && lx === 0) return atan(y)
  const m = ((iy >>> 31) & 1) | ((ix >>> 30) & 2)
  ix &= 0x7fffffff
  iy &= 0x7fffffff
  if ((iy | ly) === 0) {
    if (m === 0 || m === 1) return y
    return m === 2 ? PI : -PI
  }
  if ((ix | lx) === 0) return m & 1 ? -PI / 2 : PI / 2
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return [PI / 4, -PI / 4, (3 * PI) / 4, (-3 * PI) / 4][m]
    return [0, -0, PI, -PI][m]
  }
  if (ix + (64 << 20) < iy || iy === 0x7ff00000) return m & 1 ? -PI / 2 : PI / 2
  const z = m & 2 && iy + (64 << 20) < ix ? 0 : atan(Math.abs(y / x))
  if (m === 0) return z
  if (m === 1) return -z
  if (m === 2) return PI - (z - PI_LO)
  return z - PI_LO - PI
}

// ------------------------------------------------------------------------------ exp and log

const LN2HI = 6.9314718036912381649e-1
const LN2LO = 1.90821492927058770002e-10
const INVLN2 = 1.442695040888963387
const P1 = 1.66666666666666019037e-1
const P2 = -2.77777777770155933842e-3
const P3 = 6.61375632143793436117e-5
const P4 = -1.6533902205465251539e-6
const P5 = 4.13813679705723846039e-8

export function exp(x: number): number {
  if (x !== x) return x
  const hx = high(x)
  const negative = hx < 0
  const ax = hx & 0x7fffffff
  if (ax >= 0x4086232b) {
    if (x > 709.782712893383973096) return x * 8.98846567431158e307
    if (x < -745.13321910194110842) return 0
  }
  let hi: number
  let lo: number
  let k: number
  if (ax > 0x3fd62e42) {
    k = ax >= 0x3ff0a2b2 ? Math.trunc(INVLN2 * x + (negative ? -0.5 : 0.5)) : negative ? -1 : 1
    hi = x - k * LN2HI
    lo = k * LN2LO
    x = hi - lo
  } else if (ax > 0x3e300000) {
    k = 0
    hi = x
    lo = 0
  } else {
    return 1 + x
  }
  const xx = x * x
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))))
  const y = 1 + ((x * c) / (2 - c) - lo + hi)
  return k === 0 ? y : scalbn(y, k)
}

const LG1 = 6.666666666666735130e-1
const LG2 = 3.999999999940941908e-1
const LG3 = 2.857142874366239149e-1
const LG4 = 2.222219843214978396e-1
const LG5 = 1.818357216161805012e-1
const LG6 = 1.531383769920937332e-1
const LG7 = 1.479819860511658591e-1

export function log(x: number): number {
  let hx = high(x) >>> 0
  let lx = low(x)
  let k = 0
  if (hx < 0x00100000 || hx >>> 31) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity
    if (hx >>> 31) return NaN
    k -= 54
    x *= 18014398509481984 // 2^54
    hx = high(x) >>> 0
    lx = low(x)
  } else if (hx >= 0x7ff00000) {
    return x
  } else if (hx === 0x3ff00000 && lx === 0) {
    return 0
  }
  hx += 0x3ff00000 - 0x3fe6a09e
  k += (hx >>> 20) - 0x3ff
  hx = (hx & 0x000fffff) + 0x3fe6a09e
  x = words(hx, lx)
  const f = x - 1
  const hfsq = 0.5 * f * f
  const s = f / (2 + f)
  const z = s * s
  const w = z * z
  const t1 = w * (LG2 + w * (LG4 + w * LG6))
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  const r = t2 + t1
  return s * (hfsq + r) + k * LN2LO - hfsq + f + k * LN2HI
}

// ------------------------------------------------------------------------------ pow

const BP = [1, 1.5]
const DP_H = [0, 5.84962487220764160156e-1]
const DP_L = [0, 1.35003920212974897128e-8]
const TWO53 = 9007199254740992
const HUGE = 1e300
const TINY = 1e-300
const L1 = 5.99999999999994648725e-1
const L2 = 4.28571428578550184252e-1
const L3 = 3.33333329818377432918e-1
const L4 = 2.72728123808534006489e-1
const L5 = 2.30660745775561754067e-1
const L6 = 2.06975017800338417784e-1
const LG2_ = 6.93147180559945286227e-1
const LG2_H = 6.93147182464599609375e-1
const LG2_L = -1.90465429995776804525e-9
const OVT = 8.0085662595372944372e-17
const CP = 9.61796693925975554329e-1
const CP_H = 9.61796700954437255859e-1
const CP_L = -7.02846165095275826516e-9
const IVLN2 = 1.442695040888963387
const IVLN2_H = 1.44269502162933349609
const IVLN2_L = 1.92596299112661746887e-8

/** fdlibm's e_pow.c, whose special cases already agree with JavaScript's (1 ** Infinity is NaN). */
export function pow(x: number, y: number): number {
  const hx = high(x)
  const lx = low(x)
  const hy = high(y)
  const ly = low(y)
  let ix = hx & 0x7fffffff
  const iy = hy & 0x7fffffff

  if ((iy | ly) === 0) return 1
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y

  // Whether y is an odd whole number (1), an even one (2) or not whole (0), when x < 0.
  let yisint = 0
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2
    else if (iy >= 0x3ff00000) {
      const e = (iy >> 20) - 0x3ff
      if (e > 20) {
        const j = ly >>> (52 - e)
        if (((j << (52 - e)) >>> 0) === ly) yisint = 2 - (j & 1)
      } else if (ly === 0) {
        const j = iy >> (20 - e)
        if (j << (20 - e) === iy) yisint = 2 - (j & 1)
      }
    }
  }

  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return y - y
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0
      return hy < 0 ? -y : 0
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x
    if (hy === 0x40000000) return x * x
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x)
  }

  let ax = Math.abs(x)
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    let z = ax
    if (hy < 0) z = 1 / z
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN
      else if (yisint === 1) z = -z
    }
    return z
  }

  let n = (hx >>> 31) === 1 ? 0 : 1
  if ((n | yisint) === 0) return NaN
  const s = n === 0 && yisint === 1 ? -1 : 1

  let t1: number
  let t2: number
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? HUGE * HUGE : TINY * TINY
      if (ix >= 0x3ff00000) return hy > 0 ? HUGE * HUGE : TINY * TINY
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * HUGE * HUGE : s * TINY * TINY
    if (ix > 0x3ff00000) return hy > 0 ? s * HUGE * HUGE : s * TINY * TINY
    const t = ax - 1
    const w = t * t * (0.5 - t * (0.3333333333333333333333 - t * 0.25))
    const u = IVLN2_H * t
    const v = t * IVLN2_L - w * IVLN2
    t1 = cutLow(u + v)
    t2 = v - (t1 - u)
  } else {
    n = 0
    if (ix < 0x00100000) {
      ax *= TWO53
      n -= 53
      ix = high(ax)
    }
    n += (ix >> 20) - 0x3ff
    const j = ix & 0x000fffff
    let k: number
    ix = j | 0x3ff00000
    if (j <= 0x3988e) k = 0
    else if (j < 0xbb67a) k = 1
    else {
      k = 0
      n += 1
      ix -= 0x00100000
    }
    ax = withHigh(ax, ix)
    let u = ax - BP[k]
    let v = 1 / (ax + BP[k])
    const ss = u * v
    const sH = cutLow(ss)
    let tH = words(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0)
    let tL = ax - (tH - BP[k])
    const sL = v * (u - sH * tH - sH * tL)
    let s2 = ss * ss
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))))
    r += sL * (sH + ss)
    s2 = sH * sH
    tH = cutLow(3 + s2 + r)
    tL = r - (tH - 3 - s2)
    u = sH * tH
    v = sL * tH + tL * ss
    const pH = cutLow(u + v)
    const pL = v - (pH - u)
    const zH = CP_H * pH
    const zL = CP_L * pH + pL * CP + DP_L[k]
    const t = n
    t1 = cutLow(zH + zL + DP_H[k] + t)
    t2 = zL - (t1 - t - DP_H[k] - zH)
  }

  const y1 = cutLow(y)
  const pL = (y - y1) * t1 + y * t2
  let pH = y1 * t1
  let z = pL + pH
  let j = high(z)
  const i = low(z)
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * HUGE * HUGE
    if (pL + OVT > z - pH) return s * HUGE * HUGE
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if (((j - (0xc090cc00 | 0)) | i) !== 0) return s * TINY * TINY
    if (pL <= z - pH) return s * TINY * TINY
  }

  const ij = j & 0x7fffffff
  let k = (ij >> 20) - 0x3ff
  n = 0
  if (ij > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1))
    k = ((n & 0x7fffffff) >> 20) - 0x3ff
    const t = words(n & ~(0x000fffff >> k), 0)
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k)
    if (j < 0) n = -n
    pH -= t
  }
  const t = cutLow(pL + pH)
  const u = t * LG2_H
  const v = (pL - (t - pH)) * LG2_ + t * LG2_L
  z = u + v
  const w = v - (z - u)
  const tt = z * z
  const tq = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))))
  const r = (z * tq) / (tq - 2) - (w + z * w)
  z = 1 - (r - z)
  j = high(z) + (n << 20)
  if (j >> 20 <= 0) z = scalbn(z, n)
  else z = withHigh(z, j)
  return s * z
}

// ------------------------------------------------------------------------------ hypot

const SPLIT = 134217729 // 2^27 + 1

/** musl's hypot of two: the squares carried in two parts each, so the sum under the root is nearly exact. */
function hypot2(x: number, y: number): number {
  x = Math.abs(x)
  y = Math.abs(y)
  if (x !== x || y !== y) return x === Infinity || y === Infinity ? Infinity : NaN
  if (x < y) {
    const t = x
    x = y
    y = t
  }
  const ex = high(x) >>> 20
  const ey = high(y) >>> 20
  if (x === Infinity) return x
  if (y === 0) return x
  if (ex - ey > 64) return x + y
  let z = 1
  if (ex > 0x3ff + 510) {
    z = 5.260135901548374e210 // 2^700
    x *= 1.90109156629516e-211
    y *= 1.90109156629516e-211
  } else if (ey < 0x3ff - 450) {
    z = 1.90109156629516e-211 // 2^-700
    x *= 5.260135901548374e210
    y *= 5.260135901548374e210
  }
  const sq = (v: number): [number, number] => {
    const c = v * SPLIT
    const h = v - c + c
    const l = v - h
    const hi = v * v
    return [hi, h * h - hi + 2 * h * l + l * l]
  }
  const [hx, lx] = sq(x)
  const [hy, ly] = sq(y)
  return z * Math.sqrt(ly + lx + hy + hx)
}

/** As JavaScript's Math.hypot, for any count of arguments: folded two at a time, left to right. */
export function hypot(...values: number[]): number {
  let h = 0
  for (const v of values) h = hypot2(h, v)
  return h
}

// ------------------------------------------------------------------------------ the rest, from the parts above

/*
 * The page's other transcendental functions differ between engines too, so made code gets these,
 * built from the exact parts above and + - * / and sqrt. They are not correctly rounded (a few ulps
 * off the page's at worst), but they are the same on every engine, which is what matters.
 */

export function asin(x: number): number {
  return atan2(x, Math.sqrt((1 - x) * (1 + x)))
}

export function acos(x: number): number {
  return atan2(Math.sqrt((1 - x) * (1 + x)), x)
}

/** log(1 + x), right for x near 0: the error of 1 + x is divided out. */
export function log1p(x: number): number {
  const u = 1 + x
  if (u === 1) return x
  if (u === Infinity) return Infinity
  return (log(u) * x) / (u - 1)
}

/** exp(x) - 1, right for x near 0. */
export function expm1(x: number): number {
  const u = exp(x)
  if (u === 1) return x
  const um = u - 1
  if (um === -1 || u === Infinity) return um
  return (um * x) / log(u)
}

export function sinh(x: number): number {
  if (Math.abs(x) < 1e-8) return x
  const e = exp(x)
  return (e - 1 / e) / 2
}

export function cosh(x: number): number {
  const e = exp(x)
  return (e + 1 / e) / 2
}

export function tanh(x: number): number {
  if (x > 20) return 1
  if (x < -20) return -1
  if (Math.abs(x) < 1e-8) return x
  const e = expm1(2 * x)
  return e / (e + 2)
}

export function asinh(x: number): number {
  const a = Math.abs(x)
  const r = a < 0.5 ? log1p(a + (a * a) / (1 + Math.sqrt(1 + a * a))) : a < 2 ** 28 ? log(2 * a + 1 / (Math.sqrt(a * a + 1) + a)) : log(a) + Math.LN2
  return x < 0 ? -r : r
}

export function acosh(x: number): number {
  if (!(x >= 1)) return NaN
  return x < 2 ** 28 ? log(x + Math.sqrt(x * x - 1)) : log(x) + Math.LN2
}

export function atanh(x: number): number {
  const a = Math.abs(x)
  if (a > 1 || Number.isNaN(x)) return NaN
  const r = a === 1 ? Infinity : 0.5 * log1p((2 * a) / (1 - a))
  return x < 0 || Object.is(x, -0) ? -r : r
}

/** The cube root, with the sign, and one Newton step so whole cubes come out whole. */
export function cbrt(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x
  const a = Math.abs(x)
  let r = pow(a, 1 / 3)
  r -= (r * r * r - a) / (3 * r * r)
  return x < 0 ? -r : r
}

/** log to a base, exact where x is a whole power of it. */
function logBase(x: number, base: number, ln: number): number {
  const r = log(x) / ln
  const n = Math.round(r)
  return Math.abs(r - n) < 1e-9 && pow(base, n) === x ? n : r
}

export function log2(x: number): number {
  return logBase(x, 2, Math.LN2)
}

export function log10(x: number): number {
  return logBase(x, 10, Math.LN10)
}

// ------------------------------------------------------------------------------ made code's Math

/** What made code's Math replaces of the page's: the seeded random and the functions above. */
export type MadeMath = Math

/**
 * Made code's Math: the page's Math with random drawn from `random` (the builder passes the room's
 * stream, which throws inside a mover's place, or the walkthrough's own) and every transcendental
 * function above. What stays the page's (floor, ceil, round, trunc, abs, sign, min, max, sqrt, fround,
 * imul, clz32 and the constants) is exact in every engine. Frozen, so made code cannot swap a function
 * for its own.
 */
export function madeMath(random: () => number): MadeMath {
  const m = Object.create(null) as Record<string, unknown>
  for (const key of Object.getOwnPropertyNames(Math)) m[key] = (Math as unknown as Record<string, unknown>)[key]
  Object.assign(m, { random, sin, cos, tan, atan, atan2, exp, log, pow, hypot, asin, acos, sinh, cosh, tanh, asinh, acosh, atanh, expm1, log1p, log2, log10, cbrt })
  return Object.freeze(m) as unknown as MadeMath
}
