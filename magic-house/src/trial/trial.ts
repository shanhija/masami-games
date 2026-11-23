/**
 * Magic House: the trial (plan.md, Proof before play). A pure function from a room and its
 * walkthrough to a report: whether it passed, every sentence that helps the fix, the survey of the
 * room as built, the bots' seconds and the real milliseconds it took. The worker runs it on a new
 * room (a TrialJob's guarded text, compiled behind the sandbox); vitest runs it on the game's own
 * rooms and on every kept room. The clock it is given is read only for its budget of real time
 * (TRIAL.realSecs) and the report's milliseconds; everything it decides is counted on the game's
 * clock, so a room passes or fails the same way on the laptop, the tablet and in the image build.
 *
 * Cheapest first, and no minutes of trial after a fatal fault:
 * 1. Code: the scan of the guarded text for reads used without their call (trial/scan.ts), then the
 *    compile of the room and of the walkthrough. A room that does not compile ends the trial; a
 *    walkthrough that does not compile ends it after the room's own checks (2 to 4).
 * 2. The build at levels 1, 2 and 3, each within its counted weight and its limits, every player
 *    starting on a floor with room to move (engine/room.ts). Any build that fails ends the trial
 *    after all three are tried. Each level built is judged for the way back (trapIn): a place a
 *    player can get down to and not climb back to the play from fails with MISTAKES.trapped, and
 *    the trial goes on, so a fix hears the rest too. Then each level again with sort calling a compare function in
 *    another order (withOtherSort): a room built otherwise fails with MISTAKES.sortOrder, since each
 *    browser would build it its own way and the tablet would play a room the trial never tried.
 * 3. At each level, TRIAL.stillSecs of everyone standing still: nobody bonked, nobody fallen out of
 *    the room (put elsewhere by the room's code is not harm: a stick 'none' room moves its players
 *    by putAt, and a mover carries whoever stands on it), no step done, nothing ended, no fault.
 * 4. At each level, TRIAL.randomSecs of random pressing and tapping from the trial's own stream: no
 *    finish and no fault. A finish names when random input did step 1 and the last step, each with
 *    the tap just before it.
 * 5. The walkthrough at levels 1, 2 and 3 on the room's seed: every step done in order, none done
 *    the first frame it is asked (stepEarly), no fault, finished by w.finish in PASS.minSecs to
 *    PASS.maxSecs; in a room with r.clock, every step done before the clock runs out and no
 *    w.finish before PASS.minSecs, its seconds being the room's own (the clock's, or the finish's).
 *    A run stops at its first fault or walkthrough sentence, and is then not judged for its seconds
 *    or its end too (its fault is what failed); when the walkthrough's code ends, the
 *    bots stand still for TRIAL.doneSecs more; past PASS.maxSecs plus UNTIL_SECS it is stopped.
 * 6. The asking party's level on the second seed (seed + TRIAL.secondSeedOffset), only when that
 *    level passed on the first.
 * 7. In a room played together or side by side, with more than one player, the walkthrough at the
 *    asking level once with each bot standing still, only when every run of 5 and 6 passed: the
 *    room must stay unfinished (not every step done, and no w.finish). A stop of the walkthrough
 *    there counts as unfinished, never as a fault; a fault of the room's code is still one.
 * 8. When every pass of 5 passed: the levels are not all alike. A room whose survey as built and
 *    whose steps' times in the pass are the same at levels 1, 2 and 3 never read w.level() to any
 *    end, and fails with WALK_MISTAKES.levelsAlike (plan.md, Three levels in every room). The
 *    steps' times, not the seconds: a room with r.clock lasts its clock at every level.
 * A contest is judged as any room: its one step and its order at w.finish are the engine's own
 * checks (MISTAKES.stepCount, MISTAKES.order), which fail its build or come back as faults.
 *
 * The same sentence from several levels is said once, naming each level. The real-time budget is
 * looked at every half second of play: past it the trial stops with TRIAL_MISTAKES.realLong.
 *
 * Pure plain numbers: no three.js, no Date, no Math.random (the random presses draw from
 * engine/math.ts's stream). The worker imports this, so nothing under it reaches a .tsx file.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { PASS, TRIAL, MISTAKES, type Level, type RoomCode, type Shell } from '../engine/api'
import { nextThrow, streamState } from '../engine/math'
import { plainParty } from '../engine/party'
import { buildRoom, RoomBuildError, RoomRuntime, stepRoom, type Room, type RoomStart } from '../engine/room'
import { tapTargetFloor } from '../engine/floor'
import { gatherFloor, groundUnderFloor, type FloorGround } from '../engine/floorState'
import { pointOf, tapTarget } from '../engine/sim'
import { DT, playerHeight, playerWidth, roomPoint, solidActive } from '../engine/state'
import { surveyText } from '../engine/survey'
import type { HandleId, RoomKind, RoomView, World } from '../engine/world'
import type { BotSecs, Roll, TrialJob, TrialReport } from '../protocol'
import { STILL_PAD, type FrameInput, type Pad, type PartySize, type SeatIndex, type Tap } from '../seats/types'
import { TRIAL_MISTAKES, UNTIL_SECS, WALK_MISTAKES, type WalkCode } from './api'
import { compileRoom, compileWalk, WalkRuntime } from './compile'
import { FAR, reachUnder, type FloorGraph } from './graph'
import type { HighGraph } from './highGraph'
import { scanReads } from './scan'
import { Foresight } from './search'
import { WalkRun } from './walk'

/** A room as the trial takes it: what was rolled for it, its party and seed, the asking party's level, and its code. */
export interface TrialRoom {
  readonly party: PartySize
  readonly seed: number
  readonly roll: Roll
  /** The level of the party that asked: played again on the second seed, and the level of the still-bot runs. */
  readonly level: Level
  /** The room's shell (engine/api.ts Shell), which every build starts from. */
  readonly shell: Shell
  /** The room's code compiled against this runtime (made code), or as it is (a hand-written room). It may throw: the room did not compile. */
  readonly room: (runtime: RoomRuntime) => RoomCode
  readonly walk: (runtime: WalkRuntime) => WalkCode
  /** The guarded texts, for the scan; null for hand-written code. */
  readonly texts: { readonly room: string; readonly walk: string } | null
}

