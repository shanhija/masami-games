/**
 * The running game (game.ts): the URL switches, the fixed-step clock, the save in
 * localStorage (when it is written, never in a test run, Start again and Bring back), pause
 * and sessions, keys, the canvas's and the tray's pointers through the router, the sounds'
 * lifecycle, and the HUD's version. Run in node: localStorage is a stand-in, the clock is
 * advanced by hand, and the pointers come in CSS px through a view the stage would draw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startView } from './camera'
import { IDLE_MOST, IDLE_PAUSE, SESSION_GAP } from './catalog'
import { demoState } from './fixtures'
import { Game, readSwitches } from './game'
import { NO_INSETS, toScreen, type View } from './layout'
import { CARDS, type Action } from './model'
import { OLD_KEY, SAVE_KEY, freshKeep, keepOf, parseKeep, parseOld, serializeKeep } from './progress'
import { Sounds } from './sounds'

/** An in-memory stand-in for the browser's localStorage. */
function memoryStorage() {
  const items = new Map<string, string>()
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Runs `seconds` of frames at 60 a second, each with the view a stage of W x H draws. */
function run(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    g.advance(1 / 60)
    show(g)
  }
}

const W = 1180
const H = 820
/** The view the stage draws for the game's state (a sideways window), handed to the game. */
function show(g: Game, w = W, h = H): View {
  const v = startView(w, h, 2, false, NO_INSETS)
  g.setView(v)
  return v
}

/** Every action the game sends from now on, recorded instead of acted on. A finger's touches are left out unless `touches`. */
function record(g: Game, touches = false) {
  const got: Action[] = []
  vi.spyOn(g, 'dispatch').mockImplementation((a) => void ((touches || a.kind !== 'touch') && got.push(a)))
  return got
}

/** A game loaded from the factory's save (not a test run, so it writes), Play pressed. */
function saved(): Game {
  storage.items.set(SAVE_KEY, serializeKeep(keepOf(demoState('factory', 1))))
  const g = new Game('', 1)
  show(g)
  g.play()
  return g
}

describe('the URL switches', () => {
  it('reads none, and each one', () => {
    expect(readSwitches('')).toEqual({ demo: null, nosave: false, seed: null, autoplay: false, debug: false, fast: 1, all: false, munchers: null })
    expect(readSwitches('?demo=busy&nosave&seed=-42&autoplay&debug&fast=4&all&munchers=polite&sheet=things')).toEqual({ demo: 'busy', nosave: true, seed: -42, autoplay: true, debug: true, fast: 4, all: true, munchers: 'polite' })
  })

  it('throws on a bad value or a bad pair, saying what would do', () => {
    for (const bad of ['?demo=castle', '?demo=', '?seed=ten', '?seed=1.5', '?seed=99999999999', '?fast=0', '?fast=100', '?fast=x', '?munchers=lots', '?autoplay', '?autoplay&seed=3']) expect(() => readSwitches(bad), bad).toThrow(/use/)
  })

  it('plays the page with ?autoplay: the scripted child presses Play by itself', () => {
    const g = new Game('?nosave&autoplay&seed=2', 2)
    show(g)
    run(g, 2)
    expect(g.state.playing).toBe(true)
  })

  it('starts fresh with ?nosave whatever is saved, opens a demo, every card with ?all, and the munchers asked for', { timeout: 30_000 }, () => {
    storage.items.set(SAVE_KEY, serializeKeep(keepOf(demoState('factory', 1))))
    expect(new Game('?nosave', 1).state.found).toEqual([])
    expect(new Game('?demo=card-nose', 1).state.found.at(-1)).toBe('nose')
    const all = new Game('?nosave&all', 1).state
    expect([...all.found].sort()).toEqual([...CARDS].sort())
    expect(all.choice).toBe('bubbles')
    expect(new Game('?nosave&munchers=polite', 1).state.switches.munchers).toBe('polite')
  })

  it('reads the save with a switch, but never writes it', () => {
    const text = serializeKeep(keepOf(demoState('factory', 1)))
    storage.items.set(SAVE_KEY, text)
    const g = new Game('?seed=7', 1)
    expect(keepOf(g.state).buildings).toEqual(parseKeep(text).buildings)
    show(g)
    g.play()
    run(g, 3)
    g.openPause()
    g.hide()
    g.startAgain()
    expect(storage.items.get(SAVE_KEY)).toBe(text)
    expect(storage.items.has(OLD_KEY)).toBe(false)
  })
})

