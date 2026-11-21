import { useEffect, useRef } from 'react'

import type { Lang } from '../../../profiles/src/lang'
import type { Game } from '../game/game'
import { Renderer } from './frame'

/** The most device pixels the canvas fills: a big iPad at its full pixel ratio is more than it can paint 120 times a second. */
const PIXELS = 3.2e6
/** A frame never counts as longer than this, so a stall never fast-forwards the picture. */
const MAX_FRAME = 0.1
/** The ABC blocks' font: the terrain is baked again once it has loaded. */
const LETTERS = '700 48px "Fredoka Variable"'

/**
 * The one canvas and the one animation loop: every frame sizes the canvas to the screen
 * (within a pixel budget), advances the game once and draws it.
 */
export function Stage({ game, lang }: { game: Game; lang: Lang }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!
    const renderer = new Renderer(el.getContext('2d')!, () => document.createElement('canvas'), lang, new URLSearchParams(location.search).has('debug'))
    let live = true
    void document.fonts.load(LETTERS).then(() => {
      if (live) renderer.invalidate()
    })
    let cssWidth = el.clientWidth
    let cssHeight = el.clientHeight
    const observer = new ResizeObserver(() => {
      cssWidth = el.clientWidth
      cssHeight = el.clientHeight
    })
    observer.observe(el)
    let scale = 0
    let last = -1
    // Back on the page, the first frame covers no time.
    const visibility = () => {
      if (document.visibilityState === 'visible') last = -1
    }
    document.addEventListener('visibilitychange', visibility)
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const seconds = last < 0 ? 0 : Math.min((now - last) / 1000, MAX_FRAME)
      last = now
      // The device pixel ratio is read every frame: zooming or moving to another screen changes it.
      const dpr = Math.min(window.devicePixelRatio, 2, Math.sqrt(PIXELS / (cssWidth * cssHeight)))
      const width = Math.round(cssWidth * dpr)
      const height = Math.round(cssHeight * dpr)
      if (width !== el.width || height !== el.height || dpr !== scale) {
        el.width = width
        el.height = height
        scale = dpr
        renderer.resize(width, height, dpr)
      }
      renderer.draw(game, game.advance(seconds), seconds)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      live = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      renderer.dispose()
    }
  }, [game, lang])
  return <canvas ref={canvas} className="stage" />
}
