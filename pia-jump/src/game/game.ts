import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import type { BotPlan } from './bot'
import { ROOMS } from './levels'
import { HZ, STEP, since, type Form, type Room, type Sim, type SimEvent } from './model'
import { isOpen, openRoom as openForGood, parseSave, roomDone, serializeSave, startFresh, type Save } from './progress'
import { parseRoom } from './room'
import { createSim, heroBox, pressBubble, pressJump, releaseBubble, releaseJump, setMove, step } from './sim'
import { Sounds, tuneSeconds, type Tune } from './sounds'

// A hot edit to this file or anything it runs (the sim, the rooms, the sounds, the save) reloads the page, so an old game's music never plays on
// beside a new one. Vite 8's hot.decline() does nothing, so this module takes the update itself and reloads; edits to the art still swap in hot.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/** rooms: the five room cards. play: in a room. picnic: the ending after the last kitten. */
export type Screen = 'rooms' | 'play' | 'picnic'

/** What one call to `advance` did: how many steps ran, how far into the next step the picture is, and every event of those steps, in order. One object, reused. */
export interface Frame {
  steps: number
  alpha: number
  events: SimEvent[]
}

/** Where an input comes from: the keyboard or the thumbs on the screen. */
export type Source = 'keys' | 'touch'
const SOURCES: readonly Source[] = ['keys', 'touch']

/** The words that pop up on a moment, and nothing else. */
export type Shout = 'Wow!' | 'Boing!' | 'Oops!' | 'Yay!'

/** At most this much real time a frame, so a stall never fast-forwards the room; 12 steps at 120 Hz. */
const MAX_FRAME = 0.1
const MAX_STEPS = 12
/** The start card's "Find Sunny!" shows this long, unless an input comes first. */
const START_CARD_FOR = 1.2
const SHOUT_FOR = 0.9
/** The sim's done phase plays this long (the end jingle, the confetti) before the game goes back to the rooms. */
const DONE_HOLD = 2.5
/** The picnic plays its tune to the end and a second more; a tap ends it once it has played PICNIC_MIN. */
const PICNIC_FOR = tuneSeconds('picnic') + 1
const PICNIC_MIN = 3
/** A fresh rooms screen takes no card taps this long, so the tap that ended the picnic never lands on a card. */
const CALM_FOR = 0.4
/** This long with no input pauses a room, and fades the music out on the rooms screen. */
const IDLE_FOR = 60
/** First-time help in the first room: the ghost hand shows for HELP_FOR at the start and again after HELP_IDLE with no input. */
export const HELP_FOR = 6
const HELP_IDLE = 10
const SAVE_KEY = 'pia-jump'

/**
 * The homecoming on the rooms screen, in seconds from its start: "You found Sunny!" until
 * `say`; then the room's stars fly into the jar, `flyEvery` apart, each flight `flyFor`
 * long, at most `flyMax` flights (each carries its share); then the next card's padlock
 * pops over `padlock`.
 */
export const HOME = { say: 1.5, flyEvery: 0.12, flyFor: 0.6, flyMax: 12, padlock: 0.6 } as const

/** A kitten coming home to its card after a visit. */
export interface Homecoming {
  /** The room whose kitten came home. */
  index: number
  /** Stars the visit took, and the jar before them. */
  stars: number
  jarFrom: number
  /** The card this kitten opened, or -1. */
  opened: number
  /** The game clock when it started. */
  at: number
}

/** When each part of a homecoming happens, in seconds from its start (see HOME). */
export function homeTimes(stars: number) {
  const flights = Math.min(stars, HOME.flyMax)
  const landed = flights === 0 ? HOME.say : HOME.say + (flights - 1) * HOME.flyEvery + HOME.flyFor
  const padlockAt = landed + 0.2
  return { flights, landed, padlockAt, end: padlockAt + HOME.padlock }
}

/** The URL switches, read once at load. */
export interface Switches {
  /** ?room=<id or 1-based number>: start in that room whatever the locks, and never write the save. */
  room: number | null
  /** &x=<column>: start her at the nearest floor at or before that column. */
  x: number | null
  /** &form=small|big|bubble */
  form: Form | null
  /** ?all: every room open for this visit. */
  all: boolean
  /** ?autoplay (with ?room): the bot plays the room. */
  autoplay: boolean
}

const FORMS: readonly Form[] = ['small', 'big', 'bubble']

