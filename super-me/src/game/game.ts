import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import { HZ, STEP, since, type EventKind as SoundKind } from '../../../pia-jump/src/game/model'
import { Sounds, type Tune } from '../../../pia-jump/src/game/sounds'
import { REWARDS, START_LOOK, wear, type Look, type Reward } from './closet'
import { LEVELS } from './levels'
import { parseLevel } from './map'
import { KINDS, type Kind, type Level, type Sim, type SimEvent } from './model'
import { FRESH, isOpen, parseSave, serializeSave, type Save } from './progress'
import { choose, createSim, pressBuild, pressJump, releaseJump, setMove, step } from './sim'

// A hot edit to this file or anything it runs reloads the page, so an old game's music never plays on beside a new one (as in Pia Jump).
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/** closet: dressing up. map: the five level cards. play: in a level. */
export type Screen = 'closet' | 'map' | 'play'

/** What one call to `advance` did: how many steps ran, how far into the next step the picture is, and every event of those steps. One object, reused. */
export interface Frame {
  steps: number
  alpha: number
  events: SimEvent[]
}

export type Source = 'keys' | 'touch'
const SOURCES: readonly Source[] = ['keys', 'touch']

/** At most this much real time a frame, so a stall never fast-forwards the level. */
const MAX_FRAME = 0.1
const MAX_STEPS = 12
/** The start card shows this long, unless an input comes first. */
const START_CARD_FOR = 1.6
/** The done phase plays this long (the jingle, the confetti) before the game leaves the level. */
const DONE_HOLD = 1.5
/** This long with no input pauses a level. */
const IDLE_FOR = 60
const SAVE_KEY = 'super-me'

/** Each event's sound: Pia Jump's synth plays them, so they are named by its events. */
const SOUNDS: Record<SimEvent['kind'], SoundKind | null> = {
  jump: 'jump',
  land: 'land',
  skid: 'skid',
  bonk: 'bonk',
  bounce: 'spring',
  climb: 'blow',
  crate: 'star',
  refill: 'ball',
  build: 'bump',
  nope: 'hurt',
  present: 'grow',
  fall: 'fall',
  rescued: 'rescued',
  finish: 'pole',
  done: 'done',
}
/** A cube lands with a thunk and a trampoline with a bloop; planks and ladders knock. */
const BUILD_SOUNDS: Record<Kind, SoundKind> = { plank: 'bump', cube: 'kick', trampoline: 'trap', ladder: 'bump' }

/** The URL switches, read once at load. */
export interface Switches {
  /** ?level=<id or 1-based number>: start in that level whatever the locks, and never write the save. */
  level: number | null
  /** ?all: every level open and every present found, for this visit only (the save is never written). */
  all: boolean
}

export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const text = p.get('level')
  let level: number | null = null
  if (text !== null) {
    const n = /^\d+$/.test(text) ? Number(text) - 1 : -1
    level = n >= 0 && n < LEVELS.length ? n : LEVELS.findIndex((l) => l.id === text)
    if (level < 0) throw new Error(`?level=${text}: use one of ${LEVELS.map((l) => l.id).join(', ')}, or a number from 1 to ${LEVELS.length}`)
  }
  return { level, all: p.has('all') }
}

const parsed: Level[] = []
/** LEVELS[index], parsed once. */
export function levelAt(index: number): Level {
  return (parsed[index] ??= parseLevel(LEVELS[index]!))
}

export function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

/**
 * The running game: the screens, the level and its sim, the person, the presents, the
 * pause, the save, the input from keys and thumbs, and the sounds. The stage reads `level`,
 * `sim`, `look`, `generation`, `screen` and `paused` every frame and calls `advance` once a
 * frame; the HUD subscribes to the version, which bumps whenever something it shows changes.
 */
