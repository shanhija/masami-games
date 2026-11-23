/**
 * Magic House's ./api/ on the dev server (protocol.ts Routes), served by the loader every game with
 * a server shares (gameApi in silly-billy/src/server/plugin.ts), which loads this module on the
 * first request, so nothing here runs when vite.config.ts is loaded or this module is imported.
 * The dev server asks and keeps; the page plays and proves (plan.md, Where things run): this asks
 * Opus through the Claude Code CLI for rooms, their looks and their presents (prompts.ts), holds the line of rooms
 * (line.ts), keeps the library on disk (store.ts) and logs every request, trial and play, and it
 * never runs made code: it guards it as text. Every failure is a JSON { error } with its status,
 * never a crash of the dev server. What changes is told to every open page (protocol.ts Told).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { findClaude, type Effort } from '../../../silly-billy/src/server/claude'
import { fromElsewhere } from '../../../silly-billy/src/server/api'
import type { Level } from '../engine/api'
import type { LookBuilt } from '../engine/look'
import type { RoomEnd, StepsDone } from '../saves'
import { PLAYED_MOST, type ApiError, type BotSecs, type GiftsReport, type LookReport, type PlayedBefore, type PlayLog, type RoomRequest, type Route, type Routes, type Status, type Told, type TrialReport } from '../protocol'
import { badRoll } from '../roll'
import type { DeviceKind, PartySize } from '../seats/types'
import { HttpError, isName, isObject, isText, readJson } from './http'
import { RoomLine, TIMING, type Timing } from './line'
import { takeLock } from './lock'
import { MeteredClaude } from './metered'
import { Store } from './store'

/** How hard Opus thinks over a room or a present: low to start, as both earlier games run it (plan.md, How Opus is asked). */
const EFFORT: Effort = 'low'

export interface Deps {
  /** Null when no CLI was found. */
  claude: MeteredClaude | null
  /** The model rooms and presents are asked of: MAGIC_MODEL, else opus. */
  model: string
  /** The library on disk: MAGIC_LIBRARY, else magic-house/library under the repo's root. */
  library: string
  log: (message: string) => void
  /** Tells every page open on the dev server something (Vite's websocket). */
  tell: (event: string, data: unknown) => void
  timing: Timing
}

/** The real things, found from the environment and the home folder (CLAUDE_BIN first): called on the first request, never at import. */
export function depsFromEnv(root: string, log: (message: string) => void, tell: (event: string, data: unknown) => void): Deps {
  const bin = findClaude(process.env, os.homedir())
  log(bin === null ? 'Claude: no CLI found, so no new room can be asked for (set CLAUDE_BIN)' : `Claude: ${bin}`)
  return {
    claude: bin === null ? null : new MeteredClaude(bin, log),
    model: process.env.MAGIC_MODEL ?? 'opus',
    library: process.env.MAGIC_LIBRARY ?? path.join(root, 'magic-house', 'library'),
    log,
    tell,
    timing: TIMING,
  }
}

// ------------------------------------------------------------------------------ what the page sends, checked

const PARTIES: readonly PartySize[] = [1, 2, 3, 4]
const LEVELS: readonly Level[] = [1, 2, 3]
const DEVICES: readonly DeviceKind[] = ['keys', 'touch', 'gamepad']

const bad = (what: string): never => {
  throw new HttpError(400, `bad or missing ${what}`)
}
const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
/** A room's steps done of how many, as a request or a play log says them; `what` names it in the refusal. */
function stepsDone(v: unknown, what: string): StepsDone {
  if (!isObject(v) || !count(v.done) || !count(v.of) || !Number.isInteger(v.done) || !Number.isInteger(v.of) || v.done > v.of) return bad(`${what}: whole steps done, of how many`)
  return { done: v.done, of: v.of }
}
const levelSecs = (v: unknown): v is BotSecs => isObject(v) && LEVELS.every((l) => count(v[l]))
const oneOf = <T>(values: readonly T[], v: unknown): v is T => values.includes(v as T)
const attempt = (v: unknown): v is 1 | 2 | 3 => oneOf([1, 2, 3], v)
const ENDS: readonly RoomEnd[] = ['finished', 'left']

