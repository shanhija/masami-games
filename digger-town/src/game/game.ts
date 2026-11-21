import { useEffect, useSyncExternalStore } from 'react'

import type { Lang } from '../../../profiles/src/lang'
import type { Saves } from '../../../profiles/src/profiles'

import { botFrame, createBot } from './bot'
import type { Bot } from './bot'
import { findRecognizer, Voice } from './listen'
import type { RecognizerCtor } from './listen'
import { HOME } from './map'
import { MACHINE_KINDS, PAINTS, RANKS } from './model'
import type { DriverLook, Levers, MachineKind, Mode, PaintId, Sim, SimEvent, Spoken } from './model'
import { STORY } from './jobs'
import { freshSave, hasProgress, parseSave, serializeSave } from './progress'
import type { Save } from './progress'
import { ackCard, actionFace, actionReady, createSim, dropTap, honk, hopTo, leverTap, letGo, say, setAction, setLevers, setMode as setSimMode, setPoint, setViewYaw as setSimViewYaw, stepPointer, stepView, tick } from './sim'
import { QUIET, loopsFor, Sounds, soundsFor } from './sounds'
import type { Loops, TuneId } from './sounds'
import { parseSpeech } from './speech'
import { groundY } from './world'

// A hot edit to anything game-side reloads the page, so an old sim's tune never plays on beside a new one.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

export type Screen = 'title' | 'play' | 'shop'
/** Pro mode's cameras; easy mode has its own. */
export type CameraMode = 'behind' | 'high' | 'cab'
const CAMERAS: readonly CameraMode[] = ['behind', 'high', 'cab']

/** What the HUD shows of the last thing heard. `at` is `Game.clock`; `wanted`, the machine whose word the HUD shows for the parent to read out, is set on the second miss in a row. */
export interface Heard {
  text: string
  clauses: Spoken[]
  understood: boolean
  at: number
  wanted: MachineKind | null
}

/** Seconds a heard card stays up. */
export const HEARD_FOR = 2.5
/** Seconds with no input at all before the game pauses by itself. */
const IDLE_FOR = 120
/** The longest step the sim takes in one frame: a slow frame runs the sim slowly instead of in a jump. */
const MAX_DT = 0.25
/** Seconds a mouse pulse on a lever fades over. */
const PULSE_FOR = 0.1
/** How far ahead of the machine an arrow key aims, in metres. */
const KEY_AHEAD = 6
const SAVE_KEY = 'digger-town'
/** The save a new game wiped, kept so the pause card can bring the old town back. */
const OLD_KEY = 'digger-town-old'
/** The text of a save that could not be read in full, kept for a parent. */
const BROKEN_KEY = 'digger-town-broken'
/** Seconds of play between two saves of coins and stars earned in a job. */
const SAVE_EVERY = 10

/** The URL switches, read once at load (see the README). `?look`, `?animal`, `?world` and `?builds` belong to App and never reach Game. */
export interface Switches {
  /** ?job=<id>: start at that story job with everything before it done. */
  job: string | null
  /** ?story=<n>: start with n story jobs done. */
  story: number | null
  /** ?autoplay: the tap bot plays. */
  autoplay: boolean
  /** ?mode=pro or easy. */
  mode: Mode | null
  /** ?fresh: a fresh save for this visit. */
  fresh: boolean
  /** ?all: every machine come and every paint open. */
  all: boolean
  /** ?say=<words>: heard once the game has started. */
  say: string | null
  /** ?stats: the stage reads its numbers out. */
  stats: boolean
}

/** Reads the switches from a query string. A bad value throws, saying what would be right. */
export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const job = p.get('job')
  const ids = STORY.map((j) => j.id)
  if (job !== null && !ids.includes(job)) throw new Error(`?job=${job}: use one of ${ids.join(', ')}`)
  const storyText = p.get('story')
  let story: number | null = null
  if (storyText !== null) {
    story = /^\d+$/.test(storyText) ? Number(storyText) : -1
    if (story < 0 || story > STORY.length) throw new Error(`?story=${storyText}: use a number from 0 to ${STORY.length}`)
  }
  if (job !== null && story !== null) throw new Error('?job and ?story both say where to start: use one of them')
  const modeText = p.get('mode')
  if (modeText !== null && modeText !== 'easy' && modeText !== 'pro') throw new Error(`?mode=${modeText}: use easy or pro`)
  const say = p.get('say')
  if (say !== null && say.trim() === '') throw new Error('?say= needs some words, such as ?say=kaivuri')
  return { job, story, autoplay: p.has('autoplay'), mode: modeText, fresh: p.has('fresh'), all: p.has('all'), say, stats: p.has('stats') }
}

