/**
 * How a kid is dressed: what the scene asks of the wardrobe, and a worn thing's model in its
 * wearer's colours.
 *
 * The starting wardrobe (own/wardrobe/, written after the scene) turns a gallery face
 * (profiles/src/avatar.ts) into the house's kid: the skin colour, and what the face wears in its
 * hair and extra slots, in the face's hair colour (saves.ts Wearing). The sim puts those on the
 * player (world.ts Player.body.skin and Player.wear) and the scene finds each worn thing's model by
 * its id: a present's from the library, a starting piece's from the wardrobe. Every worn model is
 * built in the two marker colours (engine/gift.ts GIFT_MARKERS) and painted the wearer's here, and
 * in the scene with their pattern (patterns/look.ts).
 */

import type { Avatar } from '../../../profiles/src/avatar'
import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import type { Recipe, Slot } from '../../../silly-billy/src/engine/types'
import { GIFT_MARKERS } from '../engine/gift'
import type { Wearing } from '../saves'

/** A gallery face as the house dresses it. */
export interface FaceDress {
  /** The kid's skin, '#rrggbb'. */
  skin: string
  /** What it wears from the starting wardrobe, its hair and its extra, by slot; main is the hair colour (an extra takes the colours its own piece gives). */
  wear: Partial<Record<Slot, Wearing>>
}

/** The starting wardrobe, as the scene and the sim use it. */
export interface Wardrobe {
  /** A gallery face's skin, hair colour, hair and extra. */
  dress(avatar: Avatar): FaceDress
  /** A starting piece's model by its id (`own:<name>`), built in GIFT_MARKERS; null when the wardrobe has none by that id. */
  recipe(id: string): Recipe | null
}

/**
 * What a player wears in a slot to wear nothing there, where their gallery face would give a thing
 * (saves.ts Wear: a slot left out follows the face). Kept in the saves like any Wearing, and never
 * drawn: wornOver leaves it out.
 */
export const BARE = 'own:bare'

/** What a kid wears: their gallery face's things with what they chose over them, slot by slot, less every slot worn BARE. The sim's party (shell/play.ts partyFrom) and the dressing room both dress by it. */
export function wornOver(face: FaceDress['wear'], wear: Partial<Record<Slot, Wearing>>): Partial<Record<Slot, Wearing>> {
  const out: Partial<Record<Slot, Wearing>> = { ...face, ...wear }
  for (const slot of Object.keys(out) as Slot[]) if (out[slot]!.id === BARE) delete out[slot]
  return out
}

/** Where the scene finds a worn thing's model by its id, a present's or a starting piece's; null while it has none (a present not loaded yet). */
export type WornModels = (id: string) => Recipe | null

/**
 * What is drawn on the head while the hair's own model is not to be had: a plain cap of hair in the
 * hair's colour, built round the model kid's head (engine/gift.ts SLOT_REF hair) so the face stays
 * clear. The starting wardrobe has a model for every hair, so today it stands in only for a hair
 * present still loading (step 5).
 */
export const HAIR_CAP: Recipe = buildRecipe((m) => {
  m.sphere(0.25, { at: [0, 0.05, -0.05], color: GIFT_MARKERS.main })
  m.sphere(0.1, { at: [0, 0.2, 0.08], scale: [1.6, 0.55, 1], color: GIFT_MARKERS.main })
  return {}
}, ['hair']).recipe

/** The model's shapes in the wearer's colours: each shape painted a marker exactly takes the wearer's colour, every other keeps its own. The flat pictures of the HUD, the end and the dressing room draw this, without the pattern; the scene's kids wear the pattern too (patterns/look.ts wornModelIn). */
export function inColours(recipe: Recipe, w: Pick<Wearing, 'main' | 'second'>): Recipe {
  return { ...recipe, shapes: recipe.shapes.map((s) => (s.color === GIFT_MARKERS.main ? { ...s, color: w.main } : s.color === GIFT_MARKERS.second ? { ...s, color: w.second } : s)) }
}
