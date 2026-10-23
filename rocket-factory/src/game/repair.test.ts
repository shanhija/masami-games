/**
 * The way back to the blueprint (plans/rocket-factory.md, The one next step, and The hint's own
 * factory): whatever she built, the hint never gives up and always leads forward. The board the
 * hint gave up on in the integration run (stall-at-science.keep.json: a stray belt of hers took
 * the column the blue rock belt needs, the digger went to the gear digger's spot and its belt
 * covered the green maker's spot) leads on through Science! and the next cards; each step of
 * the repair cascade alone (the peel over her loose belts on a spot, Oops for her newest stray
 * stroke, the peel of her machine on a planned spot, a stroke of hers along the dotted path
 * carried on, the peel of a link that joined the wrong line, the pump first for the orange
 * maker's spot, the gold oven's spot for Science!); the Oops rule never undoes a repair the hint
 * asked for and never sees a mere new belt as a break; Beep never carries a thing into a
 * building the blueprint feeds no such thing; and the property: the chaos child plays a few
 * game minutes at random from a moment of the careful child's game, then the careful child
 * follows the hint from that board to the next cards, never seeing a layout twice. By default a
 * few moments; with FACTORY_LONG=1 every moment on several chaos seeds, each to the launch.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { whereWanted } from './beep'
import { add, cell, emptyBoard, put } from './beltKit'
import { cellOf } from './board'
import { rebuild } from './belts'
import { BLOCKED_HINT, STACK } from './catalog'
import { Child, FINGER, PureChild, screenNamed } from './child'
import { frame, memoryStorage, open } from './childKit'
import { demoState, type Demo } from './fixtures'
import { brokeBetween, firstStep, nextSteps, reachOf, type Ranked } from './hint'
import { openParts } from './machines'
import { CARDS, OVER, slotCell, type CardId, type State, type Step } from './model'
import { parseKeep, stateFromKeep } from './progress'
import { act, step } from './rules'
import { applyEdit, lintNet, planPeelBuilding, planPeelDrag, planStroke, stickersLeft } from './strokes'

const LONG = process.env.FACTORY_LONG === '1'
const CAREFUL = { pace: 'eager', behaviour: 'careful' } as const
/** The steps that change the layout, after each of which the board is held to the lint and to never coming back. */
const LAYOUT: ReadonlySet<Step['kind']> = new Set(['place', 'link', 'free', 'bottleneck', 'defend', 'refill', 'oops'])

