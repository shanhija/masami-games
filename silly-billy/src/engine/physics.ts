/**
 * Loose things: they fall, bounce, roll, float on the water as high as it is now, bump off solid
 * things and off people (a `hit` the first time after they were let go), and settle. Things code
 * left hanging in the air fall after a moment; things fixed to another stay with it. Puffs drift
 * (light ones with the wind) and fade.
 */

import { pointIn, proportions, rootFrame } from './body'
import type { Library } from './library'
import { inWater, ROOM_GEO } from './rooms'
import { terrainOf } from './sky'
import { ROOM_HALF, STEP, type Item, type World } from './types'
import { addPuffs, bottomOf, GRAVITY, hash01, infoFor, PLACED_HOLD, solidsOf, supportAt, TAU, waterTop, wetAt, type Side, type Solid } from './world'

/** An actor's body as a capsule: from p to q, radius r. */
interface Capsule {
  id: string
  riding: string | null
  px: number
  py: number
  pz: number
  qx: number
  qy: number
  qz: number
  r: number
}

function capsules(w: World): Capsule[] {
  return w.actors.map((a) => {
    const pr = proportions(a.look)
    const root = rootFrame(a)
    const p = pointIn(root, [0, pr.radius, 0])
    const q = pointIn(root, [0, Math.max(pr.radius, pr.height - pr.radius), 0])
    return { id: a.id, riding: a.riding, px: p[0], py: p[1], pz: p[2], qx: q[0], qy: q[1], qz: q[2], r: pr.radius * a.scale }
  })
}

/** One step of every loose thing, after the things code left in the air are let fall. */
export function stepPhysics(w: World, library: Library, side: Side): void {
  const solids = solidsOf(w, library)
  for (const [id, at] of side.placed) {
    if (w.t - at < PLACED_HOLD) continue
    side.placed.delete(id)
    const it = side.items.get(id)
    if (it === undefined || it.loose || it.holder !== null || it.fixed || (it.attached ?? null) !== null) continue
    const low = bottomOf(it, infoFor(library, it))
    const bottom = it.y + low
    if (wetAt(w, it.x, it.z)) {
      if (Math.abs(bottom - waterTop(w)) > 0.04) it.loose = true
      continue
    }
    const ground = supportAt(w, solids, it.x, it.z, bottom, it)
    if (bottom > ground + 0.03) it.loose = true
    else if (bottom < ground - 0.03) it.y = ground - low
  }
  // Water rising over things lying on the pool's floor lifts them: they float up.
  if (ROOM_GEO[w.room].water.length > 0 && terrainOf(w, w.room).water > 0.02) {
    const surface = waterTop(w)
    for (const it of w.items) {
      if (it.loose || it.holder !== null || it.fixed || (it.attached ?? null) !== null || side.placed.has(it.id) || !inWater(w.room, it.x, it.z)) continue
      if (it.y + bottomOf(it, infoFor(library, it)) < surface - 0.04) it.loose = true
    }
  }
  let bodies: Capsule[] | null = null
  for (const it of w.items) {
    if (!it.loose) continue
    if (it.holder !== null || it.fixed || (it.attached ?? null) !== null) {
      it.loose = false
      continue
    }
    bodies ??= capsules(w)
    stepLoose(w, library, side, it, solids, bodies)
  }
}

