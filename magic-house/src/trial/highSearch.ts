/**
 * Magic House: the search behind a bot's goTo from high up (step 6; trial/api.ts), beside the side's
 * (trial/search.ts), whose room ahead (Shadow), shared foresight, plans and waits for solids that
 * move it uses as they are. A beam search over a copy of the bot's own body, stepped by the
 * controller on the floor (engine/floorPlayer.ts movePlayerFloor) inside the room's box, against the
 * room held as it stands, scored by Dijkstra's seconds on the floor graph from high up
 * (trial/highGraph.ts).
 *
 * What differs from the side, because the floor has two ways across where the side has one:
 * - The stick points any way on the floor, so the moves are not every way but ways the graph gives:
 *   toward a point a little along the graph's best way (the carrot: the farthest spot of the next
 *   metre of walking, or where the next jump lands), and in wider attempts that turned a little each
 *   way, standing still, and the eight ways of the compass. Each with a jump pressed now or at the
 *   last moment after running off an edge (only where a floor ends ahead), or none. Near the end of
 *   the way the stick is pushed less, so the body stops where it should.
 * - Narrow first (HIGH_SEARCH.attempts): the first attempt follows the carrot alone, which finds
 *   most ways across an open floor at a fraction of the cost.
 * - A copy in the air is scored by the floor it left or the best spot it can still come down on, over
 *   a disc of the floor as far as the air speed carries it.
 *
 * Pure plain numbers: no three.js, no Date, no Math.random, and only engine/math.ts's sin and cos.
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { FEEL } from '../engine/api'
import { Mistake } from '../engine/checks'
import { contains } from '../engine/geometry'
import { gap3, groundUnderFloor, gatherFloor, playerBox3, thingBox3, emptyBox3, type Box3, type FloorGround } from '../engine/floorState'
import { grabChoiceFloor, putDownAtFloor } from '../engine/floor'
import { cos, sin } from '../engine/math'
import { CONTROL } from '../engine/player'
import type { Room } from '../engine/room'
import { DT, playerWidth, roomPoint, type Sim } from '../engine/state'
import type { HandleId, Player, Thing } from '../engine/world'
import { GOTO, WALK_MISTAKES } from './api'
import { GRAPH } from './graph'
import { HighGraph, leapAtHigh, missingEdgeHigh, nextEdgeHigh, placeHigh } from './highGraph'
import { boardBest, boardingOn, HELD, leaveBest, padOf, PRESSED, roomKey, SEARCH, settled, Shadow, timed, UP, type Foresight, type Plan, type ThereTest } from './search'

/** The search's own numbers from high up; the rest are SEARCH's. */
export const HIGH_SEARCH = {
  /**
   * The beam's attempts, narrow first: `beam` children kept a decision (`standing` at least
   * standing), giving up after `stallSecs` with no progress; `spread` 0 follows the carrot alone, 1
   * also turns it a little each way and stands still, 2 also tries the eight ways of the compass and
   * half the stick.
   */
  attempts: [
    { beam: 2, standing: 1, stallSecs: 2, spread: 0 },
    { beam: 6, standing: 2, stallSecs: 4, spread: 1 },
    { beam: 16, standing: 5, stallSecs: 12, spread: 2 },
  ],
  /** How far along the graph's way the carrot goes when it walks, metres, and how much a turned way turns, radians. */
  carrot: 1,
  turn: 0.6,
  /** Within this of the last spot of the way, the stick is pushed only as hard as the distance over this, so the body stops there. */
  ease: 0.6,
  /** How many landings a plan may take out of the graph as ones the bot cannot make before it says there is no way. */
  drops: 2,
  /** Decisions tried in one attempt before it gives up: fewer than from the side, since each tries more moves. */
  expansions: 8_000,
} as const

/** Where a goTo is going from high up, as the search asks it: Goal's fields, with the graph from high up and the target's place on the floor (x and z). */
export interface HighGoal {
  readonly view: 'high'
  readonly to: string
  met(sim: Sim, p: Player): boolean
  nodes(graph: HighGraph): number[]
  aim(sim: Sim): readonly [number, number]
  key(sim: Sim): number
}

const keyOf3 = (x: number, y: number, z: number) => (Math.round(x * 10) * 100003 + Math.round(y * 10)) * 100003 + Math.round(z * 10)
const g0: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }

/** Whether there is a floor to stand on within `near` of a point (a target in the air is met in the air). */
function floorNearHigh(sim: Sim, x: number, y: number, z: number, near: number): boolean {
  const list = gatherFloor(sim, x - 1, y - near - 1, z - 1, x + 1, y + near + 1, z + 1)
  return groundUnderFloor(sim, list, x - 0.12, z - 0.12, x + 0.12, z + 0.12, y - near, y + near, y + near, -1, true, -1, g0)
}

