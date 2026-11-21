import { useEffect, useRef } from 'react'

import { drawFood, drawPile, pileHeight } from './draw/foods'
import { pen, star } from './draw/look'
import { drawMonster, type MonsterPose } from './draw/monster'
import type { Food, MonsterId } from './game/model'

/** What a portrait shows: one food, a dish on its plate, a monster in a mood, or a star. */
export type Picture =
  | { kind: 'food'; food: Food }
  | { kind: 'pile'; pile: readonly Food[] }
  | { kind: 'monster'; id: MonsterId; mood: MonsterPose['mood'] }
  | { kind: 'star' }

/** The box (tiles, round the drawing's origin) a picture is fitted into. */
function boxOf(p: Picture): { x: number; y: number; w: number; h: number } {
  switch (p.kind) {
    case 'food':
      return { x: -0.7, y: -0.62, w: 1.4, h: 0.86 }
    case 'pile': {
      const h = pileHeight(p.pile)
      return { x: -0.85, y: -h - 0.3, w: 1.7, h: h + 0.45 }
    }
    case 'monster':
      return { x: -1.5, y: -3, w: 3, h: 3.1 }
    case 'star':
      return { x: -1.1, y: -1.1, w: 2.2, h: 2.2 }
  }
}

/**
 * A small canvas in the HUD that shows a real draw function, fitted into its CSS box at the
 * screen's pixel ratio. Monsters and dishes move (a monster breathes and blinks, a dish
 * wobbles a little); foods and stars are drawn once.
 */
export function Portrait({ picture, className }: { picture: Picture; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(picture)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const p = JSON.parse(key) as Picture
    const box = boxOf(p)
    const animated = p.kind === 'monster' || p.kind === 'pile'
    let raf = 0
    let born = -1
    const paint = (now: number) => {
      if (born < 0) born = now
      const t = (now - born) / 1000
      const dpr = Math.min(window.devicePixelRatio, 2)
      const w = Math.max(1, Math.round(el.clientWidth * dpr))
      const h = Math.max(1, Math.round(el.clientHeight * dpr))
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const k = Math.min(w / box.w, h / box.h)
      pen.px = k
      ctx.setTransform(k, 0, 0, k, w / 2 - (box.x + box.w / 2) * k, h / 2 - (box.y + box.h / 2) * k)
      if (p.kind === 'food') drawFood(ctx, p.food, t)
      else if (p.kind === 'pile') drawPile(ctx, p.pile, Math.sin(t * 2.2) * 0.04, t)
      else if (p.kind === 'monster') drawMonster(ctx, p.id, { mouth: p.mood === 'hungry' ? 0.35 : 0, belly: p.mood === 'happy' ? 0.7 : 0.1, mood: p.mood, since: t, lean: 0, look: 0, t })
      else star(ctx, 1)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (animated) raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    const observer = new ResizeObserver(() => {
      if (!animated) {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(paint)
      }
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [key])
  return <canvas ref={ref} className={className} />
}
