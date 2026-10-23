/**
 * Runs the buildings' draw functions (every kind in every state: working on its notes,
 * waiting with what it wants, stopped under its stack, slapped, pushed, gulping, tapped for
 * its recipe, in a nightcap, tucked in, held as a ghost, grey, peeled, bouncing; the lab's
 * stars, the tower's shots and stars, the bowl's bars and picnic, the pad drumming; the stamped
 * bodies, the tabs, the footprints, the tray's stickers and holes, and the sheet) on the fake
 * context at the game's sizes, so art written without looking cannot crash, draw NaN, leave
 * the context changed, draw text or make a gradient per call; holds each drawing to its
 * footprint plus what its state adds; checks that a building squashes in place and stands
 * still while it is not working, and that every colour is a token. Looks are judged on
 * ?sheet=buildings.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { BOWL_HOLD, SIZE, STACK, TOWER_AMMO } from '../game/catalog'
import { CARDS, DIRS, KINDS, STICKERS, newBuilding, type CardId, type Kind, type Thing } from '../game/model'
import { stackBox } from '../game/where'
import { calls, clipped, fakeContext, poking as pokingOut, resetPen, type Edges } from './fakeContext'
import { pen } from './look'
import {
  CELEBRATE,
  RECIPE_FOR,
  SHEET,
  STAMPED,
  STICKER_BOX,
  bodyBox,
  drawBody,
  drawBuilding,
  drawFootprint,
  drawHole,
  drawSticker,
  drawTabs,
  recipeOf,
  restingPic,
  type BuildingPic,
} from './buildings'

/** CSS px a cell: a phone on its side, land 3 on an iPad, land 1, the sheet. */
const SCALES = [26, 50, 80, 120] as const
/** Sim times, from the start to long into a session. */
const TIMES = [0, 0.11, 0.37, 1.9, 13.1, 977.3] as const
/** Seconds since a stamp: through every short act, past them, long ago, never. */
const AGES = [0, 0.05, 0.1, 0.2, 0.3, 0.6, 1.2, 1.9, 3, 1e4, Infinity] as const
/** What each maker makes, for its stack. */
const MAKES: Partial<Record<Kind, Thing>> = { digger: 'blueRock', oven: 'goldBar', workshop: 'gear', greenMaker: 'greenBottle', orangeMaker: 'orangeBottle', pump: 'bubble' }

afterEach(resetPen)

/** Where the box b pokes out of `room` by more than a hair, as sentences: none when it is inside. */
const poking = (what: string, b: Edges, room: Edges) => pokingOut(what, b, room, 1e-6)

/**
 * The room a building's picture may take: its footprint (a tower's wand pokes a little over
 * its top and its right side), plus a little for what its state adds: the roof stack (where.ts stackBox), a nightcap,
 * the recipe bubble over its top, the hint's rise, a held sticker's growth and long shadow, a
 * wobble, a slap's or a push's widening.
 */
function room(pic: BuildingPic): Edges {
  const n = SIZE[pic.kind]
  const r = { x0: 0, y0: pic.kind === 'tower' ? -0.13 : 0, x1: pic.kind === 'tower' ? 1.08 : n, y1: n }
  if (pic.stack.length > 0) r.y0 = Math.min(r.y0, -0.3)
  // A tower's shot puffs out of its wand's ring; a picnic's hearts rise over its bowl.
  if (pic.kind === 'tower' && pic.shotAge < 0.45) {
    r.y0 = Math.min(r.y0, -0.36)
    r.x1 = Math.max(r.x1, 1.16)
  }
  if (pic.kind === 'bowl' && pic.picnic) r.y0 = Math.min(r.y0, -0.16)
  if (pic.night !== 'none') r.y0 = Math.min(r.y0, pic.kind === 'tower' ? -0.2 : -0.42)
  if (pic.hold === 'board' && pic.tapAge < RECIPE_FOR) {
    r.y0 = Math.min(r.y0, pic.kind === 'tower' ? -1.0 : -0.85)
    r.x0 = Math.min(r.x0, n / 2 - 1.2)
    r.x1 = Math.max(r.x1, n / 2 + 1.2)
  }
  r.y0 -= pic.rise
  const grow = pic.hold === 'ghost' ? 0.06 : pic.hold === 'peel' ? 0.04 : 0
  const tilt = pic.hold === 'grey' ? 0.075 : pic.hold === 'peel' ? 0.085 : pic.kind === 'pump' ? 0.04 : 0
  const shadow = pic.hold === 'ghost' ? 0.16 : pic.hold === 'peel' ? 0.13 : 0
  const wide = Math.max(pic.placedAge < 0.25 ? 0.04 : 0, pic.pushAge < 0.2 ? 0.01 : 0)
  // A ghost's rim is filled round its outline rather than stroked, so the measure sees it.
  const rim = pic.hold === 'ghost' ? 0.07 : 0
  const reach = n * (grow / 2 + wide) + tilt * n + rim
  return { x0: r.x0 - reach, y0: r.y0 - n * grow - tilt * n * 0.3 - rim, x1: r.x1 + reach + shadow, y1: r.y1 + n * grow / 2 + shadow + tilt * n * 0.4 + rim }
}

