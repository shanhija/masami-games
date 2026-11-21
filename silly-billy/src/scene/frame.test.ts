import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { CAMERA_FOV } from '../../../castle-builder/src/scene/look'
import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast } from '../content'
import { Library } from '../engine/library'
import { createWorld } from '../engine/sim'
import { ROOMS, type Actor, type World } from '../engine/types'
import { busyPoints, CLOSE_R, frameFor, Reveals, ROOM, roomFrame, roomPoints, SHOW, type Frame, type Point } from './frame'
import { FRAME_R } from './look'
import { BACK, standBack } from './zoom'

const library = new Library({
  items: [
    ...BUILTIN_ITEMS,
    {
      id: 'tower',
      name: 'tower',
      nameFi: 'torni',
      calls: ['torni'],
      about: 'a block of flats, 6 m wide, 4 m deep and 10 m high',
      build: (m) => {
        m.box(6, 10, 4, { at: [0, 5, 0], color: '#e8c9a0' })
        m.box(6.3, 0.3, 4.3, { at: [0, 10.15, 0], color: '#7a6a62' })
        return { carry: 'no', solid: true }
      },
    },
  ],
  actions: BUILTIN_ACTIONS,
})
const info = (kind: string) => library.info(kind)

function world() {
  const actors = makeCast().slice(0, 3)
  const w = createWorld({
    room: 'playground',
    actors,
    layouts: {
      playground: [
        { kind: 'slide', x: -6.5, z: -5.5, fixed: true },
        { kind: 'ball', x: 2, z: 1 },
        { kind: 'ball', x: 9, z: -9 },
      ],
      pool: [],
      forest: [],
    },
    seed: 1,
  })
  const [alice, steve, mike] = w.actors
  Object.assign(alice!, { x: -3, z: 4 })
  Object.assign(steve!, { x: 3, z: 4 })
  Object.assign(mike!, { x: 0, z: 5 })
  return w
}

/** The ground points only, to compare where things are. */
const flat = (points: Point[]) => points.map(([x, , z]) => [x, z])

const inView = (w: World, x: number, z: number) => {
  const f = frameFor(busyPoints(w, info))
  return Math.hypot(x - f.x, z - f.z) < f.r
}

const LAPTOP = 1180 / 820
const IPAD = 820 / 1180

/** Where a point shows on the screen ([-1, 1] each way, up positive), from the camera Stage places for this frame. */
function onScreen(f: Frame, p: Point, aspect: number): [number, number] {
  const d = f.r * standBack(aspect)
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 1, 300)
  camera.position.set(f.x + BACK[0] * d, f.y + BACK[1] * d, f.z + BACK[2] * d)
  camera.lookAt(new Vector3(f.x, f.y, f.z))
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const v = new Vector3(...p).project(camera)
  return [v.x, v.y]
}

/** A point is on the screen, at most `top` high: with room for a name and a bubble over a head up close (0.7), anywhere on it at the whole room (1). */
const shows = (f: Frame, p: Point, top = 0.7) =>
  [LAPTOP, IPAD].every((aspect) => {
    const [x, y] = onScreen(f, p, aspect)
    return Math.abs(x) <= 1 && y <= top + 1e-9 && y >= -1
  })

/** Every point is within `r` of one of these places on the ground. */
const within = (points: Point[], places: ReadonlyArray<readonly [number, number]>, r: number) =>
  points.every(([x, , z]) => places.some(([px, pz]) => Math.hypot(x - px, z - pz) <= r))

const head = (a: Actor): Point => [a.x, a.y + a.look.height * a.scale, a.z]

/** A world with a 10.3 m tower in the playground, its top 6 by 4 m. */
function withTower(x: number, z: number) {
  const w = world()
  w.items.push({ ...w.items[0]!, id: '#tower', kind: 'tower', x, y: 0, z, yaw: 0, fixed: true, loose: false })
  return { w, tower: w.items.at(-1)! }
}

