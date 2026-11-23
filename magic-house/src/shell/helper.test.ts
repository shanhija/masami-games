/**
 * The helper on the game's clock (plan.md, Help, and how hard), and what is counted of a room
 * played (shell/counted.ts): a room nobody touches, played frame by frame as RoomScreen plays it.
 * After HELPER.flySecs with no step done the helper flies to the next step's spot; HELPER.saySecs
 * later it says the hint, once, and the hint is counted; the ? calls it at once and counts one hint
 * for each step it is called for; a step done sends it home. Start again keeps what the starts before it spent.
 */

import { describe, expect, it } from 'vitest'

import { DT } from '../engine/state'
import { HELPER } from '../engine/world'
import { buildRoom, RoomRuntime, type Room } from '../engine/room'
import { NO_POINTING, STILL_PAD, type FrameInput } from '../seats/types'
import { NOTHING_SPENT, playedNow, spentAfter } from './counted'
import { partyFrom, roomStart, seatsFromUrl } from './play'
import { HOP_ROOM, HOP_ROOMS } from './testing'

/** The hop room for two, as a door builds it at level 1. */
function built(): Room {
  const room = HOP_ROOMS[1]
  const seats = seatsFromUrl(null, room.party, ['a', 'b'])
  const runtime = new RoomRuntime()
  return buildRoom(room.code(runtime), roomStart(room, partyFrom(seats, () => null, () => ({})), 1), runtime)
}

const idle = (help: boolean): FrameInput => ({ pads: [STILL_PAD, STILL_PAD], pointing: NO_POINTING, help })

/** Plays nobody pressing until the game's clock reaches `secs`. */
function until(room: Room, secs: number): void {
  while (room.world.t < secs - 1e-9) room.step(idle(false))
}

describe('the helper', () => {
  it('flies to the next step after HELPER.flySecs and says its hint HELPER.saySecs later, by the game’s clock', () => {
    const room = built()
    const h = room.world.helper
    const home = [...h.at]
    until(room, HELPER.flySecs - 0.1)
    expect(room.world.helper.step).toBeNull()
    expect(room.world.helper.at).toEqual(home)
    until(room, HELPER.flySecs + 0.1)
    expect(room.world.helper.step).toBe(0)
    expect(room.world.helper.says).toBeNull()
    // It has flown to the box, the first step's spot, and hovers over it.
    until(room, HELPER.flySecs + 5)
    const box = room.world.steps[0].at
    expect(room.world.helper.at[0]).toBeCloseTo(box[0], 5)
    expect(room.world.helper.at[1]).toBeGreaterThan(box[1])
    until(room, HELPER.flySecs + HELPER.saySecs - 0.1)
    expect(room.world.helper.says).toBeNull()
    until(room, HELPER.flySecs + HELPER.saySecs + 0.1)
    expect(room.world.helper.says).toEqual({ en: 'Hop on the box', fi: 'Hyppää laatikolle' })
    expect(room.world.helper.hints).toBe(1)
    // Said once: it is not said again while it waits.
    until(room, HELPER.flySecs + HELPER.saySecs + 30)
    expect(room.world.helper.hints).toBe(1)
  })

  it('comes at once for the ?, and a ? again for the same step says it again without counting a new hint', () => {
    const room = built()
    until(room, 1)
    room.step(idle(true))
    expect(room.world.helper.step).toBe(0)
    expect(room.world.helper.says).toEqual({ en: 'Hop on the box', fi: 'Hyppää laatikolle' })
    expect(room.world.helper.saidAt).toBeCloseTo(room.world.t, 9)
    until(room, 3)
    room.step(idle(true))
    expect(room.world.helper.saidAt).toBeCloseTo(room.world.t, 9)
    expect(room.world.helper.hints).toBe(1)
  })

  it('goes home when a step is done, and waits HELPER.flySecs again from then', () => {
    const room = built()
    room.step(idle(true))
    expect(room.world.helper.step).toBe(0)
    // The first player stands on the box: the step is done.
    room.world.players[0].at = [0, 0.7, 0]
    room.world.players[0].velocity = [0, 0, 0]
    let frames = 0
    while (room.world.next === 0 && frames++ < 120) room.step(idle(false))
    expect(room.world.next).toBe(1)
    const doneAt = room.world.steps[0].doneAt!
    expect(room.world.helper.step).toBeNull()
    expect(room.world.helper.says).toBeNull()
    until(room, doneAt + HELPER.flySecs - 0.1)
    expect(room.world.helper.step).toBeNull()
    until(room, doneAt + HELPER.flySecs + DT)
    expect(room.world.helper.step).toBe(1)
  })
})

describe('what is counted', () => {
  it('adds up the seconds and hints of every start, counts each Start again, and a room left is left', () => {
    let room = built()
    until(room, 10)
    room.step(idle(true))
    let spent = spentAfter(NOTHING_SPENT, room.world)
    expect(spent.secs).toBeCloseTo(10 + DT, 6)
    expect(spent.hints).toBe(1)
    // Started again: a fresh room, the first start's numbers kept.
    room = built()
    until(room, HELPER.flySecs + HELPER.saySecs + 1)
    spent = spentAfter(spent, room.world)
    room = built()
    until(room, 5)
    const left = playedNow('left', 1, 2, spent, room.world)
    expect(left).toEqual({ end: 'left', level: 1, secs: spent.secs + room.world.t, restarts: 2, hints: 2, steps: { done: 0, of: 2 } })
    expect(left.secs).toBeCloseTo(10 + DT + HELPER.flySecs + HELPER.saySecs + 1 + 5, 1)
  })

  it('counts the steps undone of a room whose clock ran out: it ended, but it was not cleared', () => {
    const room = HOP_ROOMS[1]
    const seats = seatsFromUrl(null, room.party, ['a', 'b'])
    const runtime = new RoomRuntime()
    const clocked = buildRoom(
      (r, w) => {
        r.clock(180)
        return HOP_ROOM(r, w)
      },
      roomStart(room, partyFrom(seats, () => null, () => ({})), 1),
      runtime,
    )
    until(clocked, 181)
    expect(clocked.world.end).not.toBeNull()
    const played = playedNow('finished', 1, 0, NOTHING_SPENT, clocked.world)
    expect(played.steps).toEqual({ done: 0, of: 2 })
    expect(played.secs).toBeCloseTo(180, 1)
  })

  it('counts a finished room to the moment it ended, not the cheer after it', () => {
    const room = built()
    room.world.players[0].at = [0, 0.7, 0]
    room.world.players[1].at = [6, 0, 0]
    let frames = 0
    while (room.world.end === null && frames++ < 600) room.step(idle(false))
    room.world.players[0].at = [6, 0, 0]
    while (room.world.end === null && frames++ < 1200) room.step(idle(false))
    expect(room.world.end).not.toBeNull()
    const endAt = room.world.end!.at
    until(room, endAt + 3)
    expect(playedNow('finished', 2, 0, NOTHING_SPENT, room.world)).toEqual({ end: 'finished', level: 2, secs: endAt, restarts: 0, hints: 0, steps: { done: 2, of: 2 } })
    expect(() => playedNow('finished', 1, 0, NOTHING_SPENT, built().world)).toThrow(/not ended/)
  })
})
