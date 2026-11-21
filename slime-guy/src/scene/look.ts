import type { CourseId } from '../game/model'

/**
 * The look: a glossy jelly-and-foam toy world. Everything is rounded (spheres, capsules,
 * rounded boxes, tori), smooth-shaded and a little shiny, in soft candy colours under a
 * bright sky; the slime and its balls are glossy see-through jelly. Nothing is
 * flat-faceted, toon-shaded or outlined, which keeps it apart from the other games.
 * Depth comes from soft fog into the sky colour, one sun with soft shadows and a sky fill.
 */

/** A sim point (x, y, z) in three's space: the course runs toward three's -Z. */
export const toThree = (x: number, y: number, z: number): [number, number, number] => [x, y, -z]

/** The fog starts this far from the camera and swallows everything by this far: the course near the slime stays crisp and the horizon melts into the sky. */
export const FOG = { near: 30, far: 140 } as const

/** The seconds a popped circle's stars take to fly up to the star count: Effects throws them and the HUD counts them in. */
export const STAR_FLY = 0.7

/** a and b blended, t of the way to b; both '#rrggbb', t from 0 to 1. */
export function mix(a: string, b: string, t: number) {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) throw new Error(`mix needs #rrggbb colours, got ${a} and ${b}`)
  if (!(t >= 0 && t <= 1)) throw new Error(`mix blends 0 to 1 of the way, got ${t}`)
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

export interface Theme {
  /** The sky from overhead to the horizon; far things fade into `fog`. */
  skyTop: string
  skyBottom: string
  fog: string
  /** The sun and the sky fill (sky colour, ground bounce). */
  sun: string
  sunIntensity: number
  fillSky: string
  fillGround: string
  fillIntensity: number
  /** The water round the track, deeper further out, and its foam and sparkle. */
  water: string
  waterDeep: string
  foam: string
  /** The track: its top in two alternating bands, its sides, the stripe along its edges. */
  top: string
  topAlt: string
  side: string
  edge: string
  /** The obstacles' foam colours on this island, the first two the main ones. */
  accent: readonly [string, string, string, string]
  /** Night: the moon instead of the sun, stars, things glow a little. */
  night: boolean
}

export const THEMES: Record<CourseId, Theme> = {
  park: {
    skyTop: '#62b8ff',
    skyBottom: '#d9f2ff',
    fog: '#cdeeff',
    sun: '#fff3dc',
    sunIntensity: 2.4,
    fillSky: '#c4e6ff',
    fillGround: '#7cc860',
    fillIntensity: 0.9,
    water: '#3cc6e2',
    waterDeep: '#2496c2',
    foam: '#eafcff',
    top: '#8ddc68',
    topAlt: '#7fd05a',
    side: '#c99a62',
    edge: '#ffffff',
    accent: ['#ff6b8b', '#ffd23f', '#5ec8ff', '#a07bff'],
    night: false,
  },
  beach: {
    skyTop: '#46b4ff',
    skyBottom: '#fff0d4',
    fog: '#ffeedd',
    sun: '#fff1d0',
    sunIntensity: 2.6,
    fillSky: '#bfe6ff',
    fillGround: '#f2d48c',
    fillIntensity: 0.9,
    water: '#22d0cc',
    waterDeep: '#1394b8',
    foam: '#f4fffd',
    top: '#f6e0a2',
    topAlt: '#efd48a',
    side: '#d8b46c',
    edge: '#ffffff',
    accent: ['#ff7f5e', '#2fc4b0', '#ffd23f', '#ff8fc8'],
    night: false,
  },
  candy: {
    skyTop: '#ff9fd8',
    skyBottom: '#fff0fa',
    fog: '#ffe6f6',
    sun: '#fff0f6',
    sunIntensity: 2.3,
    fillSky: '#ffd6ef',
    fillGround: '#ffc6e6',
    fillIntensity: 1,
    water: '#7fe6d2',
    waterDeep: '#3fbfb0',
    foam: '#ffffff',
    top: '#ffc8e7',
    topAlt: '#ffd9ef',
    side: '#c98a5a',
    edge: '#fffaf0',
    accent: ['#8f6bff', '#ff4f9a', '#5fd8f0', '#ffd23f'],
    night: false,
  },
  winter: {
    skyTop: '#8cc6ff',
    skyBottom: '#eef8ff',
    fog: '#e6f3ff',
    sun: '#f4f8ff',
    sunIntensity: 2.2,
    fillSky: '#d6ecff',
    fillGround: '#e8f4ff',
    fillIntensity: 1.1,
    water: '#4aa2dc',
    waterDeep: '#2f74b8',
    foam: '#ffffff',
    top: '#f5fbff',
    topAlt: '#e4f1ff',
    side: '#b6d5ee',
    edge: '#7fc4ff',
    accent: ['#e8503f', '#3f8fe0', '#5ec25a', '#ffd23f'],
    night: false,
  },
  night: {
    skyTop: '#151a52',
    skyBottom: '#4b3f92',
    fog: '#3a3580',
    sun: '#cfd8ff',
    sunIntensity: 1.5,
    fillSky: '#7f86e0',
    fillGround: '#2c2f7a',
    fillIntensity: 1.1,
    water: '#2a3d92',
    waterDeep: '#1a2366',
    foam: '#b8c4ff',
    top: '#5b6ad6',
    topAlt: '#6878e2',
    side: '#363b8f',
    edge: '#ffe066',
    accent: ['#ffe066', '#ff8fc8', '#5fd8f0', '#b38bff'],
    night: true,
  },
}

/** Colours every island shares. */
export const palette = {
  ink: '#2b2140',
  white: '#ffffff',
  eye: '#ffffff',
  pupil: '#2b2140',
  blush: '#ff8fb0',
  gold: '#ffcf3f',
  goldDeep: '#e0a020',
  boxRed: '#ff5e8a',
  ribbon: '#ffd23f',
  wood: '#c98a52',
  woodDeep: '#9a6436',
  metal: '#c7ccd9',
  fish: '#ff9f43',
  lily: '#5ec25a',
  confetti: ['#ff5e8a', '#ffd23f', '#5ec8ff', '#7fe07a', '#b38bff', '#ffffff'],
  star: '#ffe066',
  /** Red to violet: the jelly's rainbow pattern, its swatch in the wardrobe, the tower's funnel. */
  rainbow: ['#ff6b6b', '#ffa94d', '#ffe066', '#7fe07a', '#5ec8ff', '#b38bff'],
} as const