describe('the clock', () => {
  it('runs whole 1/60 s steps, at most 6 a frame, and ?fast times as many', () => {
    const g = new Game('?nosave', 1)
    expect(g.advance(0.5).steps).toBe(6)
    expect(g.advance(1 / 60).steps).toBe(1)
    expect(g.advance(0).steps).toBe(0)
    const fast = new Game('?nosave&fast=4', 1)
    expect(fast.advance(1 / 60).steps).toBe(4)
    expect(fast.advance(0.5).steps).toBe(24)
  })

  it('keeps alpha in [0, 1) and loses no time across uneven frames', () => {
    const g = new Game('?nosave', 1)
    const tick0 = g.state.tick
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
    expect(g.state.tick).toBe(tick0 + steps)
  })

  it("hands the frame every step's events in order, and the sounds the same once a frame", () => {
    const g = new Game('?demo=factory', 1)
    const frame = vi.spyOn(g.audio, 'frame')
    const f = g.advance(0.1)
    expect(frame).toHaveBeenCalledTimes(1)
    expect(frame.mock.calls[0]![1]).toBe(f.events)
  })

  it('runs nothing while paused or while the Good night card is up, and goes on where it was', () => {
    const g = new Game('?demo=factory', 1)
    g.openPause()
    const tick = g.state.tick
    expect(g.advance(0.1).steps).toBe(0)
    expect(g.state.tick).toBe(tick)
    g.keepGoing()
    expect(g.advance(0.1).steps).toBe(6)
    const night = new Game('?demo=night', 1)
    night.advance(1 / 60)
    expect(night.asleep).toBe(true)
    expect(night.advance(0.1).steps).toBe(0)
  })
})

