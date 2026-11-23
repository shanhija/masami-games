/**
 * Magic House: the search behind a bot's goTo (trial/api.ts, the notes for step 3; plan.md, Proof
 * before play). A beam search over a copy of the bot's own body, stepped by the very controller the
 * sim moves players with (engine/player.ts movePlayer), against the room held as it stands:
 *
 * - The room ahead is a Shadow: a Sim over a shallow copy of the World whose clock runs ahead. Its
 *   movers are placed each frame by their own places at their own clocks (asked of the room's code,
 *   which must give the same place for the same time, and kept by clock in the Foresight so no time
 *   is asked twice), with the slides and turns under way where they will be; everything else is
 *   where it is now: still solids, loose things, zones and their pulls, the other players and their
 *   heads. A copy of the bot standing on a solid that moves is carried by the solid's change of pose
 *   exactly as the movers' phase carries riders (engine/sim.ts riderFrame, riderAt), and held inside
 *   the room's box as the controller holds every player (the camera's frame never moves, step 7a).
 * - A decision is held for SEARCH.decision frames (0.15 s): the stick left, right or let go, with a
 *   jump pressed now (held to the top, or in the widest attempt also a short hop), pressed at the last
 *   moment the forgiving jump still allows after running off an edge, or none; in the air the stick
 *   only; down to drop through a floor; a fly stick any of eight ways; in the widest attempt also half
 *   the stick, to time a run-up finer than a frame. Every frame of every child is asked whether it is there.
 * - The beam is scored by the floor graph (trial/graph.ts): seconds to go by Dijkstra from the
 *   target, never the straight line, which only breaks ties (and, when boarding a moving solid
 *   finds no way, ties go once more to copies heading onto it: it may stand the other way). A copy in the air is scored by the floor
 *   it left or the best floor it can still come down on, whichever is better, so a good jump looks
 *   good before it lands; a copy riding a solid that moves also by the best floor it could jump to.
 *   The wait for a solid that moves is counted as it will really be, from when the graph says that
 *   solid comes to the spot (boarding it, or leaving it), never Dijkstra's guess. Children alike
 *   enough (feet within 5 cm, speeds, standing, the jump held) keep only the better, and a share of
 *   the beam always stands, so copies falling from an edge never crowd out every copy that stood.
 * - The beam tries narrow first (SEARCH.attempts) and widens only when that finds no way: most ways
 *   cost a twentieth of the widest search. An attempt gives up after its stallSecs with no progress,
 *   GOTO.secs of moving, or SEARCH.expansions decisions.
 * - Solids that move are waited for by plans of their own: where the best way boards one further on,
 *   the search first goes to the spot it boards from; standing there (or riding it), when it comes
 *   more than SEARCH.waitMin from now, the plan is to stand still until just before; when it is due,
 *   the narrow beam alone tries to board or leave it, and the bot stands a moment and tries again.
 * - A plan is the bot's holds frame by frame and where its body will be after each. The bot follows
 *   it (trial/walk.ts), and plans again whenever its real body leaves the plan, the room changes
 *   under it (roomKey) or the target moves; a room that changed away from the way keeps the plan
 *   (recheck plays the plan's rest in the room as it now is).
 * - When no attempt gets there, the bot follows the best way it found that ends standing still and
 *   gets nearer (when the graph has no way at all, only to where it could come back from), or, when
 *   none did, the search says why from the graph (WALK_MISTAKES.noWay, tooFar).
 *
 * From high up (step 6) the search is trial/highSearch.ts's, over trial/highGraph.ts; it uses this
 * file's room ahead (Shadow: carryHigh, moveHigh), foresight, plans, goals' shape and waits for
 * moving solids as they are.
 *
 * Pure plain numbers: no three.js, no Date, no Math.random, and only engine/math.ts's sin and cos,
 * by way of the sim's own transforms.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { FEEL } from '../engine/api'
import { CONTROL, movePlayer } from '../engine/player'
import { Mistake } from '../engine/checks'
import type { Room } from '../engine/room'
import { pushPlayerOutFloor, riderAtFloor, riderFrameFloor } from '../engine/floor'
import { movePlayerFloor } from '../engine/floorPlayer'
import { grabChoice, holdInRoom, pushPlayerOut, putDownAt, riderAt, riderFrame, type MoverPose } from '../engine/sim'
import { DT, easeNumber, easeVec, gatherNear, groundUnder, playerHeight, playerWidth, refreshOutline, roomPoint, solidActive, thingBox, type Box, type Ground, type Sim } from '../engine/state'
import type { HandleId, Mover, Player, Solid, Thing, World } from '../engine/world'
import type { Pad, PadButton } from '../seats/types'
import { GOTO, WALK_MISTAKES } from './api'
import { FloorGraph, GRAPH, leapAt, missingEdge, nextEdge, type Ahead, type Timetable } from './graph'
import { HighGraph } from './highGraph'

/** The search's own numbers. */
export const SEARCH = {
  /** Frames a decision is held: 0.15 s, as a child decides (Pia Jump's bot). */
  decision: 9,
  /** The speed across, m/s, under which a body counts as standing still where it came. */
  settle: 1,
  /**
   * The beam's attempts, narrow first: each keeps `beam` children a decision (`standing` of them at
   * least standing on something) and gives up after `stallSecs` with no progress; the widest also
   * tries the short hop and half the stick. Most ways are found by the first, at a twentieth of the last's cost.
   */
  attempts: [
    { beam: 4, standing: 2, stallSecs: 2, hops: false },
    { beam: 12, standing: 4, stallSecs: 4, hops: false },
    { beam: 32, standing: 10, stallSecs: 12, hops: true },
  ],
  /** The least gain in seconds to go that counts as progress. */
  gain: 0.05,
  /** Decisions tried in one attempt before it gives up. */
  expansions: 12_000,
  /** A wait for a moving solid longer than this, seconds, is a plan of its own to stand still, ending waitLead before it comes. */
  waitMin: 0.5,
  waitLead: 0.4,
  /** How many short waits in a row (each two decisions) the narrow beam alone may try near a moving solid before the full search runs. */
  retries: 20,
  /** Seconds to go a partial plan must win before the bot follows it. */
  partialGain: 0.25,
  /** How far the real body may stray from the plan before it plans again, metres. */
  stray: 0.01,
  /** Seconds to go added for a node the graph cannot reach, so any node it can is better. */
  far: 1000,
  /** How much the straight line to the target weighs against seconds to go: only enough to break ties. */
  tie: 0.05,
} as const

/**
 * What every bot of a run shares: each mover's place at a clock, kept so no time is asked twice, and
 * the floor graphs, which are the same for every bot of one size and jump (but those with the other
 * players' heads, which leave out the bot's own).
 */
export class Foresight {
  private readonly poses = new Map<HandleId, Map<number, MoverPose>>()
  private readonly graphs = new Map<string, FloorGraph>()
  private readonly highGraphs = new Map<string, HighGraph>()
  /** How many times the room's code was asked for a place, and how many graphs were built, for measuring. */
  asked = 0
  built = 0

  constructor(private readonly room: Room) {}

  /** The floor graph for body p in the room as it stands (with the other players' heads, or without), built again when the room has changed, and when half its horizon has passed if it knows solids that move. */
  graph(p: Player, heads: boolean): FloorGraph {
    return this.kept(this.graphs, p, heads, (ahead, horizon, key) => new FloorGraph(this.room.sim, ahead.fixed, p, ahead, horizon, heads, key))
  }

  /** The same from high up (trial/highGraph.ts): the floor graph over x and z. */
  highGraph(p: Player, heads: boolean): HighGraph {
    return this.kept(this.highGraphs, p, heads, (ahead, horizon, key) => new HighGraph(this.room.sim, ahead.fixed, p, ahead, horizon, heads, key))
  }

