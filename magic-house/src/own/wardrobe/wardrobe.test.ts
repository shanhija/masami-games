import { describe, expect, it } from 'vitest'

import { PARTS, type Avatar } from '../../../../profiles/src/avatar'
import { MAX_PARTS, MAX_SHAPES } from '../../../../silly-billy/src/engine/kit'
import type { Vec3 } from '../../../../silly-billy/src/engine/types'
import { BROW_SPOT, EYE_SPOTS, facePoint, GIFT_MARKERS, GIFT_SHAPES } from '../../engine/gift'
import { coverTest } from '../../trial/giftCheck'
import { onCurls, PIECE_NAMES, PIECES } from './pieces'
import { EXTRA_PIECES, HAIR_COLOURS, HAIR_PIECES, pieceId, SKIN_COLOURS, WARDROBE } from './wardrobe'

const HEX = /^#[0-9a-f]{6}$/

/** A face as the gallery stores it, with the parts given. */
const face = (parts: Partial<Avatar>): Avatar => ({ backdrop: 'sky', skin: 'peach', hair: 'short', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'none', ...parts })

/** Points of the face that must stay seen (engine/gift.ts facePoint): each eye's middle, sides, top and bottom, and each brow. */
const EYES: Vec3[] = [-1, 1].flatMap((side) => EYE_SPOTS.map(([around, up]) => [...facePoint(side as -1 | 1, around, up)] as Vec3))
const BROWS: Vec3[] = [-1, 1].map((side) => [...facePoint(side as -1 | 1, BROW_SPOT[0], BROW_SPOT[1])] as Vec3)
/** Silly Billy's cap comes down to the brows, as it does in Silly Billy: its brim is over them, the eyes stay seen. */
const OVER_BROWS = new Set(['cap'])

describe('the starting wardrobe', () => {
  it.each(PIECE_NAMES)('%s builds within the kit with no notes, in its own slot', (name) => {
    const piece = PIECES[name]
    const { recipe, notes } = piece.make()
    expect(notes).toEqual([])
    expect(recipe.shapes.length).toBeGreaterThan(0)
    expect(recipe.shapes.length).toBeLessThanOrEqual(Math.min(GIFT_SHAPES, MAX_SHAPES))
    expect(recipe.parts.length).toBeLessThanOrEqual(MAX_PARTS)
    expect(recipe.meta.wear).toBe(piece.slot)
    // Painted so the scene can colour it: its main colour is the marker.
    expect(recipe.shapes.some((s) => s.color === GIFT_MARKERS.main)).toBe(true)
    // It stays near the head: nothing past 0.85 m from its middle (the bunny's ears are the tallest), and on the curls 1.15 m.
    for (const v of [...recipe.bounds.min, ...recipe.bounds.max]) expect(Math.abs(v)).toBeLessThan(0.85)
    if (piece.slot === 'head') for (const v of Object.values(onCurls(recipe).bounds).flat()) expect(Math.abs(v)).toBeLessThan(1.15)
  })

  it.each(PIECE_NAMES.filter((n) => PIECES[n].slot !== 'face'))('%s leaves the eyes and brows seen, on the curls too', (name) => {
    const made = PIECES[name].make().recipe
    for (const recipe of PIECES[name].slot === 'head' ? [made, onCurls(made)] : [made]) {
      const covered = coverTest(recipe)
      const hidden = (OVER_BROWS.has(name) ? EYES : [...EYES, ...BROWS]).filter(covered)
      expect(hidden).toEqual([])
    }
  })

  it('maps every hair style and every extra of the gallery to a piece, every piece to a part', () => {
    for (const hair of PARTS.hair) expect(hair === 'none' ? HAIR_PIECES[hair] === null : PIECES[HAIR_PIECES[hair]!].slot === 'hair').toBe(true)
    for (const extra of PARTS.extra) expect(extra === 'none' ? EXTRA_PIECES[extra] === null : EXTRA_PIECES[extra] !== null).toBe(true)
    const used = new Set([...Object.values(HAIR_PIECES), ...Object.values(EXTRA_PIECES)])
    for (const name of PIECE_NAMES) expect(used.has(name)).toBe(true)
    for (const skin of PARTS.skin) expect(SKIN_COLOURS[skin]).toMatch(HEX)
    for (const colour of PARTS.hairColour) expect(HAIR_COLOURS[colour]).toMatch(HEX)
  })

  it('dresses a face in its skin, its hair in its hair colour, and its extra', () => {
    const d = WARDROBE.dress(face({ skin: 'cocoa', hair: 'bun', hairColour: 'pink', extra: 'glasses' }))
    expect(d.skin).toBe(SKIN_COLOURS.cocoa)
    expect(d.wear.hair).toEqual({ id: pieceId('hair-bun', false), main: HAIR_COLOURS.pink, second: expect.stringMatching(HEX), pattern: 'plain' })
    expect(d.wear.face?.id).toBe(pieceId('glasses', false))
    expect(Object.keys(d.wear).sort()).toEqual(['face', 'hair'])
    // Cat ears are the hair's colour, as the gallery draws them.
    expect(WARDROBE.dress(face({ hairColour: 'ginger', extra: 'cat-ears' })).wear.head?.main).toBe(HAIR_COLOURS.ginger)
    expect(WARDROBE.dress(face({ hair: 'none', extra: 'none' })).wear).toEqual({})
    // On the curls a head piece is worn grown, the glasses as they are.
    expect(WARDROBE.dress(face({ hair: 'curly', extra: 'crown' })).wear.head?.id).toBe(pieceId('crown', true))
    expect(WARDROBE.dress(face({ hair: 'curly', extra: 'glasses' })).wear.face?.id).toBe(pieceId('glasses', false))
  })

  it('gives every face something the scene can draw for each slot it wears', () => {
    for (const hair of PARTS.hair)
      for (const extra of PARTS.extra) {
        const d = WARDROBE.dress(face({ hair, extra }))
        for (const w of Object.values(d.wear)) {
          expect(w.main).toMatch(HEX)
          expect(w.second).toMatch(HEX)
          expect(WARDROBE.recipe(w.id)).not.toBeNull()
        }
      }
  })

  it('knows only its own ids, and builds each piece once', () => {
    expect(WARDROBE.recipe('own:hat-of-nothing')).toBeNull()
    expect(WARDROBE.recipe('hair-short')).toBeNull()
    expect(WARDROBE.recipe('own:toString')).toBeNull()
    // Only a head piece is worn on the curls.
    expect(WARDROBE.recipe('own:glasses@curls')).toBeNull()
    expect(WARDROBE.recipe(pieceId('crown', true))).toBe(WARDROBE.recipe(pieceId('crown', true)))
  })
})
