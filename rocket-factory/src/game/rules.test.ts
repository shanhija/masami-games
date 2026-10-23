/**
 * The rules, one action at a time on the designed board with small layouts built by hand: taps
 * by what they hit and the tool in hand (the peel's two taps), drags and their release with
 * every tool (a grey ghost, a drop for each kind of drag, the old last cell a stroke rolls up),
 * Oops, the digs, the tray, the card's close, the launch's whole timeline and the stickers after
 * it, Good night from dusk to sleep and morning, sessions, a fresh game, the choice and the
 * flaps. Taps go through `act` with the hits layout.hitTest gives, as the router sends them.
 */
import { describe, expect, it } from 'vitest'

import { NIGHT_LEAD, LIFTOFF } from './band'
import { BEEP_HOME } from './beep'
import { add, line, put } from './beltKit'
import { BURROWS, LANDS, PAD, cellOf } from './board'
import { rebuild } from './belts'
import { viewAt } from './camera'
import { BEEP_REST, CARD_FOR, CARD_IDLE, COUNT_AT, DIG_GAP, HELLO_SLEEP, HOLD, LAUNCH_FOR, LIFT_WAIT, NIGHT_TUCK, PART_INFO, SIZE, STACK, STICKER_WORD, UNDO_FOR, UNDO_MAX } from './catalog'
import { NO_INSETS, pick, pictureSpot, toScreen } from './layout'
import { CARDS, HOP, PARTS, STEP, inSlot, outSlot, thingIndex, ticks, type Action, type Dir, type EventKind, type Hit, type SimEvent, type State, type Tool } from './model'
import { next } from './random'
import { act, cloneState, launchReady, newGame, step } from './rules'
import { stickersLeft } from './strokes'
import { Router } from './touch'
import { basketPoint, heapPoint, moonyPoint, slotPoint, stackBox } from './where'

const E: Dir = 0
const W: Dir = 2
const N: Dir = 3
const c = cellOf
/** How often the hint looks again (rules.step, every half second). */
const HINT_LOOK = ticks(0.5)

/** A fresh game one step in, so the next step is no hop tick: nothing on a belt moves and no machine starts until the 20th. */
function game(): State {
  const s = newGame(1)
  step(s)
  return s
}
/** Steps n times; every event on the way. */
function run(s: State, n: number): SimEvent[] {
  const out: SimEvent[] = []
  for (let k = 0; k < n; k++) {
    step(s)
    out.push(...s.events)
  }
  return out
}
/** Steps n times; the events of these kinds, each with the tick of the step it came in. */
function timeline(s: State, n: number, kinds: readonly EventKind[]): [number, SimEvent][] {
  const out: [number, SimEvent][] = []
  for (let k = 0; k < n; k++) {
    const tick = s.tick
    step(s)
    for (const e of s.events) if (kinds.includes(e.kind)) out.push([tick, e])
  }
  return out
}
/** One action and the step after it: what the action reports comes out first in that step. */
const doing = (s: State, a: Action) => {
  act(s, a)
  return run(s, 1)
}
const tapOn = (s: State, hit: Hit) => doing(s, { kind: 'tap', hit })
const of = <K extends EventKind>(events: readonly SimEvent[], kind: K) => events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind)
/** A stroke drawn over these cells and lifted. */
const stroke = (s: State, cells: number[]) => {
  act(s, { kind: 'drag', cells })
  return doing(s, { kind: 'release', commit: true })
}
/** A belt cell's sides as [in, out, fork, over], or null. */
const belt = (s: State, x: number, y: number) => {
  const k = c(x, y)
  return s.belts.out[k]! < 0 ? null : [s.belts.in[k], s.belts.out[k], s.belts.fork[k], s.belts.over[k]]
}
/** The layout Oops restores: every belt cell's sides and pattern, the hedges, the buildings where they stand. */
const layout = (s: State) =>
  JSON.stringify({
    b: [s.belts.in, s.belts.out, s.belts.fork, s.belts.over, s.belts.pattern].map((a) => Array.from(a)),
    h: Array.from(s.hedge),
    k: s.buildings.map((b) => [b.id, b.kind, b.x, b.y]).sort(),
  })
const oven = (s: State) => s.buildings.find((b) => b.id === 1)!

describe('the events', () => {
  it('of an action wait in the queue and come out first in the next step', () => {
    const s = game()
    act(s, { kind: 'tap', hit: { kind: 'ground', cell: c(4, 3) } })
    expect(s.events).toEqual([])
    expect(s.queued).toEqual([{ kind: 'poke', what: 'ground', x: 4.5, y: 3.5 }])
    step(s)
    expect(s.events[0]).toEqual({ kind: 'poke', what: 'ground', x: 4.5, y: 3.5 })
    expect(s.queued).toEqual([])
  })
})

