import { Component, useMemo, type ReactNode } from 'react'

import type { Lang } from '../../profiles/src/lang'
import type { GameSaves } from '../../profiles/src/profiles'
import { Sheet } from './draw/Sheet'
import { Stage } from './draw/Stage'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'

function Play({ saves, lang }: { saves: GameSaves; lang: Lang }) {
  // The seed is the one random number the page picks, outside the sim (?seed overrides it), so every game rolls its own.
  const game = useMemo(() => new Game(location.search, Math.floor(Math.random() * 2 ** 31), saves, lang), [saves, lang])
  useGameInput(game, saves)
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

/** The game in the player's language, or with ?sheet a sprite sheet instead. */
export function App({ saves, lang }: { saves: GameSaves; lang: Lang }) {
  return <Oops>{new URLSearchParams(location.search).has('sheet') ? <Sheet /> : <Play saves={saves} lang={lang} />}</Oops>
}