function stepLoose(w: World, library: Library, side: Side, it: Item, solids: Solid[], bodies: Capsule[]) {
  const dt = STEP
  const info = infoFor(library, it)
  const r = info.radius * it.scale
  const low = bottomOf(it, info)
  const mid = ((info.recipe.bounds.min[1] + info.recipe.bounds.max[1]) / 2) * it.scale
  const bouncy = info.recipe.meta.bouncy
  const e = 0.2 + 0.65 * bouncy
  const wet = wetAt(w, it.x, it.z)
  const surface = waterTop(w)
  const before = it.y + low
  const floating = wet && before < surface + 0.05
  if (floating) {
    const rest = surface - low + 0.025 * Math.sin(w.t * 2.3 + hash01(it.id, 0) * TAU)
    it.vy += ((rest - it.y) * 30 - it.vy * 5) * dt
    const drag = 1 - 1.5 * dt
    it.vx *= drag
    it.vz *= drag
    it.spin *= 1 - 2 * dt
    it.y += it.vy * dt
  } else {
    it.y += it.vy * dt - 0.5 * GRAVITY * dt * dt
    it.vy -= GRAVITY * dt
  }
  if (wet && before >= surface && it.y + low < surface && it.vy < -2) {
    addPuffs(w, { kind: 'drop', x: it.x, y: surface + 0.05, z: it.z, color: null, count: 10, size: 0.08, speed: 1.5, up: 2.5, life: 0.8, gravity: null })
    if (side.sounds < 8) {
      w.sounds.push('splash')
      side.sounds++
    }
  }
  // Across the ground; something in the pool below its edge (in the water or on an emptied floor) stays in it.
  let nx = it.x + it.vx * dt
  let nz = it.z + it.vz * dt
  if (inWater(w.room, it.x, it.z) && it.y + low < -0.02) {
    if (!inWater(w.room, nx, it.z)) {
      nx = it.x
      it.vx = -it.vx * 0.5
    }
    if (!inWater(w.room, nx, nz)) {
      nz = it.z
      it.vz = -it.vz * 0.5
    }
  }
  it.x = nx
  it.z = nz
  it.yaw += it.spin * dt
  const lim = Math.max(0, ROOM_HALF - r)
  if (it.x > lim || it.x < -lim) {
    it.x = Math.max(-lim, Math.min(lim, it.x))
    it.vx = -it.vx * e
  }
  if (it.z > lim || it.z < -lim) {
    it.z = Math.max(-lim, Math.min(lim, it.z))
    it.vz = -it.vz * e
  }
  // Solid things standing still push it out and bounce it, unless it is above them.
  for (const s of solids) {
    if (s.item === it || it.y + low >= s.top - 0.05) continue
    const R = s.r + r
    const dx = it.x - s.x
    const dz = it.z - s.z
    const d2 = dx * dx + dz * dz
    if (d2 >= R * R) continue
    const d = Math.sqrt(d2)
    const ux = d > 1e-6 ? dx / d : 1
    const uz = d > 1e-6 ? dz / d : 0
    it.x = s.x + ux * R
    it.z = s.z + uz * R
    const vn = it.vx * ux + it.vz * uz
    if (vn < 0) {
      it.vx -= (1 + e) * vn * ux
      it.vz -= (1 + e) * vn * uz
    }
  }
  bump(w, side, it, r, mid, bodies)
  // The ground under it, or the top of a solid thing it came down on.
  let onGround = floating
  const ground = floating ? ROOM_GEO[w.room].floor : supportAt(w, solids, it.x, it.z, before, it)
  if (it.y + low <= ground) {
    const impact = -it.vy
    it.y = ground - low
    it.vy = impact > 1.2 ? impact * e : 0
    if (impact > 1.2) {
      it.vx *= 0.8
      it.vz *= 0.8
    }
    if (impact > 3.5 && side.sounds < 8) {
      w.sounds.push(bouncy > 0.5 ? 'boing' : 'bonk')
      side.sounds++
    }
    onGround = true
  }
  const speed = Math.hypot(it.vx, it.vz)
  if (onGround && !floating) {
    if (speed > 0) {
      const k = Math.max(0, speed - (1.5 + 4 * (1 - bouncy)) * dt) / speed
      it.vx *= k
      it.vz *= k
    }
    it.spin *= Math.max(0, 1 - 6 * dt)
    // A round thing rolls along.
    const [sw, sh, sd] = info.size
    const big = Math.max(sw, sh, sd)
    if (speed > 0.05 && big < 1.2 && big < 1.35 * Math.min(sw, sh, sd)) {
      it.yaw = Math.atan2(it.vx, it.vz)
      it.pitch += (speed / Math.max(0.05, (sh * it.scale) / 2)) * dt
    }
  }
  if (onGround) side.grounded.add(it.id)
  else side.grounded.delete(it.id)
  if (onGround && !floating && speed < 0.05 && Math.abs(it.vy) < 0.05) {
    const still = (side.still.get(it.id) ?? 0) + dt
    if (still >= 0.3) {
      it.loose = false
      it.vx = it.vy = it.vz = it.spin = 0
      side.still.delete(it.id)
      side.thrownBy.delete(it.id)
      side.hitDone.delete(it.id)
      side.grounded.delete(it.id)
    } else side.still.set(it.id, still)
  } else side.still.delete(it.id)
}