describe('a tap', () => {
  it('pokes the ground, a tree and flowers, and Beep looks over at the ground that puffed', () => {
    const s = game()
    expect(of(tapOn(s, { kind: 'tree', cell: c(8, 8) }), 'poke')).toEqual([{ kind: 'poke', what: 'tree', x: 8.5, y: 8.5 }])
    expect(of(tapOn(s, { kind: 'flowers', cell: c(11, 4) }), 'poke')).toEqual([{ kind: 'poke', what: 'flowers', x: 11.5, y: 4.5 }])
    s.beep.facing = -1
    expect(of(tapOn(s, { kind: 'ground', cell: c(4, 3) }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: 4.5, y: 3.5 }])
    expect(s.beep.facing).toBe(1)
  })

  it('digs once on a patch or the pond with the peel, as a touch there digs', () => {
    const s = game()
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(of(tapOn(s, { kind: 'patch', cell: c(7, 2) }), 'dig')).toEqual([{ kind: 'dig', cell: c(7, 2), thing: 'blueRock' }])
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.digging).toBeNull()
    // Nothing on this board ever takes a bubble: Beep points at nothing and nothing is dug.
    expect(of(tapOn(s, { kind: 'pond', cell: c(0, 8) }), 'full')).toEqual([{ kind: 'full', cell: c(0, 8), id: -1 }])
    expect(s.basket.every((n) => n === 0)).toBe(true)
    expect(s.tool).toEqual({ kind: 'peel' })
  })

  it('shakes a hedge with the pencil, and the peel takes it back at once, one use', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    s.hedge[c(5, 3)] = 1
    expect(of(tapOn(s, { kind: 'hedge', cell: c(5, 3) }), 'poke')).toEqual([{ kind: 'poke', what: 'tree', x: 5.5, y: 3.5 }])
    expect(s.hedge[c(5, 3)]).toBe(1)
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    const left = stickersLeft(s, 'hedge')
    expect(of(tapOn(s, { kind: 'hedge', cell: c(5, 3) }), 'rollUp')).toEqual([{ kind: 'rollUp', cells: [c(5, 3)] }])
    expect(s.hedge[c(5, 3)]).toBe(0)
    expect(stickersLeft(s, 'hedge')).toBe(left + 1)
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.undo.length).toBe(1)
  })

  it('hops an empty belt; with the peel the first tap lifts its run and a second on the run rolls it up', () => {
    const s = game()
    const cells = line(s, [
      [4, 3],
      [5, 3],
      [6, 3],
    ])
    rebuild(s)
    put(s, outSlot(cells[1]!), 'blueRock')
    expect(of(tapOn(s, { kind: 'belt', cell: cells[0]! }), 'poke')).toEqual([{ kind: 'poke', what: 'belt', x: 4.5, y: 3.5 }])
    // A belt with things on it leaves the answer to its things.
    expect(of(tapOn(s, { kind: 'belt', cell: cells[1]! }), 'poke')).toEqual([])
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(of(tapOn(s, { kind: 'belt', cell: cells[0]! }), 'lift')).toEqual([{ kind: 'lift', x: 4.5, y: 3.5 }])
    expect(s.lifted).toEqual({ kind: 'run', cells, at: s.tick - 1 })
    expect(cells.map((x) => s.belts.out[x])).toEqual([E, E, E])
    const events = tapOn(s, { kind: 'belt', cell: cells[2]! })
    expect(of(events, 'rollUp')).toEqual([{ kind: 'rollUp', cells }])
    expect(cells.map((x) => s.belts.out[x])).toEqual([-1, -1, -1])
    // What rode the run went where it is wanted.
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.lifted).toBeNull()
    expect(s.undo.length).toBe(1)
  })

  it('moves the peel lifted from one run to another, and puts it down on a tap elsewhere', () => {
    const s = game()
    const a = line(s, [
      [4, 3],
      [5, 3],
    ])
    const b = line(s, [
      [4, 8],
      [5, 8],
    ])
    rebuild(s)
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    tapOn(s, { kind: 'belt', cell: a[0]! })
    tapOn(s, { kind: 'belt', cell: b[1]! })
    expect(s.lifted).toMatchObject({ kind: 'run', cells: b })
    expect(belt(s, 4, 3)).toEqual([W, E, -1, -1])
    tapOn(s, { kind: 'ground', cell: c(6, 5) })
    expect(s.lifted).toBeNull()
    expect(s.tool).toEqual({ kind: 'peel' })
  })

  it('carries a thing off its belt where it is wanted; one that hopped on leaves its belt to answer; with the peel it lifts the run', () => {
    const s = game()
    const cells = line(s, [
      [4, 3],
      [5, 3],
    ])
    rebuild(s)
    put(s, inSlot(cells[0]!), 'blueRock')
    const from = slotPoint(s.belts, inSlot(cells[0]!))
    const events = tapOn(s, { kind: 'thing', slot: inSlot(cells[0]!) })
    expect(of(events, 'carry')).toEqual([{ kind: 'carry', thing: 'blueRock', x: from.x, y: from.y }])
    expect(s.belts.slot[inSlot(cells[0]!)]).toBe(-1)
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.flights).toEqual([expect.objectContaining({ thing: 'blueRock', x0: from.x, y0: from.y, x1: 7, y1: 7 })])
    expect(s.beep).toMatchObject({ x: from.x, y: from.y, pose: 'carry', carrying: 'blueRock' })
    expect(of(tapOn(s, { kind: 'thing', slot: inSlot(cells[0]!) }), 'poke')).toEqual([{ kind: 'poke', what: 'belt', x: 4.5, y: 3.5 }])
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    put(s, inSlot(cells[1]!), 'gear')
    tapOn(s, { kind: 'thing', slot: inSlot(cells[1]!) })
    expect(s.lifted).toMatchObject({ kind: 'run', cells })
    expect(s.belts.slot[inSlot(cells[1]!)]).toBe(thingIndex('gear'))
  })

  it("shows a building's recipe with the pencil; the peel lifts it, then peels it off with everything inside sent where wanted", () => {
    const s = game()
    s.found.push('digger', 'gold', 'science')
    const green = add(s, 'greenMaker', 4, 2)
    rebuild(s)
    green.held[thingIndex('blueBar')] = 2
    green.held[thingIndex('goldBar')] = 1
    green.stack.push('greenBottle')
    expect(stickersLeft(s, 'greenMaker')).toBe(0)
    expect(of(tapOn(s, { kind: 'building', id: green.id }), 'recipe')).toEqual([{ kind: 'recipe', id: green.id }])
    expect(green.tapAt).toBe(s.tick - 1)
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(of(tapOn(s, { kind: 'building', id: green.id }), 'lift')).toEqual([{ kind: 'lift', x: 5, y: 3 }])
    expect(s.lifted).toEqual({ kind: 'building', id: green.id, at: s.tick - 1 })
    const events = tapOn(s, { kind: 'building', id: green.id })
    expect(of(events, 'peel')).toEqual([{ kind: 'peel', id: green.id, sticker: 'greenMaker' }])
    expect(s.buildings.some((b) => b.id === green.id)).toBe(false)
    expect(stickersLeft(s, 'greenMaker')).toBe(1)
    // The blue bars went to the rocket's legs; the gold bar and the bottle, wanted nowhere yet, to the basket.
    expect(s.rocket.got[0]).toBe(2)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    expect(s.basket[thingIndex('greenBottle')]).toBe(1)
    expect(s.beep).toMatchObject({ x: 5, y: 4, pose: 'pat' })
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.lifted).toBeNull()
  })

  it('never peels the pad: it wiggles grey', () => {
    const s = game()
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(of(tapOn(s, { kind: 'building', id: 0 }), 'poke')).toEqual([{ kind: 'poke', what: 'grey', x: PAD.x + 1.5, y: PAD.y + 1.5 }])
    expect(of(tapOn(s, { kind: 'building', id: 0 }), 'peel')).toEqual([])
    expect(s.lifted).toBeNull()
    expect(s.buildings.some((b) => b.kind === 'pad')).toBe(true)
  })

  it('carries a roof stack where its line leads and a whole heap where they are wanted, and from the basket only what something wants', () => {
    const s = game()
    const o = oven(s)
    // The oven's belt into the pad: its roof's things go where its line leads, else into the basket.
    stroke(s, [c(6, 6), c(5, 6), c(4, 6), c(3, 6)])
    o.stack.push('blueBar', 'goldBar')
    tapOn(s, { kind: 'stack', id: o.id })
    expect(o.stack).toEqual([])
    expect(s.rocket.got[0]).toBe(1)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    // A stack that went out since the frame she tapped: the oven shows its recipe instead.
    expect(of(tapOn(s, { kind: 'stack', id: o.id }), 'recipe')).toEqual([{ kind: 'recipe', id: o.id }])
    s.burrows[1]!.heap[thingIndex('blueBar')] = 2
    expect(of(tapOn(s, { kind: 'heap', burrow: 1 }), 'carry')).toEqual([{ kind: 'carry', thing: 'blueBar', x: heapPoint(1).x, y: heapPoint(1).y }])
    expect(s.burrows[1]!.heap.every((n) => n === 0)).toBe(true)
    expect(s.rocket.got[0]).toBe(3)
    // A heap gone since the frame (a first picnic sends it home) only puffs.
    expect(of(tapOn(s, { kind: 'heap', burrow: 1 }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: heapPoint(1).x, y: heapPoint(1).y }])
    // The gold bar waits in the basket until a green maker wants one.
    expect(of(tapOn(s, { kind: 'basket' }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: basketPoint.x, y: basketPoint.y }])
    s.found.push('digger', 'gold', 'science')
    const green = add(s, 'greenMaker', 4, 2)
    rebuild(s)
    expect(of(tapOn(s, { kind: 'basket' }), 'carry')).toHaveLength(1)
    expect(s.basket[thingIndex('goldBar')]).toBe(0)
    expect(green.held[thingIndex('goldBar')]).toBe(1)
  })

  it("shows a burrow's paw prints, flips Beep with a tune and pokes Moony", () => {
    const s = game()
    const events = tapOn(s, { kind: 'burrow', burrow: 0 })
    expect(s.burrows[0]!.pawsAt).toBe(s.tick - 1)
    expect(of(events, 'poke')).toEqual([{ kind: 'poke', what: 'burrow', x: BURROWS[0]!.x + 1, y: BURROWS[0]!.y + 1 }])
    expect(of(tapOn(s, { kind: 'beep' }), 'poke')).toEqual([{ kind: 'poke', what: 'beep', x: BEEP_HOME.x, y: BEEP_HOME.y }])
    expect(s.beep.pose).toBe('flip')
    expect(of(tapOn(s, { kind: 'moony' }), 'poke')).toEqual([{ kind: 'poke', what: 'moony', x: moonyPoint.x, y: moonyPoint.y }])
  })

  it('opens the flaps after a Land! card, lifts their corner before one, and finds none at land 3', () => {
    const s = game()
    const l = LANDS[1]
    expect(of(tapOn(s, { kind: 'flap' }), 'poke')).toEqual([{ kind: 'poke', what: 'flap', x: l.x1 + 1, y: l.y0 }])
    expect(s.land).toBe(1)
    s.flap = 2
    const at = s.tick
    expect(of(tapOn(s, { kind: 'flap' }), 'flap')).toEqual([{ kind: 'flap', land: 2 }])
    expect([s.land, s.landFrom, s.landAt, s.flap]).toEqual([2, 1, at, 0])
    expect(s.burrows[1]).toMatchObject({ helloAt: at, sleepUntil: at + HELLO_SLEEP })
    expect(s.burrows[2]!.helloAt).toBe(-1)
    // Her drag on them folds them open the same way.
    s.flap = 3
    expect(of(doing(s, { kind: 'flap' }), 'flap')).toEqual([{ kind: 'flap', land: 3 }])
    expect(s.land).toBe(3)
    expect(() => act(s, { kind: 'flap' })).toThrow()
  })

  it("places the hint's ghost on its spot, and a late tap after the hint moved on places nothing", () => {
    const s = game()
    s.found.push('digger')
    s.hint = { step: { kind: 'place', sticker: 'digger', x: 7, y: 2 }, at: s.tick }
    expect(of(tapOn(s, { kind: 'spot' }), 'place')).toEqual([{ kind: 'place', id: 2, sticker: 'digger' }])
    expect(s.buildings.find((b) => b.id === 2)).toMatchObject({ kind: 'digger', x: 7, y: 2 })
    expect(s.tool).toEqual({ kind: 'pencil' })
    s.hint = null
    expect(of(tapOn(s, { kind: 'spot' }), 'place')).toEqual([])
  })

  it('answers a tap on what her other hand took away since the finger went down: a building or its stack does nothing, a hedge or a belt puffs the ground', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    // The peel takes the start oven off; a belt and a hedge she laid go with Oops.
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    tapOn(s, { kind: 'building', id: 1 })
    tapOn(s, { kind: 'building', id: 1 })
    expect(s.buildings.some((b) => b.id === 1)).toBe(false)
    stroke(s, [c(4, 3), c(5, 3)])
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    tapOn(s, { kind: 'ground', cell: c(6, 3) })
    expect([belt(s, 5, 3), s.hedge[c(6, 3)]]).toEqual([[W, E, -1, -1], 1])
    act(s, { kind: 'oops' })
    act(s, { kind: 'oops' })
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    run(s, 1)
    const before = layout(s)
    // Taps the router read at the down, before those went: nothing to answer for the oven, the ground puffs where the belt and the hedge were, and the peel is still in hand.
    for (const kind of ['building', 'stack'] as const) expect(tapOn(s, { kind, id: 1 })).toEqual([])
    expect(of(tapOn(s, { kind: 'belt', cell: c(4, 3) }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: 4.5, y: 3.5 }])
    expect(of(tapOn(s, { kind: 'thing', slot: outSlot(c(5, 3)) }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: 5.5, y: 3.5 }])
    expect(of(tapOn(s, { kind: 'hedge', cell: c(6, 3) }), 'poke')).toEqual([{ kind: 'poke', what: 'ground', x: 6.5, y: 3.5 }])
    expect([s.tool, s.lifted, layout(s)]).toEqual([{ kind: 'peel' }, null, before])
  })

  it('lets the finger go through the real router when her other hand took away what it went down on: a new oven, its roof stack, a hedge under the peel, each taken back by Oops before the lift', () => {
    for (const what of ['building', 'stack', 'hedge'] as const) {
      const s = game()
      s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
      const router = new Router((a) => act(s, a))
      const view = viewAt(s, s.tick * STEP, 1180, 820, 2, true, NO_INSETS)
      const t = s.tick * STEP
      let at: [number, number]
      if (what === 'hedge') {
        act(s, { kind: 'tool', tool: { kind: 'hedge' } })
        act(s, { kind: 'tap', hit: { kind: 'ground', cell: c(6, 3) } })
        act(s, { kind: 'tool', tool: { kind: 'peel' } })
        at = toScreen(view, 6.5, 3.5)
      } else {
        act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'oven' } })
        act(s, { kind: 'hold', x: 6, y: 9 })
        act(s, { kind: 'release', commit: true })
        const b = s.buildings.at(-1)!
        expect([b.kind, b.x, b.y]).toEqual(['oven', 5, 8])
        b.stack.push('blueBar')
        const st = stackBox(b)
        at = what === 'stack' ? pictureSpot(view, b.x, b.y, SIZE.oven, st.x + st.w / 2, st.y + st.h / 2) : toScreen(view, 6, 9)
      }
      expect(pick(s, view, ...at, t).hit.kind, what).toBe(what)
      router.down(s, view, 1, ...at, t, 'touch')
      expect(s.touching, what).toBe(true)
      act(s, { kind: 'oops' })
      expect(() => router.up(s, view, 1, ...at, t + 0.2), what).not.toThrow()
      expect(s.touching, what).toBe(false)
      expect([s.buildings.length, s.hedge[c(6, 3)]], what).toEqual([2, 0])
    }
  })

  it('tickles a muncher it lands on, as a touch on the muncher does', () => {
    const s = game()
    s.visit = { burrow: 0, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
    s.munchers.push({ id: 7, burrow: 0, mode: 'walk', modeAt: s.tick, cell: c(9, 5), toward: c(9, 5), stepAt: s.tick, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: ['gear'], grabAt: -1, idleSince: s.tick, outAt: s.tick, scout: false, shotBy: -1 })
    const t = cloneState(s)
    act(s, { kind: 'tap', hit: { kind: 'muncher', id: 7 } })
    act(t, { kind: 'tickle', id: 7 })
    expect(s).toEqual(t)
  })

  it('never comes from the table or from nothing: the router never sends those', () => {
    expect(() => act(game(), { kind: 'tap', hit: { kind: 'table' } })).toThrow()
    expect(() => act(game(), { kind: 'tap', hit: { kind: 'none' } })).toThrow()
  })
})

