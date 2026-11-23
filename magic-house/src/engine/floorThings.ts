/**
 * Magic House: a loose thing's own motion for one frame from high up (step 6), beside the side
 * view's (engine/things.ts) and with its numbers (THING). It falls, slides on ice and down slopes
 * rising any way, rolls if round, rests on solids and on other things, is carried along by belts
 * ([vx, 0, vz]), bounces, is pushed at FEEL.pushSpeed the way its pushers push and blown by zones in
 * all three ways. It slides along walls and other things, never turns over and passes through
 * players. It changes only the thing; engine/floor.ts carries what rests on it.
 */

import { FEEL } from './api'
import { bottomUnderFoot, type FloorTop } from './geometry'
import { CONTROL } from './player'
import { THING } from './things'
import { DT, solidById, thingLoose, type Sim } from './state'
import { emptyBox3, gatherFloor, groundUnderFloor, solidsInsideFloor, thingBox3, zoneForcesFloor, type Box3, type FloorForces, type FloorGround } from './floorState'
import { approachFloor, slideAcross, type Met } from './floorPlayer'
import type { HandleId, Thing } from './world'

const forces: FloorForces = { ax: 0, ay: 0, az: 0, gravity: 1, drag: 0 }
const box: Box3 = emptyBox3()
const ignore: number[] = []
const ground: FloorGround = { id: 0, y: 0, gx: 0, gz: 0, solid: -1 }
const under: FloorTop = { y: 0, gx: 0, gz: 0 }
const toward: [number, number] = [0, 0]
const met: Met = { nx: 0, nz: 0 }
const blockers: Box3[] = []
const blockerPool: Box3[] = []

/**
 * Moves a loose thing (shown, not carried, not sliding) one frame from high up. `px, pz` is the speed
 * across the players pushing it give it this frame (FEEL.pushSpeed the way they push together, or
 * 0, 0). Gives back what it came onto this frame, or null.
 */
