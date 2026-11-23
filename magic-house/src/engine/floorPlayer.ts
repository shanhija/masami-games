/**
 * Magic House: the player's controller from high up (step 6), beside the side view's
 * (engine/player.ts), tuned to the same FEEL and held to it by floorPlayer.test.ts.
 *
 * `movePlayerFloor(sim, p, pad, frame)` moves one player one frame from high up: the stick walks
 * them across the floor (its right is +x, its up is -z, away from the viewer; never faster than
 * FEEL.walk however far it is pushed), the forgiving jump lifts them FEEL.jumpHigh or FEEL.jumpLow,
 * gravity and the zones' pulls in all three ways, walls they slide along, floors, ramps rising any
 * way, ceilings, heads, and the room's box, which holds them in on the floor and under its top. Like
 * movePlayer it changes only `p` and reads the rest of the sim as it stands, so the bots' search can
 * step a copy of a Player with it. What it leaves to the sim is what movePlayer leaves: riding, grab
 * and use, falls, the hooks.
 *
 * The numbers are the side's (FEEL, CONTROL): the same walk, jump, air speed, coyote time and kept
 * press, step up and slope, so a running jump clears FEEL.jumpAcross on the floor in any direction.
 * The feet that stand are CONTROL.foot square. Through-floors are jumped up through from below and
 * stood on; from high up nothing drops through them (the stick's down walks toward the viewer).
 */

import type { Pad } from '../seats/types'
import { FEEL, REFEREE } from './api'
import { bottomUnderFoot, emptyOutline, overlaps, pushOut, sliceAt, type FloorTop, type Outline } from './geometry'
import { CONTROL, STEEP } from './player'
import { DT, approach, playerHeight, playerWidth, solidById, thingLoose, type Sim } from './state'
import {
  emptyBox3,
  gatherFloor,
  groundUnderFloor,
  solidInBoxFloor,
  solidsInsideFloor,
  zoneForcesFloor,
  type Box3,
  type FloorForces,
  type FloorGround,
} from './floorState'
import type { HandleId, Player } from './world'

/** The longest piece of a move across that is tested at once, metres: thinner than any wall a body should not pass through. */
const PIECE = 0.08

/** Moves the speed (vx, vz) toward (tx, tz) by at most step, as one arrow: walking at a slant is no faster than straight. */
export function approachFloor(vx: number, vz: number, tx: number, tz: number, step: number, out: [number, number]): [number, number] {
  const dx = tx - vx
  const dz = tz - vz
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len <= step) {
    out[0] = tx
    out[1] = tz
  } else {
    out[0] = vx + (dx / len) * step
    out[1] = vz + (dz / len) * step
  }
  return out
}

/** What a move across the floor met last: the way out of it on the floor (a unit arrow), or 0, 0 for nothing. */
export interface Met {
  nx: number
  nz: number
}

/** Scratch slices of the near solids between a move's heights, kept from one move to the next. */
const slices: Outline[] = []
const sliced: boolean[] = []
const startDepth: number[] = []

/**
 * Slides a body's box across the floor by dx, dz and gives back where its point ends. The box is
 * (x + ox0 .. x + ox1) by (z + oz0 .. z + oz1) on the floor. What stops it: the near solids' parts
 * between heights low and high (but those in `ignore`, which it started inside: those it may only
 * leave, never go deeper into), and the boxes in `blockers` (already chosen by height by the
 * caller). It goes as far as it can a piece at a time, and what is left of a piece slides along
 * what it met. `met` is set to the way out of what it met last.
 */