/** The states the sweep puts each kind through, each a patch on its resting picture at a moment `u` (0 to 1) and an age. */
function states(kind: Kind, u: number, age: number): Partial<BuildingPic>[] {
  const made = MAKES[kind]
  const stack = (n: number) => (made ? Array<Thing>(n).fill(made) : [])
  const wants: Thing[] = kind === 'greenMaker' ? ['blueBar', 'goldBar'] : kind === 'oven' ? ['goldRock'] : kind === 'lab' ? ['greenBottle', 'orangeBottle'] : kind === 'workshop' ? ['blueBar'] : kind === 'orangeMaker' ? ['bubble'] : []
  return [
    {},
    { mode: 'working', beat: u },
    { mode: 'waiting', wants },
    { mode: 'stopped', stack: stack(STACK) },
    { mode: 'working', beat: u, stack: stack(1 + Math.floor(u * 3)) },
    { placedAge: age },
    { mode: 'working', beat: u, pushAge: age },
    { gulpAge: age, mode: 'working', beat: u },
    { tapAge: age },
    { tapAge: age, rise: kind === 'pad' ? 0 : 0.2 * u },
    { night: 'cap', rise: kind === 'pad' ? 0 : 0.2 * u },
    { night: 'tucked', mode: 'stopped', stack: stack(2) },
    ...(kind === 'pad' ? [] : ([{ hold: 'ghost' }, { hold: 'grey' }, { hold: 'peel', stack: stack(3) }] as const)),
    { rise: kind === 'pad' ? 0 : 0.2 * u, mode: 'working', beat: u },
    { progress: u, mode: 'working', beat: u },
    { ammo: Math.floor(u * (TOWER_AMMO + 1)), stars: Math.floor(u * 7), shotAge: age },
    { ammo: 0, shotAge: age },
    { bars: Math.floor(u * (BOWL_HOLD + 1)), picnic: u > 0.5 },
  ]
}

