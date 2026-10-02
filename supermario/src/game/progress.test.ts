import { describe, expect, it } from 'vitest'

import { ROOMS } from './levels'
import { isOpen, openRoom, parseSave, roomDone, serializeSave, startFresh, type Save } from './progress'

const FRESH: Save = { v: 1, found: [], opened: [], best: { garden: 0, kitchen: 0, bath: 0, toys: 0, roof: 0 }, jar: 0, sound: true, music: true }
const SOME: Save = { v: 1, found: ['garden', 'kitchen'], opened: ['roof'], best: { garden: 31, kitchen: 12, bath: 0, toys: 0, roof: 0 }, jar: 77, sound: false, music: true }

describe('parseSave', () => {
  it('gives a fresh save, sound and music on, for nothing stored', () => {
    expect(parseSave(null)).toEqual(FRESH)
  })

  it('reads back what serializeSave wrote', () => {
    expect(parseSave(serializeSave(SOME))).toEqual(SOME)
    expect(parseSave(serializeSave(FRESH))).toEqual(FRESH)
  })

  it('gives a fresh save for junk', () => {
    const junk = [
      '',
      '{',
      'null',
      '42',
      '"hi"',
      '[]',
      '{}',
      JSON.stringify({ ...SOME, v: 2 }),
      JSON.stringify({ ...SOME, v: '1' }),
      JSON.stringify({ ...SOME, found: ['garden', 'attic'] }),
      JSON.stringify({ ...SOME, found: ['garden', 'garden'] }),
      JSON.stringify({ ...SOME, found: 'garden' }),
      JSON.stringify({ ...SOME, opened: null }),
      JSON.stringify({ ...SOME, best: { garden: 1 } }),
      JSON.stringify({ ...SOME, best: { ...SOME.best, attic: 3 } }),
      JSON.stringify({ ...SOME, best: { ...SOME.best, bath: -1 } }),
      JSON.stringify({ ...SOME, best: { ...SOME.best, bath: 1.5 } }),
      JSON.stringify({ ...SOME, best: [1, 2, 3, 4, 5] }),
      JSON.stringify({ ...SOME, jar: -3 }),
      JSON.stringify({ ...SOME, jar: '77' }),
      JSON.stringify({ ...SOME, sound: 'yes' }),
      JSON.stringify({ ...SOME, music: undefined }),
    ]
    for (const text of junk) expect(parseSave(text), text).toEqual(FRESH)
  })
})

describe('the rooms that are open', () => {
  it('opens the first room always and each next one once the room before has its kitten home', () => {
    expect(ROOMS.map((_, i) => isOpen(FRESH, i))).toEqual([true, false, false, false, false])
    const garden = roomDone(FRESH, 'garden', 5)
    expect(ROOMS.map((_, i) => isOpen(garden, i))).toEqual([true, true, false, false, false])
  })

  it('opens a room a parent opened, its kitten still to find', () => {
    const s = openRoom(FRESH, 'bath')
    expect(ROOMS.map((_, i) => isOpen(s, i))).toEqual([true, false, true, false, false])
    expect(s.found).toEqual([])
    expect(openRoom(s, 'bath')).toBe(s)
  })

  it('throws for a room that does not exist', () => {
    expect(() => isOpen(FRESH, ROOMS.length)).toThrow()
  })
})

describe('roomDone', () => {
  it('brings the kitten home once, keeps the best visit and fills the jar with every visit', () => {
    const a = roomDone(FRESH, 'garden', 20)
    expect(a.found).toEqual(['garden'])
    expect(a.best.garden).toBe(20)
    expect(a.jar).toBe(20)
    const b = roomDone(a, 'garden', 12)
    expect(b.found).toEqual(['garden'])
    expect(b.best.garden).toBe(20)
    expect(b.jar).toBe(32)
    const c = roomDone(b, 'kitchen', 7)
    expect(c.found).toEqual(['garden', 'kitchen'])
    expect(c.best).toEqual({ garden: 20, kitchen: 7, bath: 0, toys: 0, roof: 0 })
    expect(c.jar).toBe(39)
  })

  it('never changes the save it was given', () => {
    const before = serializeSave(SOME)
    roomDone(SOME, 'bath', 9)
    openRoom(SOME, 'toys')
    startFresh(SOME)
    expect(serializeSave(SOME)).toBe(before)
  })
})

describe('startFresh', () => {
  it('forgets the kittens, the opened rooms, the bests and the jar, and keeps Sound and Music', () => {
    expect(startFresh(SOME)).toEqual({ ...FRESH, sound: false, music: true })
    expect(startFresh({ ...SOME, sound: true, music: false })).toEqual({ ...FRESH, sound: true, music: false })
  })
})
