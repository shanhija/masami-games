/**
 * The sentence Whisper is primed with for each clip: in the game's language, the names of the
 * avatars here and each of them told to do something the game knows. Whisper reads it as the
 * words said just before the clip, so it writes the names as they are written here, keeps to
 * the language, and expects what a child says: a name, a comma, what to do. Measured on Finnish
 * clips made child-like, against the names alone, the right avatar was named in 70% of the clips
 * instead of 62%, and a wrong one no more often (7%).
 */

import type { Lang } from '../engine/lang'

/** More names than this make the prime long and say little more (Whisper reads at most about 220 tokens of it). */
const MAX_NAMES = 16

/** Short things the game knows how to do, told to the names in turn. */
const TOLD: Record<Lang, readonly string[]> = {
  fi: ['hyppää', 'juokse', 'istu', 'laula', 'tule tänne', 'pyöri', 'vilkuta', 'nuku'],
  en: ['jump', 'run', 'sit', 'sing', 'come here', 'spin', 'wave', 'sleep'],
}

/** A few sentences in `lang` that name everyone in `names` (each once, in the order given) and tell each to do something. */
export function hearingPrime(lang: Lang, names: readonly string[]): string {
  const all = [...new Set(names.map((n) => n.replace(/\s+/g, ' ').trim()).filter((n) => n !== ''))].slice(0, MAX_NAMES)
  if (all.length === 0) return lang === 'fi' ? 'Leikitään yhdessä.' : "Let's play together."
  const list = all.length === 1 ? all[0]! : `${all.slice(0, -1).join(', ')} ${lang === 'fi' ? 'ja' : 'and'} ${all.at(-1)!}`
  const playing = lang === 'fi' ? `${list} ${all.length === 1 ? 'leikkii' : 'leikkivät'}.` : `${list} ${all.length === 1 ? 'is' : 'are'} playing.`
  const told = all.map((name, i) => `${name}, ${TOLD[lang][i % TOLD[lang].length]!}!`)
  return [playing, ...told].join(' ')
}