/** Any of these skips the title and writes no save. */
const isTuning = (sw: Switches) => sw.job !== null || sw.story !== null || sw.autoplay || sw.fresh || sw.all

/** The rank a save's stars have earned. */
export function rankOf(save: Save): (typeof RANKS)[number] {
  let rank: (typeof RANKS)[number] = RANKS[0]
  for (const r of RANKS) if (r.stars <= save.stars) rank = r
  return rank
}

/** What a Game is made from: tests pass a fake storage and recognizer, the browser's own come from `createBrowserGame`. */
export interface GameParts {
  search: string
  /** The player's language: every word shown, and what the microphone hears. */
  lang: Lang
  /** Where the save lives, or null to keep it in memory only. */
  storage: Saves | null
  recognizer: RecognizerCtor | null
  audio: Sounds
  /** The random state a fresh save's job generator starts from: the browser's own, or a fixed one in tests. */
  freshSeed: () => number
}

/** Easy mode's arrow keys: how far right and up on the screen each goes. */
const EASY_DIRS: Record<string, readonly [right: number, up: number]> = {
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
}

type LeverName = keyof Levers
/** Pro mode's keys and the lever each pushes. Steer above 0 is left. */
const PRO_KEYS: Record<string, readonly [LeverName, 1 | -1]> = {
  ArrowUp: ['drive', 1], KeyW: ['drive', 1],
  ArrowDown: ['drive', -1], KeyS: ['drive', -1],
  ArrowLeft: ['steer', 1], KeyA: ['steer', 1],
  ArrowRight: ['steer', -1], KeyD: ['steer', -1],
  KeyE: ['a', 1], KeyQ: ['a', -1],
  KeyR: ['b', 1], KeyF: ['b', -1],
  KeyT: ['c', 1], KeyG: ['c', -1],
  KeyZ: ['d', 1], KeyX: ['d', -1],
}
const PULSED = ['a', 'b', 'c', 'd'] as const
type Pulses = Record<(typeof PULSED)[number], { v: number; at: number }>

/** Every lever with no pulse: the last one long ago. */
function noPulses(): Pulses {
  return { a: { v: 0, at: -1 }, b: { v: 0, at: -1 }, c: { v: 0, at: -1 }, d: { v: 0, at: -1 } }
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))
const NO_LEVERS: Levers = { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0 }

/**
 * The running game: the title with its living valley, the sim of a play, the pause, the shop,
 * the save, the sounds and the voice, and input from pointer, keys and speech. The stage
 * calls `advance` once a frame and reads `sim`, `events`, `clock` and `generation`; the HUD
 * re-renders when the version bumps, which happens only when something it shows changes.
 */
export class Game {
  readonly audio: Sounds
  readonly voice: Voice
  readonly switches: Switches
  readonly lang: Lang
  screen: Screen = 'title'
  save: Save
  sim: Sim
  paused = false
  /** Real seconds run; stops while the page is hidden. */
  clock = 0
  /** A touch has been seen: the touch buttons show. */
  touch = false
  heard: Heard | null = null
  cameraMode: CameraMode = 'behind'
  shopMachine: MachineKind = 'digger'
  /** Bumps when a new sim replaces the old one: the scene remounts. */
  generation = 0
  /** What the sim told this frame, for the effects. Replaced every `advance`. */
  events: readonly SimEvent[] = []
  /** Set by the camera each frame: a world point to CSS pixels. */
  project: ((x: number, y: number, z: number) => { x: number; y: number; onScreen: boolean }) | null = null
  /** The town from before the last new game is kept: the pause card offers it back. */
  oldTown = false
  /** The saved game had a part that could not be read, and a copy of it is kept: the pause card tells the parent. */
  saveTrouble = false

  private readonly storage: Saves | null
  private readonly freshSeed: () => number
  private bot: Bot | null = null
  private version = 0
  private shown = ''
  private saves = 0
  /** Seconds of play since the coins and stars were last checked for a write. */
  private sinceWrite = 0
  private writtenCoins = 0
  private writtenStars = 0
  private pageIsHidden = false
  /** The active machine the held keys were last judged against. */
  private lastActive: MachineKind
  /** Keys held when the machine changed: they do nothing until released and pressed again. */
  private ignored = new Set<string>()
  private listeners = new Set<() => void>()
  private storageWarned = false
  private lastInputAt = 0
  /** The voice was told to stop listening and has not been told to come back. */
  private voiceSuspended = false
  /** Misses in a row: words heard that mean nothing. */
  private misses = 0
  private pendingSay: string | null
  private viewYaw = Math.PI
  /** Keys held down. */
  private held = new Set<string>()
  private fingerDown = false
  /** An arrow key is steering in easy mode. */
  private keyDriving = false
  private pulses = noPulses()
  private sentLevers: Levers = NO_LEVERS

