/**
 * The renderer's own rules: every demo in every shot, the moments that move (the crane, the
 * hand tool, a trip home, a crate, a new plot, a party, Good night, the hint), the road with
 * the truck all along it, the wipe between the worlds, every event's particles in its own
 * world, the bakes (painted once, again only when the house changes, never for lights or a
 * party, all under the pixel budget and each under the size a canvas draws fast), the truck,
 * the present and the builder where the rules and layout.ts put them, a frame that does not
 * move drawing nothing, a sane number of paths a frame, the sprite sheets, and the motion
 * vocabulary's calm. All on the fake context; the screenshots judge the looks.
 */
import { describe, expect, it, vi } from 'vitest'

import { ROAD_HEIGHT, buildRect, roadZoom, viewAt, type View } from '../game/camera'
import { DEMOS, demoKeep, demoShot, type Demo } from '../game/fixtures'
import { ITEMS, ITEM_IDS, type Idle, type TapMotion } from '../game/items'
import { MIRROR_BUILDER_X, PRESENT_FOR, PRESENT_POP, PRESENT_X, TRUCK, TRUCK_TIP_X, centre, doorRects, houseRect, plotLeft, roomRect, roomsOnTop, slotsOf, streetEnd, targets, truckOnStreet, visitPoint } from '../game/layout'
import { DASH, DRIVE_IN, FLY_FOR, HAMMER, LOWER, MACHINES, PARTY_EVERY, ROAD_KINDS, SHOT_TWEEN, STEP, TIP, ticks, type Flight, type PlacedRoom, type SimEvent, type State } from '../game/model'
import { freshKeep } from '../game/progress'
import { makeRoad, startRoad, stopX, surfaceAt } from '../game/road'
import { DUSK, createState } from '../game/rules'
import { BUDGET, Cache } from './cache'
import { Effects } from './effects'
import { clipped, fakeContext } from './fakeContext'
import { Renderer } from './frame'
import { lw, pen } from './look'
import { applyIdle, applyTap } from './motion'
import { THEME_ART } from './rooms/art'
import { SHEETS, SHEET_PAD } from './Sheet'

/** What the art the renderer calls was handed, recorded by the wrappers below: the context's transform at the call (device pixels), the call's own arguments, and for the truck and the present which of them came first. */
const seen = vi.hoisted(() => ({
  drawn: 0,
  truck: [] as { e: number; f: number; driver: boolean; n: number }[],
  present: [] as { a: number; e: number; f: number; open: number; n: number }[],
  builder: [] as { e: number; f: number; look: unknown; pose: string }[],
  roofs: [] as (readonly [boolean, boolean])[],
  doors: [] as (readonly number[])[],
  grounds: [] as { kind: string | null; mailboxes: readonly number[] }[],
  surprises: [] as { what: string; u: number }[],
  cranes: [] as number[],
  blueprints: 0,
  idles: 0,
}))
vi.mock('./truck', async (original) => {
  const m = await original<typeof import('./truck')>()
  return { ...m, drawTruck: (ctx: CanvasRenderingContext2D, p: Parameters<typeof m.drawTruck>[1]) => (seen.truck.push({ ...ctx.getTransform(), driver: p.driver, n: seen.drawn++ }), m.drawTruck(ctx, p)) }
})
vi.mock('./land', async (original) => {
  const m = await original<typeof import('./land')>()
  return {
    ...m,
    drawPresent: (ctx: CanvasRenderingContext2D, t: number, open: number) => (seen.present.push({ ...ctx.getTransform(), open, n: seen.drawn++ }), m.drawPresent(ctx, t, open)),
    drawSurprise: (...a: Parameters<typeof m.drawSurprise>) => (seen.surprises.push({ what: a[1], u: a[2] }), m.drawSurprise(...a)),
  }
})
vi.mock('./builder', async (original) => {
  const m = await original<typeof import('./builder')>()
  return { ...m, drawBuilder: (ctx: CanvasRenderingContext2D, ...a: Parameters<typeof m.drawBuilder> extends [unknown, ...infer R] ? R : never) => (seen.builder.push({ ...ctx.getTransform(), look: a[0], pose: a[1] }), m.drawBuilder(ctx, ...a)) }
})
vi.mock('./house', async (original) => {
  const m = await original<typeof import('./house')>()
  return {
    ...m,
    drawRoof: (...a: Parameters<typeof m.drawRoof>) => (seen.roofs.push([a[4], a[5]]), m.drawRoof(...a)),
    drawBlueprint: (...a: Parameters<typeof m.drawBlueprint>) => (seen.blueprints++, m.drawBlueprint(...a)),
    drawDoors: (...a: Parameters<typeof m.drawDoors>) => (seen.doors.push(a[3] ?? []), m.drawDoors(...a)),
  }
})
vi.mock('./street', async (original) => {
  const m = await original<typeof import('./street')>()
  return {
    ...m,
    drawPlotGround: (...a: Parameters<typeof m.drawPlotGround>) => (seen.grounds.push({ kind: a[1], mailboxes: a[4] ?? [] }), m.drawPlotGround(...a)),
    drawCrane: (...a: Parameters<typeof m.drawCrane>) => (seen.cranes.push(a[1]), m.drawCrane(...a)),
  }
})
vi.mock('./motion', async (original) => {
  const m = await original<typeof import('./motion')>()
  return { ...m, applyIdle: (...a: Parameters<typeof m.applyIdle>) => (seen.idles++, m.applyIdle(...a)) }
})

/** A context that also notes, for each call of `names`, its arguments, the transform and the fill colour at the call. */
function noting(ctx: CanvasRenderingContext2D, names: readonly string[]) {
  const calls: { name: string; args: number[]; a: number; e: number; fill: unknown }[] = []
  const proxy = new Proxy(ctx, {
    get(target, key: string) {
      const v = Reflect.get(target, key) as unknown
      if (!names.includes(key)) return v
      return (...args: number[]) => {
        const m = target.getTransform()
        calls.push({ name: key, args, a: m.a, e: m.e, fill: target.fillStyle })
        return (v as (...a: number[]) => unknown)(...args)
      }
    },
  })
  return { ctx: proxy, calls }
}

/** Offscreen canvases for the bakes, each with its own fake context (noting `names` when given). */
function canvases(names: readonly string[] = []) {
  const made: { width: number; height: number; counts: Record<string, number> }[] = []
  const noted: ReturnType<typeof noting>['calls'][] = []
  const make = () => {
    const f = fakeContext()
    const n = noting(f.ctx, names)
    noted.push(n.calls)
    const c = { width: 0, height: 0, counts: f.counts, getContext: () => n.ctx }
    made.push(c)
    return c as unknown as HTMLCanvasElement
  }
  return { make, made, noted, pixels: () => made.reduce((n, c) => n + c.width * c.height, 0), paints: () => made.reduce((n, c) => n + (c.counts.clearRect ?? 0), 0) }
}

/** A tablet, a phone (whose build view is small enough to stay baked) and a portrait tablet, in CSS pixels and pixel ratio. */
const SIZES = [
  [1180, 820, 1.82],
  [844, 390, 2],
  [820, 1180, 1.82],
] as const
type Size = readonly [number, number, number]

