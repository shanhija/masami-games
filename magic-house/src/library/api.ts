/**
 * The page's side of ./api/ on the dev server (protocol.ts Routes): each route called by its name,
 * its body and its answer typed from Routes, and what the server tells every open page (Told) over
 * Vite's websocket. The hosted build has no server and makes none of these (library/source.ts).
 */

import { failure } from '../../../silly-billy/src/brain/link'
import type { Route, Routes, Told } from '../protocol'

/** The routes the page reads, and those it sends a body to. */
type GetRoute = Extract<Route, `GET ${string}`>
type PostRoute = Extract<Route, `POST ${string}`>

export class HouseApi {
  /** `base` is where ./api/ is, ending in a slash; `fetcher` is the page's fetch, or a test's. */
  constructor(
    private readonly base: string,
    private readonly fetcher: typeof fetch,
  ) {}

  private async ask<T>(route: Route, id: string | null, init: RequestInit): Promise<T> {
    let path = route.slice(route.indexOf('/') + 1)
    if (path.includes(':id')) {
      if (id === null) throw new Error(`${route} needs an id`)
      path = path.replace(':id', encodeURIComponent(id))
    } else if (id !== null) throw new Error(`${route} takes no id`)
    const res = await this.fetcher(this.base + path, init)
    if (!res.ok) throw await failure(res)
    return (await res.json()) as T
  }

  /** A GET route; `id` for the routes that name one (GET /rooms/:id), else null. */
  get<R extends GetRoute>(route: R, id: string | null): Promise<Routes[R]['reply']> {
    return this.ask(route, id, { method: 'GET' })
  }

  post<R extends PostRoute>(route: R, body: Routes[R]['body']): Promise<Routes[R]['reply']> {
    return this.ask(route, null, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }
}

/** Listens to what the server tells every open page; gives back the way to stop. Nothing is told where there is no dev server (the hosted build, vitest). */
export function onTold<E extends keyof Told>(event: E, listener: (data: Told[E]) => void): () => void {
  const hot = import.meta.hot
  if (hot === undefined) return () => {}
  const heard = (data: unknown) => listener(data as Told[E])
  hot.on(event, heard)
  return () => hot.off(event, heard)
}
