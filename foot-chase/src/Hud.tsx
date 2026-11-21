import { DIRECTORY } from '../../profiles/src/directory'
import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import { bolts, shoutFor, toggleFullscreen, useGameView, type Game, type Shout } from './game/game'
import { ROLES, TURBO_BOLTS, type Phase, type Role } from './game/sim'
import { HINT, KEYS, NAME, PAUSE, PHASE_SHOUT, ROLE, SHOUT, START } from './words'

/** A five-point star, the same outline as the badge on the officer. */
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 5
  const r = i % 2 === 0 ? 1 : 0.45
  return `${(Math.cos(a) * r).toFixed(3)},${(-Math.sin(a) * r).toFixed(3)}`
}).join(' ')

/** What each score is counted in: stars for the police, gold coins for the robber. */
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

/** The shout for each phase, in the middle of the picture. */
function phaseShout(phase: Phase): { words: Words; tone: string } | null {
  switch (phase) {
    case 'caught':
      return { words: PHASE_SHOUT.gotcha, tone: 'win' }
    case 'escaped':
      return { words: PHASE_SHOUT.gotAway, tone: 'win' }
    case 'escape':
      return { words: PHASE_SHOUT.runRobber, tone: 'turbo' }
    case 'regroup':
      return { words: PHASE_SHOUT.hereTheyCome, tone: 'turbo' }
    default:
      return null
  }
}

/** The colour of a runner's own shout: red for a stumble or a stop, pink for a dog, gold for a surprise. */
function toneFor(shout: Shout) {
  if (shout === 'woof') return 'eek'
  if (shout === 'bonk' || shout === 'honk' || shout === 'slip' || shout === 'stop') return 'bonk'
  return 'got'
}

/** A line of words with keys in it: each `[cap]` is shown as a key. */
function Keyed({ text }: { text: string }) {
  return text.split(/\[([^\]]+)\]/).map((part, i) => (i % 2 === 1 ? <kbd key={i}>{part}</kbd> : part))
}

/** A big round pedal for a thumb: held, it drives one runner's pedal, and lets go however the finger leaves. */
function Pedal({ game, role, value, label, name }: { game: Game; role: Role; value: -1 | 1; label: string; name: string }) {
  const release = () => game.throttle(role, 0)
  return (
    <button
      type="button"
      className="pedal"
      aria-label={name}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        game.throttle(role, value)
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
 * The words over the picture, few and big: the police's stars on the left, the robber's
 * coins on the right, each with its sprint bolts, what to press, and a shout when
 * something happens. Re-renders only when the game says there is news.
 */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const sim = useGameView(game)
  const muted = game.audio.muted
  const shout = phaseShout(sim.phase)
  return (
    <div className="hud">
      {ROLES.map((role) => {
        const lit = bolts(sim[role])
        return (
          <div key={role} className={`player ${role}`}>
            <div className="score">
              <ScoreIcon role={role} size={44} />
              <span>{role === 'police' ? sim.catches : sim.coins}</span>
            </div>
            <div className={`bolts${sim[role].turboOn ? ' is-on' : ''}`} aria-label={say(NAME.sprintLeft[role](lit, TURBO_BOLTS))}>
              {Array.from({ length: TURBO_BOLTS }, (_, i) => (
                <span key={i} className={i < lit ? 'lit' : ''}>
                  ⚡
                </span>
              ))}
            </div>
          </div>
        )
      })}
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
              <h1>{say(DIRECTORY['foot-chase'].name)}</h1>
              <div className="keys">
                {ROLES.map((role) => (
                  <div key={role} className={`who ${role}`}>
                    <b>{say(ROLE[role])}</b>
                    <p>
                      <Keyed text={say(KEYS[role].keys)} />
                    </p>
                    <p className="small">{say(KEYS[role].tap)}</p>
                  </div>
                ))}
              </div>
              <p>
                <Keyed text={say(START.go)} />
              </p>
              <p className="small">{say(START.goal)}</p>
            </div>
          )}
          {shout && <div className={`shout ${shout.tone}`}>{say(shout.words)}</div>}
          {ROLES.map((role) => {
            const own = shoutFor(sim, role)
            return own ? (
              <div key={role} className={`shout side ${role} ${toneFor(own)}`}>
                {say(SHOUT[own])}
              </div>
            ) : null
          })}
          {sim.phase !== 'ready' && (
            <div className="hint">
              <Keyed text={say(HINT.jump)} /> <span className="sep">·</span> <Keyed text={say(HINT.slow)} /> <span className="sep">·</span> <Keyed text={say(HINT.fast)} />
            </div>
          )}
          {sim.phase !== 'ready' &&
            ROLES.map((role) => (
              <div key={role} className={`pedals ${role}`}>
                <Pedal game={game} role={role} value={-1} label="◀" name={say(NAME.pedal[role].slow)} />
                <Pedal game={game} role={role} value={1} label="▶" name={say(NAME.pedal[role].fast)} />
              </div>
            ))}
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
