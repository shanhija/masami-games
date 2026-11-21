import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { inLang, LANGS } from '../../../profiles/src/lang'
import { memorySaves } from '../../../profiles/src/profiles'

import { fitThemeCards, handAt, handFor, layerTakes, SETTLE } from '../Cards'
import { TOOL_ICON_BOX } from '../draw/builder'
import { canvasEvents } from '../draw/Stage'
import { partLook, ToolPic } from '../Pictures'
import { fitWardrobe, tabLook, wardrobePanel } from '../Wardrobe'
import { optionName } from '../words'
import { insets, isShort, roomTray, simTime, toScreen, viewAt } from './camera'
import { DEFAULT_LOOK, LOOK_KEYS, LOOK_OPTIONS, PRESENTS } from './catalog'
import { Child } from './child'
import { DRAG, Game, PAN_SPEED, readSwitches } from './game'
import { PLOT_W, TRUCK_HOME_X, centre, groundAt, hitTest, houseRect, plotLeft, roomRect, rect, targets, type Rect } from './layout'
import { GOODS, IDLE_PAUSE, PARTS, THEMES, TOOLS, type Action, type Shot } from './model'
import { freshKeep, parseKeep, SAVE_KEY, serializeKeep } from './progress'
import { GLANCE } from './rules'
import { Sounds } from './sounds'

let storage: ReturnType<typeof memorySaves>

