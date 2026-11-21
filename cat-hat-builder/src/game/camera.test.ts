import { afterEach, describe, expect, it, vi } from 'vitest'

import { memorySaves } from '../../../profiles/src/profiles'
import { buildRect, insets, roadZoom, shownRect, simTime, toScreen, toWorld, viewAt, type View } from './camera'
import { Game } from './game'
import { CELL, TRUCK, groundAt, houseRect, roofRect, roomRect, validSpots, type Rect } from './layout'
import { SHOT_TWEEN, type Shot } from './model'
import { makeRoad, startRoad, stopX } from './road'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Runs `seconds` of frames at 60 a second. */
function run(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.advance(1 / 60)
}

/** iPads and laptops held sideways, an iPad held upright, phones on their side and phones held upright. */
const SIDEWAYS = [
  [1180, 820],
  [1366, 1024],
  [1024, 768],
  [1280, 720],
  [1920, 1000],
] as const
const PHONES = [
  [667, 375],
  [640, 360],
  [844, 390],
  [568, 320],
] as const
const UPRIGHT = [
  [820, 1180],
  [390, 844],
  [360, 740],
  [412, 915],
] as const

describe('the camera on every screen', () => {
  it("fits a phone on its side's build view to a house's floors in use and the one over them, and moves it as the crane brings a floor or takes one away", () => {
    // A tall house with a wide room on its ground floor, in the build view.
    const g = new Game('?demo=road', 1, memorySaves())
    const s = g.state
    const p = s.keep.plots[0]!
    expect(p).toMatchObject({ kind: 'tall', rooms: [{ shape: 'wide', row: 0 }] })
    const shot: Shot = { kind: 'plot', plot: 0 }
    s.shot = s.shotFrom = shot
    s.shotAt = -1
    for (const [w, h] of PHONES) {
      const at = `${w}x${h}`
      const v = viewAt(s, simTime(s), w, h, 1)
      // A cell a finger wide, and every ghost and roof in the picture, clear of the HUD.
      expect(CELL * v.ppm, at).toBeGreaterThanOrEqual(w < 600 ? 50 : 56)
      const ins = insets(shot, w, h)
      const inside = (r: Rect) => {
        const [x0, y0] = toScreen(v, r.x, r.y)
        const [x1, y1] = toScreen(v, r.x + r.w, r.y + r.h)
        return x0 >= ins.left - 0.5 && x1 <= w - ins.right + 0.5 && y0 >= ins.top - 0.5 && y1 <= h - ins.bottom + 0.5
      }
      for (const spot of validSpots(p, 'small')) expect(inside(roomRect(0, { shape: 'small', ...spot })), `${at} ghost ${spot.col},${spot.row}`).toBe(true)
      for (let col = 0; col < 3; col++) {
        const roof = roofRect(0, p, col)
        if (roof !== null) expect(inside(roof), `${at} roof ${col}`).toBe(true)
      }
      // The rect the camera fits, as ?debug draws it.
      expect(shownRect(s, shot, w, h, simTime(s)), at).toEqual({ r: buildRect(s, 0, w, h, simTime(s)), fit: 'contain' })
    }
    // Any other window fits the whole house, and a phone the whole of a full one.
    for (const [w, h] of [...SIDEWAYS, ...UPRIGHT]) expect(buildRect(s, 0, w, h, simTime(s)), `${w}x${h}`).toEqual(houseRect(0, p))
    const full = new Game('?demo=tall', 1, memorySaves()).state
    expect(buildRect(full, 0, 667, 375, simTime(full))).toEqual(houseRect(0, full.keep.plots[0]!))

    // A room on the next floor: the view takes in the floor over it, growing over SHOT_TWEEN as the crane starts lowering the room.
    const height = () => buildRect(s, 0, 667, 375, simTime(s)).h
    const two = height()
    g.dispatch({ kind: 'tap', hit: { kind: 'spot', plot: 0, col: 0, row: 1 } })
    expect(p.rooms).toHaveLength(2)
    expect(height()).toBeCloseTo(two, 9)
    const growing = Array.from({ length: Math.round(SHOT_TWEEN * 60) }, () => {
      run(g, 1 / 60)
      return height()
    })
    expect(growing.every((x, i) => x > (i === 0 ? two : growing[i - 1]!))).toBe(true)
    expect(growing.at(-1)).toBeCloseTo(two + CELL, 9)

    // Taken back with the hand: the view stays while the crane lifts the room away, then narrows over SHOT_TWEEN, done as the crane is.
    run(g, 3)
    g.dispatch({ kind: 'theme', theme: null })
    g.dispatch({ kind: 'hand', on: true })
    const room = p.rooms[1]!.id
    g.dispatch({ kind: 'tap', hit: { kind: 'room', plot: 0, room } })
    g.dispatch({ kind: 'tap', hit: { kind: 'room', plot: 0, room } })
    expect(p.rooms).toHaveLength(1)
    run(g, 0.55)
    expect(height()).toBeCloseTo(two + CELL, 9)
    run(g, 0.3)
    expect(height()).toBeLessThan(two + CELL)
    expect(height()).toBeGreaterThan(two)
    run(g, 0.4)
    expect(s.craneRoom).toBe(-1)
    expect(height()).toBeCloseTo(two, 9)
  })

  it("eases a phone on its side's build view on from what it shows when the next room comes quickly, never popping it", () => {
    for (const gap of [0.15, 0.3, 0.45]) {
      const g = new Game('?demo=road', 1, memorySaves())
      const s = g.state
      s.shot = s.shotFrom = { kind: 'plot', plot: 0 }
      s.shotAt = -1
      const height = () => buildRect(s, 0, 667, 375, simTime(s)).h
      const two = height()
      const heights = [two]
      g.dispatch({ kind: 'tap', hit: { kind: 'spot', plot: 0, col: 0, row: 1 } })
      for (let i = 0; i < Math.round(gap * 60); i++) {
        run(g, 1 / 60)
        heights.push(height())
      }
      const before = height()
      g.dispatch({ kind: 'tap', hit: { kind: 'spot', plot: 0, col: 0, row: 2 } })
      expect(s.keep.plots[0]!.rooms, `${gap} s`).toHaveLength(3)
      expect(height(), `${gap} s: the tap itself`).toBeCloseTo(before, 9)
      for (let i = 0; i < 60; i++) {
        run(g, 1 / 60)
        heights.push(height())
      }
      const moves = heights.slice(1).map((x, i) => Math.abs(x - heights[i]!))
      expect(Math.max(...moves), `${gap} s`).toBeLessThan(0.2)
      expect(heights.at(-1), `${gap} s`).toBeCloseTo(two + 2 * CELL, 9)
    }
  })

  it('frames the level crossing while the truck waits for the train, zooming out only on an upright screen, until every car has crossed the road', () => {
    const g = new Game('?road=beach&nosave', 1, memorySaves())
    const s = g.state
    const def = makeRoad('beach', 4, 6)
    const i = def.things.findIndex((t) => t.kind === 'surprise' && t.what === 'train')
    const train = def.things[i]!
    const road = (s.road = startRoad(def))
    const stop = stopX(train)
    const now = simTime(s)
    /** The view `wait` s after the truck stopped for the train, or once the train has passed with the truck `on` metres further, or with no train about. */
    const view = (w: number, h: number, at: { wait: number } | { on: number } | 'none') => {
      road.x = at !== 'none' && 'on' in at ? stop + at.on : stop
      road.stop = at !== 'none' && 'wait' in at ? i : -1
      road.stopAt = s.tick
      road.done[i] = at !== 'none' && 'on' in at ? s.tick : -1
      return viewAt(s, at !== 'none' && 'wait' in at ? now + at.wait : now, w, h, 1)
    }
    /** From the truck's back to past the barrier (0.55 m right of the crossing, its lamp 0.3 m round), and on until the engine has crossed the road: on the track (20 degrees down to the right through the road's middle, draw/land.ts) its back wheels meet the rails past the road's front kerb, 0.4 m under the ground line, once its front is 3.8 m right of the crossing. */
    const framed = (v: View, w: number, at: string) => {
      expect(toScreen(v, stop - TRUCK.length / 2, 0)[0], at).toBeGreaterThanOrEqual(0)
      expect(toScreen(v, train.x + 0.55 + 0.3, 0)[0], at).toBeLessThanOrEqual(w)
      expect(toScreen(v, train.x + 3.8, 0)[0], at).toBeLessThanOrEqual(w)
    }
    for (const [w, h] of UPRIGHT) {
      const at = `${w}x${h}`
      const v = view(w, h, { wait: 1 })
      framed(v, w, at)
      // No deeper than the road's ground is drawn: about 6.5 m under the ground line, the road lower on the tall phone, more sky over it.
      expect(toWorld(v, 0, h)[1] - groundAt(def, stop), at).toBeLessThanOrEqual(6.5)
      // Eased in from the stop, and back out as the truck drives on.
      const plain = view(w, h, 'none')
      expect(plain.ppm, at).toBe(roadZoom(w, h))
      expect(plain.ppm, at).toBeGreaterThan(v.ppm)
      expect(view(w, h, { wait: 0 }), at).toEqual(plain)
      const coming = view(w, h, { wait: 0.3 })
      expect(coming.ppm, at).toBeLessThan(plain.ppm)
      expect(coming.ppm, at).toBeGreaterThan(v.ppm)
      expect(view(w, h, { on: 0 }), at).toEqual(v)
      const going = view(w, h, { on: 1.5 })
      expect(going.ppm, at).toBeLessThan(plain.ppm)
      expect(going.ppm, at).toBeGreaterThan(v.ppm)
      const gone = view(w, h, { on: 3 })
      road.done[i] = -1
      expect(gone, at).toEqual(viewAt(s, now, w, h, 1))
    }
    // A screen held sideways keeps its zoom and its ground line, and moves on only as far as it must: only the two 4:3 ones move at all.
    const moved: string[] = []
    for (const [w, h] of [...SIDEWAYS, ...PHONES]) {
      const at = `${w}x${h}`
      const v = view(w, h, { wait: 1 })
      const plain = view(w, h, 'none')
      framed(v, w, at)
      expect(plain.ppm, at).toBe(roadZoom(w, h))
      expect(v.ppm, at).toBeCloseTo(plain.ppm, 9)
      expect(v.y0, at).toBeCloseTo(plain.y0, 9)
      if (v.x0 !== plain.x0) moved.push(at)
    }
    expect(moved).toEqual(['1366x1024', '1024x768'])
  })
})
