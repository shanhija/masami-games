/**
 * Super Me's rules as plain numbers: no canvas in here, so vitest can play every level
 * through. The running, jumping, gravity, collision and rescue are Pia Jump's
 * (pia-jump/src/game/sim.ts) with big Pia's feel; what is new is the blocks she builds,
 * the ladders she climbs, the crates, the presents and the finish. Units and state are in
 * model.ts; the parsed level is shared and never changed.
 *
 * One step, in order: she copies her place into px, py; a present holds everything still;
 * the rescue flies her, or she moves (climbing, running, jumping, landing); a build press
 * puts a block down; her contacts with trampolines, crates, presents and the finish are
 * judged; then pits and safe ground, and the tick counts.
 *
 * Collision needs no sweeps: a velocity that asks for more than MAX_STEP_MOVE in one step
 * throws, so a box enters at most one new column or row per step.
 */

import * as pia from '../../../pia-jump/src/game/model'
import { gapAt, solidTile, tileAt } from '../../../pia-jump/src/game/room'
import { LAND_FROM, RESCUE_ARC, SKID_FROM } from '../../../pia-jump/src/game/sim'
import * as model from './model'
import type { Cell, EventKind, Hero, Kind, Level, Sim } from './model'

// Imported bindings are read once into module constants, as in Pia Jump's sim: vitest's module runner turns every read of one into a getter call.
const { ACCEL, AIR_ACCEL, COYOTE, EPS, FRICTION, G, G_LOW, HEAD_NUDGE_BIG, HELP_AFTER, JUMP_BUFFER, JUMP_V, JUMP_V_RUN, MAX_FALL, MAX_STEP_MOVE, MIN_JUMP_HOLD, RESCUE_FOR, ROWS, RUN, RUN_ACCEL, RUN_AFTER, SAFE_MARGIN, SKID, SPRING_TOP, SPRING_V, STEP, TILE, TOE_ASSIST, WALK, ticks } = pia
const { BUILT, CLIMB, CLIMB_SIDE, CRATE_BOX, FINISH_FOR, HERO_H, HERO_W, KINDS, LADDER, LADDER_MIN, LET_GO, PLANK, PLANK_SKIP, PRESENT_FOR, TRAMPOLINE_REACH } = model

/** The finish takes her when her front reaches the arch's middle with her feet at most this far above its foot. */
export const FINISH_REACH = 4

/** A fresh visit to a level: she stands at the start with empty hands, every crate and present in place. */
export function createSim(level: Level): Sim {
  const x = level.start.col + 0.5
  const y = level.start.row + 1
  return {
    tick: 0,
    phase: 'play',
    phaseAt: 0,
    input: { move: 0, jumpHeld: false, jumpAt: -1, buildAt: -1 },
    hero: {
      x, y, px: x, py: y, vx: 0, vy: 0, w: HERO_W, h: HERO_H,
      facing: 1, grounded: true, launch: 'none', groundAt: 0, jumpedAt: -1, landedAt: -1, bonkedAt: -1,
      climbing: false, letGoUntil: -1, builtAt: -1, nopeAt: -1, stride: 0, pushTicks: 0, skidding: false, safeX: x, safeY: y,
    },
    hand: { plank: 0, cube: 0, trampoline: 0, ladder: 0 },
    chosen: 'plank',
    pieces: [],
    built: new Uint8Array(level.tiles.length),
    taken: new Uint8Array(level.crates.length),
    opened: new Uint8Array(level.presents.length),
    falls: new Uint8Array(level.gaps.length),
    present: -1,
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    events: [],
  }
}