beforeEach(() => {
  memoryStorage()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The board the hint gave up on, as the page loads it, Play pressed. */
function stall(): State {
  const s = stateFromKeep(parseKeep(readFileSync(new URL('./stall-at-science.keep.json', import.meta.url), 'utf8')), 1)
  act(s, { kind: 'play' })
  return s
}

/** A step's script through rules.act, her finger down round it as a child's is. */
function run(s: State, r: Ranked): void {
  act(s, { kind: 'touch', down: true })
  for (const a of r.script) act(s, a)
  act(s, { kind: 'touch', down: false })
}

/** The board as the planners see it: every belt cell's sides, the hedges, the buildings where they stand. */
const layout = (s: State) => JSON.stringify([[...s.belts.in], [...s.belts.out], [...s.belts.fork], [...s.belts.over], [...s.hedge], s.buildings.map((b) => `${b.kind}@${b.x},${b.y}`)])

/**
 * The careful child follows the hint from board s until it has found `cards` or launched (every
 * card), at most `minutes` of game time: after each layout step the lint holds and the layout is
 * one never seen before (a repair that undid the last would bring one back). Returns the cards
 * found, in order, and its layout steps.
 */
function follow(s: State, seed: number, last: number, minutes: number): { found: CardId[]; steps: Step[] } {
  const child = new PureChild(CAREFUL, seed)
  const end = s.tick + minutes * 3600
  const seen = new Set([layout(s)])
  const steps: Step[] = []
  while ((s.found.length < last || (last === CARDS.length && s.launches === 0)) && s.tick < end) {
    const r = child.step(s)
    if (r === null || !LAYOUT.has(r.step.kind)) continue
    steps.push(r.step)
    expect(lintNet(s), JSON.stringify(r.step)).toEqual([])
    const key = layout(s)
    expect(seen.has(key), `the layout after ${JSON.stringify(r.step)} came back: a loop, after\n${steps.slice(-8).map((x) => JSON.stringify(x)).join('\n')}`).toBe(false)
    seen.add(key)
  }
  return { found: [...s.found], steps }
}

const at = (s: State, kind: string, x: number, y: number) => s.buildings.some((b) => b.kind === kind && b.x === x && b.y === y)
const cells = (...xy: [number, number][]) => xy.map(([x, y]) => cellOf(x, y))

describe('the board the hint gave up on', () => {
  it("clears the green maker's spot first: the peel over the digger's belt across it, then the green maker on it", () => {
    const s = stall()
    const first = firstStep(s)!
    expect(first.step).toEqual({ kind: 'free', sticker: 'greenMaker', cells: cells([8, 6], [9, 6], [9, 5], [9, 4]) })
    expect(first.script).toEqual([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'drag', cells: cells([8, 6], [9, 6], [9, 5], [9, 4]) }, { kind: 'release', commit: true }])
    run(s, first)
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'greenMaker', x: 8, y: 5 })
  })

  it("leads on through Science! and the next cards, the blueprint's blue rock line back down its column", { timeout: LONG ? 120_000 : 30_000 }, () => {
    const s = stall()
    const { found, steps } = follow(s, 1, LONG ? CARDS.length : CARDS.indexOf('hedges') + 1, LONG ? 150 : 20)
    expect(found).toEqual(CARDS.slice(0, LONG ? CARDS.length : CARDS.indexOf('hedges') + 1))
    if (LONG) expect(s.launches).toBe(1)
    // Her stray belt peeled, the digger brought from the gear digger's spot to its own, the green maker on its spot.
    expect(steps.filter((x) => x.kind === 'free').map((x) => (x as Extract<Step, { kind: 'free' }>).sticker)).toEqual(['greenMaker', 'digger', 'digger'])
    expect(at(s, 'digger', 7, 2) && at(s, 'greenMaker', 8, 5)).toBe(true)
  })
})

