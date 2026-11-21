import { ROWS, TILE, type Gap, type TileCode } from '../../../pia-jump/src/game/model'
import { isBlockLetter, solidTile } from '../../../pia-jump/src/game/room'
import type { Cell, Crate, Kind, Level, LevelDef, Present } from './model'

/**
 * Turns a level's map into the parsed Level the sim and the picture share. A map is ROWS
 * strings of equal length, one character per tile:
 *
 *   .  air                          #  ground: the level's floor and earth
 *   A-Z, Ä, Ö  an ABC block: a run of them is a word, shown in the player's language
 *         through Pia Jump's BLOCK_WORDS (its words.ts), as Pia Jump's rooms show theirs
 *   =  shelf: she jumps up through it and stands on it
 *   |  column (a flower pot, a jar, a bottle, a crayon box or a chimney), two wide
 *   p  a crate with a plank          c  a crate with a cube
 *   t  a crate with a trampoline     l  a crate with a ladder
 *   g  a present: the level's rewards go into them left to right, then top to bottom
 *   @  her start                     !  the finish arch's foot
 *
 * Crates, presents, the start and the finish stand in air: their cell is air to the sim.
 * The static tiles mean what they mean in Pia Jump, whose world art draws them.
 */

const TILES: Record<string, TileCode> = { '.': TILE.air, '#': TILE.ground, '=': TILE.shelf, '|': TILE.column }
const CRATES: Record<string, Kind> = { p: 'plank', c: 'cube', t: 'trampoline', l: 'ladder' }

/** Lays segments of a map side by side: each is ROWS strings of one width, so a level can be written a screen at a time. */
export { join } from '../../../pia-jump/src/game/room'

/** Parses a level's map. Throws, naming the level, row and column, on anything the legend does not allow. */
export function parseLevel(def: LevelDef): Level {
  const where = (row: number, col: number) => `level ${def.id}, row ${row}, column ${col}`
  if (def.map.length !== ROWS) throw new Error(`level ${def.id} has ${def.map.length} rows, not ${ROWS}`)
  const cols = def.map[0]!.length
  const tiles = new Uint8Array(ROWS * cols)
  const letters: string[] = new Array(ROWS * cols).fill('')
  const crates: Crate[] = []
  const spots: Cell[] = []
  let start: Cell | null = null
  let finish: Cell | null = null
  const once = (seen: Cell | null, what: string, row: number, col: number): Cell => {
    if (seen) throw new Error(`${where(row, col)}: a second ${what} (the first is at row ${seen.row}, column ${seen.col})`)
    return { col, row }
  }
  def.map.forEach((line, row) => {
    if (line.length !== cols) throw new Error(`level ${def.id}, row ${row} is ${line.length} wide, not ${cols}`)
    for (let col = 0; col < cols; col++) {
      const ch = line[col]!
      const i = row * cols + col
      if (ch in TILES) tiles[i] = TILES[ch]!
      else if (isBlockLetter(ch)) {
        tiles[i] = TILE.abc
        letters[i] = ch
      } else if (ch in CRATES) crates.push({ col, row, kind: CRATES[ch]! })
      else if (ch === 'g') spots.push({ col, row })
      else if (ch === '@') start = once(start, 'start', row, col)
      else if (ch === '!') finish = once(finish, 'finish', row, col)
      else throw new Error(`${where(row, col)}: '${ch}' is not in the legend`)
    }
  })
  if (!start) throw new Error(`level ${def.id} has no start '@'`)
  if (!finish) throw new Error(`level ${def.id} has no finish '!'`)
  if (spots.length !== def.rewards.length) throw new Error(`level ${def.id} has ${spots.length} presents on its map and ${def.rewards.length} rewards`)
  spots.sort((a, b) => a.col - b.col || a.row - b.row)
  const presents: Present[] = spots.map((c, i) => ({ ...c, reward: def.rewards[i]! }))
  const floor = new Int16Array(cols).fill(-1)
  for (let col = 0; col < cols; col++) {
    for (let row = ROWS - 1; row >= 0 && solidTile(tiles[row * cols + col]!); row--) floor[col] = row
  }
  const gaps: Gap[] = []
  for (let col = 0; col < cols; col++) {
    if (floor[col] !== -1) continue
    const last = gaps[gaps.length - 1]
    if (last && last.col1 === col) last.col1 = col + 1
    else gaps.push({ col0: col, col1: col + 1 })
  }
  return { id: def.id, cols, tiles, letters, floor, gaps, crates, presents, start, finish }
}
