/**
 * Magic House: the bots' floor graph (trial/api.ts, the notes for step 3). A coarse map of where a
 * bot can stand and how it gets from one place to another, which scores the beam search
 * (trial/search.ts) and, when the search finds no way, says what is missing.
 *
 * - A spot is a place to stand: one a column every GRAPH.column metres across the room, at every
 *   floor's top there that is not too steep and leaves room for the body above it: a still solid's,
 *   a loose thing's at rest, or (in a graph with heads, built when there is no way without a boost)
 *   the head of a player standing still.
 * - Spots in the next column are joined by walking where the step between them is at most
 *   FEEL.stepUp. Any two spots are joined by a jump or a drop where a running jump carries the feet
 *   across the gap between them at that height, and the jump rises that high before the head meets
 *   a solid over the spot it leaves or the room's top; a jump stopped so falls from there, and
 *   carries the feet less far (reachUnder).
 * - A solid that moves (in a mover whose place changes, or on a slide or a turn under way) is one
 *   node, joined to every spot its top comes within a jump of at some time over the horizon, and to
 *   every other moving solid it meets so. It keeps when it meets each spot, so the search can count
 *   the wait for it and the ride on it (trial/search.ts).
 * - Dijkstra from the spots that count as there gives every node its seconds to go.
 */

import { FEEL } from '../engine/api'
import { bottomUnder, overlaps } from '../engine/geometry'
import { CONTROL, STEEP } from '../engine/player'
import { DT, groundUnder, playerHeight, playerWidth, solidActive, thingLoose, whereOf, zoneForces, type Forces, type Ground, type Sim } from '../engine/state'
import type { HandleId, Player } from '../engine/world'

/** The graph's own numbers. */
export const GRAPH = {
  /** Metres between columns of spots. */
  column: 0.25,
  /** Seconds added to every jump and drop, so walking is chosen where it does as well. */
  jumpCost: 0.2,
  /** Seconds added to boarding or leaving a solid that moves, for the wait and the ride. */
  moverCost: 1,
  /** Frames between samples of a moving solid's top over the horizon. */
  sampleFrames: 15,
  /** A moving solid that comes to rest within this many seconds is a still floor where it rests, to the graph (the search still plays its every frame). */
  settleSecs: 1,
  /** How far apart, metres, two floors' tops may be and still be one walk across a column's step. */
  stepSlack: 0.02,
} as const

/** A place a bot can stand. */
export interface Spot {
  /** The feet, at the middle of the column. */
  readonly x: number
  readonly y: number
  /** What it stands on: a solid, a thing or a player's head, by id. */
  readonly on: HandleId
  /** The feet's x this spot stands for: a column wide, cut where the floor ends (the feet stand out over an end by half their width). */
  readonly lo: number
  readonly hi: number
  /** How high a jump from here lifts the feet before it tops out or the head meets a solid above, metres. */
  readonly rise: number
  /** The speed up a jump from here leaves at, m/s (a jump's, or a bounce's on a bouncy floor), and the pull down it meets here, m/s² (the world's, with the zones' gravity and wind). */
  readonly vy: number
  readonly g: number
  readonly col: number
}

/** A moving solid's top over the horizon, the jump from it there (as a Spot's), and the samples it is there at. */
export interface MovingTop {
  readonly lo: number
  readonly hi: number
  readonly y: number
  readonly vy: number
  readonly g: number
  /** The samples (every GRAPH.sampleFrames frames from the graph's frame) it is there at, in order. */
  readonly when: number[]
}

/** A solid that moves, as one node of the graph. */
export interface MovingNode {
  /** Its index in the World's solids, and its id. */
  readonly solid: number
  readonly id: HandleId
  /** Its tops every GRAPH.sampleFrames frames from now over the horizon, each one once, in the order they first come. */
  readonly tops: readonly MovingTop[]
  /** The samples at which a body on each spot (by index) can step or jump onto it, and off it onto that spot, in order. */
  readonly board: Map<number, number[]>
  readonly leave: Map<number, number[]>
}

export interface Edge {
  readonly to: number
  readonly cost: number
}

/**
 * How far across, metres, a running jump carries the feet (from the middle of the feet where it
 * leaves to where they come down) before they come down to `rise` metres above where it began, at
 * `vy` m/s up against a pull of `g` m/s² down; -1 where it never rises that high. A walk off an edge
 * still jumps for CONTROL.coyote, which carries it that much further. Where nothing pulls down (a
 * zone of no gravity) the stick moves the body up and down, and anything near is in reach.
 */
