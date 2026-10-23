/**
 * Runs the munchers on the fake context in every mode and every way home, for each burrow's
 * mark, with 0 to 4 things in their cheeks, facing either way, the scout and the rest, at
 * every size from a phone to a card: they cannot crash, draw NaN, leave the context changed,
 * draw text or make a gradient, and they stay inside MUNCHER_BOX. Holds the cheeks to one
 * step out for each thing eaten, the outline to 12 to 14 bumps, each burrow to its own mark,
 * the nibble to three bites, and the picture read off the state to the way the muncher moves.
 * Moony too. Looks are judged on ?sheet=critters.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { cellOf } from '../game/board'
import { NIBBLE_FOR } from '../game/catalog'
import { STEP, newBuilding, type Muncher, type Thing } from '../game/model'
import { blankState } from '../game/rules'
import { BUMPS, HOME_WHYS, MOONY_BOX, MUNCHER_BOX, MUNCHER_MODES, SHEET, drawMoony, drawMuncher, muncherPicture, type MuncherPicture } from './critters'
import { clipped, colours, edges, fakeContext, poking, resetPen } from './fakeContext'
import { MUNCHER, NIGHT, pen } from './look'

afterEach(resetPen)

/** CSS px a cell: a phone at land 3, an iPad in Safari's bars, in full screen, land 1, a card. They give a muncher every detail level. */
const SIZES = [26, 40, 50, 80, 160] as const
const FOUR: readonly Thing[] = ['greenBottle', 'orangeBottle', 'goldBar', 'gear']
const muncher = (patch: Partial<MuncherPicture>): MuncherPicture => ({
  burrow: 0,
  mode: 'sit',
  why: null,
  age: 0,
  cheeks: [],
  nom: Infinity,
  shrug: Infinity,
  wave: Infinity,
  rise: 1,
  lift: 0,
  step: 0,
  facing: 1,
  phase: 0.4,
  scout: false,
  ...patch,
})
/** Every act: each mode, and 'home' once for each way home. */
const ACTS = [...MUNCHER_MODES.filter((m) => m !== 'home').map((mode) => ({ mode, why: null })), ...HOME_WHYS.map((why) => ({ mode: 'home' as const, why }))]
/** Moments through an act: ten steps over its first few seconds (each little act is shorter), and a long time on. */
const MOMENTS = [...Array.from({ length: 10 }, (_, i) => i * 0.37), 8.2, 913.7]

