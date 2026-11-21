/** The little numbers every part of the game needs. */

export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mod = (v: number, m: number) => ((v % m) + m) % m

/** 0 below `a`, 1 above `b`, a smooth hill between. */
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** The shortest turn from angle `a` to angle `b`, from -PI to PI. */
export const turnTo = (a: number, b: number) => mod(b - a + Math.PI, TAU) - Math.PI

/** `v` moved toward `to` by at most `step`. */
export const toward = (v: number, to: number, step: number) => (v < to ? Math.min(v + step, to) : Math.max(v - step, to))

/** How far a value closes on its target in `dt` seconds at this rate: use as lerp(v, to, damp(rate, dt)). */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

/** A local point of something at (x, z) with this yaw, in the world. */
export const localX = (x: number, yaw: number, lx: number, lz: number) => x + lx * Math.cos(yaw) + lz * Math.sin(yaw)
export const localZ = (z: number, yaw: number, lx: number, lz: number) => z - lx * Math.sin(yaw) + lz * Math.cos(yaw)

/** Chase's small seeded random generator: the same seed gives the same numbers, 0 to 1. */
export { mulberry32 } from '../../../chase/src/game/random'