  private kept<G extends { readonly key: number; readonly frame0: number; readonly moving: readonly unknown[] }>(graphs: Map<string, G>, p: Player, heads: boolean, build: (ahead: Shadow, horizon: number, key: number) => G): G {
    const sim = this.room.sim
    const key = roomKey(sim, p.seat, heads ? 'heads' : 'floors')
    const id = p.change === null ? `${p.size}|1|1|${heads ? p.seat : -1}` : `${p.size}|${p.change.jump}|${p.change.weight}|${heads ? p.seat : -1}`
    const known = graphs.get(id)
    const horizon = Math.round(GOTO.secs / DT)
    if (known !== undefined && known.key === key && (known.moving.length === 0 || sim.world.frame - known.frame0 < horizon / 2)) return known
    const graph = build(new Shadow(sim, this, horizon), horizon, key)
    graphs.set(id, graph)
    this.built += 1
    return graph
  }

  place(mover: HandleId, clock: number): MoverPose {
    let kept = this.poses.get(mover)
    if (kept === undefined) {
      kept = new Map()
      this.poses.set(mover, kept)
    }
    const known = kept.get(clock)
    if (known !== undefined) return known
    this.asked += 1
    const pose = this.room.askPlace(mover, clock, false)
    kept.set(clock, pose)
    return pose
  }
}

/** Whether two places are the same: from high up their z too (from the side a mover's z is set to 0). */
const samePose = (a: MoverPose, b: MoverPose, high: boolean) => a.at[0] === b.at[0] && a.at[1] === b.at[1] && (!high || a.at[2] === b.at[2]) && a.turn === b.turn

/**
 * The room held as it stands, stepped ahead a frame at a time: its movers by their places and
 * clocks, its slides and turns under way, everything else where it is now. Built over the real Sim
 * as it is after the last frame, it never changes the real one.
 */
export class Shadow implements Ahead {
  readonly sim: Sim
  /** The solids that move by themselves over the horizon, by index. */
  readonly moving: number[] = []
  /** The still solids that touch (shown, in no moving mover). */
  readonly fixed: number[] = []
  /**
   * For each solid: whether it moved in the last advance, and its middle and turn before it (its
   * outline's cx and cy, and from high up its middle height ym; cy is z there); and the list of
   * those that moved.
   */
  readonly moved: Uint8Array
  readonly movedNow: number[] = []
  readonly fromX: Float64Array
  readonly fromY: Float64Array
  readonly fromM: Float64Array
  readonly fromTurn: Float64Array
  /** Seen from high up: movers keep their z, and a copy of a bot is moved by the controller on the floor. */
  readonly high: boolean
  private readonly world: World
  /** The frame it was made at, and each mover's clock and each solid's slide and turn then: what sampleAt starts from. */
  private readonly frame0: number
  private readonly clocks0: number[]
  private readonly solids0: Solid[]
  /** The movers whose place changes over the horizon, by index. */
  private readonly live: number[] = []

  constructor(
    real: Sim,
    private readonly foresight: Foresight,
    horizon: number,
  ) {
    const w = real.world
    const t = w.t
    this.high = w.view === 'high'
    this.frame0 = w.frame
    this.clocks0 = w.movers.map((m) => m.clock)
    this.solids0 = w.solids
    const movers = w.movers.map((m) => ({ ...m }))
    movers.forEach((m, k) => {
      if (!this.still(m, t, horizon)) this.live.push(k)
    })
    const liveIds = new Set(this.live.map((k) => movers[k].id))
    const solids = w.solids.slice()
    const outlines = real.outlines.slice()
    solids.forEach((s, i) => {
      const moves = (s.mover !== null && liveIds.has(s.mover)) || s.slide !== null || s.turning !== null
      if (moves) {
        this.moving.push(i)
        solids[i] = { ...s }
        const o = real.outlines[i]
        outlines[i] = { ...o, xs: [...o.xs], ys: [...o.ys] }
      }
    })
    this.world = { ...w, movers, solids }
    this.sim = { world: this.world, hooks: real.hooks, listens: real.listens, where: real.where, outlines, turns: real.turns.slice(), building: false }
    const movingSet = new Set(this.moving)
    solids.forEach((s, i) => {
      if (!movingSet.has(i) && solidActive(this.sim, s)) this.fixed.push(i)
    })
    this.moving.splice(0, this.moving.length, ...this.moving.filter((i) => solidActive(this.sim, solids[i])))
    this.moved = new Uint8Array(solids.length)
    this.fromX = new Float64Array(solids.length)
    this.fromY = new Float64Array(solids.length)
    this.fromM = new Float64Array(solids.length)
    this.fromTurn = new Float64Array(solids.length)
  }

  /** Whether a mover stays where it is over the horizon: its clock stopped, or its place the same at every time asked, with no slide or turn under way. */
  private still(m: Mover, t: number, horizon: number): boolean {
    if (t < m.by.start + m.by.secs || t < m.turnBy.start + m.turnBy.secs) return false
    if (m.speed === 0) return true
    const now = this.foresight.place(m.id, m.clock)
    for (const n of [1, 7, 60, 299, Math.max(300, horizon)]) if (!samePose(this.foresight.place(m.id, m.clock + m.speed * DT * n), now, this.high)) return false
    return true
  }

  /** One frame ahead, as the movers' phase plays it: clocks, places, slides and turns, and the outlines of what moved. */
  advance(): void {
    const w = this.world
    w.frame += 1
    w.t = w.frame * DT
    const t = w.t
    for (const k of this.live) {
      const m = w.movers[k]
      m.clock += m.speed * DT
      const pose = this.foresight.place(m.id, m.clock)
      const by = easeVec(m.by, t)
      m.at = [pose.at[0] + by[0], pose.at[1] + by[1], this.high ? pose.at[2] + by[2] : 0]
      m.turn = pose.turn + easeNumber(m.turnBy, t)
    }
    this.movedNow.length = 0
    for (const i of this.moving) {
      const o = this.sim.outlines[i]
      this.fromX[i] = o.cx
      this.fromY[i] = o.cy
      this.fromM[i] = o.ym
      this.fromTurn[i] = this.sim.turns[i]
      const s = w.solids[i]
      if (s.slide !== null) {
        s.at = easeVec(s.slide, t)
        if (t >= s.slide.start + s.slide.secs) s.slide = null
      }
      if (s.turning !== null) {
        s.turn = easeNumber(s.turning, t)
        if (t >= s.turning.start + s.turning.secs) s.turning = null
      }
      refreshOutline(this.sim, i)
      this.moved[i] = o.cx !== this.fromX[i] || o.cy !== this.fromY[i] || o.ym !== this.fromM[i] || this.sim.turns[i] !== this.fromTurn[i] ? 1 : 0
      if (this.moved[i] === 1) this.movedNow.push(i)
    }
  }

  /**
   * Puts the movers and the moving solids where they will be `frames` frames after the frame it was
   * made at, straight from their places at that time rather than frame by frame: the floor graph's
   * coarse samples over the horizon, which need not agree with the frames to the last bit.
   */
  sampleAt(frames: number): void {
    const w = this.world
    const t = (this.frame0 + frames) * DT
    for (const k of this.live) {
      const m = w.movers[k]
      const pose = this.foresight.place(m.id, this.clocks0[k] + m.speed * DT * frames)
      const by = easeVec(m.by, t)
      m.at = [pose.at[0] + by[0], pose.at[1] + by[1], this.high ? pose.at[2] + by[2] : 0]
      m.turn = pose.turn + easeNumber(m.turnBy, t)
    }
    for (const i of this.moving) {
      const was = this.solids0[i]
      const s = w.solids[i]
      if (was.slide !== null) s.at = easeVec(was.slide, t)
      if (was.turning !== null) s.turn = easeNumber(was.turning, t)
      refreshOutline(this.sim, i)
    }
  }