function roomRequest(b: Record<string, unknown>): RoomRequest {
  const party = oneOf(PARTIES, b.party) ? b.party : bad('party: 1 to 4')
  const roll = isObject(b.roll) ? b.roll : bad('roll')
  // Every room has one size (engine/api.ts ROOM): a roll is its kind and its view, and a page that still sends a size is refused.
  if (Object.keys(roll).some((k) => k !== 'kind' && k !== 'view')) bad('roll: { kind, view } only, since every room has one size')
  const said = badRoll(party, { kind: roll.kind, view: roll.view } as RoomRequest['roll'])
  if (said !== null) throw new HttpError(400, `the roll: ${said}`)
  const level = oneOf(LEVELS, b.level) ? b.level : bad('level: 1, 2 or 3')
  const devices = Array.isArray(b.devices) && b.devices.length === party && b.devices.every((d) => oneOf(DEVICES, d)) ? (b.devices as DeviceKind[]) : bad('devices: one device kind for each player')
  const played = Array.isArray(b.played) ? b.played.slice(0, PLAYED_MOST) : bad('played')
  return {
    party,
    roll: { kind: roll.kind, view: roll.view } as RoomRequest['roll'],
    level,
    devices,
    played: played.map((p, i): PlayedBefore => {
      if (!isObject(p) || !isName(p.name) || ![p.botSecs, p.secs, p.restarts, p.hints, p.up, p.down].every(count) || !oneOf(ENDS, p.end)) return bad(`played[${i}]`)
      return { name: { en: p.name.en, fi: p.name.fi }, botSecs: p.botSecs as number, secs: p.secs as number, restarts: p.restarts as number, hints: p.hints as number, end: p.end, steps: stepsDone(p.steps, `played[${i}].steps`), up: p.up as number, down: p.down as number }
    }),
  }
}

function trialReport(b: Record<string, unknown>): TrialReport {
  if (!isText(b.line) || !attempt(b.attempt) || typeof b.passed !== 'boolean' || !Array.isArray(b.sentences) || !b.sentences.every(isText) || !isText(b.survey) || !count(b.ms)) return bad('line, attempt, passed, sentences, survey or ms')
  const passed = b.passed
  if (passed && !(levelSecs(b.botSecs) && levelSecs(b.waitSecs) && b.sentences.length === 0)) return bad("botSecs and waitSecs at every level, and no sentences, on a pass")
  if (!passed && !(b.botSecs === null && b.waitSecs === null && b.sentences.length > 0)) return bad('sentences, with botSecs and waitSecs null, on a failure')
  return { line: b.line, attempt: b.attempt, passed, sentences: b.sentences as string[], survey: b.survey, botSecs: passed ? (b.botSecs as BotSecs) : null, waitSecs: passed ? (b.waitSecs as BotSecs) : null, ms: b.ms }
}

/** Every count a look's check reports, so the compiler holds the check below to LookBuilt's counts. */
const LOOK_COUNTS = { pieces: true, props: true, answering: true, quarters: true, lights: true, lamps: true, leftOut: true, of: true } as const satisfies Record<keyof LookBuilt['counts'], true>
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText)

function lookReport(b: Record<string, unknown>): LookReport {
  const counts = b.counts
  if (!isText(b.line) || !oneOf<LookReport['attempt']>([1, 2], b.attempt) || !count(b.check) || typeof b.passed !== 'boolean' || typeof b.roomUnbuilt !== 'boolean' || !texts(b.sentences) || !texts(b.notes) || !isObject(counts) || !Object.keys(LOOK_COUNTS).every((k) => count(counts[k])) || !count(b.ms)) return bad('line, attempt, check, passed, roomUnbuilt, sentences, notes, counts or ms')
  if (b.passed !== (b.sentences.length === 0)) return bad('sentences: none on a pass, at least one on a failure')
  if (b.passed && b.roomUnbuilt) return bad('roomUnbuilt: a pass is checked on a room that built')
  return { line: b.line, attempt: b.attempt, check: b.check, passed: b.passed, roomUnbuilt: b.roomUnbuilt, sentences: b.sentences, notes: b.notes, counts: Object.fromEntries(Object.keys(LOOK_COUNTS).map((k) => [k, counts[k]])) as LookReport['counts'], ms: b.ms }
}

function giftsReport(b: Record<string, unknown>): GiftsReport {
  if (!isText(b.room) || !Array.isArray(b.checks)) return bad('room or checks')
  const checks = b.checks.map((c, i) => (isObject(c) && typeof c.passed === 'boolean' && Array.isArray(c.sentences) && c.sentences.every(isText) ? { passed: c.passed, sentences: c.sentences as string[] } : bad(`checks[${i}]`)))
  return { room: b.room, checks }
}

function playLog(b: Record<string, unknown>): PlayLog {
  if (!oneOf(PARTIES, b.party) || !isText(b.room) || !isText(b.at) || !oneOf(LEVELS, b.level) || ![b.secs, b.restarts, b.hints].every(count) || !oneOf(ENDS, b.end)) return bad('party, room, at, level, secs, restarts, hints or end')
  if (!Array.isArray(b.thumbs) || b.thumbs.length !== b.party || !b.thumbs.every((t) => oneOf(['up', 'down', null], t))) return bad('thumbs: one for each player, up, down or null')
  return { party: b.party, room: b.room, at: b.at, level: b.level, secs: b.secs as number, restarts: b.restarts as number, hints: b.hints as number, end: b.end, steps: stepsDone(b.steps, 'steps'), thumbs: b.thumbs as PlayLog['thumbs'] }
}

