/**
 * Magic House: a room, built and played. This is what the page and the trial call.
 *
 * - `new RoomRuntime()` holds what made code is compiled against: the sandbox's Budget, which counts
 *   every loop turn and call (silly-billy/src/engine/sandbox.ts; the guard's `__g()` and each engine
 *   call count on it), and made code's Math (engine/math.ts), whose random is the room's seeded
 *   stream and throws inside a mover's place. Step 3 compiles a room's text with
 *   `compile(guarded, 'room', runtime.budget, { Math: runtime.math, Date: undefined })` into a
 *   RoomCode; a hand-written room is a RoomCode as it is. One runtime serves one room at a time:
 *   buildRoom binds it.
 * - `buildRoom(code, start, runtime)` checks the room's shell, runs the room's code once with the
 *   builder r and the world w (engine/builder.ts), checks what it built, builds the house round it
 *   (its ids after the room's), settles everyone on their floors and takes the survey
 *   (engine/survey.ts). A build that misreads the reference throws a RoomBuildError whose sentence
 *   says what to mend.
 * - `stepRoom(room, input)` plays one frame (1/60 s) in FRAME_ORDER: the sim (engine/sim.ts) calls
 *   the room's hooks, and each hook calls the made code kept for it, counted against the frame's
 *   budget. Made code that throws is skipped, play goes on, and the sentence is kept in
 *   `room.faults` for the trial. `room.world` is the World the scene and the HUD read.
 *
 * Counted, never timed (plan.md, One seed, and weight that is counted): the build is one run of
 * BUDGET.buildTurns; in play all the room's code in one frame shares BUDGET.frameTurns, and each
 * call of a mover's place has BUDGET.placeTurns of its own within it.
 */

import { Budget, GuardError } from '../../../silly-billy/src/engine/sandbox'
import type { FrameInput, SeatIndex } from '../seats/types'
import type * as Api from './api'
import { BUDGET, FEEL, MISTAKES, type RoomCode } from './api'
import { emptyMade, makeBuilder, makeWorld, type BuildSite, type Made } from './builder'
import { described, explain, frozenPoint, Mistake, num, point } from './checks'
import { Handles, KIND_WORD } from './handles'
import { madeMath, nextRandom, type MadeMath } from './math'
import { playerFitsFloor, solidInPlayerFloor } from './floorState'
import { playerFits, solidInPlayer } from './player'
import { createSim, finishBuild, housePart, step, type Hooks, type MoverPose, type RoomStart, type Sim } from './sim'
import { DT, playerHeight, playerWidth, whereOf } from './state'
import { surveyRoom, type Survey } from './survey'
import type { HandleId, World } from './world'

export type { PartyMember, RoomStart } from './sim'

/** Something made code did wrong in play, kept for the trial: the sentence, where it happened first, and how often. */
export interface Fault {
  where: string
  sentence: string
  /** World.t when it first happened. */
  t: number
  count: number
}

/** How each step of the room's list was asked: the frame it was first asked, the frame it turned done, and whether its done() was true the very first frame it was asked (the trial's WALK_MISTAKES.stepEarly). */
export interface StepLog {
  askedFrom: number | null
  doneFrame: number | null
  early: boolean
}

/** A build that misread the reference: its sentence says what to mend. */
export class RoomBuildError extends Error {
  constructor(readonly sentence: string) {
    super(sentence)
    this.name = 'RoomBuildError'
  }
}

/** The most faults a room keeps, each sentence once with its count. */
const FAULTS_KEPT = 64
/** How often, in frames, each mover's place is asked again at a time it was asked before: the same t must give the same place. */
const PURE_EVERY = 60
/** How far to the side a start must leave room to walk, metres. */
const SIDE_ROOM = 0.6

/** What made code is compiled against: the counted budget and the engine's Math. */
export class RoomRuntime {
  readonly budget = new Budget(null)
  readonly math: MadeMath
  private room: Room | null = null

  constructor() {
    this.math = madeMath(() => this.draw())
  }

  serve(room: Room): void {
    this.room = room
  }

  /** Made code's Math.random: the room's stream, refused inside a mover's place. */
  private draw(): number {
    const room = this.room
    if (room === null) throw new Error('Math.random was drawn before a room was built with this runtime')
    if (room.inPlace) throw new Mistake(MISTAKES.randomInPlace())
    return nextRandom(room.sim.world)
  }
}

