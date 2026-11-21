import { useEffect, useState } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import { Btn } from './Btn'
import { BuildTray } from './BuildTray'
import { AskCards, GoodNight, HintHand, PresentCard } from './Cards'
import { insets, isShort } from './game/camera'
import { useGameView, type Game } from './game/game'
import { BackIcon, HouseIcon, MoonIcon, PauseIcon } from './Icons'
import { PauseMenu } from './Pause'
import { FacePic } from './Pictures'
import { RoadControls } from './RoadControls'
import { RoomTray } from './RoomTray'
import { Wardrobe } from './Wardrobe'
import { WORDS } from './words'

/** The window's size in CSS pixels, as the canvas has it: the HUD lays itself out in the camera's insets for it. */
function useScreen() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight })
  useEffect(() => {
    const resize = () => setSize({ w: innerWidth, h: innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return size
}

/**
 * Everything over the canvas, in the DOM: the back button (the builder's face on the
 * street, a house on the road), the moon and the pause button, the wardrobe panel, the
 * road's pedal, horn and trip strip, the build tray, the room tray, the picture-card
 * questions, the present's card, the hint hand, the Good night card and the pause menu. It
 * reads only the game's HudView (and its pause), and lays itself out in camera.ts's insets,
 * so it never covers what the picture keeps for the child to tap. Every word is in `lang`.
 */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  useGameView(game)
  const { w, h } = useScreen()
  const v = game.hud
  const ins = insets(game.state.shot, w, h)
  // A short window (a phone on its side), as the camera's insets read it, lays the HUD out its own way.
  return (
    <div className={`hud ${v.shot}${isShort(w, h) ? ' short' : ''}${v.night !== 'none' ? ' evening' : ''}`}>
      {v.back !== null && (
        <Btn className={`back ${v.back}`} label={inLang(v.back === 'face' ? WORDS.mirror : v.back === 'home' ? WORDS.home : WORDS.back, lang)} onTap={() => game.backButton()}>
          {v.back === 'face' ? <FacePic look={v.look} /> : v.back === 'home' ? <HouseIcon /> : <BackIcon />}
        </Btn>
      )}
      {v.wardrobe !== null && <Wardrobe game={game} view={v.wardrobe} ins={ins} screen={{ w, h }} lang={lang} />}
      {v.road !== null && <RoadControls game={game} view={v.road} lang={lang} />}
      {v.build !== null && <BuildTray game={game} view={v.build} lang={lang} />}
      {v.room !== null && <RoomTray key={`${v.room.plot}:${v.room.room}:${v.room.theme}`} game={game} view={v.room} screen={{ w, h }} lang={lang} />}
      {/* After the panels (pause sits over the wardrobe's corner) and before the cards (which dim it). */}
      <div className="corner">
        {v.moon && (
          <Btn className="round moon" label={inLang(WORDS.goodNight, lang)} onTap={() => game.dispatch({ kind: 'goodnight' })}>
            <MoonIcon />
          </Btn>
        )}
        {v.night !== 'done' && (
          <Btn className="round pause" label={inLang(WORDS.pause, lang)} onTap={() => {
              game.audio.ui('open')
              game.pause()
            }}>
            <PauseIcon />
          </Btn>
        )}
      </div>
      {v.present !== null && <PresentCard key={v.present.at} got={v.present.got} look={v.look} lang={lang} />}
      {v.hand >= 0 && <HintHand key={v.hand} game={game} />}
      {v.ask !== null && <AskCards key={`${v.ask.kind}${v.ask.at}`} game={game} ask={v.ask} screen={{ w, h }} lang={lang} />}
      {v.night === 'done' && <GoodNight game={game} lang={lang} />}
      {game.paused && <PauseMenu game={game} lang={lang} />}
    </div>
  )
}