describe('the repair cascade, each case alone', () => {
  /** The moment Science! comes in seed 1's careful game, its card closed and the lab on its spot as the hint offers it first: the green maker is the New! sticker. */
  function science(): State {
    const s = demoState('card-science', 1)
    act(s, { kind: 'card' })
    const lab = firstStep(s)!
    expect(lab.step).toEqual({ kind: 'place', sticker: 'lab', x: 6, y: 8 })
    run(s, lab)
    return s
  }
  /** A belt she draws over these cells with the pencil: laid straight into the board (no Oops in reach), or through rules.act (her newest edit). */
  const draw = (s: State, path: number[], undoable: boolean) => {
    if (!undoable) return applyEdit(s, planStroke(s, path, null).edit!)
    act(s, { kind: 'drag', cells: path })
    act(s, { kind: 'release', commit: true })
  }

  it("her loose belt on the blueprint's spot: the peel over just those cells, then the hint's spot", () => {
    const s = science()
    draw(s, cells([9, 5], [9, 6], [9, 7]), false)
    const r = firstStep(s)!
    expect(r.step).toEqual({ kind: 'free', sticker: 'greenMaker', cells: cells([9, 5], [9, 6]) })
    run(s, r)
    expect(s.belts.out[cellOf(9, 7)]).toBeGreaterThanOrEqual(0)
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'greenMaker', x: 8, y: 5 })
  })

  it('Oops while her newest stroke is that stray belt, still in reach', () => {
    const s = science()
    draw(s, cells([9, 5], [9, 6], [9, 7]), true)
    const r = firstStep(s)!
    expect(r).toEqual({ step: { kind: 'oops' }, script: [{ kind: 'oops' }] })
    run(s, r)
    expect(s.belts.out[cellOf(9, 6)]).toBe(-1)
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'greenMaker', x: 8, y: 5 })
  })

  it("her own machine on a planned spot: the peel of that machine, back to the tray with what it held, then the hint's spot", () => {
    const s = demoState('card-science', 1)
    act(s, { kind: 'card' })
    // She puts the lab where the green maker goes.
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'lab' } })
    act(s, { kind: 'hold', x: 9, y: 6 })
    act(s, { kind: 'release', commit: true })
    const lab = s.buildings.find((b) => b.kind === 'lab')!
    expect([lab.x, lab.y]).toEqual([8, 5])
    const r = firstStep(s)!
    expect(r.step).toEqual({ kind: 'free', sticker: 'greenMaker', cells: [cellOf(8, 5)] })
    expect(r.script).toEqual([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'tap', hit: { kind: 'building', id: lab.id } }, { kind: 'tap', hit: { kind: 'building', id: lab.id } }])
    run(s, r)
    expect(stickersLeft(s, 'lab')).toBe(1)
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'greenMaker', x: 8, y: 5 })
    run(s, firstStep(s)!)
    // The lab then goes to its own spot, the chain's planned sticker.
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'lab', x: 6, y: 8 })
  })

  it('a stroke of hers along the dotted path that stopped short: the hint carries on from where it stopped', () => {
    const s = science()
    run(s, firstStep(s)!)
    expect(at(s, 'greenMaker', 8, 5)).toBe(true)
    // Out of the green maker toward the lab, lifted two cells along.
    draw(s, cells([9, 6], [9, 7], [9, 8]), false)
    const r = firstStep(s)!
    expect(r.step).toMatchObject({ kind: 'link', thing: 'greenBottle', path: cells([9, 6], [9, 7], [9, 8], [9, 9], [8, 9], [7, 9]) })
    expect(r.script).toEqual([{ kind: 'drag', cells: cells([9, 8], [9, 9], [8, 9], [7, 9]) }, { kind: 'release', commit: true }])
    run(s, r)
    const lab = s.buildings.find((b) => b.kind === 'lab')!
    expect(s.net.mouths.get(lab.id)!.some((x) => x >> 1 === cellOf(8, 9))).toBe(true)
  })

  it('a link that joined the wrong line: once its gold bars block the start oven, the peel of that link from where it leaves its oven to where it joins', () => {
    const s = demoState('factory', 1)
    // Her choice made ahead, so the choice card never covers the board while her wrong link plays out.
    s.choice = 'bubbles'
    // Out of the gold oven's top and along row 4, joining the blue rock belt's side.
    const wrong = cells([11, 4], [10, 4], [9, 4], [8, 4])
    const plan = planStroke(s, [cellOf(11, 5), ...wrong, cellOf(7, 4)], null)
    expect(plan.sign).toBe('zip')
    applyEdit(s, plan.edit!)
    let peel: Ranked | undefined
    for (let i = 0; i < 60 * 60 && peel === undefined; i++) {
      step(s)
      peel = nextSteps(s).find((r) => r.step.kind === 'free')
    }
    expect(peel!.step).toEqual({ kind: 'free', sticker: 'oven', cells: wrong })
    run(s, peel!)
    for (const c of wrong) expect(s.belts.out[c]).toBe(-1)
    expect([4, 5].every((y) => s.belts.out[cellOf(7, y)] === 1)).toBe(true)
  })

  it("the pump first when the orange maker's spot by the pond waits for it", { timeout: 30_000 }, () => {
    const s = demoState('card-stars', 1)
    act(s, { kind: 'card' })
    const pump = s.buildings.find((b) => b.kind === 'pump')!
    applyEdit(s, planPeelBuilding(s, pump.id))
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'pump', x: 0, y: 8 })
    run(s, firstStep(s)!)
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'orangeMaker', x: 2, y: 8 })
  })

  it('her machine on a planned belt between its ends: the peel of that machine, never a belt into its mouth', () => {
    const s = emptyBoard()
    s.land = 3
    s.found = ['digger', 'gold', 'science']
    add(s, 'pad', 1, 4)
    add(s, 'greenMaker', 8, 5)
    add(s, 'lab', 6, 8)
    // Her workshop where the green maker's belt to the lab turns west, the lab's mouth right behind it: a stroke along the dotted path would end in the workshop's mouth.
    const workshop = add(s, 'workshop', 8, 9)
    rebuild(s)
    const layout = (x: Ranked) => x.step.kind === 'free' || x.step.kind === 'link'
    const r = nextSteps(s).find(layout)!
    expect(r.step).toEqual({ kind: 'free', sticker: 'greenMaker', cells: [cellOf(8, 9)] })
    run(s, r)
    expect(s.buildings.some((b) => b.id === workshop.id)).toBe(false)
    expect(nextSteps(s).find(layout)!.step).toMatchObject({ kind: 'link', thing: 'greenBottle', path: cells([9, 6], [9, 7], [9, 8], [9, 9], [8, 9], [7, 9]) })
  })

  it("Science!'s oven on the gold oven's spot, when the oven is no New! sticker", () => {
    const s = demoState('card-gold', 1)
    act(s, { kind: 'card' })
    s.help.placed.oven = 1
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'oven', x: 11, y: 5 })
  })
})