  constructor(parts: GameParts) {
    this.switches = readSwitches(parts.search)
    this.lang = parts.lang
    const sw = this.switches
    this.storage = parts.storage
    this.freshSeed = parts.freshSeed
    this.audio = parts.audio
    this.pendingSay = sw.say
    let saved = sw.fresh ? freshSave(this.freshSeed()) : this.load()
    if (sw.all) saved = { ...saved, owned: PAINTS.map((p) => p.id) }
    if (sw.mode !== null) saved = { ...saved, mode: sw.mode }
    this.save = saved
    this.writtenCoins = saved.coins
    this.writtenStars = saved.stars
    this.oldTown = !isTuning(sw) && this.readOld() !== null
    this.audio.setSound(saved.sound)
    this.audio.setMusic(saved.music)
    this.voice = new Voice(parts.recognizer, parts.lang)
    this.voice.changed = () => this.changed()
    this.voice.heard = (clauses, text, first) => this.onHeard(clauses, text, first)
    this.voice.unheard = (text) => this.onUnheard(text)
    this.sim = this.makeSim(true)
    this.lastActive = this.sim.active
    this.bot = createBot()
    if (isTuning(sw)) this.begin()
    this.syncVoice()
    this.changed()
  }

  // ---------------------------------------------------------------- the frame

  /** One frame of `dt` seconds, once a frame from the stage before anything reads the sim. */
  advance(dt: number) {
    if (!(dt >= 0)) throw new Error(`advance: dt must be 0 or more, got ${dt}`)
    const step = Math.min(dt, MAX_DT)
    this.clock += step
    this.voice.advance(step)
    this.events = []
    // A frame can come with no time at all; the sim needs some.
    if (!this.paused && this.screen !== 'shop' && step > 0) {
      const s = this.sim
      if (this.screen === 'play' && this.bot === null) this.feedKeys()
      if (this.bot !== null) botFrame(this.bot, s, step)
      tick(s, step)
      this.events = s.events.splice(0)
      if (this.screen === 'play') this.afterTick(s, step)
      if (this.screen === 'play' && this.bot === null && this.clock - this.lastInputAt >= IDLE_FOR) this.setPaused(true)
    }
    this.audio.setLoops(this.loops())
    this.audio.setDuck(this.voice.state === 'on')
    this.changed()
  }

  /** Sounds for the frame's events, the score into the save, and the save written when a job or a chapter ends. */
  private afterTick(s: Sim, step: number) {
    let writeNow = false
    for (const e of this.events) {
      for (const sound of soundsFor(e)) this.audio.play(sound)
      if (e.kind === 'jobDone' || e.kind === 'chapterDone') writeNow = true
    }
    this.syncSave()
    this.sinceWrite += step
    if (this.sinceWrite >= SAVE_EVERY) {
      this.sinceWrite = 0
      if (this.save.coins !== this.writtenCoins || this.save.stars !== this.writtenStars) writeNow = true
    }
    if (s.card !== null && s.card.kind === 'theEnd' && !this.save.golden) {
      this.save = { ...this.save, golden: true }
      writeNow = true
    }
    if (writeNow) this.persist()
  }

  /** Coins, stars and story progress live in the sim; the save copies them. */
  private syncSave() {
    const s = this.sim
    const v = this.save
    if (v.storyDone === s.storyDone && v.moreDone === s.moreDone && v.coins === s.score.coins && v.stars === s.score.stars && v.seed === s.seed && v.lastTemplate === s.lastTemplate) return
    this.save = { ...v, storyDone: s.storyDone, moreDone: s.moreDone, coins: s.score.coins, stars: s.score.stars, seed: s.seed, lastTemplate: s.lastTemplate }
  }

  /** The tune that belongs to the screen and the chapter. */
  private tune(): TuneId {
    if (this.screen === 'title') return 'title'
    const s = this.sim
    if (s.party !== null) return 'party'
    const chapter = s.job !== null ? s.job.job.chapter : s.storyDone < STORY.length ? STORY[s.storyDone].chapter : 'more'
    return chapter === 'more' ? 'road' : chapter
  }