describe('the buildings', () => {
  it('draw every kind in every state, at every size and moment, inside their footprint and what the state adds', { timeout: 30_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const c = clipped(ctx)
    const out: string[] = []
    // One check holds a kind's states at a size together: a state that leaves the context changed leaves it changed at the end of them too.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const kind of KINDS)
        check(
          `${kind} at ${ppm} px a cell`,
          () =>
            AGES.forEach((age, a) => {
              const u = [0, 0.3, 0.55, 0.9, 0.999][(a + s) % 5]!
              const t = TIMES[(a + 2 * s) % TIMES.length]!
              for (const patch of states(kind, u, age)) {
                const pic = { ...restingPic(kind), ...patch }
                out.push(...poking(`${kind} ${JSON.stringify(patch)} at ${t} s, ${ppm} px`, measure(() => drawBuilding(c, pic, t)), room(pic)))
              }
            }),
          'none',
        )
    })
    expect(out).toEqual([])
  })

  it('stand on the ground: a push and a slap squash them in place, never lifting their foot', () => {
    const { ctx, measure } = fakeContext()
    const c = clipped(ctx)
    for (const kind of KINDS) {
      const still = measure(() => drawBuilding(c, restingPic(kind), 1))
      for (const age of [0.02, 0.05, 0.1, 0.15]) {
        const pushed = measure(() => drawBuilding(c, { ...restingPic(kind), pushAge: age }, 1))
        const slapped = measure(() => drawBuilding(c, { ...restingPic(kind), placedAge: age }, 1))
        expect(pushed.y1, `${kind} pushed ${age} s ago`).toBeCloseTo(still.y1, 6)
        expect(slapped.y1, `${kind} slapped ${age} s ago`).toBeCloseTo(still.y1, 6)
        // The squash is in place: a little lower at its top, never higher.
        expect(pushed.y0, `${kind} pushed ${age} s ago`).toBeGreaterThanOrEqual(still.y0 - 1e-9)
      }
    }
  })

  it('stand still while they wait or are stopped, and move their part while they work', () => {
    // Every call with its arguments: two moments draw the same picture when the logs agree.
    const log = (pic: BuildingPic, t: number) => calls((ctx) => drawBuilding(ctx, pic, t)).join(';')
    for (const kind of KINDS) {
      // The pump floats, so it rocks on the pond whatever it does; the rest are still.
      if (kind === 'pump') continue
      for (const mode of ['waiting', 'stopped'] as const) {
        const pic = { ...restingPic(kind), mode, beat: 0.4, wants: kind === 'workshop' ? (['blueBar'] as Thing[]) : [] }
        expect(log(pic, 2), `${kind} ${mode}`).toBe(log({ ...pic, beat: 0.8 }, 3.37))
      }
    }
    // The machines' parts move on their notes: a working one at two beats is two pictures.
    for (const kind of ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'pad'] as const) {
      const pic = { ...restingPic(kind), mode: 'working' as const, progress: 0.5 }
      expect(log({ ...pic, beat: 0.1 }, 2), kind).not.toBe(log({ ...pic, beat: 0.6 }, 2.2))
    }
  })

  it("celebrate a card the lab found: its stars leave their places for the card's own picture, inside the dome, then shrink away", () => {
    const { ctx, check, measure } = fakeContext()
    const log = (pic: BuildingPic, t: number) => calls((c) => drawBuilding(c, pic, t)).join(';')
    const found = (card: CardId, age: number): BuildingPic => ({ ...restingPic('lab'), progress: 0, found: { card, age } })
    // A moment after the stars have all joined.
    const JOIN_SEEN = 1
    const pictures = new Set<string>()
    for (const card of CARDS) {
      for (const age of [0, 0.2, 0.5, JOIN_SEEN, 1.4, CELEBRATE - 0.01]) {
        const b = measure(() => check(`${card} at ${age}`, () => drawBuilding(ctx, found(card, age), 3), 'none'))
        expect(poking(`${card} at ${age}`, b, { x0: -0.1, y0: -0.1, x1: 2.2, y1: 2.2 })).toEqual([])
      }
      pictures.add(log(found(card, JOIN_SEEN), 3))
    }
    // Every card its own picture; at its start the stars are where the full card lit them, and none of it is the lab at rest.
    expect(pictures.size).toBe(CARDS.length)
    expect(log(found('gears', 0), 3)).not.toBe(log(found('gears', JOIN_SEEN), 3))
    expect(log(found('gears', JOIN_SEEN), 3)).not.toBe(log({ ...restingPic('lab'), progress: 1 }, 3))
  })

  it('keep the roof stack where the hit test finds it (where.ts stackBox)', () => {
    const { ctx, measure } = fakeContext()
    const c = clipped(ctx)
    for (const kind of KINDS) {
      const made = MAKES[kind]
      if (!made) continue
      const box = stackBox(newBuilding(1, kind, 0, 0, -1))
      const bare = measure(() => drawBuilding(c, restingPic(kind), 1))
      for (let n = 1; n <= STACK; n++) {
        const b = measure(() => drawBuilding(c, { ...restingPic(kind), mode: 'stopped', stack: Array<Thing>(n).fill(made) }, 1))
        // Only the stack reaches past the bare building, and only inside its box (and the things' own shadows; the pump's rocking carries it a little to the side).
        const bob = kind === 'pump' ? 0.07 : 0
        if (b.y0 < bare.y0 - 1e-9) expect(b.y0, `${kind} ${n}`).toBeGreaterThanOrEqual(box.y - 1e-9)
        expect(b.x0, `${kind} ${n}`).toBeGreaterThanOrEqual(Math.min(bare.x0, box.x - bob) - 1e-9)
        expect(b.x1, `${kind} ${n}`).toBeLessThanOrEqual(Math.max(bare.x1, box.x + box.w + 0.07 + bob))
      }
    }
  })

  it('refuse a stack on a kind that never stacks, a stamp where the paths must draw, a held pad, and more than two wants', () => {
    const { ctx } = fakeContext()
    for (const kind of ['lab', 'tower', 'bowl', 'pad'] as const) expect(() => drawBuilding(ctx, { ...restingPic(kind), stack: ['gear'] }, 1), kind).toThrow()
    const stamp = {} as CanvasImageSource
    for (const kind of ['tower', 'bowl', 'pad'] as const) expect(() => drawBuilding(ctx, { ...restingPic(kind), stamp }, 1), kind).toThrow()
    expect(() => drawBuilding(ctx, { ...restingPic('oven'), stamp, hold: 'grey' }, 1)).toThrow()
    for (const hold of ['ghost', 'grey', 'peel'] as const) expect(() => drawBuilding(ctx, { ...restingPic('pad'), hold }, 1), hold).toThrow()
    expect(() => drawBuilding(ctx, { ...restingPic('pad'), rise: 0.1 }, 1)).toThrow()
    expect(() => drawBuilding(ctx, { ...restingPic('oven'), mode: 'waiting', wants: ['blueRock', 'goldRock', 'blueRock'] }, 1)).toThrow()
  })
})