beforeEach(() => {
  storage = memorySaves()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Runs `seconds` of frames at 60 a second. */
function run(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.advance(1 / 60)
}

/** Every action the game sends from now on, recorded instead of acted on: the input's own logic, apart from the rules. A finger's touch going down and lifting is left out unless `touches` (it has a test of its own). */
function record(g: Game, touches = false) {
  const got: Action[] = []
  vi.spyOn(g, 'dispatch').mockImplementation((a) => void ((touches || a.kind !== 'touch') && got.push(a)))
  return got
}

const W = 1180
const H = 820

/** The game showing `shot` with no tween running, and the view a stage of W x H would have drawn. */
function showing(g: Game, shot: Shot) {
  g.state.shot = g.state.shotFrom = shot
  g.state.shotAt = -1
  g.setView(viewAt(g.state, simTime(g.state), W, H, 1))
}

const middle = (g: Game, r: Rect) => toScreen(g.view!, r.x + r.w / 2, r.y + r.h / 2)

describe('the URL switches', () => {
  it('reads none, each one, and leaves other parameters alone', () => {
    expect(readSwitches('')).toEqual({ demo: null, nosave: false, seed: null, rich: false, all: false, road: null, autoplay: false })
    expect(readSwitches('?demo=tall&nosave&seed=-42&rich&all&road=hills&autoplay&debug')).toEqual({ demo: 'tall', nosave: true, seed: -42, rich: true, all: true, road: 'hills', autoplay: true })
  })

  it('throws on a bad value or a bad pair, saying what would do', () => {
    for (const bad of ['?demo=castle', '?demo=', '?seed=ten', '?seed=1.5', '?seed=99999999999', '?road=moon', '?road=', '?autoplay', '?autoplay&seed=3']) expect(() => readSwitches(bad), bad).toThrow(/use/)
    expect(() => new Game('?road=moon', 1, storage)).toThrow()
    expect(() => new Game('?autoplay', 1, storage)).toThrow(/nosave/)
  })

  it('lets the scripted child play only with ?autoplay', () => {
    const frame = vi.spyOn(Child.prototype, 'frame')
    run(new Game('?nosave', 1, storage), 1)
    expect(frame).not.toHaveBeenCalled()
    run(new Game('?nosave&autoplay', 1, storage), 1)
    expect(frame).toHaveBeenCalledTimes(60)
  })

  it('starts fresh and unsaved with ?nosave, rich with ?rich, and with every present opened with ?all', () => {
    storage.items.set(SAVE_KEY, serializeKeep({ ...freshKeep(), trips: 5 }))
    const g = new Game('?nosave&rich&all', 1, storage)
    expect(g.state.keep.trips).toBe(0)
    expect(GOODS.every((good) => g.state.keep.goods[good] === 99)).toBe(true)
    expect(g.state.keep.unlocked).toEqual(PRESENTS)
  })

  it('opens a demo on its shot', () => {
    expect(new Game('?demo=mirror', 1, storage).state.shot.kind).toBe('mirror')
    expect(new Game('?demo=room', 1, storage).state.shot.kind).toBe('room')
    expect(new Game('?demo=tall', 1, storage).state.shot).toEqual({ kind: 'plot', plot: 0 })
  })

  it('starts the road asked for at once, from any demo, and on a fresh game as its second trip (the training road is a child\'s own first)', () => {
    for (const search of ['?demo=street&road=beach', '?demo=mirror&road=beach', '?demo=tall&road=beach', '?demo=room&road=beach', '?nosave&road=beach', '?road=beach']) {
      const g = new Game(search, 1, storage)
      expect(g.state.shot.kind, search).toBe('road')
      expect(g.state.road!.def.kind, search).toBe('beach')
    }
    for (const road of ['forest', 'hills'] as const) {
      const g = new Game(`?nosave&road=${road}`, 1, storage)
      expect(g.state.road!.def).toMatchObject({ kind: road, trip: 2 })
    }
    // Without ?road, a fresh game's first trip is still the training road.
    const fresh = new Game('?nosave', 1, storage)
    fresh.dispatch({ kind: 'go' })
    fresh.dispatch({ kind: 'tap', hit: { kind: 'truck' } })
    expect(fresh.state.road!.def).toMatchObject({ kind: 'forest', trip: 1 })
  })
})

describe('the clock', () => {
  it('runs whole 1/60 s steps, at most 0.1 s of them a frame', () => {
    const g = new Game('?nosave', 1, storage)
    expect(g.advance(0.5).steps).toBe(6)
    expect(g.advance(1 / 60).steps).toBe(1)
    expect(g.advance(0.1).steps).toBe(6)
    expect(g.advance(0).steps).toBe(0)
  })

  it('keeps alpha in [0, 1) and loses no time across uneven frames', () => {
    const g = new Game('?nosave', 1, storage)
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let steps = 0
    let seconds = 0
    for (let i = 0; i < 2000; i++) {
      const dt = random() * 0.05
      seconds += dt
      const f = g.advance(dt)
      steps += f.steps
      expect(f.alpha).toBeGreaterThanOrEqual(0)
      expect(f.alpha).toBeLessThan(1)
    }
    expect(Math.abs(steps + g.advance(0).alpha - seconds * 60)).toBeLessThan(1e-6)
    expect(g.state.tick).toBe(steps)
  })

  it('runs nothing while paused, and goes on where it was', () => {
    const g = new Game('?nosave', 1, storage)
    run(g, 1)
    const tick = g.state.tick
    g.pause()
    run(g, 1)
    expect(g.state.tick).toBe(tick)
    g.resume()
    run(g, 1)
    expect(g.state.tick).toBe(tick + 60)
  })

  it('holds the music in the pause menu with the sound running for the menu, and puts the sound to sleep only while the page is hidden', () => {
    const g = new Game('?nosave', 1, storage)
    const held = vi.spyOn(g.audio, 'setPaused')
    const suspend = vi.spyOn(g.audio, 'suspend')
    const resume = vi.spyOn(g.audio, 'resume')
    g.pause()
    expect(held).toHaveBeenLastCalledWith(true)
    g.resume()
    expect(held).toHaveBeenLastCalledWith(false)
    g.away()
    expect(g.paused).toBe(true)
    expect(held).toHaveBeenLastCalledWith(true)
    expect(suspend).not.toHaveBeenCalled()
    g.hide()
    expect(suspend).toHaveBeenCalledTimes(1)
    g.show()
    expect(resume).toHaveBeenCalledTimes(1)
    expect(g.paused).toBe(true)
    expect(held).toHaveBeenLastCalledWith(true)
  })

  it("hands every step's events to the sounds once a frame", () => {
    const g = new Game('?nosave', 1, storage)
    const frame = vi.spyOn(g.audio, 'frame')
    g.dispatch({ kind: 'dice' })
    const f = g.advance(1 / 60)
    expect(f.events.map((e) => e.kind)).toContain('dice')
    expect(frame).toHaveBeenCalledTimes(1)
    expect(frame).toHaveBeenLastCalledWith(g.state, f.events, 1 / 60)
  })

  it('pauses after a minute with no input, and never while the pedal is held', () => {
    const g = new Game('?nosave', 1, storage)
    run(g, IDLE_PAUSE - 1)
    g.poke()
    run(g, IDLE_PAUSE - 1)
    expect(g.paused).toBe(false)
    run(g, 2)
    expect(g.paused).toBe(true)
    const road = new Game('?nosave&road=forest', 1, storage)
    road.pedal('touch', true)
    run(road, IDLE_PAUSE + 2)
    expect(road.paused).toBe(false)
  })

  it('stands still on the Good night card until a tap wakes the street', () => {
    const g = new Game('?demo=street', 1, storage)
    g.dispatch({ kind: 'goodnight' })
    g.state.night!.doneAt = g.state.tick
    run(g, 3)
    expect(g.asleep).toBe(true)
    const tick = g.state.tick
    run(g, 1)
    expect(g.state.tick).toBe(tick)
    g.pause()
    expect(g.paused).toBe(false)
    g.dispatch({ kind: 'wake' })
    run(g, 1)
    expect(g.state.tick).toBe(tick + 60)
  })
})

describe('the save in the browser', () => {
  it('opens a first visit at the mirror, and a saved game on the street', () => {
    expect(new Game('', 1, storage).state.shot.kind).toBe('mirror')
    storage.items.set(SAVE_KEY, serializeKeep({ ...freshKeep(), trips: 3 }))
    const g = new Game('', 1, storage)
    expect(g.state.shot.kind).toBe('street')
    expect(g.state.keep.trips).toBe(3)
  })

  it('writes the keep at most once a second, only when it changed, and at once when the page hides', () => {
    storage.items.set(SAVE_KEY, serializeKeep({ ...freshKeep(), trips: 3 }))
    const g = new Game('', 1, storage)
    const write = vi.spyOn(storage, 'setItem')
    run(g, 2)
    expect(write).not.toHaveBeenCalled()
    g.dispatch({ kind: 'sound', on: false })
    g.dispatch({ kind: 'music', on: false })
    run(g, 0.5)
    run(g, 1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(parseKeep(storage.items.get(SAVE_KEY)!)).toEqual(g.state.keep)
    g.dispatch({ kind: 'sound', on: true })
    g.store(true)
    expect(write).toHaveBeenCalledTimes(2)
    expect(parseKeep(storage.items.get(SAVE_KEY)!).sound).toBe(true)
    run(g, 3)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('reads the save but never writes it in a test run', () => {
    storage.items.set(SAVE_KEY, serializeKeep({ ...freshKeep(), trips: 3 }))
    for (const search of ['?seed=4', '?rich', '?all', '?road=forest', '?demo=street', '?nosave']) {
      const g = new Game(search, 1, storage)
      if (search === '?seed=4') expect(g.state.keep.trips).toBe(3)
      g.dispatch({ kind: 'sound', on: false })
      run(g, 1.5)
      g.store(true)
    }
    expect(parseKeep(storage.items.get(SAVE_KEY)!).trips).toBe(3)
    expect(parseKeep(storage.items.get(SAVE_KEY)!).sound).toBe(true)
  })

  it('keeps the game in memory and warns once when the storage throws', () => {
    const fail = () => {
      throw new Error('private mode')
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = new Game('', 1, { getItem: fail, setItem: fail, removeItem: fail })
    g.dispatch({ kind: 'sound', on: false })
    run(g, 3)
    expect(g.state.keep.sound).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('tells the sounds about the sound and music switches as they change', () => {
    storage.items.set(SAVE_KEY, serializeKeep({ ...freshKeep(), trips: 1, music: false }))
    const setSound = vi.spyOn(Sounds.prototype, 'setSound')
    const setMusic = vi.spyOn(Sounds.prototype, 'setMusic')
    const g = new Game('', 1, storage)
    expect(setMusic).toHaveBeenLastCalledWith(false)
    g.dispatch({ kind: 'sound', on: false })
    expect(setSound).toHaveBeenLastCalledWith(false)
    g.keyDown('KeyM', false)
    expect(setSound).toHaveBeenLastCalledWith(true)
  })
})

describe('pointers on the canvas', () => {
  it('taps what the finger went down on, once it comes up without dragging', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 30 })
    const got = record(g)
    const [x, y] = middle(g, rect(12 + 2.3, -2.6, 2.4, 2.6))
    const hit = hitTest(g.state, g.view!, x, y)
    expect(hit).toEqual({ kind: 'machine', m: 'sawmill' })
    g.pointer('down', x, y, 1)
    g.pointer('move', x + DRAG - 1, y, 1)
    g.pointer('up', x + DRAG - 1, y, 1)
    expect(got).toEqual([{ kind: 'tap', hit }])
  })

  it('pans the street with a drag, and then taps nothing', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 60 })
    const got = record(g)
    const ppm = g.view!.ppm
    g.pointer('down', 600, 400, 1)
    g.pointer('move', 600 + DRAG + 8, 400, 1)
    g.pointer('move', 700, 400, 1)
    g.pointer('up', 700, 400, 1)
    expect(got.map((a) => a.kind)).toEqual(['pan', 'pan'])
    expect((got[1] as { x: number }).x).toBeCloseTo(60 - 100 / ppm)
    // Never past the garage's left wall.
    got.length = 0
    showing(g, { kind: 'street', x: 20 })
    g.pointer('down', 100, 400, 2)
    g.pointer('move', 1100, 400, 2)
    expect((got[0] as { x: number }).x).toBeCloseTo(W / ppm / 2)
  })

  it('starts a drag from where the street really shows, when the rules put the shot past a pan limit', () => {
    const g = new Game('?demo=street', 1, storage)
    // The hint's glide to the truck in the garage asks for its middle, past the garage wall's limit.
    showing(g, { kind: 'street', x: TRUCK_HOME_X })
    const lo = W / g.view!.ppm / 2
    expect(TRUCK_HOME_X).toBeLessThan(lo)
    const got = record(g)
    g.pointer('down', 600, 400, 1)
    g.pointer('move', 600 - DRAG - 8, 400, 1)
    g.pointer('move', 500, 400, 1)
    expect(got.map((a) => a.kind)).toEqual(['pan', 'pan'])
    expect((got[1] as { x: number }).x).toBeCloseTo(lo + 100 / g.view!.ppm)
  })

  it('presses a ghost spot, follows the finger to another, and places the room where it lifts', () => {
    const g = new Game('?demo=street', 1, storage)
    // Plot 2 is a tall house with a wide room on the ground and a small room on it: small rooms fit at (2, 0), (1, 1) and (0, 2).
    showing(g, { kind: 'plot', plot: 2 })
    g.state.shape = 'small'
    const got = record(g)
    const spot = (col: number, row: number) => middle(g, roomRect(2, { shape: 'small', col, row }))
    const [x0, y0] = spot(2, 0)
    const [x1, y1] = spot(1, 1)
    g.pointer('down', x0, y0, 1)
    g.pointer('move', x0 + 3, y0, 1)
    g.pointer('move', x1, y1, 1)
    g.pointer('up', x1, y1, 1)
    const at = (col: number, row: number) => ({ kind: 'spot', plot: 2, col, row }) as const
    expect(got).toEqual([
      { kind: 'press', hit: at(2, 0) },
      { kind: 'press', hit: at(1, 1) },
      { kind: 'tap', hit: at(1, 1) },
      { kind: 'press', hit: null },
    ])
  })

  it('lets go of the press when the finger slides off every spot, and places nothing there', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'plot', plot: 2 })
    g.state.shape = 'small'
    const got = record(g)
    const [x, y] = middle(g, roomRect(2, { shape: 'small', col: 2, row: 0 }))
    g.pointer('down', x, y, 1)
    g.pointer('move', x, 30, 1)
    g.pointer('up', x, 30, 1)
    expect(got).toEqual([
      { kind: 'press', hit: { kind: 'spot', plot: 2, col: 2, row: 0 } },
      { kind: 'press', hit: null },
    ])
  })

  it('takes one finger at a time, none while the camera moves, and none while paused', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 30 })
    const got = record(g)
    g.pointer('down', 300, 400, 1)
    g.pointer('down', 500, 400, 2)
    g.pointer('up', 500, 400, 2)
    g.pointer('up', 300, 400, 1)
    expect(got).toHaveLength(1)
    got.length = 0
    g.state.shotFrom = { kind: 'mirror' }
    g.state.shotAt = g.state.tick
    g.pointer('down', 300, 400, 3)
    g.pointer('up', 300, 400, 3)
    expect(got).toEqual([])
    g.state.shotAt = -1
    g.paused = true
    g.pointer('down', 300, 400, 4)
    g.pointer('up', 300, 400, 4)
    expect(got).toEqual([])
  })

  it('never acts on a question that opened under a held finger: lifting it neither closes the question nor taps', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'plot', plot: 2 })
    g.state.shape = 'small'
    const rooms = g.state.keep.plots[2]!.rooms
    const before = rooms.length
    const [x, y] = middle(g, roomRect(2, { shape: 'small', col: 2, row: 0 }))
    g.pointer('down', x, y, 1)
    expect(g.state.press).not.toBeNull()
    // The crane's "Which room?" for the room before opens while the finger is down.
    const ask = { kind: 'theme', plot: 2, room: rooms[0]!.id } as const
    g.state.ask = ask
    g.pointer('up', x, y, 1)
    expect(g.state.ask).toEqual(ask)
    expect(g.state.keep.plots[2]!.rooms).toHaveLength(before)
    expect(g.state.press).toBeNull()
    // The same on the street, off any spot.
    showing(g, { kind: 'street', x: 30 })
    g.state.ask = null
    const got = record(g)
    g.pointer('down', 300, 400, 2)
    g.state.ask = { kind: 'road' }
    g.pointer('up', 300, 400, 2)
    expect(got).toEqual([])
  })

  it('tells the rules a finger is on the canvas from its down to its lift, however it lifts', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 30 })
    const got = record(g, true)
    const touch = (down: boolean) => ({ kind: 'touch', down }) as const
    // A second finger, or one while the camera moves, is none.
    g.pointer('down', 300, 400, 1)
    g.pointer('down', 500, 400, 2)
    g.pointer('up', 500, 400, 2)
    expect(got).toEqual([touch(true)])
    g.pointer('up', 300, 400, 1)
    expect(got.filter((a) => a.kind === 'touch')).toEqual([touch(true), touch(false)])
    got.length = 0
    g.pointer('down', 300, 400, 3)
    g.pointer('cancel', 300, 400, 3)
    g.pointer('down', 300, 400, 4)
    g.away()
    expect(got).toEqual([touch(true), touch(false), touch(true), touch(false)])
    got.length = 0
    g.resume()
    g.state.shotFrom = { kind: 'mirror' }
    g.state.shotAt = g.state.tick
    g.pointer('down', 300, 400, 5)
    g.pointer('up', 300, 400, 5)
    expect(got).toEqual([])
  })

  it('never moves the camera under a finger held still on the street: the glance comes a beat after it lifts', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 70 })
    const s = g.state
    run(g, 1 / 60)
    // Every machine has goods on its heap: the rainbow one bounces, out of sight. As if it had just come, the camera would glide there a beat later.
    expect(s.hint).toEqual({ kind: 'machine', m: 'rainbow' })
    s.glanceAt = s.tick
    run(g, GLANCE - 0.2)
    g.pointer('down', 600, 150, 1)
    run(g, 3)
    expect(s.shot).toEqual({ kind: 'street', x: 70 })
    g.pointer('cancel', 600, 150, 1)
    run(g, GLANCE - 0.05)
    expect(s.shot).toEqual({ kind: 'street', x: 70 })
    run(g, 0.1)
    expect(s.shot).toEqual({ kind: 'street', x: centre(targets(s).find((t) => t.hit.kind === 'machine' && t.hit.m === 'rainbow')!.rect).x })
  })

  it('lets go of a pressed spot when the pointer is cancelled', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'plot', plot: 2 })
    g.state.shape = 'small'
    const got = record(g)
    const [x, y] = middle(g, roomRect(2, { shape: 'small', col: 0, row: 2 }))
    g.pointer('down', x, y, 1)
    g.pointer('cancel', x, y, 1)
    expect(got.map((a) => a.kind)).toEqual(['press', 'press'])
    expect(got[1]).toEqual({ kind: 'press', hit: null })
  })
})