/** A renderer on a fake context at a size (its main context noting `names`), and a frame drawer that checks the context comes back balanced and returns the view it drew. */
function stage(size: Size, debug: boolean, names: readonly string[] = []) {
  const [w, h, dpr] = size
  const main = fakeContext()
  const noted = noting(main.ctx, names)
  const pool = canvases(names)
  const r = new Renderer(noted.ctx, pool.make, debug)
  r.resize(Math.round(w * dpr), Math.round(h * dpr), dpr)
  const draw = (s: State, events: readonly SimEvent[] = []): View => {
    const t = s.tick * STEP
    const view = viewAt(s, t, w, h, dpr)
    main.check(`${s.shot.kind} at tick ${s.tick}`, () => r.draw(s, t, view, events, STEP), 'allowed')
    return view
  }
  return { r, main, pool, draw, calls: noted.calls }
}

/** The world point at a recorded transform's origin, for a frame drawn through `view`. */
const world = (m: { e: number; f: number }, view: View) => ({ x: m.e / (view.ppm * view.dpr) + view.x0, y: m.f / (view.ppm * view.dpr) + view.y0 })

/** A demo's state on its own shot, settled (no tween). */
function demoState(demo: Demo): State {
  const keep = demoKeep(demo)
  const s = createState(keep, 1, false)
  s.shot = s.shotFrom = demoShot(demo, keep)
  s.tick = 600
  return s
}

/** Every shot of a state's street world: the mirror, the street along its length, each plot, each room. */
function streetShots(s: State): State['shot'][] {
  const shots: State['shot'][] = [{ kind: 'mirror' }]
  for (let x = 0; x <= streetEnd(s.keep.plots.length); x += 17) shots.push({ kind: 'street', x })
  s.keep.plots.forEach((p, plot) => {
    shots.push({ kind: 'plot', plot })
    for (const room of p.rooms) shots.push({ kind: 'room', plot, room: room.id })
  })
  return shots
}

/** The street demo with everything that moves going at once at tick `now`. */
function busy(now: number): State {
  const s = demoState('street')
  s.tick = now
  const keep = s.keep
  const tall = keep.plots[0]!
  const top = tall.rooms.find((r) => roomsOnTop(tall, r).length === 0)!
  const lowered = keep.plots[2]!.rooms[1]!
  s.craneRoom = lowered.id
  s.craneAt = now - ticks(LOWER * 0.6)
  s.lifted = top.id
  s.liftedAt = now - 20
  s.tipAt = now - 10
  s.presentAt = now - 30
  s.presentGot = 'theme:bath'
  keep.machines.glassworks = 'crate'
  s.crateAt.glassworks = now - 20
  s.plotAt[3] = now - 40
  s.partyAt[1] = now - 30
  s.roofAt[0] = now - 10
  const row = keep.plots[1]!.rooms[0]!
  s.playAt[`${row.id}`] = now - 5
  row.items.forEach((_, slot) => (s.playAt[`${row.id}:${slot}`] = now - 5 - slot * 10))
  s.machines.sawmill = { ...s.machines.sawmill, on: true, batchAt: now - 20, batchFor: ticks(0.8), pushAt: now - 5, coughAt: now - 50 }
  s.machines.oven = { ...s.machines.oven, hits: 2, hitAt: now - 3, builtAt: now - 100 }
  s.hint = { kind: 'machine', m: 'sawmill' }
  s.handAt = now - 30
  // Dashing from the street up to a scaffold, as the rules start a dash: its pose waits for the arrival.
  const x = plotLeft(2) + 3
  s.builder = { at: { kind: 'scaffold', plot: 2, x, y: -2.4 }, fromX: x - 12, movedAt: now - 10, pose: 'hammer', poseAt: now - 10 + ticks(DASH), facing: 1 }
  const flight = (f: Omit<Flight, 'at' | 'dur'>, at: number): Flight => ({ ...f, at, dur: ticks(0.7) })
  s.flights = [
    flight({ good: 'log', n: 2, from: { kind: 'bed' }, to: { kind: 'heap', good: 'log' } }, now - 10),
    flight({ good: 'clay', n: 1, from: { kind: 'bed' }, to: { kind: 'heap', good: 'clay' } }, now + 20),
    flight({ good: 'log', n: 1, from: { kind: 'heap', good: 'log' }, to: { kind: 'stack', good: 'planks' } }, now - 5),
    flight({ good: 'bricks', n: 4, from: { kind: 'stack', good: 'bricks' }, to: { kind: 'room', plot: 2, room: lowered.id } }, now - 12),
    flight({ good: 'gem', n: 1, from: { kind: 'present' }, to: { kind: 'heap', good: 'gem' } }, now - 8),
  ]
  return s
}

/** The road's events that the renderer places, at a point on the road. */
const roadEvents = (x: number, y: number): SimEvent[] => [
  { kind: 'pickup', good: 'log', x, y: y - 0.3 },
  ...(['hammer', 'pickaxe', 'drill', 'shovel', 'wrench', 'wand'] as const).map((tool): SimEvent => ({ kind: 'whack', tool, x, y: y - 0.6 })),
  { kind: 'crack', x, y: y - 0.6, gem: true },
  { kind: 'honk', x, y },
  { kind: 'answer', who: 'ducks', x, y },
  { kind: 'ramp', x, y },
  { kind: 'land', hard: true, x, y },
]

/** Every event, placed where it can happen in the street demo, the road's at x 40 on the road (in a street shot they come in the step a trip ends). */
function allEvents(s: State): SimEvent[] {
  const room = s.keep.plots[0]!.rooms[0]!
  const slot = room.items.findIndex((i) => i !== null)
  const item = room.items[slot]!
  const at = { plot: 0, room: room.id, slot }
  return [
    ...roadEvents(40, 0),
    { kind: 'unlock', what: 'gems' },
    { kind: 'present' },
    { kind: 'tip' },
    ...MACHINES.flatMap((m): SimEvent[] => [
      { kind: 'crate', m },
      { kind: 'crateHit', m },
      { kind: 'machineBuilt', m },
      { kind: 'batch', m },
      { kind: 'push', m },
      { kind: 'cough', m },
    ]),
    { kind: 'house', plot: 0 },
    { kind: 'build', plot: 0, room: room.id, material: 'planks' },
    { kind: 'landed', plot: 0, room: room.id },
    { kind: 'lift', plot: 0, room: room.id },
    { kind: 'takeBack', plot: 0, room: room.id },
    { kind: 'nope', good: 'glass' },
    { kind: 'theme', theme: 'play', plot: 0, room: room.id },
    { kind: 'itemIn', item, ...at },
    { kind: 'itemOut', item, ...at },
    { kind: 'play', item, ...at },
    { kind: 'paint' },
    { kind: 'roof', plot: 0 },
    { kind: 'doorbell', plot: 0 },
    { kind: 'visit', theme: 'play' },
    { kind: 'newPlot', plot: 3 },
    { kind: 'wear', part: 'hat' },
    { kind: 'dice' },
    { kind: 'zoom' },
    { kind: 'goodnight' },
    { kind: 'lightsOut', plot: 0 },
    { kind: 'sleep' },
    { kind: 'wake' },
    { kind: 'tap' },
    { kind: 'arrive' },
  ]
}

