import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import { noFocus } from './Btn'
import type { Game } from './game/game'
import { tripProgress, type HudView } from './game/hud'
import { GoIcon, HornIcon } from './Icons'
import { HomeSignPic, StopPic, ToolPic, TruckPic } from './Pictures'

/** A press on the pedal shorter than this (seconds) is a tap: a push of about a second as well. */
const PUSH_TAP = 0.25

/**
 * The road's controls. The pedal, bottom right, is held (pointer capture; let go on up,
 * cancel or a lost capture); a quick tap pushes. It looks pressed exactly while the game
 * counts the finger on it, so when a pause, the window losing focus or the page hiding lets
 * go of the pedal, it looks let go too, and the next press drives. At a boulder it turns into
 * the tool button, showing the builder's own tool: every press is a hit. The horn sits bottom
 * left. Over the road, the trip strip: a dotted line with the stops and the present ahead,
 * the truck moving along it, and the house at the end.
 */
export function RoadControls({ game, view }: { game: Game; view: NonNullable<HudView['road']> }) {
  const held = useRef<{ id: number; at: number } | null>(null)

  useEffect(() => () => game.pedal('touch', false), [game])

  const press = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    if (view.boulder) {
      game.dispatch({ kind: 'whack' })
      return
    }
    if (game.holds('touch')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    held.current = { id: e.pointerId, at: e.timeStamp }
    game.pedal('touch', true)
  }
  const lift = (e: ReactPointerEvent) => {
    const h = held.current
    if (!h || h.id !== e.pointerId) return
    held.current = null
    // Something let go of the pedal while the finger stayed on it (a pause): lifting the finger then does nothing.
    if (!game.holds('touch')) return
    game.pedal('touch', false)
    if (e.type === 'pointerup' && (e.timeStamp - h.at) / 1000 < PUSH_TAP) game.dispatch({ kind: 'push' })
  }

  return (
    <div className={`road${view.over ? ' over' : ''}`}>
      <Trip game={game} view={view} />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Horn"
        className="btn horn"
        onMouseDown={noFocus}
        onPointerDown={(e) => e.button === 0 && game.dispatch({ kind: 'horn' })}
      >
        <HornIcon />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={view.boulder ? 'Hit the rock' : 'Go'}
        className={`btn pedal${view.boulder ? ' tool' : ''}${game.holds('touch') ? ' down' : ''}${view.pulse ? ' pulse' : ''}`}
        onMouseDown={noFocus}
        onPointerDown={press}
        onPointerUp={lift}
        onPointerCancel={lift}
        onLostPointerCapture={lift}
      >
        {view.boulder ? <ToolPic tool={view.tool} animate className="pic" /> : <GoIcon />}
      </button>
    </div>
  )
}

/** The trip strip: the truck's place along it is read every frame, straight into the DOM; nothing else on it moves. */
function Trip({ game, view }: { game: Game; view: NonNullable<HudView['road']> }) {
  const truck = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const road = game.state.road
      if (road) truck.current!.style.left = `${(tripProgress(road) * 100).toFixed(2)}%`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])
  return (
    <div className="trip">
      <div className="line" />
      {view.stops.map((s) => (
        <span key={s.i} className={`stop ${s.thing.kind}`} style={{ left: `${(s.at * 100).toFixed(2)}%` }}>
          <StopPic stop={s} tool={view.tool} className="pic" />
        </span>
      ))}
      <span className="end">
        <HomeSignPic className="pic" />
      </span>
      <span className="runner" ref={truck}>
        <TruckPic look={game.hud.look} trips={game.state.keep.trips} className="pic" />
      </span>
    </div>
  )
}
