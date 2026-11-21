import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

import { canFullscreen, HEARD_FOR, useGameView } from './game/game'
import type { Game } from './game/game'
import type { Voice } from './game/listen'
import { RANKS } from './game/model'
import type { ChapterId, MachineKind, Mode, Picture, Spoken, SpokenWork } from './game/model'
import { stepPointer, stepView } from './game/sim'
import { WORDS_TO_TRY } from './game/speech'
import { onEdge } from './scene/frame'
import { freeArea } from './scene/free'
import { BUTTON, cls, hintOf, hintTier, noDefault } from './Controls'
import { ActionIcon, Face, Glyph, HatIcon, paintColour, PictureIcon, PLACE_PICTURE } from './Icons'
import type { GlyphName } from './Icons'

/** The landmark each chapter builds. */
const LANDMARK: Record<ChapterId, Picture> = { road: 'road', house: 'house', bridge: 'bridge', play: 'playground', clock: 'clock' }
const WORK_FACE: Record<SpokenWork, 'dig' | 'dump' | 'bladeDown' | 'stomp'> = { take: 'dig', give: 'dump', push: 'bladeDown', roll: 'stomp' }
/** Pip's hard hat. */
const PIP_HAT = '#ffd23f'
/** Seconds a flight of stars takes. */
const STARS_FOR = 2.2
/** Seconds a hold button must be held. */
const HOLD_FOR = 3

/** A tap that acts the moment the finger is down. */
const tapOn = (act: () => void) => ({
  onPointerDown: (e: { preventDefault: () => void }) => {
    e.preventDefault()
    act()
  },
})

/** The index in RANKS of the rank these stars earn. */
const rankIndex = (stars: number) => RANKS.filter((r) => r.stars <= stars).length - 1

/** The hard hat of the rank the stars have earned, beside the stars: it bounces with a burst when the rank grows. */
function RankHat({ rank }: { rank: number }) {
  const [ups, setUps] = useState(0)
  const seen = useRef(rank)
  useEffect(() => {
    if (seen.current === rank) return
    seen.current = rank
    setUps((n) => n + 1)
  }, [rank])
  return (
    <span key={ups} className={cls('rank-hat', ups > 0 && 'up')}>
      <HatIcon colour={RANKS[rank].hat} />
      {ups > 0 ? (
        <span className="burst" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ rotate: `${i * 45}deg` }} />)}
        </span>
      ) : null}
    </span>
  )
}

function Counter({ glyph, value, children }: { glyph: GlyphName; value: number; children?: ReactNode }) {
  return (
    <div className="chip">
      <span className="chip-icon"><Glyph name={glyph} /></span>
      <span key={value} className="chip-num">{value}</span>
      {children}
    </div>
  )
}

/** The world marker's arrow at the edge of the free part of the screen when the marker is outside it, and the hint hand when it taps the ring. Written straight to the elements, a frame at a time. */
function Markers({ game, loud, ring }: { game: Game; loud: boolean; ring: boolean }) {
  const arrow = useRef<HTMLDivElement>(null)
  const hand = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    // Half the diagonal of the arrow's square: turned any way, it stays inside the free area. The nudge only moves it outward.
    // The square's size follows the window, so it is measured again whenever it changes size (a resize or a turned device), never in a frame.
    const box = arrow.current!.firstElementChild as HTMLElement
    let inset = 0
    const measure = () => {
      inset = (box.offsetWidth * Math.SQRT2) / 2
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(box)
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const a = arrow.current!
      const h = hand.current!
      const sim = game.sim
      const p = game.screen === 'play' && !game.paused && sim.mode === 'easy' ? stepPointer(sim) : null
      const at = p === null || game.project === null ? null : game.project(p.x, p.y, p.z)
      const free = freeArea()
      if (at === null || (at.onScreen && at.x >= free.left && at.x <= free.right && at.y >= free.top && at.y <= free.bottom)) {
        a.style.opacity = '0'
        if (at === null) h.style.opacity = '0'
        else {
          h.style.opacity = h.dataset.on === '1' ? '1' : '0'
          h.style.transform = `translate(${at.x}px, ${at.y}px)`
        }
        return
      }
      h.style.opacity = '0'
      const edge = onEdge(free, at.x, at.y, inset)
      a.style.opacity = '1'
      a.style.transform = `translate(${edge.x}px, ${edge.y}px) rotate(${edge.angle}deg)`
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      resized.disconnect()
    }
  }, [game, loud])
  return (
    <>
      <div ref={arrow} className="edge" style={{ opacity: 0 }}>
        <div className={cls('edge-bob', loud && 'loud')}>
          <PictureIcon picture="arrow" />
        </div>
      </div>
      <div ref={hand} className="ring-hand" data-on={ring ? '1' : '0'} style={{ opacity: 0 }}>
        <span className="hand tap"><Glyph name="hand" /></span>
      </div>
    </>
  )
}

