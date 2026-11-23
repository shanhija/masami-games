/**
 * Magic House's line of rooms on the dev server (plan.md, One room ahead): every room asked for, from
 * its request to kept or dropped, its look beside it (step 7a), and its presents after it is kept.
 *
 *   asked ─▶ writing ─▶ trial ─▶ kept ─▶ presents asked ─▶ presents checked ─▶ kept presents
 *                        │  ▲      ▲
 *                 failed ▼  │      │ (the look added to the room's file when it is ready)
 *                        fixing    │      (after the third try: dropped, and its look with it)
 *   first trial report             │
 *   with a survey ─▶ look writing ─▶ check ─▶ ready ─(room kept)─▶ kept
 *                                     │  ▲      │ a game fix that changes the room: checked again
 *                              failed ▼  │      ▼
 *                                   look fixing ─(second failure)─▶ gave up: kept without a look
 *
 * Three tries in all, as Dissertation's arenas get: the first answer and two fixes. A try fails when
 * the guard refuses its code or its name is too long (before any trial: a fix at once), or when its
 * trial fails (a page reports it). When the CLI gives no answer (an error, a hang past the timeout,
 * an answer not in the schema's shape) the same call is made again, at most CLI_AGAIN more times in
 * a try, and that spends no try: a CLI that is down for a moment does not cost a child a room that
 * could have been mended. A CLI that fails CLI_AGAIN + 1 times running drops the room.
 *
 * The look (step 7a, design "every room a room"): a second designer dresses the room the game built.
 * - It is asked on the first trial report that carries a survey, passed or failed, so it reads the
 *   room as built; a guard's refusal builds nothing and brings no survey, so the look waits for the
 *   fix's report. It is never asked twice: its fix follows a failed check.
 * - It has LOOK_TRIES: the look and one fix. Its guard's refusal fails a try as its check does. A CLI
 *   that gives no answer is asked again in the same try, at most CLI_AGAIN times, as for the room.
 *   A look that fails its last try, or whose CLI fails CLI_AGAIN + 1 times running, is given up, and
 *   the room is kept without it, still drawn in its shell. A room that passed is never dropped for its
 *   look; a room dropped drops its look, and a look's answer still on its way is logged and thrown away.
 * - A room is kept when its game passes, whatever its look is doing. A look ready by then goes into
 *   the file at once; one ready later is added to the file then (store.ts attachLook). The new door,
 *   for a party waiting at it, opens when the look is kept or given up, or LOOK_WAIT after the keep,
 *   whichever is first (LineRoom.lookWaitUntil, by the server's clock), and readySecs measures from
 *   asked to that moment.
 * - The look is checked against the room code as it stands: a game fix that changes the room code or
 *   the shell sends a look that is ready, or waiting for its check, back to a fresh check. A fix of the
 *   walkthrough alone leaves it as it is, since the check builds only the room and the look on it.
 *   Every check handed out has its number (LookJob.check), and only the report of the last one is
 *   taken: a check of the room code before the change, reported after it, is refused (409).
 * - A look check that fails because the room's own code did not build (LookReport.roomUnbuilt) is the
 *   room's failure, not the look's: the look keeps its try and waits for the game's fix to change the
 *   room's code or shell, then is checked again. A room kept passed its trial, so its look is checked
 *   once more then; a kept room whose code still does not build under the look gives its look up.
 *
 * Decisions, each with its reason:
 * - Opus is called at once for each piece of work, one CLI process an answer, with no pool and no
 *   queue. The line bounds them itself: one room in the making for each party size (a second ask for
 *   the same size gets that room, below), its look, and the presents of rooms just kept, so at most
 *   four rooms with their looks and a few presents at once, and Dissertation measured four Opus calls
 *   at once no slower than one. A room late because another party's room went first would cost a
 *   child the wait that matters most (plan.md, Getting a room ready in time comes first). A pool's
 *   warm process saves a second or two of a call that takes a minute, and Silly Billy keeps one only
 *   for its interpreter.
 * - A fix is a fresh call that carries the request, the answer as it stands, what every failed try
 *   failed with and the last survey (prompts.ts fixMessage), not a second turn of the first answer's
 *   session. The session would have to stay open for the minutes a room waits for a page to try it,
 *   and it dies with the API, which the plugin builds afresh whenever the server's code changes; and
 *   the system prompt, nearly all of the tokens, is the same for every room call, so the API's cache
 *   serves it to the fresh call. The fix pays again only for the request and the answer. The look's
 *   fix is a fresh call the same way, on the look's system prompt.
 * - A second POST /rooms for a party size that already has a room in the making (asked, being
 *   written, waiting for its trial, being fixed) gets that room back, whatever it rolled: one design
 *   is spent for each new room (a reload or a second tap spends none), and that room is the one this
 *   party will play next.
 * - The earlier rooms a request must be unlike are the library's and the line's that have an answer,
 *   dropped ones too: asked again after a drop, the same request got the same idea back, with the
 *   same weakness. On each ask the line logs a drift when DRIFT.least of the newest DRIFT.rooms share
 *   a theme's head word or have walls of a near hue: for whoever reads the log, never a rule told to
 *   the model (Dissertation saw answers drift toward what was listed).
 * - The line keeps what was written, never what the guard made of it: the code is guarded again
 *   whenever a page takes it and when it is kept, so a change to the guard reaches a room waiting in
 *   the line as the store's reading reaches kept files. Code the guard now refuses fails that try.
 * - A trial a page took and did not report soon after the page's worker would have been ended
 *   (timing.takenMs) waits again for any page; a late report of a try that is no longer waiting is
 *   refused (409), the first report wins. A look's check the same, by timing.lookTakenMs.
 * - With no CLI (deps.claude null) nothing is asked: a room that failed its trial waits in 'fixing',
 *   a look waits in 'writing' or 'fixing', and kept presents wait in 'asking'; the next API that has
 *   a CLI takes them up.
 * - Presents: a guard's refusal drops that present at once (no fix round: they are not needed until
 *   the room is finished, and a room left with none gives presents from other rooms); a CLI failure
 *   asks again once.
 * - Each ask is logged with its call (room, fix, look, lookFix, gifts) and a short hash of its system
 *   prompt, and each new system prompt is kept once under its hash (store.ts promptId), so a later
 *   reader can tell which reference a room was designed or mended against, and fit the calls' time.
 *
 * The line survives a restart of the API: every change is written to `line.jsonl` beside the log in
 * the library (git-ignored as *.jsonl), one room a line, and a new RoomLine takes it up: a call that
 * was under way is made again in the same try (a look's too), a trial or a look's check taken waits
 * again, presents asked are asked again, and a kept room no longer in the library (dropped from it
 * after an engine change) is dropped in the line too, with its look. Every entry carries LINE_VERSION;
 * one written for an older house is removed at load and logged. Finished rooms stay in it for
 * readySecs, the newest KEEP_FINISHED of them. Only the API that holds the library's lock (lock.ts)
 * has a line.
 */

