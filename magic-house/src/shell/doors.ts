/**
 * The game's own rooms as doors (own/rooms/: one from the side for each party size, and Flower
 * Bridge from high up for two), so no party starts with an empty house. The kept rooms of the library stand beside them (library/source.ts keptRoom).
 */

import { OWN_ROOMS } from '../own/rooms'
import { handDoor, type HouseRoom } from './play'

export const HOUSE_ROOMS: readonly HouseRoom[] = OWN_ROOMS.map(handDoor)