/** One step of 1/HZ seconds. It runs at s.tick, stamps what it writes with s.tick and ends with s.tick += 1. */
export function step(s: Sim, level: Level): void {
  const h = s.hero
  h.px = h.x
  h.py = h.y
  if (s.phase === 'present') {
    if (s.tick - s.phaseAt < ticks(PRESENT_FOR)) {
      s.tick += 1
      return
    }
    s.phase = 'play'
    s.phaseAt = s.tick
    s.present = -1
  }
  if (s.phase === 'rescue') fly(s, level)
  else if (s.phase === 'play' || s.phase === 'finish') {
    moveHero(s, level)
    if (s.phase === 'play') {
      if (s.input.buildAt >= 0) build(s, level)
      contacts(s, level)
      pits(s, level)
    } else if (s.tick - s.phaseAt >= ticks(FINISH_FOR)) {
      s.phase = 'done'
      s.phaseAt = s.tick
      emit(s, 'done', h.x, h.y, 0)
    }
  }
  s.input.buildAt = -1
  s.tick += 1
}

// ---------------------------------------------------------------------------------------
// Cells and boxes.

const emit = (s: Sim, kind: EventKind, x: number, y: number, n: number) => {
  s.events.push({ kind, x, y, n })
}

function guard(d: number, b: { x: number; y: number }): number {
  if (Math.abs(d) > MAX_STEP_MOVE) throw new Error(`she moved ${d.toFixed(3)} tiles in one step at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}), past MAX_STEP_MOVE ${MAX_STEP_MOVE}`)
  return d
}

/** A cell's part in collision: nothing, solid from every side, or a shelf, solid only from above. */
const AIR = 0
const SOLID = 1
const SHELF = 2

/** What the cell at (col, row) is to collision: the level's own tile, or else what her blocks make of it. Outside the level, walls beyond both ends and air above and below. */
function cellAt(s: Sim, level: Level, col: number, row: number): number {
  if (col < 0 || col >= level.cols || row < 0 || row >= ROWS) return solidTile(tileAt(level, col, row)) ? SOLID : AIR
  const i = row * level.cols + col
  const code = level.tiles[i]!
  if (solidTile(code)) return SOLID
  if (code === TILE.shelf) return SHELF
  const b = s.built[i]!
  return b === BUILT.cube ? SOLID : b === BUILT.plank || b === BUILT.ladderTop ? SHELF : AIR
}

const solidAt = (s: Sim, level: Level, col: number, row: number) => cellAt(s, level, col, row) === SOLID
const standable = (s: Sim, level: Level, col: number, row: number) => cellAt(s, level, col, row) !== AIR

/** Whether a box with its feet centre at (x, y) covers no solid cell. */
function fits(s: Sim, level: Level, x: number, y: number, w: number, h: number): boolean {
  const c1 = Math.ceil(x + w / 2 - EPS) - 1
  const r1 = Math.ceil(y - EPS) - 1
  for (let r = Math.floor(y - h + EPS); r <= r1; r++) {
    for (let c = Math.floor(x - w / 2 + EPS); c <= c1; c++) if (solidAt(s, level, c, r)) return false
  }
  return true
}

/** The column a box's leading edge is in once its centre is at nx, moving the way dir says. */
const leadCol = (nx: number, w: number, dir: -1 | 1) => (dir > 0 ? Math.ceil(nx + w / 2 - EPS) - 1 : Math.floor(nx - w / 2 + EPS))

/** The first row from r0 down to r1 that holds a solid cell in column col, or r1 + 1 when none does. */
function solidRow(s: Sim, level: Level, col: number, r0: number, r1: number): number {
  for (let r = r0; r <= r1; r++) if (solidAt(s, level, col, r)) return r
  return r1 + 1
}

/** Whether her box touches the square CRATE_BOX wide around the centre of cell c. */
function touches(h: Hero, c: Cell): boolean {
  const half = CRATE_BOX / 2
  const cx = c.col + 0.5
  const cy = c.row + 0.5
  return Math.abs(cx - h.x) < half + h.w / 2 && cy + half > h.y - h.h && cy - half < h.y
}

