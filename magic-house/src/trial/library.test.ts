/**
 * Every kept room in magic-house/library/rooms/ passes the trial, run in Node behind the guard
 * (plan.md, Where things run: a kept room is a whole game, and an engine change that breaks one must
 * turn a test red, not ship a dead room). Each is trialled from the guarded code the page runs, on
 * its own seed, at every level and at the level of the party that asked on the second seed; the
 * guard today still writes the same guarded code from what was written; and the bots still take
 * the seconds its file says, which the next request tells Opus beside the children's time. Every
 * kept present in magic-house/library/wear/ likewise: guarded as the guard writes it today, and
 * passing the page's check (trial/giftCheck.ts), since presents ship in the build and are worn.
 */

import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { PASS, TRIAL, type Level } from '../engine/api'
import type { GiftFile, RoomFile } from '../protocol'
import { guardCode } from '../server/codeKinds'
import { Store } from '../server/store'
import { checkGifts } from './giftCheck'
import { jobRoom, runTrial } from './trial'

/** Every file of a library folder, by name. */
const filesIn = <T>(dir: string): T[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T)
    : []

const ROOMS = 'magic-house/library/rooms'
const kept = filesIn<RoomFile>(ROOMS)
const WEAR = 'magic-house/library/wear'
const presents = filesIn<GiftFile>(WEAR)
/** How far the bots' seconds may drift from the file's: the file keeps them to a tenth. */
const SECS_NEAR = 0.1

describe('the library folder', () => {
  it('has an index.json that says what the store derives from the files, and every file is read without a warning', () => {
    const warnings: string[] = []
    const store = new Store('magic-house/library', (m) => warnings.push(m))
    const text = fs.readFileSync('magic-house/library/index.json', 'utf8')
    // index() writes the file when it differs, so the file is read before and after: a test never changes the library.
    expect(`${JSON.stringify(store.index(), null, 2)}\n`).toBe(text)
    expect(fs.readFileSync('magic-house/library/index.json', 'utf8')).toBe(text)
    expect(warnings).toEqual([])
    expect(JSON.parse(text).rooms.map((r: { id: string }) => r.id)).toEqual(kept.map((r) => r.id))
  })
})

describe('the kept rooms', () => {
  it('are each a room file named by its id', () => {
    for (const room of kept) {
      expect(fs.existsSync(path.join(ROOMS, `${room.id}.json`)), room.id).toBe(true)
      expect([1, 2, 3, 4]).toContain(room.party)
    }
  })

  it.each(kept.map((r) => [r.id, r] as const))(
    '%s is guarded as the guard writes it today, and passes the trial',
    (_, room) => {
      for (const [kind, written, guarded] of [['room', room.room, room.roomGuarded], ['walk', room.walk, room.walkGuarded]] as const) {
        const g = guardCode(kind, written)
        expect(g.ok ? g.guarded : g.error).toBe(guarded)
      }
      const r = runTrial(jobRoom({ line: room.id, attempt: 1, party: room.party, seed: room.seed, roll: room.roll, level: room.level, shell: room.shell, room: room.roomGuarded, walk: room.walkGuarded }), () => performance.now())
      expect(r.sentences).toEqual([])
      for (const secs of Object.values(r.botSecs ?? {})) expect(secs).toBeGreaterThanOrEqual(PASS.minSecs)
      for (const level of [1, 2, 3] as const satisfies readonly Level[]) expect(Math.abs(r.botSecs![level] - room.botSecs[level]), `the bots' seconds at level ${level}`).toBeLessThanOrEqual(SECS_NEAR)
    },
    TRIAL.realSecs * 1000 * 2,
  )
})

describe('the kept presents', () => {
  it.each(presents.map((g) => [g.id, g] as const))('%s is guarded as the guard writes it today, and passes the check', (_, gift) => {
    expect(fs.existsSync(path.join(WEAR, `${gift.id}.json`)), gift.id).toBe(true)
    const g = guardCode('gift', gift.code)
    expect(g.ok ? g.guarded : g.error).toBe(gift.guarded)
    const report = checkGifts({ room: gift.room, gifts: [{ slot: gift.slot, name: gift.name, form: gift.form, code: gift.guarded }] })
    expect(report.checks).toEqual([{ passed: true, sentences: [] }])
  })
})
