/**
 * The five rooms, proven. Lints check every design rule a five-year-old needs on the maps,
 * each message naming the room, row and column and quoting the map there, and a table of
 * deliberate mistakes shows each lint catches its own. The bot finishes every room as
 * small Pia with no hit and no fall, and its plan replays to the same tick. The third fall
 * into every gap carries her across. A seeded fuzz of a child's random hands keeps the
 * sim's promises for minutes in every room.
 */
import { describe, expect, it } from 'vitest'

import { drive, solve, type BotPlan } from './bot'
import { ROOMS } from './levels'
import {
  BEE_RANGE,
  BUBBLES_MAX,
  EPS,
  G_LOW,
  HELP_AFTER,
  RESCUE_FOR,
  ROWS,
  SPRING_TOP,
  SPRING_V,
  TILE,
  WAKE_DIST,
  ticks,
  type EnemyKind,
  type EventKind,
  type Form,
  type KittenName,
  type LiftDef,
  type Room,
  type RoomDef,
  type RoomId,
  type Sim,
} from './model'
import { parseRoom, solidTile } from './room'
import { createSim, heroBox, pressBubble, pressJump, releaseBubble, releaseJump, setMove, step } from './sim'

/** Seeded PRNG (mulberry32), copied from chase/src/game/random.ts: the fuzz plays the same hands every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------------------
// The design rules.

/** What one room may ask of her, and what it brings. */
interface Rules {
  name: string
  kitten: KittenName
  /** The room's width in columns. */
  cols: readonly [number, number]
  /** The widest gap she must jump, the most its far side may be higher, and the tallest rise she must climb. */
  gap: number
  farUp: number
  rise: number
  /** Enemies closer than SPACING tiles make a group: the largest group allowed. */
  group: number
  lifts: readonly LiftDef['kind'][]
  /** Every gap gets a star arc over it (the rooms that teach jumping). */
  arcs: boolean
  /** How many enemies of each kind the brief asks for (and no other kind). The awake rule (at most 3 within 13 tiles of any floor point) leaves room for fewer, so a room has at least half that many and never more. */
  enemies: Partial<Record<EnemyKind, number>>
  /** The kind this room brings in: its first one stands alone, where a child stops anyway. */
  newKind: EnemyKind | null
}

const RULES: Record<RoomId, Rules> = {
  garden: { name: 'Garden', kitten: 'Sunny', cols: [110, 120], gap: 2, farUp: 1, rise: 2, group: 1, lifts: [], arcs: true, enemies: { grumble: 6 }, newKind: 'grumble' },
  kitchen: { name: 'Kitchen', kitten: 'Coco', cols: [125, 135], gap: 2, farUp: 1, rise: 3, group: 2, lifts: [], arcs: true, enemies: { grumble: 8, snail: 4 }, newKind: 'snail' },
  bath: { name: 'Bath', kitten: 'Mochi', cols: [135, 145], gap: 3, farUp: 2, rise: 3, group: 2, lifts: ['ferry'], arcs: false, enemies: { grumble: 6, snail: 3, bee: 5 }, newKind: 'bee' },
  toys: { name: 'Toy Room', kitten: 'Lulu', cols: [145, 155], gap: 3, farUp: 2, rise: 3, group: 3, lifts: ['ferry', 'loop'], arcs: false, enemies: { grumble: 10, snail: 5, bee: 4 }, newKind: null },
  roof: { name: 'Roof', kitten: 'Pepper', cols: [158, 170], gap: 3, farUp: 2, rise: 3, group: 3, lifts: ['ferry', 'loop'], arcs: false, enemies: { grumble: 10, snail: 4, bee: 5, boss: 1 }, newKind: null },
}

/** Enemies at least this far apart are not a group. */
const SPACING = 6
/** At most this many enemies within WAKE_DIST of any floor point (they are awake when she stands there). */
const AWAKE_MAX = 3
/** A kind's first one has this many flat, clear tiles in front of it, and a box row or a step this close where she stops. */
const FIRST_CLEAR = 12
const FIRST_STEP = 2
/** Run-up before a gap, landing after it, and the stretch past the landing with no rise. */
const RUN_UP = 4
const LANDING = 3
const NO_RISE = 2
/** Enemies keep this far from a gap's take-off edge and its landing edge. */
const TAKE_OFF_CLEAR = 5
const LANDING_CLEAR = 4
/** A dip with a floor she must be able to climb out of. */
const HOLE_DEPTH = 2
/** Air tiles under a gift box or a cookie block. */
const BOX_AIR = [3, 4] as const
/** The first box: a power box between these columns. */
const FIRST_BOX = [10, 16] as const
/** How low a bee's band may come over a surface: small Pia's height plus a little. */
const BEE_CLEAR = 1.35
/** Springs stand in this row or lower, with this much air over them. */
const SPRING_ROW = 10
const SPRING_AIR = 3
/** Air over every lift's path, and the width of the ledges it serves. */
const LIFT_AIR = 3
const LEDGE = 3
/** Stars per column, and the longest stretch from the start to the staircase with fewer than STARS_IN_STRETCH. */
const STARS_PER_COL = [0.4, 0.65] as const
const STRETCH = 20
const STARS_IN_STRETCH = 3
/** The ending: flat tiles before the staircase, its tallest step, the pole's distance from its last column, the bed's from the pole, and floor after the bed. */
const FLAT_BEFORE_STAIRS = 6
const STAIRS_MAX = 3
const POLE_AFTER_STAIRS = [2, 3] as const
const BED_AFTER_POLE = 4
const FLOOR_AFTER_BED = 3
/**
 * The Roof's arena: its width, the shelf row near each end, how far those shelves keep
 * from the gate, the gate's top row, and the power box before it. The gate reaches row 6,
 * not row 9: a full jump (3.69) plus the toe assist (0.35) climbs a gate 4 blocks tall,
 * and a held stomp bounce off a hopping Big Grumble lifts her feet to 6.57, so only a top
 * above that keeps the arena shut until the Big Grumble is beaten.
 */
const ARENA = 24
const ARENA_SHELF_ROW = 9
const ARENA_GATE_TOP = 6
const ARENA_SHELF_REACH = 6
const ARENA_SHELF_GATE = 5
const ARENA_POWER = [8, 12] as const
/** Teaching: a kicked shell meets its wall within this many tiles; a ferry crosses this much water; the rainbow ball's row of enemies stands within this many columns after its box. */
const SHELL_WALL = 12
const FERRY_WATER = [6, 10] as const
const BALL_ROW = 16
/** How high a spring sends her feet above its top: SPRING_V rising under G_LOW. */
const SPRING_RISE = SPRING_V ** 2 / (2 * G_LOW)