/** A room being played: its sim and World, its handles and kept made code, what went wrong, and the survey of it as built. */
export class Room {
  readonly sim: Sim
  readonly world: World
  readonly handles: Handles
  readonly made: Made
  readonly faults: Fault[] = []
  readonly steps: StepLog[] = []
  readonly notes: string[] = []
  readonly starts = new Set<SeatIndex>()
  /** True while a mover's place runs: Math.random throws then. */
  inPlace = false
  /** True while the room's code first runs: the builder works only then. */
  building = true
  /** The turns all the room's code has taken this frame. */
  private frameSpent = 0
  /** Each mover's last good place, for a frame in which its place throws; and the places asked before, to ask again. */
  private readonly lastPose = new Map<HandleId, MoverPose>()
  private readonly samples = new Map<HandleId, { t: number; pose: MoverPose }[]>()
  private readonly impure = new Set<HandleId>()
  private surveyed: Survey | null = null

  constructor(
    start: RoomStart,
    readonly runtime: RoomRuntime,
  ) {
    this.sim = createSim(start, this.hooks())
    this.world = this.sim.world
    this.made = emptyMade(start.party.length)
    this.handles = new Handles(this.sim, {
      acts: true,
      player: null,
      refuse: (what, key) => `a ${what} has no ${key}`,
      turn: () => this.runtime.budget.turn(),
      note: (text) => this.notes.push(text),
      started: (seat) => this.starts.add(seat),
    })
  }

  get survey(): Survey {
    if (this.surveyed === null) throw new Error('the room has no survey until it is built')
    return this.surveyed
  }

  /** A handle as a sentence names it: by its name, or by what it is and where it was built; the house's own solids by their part of the house. */
  describe(id: HandleId): string {
    const where = whereOf(this.sim, id)
    if (where.kind === 'player') return `player ${this.world.players[where.i].seat}`
    if (where.kind === 'solid' && this.world.solids[where.i].house) return `the house's ${housePart(this.sim, id)}`
    const name = [...this.made.names].find(([, v]) => v === id)
    if (name !== undefined) return `the ${KIND_WORD[where.kind]} '${name[0]}'`
    const at = this.made.builtAt.get(id)
    if (at === undefined) return `the ${KIND_WORD[where.kind]}`
    const cm = (v: number) => Math.round(v * 100) / 100
    // From high up a point says its z too.
    return `the ${KIND_WORD[where.kind]} at ${cm(at[0])}, ${cm(at[1])}${this.world.view === 'high' ? `, ${cm(at[2])}` : ''}`
  }

  /** Keeps a fault's sentence, once with a count. */
  keep(where: string, sentence: string): void {
    const known = this.faults.find((f) => f.sentence === sentence)
    if (known !== undefined) known.count += 1
    else if (this.faults.length < FAULTS_KEPT) this.faults.push({ where, sentence, t: this.world.t, count: 1 })
  }

  /**
   * Runs made code in play as one call of the frame's budget; a throw is kept and the fallback given
   * back. Once a call has spent the frame's budget, the rest of the frame's code is skipped without a
   * sentence: the call that spent it was named, and the ones after it did nothing wrong.
   */
  private run<T>(where: string, fallback: T, call: () => T): T {
    if (this.frameSpent >= BUDGET.frameTurns) return fallback
    const b = this.runtime.budget
    b.start(Math.max(0, BUDGET.frameTurns - this.frameSpent), MISTAKES.frameLong(where))
    try {
      return call()
    } catch (err) {
      this.keep(where, explain(where, err))
      return fallback
    } finally {
      this.frameSpent += b.spent
    }
  }

  /** A mover's place at t, checked: { at, turn }. */
  private placeOf(id: HandleId, t: number): MoverPose {
    const place = this.made.places.get(id)
    if (place === undefined) throw new Error(`mover ${id} has no place`)
    const v: unknown = place(t)
    if (typeof v !== 'object' || v === null) throw new Mistake(MISTAKES.notPlace(described(v)))
    const o = v as { at?: unknown; turn?: unknown }
    const at = point("a mover's place", 'at', o.at)
    const turn = o.turn === undefined ? 0 : num("a mover's place", 'turn', o.turn)
    // From the side a mover stays on z = 0; from high up it goes anywhere, turning round y.
    return { at: this.world.view === 'high' ? at : [at[0], at[1], 0], turn }
  }

