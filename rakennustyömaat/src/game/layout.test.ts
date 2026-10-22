import { describe, expect, it } from 'vitest'

import { simTime, toScreen, viewAt } from './camera'
import { HOME_COLS, HOUSE_GRID, SHAPE_SIZE } from './catalog'
import { demoKeep, demoShot } from './fixtures'
import { ITEMS, defaultItems, themeItems } from './items'
import {
  BACK_WAIT,
  CELL,
  DEPTH,
  FLOOR_BAND,
  MIRROR_X,
  PLOT_W,
  PRESENT_FOR,
  SLAB,
  SLOT_BOX,
  TOP,
  POST,
  TRUCK,
  TRUCK_HOME_X,
  TRUCK_TIP_X,
  canPlace,
  centre,
  doorRects,
  coverOf,
  gridLeft,
  hintAim,
  hitTest,
  houseRect,
  inside,
  interiorRect,
  plotLeft,
  rect,
  roofRect,
  roomRect,
  roomsOnTop,
  slotRect,
  slotsOf,
  stackRect,
  streetEnd,
  targets,
  truckOnStreet,
  validSpots,
  visitPoint,
  VISITOR,
  type Rect,
} from './layout'
import { DRIVE_IN, SHAPES, STEP, THEMES, TIP, ticks, type Hit, type Keep, type Plot, type PlacedRoom, type Shot, type State } from './model'
import { freshKeep } from './progress'
import { START_X, act, createState, step } from './rules'

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const room = (shape: PlacedRoom['shape'], col: number, row: number, id = 1): PlacedRoom => ({ id, shape, col, row, material: 'planks', theme: null, items: [], wall: 0, floor: 0 })

describe('slots', () => {
  it('give small 4, wide 8, tall 5 and big 10 slots', () => {
    expect(SHAPES.map((s) => slotsOf(s).length)).toEqual([4, 8, 5, 10])
  })

  it('never overlap one another and stay inside the room, clear of the floor band', () => {
    for (const shape of SHAPES) {
      const r = room(shape, 0, 0)
      const inner = interiorRect(0, r)
      const boxes = slotsOf(shape).map((_, i) => slotRect(0, r, i))
      boxes.forEach((a, i) => {
        expect(a.x, `${shape} slot ${i} left`).toBeGreaterThanOrEqual(inner.x - 1e-9)
        expect(a.x + a.w, `${shape} slot ${i} right`).toBeLessThanOrEqual(inner.x + inner.w + 1e-9)
        expect(a.y, `${shape} slot ${i} top`).toBeGreaterThanOrEqual(inner.y - 1e-9)
        expect(a.y + a.h, `${shape} slot ${i} bottom`).toBeLessThanOrEqual(inner.y + inner.h - FLOOR_BAND / 2 + 1e-9)
        boxes.forEach((b, j) => {
          if (j > i) expect(overlap(a, b), `${shape} slots ${i} and ${j}`).toBe(false)
        })
      })
    }
  })

  it('size the frame so a cell is CELL square with its posts, slab and top inside', () => {
    const r = roomRect(0, room('small', 0, 0))
    expect([r.w, r.h]).toEqual([CELL, CELL])
    const inner = interiorRect(0, room('small', 0, 0))
    expect(inner.w).toBeCloseTo(CELL - 2 * POST)
    expect(inner.h).toBeCloseTo(CELL - TOP - SLAB)
  })
})

