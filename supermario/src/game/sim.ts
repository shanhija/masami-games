/**
 * Pia Jump's rules as plain numbers: no canvas in here, so vitest can run them for
 * minutes and the bot can clone them thousands of times a second. Units, state and every
 * constant are in model.ts; the parsed room is shared and never changed.
 *
 * Nothing is random and the sim uses only + - * /, Math.sqrt, floor, ceil, round, min,
 * max, abs and sign, so a room plays the same in node and in Safari for the same presses.
 *
 * One step, in order: every body copies its place into px, py; a freeze holds the world
 * still; the lifts move and carry her; she moves (or the rescue, the pole and the walk
 * home move her); the block her head knocked answers; items, bubbles and enemies move and
 * meet each other; her contacts are judged, the stomp from where everyone stood at the
 * start of the step; then pits, safe ground, the pole, and the tick counts.
 *
 * Collision needs no sweeps: a velocity that asks for more than MAX_STEP_MOVE in one step
 * throws, so a box enters at most one new column or row per step and only that leading
 * column or row is probed.
 */

import * as model from './model'
import type { BlockDef, Body, Enemy, EnemyKind, EventKind, Form, ItemKind, Lift, LiftDef, Room, Sim } from './model'
import * as rooms from './room'

// Imported bindings are read once into module constants: vitest's module runner turns every
// read of an imported binding into a getter call, and the bot steps this file millions of
// times there.
const {
  ACCEL,
  AIR_ACCEL,
  BALL_BOUNCE,
  BALL_FOR,
  BALL_SPEED,
  BEE_BOX,
  BEE_PERIOD,
  BEE_RANGE,
  BIG_H,
  BIG_W,
  BOSS_BOX,
  BOSS_DIZZY,
  BOSS_HOP_EVERY,
  BOSS_HOP_V,
  BOSS_HP,
  BOSS_PUSH,
  BOSS_SPEED,
  BUBBLE_BOUNCE,
  BUBBLE_EVERY,
  BUBBLE_FOR,
  BUBBLE_G,
  BUBBLE_R,
  BUBBLE_SPEED,
  BUBBLES_MAX,
  BUNNY_SPEED,
  CHAIN_MAX,
  COYOTE,
  CUPCAKE_SPEED,
  DIZZY_FOR,
  EPS,
  FERRY_SPEED,
  FERRY_WAIT,
  FOUND_FOR,
  FREEZE_FOR,
  FRICTION,
  G,
  G_LOW,
  GRUMBLE_BOX,
  GRUMBLE_SPEED,
  HEAD_NUDGE_BIG,
  HEAD_NUDGE_SMALL,
  HELP_AFTER,
  HURT_INSET,
  ITEM_BOX,
  JUMP_BUFFER,
  JUMP_V,
  JUMP_V_RUN,
  MAX_FALL,
  MAX_STEP_MOVE,
  MIN_JUMP_HOLD,
  POLE_HEIGHT,
  POLE_SLIDE,
  POLE_STARS,
  POOF_FOR,
  RESCUE_FOR,
  RISE_FOR,
  ROWS,
  RUN,
  RUN_ACCEL,
  RUN_AFTER,
  SAFE_FOR,
  SAFE_MARGIN,
  SHELL_BOX,
  SHELL_FAR,
  SHELL_SPEED,
  SHELL_STARS,
  SHELL_WAKE,
  SKID,
  SMALL_H,
  SMALL_W,
  SNAIL_BOX,
  SNAIL_SPEED,
  SPRING_TOP,
  SPRING_V,
  STARS_BOX_HITS,
  STEP,
  STOMP_HELD_V,
  STOMP_PAD,
  STOMP_V,
  TILE,
  TOE_ASSIST,
  TRAPPED_FOR,
  WAKE_DIST,
  WALK,
  WALK_HOME,
  YAWN_FOR,
  ticks,
} = model
const { gapAt, solidTile, tileAt } = rooms

// ---------------------------------------------------------------------------------------
// The few numbers model.ts leaves to the rules.

/** She skids (and `skidding` is true) while she still moves faster than this against her push. */
export const SKID_FROM = 2
/** A landing after a fall of more than this many tiles is a real landing: event land, and `landedAt` squashes her. */
export const LAND_FROM = 1
/** Growing tries the big box at her x, then this far right, then this far left. */
export const GROW_NUDGE = 0.05
/** A bump from below reaches what stands on the block: feet within this of its top. */
export const STAND_TOL = 0.05
/** An enemy knocked over pops up at KNOCK_V and drifts KNOCK_VX the way it faces while it tumbles out of the room. */
export const KNOCK_V = 8
export const KNOCK_VX = 2
/** An item standing on a bumped block hops up this fast and turns around. */
export const ITEM_HOP_V = 8
/** A trapped enemy floats up this fast inside its bubble. */
export const TRAPPED_RISE = 1.5
/** The beaten Big Grumble as a bunny: its box, the hop it makes on every landing, and how long it stays before it is gone. */
export const BUNNY_BOX = [0.7, 0.6] as const
export const BUNNY_HOP_V = 6
export const BUNNY_FOR = 4
/** A shell that was just stopped or kicked ignores her this long, so one stomp or one kick is never read twice while her box still overlaps it. */
export const SHELL_GRACE = 0.2
/** The Big Grumble turns to face her only when she is more than this far away along x, so it does not flip back and forth while she is over it. */
export const BOSS_TURN = 1
/** A map star is picked up by touching a square this wide around its cell's centre. */
export const STAR_BOX = 0.6
/** She bounces off a spring when her feet cross its top (SPRING_TOP) within this of its centre along x. */
export const SPRING_REACH = 0.45
/** The rescue bubble's path bows this far above the straight line from where she fell to where it sets her down. */
export const RESCUE_ARC = 1.5
/** On the pole her hands hold it at POLE_GRIP of her height up from her feet, her box's right edge POLE_HALF left of the pole's centre (half its thickness). */
export const POLE_GRIP = 0.6
export const POLE_HALF = 0.11
/** Walking home she stops this far short of the bed's centre. */
export const BED_GAP = 1.6
/** A bubble leaves her at this share of her height up from her feet: her chest. */
export const BUBBLE_CHEST = 0.6

/** Her box for a form, as [w, h]. */
export const heroBox = (form: Form): readonly [number, number] => (form === 'small' ? [SMALL_W, SMALL_H] : [BIG_W, BIG_H])

/** An enemy's box as it spawns, as [w, h]. */
const enemyBox = (kind: EnemyKind): readonly [number, number] =>
  kind === 'grumble' ? GRUMBLE_BOX : kind === 'snail' ? SNAIL_BOX : kind === 'bee' ? BEE_BOX : BOSS_BOX[BOSS_HP - 1]

/** A loop lift's centre x and top y at a tick of its own clock: a smoothed triangle wave from its start to (dx, dy) and back. Ferries keep their own place. */
export function loopAt(def: LiftDef & { kind: 'loop' }, tick: number, out: { x: number; y: number }) {
  const period = ticks(def.period)
  const u = (tick % period) / period
  const tri = u < 0.5 ? u * 2 : 2 - u * 2
  const k = tri * tri * (3 - 2 * tri)
  out.x = def.col + def.width / 2 + def.dx * k
  out.y = def.row + def.dy * k
}

