/**
 * The plugin end to end: configureServer with a stand-in Vite server, the fake CLI and the fake
 * whisper-server as the programs it finds through the environment, and a temporary library.
 * Status, hearing, interpreting, inventing (streamed, with a syntax error sent back once), the
 * library and the log, and the errors it answers with instead of crashing.
 */
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LIBRARY_EVENT, PAGE_HEADER, type ActionEntry, type InterpretReply, type InventLine, type ItemEntry, type LibraryData, type LibraryNews, type NewAction, type NewItem, type Plan, type Status } from '../engine/protocol'
import { interpreterContext } from '../brain/context'
import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, NEW_NAMES, makeCast } from '../content'
import { Library } from '../engine/library'
import { createWorld } from '../engine/sim'
import type { Lang } from '../engine/lang'
import type { RoomId } from '../engine/types'
import { contextNames, fromElsewhere, guardScripts, leakedMarkup, listLostKinds, meetRoomWater, tidyPlan } from './api'
import { guard } from './guard'
import { API_PATH, sillyBilly } from './plugin'
import { ACTION_SYSTEM, INTERPRET_SYSTEM, ITEM_SYSTEM, PLAN_SCHEMA } from './prompts'
import { alive, fakeBin, freePort, until } from './test/fakes'
import { RATE, wav } from '../voice/mic'
import type { Clip } from './voice'
import { defaultPrime, hearFields } from './whisper'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void

/** The repo's root, where Vite's module runner finds /silly-billy/src/server/api.ts. */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
/** What the plugin told the pages over Vite's websocket. */
const told: { event: string; data: unknown }[] = []

const THROW: NewAction = {
  id: 'throw',
  name: 'throw',
  nameFi: 'heitä',
  calls: ['heitä', 'throw'],
  about: 'Picks the thing up, turns to the target and throws it so it lands on the target.',
  params: [
    { name: 'thing', kind: 'item', about: 'what to throw', optional: false },
    { name: 'target', kind: 'thing', about: 'who to throw at', optional: true },
  ],
}

const BIKE: NewItem = {
  id: 'bicycle',
  name: 'bicycle',
  nameFi: 'polkupyörä',
  calls: ['pyörä', 'bicycle'],
  about: 'A red bike with two black wheels.',
  rough: [{ shape: 'box', size: [0.1, 0.6, 1.4], at: [0, 0.3, 0], color: 'red' }],
  meta: { ride: true, carry: 'hug' },
}

/** What the interpreter answers: new things with untidy ids, used by the steps. */
const MESSY: Plan = {
  heard: 'Steve rides a bike over the Christmas tree',
  heardFi: 'Eetu ajaa pyörällä joulukuusen yli',
  who: ['Steve'],
  steps: [{ who: 'Steve', action: 'Ride Over', args: [{ name: 'vehicle', value: 'Bicycle!' }, { name: 'target', value: 'Christmas Tree' }] }],
  newActions: [{ ...THROW, id: 'Ride Over', name: 'ride', nameFi: 'aja', calls: ['Aja', 'aja', 'ride'] }],
  newItems: [
    { ...BIKE, id: 'Bicycle!' },
    { ...BIKE, id: 'Christmas Tree', name: 'christmas tree', nameFi: 'joulukuusi' },
  ],
  say: 'Bike time!',
  sayFi: 'Pyöräillään!',
}

/** What the page sends to hear: enough of a WAV header for the fake whisper-server to know it. */
const WAV = new Uint8Array([...Buffer.from('RIFF....WAVEfmt '), ...new Uint8Array(64)])

const CODE = Array.from({ length: 12 }, (_, i) => `me.say('step ${i}')\nyield* w.wait(0.2)`).join('\n')
const MODEL = "m.box(0.1, 0.6, 1.4, { at: [0, 0.3, 0], color: 'red' })\nreturn { ride: true }"
const TICK = 'it.state.spin = (it.state.spin || 0) + dt'

let dir: string
let base: string
let server: http.Server
let handler: Handler
const vite = new EventEmitter()
const logs: string[] = []
const env = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
const answers = (a: Record<string, unknown>) => fs.writeFileSync(process.env.FAKE_CLAUDE_ANSWERS!, JSON.stringify({ plan: MESSY, code: CODE, bad: 'const = 1', ...a }))
const lines = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [])
const calls = () => lines(process.env.FAKE_CLAUDE_LOG!) as { argv: string[]; prompt: string }[]
const library = () => path.join(dir, 'library')
/** The kept voice clips' names, oldest first, and one clip's JSON. */
const clips = () => (fs.existsSync(path.join(library(), 'voice')) ? fs.readdirSync(path.join(library(), 'voice')).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)).sort() : [])
const clip = (name: string) => JSON.parse(fs.readFileSync(path.join(library(), 'voice', `${name}.json`), 'utf8')) as Clip

async function post(route: string, body: unknown, query = '') {
  const r = await fetch(`${base}${route}${query}`, { method: 'POST', body: typeof body === 'string' || body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body) })
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}
async function get(route: string) {
  const r = await fetch(`${base}${route}`)
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}
async function invent(body: unknown): Promise<InventLine[]> {
  const r = await fetch(`${base}/invent`, { method: 'POST', body: JSON.stringify(body) })
  expect(r.headers.get('content-type')).toContain('ndjson')
  return (await r.text()).trim().split('\n').map((l) => JSON.parse(l) as InventLine)
}