describe('placing rooms', () => {
  const tall: Plot = { kind: 'tall', roof: 'pointed', rooms: [] }
  const row: Plot = { kind: 'row', roof: 'pointed', rooms: [] }

  it('starts on the ground and stacks only on rooms', () => {
    expect(validSpots(tall, 'small')).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ])
    const one: Plot = { ...tall, rooms: [room('wide', 0, 0)] }
    expect(canPlace(one, 'small', 0, 1)).toBe(true)
    expect(canPlace(one, 'small', 2, 1)).toBe(false)
    expect(canPlace(one, 'wide', 1, 1)).toBe(false)
    expect(canPlace(one, 'small', 1, 0)).toBe(false)
  })

  it('keeps the grid and, in a row house, each home', () => {
    expect(canPlace(tall, 'wide', 2, 0)).toBe(false)
    expect(canPlace(tall, 'big', 1, 0)).toBe(true)
    expect(canPlace(row, 'wide', 1, 0)).toBe(false)
    expect(canPlace(row, 'wide', 2, 0)).toBe(true)
    expect(canPlace({ ...row, rooms: [room('wide', 0, 0)] }, 'tall', 0, 1)).toBe(false)
    expect(canPlace({ kind: null, roof: 'pointed', rooms: [] }, 'small', 0, 0)).toBe(false)
  })

  it('knows which rooms rest on a room', () => {
    const lower = room('wide', 0, 0, 1)
    const upper = room('small', 1, 1, 2)
    const p: Plot = { kind: 'tall', roof: 'pointed', rooms: [lower, upper] }
    expect(roomsOnTop(p, lower)).toEqual([upper])
    expect(roomsOnTop(p, upper)).toEqual([])
  })
})

describe('items', () => {
  it('give every theme one ceiling, one wall and three floor items, one of them a friend', () => {
    for (const theme of THEMES) {
      const ids = themeItems(theme)
      expect(ids.map((id) => ITEMS[id].slot), theme).toEqual(['ceiling', 'wall', 'floor', 'floor', 'floor'])
      expect(ids.filter((id) => ITEMS[id].friend).length, theme).toBe(1)
    }
  })

  it('fill a fresh room by slot kind, a small room getting the hero and the friend', () => {
    for (const theme of THEMES) {
      for (const shape of SHAPES) {
        const items = defaultItems(theme, shape)
        const slots = slotsOf(shape)
        expect(items.length).toBe(slots.length)
        items.forEach((id, i) => {
          if (id !== null) expect(ITEMS[id].slot).toBe(slots[i]!.kind)
        })
        expect(new Set(items.filter((id) => id !== null)).size).toBe(items.filter((id) => id !== null).length)
      }
      const small = defaultItems(theme, 'small')
      const [, , hero, friend] = themeItems(theme)
      expect(small.slice(2)).toEqual([hero, friend])
    }
  })

  it('fit their slot boxes into a cell', () => {
    for (const kind of ['ceiling', 'wall', 'floor'] as const) {
      const b = SLOT_BOX[kind]
      expect(b.x1 - b.x0).toBeLessThan(CELL / 2)
    }
    expect(SHAPE_SIZE.big).toEqual({ w: 2, h: 2 })
  })
})

// ---------------------------------------------------------------------------------------
// Taps through the hit test, on the view the camera draws

/** A state on these plots, showing `shot` (the camera settled there). */
function showing(plots: Plot[], shot: Shot): State {
  const keep: Keep = { ...freshKeep(), plots }
  keep.nextId = 1 + Math.max(0, ...plots.flatMap((p) => p.rooms.map((r) => r.id)))
  const s = createState(keep, 1, false)
  s.shot = shot
  s.shotFrom = shot
  return s
}
const W = 1180
const H = 820
/** What a tap at world point (x, y) lands on, on the view drawn now. */
function tapAt(s: State, x: number, y: number): Hit {
  const v = viewAt(s, simTime(s), W, H, 1)
  const [sx, sy] = toScreen(v, x, y)
  return hitTest(s, v, sx, sy)
}
const themed = (id: number, shape: PlacedRoom['shape'], col: number, row: number): PlacedRoom => ({ ...room(shape, col, row, id), theme: 'play', items: defaultItems('play', shape) })

