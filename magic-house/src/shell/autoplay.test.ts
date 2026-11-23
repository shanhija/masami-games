/**
 * ?autoplay: the hop room for every party size played to its end by its walkthrough through the
 * page's Autoplay, as RoomScreen feeds it each sim frame; the bots only shown under
 * ?autoplay=devices while the devices step the room; and the URL's modes.
 */

import { describe, expect, it } from 'vitest'

import { buildRoom, RoomRuntime, type Room } from '../engine/room'
import { NO_POINTING, STILL_PAD, type FrameInput } from '../seats/types'
import { Autoplay, autoplayFromUrl, type AutoplayMode } from './autoplay'
import { partyFrom, roomStart, seatsFromUrl, type HouseRoom } from './play'
import { HOP_ROOMS } from './testing'

/** The hop room built for its party at level 1, as a door builds it. */
function built(room: HouseRoom): Room {
  const seats = seatsFromUrl(null, room.party, ['a', 'b', 'c', 'd'])
  const runtime = new RoomRuntime()
  return buildRoom(room.code(runtime), roomStart(room, partyFrom(seats, () => null, () => ({})), 1), runtime)
}

/** What idle devices give each frame, with the ? pressed when asked. */
const devices = (party: number, help: boolean): FrameInput => ({ pads: Array.from({ length: party }, () => STILL_PAD), pointing: NO_POINTING, help })

/** Steps `played` with the Autoplay for up to `secs` of play, as RoomScreen does; every input stepped. */
function play(played: Room, auto: Autoplay, secs: number): FrameInput[] {
  const fed: FrameInput[] = []
  while (played.world.end === null && played.world.t < secs) {
    const input = auto.frame(devices(played.world.players.length, false))
    fed.push(input)
    played.step(input)
  }
  return fed
}

describe('autoplay', () => {
  it.each(HOP_ROOMS.map((r) => [r.party, r] as const))('plays the hop room for %i to its end by its walkthrough', (_, room) => {
    const played = built(room)
    const auto = new Autoplay(played, room.walk, 'bots')
    play(played, auto, 30)
    expect(played.faults).toEqual([])
    expect(auto.run.sentence).toBeNull()
    expect(played.world.end?.by).toBe('finish')
    expect(played.world.wayOut.open).toBe(true)
    // The bot that hopped onto the box pressed jump, and the shown pads counted it.
    expect(auto.shown!.seats[0].aPresses).toBeGreaterThan(0)
    expect(auto.shown!.seats).toHaveLength(room.party)
  })

  it('feeds the devices and only shows the bots under ?autoplay=devices', () => {
    const room = HOP_ROOMS[1]
    const played = built(room)
    const auto = new Autoplay(played, room.walk, 'devices')
    const fed = play(played, auto, 3)
    expect(fed.every((f) => f.pads.every((p) => p === STILL_PAD))).toBe(true)
    // Nobody moved, but the bots asked to: their sticks are shown, frame by frame.
    expect(played.world.players[0].at[0]).toBeCloseTo(-6, 1)
    expect(auto.shown!.seats[0].stick[0]).toBeGreaterThan(0)
    expect(auto.shown!.frame).toBe(played.world.frame - 1)
    expect(auto.shown!.state).toBe('playing')
  })

  it('keeps the devices’ ? button while the bots play', () => {
    const room = HOP_ROOMS[0]
    const played = built(room)
    const auto = new Autoplay(played, room.walk, 'bots')
    expect(auto.frame(devices(1, true)).help).toBe(true)
    expect(auto.frame(devices(1, false)).help).toBe(false)
  })

  it('reads the mode from the URL', () => {
    const mode = (q: string): AutoplayMode | null => autoplayFromUrl(new URLSearchParams(q))
    expect(mode('room=own:moon-garden')).toBeNull()
    expect(mode('autoplay')).toBe('bots')
    expect(mode('autoplay=bots')).toBe('bots')
    expect(mode('autoplay=devices')).toBe('devices')
    expect(() => mode('autoplay=keys')).toThrow(/not a way to autoplay/)
  })
})
