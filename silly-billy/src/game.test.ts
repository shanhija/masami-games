import { afterEach, describe, expect, it, vi } from 'vitest'

import { memorySaves } from '../../profiles/src/profiles'

import type { Job } from './brain/contract'
import type { LibraryData, Status } from './engine/protocol'
import type { Item, RoomId, World } from './engine/types'
import { DEFAULT_SETTINGS, Game, keyAction, readRooms, readSettings, restoreRooms, roomsOf, type SavedRooms } from './game'
import { ROOM } from './scene/frame'

const item = (id: string, kind: string, extra: Partial<Item> = {}): Item => ({
  id,
  kind,
  x: 1,
  y: 0,
  z: 2,
  yaw: 0.5,
  pitch: 0,
  roll: 0,
  scale: 1,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
  loose: false,
  holder: null,
  rider: null,
  parts: {},
  state: {},
  tint: null,
  born: 3,
  fixed: false,
  ...extra,
})

const world = (room: RoomId, items: Item[], away: Record<RoomId, Item[]>, nextId: number): World => ({
  t: 0,
  lang: 'fi',
  frame: 0,
  room,
  actors: [],
  items,
  away,
  puffs: [],
  sounds: [],
  speech: [],
  events: [],
  nextId,
  rng: 1,
  spotlight: null,
})

const empty = (): Record<RoomId, Item[]> => ({ playground: [], pool: [], forest: [] })

describe('settings', () => {
  it('starts with sound, spoken answers and Finnish', () => {
    expect(readSettings(null)).toEqual({ sound: true, spoken: true, lang: 'fi' })
  })

  it('reads back what was kept and takes the default for anything missing or wrong', () => {
    expect(readSettings(JSON.stringify({ sound: false, spoken: false, lang: 'en' }))).toEqual({ sound: false, spoken: false, lang: 'en' })
    expect(readSettings(JSON.stringify({ sound: false }))).toEqual({ ...DEFAULT_SETTINGS, sound: false })
    expect(readSettings(JSON.stringify({ sound: 'yes', lang: 'sv' }))).toEqual(DEFAULT_SETTINGS)
    expect(readSettings('{not json')).toEqual(DEFAULT_SETTINGS)
    expect(readSettings('42')).toEqual(DEFAULT_SETTINGS)
  })
})

describe('the rooms save', () => {
  const before = world('pool', [item('#i4', 'beach-ball', { tint: '#ff0000', state: { spins: 2 } })], { ...empty(), playground: [item('#i1', 'slide', { fixed: true })], forest: [item('#i2', 'pine'), item('#i3', 'rock')] }, 9)

  it('comes back as it was, every room with its own things', () => {
    const back = readRooms(JSON.stringify(roomsOf(before)))!
    expect(back.room).toBe('pool')
    expect(back.nextId).toBe(9)
    expect(back.items.pool).toEqual([{ ...before.items[0], born: -10 }])
    expect(back.items.playground.map((i) => [i.kind, i.fixed])).toEqual([['slide', true]])
    expect(back.items.forest.map((i) => i.id)).toEqual(['#i2', '#i3'])

    const fresh = world('pool', [item('#i1', 'lounger')], empty(), 30)
    restoreRooms(fresh, back)
    expect(fresh.items.map((i) => i.kind)).toEqual(['beach-ball'])
    expect(fresh.away.playground.map((i) => i.kind)).toEqual(['slide'])
    expect(fresh.away.forest.map((i) => i.kind)).toEqual(['pine', 'rock'])
    expect(fresh.away.pool).toEqual([])
    expect(fresh.nextId).toBe(9)
  })

  it('lets go of what was carried or ridden, and nothing pops in again', () => {
    const held = item('#i5', 'ball', { holder: { actor: 'alice', hand: 'right' }, born: 50 })
    const ridden = item('#i6', 'bicycle', { rider: 'steve' })
    const back = readRooms(JSON.stringify(roomsOf(world('playground', [held, ridden], empty(), 7))))!
    expect(back.items.playground[0]).toMatchObject({ holder: null, rider: null, loose: true, born: -10 })
    expect(back.items.playground[1]).toMatchObject({ holder: null, rider: null, loose: false, born: -10 })
  })

  it('refuses text it cannot read, so the fresh rooms stand', () => {
    const items = { playground: [], pool: [], forest: [] }
    expect(readRooms('not json')).toBeNull()
    expect(readRooms('null')).toBeNull()
    expect(readRooms(JSON.stringify({ room: 'moon', items, nextId: 1 }))).toBeNull()
    expect(readRooms(JSON.stringify({ room: 'pool', items, nextId: 'one' }))).toBeNull()
    expect(readRooms(JSON.stringify({ room: 'pool', items: { playground: [], pool: [] }, nextId: 1 }))).toBeNull()
    expect(readRooms(JSON.stringify({ room: 'pool', items: { ...items, forest: [{ id: '#i1', kind: 'pine', x: 'far' }] }, nextId: 2 }))).toBeNull()
  })

  it('will not put a save into a world made in another room', () => {
    const back = readRooms(JSON.stringify(roomsOf(before)))!
    expect(() => restoreRooms(world('forest', [], empty(), 1), back)).toThrow(/pool/)
  })
})

