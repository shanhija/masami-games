import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import { Btn, noFocus } from './Btn'
import { useLayerTaps } from './Cards'
import { toggleFullscreen, type Game } from './game/game'
import { HOLD_FOR } from './game/sounds'
import { FullScreenIcon, GamesIcon, MoonIcon, MusicIcon, PlayIcon, RestartIcon, SoundIcon } from './Icons'
import { WORDS } from './words'

/** The ring around a holding finger: its radius in CSS px, and its length. */
const RING_R = 46
const RING_LENGTH = 2 * Math.PI * RING_R

/**
 * The pause menu over the dimmed picture: Keep going, Good night, the sound and music
 * switches, full screen, More games (the directory), and Start again behind a 3 s hold. A
 * tap outside the buttons keeps going. Like the cards, it takes only taps that start on it
 * once it has settled (useLayerTaps), so a second tap on the pause button never closes it.
 */
export function PauseMenu({ game, lang }: { game: Game; lang: Lang }) {
  const hud = game.hud
  const say = (words: keyof typeof WORDS) => inLang(WORDS[words], lang)
  const taps = useLayerTaps()
  const keepGoing = () => {
    game.resume()
    game.audio.ui('close')
  }
  return (
    <div
      className="dim pause"
      {...taps}
      onClick={(e) => {
        if (!(e.target as Element).closest('button')) keepGoing()
      }}
    >
      <div className="card menu">
        <Btn className="primary" label={say('keepGoing')} onTap={keepGoing}>
          <PlayIcon />
          {say('keepGoing')}
        </Btn>
        <Btn className="secondary" label={say('goodNight')} onTap={() => game.goodnight()}>
          <MoonIcon />
          {say('goodNight')}
        </Btn>
        <div className="row">
          <Btn className={`small${hud.sound ? '' : ' off'}`} label={say('sound')} onTap={() => game.button({ kind: 'sound', on: !hud.sound }, 'tap')}>
            <SoundIcon on={hud.sound} />
            {say('sound')}
          </Btn>
          <Btn className={`small${hud.music ? '' : ' off'}`} label={say('music')} onTap={() => game.button({ kind: 'music', on: !hud.music }, 'tap')}>
            <MusicIcon on={hud.music} />
            {say('music')}
          </Btn>
          {document.fullscreenEnabled && (
            <Btn className="small" label={say('fullScreen')} onTap={toggleFullscreen}>
              <FullScreenIcon />
              {say('fullScreen')}
            </Btn>
          )}
          <Btn className="small" label={say('moreGames')} onTap={() => location.assign('../index.html')}>
            <GamesIcon />
            {say('moreGames')}
          </Btn>
        </div>
        <HoldButton game={game} label={say('startAgain')} />
      </div>
    </div>
  )
}

/** Start again: held for HOLD_FOR (as long as the hold's rising tone), a ring filling round the finger; a parent's button, not a child's tap. Let go early and nothing happens. */
function HoldButton({ game, label }: { game: Game; label: string }) {
  const [ring, setRing] = useState<{ x: number; y: number; id: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const begin = (e: ReactPointerEvent) => {
    if (e.button !== 0 || timer.current !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setRing({ x: e.clientX, y: e.clientY, id: e.pointerId })
    game.audio.ui('hold')
    timer.current = window.setTimeout(() => {
      timer.current = 0
      setRing(null)
      game.startAgain()
    }, HOLD_FOR * 1000)
  }
  const end = () => {
    if (timer.current === 0) return
    window.clearTimeout(timer.current)
    timer.current = 0
    setRing(null)
    game.audio.ui('tap')
  }
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        className="btn small fresh"
        onMouseDown={noFocus}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <RestartIcon />
        {label}
      </button>
      {ring && (
        <svg className="ring" style={{ left: ring.x, top: ring.y }} viewBox={`${-RING_R - 8} ${-RING_R - 8} ${2 * RING_R + 16} ${2 * RING_R + 16}`} aria-hidden>
          <circle className="track" r={RING_R} />
          <circle className="fill" r={RING_R} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH} style={{ animationDuration: `${HOLD_FOR}s` }} />
        </svg>
      )}
    </>
  )
}
