import { describe, expect, it } from 'vitest'

import { makeCast } from '../content'
import { createWorld } from '../engine/sim'
import type { World } from '../engine/types'
import { busyPoints, CLOSE_R, frameFor, Reveals, SHOW } from './frame'
import { FRAME_R } from './look'

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

const inView = (w: World, x: number, z: number) => {
  const f = frameFor(busyPoints(w))
  return Math.hypot(x - f.x, z - f.z) < f.r
}

describe('the camera frame', () => {
  it('shows the whole room when nobody is busy', () => {
    const w = world()
    expect(busyPoints(w)).toEqual([])
    expect(frameFor([])).toEqual({ x: 0, z: 0, r: FRAME_R })
  })

  it('moves in close on one actor doing something', () => {
    const w = world()
    const a = w.actors[0]!
    a.doing = { action: 'jump', args: {}, serial: 1, since: 0 }
    const f = frameFor(busyPoints(w))
    expect(f).toEqual({ x: a.x, z: a.z, r: CLOSE_R })
  })

  it('keeps the actor a step names in view too', () => {
    const w = world()
    const [alice, steve] = w.actors
    alice!.doing = { action: 'throw', args: { thing: 'ball', target: steve!.id }, serial: 1, since: 0 }
    const f = frameFor(busyPoints(w))
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
    expect(busyPoints(w)).not.toContainEqual([far!.x, far!.z])
    alice.doing = { action: 'walk', args: { to: slide!.id }, serial: 2, since: 0 }
    expect(inView(w, slide!.x, slide!.z)).toBe(true)
    alice.doing = { action: 'walk', args: { to: '8,-7' }, serial: 3, since: 0 }
    expect(busyPoints(w)).toContainEqual([8, -7])
    // Words that are no thing here (what to say) are nowhere.
    alice.doing = { action: 'say', args: { text: 'hello' }, serial: 4, since: 0 }
    expect(busyPoints(w)).toEqual([[alice.x, alice.z]])
  })

  it('frames what a thinking actor waits to do with, and whoever reacts', () => {
    const w = world()
    const [alice, steve] = w.actors
    alice!.thinking = { about: 'ride', since: 0, progress: 0.3 }
    alice!.queue = [{ action: 'ride', args: { thing: 'slide' }, serial: 1 }]
    expect(busyPoints(w)).toEqual([
      [alice!.x, alice!.z],
      [-6.5, -5.5],
    ])
    alice!.thinking = null
    alice!.queue = []
    steve!.reacting = 'hello'
    expect(busyPoints(w)).toEqual([[steve!.x, steve!.z]])
  })

  it('follows a thrown thing until it slows down', () => {
    const w = world()
    const ball = w.items[1]!
    Object.assign(ball, { loose: true, x: -8, z: -8, vx: -4, vy: 3, vz: -2 })
    expect(busyPoints(w)).toEqual([[-8, -8]])
    Object.assign(ball, { vx: 0.5, vy: 0, vz: 0.2 })
    expect(busyPoints(w)).toEqual([])
  })

  it('widens to the whole room for actors in far corners, leaning back to the middle', () => {
    const f = frameFor([
      [-11, -11],
      [11, 11],
    ])
    expect(f.r).toBe(FRAME_R)
    expect(Math.abs(f.x)).toBeLessThan(1e-9)
    const g = frameFor([
      [10, 10],
      [-6, 10],
    ])
    expect(g.r).toBeLessThanOrEqual(FRAME_R)
    expect(g.z).toBeLessThan(10)
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
    look(1)
    expect(reveals.points(w)).toEqual([])
    // The gown's real model comes in: Alice is shown, nobody else.
    drafts.delete('gown')
    look(2)
    expect(reveals.points(w)).toEqual([[alice!.x, alice!.z]])
    w.t += SHOW + 0.1
    look(2)
    expect(reveals.points(w)).toEqual([])
    // The snowman's comes: it is shown where it stands.
    drafts.delete('snowman')
    look(3)
    expect(reveals.points(w)).toEqual([[made.x, made.z]])
    // Things that never were drafts are never shown.
    steve!.look.worn.head = { kind: 'cap', tint: null }
    look(4)
    expect(reveals.points(w)).toEqual([[made.x, made.z]])
    // A new world starts its clock again: nothing from before is shown.
    w.t = 0
    look(4)
    expect(reveals.points(w)).toEqual([])
  })
})