describe('the street', () => {
  it('shows the truck where it is drawn: nothing answers while it drives in, then its target follows it from the yard to the garage', () => {
    const s = showing([{ kind: null, roof: 'pointed', rooms: [] }], { kind: 'street', x: 24 })
    s.tick = 1000
    s.tipAt = 1000 + ticks(DRIVE_IN / 2)
    s.builder.at = { kind: 'truck' }
    expect(targets(s)).toEqual([])
    expect(truckOnStreet(s, s.tick * STEP)).toMatchObject({ driver: true, moving: true, tip: 0 })
    // Tipping in the yard, in front of the mixer: a tap on the truck is the truck's.
    s.tipAt = 1000 - ticks(TIP / 2)
    expect(truckOnStreet(s, s.tick * STEP)).toMatchObject({ x: TRUCK_TIP_X, moving: false })
    expect(truckOnStreet(s, s.tick * STEP).tip).toBeGreaterThan(0.9)
    expect(tapAt(s, TRUCK_TIP_X, -TRUCK.height / 2)).toEqual({ kind: 'truck' })
    // Backing home past the machines.
    s.tipAt = 1000 - ticks(TIP + BACK_WAIT + 1)
    const back = truckOnStreet(s, s.tick * STEP)
    expect(back.moving).toBe(true)
    expect(back.x).toBeGreaterThan(TRUCK_HOME_X)
    expect(back.x).toBeLessThan(TRUCK_TIP_X)
    expect(tapAt(s, back.x, -TRUCK.height / 2)).toEqual({ kind: 'truck' })
    // Parked.
    s.tipAt = -1
    expect(truckOnStreet(s, s.tick * STEP)).toEqual({ x: TRUCK_HOME_X, tip: 0, driver: true, moving: false })
    s.shot = { kind: 'street', x: START_X }
    expect(tapAt(s, TRUCK_HOME_X, -TRUCK.height / 2)).toEqual({ kind: 'truck' })
  })

  it('opens the mirror on a tap anywhere on it, also while the present is open', () => {
    const s = showing([{ kind: null, roof: 'pointed', rooms: [] }], { kind: 'street', x: START_X })
    s.presentAt = 0
    s.presentGot = 'gems'
    expect(targets(s).some((t) => t.hit.kind === 'present')).toBe(true)
    for (let x = MIRROR_X - 0.55; x <= MIRROR_X + 0.55; x += 0.1) for (let y = -1.95; y <= 0; y += 0.1) expect(tapAt(s, x, y), `${x}, ${y}`).toEqual({ kind: 'mirror' })
    s.tick = ticks(PRESENT_FOR)
    expect(targets(s).some((t) => t.hit.kind === 'present')).toBe(false)
  })
})

