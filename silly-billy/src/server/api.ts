/**
 * The page's ./api/ (engine/protocol.ts), served under the dev server by plugin.ts: it drives the
 * Claude Code CLI (claude.ts), whisper.cpp (whisper.ts) and the library on disk (store.ts).
 * plugin.ts loads this module on the first request, so nothing here runs when vite.config.ts is
 * loaded. Every failure is a JSON { error } with a 4xx or 5xx status, never a crash of the dev
 * server. Generated code is guarded here as text and never run here.
 */

import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import type { Lang } from '../engine/lang'
import {
  isNewThing,
  kindOfArg,
  NEW_THING,
  slugOf,
  type ActionEntry,
  type ForgetRequest,
  type HearReply,
  type InterpretReply,
  type InterpretRequest,
  type InventLine,
  type InventRequest,
  type ItemEntry,
  type LogLine,
  type NewAction,
  type NewItem,
  type Plan,
  type SaveRequest,
  type Status,
} from '../engine/protocol'
import { SLOTS, type Slot } from '../engine/types'
import type { MicInfo } from '../voice/mic'
import { Claude, Pool, findClaude, once, type Spec } from './claude'
import { guard } from './guard'
import { ACTION_SCHEMA, ACTION_SYSTEM, INTERPRET_SYSTEM, ITEM_SCHEMA, ITEM_SYSTEM, PLAN_SCHEMA, interpretMessage, inventMessage, lacksFinnishName, type ActionDesign, type ItemDesign } from './prompts'
import { Store, finnishName, safeId } from './store'
import { VOICE_CAP, VoiceStore, listen, voiceless } from './voice'
import { Whisper, defaultPrime, whisperSetup } from './whisper'

/** How long words wait for a Whisper that is still starting (after the server's code reloaded) before they are refused. */
const HEAR_WAITS_FOR_WHISPER = 30_000
const INTERPRET_TIMEOUT = 30_000
const INVENT_TIMEOUT = 90_000
/**
 * Interpreter processes side by side, each for one turn: every message carries the whole game,
 * and a conversation only lets one odd answer leak into the next ones (measured: a needless
 * room in the first plan was copied by every later plan). The pool keeps the next process up.
 */
const POOL = 2
const TURNS = 1

export interface Deps {
  /** Null when no CLI was found: the page then plays what it has and invents nothing. */
  claude: Claude | null
  whisper: Whisper
  store: Store
  /** The whole clips heard, kept for measuring hearing (voice.ts). */
  voice: VoiceStore
  models: Status['models']
  log: (message: string) => void
}

/** Which interpreter prompt this is: a phrase another prompt made is understood afresh (store.ts). */
export const promptStamp = (): string => createHash('sha256').update(INTERPRET_SYSTEM).update(JSON.stringify(PLAN_SCHEMA)).digest('hex').slice(0, 12)

/** The real things, found from the environment and the home folder: called on the first request, never at import. */
export function depsFromEnv(root: string, log: (message: string) => void): Deps {
  const home = os.homedir()
  const bin = findClaude(process.env, home)
  log(bin ? `Claude: ${bin}` : 'Claude: no CLI found, so nothing new can be made (set CLAUDE_BIN)')
  const library = process.env.SILLY_LIBRARY ?? path.join(root, 'silly-billy', 'library')
  return {
    claude: bin ? new Claude(bin, log) : null,
    whisper: new Whisper(whisperSetup(process.env, home), log),
    store: new Store(library, log, promptStamp()),
    voice: new VoiceStore(path.join(library, 'voice'), VOICE_CAP),
    models: { interpret: process.env.SILLY_INTERPRET_MODEL ?? 'opus', invent: process.env.SILLY_INVENT_MODEL ?? 'opus' },
    log,
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The request body, refused past `limit` bytes (the rest is read and dropped, so the refusal still reaches the page). */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tooBig = () => {
      req.resume()
      reject(new HttpError(413, `the request is over ${limit} bytes`))
    }
    if (Number(req.headers['content-length'] ?? 0) > limit) return tooBig()
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      if (size > limit) return
      size += chunk.length
      if (size > limit) tooBig()
      else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req, 1_000_000)
  let data: unknown
  try {
    data = JSON.parse(body.toString('utf8'))
  } catch {
    throw new HttpError(400, 'the body is not JSON')
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new HttpError(400, 'the body is not a JSON object')
  return data as Record<string, unknown>
}

/** Throws a 400 naming the first field that is not what `check` wants. */
/** Ends when the response closes: the page stopped waiting (or the answer went out, when it no longer matters). */
function stopped(res: ServerResponse): AbortSignal {
  const ctl = new AbortController()
  if (res.destroyed) ctl.abort()
  else res.on('close', () => ctl.abort())
  return ctl.signal
}

function need(body: Record<string, unknown>, checks: Record<string, (v: unknown) => boolean>): void {
  for (const [key, check] of Object.entries(checks)) if (!check(body[key])) throw new HttpError(400, `bad or missing ${key}`)
}
const isText = (max: number) => (v: unknown) => typeof v === 'string' && v.trim() !== '' && v.length <= max
const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** The page's `mic` (voice/mic.ts's MicInfo, as JSON), kept with the clip as it came; null when it sent none, a 400 when it is not a JSON object. */
function micOf(text: string | null): MicInfo | null {
  if (text === null) return null
  let mic: unknown
  try {
    mic = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'mic is not JSON')
  }
  if (!isObject(mic)) throw new HttpError(400, 'mic is not a JSON object')
  return mic as MicInfo
}