describe('a drag and its release', () => {
  it('draws a belt with the pencil, laid at the lift with its undo entry, the pencil kept', () => {
    const s = game()
    const cells = [c(6, 6), c(5, 6), c(4, 6), c(3, 6)]
    const at = s.tick
    act(s, { kind: 'drag', cells: cells.slice(0, 2) })
    run(s, 3)
    act(s, { kind: 'drag', cells })
    expect(s.drag).toEqual({ kind: 'stroke', cells, at })
    expect(belt(s, 5, 6)).toBeNull()
    const events = doing(s, { kind: 'release', commit: true })
    expect(of(events, 'lay')).toEqual([{ kind: 'lay', cells: [c(5, 6), c(4, 6)] }])
    expect(belt(s, 5, 6)).toEqual([E, W, -1, -1])
    expect(s.net.next[outSlot(c(4, 6))]).toBe(-2)
    expect(s.drag).toBeNull()
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.undo).toEqual([expect.objectContaining({ at: s.tick - 1, broke: false })])
  })

  it('reports the joins, bridges, forks and turns a stroke makes', () => {
    const s = game()
    line(s, [
      [9, 4],
      [9, 5],
      [9, 6],
      [9, 7],
    ])
    rebuild(s)
    const told = (events: SimEvent[]) => events.filter((e) => e.kind === 'lay' || e.kind === 'repoint' || e.kind === 'join' || e.kind === 'bridge' || e.kind === 'fork' || e.kind === 'rollUp')
    expect(told(stroke(cloneState(s), [c(6, 5), c(7, 5), c(8, 5), c(9, 5)]))).toEqual([
      { kind: 'lay', cells: [c(6, 5), c(7, 5), c(8, 5)] },
      { kind: 'join', cell: c(9, 5) },
    ])
    expect(told(stroke(cloneState(s), [c(7, 4), c(8, 4), c(9, 4), c(10, 4), c(11, 4)]))).toEqual([
      { kind: 'lay', cells: [c(7, 4), c(8, 4), c(10, 4), c(11, 4)] },
      { kind: 'bridge', cell: c(9, 4) },
    ])
    expect(told(stroke(cloneState(s), [c(9, 5), c(10, 5), c(11, 5)]))).toEqual([
      { kind: 'lay', cells: [c(10, 5), c(11, 5)] },
      { kind: 'fork', cell: c(9, 5) },
    ])
    expect(told(stroke(cloneState(s), [c(9, 7), c(9, 6), c(9, 5)]))).toEqual([{ kind: 'repoint', cells: [c(9, 7), c(9, 6), c(9, 5), c(9, 4)] }])
  })

  it("rolls up a dead end's old last cell when a stroke turns the cell before it, its things sent where wanted", () => {
    const s = game()
    line(s, [
      [9, 4],
      [9, 5],
      [9, 6],
      [9, 7],
    ])
    rebuild(s)
    put(s, inSlot(c(9, 7)), 'blueRock')
    const events = stroke(s, [c(9, 6), c(10, 6)])
    expect(of(events, 'rollUp')).toEqual([{ kind: 'rollUp', cells: [c(9, 7)] }])
    expect(of(events, 'repoint')).toEqual([{ kind: 'repoint', cells: [c(9, 6)] }])
    expect(belt(s, 9, 7)).toBeNull()
    expect(belt(s, 9, 6)).toEqual([N, E, -1, -1])
    expect(oven(s).queue).toEqual(['blueRock'])
  })

  it('plants a hedge line with the hedge tool, one use, and a tap plants one where it can', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    act(s, { kind: 'drag', cells: [c(5, 8), c(6, 8), c(7, 8)] })
    expect(s.drag).toMatchObject({ kind: 'hedge' })
    expect(of(doing(s, { kind: 'release', commit: true }), 'hedgeIn')).toEqual([{ kind: 'hedgeIn', cells: [c(5, 8), c(6, 8), c(7, 8)] }])
    expect(stickersLeft(s, 'hedge')).toBe(5)
    expect(s.tool).toEqual({ kind: 'pencil' })
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    // On a tree it can plant nothing: the tree shakes and the tool stays.
    expect(of(tapOn(s, { kind: 'tree', cell: c(8, 8) }), 'poke')).toHaveLength(1)
    expect(s.tool).toEqual({ kind: 'hedge' })
    expect(of(tapOn(s, { kind: 'ground', cell: c(5, 9) }), 'hedgeIn')).toEqual([{ kind: 'hedgeIn', cells: [c(5, 9)] }])
    expect(s.hedge[c(5, 9)]).toBe(1)
    expect(s.tool).toEqual({ kind: 'pencil' })
  })

  it('rolls belts up under a peel drag, one use, what rode them sent where wanted', () => {
    const s = game()
    const cells = line(s, [
      [4, 3],
      [5, 3],
      [6, 3],
    ])
    rebuild(s)
    put(s, inSlot(cells[1]!), 'blueRock')
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    act(s, { kind: 'drag', cells: [cells[0]!, cells[1]!] })
    expect(s.drag).toMatchObject({ kind: 'peel', cells: [cells[0], cells[1]] })
    expect(of(doing(s, { kind: 'release', commit: true }), 'rollUp')).toEqual([{ kind: 'rollUp', cells: [cells[0], cells[1]] }])
    expect([belt(s, 4, 3), belt(s, 5, 3), belt(s, 6, 3)]).toEqual([null, null, [W, E, -1, -1]])
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.tool).toEqual({ kind: 'pencil' })
  })

  it('places a sticker where its ghost was held, says its name the first time, and Beep pats it', () => {
    const s = game()
    s.found.push('digger', 'gold')
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 8.1, y: 3.1 })
    expect(s.drag).toEqual({ kind: 'ghost', sticker: 'digger', x: 8.1, y: 3.1, at: s.tick })
    const events = doing(s, { kind: 'release', commit: true })
    expect(of(events, 'place')).toEqual([{ kind: 'place', id: 2, sticker: 'digger' }])
    expect(of(events, 'say')).toEqual([{ kind: 'say', word: STICKER_WORD.digger }])
    expect(s.buildings.find((b) => b.id === 2)).toMatchObject({ kind: 'digger', x: 7, y: 2, placedAt: s.tick - 1 })
    expect(s.help.placed.digger).toBe(1)
    expect(s.beep).toMatchObject({ x: 8, y: 4, pose: 'pat' })
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.undo.length).toBe(1)
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 10, y: 3 })
    const second = doing(s, { kind: 'release', commit: true })
    expect(of(second, 'place')).toEqual([{ kind: 'place', id: 3, sticker: 'digger' }])
    expect(of(second, 'say')).toEqual([])
    expect(s.help.placed.digger).toBe(2)
  })

  it('flies a grey ghost back to the tray with a boing, nothing placed', () => {
    const s = game()
    s.found.push('digger')
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 6, y: 4 })
    expect(of(doing(s, { kind: 'release', commit: true }), 'nope')).toEqual([{ kind: 'nope', x: 6, y: 4 }])
    expect(s.buildings.length).toBe(2)
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.undo).toEqual([])
    expect(stickersLeft(s, 'digger')).toBe(1)
  })

  it("drops each kind of drag with nothing changed: a ghost's sticker goes back, a stroke, hedge line or peel drag keeps its tool", () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    line(s, [
      [4, 3],
      [5, 3],
    ])
    rebuild(s)
    const before = layout(s)
    const cases: [Tool, Action][] = [
      [{ kind: 'pencil' }, { kind: 'drag', cells: [c(6, 4), c(7, 4)] }],
      [{ kind: 'hedge' }, { kind: 'drag', cells: [c(6, 4), c(7, 4)] }],
      [{ kind: 'peel' }, { kind: 'drag', cells: [c(4, 3), c(5, 3)] }],
      [{ kind: 'sticker', sticker: 'digger' }, { kind: 'hold', x: 8, y: 3 }],
    ]
    for (const [tool, a] of cases) {
      if (s.tool.kind !== tool.kind) act(s, { kind: 'tool', tool })
      act(s, a)
      expect(s.drag).not.toBeNull()
      const events = doing(s, { kind: 'release', commit: false })
      expect(s.drag).toBeNull()
      expect(events.filter((e) => e.kind === 'lay' || e.kind === 'hedgeIn' || e.kind === 'rollUp' || e.kind === 'place' || e.kind === 'nope')).toEqual([])
      expect(layout(s)).toBe(before)
      expect(s.tool).toEqual(tool.kind === 'sticker' ? { kind: 'pencil' } : tool)
    }
    expect(s.undo).toEqual([])
    // A release with the drag already gone (dropped by a turn) does nothing.
    expect(doing(s, { kind: 'release', commit: true }).filter((e) => e.kind !== 'batch')).toEqual([])
  })

  it('keeps a drag by the tool in hand from its first tick, and a ghost only for a picked sticker', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    const at = s.tick
    act(s, { kind: 'drag', cells: [c(5, 8), c(6, 8)] })
    run(s, 2)
    act(s, { kind: 'drag', cells: [c(5, 8), c(6, 8), c(7, 8)] })
    expect(s.drag).toEqual({ kind: 'hedge', cells: [c(5, 8), c(6, 8), c(7, 8)], at })
    // A sticker picked by its key mid-drag drops it, and the rest of the drag draws nothing.
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    expect(s.drag).toBeNull()
    act(s, { kind: 'drag', cells: [c(5, 8), c(6, 8), c(7, 8), c(7, 9)] })
    expect(s.drag).toBeNull()
    act(s, { kind: 'hold', x: 8, y: 3 })
    expect(s.drag).toMatchObject({ kind: 'ghost', sticker: 'digger' })
    act(s, { kind: 'tool', tool: { kind: 'pencil' } })
    expect(s.drag).toBeNull()
    act(s, { kind: 'hold', x: 8, y: 3 })
    expect(s.drag).toBeNull()
  })
})