/** A fresh visit to a room: Pia small at the start, everything asleep and full. */
export function createSim(room: Room): Sim {
  const [w, h] = heroBox('small')
  const x = room.start.col + 0.5
  const y = room.start.row + 1
  const enemies: Enemy[] = room.spawns.map((sp) => {
    const [ew, eh] = enemyBox(sp.kind)
    const ex = sp.col + 0.5
    const ey = sp.row + 1
    return { x: ex, y: ey, px: ex, py: ey, vx: 0, vy: 0, w: ew, h: eh, kind: sp.kind, state: 'asleep', stateAt: 0, facing: -1, grounded: sp.kind !== 'bee', hp: sp.kind === 'boss' ? BOSS_HP : 1, baseY: ey }
  })
  const lifts: Lift[] = room.lifts.map((def) => {
    const at = { x: def.col + def.width / 2, y: def.row }
    if (def.kind === 'loop') loopAt(def, 0, at)
    return { x: at.x, y: at.y, px: at.x, py: at.y, mode: def.kind === 'loop' ? 'loop' : 'wait', modeAt: 0 }
  })
  return {
    tick: 0,
    phase: 'play',
    phaseAt: 0,
    input: { move: 0, jumpHeld: false, jumpAt: -1, bubbleHeld: false, bubbleAt: -1 },
    hero: {
      x, y, px: x, py: y, vx: 0, vy: 0, w, h,
      form: 'small', facing: 1, grounded: true, lift: -1, launch: 'none',
      groundAt: 0, jumpedAt: -1, landedAt: -1, bonkedAt: -1, changedAt: -1, was: 'small',
      hurtAt: -1, safeUntil: -1, dizzyUntil: -1, ballUntil: -1, blewAt: -1,
      chain: 0, stride: 0, pushTicks: 0, skidding: false, safeX: x, safeY: y, banked: false,
    },
    enemies,
    items: [],
    bubbles: [],
    blocks: room.blocks.map(() => ({ state: 'full', hits: 0, bumpedAt: -1 })),
    lifts,
    springs: room.springs.map(() => -1),
    taken: new Uint8Array(room.stars.length),
    falls: new Uint8Array(room.gaps.length),
    stars: 0,
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    poleBonus: 0,
    poleY: 0,
    gateAt: -1,
    events: [],
  }
}

/**
 * One step of 1/HZ seconds. It runs at s.tick, stamps what it writes with s.tick and ends
 * with s.tick += 1.
 *
 * A freeze holds every position still and slides every clock in the world (enemy, item,
 * bubble and lift stamps) forward with the tick, so nothing that moves by the clock jumps
 * when it ends; her own timers (safety, dizziness, the ball) keep running.
 */
export function step(s: Sim, room: Room): void {
  const h = s.hero
  h.px = h.x
  h.py = h.y
  for (const e of s.enemies) {
    e.px = e.x
    e.py = e.y
  }
  for (const it of s.items) {
    it.px = it.x
    it.py = it.y
  }
  for (const b of s.bubbles) {
    b.px = b.x
    b.py = b.y
  }
  for (const l of s.lifts) {
    l.px = l.x
    l.py = l.y
  }
  if (h.ballUntil === s.tick) emit(s, 'ballEnd', h.x, h.y - h.h / 2, 0)
  if (s.phase === 'freeze') {
    if (s.tick - s.phaseAt < ticks(FREEZE_FOR)) {
      for (const e of s.enemies) e.stateAt += 1
      for (const it of s.items) it.bornAt += 1
      for (const b of s.bubbles) b.bornAt += 1
      for (const l of s.lifts) l.modeAt += 1
      s.tick += 1
      return
    }
    s.phase = 'play'
    s.phaseAt = s.tick
  }
  moveLifts(s, room)
  if (s.phase === 'play') {
    const knocked = moveHero(s, room)
    if (knocked >= 0) knockBlock(s, room, knocked)
  } else scriptHero(s, room)
  moveItems(s, room)
  moveBubbles(s, room)
  moveEnemies(s, room)
  worldContacts(s, room)
  if (s.phase === 'play') heroContacts(s, room)
  if (s.phase === 'play') pitsAndPole(s, room)
  let dead = 0
  for (const it of s.items) if (!it.alive) dead += 1
  if (dead > 0) s.items = s.items.filter((it) => it.alive)
  dead = 0
  for (const b of s.bubbles) if (!b.alive) dead += 1
  if (dead > 0) s.bubbles = s.bubbles.filter((b) => b.alive)
  s.tick += 1
}

// ---------------------------------------------------------------------------------------
// Tiles and boxes.

/** Tells the game what happened, where, and its one number (see EventKind). */
const emit = (s: Sim, kind: EventKind, x: number, y: number, n: number) => {
  s.events.push({ kind, x, y, n })
}

/** The other way. */
const flip = (facing: -1 | 1): -1 | 1 => (facing === 1 ? -1 : 1)
/** The way from a to b along x (right when they are level). */
const toward = (a: number, b: number): -1 | 1 => (b < a ? -1 : 1)

/** The bound on any move a velocity asks for in one step. */
function guard(d: number, b: { x: number; y: number }): number {
  if (Math.abs(d) > MAX_STEP_MOVE) throw new Error(`something at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) moved ${d.toFixed(3)} tiles in one step, past MAX_STEP_MOVE ${MAX_STEP_MOVE}`)
  return d
}

/** A tile's part in collision: nothing, solid from every side, or a shelf, solid only from above. */
const AIR = 0
const SOLID = 1
const SHELF = 2

/** Every room's tiles as AIR, SOLID or SHELF by tile index, built once per room (a room never changes), with the last room asked for at hand. */
const cellsByRoom = new WeakMap<Room, Uint8Array>()
let lastRoom: Room | null = null
let lastCells: Uint8Array = new Uint8Array(0)

/** What the tile at (col, row) is to collision. Inside the room it is one byte read; outside, room.ts says (walls beyond both ends, air above and below). */
function cellAt(room: Room, col: number, row: number): number {
  if (col < 0 || col >= room.cols || row < 0 || row >= ROWS) return solidTile(tileAt(room, col, row)) ? SOLID : AIR
  if (room !== lastRoom) {
    let cells = cellsByRoom.get(room)
    if (!cells) {
      cells = room.tiles.map((code) => (solidTile(code) ? SOLID : code === TILE.shelf ? SHELF : AIR))
      cellsByRoom.set(room, cells)
    }
    lastRoom = room
    lastCells = cells
  }
  return lastCells[row * room.cols + col]!
}

/** Whether the cell stops a walking body from every side: static solid tiles, the walls beyond both ends of the room, and blocks still standing (full or empty). */
function solidAt(s: Sim, room: Room, col: number, row: number): boolean {
  const cell = cellAt(room, col, row)
  if (cell !== AIR) return cell === SOLID
  return standingBlock(s, room, col, row) >= 0
}

/** Whether a walking body can stand on the cell: anything solid, or a shelf. */
const standable = (s: Sim, room: Room, col: number, row: number) => cellAt(room, col, row) === SHELF || solidAt(s, room, col, row)