/** A store error from bad input is the page's (400); a file system error is ours (500). */
const asBadInput = (err: unknown) => ((err as NodeJS.ErrnoException).code ? err : new HttpError(400, (err as Error).message))

/**
 * Whether a browser sent this for a page of another site. CORS only hides the answer from that
 * page: a plain POST from it still runs here (start the CLI, save or forget library entries).
 * Browsers say where a request comes from in Origin and Sec-Fetch-Site; a request with neither
 * is not from a web page (the tests, curl). Over HTTP/2, which Vite serves https with, the
 * host is in :authority.
 */
export function fromElsewhere(headers: IncomingMessage['headers']): boolean {
  const site = headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return true
  const origin = headers.origin
  if (origin === undefined) return false
  const host = String(headers[':authority'] ?? headers.host ?? '').toLowerCase()
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

/** An id in kebab-case: from the id, or else from the name (Haiku now and then leaves the id empty); null when neither has a letter or a digit. */
function tidyId(id: unknown, name: unknown): string | null {
  for (const s of [id, name]) {
    try {
      return safeId(String(s ?? ''))
    } catch {
      // the next one
    }
  }
  return null
}

/** Words without the dashes no line for the child may have ('Wheee — slide!' → 'Wheee, slide!'); a kind's hyphens stay. */
const undashed = (s: string) => s.replace(/\s*[—–]\s*/g, ', ').replace(/^, |, $/g, '')

/** Words compared for what they say: case, spaces and punctuation aside. */
const said = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * The plan with every new thing's id in kebab-case wherever it is used, and avatar ids in
 * lowercase. A new action, thing or avatar with neither an id nor a name is left out: its
 * steps then name nothing the page knows, and the page drops them. A new action or thing with
 * no Finnish name takes its first Finnish call, a plan with no Finnish line its Finnish answer,
 * and the lines and args lose their dashes. An arg that is the plan's answer or line in the
 * other language is said in the game's (`lang`): played in Finnish, Eetu was made to say
 * 'Okay, I stop!', the English of the plan's 'Okei, lopetan!'.
 */
export function tidyPlan(plan: Plan, lang: Lang): Plan {
  const firstOfEach = <T extends { id: string }>(list: T[]) => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i)
  const lower = (calls: string[]) => [...new Set(calls.map((c) => c.toLowerCase().trim()).filter((c) => c !== ''))]
  /** Renamed actions are fixed in the steps' actions; renamed things and avatars in args and who. */
  const renamed = { action: new Map<string, string>(), thing: new Map<string, string>() }
  const tidied = <T extends { id: string; name: string; calls: string[] }>(x: T, as: 'action' | 'thing'): T[] => {
    const id = tidyId(x.id, x.name)
    if (id === null) return []
    renamed[as].set(x.id, id)
    return [{ ...x, id, calls: lower(x.calls) }]
  }
  const named = <T extends NewAction | NewItem>(x: T): T => ({ ...x, nameFi: finnishName(x) })
  const newActions = firstOfEach(plan.newActions.flatMap((a) => tidied(a, 'action'))).map(named)
  const scripts = firstOfEach(
    (plan.scripts ?? []).flatMap((sc) => {
      const id = tidyId(sc.id, sc.about)
      if (id === null) return []
      renamed.action.set(sc.id, id)
      return [{ id, about: undashed(String(sc.about ?? '')), code: typeof sc.code === 'string' ? sc.code : '' }]
    }),
  )
  const newItems = firstOfEach(plan.newItems.flatMap((i) => tidied(i, 'thing'))).map(named)
  const [create] = plan.create ? tidied(plan.create, 'thing') : []
  // A new thing's id as tidied, also where a step asks for a new one ('new:Water Slide' → 'new:water-slide').
  const fix = (v: string) => (isNewThing(v) ? `${NEW_THING}${renamed.thing.get(kindOfArg(v)) ?? kindOfArg(v)}` : (renamed.thing.get(v) ?? v))
  const actor = (id: string) => fix(id).toLowerCase()
  const heardFi = typeof plan.heardFi === 'string' && plan.heardFi.trim() !== '' ? plan.heardFi : plan.sayFi
  const lines: [string, string][] = [
    [plan.say, plan.sayFi],
    [plan.heard, heardFi],
  ]
  const translated = new Map(lines.map(([en, fi]): [string, string] => (lang === 'fi' ? [said(en), fi] : [said(fi), en])).filter(([other, own]) => other !== '' && other !== said(own)))
  const inGame = (v: string) => translated.get(said(v)) ?? v
  const rest = { ...plan }
  delete rest.scripts
  return {
    ...rest,
    heard: undashed(plan.heard),
    heardFi: undashed(heardFi),
    who: [...new Set(plan.who.map(actor))],
    steps: plan.steps.map((s) => ({ ...s, who: actor(s.who), action: renamed.action.get(s.action) ?? s.action, args: s.args.map((a) => ({ ...a, value: undashed(inGame(fix(a.value))) })) })),
    newActions,
    newItems,
    ...(create ? { create } : {}),
    ...(scripts.length > 0 ? { scripts } : {}),
    say: undashed(plan.say),
    sayFi: undashed(plan.sayFi),
  }
}

