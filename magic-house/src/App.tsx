import { lazy, Suspense, type ComponentType, type CSSProperties } from 'react'

import type { Lang } from '../../profiles/src/lang'
import { palette } from '../../silly-billy/src/scene/look'
import type { HouseLink } from './library/source'
import type { DevicePlayer } from './saves'
import { HOUSE_ROOMS } from './shell/doors'
import { Game } from './shell/Game'
import { SoundsPage } from './shell/SoundsPage'

/** Silly Billy's colours as the stylesheet's variables: its sky over its meadow with blooms in the grass, a gold sun with a glint round it, and its ink for every line. */
export const LOOK = {
  '--sky-high': palette.skyLight,
  '--sky': palette.sky,
  '--grass': palette.grass[0],
  '--grass-dark': palette.grassDark,
  '--pink': palette.blooms[0],
  '--gold': palette.blooms[1],
  '--white': palette.white,
  '--purple': palette.blooms[3],
  '--glint': palette.glint,
  '--ink': palette.ink,
} as CSSProperties

/** The developer's sheets, one in each folder that has one: `?sheet=scene` shows scene/Sheet.tsx. Each loads only when asked for. */
const SHEETS = import.meta.glob<{ Sheet: ComponentType<{ lang: Lang }> }>('./*/Sheet.tsx')

/** The sheet the page was asked for with ?sheet=<folder>, or null for the game. */
function askedSheet(): ComponentType<{ lang: Lang }> | null {
  const name = new URLSearchParams(location.search).get('sheet')
  if (name === null) return null
  const load = SHEETS[`./${name}/Sheet.tsx`]
  if (load === undefined) throw new Error(`Magic House has no sheet ${name}; it has ${Object.keys(SHEETS).join(', ') || 'none yet'}`)
  return lazy(() => load().then((m) => ({ default: m.Sheet })))
}
const SHEET = askedSheet()

/** ?sounds: the page that plays every sound by its name, for a parent to hear them first. */
const SOUNDS = new URLSearchParams(location.search).has('sounds')

/** Magic House: the game with the house's doors, played by the device's players (the picked one first, each with their saves and language) with the library and the dev server's line through `link`, with ?sounds the page of every sound, or with ?sheet=<folder> that folder's sheet. */
export function App({ lang, players, link }: { lang: Lang; players: readonly DevicePlayer[]; link: HouseLink }) {
  return (
    <div className="mh-root" style={LOOK}>
      {SOUNDS ? (
        <SoundsPage lang={lang} />
      ) : SHEET !== null ? (
        <Suspense fallback={null}>
          <SHEET lang={lang} />
        </Suspense>
      ) : (
        <Game lang={lang} players={players} own={HOUSE_ROOMS} link={link} />
      )}
    </div>
  )
}