/** The index of the standing block in the cell, or -1. */
function standingBlock(s: Sim, room: Room, col: number, row: number): number {
  if (col < 0 || col >= room.cols || row < 0 || row >= ROWS) return -1
  const b = room.blockAt[row * room.cols + col]!
  return b >= 0 && (s.blocks[b]!.state === 'full' || s.blocks[b]!.state === 'empty') ? b : -1
}

/** Whether a box with its feet centre at (x, y) covers no solid cell. */
function fits(s: Sim, room: Room, x: number, y: number, w: number, h: number): boolean {
  const c1 = Math.ceil(x + w / 2 - EPS) - 1
  const r1 = Math.ceil(y - EPS) - 1
  for (let r = Math.floor(y - h + EPS); r <= r1; r++) {
    for (let c = Math.floor(x - w / 2 + EPS); c <= c1; c++) if (solidAt(s, room, c, r)) return false
  }
  return true
}

/** Whether two boxes overlap (touching edges do not). */
const overlaps = (a: Body, b: Body) => a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2 && a.y - a.h < b.y && b.y - b.h < a.y

/** The column a box's leading edge is in once its centre is at nx, moving the way dir says. */
const leadCol = (nx: number, w: number, dir: -1 | 1) => (dir > 0 ? Math.ceil(nx + w / 2 - EPS) - 1 : Math.floor(nx - w / 2 + EPS))

/** The column under a body's front edge once it moves dx, facing `facing`. */
const frontCol = (b: Body, facing: -1 | 1, dx: number) => Math.floor(b.x + dx + facing * (b.w / 2 - EPS))

/** The first row from r0 down to r1 that holds a solid cell in column col, or r1 + 1 when none does. */
function solidRow(s: Sim, room: Room, col: number, r0: number, r1: number): number {
  for (let r = r0; r <= r1; r++) if (solidAt(s, room, col, r)) return r
  return r1 + 1
}

/** Whether column col is a pit with nothing to land on below feet at y: a gap in the floor (and inside the room) with no tile, block or shelf under them. */
function pitAt(s: Sim, room: Room, col: number, y: number): boolean {
  if (col < 0 || col >= room.cols || room.floor[col] !== -1) return false
  for (let r = Math.ceil(y - EPS); r < ROWS; r++) if (standable(s, room, col, r)) return false
  return true
}

/** Moves a body dx along x, stopping it flush against the first solid cell its leading edge enters. Returns the side it hit (-1 left, 1 right) or 0. */
function moveX(s: Sim, room: Room, b: Body, dx: number): -1 | 0 | 1 {
  if (dx === 0) return 0
  const nx = b.x + guard(dx, b)
  const dir = dx > 0 ? 1 : -1
  const col = leadCol(nx, b.w, dir)
  const r1 = Math.ceil(b.y - EPS) - 1
  if (solidRow(s, room, col, Math.floor(b.y - b.h + EPS), r1) > r1) {
    b.x = nx
    return 0
  }
  b.x = dir > 0 ? col - b.w / 2 : col + 1 + b.w / 2
  return dir
}

/** Moves a body dy along y: down onto solid tops, and onto shelves its feet were at or above at the start of the step; up into solid cells. Returns 1 when it landed, -1 when its head hit, 0 otherwise. */
function moveY(s: Sim, room: Room, b: Body, dy: number): -1 | 0 | 1 {
  if (dy === 0) return 0
  const ny = b.y + guard(dy, b)
  const c0 = Math.floor(b.x - b.w / 2 + EPS)
  const c1 = Math.ceil(b.x + b.w / 2 - EPS) - 1
  if (dy > 0) {
    const row = Math.floor(ny + EPS)
    for (let c = c0; c <= c1; c++) {
      if (solidAt(s, room, c, row) || (b.py <= row + EPS && cellAt(room, c, row) === SHELF)) {
        b.y = row
        return 1
      }
    }
  } else {
    const row = Math.floor(ny - b.h + EPS)
    for (let c = c0; c <= c1; c++) {
      if (solidAt(s, room, c, row)) {
        b.y = row + 1 + b.h
        return -1
      }
    }
  }
  b.y = ny
  return 0
}

/** Gravity, then x, then y, for an enemy or an item: sets `grounded`, stops vy at a floor or a ceiling, and returns the side of a wall it ran into (-1, 1) or 0. */
function walkBody(s: Sim, room: Room, b: Body & { grounded: boolean }, gravity: number): -1 | 0 | 1 {
  b.vy = Math.min(MAX_FALL, b.vy + gravity * STEP)
  const side = moveX(s, room, b, b.vx * STEP)
  const hit = moveY(s, room, b, b.vy * STEP)
  b.grounded = hit === 1
  if (hit !== 0) b.vy = 0
  return side
}

// ---------------------------------------------------------------------------------------
// Lifts.

/**
 * Moves every lift. A loop runs on its own clock, `tick - modeAt` (a freeze slides modeAt
 * on). A ferry waits at home until she stands on it, goes to (dx, dy) at FERRY_SPEED,
 * waits there while she stays on and FERRY_WAIT after she steps off, then comes home.
 */
function moveLifts(s: Sim, room: Room): void {
  const t = s.tick
  s.lifts.forEach((l, i) => {
    const def = room.lifts[i]!
    if (def.kind === 'loop') loopAt(def, t + 1 - l.modeAt, l)
    else {
      const length = Math.sqrt(def.dx * def.dx + def.dy * def.dy)
      if (length === 0) throw new Error(`room ${room.id}: ferry ${i} goes nowhere (dx and dy are both 0)`)
      const rider = s.hero.lift === i
      if (l.mode === 'wait' && rider) {
        l.mode = 'go'
        l.modeAt = t
      } else if (l.mode === 'there') {
        if (rider) l.modeAt = t
        else if (t - l.modeAt >= ticks(FERRY_WAIT)) {
          l.mode = 'back'
          l.modeAt = t
        }
      }
      if (l.mode === 'go' || l.mode === 'back') {
        const k = Math.min(1, ((t + 1 - l.modeAt) * FERRY_SPEED * STEP) / length)
        const p = l.mode === 'go' ? k : 1 - k
        l.x = def.col + def.width / 2 + def.dx * p
        l.y = def.row + def.dy * p
        if (k === 1) {
          l.mode = l.mode === 'go' ? 'there' : 'wait'
          l.modeAt = t
        }
      }
    }
    guard(l.x - l.px, l)
    guard(l.y - l.py, l)
  })
}

// ---------------------------------------------------------------------------------------
// Pia.

/**
 * Her step of play: the lift under her carries her, then her input, running, jumping and
 * gravity, then her move on x (with the toe assist) and on y (landing on tiles, shelves,
 * blocks and lifts; her head nudged past a corner or knocking what is above). Returns the
 * block her head knocked, or -1.
 */