  /** The movers' phase for a copy of a bot, after an advance: carried by the solid it stands on as riders are, and pushed out of the solids that moved into it. */
  carry(p: Player): void {
    if (p.on !== null) {
      const where = this.sim.where[p.on]
      if (where.kind === 'solid' && this.moved[where.i] === 1) {
        const o = this.sim.outlines[where.i]
        const [lx, ly] = riderFrame(p.at, this.fromX[where.i], this.fromY[where.i], this.fromTurn[where.i])
        const [x, y] = riderAt(lx, ly, o.cx, o.cy, this.sim.turns[where.i])
        p.at = [x, y, 0]
      }
    }
    if (this.movedNow.length > 0) pushPlayerOut(this.sim, p, this.movedNow)
  }

  /**
   * The players' phase and the referee for a copy of a bot, after carry: moved by its pad, its change
   * run out, and held inside the room's box as the referee holds every player. False when it has
   * fallen out of the room's bottom, which the referee would bring back from (only its backstop: the
   * house's floor holds every body).
   */
  move(p: Player, pad: Pad): boolean {
    const w = this.world
    movePlayer(this.sim, p, pad)
    if (p.change !== null && w.t >= p.change.until) p.change = null
    holdInRoom(this.sim, p)
    return p.at[1] >= w.bounds.min[1] - 1
  }

  /** carry from high up: the copy keeps its place in the frame of the solid it stands on as the solid moves and turns round y (engine/floor.ts riderFrameFloor), and is pushed out of the solids that moved into it. */
  carryHigh(p: Player): void {
    if (p.on !== null) {
      const where = this.sim.where[p.on]
      if (where.kind === 'solid' && this.moved[where.i] === 1) {
        const i = where.i
        const o = this.sim.outlines[i]
        p.at = riderAtFloor(riderFrameFloor(p.at, this.fromX[i], this.fromM[i], this.fromY[i], this.fromTurn[i]), o.cx, o.ym, o.cy, this.sim.turns[i])
      }
    }
    if (this.movedNow.length > 0) pushPlayerOutFloor(this.sim, p, this.movedNow)
  }

  /** move from high up: the controller on the floor (engine/floorPlayer.ts), as move. */
  moveHigh(p: Player, pad: Pad): boolean {
    const w = this.world
    movePlayerFloor(this.sim, p, pad)
    if (p.change !== null && w.t >= p.change.until) p.change = null
    holdInRoom(this.sim, p)
    return p.at[1] >= w.bounds.min[1] - 1
  }
}

/**
 * A number that changes when the room changes under a bot's plan in a way its search can see: the
 * solids, movers and zones as engine calls set them, and the loose things shown, hidden, carried or
 * sent sliding: 'plan', checked against a plan every frame. 'floors' adds where the loose things at
 * rest are, and 'heads' also where the other players stand still (a head is a floor only while its
 * player stands): what a floor graph is built from, checked only when a plan is made. From high up
 * every place counts along z too. Things on their
 * way and players walking change neither: the plan meets them as it goes, and plans again if its
 * body is moved.
 */
export function roomKey(sim: Sim, seat: number, what: 'plan' | 'floors' | 'heads'): number {
  const wide = what !== 'plan'
  const w = sim.world
  // From high up the places along z too (from the side they are always 0, and left out).
  const high = w.view === 'high'
  let h = 0x811c9dc5
  const mix = (v: number) => {
    h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619)
  }
  for (const s of w.solids) {
    mix(s.hidden ? 1 : 0)
    mix(s.at[0])
    mix(s.at[1])
    if (high) mix(s.at[2])
    mix(s.turn)
    mix(s.slide === null ? -1 : s.slide.start)
    mix(s.turning === null ? -1 : s.turning.start)
    const f = s.surface
    mix((f.ice ? 1 : 0) + (f.through ? 2 : 0))
    mix(f.bounce)
    mix(f.belt[0])
    mix(f.belt[1])
  }
  for (const m of w.movers) {
    mix(m.hidden ? 1 : 0)
    mix(m.speed)
    mix(m.by.start)
    mix(m.by.to[0])
    mix(m.by.to[1])
    if (high) mix(m.by.to[2])
    mix(m.turnBy.start)
    mix(m.turnBy.to)
  }
  for (const z of w.zones) {
    mix(z.hidden ? 1 : 0)
    mix(z.at[0])
    mix(z.at[1])
    mix(z.wind[0])
    mix(z.wind[1])
    if (high) {
      mix(z.at[2])
      mix(z.wind[2])
    }
    mix(z.pull)
    mix(z.gravity)
    mix(z.drag)
  }
  for (const t of w.things) {
    mix(t.hidden ? 1 : t.heldBy !== null ? 2 : t.slide !== null ? 3 : 4)
    const resting = t.on !== null && Math.abs(t.velocity[0]) < 0.05 && Math.abs(t.velocity[1]) < 0.05 && Math.abs(t.velocity[2]) < 0.05
    if (wide && resting && !t.hidden && t.heldBy === null) {
      mix(Math.round(t.at[0] * 10) / 10)
      mix(Math.round(t.at[1] * 10) / 10)
      if (high) mix(Math.round(t.at[2] * 10) / 10)
    }
  }
  if (what === 'heads') {
    for (const p of w.players) {
      if (p.seat === seat) continue
      const standing = p.on !== null && Math.abs(p.velocity[0]) < 0.05 && Math.abs(p.velocity[1]) < 0.05 && Math.abs(p.velocity[2]) < 0.05
      mix(standing ? 1 : 0)
      if (standing) {
        mix(Math.round(p.at[0] * 4) / 4)
        mix(Math.round(p.at[1] * 4) / 4)
        if (high) mix(Math.round(p.at[2] * 4) / 4)
      }
    }
  }
  return h
}

// ------------------------------------------------------------------------------ goals

/** Where a goTo is going, as the search asks it, from the side (trial/highSearch.ts HighGoal is the same from high up). */
export interface Goal {
  readonly view: 'side'
  /** The target as a sentence names it. */
  readonly to: string
  /** The body p is there, in the room as `sim` holds it (the real one, or a Shadow ahead). */
  met(sim: Sim, p: Player): boolean
  /** The graph's nodes that count as there. */
  nodes(graph: FloorGraph): number[]
  /** Where it is, for the straight-line tie-break. */
  aim(sim: Sim): readonly [number, number]
  /** Changes when the target moves or changes. */
  key(sim: Sim): number
}

/** Standing on something, or flying, and nearly still: a body that stays where it came and can act there. */
export function settled(p: Player): boolean {
  // From the side velocity[2] is always 0; from high up it is the speed along z, across the floor as x is.
  if (p.stick === 'fly') return Math.abs(p.velocity[0]) <= SEARCH.settle && Math.abs(p.velocity[1]) <= SEARCH.settle && Math.abs(p.velocity[2]) <= SEARCH.settle
  return p.on !== null && Math.abs(p.velocity[0]) <= SEARCH.settle && Math.abs(p.velocity[2]) <= SEARCH.settle
}

/** How far apart two boxes are, metres; 0 when they touch or overlap. */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1)
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1)
  return Math.sqrt(dx * dx + dy * dy)
}

const bodyBox = (p: Player, x: number, y: number): Box => ({ x0: x - playerWidth(p) / 2, y0: y, x1: x + playerWidth(p) / 2, y1: y + playerHeight(p) })
export const keyOf = (x: number, y: number) => Math.round(x * 10) * 100003 + Math.round(y * 10)
const g0: Ground = { id: 0, y: 0, slope: 0, solid: -1 }

