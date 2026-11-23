import { describe, expect, it } from 'vitest'

import type { Avatar } from '../../../profiles/src/avatar'
import { putOn, closetOf } from '../shell/dressing/choose'
import { faceDress, partyFrom } from '../shell/play'
import type { Seat } from '../seats/types'
import { dressingPlayers } from './DressingKids'

const FACE: Avatar = { backdrop: 'sky', skin: 'peach', hair: 'short', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'cap' }
const seat = (index: 0 | 1 | 2 | 3): Seat => ({ index, color: '#3d8bff', device: { kind: 'keys', zone: index }, profile: null })

describe("the dressing room's kids", () => {
  it("are the room's own players for the party, each dressed as the room will dress them", () => {
    const seats = [seat(0), seat(1), seat(2), seat(3)]
    const closet = closetOf(FACE, faceDress(FACE), '#3d8bff', [], [], 4)
    const wear = putOn(closet, {}, 'hair', 'own:hair-bun')
    const party = partyFrom(seats, () => FACE, (s) => (s.index === 2 ? wear : {}))
    const players = dressingPlayers(party)
    expect(players.map((p) => p.seat)).toEqual([0, 1, 2, 3])
    expect(players[2]!.wear.hair!.id).toBe('own:hair-bun')
    expect(players[0]!.wear.hair!.id).toBe('own:hair-short')
    expect(players.every((p) => p.on !== null)).toBe(true)
  })
})
