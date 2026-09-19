import { bolts, bonking, shrieking, toggleFullscreen, useGameView, type Game } from './game/game'
import { TURBO_BOLTS, other, score, type Phase, type Role } from './game/sim'

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

const ROLE_LABEL: Record<Role, string> = { police: '🚓 Police', robber: '💰 Robber' }
const GOAL: Record<Role, string> = { police: 'Jump the rocks and cakes. Catch the robber!', robber: 'Jump the rocks and cakes. Get away from the police!' }

/** The shout for each phase, from the player's side of it. */
function shoutFor(role: Role, phase: Phase): { text: string; tone: string } | null {
  switch (phase) {
    case 'caught':
      return { text: 'GOTCHA!', tone: role === 'police' ? 'win' : 'lose' }
    case 'escaped':
      return { text: 'GOT AWAY!', tone: 'win' }
    case 'escape':
      return { text: role === 'police' ? 'Catch me!' : 'Go go go!', tone: 'turbo' }
    case 'regroup':
      return { text: 'Here they come!', tone: 'turbo' }
    default:
      return null
  }
}

function RolePick({ game, current }: { game: Game; current: Role }) {
  return (
    <div className="row">
      {(['police', 'robber'] as const).map((role) => (
        <button key={role} type="button" className={role === current ? 'is-active' : ''} onClick={() => game.chooseRole(role)}>
          {ROLE_LABEL[role]}
        </button>
      ))}
    </div>
  )
}

/** A big round pedal for a thumb: held, it drives the throttle, and lets go however the finger leaves. */
function Pedal({ game, value, label }: { game: Game; value: -1 | 1; label: string }) {
  const release = () => game.throttle(0)
  return (
    <button
      type="button"
      className="pedal"
      aria-label={value > 0 ? 'turbo' : 'brake'}
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
export function Hud({ game }: { game: Game }) {
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
      <div className={`bolts${sim.turboOn ? ' is-on' : ''}`} aria-label={`turbo ${lit} of ${TURBO_BOLTS}`}>
        {Array.from({ length: TURBO_BOLTS }, (_, i) => (
          <span key={i} className={i < lit ? 'lit' : ''}>
            ⚡
          </span>
        ))}
      </div>
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
            <button type="button" onClick={() => game.restart(other(sim))}>
              Play as {ROLE_LABEL[other(sim)]}
            </button>
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
              <h1>Police Chase</h1>
              <RolePick game={game} current={sim.role} />
              <p>
                Press <kbd>SPACE</kbd> to go!
              </p>
              <p className="small">{GOAL[sim.role]}</p>
            </div>
          )}
          {shout && <div className={`shout ${shout.tone}`}>{shout.text}</div>}
          {bonking(sim) && sim.phase === 'chase' && <div className="shout bonk">BONK!</div>}
          {shrieking(sim) && <div className="shout eek">EEK! A worm!</div>}
          {sim.phase !== 'ready' && (
            <div className={`hint${sim.wormAt >= 0 ? ' urgent' : ''}`}>
              {sim.wormAt >= 0 ? (
                <>
                  Jump! Shake it off!
                </>
              ) : (
                <>
                  <kbd>SPACE</kbd> or tap = jump <span className="sep">·</span> <kbd>◀</kbd> brake <kbd>▶</kbd> turbo
                </>
              )}
            </div>
          )}
          {sim.phase !== 'ready' && (
            <div className="pedals">
              <Pedal game={game} value={-1} label="◀" />
              <Pedal game={game} value={1} label="▶" />
            </div>
          )}
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