describe('keys and the pedal', () => {
  it('holds the pedal while any pedal key or finger holds it, and lets go when the last one does', () => {
    const g = new Game('?nosave&road=forest', 1, storage)
    const got = record(g)
    g.keyDown('Space', false)
    g.keyDown('KeyD', false)
    g.pedal('touch', true)
    g.keyUp('Space')
    g.keyUp('KeyD')
    expect(got).toEqual([{ kind: 'pedal', down: true }])
    g.pedal('touch', false)
    expect(got).toEqual([
      { kind: 'pedal', down: true },
      { kind: 'pedal', down: false },
    ])
  })

  it('honks with H, goes home with B, and hits the rock with the pedal keys at a boulder', () => {
    const g = new Game('?nosave&road=forest', 1, storage)
    const road = g.state.road!
    road.stop = road.def.things.findIndex((t) => t.kind === 'boulder')
    g.advance(0)
    expect(g.hud.road!.boulder).toBe(true)
    const got = record(g)
    g.keyDown('KeyH', false)
    g.keyDown('ArrowRight', false)
    g.keyDown('ArrowRight', true)
    g.keyDown('KeyB', false)
    expect(got).toEqual([{ kind: 'horn' }, { kind: 'whack' }, { kind: 'pedal', down: true }, { kind: 'home' }])
  })

  it('lets go of the pedal on a pause, and resumes with Space', () => {
    const g = new Game('?nosave&road=forest', 1, storage)
    const got = record(g)
    g.keyDown('Space', false)
    g.keyDown('Escape', false)
    expect(g.paused).toBe(true)
    expect(got).toEqual([
      { kind: 'pedal', down: true },
      { kind: 'pedal', down: false },
    ])
    g.pedal('touch', true)
    expect(got).toHaveLength(2)
    g.keyDown('Space', false)
    expect(g.paused).toBe(false)
  })

  it('drives the truck with a pedal key or a finger already held as the road appears', () => {
    for (const hold of [(g: Game) => g.keyDown('Space', false), (g: Game) => g.pedal('touch', true)]) {
      const g = new Game('?demo=street', 1, storage)
      hold(g)
      g.dispatch({ kind: 'tap', hit: { kind: 'truck' } })
      expect(g.state.ask).toEqual({ kind: 'road' })
      g.dispatch({ kind: 'road', road: 'hills' })
      expect(g.state.road!.pedal).toBe(true)
      const x = g.state.road!.x
      run(g, 2)
      expect(g.state.road!.x).toBeGreaterThan(x + 1)
    }
  })

  it('lets go of a finger on the pedal on a pause: the pedal looks up, and the next press drives', () => {
    const g = new Game('?nosave&road=forest', 1, storage)
    const v = g.getVersion()
    g.pedal('touch', true)
    expect(g.holds('touch')).toBe(true)
    expect(g.getVersion()).toBeGreaterThan(v)
    g.pause()
    expect(g.holds('touch')).toBe(false)
    expect(g.state.road!.pedal).toBe(false)
    g.pedal('touch', true)
    expect(g.holds('touch')).toBe(false)
    g.resume()
    g.pedal('touch', true)
    expect(g.holds('touch')).toBe(true)
    expect(g.state.road!.pedal).toBe(true)
  })

  it('pans the street with the arrows while they are held', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: 60 })
    g.keyDown('ArrowRight', false)
    run(g, 1)
    expect(g.state.shot).toEqual({ kind: 'street', x: expect.closeTo(60 + PAN_SPEED, 1) })
    g.keyDown('ArrowLeft', false)
    run(g, 0.5)
    g.keyUp('ArrowLeft')
    g.keyUp('ArrowRight')
    run(g, 1)
    expect((g.state.shot as { x: number }).x).toBeCloseTo(60 + PAN_SPEED / 2, 0)
  })

  it('pans with the arrows from where the street really shows, when the rules put the shot past a pan limit', () => {
    const g = new Game('?demo=street', 1, storage)
    showing(g, { kind: 'street', x: TRUCK_HOME_X })
    const lo = W / g.view!.ppm / 2
    g.keyDown('ArrowRight', false)
    run(g, 1 / 60)
    expect((g.state.shot as { x: number }).x).toBeCloseTo(lo + PAN_SPEED / 60)
  })

  it('closes a question with B, the room question leaving the room empty', () => {
    const g = new Game('?demo=street', 1, storage)
    g.state.ask = { kind: 'road' }
    const got = record(g)
    g.keyDown('KeyB', false)
    g.state.ask = { kind: 'theme', plot: 0, room: g.state.keep.plots[0]!.rooms[0]!.id }
    g.keyDown('Backspace', false)
    expect(got).toEqual([{ kind: 'back' }, { kind: 'theme', theme: null }])
  })

  it('takes only its own keys', () => {
    const g = new Game('?nosave', 1, storage)
    expect(g.keyDown('KeyQ', false)).toBe(false)
    expect(g.keyDown('Tab', false)).toBe(false)
    expect(g.keyDown('Space', false)).toBe(true)
  })
})

