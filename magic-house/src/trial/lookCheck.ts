/**
 * Magic House: the check of a room's look (step 7a; protocol.ts LookJob into a LookReport). A page job
 * of well under a second, run in the trial's worker beside the room's own trial, which never sees a
 * look: the look is compiled from its guarded code (trial/compile.ts compileLook), then at levels 1, 2
 * and 3 the room is built from its code as it stands now and the look built on it
 * (engine/lookBuilder.ts buildLook). A look passes when at every level it builds without a throw, a
 * misreading or going past its pieces or turns, and keeps to its limits and its least
 * (engine/lookBuilder.ts lookFaults: props, small lights, lamps together with the room code's, props
 * that react all over the room, and no more than a third of its placed pieces left out). What breaks
 * where a piece may stand is left out with a note, never a failure on its own.
 *
 * The same sentence or note from several levels is said once, naming each level. The counts are the
 * look's at the asking party's level. A room that does not build is not the look's fault: the check
 * then fails with LOOK_MISTAKES.roomUnbuilt and says so as data (roomUnbuilt), so the line keeps the
 * look's try and waits for the room's code to change.
 *
 * Pure: the worker passes performance.now as the clock, read only for the report's milliseconds.
 * Nothing here reaches a .tsx file (compile.test.ts walks the imports).
 */

import type { Level, RoomCode, Shell } from '../engine/api'
import { LOOK_MISTAKES, type LookBuilt, type LookCode } from '../engine/look'
import { buildLook, LookBuildError, lookFaults } from '../engine/lookBuilder'
import { plainParty } from '../engine/party'
import { buildRoom, RoomBuildError, RoomRuntime, type Room } from '../engine/room'
import type { RoomKind, RoomView } from '../engine/world'
import type { LookJob, LookReport, Roll } from '../protocol'
import type { PartySize } from '../seats/types'
import { TRIAL_MISTAKES } from './api'
import { compileLook, compileRoom, LookRuntime } from './compile'
import type { Clock } from './trial'

/** A room and its look as the check takes them: what was rolled for it, its party and seed, the asking party's level, its shell, and both codes, compiled (made code) or as they are (written by hand). Either may throw: it did not compile. */
export interface LookRoom {
  readonly party: PartySize
  readonly seed: number
  readonly roll: Roll
  readonly level: Level
  readonly shell: Shell
  readonly room: (runtime: RoomRuntime) => RoomCode
  readonly look: (runtime: LookRuntime) => LookCode
}

/** The check's whole answer: what the report carries, and the look as built at each level (null where it did not build). */
export interface LookResult {
  readonly passed: boolean
  /** The room's code did not compile or did not build at some level. */
  readonly roomUnbuilt: boolean
  readonly sentences: readonly string[]
  readonly notes: readonly string[]
  readonly counts: LookBuilt['counts']
  readonly ms: number
  readonly built: Readonly<Record<Level, LookBuilt | null>>
}

const LEVELS: readonly Level[] = [1, 2, 3]
/** A look's counts when it was never built: the look did not compile, or no level built. */
export const NO_COUNTS: LookBuilt['counts'] = { pieces: 0, props: 0, answering: 0, quarters: 0, lights: 0, lamps: 0, leftOut: 0, of: 0 }

/** Each sentence once, with the levels that said it in front: "at level 2: ..." or "at levels 1, 2 and 3: ...". */
function byLevel(said: readonly { level: Level; text: string }[]): string[] {
  const levels = new Map<string, Level[]>()
  for (const s of said) {
    const list = levels.get(s.text)
    if (list === undefined) levels.set(s.text, [s.level])
    else if (!list.includes(s.level)) list.push(s.level)
  }
  return [...levels].map(([text, ls]) => `at level${ls.length > 1 ? 's' : ''} ${ls.length > 1 ? `${ls.slice(0, -1).join(', ')} and ${ls.at(-1)!}` : ls[0]}: ${text}`)
}

