/**
 * The glowing door: a kept room of the party's size they have not played opens; else the room in
 * the making shows its bar; else nothing, and the page asks, unless three in a row were dropped
 * this visit or nothing can be asked for here. What the wait behind it does next, and the house's
 * plain doors. And the request it asks with, the line with the server's answer put in, the line as
 * heard by a page whose clock is not the server's, and the bar's fill by the server's clock.
 */

import { describe, expect, it } from 'vitest'

import type { Line, LineRoom, LibraryIndex, RoomEntry } from '../protocol'
import { HOUSE_SHELL } from '../engine/world'
import { afterWait, askNow, lookAwaited, lookWaitEnds, BAR_MOST, barAt, DROPS_STOP, dropsInARow, heard, houseDoors, newDoor, roomRequest, withRoom, type DoorFacts, type HeardLine } from './newDoor'

const T0 = Date.parse('2026-11-22T10:00:00Z')
const at = (secs: number) => new Date(T0 + secs * 1000).toISOString()

const entry = (id: string, party: 1 | 2 | 3 | 4): RoomEntry => ({ id, party, roll: { kind: 'together', view: 'side' }, theme: 'p', task: 't', name: { en: id, fi: id }, shell: HOUSE_SHELL, botSecs: { 1: 70, 2: 80, 3: 90 }, made: at(0) })
const lineRoom = (line: string, party: 1 | 2 | 3 | 4, state: LineRoom['state'], asked: number, kept: string | null = null, lookWaitUntil: string | null = null): LineRoom => ({ line, state, party, roll: { kind: 'together', view: 'side' }, level: 1, attempt: 1, asked: at(asked), name: null, kept, dropped: state === 'dropped' ? 'it failed' : null, look: 'none', lookWaitUntil })

/** A line the server said at T0 + 1000 s. */
const said = (rooms: LineRoom[], readySecs = 180): Line => ({ rooms, readySecs, now: at(1000) })
/** A line heard this visit, which began at T0 by the server's clock, on a page whose clock agrees. */
const asHeard = (line: Line): HeardLine => ({ line, skewMs: 0, visitStart: T0 })

function facts(over: Partial<Omit<DoorFacts, 'heard'>> & { line?: Line | null }): DoorFacts {
  const index: LibraryIndex = { rooms: [], gifts: [] }
  const { line, ...rest } = over
  return { party: 4, index, heard: line === null ? null : asHeard(line ?? said([])), played: new Set(), serverNow: T0 + 1000_000, ...rest }
}

