import { afterEach, describe, expect, it, vi } from 'vitest'

import { MORE_TEMPLATES, STORY } from './jobs'
import { freshSave, hasProgress, parseSave, serializeSave } from './progress'
import type { Save } from './progress'

const SEED = 31337
const FRESH = freshSave(SEED)

const played: Save = {
  storyDone: 5,
  moreDone: 2,
  coins: 41.25,
  stars: 12,
  mode: 'pro',
  sound: false,
  music: true,
  paints: { ...FRESH.paints, digger: 'purple' },
  owned: [...FRESH.owned, 'purple'],
  driver: { species: 'fox', hat: '#ff6fa8' },
  picked: true,
  golden: true,
  seed: 987654,
  lastTemplate: 3,
}

afterEach(() => vi.restoreAllMocks())

describe('the save', () => {
  it('round-trips', () => {
    expect(parseSave(serializeSave(played), SEED)).toEqual({ save: played, trouble: false })
    expect(parseSave(serializeSave(FRESH), SEED)).toEqual({ save: FRESH, trouble: false })
  })

  it('is fresh when nothing is stored', () => {
    expect(parseSave(null, SEED)).toEqual({ save: FRESH, trouble: false })
    expect(parseSave(null, 5).save.seed).toBe(5)
  })

  it('starts fresh, with one warning and trouble, when the text is not an object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseSave('{not json', SEED)).toEqual({ save: FRESH, trouble: true })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(parseSave('[]', SEED)).toEqual({ save: FRESH, trouble: true })
    expect(parseSave('null', SEED)).toEqual({ save: FRESH, trouble: true })
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('gives a missing field its default without fuss, keeping the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Without `owned` the purple digger is a paint nobody owns, which is a bad paint, not a missing field.
    for (const key of (Object.keys(played) as (keyof Save)[]).filter((k) => k !== 'owned')) {
      const copy: Partial<Save> = { ...played }
      delete copy[key]
      const { save, trouble } = parseSave(JSON.stringify(copy), SEED)
      expect(trouble, key).toBe(false)
      expect(save, key).toEqual({ ...played, [key]: key === 'seed' ? SEED : key === 'lastTemplate' ? -1 : FRESH[key] })
    }
    expect(parseSave(JSON.stringify({ ...played, paints: FRESH.paints, owned: undefined }), SEED)).toEqual({ save: { ...played, paints: FRESH.paints, owned: FRESH.owned }, trouble: false })
    const { save, trouble } = parseSave(JSON.stringify({ ...played, paints: { digger: 'purple' }, driver: { species: 'fox' } }), SEED)
    expect(trouble).toBe(false)
    expect(save.paints).toEqual({ ...FRESH.paints, digger: 'purple' })
    expect(save.driver).toEqual({ species: 'fox', hat: FRESH.driver.hat })
    expect(warn).not.toHaveBeenCalled()
  })

  it('mends a bad field, keeps every good one, and warns once with trouble', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mend = (bad: Record<string, unknown>) => {
      warn.mockClear()
      const out = parseSave(JSON.stringify({ ...played, ...bad }), SEED)
      expect(out.trouble, JSON.stringify(bad)).toBe(true)
      expect(warn).toHaveBeenCalledTimes(1)
      return out.save
    }
    expect(mend({ storyDone: STORY.length + 1 })).toEqual({ ...played, storyDone: STORY.length })
    expect(mend({ storyDone: 'many' })).toEqual({ ...played, storyDone: 0 })
    expect(mend({ storyDone: -1 })).toEqual({ ...played, storyDone: 0 })
    expect(mend({ mode: 'hard' })).toEqual({ ...played, mode: 'easy' })
    expect(mend({ coins: -1 })).toEqual({ ...played, coins: 0 })
    expect(mend({ coins: '7' })).toEqual({ ...played, coins: 0 })
    expect(mend({ stars: 1.5 })).toEqual({ ...played, stars: 0 })
    expect(mend({ sound: 1 })).toEqual({ ...played, sound: true })
    expect(mend({ driver: { species: 'fox', hat: 'red' } })).toEqual({ ...played, driver: { species: 'fox', hat: FRESH.driver.hat } })
    expect(mend({ driver: 'fox' })).toEqual({ ...played, driver: FRESH.driver })
    expect(mend({ lastTemplate: -2 })).toEqual({ ...played, lastTemplate: -1 })
    expect(mend({ lastTemplate: MORE_TEMPLATES.length })).toEqual({ ...played, lastTemplate: -1 })
    expect(mend({ seed: 'x' })).toEqual({ ...played, seed: SEED })
    expect(mend({ owned: [...played.owned, 'sparkly'] })).toEqual(played)
    expect(mend({ owned: ['yellow', 'orange'] }).owned).toEqual(FRESH.owned)
    expect(mend({ owned: 'all' }).owned).toEqual(FRESH.owned)
    expect(mend({ paints: { ...played.paints, digger: 'sparkly' } })).toEqual({ ...played, paints: { ...played.paints, digger: FRESH.paints.digger } })
    expect(mend({ paints: { ...played.paints, dozer: 'gold' }, owned: FRESH.owned }).paints.digger).toBe(FRESH.paints.digger)
  })

  it('names the bad fields in the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseSave(JSON.stringify({ ...played, coins: -1, mode: 'x' }), SEED)
    expect(String(warn.mock.calls[0][0])).toContain('coins, mode')
  })

  it('knows a save with progress', () => {
    expect(hasProgress(FRESH)).toBe(false)
    expect(hasProgress({ ...FRESH, picked: true, sound: false })).toBe(false)
    expect(hasProgress({ ...FRESH, storyDone: 1 })).toBe(true)
    expect(hasProgress({ ...FRESH, moreDone: 1 })).toBe(true)
    expect(hasProgress({ ...FRESH, coins: 0.5 })).toBe(true)
    expect(hasProgress({ ...FRESH, stars: 1 })).toBe(true)
    expect(hasProgress({ ...FRESH, owned: [...FRESH.owned, 'purple'] })).toBe(true)
  })

  it('keeps the fresh one frozen', () => {
    expect(() => {
      ;(FRESH as Save).coins = 5
    }).toThrow()
    expect(() => {
      ;(FRESH.paints as Save['paints']).digger = 'red'
    }).toThrow()
  })
})
