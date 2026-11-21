import { describe, expect, it } from 'vitest'

import { fogRange, sunOf } from './look'

describe('fogRange', () => {
  it('keeps the day own fog when the camera is near', () => {
    for (const dist of [0, 30]) {
      const { near, far } = fogRange(100, dist)
      expect(near).toBeCloseTo(55)
      expect(far).toBeCloseTo(100)
    }
  })

  it('starts behind the framed ground however far back the camera stands, with the same band', () => {
    for (const fogFar of [100, 120, 190]) {
      for (const dist of [20, 45, 60, 90]) {
        const { near, far } = fogRange(fogFar, dist)
        expect(near).toBeGreaterThanOrEqual(Math.min(dist, fogFar) * 1.3)
        expect(far - near).toBeCloseTo(fogFar * 0.45)
      }
    }
  })

  it('clamps a level view so the fog is not pushed off', () => {
    expect(fogRange(100, 1e6).near).toBe(130)
  })

  it('works at every time of day', () => {
    for (let d = 0; d <= 1; d += 0.05) {
      const { near, far } = fogRange(sunOf(d).fogFar, 70)
      expect(far).toBeGreaterThan(near)
    }
  })
})