/** What each run of the trial was. */
export type RunKind = 'still' | 'random' | 'pass' | 'second' | 'stillBot'

/** One run, for the log and for measuring. */
export interface TrialRun {
  readonly kind: RunKind
  readonly level: Level
  readonly seed: number
  /** The bot standing still in a stillBot run, else null. */
  readonly still: SeatIndex | null
  /** Seconds of play it ran. */
  readonly secs: number
  /** Seconds of it in which every bot stood idle (walk.ts, WalkRun.waitSecs). */
  readonly waitSecs: number
  readonly ms: number
  /** It said nothing against the room. */
  readonly ok: boolean
}

/** The trial's whole answer: what the report carries, and each run. */
export interface TrialResult {
  readonly passed: boolean
  readonly sentences: readonly string[]
  readonly survey: string
  readonly botSecs: BotSecs | null
  readonly waitSecs: BotSecs | null
  readonly ms: number
  readonly runs: readonly TrialRun[]
}

/** Milliseconds of real time, from anywhere: the worker gives performance.now. */
export type Clock = () => number

const LEVELS: readonly Level[] = [1, 2, 3]
/** How often, in frames of play, the real-time budget is looked at. */
const LOOK_EVERY = 30
/** How long after a tap a step done by random input is told as coming right after it, seconds. */
const TAP_BLAME = 0.5
const tenth = (v: number) => Math.round(v * 10) / 10

/** When each step turned done, as a short pass's or a long pass's sentence says it: "10.8, 23.8 and 44.9 s", so the designer sees where the time went. */
const stepTimes = (w: World): string => {
  const at = w.steps.flatMap((s) => (s.doneAt === null ? [] : [String(tenth(s.doneAt))]))
  return `${at.length > 1 ? `${at.slice(0, -1).join(', ')} and ${at.at(-1)!}` : (at[0] ?? 'none')} s`
}

/** The trial's budget of real time ran out: the run stops wherever it is. */
class Late extends Error {
  constructor(readonly doing: string) {
    super(doing)
    this.name = 'Late'
  }
}

/** Where a sentence was said: which run, and when in it. */
interface Said {
  /** "at level 2", "at level 1 on the second seed", "with everyone standing still at level 3". */
  readonly label: string
  /** "34.5 s into play, with step 3 of 5 next", or '' when the sentence says it all. */
  readonly detail: string
  readonly body: string
  readonly level: Level | null
}

/** A clean pass: its bot seconds (a clock room's are the clock's), when each step turned done, the seconds it really played before it stopped, the seconds every bot stood idle, and whether it said nothing. */
interface Pass {
  readonly secs: number
  readonly steps: string
  readonly played: number
  readonly waitSecs: number
  readonly ok: boolean
}

/** What a run of the walkthrough came to. */
interface Walked {
  readonly room: Room
  readonly run: WalkRun
}

/**
 * Runs `f` with Array.prototype.sort a plain stable insertion sort, which calls a compare function in
 * another order than a browser's own sort does. A compare function that answers the same for the same
 * two items sorts alike either way (a sort must be stable), so a room built otherwise under it sorted
 * by one that does not, as one drawing Math.random() does, and every browser would build it its own
 * way. Made code cannot reach the prototype; the trial puts it back before anything else runs.
 */
function withOtherSort<T>(f: () => T): T {
  const native = Array.prototype.sort
  const other = function (this: unknown[], compare?: (a: unknown, b: unknown) => number): unknown[] {
    if (compare === undefined) return native.call(this)
    // As every sort does, undefined items go last and are never compared.
    const xs = this.filter((x) => x !== undefined)
    const gone = this.length - xs.length
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i]
      let j = i - 1
      for (; j >= 0 && compare(xs[j], x) > 0; j--) xs[j + 1] = xs[j]
      xs[j + 1] = x
    }
    for (let i = 0; i < xs.length; i++) this[i] = xs[i]
    for (let i = 0; i < gone; i++) this[xs.length + i] = undefined
    return this
  }
  Array.prototype.sort = other as typeof native
  try {
    return f()
  } finally {
    Array.prototype.sort = native
  }
}