function moveHero(s: Sim, room: Room): number {
  const h = s.hero
  const inp = s.input
  const t = s.tick
  const dizzy = t < h.dizzyUntil
  const push = dizzy ? 0 : inp.move
  const airborne = !h.grounded
  const lift = h.lift >= 0 ? s.lifts[h.lift]! : null

  // Running. pushTicks counts ticks of pushing one way on the ground; letting go or turning resets it.
  if (push !== h.facing) h.pushTicks = 0
  if (push !== 0) {
    if (h.grounded) h.pushTicks += 1
    h.facing = push
  }
  const wasSkidding = h.skidding
  h.skidding = false
  if (h.grounded) {
    if (push === 0) h.vx = h.vx > 0 ? Math.max(0, h.vx - FRICTION * STEP) : Math.min(0, h.vx + FRICTION * STEP)
    else {
      // Her speed the way she pushes: below zero she is skidding against it.
      let u = push * h.vx
      if (u < 0) {
        u = Math.min(0, u + SKID * STEP)
        h.skidding = -u > SKID_FROM
      } else if (u < WALK) u = Math.min(WALK, u + ACCEL * STEP)
      else if (h.pushTicks > ticks(RUN_AFTER)) u = Math.min(RUN, u + RUN_ACCEL * STEP)
      h.vx = push * u
    }
  } else if (push !== 0) {
    // In the air a push speeds her up to WALK but never slows a faster take-off; no push keeps her speed.
    const u = push * h.vx
    if (u < WALK) h.vx = push * Math.min(WALK, u + AIR_ACCEL * STEP)
  }
  if (h.skidding && !wasSkidding) emit(s, 'skid', h.x, h.y, 0)

  // Jumping: a press is remembered for JUMP_BUFFER, and she can still jump COYOTE after leaving the ground.
  if (inp.jumpAt >= 0 && t - inp.jumpAt <= ticks(JUMP_BUFFER) && !dizzy && (h.grounded || (h.groundAt >= 0 && t - h.groundAt <= ticks(COYOTE)))) {
    h.vy = -(JUMP_V + (JUMP_V_RUN - JUMP_V) * Math.min(1, Math.abs(h.vx) / RUN))
    h.launch = 'jump'
    h.jumpedAt = t
    inp.jumpAt = -1
    h.grounded = false
    h.lift = -1
    h.groundAt = -1
    emit(s, 'jump', h.x, h.y, Math.abs(h.vx))
  }

  // Bubbles: a fresh press blows at once, a held button one more every BUBBLE_EVERY.
  if (h.form === 'bubble' && !dizzy && (inp.bubbleAt >= 0 || (inp.bubbleHeld && t - h.blewAt >= ticks(BUBBLE_EVERY)))) blow(s, room)
  inp.bubbleAt = -1

  // Gravity: gentle while a jump rises with the button held (or for MIN_JUMP_HOLD), or a spring or stomp bounce rises.
  const low = h.vy < 0 && (h.launch === 'spring' || h.launch === 'stomp' || (h.launch === 'jump' && (inp.jumpHeld || t - h.jumpedAt < ticks(MIN_JUMP_HOLD))))
  h.vy = Math.min(MAX_FALL, h.vy + (low ? G_LOW : G) * STEP)
  if (h.vy >= 0) h.launch = 'none'

  // The lift she stood on at the start of the step carries her by its move; walls and ceilings still stop her.
  if (lift) {
    moveX(s, room, h, lift.x - lift.px)
    moveY(s, room, h, lift.y - lift.py)
  }

  // Her move on x. Falling into a ledge whose top is at most TOE_ASSIST above her feet sets her on it.
  let landY = Infinity
  let landLift = -1
  const dx = h.vx * STEP
  if (dx !== 0) {
    const nx = h.x + guard(dx, h)
    const dir = dx > 0 ? 1 : -1
    const col = leadCol(nx, h.w, dir)
    const r1 = Math.ceil(h.y - EPS) - 1
    const top = solidRow(s, room, col, Math.floor(h.y - h.h + EPS), r1)
    if (top > r1) h.x = nx
    else if (h.vy >= 0 && h.y - top <= TOE_ASSIST && fits(s, room, nx, top, h.w, h.h)) {
      h.x = nx
      landY = top
    } else {
      h.x = dir > 0 ? col - h.w / 2 : col + 1 + h.w / 2
      h.vx = 0
    }
  }

  // Her move on y.
  let knocked = -1
  const dy = h.vy * STEP
  if (landY === Infinity && dy !== 0) {
    const ny = h.y + guard(dy, h)
    const c0 = Math.floor(h.x - h.w / 2 + EPS)
    const c1 = Math.ceil(h.x + h.w / 2 - EPS) - 1
    if (dy > 0) {
      // The first top her feet reach: a solid cell, a shelf or a lift she was above at the start of the step.
      const row = Math.floor(ny + EPS)
      for (let c = c0; c <= c1; c++) {
        if (solidAt(s, room, c, row) || (h.py <= row + EPS && cellAt(room, c, row) === SHELF)) {
          landY = row
          break
        }
      }
      for (let i = 0; i < s.lifts.length; i++) {
        const l = s.lifts[i]!
        const half = room.lifts[i]!.width / 2
        if (l.y < landY && h.py <= l.py + EPS && ny >= l.y && h.x + h.w / 2 > l.x - half && h.x - h.w / 2 < l.x + half) {
          landY = l.y
          landLift = i
        }
      }
      if (landY === Infinity) h.y = ny
    } else {
      const row = Math.floor(ny - h.h + EPS)
      let hits = 0
      let hitCol = 0
      for (let c = c0; c <= c1; c++) {
        if (solidAt(s, room, c, row)) {
          hits += 1
          hitCol = c
        }
      }
      // Clipping one cell by less than the nudge slides her clear of its corner, if she fits there.
      const clearX = hitCol === c0 ? hitCol + 1 + h.w / 2 : hitCol - h.w / 2
      const nudge = h.form === 'small' ? HEAD_NUDGE_SMALL : HEAD_NUDGE_BIG
      if (hits === 0) h.y = ny
      else if (hits === 1 && c0 !== c1 && Math.abs(clearX - h.x) < nudge && fits(s, room, clearX, ny, h.w, h.h)) {
        h.x = clearX
        h.y = ny
      } else {
        h.y = row + 1 + h.h
        h.vy = 0
        h.bonkedAt = t
        // The block over her centre column answers; if that cell is no block, the other one she covers.
        const centre = Math.min(c1, Math.max(c0, Math.floor(h.x)))
        knocked = standingBlock(s, room, centre, row)
        if (knocked < 0 && c0 !== c1) knocked = standingBlock(s, room, centre === c0 ? c1 : c0, row)
        if (knocked < 0) emit(s, 'bonk', h.x, row + 1, 0)
      }
    }
  }

  if (landY !== Infinity) {
    // How far she fell, read from her landing speed (the Hero keeps no record of where a fall
    // began): the height a fall from rest covers before the step that lands at this speed, so
    // within one step's move of the truth below the MAX_FALL cap, and about 1.6 for every fall
    // long enough to reach it.
    const fell = (h.vy * (h.vy - G * STEP)) / (2 * G)
    if (airborne && fell > LAND_FROM) {
      h.landedAt = t
      emit(s, 'land', h.x, landY, fell)
    }
    h.y = landY
    h.vy = 0
    h.grounded = true
    h.groundAt = t
    h.lift = landLift
    h.chain = 0
  } else {
    h.grounded = false
    h.lift = -1
  }
  if (h.grounded) h.stride += Math.abs(h.vx) * STEP
  return knocked
}

