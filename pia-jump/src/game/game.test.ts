import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memorySaves } from '../../../profiles/src/profiles'

import { Game, HOME, homeTimes, readSwitches, roomAt, shoutFor } from './game'
import { ROOMS } from './levels'
import { parseSave, serializeSave, type Save } from './progress'

let storage: ReturnType<typeof memorySaves>

beforeEach(() => {
  storage = memorySaves()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A game already in the first room. */
function inRoom(search = '') {
  const g = new Game(search, storage)
  if (g.screen !== 'play') g.openRoom(0)
  return g
}

/** Runs `seconds` of frames at 60 a second. */
function run(g: Game, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.advance(1 / 60)
}

/** Ends the visit as the sim would, with `stars` taken, and lets the done phase play out. */
function finish(g: Game, stars: number) {
  g.sim.stars = stars
  g.sim.phase = 'done'
  g.sim.phaseAt = g.sim.tick
  run(g, 3)
}

describe('advance', () => {
  it('runs whole 1/120 s steps, at most 0.1 s of them a frame', () => {
    const g = inRoom()
    expect(g.advance(0.5).steps).toBe(12)
    expect(g.advance(1 / 60).steps).toBe(2)
    expect(g.advance(0.1).steps).toBe(12)
    expect(g.advance(0).steps).toBe(0)
  })

  it('runs nothing while paused or off the play screen', () => {
    const g = inRoom()
    g.pause()
    expect(g.advance(0.1).steps).toBe(0)
    g.resume()
    expect(g.advance(0.1).steps).toBe(12)
    g.toRooms()
    expect(g.advance(0.1).steps).toBe(0)
  })

  it('keeps alpha in [0, 1) and loses no time across uneven frames', () => {
    const g = inRoom()
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
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
    expect(Math.abs(steps + g.advance(0).alpha - seconds * 120)).toBeLessThan(1e-6)
  })
})

describe('input from keys and thumbs', () => {
  it('steers by the newest direction still pushed', () => {
    const g = inRoom()
    g.move('keys', 1)
    expect(g.sim.input.move).toBe(1)
    g.move('touch', -1)
    expect(g.sim.input.move).toBe(-1)
    g.move('touch', 0)
    expect(g.sim.input.move).toBe(1)
    g.move('keys', 0)
    expect(g.sim.input.move).toBe(0)
    g.move('touch', 1)
    g.move('keys', -1)
    expect(g.sim.input.move).toBe(-1)
    g.move('keys', 0)
    expect(g.sim.input.move).toBe(1)
  })

  it('holds the jump while any source holds it, and presses it only when the first one does', () => {
    const g = inRoom()
    g.jump('keys', true)
    expect(g.sim.input.jumpHeld).toBe(true)
    g.advance(3 / 120)
    g.jump('touch', true)
    expect(g.sim.input.jumpAt).not.toBe(g.sim.tick)
    g.jump('keys', false)
    expect(g.sim.input.jumpHeld).toBe(true)
    g.jump('touch', false)
    expect(g.sim.input.jumpHeld).toBe(false)
    g.jump('touch', true)
    expect(g.sim.input.jumpAt).toBe(g.sim.tick)
  })

  it('merges the bubble button the same way', () => {
    const g = inRoom('?room=1&form=bubble')
    g.bubble('touch', true)
    g.bubble('keys', true)
    g.bubble('touch', false)
    expect(g.sim.input.bubbleHeld).toBe(true)
    g.release('keys')
    expect(g.sim.input.bubbleHeld).toBe(false)
  })

  it('lets go of everything on a pause, presses nothing from the menu, and steers again on resume', () => {
    const g = inRoom()
    g.move('keys', 1)
    g.jump('touch', true)
    g.pause()
    expect(g.sim.input.move).toBe(0)
    expect(g.sim.input.jumpHeld).toBe(false)
    g.jump('keys', true)
    expect(g.sim.input.jumpHeld).toBe(false)
    g.resume()
    expect(g.sim.input.move).toBe(1)
    expect(g.sim.input.jumpHeld).toBe(false)
  })

  it('remembers which controls she has used', () => {
    const g = inRoom()
    expect(g.used).toEqual({ left: false, right: false, jump: false })
    g.move('touch', -1)
    g.jump('touch', true)
    expect(g.used).toEqual({ left: true, right: false, jump: true })
  })
})

describe('the room screens', () => {
  it('puts the start card away after 1.2 s, or at the first input', () => {
    const g = inRoom()
    expect(g.startCard).toBe(true)
    run(g, 1.3)
    expect(g.startCard).toBe(false)
    g.restart()
    expect(g.startCard).toBe(true)
    g.poke()
    expect(g.startCard).toBe(false)
  })

  it('pauses a room after a minute with no input', () => {
    const g = inRoom()
    run(g, 59)
    g.poke()
    run(g, 59)
    expect(g.paused).toBe(false)
    run(g, 2)
    expect(g.paused).toBe(true)
  })

  it('opens only open cards, and steps the highlight between open ones', () => {
    const g = new Game('', storage)
    expect(g.screen).toBe('rooms')
    run(g, 1)
    g.moveHighlight(1)
    expect(g.highlight).toBe(0)
    expect(g.tapCard(1)).toBe(false)
    expect(g.screen).toBe('rooms')
    expect(g.tapCard(0)).toBe(true)
    expect(g.screen).toBe('play')
    const all = new Game('?all', storage)
    run(all, 1)
    all.moveHighlight(1)
    expect(all.highlight).toBe(1)
    expect(all.room.id).toBe(ROOMS[1]!.id)
  })

  it('brings the kitten home: the visit is saved, the cards come back with the homecoming, the next room opens', () => {
    const g = inRoom()
    const generation = g.generation
    finish(g, 7)
    expect(g.save.found).toEqual([ROOMS[0]!.id])
    expect(g.save.jar).toBe(7)
    expect(parseSave(storage.items.get('pia-jump') ?? null)).toEqual(g.save)
    expect(g.screen).toBe('rooms')
    expect(g.generation).toBeGreaterThan(generation)
    expect(g.homecoming).toMatchObject({ index: 0, stars: 7, jarFrom: 0, opened: 1 })
    expect(g.saying).toBe(true)
    expect(g.tapCard(1)).toBe(false)
    expect(g.highlight).toBe(1)
    const ui = vi.spyOn(g.audio, 'ui')
    run(g, homeTimes(7).padlockAt - 0.1 - (g.clock - g.homecoming!.at))
    expect(ui).not.toHaveBeenCalledWith('door')
    run(g, 0.2)
    expect(ui.mock.calls.filter(([kind]) => kind === 'door')).toHaveLength(1)
    run(g, homeTimes(7).end)
    expect(g.homecoming).toBeNull()
    expect(g.isOpen(1)).toBe(true)
    expect(g.tapCard(1)).toBe(true)
  })

  it('goes to the picnic after the fifth kitten, and back to the cards after it', () => {
    const four: Save = { ...parseSave(null), found: ROOMS.slice(0, 4).map((r) => r.id) }
    storage.items.set('pia-jump', serializeSave(four))
    const g = new Game('', storage)
    expect(g.nextRoom()).toBe(4)
    g.openRoom(4)
    finish(g, 3)
    expect(g.screen).toBe('picnic')
    expect(g.room.id).toBe(ROOMS[4]!.id)
    g.poke()
    expect(g.screen).toBe('picnic')
    run(g, 3.1)
    g.poke()
    expect(g.screen).toBe('rooms')
    expect(g.nextRoom()).toBe(-1)
    expect(ROOMS.every((_, i) => g.isOpen(i))).toBe(true)
  })

  it('opens a locked room for good with the parent gate, and starts fresh keeping Sound and Music', () => {
    const g = new Game('', storage)
    g.unlockRoom(3)
    expect(g.isOpen(3)).toBe(true)
    g.toggleMusic()
    g.startFresh()
    expect(g.save).toEqual({ ...parseSave(null), music: false })
    expect(parseSave(storage.items.get('pia-jump') ?? null)).toEqual(g.save)
  })
})

describe('first-time help', () => {
  it('shows the ghost hand in the first room for 6 s, and again after 10 s with no input', () => {
    const g = inRoom()
    expect(g.teaching).toBe(true)
    expect(g.ghost).toBe(true)
    run(g, 6.1)
    expect(g.ghost).toBe(false)
    run(g, 5)
    g.poke()
    run(g, 9)
    expect(g.ghost).toBe(false)
    run(g, 1.1)
    expect(g.ghost).toBe(true)
  })

  it('teaches nothing in the other rooms, nor once the first kitten is home', () => {
    const g = new Game('', storage)
    g.openRoom(1)
    expect(g.teaching).toBe(false)
    expect(g.ghost).toBe(false)
    storage.items.set('pia-jump', serializeSave({ ...parseSave(null), found: [ROOMS[0]!.id] }))
    const again = inRoom()
    expect(again.teaching).toBe(false)
    expect(again.ghost).toBe(false)
  })
})

describe('the music', () => {
  it("plays the rooms' tune, a room's own tune, and nothing while paused", () => {
    const g = new Game('', storage)
    const tune = vi.spyOn(g.audio, 'setTune')
    const suspend = vi.spyOn(g.audio, 'suspend')
    g.advance(1 / 60)
    expect(tune).toHaveBeenLastCalledWith('rooms', false)
    g.openRoom(0)
    g.advance(1 / 60)
    expect(tune).toHaveBeenLastCalledWith(ROOMS[0]!.id, false)
    g.pause()
    g.advance(1 / 60)
    expect(tune).toHaveBeenLastCalledWith('none', false)
    expect(suspend).toHaveBeenCalled()
  })

  it('fades out on a rooms screen nobody has touched for a minute, and comes back at the next touch', () => {
    const g = new Game('', storage)
    const tune = vi.spyOn(g.audio, 'setTune')
    run(g, 61)
    expect(tune).toHaveBeenLastCalledWith('none', false)
    g.poke()
    g.advance(1 / 60)
    expect(tune).toHaveBeenLastCalledWith('rooms', false)
  })

  it('pauses the room and lets go of everything when the page hides', () => {
    const g = inRoom()
    g.move('touch', 1)
    g.jump('keys', true)
    g.away()
    expect(g.paused).toBe(true)
    g.resume()
    expect(g.sim.input.move).toBe(0)
    expect(g.sim.input.jumpHeld).toBe(false)
  })
})

describe('the save in the browser', () => {
  it('writes every change under one key and reads it back on the next visit', () => {
    const g = new Game('', storage)
    g.toggleSound()
    g.toggleMusic()
    expect(parseSave(storage.items.get('pia-jump') ?? null)).toEqual(g.save)
    const again = new Game('', storage)
    expect(again.save).toEqual(g.save)
    expect(again.audio.sound).toBe(false)
    expect(again.audio.music).toBe(false)
  })

  it('reads but never writes in a tuning run', () => {
    storage.items.set('pia-jump', serializeSave({ ...parseSave(null), jar: 5 }))
    const g = inRoom('?room=garden')
    expect(g.save.jar).toBe(5)
    g.toggleSound()
    finish(g, 4)
    expect(g.save.jar).toBe(9)
    expect(parseSave(storage.items.get('pia-jump') ?? null).jar).toBe(5)
  })

  it('keeps the save in memory and warns once when the storage throws', () => {
    const fail = () => {
      throw new Error('private mode')
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = new Game('', { getItem: fail, setItem: fail, removeItem: fail })
    g.toggleSound()
    g.toggleSound()
    expect(g.save.sound).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('the URL switches', () => {
  it('reads a room by id or number, and the rest', () => {
    expect(readSwitches('')).toEqual({ room: null, x: null, form: null, all: false, autoplay: false })
    expect(readSwitches('?room=kitchen').room).toBe(1)
    expect(readSwitches('?room=3&x=40&form=big&all').room).toBe(2)
    expect(readSwitches('?room=3&x=40&form=big&all')).toMatchObject({ x: 40, form: 'big', all: true })
    expect(readSwitches('?room=roof&autoplay')).toMatchObject({ room: 4, autoplay: true })
  })

  it('throws on a bad value, saying what would do', () => {
    for (const bad of ['?room=attic', '?room=0', '?room=6', '?room=1&x=-3', '?room=1&x=ten', '?room=1&form=giant', '?x=5', '?autoplay', '?room=1&autoplay&x=4']) {
      expect(() => readSwitches(bad), bad).toThrow()
    }
  })

  it('starts her on the nearest floor at or before &x, in &form', () => {
    const room = roomAt(0)
    const gap = room.gaps[0]!
    const g = new Game(`?room=1&x=${gap.col1 - 1}&form=big`, storage)
    expect(g.screen).toBe('play')
    expect(g.sim.hero.x).toBe(gap.col0 - 0.5)
    expect(g.sim.hero.y).toBe(room.floor[gap.col0 - 1])
    expect(g.sim.hero.form).toBe('big')
    expect(() => new Game(`?room=1&x=${room.cols}`, storage)).toThrow()
  })
})

describe('shouts', () => {
  it('shouts on a stomp chain of 3 or more, a spring, a hit and the kitten, and on nothing else', () => {
    const at = { x: 0, y: 0 }
    expect(shoutFor({ kind: 'stomp', ...at, n: 2 })).toBeNull()
    expect(shoutFor({ kind: 'stomp', ...at, n: 3 })).toBe('Wow!')
    expect(shoutFor({ kind: 'spring', ...at, n: 0 })).toBe('Boing!')
    expect(shoutFor({ kind: 'hurt', ...at, n: 0 })).toBe('Oops!')
    expect(shoutFor({ kind: 'shrink', ...at, n: 0 })).toBe('Oops!')
    expect(shoutFor({ kind: 'kitten', ...at, n: 0 })).toBe('Yay!')
    expect(shoutFor({ kind: 'fall', ...at, n: 0 })).toBeNull()
    expect(HOME.say).toBe(1.5)
  })
})
