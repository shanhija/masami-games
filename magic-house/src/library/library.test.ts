/**
 * The page's side of ./api/ and of the library: each route at its path with its body, the server's
 * sentence when it refuses; the library read from ./api/ and from the files the build ships; a kept
 * room as a door, compiled from its guarded text and played to its end by its walkthrough; and a
 * page taking the trials and presents that wait, one at a time, on a fake fetch.
 */

import { describe, expect, it } from 'vitest'

import { RoomRuntime, buildRoom } from '../engine/room'
import { buildLook } from '../engine/lookBuilder'
import { LookRuntime } from '../trial/compile'
import { looksJob, looksTrialJob } from '../trial/twins/looks'
import { ROOM_FILE_VERSION, type GiftsJob, type GiftsReport, type LookJob, type LookReport, type RoomFile, type TrialJob, type TrialReport } from '../protocol'
import { HOUSE_SHELL } from '../engine/world'
import { Autoplay } from '../shell/autoplay'
import { partyFrom, roomStart, seatsFromUrl } from '../shell/play'
import { BASE_ROOM, BASE_WALK } from '../trial/twins/base'
import { twinJob } from '../trial/twins/twins'
import { NO_POINTING, STILL_PAD } from '../seats/types'
import { HouseApi } from './api'
import { SHIPPED } from './shipped'
import { apiSource, keptRoom } from './source'
import { PageTrials } from './trials'

/** A request the fake fetch saw. */
interface Seen {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

/** A fetch that answers each request from `reply` (by method and path under /api/), and keeps what it saw. */
function fakeFetch(reply: (method: string, path: string, body: unknown) => { status: number; body: unknown }): { fetcher: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = []
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^\/api\//, '')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    seen.push({ method, path, body })
    const r = reply(method, path, body)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetcher, seen }
}

/** The twins' base room, Pirate Sails written as made code, as a kept room's file. */
function baseFile(): RoomFile {
  const { job, error } = twinJob({ room: BASE_ROOM, walk: BASE_WALK })
  if (job === null) throw new Error(error)
  return {
    v: ROOM_FILE_VERSION,
    id: 'pirate-sails-1',
    party: job.party,
    seed: job.seed,
    roll: job.roll,
    level: job.level,
    theme: 'a pirate ship',
    task: 'raise the sails together',
    name: { en: 'Pirate Sails', fi: 'Merirosvopurjeet' },
    shell: job.shell,
    room: BASE_ROOM,
    roomGuarded: job.room,
    walk: BASE_WALK,
    walkGuarded: job.walk,
    look: null,
    lookGuarded: null,
    wish: '',
    lookWish: '',
    botSecs: { 1: 71, 2: 82.3, 3: 97.3 },
    made: '2026-11-22T10:00:00.000Z',
  }
}

/** A one-player kept room with the base look on it (the look twins' fixture), or without a look. */
function lookFile(withLook: boolean): RoomFile {
  const trial = looksTrialJob()
  const look = looksJob(null)
  return {
    ...baseFile(),
    id: 'toy-shelves-1',
    party: 1,
    seed: trial.seed,
    roll: trial.roll,
    level: trial.level,
    theme: 'a toy room',
    task: 'run between the flags',
    name: { en: 'Toy Shelves', fi: 'Lelukaapit' },
    shell: trial.shell,
    roomGuarded: trial.room,
    walkGuarded: trial.walk,
    look: withLook ? 'the look' : null,
    lookGuarded: withLook ? look.look : null,
    lookWish: withLook ? 'more toys' : '',
  }
}

describe('the page’s side of ./api/', () => {
  it('calls each route at its path, with its body, and gives back the answer', async () => {
    const { fetcher, seen } = fakeFetch((method, path) => ({ status: 200, body: method === 'GET' && path === 'status' ? { claude: true, model: 'opus', effort: 'low' } : { ok: true } }))
    const api = new HouseApi('/api/', fetcher)
    expect(await api.get('GET /status', null)).toEqual({ claude: true, model: 'opus', effort: 'low' })
    await api.get('GET /rooms/:id', 'sea crown/1')
    await api.post('POST /play', { room: 'x', at: 'now', level: 1, secs: 1, restarts: 0, hints: 0, end: 'left', steps: { done: 0, of: 2 }, party: 1, thumbs: [null] })
    expect(seen).toEqual([
      { method: 'GET', path: 'status', body: null },
      { method: 'GET', path: 'rooms/sea%20crown%2F1', body: null },
      { method: 'POST', path: 'play', body: { room: 'x', at: 'now', level: 1, secs: 1, restarts: 0, hints: 0, end: 'left', steps: { done: 0, of: 2 }, party: 1, thumbs: [null] } },
    ])
  })

  it('rejects with the server’s own sentence, and a route with :id needs one', async () => {
    const { fetcher } = fakeFetch(() => ({ status: 404, body: { error: 'no room x in the library' } }))
    const api = new HouseApi('/api/', fetcher)
    await expect(api.get('GET /rooms/:id', 'x')).rejects.toThrow('no room x in the library')
    await expect(api.get('GET /rooms/:id', null)).rejects.toThrow('GET /rooms/:id needs an id')
    await expect(api.get('GET /line', 'x')).rejects.toThrow('GET /line takes no id')
  })
})

