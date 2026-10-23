/**
 * Runs the rocket's draw functions (the rocket on its pad with every part closed, open and
 * filling, popping on and built, the launch button; the little rocket; the launch scene from
 * the tap to the flight home, in a landscape and an upright view; the sheet) on the fake
 * context at the game's sizes, so art written without looking cannot crash, draw NaN, leave
 * the context changed, draw text or make a gradient per call; holds the rocket to its pad and
 * the HUD card's box and the launch to the screen; checks the board slides down and comes
 * back, and that every colour is a token. Looks are judged on ?sheet=rocket.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COUNT_AT, LAUNCH_FOR } from '../game/catalog'
import { PARTS, STEP } from '../game/model'
import { clipped, colours, edges, fakeContext, poking as pokingOut, resetPen, type Edges } from './fakeContext'
import { ROCKET, mix, pen } from './look'
import { LAUNCH_AT, ROCKET_BOX, SHEET, beepAway, drawLaunch, drawLittleRocket, drawRocket, launchSlide, type LaunchPic, type PartPic, type RocketPic } from './rocket'

/** Where Beep and Moony are drawn out on the moon: each call's pose (Moony's: none), facing, and its transform's scale and point. */
const seen = vi.hoisted(() => ({ beep: [] as { pose: string; facing: number; a: number; e: number; f: number }[], moony: [] as { a: number; e: number; f: number }[] }))
vi.mock('./beep', async (original) => {
  const m = await original<typeof import('./beep')>()
  return { ...m, drawBeep: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawBeep>[1], t: number) => (seen.beep.push({ pose: pic.pose, facing: pic.facing, ...ctx.getTransform() }), m.drawBeep(ctx, pic, t)) }
})
vi.mock('./critters', async (original) => {
  const m = await original<typeof import('./critters')>()
  return { ...m, drawMoony: (ctx: CanvasRenderingContext2D, t: number, hop: number) => (seen.moony.push({ ...ctx.getTransform() }), m.drawMoony(ctx, t, hop)) }
})

/** CSS px a cell: a phone on its side, land 3 on an iPad, land 1, the sheet. */
const SCALES = [26, 50, 80, 120] as const
/** Seconds since a part filled: through its pop, past it, long ago, never. */
const AGES = [0, 0.05, 0.15, 0.3, 0.45, 0.6, 3, 1e4, Infinity] as const
/** How full a part is. */
const FILLS = [0, 0.01, 0.2, 0.5, 0.8, 0.99, 1] as const

afterEach(resetPen)

/** Where the box b pokes out of `room` by more than a hair, as sentences: none when it is inside. */
const poking = (what: string, b: Edges, room: Edges) => pokingOut(what, b, room, 1e-6)

/** Every part in one state, the k-th in another: a rocket on its way, or every part alike. */
const rocket = (all: PartPic, k: number, one: PartPic, ready: boolean): RocketPic => ({ parts: PARTS.map((_, i) => (i === k ? one : all)), ready })

describe('the rocket on its pad', () => {
  it('draws every part closed, open at every fill, popping on and built, ready or not, on its pad', { timeout: 60_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const c = clipped(ctx)
    const out: string[] = []
    // One check holds a size's cases together: a case that leaves the context changed leaves it changed at the end of them too.
    for (const ppm of SCALES) {
      pen.ppm = ppm
      check(
        `the rocket at ${ppm} px a cell`,
        () => {
          for (const all of [
            { open: false, fill: 0, fullAge: Infinity },
            { open: true, fill: 0, fullAge: Infinity },
            { open: true, fill: 1, fullAge: Infinity },
          ])
            for (let k = 0; k < PARTS.length; k++)
              for (const fill of FILLS)
                for (const age of AGES)
                  for (const ready of [false, true]) {
                    const one = { open: fill > 0 || age > 1, fill, fullAge: fill >= 1 ? age : Infinity }
                    const t = 0.37 + Math.min(age, 50) * 0.1 + fill
                    // On its pad, the pop's sparkles and the bouncing button a little over its edge.
                    out.push(...poking(`${PARTS[k]} at ${fill} ${age} s ready ${ready}`, measure(() => drawRocket(c, rocket(all, k, one, ready), t)), { x0: -0.05, y0: -0.05, x1: 3.05, y1: 3.05 }))
                  }
        },
        'none',
      )
    }
    expect(out).toEqual([])
  })

  it('keeps the rocket without its button inside the HUD card\'s box', () => {
    const { ctx, measure } = fakeContext()
    const c = clipped(ctx)
    for (const fill of FILLS)
      for (const open of [false, true]) {
        const b = measure(() => drawRocket(c, { parts: PARTS.map(() => ({ open, fill, fullAge: Infinity })), ready: false }, 1.3))
        expect(poking(`all ${open} at ${fill}`, b, edges(ROCKET_BOX, 0))).toEqual([])
      }
  })

  it('refuses a rocket without its four parts', () => {
    const { ctx } = fakeContext()
    expect(() => drawRocket(ctx, { parts: [{ open: true, fill: 0, fullAge: Infinity }], ready: false }, 0)).toThrow()
  })

  it('draws the little rocket in its size', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const size of [0.3, 0.5, 1]) {
        const b = measure(() => check(`little ${size}`, () => drawLittleRocket(ctx, size), 'none'))
        expect(poking(`little ${size}`, b, { x0: -size / 2, y0: -size / 2, x1: size / 2, y1: size / 2 + 0.04 })).toEqual([])
      }
    }
  })
})