  /**
   * A mover's place at t as the sim and the bots' search ask it: Math.random throws in it, and it
   * has BUDGET.placeTurns of its own. While building it is part of the build's run and a throw
   * fails the build; in play a throw is kept and the mover stays where it last was. `inFrame`
   * counts it in the frame's budget (the sim's own ask); the trial's asks about times to come
   * are not the room's play.
   */
  askPlace(id: HandleId, t: number, inFrame: boolean): MoverPose {
    const b = this.runtime.budget
    // What a sentence calls this place: worked out only when one is said (the bots' search asks places often).
    const where = () => `the place of ${this.describe(id)}`
    if (this.building) {
      const before = b.spent
      this.inPlace = true
      try {
        const pose = this.placeOf(id, t)
        if (b.spent - before > BUDGET.placeTurns) throw new Mistake(MISTAKES.placeLong())
        this.lastPose.set(id, pose)
        return pose
      } catch (err) {
        if (err instanceof GuardError && b.spent - before > BUDGET.placeTurns) throw new Mistake(MISTAKES.placeLong())
        throw err
      } finally {
        this.inPlace = false
      }
    }
    const left = inFrame ? BUDGET.frameTurns - this.frameSpent : BUDGET.placeTurns
    // The frame's budget already spent by another call: the mover stays where it last was, and nothing is blamed on its place.
    const last = this.lastPose.get(id)
    if (left <= 0 && last !== undefined) return last
    b.start(Math.max(0, Math.min(BUDGET.placeTurns, left)), BUDGET.placeTurns <= left ? MISTAKES.placeLong() : MISTAKES.frameLong(where()))
    this.inPlace = true
    try {
      const pose = this.placeOf(id, t)
      if (inFrame) this.lastPose.set(id, pose)
      return pose
    } catch (err) {
      this.keep(where(), explain(where(), err))
      if (last === undefined) throw new Error(`mover ${id} has no place it was put at`)
      return last
    } finally {
      this.inPlace = false
      if (inFrame) this.frameSpent += b.spent
    }
  }

  /** The same t must give the same place: asks a mover's place again at a time asked before, and notes it when it is not the same. */
  checkPlace(id: HandleId, t: number, was: MoverPose): void {
    if (this.impure.has(id)) return
    const faults = this.faults.length
    const again = this.askPlace(id, t, false)
    if (this.faults.length !== faults) return
    if (again.at[0] !== was.at[0] || again.at[1] !== was.at[1] || again.at[2] !== was.at[2] || again.turn !== was.turn) {
      this.impure.add(id)
      if (this.building) throw new Mistake(MISTAKES.placeNotPure(t))
      this.keep(`the place of ${this.describe(id)}`, MISTAKES.placeNotPure(t))
    }
  }

  /** Once a second, each mover's place again at its first time and at the time asked a second ago. */
  checkPlaces(): void {
    if (this.world.frame % PURE_EVERY !== 0) return
    for (const m of this.world.movers) {
      const kept = this.samples.get(m.id)
      const last = this.lastPose.get(m.id)
      if (kept === undefined || last === undefined) continue
      for (const s of kept) this.checkPlace(m.id, s.t, s.pose)
      kept.splice(1, kept.length - 1, { t: m.clock, pose: last })
    }
  }

  /** The first place a mover was put at, kept to ask again. */
  sample(id: HandleId): void {
    const pose = this.lastPose.get(id)
    if (pose === undefined) throw new Error(`mover ${id} was never placed`)
    this.samples.set(id, [{ t: 0, pose }])
    this.checkPlace(id, 0, pose)
  }

  /** Each step's done(): only the next one is asked, and a true the first frame it is asked is noted. */
  private done(i: number): boolean {
    const log = this.steps[i]
    const first = log.askedFrom === null
    if (first) log.askedFrom = this.world.frame
    const where = `step ${i + 1}'s done()`
    const v: unknown = this.run(where, false, () => this.made.steps[i]())
    if (typeof v !== 'boolean') {
      this.keep(where, MISTAKES.notDone(i + 1, described(v)))
      return false
    }
    if (v) {
      log.doneFrame = this.world.frame
      log.early = first
    }
    return v
  }

