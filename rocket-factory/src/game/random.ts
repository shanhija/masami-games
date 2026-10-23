/**
 * A seeded random number generator (mulberry32) whose state is one 32-bit number, so a seed
 * replays the same numbers: the scripted children, the demos, the fuzz and the sounds' variety
 * draw from it, each with a seed of its own. No sim rule draws a random number (model.ts,
 * Determinism). Nothing in game/ calls Math.random; particles in draw/ may.
 */

/** The next number in [0, 1) and the generator's next state. */
export function next(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

/** A generator over a seed, for code that draws many numbers in a row. */
export function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    const [u, n] = next(s)
    s = n
    return u
  }
}

/** An integer in [lo, hi] from u in [0, 1). */
export const between = (u: number, lo: number, hi: number) => lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)))
