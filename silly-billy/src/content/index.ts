/**
 * Silly Billy's built-in content, as the rest of the game sees it: every thing it ships with,
 * the basic verbs and the group games, the starting cast and the names for new avatars, and
 * where each room's things stand.
 */

import type { BuiltinAction, BuiltinItem } from '../engine/library'
import { BASIC_VERBS } from './actions'
import { GAMES } from './games'
import { FOREST_ITEMS } from './items/forest'
import { PEOPLE_ITEMS } from './items/people'
import { PLAYGROUND_ITEMS } from './items/playground'
import { POOL_ITEMS } from './items/pool'

export const BUILTIN_ITEMS: BuiltinItem[] = [...PLAYGROUND_ITEMS, ...POOL_ITEMS, ...FOREST_ITEMS, ...PEOPLE_ITEMS]
export const BUILTIN_ACTIONS: BuiltinAction[] = [...BASIC_VERBS, ...GAMES]
export { BASIC_VERBS, GAMES }
export { CAST, NEW_NAMES, castNamesFor, makeCast } from './cast'
export { colorOf } from './colors'
export { LAYOUTS } from './layouts'
