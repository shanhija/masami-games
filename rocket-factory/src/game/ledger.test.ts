/**
 * Whole games through the rules, on a factory built by hand on land 3 with the munchers out:
 * the ledger (ledgerKit.ts) checked on every hop tick of a 10-minute game, and determinism:
 * two runs of one seed with the same actions end equal, and a cloneState taken mid-way steps
 * the same.
 */
import { describe, expect, it } from 'vitest'

import { add } from './beltKit'
import { cellOf } from './board'
import { rebuild } from './belts'
import { PART_INFO } from './catalog'
import { Ledger } from './ledgerKit'
import { HOP, THINGS, inSlot, outSlot, ticks, type Action, type State } from './model'
import { act, cloneState, newGame, step } from './rules'
import { applyEdit, lintNet, planStroke } from './strokes'

const c = cellOf
/** Lays a belt along the finger's path [x, y] through the real stroke table, and checks it laid what it should. */
function lay(s: State, path: readonly (readonly [number, number])[], sign: string): void {
  const plan = planStroke(
    s,
    path.map(([x, y]) => c(x, y)),
    null,
  )
  expect(plan.sign, `the stroke from ${path[0]}`).toBe(sign)
  applyEdit(s, plan.edit!)
  expect(lintNet(s)).toEqual([])
}

/**
 * The factory, with every card up to More! found (all three burrows awake, the lab works on Rocket!): two blue diggers (one on burrow A's flowers) feeding the oven at the start, which
 * feeds a green bottle maker; a gold digger whose oven feeds the green maker and a bowl on
 * A's flowers; the pump's bubbles into the orange bottle maker and along a line past two
 * towers by the green maker; the orange and the green bottles ride one belt into the lab. The
 * rocket is full but its engine, which opens with Rocket! (found at 5:00 by the script); its
 * 40 orange bottles wait on burrow C's heap, and 30 gears for the orange maker in the basket.
 */
function factory(seed: number): State {
  const s = newGame(seed)
  s.found = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more']
  s.choice = 'bubbles'
  s.patterns = 8
  s.rocket.got = [PART_INFO.legs.n, PART_INFO.body.n, PART_INFO.nose.n, 0]
  s.burrows[2]!.heap[THINGS.indexOf('orangeBottle')] = PART_INFO.engine.n
  s.basket[THINGS.indexOf('gear')] = 30
  s.playing = true
  add(s, 'digger', 7, 2)
  add(s, 'digger', 9, 2)
  add(s, 'digger', 10, 7)
  add(s, 'oven', 12, 5)
  add(s, 'greenMaker', 5, 9)
  add(s, 'orangeMaker', 2, 10)
  add(s, 'lab', 8, 10)
  add(s, 'pump', 0, 8)
  rebuild(s)
  lay(s, [[7, 3], [7, 4], [7, 5], [7, 6]], 'mouth')
  lay(s, [[9, 2], [9, 1], [8, 1], [7, 1], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]], 'mouth')
  lay(s, [[6, 7], [6, 8], [6, 9]], 'mouth')
  lay(s, [[11, 7], [11, 6], [12, 6]], 'mouth')
  lay(s, [[12, 6], [12, 7], [12, 8], [12, 9], [11, 9], [10, 9], [9, 9], [8, 9], [7, 9], [6, 9]], 'mouth')
  lay(s, [[12, 5], [12, 4], [11, 4], [10, 4], [9, 4]], 'none')
  lay(s, [[1, 9], [1, 10], [2, 10]], 'mouth')
  lay(s, [[1, 8], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [5, 8], [4, 8]], 'none')
  lay(s, [[3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11]], 'mouth')
  lay(s, [[6, 10], [7, 10], [7, 11]], 'zip')
  // A short belt of green bottles by burrows B and C, for their munchers to sit on and eat.
  lay(s, [[16, 7], [15, 7], [14, 7]], 'none')
  for (const x of [14, 15, 16]) for (const slot of [inSlot(c(x, 7)), outSlot(c(x, 7))]) s.belts.slot[slot] = THINGS.indexOf('greenBottle')
  add(s, 'bowl', 10, 4)
  add(s, 'tower', 5, 7)
  add(s, 'tower', 5, 8)
  rebuild(s)
  expect(lintNet(s)).toEqual([])
  return s
}

