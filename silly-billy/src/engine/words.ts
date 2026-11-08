/**
 * Matching a heard word to a name: the library's item kinds and actions, and the actors. A
 * child says 'pallolle' and means the ball called 'pallo'; a recognizer writes 'stive' for
 * Steve. Exact words win, then a known word with a Finnish ending, then one letter off (the
 * first letter kept: recognizers seldom miss the first sound, and 'lennä' is not 'mennä').
 */

const ENDINGS = new Set([
  'lle', 'lla', 'llä', 'lta', 'ltä', 'n', 'a', 'ä', 'aa', 'ää', 'ssa', 'ssä', 'sta', 'stä', 'seen', 'han', 'hin',
  'ksi', 't', 'in', 'ja', 'jä', 'ita', 'itä', 'ineen', 'ni', 'si', 'kin',
])

/** Lowercase, hyphens and underscores as spaces, spaces collapsed. */
export const normalWord = (word: string) => word.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

/** At most one letter added, dropped or changed. */
function oneOff(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** How a word fits a name: the name itself, the name with a Finnish ending, or one letter off it (a guess). */
export type MatchForm = 'exact' | 'ending' | 'near'

/**
 * The id whose words fit `word`, and how: one of them exactly; else the word is one of them
 * (4+ letters) followed by a Finnish ending, the longest such; else, for a word of 5+ letters,
 * one of them one letter off with the same first letter. Null if none.
 */
export function matchWordForm(word: string, entries: Iterable<{ id: string; words: readonly string[] }>): { id: string; form: MatchForm } | null {
  const w = normalWord(word)
  if (w === '') return null
  let ending: { id: string; length: number } | null = null
  let near: string | null = null
  for (const e of entries) {
    for (const raw of e.words) {
      const c = normalWord(raw)
      if (c === '') continue
      if (c === w) return { id: e.id, form: 'exact' }
      if (c.length >= 4 && w.length > c.length && w.startsWith(c) && ENDINGS.has(w.slice(c.length)) && (ending === null || c.length > ending.length)) ending = { id: e.id, length: c.length }
      if (near === null && w.length >= 5 && w[0] === c[0] && oneOff(w, c)) near = e.id
    }
  }
  if (ending !== null) return { id: ending.id, form: 'ending' }
  return near === null ? null : { id: near, form: 'near' }
}

/** The id whose words fit `word` as matchWordForm finds it; `near: false` leaves out a match one letter off. */
export function matchWord(word: string, entries: Iterable<{ id: string; words: readonly string[] }>, opts?: { near?: boolean }): string | null {
  const m = matchWordForm(word, entries)
  return m === null || (m.form === 'near' && opts?.near === false) ? null : m.id
}