/** Whether there is a floor to stand on within `near` of a point (a target in the air is met in the air). */
function floorNear(sim: Sim, x: number, y: number, near: number): boolean {
  const list = gatherNear(sim, x - 1, y - near - 1, x + 1, y + near + 1)
  return groundUnder(sim, list, x - 0.12, x + 0.12, y - near, y + near, true, y + near, -1, true, -1, g0)
}

/** A point: the feet within `near` of it, standing (or in the air where nothing is there to stand on). */
export function pointGoal(sim: Sim, at: Vec3, near: number, to: string): Goal {
  const floored = floorNear(sim, at[0], at[1], near)
  const there = (x: number, y: number) => (x - at[0]) * (x - at[0]) + (y - at[1]) * (y - at[1]) <= near * near
  return {
    view: 'side',
    to,
    met: (_, p) => there(p.at[0], p.at[1]) && (settled(p) || !floored),
    nodes: (g) => {
      const inner = near - 0.1
      const strict = g.spots.flatMap((s, i) => ((s.x - at[0]) * (s.x - at[0]) + (s.y - at[1]) * (s.y - at[1]) <= inner * inner ? [i] : []))
      return strict.length > 0 ? strict : g.spots.flatMap((s, i) => (there(s.x, s.y) ? [i] : []))
    },
    aim: () => [at[0], at[1]],
    key: () => 0,
  }
}

/** A zone: the feet inside it, standing (or in the air where it has no floor inside). */
export function zoneGoal(sim: Sim, zone: HandleId, to: string): Goal {
  const z = sim.world.zones[sim.where[zone].i]
  const boxOf = (s: Sim) => {
    const c = roomPoint(s, z.at, z.mover)
    return { x0: c[0] - z.size[0] / 2, y0: c[1] - z.size[1] / 2, x1: c[0] + z.size[0] / 2, y1: c[1] + z.size[1] / 2 }
  }
  // Feet inside it: at its bottom or a little under it, never at its top, so the body overlaps it as zone.has sees it.
  const inside = (b: Box, x: number, y: number, slack: number) => x >= b.x0 - slack && x <= b.x1 + slack && y >= b.y0 - 0.03 && y < b.y1 - 0.01
  const b0 = boxOf(sim)
  const floored = floorNear(sim, (b0.x0 + b0.x1) / 2, (b0.y0 + b0.y1) / 2, (b0.y1 - b0.y0) / 2 + 0.03)
  return {
    view: 'side',
    to,
    met: (s, p) => inside(boxOf(s), p.at[0], p.at[1], 0) && (settled(p) || !floored),
    nodes: (g) => {
      const b = boxOf(g.now)
      const spots = g.spots.flatMap((s, i) => (inside(b, s.x, s.y, -0.1) ? [i] : []))
      const moving = g.moving.flatMap((m, k) => (m.tops.some((t) => t.y >= b.y0 - 0.03 && t.y <= b.y1 && t.hi > b.x0 && t.lo < b.x1) ? [g.spots.length + k] : []))
      return [...spots, ...moving]
    },
    aim: (s) => {
      const b = boxOf(s)
      return [(b.x0 + b.x1) / 2, b.y0]
    },
    key: (s) => {
      const b = boxOf(s)
      return keyOf(b.x0, b.y0) + (z.hidden ? 7 : 0)
    },
  }
}

/** Standing on one of these solids (a solid, or every solid of a mover), nearly still, with the feet wholly on it. */
export function standGoal(solids: readonly HandleId[], to: string): Goal {
  const ids = new Set(solids)
  const middle = (s: Sim): [number, number] => {
    let x = 0
    let y = -Infinity
    for (const id of solids) {
      const o = s.outlines[s.where[id].i]
      x += (o.minX + o.maxX) / 2 / solids.length
      y = Math.max(y, o.maxY)
    }
    return [x, y]
  }
  return {
    view: 'side',
    to,
    met: (s, p) => {
      if (p.on === null || !ids.has(p.on) || !settled(p)) return false
      const o = s.outlines[s.where[p.on].i]
      const foot = (CONTROL.foot * p.size) / 2
      return p.at[0] - foot >= o.minX - 1e-3 && p.at[0] + foot <= o.maxX + 1e-3
    },
    nodes: (g) => [...g.spots.flatMap((s, i) => (ids.has(s.on) ? [i] : [])), ...g.moving.flatMap((m, k) => (ids.has(m.id) ? [g.spots.length + k] : []))],
    aim: middle,
    key: (s) => {
      const [x, y] = middle(s)
      return keyOf(x, y)
    },
  }
}

/** Within reach of a box (a thing, decor, a lamp, a sign, a player, a solid with use), standing. */
export function reachGoal(boxOf: (s: Sim) => Box | null, to: string): Goal {
  return {
    view: 'side',
    to,
    met: (s, p) => {
      const b = boxOf(s)
      return b !== null && settled(p) && boxGap(bodyBox(p, p.at[0], p.at[1]), b) <= FEEL.reach
    },
    nodes: (g) => {
      const b = boxOf(g.now)
      return b === null ? [] : g.spots.flatMap((s, i) => (boxGap(bodyBox(g.self, s.x, s.y), b) <= FEEL.reach - 0.1 ? [i] : []))
    },
    aim: (s) => {
      const b = boxOf(s)
      return b === null ? [0, 0] : [(b.x0 + b.x1) / 2, b.y0]
    },
    key: (s) => {
      const b = boxOf(s)
      return b === null ? -1 : keyOf(b.x0, b.y0)
    },
  }
}

/** Where a press of grab picks up this thing: standing, empty handed, where the thing grab takes is this one and no other nearer. */
export function grabGoal(sim: Sim, self: Player, thing: HandleId, to: string): Goal {
  const th = () => sim.world.things[sim.where[thing].i]
  const reach = reachGoal(() => thingBox(th(), { x0: 0, y0: 0, x1: 0, y1: 0 }), to)
  return {
    ...reach,
    met: (s, p) => settled(p) && p.holding === null && grabChoice(s, p) === thing,
    nodes: (g) => g.spots.flatMap((s, i) => (grabChoice(g.now, { ...self, at: [s.x, s.y, 0], holding: null }) === thing ? [i] : [])),
  }
}

/** Where a thing set down from the hands of p, facing dir, comes to rest: its foot, and what it rests on; null when it would fall out of the room. */
export function landing(sim: Sim, p: Player, th: Thing, dir: 1 | -1): { at: Vec3; on: HandleId } | null {
  const at = putDownAt(sim, { ...p, facing: dir }, th)
  const x0 = at[0] + th.box.min[0]
  const x1 = at[0] + th.box.max[0]
  const bottom = at[1] + th.box.min[1]
  const low = sim.world.bounds.min[1] - 1
  const list = gatherNear(sim, x0 - 0.1, low, x1 + 0.1, bottom + 0.1)
  if (!groundUnder(sim, list, x0, x1, low, bottom, true, bottom, th.id, false, -1, g0)) return null
  return { at: [at[0], g0.y - th.box.min[1], 0], on: g0.id }
}

/** Whether a thing whose foot is at `at`, resting on `on`, is where a carry or a push takes it. */
export type ThereTest = (sim: Sim, th: Thing, at: Vec3, on: HandleId | null) => boolean

/**
 * Where a press of grab sets the carried thing down so that it comes to rest there, facing either
 * way: and only where nothing with use is within reach, since there the press would use it and keep
 * the thing in the hands (engine/sim.ts grab).
 */
