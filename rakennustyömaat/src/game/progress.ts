import { DEFAULT_LOOK, LOOK_KEYS, PRESENTS, optionOpen, roomCost } from './catalog'
import { ITEMS, isItem } from './items'
import { canPlace, slotsOf } from './layout'
import {
  GOODS,
  MACHINES,
  MATERIALS,
  MAX_PLOTS,
  ROOFS,
  SHAPES,
  THEMES,
  type Good,
  type Keep,
  type Look,
  type MachineId,
  type MachineStage,
  type PlacedRoom,
  type Plot,
  type Unlock,
} from './model'

/**
 * The save as pure functions: a fresh keep, reading a saved one leniently field by field
 * (plans/rakennustyömaat.md, "The save forgives"), and writing one. A save is never thrown
 * away for one bad field: an unknown item becomes an empty slot, an unknown theme none, a
 * room that no longer fits is removed and its goods given back, a bad count is 0, a bad look
 * part the default, an unknown unlock is dropped. Only text that is not a version 1 object
 * at all starts fresh.
 */

export const SAVE_KEY = 'rakennustyömaat'

/** A new game: the default builder, no goods, five empty pads, one empty plot, no trips. */
export function freshKeep(): Keep {
  return {
    v: 1,
    look: { ...DEFAULT_LOOK },
    goods: Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<Good, number>,
    machines: Object.fromEntries(MACHINES.map((m) => [m, 'pad'])) as Record<MachineId, MachineStage>,
    plots: [{ kind: null, roof: 'pointed', rooms: [] }],
    trips: 0,
    unlocked: [],
    nextId: 1,
    sound: true,
    music: true,
  }
}

type Data = Record<string, unknown>

const isObject = (x: unknown): x is Data => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
/** `x` if it is one of `options`, else `fallback`. */
const oneOf = <T>(options: readonly T[], x: unknown, fallback: T): T => (options.includes(x as T) ? (x as T) : fallback)

/** The look part by part: a part that is not one of its open options (the player's hat is never 'none', a present's option not yet unlocked is closed) is the default's. */
function readLook(x: unknown, unlocked: readonly Unlock[]): Look {
  const d = isObject(x) ? x : {}
  return Object.fromEntries(LOOK_KEYS.map((field) => [field, optionOpen(unlocked, field, d[field]) ? d[field] : DEFAULT_LOOK[field]])) as unknown as Look
}

/**
 * A room as saved, before it is checked against its plot: null when its shape or material is
 * unknown, so there is no price to give back. A room with a damaged place (not two whole
 * counts) is kept at a place that never fits, so its plot takes it down and refunds it.
 */
function readRoom(x: unknown): PlacedRoom | null {
  if (!isObject(x)) return null
  const shape = oneOf(SHAPES, x.shape, null)
  const material = oneOf(MATERIALS, x.material, null)
  if (shape === null || material === null) return null
  const [col, row] = isCount(x.col) && isCount(x.row) ? [x.col, x.row] : [-1, -1]
  const slots = slotsOf(shape)
  const saved = Array.isArray(x.items) ? x.items : []
  // An item this game does not know, or one in a slot of another kind, leaves its slot empty.
  const items = slots.map((slot, i) => {
    const it = saved[i]
    return typeof it === 'string' && isItem(it) && ITEMS[it].slot === slot.kind ? it : null
  })
  return {
    id: isCount(x.id) && x.id > 0 ? x.id : 0,
    shape,
    col,
    row,
    material,
    theme: oneOf(THEMES, x.theme, null),
    items,
    wall: oneOf([0, 1, 2, 3] as const, x.wall, 0),
    floor: oneOf([0, 1, 2, 3] as const, x.floor, 0),
  }
}

/**
 * A plot and the goods its unfitting rooms give back. Rooms are placed again from the
 * ground up (canPlace: in the grid, on free cells, resting on the ground or on rooms, inside
 * one home of a row house); a room that does not fit is removed and its material refunded.
 * The kept rooms stay in their saved order. A plot past the street's end (`onStreet` false)
 * has no house, so all its rooms are given back.
 */
