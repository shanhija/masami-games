import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import type { Game } from './game/game'
import { MOUTH_Y } from './game/model'
import { HandIcon } from './Icons'

const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * The fingers' control on a course and in the finale: the whole picture under the HUD's
 * buttons. Touch and hold where she should walk (in the finale, where the monster should
 * roll); the newest finger steers, and lifting it hands back to the finger before, if one is
 * still down. A held mouse button does the same. Everything lets go on pointerup,
 * pointercancel, a lost capture, the window losing focus or the page hiding. In the first
 * course and its finale a ghost hand shows how: it touches the ground ahead of her, or the
 * track under the balloon.
 */
export function Controls({ game, ghost }: { game: Game; ghost: boolean }) {
  const fingers = useRef<{ id: number; x: number; y: number }[]>([])

  useEffect(() => {
    const letGo = () => {
      fingers.current = []
      game.point(null)
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') letGo()
    }
    window.addEventListener('blur', letGo)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', letGo)
      document.removeEventListener('visibilitychange', hidden)
      game.point(null)
    }
  }, [game])

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    fingers.current.push({ id: e.pointerId, x: e.clientX, y: e.clientY })
    game.point({ x: e.clientX, y: e.clientY })
  }
  const move = (e: ReactPointerEvent) => {
    const list = fingers.current
    const f = list.find((s) => s.id === e.pointerId)
    if (!f) return
    f.x = e.clientX
    f.y = e.clientY
    if (f === list[list.length - 1]) game.point({ x: f.x, y: f.y })
  }
  const up = (e: ReactPointerEvent) => {
    const list = fingers.current
    const i = list.findIndex((s) => s.id === e.pointerId)
    if (i < 0) return
    list.splice(i, 1)
    const last = list[list.length - 1]
    game.point(last ? { x: last.x, y: last.y } : null)
  }

  // The ghost touches the ground ahead of her on a course, and the track under the balloon in the finale.
  const ss = game.screenspace
  const at = game.feed ? { left: ss.feedLeft + game.feed.balloon.x * ss.feedScale, top: ss.feedTop + MOUTH_Y * ss.feedScale } : { left: ss.heroX + ss.tile * 2.2, top: ss.heroY }
  return (
    <div className="controls">
      <div className="zone" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={noMenu} />
      {ghost && (
        <div className="ghost" key={game.helpAt} style={at}>
          <HandIcon />
        </div>
      )}
    </div>
  )
}