/** A plugin on a stand-in Vite server, reached over real HTTP the way connect mounts it. */
async function serve(): Promise<{ base: string; server: http.Server; handler: Handler; vite: EventEmitter }> {
  let mounted: Handler | null = null
  const fake = new EventEmitter()
  const stub = {
    middlewares: { use: (at: string, fn: Handler) => (expect(at).toBe(API_PATH), (mounted = fn)) },
    config: { root: ROOT, logger: { info: (m: string) => logs.push(m) } },
    httpServer: fake,
    ssrLoadModule: (url: string) => import(path.join(ROOT, url)),
    ws: { send: (event: string, data: unknown) => told.push({ event, data }) },
  }
  ;(sillyBilly().configureServer as (s: ViteDevServer) => void)(stub as unknown as ViteDevServer)
  const http_ = http.createServer((req, res) => {
    req.url = req.url!.slice(API_PATH.length) || '/'
    mounted!(req, res, () => {})
  })
  await new Promise<void>((r) => http_.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${(http_.address() as { port: number }).port}${API_PATH}`, server: http_, handler: mounted!, vite: fake }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-plugin-'))
  const model = path.join(dir, 'model.bin')
  fs.writeFileSync(model, 'not really a model')
  env({
    CLAUDE_BIN: fakeBin(dir, 'fake-claude.mjs'),
    SILLY_WHISPER_BIN: fakeBin(dir, 'fake-whisper.mjs'),
    SILLY_WHISPER_MODEL: model,
    SILLY_WHISPER_PORT: String(await freePort()),
    SILLY_LIBRARY: library(),
    SILLY_INTERPRET_MODEL: undefined,
    SILLY_INVENT_MODEL: undefined,
    FAKE_CLAUDE_ANSWERS: path.join(dir, 'answers.json'),
    FAKE_CLAUDE_LOG: path.join(dir, 'calls.jsonl'),
    FAKE_CLAUDE_STATE: path.join(dir, 'state'),
    FAKE_WHISPER_LOG: path.join(dir, 'whisper.jsonl'),
    FAKE_WHISPER_DELAY: '400',
    FAKE_WHISPER_TEXT: ' Alice, hyppää!  [Musiikkia] ',
    FAKE_WHISPER_TEXT_FILE: path.join(dir, 'whisper-text.txt'),
  })
  answers({})
  const s = await serve()
  ;({ base, server, handler } = s)
  vite.on('close', () => s.vite.emit('close'))
})

afterAll(async () => {
  vite.emit('close')
  await new Promise((r) => server.close(r))
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the plugin', () => {
  it('runs only under vite serve', () => {
    const apply = sillyBilly().apply as (config: object, env: { command: string; mode: string }) => boolean
    expect(apply({}, { command: 'serve', mode: 'development' })).toBe(true)
    expect(apply({}, { command: 'serve', mode: 'test' })).toBe(false)
    expect(apply({}, { command: 'build', mode: 'production' })).toBe(false)
  })

  it('does nothing before the first request', () => {
    expect(typeof handler).toBe('function')
    expect(logs).toEqual([])
    expect(fs.existsSync(library())).toBe(false)
    expect(calls()).toEqual([])
  })

  it('reports its status and starts whisper on the first status; words sent meanwhile wait for it', async () => {
    const first = (await get('/status')).body as unknown as Status
    expect(first).toEqual({ claude: true, whisper: 'starting', models: { interpret: 'opus', invent: 'opus' } })
    expect(logs[0]).toContain(`Claude: ${process.env.CLAUDE_BIN}`)
    const early = await post('/hear', WAV, '?lang=fi&partial=1')
    expect([early.status, early.body.text]).toEqual([200, 'Alice, hyppää!'])
    expect(((await get('/status')).body as unknown as Status).whisper).toBe('ready')
  })

  it('hears in the language of the setting, primed by the page or by its own sentence for the language, and logs the final words', async () => {
    const asked = () => lines(process.env.FAKE_WHISPER_LOG!).slice(heardBefore)
    const heardBefore = lines(process.env.FAKE_WHISPER_LOG!).length
    const heard = await post('/hear', WAV, '?lang=fi')
    expect(heard.status).toBe(200)
    expect(heard.body.text).toBe('Alice, hyppää!')
    await post('/hear', WAV, `?lang=fi&partial=1&prime=${encodeURIComponent('Aino, Ella ja Venla leikkivät.')}`)
    await post('/hear', WAV, '?lang=en')
    await post('/hear', WAV, `?lang=en&partial=1&prime=${encodeURIComponent(' Alice and   Zoë are playing. ')}`)
    expect(asked().map((a) => [a.language, a.prompt, a.file])).toEqual([
      ['fi', defaultPrime('fi'), { wav: true }],
      ['fi', 'Aino, Ella ja Venla leikkivät.', { wav: true }],
      ['en', defaultPrime('en'), { wav: true }],
      ['en', 'Alice and Zoë are playing.', { wav: true }],
    ])
    // Every field every time, and the live words asked the same way as the final ones.
    const fields = (a: Record<string, unknown>) => Object.fromEntries(Object.entries(a).filter(([k]) => !['pid', 'prompt', 'language'].includes(k)))
    expect(asked().map(fields)).toEqual(Array.from({ length: 4 }, () => fields({ model: process.env.SILLY_WHISPER_MODEL, file: { wav: true }, ...hearFields('fi', '', new Set()) })))
    // Only the final words are logged, each with its language (and in English without the letters English does not write).
    const logged = lines(path.join(library(), 'log.jsonl')).filter((l) => l.kind === 'hear')
    expect(logged.map((l) => [l.lang, l.text])).toEqual([
      ['fi', 'Alice, hyppää!'],
      ['en', 'Alice, hyppaa!'],
    ])
    // Only the final clips are kept, and each log line names its clip.
    expect(clips()).toEqual(logged.map((l) => l.clip))
    expect(clips().map((c) => (clip(c).text))).toEqual(['Alice, hyppää!', 'Alice, hyppaa!'])
  })

  it('keeps each whole clip with what came with it and what Whisper made of it, for measuring hearing', async () => {
    const mic = {
      device: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux armv81', maxTouchPoints: 10, fingerOnly: true },
      asked: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      got: { sampleRate: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0.01 },
      label: '',
      contextRate: 16000,
      heldMs: 1840,
      startMs: 35,
    }
    const before = clips().length
    const sound = Buffer.from(wav([new Float32Array(RATE).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 280 * i) / RATE))], RATE))
    const r = await fetch(`${base}/hear?lang=fi&mic=${encodeURIComponent(JSON.stringify(mic))}`, { method: 'POST', body: sound, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-X710)' } })
    expect(r.status).toBe(200)
    const kept = clips().slice(before)
    expect(kept).toHaveLength(1)
    const c = clip(kept[0]!)
    expect(c).toMatchObject({ lang: 'fi', prime: defaultPrime('fi'), raw: 'Alice, hyppää! [Musiikkia]', text: 'Alice, hyppää!', noSpeech: 0.25, logprob: -0.5, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710)', mic, said: null, who: null })
    expect(c.recognizer).toEqual({ model: 'model.bin', extras: [] })
    expect(c.sound).toMatchObject({ seconds: 1, zeroLeadMs: 0 })
    expect(c.sound!.pitchHz).toBeGreaterThan(270)
    expect(fs.readFileSync(path.join(library(), 'voice', `${kept[0]}.wav`)).equals(sound)).toBe(true)
    // A live clip is not kept, whatever came with it; a mic that is not JSON is refused.
    await post('/hear', WAV, `?lang=fi&partial=1&mic=${encodeURIComponent(JSON.stringify(mic))}`)
    expect(clips().slice(before)).toHaveLength(1)
    // A clip with no voice in it hears nothing, live or whole, though Whisper wrote words for it; the clip keeps what it wrote.
    const silence = Buffer.from(wav([new Float32Array(RATE / 2)], RATE))
    expect((await post('/hear', new Uint8Array(silence), '?lang=fi&partial=1')).body.text).toBe('')
    expect((await post('/hear', new Uint8Array(silence), '?lang=fi')).body.text).toBe('')
    const quiet = clip(clips().at(-1)!)
    expect([quiet.raw, quiet.text, quiet.sound!.voiced]).toEqual(['Alice, hyppää! [Musiikkia]', '', 0])
    expect(lines(path.join(library(), 'log.jsonl')).at(-1)).toMatchObject({ kind: 'hear', text: '', raw: 'Alice, hyppää! [Musiikkia]', clip: clips().at(-1) })
    expect((await post('/hear', WAV, '?lang=fi&mic=%7Bnot')).status).toBe(400)
    expect((await post('/hear', WAV, '?lang=fi&mic=%5B1%5D')).status).toBe(400)
  })

  it('folds letters Finnish does not write to Finnish ones before the words go on, and logs what Whisper wrote', async () => {
    fs.writeFileSync(path.join(dir, 'whisper-text.txt'), ' Yrri, laskja ljúkumaðist. ')
    try {
      expect((await post('/hear', WAV, '?lang=fi')).body.text).toBe('Yrri, laskja ljukumadist.')
      expect(lines(path.join(library(), 'log.jsonl')).filter((l) => l.kind === 'hear').at(-1)).toMatchObject({ lang: 'fi', text: 'Yrri, laskja ljukumadist.', raw: 'Yrri, laskja ljúkumaðist.' })
      fs.writeFileSync(path.join(dir, 'whisper-text.txt'), ' Noora, Mirri ja Äijä, tulkaa tänne. ')
      expect((await post('/hear', WAV, '?lang=en')).body.text).toBe('Noora, Mirri ja Aija, tulkaa tanne.')
      // A letter in the names of who is here (the page's prime) is kept: a child named an avatar Äijä.
      expect((await post('/hear', WAV, `?lang=en&prime=${encodeURIComponent('Nora, Luna and Äijä are playing.')}`)).body.text).toBe('Noora, Mirri ja Äijä, tulkaa tänne.')
    } finally {
      fs.rmSync(path.join(dir, 'whisper-text.txt'))
    }
  })

  it('interprets with the interpreter prompt and schema in the language the game is played in, and tidies the plan', async () => {
    const r = await post('/interpret', { words: 'eetu aja pyörällä joulukuusen yli', lang: 'fi', context: 'Room: forest\nActors (id name body pronoun):\n- steve Eetu kid he' })
    expect(r.status).toBe(200)
    const { plan, ms } = r.body as unknown as InterpretReply
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(plan.who).toEqual(['steve'])
    expect(plan.steps).toEqual([{ who: 'steve', action: 'ride-over', args: [{ name: 'vehicle', value: 'bicycle' }, { name: 'target', value: 'christmas-tree' }] }])
    expect(plan.newActions.map((a) => [a.id, a.nameFi, a.calls])).toEqual([['ride-over', 'aja', ['aja', 'ride']]])
    expect(plan.newItems.map((i) => [i.id, i.nameFi])).toEqual([
      ['bicycle', 'polkupyörä'],
      ['christmas-tree', 'joulukuusi'],
    ])
    expect([plan.heard, plan.heardFi, plan.say, plan.sayFi]).toEqual([MESSY.heard, MESSY.heardFi, MESSY.say, MESSY.sayFi])
    const call = calls().at(-1)!
    expect(call.argv.slice(call.argv.indexOf('--model'), call.argv.indexOf('--model') + 2)).toEqual(['--model', 'opus'])
    expect(call.argv[call.argv.indexOf('--system-prompt') + 1]).toBe(INTERPRET_SYSTEM)
    expect(call.argv[call.argv.indexOf('--json-schema') + 1]).toBe(JSON.stringify(PLAN_SCHEMA))
    expect(call.prompt).toContain('- steve Eetu kid he')
    expect(call.prompt).toContain('PLAYED IN FINNISH. THE CHILD SAID: "eetu aja pyörällä joulukuusen yli"')
    expect(lines(path.join(library(), 'log.jsonl')).find((l) => l.kind === 'interpret')).toMatchObject({ words: 'eetu aja pyörällä joulukuusen yli', lang: 'fi' })
    await post('/interpret', { words: 'steve ride the bike over the christmas tree', lang: 'en', context: 'Room: forest\nActors (id name body pronoun):\n- steve Steve kid he' })
    expect(calls().at(-1)!.prompt).toContain('PLAYED IN ENGLISH. THE CHILD SAID: "steve ride the bike over the christmas tree"')
  })

  it('asks again, in fresh sessions, when the interpreter writes markup into its plan', async () => {
    fs.rmSync(`${process.env.FAKE_CLAUDE_STATE}.broken`, { force: true })
    const before = calls().length
    const r = await post('/interpret', { words: 'tee uusi tyttö BROKEN_ONCE', lang: 'fi', context: 'Room: playground' })
    expect(r.status).toBe(200)
    expect((r.body as unknown as InterpretReply).plan.heard).toBe(MESSY.heard)
    const tries = calls().slice(before) as unknown as { pid: number; turn: number }[]
    expect(tries).toHaveLength(2)
    expect(tries[1]!.turn).toBe(1)
    expect(await post('/interpret', { words: 'tee uusi tyttö ALWAYS_BROKEN', lang: 'fi', context: 'Room: playground' })).toEqual({ status: 502, body: { error: 'the interpreter answered in pieces twice' } })
  })

  it('asks again, in fresh sessions, when the plan comes in a shape it cannot read', async () => {
    fs.rmSync(`${process.env.FAKE_CLAUDE_STATE}.shapeless`, { force: true })
    const before = calls().length
    const r = await post('/interpret', { words: 'hyppää SHAPELESS_ONCE', lang: 'fi', context: 'Room: playground' })
    expect(r.status).toBe(200)
    expect((r.body as unknown as InterpretReply).plan.steps).toEqual(tidyPlan(MESSY, 'fi').steps)
    expect(calls().slice(before)).toHaveLength(2)
    expect(lines(path.join(library(), 'log.jsonl')).filter((l) => l.kind === 'interpret-broken' && l.words === 'hyppää SHAPELESS_ONCE')).toHaveLength(1)
  })

  it('plays a plan whose new things lack an id by their names, leaves out one with neither, and logs the answer', async () => {
    // Seen live once in 14 commands: 'tee iso lohikäärme' came back with an empty id, and the page played the parser's guess.
    const dragon: Plan = {
      ...MESSY,
      steps: [{ who: 'Steve', action: '', args: [{ name: 'thing', value: '' }] }],
      newActions: [{ ...THROW, id: '', name: 'Toss Up' }, { ...THROW, id: ' ', name: '!' }],
      newItems: [{ ...BIKE, id: '', name: 'Big Dragon' }],
    }
    answers({ plan: dragon })
    const r = await post('/interpret', { words: 'stiivi tee iso lohikäärme', lang: 'fi', context: 'Room: forest' })
    answers({})
    expect(r.status).toBe(200)
    const { plan } = r.body as unknown as InterpretReply
    expect(plan.newActions.map((a) => a.id)).toEqual(['toss-up'])
    expect(plan.newItems.map((i) => i.id)).toEqual(['big-dragon'])
    expect(plan.steps).toEqual([{ who: 'steve', action: 'toss-up', args: [{ name: 'thing', value: 'big-dragon' }] }])
    const broken = lines(path.join(library(), 'log.jsonl')).filter((l) => l.kind === 'interpret-broken' && l.words === 'stiivi tee iso lohikäärme')
    expect(broken.map((l) => [l.left, (l.plan as Plan).newActions.length])).toEqual([[1, 2]])
  })

  it('logs no broken plan when a new thing is only named twice', async () => {
    answers({ plan: { ...MESSY, steps: [{ who: 'Steve', action: 'jump', args: [] }], newActions: [], newItems: [BIKE, { ...BIKE, id: 'Bicycle' }] } })
    const r = await post('/interpret', { words: 'stiivi pyörä pyörä', lang: 'fi', context: 'Room: forest' })
    answers({})
    expect((r.body as unknown as InterpretReply).plan.newItems.map((i) => i.id)).toEqual(['bicycle'])
    const log = lines(path.join(library(), 'log.jsonl')).filter((l) => l.words === 'stiivi pyörä pyörä')
    expect(log.map((l) => l.kind)).toEqual(['interpret'])
  })

  it('stops the interpreter when the page stops waiting, and answers the next words', async () => {
    const before = calls().length
    const ctl = new AbortController()
    const asked = fetch(`${base}/interpret`, { method: 'POST', body: JSON.stringify({ words: 'hyppää HANG', lang: 'fi', context: 'Room: playground' }), signal: ctl.signal })
    await until(() => calls().length > before, 5000, 'the interpreter to get the words')
    const { pid } = calls().at(-1) as unknown as { pid: number }
    ctl.abort()
    await expect(asked).rejects.toThrow()
    await until(() => !alive(pid), 5000, 'the interpreter process to stop')
    expect((await post('/interpret', { words: 'hyppää', lang: 'fi', context: 'Room: playground' })).status).toBe(200)
  })

  it('refuses an interpret request without words', async () => {
    expect(await post('/interpret', { lang: 'fi', context: 'x' })).toEqual({ status: 400, body: { error: 'bad or missing words' } })
  })

  it('streams progress while the designer writes an action, then the guarded entry', async () => {
    const out = await invent({ kind: 'action', spec: THROW, words: 'alis heitä pallo stiiville', context: 'Room: playground' })
    const progress = out.slice(0, -1).map((l) => (l as { progress: number }).progress)
    expect(progress.length).toBeGreaterThan(3)
    expect(progress.every((p, i) => p > 0 && p < 1 && (i === 0 || p > progress[i - 1]!))).toBe(true)
    const { done } = out.at(-1) as { done: ActionEntry; ms: number }
    expect(done).toMatchObject({ type: 'action', id: 'throw', name: 'throw', nameFi: 'heitä', calls: THROW.calls, about: THROW.about, params: THROW.params, code: CODE, by: 'opus', asked: 'alis heitä pallo stiiville' })
    expect(done.guarded).toBe((guard('action', CODE) as { guarded: string }).guarded)
    expect(Date.parse(done.made)).toBeGreaterThan(0)
    const call = calls().at(-1)!
    expect(call.argv[call.argv.indexOf('--model') + 1]).toBe('opus')
    expect(call.argv[call.argv.indexOf('--system-prompt') + 1]).toBe(ACTION_SYSTEM)
  })

  it('sends a syntax error straight back to the designer once', async () => {
    const before = calls().length
    const out = await invent({ kind: 'action', spec: THROW, words: 'heitä BAD_SYNTAX', context: 'Room: playground' })
    expect((out.at(-1) as { done: ActionEntry }).done.code).toBe(CODE)
    const tries = calls().slice(before)
    expect(tries).toHaveLength(2)
    expect(tries[1]!.prompt).toContain('SyntaxError: Unexpected token (line 1)')
    expect(tries[1]!.prompt).toContain('const = 1')
  })

  it('gives up with the error after the second try fails too', async () => {
    const out = await invent({ kind: 'action', spec: THROW, words: 'heitä ALWAYS_BAD', context: 'Room: playground' })
    expect(out.at(-1)).toEqual({ error: 'SyntaxError: Unexpected token (line 1)' })
  })

  it('makes a thing with its process, keeping the draft beside it', async () => {
    // A Finnish name the designer gives unasked does not replace the interpreter's.
    answers({ code: MODEL, tick: TICK, nameFi: 'fillari' })
    const out = await invent({ kind: 'item', spec: BIKE, words: 'steve aja pyörällä', context: 'Room: forest' })
    const { done } = out.at(-1) as { done: ItemEntry }
    expect(done).toMatchObject({ type: 'item', id: 'bicycle', nameFi: 'polkupyörä', calls: BIKE.calls, code: MODEL, tick: TICK, rough: BIKE.rough, roughMeta: BIKE.meta, by: 'opus' })
    expect(done.guarded).toBe((guard('model', MODEL) as { guarded: string }).guarded)
    expect(done.tickGuarded).toBe((guard('tick', TICK) as { guarded: string }).guarded)
    expect(calls().at(-1)!.argv).toContain(ITEM_SYSTEM)
    expect(calls().at(-1)!.prompt).not.toContain('nameFi')
    answers({})
  })

  it('asks the designer for the Finnish name of a thing the interpreter used without listing it', async () => {
    const [tree] = listLostKinds({ ...tidyPlan(MESSY, 'fi'), newItems: [] }, 'Item kinds: ball.').newItems
    expect(tree).toMatchObject({ id: 'christmas-tree', name: 'christmas tree', nameFi: 'christmas tree' })
    answers({ code: MODEL, nameFi: ' Joulukuusi ' })
    const out = await invent({ kind: 'item', spec: tree, words: 'eetu aja joulukuusen yli', context: 'Room: forest' })
    answers({})
    expect(calls().at(-1)!.prompt).toContain('give nameFi too')
    expect((out.at(-1) as { done: ItemEntry }).done).toMatchObject({ id: 'christmas-tree', name: 'christmas tree', nameFi: 'Joulukuusi', calls: ['christmas-tree', 'joulukuusi'] })
    // Without an answer, its English name stands in.
    answers({ code: MODEL })
    const plain = await invent({ kind: 'item', spec: tree, words: 'eetu aja joulukuusen yli', context: 'Room: forest' })
    answers({})
    expect((plain.at(-1) as { done: ItemEntry }).done.nameFi).toBe('christmas tree')
  })

  it('refuses an invent request that is not one', async () => {
    expect((await post('/invent', { kind: 'spell', spec: THROW, words: 'x', context: 'x' })).body).toEqual({ error: 'bad or missing kind' })
    expect((await post('/invent', { kind: 'item', spec: THROW, words: 'x', context: 'x' })).body).toEqual({ error: 'bad or missing rough' })
    expect((await post('/invent', { kind: 'action', spec: { ...THROW, nameFi: 3 }, words: 'x', context: 'x' })).body).toEqual({ error: 'bad or missing nameFi' })
  })

  it('saves, reads and forgets the library', async () => {
    const entry: ActionEntry = { type: 'action', ...THROW, code: CODE, guarded: 'old', by: 'opus', asked: 'heitä', made: '2026-11-08T10:00:00.000Z' }
    expect(await post('/library', { entry })).toEqual({ status: 200, body: { ok: true } })
    const phrase = { words: 'alis heitä pallo', plan: { ...MESSY, steps: [{ who: 'alice', action: 'throw', args: [] }] }, made: entry.made }
    expect((await post('/library', { phrase })).status).toBe(200)
    const data = (await get('/library')).body as unknown as LibraryData
    expect(data.actions.map((a) => [a.id, a.guarded === (guard('action', CODE) as { guarded: string }).guarded])).toEqual([['throw', true]])
    expect(data.phrases.map((p) => p.words)).toEqual(['alis heitä pallo'])
    expect(await post('/forget', { type: 'action', id: 'throw' })).toEqual({ status: 200, body: { ok: true, existed: true } })
    const after = (await get('/library')).body as unknown as LibraryData
    expect([after.actions, after.phrases]).toEqual([[], []])
  })

  it('tells every page what was saved and forgotten, as saved, and which page did it (2026-11-09: two pages made the same things twice)', async () => {
    told.length = 0
    const entry: ActionEntry = { type: 'action', ...THROW, id: 'Toss Twice', code: CODE, guarded: 'old', by: 'opus', asked: 'heitä', made: '2026-11-09T16:40:00.000Z' }
    const as = (page: string, route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST', headers: { [PAGE_HEADER]: page }, body: JSON.stringify(body) })
    expect((await as('page-a', '/library', { entry })).status).toBe(200)
    expect((await as('page-b', '/forget', { type: 'action', id: 'toss-twice' })).status).toBe(200)
    expect(told.map((t) => t.event)).toEqual([LIBRARY_EVENT, LIBRARY_EVENT])
    const [saved, forgot] = told.map((t) => t.data as LibraryNews)
    // As the server keeps it: its id made safe and its code guarded afresh.
    expect(saved).toMatchObject({ from: 'page-a', entry: { id: 'toss-twice', guarded: (guard('action', CODE) as { guarded: string }).guarded } })
    expect(forgot).toEqual({ from: 'page-b', forgot: { type: 'action', id: 'toss-twice' } })
  })

  it('refuses library requests the page could not mean', async () => {
    expect(await post('/library', {})).toEqual({ status: 400, body: { error: 'bad or missing entry or phrase' } })
    expect((await post('/library', { entry: { type: 'robot', id: 'r', name: 'r', calls: [] } })).body).toEqual({ error: 'unknown entry type "robot"' })
    expect((await post('/forget', { type: 'robot', id: 'r' })).status).toBe(400)
  })

  it('logs what the page sends', async () => {
    expect((await post('/log', { kind: 'command', words: 'mike tanssi' })).status).toBe(200)
    expect(lines(path.join(library(), 'log.jsonl')).find((l) => l.kind === 'command')!.words).toBe('mike tanssi')
    expect((await post('/log', { words: 'no kind' })).status).toBe(400)
  })

  it('refuses what a browser sends for a page of another site, before it runs anything', async () => {
    const entry: ActionEntry = { type: 'action', ...THROW, id: 'keep-me', code: CODE, guarded: 'old', by: 'opus', asked: 'heitä', made: '2026-11-08T10:00:00.000Z' }
    expect((await post('/library', { entry })).status).toBe(200)
    const before = calls().length
    const send = async (route: string, headers: Record<string, string>, body?: unknown) => {
      const r = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: r.status, body: (await r.json()) as unknown }
    }
    const refused = { status: 403, body: { error: 'only the game itself may ask this' } }
    // A plain text POST needs no preflight, so a page elsewhere can send it; CORS only hides the answer.
    expect(await send('/forget', { origin: 'https://evil.example.com', 'content-type': 'text/plain' }, { type: 'action', id: 'keep-me' })).toEqual(refused)
    expect(await send('/interpret', { origin: 'null' }, { words: 'hyppää', lang: 'fi', context: 'x' })).toEqual(refused)
    expect(await send('/invent', { 'sec-fetch-site': 'cross-site' }, { kind: 'action', spec: THROW, words: 'x', context: 'x' })).toEqual(refused)
    expect(await send('/library', { 'sec-fetch-site': 'same-site' }, { entry })).toEqual(refused)
    expect(await send('/status', { 'sec-fetch-site': 'cross-site' })).toEqual(refused)
    expect(calls().length).toBe(before)
    expect(((await get('/library')).body as unknown as LibraryData).actions.map((a) => a.id)).toContain('keep-me')
    // The game's own page, and the address bar.
    expect((await send('/forget', { origin: new URL(base).origin, 'sec-fetch-site': 'same-origin' }, { type: 'action', id: 'keep-me' })).body).toEqual({ ok: true, existed: true })
    expect((await send('/status', { 'sec-fetch-site': 'none' })).status).toBe(200)
  })

  it('answers wrong requests with JSON errors', async () => {
    expect(await get('/nothing')).toEqual({ status: 404, body: { error: 'no /nothing here' } })
    expect(await get('/interpret')).toEqual({ status: 405, body: { error: '/interpret takes POST' } })
    expect(await post('/interpret', 'not json')).toEqual({ status: 400, body: { error: 'the body is not JSON' } })
    expect(await post('/interpret', '[1]')).toEqual({ status: 400, body: { error: 'the body is not a JSON object' } })
    expect(await post('/interpret', 'x'.repeat(1_100_000))).toEqual({ status: 413, body: { error: 'the request is over 1000000 bytes' } })
  })

  it('says when there is no CLI, and refuses to interpret', async () => {
    const saved = { CLAUDE_BIN: process.env.CLAUDE_BIN, PATH: process.env.PATH, HOME: process.env.HOME }
    env({ CLAUDE_BIN: undefined, PATH: '/nowhere', HOME: path.join(dir, 'empty-home') })
    const other = await serve()
    try {
      const status = (await fetch(`${other.base}/status`).then((r) => r.json())) as Status
      expect(status.claude).toBe(false)
      const r = await fetch(`${other.base}/interpret`, { method: 'POST', body: JSON.stringify({ words: 'hyppää', lang: 'fi', context: 'x' }) })
      expect([r.status, await r.json()]).toEqual([503, { error: 'no Claude CLI on this computer' }])
    } finally {
      env(saved)
      other.vite.emit('close')
      await new Promise((r) => other.server.close(r))
    }
  })
})

describe('the plugin after the server code changes', () => {
  /** An api.ts that reports which word it was built with, and when its Api is built and closed. */
  const API_STUB = [
    "import { word } from './word'",
    'const seen = ((globalThis as Record<string, unknown>).__sillyReload ??= { built: [], closed: [] }) as { built: string[]; closed: string[] }',
    'export function depsFromEnv() { return {} }',
    'export class Api {',
    '  constructor() { seen.built.push(word) }',
    '  async handle(_req: unknown, res: { end(body: string): void }) { res.end(JSON.stringify({ word })) }',
    '  close() { seen.closed.push(word) }',
    '}',
  ].join('\n')

  it('closes the old API and builds a fresh one on the next request after a file it uses changed, and only then', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-reload-'))
    const src = path.join(root, 'silly-billy', 'src', 'server')
    fs.mkdirSync(src, { recursive: true })
    const write = (file: string, text: string) => fs.writeFileSync(path.join(src, file), text)
    write('api.ts', API_STUB)
    write('word.ts', "export const word = 'one'\n")
    write('other.ts', 'export const other = 1\n')
    const seen = ((globalThis as Record<string, unknown>).__sillyReload = { built: [] as string[], closed: [] as string[] })
    // The watcher is Vite's own handling of a changed file, told by hand: a plugin's watchChange hook says when it got there.
    let changed = (_file: string) => {}
    const { createServer } = await import('vite')
    const vite = await createServer({
      root,
      configFile: false,
      mode: 'development',
      logLevel: 'silent',
      appType: 'custom',
      cacheDir: path.join(root, '.vite'),
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [sillyBilly(), { name: 'told', watchChange: (file: string) => changed(file) }],
    })
    const app = http.createServer(vite.middlewares)
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r))
    const ask = async () => {
      const r = await fetch(`http://127.0.0.1:${(app.address() as { port: number }).port}${API_PATH}/status`)
      return { status: r.status, body: (await r.json()) as { word?: string; error?: string } }
    }
    const change = async (file: string, text?: string) => {
      if (text !== undefined) write(file, text)
      const told = new Promise<void>((resolve) => (changed = (f) => f.endsWith(file) && resolve()))
      vite.watcher.emit('change', path.join(src, file))
      await told
      // The module graph takes the change right after the hooks.
      await new Promise((r) => setTimeout(r, 20))
    }
    try {
      expect((await ask()).body).toEqual({ word: 'one' })
      expect((await ask()).body).toEqual({ word: 'one' })
      expect(seen).toEqual({ built: ['one'], closed: [] })
      // A file the API does not use changes nothing.
      await change('other.ts', 'export const other = 2\n')
      expect((await ask()).body).toEqual({ word: 'one' })
      expect(seen).toEqual({ built: ['one'], closed: [] })
      // A file it uses: the old one is closed first, then the fresh one answers.
      await change('word.ts', "export const word = 'two'\n")
      expect((await ask()).body).toEqual({ word: 'two' })
      expect((await ask()).body).toEqual({ word: 'two' })
      expect(seen).toEqual({ built: ['one', 'two'], closed: ['one'] })
      // Code that does not load is a 500 and leaves the running one alone, until code that loads comes.
      await change('word.ts', "export const word = 'three\n")
      const broken = await ask()
      expect(broken.status).toBe(500)
      expect(broken.body.error).toContain('the API did not load')
      expect(seen).toEqual({ built: ['one', 'two'], closed: ['one'] })
      await change('word.ts', "export const word = 'three'\n")
      expect((await ask()).body).toEqual({ word: 'three' })
      expect(seen).toEqual({ built: ['one', 'two', 'three'], closed: ['one', 'two'] })
      // So does a change to api.ts itself.
      await change('api.ts', `${API_STUB}\nexport const again = true\n`)
      expect((await ask()).body).toEqual({ word: 'three' })
      expect(seen).toEqual({ built: ['one', 'two', 'three', 'three'], closed: ['one', 'two', 'three'] })
    } finally {
      await new Promise((r) => app.close(r))
      await vite.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('fromElsewhere', () => {
  it('compares the Origin with the host, from :authority over HTTP/2 (Vite serves https so) or Host', () => {
    expect(fromElsewhere({ origin: 'https://dev.example.com:3002', ':authority': 'dev.example.com:3002' })).toBe(false)
    expect(fromElsewhere({ origin: 'https://dev.example.com:3002', host: 'Dev.Example.com:3002' })).toBe(false)
    expect(fromElsewhere({ origin: 'https://dev.example.com', host: 'dev.example.com' })).toBe(false)
    expect(fromElsewhere({ origin: 'https://evil.example.com', ':authority': 'dev.example.com:3002' })).toBe(true)
    expect(fromElsewhere({ origin: 'https://dev.example.com:3003', host: 'dev.example.com:3002' })).toBe(true)
    expect(fromElsewhere({ origin: 'not a url', host: 'dev.example.com' })).toBe(true)
    expect(fromElsewhere({})).toBe(false)
  })
})

describe('listLostKinds', () => {
  const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
  /** The context the page really sends (brain/context.ts) in a room: the game's own verbs, kinds, cast and rooms, played in Finnish (the game's default) unless `lang` says otherwise. */
  const worldIn = (room: RoomId, lang: Lang = 'fi') => createWorld({ room, actors: makeCast(lang), layouts: LAYOUTS, seed: 7, lang })
  const contextIn = (room: RoomId, lang: Lang = 'fi') => interpreterContext(worldIn(room, lang), library, { addressee: null, lastMade: null, said: [], did: new Map(), newNames: NEW_NAMES[lang] })
  const context = contextIn('playground')
  /** A plan of one step, its args by name. */
  const step = (who: string, action: string, args: Record<string, string>, more: Partial<Plan> = {}): Plan => ({
    heard: `${who} ${action}`,
    heardFi: `${who}: ${action}`,
    who: [who],
    steps: [{ who, action, args: Object.entries(args).map(([name, value]) => ({ name, value })) }],
    newActions: [],
    newItems: [],
    say: 'Okay!',
    sayFi: 'Okei!',
    ...more,
  })
  const RIDE: NewAction = {
    ...THROW,
    id: 'ride',
    params: [
      { name: 'vehicle', kind: 'item', about: 'what to ride', optional: false },
      { name: 'target', kind: 'thing', about: 'what to ride over', optional: true },
      { name: 'speed', kind: 'text', about: 'how fast', optional: true },
    ],
  }
  const ride = step('steve', 'ride', { vehicle: 'bicycle', target: 'christmas-tree', speed: 'fast' }, { newActions: [RIDE], newItems: [{ ...BIKE }] })
  const lost = (plan: Plan, room: RoomId = 'playground') => listLostKinds(plan, contextIn(room)).newItems.slice(plan.newItems.length).map((i) => i.id)

  it('lists a new thing a new action uses and nobody listed, from its name', () => {
    const plan = listLostKinds(ride, context)
    expect(plan.newItems.map((i) => i.id)).toEqual(['bicycle', 'christmas-tree'])
    expect(plan.newItems[1]).toMatchObject({ name: 'christmas tree', nameFi: 'christmas tree', calls: ['christmas-tree'], rough: [], meta: {} })
    expect(plan.newItems[1]!.about).toContain('A christmas tree')
  })

  it('leaves known kinds, avatars, listed things and text alone', () => {
    const known = step('steve', 'ride', { vehicle: 'bicycle', target: 'noora', speed: 'fast' }, { newActions: [RIDE], newItems: [{ ...BIKE }] })
    expect(listLostKinds(known, context)).toBe(known)
    const tree = step('steve', 'ride', { target: 'tree' }, { newActions: [RIDE] })
    expect(listLostKinds(tree, context)).toBe(tree)
    // An action neither new nor in the game: its params are not known, so nothing is.
    const unknownAction = { ...ride, newActions: [] }
    expect(listLostKinds(unknownAction, context)).toBe(unknownAction)
    const words = step('steve', 'say', { words: 'magic-wand' })
    expect(listLostKinds(words, context)).toBe(words)
    const painted = step('alice', 'paint', { color: 'gold', part: 'hair-sparkly' })
    expect(listLostKinds(painted, context)).toBe(painted)
  })

  it("lists the kind a built-in wear or make is given as text that nobody has made: 'anna Nooralle taikasauva'", () => {
    // The plan logged live: noora wear(thing=magic-wand) and no new things, which played and was saved as a mystery box.
    expect(lost(step('noora', 'wear', { thing: 'magic-wand' }))).toEqual(['magic-wand'])
    expect(lost(step('mike', 'make', { thing: 'snowman', color: 'white' }))).toEqual(['snowman'])
    // A kind the game has, a slot, the colour, or what to take off: nothing to make.
    for (const plan of [step('noora', 'wear', { thing: 'cap', color: 'gold' }), step('noora', 'wear', { thing: 'hair' }), step('noora', 'take-off', { thing: 'magic-wand' })]) expect(listLostKinds(plan, context)).toBe(plan)
  })

  it("reads a step's new thing ('new:castle') as its kind: listed when nobody made it, tidied with its new thing's id", () => {
    expect(lost(step('steve', 'build', { thing: 'new:castle' }, { newActions: [{ ...THROW, id: 'build', params: [{ name: 'thing', kind: 'item', about: 'what to build', optional: false }] }] }))).toEqual(['castle'])
    const known = step('steve', 'make', { thing: 'new:slide' })
    expect(listLostKinds(known, context)).toBe(known)
    const messy = step('steve', 'build', { thing: 'new:Water Slide' }, { newItems: [{ ...BIKE, id: 'Water Slide', name: 'water slide' }] })
    const tidy = tidyPlan(messy, 'fi')
    expect(tidy.newItems.map((i) => i.id)).toEqual(['water-slide'])
    expect(tidy.steps[0]!.args).toEqual([{ name: 'thing', value: 'new:water-slide' }])
    // A new pond a step asks for is made, not the room's water.
    const pond = meetRoomWater(step('alice', 'make', { thing: 'new:pond' }, { newItems: [{ ...BIKE, id: 'pond', name: 'pond' }] }), contextIn('forest'))
    expect(pond.newItems.map((i) => i.id)).toEqual(['pond'])
  })

  it('lists no room, ground, sky, avatar or person who is no avatar as a new thing', () => {
    const plans: Array<[Plan, RoomId]> = [
      [step('alice', 'sit', { on: 'ground' }), 'playground'],
      [step('mirri', 'sleep', { on: 'grass' }), 'forest'],
      [step('noora', 'look', { at: 'pool' }), 'pool'],
      [step('noora', 'look', { at: 'water' }), 'pool'],
      [step('steve', 'look', { at: 'pond' }), 'forest'],
      [step('mike', 'look', { at: 'sky' }), 'playground'],
      [step('alice', 'wave', { to: 'child' }), 'playground'],
      [step('alice', 'paint', { color: 'red', thing: 'everything' }), 'playground'],
      [step('alice', 'grow', { thing: 'me' }), 'playground'],
      [step('steve', 'look', { at: 'forest' }), 'playground'],
      [step('alice', 'look', { at: 'uimahalli' }), 'forest'],
      // Mirri (Luna in English) is the cat.
      [step('steve', 'look', { at: 'cat' }), 'playground'],
      // A swim takes a thing: in the pool room the pool is the room, not a kind.
      [step('noora', 'swim', { thing: 'pool' }, { newActions: [{ ...THROW, id: 'swim', params: [{ name: 'thing', kind: 'thing', about: 'where to swim', optional: true }] }] }), 'pool'],
    ]
    const shown = (plan: Plan, out: string[]) => `${plan.steps[0]!.action} ${plan.steps[0]!.args.map((a) => a.value).join(' ')}: ${out.join(' ')}`
    expect(plans.map(([plan, room]) => shown(plan, lost(plan, room)))).toEqual(plans.map(([plan]) => shown(plan, [])))
    // A thing to give or sit on that nobody made is still one; a cat to make is a thing even with Mirri here.
    expect(lost(step('steve', 'give', { thing: 'apple', to: 'noora' }))).toEqual(['apple'])
    expect(lost(step('alice', 'sit', { on: 'throne' }))).toEqual(['throne'])
    expect(lost(step('mike', 'make', { thing: 'cat' }))).toEqual(['cat'])
    // A renamed avatar is called by its new name.
    const world = worldIn('playground')
    Object.assign(world.actors.find((a) => a.id === 'mirri')!, { name: 'Fluffy Paws', names: null })
    const renamed = interpreterContext(world, library, { addressee: null, lastMade: null, said: [], did: new Map(), newNames: NEW_NAMES.fi })
    const look = step('steve', 'look', { at: 'fluffy-paws' })
    expect(listLostKinds(look, renamed)).toBe(look)
  })

  it('reads the context the page really sends', () => {
    const names = contextNames(contextIn('pool'))
    expect(names.params.get('give')).toEqual([
      { name: 'thing', kind: 'item' },
      { name: 'to', kind: 'actor' },
    ])
    expect(names.params.get('wear')).toEqual([
      { name: 'thing', kind: 'text' },
      { name: 'color', kind: 'text' },
    ])
    expect(names.params.get('come')).toEqual([])
    for (const id of ['alice', 'steve', 'mirri', 'ball', 'slide', 'hair-short', 'cap']) expect(names.known.has(id)).toBe(true)
    expect(names.known.has('magic-wand')).toBe(false)
    for (const word of ['playground', 'pool', 'uimahalli', 'forest', 'metsä', 'mirri', 'cat', 'mikko', 'aino', 'grownup', 'kid']) expect(names.scene.has(word), word).toBe(true)
    for (const word of ['ball', 'she', 'wears', 'hair-short']) expect(names.scene.has(word), word).toBe(false)
    // Played in English the cast goes by its English names; the ids stay.
    const english = contextNames(contextIn('pool', 'en'))
    for (const word of ['luna', 'alice', 'mike', 'cat']) expect(english.scene.has(word), word).toBe(true)
    for (const id of ['alice', 'steve', 'mike', 'noora', 'mirri']) expect(english.known.has(id) && names.known.has(id), id).toBe(true)
    // The kinds' Finnish names ('ball (pallo)') are no kinds; the room's water is the scene's, with the spot in its middle.
    expect(names.known.has('(pallo)') || names.known.has('pallo')).toBe(false)
    expect(names.water.get('pool')).toBe('0,-2.5')
    expect(contextNames(contextIn('forest')).water.get('pond')).toBe('6.5,-6.5')
    expect(contextNames(contextIn('forest')).scene.has('pond')).toBe(true)
    expect(contextNames(contextIn('playground')).water.size).toBe(0)
  })

  it('keeps the whole scene of a full room short', () => {
    // Haiku's time follows its answer, not this (measured on the CLI): 2.3k characters more than the old context cost no time.
    for (const room of ['playground', 'pool', 'forest'] as const) expect(contextIn(room).length, room).toBeLessThan(9000)
  })
})

describe('scripts', () => {
  const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
  const context = interpreterContext(createWorld({ room: 'forest', actors: makeCast('fi'), layouts: LAYOUTS, seed: 7, lang: 'fi' }), library, { addressee: null, lastMade: null, said: [], did: new Map(), newNames: NEW_NAMES.fi })
  const withScript = (code: string, args: Plan['steps'][number]['args'] = []): Plan => ({
    ...MESSY,
    who: ['alice'],
    steps: [{ who: 'alice', action: 'Ladder To Treehouse!', args }],
    newActions: [],
    newItems: [],
    scripts: [{ id: 'Ladder To Treehouse!', about: 'Aino makes a ladder — and fixes it to #i9.', code }],
  })

  it('tidies a script like a new action: its id in kebab-case in the steps too, its about without dashes, its code as it is', () => {
    const plan = tidyPlan(withScript("w.make('ladder') // a — dash in code stays"), 'fi')
    expect(plan.scripts).toEqual([{ id: 'ladder-to-treehouse', about: 'Aino makes a ladder, and fixes it to #i9.', code: "w.make('ladder') // a — dash in code stays" }])
    expect(plan.steps[0]!.action).toBe('ladder-to-treehouse')
    expect('scripts' in tidyPlan(MESSY, 'fi')).toBe(false)
  })

  it('guards the code for the page, or says why it is refused, and leaves no code to the designer', () => {
    const [ok] = guardScripts(tidyPlan(withScript("const l = w.make('ladder')\nl.attachTo(w.find('treehouse'), 'front')"), 'fi')).scripts!
    expect(ok!.guarded).toBe((guard('action', ok!.code) as { guarded: string }).guarded)
    const [bad] = guardScripts(tidyPlan(withScript('window.open()'), 'fi')).scripts!
    expect(bad).toMatchObject({ guarded: null, refused: expect.stringContaining('window') })
    const [none] = guardScripts(tidyPlan(withScript(''), 'fi')).scripts!
    expect(none).toMatchObject({ code: '', guarded: null })
  })

  it("lists a kind a script makes and nobody listed, and meets the room's water in a script's args", () => {
    const plan = listLostKinds(tidyPlan(withScript("const l = w.make('ladder')\nconst p = w.make(\"pinecone\")"), 'fi'), context)
    expect(plan.newItems.map((i) => i.id)).toEqual(['ladder'])
    const pond = meetRoomWater(tidyPlan(withScript('yield* me.walkTo(args.where)', [{ name: 'where', value: 'pond' }]), 'fi'), context)
    expect(pond.steps[0]!.args).toEqual([{ name: 'where', value: '6.5,-6.5' }])
  })
})

describe('meetRoomWater', () => {
  const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
  const contextIn = (room: RoomId) => interpreterContext(createWorld({ room, actors: makeCast('fi'), layouts: LAYOUTS, seed: 7, lang: 'fi' }), library, { addressee: null, lastMade: null, said: [], did: new Map(), newNames: NEW_NAMES.fi })
  const POND: NewItem = { ...BIKE, id: 'pond', name: 'pond', nameFi: 'lampi', calls: ['lampi', 'lampeen', 'pond'], meta: { carry: 'no' } }
  const THROW_AT: NewAction = { ...THROW, id: 'throw', params: [{ name: 'thing', kind: 'item', about: 'what', optional: false }, { name: 'target', kind: 'thing', about: 'where', optional: true }] }
  const plan = (steps: Plan['steps'], more: Partial<Plan> = {}): Plan => ({ heard: 'x', heardFi: 'x', who: ['alice'], steps, newActions: [], newItems: [], say: 'Okay!', sayFi: 'Okei!', ...more })

  it('"heitä se lampeen" in the forest throws toward the forest\'s own pond, and makes no new one', () => {
    // The plan logged live: throw(pinecone, target=pond) and a new pond 2.2 m across.
    const live = plan([{ who: 'alice', action: 'throw', args: [{ name: 'thing', value: 'pinecone' }, { name: 'target', value: 'pond' }] }], { newActions: [THROW_AT], newItems: [POND] })
    const met = meetRoomWater(live, contextIn('forest'))
    expect(met.newItems).toEqual([])
    expect(met.steps[0]!.args).toEqual([{ name: 'thing', value: 'pinecone' }, { name: 'target', value: '6.5,-6.5' }])
    // Going there takes the spot as a place too.
    expect(meetRoomWater(plan([{ who: 'noora', action: 'walk', args: [{ name: 'to', value: 'pond' }] }]), contextIn('forest')).steps[0]!.args[0]!.value).toBe('6.5,-6.5')
    expect(meetRoomWater(plan([{ who: 'noora', action: 'run', args: [{ name: 'to', value: 'water' }] }]), contextIn('pool')).steps[0]!.args[0]!.value).toBe('0,-2.5')
  })

  it('leaves a pond to make, and a room without water, alone', () => {
    const make = plan([{ who: 'alice', action: 'make', args: [{ name: 'thing', value: 'pond' }] }], { newItems: [POND] })
    expect(meetRoomWater(make, contextIn('forest'))).toEqual(make)
    const playground = plan([{ who: 'alice', action: 'walk', args: [{ name: 'to', value: 'pond' }] }], { newItems: [POND] })
    expect(meetRoomWater(playground, contextIn('playground'))).toBe(playground)
  })
})

describe('leakedMarkup', () => {
  it('finds tool-call markup in a plan and nothing in a clean one', () => {
    expect(leakedMarkup(MESSY)).toBe(false)
    expect(leakedMarkup({ ...MESSY, heard: 'Make a new girl</heard>\n<parameter name="create">{"id": "ella"}' })).toBe(true)
    expect(leakedMarkup({ ...MESSY, say: 'Hi!<parameter name="sayFi">Hei!' })).toBe(true)
    expect(leakedMarkup({ ...MESSY, say: 'I <3 you!' })).toBe(false)
  })
})

describe('tidyPlan', () => {
  it('leaves a tidy plan as it is', () => {
    const tidy: Plan = { heard: 'Mikko dances with the cat', heardFi: 'Mikko tanssii kissan kanssa', who: ['mike'], steps: [{ who: 'mike', action: 'dance', args: [{ name: 'partner', value: 'mirri' }] }], newActions: [{ ...THROW, id: 'dance', nameFi: 'tanssi', calls: ['tanssi', 'dance'] }], newItems: [], say: 'Dance!', sayFi: 'Tanssitaan!' }
    expect(tidyPlan(tidy, 'fi')).toEqual(tidy)
  })

  it('gives a new action or thing without a Finnish name its first Finnish call, and a plan without a Finnish line its Finnish answer', () => {
    const plan = tidyPlan({ ...MESSY, heardFi: '', newActions: [{ ...THROW, id: 'Ride Over', name: 'ride', nameFi: ' ', calls: ['ride', 'Aja'] }], newItems: [{ ...BIKE, id: 'Bicycle!', nameFi: undefined as unknown as string }] }, 'fi')
    expect([plan.heardFi, plan.newActions[0]!.nameFi, plan.newItems[0]!.nameFi]).toEqual([MESSY.sayFi, 'aja', 'pyörä'])
  })

  it('takes the dashes out of every line and arg for the child, and keeps the hyphens', () => {
    const plan = tidyPlan({ ...MESSY, heard: 'Steve rides — fast', heardFi: 'Eetu ajaa – lujaa', say: 'Wheee — bike!', sayFi: '— Jee–pyörä! —', steps: [{ who: 'steve', action: 'say', args: [{ name: 'words', value: 'Hei — moi!' }, { name: 'thing', value: 'christmas-tree' }] }] }, 'fi')
    expect([plan.heard, plan.heardFi, plan.say, plan.sayFi, ...plan.steps[0]!.args.map((a) => a.value)]).toEqual(['Steve rides, fast', 'Eetu ajaa, lujaa', 'Wheee, bike!', 'Jee, pyörä!', 'Hei, moi!', 'christmas-tree'])
  })

  it("says an arg that is the plan's answer in the other language in the game's: Eetu was made to say 'Okay, I stop!' in Finnish", () => {
    const stop: Plan = { ...MESSY, heard: 'No! Eetu stops', heardFi: 'Ei! Eetu lopettaa', say: 'Okay, I stop!', sayFi: 'Okei, lopetan!', steps: [{ who: 'steve', action: 'say', args: [{ name: 'words', value: 'Okay, I stop!' }] }] }
    expect(tidyPlan(stop, 'fi').steps[0]!.args[0]!.value).toBe('Okei, lopetan!')
    expect(tidyPlan({ ...stop, steps: [{ who: 'steve', action: 'say', args: [{ name: 'words', value: 'okei lopetan' }] }] }, 'en').steps[0]!.args[0]!.value).toBe('Okay, I stop!')
    // Words in the game's language, kinds and words the answer does not say stay as they are.
    expect(tidyPlan({ ...stop, steps: [{ who: 'steve', action: 'say', args: [{ name: 'words', value: 'Okay, I stop!' }, { name: 'thing', value: 'ball' }] }] }, 'en').steps[0]!.args.map((a) => a.value)).toEqual(['Okay, I stop!', 'ball'])
    expect(tidyPlan({ ...stop, say: 'Hei!', sayFi: 'Hei!', steps: [{ who: 'steve', action: 'say', args: [{ name: 'words', value: 'Hei!' }] }] }, 'fi').steps[0]!.args[0]!.value).toBe('Hei!')
  })

  it('names a new avatar in lowercase ascii everywhere', () => {
    const plan = tidyPlan({ ...MESSY, who: ['Äijä'], steps: [{ who: 'Äijä', action: 'wear', args: [] }], newActions: [], newItems: [], create: { id: 'Äijä', name: 'Äijä', calls: ['Äijä'], pronoun: 'he', look: {} } }, 'fi')
    expect([plan.create!.id, plan.create!.calls, plan.who, plan.steps[0]!.who]).toEqual(['aija', ['äijä'], ['aija'], 'aija'])
  })
})