describe('the launch', () => {
  /** A landscape view with the pad on the left (the watchers below it, the countdown on its right), an upright one with the pad at the bottom by the tray (the watchers on its right, the countdown on its left), and a small phone view. */
  const VIEWS: readonly LaunchPic[] = [
    { age: 0, view: { x: -0.5, y: -0.4, w: 21, h: 13 }, pad: { x: 1, y: 4 }, side: 1, flags: 0, pop: Infinity },
    { age: 0, view: { x: -0.4, y: -0.5, w: 13, h: 21 }, pad: { x: 4, y: 16 }, side: -1, flags: 3, pop: 0.1 },
    { age: 0, view: { x: 0, y: 0, w: 14, h: 9 }, pad: { x: 1, y: 3 }, side: 1, flags: 9, pop: Infinity },
  ]
  const end = LAUNCH_FOR * STEP

  it('draws every moment from the tap to the flight home on the screen, never far past it', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const c = clipped(ctx)
    const out: string[] = []
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      VIEWS.forEach((v, i) =>
        check(
          `view ${i} at ${ppm} px`,
          () => {
            // Every tenth of a second, the start nudged by the size so the sizes meet different moments.
            for (let age = 0.01 * s; age <= end + 0.5; age += 0.1) {
              const what = `view ${i} at ${age.toFixed(2)} s`
              // What shows is inside the screen; what is cut away stays near it (puffs falling off its foot, the moon coming in over its top, the rocket on the moon going up past it).
              out.push(...poking(what, measure(() => drawLaunch(c, { ...v, age }, 3 + age)), edges(v.view, 0)))
              const raw = measure(() => drawLaunch(ctx, { ...v, age }, 3 + age))
              out.push(...poking(`${what}, cut away`, raw, { x0: v.view.x - 1, y0: v.view.y - Math.max(3, 0.7 * v.view.h), x1: v.view.x + v.view.w + 1, y1: v.view.y + 1.5 * v.view.h }))
            }
          },
          'none',
        ),
      )
    })
    expect(out).toEqual([])
  })

  it('draws a stamp long ago and never as the end of the launch', () => {
    const { ctx, check } = fakeContext()
    for (const age of [Infinity, 1e4, -1]) check(`age ${age}`, () => drawLaunch(ctx, { ...VIEWS[0]!, age }, 2), 'none')
  })

  it('slides the board down after liftoff and brings it back by the end', () => {
    const lift = COUNT_AT * STEP + 5
    for (let age = 0; age < lift; age += 0.1) expect(launchSlide(age), `${age}`).toBe(0)
    let max = 0
    let back = false
    let last = 0
    for (let age = lift; age <= end; age += 0.05) {
      const s = launchSlide(age)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
      // Down, held, then back up: it never goes down again once it has started back.
      if (s < last - 1e-9) back = true
      if (back) expect(s, `${age}`).toBeLessThanOrEqual(last + 1e-9)
      max = Math.max(max, s)
      last = s
    }
    expect(max).toBe(1)
    expect(launchSlide(end)).toBe(0)
  })

  it('puts Beep out on the moon to plant the flag and wave to Moony, then brings Moony into the window with it', () => {
    const { ctx } = fakeContext()
    const v = VIEWS[0]!
    const middle = v.view.x + v.view.w / 2
    const at = (age: number) => {
      seen.beep = []
      seen.moony = []
      drawLaunch(ctx, { ...v, age }, 3 + age)
      return { beep: seen.beep, moony: seen.moony }
    }
    // Flying, Beep is only a face in the window, and no Moony yet.
    expect(at(LAUNCH_AT.settle[0])).toEqual({ beep: [], moony: [] })
    // Out on the moon right of the rocket, patting the flag it planted.
    const plant = at(LAUNCH_AT.flag + 0.3).beep
    expect(plant).toHaveLength(1)
    expect(plant[0]).toMatchObject({ pose: 'pat', facing: 1 })
    expect(plant[0]!.e).toBeGreaterThan(middle + 1)
    // Moony out of its crater on the left, Beep turned to it and waving.
    const wave = at(LAUNCH_AT.moony + 1)
    expect(wave.beep[0]).toMatchObject({ pose: 'wave', facing: -1 })
    expect(wave.moony).toHaveLength(1)
    expect(wave.moony[0]!.e).toBeLessThan(middle - 1)
    // On the way up to the window together, Moony at Beep's side and both shrinking.
    const up = at(mix(LAUNCH_AT.aboard[0], LAUNCH_AT.aboard[1], 0.5))
    expect(up.beep[0]!.pose).toBe('carry')
    expect(up.moony[0]!.a).toBeLessThan(wave.moony[0]!.a)
    expect(Math.abs(up.moony[0]!.e - up.beep[0]!.e)).toBeLessThan(1)
    // In the window by the time the sky slides away home: nobody left out on the moon.
    expect(at(LAUNCH_AT.home[0] - 0.2)).toEqual({ beep: [], moony: [] })
  })

  it('leaves one more little flag on the moon each landing, as many as the moon holds', () => {
    // Each flag's cream moon is one fill in the rocket's body colour.
    const creams = (flags: number) => colours((c) => drawLaunch(c, { ...VIEWS[0]!, age: LAUNCH_AT.flag + 1, flags }, 3)).filter((x) => x === ROCKET.body).length
    expect(creams(1) - creams(0)).toBe(1)
    expect(creams(3) - creams(0)).toBe(3)
    expect(creams(40)).toBeLessThan(creams(0) + 10)
  })
})