/** A point: the feet within `near` of it, standing (or in the air where nothing is there to stand on). */
export function pointGoalHigh(sim: Sim, at: Vec3, near: number, to: string): HighGoal {
  const floored = floorNearHigh(sim, at[0], at[1], at[2], near)
  const d2 = (x: number, y: number, z: number) => (x - at[0]) ** 2 + (y - at[1]) ** 2 + (z - at[2]) ** 2
  return {
    view: 'high',
    to,
    met: (_, p) => d2(p.at[0], p.at[1], p.at[2]) <= near * near && (settled(p) || !floored),
    nodes: (g) => {
      const inner = near - 0.1
      const strict = g.spots.flatMap((s, i) => (d2(s.x, s.y, s.z) <= inner * inner ? [i] : []))
      return strict.length > 0 ? strict : g.spots.flatMap((s, i) => (d2(s.x, s.y, s.z) <= near * near ? [i] : []))
    },
    aim: () => [at[0], at[2]],
    key: () => 0,
  }
}

/** A zone: the feet inside it on the floor and between its bottom (or a little under) and its top, standing (or in the air where it has no floor inside). */
export function zoneGoalHigh(sim: Sim, zone: HandleId, to: string): HighGoal {
  const z = sim.world.zones[sim.where[zone].i]
  const boxOf = (s: Sim): Box3 => {
    const c = roomPoint(s, z.at, z.mover)
    return { x0: c[0] - z.size[0] / 2, y0: c[1] - z.size[1] / 2, z0: c[2] - z.size[2] / 2, x1: c[0] + z.size[0] / 2, y1: c[1] + z.size[1] / 2, z1: c[2] + z.size[2] / 2 }
  }
  const inside = (b: Box3, x: number, y: number, zz: number, slack: number) => x >= b.x0 - slack && x <= b.x1 + slack && zz >= b.z0 - slack && zz <= b.z1 + slack && y >= b.y0 - 0.03 && y < b.y1 - 0.01
  const b0 = boxOf(sim)
  const floored = floorNearHigh(sim, (b0.x0 + b0.x1) / 2, (b0.y0 + b0.y1) / 2, (b0.z0 + b0.z1) / 2, (b0.y1 - b0.y0) / 2 + 0.03)
  return {
    view: 'high',
    to,
    met: (s, p) => inside(boxOf(s), p.at[0], p.at[1], p.at[2], 0) && (settled(p) || !floored),
    nodes: (g) => {
      const b = boxOf(g.now)
      const spots = g.spots.flatMap((s, i) => (inside(b, s.x, s.y, s.z, -0.1) ? [i] : []))
      const moving = g.moving.flatMap((m, k) => (m.tops.some((t) => t.y >= b.y0 - 0.03 && t.y <= b.y1 && t.o.maxX > b.x0 && t.o.minX < b.x1 && t.o.maxY > b.z0 && t.o.minY < b.z1) ? [g.spots.length + k] : []))
      return [...spots, ...moving]
    },
    aim: (s) => {
      const b = boxOf(s)
      return [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]
    },
    key: (s) => {
      const b = boxOf(s)
      return keyOf3(b.x0, b.y0, b.z0) + (z.hidden ? 7 : 0)
    },
  }
}

/** Standing on one of these solids (a solid, or every solid of a mover), nearly still, with the feet wholly on its footprint. */
export function standGoalHigh(solids: readonly HandleId[], to: string): HighGoal {
  const ids = new Set(solids)
  const middle = (s: Sim): [number, number] => {
    let x = 0
    let z = 0
    for (const id of solids) {
      const o = s.outlines[s.where[id].i]
      x += o.cx / solids.length
      z += o.cy / solids.length
    }
    return [x, z]
  }
  return {
    view: 'high',
    to,
    met: (s, p) => {
      if (p.on === null || !ids.has(p.on) || !settled(p)) return false
      const o = s.outlines[s.where[p.on].i]
      const f = (CONTROL.foot * p.size) / 2
      return [-f, f].every((dx) => [-f, f].every((dz) => contains(o, p.at[0] + dx, p.at[2] + dz)))
    },
    nodes: (g) => [...g.spots.flatMap((s, i) => (ids.has(s.on) ? [i] : [])), ...g.moving.flatMap((m, k) => (ids.has(m.id) ? [g.spots.length + k] : []))],
    aim: middle,
    key: (s) => {
      const [x, z] = middle(s)
      return keyOf3(x, 0, z)
    },
  }
}

/** A body's box from high up at feet x, y, z. */
const bodyBox3 = (p: Player, x: number, y: number, z: number): Box3 => playerBox3({ ...p, at: [x, y, z] }, emptyBox3())

/** Within reach of a box (a thing, decor, a lamp, a sign, a player, a solid with use), standing. */
export function reachGoalHigh(boxOf: (s: Sim) => Box3 | null, to: string): HighGoal {
  const near = (b: Box3, s: { x: number; z: number }) => s.x > b.x0 - 3 && s.x < b.x1 + 3 && s.z > b.z0 - 3 && s.z < b.z1 + 3
  return {
    view: 'high',
    to,
    met: (s, p) => {
      const b = boxOf(s)
      return b !== null && settled(p) && gap3(playerBox3(p, emptyBox3()), b) <= FEEL.reach
    },
    nodes: (g) => {
      const b = boxOf(g.now)
      return b === null ? [] : g.spots.flatMap((s, i) => (near(b, s) && gap3(bodyBox3(g.self, s.x, s.y, s.z), b) <= FEEL.reach - 0.1 ? [i] : []))
    },
    aim: (s) => {
      const b = boxOf(s)
      return b === null ? [0, 0] : [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]
    },
    key: (s) => {
      const b = boxOf(s)
      return b === null ? -1 : keyOf3(b.x0, b.y0, b.z0)
    },
  }
}

