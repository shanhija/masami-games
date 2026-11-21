import { useEffect, useRef } from 'react'

import { pen, type SheetEntry } from './look'

/**
 * Every draw file exports its drawings as `SHEET` (a list of entries, or a function making
 * one); ?sheet=<file> shows that file's, ?sheet alone lists the files. Vite collects them at
 * build time, so a new draw file needs no registry; the tests stay out of the page.
 */
const MODULES = import.meta.glob<{ SHEET?: SheetEntry[] | (() => SheetEntry[]) }>(['./*.ts', '!./*.test.ts'], { eager: true })
const SHEETS: Record<string, () => SheetEntry[]> = Object.fromEntries(
  Object.entries(MODULES)
    .filter(([, m]) => m.SHEET !== undefined)
    .map(([path, m]) => {
      const sheet = m.SHEET!
      return [path.slice(2, -3), typeof sheet === 'function' ? sheet : () => sheet]
    }),
)

/** Each cell's canvas reaches this many tiles past its entry's box on every side. */
const PAD = 0.15

/**
 * A sprite sheet: each entry in its own canvas, its box at `&px=` CSS pixels a tile
 * (default 100), animated unless `&t=<seconds>` freezes time, labelled under it.
 * `&only=<text>` keeps the entries whose label holds that text; `&bg=<css colour>` paints
 * the cells (default grass green, the course's ground).
 */
export function Sheet() {
  const p = new URLSearchParams(location.search)
  const group = p.get('sheet')!
  if (group === '') {
    return (
      <div className="sheet">
        {Object.keys(SHEETS).map((g) => (
          <a key={g} className="sheet-link" href={`?sheet=${g}`}>
            {g}
          </a>
        ))}
      </div>
    )
  }
  const make = SHEETS[group]
  if (!make) throw new Error(`?sheet=${group}: use one of ${Object.keys(SHEETS).join(', ')}`)
  const only = p.get('only')
  const entries = make().filter((e) => only === null || e.label.includes(only))
  const px = Number(p.get('px') ?? 100)
  const frozen = p.get('t')
  const bg = p.get('bg') ?? '#9BDB78'
  return (
    <div className="sheet">
      {entries.map((e) => (
        <Cell key={e.label} entry={e} px={px} t={frozen === null ? null : Number(frozen)} bg={bg} />
      ))}
    </div>
  )
}

function Cell({ entry, px, t, bg }: { entry: SheetEntry; px: number; t: number | null; bg: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio, 2)
    const w = (entry.box.w + 2 * PAD) * px
    const h = (entry.box.h + 2 * PAD) * px
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    const paint = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, el.width, el.height)
      const k = px * dpr
      pen.px = k
      ctx.setTransform(k, 0, 0, k, (PAD - entry.box.x) * k, (PAD - entry.box.y) * k)
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
  }, [entry, px, t, bg])
  return (
    <figure className="sheet-cell">
      <canvas ref={ref} />
      <figcaption>{entry.label}</figcaption>
    </figure>
  )
}