  /** The sim's way into the made code kept for each handle, in FRAME_ORDER. */
  private hooks(): Hooks {
    const of = (id: HandleId) => this.handles.of(id)
    const player = (seat: SeatIndex) => this.handles.of(this.world.players[seat].id) as Api.Player
    return {
      button: (seat, button, act) => {
        const job = this.made.buttons[seat][button]
        if (job === null) return
        const p = player(seat)
        const where = `player ${seat}'s button ${button} ${act}`
        if (act === 'press' && job.press !== undefined) this.run(where, undefined, () => job.press?.(p))
        if (act === 'hold' && job.hold !== undefined) this.run(where, undefined, () => job.hold?.(p, DT))
        if (act === 'release' && job.release !== undefined) this.run(where, undefined, () => job.release?.(p))
      },
      tap: (on, at) => {
        const f = on === null ? this.made.roomTap : this.made.taps.get(on)
        if (f === null || f === undefined) return
        this.run(on === null ? 'r.tap' : `the tap of ${this.describe(on)}`, undefined, () => f(frozenPoint(at)))
      },
      place: (mover, t) => this.askPlace(mover, t, true),
      touch: (touched, who) => {
        const f = this.made.touch.get(touched)
        if (f !== undefined) this.run(`the touch of ${this.describe(touched)}`, undefined, () => f(of(who) as Api.Who))
      },
      land: (touched, who) => {
        const f = this.made.land.get(touched)
        if (f !== undefined) this.run(`the land of ${this.describe(touched)}`, undefined, () => f(of(who) as Api.Who))
      },
      use: (used, seat) => {
        const f = this.made.use.get(used)
        if (f !== undefined) this.run(`the use of ${this.describe(used)}`, undefined, () => f(player(seat)))
      },
      zone: (zone, act, who) => {
        const where = `the ${act} of ${this.describe(zone)}`
        const h = of(who) as Api.Who
        if (act === 'enter') {
          const f = this.made.enter.get(zone)
          if (f !== undefined) this.run(where, undefined, () => f(h))
        } else if (act === 'stay') {
          const f = this.made.stay.get(zone)
          if (f !== undefined) this.run(where, undefined, () => f(h, DT))
        } else {
          const f = this.made.leave.get(zone)
          if (f !== undefined) this.run(where, undefined, () => f(h))
        }
      },
      timers: () => {
        const t = this.world.t
        const timers = this.made.timers
        const due = timers.filter((x) => x.due <= t + 1e-9)
        if (due.length === 0) return
        timers.splice(0, timers.length, ...timers.filter((x) => x.due > t + 1e-9))
        for (const x of due) this.run('a w.after callback', undefined, x.fn)
      },
      frame: () => {
        const tick = this.made.tick
        if (tick !== null) this.run('the frame function', undefined, () => tick(DT))
      },
      done: (i) => this.done(i),
    }
  }

  /** One frame of play (engine/api.ts FRAME_ORDER). */
  step(input: FrameInput): void {
    if (this.building) throw new Error('the room is still being built')
    this.frameSpent = 0
    const ended = this.world.end !== null
    step(this.sim, input)
    const end = this.world.end
    if (!ended && end !== null && end.by === 'finish' && this.world.next < this.world.steps.length) {
      // Told with the stack of the w.finish call, so the sentence names the designer's line of it.
      const at = this.made.finishAt
      if (at === null) throw new Error('the room ended by w.finish, which was never called')
      const early = new Mistake(MISTAKES.stepUndone(this.world.next + 1, this.world.steps.length))
      early.stack = at.stack
      this.keep('w.finish()', explain(null, early))
    }
    this.checkPlaces()
  }

  /** Checks the room's shell, runs the room's code once and makes the room ready to play: the build, its checks, the house round it, everyone settled, the survey. */
  build(code: RoomCode): void {
    const b = this.runtime.budget
    const site: BuildSite = {
      sim: this.sim,
      handles: this.handles,
      made: this.made,
      notes: this.notes,
      starts: this.starts,
      turn: () => b.turn(),
      building: () => this.building,
      describe: (id) => this.describe(id),
      placed: (id) => this.sample(id),
    }
    // The shell is checked as the builder is made: a shell the answer got wrong is the designer's to mend; anything else is the caller's.
    let built: ReturnType<typeof makeBuilder>
    try {
      built = makeBuilder(site)
    } catch (err) {
      if (err instanceof Mistake) throw new RoomBuildError(explain(null, err))
      throw err
    }
    const { r, check } = built
    const w = makeWorld(site)
    this.runtime.serve(this)
    b.start(BUDGET.buildTurns, MISTAKES.buildLong())
    let tick: unknown
    try {
      tick = code(r, w)
    } catch (err) {
      throw new RoomBuildError(explain(null, err))
    }
    const turns = b.spent
    this.building = false
    try {
      if (tick !== undefined && typeof tick !== 'function') throw new Mistake(MISTAKES.notReturn(described(tick)))
      this.made.tick = tick === undefined ? null : (tick as Api.Tick)
      check()
      finishBuild(this.sim)
      this.checkStarts()
    } catch (err) {
      throw new RoomBuildError(explain(null, err))
    }
    for (let i = 0; i < this.world.steps.length; i++) this.steps.push({ askedFrom: null, doneFrame: null, early: false })
    this.surveyed = surveyRoom(this.sim, this.piecesSpent(), turns, this.notes)
  }

