import { describe, expect, it } from 'vitest'

import type { Avatar } from '../../../../profiles/src/avatar'
import { buildRecipe } from '../../../../silly-billy/src/engine/kit'
import type { Recipe } from '../../../../silly-billy/src/engine/types'
import { GIFT_MARKERS } from '../../engine/gift'
import { HAIR_COLOURS, WARDROBE } from '../../own/wardrobe/wardrobe'
import type { GiftEntry } from '../../protocol'
import type { Wear } from '../../saves'
import { SEAT_COLORS } from '../../seats/types'
import { BARE, wornOver, type WornModels } from '../../scene/dress'
import { faceDress, partyFrom } from '../play'
import { PATTERN_ORDER } from '../../patterns/patterns'
import { ACROSS, act, closetOf, fixFocus, itemsAcross, moveFocus, paint, paints, paintsOf, putOn, rowsOf, startColumn, type Column, type Row } from './choose'
import { COLOURS, COLOUR_ORDER, nearestColour, presentColours } from './colours'

const CURLY: Avatar = { backdrop: 'mint', skin: 'milk', hair: 'curly', hairColour: 'ginger', eyes: 'happy', mouth: 'tongue', extra: 'glasses' }
const SHORT: Avatar = { backdrop: 'sky', skin: 'peach', hair: 'short', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'cap' }
const SEAT = '#3d8bff'
const GIFTS: GiftEntry[] = [
  { id: 'cape-1', slot: 'back', name: { en: 'Cape', fi: 'Viitta' }, room: 'r1' },
  { id: 'wand-2', slot: 'hand', name: { en: 'Wand', fi: 'Taikasauva' }, room: 'r1' },
  { id: 'hat-3', slot: 'head', name: { en: 'Hat', fi: 'Hattu' }, room: 'r2' },
]
/** A present's model that paints only with c.main. */
const MAIN_ONLY: Recipe = buildRecipe((m) => {
  m.box(0.3, 0.3, 0.3, { color: GIFT_MARKERS.main })
  return {}
}, ['back']).recipe
const models: WornModels = (id) => (id === 'cape-1' ? MAIN_ONLY : WARDROBE.recipe(id))

const closet = (face: Avatar | null, owned: string[] = []) => closetOf(face, faceDress(face), SEAT, owned, GIFTS, 2)

describe('the closet', () => {
  it('holds nothing first, then the starting pieces of each slot, then the presents owned, and only slots with something to hold', () => {
    const c = closet(SHORT, ['wand-2', 'hat-3'])
    expect(c.slots).toEqual(['hair', 'head', 'face', 'hand'])
    expect(c.items.hair!.map((i) => i.id)).toEqual([BARE, 'own:hair-short', 'own:hair-long', 'own:hair-bob', 'own:hair-pigtails', 'own:hair-bun', 'own:hair-curly', 'own:hair-spiky'])
    expect(c.items.head!.at(-1)).toEqual({ id: 'hat-3', gift: GIFTS[2] })
    expect(c.items.face!.map((i) => i.id)).toEqual([BARE, 'own:glasses'])
    expect(c.items.hand!.map((i) => i.id)).toEqual([BARE, 'wand-2'])
    expect(c.hair).toBe(HAIR_COLOURS.brown)
  })

  it('leaves out a present owned that the library no longer lists', () => {
    expect(closet(SHORT, ['gone-9']).slots).toEqual(['hair', 'head', 'face'])
  })
})