/** A room trialled: the steps above, in order, under the budget. */
class Trial {
  private readonly said: Said[] = []
  private readonly runs: TrialRun[] = []
  private readonly surveys = new Map<Level, string>()
  private readonly started: number
  private readonly runtime = new RoomRuntime()
  private readonly walkRuntime = new WalkRuntime()
  private code: RoomCode | null = null
  private walk: WalkCode | null = null

  constructor(
    private readonly t: TrialRoom,
    private readonly clock: Clock,
  ) {
    this.started = clock()
  }

  run(): TrialResult {
    let botSecs: BotSecs | null = null
    let waitSecs: BotSecs | null = null
    try {
      const passes = this.steps()
      if (passes !== null && this.said.length === 0) {
        botSecs = { 1: passes[1].secs, 2: passes[2].secs, 3: passes[3].secs }
        waitSecs = { 1: passes[1].waitSecs, 2: passes[2].waitSecs, 3: passes[3].waitSecs }
      }
    } catch (err) {
      if (err instanceof Late) this.say('', '', TRIAL_MISTAKES.realLong(TRIAL.realSecs, err.doing), null)
      else this.say('', '', TRIAL_MISTAKES.failed(err instanceof Error ? err.message : String(err)), null)
    }
    const passed = this.said.length === 0
    return { passed, sentences: this.sentences(), survey: this.survey(passed), botSecs: passed ? botSecs : null, waitSecs: passed ? waitSecs : null, ms: Math.round(this.clock() - this.started), runs: this.runs }
  }

  /** The steps in order; the clean passes at each level when every one of them passed, else null. */
  private steps(): Record<Level, Pass> | null {
    const t = this.t
    // 1. Code.
    if (t.texts !== null) {
      for (const s of scanReads(t.texts.room, "the room's code", 1)) this.say('', '', s, null)
      for (const s of scanReads(t.texts.walk, 'the walkthrough', 1)) this.say('', '', s, null)
    }
    try {
      this.code = t.room(this.runtime)
    } catch (err) {
      this.say('', '', TRIAL_MISTAKES.notCompiled("the room's code", err instanceof Error ? `${err.name}: ${err.message}` : String(err)), null)
      return null
    }
    try {
      this.walk = t.walk(this.walkRuntime)
    } catch (err) {
      this.say('', '', TRIAL_MISTAKES.notCompiled('the walkthrough', err instanceof Error ? `${err.name}: ${err.message}` : String(err)), null)
    }
    // 2. The builds.
    let built = true
    // The room as built but for its turns, which a sort's compare function spends as many times as the sort calls it.
    const asBuilt = (room: Room) => surveyText({ ...room.survey, turns: 0 }, (id) => room.describe(id))
    const rooms = new Map<Level, string>()
    for (const level of LEVELS) {
      const room = this.build(level, t.seed, `at level ${level}`)
      if (room === null) built = false
      else {
        this.surveys.set(level, surveyText(room.survey, (id) => room.describe(id)))
        rooms.set(level, asBuilt(room))
        // Last, as it asks the movers' places ahead: this build is not played.
        const trap = trapIn(room)
        if (trap !== null) this.say(`at level ${level}`, '', trap, level)
      }
    }
    if (!built) return null
    // 2, again: each level built with sort calling its compare function in another order must be the same room.
    const otherwise = LEVELS.some((level) => {
      const room = withOtherSort(() => this.build(level, t.seed, `at level ${level}`))
      return room === null || asBuilt(room) !== rooms.get(level)
    })
    if (otherwise) this.say('', '', MISTAKES.sortOrder(), null)
    // 3 and 4. Standing still, then pressing at random.
    for (const level of LEVELS) this.still(level)
    for (const level of LEVELS) this.random(level)
    if (this.walk === null) return null
    // 5. The walkthrough at each level.
    const passes = {} as Record<Level, Pass>
    for (const level of LEVELS) passes[level] = this.pass(level, t.seed, 'pass')
    // 6. The asking level on the second seed.
    if (passes[t.level].ok) this.pass(t.level, t.seed + TRIAL.secondSeedOffset, 'second')
    // 7. Each bot standing still.
    const allPassed = this.runs.every((r) => r.ok || (r.kind !== 'pass' && r.kind !== 'second'))
    if (allPassed && stillRuns(t.roll.kind, t.party)) for (let seat = 0; seat < t.party; seat++) this.stillBot(seat as SeatIndex, passes[t.level].played)
    // 8. The levels differ: a room the same at all three, built alike and its steps done at the same seconds, gives a party that struggles or flies nothing to move to.
    const one = this.surveys.get(1)
    if (LEVELS.every((l) => passes[l].ok && this.surveys.get(l) === one && passes[l].steps === passes[1].steps)) this.say('', '', WALK_MISTAKES.levelsAlike(passes[1].secs), null)
    return LEVELS.every((l) => passes[l].ok) ? passes : null
  }

