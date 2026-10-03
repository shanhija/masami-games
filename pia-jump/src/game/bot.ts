import { BOSS_HP, ROWS, TILE, TOE_ASSIST, WALK, ticks, type Enemy, type EventKind, type Room, type Sim } from './model'
import { gapAt } from './room'
import { cloneSim, createSim, pressJump, releaseJump, setMove, step } from './sim'

/**
 * A bot that plays like a five-year-old, used by levels.test.ts to prove every room can be
 * finished and by ?autoplay to show it: a beam search over the real sim.
 *
 * It decides every DECISION ticks: a direction, and a jump that is a tap or a hold. A jump
 * starts only from standing nearly still on something (a child stops at the edge, then
 * jumps); in the air the next decisions still steer. It plays small Pia and drops every
 * line of play where she is hit, falls or changes form, so a room it finishes is one a
 * child can finish without the cupcake.
 */

/** One decision, held for DECISION ticks: a direction, and a jump that is a tap, a hold, or none. */
export interface BotMove {
  move: -1 | 0 | 1
  jump: 'none' | 'tap' | 'hold'
}

export interface BotPlan {
  ok: boolean
  moves: BotMove[]
  /** How far right the search got, for the failure message. */
  furthestX: number
  /** Her feet there. */
  furthestY: number
  /** The tick the plan reaches the pole (counted as the sim counts it, after the step that grabbed it), or where it ends when it failed. */
  tick: number
  expansions: number
}

/** A child decides about this often. */
export const DECISION = ticks(0.15)

/** Search nodes kept after each decision. */
export const BEAM = 48
/** A jump starts only when her speed against what she stands on is at most this. */
export const STILL = 0.5
/** The search gives up when its best score gains less than STALL_GAIN in STALL_FOR seconds of game time, past TIME_FOR_COLUMN seconds per column of the room, or past MAX_EXPANSIONS decisions tried. */
export const STALL_GAIN = 0.5
export const STALL_FOR = 12
export const TIME_FOR_COLUMN = 3 / WALK
export const MAX_EXPANSIONS = 150_000
/** Each stomp (or bubble) the Big Grumble takes is worth this many tiles of progress. */
export const BOSS_HIT = 30

/** Events that end a line of play: a hit, a fall, a change of form. */
const PRUNE: ReadonlySet<EventKind> = new Set<EventKind>(['hurt', 'shrink', 'fall', 'grow', 'wand'])

const DIRECTIONS = [1, 0, -1] as const
/** Every decision, best first: the search tries them in this order. */
const MOVES: readonly BotMove[] = DIRECTIONS.flatMap((move) => (['none', 'tap', 'hold'] as const).map((jump) => ({ move, jump })))
/** The decisions without a jump, for when she cannot start one. */
const STEERS: readonly BotMove[] = MOVES.filter((m) => m.jump === 'none')

/** A search node: the decision that led here from its parent, the sim after it (dropped once expanded), and its progress. */
interface Node {
  sim: Sim | null
  parent: Node | null
  move: BotMove | null
  /** Where she last stood: in the air she has not got anywhere yet, so a jump into a pit never looks better than the edge it left. */
  groundX: number
  /** groundX plus the Big Grumble's stomps. */
  score: number
}

/** Better nodes first: more progress, then standing before flying, then further right. */
const better = (a: Node, b: Node) => b.score - a.score || +b.sim!.hero.grounded - +a.sim!.hero.grounded || b.sim!.hero.x - a.sim!.hero.x

/** Her hands on tick k of decision m: the direction all along, and a jump pressed on tick 0, let go on tick 1 for a tap and once she stops rising for a hold. */
function hands(s: Sim, m: BotMove, k: number): void {
  setMove(s, m.move)
  if (k === 0 && m.jump !== 'none') pressJump(s)
  else if (s.input.jumpHeld && ((k === 1 && m.jump === 'tap') || s.hero.vy >= 0)) releaseJump(s)
}

/** Whether an enemy is out of the game for good (or on its way out). */
const out = (e: Enemy) => e.state === 'poof' || e.state === 'knocked' || e.state === 'trapped' || e.state === 'bunny' || e.state === 'gone'

/**
 * Whether she is in the air over a pit with nothing left to land on: nothing under her
 * centre column, and either she walked off the edge (a child never does that on purpose,
 * and the beam would fill with those lines while each looks a step further on) or her
 * feet are already lower than both rims, toe assist and all.
 */