export function slideAcross(
  sim: Sim,
  near: readonly number[],
  ignore: readonly number[],
  blockers: readonly Box3[],
  x0: number,
  z0: number,
  ox0: number,
  ox1: number,
  oz0: number,
  oz1: number,
  low: number,
  high: number,
  dx: number,
  dz: number,
  met: Met,
): [number, number] {
  met.nx = 0
  met.nz = 0
  if (dx === 0 && dz === 0) return [x0, z0]
  while (slices.length < near.length) slices.push(emptyOutline())
  for (let k = 0; k < near.length; k++) {
    const i = near[k]
    sliced[k] = !sim.world.solids[i].surface.through && sliceAt(sim.outlines[i], low, high, slices[k])
    if (sliced[k] && ignore.includes(i)) {
      const [px, pz] = pushOut(slices[k], x0 + ox0, z0 + oz0, x0 + ox1, z0 + oz1)
      startDepth[k] = Math.sqrt(px * px + pz * pz)
    } else startDepth[k] = -1
  }
  // What the box at (x, z) runs into: a near solid by its place in `near`, a blocker as -2 - its index, or -1.
  const hit = (x: number, z: number): number => {
    const bx0 = x + ox0
    const bx1 = x + ox1
    const bz0 = z + oz0
    const bz1 = z + oz1
    for (let k = 0; k < near.length; k++) {
      if (!sliced[k] || !overlaps(slices[k], bx0, bz0, bx1, bz1)) continue
      if (startDepth[k] < 0) return k
      const [px, pz] = pushOut(slices[k], bx0, bz0, bx1, bz1)
      if (Math.sqrt(px * px + pz * pz) > startDepth[k] + 1e-6) return k
    }
    for (let b = 0; b < blockers.length; b++) {
      const o = blockers[b]
      if (o.x0 < bx1 - 1e-4 && o.x1 > bx0 + 1e-4 && o.z0 < bz1 - 1e-4 && o.z1 > bz0 + 1e-4) return -2 - b
    }
    return -1
  }
  // The way out of what `what` is at (x, z), on the floor; back along the move where it cannot tell.
  const wayOut = (what: number, x: number, z: number, mx: number, mz: number): [number, number] => {
    let px: number
    let pz: number
    if (what >= 0) {
      ;[px, pz] = pushOut(slices[what], x + ox0, z + oz0, x + ox1, z + oz1)
    } else {
      const o = blockers[-2 - what]
      const across = Math.min(x + ox1, o.x1) - Math.max(x + ox0, o.x0)
      const deep = Math.min(z + oz1, o.z1) - Math.max(z + oz0, o.z0)
      const sx = x + (ox0 + ox1) / 2 - (o.x0 + o.x1) / 2
      const sz = z + (oz0 + oz1) / 2 - (o.z0 + o.z1) / 2
      px = across <= deep ? (sx === 0 ? -mx : sx) : 0
      pz = across <= deep ? 0 : sz === 0 ? -mz : sz
    }
    const len = Math.sqrt(px * px + pz * pz)
    if (len < 1e-12) {
      const m = Math.sqrt(mx * mx + mz * mz)
      return [-mx / m, -mz / m]
    }
    return [px / len, pz / len]
  }
  let x = x0
  let z = z0
  const pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / PIECE))
  for (let n = 0; n < pieces; n++) {
    let sx = dx / pieces
    let sz = dz / pieces
    for (let tries = 0; tries < 2 && (sx !== 0 || sz !== 0); tries++) {
      const what = hit(x + sx, z + sz)
      if (what === -1) {
        x += sx
        z += sz
        break
      }
      let lo = 0
      let hi = 1
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2
        if (hit(x + sx * mid, z + sz * mid) === -1) lo = mid
        else hi = mid
      }
      const [nx, nz] = wayOut(what, x + sx * hi, z + sz * hi, sx, sz)
      met.nx = nx
      met.nz = nz
      x += sx * lo
      z += sz * lo
      // The rest of the piece slides along what it met.
      let rx = sx * (1 - lo)
      let rz = sz * (1 - lo)
      const into = rx * nx + rz * nz
      if (into < 0) {
        rx -= into * nx
        rz -= into * nz
      }
      sx = rx
      sz = rz
    }
  }
  return [x, z]
}

