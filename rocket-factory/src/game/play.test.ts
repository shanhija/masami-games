/**
 * The careful child's play-through on the pure sim (plans/rocket-factory.md, The one next
 * step, and Engineering's tests): from newGame with the munchers on Many, every 3 to 8 game
 * seconds (from a generator of its own) the child touches the board and runs the first step's
 * script from hint.ts through rules.act, and the sim steps at 60 Hz in between. The path's
 * milestones come in order and within generous windows, the ledger holds on every hop tick,
 * the stroke lint holds after every script, every layout step and dig the child runs does what
 * it says (so a hint that leads nowhere fails where it leads nowhere, not at the milestone it
 * starves), the save keeps her whole factory at every card (a load of it saves the same), and
 * nothing throws. By default three seeds play to the first Land!; with FACTORY_LONG=1 ten
 * seeds play every card and the launch.
 */
import { describe, expect, it } from 'vitest'

import { PATH } from './catalog'
import { firstStep } from './hint'
import { Ledger } from './ledgerKit'
import { HOP, ticks, type CardId, type Step } from './model'
import { keepOf, parseKeep, serializeKeep, stateFromKeep } from './progress'
import { between, rng } from './random'
import { act, newGame, step } from './rules'
import { lintNet } from './strokes'

/** What the path brings, in the order the careful child meets it (the hint picks Bubbles! first), and the launch landing. */
type Milestone = CardId | 'landed'
const ORDER: readonly Milestone[] = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel', 'landed']
if (ORDER.length !== PATH.length + 1 || PATH.some((c) => !ORDER.includes(c.id))) throw new Error('the play-through names every card of the path')

/**
 * The game time (minutes:seconds) by which each milestone comes, at the earliest and at the
 * latest: wide round what ten seeds measured (the first Land! at 18:30 to 19:10, the launch
 * landing at 46:50 to 47:40 for a careful child this quick), so a tuning of the costs moves
 * them without breaking this, while a chain that starves, a card that comes for nothing or a
 * hint that loops does.
 */
const WINDOWS: Record<Milestone, readonly [string, string]> = {
  digger: ['0:05', '1:30'],
  gold: ['0:30', '3:00'],
  science: ['0:40', '4:00'],
  gears: ['1:00', '6:00'],
  bubbles: ['4:00', '12:00'],
  hedges: ['7:00', '18:00'],
  nose: ['11:00', '25:00'],
  stars: ['15:00', '32:00'],
  snacks: ['18:00', '40:00'],
  more: ['23:00', '48:00'],
  rocket: ['29:00', '58:00'],
  fuel: ['31:00', '62:00'],
  landed: ['33:00', '70:00'],
}
const tickOf = (time: string) => {
  const [m, sec] = time.split(':').map(Number) as [number, number]
  return ticks(m * 60 + sec)
}
const clock = (tick: number) => `${Math.floor(tick / 3600)}:${String(Math.floor((tick % 3600) / 60)).padStart(2, '0')}`

/** The steps whose script edits the layout: each must leave an undo entry from this very tick. */
const EDITS: ReadonlySet<Step['kind']> = new Set(['place', 'free', 'bottleneck', 'link', 'defend', 'refill'])

/**
 * Plays seed `seed` until milestone `last` comes (or its window's end passes): the child's
 * own generator spaces its turns, and the ledger and the lint are checked as the file comment
 * says. Returns the tick each milestone came at, the state, and the child's steps.
 */
function play(seed: number, last: Milestone) {
  const s = newGame(seed)
  const pause = rng(seed * 7919 + 17)
  const ledger = new Ledger(s)
  act(s, { kind: 'munchers', mode: 'many' })
  act(s, { kind: 'play' })
  act(s, { kind: 'session' })
  const at: Partial<Record<Milestone, number>> = {}
  const steps: string[] = []
  const end = tickOf(WINDOWS[last][1])
  let turn = 0
  while (at[last] === undefined && s.tick <= end) {
    if (s.tick >= turn) {
      const r = firstStep(s)
      if (r !== null) {
        steps.push(`${clock(s.tick)} ${JSON.stringify(r.step).slice(0, 120)}`)
        act(s, { kind: 'touch', down: true })
        for (const a of r.script) act(s, a)
        act(s, { kind: 'touch', down: false })
        const st = r.step
        if (EDITS.has(st.kind)) expect(s.undo.at(-1)?.at, `the step did nothing:\n${steps.slice(-12).join('\n')}`).toBe(s.tick)
        if (st.kind === 'dig') expect(s.queued.some((e) => e.kind === 'dig' && e.cell === st.cell), `the dig at ${st.cell} dug nothing`).toBe(true)
        expect(lintNet(s)).toEqual([])
      }
      turn = s.tick + between(pause(), ticks(3), ticks(8))
    }
    step(s)
    ledger.read(s, s.events)
    for (const e of s.events) {
      if (e.kind === 'landed') at.landed = s.tick
      if (e.kind !== 'card') continue
      at[e.id] = s.tick
      const keep = keepOf(s)
      expect(keepOf(stateFromKeep(parseKeep(serializeKeep(keep)), s.rng)), `the save at ${e.id}`).toEqual(keep)
    }
    if (s.tick % HOP === 0) ledger.check(s)
  }
  return { s, at, steps }
}

/** Plays each seed to `last` and holds every milestone up to it to its place in the order and its window. */
function holdsThePath(seeds: readonly number[], last: Milestone): void {
  const due = ORDER.slice(0, ORDER.indexOf(last) + 1)
  for (const seed of seeds) {
    const { s, at, steps } = play(seed, last)
    const seen = (Object.keys(at) as Milestone[]).sort((a, b) => at[a]! - at[b]!)
    expect(seen, `seed ${seed}: the path so far, ending:\n${steps.slice(-12).join('\n')}`).toEqual(due)
    for (const m of due) {
      const [lo, hi] = WINDOWS[m]
      expect(at[m]!, `seed ${seed}: ${m} at ${clock(at[m]!)}`).toBeGreaterThanOrEqual(tickOf(lo))
      expect(at[m]!, `seed ${seed}: ${m} at ${clock(at[m]!)}`).toBeLessThanOrEqual(tickOf(hi))
    }
    expect(s.choice).toBe('bubbles')
    // The munchers were out meanwhile: burrow A's scout and its visits since Gears!.
    expect(s.burrows[0]!.visits).toBeGreaterThan(1)
  }
}

describe('the careful child follows the hint', () => {
  it('to the first Land!, every card on time, the ledger and the lint whole all the way', { timeout: 60_000 }, () => {
    holdsThePath([1, 2, 3], 'nose')
  })

  it.runIf(process.env.FACTORY_LONG === '1')('through every card to the launch, on ten seeds', { timeout: 120_000 }, () => {
    holdsThePath([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'landed')
  })
})
