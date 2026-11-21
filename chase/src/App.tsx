import { useMemo } from 'react'

import type { Lang } from '../../profiles/src/lang'
import { Game, useGameInput } from './game/game'
import { Hud } from './Hud'
import { Stage } from './scene/Stage'

export function App({ lang }: { lang: Lang }) {
  const game = useMemo(() => new Game(), [])
  useGameInput(game)
  return (
    <>
      <Stage game={game} />
      <Hud game={game} lang={lang} />
    </>
  )
}
