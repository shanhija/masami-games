import { afterEach, describe, expect, it, vi } from 'vitest'

import { Game, readSwitches, rankOf } from './game'
import type { Saves } from '../../../profiles/src/profiles'
import { STORY } from './jobs'
import { MACHINE_KINDS } from './model'
import type { Recognizer, RecognizerCtor } from './listen'
import { freshSave, parseSave, serializeSave } from './progress'
import type { Save } from './progress'
import { Sounds } from './sounds'

afterEach(() => vi.restoreAllMocks())

/** The seed a fresh save gets in these tests. */
const FRESH_SEED = 4242

const make = (search = '?job=hole1', storage: Saves | null = null) => new Game({ search, storage, recognizer: null, audio: new Sounds(), freshSeed: () => FRESH_SEED })

/** A storage that remembers what it is given. */
function memory(): Saves & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>()
  return { data, writes: 0, getItem: (k) => data.get(k) ?? null, setItem(k, v) { data.set(k, v); this.writes++ }, removeItem: (k) => void data.delete(k) }
}

describe('speech', () => {
  it('hops on a machine name', () => {
    const g = make()
    g.hop('dumper')
    g.sim.events.length = 0
    g.hear('kaivuri')
    expect(g.sim.active).toBe('digger')
    expect(g.sim.events.some((e) => e.kind === 'hop' && e.to === 'digger')).toBe(true)
    expect(g.heard?.understood).toBe(true)
  })

  it('hops and presses on a machine and a verb', () => {
    const g = make()
    g.hear('kippiauto, kippaa')
    expect(g.sim.active).toBe('dumper')
    expect(g.sim.pressNext).toBe(true)
    expect(g.heard?.clauses).toHaveLength(1)
  })

  it('sets what is wanted on the second miss in a row', () => {
    const g = make()
    g.hear('blaablaa')
    expect(g.heard).toMatchObject({ understood: false, wanted: null })
    g.hear('hööpsis')
    expect(g.heard?.understood).toBe(false)
    expect(g.heard?.wanted).not.toBeNull()
    g.hear('kaivuri')
    expect(g.heard?.wanted).toBeNull()
    g.hear('blaablaa')
    expect(g.heard?.wanted).toBeNull()
  })

  it('hears ?say once the game has started', () => {
    const g = make('?say=kippiauto')
    expect(g.screen).toBe('title')
    g.start()
    expect(g.sim.active).toBe('dumper')
  })
})

describe('paint', () => {
  it('buys with coins and paints only what is owned', () => {
    const g = make()
    expect(g.buyPaint('purple')).toBe(false)
    expect(g.save.owned).not.toContain('purple')
    g.sim.score.coins = 150
    expect(g.buyPaint('purple')).toBe(true)
    expect(g.sim.score.coins).toBe(50)
    expect(g.save.coins).toBe(50)
    expect(g.save.owned).toContain('purple')
    expect(g.buyPaint('purple')).toBe(true)
    expect(g.sim.score.coins).toBe(50)
    g.setPaint('digger', 'purple')
    expect(g.save.paints.digger).toBe('purple')
    expect(() => g.setPaint('digger', 'gold')).toThrow('not bought')
  })

  it('opens every paint with ?all, and brings every machine', () => {
    const g = make('?all')
    expect(g.save.owned).toHaveLength(9)
    expect(MACHINE_KINDS.every((k) => g.sim.machines[k].unlocked)).toBe(true)
  })
})

describe('the version', () => {
  it('bumps when the active machine changes and not when nothing did', () => {
    const g = make()
    g.advance(0.05)
    g.advance(0.05)
    const v = g.getVersion()
    g.advance(0.05)
    g.advance(0.05)
    expect(g.getVersion()).toBe(v)
    g.hop('dumper')
    g.advance(0.05)
    expect(g.getVersion()).toBeGreaterThan(v)
  })

  it('tells a subscriber', () => {
    const g = make()
    g.advance(0.05)
    const seen = vi.fn()
    g.subscribe(seen)
    g.setPaused(true)
    expect(seen).toHaveBeenCalled()
  })
})

describe('pause', () => {
  it('stops the sim and not the clock', () => {
    const g = make()
    g.advance(0.1)
    const t = g.sim.time
    g.setPaused(true)
    g.advance(0.1)
    g.advance(0.1)
    expect(g.sim.time).toBe(t)
    expect(g.clock).toBeCloseTo(0.3)
    g.setPaused(false)
    g.advance(0.1)
    expect(g.sim.time).toBeGreaterThan(t)
  })

  it('comes by itself after two minutes with no input', () => {
    const g = make('?job=hole1&mode=easy')
    for (let i = 0; i < 490; i++) g.advance(0.25)
    expect(g.paused).toBe(true)
  })
})

