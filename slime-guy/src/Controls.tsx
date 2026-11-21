import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import type { SlimeLook } from './game/closet'
import { useGameView, useLook, type Game } from './game/game'
import type { Action } from './game/model'
import { fit, useVmin } from './Hud'
import { ArrowIcon, SlimeIcon } from './Icons'
import { WORDS } from './words'

/** Inside this share of the arrows' width either side of their middle a finger keeps the way it had, so a thumb resting on the seam never flickers. */
const DEAD = 0.08

const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * The thumbs' buttons, on a touch screen and in a run only: two big arrows bottom left, the
 * jump (big) and the hide bottom right, all see-through so the track shows through them.
 * Only the arrows show in the tower, and nothing shows while the run drives itself (the
 * ready card, the finish, the top, the done card), while paused, or while the bot plays.
 */
export function Controls({ game, lang }: { game: Game; lang: Lang }) {
  useGameView(game)
  const look = useLook(game)
  if (game.screen !== 'play' || !game.touch || game.paused || game.switches.autoplay) return null
  const s = game.sim
  const tower = s.phase === 'tower' || s.phase === 'fall'
  if (!tower && s.phase !== 'run' && s.phase !== 'splash') return null
  return <Thumbs key={game.generation} game={game} look={look} tower={tower} ask={s.teach === null ? null : s.teach.action} lang={lang} />
}

/**
 * The buttons themselves. The arrows are one steering zone, bigger than the two drawn
 * buttons: the newest finger in it owns the steering, and its side of the arrows' middle is
 * the way, live as it slides, so a thumb can rock from one arrow to the other without
 * lifting. The jump jumps as a finger comes down on it; the hide holds the arms in while
 * any finger is on it. A finger may steer and another jump or hide at the same time.
 * Everything lets go on pointerup, pointercancel, a lost capture, the window losing focus,
 * the page hiding and the buttons going away. The button a teaching moment asks for pulses.
 */
function Thumbs({ game, look, tower, ask, lang }: { game: Game; look: SlimeLook; tower: boolean; ask: Action | null; lang: Lang }) {
  const vmin = useVmin()
  const arrows = useRef<HTMLDivElement>(null)
  /** Fingers in the steering zone, newest last, with where each one is. */
  const steerers = useRef<{ id: number; x: number }[]>([])
  const jumpers = useRef(new Set<number>())
  const hiders = useRef(new Set<number>())
  const dirRef = useRef<-1 | 0 | 1>(0)
  const [dir, setDir] = useState<-1 | 0 | 1>(0)
  const [jumping, setJumping] = useState(false)
  const [hiding, setHiding] = useState(false)

  const steer = (d: -1 | 0 | 1) => {
    if (d === dirRef.current) return
    dirRef.current = d
    setDir(d)
    game.steer('touch', d)
  }
  /** The way for a finger at x: its side of the arrows' middle, keeping the old way inside the dead band. */
  const sideOf = (x: number): -1 | 1 => {
    const r = arrows.current!.getBoundingClientRect()
    const middle = r.left + r.width / 2
    if (x < middle - DEAD * r.width) return -1
    if (x > middle + DEAD * r.width) return 1
    return dirRef.current !== 0 ? dirRef.current : x < middle ? -1 : 1
  }

  useEffect(() => {
    const letGo = () => {
      steerers.current = []
      jumpers.current.clear()
      hiders.current.clear()
      dirRef.current = 0
      setDir(0)
      setJumping(false)
      setHiding(false)
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
    if (f === undefined) return
    f.x = e.clientX
    if (f === list[list.length - 1]) steer(sideOf(f.x))
  }
  const steerUp = (e: ReactPointerEvent) => {
    const list = steerers.current
    const i = list.findIndex((p) => p.id === e.pointerId)
    if (i < 0) return
    list.splice(i, 1)
    // The finger before it, if one is still down, takes over.
    const last = list[list.length - 1]
    steer(last === undefined ? 0 : sideOf(last.x))
  }
  /** A round button held while any of its fingers is on it: `fingers` holds their ids, `held` hears it go down with the first and up with the last. */
  const holder = (fingers: { current: Set<number> }, held: (on: boolean) => void) => {
    const up = (e: ReactPointerEvent) => {
      if (fingers.current.delete(e.pointerId) && fingers.current.size === 0) held(false)
    }
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        if (fingers.current.size === 0) held(true)
        fingers.current.add(e.pointerId)
      },
      onPointerUp: up,
      onPointerCancel: up,
      onLostPointerCapture: up,
      onContextMenu: noMenu,
    }
  }
  const jump = holder(jumpers, (on) => {
    setJumping(on)
    if (on) game.jump()
  })
  const hide = holder(hiders, (on) => {
    setHiding(on)
    game.hide('touch', on)
  })

  const button = fit(vmin, 15, 76, 132)
  const big = fit(vmin, 19.5, 94, 168)
  const cls = (base: string, on: boolean, action: Action) => `btn ${base}${on ? ' on' : ''}${ask === action ? ' ask' : ''}`
  return (
    <div className="play-pad" style={{ '--b': `${button}px`, '--j': `${big}px` } as CSSProperties}>
      <div className="steer" role="group" aria-label={inLang(WORDS.steer, lang)} onPointerDown={steerDown} onPointerMove={steerMove} onPointerUp={steerUp} onPointerCancel={steerUp} onLostPointerCapture={steerUp} onContextMenu={noMenu}>
        <div className="arrows" ref={arrows}>
          <span className={cls('arrow', dir < 0, 'left')}>
            <ArrowIcon dir={-1} size={Math.round(button * 0.56)} />
          </span>
          <span className={cls('arrow', dir > 0, 'right')}>
            <ArrowIcon dir={1} size={Math.round(button * 0.56)} />
          </span>
        </div>
      </div>
      {!tower && (
        <>
          <div className={cls('hide', hiding, 'hide')} role="button" aria-label={inLang(WORDS.hide, lang)} {...hide}>
            <SlimeIcon colour={look.colour} pattern={look.pattern} size={Math.round(button * 0.72)} pose="hide" />
          </div>
          <div className={cls('jump', jumping, 'jump')} role="button" aria-label={inLang(WORDS.jump, lang)} {...jump}>
            <SlimeIcon colour={look.colour} pattern={look.pattern} size={Math.round(big * 0.66)} pose="jump" />
          </div>
        </>
      )}
    </div>
  )
}