function readPlot(x: unknown, onStreet: boolean): { plot: Plot; refund: Partial<Record<Good, number>> } {
  const d = isObject(x) ? x : {}
  const kind = onStreet ? oneOf(['tall', 'row'] as const, d.kind, null) : null
  const rooms = (Array.isArray(d.rooms) ? d.rooms : []).map(readRoom).filter((r) => r !== null)
  const plot: Plot = { kind, roof: oneOf(ROOFS, d.roof, 'pointed'), rooms: [] }
  const refund: Partial<Record<Good, number>> = {}
  const kept = new Set<PlacedRoom>()
  for (const room of [...rooms].sort((a, b) => a.row - b.row)) {
    if (canPlace(plot, room.shape, room.col, room.row)) {
      plot.rooms.push(room)
      kept.add(room)
    } else refund[room.material] = (refund[room.material] ?? 0) + roomCost(room.shape)
  }
  plot.rooms = rooms.filter((r) => kept.has(r))
  return { plot, refund }
}

/**
 * Reads a saved keep. Null, text that is not JSON, and JSON that is not an object with
 * `v: 1` start fresh; anything else is kept field by field (see the file's header). The
 * keep's own rules hold afterwards: one to MAX_PLOTS plots with the empty plot waiting last
 * (until the street is full), room ids unique and below `nextId`.
 */
export function parseKeep(text: string | null): Keep {
  if (text === null) return freshKeep()
  let data: unknown
  // Text that is not JSON is junk like any other; JSON.parse has no way to say so but throwing.
  try {
    data = JSON.parse(text)
  } catch {
    return freshKeep()
  }
  if (!isObject(data) || data.v !== 1) return freshKeep()
  const fresh = freshKeep()
  const seen = new Set<Unlock>()
  for (const u of Array.isArray(data.unlocked) ? data.unlocked : []) if (PRESENTS.includes(u as Unlock)) seen.add(u as Unlock)
  const unlocked = [...seen]
  const savedGoods = isObject(data.goods) ? data.goods : {}
  const goods = Object.fromEntries(GOODS.map((g) => [g, isCount(savedGoods[g]) ? savedGoods[g] : 0])) as Record<Good, number>
  const savedMachines = isObject(data.machines) ? data.machines : {}
  const machines = Object.fromEntries(MACHINES.map((m) => [m, oneOf(['pad', 'crate', 'built'] as const, savedMachines[m], 'pad')])) as Record<MachineId, MachineStage>

  const savedPlots = Array.isArray(data.plots) ? data.plots : []
  const plots: Plot[] = []
  savedPlots.forEach((p, i) => {
    const { plot, refund } = readPlot(p, i < MAX_PLOTS)
    if (i < MAX_PLOTS) plots.push(plot)
    for (const [g, n] of Object.entries(refund) as [Good, number][]) goods[g] += n
  })
  if (plots.length === 0) plots.push(...fresh.plots)
  const last = plots[plots.length - 1]!
  if (plots.length < MAX_PLOTS && last.rooms.length > 0) plots.push({ kind: null, roof: 'pointed', rooms: [] })

  // Ids are save keys for shots and stamps: a missing or repeated one gets a new id past every other.
  const rooms = plots.flatMap((p) => p.rooms)
  let nextId = Math.max(isCount(data.nextId) ? data.nextId : 1, 1, ...rooms.map((r) => r.id + 1))
  const ids = new Set<number>()
  for (const room of rooms) {
    if (room.id === 0 || ids.has(room.id)) room.id = nextId++
    ids.add(room.id)
  }

  return {
    v: 1,
    look: readLook(data.look, unlocked),
    goods,
    machines,
    plots,
    trips: isCount(data.trips) ? data.trips : 0,
    unlocked,
    nextId,
    sound: typeof data.sound === 'boolean' ? data.sound : true,
    music: typeof data.music === 'boolean' ? data.music : true,
  }
}

export function serializeKeep(keep: Keep): string {
  return JSON.stringify(keep)
}
