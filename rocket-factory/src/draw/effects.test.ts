/**
 * Sets off every kind of event the sim reports and draws the particles on the fake context for
 * a few seconds: nothing crashes, draws NaN, leaves the context changed, draws text or makes a
 * gradient, the pool never holds more than POOL, and every burst is gone within five seconds. Holds the
 * song's notes to the plan's rules (one a machine a bar, to a burrow that is listening, every
 * other bar while munchers are out, none to the burrow that is visiting), the particles to
 * falling down the screen, a card's confetti to the board the screen shows, and the hint's ring to its bounce. Looks
 * are judged on ?sheet=effects.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { cellOf } from '../game/board'
import { CARDS, HOP, STEP, newBuilding, type EventKind, type Muncher, type SimEvent, type State } from '../game/model'
import { blankState } from '../game/rules'
import type { Box } from '../game/where'
import { Effects, POOL, SHEET, drawHintRing, hintLift, type HeldGhost } from './effects'
import { colours, fakeContext, resetPen } from './fakeContext'
import { C, LAND, pen } from './look'

afterEach(resetPen)

/** The board box the screen shows: the start block. */
const VIEW: Box = { x: 0, y: 0, w: 20, h: 12 }

/** A muncher of burrow `b` sitting on cell (x, y). */
const sitter = (id: number, b: number, x: number, y: number): Muncher => ({
  id,
  burrow: b,
  mode: 'sit',
  modeAt: 0,
  cell: cellOf(x, y),
  toward: cellOf(x, y),
  stepAt: 0,
  stepFor: 50,
  hop: null,
  homeWhy: null,
  target: null,
  tried: [],
  cheeks: ['greenBottle'],
  grabAt: 0,
  idleSince: 0,
  outAt: 0,
  scout: false,
  shotBy: -1,
})

/** A board with what the events name: muncher 1, a tower (9), an oven (10) fed by a belt from the west with a blue rock riding into its mouth, and a digger (11). */
function stage(): State {
  const s = blankState(5)
  s.munchers.push(sitter(1, 0, 9, 7))
  s.buildings.push(newBuilding(9, 'tower', 8, 8, 0), newBuilding(10, 'oven', 3, 8, 0), newBuilding(11, 'digger', 7, 2, 0))
  const belt = cellOf(2, 8)
  s.belts.in[belt] = 2
  s.belts.out[belt] = 0
  s.belts.slot[2 * belt + 1] = 0
  s.net.mouths.set(10, [2 * belt + 1])
  return s
}

