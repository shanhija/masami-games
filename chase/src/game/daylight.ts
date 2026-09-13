import { mod, smoothstep } from './math'

/** One whole day, in seconds of sim time: it turns with the game and stops with it. */
export const DAY_LENGTH = 60

/** Where in the day: 0 noon, 0.25 sunset, 0.5 midnight, 0.75 sunrise. */
export const dayPhase = (time: number) => mod(time / DAY_LENGTH, 1)

/** 1 at noon, 0 at midnight, smooth in between. Everything that changes with the day reads this. */
export const daylight = (time: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * dayPhase(time))

/** How much of the night is on: 1 when it is dark. The headlights, the stars, the worms and the night speed read this. */
export const night = (time: number) => smoothstep(0.5, 0.15, daylight(time))