describe('the HUD', () => {
  it('bumps its version when what it shows changes, and only then', () => {
    const g = new Game('?nosave', 1, storage)
    run(g, 0.1)
    const v = g.getVersion()
    run(g, 1)
    expect(g.getVersion()).toBe(v)
    g.dispatch({ kind: 'tab', part: 'shoes' })
    expect(g.getVersion()).toBe(v + 1)
    expect(g.hud.wardrobe!.tab).toBe('shoes')
    g.dispatch({ kind: 'tab', part: 'shoes' })
    expect(g.getVersion()).toBe(v + 1)
    g.pause()
    expect(g.getVersion()).toBe(v + 2)
  })

  it('sends the back button where it leads: the mirror on the street, home on the road, back elsewhere', () => {
    const street = new Game('?demo=street', 1, storage)
    const road = new Game('?nosave&road=forest', 1, storage)
    const room = new Game('?demo=room', 1, storage)
    const got = [record(street), record(road), record(room)]
    street.backButton()
    road.backButton()
    room.backButton()
    expect(got).toEqual([[{ kind: 'mirror' }], [{ kind: 'home' }], [{ kind: 'back' }]])
  })
})

describe('the canvas', () => {
  /** A stand-in for the stage's canvas: its events, its place on the page and pointer capture. */
  const fakeCanvas = () => Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 10, top: 20 }), setPointerCapture: () => {} }) as unknown as HTMLCanvasElement
  const pointerEvent = (type: string, button: number, x: number, y: number) => Object.assign(new Event(type, { cancelable: true }), { button, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse' })

  it('takes only the primary button, cancels the click after a touch, and lets the browser give a lost context back', () => {
    const g = new Game('?demo=street', 1, storage)
    const pointer = vi.spyOn(g, 'pointer').mockImplementation(() => {})
    const el = fakeCanvas()
    const lost = vi.fn()
    const restored = vi.fn()
    const unlisten = canvasEvents(el, g, { lost, restored })
    el.dispatchEvent(pointerEvent('pointerdown', 2, 110, 120))
    el.dispatchEvent(pointerEvent('pointerdown', 1, 110, 120))
    expect(pointer).not.toHaveBeenCalled()
    el.dispatchEvent(pointerEvent('pointerdown', 0, 110, 120))
    el.dispatchEvent(pointerEvent('pointerup', 0, 110, 120))
    expect(pointer.mock.calls).toEqual([
      ['down', 100, 100, 7],
      ['up', 100, 100, 7],
    ])
    const touch = new Event('touchend', { cancelable: true })
    el.dispatchEvent(touch)
    expect(touch.defaultPrevented).toBe(true)
    // The touchend after a drag cannot be cancelled: trying makes the browser log an error.
    const drag = new Event('touchend', { cancelable: false })
    const cancel = vi.spyOn(drag, 'preventDefault')
    el.dispatchEvent(drag)
    expect(cancel).not.toHaveBeenCalled()
    const loss = new Event('contextlost', { cancelable: true })
    el.dispatchEvent(loss)
    expect(loss.defaultPrevented).toBe(false)
    expect(lost).toHaveBeenCalledTimes(1)
    el.dispatchEvent(new Event('contextrestored'))
    expect(restored).toHaveBeenCalledTimes(1)
    unlisten()
    el.dispatchEvent(pointerEvent('pointerdown', 0, 110, 120))
    expect(pointer).toHaveBeenCalledTimes(2)
  })
})