/** The fuzz: seeds per room, and seconds of play per seed. */
const FUZZ_SEEDS = [1, 2, 3]
const FUZZ_SECONDS = 120

/** The map around (row, col), with the row marked and a caret under the column. */
function around(def: RoomDef, row: number, col: number): string {
  const c0 = Math.max(0, col - 12)
  const c1 = Math.min(def.map[0]!.length, col + 13)
  const lines: string[] = []
  for (let r = Math.max(0, row - 3); r <= Math.min(ROWS - 1, row + 3); r++) lines.push(`    ${String(r).padStart(2)} ${def.map[r]!.slice(c0, c1)}${r === row ? '  <' : ''}`)
  lines.push(`       ${' '.repeat(col - c0)}^ column ${col}`)
  return lines.join('\n')
}

/** Every rule a room breaks, each naming the room, row and column and quoting the map there. */
function lint(def: RoomDef): string[] {
  const rules = RULES[def.id]
  const room = parseRoom(def)
  const { cols, floor, gaps, spawns } = room
  const problems: string[] = []
  const say = (row: number, col: number, what: string) => problems.push(`${def.id}, row ${row}, column ${col}: ${what}\n${around(def, Math.max(0, Math.min(ROWS - 1, row)), Math.max(0, Math.min(cols - 1, col)))}`)
  const glyph = (c: number, r: number) => def.map[r]![c]!
  /** Stops her from every side: ground, ABC blocks, columns, every block (gift, cookie, gate), and the walls beyond both ends. */
  const solid = (c: number, r: number) => c < 0 || c >= cols || (r >= 0 && r < ROWS && (solidTile(room.tiles[r * cols + c]!) || room.blockAt[r * cols + c]! >= 0))
  const shelf = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < ROWS && room.tiles[r * cols + c] === TILE.shelf
  const standable = (c: number, r: number) => solid(c, r) || shelf(c, r)
  const gapAtCol = (c: number) => c >= 0 && c < cols && floor[c] === -1
  const ferries = def.lifts.filter((l) => l.kind === 'ferry')
  const spanned = (g: { col0: number; col1: number }) =>
    ferries.some((l) => Math.min(l.col, l.col + l.dx) <= g.col0 && Math.max(l.col, l.col + l.dx) + l.width >= g.col1)

  // The map: names, length, rows 0 and 1 empty.
  if (def.name !== rules.name || def.kitten !== rules.kitten) say(0, 0, `is named ${def.name} with ${def.kitten}, not ${rules.name} with ${rules.kitten}`)
  if (cols < rules.cols[0] || cols > rules.cols[1]) say(0, cols - 1, `is ${cols} columns wide, not ${rules.cols[0]} to ${rules.cols[1]}`)
  for (const r of [0, 1]) for (let c = 0; c < cols; c++) if (glyph(c, r) !== '.') say(r, c, 'rows 0 and 1 are under the HUD: keep them empty')

  // The start: column 6 or later, on flat floor.
  const { col: sc, row: sr } = room.start
  if (sc < 6) say(sr, sc, 'the start is left of column 6, under the move pad')
  for (let c = sc - 3; c <= sc + 3; c++) if (floor[c] !== sr + 1) say(sr, c, 'the start stands on flat floor, 3 tiles each side')

  // Gaps: no 1-wide ones, a width she can jump (or a ferry), a run-up, a landing, and a far side not too high.
  for (const g of gaps) {
    const w = g.col1 - g.col0
    const near = floor[g.col0 - 1]
    const far = floor[g.col1]
    if (near === undefined || far === undefined) {
      say(13, g.col0, 'a gap needs floor on both sides')
      continue
    }
    const ferry = spanned(g)
    if (w < 2) say(13, g.col0, 'a 1-wide gap: her box snags in it')
    if (!ferry && w > rules.gap) say(13, g.col0, `a ${w}-wide gap: at most ${rules.gap} here, unless a ferry spans it`)
    for (let c = g.col0 - RUN_UP; c < g.col0; c++) if (floor[c] !== near) say(near, c, `a gap needs ${RUN_UP} flat tiles of run-up`)
    for (let c = g.col1; c < g.col1 + LANDING; c++) if (floor[c] !== far) say(far, c, `a gap needs ${LANDING} flat tiles of landing`)
    for (let c = g.col1 + LANDING; c < g.col1 + LANDING + NO_RISE; c++) if (floor[c]! >= 0 && floor[c]! < far) say(far, c, `a rise within ${NO_RISE} tiles of a landing`)
    if (!ferry && near - far > rules.farUp) say(far, g.col1, `the far side is ${near - far} higher: at most ${rules.farUp} here`)
  }

  // Rises, and holes she could not climb out of (the deepest water a dip would hold, with gaps and the room's ends draining).
  for (let c = 0; c + 1 < cols; c++) {
    if (floor[c]! >= 0 && floor[c + 1]! >= 0 && floor[c]! - floor[c + 1]! > rules.rise) say(floor[c + 1]!, c + 1, `a ${floor[c]! - floor[c + 1]!}-rise: at most ${rules.rise} here`)
  }
  for (let a = 0; a < cols; ) {
    if (floor[a] === -1) {
      a += 1
      continue
    }
    let b = a
    while (b < cols && floor[b] !== -1) b += 1
    const height = (c: number) => ROWS - floor[c]!
    const right: number[] = []
    for (let c = b - 1, top = 0; c >= a; c--) right[c] = top = Math.max(top, height(c))
    for (let c = a, top = 0, reported = false; c < b; c++) {
      top = Math.max(top, height(c))
      const depth = Math.min(top, right[c]!) - height(c)
      if (depth > HOLE_DEPTH && !reported) say(floor[c]!, c, `a hole ${depth} deep: she climbs out of ${HOLE_DEPTH} at most, so make it a bottomless gap`)
      reported = depth > HOLE_DEPTH
    }
    a = b
  }

  // Headroom: two free tiles over every surface (big Pia is 1.8 tall), so never a 1-high tunnel.
  for (let c = 0; c < cols; c++) {
    for (let r = 1; r < ROWS; r++) {
      if (standable(c, r) && !solid(c, r - 1) && solid(c, r - 2)) say(r - 1, c, 'only one free tile over a surface: big Pia needs two')
    }
  }

  // Boxes: 3 or 4 air tiles under each, never over a gap or beside one, no box over a cookie row (that is 1-1), and the first one a power box.
  for (const b of room.blocks) {
    if (b.kind === 'gate') continue
    let r = b.row + 1
    while (r < ROWS && !standable(b.col, r)) r += 1
    const air = r - b.row - 1
    if (gapAtCol(b.col - 1) || gapAtCol(b.col) || gapAtCol(b.col + 1)) say(b.row, b.col, 'a box over a gap or next to its edge')
    else if (air < BOX_AIR[0] || air > BOX_AIR[1]) say(b.row, b.col, `${air} air tiles under a box: ${BOX_AIR[0]} (or ${BOX_AIR[1]}) let small Pia bump it from below`)
    if (b.kind === 'gift' && r < ROWS && room.blocks.some((o) => o.kind === 'cookie' && o.col === b.col && o.row === r)) say(b.row, b.col, 'a gift box over a cookie row: that is a famous first level')
  }
  const boxes = room.blocks.filter((b) => b.kind !== 'gate').sort((p, q) => p.col - q.col || p.row - q.row)
  const first = boxes[0]
  if (!first) say(9, 0, 'no boxes at all')
  else if (first.kind !== 'gift' || first.gift !== 'power' || first.col < FIRST_BOX[0] || first.col > FIRST_BOX[1]) say(first.row, first.col, `the first box is a power box ('p') between columns ${FIRST_BOX[0]} and ${FIRST_BOX[1]}`)

  // Enemies: the kinds and counts, standing on something, clear of gaps, spread out, and at most 3 awake around any floor point.
  const count = (kind: EnemyKind) => spawns.filter((e) => e.kind === kind).length
  for (const kind of ['grumble', 'snail', 'bee', 'boss'] as const) {
    const want = rules.enemies[kind] ?? 0
    if (count(kind) < Math.ceil(want / 2) || count(kind) > want) say(12, 0, `${count(kind)} ${kind}s: the brief asks for about ${want}, so ${Math.ceil(want / 2)} to ${want}`)
  }
  for (const e of spawns) {
    if (e.kind !== 'bee' && !standable(e.col, e.row + 1)) say(e.row, e.col, `a ${e.kind} standing on nothing: sleeping enemies do not fall`)
    for (const g of gaps) {
      if (e.col >= g.col0 && e.col < g.col1) say(e.row, e.col, `a ${e.kind} over a gap`)
      if (e.col >= g.col0 - TAKE_OFF_CLEAR && e.col < g.col0) say(e.row, e.col, `a ${e.kind} within ${TAKE_OFF_CLEAR} tiles of a gap's take-off edge`)
      if (e.col >= g.col1 && e.col < g.col1 + LANDING_CLEAR) say(e.row, e.col, `a ${e.kind} within ${LANDING_CLEAR} tiles of a gap's landing edge`)
    }
  }
  for (const e of spawns.filter((x) => x.kind === 'snail')) {
    // A snail turns at ledges, so with nothing in the way it patrols the landing edge of the gap behind it, right where she comes down.
    let c = e.col
    while (c > 0 && floor[c - 1] === floor[e.col]) c -= 1
    if (floor[c - 1] === -1) say(e.row, e.col, `a snail with nothing between it and the landing edge of the gap at column ${c - 1}: it would pace where she lands`)
  }
  const sorted = [...spawns].sort((p, q) => p.col - q.col)
  const groups: (typeof sorted)[] = []
  for (const e of sorted) {
    const last = groups[groups.length - 1]
    if (last && e.col - last[last.length - 1]!.col < SPACING) last.push(e)
    else groups.push([e])
  }
  let pairs = 0
  for (const group of groups) {
    const e = group[0]!
    if (def.id === 'garden' && group.length === 2) {
      // The Garden keeps its one pair for its last third.
      pairs += 1
      if (pairs > 1 || e.col < (cols * 2) / 3) say(e.row, e.col, `enemies closer than ${SPACING} tiles: the Garden allows one pair, in its last third`)
    } else if (group.length > rules.group) say(e.row, e.col, `${group.length} enemies closer than ${SPACING} tiles: at most ${rules.group} together here`)
  }
  // Every window of 2 * WAKE_DIST columns is what is awake around the floor point at its middle.
  for (let c = 0; c + 2 * WAKE_DIST <= cols; c++) {
    const awake = spawns.filter((e) => e.col >= c && e.col < c + 2 * WAKE_DIST)
    if (awake.length > AWAKE_MAX) {
      say(awake[0]!.row, awake[0]!.col, `${awake.length} enemies within ${WAKE_DIST} tiles of column ${c + WAKE_DIST}: at most ${AWAKE_MAX} awake at once`)
      break
    }
  }
  if (rules.newKind && rules.newKind !== 'boss') {
    const e = sorted.find((x) => x.kind === rules.newKind)
    if (!e) say(12, 0, `no ${rules.newKind}, which this room brings in`)
    else {
      const base = floor[e.col]!
      for (let c = e.col - FIRST_CLEAR; c <= e.col; c++) if (floor[c] !== base) say(base, c, `the first ${e.kind} needs ${FIRST_CLEAR} flat clear tiles in front of it`)
      // Nothing else is awake while she is anywhere in front of it.
      const others = spawns.filter((o) => o !== e && o.col >= e.col - FIRST_CLEAR - WAKE_DIST && o.col <= e.col + WAKE_DIST)
      for (const o of others) say(o.row, o.col, `the first ${e.kind} (column ${e.col}) meets her alone: nothing else awake around it`)
      const boxRow = room.blocks.some((b) => b.kind !== 'gate' && b.col >= e.col - FIRST_CLEAR && b.col < e.col)
      let step = false
      for (let c = e.col - FIRST_STEP; c <= e.col + FIRST_STEP; c++) step ||= floor[c + 1]! >= 0 && floor[c + 1]! < floor[c]!
      if (!boxRow && !step) say(e.row, e.col, `the first ${e.kind} waits where a child stops anyway: under a box row or at the foot of a step`)
    }
  }

  // Bees: never over a gap (above), a band clear of tiles, and high enough for small Pia to walk under.
  for (const e of spawns.filter((x) => x.kind === 'bee')) {
    for (let r = e.row - 1; r <= e.row + 2; r++) if (standable(e.col, r)) say(r, e.col, 'something in a bee\'s band')
    let r = e.row + 3
    while (r < ROWS && !standable(e.col, r)) r += 1
    const clear = r - (e.row + 1 + BEE_RANGE)
    if (r < ROWS && clear < BEE_CLEAR) say(e.row, e.col, `a bee comes ${clear.toFixed(2)} over the surface under it: at least ${BEE_CLEAR} so small Pia walks under`)
  }

  // Springs: low enough that she stays in the room, on something, with air over them.
  for (const sp of room.springs) {
    if (sp.row < SPRING_ROW) say(sp.row, sp.col, `a spring above row ${SPRING_ROW}: she would fly out of the top`)
    if (!standable(sp.col, sp.row + 1)) say(sp.row, sp.col, 'a spring standing on nothing')
    for (let c = sp.col - 1; c <= sp.col + 1; c++) for (let r = sp.row - SPRING_AIR; r < sp.row; r++) if (solid(c, r)) say(r, c, `something solid within ${SPRING_AIR} tiles over a spring`)
  }

  // Lifts: the kinds this room has, air over the whole path, and a ledge at least 3 wide at each end.
  def.lifts.forEach((l, i) => {
    if (!rules.lifts.includes(l.kind)) say(l.row, l.col, `a ${l.kind} lift: this room has ${rules.lifts.length ? rules.lifts.join(' and ') : 'none'}`)
    for (let k = 0; k <= 40; k++) {
      const x = l.col + (l.dx * k) / 40
      const y = l.row + (l.dy * k) / 40
      for (let c = Math.floor(x); c < Math.ceil(x + l.width); c++) {
        for (let r = Math.floor(y - LIFT_AIR); r < Math.ceil(y + 0.4); r++) {
          if (solid(c, r)) {
            say(r, c, `lift ${i} needs ${LIFT_AIR} air tiles over its whole path`)
            return
          }
        }
      }
    }
    for (const [x, y] of [[l.col, l.row], [l.col + l.dx, l.row + l.dy]] as const) {
      const ledge = (c0: number) => [0, 1, 2].every((d) => standable(c0 + d, y) && !solid(c0 + d, y - 1) && !solid(c0 + d, y - 2))
      if (!ledge(x - LEDGE) && !ledge(x + l.width)) say(y, x, `lift ${i} ends with no ledge ${LEDGE} wide beside it at its height`)
    }
  })

  // The ending: flat tiles, a short staircase of ABC blocks spelling the kitten, the pole, the bed on flat floor, floor after it.
  const pole = room.pole
  const base = pole.row + 1
  let last = pole.col - 1
  while (last > 0 && room.tiles[(base - 1) * cols + last] !== TILE.abc) last -= 1
  let firstStep = last
  while (firstStep > 0 && room.tiles[(base - 1) * cols + firstStep - 1] === TILE.abc) firstStep -= 1
  if (!POLE_AFTER_STAIRS.includes((pole.col - last) as 2 | 3)) say(pole.row, pole.col, `the pole stands ${POLE_AFTER_STAIRS.join(' or ')} columns after the staircase's last column (${last})`)
  for (let c = last + 1; c <= room.bed.col + FLOOR_AFTER_BED; c++) if (floor[c] !== base) say(base, c, 'flat floor from the staircase past the bed')
  let top = base
  for (let c = firstStep; c <= last; c++) {
    for (let r = floor[c]!; r < base; r++) if (room.tiles[r * cols + c] !== TILE.abc) say(r, c, 'the staircase is ABC blocks only')
    if (floor[c]! < top - 1) say(floor[c]!, c, 'the staircase climbs one tile a step')
    if (floor[c]! > top) say(floor[c]!, c, 'the staircase only goes up')
    top = Math.min(top, floor[c]!)
  }
  if (base - top > STAIRS_MAX) say(top, last, `a staircase ${base - top} high: keep it short, at most ${STAIRS_MAX}`)
  const name = def.kitten.toUpperCase()
  const rows = Array.from({ length: base - top }, (_, k) => def.map[top + k]!.slice(firstStep, last + 1))
  if (!rows.some((line) => line.includes(name))) say(top, firstStep, `the staircase does not spell ${name}`)
  for (let c = firstStep - FLAT_BEFORE_STAIRS; c < firstStep; c++) if (floor[c] !== base) say(base, c, `${FLAT_BEFORE_STAIRS} flat tiles before the staircase`)
  if (room.bed.col !== pole.col + BED_AFTER_POLE || room.bed.row !== pole.row) say(room.bed.row, room.bed.col, `the bed stands ${BED_AFTER_POLE} columns after the pole, on its floor`)
  if (cols < room.bed.col + FLOOR_AFTER_BED + 1) say(room.bed.row, room.bed.col, `${FLOOR_AFTER_BED} columns of floor after the bed`)

  // Stars: about one per two columns, none of the way without some, an arc over every gap where jumping is taught.
  const stars = room.stars.length
  if (stars < STARS_PER_COL[0] * cols || stars > STARS_PER_COL[1] * cols) say(12, 0, `${stars} stars: about one per two columns, so ${Math.ceil(STARS_PER_COL[0] * cols)} to ${Math.floor(STARS_PER_COL[1] * cols)}`)
  for (let c = sc; c + STRETCH <= firstStep; c++) {
    if (room.stars.filter((s) => s.col >= c && s.col < c + STRETCH).length < STARS_IN_STRETCH) {
      say(12, c, `fewer than ${STARS_IN_STRETCH} stars in the ${STRETCH} columns from here`)
      break
    }
  }
  if (rules.arcs) {
    for (const g of gaps) {
      const near = floor[g.col0 - 1]!
      const arc = room.stars.filter((s) => s.col >= g.col0 - 1 && s.col <= g.col1 && s.row < near && s.row >= near - 4)
      if (arc.length < 3) say(near - 2, g.col0, 'a gap with no arc of stars over it to show the jump')
    }
  }

  // What each room teaches, where the brief pins it down.
  /** How many column tiles (a pot, a jar, a chimney) stand on top of the floor in column c. */
  const pot = (c: number) => {
    let n = 0
    while (floor[c]! >= 0 && floor[c]! + n < ROWS && room.tiles[(floor[c]! + n) * cols + c] === TILE.column) n += 1
    return n
  }
  const columnHeights = new Set<number>()
  for (let c = 0; c < cols; c++) if (pot(c) > 0) columnHeights.add(pot(c))
  const kicked = (e: { col: number; row: number }) => {
    // The first column ahead whose floor differs from the snail's: a wall within reach, not a drop or a gap.
    for (let c = e.col + 1; c <= e.col + SHELL_WALL; c++) if (floor[c] !== floor[e.col]) return floor[c]! >= 0 && floor[c]! < floor[e.col]!
    return false
  }
  const grumblesAhead = (col: number, reach: number) => spawns.filter((g) => g.kind === 'grumble' && g.col > col && g.col <= col + reach).length
  if (def.id === 'garden') {
    if (!columnHeights.has(1) || !columnHeights.has(2)) say(12, 0, 'the Garden teaches flower pots one and two tall')
    if (!room.blocks.some((b) => b.gift === 'stars')) say(9, 0, 'the Garden has a many-stars box')
  }
  if (def.id === 'kitchen') {
    const c = [...floor.keys()].find((k) => floor[k]! >= 0 && floor[k + 1]! >= 0 && floor[k]! - floor[k + 1]! >= 3)
    if (c === undefined) say(12, 0, 'the Kitchen teaches holding the jump with a jar three tall')
    else {
      const column = [c - 2, c - 1, c].some((k) => room.stars.filter((st) => st.col === k && st.row < floor[c]! && st.row >= floor[c + 1]! - 1).length >= 3)
      if (!column) say(floor[c]! - 1, c, 'a column of stars where a held jump is first needed')
      if (!room.stars.some((st) => st.col > c && st.col <= c + 2 && st.row < floor[c + 1]!)) say(floor[c + 1]! - 1, c + 1, 'stars on top of the first jar three tall')
      if (!columnHeights.has(2) || [...floor.keys()].findIndex((k) => floor[k]! >= 0 && floor[k + 1]! >= 0 && floor[k]! - floor[k + 1]! === 2) > c) say(12, c, 'a jar two tall comes before the first one three tall')
    }
    const snail = sorted.find((e) => e.kind === 'snail')
    if (snail && !kicked(snail)) say(snail.row, snail.col, `the first snail's shell, kicked, meets a wall within ${SHELL_WALL} tiles`)
    if (!spawns.some((g) => g.kind === 'grumble' && room.blocks.some((b) => b.kind === 'cookie' && b.col === g.col && b.row === g.row + 1))) say(9, 0, 'a grumble walking on a cookie row, to bump from below')
    if (!room.blocks.some((b) => b.gift === 'power' && b.col >= (cols * 2) / 3)) say(9, Math.ceil((cols * 2) / 3), 'the wand comes from a power box in the last third')
  }
  if (def.id === 'bath') {
    for (const l of ferries) {
      const g = gaps.find((x) => x.col0 <= l.col && x.col1 > l.col)
      if (!g || g.col1 - g.col0 < FERRY_WATER[0] || g.col1 - g.col0 > FERRY_WATER[1]) say(l.row, l.col, `a ferry crosses ${FERRY_WATER[0]} to ${FERRY_WATER[1]} tiles of water`)
    }
    if (ferries.length === 0) say(13, 0, 'the Bath teaches ferries')
    if (!room.blocks.some((b) => b.gift === 'stars')) say(9, 0, 'the Bath has a many-stars box')
  }
  if (def.id === 'toys') {
    for (const sp of room.springs) {
      const apex = sp.row + 1 - SPRING_TOP - SPRING_RISE
      const shelfRow = [...Array(ROWS).keys()].find((r) => r > apex && r < sp.row - SPRING_AIR && [sp.col - 1, sp.col, sp.col + 1].some((c) => shelf(c, r)))
      if (shelfRow === undefined) say(sp.row, sp.col, 'a spring leads up to a high shelf she can land on')
      else if (!room.stars.some((st) => st.row === shelfRow - 1 && Math.abs(st.col - sp.col) <= 6)) say(shelfRow - 1, sp.col, 'stars up on the shelf a spring leads to')
    }
    if (room.springs.length === 0) say(12, 0, 'the Toy Room teaches springs')
    if (!def.lifts.some((l) => l.kind === 'loop')) say(13, 0, 'the Toy Room teaches lifts that move by themselves')
    const ball = room.blocks.find((b) => b.gift === 'ball')
    if (!ball || spawns.filter((e) => e.col > ball.col && e.col <= ball.col + BALL_ROW).length < 3) say(ball ? ball.row : 9, ball ? ball.col : 0, `the rainbow ball has a row of enemies within ${BALL_ROW} columns after it`)
    if (!spawns.some((e) => e.kind === 'snail' && grumblesAhead(e.col, SHELL_WALL) >= 2 && kicked(e))) say(12, 0, `shell bowling: a snail with a line of grumbles and a wall within ${SHELL_WALL} tiles after it`)
  }
  // The 2-3-4-4 pipe run of a famous first level: pieces two wide standing in a row.
  const pieces: { col: number; height: number }[] = []
  for (let c = 0; c < cols; c++) if (pot(c) > 0 && pot(c - 1) === 0) pieces.push({ col: c, height: pot(c) })
  for (let i = 0; i + 4 <= pieces.length; i++) {
    if (pieces.slice(i, i + 4).map((q) => q.height).join() === '2,3,4,4') say(floor[pieces[i]!.col]!, pieces[i]!.col, 'pots of 2, 3, 4 and 4 in a row: that is a famous first level')
  }

  // The Roof's arena: the Big Grumble alone on 24 flat columns, a shelf near each end, the gate closing it, a power box before it.
  const gates = room.blocks.filter((b) => b.kind === 'gate')
  const boss = spawns.find((e) => e.kind === 'boss')
  if (def.id !== 'roof') {
    if (gates.length > 0 || boss) say(9, 0, 'the Big Grumble and its gate belong to the Roof')
  } else if (!boss || gates.length === 0) say(9, 0, 'the Roof needs the Big Grumble and its gate')
  else {
    const gate = gates[0]!.col
    const a = gate - ARENA
    const arenaFloor = floor[gate]!
    if (gates.some((b) => b.col !== gate) || gates.length !== arenaFloor - ARENA_GATE_TOP || gates.some((b) => b.row < ARENA_GATE_TOP || b.row >= arenaFloor)) say(ARENA_GATE_TOP, gate, `the gate is one column of gate blocks from the floor up to row ${ARENA_GATE_TOP}`)
    for (let c = a; c < gate; c++) if (floor[c] !== arenaFloor) say(arenaFloor, c, `the arena is ${ARENA} flat columns before the gate`)
    for (const e of spawns) if (e !== boss && e.col >= a && e.col <= gate) say(e.row, e.col, 'the Big Grumble is alone in its arena')
    if (boss.col < a || boss.col >= gate) say(boss.row, boss.col, 'the Big Grumble waits in its arena')
    const shelfNear = (c0: number, c1: number) => Array.from({ length: c1 - c0 }, (_, k) => c0 + k).some((c) => shelf(c, ARENA_SHELF_ROW))
    if (!shelfNear(a, a + ARENA_SHELF_REACH) || !shelfNear(gate - ARENA_SHELF_REACH - ARENA_SHELF_GATE, gate)) say(ARENA_SHELF_ROW, a, `a shelf at row ${ARENA_SHELF_ROW} near each end of the arena`)
    for (let c = gate - ARENA_SHELF_GATE; c < gate; c++) if (shelf(c, ARENA_SHELF_ROW)) say(ARENA_SHELF_ROW, c, `the arena's shelves keep ${ARENA_SHELF_GATE} tiles from the gate, so no jump skips the Big Grumble`)
    if (!room.blocks.some((b) => b.gift === 'power' && a - b.col >= ARENA_POWER[0] && a - b.col <= ARENA_POWER[1])) say(9, a - 10, 'a power box about 10 columns before the arena')
  }
  return problems
}

