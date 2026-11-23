/**
 * Magic House: the walkthrough played (plan.md, Proof before play; trial/api.ts). A WalkRun plays a
 * room's walkthrough against the live Room one frame at a time: before each stepRoom, `input()`
 * steps the walkthrough until it yields and hands back that frame's FrameInput (each bot's seat
 * pad, the taps and the pointers held). So the page's ?autoplay plays it while the room plays, and
 * the trial plays it as fast as it can (playWalk).
 *
 * - A bot is a player the walkthrough steers. It presses through the very pad a child's seat feeds
 *   (seats/types.ts Pad), so a bot can do nothing a child cannot. Its verbs (BOT_REF) are engine
 *   generators that set its stick and buttons one frame at a time; a press is worked out from the
 *   frame before, as a seat works it out.
 * - The walkthrough reads the room through Handles of its own that only read (engine/handles.ts),
 *   where every player is the bot that plays them; its loop turns and its calls count on a budget of
 *   its own (trial/compile.ts WalkRuntime: WALK_TURNS a frame), and its Math.random draws from a
 *   stream of its own (engine/api.ts MATH), never the room's.
 * - w.together interleaves its runs one frame each. One bot's stick verbs (goTo, carry, push,
 *   steer) never run two at once: a second one waits until the first lets the stick go. Buttons are
 *   separate; what two calls hold at once is held.
 * - goTo plans with the search (trial/search.ts; from high up trial/highSearch.ts) and follows the
 *   plan frame by frame, planning again when the real body leaves it, the room changes under it or
 *   the target moves. From high up places are x, y, z, reach is measured in 3D boxes, a thing is set
 *   down ahead the way the bot faces, and push walks a thing straight toward its target.
 * - It stops when the room ends (the walkthrough is returned from wherever it is), when the
 *   walkthrough's code ends, or with a sentence: WALK_MISTAKES, the guard's budget, or an error the
 *   code threw, each with the walkthrough's line where the browser tells it. A sentence a verb or w
 *   throws is kept even when the code catches it: the run stops with it at the end of the frame and
 *   every later call throws it again, so a try/catch neither hides it nor loops failed searches.
 * - A still bot (WalkOptions.still) is the trial's run with one player standing still: its pad is
 *   always let go. goTo, carry and push end at once (carry and push give back false); press, hold and
 *   steer take their time with nothing held, so a walkthrough's loop of them still yields.
 * - It counts the seconds in which every bot stood idle, whatever call it was in, for the trial's report,
 *   keeps the things a bot pushed along by walking into them without a push of its own (bumped), and
 *   the calls it made, so a walkthrough still playing at the cut names the call it repeats (repeated).
 *
 * Pure plain numbers: no three.js, no Date, no Math.random.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { describeError } from '../../../silly-billy/src/engine/sandbox'
import { FEEL, MISTAKES, SIZES, WORLD_REF, type Level } from '../engine/api'
import { explain, face, fn, frozenPoint, Mistake, num, point } from '../engine/checks'
import { Handles, KIND_WORD } from '../engine/handles'
import { stepRoom, type Room } from '../engine/room'
import { grabChoiceFloor } from '../engine/floor'
import { emptyBox3, gap3, playerBox3, solidInBox3, thingBox3, type Box3 } from '../engine/floorState'
import { grabChoice, pointOf } from '../engine/sim'
import { DT, playerBox, roomPoint, solidActive, thingBox, thingById, whereOf, type Box, type Sim } from '../engine/state'
import type { HandleId, Player, Thing } from '../engine/world'
import { STILL_PAD, type FrameInput, type Pad, type SeatIndex, type Tap } from '../seats/types'
import { WalkRuntime } from './compile'
import { BOT_TIMES, GOTO, UNTIL_SECS, WALK_MISTAKES, WALK_WORLD_REF, type Bot, type ButtonName, type Run, type WalkCode, type WalkWorld } from './api'
import { placeHigh } from './highGraph'
import { behindGoalHigh, grabGoalHigh, HighPlanner, landingHigh, pointGoalHigh, putGoalHigh, putHeadings, reachGoalHigh, standGoalHigh, zoneGoalHigh, type HighGoal } from './highSearch'
import { boxGap, Foresight, grabGoal, landing, Planner, pointGoal, putGoal, reachGoal, roomKey, SEARCH, settled, sideGoal, standGoal, zoneGoal, type Goal, type Plan, type ThereTest } from './search'

export interface WalkOptions {
  /** The bot that stands still, by seat (its pad always let go), or null for none. */
  readonly still: SeatIndex | null
}

/** How a run stands: playing; ended by the room (the walkthrough was stopped there); its code came to its end; or stopped with a sentence. */
export type WalkState = 'playing' | 'ended' | 'done' | 'stopped'

/** What one bot holds this frame. */
interface Hold {
  sx: number
  sy: number
  a: boolean
  b: boolean
}

/** One bot as the runner keeps it. */
interface BotState {
  readonly seat: SeatIndex
  readonly hold: Hold
  /** Its buttons as fed last frame, so a press is worked out as a seat works it out. */
  readonly before: { a: boolean; b: boolean }
  /** Which call has its stick now, or null. */
  stick: object | null
  readonly planner: Planner
  /** Its planner from high up (trial/highSearch.ts), which a room seen from high up uses instead. */
  readonly high: HighPlanner
}

/** A run made by a verb, until it is started (or handed to w.together): one never started was called without yield*. `at` is an Error made where it was called, whose stack names the walkthrough's line. */
interface Made {
  readonly call: string
  readonly at: Error
  adopted: boolean
}

/** The pushes under way on each thing, by thing id: each pusher's bot and whether it pushes yet. */
type Pushers = Map<HandleId, Map<SeatIndex, boolean>>

const tenth = (v: number) => Math.round(v * 10) / 10
/** How many presses of grab beside a thing a carry makes before it says it never picked it up. */
const PICK_TRIES = 4
/** How near something with use must be to where a carry goes for its sentence to say it sets the thing down away from use, metres. */
const USE_NEAR = 2
/** How far a bot must push a thing along without meaning to, metres, before an unfinished room's sentence says so. */
const BUMP_LEAST = 0.5
/** How many times a walkthrough still playing at the cut must have made one call since the last step turned done before its sentence names that call. */
const REPEAT_LEAST = 5
/** How many of those calls it names, the most made first. */
const REPEAT_NAMED = 3
/** The square of how far a target moved. */
const moved = (a: readonly [number, number], b: readonly [number, number]) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])

