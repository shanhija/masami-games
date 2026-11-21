import { Component, lazy, Suspense, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'

import type { Lang } from '../../profiles/src/lang'
import type { Saves } from '../../profiles/src/profiles'

import { Controls } from './Controls'
import { createBrowserGame, useGameInput } from './game/game'
import { Hud } from './Hud'
import { Shop } from './Shop'
import { Title } from './Title'
import { Stage } from './scene/Stage'
import { Viewer } from './scene/Viewer'

/** The tuning views: `?world` the valley, `?builds` the buildings and plants. Found by name, so one not written yet is only a message. */
const previews = import.meta.glob<{ Preview: ComponentType }>('./scene/*Preview.tsx')

function previewFor(path: string): ComponentType {
  const load = previews[path]
  if (load === undefined) throw new Error(`${path} is not written yet`)
  return lazy(async () => ({ default: (await load()).Preview }))
}

const q = new URLSearchParams(location.search)
const Tuning: ComponentType | null = q.has('world') ? previewFor('./scene/WorldPreview.tsx') : q.has('builds') ? previewFor('./scene/BuildPreview.tsx') : q.has('look') || q.has('animal') ? Viewer : null

/** A bad URL switch (or anything else that breaks the page while it renders) shows its message on the page instead of a blank screen. */
class Oops extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error ? <pre className="oops">{this.state.error.message}</pre> : this.props.children
  }
}

/** The game: the stage under the HUD, the controls, the title and the shop. */
function Play({ saves, lang }: { saves: Saves; lang: Lang }) {
  const [game] = useState(() => createBrowserGame(saves, lang))
  useGameInput(game)
  return (
    <>
      <Stage game={game} />
      <Hud game={game} />
      <Controls game={game} />
      <Title game={game} />
      <Shop game={game} />
    </>
  )
}

export function App({ saves, lang }: { saves: Saves; lang: Lang }) {
  return (
    <Oops>
      <Suspense fallback={null}>{Tuning === null ? <Play saves={saves} lang={lang} /> : <Tuning />}</Suspense>
    </Oops>
  )
}
