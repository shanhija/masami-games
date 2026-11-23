/**
 * A small room for the shell's tests and its sheet, one for each party size, written by hand
 * against the builder: hop up on a box, then everyone into the gold, with its walkthrough. Not a
 * door of the house: the game's own rooms (own/rooms/) are that.
 */

import type { RoomCode } from '../engine/api'
import { HOUSE_SHELL } from '../engine/world'
import type { PartySize } from '../seats/types'
import type { WalkCode } from '../trial/api'
import { handDoor, type HouseRoom } from './play'

/** Hop on the box in the middle, then all walk into the gold at the right, on the house's floor; the room ends the frame after both are done. */
export const HOP_ROOM: RoomCode = (r, w) => {
  const box = r.box([0, 0.35, 0], [2, 0.7, 2], { color: '#c98b52', name: 'box' })
  const gold = r.zone([6, 1.25, 0], [4, 2.5, 2], { color: '#ffd23a', name: 'gold' })
  w.players().forEach((p, i) => p.putAt([-6 + 1.2 * i, 0, 0]))
  r.wayOut([7, 0, 0])
  r.steps([
    { hint: { en: 'Hop on the box', fi: 'Hyppää laatikolle' }, at: box, done: () => w.players().some((p) => p.standingOn() === box) },
    { hint: { en: 'All into the gold', fi: 'Kaikki kultaan' }, at: gold, done: () => w.players().every((p) => gold.has(p)) },
  ])
  return () => {
    if (w.stepsDone() === 2) w.finish()
  }
}

/** The hop room's walkthrough: the first bot onto the box, then everyone into the gold. */
export const HOP_WALK: WalkCode = function* (bots, w) {
  yield* bots[0].goTo(w.get('box'))
  yield* w.together(...bots.map((b) => b.goTo(w.get('gold'))))
}

/** The hop room as a door for a party of this size. */
export function hopRoom(party: PartySize): HouseRoom {
  return handDoor({ id: `test:hop${party}`, party, name: { en: `Hop ${party}`, fi: `Hyppy ${party}` }, seed: 11 * party, kind: 'together', view: 'side', shell: HOUSE_SHELL, code: HOP_ROOM, walk: HOP_WALK, look: null })
}

/** The hop room for every party size. */
export const HOP_ROOMS: readonly HouseRoom[] = ([1, 2, 3, 4] as const).map(hopRoom)
