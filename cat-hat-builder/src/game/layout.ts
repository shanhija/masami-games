import { HOME_COLS, HOUSE_GRID, SHAPE_SIZE } from './catalog'
import { DRIVE_IN, MACHINES, STEP, TIP, since, ticks, type Hit, type HouseKind, type MachineId, type Part, type PlacedRoom, type Plot, type RoadDef, type Shape, type SlotKind, type State } from './model'
import type { View } from './camera'
import { toWorld } from './camera'

/**
 * Where everything is, as pure functions: the street (garage, yard, plots), the house grid,
 * the rooms and their slots, the road's things, and what a point on the screen lands on.
 * The renderer draws at these places and the input hit-tests the same ones, so a picture
 * and its tap can never disagree. Metres, y down, the ground at y = 0 (see model.ts).
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
export const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// ---------------------------------------------------------------------------------------
// The street, left to right: the garage, the yard of five machine stations, the plots.

export const GARAGE_W = 12
/** The truck parks in the garage with its middle here, and stands here in the yard while it tips. */
export const TRUCK_HOME_X = 6.2
export const TRUCK_TIP_X = 29.5
/** The mirror stands at the garage's right end; the builder stands in front of it, facing right. */
export const MIRROR_X = 10.6
export const MIRROR_BUILDER_X = 9.7
const YARD_X = 12
export const STATION_W = 7
export const PLOTS_X = YARD_X + MACHINES.length * STATION_W + 1
export const PLOT_W = 18
/** A house's grid starts this far into its plot. The tall house's glass lift stands just right of its grid. */
export const HOUSE_X = 1.8
export const LIFT_W = 1.2
/** The street ends a little past its last plot (the empty one waiting): the field where the next plot will be levelled. */
export const streetEnd = (plots: number) => PLOTS_X + plots * PLOT_W + 8

/**
 * After a trip the truck drives in from DRIVE_FROM metres left of TRUCK_TIP_X over
 * model.DRIVE_IN, easing to a stop as s.tipAt comes; its bed rises over the first TIP_UP and
 * comes down over the last TIP_DOWN of model.TIP (fractions of it); it waits BACK_WAIT and
 * backs into the garage over BACK_FOR (seconds).
 */
export const DRIVE_FROM = 36
const TIP_UP = 0.3
const TIP_DOWN = 0.3
export const BACK_WAIT = 0.4
const BACK_FOR = 2.4
/** 0 at or below a, 1 at or above b, smoothstepped between. */
const ease = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}
/**
 * The truck on the street at sim time t (seconds): its middle's x, how far its bed is tipped
 * (0 to 1), whether the builder sits at the wheel, and whether it rolls. Parked in the
 * garage, or after a trip driving in, tipping at TRUCK_TIP_X from s.tipAt and backing home.
 * The renderer draws the truck here and the hit test puts its target here.
 */
export function truckOnStreet(s: State, t: number): { x: number; tip: number; driver: boolean; moving: boolean } {
  const driver = s.builder.at.kind === 'truck'
  const age = since(s.tipAt, t)
  if (age >= TIP + BACK_WAIT + BACK_FOR) return { x: TRUCK_HOME_X, tip: 0, driver, moving: false }
  if (age < 0) {
    const u = Math.max(0, 1 + age / DRIVE_IN)
    return { x: TRUCK_TIP_X - DRIVE_FROM * (1 - u) * (1 - u), tip: 0, driver, moving: true }
  }
  if (age < TIP) return { x: TRUCK_TIP_X, tip: ease(0, TIP_UP, age / TIP) * (1 - ease(1 - TIP_DOWN, 1, age / TIP)), driver, moving: false }
  const u = Math.max(0, (age - TIP - BACK_WAIT) / BACK_FOR)
  return { x: TRUCK_TIP_X + (TRUCK_HOME_X - TRUCK_TIP_X) * ease(0, 1, u), tip: 0, driver, moving: u > 0 }
}
/** The truck is still driving into the yard with the builder at the wheel: the street answers no tap until it tips, so nobody leaves the cab on the way. */
export const truckDrivingIn = (s: State) => s.tick < s.tipAt