describe('the stamped bodies', () => {
  it('draw each 2x2 body inside its box, rim and all, with its shadow and without', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const kind of STAMPED)
        for (const shadow of [false, true]) {
          const box = bodyBox(kind, shadow)
          const b = measure(() => check(`${kind} body${shadow ? ' and its shadow' : ''} at ${ppm} px`, () => drawBody(ctx, kind, shadow), 'none'))
          // The rim is a stroke the measure leaves out: the outline keeps a rim's width inside the box.
          expect(poking(kind, b, { x0: box.x + 0.06, y0: box.y + 0.06, x1: box.x + box.w - 0.06, y1: box.y + box.h - 0.06 })).toEqual([])
        }
    }
  })

  it('stamp the body in its box in place of its paths, the parts still drawn over it, and on the board its shadow with it', () => {
    for (const kind of STAMPED) {
      const paths = fakeContext()
      drawBuilding(paths.ctx, { ...restingPic(kind), mode: 'working', beat: 0.3 }, 1)
      const stamped = fakeContext()
      drawBuilding(stamped.ctx, { ...restingPic(kind), mode: 'working', beat: 0.3, stamp: {} as CanvasImageSource }, 1)
      expect(stamped.counts.drawImage, kind).toBe(1)
      expect(stamped.counts.fill!, kind).toBeLessThan(paths.counts.fill!)
      // Held up as a ghost it casts its long shadow itself, over a stamp without one.
      const ghost = fakeContext()
      drawBuilding(ghost.ctx, { ...restingPic(kind), hold: 'ghost', stamp: {} as CanvasImageSource }, 1)
      const board = fakeContext()
      drawBuilding(board.ctx, { ...restingPic(kind), stamp: {} as CanvasImageSource }, 1)
      // (A count the fake context never saw is no call at all.)
      expect(ghost.counts.fill ?? 0, kind).toBeGreaterThan(board.counts.fill ?? 0)
    }
  })
})

describe('the recipes', () => {
  it('show each kind what goes in and what comes out', () => {
    expect(recipeOf('workshop', [])).toEqual({ takes: ['blueBar', 'blueBar'], makes: 'gear' })
    expect(recipeOf('greenMaker', [])).toEqual({ takes: ['blueBar', 'goldBar'], makes: 'greenBottle' })
    expect(recipeOf('orangeMaker', [])).toEqual({ takes: ['gear', 'bubble'], makes: 'orangeBottle' })
    expect(recipeOf('oven', ['goldRock'])).toEqual({ takes: ['goldRock'], makes: 'goldBar' })
    expect(recipeOf('digger', ['blueRock'])).toEqual({ takes: [], makes: 'blueRock' })
    expect(recipeOf('lab', ['greenBottle', 'orangeBottle'])).toEqual({ takes: ['greenBottle', 'orangeBottle'], makes: 'star' })
    expect(recipeOf('pad', [])).toEqual({ takes: [], makes: 'rocket' })
    expect(recipeOf('tower', []).makes).toBe('suds')
    expect(recipeOf('bowl', []).makes).toBe('heart')
  })

  it('refuse what does not vary, and what is missing', () => {
    expect(() => recipeOf('workshop', ['gear'])).toThrow()
    expect(() => recipeOf('digger', [])).toThrow()
    expect(() => recipeOf('oven', ['gear'])).toThrow()
    expect(() => recipeOf('lab', [])).toThrow()
    expect(() => recipeOf('pad', ['blueBar', 'gear'])).toThrow()
  })
})

