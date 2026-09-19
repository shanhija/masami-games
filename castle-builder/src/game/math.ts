export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

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