export function putGoal(sim: Sim, self: Player, thing: HandleId, there: ThereTest, aim: (s: Sim) => readonly [number, number], to: string): Goal {
  const th = () => sim.world.things[sim.where[thing].i]
  const lands = (s: Sim, p: Player) => {
    const g = grabChoice(s, p)
    if (g !== null && s.listens[g].use) return false
    for (const dir of [p.facing, p.facing === 1 ? -1 : 1] as const) {
      const l = landing(s, p, th(), dir)
      if (l !== null && there(s, th(), l.at, l.on)) return true
    }
    return false
  }
  return {
    view: 'side',
    to,
    met: (s, p) => settled(p) && p.holding === thing && lands(s, p),
    nodes: (g) => g.spots.flatMap((s, i) => (lands(g.now, { ...self, at: [s.x, s.y, 0], on: s.on, holding: thing }) ? [i] : [])),
    aim,
    key: (s) => {
      const [x, y] = aim(s)
      return keyOf(x, y)
    },
  }
}

/** The far side of a thing from where it is pushed (dir +1 to push it right): standing at its level, touching it or nearly. */
export function sideGoal(sim: Sim, thing: HandleId, dir: 1 | -1, to: string): Goal {
  const th = () => sim.world.things[sim.where[thing].i]
  const at = (p: Player, x: number, y: number) => {
    const t = th()
    const hw = playerWidth(p) / 2
    const gap = dir > 0 ? t.at[0] + t.box.min[0] - (x + hw) : x - hw - (t.at[0] + t.box.max[0])
    return gap >= -0.02 && gap <= 0.3 && Math.abs(y - (t.at[1] + t.box.min[1])) <= FEEL.stepUp
  }
  const aim = (): [number, number] => {
    const t = th()
    return [dir > 0 ? t.at[0] + t.box.min[0] - 0.4 : t.at[0] + t.box.max[0] + 0.4, t.at[1] + t.box.min[1]]
  }
  return {
    view: 'side',
    to,
    met: (_, p) => p.on !== null && at(p, p.at[0], p.at[1]),
    nodes: (g) => g.spots.flatMap((s, i) => (at(g.self, s.x, s.y) ? [i] : [])),
    aim,
    key: () => {
      const [x, y] = aim()
      return keyOf(x, y)
    },
  }
}

// ------------------------------------------------------------------------------ the plan

/** What the bot holds each frame of a plan, and where its body will be after it. */
export interface Plan {
  /** The World's frame when it was made: holds[i] is for frame start + 1 + i. */
  readonly start: number
  readonly sx: readonly number[]
  readonly sy: readonly number[]
  /** The jump button held. */
  readonly jump: readonly boolean[]
  readonly x: readonly number[]
  readonly y: readonly number[]
  /** From high up, where the feet are along z; from the side always 0. */
  readonly z: readonly number[]
  readonly on: readonly (HandleId | null)[]
  /** It ends there; false for the best part of a way that the search could not finish, or a way to where it waits. */
  readonly reached: boolean
  /** It only stands still, waiting for a solid that moves to come or to carry it. */
  readonly waits: boolean
  readonly roomKey: number
  /** Where the target was when it was made, in the plane the bodies move in (x and y from the side, x and z from high up): the bot plans again when the target moves further than GOTO.near from it. */
  readonly aim: readonly [number, number]
}

interface Move {
  readonly sx: number
  readonly sy: number
  /** 0 none, 1 a short hop pressed now, 2 a full jump pressed now, 3 a full jump at the last moment after running off an edge. */
  readonly jump: 0 | 1 | 2 | 3
}

const move = (sx: number, sy: number, jump: Move['jump']): Move => ({ sx, sy, jump })
const DIRS = [1, -1, 0] as const
const GROUND_JUMPS: readonly Move[] = [...DIRS.flatMap((d) => [move(d, 0, 0), move(d, 0, 2)]), move(1, 0, 3), move(-1, 0, 3)]
/** The widest attempt's moves on a floor: also a short hop, and half the stick, which shifts a run-up by less than a frame's step so a longest jump leaves the edge at its best. */
const GROUND_HOPS: readonly Move[] = [...GROUND_JUMPS, ...DIRS.map((d) => move(d, 0, 1)), move(0.5, 0, 0), move(-0.5, 0, 0)]
const GROUND_WALKS: readonly Move[] = DIRS.map((d) => move(d, 0, 0))
const DROP = move(0, -1, 0)
const AIR: readonly Move[] = DIRS.map((d) => move(d, 0, 0))
const FLY: readonly Move[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => move(x, y, 0)))

/** A child of the beam: a copy of the bot after its decision, and how it got there. */
interface Node {
  readonly p: Player
  held: boolean
  armed: boolean
  anchor: number
  readonly parent: Node | null
  readonly move: Move | null
  /** What it held each frame of its decision ([sx, sy, jump] packed by three) and its feet after each ([x, y] by two), and what it stood on. */
  readonly holds: number[]
  readonly feet: number[]
  readonly ons: (HandleId | null)[]
  score: number
  dead: boolean
}

export const UP: PadButton = { held: false, pressed: false }
export const HELD: PadButton = { held: true, pressed: false }
export const PRESSED: PadButton = { held: true, pressed: true }

/** The bot's pad for one frame: the stick, and the jump on its button. */
export function padOf(sx: number, sy: number, jumpOn: 'a' | 'b' | null, button: PadButton): Pad {
  return { stick: [sx, sy], a: jumpOn === 'a' ? button : UP, b: jumpOn === 'b' ? button : UP }
}

/**
 * The seconds to go of a body in the air moving vy m/s up against a pull of `pulled` m/s² down (or
 * standing on a solid that moves, as if it jumped now): the best, over the spots it can still come
 * down on, of the time until its feet fall to that spot's height (under the stronger pull of here and
 * there) and that spot's seconds to go. A spot counts when the stick can carry the feet across to it
 * in that time (CONTROL.airSpeed, and its speed now). So a jump that will land somewhere better looks
 * better while it is still in the air, and the beam keeps it.
 */
function comingDown(graph: FloorGraph, dist: Float64Array, p: Player, vy: number, pulled: number): number {
  const x = p.at[0]
  const y = p.at[1]
  const slack = Math.abs(p.velocity[0]) * SEARCH.decision * DT
  const cols = Math.ceil((CONTROL.airSpeed * 1.5 + slack) / GRAPH.column)
  const c0 = Math.round((x - graph.x0) / GRAPH.column)
  let best = Infinity
  for (let c = Math.max(0, c0 - cols); c <= Math.min(graph.cols.length - 1, c0 + cols); c++) {
    for (const i of graph.cols[c]) {
      const s = graph.spots[i]
      if (!Number.isFinite(dist[i])) continue
      const g = Math.max(pulled, s.g)
      if (g <= 0) continue
      const disc = vy * vy + 2 * g * (y - s.y)
      if (disc < 0) continue
      const t = (vy + Math.sqrt(disc)) / g
      if (t < 0 || FloorGraph.across(x, x, s.lo, s.hi) > CONTROL.airSpeed * t + slack) continue
      if (t + dist[i] < best) best = t + dist[i]
    }
  }
  return best
}

/** Whether the floor under body p ends within a decision's run (or a little more) the way `dir` points: where a jump kept for the edge can matter. Off the graph's spots, it says yes. */
function endAhead(graph: FloorGraph, p: Player, dir: number): boolean {
  const run = Math.ceil((FEEL.walk * SEARCH.decision * DT + 0.3) / GRAPH.column)
  let y = p.at[1]
  for (let k = 0; k <= run; k++) {
    const s = graph.spotNear(p.at[0] + dir * k * GRAPH.column, y)
    if (s < 0 || Math.abs(graph.spots[s].y - y) > FEEL.stepUp) return true
    y = graph.spots[s].y
  }
  return false
}

