import { useEffect, useRef } from 'react'

import { groundShadow, pen } from '../../pia-jump/src/draw/look'
import { drawPerson, frameOf, type Act } from './draw/person'
import type { Look, Part } from './game/closet'

/** A still doll is drawn at this moment: eyes open, an act's loop part way in. */
const STILL = 1.1

/**
 * The person on a canvas of its own, for the DOM: the closet's stage and tiles, the map, the
 * present card. The canvas takes its size from CSS (`.doll` fills its box) and draws at the
 * screen's pixel ratio, the box frameOf gives for `zoom` centred and fitted, a soft shadow
 * under the feet when they show. `animate` runs the act's loop (walking on the spot from
 * the clock); else one still frame, drawn again when the look, the zoom or the size changes.
 * Always facing the viewer.
 */
export function Doll({ look, act, animate, zoom, className }: { look: Look; act: Act; animate: boolean; zoom: Part | 'all'; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(look)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const [cx, cy, bw, bh] = frameOf(look, zoom)
    const floor = cy + bh / 2 > 0
    const pace = act === 'walk' ? 1.6 : act === 'run' ? 3 : act === 'climb' ? 0.8 : 0
    const paint = (s: number) => {
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
      const k = Math.min(w / bw, h / bh)
      pen.px = k
      ctx.setTransform(k, 0, 0, k, w / 2 - cx * k, h / 2 - cy * k)
      if (floor) groundShadow(ctx, 0.9)
      drawPerson(ctx, look, { act, stride: s * pace, since: s, t: s, squash: 0, turn: 0 }, null)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    if (!animate) {
      paint(STILL)
      const watch = new ResizeObserver(() => paint(STILL))
      watch.observe(el)
      return () => watch.disconnect()
    }
    let raf = 0
    let start = -1
    const frame = (now: number) => {
      if (start < 0) start = now
      paint((now - start) / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // The look is compared by its key, so a new object with the same contents draws nothing new.
  }, [key, zoom, act, animate])
  return (
    <span className={`doll ${className}`} aria-hidden>
      <canvas ref={ref} />
    </span>
  )
}
