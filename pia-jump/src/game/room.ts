import { ROWS, TILE, type BlockDef, type Cell, type Gap, type Gift, type Room, type RoomDef, type Spawn, type TileCode } from './model'

/**
 * Turns a room's map into the parsed Room the sim and the picture share. A map is ROWS
 * strings of equal length, one character per tile:
 *
 *   .  air                          #  ground: the room's floor and earth
 *   A-Z  an ABC block showing that letter (so words read straight off the map)
 *   =  shelf: she jumps up through it and stands on it
 *   |  column: a flower pot, jar, bottle, crayon box or chimney, two wide
 *   c  cookie block: big Pia breaks it from below, small Pia bumps it
 *   ?  gift box with a star         $  gift box with a star per bump, up to 8
 *   p  gift box with a power: a cupcake when she is small, the wand when big
 *   r  gift box with the rainbow ball
 *   x  gate: stands until the Big Grumble is beaten
 *   *  star                         ^  spring, standing on the tile below
 *   @  Pia's start                  !  the ribbon pole's foot
 *   h  the kitten's bed
 *   g  grumble    s  snail    b  bee    k  the Big Grumble
 *
 * Stars, springs, the start, the pole, the bed and the enemies stand in air: their cell is
 * air to the sim. Lifts are not on the map; the room lists them.
 */

const GIFTS: Record<string, Gift> = { '?': 'star', $: 'stars', p: 'power', r: 'ball' }
const ENEMIES: Record<string, Spawn['kind']> = { g: 'grumble', s: 'snail', b: 'bee', k: 'boss' }
const TILES: Record<string, TileCode> = { '.': TILE.air, '#': TILE.ground, '=': TILE.shelf, '|': TILE.column }

/** Static tiles that stop everything from every side. A shelf only stops from above, and blocks are the sim's business. */
export const solidTile = (code: number) => code === TILE.ground || code === TILE.abc || code === TILE.column

/** Lays segments of a map side by side: each is ROWS strings of one width, so a room can be written a screen at a time. */
export function join(...segments: (readonly string[])[]): string[] {
  return Array.from({ length: ROWS }, (_, row) =>
    segments
      .map((segment, i) => {
        if (segment.length !== ROWS) throw new Error(`segment ${i} has ${segment.length} rows, not ${ROWS}`)
        const line = segment[row]!
        if (line.length !== segment[0]!.length) throw new Error(`segment ${i} row ${row} is ${line.length} wide, not ${segment[0]!.length}`)
        return line
      })
      .join(''),
  )
}

/** Parses a room's map. Throws, naming the room, row and column, on anything the legend does not allow. */
export function parseRoom(def: RoomDef): Room {
  const where = (row: number, col: number) => `room ${def.id}, row ${row}, column ${col}`
  if (def.map.length !== ROWS) throw new Error(`room ${def.id} has ${def.map.length} rows, not ${ROWS}`)
  const cols = def.map[0]!.length
  if (cols < 20) throw new Error(`room ${def.id} is only ${cols} columns wide`)
  const tiles = new Uint8Array(ROWS * cols)
  const letters: string[] = new Array(ROWS * cols).fill('')
  const blockAt = new Int16Array(ROWS * cols).fill(-1)
  const blocks: BlockDef[] = []
  const stars: Cell[] = []
  const spawns: Spawn[] = []
  const springs: Cell[] = []
  let start: Cell | null = null
  let pole: Cell | null = null
  let bed: Cell | null = null
  const once = (seen: Cell | null, what: string, row: number, col: number): Cell => {
    if (seen) throw new Error(`${where(row, col)}: a second ${what} (the first is at row ${seen.row}, column ${seen.col})`)
    return { col, row }
  }
  def.map.forEach((line, row) => {
    if (line.length !== cols) throw new Error(`room ${def.id}, row ${row} is ${line.length} wide, not ${cols}`)
    for (let col = 0; col < cols; col++) {
      const ch = line[col]!
      const i = row * cols + col
      if (ch in TILES) tiles[i] = TILES[ch]!
      else if (ch >= 'A' && ch <= 'Z') {
        tiles[i] = TILE.abc
        letters[i] = ch
      } else if (ch in GIFTS) {
        blockAt[i] = blocks.length
        blocks.push({ col, row, kind: 'gift', gift: GIFTS[ch]! })
      } else if (ch === 'c' || ch === 'x') {
        blockAt[i] = blocks.length
        blocks.push({ col, row, kind: ch === 'c' ? 'cookie' : 'gate', gift: 'none' })
      } else if (ch in ENEMIES) spawns.push({ kind: ENEMIES[ch]!, col, row })
      else if (ch === '*') stars.push({ col, row })
      else if (ch === '^') springs.push({ col, row })
      else if (ch === '@') start = once(start, 'start', row, col)
      else if (ch === '!') pole = once(pole, 'pole', row, col)
      else if (ch === 'h') bed = once(bed, 'bed', row, col)
      else throw new Error(`${where(row, col)}: '${ch}' is not in the legend`)
    }
  })
  if (!start) throw new Error(`room ${def.id} has no start '@'`)
  if (!pole) throw new Error(`room ${def.id} has no pole '!'`)
  if (!bed) throw new Error(`room ${def.id} has no bed 'h'`)
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
  return { id: def.id, name: def.name, kitten: def.kitten, cols, tiles, letters, blocks, blockAt, stars, spawns, springs, lifts: def.lifts, start, pole, bed, floor, gaps }
}

/** The static tile at (col, row): left and right of the room is ground (a wall), above and below is air. */
export function tileAt(room: Room, col: number, row: number): number {
  if (col < 0 || col >= room.cols) return TILE.ground
  if (row < 0 || row >= ROWS) return TILE.air
  return room.tiles[row * room.cols + col]!
}

/** The index into room.gaps of the gap holding column `col`, or -1. */
export function gapAt(room: Room, col: number): number {
  return room.gaps.findIndex((g) => col >= g.col0 && col < g.col1)
}
