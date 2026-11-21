/**
 * Digger Town's look: the palette, the time of day, and the studio lights every glossy
 * machine is reflected from. Die-cast toys on a sunny building site.
 */

import { Color } from 'three'

import type { LooseKind } from '../game/model'
import { clamp01, lerp } from '../game/math'

/** The colour of each kind of loose stuff, for heaps, mounds in buckets and beds, and the ground. */
export const LOAD_COLOUR: Record<LooseKind, string> = {
  dirt: '#8a5a36',
  sand: '#ecca7c',
  rock: '#8a8d98',
  gravel: '#b5b0a4',
  concrete: '#9c9ea3',
}

/** Fixed colours for the parts that are never painted. */
export const PALETTE = {
  ink: '#2b2140',
  rubber: '#1d1d22',
  darkMetal: '#3b3f47',
  steel: '#aab1ba',
  chrome: '#eef2f6',
  hazard: '#ffc400',
  glass: '#bfe6ff',
  amber: '#ffb52e',
  white: '#f4f5f7',
  headlamp: '#fff3c4',
} as const

/** The light of one moment of the day. Colours are three.js colours in the working space. */
export interface Sunlight {
  /** Unit vector from the ground toward the sun (the moon at night), at least 20 degrees up. */
  dir: readonly [x: number, y: number, z: number]
  colour: Color
  /** DirectionalLight intensity. */
  intensity: number
  skyTop: Color
  /** The sky at the horizon, which the fog fades into. */
  skyHorizon: Color
  fog: Color
  /** Where the fog is thick. */
  fogFar: number
  hemiSky: Color
  hemiGround: Color
  hemiIntensity: number
  /** `scene.environmentIntensity`: how bright the studio reflections are. */
  env: number
  /** 0 by day, 1 in the middle of the night: stars show and windows glow above 0. */
  night: number
}

interface Key {
  day: number
  el: number
  az: number
  sun: string
  intensity: number
  top: string
  horizon: string
  hemiSky: string
  hemiGround: string
  hemi: number
  env: number
  night: number
  fogFar: number
}

// az 0 is the sun in the east (+x), PI / 2 in the south (+z, behind the camera), PI in the west.
const KEYS: readonly Key[] = [
  { day: 0.0, el: 0.4, az: 0.15, sun: '#ffb98a', intensity: 1.8, top: '#8fb4e8', horizon: '#ffd2b0', hemiSky: '#c9d6f2', hemiGround: '#7a6a60', hemi: 0.8, env: 0.6, night: 0, fogFar: 150 },
  { day: 0.12, el: 0.55, az: 0.35, sun: '#ffe2b8', intensity: 2.3, top: '#6fb4f0', horizon: '#d6ecff', hemiSky: '#cfe6ff', hemiGround: '#8a8a6a', hemi: 0.95, env: 0.9, night: 0, fogFar: 170 },
  { day: 0.3, el: 0.95, az: 0.85, sun: '#fff0d6', intensity: 2.6, top: '#4aa3f0', horizon: '#cfe9ff', hemiSky: '#d6ecff', hemiGround: '#8d8d6c', hemi: 1.0, env: 1.0, night: 0, fogFar: 190 },
  { day: 0.48, el: 1.05, az: 1.5, sun: '#fff4e0', intensity: 2.6, top: '#46a0f0', horizon: '#d2ebff', hemiSky: '#d6ecff', hemiGround: '#8d8d6c', hemi: 1.0, env: 1.0, night: 0, fogFar: 190 },
  { day: 0.6, el: 0.75, az: 2.1, sun: '#ffd9a0', intensity: 2.4, top: '#5aa0e6', horizon: '#ffe0bd', hemiSky: '#e0e6f2', hemiGround: '#8a7d62', hemi: 0.95, env: 0.9, night: 0, fogFar: 170 },
  { day: 0.68, el: 0.42, az: 2.55, sun: '#ff9a55', intensity: 2.0, top: '#6f8fd8', horizon: '#ffb48a', hemiSky: '#e8c9c0', hemiGround: '#7a5a48', hemi: 0.85, env: 0.75, night: 0.05, fogFar: 150 },
  { day: 0.78, el: 0.36, az: 2.85, sun: '#ff7058', intensity: 1.3, top: '#3b3f8f', horizon: '#e07a8a', hemiSky: '#8a7ab0', hemiGround: '#4a3a4a', hemi: 0.6, env: 0.42, night: 0.4, fogFar: 120 },
  { day: 0.9, el: 0.55, az: 3.7, sun: '#8aa8ff', intensity: 0.8, top: '#0b1030', horizon: '#1f2a5a', hemiSky: '#2a3a7a', hemiGround: '#101520', hemi: 0.5, env: 0.25, night: 1, fogFar: 100 },
  { day: 1.0, el: 0.55, az: 3.9, sun: '#8aa8ff', intensity: 0.8, top: '#0a0e2c', horizon: '#1c2654', hemiSky: '#2a3a7a', hemiGround: '#101520', hemi: 0.5, env: 0.25, night: 1, fogFar: 100 },
]