// ------------------------------------------------------------------------------ the API

/**
 * The API under ./api/: one per dev server, made on its first request, and again whenever the
 * server's code changes (the line takes up where the last one left it). Only the API that holds the
 * library's lock (lock.ts) has the line; another dev server on the same library reads the library
 * and refuses the line's routes with the lock's sentence.
 */
export class Api {
  private readonly store: Store
  /** The line of rooms, or why this API has none: another dev server holds the library. */
  private readonly line: RoomLine | string
  private readonly release: () => void

  constructor(private readonly deps: Deps) {
    this.store = new Store(deps.library, deps.log)
    const lock = takeLock(deps.library)
    if (lock.held) {
      this.release = lock.release
      this.line = new RoomLine({
        claude: deps.claude,
        model: deps.model,
        effort: EFFORT,
        store: this.store,
        log: deps.log,
        tell: <E extends keyof Told>(event: E, data: Told[E]) => deps.tell(event, data),
        timing: deps.timing,
      })
    } else {
      this.release = () => {}
      this.line = lock.by
      deps.log(`Magic House: ${lock.by}`)
    }
  }

  /** The line, or a 409 with why this server has none. */
  private theLine(): RoomLine {
    if (typeof this.line === 'string') throw new HttpError(409, this.line)
    return this.line
  }

  /** Answers one request; never throws. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '')
    const send = <R extends Route>(status: number, body: Routes[R]['reply'] | ApiError) => {
      if (res.destroyed) return // the page stopped waiting
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    const at = `${req.method} ${route === '' ? '/' : route}`
    const found = <T>(what: string, id: string, t: T | null): T => t ?? (() => { throw new HttpError(404, `no ${what} ${id} in the library`) })()
    try {
      if (fromElsewhere(req.headers)) throw new HttpError(403, 'only the game itself may ask this')
      const id = /^\/(rooms|gifts)\/([^/]+)$/.exec(route)
      if (at === 'GET /status') return send<'GET /status'>(200, this.status())
      if (at === 'GET /library') return send<'GET /library'>(200, this.store.index())
      if (req.method === 'GET' && id?.[1] === 'rooms') return send<'GET /rooms/:id'>(200, found('room', id[2]!, this.store.room(decodeURIComponent(id[2]!))))
      if (req.method === 'GET' && id?.[1] === 'gifts') return send<'GET /gifts/:id'>(200, found('present', id[2]!, this.store.gift(decodeURIComponent(id[2]!))))
      if (at === 'GET /line') return send<'GET /line'>(200, this.theLine().view())
      if (at === 'POST /rooms') return send<'POST /rooms'>(200, this.theLine().ask(roomRequest(await readJson(req))))
      if (at === 'GET /trial') return send<'GET /trial'>(200, this.theLine().takeTrial())
      if (at === 'POST /trial') return send<'POST /trial'>(200, this.theLine().report(trialReport(await readJson(req))))
      if (at === 'GET /look-trial') return send<'GET /look-trial'>(200, this.theLine().takeLook())
      if (at === 'POST /look-trial') return send<'POST /look-trial'>(200, this.theLine().lookReport(lookReport(await readJson(req))))
      if (at === 'GET /gift-trial') return send<'GET /gift-trial'>(200, this.theLine().takeGifts())
      if (at === 'POST /gift-trial') return send<'POST /gift-trial'>(200, this.theLine().giftsReport(giftsReport(await readJson(req))))
      if (at === 'POST /play') {
        // For the log only: the party's numbers, never who they are.
        this.store.log({ event: 'play', ...playLog(await readJson(req)) })
        return send<'POST /play'>(200, { ok: true })
      }
      throw new HttpError(404, `no ${at} here`)
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      const error = (err as Error).message
      if (status >= 500) this.deps.log(`${at} failed: ${error}`)
      send(status, { error })
    }
  }

  /** claude is true only where new rooms can be asked for: a CLI was found and this server holds the library. */
  status(): Status {
    return { claude: this.deps.claude !== null && typeof this.line !== 'string', model: this.deps.model, effort: EFFORT }
  }

  /** Stops what the API started: the CLI's processes and their folder, and lets the library's lock go. The line stays on disk for the next API. */
  close(): void {
    if (typeof this.line !== 'string') this.line.close()
    this.release()
    this.deps.claude?.close()
  }
}