describe('the save in the browser', () => {
  it('writes the keep at most every 2 s while the game runs, only when it changed', () => {
    const g = saved()
    const first = storage.items.get(SAVE_KEY)
    run(g, 1.9)
    expect(storage.items.get(SAVE_KEY)).toBe(first)
    run(g, 0.2)
    expect(storage.items.get(SAVE_KEY)).not.toBe(first)
    expect(parseKeep(storage.items.get(SAVE_KEY)!).buildings.map((b) => b.id)).toEqual(keepOf(g.state).buildings.map((b) => b.id))
  })

  it('writes at once on a pause and a page hide', () => {
    const g = saved()
    run(g, 0.5)
    g.openPause()
    expect(storage.items.get(SAVE_KEY)).toBe(serializeKeep(keepOf(g.state)))
    g.keepGoing()
    run(g, 0.5)
    g.hide()
    expect(storage.items.get(SAVE_KEY)).toBe(serializeKeep(keepOf(g.state)))
  })

  it('writes at once after an edit: a belt drawn with the pencil', () => {
    const g = saved()
    run(g, 2.1)
    const before = storage.items.get(SAVE_KEY)
    // Nothing bounces where the finger goes: a touch on the hint's ghost would pick its sticker up.
    g.state.hint = null
    const v = g.view!
    const at = (x: number, y: number) => toScreen(v, x, y)
    g.pointer('down', 1, ...at(2.5, 8.5), 'left')
    g.pointer('move', 1, ...at(3.5, 8.5), 'left')
    g.pointer('move', 1, ...at(4.5, 8.5), 'left')
    g.pointer('up', 1, ...at(4.5, 8.5), 'left')
    run(g, 0.5)
    const after = parseKeep(storage.items.get(SAVE_KEY)!)
    expect(storage.items.get(SAVE_KEY)).not.toBe(before)
    expect(after.belts[8]!.split(' ')[2]).not.toBe('.')
  })

  it('keeps the game in memory and warns once when the storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = new Game('', 1)
    show(g)
    g.play()
    run(g, 5)
    g.openPause()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(g.state.found).toEqual([])
  })

  it('puts the factory aside on Start again, and Bring back swaps it with the new one', () => {
    const g = saved()
    run(g, 1)
    const factory = keepOf(g.state)
    g.openPause()
    g.startAgain()
    expect(g.paused).toBe(false)
    expect(parseOld(storage.items.get(OLD_KEY)!).map((k) => k.buildings)).toEqual([factory.buildings])
    expect(g.old.map((k) => k.buildings)).toEqual([factory.buildings])
    // A Game made now offers it back too.
    expect(new Game('', 2).old[0]!.buildings).toEqual(factory.buildings)
    const fresh = keepOf(g.state)
    g.state.switches.music = false
    g.openPause()
    g.bringBack(0)
    expect(keepOf(g.state).buildings).toEqual(factory.buildings)
    expect(g.state.switches.music).toBe(false)
    expect(g.old.map((k) => k.buildings)).toEqual([fresh.buildings])
    expect(parseOld(storage.items.get(OLD_KEY)!).map((k) => k.buildings)).toEqual([fresh.buildings])
    expect(parseKeep(storage.items.get(SAVE_KEY)!).buildings).toEqual(factory.buildings)
  })

  it('keeps her real factory through a second Start again on the young board, and the last three put aside, newest first', () => {
    const g = saved()
    const factory = keepOf(g.state)
    expect(factory.found.length).toBeGreaterThan(2)
    g.openPause()
    g.startAgain()
    // The young board has found fewer cards and flown nothing: holding the ring again keeps the factory.
    g.openPause()
    g.startAgain()
    expect(g.old.map((k) => k.found)).toEqual([factory.found])
    expect(parseOld(storage.items.get(OLD_KEY)!).map((k) => k.found)).toEqual([factory.found])
    // Bigger factories go in front, and the fourth pushes the oldest out.
    for (const n of [factory.found.length, factory.found.length + 1, factory.found.length + 2]) {
      g.state.found = CARDS.slice(0, n)
      g.openPause()
      g.startAgain()
    }
    expect(g.old.map((k) => k.found.length)).toEqual([factory.found.length + 2, factory.found.length + 1, factory.found.length])
    // An older save held one factory aside, not a list: it is read as one.
    storage.items.set(OLD_KEY, serializeKeep(factory))
    expect(new Game('', 2).old.map((k) => k.found)).toEqual([factory.found])
  })

  it('has nothing to bring back before a Start again', () => {
    const g = new Game('', 1)
    expect(g.old).toEqual([])
    expect(() => g.bringBack(0)).toThrow(/nothing to bring back/)
  })

  it("never writes an old factory over another tab's newer one, and takes the newer save when it is next shown", () => {
    const a = saved()
    run(a, 1)
    a.openPause()
    a.hide()
    // Tab B, the directory opened again, starts a new factory.
    const b = new Game('', 2)
    show(b)
    b.play()
    b.openPause()
    b.startAgain()
    const newer = storage.items.get(SAVE_KEY)!
    expect(parseKeep(newer).found).toEqual([])
    // Tab A, brought back and touched, writes nothing over it.
    a.keepGoing()
    a.state.found.push('gold')
    run(a, 3)
    a.store(true)
    expect(storage.items.get(SAVE_KEY)).toBe(newer)
    expect(a.unsaved).toBe(true)
    // Hidden and shown again, A takes B's factory, at its start card, and saves again.
    a.hide()
    a.show()
    expect([a.state.found, a.paused, a.hud.start]).toEqual([[], false, true])
    expect(a.unsaved).toBe(false)
    // The storage event says so at once: A stops writing then too.
    a.play()
    a.otherTab(SAVE_KEY, 'another tab')
    expect(a.unsaved).toBe(true)
  })

  it('brings back a copy of the save kept as a file, the factory now put aside first, and ignores a file that is no save', () => {
    const g = saved()
    const copy = g.copy()
    const factory = keepOf(g.state)
    g.openPause()
    g.startAgain()
    expect(g.bringBackCopy('a picture, not a save')).toBe(false)
    expect(g.state.found).toEqual([])
    g.openPause()
    expect(g.bringBackCopy(copy)).toBe(true)
    expect([keepOf(g.state).buildings, g.paused]).toEqual([factory.buildings, false])
    expect(parseKeep(storage.items.get(SAVE_KEY)!).buildings).toEqual(factory.buildings)
  })

  it('says it is not saved in a test run and after the storage refused a write, and not otherwise', () => {
    expect(new Game('?nosave', 1).unsaved).toBe(true)
    const g = saved()
    expect(g.unsaved).toBe(false)
    storage.setItem = () => {
      throw new Error('full')
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    g.state.found.push('gold')
    g.store(true)
    expect(g.unsaved).toBe(true)
  })
})