/** A road of `kind` for trip `trip` with the truck at x, stopped at whatever stands there. */
function onRoad(s: State, kind: (typeof ROAD_KINDS)[number], trip: number, at: number): State {
  const def = makeRoad(kind, trip, 1234 + trip)
  const road = startRoad(def)
  road.x = Math.min(at, def.length + 30)
  road.y = surfaceAt(def, road.x)
  road.v = 6
  road.roll = road.x
  s.road = road
  s.shot = s.shotFrom = { kind: 'road' }
  s.builder = { ...s.builder, at: { kind: 'truck' }, pose: 'drive', poseAt: 0 }
  return s
}

/** Home from a trip as the rules leave it: the street at the yard, the builder at the wheel, the truck driving in to tip at s.tipAt with the load in its bed and a present. */
function homecoming(s: State): State {
  s.road = null
  s.shot = { kind: 'street', x: 24 }
  s.shotFrom = { kind: 'road' }
  s.shotAt = s.tick
  s.builder = { ...s.builder, at: { kind: 'truck' }, pose: 'drive' }
  s.tipAt = s.tick + ticks(DRIVE_IN)
  s.presentAt = s.tipAt
  s.presentGot = 'theme:bath'
  s.flights = (['log', 'rock', 'gem'] as const).map((good, i) => ({ good, n: 1, from: { kind: 'bed' }, to: { kind: 'heap', good }, at: s.tipAt + ticks(TIP / 2) + i * 5, dur: ticks(FLY_FOR) }))
  return s
}

