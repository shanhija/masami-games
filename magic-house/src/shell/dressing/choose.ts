/**
 * The dressing room's choosing, as pure functions over plain data (plan.md, A visit; The look,
 * people and presents; Each child gives a thumb), so vitest holds every rule.
 *
 * Each player has a closet: for every slot they can dress, what it can hold (wearing nothing there,
 * the starting wardrobe's pieces for that slot, and the presents they own for it). Their column of
 * the screen is a few rows: the slots, the slot's things, what to paint (each of its two colours the
 * thing paints with, and the pattern on its main colour), the house's colours or patterns for it, the
 * thumb for the room, and Ready. One grid serves both colours and the pattern, so its swatches can be
 * big enough for a child's finger. A seat moves a ring over the rows with its stick, a chooses what is ringed and b goes back;
 * a tap chooses a cell at once. What they wear comes back as saves.ts Wear: only the slots they
 * changed are in it, so a slot never touched keeps following their gallery face.
 */

import type { Avatar } from '../../../../profiles/src/avatar'
import { SLOTS, type Recipe, type Slot, type SoundName } from '../../../../silly-billy/src/engine/types'
import { GIFT_MARKERS } from '../../engine/gift'
import { PIECES, type PieceName } from '../../own/wardrobe/pieces'
import { HAIR_COLOURS, pieceId, pieceOf } from '../../own/wardrobe/wardrobe'
import type { GiftEntry } from '../../protocol'
import type { Thumb, Wear, Wearing } from '../../saves'
import { BARE, wornOver, type FaceDress, type WornModels } from '../../scene/dress'
import { PATTERN_ORDER, PLAIN, patterned, patternOf } from '../../patterns/patterns'
import { COLOURS, COLOUR_ORDER, presentColours } from './colours'

/** One thing a slot can hold: wearing nothing (BARE), a starting piece (its id off the curls) or a present the player owns. */
export interface ItemChoice {
  readonly id: string
  /** The present's entry, for its name; null for BARE and a starting piece. */
  readonly gift: GiftEntry | null
}

/** What one player can wear. */
export interface Closet {
  /** What their gallery face gives, by slot (scene/dress.ts FaceDress). */
  readonly face: FaceDress['wear']
  /** Their face's hair colour, for a piece that takes it (cat ears) when no hair is worn. */
  readonly hair: string
  /** Their seat's colour, for the colours a present is first worn in. */
  readonly seatColour: string
  /** The slots they can dress, in Silly Billy's order: those with anything but BARE to hold. */
  readonly slots: readonly Slot[]
  /** What each of those slots can hold, BARE first, then the starting pieces, then their presents oldest first. */
  readonly items: Readonly<Partial<Record<Slot, readonly ItemChoice[]>>>
  /** How many swatches a line of the colour grid holds: fewer when the columns are narrow, so each stays big enough to tap. */
  readonly coloursAcross: number
  /** How many a line of the grid holds when it shows the patterns. */
  readonly patternsAcross: number
}

/** The rows of a column, top to bottom: 'paint' chooses what the 'colours' grid paints, one of the thing's two colours (its swatches the house's colours) or its pattern (the house's patterns). */
export type RowKind = 'slots' | 'items' | 'paint' | 'colours' | 'thumb' | 'ready'
const ROW_ORDER: readonly RowKind[] = ['slots', 'items', 'paint', 'colours', 'thumb', 'ready']
/** What of a worn thing the grid paints: one of its two colours (what it paints with GIFT_MARKERS.main or second), or the pattern on its main colour. Each is the Wearing's field of that name. */
export type Paint = 'main' | 'second' | 'pattern'

/** A row as the ring walks it: `count` cells laid `across` to a line, as the stylesheet lays them. */
export interface Row {
  readonly kind: RowKind
  readonly count: number
  readonly across: number
}

/** How many cells a line of the things holds at least and in how many lines at most they lie (itemsAcross), and a line of the colours and the patterns with up to `wideColumns` columns and with more; the stylesheet lays them so (DressingRoom.tsx gives it `--across` and `--lines`). */
export const ACROSS = { items: 4, itemLines: 2, colours: 8, narrowColours: 4, patterns: 6, narrowPatterns: 3, wideColumns: 2 } as const

/** How many of a slot's `count` things a line holds: ACROSS.items, or more and each smaller, so they never take more than ACROSS.itemLines lines and the kid above them keeps its size however many presents a slot gathers. */
export function itemsAcross(count: number): number {
  return Math.max(ACROSS.items, Math.ceil(count / ACROSS.itemLines))
}

/** Where a column's ring is: a row, and a cell in it. */
export interface Focus {
  readonly row: RowKind
  readonly at: number
}

