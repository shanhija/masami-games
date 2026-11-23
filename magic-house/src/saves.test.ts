import { afterEach, describe, expect, it, vi } from 'vitest'

import { memorySaves } from '../../profiles/src/profiles'
import { PASS } from './engine/api'
import { PLAYED_MOST, type RoomEntry } from './protocol'
import { HOUSE_SHELL } from './engine/world'
import {
  afterRoom,
  changeSaves,
  devicePlayers,
  foldParty,
  FRESH_SAVES,
  LEVEL_MOVE,
  movedLevel,
  parseSaves,
  partyHistory,
  partyLevel,
  partyPlayed,
  readSaves,
  restartLevel,
  roomResult,
  SAVES_KEY,
  SAVES_VERSION,
  seatedPlayers,
  storedText,
  withDevice,
  withPresent,
  withQuiz,
  withThumb,
  withWear,
  type DevicePlayer,
  type HouseSaves,
  type RoomResult,
} from './saves'
import { claimSeat, whoSits } from './seats/claim'
import type { Seat } from './seats/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** A result of `room` that ended at minute `minute` of one day, finished at level 1 in 200 s, no thumb, by the children. */
const result = (room: string, minute: number, more: Partial<RoomResult> = {}): RoomResult => ({
  room,
  at: `2026-11-22T10:${String(minute).padStart(2, '0')}:00.000Z`,
  level: 1,
  secs: 200,
  restarts: 0,
  hints: 0,
  end: 'finished',
  steps: { done: 3, of: 3 },
  thumb: null,
  bots: false,
  ...more,
})

const saves = (more: Partial<HouseSaves>): HouseSaves => ({ ...FRESH_SAVES, ...more })

const entry = (id: string, bots: [number, number, number]): RoomEntry => ({
  id,
  party: 2,
  roll: { kind: 'together', view: 'side' },
  theme: 'a theme',
  task: 'a task',
  shell: HOUSE_SHELL,
  name: { en: id, fi: `${id} fi` },
  botSecs: { 1: bots[0], 2: bots[1], 3: bots[2] },
  made: '2026-11-22T09:00:00.000Z',
})

describe('the stored form', () => {
  it('reads what it wrote, under its version', () => {
    const full = saves({ device: { kind: 'keys', zone: 2 }, quiz: { maths: 3, reading: 2 }, level: 2, rooms: [result('gate-keepers-1', 5, { thumb: 'up' })], owned: ['pirate-hat-12'], wear: { head: { id: 'pirate-hat-12', main: '#ff5a4e', second: '#ffffff', pattern: 'plain' } } })
    expect(JSON.parse(storedText(full)).version).toBe(SAVES_VERSION)
    expect(parseSaves(storedText(full))).toEqual(full)
  })

  it('starts afresh with nothing stored, and with a stored form that does not parse or is not this version’s, saying why', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseSaves(null)).toEqual(FRESH_SAVES)
    expect(warn).not.toHaveBeenCalled()
    const good = JSON.parse(storedText(FRESH_SAVES))
    const cases: [string, string][] = [
      ['{not json', 'do not parse'],
      ['[1, 2]', 'it is not an object'],
      [JSON.stringify({ ...good, version: 0 }), 'its version is 0, not 1'],
      [JSON.stringify({ ...good, device: { kind: 'keys', zone: 7 } }), 'its device is not one'],
      [JSON.stringify({ ...good, quiz: { maths: 0, reading: 1 } }), 'quiz levels'],
      [JSON.stringify({ ...good, level: 4 }), 'its level is not 1, 2 or 3'],
      [JSON.stringify({ ...good, rooms: [{ ...result('a', 1), end: 'lost' }] }), 'a room it played is not a result'],
      [JSON.stringify({ ...good, rooms: [{ ...result('a', 1), bots: undefined }] }), 'a room it played is not a result'],
      [JSON.stringify({ ...good, owned: [3] }), 'what it owns'],
      [JSON.stringify({ ...good, wear: { tail: { id: 'x', main: '#000000', second: '#000000', pattern: 'plain' } } }), 'what it wears'],
      [JSON.stringify({ ...good, wear: { head: { id: 'x', main: 'red', second: '#000000', pattern: 'plain' } } }), 'what it wears'],
    ]
    for (const [text, why] of cases) {
      warn.mockClear()
      expect(parseSaves(text), text).toEqual(FRESH_SAVES)
      expect(String(warn.mock.calls[0]![0]), text).toContain(why)
    }
  })

  it('reads and writes only under its one key, and a change reads first so another tab’s write is kept', () => {
    const store = memorySaves()
    expect(readSaves(store)).toEqual(FRESH_SAVES)
    changeSaves(store, (now) => withPresent(now, 'a'))
    expect([...store.items.keys()]).toEqual([SAVES_KEY])
    // Another tab gives the same player a present meanwhile.
    store.setItem(SAVES_KEY, storedText(withPresent(readSaves(store), 'b')))
    const written = changeSaves(store, (now) => withPresent(now, 'c'))
    expect(written.owned).toEqual(['a', 'b', 'c'])
    expect(readSaves(store)).toEqual(written)
  })
})

