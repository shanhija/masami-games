/**
 * The dev server beside the page (./api/, server/plugin.ts): Whisper, the interpreter, the
 * designer and the library on disk. The static build has no server: status() says so,
 * `online` stays false, and the library comes from the files the build shipped with.
 */

import { LIBRARY_EVENT, PAGE_HEADER, type HearReply, type InterpretReply, type InventLine, type LibraryData, type LibraryNews, type Status } from '../engine/protocol'
import type { Link } from './contract'

/** The server's { error } as an Error, or the HTTP status when the reply says nothing. Magic House's page reads its server's failures the same way (magic-house/src/library/api.ts). */
export async function failure(res: Response): Promise<Error> {
  const text = await res.text()
  const said = /^\s*\{/.test(text) ? (JSON.parse(text) as { error?: string }).error : undefined
  return new Error(said ?? `${res.status} ${res.statusText}`.trim())
}

export function createLink(base = './api/'): Link {
  let online = false
  // This page's name on the dev server: the news of its own saves is not told back to it.
  const page = Math.random().toString(36).slice(2, 12)
  const ask = async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(base + path, init)
    if (!res.ok) throw await failure(res)
    return res
  }
  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', [PAGE_HEADER]: page }, body: JSON.stringify(body) })

  return {
    get online() {
      return online
    },

    async status() {
      // A build never has the server (the plugin is for `vite` serve only): asking would only leave a 404 in the console.
      if (import.meta.env.PROD) {
        online = false
        return null
      }
      try {
        const status = (await (await ask('status')).json()) as Status
        online = status.claude
        return status
      } catch {
        // No server (the static build) or not ours: nothing to ask.
        online = false
        return null
      }
    },

    async hear(wav, lang, partial, prime, mic) {
      const query = new URLSearchParams({ lang })
      if (partial) query.set('partial', '1')
      if (prime !== undefined && prime.trim() !== '') query.set('prime', prime)
      if (mic !== undefined) query.set('mic', JSON.stringify(mic))
      const res = await ask(`hear?${query}`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav })
      return (await res.json()) as HearReply
    },

    async interpret(req, signal) {
      return (await (await ask('interpret', { ...post(req), signal })).json()) as InterpretReply
    },

    /** The reply is NDJSON: progress lines while the designer writes, then the entry or the error. */
    async invent(req, onProgress, signal) {
      const reader = (await ask('invent', { ...post(req), signal })).body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        buffer += done ? `${decoder.decode()}\n` : decoder.decode(value, { stream: true })
        for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
          const text = buffer.slice(0, end).trim()
          buffer = buffer.slice(end + 1)
          if (text === '') continue
          const line = JSON.parse(text) as InventLine
          if ('progress' in line) onProgress(line.progress)
          else if ('done' in line) return line.done
          else throw new Error(line.error)
        }
        if (done) throw new Error('the designer stopped without an answer')
      }
    },

    async save(req) {
      await ask('library', post(req))
    },

    async forget(req) {
      await ask('forget', post(req))
    },

    async library() {
      // The build plays what was on disk when it was built; only the build loads those files, so the dev server never watches them.
      if (import.meta.env.PROD) return (await import('./shipped')).SHIPPED
      return (await (await ask('library')).json()) as LibraryData
    },

    onNews(listener) {
      // Vite's websocket, there only under the dev server: another page made or forgot something.
      import.meta.hot?.on(LIBRARY_EVENT, (news: LibraryNews) => {
        if (news.from !== page) listener(news)
      })
    },

    log(line) {
      if (import.meta.env.DEV) fetch(base + 'log', post(line)).catch((err: unknown) => console.warn('Silly Billy could not log:', err))
    },
  }
}
