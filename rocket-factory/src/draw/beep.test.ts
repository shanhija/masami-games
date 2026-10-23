/**
 * Runs Beep on the fake context in every pose, facing either way, empty-handed and carrying
 * each thing, flying and arrived, through each pose's moments at every size from a phone to a
 * card: it cannot crash, draw NaN, leave the context changed, draw text or make a gradient,
 * and it stays inside BEEP_BOX. Holds it to about 0.9 cell from the ground to its antenna
 * ball, its hover's bob to under 0.05 cell, its propeller to turning in the air, whirring in a
 * flight and still asleep, and its ball to the colour of what it carries. Looks are judged on
 * ?sheet=beep.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { THINGS, type BeepPic } from '../game/model'
import { BEEP_BOX, BEEP_POSES, POSES, SHEET, beepPicture, drawBeep, type BeepPicture } from './beep'
import { calls, colours, edges, fakeContext, poking, resetPen } from './fakeContext'
import { BEEP, THING, pen } from './look'

afterEach(resetPen)

/** CSS px a cell: a phone at land 3, an iPad at land 3 in Safari's bars, in full screen, land 1, a card. They give Beep every detail level. */
const SIZES = [26, 40, 50, 80, 160] as const
const beep = (patch: Partial<BeepPicture>): BeepPicture => ({ pose: 'float', age: 0, flight: 1, carrying: null, facing: 1, ...patch })
/** Moments through a pose: eight steps over a little more than its length, past it, and a long time on. */
const moments = (pose: BeepPic['pose']) => {
  const len = BEEP_POSES[pose].len
  return [...Array.from({ length: 8 }, (_, i) => (i / 7) * len * 1.1), len * 1.7, 913.7]
}
/** The propeller's blades: the ellipses as thick as a blade, by their middles. */
const blades = (pic: BeepPicture, t: number) =>
  calls((ctx) => drawBeep(ctx, pic, t))
    .filter((c) => c.startsWith('ellipse(') && c.split(',')[3] === '0.028000')
    .join(';')