// ------------------------------------------------------------------ the whole game, booted without a browser

/** The browser as far as the game reaches it: the page's address and a dev server without Claude or Whisper; and the player's saves, kept in memory. */
function browser(search: string) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search })
  const library: LibraryData = { items: [], actions: [], avatars: [], phrases: [] }
  const status: Status = { claude: false, whisper: 'off', models: { interpret: 'haiku', invent: 'opus' } }
  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(url.endsWith('status') ? status : url.endsWith('library') ? library : {}), { status: 200 }))
  return memorySaves()
}

/** Plays `secs` seconds of frames at 60 a second. */
const play = (game: Game, secs: number) => {
  for (let i = 0; i < secs * 60; i++) game.advance(1 / 60)
}

describe('the game', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('boots in the playground, hears ?say= words after starting, and drains what each frame made', async () => {
    const saves = browser('?say=alice%20hypp%C3%A4%C3%A4')
    const game = new Game(saves)
    expect(game.world.room).toBe('playground')
    expect(game.world.actors.map((a) => a.id)).toEqual(expect.arrayContaining(['alice', 'steve', 'mike', 'noora', 'mirri']))
    expect(game.world.items.length).toBeGreaterThan(10)
    expect(game.listener).toBe('none')
    await game.start()
    expect(game.status).toMatchObject({ claude: false, whisper: 'off' })
    expect(game.brain.lines.map((l) => l.words)).toEqual(['alice hyppää'])
    // The jump verb hops three times.
    play(game, 5)
    expect(game.brain.lines[0]!.status).toBe('done')
    expect(game.world.events).toEqual([])
    expect(game.world.sounds).toEqual([])
    expect(game.world.speech).toEqual([])
  })

  it('keeps the rooms every 5 s and gives them back to the next game, without things the library does not know', async () => {
    const saves = browser('')
    const first = new Game(saves)
    await first.start()
    first.goTo('pool')
    play(first, 1)
    const ball = first.sim.makeItem('beach-ball', { x: 2, z: 3 })
    play(first, 5.5)
    const saved = JSON.parse(saves.items.get('silly-billy-rooms-1')!) as SavedRooms
    expect(saved.room).toBe('pool')
    expect(saved.items.pool.map((i) => i.id)).toContain(ball.id)
    // A thing of a kind that was forgotten since.
    saved.items.forest.push({ ...saved.items.forest[0]!, id: '#i999', kind: 'forgotten-thing' })
    saves.items.set('silly-billy-rooms-1', JSON.stringify(saved))

    const second = new Game(saves)
    expect(second.world.room).toBe('pool')
    expect(second.world.items.map((i) => i.id)).toEqual(saved.items.pool.map((i) => i.id))
    expect(second.world.away.forest.map((i) => i.kind)).toContain('forgotten-thing')
    await second.start()
    expect(second.world.away.forest.map((i) => i.kind)).not.toContain('forgotten-thing')
    expect(second.world.away.forest.length).toBe(saved.items.forest.length - 1)
    play(second, 1)
  })

  it('keeps the settings, and a tap on a face makes that one the addressee', async () => {
    const saves = browser('')
    const game = new Game(saves)
    await game.start()
    game.setSettings({ lang: 'en', sound: false })
    expect(new Game(saves).settings).toEqual({ sound: false, spoken: true, lang: 'en' })
    expect(JSON.parse(saves.items.get('silly-billy-settings')!)).toEqual({ sound: false, spoken: true, lang: 'en' })
    game.address('noora')
    expect(game.brain.addressee).toBe('noora')
    // Her face tapped again lets her go, and the camera goes back to the whole room.
    game.view.step(1, game.world.actors)
    game.letGo()
    expect([game.brain.addressee, game.view.goal]).toEqual([null, 0])
    // While the camera is close round someone busy, letting go goes out past it to the whole room; a face tapped or a new command comes back.
    const busy = { x: 4, y: 0, z: -3, r: 6 }
    game.view.update(busy, ROOM, true, 1.5, 1 / 60)
    game.address('noora')
    game.letGo()
    expect([game.view.goal, game.view.outmost]).toEqual([-1, true])
    game.address('noora')
    expect(game.view.goal).toBe(0)
    game.letGo()
    game.type('noora hyppää')
    expect(game.view.goal).toBe(0)
    // Nothing listens here, so holding the button does nothing at all.
    game.talk(true)
    expect([game.mic.held, game.words, game.missed]).toEqual([false, '', false])
    game.talk(false)
  })

  it('counts a job’s seconds on the HUD', async () => {
    const saves = browser('')
    const game = new Game(saves)
    await game.start()
    // An invention in flight: the HUD hears of every new second, though nothing else changes.
    let now = 5000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const job: Job = { kind: 'action', id: 'cartwheel', name: 'cartwheel', nameFi: 'kärrynpyörä', progress: 0.5, stage: 'designing', for: [] }
    game.brain.jobs = [job]
    game.advance(1 / 60)
    const [before, t] = [game.getVersion(), game.world.t]
    // Ten real seconds on a slow device, two frames a second: the world steps at most 4/60 s a frame, the count goes by the clock.
    for (let i = 0; i < 20; i++) {
      now += 500
      game.advance(0.5)
    }
    expect(game.world.t - t).toBeLessThan(1.5)
    expect(game.jobSecs(job)).toBe(10)
    expect(game.getVersion()).toBeGreaterThan(before)
    clock.mockRestore()
  })

  it('stands still while paused, and a command typed in the HUD’s box is heard like spoken words', async () => {
    const saves = browser('')
    const game = new Game(saves)
    await game.start()
    game.pause()
    const t = game.world.t
    play(game, 1)
    expect(game.world.t).toBe(t)
    game.resume()
    const version = game.getVersion()
    game.type('  steve pyöri  ')
    game.type('   ')
    await game.brain.settled()
    expect(game.brain.lines.map((l) => l.words)).toEqual(['steve pyöri'])
    play(game, 1)
    expect(game.world.t).toBeGreaterThan(t)
    expect(game.getVersion()).toBeGreaterThan(version)
  })

  it('tells the HUD when the zoom changes, so its + and − dim at the ends', async () => {
    const saves = browser('')
    const game = new Game(saves)
    await game.start()
    game.advance(1 / 60)
    const version = game.getVersion()
    game.advance(1 / 60)
    expect(game.getVersion()).toBe(version)
    game.view.step(1, game.world.actors)
    game.advance(1 / 60)
    expect(game.getVersion()).toBe(version + 1)
    expect(game.view.goal).toBeGreaterThan(0)
  })

  it('plays in the language of the setting: the starting avatars have its names, and a switch renames them at once', async () => {
    const saves = browser('')
    const game = new Game(saves)
    expect([game.world.lang, ...game.world.actors.map((a) => a.name)]).toEqual(['fi', 'Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri'])
    await game.start()
    game.type('Eetu, pyöri')
    expect(game.brain.lines.at(-1)!.heard).toEqual({ en: 'Steve: spin', fi: 'Eetu: pyöri' })
    expect(game.world.actors.find((a) => a.id === 'steve')!.bubble!.text).toMatch(/^(Okei|Joo|Selvä)!$/)
    game.setSettings({ lang: 'en' })
    expect([game.world.lang, ...game.world.actors.map((a) => a.name)]).toEqual(['en', 'Alice', 'Steve', 'Mike', 'Nora', 'Luna'])
    // What was said in Finnish goes with it.
    expect(game.world.actors.map((a) => a.bubble)).toEqual([null, null, null, null, null])
    // The next game starts in English.
    expect(new Game(saves).world.actors.map((a) => a.name)).toEqual(['Alice', 'Steve', 'Mike', 'Nora', 'Luna'])
    saves.items.clear()
    // Forgetting says so in both languages, for the pause card to show the one played in.
    await game.forgetNewest()
    expect(game.forgot).toEqual({ en: 'Nothing new to forget.', fi: 'Ei mitään uutta unohdettavaa.' })
  })
})

