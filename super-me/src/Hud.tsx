import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { ROOM_LOOK } from '../../pia-jump/src/draw/world'
import { FullScreenIcon, MusicIcon, PadlockIcon, PauseIcon, PlayIcon, RestartIcon, SoundIcon } from '../../pia-jump/src/Icons'
import { DIRECTORY } from '../../profiles/src/directory'
import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import { Closet } from './Closet'
import { Controls } from './Controls'
import { Doll } from './Doll'
import { drawIcon, drawPresent } from './draw/blocks'
import { rewardPart } from './game/closet'
import { levelAt, toggleFullscreen, useGameView, type Game } from './game/game'
import { LEVELS } from './game/levels'
import { KINDS } from './game/model'
import { Picture } from './Picture'
import { HUD, KIND_NAMES, LEVEL_NAMES, REWARD_WORDS } from './words'

/** Hold the start-fresh button this long (s). */
const HOLD_FOR = 3

const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

/** A button that answers on pointerdown (a five-year-old's tap is short and wobbly) and never takes the keyboard's focus. */
function Btn({ className, label, onTap, children }: { className: string; label: string; onTap: () => void; children: ReactNode }) {
  return (
    <button
      className={className}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        onTap()
      }}
      onMouseDown={noFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onTap()
      }}
    >
      {children}
    </button>
  )
}

/** Whether this is a touch screen: the thumbs' controls show only there. */
function useTouchScreen() {
  const [touch, setTouch] = useState(() => navigator.maxTouchPoints > 0)
  useEffect(() => {
    const seen = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true)
    }
    window.addEventListener('pointerdown', seen, true)
    return () => window.removeEventListener('pointerdown', seen, true)
  }, [])
  return touch
}

