/**
 * The starting wardrobe as the scene and the sim use it (scene/dress.ts Wardrobe): a gallery face
 * (profiles/src/avatar.ts) dressed as the house's kid, and each starting piece's model by its id.
 *
 * The skin and hair colours are the house's own for each of the gallery's choices. The gallery
 * paints its faces flat; the house lights its kids from high on the left, which darkens every side
 * a face turns from the sun, so these are a little lighter and clearer than the flat ones, picked
 * by eye against the gallery's faces so a child knows their own kid.
 */

import type { Avatar } from '../../../../profiles/src/avatar'
import type { Recipe } from '../../../../silly-billy/src/engine/types'
import type { FaceDress, Wardrobe } from '../../scene/dress'
import type { Wearing } from '../../saves'
import { onCurls, PIECES, type PieceName } from './pieces'

/** The kid's skin for each of the gallery's skins, '#rrggbb'. */
export const SKIN_COLOURS: Readonly<Record<Avatar['skin'], string>> = {
  milk: '#ffe2c8',
  peach: '#ffcfa8',
  honey: '#f0b98a',
  caramel: '#d6955f',
  cocoa: '#a06a42',
  coffee: '#74492e',
}

/** The kid's hair for each of the gallery's hair colours, '#rrggbb'. */
export const HAIR_COLOURS: Readonly<Record<Avatar['hairColour'], string>> = {
  brown: '#8a5732',
  black: '#3a3444',
  blonde: '#f7d665',
  ginger: '#e77a36',
  pink: '#ff8fc5',
  blue: '#55bdf3',
  purple: '#a277ff',
  green: '#55c973',
}

/** The piece each of the gallery's hair styles is; null for none. */
export const HAIR_PIECES: Readonly<Record<Avatar['hair'], PieceName | null>> = {
  short: 'hair-short',
  long: 'hair-long',
  bob: 'hair-bob',
  pigtails: 'hair-pigtails',
  bun: 'hair-bun',
  curly: 'hair-curly',
  spiky: 'hair-spiky',
  none: null,
}

/** The piece each of the gallery's extras is; null for none. */
export const EXTRA_PIECES: Readonly<Record<Avatar['extra'], PieceName | null>> = {
  none: null,
  'cat-ears': 'cat-ears',
  'bunny-ears': 'bunny-ears',
  crown: 'crown',
  bow: 'bow',
  cap: 'cap',
  glasses: 'glasses',
  flower: 'flower',
}

/** What a starting piece's id starts with (saves.ts Wearing.id), and what a head piece worn on the curls ends with. */
const OWN = 'own:'
const CURLS = '@curls'

/** A starting piece's id; `curls` for a head piece worn on the curls (pieces.ts ON_CURLS). */
export const pieceId = (name: PieceName, curls: boolean) => `${OWN}${name}${curls ? CURLS : ''}`

/** The piece an id names and whether it is worn on the curls, or null when it is not a starting piece's. */
export function pieceOf(id: string): { name: PieceName; curls: boolean } | null {
  if (!id.startsWith(OWN)) return null
  const curls = id.endsWith(CURLS)
  const name = id.slice(OWN.length, curls ? -CURLS.length : undefined)
  if (!Object.hasOwn(PIECES, name)) return null
  const piece = PIECES[name as PieceName]
  return curls && piece.slot !== 'head' ? null : { name: name as PieceName, curls }
}

/** Each piece is built once, the first time it is asked for, by its id. */
const builtModels = new Map<string, Recipe>()

function recipe(id: string): Recipe | null {
  const known = pieceOf(id)
  if (known === null) return null
  let made = builtModels.get(id)
  if (made === undefined) {
    const plain = PIECES[known.name].make().recipe
    made = known.curls ? onCurls(plain) : plain
    builtModels.set(id, made)
  }
  return made
}

function dress(avatar: Avatar): FaceDress {
  const hair = HAIR_COLOURS[avatar.hairColour]
  const wear: FaceDress['wear'] = {}
  for (const name of [HAIR_PIECES[avatar.hair], EXTRA_PIECES[avatar.extra]]) {
    if (name === null) continue
    const piece = PIECES[name]
    const worn: Wearing = { id: pieceId(name, piece.slot === 'head' && avatar.hair === 'curly'), ...piece.colours(hair), pattern: 'plain' }
    wear[piece.slot] = worn
  }
  return { skin: SKIN_COLOURS[avatar.skin], wear }
}

export const WARDROBE: Wardrobe = { dress, recipe }