// ---------------------------------------------------------------------------------------

describe('the rooms', () => {
  it('are the five rooms in order, each with its kitten', () => {
    expect(ROOMS.map((r) => [r.id, r.name, r.kitten])).toEqual(Object.entries(RULES).map(([id, r]) => [id, r.name, r.kitten]))
  })

  for (const def of ROOMS) {
    it(`the ${def.name} parses and follows every design rule`, () => {
      const problems = lint(def)
      expect(problems, `\n${problems.join('\n\n')}\n`).toEqual([])
    })
  }
})

/** What the bot never lets happen: a hit, a fall, a change of form. */
const UNSAFE: readonly EventKind[] = ['hurt', 'shrink', 'fall', 'grow', 'wand']

/** Where the bot got stuck: the room, the furthest column, and the map from 6 columns before it to 10 after, '@' where she stood. */
function stuck(def: RoomDef, plan: BotPlan): string {
  const col = Math.floor(plan.furthestX)
  const row = Math.max(0, Math.min(ROWS - 1, Math.ceil(plan.furthestY) - 1))
  const c0 = Math.max(0, col - 6)
  const c1 = Math.min(def.map[0]!.length, col + 11)
  const lines = def.map.map((line, r) => `  ${String(r).padStart(2)} ${r === row ? line.slice(c0, col) + '@' + line.slice(col + 1, c1) : line.slice(c0, c1)}`)
  return `the bot got stuck in the ${def.name} at column ${col} (${plan.expansions} decisions tried):\n${lines.join('\n')}`
}

