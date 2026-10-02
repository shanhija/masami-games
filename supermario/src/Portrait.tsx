import { useEffect, useRef } from 'react'

import { drawKitten, type KittenPose } from './draw/critters'
import { drawHero } from './draw/hero'
import { pen } from './draw/look'
import { drawBed, drawStar } from './draw/things'
import { roomAt } from './game/game'
import type { KittenName, Sim } from './game/model'
import { createSim } from './game/sim'

/** What a portrait shows: the collectible star, a kitten in a pose, room `index`'s bed with its kitten's eyes in the doorway, or Pia's head. */
export type Picture = { kind: 'star' } | { kind: 'kitten'; name: KittenName; pose: KittenPose } | { kind: 'bed'; index: number } | { kind: 'head' }

/** The world box each picture is fitted into, centred: [centre x, centre y, width, height] in tiles, origin at the thing's feet. */
const BOX: Record<Picture['kind'], readonly [number, number, number, number]> = {
  star: [0, 0, 0.8, 0.8],
  kitten: [0, -0.5, 1.15, 1.15],
  bed: [0, -1.22, 2.95, 2.65],
  head: [0.03, -0.8, 0.82, 0.82],
}

/** How far a picture's canvas reaches past its box on each side, as a share of the box: a night bed's glow is wider than any frame that keeps the bed big, so its canvas spills over and whatever holds it clips it. */
const BLEED: Record<Picture['kind'], number> = { star: 0, kitten: 0, bed: 0.5, head: 0 }

/** Pia's head is drawn from a fresh sim: her idle pose. */
let headSim: Sim | null = null

/** A still portrait is drawn at this sim time: eyes open, nothing mid-blink. */
const STILL_T = 0.6

function drawPicture(ctx: CanvasRenderingContext2D, p: Picture, t: number) {
  switch (p.kind) {
    case 'star':
      drawStar(ctx, t, 0)
      return
    case 'kitten':
      drawKitten(ctx, p.name, p.pose, t, null)
      return
    case 'bed': {
      const room = roomAt(p.index)
      drawBed(ctx, room, 0, t)
      drawKitten(ctx, room.kitten, 'hidden', t, null)
      return
    }
    case 'head':
      headSim ??= createSim(roomAt(0))
      // Only the head and its ears: the body ends at the chin.
      ctx.save()
      ctx.beginPath()
      ctx.rect(-1, -2, 2, 1.58)
      ctx.clip()
      drawHero(ctx, headSim, t, null)
      ctx.restore()
      return
  }
}

/**
 * One of the game's own drawings in a small canvas, for the HUD: the star icon, kittens,
 * beds, Pia's head. The canvas takes its size from CSS and draws at the screen's pixel
 * ratio, the picture centred and fitted to it. It draws once (and again on a resize), or
 * every frame when `animate` is on, where the movement helps.
 */
export function Portrait({ picture, animate, className }: { picture: Picture; animate: boolean; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(picture)
  const bleed = BLEED[picture.kind]
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const [cx, cy, w0, h0] = BOX[picture.kind]
    const bw = w0 * (1 + 2 * bleed)
    const bh = h0 * (1 + 2 * bleed)
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
      const k = Math.min(w / bw, h / bh)
      pen.px = k
      ctx.setTransform(k, 0, 0, k, w / 2 - cx * k, h / 2 - cy * k)
      drawPicture(ctx, picture, t)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    if (!animate) {
      paint(STILL_T)
      const watch = new ResizeObserver(() => paint(STILL_T))
      watch.observe(el)
      return () => watch.disconnect()
    }
    let raf = 0
    const frame = (now: number) => {
      paint(now / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // The picture is compared by its key, so a new object with the same contents draws nothing new.
  }, [key, animate, bleed])
  const spill = `${-bleed * 100}%`
  const size = `${(1 + 2 * bleed) * 100}%`
  return (
    <span className={`portrait ${className}`} aria-hidden>
      <canvas ref={ref} style={{ left: spill, top: spill, width: size, height: size }} />
    </span>
  )
}