describe('the party, folded', () => {
  it('plays at the lowest level among its players', () => {
    expect(partyLevel([saves({ level: 3 }), saves({ level: 2 }), saves({ level: 3 })])).toBe(2)
    expect(() => partyLevel([])).toThrow('at least one player')
  })

  it('drops one level from the second start-again of a room on, never below 1', () => {
    expect([0, 1, 2, 5].map((n) => restartLevel(3, n))).toEqual([3, 3, 2, 2])
    expect(restartLevel(1, 4)).toBe(1)
  })

  it('counts a room played when any of the party played it, the bots’ plays too', () => {
    expect([...partyPlayed([saves({ rooms: [result('a', 1)] }), saves({ rooms: [result('b', 2, { bots: true })] }), saves({})])].sort()).toEqual(['a', 'b'])
  })

  it('tells the last plays of the party, newest first, each once with its thumbs counted and the bots’ seconds at the level played', () => {
    const rooms = [entry('gate', [70, 80, 90]), entry('crane', [66, 74, 86])]
    const a = saves({ rooms: [result('gate', 1, { thumb: 'up' }), result('crane', 2, { level: 2, secs: 400, restarts: 2, hints: 3, end: 'left', thumb: 'down' })] })
    const b = saves({ rooms: [result('gate', 1, { thumb: 'up' }), result('crane', 2, { level: 2, secs: 400, restarts: 2, hints: 3, end: 'left', thumb: null }), result('gate', 9, { thumb: 'down' })] })
    expect(partyHistory([a, b], rooms)).toEqual([
      { name: rooms[0].name, botSecs: 70, secs: 200, restarts: 0, hints: 0, end: 'finished', steps: { done: 3, of: 3 }, up: 0, down: 1 },
      { name: rooms[1].name, botSecs: 74, secs: 400, restarts: 2, hints: 3, end: 'left', steps: { done: 3, of: 3 }, up: 0, down: 1 },
      { name: rooms[0].name, botSecs: 70, secs: 200, restarts: 0, hints: 0, end: 'finished', steps: { done: 3, of: 3 }, up: 2, down: 0 },
    ])
  })

  it('leaves out the bots’ plays and rooms the library no longer has, and tells at most PLAYED_MOST', () => {
    const rooms = [entry('gate', [70, 80, 90])]
    const many = Array.from({ length: PLAYED_MOST + 3 }, (_, i) => result('gate', i + 10))
    const played = saves({ rooms: [result('gate', 59, { bots: true }), result('own:moon-garden', 58), result('dropped-room-1', 57), ...many] })
    const told = partyHistory([played], rooms)
    expect(told).toHaveLength(PLAYED_MOST)
    expect(told.every((p) => p.name.en === 'gate')).toBe(true)
    expect(foldParty([played, saves({ level: 2 })], rooms)).toEqual({ level: 1, played: new Set(['gate', 'own:moon-garden', 'dropped-room-1']), history: told })
  })
})