/** People bounce a loose thing off their bodies; the first hit since it was let go is a `hit`. Whoever let go of it is skipped until it has left them. */
function bump(w: World, side: Side, it: Item, r: number, mid: number, bodies: Capsule[]) {
  for (const b of bodies) {
    if (b.riding === it.id) continue
    const cx = it.x
    const cy = it.y + mid
    const cz = it.z
    const ax = b.qx - b.px
    const ay = b.qy - b.py
    const az = b.qz - b.pz
    const len2 = ax * ax + ay * ay + az * az
    const k = len2 > 0 ? Math.max(0, Math.min(1, ((cx - b.px) * ax + (cy - b.py) * ay + (cz - b.pz) * az) / len2)) : 0
    const dx = cx - (b.px + ax * k)
    const dy = cy - (b.py + ay * k)
    const dz = cz - (b.pz + az * k)
    const d2 = dx * dx + dy * dy + dz * dz
    const R = b.r + r
    const inside = d2 < R * R
    if (side.thrownBy.get(it.id) === b.id) {
      if (!inside) side.thrownBy.delete(it.id)
      continue
    }
    if (!inside) continue
    const d = Math.sqrt(d2)
    const ux = d > 1e-6 ? dx / d : 0
    const uy = d > 1e-6 ? dy / d : 1
    const uz = d > 1e-6 ? dz / d : 0
    it.x += ux * (R - d)
    it.y += uy * (R - d)
    it.z += uz * (R - d)
    const vn = it.vx * ux + it.vy * uy + it.vz * uz
    if (vn < 0) {
      // A body is soft: a bonk, and the thing drops near it.
      it.vx = (it.vx - vn * ux) * 0.5 - 0.25 * vn * ux
      it.vy = (it.vy - vn * uy) * 0.5 - 0.25 * vn * uy
      it.vz = (it.vz - vn * uz) * 0.5 - 0.25 * vn * uz
      if (vn < -1.5 && !side.hitDone.has(it.id)) {
        side.hitDone.add(it.id)
        w.events.push({ type: 'hit', item: it.id, actor: b.id })
      }
    }
  }
}

/** How fast the wind at its strongest pushes light puffs along, m/s (along +x, the way the rain leans in the scene). */
export const WIND_SPEED = 2.5

/**
 * Puffs move, fall or rise by their own pull, slow down, drift with the wind when they are light, and
 * go when their life is over: one step of `dt` seconds, `wind` m/s along +x. It reads and writes only
 * the clock and the puffs, so another game steps its own the same way (Magic House's sim and its
 * props' puffs).
 */
export function stepPuffs(w: Pick<World, 't' | 'puffs'>, wind: number, dt: number): void {
  const drag = 1 - 1.2 * dt
  let n = 0
  for (const p of w.puffs) {
    if (w.t - p.born > p.life) continue
    p.vy -= p.gravity * dt
    if (wind !== 0 && p.gravity < 3) p.x += wind * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt
    p.vx *= drag
    p.vz *= drag
    w.puffs[n++] = p
  }
  w.puffs.length = n
}