describe('pause and sessions', () => {
  it('pauses with the button, Esc and P, holds the band, and keeps going with them, Enter and Space; the rules hear the menu close', () => {
    const g = new Game('?demo=factory', 1)
    const paused = vi.spyOn(g.audio, 'setPaused')
    const got = record(g)
    g.openPause()
    expect([g.paused, paused.mock.calls.at(-1)]).toEqual([true, [true]])
    g.keyDown('Escape', false, false)
    expect([g.paused, paused.mock.calls.at(-1)]).toEqual([false, [false]])
    expect(got).toEqual([{ kind: 'unpaused' }])
    for (const close of ['KeyP', 'Enter', 'Space']) {
      g.keyDown('KeyP', false, false)
      expect(g.paused).toBe(true)
      g.keyDown(close, false, false)
      expect(g.paused, close).toBe(false)
    }
  })

  it('starts a new session on a return after SESSION_GAP away, paused or hidden', () => {
    const g = new Game('?demo=factory', 1)
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const got = record(g)
    g.openPause()
    now += (SESSION_GAP - 1) * 1000
    g.keepGoing()
    expect(got.splice(0)).toEqual([{ kind: 'unpaused' }])
    g.hide()
    now += SESSION_GAP * 1000
    g.show()
    g.keepGoing()
    expect(got.splice(0)).toEqual([{ kind: 'session' }, { kind: 'unpaused' }])
  })

  it('pauses by itself after IDLE_PAUSE with no input once Play is pressed, never before it, and waits up to IDLE_MOST while machines work for her to watch', { timeout: 30_000 }, () => {
    /** `seconds` of frames of the longest a frame counts (0.1 s), with no input. */
    const idle = (g: Game, seconds: number) => {
      for (let i = 0; i < seconds * 10; i++) g.advance(0.1)
    }
    const start = new Game('?nosave', 1)
    idle(start, IDLE_PAUSE + 1)
    expect(start.paused).toBe(false)
    // Played, with nothing working yet: the start oven has no rocks.
    start.play()
    idle(start, IDLE_PAUSE - 1)
    start.poke()
    idle(start, IDLE_PAUSE - 1)
    expect(start.paused).toBe(false)
    idle(start, 2)
    expect(start.paused).toBe(true)
    // The factory works on untouched: watching it is play, until IDLE_MOST.
    const g = new Game('?demo=factory', 1)
    idle(g, IDLE_PAUSE + 1)
    expect(g.state.buildings.some((b) => b.batch !== null)).toBe(true)
    expect(g.paused).toBe(false)
    idle(g, IDLE_MOST - IDLE_PAUSE)
    expect(g.paused).toBe(true)
  })

  it('pauses when the window goes away, puts the sound to sleep while the page is hidden, and wakes it when it shows', () => {
    const g = new Game('?demo=factory', 1)
    const suspend = vi.spyOn(g.audio, 'suspend')
    const resume = vi.spyOn(g.audio, 'resume')
    g.away()
    expect(g.paused).toBe(true)
    g.keepGoing()
    g.hide()
    expect([g.paused, suspend.mock.calls.length]).toEqual([true, 1])
    g.show()
    expect([g.paused, resume.mock.calls.length]).toEqual([true, 1])
  })

  it('goes to Good night from the menu', () => {
    const g = new Game('?demo=factory', 1)
    const got = record(g)
    g.openPause()
    g.goodnight()
    expect(got).toEqual([{ kind: 'unpaused' }, { kind: 'goodnight' }])
  })

  it('stays asleep at a tap on the Good night card: Beep murmurs and a z floats, and nothing wakes', () => {
    const night = new Game('?demo=night', 1)
    night.advance(1 / 60)
    expect(night.asleep).toBe(true)
    const murmur = vi.spyOn(night.audio, 'ui')
    const got = record(night)
    night.murmur()
    night.keyDown('Space', false, false)
    night.keyDown('Enter', false, false)
    expect(got).toEqual([])
    expect(murmur.mock.calls).toEqual([['murmur'], ['murmur'], ['murmur']])
    expect([night.murmurs, night.asleep]).toEqual([3, true])
  })

  it("brings the morning with the menu's Keep going over the sleeping factory, as a new session; Esc or P on the card opens the menu", () => {
    const night = new Game('?demo=night', 1)
    night.advance(1 / 60)
    const got = record(night)
    night.keyDown('Escape', false, false)
    expect(night.paused).toBe(true)
    night.keepGoing()
    expect(got).toEqual([{ kind: 'wake' }, { kind: 'session' }, { kind: 'unpaused' }])
  })

  it('is a new morning after the still card was left up overnight with the page hidden, and after SESSION_GAP away from a night still falling', () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const night = new Game('?demo=night', 1)
    night.advance(1 / 60)
    night.hide()
    expect(night.paused).toBe(true)
    now += 10 * SESSION_GAP * 1000
    night.show()
    night.keepGoing()
    expect([night.asleep, night.state.night, night.state.sessionAt]).toEqual([false, null, night.state.tick])
    // Put away at dusk, mid tuck-in: back the next day, it is morning, not yesterday's night.
    const dusk = new Game('?demo=factory', 1)
    dusk.openPause()
    dusk.goodnight()
    run(dusk, 3)
    expect(dusk.state.night).not.toBeNull()
    const got = record(dusk)
    dusk.hide()
    now += SESSION_GAP * 1000
    dusk.show()
    dusk.keepGoing()
    expect(got).toEqual([{ kind: 'wake' }, { kind: 'session' }, { kind: 'unpaused' }])
    // A short pause at dusk goes on with the tuck-in.
    const short = new Game('?demo=factory', 1)
    short.openPause()
    short.goodnight()
    run(short, 3)
    short.openPause()
    now += 60 * 1000
    short.keepGoing()
    expect(short.state.night).not.toBeNull()
  })
})