  // ------------------------------------------------------------------------------ the runs

  private start(level: Level, seed: number): RoomStart {
    return { seed, level, kind: this.t.roll.kind, view: this.t.roll.view, shell: this.t.shell, party: plainParty(this.t.party) }
  }

  /** The room built at a level on a seed, or null with its sentence said. */
  private build(level: Level, seed: number, label: string): Room | null {
    try {
      return buildRoom(this.code as RoomCode, this.start(level, seed), this.runtime)
    } catch (err) {
      if (!(err instanceof RoomBuildError)) throw err
      this.say(label, '', err.sentence, level)
      return null
    }
  }

  /** Looks at the budget of real time. */
  private look(doing: () => string): void {
    if (this.clock() - this.started > TRIAL.realSecs * 1000) throw new Late(doing())
  }

  private note(kind: RunKind, level: Level, seed: number, still: SeatIndex | null, room: Room, waitSecs: number, began: number, before: number): void {
    this.runs.push({ kind, level, seed, still, secs: tenth(room.world.t), waitSecs: tenth(waitSecs), ms: Math.round(this.clock() - began), ok: this.said.length === before })
  }

  /** Each fault the room's code made, as said at `label`. */
  private faults(room: Room, label: string, level: Level): void {
    for (const f of room.faults) this.say(label, `${tenth(f.t)} s into play`, f.count > 1 ? `${f.sentence} (${f.count} times)` : f.sentence, level)
  }

  /** 3. Everyone standing still for TRIAL.stillSecs. */
  private still(level: Level): void {
    const began = this.clock()
    const before = this.said.length
    const room = this.build(level, this.t.seed, `at level ${level}`) as Room
    const label = `with everyone standing still at level ${level}`
    const input: FrameInput = { pads: room.world.players.map(() => STILL_PAD), pointing: { taps: [], held: [] }, help: false }
    const w = room.world
    for (let f = 0; f < TRIAL.stillSecs / DT; f++) {
      if (f % LOOK_EVERY === 0) this.look(() => `everyone stood still at level ${level}`)
      stepRoom(room, input)
      const secs = tenth(w.t)
      const harm = w.players.find((p) => p.bonkedUntil !== -Infinity || p.back !== null)
      if (w.end !== null) this.say(`at level ${level}`, '', MISTAKES.stillEnded(secs), level)
      else if (w.next > 0) this.say(`at level ${level}`, '', MISTAKES.stillStep(w.next, secs), level)
      else if (harm !== undefined) this.say(`at level ${level}`, '', harm.bonkedUntil !== -Infinity ? MISTAKES.stillBonked(harm.seat, secs) : MISTAKES.stillFell(harm.seat, secs), level)
      if (this.said.length > before || room.faults.length > 0) break
    }
    this.faults(room, label, level)
    this.note('still', level, this.t.seed, null, room, 0, began, before)
  }

  /** 4. Random pressing and tapping for TRIAL.randomSecs. */
  private random(level: Level): void {
    const began = this.clock()
    const before = this.said.length
    const room = this.build(level, this.t.seed, `at level ${level}`) as Room
    const presses = randomPresses(room, this.t.seed + TRIAL.randomSeedOffset)
    const w = room.world
    // When random input did step 1 and the last step, each with the last tap that something took within TAP_BLAME seconds before it: what a fix must stop doing them.
    let first: { secs: number; tap: string | null } | null = null
    let last: { step: number; secs: number; tap: string | null } | null = null
    let tap: { t: number; on: string } | null = null
    for (let f = 0; f < TRIAL.randomSecs / DT && w.end === null && room.faults.length === 0; f++) {
      if (f % LOOK_EVERY === 0) this.look(() => `pressing at random at level ${level}`)
      const input = presses()
      for (const p of input.pointing.taps) {
        const on = w.view === 'high' ? tapTargetFloor(room.sim, p.at[0], p.at[1], p.at[2]) : tapTarget(room.sim, p.at[0], p.at[1])
        if (on !== null) tap = { t: w.t, on: room.describe(on) }
        else if (room.made.roomTap !== null) tap = { t: w.t, on: `${tenth(p.at[0])}, ${tenth(p.at[1])}, which r.tap took` }
      }
      stepRoom(room, input)
      const blamed = tap !== null && w.t - tap.t <= TAP_BLAME ? tap.on : null
      if (first === null && w.next > 0) first = { secs: tenth(w.t), tap: blamed }
      if (last === null && w.steps.length > 1 && w.next === w.steps.length) last = { step: w.steps.length, secs: tenth(w.t), tap: blamed }
    }
    if (w.end !== null && w.end.by === 'finish') this.say(`at level ${level}`, '', MISTAKES.randomFinished(tenth(w.end.at), first, last), level)
    this.faults(room, `while pressing at random at level ${level}`, level)
    this.note('random', level, this.t.seed, null, room, 0, began, before)
  }