/** Blows a bubble just in front of her at chest height, unless BUBBLES_MAX are out. One that would start inside a wall pops at once. */
function blow(s: Sim, room: Room): void {
  const h = s.hero
  let out = 0
  for (const b of s.bubbles) if (b.alive) out += 1
  if (out >= BUBBLES_MAX) return
  const x = h.x + h.facing * (h.w / 2 + BUBBLE_R)
  const y = h.y - h.h * BUBBLE_CHEST + BUBBLE_R
  const alive = fits(s, room, x, y, BUBBLE_R * 2, BUBBLE_R * 2)
  s.bubbles.push({ x, y, px: x, py: y, vx: h.facing * BUBBLE_SPEED, vy: 0, w: BUBBLE_R * 2, h: BUBBLE_R * 2, bornAt: s.tick, alive })
  h.blewAt = s.tick
  emit(s, 'blow', x, y - BUBBLE_R, 0)
  if (!alive) emit(s, 'pop', x, y - BUBBLE_R, 0)
}

/** Her steps outside play: the rescue bubble's flight, the slide down the pole, the walk to the bed, the hug. */
function scriptHero(s: Sim, room: Room): void {
  const h = s.hero
  const t = s.tick
  if (s.phase === 'rescue') {
    // Along a smoothstep from (fromX, fromY) to (toX, toY), bowed RESCUE_ARC above the straight line.
    const u = Math.min(1, (t - s.phaseAt) / ticks(RESCUE_FOR))
    const k = u * u * (3 - 2 * u)
    h.x = s.fromX + (s.toX - s.fromX) * k
    h.y = s.fromY + (s.toY - s.fromY) * k - RESCUE_ARC * 4 * k * (1 - k)
    if (u < 1) return
    h.x = s.toX
    h.y = s.toY
    h.px = h.x
    h.py = h.y
    h.vx = 0
    h.vy = 0
    h.grounded = true
    h.groundAt = t
    h.chain = 0
    h.safeUntil = t + ticks(SAFE_FOR)
    // A jump pressed during the flight does not fire the moment she lands.
    s.input.jumpAt = -1
    s.phase = 'play'
    s.phaseAt = t
    emit(s, 'rescued', h.x, h.y, s.toX === h.safeX && s.toY === h.safeY ? 0 : 1)
  } else if (s.phase === 'pole') {
    const foot = room.pole.row + 1
    h.vy = POLE_SLIDE
    h.y = Math.min(foot, h.y + POLE_SLIDE * STEP)
    if (h.y < foot) return
    h.vy = 0
    h.grounded = true
    h.groundAt = t
    h.facing = 1
    s.phase = 'walk'
    s.phaseAt = t
  } else if (s.phase === 'walk') {
    const stop = room.bed.col + 0.5 - BED_GAP
    if (h.x < stop) {
      const x = Math.min(stop, h.x + WALK_HOME * STEP)
      h.vx = WALK_HOME
      h.stride += x - h.x
      h.x = x
    }
    if (h.x < stop) return
    h.vx = 0
    s.phase = 'found'
    s.phaseAt = t
    emit(s, 'kitten', room.bed.col + 0.5, room.bed.row + 1, 0)
  } else if (s.phase === 'found' && t - s.phaseAt >= ticks(FOUND_FOR)) {
    s.phase = 'done'
    s.phaseAt = t
    emit(s, 'done', h.x, h.y, 0)
  }
}

// ---------------------------------------------------------------------------------------
// Blocks and items.

/** Block `i` knocked from below by her head: what comes out of a gift box, a cookie block breaking (big) or bumping (small), and everything standing on top knocked over. */
function knockBlock(s: Sim, room: Room, i: number): void {
  const def = room.blocks[i]!
  const b = s.blocks[i]!
  const h = s.hero
  const t = s.tick
  const cx = def.col + 0.5
  if (def.kind === 'gate' || b.state === 'empty') {
    emit(s, 'bonk', h.x, def.row + 1, 0)
    return
  }
  b.bumpedAt = t
  b.hits += 1
  if (def.kind === 'cookie') {
    if (h.form === 'small') emit(s, 'bump', cx, def.row, 0)
    else {
      b.state = 'broken'
      emit(s, 'break', cx, def.row + 0.5, 0)
    }
  } else if (def.gift === 'star' || def.gift === 'stars') {
    s.stars += 1
    emit(s, 'giftStar', cx, def.row, 0)
    if (def.gift === 'star' || b.hits >= STARS_BOX_HITS) b.state = 'empty'
  } else if (def.gift === 'none') throw new Error(`room ${room.id}: gift box ${i} holds nothing`)
  else {
    sprout(s, def, def.gift === 'ball' ? 'ball' : h.form === 'small' ? 'cupcake' : 'wand')
    b.state = 'empty'
  }
  // Whatever stands on the block feels the knock: enemies flip over, items hop and turn.
  const on = (body: Body) => Math.abs(body.y - def.row) <= STAND_TOL && body.x + body.w / 2 > def.col && body.x - body.w / 2 < def.col + 1
  for (const e of s.enemies) {
    if (e.kind !== 'boss' && (e.state === 'asleep' || e.state === 'yawn' || e.state === 'walk' || e.state === 'shell' || e.state === 'slide') && on(e)) knock(s, e, toward(cx, e.x))
  }
  for (const it of s.items) {
    if (it.alive && t - it.bornAt >= ticks(RISE_FOR) && on(it)) {
      it.vy = -ITEM_HOP_V
      it.facing = flip(it.facing)
      it.vx = -it.vx
      it.grounded = false
    }
  }
}

/** A power-up starting to rise out of its box: its feet ITEM_BOX[1] below the box's top, heading away from her. */
function sprout(s: Sim, def: BlockDef, kind: ItemKind): void {
  const x = def.col + 0.5
  const y = def.row + ITEM_BOX[1]
  s.items.push({ x, y, px: x, py: y, vx: 0, vy: 0, w: ITEM_BOX[0], h: ITEM_BOX[1], kind, facing: toward(s.hero.x, x), grounded: false, bornAt: s.tick, alive: true })
  emit(s, 'sprout', x, def.row, 0)
}

/**
 * Items rise one tile over RISE_FOR touching nothing, then the cupcake walks, the ball
 * bounces along and the wand stays. The movers turn at walls and at the edge of a pit, so
 * they can walk off a step but never fall out of the room.
 */
function moveItems(s: Sim, room: Room): void {
  for (const it of s.items) {
    if (!it.alive) continue
    const age = s.tick - it.bornAt
    if (age < ticks(RISE_FOR)) {
      it.vy = -1 / RISE_FOR
      it.y += it.vy * STEP
      continue
    }
    if (age === ticks(RISE_FOR)) it.vy = 0
    const speed = it.kind === 'cupcake' ? CUPCAKE_SPEED : it.kind === 'ball' ? BALL_SPEED : 0
    if (speed > 0 && pitAt(s, room, frontCol(it, it.facing, it.facing * speed * STEP), it.y)) it.facing = flip(it.facing)
    it.vx = it.facing * speed
    const side = walkBody(s, room, it, G)
    if (side !== 0) it.facing = side === 1 ? -1 : 1
    if (it.grounded && it.kind === 'ball') it.vy = -BALL_BOUNCE
    // Only a broken block under it can drop it out of the room; then it is lost.
    if (it.y - it.h > ROWS) it.alive = false
  }
}