describe('the HUD over the canvas', () => {
  it('takes a click on a question or the Good night card only when its press started there, once the card has settled', () => {
    // The browser's click after a tap on the canvas: its press was on the canvas.
    expect(layerTakes(1000, null)).toBe(false)
    expect(layerTakes(1000, 1000 + SETTLE * 1000 - 1)).toBe(false)
    expect(layerTakes(1000, 1000 + SETTLE * 1000)).toBe(true)
  })

  it('keeps the hint hand on the screen, pointing from the edge the way to a target off it', () => {
    expect(handAt(300, 200, W, H)).toEqual({ x: 300, y: 200, turn: 0 })
    expect(handAt(1990, 372, W, H)).toEqual({ x: W - 48, y: 372, turn: 90 })
    const left = handAt(-142, 945, 820, 1180)
    expect(left).toMatchObject({ x: 48, y: 945 })
    expect((left.turn + 360) % 360).toBeCloseTo(270)
    expect(handAt(400, 2000, W, H)).toMatchObject({ x: 400, y: H - 48, turn: 180 })
  })

  it('points the hint hand at what shows of a plot on the street, an empty one\'s sign or a house\'s rooms, never at the sky over them', () => {
    const g = new Game('?demo=street', 1, storage)
    const plots = g.state.keep.plots
    /** The screen rect of a world rect on the view drawn. */
    const onScreen = (r: Rect) => {
      const [x0, y0] = toScreen(g.view!, r.x, r.y)
      const [x1, y1] = toScreen(g.view!, r.x + r.w, r.y + r.h)
      return { x0, y0, x1, y1 }
    }
    for (const plot of [2, 3]) {
      showing(g, { kind: 'street', x: plotLeft(plot) + PLOT_W / 2 })
      g.state.hint = { kind: 'plot', plot }
      const at = handFor(g.state, g.view!)!
      expect(at.turn, `plot ${plot}`).toBe(0)
      const p = plots[plot]!
      const rooms = p.rooms.map((room) => onScreen(roomRect(plot, room)))
      const shows = p.kind === null ? onScreen(houseRect(plot, p)) : { x0: Math.min(...rooms.map((r) => r.x0)), y0: Math.min(...rooms.map((r) => r.y0)), x1: Math.max(...rooms.map((r) => r.x1)), y1: Math.max(...rooms.map((r) => r.y1)) }
      expect(at.x, `plot ${plot}`).toBeGreaterThanOrEqual(shows.x0)
      expect(at.x, `plot ${plot}`).toBeLessThanOrEqual(shows.x1)
      expect(at.y, `plot ${plot}`).toBeGreaterThanOrEqual(shows.y0)
      expect(at.y, `plot ${plot}`).toBeLessThanOrEqual(shows.y1)
    }
    // A hint the shot offers no target for shows no hand.
    showing(g, { kind: 'mirror' })
    g.state.hint = { kind: 'truck' }
    expect(handFor(g.state, g.view!)).toBeNull()
  })

  it('shows the road\'s tool button in the tool icon\'s own box, so its twinkle is never cut', () => {
    for (const tool of TOOLS) expect(ToolPic({ tool, animate: true, className: 'pic' }).props.box).toEqual(TOOL_ICON_BOX)
  })

  it('names every wardrobe option in words for a screen reader, in both languages, each its own', () => {
    for (const field of LOOK_KEYS) {
      for (const lang of LANGS) {
        const names = LOOK_OPTIONS[field].map((value) => inLang(optionName({ [field]: value }), lang))
        for (const name of names) expect(name, `${field} in ${lang}`).toMatch(/^\p{Lu}[\p{Ll}-]*( [\p{Ll}-]+)*$|^\p{Lu}-\p{Ll}+$|^\p{Lu}\p{Ll}+ [1-8]$/u)
        expect(new Set(names).size, `${field} in ${lang}`).toBe(names.length)
      }
    }
    expect(optionName({ hairColor: 'darkBrown' })).toEqual({ en: 'Dark brown', fi: 'Tummanruskea' })
  })

  it('shows each wardrobe tab its own part: a sample where the pick is none, the hair bare-headed, the skin and the shirt alone', () => {
    const look = { ...DEFAULT_LOOK, glasses: 'none', bag: 'teddy' } as const
    const tab = Object.fromEntries(PARTS.map((part) => [part, partLook(tabLook(look, part), part)]))
    expect(tab.glasses!.glasses).not.toBe('none')
    expect(partLook(tabLook({ ...look, bag: 'none' }, 'bag'), 'bag').bag).not.toBe('none')
    expect(tab.hair).toMatchObject({ hat: 'none', bag: 'none' })
    expect(tab.skin!.glasses).toBe('none')
    expect(tab.shirt!.bag).toBe('none')
    // Look-alike pairs are drawn from different looks.
    expect(tab.hat).not.toEqual(tab.hair)
    expect(tab.skin).not.toEqual(tab.glasses)
    expect(tab.shirt).not.toEqual(tab.bag)
    // A pick that is worn is what its tab shows.
    expect(tabLook({ ...look, glasses: 'goggles' }, 'glasses').glasses).toBe('goggles')
  })
})

