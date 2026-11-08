/**
 * The language the game is played in, from the pause card's setting: what the child is heard
 * in, what every bubble, line and label shows, what the voices say, and what the starting cast
 * are called. Words the game itself shows come in both languages and are picked here.
 */

import type { World } from './types'

export type Lang = 'fi' | 'en'
export const LANGS: readonly Lang[] = ['fi', 'en']

/**
 * Words for the child in both languages, or one string shown as it is in both: a name, a
 * number, or the child's own words.
 */
export type Words = string | { readonly en: string; readonly fi: string }

/** The words in `lang`. */
export function inLang(words: Words, lang: Lang): string {
  return typeof words === 'string' ? words : words[lang]
}

/** Words as made code hands them over, untrusted: both languages ({ en, fi }), a string or a number as it is, and any other object as nothing. */
export function wordsOf(v: unknown, lang: Lang): string {
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const mine = o[lang]
    const other = o[lang === 'fi' ? 'en' : 'fi']
    if (typeof mine === 'string' && mine.trim() !== '') return mine
    if (typeof other === 'string') return other
  }
  return typeof v === 'object' && v !== null ? '' : String(v ?? '')
}

/** A starting avatar's name and the ways a recognizer may write it, in each language. */
export type CastNames = Record<Lang, { readonly name: string; readonly calls: readonly string[] }>

/** Plays the world in `lang` from now on: the starting avatars the child has not named take that language's name and calls. */
export function useLang(world: World, lang: Lang): void {
  world.lang = lang
  for (const a of world.actors) {
    if (a.names === null) continue
    const n = a.names[lang]
    a.name = n.name
    a.calls = [...new Set([...n.calls, n.name, a.id].map((c) => c.toLowerCase().trim()).filter((c) => c !== ''))]
  }
}
