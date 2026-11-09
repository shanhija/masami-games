import { useEffect, useSyncExternalStore } from 'react'

import { Brain } from './brain/brain'
import type { Job, Link } from './brain/contract'
import { createLink } from './brain/link'
import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast } from './content/index'
import { inLang, LANGS, useLang, type Lang, type Words } from './engine/lang'
import { Library } from './engine/library'
import type { Status } from './engine/protocol'
import { Sim, createWorld } from './engine/sim'
import { ROOMS, type Item, type ItemInfo, type RoomId, type World } from './engine/types'
import type { SceneSource } from './scene/Stage'
import { View } from './scene/zoom'
import { Sounds } from './sounds'
import { Mic, type Listener } from './voice/mic'
import { hearingPrime } from './voice/prime'
import { Speaker } from './voice/speak'

declare global {
  interface Window {
    /** For tests and screenshots: `game.hear('alice hyppää')`, `game.sim.world`. */
    game: Game
  }
}

/** The rooms' save: a new key whenever the saved Item shape changes, so an old save is never misread. */
const ROOMS_KEY = 'silly-billy-rooms-1'
const SETTINGS_KEY = 'silly-billy-settings'
/** World seconds between saves of the rooms. */
const SAVE_EVERY = 5
/** How long the words stay in the bubble after the button is let go, the "?" after nothing was heard, and "No microphone", ms. */
const WORDS_FOR = 2500
const MISSED_FOR = 1500
const BLOCKED_FOR = 3500

export interface Settings {
  sound: boolean
  /** The avatars' answers spoken aloud. */
  spoken: boolean
  /** The language the game is played in: what the child is heard in, and every word shown and said. */
  lang: Lang
}

export const DEFAULT_SETTINGS: Settings = { sound: true, spoken: true, lang: 'fi' }

/** Saved settings read back; anything missing or unreadable is the default. */
export function readSettings(text: string | null): Settings {
  let data: unknown = null
  try {
    data = text === null ? null : JSON.parse(text)
  } catch {
    return DEFAULT_SETTINGS
  }
  const d = (typeof data === 'object' && data !== null ? data : {}) as Partial<Record<keyof Settings, unknown>>
  return {
    sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
    spoken: typeof d.spoken === 'boolean' ? d.spoken : DEFAULT_SETTINGS.spoken,
    lang: LANGS.find((l) => l === d.lang) ?? DEFAULT_SETTINGS.lang,
  }
}

/** What the browser keeps of the rooms between visits: the room everybody is in, and every room's things. */
export interface SavedRooms {
  room: RoomId
  items: Record<RoomId, Item[]>
  nextId: number
}

export function roomsOf(world: World): SavedRooms {
  return { room: world.room, items: Object.fromEntries(ROOMS.map((r) => [r, r === world.room ? world.items : world.away[r]])) as Record<RoomId, Item[]>, nextId: world.nextId }
}

const isItem = (it: unknown): it is Item => {
  if (typeof it !== 'object' || it === null) return false
  const o = it as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.kind === 'string' && ['x', 'y', 'z', 'yaw', 'scale'].every((k) => Number.isFinite(o[k]))
}

/**
 * Saved rooms read back, or null for text this version cannot read. Nobody holds or rides
 * anything in a fresh world, so a thing that was carried when the save was made is let go
 * where it was, and every thing is old (no pop-in).
 */
export function readRooms(text: string): SavedRooms | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as { room?: unknown; items?: unknown; nextId?: unknown }
  const items = d.items as Record<string, unknown> | null | undefined
  if (!ROOMS.includes(d.room as RoomId) || !Number.isFinite(d.nextId) || typeof items !== 'object' || items === null) return null
  if (!ROOMS.every((r) => Array.isArray(items[r]) && items[r].every(isItem))) return null
  const settle = (it: Item): Item => ({ ...it, holder: null, rider: null, loose: it.loose || it.holder !== null, born: -10 })
  return { room: d.room as RoomId, items: Object.fromEntries(ROOMS.map((r) => [r, (items[r] as Item[]).map(settle)])) as Record<RoomId, Item[]>, nextId: d.nextId as number }
}

/** Puts the saved things into a fresh world made in the saved room. */
export function restoreRooms(world: World, saved: SavedRooms) {
  if (world.room !== saved.room) throw new Error(`restoreRooms: the world is in ${world.room}, the save in ${saved.room}`)
  world.items = saved.items[saved.room]
  world.away = { ...saved.items, [saved.room]: [] }
  world.nextId = saved.nextId
}