describe('Oops', () => {
  it('undoes the newest edit first, back to the layout before them all, what rode removed cells sent where wanted', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science', 'gears', 'hedges')
    const start = layout(s)
    stroke(s, [c(6, 6), c(5, 6), c(4, 6), c(3, 6)])
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 8.1, y: 3.1 })
    doing(s, { kind: 'release', commit: true })
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    stroke(s, [c(5, 8), c(6, 8)])
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    stroke(s, [c(5, 6)])
    expect(s.undo.length).toBe(4)
    expect(belt(s, 5, 6)).toBeNull()
    put(s, inSlot(c(4, 6)), 'blueBar')
    const undo = () => doing(s, { kind: 'oops' }).filter((e) => e.kind !== 'batch' && e.kind !== 'push' && e.kind !== 'gulp' && e.kind !== 'fill')
    expect(undo()).toEqual([{ kind: 'oops' }, { kind: 'lay', cells: [c(5, 6)] }])
    expect(undo()).toEqual([{ kind: 'oops' }, { kind: 'rollUp', cells: [c(6, 8), c(5, 8)] }])
    expect(undo()).toEqual([{ kind: 'oops' }, { kind: 'peel', id: 2, sticker: 'digger' }])
    expect(undo()).toEqual([{ kind: 'oops' }, { kind: 'rollUp', cells: [c(4, 6), c(5, 6)] }])
    expect(layout(s)).toBe(start)
    // The blue bar that rode the last stroke went to the rocket's legs, whether it hopped in or was sent.
    expect(s.rocket.got[0]).toBe(1)
    expect(s.undo).toEqual([])
    // Nothing left to undo: Oops is grey and does nothing.
    expect(undo()).toEqual([])
  })

  it('puts back a peeled building and takes back a placed one, each stand where it stood', () => {
    const s = game()
    s.found.push('digger', 'gold', 'science')
    const green = add(s, 'greenMaker', 4, 2)
    rebuild(s)
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    tapOn(s, { kind: 'building', id: green.id })
    tapOn(s, { kind: 'building', id: green.id })
    expect(s.buildings.some((b) => b.id === green.id)).toBe(false)
    expect(of(doing(s, { kind: 'oops' }), 'place')).toEqual([{ kind: 'place', id: green.id, sticker: 'greenMaker' }])
    expect(s.buildings.find((b) => b.id === green.id)).toMatchObject({ kind: 'greenMaker', x: 4, y: 2 })
    expect(stickersLeft(s, 'greenMaker')).toBe(0)
  })

  it('keeps at most UNDO_MAX edits, each for UNDO_FOR', () => {
    const s = game()
    line(s, [
      [4, 3],
      [5, 3],
      [6, 3],
    ])
    rebuild(s)
    // Turning the belt round and back again: every stroke is one edit.
    for (let i = 0; i < UNDO_MAX + 2; i++) stroke(s, i % 2 === 0 ? [c(6, 3), c(5, 3)] : [c(4, 3), c(5, 3)])
    expect(s.undo.length).toBe(UNDO_MAX)
    const newest = s.undo[s.undo.length - 1]!.at
    run(s, newest + UNDO_FOR - s.tick)
    expect(s.undo.length).toBe(1)
    run(s, 1)
    expect(s.undo).toEqual([])
  })

  it('drops the events of a building it takes off that still wait in the queue', () => {
    const s = game()
    s.found.push('digger')
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 8, y: 3 })
    act(s, { kind: 'release', commit: true })
    act(s, { kind: 'tap', hit: { kind: 'building', id: 2 } })
    act(s, { kind: 'oops' })
    expect(s.queued.some((e) => (e.kind === 'place' || e.kind === 'recipe') && e.id === 2)).toBe(false)
    expect(s.queued).toContainEqual({ kind: 'peel', id: 2, sticker: 'digger' })
  })
})

