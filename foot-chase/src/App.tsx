import { useMemo } from 'react'

import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'
import { Stage } from './scene/Stage'

export function App() {
  const game = useMemo(() => new Game(), [])
  useGameInput(game)
  return (
    <>
      <Stage game={game} />
      <Hud game={game} />
    </>
  )
}