describe('the tabs and the footprints', () => {
  it('draw a mouth and a spout at every cell of every side, on the footprint\'s edge', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const kind of ['digger', 'oven', 'lab', 'pad'] as const) {
        const n = SIZE[kind]
        for (const side of DIRS)
          for (let at = 0; at < n; at++) {
            const mouth = measure(() => check(`${kind} mouth ${side} ${at}`, () => drawTabs(ctx, kind, [{ side, at }], []), 'none'))
            const spout = measure(() => check(`${kind} spout ${side} ${at}`, () => drawTabs(ctx, kind, [], [{ side, at }]), 'none'))
            // A mouth stays inside the footprint (its shadow a hair past); a spout's lip pokes out over the belt's start.
            expect(poking(`${kind} mouth ${side} ${at}`, mouth, { x0: 0, y0: 0, x1: n + 0.07, y1: n + 0.07 })).toEqual([])
            expect(poking(`${kind} spout ${side} ${at}`, spout, { x0: -0.08, y0: -0.08, x1: n + 0.14, y1: n + 0.14 })).toEqual([])
          }
      }
    }
  })

  it('refuse a tab off the footprint', () => {
    const { ctx } = fakeContext()
    expect(() => drawTabs(ctx, 'oven', [{ side: 0, at: 2 }], [])).toThrow()
    expect(() => drawTabs(ctx, 'pad', [], [{ side: 3, at: -1 }])).toThrow()
  })

  it('draw a ghost\'s footprint 0.15 cell outside its cells, fitting or not', () => {
    const { ctx, check, measure } = fakeContext()
    for (const kind of KINDS)
      for (const ok of [true, false]) {
        const n = SIZE[kind]
        const b = measure(() => check(`${kind} ${ok}`, () => drawFootprint(ctx, kind, ok), 'none'))
        expect([b.x0, b.y0, b.x1, b.y1].map((v) => +v.toFixed(6))).toEqual([-0.15, -0.15, n + 0.15, n + 0.15])
      }
  })
})

describe('the tray', () => {
  it('draws every sticker and its hole inside the tray\'s box', () => {
    const { ctx, check, measure } = fakeContext()
    const c = clipped(ctx)
    for (const ppm of [64, 72])
      for (const sticker of STICKERS) {
        // The tray's buttons are 64 and 72 px: the box is one button.
        pen.ppm = ppm
        const box = { x0: STICKER_BOX.x, y0: STICKER_BOX.y, x1: STICKER_BOX.x + STICKER_BOX.w, y1: STICKER_BOX.y + STICKER_BOX.h }
        for (const t of TIMES) expect(poking(`${sticker} at ${t}`, measure(() => check(sticker, () => drawSticker(c, sticker, t), 'none')), box)).toEqual([])
        expect(poking(`${sticker} hole`, measure(() => check(sticker, () => drawHole(c, sticker), 'none')), box)).toEqual([])
      }
  })
})

describe('the buildings sheet', () => {
  it('draws every entry, each under its own label', () => {
    const { ctx, check } = fakeContext()
    const sheet = SHEET()
    const labels = sheet.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const ppm of [50, 80])
      for (const entry of sheet) {
        pen.ppm = ppm
        for (const t of [0, 0.45, 1.1, 2.6, 7.9]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
      }
  })
})

describe('the colours', () => {
  it('are all tokens from look.ts: no colour literal in this file\'s drawing', () => {
    const source = readFileSync(new URL('./buildings.ts', import.meta.url), 'utf8')
    expect(source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull()
  })
})