describe('a dig', () => {
  it('digs a rock at the touch for the oven that wants it, again every DIG_GAP while held, then Beep points at the full oven', () => {
    const s = game()
    const cell = c(7, 2)
    // A full roof: the oven bakes nothing, so the rocks Beep digs wait in its queue.
    oven(s).stack.push(...Array<'blueBar'>(STACK).fill('blueBar'))
    const at = s.tick
    act(s, { kind: 'dig', cell, down: true })
    expect(s.digging).toEqual({ cell, at })
    expect(s.beep).toMatchObject({ x: 7.5, y: 2.5, pose: 'dig' })
    const digs = timeline(s, 4 * DIG_GAP + 1, ['dig', 'full'])
    expect(digs).toEqual([
      [at, { kind: 'dig', cell, thing: 'blueRock' }],
      [at + DIG_GAP, { kind: 'dig', cell, thing: 'blueRock' }],
      [at + 2 * DIG_GAP, { kind: 'dig', cell, thing: 'blueRock' }],
      [at + 3 * DIG_GAP, { kind: 'dig', cell, thing: 'blueRock' }],
      [at + 4 * DIG_GAP, { kind: 'full', cell, id: 1 }],
    ])
    expect(oven(s).queue.length).toBe(HOLD)
    expect(s.beep).toMatchObject({ pose: 'point', facing: -1 })
    // Still held and still full: Beep goes on pointing, quietly, and stays at the patch.
    expect(timeline(s, 3 * DIG_GAP + BEEP_REST, ['dig', 'full'])).toEqual([])
    expect(s.beep).toMatchObject({ x: 7.5, y: 2.5, pose: 'point' })
    // Room again: it digs at once.
    oven(s).queue.length = 0
    expect(of(run(s, 1), 'dig')).toHaveLength(1)
    act(s, { kind: 'dig', cell, down: false })
    expect(s.digging).toBeNull()
    expect(of(run(s, 2 * DIG_GAP), 'dig')).toEqual([])
    expect(s.basket.every((n) => n === 0)).toBe(true)
  })

  it('with nothing wanting the rock: nothing is dug and Beep points at the nearest building that ever takes one', () => {
    const s = game()
    oven(s).queue.push('blueRock', 'blueRock', 'blueRock', 'blueRock')
    const events = doing(s, { kind: 'dig', cell: c(9, 3), down: true })
    expect(of(events, 'full')).toEqual([{ kind: 'full', cell: c(9, 3), id: 1 }])
    expect(of(events, 'dig')).toEqual([])
    expect(s.beep).toMatchObject({ x: 9.5, y: 3.5, pose: 'point', facing: -1 })
    expect(oven(s).queue.length).toBe(HOLD)
    expect(s.basket.every((n) => n === 0)).toBe(true)
    expect(s.flights).toEqual([])
  })
})

