import { useMemo } from 'react'

import { Game, useGame } from './game'
import { Hud } from './Hud'
import { Stage } from './scene/Stage'

export function App() {
  const game = useMemo(() => new Game(), [])
  useGame(game)
  return (
    <>
      <Stage source={game} advance={game.advance} onTapActor={game.address} />
      <Hud game={game} />
    </>
  )
}
