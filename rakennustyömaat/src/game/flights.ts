import { MACHINE_FOR_MATERIAL, MACHINE_FOR_RAW, RECIPES } from './catalog'
import { PRESENT_X, TRUCK_TIP_X, centre, heapRect, roomRect, stackRect } from './layout'
import { STEP, type Good, type MachineId, type Place, type State } from './model'
import { same } from './rules'

/**
 * Goods in the air are pictures: the keep already counts them where they land. These say
 * what a place shows at sim time t (the keep's count, minus what is still flying to it, plus
 * what is still flying away from it) and where a place is in its world.
 *
 * A flight counts at the place it flies to until it lands, and at the place it leaves until
 * its tick comes: the truck's bed keeps its goods while they wait their turn to fly, and a
 * heap or a stack shows a good only once it has landed there.
 */

/** The middle of the truck's bed from the ground under the truck's middle (the truck faces right, the bed behind the cab). */
export const BED = { dx: -0.8, dy: -1.4 } as const

/**
 * How many of `good` a place shows at sim time t. A heap or a stack starts from the keep's
 * count of its own good, the truck's bed on the road from the goods in it; the other places
 * hold nothing of their own and show only what still waits there to fly.
 */
export function shown(s: State, place: Place, good: Good, t: number): number {
  let n = 0
  if ((place.kind === 'heap' || place.kind === 'stack') && place.good === good) n = s.keep.goods[good]
  else if (place.kind === 'bed' && s.road !== null) for (const g of s.road.bed) if (g === good) n++
  for (const f of s.flights) {
    if (f.good !== good) continue
    if (t < (f.at + f.dur) * STEP && same(f.to, place)) n -= f.n
    if (t < f.at * STEP && same(f.from, place)) n += f.n
  }
  return Math.max(0, n)
}

/** How many raw goods machine m's heap shows at sim time t: what it can run on (goods still in the truck's bed or in the air are not there yet). */
export const heapShows = (s: State, m: MachineId, t: number) => shown(s, { kind: 'heap', good: RECIPES[m].takes }, RECIPES[m].takes, t)

/** Where a place is, in its world's metres: a good flying there aims at this point. A taken-back room is still found in `s.gone`. */
export function placePoint(s: State, place: Place): { x: number; y: number } {
  switch (place.kind) {
    case 'bed':
      return s.road !== null ? { x: s.road.x + BED.dx, y: s.road.y + BED.dy } : { x: TRUCK_TIP_X + BED.dx, y: BED.dy }
    case 'heap':
      return centre(heapRect(MACHINE_FOR_RAW[place.good]))
    case 'stack':
      return centre(stackRect(MACHINE_FOR_MATERIAL[place.good]))
    case 'room': {
      const room = s.keep.plots[place.plot]!.rooms.find((r) => r.id === place.room) ?? s.gone.find((g) => g.room.id === place.room)?.room
      if (!room) throw new Error(`no room ${place.room} on plot ${place.plot} to fly to`)
      return centre(roomRect(place.plot, room))
    }
    case 'road':
      return { x: place.x, y: place.y }
    case 'present':
      return { x: PRESENT_X, y: -0.5 }
  }
}