describe('the keys', () => {
  const key = (key: string, code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey', boolean>> = {}) => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, ...mods })

  it('holds Space to talk and Esc pauses, and nothing else is a game key', () => {
    expect(keyAction(key(' ', 'Space'), false)).toBe('talk')
    expect(keyAction(key('Escape', 'Escape'), false)).toBe('pause')
    for (const k of [key('a', 'KeyA'), key('Enter', 'Enter'), key('+', 'Equal'), key('ArrowUp', 'ArrowUp')]) expect(keyAction(k, false)).toBe(null)
    // The browser's own shortcuts stay the browser's.
    expect(keyAction(key(' ', 'Space', { ctrlKey: true }), false)).toBe(null)
    expect(keyAction(key('Escape', 'Escape', { metaKey: true }), false)).toBe(null)
  })

  it('gives every key to the box being typed in, Space too, and Esc only leaves the box', () => {
    for (const k of [key(' ', 'Space'), key('a', 'KeyA'), key('ä', 'Quote'), key('Enter', 'Enter'), key('Backspace', 'Backspace')]) expect(keyAction(k, true)).toBe(null)
    expect(keyAction(key('Escape', 'Escape'), true)).toBe('leave')
  })
})

describe('the voices', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('says every line of a frame, one after another, and the next frame’s lines cut off what is left', async () => {
    // The browser's voice: speak() queues a line, cancel() empties the queue and stops the line being said.
    const queue: string[] = []
    const cut: string[] = []
    vi.stubGlobal('speechSynthesis', { speak: (u: { text: string }) => void queue.push(u.text), cancel: () => void cut.push(...queue.splice(0)), getVoices: () => [{ lang: 'fi-FI' }] })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(readonly text: string) {}
    })
    const saves = browser('')
    // The voice is found when the game's modules load.
    vi.resetModules()
    const fresh = await import('./game')
    const game = new fresh.Game(saves)
    await game.start()
    // "alice ja steve sanokaa hei": both say it in the same step.
    game.world.speech.push({ actor: 'alice', text: 'Hei Steve!' }, { actor: 'steve', text: 'Hei Alice!' })
    game.advance(1 / 60)
    expect([queue, cut]).toEqual([['Hei Steve!', 'Hei Alice!'], []])
    game.world.speech.push({ actor: 'mike', text: 'Moi!' })
    game.advance(1 / 60)
    expect([queue, cut]).toEqual([['Moi!'], ['Hei Steve!', 'Hei Alice!']])
  })
})
