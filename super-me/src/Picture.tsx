import { useEffect, useRef } from 'react'

import { pen } from '../../pia-jump/src/draw/look'

/** A still canvas picture for the DOM: `paint` draws in world units with the box's centre at the origin and the box `span` tiles across, crisp at the device's pixel ratio. Painted again when its box or `version` changes. */
export function Picture({ paint, span, version, className }: { paint: (ctx: CanvasRenderingContext2D) => void; span: number; version: string; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(paint)
  latest.current = paint
  useEffect(() => {
    const el = ref.current!
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      const w = Math.round(el.clientWidth * dpr)
      const h = Math.round(el.clientHeight * dpr)
      if (w === 0 || h === 0) return
      el.width = w
      el.height = h
      const ctx = el.getContext('2d')!
      const tile = Math.min(w, h) / span
      pen.px = tile
      ctx.setTransform(tile, 0, 0, tile, w / 2, h / 2)
      latest.current(ctx)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    return () => observer.disconnect()
  }, [span, version])
  return <canvas ref={ref} className={`picture ${className}`} aria-hidden />
}
