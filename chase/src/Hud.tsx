import { DIRECTORY } from '../../profiles/src/directory'
import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import { bolts, bonking, shrieking, toggleFullscreen, useGameView, type Game } from './game/game'
import { TURBO_BOLTS, other, score, type Phase, type Role } from './game/sim'
import { GO, GOAL, HINT, NAME, PAUSE, PLAY_AS, ROLE, SHOUT } from './words'

/** A five-point star, the same outline as the badge on the car door. */
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 5
  const r = i % 2 === 0 ? 1 : 0.45
  return `${(Math.cos(a) * r).toFixed(3)},${(-Math.sin(a) * r).toFixed(3)}`
}).join(' ')

/** What the score is counted in: stars for the police, gold coins for the robber. */
function ScoreIcon({ role, size }: { role: Role; size: number }) {
  return (
    <svg width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      {role === 'police' ? (
        <polygon points={STAR_POINTS} fill="#ffd23f" stroke="#b8860b" strokeWidth="0.12" strokeLinejoin="round" />
      ) : (
        <>
          <circle r="0.95" fill="#ffc933" stroke="#b8860b" strokeWidth="0.12" />
          <circle r="0.6" fill="none" stroke="#b8860b" strokeWidth="0.1" />
        </>
      )}
    </svg>
  )
}

/** The shout for each phase, from the player's side of it. */
function shoutFor(role: Role, phase: Phase): { words: Words; tone: string } | null {
  switch (phase) {
    case 'caught':
      return { words: SHOUT.gotcha, tone: role === 'police' ? 'win' : 'lose' }
    case 'escaped':
      return { words: SHOUT.gotAway, tone: 'win' }
    case 'escape':
      return { words: role === 'police' ? SHOUT.catchMe : SHOUT.goGoGo, tone: 'turbo' }
    case 'regroup':
      return { words: SHOUT.hereTheyCome, tone: 'turbo' }
    default:
      return null
  }
}

/** A line of words with keys in it: each `[cap]` is shown as a key. */
function Keyed({ text }: { text: string }) {
  return text.split(/\[([^\]]+)\]/).map((part, i) => (i % 2 === 1 ? <kbd key={i}>{part}</kbd> : part))
}

/** A big round pedal for a thumb: held, it drives the throttle, and lets go however the finger leaves. */
function Pedal({ game, value, label, name }: { game: Game; value: -1 | 1; label: string; name: string }) {
  const release = () => game.throttle(0)
  return (
    <button
      type="button"
      className="pedal"
      aria-label={name}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        game.throttle(value)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

/**
 * The words over the picture, few and big: the score, the turbo bolts, what to press,
 * and a shout when something happens. Re-renders only when the game says there is news.
 */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const sim = useGameView(game)
  const muted = game.audio.muted
  const shout = shoutFor(sim.role, sim.phase)
  const lit = bolts(sim)
  return (
    <div className="hud">
      <div className="score">
        <ScoreIcon role={sim.role} size={44} />
        <span>{score(sim)}</span>
      </div>
      <div className={`bolts${sim.turboOn ? ' is-on' : ''}`} aria-label={say(NAME.turboLeft(lit, TURBO_BOLTS))}>
        {Array.from({ length: TURBO_BOLTS }, (_, i) => (
          <span key={i} className={i < lit ? 'lit' : ''}>
            ⚡
          </span>
        ))}
      </div>
      {game.paused ? (
        <div className="card menu">
          <h1>{say(PAUSE.paused)}</h1>
          <button type="button" className="big" onClick={() => game.resume()}>
            {say(PAUSE.keepGoing)}
          </button>
          <button type="button" className="big" onClick={() => game.restart()}>
            {say(PAUSE.startOver)}
          </button>
          <div className="row">
            <button type="button" onClick={() => game.restart(other(sim))}>
              {say(PLAY_AS[other(sim)])}
            </button>
            <button type="button" onClick={() => game.toggleMute()}>
              {say(muted ? PAUSE.soundOff : PAUSE.soundOn)}
            </button>
            <button type="button" onClick={toggleFullscreen}>
              {say(PAUSE.fullScreen)}
            </button>
            <button type="button" onClick={() => location.assign('../index.html')}>
              {say(PAUSE.moreGames)}
            </button>
          </div>
          <p className="small">
            <Keyed text={say(PAUSE.escToGoOn)} />
          </p>
        </div>
      ) : (
        <>
          {sim.phase === 'ready' && (
            <div className="card menu start">
              <h1>{say(DIRECTORY.chase.name)}</h1>
              <div className="row">
                {(['police', 'robber'] as const).map((role) => (
                  <button key={role} type="button" className={role === sim.role ? 'is-active' : ''} onClick={() => game.chooseRole(role)}>
                    {say(ROLE[role])}
                  </button>
                ))}
              </div>
              <p>
                <Keyed text={say(GO)} />
              </p>
              <p className="small">{say(GOAL[sim.role])}</p>
            </div>
          )}
          {shout && <div className={`shout ${shout.tone}`}>{say(shout.words)}</div>}
          {bonking(sim) && sim.phase === 'chase' && <div className="shout bonk">{say(SHOUT.bonk)}</div>}
          {shrieking(sim) && <div className="shout eek">{say(SHOUT.worm)}</div>}
          {sim.phase !== 'ready' && (
            <div className={`hint${sim.wormAt >= 0 ? ' urgent' : ''}`}>
              {sim.wormAt >= 0 ? (
                say(HINT.worm)
              ) : (
                <>
                  <Keyed text={say(HINT.jump)} /> <span className="sep">·</span> <Keyed text={say(HINT.pedals)} />
                </>
              )}
            </div>
          )}
          {sim.phase !== 'ready' && (
            <div className="pedals">
              <Pedal game={game} value={-1} label="◀" name={say(NAME.brake)} />
              <Pedal game={game} value={1} label="▶" name={say(NAME.turbo)} />
            </div>
          )}
        </>
      )}
      <div className="corner">
        <button type="button" onClick={() => (game.paused ? game.resume() : game.pause())} aria-label={say(game.paused ? NAME.keepGoing : NAME.pause)}>
          {game.paused ? '▶' : '⏸'}
        </button>
        <button type="button" onClick={() => game.toggleMute()} aria-label={say(muted ? NAME.soundOff : NAME.soundOn)}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  )
}
