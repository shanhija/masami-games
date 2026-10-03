import { useEffect, useRef } from 'react'

import { ROOMS } from '../game/levels'
import { parseRoom } from '../game/room'
import { pen } from './look'
import type { SheetCell } from './sheet'
import { HERO_SHEET } from './sheetHero'
import { WORLD_SHEET } from './sheetWorld'
import { ROOM_LOOK } from './world'

const SHEETS: Record<string, readonly SheetCell[]> = { hero: HERO_SHEET, world: WORLD_SHEET }
const LABEL = 22

/**
 * Every sprite in one labelled grid, for the agent's screenshots and the parent's eyes:
 * ?sheet=hero or ?sheet=world, &room=<id> for the room's colours (default garden),
 * &t=<seconds> to freeze time (otherwise it animates), &px=<css px per tile> (default 80).
 * A dashed line marks each cell's feet line, where a standing thing's feet belong.
 */
export function Sheet() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const cells = SHEETS[params.get('sheet')!]
    if (!cells) throw new Error(`?sheet= must be one of ${Object.keys(SHEETS).join(', ')}`)
    const def = ROOMS.find((r) => r.id === (params.get('room') ?? 'garden'))
    if (!def) throw new Error(`?room= must be one of ${ROOMS.map((r) => r.id).join(', ')}`)
    const room = parseRoom(def)
    const frozen = params.has('t') ? Number(params.get('t')) : null
    const dpr = Math.min(window.devicePixelRatio, 2)
    const px = Number(params.get('px') ?? 80) * dpr
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    // Lay the cells out in rows across the window.
    const width = Math.round(el.clientWidth * dpr)
    const gap = 12 * dpr
    const places: { x: number; y: number }[] = []
    let x = gap
    let y = gap
    let rowH = 0
    for (const c of cells) {
      const w = c.w * px
      if (x + w > width - gap && x > gap) {
        x = gap
        y += rowH + gap
        rowH = 0
      }
      places.push({ x, y })
      x += w + gap
      rowH = Math.max(rowH, c.h * px + LABEL * dpr)
    }
    el.width = width
    el.height = y + rowH + gap
    el.style.height = `${el.height / dpr}px`
    const look = ROOM_LOOK[room.id]
    let raf = 0
    const frame = (now: number) => {
      const t = frozen ?? now / 1000
      pen.px = px
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = look.night ? '#1C1F4A' : '#FFFFFF'
      ctx.fillRect(0, 0, el.width, el.height)
      cells.forEach((c, i) => {
        const p = places[i]!
        const w = c.w * px
        const h = c.h * px
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = look.sky[0]
        ctx.fillRect(p.x, p.y, w, h)
        ctx.setLineDash([6 * dpr, 6 * dpr])
        ctx.strokeStyle = 'rgba(59, 34, 69, 0.35)'
        ctx.lineWidth = dpr
        ctx.beginPath()
        ctx.moveTo(p.x, p.y + h - px * 0.5)
        ctx.lineTo(p.x + w, p.y + h - px * 0.5)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = look.night ? '#FFFFFF' : '#3B2245'
        ctx.font = `600 ${14 * dpr}px 'Fredoka Variable', sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(c.label, p.x, p.y + h + 4 * dpr)
        ctx.save()
        ctx.beginPath()
        ctx.rect(p.x, p.y, w, h)
        ctx.clip()
        ctx.setTransform(px, 0, 0, px, p.x + w / 2, p.y + h - px * 0.5)
        c.draw(ctx, room, t)
        ctx.restore()
      })
      if (frozen === null) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  // The game's page never scrolls (styles.css), so the sheet scrolls in a box of its own.
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto' }}>
      <canvas ref={canvas} style={{ display: 'block', width: '100%' }} />
    </div>
  )
}