/** One player's column. */
export interface Column {
  /** What they wear from their saves, with what they changed here over it. */
  readonly wear: Wear
  readonly thumb: Thumb
  readonly ready: boolean
  /** The slot whose things the column shows. */
  readonly slot: Slot
  /** What of the thing worn there the grid paints (the first it paints with, when it does not paint with this). */
  readonly paint: Paint
  readonly focus: Focus
}

/** What a seat or a finger does to a column. */
export type Act = { kind: 'move'; dir: 'up' | 'down' | 'left' | 'right' } | { kind: 'a' } | { kind: 'b' } | { kind: 'tap'; row: RowKind; at: number }

// ------------------------------------------------------------------------------ the closet

/** The id a slot's thing is chosen by: a starting piece off the curls (a head piece worn on curly hair is the same choice). */
export function choiceId(id: string): string {
  const piece = pieceOf(id)
  return piece === null ? id : pieceId(piece.name, false)
}

/**
 * What a player can wear: for each slot BARE, the starting wardrobe's pieces of it and the presents
 * they own of it. A present they own that the library no longer lists cannot be drawn, so it is
 * left out with a warning.
 */
export function closetOf(face: Avatar | null, dress: FaceDress, seatColour: string, owned: readonly string[], gifts: readonly GiftEntry[], columns: number): Closet {
  const items: Partial<Record<Slot, ItemChoice[]>> = {}
  const add = (slot: Slot, choice: ItemChoice) => (items[slot] ??= [{ id: BARE, gift: null }]).push(choice)
  for (const name of Object.keys(PIECES) as PieceName[]) add(PIECES[name].slot, { id: pieceId(name, false), gift: null })
  for (const id of owned) {
    const gift = gifts.find((g) => g.id === id)
    if (gift === undefined) console.warn(`Magic House: the present ${id} is owned but not in the library, so the dressing room cannot show it.`)
    else add(gift.slot, { id, gift })
  }
  return {
    face: dress.wear,
    hair: HAIR_COLOURS[face === null ? 'brown' : face.hairColour],
    seatColour,
    slots: SLOTS.filter((s) => items[s] !== undefined),
    items,
    coloursAcross: columns <= ACROSS.wideColumns ? ACROSS.colours : ACROSS.narrowColours,
    patternsAcross: columns <= ACROSS.wideColumns ? ACROSS.patterns : ACROSS.narrowPatterns,
  }
}

/** Which of the two marker colours a worn thing's model paints with (a model not loaded yet: both, so its rows are there when it comes). */
export function paints(recipe: Recipe | null): { main: boolean; second: boolean } {
  if (recipe === null) return { main: true, second: true }
  return { main: recipe.shapes.some((s) => s.color === GIFT_MARKERS.main), second: recipe.shapes.some((s) => s.color === GIFT_MARKERS.second) }
}

// ------------------------------------------------------------------------------ what is worn

/** A head piece of the starting wardrobe is worn on the curls exactly when the hair worn is curly (own/wardrobe/pieces.ts onCurls): kept so after every change. */
function settleCurls(closet: Closet, wear: Wear): Wear {
  const worn = wornOver(closet.face, wear)
  const head = worn.head
  const piece = head === undefined ? null : pieceOf(head.id)
  if (head === undefined || piece === null) return wear
  const curls = worn.hair !== undefined && choiceId(worn.hair.id) === pieceId('hair-curly', false)
  return piece.curls === curls ? wear : { ...wear, head: { ...head, id: pieceId(piece.name, curls) } }
}

/**
 * The wear with `id` put on in `slot`. A new hairstyle keeps the hair's colours; any other thing
 * comes in its own: a starting piece in the colours its piece gives (hair-coloured ears take the
 * hair worn now), a present in presentColours, and plain. Putting on what is already worn changes nothing.
 */
export function putOn(closet: Closet, wear: Wear, slot: Slot, id: string): Wear {
  const now = wornOver(closet.face, wear)[slot]
  if (now === undefined ? id === BARE : choiceId(now.id) === id) return wear
  const hair = wornOver(closet.face, wear).hair
  const piece = pieceOf(id)
  const colours =
    id === BARE
      ? { main: now!.main, second: now!.second }
      : slot === 'hair' && now !== undefined
        ? { main: now.main, second: now.second }
        : piece !== null
          ? PIECES[piece.name].colours(hair === undefined ? closet.hair : hair.main)
          : presentColours(closet.seatColour)
  const wearing: Wearing = { id, main: colours.main, second: colours.second, pattern: PLAIN }
  return settleCurls(closet, { ...wear, [slot]: wearing })
}

/** The wear with the thing worn in `slot` painted `value` as `which`: a colour of the set as its main or second colour, or a pattern of the set as its pattern. */
export function paint(closet: Closet, wear: Wear, slot: Slot, which: Paint, value: string): Wear {
  const now = wornOver(closet.face, wear)[slot]
  if (now === undefined) throw new Error(`nothing is worn in the ${slot} slot to paint`)
  return { ...wear, [slot]: { ...now, [which]: value } }
}