export const stationLeft = (m: MachineId) => YARD_X + MACHINES.indexOf(m) * STATION_W
/** The raw heap left of a machine, the machine (or its pad or crate), the stack of what it made right of it. */
export const heapRect = (m: MachineId) => rect(stationLeft(m) + 0.3, -1.0, 2.0, 1.0)
export const machineRect = (m: MachineId) => rect(stationLeft(m) + 2.3, -2.6, 2.4, 2.6)
export const stackRect = (m: MachineId) => rect(stationLeft(m) + 4.9, -1.2, 1.6, 1.2)
/** A machine's whole station, its heap to its stack, as tall as the machine: its target on the street. */
export const stationRect = (m: MachineId) => rect(heapRect(m).x, machineRect(m).y, stackRect(m).x + stackRect(m).w - heapRect(m).x, -machineRect(m).y)
/** Where the builder stands to work a machine: at its lever, left of its body, facing right. */
export const machineSpot = (m: MachineId) => stationLeft(m) + 2.0
/**
 * The present from a trip pops out of the back of the truck's bed as it tips, flies over
 * PRESENT_POP and lands here, on the yard's sand between the oven's stack and the mixer's
 * heap, and opens: the street shot after a trip (rules.YARD_VIEW_X) shows it on every screen,
 * a phone held upright too. Its card shows for PRESENT_FOR after it opens (presentOpenAt);
 * the box answers taps only meanwhile, and then it shrinks away.
 */
export const PRESENT_X = (stackRect('oven').x + stackRect('oven').w + heapRect('mixer').x) / 2
export const PRESENT_POP = 0.8
export const PRESENT_FOR = 3.5
/** The tick the present stands open at PRESENT_X: PRESENT_POP after the tip when it came home in the bed (s.presentAt is then s.tipAt), at once when a tap opens it again; -1 with no present. */
export const presentOpenAt = (s: State) => (s.presentAt >= 0 && s.presentAt === s.tipAt ? s.presentAt + ticks(PRESENT_POP) : s.presentAt)

export const plotLeft = (plot: number) => PLOTS_X + plot * PLOT_W
export const plotRect = (plot: number) => rect(plotLeft(plot), -16, PLOT_W, 16)

// ---------------------------------------------------------------------------------------
// Houses: a grid of square cells, row 0 on the ground.

export const CELL = 2.4
/** A room's frame in its material: the posts at its sides, the slab under it, the top over it. */
export const POST = 0.12
export const SLAB = 0.2
export const TOP = 0.1
/** Floor items stand this far above the slab, on the theme's floor band (FLOOR_BAND tall). */
export const FLOOR_LIFT = 0.1
export const FLOOR_BAND = 0.2
/** The roof over the top room of each column, and the made things' faces: the top and right faces recede up-right by DEPTH. */
export const ROOF_H = 1.4
export const DEPTH = 0.24