function lost(s: Sim, room: Room): boolean {
  const h = s.hero
  if (h.grounded) return false
  const col = Math.floor(h.x)
  const g = gapAt(room, col)
  if (g < 0) return false
  const cols = room.cols
  for (let r = Math.max(0, Math.ceil(h.y)); r < ROWS; r++) {
    const i = r * cols + col
    const b = room.blockAt[i]!
    if (room.tiles[i] !== TILE.air || (b >= 0 && (s.blocks[b]!.state === 'full' || s.blocks[b]!.state === 'empty'))) return false
  }
  for (let i = 0; i < s.lifts.length; i++) {
    const half = room.lifts[i]!.width / 2
    if (s.lifts[i]!.y >= h.y && Math.abs(s.lifts[i]!.x - h.x) < half + h.w / 2) return false
  }
  const gap = room.gaps[g]!
  const rim = Math.max(room.floor[gap.col0 - 1] ?? ROWS, room.floor[gap.col1] ?? ROWS)
  return h.groundAt >= 0 || h.y > rim + TOE_ASSIST
}

/** Stomps the Big Grumble has taken (0 in a room without it). */
function bossHits(s: Sim): number {
  for (const e of s.enemies) if (e.kind === 'boss') return BOSS_HP - e.hp
  return 0
}

/** Nodes alike enough to keep only the better one: her place to a quarter tile, her speed, whether she stands, and what the enemies have left. */
function key(s: Sim): number {
  const h = s.hero
  let gone = 0
  for (const e of s.enemies) if (out(e)) gone += 1
  const x = Math.round(h.x * 4)
  const y = Math.round(h.y * 4) + 128
  const vx = Math.round(h.vx) + 16
  const vy = Math.round(h.vy / 2) + 16
  return ((((x * 512 + y) * 32 + vx) * 32 + vy) * 2 + (h.grounded ? 1 : 0)) * 256 + bossHits(s) * 64 + Math.min(63, gone)
}

/** The decisions from the start to a node. */
function movesTo(node: Node): BotMove[] {
  const moves: BotMove[] = []
  for (let n: Node | null = node; n && n.move; n = n.parent) moves.push(n.move)
  return moves.reverse()
}

/** Searches for a way through the room as small Pia with no hit and no fall. */
export function solve(room: Room): BotPlan {
  const first = createSim(room)
  const root: Node = { sim: first, parent: null, move: null, groundX: first.hero.x, score: first.hero.x }
  let beam: Node[] = [root]
  const timeLimit = ticks(TIME_FOR_COLUMN * room.cols)
  let expansions = 0
  let furthest = root
  let furthestY = first.hero.y
  let progress = root.score
  let progressAt = 0
  const next = new Map<number, Node>()
  for (;;) {
    next.clear()
    for (const node of beam) {
      const from = node.sim!
      node.sim = null
      const h = from.hero
      for (const m of h.grounded && Math.abs(h.vx) <= STILL ? MOVES : STEERS) {
        const s = cloneSim(from)
        expansions += 1
        let groundX = node.groundX
        let pruned = false
        for (let k = 0; k < DECISION && !pruned; k++) {
          hands(s, m, k)
          step(s, room)
          for (const e of s.events) if (PRUNE.has(e.kind)) pruned = true
          s.events.length = 0
          if (lost(s, room)) pruned = true
          if (s.phase === 'pole') return { ok: true, moves: [...movesTo(node), m], furthestX: s.hero.x, furthestY: s.hero.y, tick: s.tick, expansions }
          if (s.hero.grounded) groundX = s.hero.x
        }
        if (pruned) continue
        const child: Node = { sim: s, parent: node, move: m, groundX, score: groundX + BOSS_HIT * bossHits(s) }
        const id = key(s)
        const known = next.get(id)
        if (!known || better(child, known) < 0) next.set(id, child)
        if (groundX > furthest.groundX) {
          furthest = child
          furthestY = s.hero.y
        }
      }
    }
    beam = [...next.values()].sort(better).slice(0, BEAM)
    const lead = beam[0]
    const failed = (): BotPlan => {
      const moves = movesTo(furthest)
      return { ok: false, moves, furthestX: furthest.groundX, furthestY, tick: moves.length * DECISION, expansions }
    }
    if (!lead) return failed()
    const tick = lead.sim!.tick
    if (lead.score >= progress + STALL_GAIN) {
      progress = lead.score
      progressAt = tick
    }
    if (tick - progressAt > ticks(STALL_FOR) || tick > timeLimit || expansions > MAX_EXPANSIONS) return failed()
  }
}

/** Sets the sim's input for its current tick from a plan that started at tick `from`: call it before every step. Past the plan's end nothing is held. */
export function drive(s: Sim, plan: BotPlan, from: number): void {
  const m = plan.moves[Math.floor((s.tick - from) / DECISION)]
  if (m) hands(s, m, (s.tick - from) % DECISION)
  else {
    setMove(s, 0)
    if (s.input.jumpHeld) releaseJump(s)
  }
}
