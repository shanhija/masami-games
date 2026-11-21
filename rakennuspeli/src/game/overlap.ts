/**
 * Machines as rectangles on the ground, for the one question the circles `machines.ts` pushes
 * apart cannot answer: do two bodies, a plant's body and legs or a standing building share
 * ground. Plain geometry over the sim's numbers.
 */

import { BUILD_HALF, PLANTS } from './map'
import { MACHINE_SPECS, PLANT_IDS } from './model'
import type { Machine, Sim } from './model'

/** A rectangle turned `yaw`: `hl` half its length along the way it faces, `hw` half its width across. */
export interface Rect {
  x: number
  z: number
  yaw: number
  hl: number
  hw: number
}

/** Half the side of the square the legs of a plant's hopper stand in. */
export const HOPPER_LEGS = 1.1

/** A machine's body: its length and width from `MACHINE_SPECS`, middle at the machine's own. */
export const rectOf = (m: Machine): Rect => ({ x: m.x, z: m.z, yaw: m.yaw, hl: MACHINE_SPECS[m.kind].length / 2, hw: MACHINE_SPECS[m.kind].width / 2 })

/** How far two rectangles lie into each other along the way out that is shortest: 0 when they are apart. */
export function overlapDepth(a: Rect, b: Rect): number {
  let least = Infinity
  for (const r of [a, b]) {
    for (const [ax, az] of [[Math.sin(r.yaw), Math.cos(r.yaw)], [Math.cos(r.yaw), -Math.sin(r.yaw)]]) {
      const span = (q: Rect) => {
        const mid = q.x * ax + q.z * az
        const half = q.hl * Math.abs(Math.sin(q.yaw) * ax + Math.cos(q.yaw) * az) + q.hw * Math.abs(Math.cos(q.yaw) * ax - Math.sin(q.yaw) * az)
        return [mid - half, mid + half]
      }
      const [a0, a1] = span(a)
      const [b0, b1] = span(b)
      const lap = Math.min(a1, b1) - Math.max(a0, b0)
      if (lap <= 0) return 0
      least = Math.min(least, lap)
    }
  }
  return least
}

/** What stands where a machine may not: each plant's body and the legs of its hopper, and every building with a piece in place (the bridge is a deck to drive over). */
export function footprints(s: Sim): { name: string; rect: Rect }[] {
  const list: { name: string; rect: Rect }[] = []
  for (const id of PLANT_IDS) {
    const p = PLANTS[id]
    list.push({ name: `${id} body`, rect: { x: p.x, z: p.z, yaw: p.yaw, hl: p.d / 2, hw: p.w / 2 } })
    list.push({ name: `${id} legs`, rect: { x: p.hopperX, z: p.hopperZ, yaw: 0, hl: HOPPER_LEGS, hw: HOPPER_LEGS } })
  }
  for (const b of s.builds) if (b.placed > 0 && b.kind !== 'bridge') list.push({ name: `${b.kind} ${b.id}`, rect: { x: b.x, z: b.z, yaw: b.yaw, hl: BUILD_HALF[b.kind][1], hw: BUILD_HALF[b.kind][0] } })
  return list
}