/** Reads the switches from a query string. A bad value throws, saying what would be right. */
export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const roomText = p.get('room')
  let room: number | null = null
  if (roomText !== null) {
    const n = /^\d+$/.test(roomText) ? Number(roomText) - 1 : -1
    room = n >= 0 && n < ROOMS.length ? n : ROOMS.findIndex((r) => r.id === roomText)
    if (room < 0) throw new Error(`?room=${roomText}: use one of ${ROOMS.map((r) => r.id).join(', ')}, or a number from 1 to ${ROOMS.length}`)
  }
  const xText = p.get('x')
  if (xText !== null && !/^\d+$/.test(xText)) throw new Error(`&x=${xText}: use a column number, 0 or more`)
  const formText = p.get('form')
  const form = formText === null ? null : FORMS.find((f) => f === formText)
  if (form === undefined) throw new Error(`&form=${formText}: use one of ${FORMS.join(', ')}`)
  const autoplay = p.has('autoplay')
  if (room === null && (xText !== null || form !== null || autoplay)) throw new Error('&x, &form and ?autoplay need ?room=<id> too')
  if (autoplay && (xText !== null || form !== null)) throw new Error('?autoplay plays from the start of the room as small Pia: leave out &x and &form')
  return { room, x: xText === null ? null : Number(xText), form, all: p.has('all'), autoplay }
}

const parsed: Room[] = []
/** ROOMS[index], parsed once. */
export function roomAt(index: number): Room {
  return (parsed[index] ??= parseRoom(ROOMS[index]!))
}

/** The &x and &form switches: her feet on the nearest floor at or before column `col`, in `form`. */
function placeHero(s: Sim, room: Room, col: number | null, form: Form | null) {
  const h = s.hero
  if (col !== null) {
    if (col >= room.cols) throw new Error(`&x=${col}: room ${room.id} has only ${room.cols} columns`)
    let c = col
    while (c >= 0 && room.floor[c] === -1) c--
    if (c < 0) throw new Error(`&x=${col}: room ${room.id} has no floor at or before that column`)
    h.x = h.px = h.safeX = c + 0.5
    h.y = h.py = h.safeY = room.floor[c]!
  }
  if (form !== null) {
    h.form = form
    ;[h.w, h.h] = heroBox(form)
  }
}

/** The word a moment shouts, if it shouts one: a stomp chain of 3 or more, a spring, a hit, the kitten. */
export function shoutFor(e: SimEvent): Shout | null {
  switch (e.kind) {
    case 'stomp':
      return e.n >= 3 ? 'Wow!' : null
    case 'spring':
      return 'Boing!'
    case 'hurt':
    case 'shrink':
      return 'Oops!'
    case 'kitten':
      return 'Yay!'
    default:
      return null
  }
}

/**
 * The running game: the screens, the room and its sim, the pause, the save, the input from
 * keys and thumbs, and the sounds' lifecycle. The stage reads `room`, `sim`, `generation`,
 * `screen` and `paused` every frame and calls `advance` once a frame, which also keeps the
 * game's own clock; the HUD subscribes to the version, which bumps whenever something it
 * shows has changed.
 */
export class Game {
  readonly audio = new Sounds()
  readonly switches: Switches
  screen: Screen = 'rooms'
  room: Room
  sim: Sim
  /** Index into ROOMS of `room`: the room played, or on the rooms screen the one drifting by behind the cards. */
  index = 0
  paused = false
  /** Bumps whenever a new sim starts: the stage forgets its camera and particles. */
  generation = 0
  save: Save
  /** Real seconds the page has run, advance's clamped seconds summed (it stops while the page is hidden): every timer of the HUD reads it. */
  clock = 0
  /** The card the keyboard is on, on the rooms screen; always an open one. */
  highlight = 0
  /** The start card shows until this clock, or -1. */
  startCardUntil = -1
  /** The cards take no taps before this clock. */
  private calmUntil = -1
  shout: { word: Shout; at: number } | null = null
  homecoming: Homecoming | null = null
  picnicAt = -1
  /** The ghost hand's current showing started at this clock, or -1. */
  helpAt = -1
  /** Which controls she has used: each pulses until it has been. */
  readonly used = { left: false, right: false, jump: false }
  private acc = 0
  private frame: Frame = { steps: 0, alpha: 0, events: [] }
  private version = 0
  private listeners = new Set<() => void>()
  private lastInputAt = 0
  /** This visit's end is saved; `home` is the homecoming it will show, and `fifth` whether it found the last kitten. */
  private recorded = false
  private home: Homecoming | null = null
  private fifth = false
  /** The homecoming's padlock has popped (and its door chime rung). */
  private unlocked = false
  /** Each source's direction, and a counter stamp of when it last turned to a new one (the newest wins). */
  private dirs: Record<Source, -1 | 0 | 1> = { keys: 0, touch: 0 }
  private dirAt: Record<Source, number> = { keys: 0, touch: 0 }
  private dirCount = 0
  private jumps = new Set<Source>()
  private bubbles = new Set<Source>()
  /** ?autoplay: whether the bot plays this visit, and its plan once found. */
  private autoplaying = false
  private plan: BotPlan | null = null
  private drive: ((s: Sim, plan: BotPlan, from: number) => void) | null = null
  private storageWarned = false
  /** What the HUD last saw of the values that change on their own. */
  private seen = { stars: -1, bubble: false, shout: -2, card: false, ghost: false, saying: false, home: false, ending: false }