/** Her bubbles roll and bounce under BUBBLE_G and pop at a wall or after BUBBLE_FOR. */
function moveBubbles(s: Sim, room: Room): void {
  for (const b of s.bubbles) {
    if (!b.alive) continue
    if (s.tick - b.bornAt >= ticks(BUBBLE_FOR)) {
      b.alive = false
      emit(s, 'pop', b.x, b.y - b.h / 2, 0)
      continue
    }
    b.vy = Math.min(MAX_FALL, b.vy + BUBBLE_G * STEP)
    if (moveX(s, room, b, b.vx * STEP) !== 0) {
      b.alive = false
      emit(s, 'pop', b.x, b.y - b.h / 2, 0)
      continue
    }
    const hit = moveY(s, room, b, b.vy * STEP)
    if (hit !== 0) b.vy = hit === 1 ? -BUBBLE_BOUNCE : 0
    if (b.y - b.h > ROWS) b.alive = false
  }
}

// ---------------------------------------------------------------------------------------
// Enemies.

/** Whether an enemy can still meet anything: not gone, bursting, tumbling, caught or hopping away. */
const active = (e: Enemy) => e.state !== 'gone' && e.state !== 'poof' && e.state !== 'knocked' && e.state !== 'trapped' && e.state !== 'bunny'

/** Flips an enemy over (a bump from below, a shell, the rainbow ball): it tumbles out of the room facing `facing`. */
function knock(s: Sim, e: Enemy, facing: -1 | 1): void {
  e.state = 'knocked'
  e.stateAt = s.tick
  e.facing = facing
  e.vx = KNOCK_VX * facing
  e.vy = -KNOCK_V
  e.grounded = false
  emit(s, 'knock', e.x, e.y - e.h / 2, 0)
}

/** A resting shell sent sliding away from her centre. */
function kick(s: Sim, e: Enemy): void {
  const h = s.hero
  e.state = 'slide'
  e.stateAt = s.tick
  e.facing = e.x === h.x ? h.facing : toward(h.x, e.x)
  e.vx = e.facing * SHELL_SPEED
  emit(s, 'kick', e.x, e.y - e.h / 2, 0)
}

/** A sliding shell that hit a wall or the Big Grumble bursts into SHELL_STARS. */
function popShell(s: Sim, e: Enemy): void {
  e.state = 'gone'
  e.vx = 0
  s.stars += SHELL_STARS
  emit(s, 'shellPop', e.x, e.y - e.h / 2, SHELL_STARS)
}

/** A stomp, bubble or rainbow ball on the Big Grumble: dizzy and smaller, or at the last hit a bunny, and every gate opens. */
function hitBoss(s: Sim, room: Room, e: Enemy): void {
  const t = s.tick
  e.hp -= 1
  e.stateAt = t
  e.vx = 0
  if (e.hp > 0) {
    e.state = 'dizzy'
    ;[e.w, e.h] = BOSS_BOX[e.hp - 1]!
    emit(s, 'bossHit', e.x, e.y - e.h, e.hp)
    return
  }
  e.state = 'bunny'
  ;[e.w, e.h] = BUNNY_BOX
  e.facing = 1
  e.vy = -BUNNY_HOP_V
  emit(s, 'bossDown', e.x, e.y - e.h / 2, 0)
  s.gateAt = t
  room.blocks.forEach((def, i) => {
    if (def.kind !== 'gate') return
    s.blocks[i]!.state = 'open'
    emit(s, 'gate', def.col + 0.5, def.row + 0.5, 0)
  })
}

/**
 * Every enemy's step. Asleep until she is within WAKE_DIST along x, then a yawn, then it
 * walks toward her: a grumble walks off ledges, a snail turns at them, a bee hovers in its
 * band, the Big Grumble follows her inside its arena and hops. Anything that falls out of
 * the bottom of the room is gone.
 */
function moveEnemies(s: Sim, room: Room): void {
  const h = s.hero
  const t = s.tick
  for (const e of s.enemies) {
    switch (e.state) {
      case 'gone':
        continue
      case 'asleep':
      case 'yawn':
        if (e.state === 'asleep' && Math.abs(h.x - e.x) < WAKE_DIST) {
          e.state = 'yawn'
          e.stateAt = t
          emit(s, 'wake', e.x, e.y - e.h, 0)
        } else if (e.state === 'yawn' && t - e.stateAt >= ticks(YAWN_FOR)) {
          e.state = 'walk'
          e.stateAt = t
          e.facing = toward(e.x, h.x)
        }
        // Asleep and yawning, it does not move at all.
        continue
      case 'walk':
        if (e.kind === 'bee') {
          // A smoothstepped triangle wave over BEE_PERIOD, started at its middle and rising first.
          const period = ticks(BEE_PERIOD)
          let u = ((t - e.stateAt) % period) / period + 0.75
          if (u >= 1) u -= 1
          const tri = u < 0.5 ? u * 2 : 2 - u * 2
          const k = tri * tri * (3 - 2 * tri)
          e.y = e.baseY + BEE_RANGE * (2 * k - 1)
          e.vy = guard(e.y - e.py, e) / STEP
          e.facing = toward(e.x, h.x)
        } else if (e.kind === 'boss') {
          if (h.x - e.x > BOSS_TURN) e.facing = 1
          else if (e.x - h.x > BOSS_TURN) e.facing = -1
          const speed = BOSS_SPEED[e.hp - 1]!
          // It never walks over a pit or through a gate: it waits at the edge, facing her.
          e.vx = pitAt(s, room, frontCol(e, e.facing, e.facing * speed * STEP), e.y) ? 0 : e.facing * speed
          if (e.grounded && t > e.stateAt && (t - e.stateAt) % ticks(BOSS_HOP_EVERY) === 0) e.vy = -BOSS_HOP_V
          walkBody(s, room, e, G)
        } else {
          const speed = e.kind === 'grumble' ? GRUMBLE_SPEED : SNAIL_SPEED
          if (e.kind === 'snail' && e.grounded && !standable(s, room, frontCol(e, e.facing, e.facing * speed * STEP), Math.floor(e.y + EPS))) e.facing = flip(e.facing)
          e.vx = e.facing * speed
          const side = walkBody(s, room, e, G)
          if (side !== 0) e.facing = side === 1 ? -1 : 1
        }
        break
      case 'shell':
        e.vx = 0
        walkBody(s, room, e, G)
        if (t - e.stateAt >= ticks(SHELL_WAKE)) {
          e.state = 'walk'
          e.stateAt = t
          ;[e.w, e.h] = SNAIL_BOX
        }
        break
      case 'slide':
        e.vx = e.facing * SHELL_SPEED
        if (walkBody(s, room, e, G) !== 0) popShell(s, e)
        else if (Math.abs(e.x - h.x) > SHELL_FAR) e.state = 'gone'
        break
      case 'poof':
        if (t - e.stateAt >= ticks(POOF_FOR)) e.state = 'gone'
        continue
      case 'knocked':
        e.vy = Math.min(MAX_FALL, e.vy + G * STEP)
        e.x += guard(e.vx * STEP, e)
        e.y += guard(e.vy * STEP, e)
        break
      case 'trapped':
        if (t - e.stateAt >= ticks(TRAPPED_FOR)) {
          e.state = 'gone'
          emit(s, 'pop', e.x, e.y - e.h / 2, 0)
        } else e.y -= TRAPPED_RISE * STEP
        continue
      case 'dizzy':
        e.vx = 0
        walkBody(s, room, e, G)
        if (t - e.stateAt >= ticks(BOSS_DIZZY)) {
          e.state = 'walk'
          e.stateAt = t
        }
        break
      case 'bunny':
        e.vx = BUNNY_SPEED
        walkBody(s, room, e, G)
        if (e.grounded) e.vy = -BUNNY_HOP_V
        if (t - e.stateAt >= ticks(BUNNY_FOR)) e.state = 'gone'
        break
    }
    if (e.y - e.h > ROWS) e.state = 'gone'
  }
}