export class Game {
  readonly audio = new Sounds()
  readonly switches: Switches
  screen: Screen
  level: Level
  sim: Sim
  /** Index into LEVELS of `level`: the one played, or on the map and in the closet the one drifting by behind. */
  index = 0
  paused = false
  /** Bumps whenever a new sim starts: the stage forgets its camera and particles. */
  generation = 0
  save: Save
  look: Look
  found: ReadonlySet<Reward>
  /** Presents found since the closet last showed: they sparkle there. */
  fresh = new Set<Reward>()
  /** Real seconds the page has run, advance's clamped seconds summed: every HUD timer reads it. */
  clock = 0
  startCardUntil = -1
  /** The present opening now and the clock when it did, for the HUD's card, or null. */
  gift: { reward: Reward; at: number } | null = null
  /** Which controls the child has used: each pulses in the first level until it has been. */
  readonly used = { move: false, jump: false, build: false }
  private acc = 0
  private frame: Frame = { steps: 0, alpha: 0, events: [] }
  private version = 0
  private listeners = new Set<() => void>()
  private lastInputAt = 0
  private recorded = false
  private dirs: Record<Source, -1 | 0 | 1> = { keys: 0, touch: 0 }
  private dirAt: Record<Source, number> = { keys: 0, touch: 0 }
  private dirCount = 0
  private jumps = new Set<Source>()
  private storageWarned = false
  /** What the HUD last saw of the values that change on their own. */
  private seen = { card: false, gift: false, phase: '', hand: '', opened: '' }

  private readonly saves: Saves

  /** `search` is the page's query string: the switches (see Switches); `saves` are the player's. */
  constructor(search: string, saves: Saves) {
    this.saves = saves
    this.switches = readSwitches(search)
    this.save = this.loadSave()
    this.audio.setSound(this.save.sound)
    this.audio.setMusic(this.save.music)
    this.look = this.save.look ?? START_LOOK
    this.found = new Set(this.switches.all ? REWARDS : this.save.found)
    const first = this.switches.level ?? Math.max(0, this.nextLevel())
    this.index = first
    this.level = levelAt(first)
    this.sim = createSim(this.level)
    this.screen = this.save.look === null ? 'closet' : 'map'
    if (this.switches.level !== null) this.openLevel(this.switches.level)
  }

  isOpen(index: number): boolean {
    return this.switches.all || isOpen(this.save, index)
  }

  /** The level to play next: the first open one not done, or the last open one when all are. */
  nextLevel(): number {
    const i = LEVELS.findIndex((l, i) => this.isOpen(i) && !this.save.done.includes(l.id))
    return i >= 0 ? i : LEVELS.length - 1
  }

  get startCard() {
    return this.startCardUntil >= 0
  }

  /** The level's ending runs: the controls do nothing. */
  get ending() {
    return this.screen === 'play' && (this.sim.phase === 'finish' || this.sim.phase === 'done')
  }

  /** The first level teaches the controls until it is done: each control pulses until used. */
  get teaching() {
    return this.screen === 'play' && this.index === 0 && !this.save.done.includes(LEVELS[0]!.id)
  }

  // ------------------------------------------------------------------------------------- screens

  /** Starts level `index` from its start: a fresh sim, the start card, its tune. Locks are the caller's business. */
  openLevel(index: number) {
    this.show(index)
    this.screen = 'play'
    this.paused = false
    this.recorded = false
    this.gift = null
    this.startCardUntil = this.clock + START_CARD_FOR
    this.lastInputAt = this.clock
    this.jumps.clear()
    this.feedMove()
    this.audio.ui('start')
    this.bump()
  }

  /** A tap on a level card: in if it is open, a "not yet" if not. */
  tapLevel(index: number) {
    if (!this.isOpen(index)) {
      this.audio.ui('locked')
      return
    }
    this.audio.ui('door')
    this.openLevel(index)
  }

  restart() {
    this.openLevel(this.index)
  }

  toMap() {
    this.screen = 'map'
    this.paused = false
    this.show(this.index)
    this.startCardUntil = -1
    this.bump()
  }

  toCloset() {
    this.screen = 'closet'
    this.paused = false
    this.show(this.index)
    this.audio.ui('tap')
    this.bump()
  }

  /** The closet's Play button: the look is kept, the sparkles are seen, and on to the map. */
  closetDone() {
    this.save = { ...this.save, look: this.look }
    this.storeSave()
    this.fresh.clear()
    this.audio.ui('door')
    this.toMap()
  }