export class WalkRun {
  readonly bots: readonly Bot[]
  readonly w: WalkWorld
  readonly handles: Handles
  state: WalkState = 'playing'
  /** The sentence it stopped with, or null. */
  sentence: string | null = null
  /**
   * Seconds of play in which every bot stood idle: stick at rest, no button down, no tap or point,
   * whatever call the walkthrough was in (w.wait, w.until, a goTo waiting for a mover). A room that
   * pads its minute with standing shows here, whether its code or its walkthrough asks the wait.
   */
  waitSecs = 0
  /** The things a bot walked into and pushed along without a push of its own (going somewhere, carrying something else), by thing: who, from where and to where. */
  private readonly bumps = new Map<HandleId, { seat: SeatIndex; from: Vec3; to: Vec3 }>()
  /** Each bot call and w call the walkthrough made, as its sentences name it, and when it started. */
  private readonly started: { call: string; t: number }[] = []
  /** Frames the walkthrough was stepped. */
  frames = 0
  private readonly gen: Run<unknown>
  private readonly states: BotState[]
  private readonly foresight: Foresight
  /** The runs made and not started yet, by a key of each, and each run's key. */
  private readonly pending = new Map<object, Made>()
  private readonly keys = new WeakMap<object, object>()
  private readonly pushers: Pushers = new Map()
  private taps: Tap[] = []
  private held: Vec3[] = []
  /** The first sentence a verb or w threw, kept even when the walkthrough's code caught it: the run stops with it at the end of the frame, and every later call throws it again. */
  private kept: Mistake | null = null

  constructor(
    readonly room: Room,
    code: WalkCode,
    readonly runtime: WalkRuntime,
    readonly opts: WalkOptions,
  ) {
    const sim = room.sim
    runtime.seed(sim.world.seed)
    this.foresight = new Foresight(room)
    this.states = sim.world.players.map((p) => ({ seat: p.seat, hold: { sx: 0, sy: 0, a: false, b: false }, before: { a: false, b: false }, stick: null, planner: new Planner(room, p.seat, this.foresight), high: new HighPlanner(room, p.seat, this.foresight) }))
    const turn = () => runtime.budget.turn()
    const bots: Bot[] = []
    this.handles = new Handles(sim, {
      acts: false,
      player: (seat, reads) => {
        const bot = face('bot', { ...reads, ...this.keeping(this.verbs(this.states[seat])) }, turn, null) as Bot
        bots[seat] = bot
        return bot
      },
      refuse: WALK_MISTAKES.readOnly,
      turn,
      note: () => {},
      started: () => {},
    })
    this.bots = Object.freeze(bots)
    // The room's own calls on its w are refused by name, so a walkthrough that reaches for w.players hears whose call it is.
    const calls = Object.keys(WALK_WORLD_REF)
    this.w = face('w', this.keeping(this.world()), turn, { keys: Object.keys(WORLD_REF).filter((k) => !calls.includes(k)), sentence: (key) => WALK_MISTAKES.roomCall(key, calls) })
    this.gen = this.made('the walkthrough', () => code(this.bots, this.w))
    this.pending.delete(this.keys.get(this.gen) as object)
  }

  /** Planning done so far, for measuring: plans made and decisions tried, over every bot. */
  get searched(): { plans: number; expansions: number; graphs: number; asked: number } {
    const sum = (f: (p: Planner | HighPlanner) => number) => this.states.reduce((n, b) => n + f(b.planner) + f(b.high), 0)
    return { plans: sum((p) => p.plans), expansions: sum((p) => p.expansions), graphs: this.foresight.built, asked: this.foresight.asked }
  }

  /**
   * What the bots hold this frame: steps the walkthrough until it yields. Call it once before each
   * stepRoom. Once the run has stopped, every pad is let go.
   */
  input(): FrameInput {
    const w = this.room.world
    for (const s of this.states) {
      s.hold.sx = 0
      s.hold.sy = 0
      s.hold.a = false
      s.hold.b = false
    }
    this.taps = []
    this.held = []
    // What the last frame's step did: a thing pushed along by a bot that was not pushing it is kept with where it went.
    for (const s of this.states) {
      const id = this.me(s).pushing
      if (id === null || this.pushers.get(id)?.has(s.seat) === true) continue
      const at = thingById(this.sim, id).at
      const known = this.bumps.get(id)
      if (known === undefined) this.bumps.set(id, { seat: s.seat, from: [...at], to: [...at] })
      else known.to = [...at]
    }
    if (this.state === 'playing' && w.end !== null) {
      this.state = 'ended'
      this.close()
    }
    if (this.state === 'playing') {
      this.frames += 1
      this.runtime.startFrame()
      try {
        const ended = this.gen.next().done === true
        // A sentence the walkthrough's code caught still stops it.
        if (this.kept !== null) throw this.kept
        // A call made without yield* is caught at the end of its frame, also when the code ended in it.
        let unstarted: Made | null = null
        for (const m of this.pending.values()) if (!m.adopted) unstarted = m
        if (unstarted !== null) {
          // Its stack is the call's, so the sentence names the walkthrough's line where it was made.
          const mistake = new Mistake(WALK_MISTAKES.notYielded(unstarted.call))
          mistake.stack = unstarted.at.stack
          throw mistake
        }
        if (ended) this.state = 'done'
      } catch (err) {
        this.state = 'stopped'
        // The first sentence kept comes before what the code did after catching it (a loop that then spent its budget, say).
        this.sentence = walkSentence(this.kept ?? err)
        this.close()
      }
    }
    const pads: Pad[] = this.states.map((s) => {
      if (this.opts.still === s.seat) return STILL_PAD
      const pad: Pad = { stick: [s.hold.sx, s.hold.sy], a: { held: s.hold.a, pressed: s.hold.a && !s.before.a }, b: { held: s.hold.b, pressed: s.hold.b && !s.before.b } }
      s.before.a = s.hold.a
      s.before.b = s.hold.b
      return pad
    })
    const idle = pads.every((p) => p.stick[0] === 0 && p.stick[1] === 0 && !p.a.held && !p.b.held) && this.taps.length === 0 && this.held.length === 0
    if (this.state === 'playing' && idle) this.waitSecs += DT
    return { pads, pointing: { taps: this.taps, held: this.held }, help: false }
  }