/** This step's walking grumbles, snails and Big Grumble, gathered by worldContacts (a scratch list, so nothing is allocated per step). */
const walkers: Enemy[] = []

/** What the world does to itself: sliding shells knock over what they meet, walkers turn at each other, bubbles catch enemies. Runs in every phase but the freeze. */
function worldContacts(s: Sim, room: Room): void {
  const enemies = s.enemies
  for (const a of enemies) {
    if (a.state !== 'slide') continue
    for (const b of enemies) {
      // Most pairs are far apart along x: that test comes first.
      if (b === a || Math.abs(b.x - a.x) >= (a.w + b.w) / 2 || !active(b) || !overlaps(a, b)) continue
      if (b.kind === 'boss') {
        popShell(s, a)
        break
      }
      knock(s, b, a.facing)
    }
  }
  walkers.length = 0
  for (const e of enemies) if (e.state === 'walk' && e.kind !== 'bee') walkers.push(e)
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i]!
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j]!
      if (Math.abs(b.x - a.x) >= (a.w + b.w) / 2 || !overlaps(a, b)) continue
      // Each turns away if it was walking into the other; the Big Grumble keeps following her.
      if (a.kind !== 'boss' && a.facing === toward(a.x, b.x)) a.facing = flip(a.facing)
      if (b.kind !== 'boss' && b.facing === toward(b.x, a.x)) b.facing = flip(b.facing)
    }
  }
  for (const b of s.bubbles) {
    if (!b.alive) continue
    for (const e of enemies) {
      if (Math.abs(e.x - b.x) >= (e.w + b.w) / 2 || !active(e) || !overlaps(b, e)) continue
      b.alive = false
      if (e.kind !== 'boss') {
        e.state = 'trapped'
        e.stateAt = s.tick
        e.vx = 0
        e.vy = -TRAPPED_RISE
        emit(s, 'trap', e.x, e.y - e.h / 2, 0)
      } else if (e.state === 'dizzy') emit(s, 'pop', b.x, b.y - b.h / 2, 0)
      else hitBoss(s, room, e)
      break
    }
  }
}

// ---------------------------------------------------------------------------------------
// Her contacts, pits and the pole.

/** Her contacts in play: stomps, then hurts, kicks, the ball and the Big Grumble's push, then items, springs and map stars. */
function heroContacts(s: Sim, room: Room): void {
  const h = s.hero
  const t = s.tick
  const left = h.x - h.w / 2
  const right = h.x + h.w / 2
  const top = h.y - h.h
  let stomped = false
  let hurter: Enemy | null = null
  for (const e of s.enemies) {
    // Too far along x for the stomp box (the widest) to reach her: the usual case, tested first.
    if (Math.abs(e.x - h.x) >= e.w / 2 + STOMP_PAD + h.w / 2) continue
    if (!active(e) || ((e.state === 'shell' || e.state === 'slide') && t - e.stateAt < ticks(SHELL_GRACE))) continue
    // A stomp: her feet at the start of the step at or above its middle then, and her box in its widened box now.
    if (h.py <= e.py - e.h / 2 && left < e.x + e.w / 2 + STOMP_PAD && e.x - e.w / 2 - STOMP_PAD < right && top < e.y && e.y - e.h < h.y) {
      stomped = true
      const bounceOnly = e.kind === 'boss' && e.state === 'dizzy'
      if (e.kind === 'grumble') {
        e.state = 'poof'
        e.stateAt = t
        e.vx = 0
      } else if (e.kind === 'bee') knock(s, e, toward(h.x, e.x))
      else if (e.kind === 'boss') {
        if (!bounceOnly) hitBoss(s, room, e)
      } else if (e.state === 'shell') kick(s, e)
      else {
        // A walking snail hides in its shell, and a sliding shell stops.
        if (e.state !== 'slide') [e.w, e.h] = SHELL_BOX
        e.state = 'shell'
        e.stateAt = t
        e.vx = 0
      }
      h.vy = Math.min(h.vy, -(s.input.jumpHeld ? STOMP_HELD_V : STOMP_V))
      h.launch = 'stomp'
      h.grounded = false
      h.lift = -1
      let pay = 0
      if (!bounceOnly) {
        h.chain += 1
        pay = Math.min(h.chain, CHAIN_MAX)
        s.stars += pay
      }
      emit(s, 'stomp', e.x, e.y - e.h, pay)
      continue
    }
    // Otherwise a touch: her box in its box narrowed by HURT_INSET at the sides and the top.
    if (!(left < e.x + e.w / 2 - HURT_INSET && e.x - e.w / 2 + HURT_INSET < right && top < e.y && e.y - e.h + HURT_INSET < h.y)) continue
    if (e.kind === 'boss') {
      h.vx = h.x < e.x ? -BOSS_PUSH : BOSS_PUSH
      if (t < h.ballUntil && e.state !== 'dizzy') hitBoss(s, room, e)
    } else if (t < h.ballUntil) knock(s, e, toward(h.x, e.x))
    else if (e.state === 'shell') kick(s, e)
    else if (e.state !== 'slide' && !hurter) hurter = e
  }
  // One hit at most, and none in a step with a stomp: bubble to big, big to small, small to dizzy.
  if (hurter && !stomped && t >= h.safeUntil) {
    if (h.form === 'small') {
      h.dizzyUntil = t + ticks(DIZZY_FOR)
      emit(s, 'hurt', h.x, h.y - h.h / 2, 0)
    } else {
      if (h.form === 'big') [h.w, h.h] = heroBox('small')
      h.was = h.form
      h.form = h.form === 'bubble' ? 'big' : 'small'
      h.changedAt = t
      s.phase = 'freeze'
      s.phaseAt = t
      emit(s, 'shrink', h.x, h.y - h.h / 2, 0)
    }
    h.hurtAt = t
    h.safeUntil = t + ticks(SAFE_FOR)
    hurter.facing = toward(h.x, hurter.x)
  }

  // Power-ups, once they are out of their box. A hit this step leaves them for after the freeze.
  for (const it of s.items) {
    if (!it.alive || s.phase !== 'play' || t - it.bornAt < ticks(RISE_FOR) || !overlaps(h, it)) continue
    if (it.kind === 'ball') {
      it.alive = false
      h.ballUntil = t + ticks(BALL_FOR)
      emit(s, 'ball', h.x, h.y - h.h / 2, 0)
    } else if (it.kind === 'cupcake' ? h.form !== 'small' : h.form === 'bubble') {
      // A power she already has is a star.
      it.alive = false
      s.stars += 1
      emit(s, 'giftStar', it.x, it.y - it.h, 0)
    } else if (it.kind === 'cupcake') {
      it.alive = false
      if (!grow(s, room, 'big')) h.banked = true
    } else if (grow(s, room, 'bubble')) it.alive = false
  }

  // Springs: her feet crossing a spring's top on the way down, near its centre.
  if (s.phase === 'play' && h.y > h.py) {
    for (let i = 0; i < room.springs.length; i++) {
      const c = room.springs[i]!
      const cx = c.col + 0.5
      const springTop = c.row + 1 - SPRING_TOP
      if (h.py > springTop + EPS || h.y < springTop || Math.abs(h.x - cx) > SPRING_REACH) continue
      h.y = springTop
      h.vy = -SPRING_V
      h.launch = 'spring'
      h.grounded = false
      h.lift = -1
      h.groundAt = -1
      s.springs[i] = t
      emit(s, 'spring', cx, springTop, 0)
      break
    }
  }

  // Map stars.
  const half = STAR_BOX / 2
  for (let i = 0; i < room.stars.length; i++) {
    const c = room.stars[i]!
    const cx = c.col + 0.5
    const cy = c.row + 0.5
    if (Math.abs(cx - h.x) >= half + h.w / 2 || s.taken[i] || cy + half <= h.y - h.h || cy - half >= h.y) continue
    s.taken[i] = 1
    s.stars += 1
    emit(s, 'star', cx, cy, 0)
  }
}

