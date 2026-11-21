import './profiles.css'

import { createRoot } from 'react-dom/client'

import type { GalleryGame } from './Editor'
import { Gallery } from './Gallery'
import { cardFolder, showDirectory } from './page'
import { FIRST_LANG, loadProfiles, SAVING_GAMES, type SavingGame } from './profiles'

// The games that keep saves, as their cards on this page show them: the editor lists them by these.
const games: GalleryGame[] = []
for (const card of document.querySelectorAll<HTMLAnchorElement>('.games a.game')) {
  const folder = cardFolder(card)
  if (!(SAVING_GAMES as readonly string[]).includes(folder)) continue
  games.push({ folder: folder as SavingGame, className: card.className, picture: card.querySelector('.picture')!.innerHTML })
}

// A browser that keeps no site data has no players to pick: it shows the games, which then play on saves kept in memory.
let keepsData = true
try {
  loadProfiles()
  sessionStorage.getItem('masami-profile')
} catch (e) {
  keepsData = false
  console.warn('This browser keeps no site data, so there are no players:', e)
}
if (keepsData) createRoot(document.getElementById('profiles')!).render(<Gallery games={games} />)
else {
  showDirectory(FIRST_LANG)
  document.body.dataset.screen = 'games'
}
