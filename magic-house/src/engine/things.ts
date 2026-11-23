/**
 * Magic House: a loose thing's own motion for one frame (FRAME_ORDER's things phase, after its
 * engine slide). It falls, slides on ice and down slopes, rolls if round, rests on solids and on
 * other things (stacking a little), is carried along by belts, bounces, is pushed at FEEL.pushSpeed
 * and blown by zones. It never turns over and passes through players. It changes only the thing, as
 * the player's controller changes only the player; engine/sim.ts carries what rests on it.
 */

import { FEEL } from './api'
import { bottomUnder } from './geometry'
import { tan } from './math'
import { CONTROL } from './player'
import { DT, approach, gatherNear, groundUnder, solidById, solidInBox, solidsInside, thingBox, thingLoose, zoneForces, type Box, type Forces, type Ground, type Sim } from './state'
import type { HandleId, Thing } from './world'

/** A thing's own numbers. */
export const THING = {
  /** m/s² a thing on a floor slows by: plain, on ice, and a round one rolling. */
  friction: 12,
  iceFriction: 1,
  rollFriction: 2,
  /** Steeper than this a thing slides down (dy/dx); a round one rolls down any slope steeper than roll. */
  slide: tan((30 * Math.PI) / 180),
  roll: 0.03,
  /** A thing that lands faster than this, m/s, keeps only this share of its speed across: a throw lands near where it was aimed. */
  hardLanding: 4,
  keep: 0.35,
} as const

const forces: Forces = { ax: 0, ay: 0, gravity: 1, drag: 0 }
const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
const start: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
const ignore: number[] = []
const ground: Ground = { id: 0, y: 0, slope: 0, solid: -1 }
const under = { y: 0, slope: 0 }

/** Whether another loose thing (but those overlapping the thing at the start) is in the box. */
function otherThingIn(sim: Sim, th: Thing, x0: number, y0: number, x1: number, y1: number): boolean {
  for (const o of sim.world.things) {
    if (o === th || !thingLoose(o) || o.on === th.id) continue
    const ox0 = o.at[0] + o.box.min[0]
    const ox1 = o.at[0] + o.box.max[0]
    const oy0 = o.at[1] + o.box.min[1]
    const oy1 = o.at[1] + o.box.max[1]
    if (ox0 >= x1 - 1e-4 || ox1 <= x0 + 1e-4 || oy0 >= y1 - 1e-4 || oy1 <= y0 + 1e-4) continue
    if (ox0 < start.x1 - 1e-4 && ox1 > start.x0 + 1e-4 && oy0 < start.y1 - 1e-4 && oy1 > start.y0 + 1e-4) continue
    return true
  }
  return false
}

/**
 * Moves a loose thing (shown, not carried, not sliding) one frame. `push` is the speed across the
 * players pushing it give it this frame (FEEL.pushSpeed toward where they push, or 0). Gives back
 * what it came onto this frame, or null.
 */
export function moveThing(sim: Sim, th: Thing, push: number): HandleId | null {
  const w = sim.world
  thingBox(th, box)
  zoneForces(sim, box, th.weight, forces)
  const g = FEEL.gravity * forces.gravity
  const grounded = th.on !== null
  const surface = grounded && sim.where[th.on as number].kind === 'solid' ? solidById(sim, th.on as number).surface : null
  let vx = th.velocity[0]
  let vy = th.velocity[1]

  if (push !== 0) vx = push
  else if (grounded) vx = approach(vx, 0, (surface !== null && surface.ice ? THING.iceFriction : th.round ? THING.rollFriction : THING.friction) * DT)
  vx += forces.ax * DT
  const ay = -g + forces.ay
  const dy = vy * DT + 0.5 * ay * DT * DT
  vy += ay * DT
  if (forces.drag > 0) {
    const k = Math.min(1, forces.drag * CONTROL.dragRate * DT)
    vx -= vx * k
    vy -= vy * k
  }
  if (vy < -CONTROL.maxFall) vy = -CONTROL.maxFall
  const dx = vx * DT + (surface !== null ? surface.belt[0] * DT : 0)

  const near = gatherNear(sim, Math.min(box.x0, box.x0 + dx) - 1, Math.min(box.y0, box.y0 + dy) - 1, Math.max(box.x1, box.x1 + dx) + 1, Math.max(box.y1, box.y1 + dy) + 1)
  solidsInside(sim, near, box.x0, box.y0 + 0.01, box.x1, box.y1, ignore)
  start.x0 = box.x0
  start.x1 = box.x1
  start.y0 = box.y0 + 0.01
  start.y1 = box.y1

  // Walls and other things.
  let shift = 0
  if (dx !== 0) {
    const low = box.y0 + (grounded ? 0.05 : 0.01)
    const hit = (d: number) => solidInBox(sim, near, ignore, box.x0 + d, low, box.x1 + d, box.y1) || otherThingIn(sim, th, box.x0 + d, low, box.x1 + d, box.y1)
    if (hit(dx)) {
      let lo = 0
      let hi = 1
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2
        if (hit(dx * mid)) hi = mid
        else lo = mid
      }
      shift = dx * lo
      vx = 0
    } else {
      shift = dx
    }
  }
  const x0 = box.x0 + shift
  const x1 = box.x1 + shift

  // Floors and ceilings.
  let bottom = box.y0 + dy
  let landed: HandleId | null = null
  if (dy <= 0) {
    const snap = grounded ? Math.abs(shift) * 2 + 0.02 : 0
    const high = box.y0 + (grounded ? 0.05 : 0.02)
    if (groundUnder(sim, near, x0, x1, bottom - snap, high, true, high, th.id, false, -1, ground)) {
      bottom = ground.y
      if (th.on !== ground.id) landed = ground.id
      if (!grounded && vy < -THING.hardLanding) vx *= THING.keep
      th.on = ground.id
      const bounce = ground.solid >= 0 ? w.solids[ground.solid].surface.bounce : 0
      if (bounce > 0 && !grounded) {
        vy = Math.sqrt(2 * FEEL.gravity * Math.max(forces.gravity, 0.2) * bounce)
        th.on = null
      } else {
        vy = 0
      }
      const s = ground.slope
      if (Math.abs(s) > (th.round ? THING.roll : THING.slide)) vx -= Math.sign(s) * ((g * Math.abs(s)) / (1 + s * s)) * DT
    } else {
      th.on = null
    }
  } else {
    let ceiling = Infinity
    for (const i of near) {
      if (w.solids[i].surface.through || ignore.includes(i)) continue
      if (!bottomUnder(sim.outlines[i], x0, x1, under)) continue
      if (under.y >= box.y1 - 0.02 && under.y <= box.y1 + dy && under.y < ceiling) ceiling = under.y
    }
    if (ceiling < Infinity) {
      bottom = ceiling - (box.y1 - box.y0)
      vy = 0
    }
    th.on = null
  }

  if (th.round) th.roll -= shift / Math.max(0.05, (box.y1 - box.y0) / 2)
  th.at = [th.at[0] + shift, bottom - th.box.min[1], 0]
  th.velocity = [vx, vy, 0]
  return landed
}