describe('the camera', () => {
  it('never shows past the garage wall or the street end, at any screen width, wherever the rules put the street shot', () => {
    for (const [w, h] of [[1920, 1000], [2560, 1080], [1180, 820], [820, 1180]] as const) {
      for (const plots of [1, 4]) {
        const s = showing(Array.from({ length: plots }, (): Plot => ({ kind: null, roof: 'pointed', rooms: [] })), { kind: 'street', x: START_X })
        for (const x of [0, START_X, 30, streetEnd(plots)]) {
          s.shot = { kind: 'street', x }
          const v = viewAt(s, 0, w, h, 1)
          expect(v.x0, `${w}x${h}, ${plots} plots, at ${x}`).toBeGreaterThanOrEqual(-1e-9)
          expect(v.x0 + w / v.ppm, `${w}x${h}, ${plots} plots, at ${x}`).toBeLessThanOrEqual(Math.max(streetEnd(plots), w / v.ppm) + 1e-9)
        }
      }
    }
  })

  it('opens the street on the garage door, the truck and the mirror on a screen held upright, and from the garage wall on a screen held sideways', () => {
    const s = showing([{ kind: null, roof: 'pointed', rooms: [] }], { kind: 'street', x: START_X })
    const span = (w: number, h: number) => {
      const v = viewAt(s, 0, w, h, 1)
      return [v.x0, v.x0 + w / v.ppm] as const
    }
    // The big door of draw/street.ts's garage runs from 3.35 m to 9 m.
    for (const [w, h] of [[820, 1180], [768, 1024]] as const) {
      const [x0, x1] = span(w, h)
      expect(x0, `${w}x${h}`).toBeLessThanOrEqual(3.35 - 0.5)
      expect(x1, `${w}x${h}`).toBeGreaterThanOrEqual(Math.max(9, TRUCK_HOME_X + TRUCK.length / 2, MIRROR_X + 0.6) + 0.5)
    }
    // Sideways the street's left end holds the shot: the whole garage, and the first machine's station.
    for (const [w, h] of [[1180, 820], [1024, 768], [1366, 1024], [1920, 1000]] as const) {
      const [x0, x1] = span(w, h)
      expect(x0, `${w}x${h}`).toBe(0)
      expect(x1, `${w}x${h}`).toBeGreaterThanOrEqual(stackRect('sawmill').x + stackRect('sawmill').w)
    }
  })

  it('shows the whole lit house at Good night, a tall one on a screen held upright too', () => {
    // The street demo: a tall house, a row house and another tall house. Upright, a row house is wider than the screen.
    for (const [w, h, plots] of [[820, 1180, [0, 2]], [1180, 820, [0, 1, 2]], [1024, 768, [0, 1, 2]]] as const) {
      for (const at of plots) {
        const s = createState(demoKeep('street'), 1, false)
        act(s, { kind: 'pan', x: plotLeft(at) + PLOT_W / 2 })
        act(s, { kind: 'goodnight' })
        step(s)
        expect(s.hint).toEqual({ kind: 'plot', plot: at })
        const v = viewAt(s, Infinity, w, h, 1)
        const house = houseRect(at, s.keep.plots[at]!)
        expect(house.x, `${w}x${h} plot ${at}`).toBeGreaterThanOrEqual(v.x0)
        expect(house.x + house.w, `${w}x${h} plot ${at}`).toBeLessThanOrEqual(v.x0 + w / v.ppm)
      }
    }
  })

  it('opens ?demo=themes with both houses whole on a screen 1024 wide and up', () => {
    const keep = demoKeep('themes')
    const s = showing(keep.plots, demoShot('themes', keep))
    const tall = houseRect(0, keep.plots[0]!)
    const row = keep.plots[1]!.rooms.map((r) => roomRect(1, r))
    const right = Math.max(...row.map((r) => r.x + r.w), ...doorRects(1, keep.plots[1]!).filter((d) => d.x < Math.max(...row.map((r) => r.x + r.w))).map((d) => d.x + d.w)) + DEPTH
    for (const [w, h] of [[1024, 768], [1180, 820], [1280, 800], [1366, 1024], [1920, 1000]] as const) {
      const v = viewAt(s, 0, w, h, 1)
      expect(v.x0, `${w}x${h}`).toBeLessThanOrEqual(tall.x)
      expect(v.x0 + w / v.ppm, `${w}x${h}`).toBeGreaterThanOrEqual(right)
    }
  })
})

describe('the hint hand', () => {
  it("points at what shows on a plot: an empty one's sign, else a room of its house (at Good night, a lit one)", () => {
    // draw/street.ts's lot sign: a board PLOT_W / 2 either side 1.35 m, from its hat down to its posts' feet.
    const sign = (plot: number) => rect(plotLeft(plot) + PLOT_W / 2 - 1.35, -3.7, 2.7, 3.7)
    const aimAt = (s: State, plot: number) => centre(hintAim(s, { kind: 'plot', plot })!)
    const onRoom = (s: State, plot: number) => {
      const c = aimAt(s, plot)
      return s.keep.plots[plot]!.rooms.some((r) => inside(roomRect(plot, r), c.x, c.y))
    }
    const houses: Plot[] = [
      { kind: 'tall', roof: 'pointed', rooms: [themed(1, 'small', 0, 0)] },
      // A column of rooms at the left and one small room at the right: the middle of them all is between them.
      { kind: 'tall', roof: 'pointed', rooms: [themed(2, 'tall', 0, 0), themed(3, 'tall', 0, 2), themed(4, 'small', 0, 4), themed(5, 'small', 2, 0)] },
      { kind: 'row', roof: 'pointed', rooms: [themed(6, 'small', 0, 0), themed(7, 'small', 5, 0)] },
      { kind: 'row', roof: 'pointed', rooms: [themed(8, 'big', 2, 0)] },
      { kind: null, roof: 'pointed', rooms: [] },
    ]
    const s = showing(houses, { kind: 'street', x: 60 })
    const c = aimAt(s, 4)
    expect(inside(sign(4), c.x, c.y)).toBe(true)
    for (let plot = 0; plot < 4; plot++) expect(onRoom(s, plot), `plot ${plot}`).toBe(true)
    // At Good night the hint is the lit house nearest the camera, and the hand points at one of its rooms.
    s.night = { at: 0, dark: [-1, -1, -1, -1, -1], doneAt: -1 }
    for (const plot of [0, 1, 2, 3]) {
      s.shot = { kind: 'street', x: plotLeft(plot) + PLOT_W / 2 }
      step(s)
      expect(s.hint).toEqual({ kind: 'plot', plot })
      expect(onRoom(s, plot), `plot ${plot} at night`).toBe(true)
    }
    // Nothing else has an aim of its own.
    expect(hintAim(s, { kind: 'truck' })).toBeNull()
    expect(hintAim(s, { kind: 'machine', m: 'oven' })).toBeNull()
  })
})