export function reachAcross(rise: number, vy: number, g: number): number {
  if (g <= 0) return FAR
  const d = vy * vy - 2 * g * rise
  if (d < 0) return -1
  return (CONTROL.airSpeed * (vy + Math.sqrt(d))) / g + CONTROL.coyote * CONTROL.airSpeed
}

/** What reachAcross gives where nothing pulls down: farther than any room. */
export const FAR = 100

/**
 * The time a jump at `vy` m/s up against `g` m/s² down first lifts the feet `cap` metres, where
 * something stops the head (a ceiling, or the room's top from high up, which hold it as the
 * controller does: the rise stops and the fall begins from there). Infinity where it never rises
 * that high.
 */
function capTime(vy: number, g: number, cap: number): number {
  const d = vy * vy - 2 * g * cap
  return d < 0 ? Infinity : (vy - Math.sqrt(d)) / g
}

/**
 * reachAcross under something that stops the head where the feet have risen `cap` metres (a spot's
 * rise): stopped there, the jump falls from that height, so it carries the feet less far. As
 * reachAcross where the jump tops out first; -1 where `rise` is above `cap`.
 */
export function reachUnder(rise: number, vy: number, g: number, cap: number): number {
  if (g <= 0 || cap >= apex(vy, g) - 1e-9) return reachAcross(rise, vy, g)
  if (rise > cap + 1e-9) return -1
  return CONTROL.airSpeed * (capTime(vy, g, cap) + Math.sqrt((2 * (cap - rise)) / g)) + CONTROL.coyote * CONTROL.airSpeed
}

/** How high the feet are `t` s into a jump at `vy` m/s up against `g` m/s² down, under something that stops them at `cap` metres, as reachUnder reckons it. */
export function arcAt(t: number, vy: number, g: number, cap: number): number {
  const t1 = g > 0 ? capTime(vy, g, cap) : Infinity
  return t <= t1 ? vy * t - 0.5 * g * t * t : cap - 0.5 * g * (t - t1) * (t - t1)
}

const pull: Forces = { ax: 0, ay: 0, gravity: 1, drag: 0 }

/**
 * The jump of body p from feet at x, y: the speed up it leaves at (a held jump's, or a bounce's on a
 * floor that bounces `bounce` metres) and the pull down it meets there, as the controller reckons
 * them from the zones (engine/player.ts movePlayer): the world's pull times the zones' gravity,
 * less their wind up.
 */
export function leapAt(sim: Sim, p: Player, x: number, y: number, bounce: number): { vy: number; g: number } {
  const hw = playerWidth(p) / 2
  zoneForces(sim, { x0: x - hw, y0: y, x1: x + hw, y1: y + playerHeight(p) }, p.change === null ? 1 : p.change.weight, pull)
  const k = p.change === null ? 1 : p.change.jump
  const vy = bounce > 0 ? Math.sqrt(2 * FEEL.gravity * Math.max(pull.gravity, 0.2) * bounce) : pull.gravity > 0 ? Math.sqrt(2 * FEEL.gravity * pull.gravity * FEEL.jumpHigh * k) : 0
  return { vy, g: FEEL.gravity * pull.gravity - pull.ay }
}

/** How high a jump at vy m/s against a pull of g m/s² lifts the feet. */
export function apex(vy: number, g: number): number {
  return g > 0 ? (vy * vy) / (2 * g) : FAR
}

/** The room ahead, as the graph samples its moving solids: given by the caller (trial/search.ts Shadow). */
export interface Ahead {
  /** The moving solids, by index. */
  readonly moving: readonly number[]
  /** Puts the moving solids where they will be that many frames from now. */
  sampleAt(frames: number): void
  /** The sim as it is ahead: its outlines are where the moving solids are then. */
  readonly sim: Sim
}

/**
 * What the search reads of a graph to count the waits for solids that move (trial/search.ts): the
 * spots' count (nodes past it are the moving solids), each moving solid's samples at which a body
 * boards it from a spot and leaves it onto one, the edges, and the edges from each spot onto moving
 * solids. The side's graph (FloorGraph) and the one from high up (trial/highGraph.ts) both have it.
 */
export interface Timetable {
  readonly spots: { readonly length: number }
  readonly moving: readonly { readonly board: Map<number, number[]>; readonly leave: Map<number, number[]> }[]
  readonly out: readonly (readonly Edge[])[]
  readonly boarding: Map<number, Edge[]>
  /** The World's frame it was built at: the samples count from it. */
  readonly frame0: number
  readonly size: number
}

/**
 * Seconds to go from every node to the nearest of `goals`, by Dijkstra over the edges backward
 * (`inn`, by node); Infinity where none is reached. Nodes from `spots` on are solids that move: with
 * `alone` the way rides none of them.
 */