  private loops(): Loops {
    if (this.paused) return QUIET
    const tune = this.tune()
    if (this.screen === 'play') return loopsFor(this.sim, tune)
    return { ...QUIET, tune }
  }

  // ---------------------------------------------------------------- screens

  /** Go! on the title. */
  start() {
    if (this.screen !== 'title') return
    if (!this.save.picked) this.save = { ...this.save, picked: true }
    this.begin()
    this.persist()
    this.changed()
  }

  /** The real sim from the save, and the play screen. */
  private begin() {
    this.sim = this.makeSim(false)
    this.screen = 'play'
    this.paused = false
    this.generation += 1
    this.bot = this.switches.autoplay ? createBot() : null
    this.lastInputAt = this.clock
    this.misses = 0
    this.heard = null
    this.lastActive = this.sim.active
    this.ignored.clear()
    this.releaseInputs()
    this.syncVoice()
    if (this.pendingSay !== null) {
      const words = this.pendingSay
      this.pendingSay = null
      this.hear(words)
    }
  }

  private makeSim(demo: boolean): Sim {
    const sw = this.switches
    const v = this.save
    let storyDone = v.storyDone
    if (sw.job !== null) storyDone = STORY.findIndex((j) => j.id === sw.job)
    if (sw.story !== null) storyDone = sw.story
    const s = createSim({ storyDone, moreDone: v.moreDone, coins: v.coins, stars: v.stars, mode: demo ? 'easy' : v.mode, seed: v.seed, lastTemplate: v.lastTemplate })
    if (sw.all && !demo) {
      for (const kind of MACHINE_KINDS) {
        const m = s.machines[kind]
        m.unlocked = true
        m.x = HOME[kind].x
        m.z = HOME[kind].z
        m.yaw = HOME[kind].yaw
        m.y = groundY(s, m.x, m.z)
      }
    }
    setSimViewYaw(s, this.viewYaw)
    return s
  }

  setPaused(on: boolean) {
    if (on === this.paused) return
    this.paused = on
    if (on) {
      this.releaseInputs()
      this.audio.setLoops(QUIET)
    } else this.lastInputAt = this.clock
    this.syncVoice()
    this.changed()
  }

  /** The one rule for the microphone: it listens only in a play that is running on a page that shows. */
  private syncVoice() {
    const listens = this.screen === 'play' && !this.paused && !this.pageIsHidden
    if (listens !== this.voiceSuspended) return
    this.voiceSuspended = !listens
    if (listens) this.voice.resume()
    else this.voice.suspend()
  }

  /** The page hid or came back. A hidden play pauses; the title and the shop carry on when it shows again. Sounds and the voice sleep either way, and the progress is written. */
  pageHidden(hidden: boolean) {
    this.pageIsHidden = hidden
    if (hidden) {
      this.keepProgress()
      if (this.screen === 'play') this.setPaused(true)
      this.audio.suspend()
    } else this.audio.resume()
    this.syncVoice()
  }

  /** Writes the coins and stars earned in a job; the story position moves only when a job ends. */
  keepProgress() {
    if (this.screen === 'title') return
    this.syncSave()
    this.persist()
  }

  openShop() {
    if (this.screen !== 'play') return
    this.releaseInputs()
    this.shopMachine = this.sim.active
    this.screen = 'shop'
    this.syncVoice()
    this.audio.play('tap')
    this.changed()
  }

  closeShop() {
    if (this.screen !== 'shop') return
    this.screen = 'play'
    this.syncVoice()
    this.audio.play('tap')
    this.changed()
  }

  /** A card's Next!. */
  next() {
    if (this.screen !== 'play' || this.sim.card === null) return
    ackCard(this.sim)
    this.poke()
    this.changed()
  }

  /** Wipes the save but keeps the sound and music settings; back to the title with a new valley, to choose a builder again. A save with progress is kept as the old town. */
  startFresh() {
    if (this.screen !== 'title') this.syncSave()
    if (hasProgress(this.save)) this.keepOldTown()
    this.save = { ...freshSave(this.freshSeed()), sound: this.save.sound, music: this.save.music }
    this.persist()
    this.toTitle()
  }

  /** Brings back the town from before the last new game, on the title. */
  restoreOldTown() {
    const old = this.readOld()
    if (!this.oldTown || old === null) throw new Error('restoreOldTown: there is no old town')
    // What the child built since is kept as the old town, to bring back in turn.
    if (hasProgress(this.save)) this.keepOldTown()
    else {
      try {
        this.storage?.removeItem(OLD_KEY)
      } catch (e) {
        this.warnStorage(e)
      }
      this.oldTown = false
    }
    this.save = old
    this.persist()
    this.audio.setSound(old.sound)
    this.audio.setMusic(old.music)
    this.toTitle()
  }