  /**
   * The walkthrough played on a fresh build until the room ends, the walkthrough stops or makes a
   * fault, TRIAL.doneSecs pass after its code ends, `cap` seconds pass, or `enough` says the run has
   * shown what it is for.
   */
  private playWalk(room: Room, still: SeatIndex | null, cap: number, enough: (room: Room) => boolean, doing: () => string): Walked {
    const run = new WalkRun(room, this.walk as WalkCode, this.walkRuntime, { still })
    const w = room.world
    let doneBy = Infinity
    for (let f = 0; w.end === null; f++) {
      if (f % LOOK_EVERY === 0) this.look(doing)
      const input = run.input()
      if (run.state === 'stopped') break
      if (run.state === 'done' && doneBy === Infinity) doneBy = w.t + TRIAL.doneSecs
      stepRoom(room, input)
      if (room.faults.length > 0 || enough(room) || w.t >= doneBy - 1e-9 || w.t >= cap - 1e-9) break
    }
    if (w.end !== null && run.state === 'playing') run.input()
    return { room, run }
  }

  /** The longest a clean pass may play before it is stopped: PASS.maxSecs and UNTIL_SECS more, or a room's own clock. */
  private cap(room: Room): number {
    return room.world.clock !== null ? room.world.clock + 1 : PASS.maxSecs + UNTIL_SECS
  }

  /** 5 and 6. A clean pass at a level on a seed, judged by the steps (engine/api.ts PASS). */
  private pass(level: Level, seed: number, kind: 'pass' | 'second'): Pass {
    const began = this.clock()
    const before = this.said.length
    const label = kind === 'pass' ? `at level ${level}` : `at level ${level} on the second seed`
    const room = this.build(level, seed, label)
    if (room === null) return { secs: 0, steps: '', played: 0, waitSecs: 0, ok: false }
    const w = room.world
    const clock = w.clock
    const n = w.steps.length
    // A room with r.clock has shown its pass once every step is done and a w.finish can no longer come too early.
    const enough = (r: Room) => clock !== null && r.world.next === n && r.world.t >= PASS.minSecs
    const { run } = this.playWalk(room, null, this.cap(room), enough, () => `the walkthrough played ${label}, ${tenth(w.t)} s into play`)
    const when = () => `${tenth(w.t)} s into play, ${w.next < n ? `with step ${w.next + 1} of ${n} next` : 'with every step done'}`
    this.faults(room, label, level)
    if (run.state === 'stopped') this.say(label, when(), run.sentence as string, level)
    // A run already stopped by a fault or a walkthrough sentence is no clean pass: its seconds and its end are not judged too.
    const stopped = this.said.length > before
    // A step done early stops nothing, so the seconds of that run are still judged: a fix hears all that is wrong at once.
    const early = room.steps.findIndex((s) => s.early)
    if (early >= 0) this.say(label, '', WALK_MISTAKES.stepEarly(early + 1), level)
    let secs = tenth(w.t)
    if (clock !== null) {
      secs = tenth(w.end !== null ? w.end.at : clock)
      if (w.end !== null && w.end.by === 'clock' && w.next < n) this.say(label, '', WALK_MISTAKES.clockOut(w.next + 1, n), level)
      else if (stopped) {
        // Said already.
      } else if (w.end !== null && w.end.by === 'finish' && w.end.at < PASS.minSecs) this.say(label, '', WALK_MISTAKES.tooShort(secs, stepTimes(w), tenth(PASS.aimSecs / Math.max(secs, 1))), level)
      else if (w.next < n) this.say(label, when(), run.state === 'done' ? WALK_MISTAKES.unfinished(run.bumped()) : WALK_MISTAKES.notFinished(tenth(w.t), run.repeated(), run.bumped()), level)
    } else if (stopped) {
      // Said already.
    } else if (w.end !== null && w.end.by === 'finish') {
      if (w.end.at < PASS.minSecs) this.say(label, '', WALK_MISTAKES.tooShort(secs, stepTimes(w), tenth(PASS.aimSecs / Math.max(secs, 1))), level)
      else if (w.end.at > PASS.maxSecs) this.say(label, '', WALK_MISTAKES.tooLong(secs, stepTimes(w)), level)
    } else this.say(label, when(), run.state === 'done' ? WALK_MISTAKES.unfinished(run.bumped()) : WALK_MISTAKES.notFinished(tenth(w.t), run.repeated(), run.bumped()), level)
    this.note(kind, level, seed, null, room, run.waitSecs, began, before)
    return { secs, steps: stepTimes(w), played: tenth(w.t), waitSecs: tenth(run.waitSecs), ok: this.said.length === before }
  }