describe('the bot', () => {
  for (const def of ROOMS) {
    it(`finishes the ${def.name} as small Pia with no hit and no fall, and its plan replays to the same tick`, () => {
      const room = parseRoom(def)
      const plan = solve(room)
      expect(plan.ok, stuck(def, plan)).toBe(true)
      const s = createSim(room)
      const unsafe: string[] = []
      while (s.phase === 'play' && s.tick < plan.tick) {
        drive(s, plan, 0)
        step(s, room)
        for (const e of s.events) if (UNSAFE.includes(e.kind)) unsafe.push(`${e.kind} at x ${e.x.toFixed(1)}, tick ${s.tick - 1}`)
        s.events.length = 0
      }
      expect(unsafe).toEqual([])
      expect([s.phase, s.tick]).toEqual(['pole', plan.tick])
      // Where there is a gate, she got past it the honest way: the Big Grumble was beaten first.
      if (room.blocks.some((b) => b.kind === 'gate')) expect(s.gateAt).toBeGreaterThanOrEqual(0)
      // With nobody at the controls the visit plays out: the slide, the walk to the bed, the hug.
      setMove(s, 0)
      releaseJump(s)
      const end = s.tick + ticks(10)
      while (s.phase !== 'done' && s.tick < end) step(s, room)
      expect(s.phase).toBe('done')
    })
  }
})