import { randomInt, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseColor } from '../../../silly-billy/src/engine/kit'
import { once, type Effort } from '../../../silly-billy/src/server/claude'
import { WORDS_MAX, type RoomAnswer, type RoomFix } from '../engine/api'
import { words } from '../engine/checks'
import type { GiftAnswer } from '../engine/gift'
import type { LookAnswer, LookFix } from '../engine/look'
import type { BotSecs, GiftsJob, GiftsReport, GiftTry, LibraryIndex, Line, LineRoom, LookJob, LookReport, LookState, RoomFile, RoomRequest, RoomState, TrialJob, TrialReport, Told } from '../protocol'
import type { DeviceKind } from '../seats/types'
import { GIFTS_KILL_MS, LOOK_KILL_MS, TRIAL_KILL_MS, TRIAL_MISTAKES } from '../trial/api'
import { hueOf } from '../trial/giftCheck'
import { guardCode } from './codeKinds'
import { HttpError, isObject, isShell, isText, isWords } from './http'
import type { MeteredClaude, Usage } from './metered'
import {
  FIX_SCHEMA,
  fixMessage,
  GIFTS_SCHEMA,
  GIFTS_SYSTEM,
  giftsMessage,
  LOOK_FIX_SCHEMA,
  LOOK_SCHEMA,
  LOOK_SYSTEM,
  lookFixMessage,
  lookMessage,
  ROOM_SCHEMA,
  ROOM_SYSTEM,
  roomMessage,
  type Earlier,
  type Failure,
  type LookFailure,
  type Schema,
} from './prompts'
import type { Store } from './store'

/** How long each call and each taken job may take, in milliseconds. */
export interface Timing {
  /** A room's first answer: the ask by hand took 43 s, and Dissertation's arenas 180 s at the 95th percentile with retries. */
  readonly roomMs: number
  /** A fix answers only the part that changes. */
  readonly fixMs: number
  /** A room's look: it writes about 4,500 tokens, about 50 s (step 7a's fit of the log). */
  readonly lookMs: number
  /** A look's fix: the whole look again, with the check's sentences. */
  readonly lookFixMs: number
  readonly giftsMs: number
  /** A trial a page took, before it waits again for any page: a little past the page's own end of its worker (TRIAL_KILL_MS), so a page that went away (a reload, a tablet asleep) holds it no longer than it could have worked on it. */
  readonly takenMs: number
  /** The same for a look's check: a page job of about half a second, which the page ends at LOOK_KILL_MS. */
  readonly lookTakenMs: number
  /** The same for a presents' check (GIFTS_KILL_MS). */
  readonly giftsTakenMs: number
}

/** How far past the page's end of its worker a taken job waits, for the report on its way. */
const REPORT_MS = 10_000

export const TIMING: Timing = {
  roomMs: 8 * 60_000,
  fixMs: 6 * 60_000,
  lookMs: 6 * 60_000,
  lookFixMs: 3 * 60_000,
  giftsMs: 4 * 60_000,
  takenMs: TRIAL_KILL_MS + REPORT_MS,
  lookTakenMs: LOOK_KILL_MS + REPORT_MS,
  giftsTakenMs: GIFTS_KILL_MS + REPORT_MS,
}

/** The version of the line's entries this house writes: an entry without it was made for the house before step 7a (no shell, no look) and is removed at load. */
export const LINE_VERSION = 2
/** Tries of a room in all: the first answer and two fixes. */
export const TRIES = 3
/** Tries of a look in all: the look and one fix. */
export const LOOK_TRIES = 2
/** How long past its keep the new door waits for a room's look, ms, for a party waiting at it: the room opens without its look after this. */
export const LOOK_WAIT_MS = 60_000
/** Calls made again in one try when the CLI gave no answer, before the room is dropped (or its look given up). */
export const CLI_AGAIN = 2
/** Calls for a room's presents when the CLI gives no answer. */
export const GIFT_TRIES = 2
/** How many earlier rooms a request lists: the newest of the library and the line. */
export const EARLIER = 60
/** Finished rooms the line keeps, for readySecs and for the pages to see what became of them. */
export const KEEP_FINISHED = 20
/** readySecs until there are READY_LEAST kept rooms to measure (plan.md, A late room is waited for with quizzes: as in Dissertation). */
export const READY_SECS = 180
export const READY_LEAST = 5
/** The drift the log watches for: among the newest `rooms` earlier rooms, `least` that share a theme's head word, or whose walls' hues lie within `hueDegrees` of each other (walls greyer than `greyBelow` saturation have no hue to drift to). */
export const DRIFT = { rooms: 10, least: 3, hueDegrees: 20, greyBelow: 0.15 } as const

const LIVE: readonly RoomState[] = ['asked', 'writing', 'trial', 'fixing']
/** A look in one of these will change no more: the new door no longer waits for it. */
const SETTLED: readonly LookState[] = ['kept', 'gave up', 'dropped']

