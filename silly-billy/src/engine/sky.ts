/**
 * The sky, the light and the weather (the same in every room), and each room's ground and
 * water, as plain data on the world. Made code sets a value at once or fades it there; a fade
 * goes on by itself, a frame at a time, after the code that started it is over, and everything
 * stays as it was left. The scene reads the values (and eases a colour that jumped); the sim
 * reads how dark it is, how full the water is and the weather.
 */

import { parseColor } from './kit'
import { ROOMS, type Fade, type RoomId, type Sky, type SkyKey, type Terrain, type TerrainKey, type World } from './types'

/** The time of day a world starts at: early afternoon, the light the game was made in. */
export const START_TIME = 13

export const newSky = (): Sky => ({ time: START_TIME, rain: 0, snow: 0, fog: 0, wind: 0, color: null, light: null, fades: {} })
export const newTerrain = (): Terrain => ({ water: 1, waterColor: null, ground: null, fades: {} })
const newTerrains = (): Record<RoomId, Terrain> => ({ playground: newTerrain(), pool: newTerrain(), forest: newTerrain() })

/** The world's sky; a world from before the sky gets the default one now. */
export const skyOf = (w: World): Sky => (w.sky ??= newSky())

/** A room's ground and water; a world from before them gets the defaults now. */
export const terrainOf = (w: World, room: RoomId): Terrain => (w.terrain ??= newTerrains())[room]

const smooth = (k: number) => k * k * (3 - 2 * k)
const hours = (h: number) => ((h % 24) + 24) % 24

/** How dark it is at a time of day: 0 from 7 to 18, 1 from 20:30 to 4:30, easing between at dusk and dawn. */
export function nightOf(time: number): number {
  const h = hours(time)
  if (h >= 7 && h <= 18) return 0
  if (h > 18 && h < 20.5) return smooth((h - 18) / 2.5)
  if (h >= 4.5 && h < 7) return smooth((7 - h) / 2.5)
  return 1
}

/** The warm light of sunrise and sunset: 1 at 6 and at 19, nothing by full day and full night. */
export function twilightOf(time: number): number {
  const h = hours(time)
  const peak = (at: number, width: number) => Math.max(0, 1 - Math.abs(h - at) / width)
  return smooth(Math.max(peak(6, 1.6), peak(19, 1.8)))
}

// ------------------------------------------------------------------------------ what code may write

type Value = number | string | null

/** A value code gave for a key, as the key keeps it, or undefined when it does not fit (then nothing changes). */
function skyValue(key: SkyKey, v: unknown): Value | undefined {
  if (key === 'color' || key === 'light') return v === null || v === '' ? null : (parseColor(v) ?? undefined)
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return key === 'time' ? hours(v) : Math.max(0, Math.min(1, v))
}

function terrainValue(key: TerrainKey, v: unknown): Value | undefined {
  if (key === 'water') return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined
  return v === null || v === '' ? null : (parseColor(v) ?? undefined)
}

export const SKY_KEYS: readonly SkyKey[] = ['time', 'rain', 'snow', 'fog', 'wind', 'color', 'light']
export const TERRAIN_KEYS: readonly TerrainKey[] = ['water', 'waterColor', 'ground']

/** Sets one of the sky's values now (ending its fade); a value that does not fit changes nothing. */
export function setSky(sky: Sky, key: SkyKey, v: unknown): void {
  const value = skyValue(key, v)
  if (value === undefined) return
  delete sky.fades[key]
  ;(sky as unknown as Record<SkyKey, Value>)[key] = value
}

export function setTerrain(t: Terrain, key: TerrainKey, v: unknown): void {
  const value = terrainValue(key, v)
  if (value === undefined) return
  delete t.fades[key]
  ;(t as unknown as Record<TerrainKey, Value>)[key] = value
}

/**
 * Starts fades of the values given in `changes` over `secs`. Numbers ease; the time of day goes
 * forward (back only for a few hours), so day to night passes through the dusk; a colour eases
 * from a colour and jumps to or from null (the scene softens the jump). Unknown keys and values
 * that do not fit are left out.
 */
function fadeAll<K extends string>(o: Record<K, Value>, fades: Partial<Record<K, Fade>>, keys: readonly K[], check: (key: K, v: unknown) => Value | undefined, changes: unknown, secs: number, t: number): void {
  if (changes === null || typeof changes !== 'object') return
  const c = changes as Record<string, unknown>
  for (const key of keys) {
    if (!(key in c)) continue
    const to = check(key, c[key])
    if (to === undefined) continue
    const from = o[key]
    if (secs <= 0 || from === null || to === null || typeof from !== typeof to) {
      delete fades[key]
      o[key] = to
      continue
    }
    if (key === 'time') {
      const ahead = hours((to as number) - (from as number))
      fades[key] = { from, to: (from as number) + (ahead > 20 ? ahead - 24 : ahead), start: t, secs }
    } else fades[key] = { from, to, start: t, secs }
  }
}

const fadeSecs = (secs: unknown) => (typeof secs === 'number' && Number.isFinite(secs) ? Math.max(0, Math.min(120, secs)) : 3)

export function fadeSky(w: World, changes: unknown, secs: unknown): number {
  const s = fadeSecs(secs)
  fadeAll(skyOf(w) as unknown as Record<SkyKey, Value>, skyOf(w).fades, SKY_KEYS, skyValue, changes, s, w.t)
  return s
}

export function fadeTerrain(w: World, room: RoomId, changes: unknown, secs: unknown): number {
  const s = fadeSecs(secs)
  const t = terrainOf(w, room)
  fadeAll(t as unknown as Record<TerrainKey, Value>, t.fades, TERRAIN_KEYS, terrainValue, changes, s, w.t)
  return s
}

// ------------------------------------------------------------------------------ the fades, a frame at a time

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')

/** Two '#rrggbb' colours mixed: k 0 is a, 1 is b. */
export function mixColor(a: string, b: string, k: number): string {
  const p = rgb(a)
  const q = rgb(b)
  return `#${[0, 1, 2].map((i) => hex2(p[i]! + (q[i]! - p[i]!) * k)).join('')}`
}

function stepEach<K extends string>(o: Record<K, Value>, fades: Partial<Record<K, Fade>>, t: number): void {
  for (const key of Object.keys(fades) as K[]) {
    const f = fades[key]!
    const k = f.secs <= 0 ? 1 : Math.max(0, Math.min(1, (t - f.start) / f.secs))
    const e = smooth(k)
    if (typeof f.from === 'number' && typeof f.to === 'number') {
      const v = f.from + (f.to - f.from) * e
      o[key] = (key === 'time' ? hours(v) : v) as Value
    } else o[key] = mixColor(String(f.from), String(f.to), e)
    if (k >= 1) delete fades[key]
  }
}

/** One frame of every fade: the sky's and each room's. */
export function stepFades(w: World): void {
  const sky = skyOf(w)
  stepEach(sky as unknown as Record<SkyKey, Value>, sky.fades, w.t)
  for (const room of ROOMS) {
    const t = terrainOf(w, room)
    stepEach(t as unknown as Record<TerrainKey, Value>, t.fades, w.t)
  }
}