export const gridLeft = (plot: number) => plotLeft(plot) + HOUSE_X
/** The world rect of a room: the union of its cells, frame included. */
export function roomRect(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row'>): Rect {
  const { w, h } = SHAPE_SIZE[room.shape]
  return rect(gridLeft(plot) + room.col * CELL, -(room.row + h) * CELL, w * CELL, h * CELL)
}
/** The inside of a room (inside its frame), where the wallpaper goes. */
export function interiorRect(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row'>): Rect {
  const r = roomRect(plot, room)
  return rect(r.x + POST, r.y + TOP, r.w - 2 * POST, r.h - TOP - SLAB)
}
/** The whole grid of a house kind on a plot, roofs not included. */
function gridRect(plot: number, kind: HouseKind): Rect {
  const g = HOUSE_GRID[kind]
  return rect(gridLeft(plot), -g.rows * CELL, g.cols * CELL, g.rows * CELL)
}
/** The roof piece over column `col`, sitting on the top of that column's highest room, or null where the column is empty. */
export function roofRect(plot: number, p: Plot, col: number): Rect | null {
  let top = 0
  for (const room of p.rooms) {
    const { w, h } = SHAPE_SIZE[room.shape]
    if (col >= room.col && col < room.col + w) top = Math.max(top, room.row + h)
  }
  return top === 0 ? null : rect(gridLeft(plot) + col * CELL, -top * CELL - ROOF_H, CELL, ROOF_H)
}
/** The tall house's glass lift, right of its grid, as tall as its highest room. */
export function liftRect(plot: number, p: Plot): Rect | null {
  if (p.kind !== 'tall' || p.rooms.length === 0) return null
  const top = Math.max(...p.rooms.map((r) => r.row + SHAPE_SIZE[r.shape].h))
  return rect(gridLeft(plot) + HOUSE_GRID.tall.cols * CELL, -top * CELL, LIFT_W, top * CELL)
}
/**
 * The front doors, where draw/house.ts drawDoors draws them: the tall house's lobby against
 * the lift's foot, right of it, LOBBY wide and tall; a row house's door with its steps and its
 * flat hood, ROW_DOOR wide and tall, centred on each home's left edge.
 */
const LOBBY = { w: 0.9, h: 1.8 } as const
const ROW_DOOR = { w: 0.6, h: 1.73 } as const
export function doorRects(plot: number, p: Plot): Rect[] {
  switch (p.kind) {
    case null:
      return []
    case 'tall':
      return [rect(gridLeft(plot) + HOUSE_GRID.tall.cols * CELL + LIFT_W, -LOBBY.h, LOBBY.w, LOBBY.h)]
    case 'row':
      return Array.from({ length: HOUSE_GRID.row.cols / HOME_COLS }, (_, home) => rect(gridLeft(plot) + home * HOME_COLS * CELL - ROW_DOOR.w / 2, -ROW_DOOR.h, ROW_DOOR.w, ROW_DOOR.h))
  }
}
/** Everything a house shows on its plot, roofs and lift included: what the build view fits on screen. */
export function houseRect(plot: number, p: Plot): Rect {
  if (p.kind === null) return rect(plotLeft(plot) + 0.5, -6, PLOT_W - 1, 7)
  const g = gridRect(plot, p.kind)
  const w = g.w + (p.kind === 'tall' ? LIFT_W + 0.8 : 0)
  return rect(g.x - 0.6, g.y - ROOF_H - 0.6, w + 1.2 + DEPTH, g.h + ROOF_H + 1.6)
}

/** Which cells of a plot are taken, and by which room. */
export function occupancy(p: Plot): Map<string, PlacedRoom> {
  const taken = new Map<string, PlacedRoom>()
  for (const room of p.rooms) {
    const { w, h } = SHAPE_SIZE[room.shape]
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) taken.set(`${room.col + c},${room.row + r}`, room)
  }
  return taken
}

/**
 * A room of `shape` can go with its bottom-left cell at (col, row) when it fits the grid,
 * every cell is free, every bottom cell rests on the ground or on a room, and in a row house
 * it stays inside one home.
 */