/** How many new things tidyPlan leaves out of a plan: those with neither an id nor a name (one named twice is no loss). */
const unnamed = (plan: Plan) => [...plan.newActions, ...plan.newItems, ...(plan.create ? [plan.create] : [])].filter((x) => tidyId(x.id, x.name) === null).length

/**
 * What the game's context (brain/context.ts) names: each action's params ('wear(thing: text,
 * color?: text): ...'); every item kind and actor id, which are known; the scene, words that
 * mean the room or an avatar rather than a kind: the rooms with their Finnish names, the room's
 * water, and each avatar's name and body ('- mirri Mirri cat she': the cat is Mirri); and the
 * room's water, the words for it ('pond', 'water', 'lake') with the spot in its middle.
 */
export function contextNames(context: string): {
  params: Map<string, Array<{ name: string; kind: string }>>
  known: Set<string>
  scene: Set<string>
  water: Map<string, string>
} {
  const params = new Map<string, Array<{ name: string; kind: string }>>()
  const known = new Set<string>()
  const scene = new Set<string>()
  const water = new Map<string, string>()
  for (const line of context.split('\n')) {
    const action = /^([a-z][a-z0-9-]*)\(([^)]*)\):/.exec(line)
    if (action !== null) {
      const list = action[2]!.split(',').flatMap((p) => {
        const m = /^\s*([A-Za-z0-9_-]+)\??\s*:\s*([a-z]+)\s*$/.exec(p)
        return m === null ? [] : [{ name: m[1]!, kind: m[2]! }]
      })
      params.set(action[1]!, list)
      continue
    }
    // 'Item kinds: ball (pallo), slide (liukumäki).': the kind, then its Finnish name in a game played in Finnish.
    const kinds = /^Item kinds: (.*?)\.?$/.exec(line)
    if (kinds !== null) for (const k of kinds[1]!.split(',')) known.add(k.trim().split(' ')[0]!)
    // '- steve Steve kid he; wears cap': the id, then the name (a renamed avatar's own) and the body.
    const actor = /^- ([a-z0-9-]+) /.exec(line)
    if (actor !== null) known.add(actor[1]!)
    const who = /^- [a-z0-9-]+ (.+?) ([a-z]+) [a-z]+(?:;|$)/.exec(line)
    if (who !== null) scene.add(slugOf(who[1]!)).add(who[2]!)
    // 'Room: pool. Rooms: playground (leikkipuisto), pool (uimahalli), forest (metsä).'
    const rooms = /^Room: .*?Rooms: (.*?)\.?$/.exec(line)
    if (rooms !== null) for (const word of rooms[1]!.split(/[\s,()]+/)) if (word !== '') scene.add(word.toLowerCase())
    // 'Water: the pond, round, its middle at 6.5,-6.5, ...' or 'Water: the pool, from -5.5,-6 to 5.5,1, ...'.
    const n = '(-?\\d+(?:\\.\\d+)?)'
    const pool = new RegExp(`^Water: the ([a-z]+), (?:round, its middle at ${n},${n}|from ${n},${n} to ${n},${n})`).exec(line)
    if (pool !== null) {
      const [, name, x, z, x0, z0, x1, z1] = pool
      const spot = x !== undefined ? `${x},${z}` : `${(Number(x0) + Number(x1)) / 2},${(Number(z0) + Number(z1)) / 2}`
      for (const word of [name!, 'water', 'lake']) water.set(word, spot)
      scene.add(name!)
    }
  }
  return { params, known, scene, water }
}