/** One event of every kind, each where it can happen on the stage; the record makes the compiler name every kind. */
function everyEvent(): SimEvent[] {
  const c = cellOf(5, 5)
  const all: { [K in EventKind]: Extract<SimEvent, { kind: K }>[] } = {
    play: [{ kind: 'play' }],
    dig: [
      { kind: 'dig', cell: c, thing: 'blueRock' },
      { kind: 'dig', cell: cellOf(0, 8), thing: 'bubble' },
    ],
    full: [{ kind: 'full', cell: c, id: 1 }],
    lay: [{ kind: 'lay', cells: [c, c + 1] }],
    repoint: [{ kind: 'repoint', cells: [c] }],
    bridge: [{ kind: 'bridge', cell: c }],
    join: [{ kind: 'join', cell: c }],
    fork: [{ kind: 'fork', cell: c }],
    rollUp: [{ kind: 'rollUp', cells: [c, c + 1] }],
    hedgeIn: [{ kind: 'hedgeIn', cells: [c, c + 1, c + 2] }],
    place: [{ kind: 'place', id: 10, sticker: 'oven' }],
    peel: [{ kind: 'peel', id: 42, sticker: 'workshop' }],
    lift: [{ kind: 'lift', x: 2.5, y: 8.5 }],
    nope: [{ kind: 'nope', x: 4, y: 4 }],
    oops: [{ kind: 'oops' }],
    pattern: [{ kind: 'pattern', pattern: 1 }],
    batch: [{ kind: 'batch', id: 10 }],
    push: [{ kind: 'push', id: 10, thing: 'blueBar' }],
    gulp: [
      { kind: 'gulp', id: 10, thing: 'blueRock' },
      { kind: 'gulp', id: 11, thing: 'blueRock' },
    ],
    drink: [{ kind: 'drink', bottle: 'greenBottle' }],
    fill: [{ kind: 'fill', part: 'legs', thing: 'blueBar' }],
    partFull: [{ kind: 'partFull', part: 'legs' }],
    card: [{ kind: 'card', id: 'gold' }],
    cardClosed: [{ kind: 'cardClosed', id: 'gold' }],
    carry: [{ kind: 'carry', thing: 'gear', x: 5, y: 5 }],
    warn: [{ kind: 'warn', burrow: 0 }],
    hopOut: [{ kind: 'hopOut', id: 1, burrow: 0 }],
    nom: [{ kind: 'nom', id: 1, thing: 'greenBottle', x: 9.5, y: 7.5 }],
    napStart: [{ kind: 'napStart', id: 1, building: 10 }],
    napEnd: [{ kind: 'napEnd', id: 1, building: 10 }],
    burp: [{ kind: 'burp', id: 1, x: 9.5, y: 7.5 }],
    home: [{ kind: 'home', id: 1, why: 'full' }],
    heap: [{ kind: 'heap', burrow: 0, thing: 'gear' }],
    caught: [{ kind: 'caught', id: 1 }],
    giggle: [{ kind: 'giggle', id: 1, x: 9.5, y: 7.5 }],
    sneeze: [{ kind: 'sneeze', id: 1, x: 9.5, y: 7.5 }],
    shot: [{ kind: 'shot', tower: 9, muncher: 1 }],
    suds: [{ kind: 'suds', id: 1, x: 9.5, y: 7.5 }],
    picnic: [{ kind: 'picnic', id: 1, burrow: 0 }],
    shrug: [{ kind: 'shrug', id: 1 }],
    friend: [{ kind: 'friend', burrow: 0 }],
    nibble: [{ kind: 'nibble', cell: c }],
    crunch: [{ kind: 'crunch', cell: c }],
    regrow: [{ kind: 'regrow', cell: c }],
    visitOver: [{ kind: 'visitOver', burrow: 0 }],
    launch: [{ kind: 'launch' }],
    count: [{ kind: 'count', n: 3 }],
    liftoff: [{ kind: 'liftoff' }],
    landed: [{ kind: 'landed' }],
    poke: (['tree', 'flowers', 'ground', 'belt', 'burrow', 'beep', 'moony', 'grey'] as const).map((what) => ({ kind: 'poke' as const, what, x: 6.5, y: 6.5 })),
    recipe: [{ kind: 'recipe', id: 10 }],
    tickleBusy: [{ kind: 'tickleBusy', id: 1 }],
    goodnight: [{ kind: 'goodnight' }],
    tuck: [{ kind: 'tuck', machine: 'oven' }],
    sleep: [{ kind: 'sleep' }],
    wake: [{ kind: 'wake' }],
    session: [{ kind: 'session' }],
    say: [{ kind: 'say', word: { card: 'gold' } }],
    tool: [{ kind: 'tool' }],
  }
  return Object.values(all).flat()
}