export function canPlace(p: Plot, shape: Shape, col: number, row: number): boolean {
  if (p.kind === null) return false
  const g = HOUSE_GRID[p.kind]
  const { w, h } = SHAPE_SIZE[shape]
  if (col < 0 || row < 0 || col + w > g.cols || row + h > g.rows) return false
  if (p.kind === 'row' && Math.floor(col / HOME_COLS) !== Math.floor((col + w - 1) / HOME_COLS)) return false
  const taken = occupancy(p)
  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) if (taken.has(`${col + c},${row + r}`)) return false
    if (row > 0 && !taken.has(`${col + c},${row - 1}`)) return false
  }
  return true
}
export function validSpots(p: Plot, shape: Shape): { col: number; row: number }[] {
  if (p.kind === null) return []
  const g = HOUSE_GRID[p.kind]
  const spots: { col: number; row: number }[] = []
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) if (canPlace(p, shape, col, row)) spots.push({ col, row })
  return spots
}
/** The rooms resting on this one (on any of its top cells). Only a room with none can be taken back. */
export function roomsOnTop(p: Plot, room: PlacedRoom): PlacedRoom[] {
  const { w, h } = SHAPE_SIZE[room.shape]
  const taken = occupancy(p)
  const on = new Set<PlacedRoom>()
  for (let c = 0; c < w; c++) {
    const above = taken.get(`${room.col + c},${room.row + h}`)
    if (above) on.add(above)
  }
  return [...on]
}

// ---------------------------------------------------------------------------------------
// Slots: where a room's items go. Per cell column: one ceiling slot, one wall slot per
// storey, two floor slots on the bottom storey. small 4, wide 8, tall 5, big 10 slots.

interface Slot {
  kind: SlotKind
  /** The anchor in room-local metres (origin the room rect's top-left, y down): the top centre of a ceiling slot, the centre of a wall slot, the bottom centre of a floor slot. */
  x: number
  y: number
}
/** The box an item draws in, around its anchor, facing right: the draw tests fail an item that strays more than 10% outside it. */
export const SLOT_BOX: Record<SlotKind, { x0: number; y0: number; x1: number; y1: number }> = {
  ceiling: { x0: -0.45, y0: 0, x1: 0.45, y1: 0.6 },
  wall: { x0: -0.45, y0: -0.3, x1: 0.45, y1: 0.3 },
  floor: { x0: -0.48, y0: -1.15, x1: 0.48, y1: 0 },
}
const CEILING_X = 0.7
const WALL_X = 1.65
/** A wall slot's centre is this far above its storey's floor line. */
const WALL_UP = 1.5
const FLOOR_XS = [0.62, 1.78] as const

const slotCache = new Map<Shape, readonly Slot[]>()
/** A shape's slots in their fixed order: ceilings left to right, walls top storey first and left to right, floors left to right. Slot indices are save keys. */
export function slotsOf(shape: Shape): readonly Slot[] {
  const cached = slotCache.get(shape)
  if (cached) return cached
  const { w, h } = SHAPE_SIZE[shape]
  const H = h * CELL
  const floorY = H - SLAB - FLOOR_LIFT
  const slots: Slot[] = []
  for (let c = 0; c < w; c++) slots.push({ kind: 'ceiling', x: c * CELL + CEILING_X, y: TOP })
  for (let s = h - 1; s >= 0; s--) for (let c = 0; c < w; c++) slots.push({ kind: 'wall', x: c * CELL + WALL_X, y: floorY - s * CELL - WALL_UP })
  for (let c = 0; c < w; c++) for (const fx of FLOOR_XS) slots.push({ kind: 'floor', x: c * CELL + fx, y: floorY })
  slotCache.set(shape, slots)
  return slots
}
/** A slot's anchor in world metres. */
function slotPoint(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row'>, slot: number) {
  const r = roomRect(plot, room)
  const s = slotsOf(room.shape)[slot]!
  return { x: r.x + s.x, y: r.y + s.y }
}
/** A slot's box in world metres. */
export function slotRect(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row'>, slot: number): Rect {
  const s = slotsOf(room.shape)[slot]!
  const p = slotPoint(plot, room, slot)
  const b = SLOT_BOX[s.kind]
  return rect(p.x + b.x0, p.y + b.y0, b.x1 - b.x0, b.y1 - b.y0)
}
/** Where the builder stands for a visit to a room as it starts (BuilderAt keeps it for the visit), on the floor line: at its first empty floor slot, so no friend or floor item hides behind them, else in its middle in front of the floor items. */
export function visitPoint(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row' | 'items'>) {
  const r = roomRect(plot, room)
  const slots = slotsOf(room.shape)
  const free = slots.findIndex((sl, i) => sl.kind === 'floor' && room.items[i] === null)
  return { x: r.x + (free < 0 ? r.w / 2 : slots[free]!.x), y: r.y + r.h - SLAB - FLOOR_LIFT }
}
/** The visiting builder's box: VISITOR.w wide around the x they stand at, VISITOR.h tall from the floor line. Their target in the room view, and what they hide of the floor things behind them. */
export const VISITOR = { w: 0.7, h: 1.25 } as const
/** How many metres across of a slot's box the visiting builder standing at street x covers: 0 for a floor slot they stand clear of, and for every slot not on the floor. */
export function coverOf(plot: number, room: Pick<PlacedRoom, 'shape' | 'col' | 'row'>, slot: number, x: number): number {
  const sl = slotsOf(room.shape)[slot]!
  if (sl.kind !== 'floor') return 0
  const a = roomRect(plot, room).x + sl.x
  return Math.max(0, Math.min(x + VISITOR.w / 2, a + SLOT_BOX.floor.x1) - Math.max(x - VISITOR.w / 2, a + SLOT_BOX.floor.x0))
}