/** Where a kept room's presents are: those waiting for their check are kept as written (the guard runs again when a page takes them). */
type Gifts =
  | { readonly state: 'none' }
  | { readonly state: 'asking'; readonly tries: number }
  | { readonly state: 'trial'; readonly gifts: readonly GiftAnswer[]; readonly taken: number | null }
  | { readonly state: 'done' }

/** A room's look as the line keeps it. */
interface Look {
  state: LookState
  /** The look as it stands, its fix merged in; null until the first answer comes. */
  answer: LookAnswer | null
  /** What each failed try failed with, oldest first. */
  failures: LookFailure[]
  /** Which of its tries it is on: 1 for the look, 2 for its fix. */
  tries: LookJob['attempt']
  /** Calls made again in this try because the CLI gave no answer. */
  again: number
  /** When a page took its check (Date.now()), or null: null also when the room changed since it was taken, so that check's report is refused. */
  taken: number | null
  /** The number of the last check handed out (LookJob.check), 0 before the first: only its report is taken. */
  check: number
  /** Its last check found the room's own code did not build: it waits, keeping its try, until a game fix changes the room's code or shell. */
  waitsForRoom: boolean
}

/** One room in the line as the server keeps it: what the page sees (LineRoom) and what the next call needs. */
interface Entry {
  readonly v: typeof LINE_VERSION
  line: string
  state: RoomState
  readonly party: LineRoom['party']
  readonly roll: LineRoom['roll']
  readonly level: LineRoom['level']
  /** The devices they sit at, for the look's request. */
  readonly devices: readonly DeviceKind[]
  attempt: LineRoom['attempt']
  readonly asked: string
  readonly seed: number
  /** The request as first sent to Opus, kept for the fixes and for a call made again. */
  readonly message: string
  /** The answer as it stands, fixes merged in; null until the first answer comes. */
  answer: RoomAnswer | null
  /** What each failed try failed with, oldest first: what the next fix is asked from. */
  failures: Failure[]
  /** Calls made again in this try because the CLI gave no answer. */
  again: number
  /** When a page took its trial (Date.now()), or null. */
  taken: number | null
  /** The newest survey a trial report gave, '' until one: what the look is asked from. */
  survey: string
  look: Look
  kept: string | null
  /** When it was kept or dropped, ISO 8601. */
  finished: string | null
  /** Once kept, when the new door opens for it, ISO 8601: LOOK_WAIT_MS past the keep, or sooner when its look settles sooner. */
  opens: string | null
  dropped: string | null
  gifts: Gifts
}

export interface LineDeps {
  /** Null when no CLI was found: nothing can be asked, and a line left from before waits for one. */
  readonly claude: MeteredClaude | null
  readonly model: string
  readonly effort: Effort
  readonly store: Store
  /** The dev server's log. */
  readonly log: (message: string) => void
  readonly tell: <E extends keyof Told>(event: E, data: Told[E]) => void
  readonly timing: Timing
}

/** The data of an answer in the shape asked for, or a throw (the CLI checks the schema, but an answer given as JSON text is not checked). */
function shaped<T>(data: unknown, fields: Record<keyof T, (v: unknown) => boolean>, what: string): T {
  if (!isObject(data) || !Object.entries(fields).every(([key, ok]) => (ok as (v: unknown) => boolean)(data[key]))) throw new Error(`${what} is not in the shape asked for`)
  return data as T
}

const ROOM_FIELDS = { theme: isText, task: isText, name: isWords, shell: isShell, room: isText, walk: isText, wish: isText } satisfies Record<keyof RoomAnswer, (v: unknown) => boolean>
const FIX_FIELDS = { name: isWords, shell: isShell, room: isText, walk: isText } satisfies Record<keyof RoomFix, (v: unknown) => boolean>
const LOOK_FIELDS = { look: isText, wish: isText } satisfies Record<keyof LookAnswer, (v: unknown) => boolean>
const LOOK_FIX_FIELDS = { look: isText } satisfies Record<keyof LookFix, (v: unknown) => boolean>
const GIFT_FIELDS = { name: isWords, slot: isText, form: isText, code: isText } satisfies Record<keyof GiftAnswer, (v: unknown) => boolean>

/** A room's code and walkthrough as today's guard writes them, or the guard's sentences. */
function guardAnswer(a: RoomAnswer): { readonly ok: true; readonly room: string; readonly walk: string } | { readonly ok: false; readonly sentences: string[] } {
  const room = guardCode('room', a.room)
  const walk = guardCode('walk', a.walk)
  if (room.ok && walk.ok) return { ok: true, room: room.guarded, walk: walk.guarded }
  return { ok: false, sentences: [...(room.ok ? [] : [TRIAL_MISTAKES.notCompiled("the room's code", room.error)]), ...(walk.ok ? [] : [TRIAL_MISTAKES.notCompiled('the walkthrough', walk.error)])] }
}

/** The 95th percentile of some seconds, nearest rank, in whole seconds up. */
export function percentile95(secs: readonly number[]): number {
  const sorted = [...secs].sort((a, b) => a - b)
  return Math.ceil(sorted[Math.ceil(0.95 * sorted.length) - 1]!)
}

/** Words that end a theme's head phrase: the head word is the last word before the first of them ("a ship at sea": ship). */
const PHRASE_ENDS = new Set(['of', 'in', 'on', 'at', 'under', 'over', 'with', 'by', 'for', 'from', 'inside', 'behind', 'beside', 'near', 'and', 'to', 'into', 'where', 'that', 'through', 'above', 'below', 'among', 'round', 'around', 'between', 'without', 'full'])

/** A theme's head word, singular by a plain rule: what the room is a room of. Good enough for a log a person reads. */
export function headWord(theme: string): string {
  const all = theme.toLowerCase().match(/[a-z]+/g) ?? []
  const end = all.findIndex((w, i) => i > 0 && PHRASE_ENDS.has(w))
  const head = (end < 0 ? all : all.slice(0, end)).at(-1) ?? ''
  return head.length > 3 && head.endsWith('s') && !head.endsWith('ss') ? head.slice(0, -1) : head
}

