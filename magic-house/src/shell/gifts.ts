/**
 * The presents at the end of a room (plan.md, The look, people and presents), as plain data so
 * vitest runs it: which present each player opens, and how the end dresses each kid in it for a
 * look before the dressing room.
 */

import type { Slot } from '../../../silly-billy/src/engine/types'
import type { GiftEntry } from '../protocol'
import type { HouseSaves, Wear, Wearing } from '../saves'
import { PLAIN } from '../patterns/patterns'
import { presentColours } from './dressing/colours'

/**
 * The present each player opens, by seat index, or null for a player who owns every present the
 * library has. Each gets one of this room's presents they do not own; else one from another room
 * they do not own, newest first, rooms no longer kept too (their presents stay in the library).
 * Two players get different presents while there are enough to go round; when this room's run
 * short, a player still gets one of this room's rather than one from elsewhere. The players with
 * the fewest of this room's presents left to them choose first, so nobody's last one goes to a
 * sibling who had others. `broken` are presents whose model would not load or build: never given.
 */
export function pickPresents(room: string, players: readonly { readonly saves: Pick<HouseSaves, 'owned'> }[], gifts: readonly GiftEntry[], broken: ReadonlySet<string>): (string | null)[] {
  const newest = [...gifts].reverse().filter((g) => !broken.has(g.id))
  const mine = newest.filter((g) => g.room === room)
  const others = newest.filter((g) => g.room !== room)
  const free = (i: number, list: readonly GiftEntry[]) => list.filter((g) => !players[i].saves.owned.includes(g.id))
  const order = players.map((_, i) => i).sort((a, b) => free(a, mine).length - free(b, mine).length || a - b)
  const given = new Set<string>()
  const out: (string | null)[] = players.map(() => null)
  for (const i of order) {
    const fromMine = free(i, mine)
    const fromOthers = free(i, others)
    const gift = fromMine.find((g) => !given.has(g.id)) ?? fromMine[0] ?? fromOthers.find((g) => !given.has(g.id)) ?? fromOthers[0]
    if (gift === undefined) continue
    given.add(gift.id)
    out[i] = gift.id
  }
  return out
}

/** How the end shows a present worn before the dressing room: in presentColours and plain, as the dressing room first puts it on, so nothing changes between the two; a pattern is the wearer's own choice. */
export function endWearing(id: string, seatColour: string): Wearing {
  return { id, ...presentColours(seatColour), pattern: PLAIN }
}

/** A present opened at the end, as its kid wears it there: in its slot, in the end's colours. */
export interface OpenedPresent {
  readonly slot: Slot
  readonly wearing: Wearing
}

/** What a player wears on the end's stage: what they wear now, with the present they opened over it in its slot (null: none opened yet). */
export function wearWithPresent(wear: Wear, opened: OpenedPresent | null): Wear {
  return opened === null ? wear : { ...wear, [opened.slot]: opened.wearing }
}
