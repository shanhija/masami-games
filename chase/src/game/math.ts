export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Euclidean modulo: always in [0, m). */
export const mod = (v: number, m: number) => ((v % m) + m) % m