// Hundreds of frames through the checking proxy: up to most of a second of work a test, so more than vitest's 5 s default could pass when the machine is busy.
describe('the renderer', { timeout: 20_000 }, () => {
  it('draws every demo in every shot of the street, the sizes taking turns, with the debug overlay on', () => {
    // Each shot on one of the screens, the next shot on the next: the pixel budget test below draws every shot of four of the demos on every screen.
    SIZES.forEach((size, i) => {
      for (const demo of DEMOS) {
        const { draw } = stage(size, true)
        const s = demoState(demo)
        streetShots(s).forEach((shot, k) => {
          if (k % SIZES.length !== i) return
          s.shot = s.shotFrom = shot
          s.tick += 7
          draw(s)
        })
      }
    })
  })

  it("outlines on ?debug the rect the camera fits: on a phone on its side, the build view's floors shown", () => {
    const size = SIZES[1]
    const { draw, calls } = stage(size, true, ['strokeRect'])
    const s = demoState('road')
    s.shot = s.shotFrom = { kind: 'plot', plot: 0 }
    draw(s)
    const stroked = (r: { x: number; y: number; w: number; h: number }) => calls.some((c) => [r.x, r.y, r.w, r.h].every((v, i) => Math.abs(c.args[i]! - v) < 1e-9))
    const shown = buildRect(s, 0, size[0], size[1], s.tick * STEP)
    expect(shown).not.toEqual(houseRect(0, s.keep.plots[0]!))
    expect(stroked(shown)).toBe(true)
    expect(stroked(houseRect(0, s.keep.plots[0]!))).toBe(false)
  })

  it('draws the tweens between shots, every moving moment and Good night, frame after frame', () => {
    // A hundred and forty frames, the sizes taking turns: each size gets every third frame, and through them every kind of frame below.
    SIZES.forEach((size, i) => {
      const { draw } = stage(size, false)
      for (let k = i; k < 140; k += SIZES.length) {
        const s = busy(1000 + k * 3)
        // A tween now and then: from the street into a plot or a room and back.
        if (k % 40 < 12) {
          s.shotFrom = { kind: 'street', x: 60 }
          s.shot = k % 2 === 0 ? { kind: 'plot', plot: 2 } : { kind: 'room', plot: 0, room: s.keep.plots[0]!.rooms[0]!.id }
          s.shotAt = s.tick - (k % 12) * 3
        } else s.shot = s.shotFrom = Math.floor(k / SIZES.length) % 3 === 0 ? { kind: 'plot', plot: 2 } : { kind: 'street', x: 20 + (k % 7) * 15 }
        if (k % 2 === 0) s.press = { hit: { kind: 'spot', plot: 3, col: 0, row: 0 }, at: s.tick - 3 }
        if (k >= 70) s.night = { at: 900, dark: s.keep.plots.map((_, j) => (j === 0 ? 1000 + k : -1)), doneAt: -1 }
        draw(s)
      }
    })
  })

  it('draws a room carried away by the crane, from the gone list, and lowers a room in the build view', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('tall')
    const p = s.keep.plots[0]!
    const top = p.rooms.find((r) => roomsOnTop(p, r).length === 0)!
    p.rooms = p.rooms.filter((r) => r !== top)
    s.gone = [{ plot: 0, room: top }]
    s.craneRoom = top.id
    s.craneOut = true
    for (let i = 0; i <= ticks(LOWER); i += 5) {
      s.craneAt = s.tick - i
      draw(s)
      s.tick++
    }
    p.rooms.push(top)
    s.gone = []
    s.craneOut = false
    for (let i = 0; i <= ticks(LOWER + HAMMER); i += 5) {
      s.craneAt = s.tick - i
      draw(s)
      s.tick++
    }
  })

  it("hangs the crane's jib over the build view's rect: the whole house on a tablet, the floors shown on a phone on its side", () => {
    const s = demoState('road')
    s.shot = s.shotFrom = { kind: 'plot', plot: 0 }
    const jib = (size: Size) => {
      seen.cranes.length = 0
      stage(size, false).draw(s)
      expect(seen.cranes).toHaveLength(1)
      return seen.cranes[0]!
    }
    const cut = buildRect(s, 0, SIZES[1][0], SIZES[1][1], s.tick * STEP).y - houseRect(0, s.keep.plots[0]!).y
    expect(cut).toBeGreaterThan(1)
    expect(jib(SIZES[0]) - jib(SIZES[1])).toBeCloseTo(cut, 9)
  })

  it('draws every road with the truck all along it, at every stop, in the air and with its goods flying in', () => {
    SIZES.forEach((size, i) => {
      const { draw } = stage(size, true)
      // Every kind of road on the tablet, as the training road and as a trip with a surprise; a plain trip on each other screen, of a kind of its own.
      for (const kind of i === 0 ? ROAD_KINDS : [ROAD_KINDS[i]!]) {
        for (const trip of i === 0 ? [1, 6] : [2]) {
          const s = onRoad(demoState('road'), kind, trip, 0)
          const road = s.road!
          const def = road.def
          // A frame every half of the road's width on this screen: every stretch of it is drawn twice, its ground's bakes and what stands on it.
          for (let x = 0; x < def.length + 30; x += (ROAD_HEIGHT * size[0]) / size[1] / 2) {
            road.x = x
            road.y = surfaceAt(def, x)
            road.airborne = Math.floor(x) % 50 < 5
            road.tilt = road.airborne ? -0.2 : 0
            road.stop = -1
            s.tick += 5
            draw(s)
          }
          // Each stop in turn: a boulder being broken, a family crossing, the train; the things behind done.
          def.things.forEach((th, i) => {
            road.x = th.x - 6
            road.y = surfaceAt(def, road.x)
            road.stop = th.kind === 'boulder' || th.kind === 'crosser' || th.kind === 'surprise' ? i : -1
            road.stopAt = s.tick - 30
            road.hits = 2
            road.hitAt = s.tick - 4
            road.honkAt = s.tick - 10
            road.answered = i
            road.answerAt = s.tick - 10
            road.bed = ['log', 'rock', 'rock', 'gem']
            road.present = i % 2 === 0
            s.flights = [{ good: 'rock', n: 1, from: { kind: 'road', x: th.x, y: -0.5 }, to: { kind: 'bed' }, at: s.tick - 10, dur: 30 }]
            for (let j = 0; j < i; j++) road.done[j] = s.tick - 100
            road.rampGot[0] = s.tick - 50
            s.tick += 3
            draw(s)
          })
        }
      }
    })
  })

  it('keeps the crossing with its barrier up once the train has passed', () => {
    const { draw } = stage(SIZES[0], false)
    const s = onRoad(demoState('road'), 'beach', 4, 0)
    const def = makeRoad('beach', 4, 6)
    const road = startRoad(def)
    s.road = road
    const i = def.things.findIndex((th) => th.kind === 'surprise' && th.what === 'train')
    road.x = stopX(def.things[i]!)
    road.y = surfaceAt(def, road.x)
    road.done[i] = s.tick - 10
    seen.surprises.length = 0
    s.tick++
    draw(s)
    expect(seen.surprises).toEqual([{ what: 'train', u: 1 }])
  })

  it("bakes the road's ground at the zoom the view holds still at, and while the camera zooms (at the train) again only as the zoom crosses a step, drawing the chunks scaled to the view", () => {
    const size = SIZES[2]
    const { r, main, pool, calls } = stage(size, false, ['drawImage'])
    const s = onRoad(demoState('road'), 'beach', 4, 100)
    const rest = viewAt(s, s.tick * STEP, size[0], size[1], size[2])
    expect(rest.ppm).toBe(roadZoom(size[0], size[1]))
    // The view's left edge half a chunk (8 m) in, so zooming out a little brings no new chunk into view.
    const x0 = Math.floor(rest.x0 / 8) * 8 + 4
    /** A frame `ticks` after the last at `k` times the road's own zoom, its left edge where it is: how much each chunk is drawn scaled, and how many bakes there were. */
    const frame = (k: number, ticks = 1) => {
      s.tick += ticks
      calls.length = 0
      const paints = pool.paints()
      main.check(`road at ${k}`, () => r.draw(s, s.tick * STEP, { ...rest, x0, ppm: rest.ppm * k }, [], STEP), 'allowed')
      const scales = calls.map((c) => c.args[3]! / (c.args[0] as unknown as HTMLCanvasElement).width)
      expect(scales.length, `${k}`).toBeGreaterThan(0)
      return { scales, bakes: pool.paints() - paints }
    }
    // At the road's own zoom: the chunks in view, then the one ahead, then nothing; drawn as baked.
    expect(frame(1).bakes).toBeGreaterThan(0)
    expect(frame(1).bakes).toBe(1)
    const still = frame(1)
    expect(still.bakes).toBe(0)
    expect(still.scales.every((x) => x === 1)).toBe(true)
    // Zooming out within a step: no bake, the chunks shrunk to the view.
    for (const k of [0.99, 0.97, 0.95, 0.93]) {
      const easing = frame(k)
      expect(easing.bakes, `${k}`).toBe(0)
      for (const x of easing.scales) expect(x, `${k}`).toBeCloseTo(k, 9)
    }
    // Past a step: baked at the next step, drawn a little scaled. A frame that repeats the zoom mid-ease (it ran no step of the state, as on a 90 Hz screen) keeps the step's bakes; held still for ZOOM_HELD (0.25 s), baked at the view's own zoom.
    const stepped = frame(0.8)
    expect(stepped.bakes).toBeGreaterThan(0)
    for (const x of stepped.scales) expect(Math.abs(Math.log2(x))).toBeGreaterThan(0.01)
    for (const x of stepped.scales) expect(Math.abs(Math.log2(x))).toBeLessThan(0.2)
    const repeated = frame(0.8)
    expect(repeated.bakes, 'only the chunk ahead').toBeLessThanOrEqual(1)
    expect(repeated.scales).toEqual(stepped.scales)
    expect(frame(0.79).bakes).toBe(0)
    const settled = frame(0.79, 15)
    expect(settled.bakes).toBeGreaterThan(0)
    expect(settled.scales.every((x) => x === 1)).toBe(true)
  })

  it('wipes between the street and the road both ways, opening the homecoming on the canvas, and lets the snapshot go', () => {
    const size = SIZES[0]
    const { draw, pool, calls } = stage(size, false, ['arc'])
    const s = demoState('street')
    s.shot = s.shotFrom = { kind: 'street', x: 24 }
    draw(s)
    onRoad(s, 'forest', 2, 0)
    s.shotFrom = { kind: 'street', x: 24 }
    s.shotAt = s.tick
    for (let i = 0; i < 60; i++) {
      s.tick++
      draw(s)
    }
    homecoming(s)
    calls.length = 0
    // Frame by frame through the wipe, then a frame every fifth of a second on through the drive in, the tip and the backing home.
    for (let i = 0; i < ticks(DRIVE_IN) + 300; i += i < 60 ? 1 : 12) {
      s.tick += i < 60 ? 1 : 12
      draw(s)
    }
    // The wipe's circle is the one arc drawn at the canvas's own transform: from the first frame it opens, its centre is on the canvas, though the truck is still off it to the left.
    const W = Math.round(size[0] * size[2])
    const H = Math.round(size[1] * size[2])
    const wipes = calls.filter((c) => c.a === 1 && c.e === 0)
    expect(wipes.length).toBeGreaterThan(20)
    for (const c of wipes) {
      expect(c.args[0]).toBeGreaterThan(0)
      expect(c.args[0]).toBeLessThan(W)
      expect(c.args[1]).toBeGreaterThan(0)
      expect(c.args[1]).toBeLessThan(H)
    }
    // The wipe's snapshot (a canvas the screen's size) is let go once the wipe is done.
    expect(pool.made.some((c) => c.width === W)).toBe(false)
  })

  it('drives the street truck home where layout.ts puts its tap target, with the present in its bed until it pops out at the tip, opens in the yard behind the tipped bed, stands behind the truck backing past and shrinks away when its card goes', () => {
    // A screen wide enough to show the garage and the yard together; what is off it is not drawn.
    const { draw } = stage([2400, 820, 1], false)
    const s = homecoming(demoState('street'))
    s.shot = s.shotFrom = { kind: 'street', x: 24 }
    const inView = (view: View, x: number, half: number) => x - half > view.x0 && x + half < view.x0 + view.w / view.ppm
    let flying = 0
    let bed = 0
    let shrinking = 0
    let passed = 0
    for (let i = 0; i < ticks(DRIVE_IN + PRESENT_POP + PRESENT_FOR + 1); i += 6) {
      s.tick += 6
      seen.truck.length = 0
      seen.present.length = 0
      const view = draw(s)
      const t = s.tick * STEP
      const at = truckOnStreet(s, t)
      expect(seen.truck.length).toBe(inView(view, at.x, TRUCK.length / 2) ? 1 : seen.truck.length)
      if (seen.truck.length === 0) continue
      const truck = world(seen.truck[0]!, view)
      expect(truck.x).toBeCloseTo(at.x, 6)
      expect(seen.truck[0]!.driver).toBe(s.builder.at.kind === 'truck')
      const target = targets(s).find((x) => x.hit.kind === 'truck')
      if (s.tick >= s.tipAt) expect(centre(target!.rect).x).toBeCloseTo(truck.x, 6)
      const present = seen.present.map((p) => ({ ...world(p, view), open: p.open, k: p.a / (view.ppm * view.dpr) }))
      const opened = t - s.tipAt * STEP - PRESENT_POP
      // In the bed and in the air it is drawn over the truck; landed, under it, so the truck backing home passes in front of it.
      if (present.length > 0) expect(seen.present[0]!.n < seen.truck[0]!.n).toBe(opened >= 0)
      if (opened >= 0 && present.length > 0 && Math.abs(truck.x - PRESENT_X) < TRUCK.length / 2) passed++
      if (opened > PRESENT_FOR + 1e-9) {
        // Its card gone, it shrinks away about its bottom in a moment and is gone.
        if (present.length > 0) {
          shrinking++
          expect(present[0]!.k).toBeLessThan(1)
          expect(present[0]!.x).toBeCloseTo(PRESENT_X, 6)
        }
        expect(present.length).toBe(opened < PRESENT_FOR + 0.5 ? present.length : 0)
        continue
      }
      expect(present).toHaveLength(1)
      const [p] = present
      if (s.tick < s.tipAt) {
        // In the bed, shut, over the truck's back half.
        bed++
        expect(p!.open).toBe(-1)
        expect(p!.x).toBeGreaterThan(truck.x - TRUCK.length / 2)
        expect(p!.x).toBeLessThan(truck.x)
        expect(p!.y).toBeLessThan(-1)
      } else if (t - s.tipAt * STEP < PRESENT_POP) {
        // In the air from the bed to the yard behind it, shut.
        flying++
        expect(p!.open).toBe(-1)
        expect(p!.x).toBeGreaterThan(PRESENT_X)
        expect(p!.x).toBeLessThanOrEqual(TRUCK_TIP_X)
        expect(p!.y).toBeLessThan(0)
      } else {
        expect(p!.x).toBeCloseTo(PRESENT_X, 6)
        expect(p!.k).toBeCloseTo(1, 6)
        expect(p!.open).toBeCloseTo(opened, 6)
      }
    }
    expect(bed).toBeGreaterThan(20)
    expect(flying).toBeGreaterThan(5)
    expect(shrinking).toBeGreaterThan(0)
    expect(passed).toBeGreaterThan(0)
  })

  it('carries the present in the bed on the road once it is picked up', () => {
    const { draw } = stage(SIZES[0], false)
    const s = onRoad(demoState('road'), 'beach', 2, 30)
    const road = s.road!
    for (const present of [false, true]) {
      road.present = present
      seen.present.length = 0
      s.tick++
      const view = draw(s)
      const inBed = seen.present.map((p) => world(p, view)).filter((p) => Math.abs(p.x - road.x) < TRUCK.length / 2 && p.y < road.y - 1)
      expect(inBed).toHaveLength(present ? 1 : 0)
    }
  })

  it('keeps the builder where the rules pop them (on the scaffold between rooms) and runs only a dash the rules started', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('tall')
    const x = plotLeft(0) + 3
    const builder = () => seen.builder.filter((b) => b.look === s.keep.look)
    // Built a second room: the rules pop the builder to the new scaffold, its stale fromX far off at the mirror.
    s.builder = { at: { kind: 'scaffold', plot: 0, x, y: -2.4 }, fromX: MIRROR_BUILDER_X, movedAt: s.tick, pose: 'hammer', poseAt: s.tick, facing: 1 }
    for (let i = 0; i <= ticks(DASH); i += 3) {
      seen.builder.length = 0
      const view = draw(s)
      const at = world(builder()[0]!, view)
      expect(at.x).toBeCloseTo(x, 6)
      expect(at.y).toBeCloseTo(-2.4, 6)
      s.tick += 3
    }
    // A dash from the street: from fromX, up the hop, to the scaffold, running.
    s.builder = { ...s.builder, fromX: x - 10, movedAt: s.tick, poseAt: s.tick + ticks(DASH) }
    s.tick += ticks(DASH / 2)
    seen.builder.length = 0
    const view = draw(s)
    const mid = world(builder()[0]!, view)
    expect(mid.x).toBeGreaterThan(x - 10)
    expect(mid.x).toBeLessThan(x)
    expect(builder()[0]!.pose).toBe('run')
  })

  it('draws the builder visiting a room where the visit started, even when a floor item goes in where they stand', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('row')
    const room = s.keep.plots[0]!.rooms.find((r) => r.col === 5 && r.row === 0)!
    room.items = room.items.map(() => null)
    const v = visitPoint(0, room)
    s.shot = s.shotFrom = { kind: 'room', plot: 0, room: room.id }
    s.builder = { ...s.builder, at: { kind: 'room', plot: 0, room: room.id, x: v.x }, pose: 'stand', poseAt: s.tick }
    const drawn = () => {
      seen.builder.length = 0
      s.tick++
      const view = draw(s)
      return world(seen.builder.find((b) => b.look === s.keep.look)!, view)
    }
    const first = drawn()
    expect(first.x).toBeCloseTo(v.x, 6)
    expect(first.y).toBeCloseTo(v.y, 6)
    // A floor item put in at the slot they stand at: layout's visit point moves on, the builder stays.
    const slot = slotsOf(room.shape).findIndex((sl) => sl.kind === 'floor')
    room.items[slot] = ITEM_IDS.find((id) => ITEMS[id].slot === 'floor')!
    s.rev[0]!++
    expect(Math.abs(visitPoint(0, room).x - v.x)).toBeGreaterThan(0.1)
    expect(drawn().x).toBeCloseTo(v.x, 6)
  })

  it('sets off every event in every world, and its particles move, draw and die out', () => {
    const { draw } = stage(SIZES[0], false)
    const s = busy(2000)
    const room = s.keep.plots[0]!.rooms[0]!
    s.flights = []
    for (const shot of [{ kind: 'street', x: 30 }, { kind: 'plot', plot: 0 }, { kind: 'room', plot: 0, room: room.id }] as const) {
      s.shot = s.shotFrom = shot
      s.tick++
      draw(s)
      s.tick++
      draw(s, allEvents(s))
    }
    onRoad(s, 'hills', 3, 60)
    s.road!.answered = 0
    s.tick++
    draw(s, allEvents(s))
    for (let i = 0; i < 3 / STEP; i++) {
      s.tick++
      draw(s)
    }
  })

  it('puts the road events particles on the road where the events say, even in the step the trip ends', () => {
    // The street shown, s.road gone: the road's events still come, the crate's dust with them.
    const s = demoState('street')
    const fx = new Effects()
    fx.spawn(s, roadEvents(107, -0.4))
    const road = fakeContext()
    const box = road.measure(() => fx.draw(road.ctx, 'road', 0.05))
    expect(box.x0).toBeGreaterThan(100)
    expect(box.x1).toBeLessThan(115)
    const street = fakeContext()
    fx.spawn(s, [{ kind: 'crate', m: 'sawmill' }])
    for (let i = 0; i < 1.2 / STEP; i++) fx.draw(street.ctx, 'street', STEP)
    const box2 = street.measure(() => fx.draw(street.ctx, 'street', STEP))
    expect(box2.x1).toBeLessThan(40)
    expect(box2.x0).toBeLessThan(box2.x1)
  })

  it('bakes each house once, again only when what it shows changes, and never for what changes inside the room being looked at', () => {
    const { draw, pool, main } = stage(SIZES[0], false)
    const s = demoState('street')
    const frame = (shot: State['shot']) => {
      s.shot = s.shotFrom = shot
      s.tick++
      draw(s)
      return pool.paints()
    }
    const street: State['shot'] = { kind: 'street', x: plotLeft(0) + 9 }
    const first = frame(street)
    expect(first).toBeGreaterThan(0)
    for (let i = 0; i < 30; i++) frame(street)
    expect(pool.paints()).toBe(first)
    s.rev[0]!++
    s.keep.plots[0]!.roof = 'tower'
    expect(frame(street)).toBe(first + 1)

    // Into a room: the house once more at the room view's zoom; then items in and out of it, and its neighbour's room, bake nothing.
    const [a, b] = s.keep.plots[0]!.rooms
    const roomA: State['shot'] = { kind: 'room', plot: 0, room: a!.id }
    const roomB: State['shot'] = { kind: 'room', plot: 0, room: b!.id }
    const inA = frame(roomA)
    expect(inA).toBe(first + 2)
    a!.items[0] = a!.items[0] === null ? 'cloudLamp' : null
    s.rev[0]!++
    expect(frame(roomA)).toBe(inA)
    // Room A changed, so the bake behind room B shows it: one bake; back in room A nothing changed again.
    expect(frame(roomB)).toBe(inA + 1)
    expect(frame(roomA)).toBe(inA + 1)
    expect(frame(roomB)).toBe(inA + 1)

    // A frame that does not move (paused, or at the Good night card) draws nothing at all.
    const calls = () => Object.values(main.counts).reduce((x, y) => x + y, 0)
    const before = calls()
    draw(s)
    draw(s)
    expect(calls()).toBe(before)
  })

  it('draws the build view from its bake, the rooms a doorbell party reaches live over it, and idles items only in the room looked at', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('tall')
    const p = s.keep.plots[0]!
    draw(s)
    const baked = seen.blueprints
    seen.idles = 0
    for (let i = 0; i < 20; i++) {
      s.tick += 5
      draw(s)
    }
    expect(seen.idles).toBe(0)
    // A doorbell party, played as the rules play it: each room in turn gets its stamp.
    s.partyAt[0] = s.tick
    const order = [...p.rooms].sort((a, b) => a.row - b.row || a.col - b.col)
    order.forEach((room, i) => {
      s.playAt[`${room.id}`] = s.tick + i * ticks(PARTY_EVERY)
      room.items.forEach((_, slot) => (s.playAt[`${room.id}:${slot}`] = s.tick + i * ticks(PARTY_EVERY)))
    })
    for (let i = 0; i < ticks(order.length * PARTY_EVERY + 4); i += 8) {
      s.tick += 8
      draw(s)
    }
    expect(seen.blueprints).toBe(baked)
    expect(seen.idles).toBe(0)
    // In a room its items idle, and the house is baked once at the room view's zoom.
    s.shot = s.shotFrom = { kind: 'room', plot: 0, room: p.rooms[0]!.id }
    s.tick++
    draw(s)
    expect(seen.idles).toBeGreaterThan(0)
    expect(seen.blueprints).toBe(baked + 1)
  })

  it('bakes no house again as Good night falls and its lights go out, and lights each lit room in its own glow', () => {
    const { draw, pool } = stage(SIZES[0], false, ['fillRect'])
    const s = demoState('street')
    s.shot = s.shotFrom = { kind: 'street', x: plotLeft(0) + 9 }
    draw(s)
    const baked = seen.blueprints
    s.night = { at: s.tick, dark: s.keep.plots.map(() => -1), doneAt: -1 }
    for (let i = 0; i < ticks(4); i += 5) {
      s.tick += 5
      draw(s)
    }
    // Every room of the tall house in view is lit, each in its theme's glow.
    const glows = new Set(pool.noted.flat().filter((c) => c.name === 'fillRect').map((c) => c.fill))
    for (const room of s.keep.plots[0]!.rooms) expect(glows).toContain(THEME_ART[room.theme!].glow)
    s.night.dark[0] = s.tick
    for (let i = 0; i < ticks(0.35 * s.keep.plots[0]!.rooms.length + 1); i += 3) {
      s.tick += 3
      draw(s)
    }
    expect(seen.blueprints).toBe(baked)
  })

  it('washes each row-house door evenly at Good night: the dusk leaves out the lit rooms, but not the parts of the doors in front of them', () => {
    const { draw, pool } = stage(SIZES[0], false, ['rect'])
    const s = demoState('street')
    s.shot = s.shotFrom = { kind: 'street', x: plotLeft(1) + 9 }
    s.hint = null
    const p = s.keep.plots[1]!
    const fronts = doorRects(1, p).flatMap((d) =>
      p.rooms.map((room) => {
        const r = roomRect(1, room)
        const x0 = Math.max(r.x, d.x)
        const y0 = Math.max(r.y, d.y)
        return [x0, y0, Math.min(r.x + r.w, d.x + d.w) - x0, Math.min(r.y + r.h, d.y + d.h) - y0]
      }),
    )
    const parts = fronts.filter(([, , w, h]) => w! > 0 && h! > 0)
    // Each door stands half in front of the ground-floor room on either side of it (the first has none on its left): five parts in all.
    expect(parts).toHaveLength(5)
    const rects = () => pool.noted.flat().filter((c) => c.name === 'rect')
    const added = (part: number[]) => rects().some((c) => c.args.every((v, i) => Math.abs(v - part[i]!) < 1e-9))
    draw(s)
    expect(parts.some(added)).toBe(false)
    s.night = { at: s.tick, dark: s.keep.plots.map(() => -1), doneAt: -1 }
    s.tick += ticks(DUSK + 0.5)
    draw(s)
    for (const part of parts) expect(added(part), part.join(', ')).toBe(true)
  })

  it('leaves out the front doors and the mailbox in front of the room looked at, fading them as the camera comes and goes', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('row')
    const p = s.keep.plots[0]!
    const at = (col: number, row: number) => p.rooms.find((r) => r.col === col && r.row === row)!
    const frame = () => {
      seen.doors.length = 0
      seen.grounds.length = 0
      s.tick += 3
      draw(s)
      return { doors: seen.doors.at(-1)!, mailboxes: seen.grounds.find((g) => g.kind === 'row')!.mailboxes }
    }
    const all = { doors: [1, 1, 1], mailboxes: [1, 1, 1] }
    expect(frame()).toEqual(all)
    // Into the room view of the tall room on the third home's left edge: its door and mailbox fade out, the others stay.
    s.shotFrom = s.shot
    s.shot = { kind: 'room', plot: 0, room: at(4, 0).id }
    s.shotAt = s.tick
    const fading: number[] = []
    for (let i = 0; i < ticks(SHOT_TWEEN) - 3; i += 3) {
      const f = frame()
      expect(f.doors.slice(0, 2)).toEqual([1, 1])
      expect(f.mailboxes).toEqual(f.doors)
      fading.push(f.doors[2]!)
    }
    expect(fading[0]).toBeGreaterThan(0.9)
    expect(fading.at(-1)).toBeLessThan(0.1)
    fading.forEach((v, i) => i > 0 && expect(v).toBeLessThan(fading[i - 1]!))
    expect(frame()).toEqual({ doors: [1, 1, 0], mailboxes: [1, 1, 0] })
    // The big room at the corner hides the doors on both its walls and the first home's mailbox; a room upstairs hides nothing.
    s.shot = s.shotFrom = { kind: 'room', plot: 0, room: at(0, 0).id }
    expect(frame()).toEqual({ doors: [0, 0, 1], mailboxes: [0, 1, 1] })
    s.shot = s.shotFrom = { kind: 'room', plot: 0, room: at(5, 1).id }
    expect(frame()).toEqual(all)
  })

  it('cuts a roof at a wall only where the column on that side stands taller', () => {
    const { draw } = stage(SIZES[0], false)
    const s = demoState('tall')
    const room = (id: number, col: number, row: number): PlacedRoom => ({ id, shape: 'small', col, row, material: 'bricks', theme: 'play', items: slotsOf('small').map(() => null), wall: 0, floor: 0 })
    /** A column of `n` rooms at `col`, its ids from col * 10 + 1. */
    const column = (col: number, n: number) => Array.from({ length: n }, (_, row) => room(col * 10 + row + 1, col, row))
    // Each roof's [left, right]: free beside a lower column or none, cut beside a taller one.
    for (const [heights, sides] of [
      [
        [2, 1, 3],
        [
          [true, true],
          [false, false],
          [true, true],
        ],
      ],
      [
        [1, 3, 2],
        [
          [true, false],
          [true, true],
          [false, true],
        ],
      ],
    ] as const) {
      s.keep.plots[0] = { kind: 'tall', roof: 'pointed', rooms: heights.flatMap((n, col) => column(col, n)) }
      s.rev[0]!++
      s.tick += 3
      seen.roofs.length = 0
      draw(s)
      expect(seen.roofs, heights.join(', ')).toEqual(sides)
    }
  })

  it('keeps every offscreen canvas together under the pixel budget, and each under 2^23 pixels, through every plot and room of every demo', () => {
    for (const size of [...SIZES, [1440, 900, 1] as const]) {
      const { draw, pool } = stage(size, false)
      for (const demo of size[2] === 1 ? (['tall'] as const) : (['street', 'themes', 'tall', 'row'] as const)) {
        const s = demoState(demo)
        for (const shot of streetShots(s)) {
          s.shot = s.shotFrom = shot
          s.tick += 3
          draw(s)
          expect(pool.pixels()).toBeLessThanOrEqual(BUDGET)
          for (const c of pool.made) expect(c.width * c.height, `${c.width}x${c.height} at ${size.join('x')}`).toBeLessThan(2 ** 23)
        }
      }
    }
  })

  it('draws a street frame, a build view frame and a room view frame in a sane number of paths', () => {
    const paths = (demo: Demo, shot: State['shot']) => {
      const { draw, main } = stage(SIZES[0], false)
      const s = demoState(demo)
      s.shot = s.shotFrom = shot
      draw(s)
      s.tick++
      const before = main.counts.beginPath ?? 0
      draw(s)
      return (main.counts.beginPath ?? 0) - before
    }
    // The street and the build view draw their houses from bakes: only what moves or stands in front of them is drawn path by path.
    expect(paths('street', { kind: 'street', x: 44 })).toBeLessThan(2500)
    expect(paths('street', { kind: 'street', x: plotLeft(1) })).toBeLessThan(2500)
    expect(paths('tall', { kind: 'plot', plot: 0 })).toBeLessThan(800)
    expect(paths('row', { kind: 'plot', plot: 0 })).toBeLessThan(800)
    const tall = demoKeep('tall').plots[0]!
    for (const room of tall.rooms) expect(paths('tall', { kind: 'room', plot: 0, room: room.id })).toBeLessThan(1500)
  })
})

