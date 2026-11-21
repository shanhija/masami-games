import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { DIRECTORY } from '../../profiles/src/directory'
import { inLang, type Lang } from '../../profiles/src/lang'
import { Controls } from './Controls'
import { isBread } from './game/feed'
import { toggleFullscreen, useGameView, type Game } from './game/game'
import { BREAD, COURSES, DISHES, FILLINGS, MAX_PICKS, MONSTER_OF, type Dish, type Filling, type Food } from './game/model'
import { HOLD_FOR } from './game/sounds'
import { BackIcon, CardsIcon, CheckIcon, FullScreenIcon, HouseIcon, MusicIcon, PadlockIcon, PauseIcon, PlayIcon, RestartIcon, SoundIcon } from './Icons'
import { Portrait } from './Portrait'
import { DISH_WORD, FILLING_NAME, LUNCH_FOR, PLACE, SAY, SHOUT } from './words'

/** The kitchen's two big pictures. */
const SHOWCASE: Record<Dish, Food[]> = {
  burger: ['bunBottom', 'patty', 'cheese', 'salad', 'tomato', 'bunTop'],
  croissant: ['croissantBottom', 'chocolate', 'banana', 'croissantTop'],
}
/** A press on a locked card shorter than this is a tap, answered with a "nuh-uh" and a shake. */
const TAP_FOR = 0.3
/** The click a finger makes as it lifts after a finished hold comes within this many milliseconds; a later click is a new tap. */
const LIFT_CLICK_MS = 600
/** The finale's stars pop up this far apart. */
const STAR_EVERY = 0.45

const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

/** Every HUD button: never takes focus (so Space never clicks it), never opens the long-press menu. */
function Btn({ className, label, onTap, children, style }: { className: string; label: string; onTap: () => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <button type="button" tabIndex={-1} className={className} aria-label={label} onMouseDown={noFocus} onClick={onTap} onContextMenu={noFocus} style={style}>
      {children}
    </button>
  )
}

/** A card shakes its head: that course is still locked. */
function shake(el: HTMLElement) {
  el.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '10px' }, { translate: '-7px' }, { translate: '5px' }, { translate: '0' }], { duration: 420, easing: 'ease-out' })
}

/**
 * The parent gate's hold: a ring fills round the finger over HOLD_FOR (the gate's rising tone
 * plays meanwhile), then `done` runs; letting go early empties it and does nothing.
 */
function useHold(game: Game) {
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef(0)
  const began = useRef(0)
  /** When a hold last finished: the click its finger makes on lifting is not a tap. */
  const finishedAt = useRef(-Infinity)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const begin = (e: ReactPointerEvent, done: () => void) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    window.clearTimeout(timer.current)
    began.current = performance.now()
    finishedAt.current = -Infinity
    setRing({ x: e.clientX, y: e.clientY })
    game.holding(true)
    timer.current = window.setTimeout(() => {
      timer.current = 0
      finishedAt.current = performance.now()
      setRing(null)
      done()
    }, HOLD_FOR * 1000)
  }
  /** Lets go; says how long the hold ran, or -1 if none was running. */
  const end = () => {
    if (timer.current === 0) return -1
    window.clearTimeout(timer.current)
    timer.current = 0
    setRing(null)
    return (performance.now() - began.current) / 1000
  }
  /** Whether this click is the lift of a hold that just finished (and so does nothing); asks once. */
  const swallow = () => {
    const lifting = performance.now() - finishedAt.current < LIFT_CLICK_MS
    finishedAt.current = -Infinity
    return lifting
  }
  const view = ring && <div className="ring" style={{ left: ring.x, top: ring.y, animationDuration: `${HOLD_FOR}s` }} />
  return { view, begin, end, swallow }
}

/** A row of stars: `n` gold out of three. */
function Stars({ n, className }: { n: number; className: string }) {
  return (
    <span className={className}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? 'star got' : 'star'}>
          ★
        </span>
      ))}
    </span>
  )
}