describe('the particles', () => {
  it("set off every kind of event without trouble, stay within the pool, draw clean and are gone in five seconds (a card's confetti rains longest)", () => {
    const fx = new Effects()
    const s = stage()
    fx.spawn(everyEvent(), s, 0, null, VIEW)
    expect(fx.alive).toBeGreaterThan(60)
    expect(fx.alive).toBeLessThanOrEqual(POOL)
    const { ctx, check } = fakeContext()
    for (let i = 0; i < 5 / STEP; i++) check(`frame ${i}`, () => fx.draw(ctx, i * STEP, STEP), 'none')
    expect(fx.alive).toBe(0)
  })

  it('never hold more than the pool, the oldest making way', () => {
    const fx = new Effects()
    const s = stage()
    for (let i = 0; i < 20; i++) fx.spawn([{ kind: 'card', id: CARDS[i % CARDS.length]! }, { kind: 'landed' }], s, 0, null, VIEW)
    expect(fx.alive).toBe(POOL)
    fx.clear()
    expect(fx.alive).toBe(0)
  })

  it('fall down the screen', () => {
    const fx = new Effects()
    const { ctx, measure } = fakeContext()
    ctx.scale(50, 50)
    // A leaf from a tree's tap: it pops up a little, then drifts down the screen.
    fx.spawn([{ kind: 'poke', what: 'tree', x: 4, y: 3 }], stage(), 0, null, VIEW)
    const ys: number[] = []
    for (let i = 0; i < 80; i++) {
      const b = measure(() => fx.draw(ctx, i * STEP, STEP))
      ys.push((b.y0 + b.y1) / 2)
    }
    expect(ys[79]! - ys[20]!).toBeGreaterThan(0.2)
  })

  it("rain a card's confetti over the board the screen shows, wherever that is", () => {
    // Over the start block, and over a stretch far out east: the rain's middle follows the view's box.
    for (const view of [VIEW, { x: 40, y: 20, w: 20, h: 12 }]) {
      const fx = new Effects()
      const { ctx, measure } = fakeContext()
      fx.spawn([{ kind: 'card', id: 'gold' }], stage(), 0, null, view)
      const xs: number[] = []
      for (let i = 0; i < 90; i++) {
        const b = measure(() => fx.draw(ctx, i * STEP, STEP))
        if (b.x1 > b.x0) xs.push((b.x0 + b.x1) / 2)
      }
      const mid = xs.reduce((a, x) => a + x, 0) / xs.length
      expect(mid, `view at ${view.x}`).toBeGreaterThan(view.x)
      expect(mid, `view at ${view.x}`).toBeLessThan(view.x + view.w)
    }
  })

  it('set off nothing for an event whose muncher or building has gone since (a frame of several steps)', () => {
    const fx = new Effects()
    fx.spawn([{ kind: 'caught', id: 99 }, { kind: 'shot', tower: 99, muncher: 99 }, { kind: 'picnic', id: 99, burrow: 0 }, { kind: 'place', id: 99, sticker: 'oven' }, { kind: 'napStart', id: 99, building: 99 }], stage(), 0, null, VIEW)
    expect(fx.alive).toBe(0)
  })
})