describe('the cache', () => {
  it('lets go of the least recently used canvases first, shrinking them to nothing, and never one this frame drew from', () => {
    const pool = canvases()
    const cache = new Cache(pool.make, 1000)
    cache.tick()
    cache.get('a', 'g', 20, 20, () => {})
    cache.tick()
    cache.get('b', 'g', 20, 20, () => {})
    cache.tick()
    cache.find('a')
    cache.get('c', 'g', 20, 20, () => {})
    expect(cache.find('b')).toBeNull()
    expect(cache.find('a')).not.toBeNull()
    expect(pool.pixels()).toBeLessThanOrEqual(1000)
    // Within one frame, nothing it already drew from goes: the frame gets more than the budget.
    cache.tick()
    cache.find('a')
    cache.find('c')
    cache.get('d', 'g', 30, 30, () => {})
    expect(cache.count).toBe(3)
    cache.clear()
    expect(pool.pixels()).toBe(0)
  })

  it('never reuses a canvas whose context is lost, and keeps no spares once a context is lost', () => {
    const pool = canvases()
    const cache = new Cache(pool.make, 1000)
    const lose = (i: number) => ((pool.made[i] as unknown as HTMLCanvasElement).getContext('2d')!.isContextLost = () => true)
    cache.tick()
    cache.get('a', 'g', 10, 10, () => {})
    cache.get('b', 'g', 10, 10, () => {})
    cache.drop('g', () => false)
    // Two spares; the one let go last (b's) has lost its context: a's canvas is reused, then a new one made.
    lose(1)
    cache.get('c', 'g', 10, 10, () => {})
    cache.get('d', 'g', 10, 10, () => {})
    expect(pool.made).toHaveLength(3)
    expect(cache.find('c')).toBe(pool.made[0])
    expect(cache.find('d')).toBe(pool.made[2])
    // A context lost (the renderer's invalidate): everything is let go, and the next bake is painted on a new canvas.
    cache.clear()
    expect(pool.pixels()).toBe(0)
    cache.get('e', 'g', 10, 10, () => {})
    expect(pool.made).toHaveLength(4)
    expect(cache.find('e')).toBe(pool.made[3])
    // A canvas let go with its context lost is not kept either.
    lose(3)
    cache.drop('g', () => false)
    cache.get('f', 'g', 10, 10, () => {})
    expect(cache.find('f')).toBe(pool.made[4])
  })
})

