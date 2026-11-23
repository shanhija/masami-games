/**
 * Where the page reads the library from (protocol.ts LibrarySource), and a kept room as a door.
 * On the dev server it is ./api/ (GET /library, /rooms/:id, /gifts/:id), and the page also has the
 * server for the line of rooms; the hosted build has no server and reads the files it shipped with
 * (library/shipped.ts), loaded only there.
 */

import type { LibrarySource, RoomFile } from '../protocol'
import type { HouseRoom } from '../shell/play'
import { compileLook, compileRoom, compileWalk } from '../trial/compile'
import { HouseApi } from './api'

/** The library from the dev server's ./api/. */
export function apiSource(api: HouseApi): LibrarySource {
  return {
    index: () => api.get('GET /library', null),
    room: (id) => api.get('GET /rooms/:id', id),
    gift: (id) => api.get('GET /gifts/:id', id),
  }
}

/** The library the build shipped, its module loaded the first time it is read. */
const shipped = () => import('./shipped').then((m) => m.SHIPPED)
export const SHIPPED_SOURCE: LibrarySource = {
  index: async () => (await shipped()).index(),
  room: async (id) => (await shipped()).room(id),
  gift: async (id) => (await shipped()).gift(id),
}

/** What the page reads and asks: on the dev server its ./api/ for both, on the hosted build the shipped files and no server (api null). */
export interface HouseLink {
  readonly api: HouseApi | null
  readonly source: LibrarySource
}

/** The link for where the page runs. */
export function houseLink(): HouseLink {
  if (import.meta.env.PROD) return { api: null, source: SHIPPED_SOURCE }
  const api = new HouseApi('./api/', (input, init) => fetch(input, init))
  return { api, source: apiSource(api) }
}

/** A kept room as a door: its guarded room code, walkthrough and look (when it has one) compiled behind the sandbox onto the runtime they run on, played as it was rolled, on its own seed. */
export function keptRoom(file: RoomFile): HouseRoom {
  const look = file.lookGuarded
  return {
    id: file.id,
    party: file.party,
    name: file.name,
    seed: file.seed,
    roll: file.roll,
    shell: file.shell,
    code: (runtime) => compileRoom(file.roomGuarded, runtime),
    walk: (runtime) => compileWalk(file.walkGuarded, runtime),
    look: look === null ? null : (runtime) => compileLook(look, runtime),
    botSecs: file.botSecs,
  }
}
