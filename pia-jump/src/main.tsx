import '@fontsource-variable/fredoka'
import './styles.css'

import { createRoot } from 'react-dom/client'

import { startPage } from '../../profiles/src/lang'
import { enterGame } from '../../profiles/src/profiles'
import { App } from './App'

// The saves of whoever plays in this tab, and their language; with nobody picked yet the page goes to the gallery instead.
const entry = enterGame('pia-jump')
if (entry !== null) {
  startPage('pia-jump', entry.lang)
  createRoot(document.getElementById('root')!).render(<App saves={entry.saves} lang={entry.lang} />)
}