/** Where a press of grab picks up this thing from high up: standing, empty handed, where the thing grab takes is this one and no other nearer. */
export function grabGoalHigh(sim: Sim, self: Player, thing: HandleId, to: string): HighGoal {
  const th = () => sim.world.things[sim.where[thing].i]
  const reach = reachGoalHigh(() => thingBox3(th(), emptyBox3()), to)
  return {
    ...reach,
    met: (s, p) => settled(p) && p.holding === null && grabChoiceFloor(s, p) === thing,
    nodes: (g) => {
      const b = thingBox3(th(), emptyBox3())
      return g.spots.flatMap((s, i) => (s.x > b.x0 - 1.5 && s.x < b.x1 + 1.5 && s.z > b.z0 - 1.5 && s.z < b.z1 + 1.5 && grabChoiceFloor(g.now, { ...self, at: [s.x, s.y, s.z], holding: null }) === thing ? [i] : []))
    },
  }
}

/** Where a thing set down from the hands of p facing (hx, 0, hz) comes to rest from high up: its foot, and what it rests on; null when it would fall out of the room. */
export function landingHigh(sim: Sim, p: Player, th: Thing, hx: number, hz: number): { at: Vec3; on: HandleId } | null {
  const at = putDownAtFloor(sim, { ...p, heading: [hx, 0, hz] }, th)
  const x0 = at[0] + th.box.min[0]
  const x1 = at[0] + th.box.max[0]
  const z0 = at[2] + th.box.min[2]
  const z1 = at[2] + th.box.max[2]
  const bottom = at[1] + th.box.min[1]
  const low = sim.world.bounds.min[1] - 1
  const list = gatherFloor(sim, x0 - 0.1, low, z0 - 0.1, x1 + 0.1, bottom + 0.1, z1 + 0.1)
  if (!groundUnderFloor(sim, list, x0, z0, x1, z1, low, bottom, bottom, th.id, false, -1, g0)) return null
  return { at: [at[0], g0.y - th.box.min[1], at[2]], on: g0.id }
}

/** The ways a bot from high up tries to face when it sets a thing down: the way it faces, toward where the thing goes, and the four ways of the floor. */
export function putHeadings(p: Player, aim: readonly [number, number]): [number, number][] {
  const dx = aim[0] - p.at[0]
  const dz = aim[1] - p.at[2]
  const d = Math.sqrt(dx * dx + dz * dz)
  const out: [number, number][] = [[p.heading[0], p.heading[2]]]
  if (d > 1e-6) out.push([dx / d, dz / d])
  out.push([1, 0], [-1, 0], [0, 1], [0, -1])
  return out
}

/**
 * Where a press of grab from high up sets the carried thing down so that it comes to rest there,
 * facing any of putHeadings's ways, and only where nothing with use is within reach (there the press
 * would use it). Spots further than `near` from the aim on the floor are not asked.
 */
export function putGoalHigh(sim: Sim, self: Player, thing: HandleId, there: ThereTest, aim: (s: Sim) => readonly [number, number], near: number, to: string): HighGoal {
  const th = () => sim.world.things[sim.where[thing].i]
  const lands = (s: Sim, p: Player) => {
    const g = grabChoiceFloor(s, p)
    if (g !== null && s.listens[g].use) return false
    return putHeadings(p, aim(s)).some(([hx, hz]) => {
      const l = landingHigh(s, p, th(), hx, hz)
      return l !== null && there(s, th(), l.at, l.on)
    })
  }
  return {
    view: 'high',
    to,
    met: (s, p) => settled(p) && p.holding === thing && lands(s, p),
    nodes: (g) => {
      const [ax, az] = aim(g.now)
      return g.spots.flatMap((s, i) => ((s.x - ax) ** 2 + (s.z - az) ** 2 <= near * near && lands(g.now, { ...self, at: [s.x, s.y, s.z], on: s.on, holding: thing }) ? [i] : []))
    },
    aim,
    key: (s) => {
      const [x, z] = aim(s)
      return keyOf3(x, 0, z)
    },
  }
}

/**
 * Behind a thing from high up, to push it along the floor the unit way `way` gives (toward where it
 * goes): the feet on the line through its middle, just clear of its far side, at its level.
 */