describe('the third fall', () => {
  for (const def of ROOMS) {
    it(`carries her across every gap in the ${def.name}`, () => {
      const room = parseRoom(def)
      room.gaps.forEach((g, i) => {
        // Falling into the gap's middle with HELP_AFTER - 1 falls already counted there.
        const s = createSim(room)
        s.falls[i] = HELP_AFTER - 1
        const h = s.hero
        h.x = h.px = (g.col0 + g.col1) / 2
        h.y = h.py = ROWS
        h.grounded = false
        h.groundAt = -1
        let rescued = -1
        for (let k = 0; k < ticks(RESCUE_FOR + 1) && rescued < 0; k++) {
          step(s, room)
          for (const e of s.events) if (e.kind === 'rescued') rescued = e.n
          s.events.length = 0
        }
        expect([rescued, h.grounded, h.x > g.col1], `${def.id}: the gap at column ${g.col0}`).toEqual([1, true, true])
      })
    })
  }
})

// ---------------------------------------------------------------------------------------
// A child at the controls.

/** Whether her box covers a solid tile or a standing block by more than EPS (the walls beyond both ends count). */
function inside(s: Sim, room: Room): boolean {
  const h = s.hero
  for (let r = Math.floor(h.y - h.h + EPS); r <= Math.ceil(h.y - EPS) - 1; r++) {
    for (let c = Math.floor(h.x - h.w / 2 + EPS); c <= Math.ceil(h.x + h.w / 2 - EPS) - 1; c++) {
      if (c < 0 || c >= room.cols) return true
      if (r < 0 || r >= ROWS) continue
      const b = room.blockAt[r * room.cols + c]!
      if (solidTile(room.tiles[r * room.cols + c]!) || (b >= 0 && (s.blocks[b]!.state === 'full' || s.blocks[b]!.state === 'empty'))) return true
    }
  }
  return false
}

