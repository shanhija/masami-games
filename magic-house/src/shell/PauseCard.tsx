import './PauseCard.css'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { inLang, type Lang } from '../../../profiles/src/lang'
import { FullIcon, GamesIcon, SoundIcon } from '../../../silly-billy/src/Icons'
import type { Sounds } from '../../../silly-billy/src/sounds'
import { NO_POINT, type SeatInput } from '../seats/input'
import type { Seat } from '../seats/types'
import { PAUSE } from '../words'
import { stickSteps, useSeatFrames } from './House'
import { hush } from './speech'

/** The page in full screen, or back out of it; nothing where the browser cannot (an iPhone's Safari). */
function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement !== null) void document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch((err: unknown) => console.warn('Magic House could not go full screen:', err))
}

export interface PauseCardProps {
  lang: Lang
  /** The party's seats: their sticks walk a ring over the card's buttons, a presses the ringed one, b keeps going. */
  seats: readonly Seat[]
  input: SeatInput
  /** The visit's sounds: Sound turns them off and on for the whole visit (the helper's voice too, shell/speech.ts). */
  sounds: Sounds
  onKeepGoing: () => void
  /** Start the room again from the beginning: counted (shell/counted.ts). */
  onStartAgain: () => void
  /** Leave for another room in the house: counted as left. */
  onAnotherRoom: () => void
  /** Leave for the gallery's other games: counted as left before the page goes. */
  onMoreGames: () => void
}

/**
 * The pause card (plan.md, Never trapped): Keep going, Start again and Another room as big buttons,
 * and under them Sound, Full screen and More games, the same words as every game of the gallery says
 * them. Leaving is always possible, and the room counts it. While it is up the room waits, and the
 * seats drive the card, so a party on keys or gamepads alone is never trapped: any stick walks one
 * ring through the buttons in reading order (across or up and down alike), a presses the ringed one
 * and b keeps going. The ring starts on Keep going and is drawn only when a seat is not a touch pad.
 */
export function PauseCard({ lang, seats, input, sounds, onKeepGoing, onStartAgain, onAnotherRoom, onMoreGames }: PauseCardProps) {
  const [muted, setMuted] = useState(sounds.muted)
  const [full, setFull] = useState(() => document.fullscreenElement !== null)
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  const toggleSound = () => {
    sounds.setMuted(!muted)
    if (!muted) hush()
    setMuted(!muted)
  }
  // Every button in reading order, as the ring walks them.
  const acts = [onKeepGoing, onStartAgain, onAnotherRoom, toggleSound, ...(document.fullscreenEnabled ? [toggleFullscreen] : []), onMoreGames]
  const [ringed, setRinged] = useState(0)
  const ringOn = seats.some((s) => s.device.kind !== 'touch')
  const across = useRef<boolean[]>([])
  const down = useRef<boolean[]>([])
  useSeatFrames(input, seats, (frame) => {
    const ups = stickSteps(frame.pads, 1, down.current)
    const to = stickSteps(frame.pads, 0, across.current).reduce<number>((at, step, i) => Math.max(0, Math.min(acts.length - 1, at + (step !== 0 ? step : ups[i]!))), ringed)
    if (to !== ringed) setRinged(to)
    if (frame.pads.some((pad) => pad.b.pressed)) onKeepGoing()
    else if (frame.pads.some((pad) => pad.a.pressed)) acts[to]!()
  })
  const ring = (i: number) => (ringOn && i === ringed ? ' ringed' : '')
  const pill = (i: number, label: string, icon: ReactNode, on: boolean) => (
    <button className={`pause-pill${on ? ' on' : ''}${ring(i)}`} aria-label={label} aria-pressed={on} onClick={acts[i]}>
      <span className="pause-pill-icon">{icon}</span>
      <span>{label}</span>
    </button>
  )
  return (
    <div className="pause-card-back" {...{ [NO_POINT]: '' }}>
      <div className="pause-card">
        <button className={`big-button${ring(0)}`} onClick={onKeepGoing}>
          {inLang(PAUSE.keepGoing, lang)}
        </button>
        <button className={`big-button second${ring(1)}`} onClick={onStartAgain}>
          {inLang(PAUSE.startAgain, lang)}
        </button>
        <button className={`big-button second${ring(2)}`} onClick={onAnotherRoom}>
          {inLang(PAUSE.anotherRoom, lang)}
        </button>
        <div className="pause-row">
          {pill(3, inLang(PAUSE.sound, lang), <SoundIcon size={30} on={!muted} />, !muted)}
          {document.fullscreenEnabled && pill(4, inLang(PAUSE.fullScreen, lang), <FullIcon size={30} />, full)}
          {pill(acts.length - 1, inLang(PAUSE.moreGames, lang), <GamesIcon size={30} />, false)}
        </div>
      </div>
    </div>
  )
}
