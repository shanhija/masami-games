/** Tap picking: pure functions from a camera and a point on the screen to a machine or a ground point. */

import { Ray, Vector3, type Camera } from 'three'

import { localX, localZ } from '../game/math'
import { MACHINE_KINDS, MACHINE_SPECS } from '../game/model'
import type { MachineKind, Machines, Terrain } from '../game/model'
import { heightAt } from '../game/terrain'

/** The ground never rises above this, nor sinks below LOW: a ray above TOP needs no marching. */
const TOP = 8.5
/** The first march step, in metres; it grows with distance. */
const STEP = 0.3
/** A ray that has not met the ground by here is looking at the sky. */
const FAR = 300
const BISECT = 10

export interface MachineHit {
  kind: MachineKind
  /** Distance along the ray. */
  t: number
}

export interface GroundHit {
  x: number
  y: number
  z: number
  t: number
}

/** The ray through a point of the screen: x and y from -1 to 1, y up. The camera's matrices must be current. */
export function pickRay(camera: Camera, ndcX: number, ndcY: number): Ray {
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld)
  const through = new Vector3(ndcX, ndcY, 0.5).unproject(camera)
  return new Ray(origin, through.sub(origin).normalize())
}

/**
 * The nearest machine that has come, other than the active one, that the ray passes through:
 * each body circle of its `MACHINE_SPECS` stood up to its height. The tower's height grows with `up`.
 */
export function pickMachine(sim: { machines: Machines; active: MachineKind }, ray: Ray): MachineHit | null {
  const { origin: o, direction: d } = ray
  const a = d.x * d.x + d.z * d.z
  let best: MachineHit | null = null
  for (const kind of MACHINE_KINDS) {
    const m = sim.machines[kind]
    if (!m.unlocked || kind === sim.active) continue
    const spec = MACHINE_SPECS[kind]
    const y0 = m.y
    const y1 = m.y + (m.kind === 'tower' ? 3 + (spec.height - 3) * m.up : spec.height)
    for (const [lz, r] of spec.body) {
      const px = o.x - localX(m.x, m.yaw, 0, lz)
      const pz = o.z - localZ(m.z, m.yaw, 0, lz)
      // The part of the ray inside the infinite vertical cylinder, then inside the height slab.
      let lo: number
      let hi: number
      if (a < 1e-9) {
        if (px * px + pz * pz > r * r) continue
        lo = 0
        hi = Infinity
      } else {
        const b = px * d.x + pz * d.z
        const disc = b * b - a * (px * px + pz * pz - r * r)
        if (disc < 0) continue
        const root = Math.sqrt(disc)
        lo = (-b - root) / a
        hi = (-b + root) / a
      }
      if (Math.abs(d.y) < 1e-9) {
        if (o.y < y0 || o.y > y1) continue
      } else {
        const ta = (y0 - o.y) / d.y
        const tb = (y1 - o.y) / d.y
        lo = Math.max(lo, Math.min(ta, tb))
        hi = Math.min(hi, Math.max(ta, tb))
      }
      lo = Math.max(lo, 0)
      if (lo > hi) continue
      if (best === null || lo < best.t) best = { kind, t: lo }
    }
  }
  return best
}

/** Where the ray first goes under the ground: a march over the height grid, then bisection. Null for a ray into the sky. */
export function pickGround(terrain: Terrain, ray: Ray): GroundHit | null {
  const { origin: o, direction: d } = ray
  const gap = (t: number) => o.y + d.y * t - heightAt(terrain, o.x + d.x * t, o.z + d.z * t)
  let t = 0
  if (o.y > TOP) {
    if (d.y >= 0) return null
    t = (TOP - o.y) / d.y
  }
  if (gap(t) <= 0) return null
  let prev = t
  while (t < FAR) {
    t += STEP * (1 + t / 60)
    if (gap(t) > 0) {
      prev = t
      continue
    }
    let lo = prev
    let hi = t
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2
      if (gap(mid) > 0) lo = mid
      else hi = mid
    }
    const hit = (lo + hi) / 2
    const x = o.x + d.x * hit
    const z = o.z + d.z * hit
    return { x, y: heightAt(terrain, x, z), z, t: hit }
  }
  return null
}
