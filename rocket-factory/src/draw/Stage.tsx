import { useEffect, useRef } from 'react'

import { viewAt } from '../game/camera'
import type { Insets, View } from '../game/layout'
import { STEP, type Hit, type SimEvent, type State } from '../game/model'
import { HEEL, type Press } from '../game/touch'
import { Renderer } from './frame'

/** What the stage drives: the shell's game (game.ts implements it). */
export interface StageGame {
  /** Runs the sim for `seconds` of real time (clamped by the game): how many steps ran, how far into the next step the picture is (0 to 1), and every event of those steps in order. */
  advance(seconds: number): { steps: number; alpha: number; events: readonly SimEvent[] }
  readonly state: State
  /** The view the stage drew: the game's router hit-tests against it. */
  setView(view: View): void
  /** A canvas pointer, in CSS px from the canvas's top-left; press: 'touch' for a touch or pen, 'heel' for a touch too wide for a fingertip, 'left' or 'right' for a mouse button; 'hover' and 'leave' for a mouse with no button down. */
  pointer(kind: 'down' | 'move' | 'up' | 'cancel' | 'hover' | 'leave', id: number, sx: number, sy: number, press: Press): void
  /** The finger the ghost and the end sign float above, and the mouse's hovered target, from the router. */
  readonly finger: { x: number; y: number; touch: boolean } | null
  readonly hover: Hit | null
  /** ?debug is on. */
  readonly debug: boolean
}

/** The most device pixels the canvas fills: a big iPad at its full pixel ratio is more than it can paint every frame. The pixel ratio is capped at 2 as well. */
const PIXELS = 3.2e6
/** A frame never counts as longer than this, so a stall never fast-forwards the picture. */
const MAX_FRAME = 0.1
/** At most this many frames a second: a 120 Hz screen paints every other refresh, a 90 Hz one two of three, so the picture costs the same everywhere. A refresh up to FRAME_SLACK ms early still counts as on time. */
const FPS = 60
const FRAME_SLACK = 3

/** The safe areas the system keeps (the home indicator, a notch), as CSS env() gives them to the probe's padding. */
function measureInsets(probe: HTMLElement): Insets {
  const cs = getComputedStyle(probe)
  return { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) }
}

/**
 * The canvas's own events, given to the game until the returned cleanup runs: its pointers in
 * CSS px from its top-left (a finger or a pen is a touch, and one whose contact the browser
 * reports wider or taller than touch.ts HEEL is the heel of her hand; a mouse's left or right
 * button, and with no button down its hover and its leaving; a middle click is nothing), each
 * pointer's type to `seen`, and its context being taken back (`context.lost`) and given back
 * (`context.restored`).
 */
export function canvasEvents(el: HTMLCanvasElement, game: StageGame, seen: (finger: boolean) => void, context: { lost: () => void; restored: () => void }): () => void {
  /** The pointers pressed now, by id, and how. */
  const pressed = new Map<number, Press>()
  const at = (e: PointerEvent): [number, number] => {
    const r = el.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e: PointerEvent) => {
    seen(e.pointerType !== 'mouse')
    const press: Press | null = e.pointerType !== 'mouse' ? (Math.max(e.width, e.height) > HEEL ? 'heel' : 'touch') : e.button === 0 ? 'left' : e.button === 2 ? 'right' : null
    if (press === null) return
    el.setPointerCapture(e.pointerId)
    pressed.set(e.pointerId, press)
    game.pointer('down', e.pointerId, ...at(e), press)
  }
  const move = (e: PointerEvent) => {
    seen(e.pointerType !== 'mouse')
    const press = pressed.get(e.pointerId)
    if (press !== undefined) game.pointer('move', e.pointerId, ...at(e), press)
    else if (e.pointerType === 'mouse') game.pointer('hover', e.pointerId, ...at(e), 'left')
  }
  const end = (kind: 'up' | 'cancel') => (e: PointerEvent) => {
    const press = pressed.get(e.pointerId)
    if (press === undefined) return
    pressed.delete(e.pointerId)
    game.pointer(kind, e.pointerId, ...at(e), press)
  }
  const leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !pressed.has(e.pointerId)) game.pointer('leave', e.pointerId, ...at(e), 'left')
  }
  const listeners: [string, (e: never) => void][] = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', end('up')],
    ['pointercancel', end('cancel')],
    ['pointerleave', leave],
    // The right button is the peel's: no menu.
    ['contextmenu', (e: Event) => e.preventDefault()],
    // The canvas acts on pointerup: without this the browser's click after a touch lands on whatever the tap just put under the finger (a card, the tray). The touchend after a drag cannot be cancelled and makes no click, so it is left alone.
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
 * The one canvas and the one animation loop: every frame sizes the canvas to the window
 * (within a pixel budget, at most twice the CSS pixels), advances the game, works out the
 * view (camera.ts viewAt: the safe areas measured once per resize, a touch screen or not by
 * the last pointer's type), hands it to the game for its hit tests and draws. Pointers on the
 * canvas go to the game (canvasEvents). When the browser takes the canvas's memory back (a
 * lost context) the loop keeps the game running without drawing, and paints everything again
 * once it is given back.
 */
export function Stage({ game }: { game: StageGame }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!
    const renderer = new Renderer(el.getContext('2d')!, () => document.createElement('canvas'), game.debug)
    // A hidden element padded with the safe areas: its computed padding is what env() says.
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    document.body.appendChild(probe)
    let cssWidth = el.clientWidth
    let cssHeight = el.clientHeight
    let safe = measureInsets(probe)
    const observer = new ResizeObserver(() => {
      cssWidth = el.clientWidth
      cssHeight = el.clientHeight
      safe = measureInsets(probe)
    })
    observer.observe(el)
    // A touch screen until a mouse says otherwise (and back): the gutters and the finger's feedback follow.
    let touch = window.matchMedia('(pointer: coarse)').matches
    let scale = 0
    let last = -1
    let due = 0
    let lost = false
    /** Whether the last frame's view was upright, null before the first. */
    let upright: boolean | null = null
    // Back on the page, the first frame covers no time.
    const visibility = () => {
      if (document.visibilityState === 'visible') last = -1
    }
    document.addEventListener('visibilitychange', visibility)
    const unlisten = canvasEvents(
      el,
      game,
      (finger) => {
        touch = finger
      },
      {
        lost: () => {
          lost = true
        },
        restored: () => {
          lost = false
          scale = 0
          renderer.invalidate()
        },
      },
    )
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
      let view = viewAt(game.state, t, cssWidth, cssHeight, dpr, touch, safe)
      // The window turned since the last frame: the game hears it first (the rules stamp the turn), so this very frame starts the table's turn from the way it was instead of showing the new way settled for a frame.
      if (upright !== null && view.upright !== upright) {
        game.setView(view)
        view = viewAt(game.state, t, cssWidth, cssHeight, dpr, touch, safe)
      }
      upright = view.upright
      game.setView(view)
      if (!lost) renderer.draw(game.state, t, view, f.events, seconds, game.finger, game.hover)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      probe.remove()
      document.removeEventListener('visibilitychange', visibility)
      unlisten()
      renderer.dispose()
    }
  }, [game])
  return <canvas ref={canvas} className="stage" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
}