  /** The pieces the build spent: each handle 1 (the house's own solids are the house's), each shape of a model each time it is placed, each button's picture for each player who has it. */
  private piecesSpent(): number {
    const w = this.world
    let n = w.solids.filter((s) => !s.house).length + w.movers.length + w.things.length + w.decor.length + w.zones.length + w.lamps.length + w.signs.length
    for (const s of w.solids) if (s.model !== null) n += w.models[s.model].shapes.length
    for (const t of w.things) n += w.models[t.model].shapes.length
    for (const d of w.decor) n += w.models[d.model].shapes.length
    for (const p of w.players) for (const b of [p.a, p.b]) if (b !== null && typeof b === 'object') n += w.models[b.icon].shapes.length
    return n
  }

  /** Every player starts on a floor, with their whole body free and room to walk to a side (from high up, to any of the four sides on the floor). */
  private checkStarts(): void {
    if (this.world.view === 'high') {
      this.checkStartsFloor()
      return
    }
    for (const p of this.world.players) {
      const at = frozenPoint(p.at.map((v) => Math.round(v * 100) / 100))
      if (p.on === null) throw new Mistake(MISTAKES.startInAir(p.seat, at))
      const w = playerWidth(p)
      const h = playerHeight(p)
      const inside = solidInPlayer(this.sim, p.at[0], p.at[1], w, h)
      if (inside >= 0) throw new Mistake(MISTAKES.startStuck(p.seat, at, `their body is inside ${this.describe(this.world.solids[inside].id)}`))
      const side = (dx: number) => playerFits(this.sim, p.at[0] + dx, p.at[1], w, h) || playerFits(this.sim, p.at[0] + dx, p.at[1] + FEEL.stepUp, w, h)
      if (!side(-SIDE_ROOM) && !side(SIDE_ROOM)) throw new Mistake(MISTAKES.startStuck(p.seat, at, 'solids on both sides leave no room to walk'))
    }
  }

  /** From high up: every player starts on a floor, their whole body free, with room to walk to one of the four sides on the floor. */
  private checkStartsFloor(): void {
    for (const p of this.world.players) {
      const at = frozenPoint(p.at.map((v) => Math.round(v * 100) / 100))
      if (p.on === null) throw new Mistake(MISTAKES.startInAir(p.seat, at))
      const w = playerWidth(p)
      const h = playerHeight(p)
      const inside = solidInPlayerFloor(this.sim, p.at[0], p.at[1], p.at[2], w, h)
      if (inside >= 0) throw new Mistake(MISTAKES.startStuck(p.seat, at, `their body is inside ${this.describe(this.world.solids[inside].id)}`))
      const side = (dx: number, dz: number) => playerFitsFloor(this.sim, p.at[0] + dx, p.at[1], p.at[2] + dz, w, h) || playerFitsFloor(this.sim, p.at[0] + dx, p.at[1] + FEEL.stepUp, p.at[2] + dz, w, h)
      if (!side(-SIDE_ROOM, 0) && !side(SIDE_ROOM, 0) && !side(0, -SIDE_ROOM) && !side(0, SIDE_ROOM)) throw new Mistake(MISTAKES.startStuck(p.seat, at, 'solids on every side leave no room to walk'))
    }
  }
}

/** Builds a room for its party at its level on its seed (RoomStart) by running its code once. Throws a RoomBuildError with the sentence when the build misreads the reference. */
export function buildRoom(code: RoomCode, start: RoomStart, runtime: RoomRuntime): Room {
  const room = new Room(start, runtime)
  room.build(code)
  return room
}

/** One frame of play: each seat's pad in seat order, pointing and the helper's ? (seats/types.ts FrameInput). */
export function stepRoom(room: Room, input: FrameInput): void {
  room.step(input)
}
