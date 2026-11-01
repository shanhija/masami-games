/**
 * Where the stage's own things stand, for every file of the stage that needs them: the
 * water's surface, the key under the arch, the flags at the track's edges, the cards of
 * the measuring pole. Sim coordinates (see model.ts): draw them with `toThree`.
 */

import { ANIMAL_FROM, ANIMALS, MAX_SIZE, POLE_DZ, POLE_X, R0, type Course } from '../game/model'

/** The water's surface. The track's top is y = 0 and the sim splashes the slime once its bottom is under -0.5, so it splashes as it touches the water. */
export const WATER_Y = -0.5

/** The key floats this high under the finish arch until the slime takes it. */
export const KEY_Y = 1.7

/** The span across of the track under x = 0 at z: every slab covering that point, merged. A course always has ground there, so a gap is a broken course and throws. */
export function mainSpanAt(course: Course, z: number) {
  let x0 = Infinity
  let x1 = -Infinity
  for (const g of course.ground) {
    if (g.x0 <= 0 && g.x1 >= 0 && g.z0 <= z && g.z1 >= z) {
      x0 = Math.min(x0, g.x0)
      x1 = Math.max(x1, g.x1)
    }
  }
  if (x0 > x1) throw new Error(`course ${course.id} has no ground under x = 0 at z = ${z}`)
  return { x0, x1 }
}

/** A checkpoint's two flag poles stand on floats in the water just off the track's edges, so even the biggest slime runs between them. */
export function flagPoles(course: Course, z: number): readonly [number, number] {
  const s = mainSpanAt(course, z)
  return [s.x0 - 0.4, s.x1 + 0.4]
}
/** The flag's cloth hangs from the top of its pole, between these heights. */
export const FLAG_TOP = 2.7
export const FLAG_CLOTH_H = 0.72

/**
 * The measuring pole's cards, stacked on its far side from the track: card i shows
 * ANIMALS[i] and reaches from the height a slime of size ANIMAL_FROM[i] stands (a slime
 * is 2 r = 2 R0 size tall) up to where the next animal starts, so the top of the slime
 * standing beside the pole points at its own animal.
 */
export const CARD_W = 0.66
export function cardSpan(i: number) {
  const bottom = 2 * R0 * ANIMAL_FROM[i]!
  const top = 2 * R0 * (i + 1 < ANIMALS.length ? ANIMAL_FROM[i + 1]! : MAX_SIZE)
  return { bottom, top }
}
export function cardCentre(course: Course, i: number) {
  const { bottom, top } = cardSpan(i)
  return { x: POLE_X + 0.14 + CARD_W / 2, y: (bottom + top) / 2, z: course.finishZ + POLE_DZ }
}
/** The lit card grows this much and steps out of the stack toward the camera and away from the pole, so it never covers its neighbours. */
export const CARD_LIT_SCALE = 2.1
export const CARD_LIT_DX = 0.8
export const CARD_LIT_DZ = -0.5
/** At the measure, a gold ring drops down the pole to the slime's height in this long; then the card of its animal pops out over this long. */
export const MARK_DROP = 0.35
export const CARD_POP = 0.4
/** The pole's top, a little over the tallest slime. */
export const POLE_H = 2 * R0 * MAX_SIZE + 0.35