export function dijkstra(inn: readonly (readonly Edge[])[], spots: number, goals: readonly number[], alone: boolean): Float64Array {
  const n = inn.length
  const dist = new Float64Array(n).fill(Infinity)
  const heap: number[] = []
  const keys: number[] = []
  const push = (node: number, d: number) => {
    heap.push(node)
    keys.push(d)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent] <= keys[i]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      ;[keys[parent], keys[i]] = [keys[i], keys[parent]]
      i = parent
    }
  }
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], keys[0]]
    const lastNode = heap.pop() as number
    const lastKey = keys.pop() as number
    if (heap.length > 0) {
      heap[0] = lastNode
      keys[0] = lastKey
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && keys[l] < keys[m]) m = l
        if (r < heap.length && keys[r] < keys[m]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        ;[keys[m], keys[i]] = [keys[i], keys[m]]
        i = m
      }
    }
    return top
  }
  for (const g of goals) {
    if (alone && g >= spots) continue
    dist[g] = 0
    push(g, 0)
  }
  while (heap.length > 0) {
    const [node, d] = pop()
    if (d > dist[node]) continue
    for (const e of inn[node]) {
      if (alone && e.to >= spots) continue
      const nd = d + e.cost
      if (nd < dist[e.to]) {
        dist[e.to] = nd
        push(e.to, nd)
      }
    }
  }
  return dist
}

/** Every node reached from `from` along the edges forward (`out`, by node). */
export function reachedFrom(out: readonly (readonly Edge[])[], from: number): Uint8Array {
  const seen = new Uint8Array(out.length)
  if (from < 0) return seen
  const stack = [from]
  seen[from] = 1
  while (stack.length > 0) {
    const n = stack.pop() as number
    for (const e of out[n]) {
      if (seen[e.to] === 1) continue
      seen[e.to] = 1
      stack.push(e.to)
    }
  }
  return seen
}

/** Things standing still enough to stand on, and players standing still: what the graph takes as floors. */
function still(v: readonly number[]): boolean {
  return Math.abs(v[0]) < 0.05 && Math.abs(v[1]) < 0.05
}

export class FloorGraph implements Timetable {
  readonly spots: Spot[] = []
  readonly moving: MovingNode[] = []
  /** Spot indices in each column, lowest first. */
  readonly cols: number[][] = []
  /** Forward edges, and backward edges for Dijkstra, by node: the spots first, then the moving solids. */
  readonly out: Edge[][] = []
  readonly inn: Edge[][] = []
  /** The x of column 0. */
  readonly x0: number
  /** The World's frame it was built at: the moving solids' samples count from it. */
  readonly frame0: number
  /** Each moving solid's node, by solid index. */
  readonly movingNode = new Map<number, number>()
  /** The edges from each spot (by index) onto moving solids, for the spots that have any. */
  readonly boarding = new Map<number, Edge[]>()
  /** The jump a bot leaves at where no zone pulls, m/s, and the most it lifts the feet there. */
  readonly vyJump: number
  readonly jumpHigh: number
  private readonly foot: number
  private readonly hw: number
  private readonly height: number

  /**
   * Builds the graph for the bot `self` over the room as it stands (`now`, whose still solids are
   * `fixed`), and `ahead`, which steps a copy of the room forward to sample the moving solids over
   * `frames` frames.
   */
  constructor(
    readonly now: Sim,
    fixed: readonly number[],
    readonly self: Player,
    ahead: Ahead,
    frames: number,
    /** Whether the heads of the other players standing still are floors: only when a bot cannot get there without a boost. */
    readonly heads: boolean,
    /** The room's key it was built for (trial/search.ts roomKey), to know when it is out of date. */
    readonly key: number,
  ) {
    const w = now.world
    const k = self.change === null ? 1 : self.change.jump
    this.vyJump = Math.sqrt(2 * FEEL.gravity * FEEL.jumpHigh * k)
    this.jumpHigh = FEEL.jumpHigh * k
    this.foot = (CONTROL.foot * self.size) / 2
    this.hw = playerWidth(self) / 2
    this.height = playerHeight(self)
    const dx = GRAPH.column
    this.frame0 = w.frame
    this.x0 = w.bounds.min[0] + this.hw
    const ncols = Math.max(1, Math.floor((w.bounds.max[0] - this.hw - this.x0) / dx) + 1)
    for (let c = 0; c < ncols; c++) this.cols.push([])
    // The moving solids first: one that settles within GRAPH.settleSecs is a still floor where it settles (the room ahead is left there).
    const sampled = this.sample(ahead, frames)
    const settled = ahead.moving.filter((_, k) => sampled.settled[k])
    this.scan(ahead.sim, [...fixed, ...settled], ncols)
    this.spots.forEach(() => this.out.push([]))
    this.walks()
    this.jumps()
    this.join(ahead, sampled)
    for (let n = 0; n < this.out.length; n++) this.inn.push([])
    this.out.forEach((edges, from) => {
      for (const e of edges) this.inn[e.to].push({ to: from, cost: e.cost })
    })
  }

