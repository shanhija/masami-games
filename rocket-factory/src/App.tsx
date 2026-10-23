import { Component, useMemo, type ReactNode } from 'react'

import { Sheet } from './draw/Sheet'
import { Stage } from './draw/Stage'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'

function Play() {
  // The seed is the one random number the page picks, outside the sim (?seed overrides it), so every game rolls its own.
  const game = useMemo(() => new Game(location.search, Math.floor(Math.random() * 2 ** 31)), [])
  useGameInput(game)
  // A test run (?debug, ?nosave, ?demo, ?seed, ?autoplay): the game for a look from the console, and for the headless screenshots without ?debug's overlay.
  const w = game.url
  if (w.debug || w.nosave || w.demo !== null || w.seed !== null || w.autoplay) (window as unknown as { game: Game }).game = game
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

/** The game, or with ?sheet a sprite sheet instead. */
export function App() {
  return <Oops>{new URLSearchParams(location.search).has('sheet') ? <Sheet /> : <Play />}</Oops>
}
