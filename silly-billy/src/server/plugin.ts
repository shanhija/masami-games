/**
 * Silly Billy's dev-server side as a Vite plugin: the page's ./api/ (engine/protocol.ts), served
 * by api.ts, which drives the Claude Code CLI, Whisper and the library on disk. It runs only
 * under `vite` serve, never in a build or a test. This file is all vite.config.ts loads, and it
 * imports nothing of the game: loading the config reads no file, starts no process and never
 * looks at $HOME, and an edit to the engine does not restart the dev server. api.ts comes in
 * through Vite's own module runner on the first request to the API, and again after its code
 * changes: then the next request closes the old Api and builds a fresh one from the new code.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

type ApiModule = typeof import('./api')
type Api = InstanceType<ApiModule['Api']>

/** Where the page reaches the API: ./api/ beside silly-billy/index.html. */
export const API_PATH = '/silly-billy/api'
/** api.ts as Vite's module runner names it, from the root. */
const API_MODULE = '/silly-billy/src/server/api.ts'

export function sillyBilly(): Plugin {
  return {
    name: 'silly-billy',
    apply: (_, env) => env.command === 'serve' && env.mode !== 'test',
    configureServer(server) {
      const log = (message: string) => server.config.logger.info(`[silly-billy] ${message}`, { timestamp: true })
      /** The Api and the module it was built from. */
      let current: { module: ApiModule; api: Api } | null = null
      /**
       * The Api for a request. Vite's module runner hands back the same module until a file api.ts
       * uses (itself or anything it imports) changes, and a new one after: then the old Api is
       * closed first (its CLI processes and Whisper stop) and a fresh one is built. A module that
       * does not load leaves the old Api as it is, for the next good one to close.
       */
      const apiNow = async (): Promise<Api> => {
        const module = (await server.ssrLoadModule(API_MODULE)) as ApiModule
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
      server.middlewares.use(API_PATH, (req: IncomingMessage, res: ServerResponse) => {
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