  get size(): number {
    return this.spots.length + this.moving.length
  }

  /** Every spot: each column's floors from the top down, kept where they are standable, in `sim` (the room ahead, its settling solids where they settle). */
  private scan(sim: Sim, fixed: readonly number[], ncols: number): void {
    const w = sim.world
    const g: Ground = { id: 0, y: 0, slope: 0, solid: -1 }
    const low = w.bounds.min[1] - 1
    // The still solids each column's body can meet, so a column asks only those.
    const near: number[][] = this.cols.map(() => [])
    for (const i of fixed) {
      const o = sim.outlines[i]
      const c0 = Math.max(0, Math.floor((o.minX - this.hw - this.x0) / GRAPH.column))
      const c1 = Math.min(ncols - 1, Math.ceil((o.maxX + this.hw - this.x0) / GRAPH.column))
      for (let c = c0; c <= c1; c++) near[c].push(i)
    }
    for (let c = 0; c < ncols; c++) {
      const x = this.x0 + c * GRAPH.column
      let high = w.bounds.max[1] + 1
      for (let n = 0; n < 16; n++) {
        if (!groundUnder(sim, near[c], x - this.foot, x + this.foot, low, high, true, high, this.self.id, false, this.self.seat, g)) break
        if (Math.abs(g.slope) <= STEEP) this.consider(sim, near[c], c, x, g.y, g.id)
        high = g.y - 0.02
      }
      // The heads of players standing still.
      for (const o of this.heads ? w.players : []) {
        if (o.seat === this.self.seat || o.on === null || !still(o.velocity)) continue
        const ohw = playerWidth(o) / 2
        if (o.at[0] + ohw <= x - this.foot + 1e-4 || o.at[0] - ohw >= x + this.foot - 1e-4) continue
        this.consider(sim, near[c], c, x, o.at[1] + playerHeight(o), o.id)
      }
      this.cols[c].sort((a, b) => this.spots[a].y - this.spots[b].y)
    }
  }

  /** A spot at column c, if the body fits over that floor inside the room's box (`fixed`: the still solids near the column). */
  private consider(sim: Sim, fixed: readonly number[], c: number, x: number, y: number, on: HandleId): void {
    const w = sim.world
    const hw = this.hw
    if (y + this.height > w.bounds.max[1] + 1e-6) return
    for (const s of this.cols[c]) if (Math.abs(this.spots[s].y - y) < 0.02) return
    for (const i of fixed) {
      if (w.solids[i].surface.through) continue
      if (overlaps(sim.outlines[i], x - hw, y + 0.01, x + hw, y + this.height)) return
    }
    for (const t of w.things) {
      if (!thingLoose(t) || t.id === on) continue
      if (t.at[0] + t.box.max[0] <= x - hw + 1e-4 || t.at[0] + t.box.min[0] >= x + hw - 1e-4) continue
      if (t.at[1] + t.box.max[1] <= y + 0.06 || t.at[1] + t.box.min[1] >= y + this.height - 1e-4) continue
      return
    }
    // The floor's ends, which the feet may stand out over by half their width.
    const where = sim.where[on]
    let fx0: number
    let fx1: number
    let bounce = 0
    if (where.kind === 'solid') {
      const o = sim.outlines[where.i]
      fx0 = o.minX
      fx1 = o.maxX
      bounce = w.solids[where.i].surface.bounce
    } else if (where.kind === 'thing') {
      const t = w.things[where.i]
      fx0 = t.at[0] + t.box.min[0]
      fx1 = t.at[0] + t.box.max[0]
    } else {
      const p = w.players[where.i]
      fx0 = p.at[0] - playerWidth(p) / 2
      fx1 = p.at[0] + playerWidth(p) / 2
    }
    // How high a jump rises before it tops out, or the head meets a solid over the spot or the room's top.
    const { vy, g } = leapAt(sim, this.self, x, y, bounce)
    let rise = Math.min(apex(vy, g), w.bounds.max[1] - y - this.height)
    const under = { y: 0, slope: 0 }
    for (const i of fixed) {
      if (w.solids[i].surface.through) continue
      if (!bottomUnder(sim.outlines[i], x - hw, x + hw, under)) continue
      if (under.y >= y + this.height - 0.01) rise = Math.min(rise, under.y - y - this.height)
    }
    const half = GRAPH.column / 2
    this.spots.push({ x, y, on, lo: Math.max(x - half, fx0 - this.foot), hi: Math.min(x + half, fx1 + this.foot), rise: Math.max(0, rise), vy, g, col: c })
    this.cols[c].push(this.spots.length - 1)
  }