// ---------------------------------------------------------------------------------------
// The mirror: tapping a part of the big builder opens that part's tab. Builder-local
// metres (origin at the feet, facing right), matching draw/builder.ts's proportions.

const PART_RECTS: readonly { part: Part; r: Rect }[] = [
  { part: 'hat', r: rect(-0.32, -1.24, 0.64, 0.34) },
  { part: 'glasses', r: rect(0.0, -0.9, 0.24, 0.16) },
  { part: 'hair', r: rect(-0.3, -0.98, 0.3, 0.4) },
  { part: 'skin', r: rect(-0.0, -0.74, 0.24, 0.14) },
  { part: 'tool', r: rect(0.14, -0.62, 0.36, 0.36) },
  { part: 'bag', r: rect(-0.42, -0.66, 0.26, 0.4) },
  { part: 'shirt', r: rect(-0.16, -0.64, 0.32, 0.34) },
  { part: 'shoes', r: rect(-0.16, -0.08, 0.36, 0.08) },
  { part: 'pants', r: rect(-0.16, -0.3, 0.32, 0.22) },
]

// ---------------------------------------------------------------------------------------
// The road

/** The truck: its length, height from the ground to the cab roof, the distance between its wheels and their radius. */
export const TRUCK = { length: 4.4, height: 2.3, wheelBase: 2.8, wheel: 0.45 } as const
/** The ground's y at road x (metres from the start), between the samples. */
export function groundAt(def: RoadDef, x: number): number {
  const g = def.ground
  const i = Math.max(0, Math.min(g.length - 2, Math.floor(x)))
  const k = Math.max(0, Math.min(1, x - i))
  return g[i]! + (g[i + 1]! - g[i]!) * k
}
/** A boulder's rect at its x (it sits on the ground there). */
export function boulderRect(def: RoadDef, x: number, size: 'small' | 'big'): Rect {
  const w = size === 'small' ? 1.2 : 1.6
  const h = size === 'small' ? 1.3 : 1.8
  return rect(x - w / 2, groundAt(def, x) - h, w, h)
}
/** Where the truck stops before a boulder or crossing at x: its front clear of it. */
export const stopBefore = (x: number) => x - TRUCK.length / 2 - 1.6

// ---------------------------------------------------------------------------------------
// What a tap lands on

/** A thing the child can tap, its world rect, and its height in the pile (higher wins). */
interface Target {
  hit: Hit
  rect: Rect
  z: number
}
/** A target is grown to at least this many CSS pixels on screen; a miss takes the nearest target within NEAR. */
const MIN_TARGET = 56
const NEAR = 40

/**
 * The targets of the shot on screen, for the state as it is. The rules accept exactly these
 * hits (a hit not offered here is never acted on), and ?debug outlines them.
 */
