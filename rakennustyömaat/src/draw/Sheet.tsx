import { useEffect, useRef } from 'react'

import { themeItems, ITEMS, ITEM_IDS, type Idle, type ItemId, type TapMotion } from '../game/items'
import { SLOT_BOX, interiorRect, rect } from '../game/layout'
import { THEMES } from '../game/model'
import { ANIMAL_SHEET } from './animals'
import { BUILDER_SHEET } from './builder'
import { GOODS_SHEET } from './goods'
import { HOUSE_SHEET } from './house'
import { KEYS_SHEET } from './keys'
import { LAND_SHEET } from './land'
import { pen, type SheetEntry } from './look'
import { MACHINE_SHEET } from './machines'
import { LAUNCH, applyIdle, applyTap } from './motion'
import { drawInside, itemArt } from './rooms/art'
import { STREET_SHEET } from './street'
import { TRUCK_SHEET } from './truck'

/** The room tests let an item reach SPARE of its slot box's width and height past it. */
const SPARE = 0.1
/** Every theme's wallpaper and floor in a small room's inside, then each of its items in its slot box with SPARE round it. */
function roomsSheet(): SheetEntry[] {
  const out: SheetEntry[] = []
  const inner = interiorRect(0, { shape: 'small', col: 0, row: 0 })
  for (const theme of THEMES) {
    for (const v of [0, 1, 2, 3] as const) {
      out.push({ label: `${theme} wall ${v}`, box: rect(0, 0, inner.w, inner.h), draw: (ctx, t) => drawInside(ctx, theme, inner.w, inner.h, t, v, v) })
    }
    for (const id of themeItems(theme)) {
      const b = SLOT_BOX[ITEMS[id].slot]
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      const box = rect(b.x0 - SPARE * w, b.y0 - SPARE * h, (1 + 2 * SPARE) * w, (1 + 2 * SPARE) * h)
      const draw = itemArt(id)
      out.push({ label: id, box, draw: (ctx, t) => draw(ctx, t, -1) })
      out.push({ label: `${id} tapped`, box, draw: (ctx, t) => draw(ctx, t, (t % 2) * 0.75) })
    }
  }
  return out
}

/** The motion vocabulary (motion.ts) on the first item that uses each idle loop and each tap reaction, tapped again every TAP_AGAIN seconds, as the renderer applies it round the item's anchor, with a launch's height over the slot box; a motion no item uses has nothing to show it on and is left out. */
const TAP_AGAIN = 1.6
function motionSheet(): SheetEntry[] {
  const motions = [
    ...(['bob', 'sway', 'pulse', 'swing'] as const satisfies readonly Idle[]).map((idle) => ({
      label: `idle ${idle}`,
      uses: (id: ItemId) => ITEMS[id].idle === idle,
      play: () => -1,
      apply: (ctx: CanvasRenderingContext2D, t: number) => applyIdle(ctx, idle, t, 0),
    })),
    ...(['hop', 'spin', 'shake', 'grow', 'launch', 'own'] as const satisfies readonly TapMotion[]).map((tap) => ({
      label: `tap ${tap}`,
      uses: (id: ItemId) => ITEMS[id].tap === tap,
      play: (t: number) => t % TAP_AGAIN,
      apply: (ctx: CanvasRenderingContext2D, t: number) => applyTap(ctx, tap, t % TAP_AGAIN),
    })),
  ]
  const out: SheetEntry[] = []
  for (const m of motions) {
    const id = ITEM_IDS.find(m.uses)
    if (id === undefined) continue
    const b = SLOT_BOX[ITEMS[id].slot]
    out.push({
      label: `${m.label}: ${id}`,
      box: rect(b.x0 - 0.1, b.y0 - LAUNCH, b.x1 - b.x0 + 0.2, b.y1 - b.y0 + LAUNCH + 0.1),
      draw: (ctx, t) => {
        ctx.save()
        m.apply(ctx, t)
        itemArt(id)(ctx, t, m.play(t))
        ctx.restore()
      },
    })
  }
  return out
}

/** ?sheet=<group>: the sprite sheets, every drawing of a group in a labelled grid. */
export const SHEETS: Record<string, () => SheetEntry[]> = {
  keys: () => KEYS_SHEET,
  builder: () => BUILDER_SHEET,
  goods: () => GOODS_SHEET,
  truck: () => TRUCK_SHEET,
  land: () => LAND_SHEET,
  street: () => STREET_SHEET,
  machines: () => MACHINE_SHEET,
  house: () => HOUSE_SHEET,
  animals: () => ANIMAL_SHEET,
  rooms: roomsSheet,
  motion: motionSheet,
}

/** Each cell's canvas reaches SHEET_PAD metres past its entry's box on every side. */
export const SHEET_PAD = 0.1

/**
 * A sprite sheet: each entry in its own canvas, its box fitted at `&px=` CSS pixels per
 * metre (default 120), animated unless `&t=<seconds>` freezes time, with a label under it.
 * `&only=<text>` keeps the entries whose label holds that text.
 */
export function Sheet() {
  const p = new URLSearchParams(location.search)
  const group = p.get('sheet')!
  const make = SHEETS[group]
  if (!make) throw new Error(`?sheet=${group}: use one of ${Object.keys(SHEETS).join(', ')}`)
  const only = p.get('only')
  const entries = make().filter((e) => only === null || e.label.includes(only))
  const px = Number(p.get('px') ?? 120)
  const frozen = p.get('t')
  return (
    <div className="sheet">
      {entries.map((e) => (
        <SheetCell key={e.label} entry={e} px={px} t={frozen === null ? null : Number(frozen)} />
      ))}
    </div>
  )
}

function SheetCell({ entry, px, t }: { entry: SheetEntry; px: number; t: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio, 2)
    const w = (entry.box.w + 2 * SHEET_PAD) * px
    const h = (entry.box.h + 2 * SHEET_PAD) * px
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    const paint = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, el.width, el.height)
      pen.ppm = px
      pen.dpr = dpr
      const k = px * dpr
      ctx.setTransform(k, 0, 0, k, (SHEET_PAD - entry.box.x) * k, (SHEET_PAD - entry.box.y) * k)
      entry.draw(ctx, time)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    if (t !== null) {
      paint(t)
      return
    }
    let raf = 0
    const frame = (now: number) => {
      paint(now / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [entry, px, t])
  return (
    <figure className="sheet-cell">
      <canvas ref={ref} />
      <figcaption>{entry.label}</figcaption>
    </figure>
  )
}