/** Whether a ladder fills a cell of her centre column that her box covers. */
function onLadder(s: Sim, level: Level, h: Hero): boolean {
  const col = Math.floor(h.x)
  if (col < 0 || col >= level.cols) return false
  const r1 = Math.min(ROWS - 1, Math.ceil(h.y - EPS) - 1)
  for (let r = Math.max(0, Math.floor(h.y - h.h + EPS)); r <= r1; r++) {
    const b = s.built[r * level.cols + col]!
    if (b === BUILT.ladder || b === BUILT.ladderTop) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------
// Her moves.

/**
 * Her step: running and turning, a jump (from the ground, within COYOTE of it, or off a
 * ladder), gravity, then her move on x (with the toe assist) and on y (landing on tiles,
 * shelves and blocks; her head nudged past a corner or stopped). On a ladder she climbs on
 * her own instead of falling: standing still in a ladder's column, or meeting one in the
 * air, takes her up it, and pushing sideways walks her off it.
 */
function moveHero(s: Sim, level: Level): void {
  const h = s.hero
  const inp = s.input
  const t = s.tick
  const steering = s.phase === 'play'
  const push = steering ? inp.move : 0
  const airborne = !h.grounded

  const wasClimbing = h.climbing
  h.climbing = t >= h.letGoUntil && onLadder(s, level, h) && (wasClimbing || !h.grounded || push === 0)
  if (h.climbing && !wasClimbing) emit(s, 'climb', h.x, h.y, 0)

  // Running. pushTicks counts ticks of pushing one way on the ground; letting go or turning resets it.
  if (push !== h.facing) h.pushTicks = 0
  if (push !== 0) {
    if (h.grounded) h.pushTicks += 1
    h.facing = push
  }
  const wasSkidding = h.skidding
  h.skidding = false
  if (h.climbing) h.vx = push * CLIMB_SIDE
  else if (h.grounded) {
    if (push === 0) h.vx = h.vx > 0 ? Math.max(0, h.vx - FRICTION * STEP) : Math.min(0, h.vx + FRICTION * STEP)
    else {
      let u = push * h.vx
      if (u < 0) {
        u = Math.min(0, u + SKID * STEP)
        h.skidding = -u > SKID_FROM
      } else if (u < WALK) u = Math.min(WALK, u + ACCEL * STEP)
      else if (h.pushTicks > ticks(RUN_AFTER)) u = Math.min(RUN, u + RUN_ACCEL * STEP)
      h.vx = push * u
    }
  } else if (push !== 0) {
    const u = push * h.vx
    if (u < WALK) h.vx = push * Math.min(WALK, u + AIR_ACCEL * STEP)
  }
  if (h.skidding && !wasSkidding) emit(s, 'skid', h.x, h.y, 0)

  // Jumping: a press is remembered for JUMP_BUFFER; it goes from the ground, COYOTE after leaving it, or off a ladder.
  if (steering && inp.jumpAt >= 0 && t - inp.jumpAt <= ticks(JUMP_BUFFER) && (h.climbing || h.grounded || (h.groundAt >= 0 && t - h.groundAt <= ticks(COYOTE)))) {
    h.vy = -(JUMP_V + (JUMP_V_RUN - JUMP_V) * Math.min(1, Math.abs(h.vx) / RUN))
    h.launch = 'jump'
    h.jumpedAt = t
    inp.jumpAt = -1
    h.grounded = false
    h.groundAt = -1
    if (h.climbing) {
      h.climbing = false
      h.letGoUntil = t + ticks(LET_GO)
    }
    emit(s, 'jump', h.x, h.y, Math.abs(h.vx))
  }

  // Gravity: none on a ladder; gentle while a jump rises with the button held (or for MIN_JUMP_HOLD) or a trampoline's throw rises.
  if (h.climbing) {
    h.vy = -CLIMB
    h.launch = 'none'
  } else {
    // Over the top of a ladder she stops climbing and steps onto it instead of flying on.
    if (wasClimbing && h.launch === 'none') h.vy = Math.max(h.vy, 0)
    const low = h.vy < 0 && (h.launch === 'trampoline' || (h.launch === 'jump' && (inp.jumpHeld || t - h.jumpedAt < ticks(MIN_JUMP_HOLD))))
    h.vy = Math.min(MAX_FALL, h.vy + (low ? G_LOW : G) * STEP)
    if (h.vy >= 0) h.launch = 'none'
  }

  // Her move on x. Falling into a ledge whose top is at most TOE_ASSIST above her feet sets her on it.
  let landY = Infinity
  const dx = h.vx * STEP
  if (dx !== 0) {
    const nx = h.x + guard(dx, h)
    const dir = dx > 0 ? 1 : -1
    const col = leadCol(nx, h.w, dir)
    const r1 = Math.ceil(h.y - EPS) - 1
    const top = solidRow(s, level, col, Math.floor(h.y - h.h + EPS), r1)
    if (top > r1) h.x = nx
    else if (h.vy >= 0 && h.y - top <= TOE_ASSIST && fits(s, level, nx, top, h.w, h.h)) {
      h.x = nx
      landY = top
    } else {
      h.x = dir > 0 ? col - h.w / 2 : col + 1 + h.w / 2
      h.vx = 0
    }
  }

  // Her move on y.
  const dy = h.vy * STEP
  if (landY === Infinity && dy !== 0) {
    const ny = h.y + guard(dy, h)
    const c0 = Math.floor(h.x - h.w / 2 + EPS)
    const c1 = Math.ceil(h.x + h.w / 2 - EPS) - 1
    if (dy > 0) {
      // The first top her feet reach: a solid cell, or a shelf her feet were at or above at the start of the step.
      const row = Math.floor(ny + EPS)
      for (let c = c0; c <= c1; c++) {
        const cell = cellAt(s, level, c, row)
        if (cell === SOLID || (cell === SHELF && h.py <= row + EPS)) {
          landY = row
          break
        }
      }
      if (landY === Infinity) h.y = ny
    } else {
      const row = Math.floor(ny - h.h + EPS)
      let hits = 0
      let hitCol = 0
      for (let c = c0; c <= c1; c++) {
        if (solidAt(s, level, c, row)) {
          hits += 1
          hitCol = c
        }
      }
      // Clipping one cell by less than the nudge slides her clear of its corner, if she fits there.
      const clearX = hitCol === c0 ? hitCol + 1 + h.w / 2 : hitCol - h.w / 2
      if (hits === 0) h.y = ny
      else if (hits === 1 && c0 !== c1 && Math.abs(clearX - h.x) < HEAD_NUDGE_BIG && fits(s, level, clearX, ny, h.w, h.h)) {
        h.x = clearX
        h.y = ny
      } else {
        h.y = row + 1 + h.h
        h.vy = 0
        h.bonkedAt = t
        if (!h.climbing) emit(s, 'bonk', h.x, row + 1, 0)
      }
    }
  }

  if (landY !== Infinity) {
    // How far she fell, read from her landing speed, as in Pia Jump.
    const fell = (h.vy * (h.vy - G * STEP)) / (2 * G)
    if (airborne && !wasClimbing && fell > LAND_FROM) {
      h.landedAt = t
      emit(s, 'land', h.x, landY, fell)
    }
    h.y = landY
    h.vy = 0
    h.grounded = true
    h.groundAt = t
  } else h.grounded = false
  if (h.grounded || h.climbing) h.stride += Math.abs(h.x - h.px) + Math.abs(h.y - h.py)
}

/** Her steps in the rescue bubble: from where she fell to (toX, toY) over RESCUE_FOR, in an arc RESCUE_ARC over the straight line. */
function fly(s: Sim, level: Level): void {
  const h = s.hero
  const k = Math.min(1, (s.tick + 1 - s.phaseAt) / ticks(RESCUE_FOR))
  const e = k * k * (3 - 2 * k)
  h.x = s.fromX + (s.toX - s.fromX) * e
  h.y = s.fromY + (s.toY - s.fromY) * e - RESCUE_ARC * 4 * e * (1 - e)
  if (k < 1) return
  // A block she built since may stand on the spot: she is set down on top of it.
  while (!fits(s, level, h.x, h.y, h.w, h.h) && h.y > h.h) h.y -= 1
  h.vx = 0
  h.vy = 0
  h.grounded = true
  h.groundAt = s.tick
  h.climbing = false
  s.phase = 'play'
  s.phaseAt = s.tick
  emit(s, 'rescued', h.x, h.y, Math.abs(s.toX - h.safeX) > EPS || Math.abs(s.toY - h.safeY) > EPS ? 1 : 0)
}

// ---------------------------------------------------------------------------------------
// Building.

/** Where a block goes: its first cell and how many it fills (a plank to the right, a ladder down). */
export interface Spot {
  col: number
  row: number
  size: number
}

/**
 * Where the chosen block would go now, or null when it fits nowhere:
 *
 * - On the ground a plank is a bridge from under her feet out the way she faces, starting
 *   past up to PLANK_SKIP cells of her own floor; a cube fills the hole in front of her
 *   feet, or else stands on the floor in front of her; a trampoline stands in front of her.
 * - In the air a plank, a cube or a trampoline goes right under her feet.
 * - A ladder always stands on the first thing under her and reaches LADDER cells up, in her
 *   own column; under a ceiling it stops low enough for her to stand on its top, and is no
 *   ladder at all below LADDER_MIN cells.
 *
 * A block only goes into empty air, inside the level, never over a crate or a present still
 * there.
 */
export function buildSpot(s: Sim, level: Level, kind: Kind): Spot | null {
  const h = s.hero
  const free = (c: number, r: number) => {
    if (c < 0 || c >= level.cols || r < 0 || r >= ROWS) return false
    if (cellAt(s, level, c, r) !== AIR || s.built[r * level.cols + c] !== BUILT.none) return false
    for (let i = 0; i < level.crates.length; i++) if (!s.taken[i] && level.crates[i]!.col === c && level.crates[i]!.row === r) return false
    for (let i = 0; i < level.presents.length; i++) if (!s.opened[i] && level.presents[i]!.col === c && level.presents[i]!.row === r) return false
    return true
  }
  const col = Math.floor(h.x)
  if (kind === 'ladder') {
    let floor = h.grounded ? Math.round(h.y) : Math.ceil(h.y - EPS)
    while (floor < ROWS && !standable(s, level, col, floor)) floor++
    if (floor >= ROWS) return null
    let top = floor
    while (top > floor - LADDER && free(col, top - 1)) top--
    // She must fit standing on its top: no solid cell in the two above it.
    while (top < floor && (solidAt(s, level, col, top - 1) || solidAt(s, level, col, top - 2))) top++
    return floor - top >= LADDER_MIN ? { col, row: top, size: floor - top } : null
  }
  if (h.grounded) {
    const r = Math.round(h.y)
    const d = h.facing
    const front = d > 0 ? Math.ceil(h.x + h.w / 2 - EPS) : Math.floor(h.x - h.w / 2 + EPS) - 1
    if (kind === 'plank') {
      let c = front
      for (let i = 0; i < PLANK_SKIP && standable(s, level, c, r); i++) c += d
      const c0 = d > 0 ? c : c - (PLANK - 1)
      for (let k = 0; k < PLANK; k++) if (!free(c0 + k, r)) return null
      return { col: c0, row: r, size: PLANK }
    }
    if (kind === 'cube' && free(front, r)) return { col: front, row: r, size: 1 }
    return free(front, r - 1) ? { col: front, row: r - 1, size: 1 } : null
  }
  const r = Math.ceil(h.y - EPS)
  if (kind === 'plank') {
    // Centred under her, or else reaching out the way she faces, or else the other way.
    for (const c0 of h.facing > 0 ? [col - 1, col, col - 2] : [col - 1, col - 2, col]) {
      let ok = true
      for (let k = 0; k < PLANK && ok; k++) ok = free(c0 + k, r)
      if (ok) return { col: c0, row: r, size: PLANK }
    }
    return null
  }
  return free(col, r) ? { col, row: r, size: 1 } : null
}

/** The build button: the chosen block where buildSpot says, if she holds one and it fits; else a "nope". */
function build(s: Sim, level: Level): void {
  const h = s.hero
  const kind = s.chosen
  const spot = s.hand[kind] > 0 ? buildSpot(s, level, kind) : null
  if (!spot) {
    h.nopeAt = s.tick
    emit(s, 'nope', h.x, h.y - h.h, s.hand[kind])
    return
  }
  s.hand[kind] -= 1
  s.pieces.push({ kind, col: spot.col, row: spot.row, size: spot.size, at: s.tick, usedAt: -1 })
  for (let k = 0; k < spot.size; k++) {
    const c = kind === 'plank' ? spot.col + k : spot.col
    const r = kind === 'ladder' ? spot.row + k : spot.row
    s.built[r * level.cols + c] = kind === 'cube' ? BUILT.cube : kind === 'plank' ? BUILT.plank : kind === 'trampoline' ? BUILT.trampoline : k === 0 ? BUILT.ladderTop : BUILT.ladder
  }
  h.builtAt = s.tick
  emit(s, 'build', kind === 'plank' ? spot.col + PLANK / 2 : spot.col + 0.5, spot.row + 0.5, KINDS.indexOf(kind))
  if (s.hand[kind] === 0) s.chosen = KINDS.find((k) => s.hand[k] > 0) ?? kind
}

// ---------------------------------------------------------------------------------------
// Contacts, pits and safe ground.

/** Trampolines, crates (and the refill), presents and the finish. */
function contacts(s: Sim, level: Level): void {
  const h = s.hero
  const t = s.tick

  // A trampoline throws her up when her feet are on its mat or below it in its cell and she is not going up: landing on it, or walking into it.
  if (h.vy >= 0) {
    for (const p of s.pieces) {
      if (p.kind !== 'trampoline') continue
      const top = p.row + 1 - SPRING_TOP
      if (Math.abs(h.x - (p.col + 0.5)) > TRAMPOLINE_REACH || h.y < top - EPS || h.y > p.row + 1 + EPS) continue
      h.vy = -SPRING_V
      h.launch = 'trampoline'
      h.grounded = false
      h.groundAt = -1
      h.climbing = false
      p.usedAt = t
      emit(s, 'bounce', p.col + 0.5, top, 0)
      break
    }
  }

  level.crates.forEach((c, i) => {
    if (s.taken[i] || !touches(h, c)) return
    s.taken[i] = 1
    s.hand[c.kind] += 1
    s.chosen = c.kind
    emit(s, 'crate', c.col + 0.5, c.row + 0.5, KINDS.indexOf(c.kind))
  })
  // Empty hands and no crate left: every crate comes back, so she is never stuck for want of blocks.
  if (level.crates.length > 0 && KINDS.every((k) => s.hand[k] === 0) && s.taken.every((v) => v === 1)) {
    s.taken.fill(0)
    emit(s, 'refill', h.x, h.y - h.h, 0)
  }

  for (let i = 0; i < level.presents.length; i++) {
    const p = level.presents[i]!
    if (s.opened[i] || !touches(h, p)) continue
    s.opened[i] = 1
    s.present = i
    s.phase = 'present'
    s.phaseAt = t
    emit(s, 'present', p.col + 0.5, p.row + 0.5, i)
    return
  }

  const fx = level.finish.col + 0.5
  const foot = level.finish.row + 1
  if (h.x + h.w / 2 >= fx && h.y <= foot + EPS && h.y >= foot - FINISH_REACH) {
    h.climbing = false
    s.phase = 'finish'
    s.phaseAt = t
    emit(s, 'finish', fx, foot, 0)
  }
}

/** A fall out of the level starts the rescue bubble; standing on safe ground remembers it. */
function pits(s: Sim, level: Level): void {
  const h = s.hero
  if (h.y > ROWS + 1) {
    // The gap under her, or the nearest one. Its HELP_AFTER-th fall carries her across.
    let g = gapAt(level, Math.floor(h.x))
    if (g < 0) {
      let best = Infinity
      level.gaps.forEach((gap, i) => {
        const d = Math.max(gap.col0 - h.x, h.x - gap.col1, 0)
        if (d < best) {
          best = d
          g = i
        }
      })
    }
    if (g < 0) throw new Error(`she fell out of level ${level.id} at x ${h.x.toFixed(2)}, which has no gap in its floor`)
    s.falls[g] = Math.min(255, s.falls[g]! + 1)
    emit(s, 'fall', h.x, ROWS + 1, 0)
    s.fromX = h.x
    s.fromY = ROWS + 1
    if (s.falls[g]! >= HELP_AFTER) {
      const gap = level.gaps[g]!
      let c = Math.ceil(gap.col1 + SAFE_MARGIN - 0.5)
      while (c < level.cols && !(level.floor[c]! >= 0 && !solidAt(s, level, c, level.floor[c]! - 1) && !solidAt(s, level, c, level.floor[c]! - 2))) c += 1
      if (c >= level.cols) throw new Error(`level ${level.id}: no floor to set her down on past the gap at column ${gap.col0}`)
      s.toX = c + 0.5
      s.toY = level.floor[c]!
    } else {
      s.toX = h.safeX
      s.toY = h.safeY
    }
    h.y = s.fromY
    h.vx = 0
    h.vy = 0
    h.grounded = false
    h.climbing = false
    h.launch = 'none'
    h.facing = s.toX < h.x ? -1 : 1
    s.phase = 'rescue'
    s.phaseAt = s.tick
    return
  }

  // Safe ground: the level's own ground under her centre column and both sides, and two free cells above her feet.
  const col = Math.floor(h.x)
  const row = h.y
  const ground = (c: number) => solidTile(tileAt(level, c, row))
  if (h.grounded && Math.floor(row) === row && ground(col) && ground(col - 1) && ground(col + 1) && !solidAt(s, level, col, row - 1) && !solidAt(s, level, col, row - 2)) {
    h.safeX = col + 0.5
    h.safeY = row
  }
}

// ---------------------------------------------------------------------------------------
// Input and cloning.

export function setMove(s: Sim, dir: -1 | 0 | 1): void {
  s.input.move = dir
}

/** The jump button went down: held until releaseJump, and remembered for JUMP_BUFFER. */
export function pressJump(s: Sim): void {
  s.input.jumpHeld = true
  s.input.jumpAt = s.tick
}

export function releaseJump(s: Sim): void {
  s.input.jumpHeld = false
}

/** The build button: the next step puts the chosen block down, or says nope. */
export function pressBuild(s: Sim): void {
  s.input.buildAt = s.tick
}

/** A tap on a block in the tray: it is the one the build button puts down, if she holds one. */
export function choose(s: Sim, kind: Kind): void {
  if (s.hand[kind] > 0) s.chosen = kind
}

/** A copy that shares nothing that changes with the original. */
export function cloneSim(s: Sim): Sim {
  return {
    ...s,
    input: { ...s.input },
    hero: { ...s.hero },
    hand: { ...s.hand },
    pieces: s.pieces.map((p) => ({ ...p })),
    built: s.built.slice(),
    taken: s.taken.slice(),
    opened: s.opened.slice(),
    falls: s.falls.slice(),
    events: s.events.map((e) => ({ ...e })),
  }
}