/** Where in the slot's things the one worn now is (BARE, 0, when nothing is). */
export function wornAt(closet: Closet, wear: Wear, slot: Slot): number {
  const now = wornOver(closet.face, wear)[slot]
  const at = now === undefined ? 0 : closet.items[slot]!.findIndex((c) => c.id === choiceId(now.id))
  return Math.max(0, at)
}

// ------------------------------------------------------------------------------ the column

/**
 * A player's column as the dressing room opens: what they wear from their saves, no thumb, not
 * ready. The present they just got at the end (`given`) is put on in its slot, as the end showed it
 * worn, with the ring on it, so Ready keeps it on and taking it off is one press on Nothing. With
 * none given the ring is on the newest present they own, not put on, else on the hair they wear.
 */
export function startColumn(closet: Closet, wear: Wear, owned: readonly string[], given: string | null): Column {
  const find = (id: string) => closet.slots.map((s) => ({ slot: s, at: closet.items[s]!.findIndex((c) => c.id === id) })).find((f) => f.at >= 0)
  const got = given === null ? undefined : find(given)
  if (got !== undefined) return { wear: putOn(closet, wear, got.slot, given!), thumb: null, ready: false, slot: got.slot, paint: 'main', focus: { row: 'items', at: got.at } }
  const newest = [...owned].reverse().map(find).find((f) => f !== undefined)
  const slot = newest === undefined ? closet.slots[0]! : newest.slot
  return { wear, thumb: null, ready: false, slot, paint: 'main', focus: { row: 'items', at: newest === undefined ? wornAt(closet, wear, slot) : newest.at } }
}

/** What of the thing worn in the column's slot can be painted, the cells of its 'paint' row: the colours it paints with, main first, then its pattern when it paints main in a slot that carries one (not hair, patterns.ts patterned). */
export function paintsOf(closet: Closet, column: Column, models: WornModels): Paint[] {
  const worn = wornOver(closet.face, column.wear)[column.slot]
  const uses = worn === undefined ? { main: false, second: false } : paints(models(worn.id))
  return [...(['main', 'second'] as const).filter((p) => uses[p]), ...(uses.main && patterned(column.slot) ? (['pattern'] as const) : [])]
}

/** What the grid paints now: the column's own choice when the thing has it, else the first it has (null: it paints with nothing). */
export function paintNow(closet: Closet, column: Column, models: WornModels): Paint | null {
  const used = paintsOf(closet, column, models)
  return used.includes(column.paint) ? column.paint : (used[0] ?? null)
}

/** The rows of a column now: the paint row and the grid only while something is worn in the slot that paints, the grid holding the patterns while the paint row's pattern is chosen. */
export function rowsOf(closet: Closet, column: Column, models: WornModels): Row[] {
  const used = paintsOf(closet, column, models)
  const grid = paintNow(closet, column, models) === 'pattern' ? { count: PATTERN_ORDER.length, across: closet.patternsAcross } : { count: COLOUR_ORDER.length, across: closet.coloursAcross }
  const rows: Row[] = [
    { kind: 'slots', count: closet.slots.length, across: closet.slots.length },
    { kind: 'items', count: closet.items[column.slot]!.length, across: itemsAcross(closet.items[column.slot]!.length) },
  ]
  if (used.length > 0) rows.push({ kind: 'paint', count: used.length, across: used.length }, { kind: 'colours', ...grid })
  rows.push({ kind: 'thumb', count: 2, across: 2 }, { kind: 'ready', count: 1, across: 1 })
  return rows
}

/** The ring kept on a row the column has: a row gone (no second colour on this thing) gives way to the next one down. */
export function fixFocus(rows: readonly Row[], focus: Focus): Focus {
  let row = rows.find((r) => r.kind === focus.row)
  if (row === undefined) {
    const after = ROW_ORDER.slice(ROW_ORDER.indexOf(focus.row))
    row = rows.find((r) => after.includes(r.kind)) ?? rows[rows.length - 1]!
  }
  return { row: row.kind, at: Math.min(Math.max(0, focus.at), row.count - 1) }
}

