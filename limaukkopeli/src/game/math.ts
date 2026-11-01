export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Euclidean modulo: always in [0, m). */
export const mod = (v: number, m: number) => ((v % m) + m) % m

/** Closes the gap to a target the way a spring with time constant `tau` would in `dt`. */
export const ease = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau))

/** The same for an angle, the short way round. */
export const easeAngle = (cur: number, target: number, dt: number, tau: number) => cur + Math.atan2(Math.sin(target - cur), Math.cos(target - cur)) * (1 - Math.exp(-dt / tau))

/** Overshoots its target a little and settles, for things that pop into place: 0 at u = 0 and before, 1 at u = 1 and after. */
export function easeOutBack(u: number) {
  const c = 1.70158
  const v = clamp01(u) - 1
  return 1 + (c + 1) * v * v * v + c * v * v
}

/** A soft thing's jiggle after a knock at `at`: it swings at `hz` from `amount` and dies away over `life` seconds; 0 before the knock and after it, and for a knock at -1 that never happened. With `hz` 0 it is a kick that just fades. */
export function jiggle(t: number, at: number, amount: number, hz: number, life: number) {
  const since = t - at
  if (at < 0 || since < 0 || since > life) return 0
  const fade = 1 - since / life
  return amount * fade * fade * Math.cos(since * hz * Math.PI * 2)
}

/** A number in [0, 1) from two numbers, the same every time: scatter that looks random but never moves between frames. */
export function hash(i: number, k: number) {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Seeded PRNG (mulberry32): decor and tests come out the same for the same seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