export function behindGoalHigh(sim: Sim, self: Player, thing: HandleId, way: () => readonly [number, number], to: string): HighGoal {
  const th = () => sim.world.things[sim.where[thing].i]
  const spot = (): [number, number, number] => {
    const t = th()
    const [ux, uz] = way()
    const ext = (Math.abs(ux) * (t.box.max[0] - t.box.min[0])) / 2 + (Math.abs(uz) * (t.box.max[2] - t.box.min[2])) / 2
    const back = ext + playerWidth(self) / 2 + 0.08
    const mx = t.at[0] + (t.box.min[0] + t.box.max[0]) / 2
    const mz = t.at[2] + (t.box.min[2] + t.box.max[2]) / 2
    return [mx - ux * back, t.at[1] + t.box.min[1], mz - uz * back]
  }
  const at = (x: number, y: number, z: number) => {
    const [sx, sy, sz] = spot()
    return (x - sx) ** 2 + (z - sz) ** 2 <= 0.2 * 0.2 && Math.abs(y - sy) <= FEEL.stepUp
  }
  return {
    view: 'high',
    to,
    met: (_, p) => p.on !== null && at(p.at[0], p.at[1], p.at[2]),
    nodes: (g) => g.spots.flatMap((s, i) => (at(s.x, s.y, s.z) ? [i] : [])),
    aim: () => {
      const [x, , z] = spot()
      return [x, z]
    },
    key: () => {
      const [x, y, z] = spot()
      return keyOf3(x, y, z)
    },
  }
}

// ------------------------------------------------------------------------------ the search

/** A move: the stick as the pad holds it ([x, y], y up walking -z) and the jump, as the side's Move. */
interface HighMove {
  readonly sx: number
  readonly sy: number
  readonly jump: 0 | 1 | 2 | 3
}

/** A child of the beam, as the side's Node, with its feet's z. */
interface HighNode {
  readonly p: Player
  held: boolean
  armed: boolean
  anchor: number
  readonly parent: HighNode | null
  readonly move: HighMove | null
  readonly holds: number[]
  readonly feet: number[]
  readonly ons: (HandleId | null)[]
  score: number
  dead: boolean
}

const COMPASS: readonly [number, number][] = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [cos((k * Math.PI) / 4), sin((k * Math.PI) / 4)])
const TURN_C = cos(HIGH_SEARCH.turn)
const TURN_S = sin(HIGH_SEARCH.turn)

/** One bot's planner from high up: its distances, kept while the room stays as it was. */
export class HighPlanner {
  expansions = 0
  plans = 0
  private waited = 0
  private dists = new Map<string, { goal: HighGoal; graph: HighGraph; version: number; dist: Float64Array }>()

  constructor(
    readonly room: Room,
    readonly seat: number,
    private readonly foresight: Foresight,
  ) {}

  private get me(): Player {
    return this.room.world.players[this.seat]
  }

  private jumpButton(p: Player): 'a' | 'b' | null {
    return p.a === 'jump' ? 'a' : p.b === 'jump' ? 'b' : null
  }

  private distances(graph: HighGraph, goal: HighGoal, goalKey: number, alone: boolean): Float64Array {
    const id = `${goal.to}|${goalKey}|${graph.heads}|${alone}`
    const known = this.dists.get(id)
    if (known !== undefined && known.goal === goal && known.graph === graph && known.version === graph.version) return known.dist
    const dist = graph.distances(goal.nodes(graph), alone)
    this.dists.set(id, { goal, graph, version: graph.version, dist })
    return dist
  }

  /** The rest of a plan played from where the bot is now in the room as it stands now, as the side's recheck. */
  recheck(plan: Plan, next: number, goal: HighGoal): Plan | null {
    const real = this.me
    const sim = this.room.sim
    const jumpOn = this.jumpButton(real)
    const shadow = new Shadow(sim, this.foresight, plan.x.length - next)
    const p: Player = { ...real }
    let held = jumpOn === null ? false : real.input[jumpOn]
    for (let f = next; f < plan.x.length; f++) {
      shadow.advance()
      shadow.carryHigh(p)
      const button = plan.jump[f] ? (held ? HELD : PRESSED) : UP
      held = plan.jump[f]
      if (!shadow.moveHigh(p, padOf(plan.sx[f], plan.sy[f], jumpOn, button))) return null
      if (Math.abs(p.at[0] - plan.x[f]) > SEARCH.stray || Math.abs(p.at[1] - plan.y[f]) > SEARCH.stray || Math.abs(p.at[2] - plan.z[f]) > SEARCH.stray || (p.on === null) !== (plan.on[f] === null)) return null
    }
    if (plan.reached && !goal.met(shadow.sim, p)) return null
    return { ...plan, roomKey: roomKey(sim, this.seat, 'plan'), aim: goal.aim(sim) }
  }