describe('how hard, after a room', () => {
  const bots = 80
  const finished = { secs: LEVEL_MOVE.fast * bots, restarts: 0, hints: 0, end: 'finished', steps: { done: 4, of: 4 } } as const

  it('climbs one when the room was finished fast with no hint and no start-again', () => {
    expect(movedLevel(1, 1, finished, bots)).toBe(2)
    expect(movedLevel(3, 3, finished, bots)).toBe(3)
    // A player above the room's level keeps theirs; the lowest climbs to one over the door.
    expect(movedLevel(3, 1, finished, bots)).toBe(3)
    expect(movedLevel(2, 1, finished, bots)).toBe(2)
  })

  it('stays with a hint, a start-again, or more than the fast time', () => {
    expect(movedLevel(2, 2, { ...finished, hints: 1 }, bots)).toBe(2)
    expect(movedLevel(2, 2, { ...finished, restarts: 1 }, bots)).toBe(2)
    expect(movedLevel(2, 2, { ...finished, secs: LEVEL_MOVE.fast * bots + 1 }, bots)).toBe(2)
  })

  it('drops one when the room was left, long fought or started again twice, for a player the room was played at', () => {
    expect(movedLevel(2, 2, { ...finished, end: 'left', secs: LEVEL_MOVE.leftSecs }, bots)).toBe(1)
    expect(movedLevel(3, 3, { ...finished, hints: 4, secs: LEVEL_MOVE.long * bots }, bots)).toBe(2)
    expect(movedLevel(2, 2, { ...finished, restarts: LEVEL_MOVE.restarts }, bots)).toBe(1)
    expect(movedLevel(1, 1, { ...finished, end: 'left', secs: 400 }, bots)).toBe(1)
    // Above the room's level, a player keeps theirs.
    expect(movedLevel(3, 2, { ...finished, end: 'left', secs: 400 }, bots)).toBe(3)
  })

  it('takes a room whose clock ran out with steps undone as long fought, never as fast, however quick its seconds', () => {
    // A clock room's bots' seconds are its clock, so the children's seconds come out at about the clock.
    const clocked = { ...finished, secs: 180, steps: { done: 1, of: 4 } }
    expect(movedLevel(2, 2, clocked, 180)).toBe(1)
    expect(movedLevel(1, 1, clocked, 180)).toBe(1)
    expect(movedLevel(3, 2, clocked, 180)).toBe(3)
    // Every step done before the clock: cleared, so it may climb.
    expect(movedLevel(1, 1, { ...clocked, steps: { done: 4, of: 4 } }, 180)).toBe(2)
  })

  it('moves nothing for a room left at once: it was not fought, only not wanted', () => {
    expect(movedLevel(2, 2, { ...finished, end: 'left', secs: LEVEL_MOVE.leftSecs - 1 }, bots)).toBe(2)
  })

  it('measures a room with no bots’ seconds kept against the seconds a room is planned for', () => {
    expect(LEVEL_MOVE.untimedSecs).toBe(PASS.aimSecs)
    expect(movedLevel(1, 1, { ...finished, secs: LEVEL_MOVE.fast * PASS.aimSecs }, null)).toBe(2)
    expect(movedLevel(1, 1, { ...finished, secs: LEVEL_MOVE.fast * PASS.aimSecs + 1 }, null)).toBe(1)
  })

  it('keeps a room’s result, moving the level by it, or not when the level was not the children’s own', () => {
    const r = result('gate', 3, { secs: 100 })
    expect(afterRoom(saves({ rooms: [result('a', 1)] }), r, { door: 1, botSecs: 70 })).toEqual(saves({ rooms: [result('a', 1), r], level: 2 }))
    expect(afterRoom(saves({}), r, null)).toEqual(saves({ rooms: [r] }))
  })
})

describe('a room’s result', () => {
  const room = { id: 'gate', botSecs: { 1: 70, 2: 80, 3: 90 } }
  const played = { level: 2, secs: 150, restarts: 0, hints: 0, end: 'finished', steps: { done: 4, of: 4 } } as const
  const at = '2026-11-22T10:00:00.000Z'

  it('is the children’s, with the bots’ seconds taken at the level played and the door’s level to move from', () => {
    expect(roomResult(room, played, at, 3, { autoplay: false, devLevel: false })).toEqual({
      result: { room: 'gate', at, level: 2, secs: 150, restarts: 0, hints: 0, end: 'finished', steps: { done: 4, of: 4 }, thumb: null, bots: false },
      move: { door: 3, botSecs: 80 },
    })
    expect(roomResult({ id: 'own:moon-garden', botSecs: null }, played, at, 1, { autoplay: false, devLevel: false }).move).toEqual({ door: 1, botSecs: null })
  })

  it('is the bots’ under ?autoplay and moves no level then, nor under a developer’s ?level', () => {
    const auto = roomResult(room, played, at, 2, { autoplay: true, devLevel: false })
    expect(auto.result.bots).toBe(true)
    expect(auto.move).toBeNull()
    const dev = roomResult(room, played, at, 2, { autoplay: false, devLevel: true })
    expect(dev.result.bots).toBe(false)
    expect(dev.move).toBeNull()
  })
})