/** What drifts among the newest earlier rooms (DRIFT), for the log: the head word DRIFT.least of them share, and the least hue of DRIFT.least walls within DRIFT.hueDegrees, each with the rooms' names; null for each that does not. */
export function drift(earlier: readonly Earlier[]): { readonly theme: { readonly word: string; readonly rooms: string[] } | null; readonly walls: { readonly hue: number; readonly rooms: string[] } | null } {
  const newest = earlier.slice(0, DRIFT.rooms)
  const byWord = new Map<string, string[]>()
  for (const e of newest) byWord.set(headWord(e.theme), [...(byWord.get(headWord(e.theme)) ?? []), e.name.en])
  const shared = [...byWord.entries()].find(([word, rooms]) => word !== '' && rooms.length >= DRIFT.least)
  const hues = newest.flatMap((e) => {
    // A colour the kit cannot read has no hue to drift to.
    const hex = parseColor(e.shell.walls.color)
    const h = hex === null ? null : hueOf(hex)
    return h === null || h.sat < DRIFT.greyBelow ? [] : [{ hue: h.hue, name: e.name.en }]
  })
  const near = hues.map((from) => ({ hue: from.hue, rooms: hues.filter((h) => (h.hue - from.hue + 360) % 360 <= DRIFT.hueDegrees).map((h) => h.name) })).find((w) => w.rooms.length >= DRIFT.least)
  return { theme: shared === undefined ? null : { word: shared[0], rooms: shared[1] }, walls: near === undefined ? null : { hue: Math.round(near.hue), rooms: near.rooms } }
}

export class RoomLine {
  private readonly entries: Entry[]
  private readonly file: string
  /** Set when the API closes: a call that ends after it (killed with the CLI's processes) changes nothing, and the next API takes the line up from its file. */
  private closed = false

  constructor(private readonly deps: LineDeps) {
    this.file = path.join(deps.store.dir, 'line.jsonl')
    const loaded = this.load()
    this.entries = loaded.filter((e) => e.v === LINE_VERSION)
    for (const old of loaded.filter((e) => e.v !== LINE_VERSION)) this.log({ event: 'made for the old house', line: old.line, state: old.state })
    const library = new Set(deps.store.index().rooms.map((r) => r.id))
    let changed = this.entries.length < loaded.length
    for (const e of this.entries) {
      e.taken = null
      e.look.taken = null
      if (e.gifts.state === 'trial') e.gifts = { ...e.gifts, taken: null }
      if (e.state === 'kept' && !library.has(e.kept!)) {
        // Dropped from the library since (it no longer passed after an engine change): no page waits for it, and its idea stays among the earlier rooms.
        e.state = 'dropped'
        e.dropped = 'it was kept, and has since left the library'
        e.gifts = { state: 'done' }
        if (!SETTLED.includes(e.look.state)) e.look.state = 'dropped'
        changed = true
        this.log({ event: 'left the library', line: e.line, room: e.kept })
      }
    }
    if (changed) this.save()
    if (deps.claude !== null) {
      for (const e of this.entries) {
        if (e.state === 'asked' || e.state === 'writing' || e.state === 'fixing') void this.write(e)
        if (e.look.state === 'writing' || e.look.state === 'fixing') void this.writeLook(e)
        if (e.gifts.state === 'asking') void this.askGifts(e)
      }
    }
  }

  private load(): Entry[] {
    if (!fs.existsSync(this.file)) return []
    const out: Entry[] = []
    for (const [i, text] of fs.readFileSync(this.file, 'utf8').split('\n').entries()) {
      if (text.trim() === '') continue
      try {
        out.push(JSON.parse(text) as Entry)
      } catch (err) {
        this.deps.log(`line: left out line ${i + 1} of ${this.file}: ${(err as Error).message}`)
      }
    }
    return out
  }

  /** Writes the line to its file and tells every open page. */
  private save(): void {
    this.deps.store.write(this.file, this.entries.map((e) => `${JSON.stringify(e)}\n`).join(''))
    this.deps.tell('magic-house:line', this.view())
  }

  private log(line: Readonly<Record<string, unknown>> & { readonly event: string }): void {
    this.deps.store.log(line)
  }

  close(): void {
    this.closed = true
  }

  // ---------------------------------------------------------------------------- what the pages see

  private roomOf(e: Entry): LineRoom {
    const waiting = e.state === 'kept' && !SETTLED.includes(e.look.state)
    return { line: e.line, state: e.state, party: e.party, roll: e.roll, level: e.level, attempt: e.attempt, asked: e.asked, name: e.answer?.name ?? null, kept: e.kept, dropped: e.dropped, look: e.look.state, lookWaitUntil: waiting ? e.opens : null }
  }

  /** The line, oldest first, the seconds a room nearly always takes from asked to its door opening, and the server's clock. */
  view(): Line {
    const now = Date.now()
    const secs = this.entries.filter((e) => e.state === 'kept' && Date.parse(e.opens!) <= now).map((e) => (Date.parse(e.opens!) - Date.parse(e.asked)) / 1000)
    return { rooms: this.entries.map((e) => this.roomOf(e)), readySecs: secs.length < READY_LEAST ? READY_SECS : percentile95(secs), now: new Date(now).toISOString() }
  }

