import { DIRECTORY, GAME_FOLDERS, type GameFolder } from './directory'
import { inLang, type Lang } from './lang'
import { GALLERY } from './words'

/**
 * The gallery's page in `lang`: its title and heading, and every card's name, line and players
 * from DIRECTORY. The root index.html holds only each card's link and picture.
 */
export function showDirectory(lang: Lang): void {
  document.documentElement.lang = lang
  document.title = inLang(GALLERY.title, lang)
  document.querySelector('.directory h1')!.textContent = inLang(GALLERY.pickGame, lang)
  for (const card of document.querySelectorAll<HTMLAnchorElement>('.games a.game')) {
    const words = DIRECTORY[cardFolder(card)]
    card.querySelector('.name')!.textContent = inLang(words.name, lang)
    card.querySelector('.blurb')!.textContent = inLang(words.blurb, lang)
    card.querySelector('.players')!.textContent = inLang(words.players, lang)
  }
}

/** The game a card of the root index.html leads to. A card for a folder the directory does not list is a mistake. */
export function cardFolder(card: HTMLAnchorElement): GameFolder {
  const folder = card.getAttribute('href')!.split('/')[0]!
  if (!(GAME_FOLDERS as readonly string[]).includes(folder)) throw new Error(`The card for ${folder} has no game in profiles/src/directory.ts`)
  return folder as GameFolder
}