/** The sum of every number in the sim: NaN or infinite when any one is. */
function total(s: Sim): number {
  let sum = 0
  const add = (o: object) => {
    for (const k in o) {
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'number') sum += v
    }
  }
  add(s)
  add(s.input)
  add(s.hero)
  for (const e of s.enemies) add(e)
  for (const it of s.items) add(it)
  for (const b of s.bubbles) add(b)
  for (const l of s.lifts) add(l)
  return sum
}

/** What a run of random hands went through. */
interface FuzzStats {
  falls: number
  hits: number
}

/**
 * A child's random hands on a room for `seconds`: a direction held 0.2 to 1.5 s, jumps held
 * 0 to 0.5 s, bubbles now and then, sometimes starting big or as bubble Pia; a new visit
 * when one ends. Checks the sim's promises (and that the gate holds) after every step and
 * counts the falls and hits on the way.
 */
function fuzz(def: RoomDef, seed: number, seconds: number): FuzzStats {
  const room = parseRoom(def)
  const random = mulberry32(seed)
  const where = (s: Sim) => `${def.id}, seed ${seed}, tick ${s.tick}: Pia at (${s.hero.x.toFixed(3)}, ${s.hero.y.toFixed(3)}) in ${s.phase}`
  /** The gate's column, or Infinity in a room without one: until the Big Grumble is beaten she stays left of it. */
  const gate = Math.min(Infinity, ...room.blocks.filter((b) => b.kind === 'gate').map((b) => b.col))
  const visit = () => {
    const s = createSim(room)
    const r = random()
    const form: Form = r < 0.2 ? 'big' : r < 0.35 ? 'bubble' : 'small'
    s.hero.form = form
    ;[s.hero.w, s.hero.h] = heroBox(form)
    return s
  }
  let s = visit()
  const stats: FuzzStats = { falls: 0, hits: 0 }
  let stars = 0
  let fellAt = -1
  let moveFor = 0
  let jumpFor = 0
  let jumpIn = ticks(0.5)
  let bubbleFor = 0
  for (let k = 0; k < ticks(seconds); k++) {
    if (--moveFor <= 0) {
      const r = random()
      setMove(s, r < 0.55 ? 1 : r < 0.8 ? -1 : 0)
      moveFor = ticks(0.2 + random() * 1.3)
    }
    if (jumpFor > 0 && --jumpFor === 0) releaseJump(s)
    if (--jumpIn <= 0) {
      pressJump(s)
      jumpFor = ticks(random() * 0.5)
      if (jumpFor === 0) releaseJump(s)
      jumpIn = jumpFor + ticks(0.1 + random() * 1.4)
    }
    if (bubbleFor > 0 && --bubbleFor === 0) releaseBubble(s)
    if (bubbleFor === 0 && random() < 0.003) {
      pressBubble(s)
      bubbleFor = 1 + ticks(random())
    }
    step(s, room)
    for (const e of s.events) {
      if (e.kind === 'fall') {
        stats.falls += 1
        fellAt = s.tick - 1
      } else if (e.kind === 'rescued') fellAt = -1
      else if (e.kind === 'hurt' || e.kind === 'shrink') stats.hits += 1
    }
    s.events.length = 0
    // Plain checks, not expect: this runs a few hundred thousand times.
    if (!Number.isFinite(total(s))) throw new Error(`${where(s)}: a number went bad`)
    if (s.phase !== 'rescue' && inside(s, room)) throw new Error(`${where(s)}: inside something solid`)
    if (s.hero.x - s.hero.w / 2 < 0 || s.hero.x + s.hero.w / 2 > room.cols) throw new Error(`${where(s)}: out of the room`)
    if (s.gateAt < 0 && s.hero.x + s.hero.w / 2 > gate + EPS) throw new Error(`${where(s)}: past the gate before the Big Grumble was beaten`)
    if (s.bubbles.length > BUBBLES_MAX) throw new Error(`${where(s)}: ${s.bubbles.length} bubbles out`)
    if (s.stars < stars) throw new Error(`${where(s)}: the stars went down from ${stars} to ${s.stars}`)
    stars = s.stars
    if (fellAt >= 0 && s.tick - 1 - fellAt > ticks(RESCUE_FOR) + 1) throw new Error(`${where(s)}: not rescued ${RESCUE_FOR} s after the fall`)
    if (s.phase === 'done') {
      s = visit()
      stars = 0
      fellAt = -1
    }
  }
  return stats
}

