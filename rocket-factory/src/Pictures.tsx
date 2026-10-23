import { useEffect, useRef } from 'react'

import { drawBeep, BEEP_BOX } from './draw/beep'
import { drawBeltMarks, drawBelts, type BeltPic } from './draw/beltart'
import { STICKER_BOX, drawHole, drawSticker } from './draw/buildings'
import { MUNCHER_BOX, drawMuncher, type MuncherPicture } from './draw/critters'
import { Renderer } from './draw/frame'
import { drawBurrow } from './draw/land'
import { ROCKET_BOX, drawLittleRocket, drawRocket } from './draw/rocket'
import { C, roundStroke } from './draw/look'
import { drawThing } from './draw/things'
import type { PartView } from './game/hud'
import { landBox, type View } from './game/layout'
import { STEP, type BeepPic, type CardId, type MunchersMode, type ScienceMode, type State, type Sticker, type Thing } from './game/model'
import type { Box } from './game/where'
import { Portrait } from './Portrait'

/**
 * The HUD's pictures, each drawn by the game's own draw functions in a Portrait, so a button
 * shows the very thing it is: a sticker as the tray holds it (or the hole it leaves), a thing,
 * the rocket so far, Beep, a card's picture, the munchers, a belt's pattern, and the factory
 * itself drawn by the renderer. Each is still unless it says so; its id names it, so the
 * same picture never redraws.
 */

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h })
/** A thing's picture is this much of its box. */
const THING_SIZE = 0.92

export function StickerPic({ sticker, className }: { sticker: Sticker; className: string }) {
  return <Portrait id={`sticker:${sticker}`} box={STICKER_BOX} animate={false} className={className} draw={(ctx, t) => drawSticker(ctx, sticker, t)} />
}

/** The die-cut hole a used sticker leaves on the tray's backing paper. */
export function HolePic({ sticker, className }: { sticker: Sticker; className: string }) {
  return <Portrait id={`hole:${sticker}`} box={STICKER_BOX} animate={false} className={className} draw={(ctx) => drawHole(ctx, sticker)} />
}

export function ThingPic({ thing, className }: { thing: Thing; className: string }) {
  return <Portrait id={`thing:${thing}`} box={box(-0.5, -0.5, 1, 1)} animate={false} className={className} draw={(ctx, t) => drawThing(ctx, thing, THING_SIZE, t, 1)} />
}

/** The rocket so far, lying on its pad as the board shows it: each part dotted, filling from the bottom, or built. */
export function RocketPic({ parts, className }: { parts: readonly PartView[]; className: string }) {
  const pic = { parts: parts.map((p) => ({ open: p.open, fill: p.got / p.n, fullAge: Infinity })), ready: false }
  return <Portrait id={`rocket:${parts.map((p) => `${p.open}${p.got}`).join(',')}`} box={ROCKET_BOX} animate={false} className={className} draw={(ctx, t) => drawRocket(ctx, pic, t)} />
}

/** Beep in `pose`, moving when `animate`. */
export function BeepPicture({ pose, animate, className }: { pose: BeepPic['pose']; animate: boolean; className: string }) {
  return <Portrait id={`beep:${pose}`} box={BEEP_BOX} animate={animate} className={className} draw={(ctx, t) => drawBeep(ctx, { pose, age: animate ? t : 0.6, flight: 1, carrying: null, facing: 1 }, t)} />
}

/** A muncher of burrow `burrow` in a mode a menu picture needs. */
function muncher(burrow: number, mode: MuncherPicture['mode'], t: number, wave: number): MuncherPicture {
  return { burrow, mode, why: null, age: t, cheeks: [], nom: Infinity, shrug: Infinity, wave, rise: 1, lift: 0, step: 0, facing: 1, phase: 0.3 * burrow, scout: false }
}

/** Things side by side round the origin, each `size` across, `gap` apart. */
function row(ctx: CanvasRenderingContext2D, things: readonly Thing[], size: number, gap: number, t: number) {
  things.forEach((thing, i) => {
    ctx.save()
    ctx.translate((i - (things.length - 1) / 2) * gap, 0)
    drawThing(ctx, thing, size, t, i + 1)
    ctx.restore()
  })
}

/**
 * Each card's one picture: what it brings, as the board shows it. A sticker card shows its
 * sticker, a thing's card the thing, Land! a new burrow waving hello, the rocket's cards the
 * rocket (Fuel! with its orange fire beside it).
 */
const CARD_PICTURES: Record<CardId, { box: Box; draw: (ctx: CanvasRenderingContext2D, t: number) => void }> = {
  digger: { box: STICKER_BOX, draw: (ctx, t) => drawSticker(ctx, 'digger', t) },
  gold: { box: box(-0.7, -0.62, 1.4, 1.1), draw: (ctx, t) => row(ctx, ['goldRock', 'goldBar'], 0.62, 0.62, t) },
  science: { box: box(-0.5, -0.5, 1, 1), draw: (ctx, t) => drawThing(ctx, 'greenBottle', THING_SIZE, t, 1) },
  gears: { box: box(-0.5, -0.5, 1, 1), draw: (ctx, t) => drawThing(ctx, 'gear', THING_SIZE, t, 1) },
  bubbles: { box: box(-0.75, -0.6, 1.5, 1.1), draw: (ctx, t) => row(ctx, ['bubble', 'bubble', 'bubble'], 0.5, 0.48, t) },
  hedges: { box: STICKER_BOX, draw: (ctx, t) => drawSticker(ctx, 'hedge', t) },
  land2: { box: box(0, 0.35, 2, 1.7), draw: (ctx, t) => drawBurrow(ctx, { burrow: 1, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: t % 4 }, t) },
  stars: { box: box(-0.5, -0.5, 1, 1), draw: (ctx, t) => drawThing(ctx, 'orangeBottle', THING_SIZE, t, 1) },
  snacks: { box: STICKER_BOX, draw: (ctx, t) => drawSticker(ctx, 'bowl', t) },
  land3: { box: box(0, 0.35, 2, 1.7), draw: (ctx, t) => drawBurrow(ctx, { burrow: 2, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: t % 4 }, t) },
  rocket: { box: box(-0.5, -0.55, 1, 1.1), draw: (ctx) => drawLittleRocket(ctx, 1) },
  fuel: {
    box: box(-0.62, -0.55, 1.24, 1.1),
    draw: (ctx, t) => {
      ctx.save()
      ctx.translate(-0.2, 0)
      drawLittleRocket(ctx, 1)
      ctx.restore()
      ctx.save()
      ctx.translate(0.32, 0.2)
      drawThing(ctx, 'orangeBottle', 0.5, t, 1)
      ctx.restore()
    },
  },
}

