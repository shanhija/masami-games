/**
 * Colour words: what a child says, in Finnish or English, as a colour the kit takes. The
 * paint, wear and make verbs read their colour through this, so 'punaiseksi', 'sininen',
 * 'pink' and '#ff69b4' all work; the parser can use it to spot colours in what was heard.
 * Only the game's own colour names count, not every CSS one a designer may use: a child
 * saying 'seashell' means a thing, and 'peru' (cancel) is no colour at all.
 */

import { BASIC_COLORS, parseColor } from '../engine/kit'

/** Finnish colour stems and the colour each means: a word starting with the stem is that colour. */
export const FINNISH_COLORS: readonly (readonly [string, string])[] = [
  ['vaaleanpuna', 'pink'], ['tummanpuna', 'darkred'], ['pinkk', 'hotpink'], ['pinki', 'hotpink'], ['roosa', 'pink'], ['puna', 'red'],
  ['vaaleansini', 'lightblue'], ['tummansini', 'navy'], ['taivaansini', 'skyblue'], ['sini', 'blue'], ['turkoo', 'turquoise'],
  ['vaaleanvihr', 'lightgreen'], ['tummanvihr', 'darkgreen'], ['vihr', 'green'], ['lime', 'lime'],
  ['kelt', 'yellow'], ['orans', 'orange'], ['violet', 'violet'], ['liila', 'lilac'], ['lila', 'lilac'], ['purppura', 'purple'],
  ['musta', 'black'], ['valko', 'white'], ['valkea', 'white'], ['harmaa', 'grey'], ['rusk', 'brown'],
  ['kulta', 'gold'], ['kulla', 'gold'], ['hopea', 'silver'], ['hopei', 'silver'], ['beige', 'beige'],
]

/** A Finnish colour word in English, for the line the parent reads ('punaiseksi' → 'red'), or null when it is none. */
export function englishColor(word: string): string | null {
  const w = word.toLowerCase().replace(/\s+/g, '')
  return FINNISH_COLORS.find(([stem]) => w.startsWith(stem))?.[1] ?? null
}

/** The colour a word means, as '#rrggbb', or null when it is no colour. */
export function colorOf(word: string | null): string | null {
  if (word === null) return null
  const w = word.toLowerCase().replace(/\s+/g, '')
  // Hex only with its '#': '100' is a number and 'bad' a word.
  if (w.startsWith('#')) return parseColor(w)
  const fi = FINNISH_COLORS.find(([stem]) => w.startsWith(stem))
  return BASIC_COLORS.get(fi ? fi[1] : w) ?? null
}