describe('the title and the save', () => {
  it('runs a living valley under the title, and Go starts the real game', () => {
    const g = make('')
    expect(g.screen).toBe('title')
    const first = g.sim
    for (let i = 0; i < 100; i++) g.advance(0.1)
    expect(g.sim).toBe(first)
    expect(g.sim.time).toBeGreaterThan(9)
    expect(g.screen).toBe('title')
    g.start()
    expect(g.screen).toBe('play')
    expect(g.sim).not.toBe(first)
    expect(g.generation).toBe(1)
    expect(g.save.picked).toBe(true)
  })

  it('writes the save on a setting and on a paint, and reads it back', () => {
    const storage = memory()
    const g = make('', storage)
    g.setDriver({ species: 'cat', hat: '#5ec8ff' })
    g.start()
    g.setSound(false)
    const saved = parseSave(storage.data.get('digger-town') ?? null, FRESH_SEED).save
    expect(saved).toMatchObject({ picked: true, sound: false, driver: { species: 'cat' } })
    expect(make('', storage).save).toEqual(saved)
  })

  it('starts a fresh save from the seed it is given, and keeps the generator state in the save', () => {
    const g = make('', memory())
    expect(g.save.seed).toBe(FRESH_SEED)
    expect(g.save.lastTemplate).toBe(-1)
    g.start()
    g.sim.lastTemplate = 3
    g.sim.seed = 777
    g.advance(0.05)
    expect(g.save).toMatchObject({ seed: 777, lastTemplate: 3 })
  })

  it('writes nothing with a switch that says not to', () => {
    const storage = memory()
    const g = make('?job=hole1', storage)
    g.setSound(false)
    g.setMode('pro')
    expect(storage.writes).toBe(0)
    expect(g.screen).toBe('play')
  })

  it('startFresh wipes the save but keeps sound and music', () => {
    const g = make('')
    g.start()
    g.setSound(false)
    g.sim.score.coins = 40
    g.advance(0.1)
    expect(g.save.coins).toBe(40)
    const generation = g.generation
    g.startFresh()
    expect(g.save).toMatchObject({ coins: 0, picked: false, sound: false, music: true })
    expect(g.generation).toBeGreaterThan(generation)
  })

  it('stamps the story before ?job', () => {
    const g = make('?job=walls')
    expect(g.sim.storyDone).toBe(STORY.findIndex((j) => j.id === 'walls'))
    expect(g.sim.machines.dozer.unlocked).toBe(true)
  })
})

describe('switches', () => {
  it('says what would be right when one is bad', () => {
    expect(() => readSwitches('?job=nope')).toThrow('use one of hole1')
    expect(() => readSwitches('?story=999')).toThrow('0 to')
    expect(() => readSwitches('?mode=hard')).toThrow('easy or pro')
    expect(() => readSwitches('?job=hole1&story=2')).toThrow('use one of them')
    expect(readSwitches('?look=digger&world')).toMatchObject({ job: null, autoplay: false })
  })
})

describe('keys', () => {
  it('an arrow key aims the machine six metres ahead and lets go on release', () => {
    const g = make()
    g.setViewYaw(Math.PI)
    const m = g.sim.machines[g.sim.active]
    g.keyDown('ArrowRight')
    g.advance(0.05)
    expect(g.sim.hands.point?.x).toBeCloseTo(m.x + 6)
    expect(g.sim.hands.point?.z).toBeCloseTo(m.z)
    g.keyUp('ArrowRight')
    g.advance(0.05)
    expect(g.sim.hands.point).toBeNull()
  })

  it('numbers hop into the machines that have come', () => {
    const g = make()
    g.keyDown('Digit2')
    expect(g.sim.active).toBe('dumper')
    g.keyDown('Digit9')
    expect(g.sim.active).toBe('dumper')
  })

  it('Space holds the big button in easy mode and lets go', () => {
    const g = make()
    g.keyDown('Space')
    expect(g.sim.hands.action).toBe(true)
    g.keyUp('Space')
    expect(g.sim.hands.action).toBe(false)
  })

  it('pro mode steers with levers and fades a mouse pulse', () => {
    const g = make('?job=hole1&mode=pro')
    g.keyDown('KeyW')
    g.keyDown('KeyA')
    g.keyDown('KeyE')
    g.advance(0.05)
    expect(g.sim.hands.levers).toMatchObject({ drive: 1, steer: 1, a: 1 })
    g.keyUp('KeyW')
    g.keyUp('KeyA')
    g.keyUp('KeyE')
    g.wheel(50)
    g.advance(0.01)
    expect(g.sim.hands.levers.c).toBeLessThan(0)
    for (let i = 0; i < 4; i++) g.advance(0.05)
    expect(g.sim.hands.levers.c).toBe(0)
    g.keyDown('KeyC')
    expect(g.cameraMode).toBe('high')
  })

  it('Escape pauses and lets everything go', () => {
    const g = make()
    g.keyDown('ArrowUp')
    g.advance(0.05)
    g.keyDown('Escape')
    expect(g.paused).toBe(true)
    expect(g.sim.hands.point).toBeNull()
    g.keyDown('Escape')
    expect(g.paused).toBe(false)
  })

  it('M mutes both and unmutes both', () => {
    const g = make()
    g.keyDown('KeyM')
    expect(g.save).toMatchObject({ sound: false, music: false })
    g.keyUp('KeyM')
    g.keyDown('KeyM')
    expect(g.save).toMatchObject({ sound: true, music: true })
  })
})