/** A card's one picture (CARD_PICTURES), moving when `animate` (a burrow waves). */
export function CardPic({ id, animate, className }: { id: CardId; animate: boolean; className: string }) {
  const p = CARD_PICTURES[id]
  return <Portrait id={`card:${id}`} box={p.box} animate={animate} className={className} draw={p.draw} />
}

/** The pause menu's Munchers switch as pictures: many munchers, one, one waving politely, and a burrow asleep for none. */
export function MunchersPic({ mode, className }: { mode: MunchersMode; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    switch (mode) {
      case 'many':
        for (const [x, b] of [
          [-0.62, 1],
          [0.62, 2],
          [0, 0],
        ] as const) {
          ctx.save()
          ctx.translate(x, x === 0 ? 0.1 : -0.05)
          drawMuncher(ctx, muncher(b, 'walk', 3, Infinity), t)
          ctx.restore()
        }
        return
      case 'few':
        drawMuncher(ctx, muncher(0, 'walk', 3, Infinity), t)
        return
      case 'polite':
        drawMuncher(ctx, muncher(0, 'polite', 3, 0.5), t)
        return
      case 'none':
        ctx.save()
        ctx.translate(-1, -1.7)
        drawBurrow(ctx, { burrow: 0, hunger: 0, warnAge: Infinity, out: false, friend: false, pokeAge: Infinity, helloAge: Infinity }, t)
        ctx.restore()
        return
    }
  }
  const b = mode === 'many' ? box(-1.32, -1.1, 2.64, 1.24) : mode === 'none' ? box(-1.05, -1.3, 2.1, 1.5) : MUNCHER_BOX
  return <Portrait id={`munchers:${mode}`} box={b} animate={false} className={className} draw={draw} />
}

/** The pause menu's Science switch as pictures: a green bottle, and for quicker the same bottle rushing along with speed lines behind it (two bottles would read as more to make). */
export function SciencePic({ mode, className }: { mode: ScienceMode; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    if (mode === 'normal') return row(ctx, ['greenBottle'], 0.78, 0, t)
    ctx.save()
    ctx.translate(0.2, 0)
    row(ctx, ['greenBottle'], 0.78, 0, t)
    ctx.restore()
    for (const [y, x0] of [
      [-0.2, -0.62],
      [0.02, -0.7],
      [0.24, -0.62],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(-0.28, y)
      roundStroke(ctx, 0.07, C.ghostLine)
    }
  }
  return <Portrait id={`science:${mode}`} box={box(-0.75, -0.55, 1.5, 1.1)} animate={false} className={className} draw={draw} />
}

/** A short straight belt in `pattern`, as the pencil lays it now. */
export function PatternPic({ pattern, className }: { pattern: number; className: string }) {
  const pics: BeltPic[] = [0, 1, 2].map((c) => ({ cell: c, in: 2, out: 0, fork: -1, over: -1, joins: [], pattern, start: c === 0, end: c === 2 }))
  const draw = (ctx: CanvasRenderingContext2D) => {
    drawBelts(ctx, pics)
    drawBeltMarks(
      ctx,
      pics.map((pic) => ({ pic, hops: 0 })),
    )
  }
  return <Portrait id={`pattern:${pattern}`} box={box(0, 0.12, 3, 0.8)} animate={false} className={className} draw={draw} />
}

/**
 * The factory itself, drawn once by the renderer (draw/frame.ts) into a small canvas, the
 * land fitted to it: the Good night card's factory asleep, and the old factory Bring back
 * would fetch. A new state draws it again.
 */
export function FactoryPic({ state, className }: { state: State; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current!
    const renderer = new Renderer(el.getContext('2d')!, () => document.createElement('canvas'), false)
    const paint = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return
      const dpr = Math.min(window.devicePixelRatio, 2)
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      renderer.resize(el.width, el.height, dpr)
      const land = landBox(state.land)
      const cell = Math.min(w / land.w, h / land.h)
      const view: View = {
        w,
        h,
        dpr,
        cell,
        upright: false,
        turn: 0,
        ox: (w - land.w * cell) / 2 - land.x * cell,
        oy: (h - land.h * cell) / 2 - land.y * cell,
        hud: { held: 'sideways', free: { x: 0, y: 0, w, h }, strip: null, column: null, tray: null, button: 0, gap: 0 },
      }
      renderer.draw(state, state.tick * STEP, view, [], 0, null, null)
    }
    paint()
    const watch = new ResizeObserver(paint)
    watch.observe(el)
    return () => {
      watch.disconnect()
      renderer.dispose()
    }
  }, [state])
  return (
    <span className={`portrait ${className}`} aria-hidden>
      <canvas ref={ref} />
    </span>
  )
}
