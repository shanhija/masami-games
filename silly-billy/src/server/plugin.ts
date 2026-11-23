/**
 * A game's dev-server side as a Vite plugin: the page's ./api/, served by the game's API module
 * (Silly Billy's api.ts drives the Claude Code CLI, Whisper and the library on disk). It runs
 * only under `vite` serve, never in a build or a test. This file is all vite.config.ts loads
 * for it, and it imports nothing of any game: loading the config reads no file, starts no
 * process and never looks at $HOME, and an edit to a game's engine does not restart the dev
 * server. The API module comes in through Vite's own module runner on the first request to the
 * API, and again after its code changes: then the next request closes the old Api and builds a
 * fresh one from the new code.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

/** A game's API, one per dev server: it answers every request under the game's ./api/, and closing it stops what it started (CLI processes, servers). */
export interface Api {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
  close(): void
}

/**
 * What a game's API module exports: its Api, built from the deps `depsFromEnv` finds from the
 * environment and the home folder (on the first request, never at import), given the repo's
 * root, a line for the dev server's log and a way to tell every page open on the dev server
 * something (Vite's websocket).
 */
export interface ApiModule<Deps> {
  Api: new (deps: Deps) => Api
  depsFromEnv(root: string, log: (message: string) => void, tell: (event: string, data: unknown) => void): Deps
}

/** Where a game's page reaches its API: ./api/ beside <game>/index.html. */
export const apiPath = (game: string): string => `/${game}/api`

/** Serves the ./api/ of the game in folder `game` from its API module, named as Vite's module runner names it, from the root: '/silly-billy/src/server/api.ts'. */
export function gameApi(game: string, apiModule: string): Plugin {
  return {
    name: `${game}-api`,
    apply: (_, env) => env.command === 'serve' && env.mode !== 'test',
    configureServer(server) {
      const log = (message: string) => server.config.logger.info(`[${game}] ${message}`, { timestamp: true })
      /** The Api and the module it was built from. */
      let current: { module: ApiModule<unknown>; api: Api } | null = null
      /**
       * The Api for a request. Vite's module runner hands back the same module until a file the
       * module uses (itself or anything it imports) changes, and a new one after: then the old
       * Api is closed first (its CLI processes and servers stop) and a fresh one is built. A
       * module that does not load leaves the old Api as it is, for the next good one to close.
       */
      const apiNow = async (): Promise<Api> => {
        const module = (await server.ssrLoadModule(apiModule)) as ApiModule<unknown>
        if (current === null || current.module !== module) {
          if (current !== null) {
            log('the server code changed: the API starts afresh')
            current.api.close()
            current = null
          }
          // What changed in the library goes to every page open on this server, by Vite's own websocket.
          const tell = (event: string, data: unknown) => server.ws?.send(event, data as Record<string, unknown>)
          current = { module, api: new module.Api(module.depsFromEnv(server.config.root, log, tell)) }
        }
        return current.api
      }
      server.middlewares.use(apiPath(game), (req: IncomingMessage, res: ServerResponse) => {
        apiNow().then(
          (api) => api.handle(req, res),
          (err: Error) => {
            log(`the API did not load: ${err.message}`)
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: `the API did not load: ${err.message}` }))
          },
        )
      })
      const stop = () => {
        current?.api.close()
        current = null
        process.off('exit', stop)
      }
      process.once('exit', stop)
      server.httpServer?.once('close', stop)
    },
  }
}
