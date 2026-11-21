import { Component, useMemo, type ReactNode } from 'react'

import type { Saves } from '../../profiles/src/profiles'
import { Sheet } from './draw/Sheet'
import { Stage } from './draw/Stage'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'

function Play({ saves }: { saves: Saves }) {
  const game = useMemo(() => new Game(location.search, saves), [saves])
  useGameInput(game)
  return (
    <>
      <Stage game={game} />
      <Hud game={game} />
    </>
  )
}

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

/** The game, or with ?sheet the sheet of every look instead. */
export function App({ saves }: { saves: Saves }) {
  return <Oops>{new URLSearchParams(location.search).has('sheet') ? <Sheet /> : <Play saves={saves} />}</Oops>
}
