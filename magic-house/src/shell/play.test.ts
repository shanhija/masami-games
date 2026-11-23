import { describe, expect, it } from 'vitest'

import { DT } from '../engine/state'
import type { World } from '../engine/world'
import { SEAT_COLORS } from '../seats/types'
import { FrameClock, MOST_FRAMES, newCues, parseDevice, partyFrom, playLog, seatsFromUrl } from './play'
import { hopRoom } from './testing'

describe('the frame clock', () => {
  it('plays whole sim frames at 60 a second, keeping the rest', () => {
    const clock = new FrameClock()
    expect(clock.advance(1 / 60)).toBe(1)
    expect(clock.advance(1 / 120)).toBe(0)
    expect(clock.advance(1 / 120)).toBe(1)
    let frames = 0
    for (let i = 0; i < 144; i++) frames += clock.advance(1 / 144)
    expect(frames).toBe(60)
  })

  it('drops what is more than a few frames behind', () => {
    const clock = new FrameClock()
    expect(clock.advance(3)).toBe(MOST_FRAMES)
    expect(clock.advance(DT)).toBe(1)
  })
})

describe('sound cues', () => {
  it('gives each cue once, in order', () => {
    const world = { sounds: [{ name: 'ding', serial: 4, at: null, born: 0 }, { name: 'pop', serial: 2, at: null, born: 0 }] } as unknown as World
    expect(newCues(world, 0)).toEqual({ names: ['pop', 'ding'], heard: 4 })
    expect(newCues(world, 2)).toEqual({ names: ['ding'], heard: 4 })
    expect(newCues(world, 4)).toEqual({ names: [], heard: 4 })
  })
})

describe('seats from the URL', () => {
  it('reads every kind of device', () => {
    expect(parseDevice('keys2')).toEqual({ kind: 'keys', zone: 2 })
    expect(parseDevice('touch1')).toEqual({ kind: 'touch', pad: 1 })
    expect(parseDevice('gamepad0')).toEqual({ kind: 'gamepad', index: 0 })
    expect(() => parseDevice('keys4')).toThrow(/not a device/)
    expect(() => parseDevice('mouse')).toThrow(/not a device/)
  })

  it('seats the device players in order, on key zones when no list is given', () => {
    const seats = seatsFromUrl(null, 2, ['a', 'b', 'c'])
    expect(seats.map((s) => [s.device, s.profile, s.color])).toEqual([
      [{ kind: 'keys', zone: 0 }, 'a', SEAT_COLORS[0]],
      [{ kind: 'keys', zone: 1 }, 'b', SEAT_COLORS[1]],
    ])
    expect(seatsFromUrl('touch1,keys3', 2, ['a', 'b']).map((s) => s.device)).toEqual([{ kind: 'touch', pad: 1 }, { kind: 'keys', zone: 3 }])
    expect(() => seatsFromUrl('keys0', 2, ['a', 'b'])).toThrow(/made for 2/)
    expect(() => seatsFromUrl('keys0,keys0', 2, ['a', 'b'])).toThrow(/twice/)
    expect(() => seatsFromUrl(null, 3, ['a'])).toThrow(/has 1 players/)
  })
})

describe('the party', () => {
  it('dresses each seat from its face, in its seat colour, with what their saves wear over it slot by slot', () => {
    const seats = seatsFromUrl(null, 2, ['a', null])
    const hat = { id: 'pirate-hat-12', main: '#ff5a4e', second: '#ffffff', pattern: 'plain' }
    const party = partyFrom(
      seats,
      (s) => (s.profile === 'a' ? { backdrop: 'sky', skin: 'cocoa', hair: 'bun', hairColour: 'blonde', eyes: 'dots', mouth: 'smile', extra: 'crown' } : null),
      (s) => (s.profile === 'a' ? { head: hat } : {}),
    )
    expect(party.map((m) => m.body.top)).toEqual([SEAT_COLORS[0], SEAT_COLORS[1]])
    expect(party[0].wear.hair?.id).toBe('own:hair-bun')
    expect(party[0].wear.head).toEqual(hat)
    expect(party[1].wear).toEqual({})
  })
})

describe('a room played', () => {
  const played = { end: 'finished', level: 2, secs: 212.5, restarts: 1, hints: 2, steps: { done: 2, of: 2 } } as const

  it('goes to the log with the party’s numbers only and a thumb for each player', () => {
    expect(playLog(hopRoom(3), played, '2026-11-22T10:00:00.000Z', ['up', null, 'down'])).toEqual({ room: 'test:hop3', at: '2026-11-22T10:00:00.000Z', level: 2, secs: 212.5, restarts: 1, hints: 2, end: 'finished', steps: { done: 2, of: 2 }, party: 3, thumbs: ['up', null, 'down'] })
    expect(() => playLog(hopRoom(3), played, '2026-11-22T10:00:00.000Z', [null])).toThrow('3 players and 1 thumbs')
  })
})