  /** A plan to stand still for `frames` frames, as the side's. */
  private standStill(frames: number, key: number, aim: readonly [number, number]): Plan | null {
    const real = this.me
    const sim = this.room.sim
    const shadow = new Shadow(sim, this.foresight, frames)
    const p: Player = { ...real }
    const plan = { start: sim.world.frame, sx: [] as number[], sy: [] as number[], jump: [] as boolean[], x: [] as number[], y: [] as number[], z: [] as number[], on: [] as (HandleId | null)[], reached: false, waits: true, roomKey: key, aim }
    for (let f = 0; f < frames; f++) {
      shadow.advance()
      shadow.carryHigh(p)
      if (!shadow.moveHigh(p, padOf(0, 0, null, UP))) return null
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

  /**
   * A plan to the goal from where the bot is now. Throws the sentence when there is no way. When the
   * graph has a way the search could not follow, the first jump of that way within a few metres of
   * where the search stopped is one the bot's real moves cannot make (onto a thing barely big enough
   * to stand on, say, and from there over a wall): it is taken out of the graph and the search runs
   * again, up to HIGH_SEARCH.drops times, so a way round is found when there is one.
   */
  plan(goal: HighGoal): Plan {
    for (let drops = 0; ; drops++) {
      const tried = this.planOnce(goal, drops < HIGH_SEARCH.drops)
      if (tried.plan !== null) return tried.plan
      tried.drop()
    }
  }

  private planOnce(goal: HighGoal, mayDrop: boolean): { plan: Plan; drop: () => void } | { plan: null; drop: () => void } {
    this.plans += 1
    const real = this.me
    const sim = this.room.sim
    const key = roomKey(sim, this.seat, 'plan')
    const goalKey = goal.key(sim)
    const from = placeHigh(real.at[0], real.at[1], real.at[2])
    if (real.stick === 'none') throw new Mistake(WALK_MISTAKES.noWay(this.seat, from, goal.to, "its stick is 'none', so it moves only as the room moves it", 'steer it and wait for the room instead'))
    const fly = real.stick === 'fly'
    // The floor graph without the other players' heads; with them only when there is no way without a boost.
    let graph = fly ? null : this.foresight.highGraph(real, false)
    let dist = graph === null ? null : this.distances(graph, goal, goalKey, false)
    const startOf = (g: HighGraph) => (real.on !== null ? g.nodeAt(real) : g.spotUnder(real.at[0], real.at[1], real.at[2]))
    // The graph without boosts, kept for the sentence when the way with one fails too: it names what the room itself lacks.
    const plain = graph === null || dist === null ? null : { graph, dist, start: startOf(graph) }
    if (plain !== null && (plain.start < 0 || !Number.isFinite(plain.dist[plain.start]))) {
      graph = this.foresight.highGraph(real, true)
      dist = this.distances(graph, goal, goalKey, false)
    }
    const boosted = plain !== null && graph !== plain.graph
    const horizon = Math.round(GOTO.secs / DT)
    const jumpOn = this.jumpButton(real)
    // When the best way boards a moving solid further on, the search goes first to the spot it boards from, as from the side.
    const toGoal = dist
    let target = goal
    if (graph !== null && dist !== null && real.on !== null) {
      const start = graph.nodeAt(real)
      const board = start >= 0 && start < graph.spots.length ? boardingOn(graph, dist, start) : -1
      if (board >= 0 && board !== start) {
        const s = graph.spots[board]
        const there = pointGoalHigh(sim, [s.x, s.y, s.z], GOTO.near, `${goal.to}, by way of ${placeHigh(s.x, s.y, s.z)}`)
        if (!there.met(sim, real)) {
          target = there
          dist = this.distances(graph, target, target.key(sim), false)
        }
      }
    }
    const aim = target.aim(sim)
    const g = graph
    const d = dist
    const col = GRAPH.column

    // The best next node from each node along the way, worked out once a node for this plan.
    const nexts = g === null ? null : new Int32Array(g.size).fill(-2)
    const nextOf = (a: number): number => {
      if (g === null || d === null || nexts === null) return -1
      if (nexts[a] !== -2) return nexts[a]
      let best = -1
      let bestCost = Infinity
      for (const e of g.out[a]) {
        if (e.cost + d[e.to] < bestCost) {
          bestCost = e.cost + d[e.to]
          best = e.to
        }
      }
      nexts[a] = Number.isFinite(bestCost) && d[a] > 0 ? best : -1
      return nexts[a]
    }
    /** Where a body standing on node `anchor` heads: the carrot along the graph's way, whether that way jumps next, and whether it is the last spot of the way. */
    const carrotOf = (p: Player, anchor: number, shadow: Shadow): { x: number; z: number; jump: boolean; last: boolean } => {
      if (g === null || d === null || anchor < 0 || !Number.isFinite(d[anchor])) return { x: aim[0], z: aim[1], jump: false, last: true }
      if (anchor >= g.spots.length) {
        const b = nextOf(anchor)
        if (b < 0 || b >= g.spots.length) return { x: aim[0], z: aim[1], jump: false, last: d[anchor] === 0 }
        return { x: g.spots[b].x, z: g.spots[b].z, jump: true, last: d[b] === 0 }
      }
      let a = anchor
      let x = g.spots[a].x
      let z = g.spots[a].z
      for (let k = 0; k < 12 && d[a] > 0; k++) {
        const b = nextOf(a)
        if (b < 0) break
        if (b >= g.spots.length) {
          const o = shadow.sim.outlines[g.moving[b - g.spots.length].solid]
          return { x: o.cx, z: o.cy, jump: true, last: false }
        }
        const B = g.spots[b]
        const walks = g.walks(a, b)
        x = B.x
        z = B.z
        a = b
        if (!walks) return { x, z, jump: true, last: d[b] === 0 }
        if ((x - p.at[0]) ** 2 + (z - p.at[2]) ** 2 > HIGH_SEARCH.carrot * HIGH_SEARCH.carrot) break
      }
      return { x, z, jump: false, last: d[a] === 0 }
    }

    /** Whether the floor under body p ends within a decision's run (or a little more) the way (ux, uz) points: where a jump kept for the edge can matter. */
    const endAhead = (p: Player, ux: number, uz: number): boolean => {
      if (g === null) return true
      const run = Math.ceil((FEEL.walk * SEARCH.decision * DT + 0.3) / col)
      let y = p.at[1]
      for (let k = 0; k <= run; k++) {
        const s = g.spotNear(p.at[0] + ux * k * col, y, p.at[2] + uz * k * col)
        if (s < 0 || Math.abs(g.spots[s].y - y) > FEEL.stepUp) return true
        y = g.spots[s].y
      }
      return false
    }

    /** The seconds to go of a body in the air moving vy m/s up against a pull of `pulled` (or riding a solid that moves, as if it jumped now): the best, over the spots it can still come down on, of the time to fall to it and its seconds to go. */
    let lowest = Infinity
    if (g !== null) for (const s of g.spots) lowest = Math.min(lowest, s.y)
    const comingDown = (p: Player, vy: number, pulled: number): number => {
      if (g === null || d === null || pulled <= 0) return Infinity
      const x = p.at[0]
      const y = p.at[1]
      const z = p.at[2]
      const disc0 = vy * vy + 2 * pulled * (y - lowest)
      const tMost = disc0 < 0 ? 0 : (vy + Math.sqrt(disc0)) / pulled
      const r = Math.min(8, CONTROL.airSpeed * tMost + col + g.foot)
      const ix0 = Math.max(0, Math.floor((x - r - g.x0) / col))
      const ix1 = Math.min(g.nx - 1, Math.ceil((x + r - g.x0) / col))
      const iz0 = Math.max(0, Math.floor((z - r - g.z0) / col))
      const iz1 = Math.min(g.nz - 1, Math.ceil((z + r - g.z0) / col))
      let best = Infinity
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          for (const i of g.cells[ix + iz * g.nx]) {
            const s = g.spots[i]
            if (!Number.isFinite(d[i]) || d[i] >= best) continue
            const gg = Math.max(pulled, s.g)
            const disc = vy * vy + 2 * gg * (y - s.y)
            if (disc < 0) continue
            const t = (vy + Math.sqrt(disc)) / gg
            // Across to where the feet square first overlaps the spot's cell (off a floor's corner the feet land well out from a spot's middle), against the air speed alone: steering in the air is near at once, so a decision's run on is not added, which would let jumps that fall short crowd the beam.
            const ax = Math.max(0, Math.abs(s.x - x) - col / 2 - g.foot)
            const az = Math.max(0, Math.abs(s.z - z) - col / 2 - g.foot)
            if (t < 0 || Math.sqrt(ax * ax + az * az) > CONTROL.airSpeed * t) continue
            if (t + d[i] < best) best = t + d[i]
          }
        }
      }
      return best
    }

    const scoreOf = (n: HighNode, frame: number): number => {
      const p = n.p
      const line = Math.sqrt((p.at[0] - aim[0]) ** 2 + (p.at[2] - aim[1]) ** 2) / FEEL.walk
      if (g === null || d === null) return line
      let s = n.anchor < 0 ? Infinity : timed(g, d, n.anchor, frame)
      if (p.on === null) s = Math.min(s, comingDown(p, p.velocity[1], leapAtHigh(sim, p, p.at[0], p.at[1], p.at[2], 0).g))
      else if (n.anchor < 0 || n.anchor >= g.spots.length) {
        const leap = leapAtHigh(sim, p, p.at[0], p.at[1], p.at[2], 0)
        s = Math.min(s, comingDown(p, leap.vy, leap.g))
      }
      return (Number.isFinite(s) ? s : SEARCH.far + line) + SEARCH.tie * line
    }
    const anchorOf = (p: Player, before: number): number => {
      if (g === null) return -1
      if (p.on !== null) {
        const n = g.nodeAt(p)
        if (n >= 0) return n
      }
      return before
    }

    const root: HighNode = {
      p: { ...real },
      held: jumpOn === null ? false : real.input[jumpOn],
      armed: false,
      anchor: g === null ? -1 : startOf(g),
      parent: null,
      move: null,
      holds: [],
      feet: [],
      ons: [],
      score: 0,
      dead: false,
    }
    if (root.anchor < 0 && g !== null) root.anchor = g.spotUnder(real.at[0], real.at[1], real.at[2])
    root.score = scoreOf(root, sim.world.frame)

    // Waiting for a moving solid, or riding one, as from the side.
    let nearMover = false
    if (g !== null && toGoal !== null && target === goal && root.anchor >= 0 && settled(real)) {
      const at = (sim.world.frame - g.frame0) / GRAPH.sampleFrames
      let wait = Infinity
      if (root.anchor >= g.spots.length) wait = leaveBest(g, toGoal, root.anchor, at, 0).wait
      else if (g.boarding.has(root.anchor)) {
        const board = boardBest(g, toGoal, root.anchor, at)
        if (board.secs < this.distances(g, goal, goalKey, true)[root.anchor]) wait = board.wait
      }
      nearMover = Number.isFinite(wait)
      if (nearMover && wait > SEARCH.waitMin) {
        const still = this.standStill(Math.round((wait - SEARCH.waitLead) / DT), key, aim)
        if (still !== null) return { plan: still, drop: () => {} }
      }
    }

    const decisions = Math.ceil(horizon / SEARCH.decision)
    const move = (ux: number, uz: number, k: number, jump: HighMove['jump']): HighMove => ({ sx: ux * k, sy: -uz * k, jump })

    /** The moves a child tries next, as `spread` allows. */
    const movesOf = (node: HighNode, shadow: Shadow, spread: number): HighMove[] => {
      const p = node.p
      const c = carrotOf(p, node.anchor, shadow)
      const cx = c.x - p.at[0]
      const cz = c.z - p.at[2]
      const cd = Math.sqrt(cx * cx + cz * cz)
      const ways: [number, number, number][] = []
      if (cd > 0.05) {
        const ux = cx / cd
        const uz = cz / cd
        ways.push([ux, uz, c.last ? Math.min(1, cd / HIGH_SEARCH.ease) : 1])
        if (spread >= 1) ways.push([ux * TURN_C - uz * TURN_S, ux * TURN_S + uz * TURN_C, 1], [ux * TURN_C + uz * TURN_S, -ux * TURN_S + uz * TURN_C, 1])
        if (spread >= 2) ways.push([ux, uz, 0.5])
      }
      if (spread >= 2) for (const [ux, uz] of COMPASS) ways.push([ux, uz, 1])
      const out: HighMove[] = []
      if (cd <= 0.05 || spread >= 1) out.push(move(0, 0, 0, 0))
      if (fly) {
        for (const [ux, uz, k] of ways) out.push(move(ux, uz, k, 0))
        return out
      }
      const ground = p.on !== null && !p.steep
      for (const [ux, uz, k] of ways) {
        out.push(move(ux, uz, k, 0))
        if (!ground || jumpOn === null || node.held || k < 1) continue
        if (spread >= 1 || c.jump) out.push(move(ux, uz, k, 2))
        if ((spread >= 1 || c.jump) && endAhead(p, ux, uz)) out.push(move(ux, uz, k, 3))
      }
      return out
    }

    /** One attempt of the beam: the node that got there and the frames into its decision, or the best node it reached. */
    const attempt = (width: number, standingSlots: number, stallSecs: number, spread: number): { found: { node: HighNode; frames: number } | null; best: HighNode } => {
      const shadow = new Shadow(sim, this.foresight, horizon)
      const w = shadow.sim.world
      let beam: HighNode[] = [root]
      let best = root
      let progress = root.score
      let progressAt = 0
      let expansions = 0
      for (let depth = 0; depth < decisions; depth++) {
        const children: HighNode[] = []
        for (const node of beam) {
          for (const m of movesOf(node, shadow, spread)) {
            children.push({ p: { ...node.p }, held: node.held, armed: node.armed, anchor: node.anchor, parent: node, move: m, holds: [], feet: [], ons: [], score: 0, dead: false })
          }
        }
        expansions += children.length
        for (let k = 0; k < SEARCH.decision; k++) {
          shadow.advance()
          const t = w.t
          for (const c of children) {
            if (c.dead) continue
            const p = c.p
            const m = c.move as HighMove
            shadow.carryHigh(p)
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
            if (!shadow.moveHigh(p, padOf(m.sx, m.sy, jumpOn, button))) {
              c.dead = true
              continue
            }
            if (flying && p.on !== null) c.armed = false
            c.holds.push(m.sx, m.sy, c.held ? 1 : 0)
            c.feet.push(p.at[0], p.at[1], p.at[2])
            c.ons.push(p.on)
            c.anchor = anchorOf(p, c.anchor)
            if (target.met(shadow.sim, p)) {
              this.expansions += expansions
              return { found: { node: c, frames: k + 1 }, best }
            }
          }
        }
        // The beam: the best child of each kind, best first; a share of it standing.
        const kept = new Map<string, HighNode>()
        for (const c of children) {
          if (c.dead) continue
          c.score = scoreOf(c, w.frame)
          const p = c.p
          const id = `${Math.round(p.at[0] * 20)}|${Math.round(p.at[1] * 20)}|${Math.round(p.at[2] * 20)}|${Math.round(p.velocity[0] * 2)}|${Math.round(p.velocity[2] * 2)}|${Math.round(p.velocity[1])}|${p.on === null ? 0 : 1}|${c.held ? 1 : 0}`
          const known = kept.get(id)
          if (known === undefined || c.score < known.score) kept.set(id, c)
        }
        const order = (a: HighNode, b: HighNode) => a.score - b.score || Number(b.p.on !== null) - Number(a.p.on !== null)
        const sorted = [...kept.values()].sort(order)
        const standing = sorted.filter((n) => n.p.on !== null).slice(0, standingSlots)
        const chosen = new Set(standing)
        beam = [...standing, ...sorted.filter((n) => !chosen.has(n)).slice(0, width - standing.length)].sort(order)
        if (beam.length === 0) break
        const lead = beam.find((n) => settled(n.p))
        if (lead !== undefined && lead.score < best.score) best = lead
        if (beam[0].score < progress - SEARCH.gain) {
          progress = beam[0].score
          progressAt = depth
        }
        if ((depth - progressAt) * SEARCH.decision * DT > stallSecs || expansions > HIGH_SEARCH.expansions) break
      }
      this.expansions += expansions
      return { found: null, best }
    }

    let best = root
    let found: { node: HighNode; frames: number } | null = null
    const patient = nearMover && this.waited < SEARCH.retries
    // A way only over a boost (a thing's top, a head) is tried by the narrow attempts alone: a wide search for one costs much and seldom finds it.
    for (const a of patient ? HIGH_SEARCH.attempts.slice(0, 1) : boosted ? HIGH_SEARCH.attempts.slice(0, 2) : HIGH_SEARCH.attempts) {
      const tried = attempt(a.beam, a.standing, a.stallSecs, a.spread)
      if (tried.found !== null) {
        found = tried.found
        break
      }
      if (tried.best.score < best.score) best = tried.best
    }

    const make = (node: HighNode, frames: number, reached: boolean): Plan => {
      const chain: HighNode[] = []
      for (let n: HighNode | null = node; n !== null && n.parent !== null; n = n.parent) chain.push(n)
      chain.reverse()
      const plan = { start: sim.world.frame, sx: [] as number[], sy: [] as number[], jump: [] as boolean[], x: [] as number[], y: [] as number[], z: [] as number[], on: [] as (HandleId | null)[], reached, waits: false, roomKey: key, aim }
      chain.forEach((n, i) => {
        const count = i === chain.length - 1 ? frames : n.ons.length
        for (let f = 0; f < count; f++) {
          plan.sx.push(n.holds[3 * f])
          plan.sy.push(n.holds[3 * f + 1])
          plan.jump.push(n.holds[3 * f + 2] === 1)
          plan.x.push(n.feet[3 * f])
          plan.y.push(n.feet[3 * f + 1])
          plan.z.push(n.feet[3 * f + 2])
          plan.on.push(n.ons[f])
        }
      })
      return plan
    }
    if (found !== null) {
      this.waited = 0
      return { plan: make(found.node, found.frames, target === goal), drop: () => {} }
    }
    // A way part of the way, as from the side: when the graph has no way at all, never to a place the bot could not come back from.
    const deadEnd = g !== null && d !== null && root.anchor >= 0 && best.anchor >= 0 && !Number.isFinite(d[root.anchor]) && g.reached(best.anchor)[root.anchor] !== 1
    if (best !== root && !deadEnd && best.score < root.score - (nearMover ? SEARCH.gain : SEARCH.partialGain)) {
      this.waited = 0
      return { plan: make(best, best.ons.length, false), drop: () => {} }
    }
    if (patient) {
      const still = this.standStill(2 * SEARCH.decision, key, aim)
      if (still !== null) {
        this.waited += 1
        return { plan: still, drop: () => {} }
      }
    }
    this.waited = 0
    // The graph has a way the search could not follow: the first jump of it a few metres on from where the search got, taken out.
    if (mayDrop && g !== null && d !== null) {
      let a = best.anchor >= 0 ? best.anchor : root.anchor
      for (let k = 0; k < 16 && a >= 0 && a < g.spots.length && Number.isFinite(d[a]) && d[a] > 0; k++) {
        const b = nextOf(a)
        if (b < 0 || b >= g.spots.length) break
        if (!g.walks(a, b)) return { plan: null, drop: () => g.dropJumpsInto(b) }
        a = b
      }
    }
    // No way: why, from the graph.
    if (g === null || d === null) throw new Mistake(WALK_MISTAKES.noWay(this.seat, from, goal.to, 'flying there, something stands in the way', `it flies ${FEEL.walk} m/s`))
    const start = root.anchor
    if (start >= 0 && Number.isFinite(d[start]) && d[start] > GOTO.secs) throw new Mistake(WALK_MISTAKES.tooFar(this.seat, goal.to))
    const stuck = best.anchor >= 0 ? best.anchor : start
    const name = (id: HandleId) => this.room.describe(id)
    const why =
      plain !== null && boosted
        ? missingEdgeHigh(plain.graph, plain.start, plain.dist, name, goal.aim(sim))
        : start >= 0 && Number.isFinite(d[start])
          ? nextEdgeHigh(g, stuck, d, name, goal.aim(sim))
          : missingEdgeHigh(g, start, d, name, goal.aim(sim))
    throw new Mistake(WALK_MISTAKES.noWay(this.seat, from, goal.to, why.gap, why.reach))
  }
}