describe('the camera frame', () => {
  it('shows the whole room when nobody is busy, the starting rooms exactly as they always were', () => {
    const w = world()
    expect(busyPoints(w, info)).toEqual([])
    expect(roomFrame([])).toEqual(ROOM)
    expect(ROOM).toEqual({ x: 0, y: 0, z: 0, r: FRAME_R })
    for (const room of ROOMS) {
      const start = createWorld({ room, actors: makeCast(), layouts: LAYOUTS, seed: 1 })
      expect(roomFrame(roomPoints(start, info))).toEqual(ROOM)
      // Everyone at the room's far corner, away from the camera, still fits.
      for (const a of start.actors) Object.assign(a, { x: -11.5, z: -11.5 })
      expect(roomFrame(roomPoints(start, info))).toEqual(ROOM)
    }
  })

  it('moves in close on one actor doing something', () => {
    const w = world()
    const a = w.actors[0]!
    a.doing = { action: 'jump', args: {}, serial: 1, since: 0 }
    expect(frameFor(busyPoints(w, info))).toEqual({ x: a.x, y: 0, z: a.z, r: CLOSE_R })
    // Up in a jump, the aim stays on the ground.
    a.y = 0.6
    expect(frameFor(busyPoints(w, info))).toEqual({ x: a.x, y: 0, z: a.z, r: CLOSE_R })
  })

  it('keeps the actor a step names in view too', () => {
    const w = world()
    const [alice, steve] = w.actors
    alice!.doing = { action: 'throw', args: { thing: 'ball', target: steve!.id }, serial: 1, since: 0 }
    const f = frameFor(busyPoints(w, info))
    for (const b of [alice!, steve!]) expect(Math.hypot(b.x - f.x, b.z - f.z)).toBeLessThan(f.r)
    expect(f.r).toBeGreaterThan(CLOSE_R - 0.001)
    expect(f.r).toBeLessThan(FRAME_R)
  })

  it('keeps a thing a step names in view: by its id, by its kind (the nearest one), or a place', () => {
    const w = world()
    const alice = w.actors[0]!
    const [slide, near, far] = w.items
    // "Alice, throw the ball at the slide": the slide is 10 m away.
    alice.doing = { action: 'throw', args: { thing: 'ball', target: 'slide' }, serial: 1, since: 0 }
    expect(inView(w, slide!.x, slide!.z)).toBe(true)
    expect(inView(w, near!.x, near!.z)).toBe(true)
    expect(busyPoints(w, info).some(([x, , z]) => Math.hypot(x - far!.x, z - far!.z) < 1)).toBe(false)
    alice.doing = { action: 'walk', args: { to: slide!.id }, serial: 2, since: 0 }
    expect(inView(w, slide!.x, slide!.z)).toBe(true)
    alice.doing = { action: 'walk', args: { to: '8,-7' }, serial: 3, since: 0 }
    expect(busyPoints(w, info)).toContainEqual([8, 0, -7])
    // Words that are no thing here (what to say) are nowhere.
    alice.doing = { action: 'say', args: { text: 'hello' }, serial: 4, since: 0 }
    expect(busyPoints(w, info)).toEqual([
      [alice.x, 0, alice.z],
      [alice.x, alice.look.height, alice.z],
    ])
  })

  it('frames what a thinking actor waits to do with, and whoever reacts', () => {
    const w = world()
    const [alice, steve] = w.actors
    alice!.thinking = { about: 'ride', since: 0, progress: 0.3 }
    alice!.queue = [{ action: 'ride', args: { thing: 'slide' }, serial: 1 }]
    const points = busyPoints(w, info)
    expect(flat(points.slice(0, 3))).toEqual([
      [alice!.x, alice!.z],
      [alice!.x, alice!.z],
      [-6.5, -5.5],
    ])
    // The slide's top corners: the rest of it.
    expect(points).toHaveLength(7)
    expect(within(points.slice(3), [[-6.5, -5.5]], 2.5)).toBe(true)
    alice!.thinking = null
    alice!.queue = []
    steve!.reacting = 'hello'
    expect(flat(busyPoints(w, info))).toEqual([
      [steve!.x, steve!.z],
      [steve!.x, steve!.z],
    ])
  })

  it('follows a thrown thing until it slows down, however high it flies', () => {
    const w = world()
    const ball = w.items[1]!
    Object.assign(ball, { loose: true, x: -8, y: 9, z: -8, vx: -4, vy: 3, vz: -2 })
    const points = busyPoints(w, info)
    expect(points).toHaveLength(5)
    expect(within(points, [[-8, -8]], 0.25)).toBe(true)
    expect(shows(frameFor(points), [ball.x, ball.y + 0.3, ball.z])).toBe(true)
    Object.assign(ball, { vx: 0.5, vy: 0, vz: 0.2 })
    expect(busyPoints(w, info)).toEqual([])
  })

  it('frames people on the ground exactly as it always did', () => {
    // The frame before heights counted: the ground under the points only.
    const before = (points: ReadonlyArray<readonly [number, number]>) => {
      const xs = points.map((p) => p[0])
      const zs = points.map((p) => p[1])
      const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
      const far = Math.max(...points.map(([x, z]) => Math.hypot(x - cx, z - cz)))
      const r = Math.min(FRAME_R, Math.max(CLOSE_R, far + 2.5))
      const k = 1 - 0.5 * ((r - CLOSE_R) / (FRAME_R - CLOSE_R))
      return { x: cx * k, y: 0, z: cz * k, r }
    }
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let i = 0; i < 2000; i++) {
      const places = Array.from({ length: 1 + Math.floor(((rnd() + 1) / 2) * 5) }, () => [rnd() * 11.5, rnd() * 11.5] as const)
      // Kids, grown-ups and the cat, standing on the ground.
      const points = places.flatMap(([x, z]): Point[] => [
        [x, 0, z],
        [x, [1.15, 1.8, 0.5][i % 3]!, z],
      ])
      expect(frameFor(points)).toEqual(before(places))
    }
  })

  it('widens to the whole room for actors in far corners, leaning back to the middle', () => {
    const f = frameFor([
      [-11, 0, -11],
      [11, 0, 11],
    ])
    expect(f.r).toBe(FRAME_R)
    expect(Math.abs(f.x)).toBeLessThan(1e-9)
    const g = frameFor([
      [10, 0, 10],
      [-6, 0, 10],
    ])
    expect(g.r).toBeLessThanOrEqual(FRAME_R)
    expect(g.z).toBeLessThan(10)
  })
})