describe('the munchers', () => {
  it('draw every act for every burrow with 0 to 4 in their cheeks, facing either way, at every size, inside their box', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const seen = clipped(ctx)
    const out: string[] = []
    for (const px of SIZES) {
      pen.ppm = px
      ACTS.forEach(({ mode, why }, a) =>
        check(
          `${mode} ${why ?? ''} at ${px} px a cell`,
          () =>
            MOMENTS.forEach((age, m) => {
              const pic = muncher({
                mode,
                why,
                age,
                burrow: (a + m) % 3,
                cheeks: why === 'tickled' || why === 'sudsed' ? [] : FOUR.slice(0, (a + m + px) % 5),
                nom: m % 2 === 0 ? age % 1 : Infinity,
                shrug: mode === 'walk' && m < 6 ? age : Infinity,
                wave: m === 5 || m === 8 ? age % 1.6 : Infinity,
                rise: mode === 'peek' ? m / 9 : 1,
                lift: mode === 'out' || mode === 'bowl' || mode === 'home' ? 0.18 * Math.abs(Math.sin(Math.PI * age)) : 0,
                step: (m / 7) % 1,
                facing: m % 2 === 0 ? 1 : -1,
                scout: m === 3,
                phase: m / 11,
              })
              out.push(...poking(`${mode} ${why ?? ''} at ${px} px, ${age.toFixed(2)} s`, measure(() => drawMuncher(seen, pic, age + a)), edges(MUNCHER_BOX, 0), 0))
            }),
          'none',
        ),
      )
    }
    expect(out).toEqual([])
  })

  it('make a finite picture for a stamp of never, long ago or not yet', () => {
    const { ctx, check } = fakeContext()
    for (const { mode, why } of ACTS)
      for (const age of [Infinity, -Infinity, NaN, 1e12, -1e12, -3])
        check(`${mode} ${why ?? ''} at ${age}`, () => drawMuncher(ctx, muncher({ mode, why, age, nom: age, shrug: age, wave: age, cheeks: FOUR.slice(0, 3) }), 2.5), 'none')
  })

  it('puff their cheeks out one step for each thing eaten, the things showing', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 80
    const widths = [0, 1, 2, 3, 4].map((n) => {
      const b = measure(() => drawMuncher(ctx, muncher({ cheeks: FOUR.slice(0, n) }), 0))
      return b.x1 - b.x0
    })
    for (let n = 1; n <= 4; n++) expect(widths[n]!, `${n} in its cheeks`).toBeGreaterThan(widths[n - 1]! + 0.05)
    expect(widths[4]!).toBeLessThan(1.05)
    // Each thing in a cheek is drawn in its own key colour.
    const used = colours((c) => drawMuncher(c, muncher({ cheeks: ['blueBar', 'gear'] }), 0))
    expect(used).toContain('#5B98F6')
    expect(used).toContain('#A78BFA')
    expect(() => drawMuncher(ctx, muncher({ cheeks: [...FOUR, 'gear'] }), 0)).toThrow(/at most 4/)
  })

  it('are raspberries outlined by 12 to 14 bumps, berry pink, and each burrow wears its own mark', () => {
    expect(BUMPS).toBeGreaterThanOrEqual(12)
    expect(BUMPS).toBeLessThanOrEqual(14)
    pen.ppm = 80
    const marks = [MUNCHER.bow, MUNCHER.freckle, MUNCHER.flower]
    for (let b = 0; b < 3; b++) {
      const used = colours((c) => drawMuncher(c, muncher({ burrow: b }), 0))
      expect(used, `burrow ${b}`).toContain(MUNCHER.body)
      expect(used, `burrow ${b}`).toContain(MUNCHER.calyx)
      expect(used, `burrow ${b}`).toContain(MUNCHER.belly)
      marks.forEach((mark, other) => expect(used.includes(mark), `burrow ${b}, mark ${other}`).toBe(other === b))
    }
    expect(colours((c) => drawMuncher(c, muncher({ mode: 'home', why: 'night' }), 0))).toContain(NIGHT.nightcap)
    expect(colours((c) => drawMuncher(c, muncher({ mode: 'watch' }), 0))).toContain(MUNCHER.flag)
  })

  it('nibble a hedge in three bites', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 80
    // A bite leans it forward toward the hedge: count the leans over the nibble.
    const rest = measure(() => drawMuncher(ctx, muncher({ mode: 'nibble', age: 0 }), 0)).x1
    let bites = 0
    let leaning = false
    for (let age = 0; age < NIBBLE_FOR * STEP; age += 1 / 30) {
      const now = measure(() => drawMuncher(ctx, muncher({ mode: 'nibble', age }), 0)).x1 > rest + 0.04
      if (now && !leaning) bites++
      leaning = now
    }
    expect(bites).toBe(3)
  })

  it('wave a paw up beside the face in any mode, from the doorway too', () => {
    // Standing right up in the doorway: a peek lower down clips at the sill, and the measure would count the clip's own box.
    const { ctx, measure } = fakeContext()
    pen.ppm = 80
    for (const mode of ['peek', 'sit', 'walk', 'wait'] as const) {
      const still = measure(() => drawMuncher(ctx, muncher({ mode, age: 3 }), 0))
      const waving = measure(() => drawMuncher(ctx, muncher({ mode, age: 3, wave: 0.4 }), 0))
      expect(waving.x1, mode).toBeGreaterThan(still.x1 + 0.03)
    }
  })

  it('throw on a way home that is missing', () => {
    const { ctx } = fakeContext()
    expect(() => drawMuncher(ctx, muncher({ mode: 'home', why: null }), 0)).toThrow(/needs a why/)
  })

  it('are read off the state: facing the way they go, upstream when sitting, waddling over two steps, rising out of the door, shrugging at an empty bowl', () => {
    const s = blankState(3)
    const m: Muncher = { id: 7, burrow: 0, mode: 'walk', modeAt: 60, cell: cellOf(8, 5), toward: cellOf(7, 5), stepAt: 60, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: ['gear'], grabAt: -1, idleSince: -1, outAt: 0, scout: false, shotBy: -1 }
    const walking = muncherPicture(s, m, 60 * STEP + 25 * STEP)
    expect(walking.facing).toBe(-1)
    expect(walking.step).toBeCloseTo(((8 + 5) % 2) / 2 + 0.25, 6)
    expect(walking.lift).toBeGreaterThan(0)
    expect(walking.nom).toBe(Infinity)
    expect(walking.shrug).toBe(Infinity)
    // Sitting on a belt whose things come in from the east, it faces east.
    s.belts.in[cellOf(8, 5)] = 0
    s.belts.out[cellOf(8, 5)] = 2
    expect(muncherPicture(s, { ...m, mode: 'sit', toward: m.cell }, 2).facing).toBe(1)
    const peek = (t: number) => muncherPicture(s, { ...m, mode: 'peek', toward: m.cell, modeAt: 0 }, t).rise
    expect(peek(0)).toBe(0)
    expect(peek(0.3)).toBeGreaterThan(0)
    expect(peek(2)).toBe(1)
    // At its burrow's empty bowl, its hop there over, it peers in and shrugs from its arrival; hopping there, and walking off after, it does not.
    s.buildings.push(newBuilding(5, 'bowl', 10, 1, 0))
    const atBowl: Muncher = { ...m, mode: 'bowl', toward: m.cell }
    expect(muncherPicture(s, atBowl, 60 * STEP + 0.5).shrug).toBeCloseTo(0.5, 6)
    expect(muncherPicture(s, { ...atBowl, hop: { x0: 8.5, y0: 5.5, x1: 10.5, y1: 1.5, at: 60, until: 300 } }, 60 * STEP + 0.5).shrug).toBe(Infinity)
    expect(muncherPicture(s, m, 60 * STEP + 0.5).shrug).toBe(Infinity)
  })

  it('draw their sheet', () => {
    const { ctx, check } = fakeContext()
    const seen = clipped(ctx)
    SHEET().forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 1.3] : [0.45, 2.9]) check(`${entry.label} at ${t}`, () => entry.draw(seen, t), 'none')
    })
  })
})

describe('Moony', () => {
  it('sits, waves and hops at every size, inside its box', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const px of SIZES) {
      pen.ppm = px
      for (const hop of [Infinity, 0, 0.1, 0.3, 0.55, 0.9, NaN, -2])
        check(
          `Moony at ${px} px, hop ${hop}`,
          () => {
            for (let t = 0; t < 4; t += 0.31) {
              out.push(...poking(`hop ${hop} at ${t.toFixed(2)}`, measure(() => drawMoony(ctx, t, hop)), edges(MOONY_BOX, 0), 0))
            }
          },
          'none',
        )
    }
    expect(out).toEqual([])
  })
})
