/**
 * Magic House: what the page and the dev server say to each other: types, and the one number both
 * sides must agree on (PLAYED_MOST). Written in step 1; the server grew into them in step 4.
 *
 * The dev server asks and keeps; the page plays and proves (plan.md, Where things run). The server
 * serves ./api/ (server/api.ts): it asks Opus for rooms and presents, guards each answer as text,
 * holds the line of rooms and keeps the library on disk, and never runs made code. The page compiles
 * the guarded code behind the sandbox, tries a new room in a worker and reports. Any open page takes
 * the next room that waits for a trial, so a reload loses nothing. Every route is in Routes, with
 * what it takes and what it answers; a failure is ApiError with its HTTP status, never a crash.
 * The server also tells every open page when the line or the library changes, over Vite's websocket
 * (Told).
 *
 * The library on disk (plan.md, The library) is `magic-house/library/`: `rooms/<id>.json` holds a
 * RoomFile, `wear/<id>.json` a GiftFile, and `index.json` the LibraryIndex. Play never changes a
 * file; the log of every request, trial and play is git-ignored.
 */

import type { Words } from '../../profiles/src/lang'
import type { Slot } from '../../silly-billy/src/engine/types'
import type { Effort } from '../../silly-billy/src/server/claude'
import type { Level, Shell } from './engine/api'
import type { LookBuilt } from './engine/look'
import type { RoomKind, RoomView } from './engine/world'
import type { RoomResult, Thumb } from './saves'
import type { DeviceKind, PartySize } from './seats/types'

/** What the game rolled for a room (plan.md, A model cannot roll dice, so the game does): said to the designer in a plain sentence, and kept with the room, which plays by it. Every room has one size (engine/api.ts ROOM), so there is no size to roll: a page that sends one is refused (server/api.ts). */
export interface Roll {
  readonly kind: RoomKind
  readonly view: RoomView
}

/** The seconds the bots' clean pass took, at each level. */
export type BotSecs = Readonly<Record<Level, number>>

// ------------------------------------------------------------------------------ the library's files

/** The version of a room's file this house writes and reads; the store refuses any other with a sentence (server/store.ts). Version 2 is step 7a's: the theme and the shell, the look, and no size. */
export const ROOM_FILE_VERSION = 2

/** A kept room's file, `library/rooms/<id>.json`. */
export interface RoomFile {
  readonly v: typeof ROOM_FILE_VERSION
  /** Its file name without .json: a few lowercase words from its English name and a number, safe as a path. */
  readonly id: string
  /** The party size it was made for: the house offers it only to a party of this size. */
  readonly party: PartySize
  /** Its own seed, which it always plays on. The trial's second seed is this plus TRIAL.secondSeedOffset (engine/api.ts). */
  readonly seed: number
  readonly roll: Roll
  /** The level of the party that asked for it: the trial plays it again at this level on the second seed, and vitest's replay of a kept room does the same. */
  readonly level: Level
  /** A few words for its theme, and a line for what the players do: how the next request names it among the earlier rooms. */
  readonly theme: string
  readonly task: string
  readonly name: Words
  /** The shell the house draws round it (engine/api.ts Shell), as its answer gave it. */
  readonly shell: Shell
  /** The room code and the walkthrough as Opus wrote them (bodies, no header), and as the guard rewrote them. The page runs only the guarded forms; a change to the guard rewrites them from the written ones. */
  readonly room: string
  readonly roomGuarded: string
  readonly walk: string
  readonly walkGuarded: string
  /** The look code as its designer wrote it (engine/look.ts, the body of function (r, room)) and as guarded; null while the room is kept without a look (the look not settled yet, or given up). The room's file is written when its game passes, and the look added when it settles. */
  readonly look: string | null
  readonly lookGuarded: string | null
  /** What the designer wanted that the engine could not do; empty when nothing. */
  readonly wish: string
  /** What the look's designer wanted that the engine could not do; empty when nothing or without a look. */
  readonly lookWish: string
  readonly botSecs: BotSecs
  /** When it was kept, ISO 8601. */
  readonly made: string
}

