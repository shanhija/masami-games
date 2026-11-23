/**
 * The library on disk (store.ts): ids from the English name and a number, files in the protocol's
 * shape with their code guarded, the index oldest first, a file rewritten only when the guard's
 * output changes, one the guard refuses or of another version left out, a look added to a kept
 * room's file, and the fixture presents passing the page's check.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RoomFile } from '../protocol'
import { checkGift } from '../trial/giftCheck'
import { guardCode } from './codeKinds'
import { Store, type NewRoom } from './store'
import { BASE_ANSWER, GOOD_GIFTS, LOOK_ANSWER, LOOK_FIX } from './test/answers'

let dir = ''
let warned: string[] = []
let store: Store

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-house-store-test-'))
  warned = []
  store = new Store(dir, (m) => warned.push(m))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const guarded = (kind: 'room' | 'walk' | 'gift' | 'look', code: string) => {
  const g = guardCode(kind, code)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

const ROOM: NewRoom = {
  party: 4,
  seed: 404,
  roll: { kind: 'together', view: 'side' },
  level: 1,
  theme: BASE_ANSWER.theme,
  task: BASE_ANSWER.task,
  name: BASE_ANSWER.name,
  shell: BASE_ANSWER.shell,
  room: BASE_ANSWER.room,
  walk: BASE_ANSWER.walk,
  wish: '',
  botSecs: { 1: 67.7, 2: 79.3, 3: 93.2 },
}

const roomFile = (id: string) => path.join(dir, 'rooms', `${id}.json`)
const read = (id: string) => JSON.parse(fs.readFileSync(roomFile(id), 'utf8')) as RoomFile

describe('the store', () => {
  it('names a kept room by its first English words and a number past every number used', () => {
    const a = store.keepRoom(ROOM)
    const b = store.keepRoom(ROOM)
    const c = store.keepRoom({ ...ROOM, name: { en: 'Hörö the Big Brave Bear!', fi: 'Hörö' } })
    expect([a.id, b.id, c.id]).toEqual(['pirate-sails-1', 'pirate-sails-2', 'horo-the-big-brave-3'])
    expect(store.keepGift({ ...GOOD_GIFTS[0]!, room: a.id }).id).toBe('sea-crown-1')
  })

  it('writes the protocol shape with the code guarded, and the index oldest first', () => {
    const a = store.keepRoom(ROOM)
    const b = store.keepRoom({ ...ROOM, party: 2 })
    expect(Object.keys(read(a.id))).toEqual(['v', 'id', 'party', 'seed', 'roll', 'level', 'theme', 'task', 'name', 'shell', 'room', 'roomGuarded', 'walk', 'walkGuarded', 'look', 'lookGuarded', 'wish', 'lookWish', 'botSecs', 'made'])
    expect([read(a.id).roomGuarded, read(a.id).walkGuarded]).toEqual([guarded('room', ROOM.room), guarded('walk', ROOM.walk)])
    const gift = store.keepGift({ ...GOOD_GIFTS[1]!, room: a.id })
    expect(gift.guarded).toBe(guarded('gift', GOOD_GIFTS[1]!.code))
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
    expect(index).toEqual(store.index())
    expect([index.rooms.map((r: RoomFile) => r.id), index.gifts]).toEqual([[a.id, b.id], [{ id: gift.id, slot: 'body', name: GOOD_GIFTS[1]!.name, room: a.id }]])
    expect([store.room(a.id), store.room('../index'), store.room('nothing-1')]).toEqual([read(a.id), null, null])
  })

  it('rewrites a file only when the guard writes its code otherwise, and leaves out one it refuses', () => {
    const a = store.keepRoom(ROOM)
    const b = store.keepRoom(ROOM)
    const text = fs.readFileSync(roomFile(a.id), 'utf8')
    fs.writeFileSync(roomFile(b.id), JSON.stringify({ ...read(b.id), roomGuarded: 'stale' }, null, 2) + '\n')
    const before = fs.statSync(roomFile(a.id)).mtimeMs
    expect(store.index().rooms.map((r) => r.id)).toEqual([a.id, b.id])
    expect([fs.readFileSync(roomFile(a.id), 'utf8'), fs.statSync(roomFile(a.id)).mtimeMs]).toEqual([text, before])
    expect(read(b.id).roomGuarded).toBe(guarded('room', ROOM.room))
    fs.writeFileSync(roomFile(b.id), JSON.stringify({ ...read(b.id), room: 'Date.now()' }, null, 2) + '\n')
    expect(store.index().rooms.map((r) => r.id)).toEqual([a.id])
    expect(warned).toEqual([expect.stringMatching(new RegExp(`^library: left out rooms/${b.id}\\.json: .*Date`))])
  })

  it('leaves out a file made for another version of the house, with the sentence', () => {
    const a = store.keepRoom(ROOM)
    const b = store.keepRoom(ROOM)
    const { v, ...old } = read(b.id)
    fs.writeFileSync(roomFile(b.id), JSON.stringify(old, null, 2) + '\n')
    expect([v, store.index().rooms.map((r) => r.id)]).toEqual([2, [a.id]])
    expect(warned).toEqual([`library: left out rooms/${b.id}.json: it was made for version 1 of the house, and this house reads version 2`])
  })
})

describe("a room's look", () => {
  it('is kept without one, and the look is added to its file later, guarded, with its wish, the index unchanged', () => {
    const a = store.keepRoom(ROOM)
    expect([a.look, a.lookGuarded, a.lookWish]).toEqual([null, null, ''])
    const index = fs.readFileSync(path.join(dir, 'index.json'), 'utf8')
    const file = store.attachLook(a.id, LOOK_ANSWER.look, 'lamps that swing')
    expect(read(a.id)).toEqual(file)
    expect(file).toEqual({ ...a, look: LOOK_ANSWER.look, lookGuarded: guarded('look', LOOK_ANSWER.look), lookWish: 'lamps that swing' })
    expect(Object.keys(read(a.id))).toEqual(Object.keys(a))
    expect(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).toBe(index)
    // A look's fix replaces it; the room as read guards it again like its other code.
    store.attachLook(a.id, LOOK_FIX.look, '')
    expect([store.room(a.id)!.lookGuarded, store.room(a.id)!.lookWish]).toEqual([guarded('look', LOOK_FIX.look), ''])
  })

  it('is refused when the guard refuses it or there is no such room, and the file stays as it was', () => {
    const a = store.keepRoom(ROOM)
    const text = fs.readFileSync(roomFile(a.id), 'utf8')
    expect(() => store.attachLook(a.id, 'Date.now()', '')).toThrow(/Date/)
    expect(() => store.attachLook('nothing-1', LOOK_ANSWER.look, '')).toThrow('no kept room nothing-1')
    expect(fs.readFileSync(roomFile(a.id), 'utf8')).toBe(text)
  })
})

describe('dropping a kept room', () => {
  it('takes its file and its line in the index, keeps its presents, and logs why', () => {
    const a = store.keepRoom(ROOM)
    const b = store.keepRoom(ROOM)
    const gift = store.keepGift({ ...GOOD_GIFTS[0]!, room: a.id })
    store.dropRoom(a.id, 'it no longer passes')
    expect(fs.existsSync(roomFile(a.id))).toBe(false)
    expect(store.index()).toEqual({ rooms: [expect.objectContaining({ id: b.id })], gifts: [{ id: gift.id, slot: gift.slot, name: gift.name, room: a.id }] })
    const log = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(log.at(-1)).toMatchObject({ event: 'dropped from the library', room: a.id, botSecs: ROOM.botSecs, why: 'it no longer passes' })
    expect(() => store.dropRoom(a.id, 'again')).toThrow(`no kept room ${a.id}`)
  })
})

describe("the fixture presents", () => {
  it("pass the page's check", () => {
    for (const g of GOOD_GIFTS) expect([g.name.en, checkGift({ slot: g.slot, name: g.name, form: g.form, code: guarded('gift', g.code) })]).toEqual([g.name.en, { passed: true, sentences: [] }])
  })
})
