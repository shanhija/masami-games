import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { Btn, noFocus } from './Btn'
import { MENU_SETTLE, useLayerTaps } from './Cards'
import type { Game } from './game/game'
import { MUNCHER_MODES, type MunchersMode, type ScienceMode } from './game/model'
import { stateFromKeep } from './game/progress'
import { HOLD_FOR } from './game/sounds'
import { BringBackIcon, FullScreenIcon, GamesIcon, MoonIcon, MusicIcon, PlayIcon, RestartIcon, SoundIcon, VoiceIcon } from './Icons'
import { FactoryPic, MunchersPic, SciencePic } from './Pictures'

/** The ring round a holding finger: its radius in CSS px, and its length. */
const RING_R = 46
const RING_LENGTH = 2 * Math.PI * RING_R

/** The switches' words, under their pictures: the parent reads them, so he can tell Few from Polite and Quicker from more. */
const MUNCHER_WORDS: Record<MunchersMode, string> = { many: 'Many', few: 'Few', polite: 'Polite', none: 'None' }
const SCIENCE: readonly ScienceMode[] = ['normal', 'quicker']
const SCIENCE_WORDS: Record<ScienceMode, string> = { normal: 'Normal', quicker: 'Quicker' }

/** Today's date as the name of a copy of the save: rocket-factory-2026-10-23.json. */
const copyName = () => `rocket-factory-${new Date().toISOString().slice(0, 10)}.json`

/**
 * The pause menu over the dimmed factory (plans/rocket-factory.md, Save, pause and sessions):
 * Keep going (over Good night's sleeping factory it is morning) and Good night (greyed while
 * the launch runs or a night falls); Sound, Music and Voice (greyed where the browser cannot
 * speak); the Munchers switch and the Science switch as pictures with their words, the picked
 * one lifted; Full screen, More games (the directory), Start again behind its 3 s hold, and
 * Bring back with a small picture of each factory Start again put aside; and behind a second
 * 3 s hold the grown-ups' copy of the save as a file, kept and brought back. A small Not saved
 * tells the parent when this factory is not being kept. A tap outside the buttons keeps going.
 * Like the cards it takes only taps that start on it once it has settled, so a second tap on
 * the pause button never closes it.
 */
