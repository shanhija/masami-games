/**
 * The sky, the light and the weather, and each room's ground and water, as made code sets and
 * fades them: values that stay, fades that go on after the action, the time going the short way
 * round, the water's level deciding wading, swimming and floating, the wind on light puffs, and
 * all of it plain data that a copy of the world keeps.
 */
import { describe, expect, it } from 'vitest'

import { ROOM_GEO, WATER_Y } from './rooms'
import { nightOf, START_TIME, twilightOf } from './sky'
import { Sim } from './sim'
import { actionEntry, makeSim, newLibrary, run, runUntil, step } from './testing'
import { STEP } from './types'
import { restHeight, waterTop, wetAt } from './world'

const opt = (name: string, kind: 'text' | 'number' | 'item' | 'actor') => ({ name, kind, about: name, optional: true })

/** A sim whose library has one made action with this body. */
function withAction(code: string, opts: Parameters<typeof makeSim>[0] = {}) {
  const library = newLibrary()
  expect(library.addAction(actionEntry('act', [opt('thing', 'item')], code))).toEqual({ ok: true })
  return makeSim({ ...opts, library })
}

describe('the sky', () => {
  it('starts in the afternoon light the game was made in, clear and calm, in every world', () => {
    const sim = makeSim()
    expect(sim.world.sky).toEqual({ time: START_TIME, rain: 0, snow: 0, fog: 0, wind: 0, color: null, light: null, fades: {} })
    expect(sim.api.sky.night).toBe(0)
    expect(sim.world.terrain!.pool).toEqual({ water: 1, waterColor: null, ground: null, fades: {} })
  })

  it('is dark from evening to dawn, easing at dusk and dawn, warm at sunrise and sunset', () => {
    expect([12, 18, 22, 2, 7].map(nightOf)).toEqual([0, 0, 1, 1, 0])
    expect(nightOf(19.25)).toBeGreaterThan(0.2)
    expect(nightOf(19.25)).toBeLessThan(0.8)
    expect(nightOf(5.75)).toBeGreaterThan(0.2)
    expect(twilightOf(19)).toBe(1)
    expect(twilightOf(6)).toBe(1)
    expect(twilightOf(12) + twilightOf(0)).toBe(0)
  })

  it('takes what code sets and keeps it, leaving out what does not fit', () => {
    const sim = makeSim()
    const sky = sim.api.sky
    sky.time = 26
    sky.rain = 2
    sky.snow = -1
    sky.fog = NaN as number
    sky.color = 'pink'
    sky.light = 'not a colour'
    expect(sim.world.sky).toMatchObject({ time: 2, rain: 1, snow: 0, fog: 0, color: '#ff9ccf', light: null })
    expect(sky.night).toBe(1)
    run(sim, 2)
    expect(sim.world.sky!.time).toBe(2)
    sky.color = null
    expect(sky.color).toBe(null)
  })

  it('fades day into night through the dusk and goes on by itself after the action has ended', () => {
    const sim = withAction("w.sky.fade({ time: 22, rain: 0.5 }, 3)\nme.say('Night!')")
    sim.give('alice', [step('act')], true)
    runUntil(sim, 'done', 'alice', 1)
    expect(sim.world.sky!.time).toBeLessThan(14)
    const seen: number[] = []
    run(sim, 3.2, () => seen.push(sim.world.sky!.time))
    expect(sim.world.sky).toMatchObject({ time: 22, rain: 0.5, fades: {} })
    expect(seen.some((h) => h > 18 && h < 20)).toBe(true)
    expect(seen.every((h, i) => i === 0 || h >= seen[i - 1]!)).toBe(true)
  })

  it('goes forward through midnight to the morning, and back a little when that is shorter', () => {
    const sim = makeSim()
    sim.api.sky.time = 22
    sim.api.sky.fade({ time: 7 }, 2)
    const seen: number[] = []
    run(sim, 2.1, () => seen.push(sim.world.sky!.time))
    expect(seen.some((h) => h < 1)).toBe(true)
    expect(sim.world.sky!.time).toBeCloseTo(7, 9)
    sim.api.sky.time = 13
    sim.api.sky.fade({ time: 12 }, 1)
    run(sim, 0.5)
    expect(sim.world.sky!.time).toBeGreaterThan(12)
    expect(sim.world.sky!.time).toBeLessThan(13)
  })

  it('fades a colour from a colour and jumps to one from none; waiting for a fade is yield*', () => {
    const sim = withAction("w.sky.color = 'blue'\nyield* w.sky.fade({ color: 'yellow' }, 1)\nw.sky.fade({ light: 'orange' }, 2)")
    sim.give('alice', [step('act')], true)
    run(sim, 0.5)
    const mid = sim.world.sky!.color!
    expect(mid).not.toBe('#4a78e0')
    expect(mid).not.toBe('#f5d33b')
    runUntil(sim, 'done', 'alice', 1)
    expect(sim.world.sky!.color).toBe('#f5d33b')
    expect(sim.world.sky!.light).toBe('#f5a13b')
  })

  it('is kept in a copy of the world, fades and all', () => {
    const sim = makeSim()
    sim.api.sky.fade({ time: 20, snow: 1 }, 4)
    sim.api.pool.level = 0.3
    run(sim, 1)
    const copy = structuredClone(sim.world)
    expect(copy).toEqual(sim.world)
    const twin = new Sim(copy, sim.library)
    run(sim, 3.5)
    run(twin, 3.5)
    expect(twin.world.sky).toEqual(sim.world.sky)
  })

  it('gives a world from before the sky a sky when the sim takes it in', () => {
    const sim = makeSim()
    const old = structuredClone(sim.world)
    delete old.sky
    delete old.terrain
    const again = new Sim(old, sim.library)
    expect(again.world.sky!.time).toBe(START_TIME)
    expect(again.world.terrain!.forest.water).toBe(1)
  })

  it('blows light puffs along with the wind, and leaves falling ones alone', () => {
    const sim = makeSim()
    sim.api.sky.wind = 1
    sim.api.puff({ x: 0, y: 2, z: 0, kind: 'smoke', speed: 0, count: 3, life: 3 })
    sim.api.puff({ x: 0, y: 2, z: 0, kind: 'drop', speed: 0, count: 3, life: 3 })
    run(sim, 1)
    const smoke = sim.world.puffs.filter((p) => p.kind === 'smoke')
    const drops = sim.world.puffs.filter((p) => p.kind === 'drop')
    for (const p of smoke) expect(p.x).toBeGreaterThan(2)
    for (const p of drops) expect(Math.abs(p.x)).toBeLessThan(0.01)
  })
})

