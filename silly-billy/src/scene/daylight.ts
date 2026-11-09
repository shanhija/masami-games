import { Color } from 'three'

import { palette as castle } from '../../../castle-builder/src/scene/look'
import { nightOf, twilightOf } from '../engine/sky'
import type { Sky } from '../engine/types'
import { colorOf } from './look'

/**
 * How the sky and the light look for the world's sky (engine/sky.ts): pure numbers and colours,
 * read by the Stage every frame. By day it is Castle Builder's noon exactly (the light the game
 * was made in); at dusk and dawn the sky and the sun warm; at night the sky is deep blue, the
 * sun is the moon's cool light, the fill dims and stars come out; rain greys it and dims the
 * sun; fog closes in in the sky's own colour. Lamps and fires light what is near at night by
 * themselves (`pickLamps`), within a budget of lights the tablet can afford.
 */

export const SKY = {
  day: castle.skyHorizon,
  dusk: '#f7b98f',
  night: '#1b2552',
  storm: castle.stormHorizon,
  sun: castle.sunlight,
  sunset: '#ffb06e',
  moon: castle.moonlight,
  fillSky: castle.skyLight,
  fillGround: castle.groundLight,
  nightSky: '#4a5ca0',
  nightGround: '#26302a',
} as const

/** The sun's intensity by day (Castle Builder's) and the moon's. */
const SUN = 2.2
const MOON = 0.7
const FILL = 0.8
const NIGHT_FILL = 0.68

export interface Daylight {
  /** The background and the fog's colour. */
  sky: Color
  sun: Color
  sunIntensity: number
  fillSky: Color
  fillGround: Color
  fillIntensity: number
  /** 0 by day .. 1 at night: stars, lamps, the moon. */
  night: number
  /** How thick the fog is, 0..1 (rain brings some). */
  fog: number
  /** Where the sun (or the moon) is, turned round from the noon light's side: radians about y. */
  turn: number
}

/** The sky's colours as three.js colours, made once. */
const C = Object.fromEntries(Object.entries(SKY).map(([k, v]) => [k, new Color(v)])) as Record<keyof typeof SKY, Color>
const own = new Color()

/** The look of the sky now. `out` is filled and returned (no new colours a frame). */
export function daylight(sky: Sky, out: Daylight): Daylight {
  const night = nightOf(sky.time)
  const dusk = twilightOf(sky.time)
  const wet = Math.max(sky.rain, sky.snow * 0.6)
  out.night = night
  out.sky.copy(C.day).lerp(C.dusk, dusk * 0.8).lerp(C.night, night).lerp(C.storm, wet * 0.55 * (1 - night * 0.6))
  if (sky.color !== null) out.sky.lerp(own.set(colorOf(sky.color)), 0.85)
  out.sun.copy(C.sun).lerp(C.sunset, dusk).lerp(C.moon, night)
  if (sky.light !== null) out.sun.set(colorOf(sky.light))
  out.sunIntensity = (SUN + (MOON - SUN) * night) * (1 - 0.45 * wet) * (1 - 0.2 * dusk)
  out.fillSky.copy(C.fillSky).lerp(C.nightSky, night)
  out.fillGround.copy(C.fillGround).lerp(C.nightGround, night)
  if (sky.light !== null) out.fillSky.lerp(own.set(colorOf(sky.light)), 0.4)
  out.fillIntensity = FILL + (NIGHT_FILL - FILL) * night
  out.fog = Math.min(1, sky.fog + 0.3 * sky.rain + 0.15 * sky.snow)
  const h = ((sky.time % 24) + 24) % 24
  // The light swings a little through the day; the moon comes from the other side.
  out.turn = night > 0.5 ? 0.6 : ((h - 13) / 6) * 0.45
  return out
}

export const newDaylight = (): Daylight => ({ sky: new Color(), sun: new Color(), sunIntensity: SUN, fillSky: new Color(), fillGround: new Color(), fillIntensity: FILL, night: 0, fog: 0, turn: 0 })

/** Where the sun or the moon is on its arc over the top of the view: 0 rising at the left, 1 setting at the right; null when neither is up (the moon rises as the sun sets). */
export function arcOf(time: number): { moon: boolean; k: number } {
  const h = ((time % 24) + 24) % 24
  if (h >= 6 && h < 19) return { moon: false, k: (h - 6) / 13 }
  return { moon: true, k: ((h - 19 + 24) % 24) / 11 }
}

/** A light a thing or an actor gives: where, what colour, how strong (1 is a lamp at full night). */
export interface Lamp {
  x: number
  y: number
  z: number
  color: string
  strength: number
}

/**
 * The lamps that get real lights this frame: at most `max`, the strongest near the middle of
 * the view first. A thing's own light shines day and night; a lamp or a fire only at night.
 */
export function pickLamps(lamps: Lamp[], aim: { x: number; z: number }, max: number): Lamp[] {
  const score = (l: Lamp) => l.strength / (1 + 0.05 * ((l.x - aim.x) ** 2 + (l.z - aim.z) ** 2))
  return lamps
    .filter((l) => l.strength > 0.02)
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
}