export function PauseMenu({ game }: { game: Game }) {
  const sw = game.hud.switches
  const taps = useLayerTaps(() => game.keepGoing(), MENU_SETTLE)
  const old = game.old
  const olds = useMemo(() => old.map((k) => stateFromKeep(k, 1)), [old])
  const voice = game.audio.speaks
  const [grown, setGrown] = useState(false)
  return (
    <div className="dim pause" {...taps}>
      <div className="card menu">
        <div className="row">
          <Btn className="primary" label="Keep going" onTap={() => game.keepGoing()}>
            <PlayIcon />
            Keep going
          </Btn>
          <Btn className={`night${game.hud.goodnight ? '' : ' off cannot'}`} label="Good night" onTap={() => game.hud.goodnight && game.goodnight()}>
            <MoonIcon />
            Good night
          </Btn>
        </div>
        <div className="row">
          <Btn className={`small${sw.sound ? '' : ' off'}`} label="Sound" onTap={() => game.button({ kind: 'sound', on: !sw.sound }, 'tap')}>
            <SoundIcon on={sw.sound} />
            Sound
          </Btn>
          <Btn className={`small${sw.music ? '' : ' off'}`} label="Music" onTap={() => game.button({ kind: 'music', on: !sw.music }, 'tap')}>
            <MusicIcon on={sw.music} />
            Music
          </Btn>
          <Btn className={`small${sw.voice && voice ? '' : ' off'}${voice ? '' : ' cannot'}`} label="Voice" onTap={() => voice && game.button({ kind: 'voice', on: !sw.voice }, 'tap')}>
            <VoiceIcon on={sw.voice && voice} />
            Voice
          </Btn>
        </div>
        <div className="row pictures">
          {MUNCHER_MODES.map((m) => (
            <Btn key={m} className={`choice${sw.munchers === m ? ' on' : ''}`} label={`${MUNCHER_WORDS[m]} munchers`} onTap={() => game.button({ kind: 'munchers', mode: m }, 'tap')}>
              <MunchersPic mode={m} className="pic" />
              <span className="word">{MUNCHER_WORDS[m]}</span>
            </Btn>
          ))}
          <span className="divider" />
          {SCIENCE.map((m) => (
            <Btn key={m} className={`choice${sw.science === m ? ' on' : ''}`} label={`${SCIENCE_WORDS[m]} science`} onTap={() => game.button({ kind: 'science', mode: m }, 'tap')}>
              <SciencePic mode={m} className="pic" />
              <span className="word">{SCIENCE_WORDS[m]}</span>
            </Btn>
          ))}
        </div>
        <div className="row">
          {document.fullscreenEnabled && (
            <Btn className={`small${sw.noFullscreen ? ' off' : ''}`} label="Full screen" onTap={() => game.fullscreenButton()}>
              <FullScreenIcon />
              Full screen
            </Btn>
          )}
          <Btn className="small" label="More games" onTap={() => location.assign('../')}>
            <GamesIcon />
            More games
          </Btn>
          <HoldButton game={game} className="fresh" label="Start again" onDone={() => game.startAgain()}>
            <RestartIcon />
            Start again
          </HoldButton>
        </div>
        {olds.length > 0 && (
          <div className="row">
            {olds.map((s, i) => (
              <Btn key={i} className="small bring" label="Bring back" onTap={() => game.bringBack(i)}>
                <BringBackIcon />
                Bring back
                <FactoryPic state={s} className="old" />
              </Btn>
            ))}
          </div>
        )}
        <div className="row">
          {grown ? <CopyRow game={game} /> : (
            <HoldButton game={game} className="grown" label="For grown-ups" onDone={() => setGrown(true)}>
              For grown-ups
            </HoldButton>
          )}
          {game.unsaved && <span className="unsaved">Not saved</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * The grown-ups' copy of the save, once their hold has opened it: Keep a copy downloads this
 * factory as a dated file, and Bring back a copy loads one (the factory now is put aside first,
 * as Start again puts it). A Home Screen web app keeps its own storage, apart from Safari's, so
 * the copy is also how a factory moves there. A file that is no save changes nothing.
 */
function CopyRow({ game }: { game: Game }) {
  const keep = () => {
    const url = URL.createObjectURL(new Blob([game.copy()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = copyName()
    a.click()
    // The download takes the file from the URL a moment later.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    game.audio.ui('pick')
  }
  const bring = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (file === undefined) return
    void file.text().then((text) => {
      if (!game.bringBackCopy(text)) game.audio.ui('tap')
    })
  }
  return (
    <>
      <Btn className="small" label="Keep a copy" onTap={keep}>
        Keep a copy
      </Btn>
      <label className="btn small" aria-label="Bring back a copy" onMouseDown={noFocus}>
        Bring back a copy
        <input type="file" accept=".json,application/json" onChange={bring} hidden />
      </label>
    </>
  )
}

/** A parent's button behind a hold: held for HOLD_FOR (as long as the hold's rising tone), a ring filling round the finger, and then `onDone`. Let go early and nothing happens: a child's tap is not enough. */
function HoldButton({ game, className, label, onDone, children }: { game: Game; className: string; label: string; onDone: () => void; children: ReactNode }) {
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const begin = (e: ReactPointerEvent) => {
    if (e.button !== 0 || timer.current !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setRing({ x: e.clientX, y: e.clientY })
    game.audio.ui('hold')
    timer.current = window.setTimeout(() => {
      timer.current = 0
      setRing(null)
      onDone()
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
      <button type="button" tabIndex={-1} aria-label={label} className={`btn small ${className}`} onMouseDown={noFocus} onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        {children}
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