  private readonly saves: Saves

  /** `search` is the page's query string: the switches (see Switches); `saves` are the player's. */
  constructor(search: string, saves: Saves) {
    this.saves = saves
    this.switches = readSwitches(search)
    this.save = this.loadSave()
    this.audio.setSound(this.save.sound)
    this.audio.setMusic(this.save.music)
    const first = this.switches.room ?? Math.max(0, this.nextRoom())
    this.room = roomAt(first)
    this.sim = createSim(this.room)
    this.index = first
    this.highlight = first
    if (this.switches.room !== null) this.openRoom(this.switches.room)
    if (this.switches.autoplay) this.loadBot()
  }

  /** A room is open if it is the first, if the room before has its kitten home, if a parent opened it, or with ?all. */
  isOpen(index: number): boolean {
    return this.openIn(this.save, index)
  }

  private openIn(save: Save, index: number) {
    return this.switches.all || isOpen(save, index)
  }

  /** The room to play next: the first open one whose kitten is still out, or -1 when every kitten is home. */
  nextRoom(): number {
    return ROOMS.findIndex((r, i) => this.isOpen(i) && !this.save.found.includes(r.id))
  }

  /** The start card is up. */
  get startCard() {
    return this.startCardUntil >= 0
  }

  /** The shout showing now, if any. */
  get shouting(): Shout | null {
    return this.shout && this.clock - this.shout.at < SHOUT_FOR ? this.shout.word : null
  }

  /** The first room teaches the controls until its kitten is home: the ghost hand, and pulses on what she has not used yet. */
  get teaching() {
    return this.helping()
  }

  /** The first room's ghost hand is showing. */
  get ghost() {
    return this.helping() && this.helpAt >= 0 && this.clock - this.helpAt < HELP_FOR
  }

  /** The visit's ending runs (the pole, the walk home, the kitten): the controls do nothing. */
  get ending() {
    const p = this.sim.phase
    return this.screen === 'play' && (p === 'pole' || p === 'walk' || p === 'found' || p === 'done')
  }

  /** "You found Sunny!" is up: the cards take no taps. */
  get saying() {
    return this.homecoming !== null && this.clock - this.homecoming.at < HOME.say
  }

  // ------------------------------------------------------------------------------------- screens

  /** Starts room `index` from its start: a fresh sim, the start card, its tune. Locks are the caller's business. */
  openRoom(index: number) {
    this.show(index)
    if (index === this.switches.room) placeHero(this.sim, this.room, this.switches.x, this.switches.form)
    this.screen = 'play'
    this.paused = false
    this.recorded = false
    this.home = null
    this.fifth = false
    this.homecoming = null
    this.shout = null
    this.startCardUntil = this.clock + START_CARD_FOR
    this.lastInputAt = this.clock
    this.helpAt = this.helping() ? this.clock : -1
    this.autoplaying = this.switches.autoplay && index === this.switches.room
    this.jumps.clear()
    this.bubbles.clear()
    this.feedMove()
    this.audio.ui('start')
    this.bump()
  }

  /** A tap on a room card (or Enter on the highlighted one): in if it is open, a "nuh-uh" if not. Returns whether it went in. */
  tapCard(index: number): boolean {
    if (this.saying || this.clock < this.calmUntil) return false
    if (!this.isOpen(index)) {
      this.audio.ui('locked')
      return false
    }
    this.audio.ui('door')
    this.openRoom(index)
    return true
  }

