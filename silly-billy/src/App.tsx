import { useMemo } from 'react'

import type { Saves } from '../../profiles/src/profiles'

import { Game, useGame } from './game'
import { Hud } from './Hud'
import { Stage } from './scene/Stage'

export function App({ saves }: { saves: Saves }) {
  const game = useMemo(() => new Game(saves), [saves])
  useGame(game)
  return (
    <>
      <Stage source={game} advance={game.advance} onTapActor={game.address} />
      <Hud game={game} />
    </>
  )
}