  /**
   * The things the bots walked into and pushed along BUMP_LEAST m or more without a push of their own,
   * each said as the trial adds it to a room left unfinished: the walkthrough's author cannot see
   * them, and children walking the same way would push them too.
   */
  bumped(): string[] {
    const high = this.sim.world.view === 'high'
    const said = (v: Vec3) => (high ? `${tenth(v[0])}, ${tenth(v[2])}` : `${tenth(v[0])}, ${tenth(v[1])}`)
    return [...this.bumps.entries()]
      .filter(([, b]) => Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2]) >= BUMP_LEAST)
      .map(([id, b]) => WALK_MISTAKES.bumped(b.seat, this.room.describe(id), said(b.from), said(b.to)))
  }

  /**
   * The calls the walkthrough made REPEAT_LEAST times or more since the last step turned done, the
   * most made first, said as the trial adds them to a walkthrough still playing at the cut: such a
   * walkthrough is often a loop whose calls the room never answers.
   */
  repeated(): string[] {
    const done = this.sim.world.steps.flatMap((s) => (s.doneAt === null ? [] : [s.doneAt]))
    const since = done.length === 0 ? 0 : Math.max(...done)
    const counts = new Map<string, number>()
    for (const c of this.started) if (c.t >= since) counts.set(c.call, (counts.get(c.call) ?? 0) + 1)
    const most = [...counts.entries()].filter(([, n]) => n >= REPEAT_LEAST).sort((a, b) => b[1] - a[1]).slice(0, REPEAT_NAMED)
    return most.length === 0 ? [] : [WALK_MISTAKES.repeated(most.map(([call, n]) => `${call} ${n} times`), done.length, tenth(since))]
  }

  /** Stops the walkthrough where it is (its calls let go of what they hold). */
  private close(): void {
    try {
      this.gen.return(undefined)
    } catch {
      // A walkthrough that throws while it is stopped is stopped all the same.
    }
  }

  /** Keeps the first walkthrough sentence thrown (a Mistake), whoever catches it after. */
  private keep(err: unknown): void {
    if (this.kept === null && err instanceof Mistake) this.kept = err
  }

  /** Each of `calls`, keeping the sentence it throws, and refused with the kept one once there is one. */
  private keeping<T extends object>(calls: T): T {
    const out: Record<string, unknown> = {}
    for (const [key, call] of Object.entries(calls)) {
      out[key] = (...args: unknown[]) => {
        if (this.kept !== null) throw this.kept
        try {
          return (call as (...a: unknown[]) => unknown)(...args)
        } catch (err) {
          this.keep(err)
          throw err
        }
      }
    }
    return out as T
  }

  /** A run a verb makes, known until it starts, so one called without yield* is caught; the sentence it throws is kept. */
  private made<T>(call: string, body: () => Run<T>): Run<T> {
    const entry: Made = { call, at: new Error(call), adopted: false }
    const pending = this.pending
    const key = {}
    const self = this
    const gen = (function* (): Run<T> {
      pending.delete(key)
      self.started.push({ call, t: self.sim.world.t })
      if (self.kept !== null) throw self.kept
      try {
        return yield* body()
      } catch (err) {
        self.keep(err)
        throw err
      }
    })()
    pending.set(key, entry)
    this.keys.set(gen, key)
    return gen
  }

  // ------------------------------------------------------------------------------ what the walkthrough reads

  private get sim(): Sim {
    return this.room.sim
  }

  /** A target as made code gave it: a point, or a handle of this walkthrough's view (a bot too). */
  private target(call: string, v: unknown): Vec3 | HandleId {
    if (Array.isArray(v)) return point(call, 'target', v)
    const id = this.handles.idOf(v)
    if (id === null) throw new Mistake(MISTAKES.notHandle(call, 'target', 'a point [x, y, z], a handle from w.get, or a bot'))
    return id
  }

  /** A target as a sentence names it. */
  private describe(t: Vec3 | HandleId): string {
    // A place as the view says it: x, y from the side, x, y, z from high up.
    const place = (v: readonly number[]) => (this.high ? placeHigh(v[0], v[1], v[2]) : `${tenth(v[0])}, ${tenth(v[1])}`)
    if (typeof t !== 'number') return place(t)
    const where = whereOf(this.sim, t)
    const at = pointOf(this.sim, t)
    if (where.kind === 'player') return `bot ${this.room.world.players[where.i].seat} at ${place(at)}`
    const name = [...this.room.made.names].find(([, id]) => id === t)
    return `the ${KIND_WORD[where.kind]}${name === undefined ? '' : ` '${name[0]}'`} at ${place(at)}`
  }

  /** Whether the room is seen from high up: goTo, carry and push plan over the floor then (trial/highSearch.ts). */
  private get high(): boolean {
    return this.room.world.view === 'high'
  }

  /** The box of a handle from high up, in the room as `s` holds it: what reach is measured to, in x, y and z. */
  private boxOf3(s: Sim, id: HandleId): Box3 {
    const where = whereOf(s, id)
    const w = s.world
    const grow = (c: Vec3, hx: number, hy: number, hz: number): Box3 => ({ x0: c[0] - hx, y0: c[1] - hy, z0: c[2] - hz, x1: c[0] + hx, y1: c[1] + hy, z1: c[2] + hz })
    const ofSolid = (i: number): Box3 => {
      const o = s.outlines[i]
      return { x0: o.minX, y0: o.y0, z0: o.minY, x1: o.maxX, y1: o.y1, z1: o.maxY }
    }
    switch (where.kind) {
      case 'player':
        return playerBox3(w.players[where.i], emptyBox3())
      case 'thing':
        return thingBox3(w.things[where.i], emptyBox3())
      case 'solid':
        return ofSolid(where.i)
      case 'mover': {
        const out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity }
        w.solids.forEach((sol, i) => {
          if (sol.mover !== id) return
          const b = ofSolid(i)
          out.x0 = Math.min(out.x0, b.x0)
          out.y0 = Math.min(out.y0, b.y0)
          out.z0 = Math.min(out.z0, b.z0)
          out.x1 = Math.max(out.x1, b.x1)
          out.y1 = Math.max(out.y1, b.y1)
          out.z1 = Math.max(out.z1, b.z1)
        })
        return out.x0 === Infinity ? grow(w.movers[where.i].at, 0.2, 0.2, 0.2) : out
      }
      case 'decor': {
        const d = w.decor[where.i]
        const b = w.models[d.model].bounds
        const at = roomPoint(s, d.at, d.mover)
        return { x0: at[0] + b.min[0] * d.scale, y0: at[1] + b.min[1] * d.scale, z0: at[2] + b.min[2] * d.scale, x1: at[0] + b.max[0] * d.scale, y1: at[1] + b.max[1] * d.scale, z1: at[2] + b.max[2] * d.scale }
      }
      case 'zone': {
        const z = w.zones[where.i]
        return grow(roomPoint(s, z.at, z.mover), z.size[0] / 2, z.size[1] / 2, z.size[2] / 2)
      }
      case 'lamp':
        return grow(roomPoint(s, w.lamps[where.i].at, w.lamps[where.i].mover), 0.3, 0.3, 0.3)
      case 'sign':
        return grow(roomPoint(s, w.signs[where.i].at, w.signs[where.i].mover), SIZES.signHeight, SIZES.signHeight / 2, 0.1)
    }
  }

  /** The box of a handle, in the room as `s` holds it: what reach is measured to. */
  private boxOf(s: Sim, id: HandleId): Box {
    const where = whereOf(s, id)
    const w = s.world
    const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    switch (where.kind) {
      case 'player':
        return playerBox(w.players[where.i], box)
      case 'thing':
        return thingBox(w.things[where.i], box)
      case 'solid': {
        const o = s.outlines[where.i]
        return { x0: o.minX, y0: o.minY, x1: o.maxX, y1: o.maxY }
      }
      case 'mover': {
        const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
        w.solids.forEach((sol, i) => {
          if (sol.mover !== id) return
          const o = s.outlines[i]
          out.x0 = Math.min(out.x0, o.minX)
          out.y0 = Math.min(out.y0, o.minY)
          out.x1 = Math.max(out.x1, o.maxX)
          out.y1 = Math.max(out.y1, o.maxY)
        })
        if (out.x0 === Infinity) {
          const m = w.movers[where.i]
          return { x0: m.at[0] - 0.2, y0: m.at[1] - 0.2, x1: m.at[0] + 0.2, y1: m.at[1] + 0.2 }
        }
        return out
      }
      case 'decor': {
        const d = w.decor[where.i]
        const b = w.models[d.model].bounds
        const at = roomPoint(s, d.at, d.mover)
        return { x0: at[0] + b.min[0] * d.scale, y0: at[1] + b.min[1] * d.scale, x1: at[0] + b.max[0] * d.scale, y1: at[1] + b.max[1] * d.scale }
      }
      case 'zone': {
        const z = w.zones[where.i]
        const at = roomPoint(s, z.at, z.mover)
        return { x0: at[0] - z.size[0] / 2, y0: at[1] - z.size[1] / 2, x1: at[0] + z.size[0] / 2, y1: at[1] + z.size[1] / 2 }
      }
      case 'lamp': {
        const at = roomPoint(s, w.lamps[where.i].at, w.lamps[where.i].mover)
        return { x0: at[0] - 0.3, y0: at[1] - 0.3, x1: at[0] + 0.3, y1: at[1] + 0.3 }
      }
      case 'sign': {
        const at = roomPoint(s, w.signs[where.i].at, w.signs[where.i].mover)
        return { x0: at[0] - SIZES.signHeight, y0: at[1] - SIZES.signHeight / 2, x1: at[0] + SIZES.signHeight, y1: at[1] + SIZES.signHeight / 2 }
      }
    }
  }

  /** Where a tap or a finger on a target lands: a point as given, a handle's middle as it is drawn. */
  private aimAt(t: Vec3 | HandleId): Vec3 {
    if (this.high) {
      // From high up a tap lands on what is drawn: a point as given, a handle's middle (engine/floor.ts tapTargetFloor takes the handle it is in).
      if (typeof t !== 'number') return [t[0], t[1], t[2]]
      const b = this.boxOf3(this.sim, t)
      return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]
    }
    if (typeof t !== 'number') return [t[0], t[1], 0]
    if (whereOf(this.sim, t).kind === 'mover') {
      const solid = this.sim.world.solids.findIndex((s) => s.mover === t && !s.hidden)
      if (solid >= 0) {
        const o = this.sim.outlines[solid]
        return [(o.minX + o.maxX) / 2, (o.minY + o.maxY) / 2, 0]
      }
    }
    const b = this.boxOf(this.sim, t)
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0]
  }

  /** The goal of a goTo to a target, as BOT_REF says it. */
  private goalOf(t: Vec3 | HandleId): Goal | HighGoal {
    const sim = this.sim
    const to = this.describe(t)
    if (this.high) {
      if (typeof t !== 'number') return pointGoalHigh(sim, t, GOTO.near, to)
      const reach = () => reachGoalHigh((s) => this.boxOf3(s, t), to)
      switch (whereOf(sim, t).kind) {
        case 'zone':
          return zoneGoalHigh(sim, t, to)
        case 'solid':
          return sim.listens[t].use ? reach() : standGoalHigh([t], to)
        case 'mover':
          return sim.listens[t].use ? reach() : standGoalHigh(sim.world.solids.filter((s) => s.mover === t).map((s) => s.id), to)
        default:
          return reach()
      }
    }
    if (typeof t !== 'number') return pointGoal(sim, t, GOTO.near, to)
    const where = whereOf(sim, t)
    const reach = () => reachGoal((s) => this.boxOf(s, t), to)
    switch (where.kind) {
      case 'zone':
        return zoneGoal(sim, t, to)
      case 'solid':
        return sim.listens[t].use ? reach() : standGoal([t], to)
      case 'mover':
        return sim.listens[t].use ? reach() : standGoal(sim.world.solids.filter((s) => s.mover === t).map((s) => s.id), to)
      default:
        return reach()
    }
  }

  /** Whether a thing whose foot is at `at`, resting on `on`, is where a carry takes it, as BOT_REF says it. */
  private thereOf(t: Vec3 | HandleId): ThereTest {
    if (this.high) {
      const box3 = (th: Thing, at: Vec3): Box3 => ({ x0: at[0] + th.box.min[0], y0: at[1] + th.box.min[1], z0: at[2] + th.box.min[2], x1: at[0] + th.box.max[0], y1: at[1] + th.box.max[1], z1: at[2] + th.box.max[2] })
      if (typeof t !== 'number') return (_, __, at) => (at[0] - t[0]) ** 2 + (at[1] - t[1]) ** 2 + (at[2] - t[2]) ** 2 <= GOTO.leave * GOTO.leave
      // A zone: its middle over the zone's floor, so it stays in the zone as it settles among what is already there.
      if (whereOf(this.sim, t).kind === 'zone')
        return (s, th, at) => {
          const z = this.boxOf3(s, t)
          const b = box3(th, at)
          const mx = (b.x0 + b.x1) / 2
          const mz = (b.z0 + b.z1) / 2
          return mx > z.x0 && mx < z.x1 && mz > z.z0 && mz < z.z1 && b.y0 < z.y1 && b.y1 > z.y0
        }
      const ids = new Set(whereOf(this.sim, t).kind === 'mover' ? this.sim.world.solids.filter((s) => s.mover === t).map((s) => s.id) : [t])
      return (s, th, at, on) => (on !== null && ids.has(on)) || gap3(box3(th, at), this.boxOf3(s, t)) <= GOTO.leave
    }
    if (typeof t !== 'number') {
      return (_, __, at) => {
        const dx = at[0] - t[0]
        const dy = at[1] - t[1]
        return dx * dx + dy * dy <= GOTO.leave * GOTO.leave
      }
    }
    const where = whereOf(this.sim, t)
    const box = (th: Thing, at: Vec3): Box => ({ x0: at[0] + th.box.min[0], y0: at[1] + th.box.min[1], x1: at[0] + th.box.max[0], y1: at[1] + th.box.max[1] })
    if (where.kind === 'zone') return (s, th, at) => overlapsBox(box(th, at), this.boxOf(s, t))
    const ids = new Set(where.kind === 'mover' ? this.sim.world.solids.filter((s) => s.mover === t).map((s) => s.id) : [t])
    return (s, th, at, on) => (on !== null && ids.has(on)) || boxGap(box(th, at), this.boxOf(s, t)) <= GOTO.leave
  }

  /** Whether the thing is where a carry or a push takes it now. */
  private thereNow(id: HandleId, t: Vec3 | HandleId, across: boolean): boolean {
    const th = this.sim.world.things[whereOf(this.sim, id).i]
    if (typeof t !== 'number') {
      const mid = th.at[0] + (th.box.min[0] + th.box.max[0]) / 2
      // From high up a push takes it within GOTO.leave across the floor, x and z.
      const midZ = th.at[2] + (th.box.min[2] + th.box.max[2]) / 2
      if (across && this.high) return (mid - t[0]) ** 2 + (midZ - t[2]) ** 2 <= GOTO.leave * GOTO.leave
      return across ? Math.abs(mid - t[0]) <= GOTO.leave : this.thereOf(t)(this.sim, th, th.at, th.on)
    }
    if (whereOf(this.sim, t).kind === 'zone') return this.sim.world.zones[whereOf(this.sim, t).i].inside.includes(id)
    return this.thereOf(t)(this.sim, th, th.at, th.on)
  }

  private thing(id: HandleId): Thing {
    return this.sim.world.things[whereOf(this.sim, id).i]
  }

  /** A thing as a sentence names it: its name in quotes, else what and where it is. */
  private thingLabel(id: HandleId): string {
    const name = this.thing(id).name
    return name === null ? this.describe(id) : `'${name}'`
  }

  /** Whether something with use (a thing or a solid) is within USE_NEAR of a point, so where a carry sets a thing down is worth naming. */
  private useNear(at: Vec3): boolean {
    const sim = this.sim
    if (this.high) {
      const near3 = (b: Box3) => b.x0 - USE_NEAR < at[0] && b.x1 + USE_NEAR > at[0] && b.y0 - USE_NEAR < at[1] && b.y1 + USE_NEAR > at[1] && b.z0 - USE_NEAR < at[2] && b.z1 + USE_NEAR > at[2]
      return [...sim.world.things.map((t) => t.id), ...sim.world.solids.map((t) => t.id), ...sim.world.movers.map((m) => m.id)].some((id) => sim.listens[id].use && near3(this.boxOf3(sim, id)))
    }
    const near = (b: Box) => b.x0 - USE_NEAR < at[0] && b.x1 + USE_NEAR > at[0] && b.y0 - USE_NEAR < at[1] && b.y1 + USE_NEAR > at[1]
    return [...sim.world.things.map((t) => t.id), ...sim.world.solids.map((t) => t.id), ...sim.world.movers.map((m) => m.id)].some((id) => sim.listens[id].use && near(this.boxOf(sim, id)))
  }

  /**
   * Why a pushed thing does not move: when the pushers weigh less than it, its weight against theirs;
   * else what stands at its leading side (pushing `dir`): a solid by its name, its x and its top,
   * another thing, or the box's edge.
   */
  private stuck(label: string, t: Thing, dir: 1 | -1, seats: readonly SeatIndex[]): string {
    const sim = this.sim
    const players = sim.world.players
    let weight = 0
    for (const seat of seats) {
      const change = players[seat].change
      weight += change === null ? 1 : change.weight
    }
    if (weight < t.weight - 1e-9) return WALK_MISTAKES.pushStuck(label, t.weight, seats.length, tenth(weight))
    const box = thingBox(t, { x0: 0, y0: 0, x1: 0, y1: 0 })
    const front = dir > 0 ? box.x1 : box.x0
    // What touches the leading side, at the thing's height (resting on it does not count).
    const touches = (b: Box) => b.y0 < box.y1 - 0.02 && b.y1 > box.y0 + 0.02 && (dir > 0 ? b.x0 >= front - 0.05 && b.x0 <= front + 0.1 : b.x1 <= front + 0.05 && b.x1 >= front - 0.1)
    for (let i = 0; i < sim.world.solids.length; i++) {
      const sol = sim.world.solids[i]
      const o = sim.outlines[i]
      const b = { x0: o.minX, y0: o.minY, x1: o.maxX, y1: o.maxY }
      if (!solidActive(sim, sol) || sol.surface.through || !touches(b)) continue
      return WALK_MISTAKES.pushBlocked(label, `${this.room.describe(sol.id)} (x ${tenth(b.x0)} to ${tenth(b.x1)}) stands in its way up to y ${tenth(b.y1)}`)
    }
    for (const other of sim.world.things) {
      if (other.id === t.id || other.hidden || other.heldBy !== null || !touches(thingBox(other, { x0: 0, y0: 0, x1: 0, y1: 0 }))) continue
      return WALK_MISTAKES.pushBlocked(label, `${this.thingLabel(other.id)}, weighing ${other.weight}, stands in its way`)
    }
    const edge = dir > 0 ? sim.world.bounds.max[0] : sim.world.bounds.min[0]
    if (Math.abs(front - edge) <= 0.1) return WALK_MISTAKES.pushBlocked(label, `the box's edge at x ${tenth(edge)} stands in its way`)
    return WALK_MISTAKES.pushBlocked(label, `something stops it at x ${tenth(front)}`)
  }

  private me(s: BotState): Player {
    return this.sim.world.players[s.seat]
  }

  /** The button whose job is grab, or null. */
  private grabButton(p: Player): ButtonName | null {
    return p.a === 'grab' ? 'a' : p.b === 'grab' ? 'b' : null
  }

  // ------------------------------------------------------------------------------ the verbs' steps

  /** Takes the bot's stick for `owner`, waiting while another call has it. */
  private *takeStick(s: BotState, owner: object): Run {
    while (s.stick !== null && s.stick !== owner) yield
    s.stick = owner
  }

  private letGo(s: BotState, owner: object): void {
    if (s.stick === owner) s.stick = null
  }

  /** Follows plans to the goal until the bot is there; throws the search's sentence when there is no way. */
  private *follow(s: BotState, goal: Goal | HighGoal): Run {
    const sim = this.sim
    let moving = 0
    let plan: Plan | null = null
    for (;;) {
      const p = this.me(s)
      if (goal.met(sim, p)) return
      // GOTO.secs of moving at a time; standing still for a solid that moves to come, or to carry it, is not moving.
      if (moving * DT > GOTO.secs) throw new Mistake(WALK_MISTAKES.tooFar(s.seat, goal.to))
      let i: number = plan === null ? -1 : sim.world.frame - plan.start - 1
      const aim = goal.aim(sim)
      const strayed = plan !== null && i >= 0 && (Math.abs(p.at[0] - plan.x[i]) > SEARCH.stray || Math.abs(p.at[1] - plan.y[i]) > SEARCH.stray || Math.abs(p.at[2] - plan.z[i]) > SEARCH.stray || (p.on === null) !== (plan.on[i] === null))
      let again = plan === null || i + 1 >= plan.x.length || strayed || roomKey(sim, s.seat, 'plan') !== plan.roomKey || moved(aim, plan.aim) > GOTO.near * GOTO.near
      if (again && plan !== null && i + 1 < plan.x.length && strayed === false) {
        // The room changed or the target moved: the plan stands if its rest still goes where it went.
        const kept: Plan | null = goal.view === 'high' ? s.high.recheck(plan, i + 1, goal) : s.planner.recheck(plan, i + 1, goal)
        if (kept !== null) {
          plan = kept
          again = false
        }
      }
      if (again) {
        try {
          plan = goal.view === 'high' ? s.high.plan(goal) : s.planner.plan(goal)
        } catch (err) {
          // A body still moving (falling, sliding, carried) is planned for again once it stands.
          if (settled(p)) throw err
          plan = null
          yield
          continue
        }
        i = -1
      }
      const next = plan as Plan
      const f = i + 1
      if (!next.waits) moving += 1
      s.hold.sx = next.sx[f]
      s.hold.sy = next.sy[f]
      const jump = p.a === 'jump' ? 'a' : p.b === 'jump' ? 'b' : null
      if (jump !== null && next.jump[f]) s.hold[jump] = true
      yield
    }
  }

  /** A press: the button down for the press's frames but the last, up on the last (and up a frame first if it was down). */
  private *pressFrames(s: BotState, button: ButtonName, stickFree: boolean): Run {
    if (s.before[button]) yield
    const frames = Math.max(2, Math.round(BOT_TIMES.press / DT))
    for (let f = 0; f < frames; f++) {
      if (f < frames - 1) s.hold[button] = true
      if (stickFree) {
        s.hold.sx = 0
        s.hold.sy = 0
      }
      yield
    }
  }

  // ------------------------------------------------------------------------------ the bot's verbs

  private verbs(s: BotState): Omit<Bot, keyof import('../engine/api').PlayerView> {
    const name = (verb: string) => `bots[${s.seat}].${verb}(...)`
    const still = () => this.opts.still === s.seat
    const button = (call: string, v: unknown): ButtonName => {
      if (v !== 'a' && v !== 'b') throw new Mistake(MISTAKES.notChoice(call, 'button', typeof v === 'string' ? `'${v}'` : String(v), ['a', 'b']))
      return v
    }
    const self = this
    return {
      goTo: (target: unknown) => {
        const t = this.target('bot.goTo', target)
        return this.made(name('goTo'), function* (): Run {
          if (still()) return
          const owner = {}
          yield* self.takeStick(s, owner)
          try {
            yield* self.follow(s, self.goalOf(t))
          } finally {
            self.letGo(s, owner)
          }
        })
      },
      press: (b: unknown) => {
        const which = button('bot.press', b)
        return this.made(name('press'), function* (): Run {
          yield* self.pressFrames(s, which, false)
        })
      },
      hold: (b: unknown, secs: unknown) => {
        const which = button('bot.hold', b)
        const frames = Math.round(Math.max(0, num('bot.hold', 'secs', secs)) / DT)
        return this.made(name('hold'), function* (): Run {
          for (let f = 0; f < frames; f++) {
            s.hold[which] = true
            yield
          }
        })
      },
      steer: (dir: unknown, secs: unknown) => {
        if (!Array.isArray(dir) || dir.length !== 2) throw new Mistake(WALK_MISTAKES.notDir())
        const sx = Math.max(-1, Math.min(1, num('bot.steer', 'dir', dir[0])))
        const sy = Math.max(-1, Math.min(1, num('bot.steer', 'dir', dir[1])))
        const frames = Math.round(Math.max(0, num('bot.steer', 'secs', secs)) / DT)
        return this.made(name('steer'), function* (): Run {
          const owner = {}
          yield* self.takeStick(s, owner)
          try {
            for (let f = 0; f < frames; f++) {
              s.hold.sx = sx
              s.hold.sy = sy
              yield
            }
          } finally {
            self.letGo(s, owner)
          }
        })
      },
      carry: (thing: unknown, to: unknown) => {
        const id = this.handles.idOfKind('bot.carry', 'thing', thing, ['thing'], 'a thing')
        const t = this.target('bot.carry', to)
        return this.made(name('carry'), () => this.carry(s, id, t))
      },
      push: (thing: unknown, to: unknown) => {
        const id = this.handles.idOfKind('bot.push', 'thing', thing, ['thing'], 'a thing')
        const t = this.target('bot.push', to)
        return this.made(name('push'), () => this.push(s, id, t))
      },
    }
  }

  private *carry(s: BotState, id: HandleId, to: Vec3 | HandleId): Run<boolean> {
    if (this.opts.still === s.seat) return false
    const th = () => this.thing(id)
    const label = this.thingLabel(id)
    if (th().weight > FEEL.carryMax) throw new Mistake(WALK_MISTAKES.tooHeavy(label, th().weight))
    // Grab uses a thing with use and never carries it (THING_OPTS_REF.use).
    if (this.sim.listens[id].use) throw new Mistake(WALK_MISTAKES.hasUse(label))
    const grab = this.grabButton(this.me(s))
    if (grab === null) throw new Mistake(WALK_MISTAKES.noGrab(s.seat))
    const owner = {}
    yield* this.takeStick(s, owner)
    try {
      // Picks it up: where a press of grab takes this thing, and no other.
      for (let tries = 0; this.me(s).holding !== id; tries++) {
        const t = th()
        if (t.hidden || (t.heldBy !== null && t.heldBy !== s.seat)) return false
        if (tries >= PICK_TRIES) throw new Mistake(WALK_MISTAKES.notPicked(s.seat, label, PICK_TRIES))
        const held = this.me(s).holding
        if (held !== null) {
          // Hands full of something else: set it down first, where grab does not use something instead.
          if ((this.high ? grabChoiceFloor(this.sim, this.me(s)) : grabChoice(this.sim, this.me(s))) !== null) throw new Mistake(WALK_MISTAKES.handsFull(s.seat, this.thingLabel(held), label))
          yield* this.pressFrames(s, grab, true)
          continue
        }
        yield* this.follow(s, this.high ? grabGoalHigh(this.sim, this.me(s), id, this.describe(id)) : grabGoal(this.sim, this.me(s), id, this.describe(id)))
        yield* this.pressFrames(s, grab, true)
      }
      // Carries it where a press of grab sets it down so that it comes to rest there, and uses nothing instead. Once the room
      // takes it from the bot's hands on the way (a zone hid it or put it somewhere), the carry ends there.
      const taken = (goal: Goal | HighGoal): Goal | HighGoal => ({ ...goal, met: (sim: Sim, p: Player) => p.holding !== id || goal.met(sim, p) }) as Goal | HighGoal
      const there = this.thereOf(to)
      const aimAt = this.aimAt(to)
      const toLabel = this.useNear(aimAt) ? `${this.describe(to)}, set down where nothing with use is within reach` : this.describe(to)
      if (this.high) {
        // From high up it is set down ahead the way the bot faces: it turns with the lightest touch of the stick (past 0.2, which turns and barely walks), then lets go.
        const b = typeof to === 'number' ? this.boxOf3(this.sim, to) : null
        const near = (b === null ? GOTO.leave : Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2) + 1.5
        yield* this.follow(s, taken(putGoalHigh(this.sim, this.me(s), id, there, () => [aimAt[0], aimAt[2]], near, toLabel)))
        if (this.me(s).holding !== id) return th().hidden || this.thereNow(id, to, false)
        const p = this.me(s)
        const lands = ([hx, hz]: [number, number]) => {
          const l = landingHigh(this.sim, p, th(), hx, hz)
          return l !== null && there(this.sim, th(), l.at, l.on)
        }
        const ways = putHeadings(p, [aimAt[0], aimAt[2]])
        const turn = lands(ways[0]) ? null : ways.find(lands)
        if (turn !== undefined && turn !== null) {
          s.hold.sx = turn[0] * 0.25
          s.hold.sy = -turn[1] * 0.25
          yield
        }
      } else {
        yield* this.follow(s, taken(putGoal(this.sim, this.me(s), id, there, () => [aimAt[0], aimAt[1]], toLabel)))
        if (this.me(s).holding !== id) return th().hidden || this.thereNow(id, to, false)
        const p = this.me(s)
        const lands = (dir: 1 | -1) => {
          const l = landing(this.sim, p, th(), dir)
          return l !== null && there(this.sim, th(), l.at, l.on)
        }
        if (!lands(p.facing) && lands(p.facing === 1 ? -1 : 1)) {
          // Turns round with the lightest touch of the stick, then lets it go.
          s.hold.sx = p.facing === 1 ? -0.25 : 0.25
          yield
        }
      }
      yield* this.pressFrames(s, grab, true)
      for (let f = 0; f < 120; f++) {
        const t = th()
        if (t.hidden || t.heldBy !== null || (t.on !== null && Math.abs(t.velocity[0]) < 0.05 && Math.abs(t.velocity[1]) < 0.05)) break
        yield
      }
      return th().hidden || (th().heldBy === null && this.thereNow(id, to, false))
    } finally {
      this.letGo(s, owner)
    }
  }

  private *push(s: BotState, id: HandleId, to: Vec3 | HandleId): Run<boolean> {
    if (this.opts.still === s.seat) return false
    if (this.high) return yield* this.pushHigh(s, id, to)
    const th = () => this.thing(id)
    const label = this.thingLabel(id)
    const goalX = typeof to === 'number' ? this.aimAt(to)[0] : to[0]
    const owner = {}
    yield* this.takeStick(s, owner)
    let mine = this.pushers.get(id)
    if (mine === undefined) {
      mine = new Map()
      this.pushers.set(id, mine)
    }
    const pushers = mine
    pushers.set(s.seat, false)
    try {
      let lastX = Infinity
      let stillSince = this.sim.world.t
      for (;;) {
        const t = th()
        if (t.hidden || t.heldBy !== null) return false
        if (this.thereNow(id, to, true)) return true
        const mid = t.at[0] + (t.box.min[0] + t.box.max[0]) / 2
        const dir = goalX >= mid ? 1 : -1
        const side = sideGoal(this.sim, id, dir, this.describe(id))
        if (!side.met(this.sim, this.me(s))) {
          pushers.set(s.seat, false)
          yield* this.follow(s, side)
          lastX = Infinity
          continue
        }
        pushers.set(s.seat, true)
        // The stuck clock runs only while everyone pushing this thing pushes it.
        const now = this.sim.world.t
        const all = [...pushers.values()].every((v) => v)
        if (Math.abs(mid - lastX) > 0.005 || !all) {
          lastX = mid
          stillSince = now
        } else if (now - stillSince >= GOTO.stuckSecs) throw new Mistake(this.stuck(label, t, dir, [...pushers.keys()]))
        s.hold.sx = dir
        s.hold.sy = 0
        yield
      }
    } finally {
      pushers.delete(s.seat)
      this.letGo(s, owner)
    }
  }

  /**
   * push from high up: goTo just behind the thing on the line from where it goes, then walk it there
   * with the stick toward the target from its middle (a pusher pushes the way they walk), going round
   * again when it slides off the line. Stuck as from the side.
   */
  private *pushHigh(s: BotState, id: HandleId, to: Vec3 | HandleId): Run<boolean> {
    const th = () => this.thing(id)
    const label = this.thingLabel(id)
    const goal = typeof to === 'number' ? this.aimAt(to) : to
    const middle = (): [number, number] => {
      const t = th()
      return [t.at[0] + (t.box.min[0] + t.box.max[0]) / 2, t.at[2] + (t.box.min[2] + t.box.max[2]) / 2]
    }
    const way = (): [number, number] => {
      const [mx, mz] = middle()
      const d = Math.sqrt((goal[0] - mx) ** 2 + (goal[2] - mz) ** 2)
      return d < 1e-6 ? [1, 0] : [(goal[0] - mx) / d, (goal[2] - mz) / d]
    }
    const owner = {}
    yield* this.takeStick(s, owner)
    let mine = this.pushers.get(id)
    if (mine === undefined) {
      mine = new Map()
      this.pushers.set(id, mine)
    }
    const pushers = mine
    pushers.set(s.seat, false)
    try {
      let last: [number, number] = [Infinity, Infinity]
      let stillSince = this.sim.world.t
      for (;;) {
        const t = th()
        if (t.hidden || t.heldBy !== null) return false
        if (this.thereNow(id, to, true)) return true
        const [ux, uz] = way()
        const behind = behindGoalHigh(this.sim, this.me(s), id, way, this.describe(id))
        if (!behind.met(this.sim, this.me(s))) {
          pushers.set(s.seat, false)
          yield* this.follow(s, behind)
          last = [Infinity, Infinity]
          continue
        }
        pushers.set(s.seat, true)
        const now = this.sim.world.t
        const mid = middle()
        const all = [...pushers.values()].every((v) => v)
        if ((mid[0] - last[0]) ** 2 + (mid[1] - last[1]) ** 2 > 0.005 * 0.005 || !all) {
          last = mid
          stillSince = now
        } else if (now - stillSince >= GOTO.stuckSecs) throw new Mistake(this.stuckHigh(label, t, ux, uz, [...pushers.keys()]))
        s.hold.sx = ux
        s.hold.sy = -uz
        yield
      }
    } finally {
      pushers.delete(s.seat)
      this.letGo(s, owner)
    }
  }

  /** Why a pushed thing does not move from high up, pushed the way (ux, uz): its weight against the pushers', else what stands at its leading side, with where it stands on the floor. */
  private stuckHigh(label: string, t: Thing, ux: number, uz: number, seats: readonly SeatIndex[]): string {
    const sim = this.sim
    let weight = 0
    for (const seat of seats) {
      const change = sim.world.players[seat].change
      weight += change === null ? 1 : change.weight
    }
    if (weight < t.weight - 1e-9) return WALK_MISTAKES.pushStuck(label, t.weight, seats.length, tenth(weight))
    const b = thingBox3(t, emptyBox3())
    // The thin box just ahead of its leading side, at its height (resting on it does not count).
    const ahead: Box3 = { x0: ux > 0.3 ? b.x1 : b.x0, x1: ux < -0.3 ? b.x0 : b.x1, y0: b.y0 + 0.02, y1: b.y1 - 0.02, z0: uz > 0.3 ? b.z1 : b.z0, z1: uz < -0.3 ? b.z0 : b.z1 }
    if (ux > 0.3) ahead.x1 += 0.1
    if (ux < -0.3) ahead.x0 -= 0.1
    if (uz > 0.3) ahead.z1 += 0.1
    if (uz < -0.3) ahead.z0 -= 0.1
    for (let i = 0; i < sim.world.solids.length; i++) {
      const sol = sim.world.solids[i]
      if (!solidActive(sim, sol) || sol.surface.through || !solidInBox3(sim, i, ahead.x0, ahead.y0, ahead.z0, ahead.x1, ahead.y1, ahead.z1)) continue
      const o = sim.outlines[i]
      return WALK_MISTAKES.pushBlocked(label, `${this.room.describe(sol.id)} (x ${tenth(o.minX)} to ${tenth(o.maxX)}, z ${tenth(o.minY)} to ${tenth(o.maxY)}) stands in its way up to y ${tenth(o.y1)}`)
    }
    for (const other of sim.world.things) {
      if (other.id === t.id || other.hidden || other.heldBy !== null || !overlapsBox3(thingBox3(other, emptyBox3()), ahead)) continue
      return WALK_MISTAKES.pushBlocked(label, `${this.thingLabel(other.id)}, weighing ${other.weight}, stands in its way`)
    }
    const bounds = sim.world.bounds
    const edge = ahead.x1 >= bounds.max[0] - 0.05 ? `x ${tenth(bounds.max[0])}` : ahead.x0 <= bounds.min[0] + 0.05 ? `x ${tenth(bounds.min[0])}` : ahead.z1 >= bounds.max[2] - 0.05 ? `z ${tenth(bounds.max[2])}` : ahead.z0 <= bounds.min[2] + 0.05 ? `z ${tenth(bounds.min[2])}` : null
    if (edge !== null) return WALK_MISTAKES.pushBlocked(label, `the box's edge at ${edge} stands in its way`)
    return WALK_MISTAKES.pushBlocked(label, `something stops it at ${placeHigh((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2)}`)
  }

  // ------------------------------------------------------------------------------ w

  private world(): WalkWorld {
    const self = this
    const room = this.room
    return {
      time: () => room.world.t,
      level: () => room.world.level as Level,
      get: (name: unknown) => {
        const id = typeof name === 'string' ? room.made.names.get(name) : undefined
        if (id === undefined) throw new Mistake(WALK_MISTAKES.noName(String(name), [...room.made.names.keys()]))
        return this.handles.of(id) as ReturnType<WalkWorld['get']>
      },
      stepsDone: () => room.world.next,
      wait: (secs: unknown) => {
        const frames = Math.round(Math.max(0, num('w.wait', 'secs', secs)) / DT)
        return this.made('w.wait(...)', function* (): Run {
          for (let f = 0; f < frames; f++) yield
        })
      },
      until: (cond: unknown, secs?: unknown) => {
        const test = fn<() => unknown>('w.until', 'condition', cond)
        const limit = secs === undefined ? UNTIL_SECS : Math.max(0, num('w.until', 'secs', secs))
        return this.made('w.until(...)', function* (): Run {
          const start = room.world.t
          for (;;) {
            if (test()) return
            if (room.world.t - start >= limit - 1e-9) throw new Mistake(WALK_MISTAKES.untilNever(limit))
            yield
          }
        })
      },
      together: (...runs: unknown[]) => {
        for (const r of runs) {
          if (!isRun(r)) throw new Mistake(WALK_MISTAKES.notRun(describeValue(r)))
          const key = this.keys.get(r as object)
          const made = key === undefined ? undefined : this.pending.get(key)
          if (made !== undefined) made.adopted = true
        }
        const list = runs as Run<unknown>[]
        return this.made('w.together(...)', function* (): Run {
          const live = list.map(() => true)
          for (;;) {
            list.forEach((r, i) => {
              if (live[i] && r.next().done === true) live[i] = false
            })
            if (!live.some((v) => v)) return
            yield
          }
        })
      },
      tap: (target: unknown) => {
        const t = this.target('w.tap', target)
        return this.made('w.tap(...)', function* (): Run {
          const frames = Math.max(1, Math.round(BOT_TIMES.tap / DT))
          for (let f = 0; f < frames; f++) {
            if (f === 0) self.taps.push({ at: frozenPoint(self.aimAt(t)) })
            yield
          }
        })
      },
      point: (target: unknown, secs: unknown) => {
        const t = this.target('w.point', target)
        const frames = Math.round(Math.max(0, num('w.point', 'secs', secs)) / DT)
        return this.made('w.point(...)', function* (): Run {
          for (let f = 0; f < frames; f++) {
            self.held.push(self.aimAt(t))
            yield
          }
        })
      },
    }
  }
}

