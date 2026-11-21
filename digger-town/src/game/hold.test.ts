import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { Sounds } from './sounds'
import { createSim, setAction, tick } from './sim'
import { spawnAnimal } from './world'
import { turnTo } from './math'

describe('an animal facing away', () => {
  it('does not step against the way she faces while she turns round, and reaches full pace once she faces her way', () => {
    const s = createSim({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
    const a = spawnAnimal(s, 'bunny', 0, 20)
    a.mood = 'walk'
    a.goalX = 0
    a.goalZ = 30
    // The same walk from the start facing her way: the step she takes at full pace.
    const r = createSim({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
    const ref = spawnAnimal(r, 'bunny', 0, 20)
    ref.mood = 'walk'
    ref.goalX = 0
    ref.goalZ = 30
    ref.yaw = 0
    tick(r, 1 / 30)
    const fullStep = ref.z - 20
    a.yaw = Math.PI
    let worst = Infinity
    let turned = 0
    let full = 0
    for (let i = 0; i < 30 * 10 && full === 0; i++) {
      const x0 = a.x
      const z0 = a.z
      const facing = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }
      tick(s, 1 / 30)
      worst = Math.min(worst, (a.x - x0) * facing.x + (a.z - z0) * facing.z)
      if (Math.abs(turnTo(a.yaw, 0)) > 0.01) turned++
      else full = Math.hypot(a.x - x0, a.z - z0)
    }
    expect(turned).toBeGreaterThan(10)
    expect(worst).toBeGreaterThanOrEqual(-1e-9)
    expect(fullStep).toBeGreaterThan(0)
    expect(full).toBeCloseTo(fullStep, 5)
  })
})

describe('a pending tap', () => {
  it('is dropped when the game releases its inputs', () => {
    const g = new Game({ search: '?job=hole1', lang: 'fi', storage: null, recognizer: null, audio: new Sounds(), freshSeed: () => 1 })
    setAction(g.sim, true)
    setAction(g.sim, false)
    expect(g.sim.hands.tapped).toBe(true)
    g.releaseInputs()
    expect(g.sim.hands.tapped).toBe(false)
  })

  const tapped = (rest: (g: Game) => void) => {
    const g = new Game({ search: '?job=hole1', lang: 'fi', storage: null, recognizer: null, audio: new Sounds(), freshSeed: () => 1 })
    g.advance(1 / 30)
    const m = g.sim.machines[g.sim.active]
    if (m.kind !== 'digger') throw new Error('the first machine of hole1 is the digger')
    expect(m.seq).toBe('rest')
    g.action(true)
    g.action(false)
    rest(g)
    g.advance(1 / 30)
    return m.seq
  }

  it('does not fire when play comes back from a pause', () => {
    expect(
      tapped((g) => {
        g.setPaused(true)
        g.setPaused(false)
      }),
    ).toBe('rest')
  })

  it('does not fire when play comes back from a hidden page', () => {
    expect(
      tapped((g) => {
        g.pageHidden(true)
        g.pageHidden(false)
        g.setPaused(false)
      }),
    ).toBe('rest')
  })

  it('fires when nothing came between the tap and the tick', () => {
    expect(tapped(() => {})).toBe('reach')
  })
})