describe('the launch\'s moments', () => {
  it('come in order inside the launch, the countdown where the sim counts', () => {
    const end = LAUNCH_FOR * STEP
    const order = [LAUNCH_AT.stand[0], LAUNCH_AT.beep, LAUNCH_AT.stand[1], LAUNCH_AT.count, LAUNCH_AT.lift, LAUNCH_AT.climb[0], LAUNCH_AT.climb[1], LAUNCH_AT.settle[0], LAUNCH_AT.settle[1], LAUNCH_AT.out[1], LAUNCH_AT.flag, LAUNCH_AT.moony, LAUNCH_AT.fetch[0], LAUNCH_AT.fetch[1], LAUNCH_AT.aboard[0], LAUNCH_AT.aboard[1], LAUNCH_AT.home[0], LAUNCH_AT.home[1], LAUNCH_AT.end]
    expect(LAUNCH_AT.out[0]).toBe(LAUNCH_AT.settle[1])
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(order[0]).toBeGreaterThanOrEqual(0)
    expect(LAUNCH_AT.end).toBe(end)
    expect(LAUNCH_AT.count).toBe(COUNT_AT * STEP)
    expect(LAUNCH_AT.lift).toBe(LAUNCH_AT.count + 5)
  })

  it('keep Beep away with the rocket, in its window or out on the moon, from just after the tap until the sky slides away home', () => {
    expect(beepAway(0)).toBe(false)
    expect(beepAway(LAUNCH_AT.lift)).toBe(true)
    expect(beepAway(LAUNCH_AT.flag)).toBe(true)
    expect(beepAway(LAUNCH_AT.aboard[1])).toBe(true)
    expect(beepAway(LAUNCH_AT.home[1])).toBe(false)
  })
})

describe('the rocket sheet', () => {
  it('draws every entry, each under its own label', () => {
    const { ctx, check } = fakeContext()
    const sheet = SHEET()
    const labels = sheet.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const ppm of [50, 80])
      for (const entry of sheet) {
        pen.ppm = ppm
        for (const t of [0, 0.45, 1.1, 2.6, 7.9, 23.4]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
      }
  })
})

describe('the colours', () => {
  it('are all tokens from look.ts: no colour literal in this file\'s drawing', () => {
    const source = readFileSync(new URL('./rocket.ts', import.meta.url), 'utf8')
    expect(source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull()
  })
})
