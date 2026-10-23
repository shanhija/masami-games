import { COLS, DX, DY, ROWS, type Dir, type Thing } from './model'

/**
 * The one designed board, the same in every game, 60 x 36 cells and all of it open from the
 * start. Today's first board, 20 x 12, is its north-west corner (x 0..19, y 0..11): the rocket
 * pad safe in the west, the pond at the west edge, burrows A, B and C with the richest rocks
 * touching their flowers. The rest lies east and south: burrows D, E and F far out (D east, E
 * south-east, F south), blue and gold rock patches (the richest touching the far burrows'
 * flowers, a few small safe ones nearer home), two more ponds, groves and single trees.
 *
 * MAP legend: '.' grass, 'b' blue rocks, 'g' gold rocks, 'B' and 'G' those rocks on a
 * burrow's flowers, 'f' flowers, 'R' the pad, 'O' the oven standing at the start, 'w' a pond,
 * 'T' a tree, '1' to '6' burrows A to F. A burrow's flowers are the ring one cell deep round
 * its 2x2 mound; which burrow owns them follows from the ring, not the letter. A pond is a
 * rectangle of 'w' at least 2x2, so the 2x2 pump fits it with a free cell beside it for its belt.
 */
export const MAP = [
  '.........T............................................TT....',
  '..bbbb....ffff.....T...TT.T...........TT...............TT...',
  '.......bbbB11f.Tgg......TT.............TT................T..',
  '.......bbbB11f..gg.....T.T............T.....................',
  '.RRR......ffffgggGfff.........................fffGggg.......',
  '.RRR..........gg.f33f.........bbbb.........bbbB44Gggg.......',
  '.RRR..OO.........f33f.........bbb..........bbbB44Ggg........',
  '......OO..gg.ffffffff...................T...bbBfff..........',
  'ww......T.gg.f22f...........................................',
  'ww..T........f22f..................TT...................TT..',
  '............TfffBbbb................TT...................TT.',
  '.............T..bbbb...............T....................T...',
  '............................T...............................',
  '......................TT.......................T............',
  '.....bbb.........T.....TT..............................TT...',
  '.....bbb.....gg.......T........bbb......................TT..',
  '.............gg................bbb.........ww..........T....',
  '...............................bb..........ww...........T...',
  '...TT......................................ww...............',
  '....TT...............www............TT......................',
  '...T...............T.www.............TT...........ggg.......',
  '....T...............................T.............ggg.......',
  '.........T..................................................',
  '..........................................................T.',
  '............TT..............T...............................',
  '.............TT.............................................',
  '............T....................T................fffGggg...',
  '......bbb.........................................f55Gggg...',
  '......bbb.................ffff....................f55Ggg....',
  '.......................bbbB66f..................bbBBff......',
  '.TT....................bbbB66Gggg...............bbbb........',
  '..TT.......TT...........bbBffGggg......TT........bbb....TT..',
  '............T................ggg........TT...............TT.',
  '.T.........T.T.TT......................T.....T..........T...',
  '................TT..........................................',
  '...............T............................................',
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

/** Today's first board, the start block: the board's north-west corner, x 0..19 and y 0..11. The start view fits it, the hint plans in it and the scripted children draw in it until the camera pans (plans/rocket-factory.md, The board and the view). */
export const CORNER = { x: 0, y: 0, w: 20, h: 12 } as const

/** Whether cell (x, y) is in the start block. */
export const inCorner = (x: number, y: number) => x >= CORNER.x && x < CORNER.x + CORNER.w && y >= CORNER.y && y < CORNER.y + CORNER.h

/** The rocket pad's top-left cell (3x3), the oven standing at the start (2x2), and Beep's basket's cell beside the pad. */
export const PAD = { x: 1, y: 4 } as const
export const START_OVEN = { x: 6, y: 6 } as const
export const BASKET = { x: 0, y: 5 } as const

/** The burrows: each mound's top-left cell (2x2) and its door, the middle of the mound's bottom edge as a board point (the doors face the screen, as every sticker's picture does). */
export interface BurrowSite {
  x: number
  y: number
  door: { x: number; y: number }
}
/** A pond: a rectangle of water cells, its top-left cell and its size. */
export interface PondSite {
  x: number
  y: number
  w: number
  h: number
}
/** The six burrow letters of the map, A to F in order. */
const BURROW_LETTERS = ['1', '2', '3', '4', '5', '6'] as const

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
        case '4':
        case '5':
        case '6':
          ground.push('burrow')
          ;(mounds[ch] ??= []).push(c)
          break
        default:
          throw new Error(`the map has an unknown letter '${ch}' at ${x}, ${y}`)
      }
      if (ch === 'f' || ch === 'B' || ch === 'G') rockFlowers.add(c)
    }
  const burrows: BurrowSite[] = BURROW_LETTERS.map((ch) => {
    const cells = mounds[ch]
    if (!cells || cells.length !== 4) throw new Error(`burrow ${ch} must be a 2x2 mound`)
    const x = Math.min(...cells.map(xOf))
    const y = Math.min(...cells.map(yOf))
    if (!cells.every((c) => xOf(c) - x <= 1 && yOf(c) - y <= 1)) throw new Error(`burrow ${ch} must be a 2x2 mound`)
    return { x, y, door: { x: x + 1, y: y + 2 } }
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
  // The ponds: each connected piece of water is one rectangle, at least 2x2 (the pump's size).
  const ponds: PondSite[] = []
  const seen = new Set<number>()
  for (let c = 0; c < ground.length; c++) {
    if (ground[c] !== 'pond' || seen.has(c)) continue
    const piece = [c]
    seen.add(c)
    for (let i = 0; i < piece.length; i++)
      for (const d of [0, 1, 2, 3] as const) {
        const n = stepCell(piece[i]!, d)
        if (n >= 0 && ground[n] === 'pond' && !seen.has(n)) {
          seen.add(n)
          piece.push(n)
        }
      }
    const x = Math.min(...piece.map(xOf))
    const y = Math.min(...piece.map(yOf))
    const w = Math.max(...piece.map(xOf)) - x + 1
    const h = Math.max(...piece.map(yOf)) - y + 1
    if (w < 2 || h < 2 || w * h !== piece.length) throw new Error(`the pond at ${x}, ${y} must be a rectangle of 2x2 or more`)
    ponds.push({ x, y, w, h })
  }
  return { ground, burrows, flowerOf, ponds }
}
const BOARD = read()

/** The ground of every cell, by cell index. */
export const GROUND: readonly Ground[] = BOARD.ground
/** Which burrow's flowers a cell is (0 A to 5 F), or -1. */
export const FLOWER_OF: readonly number[] = BOARD.flowerOf
export const BURROWS: readonly BurrowSite[] = BOARD.burrows
/** The ponds, by top-left cell in reading order: the first is the one at the west edge. */
export const PONDS: readonly PondSite[] = BOARD.ponds

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