const forces: FloorForces = { ax: 0, ay: 0, az: 0, gravity: 1, drag: 0 }
const ignore: number[] = []
const ground: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }
const under: FloorTop = { y: 0, gx: 0, gz: 0 }
const toward: [number, number] = [0, 0]
const met: Met = { nx: 0, nz: 0 }
/** The body's box where the move began. */
const start: Box3 = emptyBox3()
/** The loose things (and, with pushing on, players) in a move's way, gathered once a move. */
const blockers: Box3[] = []
const blockerPool: Box3[] = []

/** Whether a box overlaps the start box on every axis by more than 1e-4. */
function overlapsStart(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: Box3): boolean {
  return x0 < s.x1 - 1e-4 && x1 > s.x0 + 1e-4 && y0 < s.y1 - 1e-4 && y1 > s.y0 + 1e-4 && z0 < s.z1 - 1e-4 && z1 > s.z0 + 1e-4
}

/** Adds a blocker box to the move's list from the pool. */
function block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  if (blockerPool.length <= blockers.length) blockerPool.push(emptyBox3())
  const b = blockerPool[blockers.length]
  b.x0 = x0
  b.y0 = y0
  b.z0 = z0
  b.x1 = x1
  b.y1 = y1
  b.z1 = z1
  blockers.push(b)
}