describe('the tray', () => {
  it('picks a tool, gives the pencil back on a tap on the picked one, and puts down what the peel lifted', () => {
    const s = game()
    s.found.push('digger')
    expect(of(doing(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } }), 'tool')).toHaveLength(1)
    expect(s.tool).toEqual({ kind: 'sticker', sticker: 'digger' })
    doing(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    expect(s.tool).toEqual({ kind: 'pencil' })
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    tapOn(s, { kind: 'building', id: 1 })
    expect(s.lifted).not.toBeNull()
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(s.lifted).toBeNull()
    expect(s.tool).toEqual({ kind: 'pencil' })
    // Picking another tool drops a ghost, whose sticker goes back.
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 8, y: 3 })
    act(s, { kind: 'tool', tool: { kind: 'peel' } })
    expect(s.drag).toBeNull()
    expect(s.tool).toEqual({ kind: 'peel' })
  })

  it('only wiggles a used-up sticker or hedge, grey, and keeps the tool in hand', () => {
    const s = game()
    expect(stickersLeft(s, 'oven')).toBe(0)
    expect(of(doing(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'oven' } }), 'poke')).toEqual([{ kind: 'poke', what: 'grey', x: basketPoint.x, y: basketPoint.y }])
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(of(doing(s, { kind: 'tool', tool: { kind: 'hedge' } }), 'poke')).toHaveLength(1)
    expect(s.tool).toEqual({ kind: 'pencil' })
  })

  it("turns the pencil's pattern round the patterns found", () => {
    const s = game()
    expect(of(doing(s, { kind: 'pattern' }), 'pattern')).toEqual([{ kind: 'pattern', pattern: 0 }])
    s.patterns = 3
    const seen = [0, 0, 0].map(() => {
      act(s, { kind: 'pattern' })
      return s.pattern
    })
    expect(seen).toEqual([1, 2, 0])
    stroke(s, [c(4, 3), c(5, 3)])
    expect(s.belts.pattern[c(4, 3)]).toBe(0)
    act(s, { kind: 'pattern' })
    stroke(s, [c(4, 8), c(5, 8)])
    expect(s.belts.pattern[c(4, 8)]).toBe(1)
  })
})

describe('a card', () => {
  /** A game with a card coming up now, after her touch `ago` ticks back (null: no touch ever). */
  function carded(ago: number | null): State {
    const s = game()
    if (ago !== null) {
      act(s, { kind: 'touch', down: true })
      act(s, { kind: 'touch', down: false })
      run(s, ago)
    }
    s.found.push('digger')
    s.card = { id: 'digger', at: s.tick }
    return s
  }

  it('closes CARD_FOR after it came when she has been touching the board, Beep cheering meanwhile', () => {
    const s = carded(ticks(10))
    const at = s.tick
    const up = timeline(s, CARD_FOR, ['cardClosed'])
    expect(up).toEqual([])
    expect(s.cardWaits).toBe(false)
    // Beep cheers under the confetti while the card is up, longer than any job's rest.
    expect(s.beep).toMatchObject({ pose: 'cheer', poseAt: at })
    expect(timeline(s, 1, ['cardClosed'])).toEqual([[at + CARD_FOR, { kind: 'cardClosed', id: 'digger' }]])
    expect(s.card).toBeNull()
    expect(s.cardClosedAt).toBe(at + CARD_FOR)
    // Closed, the cheer rests like any job: Beep floats home.
    expect(s.beep).toMatchObject({ pose: 'float', x: BEEP_HOME.x, y: BEEP_HOME.y })
  })

  it('waits for a finger down to lift, at most LIFT_WAIT', () => {
    const s = carded(ticks(10))
    const at = s.tick
    act(s, { kind: 'touch', down: true })
    run(s, CARD_FOR + 10)
    expect(s.card).not.toBeNull()
    act(s, { kind: 'touch', down: false })
    expect(timeline(s, 1, ['cardClosed'])).toEqual([[at + CARD_FOR + 10, { kind: 'cardClosed', id: 'digger' }]])
    // A finger that stays down holds it LIFT_WAIT at most.
    const t = carded(ticks(10))
    const tAt = t.tick
    act(t, { kind: 'touch', down: true })
    expect(timeline(t, CARD_FOR + LIFT_WAIT + 1, ['cardClosed'])).toEqual([[tAt + CARD_FOR + LIFT_WAIT, { kind: 'cardClosed', id: 'digger' }]])
  })

  it('stays up until her tap when nobody touched the board for CARD_IDLE before it came', () => {
    for (const s of [carded(null), carded(CARD_IDLE)]) {
      run(s, CARD_FOR + LIFT_WAIT + 60)
      expect(s.card).not.toBeNull()
      expect(s.cardWaits).toBe(true)
      // Her touch now does not close it either: only her tap on it.
      act(s, { kind: 'touch', down: true })
      act(s, { kind: 'touch', down: false })
      run(s, CARD_FOR + 1)
      expect(s.card).not.toBeNull()
      expect(of(doing(s, { kind: 'card' }), 'cardClosed')).toEqual([{ kind: 'cardClosed', id: 'digger' }])
      expect(s.card).toBeNull()
      expect(s.cardWaits).toBe(false)
    }
    // A tap with no card up does nothing.
    const s = game()
    expect(of(doing(s, { kind: 'card' }), 'cardClosed')).toEqual([])
  })

  it('comes when the factory finds it, and closes by itself', () => {
    const s = game()
    act(s, { kind: 'touch', down: true })
    act(s, { kind: 'touch', down: false })
    s.rocket.got[0] = 3
    const events = timeline(s, HOP + CARD_FOR + 1, ['card', 'say', 'cardClosed'])
    const [[cardAt]] = events
    expect(events).toEqual([
      [cardAt, { kind: 'card', id: 'digger' }],
      [cardAt, { kind: 'say', word: 'Digger!' }],
      [cardAt + CARD_FOR, { kind: 'cardClosed', id: 'digger' }],
    ])
  })
})


