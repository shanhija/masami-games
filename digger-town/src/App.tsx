import { Component, lazy, Suspense, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'

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

function previewFor(name: string): ComponentType {
  const load = previews[`./scene/${name}Preview.tsx`]
  if (load === undefined) throw new Error(`${name}Preview.tsx is not written yet`)
  return lazy(async () => ({ default: (await load()).Preview }))
}

const q = new URLSearchParams(location.search)
const Tuning: ComponentType | null = q.has('world') ? previewFor('World') : q.has('builds') ? previewFor('Build') : q.has('look') || q.has('animal') ? Viewer : null

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
function Play({ saves }: { saves: Saves }) {
  const [game] = useState(() => createBrowserGame(saves))
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

export function App({ saves }: { saves: Saves }) {
  return (
    <Oops>
      <Suspense fallback={null}>{Tuning === null ? <Play saves={saves} /> : <Tuning />}</Suspense>
    </Oops>
  )
}
