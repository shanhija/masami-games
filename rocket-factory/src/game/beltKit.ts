import { cellOf, dirTo } from './board'
import { rebuild } from './belts'
import { THINGS, newBuilding, opposite, thingIndex, type Building, type Dir, type Kind, type State, type Thing } from './model'
import { blankState } from './rules'

/**
 * Belt networks laid by hand for the tests (belts.test.ts, strokes.test.ts): cells written
 * straight into the State, as a save or a long game could leave them, then `rebuild`. Never
 * used by the game itself.
 */

/** A fresh game's board with no buildings on it at all (not even the pad), for networks of belts alone. */
export function emptyBoard(): State {
  const s = blankState(1)
  s.buildings = []
  rebuild(s)
  return s
}

/** Lays one belt cell at (x, y) coming in by `inSide` and leaving by `outSide`, with a fork side and a bridge's over lane when given (-1 for none). Returns the cell. */
export function cell(s: State, x: number, y: number, inSide: Dir, outSide: Dir, fork: number, over: number): number {
  const c = cellOf(x, y)
  const b = s.belts
  b.in[c] = inSide
  b.out[c] = outSide
  b.fork[c] = fork
  b.over[c] = over
  return c
}

/** Lays a belt along neighbouring cells (given as [x, y]), each coming in from the one before and leaving toward the one after; the ends run straight. Returns the cells. */
export function line(s: State, path: readonly (readonly [number, number])[]): number[] {
  const cells = path.map(([x, y]) => cellOf(x, y))
  cells.forEach((c, i) => {
    const out = i + 1 < cells.length ? dirTo(c, cells[i + 1]!) : dirTo(cells[i - 1]!, c)
    const inSide = i > 0 ? dirTo(c, cells[i - 1]!) : opposite(out)
    cell(s, path[i]![0], path[i]![1], inSide, out, -1, -1)
  })
  return cells
}

/** Puts a thing in a slot. */
export function put(s: State, slot: number, thing: Thing): void {
  s.belts.slot[slot] = thingIndex(thing)
}

/** The things in these slots, as names ('.' for empty): a compact picture of a lane for expectations. */
export const read = (s: State, slots: readonly number[]) => slots.map((x) => (s.belts.slot[x]! < 0 ? '.' : THINGS[s.belts.slot[x]!]!))

/** Adds a building of `kind` with its footprint's top-left at (x, y) and the next id. Call rebuild after. */
export function add(s: State, kind: Kind, x: number, y: number): Building {
  const b = newBuilding(s.nextId++, kind, x, y, -1)
  s.buildings.push(b)
  return b
}