/** The seconds from sample `at` (a fraction of GRAPH.sampleFrames frames since the graph was built) to the first of `when` at or after it, a sample's slack before; Infinity when none comes within the horizon. */
export function waitFor(when: readonly number[] | undefined, at: number): number {
  if (when === undefined) return Infinity
  let lo = 0
  let hi = when.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (when[mid] < at - 1) lo = mid + 1
    else hi = mid
  }
  return lo === when.length ? Infinity : Math.max(0, when[lo] - at) * GRAPH.sampleFrames * DT
}

/**
 * On moving node n, boarded `already` seconds after sample `at`, the best way off it toward the goal
 * (onto a node nearer by Dijkstra's seconds): seconds to go when the wait to leave is the real one,
 * and that wait. Only ways toward the goal count, since Dijkstra's guessed waits would make stepping
 * back off and boarding again look quicker than riding on.
 */
export function leaveBest(g: Timetable, d: Float64Array, n: number, at: number, already: number): { secs: number; wait: number } {
  const m = g.moving[n - g.spots.length]
  const boarded = at + already / (GRAPH.sampleFrames * DT)
  let best = { secs: Infinity, wait: 0 }
  for (const e of g.out[n]) {
    if (d[e.to] >= d[n]) continue
    if (e.to >= g.spots.length) {
      if (e.cost + d[e.to] < best.secs) best = { secs: e.cost + d[e.to], wait: 0 }
      continue
    }
    const wait = waitFor(m.leave.get(e.to), boarded)
    const secs = wait + e.cost - GRAPH.moverCost + d[e.to]
    if (secs < best.secs) best = { secs, wait }
  }
  return best
}

/** On spot a at sample `at`, the best way toward the goal that boards a moving solid: seconds to go with the real waits to board it and to leave it, and the wait to board. */
export function boardBest(g: Timetable, d: Float64Array, a: number, at: number): { secs: number; wait: number; to: number } {
  let best = { secs: Infinity, wait: 0, to: -1 }
  for (const e of g.boarding.get(a) ?? []) {
    if (d[e.to] >= d[a]) continue
    const wait = waitFor(g.moving[e.to - g.spots.length].board.get(a), at)
    if (!Number.isFinite(wait)) continue
    const secs = wait + e.cost - GRAPH.moverCost + leaveBest(g, d, e.to, at, wait).secs
    if (secs < best.secs) best = { secs, wait, to: e.to }
  }
  return best
}

/** Along the graph's best way from spot `start` (the cheapest next step each time), the spot from which it boards a moving solid; -1 when it boards none before the goal. */
export function boardingOn(g: Timetable, d: Float64Array, start: number): number {
  let a = start
  for (let steps = 0; steps < g.size && d[a] > 0; steps++) {
    let next = -1
    let best = Infinity
    for (const e of g.out[a]) {
      if (e.cost + d[e.to] < best) {
        best = e.cost + d[e.to]
        next = e.to
      }
    }
    if (next < 0) return -1
    if (next >= g.spots.length) return a
    a = next
  }
  return -1
}

/**
 * Seconds to go from graph node `a` at frame `frame`, with the wait for a moving solid counted as it
 * will be: from a spot onto the next time that solid comes to it, and on that solid until the next
 * time it comes to a spot it can be left for. Dijkstra's seconds only guess the wait
 * (GRAPH.moverCost), so a body waiting for a solid that moves, or riding one, would look no nearer as
 * it came; with the real wait it does.
 */
export function timed(g: Timetable, d: Float64Array, a: number, frame: number): number {
  if (d[a] === 0) return 0
  const at = (frame - g.frame0) / GRAPH.sampleFrames
  if (a >= g.spots.length) return leaveBest(g, d, a, at, 0).secs
  if (!g.boarding.has(a)) return d[a]
  let best = boardBest(g, d, a, at).secs
  for (const e of g.out[a]) if (e.to < g.spots.length) best = Math.min(best, e.cost + d[e.to])
  return best
}

/** One bot's planner: its graphs and distances, kept while the room stays as it was. */
export class Planner {
  /** Decisions tried and plans made, for measuring. */
  expansions = 0
  plans = 0
  /** Plans in a row that only stood still by a moving solid because the narrow beam could not board or leave it yet. */
  private waited = 0
  private dists = new Map<string, { goal: Goal; graph: FloorGraph; dist: Float64Array }>()

  constructor(
    readonly room: Room,
    readonly seat: number,
    private readonly foresight: Foresight,
  ) {}

  private get me(): Player {
    return this.room.world.players[this.seat]
  }

  /** The jump's button: whichever has the job 'jump', or null. */
  private jumpButton(p: Player): 'a' | 'b' | null {
    return p.a === 'jump' ? 'a' : p.b === 'jump' ? 'b' : null
  }

  /** The floor graph for the room as it stands, without the other players' heads or with them. */
  graphNow(heads: boolean): FloorGraph {
    return this.foresight.graph(this.me, heads)
  }

  /** Seconds to go to the goal from every node of the graph; with `alone`, without riding anything that moves. */
  private distances(graph: FloorGraph, goal: Goal, goalKey: number, alone: boolean): Float64Array {
    const id = `${goal.to}|${goalKey}|${graph.heads}|${alone}`
    const known = this.dists.get(id)
    if (known !== undefined && known.goal === goal && known.graph === graph) return known.dist
    const dist = graph.distances(goal.nodes(graph), alone)
    this.dists.set(id, { goal, graph, dist })
    return dist
  }

  /**
   * The rest of a plan (its frames from `next` on), played from where the bot is now in the room as
   * it stands now: the same plan, known to the room as it is now, when the body still goes where the
   * plan says frame by frame and, for a plan that got there, still ends there; else null. Most
   * changes to a room happen away from a bot's way, and this costs one copy's frames, not a search.
   */
  recheck(plan: Plan, next: number, goal: Goal): Plan | null {
    const real = this.me
    const sim = this.room.sim
    const jumpOn = this.jumpButton(real)
    const shadow = new Shadow(sim, this.foresight, plan.x.length - next)
    const p: Player = { ...real }
    let held = jumpOn === null ? false : real.input[jumpOn]
    for (let f = next; f < plan.x.length; f++) {
      shadow.advance()
      shadow.carry(p)
      const button = plan.jump[f] ? (held ? HELD : PRESSED) : UP
      held = plan.jump[f]
      if (!shadow.move(p, padOf(plan.sx[f], plan.sy[f], jumpOn, button))) return null
      if (Math.abs(p.at[0] - plan.x[f]) > SEARCH.stray || Math.abs(p.at[1] - plan.y[f]) > SEARCH.stray || (p.on === null) !== (plan.on[f] === null)) return null
    }
    if (plan.reached && !goal.met(shadow.sim, p)) return null
    return { ...plan, roomKey: roomKey(sim, this.seat, 'plan'), aim: goal.aim(sim) }
  }

  /** A plan to stand still for `frames` frames, letting the room carry the bot or come to it, with its body's places as the room ahead gives them; null when the body would not stay in the room. */
  private standStill(frames: number, key: number, aim: readonly [number, number]): Plan | null {
    const real = this.me
    const sim = this.room.sim
    const shadow = new Shadow(sim, this.foresight, frames)
    const p: Player = { ...real }
    const plan = { start: sim.world.frame, sx: [] as number[], sy: [] as number[], jump: [] as boolean[], x: [] as number[], y: [] as number[], z: [] as number[], on: [] as (HandleId | null)[], reached: false, waits: true, roomKey: key, aim }
    for (let f = 0; f < frames; f++) {
      shadow.advance()
      shadow.carry(p)
      if (!shadow.move(p, padOf(0, 0, null, UP))) return null
      plan.sx.push(0)
      plan.sy.push(0)
      plan.jump.push(false)
      plan.x.push(p.at[0])
      plan.y.push(p.at[1])
      plan.z.push(p.at[2])
      plan.on.push(p.on)
    }
    return plan
  }

