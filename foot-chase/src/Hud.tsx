import { bolts, shoutFor, toggleFullscreen, useGameView, type Game } from './game/game'
import { ROLES, TURBO_BOLTS, type Phase, type Role } from './game/sim'

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
function phaseShout(phase: Phase): { text: string; tone: string } | null {
  switch (phase) {
    case 'caught':
      return { text: 'GOTCHA!', tone: 'win' }
    case 'escaped':
      return { text: 'GOT AWAY!', tone: 'win' }
    case 'escape':
      return { text: 'Run, robber!', tone: 'turbo' }
    case 'regroup':
      return { text: 'Here they come!', tone: 'turbo' }
    default:
      return null
  }
}

/** The colour of a runner's own shout: red for a stumble, pink for a dog, gold for a surprise. */
function toneFor(text: string) {
  if (text === 'WOOF!') return 'eek'
  if (text === 'BONK!' || text === 'BEEP BEEP!' || text === 'WHOOPS!' || text === 'STOP!') return 'bonk'
  return 'got'
}

/** A big round pedal for a thumb: held, it drives one runner's pedal, and lets go however the finger leaves. */
function Pedal({ game, role, value, label }: { game: Game; role: Role; value: -1 | 1; label: string }) {
  const release = () => game.throttle(role, 0)
  return (
    <button
      type="button"
      className="pedal"
      aria-label={`${role} ${value > 0 ? 'sprint' : 'slow'}`}
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
export function Hud({ game }: { game: Game }) {
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
            <div className={`bolts${sim[role].turboOn ? ' is-on' : ''}`} aria-label={`${role} sprint ${lit} of ${TURBO_BOLTS}`}>
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
          <h1>Paused</h1>
          <button type="button" className="big" onClick={() => game.resume()}>
            Keep going
          </button>
          <button type="button" className="big" onClick={() => game.restart()}>
            Start over
          </button>
          <div className="row">
            <button type="button" onClick={() => game.toggleMute()}>
              {muted ? '🔇 Sound off' : '🔊 Sound on'}
            </button>
            <button type="button" onClick={toggleFullscreen}>
              ⛶ Full screen
            </button>
            <button type="button" onClick={() => location.assign('../index.html')}>
              🎮 More games
            </button>
          </div>
          <p className="small">
            <kbd>ESC</kbd> to keep going
          </p>
        </div>
      ) : (
        <>
          {sim.phase === 'ready' && (
            <div className="card menu start">
              <h1>Foot Chase</h1>
              <div className="keys">
                <div className="who police">
                  <b>👮 Police</b>
                  <p>
                    <kbd>W</kbd> jump <kbd>A</kbd> slow <kbd>D</kbd> fast
                  </p>
                  <p className="small">or tap the left side</p>
                </div>
                <div className="who robber">
                  <b>💰 Robber</b>
                  <p>
                    <kbd>↑</kbd> jump <kbd>←</kbd> slow <kbd>→</kbd> fast
                  </p>
                  <p className="small">or tap the right side</p>
                </div>
              </div>
              <p>
                Press <kbd>W</kbd> or <kbd>↑</kbd> to go!
              </p>
              <p className="small">Robber, grab the money bags and get away! Police, catch the robber! Open your own boxes for a surprise.</p>
            </div>
          )}
          {shout && <div className={`shout ${shout.tone}`}>{shout.text}</div>}
          {ROLES.map((role) => {
            const text = shoutFor(sim, role)
            return text ? (
              <div key={role} className={`shout side ${role} ${toneFor(text)}`}>
                {text}
              </div>
            ) : null
          })}
          {sim.phase !== 'ready' && (
            <div className="hint">
              <kbd>W</kbd> <kbd>↑</kbd> or tap = jump <span className="sep">·</span> <kbd>A</kbd> <kbd>←</kbd> slow <span className="sep">·</span> <kbd>D</kbd> <kbd>→</kbd> fast
            </div>
          )}
          {sim.phase !== 'ready' &&
            ROLES.map((role) => (
              <div key={role} className={`pedals ${role}`}>
                <Pedal game={game} role={role} value={-1} label="◀" />
                <Pedal game={game} role={role} value={1} label="▶" />
              </div>
            ))}
        </>
      )}
      <div className="corner">
        <button type="button" onClick={() => (game.paused ? game.resume() : game.pause())} aria-label={game.paused ? 'keep going' : 'pause'}>
          {game.paused ? '▶' : '⏸'}
        </button>
        <button type="button" onClick={() => game.toggleMute()} aria-label={muted ? 'sound off' : 'sound on'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  )
}
