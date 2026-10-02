import { ROOMS } from './levels'
import type { RoomId } from './model'

/**
 * What the game remembers between visits, as pure functions over a plain object: the
 * kittens found, the rooms a parent opened, the best stars per room, the star jar (every
 * star ever) and the two sound switches. game.ts is the only place that reads and writes
 * it to the browser.
 */
export interface Save {
  v: 1
  /** Rooms whose kitten is home, in the order they were found. */
  found: RoomId[]
  /** Rooms a parent opened with the 3 s hold on a locked card. */
  opened: RoomId[]
  /** The most stars taken in one visit, per room. */
  best: Record<RoomId, number>
  /** Every star ever taken, all rooms and visits together. */
  jar: number
  sound: boolean
  music: boolean
}

const isRoomId = (x: unknown): x is RoomId => ROOMS.some((r) => r.id === x)
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0
/** A list of distinct room ids: anything else is not a list this game wrote. */
const isRoomList = (x: unknown): x is RoomId[] => Array.isArray(x) && x.every(isRoomId) && new Set(x).size === x.length

function fresh(): Save {
  return { v: 1, found: [], opened: [], best: Object.fromEntries(ROOMS.map((r) => [r.id, 0])) as Record<RoomId, number>, jar: 0, sound: true, music: true }
}

/** The save in `text`, or a fresh one (sound and music on) for null, junk or another version. */
export function parseSave(text: string | null): Save {
  if (text === null) return fresh()
  let data: unknown
  // Text that is not JSON is junk like any other; JSON.parse has no way to say so but throwing.
  try {
    data = JSON.parse(text)
  } catch {
    return fresh()
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fresh()
  const d = data as Record<string, unknown>
  const best = d.best
  const bestOk =
    typeof best === 'object' &&
    best !== null &&
    !Array.isArray(best) &&
    Object.keys(best).length === ROOMS.length &&
    ROOMS.every((r) => isCount((best as Record<string, unknown>)[r.id]))
  if (d.v !== 1 || !isRoomList(d.found) || !isRoomList(d.opened) || !bestOk || !isCount(d.jar) || typeof d.sound !== 'boolean' || typeof d.music !== 'boolean') return fresh()
  return { v: 1, found: d.found, opened: d.opened, best: best as Record<RoomId, number>, jar: d.jar, sound: d.sound, music: d.music }
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save)
}

/** Whether ROOMS[index] can be played: the first always, the rest once the room before has its kitten home or a parent opened it. */
export function isOpen(save: Save, index: number): boolean {
  const room = ROOMS[index]
  if (!room) throw new Error(`there is no room ${index}`)
  return index === 0 || save.found.includes(ROOMS[index - 1]!.id) || save.opened.includes(room.id)
}

/** A visit to room `id` ended with its kitten found and `stars` taken: the kitten is home, the room's best and the jar grow. */
export function roomDone(save: Save, id: RoomId, stars: number): Save {
  return {
    ...save,
    found: save.found.includes(id) ? save.found : [...save.found, id],
    best: { ...save.best, [id]: Math.max(save.best[id], stars) },
    jar: save.jar + stars,
  }
}

/** The parent gate on a locked card: the room is open from now on, its kitten still to find. */
export function openRoom(save: Save, id: RoomId): Save {
  return save.opened.includes(id) ? save : { ...save, opened: [...save.opened, id] }
}

/** "Hold to start fresh": every kitten back in its bed, every room but the first locked, the jar empty. Sound and Music stay as they are. */
export function startFresh(save: Save): Save {
  return { ...fresh(), sound: save.sound, music: save.music }
}