  /** The rooms screen's keyboard: the highlight steps to the next open card that way, and that room drifts by behind the cards. */
  moveHighlight(dir: -1 | 1) {
    const open = ROOMS.map((_, i) => i).filter((i) => this.isOpen(i))
    const next = open[Math.min(Math.max(open.indexOf(this.highlight) + dir, 0), open.length - 1)]!
    if (next === this.highlight) return
    this.highlight = next
    this.show(next)
    this.audio.ui('tap')
    this.bump()
  }

  enterHighlight() {
    this.tapCard(this.highlight)
  }

  /** "Start again": this room from its start. */
  restart() {
    this.openRoom(this.index)
  }

  /** "Rooms": back to the cards, this room's card highlighted. */
  toRooms() {
    this.showRooms(this.index)
  }

  /** The parent gate on a locked card: open from now on. */
  unlockRoom(index: number) {
    this.save = openForGood(this.save, ROOMS[index]!.id)
    this.storeSave()
    this.audio.ui('fresh')
    this.bump()
  }

  /** The parent gate's "Hold to start fresh": every kitten back in its bed, the jar empty; Sound and Music stay. */
  startFresh() {
    this.save = startFresh(this.save)
    this.storeSave()
    this.audio.ui('fresh')
    this.homecoming = null
    this.showRooms(0)
  }

  /** A star of the homecoming lands in the jar: the same chime as taking one, climbing as they come. */
  starHome() {
    this.audio.play({ kind: 'star', x: 0, y: 0, n: 0 })
  }

  /** A sound for the parent gate's hold starting, and for it ending early. */
  holding(on: boolean) {
    this.audio.ui(on ? 'hold' : 'tap')
  }

  private showRooms(highlight: number) {
    this.screen = 'rooms'
    this.paused = false
    this.highlight = highlight
    this.show(highlight)
    this.startCardUntil = -1
    this.calmUntil = this.clock + CALM_FOR
    this.shout = null
    this.lastInputAt = this.clock
    this.bump()
  }

  /** Room `index` with a fresh sim, for playing or for drifting by behind the cards. */
  private show(index: number) {
    this.index = index
    this.room = roomAt(index)
    this.sim = createSim(this.room)
    this.generation += 1
    this.acc = 0
  }

  /** The visit is done: its kitten home, its stars counted, saved at once. */
  private record() {
    const before = this.save
    const id = this.room.id
    const stars = this.sim.stars
    this.save = roomDone(before, id, stars)
    this.recorded = true
    this.fifth = !before.found.includes(id) && ROOMS.every((r) => this.save.found.includes(r.id))
    const next = this.index + 1
    const opened = next < ROOMS.length && !this.openIn(before, next) && this.isOpen(next) ? next : -1
    this.home = { index: this.index, stars, jarFrom: before.jar, opened, at: -1 }
    this.storeSave()
  }

  /** After the done phase: the homecoming on the rooms screen, or the picnic after the fifth kitten. */
  private leaveRoom() {
    if (this.fifth) {
      this.screen = 'picnic'
      this.picnicAt = this.clock
      this.show(ROOMS.length - 1)
      this.shout = null
      this.bump()
      return
    }
    const home = { ...this.home!, at: this.clock }
    this.showRooms(Math.max(0, this.nextRoom()))
    this.homecoming = home
    this.unlocked = false
    this.audio.ui('found')
    this.bump()
  }

  private endPicnic() {
    this.showRooms(0)
  }

  // ------------------------------------------------------------------------------------- pause

