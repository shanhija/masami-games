import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Game } from './game/game'
import { BubbleIcon, ChevronIcon, HandIcon } from './Icons'

/** Inside this share of the pad's width either side of its centre a thumb keeps the direction it had, so a thumb resting on the seam never flickers. */
const DEAD = 0.12

const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * The thumbs' controls in a room. The left 40% of the screen below the top bar (from 40 px
 * in, clear of iPad Safari's back swipe) steers: the newest finger in it owns it, and its
 * side of the drawn pad's centre is the direction, live as it slides. The right half below
 * the top bar is the jump, held while any finger is on it. The bubble button sits above
 * the jump while she has the wand. Everything is see-through outlines so a pit or a
 * grumble shows through, and lets go on pointerup, pointercancel, a lost capture, the
 * window losing focus or the page hiding.
 */
export function Controls({ game, ghost }: { game: Game; ghost: boolean }) {
  const pad = useRef<HTMLDivElement>(null)
  /** Fingers in the move zone, newest last, with where each one is. */
  const steerers = useRef<{ id: number; x: number }[]>([])
  const jumpers = useRef(new Set<number>())
  const blowers = useRef(new Set<number>())
  const dirRef = useRef<-1 | 0 | 1>(0)
  const [dir, setDir] = useState<-1 | 0 | 1>(0)
  const [jumping, setJumping] = useState(false)
  const [blowing, setBlowing] = useState(false)
  const bubble = game.sim.hero.form === 'bubble'
  /** In the first room a control pulses gently until she has used it once. */
  const learn = (used: boolean) => (game.teaching && !used ? ' learn' : '')

  const steer = (d: -1 | 0 | 1) => {
    if (d === dirRef.current) return
    dirRef.current = d
    setDir(d)
    game.move('touch', d)
  }
  /** The direction for a finger at x: by its side of the pad's centre, keeping the old one inside the dead band. */
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
      blowers.current.clear()
      dirRef.current = 0
      setDir(0)
      setJumping(false)
      setBlowing(false)
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

  // The wand lost under a held finger: its button goes, and so does the hold.
  useEffect(() => {
    if (bubble || blowers.current.size === 0) return
    blowers.current.clear()
    setBlowing(false)
    game.bubble('touch', false)
  }, [bubble, game])

  const steerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    steerers.current.push({ id: e.pointerId, x: e.clientX })
    steer(sideOf(e.clientX))
  }
  const steerMove = (e: ReactPointerEvent) => {
    const list = steerers.current
    const f = list.find((s) => s.id === e.pointerId)
    if (!f) return
    f.x = e.clientX
    if (f === list[list.length - 1]) steer(sideOf(f.x))
  }
  const steerUp = (e: ReactPointerEvent) => {
    const list = steerers.current
    const i = list.findIndex((s) => s.id === e.pointerId)
    if (i < 0) return
    list.splice(i, 1)
    // The finger before it, if one is still down, takes over.
    const last = list[list.length - 1]
    steer(last ? sideOf(last.x) : 0)
  }
  /** A button held while any of its fingers is on it: `set` holds the finger ids. */
  const holder = (set: { current: Set<number> }, press: (down: boolean) => void, show: (on: boolean) => void) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      if (set.current.size === 0) {
        press(true)
        show(true)
      }
      set.current.add(e.pointerId)
    },
    onPointerUp: (e: ReactPointerEvent) => {
      if (set.current.delete(e.pointerId) && set.current.size === 0) {
        press(false)
        show(false)
      }
    },
  })
  const jumpHold = holder(jumpers, (down) => game.jump('touch', down), setJumping)
  const bubbleHold = holder(blowers, (down) => game.bubble('touch', down), setBlowing)

  return (
    <div className="controls">
      <div className="pad" ref={pad}>
        <div className={`half${dir < 0 ? ' on' : ''}${learn(game.used.left)}`}>
          <ChevronIcon dir="left" />
        </div>
        <div className={`half${dir > 0 ? ' on' : ''}${learn(game.used.right)}`}>
          <ChevronIcon dir="right" />
        </div>
      </div>
      <div className={`jump${jumping ? ' on' : ''}${learn(game.used.jump)}`}>
        <ChevronIcon dir="up" />
      </div>
      <div
        className="zone steer"
        onPointerDown={steerDown}
        onPointerMove={steerMove}
        onPointerUp={steerUp}
        onPointerCancel={steerUp}
        onLostPointerCapture={steerUp}
        onContextMenu={noMenu}
      />
      <div className="zone leap" {...jumpHold} onPointerCancel={jumpHold.onPointerUp} onLostPointerCapture={jumpHold.onPointerUp} onContextMenu={noMenu} />
      {bubble && (
        <div className={`blow${blowing ? ' on' : ''}`} {...bubbleHold} onPointerCancel={bubbleHold.onPointerUp} onLostPointerCapture={bubbleHold.onPointerUp} onContextMenu={noMenu}>
          <BubbleIcon />
        </div>
      )}
      {ghost && (
        <div className="ghost" key={game.helpAt}>
          <HandIcon />
        </div>
      )}
    </div>
  )
}