export function moveThingFloor(sim: Sim, th: Thing, px: number, pz: number): HandleId | null {
  const w = sim.world
  thingBox3(th, box)
  zoneForcesFloor(sim, box, th.weight, forces)
  const g = FEEL.gravity * forces.gravity
  const grounded = th.on !== null
  const surface = grounded && sim.where[th.on as number].kind === 'solid' ? solidById(sim, th.on as number).surface : null
  let vx = th.velocity[0]
  let vy = th.velocity[1]
  let vz = th.velocity[2]

  if (px !== 0 || pz !== 0) {
    vx = px
    vz = pz
  } else if (grounded) {
    approachFloor(vx, vz, 0, 0, (surface !== null && surface.ice ? THING.iceFriction : th.round ? THING.rollFriction : THING.friction) * DT, toward)
    vx = toward[0]
    vz = toward[1]
  }
  vx += forces.ax * DT
  vz += forces.az * DT
  const ay = -g + forces.ay
  const dy = vy * DT + 0.5 * ay * DT * DT
  vy += ay * DT
  if (forces.drag > 0) {
    const k = Math.min(1, forces.drag * CONTROL.dragRate * DT)
    vx -= vx * k
    vy -= vy * k
    vz -= vz * k
  }
  if (vy < -CONTROL.maxFall) vy = -CONTROL.maxFall
  const dx = vx * DT + (surface !== null ? surface.belt[0] * DT : 0)
  const dz = vz * DT + (surface !== null ? surface.belt[2] * DT : 0)

  const near = gatherFloor(sim, Math.min(box.x0, box.x0 + dx) - 1, Math.min(box.y0, box.y0 + dy) - 1, Math.min(box.z0, box.z0 + dz) - 1, Math.max(box.x1, box.x1 + dx) + 1, Math.max(box.y1, box.y1 + dy) + 1, Math.max(box.z1, box.z1 + dz) + 1)
  solidsInsideFloor(sim, near, box.x0, box.y0 + 0.01, box.z0, box.x1, box.y1, box.z1, ignore)

  // Walls and other things: it slides along them.
  let x = th.at[0]
  let z = th.at[2]
  if (dx !== 0 || dz !== 0) {
    const low = box.y0 + (grounded ? 0.05 : 0.01)
    blockers.length = 0
    for (const o of w.things) {
      if (o === th || !thingLoose(o) || o.on === th.id) continue
      const ox0 = o.at[0] + o.box.min[0]
      const ox1 = o.at[0] + o.box.max[0]
      const oy0 = o.at[1] + o.box.min[1]
      const oy1 = o.at[1] + o.box.max[1]
      const oz0 = o.at[2] + o.box.min[2]
      const oz1 = o.at[2] + o.box.max[2]
      if (oy1 <= low + 1e-4 || oy0 >= box.y1 - 1e-4) continue
      if (ox1 < Math.min(box.x0, box.x0 + dx) - 0.1 || ox0 > Math.max(box.x1, box.x1 + dx) + 0.1 || oz1 < Math.min(box.z0, box.z0 + dz) - 0.1 || oz0 > Math.max(box.z1, box.z1 + dz) + 0.1) continue
      // What it overlapped at the start does not stop it.
      if (ox0 < box.x1 - 1e-4 && ox1 > box.x0 + 1e-4 && oy0 < box.y1 - 1e-4 && oy1 > box.y0 + 0.01 + 1e-4 && oz0 < box.z1 - 1e-4 && oz1 > box.z0 + 1e-4) continue
      if (blockerPool.length <= blockers.length) blockerPool.push(emptyBox3())
      const b = blockerPool[blockers.length]
      b.x0 = ox0
      b.x1 = ox1
      b.y0 = oy0
      b.y1 = oy1
      b.z0 = oz0
      b.z1 = oz1
      blockers.push(b)
    }
    ;[x, z] = slideAcross(sim, near, ignore, blockers, x, z, th.box.min[0], th.box.max[0], th.box.min[2], th.box.max[2], low, box.y1, dx, dz, met)
    const into = vx * met.nx + vz * met.nz
    if (into < 0) {
      vx -= into * met.nx
      vz -= into * met.nz
    }
  }
  const x0 = x + th.box.min[0]
  const x1 = x + th.box.max[0]
  const z0 = z + th.box.min[2]
  const z1 = z + th.box.max[2]
  const across = Math.sqrt((x - th.at[0]) * (x - th.at[0]) + (z - th.at[2]) * (z - th.at[2]))

  // Floors and ceilings.
  let bottom = box.y0 + dy
  let landed: HandleId | null = null
  if (dy <= 0) {
    const snap = grounded ? across * 2 + 0.02 : 0
    const high = box.y0 + (grounded ? 0.05 : 0.02)
    if (groundUnderFloor(sim, near, x0, z0, x1, z1, bottom - snap, high, high, th.id, false, -1, ground)) {
      bottom = ground.y
      if (th.on !== ground.id) landed = ground.id
      if (!grounded && vy < -THING.hardLanding) {
        vx *= THING.keep
        vz *= THING.keep
      }
      th.on = ground.id
      const bounce = ground.solid >= 0 ? w.solids[ground.solid].surface.bounce : 0
      if (bounce > 0 && !grounded) {
        vy = Math.sqrt(2 * FEEL.gravity * Math.max(forces.gravity, 0.2) * bounce)
        th.on = null
      } else {
        vy = 0
      }
      const s = Math.sqrt(ground.gx * ground.gx + ground.gz * ground.gz)
      if (s > (th.round ? THING.roll : THING.slide)) {
        const pull = ((g * s) / (1 + s * s)) * DT
        vx -= (ground.gx / s) * pull
        vz -= (ground.gz / s) * pull
      }
    } else {
      th.on = null
    }
  } else {
    let ceiling = Infinity
    for (const i of near) {
      if (w.solids[i].surface.through || ignore.includes(i)) continue
      if (!bottomUnderFoot(sim.outlines[i], x0, z0, x1, z1, under)) continue
      if (under.y >= box.y1 - 0.02 && under.y <= box.y1 + dy && under.y < ceiling) ceiling = under.y
    }
    if (ceiling < Infinity) {
      bottom = ceiling - (box.y1 - box.y0)
      vy = 0
    }
    th.on = null
  }

  // A round thing rolls: from high up `roll` counts the radians rolled, whichever way (the scene turns it round the level line square to its speed).
  if (th.round) th.roll += across / Math.max(0.05, (box.y1 - box.y0) / 2)
  th.at = [x, bottom - th.box.min[1], z]
  th.velocity = [vx, vy, vz]
  return landed
}