describe('the particles', () => {
  it('are few: a whole street of events at once stays within the pool, and all are gone in three seconds', () => {
    const fx = new Effects()
    const s = busy(3000)
    s.shot = s.shotFrom = { kind: 'room', plot: 0, room: s.keep.plots[0]!.rooms[0]!.id }
    fx.spawn(s, allEvents(s))
    expect(fx.alive).toBeGreaterThan(20)
    expect(fx.alive).toBeLessThanOrEqual(160)
    const { ctx, check } = fakeContext()
    for (let i = 0; i < 3 / STEP; i++) check('particles', () => fx.draw(ctx, 'street', STEP), 'allowed')
    expect(fx.alive).toBe(0)
  })
})

describe('the sprite sheets', () => {
  it('are these groups, in this order', () => {
    expect(Object.keys(SHEETS)).toEqual(['keys', 'builder', 'goods', 'truck', 'land', 'street', 'machines', 'house', 'animals', 'rooms', 'motion'])
  })

  it("draw the rooms' insides and items, and each motion on the first item that uses it, leaving out a motion no item uses", () => {
    const { ctx, check } = fakeContext()
    for (const name of ['rooms', 'motion']) for (const e of SHEETS[name]!()) check(`${name}: ${e.label}`, () => e.draw(ctx, 1.3), 'none')
    const labels = SHEETS.motion!().map((e) => e.label.split(':')[0])
    const used = (k: 'idle' | 'tap') => [...new Set(Object.values(ITEMS).map((d) => `${k} ${d[k]}`))].filter((l) => l !== 'idle still')
    expect(labels.sort()).toEqual([...used('idle'), ...used('tap')].sort())
  })

  it("hold their drawings in their cells all through the replays: the truck and its shadow, an unfolding crate, a crossing family, the train until its tail is past the barrier, the present opening, every motion and room item, the plots' lamps, the new plot's bulldozer and the barrier going up", { timeout: 20_000 }, () => {
    const { ctx, measure } = fakeContext()
    const was = { ppm: pen.ppm, dpr: pen.dpr }
    pen.ppm = 120
    pen.dpr = 1
    // The cell's pad past the box, less the widest ink's width.
    const spare = SHEET_PAD - lw('edge')
    const pick = (group: string, keep: (label: string) => boolean) => SHEETS[group]!().filter((e) => keep(e.label))
    const land = ['ducks', 'cats', 'hedgehogs', 'cows'].map((who) => `${who} crossing (replays)`).concat(['train passing (replays)', 'barrier down', 'present opening (replays)'])
    const whole = [
      ...pick('truck', () => true),
      ...pick('keys', (l) => l.includes('truck')),
      ...pick('machines', (l) => l.includes('unfolds')),
      ...pick('land', (l) => land.includes(l)),
      ...pick('motion', () => true),
      ...pick('rooms', (l) => !l.includes(' wall ')),
    ]
    const out: string[] = []
    for (const e of whole) {
      const b = e.box
      for (let t = 0; t < 6; t += 0.15) {
        const m = measure(() => e.draw(clipped(ctx), t))
        if (m.x0 < b.x - spare || m.y0 < b.y - spare || m.x1 > b.x + b.w + spare || m.y1 > b.y + b.h + spare) {
          out.push(`${e.label} at ${t.toFixed(1)} s: x ${m.x0.toFixed(2)} to ${m.x1.toFixed(2)}, y ${m.y0.toFixed(2)} to ${m.y1.toFixed(2)}`)
          break
        }
      }
    }
    // The street runs on under a plot's cell; its lamp stands whole in it, and the new plot's bulldozer as its replay starts.
    for (const e of pick('street', (l) => l.includes('plot'))) if (measure(() => e.draw(clipped(ctx), 1.3)).y0 < e.box.y - spare) out.push(`${e.label}: the lamp`)
    const dozer = pick('street', (l) => l.startsWith('new plot'))[0]!
    for (const t of [0, 0.05, 0.1, 7, 7.05]) if (measure(() => dozer.draw(clipped(ctx), t)).x0 < dozer.box.x - spare) out.push(`${dozer.label} at ${t} s: the bulldozer`)
    for (let t = 2; t < 2.8; t += 0.04) if (measure(() => dozer.draw(clipped(ctx), t)).x1 > dozer.box.x + dozer.box.w + spare) out.push(`${dozer.label} at ${t.toFixed(2)} s: the heap it pushes`)
    // The last cars run out of the train's leaving cell; then the barrier going up stands whole in it.
    const leaving = pick('land', (l) => l.startsWith('train leaving'))[0]!
    for (let t = 1.6; t < 2.24; t += 0.08) {
      const m = measure(() => leaving.draw(clipped(ctx), t))
      const b = leaving.box
      if (m.x0 < b.x - spare || m.y0 < b.y - spare || m.x1 > b.x + b.w + spare || m.y1 > b.y + b.h + spare) out.push(`${leaving.label} at ${t.toFixed(2)} s: the barrier`)
    }
    pen.ppm = was.ppm
    pen.dpr = was.dpr
    expect(out).toEqual([])
  })
})