describe('the Oops rule and the hint', () => {
  it('never undoes a repair the hint asked for, and still undoes her own peel of the blueprint', () => {
    const s = stall()
    run(s, firstStep(s)!)
    // As if the digger's belt it took had fed a working oven.
    s.undo.at(-1)!.broke = true
    expect(firstStep(s)!.step).toEqual({ kind: 'place', sticker: 'greenMaker', x: 8, y: 5 })
    const oven = s.buildings.find((b) => b.kind === 'oven' && b.x === 6 && b.y === 6)!
    const hit = { kind: 'building', id: oven.id } as const
    run(s, { step: { kind: 'rocket' }, script: [{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'tap', hit }, { kind: 'tap', hit }] })
    s.undo.at(-1)!.broke = true
    expect(firstStep(s)!.step).toEqual({ kind: 'oops' })
  })

  it('an edit that only lays cuts nothing: a rock belt into an oven no belt fed narrows what it is reckoned to bake, and breaks nothing', () => {
    const s = emptyBoard()
    s.found = ['digger', 'gold', 'science']
    add(s, 'oven', 6, 6)
    const gm = add(s, 'greenMaker', 9, 6)
    add(s, 'digger', 7, 2)
    // Two belts east out of the oven into the green maker.
    cell(s, 8, 6, 2, 0, -1, -1)
    cell(s, 8, 7, 2, 0, -1, -1)
    rebuild(s)
    expect(s.net.mouths.get(gm.id)!.length).toBe(2)
    gm.batch = { makes: 'greenBottle', at: 0, until: 240 }
    const before = reachOf(s)
    expect(before.feeds.get(gm.id)).toEqual(['blueBar', 'goldBar'])
    applyEdit(s, planStroke(s, cells([7, 3], [7, 4], [7, 5], [7, 6]), null).edit!)
    const after = reachOf(s)
    expect(after.feeds.get(gm.id)).toEqual(['blueBar'])
    expect(brokeBetween(before, after)).toBe(false)
    // Taking the oven's belts away does break the working green maker.
    applyEdit(s, planPeelDrag(s, cells([8, 6], [8, 7])).edit!)
    expect(brokeBetween(after, reachOf(s))).toBe(true)
  })
})