describe('autoplay', () => {
  it('lets the bot play the first job', () => {
    const g = make('?job=hole1&autoplay')
    for (let i = 0; i < 1200; i++) g.advance(0.1)
    expect(g.sim.storyDone).toBeGreaterThan(STORY.findIndex((j) => j.id === 'hole1'))
  }, 60000)
})

describe('rank', () => {
  it('follows the stars', () => {
    expect(rankOf(freshSave(1)).name).toBe('Helper')
    expect(rankOf({ ...freshSave(1), stars: 26 }).name).toBe('Big Builder')
  })
})

/** A recognizer that records what it is told. */
class FakeRecognizer implements Recognizer {
  static all: FakeRecognizer[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onresult: Recognizer['onresult'] = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  aborted = false
  constructor() {
    FakeRecognizer.all.push(this)
  }
  start() {}
  abort() {
    this.aborted = true
  }
}

/** Sounds that make no audio context (node has none). */
const silent = () => {
  const audio = new Sounds()
  vi.spyOn(audio, 'unlock').mockImplementation(() => {})
  return audio
}
const withVoice = (search: string) => {
  FakeRecognizer.all = []
  return new Game({ search, storage: null, recognizer: FakeRecognizer as unknown as RecognizerCtor, audio: silent(), freshSeed: () => FRESH_SEED })
}
const lastRecognizer = () => FakeRecognizer.all[FakeRecognizer.all.length - 1]

/** A save with a story, coins, stars, a bought paint and a chosen builder. */
const played = (): Save => ({
  ...freshSave(9),
  storyDone: 3,
  moreDone: 2,
  coins: 55,
  stars: 7,
  picked: true,
  paints: { ...freshSave(9).paints, digger: 'purple' },
  owned: [...freshSave(9).owned, 'purple'],
  driver: { species: 'fox', hat: '#ff6fa8' },
})
const withSave = (save: Save) => {
  const storage = memory()
  storage.data.set('digger-town', serializeSave(save))
  return { storage, game: make('', storage) }
}

describe('the old town', () => {
  it('startFresh keeps a save with progress, and restore gives all of it back', () => {
    const { storage, game: g } = withSave(played())
    expect(g.oldTown).toBe(false)
    g.startFresh()
    expect(g.oldTown).toBe(true)
    expect(g.save).toMatchObject({ storyDone: 0, coins: 0, picked: false })
    expect(parseSave(storage.data.get('digger-town-old') ?? null, 1).save).toEqual(played())
    const generation = g.generation
    g.restoreOldTown()
    expect(g.screen).toBe('title')
    expect(g.generation).toBeGreaterThan(generation)
    expect(g.oldTown).toBe(false)
    expect(g.save).toEqual(played())
    expect(parseSave(storage.data.get('digger-town') ?? null, 1).save).toEqual(played())
    expect(storage.data.has('digger-town-old')).toBe(false)
    expect(g.sim.storyDone).toBe(3)
    expect(g.sim.score).toMatchObject({ coins: 55, stars: 7 })
  })

  it('a second startFresh on a save with no progress keeps the first old town', () => {
    const { storage, game: g } = withSave(played())
    g.startFresh()
    g.setDriver({ species: 'cat', hat: '#5ec8ff' })
    g.startFresh()
    expect(g.oldTown).toBe(true)
    expect(parseSave(storage.data.get('digger-town-old') ?? null, 1).save).toEqual(played())
  })

  it('restore with none throws, and the old town is there again after a reload', () => {
    const { storage, game: g } = withSave(freshSave(5))
    expect(() => g.restoreOldTown()).toThrow('no old town')
    g.startFresh()
    expect(g.oldTown).toBe(false)
    expect(storage.data.has('digger-town-old')).toBe(false)
    storage.data.set('digger-town-old', serializeSave(played()))
    expect(make('', storage).oldTown).toBe(true)
  })

  it('keeps an old town that parses with trouble, and copies its text before a new game overwrites it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memory()
    const text = JSON.stringify({ ...played(), mode: 'hard' })
    storage.data.set('digger-town-old', text)
    storage.data.set('digger-town', serializeSave(freshSave(5)))
    const g = make('', storage)
    expect(g.oldTown).toBe(true)
    expect(g.saveTrouble).toBe(false)
    expect(storage.data.get('digger-town-broken')).toBe(text)
    g.restoreOldTown()
    expect(g.save).toEqual(played())
    g.startFresh()
    expect(storage.data.get('digger-town-broken')).toBe(text)
    expect(parseSave(storage.data.get('digger-town-old') ?? null, 1).save).toEqual(played())
  })

  it('does not replace a copy already in the broken key with an old town that has trouble', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memory()
    storage.data.set('digger-town-old', '{broken')
    storage.data.set('digger-town-broken', 'earlier')
    make('', storage)
    expect(storage.data.get('digger-town-broken')).toBe('earlier')
  })

