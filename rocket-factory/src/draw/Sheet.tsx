import { useEffect, useRef } from 'react'

import { pen, type SheetEntry } from './look'

/**
 * Every draw file exports its sheet as `SHEET` (a list of entries, or a function making one):
 * its group is the file's name, so ?sheet=things shows things.ts's drawings. Collected here
 * by Vite at build time, so a new draw file needs no registry. The tests and their checking
 * context (which imports vitest) stay out of the page.
 */
const MODULES = import.meta.glob<{ SHEET?: SheetEntry[] | (() => SheetEntry[]) }>(['./*.ts', '!./*.test.ts', '!./fakeContext.ts'], { eager: true })
export const SHEETS: Record<string, () => SheetEntry[]> = Object.fromEntries(
  Object.entries(MODULES)
    .filter(([, m]) => m.SHEET !== undefined)
    .map(([path, m]) => {
      const sheet = m.SHEET!
      return [path.slice(2, -3), typeof sheet === 'function' ? sheet : () => sheet]
    }),
)

/** Each cell's canvas reaches SHEET_PAD cells past its entry's box on every side. */
export const SHEET_PAD = 0.1

/**
 * A sprite sheet: each entry in its own canvas, its box fitted at `&px=` CSS pixels per cell
 * (default 120), animated unless `&t=<seconds>` freezes time, with a label under it.
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
