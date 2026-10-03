import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { Controls } from './Controls'
import { ROOM_LOOK } from './draw/world'
import { HOME, homeTimes, toggleFullscreen, useGameView, type Game, type Homecoming, type Shout } from './game/game'
import { ROOMS } from './game/levels'
import { HOLD_FOR } from './game/sounds'
import { BackIcon, FullScreenIcon, HouseIcon, MusicIcon, PadlockIcon, PauseIcon, PlayIcon, RestartIcon, SoundIcon } from './Icons'
import { Portrait, type Picture } from './Portrait'

const STAR: Picture = { kind: 'star' }
/** A press on a locked card shorter than this is a tap, answered with a "nuh-uh" and a shake. */
const TAP_FOR = 0.3
/** The ring around a holding finger: its radius in CSS px, and its length. */
const RING_R = 46
const RING_LENGTH = 2 * Math.PI * RING_R
const SHOUT_CLASS: Record<Shout, string> = { 'Wow!': 'wow', 'Boing!': 'boing', 'Oops!': 'oops', 'Yay!': 'yay' }

const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

/** Every HUD button: never takes focus (so Space never clicks it), never opens the long-press menu. */
function Btn({ className, label, onTap, children }: { className: string; label: string; onTap: () => void; children: ReactNode }) {
  return (
    <button type="button" tabIndex={-1} className={className} aria-label={label} onMouseDown={noFocus} onClick={onTap} onContextMenu={noFocus}>
      {children}
    </button>
  )
}

/** Touch controls show on a touch screen, and from the first touch on any other. */
function useTouchScreen() {
  const [on, setOn] = useState(() => matchMedia('(any-pointer: coarse)').matches)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setOn(true)
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [])
  return on
}

/** The keyboard highlight on the cards shows only while the keyboard is what she uses. */
function useKeyboardMode() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const key = () => setOn(true)
    const pointer = () => setOn(false)
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', pointer)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', pointer)
    }
  }, [])
  return on
}

/**
 * The parent gate's hold: a ring fills around the finger (or the mouse) over HOLD_FOR, as
 * long as the gate's rising tone, then `done` runs; letting go early empties it and does
 * nothing. `end` says how long the hold ran, or -1 if none was running.
 */
function useHold(game: Game) {
  const [ring, setRing] = useState<{ x: number; y: number; id: number } | null>(null)
  const ringEl = useRef<SVGSVGElement>(null)
  const timer = useRef(0)
  const began = useRef(0)
  /** A hold just finished: the click its finger makes on lifting is not a tap. */
  const finished = useRef(false)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const begin = (e: ReactPointerEvent, done: () => void) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    window.clearTimeout(timer.current)
    began.current = performance.now()
    finished.current = false
    setRing({ x: e.clientX, y: e.clientY, id: e.pointerId })
    game.holding(true)
    timer.current = window.setTimeout(() => {
      timer.current = 0
      finished.current = true
      setRing(null)
      done()
    }, HOLD_FOR * 1000)
  }
  /** Whether this click ends a finished hold (and so does nothing); asks once. */
  const swallow = () => {
    const f = finished.current
    finished.current = false
    return f
  }
  // The ring follows the finger straight in the DOM: nothing else on the screen changes.
  const follow = (e: ReactPointerEvent) => {
    const el = ringEl.current
    if (!ring || ring.id !== e.pointerId || !el) return
    el.style.left = `${e.clientX}px`
    el.style.top = `${e.clientY}px`
  }
  const end = () => {
    if (timer.current === 0) return -1
    window.clearTimeout(timer.current)
    timer.current = 0
    setRing(null)
    return (performance.now() - began.current) / 1000
  }
  const view = ring && (
    <svg ref={ringEl} className="ring" style={{ left: ring.x, top: ring.y }} viewBox={`${-RING_R - 8} ${-RING_R - 8} ${2 * RING_R + 16} ${2 * RING_R + 16}`} aria-hidden>
      <circle className="track" r={RING_R} />
      <circle className="fill" r={RING_R} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH} style={{ animationDuration: `${HOLD_FOR}s` }} />
    </svg>
  )
  return { view, begin, follow, end, swallow }
}