describe('the library', () => {
  it('reads from ./api/ by the library’s routes', async () => {
    const file = baseFile()
    const { fetcher, seen } = fakeFetch((_, path) => ({ status: 200, body: path === 'library' ? { rooms: [], gifts: [] } : file }))
    const source = apiSource(new HouseApi('/api/', fetcher))
    expect(await source.index()).toEqual({ rooms: [], gifts: [] })
    expect((await source.room(file.id)).id).toBe(file.id)
    await source.gift('sea-crown-1')
    expect(seen.map((s) => s.path)).toEqual(['library', 'rooms/pirate-sails-1', 'gifts/sea-crown-1'])
  })

  it('from the shipped files gives the index and rejects what the build did not ship', async () => {
    const index = await SHIPPED.index()
    expect(Array.isArray(index.rooms) && Array.isArray(index.gifts)).toBe(true)
    await expect(SHIPPED.room('no-such-room-1')).rejects.toThrow('the build shipped no room no-such-room-1')
    await expect(SHIPPED.gift('no-such-present-1')).rejects.toThrow('the build shipped no present no-such-present-1')
  })

  it(
    'opens a kept room as a door: compiled from its guarded text, it plays to its end by its walkthrough',
    () => {
      const room = keptRoom(baseFile())
      expect(room.roll).toEqual({ kind: 'together', view: 'side' })
      const runtime = new RoomRuntime()
      const played = buildRoom(room.code(runtime), roomStart(room, partyFrom(seatsFromUrl(null, 4, ['a', 'b', 'c', 'd']), () => null, () => ({})), 1), runtime)
      const auto = new Autoplay(played, room.walk, 'bots')
      while (played.world.end === null && played.world.t < 150) played.step(auto.frame({ pads: [STILL_PAD, STILL_PAD, STILL_PAD, STILL_PAD], pointing: NO_POINTING, help: false }))
      expect(auto.run.sentence).toBeNull()
      expect(played.faults).toEqual([])
      expect(played.world.end).not.toBeNull()
      // The trial's bots took 71 s at level 1; the page's bots play the same room the same way.
      expect(played.world.end!.at).toBeCloseTo(71, 0)
    },
    60_000,
  )
})

describe('a kept room with and without its look', () => {
  const party = partyFrom(seatsFromUrl(null, 1, ['a']), () => null, () => ({}))
  const played = (file: RoomFile) => {
    const room = keptRoom(file)
    const runtime = new RoomRuntime()
    return { room, played: buildRoom(room.code(runtime), roomStart(room, party, 2), runtime) }
  }

  it('is a door with a look that builds on the room as played, in its shell', () => {
    const { room, played: p } = played(lookFile(true))
    expect(room.shell).toEqual(looksTrialJob().shell)
    expect(room.look).not.toBeNull()
    const rt = new LookRuntime()
    const built = buildLook(p, room.look!(rt), rt)
    expect(built.counts.answering).toBeGreaterThanOrEqual(8)
    expect(built.props.length).toBe(built.counts.answering)
  })

  it('is a door without a look when the file has none, and plays the same room', () => {
    const { room, played: p } = played(lookFile(false))
    expect(room.look).toBeNull()
    const other = played(lookFile(true)).played
    expect(JSON.stringify(p.world.solids)).toBe(JSON.stringify(other.world.solids))
  })
})

