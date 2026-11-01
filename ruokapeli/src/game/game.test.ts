import { describe, expect, it } from 'vitest'

import { Game, readSwitches, shoutFor } from './game'
import { HERO_SPEED, MAX_PICKS } from './model'

/** Runs the game's clock for `seconds` in frames of `frame` seconds. */
function run(game: Game, seconds: number, frame = 0.1) {
  for (let t = 0; t < seconds; t += frame) game.advance(frame)
}

describe('the game', () => {
  it('starts on the course cards, the first open and the rest locked', () => {
    const game = new Game('')
    expect(game.screen).toBe('courses')
    expect(game.isOpen(0)).toBe(true)
    expect(game.isOpen(1)).toBe(false)
    run(game, 1)
    expect(game.tapCard(1)).toBe(false)
    expect(game.screen).toBe('courses')
  })

  it('goes from a card to the kitchen, a dish, its fillings and onto the course', () => {
    const game = new Game('')
    run(game, 1)
    expect(game.tapCard(0)).toBe(true)
    expect(game.screen).toBe('kitchen')
    expect(game.kitchen).toBe('dish')
    game.pickDish('croissant')
    expect(game.kitchen).toBe('fillings')
    expect(game.picks).toEqual(['chocolate', 'banana'])
    expect(game.fillings('croissant')).toEqual(['chocolate', 'jam', 'banana', 'cream'])
    // A filling not yet open cannot be picked by the HUD; the open ones toggle, up to three.
    expect(game.toggleFilling('jam')).toBe(true)
    expect(game.toggleFilling('cream')).toBe(false)
    expect(game.picks).toHaveLength(MAX_PICKS)
    expect(game.toggleFilling('chocolate')).toBe(true)
    expect(game.picks).toEqual(['banana', 'jam'])
    game.kitchenBack()
    expect(game.kitchen).toBe('dish')
    game.pickDish('croissant')
    game.go()
    expect(game.screen).toBe('play')
    expect(game.sim.picks).toEqual(['banana', 'jam'])
    expect(game.sim.items.filter((it) => it.kind !== 'poop').map((it) => it.kind)).toContain('jam')
  })

  it('walks her by the keys, and toward a finger from where her feet are drawn', () => {
    const game = new Game('?course=1&dish=burger&fill=cheese')
    expect(game.screen).toBe('play')
    const x0 = game.sim.hero.x
    game.keyDirection(1, 0)
    run(game, 0.5)
    expect(game.sim.hero.x - x0).toBeGreaterThan(HERO_SPEED * 0.3)
    game.keyDirection(0, 0)
    const ss = game.screenspace
    ss.heroX = 500
    ss.heroY = 400
    ss.tile = 60
    // A finger three tiles above her: she walks up at full speed.
    game.point({ x: 500, y: 220 })
    run(game, 0.2)
    expect(game.sim.input.y).toBeCloseTo(-1, 6)
    expect(game.sim.input.x).toBeCloseTo(0, 6)
    // A finger on her feet: she stands.
    game.point({ x: 505, y: 405 })
    run(game, 0.1)
    expect(game.sim.input).toEqual({ x: 0, y: 0 })
    game.point(null)
    game.keyDirection(-1, 1)
    run(game, 0.1)
    expect(game.sim.input.x).toBeLessThan(0)
    expect(game.sim.input.y).toBeGreaterThan(0)
  })

  it('never pauses while a finger keeps steering, nor while the stars are up', () => {
    const game = new Game('?course=1&dish=burger&fill=cheese')
    const ss = game.screenspace
    ss.tile = 60
    for (let i = 0; i < 700; i++) {
      // A finger held down and sliding round her for 70 seconds.
      ss.heroX = 500
      ss.heroY = 400
      game.point({ x: 500 + Math.cos(i / 20) * 120, y: 400 + Math.sin(i / 20) * 120 })
      game.advance(0.1)
    }
    expect(game.paused).toBe(false)
    const feed = new Game('?course=1&dish=burger&fill=cheese&feed&autoplay')
    let guard = 0
    while (feed.starsAt < 0 && guard++ < 2000) feed.advance(0.1)
    feed.pause()
    expect(feed.paused).toBe(false)
  })

  it('starting fresh locks the fillings again, and the kitchen drops the locked ones from the dish', () => {
    const game = new Game('?all')
    run(game, 1)
    game.tapCard(0)
    game.pickDish('burger')
    game.toggleFilling('patty')
    game.toggleFilling('cheese')
    game.toggleFilling('salad')
    game.toggleFilling('onion')
    game.toggleFilling('ketchup')
    expect(game.picks).toEqual(['onion', 'ketchup'])
    const fresh = new Game('')
    fresh.dish = 'burger'
    fresh.picks = ['onion', 'ketchup', 'patty']
    fresh.pickDish('burger')
    expect(fresh.picks).toEqual(['patty'])
  })

  it('pauses on request, when the page goes away, and after a minute of nothing', () => {
    const game = new Game('?course=1&dish=burger&fill=cheese')
    game.pause()
    expect(game.paused).toBe(true)
    const tick = game.sim.tick
    run(game, 1)
    expect(game.sim.tick).toBe(tick)
    game.resume()
    run(game, 1)
    expect(game.sim.tick).toBeGreaterThan(tick)
    game.away()
    expect(game.paused).toBe(true)
    game.resume()
    run(game, 61, 0.1)
    expect(game.paused).toBe(true)
  })

  it('plays a whole course and its finale by itself with ?autoplay, then brings the monster home', () => {
    const game = new Game('?course=park&dish=burger&fill=patty,cheese&autoplay')
    let guard = 0
    while (game.screen === 'play' && guard++ < 3000) game.advance(0.1)
    expect(game.screen).toBe('feed')
    expect(game.feed!.queue.length).toBe(game.course.foods.length + 2)
    while (game.starsAt < 0 && guard++ < 6000) game.advance(0.1)
    expect(game.feed!.stars).toBe(3)
    expect(game.save.stars.park).toBe(3)
    run(game, 5)
    expect(game.screen).toBe('courses')
    expect(game.homecoming).toMatchObject({ index: 0, stars: 3, opened: 1, newFood: true })
    expect(game.isOpen(1)).toBe(true)
    expect(game.fillings('burger')).toHaveLength(5)
  })

  it('reads its switches, and says what is wrong with a bad one', () => {
    expect(readSwitches('?course=2&dish=croissant&fill=jam,cream')).toMatchObject({ course: 1, dish: 'croissant', fill: ['jam', 'cream'] })
    expect(() => readSwitches('?course=moon')).toThrow(/park, pond, garden, farm, castle/)
    expect(() => readSwitches('?course=1&dish=pizza')).toThrow(/burger or croissant/)
    expect(() => readSwitches('?course=1&dish=burger&fill=cheese,patty,salad,tomato')).toThrow(/one to 3/)
    expect(() => readSwitches('?autoplay')).toThrow(/need \?course/)
    expect(() => readSwitches('?course=1&fill=jam')).toThrow(/needs &dish/)
  })

  it('shouts on the moments that matter', () => {
    expect(shoutFor({ kind: 'pick', food: 'poop', n: 3, x: 0, y: 0 })).toBe('Yuck!')
    expect(shoutFor({ kind: 'pick', food: 'cheese', n: 5, x: 0, y: 0 })).toBe('Yum!')
    expect(shoutFor({ kind: 'pick', food: 'cheese', n: 4, x: 0, y: 0 })).toBeNull()
    expect(shoutFor({ kind: 'bonk', n: 0, x: 0, y: 0 })).toBeNull()
    expect(shoutFor({ kind: 'bread', dish: 'croissant' })).toBe('Croissant!')
  })
})
