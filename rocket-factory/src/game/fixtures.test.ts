/**
 * The demos (fixtures.ts): every one is a state the careful child's game reaches, at the
 * moment it names, with a clean layout, and steps on; a seed's demos come out the same whatever
 * was asked before them.
 */
import { describe, expect, it } from 'vitest'

import { BURROWS, cellOf } from './board'
import { PLACEABLE } from './catalog'
import { DEMOS, DemoGame, demoState, type Demo } from './fixtures'
import { hudView } from './hud'
import { CARDS, STEP, type State } from './model'
import { keepOf } from './progress'
import { launchReady, step } from './rules'
import { lintNet } from './strokes'

const some = (s: State, mode: State['munchers'][number]['mode']) => s.munchers.some((m) => m.mode === mode)

/** What each demo shows, as the state has it. */
const SHOWS: Record<Demo, (s: State) => boolean> = {
  start: (s) => !s.playing && s.found.length === 0,
  factory: (s) => s.playing && s.found.length < 7 && s.lab.drinkAt >= 0 && s.buildings.some((b) => b.kind === 'lab'),
  ...(Object.fromEntries(CARDS.map((id) => [`card-${id}`, (s: State) => s.card !== null && s.card.id === id && s.found.at(-1) === id])) as Record<`card-${(typeof CARDS)[number]}`, (s: State) => boolean>),
  sitting: (s) => some(s, 'sit'),
  napping: (s) => some(s, 'nap') && s.buildings.some((b) => b.napper >= 0),
  nibbling: (s) => some(s, 'nibble') && s.munchers.every((m) => m.burrow === 1),
  picnic: (s) => some(s, 'picnic'),
  polite: (s) => some(s, 'polite') && s.switches.munchers === 'polite',
  towers: (s) => s.shots.length > 0 && s.buildings.filter((b) => b.kind === 'tower').length >= 2,
  busy: (s) => s.found.includes('rocket') && PLACEABLE.every((k) => s.buildings.some((b) => b.kind === k)),
  dusk: (s) => s.night !== null && s.night.kind !== null && s.night.doneAt < 0,
  night: (s) => s.night !== null && s.night.doneAt >= 0 && s.hint === null && hudView(s, (s.tick - 1) * STEP, []).night === 'done',
  ready: (s) => launchReady(s),
  launch: (s) => s.launch !== null && some(s, 'watch'),
  after: (s) => s.launches === 1 && s.launch === null,
}

describe('the demos', () => {
  it('reaches every moment in the careful child\'s game, with a clean layout, and steps on from it', { timeout: 30_000 }, () => {
    for (const name of DEMOS) {
      const s = demoState(name, 3)
      expect(SHOWS[name](s), name).toBe(true)
      expect(lintNet(s), name).toEqual([])
      const tick = s.tick
      for (let i = 0; i < 120; i++) step(s)
      expect(s.tick).toBe(tick + 120)
      expect(lintNet(s), name).toEqual([])
    }
  })

  it('walls burrow B in with hedges for the nibbling, and puts the towers on a bubble line that reaches them', () => {
    const s = demoState('nibbling', 3)
    const b = BURROWS[1]!
    // Each side of the mound, all four on the open board.
    for (const [x, y] of [[b.x, b.y - 1], [b.x + 2, b.y], [b.x, b.y + 2], [b.x - 1, b.y]] as const) expect(s.hedge[cellOf(x, y)], `${x}, ${y}`).toBeGreaterThan(0)
    const t = demoState('towers', 3)
    const towers = t.buildings.filter((x) => x.kind === 'tower')
    expect(t.shots.every((shot) => towers.some((x) => x.id === shot.tower))).toBe(true)
  })

  it('comes out the same for a seed whatever was asked before it', { timeout: 30_000 }, () => {
    const a = new DemoGame(4)
    const b = new DemoGame(4)
    const busy = keepOf(a.at('busy'))
    const factory = keepOf(a.at('factory'))
    const towers = keepOf(a.at('towers'))
    expect(keepOf(b.at('towers'))).toEqual(towers)
    expect(keepOf(b.at('factory'))).toEqual(factory)
    expect(keepOf(b.at('busy'))).toEqual(busy)
    // Each demo is a copy: changing one changes nothing the next one gets.
    const s = demoState('factory', 4)
    s.buildings.length = 0
    expect(keepOf(demoState('factory', 4))).toEqual(factory)
  })
})
