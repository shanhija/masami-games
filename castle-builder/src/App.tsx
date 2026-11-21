import { useMemo } from 'react'

import type { Lang } from '../../profiles/src/lang'
import type { Saves } from '../../profiles/src/profiles'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'
import { Stage } from './scene/Stage'

export function App({ saves, lang }: { saves: Saves; lang: Lang }) {
  const game = useMemo(() => new Game(saves), [saves])
  useGameInput(game)
  return (
    <>
      <Stage game={game} />
      <Hud game={game} lang={lang} />
    </>
  )
}