  it('restore keeps what the child built since as the old town, and restoring again swaps back', () => {
    const built = { ...played(), coins: 9, stars: 1 }
    const storage = memory()
    storage.data.set('digger-town', serializeSave(built))
    storage.data.set('digger-town-old', serializeSave({ ...played(), coins: 77 }))
    const g = make('', storage)
    g.restoreOldTown()
    expect(g.save.coins).toBe(77)
    expect(g.oldTown).toBe(true)
    expect(parseSave(storage.data.get('digger-town-old') ?? null, 1).save).toEqual(built)
    g.restoreOldTown()
    expect(g.save).toEqual(built)
    expect(parseSave(storage.data.get('digger-town-old') ?? null, 1).save.coins).toBe(77)
  })

  it('writes nothing on a tuning visit', () => {
    const storage = memory()
    const g = make('?story=3&all', storage)
    g.sim.score.coins = 20
    g.startFresh()
    expect(storage.writes).toBe(0)
    expect(g.oldTown).toBe(false)
  })

  it('shows in the signature', () => {
    const { game: g } = withSave(played())
    const v = g.getVersion()
    g.startFresh()
    expect(g.getVersion()).toBeGreaterThan(v)
  })
})

describe('a save that cannot be read', () => {
  it('keeps the text and tells the parent when the text is not JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memory()
    storage.data.set('digger-town', '{oops')
    const g = make('', storage)
    expect(g.saveTrouble).toBe(true)
    expect(storage.data.get('digger-town-broken')).toBe('{oops')
    expect(g.save).toEqual(freshSave(FRESH_SEED))
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('returns the mended save and leaves saveTrouble false when the copy cannot be written', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memory()
    const text = JSON.stringify({ ...played(), mode: 'hard' })
    storage.data.set('digger-town', text)
    const set = storage.setItem.bind(storage)
    storage.setItem = (k, v) => {
      if (k === 'digger-town-broken') throw new Error('full')
      set(k, v)
    }
    const g = make('', storage)
    expect(g.save).toEqual(played())
    expect(g.saveTrouble).toBe(false)
    expect(storage.data.has('digger-town-broken')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('mends a bad field, keeps the good ones and the text', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memory()
    const text = JSON.stringify({ ...played(), mode: 'hard' })
    storage.data.set('digger-town', text)
    const g = make('', storage)
    expect(g.saveTrouble).toBe(true)
    expect(storage.data.get('digger-town-broken')).toBe(text)
    expect(g.save).toEqual(played())
  })

  it('has no trouble with a save missing a field, or a good one', () => {
    const storage = memory()
    const { golden: _golden, ...older } = played()
    storage.data.set('digger-town', JSON.stringify(older))
    const g = make('', storage)
    expect(g.saveTrouble).toBe(false)
    expect(storage.data.has('digger-town-broken')).toBe(false)
    expect(withSave(played()).game.saveTrouble).toBe(false)
  })
})

describe('the page hiding', () => {
  it('leaves the title running, and its tune sounding, when the page comes back', () => {
    const g = make('')
    g.advance(0.1)
    g.pageHidden(true)
    expect(g.paused).toBe(false)
    g.pageHidden(false)
    const t = g.sim.time
    const loops = vi.spyOn(g.audio, 'setLoops')
    g.advance(2)
    expect(g.paused).toBe(false)
    expect(g.sim.time).toBeGreaterThan(t)
    expect(loops.mock.calls.at(-1)?.[0].tune).toBe('title')
  })

  it('pauses a play, and stays paused for the pause card to resume', () => {
    const g = make()
    g.pageHidden(true)
    expect(g.paused).toBe(true)
    g.pageHidden(false)
    expect(g.paused).toBe(true)
  })

  it('writes the coins earned in a job when the page hides, and not the story position', () => {
    const storage = memory()
    const g = make('', storage)
    g.start()
    const done = g.sim.storyDone
    g.sim.score.coins = 12
    g.sim.score.stars = 1
    g.advance(0.1)
    g.pageHidden(true)
    expect(parseSave(storage.data.get('digger-town') ?? null, 1).save).toMatchObject({ coins: 12, stars: 1, storyDone: done })
  })

  it('writes coins every ten seconds of play, only while they differ from what is written', () => {
    const storage = memory()
    const g = make('', storage)
    g.start()
    g.sim.score.coins = 8
    const writes = storage.writes
    for (let i = 0; i < 38; i++) g.advance(0.25)
    expect(storage.writes).toBe(writes)
    for (let i = 0; i < 4; i++) g.advance(0.25)
    expect(storage.writes).toBe(writes + 1)
    expect(parseSave(storage.data.get('digger-town') ?? null, 1).save.coins).toBe(8)
    for (let i = 0; i < 100; i++) g.advance(0.25)
    expect(storage.writes).toBe(writes + 1)
  })
})

describe('the voice listens only in play', () => {
  it('stops in the shop and comes back, and a new game turns it off', () => {
    const g = withVoice('')
    g.start()
    g.toggleMic()
    lastRecognizer().onstart?.()
    expect(g.voice.state).toBe('on')
    g.openShop()
    expect(lastRecognizer().aborted).toBe(true)
    expect(g.voice.state).not.toBe('on')
    expect(g.voice.state).not.toBe('starting')
    g.closeShop()
    expect(g.voice.state).toBe('starting')
    g.startFresh()
    expect(g.voice.state).toBe('off')
    expect(g.screen).toBe('title')
    g.start()
    expect(g.voice.state).toBe('off')
  })

  it('stays off after the old town comes back, and in a hidden or paused play', () => {
    const { game: g } = (() => {
      FakeRecognizer.all = []
      const storage = memory()
      storage.data.set('digger-town-old', serializeSave(played()))
      return { game: new Game({ search: '', storage, recognizer: FakeRecognizer as unknown as RecognizerCtor, audio: silent(), freshSeed: () => FRESH_SEED }) }
    })()
    g.start()
    g.toggleMic()
    g.pageHidden(true)
    expect(g.voice.state).toBe('off')
    g.pageHidden(false)
    g.setPaused(false)
    expect(g.voice.state).toBe('starting')
    g.startFresh()
    g.restoreOldTown()
    expect(g.voice.state).toBe('off')
  })
})

describe('keys held through a change of machine', () => {
  it('a hop in easy mode does not make pro mode ignore the first key pressed', () => {
    const g = make('?job=hole1&mode=easy')
    g.advance(0.05)
    g.hop('dumper')
    g.advance(0.05)
    g.setMode('pro')
    g.keyDown('KeyE')
    g.advance(0.05)
    expect(g.sim.hands.levers.a).toBe(1)
  })


  it('do nothing until released and pressed again', () => {
    const g = make('?job=hole1&mode=pro')
    g.keyDown('KeyE')
    g.advance(0.05)
    expect(g.sim.hands.levers.a).toBe(1)
    g.hop('dumper')
    g.wheel(50)
    for (let i = 0; i < 10; i++) g.advance(0.05)
    expect(g.sim.hands.levers).toMatchObject({ a: 0, c: 0 })
    expect(g.sim.machines.dumper.bed).toBe(0)
    g.keyUp('KeyE')
    g.advance(0.05)
    g.keyDown('KeyE')
    g.advance(0.05)
    expect(g.sim.hands.levers.a).toBe(1)
    for (let i = 0; i < 10; i++) g.advance(0.05)
    expect(g.sim.machines.dumper.bed).toBeGreaterThan(0)
  })
})