/** localStorage, which a private window or blocked site data makes throw: then nothing is kept. */
function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    console.warn(`cannot read ${key}:`, e)
    return null
  }
}

function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn(`cannot keep ${key}:`, e)
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What forgetting the newest thing says on the pause card. */
const FORGOT = {
  nothing: { en: 'Nothing new to forget.', fi: 'Ei mitään uutta unohdettavaa.' },
  failed: { en: 'Could not forget it.', fi: 'Unohtaminen ei onnistunut.' },
  gone: (name: Words): Words => ({ en: `${capital(inLang(name, 'en'))} is gone.`, fi: `${capital(inLang(name, 'fi'))} on poissa.` }),
  all: (n: number): Words => ({ en: `Everything made is gone (${n}).`, fi: `Kaikki tehty on poissa (${n}).` }),
}

/**
 * The running game: the library, the sim, the brain, the voice and the sounds; the settings and
 * the rooms kept in the browser; and a version that bumps when anything the HUD shows has
 * changed. The scene reads the world through it every frame (it is the Stage's SceneSource) and
 * calls `advance`; the HUD subscribes to the version.
 */
export class Game implements SceneSource {
  readonly library: Library
  readonly sim: Sim
  readonly link: Link
  readonly brain: Brain
  readonly mic: Mic
  readonly sounds = new Sounds()
  readonly speaker = new Speaker()
  settings: Settings
  /** The dev server's last word on Claude and Whisper, or null without a server. */
  status: Status | null = null
  paused = false
  /** How close the player has zoomed and where they panned: kept only while the page is open. */
  readonly view = new View()
  /** What forgetting the newest thing said, while the pause card is up. */
  forgot: Words | null = null
  /** The words heard while the button is held, then the words it was let go with. */
  private live = ''
  private liveUntil = 0
  private missedAt = -MISSED_FOR
  /** The rooms came from a save, so things of kinds the library no longer has go once it has loaded. */
  private restored: boolean
  private savedAt = 0
  private version = 0
  private listeners = new Set<() => void>()
  /** What the HUD last saw, all of it in one string. */
  private shown = ''
  /** When each job was first seen, in real ms (performance.now). */
  private readonly jobsSeen = new WeakMap<Job, number>()

  constructor() {
    this.settings = readSettings(load(SETTINGS_KEY))
    this.library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
    const text = load(ROOMS_KEY)
    const saved = text === null ? null : readRooms(text)
    const lang = this.settings.lang
    const world = createWorld({ room: saved === null ? 'playground' : saved.room, actors: makeCast(lang), layouts: LAYOUTS, seed: Date.now() >>> 0, lang })
    if (saved !== null) restoreRooms(world, saved)
    this.restored = saved !== null
    this.sim = new Sim(world, this.library)
    this.link = createLink()
    this.mic = new Mic({
      link: this.link,
      lang: () => this.settings.lang,
      // Whisper hears the language better, and writes the names right, when it knows who is here.
      prime: () => hearingPrime(this.settings.lang, this.sim.world.actors.map((a) => a.name)),
      whisperReady: () => this.status !== null && this.status.whisper === 'ready',
      partial: (words) => {
        this.live = words
        this.brain.hearing(words)
        this.bump()
      },
      final: (words) => {
        this.live = words
        this.liveUntil = performance.now() + WORDS_FOR
        void this.brain.hear(words)
        this.bump()
      },
      missed: () => {
        this.live = ''
        this.missedAt = performance.now()
        this.bump()
      },
    })
    this.brain = new Brain({ sim: this.sim, library: this.library, link: this.link, changed: () => this.bump() })
    this.sounds.setMuted(!this.settings.sound)
  }

  // ------------------------------------------------------------------ the scene's view

  get world(): World {
    return this.sim.world
  }

  info(kind: string): ItemInfo {
    return this.library.info(kind)
  }

  get libraryVersion(): number {
    return this.library.version
  }

  // ------------------------------------------------------------------ what the HUD reads

  /** Who hears the big button now: Whisper, the browser, or nobody (then a keyboard button takes its place). */
  get listener(): Listener {
    return this.mic.listener
  }

  /** The words for the bubble over the button, or ''. */
  get words(): string {
    return this.mic.held || performance.now() < this.liveUntil ? this.live : ''
  }