export function targets(s: State): Target[] {
  const out: Target[] = []
  const shot = s.shot
  const keep = s.keep
  switch (shot.kind) {
    case 'mirror': {
      for (const { part, r } of PART_RECTS) out.push({ hit: { kind: 'part', part }, rect: rect(MIRROR_BUILDER_X + r.x, r.y, r.w, r.h), z: 2 })
      return out
    }
    case 'street': {
      if (truckDrivingIn(s)) return out
      // The truck in front of the machines while it tips in the yard and backs home.
      const truck = truckOnStreet(s, s.tick * STEP)
      out.push({ hit: { kind: 'truck' }, rect: rect(truck.x - TRUCK.length / 2, -TRUCK.height, TRUCK.length, TRUCK.height), z: truck.x === TRUCK_HOME_X ? 1 : 2 })
      out.push({ hit: { kind: 'mirror' }, rect: rect(MIRROR_X - 0.6, -2.0, 1.2, 2.0), z: 1 })
      // The open present while its card shows (then it shrinks away), under everything else: it never takes a tap meant for the truck, a heap or a machine beside it.
      const open = presentOpenAt(s)
      if (s.presentGot !== null && s.tick >= open && s.tick < open + ticks(PRESENT_FOR)) out.push({ hit: { kind: 'present' }, rect: rect(PRESENT_X - 0.45, -0.9, 0.9, 0.9), z: 0 })
      for (const m of MACHINES) out.push({ hit: { kind: 'machine', m }, rect: stationRect(m), z: 1 })
      keep.plots.forEach((_, plot) => out.push({ hit: { kind: 'plot', plot }, rect: plotRect(plot), z: 0 }))
      return out
    }
    case 'plot': {
      const plot = shot.plot
      const p = keep.plots[plot]!
      // An empty plot: its sign asks which house again.
      if (p.kind === null) return [{ hit: { kind: 'plot', plot }, rect: houseRect(plot, p), z: 0 }]
      for (const room of p.rooms) out.push({ hit: { kind: 'room', plot, room: room.id }, rect: roomRect(plot, room), z: 1 })
      // A door rings the party. The tall house's lobby stands outside the grid, over everything; a row house's doors stand on its homes' edges, level with the rooms beside them (the nearest middle wins) and under a ghost, so a room goes in where the child places it.
      if (p.rooms.length > 0) for (const r of doorRects(plot, p)) out.push({ hit: { kind: 'door', plot }, rect: r, z: p.kind === 'tall' ? 3 : 1 })
      for (let col = 0; col < HOUSE_GRID[p.kind].cols; col++) {
        const r = roofRect(plot, p, col)
        if (r) out.push({ hit: { kind: 'roof', plot }, rect: r, z: 1 })
      }
      if (!s.hand) for (const spot of validSpots(p, s.shape)) out.push({ hit: { kind: 'spot', plot, col: spot.col, row: spot.row }, rect: roomRect(plot, { shape: s.shape, col: spot.col, row: spot.row }), z: 2 })
      return out
    }
    case 'room': {
      const plot = shot.plot
      const room = keep.plots[plot]!.rooms.find((r) => r.id === shot.room)!
      out.push({ hit: { kind: 'room', plot, room: room.id }, rect: interiorRect(plot, room), z: 0 })
      room.items.forEach((item, slot) => {
        if (item !== null) out.push({ hit: { kind: 'item', plot, room: room.id, slot }, rect: slotRect(plot, room, slot), z: 2 })
      })
      // The visiting builder, where the visit started, under the items: a tap meant for an item they stand beside plays the item.
      const at = s.builder.at
      if (at.kind === 'room' && at.room === room.id) {
        const y = visitPoint(plot, room).y
        out.push({ hit: { kind: 'builder' }, rect: rect(at.x - VISITOR.w / 2, y - VISITOR.h, VISITOR.w, VISITOR.h), z: 1 })
      }
      return out
    }
    case 'road': {
      const road = s.road!
      const stop = road.stop >= 0 ? road.def.things[road.stop]! : null
      if (stop && stop.kind === 'boulder') out.push({ hit: { kind: 'boulder' }, rect: boulderRect(road.def, stop.x, stop.size), z: 2 })
      road.def.things.forEach((t, i) => {
        if (t.kind === 'crosser' && Math.abs(t.x - road.x) < 25) out.push({ hit: { kind: 'crosser', i }, rect: rect(t.x - 1.5, groundAt(road.def, t.x) - 1.2, 3, 1.2), z: 1 })
      })
      out.push({ hit: { kind: 'truck' }, rect: rect(road.x - TRUCK.length / 2, road.y - TRUCK.height, TRUCK.length, TRUCK.height), z: 1 })
      return out
    }
  }
}