/** A present's file, `library/wear/<id>.json`. */
export interface GiftFile {
  readonly id: string
  readonly slot: Slot
  /** Its real form in a sentence or two, written before its code. */
  readonly form: string
  /** Present code as written (the body of function (m, c)), and as guarded; only the guarded form runs. */
  readonly code: string
  readonly guarded: string
  /** The room it came from (RoomFile.id). */
  readonly room: string
  readonly name: Words
  readonly made: string
}

/** A kept room as the house lists it. */
export type RoomEntry = Pick<RoomFile, 'id' | 'party' | 'roll' | 'theme' | 'task' | 'name' | 'shell' | 'botSecs' | 'made'>
/** A present as the dressing room and the quiz list it. */
export type GiftEntry = Pick<GiftFile, 'id' | 'slot' | 'name' | 'room'>

/** `library/index.json`: every kept room and present, oldest first. */
export interface LibraryIndex {
  readonly rooms: readonly RoomEntry[]
  readonly gifts: readonly GiftEntry[]
}

// ------------------------------------------------------------------------------ asking for a room

/** How these players played a room before: one line of the request's "How they played before". */
export interface PlayedBefore {
  readonly name: Words
  readonly botSecs: number
  readonly secs: number
  readonly restarts: number
  readonly hints: number
  readonly end: RoomResult['end']
  /** The steps done of the room's steps: a room with a clock can end with some undone. */
  readonly steps: RoomResult['steps']
  /** How many of the party gave a thumb up and down: "They loved", "They left". */
  readonly up: number
  readonly down: number
}

/** The most rooms a request says how they played: the page sends its newest this many, and the server reads no more. */
export const PLAYED_MOST = 5

/**
 * POST ./api/rooms: ask for a new room for this party. Nothing about the children goes in but their
 * count, what they play on and how the last rooms went (plan.md, About children, as principles). The earlier rooms
 * the new one must be unlike are the server's to list, not the page's: the newest sixty or so of
 * the library and of the line (being written, waiting for a trial, being fixed, or dropped, once
 * each has an answer), so two parties asking close together get rooms unlike each other's, and a
 * room asked after a drop does not get the dropped idea again.
 */
export interface RoomRequest {
  readonly party: PartySize
  readonly roll: Roll
  /** The party's level (saves.ts): the lowest among its players. */
  readonly level: Level
  /** The devices they sit at: "on a touch screen", "on keys and gamepads". */
  readonly devices: readonly DeviceKind[]
  /** The last few rooms these players played, newest first: at most PLAYED_MOST. */
  readonly played: readonly PlayedBefore[]
}

// ------------------------------------------------------------------------------ the line of rooms

/** Where a room is in the line: asked, being written by Opus, waiting for a page to try it, being fixed after a failed trial, kept in the library, or dropped after its last try. */
export type RoomState = 'asked' | 'writing' | 'trial' | 'fixing' | 'kept' | 'dropped'

/**
 * Where a room's look is (step 7a): not asked yet, being written by Opus, waiting for a page's check,
 * being fixed after a failed check, ready and waiting for its room to be kept, kept in the room's file,
 * given up (the room kept without it), or dropped with its room.
 */
export type LookState = 'none' | 'writing' | 'check' | 'fixing' | 'ready' | 'kept' | 'gave up' | 'dropped'

/** One room in the line. */
export interface LineRoom {
  /** The line's own id for it; a kept room's file takes a new id from its name. */
  readonly line: string
  readonly state: RoomState
  readonly party: PartySize
  readonly roll: Roll
  readonly level: Level
  /** Which of its three tries it is on: 1 for the first answer, 2 and 3 for fixes. */
  readonly attempt: 1 | 2 | 3
  /** When it was asked for, ISO 8601: the door's bar measures from here. */
  readonly asked: string
  /** Its name, once Opus has written it. */
  readonly name: Words | null
  /** Once kept, its RoomFile.id. */
  readonly kept: string | null
  /** Once dropped, why, in a sentence. */
  readonly dropped: string | null
  /** Added in step 7a: where its look is. */
  readonly look: LookState
  /** Added in step 7a: once the room is kept while its look is not settled, until when the new door waits for the look (LOOK_WAIT past the keep), ISO 8601 by the server's clock; null otherwise. */
  readonly lookWaitUntil: string | null
}

