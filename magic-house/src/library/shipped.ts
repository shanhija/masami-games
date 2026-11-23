/**
 * The library the hosted build plays (protocol.ts LibrarySource): magic-house/library/ as it was on
 * disk when the build ran, so rooms made at home play on the hosted page too, on the pattern of
 * Silly Billy's brain/shipped.ts. The index ships with the page; each room and present is a chunk
 * of its own, loaded when it is opened. Only the build imports this module (library/source.ts,
 * behind import.meta.env.PROD): the dev server never loads it, so it never reads the files it
 * writes there.
 */

import type { GiftFile, LibraryIndex, LibrarySource, RoomFile } from '../protocol'

const INDEX = Object.values(import.meta.glob<LibraryIndex>('../../library/index.json', { eager: true, import: 'default' }))
const ROOMS = import.meta.glob<RoomFile>('../../library/rooms/*.json', { import: 'default' })
const GIFTS = import.meta.glob<GiftFile>('../../library/wear/*.json', { import: 'default' })

/** A shipped file by its id, or a rejection naming what was asked for. */
function file<T>(files: Record<string, () => Promise<T>>, folder: string, what: string, id: string): Promise<T> {
  const load = files[`../../library/${folder}/${id}.json`]
  return load === undefined ? Promise.reject(new Error(`the build shipped no ${what} ${id}`)) : load()
}

export const SHIPPED: LibrarySource = {
  // A library with nothing kept yet has no index: an empty house of kept rooms.
  index: () => Promise.resolve(INDEX[0] ?? { rooms: [], gifts: [] }),
  room: (id) => file(ROOMS, 'rooms', 'room', id),
  gift: (id) => file(GIFTS, 'wear', 'present', id),
}