describe('the build view', () => {
  it('offers an empty plot whose question was closed its sign, to ask again', () => {
    const s = showing([{ kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    expect(tapAt(s, centre(targets(s)[0]!.rect).x, -2)).toEqual({ kind: 'plot', plot: 0 })
  })

  it('rings the doorbell from each front door where the house draws it, and only when someone lives there', () => {
    const tall: Plot = { kind: 'tall', roof: 'pointed', rooms: [themed(1, 'small', 0, 0)] }
    const s = showing([tall, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    const [lobby] = doorRects(0, tall)
    expect(lobby!.x).toBeCloseTo(gridLeft(0) + HOUSE_GRID.tall.cols * CELL + 1.2)
    expect(tapAt(s, centre(lobby!).x, centre(lobby!).y)).toEqual({ kind: 'door', plot: 0 })
    const row: Plot = { kind: 'row', roof: 'pointed', rooms: [themed(1, 'wide', 0, 0), themed(2, 'small', 2, 0), themed(3, 'small', 4, 0)] }
    const r = showing([row, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    const doors = doorRects(0, row)
    expect(doors.map((d) => centre(d).x)).toEqual([0, 1, 2].map((home) => gridLeft(0) + home * HOME_COLS * CELL))
    // Each door on its own home's side: a ghost of the home before takes the other half while rooms are placed.
    for (const d of doors) expect(tapAt(r, centre(d).x + 0.15, centre(d).y)).toEqual({ kind: 'door', plot: 0 })
    // The room beside a door still answers a little way off it.
    expect(tapAt(r, gridLeft(0) + HOME_COLS * CELL + 0.8, -1)).toEqual({ kind: 'room', plot: 0, room: 2 })
    tall.rooms = []
    expect(targets(s).some((t) => t.hit.kind === 'door')).toBe(false)
  })

  it("gives a ghost beside a row house's door the tap while placing; the tall house's lobby, outside the grid, is a door over everything", () => {
    // A row house with one small room in the first home's right column, tapped 0.6 m over the ground: right of the home's edge,
    // over the second home's door, the ghost of column 2 takes the taps.
    const row: Plot = { kind: 'row', roof: 'pointed', rooms: [themed(1, 'small', 1, 0)] }
    const s = showing([row, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    const [first, door] = doorRects(0, row)
    const edge = gridLeft(0) + HOME_COLS * CELL
    expect(centre(door!).x).toBeCloseTo(edge)
    for (let x = edge + 0.01; x <= door!.x + door!.w + 0.3; x += 0.05) expect(tapAt(s, x, -0.6), `${x}`).toEqual({ kind: 'spot', plot: 0, col: 2, row: 0 })
    // On the room's side the door is nearer than the room's middle: it still rings.
    expect(tapAt(s, edge - 0.2, -0.6)).toEqual({ kind: 'door', plot: 0 })
    // The first home's door: the ghost of column 0 on the grid, the door left of it.
    expect(tapAt(s, gridLeft(0) + 0.1, -0.6)).toEqual({ kind: 'spot', plot: 0, col: 0, row: 0 })
    expect(tapAt(s, first!.x + 0.05, -0.6)).toEqual({ kind: 'door', plot: 0 })
    // With the hand on, no ghost shows: the doors ring all the way across.
    s.hand = true
    for (let x = door!.x; x <= door!.x + door!.w; x += 0.05) expect(tapAt(s, x, -0.6)).toEqual({ kind: 'door', plot: 0 })
    const tall: Plot = { kind: 'tall', roof: 'pointed', rooms: [themed(1, 'small', 2, 0)] }
    const t = showing([tall, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    const [lobby] = doorRects(0, tall)
    expect(targets(t).find((x) => x.hit.kind === 'door')!.z).toBe(3)
    for (let x = lobby!.x; x <= lobby!.x + lobby!.w; x += 0.05) expect(tapAt(t, x, -0.6)).toEqual({ kind: 'door', plot: 0 })
  })

  it('turns the roof on a tap where no ghost covers it', () => {
    const row: Plot = { kind: 'row', roof: 'pointed', rooms: [themed(1, 'small', 0, 0), themed(2, 'small', 0, 1)] }
    const s = showing([row, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'plot', plot: 0 })
    const roof = roofRect(0, row, 0)!
    expect(tapAt(s, centre(roof).x, centre(roof).y)).toEqual({ kind: 'roof', plot: 0 })
  })
})

describe('the visiting builder', () => {
  it('stands at the first empty floor slot, else in the middle', () => {
    const r = themed(1, 'small', 0, 0)
    const floors = slotsOf('small').flatMap((sl, i) => (sl.kind === 'floor' ? [i] : []))
    expect(visitPoint(0, r).x).toBeCloseTo(roomRect(0, r).x + CELL / 2)
    r.items[floors[1]!] = null
    expect(visitPoint(0, r).x).toBeCloseTo(roomRect(0, r).x + slotsOf('small')[floors[1]!]!.x)
  })

  it('cover the floor slot they stand at and no other, and from the middle of any room a sliver of the two beside it', () => {
    for (const shape of SHAPES) {
      const r = { ...themed(1, shape, 0, 0), items: slotsOf(shape).map(() => null) }
      const box = roomRect(0, r)
      const floors = slotsOf(shape).flatMap((sl, i) => (sl.kind === 'floor' ? [i] : []))
      for (const at of floors) {
        const covered = slotsOf(shape).map((_, slot) => coverOf(0, r, slot, box.x + slotsOf(shape)[at]!.x))
        expect(covered.map((c, slot) => (c > 0 ? slot : -1)).filter((slot) => slot >= 0), `${shape} slot ${at}`).toEqual([at])
        expect(covered[at], `${shape} slot ${at}`).toBeCloseTo(VISITOR.w)
      }
      expect(coverOf(0, r, floors[0]!, visitPoint(0, r).x), shape).toBeCloseTo(VISITOR.w)
      const middle = floors.map((slot) => coverOf(0, r, slot, centre(box).x))
      expect(middle.filter((c) => c > 0).length, shape).toBe(2)
      expect(Math.max(...middle), shape).toBeLessThanOrEqual(0.25)
    }
  })

  it("never takes a tap meant for a floor item they stand beside: their target is under the items'", () => {
    for (const shape of SHAPES) {
      const r = themed(1, shape, 0, 0)
      r.items = slotsOf(shape).map((sl, i) => r.items[i] ?? (sl.kind === 'floor' ? 'rockingHorse' : null))
      const s = showing([{ kind: 'tall', roof: 'pointed', rooms: [r] }, { kind: null, roof: 'pointed', rooms: [] }], { kind: 'room', plot: 0, room: 1 })
      const v = visitPoint(0, r)
      s.builder.at = { kind: 'room', plot: 0, room: 1, x: v.x }
      slotsOf(shape).forEach((sl, slot) => {
        if (sl.kind !== 'floor') return
        const box = slotRect(0, r, slot)
        // 0.15 m inside the slot's edge nearest the builder.
        const x = centre(box).x < v.x ? box.x + box.w - 0.15 : box.x + 0.15
        expect(tapAt(s, x, box.y + box.h / 2), `${shape} slot ${slot}`).toEqual({ kind: 'item', plot: 0, room: 1, slot })
      })
      expect(tapAt(s, v.x, v.y - 0.1)).toEqual({ kind: 'builder' })
    }
  })
})
