/** The quiz's chance, from a `random` the caller gives (Math.random on the page, a seeded one in tests). */

/** A whole number from `lo` to `hi`, both in. */
export const between = (lo: number, hi: number, random: () => number) => lo + Math.floor(random() * (hi - lo + 1))

/** One of a list, by chance. */
export const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]!

/** A list in an order of chance. */
export function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
