import { inLang, type Lang } from '../../../profiles/src/lang'
import { ROWS, TILE, type Gap, type Ground, type RoomId } from '../game/model'
import { tileAt } from '../game/room'
import { BLOCK_WORDS } from '../words'
import { COLOR, INK, LINE, LINE_DETAIL, LINE_EDGE, SHADE_BLOCK, inkPart, lw, pen, roundRectPath, sparklePath, type View } from './look'

/**
 * Each room's palette, its terrain, its pits and its backdrop. The rooms are one day in an
 * ordinary house: the Garden at sunrise, the Kitchen in the morning, the Bath at noon, the
 * Toy Room in the afternoon, the Roof at night. The paint helpers at the end are shared
 * with things.ts.
 */

/** A room's colours. Lists are taken in turn: per tile for bands and shelves, per column for columns. */
export interface RoomLook {
  /** The backdrop's top and bottom colours (sky or wall). */
  sky: readonly [string, string]
  /** Gift boxes, the pole's stripes and bow, spring pads. */
  accent: string
  accentShade: string
  /** The ribbon on gift boxes. */
  ribbon: string
  ribbonShade: string
  /** The kitten's bed, and its darker base band. */
  bed: string
  bedShade: string
  /** The room's card on the start screen: the five read as five times of day. */
  card: string
  night: boolean
  /** The ground's face, its shade crescent under overhangs, and the marks on it (pebbles, drawer panels, grout, board lines, scale edges). */
  ground: string
  groundShade: string
  groundMark: string
  /** The band along every exposed top (grass, worktop edge, tub rim, play mats, moonlit ridge), its rim along the scallops, and its light strip. */
  band: readonly string[]
  bandShade: readonly string[]
  bandLight: string
  /** Columns (flower pots, candy jars, bottles, crayon boxes, chimneys) and their trim (pot rim, jar lid, bottle cap, crayon box band, chimney cap). */
  column: readonly string[]
  columnShade: readonly string[]
  columnTrim: string
  /** Shelves (bench planks, cutting boards, porcelain, books, awnings) and their brackets. */
  shelf: readonly string[]
  shelfShade: readonly string[]
  shelfTrim: string
  /** Lifts (leaves, trays, sponges, toy wagons, clouds) and their detail (vein, rim, holes, wheels, puffs). */
  lift: string
  liftShade: string
  liftMark: string
  /** What fills a pit (pond, sink, bath water, the ball pit's floor, night air), its surface band, and what floats or lies in it. */
  pit: string
  pitSurface: string
  pitBits: readonly string[]
}

/** Every room's colours, from the art brief (tuned on screen), and its card for the start screen. */
export const ROOM_LOOK: Record<RoomId, RoomLook> = {
  garden: {
    sky: ['#BFE6FF', '#FFD9E6'],
    accent: '#FF7A9C',
    accentShade: '#E0587C',
    ribbon: '#FFF4E0',
    ribbonShade: '#EEDABA',
    bed: '#FFE27A',
    bedShade: '#EDC555',
    card: '#FFD3C4',
    night: false,
    ground: '#B47B57',
    groundShade: '#976244',
    groundMark: '#CF9C77',
    band: ['#7DD48C'],
    bandShade: ['#5DBE6F'],
    bandLight: '#A9E9AE',
    column: ['#E8845A'],
    columnShade: ['#C9673F'],
    columnTrim: '#F2A07C',
    shelf: ['#D9A066'],
    shelfShade: ['#B98049'],
    shelfTrim: '#B98049',
    lift: '#8FD67F',
    liftShade: '#72BE62',
    liftMark: '#6DB65E',
    pit: '#8ADBEA',
    pitSurface: '#C6F1F7',
    pitBits: ['#6CC47A', '#FFC6DD'],
  },
  kitchen: {
    sky: ['#E6F7EE', '#E6F7EE'],
    accent: '#FF5D73',
    accentShade: '#D9404F',
    ribbon: '#FFFFFF',
    ribbonShade: '#E8E2EE',
    bed: '#FFB86B',
    bedShade: '#EB9A4B',
    card: '#FFEDA6',
    night: false,
    ground: '#FFE08F',
    groundShade: '#EFC66A',
    groundMark: '#E6B955',
    band: ['#E8BA84'],
    bandShade: ['#D19E66'],
    bandLight: '#F3D2A6',
    column: ['#D6EEFA'],
    columnShade: ['#B8DCF0'],
    columnTrim: '#FF8FA3',
    shelf: ['#E7BE86'],
    shelfShade: ['#C99B5F'],
    shelfTrim: '#C99B5F',
    lift: '#F2F2F7',
    liftShade: '#DCDDE8',
    liftMark: '#C9CCD9',
    pit: '#BCD6E2',
    pitSurface: '#DCEBF2',
    pitBits: ['#FFFFFF'],
  },
  bath: {
    sky: ['#BDEBF0', '#BDEBF0'],
    accent: '#FF9F43',
    accentShade: '#E07F22',
    ribbon: '#FFFFFF',
    ribbonShade: '#E8E2EE',
    bed: '#FFB3C7',
    bedShade: '#EE93AC',
    card: '#B5E9FF',
    night: false,
    ground: '#FFE9A3',
    groundShade: '#EFD27E',
    groundMark: '#F0CF6A',
    band: ['#FFFFFF'],
    bandShade: ['#DCEFF5'],
    bandLight: '#FFFFFF',
    column: ['#FF9E8F', '#FFD36E'],
    columnShade: ['#E57F70', '#E8B850'],
    columnTrim: '#FFFFFF',
    shelf: ['#FFFFFF'],
    shelfShade: ['#DCEFF5'],
    shelfTrim: '#AEB9CC',
    lift: '#FFE27A',
    liftShade: '#E9BE45',
    liftMark: '#F0C94F',
    pit: '#7ED7EE',
    pitSurface: '#BFF0F8',
    pitBits: ['#FFFFFF'],
  },
  toys: {
    sky: ['#FFE6D1', '#FFE6D1'],
    accent: '#3DBE6B',
    accentShade: '#2A9C52',
    ribbon: '#FFFFFF',
    ribbonShade: '#E8E2EE',
    bed: '#9FD3FF',
    bedShade: '#7DB7EB',
    card: '#FFC88A',
    night: false,
    ground: '#E2B07A',
    groundShade: '#C79461',
    groundMark: '#C9965F',
    band: ['#FF9FA8', '#FFE08A', '#A8E6A3', '#9FD3FF'],
    bandShade: ['#E8838D', '#EDC566', '#85CF80', '#7CBAEC'],
    bandLight: 'rgba(255, 255, 255, 0.4)',
    column: ['#FFD25A'],
    columnShade: ['#E8B53D'],
    columnTrim: '#4CAF7D',
    shelf: ['#FF8C94', '#7EC8FF', '#FFD166', '#8EDB8E'],
    shelfShade: ['#E66F79', '#5EAEEB', '#EDB848', '#6CC46F'],
    shelfTrim: '#C79461',
    lift: '#FF8C94',
    liftShade: '#E66F79',
    liftMark: INK,
    pit: '#FFF0F0',
    pitSurface: '#FFF0F0',
    pitBits: ['#FF6B6B', '#FFD447', '#4D96FF', '#7ED957'],
  },
  roof: {
    sky: ['#262A63', '#4A4C9C'],
    accent: '#FF8FB8',
    accentShade: '#E06A96',
    ribbon: '#FFF4E0',
    ribbonShade: '#EEDABA',
    bed: '#FFD98A',
    bedShade: '#EDBD62',
    card: '#4F52A6',
    night: true,
    ground: '#9A5B7D',
    groundShade: '#7E4866',
    groundMark: '#B57898',
    band: ['#C58DB0'],
    bandShade: ['#A9719A'],
    bandLight: '#E3B5D0',
    column: ['#D47B6B'],
    columnShade: ['#B5615A'],
    columnTrim: '#8F8BB0',
    shelf: ['#FF9EBB'],
    shelfShade: ['#E681A1'],
    shelfTrim: '#7C78B8',
    lift: '#DCD8FF',
    liftShade: '#B9B3F0',
    liftMark: '#B9B3F0',
    pit: '#1C1F4A',
    pitSurface: '#1C1F4A',
    pitBits: ['#F9F871'],
  },
}

// ---------------------------------------------------------------------------------------
// Terrain: baked once into chunk canvases, so it is still, and nothing it draws for a cell
// reaches more than half a tile past it.

/** Outer corners of exposed terrain are rounded this much; inner corners stay square. */
const CORNER = 0.18
/** The top band: BAND deep at its scallops and flat down to BAND_FLAT, SCALLOPS to a tile, its shade rim BAND_RIM thick, a light strip LIGHT_STRIP thick along its top. */
const BAND = 0.25
const BAND_FLAT = 0.17
const SCALLOPS = 4
const BAND_RIM = 0.05
const LIGHT_STRIP = 0.06
/** Terrain and blocks cast their silhouette this far right and down, in COLOR.paper. */
export const PAPER_SHADOW = [0.1, 0.12] as const
/** A shelf's plank, at the top of its row. */
const PLANK = 0.28
/** ABC block faces by (col + row) mod 4, as [lit, shade]; their corner radius; the letter's height and its ink edge in tiles. */
const ABC_FACES = [
  ['#FF8C94', '#E8707A'],
  ['#7EC8FF', '#5EADEB'],
  ['#FFD166', '#EDB747'],
  ['#8EDB8E', '#6CC46F'],
] as const
const ABC_R = 0.06
const LETTER = 0.62
const LETTER_EDGE = 0.05

