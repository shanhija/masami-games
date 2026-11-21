import { useGameView } from './game/game'
import type { Game } from './game/game'
import { BUTTON, cls } from './Controls'
import { Glyph, MachineIcon, paintColour } from './Icons'
import { BuilderPicker } from './Shop'

/** A word of chunky letters, each its own colour and tilt. */
function Letters({ word, tint }: { word: string; tint: readonly string[] }) {
  return (
    <div className="logo-word">
      {[...word].map((letter, i) => (
        <span key={i} className="logo-letter" style={{ color: tint[i % tint.length], rotate: `${[-3, 2, -2, 3, -1, 2][i % 6]}deg` }}>
          {letter}
        </span>
      ))}
    </div>
  )
}

/** The first screen over the living valley: the logo, on a first visit the builder, and one huge Go!. */
export function Title({ game }: { game: Game }) {
  useGameView(game)
  if (game.screen !== 'title') return null
  const first = !game.save.picked
  return (
    <div className="title">
      <div className="logo">
        <Letters word="DIGGER" tint={['#ffc21a', '#fff7e6']} />
        <div className="logo-line">
          <Letters word="TOWN" tint={['#fff7e6', '#ffc21a']} />
          <span className="logo-digger"><MachineIcon kind="digger" colour={paintColour(game.save.paints.digger)} /></span>
        </div>
        <div className="logo-stripe" />
      </div>
      {first ? <BuilderPicker game={game} /> : null}
      <button type="button" {...BUTTON} aria-label="go" className={cls('push', 'go')} onPointerDown={(e) => { e.preventDefault(); game.start() }}>
        <Glyph name="play" />
        <span>Go!</span>
      </button>
      {first ? null : (
        <button
          type="button"
          {...BUTTON}
          aria-label="paint shop"
          className="push round title-paint"
          onPointerDown={(e) => {
            e.preventDefault()
            game.start()
            game.openShop()
          }}
        >
          <Glyph name="paint" />
        </button>
      )}
    </div>
  )
}
