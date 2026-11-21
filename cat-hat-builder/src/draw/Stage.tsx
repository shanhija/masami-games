import { useEffect, useRef } from 'react'

import { viewAt } from '../game/camera'
import type { Game } from '../game/game'
import { STEP } from '../game/model'
import { Renderer } from './frame'

/** The most device pixels the canvas fills: a big iPad at its full pixel ratio is more than it can paint every frame. */
const PIXELS = 3.2e6
/** A frame never counts as longer than this, so a stall never fast-forwards the picture. */
const MAX_FRAME = 0.1
/** At most this many frames a second: a 120 Hz screen paints every other refresh, a 90 Hz one two of three, so the picture costs the same everywhere. A refresh up to FRAME_SLACK early still counts as on time. */
const FPS = 60
const FRAME_SLACK = 3

/**
 * The canvas's own events, given to the game until the returned cleanup runs: its pointers,
 * in CSS pixels from its top-left (only the primary button: a right or middle click is no
 * tap), and its context being taken back (`context.lost`) and given back (`context.restored`).
 */
export function canvasEvents(el: HTMLCanvasElement, game: Game, context: { lost: () => void; restored: () => void }): () => void {
  const pointer = (kind: 'down' | 'move' | 'up' | 'cancel') => (e: PointerEvent) => {
    if (kind === 'down' && e.button !== 0) return
    const r = el.getBoundingClientRect()
    if (kind === 'down') el.setPointerCapture(e.pointerId)
    game.pointer(kind, e.clientX - r.left, e.clientY - r.top, e.pointerId)
  }
  const listeners: [string, (e: never) => void][] = [
    ['pointerdown', pointer('down')],
    ['pointermove', pointer('move')],
    ['pointerup', pointer('up')],
    ['pointercancel', pointer('cancel')],
    // The canvas acts on pointerup: without this the browser's click after a touch lands on whatever the tap just put under the finger (a question's cards, a tray). The touchend after a drag cannot be cancelled and makes no click, so it is left alone.
    ['touchend', (e: Event) => e.cancelable && e.preventDefault()],
    // For a 2D canvas the browser gives a lost context back unless the page cancels the event (the opposite of WebGL), so the loss is only noted.
    ['contextlost', context.lost],
    ['contextrestored', context.restored],
  ]
  for (const [type, fn] of listeners) el.addEventListener(type, fn as EventListener, { passive: false })
  return () => {
    for (const [type, fn] of listeners) el.removeEventListener(type, fn as EventListener)
  }
}

/**
 * The one canvas and the one animation loop: every frame sizes the canvas to the screen
 * (within a pixel budget), advances the game, works out the camera's view (which the game
 * keeps for hit testing) and draws. Pointers on the canvas go to the game (canvasEvents).
 * When the browser takes the canvas's memory back (a lost context), the loop keeps the
 * game running without drawing and paints everything again once it is given back.
 */
export function Stage({ game }: { game: Game }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!
    const renderer = new Renderer(el.getContext('2d')!, () => document.createElement('canvas'), new URLSearchParams(location.search).has('debug'))
    let cssWidth = el.clientWidth
    let cssHeight = el.clientHeight
    const observer = new ResizeObserver(() => {
      cssWidth = el.clientWidth
      cssHeight = el.clientHeight
    })
    observer.observe(el)
    let scale = 0
    let last = -1
    let due = 0
    let lost = false
    // Back on the page, the first frame covers no time.
    const visibility = () => {
      if (document.visibilityState === 'visible') last = -1
    }
    document.addEventListener('visibilitychange', visibility)
    const unlisten = canvasEvents(el, game, {
      lost: () => {
        lost = true
      },
      restored: () => {
        lost = false
        scale = 0
        renderer.invalidate()
      },
    })
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (last >= 0 && now < due - FRAME_SLACK) return
      // The next frame is due a frame's time after this one was due; after a stall (or the first frame), a frame's time from now.
      due = due + 1000 / FPS < now ? now + 1000 / FPS : due + 1000 / FPS
      const seconds = last < 0 ? 0 : Math.min((now - last) / 1000, MAX_FRAME)
      last = now
      const dpr = Math.min(window.devicePixelRatio, 2, Math.sqrt(PIXELS / Math.max(1, cssWidth * cssHeight)))
      const width = Math.round(cssWidth * dpr)
      const height = Math.round(cssHeight * dpr)
      if (!lost && (width !== el.width || height !== el.height || dpr !== scale)) {
        el.width = width
        el.height = height
        scale = dpr
        renderer.resize(width, height, dpr)
      }
      const f = game.advance(seconds)
      const t = (game.state.tick + f.alpha - 1) * STEP
      const view = viewAt(game.state, t, cssWidth, cssHeight, dpr)
      game.setView(view)
      if (!lost) renderer.draw(game.state, t, view, f.events, seconds)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      unlisten()
      renderer.dispose()
    }
  }, [game])
  return <canvas ref={canvas} className="stage" />
}
