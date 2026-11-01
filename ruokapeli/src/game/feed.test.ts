import { describe, expect, it } from 'vitest'

import { balloonX, catcher, createFeed, landingOf, starsFor, steerFeed, stepFeed } from './feed'
import { DROP_FIRST, EAT_FOR, HZ, INTRO_FOR, MOUTH_HALF, TRACK_L, TRACK_R, type Feed, type FeedEvent } from './model'

/** Steps the finale to its end (or `seconds`), steering with `steer` before every step, gathering the events. */
function play(f: Feed, steer: (f: Feed) => void, seconds = 120): FeedEvent[] {
  const out: FeedEvent[] = []
  for (let i = 0; i < seconds * HZ && f.phase !== 'done'; i++) {
    steer(f)
    stepFeed(f)
    out.push(...f.events)
    f.events.length = 0
  }
  return out
}

/** The same, but dodging poops: under the next good layer only. */
function picky(f: Feed) {
  const next = f.falling.filter((it) => it.state === 'fall' && it.kind !== 'poop').sort((a, b) => landingOf(a) - landingOf(b))[0]
  const poop = f.falling.find((it) => it.state === 'fall' && it.kind === 'poop')
  if (next) steerFeed(f, 0, next.x)
  else if (poop) steerFeed(f, 0, poop.x > (TRACK_L + TRACK_R) / 2 ? TRACK_L : TRACK_R)
  else steerFeed(f, 0, f.balloon.x)
}

describe('the finale', () => {
  it('drops the bottom bread first, then the pile from the bottom, the top bread last', () => {
    const f = createFeed('park', 'burger', ['patty', 'cheese'], 10)
    expect(f.queue).toEqual(['bunBottom', 'patty', 'cheese', 'bunTop'])
    const events = play(f, catcher)
    expect(events.filter((e) => e.kind === 'drop').map((e) => (e.kind === 'drop' ? e.food : ''))).toEqual(['bunBottom', 'patty', 'cheese', 'bunTop'])
  })

  it('waits for the balloon to float in, then drops from the slot under it', () => {
    const f = createFeed('park', 'croissant', ['jam'], 4)
    const before = play(f, catcher, INTRO_FOR + DROP_FIRST - 0.05)
    expect(before.filter((e) => e.kind === 'drop')).toEqual([])
    const first = play(f, catcher, 0.1).find((e) => e.kind === 'drop')!
    expect(first.kind === 'drop' && first.x).toBeCloseTo(balloonX(f.falling[0]!.at), 9)
  })

  it('a monster steered under every layer eats them all: three stars, a burp, then done', () => {
    const pile = ['patty', 'cheese', 'salad', 'tomato', 'patty', 'cheese', 'salad', 'tomato', 'patty', 'cheese', 'salad', 'tomato'] as const
    const f = createFeed('park', 'burger', pile, 12)
    const events = play(f, catcher)
    expect(f.eaten).toBe(12)
    expect(f.breads).toBe(2)
    expect(f.missed).toBe(0)
    expect(f.phase).toBe('done')
    expect(f.stars).toBe(3)
    expect(events.filter((e) => e.kind === 'chomp')).toHaveLength(14)
    const order = events.map((e) => e.kind).filter((k) => k === 'full' || k === 'burp' || k === 'stars')
    expect(order).toEqual(['full', 'burp', 'stars'])
  })

  it('a monster that never moves misses most, and a bird comes for each miss', () => {
    const pile = Array.from({ length: 12 }, () => 'cheese' as const)
    const f = createFeed('park', 'burger', pile, 12)
    const events = play(f, (g) => steerFeed(g, 0, null))
    expect(f.missed).toBeGreaterThan(7)
    expect(events.filter((e) => e.kind === 'bird')).toHaveLength(f.missed)
    expect(f.stars).toBe(starsFor(f.eaten, 12))
  })

  it('spits out a poop it catches, and a careful steer dodges it', () => {
    const a = createFeed('park', 'burger', ['cheese', 'poop', 'cheese'], 3)
    const ate = play(a, catcher)
    expect(ate.filter((e) => e.kind === 'bleh')).toHaveLength(1)
    expect(a.spat).toBe(1)
    expect(a.eaten).toBe(2)
    const b = createFeed('park', 'burger', ['cheese', 'poop', 'cheese'], 3)
    play(b, picky)
    expect(b.spat).toBe(0)
    expect(b.eaten).toBe(2)
  })

  it('keeps the monster on its track and the balloon over it', () => {
    const f = createFeed('park', 'burger', ['cheese'], 1)
    play(f, (g) => steerFeed(g, -1, null), 3)
    expect(f.monster.x).toBe(TRACK_L)
    play(f, (g) => steerFeed(g, 1, null), 4)
    expect(f.monster.x).toBe(TRACK_R)
    for (let t = 0; t < 600; t += 0.37) {
      const x = balloonX(t * HZ)
      expect(x).toBeGreaterThan(TRACK_L)
      expect(x).toBeLessThan(TRACK_R)
    }
  })

  it('catches only within the mouth', () => {
    const f = createFeed('park', 'burger', [], 0)
    play(f, catcher, INTRO_FOR + DROP_FIRST + 0.01)
    const layer = f.falling[0]!
    // Stand just out of reach and wait for the bread to come down.
    play(f, (g) => steerFeed(g, 0, layer.x + MOUTH_HALF + 0.3), 4)
    expect(layer.state).toBe('missed')
  })

  it('gives stars for the share of the course eaten', () => {
    expect(starsFor(10, 12)).toBe(3)
    expect(starsFor(9, 12)).toBe(2)
    expect(starsFor(5, 12)).toBe(2)
    expect(starsFor(4, 12)).toBe(1)
    expect(starsFor(0, 12)).toBe(1)
    expect(EAT_FOR).toBeGreaterThan(1.2)
  })
})
