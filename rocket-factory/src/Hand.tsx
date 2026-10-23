import { useEffect, useRef } from 'react'

import { drawHand, handPose, handRoom, type HandButton } from './draw/hand'
import { pen } from './draw/look'
import type { Game } from './game/game'
import type { Box } from './game/where'

/**
 * Where each HUD button the hand presses or points at is on the page, as Hud.tsx, Tray.tsx
 * and Cards.tsx lay it out, first match first: a tray sticker by its slot, the peel and Oops
 * wherever the frame puts them (the tray, the strip upright, a phone's column), each of the
 * choice's two pictures on the choice card, else in the path view while it is open, else on
 * the lab card, else a phone's lab card (its tap opens the path), and the card up.
 */
function selectors(b: HandButton): readonly string[] {
  switch (b.kind) {
    case 'sticker':
      return [`.hud .tray .slot[data-sticker="${b.sticker}"] .btn`]
    case 'peel':
      return ['.hud .btn.peel']
    case 'oops':
      return ['.hud .btn.oops']
    case 'choice': {
      const word = b.card === 'bubbles' ? 'Bubbles' : 'Hedges'
      return [`.hud .layer.choose .pick[aria-label="${word}"]`, `.hud .dim.path .btn.card.step.now[aria-label="${word}"]`, `.hud .lab-card.choice .pick[aria-label="${word}"]`, '.hud .column .lab-card']
    }
    case 'card':
      return ['.hud .layer.discovery .card.found']
  }
}

/** A HUD button's box on the page, CSS px, or null while the page shows none. */
function buttonAt(b: HandButton): Box | null {
  for (const sel of selectors(b)) {
    const el = document.querySelector(sel)
    if (el === null) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  return null
}

/**
 * The hint's hand over everything but the pause menu: over the board, the tray and a card
 * (draw/hand.ts handPose and drawHand). Each frame it reads the game's state, the view the
 * stage drew and that frame's time, so it moves with the picture; a small canvas carries it
 * (bigger while a sticker rides above the fingertip), moved with a transform and faded with
 * its opacity. It hides while the game is paused and
 * while the path view is open (unless the choice it shows waits there), and never takes a
 * touch.
 */
export function HintHand({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    let raf = 0
    let shown = false
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const view = game.view
      const pose = view === null || game.paused || (game.path && game.state.hint?.step.kind !== 'choose') ? null : handPose(game.state, view, game.frameTime, buttonAt)
      if (pose === null) {
        if (shown) el.style.visibility = 'hidden'
        shown = false
        return
      }
      const dpr = Math.min(window.devicePixelRatio, 2)
      const side = Math.ceil(handRoom(pose) * pose.size)
      const px = Math.round(side * dpr)
      if (el.width !== px) {
        el.width = el.height = px
        el.style.width = el.style.height = `${side}px`
      }
      el.style.transform = `translate(${(pose.x - side / 2).toFixed(1)}px, ${(pose.y - side / 2).toFixed(1)}px)`
      el.style.opacity = pose.alpha.toFixed(3)
      if (!shown) el.style.visibility = 'visible'
      shown = true
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, px, px)
      const k = pose.size * dpr
      ctx.setTransform(k, 0, 0, k, px / 2, px / 2)
      pen.ppm = pose.size
      pen.dpr = dpr
      drawHand(ctx, pose, game.frameTime)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])
  return <canvas ref={ref} className="hand" aria-hidden />
}
