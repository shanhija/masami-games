/**
 * The step's speed (plans/rocket-factory.md, Engineering): a mean step under 20 microseconds on
 * a busy factory with 4 munchers out. The factory is the careful child's own (the busy demo, a
 * minute after Rocket!), its visit home; then four munchers of burrow C (the one the blueprint
 * leaves undefended, so they stay out the longest) come into the doorway and play through the
 * real code: hopping out, the walks and their searches, sitting, napping, the hint looking
 * again every HINT_EVERY. Plain node measures about 4 to 5 microseconds a step, and the tests
 * runner about 10 on a quiet machine; it costs more on every import, and the suite runs many
 * files at once. So with FACTORY_LONG=1 (run on a quiet machine) the bound holds a hot path
 * gone slow, while by default it is loose enough for the deploy's runner, which runs every
 * game's tests at once on a shared machine (a busy one measured 71 to 123): there it only
 * catches a hot path gone badly wrong, never the machine's own load.
 */
import { describe, expect, it } from 'vitest'

import { BURROWS } from './board'
import { WALK_STEP } from './catalog'
import { demoState } from './fixtures'
import { ticks, type State } from './model'
import { doorCell } from './munchers'
import { cloneState, step } from './rules'

/** The bound on the mean step under the tests runner, in microseconds: the quiet machine's with FACTORY_LONG=1, a busy runner's by default. */
const BOUND = process.env.FACTORY_LONG === '1' ? 60 : 300

/** Four munchers of burrow i in its doorway, a visit out: they hop out a second apart and act through the real code. */
function fourOut(s: State, i: number): void {
  if (s.visit !== null || s.munchers.length > 0) throw new Error('a visit is out already')
  const door = BURROWS[i]!.door
  const cell = doorCell(s, i)
  s.visit = { burrow: i, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
  s.burrows[i]!.visits++
  s.burrows[i]!.hunger = 0
  for (let k = 0; k < 4; k++)
    s.munchers.push({ id: s.nextMuncher++, burrow: i, mode: 'peek', modeAt: s.tick, cell, toward: cell, stepAt: s.tick, stepFor: WALK_STEP, hop: { x0: door.x, y0: door.y, x1: door.x, y1: door.y, at: s.tick, until: s.tick }, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: -1, scout: false, shotBy: -1 })
}

describe('speed', () => {
  it(`a step on a busy factory with four munchers out takes a few microseconds (under ${BOUND} under the tests runner)`, { timeout: 60_000 }, () => {
    const s = demoState('busy', 1)
    for (let k = 0; k < ticks(120) && (s.visit !== null || s.munchers.length > 0); k++) step(s)
    fourOut(s, 2)
    for (let k = 0; k < ticks(5); k++) step(s)
    expect(s.munchers.filter((m) => m.hop === null).length).toBe(4)
    // Warm up on a copy, then measure 30 game seconds of another.
    const warm = cloneState(s)
    for (let k = 0; k < ticks(10); k++) step(warm)
    const runs = ticks(30)
    let out = 0
    const t0 = performance.now()
    for (let k = 0; k < runs; k++) {
      step(s)
      out += s.munchers.length
    }
    const mean = ((performance.now() - t0) * 1000) / runs
    expect(out / runs).toBeGreaterThan(3.5)
    expect(mean).toBeLessThan(BOUND)
  })
})