describe('what a slot can hold', () => {
  it('keeps the hair colour when the hairstyle changes, and gives any other thing its own colours', () => {
    const c = closet(SHORT)
    const wear = putOn(c, {}, 'hair', 'own:hair-bob')
    expect(wear.hair).toEqual({ id: 'own:hair-bob', main: HAIR_COLOURS.brown, second: c.face.hair!.second, pattern: 'plain' })
    const crown = putOn(c, wear, 'head', 'own:crown')
    expect(crown.head!.main).toBe('#ffd23f')
    expect(putOn(c, {}, 'back', 'cape-1').back).toEqual({ id: 'cape-1', ...presentColours(SEAT), pattern: 'plain' })
  })

  it('wears nothing in a slot the face fills by BARE, which is never drawn', () => {
    const c = closet(SHORT)
    const wear = putOn(c, {}, 'head', BARE)
    expect(wear.head!.id).toBe(BARE)
    expect(wornOver(c.face, wear).head).toBeUndefined()
    expect(partyFrom([{ index: 0, color: SEAT, device: { kind: 'keys', zone: 0 }, profile: null }], () => SHORT, () => wear)[0]!.wear.head).toBeUndefined()
  })

  it('changes nothing when what is worn is chosen again', () => {
    const c = closet(SHORT)
    const wear: Wear = {}
    expect(putOn(c, wear, 'hair', 'own:hair-short')).toBe(wear)
    expect(putOn(closet(null), wear, 'hand', BARE)).toBe(wear)
  })

  it('wears a head piece on the curls exactly while the hair is curly', () => {
    const c = closet(CURLY)
    const crown = putOn(c, {}, 'head', 'own:crown')
    expect(crown.head!.id).toBe('own:crown@curls')
    const short = putOn(c, crown, 'hair', 'own:hair-short')
    expect(short.head!.id).toBe('own:crown')
    expect(putOn(c, short, 'hair', 'own:hair-curly').head!.id).toBe('own:crown@curls')
    // The cap the face gives, worn on the curls, comes off them with the hair.
    const capped = closet({ ...SHORT, hair: 'curly' })
    expect(capped.face.head!.id).toBe('own:cap@curls')
    expect(putOn(capped, {}, 'hair', 'own:hair-bun').head!.id).toBe('own:cap')
  })

  it('paints what is worn, and refuses to paint nothing', () => {
    const c = closet(SHORT)
    expect(paint(c, {}, 'hair', 'main', COLOURS.rose).hair!.main).toBe(COLOURS.rose)
    expect(paint(c, {}, 'head', 'second', COLOURS.teal).head).toEqual({ ...c.face.head!, second: COLOURS.teal })
    expect(() => paint(c, {}, 'hand', 'main', COLOURS.red)).toThrow(/nothing is worn/)
  })
})