/** A card shakes its head: that room is still locked. */
function shake(el: HTMLElement) {
  el.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '10px' }, { translate: '-7px' }, { translate: '5px' }, { translate: '0' }], { duration: 420, easing: 'ease-out' })
}

/** The room's stars, flying from its card into the jar one after another; `onLand` hears how many have landed. */
function Flights({ home, from, to, onLand }: { home: Homecoming; from: () => HTMLElement; to: () => HTMLElement; onLand: (n: number) => void }) {
  const { flights } = homeTimes(home.stars)
  const stars = useRef<(HTMLDivElement | null)[]>([])
  useLayoutEffect(() => {
    const a = from().getBoundingClientRect()
    const b = to().getBoundingClientRect()
    const [x0, y0] = [a.left + a.width / 2, a.top + a.height / 2]
    const [x1, y1] = [b.left + b.width / 2, b.top + b.height / 2]
    const anims = stars.current.map((el, i) => {
      // Up out of the card first, then over to the jar; the stars fan out a little so they read as many.
      const mx = x0 + (x1 - x0) * 0.25 + 18 * ((i % 3) - 1)
      const my = y1 + (y0 - y1) * 0.3
      const anim = el!.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) scale(1.25)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(0.85)`, opacity: 1 },
        ],
        { duration: HOME.flyFor * 1000, delay: (HOME.say + i * HOME.flyEvery) * 1000, easing: 'ease-in-out', fill: 'both' },
      )
      anim.onfinish = () => {
        el!.style.visibility = 'hidden'
        to().animate([{ scale: '1.35' }, { scale: '1' }], { duration: 220, easing: 'ease-out' })
        onLand(i + 1)
      }
      return anim
    })
    return () => anims.forEach((anim) => anim.cancel())
    // Once per homecoming (the component is keyed by it): the cards and the jar are measured when the stars take off.
  }, [])
  return (
    <>
      {Array.from({ length: flights }, (_, i) => (
        <div
          key={i}
          className="flight"
          ref={(el) => {
            stars.current[i] = el
          }}
        >
          <Portrait picture={STAR} animate={false} className="star" />
        </div>
      ))}
    </>
  )
}

/** The start screen: the title, the five room cards, the star jar, the parent's buttons, and the homecoming when a kitten has just been found. */
function RoomsScreen({ game, keyboard }: { game: Game; keyboard: boolean }) {
  const hold = useHold(game)
  const home = game.homecoming
  const next = game.nextRoom()
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const jar = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState({ at: -1, n: 0 })
  const times = homeTimes(home ? home.stars : 0)
  const n = home && landed.at === home.at ? landed.n : 0
  const jarShown = home ? home.jarFrom + (times.flights === 0 ? home.stars : Math.round((home.stars * n) / times.flights)) : game.save.jar
  return (
    <>
      <div className="rooms">
        {/* "You found Sunny!" takes the title's place for a moment, so the cards stay in view. */}
        {home && game.saying ? (
          <h1 className="title say" key={`say${home.at}`}>
            You found {ROOMS[home.index]!.kitten}!
          </h1>
        ) : (
          <h1 className="title">Pia Jump</h1>
        )}
        <div className="cards">
          {ROOMS.map((r, i) => {
            const open = game.isOpen(i)
            const opening = home !== null && home.opened === i
            const found = game.save.found.includes(r.id)
            const cls = ['room', (!open || opening) && 'locked', opening && 'opening', i === next && 'next', keyboard && i === game.highlight && 'lit', home !== null && home.index === i && 'home']
            const style = { '--card': ROOM_LOOK[r.id].card, '--open-at': `${times.padlockAt}s` } as CSSProperties
            const lockedTap = {
              onPointerDown: (e: ReactPointerEvent) => hold.begin(e, () => game.unlockRoom(i)),
              onPointerMove: hold.follow,
              onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
                const held = hold.end()
                if (held < 0) return
                if (held < TAP_FOR) {
                  game.tapCard(i)
                  shake(e.currentTarget.firstElementChild as HTMLElement)
                } else game.holding(false)
              },
              onPointerCancel: () => hold.end() >= 0 && game.holding(false),
              onLostPointerCapture: () => hold.end() >= 0 && game.holding(false),
            }
            return (
              <button
                key={r.id}
                ref={(el) => {
                  cards.current[i] = el
                }}
                type="button"
                tabIndex={-1}
                aria-label={r.name}
                className={cls.filter(Boolean).join(' ')}
                style={style}
                onMouseDown={noFocus}
                onContextMenu={noFocus}
                {...(open ? { onClick: () => hold.swallow() || game.tapCard(i) } : lockedTap)}
              >
                {/* The button stays still for the finger; the face inside it breathes and shakes. */}
                <span className="face">
                  <span className="name">{r.name}</span>
                  <Portrait picture={found ? { kind: 'kitten', name: r.kitten, pose: 'sit' } : { kind: 'bed', index: i }} animate={i === next} className="pic" />
                  <span className="best">
                    <Portrait picture={STAR} animate={false} className="star" />
                    {game.save.best[r.id]}
                  </span>
                  {(!open || opening) && (
                    <span className="lock">
                      <PadlockIcon />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="jar" ref={jar}>
        <Portrait picture={STAR} animate={false} className="star" />
        <span className="count">{jarShown}</span>
      </div>
      <div className="corner">
        <Btn className="round" label="Music" onTap={() => game.toggleMusic()}>
          <MusicIcon on={game.save.music} />
        </Btn>
        <Btn className="round" label="Sound" onTap={() => game.toggleSound()}>
          <SoundIcon on={game.save.sound} />
        </Btn>
        {document.fullscreenEnabled && (
          <Btn className="round" label="Full screen" onTap={toggleFullscreen}>
            <FullScreenIcon />
          </Btn>
        )}
        <Btn className="round" label="More games" onTap={() => location.assign('../index.html')}>
          <BackIcon />
        </Btn>
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="fresh"
        onMouseDown={noFocus}
        onContextMenu={noFocus}
        onPointerDown={(e) => hold.begin(e, () => game.startFresh())}
        onPointerMove={hold.follow}
        onPointerUp={() => hold.end() >= 0 && game.holding(false)}
        onPointerCancel={() => hold.end() >= 0 && game.holding(false)}
        onLostPointerCapture={() => hold.end() >= 0 && game.holding(false)}
      >
        Hold to start fresh
      </button>
      {home && (
        <Flights
          key={`fly${home.at}`}
          home={home}
          from={() => cards.current[home.index]!.querySelector('.pic')!}
          to={() => jar.current!.querySelector('.star')!}
          onLand={(count) => {
            setLanded({ at: home.at, n: count })
            game.starHome()
          }}
        />
      )}
      {hold.view}
    </>
  )
}

/** Pia's head travels a thin ribbon from the room's start to the kitten's bed. */
function Ribbon({ game }: { game: Game }) {
  const runner = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const r = game.room
      const from = r.start.col + 0.5
      const p = Math.min(Math.max((game.sim.hero.x - from) / (r.bed.col + 0.5 - from), 0), 1)
      runner.current!.style.transform = `translateX(${(p * 100).toFixed(2)}%)`
      fill.current!.style.transform = `scaleX(${p.toFixed(4)})`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])
  return (
    <div className="ribbon">
      <div className="track">
        <div className="fill" ref={fill} />
        <div className="runner" ref={runner}>
          <Portrait picture={{ kind: 'head' }} animate={false} className="head" />
        </div>
      </div>
      <Portrait picture={{ kind: 'bed', index: game.index }} animate={false} className="bed" />
    </div>
  )
}

function PauseMenu({ game }: { game: Game }) {
  const kitten = game.room.kitten
  return (
    <div
      className="dim"
      onClick={(e) => {
        if (!(e.target as Element).closest('button')) game.resume()
      }}
    >
      <div className="card menu">
        <div className="top">
          <h1>Paused</h1>
          <Portrait picture={{ kind: 'kitten', name: kitten, pose: 'sit' }} animate={false} className="pic" />
        </div>
        <Btn className="primary" label="Keep going" onTap={() => game.resume()}>
          <PlayIcon />
          Keep going
        </Btn>
        <div className="pair">
          <Btn className="secondary" label="Start again" onTap={() => game.restart()}>
            <RestartIcon />
            Start again
          </Btn>
          <Btn className="secondary" label="Rooms" onTap={() => game.toRooms()}>
            <HouseIcon />
            Rooms
          </Btn>
        </div>
        <div className="row">
          <Btn className={`small${game.save.music ? '' : ' off'}`} label="Music" onTap={() => game.toggleMusic()}>
            <MusicIcon on={game.save.music} />
            Music
          </Btn>
          <Btn className={`small${game.save.sound ? '' : ' off'}`} label="Sound" onTap={() => game.toggleSound()}>
            <SoundIcon on={game.save.sound} />
            Sound
          </Btn>
          {document.fullscreenEnabled && (
            <Btn className="small" label="Full screen" onTap={toggleFullscreen}>
              <FullScreenIcon />
              Full screen
            </Btn>
          )}
          <Btn className="small" label="More games" onTap={() => location.assign('../index.html')}>
            <BackIcon />
            More games
          </Btn>
        </div>
      </div>
    </div>
  )
}

/** In a room: the star counter, the ribbon, pause and sound, the shouts, the start card, the thumbs' controls and the pause menu. */
function PlayScreen({ game, touch }: { game: Game; touch: boolean }) {
  const kitten = game.room.kitten
  const shout = game.shouting
  return (
    <>
      <div className="counter">
        <Portrait picture={STAR} animate={false} className="star" />
        <span className="count" key={game.sim.stars}>
          {game.sim.stars}
        </span>
      </div>
      <Ribbon game={game} />
      <div className="corner">
        <Btn className="round" label="Pause" onTap={() => game.pause()}>
          <PauseIcon />
        </Btn>
        <Btn className="round" label="Sound" onTap={() => game.toggleSound()}>
          <SoundIcon on={game.save.sound} />
        </Btn>
      </div>
      {shout && (
        <div className={`shout ${SHOUT_CLASS[shout]}`} key={game.shout!.at}>
          {shout}
        </div>
      )}
      {game.startCard && (
        <div className="card start">
          <Portrait picture={{ kind: 'kitten', name: kitten, pose: 'sit' }} animate className="pic" />
          <p>Find {kitten}!</p>
        </div>
      )}
      {touch && !game.paused && !game.ending && <Controls game={game} ghost={game.ghost} />}
      {game.paused && <PauseMenu game={game} />}
    </>
  )
}

/** After the fifth kitten: the stage has the picnic, the HUD the words and every kitten dancing. */
function PicnicScreen() {
  return (
    <div className="picnic">
      <h1 className="words">You found them all!</h1>
      <div className="kittens">
        {ROOMS.map((r) => (
          <Portrait key={r.id} picture={{ kind: 'kitten', name: r.kitten, pose: 'dance' }} animate className="pic" />
        ))}
      </div>
    </div>
  )
}

/**
 * Everything drawn in the DOM over the canvas: the room cards, the in-room HUD, the menus.
 * Few words and big; the rest is pictures from the game's own draw functions and icons.
 */
export function Hud({ game }: { game: Game }) {
  useGameView(game)
  const touch = useTouchScreen()
  const keyboard = useKeyboardMode()
  return (
    <div className={`hud ${game.screen}`}>
      {game.screen === 'rooms' ? <RoomsScreen game={game} keyboard={keyboard} /> : game.screen === 'play' ? <PlayScreen game={game} touch={touch} /> : <PicnicScreen />}
    </div>
  )
}