/** GET ./api/line: the line of rooms, oldest first, and how long a room takes to get ready. */
export interface Line {
  readonly rooms: readonly LineRoom[]
  /** The server's clock when it said this, ISO 8601: the tablet's own clock is not the laptop's, so the page measures the bar and this visit's drops by the server's time (shell/newDoor.ts). */
  readonly now: string
  /** Seconds from asked to kept that nearly every room takes: the 95th percentile of the last kept rooms, 180 until there are five (plan.md, A late room is waited for with quizzes). */
  readonly readySecs: number
}

/** GET ./api/trial: the next room that waits for its trial, taken by the page that asks; null when none waits. A taken room that no report follows soon after the page's worker would have been ended waits again. */
export interface TrialJob {
  readonly line: string
  readonly attempt: 1 | 2 | 3
  readonly party: PartySize
  readonly seed: number
  readonly roll: Roll
  /** The level of the party that asked: played again on the second seed. */
  readonly level: Level
  /** The shell its answer gave: the house's solids are built in its floor's colour, and plain solids take it. */
  readonly shell: Shell
  /** The guarded room code and walkthrough: what the page compiles. */
  readonly room: string
  readonly walk: string
}

/** POST ./api/trial: what the page's trial found. A pass is kept; a failure goes back to Opus as a fix with the sentences and the survey, until its third try is dropped. */
export interface TrialReport {
  readonly line: string
  readonly attempt: 1 | 2 | 3
  readonly passed: boolean
  /** What failed, as plain sentences with the numbers and the designer's own line (engine/api.ts MISTAKES, trial/api.ts WALK_MISTAKES); empty on a pass. */
  readonly sentences: readonly string[]
  /** The room as it was built, in plain lines: where its floors, gaps and things really are. */
  readonly survey: string
  /** The bots' times on a pass; null on a failure. */
  readonly botSecs: BotSecs | null
  /** On a pass, the seconds of each level's pass in which every bot stood idle (stick at rest, no button, no tap; in w.wait, w.until or a goTo alike), for the log: the trial cannot tell a wait the room asks for from one that pads it, so it reports and never fails them; null on a failure. */
  readonly waitSecs: BotSecs | null
  /** Milliseconds of the worker's real time the trial took, for the log. */
  readonly ms: number
}

// ------------------------------------------------------------------------------ the look

/** GET ./api/look-trial (step 7a): a room's look waiting for a page's check (trial/lookCheck.ts), with the room it dresses; null when none waits. attempt 1 is the look as first written, 2 its fix. */
export interface LookJob {
  readonly line: string
  readonly attempt: 1 | 2
  /** Which check of the look this is, counted by the line each time it hands one out: only the report of the last one handed out is taken, so a check of the room code before a game fix changed it is never taken for the room as it stands. */
  readonly check: number
  readonly party: PartySize
  readonly seed: number
  readonly roll: Roll
  readonly level: Level
  readonly shell: Shell
  /** The guarded room code the look is checked against: the room's code as it stands now, so a look is checked again after a game fix. */
  readonly room: string
  /** The guarded look code. */
  readonly look: string
}

/** POST ./api/look-trial: what the page's check of a look found. A pass makes the look ready; a failure goes to the look's fix, and a second failure gives the look up. */
export interface LookReport {
  readonly line: string
  readonly attempt: 1 | 2
  /** The job's check (LookJob.check). */
  readonly check: number
  readonly passed: boolean
  /** The room's own code did not build at some level, so the look could not be checked there: the room's fault, not the look's, and the line keeps the look's try until the room's code changes. */
  readonly roomUnbuilt: boolean
  /** What failed (engine/look.ts LOOK_MISTAKES and the shared MISTAKES); empty on a pass. */
  readonly sentences: readonly string[]
  /** What was left out or drawn plain, and why (engine/look.ts LOOK_NOTES). */
  readonly notes: readonly string[]
  readonly counts: LookBuilt['counts']
  /** Milliseconds of the worker's real time the check took, for the log. */
  readonly ms: number
}

