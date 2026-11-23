/**
 * Magic House: the player's controller, tuned to FEEL (engine/api.ts) and held to it by
 * player.test.ts.
 *
 * `movePlayer(sim, p, pad)` moves one player one frame: the stick, the forgiving jump, gravity and
 * the zones' pulls, walls, floors, ramps, ceilings, heads, and the room's box, which holds them in
 * across and at the top (the camera's frame is wider and holds nobody: engine/camera.ts). It changes
 * only `p` and reads the rest of the sim as it stands, so the bots' search (step 3) can step a copy of
 * a Player with it over the room held still. What it leaves to the frame: riding a mover or a head
 * (the movers' phase and engine/sim.ts), grab and use, falling out of the box (the referee's
 * backstop: the house's floor holds them), and the hooks (it gives back what it landed on, for land).
 *
 * The numbers FEEL does not state are here (CONTROL). The jump is exact: the sim integrates a
 * constant pull exactly (y += v dt + a dt²/2), a held jump leaves at the speed that rises
 * FEEL.jumpHigh, and letting go while rising caps the speed so the hop tops out FEEL.jumpLow above
 * where it began (a press and a release within one frame is that short hop). FEEL.jumpAcross is met
 * by the speed across in the air (airSpeed): a jump to the level lasts 0.8 s, so at the walking
 * speed it would clear 3.2 m plus the feet and the coyote time, about 3.7 m. At 3.4 m/s the best
 * timed running jump clears 3.1 m and not 3.2 (player.test.ts).
 */

import type { Pad } from '../seats/types'
import { FEEL, REFEREE } from './api'
import { overlaps, bottomUnder } from './geometry'
import { tan } from './math'
import {
  DT,
  approach,
  gatherNear,
  groundUnder,
  playerHeight,
  playerWidth,
  solidById,
  solidInBox,
  solidsInside,
  thingLoose,
  zoneForces,
  type Box,
  type Forces,
  type Ground,
  type Sim,
} from './state'
import type { HandleId, Player, Thing } from './world'

/** The controller's own numbers: what FEEL leaves open, tuned so FEEL holds. */
export const CONTROL = {
  /** m/s² toward the stick's speed: on a floor, on ice, in the air with the stick held, flying, swimming where gravity is 0 or less. */
  groundAccel: 40,
  iceAccel: 4,
  airAccel: 24,
  flyAccel: 24,
  swimAccel: 20,
  /** m/s across while in the air: what makes a running jump clear FEEL.jumpAcross and not much more. */
  airSpeed: 3.4,
  /** The forgiving jump (Pia Jump's model.ts): a jump still goes this long after walking off a floor, and a press is kept this long for the landing. */
  coyote: 0.06,
  keep: 0.15,
  /** How wide the feet are that stand, metres at size 1: narrower than the body, so a player stands on a ramp with their feet on it. */
  foot: 0.24,
  /** The fastest fall, m/s. */
  maxFall: 18,
  /** Seconds of a zone's wind or pull a walking or flying player drifts by: a wind of 8 m/s² moves them 4 m/s. */
  driftSecs: 0.5,
  /** How fast drag 1 takes speed away, per second: a fall through drag 1 tops out near 2.5 m/s, as in honey. */
  dragRate: 8,
  /** A player steps up onto a loose thing only this high: higher, they push it. */
  thingStep: 0.05,
  /** How far apart, metres, a pusher's front and the thing count as touching. */
  touching: 0.03,
} as const

/** The steepest top a player stands on, as dy/dx: FEEL.slope with half a degree to spare. */
export const STEEP = tan(((FEEL.slope + 0.5) * Math.PI) / 180)

const forces: Forces = { ax: 0, ay: 0, gravity: 1, drag: 0 }
const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
const ignore: number[] = []
const ground: Ground = { id: 0, y: 0, slope: 0, solid: -1 }
const under = { y: 0, slope: 0 }