  /** A change in the closet. */
  dress(look: Look) {
    this.look = look
    this.save = { ...this.save, look }
    this.storeSave()
    this.bump()
  }

  /** A UI sound for the closet and the cards. */
  click(kind: 'tap' | 'locked') {
    this.audio.ui(kind)
  }

  /** Level `index` with a fresh sim, for playing or for drifting by behind the cards. */
  private show(index: number) {
    this.index = index
    this.level = levelAt(index)
    this.sim = createSim(this.level)
    this.generation += 1
    this.acc = 0
  }

  /** A present opened: found for good, put on at once, sparkling in the closet. */
  private unwrap(reward: Reward) {
    this.gift = { reward, at: this.clock }
    this.found = new Set([...this.found, reward])
    this.fresh.add(reward)
    this.look = wear(this.look, reward)
    this.save = { ...this.save, look: this.look, found: [...new Set([...this.save.found, reward])] }
    this.storeSave()
  }

  /** The level is done: saved at once. */
  private record() {
    this.recorded = true
    if (!this.save.done.includes(this.level.id)) this.save = { ...this.save, done: [...this.save.done, this.level.id] }
    this.storeSave()
  }

  /** After the done phase: to the closet to try on what the level gave, else to the map with the next level up. */
  private leaveLevel() {
    if (this.fresh.size > 0) {
      this.toCloset()
      return
    }
    this.index = this.nextLevel()
    this.toMap()
  }

  // ------------------------------------------------------------------------------------- pause

  pause() {
    if (this.screen !== 'play' || this.paused) return
    this.paused = true
    setMove(this.sim, 0)
    releaseJump(this.sim)
    this.jumps.clear()
    this.startCardUntil = -1
    this.audio.suspend()
    this.bump()
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.lastInputAt = this.clock
    this.feedMove()
    this.bump()
  }

  togglePause() {
    if (this.paused) this.resume()
    else this.pause()
  }

  /** The page hid or the window lost focus: every held input lets go, the level pauses, the sound sleeps. */
  away() {
    for (const s of SOURCES) this.release(s)
    this.pause()
    this.audio.suspend()
  }

  toggleSound() {
    this.save = { ...this.save, sound: !this.save.sound }
    this.audio.setSound(this.save.sound)
    this.storeSave()
    this.audio.ui('tap')
    this.bump()
  }

  toggleMusic() {
    this.save = { ...this.save, music: !this.save.music }
    this.audio.setMusic(this.save.music)
    this.storeSave()
    this.audio.ui('tap')
    this.bump()
  }

  /** The parent's "start fresh": no person, no presents, no levels done; Sound and Music stay. */
  startFresh() {
    this.save = { ...FRESH, sound: this.save.sound, music: this.save.music }
    this.storeSave()
    this.look = START_LOOK
    this.found = new Set(this.switches.all ? REWARDS : [])
    this.fresh.clear()
    this.audio.ui('fresh')
    this.show(0)
    this.screen = 'closet'
    this.bump()
  }

  // ------------------------------------------------------------------------------------- input

  /** Any input at all: keeps the level from pausing for want of input and puts away the start card. */
  poke() {
    this.lastInputAt = this.clock
    if (this.startCardUntil >= 0) {
      this.startCardUntil = -1
      this.bump()
    }
  }

  /** A source's direction. The sim gets the newest non-zero one. */
  move(source: Source, dir: -1 | 0 | 1) {
    if (dir !== 0 && dir !== this.dirs[source]) this.dirAt[source] = ++this.dirCount
    this.dirs[source] = dir
    if (this.live() && dir !== 0 && !this.used.move) this.use('move')
    this.feedMove()
  }

  direction(): -1 | 0 | 1 {
    let best: Source | null = null
    for (const s of SOURCES) if (this.dirs[s] !== 0 && (best === null || this.dirAt[s] > this.dirAt[best])) best = s
    return best === null ? 0 : this.dirs[best]
  }

