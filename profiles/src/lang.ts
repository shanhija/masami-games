/**
 * The two languages every game plays in. A player picks one with a flag in the gallery's
 * editor (`Profile.lang`), and every word a child sees or hears follows it: a game reads it
 * once, from `enterGame` or `playerLang`, when it starts. A game's words come in both
 * languages side by side, `{ en, fi }`, and are picked where they are shown, never stored.
 * plans/finnish-and-english.md has the whole of it.
 */

import { DIRECTORY, type GameFolder } from './directory'

export type Lang = 'fi' | 'en'
export const LANGS: readonly Lang[] = ['fi', 'en']

/** Words for the child in both languages. Both are required, so the compiler finds a missing one. */
export interface Words {
  readonly en: string
  readonly fi: string
}

/** The words in `lang`. */
export function inLang(words: Words, lang: Lang): string {
  return words[lang]
}

/** The browser's tag for each language: its voices, its recognizers and `<html lang>`. The repo writes British English. */
export const SPEECH_TAG: Record<Lang, string> = { fi: 'fi-FI', en: 'en-GB' }

/** Each language's own name, the same whichever is picked, so whoever cannot read the other one still finds theirs. */
export const LANG_NAMES: Record<Lang, string> = { fi: 'Suomi', en: 'English' }

/** What a game page does first: says the page's language, so the browser reads and spells it so, and names the tab after the game in it. */
export function startPage(game: GameFolder, lang: Lang): void {
  document.documentElement.lang = lang
  document.title = DIRECTORY[game].name[lang]
}