/** The loose things near a move, gathered once a move: the wall test asks about them many times. Filled into a shared list the caller reads at once. */
const nearThings: Thing[] = []
function gatherThings(sim: Sim, x0: number, y0: number, x1: number, y1: number): Thing[] {
  nearThings.length = 0
  for (const t of sim.world.things) {
    if (!thingLoose(t)) continue
    if (t.at[0] + t.box.min[0] >= x1 || t.at[0] + t.box.max[0] <= x0 || t.at[1] + t.box.min[1] >= y1 || t.at[1] + t.box.max[1] <= y0) continue
    nearThings.push(t)
  }
  return nearThings
}

/** Whether one of the loose things `things` (but those in the way already at the start) or, with pushing on, another player is in the box. */
function bodyInBox(sim: Sim, things: readonly Thing[], p: Player, x0: number, y0: number, x1: number, y1: number, start: Box): boolean {
  for (const t of things) {
    const tx0 = t.at[0] + t.box.min[0]
    const tx1 = t.at[0] + t.box.max[0]
    const ty0 = t.at[1] + t.box.min[1]
    const ty1 = t.at[1] + t.box.max[1]
    if (tx0 >= x1 - 1e-4 || tx1 <= x0 + 1e-4 || ty0 >= y1 - 1e-4 || ty1 <= y0 + 1e-4) continue
    if (tx0 < start.x1 - 1e-4 && tx1 > start.x0 + 1e-4 && ty0 < start.y1 - 1e-4 && ty1 > start.y0 + 1e-4) continue
    return true
  }
  if (sim.world.pushing) {
    for (const o of sim.world.players) {
      if (o.seat === p.seat) continue
      const hw = playerWidth(o) / 2
      const ox0 = o.at[0] - hw
      const ox1 = o.at[0] + hw
      const oy0 = o.at[1]
      const oy1 = o.at[1] + playerHeight(o)
      if (ox0 >= x1 - 1e-4 || ox1 <= x0 + 1e-4 || oy0 >= y1 - 1e-4 || oy1 <= y0 + 1e-4) continue
      if (ox0 < start.x1 - 1e-4 && ox1 > start.x0 + 1e-4 && oy0 < start.y1 - 1e-4 && oy1 > start.y0 + 1e-4) continue
      return true
    }
  }
  return false
}