describe('the motion vocabulary', () => {
  const IDLES: Idle[] = ['still', 'bob', 'sway', 'pulse', 'swing']
  const TAPS: TapMotion[] = ['hop', 'spin', 'shake', 'grow', 'launch', 'own']

  it('idles calmly: a bob within 3% of the smallest slot box, a sway of a few degrees, a pulse of 3%', () => {
    for (const idle of IDLES) {
      for (let t = 0; t < 6; t += 0.05) {
        const { ctx } = fakeContext()
        applyIdle(ctx, idle, t, 0.3)
        const m = ctx.getTransform()
        expect(Math.abs(m.f), idle).toBeLessThanOrEqual(0.6 * 0.03 + 1e-9)
        expect(Math.abs(Math.atan2(m.b, m.a)), idle).toBeLessThan(0.06)
        expect(Math.abs(m.d - 1), idle).toBeLessThanOrEqual(0.03 + 1e-9)
      }
    }
  })

  it('settles every tap within about a second, does nothing before a tap, and leaves an own reaction to the item', () => {
    const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    for (const tap of TAPS) {
      for (const play of [-1, 1.25, 3, 100]) {
        const { ctx } = fakeContext()
        applyTap(ctx, tap, play)
        const m = ctx.getTransform()
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) expect(m[k], `${tap} at ${play}`).toBeCloseTo(identity[k], 2)
      }
      const { ctx } = fakeContext()
      applyTap(ctx, tap, 0.2)
      const m = ctx.getTransform()
      const moved = Math.abs(m.a - 1) + Math.abs(m.b) + Math.abs(m.d - 1) + Math.abs(m.f)
      expect(moved > 1e-3, tap).toBe(tap !== 'own')
    }
  })

  it('has a motion for every item', () => {
    for (const def of Object.values(ITEMS)) {
      expect(IDLES).toContain(def.idle)
      expect(TAPS).toContain(def.tap)
    }
  })
})

/** A fresh keep has no house: its street draws too, with the plot waiting. */
describe('a fresh game', () => {
  it('draws the street and the mirror of a fresh keep', () => {
    const { draw } = stage(SIZES[0], false)
    const s = createState(freshKeep(), 1, true)
    s.tick = 10
    draw(s)
    s.shot = s.shotFrom = { kind: 'street', x: 20 }
    s.tick++
    draw(s)
  })
})
