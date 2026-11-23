/**
 * Magic House's ./api/: the module fits the loader every game with a server shares, its deps come
 * from the environment only when asked, and with no CLI it answers status, the empty library and
 * line, no trial, look check or presents to take, a 503 for a new room, a 403 for a page of another site and a JSON 404, without ever
 * throwing. The line of rooms on the fake CLI is line.test.ts.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ApiModule } from '../../../silly-billy/src/server/plugin'
import { fakeBin } from '../../../silly-billy/src/server/test/fakes'
import type { ApiError, LibraryIndex, Line, Status } from '../protocol'
import { Api, depsFromEnv, type Deps } from './api'
import { TIMING } from './line'

/** api.ts is what the loader takes it for: a type error here when it is not. */
const fits: typeof import('./api') extends ApiModule<Deps> ? true : false = true

let dir = ''
let server: http.Server
let api: Api
let base = ''

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-house-api-test-'))
  api = new Api({ claude: null, model: 'opus', library: path.join(dir, 'library'), log: () => {}, tell: () => {}, timing: TIMING })
  server = http.createServer((req, res) => void api.handle(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(async () => {
  api.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("Magic House's api", () => {
  it('fits the loader, and finds the CLI, the model and the library from the environment only when asked', () => {
    const bin = fakeBin(dir, 'fake-claude.mjs')
    vi.stubEnv('CLAUDE_BIN', bin)
    vi.stubEnv('MAGIC_MODEL', 'sonnet')
    vi.stubEnv('MAGIC_LIBRARY', path.join(dir, 'elsewhere'))
    const logged: string[] = []
    try {
      const deps = depsFromEnv('/repo', (m) => logged.push(m), () => {})
      expect([fits, deps.claude?.bin, deps.model, deps.library, deps.timing, logged]).toEqual([true, bin, 'sonnet', path.join(dir, 'elsewhere'), TIMING, [`Claude: ${bin}`]])
      deps.claude?.close()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('answers status, and a JSON 404 for any other method or path', async () => {
    const status = await fetch(`${base}/status`)
    expect([status.status, (await status.json()) as Status]).toEqual([200, { claude: false, model: 'opus', effort: 'low' }])
    for (const [method, route] of [['GET', '/nothing'], ['POST', '/status'], ['GET', '/'], ['POST', '/line']] as const) {
      const res = await fetch(`${base}${route}`, { method })
      expect([res.status, (await res.json()) as ApiError]).toEqual([404, { error: `no ${method} ${route} here` }])
    }
  })

  it('answers the empty library and line, and with no CLI refuses a new room', async () => {
    const get = async (route: string) => (await fetch(`${base}${route}`)).json()
    expect([(await get('/library')) as LibraryIndex, (await get('/line')) as Line, await get('/trial'), await get('/look-trial'), await get('/gift-trial')]).toEqual([{ rooms: [], gifts: [] }, { rooms: [], readySecs: 180, now: expect.any(String) }, null, null, null])
    const res = await fetch(`${base}/rooms`, { method: 'POST', body: JSON.stringify({ party: 2, roll: { kind: 'together', view: 'side' }, level: 1, devices: ['keys', 'keys'], played: [] }) })
    expect([res.status, await res.json()]).toEqual([503, { error: 'no Claude Code CLI was found on this server, so no new room can be asked for' }])
    const gone = await fetch(`${base}/rooms/nothing-1`)
    expect([gone.status, await gone.json()]).toEqual([404, { error: 'no room nothing-1 in the library' }])
  })

  it('refuses a page of another site', async () => {
    const res = await fetch(`${base}/line`, { headers: { origin: 'https://elsewhere.example', 'sec-fetch-site': 'cross-site' } })
    expect([res.status, await res.json()]).toEqual([403, { error: 'only the game itself may ask this' }])
  })
})