/**
 * Grows small Pia to `to` (big or bubble, a cupcake or the wand) or turns big Pia into
 * bubble Pia, freezing the world for the tween. Small Pia needs room for the big box at
 * her x, GROW_NUDGE right or GROW_NUDGE left; with none it changes nothing and says so.
 */
function grow(s: Sim, room: Room, to: 'big' | 'bubble'): boolean {
  const h = s.hero
  if (h.form === 'small') {
    const x = [h.x, h.x + GROW_NUDGE, h.x - GROW_NUDGE].find((x) => fits(s, room, x, h.y, BIG_W, BIG_H))
    if (x === undefined) return false
    h.x = x
    ;[h.w, h.h] = heroBox(to)
  }
  h.was = h.form
  h.form = to
  h.banked = false
  h.changedAt = s.tick
  s.phase = 'freeze'
  s.phaseAt = s.tick
  emit(s, to === 'big' ? 'grow' : 'wand', h.x, h.y - h.h / 2, 0)
  return true
}

/** The end of her step of play: a fall out of the room, safe ground, a banked cupcake, the pole. */
function pitsAndPole(s: Sim, room: Room): void {
  const h = s.hero
  const t = s.tick
  if (h.y > ROWS + 1) {
    // The gap under her, or the nearest one. Its HELP_AFTER-th fall carries her across.
    let g = gapAt(room, Math.floor(h.x))
    if (g < 0) {
      let best = Infinity
      room.gaps.forEach((gap, i) => {
        const d = Math.max(gap.col0 - h.x, h.x - gap.col1, 0)
        if (d < best) {
          best = d
          g = i
        }
      })
    }
    if (g < 0) throw new Error(`Pia fell out of room ${room.id} at x ${h.x.toFixed(2)}, which has no gap in its floor`)
    s.falls[g] = Math.min(255, s.falls[g]! + 1)
    emit(s, 'fall', h.x, ROWS + 1, 0)
    s.fromX = h.x
    s.fromY = ROWS + 1
    if (s.falls[g]! >= HELP_AFTER) {
      const gap = room.gaps[g]!
      let c = Math.ceil(gap.col1 + SAFE_MARGIN - 0.5)
      while (c < room.cols && !(room.floor[c]! >= 0 && !solidAt(s, room, c, room.floor[c]! - 1) && !solidAt(s, room, c, room.floor[c]! - 2))) c += 1
      if (c >= room.cols) throw new Error(`room ${room.id}: no floor to set her down on past the gap at column ${gap.col0}`)
      s.toX = c + 0.5
      s.toY = room.floor[c]!
    } else {
      s.toX = h.safeX
      s.toY = h.safeY
    }
    h.y = s.fromY
    h.vx = 0
    h.vy = 0
    h.grounded = false
    h.lift = -1
    h.launch = 'none'
    h.facing = toward(h.x, s.toX)
    s.phase = 'rescue'
    s.phaseAt = t
    return
  }

  // Safe ground: a static tile under her centre column with static tiles on both sides and two free cells above her feet.
  const col = Math.floor(h.x)
  const row = h.y
  if (h.grounded && h.lift < 0 && Math.floor(row) === row) {
    if (cellAt(room, col, row) === SOLID && cellAt(room, col - 1, row) === SOLID && cellAt(room, col + 1, row) === SOLID && !solidAt(s, room, col, row - 1) && !solidAt(s, room, col, row - 2)) {
      h.safeX = col + 0.5
      h.safeY = row
    }
  }

  if (h.banked && h.form === 'small' && grow(s, room, 'big')) return

  // The pole: her box reaching it with her feet at or above its foot.
  const poleX = room.pole.col + 0.5
  const foot = room.pole.row + 1
  if (h.x + h.w / 2 < poleX || h.y > foot + EPS) return
  h.x = poleX - POLE_HALF - h.w / 2
  h.vx = 0
  h.vy = 0
  h.grounded = false
  h.lift = -1
  h.launch = 'none'
  h.skidding = false
  h.pushTicks = 0
  h.facing = 1
  h.ballUntil = -1
  s.poleY = h.y - POLE_GRIP * h.h
  s.poleBonus = Math.min(POLE_STARS, Math.max(1, Math.ceil((POLE_STARS * (foot - s.poleY)) / POLE_HEIGHT)))
  s.stars += s.poleBonus
  s.phase = 'pole'
  s.phaseAt = t
  emit(s, 'pole', poleX, s.poleY, s.poleBonus)
}

// ---------------------------------------------------------------------------------------
// Input and cloning.

/** The direction she is pushed, or 0 when no direction is held. */
export function setMove(s: Sim, dir: -1 | 0 | 1): void {
  s.input.move = dir
}

/** The jump button went down: held until releaseJump, and remembered for JUMP_BUFFER. The input layer never repeats it while the key stays down. */
export function pressJump(s: Sim): void {
  s.input.jumpHeld = true
  s.input.jumpAt = s.tick
}

/** Lets go of the jump. A press and a release between two steps still makes a hop. */
export function releaseJump(s: Sim): void {
  s.input.jumpHeld = false
}

/** The bubble button went down: blows at once (in the bubble form), then one more every BUBBLE_EVERY while it is held. */
export function pressBubble(s: Sim): void {
  s.input.bubbleHeld = true
  s.input.bubbleAt = s.tick
}

/** Lets go of the bubble button. */
export function releaseBubble(s: Sim): void {
  s.input.bubbleHeld = false
}

/** A copy that shares nothing that changes with the original: every entity is flat, so a spread per object is a deep copy. */
export function cloneSim(s: Sim): Sim {
  return {
    ...s,
    input: { ...s.input },
    hero: { ...s.hero },
    enemies: s.enemies.map((e) => ({ ...e })),
    items: s.items.map((it) => ({ ...it })),
    bubbles: s.bubbles.map((b) => ({ ...b })),
    blocks: s.blocks.map((b) => ({ ...b })),
    lifts: s.lifts.map((l) => ({ ...l })),
    springs: s.springs.slice(),
    taken: s.taken.slice(),
    falls: s.falls.slice(),
    events: s.events.map((e) => ({ ...e })),
  }
}