describe('the water and the ground', () => {
  it('empties the pool: its surface sinks to the floor, nobody swims or floats, and w.water says dry', () => {
    const sim = makeSim({ room: 'pool', layouts: { pool: [{ kind: 'ball', x: 0, z: -3 }] } })
    const w = sim.world
    const floor = ROOM_GEO.pool.floor
    const ball = w.items[0]!
    run(sim, 1)
    expect(ball.y).toBeCloseTo(WATER_Y, 1)
    expect(sim.api.pool.y).toBeCloseTo(WATER_Y, 9)
    sim.api.pool.fade({ level: 0 }, 2)
    run(sim, 1)
    expect(sim.api.pool.y).toBeGreaterThan(floor)
    expect(sim.api.pool.y).toBeLessThan(WATER_Y)
    run(sim, 3)
    expect(sim.api.pool.level).toBe(0)
    expect(waterTop(w)).toBe(floor)
    expect(sim.api.water(0, -3)).toBe(false)
    // The ball came down to the floor and lies there.
    expect(ball.y + sim.library.info('ball').recipe.bounds.min[1]).toBeCloseTo(floor, 2)
    expect(ball.loose).toBe(false)
    // A small one in the empty pool stands on its floor; in a full pool it swam at the top.
    const cat = { look: { ...w.actors[0]!.look, height: 0.5 }, scale: 1 }
    expect(restHeight(w, cat, 0, -3, floor)).toBe(floor)
    sim.api.pool.level = 1
    expect(restHeight(w, cat, 0, -3, floor)).toBeGreaterThan(floor)
    // Filled again, the ball floats up to the surface.
    run(sim, 3)
    expect(ball.y).toBeCloseTo(WATER_Y, 1)
  })

  it('half full: the surface is half way and a kid wades on the floor while a cat swims', () => {
    const sim = makeSim({ room: 'pool' })
    const w = sim.world
    sim.api.pool.level = 0.5
    const floor = ROOM_GEO.pool.floor
    expect(waterTop(w)).toBeCloseTo((floor + WATER_Y) / 2, 9)
    expect(wetAt(w, 0, -3)).toBe(true)
    const kid = { look: w.actors[0]!.look, scale: 1 }
    expect(restHeight(w, kid, 0, -3, floor)).toBe(floor)
    const tiny = { look: { ...kid.look, height: 0.4 }, scale: 1 }
    expect(restHeight(w, tiny, 0, -3, floor)).toBeGreaterThan(floor)
  })

  it('keeps each room its own: the pool emptied stays empty after a visit to the forest', () => {
    const sim = makeSim({ room: 'pool' })
    sim.api.pool.level = 0.1
    sim.api.pool.color = 'green'
    sim.api.ground.color = 'white'
    sim.enterRoom('forest')
    expect(sim.api.pool.level).toBe(1)
    expect(sim.api.ground.color).toBe(null)
    sim.api.ground.fade({ color: 'white' }, 1)
    run(sim, 1.1)
    expect(sim.api.ground.color).toBe('#fbf8f2')
    sim.enterRoom('pool')
    expect(sim.world.terrain!.pool).toMatchObject({ water: 0.1, waterColor: '#5ec25a', ground: '#fbf8f2' })
  })

  it('lets code empty the pool a bucket at a time', () => {
    const sim = withAction('for (let i = 0; i < 4; i++) {\n  w.pool.level -= 0.25\n  yield* w.wait(0.1)\n}', { room: 'pool' })
    sim.give('alice', [step('act')], true)
    runUntil(sim, 'done', 'alice', 2)
    expect(sim.api.pool.level).toBe(0)
    expect(STEP).toBeGreaterThan(0)
  })
})
