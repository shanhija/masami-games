/**
 * The presents' models, as the scene draws them on a kid: each read from the library once
 * (LibrarySource.gift), its guarded code compiled behind the sandbox (trial/compile.ts compileGift)
 * and built once in the two marker colours (trial/giftCheck.ts giftRecipe), which the scene paints
 * in each wearer's colours (dress.ts inColours). Kept for the whole visit: play never changes a
 * present's file. The worn lookup (wornModel) finds a starting piece in the wardrobe and a present
 * here, so the room, the end and the dressing room all draw what a player wears.
 */

import type { Recipe } from '../../../silly-billy/src/engine/types'
import { WARDROBE } from '../own/wardrobe/wardrobe'
import type { LibrarySource } from '../protocol'
import { compileGift } from '../trial/compile'
import { giftRecipe } from '../trial/giftCheck'

/** Each present asked for, by id: its model once built, or why it would not load or build. */
const asked = new Map<string, Promise<Recipe>>()
const built = new Map<string, Recipe>()

/** A present's model in the marker colours, read and built the first time it is asked for; rejects with what went wrong (the file would not load, its code would not compile or build). */
export function loadPresent(source: LibrarySource, id: string): Promise<Recipe> {
  let model = asked.get(id)
  if (model === undefined) {
    model = source.gift(id).then((file) => {
      if (file.id !== id) throw new Error(`the library gave the present ${file.id} for ${id}`)
      const recipe = giftRecipe(compileGift(file.guarded), file.slot).recipe
      built.set(id, recipe)
      return recipe
    })
    // A present that failed may be asked for again later (the dev server was away a moment).
    model.catch(() => asked.delete(id))
    asked.set(id, model)
  }
  return model
}

/** What a kid wears by its id, for the scene (dress.ts WornModels): a starting piece from the wardrobe, a present once loaded (loadPresent), else null for now. */
export function wornModel(id: string): Recipe | null {
  return WARDROBE.recipe(id) ?? built.get(id) ?? null
}
