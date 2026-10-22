/**
 * Runs the play rooms' art (Play, Ball pit, Slide, Gym) on the fake context: every wallpaper
 * and floor colouring at a small, a wide and a tall room's size, and every item through its
 * idle loop and its tap reaction (never tapped, all through it, long after, and ages that are
 * huge or not finite) at street, plot, room and mirror sizes. So art written without looking
 * cannot crash, draw NaN, leave the context changed or reach for an API that does not work
 * everywhere; each item stays inside its slot box with 10% to spare, and a reaction is over
 * by 1.5 s. Looks are judged on ?sheet=rooms and in the game.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ITEMS, themeItems, type ItemId } from '../../game/items'
import { SLOT_BOX } from '../../game/layout'
import { fakeContext } from '../fakeContext'
import { pen } from '../look'
import { itemArt } from './art'
import { PLAY_ART } from './play'

/** CSS px per metre: the street, the plot, the room, the mirror. */
const SCALES = [40, 80, 160, 400] as const
const THEMES = ['play', 'ballpit', 'slide', 'gym'] as const
/** Sim times through the idle loops, one far along. */
const TIMES = [0, 0.37, 1.1, 2.9, 4.4, 1234.56]
/** Seconds since a tap: never, all through a reaction, past it, long after, and ages a stamp should never give but might. */
const PLAYS = [-1, ...Array.from({ length: 36 }, (_, i) => i * 0.05), 1.8, 2.5, 7, 1e6, Infinity, NaN]
/** The items whose tap carries their loop on from the tap (the slide's rider goes round again from the top, the trampoline's friend bounces on from the landing): they settle into the loop, not back to where it was. */
const CARRY_ON: readonly ItemId[] = ['bigSlide', 'trampoline']
/** Seconds a tap's reaction takes at most: 1.5, but the block tower takes until 1.6 to build itself again. */
const settled = (id: ItemId) => (id === 'blockTower' ? 1.6 : 1.5)

/** Every call a drawing makes with its arguments (numbers to six places): two drawings are the same picture when their traces match. */
function trace(draw: (ctx: CanvasRenderingContext2D) => void): string {
  const { ctx } = fakeContext()
  const calls: string[] = []
  const spy = new Proxy(ctx, {
    get(target, key) {
      const v = Reflect.get(target, key) as unknown
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        calls.push(`${String(key)}(${args.map((a) => (typeof a === 'number' ? a.toFixed(6) : String(a))).join(',')})`)
        return (v as (...a: unknown[]) => unknown)(...args)
      }
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
  draw(spy)
  return calls.join(';')
}

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

describe.each(THEMES)('the %s theme', (theme) => {
  const art = PLAY_ART[theme]

  it('draws its four walls and floors in a small, a wide and a tall room', () => {
    const { ctx, check } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const v of [0, 1, 2, 3] as const)
        for (const [w, h] of [
          [2.16, 2.1],
          [4.56, 2.1],
          [2.16, 4.5],
        ] as const) {
          check(`wall ${v} ${w}x${h}`, () => art.wall(ctx, w, h, 0.7, v), 'none')
          check(`floor ${v} ${w}`, () => art.floor(ctx, w, 0.7, v), 'none')
        }
    }
  })

  it('offers four different paint pot colours', () => {
    expect(new Set(art.swatches).size).toBe(4)
  })

  it.each(themeItems(theme))('keeps %s inside its slot box with a tenth to spare, idle and tapped, at every size', (id) => {
    const { ctx, check, measure } = fakeContext()
    const draw = itemArt(id)
    const b = SLOT_BOX[ITEMS[id].slot]
    const mx = (b.x1 - b.x0) * 0.1
    const my = (b.y1 - b.y0) * 0.1
    // Every tap age at every size, the time turning from one age to the next: each age meets four of the times, each size all of them. One check holds the ages at a size together: an age that leaves the context changed leaves it changed at the end of them too.
    const out: string[] = []
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      check(
        `${id} through its tap at ${ppm} px/m`,
        () =>
          PLAYS.forEach((play, i) => {
            const t = TIMES[(i + s) % TIMES.length]!
            const m = measure(() => draw(ctx, t, play))
            if (m.x0 < b.x0 - mx || m.x1 > b.x1 + mx || m.y0 < b.y0 - my || m.y1 > b.y1 + my) out.push(`${id} at t ${t}, play ${play}, ${ppm} px/m: x ${m.x0.toFixed(3)} to ${m.x1.toFixed(3)}, y ${m.y0.toFixed(3)} to ${m.y1.toFixed(3)}`)
          }),
        'none',
      )
    })
    expect(out).toEqual([])
  })

  it.each(themeItems(theme).filter((id) => !CARRY_ON.includes(id)))('settles %s back into its idle loop once its reaction is over', (id) => {
    const draw = itemArt(id)
    pen.ppm = 160
    for (const t of TIMES) {
      const idle = trace((ctx) => draw(ctx, t, -1))
      for (const play of [settled(id), 1.9, 40]) expect(trace((ctx) => draw(ctx, t, play)), `${id} at t ${t}, play ${play}`).toBe(idle)
    }
  })

  it.each(themeItems(theme).filter((id) => ITEMS[id].tap === 'own'))('plays %s at once on a tap (it draws its own reaction)', (id) => {
    const draw = itemArt(id)
    pen.ppm = 160
    for (const t of TIMES) {
      const idle = trace((ctx) => draw(ctx, t, -1))
      expect(trace((ctx) => draw(ctx, t, 0.1)), `${id} at t ${t}`).not.toBe(idle)
    }
  })
})