/** Moves player p one frame by their pad, held inside the room's box. Changes only p. Gives back the handle they came onto this frame (a new floor, thing or head), or null. */
export function movePlayer(sim: Sim, p: Player, pad: Pad): HandleId | null {
  const w = sim.world
  const t = w.t
  const width = playerWidth(p)
  const height = playerHeight(p)
  const hw = width / 2
  const feet = (CONTROL.foot * p.size) / 2
  const weight = p.change === null ? 1 : p.change.weight
  box.x0 = p.at[0] - hw
  box.x1 = p.at[0] + hw
  box.y0 = p.at[1]
  box.y1 = p.at[1] + height
  zoneForces(sim, box, weight, forces)
  const free = t < p.freeUntil
  let speed = p.change === null ? 1 : p.change.speed
  if (speed < REFEREE.slow && free) speed = 1
  const jumpK = p.change === null ? 1 : p.change.jump
  const steer = t >= p.bonkedUntil && speed > 0 && p.stick !== 'none'
  const sx = steer ? pad.stick[0] : 0
  const sy = steer ? pad.stick[1] : 0
  const g = FEEL.gravity * forces.gravity
  const grounded = p.on !== null
  const dragK = 1 - 0.75 * forces.drag
  const surface = grounded && sim.where[p.on as number].kind === 'solid' ? solidById(sim, p.on as number).surface : null
  const x0 = p.at[0]
  const y0 = p.at[1]
  let vx = p.velocity[0]
  let vy = p.velocity[1]
  let jumped = false
  if (sx > 0.2) p.facing = 1
  else if (sx < -0.2) p.facing = -1

  // Across.
  let ay = 0
  let swim = false
  if (p.stick === 'fly') {
    vx = approach(vx, sx * FEEL.walk * speed * dragK + forces.ax * CONTROL.driftSecs, CONTROL.flyAccel * DT)
    vy = approach(vy, sy * FEEL.walk * speed * dragK + forces.ay * CONTROL.driftSecs, CONTROL.flyAccel * DT)
  } else {
    const walk = p.stick === 'walk'
    swim = walk && forces.gravity <= 0
    const slip = surface !== null && surface.ice ? CONTROL.iceAccel : CONTROL.groundAccel
    if (grounded && p.steep) {
      // Sliding down a top too steep to stand on: the stick does nothing here.
    } else if (walk && (grounded || sx !== 0)) {
      let target = sx * (grounded ? FEEL.walk : CONTROL.airSpeed) * speed * dragK
      if (p.pushing !== null && grounded) {
        const pushed = w.things[sim.where[p.pushing].i]
        const side = pushed.at[0] + (pushed.box.min[0] + pushed.box.max[0]) / 2 > p.at[0] ? 1 : -1
        if (target * side > FEEL.pushSpeed) target = side * FEEL.pushSpeed
      }
      vx = approach(vx, target + forces.ax * CONTROL.driftSecs, (grounded ? slip : CONTROL.airAccel) * DT)
    } else if (grounded) {
      vx = approach(vx, forces.ax * CONTROL.driftSecs, slip * DT)
    } else {
      vx += forces.ax * DT
    }

    // Up and down.
    if (swim) {
      const lift = -g + forces.ay
      vy = approach(vy, sy * FEEL.walk * speed * dragK + lift * CONTROL.driftSecs, CONTROL.swimAccel * DT)
    } else {
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
  }

  let dy = p.stick === 'fly' || swim ? vy * DT : vy * DT + 0.5 * ay * DT * DT
  vy += ay * DT
  if (forces.drag > 0) {
    const k = Math.min(1, forces.drag * CONTROL.dragRate * DT)
    vy -= vy * k
    if (!grounded) vx -= vx * k
  }
  if (vy < -CONTROL.maxFall) vy = -CONTROL.maxFall

  // The room's box holds them in across.
  const left = w.bounds.min[0] + hw
  const right = w.bounds.max[0] - hw
  let dx = vx * DT + (surface !== null && !jumped ? surface.belt[0] * DT : 0)
  if (x0 + dx > right) dx = Math.min(dx, Math.max(0, right - x0))
  if (x0 + dx < left) dx = Math.max(dx, Math.min(0, left - x0))

  const near = gatherNear(sim, Math.min(x0, x0 + dx) - hw - 1, Math.min(y0, y0 + dy) - 1, Math.max(x0, x0 + dx) + hw + 1, Math.max(y0, y0 + dy) + height + 1)
  solidsInside(sim, near, x0 - hw, y0 + 0.01, x0 + hw, y0 + height, ignore)
  const start: Box = { x0: x0 - hw, y0: y0 + 0.01, x1: x0 + hw, y1: y0 + height }

  // Walls: what stands above the step they walk up (a jump steps up nothing), loose things above a pebble's height. A solid
  // they start inside is no wall, so nobody is stuck, but it still stops a move that would take them deeper into it across:
  // else a body whose side came a little into a ledge's corner (falling past it) would sink through the whole ledge.
  let x = x0
  if (dx !== 0) {
    const low = y0 + (grounded && !jumped ? FEEL.stepUp : 0.01)
    const thingLow = y0 + CONTROL.thingStep
    const across = (i: number, xx: number) => Math.min(xx + hw, sim.outlines[i].maxX) - Math.max(xx - hw, sim.outlines[i].minX)
    const deeper = (xx: number) => ignore.some((i) => overlaps(sim.outlines[i], xx - hw, low, xx + hw, y0 + height) && across(i, xx) > across(i, x0) + 1e-6)
    const things = gatherThings(sim, Math.min(x0, x0 + dx) - hw - 0.1, thingLow - 0.1, Math.max(x0, x0 + dx) + hw + 0.1, y0 + height + 0.1)
    const hit = (xx: number) =>
      solidInBox(sim, near, ignore, xx - hw, low, xx + hw, y0 + height) || bodyInBox(sim, things, p, xx - hw, thingLow, xx + hw, y0 + height, start) || deeper(xx)
    if (hit(x0 + dx)) {
      let lo = 0
      let hi = 1
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2
        if (hit(x0 + dx * mid)) hi = mid
        else lo = mid
      }
      x = x0 + dx * lo
      vx = 0
    } else {
      x = x0 + dx
    }
  }

  // Floors, ceilings and heads.
  let y = y0 + dy
  let landed: HandleId | null = null
  const prevOn = p.on
  if (dy <= 0) {
    const high = grounded && !jumped ? y0 + FEEL.stepUp : y0 + 0.02
    const snap = grounded && !jumped && p.stick !== 'fly' && !swim ? Math.abs(x - x0) * 2 + 0.02 : 0
    const through = !(p.stick === 'walk' && sy < -0.5)
    let found = groundUnder(sim, near, x - feet, x + feet, y - snap, high, through, y0 + CONTROL.thingStep, p.id, true, p.seat, ground)
    if (found && ground.y > y0 + 0.02 && solidInBox(sim, near, ignore, x - hw, ground.y + FEEL.stepUp, x + hw, ground.y + height)) {
      // No room over the step (above what they could step onto, as walls go): they stay where they were.
      x = x0
      vx = 0
      found = groundUnder(sim, near, x - feet, x + feet, y - snap, y0 + 0.02, through, y0 + CONTROL.thingStep, p.id, true, p.seat, ground)
    }
    if (found) {
      y = ground.y
      if (prevOn !== ground.id) landed = ground.id
      if (!grounded) {
        p.landedAt = t
        p.landSpeed = -vy
      }
      p.on = ground.id
      p.steep = Math.abs(ground.slope) > STEEP
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
        // Slide down it, and never up it.
        const s = ground.slope
        if (vx * s > 0) vx = 0
        vx -= Math.sign(s) * ((g * Math.abs(s)) / (1 + s * s)) * DT
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
      if (!bottomUnder(sim.outlines[i], x - hw, x + hw, under)) continue
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

  // The room's box holds them in at the top. Below, the house's floor holds them; falling out is the referee's backstop.
  const top = w.bounds.max[1]
  if (y + height > top) {
    y = Math.max(top - height, Math.min(y, y0))
    if (vy > 0) vy = 0
  }

  if (p.on !== null) p.stride += Math.abs(x - x0)
  p.at = [x, y, 0]
  p.velocity = [vx, vy, 0]

  // Pushing: walking into a loose thing they touch.
  p.pushing = null
  if (p.stick === 'walk' && p.on !== null && Math.abs(sx) > 0.2) {
    const front = sx > 0 ? x + hw : x - hw
    const fx0 = sx > 0 ? front : front - CONTROL.touching
    const fx1 = sx > 0 ? front + CONTROL.touching : front
    for (const th of w.things) {
      if (!thingLoose(th)) continue
      const tx0 = th.at[0] + th.box.min[0]
      const tx1 = th.at[0] + th.box.max[0]
      const ty0 = th.at[1] + th.box.min[1]
      const ty1 = th.at[1] + th.box.max[1]
      if (tx0 < fx1 && tx1 > fx0 && ty0 < y + height && ty1 > y + CONTROL.thingStep) {
        p.pushing = th.id
        break
      }
    }
  }
  return landed
}

/** The solid (its index) a player's box at their feet x, y would be in, through-floors aside; -1 when none: for a start's sentence, which names it. */
export function solidInPlayer(sim: Sim, x: number, y: number, width: number, height: number): number {
  const hw = width / 2
  for (const i of gatherNear(sim, x - hw - 0.1, y - 0.1, x + hw + 0.1, y + height + 0.1)) {
    if (sim.world.solids[i].surface.through) continue
    if (overlaps(sim.outlines[i], x - hw, y + 0.01, x + hw, y + height)) return i
  }
  return -1
}

/** Whether a player's box at their feet x, y would be free of solids (through-floors aside): for a start, a size, a show. */
export function playerFits(sim: Sim, x: number, y: number, width: number, height: number): boolean {
  return solidInPlayer(sim, x, y, width, height) < 0
}