  /** Nothing was heard just now: a small "?", or "No microphone" for a little longer. */
  get missed(): boolean {
    return performance.now() - this.missedAt < (this.mic.blocked ? BLOCKED_FOR : MISSED_FOR)
  }

  /**
   * A job's whole seconds so far, in real time, as the designer works and the brain's waits run:
   * the world's time stops with the frames (a hidden tab) and falls behind on a slow device.
   */
  jobSecs(job: Job): number {
    const now = performance.now()
    let seen = this.jobsSeen.get(job)
    if (seen === undefined) this.jobsSeen.set(job, (seen = now))
    return Math.floor((now - seen) / 1000)
  }

  // ------------------------------------------------------------------ running

  /** Asks the dev server what it has, loads what was made before, and hears `?say=` words. */
  async start() {
    this.status = await this.link.status()
    this.bump()
    void this.watchWhisper()
    await this.brain.start()
    if (this.restored) {
      const w = this.sim.world
      const known = (it: Item) => this.library.items.has(it.kind)
      for (const it of w.items.filter((it) => !known(it))) this.sim.removeItem(it.id)
      for (const room of ROOMS) if (room !== w.room) w.away[room] = w.away[room].filter(known)
    }
    for (const words of new URLSearchParams(location.search).getAll('say')) await this.brain.hear(words)
  }

  /** Whisper wakes on the first status request and takes a few seconds: ask again until it is ready or gone. */
  private async watchWhisper() {
    for (let i = 0; i < 60 && this.status !== null && this.status.whisper === 'starting'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      this.status = await this.link.status()
      this.bump()
    }
  }

  /** One frame: steps the sim unless paused, plays and says what happened, shows the brain what started, finished and failed, keeps the room's bed going, saves now and then, tells the HUD when there is news. */
  advance = (dt: number) => {
    if (!this.paused) this.sim.advance(dt)
    const w = this.sim.world
    for (const name of w.sounds) this.sounds.play(name)
    w.sounds.length = 0
    // Every line of the frame together: given one at a time, each would cut off the one before it.
    if (this.settings.spoken) this.speaker.say(w.speech.map((line) => ({ text: line.text, actor: w.actors.find((a) => a.id === line.actor) ?? null })), this.settings.lang)
    w.speech.length = 0
    this.brain.see(w.events)
    w.events.length = 0
    this.sounds.setRoom(w.room)
    if (w.t - this.savedAt >= SAVE_EVERY) this.save()
    this.bump()
  }

  save() {
    this.savedAt = this.sim.world.t
    keep(ROOMS_KEY, JSON.stringify(roomsOf(this.sim.world)))
  }

  /** Every touch and key (useGame listens on the window): the first one starts the sound and lets the avatars speak (iOS). */
  unlock() {
    this.sounds.unlock()
    this.speaker.unlock()
  }

  /** Words from a test or the console, the same way as from the microphone. */
  hear(words: string) {
    return this.brain.hear(words)
  }

  /** The big button held (true) or let go (false). While paused a press only resumes. */
  talk(on: boolean) {
    if (on) {
      if (this.paused) return this.resume()
      this.speaker.hush()
      this.live = ''
      this.mic.press()
    } else this.mic.release()
    this.duck()
    this.bump()
  }

  /** A portrait or an avatar tapped: the next command without a name goes to it, and it waves if it is free. */
  address = (id: string) => {
    this.brain.addressee = id
    const a = this.sim.world.actors.find((x) => x.id === id)!
    if (a.doing === null && a.queue.length === 0 && a.thinking === null) this.sim.react(id, 'hello')
    this.bump()
  }

  goTo(room: RoomId) {
    if (room !== this.sim.world.room) this.sim.enterRoom(room)
    this.bump()
  }

  /** A command typed in the HUD's box: heard like spoken words. */
  type(text: string) {
    const words = text.trim()
    if (words === '') return
    void this.brain.hear(words)
  }

  async forgetNewest() {
    try {
      const name = await this.brain.forgetNewest()
      this.forgot = name === null ? FORGOT.nothing : FORGOT.gone(name)
    } catch (e) {
      console.warn('forgetting failed:', e)
      this.forgot = FORGOT.failed
    }
    this.bump()
  }

  async forgetAll() {
    try {
      const n = await this.brain.forgetAll()
      this.forgot = n === 0 ? FORGOT.nothing : FORGOT.all(n)
    } catch (e) {
      console.warn('forgetting failed:', e)
      this.forgot = FORGOT.failed
    }
    this.bump()
  }