describe('the camera and tall things', () => {
  it('frames someone up on a roof as it would on the ground, only higher', () => {
    const { w, tower } = withTower(-4, -6)
    const alice = w.actors[0]!
    Object.assign(alice, { x: -4, y: 10.3, z: -6, on: tower.id })
    alice.doing = { action: 'jump', args: {}, serial: 1, since: 0 }
    const f = frameFor(busyPoints(w, info))
    expect(f.x).toBe(alice.x)
    expect(f.z).toBe(alice.z)
    expect(f.y).toBeCloseTo(10.3, 6)
    expect(f.r).toBe(CLOSE_R)
    // Up in a jump on the roof, the aim stays on the roof.
    alice.y = 11
    expect(frameFor(busyPoints(w, info)).y).toBeCloseTo(10.3, 6)
    expect(shows(f, head(alice))).toBe(true)
  })

  it('shows the whole tower when a step names it, and someone on its roof with someone below', () => {
    for (const [tx, tz] of [
      [0, 0],
      [-8, -8],
      [8, -8],
      [-8, 6],
      [8, 6],
    ] as const) {
      const { w, tower } = withTower(tx, tz)
      const [alice, steve] = w.actors
      // "Alice, climb onto the tower": its top, and Alice beside it.
      Object.assign(alice!, { x: tx + 3.5, y: 0, z: tz + 2.5 })
      alice!.doing = { action: 'climb', args: { thing: tower.id }, serial: 1, since: 0 }
      let f = frameFor(busyPoints(w, info))
      expect(f.y).toBe(0)
      for (const p of [head(alice!), [tx, 10.3, tz] as const, [tx - 3, 10.3, tz - 2] as const]) expect(shows(f, p)).toBe(true)
      // On the roof, with Steve throwing her a ball from the ground.
      Object.assign(alice!, { x: tx, y: 10.3, on: tower.id, z: tz, doing: null })
      Object.assign(steve!, { x: tx + 5, z: tz + 5 })
      steve!.doing = { action: 'throw', args: { thing: 'ball', target: alice!.id }, serial: 2, since: 0 }
      f = frameFor(busyPoints(w, info))
      for (const p of [head(alice!), head(steve!), [steve!.x, 0, steve!.z] as const]) expect(shows(f, p)).toBe(true)
      expect(f.r).toBeLessThan(FRAME_R * 1.5)
    }
  })

  it('widens the whole room while something in it reaches over the top of the screen', () => {
    // The tower in the middle shows its top anyway: the room as it always was.
    const middle = withTower(0, 0)
    expect(roomFrame(roomPoints(middle.w, info))).toEqual(ROOM)
    // At the back, with someone on its roof, the frame widens until all of it shows.
    const back = withTower(-8, -8)
    const alice = back.w.actors[0]!
    Object.assign(alice, { x: -8, y: 10.3, z: -8, on: back.tower.id })
    const f = roomFrame(roomPoints(back.w, info))
    expect(f.r).toBeGreaterThan(FRAME_R)
    expect([f.x, f.y, f.z]).toEqual([0, 0, 0])
    for (const p of [head(alice), [-11, 10.3, -10] as const]) expect(shows(f, p, 1)).toBe(true)
  })
})

describe('showing a made thing when its real model comes', () => {
  it('shows who wears it and where it stands for a few seconds, once', () => {
    const w = world()
    const [alice, steve] = w.actors
    const made = w.items[1]!
    made.kind = 'snowman'
    alice!.look.worn.body = { kind: 'gown', tint: null }
    const drafts = new Set(['snowman', 'gown'])
    const reveals = new Reveals()
    const look = (version: number) => reveals.update(w, version, (kind) => drafts.has(kind))
    const shown = () => reveals.points(w, info)
    look(1)
    expect(shown()).toEqual([])
    // The gown's real model comes in: Alice is shown, nobody else.
    drafts.delete('gown')
    look(2)
    expect(flat(shown())).toEqual([
      [alice!.x, alice!.z],
      [alice!.x, alice!.z],
    ])
    w.t += SHOW + 0.1
    look(2)
    expect(shown()).toEqual([])
    // The snowman's comes: it is shown where it stands.
    drafts.delete('snowman')
    look(3)
    expect(shown()).toHaveLength(5)
    expect(within(shown(), [[made.x, made.z]], 1)).toBe(true)
    // Things that never were drafts are never shown.
    steve!.look.worn.head = { kind: 'cap', tint: null }
    look(4)
    expect(shown()).toHaveLength(5)
    expect(within(shown(), [[made.x, made.z]], 1)).toBe(true)
    // A new world starts its clock again: nothing from before is shown.
    w.t = 0
    look(4)
    expect(shown()).toEqual([])
  })
})