  /** An edge; each pair of nodes is met once in each direction, so none is added twice. */
  private edge(from: number, to: number, cost: number): void {
    this.out[from].push({ to, cost })
  }

  /** Walking to the next column, up or down a step. */
  private walks(): void {
    const t = GRAPH.column / FEEL.walk
    for (let c = 0; c + 1 < this.cols.length; c++) {
      for (const a of this.cols[c]) {
        for (const b of this.cols[c + 1]) {
          if (Math.abs(this.spots[a].y - this.spots[b].y) > FEEL.stepUp + GRAPH.stepSlack) continue
          this.edge(a, b, t)
          this.edge(b, a, t)
        }
      }
    }
  }

  /** The gap across between two stretches of the feet's x, metres; 0 where they meet. */
  static across(alo: number, ahi: number, blo: number, bhi: number): number {
    return blo > ahi ? blo - ahi : alo > bhi ? alo - bhi : 0
  }

  /** reachAcross at a jump speed and a pull for every rise, a centimetre apart, from the room's whole height down to the jump's top: the pairs of spots ask it often. Under a lower cap (a spot's rise), reachUnder. */
  private readonly reaches = new Map<string, Float64Array>()
  private reach(up: number, vy: number, g: number, cap: number): number {
    if (g <= 0) return FAR
    if (cap < apex(vy, g) - 1e-9) return reachUnder(up, vy, g, cap)
    const deep = this.now.world.bounds.max[1] - this.now.world.bounds.min[1] + 1
    const id = `${vy}|${g}`
    let table = this.reaches.get(id)
    if (table === undefined) {
      table = new Float64Array(Math.ceil((deep + apex(vy, g)) * 100) + 1)
      for (let k = 0; k < table.length; k++) table[k] = reachAcross(k / 100 - deep, vy, g)
      this.reaches.set(id, table)
    }
    const k = Math.round((up + deep) * 100)
    return k < 0 ? reachAcross(up, vy, g) : k >= table.length ? -1 : table[k]
  }

  /** Jumps and drops from every spot to every spot a running jump reaches. */
  private jumps(): void {
    const reachCols = Math.ceil(reachAcross(-(this.now.world.bounds.max[1] - this.now.world.bounds.min[1]), this.vyJump, FEEL.gravity) / GRAPH.column) + 2
    for (let a = 0; a < this.spots.length; a++) {
      const A = this.spots[a]
      const c0 = Math.max(0, A.col - reachCols)
      const c1 = Math.min(this.cols.length - 1, A.col + reachCols)
      for (let c = c0; c <= c1; c++) {
        const next = Math.abs(c - A.col) === 1
        for (const b of this.cols[c]) {
          if (b === a) continue
          const B = this.spots[b]
          const up = B.y - A.y
          if (up > A.rise + 1e-6 || (next && Math.abs(up) <= FEEL.stepUp + GRAPH.stepSlack)) continue
          const across = FloorGraph.across(A.lo, A.hi, B.lo, B.hi)
          // The pull is the stronger of where it leaves and where it lands: a jump into a zone that pushes down falls short.
          if (across > this.reach(up, A.vy, Math.max(A.g, B.g), A.rise)) continue
          this.edge(a, b, GRAPH.jumpCost + Math.abs(B.x - A.x) / CONTROL.airSpeed)
        }
      }
    }
  }

  /** The moving solids: each one node, joined where its top comes within a jump or a step over the horizon. */
  /** The moving solids' tops over the horizon (each one once, to the centimetre), every sample in time, and which settle within GRAPH.settleSecs. Leaves the room ahead at the horizon's end. */
  private sample(ahead: Ahead, frames: number): { tops: MovingTop[][]; times: MovingTop[][]; settled: boolean[] } {
    const tops: MovingTop[][] = ahead.moving.map(() => [])
    const seen: Map<number, MovingTop>[] = ahead.moving.map(() => new Map())
    // And every sample in time, for two moving solids meeting at the same time.
    const times: MovingTop[][] = ahead.moving.map(() => [])
    let sample = 0
    const take = () => {
      ahead.moving.forEach((i, k) => {
        const o = ahead.sim.outlines[i]
        const key = (Math.round(o.minX * 100) * 100003 + Math.round(o.maxX * 100)) * 100003 + Math.round(o.maxY * 100)
        let top = seen[k].get(key)
        if (top === undefined) {
          const leap = leapAt(ahead.sim, this.self, (o.minX + o.maxX) / 2, o.maxY, ahead.sim.world.solids[i].surface.bounce)
          top = { lo: o.minX - this.foot, hi: o.maxX + this.foot, y: o.maxY, vy: leap.vy, g: leap.g, when: [] }
          seen[k].set(key, top)
          tops[k].push(top)
        }
        top.when.push(sample)
        times[k].push(top)
      })
      sample += 1
    }
    take()
    for (let f = GRAPH.sampleFrames; f <= frames; f += GRAPH.sampleFrames) {
      ahead.sampleAt(f)
      take()
    }
    const settle = Math.round(GRAPH.settleSecs / (GRAPH.sampleFrames * DT))
    const settled = times.map((list) => list.every((t, s) => s < settle || t === list[list.length - 1]))
    return { tops, times, settled }
  }