function overlapsBox3(a: Box3, b: Box3): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0
}

function overlapsBox(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

function isRun(v: unknown): boolean {
  return typeof v === 'object' && v !== null && typeof (v as { next?: unknown }).next === 'function' && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
}

function describeValue(v: unknown): string {
  if (v === undefined) return 'nothing (a call already run with yield*?)'
  if (v === null) return 'null'
  return typeof v === 'object' ? 'an object that is not a bot call' : String(v)
}

/** An error from the walkthrough as the sentence the trial keeps, with the walkthrough's line where the browser tells it. */
export function walkSentence(err: unknown): string {
  const said = describeError(err)
  const text = explain(null, err)
  return text === MISTAKES.thrown("the room's code", said) ? WALK_MISTAKES.thrown(said) : text
}

/** How a walkthrough played a room to its end. */
export interface WalkResult {
  /** Seconds of play when it stopped. */
  readonly secs: number
  readonly state: WalkState
  readonly sentence: string | null
  /** Seconds in which every bot stood idle (WalkRun.waitSecs). */
  readonly waitSecs: number
}

/** Plays a room by its walkthrough as fast as it can, until the room ends, the walkthrough stops, or `maxSecs` of play pass. */
export function playWalk(room: Room, code: WalkCode, runtime: WalkRuntime, opts: WalkOptions, maxSecs: number): WalkResult {
  const run = new WalkRun(room, code, runtime, opts)
  const frames = Math.round(maxSecs / DT)
  for (let f = 0; f < frames && room.world.end === null; f++) stepRoom(room, run.input())
  if (run.state === 'playing' && room.world.end !== null) run.input()
  return { secs: room.world.t, state: run.state, sentence: run.sentence, waitSecs: run.waitSecs }
}

