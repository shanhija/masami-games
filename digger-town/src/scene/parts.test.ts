import { describe, expect, it, vi } from 'vitest'

import { LOOSE_KINDS } from '../game/model'
import { bakedParts, box, contrastOf, holdBaked, moundGeo, part, partsOf } from './parts'

describe('moundGeo', () => {
  it('has one shape per kind of stuff, ready at load, each in its own colour', () => {
    expect(new Set(LOOSE_KINDS.map(moundGeo)).size).toBe(LOOSE_KINDS.length)
    const means = LOOSE_KINDS.map((kind) => {
      const colour = moundGeo(kind).attributes.color
      return [0, 1, 2].map((c) => Array.from({ length: colour.count }, (_, i) => colour.getComponent(i, c)).reduce((a, b) => a + b) / colour.count).join()
    })
    expect(new Set(means).size).toBe(LOOSE_KINDS.length)
  })
})

/** The sweeps the earlier tests scheduled, which free their never-held bakes, run first. */
const settle = () => new Promise((done) => setTimeout(done, 1100))

describe('bakedParts', () => {
  const list = () => [part(box(1, 1, 1), 'enamel', [0, 0, 0]), part(box(0.2, 0.2, 0.2), 'rubber', [1, 0, 0])]

  it('gives the same geometry for the same parts and paint, and another for another paint', () => {
    const parts = list()
    expect(bakedParts(parts, '#ff0000').solid).toBe(bakedParts(parts, '#ff0000').solid)
    expect(bakedParts(parts, '#00ff00').solid).not.toBe(bakedParts(parts, '#ff0000').solid)
  })

  it('shares one list per key', () => {
    const make = () => list()
    expect(partsOf('test-list', make)).toBe(partsOf('test-list', make))
  })

  it('refuses a key that meets other code, which would be ignored', () => {
    partsOf('test-clash', () => list())
    expect(() => partsOf('test-clash', () => [])).toThrow('test-clash')
  })

  it('colours a contrast part by the paint without another list', () => {
    const parts = [part(box(1, 1, 1), 'trim', [0, 0, 0], { contrast: true })]
    const first = (paint: string) => bakedParts(parts, paint).solid.attributes.color.getX(0)
    expect(contrastOf('#ffffff')).not.toBe(contrastOf('#222222'))
    expect(first('#ffffff')).not.toBeCloseTo(first('#222222'), 2)
  })

  it('frees a bake that was made but never held, on the second sweep', async () => {
    await settle()
    vi.useFakeTimers()
    try {
      const parts = list()
      const baked = bakedParts(parts, '#abcdef')
      let disposed = 0
      baked.solid.addEventListener('dispose', () => disposed++)
      vi.advanceTimersByTime(1)
      expect(disposed).toBe(0)
      vi.advanceTimersByTime(1500)
      expect(disposed).toBe(1)
      expect(bakedParts(parts, '#abcdef').solid).not.toBe(baked.solid)
      vi.runAllTimers()
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds a bake the sweep freed before its component committed', async () => {
    await settle()
    vi.useFakeTimers()
    try {
      const parts = list()
      const baked = bakedParts(parts, '#a1b2c3')
      vi.runAllTimers()
      let release = () => {}
      expect(() => {
        release = holdBaked(parts, '#a1b2c3', baked)
      }).not.toThrow()
      vi.runAllTimers()
      expect(bakedParts(parts, '#a1b2c3').solid).toBe(baked.solid)
      expect(baked.solid.getAttribute('position').count).toBeGreaterThan(0)
      release()
      vi.runAllTimers()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a bake a mounted component holds and the newest idle one, and disposes the older idle ones', async () => {
    await settle()
    vi.useFakeTimers()
    try {
      const parts = list()
      const disposed: string[] = []
      const bakes = ['#111111', '#222222', '#333333'].map((paint) => {
        const baked = bakedParts(parts, paint)
        baked.solid.addEventListener('dispose', () => disposed.push(paint))
        return { paint, baked, release: holdBaked(parts, paint, baked) }
      })
      vi.runAllTimers()
      expect(disposed).toEqual([])
      bakes[0].release()
      bakes[1].release()
      vi.runAllTimers()
      expect(disposed).toEqual(['#111111'])
      expect(bakedParts(parts, '#222222').solid).toBe(bakes[1].baked.solid)
      expect(bakedParts(parts, '#333333').solid).toBe(bakes[2].baked.solid)
      // Held again before the sweep: kept.
      const again = holdBaked(parts, '#222222', bakes[1].baked)
      bakes[2].release()
      vi.runAllTimers()
      expect(disposed).toEqual(['#111111'])
      again()
      // A bake that is made again after its disposal is a new geometry.
      expect(bakedParts(parts, '#111111').solid).not.toBe(bakes[0].baked.solid)
    } finally {
      vi.useRealTimers()
    }
  })
})
