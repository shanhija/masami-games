/**
 * The stage's own rules: the camera's turns, speed and bounds, the particle pool over every
 * event in every room, and the renderer drawing every room, screen and phase at phone,
 * tablet and portrait sizes on a fake context, baking no more chunks than it must. The art
 * it calls has its own smoke test (draw.test.ts); screenshots judge the looks.
 */
import { describe, expect, it } from 'vitest'

import type { Frame, Screen } from '../game/game'
import { ROOMS } from '../game/levels'
import { ROWS, type EventKind, type Phase, type Room, type SimEvent } from '../game/model'
import { parseRoom } from '../game/room'
import { createSim } from '../game/sim'
import { Camera } from './camera'
import { Effects } from './effects'
import { Renderer, type Scene } from './frame'
import { pen, type View } from './look'

/** A 2D context that draws nothing, throws on a number that is not finite, and counts what was called and how deep the saves go. */
function fakeContext() {
  const counts: Record<string, number> = {}
  let depth = 0
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif' }
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        counts[key] = (counts[key] ?? 0) + 1
        args.forEach((a, i) => {
          if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key} argument ${i} is ${a}`)
        })
        if (key === 'save') depth += 1
        if (key === 'restore' && --depth < 0) throw new Error('restore without a save')
        if (key === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
        if (key === 'measureText') return { width: 1, actualBoundingBoxAscent: 1, actualBoundingBoxDescent: 0 }
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop: () => {} }
        return undefined
      }
    },
    set(target, key: string, value) {
      if ((key === 'globalAlpha' || key === 'lineWidth') && !Number.isFinite(value)) throw new Error(`${key} ${value}`)
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, counts, depth: () => depth }
}

/** Offscreen canvases for the chunk pool, each with its own fake context; `clears` counts the bakes. */
function canvases() {
  const made: { width: number; height: number; counts: Record<string, number> }[] = []
  const make = () => {
    const f = fakeContext()
    const c = { width: 0, height: 0, counts: f.counts, getContext: () => f.ctx }
    made.push(c)
    return c as unknown as HTMLCanvasElement
  }
  return { make, made, bakes: () => made.reduce((n, c) => n + (c.counts.clearRect ?? 0), 0) }
}

/** A room with one of everything the rooms may not have yet: cookie blocks, gift boxes, a gate, a spring, a gap. */
const TEST_ROOM = parseRoom({
  id: 'kitchen',
  kitten: 'coco',
  map: [
    ...Array.from({ length: 9 }, () => '.'.repeat(40)),
    '.....cccc.....x.....?$pr................',
    '..............x.........................',
    '..............x.........................',
    '...@..........x..........^.......!...h..',
    '############################...#########',
    '############################...#########',
  ],
  lifts: [],
})
const ROOM_LIST: Room[] = [...ROOMS.map(parseRoom), TEST_ROOM]
const FRAME = 1 / 60
const EVENTS: EventKind[] = ['jump', 'land', 'skid', 'bonk', 'star', 'giftStar', 'bump', 'break', 'sprout', 'grow', 'wand', 'ball', 'ballEnd', 'shrink', 'hurt', 'stomp', 'kick', 'shellPop', 'knock', 'wake', 'blow', 'trap', 'pop', 'spring', 'fall', 'rescued', 'pole', 'kitten', 'bossHit', 'bossDown', 'gate', 'done']

/** Event `kind` where it can happen in a room (a bump or a break at a cookie block, a fall in a gap, the rest by her start), or null where it cannot. */
function eventAt(room: Room, kind: EventKind): SimEvent | null {
  if (kind === 'bump' || kind === 'break') {
    const cookie = room.blocks.find((b) => b.kind === 'cookie')
    return cookie ? { kind, x: cookie.col + 0.5, y: cookie.row + (kind === 'break' ? 0.5 : 0), n: 0 } : null
  }
  if (kind === 'fall') return room.gaps.length > 0 ? { kind, x: room.gaps[0]!.col0 + 0.5, y: ROWS + 1, n: 0 } : null
  return { kind, x: room.start.col + 0.5, y: room.start.row + 0.5, n: kind === 'stomp' || kind === 'pole' ? 5 : 3 }
}

/** Every event that can happen in a room. */
const allEvents = (room: Room) => EVENTS.map((kind) => eventAt(room, kind)).filter((e) => e !== null)

describe('the camera', () => {
  const cols = 160
  const viewCols = 21.7

  it('turns only once she has moved the other way faster than 2 tiles/s for 0.35 s, then eases round over 0.8 s', () => {
    const cam = new Camera()
    cam.reset(80, viewCols, cols)
    let t = 0
    while (t < 0.33) {
      cam.follow(80, -5, true, FRAME, viewCols, cols)
      t += FRAME
    }
    expect(cam.dir).toBe(1)
    while (t < 0.37) {
      cam.follow(80, -5, true, FRAME, viewCols, cols)
      t += FRAME
    }
    expect(cam.dir).toBe(-1)
    expect(cam.anchor).toBeLessThan(0.45)
    for (let i = 0; i < 0.8 / FRAME + 1; i++) cam.follow(80, 0, true, FRAME, viewCols, cols)
    expect(cam.anchor).toBeCloseTo(0.62, 6)
  })

  it('stays put while a child wiggles left and right, and while the rescue bubble carries her back', () => {
    const cam = new Camera()
    cam.reset(80, viewCols, cols)
    for (let i = 0; i < 3 / FRAME; i++) cam.follow(80, Math.floor(i / 15) % 2 === 0 ? -5 : 5, true, FRAME, viewCols, cols)
    expect(cam.dir).toBe(1)
    for (let i = 0; i < 1.4 / FRAME; i++) cam.follow(80 - i * 0.1, -6, false, FRAME, viewCols, cols)
    expect(cam.dir).toBe(1)
  })

  it('never moves faster than 14 tiles/s, never leaves the room, and settles with her at the anchor', () => {
    const cam = new Camera()
    cam.reset(10, viewCols, cols)
    let before = cam.x
    for (const hx of [150, 3, 159.9, 80]) {
      for (let i = 0; i < 20 / FRAME; i++) {
        cam.follow(hx, 0, true, FRAME, viewCols, cols)
        expect(Math.abs(cam.x - before)).toBeLessThanOrEqual(14 * FRAME + 1e-9)
        expect(cam.x).toBeGreaterThanOrEqual(0)
        expect(cam.x).toBeLessThanOrEqual(cols - viewCols)
        before = cam.x
      }
    }
    expect(cam.x).toBeCloseTo(80 - 0.38 * viewCols, 3)
  })

  it('drifts right behind the room cards and starts over at the end of the room', () => {
    const cam = new Camera()
    cam.x = 0
    let wrapped = false
    for (let i = 0; i < 300 / FRAME; i++) {
      const was = cam.x
      cam.drift(FRAME, viewCols, cols)
      if (cam.x < was) wrapped = true
      expect(cam.x).toBeLessThanOrEqual(cols - viewCols)
    }
    expect(wrapped).toBe(true)
  })
})

describe('the particles', { timeout: 30_000 }, () => {
  it('every event in every room sets off its particles, which move and draw for three seconds and leave the context balanced', () => {
    pen.px = 64
    const v: View = { width: 1600, height: 960, tile: 64, left: 0, top: 0 }
    for (const room of ROOM_LIST) {
      const fx = new Effects()
      const { ctx, depth } = fakeContext()
      const still = createSim(room)
      v.left = Math.max(0, room.start.col - 8)
      for (const e of allEvents(room)) fx.spawn(e, room)
      // More than the pool holds, so the oldest make way.
      for (let i = 0; i < 300; i++) fx.spawn(eventAt(room, 'jump')!, room)
      for (let i = 0; i < 3 / FRAME; i++) {
        fx.update(FRAME)
        fx.draw(ctx, v, room, still, i * FRAME, 88, 88)
        expect(depth()).toBe(0)
      }
    }
  })
})

// Thousands of frames through the checking proxy: seconds of work, so more than vitest's 5 s default when the machine is busy.
describe('the renderer', { timeout: 30_000 }, () => {
  const SIZES = [
    [2146, 1491, 1.82],
    [1688, 780, 2],
    [1492, 2147, 1.82],
  ] as const
  const PHASES: Phase[] = ['play', 'freeze', 'rescue', 'pole', 'walk', 'found', 'done']

  it('draws every room on every screen and in every phase, at a tablet, a phone and a portrait size', () => {
    SIZES.forEach(([width, height, scale], size) => {
      const pool = canvases()
      const { ctx, depth } = fakeContext()
      const r = new Renderer(ctx, pool.make, 'fi', true)
      r.resize(width, height, scale)
      // A pool of ceil(viewCols / 8) + 2 canvases, all of one chunk's size.
      const tile = Math.floor(Math.min(height / ROWS, width / 20))
      expect(pool.made.length).toBe(Math.ceil(width / tile / 8) + 2)
      for (const c of pool.made) expect([c.width, c.height]).toEqual([8 * tile, ROWS * tile])
      let generation = 0
      for (const room of ROOM_LIST) {
        for (const screen of ['rooms', 'picnic', 'play'] as Screen[]) {
          // Every phase at the tablet size; the others just play.
          for (const phase of screen === 'play' && size === 0 ? PHASES : ['play' as Phase]) {
            const sim = createSim(room)
            const game: Scene = { room, sim, generation: ++generation, screen, paused: false }
            const f: Frame = { steps: 1, alpha: 0.5, events: [] }
            for (let i = 0; i < 40; i++) {
              sim.tick += 2
              if (i === 10) {
                sim.phase = phase
                sim.phaseAt = sim.tick
              }
              f.events = i === 5 || i === 25 ? allEvents(room) : []
              r.draw(game, f, FRAME)
              expect(depth()).toBe(0)
            }
          }
        }
      }
    })
  })

  it('bakes each chunk the camera passes about once, and at most one ahead of it a frame', () => {
    const room = ROOM_LIST[0]!
    const pool = canvases()
    const r = new Renderer(fakeContext().ctx, pool.make, 'en', false)
    r.resize(2146, 1491, 1.82)
    const sim = createSim(room)
    const game: Scene = { room, sim, generation: 1, screen: 'play', paused: false }
    const f: Frame = { steps: 2, alpha: 0, events: [] }
    r.draw(game, f, FRAME)
    const first = pool.bakes()
    expect(first).toBeLessThanOrEqual(4)
    let before = first
    for (let x = sim.hero.x; x < room.cols - 1; x += 7.5 * FRAME) {
      sim.hero.px = sim.hero.x
      sim.hero.x = x
      sim.tick += 2
      r.draw(game, f, FRAME)
      expect(pool.bakes() - before).toBeLessThanOrEqual(2)
      before = pool.bakes()
    }
    expect(pool.bakes()).toBeLessThanOrEqual(Math.ceil(room.cols / 8) + 2)
  })

  it('draws nothing new while paused, until something changes', () => {
    const room = ROOM_LIST[0]!
    const { ctx, counts } = fakeContext()
    const r = new Renderer(ctx, canvases().make, 'en', false)
    r.resize(1180, 820, 1)
    const game: Scene = { room, sim: createSim(room), generation: 1, screen: 'play', paused: false }
    const f: Frame = { steps: 0, alpha: 0, events: [] }
    r.draw(game, f, FRAME)
    game.paused = true
    r.draw(game, f, FRAME)
    const drawn = counts.drawImage
    for (let i = 0; i < 10; i++) r.draw(game, f, FRAME)
    expect(counts.drawImage).toBe(drawn)
    r.resize(1024, 768, 1)
    r.draw(game, f, FRAME)
    expect(counts.drawImage).toBeGreaterThan(drawn!)
  })

  it('says so when a cookie block breaks where there is none', () => {
    const room = ROOM_LIST[0]!
    expect(() => new Effects().spawn({ kind: 'break', x: room.start.col + 0.5, y: 3.5, n: 0 }, room)).toThrow(/cookie block/)
  })
})
