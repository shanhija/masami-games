import { describe, expect, it } from 'vitest'

import { dotRow, DOTS_MAX, layoutKey, RING_STEPS, signLayout } from './signLayout'

describe('a sign laid out', () => {
  it('writes a number as the language does', () => {
    expect(signLayout(3, 0, 'en')).toEqual({ kind: 'text', text: '3' })
    expect(signLayout(2.5, 0, 'en')).toEqual({ kind: 'text', text: '2.5' })
    expect(signLayout(2.5, 0, 'fi')).toEqual({ kind: 'text', text: '2,5' })
    expect(signLayout(12000, 0, 'en')).toEqual({ kind: 'text', text: '12000' })
  })

  it("writes words in the page's language", () => {
    const words = { en: 'Find the star', fi: 'Etsi tähti' }
    expect(signLayout(words, 0, 'en')).toEqual({ kind: 'text', text: 'Find the star' })
    expect(signLayout(words, 0, 'fi')).toEqual({ kind: 'text', text: 'Etsi tähti' })
  })

  it('shows a count as dots, the filled ones first, and as numbers past DOTS_MAX', () => {
    expect(signLayout({ count: 2, of: 5 }, 0, 'en')).toEqual({ kind: 'dots', filled: 2, of: 5 })
    expect(signLayout({ count: 9, of: 5 }, 0, 'en')).toEqual({ kind: 'dots', filled: 5, of: 5 })
    expect(signLayout({ count: -1, of: 3 }, 0, 'en')).toEqual({ kind: 'dots', filled: 0, of: 3 })
    expect(signLayout({ count: 4, of: DOTS_MAX + 2 }, 0, 'fi')).toEqual({ kind: 'text', text: '4 / 12' })
    const row = dotRow(2, 5)
    expect(row.map((d) => d.x)).toEqual([-2, -1, 0, 1, 2])
    expect(row.map((d) => d.filled)).toEqual([true, true, false, false, false])
    expect(dotRow(1, 2).map((d) => d.x)).toEqual([-0.5, 0.5])
  })

  it('shows a clock as a ring that empties from when it was written', () => {
    const clock = { clock: 60, from: 10 }
    expect(signLayout(clock, 10, 'en')).toEqual({ kind: 'ring', left: 1 })
    expect(signLayout(clock, 40, 'en')).toEqual({ kind: 'ring', left: 0.5 })
    expect(signLayout(clock, 100, 'en')).toEqual({ kind: 'ring', left: 0 })
    expect(signLayout(clock, 5, 'en')).toEqual({ kind: 'ring', left: 1 })
  })

  it('is painted again only when its picture changes: a ring a step at a time', () => {
    const clock = { clock: 60, from: 0 }
    const key = (t: number) => layoutKey(signLayout(clock, t, 'en'))
    expect(key(0.1)).toBe(key(0.2))
    expect(key(0.1)).not.toBe(key(0.1 + 60 / RING_STEPS))
    expect(layoutKey(signLayout(3, 0, 'en'))).not.toBe(layoutKey(signLayout(4, 0, 'en')))
  })
})