/** One clause of Finnish speech as pictures. */
function ClausePictures({ clause, game }: { clause: Spoken; game: Game }) {
  const bits: ReactNode[] = []
  if (clause.stop) bits.push(<Glyph key="stop" name="stop" />)
  if (clause.help) bits.push(<Glyph key="help" name="question" />)
  if (clause.honk) bits.push(<Glyph key="honk" name="horn" />)
  if (clause.who !== null) bits.push(<PictureIcon key="who" picture={clause.who} colour={paintColour(game.save.paints[clause.who])} />)
  if (clause.come) bits.push(<Glyph key="come" name="hand" />)
  if (clause.move !== null) {
    const turn = { forward: 0, right: 90, back: 180, left: 270, up: 0, down: 180, around: 135 }[clause.move]
    bits.push(
      <span key="move" style={{ rotate: `${turn - 90}deg` }} className="turned">
        <PictureIcon picture="arrow" />
      </span>,
    )
  }
  if (clause.work !== null) bits.push(<ActionIcon key="work" face={WORK_FACE[clause.work]} />)
  if (clause.to !== null) {
    const place = clause.to in PLACE_PICTURE ? PLACE_PICTURE[clause.to as keyof typeof PLACE_PICTURE] : (clause.to as Picture)
    bits.push(<PictureIcon key="to" picture={place} />)
  }
  return <>{bits.map((b, i) => <span key={i} className="heard-pic">{b}</span>)}</>
}

function HeardStrip({ game }: { game: Game }) {
  const h = game.heard
  if (h === null || game.clock - h.at >= HEARD_FOR) return null
  return (
    <div key={h.at} className={cls('heard', !h.understood && 'miss')}>
      <div className="heard-row">
        {h.understood ? h.clauses.map((c, i) => <ClausePictures key={i} clause={c} game={game} />) : <span className="heard-pic"><Glyph name="question" /></span>}
        {h.wanted === null ? null : (
          <span className="heard-want">
            <span className="heard-pic"><PictureIcon picture={h.wanted.machine} colour={paintColour(game.save.paints[h.wanted.machine])} /></span>
            <b>{h.wanted.word}</b>
          </span>
        )}
      </div>
      <div className="heard-text">{h.text}</div>
    </div>
  )
}

