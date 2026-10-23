/**
 * The renderer's own rules, on the fake context: whole frames over many states built from
 * rules.ts blankState by setting fields (the scenes' states; belts with forks, joins, bridges
 * and loops laid by hand and run hop by hop by belts.ts; every kind of building in every
 * state; munchers in every mode and every way home; flights; a card up; the night; the launch
 * from its tap to its end; strokes, hedge lines, peel
 * drags and held stickers as strokes.ts plans them; cells popping in and curling away; the
 * events' particles; ?debug). Every frame comes back balanced with nothing drawn NaN, draws no
 * text but the overlay's and makes no gradient; the bakes stay inside the cache's budget and
 * are painted once and again only when what they show changes; a frame drawn again draws the
 * same; a frame that does not move draws nothing; Beep and the things land where where.ts and
 * layout.ts put them. Looks are judged on ?sheet=scenes.
 */
import { describe, expect, it, vi } from 'vitest'

import { hop, rebuild } from '../game/belts'
import { cell as layCell, put } from '../game/beltKit'
import { BURROWS, cellOf } from '../game/board'
import { startView } from '../game/camera'
import { NIBBLE_FOR } from '../game/catalog'
import { NO_INSETS, hintGhost, toScreen, type View } from '../game/layout'
import { CARDS, HOP, STEP, inSlot, outSlot, overIn, type Dir, type Hit, type Muncher, type MuncherMode, type SimEvent, type State } from '../game/model'
import { blankState } from '../game/rules'
import { planStroke } from '../game/strokes'
import { beepPoint, thingPoint } from '../game/where'
import { BUDGET } from './cache'
import { HOME_WHYS, MUNCHER_MODES } from './critters'
import { fakeContext } from './fakeContext'
import { Renderer } from './frame'
import { AT, SCREENS, busyFactory, drawing, firstFactory, goodNight, launching, scenes } from './scenes'

/** What the art the renderer calls was handed: Beep's transform at each call, how often the print and the belts are painted, the end signs drawn, how far each dotted path reaches, where each hint ring and each muncher is drawn, the countdown's side, and each live thing's fizz seed. */
const seen = vi.hoisted(() => ({
  beep: [] as { e: number; f: number }[],
  prints: 0,
  belts: 0,
  signs: [] as string[],
  paths: [] as number[],
  rings: [] as { e: number; f: number }[],
  munchers: [] as { mode: string; a: number; e: number; f: number }[],
  sides: [] as number[],
  seeds: [] as { thing: string; seed: number; t: number }[],
  rockets: [] as { open: boolean; fill: number }[][],
  flags: [] as number[],
  labs: [] as ({ card: string; age: number } | null)[],
  progress: [] as number[],
}))
vi.mock('./buildings', async (original) => {
  const m = await original<typeof import('./buildings')>()
  return { ...m, drawBuilding: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawBuilding>[1], t: number) => (pic.kind === 'lab' && pic.hold === 'board' ? (seen.labs.push(pic.found), seen.progress.push(pic.progress)) : 0, m.drawBuilding(ctx, pic, t)) }
})
vi.mock('./beep', async (original) => {
  const m = await original<typeof import('./beep')>()
  return { ...m, drawBeep: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawBeep>[1], t: number) => (seen.beep.push(ctx.getTransform()), m.drawBeep(ctx, pic, t)) }
})
vi.mock('./land', async (original) => {
  const m = await original<typeof import('./land')>()
  return { ...m, drawPrint: (...a: Parameters<typeof m.drawPrint>) => (seen.prints++, m.drawPrint(...a)) }
})
vi.mock('./beltart', async (original) => {
  const m = await original<typeof import('./beltart')>()
  return {
    ...m,
    drawBelts: (...a: Parameters<typeof m.drawBelts>) => (seen.belts++, m.drawBelts(...a)),
    drawEndSign: (...a: Parameters<typeof m.drawEndSign>) => (seen.signs.push(a[1]), m.drawEndSign(...a)),
    drawHintPath: (...a: Parameters<typeof m.drawHintPath>) => (seen.paths.push(a[3]), m.drawHintPath(...a)),
  }
})
vi.mock('./effects', async (original) => {
  const m = await original<typeof import('./effects')>()
  return { ...m, drawHintRing: (ctx: CanvasRenderingContext2D, r: number, t: number) => (seen.rings.push(ctx.getTransform()), m.drawHintRing(ctx, r, t)) }
})
vi.mock('./critters', async (original) => {
  const m = await original<typeof import('./critters')>()
  return { ...m, drawMuncher: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawMuncher>[1], t: number) => (seen.munchers.push({ mode: pic.mode, ...ctx.getTransform() }), m.drawMuncher(ctx, pic, t)) }
})
vi.mock('./rocket', async (original) => {
  const m = await original<typeof import('./rocket')>()
  return {
    ...m,
    drawLaunch: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawLaunch>[1], t: number) => (seen.sides.push(pic.side), seen.flags.push(pic.flags), m.drawLaunch(ctx, pic, t)),
    drawRocket: (ctx: CanvasRenderingContext2D, pic: Parameters<typeof m.drawRocket>[1], t: number) => (seen.rockets.push(pic.parts.map((p) => ({ open: p.open, fill: p.fill }))), m.drawRocket(ctx, pic, t)),
  }
})
vi.mock('./things', async (original) => {
  const m = await original<typeof import('./things')>()
  return { ...m, drawLiftedThing: (...a: Parameters<typeof m.drawLiftedThing>) => (seen.seeds.push({ thing: a[1], seed: a[4], t: a[3] }), m.drawLiftedThing(...a)) }
})