describe('the new door', () => {
  it('opens the newest kept room of the party’s size they have not played', () => {
    const index = { rooms: [entry('a-1', 4), entry('b-1', 2), entry('c-1', 4)], gifts: [] }
    expect(newDoor(facts({ index }))).toEqual({ kind: 'ready', room: entry('c-1', 4) })
    expect(newDoor(facts({ index, played: new Set(['c-1']) }))).toEqual({ kind: 'ready', room: entry('a-1', 4) })
    // With nothing to ask with (the hosted build, no CLI), still a kept room they have not played.
    expect(newDoor(facts({ index, line: null }))).toEqual({ kind: 'ready', room: entry('c-1', 4) })
  })

  it('waits for the room of their size in the making, with the line’s readySecs', () => {
    const line: Line = said([lineRoom('l1', 2, 'writing', 0), lineRoom('l2', 4, 'trial', 10)], 240)
    expect(newDoor(facts({ line }))).toEqual({ kind: 'waiting', room: line.rooms[1], run: [line.rooms[1]], readySecs: 240, skewMs: 0 })
    expect(askNow(facts({ line }))).toBe(false)
  })

  it('still waits for a room just kept that the library has not told of, so it is never asked twice', () => {
    const line: Line = said([lineRoom('l1', 4, 'kept', 0, 'sea-1')])
    expect(newDoor(facts({ line })).kind).toBe('waiting')
    expect(askNow(facts({ line }))).toBe(false)
    expect(newDoor(facts({ line, index: { rooms: [entry('sea-1', 4)], gifts: [] } }))).toEqual({ kind: 'ready', room: entry('sea-1', 4) })
    // Once played, it is neither ready nor waited for: the next is asked.
    expect(askNow(facts({ line, index: { rooms: [entry('sea-1', 4)], gifts: [] }, played: new Set(['sea-1']) }))).toBe(true)
  })

  it('waits at the door for a kept room’s look until the server says it is settled or the wait is past', () => {
    const index = { rooms: [entry('sea-1', 4)], gifts: [] }
    const line = (look: LineRoom['look'], until: number | null): Line => said([{ ...lineRoom('l1', 4, 'kept', 0, 'sea-1', until === null ? null : at(until)), look }])
    // Kept, its look still being written: the room is in the library, yet the door waits.
    const writing = line('writing', 1030)
    expect(newDoor(facts({ index, line: writing })).kind).toBe('waiting')
    expect(afterWait(facts({ index, line: writing }))).toBe('stay')
    expect(askNow(facts({ index, line: writing }))).toBe(false)
    // The look settled: the server says no wait, and the door opens.
    expect(newDoor(facts({ index, line: line('ready', null) })).kind).toBe('ready')
    // The wait ran out by the server's clock: the door opens without the look.
    expect(newDoor(facts({ index, line: writing, serverNow: T0 + 1031_000 })).kind).toBe('ready')
    expect(afterWait(facts({ index, line: writing, serverNow: T0 + 1031_000 }))).toBe('open')
    // An older kept room they have not played opens meanwhile.
    expect(newDoor(facts({ index: { rooms: [entry('old-1', 4), entry('sea-1', 4)], gifts: [] }, line: writing }))).toEqual({ kind: 'ready', room: entry('old-1', 4) })
    // Played already, it is not waited for.
    expect(newDoor(facts({ index, line: writing, played: new Set(['sea-1']) })).kind).toBe('none')
  })

  it('says when the soonest look wait ends', () => {
    const room = lineRoom('l1', 4, 'kept', 0, 'sea-1', at(1030))
    expect(lookAwaited(room, T0 + 1000_000)).toBe(true)
    expect(lookAwaited(room, T0 + 1030_000)).toBe(false)
    expect(lookWaitEnds(said([room, lineRoom('l2', 4, 'kept', 0, 'b-1', at(1020))]), T0 + 1000_000)).toBe(T0 + 1020_000)
    expect(lookWaitEnds(said([lineRoom('l3', 4, 'kept', 0, 'c-1')]), T0 + 1000_000)).toBeNull()
  })

  it('is not there, and asks, when nothing of their size is ready or in the making', () => {
    expect(newDoor(facts({}))).toEqual({ kind: 'none' })
    expect(askNow(facts({}))).toBe(true)
    // The hosted build or no CLI asks nothing.
    expect(askNow(facts({ line: null }))).toBe(false)
    // A kept room ready: they walk into it before the next is asked.
    expect(askNow(facts({ index: { rooms: [entry('a-1', 4)], gifts: [] } }))).toBe(false)
  })

  it('stops asking for a size after three dropped in a row this visit, and counts no drop from before the visit', () => {
    const dropped = (n: number, from: number) => Array.from({ length: n }, (_, i) => lineRoom(`d${i}`, 4, 'dropped', from + i))
    expect(dropsInARow(facts({ line: said(dropped(2, 0)) }))).toBe(2)
    expect(askNow(facts({ line: said(dropped(2, 0)) }))).toBe(true)
    expect(dropsInARow(facts({ line: said(dropped(DROPS_STOP, 0)) }))).toBe(DROPS_STOP)
    expect(askNow(facts({ line: said(dropped(DROPS_STOP, 0)) }))).toBe(false)
    // A kept room breaks the run; another size's drops are not counted; drops before the visit are not counted.
    expect(dropsInARow(facts({ line: said([...dropped(2, 0), lineRoom('k', 4, 'kept', 5, 'k-1'), lineRoom('x', 4, 'dropped', 6)]) }))).toBe(1)
    expect(dropsInARow(facts({ party: 3, line: said(dropped(3, 0)) }))).toBe(0)
    expect(dropsInARow(facts({ line: said(dropped(3, -100)) }))).toBe(0)
  })
})

describe('the wait behind the door, and the house’s doors', () => {
  it('opens the room once ready, goes back to the house when nothing more is coming, and stays while one is made or about to be asked', () => {
    expect(afterWait(facts({ index: { rooms: [entry('a-1', 4)], gifts: [] } }))).toBe('open')
    expect(afterWait(facts({ line: said([lineRoom('l1', 4, 'writing', 0)]) }))).toBe('stay')
    // Just dropped, fewer than DROPS_STOP in a row: the next is about to be asked for, so the wait stays.
    expect(afterWait(facts({ line: said([lineRoom('d1', 4, 'dropped', 0)]) }))).toBe('stay')
    expect(afterWait(facts({ line: said(Array.from({ length: DROPS_STOP }, (_, i) => lineRoom(`d${i}`, 4, 'dropped', i))) }))).toBe('house')
    expect(afterWait(facts({ line: null }))).toBe('house')
  })

  it('lists the party’s own room and the kept rooms of its size, less the one the new door opens', () => {
    const own = [{ id: 'own:a', name: { en: 'A', fi: 'A' }, party: 4 as const }, { id: 'own:b', name: { en: 'B', fi: 'B' }, party: 2 as const }]
    const index = { rooms: [entry('k-1', 4), entry('k-2', 2), entry('k-3', 4)], gifts: [] }
    expect(houseDoors(own, index, 4, { kind: 'ready', room: entry('k-3', 4) }).map((d) => d.id)).toEqual(['own:a', 'k-1'])
    expect(houseDoors(own, index, 4, { kind: 'none' }).map((d) => d.id)).toEqual(['own:a', 'k-1', 'k-3'])
  })

  it('shows a room kept while its look is awaited only behind the new door, never as a plain door, until the wait ends', () => {
    const own = [{ id: 'own:a', name: { en: 'A', fi: 'A' }, party: 4 as const }]
    const index = { rooms: [entry('sea-1', 4)], gifts: [] }
    const writing = said([lineRoom('l1', 4, 'kept', 0, 'sea-1', at(1030))])
    const waiting = newDoor(facts({ index, line: writing }))
    expect([waiting.kind, houseDoors(own, index, 4, waiting).map((d) => d.id)]).toEqual(['waiting', ['own:a']])
    const ended = newDoor(facts({ index, line: writing, serverNow: T0 + 1031_000 }))
    expect([ended.kind, houseDoors(own, index, 4, ended).map((d) => d.id)]).toEqual(['ready', ['own:a']])
  })
})