  /** The moving solids that do not settle: each one node, joined to the spots it meets and to each other, with when. */
  private join(ahead: Ahead, sampled: { tops: MovingTop[][]; times: MovingTop[][]; settled: boolean[] }): void {
    const times: MovingTop[][] = []
    ahead.moving.forEach((i, k) => {
      if (sampled.settled[k]) return
      this.movingNode.set(i, this.spots.length + this.moving.length)
      this.moving.push({ solid: i, id: this.now.world.solids[i].id, tops: sampled.tops[k], board: new Map(), leave: new Map() })
      times.push(sampled.times[k])
      this.out.push([])
    })
    const base = this.spots.length
    const meets = (a: { lo: number; hi: number; y: number; rise: number; vy: number; g: number }, b: { lo: number; hi: number; y: number; g: number }): number => {
      const up = b.y - a.y
      const across = FloorGraph.across(a.lo, a.hi, b.lo, b.hi)
      if (Math.abs(up) <= FEEL.stepUp && across <= GRAPH.column) return across
      if (up > a.rise + 1e-6 || across > reachUnder(up, a.vy, Math.max(a.g, b.g), a.rise)) return -1
      return across
    }
    const from = (t: MovingTop) => ({ ...t, rise: this.riseUnderTop(t) })
    const sorted = (lists: number[][]) => lists.flat().sort((p, q) => p - q)
    // How far from a moving solid's path a spot can be and still be joined to it: the longest drop's reach in this room.
    const far = reachAcross(-(this.now.world.bounds.max[1] - this.now.world.bounds.min[1]), this.vyJump, FEEL.gravity) + 1
    this.moving.forEach((m, k) => {
      const n = base + k
      const lo = Math.min(...m.tops.map((t) => t.lo)) - far
      const hi = Math.max(...m.tops.map((t) => t.hi)) + far
      for (let a = 0; a < base; a++) {
        const A = this.spots[a]
        if (A.hi < lo || A.lo > hi) continue
        let on = Infinity
        let off = Infinity
        const onWhen: number[][] = []
        const offWhen: number[][] = []
        for (const top of m.tops) {
          const c1 = meets(A, top)
          if (c1 >= 0) {
            on = Math.min(on, c1)
            onWhen.push(top.when)
          }
          const c2 = meets(from(top), A)
          if (c2 >= 0) {
            off = Math.min(off, c2)
            offWhen.push(top.when)
          }
        }
        if (on < Infinity) {
          const cost = GRAPH.moverCost + on / CONTROL.airSpeed
          this.edge(a, n, cost)
          m.board.set(a, sorted(onWhen))
          const list = this.boarding.get(a)
          if (list === undefined) this.boarding.set(a, [{ to: n, cost }])
          else list.push({ to: n, cost })
        }
        if (off < Infinity) {
          this.edge(n, a, GRAPH.moverCost + off / CONTROL.airSpeed)
          m.leave.set(a, sorted(offWhen))
        }
      }
      this.moving.forEach((_, k2) => {
        if (k2 === k) return
        for (let s = 0; s < times[k].length; s++) {
          const a = times[k][s]
          const b = times[k2][s]
          const across = meets(from(a), b)
          if (across >= 0) {
            this.edge(n, base + k2, GRAPH.moverCost + across / CONTROL.airSpeed)
            break
          }
        }
      })
    })
  }

  /** Seconds to go from every node to the nearest of `goals`, by Dijkstra over the edges backward; Infinity where none is reached. With `alone`, through spots only, riding nothing that moves. */
  distances(goals: readonly number[], alone: boolean): Float64Array {
    return dijkstra(this.inn, this.spots.length, goals, alone)
  }

  /** Every node reached from `from` along the edges forward. */
  reached(from: number): Uint8Array {
    return reachedFrom(this.out, from)
  }