  /** 7. The walkthrough with one bot standing still: the room must stay unfinished. */
  private stillBot(seat: SeatIndex, played: number): void {
    const began = this.clock()
    const before = this.said.length
    const level = this.t.level
    const room = this.build(level, this.t.seed, `at level ${level}`) as Room
    const finished = (r: Room) => r.world.next === r.world.steps.length || (r.world.end !== null && r.world.end.by === 'finish')
    // As long as the clean pass played and a w.until's wait more: what the others cannot finish by then, they do not finish.
    const cap = Math.min(this.cap(room), played + UNTIL_SECS)
    const { run } = this.playWalk(room, seat, cap, finished, () => `the walkthrough played with bot ${seat} standing still, ${tenth(room.world.t)} s into play`)
    if (finished(room)) this.say(`at level ${level}`, '', WALK_MISTAKES.stillFinished(seat), level)
    this.faults(room, `with bot ${seat} standing still at level ${level}`, level)
    this.note('stillBot', level, this.t.seed, seat, room, run.waitSecs, began, before)
  }

  // ------------------------------------------------------------------------------ what it says

  private say(label: string, detail: string, body: string, level: Level | null): void {
    this.said.push({ label, detail, body, level })
  }

  /** Each sentence once: where it was first said (and the other places that said it), then the sentence. */
  private sentences(): string[] {
    const byBody = new Map<string, Said[]>()
    for (const s of this.said) {
      const list = byBody.get(s.body)
      if (list === undefined) byBody.set(s.body, [s])
      else list.push(s)
    }
    return [...byBody.values()].map((list) => {
      const first = list[0]
      const others = [...new Set(list.slice(1).map((s) => s.label).filter((l) => l !== '' && l !== first.label))]
      const where = [first.label, first.detail].filter((p) => p !== '').join(', ') + (others.length > 0 ? ` (the same ${others.join(', ')})` : '')
      return where === '' ? first.body : `${where}: ${first.body}`
    })
  }

  /** The room as built: on a pass at the asking level; on a failure at each level a sentence names, else wherever it built. */
  private survey(passed: boolean): string {
    const named = [...new Set(this.said.map((s) => s.level).filter((l): l is Level => l !== null && this.surveys.has(l)))].sort()
    const levels = passed ? [this.t.level] : named.length > 0 ? named : LEVELS.filter((l) => this.surveys.has(l)).slice(0, 1)
    const groups: { levels: Level[]; text: string }[] = []
    for (const l of levels) {
      const text = this.surveys.get(l)
      if (text === undefined) continue
      const same = groups.find((g) => g.text === text)
      if (same !== undefined) same.levels.push(l)
      else groups.push({ levels: [l], text })
    }
    return groups.map((g) => `The room as built at level${g.levels.length > 1 ? 's' : ''} ${g.levels.join(' and ')}:\n${g.text}`).join('\n\n')
  }
}

/**
 * The way back (engine/api.ts THE ROOM: wherever a player can get down to, they can climb back up
 * from; THE TRIAL names it). In the room as built, the bots' graph (trial/graph.ts from the side,
 * trial/highGraph.ts from high up) gives every place a player reaches from their start by its walks,
 * jumps, drops and rides on solids that move. A place reached is a trap when, in the same graph, the
 * player can get from it neither back to their start, nor to anything that helps, nor to every
 * place the play needs that the start gets to: each step's place (got to within a jump of it) and
 * each zone (got to by standing in it, as the room code reads who stands there). So a start on a
 * ledge that the player drops off and never needs again is no trap, and a well with a lever at its
 * far end is none either.
 *
 * The graph sees only the room as it stands, so what could help in a way the graph cannot know
 * frees every place that can get to within a jump of it: a solid, thing or zone with a handler (room
 * code can lift a player any way it likes), any thing (pushed, carried, stood on, or shown later), a
 * solid in a mover or sliding or turning, or a hidden solid the room may show. Places reached only
 * after the room changes are not in the graph, so they are not judged; nor are players whose stick
 * does not walk them ('fly' goes anywhere, 'none' only where the room puts them), nor a start the
 * graph has no spot for (on a solid that moves).
 *
 * "Within a jump" is generous on purpose, as a false trap would fail a good room: a box comes within
 * the place's jump across at its own height (reachUnder, the head stopped by what is over it) plus
 * half the body, and between a body's height below the feet and the jump's rise plus a body's height
 * above them.
 *
 * Gives MISTAKES.trapped for the first player with a trap, naming the trapped place nearest their
 * start and the first place the play needs that they lose; null when nobody can be trapped.
 */
