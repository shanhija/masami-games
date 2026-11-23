/**
 * The reading quiz's objects (plan.md, Sums by code, words by objects): Silly Billy's built-in
 * things by import, each with its model and its name in both languages, and the presents this
 * house has made, each built from its file as every screen builds it (scene/presents.ts). Hair alone is left out:
 * without a head under it, it reads as nothing.
 */

import { buildRecipe } from '../../../../silly-billy/src/engine/kit'
import { namesOf, type BuiltinItem } from '../../../../silly-billy/src/engine/library'
import type { Recipe } from '../../../../silly-billy/src/engine/types'
import { FOREST_ITEMS } from '../../../../silly-billy/src/content/items/forest'
import { PEOPLE_ITEMS } from '../../../../silly-billy/src/content/items/people'
import { PLAYGROUND_ITEMS } from '../../../../silly-billy/src/content/items/playground'
import { POOL_ITEMS } from '../../../../silly-billy/src/content/items/pool'
import { palette } from '../../../../silly-billy/src/scene/look'
import type { GiftEntry, LibrarySource } from '../../protocol'
import { inColours } from '../../scene/dress'
import { loadPresent } from '../../scene/presents'
import type { QuizObject } from './reading'

const ITEMS: readonly BuiltinItem[] = [...PLAYGROUND_ITEMS, ...POOL_ITEMS, ...FOREST_ITEMS, ...PEOPLE_ITEMS].filter((b) => !b.id.startsWith('hair-'))

/** Silly Billy's built-in things as the quiz reads them. */
export const BUILT_IN_OBJECTS: readonly QuizObject[] = ITEMS.map((b) => ({ kind: 'item', id: b.id, name: { en: b.name, fi: b.nameFi } }))

/** A present as the quiz reads it. */
export const giftObject = (g: GiftEntry): QuizObject => ({ kind: 'gift', id: g.id, name: g.name })

const built = new Map<string, Recipe>()

/** A built-in thing's model, built once. */
export function itemRecipe(id: string): Recipe {
  let recipe = built.get(id)
  if (recipe === undefined) {
    const b = ITEMS.find((i) => i.id === id)
    if (b === undefined) throw new Error(`Silly Billy has no built-in thing ${id}`)
    recipe = buildRecipe(b.build, namesOf(b)).recipe
    built.set(id, recipe)
  }
  return recipe
}

/** The colours a present is shown in on its own: Silly Billy's pink with its gold. */
const SHOWN_IN = { main: palette.blooms[0], second: palette.blooms[1] }

/** A present's model from the library (scene/presents.ts, fetched and built once for every screen), painted SHOWN_IN; null when it cannot be built. */
export async function presentRecipe(source: LibrarySource, id: string): Promise<Recipe | null> {
  const recipe = await loadPresent(source, id)
  return recipe === null ? null : inColours(recipe, SHOWN_IN)
}