describe('the launch', () => {
  /** A game with every card found and every part of the rocket full. */
  function ready(): State {
    const s = game()
    s.found = [...CARDS]
    s.choice = 'bubbles'
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n)
    return s
  }

  it('counts down from 5 a second apart, lifts off, and lands LAUNCH_FOR after the tap, credited only then', () => {
    const s = ready()
    act(s, { kind: 'drag', cells: [c(4, 3), c(5, 3)] })
    const at = s.tick
    act(s, { kind: 'launch' })
    expect(s.launch).toEqual({ at, landsAt: at + LAUNCH_FOR })
    expect(s.drag).toBeNull()
    expect(s.beep).toMatchObject({ x: PAD.x + 1.5, y: PAD.y + 1.5, pose: 'cheer' })
    const events = timeline(s, LAUNCH_FOR, ['launch', 'count', 'liftoff', 'landed'])
    expect(events).toEqual([
      [at, { kind: 'launch' }],
      ...[5, 4, 3, 2, 1].map((n, i): [number, SimEvent] => [at + COUNT_AT + i * 60, { kind: 'count', n }]),
      [at + LIFTOFF, { kind: 'liftoff' }],
    ])
    // Still flying: nothing credited yet, the rocket full on its pad.
    expect(s.launches).toBe(0)
    expect(s.rocket.got).toEqual(PARTS.map((p) => PART_INFO[p].n))
    expect(timeline(s, 1, ['landed'])).toEqual([[at + LAUNCH_FOR, { kind: 'landed' }]])
    expect(s.launch).toBeNull()
    expect(s.launches).toBe(1)
    expect(s.rocket).toEqual({ got: [0, 0, 0, 0], fullAt: [-1, -1, -1, -1] })
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'wave' })
  })

  it('leaves every sticker endless and a new rocket on the pad whose four parts take their things again', () => {
    const s = ready()
    act(s, { kind: 'launch' })
    run(s, LAUNCH_FOR + 1)
    for (const sticker of ['digger', 'oven', 'lab', 'hedge'] as const) expect(stickersLeft(s, sticker)).toBe(Infinity)
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'lab' } })
    act(s, { kind: 'hold', x: 6, y: 3 })
    act(s, { kind: 'release', commit: true })
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'lab' } })
    act(s, { kind: 'hold', x: 6, y: 9 })
    act(s, { kind: 'release', commit: true })
    expect(s.buildings.filter((b) => b.kind === 'lab').length).toBe(2)
    // The oven's belt into the pad, the line its roof's things go along.
    stroke(s, [c(6, 6), c(5, 6), c(4, 6), c(3, 6)])
    oven(s).stack.push('blueBar', 'gear')
    expect(of(tapOn(s, { kind: 'stack', id: 1 }), 'fill')).toEqual([
      { kind: 'fill', part: 'legs', thing: 'blueBar' },
      { kind: 'fill', part: 'body', thing: 'gear' },
    ])
    expect(s.rocket.got).toEqual([1, 1, 0, 0])
    expect(s.basket.every((n) => n === 0)).toBe(true)
  })

  it('flies again once her factory fills the new rocket: the button bounces again, a tap launches, the second landing counts, and no card comes', () => {
    const s = ready()
    act(s, { kind: 'launch' })
    run(s, LAUNCH_FOR + 1)
    expect([s.launches, launchReady(s)]).toEqual([1, false])
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n - 1)
    expect(launchReady(s)).toBe(false)
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n)
    expect(launchReady(s)).toBe(true)
    const at = s.tick
    expect(of(tapOn(s, { kind: 'building', id: 0 }), 'launch')).toEqual([{ kind: 'launch' }])
    expect(s.launch).toEqual({ at, landsAt: at + LAUNCH_FOR })
    expect(of(run(s, LAUNCH_FOR), 'landed')).toEqual([{ kind: 'landed' }])
    expect([s.launches, s.rocket.got, s.card, s.found]).toEqual([2, [0, 0, 0, 0], null, [...CARDS]])
  })

  it('needs every part full, Fuel! found and no launch running; a tap on the ready rocket launches it', () => {
    const s = ready()
    s.rocket.got[3]!--
    expect(of(doing(s, { kind: 'launch' }), 'launch')).toEqual([])
    s.rocket.got[3]!++
    s.found = s.found.filter((id) => id !== 'fuel')
    expect(of(doing(s, { kind: 'launch' }), 'launch')).toEqual([])
    s.found.push('fuel')
    const at = s.tick
    expect(of(tapOn(s, { kind: 'building', id: 0 }), 'launch')).toEqual([{ kind: 'launch' }])
    expect(of(doing(s, { kind: 'launch' }), 'launch')).toEqual([])
    expect(s.launch!.at).toBe(at)
    run(s, LAUNCH_FOR)
    expect(s.launches).toBe(1)
    expect(of(doing(s, { kind: 'launch' }), 'launch')).toEqual([])
  })
})