export function trapIn(room: Room): string | null {
  const sim = room.sim
  const w = room.world
  const high = w.view === 'high'
  const place = (at: readonly number[]) => (high ? [tenth(at[0]), tenth(at[1]), tenth(at[2])] : [tenth(at[0]), tenth(at[1])])
  // Boxes in the room: x, y (up) and z (from the side every body stands on z = 0, so z is not asked).
  type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
  const zoneBox = (z: World['zones'][number]): Box => {
    const at = roomPoint(sim, z.at, z.mover)
    return { x0: at[0] - z.size[0] / 2, x1: at[0] + z.size[0] / 2, y0: at[1] - z.size[1] / 2, y1: at[1] + z.size[1] / 2, z0: at[2] - z.size[2] / 2, z1: at[2] + z.size[2] / 2 }
  }
  // What could help.
  const helps: Box[] = []
  const answers = (id: HandleId) => {
    const l = sim.listens[id]
    return l.tap || l.touch || l.land || l.use || l.enter || l.stay || l.leave
  }
  w.solids.forEach((s, i) => {
    if (s.house) return
    if (!(answers(s.id) || s.mover !== null || s.slide !== null || s.turning !== null || !solidActive(sim, s))) return
    const o = sim.outlines[i]
    helps.push(high ? { x0: o.minX, x1: o.maxX, y0: o.y0, y1: o.y1, z0: o.minY, z1: o.maxY } : { x0: o.minX, x1: o.maxX, y0: o.minY, y1: o.maxY, z0: 0, z1: 0 })
  })
  for (const t of w.things) helps.push({ x0: t.at[0] + t.box.min[0], x1: t.at[0] + t.box.max[0], y0: t.at[1] + t.box.min[1], y1: t.at[1] + t.box.max[1], z0: t.at[2] + t.box.min[2], z1: t.at[2] + t.box.max[2] })
  for (const z of w.zones) if (answers(z.id)) helps.push(zoneBox(z))
  // The places the play needs, with what the sentence calls them.
  // A step's place is got to within a jump of it, and a zone by standing in it.
  const needs: { box: Box; what: string; standIn: boolean }[] = [
    ...w.steps.map((s, k) => ({ box: { x0: s.at[0], x1: s.at[0], y0: s.at[1], y1: s.at[1], z0: s.at[2], z1: s.at[2] }, what: `step ${k + 1}'s place at ${place(s.at).join(', ')}`, standIn: false })),
    ...w.zones.map((z) => ({ box: zoneBox(z), what: room.describe(z.id), standIn: true })),
  ]
  const foresight = new Foresight(room)
  for (const p of w.players) {
    if (p.stick !== 'walk' && p.stick !== 'floor') continue
    let graph: FloorGraph | HighGraph
    let start: number
    if (high) {
      const h = foresight.highGraph(p, false)
      graph = h
      start = h.spotNear(p.at[0], p.at[1], p.at[2])
    } else {
      const f = foresight.graph(p, false)
      graph = f
      start = f.spotNear(p.at[0], p.at[1])
    }
    if (start < 0) continue
    const spots = graph.spots
    const zOf = (n: number) => (high ? (graph as HighGraph).spots[n].z : 0)
    const hw = playerWidth(p) / 2
    const tall = playerHeight(p)
    // The spots within a jump of a box, or with `standIn` the spots where a body standing is in it.
    const near = (b: Box, standIn: boolean): number[] => {
      const out: number[] = []
      for (let n = 0; n < spots.length; n++) {
        const s = spots[n]
        const dx = Math.max(0, b.x0 - s.x, s.x - b.x1)
        const dz = high ? Math.max(0, b.z0 - zOf(n), zOf(n) - b.z1) : 0
        if (standIn) {
          if (dx <= hw && dz <= hw && b.y0 <= s.y + tall && b.y1 >= s.y) out.push(n)
          continue
        }
        if (b.y0 > s.y + s.rise + tall || b.y1 < s.y - tall) continue
        const across = (s.g <= 0 ? FAR : Math.max(0, reachUnder(0, s.vy, s.g, s.rise))) + hw
        if (dx * dx + dz * dz <= across * across) out.push(n)
      }
      return out
    }
    const reached = graph.reached(start)
    const back = graph.distances([start], false)
    const helped = [...new Set(helps.flatMap((b) => near(b, false)))]
    const toHelp = helped.length > 0 ? graph.distances(helped, false) : null
    const lost: number[] = []
    for (let n = 0; n < spots.length; n++) if (reached[n] === 1 && !Number.isFinite(back[n]) && (toHelp === null || !Number.isFinite(toHelp[n]))) lost.push(n)
    if (lost.length === 0) continue
    // Only now, as most rooms have no lost spot: the places the play needs that the start gets to, each with the seconds to it from every spot.
    const needed = needs.flatMap((nd) => {
      const at = near(nd.box, nd.standIn)
      return at.some((n) => reached[n] === 1) ? [{ what: nd.what, to: graph.distances(at, false) }] : []
    })
    const atOf = (n: number) => [spots[n].x, spots[n].y, zOf(n)]
    const dist = (n: number) => (spots[n].x - p.at[0]) ** 2 + (spots[n].y - p.at[1]) ** 2 + (zOf(n) - p.at[2]) ** 2
    let trapped: { n: number; what: string } | null = null
    for (const n of lost) {
      if (trapped !== null && dist(n) >= dist(trapped.n)) continue
      const missed = needed.find((nd) => !Number.isFinite(nd.to[n]))
      if (missed !== undefined) trapped = { n, what: missed.what }
    }
    if (trapped !== null) return MISTAKES.trapped(place(atOf(trapped.n)), p.seat, place(p.at), trapped.what)
  }
  return null
}

