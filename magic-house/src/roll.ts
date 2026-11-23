/**
 * Magic House: the game's dice for a new room (plan.md, A model cannot roll dice, so the game does).
 * The page rolls when it asks for a room, the server checks the roll against the same odds, and the
 * prompt says the result in a plain sentence (server/prompts.ts). Pure: the random comes from the
 * caller, so a test rolls on a seeded stream.
 *
 * - How they play: together, against each other or side by side, 3, 1 and 1 in 5. A party of one
 *   plays alone, which is together with itself (own/rooms/facts.ts says the same of Moon Garden):
 *   never against, and side by side would be the very same room.
 * - How it is seen: from the side or from high up, 4 and 1 in 5.
 * Every room has one size (engine/api.ts ROOM), so there is no die for it (step 7a).
 */

import type { Roll } from './protocol'
import type { RoomKind, RoomView } from './engine/world'
import type { PartySize } from './seats/types'

/** The odds of each face, as weights: a face of weight 0 never comes up, and the server refuses it. */
export const ODDS = {
  kind: { together: 3, contest: 1, side: 1 },
  view: { side: 4, high: 1 },
} as const satisfies { kind: Record<RoomKind, number>; view: Record<RoomView, number> }

/** The kinds a party of this size may play: alone, only together. */
function kindOdds(party: PartySize): Readonly<Record<RoomKind, number>> {
  return party === 1 ? { together: 1, contest: 0, side: 0 } : ODDS.kind
}

/** One face of a die, by its weights, from one draw of `random` in [0, 1). */
function pick<K extends string>(odds: Readonly<Record<K, number>>, draw: number): K {
  const faces = Object.entries(odds) as [K, number][]
  const total = faces.reduce((sum, [, w]) => sum + w, 0)
  let left = draw * total
  for (const [face, w] of faces) {
    if (left < w) return face
    left -= w
  }
  // A draw of exactly 1 is not in [0, 1); this only guards against a rounding at the very top.
  return faces.filter(([, w]) => w > 0).at(-1)![0]
}

/** Rolls a room for a party: how they play and how it is seen, two draws in that order. */
export function rollRoom(party: PartySize, random: () => number): Roll {
  return { kind: pick(kindOdds(party), random()), view: pick(ODDS.view, random()) }
}

/** Why a roll could not have come from these dice for this party, in a sentence; null when it could. */
export function badRoll(party: PartySize, roll: Roll): string | null {
  if (!(kindOdds(party)[roll.kind] > 0)) return party === 1 ? `a party of one plays alone, never ${roll.kind}` : `no room is rolled ${roll.kind}`
  if (!(ODDS.view[roll.view] > 0)) return `no room is seen ${roll.view}`
  return null
}