describe('a page taking trials', () => {
  const JOB = { line: 'l1', attempt: 1, party: 4, seed: 9, roll: { kind: 'together', view: 'side' }, level: 1, shell: HOUSE_SHELL, room: 'r', walk: 'w' } as const satisfies TrialJob
  const GIFTS: GiftsJob = { room: 'pirate-sails-1', gifts: [] }
  const REPORT: TrialReport = { line: 'l1', attempt: 1, passed: true, sentences: [], survey: '', botSecs: { 1: 70, 2: 80, 3: 90 }, waitSecs: { 1: 0, 2: 0, 3: 0 }, ms: 1200 }
  const LOOK: LookJob = { line: 'l1', attempt: 1, check: 1, party: 4, seed: 9, roll: { kind: 'together', view: 'side' }, level: 1, shell: HOUSE_SHELL, room: 'r', look: 'l' }
  const LOOKED: LookReport = { line: 'l1', attempt: 1, check: 1, passed: true, roomUnbuilt: false, sentences: [], notes: [], counts: { pieces: 53, props: 8, answering: 8, quarters: 4, lights: 31, lamps: 1, leftOut: 0, of: 26 }, ms: 300 }
  const CHECKED: GiftsReport = { room: 'pirate-sails-1', checks: [] }

  /** A server with `trials` and `gifts` waiting, handed out once each; POST /trial answers `trialStatus`. */
  function server(trials: TrialJob[], gifts: GiftsJob[], trialStatus = 200, looks: LookJob[] = []) {
    return fakeFetch((method, path) => {
      if (method === 'GET' && path === 'trial') return { status: 200, body: trials.shift() ?? null }
      if (method === 'GET' && path === 'look-trial') return { status: 200, body: looks.shift() ?? null }
      if (method === 'GET' && path === 'gift-trial') return { status: 200, body: gifts.shift() ?? null }
      if (method === 'POST' && path === 'trial') return trialStatus === 200 ? { status: 200, body: {} } : { status: trialStatus, body: { error: 'that try is no longer waiting' } }
      return { status: 200, body: {} }
    })
  }

  it('takes the room waiting, tries it, reports it, then checks its look and the presents, and stops when nothing waits', async () => {
    const { fetcher, seen } = server([JOB], [GIFTS], 200, [LOOK])
    const tried: string[] = []
    const trials = new PageTrials(new HouseApi('/api/', fetcher), {
      room: async (job) => (tried.push(`room ${job.line}`), REPORT),
      look: async (job) => (tried.push(`look ${job.line}`), LOOKED),
      gifts: async (job) => (tried.push(`gifts ${job.room}`), CHECKED),
    })
    await trials.look()
    expect(tried).toEqual(['room l1', 'look l1', 'gifts pirate-sails-1'])
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET trial', 'POST trial',
      'GET trial', 'GET look-trial', 'POST look-trial',
      'GET trial', 'GET look-trial', 'GET gift-trial', 'POST gift-trial',
      'GET trial', 'GET look-trial', 'GET gift-trial',
    ])
    expect(seen[1]!.body).toEqual(REPORT)
    expect(seen[4]!.body).toEqual(LOOKED)
    expect(seen[8]!.body).toEqual(CHECKED)
  })

  it('does one job at a time: a look while busy waits and looks again after', async () => {
    const { fetcher } = server([JOB, { ...JOB, line: 'l2' }], [])
    let running = 0
    let most = 0
    const trials = new PageTrials(new HouseApi('/api/', fetcher), {
      room: async (job) => {
        running++
        most = Math.max(most, running)
        await new Promise((r) => setTimeout(r, 5))
        running--
        return { ...REPORT, line: job.line }
      },
      look: async () => LOOKED,
      gifts: async () => CHECKED,
    })
    await Promise.all([trials.look(), trials.look(), trials.look()])
    // The second and third looks came while busy: the first look goes on until nothing waits.
    await new Promise((r) => setTimeout(r, 50))
    expect(most).toBe(1)
  })

  it('lets a report go that the server no longer wants, and goes on', async () => {
    const { fetcher, seen } = server([JOB], [GIFTS], 409)
    const trials = new PageTrials(new HouseApi('/api/', fetcher), { room: async () => REPORT, look: async () => LOOKED, gifts: async () => CHECKED })
    await trials.look()
    expect(seen.map((s) => `${s.method} ${s.path}`)).toContain('POST gift-trial')
  })
})

const REPORT_NONE = {} as TrialReport

describe('a look check taken from a fake line', () => {
  it('is reported with the line, try and counts of the job, and a 409 for it is let go', async () => {
    const job = looksJob(null)
    const posted: unknown[] = []
    const { fetcher } = fakeFetch((method, path, body) => {
      if (method === 'GET' && path === 'trial') return { status: 200, body: null }
      if (method === 'GET' && path === 'look-trial') return { status: 200, body: posted.length === 0 ? job : null }
      if (method === 'POST' && path === 'look-trial') {
        posted.push(body)
        return { status: 409, body: { error: 'that look is no longer waiting' } }
      }
      return { status: 200, body: null }
    })
    // The check itself is the one the worker runs (trial/lookCheck.ts), in Node.
    const { lookJob } = await import('../trial/lookCheck')
    const trials = new PageTrials(new HouseApi('/api/', fetcher), {
      room: async () => REPORT_NONE,
      look: async (j) => lookJob(j, () => performance.now()),
      gifts: async () => ({ room: 'x', checks: [] }),
    })
    await trials.look()
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ line: job.line, attempt: 1, passed: true, sentences: [] })
  })
})
