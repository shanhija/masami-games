import { COLS, DX, DY, ROWS, type Dir, type Land, type Thing } from './model'

/**
 * The one designed board, the same in every game: the rocket pad safe in the west, the pond
 * far west, the three burrows east with the richest rocks touching their flowers, so the
 * front is always to the east and the bubble belt to the towers is the longest line of the
 * game. A land is a window of it (LANDS); board coordinates never change when the land grows.
 *
 * MAP legend: '.' grass, 'b' blue rocks, 'g' gold rocks, 'B' and 'G' those rocks on a
 * burrow's flowers, 'f' flowers, 'R' the pad, 'O' the oven standing at the start, 'w' the
 * pond, 'T' a tree, '1' '2' '3' burrows A, B and C. A burrow's flowers are the ring one cell
 * deep round its 2x2 mound (cut off at the board's edge); which burrow owns them follows from
 * the ring, not the letter.
 */
export const MAP = [
  '.........T..........',
  '..bbbb....ffff.....T',
  '.......bbbB11f.Tgg..',
  '.......bbbB11f..gg..',
  '.RRR......ffffgggGff',
  '.RRR..........gg.f33',
  '.RRR..OO.........f33',
  '......OO..gg.fffffff',
  'ww......T.gg.f22f...',
  'ww..T........f22f...',
  '............TfffBbbb',
  '.............T..bbbb',
] as const

/** What a cell is under whatever is placed on it. Flowers are FLOWER_OF, over grass or rocks. */
export type Ground = 'grass' | 'blue' | 'gold' | 'pond' | 'tree' | 'burrow' | 'pad'

export const cellOf = (x: number, y: number) => y * COLS + x
export const xOf = (c: number) => c % COLS
export const yOf = (c: number) => Math.floor(c / COLS)
export const onBoard = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS
/** The cell next to c in direction d, or -1 off the board. */
export function stepCell(c: number, d: Dir): number {
  const x = xOf(c) + DX[d]
  const y = yOf(c) + DY[d]
  return onBoard(x, y) ? cellOf(x, y) : -1
}
/** The direction from cell a to its neighbour b. Throws when they are not neighbours. */
export function dirTo(a: number, b: number): Dir {
  const dx = xOf(b) - xOf(a)
  const dy = yOf(b) - yOf(a)
  for (let d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d as Dir
  throw new Error(`cells ${a} and ${b} are not neighbours`)
}

/** Each land's window, corners inclusive. */
export const LANDS: Record<Land, { x0: number; y0: number; x1: number; y1: number }> = {
  1: { x0: 0, y0: 2, x1: 12, y1: 9 },
  2: { x0: 0, y0: 1, x1: 15, y1: 10 },
  3: { x0: 0, y0: 0, x1: 19, y1: 11 },
}
export const inLand = (land: Land, x: number, y: number) => {
  const w = LANDS[land]
  return x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1
}
export const cellInLand = (land: Land, c: number) => inLand(land, xOf(c), yOf(c))

/** The rocket pad's top-left cell (3x3), the oven standing at the start (2x2), and Beep's basket's cell beside the pad. */
export const PAD = { x: 1, y: 4 } as const
export const START_OVEN = { x: 6, y: 6 } as const
export const BASKET = { x: 0, y: 5 } as const

/** The burrows: each mound's top-left cell (2x2), the land it opens with, and its door, the middle of the mound's bottom edge as a board point (the doors face the screen, as every sticker's picture does). */
export interface BurrowSite {
  x: number
  y: number
  land: Land
  door: { x: number; y: number }
}

function read() {
  if (MAP.length !== ROWS || MAP.some((row) => row.length !== COLS)) throw new Error(`the map must be ${COLS} x ${ROWS}`)
  const ground: Ground[] = []
  const mounds: Record<string, number[]> = {}
  const rockFlowers = new Set<number>()
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const ch = MAP[y]![x]!
      const c = cellOf(x, y)
      switch (ch) {
        case '.':
        case 'f':
        case 'O':
          ground.push('grass')
          break
        case 'b':
        case 'B':
          ground.push('blue')
          break
        case 'g':
        case 'G':
          ground.push('gold')
          break
        case 'w':
          ground.push('pond')
          break
        case 'T':
          ground.push('tree')
          break
        case 'R':
          ground.push('pad')
          break
        case '1':
        case '2':
        case '3':
          ground.push('burrow')
          ;(mounds[ch] ??= []).push(c)
          break
        default:
          throw new Error(`the map has an unknown letter '${ch}' at ${x}, ${y}`)
      }
      if (ch === 'f' || ch === 'B' || ch === 'G') rockFlowers.add(c)
    }
  const burrows: BurrowSite[] = ['1', '2', '3'].map((ch) => {
    const cells = mounds[ch]
    if (!cells || cells.length !== 4) throw new Error(`burrow ${ch} must be a 2x2 mound`)
    const x = Math.min(...cells.map(xOf))
    const y = Math.min(...cells.map(yOf))
    const land = ([1, 2, 3] as const).find((l) => inLand(l, x, y) && inLand(l, x + 1, y + 1))!
    return { x, y, land, door: { x: x + 1, y: y + 2 } }
  })
  // A burrow's flowers: the ring one cell deep round its mound. Every flower letter must lie on exactly one ring, and every ring cell that is not something else must be a flower letter.
  const flowerOf: number[] = new Array(COLS * ROWS).fill(-1)
  burrows.forEach((b, i) => {
    for (let y = b.y - 1; y <= b.y + 2; y++)
      for (let x = b.x - 1; x <= b.x + 2; x++) {
        if (!onBoard(x, y) || (x >= b.x && x <= b.x + 1 && y >= b.y && y <= b.y + 1)) continue
        const c = cellOf(x, y)
        if (!rockFlowers.has(c)) throw new Error(`the ring of burrow ${i + 1} needs flowers at ${x}, ${y}`)
        if (flowerOf[c] !== -1) throw new Error(`two rings share ${x}, ${y}`)
        flowerOf[c] = i
      }
  })
  for (const c of rockFlowers) if (flowerOf[c] === -1) throw new Error(`flowers at ${xOf(c)}, ${yOf(c)} belong to no ring`)
  return { ground, burrows, flowerOf }
}
const BOARD = read()

/** The ground of every cell, by cell index. */
export const GROUND: readonly Ground[] = BOARD.ground
/** Which burrow's flowers a cell is (0 A, 1 B, 2 C), or -1. */
export const FLOWER_OF: readonly number[] = BOARD.flowerOf
export const BURROWS: readonly BurrowSite[] = BOARD.burrows

/** The rock a digger standing on this cell digs, or null. */
export function rockOf(c: number): Thing | null {
  const g = GROUND[c]
  return g === 'blue' ? 'blueRock' : g === 'gold' ? 'goldRock' : null
}

/** The pad's cells and the ring of cells round it: munchers never set foot there. */
export const PAD_RING: ReadonlySet<number> = (() => {
  const out = new Set<number>()
  for (let y = PAD.y - 1; y <= PAD.y + 3; y++) for (let x = PAD.x - 1; x <= PAD.x + 3; x++) if (onBoard(x, y)) out.add(cellOf(x, y))
  return out
})()