/** The Garden pots' soil and sprout. */
const SOIL = ['#6E4433', '#5A3527'] as const
const SPROUT = ['#5DBB63', '#45A04E'] as const
/** Candy in the Kitchen's jars, and the jar lid's shade. */
const CANDY = ['#FF6FAE', '#FFD447', '#7FD4FF', '#8EE59B'] as const
const LID_SHADE = '#E8718A'
/** The Bath bottles' cap shade. */
const CAP_SHADE = '#D9E4EE'
/** Crayons standing in the Toy Room's crayon boxes, as [lit, shade], and the box's dark inside behind them. */
const CRAYONS = [
  ['#FF6B6B', '#E04F55'],
  ['#4D96FF', '#3579E0'],
  ['#7ED957', '#62BD43'],
  ['#FF9F43', '#E3822A'],
] as const
const CRAYON_INSIDE = '#7A5568'
/** The Roof chimneys' plaster band, cap shade and smoke. */
const CHIMNEY_BAND = '#E8A08F'
const CHIMNEY_CAP_SHADE = '#76729B'
const SMOKE = 'rgba(201, 204, 235, 0.5)'
/** The Toy Room books' page edges, and the Roof awnings' white stripes as [lit, shade]. */
const PAGES = '#FFF8EC'
const AWNING_WHITE = ['#FFFFFF', '#E6DFF0'] as const

/** A column of the map (two tiles wide): its top-left cell and its size in tiles. */
interface Column {
  col: number
  row: number
  w: number
  h: number
}

/** A shelf: a run of shelf tiles in one row. */
interface Shelf {
  col: number
  row: number
  w: number
}

/** A ground tile, how far down it reaches (the bottom row goes on half a tile below the room) and which of its sides face something that is not ground. */
interface GroundTile {
  col: number
  row: number
  h: number
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

/** Columns and shelves, found once per room (the stage bakes a room in many chunks). */
const piecesCache = new WeakMap<Ground, { columns: Column[]; shelves: Shelf[] }>()

/** The room's columns and shelves as whole pieces, so a piece is drawn whole by every chunk that shows a part of it. */
function pieces(room: Ground) {
  const known = piecesCache.get(room)
  if (known) return known
  const columns: Column[] = []
  const shelves: Shelf[] = []
  // A column is a pair of column tiles stacked over the rows; a wider run splits into pairs from its left.
  const open = new Map<number, Column>()
  const at = (col: number, row: number) => room.tiles[row * room.cols + col]
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < room.cols; col++) {
      const code = at(col, row)
      if ((code !== TILE.column && code !== TILE.shelf) || (col > 0 && at(col - 1, row) === code)) continue
      let end = col + 1
      while (end < room.cols && at(end, row) === code) end++
      if (code === TILE.shelf) {
        shelves.push({ col, row, w: end - col })
        continue
      }
      for (let x = col; x < end; x += 2) {
        const w = Math.min(2, end - x)
        const above = open.get(x * 4 + w)
        if (above && above.row + above.h === row) above.h += 1
        else {
          const c = { col: x, row, w, h: 1 }
          columns.push(c)
          open.set(x * 4 + w, c)
        }
      }
    }
  }
  const found = { columns, shelves }
  piecesCache.set(room, found)
  return found
}

/** Ground for the ground's outline: left and right of the room is wall, and below it the bottom row goes on. ABC blocks and columns stand on the ground with their own outlines, so the grass runs on under them. */
const groundAt = (room: Ground, col: number, row: number) => tileAt(room, col, Math.min(row, ROWS - 1)) === TILE.ground

/** The rounded corners of a ground tile: an outer corner is where two exposed sides meet. */
function corners(g: GroundTile) {
  return {
    tl: g.top && g.left ? CORNER : 0,
    tr: g.top && g.right ? CORNER : 0,
    br: g.bottom && g.right ? CORNER : 0,
    bl: g.bottom && g.left ? CORNER : 0,
  }
}

/** Adds a ground tile's outline, outer corners rounded, to the current path. */
function groundPath(ctx: CanvasRenderingContext2D, g: GroundTile) {
  const { tl, tr, br, bl } = corners(g)
  cornerRectPath(ctx, g.col, g.row, 1, g.h, tl, tr, br, bl)
}

/** The ink along a ground tile's exposed sides and around its outer corners, as separate strokes that the round caps join. */
function edgePath(ctx: CanvasRenderingContext2D, g: GroundTile) {
  const { col: x, row: y, h } = g
  const { tl, tr, br, bl } = corners(g)
  if (g.top) {
    ctx.moveTo(x + tl, y)
    ctx.lineTo(x + 1 - tr, y)
  }
  if (tr) {
    ctx.moveTo(x + 1 - tr, y)
    ctx.arcTo(x + 1, y, x + 1, y + tr, tr)
  }
  if (g.right) {
    ctx.moveTo(x + 1, y + tr)
    ctx.lineTo(x + 1, y + h - br)
  }
  if (br) {
    ctx.moveTo(x + 1, y + h - br)
    ctx.arcTo(x + 1, y + h, x + 1 - br, y + h, br)
  }
  if (g.bottom) {
    ctx.moveTo(x + 1 - br, y + h)
    ctx.lineTo(x + bl, y + h)
  }
  if (bl) {
    ctx.moveTo(x + bl, y + h)
    ctx.arcTo(x, y + h, x, y + h - bl, bl)
  }
  if (g.left) {
    ctx.moveTo(x, y + h - bl)
    ctx.lineTo(x, y + tl)
  }
  if (tl) {
    ctx.moveTo(x, y + tl)
    ctx.arcTo(x, y, x + tl, y, tl)
  }
}

/** The top band over the tile at (x, y): flat from above the tile's top down to BAND_FLAT + dy, then SCALLOPS half-ellipses down to BAND + dy. The ground's clip trims what sticks out. */
function bandPath(ctx: CanvasRenderingContext2D, x: number, y: number, dy: number) {
  const r = 0.5 / SCALLOPS
  ctx.moveTo(x, y - 0.1)
  ctx.lineTo(x + 1, y - 0.1)
  ctx.lineTo(x + 1, y + BAND_FLAT + dy)
  for (let i = SCALLOPS - 1; i >= 0; i--) ctx.ellipse(x + (i * 2 + 1) * r, y + BAND_FLAT + dy, r, BAND - BAND_FLAT, 0, 0, Math.PI)
  ctx.closePath()
}