/** Checks a room's look: compiled, then built on the room at each level and held to its limits. */
export function runLookCheck(t: LookRoom, clock: Clock): LookResult {
  const started = clock()
  const done = (sentences: readonly string[], notes: readonly string[], counts: LookBuilt['counts'], built: Record<Level, LookBuilt | null>, roomUnbuilt: boolean): LookResult => ({
    passed: sentences.length === 0,
    roomUnbuilt,
    sentences,
    notes,
    counts,
    ms: Math.round(clock() - started),
    built,
  })
  const none: Record<Level, LookBuilt | null> = { 1: null, 2: null, 3: null }
  const runtime = new RoomRuntime()
  const lookRuntime = new LookRuntime()
  let room: RoomCode
  try {
    room = t.room(runtime)
  } catch (err) {
    return done([LOOK_MISTAKES.roomUnbuilt(TRIAL_MISTAKES.notCompiled("the room's code", err instanceof Error ? `${err.name}: ${err.message}` : String(err)))], [], NO_COUNTS, none, true)
  }
  let look: LookCode
  try {
    look = t.look(lookRuntime)
  } catch (err) {
    return done([TRIAL_MISTAKES.notCompiled("the look's code", err instanceof Error ? `${err.name}: ${err.message}` : String(err))], [], NO_COUNTS, none, false)
  }
  const sentences: { level: Level; text: string }[] = []
  const notes: { level: Level; text: string }[] = []
  const built: Record<Level, LookBuilt | null> = { 1: null, 2: null, 3: null }
  let unbuilt = false
  for (const level of LEVELS) {
    let r: Room
    try {
      r = buildRoom(room, { seed: t.seed, level, kind: t.roll.kind, view: t.roll.view, shell: t.shell, party: plainParty(t.party) }, runtime)
    } catch (err) {
      if (!(err instanceof RoomBuildError)) throw err
      sentences.push({ level, text: LOOK_MISTAKES.roomUnbuilt(err.sentence) })
      unbuilt = true
      continue
    }
    try {
      const b = buildLook(r, look, lookRuntime)
      built[level] = b
      for (const text of b.notes) notes.push({ level, text })
      for (const text of lookFaults(b, r.world.view, r.world.lamps.length)) sentences.push({ level, text })
    } catch (err) {
      if (!(err instanceof LookBuildError)) throw err
      sentences.push({ level, text: err.sentence })
    }
  }
  const counts = (built[t.level] ?? LEVELS.map((l) => built[l]).find((b) => b !== null))?.counts ?? NO_COUNTS
  return done(byLevel(sentences), byLevel(notes), counts, built, unbuilt)
}

/** A LookJob as the check takes it: its guarded texts compiled behind the sandbox. */
export function jobLook(job: LookJob): LookRoom {
  return { party: job.party, seed: job.seed, roll: job.roll, level: job.level, shell: job.shell, room: (rt) => compileRoom(job.room, rt), look: (rt) => compileLook(job.look, rt) }
}

/** A LookJob checked, as the page reports it (POST ./api/look-trial). */
export function lookJob(job: LookJob, clock: Clock): LookReport {
  const r = runLookCheck(jobLook(job), clock)
  return { line: job.line, attempt: job.attempt, check: job.check, passed: r.passed, roomUnbuilt: r.roomUnbuilt, sentences: r.sentences, notes: r.notes, counts: r.counts, ms: r.ms }
}

/** A room and its look written by hand (the game's own rooms and their .look.ts files), checked as their kind and view say, in their shell, asked for at level 1. */
export function handLook(own: { readonly party: PartySize; readonly seed: number; readonly kind: RoomKind; readonly view: RoomView; readonly shell: Shell; readonly code: RoomCode }, look: LookCode): LookRoom {
  return { party: own.party, seed: own.seed, roll: { kind: own.kind, view: own.view }, level: 1, shell: own.shell, room: () => own.code, look: () => look }
}