/** Whether the trial plays the walkthrough with each bot standing still: a room played together or side by side, for more than one. */
export function stillRuns(kind: RoomKind, party: PartySize): boolean {
  return kind !== 'contest' && party > 1
}

/**
 * Random pressing and tapping from a seeded stream of the trial's own: each seat now and then
 * changes what it holds, as a child pressing at random; about twice a second a tap lands in the
 * camera's frame or, half the time when the room has things that answer a tap, on one of them; and
 * now and then a finger is held down a second or three. From high up a tap in the frame lands where
 * the scene's line from the eye would: a point of the floor frame, on the highest top there (or the
 * box's floor where nothing is).
 */
export function randomPresses(room: Room, seed: number): () => FrameInput {
  let state = streamState(seed)
  const draw = () => {
    const [v, s] = nextThrow(state)
    state = s
    return v
  }
  const w = room.world
  const holds = w.players.map(() => ({ sx: 0, sy: 0, a: false, b: false }))
  const before = w.players.map(() => ({ a: false, b: false }))
  const tapped = [...room.made.taps.keys()]
  let finger: Vec3 | null = null
  let fingerUntil = 0
  const g: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }
  const inFrame = (): Vec3 => {
    if (w.floorFrame === null) return [w.camera.x + (draw() - 0.5) * w.camera.width, w.camera.y + (draw() - 0.5) * w.camera.height, 0]
    const x = w.floorFrame.x + (draw() - 0.5) * w.floorFrame.width
    const z = w.floorFrame.z + (draw() - 0.5) * w.floorFrame.depth
    const [low, high] = [w.bounds.min[1], w.bounds.max[1] + 1]
    const near = gatherFloor(room.sim, x - 0.01, low, z - 0.01, x + 0.01, high, z + 0.01)
    return [x, groundUnderFloor(room.sim, near, x - 0.01, z - 0.01, x + 0.01, z + 0.01, low, high, high, -1, true, -1, g) ? g.y : low, z]
  }
  return () => {
    const pads: Pad[] = holds.map((h, i) => {
      if (draw() < 0.1) {
        h.sx = Math.floor(draw() * 3) - 1
        h.sy = draw() < 0.2 ? Math.floor(draw() * 3) - 1 : 0
        h.a = draw() < 0.4
        h.b = draw() < 0.2
      }
      const pad: Pad = { stick: [h.sx, h.sy], a: { held: h.a, pressed: h.a && !before[i].a }, b: { held: h.b, pressed: h.b && !before[i].b } }
      before[i].a = h.a
      before[i].b = h.b
      return pad
    })
    const taps: Tap[] = []
    if (draw() < 1 / 30) {
      const at = tapped.length > 0 && draw() < 0.5 ? pointOf(room.sim, tapped[Math.floor(draw() * tapped.length)]) : inFrame()
      taps.push({ at: [at[0], at[1], w.view === 'high' ? at[2] : 0] })
    }
    if (finger !== null && w.t >= fingerUntil) finger = null
    if (finger === null && draw() < 1 / 240) {
      finger = inFrame()
      fingerUntil = w.t + 1 + draw() * 2
    }
    return { pads, pointing: { taps, held: finger === null ? [] : [finger] }, help: false }
  }
}

/** Trials a room: every step above, under TRIAL.realSecs of `clock`. */
export function runTrial(room: TrialRoom, clock: Clock): TrialResult {
  return new Trial(room, clock).run()
}

/** A TrialJob as the trial takes it: its guarded texts compiled behind the sandbox, and scanned. */
export function jobRoom(job: TrialJob): TrialRoom {
  return {
    party: job.party,
    seed: job.seed,
    roll: job.roll,
    level: job.level,
    shell: job.shell,
    room: (rt) => compileRoom(job.room, rt),
    walk: (rt) => compileWalk(job.walk, rt),
    texts: { room: job.room, walk: job.walk },
  }
}

/** A trial's result as the page reports it (POST ./api/trial), for the line's room and its attempt. */
export function reportOf(line: string, attempt: TrialReport['attempt'], r: TrialResult): TrialReport {
  return { line, attempt, passed: r.passed, sentences: r.sentences, survey: r.survey, botSecs: r.botSecs, waitSecs: r.waitSecs, ms: r.ms }
}

/** A TrialJob trialled, as the page reports it. */
export function trialJob(job: TrialJob, clock: Clock): TrialReport {
  return reportOf(job.line, job.attempt, runTrial(jobRoom(job), clock))
}

/** A hand-written room as the trial takes it (the game's own rooms: own/rooms/index.ts OwnRoom), played as its kind and view say, in its shell, asked for at level 1. */
export function handRoom(own: { readonly party: PartySize; readonly seed: number; readonly kind: RoomKind; readonly view: RoomView; readonly shell: Shell; readonly code: RoomCode; readonly walk: WalkCode }): TrialRoom {
  return { party: own.party, seed: own.seed, roll: { kind: own.kind, view: own.view }, level: 1, shell: own.shell, room: () => own.code, walk: () => own.walk, texts: null }
}