/** The child's script at tick t: what she does now, read off the state, so every run of one seed does the same. */
function script(s: State, t: number): Action[] {
  const out: Action[] = []
  const at = (sec: number) => t === ticks(sec)
  const every = (sec: number, from: number) => t >= ticks(from) && (t - ticks(from)) % ticks(sec) === 0
  if (every(20, 0)) out.push({ kind: 'touch', down: true }, { kind: 'touch', down: false })
  // She tickles burrow C's munchers where they sit, and lets A's and B's have their picnics, snacks and suds.
  if (every(2, 1)) {
    const m = s.munchers.find((x) => x.burrow === 2 && x.mode === 'sit')
    if (m !== undefined) out.push({ kind: 'tickle', id: m.id })
  }
  if (every(15, 7)) out.push({ kind: 'tap', hit: { kind: 'basket' } })
  if (every(11, 5)) {
    const slot = s.belts.slot.findIndex((v, i) => v >= 0 && i % 7 === Math.floor(t / 60) % 7)
    if (slot >= 0) out.push({ kind: 'tap', hit: { kind: 'thing', slot } })
  }
  if (every(30, 12)) {
    const i = s.burrows.findIndex((b, k) => k < 2 && b.heap.some((n) => n > 0))
    if (i >= 0) out.push({ kind: 'tap', hit: { kind: 'heap', burrow: i } })
  }
  // Beep digs by hand early, while the ovens still have room for a rock.
  if (at(3)) out.push({ kind: 'touch', down: true }, { kind: 'dig', cell: c(3, 1), down: true })
  if (at(9)) out.push({ kind: 'dig', cell: c(3, 1), down: false }, { kind: 'touch', down: false })
  if (at(200)) out.push({ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'drag', cells: [c(9, 4)] }, { kind: 'release', commit: true })
  if (at(205)) out.push({ kind: 'oops' })
  if (at(300)) out.push({ kind: 'tap', hit: { kind: 'heap', burrow: 2 } }, { kind: 'launch' })
  if (at(420)) out.push({ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'tap', hit: { kind: 'building', id: 8 } }, { kind: 'tap', hit: { kind: 'building', id: 8 } })
  if (at(425)) out.push({ kind: 'oops' })
  if (at(480)) out.push({ kind: 'tool', tool: { kind: 'sticker', sticker: 'tower' } }, { kind: 'hold', x: 4.5, y: 11.5 }, { kind: 'release', commit: true })
  return out
}

/** Plays the factory from tick `from` to `to` with the script, reading every action's and step's events into `ledger` and checking it on every hop tick (when given). */
function play(s: State, to: number, ledger: Ledger | null): void {
  while (s.tick < to) {
    if (s.tick === ticks(300)) s.found.push('rocket', 'fuel')
    for (const a of script(s, s.tick)) act(s, a)
    step(s)
    if (ledger !== null) {
      ledger.read(s, s.events)
      if (s.tick % HOP === 0) ledger.check(s)
    }
  }
}

const MINUTES = ticks(10 * 60)

describe('a whole game', () => {
  it('keeps the ledger on every hop tick of 10 minutes, with the munchers out', { timeout: 30_000 }, () => {
    const s = factory(11)
    const ledger = new Ledger(s)
    ledger.check(s)
    play(s, MINUTES, ledger)
    // The game did everything the ledger counts: Beep dug, the lab drank, munchers picnicked, ate off a belt, were tickled and shot at and sneezed, the rocket flew, and Beep carried things about.
    for (const kind of ['dig', 'drink', 'picnic', 'nom', 'caught', 'sneeze', 'shot', 'landed', 'carry', 'rollUp', 'peel', 'place'] as const) expect(ledger.seen[kind] ?? 0, kind).toBeGreaterThan(0)
  })

  it('steps the same from one seed with the same actions for 10 minutes, and from a clone taken mid-way', { timeout: 30_000 }, () => {
    const a = factory(5)
    const b = factory(5)
    play(a, MINUTES / 2, null)
    play(b, MINUTES / 2, null)
    const mid = cloneState(b)
    expect(mid).toEqual(b)
    play(a, MINUTES, null)
    play(b, MINUTES, null)
    play(mid, MINUTES, null)
    expect(a).toEqual(b)
    expect(mid).toEqual(b)
  })
})
