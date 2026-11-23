/**
 * The presents at the end: which present each player opens (this room's first, never one they own,
 * different ones while there are enough, a broken one never), how the end dresses a kid in it, and
 * the end's stage, which finishes at once and bursts a present open when told.
 */

import { describe, expect, it } from 'vitest'

import { buildRoom, RoomRuntime } from '../engine/room'
import type { GiftEntry } from '../protocol'
import { HOUSE_SHELL } from '../engine/world'
import { NO_POINTING, STILL_PAD } from '../seats/types'
import { endStage, standAt } from './endRoom'
import { presentColours } from './dressing/colours'
import { endWearing, pickPresents, wearWithPresent } from './gifts'
import { partyFrom, seatsFromUrl } from './play'

const gift = (id: string, room: string): GiftEntry => ({ id, room, slot: 'head', name: { en: id, fi: id } })
/** The library, oldest first: two of an old room (no longer kept), then four of this room. */
const GIFTS = [gift('old-a', 'old'), gift('old-b', 'old'), gift('hat', 'here'), gift('key', 'here'), gift('shield', 'here'), gift('cape', 'here')]
const owning = (...owned: string[]) => ({ saves: { owned } })
const NONE = new Set<string>()

describe('which present each player opens', () => {
  it("gives this room's presents first, newest first, a different one to each", () => {
    expect(pickPresents('here', [owning(), owning(), owning()], GIFTS, NONE)).toEqual(['cape', 'shield', 'key'])
  })

  it('never gives a present the player owns', () => {
    expect(pickPresents('here', [owning('cape', 'shield')], GIFTS, NONE)).toEqual(['key'])
  })

  it("gives one from another room, the newest, once this room's are all owned; rooms no longer kept count", () => {
    expect(pickPresents('here', [owning('hat', 'key', 'shield', 'cape')], GIFTS, NONE)).toEqual(['old-b'])
  })

  it('gives null when the player owns every present', () => {
    expect(pickPresents('here', [owning(...GIFTS.map((g) => g.id))], GIFTS, NONE)).toEqual([null])
  })

  it("lets the player with fewest of this room's presents left choose first", () => {
    // Seat 1 lacks only the hat; seat 0 lacks all four. Seat 1 gets the hat, seat 0 the newest.
    expect(pickPresents('here', [owning(), owning('key', 'shield', 'cape')], GIFTS, NONE)).toEqual(['cape', 'hat'])
  })

  it("gives one of this room's twice rather than one from elsewhere when this room's run short", () => {
    // Both lack only the hat.
    expect(pickPresents('here', [owning('key', 'shield', 'cape'), owning('key', 'shield', 'cape')], GIFTS, NONE)).toEqual(['hat', 'hat'])
  })

  it('never gives a present whose model would not build', () => {
    expect(pickPresents('here', [owning(), owning()], GIFTS, new Set(['cape']))).toEqual(['shield', 'key'])
    expect(pickPresents('here', [owning('hat', 'key', 'shield', 'cape')], GIFTS, new Set(['old-b']))).toEqual(['old-a'])
  })

  it('gives every player of four a present of their own from a room of four', () => {
    const picks = pickPresents('here', [owning(), owning(), owning(), owning()], GIFTS, NONE)
    expect(new Set(picks).size).toBe(4)
    expect(picks.every((id) => GIFTS.find((g) => g.id === id)!.room === 'here')).toBe(true)
  })
})

describe('the present worn at the end', () => {
  it('is worn in its slot over what the player wears, in the colours the dressing room first puts it on in', () => {
    const wearing = endWearing('hat', '#ff5a4e')
    expect(wearing).toEqual({ id: 'hat', ...presentColours('#ff5a4e'), pattern: 'plain' })
    const own = { id: 'own:cap', main: '#111111', second: '#222222', pattern: 'plain' }
    expect(wearWithPresent({ head: own, hair: own }, { slot: 'head', wearing })).toEqual({ head: wearing, hair: own })
    expect(wearWithPresent({ head: own }, null)).toEqual({ head: own })
  })
})

describe("the end's stage", () => {
  const build = (party: 1 | 2 | 3 | 4, wrapped: readonly boolean[]) => {
    const stage = endStage(wrapped)
    const seats = seatsFromUrl(null, party, ['a', 'b', 'c', 'd'])
    const room = buildRoom(stage.code, { seed: 1, level: 1, kind: 'together', view: 'side', shell: HOUSE_SHELL, party: partyFrom(seats, () => null, () => ({})) }, new RoomRuntime())
    const still = { pads: seats.map(() => STILL_PAD), pointing: NO_POINTING, help: false }
    return { stage, room, step: (frames: number) => Array.from({ length: frames }, () => room.step(still)) }
  }

  it.each([1, 2, 3, 4] as const)('stands %i on the stage, bursts each present open when told, hops its child, and opens the way out once all are open', (party) => {
    const { stage, room, step } = build(party, Array.from({ length: party }, () => true))
    step(30)
    expect(room.faults).toEqual([])
    expect(room.world.end).toBeNull()
    room.world.players.forEach((p, i) => {
      expect(p.at[0]).toBeCloseTo(standAt(i, party)[0], 5)
      expect(p.at[1]).toBeCloseTo(standAt(i, party)[1], 2)
    })
    const shut = () => room.world.decor.filter((d) => !d.hidden).length
    const boxes = shut()
    for (let seat = party - 1; seat >= 0; seat--) {
      stage.open(seat)
      const puffs = room.world.puffs.length
      step(1)
      expect(shut()).toBe(boxes - (party - seat))
      expect(room.world.puffs.length).toBeGreaterThan(puffs)
      // Its child hops for joy.
      step(10)
      expect(room.world.players[seat].at[1]).toBeGreaterThan(standAt(seat, party)[1] + 0.2)
      if (seat > 0) expect(room.world.end).toBeNull()
    }
    step(2)
    expect(room.world.end).not.toBeNull()
    expect(room.world.wayOut.open).toBe(true)
    // Every child lands again on the stage.
    step(120)
    room.world.players.forEach((p, i) => expect(p.at[1]).toBeCloseTo(standAt(i, party)[1], 2))
    expect(room.faults).toEqual([])
  })

  it('has no present beside a player with none, and opens the way out at once when nobody has one', () => {
    const some = build(2, [false, true])
    const all = build(2, [true, true])
    expect(all.room.world.decor.length - some.room.world.decor.length).toBe(1)
    const none = build(2, [false, false])
    none.step(3)
    expect(none.room.world.end).not.toBeNull()
    expect(() => build(2, [true])).toThrow(/2 players and 1/)
  })
})