describe('a child at the controls', () => {
  ROOMS.forEach((def, i) => {
    it(`keeps every promise in the ${def.name}: ${FUZZ_SEEDS.length} seeds of ${FUZZ_SECONDS} s of random hands`, () => {
      const runs = FUZZ_SEEDS.map((seed) => fuzz(def, seed * 10 + i, FUZZ_SECONDS))
      // The hands got into trouble, so the checks on falls and hits were really made.
      expect(runs.reduce((n, r) => n + r.falls, 0)).toBeGreaterThan(0)
      expect(runs.reduce((n, r) => n + r.hits, 0)).toBeGreaterThan(0)
    })
  })
})

describe('the lints', () => {
  /** The Garden with one mistake made in its map (or its lifts). */
  const garden = ROOMS[0]!
  const parsed = parseRoom(garden)
  const gap = parsed.gaps[0]!
  const first = parsed.spawns.find((e) => e.kind === 'grumble')!
  /** A quiet spot: flat floor with nothing but stars on its three rows of air, for 9 columns well inside the room. */
  const quiet = (() => {
    for (let c = parsed.start.col + 6; c < parsed.cols - 30; c++) {
      if ([...Array(9).keys()].every((d) => parsed.floor[c + d - 4] === 13 && [10, 11, 12].every((r) => '.*'.includes(garden.map[r]![c + d - 4]!)))) return c
    }
    throw new Error('the Garden has no quiet spot for the lint tests')
  })()
  function edit(change: (map: string[][]) => void, lifts: RoomDef['lifts'] = garden.lifts, def: RoomDef = garden): RoomDef {
    const map = def.map.map((line) => [...line])
    change(map)
    return { ...def, map: map.map((line) => line.join('')), lifts }
  }
  /** The same, on another room. */
  const room = (id: RoomId) => ROOMS.find((r) => r.id === id)!
  const editIn = (id: RoomId, change: (map: string[][]) => void) => edit(change, room(id).lifts, room(id))
  /** Replaces every `from` in the map's rows r0 to r1 and columns c0 to c1 with `to`. */
  const swap = (map: string[][], from: string, to: string, r0 = 0, r1 = ROWS - 1, c0 = 0, c1 = 999) =>
    map.forEach((line, r) => line.forEach((ch, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1 && ch === from && (line[c] = to)))
  const arena = parseRoom(room('roof'))
  const gate = arena.blocks.find((b) => b.kind === 'gate')!.col
  const kitchen = parseRoom(room('kitchen'))
  const firstRise = [...kitchen.floor.keys()].find((k) => kitchen.floor[k]! - kitchen.floor[k + 1]! >= 3)!
  const put = (map: string[][], row: number, col: number, text: string) => [...text].forEach((ch, i) => (map[row]![col + i] = ch))
  const CASES: [string, RoomDef][] = [
    ['rows 0 and 1 are under the HUD', edit((m) => put(m, 1, quiet, '*'))],
    ['the start is left of column 6', edit((m) => (put(m, 12, parsed.start.col, '.'), put(m, 12, 3, '@')))],
    ['a 1-wide gap', edit((m) => (put(m, 13, gap.col0, '#'), put(m, 14, gap.col0, '#')))],
    ['a 3-wide gap', edit((m) => (put(m, 13, gap.col1, '.'), put(m, 14, gap.col1, '.')))],
    ['flat tiles of run-up', edit((m) => put(m, 12, gap.col0 - 2, '#'))],
    ['flat tiles of landing', edit((m) => put(m, 12, gap.col1 + 1, '#'))],
    ['a rise within 2 tiles of a landing', edit((m) => put(m, 12, gap.col1 + 3, '#'))],
    ['the far side is 2 higher', edit((m) => (put(m, 11, gap.col1, '########'), put(m, 12, gap.col1, '########')))],
    ['a 3-rise', edit((m) => [10, 11, 12].forEach((r) => put(m, r, quiet, '####')))],
    ['a hole 3 deep', edit((m) => [10, 11, 12].forEach((r) => put(m, r, quiet - 4, '###..###')))],
    ['only one free tile over a surface', edit((m) => put(m, 11, quiet, '#'))],
    ['1 air tiles under a box', edit((m) => put(m, 11, quiet, '?'))],
    ['a box over a gap', edit((m) => put(m, 9, gap.col0, '?'))],
    ['the first box is a power box', edit((m) => put(m, 9, 11, '?'))],
    ['a gift box over a cookie row', edit((m) => (put(m, 9, quiet, 'c'), put(m, 5, quiet, '?')))],
    ["a gap's take-off edge", edit((m) => put(m, 12, gap.col0 - 2, 'g'))],
    ["a gap's landing edge", edit((m) => put(m, 12, gap.col1 + 1, 'g'))],
    ['enemies closer than 6 tiles', edit((m) => put(m, 12, first.col + 2, 'g'))],
    ['at most 3 awake at once', edit((m) => [0, 7, 14, 21].forEach((d) => put(m, 12, quiet - 2 + d, 'g')))],
    ['meets her alone', edit((m) => put(m, 12, first.col + 8, 'g'))],
    ['a grumble standing on nothing', edit((m) => put(m, 9, quiet, 'g'))],
    ['so small Pia walks under', edit((m) => put(m, 10, quiet, 'b'))],
    ['a spring above row 10', edit((m) => put(m, 9, quiet, '^'))],
    ['something solid within 3 tiles over a spring', edit((m) => (put(m, 12, quiet, '^'), put(m, 9, quiet + 1, 'SUN')))],
    ['a ferry lift: this room has none', edit(() => {}, [{ kind: 'ferry', col: gap.col0, row: 13, width: 2, dx: 0, dy: -3 }])],
    ['stars: about one per two columns', edit((m) => m.forEach((line) => line.forEach((ch, c) => ch === '*' && (line[c] = '.'))))],
    ['no arc of stars over it', edit((m) => m.forEach((line) => line.forEach((ch, c) => ch === '*' && c >= gap.col0 - 1 && c <= gap.col1 && (line[c] = '.'))))],
    ['the staircase does not spell SUNNY', edit((m) => m.forEach((line) => line.forEach((ch, c) => ch === 'Y' && (line[c] = 'I'))))],
    ['the bed stands 4 columns after the pole', edit((m) => (put(m, parsed.bed.row, parsed.bed.col, '.'), put(m, parsed.bed.row, parsed.bed.col + 1, 'h')))],
    ['the Big Grumble and its gate belong to the Roof', edit((m) => put(m, 12, quiet, 'k'))],
    ['flower pots one and two tall', edit((m) => swap(m, '|', '#'))],
    ['a column of stars where a held jump is first needed', editIn('kitchen', (m) => swap(m, '*', '.', 0, ROWS - 1, firstRise - 2, firstRise))],
    ['a grumble walking on a cookie row', editIn('kitchen', (m) => swap(m, 'g', '.', 0, 8))],
    ['the wand comes from a power box in the last third', editIn('kitchen', (m) => swap(m, 'p', '?', 0, ROWS - 1, 60))],
    ['shell bowling', editIn('toys', (m) => swap(m, '|', '.', 0, 12, 100))],
    ['it would pace where she lands', editIn('kitchen', (m) => swap(m, '|', '.', 12, 12, 70, 75))],
    ['a spring leads up to a high shelf', editIn('toys', (m) => swap(m, '=', '.', 0, 7, 0, 40))],
    ['the gate is one column of gate blocks', editIn('roof', (m) => swap(m, 'x', '.', 0, 8))],
    ['the Big Grumble is alone in its arena', editIn('roof', (m) => put(m, 12, gate - 4, 'g'))],
    ['keep 5 tiles from the gate', editIn('roof', (m) => put(m, 9, gate - 3, '='))],
  ]

  it('the Garden as written breaks none', () => {
    expect(lint(garden)).toEqual([])
  })

  for (const [what, def] of CASES) {
    it(`catch "${what}"`, () => {
      const problems = lint(def)
      expect(problems.some((p) => p.includes(what)), `wanted "${what}" among:\n${problems.join('\n\n')}`).toBe(true)
    })
  }
})