function Bubble({ game }: { game: Game }) {
  const sim = game.sim
  const run = sim.job
  if (run === null || sim.party !== null) return null
  const view = stepView(sim)
  const intro = sim.card !== null && sim.card.kind === 'chapter'
  return (
    <div className={cls('bubble', intro && 'intro')}>
      <div key={`${run.job.id}.${run.step}`} className="bubble-card hazard-top">
        <div className="bubble-wish">
          <span className="bubble-who"><Face species={run.job.who} hat={run.job.who === 'hedgehog' ? PIP_HAT : undefined} /></span>
          {run.job.wish.map((p, i) => <span key={i} className="bubble-pic"><PictureIcon picture={p} /></span>)}
        </div>
        {view === null ? null : (
          <div className="bubble-step">
            {view.pictures.map((p, i) => <span key={i} className="step-pic"><PictureIcon picture={p} /></span>)}
            <span className="dots">
              {Array.from({ length: view.of }, (_, i) => <i key={i} className={cls('dot', i < view.done && 'full')} />)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Stars({ count, of }: { count: number; of: number }) {
  return (
    <div className="stars">
      {Array.from({ length: of }, (_, i) => <span key={i} className={cls('star', i >= count && 'off')} style={{ animationDelay: `${0.25 + i * 0.2}s` }}><Glyph name="star" /></span>)}
    </div>
  )
}

/** Chapter end and the end of the story. Both go on by themselves: the sim takes a card down after its time. The chapter's start has no card of its own: the bubble grows. */
function CardView({ game }: { game: Game }) {
  const sim = game.sim
  const card = sim.card
  if (card === null) return null
  if (card.kind === 'chapter') return null
  const end = card.kind === 'theEnd'
  return (
    <div key={`${card.kind}${end ? '' : card.chapter}`} className="cardwrap">
      <div className="bigcard hazard-top">
        {end ? (
          <>
            <div className="bigcard-face"><Face species={game.save.driver.species} hat="#ffcf3f" /></div>
            <div className="bigcard-title">The End</div>
          </>
        ) : (
          <>
            <div className="bigcard-pic"><PictureIcon picture={LANDMARK[card.chapter]} /></div>
            <div className="bigcard-title">Hooray!</div>
          </>
        )}
        <div className="bigcard-stars"><span className="chip-icon"><Glyph name="star" /></span><b>{card.stars}</b></div>
        <button type="button" {...BUTTON} aria-label="next" className="push next" {...tapOn(() => game.next())}>
          <Glyph name="play" />
        </button>
      </div>
    </div>
  )
}

/** Stars rising when a job ends: the ones earned are gold. */
function Flight({ game }: { game: Game }) {
  const [flights, setFlights] = useState<{ id: number; stars: number }[]>([])
  useEffect(() => {
    let seen: unknown = null
    let id = 0
    return game.subscribe(() => {
      if (game.events === seen) return
      seen = game.events
      for (const e of game.events) {
        if (e.kind !== 'jobDone') continue
        const flight = { id: id++, stars: e.stars }
        setFlights((all) => [...all, flight])
        setTimeout(() => setFlights((all) => all.filter((f) => f !== flight)), STARS_FOR * 1000)
      }
    })
  }, [game])
  return (
    <>
      {flights.map((f) => (
        <div key={f.id} className="flight" style={{ animationDuration: `${STARS_FOR}s` }}>
          <Stars count={f.stars} of={Math.max(3, f.stars)} />
        </div>
      ))}
    </>
  )
}

/** What the parent is told for each reason the recognizer gave for stopping. */
const VOICE_TROUBLE: Record<string, string> = {
  'not-allowed': 'The microphone is blocked. Allow it for this page in the browser settings.',
  'service-not-allowed': 'Talking to the game is turned off on this device. On an iPad, turn on Dictation in Settings.',
  'language-not-supported': 'This browser cannot hear Finnish.',
  network: 'Hearing needs the internet.',
  'audio-capture': 'No microphone was found.',
}

/** What the microphone line for the parent says. */
function voiceLine(voice: Voice): string {
  switch (voice.state) {
    case 'unsupported':
      return 'This browser cannot hear. Chrome, Edge or Safari can.'
    case 'denied':
    case 'broken':
      return VOICE_TROUBLE[voice.errorName ?? ''] ?? 'Listening stopped. Tap the microphone to try again.'
    default:
      return 'Listening sends the voice to the browser’s speech service: Google in Chrome, Apple in Safari.'
  }
}

type KeyRow = { caps: readonly string[]; word: string }

/** The keys and the mouse that work every machine. */
const KEYS: readonly KeyRow[] = [
  { caps: ['W', 'A', 'S', 'D'], word: 'Drive' },
  { caps: ['Left drag'], word: 'First two levers' },
  { caps: ['Wheel'], word: 'Third lever' },
  { caps: ['Right drag'], word: 'Fourth lever' },
  { caps: ['1-9'], word: 'Pick a machine' },
  { caps: ['H'], word: 'Horn' },
  { caps: ['C'], word: 'Camera' },
  { caps: ['M'], word: 'Sound' },
  { caps: ['Esc'], word: 'Pause' },
]

/** What the keys do on each machine. */
const LEVERS: Record<MachineKind, readonly KeyRow[]> = {
  digger: [
    { caps: ['Q', 'E'], word: 'Turn' },
    { caps: ['R', 'F'], word: 'Boom' },
    { caps: ['T', 'G'], word: 'Stick' },
    { caps: ['Z', 'X'], word: 'Bucket' },
  ],
  dumper: [{ caps: ['Q', 'E'], word: 'Bed' }],
  dozer: [{ caps: ['Q', 'E'], word: 'Blade' }],
  roller: [{ caps: ['Space'], word: 'Stomp' }],
  mixer: [{ caps: ['Q', 'E'], word: 'Chute' }],
  forklift: [
    { caps: ['Q', 'E'], word: 'Forks' },
    { caps: ['Space'], word: 'Pick or drop' },
  ],
  tower: [
    { caps: ['Q', 'E'], word: 'Turn' },
    { caps: ['R', 'F'], word: 'Trolley' },
    { caps: ['T', 'G'], word: 'Hook' },
    { caps: ['Space'], word: 'Hook or unhook' },
  ],
  semi: [{ caps: ['Space'], word: 'Unload' }],
  mobile: [
    { caps: ['Q', 'E'], word: 'Turn' },
    { caps: ['R', 'F'], word: 'Reach' },
    { caps: ['T', 'G'], word: 'Hook' },
    { caps: ['Space'], word: 'Hook or unhook' },
  ],
}

function KeyRows({ rows }: { rows: readonly KeyRow[] }) {
  return (
    <>
      {rows.map((k) => (
        <div key={k.word} className="keys-row">
          <span className="caps">{k.caps.map((c) => <kbd key={c}>{c}</kbd>)}</span>
          <span>{k.word}</span>
        </div>
      ))}
    </>
  )
}

/** A button that must be held by one finger: the ring fills over three seconds and then `act` runs. A second finger, or any finger lifting, empties the ring. */
function HoldButton({ label, text, act }: { label: string; text: string; act: () => void }) {
  const timer = useRef<number | null>(null)
  const down = useRef(new Set<number>())
  const [holding, setHolding] = useState(false)
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  const lift = (e: ReactPointerEvent<HTMLElement>) => {
    down.current.delete(e.pointerId)
    stop()
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      {...BUTTON}
      aria-label={label}
      className={cls('pill', 'fresh', holding && 'holding')}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        stop()
        down.current.add(e.pointerId)
        if (down.current.size > 1) return
        setHolding(true)
        timer.current = window.setTimeout(() => {
          stop()
          down.current.clear()
          act()
        }, HOLD_FOR * 1000)
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onPointerLeave={lift}
      onLostPointerCapture={lift}
    >
      <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="45" pathLength="1" strokeDasharray="1" transform="rotate(-90 50 50)" style={{ animationDuration: `${HOLD_FOR}s` }} />
      </svg>
      <span className="pill-icon"><PictureIcon picture="plus" /></span>
      <span>{text}</span>
    </button>
  )
}

function ModeButton({ game, mode, glyph, label }: { game: Game; mode: Mode; glyph: GlyphName; label: string }) {
  return (
    <button type="button" {...BUTTON} aria-label={label} className={cls('pill', 'mode', game.save.mode === mode && 'on')} onClick={() => game.setMode(mode)}>
      <span className="pill-icon"><Glyph name={glyph} /></span>
      <span>{label}</span>
    </button>
  )
}

function PauseCard({ game, rank }: { game: Game; rank: number }) {
  const save = game.save
  const pro = save.mode === 'pro'
  const voice = game.voice
  const half = Math.ceil(WORDS_TO_TRY.length / 2)
  return (
    <div className="pausewrap" onPointerDown={noDefault}>
      <div className="pausecard hazard-top">
        <div className="pause-main">
          <div className="pause-rank">
            <span className="pause-rank-hat"><HatIcon colour={RANKS[rank].hat} /></span>
            <b>{RANKS[rank].name}</b>
          </div>
          <button type="button" {...BUTTON} aria-label="keep going" className="push keep" onClick={() => game.setPaused(false)}>
            <Glyph name="play" />
            <span>Keep going</span>
          </button>
          <div className="pause-row">
            <button type="button" {...BUTTON} aria-label="music" className={cls('pill', 'toggle', save.music && 'on')} onClick={() => game.setMusic(!save.music)}>
              <span className="pill-icon"><Glyph name={save.music ? 'music' : 'musicOff'} /></span>
              <span>Music</span>
            </button>
            <button type="button" {...BUTTON} aria-label="sound" className={cls('pill', 'toggle', save.sound && 'on')} onClick={() => game.setSound(!save.sound)}>
              <span className="pill-icon"><Glyph name={save.sound ? 'sound' : 'soundOff'} /></span>
              <span>Sound</span>
            </button>
          </div>
          <div className="pause-row">
            <ModeButton game={game} mode="easy" glyph="hand" label="Easy" />
            <ModeButton game={game} mode="pro" glyph="keyboard" label="Pro" />
          </div>
          {pro ? (
            <div className="keys">
              <KeyRows rows={LEVERS[game.sim.active]} />
              <KeyRows rows={KEYS} />
            </div>
          ) : null}
          <div className="pause-row">
            <button type="button" {...BUTTON} aria-label="paint shop" className="pill" onClick={() => game.openShop()}>
              <span className="pill-icon"><Glyph name="paint" /></span>
              <span>Paint</span>
            </button>
            {canFullscreen() ? (
              <button type="button" {...BUTTON} aria-label="full screen" className="pill" onClick={() => game.toggleFullscreen()}>
                <span className="pill-icon"><Glyph name="fullscreen" /></span>
                <span>Full screen</span>
              </button>
            ) : null}
            <a className="pill" href="../index.html" aria-label="more games" tabIndex={-1} onContextMenu={noDefault} draggable={false}>
              <span className="pill-icon"><Glyph name="games" /></span>
              <span>More games</span>
            </a>
          </div>
        </div>
        <div className="pause-words">
          <div className="words-title">Try saying</div>
          <div className="words">
            {[WORDS_TO_TRY.slice(0, half), WORDS_TO_TRY.slice(half)].map((col, i) => (
              <div key={i} className="words-col">
                {col.map((w) => (
                  <div key={w.word} className="word">
                    <span className="word-pic"><PictureIcon picture={w.picture} /></span>
                    <span>{w.word}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className={cls('voiceline', (voice.state === 'denied' || voice.state === 'broken' || voice.state === 'unsupported') && 'bad')}>{voiceLine(voice)}</p>
          {game.saveTrouble ? <p className="voiceline bad">Part of the old save could not be read. A copy is kept.</p> : null}
          <div className="pause-row">
            <HoldButton label="hold to start fresh" text="Hold: new game" act={() => game.startFresh()} />
            {game.oldTown ? <HoldButton label="hold to get the old town back" text="Hold: old town back" act={() => game.restoreOldTown()} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Everything over the valley while a play runs. */
export function Hud({ game }: { game: Game }) {
  useGameView(game)
  if (game.screen !== 'play') return null
  const sim = game.sim
  const save = game.save
  const hint = hintOf(sim)
  const rank = rankIndex(sim.score.stars)
  const soundOn = save.sound || save.music
  return (
    <div className="hud">
      <div className="topleft">
        <Counter glyph="star" value={sim.score.stars}>
          <RankHat rank={rank} />
        </Counter>
        <Counter glyph="coin" value={Math.floor(sim.score.coins)} />
      </div>
      <Bubble game={game} />
      <div className="topright">
        <button type="button" {...BUTTON} aria-label="pause" className="push round" {...tapOn(() => game.setPaused(true))}>
          <Glyph name="pause" />
        </button>
        <button
          type="button"
          {...BUTTON}
          aria-label="sound"
          className="push round"
          {...tapOn(() => {
            game.setSound(!soundOn)
            game.setMusic(!soundOn)
          })}
        >
          <Glyph name={soundOn ? 'sound' : 'soundOff'} />
        </button>
      </div>
      <Markers game={game} loud={hintTier(sim) >= 1} ring={hint !== null && hint.where === 'ring'} />
      <HeardStrip game={game} />
      <CardView game={game} />
      <Flight game={game} />
      {game.paused ? <PauseCard game={game} rank={rank} /> : null}
    </div>
  )
}