  /** The title with a new valley made from the save, as a page load makes it: new generation, hands off, voice off. */
  private toTitle() {
    this.releaseInputs()
    this.sim = this.makeSim(true)
    this.lastActive = this.sim.active
    this.ignored.clear()
    this.bot = createBot()
    this.screen = 'title'
    this.paused = false
    this.generation += 1
    this.heard = null
    this.misses = 0
    this.voice.turnOff()
    this.syncVoice()
    this.changed()
  }

  /** Writes the current save as the old town, unless this is a tuning visit or there is no storage. */
  private keepOldTown() {
    if (this.storage === null || isTuning(this.switches)) return
    try {
      this.storage.setItem(OLD_KEY, serializeSave(this.save))
      this.oldTown = true
    } catch (e) {
      this.warnStorage(e)
    }
  }

  /** The old town with every good field of it, or null when none is kept. Text that could not be read in full is copied under `BROKEN_KEY` before anything overwrites it, unless that key already holds a copy. */
  private readOld(): Save | null {
    if (this.storage === null) return null
    try {
      const text = this.storage.getItem(OLD_KEY)
      if (text === null) return null
      const { save, trouble } = parseSave(text, this.freshSeed())
      if (trouble && !isTuning(this.switches) && this.storage.getItem(BROKEN_KEY) === null) this.keepBroken(text, false)
      return save
    } catch (e) {
      this.warnStorage(e)
      return null
    }
  }

  // ---------------------------------------------------------------- input

  /** Any input at all keeps the game from pausing for want of it. */
  poke() {
    this.lastInputAt = this.clock
  }

  /** A touch was seen anywhere. */
  sawTouch() {
    if (this.touch) return
    this.touch = true
    this.changed()
  }

  /** The child is steering the play: not the title, a pause, the shop or the bot. */
  private driving() {
    return this.screen === 'play' && !this.paused && this.bot === null
  }

  groundDown(x: number, z: number) {
    if (!this.driving()) return
    this.poke()
    this.fingerDown = true
    if (this.sim.mode === 'easy') setPoint(this.sim, x, z)
  }

  groundMove(x: number, z: number) {
    if (!this.driving() || !this.fingerDown) return
    if (this.sim.mode === 'easy') setPoint(this.sim, x, z)
  }

  groundUp() {
    if (!this.fingerDown) return
    this.fingerDown = false
    if (this.driving() && this.sim.mode === 'easy') letGo(this.sim)
  }

  /** A tap on a machine in the world: the builder hops into it. */
  tapMachine(kind: MachineKind) {
    this.hop(kind)
  }

  /** The big button. In pro mode a press is Space's lever tap. */
  action(on: boolean) {
    if (!this.driving()) return
    this.poke()
    if (this.sim.mode === 'pro') {
      if (on) leverTap(this.sim)
    } else setAction(this.sim, on)
  }

  horn() {
    if (!this.driving()) return
    this.poke()
    honk(this.sim)
  }

  /** Hop into a machine; one that has not come says uhuh. */
  hop(kind: MachineKind) {
    if (!this.driving()) return
    this.poke()
    if (this.sim.machines[kind].unlocked) hopTo(this.sim, kind)
    else this.sim.events.push({ kind: 'uhuh', machine: this.sim.active })
  }

  /** Pro mode's mouse: a short pulse on a and b from a drag, fading over a tenth of a second. */
  dragLevers(dx: number, dy: number) {
    this.pulse('a', dx * 0.08)
    this.pulse('b', -dy * 0.08)
  }

  dragBucket(dy: number) {
    this.pulse('d', -dy * 0.08)
  }

  wheel(dy: number) {
    this.pulse('c', -dy * 0.01)
  }

  private pulse(lever: (typeof PULSED)[number], v: number) {
    if (!this.driving() || this.sim.mode !== 'pro') return
    this.poke()
    this.pulses[lever] = { v: clamp1(v), at: this.clock }
  }

  /** The screen's up as a world yaw. */
  setViewYaw(yaw: number) {
    this.viewYaw = yaw
    setSimViewYaw(this.sim, yaw)
  }