  /** The node a body stands on: the moving solid's, or the spot in its column at its feet; -1 for none (in the air, or on nothing the graph knows). */
  nodeAt(p: Player): number {
    if (p.on === null) return -1
    const where = this.now.where[p.on]
    if (where.kind === 'solid') {
      const n = this.movingNode.get(where.i)
      if (n !== undefined) return n
    }
    return this.spotNear(p.at[0], p.at[1])
  }

  /** The spot nearest feet at x, y in their column or the next, within a step's height; -1 for none. */
  spotNear(x: number, y: number): number {
    const c = Math.round((x - this.x0) / GRAPH.column)
    let best = -1
    let bestD = 0.16
    for (const dc of [0, -1, 1]) {
      const col = this.cols[c + dc]
      if (col === undefined) continue
      for (const s of col) {
        const d = Math.abs(this.spots[s].y - y) + Math.abs(dc) * 0.01
        if (d < bestD) {
          best = s
          bestD = d
        }
      }
    }
    return best
  }

  /** The spot under feet at x, y: the highest one in their column at or below them; -1 for none. */
  spotUnder(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols.length - 1, Math.round((x - this.x0) / GRAPH.column)))
    let best = -1
    for (const s of this.cols[c]) if (this.spots[s].y <= y + 0.05) best = s
    return best
  }

  /** How high a jump from a moving solid's top lifts the feet before it tops out or the head meets the room's top (what is over a moving solid changes as it moves, so only the room's top is counted). */
  riseUnderTop(top: { y: number; vy: number; g: number }): number {
    return Math.max(0, Math.min(apex(top.vy, top.g), this.now.world.bounds.max[1] - top.y - this.height))
  }

  /** Where a node is, for a sentence: a spot's feet, or a moving solid's top now. */
  placeOf(n: number): { lo: number; hi: number; x: number; y: number; rise: number; vy: number; g: number } {
    if (n < this.spots.length) return this.spots[n]
    const top = this.moving[n - this.spots.length].tops[0]
    return { ...top, x: (top.lo + top.hi) / 2, rise: this.riseUnderTop(top) }
  }
}

export const tenth = (v: number) => Math.round(v * 10) / 10

/** The gap between two nodes as WALK_MISTAKES.noWay says it: the gap's clause and the jump's. The gap is between the floors' ends, as a designer measures it; a solid in the way is called as `name` says it (the room's describe). */
function gapClauses(graph: FloorGraph, a: number, b: number, name: (id: HandleId) => string): { gap: string; reach: string } {
  const foot = (CONTROL.foot * graph.self.size) / 2
  const A = graph.placeOf(a)
  const B = graph.placeOf(b)
  const up = B.y - A.y
  const across = FloorGraph.across(A.lo, A.hi, B.lo, B.hi)
  // The gap from the end of one floor to the end of the other, as the designer built them; from the spots' feet where either is not a still floor.
  const ea = floorEnds(graph, a)
  const eb = floorEnds(graph, b)
  const right = B.x > A.x
  const edgeGap = ea !== null && eb !== null ? Math.max(0, right ? eb.lo - ea.hi : ea.lo - eb.hi) : across > 0 ? across + 2 * foot : 0
  const fromX = ea !== null && edgeGap > 0 ? (right ? ea.hi : ea.lo) : A.x
  // Where the bot would leave from: a player's head is said as one, since the room has no floor there.
  const on = a < graph.spots.length ? graph.spots[a].on : null
  const from = `${on !== null && whereOf(graph.now, on).kind === 'player' ? `${name(on)}'s head at ` : ''}${tenth(fromX)}, ${tenth(A.y)}`
  // Straight overhead there is no gap across, only the height.
  const gap =
    edgeGap === 0 && up > 0
      ? `from ${from} the floor above, at ${tenth(B.x)}, ${tenth(B.y)}, is ${tenth(up)} m up`
      : `the gap from ${from} is ${tenth(edgeGap)} m across and ${tenth(Math.abs(up))} m ${up >= 0 ? 'up' : 'down'}`
  if (up > A.rise + 1e-6) return { gap, reach: A.rise < apex(A.vy, A.g) - 1e-6 ? `a jump there rises only ${tenth(A.rise)} m before the head meets what is above` : `a jump lifts the feet ${tenth(A.rise)} m` }
  const reach = reachUnder(up, A.vy, Math.max(A.g, B.g), A.rise)
  if (across <= reach + 1e-6) {
    // Near enough and low enough for a jump: something between stops it, as a wall does.
    const between = `between ${tenth(A.x)}, ${tenth(A.y)} and ${tenth(B.x)}, ${tenth(B.y)}`
    const wall = wallBetween(graph, A, B)
    const stands = wall === null ? 'something stops every jump across' : `${name(wall.id)} (x ${tenth(wall.lo)} to ${tenth(wall.hi)}) stands up to y ${tenth(wall.top)}`
    return { gap: `${between} ${stands}`, reach: `a jump lifts the feet ${tenth(A.rise)} m` }
  }
  return { gap, reach: `a jump carries the feet ${Math.floor((reach + 2 * foot) * 10 + 1e-6) / 10} m across at that height` }
}

