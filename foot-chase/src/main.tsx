import '@fontsource-variable/fredoka'
import './styles.css'

import { createRoot } from 'react-dom/client'

import { startPage } from '../../profiles/src/lang'
import { playerLang } from '../../profiles/src/profiles'
import { App } from './App'

// It keeps nothing, so it needs no player: only the language of whoever plays in this tab.
const lang = playerLang()
startPage('foot-chase', lang)
createRoot(document.getElementById('root')!).render(<App lang={lang} />)