describe('the HUD on every screen', () => {
  /** The iPads and laptops the game is for, and phones on their side. */
  const SCREENS = [
    [1180, 820],
    [820, 1180],
    [1366, 1024],
    [1024, 768],
    [1280, 720],
    [1920, 1000],
  ] as const
  const PHONES = [
    [667, 375],
    [640, 360],
    [844, 390],
  ] as const
  /** Phones held upright. */
  const UPRIGHT = [
    [390, 844],
    [360, 740],
  ] as const
  /** The wardrobe's fullest tabs: the skin's eight options, the hair's seven and eight colours, the shirt's six and ten, the trousers' five and ten. */
  const TABS = [
    [8, 0],
    [7, 8],
    [6, 10],
    [5, 10],
  ] as const

  it('lays a phone on its side out short, and nothing else', () => {
    for (const [w, h] of SCREENS) expect(isShort(w, h), `${w}x${h}`).toBe(false)
    for (const [w, h] of PHONES) expect(isShort(w, h), `${w}x${h}`).toBe(true)
    // A small window that is not a phone's shape keeps the roomy layout.
    expect(isShort(700, 500)).toBe(false)
  })

  it('fits the wardrobe to its panel with every button at least 64 px', () => {
    for (const [w, h] of SCREENS) {
      for (const [options, colours] of TABS) {
        const fit = fitWardrobe(wardrobePanel(insets({ kind: 'mirror' }, w, h), w, h), options, colours)
        expect(fit.tab, `${w}x${h}`).toBeGreaterThanOrEqual(64)
        expect(fit.option, `${w}x${h}`).toBeGreaterThanOrEqual(64)
        expect(fit.colour, `${w}x${h}`).toBe(64)
        expect(fit.cols, `${w}x${h}`).toBe(4)
        expect(fit.stacked, `${w}x${h}`).toBe(false)
      }
    }
  })

  it('fits every option and colour of a tab beside the builder on a phone on its side, with the foot in a row', () => {
    for (const [w, h] of PHONES) {
      const ins = insets({ kind: 'mirror' }, w, h)
      // The builder keeps a good part of the screen.
      expect(w - ins.right, `${w}x${h}`).toBeGreaterThanOrEqual(220)
      const panel = wardrobePanel(ins, w, h)
      for (const [options, colours] of TABS) {
        const fit = fitWardrobe(panel, options, colours)
        const at = `${w}x${h} ${options}+${colours}`
        expect(fit.stacked, at).toBe(false)
        expect(fit.tab, at).toBeGreaterThanOrEqual(44)
        expect(fit.option, at).toBeGreaterThanOrEqual(48)
        expect(fit.colour, at).toBeGreaterThanOrEqual(48)
        expect(fit.colour, at).toBeLessThanOrEqual(56)
        // As styles.css lays it out: 11 px of border and padding, the tabs in two columns of five, 10 px gaps, options 10 px apart in rows 14 px apart, colours 4 px apart in rows 8 px apart, 18 px for the raised pick, the 64 px foot.
        const iw = panel.w - 22
        const ih = panel.h - 22
        expect(5 * fit.tab + 4 * 6, at).toBeLessThanOrEqual(ih)
        const mw = iw - (2 * fit.tab + 6) - 10
        expect(fit.cols * fit.option + (fit.cols - 1) * 10, at).toBeLessThanOrEqual(mw)
        const optionRows = Math.ceil(options / fit.cols)
        const rowsOf = (colour: number) => Math.ceil(colours / Math.floor((mw + 4) / (colour + 4)))
        const colourRows = rowsOf(fit.colour)
        const pick = optionRows * fit.option + (optionRows - 1) * 14 + 18 + (colours === 0 ? 0 : 10 + colourRows * fit.colour + (colourRows - 1) * 8)
        expect(pick + 10 + 64, at).toBeLessThanOrEqual(ih)
        // The colours in two rows at most, as big as the options over them at most.
        expect(colourRows, at).toBeLessThanOrEqual(2)
        expect(fit.colour, at).toBeLessThanOrEqual(fit.option)
      }
    }
    // The colours grow from 48 px with the phone: about 50 px on the smaller ones, their whole 56 px on a wide one.
    const colourOn = (w: number, h: number, options: number, colours: number) => fitWardrobe(wardrobePanel(insets({ kind: 'mirror' }, w, h), w, h), options, colours).colour
    expect(Math.min(colourOn(640, 360, 7, 8), colourOn(640, 360, 6, 10))).toBeGreaterThanOrEqual(49)
    expect(Math.min(colourOn(667, 375, 7, 8), colourOn(667, 375, 6, 10))).toBeGreaterThanOrEqual(51)
    expect(Math.min(colourOn(844, 390, 7, 8), colourOn(844, 390, 6, 10))).toBe(56)
  })

  it('gives a phone on its side a picture big enough to play, the road clear of the pedal', () => {
    for (const [w, h] of PHONES) {
      const at = `${w}x${h}`
      const room = new Game('?demo=room', 1, storage)
      expect(viewAt(room.state, simTime(room.state) + 1, w, h, 1).ppm, at).toBeGreaterThanOrEqual(40)
      const tall = new Game('?demo=tall', 1, storage)
      expect(viewAt(tall.state, simTime(tall.state) + 1, w, h, 1).ppm, at).toBeGreaterThanOrEqual(15)
      // The road's front edge, about 0.8 m in front of the ground line under the truck, stays above the 88 px pedal 10 px off the bottom.
      const road = new Game('?road=forest&nosave', 1, storage)
      const v = viewAt(road.state, simTime(road.state) + 1, w, h, 1)
      const [, front] = toScreen(v, road.state.road!.x, groundAt(road.state.road!.def, road.state.road!.x) + 0.8)
      expect(front, at).toBeLessThanOrEqual(h - 10 - 88)
    }
  })

  it('keeps the room view clear of the room tray, its rows wrapped only where they fit', () => {
    for (const [w, h] of [...SCREENS, ...UPRIGHT]) {
      const at = `${w}x${h}`
      const tray = roomTray(w, h, THEMES.length)
      // Inside the tray's border and padding: the things' row (five things, the pots a 16 px step on, the swap button, 8 px apart) in one line of at most 80 px buttons where 64 px ones fit, else two lines of 64 px buttons 12 px apart.
      const inner = w - 2 * 12 - 2 * 3
      expect(tray.things === 1, at).toBe(8 * 64 + 7 * 8 + 16 <= inner)
      const things = tray.things === 1 ? 80 : 2 * 64 + 12
      // The theme strip: two rows of seven only on an upright window that holds them; otherwise one row, which scrolls ending halfway through a picture.
      if (tray.themes === 2) expect(w < h && 7 * 64 + 6 * 8 <= inner, at).toBe(true)
      else if (tray.strip !== null) {
        expect(tray.strip, at).toBeLessThanOrEqual(inner)
        expect((tray.strip - 32) % 72, at).toBe(0)
        expect(tray.strip + 72, at).toBeGreaterThan(inner)
      }
      const strip = tray.themes * 64 + (tray.themes - 1) * 8
      // The tray's height, each button's 9 px face below included, within the room view's bottom inset.
      expect(3 + 8 + things + 8 + strip + 2 + 6 + 9, at).toBeLessThanOrEqual(insets({ kind: 'room', plot: 0, room: 0 }, w, h).bottom)
    }
    // An upright phone: the things in two lines and a strip that scrolls; an upright iPad: the things in one line and the strip in two rows.
    expect(roomTray(390, 844, THEMES.length)).toEqual({ things: 2, themes: 1, strip: 320 })
    expect(roomTray(360, 740, THEMES.length)).toEqual({ things: 2, themes: 1, strip: 320 })
    expect(roomTray(820, 1180, THEMES.length)).toEqual({ things: 1, themes: 2, strip: null })
    // A few open themes fit a phone's one row whole; a phone on its side shows no strip.
    expect(roomTray(390, 844, 4).strip).toBe(null)
    expect(roomTray(667, 375, THEMES.length)).toEqual({ things: 1, themes: 0, strip: null })
  })

  it('shows every theme card at once on every screen, the phones too, with words big enough to read', () => {
    for (const [w, h] of [...SCREENS, ...PHONES]) {
      const { pic, word } = fitThemeCards(14, w, h)
      // The cards wrap in rows as styles.css lays them out.
      const card = pic + 26
      const perRow = Math.floor((Math.min(w - 32, 960) + 18) / (card + 18))
      const rows = Math.ceil(14 / perRow)
      expect(rows * (pic + 30 + word * 1.1) + (rows - 1) * 22, `${w}x${h}`).toBeLessThanOrEqual(h - 32)
      expect(pic, `${w}x${h}`).toBeGreaterThanOrEqual(h < 520 ? 45 : 90)
      expect(word, `${w}x${h}`).toBeGreaterThanOrEqual(h < 520 ? 14 : 28)
    }
  })
})
