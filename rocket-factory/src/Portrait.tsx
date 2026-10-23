import { useEffect, useRef } from 'react'

import type { Box } from './game/where'
import { pen } from './draw/look'

/**
 * One of the game's own drawings in a small canvas, for the HUD: an item, a sticker in the
 * tray, a discovery card. The canvas takes its size from CSS and draws at the screen's pixel
 * ratio, the world box `box` centred and fitted to it. It draws once (and again on a resize,
 * a new `id` or a lost context given back), or every frame when `animate`.
 * `id` names the picture: a new id redraws, the same id never does.
 */
export function Portrait({ id, box, draw, animate, className }: { id: string; box: Box; draw: (ctx: CanvasRenderingContext2D, t: number) => void; animate: boolean; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const paint = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio, 3)
      const w = Math.round(el.clientWidth * dpr)
      const h = Math.round(el.clientHeight * dpr)
      if (w === 0 || h === 0) return
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, w, h)
      }
      const k = Math.min(w / box.w, h / box.h)
      pen.ppm = k / dpr
      pen.dpr = dpr
      ctx.setTransform(k, 0, 0, k, w / 2 - (box.x + box.w / 2) * k, h / 2 - (box.y + box.h / 2) * k)
      drawRef.current(ctx, t)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    if (!animate) {
      // Drawn once, and again on a resize or when the browser gives back a context it took (it comes back blank).
      const still = () => paint(0.6)
      still()
      const watch = new ResizeObserver(still)
      watch.observe(el)
      el.addEventListener('contextrestored', still)
      return () => {
        watch.disconnect()
        el.removeEventListener('contextrestored', still)
      }
    }
    let raf = 0
    const frame = (now: number) => {
      paint(now / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // The picture is named by its id and box, so a new draw callback with the same id draws nothing new.
  }, [id, animate, box.x, box.y, box.w, box.h])
  return (
    <span className={`portrait ${className}`} aria-hidden>
      <canvas ref={ref} />
    </span>
  )
}