  /** A source's jump button: held while any source holds it, pressed when the first one does. */
  jump(source: Source, down: boolean) {
    if (down) {
      if (!this.live()) return
      if (!this.used.jump) this.use('jump')
      if (this.jumps.size === 0) pressJump(this.sim)
      this.jumps.add(source)
    } else if (this.jumps.delete(source) && this.jumps.size === 0) releaseJump(this.sim)
  }

  /** The build button: the chosen block goes down on the next step. */
  build() {
    if (!this.live()) return
    if (!this.used.build) this.use('build')
    pressBuild(this.sim)
  }

  /** A tap on a block in the tray, or a number key: the block the build button puts down. */
  choose(kind: Kind) {
    if (!this.live()) return
    choose(this.sim, kind)
    this.audio.ui('tap')
    this.bump()
  }

  /** The number keys and Q: the next block she holds after the chosen one. */
  chooseNext() {
    const s = this.sim
    const from = KINDS.indexOf(s.chosen)
    for (let i = 1; i <= KINDS.length; i++) {
      const k = KINDS[(from + i) % KINDS.length]!
      if (s.hand[k] > 0) {
        this.choose(k)
        return
      }
    }
  }

  release(source: Source) {
    this.move(source, 0)
    this.jump(source, false)
  }

  /** The player steers the sim now: in a level, not paused. */
  private live() {
    return this.screen === 'play' && !this.paused
  }

  private feedMove() {
    if (this.live()) setMove(this.sim, this.direction())
  }

  private use(control: 'move' | 'jump' | 'build') {
    this.used[control] = true
    this.bump()
  }

  // ------------------------------------------------------------------------------------- the frame