/**
 * The room's static tiles (ground, ABC blocks with their letters in `lang`, columns,
 * shelves) in the columns [col0, col1), with the context in world units and the room's
 * top-left at the origin. It is baked into chunk canvases, so it draws only what never
 * changes, and nothing it draws for a cell reaches more than half a tile past that cell.
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, room: Ground, lang: Lang, col0: number, col1: number): void {
  const look = ROOM_LOOK[room.id]
  const from = Math.max(0, col0)
  const to = Math.min(room.cols, col1)
  const ground: GroundTile[] = []
  const abc: { col: number; row: number }[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = from; col < to; col++) {
      const code = room.tiles[row * room.cols + col]
      if (code === TILE.ground) {
        ground.push({
          col,
          row,
          h: row === ROWS - 1 ? 1.5 : 1,
          top: !groundAt(room, col, row - 1),
          right: !groundAt(room, col + 1, row),
          bottom: !groundAt(room, col, row + 1),
          left: !groundAt(room, col - 1, row),
        })
      } else if (code === TILE.abc) abc.push({ col, row })
    }
  }
  const all = pieces(room)
  const columns = all.columns.filter((c) => c.col < to && c.col + c.w > from)
  const shelves = all.shelves.filter((s) => s.col < to && s.col + s.w > from)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // The paper shadow of everything at once, so overlaps never darken twice.
  ctx.save()
  ctx.translate(PAPER_SHADOW[0], PAPER_SHADOW[1])
  ctx.beginPath()
  for (const g of ground) groundPath(ctx, g)
  for (const a of abc) cornerRectPath(ctx, a.col, a.row, 1, 1, ABC_R, ABC_R, ABC_R, ABC_R)
  for (const c of columns) ctx.rect(c.col, c.row, c.w, c.h)
  for (const s of shelves) ctx.rect(s.col, s.row, s.w, PLANK)
  ctx.fillStyle = COLOR.paper
  ctx.fill()
  ctx.restore()
  if (ground.length > 0) drawGround(ctx, room, look, ground)
  for (const c of columns) COLUMN_ART[room.id](ctx, look, c)
  if (abc.length > 0) drawAbc(ctx, room, lang, abc)
  for (const s of shelves) SHELF_ART[room.id](ctx, look, s)
  ctx.restore()
}

/** The ground as one shape: shade, the lit face lifted over it, the room's marks, the band along every exposed top, then the ink on exposed sides. */
function drawGround(ctx: CanvasRenderingContext2D, room: Ground, look: RoomLook, ground: readonly GroundTile[]) {
  const outline = () => {
    ctx.beginPath()
    for (const g of ground) groundPath(ctx, g)
  }
  outline()
  ctx.fillStyle = look.groundShade
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.translate(0, -SHADE_BLOCK)
  outline()
  ctx.translate(0, SHADE_BLOCK)
  ctx.fillStyle = look.ground
  ctx.fill()
  MARKS[room.id](ctx, look, ground, room)
  const tops = ground.filter((g) => g.top)
  const n = look.band.length
  for (let i = 0; i < n; i++) {
    const mine = tops.filter((g) => g.col % n === i)
    if (mine.length === 0) continue
    ctx.beginPath()
    for (const g of mine) bandPath(ctx, g.col, g.row, 0)
    ctx.fillStyle = look.bandShade[i]
    ctx.fill()
    ctx.beginPath()
    for (const g of mine) bandPath(ctx, g.col, g.row, -BAND_RIM)
    ctx.fillStyle = look.band[i]
    ctx.fill()
  }
  if (room.id === 'toys') {
    // Each play mat's tab reaches into the next mat.
    for (const g of tops) {
      if (g.col + 1 >= room.cols || !groundAt(room, g.col + 1, g.row) || groundAt(room, g.col + 1, g.row - 1)) continue
      ctx.beginPath()
      ctx.arc(g.col + 1.02, g.row + 0.1, 0.07, 0, Math.PI * 2)
      ctx.fillStyle = look.band[g.col % n]
      ctx.fill()
    }
  }
  ctx.beginPath()
  for (const g of tops) ctx.rect(g.col, g.row - 0.1, 1, 0.1 + LIGHT_STRIP)
  ctx.fillStyle = look.bandLight
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  for (const g of ground) edgePath(ctx, g)
  ctx.lineWidth = lw(LINE_EDGE)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** What each room's ground shows on its face, over the fill and under the band, clipped to the ground. */
const MARKS: Record<RoomId, (ctx: CanvasRenderingContext2D, look: RoomLook, ground: readonly GroundTile[], room: Ground) => void> = {
  // Pebbles in the soil.
  garden: (ctx, look, ground) => {
    ctx.beginPath()
    for (const g of ground) {
      const n = hash(g.col, g.row) < 0.55 ? 1 : 2
      const top = g.top ? 0.42 : 0.14
      for (let i = 0; i < n; i++) {
        const rx = 0.06 + 0.05 * hash(g.col + i * 31, g.row + 7)
        ellipseSub(ctx, g.col + 0.15 + 0.7 * hash(g.col * 2 + i, g.row + 101), g.row + top + (0.8 - top) * hash(g.col + 37, g.row * 3 + i), rx, rx * 0.7, 0)
      }
    }
    ctx.fillStyle = look.groundMark
    ctx.fill()
  },
  // Drawer fronts two tiles wide, each with a white knob.
  kitchen: (ctx, look, ground, room) => {
    const isGround = (col: number, row: number) => col >= 0 && col < room.cols && room.tiles[row * room.cols + col] === TILE.ground
    const knobs: number[] = []
    ctx.beginPath()
    for (const g of ground) {
      const pair = g.col % 2 === 0 ? g.col + 1 : g.col - 1
      const paired = isGround(pair, g.row)
      if (paired && g.col % 2 === 1) continue
      const x = g.col
      const w = paired ? 2 : 1
      const top = g.row + (g.top || (paired && !groundAt(room, pair, g.row - 1)) ? 0.36 : 0.12)
      const bottom = g.row + 0.88
      cornerRectPath(ctx, x + 0.12, top, w - 0.24, bottom - top, 0.08, 0.08, 0.08, 0.08)
      knobs.push(x + w / 2, (top + bottom) / 2)
    }
    ctx.lineWidth = lw(0.045)
    ctx.strokeStyle = look.groundMark
    ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i < knobs.length; i += 2) {
      ctx.moveTo(knobs[i] + 0.075, knobs[i + 1])
      ctx.arc(knobs[i], knobs[i + 1], 0.075, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  },
  // Lemon floor tiles, four to a tile.
  bath: (ctx, look, ground) => {
    ctx.beginPath()
    for (const g of ground) {
      ctx.moveTo(g.col, g.row)
      ctx.lineTo(g.col, g.row + 1)
      ctx.moveTo(g.col + 0.5, g.row)
      ctx.lineTo(g.col + 0.5, g.row + 1)
      ctx.moveTo(g.col, g.row)
      ctx.lineTo(g.col + 1, g.row)
      ctx.moveTo(g.col, g.row + 0.5)
      ctx.lineTo(g.col + 1, g.row + 0.5)
    }
    ctx.lineWidth = lw(0.04)
    ctx.strokeStyle = look.groundMark
    ctx.stroke()
  },
  // Floorboards two to a tile, their joints staggered.
  toys: (ctx, look, ground) => {
    ctx.beginPath()
    for (const g of ground) {
      for (let j = 0; j < 2; j++) {
        const y = g.row + j * 0.5
        ctx.moveTo(g.col, y)
        ctx.lineTo(g.col + 1, y)
        if (hash(g.col, g.row * 2 + j) < 0.6) {
          const x = g.col + 0.2 + 0.6 * hash(g.col + 13, g.row * 2 + j)
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + 0.5)
        }
      }
    }
    ctx.lineWidth = lw(0.04)
    ctx.strokeStyle = look.groundMark
    ctx.stroke()
  },
  // Fish-scale shingles, three rows to a tile, every other row shifted half a scale.
  roof: (ctx, look, ground) => {
    ctx.beginPath()
    for (const g of ground) {
      for (let j = 0; j < 3; j++) {
        const n = g.row * 3 + j
        for (let i = 0; i < 2; i++) {
          const x = g.col + 0.25 + 0.5 * i + (n % 2 === 1 ? 0.25 : 0)
          ctx.moveTo(x + 0.25, n / 3)
          ctx.arc(x, n / 3, 0.25, 0, Math.PI)
        }
      }
    }
    ctx.lineWidth = lw(0.045)
    ctx.strokeStyle = look.groundMark
    ctx.stroke()
  },
}

/**
 * The letter the ABC block at (col, row) shows in `lang`. The map writes each run of blocks
 * in a row as a word's id, and BLOCK_WORDS (words.ts) has the word in both languages, as
 * long as the run. Throws on a run it does not have, or a word of another length.
 */
export function blockLetter(room: Ground, col: number, row: number, lang: Lang): string {
  const at = (c: number) => room.letters[row * room.cols + c]!
  let c0 = col
  while (c0 > 0 && at(c0 - 1) !== '') c0 -= 1
  let c1 = col + 1
  while (c1 < room.cols && at(c1) !== '') c1 += 1
  const id = Array.from({ length: c1 - c0 }, (_, k) => at(c0 + k)).join('')
  const words = BLOCK_WORDS[id]
  if (!words) throw new Error(`room ${room.id}, row ${row}, column ${c0}: the blocks spell ${id}, which BLOCK_WORDS in words.ts does not have`)
  const word = inLang(words, lang)
  if (word.length !== id.length) throw new Error(`BLOCK_WORDS in words.ts: ${id} is ${word} in ${lang}, not ${id.length} letters long`)
  return word[col - c0]!
}

/** ABC blocks: toy blocks in four colours, each with a white inset square and its letter in `lang`, crisp in device pixels. */
function drawAbc(ctx: CanvasRenderingContext2D, room: Ground, lang: Lang, abc: readonly { col: number; row: number }[]) {
  for (const a of abc) {
    const [lit, shade] = ABC_FACES[(a.col + a.row) % ABC_FACES.length]
    inkPart(ctx, (k) => roundRectPath(k, a.col, a.row, 1, 1, ABC_R), lit, shade, SHADE_BLOCK, LINE, null)
  }
  ctx.save()
  ctx.globalAlpha *= 0.6
  ctx.beginPath()
  for (const a of abc) cornerRectPath(ctx, a.col + 0.14, a.row + 0.14, 0.72, 0.72, 0.05, 0.05, 0.05, 0.05)
  ctx.lineWidth = lw(0.04)
  ctx.strokeStyle = '#FFFFFF'
  ctx.stroke()
  ctx.restore()
  const m = ctx.getTransform()
  const scale = Math.hypot(m.a, m.b)
  ctx.save()
  ctx.font = `700 ${Math.round(LETTER * scale)}px "Fredoka Variable"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2 * LETTER_EDGE * scale
  ctx.strokeStyle = INK
  ctx.fillStyle = '#FFFFFF'
  for (const a of abc) {
    const letter = blockLetter(room, a.col, a.row, lang)
    // Centred on the letter without its dots, so Ä and Ö stand where A and O do and their dots rise above.
    const box = ctx.measureText(letter.normalize('NFD')[0]!)
    const cx = a.col + 0.5
    const cy = a.row + 0.5
    ctx.setTransform(1, 0, 0, 1, Math.round(m.a * cx + m.c * cy + m.e), Math.round(m.b * cx + m.d * cy + m.f))
    const dy = (box.actualBoundingBoxAscent - box.actualBoundingBoxDescent) / 2
    ctx.strokeText(letter, 0, dy)
    ctx.fillText(letter, 0, dy)
  }
  ctx.restore()
}

/** Each room's column, filling its tiles' rectangle (tapering at most 0.08 a side) with its trim inside it. */
const COLUMN_ART: Record<RoomId, (ctx: CanvasRenderingContext2D, look: RoomLook, c: Column) => void> = {
  // A terracotta flower pot under a rim band, a mound of soil and a sprout peeking over it.
  garden: (ctx, look, { col: x, row: y, w, h }) => {
    const cx = x + w / 2
    ctx.beginPath()
    ctx.moveTo(cx + 0.14, y + 0.02)
    ctx.quadraticCurveTo(cx + 0.08, y - 0.14, cx + 0.19, y - 0.27)
    inkLine(ctx, SPROUT[0], 0.045, LINE_DETAIL)
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        ellipseSub(k, cx + 0.09, y - 0.27, 0.1, 0.05, 0.45)
        ellipseSub(k, cx + 0.29, y - 0.31, 0.1, 0.05, -0.4)
      },
      SPROUT[0],
      SPROUT[1],
      0.025,
      LINE_DETAIL,
      null,
    )
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        k.ellipse(cx, y + 0.05, w / 2 - 0.22, 0.13, 0, Math.PI, Math.PI * 2)
        k.closePath()
      },
      SOIL[0],
      SOIL[1],
      0.03,
      LINE_DETAIL,
      null,
    )
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        k.moveTo(x + 0.05, y + 0.3)
        k.lineTo(x + w - 0.05, y + 0.3)
        k.arcTo(x + w - 0.08, y + h, x + w / 2, y + h, 0.12)
        k.arcTo(x + 0.08, y + h, x + 0.05, y + 0.3, 0.12)
        k.closePath()
      },
      look.column[0],
      look.columnShade[0],
      SHADE_BLOCK,
      LINE,
      null,
    )
    inkPart(ctx, (k) => roundRectPath(k, x, y, w, 0.34, 0.08), look.columnTrim, look.column[0], 0.08, LINE, null)
  },
  // A glass candy jar under a pink lid with a white band.
  kitchen: (ctx, look, { col: x, row: y, w, h }) => {
    const top = y + 0.24
    const glass = (k: CanvasRenderingContext2D) => roundRectPath(k, x + 0.05, top, w - 0.1, h - 0.24, Math.min(0.3, (h - 0.24) / 2))
    paintedPart(ctx, glass, look.column[0], look.columnShade[0], SHADE_BLOCK, LINE, (lit) => {
      const fill = top + (y + h - top) * 0.42
      for (let i = 0; i < CANDY.length; i++) {
        ctx.beginPath()
        for (let j = 0; y + h - 0.17 - j * 0.25 > fill; j++) {
          const cy = y + h - 0.17 - j * 0.25
          for (let k = 0, cx = x + 0.22 + (j % 2) * 0.15; cx < x + w - 0.12; k++, cx += 0.3) {
            if (Math.floor(hash(x * 7 + k, y * 5 + j) * CANDY.length) !== i) continue
            ctx.moveTo(cx + 0.14, cy)
            ctx.arc(cx, cy, 0.14, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = CANDY[i]
        ctx.fill()
      }
      if (!lit) dim(ctx)
    })
    shine(ctx, x + 0.3, top + 0.32, 0.07, Math.min(0.24, (h - 0.24) * 0.25), 0)
    inkPart(ctx, (k) => roundRectPath(k, x, y, w, 0.34, 0.08), look.columnTrim, LID_SHADE, 0.08, LINE, null)
    ctx.beginPath()
    ctx.rect(x + 0.02, y + 0.12, w - 0.04, 0.08)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
  },
  // A shampoo bottle (two colours in turn) with a label, a shine and a white cap.
  bath: (ctx, look, { col: x, row: y, w, h }) => {
    const i = Math.floor(x / 2) % look.column.length
    const top = y + 0.26
    const body = (k: CanvasRenderingContext2D) => {
      k.beginPath()
      cornerRectPath(k, x, top, w, h - 0.26, 0.2, 0.2, 0.1, 0.1)
    }
    paintedPart(ctx, body, look.column[i], look.columnShade[i], SHADE_BLOCK, LINE, (lit) => {
      const ly = top + (h - 0.26) * 0.3
      const lh = Math.max(0.24, (h - 0.26) * 0.38)
      roundRectPath(ctx, x + 0.32, ly, w - 0.64, lh, 0.1)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.fill()
      // A drop of soap and two small bubbles on the label.
      const s = Math.min(1, lh / 0.42)
      const dx = x + w * 0.42
      const dy = ly + lh * 0.56
      ctx.beginPath()
      ctx.moveTo(dx, dy - 0.2 * s)
      ctx.bezierCurveTo(dx + 0.05 * s, dy - 0.1 * s, dx + 0.12 * s, dy - 0.04 * s, dx + 0.12 * s, dy + 0.04 * s)
      ctx.arc(dx, dy + 0.04 * s, 0.12 * s, 0, Math.PI)
      ctx.bezierCurveTo(dx - 0.12 * s, dy - 0.04 * s, dx - 0.05 * s, dy - 0.1 * s, dx, dy - 0.2 * s)
      ellipseSub(ctx, x + w * 0.62, ly + lh * 0.36, 0.06 * s, 0.06 * s, 0)
      ellipseSub(ctx, x + w * 0.66, ly + lh * 0.7, 0.04 * s, 0.04 * s, 0)
      ctx.fillStyle = look.column[i]
      ctx.fill()
      if (!lit) dim(ctx)
    })
    shine(ctx, x + 0.24, top + 0.28, 0.06, Math.min(0.18, (h - 0.26) * 0.22), 0)
    inkPart(ctx, (k) => roundRectPath(k, x + 0.08, y, w - 0.16, 0.32, 0.08), look.columnTrim, CAP_SHADE, 0.07, LINE, null)
    ctx.beginPath()
    for (let j = 1; j < 5; j++) {
      ctx.moveTo(x + 0.08 + ((w - 0.16) * j) / 5, y + 0.08)
      ctx.lineTo(x + 0.08 + ((w - 0.16) * j) / 5, y + 0.22)
    }
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = CAP_SHADE
    ctx.stroke()
  },
  // A crayon box with a wavy band, its crayons standing inside behind a window. Nothing pokes out of its top, which she stands on.
  toys: (ctx, look, { col: x, row: y, w, h }) => {
    paintedPart(ctx, (k) => roundRectPath(k, x, y, w, h, 0.08), look.column[0], look.columnShade[0], SHADE_BLOCK, LINE, (lit) => {
      const wave = (u: number, y0: number) => y0 + 0.04 * Math.sin(u * Math.PI * 2)
      ctx.beginPath()
      for (let u = 0; u <= w + 1e-9; u += 0.125) ctx.lineTo(x + u, wave(u, y + 0.56))
      for (let u = w; u >= -1e-9; u -= 0.125) ctx.lineTo(x + u, wave(u, y + 0.8))
      ctx.closePath()
      ctx.fillStyle = look.columnTrim
      ctx.fill()
      ctx.lineWidth = lw(LINE_DETAIL)
      ctx.strokeStyle = INK
      ctx.stroke()
      if (!lit) dim(ctx)
    })
    const pane = (k: CanvasRenderingContext2D) => roundRectPath(k, x + 0.16, y + 0.1, w - 0.32, 0.34, 0.07)
    ctx.save()
    pane(ctx)
    ctx.fillStyle = CRAYON_INSIDE
    ctx.fill()
    ctx.clip()
    const n = w * 2
    for (let i = 0; i < n; i++) {
      const cx = x + 0.16 + ((w - 0.32) * (i + 0.5)) / n
      const tip = y + 0.15 + 0.05 * hash(x + i, y)
      const [lit, shade] = CRAYONS[(x + i) % CRAYONS.length]
      inkPart(
        ctx,
        (k) => {
          k.beginPath()
          k.moveTo(cx - 0.12, y + 0.6)
          k.lineTo(cx - 0.12, tip + 0.13)
          k.lineTo(cx - 0.03, tip)
          k.lineTo(cx + 0.03, tip)
          k.lineTo(cx + 0.12, tip + 0.13)
          k.lineTo(cx + 0.12, y + 0.6)
          k.closePath()
        },
        lit,
        shade,
        0.03,
        LINE_DETAIL,
        null,
      )
    }
    ctx.restore()
    pane(ctx)
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  },
  // A plastered chimney with a band round its neck, under a moonlit cap, a wisp of smoke over it.
  roof: (ctx, look, { col: x, row: y, w, h }) => {
    const cx = x + w / 2
    ctx.beginPath()
    for (const [dx, dy, r] of [
      [0.05, -0.12, 0.12],
      [0.2, -0.27, 0.13],
      [0.08, -0.4, 0.09],
    ] as const) {
      ctx.moveTo(cx + dx + r, y + dy)
      ctx.arc(cx + dx, y + dy, r, 0, Math.PI * 2)
    }
    ctx.fillStyle = SMOKE
    ctx.fill()
    const top = y + 0.28
    paintedPart(
      ctx,
      (k) => {
        k.beginPath()
        k.rect(x + 0.05, top, w - 0.1, h - 0.28)
      },
      look.column[0],
      look.columnShade[0],
      SHADE_BLOCK,
      LINE,
      (lit) => {
        ctx.beginPath()
        ctx.rect(x, top + 0.16, w, 0.16)
        ctx.fillStyle = CHIMNEY_BAND
        ctx.fill()
        if (!lit) dim(ctx)
      },
    )
    inkPart(ctx, (k) => roundRectPath(k, x, y, w, 0.32, 0.06), look.columnTrim, CHIMNEY_CAP_SHADE, 0.08, LINE, null)
  },
}

/** Two brackets under a shelf's ends, holding it to the wall behind, with air below. */
function brackets(ctx: CanvasRenderingContext2D, look: RoomLook, s: Shelf) {
  const inset = Math.min(0.3, s.w * 0.2)
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      for (const side of [-1, 1] as const) {
        const bx = side < 0 ? s.col + inset : s.col + s.w - inset
        k.moveTo(bx, s.row + PLANK - 0.02)
        k.lineTo(bx - side * 0.28, s.row + PLANK - 0.02)
        k.lineTo(bx, s.row + PLANK + 0.36)
        k.closePath()
      }
    },
    look.shelfTrim,
    look.shelfTrim,
    0,
    LINE,
    null,
  )
}

/** Each room's shelf: a plank PLANK thick at the top of its row, on two brackets. */
const SHELF_ART: Record<RoomId, (ctx: CanvasRenderingContext2D, look: RoomLook, s: Shelf) => void> = {
  // A bench plank with a bolt near each end.
  garden: (ctx, look, s) => {
    brackets(ctx, look, s)
    inkPart(ctx, (k) => roundRectPath(k, s.col + 0.02, s.row, s.w - 0.04, PLANK, 0.08), look.shelf[0], look.shelfShade[0], 0.08, LINE, null)
    ctx.beginPath()
    for (const bx of [s.col + 0.2, s.col + s.w - 0.2]) {
      ctx.moveTo(bx + 0.035, s.row + 0.12)
      ctx.arc(bx, s.row + 0.12, 0.035, 0, Math.PI * 2)
    }
    ctx.fillStyle = look.shelfShade[0]
    ctx.fill()
  },
  // A wooden cutting board with its grain and a hanging hole.
  kitchen: (ctx, look, s) => {
    brackets(ctx, look, s)
    inkPart(ctx, (k) => roundRectPath(k, s.col + 0.02, s.row, s.w - 0.04, PLANK, 0.13), look.shelf[0], look.shelfShade[0], 0.08, LINE, null)
    ctx.beginPath()
    ctx.moveTo(s.col + 0.25, s.row + 0.1)
    ctx.quadraticCurveTo(s.col + s.w * 0.4, s.row + 0.06, s.col + s.w - 0.6, s.row + 0.1)
    ctx.moveTo(s.col + 0.5, s.row + 0.17)
    ctx.quadraticCurveTo(s.col + s.w * 0.55, s.row + 0.2, s.col + s.w - 0.45, s.row + 0.16)
    ctx.lineWidth = lw(0.03)
    ctx.strokeStyle = look.shelfShade[0]
    ctx.stroke()
    ctx.beginPath()
    ellipseSub(ctx, s.col + s.w - 0.24, s.row + 0.12, 0.08, 0.045, 0)
    ctx.fillStyle = look.shelfShade[0]
    ctx.fill()
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  },
  // A white porcelain shelf on chrome brackets.
  bath: (ctx, look, s) => {
    brackets(ctx, look, s)
    inkPart(ctx, (k) => roundRectPath(k, s.col + 0.02, s.row, s.w - 0.04, PLANK, 0.1), look.shelf[0], look.shelfShade[0], 0.09, LINE, null)
  },
  // Books lying flat, one to a tile, their pages showing.
  toys: (ctx, look, s) => {
    brackets(ctx, look, s)
    for (let i = 0; i < s.w; i++) {
      const x = s.col + i
      const c = (s.col + i) % look.shelf.length
      inkPart(ctx, (k) => roundRectPath(k, x + 0.02, s.row, 0.96, PLANK, 0.05), look.shelf[c], look.shelfShade[c], 0.05, LINE, null)
      ctx.beginPath()
      ctx.rect(x + 0.2, s.row + 0.07, 0.78, 0.13)
      ctx.fillStyle = PAGES
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + 0.2, s.row + 0.07)
      ctx.lineTo(x + 0.98, s.row + 0.07)
      ctx.moveTo(x + 0.2, s.row + 0.2)
      ctx.lineTo(x + 0.98, s.row + 0.2)
      ctx.moveTo(x + 0.2, s.row + 0.07)
      ctx.lineTo(x + 0.2, s.row + 0.2)
      ctx.lineWidth = lw(LINE_DETAIL)
      ctx.strokeStyle = INK
      ctx.stroke()
    }
  },
  // A striped awning with a scalloped edge.
  roof: (ctx, look, s) => {
    brackets(ctx, look, s)
    const x0 = s.col + 0.02
    const x1 = s.col + s.w - 0.02
    const awning = (k: CanvasRenderingContext2D) => {
      const n = Math.round((x1 - x0) * 3)
      const r = (x1 - x0) / n / 2
      k.beginPath()
      k.moveTo(x0, s.row)
      k.lineTo(x1, s.row)
      k.lineTo(x1, s.row + 0.17)
      for (let i = n - 1; i >= 0; i--) k.ellipse(x0 + (i * 2 + 1) * r, s.row + 0.17, r, PLANK - 0.17, 0, 0, Math.PI)
      k.closePath()
    }
    paintedPart(ctx, awning, AWNING_WHITE[0], AWNING_WHITE[1], 0.07, LINE, (lit) => {
      ctx.beginPath()
      for (let x = s.col; x < s.col + s.w; x += 0.5) ctx.rect(x, s.row - 0.1, 0.25, PLANK + 0.2)
      ctx.fillStyle = lit ? look.shelf[0] : look.shelfShade[0]
      ctx.fill()
    })
  },
}

// ---------------------------------------------------------------------------------------
// Pits: drawn every frame, under the terrain, with no ink (water and air are not ground).

/** Water's surface: a sine WAVE_AMP high and WAVE_LENGTH long scrolling at WAVE_SPEED tiles/s, a SURFACE_BAND thick lighter band under it, PIT_DROP below the floor line. */
const WAVE_AMP = 0.06
const WAVE_LENGTH = 1.5
const WAVE_SPEED = 0.5
const SURFACE_BAND = 0.12
const PIT_DROP = 0.6

/** The water surface's height above its rest line at x, at time t. */
const wave = (x: number, t: number) => WAVE_AMP * Math.sin(((x - WAVE_SPEED * t) / WAVE_LENGTH) * Math.PI * 2)

/** Where a gap's surface lies: PIT_DROP under the floor top beside it, the higher-numbered (lower) of its two sides; a side past the room's edge is wall. The fall's splash (effects.ts) lands on it too. */
export function pitSurface(room: Ground, g: Gap) {
  const side = (col: number) => (col >= 0 && col < room.cols ? room.floor[col] : -1)
  const top = Math.max(side(g.col0 - 1), side(g.col1))
  if (top < 0) throw new Error(`room ${room.id}: the gap at columns ${g.col0} to ${g.col1} has no floor beside it`)
  return top + PIT_DROP
}

/** Water across a gap and a little under its walls: the body down to the room's bottom, then the surface band. */
function water(ctx: CanvasRenderingContext2D, look: RoomLook, g: Gap, surface: number, t: number) {
  const x0 = g.col0 - 0.2
  const x1 = g.col1 + 0.2
  const n = Math.ceil((x1 - x0) / 0.125)
  ctx.beginPath()
  ctx.moveTo(x0, ROWS)
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    ctx.lineTo(x, surface + wave(x, t))
  }
  ctx.lineTo(x1, ROWS)
  ctx.closePath()
  ctx.fillStyle = look.pit
  ctx.fill()
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    ctx.lineTo(x, surface + wave(x, t))
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n
    ctx.lineTo(x, surface + wave(x, t) + SURFACE_BAND)
  }
  ctx.closePath()
  ctx.fillStyle = look.pitSurface
  ctx.fill()
}

/** White foam riding the surface: a clump of three puffs about `size` in radius every `every` tiles. */
function foam(ctx: CanvasRenderingContext2D, colour: string, g: Gap, surface: number, t: number, every: number, size: number) {
  ctx.beginPath()
  for (let x = g.col0 + every * 0.5 * hash(g.col0, 3), i = 0; x < g.col1; x += every, i++) {
    const y = surface + wave(x, t) - 0.02 + 0.025 * Math.sin(t * 2.4 + i * 1.7)
    for (let j = 0; j < 3; j++) {
      const r = size * (0.7 + 0.5 * hash(g.col0 * 5 + i, j))
      const px = x + (j - 1) * size * 1.3
      ctx.moveTo(px + r, y)
      ctx.arc(px, y, r, 0, Math.PI * 2)
    }
  }
  ctx.fillStyle = colour
  ctx.fill()
}

/** What lies at the bottom of a gap in each room, with `surface` the y of its top. */
const PIT_ART: Record<RoomId, (ctx: CanvasRenderingContext2D, look: RoomLook, g: Gap, surface: number, t: number) => void> = {
  // A lily pond: water, pads riding the waves, a pink flower on the first pad.
  garden: (ctx, look, g, surface, t) => {
    water(ctx, look, g, surface, t)
    ctx.beginPath()
    let first = -1
    for (let x = g.col0 + 0.5; x < g.col1 - 0.2; x += 1.1) {
      if (first < 0) first = x
      ellipseSub(ctx, x, surface + wave(x, t) - 0.01, 0.34, 0.075, 0)
    }
    ctx.fillStyle = look.pitBits[0]
    ctx.fill()
    if (first < 0) return
    const y = surface + wave(first, t) - 0.06
    ctx.beginPath()
    ellipseSub(ctx, first - 0.07, y, 0.07, 0.05, -0.5)
    ellipseSub(ctx, first + 0.07, y, 0.07, 0.05, 0.5)
    ellipseSub(ctx, first, y - 0.04, 0.05, 0.08, 0)
    ctx.fillStyle = look.pitBits[1]
    ctx.fill()
  },
  // The sink: grey-blue water under white suds.
  kitchen: (ctx, look, g, surface, t) => {
    water(ctx, look, g, surface, t)
    foam(ctx, look.pitBits[0], g, surface, t, 0.45, 0.12)
  },
  // Bath water with a few clumps of white foam.
  bath: (ctx, look, g, surface, t) => {
    water(ctx, look, g, surface, t)
    foam(ctx, look.pitBits[0], g, surface, t, 1.2, 0.09)
  },
  // A ball pit: balls packed over a pale floor, the top row jiggling.
  toys: (ctx, look, g, surface, t) => {
    ctx.beginPath()
    ctx.rect(g.col0 - 0.2, surface, g.col1 - g.col0 + 0.4, ROWS - surface)
    ctx.fillStyle = look.pit
    ctx.fill()
    const r = 0.2
    const balls: number[][] = look.pitBits.map(() => [])
    for (let j = 0; surface + j * r * 1.7 < ROWS + r; j++) {
      for (let i = 0, x = g.col0 - 0.1 + (j % 2) * r; x < g.col1 + 0.1; i++, x += r * 2) {
        const y = surface + 0.04 + j * r * 1.7 + (j === 0 ? 0.03 * Math.sin(t * 3 + i * 1.3) : 0)
        balls[Math.floor(hash(g.col0 * 11 + i, j) * balls.length)].push(x, y)
      }
    }
    balls.forEach((xy, c) => {
      ctx.beginPath()
      for (let i = 0; i < xy.length; i += 2) {
        ctx.moveTo(xy[i] + r, xy[i + 1])
        ctx.arc(xy[i], xy[i + 1], r, 0, Math.PI * 2)
      }
      ctx.fillStyle = look.pitBits[c]
      ctx.fill()
    })
    ctx.beginPath()
    for (const xy of balls) for (let i = 0; i < xy.length; i += 2) ellipseSub(ctx, xy[i] - r * 0.4, xy[i + 1] - r * 0.45, r * 0.25, r * 0.12, -0.6)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fill()
  },
  // Night air deepening as it goes down, fireflies drifting in it.
  roof: (ctx, look, g, surface, t) => {
    ctx.fillStyle = look.pit
    ctx.save()
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.22
      ctx.fillRect(g.col0 - 0.2, surface + i * 0.25, g.col1 - g.col0 + 0.4, ROWS - surface - i * 0.25)
    }
    ctx.restore()
    const w = g.col1 - g.col0
    for (let i = 0; i < Math.max(2, Math.round(w)); i++) {
      const x = g.col0 + ((i + 0.5) * w) / Math.max(2, Math.round(w)) + 0.3 * Math.sin(t * 0.7 + i * 2.1)
      const y = surface + 0.35 + 0.25 * Math.sin(t * 0.9 + i * 1.3)
      const glow = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.7)
      ctx.save()
      ctx.globalAlpha = 0.3 * glow
      ctx.beginPath()
      ctx.arc(x, y, 0.13, 0, Math.PI * 2)
      ctx.fillStyle = look.pitBits[0]
      ctx.fill()
      ctx.globalAlpha = 0.4 + 0.6 * glow
      ctx.beginPath()
      ctx.arc(x, y, 0.045, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  },
}

/** What lies at the bottom of every gap in the columns [col0, col1): a lily pond, sink suds, bath water, a ball pit, night air with fireflies. World units. */
export function drawPits(ctx: CanvasRenderingContext2D, room: Ground, col0: number, col1: number, t: number): void {
  const look = ROOM_LOOK[room.id]
  ctx.save()
  for (const g of room.gaps) {
    if (g.col1 <= col0 || g.col0 >= col1) continue
    PIT_ART[room.id](ctx, look, g, pitSurface(room, g), t)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Backdrops: device pixels, no ink, paler than the play layer. Far things move at a
// quarter of the camera's speed and mid things at half.

/** How fast the far and mid layers move with the camera. */
const FAR = 0.25
const MID = 0.5

/** The last sky gradient made, and the room and size it was made for. */
let skyCache: { key: string; fill: CanvasGradient } | null = null

/** The sky or wall fill: a plain colour, or a gradient made once per room and size. */
function skyFill(ctx: CanvasRenderingContext2D, room: Ground, v: View): string | CanvasGradient {
  const [top, bottom] = ROOM_LOOK[room.id].sky
  if (top === bottom) return top
  const key = `${room.id} ${v.top} ${v.tile}`
  if (!skyCache || skyCache.key !== key) {
    const fill = ctx.createLinearGradient(0, v.top, 0, v.top + 13 * v.tile)
    fill.addColorStop(0, top)
    fill.addColorStop(1, bottom)
    skyCache = { key, fill }
  }
  return skyCache.fill
}

/** Runs `draw` in a backdrop layer: tiles moving at `p` of the camera's speed, the room's rows fixed. x0 and x1 are the layer's visible edges, `bottom` the screen's bottom. */
function layer(ctx: CanvasRenderingContext2D, v: View, p: number, draw: (x0: number, x1: number, bottom: number) => void) {
  ctx.save()
  ctx.transform(v.tile, 0, 0, v.tile, -v.left * p * v.tile, v.top)
  const x0 = v.left * p
  draw(x0, x0 + v.width / v.tile, (v.height - v.top) / v.tile)
  ctx.restore()
}

/** The whole numbers k for which something placed every `every` tiles (and up to `reach` wide) can show between x0 and x1. */
function* each(x0: number, x1: number, every: number, reach: number) {
  for (let k = Math.floor((x0 - reach) / every); k * every <= x1 + reach; k++) yield k
}

/** A filled skyline: from the screen's bottom up to y = f(x) and back. */
function ridge(ctx: CanvasRenderingContext2D, x0: number, x1: number, bottom: number, colour: string, f: (x: number) => number) {
  ctx.beginPath()
  ctx.moveTo(x0 - 1, bottom)
  for (let x = Math.floor(x0) - 1; x <= x1 + 1; x += 0.5) ctx.lineTo(x, f(x))
  ctx.lineTo(x1 + 1, bottom)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()
}

/** Each room's layers over its sky or wall. */
const BACKDROP: Record<RoomId, (ctx: CanvasRenderingContext2D, v: View, t: number) => void> = {
  // Sunrise: a pale sun coming up behind soft hills, clouds drifting, giant flowers.
  garden: (ctx, v, t) => {
    layer(ctx, v, 0.05, () => {
      ctx.beginPath()
      ctx.arc(15, 10.1, 2.2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 246, 222, 0.55)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(15, 10.1, 1.45, 0, Math.PI * 2)
      ctx.fillStyle = '#FFF1C7'
      ctx.fill()
    })
    layer(ctx, v, 0.12, (x0, x1) => {
      const drift = t * 0.12
      ctx.beginPath()
      for (const k of each(x0 - drift, x1 - drift, 8, 3)) {
        const x = k * 8 + drift + hash(k, 11) * 3
        const y = 2.8 + hash(k, 12) * 3.2
        const s = 0.75 + hash(k, 13) * 0.5
        for (const [dx, dy, r] of CLOUD) {
          ctx.moveTo(x + (dx + r) * s, y + dy * s)
          ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2)
        }
        ctx.rect(x - 1.0 * s, y + 0.05 * s, 2.1 * s, 0.5 * s)
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fill()
    })
    layer(ctx, v, FAR, (x0, x1, bottom) => {
      ridge(ctx, x0, x1, bottom, '#CDEDC7', (x) => 10.1 - 1.3 * Math.sin(x * 0.31 + 0.8) - 0.5 * Math.sin(x * 0.83 + 2.1))
      ridge(ctx, x0, x1, bottom, '#BDE5B6', (x) => 11.6 - 0.8 * Math.sin(x * 0.45 + 2.9) - 0.35 * Math.sin(x * 1.1))
    })
    layer(ctx, v, MID, (x0, x1, bottom) => {
      ctx.beginPath()
      const heads: number[] = []
      const leaves: number[] = []
      for (const k of each(x0, x1, 6.5, 2)) {
        const x = k * 6.5 + hash(k, 21) * 2.5
        const y = 7.2 + hash(k, 22) * 2.6
        heads.push(x, y, 0.85 + hash(k, 23) * 0.35, hash(k, 24) < 0.5 ? 0 : 1)
        ctx.moveTo(x, bottom)
        ctx.quadraticCurveTo(x + 0.5, (y + bottom) / 2, x, y)
        leaves.push(x + 0.35, y + 2.4, -0.5, x - 0.35, y + 3.5, 0.5)
      }
      ctx.lineWidth = 0.2
      ctx.strokeStyle = '#A6DB9C'
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i < leaves.length; i += 3) ellipseSub(ctx, leaves[i], leaves[i + 1], 0.55, 0.2, leaves[i + 2])
      ctx.fillStyle = '#A6DB9C'
      ctx.fill()
      for (const kind of [0, 1]) {
        ctx.beginPath()
        for (let i = 0; i < heads.length; i += 4) {
          if (heads[i + 3] !== kind) continue
          const s = heads[i + 2]
          for (let p = 0; p < 6; p++) {
            const a = (p * Math.PI) / 3 + 0.3
            const px = heads[i] + Math.cos(a) * 0.55 * s
            const py = heads[i + 1] + Math.sin(a) * 0.55 * s
            ctx.moveTo(px + 0.42 * s, py)
            ctx.arc(px, py, 0.42 * s, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = kind === 0 ? '#FFC6DD' : '#FFEFA8'
        ctx.fill()
      }
      ctx.beginPath()
      for (let i = 0; i < heads.length; i += 4) {
        ctx.moveTo(heads[i] + 0.34 * heads[i + 2], heads[i + 1])
        ctx.arc(heads[i], heads[i + 1], 0.34 * heads[i + 2], 0, Math.PI * 2)
      }
      ctx.fillStyle = '#FFCF85'
      ctx.fill()
    })
  },
  // Morning: gingham wallpaper, wall cupboards and a bright window, a teapot and canisters on a shelf.
  kitchen: (ctx, v) => {
    layer(ctx, v, FAR, (x0, x1, bottom) => {
      const above = Math.floor(-v.top / v.tile) - 1
      ctx.beginPath()
      for (let x = Math.floor(x0); x < x1; x++) ctx.rect(x, above, 0.5, bottom - above)
      ctx.fillStyle = 'rgba(203, 238, 219, 0.55)'
      ctx.fill()
      ctx.beginPath()
      for (let y = above; y < bottom; y++) ctx.rect(x0 - 1, y, x1 - x0 + 2, 0.5)
      ctx.fill()
      // Cupboards and a window, every 12 tiles.
      ctx.beginPath()
      for (const k of each(x0, x1, 12, 10)) {
        const x = k * 12 + 1
        cornerRectPath(ctx, x, 1.6, 1.95, 3.2, 0.15, 0.15, 0.15, 0.15)
        cornerRectPath(ctx, x + 2.05, 1.6, 1.95, 3.2, 0.15, 0.15, 0.15, 0.15)
      }
      ctx.fillStyle = '#F2DDB4'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 12, 10)) {
        const x = k * 12 + 1
        cornerRectPath(ctx, x + 1.6, 3.7, 0.14, 0.7, 0.07, 0.07, 0.07, 0.07)
        cornerRectPath(ctx, x + 2.26, 3.7, 0.14, 0.7, 0.07, 0.07, 0.07, 0.07)
      }
      ctx.fillStyle = '#E6C994'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 12, 10)) cornerRectPath(ctx, k * 12 + 6.3, 1.9, 3.4, 3.8, 0.25, 0.25, 0.1, 0.1)
      ctx.fillStyle = '#FBFEFF'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 12, 10)) {
        const x = k * 12 + 6.3
        ctx.rect(x + 0.25, 2.15, 1.35, 1.55)
        ctx.rect(x + 1.8, 2.15, 1.35, 1.55)
        ctx.rect(x + 0.25, 3.9, 1.35, 1.55)
        ctx.rect(x + 1.8, 3.9, 1.35, 1.55)
      }
      ctx.fillStyle = '#D5F0FF'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 12, 10)) {
        ctx.moveTo(k * 12 + 8.75, 2.75)
        ctx.arc(k * 12 + 8.4, 2.75, 0.35, 0, Math.PI * 2)
      }
      ctx.fillStyle = '#FFF6CF'
      ctx.fill()
    })
    layer(ctx, v, MID, (x0, x1) => {
      ctx.beginPath()
      for (const k of each(x0, x1, 11, 7)) ctx.rect(k * 11 + 0.6, 8.5, 6.6, 0.16)
      ctx.fillStyle = '#F1E1CF'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 11, 7)) {
        const x = k * 11
        // The teapot.
        ellipseSub(ctx, x + 2.4, 7.8, 0.95, 0.72, 0)
        ellipseSub(ctx, x + 2.4, 7.1, 0.45, 0.2, 0)
        ellipseSub(ctx, x + 2.4, 6.85, 0.12, 0.12, 0)
        ctx.moveTo(x + 3.2, 7.7)
        ctx.quadraticCurveTo(x + 3.7, 7.7, x + 3.95, 7.0)
        ctx.lineTo(x + 4.15, 7.05)
        ctx.quadraticCurveTo(x + 3.95, 8.1, x + 3.25, 8.1)
        ctx.closePath()
      }
      ctx.fillStyle = '#F7CFCF'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 11, 7)) {
        const x = k * 11
        ctx.moveTo(x + 1.45 + 0.35, 7.75)
        ctx.arc(x + 1.45, 7.75, 0.35, 0, Math.PI * 2)
      }
      ctx.lineWidth = 0.14
      ctx.strokeStyle = '#F7CFCF'
      ctx.stroke()
      ctx.beginPath()
      for (const k of each(x0, x1, 11, 7)) {
        const x = k * 11 + 4.7
        cornerRectPath(ctx, x, 7.1, 0.75, 1.4, 0.12, 0.12, 0.05, 0.05)
        cornerRectPath(ctx, x + 0.9, 6.7, 0.8, 1.8, 0.12, 0.12, 0.05, 0.05)
        cornerRectPath(ctx, x + 1.85, 7.4, 0.65, 1.1, 0.12, 0.12, 0.05, 0.05)
      }
      ctx.fillStyle = '#FFE3A6'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 11, 7)) {
        const x = k * 11 + 4.7
        cornerRectPath(ctx, x - 0.04, 6.95, 0.83, 0.22, 0.1, 0.1, 0.03, 0.03)
        cornerRectPath(ctx, x + 0.86, 6.55, 0.88, 0.22, 0.1, 0.1, 0.03, 0.03)
        cornerRectPath(ctx, x + 1.81, 7.25, 0.73, 0.22, 0.1, 0.1, 0.03, 0.03)
      }
      ctx.fillStyle = '#F5D08A'
      ctx.fill()
    })
  },
  // Noon: tiles on the wall, a dotted shower curtain, a giant rubber duck, foam drifting up.
  bath: (ctx, v, t) => {
    layer(ctx, v, FAR, (x0, x1, bottom) => {
      const above = Math.floor(-v.top / v.tile) - 1
      ctx.beginPath()
      for (let x = Math.floor(x0); x <= x1; x++) {
        ctx.moveTo(x, above)
        ctx.lineTo(x, bottom)
      }
      for (let y = above; y <= bottom; y++) {
        ctx.moveTo(x0 - 1, y)
        ctx.lineTo(x1 + 1, y)
      }
      ctx.lineWidth = 0.06
      ctx.strokeStyle = '#9FDCE4'
      ctx.stroke()
      // A shower curtain hanging from a rod, every CURTAIN[0] tiles.
      const [every, w, top, hem] = CURTAIN
      const folds = Math.round(w * 2)
      ctx.beginPath()
      for (const k of each(x0, x1, every, w + 1)) {
        const x = k * every + 2
        ctx.moveTo(x, top)
        ctx.lineTo(x + w, top)
        ctx.lineTo(x + w, hem)
        for (let i = folds - 1; i >= 0; i--) ctx.quadraticCurveTo(x + ((i + 0.5) * w) / folds, hem + 0.35, x + (i * w) / folds, hem)
        ctx.closePath()
      }
      ctx.fillStyle = '#FFD3E1'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, every, w + 1)) {
        const x = k * every + 2
        for (let i = 1; i < folds; i += 2) ctx.rect(x + (i * w) / folds, top, w / folds, hem - top + 0.1)
      }
      ctx.fillStyle = 'rgba(255, 186, 208, 0.5)'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, every, w + 1)) {
        const x = k * every + 2
        for (let j = 0; top + 0.55 + j * 0.85 < hem - 0.15; j++) {
          for (let dx = x + 0.4 + (j % 2) * 0.45; dx < x + w - 0.2; dx += 0.9) {
            ctx.moveTo(dx + 0.1, top + 0.55 + j * 0.85)
            ctx.arc(dx, top + 0.55 + j * 0.85, 0.1, 0, Math.PI * 2)
          }
        }
        ctx.rect(x - 0.4, top - 0.14, w + 0.8, 0.14)
      }
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
    })
    layer(ctx, v, MID, (x0, x1) => {
      ctx.beginPath()
      for (const k of each(x0, x1, 19, 5)) {
        const x = k * 19 + 9
        const y = 12.6 + 0.07 * Math.sin(t * 1.3 + k)
        ellipseSub(ctx, x, y - 0.95, 1.65, 0.95, 0)
        ctx.moveTo(x - 1.4, y - 1.2)
        ctx.quadraticCurveTo(x - 2.1, y - 2.2, x - 1.85, y - 1.2)
        ctx.closePath()
        ellipseSub(ctx, x + 0.85, y - 2.35, 0.8, 0.75, 0)
      }
      ctx.fillStyle = DUCK[0]
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 19, 5)) {
        const x = k * 19 + 9
        const y = 12.6 + 0.07 * Math.sin(t * 1.3 + k)
        ellipseSub(ctx, x + 1.75, y - 2.2, 0.48, 0.2, 0.1)
      }
      ctx.fillStyle = DUCK[1]
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 2.3, 1)) {
        const x = k * 2.3 + hash(k, 31) * 2
        const y = 12.5 - ((t * 0.25 + hash(k, 32) * 11) % 11)
        const r = 0.05 + 0.07 * hash(k, 33)
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fill()
    })
  },
  // Afternoon: striped wallpaper in slanting sunbeams, toy shelves, block towers, a rocking horse.
  toys: (ctx, v, t) => {
    layer(ctx, v, FAR, (x0, x1, bottom) => {
      const above = Math.floor(-v.top / v.tile) - 1
      ctx.beginPath()
      for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) ctx.rect(x, above, 1, bottom - above)
      ctx.fillStyle = '#FFF3E6'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 15, 6)) {
        const x = k * 15 + 8.5
        cornerRectPath(ctx, x, 4.3, 4.4, 9.6, 0.15, 0.15, 0, 0)
      }
      ctx.fillStyle = '#F3CDB3'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 15, 6)) {
        const x = k * 15 + 8.5
        for (const y of [4.6, 7.4, 10.2]) ctx.rect(x + 0.25, y, 3.9, 2.45)
      }
      ctx.fillStyle = '#F8DECB'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 15, 6)) {
        const x = k * 15 + 8.5
        ellipseSub(ctx, x + 1.1, 6.6, 0.45, 0.45, 0)
        ctx.rect(x + 2.3, 5.95, 1.1, 1.1)
        ctx.moveTo(x + 0.7, 9.85)
        ctx.lineTo(x + 1.3, 8.6)
        ctx.lineTo(x + 1.9, 9.85)
        ctx.closePath()
        ctx.rect(x + 2.4, 9.15, 1.3, 0.7)
        ctx.rect(x + 0.6, 11.7, 2.2, 0.95)
      }
      ctx.fillStyle = '#EDC0A2'
      ctx.fill()
      // Two sunbeams slanting in from a window above.
      ctx.beginPath()
      for (const k of each(x0, x1, 22, 12)) {
        const x = k * 22 + 2
        for (const [dx, w] of [
          [0, 1.6],
          [2.3, 0.9],
        ] as const) {
          ctx.moveTo(x + dx, above)
          ctx.lineTo(x + dx + w, above)
          ctx.lineTo(x + dx + w + (bottom - above) * 0.55, bottom)
          ctx.lineTo(x + dx + (bottom - above) * 0.55, bottom)
          ctx.closePath()
        }
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.fill()
    })
    layer(ctx, v, MID, (x0, x1) => {
      const towers: number[][] = [[], []]
      for (const k of each(x0, x1, 13, 3)) {
        const x = k * 13 + 2 + hash(k, 51) * 2
        const n = 3 + Math.floor(hash(k, 52) * 3)
        for (let i = 0; i < n; i++) towers[(i + k) & 1].push(x + (hash(k * 7 + i, 53) - 0.5) * 0.3, 13.6 - (i + 1) * 1.12)
      }
      towers.forEach((xy, c) => {
        ctx.beginPath()
        // Soft, pale and round-cornered, so a tower never reads as blocks she could stand on.
        for (let i = 0; i < xy.length; i += 2) cornerRectPath(ctx, xy[i], xy[i + 1], 1.1, 1.1, 0.3, 0.3, 0.3, 0.3)
        ctx.fillStyle = c === 0 ? '#FCE4C6' : '#FCD6DA'
        ctx.fill()
      })
      ctx.beginPath()
      for (const k of each(x0, x1, 13, 4)) {
        const x = k * 13 + 8.8
        const rock = 0.06 * Math.sin(t * 1.1 + k)
        horse(ctx, x, 13.2, rock)
      }
      ctx.fillStyle = '#F7E1B5'
      ctx.fill()
    })
  },
  // Night: a full moon with a soft halo, twinkles, the town's roofs with lit windows, chimneys and aerials.
  roof: (ctx, v, t) => {
    layer(ctx, v, 0.05, (x0, x1) => {
      const dots: number[][] = [[], []]
      for (const k of each(x0, x1, 1.15, 1)) {
        const x = k * 1.15 + hash(k, 1) * 1.15
        const y = 1.6 + hash(k, 2) * 8.6
        if (Math.hypot(x - MOON[0], y - MOON[1]) < MOON[2] * 1.7) continue
        const glint = 0.55 + 0.45 * Math.sin(t * (0.8 + hash(k, 4)) + k * 1.7)
        if (hash(k, 3) < 0.16) {
          sparklePath(ctx, x, y, (0.24 + 0.2 * hash(k, 5)) * glint)
          ctx.fillStyle = hash(k, 6) < 0.5 ? '#FFFFFF' : '#FFF3B0'
          ctx.fill()
        } else dots[hash(k, 6) < 0.5 ? 0 : 1].push(x, y, (0.03 + 0.03 * hash(k, 5)) * (0.6 + 0.4 * glint))
      }
      dots.forEach((xyr, c) => {
        ctx.beginPath()
        for (let i = 0; i < xyr.length; i += 3) {
          ctx.moveTo(xyr[i] + xyr[i + 2], xyr[i + 1])
          ctx.arc(xyr[i], xyr[i + 1], xyr[i + 2], 0, Math.PI * 2)
        }
        ctx.fillStyle = c === 0 ? '#FFFFFF' : '#FFF3B0'
        ctx.fill()
      })
      // The halo: rings of moonlight out to 1.5 times its radius, fading at the edge.
      ctx.fillStyle = 'rgba(255, 243, 196, 0.07)'
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.arc(MOON[0], MOON[1], MOON[2] * (1.5 - i * 0.1), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(MOON[0], MOON[1], MOON[2], 0, Math.PI * 2)
      ctx.fillStyle = '#FFF3C4'
      ctx.fill()
    })
    layer(ctx, v, FAR, (x0, x1, bottom) => {
      ctx.beginPath()
      const windows: number[] = []
      for (const k of each(x0, x1, 4.6, 5)) {
        const x = k * 4.6 + hash(k, 41) * 0.8
        const w = 3 + hash(k, 42) * 1.2
        const wall = 10.3 + hash(k, 43) * 1.5
        const peak = wall - 1.1 - hash(k, 44) * 0.7
        ctx.moveTo(x, bottom)
        ctx.lineTo(x, wall)
        ctx.lineTo(x + w / 2, peak)
        ctx.lineTo(x + w, wall)
        ctx.lineTo(x + w, bottom)
        ctx.closePath()
        if (hash(k, 45) < 0.7) windows.push(x + 0.6, wall + 0.55)
        if (hash(k, 46) < 0.55) windows.push(x + w - 1.0, wall + 0.55)
        if (hash(k, 47) < 0.4) windows.push(x + w / 2 - 0.19, peak + 0.75)
      }
      ctx.fillStyle = '#333872'
      ctx.fill()
      ctx.beginPath()
      for (let i = 0; i < windows.length; i += 2) cornerRectPath(ctx, windows[i], windows[i + 1], 0.38, 0.5, 0.06, 0.06, 0.02, 0.02)
      ctx.fillStyle = 'rgba(255, 229, 138, 0.85)'
      ctx.fill()
    })
    layer(ctx, v, MID, (x0, x1, bottom) => {
      ctx.beginPath()
      for (const k of each(x0, x1, 8.5, 2)) {
        const x = k * 8.5 + hash(k, 61) * 3
        const top = 11.3 + hash(k, 62) * 0.9
        ctx.rect(x, top, 0.9, bottom - top)
        ctx.rect(x - 0.14, top - 0.28, 1.18, 0.3)
      }
      ctx.fillStyle = '#3E4489'
      ctx.fill()
      ctx.beginPath()
      for (const k of each(x0, x1, 8.5, 2)) {
        const x = k * 8.5 + 4.6 + hash(k, 63) * 1.5
        const top = 9.4 + hash(k, 64) * 1.2
        ctx.moveTo(x, bottom)
        ctx.lineTo(x, top)
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(x - 0.6 + i * 0.15, top + 0.3 + i * 0.4)
          ctx.lineTo(x + 0.6 - i * 0.15, top + 0.3 + i * 0.4)
        }
      }
      ctx.lineWidth = 0.1
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#3E4489'
      ctx.stroke()
    })
  },
}

/** A Garden cloud's circles (dx, dy, r) around its middle, before scaling; a flat rectangle under them makes its base. */
const CLOUD = [
  [-1.0, 0.1, 0.45],
  [-0.35, -0.3, 0.65],
  [0.45, -0.15, 0.55],
  [1.05, 0.15, 0.4],
] as const

/** The Bath's shower curtain: one every this many tiles, this wide, from its rod down to its hem (rows). */
const CURTAIN = [19, 4.5, 1.4, 8.6] as const

/** The Bath's giant rubber duck and its beak: the brief's #FFE066 and #FF9F43 a quarter of the way to white, so the backdrop stays paler than the play layer. No eye: only living things have faces. */
const DUCK = ['#FFE88C', '#FFB772'] as const

/** The full moon over the Roof, in its layer: centre x, centre y and radius in tiles. Never a crescent, nothing on it. */
const MOON = [14, 4.6, 2.2] as const

/** Adds a rocking horse standing on (x, y), rocked by `rock` radians, to the current path: rockers, legs, body, neck, head, tail. */
function horse(ctx: CanvasRenderingContext2D, x: number, y: number, rock: number) {
  const c = Math.cos(rock)
  const s = Math.sin(rock)
  const at = (dx: number, dy: number) => [x + dx * c - dy * s, y + dx * s + dy * c] as const
  const poly = (pts: readonly (readonly [number, number])[]) => {
    const [px, py] = at(pts[0][0], pts[0][1])
    ctx.moveTo(px, py)
    for (const [dx, dy] of pts.slice(1)) ctx.lineTo(...at(dx, dy))
    ctx.closePath()
  }
  poly([
    [-1.7, -0.5],
    [-1.2, -0.12],
    [0, 0],
    [1.2, -0.12],
    [1.7, -0.5],
    [1.65, -0.35],
    [1.15, 0.05],
    [0, 0.15],
    [-1.15, 0.05],
    [-1.65, -0.35],
  ])
  poly([
    [-1.1, -0.1],
    [-0.8, -1.6],
    [-0.55, -1.6],
    [-0.75, -0.1],
  ])
  poly([
    [0.75, -0.1],
    [0.55, -1.6],
    [0.8, -1.6],
    [1.1, -0.1],
  ])
  poly([
    [-1.25, -1.5],
    [-1.2, -2.3],
    [0.9, -2.35],
    [1.3, -1.7],
    [1.0, -1.45],
  ])
  poly([
    [0.6, -2.2],
    [0.9, -3.3],
    [1.35, -3.55],
    [1.95, -3.2],
    [1.95, -2.95],
    [1.35, -2.8],
    [1.25, -2.1],
  ])
  poly([
    [-1.15, -2.2],
    [-1.75, -2.05],
    [-1.95, -1.3],
    [-1.6, -1.55],
  ])
}

/** The backdrop for the view: sky or wall, then the far and mid layers with parallax. The context is in device pixels with no transform. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, room: Ground, v: View, t: number): void {
  ctx.save()
  ctx.fillStyle = skyFill(ctx, room, v)
  ctx.fillRect(0, 0, v.width, v.height)
  BACKDROP[room.id](ctx, v, t)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Paint helpers, shared with things.ts.

/** A number in [0, 1) fixed by two whole numbers: details that look scattered but come out the same in every chunk, bake and frame. */
export function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Adds a rectangle with its own radius at each corner (top-left, top-right, bottom-right, bottom-left) to the current path without beginning a new one, so many fill as one shape. */
export function cornerRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  ctx.moveTo(x + tl, y)
  ctx.arcTo(x + w, y, x + w, y + h, tr)
  ctx.arcTo(x + w, y + h, x, y + h, br)
  ctx.arcTo(x, y + h, x, y, bl)
  ctx.arcTo(x, y, x + w, y, tl)
  ctx.closePath()
}

/** Adds a whole ellipse, turned by `rot`, to the current path as a shape of its own. */
export function ellipseSub(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

/** Strokes the current path as an inked line: ink `line` wide on each side, then `colour` `width` wide down its middle. */
export function inkLine(ctx: CanvasRenderingContext2D, colour: string, width: number, line: number) {
  ctx.lineWidth = width + 2 * lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = width
  ctx.strokeStyle = colour
  ctx.stroke()
}

/** Darkens whatever the clip leaves open: inside paintedPart's first pass, the crescent. */
export function dim(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha *= 0.14
  ctx.fillStyle = INK
  ctx.fillRect(-1e4, -1e4, 2e4, 2e4)
  ctx.restore()
}

/** The white shine on a round glossy thing: an ellipse rx by ry at (x, y), turned by rot, at alpha 0.7. */
export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number) {
  ctx.save()
  ctx.globalAlpha *= 0.7
  ctx.beginPath()
  ellipseSub(ctx, x, y, rx, ry, rot)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()
}

/**
 * A part in the house style with a pattern on it (a ribbon, stripes, candy, a band): the
 * shade colour, `paint(false)` clipped to the part, the lit colour lifted `k` with
 * `paint(true)` clipped to the lit face, and the ink last so the pattern never covers it.
 * A pattern that darkens itself when not lit (dim) keeps the crescent across it.
 */
export function paintedPart(ctx: CanvasRenderingContext2D, trace: (ctx: CanvasRenderingContext2D) => void, base: string, shade: string, k: number, line: number, paint: (lit: boolean) => void) {
  trace(ctx)
  ctx.fillStyle = shade
  ctx.fill()
  ctx.save()
  trace(ctx)
  ctx.clip()
  paint(false)
  ctx.translate(0, -k)
  trace(ctx)
  ctx.translate(0, k)
  ctx.clip()
  trace(ctx)
  ctx.fillStyle = base
  ctx.fill()
  paint(true)
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** Below this many device pixels per tile (phones), small details (crumbs, a chip's shine) are left out. */
const DETAIL_PX = 70

/** True when tiles are big enough on screen for small details. */
export const detailed = () => pen.px >= DETAIL_PX