/** The ring moved one cell: across a line, or up and down through a grid's lines and on to the row above or below, to the cell nearest under it. */
export function moveFocus(rows: readonly Row[], focus: Focus, dir: 'up' | 'down' | 'left' | 'right'): Focus {
  const f = fixFocus(rows, focus)
  const r = rows.findIndex((row) => row.kind === f.row)
  const row = rows[r]!
  if (dir === 'left' || dir === 'right') return { row: row.kind, at: Math.min(row.count - 1, Math.max(0, f.at + (dir === 'right' ? 1 : -1))) }
  const step = dir === 'down' ? 1 : -1
  const inside = f.at + step * row.across
  if (inside >= 0 && inside < row.count) return { row: row.kind, at: inside }
  // A last line shorter than the row's lines: down from above its end lands on its last cell.
  if (dir === 'down' && Math.floor(f.at / row.across) < Math.floor((row.count - 1) / row.across)) return { row: row.kind, at: row.count - 1 }
  const next = rows[r + step]
  if (next === undefined) return f
  const share = ((f.at % row.across) + 0.5) / row.across
  const col = Math.min(next.across - 1, Math.floor(share * next.across))
  const line = dir === 'down' ? 0 : Math.floor((next.count - 1) / next.across)
  return { row: next.kind, at: Math.min(next.count - 1, line * next.across + col) }
}

/** The column with the ring's cell chosen: a slot shows its things, a thing is put on, a paint says what the grid paints and rings the colour or pattern it has, a colour or a pattern paints, a thumb is given, Ready is said. */
function choose(closet: Closet, column: Column, rows: readonly Row[], models: WornModels): { column: Column; sound: SoundName | null } {
  const { row, at } = fixFocus(rows, column.focus)
  switch (row) {
    case 'slots': {
      const slot = closet.slots[at]!
      return { column: { ...column, slot, focus: { row: 'items', at: wornAt(closet, column.wear, slot) } }, sound: 'pop' }
    }
    case 'items': {
      const wear = putOn(closet, column.wear, column.slot, closet.items[column.slot]![at]!.id)
      return { column: { ...column, wear }, sound: wear === column.wear ? null : 'magic' }
    }
    case 'paint': {
      const which = paintsOf(closet, column, models)[at]!
      const has = wornOver(closet.face, column.wear)[column.slot]![which]
      const ringed = which === 'pattern' ? PATTERN_ORDER.indexOf(patternOf(has)) : Math.max(0, COLOUR_ORDER.findIndex((n) => COLOURS[n] === has))
      return { column: { ...column, paint: which, focus: { row: 'colours', at: ringed } }, sound: 'pop' }
    }
    case 'colours': {
      const which = paintNow(closet, column, models)!
      return { column: { ...column, wear: paint(closet, column.wear, column.slot, which, which === 'pattern' ? PATTERN_ORDER[at]! : COLOURS[COLOUR_ORDER[at]!]) }, sound: 'pop' }
    }
    case 'thumb':
      return { column: { ...column, thumb: at === 0 ? 'up' : 'down' }, sound: 'ding' }
    case 'ready':
      return { column: { ...column, ready: true }, sound: 'bell' }
  }
}

/**
 * What a seat or a tap does to a column. The stick walks the ring (on the slots row the ringed slot
 * is shown at once, and on the paint row the ringed cell is what the grid paints); a chooses the ringed cell; b takes back Ready, else lifts the ring a row. A tap
 * rings its cell and chooses it, and a tap on Ready when ready takes it back. While ready, nothing
 * but taking it back changes the column. The sound to play comes with it (null for none).
 */
export function act(closet: Closet, column: Column, models: WornModels, what: Act): { column: Column; sound: SoundName | null } {
  const rows = rowsOf(closet, column, models)
  if (column.ready) {
    const back = what.kind === 'b' || (what.kind === 'tap' && what.row === 'ready')
    return back ? { column: { ...column, ready: false }, sound: 'pop' } : { column, sound: null }
  }
  switch (what.kind) {
    case 'move': {
      const moved = moveFocus(rows, column.focus, what.dir)
      // Coming onto the slots the ring lands on the slot shown, and coming down onto the things on the one worn.
      const from = fixFocus(rows, column.focus).row
      const used = paintsOf(closet, column, models)
      const focus =
        moved.row === from
          ? moved
          : moved.row === 'slots'
            ? { row: moved.row, at: closet.slots.indexOf(column.slot) }
            : moved.row === 'items' && from === 'slots'
              ? { row: moved.row, at: wornAt(closet, column.wear, column.slot) }
              : moved.row === 'paint'
                ? { row: moved.row, at: Math.max(0, used.indexOf(paintNow(closet, column, models)!)) }
                : moved
      const slot = focus.row === 'slots' ? closet.slots[focus.at]! : column.slot
      return { column: { ...column, focus, slot, paint: focus.row === 'paint' ? used[focus.at]! : column.paint }, sound: null }
    }
    case 'a':
      return choose(closet, column, rows, models)
    case 'b':
      return { column: { ...column, focus: moveFocus(rows, column.focus, 'up') }, sound: null }
    case 'tap':
      return choose(closet, { ...column, focus: { row: what.row, at: what.at } }, rows, models)
  }
}