/** Where the floor under a spot ends across, as built: a still solid's outline or a resting thing's box; null for a head or a solid in a mover, sliding or turning. */
function floorEnds(graph: FloorGraph, n: number): { lo: number; hi: number } | null {
  if (n >= graph.spots.length) return null
  const sim = graph.now
  const where = whereOf(sim, graph.spots[n].on)
  if (where.kind === 'solid') {
    const solid = sim.world.solids[where.i]
    return solid.mover === null && solid.slide === null && solid.turning === null ? { lo: sim.outlines[where.i].minX, hi: sim.outlines[where.i].maxX } : null
  }
  if (where.kind === 'thing') {
    const t = sim.world.things[where.i]
    return { lo: t.at[0] + t.box.min[0], hi: t.at[0] + t.box.max[0] }
  }
  return null
}

/** The solid in the way between two places, standing over the higher of them where a body walks across: the one whose top is highest, with its x and its top; null when none is. */
function wallBetween(graph: FloorGraph, A: { lo: number; hi: number; y: number }, B: { lo: number; hi: number; y: number }): { id: HandleId; lo: number; hi: number; top: number } | null {
  const lo = Math.min(A.hi, B.hi)
  const hi = Math.max(A.lo, B.lo)
  const floor = Math.max(A.y, B.y)
  const sim = graph.now
  let wall: { id: HandleId; lo: number; hi: number; top: number } | null = null
  for (let i = 0; i < sim.world.solids.length; i++) {
    const s = sim.world.solids[i]
    const o = sim.outlines[i]
    if (!solidActive(sim, s) || s.surface.through || o.maxX <= lo || o.minX >= hi || o.maxY <= floor + FEEL.stepUp || o.minY >= floor + FEEL.height) continue
    if (wall === null || o.maxY > wall.top) wall = { id: s.id, lo: o.minX, hi: o.maxX, top: o.maxY }
  }
  return wall
}

/**
 * Why there is no way from node `from` to the goal: the nearest missing edge between what the bot
 * can reach and what reaches the goal (`dist` finite), each pair weighed by how far a jump falls
 * short of it.
 */
export function missingEdge(graph: FloorGraph, from: number, dist: Float64Array, name: (id: HandleId) => string): { gap: string; reach: string } {
  const reachable = graph.reached(from)
  let best: { a: number; b: number; short: number } | null = null
  for (let a = 0; a < graph.size; a++) {
    if (reachable[a] !== 1) continue
    const A = graph.placeOf(a)
    for (let b = 0; b < graph.size; b++) {
      if (!Number.isFinite(dist[b]) || reachable[b] === 1) continue
      const B = graph.placeOf(b)
      const up = B.y - A.y
      const across = FloorGraph.across(A.lo, A.hi, B.lo, B.hi)
      const reach = up > A.rise ? 0 : Math.max(0, reachUnder(up, A.vy, Math.max(A.g, B.g), A.rise))
      const short = Math.max(0, up - A.rise) * 2 + Math.max(0, across - reach) + 0.01 * Math.abs(B.x - A.x)
      if (best === null || short < best.short) best = { a, b, short }
    }
  }
  if (best === null) {
    const foot = (CONTROL.foot * graph.self.size) / 2
    return {
      gap: 'nothing near it can be stood on',
      reach: `a jump lifts the feet ${tenth(graph.jumpHigh)} m and carries them ${Math.floor((reachAcross(0, graph.vyJump, FEEL.gravity) + 2 * foot) * 10 + 1e-6) / 10} m across`,
    }
  }
  return gapClauses(graph, best.a, best.b, name)
}

/** Why the search could not go on from node `from` though the graph has a way: the next edge of that way, which the bot's real moves could not make. */
export function nextEdge(graph: FloorGraph, from: number, dist: Float64Array, name: (id: HandleId) => string): { gap: string; reach: string } {
  let best: Edge | null = null
  for (const e of from < 0 ? [] : graph.out[from]) if (best === null || e.cost + dist[e.to] < best.cost + dist[best.to]) best = e
  if (best === null) return missingEdge(graph, from, dist, name)
  return gapClauses(graph, from, best.to, name)
}