  /**
   * A key went down; true when the game uses it, so the page keeps it from scrolling.
   * Easy: arrows or WASD, Space or Enter, H, 1 to 9, Esc or P, M, F. Pro: W/S and arrows drive and
   * steer, Q/E a, R/F b, T/G c, Z/X d, Space taps the lever, C cycles the camera; F is a lever
   * there, so full screen is the button only.
   */
  keyDown(code: string): boolean {
    const pro = this.sim.mode === 'pro' && this.screen === 'play'
    const lever = pro && code in PRO_KEYS
    if (this.held.has(code)) return true
    if (code === 'KeyM') {
      const on = !(this.save.sound || this.save.music)
      this.setSound(on)
      this.setMusic(on)
      return true
    }
    if (code === 'KeyF' && !pro) {
      this.toggleFullscreen()
      return true
    }
    if (this.screen === 'title') {
      if (code !== 'Space' && code !== 'Enter') return false
      this.start()
      return true
    }
    if (this.screen === 'shop') {
      if (code !== 'Escape') return false
      this.closeShop()
      return true
    }
    if (code === 'Escape' || code === 'KeyP') {
      this.setPaused(!this.paused)
      return true
    }
    const digit = /^Digit([1-9])$/.exec(code)
    const keyed = lever || (!pro && code in EASY_DIRS) || code === 'Space' || code === 'Enter'
    if (!keyed && digit === null && code !== 'KeyH' && !(pro && code === 'KeyC')) return false
    if (!this.driving()) return true
    this.poke()
    if (digit !== null) {
      const unlocked = MACHINE_KINDS.filter((k) => this.sim.machines[k].unlocked)
      const kind = unlocked[Number(digit[1]) - 1]
      if (kind !== undefined) this.hop(kind)
    } else if (code === 'KeyH') this.horn()
    else if (code === 'KeyC') this.cameraMode = CAMERAS[(CAMERAS.indexOf(this.cameraMode) + 1) % CAMERAS.length]
    else if (code === 'Space' || (code === 'Enter' && !pro)) {
      this.held.add(code)
      this.action(true)
    } else if (keyed) this.held.add(code)
    this.changed()
    return true
  }

  keyUp(code: string) {
    this.ignored.delete(code)
    if (!this.held.delete(code)) return
    if ((code === 'Space' || code === 'Enter') && this.sim.mode === 'easy') this.action(false)
  }

  /** Every key, finger and lever lets go (blur, hide, pause, a new screen). */
  releaseInputs() {
    this.held.clear()
    this.ignored.clear()
    this.fingerDown = false
    this.keyDriving = false
    this.pulses = noPulses()
    const s = this.sim
    setAction(s, false)
    dropTap(s)
    letGo(s)
    if (this.sentLevers !== NO_LEVERS) {
      this.sentLevers = NO_LEVERS
      setLevers(s, NO_LEVERS)
    }
  }

  /** The keys and pulses held this frame, as the sim's hands: arrows aim easy mode's machine, pro mode gets levers. */
  private feedKeys() {
    const s = this.sim
    if (s.active !== this.lastActive) {
      this.lastActive = s.active
      // Pro mode's held keys wait to be let go; easy mode has no levers to hold.
      if (s.mode === 'pro') {
        this.ignored = new Set(this.held)
        this.pulses = noPulses()
      }
    }
    if (s.mode === 'easy') {
      let right = 0
      let up = 0
      for (const code of this.held) {
        const d = EASY_DIRS[code]
        if (d === undefined) continue
        right += d[0]
        up += d[1]
      }
      if (right !== 0 || up !== 0) {
        const len = Math.hypot(right, up)
        const yaw = s.hands.viewYaw
        const m = s.machines[s.active]
        // Screen up is (sin yaw, cos yaw); screen right is (-cos yaw, sin yaw).
        const wx = (up / len) * Math.sin(yaw) - (right / len) * Math.cos(yaw)
        const wz = (up / len) * Math.cos(yaw) + (right / len) * Math.sin(yaw)
        setPoint(s, m.x + wx * KEY_AHEAD, m.z + wz * KEY_AHEAD)
        this.keyDriving = true
      } else if (this.keyDriving) {
        this.keyDriving = false
        if (!this.fingerDown) letGo(s)
      }
      return
    }
    const l: Levers = { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0 }
    for (const code of this.held) {
      if (this.ignored.has(code)) continue
      const k = PRO_KEYS[code]
      if (k !== undefined) l[k[0]] = clamp1(l[k[0]] + k[1])
    }
    for (const name of PULSED) {
      const p = this.pulses[name]
      const left = 1 - (this.clock - p.at) / PULSE_FOR
      if (left > 0) l[name] = clamp1(l[name] + p.v * left)
    }
    const was = this.sentLevers
    if (l.drive !== was.drive || l.steer !== was.steer || l.a !== was.a || l.b !== was.b || l.c !== was.c || l.d !== was.d) {
      this.sentLevers = l
      setLevers(s, l)
    }
  }

