import { describe, expect, it } from 'vitest'

import { fakeContext } from '../../../rakennustyömaat/src/draw/fakeContext'
import { Game } from '../game/game'
import { COURSES } from '../game/model'
import { Renderer } from './frame'

/** A renderer on a checking fake context (its baked chunks on fakes of their own), the size of a big iPad, with the debug overlay on. */
function setup(search: string) {
  const { ctx, check } = fakeContext()
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => fakeContext().ctx }) as unknown as HTMLCanvasElement
  const renderer = new Renderer(ctx, makeCanvas, true)
  renderer.resize(2360, 1640, 2)
  const game = new Game(search)
  /** Advances the game by `seconds` and draws it, checking the frame leaves the context as it found it. */
  const frame = (what: string, seconds: number) => check(what, () => renderer.draw(game, game.advance(seconds), seconds), 'allowed')
  return { game, renderer, frame }
}

describe('the renderer', () => {
  it('draws the course cards with the course drifting behind them', () => {
    const { game, frame } = setup('')
    for (let i = 0; i < 20; i++) frame(`cards frame ${i}`, 0.05)
    expect(game.screen).toBe('courses')
  })

  for (const id of COURSES) {
    // Thousands of frames of every drawing on the checking context: a minute, not the default five seconds.
    it(`draws ${id} while the bot plays it, then its finale to the stars`, { timeout: 60_000 }, () => {
      const { game, frame } = setup(`?course=${id}&dish=croissant&fill=jam,banana&autoplay`)
      let n = 0
      while (game.screen === 'play' && n < 2000) frame(`${id} at ${(n * 0.1).toFixed(1)} s`, 0.1), n++
      expect(game.screen).toBe('feed')
      while (game.starsAt < 0 && n < 4000) frame(`${id}'s finale at ${(n * 0.1).toFixed(1)} s`, 0.1), n++
      expect(game.feed!.stars).toBe(3)
      const ss = game.screenspace
      expect([ss.heroX, ss.heroY, ss.tile, ss.feedLeft, ss.feedScale].every(Number.isFinite)).toBe(true)
    })
  }

  it('draws her teetering, swimming and riding the frog home, and a knock with the food flying', () => {
    const { game, frame } = setup('?course=park&dish=burger&fill=cheese')
    // Straight down from the start: the lake is two rows below.
    game.keyDirection(0, 1)
    for (let i = 0; i < 60; i++) frame(`into the water ${i}`, 0.05)
    expect(['swim', 'frog', 'walk']).toContain(game.sim.hero.act)
    game.keyDirection(0, 0)
    for (let i = 0; i < 60; i++) frame(`home on the frog ${i}`, 0.05)
    expect(game.sim.hero.act).toBe('walk')
  })

  it('draws the party with all five monsters', () => {
    const { game, frame } = setup('')
    game.screen = 'party'
    for (let i = 0; i < 30; i++) frame(`party ${i}`, 0.05)
  })
})
