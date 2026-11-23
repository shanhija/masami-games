/**
 * Magic House: what is only seen and heard, as World entries the scene reads (puffs, pops, sounds,
 * shakes), kept bounded and aged by the sim each frame. The puffs are Silly Billy's: they fly as its
 * do (its stepPuffs, by import), in a room with no wind of its own, and its Effects draws them from
 * World.puffs as they are.
 *
 * A puff's spread comes from a hash of the world's serial, never from the room's random stream, so
 * the engine's own puffs do not move the throws the room's code sees.
 */

import { stepPuffs } from '../../../silly-billy/src/engine/physics'
import type { PuffKind, Vec3 } from '../../../silly-billy/src/engine/types'
import { PUFF_CAP } from '../../../silly-billy/src/scene/puffCap'
import type { Words } from '../../../profiles/src/lang'
import { DEFAULTS } from './api'
import { cos, sin } from './math'
import { DT } from './state'
import type { HouseSound } from './sounds'
import type { World } from './world'

/** The most of each the world keeps at once: as many puffs as Silly Billy's Effects draws (silly-billy/src/scene/puffCap.ts), and enough of the rest. */
export const KEEP = { puffs: PUFF_CAP, pops: 24, soundSecs: 1, shakes: 8 } as const

/** Each kind's own colour (when none is given), how long it lives, how hard it falls (m/s², below 0 rises) and how fast it flies out. */
const KINDS: Readonly<Record<PuffKind, { color: string; life: number; gravity: number; speed: number }>> = {
  dust: { color: '#d9c7a3', life: 0.6, gravity: 1, speed: 1.2 },
  spark: { color: '#ffe066', life: 0.5, gravity: 3, speed: 3 },
  heart: { color: '#ff6b9d', life: 1.2, gravity: -0.6, speed: 1.2 },
  star: { color: '#ffd23a', life: 0.9, gravity: 0, speed: 1.8 },
  drop: { color: '#5ab4ff', life: 0.8, gravity: 9.8, speed: 2.5 },
  note: { color: '#8a6cff', life: 1.2, gravity: -0.6, speed: 1 },
  bubble: { color: '#bfe8ff', life: 1.4, gravity: -1, speed: 0.8 },
  leaf: { color: '#5cbf4a', life: 1.4, gravity: 1.5, speed: 1.5 },
  snow: { color: '#ffffff', life: 1.5, gravity: 0.8, speed: 1 },
  confetti: { color: '#ff5a4e', life: 1.4, gravity: 4, speed: 4 },
  smoke: { color: '#b8b8b8', life: 1.2, gravity: -1.2, speed: 0.8 },
  fire: { color: '#ff8a3a', life: 0.7, gravity: -2.5, speed: 1 },
}

/** Confetti takes its colours from these, one each, when none is given. */
const CONFETTI = ['#ff5a4e', '#3d8bff', '#ffd23a', '#2fc46a', '#ff6bd5', '#8a6cff']

/** A number in [0, 1) from three whole numbers: the same everywhere, and nothing to do with the room's stream. */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x3c6ef372, 0x85ebca77) ^ Math.imul(c + 0x6a09e667, 0xc2b2ae3d)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** Little shapes of a kind flying out from at and fading (w.puff). color is '#rrggbb' already. It reads and writes only the clock, the serial and the puffs, so the scene's props puff the same way into a list of their own (scene/lookView.ts). */
export function addPuff(world: Pick<World, 't' | 'serial' | 'puffs'>, at: Vec3, kind: PuffKind, color: string | null, count: number, size: number): void {
  const k = KINDS[kind]
  const n = Math.max(0, Math.min(DEFAULTS.puffMax, Math.round(count)))
  const serial = ++world.serial
  for (let i = 0; i < n; i++) {
    const a = hash01(serial, i, 1) * Math.PI * 2
    const v = k.speed * (0.4 + 0.6 * hash01(serial, i, 2))
    const up = hash01(serial, i, 3)
    world.puffs.push({
      kind,
      x: at[0],
      y: at[1],
      z: at[2],
      vx: cos(a) * v,
      vy: sin(a) * v * 0.6 + up * k.speed * 0.6,
      vz: (hash01(serial, i, 4) - 0.5) * v,
      color: color ?? (kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : k.color),
      size: size * (0.7 + 0.6 * hash01(serial, i, 5)),
      born: world.t,
      life: k.life * (0.8 + 0.4 * hash01(serial, i, 6)),
      gravity: k.gravity,
    })
  }
  if (world.puffs.length > KEEP.puffs) world.puffs.splice(0, world.puffs.length - KEEP.puffs)
}

/** A sound to play once (w.sound, and the engine's own), from where it comes or from nowhere in particular. */
export function addSound(world: World, name: HouseSound, at: Vec3 | null): void {
  world.sounds.push({ name, serial: ++world.serial, at, born: world.t })
}

/** A shake of the view (w.shake), 0 to 1. */
export function addShake(world: World, strength: number): void {
  world.shakes.push({ strength: Math.max(0, Math.min(1, strength)), born: world.t, serial: ++world.serial })
  if (world.shakes.length > KEEP.shakes) world.shakes.shift()
}

/** A number or words rising from at and fading (w.pop). */
export function addPop(world: World, at: Vec3, what: number | Words): void {
  world.pops.push({ at, what, born: world.t })
  if (world.pops.length > KEEP.pops) world.pops.shift()
}

/** The puffs a frame on: each flies by its speed and pull and slows, with no wind (a room's wind zones push players and things, never puffs), and those past their life go. */
export function flyPuffs(puffs: Pick<World, 't' | 'puffs'>, dt: number): void {
  stepPuffs(puffs, 0, dt)
}

/** One frame older: the puffs fly on and go past their life (flyPuffs), pops go past DEFAULTS.popSecs, sounds older than a second (the page has played them), shakes past DEFAULTS.shakeSecs. */
export function ageEffects(world: World): void {
  const t = world.t
  flyPuffs(world, DT)
  while (world.pops.length > 0 && t - world.pops[0].born > DEFAULTS.popSecs) world.pops.shift()
  while (world.shakes.length > 0 && t - world.shakes[0].born > DEFAULTS.shakeSecs) world.shakes.shift()
  while (world.sounds.length > 0 && t - world.sounds[0].born > KEEP.soundSecs) world.sounds.shift()
}