describe('keys', () => {
  it("sends the board's keys to the rules, takes a held key's repeats and does nothing with them, and leaves other keys to the browser", () => {
    const g = new Game('?demo=factory', 1)
    const got = record(g)
    expect(g.keyDown('Digit2', false, false)).toBe(true)
    expect(g.keyDown('Digit2', true, false)).toBe(true)
    expect(g.keyDown('KeyZ', false, true)).toBe(true)
    expect(g.keyDown('KeyR', false, true)).toBe(false)
    expect(g.keyDown('KeyQ', false, false)).toBe(false)
    expect(got).toEqual([{ kind: 'tool', tool: { kind: 'sticker', sticker: 'oven' } }, { kind: 'oops' }])
  })

  it('presses Play on the start card with Enter or Space, and nothing else there', () => {
    const g = new Game('?nosave', 1)
    const got = record(g)
    g.keyDown('Digit1', false, false)
    expect(got).toEqual([])
    g.keyDown('Enter', false, false)
    expect(got).toEqual([{ kind: 'play' }, { kind: 'session' }])
  })

  it('turns the sound off and on from the menu with M, and nothing else on the board meanwhile', () => {
    const g = new Game('?demo=factory', 1)
    g.openPause()
    const got = record(g)
    g.keyDown('KeyM', false, false)
    g.keyDown('Digit1', false, false)
    expect(got).toEqual([{ kind: 'sound', on: false }])
  })

  it('closes the path with Esc rather than pausing', () => {
    const g = new Game('?demo=factory', 1)
    g.openPath()
    g.keyDown('Escape', false, false)
    expect([g.path, g.paused]).toEqual([false, false])
  })
})

