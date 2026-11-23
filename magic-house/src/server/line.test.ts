/**
 * The line of rooms on the fake CLI (silly-billy/src/server/test/fake-claude.mjs), through the API
 * over HTTP as a page reaches it: the whole line (asked, written, a trial job, a failed report, the
 * fix, a passed report, the room kept with its file, its presents asked, checked and kept); a drop
 * after three failures, every earlier failure in the last fix, and the dropped room among the
 * earlier ones of the next request; a CLI error and a hang; a taken trial that waits again; a
 * restart that takes the line up; code guarded again when taken and kept; a line that waits with no
 * CLI; a kept room that left the library; readySecs; a second ask for the same party; a second
 * server on the same library; play that changes no file; the drift the log watches for; and the line
 * end to end with the trial itself run in Node (trial/jobs.ts) on the twins' base room.
 *
 * The look's whole life on the line (step 7a): asked on the first report with a survey and never on
 * a guard's refusal; the room kept on its game's pass and the look added later, the new door's wait
 * set and lifted; a failed check fixed once, then given up and the room kept without it; a game fix
 * that changes the room sending a ready look back to its check, and a check of the room before the
 * change refused; a dropped room dropping its look and throwing away an answer still on its way;
 * entries of the old house removed at load; and a restart from every look state.
 */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { fakeBin, until } from '../../../silly-billy/src/server/test/fakes'
import { LOOK_MISTAKES } from '../engine/look'
import type { GiftsJob, LibraryIndex, Line, LineRoom, LookJob, LookReport, LookState, RoomFile, RoomRequest, Status, TrialJob, TrialReport } from '../protocol'
import { answerJob } from '../trial/jobs'
import { Api } from './api'
import { guardCode } from './codeKinds'
import { CLI_AGAIN, drift, headWord, LINE_VERSION, LOOK_WAIT_MS, percentile95, READY_SECS, TIMING, type Timing } from './line'
import { LOCK_FILE } from './lock'
import { MeteredClaude, usageOf } from './metered'
import { FIX_SCHEMA, GIFTS_SCHEMA, GIFTS_SYSTEM, LOOK_FIX_SCHEMA, LOOK_SCHEMA, LOOK_SYSTEM, ROOM_SCHEMA, ROOM_SYSTEM, shellSaid } from './prompts'
import { Store } from './store'
import { BASE_ANSWER, BASE_ANSWERS, GIFTS, GOOD_GIFTS, LOOK_ANSWER, LOOK_FIX, WALK_FIX, writeAnswers } from './test/answers'

let dir = ''
let bin = ''
let answers = ''
let fakeLog = ''

/** Every server started in a test, closed after it. */
const open: { api: Api; server: http.Server }[] = []

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-house-line-test-'))
  bin = fakeBin(dir, 'fake-claude.mjs')
  answers = path.join(dir, 'answers.json')
  fakeLog = path.join(dir, 'fake.jsonl')
  vi.stubEnv('FAKE_CLAUDE_ANSWERS', answers)
  vi.stubEnv('FAKE_CLAUDE_LOG', fakeLog)
  vi.stubEnv('FAKE_CLAUDE_STATE', path.join(dir, 'state'))
})

