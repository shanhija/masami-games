import '@fontsource-variable/fredoka'
import './styles.css'
import './map.css'

import { createRoot } from 'react-dom/client'

import { enterGame } from '../../profiles/src/profiles'
import { App } from './App'

// The saves of whoever plays in this tab; with nobody picked yet the page goes to the gallery instead.
const saves = enterGame('slime-guy')
if (saves !== null) createRoot(document.getElementById('root')!).render(<App saves={saves} />)