/** The built-in verbs whose text param is a kind they make at once (content/actions.ts: wear and make call w.make), where a kind nobody made is a purple mystery box. */
const MAKES_KIND: Readonly<Record<string, string>> = { wear: 'thing', make: 'thing' }

/**
 * The room's water is no thing: a step that goes to, throws into or swims in 'pond', 'water' or
 * 'lake' gets the spot in the middle of the room's water instead, and a new thing that is the
 * room's water is left out unless a step makes one (seen live: "heitä se lampeen" in the forest
 * made a new pond beside the forest's own). A place takes the spot; an item or a thing param
 * takes no spot yet, so the action does without (it throws, but not into a new pond).
 */
export function meetRoomWater(plan: Plan, context: string): Plan {
  const names = contextNames(context)
  if (names.water.size === 0) return plan
  // What a step makes: the kind a built-in wear or make is given, and any new one a step asks for ('new:pond').
  const made = new Set(
    plan.steps.flatMap((s) => [
      ...(MAKES_KIND[s.action] === undefined ? [] : s.args.filter((a) => a.name === MAKES_KIND[s.action]).map((a) => kindOfArg(a.value))),
      ...s.args.filter((a) => isNewThing(a.value)).map((a) => kindOfArg(a.value)),
    ]),
  )
  const where = (action: string, arg: string) => (plan.newActions.find((a) => a.id === action)?.params ?? names.params.get(action) ?? []).find((p) => p.name === arg)?.kind
  return {
    ...plan,
    steps: plan.steps.map((s) => ({
      ...s,
      args: s.args.map((a) => {
        // A script's args have no kinds: any of them may be the water.
        const kind = plan.scripts?.some((sc) => sc.id === s.action) ? 'thing' : where(s.action, a.name)
        const spot = names.water.get(a.value)
        return spot !== undefined && (kind === 'place' || kind === 'thing' || kind === 'item') && !made.has(a.value) ? { ...a, value: spot } : a
      }),
    })),
    newItems: plan.newItems.filter((i) => !names.water.has(i.id) || made.has(i.id)),
  }
}

/**
 * Words for what is in every room but is no thing (the ground, the water, the sky) and for whoever
 * is no avatar and no one thing (the child, everyone, it): a step that sits on, looks at or paints
 * one of them names no new thing. A word to wear or make is a thing even so.
 */
const NO_THING = new Set([
  'ground', 'floor', 'grass', 'water', 'pond', 'lake', 'sea', 'sky', 'sun', 'moon', 'cloud', 'clouds', 'air', 'here', 'there',
  'me', 'myself', 'you', 'yourself', 'it', 'itself', 'he', 'him', 'himself', 'she', 'her', 'herself', 'they', 'them', 'themselves', 'us',
  'child', 'kid', 'everyone', 'everybody', 'all', 'everything', 'something', 'nothing',
])