describe("Beep's carries for the hint", () => {
  /** Seed 1's factory at work, its gold line standing full: the gold digger's roof full and its belt full of gold rocks, the gold oven full, BLOCKED_HINT and more ago. */
  function jammed(): { s: State; digger: number; oven: number; startOven: number } {
    const s = demoState('factory', 1)
    const digger = s.buildings.find((b) => b.kind === 'digger' && b.x === 10 && b.y === 7)!
    const oven = s.buildings.find((b) => b.kind === 'oven' && b.x === 11 && b.y === 5)!
    const startOven = s.buildings.find((b) => b.kind === 'oven' && b.x === 6 && b.y === 6)!
    digger.stack = Array.from({ length: STACK }, () => 'goldRock')
    digger.pushAt = s.tick - BLOCKED_HINT - 1
    for (const x of s.net.spouts.get(digger.id)!) {
      s.belts.slot[x] = 1
      s.belts.slot[x + 1] = 1
    }
    oven.queue = Array.from({ length: STACK }, () => 'goldRock')
    startOven.queue = []
    return { s, digger: digger.id, oven: oven.id, startOven: startOven.id }
  }

  it("never into a building the blueprint feeds no such thing: the gold digger's rocks wait rather than go to the start oven", () => {
    const { s, digger, startOven } = jammed()
    expect(whereWanted(s, 'goldRock', { x: 11, y: 8 })!.id).toBe(startOven)
    expect(nextSteps(s).some((r) => r.step.kind === 'stack' && r.step.id === digger)).toBe(false)
  })

  it('takes bars nothing wants off an oven roof when a rock in it would bake what its own line waits for', () => {
    const { s, oven } = jammed()
    const o = s.buildings.find((b) => b.id === oven)!
    const gm = s.buildings.find((b) => b.kind === 'greenMaker')!
    // Blue bars from blue rocks that came by hand stand on the gold oven's roof and at the green maker's mouth; the green maker, full of blue bars, waits for gold.
    o.stack = Array.from({ length: STACK }, () => 'blueBar')
    o.pushAt = s.tick - BLOCKED_HINT - 1
    for (const x of s.net.spouts.get(o.id)!) {
      s.belts.slot[x] = 3
      s.belts.slot[x + 1] = 3
    }
    gm.held = gm.held.map((n, i) => (i === 3 ? STACK : i === 4 ? 0 : n))
    expect(nextSteps(s).some((r) => r.step.kind === 'stack' && r.step.id === oven)).toBe(true)
  })

  it("lifts what stands for good at the end of a hump into the pad: gears on the orange maker's bridge once the body and the nose are full", () => {
    const s = demoState('land3', 1)
    const pad = s.buildings.find((b) => b.kind === 'pad')!
    const hump = s.net.mouths.get(pad.id)!.find((x) => x >= OVER)!
    expect(slotCell(hump)).toBe(cellOf(2, 7))
    expect(openParts(s)).toEqual(['engine'])
    put(s, hump, 'gear')
    put(s, hump - 1, 'gear')
    // A hump tells its time as a belt's end does (belts.ts): standing BLOCKED_HINT with its lane full behind it.
    expect(nextSteps(s).some((r) => r.step.kind === 'unblock')).toBe(false)
    s.belts.blockedSince[hump >> 1] = s.tick - BLOCKED_HINT
    const lift = nextSteps(s).find((r) => r.step.kind === 'unblock')!
    expect(lift.step).toEqual({ kind: 'unblock', slot: hump })
    run(s, lift)
    expect(s.belts.slot[hump]).toBe(-1)
  })
})

describe('the chaos child, then the careful child following the hint', () => {
  /** Moments of seed 1's careful game the chaos child starts from. */
  const MOMENTS: readonly Demo[] = LONG ? ['start', 'card-science', 'card-gears', 'land2', 'card-stars', 'card-land3', 'card-rocket'] : ['start', 'card-science', 'card-gears']
  const SEEDS = LONG ? [1, 2, 3, 4, 5, 6] : [1]
  const sc = screenNamed('1024x768')
  for (const moment of MOMENTS)
    it(`from ${moment}: three minutes of taps, strokes, stickers, peels and Oops anywhere, then the hint leads ${LONG ? 'to the launch' : 'to the next two cards'}`, { timeout: LONG ? 600_000 : 60_000 }, () => {
      for (const seed of SEEDS) {
        const g = open(`?demo=${moment}&seed=1`, 1, sc)
        const chaos = new Child({ play: 'chaos', finger: FINGER, mm: () => sc.mm, thumb: null, frantic: false, bedtime: Infinity }, seed)
        const from = g.state.tick
        while (g.state.tick - from < 3 * 3600 || !chaos.idle || g.state.drag !== null) frame(g, sc, chaos, 2 / 60)
        const s = g.state
        const last = LONG ? CARDS.length : Math.min(CARDS.length, s.found.length + 2)
        const { found } = follow(s, seed, last, LONG ? 150 : 40)
        expect(found.length, `chaos seed ${seed} from ${moment}: found ${found.join(', ')}`).toBeGreaterThanOrEqual(last)
        if (LONG) expect(s.launches, `chaos seed ${seed} from ${moment}: the launch`).toBe(1)
      }
    })
})