  /**
   * Changes and keeps the settings. A new language takes over at once: the starting avatars'
   * names, and every word shown and said from now on; what was being shown and said in the other
   * one goes.
   */
  setSettings(change: Partial<Settings>) {
    const world = this.sim.world
    this.settings = { ...this.settings, ...change }
    keep(SETTINGS_KEY, JSON.stringify(this.settings))
    if (this.settings.lang !== world.lang) {
      useLang(world, this.settings.lang)
      for (const a of world.actors) a.bubble = null
      this.speaker.hush()
    }
    this.sounds.setMuted(!this.settings.sound)
    if (!this.settings.spoken) this.speaker.hush()
    this.bump()
  }

  pause() {
    this.paused = true
    this.mic.release()
    this.speaker.hush()
    this.duck()
    this.bump()
  }

  resume() {
    this.paused = false
    this.forgot = null
    this.duck()
    this.bump()
  }

  /** The room's bed goes quiet while the microphone listens and while paused (the scene stops calling `advance` then). */
  private duck() {
    this.sounds.duck(this.mic.held || this.paused)
  }

  /** Bumps the version if anything the HUD shows changed since the last bump. */
  private bump() {
    const w = this.sim.world
    const b = this.brain
    const line = b.lines.at(-1)
    const snapshot = [
      this.paused,
      this.settings.sound,
      this.settings.spoken,
      this.settings.lang,
      this.status === null ? '-' : `${this.status.claude}:${this.status.whisper}`,
      this.listener,
      this.mic.held,
      this.mic.blocked,
      this.words,
      this.missed,
      JSON.stringify(this.forgot),
      w.room,
      // The + and − buttons dim at the ends.
      this.view.goal,
      b.addressee,
      ...w.actors.map((a) => `${a.id}:${a.name}:${a.mood}:${a.thinking !== null}:${a.listening}:${JSON.stringify(a.look)}`),
      line === undefined ? '' : `${line.serial}:${line.status}:${line.by}:${line.took}:${line.words}:${JSON.stringify(line.heard)}`,
      // Each job's seconds so far, so its count goes up.
      ...b.jobs.map((j) => `${j.id}:${j.stage}:${Math.round(j.progress * 20)}:${this.jobSecs(j)}`),
    ].join('|')
    if (snapshot === this.shown) return
    this.shown = snapshot
    this.version += 1
    for (const fn of this.listeners) fn()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getVersion = () => this.version
}

/** Re-renders the caller when anything the HUD shows changes. */
export function useGameView(game: Game) {
  useSyncExternalStore(game.subscribe, game.getVersion)
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

/**
 * What a key pressed on the page does: Space held talks, Esc pauses and resumes. While a text box
 * has the keys (`typing`) every key is the box's own, Space too, and Esc leaves the box.
 */
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey'>, typing: boolean): 'talk' | 'pause' | 'leave' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (typing) return e.key === 'Escape' ? 'leave' : null
  if (e.key === 'Escape') return 'pause'
  return e.code === 'Space' ? 'talk' : null
}

/**
 * Wires the game to the page: starts it, opens `window.game`, the keys (`keyAction`), the first
 * touch or key unlocks the sound, and the rooms are saved when the page goes away.
 */
export function useGame(game: Game) {
  useEffect(() => {
    window.game = game
    void game.start()
    const typing = () => document.activeElement instanceof HTMLInputElement
    // Space started the talking, so letting it go stops it, even if a box took the keys in between.
    let spaceTalks = false
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      game.unlock()
      const action = keyAction(e, typing())
      if (action === null) return
      if (action === 'leave') (document.activeElement as HTMLInputElement).blur()
      else if (action === 'pause') {
        if (game.paused) game.resume()
        else game.pause()
      } else if (!e.repeat) {
        spaceTalks = true
        game.talk(true)
      }
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceTalks) return
      spaceTalks = false
      game.talk(false)
      e.preventDefault()
    }
    // Losing the window mid-word must not leave the microphone open.
    const onBlur = () => {
      spaceTalks = false
      game.talk(false)
    }
    const onPointer = () => game.unlock()
    const onHide = () => game.save()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    // iOS lets sound start only when a touch ends, the others when it starts.
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('pointerup', onPointer)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('pointerup', onPointer)
      window.removeEventListener('pagehide', onHide)
    }
  }, [game])
}
