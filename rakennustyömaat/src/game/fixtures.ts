import { PRESENTS } from './catalog'
import { defaultItems } from './items'
import { DEPTH, canPlace, houseRect, roomRect, slotsOf } from './layout'
import { MACHINES, MATERIALS, RAWS, THEMES, type HouseKind, type Keep, type Material, type Plot, type RoofStyle, type Shape, type Shot, type Theme } from './model'
import { freshKeep } from './progress'
import { START_X } from './rules'

/**
 * Saves for ?demo, the screenshots and the tests: rich scenes that come out the same every
 * time. They are never written to the child's save. Every house is built room by room
 * through layout.canPlace and every themed room holds its theme's default items, so a demo
 * is a keep the rules could have made.
 */

export const DEMOS = ['street', 'tall', 'row', 'room', 'road', 'mirror', 'themes'] as const
export type Demo = (typeof DEMOS)[number]

type RoomSpec = readonly [shape: Shape, col: number, row: number, material: Material, theme: Theme | null]

/** A house of `kind` with these rooms put in in order; a room that would not fit there throws. */
function house(keep: Keep, kind: HouseKind, roof: RoofStyle, rooms: readonly RoomSpec[]): Plot {
  const p: Plot = { kind, roof, rooms: [] }
  for (const [shape, col, row, material, theme] of rooms) {
    if (!canPlace(p, shape, col, row)) throw new Error(`demo room ${shape} at ${col},${row} does not fit`)
    const id = keep.nextId++
    p.rooms.push({ id, shape, col, row, material, theme, items: theme === null ? slotsOf(shape).map(() => null) : defaultItems(theme, shape), wall: (id % 4) as 0 | 1 | 2 | 3, floor: ((id + 1) % 4) as 0 | 1 | 2 | 3 })
  }
  return p
}
const empty = (): Plot => ({ kind: null, roof: 'pointed', rooms: [] })

/** A full tall house, every material and every shape in it. */
const TALL: readonly RoomSpec[] = [
  ['big', 0, 0, 'planks', 'play'],
  ['tall', 2, 0, 'bricks', 'slide'],
  ['wide', 0, 2, 'concrete', 'music'],
  ['small', 2, 2, 'glass', 'cat'],
  ['tall', 0, 3, 'rainbow', 'sleep'],
  ['big', 1, 3, 'bricks', 'disco'],
]
/** A full row house: a big home, a home of three rooms, and a home of a tall room beside two small ones. */
const ROW: readonly RoomSpec[] = [
  ['big', 0, 0, 'glass', 'ballpit'],
  ['wide', 2, 0, 'planks', 'gym'],
  ['small', 2, 1, 'bricks', 'crafts'],
  ['small', 3, 1, 'concrete', 'birthday'],
  ['tall', 4, 0, 'rainbow', 'space'],
  ['small', 5, 0, 'planks', 'kitchen'],
  ['small', 5, 1, 'glass', 'bath'],
]

/** The keep of a demo: every machine built, goods in every stack and (but for the themes) every heap, the presents of its trips opened. */
export function demoKeep(demo: Demo): Keep {
  const keep = freshKeep()
  keep.trips = demo === 'mirror' || demo === 'themes' ? PRESENTS.length : 8
  keep.unlocked = PRESENTS.slice(0, keep.trips)
  for (const m of MACHINES) keep.machines[m] = 'built'
  RAWS.forEach((g, i) => (keep.goods[g] = 4 + i))
  MATERIALS.forEach((g, i) => (keep.goods[g] = 12 - i))
  switch (demo) {
    case 'street':
      keep.plots = [house(keep, 'tall', 'pointed', TALL), house(keep, 'row', 'garden', ROW), house(keep, 'tall', 'tower', [['wide', 0, 0, 'bricks', 'birthday'], ['small', 0, 1, 'planks', null]]), empty()]
      break
    case 'tall':
      keep.plots = [house(keep, 'tall', 'round', TALL), empty()]
      break
    case 'row':
      keep.plots = [house(keep, 'row', 'pointed', ROW), empty()]
      break
    case 'room':
      keep.plots = [house(keep, 'tall', 'pointed', [['big', 0, 0, 'concrete', 'disco'], ['small', 2, 0, 'planks', 'play']]), empty()]
      break
    case 'road':
      RAWS.forEach((g) => (keep.goods[g] = 20))
      MATERIALS.forEach((g) => (keep.goods[g] = 30))
      keep.plots = [house(keep, 'tall', 'pointed', [['wide', 0, 0, 'planks', 'gym']]), empty()]
      break
    case 'mirror':
      keep.plots = [empty()]
      break
    case 'themes': {
      // Twelve small rooms in a tall house and two in a row house's first home: all fourteen themes, both houses in one street shot.
      // Nothing waits on a heap, so what bounces is the tall house a room still fits, in view: the camera stays.
      for (const g of RAWS) keep.goods[g] = 0
      const smalls = THEMES.map((theme, i): RoomSpec => (i < 12 ? ['small', i % 3, Math.floor(i / 3), MATERIALS[i % 5]!, theme] : ['small', i - 12, 0, MATERIALS[i % 5]!, theme]))
      keep.plots = [house(keep, 'tall', 'pointed', smalls.slice(0, 12)), house(keep, 'row', 'round', smalls.slice(12)), empty()]
      break
    }
  }
  return keep
}

/** The shot a demo opens on. */
export function demoShot(demo: Demo, keep: Keep): Shot {
  switch (demo) {
    case 'street':
      return { kind: 'street', x: 44 }
    case 'tall':
    case 'row':
      return { kind: 'plot', plot: 0 }
    case 'room':
      return { kind: 'room', plot: 0, room: keep.plots[0]!.rooms[0]!.id }
    case 'road':
      return { kind: 'street', x: START_X }
    case 'mirror':
      return { kind: 'mirror' }
    case 'themes': {
      // From the tall house's left edge to the row house's last room, in the middle: both houses whole on a screen 1024 wide and up.
      const row = keep.plots[1]!.rooms.map((r) => roomRect(1, r))
      return { kind: 'street', x: (houseRect(0, keep.plots[0]!).x + Math.max(...row.map((r) => r.x + r.w)) + DEPTH) / 2 }
    }
  }
}
