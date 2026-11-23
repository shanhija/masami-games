/**
 * The game's own rooms, one seen from the side for each party size and one seen from high up for
 * two (Flower Bridge), written by hand against the builder: doors in the house like any other, so
 * no party starts with an empty house (plan.md, The own rooms). They are never shown
 * to the model. Each is played together, on one screen.
 *
 * An OwnRoom has every field the house's door needs (shell/play.ts handDoor: id, party, name, seed,
 * kind, view, shell, code, walk and look), so the list serves as doors as it is, and the words for the
 * request's list of earlier rooms (theme, task) beside them. Each room's look is written by hand in
 * `<room>.look.ts` (engine/look.ts LookCode) and checked as a made look is (rooms.test.ts).
 */

import type { RoomCode } from '../../engine/api'
import type { LookCode } from '../../engine/look'
import type { PartySize } from '../../seats/types'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'
import * as flowerBridge from './flower-bridge'
import { look as flowerBridgeLook } from './flower-bridge.look'
import * as moonGarden from './moon-garden'
import { look as moonGardenLook } from './moon-garden.look'
import * as pirateSails from './pirate-sails'
import { look as pirateSailsLook } from './pirate-sails.look'
import * as seesawOrchard from './seesaw-orchard'
import { look as seesawOrchardLook } from './seesaw-orchard.look'
import * as snowmanHill from './snowman-hill'
import { look as snowmanHillLook } from './snowman-hill.look'

export type { OwnFacts } from './facts'

export interface OwnRoom extends OwnFacts {
  readonly code: RoomCode
  readonly walk: WalkCode
  /** Its look, written by hand. */
  readonly look: LookCode
}

const own = (m: { facts: OwnFacts; room: RoomCode; walk: WalkCode }, look: LookCode): OwnRoom => ({ ...m.facts, code: m.room, walk: m.walk, look })

/** The own rooms, by party size: the room for one player first; the one seen from high up after the one from the side. */
export const OWN_ROOMS: readonly OwnRoom[] = [own(moonGarden, moonGardenLook), own(seesawOrchard, seesawOrchardLook), own(flowerBridge, flowerBridgeLook), own(snowmanHill, snowmanHillLook), own(pirateSails, pirateSailsLook)]

/** The own room seen from the side made for a party of this size. */
export function ownRoomFor(party: PartySize): OwnRoom {
  const room = OWN_ROOMS.find((r) => r.party === party && r.view === 'side')
  if (room === undefined) throw new Error(`no own room for a party of ${party}`)
  return room
}