describe('asking', () => {
  it('rolls the game’s dice and says the party’s level, devices and how they played', () => {
    const played = [{ name: { en: 'A', fi: 'A' }, botSecs: 70, secs: 200, restarts: 1, hints: 2, end: 'finished' as const, steps: { done: 2, of: 2 }, up: 0, down: 0 }]
    const req = roomRequest(2, 1, ['keys', 'gamepad'], played, () => 0)
    expect(req).toEqual({ party: 2, roll: { kind: 'together', view: 'side' }, level: 1, devices: ['keys', 'gamepad'], played })
    expect(roomRequest(1, 2, ['touch'], [], () => 0.99).roll.kind).toBe('together')
    expect(() => roomRequest(3, 1, ['keys'], [], Math.random)).toThrow('a party of 3 sits at 1 devices')
  })

  it('puts the server’s answer into the line, in place of its older self', () => {
    const line = asHeard(said([lineRoom('l1', 4, 'asked', 0)]))
    expect(withRoom(line, lineRoom('l1', 4, 'writing', 0)).line.rooms).toEqual([lineRoom('l1', 4, 'writing', 0)])
    expect(withRoom(line, lineRoom('l2', 3, 'asked', 1)).line.rooms.map((r) => r.line)).toEqual(['l1', 'l2'])
  })

  it('hears the line by the server’s clock: how far it is ahead of the page’s, and the visit’s start from the first line heard', () => {
    // A tablet five minutes ahead of the laptop.
    const page = T0 + 1000_000 + 300_000
    const first = heard(null, said([]), page)
    expect(first).toEqual({ line: said([]), skewMs: -300_000, visitStart: T0 + 1000_000 })
    const later = heard(first, { ...said([]), now: at(1100) }, page + 100_000)
    expect([later.skewMs, later.visitStart]).toEqual([-300_000, T0 + 1000_000])
    // Its drops count from the server's time, and its bar fills by the server's clock.
    const line = said([lineRoom('d1', 4, 'dropped', 1001), lineRoom('w', 4, 'writing', 1010)])
    const f: DoorFacts = { party: 4, index: { rooms: [], gifts: [] }, heard: heard(null, { ...line, now: at(1000) }, page), played: new Set(), serverNow: T0 + 1000_000 }
    expect(dropsInARow({ ...f, heard: { ...f.heard!, line: said([lineRoom('d1', 4, 'dropped', 1001)]) } })).toBe(1)
    const door = newDoor(f)
    if (door.kind !== 'waiting') throw new Error('the door should wait')
    const bar = barAt([door.room], door.readySecs, page + 90_000 + door.skewMs)
    expect(bar.fill).toBeCloseTo((BAR_MOST * 80) / 180, 9)
    expect(bar.left).toBeCloseTo(100, 9)
  })

  it('fills the bar from the asked time against readySecs, never full before the room is kept', () => {
    const room = lineRoom('l1', 4, 'writing', 0)
    expect(barAt([room], 180, T0)).toEqual({ fill: 0, left: 180 })
    expect(barAt([room], 180, T0 + 90_000)).toEqual({ fill: BAR_MOST / 2, left: 90 })
    expect(barAt([room], 180, T0 + 400_000)).toEqual({ fill: BAR_MOST, left: 0 })
  })

  it('never goes back over a drop: the room asked again fills the rest of the way from where the bar stood', () => {
    // Visit from T0; an earlier visit's drop and another party's room are not this wait.
    const line = said([lineRoom('old', 4, 'dropped', -50), lineRoom('d1', 4, 'dropped', 0), lineRoom('x', 2, 'writing', 10), lineRoom('d2', 4, 'dropped', 90), lineRoom('w', 4, 'writing', 150)])
    const door = newDoor(facts({ line }))
    if (door.kind !== 'waiting') throw new Error('the door should wait')
    expect(door.run.map((r) => r.line)).toEqual(['d1', 'd2', 'w'])
    const fills = [0, 60, 89, 90, 120, 150, 151, 200, 600].map((s) => barAt(door.run.filter((r) => Date.parse(r.asked) <= T0 + s * 1000), 180, T0 + s * 1000).fill)
    for (let i = 1; i < fills.length; i++) expect(fills[i]!).toBeGreaterThanOrEqual(fills[i - 1]!)
    const atAsk = barAt(door.run.slice(0, 2), 180, T0 + 150_000).fill
    expect(barAt(door.run, 180, T0 + 150_000).fill).toBeCloseTo(atAsk, 9)
    expect(barAt(door.run, 180, T0 + 600_000).fill).toBeCloseTo(BAR_MOST, 9)
  })
})
