import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { ChevronIcon } from '../../pia-jump/src/Icons'
import { drawIcon } from './draw/blocks'
import type { Game } from './game/game'
import { Picture } from './Picture'

/** Inside this share of the pad's width either side of its centre a thumb keeps the direction it had. */
const DEAD = 0.12

const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * The thumbs' controls in a level, as in Pia Jump: the left 40% of the screen below the top
 * bar steers (the newest finger in it owns it, its side of the pad's centre is the
 * direction), the right half is the jump, held while any finger is on it. The build button
 * sits above the jump and shows the block it puts down. Everything is see-through outlines,
 * and lets go on pointerup, pointercancel, a lost capture, the window losing focus or the
 * page hiding.
 */
export function Controls({ game }: { game: Game }) {
  const pad = useRef<HTMLDivElement>(null)
  const steerers = useRef<{ id: number; x: number }[]>([])
  const jumpers = useRef(new Set<number>())
  const dirRef = useRef<-1 | 0 | 1>(0)
  const [dir, setDir] = useState<-1 | 0 | 1>(0)
  const [jumping, setJumping] = useState(false)
  const s = game.sim
  const holding = s.hand[s.chosen] > 0
  const learn = (used: boolean) => (game.teaching && !used ? ' learn' : '')

  const steer = (d: -1 | 0 | 1) => {
    if (d === dirRef.current) return
    dirRef.current = d
    setDir(d)
    game.move('touch', d)
  }
  const sideOf = (x: number): -1 | 1 => {
    const r = pad.current!.getBoundingClientRect()
    const centre = r.left + r.width / 2
    if (x < centre - DEAD * r.width) return -1
    if (x > centre + DEAD * r.width) return 1
    return dirRef.current !== 0 ? dirRef.current : x < centre ? -1 : 1
  }

  useEffect(() => {
    const letGo = () => {
      steerers.current = []
      jumpers.current.clear()
      dirRef.current = 0
      setDir(0)
      setJumping(false)
      game.release('touch')
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') letGo()
    }
    window.addEventListener('blur', letGo)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', letGo)
      document.removeEventListener('visibilitychange', hidden)
      game.release('touch')
    }
  }, [game])

  const steerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    steerers.current.push({ id: e.pointerId, x: e.clientX })
    steer(sideOf(e.clientX))
  }
  const steerMove = (e: ReactPointerEvent) => {
    const list = steerers.current
    const f = list.find((p) => p.id === e.pointerId)
    if (!f) return
    f.x = e.clientX
    if (f === list[list.length - 1]) steer(sideOf(f.x))
  }
  const steerUp = (e: ReactPointerEvent) => {
    const list = steerers.current
    const i = list.findIndex((p) => p.id === e.pointerId)
    if (i < 0) return
    list.splice(i, 1)
    const last = list[list.length - 1]
    steer(last ? sideOf(last.x) : 0)
  }
  const jumpDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (jumpers.current.size === 0) {
      game.jump('touch', true)
      setJumping(true)
    }
    jumpers.current.add(e.pointerId)
  }
  const jumpUp = (e: ReactPointerEvent) => {
    if (jumpers.current.delete(e.pointerId) && jumpers.current.size === 0) {
      game.jump('touch', false)
      setJumping(false)
    }
  }

  return (
    <div className="controls">
      <div className="pad" ref={pad}>
        <div className={`half${dir < 0 ? ' on' : ''}${learn(game.used.move)}`}>
          <ChevronIcon dir="left" />
        </div>
        <div className={`half${dir > 0 ? ' on' : ''}${learn(game.used.move)}`}>
          <ChevronIcon dir="right" />
        </div>
      </div>
      <div className={`jump${jumping ? ' on' : ''}${learn(game.used.jump)}`}>
        <ChevronIcon dir="up" />
      </div>
      <div className="zone steer" onPointerDown={steerDown} onPointerMove={steerMove} onPointerUp={steerUp} onPointerCancel={steerUp} onLostPointerCapture={steerUp} onContextMenu={noMenu} />
      <div className="zone leap" onPointerDown={jumpDown} onPointerUp={jumpUp} onPointerCancel={jumpUp} onLostPointerCapture={jumpUp} onContextMenu={noMenu} />
      <button
        className={`build${holding ? '' : ' empty'}${learn(game.used.build || !holding)}`}
        aria-label="Build"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          game.build()
        }}
        onContextMenu={noMenu}
      >
        <Picture paint={(ctx) => drawIcon(ctx, s.chosen, 0.8)} span={1} version={s.chosen} className="block" />
      </button>
    </div>
  )
}
