/**
 * The careful eager child with the plan's finger (child.ts FINGER) playing whole games on a
 * real Game through the router and the HUD's calls (childKit.ts frame), from the start card,
 * held against the same child on the pure sim (child.ts PureChild, the same seed): the cards
 * come in order and in time, the network lint holds, nothing throws, and the finger is not
 * much slower. By default it plays to Gears! at 1024x768, 1180x820 and 820x1180; with
 * FACTORY_LONG=1 the whole game at 1024x768 and to the first Land! at the other two.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Child, FINGER, PureChild, screenNamed, type Screen } from './child'
import { frame, memoryStorage, open } from './childKit'
import { CARDS, ticks, type CardId, type SimEvent, type State } from './model'
import { act, newGame } from './rules'
import { lintNet } from './strokes'

beforeEach(() => {
  memoryStorage()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const CAREFUL = { pace: 'eager', behaviour: 'careful' } as const
const LONG = process.env.FACTORY_LONG === '1'
/** What the path brings, in the careful child's order, and the launch landing. */
type Milestone = CardId | 'landed'
const ORDER: readonly Milestone[] = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel', 'landed']
if (ORDER.length !== CARDS.length + 1) throw new Error('the play names every card')
/** By when each milestone comes for the finger, in game minutes from Play: wide round the pure sim's curve (play.test.ts), so a tuning moves them without breaking this while a finger that loses its way does. */
const LATEST: Record<Milestone, number> = { digger: 2, gold: 4, science: 5, gears: 7, bubbles: 14, hedges: 20, nose: 28, stars: 36, snacks: 45, more: 54, rocket: 64, fuel: 68, landed: 75 }
/** The finger may take this much longer than the pure sim to a milestone, as a share of the pure sim's time. */
const SLOWER = 1.35

const milestone = (e: SimEvent): Milestone | null => (e.kind === 'card' ? e.id : e.kind === 'landed' ? 'landed' : null)

/** Game seconds from the start (Play) to each milestone of the careful child on the pure sim, up to `last`. */
function pure(seed: number, last: Milestone): Partial<Record<Milestone, number>> {
  const s: State = newGame(seed)
  act(s, { kind: 'play' })
  act(s, { kind: 'session' })
  const child = new PureChild(CAREFUL, seed)
  const at: Partial<Record<Milestone, number>> = {}
  while (at[last] === undefined) {
    if (s.tick > ticks(LATEST[last] * 60)) throw new Error(`the pure sim's child never came to ${last}`)
    child.step(s)
    for (const e of s.events) {
      const m = milestone(e)
      if (m !== null) at[m] ??= s.tick / 60
    }
  }
  return at
}

/** Game seconds from Play to each milestone of the careful child with the finger at screen sc, up to `last`, the lint checked every game second. A resting thumb in one seed in five, as on the page. */
function fingers(sc: Screen, seed: number, last: Milestone): Partial<Record<Milestone, number>> {
  const g = open(`?demo=start&seed=${seed}`, seed, sc)
  const child = new Child({ play: CAREFUL, finger: FINGER, mm: () => sc.mm, thumb: seed % 5 === 0 ? 'edge' : null, frantic: false, bedtime: Infinity }, seed)
  const at: Partial<Record<Milestone, number>> = {}
  let start = -1
  for (let i = 0; at[last] === undefined; i++) {
    const t = start < 0 ? 0 : (g.state.tick - start) / 60
    expect(t, `${sc.name}, seed ${seed}: ${last} by ${LATEST[last]} minutes, the path so far ${JSON.stringify(at)}`).toBeLessThan(LATEST[last] * 60)
    for (const e of frame(g, sc, child, 1 / 60)) {
      if (e.kind === 'play') start = g.state.tick
      const m = milestone(e)
      if (m !== null) at[m] ??= (g.state.tick - start) / 60
    }
    if (i % 60 === 0) expect(lintNet(g.state), `${sc.name}, seed ${seed}`).toEqual([])
  }
  return at
}

/** The finger's milestones in the path's order, each by its LATEST, and no more than SLOWER the pure sim's time on the same seed. */
function holds(sc: Screen, seed: number, last: Milestone): void {
  const due = ORDER.slice(0, ORDER.indexOf(last) + 1)
  const f = fingers(sc, seed, last)
  const p = pure(seed, last)
  expect((Object.keys(f) as Milestone[]).sort((a, b) => f[a]! - f[b]!), `${sc.name}, seed ${seed}`).toEqual(due)
  for (const m of due) expect(f[m]!, `${sc.name}, seed ${seed}: ${m} at ${f[m]} s, the pure sim at ${p[m]} s`).toBeLessThanOrEqual(Math.max(p[m]! * SLOWER, p[m]! + 30))
}

describe('the careful eager child with the finger', () => {
  it.runIf(!LONG)('plays to Gears! at 1024x768, 1180x820 and 820x1180, the cards in order and in time, not much slower than the pure sim', { timeout: 60_000 }, () => {
    for (const name of ['1024x768', '1180x820', '820x1180']) for (const seed of [1, 2]) holds(screenNamed(name), seed, 'gears')
  })

  it.runIf(LONG)('plays the whole game at 1024x768, and to the first Land! at 1180x820 and 820x1180', { timeout: 600_000 }, () => {
    for (const seed of [1, 2, 5]) holds(screenNamed('1024x768'), seed, 'landed')
    for (const name of ['1180x820', '820x1180']) for (const seed of [1, 2]) holds(screenNamed(name), seed, 'nose')
  })
})