describe("the song's notes", () => {
  /** How many notes set off over `bars` bars of the band with the state as `setup` leaves it and `ghost` held up, and the colours they are drawn in. */
  function heldNotes(setup: (s: State) => void, bars: number, ghost: HeldGhost | null): { n: number; colours: Set<string> } {
    const fx = new Effects()
    const s = stage()
    s.munchers = []
    s.found = ['digger', 'gold', 'science', 'gears']
    // A working digger on burrow A's flowers.
    const d = s.buildings.find((b) => b.id === 11)!
    d.x = 9
    d.y = 2
    d.batch = { makes: 'blueRock', at: 0, until: 1e9 }
    setup(s)
    let n = 0
    let was = 0
    const seen = new Set<string>()
    for (let tick = 0; tick < bars * 8 * HOP; tick++) {
      s.tick = tick
      fx.spawn([], s, tick * STEP, ghost, VIEW)
      fx.update(STEP)
      if (fx.alive > was) {
        n += fx.alive - was
        for (const c of colours((ctx) => fx.draw(ctx, tick * STEP, 0))) seen.add(c)
      }
      was = fx.alive
    }
    return { n, colours: seen }
  }
  const notes = (setup: (s: State) => void, bars: number) => heldNotes(setup, bars, null).n

  it('come one a bar from a working machine on the flowers to a burrow that is listening', () => {
    expect(notes(() => {}, 6)).toBe(6)
  })

  it('stop for a burrow asleep, still asleep until Gears!, out visiting, not yet on the board, or with its munchers switched to few or none, and for a machine not working', () => {
    expect(notes((s) => (s.burrows[0]!.sleepUntil = 1e6), 4)).toBe(0)
    expect(notes((s) => (s.found = ['digger', 'gold', 'science']), 4)).toBe(0)
    // Out visiting: its visit is on and a muncher of it sits on a belt.
    expect(
      notes((s) => {
        s.munchers.push(sitter(1, 0, 6, 7))
        s.visit = { burrow: 0, at: 0, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
      }, 4),
    ).toBe(0)
    expect(notes((s) => (s.switches.munchers = 'none'), 4)).toBe(0)
    expect(notes((s) => (s.switches.munchers = 'few'), 4)).toBe(0)
    expect(notes((s) => (s.switches.munchers = 'polite'), 4)).toBe(4)
    expect(notes((s) => (s.buildings.find((b) => b.id === 11)!.napper = 3), 4)).toBe(0)
    expect(notes((s) => (s.buildings.find((b) => b.id === 11)!.batch = null), 4)).toBe(0)
    expect(notes((s) => (s.burrows[0]!.hunger = 999), 4)).toBe(0)
    // A machine by burrow B's flowers sings to it only once Nose! is found.
    const byB = (s: State) => {
      const d = s.buildings.find((b) => b.id === 11)!
      d.x = 11
      d.y = 8
    }
    expect(notes(byB, 4)).toBe(0)
    expect(
      notes((s) => {
        byB(s)
        s.found.push('nose')
      }, 4),
    ).toBe(4)
  })

  it('come every other bar while munchers are out from another burrow', () => {
    expect(
      notes((s) => {
        s.found.push('nose')
        s.munchers.push(sitter(1, 1, 14, 9))
        s.visit = { burrow: 1, at: 0, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
      }, 6),
    ).toBe(3)
  })

  it('come from a machine she holds up where it would wake a burrow, paler, so a spot\'s cost shows before she places it', () => {
    // The working digger moved off the flowers: only the held sticker can sing.
    const off = (s: State) => {
      const d = s.buildings.find((b) => b.id === 11)!
      d.x = 3
      d.y = 2
    }
    const onFlowers = heldNotes(off, 6, { sticker: 'greenMaker', x: 9, y: 2 })
    expect(onFlowers.n).toBe(6)
    expect(onFlowers.colours.has(C.ghostNote)).toBe(true)
    expect(onFlowers.colours.has(LAND.petal)).toBe(false)
    // A held tower or bowl never works, so it sings nothing; nor a machine far from every burrow, nor one by a burrow still asleep.
    expect(heldNotes(off, 4, { sticker: 'tower', x: 9, y: 2 }).n).toBe(0)
    expect(heldNotes(off, 4, { sticker: 'greenMaker', x: 3, y: 6 }).n).toBe(0)
    expect(heldNotes((s) => (off(s), (s.found = ['digger', 'gold', 'science'])), 4, { sticker: 'greenMaker', x: 9, y: 2 }).n).toBe(0)
    // Held beside a working machine of the board's, both sing.
    expect(heldNotes(() => {}, 4, { sticker: 'oven', x: 9, y: 4 }).n).toBe(8)
  })

  it('come from the drumming pad to every listening burrow from Rocket! on', () => {
    expect(
      notes((s) => {
        s.buildings.find((b) => b.id === 11)!.batch = null
        s.found = [...s.found, 'rocket']
      }, 4),
    ).toBe(4)
  })
})

describe("the hint's ring", () => {
  it('draws clean at every size, round its thing, a little smaller while the thing is up', () => {
    const { ctx, check, measure } = fakeContext()
    for (const px of [20, 50, 120]) {
      pen.ppm = px
      for (const t of [0, 0.2, 0.4, 0.73, 913.7]) check(`ring at ${px} px, ${t} s`, () => drawHintRing(ctx, 0.36, t), 'none')
    }
    const down = measure(() => drawHintRing(ctx, 0.4, 0))
    const up = measure(() => drawHintRing(ctx, 0.4, 0.4))
    expect(up.x1 - up.x0).toBeLessThan(down.x1 - down.x0)
    expect(hintLift(0)).toBe(0)
    expect(hintLift(0.4)).toBeCloseTo(0.2, 9)
    expect(hintLift(0.8)).toBeCloseTo(0, 9)
  })
})

describe('the effects sheet', () => {
  it('draws every entry, running and frozen', () => {
    const { ctx, check } = fakeContext()
    for (const entry of SHEET()) {
      for (const t of [0, 0.4, 0.9, 1.6, 3.3]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
      check(`${entry.label} frozen`, () => entry.draw(ctx, 0.7), 'none')
    }
  })
})