// ------------------------------------------------------------------------------ the presents

/** One present Opus wrote, waiting for the page's check. */
export interface GiftTry {
  readonly slot: Slot
  readonly name: Words
  readonly form: string
  /** The guarded code: what the page compiles. */
  readonly code: string
}

/** GET ./api/gift-trial: a kept room's presents, asked for after the room was kept, waiting for a page to check them (they build, within their shapes, the marker colours only unmixed); null when none wait. */
export interface GiftsJob {
  readonly room: string
  readonly gifts: readonly GiftTry[]
}

/** POST ./api/gift-trial: each present's check, in the job's order. Those that pass are kept; those that fail are dropped, and a room left with none gives presents from other rooms. */
export interface GiftsReport {
  readonly room: string
  readonly checks: readonly { readonly passed: boolean; readonly sentences: readonly string[] }[]
}

// ------------------------------------------------------------------------------ play and status

/** POST ./api/play: one room's result for the log, never a play of the bots'. The seated players' saves get the same through saves.ts; the log holds only the party's numbers, never who they are. */
export interface PlayLog extends Omit<RoomResult, 'thumb' | 'bots'> {
  readonly party: PartySize
  readonly thumbs: readonly Thumb[]
}

/** GET ./api/status. */
export interface Status {
  /** The Claude Code CLI was found: new rooms can be asked for. Without it the new door opens a kept room of the party's size that these players have not played. */
  readonly claude: boolean
  readonly model: string
  readonly effort: Effort
}

/** Every failure: what went wrong in a sentence, with the HTTP status. */
export interface ApiError {
  readonly error: string
}

/** Every route under ./api/: the method and path, what it takes and what it answers. */
export interface Routes {
  'GET /status': { readonly body: null; readonly reply: Status }
  'GET /library': { readonly body: null; readonly reply: LibraryIndex }
  'GET /rooms/:id': { readonly body: null; readonly reply: RoomFile }
  'GET /gifts/:id': { readonly body: null; readonly reply: GiftFile }
  'GET /line': { readonly body: null; readonly reply: Line }
  'POST /rooms': { readonly body: RoomRequest; readonly reply: LineRoom }
  'GET /trial': { readonly body: null; readonly reply: TrialJob | null }
  'POST /trial': { readonly body: TrialReport; readonly reply: LineRoom }
  'GET /look-trial': { readonly body: null; readonly reply: LookJob | null }
  'POST /look-trial': { readonly body: LookReport; readonly reply: LineRoom }
  'GET /gift-trial': { readonly body: null; readonly reply: GiftsJob | null }
  'POST /gift-trial': { readonly body: GiftsReport; readonly reply: LibraryIndex }
  'POST /play': { readonly body: PlayLog; readonly reply: { readonly ok: true } }
}
export type Route = keyof Routes

/**
 * Where the page reads the library from, so the house, the dressing room and the quiz read it one
 * way wherever they run. Two of these are made (steps 4 and 5): on the dev server, from ./api/
 * (GET /library, /rooms/:id, /gifts/:id); on the hosted build, which has no server, from the files
 * the build ships (`import.meta.glob` of every JSON file under `magic-house/library/`, as Silly Billy's
 * `brain/shipped.ts` does). Each rejects with a sentence when what is asked is not there.
 */
export interface LibrarySource {
  index(): Promise<LibraryIndex>
  room(id: string): Promise<RoomFile>
  gift(id: string): Promise<GiftFile>
}

/** What the server tells every open page over Vite's websocket: the event's name and its data. */
export interface Told {
  'magic-house:line': Line
  'magic-house:library': LibraryIndex
}