/** Keeps lit paint below the tone mapper's shoulder, where yellow turns cream and red turns pink. */
const SUN_GAIN = 0.62

const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t)

/**
 * The light at `day` (0 dawn, 0.12 morning, 0.3 and 0.48 bright day, 0.68 sunset, 0.9 starry night, 1 the same night).
 * It allocates a few colours: call it once per frame or when the day changes, not per object.
 */
export function sunOf(day: number): Sunlight {
  const d = clamp01(day)
  let i = 0
  while (i < KEYS.length - 2 && d > KEYS[i + 1].day) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const u = clamp01((d - a.day) / (b.day - a.day))
  const t = u * u * (3 - 2 * u)
  const el = Math.max(lerp(a.el, b.el, t), 0.36)
  const az = lerp(a.az, b.az, t)
  const horizon = mix(a.horizon, b.horizon, t)
  return {
    dir: [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)],
    colour: mix(a.sun, b.sun, t),
    intensity: lerp(a.intensity, b.intensity, t) * SUN_GAIN,
    skyTop: mix(a.top, b.top, t),
    skyHorizon: horizon,
    fog: horizon,
    fogFar: lerp(a.fogFar, b.fogFar, t),
    hemiSky: mix(a.hemiSky, b.hemiSky, t),
    hemiGround: mix(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemi, b.hemi, t),
    env: lerp(a.env, b.env, t),
    night: lerp(a.night, b.night, t),
  }
}

/** The fog starts at least this fraction of `fogFar` away, and is thick over the rest of the way to `fogFar`. */
const FOG_START = 0.55
/** The fog starts this many times the camera's distance to the ground it looks at away, so what the camera frames stays clear. */
const FOG_CLEAR = 1.3

/**
 * Where the fog starts and ends for a time of day whose fog is thick at `fogFar`, when the camera
 * stands `dist` metres from the ground point it looks at (0 when it looks at no ground). The fog
 * never starts nearer than the day's own, and starts behind what the camera frames however far
 * back it stands, keeping the band as wide as the day's so the far edge of the world stays hidden.
 * A distance beyond `fogFar` counts as `fogFar`, so a near-level view cannot push the fog away.
 */
export function fogRange(fogFar: number, dist: number): { near: number; far: number } {
  const near = Math.max(fogFar * FOG_START, FOG_CLEAR * Math.min(dist, fogFar))
  return { near, far: near + fogFar * (1 - FOG_START) }
}

/**
 * The studio the glossy paint reflects: a bright overhead softbox, a warm key and a cool fill
 * from the sides, a low back strip for the rim and a floor bounce. Each entry becomes one
 * drei `Lightformer` inside an `Environment`; the dome colour is what is left between them.
 */
export const STUDIO = {
  dome: { top: '#6f879f', horizon: '#8397ab', ground: '#3b3a32' },
  lights: [
    { form: 'rect', intensity: 1.5, color: '#ffffff', position: [0, 9, 1], scale: [7, 1.2, 1], rotation: [Math.PI / 2, 0, 0] },
    { form: 'rect', intensity: 5, color: '#fff0d8', position: [9, 4, 5], scale: [1.6, 7, 1], rotation: [0, -Math.PI / 2.6, 0] },
    { form: 'rect', intensity: 3, color: '#cfe4ff', position: [-9, 3, 4], scale: [1.6, 7, 1], rotation: [0, Math.PI / 2.6, 0] },
    { form: 'rect', intensity: 3, color: '#ffffff', position: [3, 3, -9], scale: [4, 0.8, 1], rotation: [0, 0, 0] },
    { form: 'rect', intensity: 2.2, color: '#ffe6bd', position: [0, -6, 2], scale: [14, 8, 1], rotation: [-Math.PI / 2, 0, 0] },
    { form: 'circle', intensity: 4, color: '#ffffff', position: [4, 6, 8], scale: [1.6, 1.6, 1], rotation: [-0.5, 0.4, 0] },
  ],
} as const