describe('Good night', () => {
  it('tucks the kinds in one by one from dusk, by her tap or by themselves, until Beep sleeps by the basket', () => {
    const s = game()
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'land2', 'stars', 'snacks', 'land3', 'rocket']
    const digger = add(s, 'digger', 7, 2)
    const lab = add(s, 'lab', 4, 2)
    rebuild(s)
    act(s, { kind: 'drag', cells: [c(4, 8), c(5, 8)] })
    const at = s.tick
    expect(of(doing(s, { kind: 'goodnight' }), 'goodnight')).toHaveLength(1)
    expect(s.night).toEqual({ at, kind: null, kindAt: -1, doneAt: -1 })
    expect(s.drag).toBeNull()
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'yawn' })
    // A second Good night while one runs does nothing.
    expect(of(doing(s, { kind: 'goodnight' }), 'goodnight')).toEqual([])
    run(s, at + NIGHT_LEAD - s.tick)
    expect(s.night!.kind).toBeNull()
    run(s, 1)
    expect(s.night).toMatchObject({ kind: 'digger', kindAt: at + NIGHT_LEAD })
    // Her tap on the kind in its nightcap: every digger is tucked in, and the oven bounces next.
    expect(of(doing(s, { kind: 'tuck', machine: 'digger' }), 'tuck')).toEqual([{ kind: 'tuck', machine: 'digger' }])
    expect(digger.tucked).toBe(true)
    expect(s.night!.kind).toBe('oven')
    // A tap on an oven itself tucks the ovens in too.
    tapOn(s, { kind: 'building', id: 1 })
    expect(oven(s).tucked).toBe(true)
    expect(s.night!.kind).toBe('lab')
    // A tuck for a kind that is not bouncing (it tucked itself in a moment ago) does nothing.
    doing(s, { kind: 'tuck', machine: 'digger' })
    expect(s.night!.kind).toBe('lab')
    // Untapped, the lab tucks itself in NIGHT_TUCK after it began bouncing, then the drumming pad; then Beep sleeps.
    const labAt = s.night!.kindAt
    expect(timeline(s, 2 * NIGHT_TUCK + 1, ['tuck', 'sleep'])).toEqual([
      [labAt + NIGHT_TUCK, { kind: 'tuck', machine: 'lab' }],
      [labAt + 2 * NIGHT_TUCK, { kind: 'tuck', machine: 'pad' }],
      [labAt + 2 * NIGHT_TUCK, { kind: 'sleep' }],
    ])
    expect(lab.tucked).toBe(true)
    expect(s.night).toMatchObject({ kind: null, doneAt: labAt + 2 * NIGHT_TUCK })
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'sleep' })
    run(s, 2 * BEEP_REST)
    expect(s.beep.pose).toBe('sleep')
  })

  it('wakes in the morning, every machine untucked; Play on the next start card wakes it too', () => {
    const s = game()
    act(s, { kind: 'goodnight' })
    run(s, NIGHT_LEAD + NIGHT_TUCK + 1)
    expect(s.night!.doneAt).toBeGreaterThan(0)
    expect(oven(s).tucked).toBe(true)
    expect(of(doing(s, { kind: 'wake' }), 'wake')).toEqual([{ kind: 'wake' }])
    expect(s.night).toBeNull()
    expect(oven(s).tucked).toBe(false)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'stretch' })
    expect(of(doing(s, { kind: 'wake' }), 'wake')).toEqual([])
    act(s, { kind: 'goodnight' })
    run(s, NIGHT_LEAD + 1)
    const events = doing(s, { kind: 'play' })
    expect(events.filter((e) => e.kind === 'play' || e.kind === 'wake')).toEqual([{ kind: 'play' }, { kind: 'wake' }])
    expect(s.playing).toBe(true)
    expect(s.night).toBeNull()
  })

  it('waits for the launch to land', () => {
    const s = game()
    s.found = [...CARDS]
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n)
    act(s, { kind: 'launch' })
    act(s, { kind: 'goodnight' })
    expect(s.night).toBeNull()
  })
})

describe('sessions, the board and the switches', () => {
  it("starts a session: Beep stretches at home and the hint's hand shows at once", () => {
    const s = game()
    act(s, { kind: 'play' })
    act(s, { kind: 'touch', down: true })
    act(s, { kind: 'touch', down: false })
    s.beep = { ...s.beep, x: 9, y: 4, fromX: 9, fromY: 4, pose: 'carry', carrying: 'gear' }
    run(s, 100)
    const at = s.tick
    const hand = s.handAt
    expect(of(doing(s, { kind: 'session' }), 'session')).toEqual([{ kind: 'session' }])
    expect(s.sessionAt).toBe(at)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'stretch', carrying: null })
    // The hand comes at the next look of the hint, without the usual wait.
    run(s, HINT_LOOK)
    expect(s.handAt).toBeGreaterThan(hand)
    expect(s.handAt).toBeLessThanOrEqual(at + HINT_LOOK)
  })

  it('drops a drag when the board turns, its sticker back; remembers the turn and the pause menu closing', () => {
    const s = game()
    s.found.push('digger')
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(s, { kind: 'hold', x: 8, y: 3 })
    const at = s.tick
    act(s, { kind: 'turned' })
    expect(s.drag).toBeNull()
    expect(s.tool).toEqual({ kind: 'pencil' })
    expect(s.turnedAt).toBe(at)
    act(s, { kind: 'unpaused' })
    expect(s.pauseClosedAt).toBe(at)
  })

  it("counts touches for the kind rules and the hand: the last one down, a finger on the glass, and her tries until a touch changes the board", () => {
    const s = game()
    s.handN = 2
    const at = s.tick
    act(s, { kind: 'touch', down: true })
    expect([s.lastTouchAt, s.touching, s.handN, s.tries]).toEqual([at, true, 2, 1])
    run(s, 5)
    act(s, { kind: 'touch', down: false })
    expect([s.lastTouchAt, s.touching]).toEqual([at, false])
    // A touch that changes the board starts the hand's waits over.
    act(s, { kind: 'touch', down: true })
    expect(s.tries).toBe(2)
    stroke(s, [c(6, 6), c(5, 6), c(4, 6), c(3, 6)])
    expect([s.handN, s.tries]).toEqual([0, 0])
  })

  it("starts a fresh game in place from the next random number, the clock and the parent's switches kept", () => {
    const s = game()
    s.found.push('digger')
    stroke(s, [c(4, 3), c(5, 3)])
    act(s, { kind: 'play' })
    act(s, { kind: 'munchers', mode: 'polite' })
    act(s, { kind: 'sound', on: false })
    run(s, 50)
    act(s, { kind: 'tap', hit: { kind: 'ground', cell: c(4, 4) } })
    const tick = s.tick
    const rng = s.rng
    act(s, { kind: 'fresh' })
    const fresh = newGame(next(rng)[1])
    Object.assign(fresh, { tick, sessionAt: tick, playing: true, switches: { ...fresh.switches, munchers: 'polite', sound: false } })
    expect(s).toEqual(fresh)
    expect(s.events).toEqual([])
    expect(s.queued).toEqual([])
    run(s, 30)
    run(fresh, 30)
    expect(s).toEqual(fresh)
  })

  it("keeps the parent's switches", () => {
    const s = game()
    for (const a of [
      { kind: 'sound', on: false },
      { kind: 'music', on: false },
      { kind: 'voice', on: false },
      { kind: 'munchers', mode: 'none' },
      { kind: 'science', mode: 'quicker' },
      { kind: 'fullscreen', on: false },
    ] as const satisfies readonly Action[])
      act(s, a)
    expect(s.switches).toEqual({ sound: false, music: false, voice: false, munchers: 'none', science: 'quicker', noFullscreen: true })
    act(s, { kind: 'fullscreen', on: true })
    expect(s.switches.noFullscreen).toBe(false)
  })

  it('lets her choose Bubbles! or Hedges! only while the choice waits', () => {
    const s = game()
    act(s, { kind: 'choose', card: 'hedges' })
    expect(s.choice).toBeNull()
    s.found.push('digger', 'gold', 'science', 'gears')
    act(s, { kind: 'choose', card: 'hedges' })
    expect(s.choice).toBe('hedges')
    act(s, { kind: 'choose', card: 'bubbles' })
    expect(s.choice).toBe('hedges')
  })

  it('floats Beep home BEEP_REST after a job', () => {
    const s = game()
    oven(s).stack.push('blueBar')
    tapOn(s, { kind: 'stack', id: 1 })
    expect(s.beep).toMatchObject({ x: 7, y: 6, pose: 'carry', carrying: 'blueBar' })
    const at = s.beep.poseAt
    run(s, at + BEEP_REST - s.tick)
    expect(s.beep.pose).toBe('carry')
    run(s, 1)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'float', carrying: null, poseAt: at + BEEP_REST })
  })
})