  // ---------------------------------------------------------------- speech

  toggleMic() {
    this.audio.unlock()
    this.voice.toggle()
  }

  /** Words as the recognizer would have finished them; the same path, so tests and `?say=` need no microphone. */
  hear(text: string) {
    const clauses = parseSpeech(text)
    if (clauses.length > 0) this.onHeard(clauses, text, true)
    else if (text.trim() !== '') this.onUnheard(text)
  }

  private onHeard(clauses: Spoken[], text: string, first: boolean) {
    if (this.screen !== 'play') return
    this.poke()
    clauses.forEach((c, i) => say(this.sim, c, !first || i > 0))
    const was = this.heard
    const same = !first && was !== null && was.understood && this.clock - was.at < HEARD_FOR
    this.heard = { text, clauses: same ? [...was.clauses, ...clauses] : clauses, understood: true, at: this.clock, wanted: null }
    this.misses = 0
    this.changed()
  }

  private onUnheard(text: string) {
    if (this.screen !== 'play') return
    this.poke()
    this.misses += 1
    let wanted: MachineKind | null = null
    if (this.misses >= 2) {
      const p = stepPointer(this.sim)
      wanted = p === null ? this.sim.active : p.machine
    }
    this.heard = { text, clauses: [], understood: false, at: this.clock, wanted }
    this.changed()
  }

  // ---------------------------------------------------------------- settings, paint and the builder

  setMode(mode: Mode) {
    this.releaseInputs()
    if (this.screen !== 'title') setSimMode(this.sim, mode)
    this.keep({ ...this.save, mode })
  }

  setSound(on: boolean) {
    this.audio.setSound(on)
    this.keep({ ...this.save, sound: on })
  }

  setMusic(on: boolean) {
    this.audio.setMusic(on)
    this.keep({ ...this.save, music: on })
  }

  toggleFullscreen() {
    if (document.fullscreenElement !== null) void document.exitFullscreen()
    else if (canFullscreen()) void document.documentElement.requestFullscreen()
  }

  /** Spends coins on a paint; false (and uhuh) when there are too few. A paint already owned costs nothing. */
  buyPaint(id: PaintId): boolean {
    if (this.screen === 'title') throw new Error('buyPaint: the shop opens in a play, not on the title')
    const paint = PAINTS.find((p) => p.id === id)
    if (paint === undefined) throw new Error(`buyPaint: no paint ${id}`)
    if (this.save.owned.includes(id)) return true
    this.syncSave()
    if (this.sim.score.coins < paint.price) {
      this.audio.play('uhuh')
      return false
    }
    this.sim.score.coins -= paint.price
    this.syncSave()
    this.keep({ ...this.save, owned: PAINTS.map((p) => p.id).filter((p) => p === id || this.save.owned.includes(p)) })
    this.audio.play('buy')
    return true
  }

  setPaint(machine: MachineKind, id: PaintId) {
    if (!this.save.owned.includes(id)) throw new Error(`setPaint: ${id} is not bought yet`)
    this.keep({ ...this.save, paints: { ...this.save.paints, [machine]: id } })
    this.audio.play('select')
  }

  setDriver(look: DriverLook) {
    this.keep({ ...this.save, driver: { ...look } })
    this.audio.play('select')
  }

  setShopMachine(kind: MachineKind) {
    this.shopMachine = kind
    this.changed()
  }

  // ---------------------------------------------------------------- the save

  /** A changed save: kept and written at once. */
  private keep(save: Save) {
    this.save = save
    this.saves += 1
    this.persist()
    this.changed()
  }