describe('the colours', () => {
  it('are sixteen of the form #rrggbb, none a marker or near one', () => {
    expect(COLOUR_ORDER).toHaveLength(16)
    for (const name of COLOUR_ORDER) {
      expect(COLOURS[name]).toMatch(/^#[0-9a-f]{6}$/)
      expect(nearestColour(COLOURS[name], COLOUR_ORDER)).toBe(name)
    }
    expect([GIFT_MARKERS.main, GIFT_MARKERS.second].some((m) => Object.values(COLOURS).includes(m))).toBe(false)
  })

  it('give a present a bright colour near the seat colour made lighter, with the seat colour nearest in the set as its second', () => {
    const { 0: red, 1: blue, 2: yellow, 3: green } = SEAT_COLORS
    expect(presentColours(red)).toEqual({ main: COLOURS.pink, second: COLOURS.red })
    expect(presentColours(blue)).toEqual({ main: COLOURS.sky, second: COLOURS.blue })
    expect(presentColours(yellow)).toEqual({ main: COLOURS.pink, second: COLOURS.yellow })
    expect(presentColours(green)).toEqual({ main: COLOURS.lime, second: COLOURS.green })
  })

  it('lay fewer swatches a line in narrow columns, so each stays big enough to tap', () => {
    expect(closet(SHORT).coloursAcross).toBe(ACROSS.colours)
    expect(closetOf(SHORT, faceDress(SHORT), SEAT, [], GIFTS, 4).coloursAcross).toBe(ACROSS.narrowColours)
  })

  it('offer to paint only a colour the worn thing paints with, and a pattern on its main colour anywhere but on hair', () => {
    expect(paints(MAIN_ONLY)).toEqual({ main: true, second: false })
    expect(paints(null)).toEqual({ main: true, second: true })
    const c = closet(SHORT, ['cape-1'])
    const col = (slot: Column['slot'], wear: Wear = {}): Column => ({ ...startColumn(c, wear, [], null), slot })
    // Silly Billy's short hair paints only its main colour, and hair carries no pattern; the cap the face gives paints both, with a pattern on its main.
    const paintRow = (column: Column) => rowsOf(c, column, models).find((r) => r.kind === 'paint')
    expect(rowsOf(c, col('hair'), models).map((r) => r.kind)).toEqual(['slots', 'items', 'paint', 'colours', 'thumb', 'ready'])
    expect(paintRow(col('hair'))!.count).toBe(1)
    expect(paintRow(col('head'))!.count).toBe(3)
    expect(paintsOf(c, col('head'), models)).toEqual(['main', 'second', 'pattern'])
    expect(paintsOf(c, col('back', putOn(c, {}, 'back', 'cape-1')), models)).toEqual(['main', 'pattern'])
    // A thing painting only its second colour has no main to lay a pattern on.
    const secondOnly: WornModels = (id) => (id === 'cape-1' ? { ...MAIN_ONLY, shapes: MAIN_ONLY.shapes.map((s) => ({ ...s, color: GIFT_MARKERS.second })) } : models(id))
    expect(paintsOf(c, col('back', putOn(c, {}, 'back', 'cape-1')), secondOnly)).toEqual(['second'])
    expect(rowsOf(c, col('back'), models).map((r) => r.kind)).toEqual(['slots', 'items', 'thumb', 'ready'])
  })
})

describe('the ring', () => {
  const rows: Row[] = [
    { kind: 'slots', count: 3, across: 3 },
    { kind: 'items', count: 6, across: ACROSS.items },
    { kind: 'colours', count: 16, across: ACROSS.colours },
    { kind: 'thumb', count: 2, across: 2 },
    { kind: 'ready', count: 1, across: 1 },
  ]

  it('walks across a line and stops at its ends', () => {
    expect(moveFocus(rows, { row: 'items', at: 0 }, 'left')).toEqual({ row: 'items', at: 0 })
    expect(moveFocus(rows, { row: 'items', at: 3 }, 'right')).toEqual({ row: 'items', at: 4 })
    expect(moveFocus(rows, { row: 'thumb', at: 1 }, 'right')).toEqual({ row: 'thumb', at: 1 })
  })

  it('goes down a grid line by line, onto a short last line, and on to the row below at the cell under it', () => {
    expect(moveFocus(rows, { row: 'items', at: 1 }, 'down')).toEqual({ row: 'items', at: 5 })
    expect(moveFocus(rows, { row: 'items', at: 3 }, 'down')).toEqual({ row: 'items', at: 5 })
    expect(moveFocus(rows, { row: 'items', at: 5 }, 'down')).toEqual({ row: 'colours', at: 3 })
    expect(moveFocus(rows, { row: 'colours', at: 15 }, 'down')).toEqual({ row: 'thumb', at: 1 })
    expect(moveFocus(rows, { row: 'ready', at: 0 }, 'down')).toEqual({ row: 'ready', at: 0 })
  })

  it('goes up onto the last line of the row above', () => {
    expect(moveFocus(rows, { row: 'thumb', at: 0 }, 'up')).toEqual({ row: 'colours', at: 10 })
    expect(moveFocus(rows, { row: 'colours', at: 0 }, 'up')).toEqual({ row: 'items', at: 4 })
    expect(moveFocus(rows, { row: 'slots', at: 2 }, 'up')).toEqual({ row: 'slots', at: 2 })
  })

  it('falls to the next row down when its row is gone', () => {
    expect(fixFocus(rows, { row: 'paint', at: 9 })).toEqual({ row: 'colours', at: 9 })
    expect(fixFocus(rows, { row: 'items', at: 40 })).toEqual({ row: 'items', at: 5 })
  })

  it('walks a slot that gathered presents in at most two lines, more to a line, as the stylesheet lays them', () => {
    expect([1, 8, 9, 12, 15].map(itemsAcross)).toEqual([4, 4, 5, 6, 8])
    // The hair's eight and a present: nine things, five to a line, and down from the first line's end onto the short last line.
    const clips: GiftEntry = { id: 'clips-4', slot: 'hair', name: { en: 'Clips', fi: 'Pinnit' }, room: 'r3' }
    const c = closetOf(SHORT, faceDress(SHORT), SEAT, ['clips-4'], [clips], 3)
    const hair = rowsOf(c, { ...startColumn(c, {}, [], null), slot: 'hair' }, models)
    expect(hair.find((r) => r.kind === 'items')).toEqual({ kind: 'items', count: 9, across: 5 })
    expect(moveFocus(hair, { row: 'items', at: 1 }, 'down')).toEqual({ row: 'items', at: 6 })
    expect(moveFocus(hair, { row: 'items', at: 4 }, 'down')).toEqual({ row: 'items', at: 8 })
  })
})

describe('a column', () => {
  it('opens with the present just got put on in its slot, ringed, in the colours the end showed it in', () => {
    const c = closet(SHORT, ['wand-2', 'hat-3'])
    const got = startColumn(c, {}, ['wand-2', 'hat-3'], 'wand-2')
    expect(got).toMatchObject({ slot: 'hand', focus: { row: 'items', at: c.items.hand!.length - 1 }, thumb: null, ready: false })
    expect(got.wear).toEqual({ hand: { id: 'wand-2', ...presentColours(SEAT), pattern: 'plain' } })
    // None given (the end had none to give): the newest owned is ringed, not put on.
    expect(startColumn(c, {}, ['wand-2', 'hat-3'], null)).toMatchObject({ wear: {}, slot: 'head', focus: { row: 'items', at: c.items.head!.length - 1 }, thumb: null, ready: false })
    expect(startColumn(c, {}, [], null)).toMatchObject({ slot: 'hair', focus: { row: 'items', at: 1 } })
  })

  it('is dressed by the stick and a, shows a slot as the ring passes it, and gives a thumb and Ready', () => {
    const c = closet(SHORT, ['wand-2'])
    let col = startColumn(c, {}, [], null)
    const go = (...what: Parameters<typeof act>[3][]) => {
      for (const w of what) col = act(c, col, models, w).column
    }
    go({ kind: 'move', dir: 'right' }, { kind: 'a' })
    expect(col.wear.hair!.id).toBe('own:hair-long')
    go({ kind: 'move', dir: 'up' })
    expect(col.focus).toEqual({ row: 'slots', at: 0 })
    go({ kind: 'move', dir: 'right' }, { kind: 'move', dir: 'right' }, { kind: 'move', dir: 'right' })
    expect(col.slot).toBe('hand')
    go({ kind: 'move', dir: 'down' })
    expect(col.focus).toEqual({ row: 'items', at: 0 })
    go({ kind: 'move', dir: 'right' }, { kind: 'a' })
    expect(col.wear.hand).toEqual({ id: 'wand-2', ...presentColours(SEAT), pattern: 'plain' })
    // The wand's model is not loaded here, so it paints with both and has a pattern: down onto the paint row, across to its second colour (the middle of three), down onto the grid under it.
    go({ kind: 'move', dir: 'down' })
    expect([col.focus, col.paint]).toEqual([{ row: 'paint', at: 0 }, 'main'])
    go({ kind: 'move', dir: 'right' })
    expect([col.focus, col.paint]).toEqual([{ row: 'paint', at: 1 }, 'second'])
    go({ kind: 'move', dir: 'down' }, { kind: 'a' })
    expect(col.focus).toEqual({ row: 'colours', at: 4 })
    expect(col.wear.hand!.second).toBe(COLOURS[COLOUR_ORDER[4]!])
    expect(col.wear.hand!.main).toBe(presentColours(SEAT).main)
    // a on a paint rings the colour it has in the grid.
    go({ kind: 'move', dir: 'up' }, { kind: 'move', dir: 'left' }, { kind: 'a' })
    expect([col.focus, col.paint]).toEqual([{ row: 'colours', at: COLOUR_ORDER.indexOf('sky') }, 'main'])
    go({ kind: 'move', dir: 'down' }, { kind: 'move', dir: 'down' }, { kind: 'move', dir: 'left' }, { kind: 'a' })
    expect(col.focus.row).toBe('thumb')
    expect(col.thumb).toBe('up')
    go({ kind: 'move', dir: 'down' }, { kind: 'a' })
    expect(col.ready).toBe(true)
  })

  it('stays as it is while ready, until b or a tap on Ready takes it back; b otherwise lifts the ring a row', () => {
    const c = closet(SHORT)
    let col = act(c, startColumn(c, {}, [], null), models, { kind: 'tap', row: 'ready', at: 0 }).column
    expect(col.ready).toBe(true)
    expect(act(c, col, models, { kind: 'tap', row: 'items', at: 3 }).column).toBe(col)
    expect(act(c, col, models, { kind: 'a' }).column).toBe(col)
    col = act(c, col, models, { kind: 'b' }).column
    expect(col.ready).toBe(false)
    expect(act(c, col, models, { kind: 'b' }).column.focus.row).toBe('thumb')
    const tapped = act(c, col, models, { kind: 'tap', row: 'items', at: 3 })
    expect(tapped.column.wear.hair!.id).toBe('own:hair-bob')
    expect(tapped.sound).toBe('magic')
    expect(act(c, { ...col, ready: true }, models, { kind: 'tap', row: 'ready', at: 0 }).column.ready).toBe(false)
  })

  it('lays a pattern by the stick and a: the pattern cell of the paint row turns the grid to the patterns, ringing the one worn, and a puts one on', () => {
    const c = closet(SHORT, ['cape-1'])
    let col = startColumn(c, {}, ['cape-1'], 'cape-1')
    const go = (...what: Parameters<typeof act>[3][]) => {
      for (const w of what) col = act(c, col, models, w).column
    }
    expect(col.wear.back!.pattern).toBe('plain')
    // The cape paints only main: the paint row is its colour and its pattern.
    go({ kind: 'move', dir: 'down' }, { kind: 'move', dir: 'right' })
    expect([col.focus, col.paint]).toEqual([{ row: 'paint', at: 1 }, 'pattern'])
    expect(rowsOf(c, col, models).find((r) => r.kind === 'colours')).toEqual({ kind: 'colours', count: PATTERN_ORDER.length, across: ACROSS.patterns })
    go({ kind: 'a' })
    expect(col.focus).toEqual({ row: 'colours', at: PATTERN_ORDER.indexOf('plain') })
    go({ kind: 'move', dir: 'right' }, { kind: 'move', dir: 'right' }, { kind: 'a' })
    expect(col.wear.back).toEqual({ ...col.wear.back!, pattern: PATTERN_ORDER[2], main: presentColours(SEAT).main })
    // Back on the paint row and on to its colour: the grid is the colours again, the pattern kept.
    go({ kind: 'move', dir: 'up' }, { kind: 'move', dir: 'left' })
    expect(rowsOf(c, col, models).find((r) => r.kind === 'colours')!.count).toBe(COLOUR_ORDER.length)
    go({ kind: 'move', dir: 'down' }, { kind: 'a' })
    expect(col.wear.back!.pattern).toBe(PATTERN_ORDER[2])
    // A tap on the pattern cell, then on a pattern, does the same; in narrow columns the patterns lie fewer a line.
    const narrow = closetOf(SHORT, faceDress(SHORT), SEAT, ['cape-1'], GIFTS, 4)
    let tapped = act(narrow, startColumn(narrow, {}, ['cape-1'], 'cape-1'), models, { kind: 'tap', row: 'paint', at: 1 }).column
    expect(rowsOf(narrow, tapped, models).find((r) => r.kind === 'colours')!.across).toBe(ACROSS.narrowPatterns)
    tapped = act(narrow, tapped, models, { kind: 'tap', row: 'colours', at: 5 }).column
    expect(tapped.wear.back!.pattern).toBe(PATTERN_ORDER[5])
    // A pattern the set no longer has is ringed as plain.
    const old = act(narrow, { ...tapped, wear: { back: { ...tapped.wear.back!, pattern: 'tartan' } } }, models, { kind: 'tap', row: 'paint', at: 1 }).column
    expect(old.focus).toEqual({ row: 'colours', at: 0 })
  })

  it('puts a new thing on plain, whatever pattern the thing before it had', () => {
    const c = closet(SHORT, ['cape-1', 'hat-3'])
    const capped = paint(c, {}, 'head', 'pattern', 'stars')
    expect(capped.head!.pattern).toBe('stars')
    expect(putOn(c, capped, 'head', 'hat-3').head!.pattern).toBe('plain')
  })

  it('gives back only the slots it changed, so the rest keep following the gallery face', () => {
    const c = closet(SHORT)
    const col = act(c, startColumn(c, {}, [], null), models, { kind: 'tap', row: 'colours', at: 5 }).column
    expect(Object.keys(col.wear)).toEqual(['hair'])
  })
})
