import { Component, useMemo, type ReactNode } from 'react'

import type { Saves } from '../../profiles/src/profiles'

import { Controls } from './Controls'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'
import { MapHud } from './MapHud'
import { Stage } from './scene/Stage'
import { Wardrobe } from './Wardrobe'

/** The game: the one 3D stage, and over it each screen's HUD (each draws only on its own screen) and the touch buttons. */
function SlimeGuy({ saves }: { saves: Saves }) {
  const game = useMemo(() => new Game(saves), [saves])
  useGameInput(game)
  // A tuning visit (any URL switch) leaves the game on the window, for a look from the console and for headless screenshots.
  if (location.search !== '') (window as unknown as { game: Game }).game = game
  return (
    <>
      <Stage game={game} />
      <MapHud game={game} />
      <Wardrobe game={game} />
      <Hud game={game} />
      <Controls game={game} />
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

export function App({ saves }: { saves: Saves }) {
  return (
    <Oops>
      <SlimeGuy saves={saves} />
    </Oops>
  )
}
