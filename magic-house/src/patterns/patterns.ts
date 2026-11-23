/**
 * The house's own set of patterns (plan.md, The look, people and presents): what a worn thing's main
 * colour can carry, in its second colour. Five bold, cheerful ones and plain, big enough to read on
 * a kid about 40 px tall from the side and from high up: stripes, dots, squares, zigzags and stars.
 *
 * Every pattern is laid on what a model paints c.main (engine/gift.ts GIFT_MARKERS.main), never on
 * hair, which reads as hair only when it is one colour. A Wearing keeps its pattern by name
 * (saves.ts Wearing.pattern), so a name no longer in the set is drawn plain.
 *
 * Plain data, so the dressing room's choosing (shell/dressing/choose.ts) and vitest read it; the
 * scene draws the set with patterns/look.ts, the dressing room's swatches with Swatch.tsx, both from
 * PATTERN_LOOK, so the two show the same pattern.
 */

import type { Slot } from '../../../silly-billy/src/engine/types'
import type { Wearing } from '../saves'
import { PATTERN_NAMES } from '../words'

export type PatternName = keyof typeof PATTERN_NAMES

/** The set, in the order the dressing room shows it: plain first. A pattern's number is its place here (the scene's shader picks by it). */
export const PATTERN_ORDER = Object.keys(PATTERN_NAMES) as PatternName[]

/** No pattern: the main colour alone. What every Wearing is until its wearer picks one. */
export const PLAIN: PatternName = 'plain'

/**
 * How the patterns are laid, as fractions of one tile `period` metres square on the model (its own
 * frame, so a pattern grows with the kid): a stripe's share of its tile, a dot's and a star's radius,
 * how high a zigzag swings and how thick its band is. A period of 16 cm puts about three tiles across
 * a hat and makes each tile about 6 px on a kid 40 px tall.
 */
export const PATTERN_LOOK = { period: 0.16, stripe: 0.5, spot: 0.3, star: 0.42, starInner: 0.45, zigzag: 0.5, zigzagBand: 0.45 } as const

/** A Wearing's pattern as the set knows it: its name, or plain for a name no longer in the set. */
export function patternOf(name: string): PatternName {
  return (PATTERN_ORDER as readonly string[]).includes(name) ? (name as PatternName) : PLAIN
}

/** Whether a slot's thing carries a pattern: everything but hair. */
export const patterned = (slot: Slot) => slot !== 'hair'

/** The pattern a thing worn in a slot is drawn with: its own, plain on hair or for a name no longer in the set. */
export function patternShown(slot: Slot, w: Pick<Wearing, 'pattern'>): PatternName {
  return patterned(slot) ? patternOf(w.pattern) : PLAIN
}