function Corner({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  return (
    <div className="corner">
      <Btn className="round" label={say(HUD.music)} onTap={() => game.toggleMusic()}>
        <MusicIcon on={game.save.music} />
      </Btn>
      <Btn className="round" label={say(HUD.sound)} onTap={() => game.toggleSound()}>
        <SoundIcon on={game.save.sound} />
      </Btn>
      {document.fullscreenEnabled && (
        <Btn className="round" label={say(HUD.fullScreen)} onTap={toggleFullscreen}>
          <FullScreenIcon />
        </Btn>
      )}
      <Btn className="round more" label={say(HUD.moreGames)} onTap={() => location.assign('../index.html')}>
        <span className="word">{say(HUD.games)}</span>
      </Btn>
    </div>
  )
}

/** For the parent: hold HOLD_FOR seconds to start fresh, a ring filling meanwhile. */
function Fresh({ game, lang }: { game: Game; lang: Lang }) {
  const timer = useRef(0)
  const [holding, setHolding] = useState(false)
  const stop = () => {
    window.clearTimeout(timer.current)
    setHolding(false)
  }
  return (
    <button
      className={`fresh${holding ? ' holding' : ''}`}
      aria-label={inLang(HUD.holdToStartFresh, lang)}
      onPointerDown={(e) => {
        e.preventDefault()
        setHolding(true)
        game.click('tap')
        timer.current = window.setTimeout(() => {
          setHolding(false)
          game.startFresh()
        }, HOLD_FOR * 1000)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={noFocus}
    >
      {inLang(HUD.holdToStartFresh, lang)}
    </button>
  )
}

/** The three presents of a level: found ones in their paper, the rest as faint outlines. */
function Presents({ index, opened, className }: { index: number; opened: (i: number) => boolean; className: string }) {
  return (
    <span className={`presents ${className}`}>
      {levelAt(index).presents.map((_, i) => (
        <span key={i} className={`present${opened(i) ? ' got' : ''}`}>
          <Picture paint={(ctx) => drawPresent(ctx, i, 0)} span={1.1} version={`${i}`} className="gift" />
        </span>
      ))}
    </span>
  )
}

function MapScreen({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  return (
    <div className="map">
      <h1 className="title">{say(DIRECTORY['super-me'].name)}</h1>
      <div className="cards">
        {LEVELS.map((def, i) => {
          const open = game.isOpen(i)
          const done = game.save.done.includes(def.id)
          const name = say(LEVEL_NAMES[def.id])
          return (
            <Btn key={def.id} className={`level${open ? '' : ' locked'}${done ? ' done' : ''}${i === game.nextLevel() ? ' next' : ''}`} label={name} onTap={() => game.tapLevel(i)}>
              <span className="face" style={{ background: ROOM_LOOK[def.id].card }}>
                <span className="name" style={{ '--letters': name.length } as CSSProperties}>
                  {name}
                </span>
                <Presents index={i} opened={(k) => game.found.has(def.rewards[k]!)} className="small" />
                {!open && (
                  <span className="lock">
                    <PadlockIcon />
                  </span>
                )}
              </span>
            </Btn>
          )
        })}
      </div>
      <Btn className="dress" label={say(HUD.dressUp)} onTap={() => game.toCloset()}>
        <Doll look={game.look} act="wave" animate zoom="all" className="me" />
        <span className="word">{say(HUD.dressUp)}</span>
      </Btn>
      <Corner game={game} lang={lang} />
      <Fresh game={game} lang={lang} />
    </div>
  )
}

function PauseMenu({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  return (
    <div className="dim" onPointerDown={(e) => e.target === e.currentTarget && game.resume()}>
      <div className="card menu">
        <h1>{say(LEVEL_NAMES[game.level.id])}</h1>
        <Btn className="primary" label={say(HUD.keepGoing)} onTap={() => game.resume()}>
          <PlayIcon />
          <span className="word">{say(HUD.keepGoing)}</span>
        </Btn>
        <div className="pair">
          <Btn className="secondary" label={say(HUD.startAgain)} onTap={() => game.restart()}>
            <RestartIcon />
            <span className="word">{say(HUD.again)}</span>
          </Btn>
          <Btn className="secondary" label={say(HUD.map)} onTap={() => game.toMap()}>
            <span className="word">{say(HUD.map)}</span>
          </Btn>
          <Btn className="secondary" label={say(HUD.dressUp)} onTap={() => game.toCloset()}>
            <span className="word">{say(HUD.dressUp)}</span>
          </Btn>
        </div>
        <div className="row">
          <Btn className={`small${game.save.music ? '' : ' off'}`} label={say(HUD.music)} onTap={() => game.toggleMusic()}>
            <MusicIcon on={game.save.music} />
          </Btn>
          <Btn className={`small${game.save.sound ? '' : ' off'}`} label={say(HUD.sound)} onTap={() => game.toggleSound()}>
            <SoundIcon on={game.save.sound} />
          </Btn>
          {document.fullscreenEnabled && (
            <Btn className="small" label={say(HUD.fullScreen)} onTap={toggleFullscreen}>
              <FullScreenIcon />
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayScreen({ game, lang, touch }: { game: Game; lang: Lang; touch: boolean }) {
  const say = (words: Words) => inLang(words, lang)
  const s = game.sim
  const kinds = KINDS.filter((k) => s.hand[k] > 0)
  const gift = game.gift
  return (
    <div className="play">
      <Presents index={game.index} opened={(i) => s.opened[i] === 1} className="top" />
      <div className="corner">
        <Btn className="round" label={say(HUD.pause)} onTap={() => game.pause()}>
          <PauseIcon />
        </Btn>
      </div>
      {/* The thumbs' zones first, so the tray over them still takes its taps. */}
      {touch && !game.paused && !game.ending && <Controls game={game} lang={lang} />}
      {kinds.length > 0 && (
        <div className="tray">
          {kinds.map((k) => (
            <Btn key={k} className={`slot${k === s.chosen ? ' chosen' : ''}`} label={say(KIND_NAMES[k])} onTap={() => game.choose(k)}>
              <Picture paint={(ctx) => drawIcon(ctx, k, 0.8)} span={1} version={k} className="block" />
              <span className="count" key={s.hand[k]}>
                {s.hand[k]}
              </span>
            </Btn>
          ))}
        </div>
      )}
      {game.startCard && (
        <div className="card start">
          <h1>{say(LEVEL_NAMES[game.level.id])}</h1>
          <Presents index={game.index} opened={() => true} className="big" />
          <p>{say(HUD.findThePresents)}</p>
        </div>
      )}
      {gift && (
        <div className="card gift">
          <Doll look={game.look} act="dance" animate zoom={rewardPart(gift.reward).part} className="pic" />
          <p>{say(REWARD_WORDS[gift.reward])}</p>
        </div>
      )}
      {game.paused && <PauseMenu game={game} lang={lang} />}
    </div>
  )
}

/** Everything over the canvas: the screen the game is on, its words in `lang`. */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  useGameView(game)
  const touch = useTouchScreen()
  return (
    <div className="hud">
      {game.screen === 'map' && <MapScreen game={game} lang={lang} />}
      {game.screen === 'play' && <PlayScreen game={game} lang={lang} touch={touch} />}
      {game.screen === 'closet' && (
        <Closet
          lang={lang}
          look={game.look}
          found={game.found}
          fresh={game.fresh}
          onChange={(look) => game.dress(look)}
          onPlay={() => game.closetDone()}
          onTap={() => game.click('tap')}
          onLocked={() => game.click('locked')}
        />
      )}
    </div>
  )
}
