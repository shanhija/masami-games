import './profiles.css'

import { createRoot } from 'react-dom/client'

import type { GalleryGame } from './Editor'
import { Gallery } from './Gallery'
import { loadProfiles, SAVING_GAMES, type SavingGame } from './profiles'

// The games that keep saves, as their cards on this page show them: the editor lists them by these.
const games: GalleryGame[] = []
for (const card of document.querySelectorAll<HTMLAnchorElement>('.games a.game')) {
  const folder = card.getAttribute('href')!.split('/')[0]
  if (!(SAVING_GAMES as readonly string[]).includes(folder)) continue
  games.push({ folder: folder as SavingGame, name: card.querySelector('.name')!.textContent!, className: card.className, picture: card.querySelector('.picture')!.innerHTML })
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
else document.body.dataset.screen = 'games'