  /** A plan to the goal from where the bot is now. Throws the sentence when there is no way. */
  plan(goal: Goal): Plan {
    this.plans += 1
    const real = this.me
    const sim = this.room.sim
    const key = roomKey(sim, this.seat, 'plan')
    const goalKey = goal.key(sim)
    const from: [number, number] = [Math.round(real.at[0] * 10) / 10, Math.round(real.at[1] * 10) / 10]
    if (real.stick === 'none') throw new Mistake(WALK_MISTAKES.noWay(this.seat, `${from[0]}, ${from[1]}`, goal.to, "its stick is 'none', so it moves only as the room moves it", 'steer it and wait for the room instead'))
    const fly = real.stick === 'fly'
    // The floor graph without the other players' heads; with them only when there is no way without a boost.
    let graph = fly ? null : this.graphNow(false)
    let dist = graph === null ? null : this.distances(graph, goal, goalKey, false)
    if (graph !== null && dist !== null) {
      const start = real.on !== null ? graph.nodeAt(real) : graph.spotUnder(real.at[0], real.at[1])
      if (start < 0 || !Number.isFinite(dist[start])) {
        graph = this.graphNow(true)
        dist = this.distances(graph, goal, goalKey, false)
      }
    }
    const horizon = Math.round(GOTO.secs / DT)
    const jumpOn = this.jumpButton(real)
    // When the best way boards a moving solid further on, the search goes first to the spot it boards from: there the bot waits
    // for it (below), and no search runs on past a ride it could not plan through yet.
    const toGoal = dist
    let target = goal
    if (graph !== null && dist !== null && real.on !== null) {
      const start = graph.nodeAt(real)
      const board = start >= 0 && start < graph.spots.length ? boardingOn(graph, dist, start) : -1
      if (board >= 0 && board !== start) {
        const s = graph.spots[board]
        const there = pointGoal(sim, [s.x, s.y, 0], GOTO.near, `${goal.to}, by way of ${Math.round(s.x * 10) / 10}, ${Math.round(s.y * 10) / 10}`)
        if (!there.met(sim, real)) {
          target = there
          dist = this.distances(graph, target, target.key(sim), false)
        }
      }
    }
    const aim = target.aim(sim)
    // The straight line that breaks ties between ways equal by the graph: to the aim; in the last try at boarding a moving
    // solid (below), to the nearest of its top, and none for a copy already on it.
    let toward: readonly [number, number] = aim
    let onBoard: HandleId | null = null

    const scoreOf = (n: Node, frame: number): number => {
      const p = n.p
      const ex = p.at[0] - toward[0]
      const ey = p.at[1] - toward[1]
      const line = p.on !== null && p.on === onBoard ? 0 : Math.sqrt(ex * ex + ey * ey) / FEEL.walk
      if (dist === null || graph === null) return line
      let d = n.anchor < 0 ? Infinity : timed(graph, dist, n.anchor, frame)
      // In the air, or riding a solid that moves (one node of the graph, the same all along it): also the best spot it can come down on, or jump to from here.
      if (p.on === null) d = Math.min(d, comingDown(graph, dist, p, p.velocity[1], leapAt(sim, p, p.at[0], p.at[1], 0).g))
      else if (n.anchor < 0 || n.anchor >= graph.spots.length) {
        const leap = leapAt(sim, p, p.at[0], p.at[1], 0)
        d = Math.min(d, comingDown(graph, dist, p, leap.vy, leap.g))
      }
      return (Number.isFinite(d) ? d : SEARCH.far + line) + SEARCH.tie * line
    }
    const anchorOf = (p: Player, before: number): number => {
      if (graph === null) return -1
      if (p.on !== null) {
        const n = graph.nodeAt(p)
        if (n >= 0) return n
      }
      return before
    }

    const rootP: Player = { ...real }
    const root: Node = {
      p: rootP,
      held: jumpOn === null ? false : real.input[jumpOn],
      armed: false,
      anchor: graph === null ? -1 : real.on !== null ? graph.nodeAt(real) : graph.spotUnder(real.at[0], real.at[1]),
      parent: null,
      move: null,
      holds: [],
      feet: [],
      ons: [],
      score: 0,
      dead: false,
    }
    if (root.anchor < 0 && graph !== null) root.anchor = graph.spotUnder(real.at[0], real.at[1])
    root.score = scoreOf(root, sim.world.frame)

    // Waiting for a moving solid, or riding one: when the best way starts by boarding it here (better than any way that rides
    // nothing) or by leaving it, and it comes more than SEARCH.waitMin from now, the plan is to stand still until just before.
    // There, the narrow beam alone tries to board or leave it now; when it cannot yet, the bot stands still a moment and plans again.
    let nearMover = false
    // The moving solid the best way boards from here, when it does: its index among the graph's moving nodes, else -1.
    let boards = -1
    if (graph !== null && toGoal !== null && target === goal && root.anchor >= 0 && settled(real)) {
      const at = (sim.world.frame - graph.frame0) / GRAPH.sampleFrames
      let wait = Infinity
      if (root.anchor >= graph.spots.length) wait = leaveBest(graph, toGoal, root.anchor, at, 0).wait
      else if (graph.boarding.has(root.anchor)) {
        const board = boardBest(graph, toGoal, root.anchor, at)
        if (board.secs < this.distances(graph, goal, goalKey, true)[root.anchor]) {
          wait = board.wait
          boards = board.to - graph.spots.length
        }
      }
      nearMover = Number.isFinite(wait)
      if (nearMover && wait > SEARCH.waitMin) {
        const still = this.standStill(Math.round((wait - SEARCH.waitLead) / DT), key, aim)
        if (still !== null) return still
      }
    }

    const decisions = Math.ceil(horizon / SEARCH.decision)

    /** One attempt of the beam at a width: the node that got there and the frames into its decision, or the best node it reached. */
    const attempt = (width: number, standingSlots: number, stallSecs: number, hops: boolean): { found: { node: Node; frames: number } | null; best: Node } => {
      const shadow = new Shadow(sim, this.foresight, horizon)
      const w = shadow.sim.world
      let beam: Node[] = [root]
      let best = root
      let progress = scoreOf(root, sim.world.frame)
      let progressAt = 0
      let expansions = 0
      for (let depth = 0; depth < decisions; depth++) {
        const children: Node[] = []
        for (const node of beam) {
          const p = node.p
          let moves: readonly Move[]
          if (fly) moves = FLY
          else if (p.on !== null && !p.steep) {
            moves = jumpOn !== null && !node.held ? (hops ? GROUND_HOPS : GROUND_JUMPS) : GROUND_WALKS
            const through = sim.where[p.on].kind === 'solid' && w.solids[sim.where[p.on].i].surface.through
            if (through) moves = [...moves, DROP]
          } else moves = AIR
          for (const m of moves) {
            // A jump kept for the edge plays as a run until a floor ends: only near an end is it a move of its own.
            if (m.jump === 3 && graph !== null && !endAhead(graph, p, m.sx)) continue
            children.push({ p: { ...p }, held: node.held, armed: node.armed, anchor: node.anchor, parent: node, move: m, holds: [], feet: [], ons: [], score: 0, dead: false })
          }
        }
        expansions += children.length
        for (let k = 0; k < SEARCH.decision; k++) {
          shadow.advance()
          const t = w.t
          for (const c of children) {
            if (c.dead) continue
            const p = c.p
            const m = c.move as Move
            shadow.carry(p)
            // The jump button: pressed now, at the edge, or let go at the top or after a short hop.
            if (k === 0 && p.on !== null) c.armed = m.jump === 3
            let button = c.held ? HELD : UP
            if (k === 0 && (m.jump === 1 || m.jump === 2) && !c.held) {
              c.held = true
              button = PRESSED
            } else if (c.armed && !c.held && p.on === null && t - p.leftGroundAt <= CONTROL.coyote + 1e-9 && t + DT - p.leftGroundAt > CONTROL.coyote + 1e-9) {
              c.held = true
              c.armed = false
              button = PRESSED
            } else if (c.held && ((m.jump === 1 && k === 1) || p.velocity[1] <= 0)) {
              c.held = false
              button = UP
            }
            const flying = p.on === null
            if (!shadow.move(p, padOf(m.sx, m.sy, jumpOn, button))) {
              c.dead = true
              continue
            }
            // Landing ends a jump kept for the edge; running toward the edge keeps it.
            if (flying && p.on !== null) c.armed = false
            c.holds.push(m.sx, m.sy, c.held ? 1 : 0)
            c.feet.push(p.at[0], p.at[1])
            c.ons.push(p.on)
            c.anchor = anchorOf(p, c.anchor)
            if (target.met(shadow.sim, p)) {
              this.expansions += expansions
              return { found: { node: c, frames: k + 1 }, best }
            }
          }
        }
        // The beam: the best child of each kind, best first; a share of it standing, so copies falling from an edge never crowd out every copy that stood there.
        const kept = new Map<number, Node>()
        for (const c of children) {
          if (c.dead) continue
          c.score = scoreOf(c, w.frame)
          const p = c.p
          const id =
            ((((Math.round(p.at[0] * 20) + 4096) * 8192 + (Math.round(p.at[1] * 20) + 4096)) * 64 + (Math.round(p.velocity[0] * 2) + 32)) * 64 + (Math.round(p.velocity[1]) + 32)) * 4 +
            (p.on === null ? 0 : 1) +
            (c.held ? 2 : 0)
          const known = kept.get(id)
          if (known === undefined || c.score < known.score) kept.set(id, c)
        }
        const order = (a: Node, b: Node) => a.score - b.score || Number(b.p.on !== null) - Number(a.p.on !== null)
        const sorted = [...kept.values()].sort(order)
        const standing = sorted.filter((n) => n.p.on !== null).slice(0, standingSlots)
        const chosen = new Set(standing)
        beam = [...standing, ...sorted.filter((n) => !chosen.has(n)).slice(0, width - standing.length)].sort(order)
        if (beam.length === 0) break
        // The best way so far ends standing still, never about to run off an edge.
        const lead = beam.find((n) => settled(n.p))
        if (lead !== undefined && lead.score < best.score) best = lead
        if (beam[0].score < progress - SEARCH.gain) {
          progress = beam[0].score
          progressAt = depth
        }
        if ((depth - progressAt) * SEARCH.decision * DT > stallSecs || expansions > SEARCH.expansions) break
      }
      this.expansions += expansions
      return { found: null, best }
    }

    let best = root
    let found: { node: Node; frames: number } | null = null
    // Retries of standing still near a moving solid that came to nothing for a while: then the full search runs.
    const patient = nearMover && this.waited < SEARCH.retries
    for (const a of patient ? SEARCH.attempts.slice(0, 1) : SEARCH.attempts) {
      const tried = attempt(a.beam, a.standing, a.stallSecs, a.hops)
      if (tried.found !== null) {
        found = tried.found
        break
      }
      if (tried.best.score < best.score) best = tried.best
    }

    const make = (node: Node, frames: number, reached: boolean): Plan => {
      const chain: Node[] = []
      for (let n: Node | null = node; n !== null && n.parent !== null; n = n.parent) chain.push(n)
      chain.reverse()
      const plan = { start: sim.world.frame, sx: [] as number[], sy: [] as number[], jump: [] as boolean[], x: [] as number[], y: [] as number[], z: [] as number[], on: [] as (HandleId | null)[], reached, waits: false, roomKey: key, aim }
      chain.forEach((n, i) => {
        const count = i === chain.length - 1 ? frames : n.ons.length
        for (let f = 0; f < count; f++) {
          plan.sx.push(n.holds[3 * f])
          plan.sy.push(n.holds[3 * f + 1])
          plan.jump.push(n.holds[3 * f + 2] === 1)
          plan.x.push(n.feet[2 * f])
          plan.y.push(n.feet[2 * f + 1])
          plan.z.push(0)
          plan.on.push(n.ons[f])
        }
      })
      return plan
    }
    // Boarding now and nothing found: every copy is the same to the graph while the ride is still ahead, and the line to the aim
    // favours copies hopping nearer it, which may lie the other way (a lift beside a ledge on this side). Once more, narrow, with
    // ties to the nearest of the moving solid's top and to copies on it, and the way it finds, or part of it, is the plan.
    if (found === null && boards >= 0 && graph !== null) {
      const solid = graph.moving[boards]!
      const o = sim.outlines[solid.solid]!
      toward = [Math.min(Math.max(real.at[0], o.minX), o.maxX), o.maxY]
      onBoard = solid.id
      const a = SEARCH.attempts[0]
      const tried = attempt(a.beam, a.standing, a.stallSecs, a.hops)
      if (tried.found !== null || tried.best.score < scoreOf(root, sim.world.frame) - SEARCH.gain) {
        this.waited = 0
        return tried.found !== null ? make(tried.found.node, tried.found.frames, target === goal) : make(tried.best, tried.best.ons.length, false)
      }
      toward = aim
      onBoard = null
    }
    if (found !== null) {
      this.waited = 0
      return make(found.node, found.frames, target === goal)
    }
    // A way part of the way that wins enough; by a moving solid, any gain (to a better place to wait from). When the graph has no
    // way at all, never one to a place the bot could not come back from (off a ledge onto the house's floor, under a ledge too
    // high to climb again): the room may still open a way from where it is, and the sentence is said from there.
    const deadEnd = graph !== null && dist !== null && root.anchor >= 0 && best.anchor >= 0 && !Number.isFinite(dist[root.anchor]) && graph.reached(best.anchor)[root.anchor] !== 1
    if (best !== root && !deadEnd && best.score < root.score - (nearMover ? SEARCH.gain : SEARCH.partialGain)) {
      this.waited = 0
      return make(best, best.ons.length, false)
    }
    if (patient) {
      const still = this.standStill(2 * SEARCH.decision, key, aim)
      if (still !== null) {
        this.waited += 1
        return still
      }
    }
    this.waited = 0
    // No way: why, from the graph.
    if (graph === null || dist === null) throw new Mistake(WALK_MISTAKES.noWay(this.seat, `${from[0]}, ${from[1]}`, goal.to, 'flying there, something stands in the way', `it flies ${FEEL.walk} m/s`))
    const start = root.anchor
    if (start >= 0 && Number.isFinite(dist[start]) && dist[start] > GOTO.secs) throw new Mistake(WALK_MISTAKES.tooFar(this.seat, goal.to))
    const stuck = best.anchor >= 0 ? best.anchor : start
    const name = (id: HandleId) => this.room.describe(id)
    const why = start >= 0 && Number.isFinite(dist[start]) ? nextEdge(graph, stuck, dist, name) : missingEdge(graph, start, dist, name)
    throw new Mistake(WALK_MISTAKES.noWay(this.seat, `${from[0]}, ${from[1]}`, goal.to, why.gap, why.reach))
  }
}