afterEach(async () => {
  for (const { api, server } of open.splice(0)) {
    api.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

afterAll(() => {
  vi.unstubAllEnvs()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** A fresh library for one test, with the fake's answers and its log reset. */
function fresh(name: string, byProperty: Readonly<Record<string, unknown>>): string {
  writeAnswers(answers, byProperty)
  fs.writeFileSync(fakeLog, '')
  for (const f of fs.readdirSync(dir).filter((n) => n.startsWith('state'))) fs.rmSync(path.join(dir, f))
  return path.join(dir, name)
}

const FAST: Timing = { ...TIMING, takenMs: 150 }

interface Served {
  api: Api
  told: { event: string; data: unknown }[]
  get: <T>(route: string) => Promise<{ status: number; body: T }>
  post: <T>(route: string, body: unknown) => Promise<{ status: number; body: T }>
}

/** An API over a library, on the given CLI (null: none was found), served over HTTP as the plugin serves it. */
async function serve(library: string, timing: Timing, cli: string | null): Promise<Served> {
  const told: Served['told'] = []
  const api = new Api({ claude: cli === null ? null : new MeteredClaude(cli, () => {}), model: 'opus', library, log: () => {}, tell: (event, data) => told.push({ event, data }), timing })
  const server = http.createServer((req, res) => void api.handle(req, res))
  // The trial run in Node holds the event loop for seconds on a busy machine, past the server's 5 s
  // keep-alive: the server then drops the idle socket just as fetch sends on it again (ECONNRESET).
  // A page never holds its loop so (its trials run in the worker), so here the idle socket stays open.
  server.keepAliveTimeout = 0
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  open.push({ api, server })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const ask = async <T>(route: string, init: RequestInit) => {
    const res = await fetch(`${base}${route}`, init)
    return { status: res.status, body: (await res.json()) as T }
  }
  return {
    api,
    told,
    get: (route) => ask(route, { method: 'GET' }),
    post: (route, body) => ask(route, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  }
}

const REQUEST: RoomRequest = {
  party: 4,
  roll: { kind: 'together', view: 'side' },
  level: 1,
  devices: ['keys', 'keys', 'gamepad', 'gamepad'],
  played: [{ name: { en: 'Cloud Bakery', fi: 'Pilvileipomo' }, botSecs: 70, secs: 370, restarts: 2, hints: 3, end: 'finished', steps: { done: 4, of: 4 }, up: 3, down: 1 }],
}

const guarded = (kind: 'room' | 'walk' | 'look', code: string) => {
  const g = guardCode(kind, code)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** The fake CLI's turns so far: the prompt and what the server started it with. */
function turns(): { prompt: string; system: string; schema: Record<string, unknown>; model: string; effort: string }[] {
  return fs
    .readFileSync(fakeLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const t = JSON.parse(l) as { prompt: string; argv: string[] }
      const arg = (name: string) => t.argv[t.argv.indexOf(name) + 1]!
      return { prompt: t.prompt, system: arg('--system-prompt'), schema: JSON.parse(arg('--json-schema')) as Record<string, unknown>, model: arg('--model'), effort: arg('--effort') }
    })
}
/** The room's turns (its answer and its fixes) and the look's, each in order: the look is asked beside the room's fixes, so the two interleave. */
const roomTurns = () => turns().filter((t) => t.system === ROOM_SYSTEM)
const lookTurns = () => turns().filter((t) => t.system === LOOK_SYSTEM)

/** The server's log, event by event. */
const logged = (library: string) =>
  fs
    .readFileSync(path.join(library, 'log.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown> & { event: string })

/** The room's own events in the log, the look's left out: they interleave with the room's fixes. */
const roomEvents = (library: string) => logged(library).filter((l) => !l.event.startsWith('look') && l.event !== 'ready' && l.call !== 'look' && l.call !== 'lookFix')

async function waitFor(s: Served, ok: (room: LineRoom) => boolean, what: string): Promise<LineRoom> {
  let found: LineRoom | undefined
  await until(async () => (found = (await s.get<Line>('/line')).body.rooms.find(ok)) !== undefined, 10_000, what)
  return found!
}

/** A room's look as line.jsonl holds it: in this state, and with what is given. */
const look = (state: LookState, over: Record<string, unknown> = {}): Record<string, unknown> => ({ state, answer: state === 'none' || state === 'writing' ? null : LOOK_ANSWER, failures: [], tries: 1, again: 0, taken: null, check: 0, waitsForRoom: false, ...over })

/** A room of the line as line.jsonl holds it, from before a restart: the twins' base room answered, with what is given. */
function entry(over: Record<string, unknown>): Record<string, unknown> {
  return {
    v: LINE_VERSION, line: 'old-1', state: 'trial', party: 4, roll: REQUEST.roll, level: 1, devices: REQUEST.devices, attempt: 1, asked: new Date(1e12).toISOString(), seed: 7, message: 'the request', answer: { ...BASE_ANSWER },
    failures: [], again: 0, taken: null, survey: '', look: look('none'), kept: null, finished: null, opens: null, dropped: null, gifts: { state: 'none' }, ...over,
  }
}

const writeLine = (library: string, entries: readonly Record<string, unknown>[]) => {
  fs.mkdirSync(library, { recursive: true })
  fs.writeFileSync(path.join(library, 'line.jsonl'), entries.map((e) => `${JSON.stringify(e)}\n`).join(''))
}

/** A kept room's file in the library, the twins' base room. */
const keptFile = (library: string): RoomFile =>
  new Store(library, () => {}).keepRoom({ party: 4, seed: 7, roll: REQUEST.roll, level: 1, theme: BASE_ANSWER.theme, task: BASE_ANSWER.task, name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: BASE_ANSWER.room, walk: BASE_ANSWER.walk, wish: '', botSecs: BOT_SECS })

const failure = (job: TrialJob, sentence: string): TrialReport => ({ line: job.line, attempt: job.attempt, passed: false, sentences: [sentence], survey: 'Floors: the deck from -10 to 10, its top at y 0.', botSecs: null, waitSecs: null, ms: 1200 })
const BOT_SECS = { 1: 67.7, 2: 79.3, 3: 93.2 }
const COUNTS: LookReport['counts'] = { pieces: 420, props: 8, answering: 8, quarters: 4, lights: 31, lamps: 0, leftOut: 0, of: 40 }
const lookPass = (job: LookJob): LookReport => ({ line: job.line, attempt: job.attempt, check: job.check, passed: true, roomUnbuilt: false, sentences: [], notes: [], counts: COUNTS, ms: 480 })
const lookFailure = (job: LookJob, sentence: string, notes: readonly string[]): LookReport => ({ line: job.line, attempt: job.attempt, check: job.check, passed: false, roomUnbuilt: false, sentences: [sentence], notes, counts: { ...COUNTS, answering: 3 }, ms: 510 })
/** A check that failed because the room's own code did not build at a level: the room's fault, not the look's. */
const roomUnbuiltAt = (job: LookJob, level: number, sentence: string): LookReport => ({ line: job.line, attempt: job.attempt, check: job.check, passed: false, roomUnbuilt: true, sentences: [`at level ${level}: ${LOOK_MISTAKES.roomUnbuilt(sentence)}`], notes: [], counts: COUNTS, ms: 300 })
const pass = (job: TrialJob): TrialReport => ({ line: job.line, attempt: job.attempt, passed: true, sentences: [], survey: 'Floors: the deck.', botSecs: BOT_SECS, waitSecs: { 1: 0, 2: 0, 3: 0 }, ms: 2200 })

describe('the line of rooms', () => {
  it('asks, writes, hands out the trial, fixes a failure, keeps a pass with its file, and asks, checks and keeps its presents', async () => {
    const library = fresh('whole', BASE_ANSWERS)
    const s = await serve(library, FAST, bin)
    const asked = await s.post<LineRoom>('/rooms', REQUEST)
    expect(asked.status).toBe(200)
    expect(asked.body).toMatchObject({ state: 'writing', party: 4, attempt: 1, name: null, kept: null, dropped: null })
    const line = asked.body.line

    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the first answer')
    const job = (await s.get<TrialJob>('/trial')).body
    expect(job).toMatchObject({ line, attempt: 1, party: 4, roll: REQUEST.roll, level: 1, room: guarded('room', BASE_ANSWER.room), walk: guarded('walk', BASE_ANSWER.walk) })
    expect((await s.get<TrialJob | null>('/trial')).body).toBeNull()

    const failed = await s.post<LineRoom>('/trial', failure(job, 'bot 2 found no way from 1, 0 to the ledge (line 3)'))
    expect(failed.body).toMatchObject({ line, state: 'fixing', attempt: 2, name: BASE_ANSWER.name })
    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the fix')
    const [first, fix] = roomTurns()
    expect([first!.model, first!.effort, first!.system, first!.schema]).toEqual(['opus', 'low', ROOM_SYSTEM, ROOM_SCHEMA])
    expect([fix!.system, fix!.schema]).toEqual([ROOM_SYSTEM, FIX_SCHEMA])
    expect(fix!.prompt.startsWith(first!.prompt)).toBe(true)
    expect(fix!.prompt).toContain('It failed its trial:\n- bot 2 found no way from 1, 0 to the ledge (line 3)\n\nThe room as it was built, measured by the trial:\nFloors: the deck from -10 to 10, its top at y 0.')

    // The fix gave back only the walkthrough: the room's code stays as it was.
    const job2 = (await s.get<TrialJob>('/trial')).body
    expect(job2).toMatchObject({ line, attempt: 2, seed: job.seed, room: job.room, walk: guarded('walk', WALK_FIX.walk) })
    writeAnswers(answers, { ...BASE_ANSWERS, gifts: { gifts: [GOOD_GIFTS[0], { ...GOOD_GIFTS[1], code: 'm.box(1, 1, 1, { color: Date.now() })' }, GOOD_GIFTS[2], GOOD_GIFTS[3]] } })
    const kept = await s.post<LineRoom>('/trial', pass(job2))
    expect(kept.body).toMatchObject({ line, state: 'kept', attempt: 2, kept: 'pirate-sails-1', dropped: null })

    const file = JSON.parse(fs.readFileSync(path.join(library, 'rooms', 'pirate-sails-1.json'), 'utf8')) as RoomFile
    expect(file).toMatchObject({ id: 'pirate-sails-1', party: 4, seed: job.seed, roll: REQUEST.roll, level: 1, theme: BASE_ANSWER.theme, task: BASE_ANSWER.task, name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: BASE_ANSWER.room, roomGuarded: job.room, walk: WALK_FIX.walk, walkGuarded: job2.walk, wish: '', botSecs: BOT_SECS })
    expect((await s.get<RoomFile>('/rooms/pirate-sails-1')).body).toEqual(file)
    expect((await s.get('/rooms/nothing-1')).status).toBe(404)

    let gifts: GiftsJob | null = null
    await until(async () => (gifts = (await s.get<GiftsJob | null>('/gift-trial')).body) !== null, 10_000, 'the presents')
    expect(turns().filter((t) => t.system === GIFTS_SYSTEM).map((t) => t.schema)).toEqual([GIFTS_SCHEMA])
    expect(gifts!.room).toBe('pirate-sails-1')
    expect(gifts!.gifts.map((g) => g.name.en)).toEqual(['sea crown', 'ship flag', 'sail pack'])
    expect((await s.get('/gift-trial')).body).toBeNull()
    const index = await s.post<LibraryIndex>('/gift-trial', { room: 'pirate-sails-1', checks: [{ passed: true, sentences: [] }, { passed: false, sentences: ['too big'] }, { passed: true, sentences: [] }] })
    expect(index.body.gifts).toEqual([
      { id: 'sea-crown-1', slot: 'head', name: GOOD_GIFTS[0]!.name, room: 'pirate-sails-1' },
      { id: 'sail-pack-2', slot: 'back', name: GOOD_GIFTS[3]!.name, room: 'pirate-sails-1' },
    ])
    expect((await s.get<LibraryIndex>('/library')).body).toEqual(index.body)
    expect(fs.readdirSync(path.join(library, 'wear')).sort()).toEqual(['sail-pack-2.json', 'sea-crown-1.json'])

    const states = s.told.filter((t) => t.event === 'magic-house:line').map((t) => (t.data as Line).rooms.find((r) => r.line === line)!.state)
    expect(states.filter((x, i) => x !== states[i - 1])).toEqual(['asked', 'writing', 'trial', 'fixing', 'trial', 'kept'])
    expect(s.told.filter((t) => t.event === 'magic-house:library').map((t) => (t.data as LibraryIndex).gifts.length)).toEqual([0, 2])
    expect(roomEvents(library).map((l) => (l.event === 'ask' || l.event === 'answer' ? `${l.event} ${String(l.call)}` : l.event))).toEqual([
      'request', 'ask room', 'answer room', 'trial waits', 'trial', 'failed', 'ask fix', 'answer fix', 'trial waits', 'trial', 'keep', 'ask gifts', 'answer gifts', 'present refused', 'presents',
    ])
    const ask = logged(library).find((l) => l.event === 'ask')!
    expect([ask.systemChars, ask.promptChars, ask.model, ask.effort]).toEqual([ROOM_SYSTEM.length, first!.prompt.length, 'opus', 'low'])
    // The look was asked on the failed report, the first with a survey, and is not settled: the new door waits for it a minute past the keep.
    expect(lookTurns().map((t) => t.schema)).toEqual([LOOK_SCHEMA])
    expect(kept.body.look).not.toBe('none')
    expect(kept.body.lookWaitUntil).toBe(new Date(Date.parse(file.made) + LOOK_WAIT_MS).toISOString())
    // Each system prompt is kept once, under the hash every ask names it by.
    const prompts = fs.readFileSync(path.join(library, 'prompts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; system: string })
    expect(prompts.map((p) => p.system).sort()).toEqual([ROOM_SYSTEM, LOOK_SYSTEM, GIFTS_SYSTEM].sort())
    const idOf = (system: string) => prompts.find((p) => p.system === system)!.id
    expect(logged(library).filter((l) => l.event === 'ask').map((l) => [l.call, l.system])).toEqual(expect.arrayContaining([['room', idOf(ROOM_SYSTEM)], ['fix', idOf(ROOM_SYSTEM)], ['look', idOf(LOOK_SYSTEM)], ['gifts', idOf(GIFTS_SYSTEM)]]))
    expect((await s.get<Line>('/line')).body.readySecs).toBe(READY_SECS)
  }, 30_000)

  it('drops a room after its third failed try', async () => {
    // Each fix gives back a walkthrough of its own: a fix that changes nothing fails at once.
    const library = fresh('drop', { ...BASE_ANSWERS, room: [WALK_FIX, { ...WALK_FIX, walk: `// mended again\n${BASE_ANSWER.walk}` }] })
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    let last: LineRoom | null = null
    for (const attempt of [1, 2, 3]) {
      await waitFor(s, (r) => r.line === line && r.state === 'trial' && r.attempt === attempt, `try ${attempt}`)
      last = (await s.post<LineRoom>('/trial', failure((await s.get<TrialJob>('/trial')).body, `step 3 never turned done (try ${attempt})`))).body
    }
    expect(last).toMatchObject({ line, state: 'dropped', attempt: 3, dropped: 'its last try failed: step 3 never turned done (try 3)', kept: null, look: 'dropped', lookWaitUntil: null })
    expect(roomTurns().map((t) => t.schema)).toEqual([ROOM_SCHEMA, FIX_SCHEMA, FIX_SCHEMA])
    // The last fix heard the first try's failure too.
    expect(roomTurns()[2]!.prompt).toContain('Earlier tries of this room failed with these; keep them mended:\n- step 3 never turned done (try 1)\n\nIt failed its trial:\n- step 3 never turned done (try 2)')
    expect(fs.existsSync(path.join(library, 'rooms'))).toBe(false)
    expect((await s.post('/trial', failure({ line, attempt: 3 } as TrialJob, 'late'))).status).toBe(409)
    // Asked again, the request lists the dropped room among the earlier ones, so its idea does not come back.
    await s.post<LineRoom>('/rooms', REQUEST)
    await until(async () => roomTurns().length === 4, 10_000, 'the next ask')
    expect(roomTurns()[3]!.prompt).toContain(`unlike every one of these in its theme, its colours and what the players do:\n- ${BASE_ANSWER.name.en}: ${BASE_ANSWER.theme}; ${BASE_ANSWER.task} (${shellSaid(BASE_ANSWER.shell)})\n`)
  }, 30_000)

  it('sends code the guard refuses and a name too long straight back as a fix, before any trial, and fails a fix that changes nothing', async () => {
    const broken = { ...BASE_ANSWER, room: `let = 1\n${BASE_ANSWER.room}`, name: { en: 'The Big Old Pirate Ship', fi: 'Iso laiva' } }
    const library = fresh('guard', { theme: broken, room: [{ name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: BASE_ANSWER.room, walk: '' }, { name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: '', walk: '' }] })
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the fix')
    // A guard's refusal built nothing, so no survey came: the look waits for the fix's report.
    expect([lookTurns(), (await s.get<Line>('/line')).body.rooms[0]!.look]).toEqual([[], 'none'])
    const fix = turns()[1]!.prompt
    expect(fix).toMatch(/It failed its trial:\n- the room's code could not be compiled: .+\n- the room's name: the English has 5 words, and this kind of text has at most 4: say it shorter\n\nMend/)
    const job = (await s.get<TrialJob>('/trial')).body
    expect([job.attempt, job.room]).toEqual([2, guarded('room', BASE_ANSWER.room)])
    const dropped = (await s.post<LineRoom>('/trial', failure(job, 'step 1 never turned done'))).body
    expect(dropped).toMatchObject({ state: 'fixing', attempt: 3 })
    expect((await waitFor(s, (r) => r.line === line && r.state === 'dropped', 'the drop')).dropped).toBe('its last try failed: the fix gave back nothing to change: give back the room code or the walkthrough mended')
  }, 30_000)

  it('makes the call again in the same try when the CLI fails, spending no try, and drops the room when it fails three times running', async () => {
    const library = fresh('cli-error', { nothing: true })
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    const dropped = await waitFor(s, (r) => r.line === line && r.state === 'dropped', 'the drop')
    expect(dropped.dropped).toMatch(/^the CLI gave no answer 3 times running: the CLI said error_during_execution: the fake CLI has no answer/)
    expect(logged(library).filter((l) => l.event === 'error').map((l) => l.attempt)).toEqual(Array.from({ length: CLI_AGAIN + 1 }, () => 1))
    expect(turns().map((t) => t.schema)).toEqual([ROOM_SCHEMA, ROOM_SCHEMA, ROOM_SCHEMA])
  })

  it('ends a call that hangs at its timeout, and drops the room after its third', async () => {
    const library = fresh('hang', BASE_ANSWERS)
    const s = await serve(library, { ...FAST, roomMs: 600 }, bin)
    const { line } = (await s.post<LineRoom>('/rooms', { ...REQUEST, played: [{ ...REQUEST.played[0]!, name: { en: 'HANG', fi: 'HANG' } }] })).body
    const dropped = await waitFor(s, (r) => r.line === line && r.state === 'dropped', 'the drop')
    expect(dropped.dropped).toBe('the CLI gave no answer 3 times running: timed out after 1 s')
  })

  it('hands a taken trial to a page again when no report came in time', async () => {
    const library = fresh('taken', BASE_ANSWERS)
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the answer')
    const job = (await s.get<TrialJob>('/trial')).body
    expect((await s.get('/trial')).body).toBeNull()
    await new Promise((r) => setTimeout(r, FAST.takenMs + 50))
    expect((await s.get<TrialJob>('/trial')).body).toEqual(job)
    expect(logged(library).filter((l) => l.event === 'trial waits again').length).toBe(1)
  })

  it('takes the line up after a restart: a call under way is made again, a taken trial waits again', async () => {
    const library = fresh('restart', BASE_ANSWERS)
    const stuck = path.join(dir, 'stuck-claude')
    fs.writeFileSync(stuck, '#!/bin/sh\nexec sleep 60\n', { mode: 0o755 })
    const a = await serve(library, FAST, stuck)
    const { line } = (await a.post<LineRoom>('/rooms', REQUEST)).body
    await a.api.close()
    const b = await serve(library, TIMING, bin)
    expect((await b.get<Line>('/line')).body.rooms.map((r) => [r.line, r.state])).toEqual([[line, 'writing']])
    await waitFor(b, (r) => r.line === line && r.state === 'trial', 'the answer after the restart')
    expect(logged(library).filter((l) => l.event === 'error')).toEqual([])
    const job = (await b.get<TrialJob>('/trial')).body
    b.api.close()
    const c = await serve(library, TIMING, bin)
    expect((await c.get<TrialJob>('/trial')).body).toEqual(job)
    expect((await c.post<LineRoom>('/trial', pass(job))).body).toMatchObject({ line, state: 'kept' })
  })

  it('says how long a room nearly always takes: 180 s until five are kept, then the 95th percentile', async () => {
    expect([percentile95([60, 70, 80, 90, 100, 300]), percentile95(Array.from({ length: 20 }, (_, i) => i + 1)), percentile95([42.2])]).toEqual([300, 19, 43])
    const library = fresh('ready', BASE_ANSWERS)
    const ids = [60, 70, 80, 90, 100, 290.5].map(() => keptFile(library).id)
    // Each door opened when its room was kept, its look settled by then: readySecs measures from asked to the door's opening.
    const kept = (secs: number, i: number) => entry({ line: `k${i}`, state: 'kept', party: 2, kept: ids[i]!, finished: new Date(1e12 + secs * 1000).toISOString(), opens: new Date(1e12 + secs * 1000).toISOString(), look: look('gave up'), gifts: { state: 'done' } })
    writeLine(library, [60, 70, 80, 90].map(kept))
    const four = await serve(library, FAST, bin)
    const at = Date.now()
    const said = (await four.get<Line>('/line')).body
    expect(said.readySecs).toBe(180)
    // The server's clock, so a page whose clock is not the laptop's measures by it.
    expect(Math.abs(Date.parse(said.now) - at)).toBeLessThan(5000)
    four.api.close()
    writeLine(library, [60, 70, 80, 90, 100, 290.5].map(kept))
    const line = (await (await serve(library, FAST, bin)).get<Line>('/line')).body
    expect([line.readySecs, line.rooms.length, line.rooms[0]!.name]).toEqual([291, 6, BASE_ANSWER.name])
  })

  it('gives a second ask for a party size the room already in the making, and refuses a roll the dice could not give', async () => {
    const library = fresh('again', BASE_ANSWERS)
    const s = await serve(library, FAST, bin)
    const first = (await s.post<LineRoom>('/rooms', REQUEST)).body
    expect((await s.post<LineRoom>('/rooms', { ...REQUEST, level: 3 })).body.line).toBe(first.line)
    await waitFor(s, (r) => r.line === first.line && r.state === 'trial', 'the answer')
    expect((await s.post<LineRoom>('/rooms', REQUEST)).body.line).toBe(first.line)
    expect(turns().length).toBe(1)
    const refused = async (body: unknown) => (await s.post<{ error: string }>('/rooms', body)).body.error
    expect(await refused({ ...REQUEST, roll: { ...REQUEST.roll, view: 'below' } })).toBe('the roll: no room is seen below')
    expect(await refused({ ...REQUEST, party: 1, devices: ['keys'], roll: { ...REQUEST.roll, kind: 'contest' } })).toBe('the roll: a party of one plays alone, never contest')
    expect(await refused({ ...REQUEST, roll: { ...REQUEST.roll, size: 'one' } })).toBe('bad or missing roll: { kind, view } only, since every room has one size')
    expect(await refused({ ...REQUEST, devices: ['keys'] })).toBe('bad or missing devices: one device kind for each player')
    expect(await refused({ ...REQUEST, party: 5 })).toBe('bad or missing party: 1 to 4')
    expect(await refused({ ...REQUEST, played: [{ name: 'Kite Hill' }] })).toBe('bad or missing played[0]')
    expect((await s.post<{ error: string }>('/trial', { line: first.line, attempt: 1, passed: true, sentences: [], survey: '', botSecs: null, waitSecs: null, ms: 1 })).status).toBe(400)
    const check = { line: first.line, attempt: 1, check: 1, passed: true, roomUnbuilt: false, sentences: [], notes: [], counts: COUNTS, ms: 1 }
    const lookRefused = async (body: unknown) => (await s.post<{ error: string }>('/look-trial', body)).body.error
    expect(await lookRefused({ ...check, sentences: ['the look threw'] })).toBe('bad or missing sentences: none on a pass, at least one on a failure')
    expect(await lookRefused({ ...check, roomUnbuilt: true })).toBe('bad or missing roomUnbuilt: a pass is checked on a room that built')
    expect(await lookRefused({ ...check, attempt: 3 })).toBe('bad or missing line, attempt, check, passed, roomUnbuilt, sentences, notes, counts or ms')
    expect(await lookRefused({ ...check, check: undefined })).toBe('bad or missing line, attempt, check, passed, roomUnbuilt, sentences, notes, counts or ms')
    expect(await lookRefused({ ...check, counts: { ...COUNTS, leftOut: undefined } })).toBe('bad or missing line, attempt, check, passed, roomUnbuilt, sentences, notes, counts or ms')
    expect(await lookRefused(check)).toBe(`try 1 of room ${first.line}'s look is not waiting for its check: the look is none on try 1`)
  })

  it('guards the waiting code again when a page takes it and when it is kept, and fails the try on code the guard now refuses', async () => {
    const library = fresh('guard-again', BASE_ANSWERS)
    // Written before a change to the guard: a stale guarded text beside the answer, which the line no longer reads.
    writeLine(library, [
      entry({ line: 'refused', party: 3, answer: { ...BASE_ANSWER, room: `let = 1\n${BASE_ANSWER.room}` } }),
      entry({ line: 'stale', guarded: { room: 'the guard of before', walk: 'the guard of before' } }),
      entry({ line: 'kept-refused', party: 2, answer: { ...BASE_ANSWER, walk: `let = 2\n${BASE_ANSWER.walk}` } }),
    ])
    const s = await serve(library, FAST, null)
    const job = (await s.get<TrialJob>('/trial')).body
    expect([job.line, job.room, job.walk]).toEqual(['stale', guarded('room', BASE_ANSWER.room), guarded('walk', BASE_ANSWER.walk)])
    // The oldest waiting room's code the guard refuses: it failed its try when it would have been taken, and no page got it.
    const refused = (await s.get<Line>('/line')).body.rooms.find((r) => r.line === 'refused')!
    expect([refused.state, refused.attempt]).toEqual(['fixing', 2])
    // A pass of code the guard now refuses is not kept: the try fails, never a 500 that would come back again.
    const kept = await s.post<LineRoom>('/trial', pass({ line: 'kept-refused', attempt: 1 } as TrialJob))
    expect([kept.status, kept.body.state, kept.body.attempt]).toEqual([200, 'fixing', 2])
    expect(logged(library).filter((l) => l.event === 'failed').map((l) => (l.sentences as string[])[0])).toEqual([expect.stringMatching(/^the room's code could not be compiled: /), expect.stringMatching(/^the walkthrough could not be compiled: /)])
  })

  it('with no CLI, lets a room that failed wait for a fix, asks nothing, and the next server with a CLI mends it', async () => {
    const library = fresh('no-cli', BASE_ANSWERS)
    writeLine(library, [entry({ line: 'waits' })])
    const a = await serve(library, FAST, null)
    expect((await a.get<Status>('/status')).body.claude).toBe(false)
    const job = (await a.get<TrialJob>('/trial')).body
    const failed = await a.post<LineRoom>('/trial', failure(job, 'step 2 never turned done'))
    expect(failed.body).toMatchObject({ line: 'waits', state: 'fixing', attempt: 2 })
    await new Promise((r) => setTimeout(r, 200))
    expect((await a.get<Line>('/line')).body.rooms[0]).toMatchObject({ state: 'fixing', attempt: 2, dropped: null })
    expect(turns()).toEqual([])
    // The failed report had a survey, so its look waits to be written too.
    expect((await a.get<Line>('/line')).body.rooms[0]!.look).toBe('writing')
    a.api.close()
    const b = await serve(library, FAST, bin)
    await waitFor(b, (r) => r.line === 'waits' && r.state === 'trial' && r.attempt === 2 && r.look === 'check', 'the fix and the look after the CLI came')
    expect(roomTurns()[0]!.prompt).toContain('It failed its trial:\n- step 2 never turned done')
    expect(lookTurns()[0]!.prompt).toContain('The room as it was built, measured by the trial:\nFloors: the deck from -10 to 10, its top at y 0.')
  })

  it('drops from the line a kept room that has since left the library, so no page waits for it', async () => {
    const library = fresh('left', BASE_ANSWERS)
    const there = keptFile(library).id
    writeLine(library, [
      entry({ line: 'there', state: 'kept', kept: there, look: look('kept'), gifts: { state: 'done' } }),
      entry({ line: 'gone', state: 'kept', kept: 'gone-room-9', survey: 'Floors: the deck.', look: look('writing'), gifts: { state: 'asking', tries: 1 } }),
    ])
    const s = await serve(library, FAST, bin)
    expect((await s.get<Line>('/line')).body.rooms.map((r) => [r.line, r.state, r.dropped, r.look])).toEqual([
      ['there', 'kept', null, 'kept'],
      ['gone', 'dropped', 'it was kept, and has since left the library', 'dropped'],
    ])
    expect(turns()).toEqual([])
  })

  it('lets one dev server at a time hold a library: a second reads it but refuses the line, until the first lets go', async () => {
    const library = fresh('two', BASE_ANSWERS)
    const a = await serve(library, FAST, bin)
    const b = await serve(library, FAST, bin)
    expect((await b.get<Status>('/status')).body.claude).toBe(false)
    expect((await b.get('/library')).status).toBe(200)
    for (const res of [await b.get<{ error: string }>('/line'), await b.post<{ error: string }>('/rooms', REQUEST), await b.get<{ error: string }>('/trial')]) {
      expect(res.status).toBe(409)
      expect(res.body.error).toMatch(new RegExp(`^the library ${library} is in use by another dev server \\(process ${process.pid}, since .+\\): only that one asks for rooms and writes the line, so give this one a MAGIC_LIBRARY of its own$`))
    }
    expect((await a.post<LineRoom>('/rooms', REQUEST)).status).toBe(200)
    a.api.close()
    expect(fs.existsSync(path.join(library, LOCK_FILE))).toBe(false)
    const c = await serve(library, FAST, bin)
    expect((await c.get<Status>('/status')).body.claude).toBe(true)
    // A lock left by a process that is gone is taken over.
    c.api.close()
    fs.writeFileSync(path.join(library, LOCK_FILE), JSON.stringify({ pid: 2 ** 22 + 12345, token: 'x', since: 'then' }))
    expect((await (await serve(library, FAST, bin)).get<Status>('/status')).body.claude).toBe(true)
  })

  it('logs play and changes no file of the library', async () => {
    const library = fresh('play', BASE_ANSWERS)
    const s = await serve(library, FAST, bin)
    const listing = () => fs.readdirSync(library, { recursive: true, withFileTypes: true }).filter((f) => f.isFile() && f.name !== 'log.jsonl').map((f) => [f.name, fs.readFileSync(path.join(f.parentPath, f.name), 'utf8')])
    await s.get('/library')
    const before = listing()
    const play = { party: 2, room: 'own:moon-garden', at: '2026-11-22T10:00:00.000Z', level: 1, secs: 250, restarts: 0, hints: 1, end: 'finished', steps: { done: 3, of: 3 }, thumbs: ['up', null] }
    expect((await s.post('/play', play)).body).toEqual({ ok: true })
    expect(listing()).toEqual(before)
    expect(logged(library).at(-1)).toMatchObject({ event: 'play', ...play })
    expect((await s.post<{ error: string }>('/play', { ...play, thumbs: ['up'] })).status).toBe(400)
  })

  it('reads the tokens and the cost from the CLI result', () => {
    const result = { type: 'result', subtype: 'success', total_cost_usd: 0.19, usage: { input_tokens: 2, output_tokens: 3971, output_tokens_details: { thinking_tokens: 1893 }, cache_read_input_tokens: 0, cache_creation_input_tokens: 14031 } }
    expect(usageOf(result)).toEqual({ inputTokens: 2, outputTokens: 3971, thinkingTokens: 1893, cacheReadTokens: 0, cacheWriteTokens: 14031, costUsd: 0.19 })
    expect(usageOf({ type: 'result', subtype: 'success' })).toBeNull()
  })
})

describe("a room's look on the line", () => {
  it("is asked on the first report with a survey, never on a guard's refusal; the room is kept on its game's pass and the look added later, the door waiting for it until then", async () => {
    const library = fresh('look-life', { ...BASE_ANSWERS, theme: { ...BASE_ANSWER, room: `let = 1\n${BASE_ANSWER.room}` }, room: { name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: BASE_ANSWER.room, walk: '' } })
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    await waitFor(s, (r) => r.line === line && r.state === 'trial' && r.attempt === 2, 'the fix of the refused code')
    expect([lookTurns(), (await s.get<Line>('/line')).body.rooms[0]!.look, (await s.get('/look-trial')).body]).toEqual([[], 'none', null])

    const job = (await s.get<TrialJob>('/trial')).body
    const kept = (await s.post<LineRoom>('/trial', pass(job))).body
    const file = JSON.parse(fs.readFileSync(path.join(library, 'rooms', 'pirate-sails-1.json'), 'utf8')) as RoomFile
    expect(kept).toMatchObject({ line, state: 'kept', kept: 'pirate-sails-1', look: 'writing', lookWaitUntil: new Date(Date.parse(file.made) + LOOK_WAIT_MS).toISOString() })
    expect([file.look, file.lookGuarded, file.lookWish]).toEqual([null, null, ''])

    await waitFor(s, (r) => r.line === line && r.look === 'check', 'the look')
    const [asked] = lookTurns()
    expect([asked!.system, asked!.schema, asked!.model, asked!.effort]).toEqual([LOOK_SYSTEM, LOOK_SCHEMA, 'opus', 'low'])
    expect(asked!.prompt.startsWith(`Another designer made this room.\ntheme: ${BASE_ANSWER.theme}`)).toBe(true)
    expect(asked!.prompt).toContain(`The room code:\n${BASE_ANSWER.room}\n\nThe room as it was built, measured by the trial:\nFloors: the deck.\n\nDress this room.`)
    const lookJob = (await s.get<LookJob>('/look-trial')).body
    expect(lookJob).toEqual({ line, attempt: 1, check: 1, party: 4, seed: job.seed, roll: REQUEST.roll, level: 1, shell: BASE_ANSWER.shell, room: job.room, look: guarded('look', LOOK_ANSWER.look) })
    expect((await s.get('/look-trial')).body).toBeNull()

    const added = (await s.post<LineRoom>('/look-trial', lookPass(lookJob))).body
    expect(added).toMatchObject({ line, state: 'kept', look: 'kept', lookWaitUntil: null })
    const withLook = JSON.parse(fs.readFileSync(path.join(library, 'rooms', 'pirate-sails-1.json'), 'utf8')) as RoomFile
    expect(withLook).toEqual({ ...file, look: LOOK_ANSWER.look, lookGuarded: lookJob.look, lookWish: '' })
    expect((await s.post('/look-trial', lookPass(lookJob))).status).toBe(409)
    const events = logged(library).map((l) => l.event)
    expect(events.filter((e) => e.startsWith('look') || e === 'keep' || e === 'ready')).toEqual(['keep', 'look check waits', 'look check', 'look kept', 'ready'])
    const ready = logged(library).find((l) => l.event === 'ready')!
    expect([ready.look, ready.readySecs as number < LOOK_WAIT_MS / 1000 + 5]).toEqual(['kept', true])
  }, 30_000)

  it('fixes a look that failed its check once, then gives it up, and the room stays kept without it', async () => {
    const library = fresh('look-gave-up', BASE_ANSWERS)
    const s = await serve(library, FAST, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the answer')
    await s.post('/trial', pass((await s.get<TrialJob>('/trial')).body))
    await waitFor(s, (r) => r.line === line && r.look === 'check', 'the look')
    const first = (await s.get<LookJob>('/look-trial')).body
    const failed = (await s.post<LineRoom>('/look-trial', lookFailure(first, 'the look has 3 props that react (line 6)', ['r.decor at 0, 1, 0 would stand inside the deck, so it was left out']))).body
    expect(failed).toMatchObject({ look: 'fixing', state: 'kept' })
    expect(failed.lookWaitUntil).not.toBeNull()

    await waitFor(s, (r) => r.line === line && r.look === 'check', "the look's fix")
    const fix = lookTurns()[1]!
    expect([fix.system, fix.schema]).toEqual([LOOK_SYSTEM, LOOK_FIX_SCHEMA])
    expect(fix.prompt.startsWith(lookTurns()[0]!.prompt)).toBe(true)
    expect(fix.prompt).toContain(`You answered with this look, each line numbered as the sentences below name it:\n  1  ${LOOK_ANSWER.look.split('\n')[0]}`)
    expect(fix.prompt).toContain("Its check failed:\n- the look has 3 props that react (line 6)\n\nThe check's notes:\n- r.decor at 0, 1, 0 would stand inside the deck, so it was left out")
    const second = (await s.get<LookJob>('/look-trial')).body
    expect([second.attempt, second.look]).toEqual([2, guarded('look', LOOK_FIX.look)])

    const gaveUp = (await s.post<LineRoom>('/look-trial', lookFailure(second, 'the look threw', []))).body
    expect(gaveUp).toMatchObject({ line, state: 'kept', look: 'gave up', lookWaitUntil: null })
    expect(JSON.parse(fs.readFileSync(path.join(library, 'rooms', 'pirate-sails-1.json'), 'utf8')).look).toBeNull()
    expect(logged(library).filter((l) => l.event === 'look given up' || l.event === 'kept without its look').map((l) => [l.event, l.why ?? null])).toEqual([
      ['look given up', 'its last try failed: the look threw'],
      ['kept without its look', null],
    ])
    expect(lookTurns().length).toBe(2)
  }, 30_000)

  it('sends a look back to its check when a game fix changes the room, refuses a check of the room before the change, and leaves the look ready when a fix mends only the walkthrough', async () => {
    const roomFix = { name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: `// moved\n${BASE_ANSWER.room}`, walk: '' }
    const library = fresh('look-recheck', { ...BASE_ANSWERS, room: [roomFix, WALK_FIX] })
    writeLine(library, [entry({ line: 'r', survey: 'Floors: the deck.', look: look('check') })])
    const s = await serve(library, FAST, bin)
    const before = (await s.get<LookJob>('/look-trial')).body
    expect(before.room).toBe(guarded('room', BASE_ANSWER.room))

    await s.post('/trial', failure((await s.get<TrialJob>('/trial')).body, 'step 1 never turned done'))
    await waitFor(s, (r) => r.line === 'r' && r.state === 'trial' && r.attempt === 2, 'the fix that moves the room')
    const stale = await s.post<{ error: string }>('/look-trial', lookPass(before))
    expect([stale.status, stale.body.error]).toEqual([409, "check 1 of room r's look is not the one waited for: the room changed since it was taken, and its look waits to be checked again"])
    const after = (await s.get<LookJob>('/look-trial')).body
    expect([after.attempt, after.check, after.room, after.look]).toEqual([1, 2, guarded('room', roomFix.room), before.look])
    // A second page took the fresh check: the report of the check taken before the change is still refused.
    expect((await s.post('/look-trial', lookPass(before))).status).toBe(409)
    expect((await s.post<LineRoom>('/look-trial', lookPass(after))).body).toMatchObject({ state: 'trial', look: 'ready', lookWaitUntil: null })

    await s.post('/trial', failure((await s.get<TrialJob>('/trial')).body, 'step 2 never turned done'))
    const walkOnly = await waitFor(s, (r) => r.line === 'r' && r.state === 'trial' && r.attempt === 3, 'the fix of the walkthrough')
    expect([walkOnly.look, (await s.get('/look-trial')).body]).toEqual(['ready', null])
    expect(logged(library).filter((l) => l.event === 'look checked again').map((l) => l.attempt)).toEqual([2])
    // A ready look goes into the file at once when its room is kept.
    const kept = (await s.post<LineRoom>('/trial', pass((await s.get<TrialJob>('/trial')).body))).body
    expect(kept).toMatchObject({ state: 'kept', look: 'kept', lookWaitUntil: null })
    expect(JSON.parse(fs.readFileSync(path.join(library, 'rooms', `${kept.kept!}.json`), 'utf8')).lookGuarded).toBe(before.look)
    expect(lookTurns()).toEqual([])
  }, 30_000)

  it("keeps a look's try when its check found the room's own code did not build, checks it again once a game fix changes the room, and gives it up only on a kept room", async () => {
    const roomFix = { name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: `// mended at level 3\n${BASE_ANSWER.room}`, walk: '' }
    const library = fresh('look-room-unbuilt', { ...BASE_ANSWERS, room: [roomFix] })
    const keptId = keptFile(library).id
    writeLine(library, [
      entry({ line: 'r', survey: 'Floors: the deck.', look: look('check') }),
      entry({ line: 'k', party: 3, state: 'kept', kept: keptId, finished: new Date().toISOString(), opens: new Date(Date.now() + LOOK_WAIT_MS).toISOString(), survey: 'Floors: the deck.', look: look('check'), gifts: { state: 'done' } }),
    ])
    const s = await serve(library, FAST, bin)
    const outside = 'r.box at 0, -0.5, 0 is outside the room'
    const first = (await s.get<LookJob>('/look-trial')).body
    expect([first.line, first.check]).toEqual(['r', 1])
    // The room's failure, not the look's: the look keeps its try and is handed out no more until the room changes.
    expect((await s.post<LineRoom>('/look-trial', roomUnbuiltAt(first, 3, outside))).body).toMatchObject({ line: 'r', look: 'check' })
    const kept = (await s.get<LookJob>('/look-trial')).body
    expect(kept.line).toBe('k')
    expect((await s.get('/look-trial')).body).toBeNull()

    await s.post('/trial', failure((await s.get<TrialJob>('/trial')).body, `at level 3: ${outside}`))
    await waitFor(s, (r) => r.line === 'r' && r.state === 'trial' && r.attempt === 2, 'the game fix')
    const again = (await s.get<LookJob>('/look-trial')).body
    expect([again.line, again.attempt, again.check, again.room]).toEqual(['r', 1, 2, guarded('room', roomFix.room)])
    expect((await s.post<LineRoom>('/look-trial', lookPass(again))).body).toMatchObject({ line: 'r', look: 'ready' })
    expect(lookTurns()).toEqual([])

    // A kept room's code will not change: its look is given up, not held for ever.
    expect((await s.post<LineRoom>('/look-trial', roomUnbuiltAt(kept, 2, outside))).body).toMatchObject({ line: 'k', look: 'gave up', lookWaitUntil: null })
    expect(logged(library).filter((l) => ['look waits for its room', 'look failed', 'look given up'].includes(l.event)).map((l) => [l.event, l.line])).toEqual([
      ['look waits for its room', 'r'],
      ['look given up', 'k'],
    ])
  }, 30_000)

  it("drops a room's look with it, and throws away a look's answer still on its way", async () => {
    const library = fresh('look-dropped', BASE_ANSWERS)
    const slow = path.join(dir, 'slow-claude')
    fs.writeFileSync(slow, `#!/bin/sh\nsleep 1\nexec "${bin}" "$@"\n`, { mode: 0o755 })
    writeLine(library, [entry({ line: 'last', attempt: 3, survey: 'Floors: the deck.', look: look('writing') })])
    const s = await serve(library, FAST, slow)
    const dropped = (await s.post<LineRoom>('/trial', failure((await s.get<TrialJob>('/trial')).body, 'step 3 never turned done'))).body
    expect(dropped).toMatchObject({ state: 'dropped', look: 'dropped', lookWaitUntil: null })
    await until(() => logged(library).some((l) => l.event === 'look thrown away'), 10_000, 'the look on its way')
    expect([lookTurns().length, (await s.get<Line>('/line')).body.rooms[0]!.look, (await s.get('/look-trial')).body]).toEqual([1, 'dropped', null])
  }, 30_000)

  it('removes at load an entry made for the old house, and logs it', async () => {
    const library = fresh('old-house', BASE_ANSWERS)
    const { v, look: noLook, survey, opens, devices, ...old } = entry({ line: 'old', state: 'kept', kept: 'old-room-1', gifts: { state: 'done' } })
    writeLine(library, [{ ...old, roll: { ...REQUEST.roll, size: 'one' } }, entry({ line: 'new', state: 'fixing', attempt: 2 })])
    const s = await serve(library, FAST, null)
    expect([v, noLook, survey, opens, devices].map((x) => x !== undefined)).toEqual([true, true, true, true, true])
    expect((await s.get<Line>('/line')).body.rooms.map((r) => r.line)).toEqual(['new'])
    expect(logged(library).filter((l) => l.event === 'made for the old house').map((l) => l.line)).toEqual(['old'])
    expect(fs.readFileSync(path.join(library, 'line.jsonl'), 'utf8')).not.toContain('"old"')
  })

  it('takes the look up after a restart from every state: a call under way asked again, a taken check handed out again, the rest as they were', async () => {
    const library = fresh('look-restart', BASE_ANSWERS)
    const keptId = keptFile(library).id
    const gaveUpId = keptFile(library).id
    const survey = 'Floors: the deck.'
    writeLine(library, [
      entry({ line: 'none', party: 1 }),
      entry({ line: 'writing', party: 2, survey, look: look('writing') }),
      entry({ line: 'check', party: 3, survey, look: look('check', { taken: Date.now() }) }),
      entry({ line: 'fixing', survey, look: look('fixing', { tries: 2, failures: [{ sentences: ['the look threw'], notes: [] }] }) }),
      entry({ line: 'ready', survey, state: 'fixing', attempt: 2, failures: [{ sentences: ['step 1 never turned done'], survey }], look: look('ready') }),
      entry({ line: 'kept', state: 'kept', kept: keptId, finished: new Date(1e12).toISOString(), opens: new Date(1e12).toISOString(), survey, look: look('kept'), gifts: { state: 'done' } }),
      entry({ line: 'gave up', state: 'kept', kept: gaveUpId, finished: new Date(1e12).toISOString(), opens: new Date(1e12).toISOString(), survey, look: look('gave up'), gifts: { state: 'done' } }),
      entry({ line: 'dropped', state: 'dropped', dropped: 'its last try failed', survey, look: look('dropped') }),
    ])
    // No CLI first: nothing is asked, and the line is as it was written, the taken check free again.
    const a = await serve(library, FAST, null)
    const states = async (s: Served) => Object.fromEntries((await s.get<Line>('/line')).body.rooms.map((r) => [r.line, r.look]))
    expect(await states(a)).toEqual({ none: 'none', writing: 'writing', check: 'check', fixing: 'fixing', ready: 'ready', kept: 'kept', 'gave up': 'gave up', dropped: 'dropped' })
    expect((await a.get<LookJob>('/look-trial')).body.line).toBe('check')
    a.api.close()

    const b = await serve(library, FAST, bin)
    await until(async () => { const now = await states(b); return now.writing === 'check' && now.fixing === 'check' }, 10_000, 'the look and the fix asked again')
    expect(lookTurns().map((t) => t.schema)).toEqual(expect.arrayContaining([LOOK_SCHEMA, LOOK_FIX_SCHEMA]))
    expect(lookTurns().length).toBe(2)
    const jobs: LookJob[] = []
    for (let job = (await b.get<LookJob | null>('/look-trial')).body; job !== null; job = (await b.get<LookJob | null>('/look-trial')).body) jobs.push(job)
    expect(jobs.map((j) => [j.line, j.attempt, j.look])).toEqual([
      ['writing', 1, guarded('look', LOOK_ANSWER.look)],
      ['check', 1, guarded('look', LOOK_ANSWER.look)],
      ['fixing', 2, guarded('look', LOOK_FIX.look)],
    ])
    expect(await states(b)).toEqual({ none: 'none', writing: 'check', check: 'check', fixing: 'check', ready: 'ready', kept: 'kept', 'gave up': 'gave up', dropped: 'dropped' })
    // The room in fixing was asked again too, and its ready look waits for the room's keep.
    await waitFor(b, (r) => r.line === 'ready' && r.state === 'trial', 'the fix after the restart')
    expect((await b.get<Line>('/line')).body.rooms.find((r) => r.line === 'ready')!.look).toBe('ready')
  }, 30_000)
})

describe('the drift the log watches for', () => {
  it("finds a theme's head word and the hue of the walls three of the newest ten share", () => {
    expect(['a pirate ship at sea', 'a mill in a mossy wood', 'Toy Workshops', 'a frozen river', 'glass'].map(headWord)).toEqual(['ship', 'mill', 'workshop', 'river', 'glass'])
    const room = (en: string, theme: string, walls: string) => ({ name: { en, fi: en }, theme, task: 'play', shell: { ...BASE_ANSWER.shell, walls: { ...BASE_ANSWER.shell.walls, color: walls } } })
    expect(drift([room('A', 'a toy kitchen', '#ff0000'), room('B', 'a busy kitchen in a castle', '#00ff00'), room('C', 'kitchens', '#0000ff'), room('D', 'a cave', 'grey')])).toEqual({ theme: { word: 'kitchen', rooms: ['A', 'B', 'C'] }, walls: null })
    expect(drift([room('A', 'a cave', '#ff2000'), room('B', 'a bakery', 'red'), room('C', 'a forge', '#ff0030'), room('D', 'a lab', '#00ff00')])).toEqual({ theme: null, walls: { hue: 349, rooms: ['A', 'B', 'C'] } })
    // Only the newest ten count.
    expect(drift([...['cave', 'lab', 'barn', 'dock', 'forge', 'tent', 'mine', 'loft', 'hall', 'shop'].map((theme, i) => room(`N${i}`, `a ${theme}`, 'white')), room('X', 'a kitchen', 'red'), room('Y', 'a kitchen', 'red'), room('Z', 'a kitchen', 'red')])).toEqual({ theme: null, walls: null })
  })

  it('logs a drift when a new room is asked, for whoever reads the log, and says nothing of it to the model', async () => {
    const library = fresh('drift', BASE_ANSWERS)
    for (let i = 0; i < 3; i++) keptFile(library)
    const s = await serve(library, FAST, bin)
    await s.post<LineRoom>('/rooms', REQUEST)
    const logged1 = logged(library).find((l) => l.event === 'drift')!
    expect([logged1.theme, (logged1.walls as { rooms: string[] }).rooms]).toEqual([{ word: 'ship', rooms: ['Pirate Sails', 'Pirate Sails', 'Pirate Sails'] }, ['Pirate Sails', 'Pirate Sails', 'Pirate Sails']])
    await until(() => roomTurns().length === 1, 10_000, 'the ask')
    expect(roomTurns()[0]!.prompt).not.toMatch(/drift|head word|\bhue/i)
  })
})

describe('the line end to end, with the trial run in Node', () => {
  it("keeps the twins' base room the fake CLI answers with, once the trial passes it, and its presents", async () => {
    const library = fresh('end-to-end', BASE_ANSWERS)
    const s = await serve(library, TIMING, bin)
    const { line } = (await s.post<LineRoom>('/rooms', REQUEST)).body
    await waitFor(s, (r) => r.line === line && r.state === 'trial', 'the answer')
    const job = (await s.get<TrialJob>('/trial')).body
    const answer = answerJob({ kind: 'trial', job }, () => performance.now())
    if (answer.kind !== 'trial') throw new Error('the worker answered with presents')
    expect([answer.report.passed, answer.report.sentences]).toEqual([true, []])
    const kept = (await s.post<LineRoom>('/trial', answer.report)).body
    expect(kept).toMatchObject({ line, state: 'kept', attempt: 1, kept: 'pirate-sails-1' })
    let gifts: GiftsJob | null = null
    await until(async () => (gifts = (await s.get<GiftsJob | null>('/gift-trial')).body) !== null, 10_000, 'the presents')
    const checked = answerJob({ kind: 'gifts', job: gifts! }, () => performance.now())
    if (checked.kind !== 'gifts') throw new Error('the worker answered with a trial')
    const index = (await s.post<LibraryIndex>('/gift-trial', checked.report)).body
    expect([index.rooms.map((r) => [r.id, r.botSecs]), index.gifts.map((g) => g.name.en)]).toEqual([[['pirate-sails-1', answer.report.botSecs]], GIFTS.gifts.map((g) => g.name.en)])
  }, 60_000)
})