  /** The earlier rooms a new one must be unlike: the newest EARLIER of the library and of the line's rooms in the making or dropped that have an answer, newest first. */
  private earlier(): Earlier[] {
    const kept = this.deps.store.index().rooms.map((r) => ({ name: r.name, theme: r.theme, task: r.task, shell: r.shell, when: r.made }))
    const line = this.entries.filter((e) => (LIVE.includes(e.state) || e.state === 'dropped') && e.answer !== null).map((e) => ({ name: e.answer!.name, theme: e.answer!.theme, task: e.answer!.task, shell: e.answer!.shell, when: e.asked }))
    return [...kept, ...line]
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, EARLIER)
      .map(({ name, theme, task, shell }) => ({ name, theme, task, shell }))
  }

  // ---------------------------------------------------------------------------- asking and writing

  /** POST /rooms: a new room in the line for this party, or the one already in the making for its size. */
  ask(req: RoomRequest): LineRoom {
    if (this.deps.claude === null) throw new HttpError(503, 'no Claude Code CLI was found on this server, so no new room can be asked for')
    const making = this.entries.find((e) => e.party === req.party && LIVE.includes(e.state))
    if (making !== undefined) {
      this.log({ event: 'asked again', line: making.line, party: req.party })
      return this.roomOf(making)
    }
    const earlier = this.earlier()
    const e: Entry = {
      v: LINE_VERSION,
      line: randomUUID().slice(0, 8),
      state: 'asked',
      party: req.party,
      roll: req.roll,
      level: req.level,
      devices: req.devices,
      attempt: 1,
      asked: new Date().toISOString(),
      seed: randomInt(1, 2 ** 31),
      message: roomMessage(req, earlier),
      answer: null,
      failures: [],
      again: 0,
      taken: null,
      survey: '',
      look: { state: 'none', answer: null, failures: [], tries: 1, again: 0, taken: null, check: 0, waitsForRoom: false },
      kept: null,
      finished: null,
      opens: null,
      dropped: null,
      gifts: { state: 'none' },
    }
    this.entries.push(e)
    this.log({ event: 'request', line: e.line, request: req, seed: e.seed })
    const drifting = drift(earlier)
    if (drifting.theme !== null || drifting.walls !== null) this.log({ event: 'drift', line: e.line, ...drifting })
    this.save()
    void this.write(e)
    return this.roomOf(e)
  }

  /** One call through the CLI, logged with its system prompt's hash and size, the prompt, the seconds, the tokens and the cost; the answer's data, or a throw. */
  private async call(claude: MeteredClaude, what: 'room' | 'fix' | 'look' | 'lookFix' | 'gifts', line: string, attempt: number, system: string, schema: Schema, prompt: string, timeoutMs: number): Promise<unknown> {
    const cost: { usage: Usage | null } = { usage: null }
    const spec = claude.metered({ model: this.deps.model, effort: this.deps.effort, system, schema }, (usage) => (cost.usage = usage))
    this.log({ event: 'ask', call: what, line, attempt, model: this.deps.model, effort: this.deps.effort, system: this.deps.store.promptId(system), systemChars: system.length, promptChars: prompt.length, prompt })
    const t0 = Date.now()
    try {
      const answer = await once(claude, spec, prompt, { timeoutMs, onText: null, signal: null })
      this.log({ event: 'answer', call: what, line, attempt, secs: answer.ms / 1000, usage: cost.usage, answer: answer.data })
      return answer.data
    } catch (err) {
      if (!this.closed) this.log({ event: 'error', call: what, line, attempt, secs: (Date.now() - t0) / 1000, error: (err as Error).message })
      throw err
    }
  }

  /** Writes a room's try: its first answer, or a fix of the answer as it stands; then guards it into a trial, or fails the try. */
  private async write(e: Entry): Promise<void> {
    const fixing = e.answer !== null
    e.state = fixing ? 'fixing' : 'writing'
    this.save()
    // With no CLI the room waits as it is, for the next API that has one (the constructor takes it up).
    const claude = this.deps.claude
    if (claude === null) return
    let data: unknown
    let answer: RoomAnswer
    try {
      data = fixing
        ? await this.call(claude, 'fix', e.line, e.attempt, ROOM_SYSTEM, FIX_SCHEMA, fixMessage(e.message, e.answer!, e.failures), this.deps.timing.fixMs)
        : await this.call(claude, 'room', e.line, e.attempt, ROOM_SYSTEM, ROOM_SCHEMA, e.message, this.deps.timing.roomMs)
      if (fixing) {
        const fix = shaped<RoomFix>(data, FIX_FIELDS, 'the fix')
        const was = e.answer!
        answer = { ...was, name: { en: fix.name.en, fi: fix.name.fi }, shell: fix.shell, room: fix.room.trim() === '' ? was.room : fix.room, walk: fix.walk.trim() === '' ? was.walk : fix.walk }
      } else {
        const a = shaped<RoomAnswer>(data, ROOM_FIELDS, 'the answer')
        answer = { theme: a.theme, task: a.task, name: { en: a.name.en, fi: a.name.fi }, shell: a.shell, room: a.room, walk: a.walk, wish: a.wish }
      }
    } catch (err) {
      if (this.closed) return
      this.again(e, (err as Error).message)
      return
    }
    if (this.closed) return
    const was = e.answer
    const sameShell = was !== null && JSON.stringify(answer.shell) === JSON.stringify(was.shell)
    const unchanged = was !== null && answer.room === was.room && answer.walk === was.walk && JSON.stringify(answer.name) === JSON.stringify(was.name) && sameShell
    e.answer = answer
    // The look is checked against the room as built: a fix that changes what is built sends a look that was checked, or waits for its check, to a fresh one.
    if (was !== null && (answer.room !== was.room || !sameShell) && (e.look.state === 'ready' || e.look.state === 'check')) {
      e.look.state = 'check'
      e.look.taken = null
      e.look.waitsForRoom = false
      this.log({ event: 'look checked again', line: e.line, attempt: e.attempt, lookAttempt: e.look.tries })
    }
    const guarded = guardAnswer(answer)
    const sentences = [...(unchanged ? ['the fix gave back nothing to change: give back the room code or the walkthrough mended'] : []), ...(guarded.ok ? [] : guarded.sentences)]
    try {
      words("the room's name", answer.name, WORDS_MAX.name)
    } catch (err) {
      sentences.push((err as Error).message)
    }
    if (sentences.length > 0) return this.failed(e, { sentences, survey: '' })
    e.state = 'trial'
    e.taken = null
    this.log({ event: 'trial waits', line: e.line, attempt: e.attempt, name: answer.name })
    this.save()
  }

  /** The CLI gave no answer: the same call again, in the same try, at most CLI_AGAIN times; then the room is dropped. */
  private again(e: Entry, why: string): void {
    if (e.again >= CLI_AGAIN) return this.drop(e, `the CLI gave no answer ${CLI_AGAIN + 1} times running: ${why}`)
    e.again += 1
    void this.write(e)
  }

  /** A try failed (its guard, its name or its trial): a fix while tries are left, else the room is dropped. */
  private failed(e: Entry, failure: Failure): void {
    this.log({ event: 'failed', line: e.line, attempt: e.attempt, sentences: failure.sentences })
    if (e.attempt === TRIES) return this.drop(e, `its last try failed: ${failure.sentences[0] ?? 'no sentence was given'}`)
    e.failures.push(failure)
    e.attempt = (e.attempt + 1) as LineRoom['attempt']
    e.again = 0
    void this.write(e)
  }

  /** Drops the room, and its look with it unless the look was already given up. */
  private drop(e: Entry, why: string): void {
    e.state = 'dropped'
    e.dropped = why
    e.finished = new Date().toISOString()
    if (e.look.state !== 'gave up') e.look.state = 'dropped'
    this.log({ event: 'drop', line: e.line, attempt: e.attempt, why })
    this.prune()
    this.save()
  }

  /** Keeps the newest KEEP_FINISHED finished rooms (kept with their look settled and their presents done, or dropped) and every room still in the making. */
  private prune(): void {
    const finished = this.entries.filter((e) => e.state === 'dropped' || (e.state === 'kept' && SETTLED.includes(e.look.state) && e.gifts.state === 'done'))
    for (const e of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) this.entries.splice(this.entries.indexOf(e), 1)
  }

  // ---------------------------------------------------------------------------- the trial

  private find(line: string): Entry {
    const e = this.entries.find((x) => x.line === line)
    if (e === undefined) throw new HttpError(404, `no room ${line} in the line`)
    return e
  }

  /** GET /trial: the oldest room waiting for its trial, guarded as today's guard writes it and taken by the page that asks; null when none waits. Code the guard now refuses fails its try instead. */
  takeTrial(): TrialJob | null {
    const now = Date.now()
    for (const e of this.entries) {
      if (e.state !== 'trial' || (e.taken !== null && now - e.taken <= this.deps.timing.takenMs)) continue
      const guarded = guardAnswer(e.answer!)
      if (!guarded.ok) {
        this.failed(e, { sentences: guarded.sentences, survey: '' })
        continue
      }
      if (e.taken !== null) this.log({ event: 'trial waits again', line: e.line, attempt: e.attempt })
      e.taken = now
      this.save()
      return { line: e.line, attempt: e.attempt, party: e.party, seed: e.seed, roll: e.roll, level: e.level, shell: e.answer!.shell, room: guarded.room, walk: guarded.walk }
    }
    return null
  }

  /** POST /trial: a pass is kept and its presents asked; a failure goes back as a fix, or drops the room after its last try. The first report with a survey asks for the room's look. */
  report(r: TrialReport): LineRoom {
    const e = this.find(r.line)
    if (e.state !== 'trial' || e.attempt !== r.attempt) throw new HttpError(409, `try ${r.attempt} of room ${r.line} is not waiting for its trial: the room is ${e.state} on try ${e.attempt}`)
    this.log({ event: 'trial', line: e.line, attempt: e.attempt, passed: r.passed, sentences: r.sentences, botSecs: r.botSecs, waitSecs: r.waitSecs, ms: r.ms, survey: r.survey })
    if (r.survey !== '') e.survey = r.survey
    if (r.passed) this.keep(e, r.botSecs!)
    else this.failed(e, { sentences: r.sentences, survey: r.survey })
    this.firstLook(e)
    return this.roomOf(e)
  }

  /** After a trial report: asks for the room's look once there is a survey of the room as built, unless it was asked before or the room was dropped. */
  private firstLook(e: Entry): void {
    if (e.look.state !== 'none' || e.state === 'dropped') return
    if (e.survey !== '') void this.writeLook(e)
    // A pass that came with no survey leaves the look nothing to dress from: the room is kept as its shell.
    else if (e.state === 'kept') this.giveUpLook(e, 'the trial gave no survey of the room to dress it from')
  }

  /** A pass is kept, its code guarded once more (the store refuses what the guard refuses: then the try fails instead), its look added when it is ready, and its presents asked. */
  private keep(e: Entry, botSecs: BotSecs): void {
    const a = e.answer!
    const guarded = guardAnswer(a)
    if (!guarded.ok) return this.failed(e, { sentences: guarded.sentences, survey: '' })
    const file: RoomFile = this.deps.store.keepRoom({ party: e.party, seed: e.seed, roll: e.roll, level: e.level, theme: a.theme, task: a.task, name: a.name, shell: a.shell, room: a.room, walk: a.walk, wish: a.wish, botSecs })
    e.state = 'kept'
    e.kept = file.id
    e.finished = file.made
    e.opens = new Date(Date.parse(file.made) + LOOK_WAIT_MS).toISOString()
    e.gifts = { state: 'asking', tries: 1 }
    this.log({ event: 'keep', line: e.line, attempt: e.attempt, room: file.id, botSecs, wish: a.wish, keptSecs: (Date.parse(file.made) - Date.parse(e.asked)) / 1000, look: e.look.state })
    if (e.look.state === 'ready') this.attachLook(e)
    else if (SETTLED.includes(e.look.state)) this.settle(e)
    // The room passed its trial, so its code builds: a look that waited for it is checked again now (lookReport gives it up if the room still does not build under it).
    else if (e.look.waitsForRoom) e.look.waitsForRoom = false
    this.save()
    this.deps.tell('magic-house:library', this.deps.store.index())
    void this.askGifts(e)
  }

  // ---------------------------------------------------------------------------- the look

  /** Writes a room's look: the look, or its fix after a failed check; then guards it into a check, or fails the try. */
  private async writeLook(e: Entry): Promise<void> {
    const look = e.look
    const fixing = look.answer !== null
    // Typed wide: a drop may change the state while the call is under way.
    look.state = (fixing ? 'fixing' : 'writing') as LookState
    this.save()
    // With no CLI the look waits as it is, for the next API that has one (the constructor takes it up).
    const claude = this.deps.claude
    if (claude === null) return
    const a = e.answer!
    const request = lookMessage({ theme: a.theme, task: a.task, name: a.name, shell: a.shell, party: e.party, roll: e.roll, devices: e.devices }, a.room, e.survey)
    let answer: LookAnswer
    try {
      if (fixing) {
        const data = await this.call(claude, 'lookFix', e.line, look.tries, LOOK_SYSTEM, LOOK_FIX_SCHEMA, lookFixMessage(request, look.answer!.look, look.failures.at(-1)!), this.deps.timing.lookFixMs)
        answer = { ...look.answer!, look: shaped<LookFix>(data, LOOK_FIX_FIELDS, "the look's fix").look }
      } else {
        const data = shaped<LookAnswer>(await this.call(claude, 'look', e.line, look.tries, LOOK_SYSTEM, LOOK_SCHEMA, request, this.deps.timing.lookMs), LOOK_FIELDS, 'the look')
        answer = { look: data.look, wish: data.wish }
      }
    } catch (err) {
      if (this.closed || look.state === 'dropped') return
      this.lookAgain(e, (err as Error).message)
      return
    }
    if (this.closed) return
    if (look.state === 'dropped') {
      this.log({ event: 'look thrown away', line: e.line, attempt: look.tries, why: 'its room was dropped while it was written' })
      return
    }
    look.answer = answer
    const guarded = guardCode('look', answer.look)
    if (!guarded.ok) return this.lookFailed(e, { sentences: [TRIAL_MISTAKES.notCompiled("the look's code", guarded.error)], notes: [] })
    look.state = 'check'
    look.taken = null
    this.log({ event: 'look check waits', line: e.line, attempt: look.tries })
    this.save()
  }

  /** The CLI gave no look: the same call again, in the same try, at most CLI_AGAIN times; then the look is given up. */
  private lookAgain(e: Entry, why: string): void {
    if (e.look.again >= CLI_AGAIN) return this.giveUpLook(e, `the CLI gave no answer ${CLI_AGAIN + 1} times running: ${why}`)
    e.look.again += 1
    void this.writeLook(e)
  }

  /** A look's try failed (its guard or its check): its fix while tries are left, else the look is given up. */
  private lookFailed(e: Entry, failure: LookFailure): void {
    const look = e.look
    this.log({ event: 'look failed', line: e.line, attempt: look.tries, sentences: failure.sentences, notes: failure.notes })
    if (look.tries === LOOK_TRIES) return this.giveUpLook(e, `its last try failed: ${failure.sentences[0] ?? 'no sentence was given'}`)
    look.failures.push(failure)
    look.tries = 2
    look.again = 0
    void this.writeLook(e)
  }

  /** Gives the look up: the room is kept, or will be, without it, drawn in its shell. */
  private giveUpLook(e: Entry, why: string): void {
    e.look.state = 'gave up'
    this.log({ event: 'look given up', line: e.line, attempt: e.look.tries, why })
    if (e.state === 'kept') this.settle(e)
    this.save()
  }

  /** Adds the ready look to its kept room's file; one the store refuses (the guard changed since its check) is given up. */
  private attachLook(e: Entry): void {
    const a = e.look.answer!
    try {
      this.deps.store.attachLook(e.kept!, a.look, a.wish)
    } catch (err) {
      return this.giveUpLook(e, `the library would not keep it: ${(err as Error).message}`)
    }
    e.look.state = 'kept'
    this.log({ event: 'look kept', line: e.line, attempt: e.look.tries, room: e.kept })
    this.settle(e)
    this.save()
  }

  /** A kept room's look has settled: its door opens now if it did not already, logged with the seconds from asked to then, and 'kept without its look' when it was given up. */
  private settle(e: Entry): void {
    const opens = Math.min(Date.parse(e.opens!), Date.now())
    e.opens = new Date(opens).toISOString()
    if (e.look.state === 'gave up') this.log({ event: 'kept without its look', line: e.line, room: e.kept })
    this.log({ event: 'ready', line: e.line, room: e.kept, look: e.look.state, readySecs: (opens - Date.parse(e.asked)) / 1000 })
    this.prune()
  }

  /** GET /look-trial: the oldest look waiting for its check, with the room code as it stands, guarded as today's guard writes them and taken by the page that asks; null when none waits. A look the guard now refuses fails its try instead. */
  takeLook(): LookJob | null {
    const now = Date.now()
    for (const e of this.entries) {
      if (e.look.state !== 'check' || e.look.waitsForRoom || (e.look.taken !== null && now - e.look.taken <= this.deps.timing.lookTakenMs)) continue
      const look = guardCode('look', e.look.answer!.look)
      if (!look.ok) {
        this.lookFailed(e, { sentences: [TRIAL_MISTAKES.notCompiled("the look's code", look.error)], notes: [] })
        continue
      }
      // Room code the guard now refuses fails the room's own try when its trial is taken; its look waits for the mended room.
      const room = guardCode('room', e.answer!.room)
      if (!room.ok) continue
      if (e.look.taken !== null) this.log({ event: 'look check waits again', line: e.line, attempt: e.look.tries })
      e.look.taken = now
      e.look.check += 1
      this.save()
      return { line: e.line, attempt: e.look.tries, check: e.look.check, party: e.party, seed: e.seed, roll: e.roll, level: e.level, shell: e.answer!.shell, room: room.guarded, look: look.guarded }
    }
    return null
  }

  /** POST /look-trial: a pass makes the look ready, and kept at once when its room is; a failure goes to the look's fix, or gives the look up after its last try. */
  lookReport(r: LookReport): LineRoom {
    const e = this.find(r.line)
    const look = e.look
    if (look.state !== 'check' || look.tries !== r.attempt) throw new HttpError(409, `try ${r.attempt} of room ${r.line}'s look is not waiting for its check: the look is ${look.state} on try ${look.tries}`)
    if (look.taken === null || r.check !== look.check) throw new HttpError(409, `check ${r.check} of room ${r.line}'s look is not the one waited for: the room changed since it was taken, and its look waits to be checked again`)
    this.log({ event: 'look check', line: e.line, attempt: look.tries, check: r.check, passed: r.passed, roomUnbuilt: r.roomUnbuilt, sentences: r.sentences, notes: r.notes, counts: r.counts, ms: r.ms })
    look.taken = null
    if (!r.passed && r.roomUnbuilt) {
      // The room's failure, not the look's: a kept room's code will not change, so its look is given up; otherwise the look keeps its try for the mended room.
      if (e.state === 'kept') this.giveUpLook(e, `the room's code did not build under it: ${r.sentences[0]!}`)
      else {
        look.waitsForRoom = true
        this.log({ event: 'look waits for its room', line: e.line, attempt: look.tries })
        this.save()
      }
    } else if (!r.passed) this.lookFailed(e, { sentences: r.sentences, notes: r.notes })
    else if (e.state === 'kept') this.attachLook(e)
    else {
      look.state = 'ready'
      this.save()
    }
    return this.roomOf(e)
  }

  // ---------------------------------------------------------------------------- the presents

  /** Asks for a kept room's presents; those the guard refuses are dropped, the rest wait for a page's check. With no CLI they wait, asking, for the next API that has one. */
  private async askGifts(e: Entry): Promise<void> {
    if (e.gifts.state !== 'asking') throw new Error(`room ${e.line}'s presents are ${e.gifts.state}, not being asked`)
    const claude = this.deps.claude
    if (claude === null) return
    const tries = e.gifts.tries
    let gifts: GiftAnswer[]
    try {
      const data = await this.call(claude, 'gifts', e.line, tries, GIFTS_SYSTEM, GIFTS_SCHEMA, giftsMessage(e.answer!), this.deps.timing.giftsMs)
      if (!isObject(data) || !Array.isArray(data.gifts)) throw new Error('the presents are not in the shape asked for')
      gifts = data.gifts.map((g) => shaped<GiftAnswer>(g, GIFT_FIELDS, 'a present'))
    } catch (err) {
      if (this.closed) return
      if (tries < GIFT_TRIES) {
        e.gifts = { state: 'asking', tries: tries + 1 }
        this.save()
        return this.askGifts(e)
      }
      e.gifts = { state: 'done' }
      this.log({ event: 'presents dropped', line: e.line, room: e.kept, why: (err as Error).message })
      this.prune()
      this.save()
      return
    }
    if (this.closed) return
    this.waitForCheck(e, gifts)
    this.save()
  }

  /** The presents the guard writes today, each with its guarded code; those it refuses are dropped and logged, and with none left the room's presents are done. */
  private waitForCheck(e: Entry, gifts: readonly GiftAnswer[]): GiftTry[] {
    const tries: GiftTry[] = []
    const kept: GiftAnswer[] = []
    for (const g of gifts) {
      const guarded = guardCode('gift', g.code)
      if (!guarded.ok) {
        this.log({ event: 'present refused', line: e.line, room: e.kept, name: g.name, error: guarded.error })
        continue
      }
      kept.push(g)
      tries.push({ slot: g.slot, name: g.name, form: g.form, code: guarded.guarded })
    }
    e.gifts = kept.length > 0 ? { state: 'trial', gifts: kept, taken: null } : { state: 'done' }
    if (kept.length === 0) this.prune()
    return tries
  }

  /** GET /gift-trial: the oldest kept room's presents waiting for their check, guarded as today's guard writes them and taken by the page that asks; null when none wait. */
  takeGifts(): GiftsJob | null {
    const now = Date.now()
    for (const e of this.entries) {
      if (e.gifts.state !== 'trial' || (e.gifts.taken !== null && now - e.gifts.taken <= this.deps.timing.giftsTakenMs)) continue
      const tries = this.waitForCheck(e, e.gifts.gifts)
      if (e.gifts.state !== 'trial') {
        this.save()
        continue
      }
      e.gifts = { ...e.gifts, taken: now }
      this.save()
      return { room: e.kept!, gifts: tries }
    }
    return null
  }

  /** POST /gift-trial: keeps the presents that passed their check and drops the rest. */
  giftsReport(r: GiftsReport): LibraryIndex {
    const e = this.entries.find((x) => x.kept === r.room)
    if (e === undefined) throw new HttpError(404, `no room ${r.room} in the line`)
    if (e.gifts.state !== 'trial') throw new HttpError(409, `the presents of room ${r.room} are not waiting for their check`)
    const waiting = e.gifts.gifts
    if (r.checks.length !== waiting.length) throw new HttpError(400, `room ${r.room} has ${waiting.length} presents waiting, and the report checked ${r.checks.length}`)
    const kept = waiting.flatMap((g, i) => (r.checks[i]!.passed ? [this.deps.store.keepGift({ slot: g.slot, form: g.form, code: g.code, room: r.room, name: g.name }).id] : []))
    this.log({ event: 'presents', line: e.line, room: r.room, kept, checks: r.checks.map((c, i) => ({ name: waiting[i]!.name, ...c })) })
    e.gifts = { state: 'done' }
    this.prune()
    this.save()
    const index = this.deps.store.index()
    this.deps.tell('magic-house:library', index)
    return index
  }
}