/** Moves player p one frame by their pad from high up, held inside the room's box. Changes only p. Gives back the handle they came onto this frame (a new floor, thing or head), or null. */
export function movePlayerFloor(sim: Sim, p: Player, pad: Pad): HandleId | null {
  const w = sim.world
  const t = w.t
  const width = playerWidth(p)
  const height = playerHeight(p)
  const hw = width / 2
  const feet = (CONTROL.foot * p.size) / 2
  const weight = p.change === null ? 1 : p.change.weight
  const x0 = p.at[0]
  const y0 = p.at[1]
  const z0 = p.at[2]
  start.x0 = x0 - hw
  start.x1 = x0 + hw
  start.y0 = y0
  start.y1 = y0 + height
  start.z0 = z0 - hw
  start.z1 = z0 + hw
  zoneForcesFloor(sim, start, weight, forces)
  start.y0 = y0 + 0.01
  const free = t < p.freeUntil
  let speed = p.change === null ? 1 : p.change.speed
  if (speed < REFEREE.slow && free) speed = 1
  const jumpK = p.change === null ? 1 : p.change.jump
  const steer = t >= p.bonkedUntil && speed > 0 && p.stick !== 'none'
  // The stick on the floor: its right is +x, its up is -z (away from the viewer); never longer than 1.
  let sx = steer ? pad.stick[0] : 0
  let sz = steer ? -pad.stick[1] : 0
  const reach = Math.sqrt(sx * sx + sz * sz)
  if (reach > 1) {
    sx /= reach
    sz /= reach
  }
  // The way the stick points, as a unit arrow on the floor.
  const ux = reach > 0 ? sx / Math.min(1, reach) : 0
  const uz = reach > 0 ? sz / Math.min(1, reach) : 0
  if (reach > 0.2) {
    p.heading = [ux, 0, uz]
    if (Math.abs(ux) > 0.2) p.facing = ux > 0 ? 1 : -1
  }
  const g = FEEL.gravity * forces.gravity
  const grounded = p.on !== null
  const dragK = 1 - 0.75 * forces.drag
  const surface = grounded && sim.where[p.on as number].kind === 'solid' ? solidById(sim, p.on as number).surface : null
  let vx = p.velocity[0]
  let vy = p.velocity[1]
  let vz = p.velocity[2]
  let jumped = false
  const fly = p.stick === 'fly'

  // Across, and up and down.
  let ay = 0
  if (fly) {
    // Across by the stick; up and down only by the zones' pulls: the world does not pull a flyer.
    approachFloor(vx, vz, sx * FEEL.walk * speed * dragK + forces.ax * CONTROL.driftSecs, sz * FEEL.walk * speed * dragK + forces.az * CONTROL.driftSecs, CONTROL.flyAccel * DT, toward)
    vx = toward[0]
    vz = toward[1]
    vy = approach(vy, forces.ay * CONTROL.driftSecs, CONTROL.flyAccel * DT)
  } else {
    const walk = p.stick === 'floor'
    const slip = surface !== null && surface.ice ? CONTROL.iceAccel : CONTROL.groundAccel
    const stickOn = sx !== 0 || sz !== 0
    if (grounded && p.steep) {
      // Sliding down a top too steep to stand on: the stick does nothing here.
    } else if (walk && (grounded || stickOn)) {
      const top = (grounded ? FEEL.walk : CONTROL.airSpeed) * speed * dragK
      let tx = sx * top
      let tz = sz * top
      if (p.pushing !== null && grounded) {
        const fast = Math.sqrt(tx * tx + tz * tz)
        if (fast > FEEL.pushSpeed) {
          tx *= FEEL.pushSpeed / fast
          tz *= FEEL.pushSpeed / fast
        }
      }
      approachFloor(vx, vz, tx + forces.ax * CONTROL.driftSecs, tz + forces.az * CONTROL.driftSecs, (grounded ? slip : CONTROL.airAccel) * DT, toward)
      vx = toward[0]
      vz = toward[1]
    } else if (grounded) {
      approachFloor(vx, vz, forces.ax * CONTROL.driftSecs, forces.az * CONTROL.driftSecs, slip * DT, toward)
      vx = toward[0]
      vz = toward[1]
    } else {
      vx += forces.ax * DT
      vz += forces.az * DT
    }
    ay = -g + forces.ay
    const jb = p.a === 'jump' ? pad.a : p.b === 'jump' ? pad.b : null
    if (walk && jb !== null && steer && g > 0) {
      if (jb.pressed) p.jumpKeptUntil = t + CONTROL.keep
      const coyote = !grounded && t - p.leftGroundAt <= CONTROL.coyote + 1e-9
      if (t <= p.jumpKeptUntil + 1e-9 && ((grounded && !p.steep) || coyote)) {
        vy = Math.sqrt(2 * g * FEEL.jumpHigh * jumpK)
        p.jumpHeld = true
        p.jumpFrom = y0
        p.jumpedAt = t
        p.jumpKeptUntil = -Infinity
        p.leftGroundAt = -Infinity
        p.on = null
        p.steep = false
        jumped = true
      }
    }
    if (p.jumpHeld && (vy <= 0 || jb === null || !jb.held || !steer)) {
      p.jumpHeld = false
      if (vy > 0 && g > 0) vy = Math.min(vy, Math.sqrt(2 * g * Math.max(0, p.jumpFrom + FEEL.jumpLow * jumpK - y0)))
    }
  }

  const dy = fly ? vy * DT : vy * DT + 0.5 * ay * DT * DT
  vy += ay * DT
  if (forces.drag > 0) {
    const k = Math.min(1, forces.drag * CONTROL.dragRate * DT)
    vy -= vy * k
    if (!grounded) {
      vx -= vx * k
      vz -= vz * k
    }
  }
  if (vy < -CONTROL.maxFall) vy = -CONTROL.maxFall

  // The room's box holds them in on the floor.
  const belted = surface !== null && !jumped
  let dx = vx * DT + (belted ? surface.belt[0] * DT : 0)
  let dz = vz * DT + (belted ? surface.belt[2] * DT : 0)
  const left = w.bounds.min[0] + hw
  const right = w.bounds.max[0] - hw
  const back = w.bounds.min[2] + hw
  const front = w.bounds.max[2] - hw
  if (x0 + dx > right) dx = Math.min(dx, Math.max(0, right - x0))
  if (x0 + dx < left) dx = Math.max(dx, Math.min(0, left - x0))
  if (z0 + dz > front) dz = Math.min(dz, Math.max(0, front - z0))
  if (z0 + dz < back) dz = Math.max(dz, Math.min(0, back - z0))

  const near = gatherFloor(sim, Math.min(x0, x0 + dx) - hw - 1, Math.min(y0, y0 + dy) - 1, Math.min(z0, z0 + dz) - hw - 1, Math.max(x0, x0 + dx) + hw + 1, Math.max(y0, y0 + dy) + height + 1, Math.max(z0, z0 + dz) + hw + 1)
  solidsInsideFloor(sim, near, x0 - hw, y0 + 0.01, z0 - hw, x0 + hw, y0 + height, z0 + hw, ignore)

  // Walls: what stands above the step they walk up (a jump steps up nothing), loose things above a pebble's height, and
  // with pushing on the other players. They slide along what they meet; a solid they start inside they may only leave.
  let x = x0
  let z = z0
  if (dx !== 0 || dz !== 0) {
    const low = y0 + (grounded && !jumped ? FEEL.stepUp : 0.01)
    const thingLow = y0 + CONTROL.thingStep
    blockers.length = 0
    for (const th of w.things) {
      if (!thingLoose(th)) continue
      const bx0 = th.at[0] + th.box.min[0]
      const bx1 = th.at[0] + th.box.max[0]
      const by0 = th.at[1] + th.box.min[1]
      const by1 = th.at[1] + th.box.max[1]
      const bz0 = th.at[2] + th.box.min[2]
      const bz1 = th.at[2] + th.box.max[2]
      if (by1 <= thingLow + 1e-4 || by0 >= y0 + height - 1e-4) continue
      if (bx1 < Math.min(x0, x0 + dx) - hw - 0.1 || bx0 > Math.max(x0, x0 + dx) + hw + 0.1 || bz1 < Math.min(z0, z0 + dz) - hw - 0.1 || bz0 > Math.max(z0, z0 + dz) + hw + 0.1) continue
      if (overlapsStart(bx0, by0, bz0, bx1, by1, bz1, start)) continue
      block(bx0, by0, bz0, bx1, by1, bz1)
    }
    if (w.pushing) {
      for (const o of w.players) {
        if (o.seat === p.seat) continue
        const ohw = playerWidth(o) / 2
        const oy1 = o.at[1] + playerHeight(o)
        if (oy1 <= y0 + 1e-4 || o.at[1] >= y0 + height - 1e-4) continue
        if (overlapsStart(o.at[0] - ohw, o.at[1], o.at[2] - ohw, o.at[0] + ohw, oy1, o.at[2] + ohw, start)) continue
        block(o.at[0] - ohw, o.at[1], o.at[2] - ohw, o.at[0] + ohw, oy1, o.at[2] + ohw)
      }
    }
    ;[x, z] = slideAcross(sim, near, ignore, blockers, x0, z0, -hw, hw, -hw, hw, low, y0 + height, dx, dz, met)
    const into = vx * met.nx + vz * met.nz
    if (into < 0) {
      vx -= into * met.nx
      vz -= into * met.nz
    }
  }

  // Floors, ceilings and heads.
  let y = y0 + dy
  let landed: HandleId | null = null
  const prevOn = p.on
  const across = Math.sqrt((x - x0) * (x - x0) + (z - z0) * (z - z0))
  if (dy <= 0) {
    const high = grounded && !jumped ? y0 + FEEL.stepUp : y0 + 0.02
    const snap = grounded && !jumped && !fly ? across * 2 + 0.02 : 0
    let found = groundUnderFloor(sim, near, x - feet, z - feet, x + feet, z + feet, y - snap, high, y0 + CONTROL.thingStep, p.id, true, p.seat, ground)
    if (found && ground.y > y0 + 0.02 && solidInBoxFloor(sim, near, ignore, x - hw, ground.y + FEEL.stepUp, z - hw, x + hw, ground.y + height, z + hw)) {
      // No room over the step (above what they could step onto, as walls go): they stay where they were.
      x = x0
      z = z0
      vx = 0
      vz = 0
      found = groundUnderFloor(sim, near, x - feet, z - feet, x + feet, z + feet, y - snap, y0 + 0.02, y0 + CONTROL.thingStep, p.id, true, p.seat, ground)
    }
    if (found) {
      y = ground.y
      if (prevOn !== ground.id) landed = ground.id
      if (!grounded) {
        p.landedAt = t
        p.landSpeed = -vy
      }
      p.on = ground.id
      const s = Math.sqrt(ground.gx * ground.gx + ground.gz * ground.gz)
      p.steep = s > STEEP
      const bounce = ground.solid >= 0 ? w.solids[ground.solid].surface.bounce : 0
      if (bounce > 0 && !grounded) {
        vy = Math.sqrt(2 * FEEL.gravity * Math.max(forces.gravity, 0.2) * bounce)
        p.on = null
        p.steep = false
        p.jumpFrom = y
        p.jumpHeld = false
        p.leftGroundAt = -Infinity
      } else {
        vy = 0
      }
      if (p.steep) {
        // Slide down it, and never up it: (rx, rz) is the way it rises.
        const rx = ground.gx / s
        const rz = ground.gz / s
        const up = vx * rx + vz * rz
        if (up > 0) {
          vx -= up * rx
          vz -= up * rz
        }
        const pull = ((g * s) / (1 + s * s)) * DT
        vx -= rx * pull
        vz -= rz * pull
      }
    } else {
      if (grounded && !jumped) p.leftGroundAt = t
      p.on = null
      p.steep = false
    }
  } else {
    // A ceiling over the head stops the rise.
    let ceiling = Infinity
    for (const i of near) {
      if (w.solids[i].surface.through || ignore.includes(i)) continue
      if (!bottomUnderFoot(sim.outlines[i], x - hw, z - hw, x + hw, z + hw, under)) continue
      if (under.y >= y0 + height - 0.02 && under.y <= y + height && under.y < ceiling) ceiling = under.y
    }
    if (ceiling < Infinity) {
      y = ceiling - height
      vy = 0
      p.jumpHeld = false
    }
    p.on = null
    p.steep = false
  }

  // The room's box holds them in at its top: from high up the camera shows the box's whole height.
  const top = w.bounds.max[1]
  if (y + height > top) {
    y = Math.max(top - height, Math.min(y, y0))
    if (vy > 0) vy = 0
  }

  if (p.on !== null) p.stride += across
  p.at = [x, y, z]
  p.velocity = [vx, vy, vz]

  // Pushing: walking into a loose thing they touch, the way the stick points.
  p.pushing = null
  if (p.stick === 'floor' && p.on !== null && reach > 0.2) {
    const fx0 = x - hw + Math.min(0, ux * CONTROL.touching)
    const fx1 = x + hw + Math.max(0, ux * CONTROL.touching)
    const fz0 = z - hw + Math.min(0, uz * CONTROL.touching)
    const fz1 = z + hw + Math.max(0, uz * CONTROL.touching)
    for (const th of w.things) {
      if (!thingLoose(th)) continue
      const tx0 = th.at[0] + th.box.min[0]
      const tx1 = th.at[0] + th.box.max[0]
      const ty0 = th.at[1] + th.box.min[1]
      const ty1 = th.at[1] + th.box.max[1]
      const tz0 = th.at[2] + th.box.min[2]
      const tz1 = th.at[2] + th.box.max[2]
      if (tx0 >= fx1 || tx1 <= fx0 || tz0 >= fz1 || tz1 <= fz0 || ty0 >= y + height || ty1 <= y + CONTROL.thingStep) continue
      // Only what lies ahead the way they push: its middle further along than theirs.
      if ((((tx0 + tx1) / 2 - x) * ux + ((tz0 + tz1) / 2 - z) * uz) <= 0) continue
      p.pushing = th.id
      break
    }
  }
  return landed
}