  /** Runs whole sim steps for `seconds` of real time (at most 0.1 s of it), then everything the clock decides. */
  advance(seconds: number): Frame {
    const f = this.frame
    f.events.length = 0
    f.steps = 0
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME)
    this.clock += dt
    if (this.screen === 'play' && !this.paused) {
      this.acc += dt * HZ
      while (this.acc >= 1 - 1e-9 && f.steps < MAX_STEPS) {
        step(this.sim, this.level)
        for (const e of this.sim.events) {
          f.events.push(e)
          const sound = e.kind === 'build' ? BUILD_SOUNDS[KINDS[e.n]!] : SOUNDS[e.kind]
          if (sound) this.audio.play({ kind: sound, x: e.x, y: e.y, n: e.kind === 'finish' ? 5 : e.n })
          if (e.kind === 'present') this.unwrap(this.level.presents[e.n]!.reward)
        }
        this.sim.events.length = 0
        this.acc = Math.max(0, this.acc - 1)
        f.steps += 1
      }
      if (f.steps === MAX_STEPS) this.acc = 0
    }
    f.alpha = this.acc
    this.update()
    return f
  }

  private update() {
    const s = this.sim
    if (this.screen === 'play') {
      if (s.phase === 'done') {
        if (!this.recorded) this.record()
        if (since(s.phaseAt, s.tick * STEP) >= DONE_HOLD) this.leaveLevel()
      } else if (!this.paused && this.clock - this.lastInputAt >= IDLE_FOR) this.pause()
      if (this.startCardUntil >= 0 && this.clock >= this.startCardUntil) this.startCardUntil = -1
      if (this.gift && s.phase !== 'present') this.gift = null
    }
    this.audio.setTune(this.tune(), false)
    this.watch()
  }

  private tune(): Tune {
    if (this.paused) return 'none'
    return this.screen === 'play' ? this.level.id : 'rooms'
  }

  /** Bumps the version when a value the HUD shows has changed on its own. */
  private watch() {
    const seen = this.seen
    const s = this.sim
    const card = this.startCard
    const gift = this.gift !== null
    const phase = s.phase
    const hand = `${s.chosen}${s.hand.plank}${s.hand.cube}${s.hand.trampoline}${s.hand.ladder}`
    const opened = s.opened.join('')
    if (card === seen.card && gift === seen.gift && phase === seen.phase && hand === seen.hand && opened === seen.opened) return
    Object.assign(seen, { card, gift, phase, hand, opened })
    this.bump()
  }

  // ------------------------------------------------------------------------------------- the save

  private loadSave(): Save {
    // Storage can be missing or throw (private modes, blocked cookies): then the game keeps its save in memory.
    try {
      return parseSave(this.saves.getItem(SAVE_KEY))
    } catch (e) {
      this.warnStorage(e)
      return parseSave(null)
    }
  }

  /** Writes the save, except in a tuning run (?level or ?all), which reads the save but never writes it. */
  private storeSave() {
    if (this.switches.level !== null || this.switches.all) return
    try {
      this.saves.setItem(SAVE_KEY, serializeSave(this.save))
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Super Me cannot use the browser storage, so this visit is not remembered:', e)
  }

  private bump() {
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

/** Re-renders the caller when the HUD-visible state changes. */
export function useGameView(game: Game) {
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game
}

const MOVE_KEYS: Record<string, -1 | 1> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ'])
const BUILD_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyX', 'KeyB'])
const CHOOSE_KEYS: Record<string, Kind> = { Digit1: 'plank', Digit2: 'cube', Digit3: 'trampoline', Digit4: 'ladder' }
const OTHER_KEYS = new Set(['Escape', 'KeyP', 'KeyM', 'KeyF', 'Enter', 'KeyQ'])

/**
 * The keyboard and the page around the game. Arrows or A and D move (the last pressed wins
 * while both are down), Space, up, W or Z jump, down, S, X or B build, 1 to 4 choose a
 * block and Q the next one, Esc or P pause, Enter resumes, M is the sound and F full
 * screen. The page hiding, the window losing focus, full screen ending and a return from
 * the back-forward cache all pause the level. Every gesture wakes the audio.
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const moves: (-1 | 1)[] = []
    const jumpKeys = new Set<string>()
    const steer = () => game.move('keys', moves.length > 0 ? moves[moves.length - 1]! : 0)
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || game.screen !== 'play') return
      const code = e.code
      const dir = MOVE_KEYS[code]
      if (dir === undefined && !JUMP_KEYS.has(code) && !BUILD_KEYS.has(code) && !(code in CHOOSE_KEYS) && !OTHER_KEYS.has(code)) return
      e.preventDefault()
      game.poke()
      if (dir !== undefined) {
        if (!moves.includes(dir)) moves.push(dir)
        steer()
        return
      }
      if (e.repeat) return
      if (JUMP_KEYS.has(code)) {
        jumpKeys.add(code)
        game.jump('keys', true)
      } else if (BUILD_KEYS.has(code)) game.build()
      else if (code in CHOOSE_KEYS) game.choose(CHOOSE_KEYS[code]!)
      else if (code === 'KeyQ') game.chooseNext()
      else if (code === 'Escape' || code === 'KeyP') game.togglePause()
      else if (code === 'Enter') game.resume()
      else if (code === 'KeyM') game.toggleSound()
      else if (code === 'KeyF') toggleFullscreen()
    }
    const up = (e: KeyboardEvent) => {
      const dir = MOVE_KEYS[e.code]
      if (dir !== undefined) {
        const i = moves.indexOf(dir)
        if (i >= 0) moves.splice(i, 1)
        steer()
      } else if (jumpKeys.delete(e.code) && jumpKeys.size === 0) game.jump('keys', false)
    }
    // Keys let go while the window was elsewhere are never heard: forget them all.
    const away = () => {
      moves.length = 0
      jumpKeys.clear()
      game.away()
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') away()
    }
    const fullscreen = () => {
      if (!document.fullscreenElement) game.pause()
    }
    const pageshow = (e: PageTransitionEvent) => {
      if (e.persisted) game.away()
    }
    const unlock = () => game.audio.unlock()
    const poke = () => game.poke()
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'] as const
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    window.addEventListener('pageshow', pageshow)
    window.addEventListener('pointerdown', poke, true)
    for (const g of gestures) window.addEventListener(g, unlock, true)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
      window.removeEventListener('pageshow', pageshow)
      window.removeEventListener('pointerdown', poke, true)
      for (const g of gestures) window.removeEventListener(g, unlock, true)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', fullscreen)
    }
  }, [game])
}