/** Offscreen canvases for the bakes, each with its own fake context. */
function canvases() {
  const made: { width: number; height: number; counts: Record<string, number> }[] = []
  const make = () => {
    const f = fakeContext()
    const c = { width: 0, height: 0, counts: f.counts, getContext: () => f.ctx }
    made.push(c)
    return c as unknown as HTMLCanvasElement
  }
  return { make, made, pixels: () => made.reduce((n, c) => n + c.width * c.height, 0), paints: () => made.reduce((n, c) => n + (c.counts.clearRect ?? 0), 0) }
}

type Finger = { x: number; y: number; touch: boolean } | null

/**
 * A renderer on a fake context at a screen (CSS px and pixel ratio, a touch screen), its main
 * context recording every drawImage, and a frame drawer at a state's tick (half a step behind
 * it, as the stage draws) that checks the context comes back balanced with no text but the
 * overlay's and the bakes inside the budget, and returns the view it drew.
 */
function stage(w: number, h: number, dpr: number, debug: boolean) {
  const main = fakeContext()
  const images: { args: number[]; m: DOMMatrix2DInit }[] = []
  const ctx = new Proxy(main.ctx, {
    get(target, key: string) {
      const v = Reflect.get(target, key) as unknown
      if (key === 'drawImage') return (...a: unknown[]) => (images.push({ args: a.slice(1) as number[], m: target.getTransform() }), (v as (...b: unknown[]) => unknown)(...a))
      return v
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
  const pool = canvases()
  const r = new Renderer(ctx, pool.make, debug)
  r.resize(Math.round(w * dpr), Math.round(h * dpr), dpr)
  const draw = (s: State, events: readonly SimEvent[], finger: Finger, hover: Hit | null): View => {
    const t = (s.tick - 0.5) * STEP
    const view = startView(w, h, dpr, true, NO_INSETS)
    main.check(`a frame at tick ${s.tick}`, () => r.draw(s, t, view, events, STEP, finger, hover), debug ? 'allowed' : 'none')
    expect(pool.pixels(), 'the bakes inside the budget').toBeLessThanOrEqual(BUDGET)
    return view
  }
  return { r, main, pool, images, draw }
}
/** Every screen the game is drawn at, CSS px and pixel ratio: the scenes' iPads and a phone on its side. */
const SIZES = [...SCREENS.map(([w, h]) => [w, h, 1.82] as const), [750, 320, 2] as const]

/** Every bake's context is left balanced, and none drew text. */
function bakesClean(pool: ReturnType<typeof canvases>) {
  for (const c of pool.made) {
    expect(c.counts.save ?? 0).toBe(c.counts.restore ?? 0)
    expect(c.counts.fillText ?? 0).toBe(0)
  }
}

/** A muncher of burrow `burrow` in `mode` standing on cell (x, y), with two things in its cheeks. */
function muncher(s: State, burrow: number, mode: MuncherMode, x: number, y: number): Muncher {
  const m: Muncher = { id: s.nextMuncher++, burrow, mode, modeAt: s.tick - 30, cell: cellOf(x, y), toward: cellOf(x, y), stepAt: s.tick - 20, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: ['greenBottle', 'gear'], grabAt: s.tick - 10, idleSince: s.tick - 10, outAt: s.tick - 300, scout: false, shotBy: -1 }
  s.munchers.push(m)
  return m
}

/** A belt run, each [x, y, in side, out side]. */
const run = (s: State, cells: readonly (readonly [number, number, Dir, Dir])[]) => cells.forEach(([x, y, i, o]) => layCell(s, x, y, i, o, -1, -1))

/**
 * A board of belts alone: a loop of eight cells round a hole with a gap, a run with a fork,
 * a join onto its side and a bridge over it, a full loop of four bends, and things on all of
 * it, so a hop moves some and stands others still.
 */
function belts(): State {
  const s = blankState(9)
  s.tick = AT
  s.buildings = [s.buildings[0]!]
  // A loop round (5..7, 2..4), its gap at (5, 2).
  run(s, [
    [6, 2, 2, 0],
    [7, 2, 2, 1],
    [7, 3, 3, 1],
    [7, 4, 3, 2],
    [6, 4, 0, 2],
    [5, 4, 0, 3],
    [5, 3, 1, 3],
    [5, 2, 1, 0],
  ])
  // A run east along row 7 from (5, 7) to (12, 7); a fork at (8, 7) down (8, 8), (8, 9); a join from (10, 9) up into (10, 7); a bridge at (11, 7) crossed going north from (11, 9).
  run(s, [...[5, 6, 7, 8, 9, 10, 11, 12].map((x) => [x, 7, 2, 0] as const), [8, 8, 3, 1], [8, 9, 3, 1], [10, 9, 1, 3], [10, 8, 1, 3], [11, 9, 1, 3], [11, 8, 1, 3], [11, 6, 1, 3], [11, 5, 1, 3]])
  s.belts.fork[cellOf(8, 7)] = 1
  s.belts.over[cellOf(11, 7)] = 3
  // A full loop of four bends at (14..15, 2..3).
  run(s, [
    [14, 2, 1, 0],
    [15, 2, 2, 1],
    [15, 3, 3, 2],
    [14, 3, 0, 3],
  ])
  for (let c = 0; c < s.belts.pattern.length; c++) if (s.belts.out[c]! >= 0) s.belts.pattern[c] = c % 10
  rebuild(s)
  const things = ['blueRock', 'goldBar', 'gear', 'bubble', 'greenBottle', 'orangeBottle'] as const
  let k = 0
  for (let c = 0; c < s.belts.out.length; c++) if (s.belts.out[c]! >= 0) for (const x of [inSlot(c), outSlot(c)]) if ((c + x) % 3 !== 0 || c === cellOf(14, 2) || c === cellOf(15, 2) || c === cellOf(15, 3) || c === cellOf(14, 3)) put(s, x, things[k++ % things.length]!)
  put(s, overIn(cellOf(11, 7)), 'gear')
  return s
}

/** Every kind of building on the busy board, each in one more state: working, waiting, stopped under its stack, napped on, tucked in, tapped for its recipe, just placed, pushing, gulping, a tower shooting, peeled up. */
function buildingStates(s: State, k: number): void {
  s.buildings.forEach((b, i) => {
    const state = (i + k) % 11
    b.batch = state === 0 || state === 4 ? { makes: 'gear', at: s.tick - 20, until: s.tick + 60 } : null
    b.stack = state === 2 && b.kind !== 'lab' && b.kind !== 'pad' && b.kind !== 'tower' && b.kind !== 'bowl' ? ['gear', 'gear', 'gear', 'gear'] : b.stack
    b.tucked = state === 3
    b.tapAt = state === 5 ? s.tick - 20 : -1
    b.placedAt = state === 6 ? s.tick - 5 : b.placedAt
    b.pushAt = state === 7 ? s.tick - 4 : -1
    b.gulpAt = state === 8 ? s.tick - 3 : -1
    b.shotAt = state === 9 ? s.tick - 10 : -1
    b.ammo = (i + k) % 5
    b.stars = (i + k) % 7
    b.held[4] = (i + k) % 5
  })
  const peeled = s.buildings[(k % (s.buildings.length - 1)) + 1]!
  s.lifted = { kind: 'building', id: peeled.id, at: s.tick - 20 }
}

describe('the renderer', { timeout: 30_000 }, () => {
  it('draws every scene at every screen, with and without the debug overlay', () => {
    for (const debug of [false, true])
      for (const [w, h, dpr] of SIZES) {
        const { draw, pool } = stage(w, h, dpr, debug)
        for (const make of [() => firstFactory(1), () => busyFactory(2), () => goodNight(3), () => launching(4, 6), () => launching(5, 14), () => drawing(8, 'stroke'), () => drawing(9, 'ghost')]) {
          const s = make()
          draw(s, [], { x: w / 2, y: h / 2, touch: true }, null)
          s.tick += 7
          draw(s, [], null, { kind: 'building', id: 2 })
        }
        bakesClean(pool)
      }
  })

  it('draws the scenes sheet on its own canvases, each entry leaving the context as it found it', () => {
    const pool = canvases()
    const main = fakeContext()
    for (const e of scenes(pool.make)) main.check(`scene ${e.label}`, () => e.draw(main.ctx, 1.3), e.label.includes('debug') ? 'allowed' : 'none')
    bakesClean(pool)
  })

  it('draws belts with forks, joins, bridges and loops hop by hop, gliding through each hop, and their cells popping in and curling away', () => {
    const { draw, pool } = stage(1024, 768, 2, false)
    const s = belts()
    for (let i = 0; i < 12; i++) {
      // A few frames through each hop: things and marks glide from where they were.
      for (const into of [1, 7, 14, 19]) {
        s.tick = AT + i * HOP + into
        draw(s, [], null, null)
      }
      s.tick = AT + (i + 1) * HOP
      hop(s)
    }
    // A stroke laid: its cells pop in one by one, then land in the bake.
    const laid = [cellOf(2, 9), cellOf(3, 9), cellOf(4, 9)]
    run(s, [
      [2, 9, 2, 0],
      [3, 9, 2, 0],
      [4, 9, 2, 0],
    ])
    for (const c of laid) s.belts.laidAt[c] = s.tick
    rebuild(s)
    draw(s, [{ kind: 'lay', cells: laid }], null, null)
    for (let i = 0; i < 40; i += 3) {
      s.tick += 3
      draw(s, [], null, null)
    }
    // And rolled up again: each cell curls away from the picture the frame before had.
    for (const c of laid) s.belts.out[c] = s.belts.in[c] = -1
    rebuild(s)
    s.tick++
    draw(s, [{ kind: 'rollUp', cells: laid }], null, null)
    for (let i = 0; i < 30; i += 3) {
      s.tick += 3
      draw(s, [], null, null)
    }
    bakesClean(pool)
  })

  it('bakes the layout once, again only when it changes or a stroke has landed, and the print once over the cells in view', () => {
    const { draw } = stage(1024, 768, 2, false)
    const s = belts()
    draw(s, [], null, null)
    const belts0 = seen.belts
    const prints0 = seen.prints
    for (let i = 0; i < 20; i++) {
      s.tick += 5
      if (i % 4 === 0) hop(s)
      draw(s, [], null, null)
    }
    expect(seen.belts, 'things riding never bake the layout again').toBe(belts0)
    expect(seen.prints, 'nor the print').toBe(prints0)
    // A cell laid on its own: the bake shows the same while it pops in, so it is baked again once, when it has landed.
    layCell(s, 16, 9, 2, 0, -1, -1)
    s.belts.laidAt[cellOf(16, 9)] = s.tick
    rebuild(s)
    for (let i = 0; i < 40; i++) {
      s.tick++
      draw(s, [], null, null)
    }
    expect(seen.belts - belts0).toBe(1)
    // A run carried on past its dead end: its last cell loses its arrowhead at once, and the new cell lands later: two bakes.
    layCell(s, 13, 7, 2, 0, -1, -1)
    s.belts.laidAt[cellOf(13, 7)] = s.tick
    rebuild(s)
    for (let i = 0; i < 40; i++) {
      s.tick++
      draw(s, [], null, null)
    }
    expect(seen.belts - belts0).toBe(3)
    // A stroke being drawn fades the grid in: the print with its grid is baked once.
    s.drag = { kind: 'stroke', cells: [cellOf(16, 5), cellOf(17, 5)], at: s.tick }
    for (let i = 0; i < 30; i++) {
      s.tick++
      draw(s, [], { x: 500, y: 300, touch: true }, null)
    }
    expect(seen.prints - prints0).toBe(1)
  })

  it('draws every kind of building in every state, munchers napping on them, and a lifted one', () => {
    for (const [w, h, dpr] of [SIZES[0]!, SIZES[2]!]) {
      const { draw, pool } = stage(w, h, dpr, false)
      const s = busyFactory(12)
      for (let k = 0; k < 11; k++) {
        buildingStates(s, k)
        s.tick += 9
        draw(s, [], null, null)
      }
      bakesClean(pool)
    }
  })

  it('draws munchers in every mode and every way home, hopping, caught and bouncing as the hint', () => {
    const { draw, pool } = stage(1024, 768, 2, false)
    const s = busyFactory(13)
    s.munchers = []
    const om = s.buildings.find((b) => b.kind === 'orangeMaker')!
    om.napper = -1
    MUNCHER_MODES.forEach((mode, i) => {
      const m = muncher(s, i % 3, mode, 3 + (i % 8), 3 + Math.floor(i / 8))
      if (mode === 'nap') om.napper = m.id
      if (mode === 'out' || mode === 'bowl' || mode === 'home') m.hop = { x0: 3.5 + (i % 8), y0: 3.5, x1: 6.5, y1: 8.5, at: s.tick - 40, until: s.tick + 80 }
      if (mode === 'home') m.homeWhy = 'full'
      if (mode === 'walk') m.toward = m.cell + 1
    })
    for (const [k, why] of HOME_WHYS.entries()) {
      const m = muncher(s, k % 3, 'home', 9 + k, 11)
      m.homeWhy = why
      m.cheeks = why === 'tickled' || why === 'sudsed' ? [] : ['gear']
    }
    s.tickles = [s.munchers.find((m) => m.mode === 'caught')!.id]
    for (let i = 0; i < 30; i++) {
      s.hint = { step: { kind: 'muncher', id: s.munchers[i % s.munchers.length]!.id }, at: s.tick - 30 }
      s.tick += 5
      draw(s, i % 5 === 0 ? [{ kind: 'nom', id: s.munchers[0]!.id, thing: 'gear', x: 3.5, y: 3.5 }] : [], null, null)
    }
    bakesClean(pool)
  })

  it('draws flights, a card up, the night falling and its lights, burrows waking and waving, and the launch from its tap to its end', () => {
    const { draw, pool } = stage(1180, 820, 1.82, false)
    const s = busyFactory(14)
    s.card = { id: 'more', at: s.tick - 30 }
    s.flights = Array.from({ length: 8 }, (_, i) => ({ thing: (['gear', 'blueBar', 'greenBottle', 'bubble'] as const)[i % 4], x0: 2 + i, y0: 9, x1: 13, y1: 5, at: s.tick - i * 4, until: s.tick + 20, arc: 0.5 + i * 0.3 }))
    s.burrows.forEach((b, i) => {
      b.warnAt = i === 0 ? s.tick - 60 : -1
      b.helloAt = i === 1 ? s.tick - 40 : -1
      b.pawsAt = i === 2 ? s.tick - 30 : -1
      b.hunger = [1000, 760, 920][i]!
    })
    for (let i = 0; i < 24; i++) {
      s.tick += 4
      draw(s, i === 0 ? [{ kind: 'card', id: 'more' }, { kind: 'poke', what: 'burrow', x: 15, y: 9 }] : [], null, null)
    }
    const night = goodNight(15)
    for (let i = 0; i < 20; i++) {
      night.tick += 9
      draw(night, [], null, null)
    }
    for (let age = 0; age <= 41; age += 1.5) draw(launching(16, age), age === 0 ? [{ kind: 'launch' }] : [], null, null)
    // After the launch: Moony on the pad's ring, the same rocket open again.
    const after = busyFactory(17)
    after.launches = 1
    draw(after, [{ kind: 'poke', what: 'moony', x: 3.5, y: 6.7 }], null, null)
    after.tick += 20
    draw(after, [], null, null)
    bakesClean(pool)
  })

  it('draws strokes, hedge lines, peel drags and held stickers as strokes.ts plans them, under the finger, the mouse or neither', () => {
    const { draw, pool } = stage(1024, 768, 2, false)
    const s = busyFactory(20)
    s.hint = null
    const fingers: Finger[] = [{ x: 400, y: 500, touch: true }, { x: 400, y: 500, touch: false }, null]
    // Strokes: across ground into a machine, over a belt (a bridge), back over itself (a curl), into the pond (a stop).
    const strokes = [
      [cellOf(3, 7), cellOf(4, 7), cellOf(5, 7), cellOf(5, 8)],
      [cellOf(11, 1), cellOf(11, 2)],
      [cellOf(13, 8), cellOf(13, 9), cellOf(12, 9), cellOf(11, 9), cellOf(10, 9)],
      [cellOf(4, 8), cellOf(3, 8), cellOf(2, 8), cellOf(2, 9), cellOf(2, 8)],
      [cellOf(3, 9), cellOf(2, 9), cellOf(1, 9), cellOf(0, 9)],
    ]
    strokes.forEach((cells, i) =>
      fingers.forEach((finger) => {
        for (let n = 1; n <= cells.length; n++) {
          s.drag = { kind: 'stroke', cells: cells.slice(0, n), at: AT + i * 100 }
          s.tick += 2
          draw(s, [], finger, null)
        }
      }),
    )
    s.drag = { kind: 'hedge', cells: [cellOf(5, 11), cellOf(6, 11), cellOf(7, 11)], at: s.tick }
    draw(s, [], fingers[0]!, null)
    s.drag = { kind: 'peel', cells: [cellOf(2, 10), cellOf(3, 10), cellOf(4, 10)], at: s.tick }
    s.tick++
    draw(s, [], fingers[0]!, null)
    s.drag = null
    s.tick++
    draw(s, [{ kind: 'rollUp', cells: [cellOf(2, 10), cellOf(3, 10), cellOf(4, 10)] }], null, null)
    s.lifted = { kind: 'run', cells: [cellOf(7, 4), cellOf(7, 5)], at: s.tick - 20 }
    s.tick++
    draw(s, [], null, null)
    s.lifted = null
    for (const sticker of ['digger', 'oven', 'pump', 'tower', 'bowl', 'lab'] as const)
      for (const [x, y] of [
        [8.5, 9.5],
        [1.2, 9.1],
        [5.5, 10.5],
        [17.6, 4.5],
        [30, 2],
      ] as const)
        fingers.forEach((finger) => {
          s.tool = { kind: 'sticker', sticker }
          s.drag = { kind: 'ghost', sticker, x, y, at: s.tick }
          s.tick++
          draw(s, [], finger, null)
        })
    // The hint's own ghost on its spot, and its dotted path.
    s.drag = null
    s.hint = { step: { kind: 'place', sticker: 'greenMaker', x: 3, y: 8 }, at: s.tick - 30 }
    draw(s, [], null, null)
    s.hint = { step: { kind: 'link', from: 4, to: 7, thing: 'blueBar', path: [cellOf(10, 5), cellOf(10, 4), cellOf(10, 3)], full: true }, at: s.tick - 30 }
    s.tick++
    draw(s, [], null, null)
    bakesClean(pool)
  })

  it('sets off the events, remembering the taps on the print, the nibbler\'s bites and the zips\' merges', () => {
    const { draw, pool } = stage(1024, 768, 2, true)
    const s = busyFactory(21)
    const hedge = cellOf(18, 8)
    const events: SimEvent[] = [
      { kind: 'dig', cell: cellOf(8, 3), thing: 'blueRock' },
      { kind: 'full', cell: cellOf(9, 3), id: 1 },
      { kind: 'poke', what: 'tree', x: 9.5, y: 0.5 },
      { kind: 'poke', what: 'flowers', x: 13.5, y: 2.5 },
      { kind: 'poke', what: 'ground', x: 3.5, y: 8.5 },
      { kind: 'nibble', cell: hedge },
      { kind: 'crunch', cell: hedge },
      { kind: 'partFull', part: 'legs' },
      { kind: 'place', id: 5, sticker: 'workshop' },
    ]
    draw(s, events, null, null)
    for (let i = 0; i < NIBBLE_FOR; i += 20) {
      s.tick += 20
      draw(s, i === 140 || i === 300 ? [{ kind: 'crunch', cell: hedge }] : [], null, null)
    }
    bakesClean(pool)
  })

  it('draws a frame again the same, draws nothing for a frame that does not move, and paints everything again after a lost context', () => {
    const { r, main, draw, pool } = stage(1024, 768, 2, false)
    const s = busyFactory(22)
    draw(s, [], null, null)
    const total = () => Object.values(main.counts).reduce((a, b) => a + b, 0)
    // The same state at the same time through the same view: nothing drawn at all.
    const before = total()
    draw(s, [], null, null)
    expect(total()).toBe(before)
    // Drawn again from scratch (a resize keeps the bakes), the same calls with the same numbers.
    const trace = () => {
      const calls: string[] = []
      const t = (s.tick - 0.5) * STEP
      const view = startView(1024, 768, 2, true, NO_INSETS)
      const spy = new Proxy(main.ctx, {
        get(target, key: string) {
          const v = Reflect.get(target, key) as unknown
          if (typeof v !== 'function') return v
          return (...a: unknown[]) => (calls.push(`${key}(${a.map((x) => (typeof x === 'number' ? x.toFixed(5) : typeof x)).join(',')})`), (v as (...b: unknown[]) => unknown)(...a))
        },
      })
      const again = new Renderer(spy, pool.make, false)
      again.resize(2048, 1536, 2)
      again.draw(s, t, view, [], STEP, null, null)
      again.resize(2048, 1536, 2)
      calls.length = 0
      again.draw(s, t, view, [], STEP, null, null)
      return calls
    }
    expect(trace()).toEqual(trace())
    // A context lost and given back: every bake painted again.
    const paints = pool.paints()
    r.invalidate()
    s.tick++
    draw(s, [], null, null)
    expect(pool.paints() - paints).toBeGreaterThan(5)
  })

  it('puts Beep and the things where where.ts says, through the view, sideways and upright', () => {
    for (const [w, h] of [SCREENS[1], SCREENS[2]] as const) {
      const { draw, images } = stage(w, h, 2, false)
      const s = busyFactory(23)
      s.flights = []
      seen.beep.length = 0
      images.length = 0
      const view = draw(s, [], null, null)
      const t = (s.tick - 0.5) * STEP
      const p = beepPoint(s.beep, t)
      const [bx, by] = toScreen(view, p.x, p.y)
      expect(seen.beep).toHaveLength(1)
      expect(seen.beep[0]!.e).toBeCloseTo(bx * 2, 6)
      expect(seen.beep[0]!.f).toBeCloseTo(by * 2, 6)
      // Each thing's stamp is drawn round its point: the stamp's middle (its shadow down-right) a hair off it.
      const slot = outSlot(cellOf(10, 6))
      const q = thingPoint(s, slot, t)
      const [tx, ty] = toScreen(view, q.x, q.y)
      const near = images.filter((im) => im.m.a === 1 && im.args.length === 4 && Math.abs(im.args[0]! + im.args[2]! / 2 - tx * 2) < 0.1 * view.cell * 2 && Math.abs(im.args[1]! + im.args[3]! / 2 - ty * 2) < 0.1 * view.cell * 2)
      expect(near.length, `a stamp at the thing's point at ${w}x${h}`).toBeGreaterThan(0)
    }
  })
})

describe('the drag\'s picture', () => {
  it('wears the sign strokes.ts plans, so it never lies: the mouth into a machine, the stop at the pond, none on bare ground', () => {
    const s = firstFactory(24)
    const { draw } = stage(1024, 768, 2, false)
    const signs = (cells: number[]) => {
      seen.signs.length = 0
      s.drag = { kind: 'stroke', cells, at: s.tick }
      s.tick++
      draw(s, [], { x: 300, y: 400, touch: true }, null)
      const plan = planStroke(s, cells, null).sign
      expect(seen.signs).toEqual(plan === 'none' ? [] : [plan])
      return seen.signs
    }
    expect(signs([cellOf(3, 7), cellOf(4, 7), cellOf(5, 7)])).toEqual(['mouth'])
    expect(signs([cellOf(4, 9), cellOf(3, 9), cellOf(2, 9), cellOf(1, 9)])).toEqual(['stop'])
    expect(signs([cellOf(8, 9), cellOf(9, 9), cellOf(10, 9)])).toEqual([])
  })
})

describe('the one next step', () => {
  it("lays the dotted path behind the hint's hand as it traces a link not shown in full, and the whole path for one shown in full", () => {
    const { draw } = stage(1024, 768, 2, false)
    const path = [cellOf(5, 8), cellOf(4, 8), cellOf(3, 8), cellOf(3, 7)]
    for (const full of [false, true]) {
      const s = firstFactory(30)
      s.hint = { step: { kind: 'link', from: 1, to: 0, thing: 'blueBar', path, full }, at: AT - 600 }
      s.handAt = AT - 50
      s.handN = 1
      s.lastTouchAt = AT - 900
      seen.paths.length = 0
      draw(s, [], null, null)
      if (full) expect(seen.paths).toEqual([1])
      else {
        expect(seen.paths).toHaveLength(1)
        expect(seen.paths[0]!).toBeGreaterThan(0)
        expect(seen.paths[0]!).toBeLessThan(1)
      }
    }
  })

  it("lays a tower's bubble belt as a lasting dotted path with no hand, the bubble bouncing on it, and the tower's ghost only once the belt runs under its spot", () => {
    const { draw } = stage(1024, 768, 2, false)
    const s = firstFactory(30)
    // The pump's footprint cell, then the belt to the tower's spot at its end.
    const cells = [cellOf(1, 8), cellOf(1, 7), cellOf(2, 7), cellOf(3, 7), cellOf(4, 7)]
    s.hint = { step: { kind: 'defend', sticker: 'tower', cells, x: 4, y: 7 }, at: AT - 600 }
    s.handN = 0
    s.handAt = -1
    seen.paths.length = 0
    seen.rings.length = 0
    seen.seeds.length = 0
    draw(s, [], null, null)
    expect(seen.paths).toEqual([1])
    // One thing bounces: the bubble over the belt's middle, under its ring; no ghost yet.
    expect(seen.rings).toHaveLength(1)
    expect(seen.seeds.filter((x) => x.thing === 'bubble' && x.seed === cells[2])).toHaveLength(1)
    expect(hintGhost(s, AT * STEP)).toBeNull()
  })

  it("bounces one machine of Good night's kind, the one her tap goes to, the rest of the kind in their nightcaps", () => {
    for (const [w, h] of [SCREENS[1], SCREENS[2]] as const) {
      const { draw } = stage(w, h, 2, false)
      const s = goodNight(31)
      expect(s.buildings.filter((b) => b.kind === 'oven' && !b.tucked).length).toBeGreaterThan(1)
      seen.rings.length = 0
      const view = draw(s, [], null, null)
      const first = s.buildings.find((b) => b.kind === 'oven' && !b.tucked)!
      const [x, y] = toScreen(view, first.x + 1, first.y + 1)
      expect(seen.rings).toHaveLength(1)
      expect(seen.rings[0]!.e).toBeCloseTo(2 * x, 4)
      expect(seen.rings[0]!.f).toBeCloseTo(2 * y, 4)
    }
  })

  it('celebrates a card the lab found in its dome as the card comes, and no card found elsewhere', () => {
    const { draw } = stage(1180, 820, 2, false)
    const s = busyFactory(34)
    const lab = (card: State['card']) => {
      s.card = card
      s.tick++
      seen.labs.length = 0
      draw(s, [], null, null)
      return seen.labs
    }
    const now = lab({ id: 'snacks', at: s.tick - 30 })
    expect(now).toHaveLength(1)
    expect(now[0]).toMatchObject({ card: 'snacks' })
    expect(now[0]!.age).toBeGreaterThan(0.4)
    // The legs and the first gold bar find their cards with no lab; and once the card has flipped up the dome is itself again.
    expect(lab({ id: 'gold', at: s.tick - 30 })).toEqual([null])
    expect(lab({ id: 'snacks', at: s.tick - 600 })).toEqual([null])
    expect(lab(null)).toEqual([null])
    // With every card found the lab drinks for no card, its whole dome lit.
    s.found = [...CARDS]
    seen.progress.length = 0
    lab(null)
    expect(seen.progress).toEqual([1])
  })

  it('draws no bounce for a hint naming what has gone since it looked, and never throws on a link with no path', () => {
    const { draw } = stage(1024, 768, 2, false)
    const s = busyFactory(32)
    s.burrows[0]!.heap = [0, 0, 0, 0, 0, 0, 0, 0]
    const gone: State['hint'][] = [
      { step: { kind: 'link', from: 99, to: 0, thing: 'blueBar', path: [cellOf(3, 7), cellOf(3, 8)], full: true }, at: AT - 30 },
      { step: { kind: 'link', from: 1, to: 0, thing: 'blueBar', path: [], full: false }, at: AT - 30 },
      { step: { kind: 'heap', burrow: 0 }, at: AT - 30 },
      { step: { kind: 'bottleneck', id: 99, sticker: 'oven', x: 3, y: 8 }, at: AT - 30 },
      { step: { kind: 'refill', id: 99 }, at: AT - 30 },
      { step: { kind: 'stack', id: 99 }, at: AT - 30 },
      { step: { kind: 'muncher', id: 99 }, at: AT - 30 },
      { step: { kind: 'unblock', slot: inSlot(cellOf(0, 11)) }, at: AT - 30 },
    ]
    for (const hint of gone) {
      s.hint = hint
      s.tick++
      seen.rings.length = 0
      draw(s, [], null, null)
      expect(seen.rings, JSON.stringify(hint)).toEqual([])
    }
  })
})

describe("the burrows' doors", () => {
  it("puts a muncher in its doorway at the door board.ts gives its burrow, and starts its hop out from there, sideways and upright", () => {
    for (const [w, h] of [SCREENS[1], SCREENS[2]] as const) {
      const { draw } = stage(w, h, 2, false)
      const s = busyFactory(33)
      s.munchers = []
      s.hint = null
      for (const b of s.buildings) b.napper = -1
      for (const b of s.burrows) b.hunger = 0
      const door = BURROWS[1]!.door
      const peek = muncher(s, 1, 'peek', BURROWS[1]!.x + 1, BURROWS[1]!.y + 2)
      peek.hop = { x0: door.x, y0: door.y, x1: door.x, y1: door.y, at: s.tick - 10, until: s.tick - 10 }
      const out = muncher(s, 1, 'out', BURROWS[1]!.x + 1, BURROWS[1]!.y + 2)
      out.hop = { x0: door.x, y0: door.y, x1: door.x, y1: door.y + 1, at: s.tick, until: s.tick + 60 }
      seen.munchers.length = 0
      const view = draw(s, [], null, null)
      const [px, py] = toScreen(view, door.x, door.y)
      const drawn = seen.munchers.filter((m) => m.mode === 'peek' || m.mode === 'out')
      expect(drawn).toHaveLength(2)
      // The one hopping out has only just left the door (half a step into a one second hop): still beside it.
      for (const m of drawn) {
        expect(Math.abs(m.e - 2 * px), `${m.mode} at ${w}x${h}`).toBeLessThan(m.mode === 'peek' ? 1e-6 : 0.05 * 2 * view.cell)
        expect(Math.abs(m.f - 2 * py), `${m.mode} at ${w}x${h}`).toBeLessThan(m.mode === 'peek' ? 1e-6 : 0.25 * 2 * view.cell)
      }
    }
  })

  it('puts the same rocket on the pad open again after a landing, filling as its parts fill, and on the moon a flag for every flight before', () => {
    const { draw } = stage(1180, 820, 2, false)
    const s = busyFactory(35)
    s.found = [...CARDS]
    s.launches = 2
    s.rocket.got = [5, 0, 3, 0]
    seen.rockets.length = 0
    draw(s, [], null, null)
    expect(seen.rockets).toEqual([[0.25, 0, 0.3, 0].map((fill) => ({ open: true, fill }))])
    const flying = launching(36, 25)
    flying.launches = 2
    seen.flags.length = 0
    draw(flying, [], null, null)
    expect(seen.flags).toEqual([2])
  })

  it('stands the countdown beside the pad, on the side toward the screen\'s middle when the watchers sit below it', () => {
    for (const [[w, h], side] of [
      [SCREENS[1], 1],
      [SCREENS[2], 1],
    ] as const) {
      const { draw } = stage(w, h, 2, false)
      seen.sides.length = 0
      draw(launching(34, 4), [], null, null)
      expect(seen.sides, `${w}x${h}`).toEqual([side])
    }
  })
})

describe('the fizz', () => {
  it('gives each thing riding a belt its own fizz, which it keeps as it rides', () => {
    // A big screen, where the start block's cells are big enough for things to fizz.
    const { draw } = stage(2560, 1440, 1, false)
    const s = firstFactory(35)
    put(s, inSlot(cellOf(7, 4)), 'blueRock')
    put(s, outSlot(cellOf(4, 6)), 'blueBar')
    s.tick = AT - (AT % HOP)
    const live = () => seen.seeds.filter((x) => x.t !== 0).map((x) => x.seed)
    seen.seeds.length = 0
    draw(s, [], null, null)
    const before = live()
    expect(before.length).toBeGreaterThan(2)
    expect(new Set(before).size, 'no two in step').toBe(before.length)
    hop(s)
    s.tick += HOP
    seen.seeds.length = 0
    draw(s, [], null, null)
    const after = live()
    expect(new Set(after).size, 'no two in step after the hop').toBe(after.length)
    const kept = after.filter((x) => before.includes(x))
    expect(kept.length, 'the things still riding kept their fizz').toBeGreaterThanOrEqual(2)
    for (const x of after) if (!before.includes(x)) expect(x, 'a thing new on the belts fizzes on a new seed').toBeGreaterThan(Math.max(...before))
  })
})
