/**
 * Magic House: a party with no faces, for whoever plays a room without children: the trial (and
 * vitest through it). The sim reads only each member's seat and colour; the body and what is worn
 * are for the scene, so a plain kid in its seat's colour is enough.
 */

import { SEAT_COLORS, type PartySize, type SeatIndex } from '../seats/types'
import type { PartyMember } from './sim'

/** A party of this size in seat order, each a plain kid in its seat's colour. */
export function plainParty(size: PartySize): PartyMember[] {
  return Array.from({ length: size }, (_, i) => ({
    seat: i as SeatIndex,
    color: SEAT_COLORS[i as SeatIndex],
    body: { skin: '#f2c9a0', eyes: '#3a2a1a', top: SEAT_COLORS[i as SeatIndex], bottom: '#334455', shoes: '#222222', skirt: false, build: 1 },
    wear: {},
  }))
}