describe('Beep', () => {
  it('draws every pose facing either way, empty-handed or carrying, flying or there, at every size, inside its box', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const px of SIZES) {
      pen.ppm = px
      POSES.forEach((pose, p) =>
        check(
          `${pose} at ${px} px a cell`,
          () =>
            moments(pose).forEach((age, m) => {
              const carrying = (p + m) % 3 === 0 ? null : THINGS[(p + m) % THINGS.length]!
              for (const facing of [1, -1] as const)
                for (const flight of [1, 0.45]) {
                  out.push(...poking(`${pose} at ${px} px, ${age.toFixed(2)} s, facing ${facing}, flight ${flight}`, measure(() => drawBeep(ctx, beep({ pose, age, carrying, facing, flight }), age * 1.3 + p)), edges(BEEP_BOX, 0), 0))
                }
            }),
          'none',
        ),
      )
    }
    expect(out).toEqual([])
  })

  it('makes a finite picture for a stamp of never, long ago or not yet', () => {
    const { ctx, check } = fakeContext()
    for (const pose of POSES)
      for (const age of [Infinity, -Infinity, NaN, 1e12, -1e12, -3]) check(`${pose} at ${age}`, () => drawBeep(ctx, beep({ pose, age, carrying: 'gear' }), 2.5), 'none')
    const never: BeepPic = { x: 1, y: 1, fromX: 1, fromY: 1, movedAt: -1, pose: 'float', poseAt: -1, carrying: null, facing: 1 }
    const pic = beepPicture(never, 2)
    expect(pic.flight).toBe(1)
    check('a Beep that never moved', () => drawBeep(ctx, pic, 2), 'none')
  })

  it('reads its flight and its pose off the state', () => {
    const b: BeepPic = { x: 4, y: 3, fromX: 1, fromY: 3, movedAt: 60, pose: 'carry', poseAt: 60, carrying: 'blueBar', facing: -1 }
    const pic = beepPicture(b, 1.1)
    expect(pic.flight).toBeCloseTo(0.1 / 0.35, 6)
    expect(pic.age).toBeCloseTo(0.1, 6)
    expect(pic).toMatchObject({ pose: 'carry', carrying: 'blueBar', facing: -1 })
    expect(beepPicture(b, 3).flight).toBe(1)
  })

  it('stands about 0.9 cell from the ground to its antenna ball, and bobs by less than 0.05 cell', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 80
    const tops: number[] = []
    for (let i = 0; i < 180; i++) {
      const b = measure(() => drawBeep(ctx, beep({}), i / 60))
      tops.push(b.y0)
      // Its shadow lies on the ground under it.
      expect(b.y1, `bottom at ${i}`).toBeGreaterThan(0)
      expect(b.y1, `bottom at ${i}`).toBeLessThan(0.08)
    }
    expect(Math.min(...tops)).toBeGreaterThan(-0.97)
    expect(Math.max(...tops)).toBeLessThan(-0.85)
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.05)
  })

  it('turns its propeller while it hovers, whirs it in a flight, and holds it still asleep', () => {
    expect(blades(beep({}), 0.2)).not.toBe(blades(beep({}), 0))
    expect(blades(beep({ flight: 0.5 }), 0.2)).not.toBe(blades(beep({ flight: 1 }), 0.2))
    expect(blades(beep({ pose: 'sleep' }), 0.9)).toBe(blades(beep({ pose: 'sleep' }), 0))
  })

  it('never makes its propeller leap from one frame to the next, even hours into a session', () => {
    /** The blades' middles across, one per blade. */
    const middles = (pic: BeepPicture, t: number) =>
      blades(pic, t)
        .split(';')
        .map((c) => Number(c.slice('ellipse('.length).split(',')[0]))
    for (const pose of POSES)
      for (const age of [0.1, 0.5, 0.9, 1.4, 2, 3]) {
        const late = 5000 + age
        const a = middles(beep({ pose, age }), late)
        const b = middles(beep({ pose, age: age + 1 / 60 }), late + 1 / 60)
        a.forEach((x, i) => expect(Math.abs(b[i]! - x), `${pose} at ${age} s`).toBeLessThan(0.02))
      }
  })

  it('lights its antenna ball in the colour of what it carries, and plain without', () => {
    for (const thing of THINGS) {
      const fills = colours((ctx) => drawBeep(ctx, beep({ carrying: thing }), 0))
      expect(fills, thing).toContain(THING[thing].key)
      expect(fills, thing).not.toContain(BEEP.antenna)
    }
    const fills = colours((ctx) => drawBeep(ctx, beep({}), 0))
    expect(fills).toContain(BEEP.antenna)
    for (const thing of THINGS) expect(fills, thing).not.toContain(THING[thing].key)
  })

  it('carries a thing in its mittens only in the carry pose, and holds a one-shot pose at its end, its propeller still turning', () => {
    const carried = colours((ctx) => drawBeep(ctx, beep({ pose: 'carry', carrying: 'gear' }), 0))
    expect(carried.filter((f) => f === THING.gear.key).length).toBeGreaterThan(1)
    // Everything but the blades: each blade's ellipse and the moveTo that starts it.
    const isBlade = (c: string | undefined) => c !== undefined && c.startsWith('ellipse(') && c.split(',')[3] === '0.028000'
    const body = (pic: BeepPicture) => calls((ctx) => drawBeep(ctx, pic, 1)).filter((c, i, all) => !isBlade(c) && !(c.startsWith('moveTo(') && isBlade(all[i + 1])))
    for (const pose of POSES) {
      if (BEEP_POSES[pose].loops) continue
      const len = BEEP_POSES[pose].len
      expect(body(beep({ pose, age: len + 0.5 })), pose).toEqual(body(beep({ pose, age: len + 4 })))
    }
  })

  it('draws its sheet', () => {
    const { ctx, check } = fakeContext()
    SHEET.forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 1.3] : [0.45, 2.9]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    })
  })
})
