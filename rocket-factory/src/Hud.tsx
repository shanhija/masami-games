import { useState, type CSSProperties } from 'react'

import { Btn } from './Btn'
import { ChoiceCard, DiscoveryCard, GoodNightCard, PathView, StartCard, TurnMe } from './Cards'
import { THING } from './draw/look'
import { HintHand } from './Hand'
import { useGameView, type Game } from './game/game'
import type { HudView, Jar } from './game/hud'
import type { HudFrame } from './game/layout'
import type { Box } from './game/where'
import { PauseIcon, TickIcon } from './Icons'
import { PauseMenu } from './Pause'
import { CardPic, RocketPic, StickerPic, ThingPic } from './Pictures'
import { OopsButton, PeelButton, Tray } from './Tray'

/** The HUD frame's boxes as CSS custom properties (--strip-x, --tray-w, ...), with the buttons' size and gap: styles.css lays the HUD out in exactly them, so it never covers the board the view fitted into `free`. */
function frameStyle(f: HudFrame): CSSProperties {
  const vars: Record<string, string> = { '--button': `${f.button}px`, '--gap': `${f.gap}px` }
  const put = (name: string, b: Box | null) => {
    if (b === null) return
    vars[`--${name}-x`] = `${b.x}px`
    vars[`--${name}-y`] = `${b.y}px`
    vars[`--${name}-w`] = `${b.w}px`
    vars[`--${name}-h`] = `${b.h}px`
  }
  put('free', f.free)
  put('strip', f.strip)
  put('column', f.column)
  put('tray', f.tray)
  return vars as CSSProperties
}

/** A jar on the lab card, filling from the bottom with its thing's colour, the thing's picture on it. */
function JarPic({ jar }: { jar: Jar }) {
  return (
    <span className="jar">
      <span className="glass">
        <span className="fill" style={{ height: `${(100 * jar.got) / jar.need}%`, background: THING[jar.thing].key }} />
      </span>
      <ThingPic thing={jar.thing} className="label" />
    </span>
  )
}

/** The rocket card: the four parts filling, as the pad shows them. Once the launch waits for her a tap on it launches, as a tap on the pad does (the pad's button is the one thing bouncing); any other time it wiggles, so her tap is answered. */
function RocketCard({ game, rocket }: { game: Game; rocket: HudView['rocket'] }) {
  const [wiggles, setWiggles] = useState(0)
  const tap = () => {
    if (rocket.ready) return game.dispatch({ kind: 'launch' })
    game.audio.ui('tap')
    setWiggles((n) => n + 1)
  }
  return (
    <Btn className="card rocket-card" label="The rocket" onTap={tap}>
      <span key={wiggles} className={`wobble${wiggles > 0 ? ' wiggle' : ''}`}>
        <RocketPic parts={rocket.parts} className="pic" />
      </span>
    </Btn>
  )
}

/**
 * The lab card: the next card's picture and a jar for each thing it waits for (a tap shows
 * the whole path); while the choice waits, the two cards to pick from, each a button (in a
 * phone's narrow column there is room for one picture, and its tap opens the path, where she
 * picks). A tap on a used sticker's hole wiggles it with that sticker peeking out from behind
 * it.
 */
function LabCard({ game, lab, narrow }: { game: Game; lab: HudView['lab']; narrow: boolean }) {
  if (lab.choice && !narrow)
    return (
      <span className="card lab-card choice">
        {(['bubbles', 'hedges'] as const).map((c) => (
          <Btn key={c} className="pick" label={c === 'bubbles' ? 'Bubbles' : 'Hedges'} onTap={() => game.choose(c)}>
            <CardPic id={c} animate={false} className="pic" />
          </Btn>
        ))}
      </span>
    )
  const peek = game.peek
  return (
    <span key={peek === null ? 'lab' : peek.at} className={`lab-slot${peek === null ? '' : ' wiggle'}`}>
      {peek !== null && (
        <span className="peek">
          <StickerPic sticker={peek.sticker} className="pic" />
        </span>
      )}
      <Btn className="lab-card" label="The path" onTap={() => game.openPath()}>
        {lab.next === null ? (
          <span className="done">
            <TickIcon />
          </span>
        ) : (
          <CardPic id={lab.next} animate={false} className="next" />
        )}
        {lab.jars.map((j) => (
          <JarPic key={j.thing} jar={j} />
        ))}
      </Btn>
    </span>
  )
}

function PauseButton({ game }: { game: Game }) {
  return (
    <Btn className="round pause" label="Pause" onTap={() => game.openPause()}>
      <PauseIcon />
    </Btn>
  )
}

/**
 * Everything over the canvas, in the DOM, laid out in the HUD frame of the view the stage drew
 * (layout.ts hudFrame): the top strip (pause, the rocket card, the lab card, and upright the
 * peel and Oops), or a phone's left column with the same; the tray; a card found; the choice
 * card; the path; the start card; Good night's still card; the hint's hand over all of them;
 * the pause menu; and on an upright phone only the turn-me picture. The pause button stays over
 * every card, so a grown-up can always reach the menu. At dusk and through the night the HUD
 * dims and nothing on it bounces (`evening`); during the launch the lab card and the tray take
 * no taps (`launch`), and in its sky the strip and the tray slide away (`sky`). It reads only
 * the game's HudView, its pause, its path and its frame (the hand reads the state each frame
 * itself).
 */
export function Hud({ game }: { game: Game }) {
  useGameView(game)
  const view = game.view
  if (view === null) return null
  const f = view.hud
  const v = game.hud
  return (
    <div className={`hud ${f.held}${v.night !== 'none' ? ' evening' : ''}${v.launch ? ' launch' : ''}${v.sky ? ' sky' : ''}`} style={frameStyle(f)}>
      {f.held === 'turnMe' ? (
        <TurnMe />
      ) : (
        <>
          {f.strip !== null && (
            <div className="strip">
              <PauseButton game={game} />
              <RocketCard game={game} rocket={v.rocket} />
              <div className="right">
                <LabCard game={game} lab={v.lab} narrow={false} />
                {f.held === 'upright' && (
                  <>
                    <PeelButton game={game} on={v.tray.peel} />
                    <OopsButton game={game} can={v.tray.oops} />
                  </>
                )}
              </div>
            </div>
          )}
          {f.column !== null && (
            <div className="column">
              <PauseButton game={game} />
              <RocketCard game={game} rocket={v.rocket} />
              <LabCard game={game} lab={v.lab} narrow />
              <PeelButton game={game} on={v.tray.peel} />
              <OopsButton game={game} can={v.tray.oops} />
            </div>
          )}
          {f.tray !== null && <Tray game={game} view={v.tray} frame={f} tools={f.held === 'sideways'} />}
          {v.card !== null && <DiscoveryCard key={`${v.card.at}:${game.returns}`} game={game} card={v.card} />}
          {v.ask && <ChoiceCard game={game} />}
          {game.path && <PathView game={game} path={v.path} choice={v.lab.choice} />}
          {v.start && <StartCard game={game} view={v} />}
          {v.night === 'done' && <GoodNightCard game={game} view={v} />}
          <HintHand game={game} />
        </>
      )}
      {game.paused && <PauseMenu game={game} />}
    </div>
  )
}