/**
 * New things the interpreter used in a step's args but forgot to list (seen live: ride's target
 * 'christmas-tree' with no christmas-tree in newItems, about one plan in five; and a built-in
 * verb's too: 'anna Nooralle taikasauva' as wear magic-wand with no magic wand anywhere, which
 * played and was saved as a purple mystery box). Looked at: an item or thing arg of a new action
 * or of an action the context lists, unless it is a word of the scene or in NO_THING; and the
 * kind a built-in wear or make is given as text, unless it is a slot ('hair', 'head'). Such an arg
 * is known when the context names that kind or actor; a lost one is listed with a plain spec, so
 * the designer still makes it from its name, and gives its Finnish name too (its spec has only
 * the English one, prompts.ts's lacksFinnishName).
 */
export function listLostKinds(plan: Plan, context: string): Plan {
  const names = contextNames(context)
  const listed = new Set([...plan.newItems.map((i) => i.id), ...(plan.create ? [plan.create.id] : [])])
  const lost = new Set<string>()
  // A kind a script makes ("tee puumajaan tikkaat": w.make('ladder')) is one too.
  for (const sc of plan.scripts ?? []) for (const m of sc.code.matchAll(/w\.make\(\s*['"`]([a-z][a-z0-9-]*)['"`]/g)) if (!listed.has(m[1]!) && !names.known.has(m[1]!)) lost.add(m[1]!)
  for (const step of plan.steps) {
    const params = plan.newActions.find((a) => a.id === step.action)?.params ?? names.params.get(step.action) ?? []
    for (const arg of step.args) {
      const value = kindOfArg(arg.value)
      if (!/^[a-z][a-z0-9-]*$/.test(value) || listed.has(value) || names.known.has(value)) continue
      const kind = params.find((p) => p.name === arg.name)?.kind
      const made = kind === 'text' && MAKES_KIND[step.action] === arg.name && !SLOTS.includes(value as Slot)
      const named = (kind === 'item' || kind === 'thing') && !names.scene.has(value) && !NO_THING.has(value)
      if (made || named) lost.add(value)
    }
  }
  const spec = (id: string): NewItem => {
    const name = id.replace(/-/g, ' ')
    return { id, name, nameFi: name, calls: [id], about: `A ${name}, the way a six-year-old pictures it: its usual shape and colours, at its real size.`, rough: [], meta: {} }
  }
  return lost.size === 0 ? plan : { ...plan, newItems: [...plan.newItems, ...[...lost].map(spec)] }
}

/**
 * A script's code as the guard lets it through, for the page to run (it never runs here); code
 * the guard refuses keeps its reason, and the page has the designer fix it with the whole scene.
 */
export function guardScripts(plan: Plan): Plan {
  if (plan.scripts === undefined) return plan
  const unfence = (code: string) => code.replace(/^\s*```[a-z]*\n|\n?```\s*$/g, '')
  return {
    ...plan,
    scripts: plan.scripts.map((sc) => {
      const code = unfence(sc.code)
      if (code.trim() === '') return { ...sc, code: '', guarded: null }
      const g = guard('action', code)
      return g.ok ? { ...sc, code, guarded: g.guarded } : { ...sc, code, guarded: null, refused: g.error }
    }),
  }
}

/**
 * Whether the interpreter wrote its tool call's own markup into a string, as Haiku now and then
 * does ('Make a new girl</heard>\n<parameter name="create">{...}'): the fields after it are lost.
 */
export const leakedMarkup = (plan: Plan) => /<\/?parameter\b|<\/[a-zA-Z]+>/.test(JSON.stringify(plan))

type Made = { entry: ActionEntry | ItemEntry } | { error: string; code: string }

/**
 * The designer's answer as a library entry, its code guarded; or why it cannot be one, for the
 * designer to fix. A thing whose Finnish name nobody knew takes the designer's, which becomes
 * one of its calls too.
 */
function entryOf(req: InventRequest, design: ActionDesign | ItemDesign): Made {
  const unfence = (code: string) => code.replace(/^\s*```[a-z]*\n|\n?```\s*$/g, '')
  const code = unfence(design.code)
  if (code.trim() === '') return { error: 'the code is empty', code }
  const given = req.kind === 'item' && lacksFinnishName(req.spec) && 'nameFi' in design && typeof design.nameFi === 'string' ? design.nameFi.trim() : ''
  const nameFi = given || finnishName(req.spec)
  const calls = given ? [...new Set([...req.spec.calls, given.toLowerCase()])] : req.spec.calls
  const base = { id: safeId(req.spec.id), name: req.spec.name, nameFi, calls, about: req.spec.about, by: 'opus' as const, asked: req.words, made: new Date().toISOString() }
  if (req.kind === 'action' || req.kind === 'script') {
    const g = guard('action', code)
    return g.ok ? { entry: { type: 'action', ...base, params: req.spec.params, code, guarded: g.guarded } } : { error: g.error, code }
  }
  const model = guard('model', code)
  if (!model.ok) return { error: model.error, code }
  const tickCode = 'tick' in design && design.tick?.trim() ? unfence(design.tick) : null
  const tick = tickCode === null ? null : guard('tick', tickCode)
  if (tick && !tick.ok) return { error: `in tick: ${tick.error}`, code: `${code}\n\n// tick:\n${tickCode}` }
  return {
    entry: { type: 'item', ...base, code, guarded: model.guarded, tick: tickCode, tickGuarded: tick ? tick.guarded : null, rough: req.spec.rough, roughMeta: req.spec.meta },
  }
}

/** The API under ./api/: one per dev server, made on its first request. */
export class Api {
  private interpreter: Pool | null = null

  constructor(private readonly deps: Deps) {}

  private needClaude(): Claude {
    if (!this.deps.claude) throw new HttpError(503, 'no Claude CLI on this computer')
    return this.deps.claude
  }

  private pool(): Pool {
    this.interpreter ??= new Pool(this.needClaude(), { model: this.deps.models.interpret, system: INTERPRET_SYSTEM, schema: PLAN_SCHEMA }, POOL, TURNS)
    return this.interpreter
  }

  /** Answers one request; never throws. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.replace(/\/+$/, '')
    const send = (status: number, body: unknown) => {
      if (res.destroyed) return // the page stopped waiting
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    const methods: Record<string, string> = { '/status': 'GET', '/library': 'GET POST', '/hear': 'POST', '/interpret': 'POST', '/invent': 'POST', '/forget': 'POST', '/log': 'POST' }
    try {
      if (fromElsewhere(req.headers)) throw new HttpError(403, 'only the game itself may ask this')
      if (!(route in methods)) throw new HttpError(404, `no ${route} here`)
      if (!methods[route]!.split(' ').includes(req.method ?? '')) throw new HttpError(405, `${route} takes ${methods[route]}`)
      if (route === '/status') return send(200, this.status())
      if (route === '/hear') return send(200, await this.hear(req, url))
      if (route === '/interpret') return send(200, await this.interpret(await readJson(req), stopped(res)))
      if (route === '/invent') return await this.invent(await readJson(req), res)
      if (route === '/library' && req.method === 'GET') return send(200, this.deps.store.read())
      if (route === '/library') return send(200, this.save(await readJson(req)))
      if (route === '/forget') return send(200, this.forget(await readJson(req)))
      const line = await readJson(req)
      need(line, { kind: isText(100) })
      this.deps.store.log(line as LogLine)
      return send(200, { ok: true })
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      const error = (err as Error).message
      if (status >= 500) this.deps.log(`${req.method} ${route} failed: ${error}`)
      if (!res.headersSent) send(status, { error })
      else res.end(`${JSON.stringify({ error } satisfies InventLine)}\n`)
    }
  }

  /** Starts Whisper and the interpreter's processes on the first call, so the first words do not wait for them. */
  status(): Status {
    this.deps.whisper.ensure()
    if (this.deps.claude) this.pool().start()
    return { claude: this.deps.claude !== null, whisper: this.deps.whisper.state, models: this.deps.models }
  }

  /**
   * The words in the clip, in the game's language, primed with the page's sentence (the names of
   * who is here) or the server's own for the language. The page asks only once a status said
   * Whisper is ready, but after the server's code reloaded the fresh Whisper is not up yet: it is
   * started and waited for rather than the words refused. Partial asks (the live words) are
   * neither logged nor kept. Words from a clip with no voiced sound in it are dropped (voiceless).
   * A whole clip is kept in the voice folder with what came with it (the page's `mic`, the
   * User-Agent), how it sounds and what Whisper made of it, and its log line names it; a line
   * Whisper wrote otherwise than the words that went on logs what it wrote too.
   */
  private async hear(req: IncomingMessage, url: URL): Promise<HearReply> {
    const { whisper } = this.deps
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fi'
    const partial = url.searchParams.get('partial') === '1'
    const prime = (url.searchParams.get('prime') ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) || defaultPrime(lang)
    const mic = micOf(url.searchParams.get('mic'))
    const wav = await readBody(req, 20_000_000)
    if (!(await whisper.ready(HEAR_WAITS_FOR_WHISPER))) throw new HttpError(503, `whisper is ${whisper.state}`)
    const asking = whisper.transcribe(wav, lang, prime)
    // How the clip sounds: about 10 ms for 3 s of sound, while the request is on its way.
    const sound = listen(wav)
    const heard = await asking
    // Words from a clip with no voice in it were invented on silence or noise ('Kiitos!').
    const text = voiceless(sound) ? '' : heard.text
    const reply: HearReply = { text, ms: heard.ms }
    if (partial) return reply
    let clip: string | null = null
    try {
      const { raw, ms, noSpeech, logprob, extras } = heard
      clip = this.deps.voice.keep(wav, { at: new Date().toISOString(), lang, prime, raw, text, ms, recognizer: { model: whisper.model, extras }, noSpeech, logprob, userAgent: String(req.headers['user-agent'] ?? ''), mic, sound })
    } catch (err) {
      this.deps.log(`could not keep the clip: ${(err as Error).message}`)
    }
    this.deps.store.log({ kind: 'hear', lang, bytes: wav.length, text, ms: heard.ms, ...(heard.raw !== text ? { raw: heard.raw } : {}), clip })
    this.deps.log(`heard in ${seconds(heard.ms)}: ${JSON.stringify(text)}`)
    return reply
  }

  /** `signal` ends when the page stops waiting (it gives up after 45 s): the CLI turn then stops too, so no answer nobody reads keeps a process busy. */
  private async interpret(body: Record<string, unknown>, signal: AbortSignal | null = null): Promise<InterpretReply> {
    need(body, { words: isText(500), lang: (v) => v === 'fi' || v === 'en', context: isText(200_000) })
    const req = body as unknown as InterpretRequest
    const t0 = Date.now()
    const ask = async () => (await this.pool().ask(interpretMessage(req), { timeoutMs: INTERPRET_TIMEOUT, onText: null, signal })).data as Plan
    /** The answer tidied, or null when it is broken: markup in its strings, or a shape tidying cannot read. */
    const tidy = (answer: Plan): Plan | null => {
      if (leakedMarkup(answer)) return null
      try {
        return tidyPlan(answer, req.lang)
      } catch {
        return null
      }
    }
    let answer = await ask()
    let tidied = tidy(answer)
    if (tidied === null) {
      // The broken turn must not stay in a session's history: start them afresh and ask once more.
      this.deps.log(`the interpreter's plan for ${JSON.stringify(req.words)} came in pieces: asking again`)
      this.deps.store.log({ kind: 'interpret-broken', words: req.words, plan: answer })
      this.interpreter!.close()
      answer = await ask()
      tidied = tidy(answer)
      if (tidied === null) {
        this.deps.store.log({ kind: 'interpret-broken', words: req.words, plan: answer })
        throw new HttpError(502, 'the interpreter answered in pieces twice')
      }
    }
    // A new thing left out (no id and no name) still plays the rest; the answer goes in the log, as it was.
    const left = unnamed(answer)
    if (left > 0) this.deps.store.log({ kind: 'interpret-broken', words: req.words, plan: answer, left })
    const plan = guardScripts(listLostKinds(meetRoomWater(tidied, req.context), req.context))
    const ms = Date.now() - t0
    this.deps.store.log({ kind: 'interpret', words: req.words, lang: req.lang, plan, ms })
    const made = [...plan.newActions.map((a) => `action ${a.id}`), ...plan.newItems.map((i) => `item ${i.id}`), ...(plan.create ? [`avatar ${plan.create.id}`] : [])]
    this.deps.log(`understood in ${seconds(ms)}: ${JSON.stringify(req.words)} → ${plan.heard}${made.length ? ` (new: ${made.join(', ')})` : ''}`)
    return { plan, ms }
  }

  /**
   * Streams progress while the designer writes, then the entry (its code guarded) or the error.
   * A syntax error goes straight back to the designer for one more try.
   */
  private async invent(body: Record<string, unknown>, res: ServerResponse): Promise<void> {
    const kind = body.kind
    need(body, { kind: (v) => v === 'action' || v === 'item' || v === 'script', spec: isObject, words: isText(500), context: isText(200_000) })
    const spec = body.spec as Record<string, unknown>
    need(spec, { id: isText(80), name: isText(80), nameFi: (v) => v === undefined || typeof v === 'string', about: isText(4000), calls: Array.isArray, ...(kind === 'item' ? { rough: Array.isArray, meta: isObject } : { params: Array.isArray }) })
    if (body.fix !== undefined) need(body.fix as Record<string, unknown>, { code: (v) => typeof v === 'string', error: isText(4000) })
    const req = body as unknown as InventRequest
    const claude = this.needClaude()
    const designer: Spec =
      req.kind === 'item'
        ? { model: this.deps.models.invent, system: ITEM_SYSTEM, schema: ITEM_SCHEMA }
        : { model: this.deps.models.invent, system: ACTION_SYSTEM, schema: ACTION_SCHEMA }

    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' })
    const line = (l: InventLine) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(l)}\n`)
    }
    const signal = stopped(res)
    // The fill follows the reply's length, nearing 1 as the code reaches its usual size; a second try carries on from the first.
    const usual = req.kind === 'item' ? 1300 : 900
    let before = 0
    let shown = 0
    let written = 0
    const onText = (text: string) => {
      written = text.length
      const p = Math.floor((1 - Math.exp(-(before + written) / usual)) * 100) / 100
      if (p >= shown + 0.02) line({ progress: (shown = p) })
    }

    const t0 = Date.now()
    let ask = req
    for (let tries = 1; ; tries++) {
      const { data } = await once(claude, designer, inventMessage(ask), { timeoutMs: INVENT_TIMEOUT, onText, signal })
      const made = entryOf(req, data as ActionDesign | ItemDesign)
      const ms = Date.now() - t0
      const what = `${req.kind} ${req.spec.id}${req.fix ? ' (a fix)' : ''}`
      if ('entry' in made) {
        line({ done: made.entry, ms })
        this.deps.store.log({ kind: 'invent', what: req.kind, id: made.entry.id, words: req.words, fix: req.fix ?? null, tries, ms, code: made.entry.code })
        this.deps.log(`made ${what} in ${seconds(ms)}${tries > 1 ? ` after ${tries} tries` : ''}`)
        break
      }
      if (tries === 2) {
        line({ error: made.error })
        this.deps.store.log({ kind: 'invent', what: req.kind, id: req.spec.id, words: req.words, fix: req.fix ?? null, tries, ms, error: made.error, code: made.code })
        this.deps.log(`could not make ${what} in ${seconds(ms)}: ${made.error}`)
        break
      }
      ask = { ...req, fix: made }
      before += written
    }
    res.end()
  }

  private save(body: Record<string, unknown>): { ok: true } {
    if (!isObject(body.entry) && !isObject(body.phrase)) throw new HttpError(400, 'bad or missing entry or phrase')
    try {
      this.deps.store.save(body as unknown as SaveRequest)
    } catch (err) {
      throw asBadInput(err)
    }
    return { ok: true }
  }

  private forget(body: Record<string, unknown>): { ok: true; existed: boolean } {
    need(body, { type: (v) => v === 'item' || v === 'action' || v === 'avatar', id: isText(80) })
    try {
      return { ok: true, existed: this.deps.store.forget(body as unknown as ForgetRequest) }
    } catch (err) {
      throw asBadInput(err)
    }
  }

  close(): void {
    this.interpreter?.close()
    this.deps.claude?.close()
    this.deps.whisper.close()
  }
}