  /** Writes the save, except on a tuning visit or with no storage. */
  private persist() {
    if (this.storage === null || isTuning(this.switches)) return
    try {
      this.storage.setItem(SAVE_KEY, serializeSave(this.save))
      this.writtenCoins = this.save.coins
      this.writtenStars = this.save.stars
      this.sinceWrite = 0
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private load(): Save {
    if (this.storage === null) return freshSave(this.freshSeed())
    try {
      const text = this.storage.getItem(SAVE_KEY)
      const { save, trouble } = parseSave(text, this.freshSeed())
      if (trouble && text !== null && !isTuning(this.switches)) this.keepBroken(text, true)
      return save
    } catch (e) {
      this.warnStorage(e)
      return freshSave(this.freshSeed())
    }
  }

  /** Copies the text of a save that could not be read in full for a parent; `saveTrouble` is set only when the copy is kept and `ofCurrent` says it is the current save's. */
  private keepBroken(text: string, ofCurrent: boolean) {
    try {
      this.storage?.setItem(BROKEN_KEY, text)
      if (ofCurrent) this.saveTrouble = true
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Digger Town cannot use the browser storage, so this visit is not remembered:', e)
  }

  // ---------------------------------------------------------------- what the HUD reads

  /** Everything the HUD shows, in one string. */
  private signature(): string {
    const head = `${this.screen}:${this.generation}|${this.paused}|${this.touch}|${this.saves}|${this.save.mode}|${this.oldTown}|${this.saveTrouble}`
    if (this.screen === 'title') return head
    const s = this.sim
    const run = s.job
    const view = stepView(s)
    const ptr = stepPointer(s)
    const unlocked = MACHINE_KINDS.map((k) => (s.machines[k].unlocked ? 1 : 0)).join('')
    const card = s.card === null ? '' : `${s.card.kind}${'chapter' in s.card ? s.card.chapter : ''}${'stars' in s.card ? s.card.stars : ''}`
    const h = this.heard
    const heard = h === null ? '' : `${h.at}${h.understood}${h.wanted ?? ''}${this.clock - h.at < HEARD_FOR}`
    const tier = s.idle < 6 ? 0 : s.idle < 12 ? 1 : 2
    return [
      head, this.cameraMode, this.shopMachine, s.active, unlocked,
      run === null ? '' : `${run.job.id}.${run.step}`,
      view === null ? '' : `${view.done}/${view.of}`,
      ptr === null ? '' : `${ptr.machine}${ptr.press}`,
      actionFace(s, s.active), actionReady(s),
      Math.floor(s.score.coins), s.score.stars, card, s.party === null ? '' : s.party.chapter,
      s.hop === null ? '' : s.hop.to, heard, this.voice.state, this.voice.hearing,
      Math.floor(s.hands.heldFor * 10), tier,
    ].join('|')
  }

  /** Bumps the version, and tells every subscriber, when anything the HUD shows has changed. */
  private changed() {
    const snapshot = this.signature()
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
  /** `${screen}:${generation}`: what the stage keys its scene by. */
  getScreenKey = () => `${this.screen}:${this.generation}`
}

/** The browser can show the page full screen: an iPhone's cannot. */
export function canFullscreen(): boolean {
  return document.documentElement.requestFullscreen !== undefined
}

/** The game with the player's saves and language, and the browser's own recognizer and sound. A visit with any switch leaves it on `window.game`. */
export function createBrowserGame(saves: Saves, lang: Lang): Game {
  const game = new Game({ search: location.search, lang, storage: saves, recognizer: findRecognizer(), audio: new Sounds(), freshSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 })
  if ([...new URLSearchParams(location.search).keys()].length > 0) (window as unknown as { game: Game }).game = game
  return game
}

/** Re-renders the caller whenever anything the HUD shows changes. */
export function useGameView(game: Game): void {
  useSyncExternalStore(game.subscribe, game.getVersion)
}

/** Screen and generation: the stage's key. */
export function useScreenKey(game: Game): string {
  return useSyncExternalStore(game.subscribe, game.getScreenKey)
}

/** The keyboard, the wheel, the page hiding and the window losing focus; the first press of anything wakes the audio. */
export function useGameInput(game: Game): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      game.audio.unlock()
      if (game.keyDown(e.code)) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => game.keyUp(e.code)
    // On iOS a touch's pointerdown is no gesture for audio; its touchend and click are.
    const wake = () => game.audio.unlock()
    const press = (e: PointerEvent) => {
      game.audio.unlock()
      game.poke()
      if (e.pointerType === 'touch') game.sawTouch()
    }
    const wheel = (e: WheelEvent) => game.wheel(e.deltaY)
    const visibility = () => game.pageHidden(document.hidden)
    const blur = () => game.releaseInputs()
    const leaving = () => game.pageHidden(true)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', press, true)
    for (const type of ['pointerup', 'touchend', 'click']) window.addEventListener(type, wake, true)
    window.addEventListener('pagehide', leaving)
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', press, true)
      for (const type of ['pointerup', 'touchend', 'click']) window.removeEventListener(type, wake, true)
      window.removeEventListener('pagehide', leaving)
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [game])
}