/** The course cards: each course's monster, hungry until it has had lunch, then happy with its best stars. */
function Courses({ game, lang }: { game: Game; lang: Lang }) {
  const hold = useHold(game)
  const home = game.homecoming
  return (
    <div className="screen courses">
      <h1 className="title">{inLang(DIRECTORY['monster-lunch'].name, lang)}</h1>
      <div className="cards">
        {COURSES.map((id, i) => {
          const open = game.isOpen(i)
          const stars = game.save.stars[id]
          const fresh = home !== null && home.index === i
          const opening = home !== null && home.opened === i
          return (
            <button
              key={id}
              type="button"
              tabIndex={-1}
              className={`card ${id}${open ? '' : ' locked'}${fresh ? ' fed' : ''}${opening ? ' opening' : ''}`}
              aria-label={inLang(PLACE[id], lang)}
              onMouseDown={noFocus}
              onContextMenu={noFocus}
              onPointerDown={(e) => {
                if (!open) hold.begin(e, () => game.unlockCourse(i))
              }}
              onPointerUp={(e) => {
                if (open) return
                const ran = hold.end()
                if (ran >= 0 && ran < TAP_FOR) {
                  game.holding(false)
                  game.tapCard(i)
                  shake(e.currentTarget)
                } else if (ran >= 0) game.holding(false)
              }}
              onPointerCancel={() => {
                if (hold.end() >= 0) game.holding(false)
              }}
              onClick={() => {
                if (open && !hold.swallow()) game.tapCard(i)
              }}
            >
              <Portrait className="who" picture={{ kind: 'monster', id: MONSTER_OF[id], mood: stars > 0 ? 'happy' : 'hungry' }} />
              <span className="place">{inLang(PLACE[id], lang)}</span>
              <Stars n={stars} className="card-stars" />
              {(!open || opening) && (
                <span className="padlock">
                  <PadlockIcon />
                </span>
              )}
              {home !== null && fresh && home.newFood && <span className="badge">{inLang(SAY.newFood, lang)}</span>}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="fresh"
        onMouseDown={noFocus}
        onContextMenu={noFocus}
        onPointerDown={(e) => hold.begin(e, () => game.startFresh())}
        onPointerUp={() => {
          if (hold.end() >= 0) game.holding(false)
        }}
        onPointerCancel={() => {
          if (hold.end() >= 0) game.holding(false)
        }}
      >
        {inLang(SAY.holdToStartFresh, lang)}
      </button>
      <a className="more" href="../index.html" aria-label={inLang(SAY.moreGames, lang)} onMouseDown={noFocus}>
        <HouseIcon />
      </a>
      {hold.view}
    </div>
  )
}

/** The kitchen: a burger or a croissant, then one to three fillings, then Go! */
function Kitchen({ game, lang }: { game: Game; lang: Lang }) {
  const monster = MONSTER_OF[game.course.id]
  const back = (
    <Btn className="round back" label={inLang(SAY.back, lang)} onTap={() => game.kitchenBack()}>
      <BackIcon />
    </Btn>
  )
  if (game.kitchen === 'dish') {
    return (
      <div className="screen kitchen">
        {back}
        <h2 className="heading">{inLang(LUNCH_FOR[monster], lang)}</h2>
        <div className="dishes">
          {DISHES.map((d) => (
            <Btn key={d} className="dish" label={inLang(DISH_WORD[d], lang)} onTap={() => game.pickDish(d)}>
              <Portrait className="dish-picture" picture={{ kind: 'pile', pile: SHOWCASE[d] }} />
              <span className="dish-word">{inLang(DISH_WORD[d], lang)}</span>
            </Btn>
          ))}
        </div>
        <Portrait className="peek" picture={{ kind: 'monster', id: monster, mood: 'hungry' }} />
      </div>
    )
  }
  const dish = game.dish
  const open = game.fillings(dish)
  return (
    <div className="screen kitchen">
      {back}
      <div className="making">
        <div className="preview">
          <Portrait className="preview-picture" picture={{ kind: 'pile', pile: [BREAD[dish].bottom, ...game.picks, BREAD[dish].top] }} />
          <span className="slots">
            {Array.from({ length: MAX_PICKS }, (_, i) => (
              <span key={i} className={i < game.picks.length ? 'slot full' : 'slot'} />
            ))}
          </span>
          <Btn className={`go${game.picks.length === 0 ? ' off' : ''}`} label={inLang(SAY.go, lang)} onTap={() => game.go()}>
            {inLang(SAY.go, lang)}
          </Btn>
        </div>
        <div className="fillings">
          {(FILLINGS[dish] as readonly Filling[]).map((f) => {
            const can = open.includes(f)
            const picked = game.picks.includes(f)
            return (
              <Btn
                key={f}
                className={`filling${picked ? ' picked' : ''}${can ? '' : ' locked'}`}
                label={inLang(FILLING_NAME[f], lang)}
                onTap={() => {
                  if (can) game.toggleFilling(f)
                }}
              >
                <Portrait className="filling-picture" picture={{ kind: 'food', food: f }} />
                {picked && (
                  <span className="tick">
                    <CheckIcon />
                  </span>
                )}
                {!can && (
                  <span className="padlock">
                    <PadlockIcon />
                  </span>
                )}
                {can && game.isNew(dish, f) && <span className="badge">{inLang(SAY.new, lang)}</span>}
              </Btn>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** On the course: the plate's count, the pause button, the shouts, the fingers' zone. */
function PlayHud({ game, lang }: { game: Game; lang: Lang }) {
  const plate = game.sim.plate
  const fillings = plate.filter((f) => f !== 'poop').length
  return (
    <>
      <div className="plate-count">
        <span className="plate-disc" />
        <span className="count">{fillings}</span>
      </div>
      <Btn className="round pause" label={inLang(SAY.pause, lang)} onTap={() => game.pause()}>
        <PauseIcon />
      </Btn>
    </>
  )
}

/** The finale: what is still in the basket, the pause button, then the stars. */
function FeedHud({ game, lang }: { game: Game; lang: Lang }) {
  const f = game.feed!
  const left = f.queue.slice(0, 9)
  const done = game.starsAt >= 0
  return (
    <>
      {!done && (
        <div className="basket">
          {/* Keyed by its place in the whole dish, so a drop slides the row along without redrawing it. */}
          {left.map((k, i) => (
            <Portrait key={f.falling.length + i} className={isBread(k) ? 'next bread' : 'next'} picture={{ kind: 'food', food: k }} />
          ))}
          {f.queue.length > left.length && <span className="more-left">+{f.queue.length - left.length}</span>}
        </div>
      )}
      {!done && (
        <Btn className="round pause" label={inLang(SAY.pause, lang)} onTap={() => game.pause()}>
          <PauseIcon />
        </Btn>
      )}
      {done && <StarsUp game={game} n={f.stars} />}
    </>
  )
}

/** The finale's stars, popping up one by one with a chime each. */
function StarsUp({ game, n }: { game: Game; n: number }) {
  useEffect(() => {
    const timers = Array.from({ length: n }, (_, i) => window.setTimeout(() => game.starUp(), (0.3 + i * STAR_EVERY) * 1000))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [game, n])
  return (
    <div className="stars-up">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? 'big-star got' : 'big-star'} style={{ animationDelay: `${0.3 + i * STAR_EVERY}s` }}>
          ★
        </span>
      ))}
    </div>
  )
}

function Pause({ game, lang }: { game: Game; lang: Lang }) {
  return (
    <div className="pause-menu" onPointerDown={(e) => e.target === e.currentTarget && game.resume()}>
      <div className="panel">
        <Btn className="big go-on" label={inLang(SAY.keepGoing, lang)} onTap={() => game.resume()}>
          <PlayIcon />
          <span>{inLang(SAY.keepGoing, lang)}</span>
        </Btn>
        <Btn className="big" label={inLang(SAY.startAgain, lang)} onTap={() => game.restart()}>
          <RestartIcon />
          <span>{inLang(SAY.startAgain, lang)}</span>
        </Btn>
        <Btn className="big" label={inLang(SAY.courses, lang)} onTap={() => game.toCourses()}>
          <CardsIcon />
          <span>{inLang(SAY.courses, lang)}</span>
        </Btn>
        <div className="switches">
          <Btn className={`small${game.save.music ? '' : ' off'}`} label={inLang(SAY.music, lang)} onTap={() => game.toggleMusic()}>
            <MusicIcon off={!game.save.music} />
          </Btn>
          <Btn className={`small${game.save.sound ? '' : ' off'}`} label={inLang(SAY.sound, lang)} onTap={() => game.toggleSound()}>
            <SoundIcon off={!game.save.sound} />
          </Btn>
          <Btn className="small" label={inLang(SAY.fullScreen, lang)} onTap={toggleFullscreen}>
            <FullScreenIcon />
          </Btn>
          <a className="small" href="../index.html" aria-label={inLang(SAY.moreGames, lang)} onMouseDown={noFocus}>
            <HouseIcon />
          </a>
        </div>
      </div>
    </div>
  )
}

/** Everything over the canvas, in the player's language: the screens, the HUD of the course and the finale, the shouts, the pause menu. */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  useGameView(game)
  const shout = game.shouting
  return (
    <div className={`hud on-${game.screen}`}>
      {game.screen === 'courses' && <Courses game={game} lang={lang} />}
      {game.screen === 'kitchen' && <Kitchen game={game} lang={lang} />}
      {(game.screen === 'play' || game.screen === 'feed') && !game.paused && game.starsAt < 0 && <Controls game={game} ghost={game.ghost} />}
      {game.screen === 'play' && !game.paused && <PlayHud game={game} lang={lang} />}
      {game.screen === 'feed' && game.feed && !game.paused && <FeedHud game={game} lang={lang} />}
      {game.screen === 'party' && <h1 className="title party-title">{inLang(SHOUT.hooray, lang)}</h1>}
      {shout && (game.screen === 'play' || game.screen === 'feed') && (
        <div className={`shout ${shout}`} key={game.shout!.at}>
          {inLang(SHOUT[shout], lang)}
        </div>
      )}
      {game.paused && <Pause game={game} lang={lang} />}
    </div>
  )
}