  pause() {
    if (this.screen !== 'play' || this.paused) return
    this.paused = true
    // The sim holds nothing while the menu is up; on resume a direction still held steers again, but a jump or a bubble must be pressed anew.
    setMove(this.sim, 0)
    releaseJump(this.sim)
    releaseBubble(this.sim)
    this.jumps.clear()
    this.bubbles.clear()
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

  /** The page hid or the window lost focus: every held input lets go, the room pauses, the sound sleeps until the next touch. */
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

  // ------------------------------------------------------------------------------------- input

  /** Any input at all: keeps the room from pausing for want of input, puts away the start card, brings the music back, ends the picnic once it has played a while. */
  poke() {
    this.lastInputAt = this.clock
    if (this.startCardUntil >= 0) {
      this.startCardUntil = -1
      this.bump()
    }
    if (this.screen === 'picnic' && this.clock - this.picnicAt >= PICNIC_MIN) this.endPicnic()
  }

  /** A source's direction. The sim gets the newest non-zero one. */
  move(source: Source, dir: -1 | 0 | 1) {
    if (dir !== 0 && dir !== this.dirs[source]) this.dirAt[source] = ++this.dirCount
    this.dirs[source] = dir
    if (this.live()) {
      if (dir < 0 && !this.used.left) this.use('left')
      if (dir > 0 && !this.used.right) this.use('right')
    }
    this.feedMove()
  }

  /** The merged direction: the source that turned most recently and still pushes, or 0. */
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

  /** A source's bubble button, merged like the jump. */
  bubble(source: Source, down: boolean) {
    if (down) {
      if (!this.live()) return
      if (this.bubbles.size === 0) pressBubble(this.sim)
      this.bubbles.add(source)
    } else if (this.bubbles.delete(source) && this.bubbles.size === 0) releaseBubble(this.sim)
  }

  /** Everything a source holds lets go. */
  release(source: Source) {
    this.move(source, 0)
    this.jump(source, false)
    this.bubble(source, false)
  }

  /** The player steers the sim now: in a room, not paused, not the bot's turn. */
  private live() {
    return this.screen === 'play' && !this.paused && !this.autoplaying
  }

  private feedMove() {
    if (this.live()) setMove(this.sim, this.direction())
  }

  private use(control: 'left' | 'right' | 'jump') {
    this.used[control] = true
    this.bump()
  }

  /** The ghost hand and the pulses teach the controls in the first room until its kitten is home. */
  private helping() {
    return this.screen === 'play' && this.index === 0 && !this.save.found.includes(ROOMS[0]!.id)
  }

  // ------------------------------------------------------------------------------------- the frame

  /** Runs whole sim steps for `seconds` of real time (at most 0.1 s of it, so at most 12 steps), then everything the clock decides: cards, shouts, the end of a visit, the idle pause, the tune. */
  advance(seconds: number): Frame {
    const f = this.frame
    f.events.length = 0
    f.steps = 0
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME)
    this.clock += dt
    if (this.screen === 'play' && !this.paused && !(this.autoplaying && !this.plan)) {
      // The accumulator counts steps, so 0.1 s is exactly 12 of them; the 1e-9 forgives rounding in seconds * HZ.
      this.acc += dt * HZ
      while (this.acc >= 1 - 1e-9 && f.steps < MAX_STEPS) {
        // The bot's plan started on the fresh sim, tick 0: nothing steps until it is found.
        if (this.autoplaying) this.drive!(this.sim, this.plan!, 0)
        step(this.sim, this.room)
        for (const e of this.sim.events) {
          f.events.push(e)
          this.audio.play(e)
          const word = shoutFor(e)
          if (word) this.shout = { word, at: this.clock }
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
        if (since(s.phaseAt, s.tick * STEP) >= DONE_HOLD) this.leaveRoom()
      } else if (!this.paused && !this.autoplaying && this.clock - this.lastInputAt >= IDLE_FOR) this.pause()
      if (this.startCardUntil >= 0 && this.clock >= this.startCardUntil) this.startCardUntil = -1
      if (this.helping() && !this.paused) {
        const end = this.helpAt + HELP_FOR
        if (this.clock >= end && this.clock - Math.max(this.lastInputAt, end) >= HELP_IDLE) this.helpAt = this.clock
      }
    } else if (this.screen === 'picnic' && this.clock - this.picnicAt >= PICNIC_FOR) this.endPicnic()
    const home = this.homecoming
    if (home) {
      const times = homeTimes(home.stars)
      // The next card's padlock pops: a room card opens.
      if (home.opened >= 0 && !this.unlocked && this.clock - home.at >= times.padlockAt) {
        this.unlocked = true
        this.audio.ui('door')
      }
      if (this.clock - home.at >= times.end) this.homecoming = null
    }
    this.audio.setTune(this.tune(), this.screen === 'play' && this.sim.tick < this.sim.hero.ballUntil)
    this.watch()
  }

  private tune(): Tune {
    if (this.paused) return 'none'
    if (this.screen === 'rooms') return this.clock - this.lastInputAt >= IDLE_FOR ? 'none' : 'rooms'
    return this.screen === 'picnic' ? 'picnic' : this.room.id
  }

  /** Bumps the version when a value the HUD shows has changed on its own (a star, a shout, a card timing out). */
  private watch() {
    const seen = this.seen
    const stars = this.sim.stars
    const bubble = this.sim.hero.form === 'bubble'
    const shout = this.shouting ? this.shout!.at : -1
    const card = this.startCard
    const ghost = this.ghost
    const saying = this.saying
    const home = this.homecoming !== null
    const ending = this.ending
    if (stars === seen.stars && bubble === seen.bubble && shout === seen.shout && card === seen.card && ghost === seen.ghost && saying === seen.saying && home === seen.home && ending === seen.ending) return
    Object.assign(seen, { stars, bubble, shout, card, ghost, saying, home, ending })
    this.bump()
  }

  // ------------------------------------------------------------------------------------- the save and the bot

  private loadSave(): Save {
    // Storage can be missing or throw (private modes, blocked cookies): then the game keeps its save in memory.
    try {
      return parseSave(this.saves.getItem(SAVE_KEY))
    } catch (e) {
      this.warnStorage(e)
      return parseSave(null)
    }
  }

  /** Writes the save, except in a tuning run (?room), which reads the save but never writes it. */
  private storeSave() {
    if (this.switches.room !== null) return
    try {
      this.saves.setItem(SAVE_KEY, serializeSave(this.save))
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Pia Jump cannot use the browser storage, so this visit is not remembered:', e)
  }

  private loadBot() {
    void import('./bot').then(({ solve, drive }) => {
      // One frame of the room shows first: the search holds the page for a moment.
      setTimeout(() => {
        const plan = solve(this.room)
        if (!plan.ok) console.warn(`?autoplay: the bot found no way through ${this.room.id} and got to x ${plan.furthestX.toFixed(1)}; it plays what it found`)
        this.plan = plan
        this.drive = drive
      }, 100)
    })
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

export function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

const MOVE_KEYS: Record<string, -1 | 1> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ'])
const BUBBLE_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyX', 'KeyB'])
const OTHER_KEYS = new Set(['Escape', 'KeyP', 'KeyM', 'KeyF', 'Enter'])

/**
 * The keyboard and the page around the game. Arrows or A and D move (the last pressed
 * wins while both are down), Space, up, W or Z jump, down, S, X or B blow bubbles, Esc or P
 * pause, Enter resumes, M is the sound and F full screen; on the rooms screen left and right
 * step between the open cards and Space or Enter goes in. The page hiding, the window
 * losing focus, full screen ending and a return from the back-forward cache all pause the
 * room. Every gesture wakes the audio (iOS counts only pointerup, touchend, click and
 * keydown as gestures).
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const moves: (-1 | 1)[] = []
    const jumpKeys = new Set<string>()
    const bubbleKeys = new Set<string>()
    const steer = () => game.move('keys', moves.length > 0 ? moves[moves.length - 1]! : 0)
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const code = e.code
      const dir = MOVE_KEYS[code]
      if (dir === undefined && !JUMP_KEYS.has(code) && !BUBBLE_KEYS.has(code) && !OTHER_KEYS.has(code)) return
      e.preventDefault()
      game.poke()
      if (dir !== undefined) {
        if (!moves.includes(dir)) moves.push(dir)
        if (game.screen === 'rooms') {
          if (!e.repeat) game.moveHighlight(dir)
        } else steer()
        return
      }
      if (e.repeat) return
      if (JUMP_KEYS.has(code)) {
        jumpKeys.add(code)
        if (game.screen === 'rooms' && code === 'Space') game.enterHighlight()
        else game.jump('keys', true)
      } else if (BUBBLE_KEYS.has(code)) {
        bubbleKeys.add(code)
        game.bubble('keys', true)
      } else if (code === 'Escape' || code === 'KeyP') game.togglePause()
      else if (code === 'Enter') {
        if (game.screen === 'rooms') game.enterHighlight()
        else game.resume()
      } else if (code === 'KeyM') game.toggleSound()
      else if (code === 'KeyF') toggleFullscreen()
    }
    const up = (e: KeyboardEvent) => {
      const dir = MOVE_KEYS[e.code]
      if (dir !== undefined) {
        const i = moves.indexOf(dir)
        if (i >= 0) moves.splice(i, 1)
        steer()
      } else if (jumpKeys.delete(e.code) && jumpKeys.size === 0) game.jump('keys', false)
      else if (bubbleKeys.delete(e.code) && bubbleKeys.size === 0) game.bubble('keys', false)
    }
    // Keys let go while the window was elsewhere are never heard: forget them all.
    const away = () => {
      moves.length = 0
      jumpKeys.clear()
      bubbleKeys.clear()
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