describe('pointers', () => {
  it('takes no pointer before the first frame is drawn', () => {
    const g = new Game('?demo=factory', 1)
    const got = record(g, true)
    g.pointer('down', 1, 400, 400, 'left')
    expect(got).toEqual([])
  })

  it('taps what a pointer went down on, through the router, against the view the stage drew', () => {
    const g = new Game('?demo=factory', 1)
    const v = show(g)
    const got = record(g, true)
    const oven = g.state.buildings.find((b) => b.kind === 'oven' && b.x === 6 && b.y === 6)!
    g.pointer('down', 1, ...toScreen(v, 7, 7), 'left')
    g.pointer('up', 1, ...toScreen(v, 7, 7), 'left')
    expect(got).toEqual([{ kind: 'touch', down: true }, { kind: 'tap', hit: { kind: 'building', id: oven.id } }, { kind: 'touch', down: false }])
  })

  it('drops a drag when the window goes upright or back, and tells the rules nothing of the turn', () => {
    const g = new Game('?demo=factory', 1)
    const v = show(g)
    const got = record(g, true)
    show(g)
    expect(got).toEqual([])
    // A stroke on its way, the window goes upright: it is dropped with nothing placed, and the finger's touch is over.
    g.pointer('down', 1, ...toScreen(v, 2.5, 10.5), 'left')
    g.pointer('move', 1, ...toScreen(v, 4.5, 10.5), 'left')
    got.length = 0
    show(g, 820, 1180)
    expect(got).toEqual([{ kind: 'release', commit: false }, { kind: 'touch', down: false }])
    got.length = 0
    show(g, 820, 1180)
    show(g)
    expect(got).toEqual([])
  })

  it("picks a tray sticker dragged out over the board and holds its ghost under the finger", () => {
    const g = new Game('?demo=factory', 1)
    const v = show(g)
    const got = record(g)
    const tray = v.hud.tray!
    g.trayDown(5, 'oven', tray.x + 100, tray.y + 40, 'left')
    g.trayPointer('move', 5, tray.x + 100, tray.y + 20)
    expect(got).toEqual([])
    const [sx, sy] = toScreen(v, 3.5, 8.5)
    g.trayPointer('move', 5, sx, sy)
    expect(got[0]).toEqual({ kind: 'tool', tool: { kind: 'sticker', sticker: 'oven' } })
    expect(got[1]!.kind).toBe('hold')
    // Another pointer's moves are not the tray's.
    g.trayPointer('move', 6, sx + 50, sy)
    expect(got).toHaveLength(2)
  })
})

describe('the sounds and the HUD', () => {
  it('tells the sounds about the switches as they change, and Beep has no voice where the browser cannot speak', () => {
    const sound = vi.spyOn(Sounds.prototype, 'setSound')
    const music = vi.spyOn(Sounds.prototype, 'setMusic')
    const voice = vi.spyOn(Sounds.prototype, 'setVoice')
    const g = new Game('?demo=factory', 1)
    expect([sound.mock.calls.at(-1), music.mock.calls.at(-1), voice.mock.calls.at(-1)]).toEqual([[true], [true], [true]])
    g.dispatch({ kind: 'music', on: false })
    expect(music.mock.calls.at(-1)).toEqual([false])
    expect(g.audio.speaks).toBe(false)
  })

  it('bumps its version when what the HUD shows changes, and only then', () => {
    const g = new Game('?demo=factory', 1)
    show(g)
    g.advance(1 / 60)
    let bumps = 0
    g.subscribe(() => bumps++)
    show(g)
    expect(bumps).toBe(0)
    g.openPause()
    expect(bumps).toBe(1)
    show(g, 1024, 768)
    expect(bumps).toBe(2)
  })

  it("starts today's cards at the load, and again at each new session", () => {
    const g = new Game('?demo=factory', 1)
    expect(g.hud.today).toEqual([])
    g.state.found.push('bubbles')
    g.advance(1 / 60)
    expect(g.hud.today).toEqual(['bubbles'])
  })
})

describe('a fresh save', () => {
  it('is the board as it comes', () => {
    const g = new Game('', 1)
    expect(keepOf(g.state)).toEqual({ ...freshKeep(), second: keepOf(g.state).second })
  })
})
