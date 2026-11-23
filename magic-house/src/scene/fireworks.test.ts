/**
 * The fireworks' plan: nothing before they begin, shells rising and then bursting into stars, every
 * light inside the frame and never more than the scene makes room for, the same lights every time,
 * and shells one after another opening apart.
 */

import { describe, expect, it } from 'vitest'

import { FIREWORKS, LIGHTS_MOST, lightsAt, shellOf, type FireFrame } from './fireworks'

const FRAME: FireFrame = { x: 0, y: 4.5, width: 16, height: 9 }

describe('the fireworks', () => {
  it('shine nothing before they begin, and a rising light first', () => {
    expect(lightsAt(-1, FRAME)).toEqual([])
    expect(lightsAt(0, FRAME)).toEqual([])
    const first = shellOf(0, FRAME)
    const rising = lightsAt(first.born + 0.3, FRAME)
    expect(rising.length).toBeGreaterThan(0)
    expect(rising.every((l) => l.kind === 'glow')).toBe(true)
  })

  it('burst into stars at the top of their rise, which spread and fade', () => {
    const s = shellOf(0, FRAME)
    const at = (since: number) => lightsAt(since, FRAME).filter((l) => l.kind === 'star' && l.color === s.color && Math.abs(l.x - s.x) < FRAME.height * FIREWORKS.spread * 1.2)
    const early = at(s.born + FIREWORKS.rise + 0.1)
    const late = at(s.born + FIREWORKS.rise + FIREWORKS.burst * 0.9)
    expect(early.length).toBeGreaterThanOrEqual(FIREWORKS.stars)
    const spread = (list: typeof early) => Math.max(...list.map((l) => Math.hypot(l.x - s.x, l.y - s.top)))
    expect(spread(late)).toBeGreaterThan(spread(early))
    expect(Math.max(...late.map((l) => l.bright))).toBeLessThan(Math.max(...early.map((l) => l.bright)))
  })

  it('keep every light inside the frame and within what the scene draws, for half a minute', () => {
    for (let since = 0; since < 30; since += 0.05) {
      const lights = lightsAt(since, FRAME)
      expect(lights.filter((l) => l.kind === 'star').length).toBeLessThanOrEqual(LIGHTS_MOST.stars)
      expect(lights.filter((l) => l.kind === 'glow').length).toBeLessThanOrEqual(LIGHTS_MOST.glows)
      for (const l of lights) {
        expect(Math.abs(l.x - FRAME.x)).toBeLessThan(FRAME.width / 2)
        expect(Math.abs(l.y - FRAME.y)).toBeLessThan(FRAME.height / 2)
        expect(l.bright).toBeGreaterThanOrEqual(0)
        expect(l.bright).toBeLessThanOrEqual(1)
      }
    }
  })

  it('are the same every time, and open one after another far apart', () => {
    expect(lightsAt(7.3, FRAME)).toEqual(lightsAt(7.3, FRAME))
    for (let n = 0; n < 20; n++) {
      const [a, b] = [shellOf(n, FRAME), shellOf(n + 1, FRAME)]
      expect(b.born).toBeGreaterThan(a.born)
      expect(Math.abs(b.x - a.x)).toBeGreaterThan(FRAME.width * 0.1)
    }
  })
})