/**
 * What the hint hand points at for `hit` when its target's own rect is not it, or null. A
 * plot's target on the street is mostly sky, so the hand points at what shows on it: an
 * empty plot's sign (its houseRect), else its rooms (at Good night, the lit part): their
 * bounding box, or the room nearest that box's middle when the middle falls between rooms.
 */
export function hintAim(s: State, hit: Hit): Rect | null {
  if (hit.kind !== 'plot') return null
  const p = s.keep.plots[hit.plot]!
  if (p.rooms.length === 0) return houseRect(hit.plot, p)
  const rooms = p.rooms.map((r) => roomRect(hit.plot, r))
  const x0 = Math.min(...rooms.map((r) => r.x))
  const y0 = Math.min(...rooms.map((r) => r.y))
  const box = rect(x0, y0, Math.max(...rooms.map((r) => r.x + r.w)) - x0, Math.max(...rooms.map((r) => r.y + r.h)) - y0)
  const c = centre(box)
  if (rooms.some((r) => inside(r, c.x, c.y))) return box
  const off = (r: Rect) => Math.hypot(Math.max(r.x - c.x, 0, c.x - r.x - r.w), Math.max(r.y - c.y, 0, c.y - r.y - r.h))
  return rooms.reduce((a, b) => (off(b) < off(a) ? b : a))
}

/**
 * What the CSS-pixel point (sx, sy) on the view lands on: the highest target whose rect,
 * grown to MIN_TARGET on screen, holds the point (among equals, the nearest centre: two
 * ghost spots of a wide room overlap); else the nearest target within NEAR pixels; else the
 * ground on the street, or nothing.
 */
export function hitTest(s: State, view: View, sx: number, sy: number): Hit {
  const [wx, wy] = toWorld(view, sx, sy)
  const minW = MIN_TARGET / view.ppm
  let best: Target | null = null
  let bestD = Infinity
  for (const t of targets(s)) {
    const gx = Math.max(0, (minW - t.rect.w) / 2)
    const gy = Math.max(0, (minW - t.rect.h) / 2)
    const grown = rect(t.rect.x - gx, t.rect.y - gy, t.rect.w + 2 * gx, t.rect.h + 2 * gy)
    if (!inside(grown, wx, wy)) continue
    const c = centre(t.rect)
    const d = Math.hypot(c.x - wx, c.y - wy)
    if (!best || t.z > best.z || (t.z === best.z && d < bestD)) {
      best = t
      bestD = d
    }
  }
  if (best) return best.hit
  const near = NEAR / view.ppm
  for (const t of targets(s)) {
    const dx = Math.max(t.rect.x - wx, 0, wx - (t.rect.x + t.rect.w))
    const dy = Math.max(t.rect.y - wy, 0, wy - (t.rect.y + t.rect.h))
    const d = Math.hypot(dx, dy)
    if (d <= near && d < bestD) {
      best = t
      bestD = d
    }
  }
  if (best) return best.hit
  return s.shot.kind === 'street' ? { kind: 'ground', x: wx } : { kind: 'none' }
}
