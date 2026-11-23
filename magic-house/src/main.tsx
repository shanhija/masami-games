import '@fontsource-variable/fredoka'
import './styles.css'

import { createRoot } from 'react-dom/client'

import { startPage } from '../../profiles/src/lang'
import { enterGame } from '../../profiles/src/profiles'
import { App } from './App'
import { houseLink } from './library/source'
import { devicePlayers } from './saves'

// Whoever plays in this tab and their language, and the device's other players to join them, each with their own saves and language (plan.md, A party; saves.ts devicePlayers). With nobody picked yet the page goes to the gallery instead.
const entry = enterGame('magic-house')
if (entry !== null) {
  startPage('magic-house', entry.lang)
  createRoot(document.getElementById('root')!).render(<App lang={entry.lang} players={devicePlayers(entry)} link={houseLink()} />)
}