describe('what a player keeps', () => {
  it('gives the thumb to the one play it was for, and warns when that play is gone', () => {
    const before = saves({ rooms: [result('gate', 1), result('gate', 2), result('crane', 2)] })
    expect(withThumb(before, 'gate', result('gate', 2).at, 'up').rooms.map((r) => r.thumb)).toEqual([null, 'up', null])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(withThumb(before, 'gate', result('gate', 7).at, 'up')).toBe(before)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('owns a present once, what they wear, their quiz levels from 1, and the device they sat at, a gamepad by its kind only', () => {
    expect(withPresent(withPresent(saves({}), 'a'), 'a').owned).toEqual(['a'])
    const wear = { hand: { id: 'gate-key-5', main: '#3d8bff', second: '#ffd23a', pattern: 'plain' } }
    expect(withWear(saves({}), wear).wear).toEqual(wear)
    expect(withQuiz(saves({}), { maths: 4, reading: 2 }).quiz).toEqual({ maths: 4, reading: 2 })
    expect(() => withQuiz(saves({}), { maths: 0, reading: 2 })).toThrow('whole numbers from 1')
    expect(withDevice(saves({}), { kind: 'gamepad', index: 3 }).device).toEqual({ kind: 'gamepad' })
    expect(withDevice(saves({}), { kind: 'touch', pad: 1 }).device).toEqual({ kind: 'touch', pad: 1 })
  })

  it('offers each device first to the player not seated yet who last sat at it, else to the face that breathes', () => {
    const players = ['a', 'b', 'c']
    const kept = [{ kind: 'keys', zone: 1 }, { kind: 'gamepad' }, null] as const
    let seats: Seat[] = []
    expect(whoSits(players, kept, seats, { kind: 'keys', zone: 1 }, 2)).toBe(0)
    expect(whoSits(players, kept, seats, { kind: 'gamepad', index: 2 }, 0)).toBe(1)
    expect(whoSits(players, kept, seats, { kind: 'keys', zone: 0 }, 2)).toBe(2)
    seats = claimSeat(seats, { kind: 'keys', zone: 0 }, 'a')!
    expect(whoSits(players, kept, seats, { kind: 'keys', zone: 1 }, 2)).toBe(2)
  })
})

describe('the party’s players', () => {
  it('seats each player with their face, name, own language and saves, in seat order', () => {
    const store = memorySaves()
    const players: DevicePlayer[] = [
      { profile: 'a', avatar: null, name: 'Aino', lang: 'fi', saves: store },
      { profile: 'b', avatar: null, name: 'Eeli', lang: 'en', saves: memorySaves() },
    ]
    const book = new Map([
      ['a', saves({ level: 2 })],
      ['b', saves({ level: 3 })],
    ])
    const seats = claimSeat(claimSeat([], { kind: 'keys', zone: 0 }, 'b')!, { kind: 'touch', pad: 0 }, 'a')!
    expect(seatedPlayers(seats, players, book).map((p) => [p.seat.index, p.name, p.lang, p.saves.level])).toEqual([
      [0, 'Eeli', 'en', 3],
      [1, 'Aino', 'fi', 2],
    ])
    expect(() => seatedPlayers(claimSeat([], { kind: 'keys', zone: 0 }, 'z')!, players, book)).toThrow('seat 0 is taken by z')
  })

  it('takes the picked player through enterGame and the others from the device’s profiles, each with their saves of the house and own language', () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return items.size
      },
      key: (i: number) => [...items.keys()][i] ?? null,
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    })
    const avatar = { backdrop: 'sky', skin: 'peach', hair: 'short', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'cap' } as const
    items.set('masami-profiles', JSON.stringify([{ id: 'p1', name: 'Aino', avatar, lang: 'fi' }, { id: 'p2', name: 'Eeli', avatar, lang: 'en' }]))
    items.set(`profile/p2/magic-house/${SAVES_KEY}`, storedText(saves({ level: 3 })))
    const picked = memorySaves()
    const players = devicePlayers({ saves: picked, lang: 'fi', profile: { id: 'p1', name: 'Aino', avatar, lang: 'fi' } })
    expect(players.map((p) => [p.profile, p.name, p.lang])).toEqual([
      ['p1', 'Aino', 'fi'],
      ['p2', 'Eeli', 'en'],
    ])
    expect(players[0].saves).toBe(picked)
    expect(readSaves(players[1].saves).level).toBe(3)
    const nobody = memorySaves()
    expect(devicePlayers({ saves: nobody, lang: 'en', profile: null })).toEqual([{ profile: null, avatar: null, name: null, lang: 'en', saves: nobody }])
  })
})
