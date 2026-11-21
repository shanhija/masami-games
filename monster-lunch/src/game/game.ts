import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import { createBot } from './bot'
import { parseCourse } from './course'
import { COURSE_TEXTS } from './courses'
import { catcher, createFeed, steerFeed, stepFeed } from './feed'
import { COURSES, DISHES, FILLINGS, HZ, MAX_PICKS, since, type Course, type Dish, type Feed, type FeedEvent, type Filling, type Sim, type SimEvent } from './model'
import { courseDone, coursesDone, isOpen, openCourse, openFillings, parseSave, rememberDish, sawFillings, serializeSave, startFresh, type Save } from './progress'
import { createSim, setInput, step } from './sim'
import { Sounds, tuneSeconds, type Tune } from './sounds'

// A hot edit to this file or anything it runs (the sims, the courses, the sounds, the save) reloads the page, so an old game's music never plays on
// beside a new one. Vite's hot.decline() does nothing, so this module takes the update itself and reloads; edits to the art still swap in hot.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/** courses: the five course cards. kitchen: picking the dish. play: on the course. feed: the balloon over the monster. party: after the last course, once. */
export type Screen = 'courses' | 'kitchen' | 'play' | 'feed' | 'party'
/** The kitchen asks two things: which dish, then what goes inside. */
export type KitchenStep = 'dish' | 'fillings'
/** The moments that pop up a word, and nothing else; words.ts says each in the player's language. */
export type Shout = 'yum' | 'yuck' | 'oops' | 'splash' | 'hooray' | 'burger' | 'croissant' | 'hurry'

/** What one call to `advance` did: how many steps ran, how far into the next step the picture is, and every event of those steps. One object, reused. */
export interface Frame {
  steps: number
  alpha: number
  events: (SimEvent | FeedEvent)[]
}

/** Where an input comes from: the keyboard, or a finger (or a held mouse button) on the picture. */
export type Source = 'keys' | 'touch'

/**
 * Where the renderer last drew things, in CSS pixels, so a finger can steer: her feet on the
 * course and a tile's size there; in the finale, the scene's top-left corner and its pixels per tile.
 */
export interface Screenspace {
  heroX: number
  heroY: number
  tile: number
  feedLeft: number
  feedTop: number
  feedScale: number
}

/** At most this much real time a frame, so a stall never fast-forwards the course; 12 steps at 120 Hz. */
const MAX_FRAME = 0.1
const MAX_STEPS = 12
const SHOUT_FOR = 0.9
/** A finger closer to her feet than this (in tiles) stops her; from WALK_FULL away she walks at full speed. */
const FINGER_STILL = 0.35
const WALK_FULL = 1.2
/** The stars stay up this long after the finale before the cards come back (a tap after STARS_MIN goes sooner). */
const STARS_HOLD = 4.5
const STARS_MIN = 1.6
/** The party plays its tune to the end and a second more; a tap ends it once it has played PARTY_MIN. */
const PARTY_MIN = 3
/** A fresh card screen takes no taps this long, so the tap that ended the stars never lands on a card. */
const CALM_FOR = 0.5
/** This long with no input pauses a course or a finale. */
const IDLE_FOR = 60
/** The first course's ghost hand shows HELP_FOR at the start and again after HELP_IDLE with no input. */
export const HELP_FOR = 5
const HELP_IDLE = 10
const SAVE_KEY = 'monster-lunch'

/** A monster fed, back on its card: the stars of this visit, whether they beat the best, the card it opened and whether new fillings came with it. */
export interface Homecoming {
  index: number
  stars: number
  better: boolean
  opened: number
  newFood: boolean
  at: number
}

/** The URL switches, read once at load. */
export interface Switches {
  /** ?course=<id or 1-based number>: open that course's kitchen whatever the locks, and never write the save. */
  course: number | null
  /** &dish=burger|croissant and &fill=<filling,filling>: with ?course, straight onto the course with that dish. */
  dish: Dish | null
  fill: Filling[] | null
  /** ?feed (with ?course): straight to the finale with a pile of every food the course has. */
  feed: boolean
  /** ?autoplay (with ?course): the bot walks the course and the catcher plays the finale. */
  autoplay: boolean
  /** ?all: every course and every filling open, for this visit. */
  all: boolean
  /** ?party: the party after the last course, straight away. */
  party: boolean
}

/** Reads the switches from a query string. A bad value throws, saying what would be right. */
export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const courseText = p.get('course')
  let course: number | null = null
  if (courseText !== null) {
    const n = /^\d+$/.test(courseText) ? Number(courseText) - 1 : -1
    course = n >= 0 && n < COURSES.length ? n : COURSES.indexOf(courseText as (typeof COURSES)[number])
    if (course < 0) throw new Error(`?course=${courseText}: use one of ${COURSES.join(', ')}, or a number from 1 to ${COURSES.length}`)
  }
  const dishText = p.get('dish')
  const dish = dishText === null ? null : (DISHES.find((d) => d === dishText) ?? null)
  if (dishText !== null && dish === null) throw new Error(`&dish=${dishText}: use burger or croissant`)
  const fillText = p.get('fill')
  let fill: Filling[] | null = null
  if (fillText !== null) {
    if (dish === null) throw new Error('&fill needs &dish=burger or &dish=croissant too')
    const list = FILLINGS[dish] as readonly Filling[]
    fill = fillText.split(',').map((f) => {
      const found = list.find((x) => x === f)
      if (!found) throw new Error(`&fill=${f}: a ${dish} takes ${list.join(', ')}`)
      return found
    })
    if (fill.length === 0 || fill.length > MAX_PICKS) throw new Error(`&fill: one to ${MAX_PICKS} fillings`)
  }
  const feed = p.has('feed')
  const autoplay = p.has('autoplay')
  if (course === null && (dish !== null || fill !== null || feed || autoplay)) throw new Error('&dish, &fill, ?feed and ?autoplay need ?course=<id> too')
  return { course, dish, fill, feed, autoplay, all: p.has('all'), party: p.has('party') }
}

const parsed: Course[] = []
/** The course at `index`, parsed once. */
export function courseAt(index: number): Course {
  return (parsed[index] ??= parseCourse(COURSE_TEXTS[index]!))
}

/** The shout a moment pops up, if it pops one up. */
export function shoutFor(e: SimEvent | FeedEvent): Shout | null {
  switch (e.kind) {
    case 'pick':
      return e.food === 'poop' ? 'yuck' : e.n % 5 === 0 ? 'yum' : null
    case 'bonk':
      return e.n > 0 ? 'oops' : null
    case 'zap':
      return 'oops'
    case 'splash':
      return 'splash'
    case 'warn':
      return 'hurry'
    case 'finish':
      return 'hooray'
    case 'bread':
      return e.dish
    case 'bleh':
      return 'yuck'
    case 'full':
      return 'yum'
    default:
      return null
  }
}

/**
 * The running game: the screens, the course and its sim, the finale, the kitchen's choice,
 * the pause, the save, the input from keys and fingers, and the sounds' lifecycle. The stage
 * reads `screen`, `course`, `sim`, `feed`, `generation` and `paused` every frame and calls
 * `advance` once a frame, which also keeps the game's own clock; the HUD subscribes to the
 * version, which bumps whenever something it shows has changed.
 */
export class Game {
  readonly audio = new Sounds()
  readonly switches: Switches
  screen: Screen = 'courses'
  /** Index into COURSES of the course played, picked in the kitchen, or drifting behind the cards. */
  index = 0
  course: Course
  sim: Sim
  /** The finale, from the moment the balloon lifts off. */
  feed: Feed | null = null
  kitchen: KitchenStep = 'dish'
  dish: Dish
  picks: Filling[] = []
  paused = false
  /** Bumps whenever a new sim or finale starts: the stage forgets its camera and particles. */
  generation = 0
  save: Save
  /** Real seconds the page has run (it stops while the page is hidden): every timer of the HUD reads it. */
  clock = 0
  shout: { id: Shout; at: number } | null = null
  homecoming: Homecoming | null = null
  /** The finale's stars went up at this clock, or -1. */
  starsAt = -1
  partyAt = -1
  /** The ghost hand's current showing started at this clock, or -1. */
  helpAt = -1
  /** Where the renderer drew things last frame. */
  readonly screenspace: Screenspace = { heroX: 0, heroY: 0, tile: 64, feedLeft: 0, feedTop: 0, feedScale: 64 }
  private calmUntil = -1
  private acc = 0
  private frame: Frame = { steps: 0, alpha: 0, events: [] }
  private version = 0
  private listeners = new Set<() => void>()
  private lastInputAt = 0
  /** This finale's stars are saved; `home` is the homecoming they will show, `party` whether the party comes first. */
  private recorded = false
  private home: Homecoming | null = null
  private party = false
  /** The keys' direction, the finger's place (CSS px, or null when lifted), and which of the two moved last. */
  private keys = { x: 0, y: 0 }
  private finger: { x: number; y: number } | null = null
  private newest: Source = 'keys'
  private bot: ((s: Sim, course: Course) => void) | null = null
  private storageWarned = false
  /** What the HUD last saw of the values that change on their own. */
  private seen = { plate: -1, shout: -2, ghost: false, stars: false, phase: '', feedPhase: '', left: -1, home: false }

  private readonly saves: Saves

  /** `search` is the page's query string: the switches (see Switches); `saves` are the player's. */
  constructor(search: string, saves: Saves) {
    this.saves = saves
    this.switches = readSwitches(search)
    this.save = this.loadSave()
    this.audio.setSound(this.save.sound)
    this.audio.setMusic(this.save.music)
    this.dish = this.save.dish
    const sw = this.switches
    this.index = sw.course ?? Math.max(0, this.nextCourse())
    this.course = courseAt(this.index)
    this.sim = createSim(this.course, this.dish, this.save.picks[this.dish])
    if (sw.course !== null) {
      if (sw.dish !== null) this.dish = sw.dish
      if (sw.fill !== null || sw.feed || sw.autoplay) {
        this.picks = sw.fill ?? [...this.save.picks[this.dish]].filter((f) => (FILLINGS[this.dish] as readonly Filling[]).includes(f))
        // ?feed: the finale as if every food of the course had been picked up.
        if (sw.feed) this.startFeed(this.course.foods.map((_, k) => this.picks[k % this.picks.length]!))
        else this.startCourse()
      } else this.openKitchen(sw.course)
    }
    if (sw.party) {
      this.screen = 'party'
      this.partyAt = 0
    }
  }

  isOpen(index: number): boolean {
    return this.switches.all || isOpen(this.save, index)
  }

  /** The course to play next: the first open one not done yet, or -1 when every one is done. */
  nextCourse(): number {
    return COURSES.findIndex((id, i) => this.isOpen(i) && this.save.stars[id] === 0)
  }

  /** The fillings the kitchen offers for a dish now. */
  fillings(dish: Dish): readonly Filling[] {
    return openFillings(this.save, dish, this.switches.all)
  }

  /** Whether a filling is new since the kitchen last showed this dish. */
  isNew(dish: Dish, filling: Filling): boolean {
    const i = (FILLINGS[dish] as readonly Filling[]).indexOf(filling)
    return i >= this.save.seen[dish] && i < this.fillings(dish).length
  }

  /** The shout showing now, if any. */
  get shouting(): Shout | null {
    return this.shout && this.clock - this.shout.at < SHOUT_FOR ? this.shout.id : null
  }

  /** The first course and its finale teach the fingers until the course is done: the ghost hand. */
  get ghost() {
    return this.helping() && this.helpAt >= 0 && this.clock - this.helpAt < HELP_FOR
  }

  // ------------------------------------------------------------------------------------- screens

  /** A tap on a course card: its kitchen if it is open, a "nuh-uh" if not. Returns whether it opened. */
  tapCard(index: number): boolean {
    if (this.clock < this.calmUntil) return false
    if (!this.isOpen(index)) {
      this.audio.ui('locked')
      return false
    }
    this.audio.ui('card')
    this.openKitchen(index)
    return true
  }

  private openKitchen(index: number) {
    this.show(index)
    this.screen = 'kitchen'
    this.kitchen = 'dish'
    this.paused = false
    this.homecoming = null
    this.bump()
  }

  /** The kitchen's first question answered: on to the fillings, as they were for the same dish, else the last ones picked for it. */
  pickDish(dish: Dish) {
    const open = this.fillings(dish)
    this.picks = (dish !== this.dish || this.picks.length === 0 ? this.save.picks[dish] : this.picks).filter((f) => open.includes(f))
    if (this.picks.length === 0) this.picks = [open[0]!]
    this.dish = dish
    this.kitchen = 'fillings'
    this.audio.ui('dish')
    this.bump()
  }

  /** A filling tapped: in if there is room, out if it was in. Returns false when it could not go in (three already). */
  toggleFilling(filling: Filling): boolean {
    const i = this.picks.indexOf(filling)
    if (i >= 0) {
      this.picks.splice(i, 1)
      this.audio.ui('remove')
    } else if (this.picks.length >= MAX_PICKS) {
      this.audio.ui('locked')
      return false
    } else {
      this.picks.push(filling)
      this.audio.ui('add')
    }
    this.bump()
    return true
  }

  /** The kitchen's back arrow: from the fillings to the dishes, from the dishes to the cards. */
  kitchenBack() {
    this.audio.ui('tap')
    if (this.kitchen === 'fillings') {
      this.kitchen = 'dish'
      this.bump()
    } else this.showCourses(this.index)
  }

  /** "Go!": the course with the dish as picked, remembered for next time. */
  go() {
    if (this.picks.length === 0) return
    this.save = sawFillings(rememberDish(this.save, this.dish, this.picks), this.dish, openFillings(this.save, this.dish, false).length)
    this.storeSave()
    this.startCourse()
  }

  /** A fresh run of this course with the kitchen's dish: the plate empty, the go jingle, the tune after it. */
  private startCourse() {
    this.show(this.index)
    this.sim = createSim(this.course, this.dish, this.picks, (Math.random() * 2 ** 31) | 0)
    this.feed = null
    this.screen = 'play'
    this.paused = false
    this.recorded = false
    this.home = null
    this.party = false
    this.shout = null
    this.starsAt = -1
    this.lastInputAt = this.clock
    this.helpAt = this.helping() ? this.clock : -1
    this.bot = this.switches.autoplay ? createBot() : null
    this.audio.ui('go')
    this.feedInput()
    this.bump()
  }

  /** The balloon lifted off: the finale with what was on the plate. */
  private startFeed(pile: Sim['plate']) {
    this.feed = createFeed(this.course.id, this.dish, pile, this.course.foods.length)
    this.screen = 'feed'
    this.generation += 1
    this.acc = 0
    this.recorded = false
    this.starsAt = -1
    this.lastInputAt = this.clock
    this.helpAt = this.helping() ? this.clock : -1
    this.feedInput()
    this.bump()
  }

  /** "Start again": this course again with the same dish. */
  restart() {
    this.startCourse()
  }

  /** "Courses": back to the cards, this course's card first. */
  toCourses() {
    this.showCourses(this.index)
  }

  /** The parent gate on a locked card: open from now on. */
  unlockCourse(index: number) {
    this.save = openCourse(this.save, COURSES[index]!)
    this.storeSave()
    this.audio.ui('fresh')
    this.bump()
  }

  /** The parent gate's "Hold to start fresh": every course and its stars forgotten; the switches stay. */
  startFresh() {
    this.save = startFresh(this.save)
    this.storeSave()
    this.audio.ui('fresh')
    this.homecoming = null
    this.showCourses(0)
  }

  /** A sound for the parent gate's hold starting, and for it ending early. */
  holding(on: boolean) {
    this.audio.ui(on ? 'hold' : 'tap')
  }

  /** One of the finale's stars pops up (the HUD calls it as each appears). */
  starUp() {
    this.audio.ui('star')
  }

  private showCourses(index: number) {
    this.screen = 'courses'
    this.paused = false
    this.show(index)
    this.feed = null
    this.calmUntil = this.clock + CALM_FOR
    this.shout = null
    this.starsAt = -1
    this.lastInputAt = this.clock
    this.bump()
  }

  /** Course `index` with a fresh sim, for playing or for drifting behind the cards. */
  private show(index: number) {
    this.index = index
    this.course = courseAt(index)
    this.sim = createSim(this.course, this.dish, this.picks.length > 0 ? this.picks : this.save.picks[this.dish])
    this.generation += 1
    this.acc = 0
  }

  /** The finale is over: its stars saved at once, and what the cards will show. */
  private record() {
    const f = this.feed!
    const before = this.save
    const id = this.course.id
    this.save = courseDone(before, id, f.stars)
    this.recorded = true
    const next = this.index + 1
    const opened = next < COURSES.length && !this.switches.all && !isOpen(before, next) && isOpen(this.save, next) ? next : -1
    const newFood = coursesDone(this.save) > coursesDone(before) && DISHES.some((d) => openFillings(this.save, d, false).length > openFillings(before, d, false).length)
    this.home = { index: this.index, stars: f.stars, better: f.stars > before.stars[id], opened, newFood, at: -1 }
    this.party = !before.partied && COURSES.every((c) => this.save.stars[c] > 0)
    if (this.party) this.save = { ...this.save, partied: true }
    this.storeSave()
    this.starsAt = this.clock
  }

  /** After the stars: the party after the last course's first time, else the cards with the monster home. */
  private leaveFeed() {
    if (this.party) {
      this.screen = 'party'
      this.partyAt = this.clock
      this.feed = null
      this.shout = null
      this.starsAt = -1
      this.bump()
      return
    }
    const home = { ...this.home!, at: this.clock }
    this.showCourses(home.opened >= 0 ? home.opened : this.index)
    this.homecoming = home
    this.audio.ui('home')
    this.bump()
  }

  private endParty() {
    this.showCourses(this.index)
  }

  // ------------------------------------------------------------------------------------- pause

  pause() {
    if ((this.screen !== 'play' && this.screen !== 'feed') || this.paused || this.starsAt >= 0) return
    this.paused = true
    this.finger = null
    setInput(this.sim, 0, 0)
    if (this.feed) steerFeed(this.feed, 0, null)
    this.audio.suspend()
    this.bump()
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.lastInputAt = this.clock
    this.feedInput()
    this.bump()
  }

  togglePause() {
    if (this.paused) this.resume()
    else this.pause()
  }

  /** The page hid or the window lost focus: every held input lets go, the game pauses, the sound sleeps until the next touch. */
  away() {
    this.keys = { x: 0, y: 0 }
    this.finger = null
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

  /** Any input at all: keeps the game from pausing for want of input, and ends the stars or the party once they have shown a while. */
  poke() {
    this.lastInputAt = this.clock
    if (this.starsAt >= 0 && this.clock - this.starsAt >= STARS_MIN) this.leaveFeed()
    else if (this.screen === 'party' && this.clock - this.partyAt >= PARTY_MIN) this.endParty()
  }

  /** The keys' direction (each -1, 0 or 1). */
  keyDirection(x: number, y: number) {
    this.keys = { x, y }
    if (x !== 0 || y !== 0) this.newest = 'keys'
    this.feedInput()
  }

  /** A finger (or a held mouse button) on the picture at (x, y) in CSS pixels, or lifted (null). */
  point(at: { x: number; y: number } | null) {
    this.finger = at
    if (at) this.newest = 'touch'
    this.feedInput()
  }

  /** The player steers now: on the course or in the finale, not paused, not the bot's turn. */
  private live() {
    return (this.screen === 'play' || this.screen === 'feed') && !this.paused && !this.switches.autoplay
  }

  /** Hands the merged input to the sim or the finale. A finger steers from where her feet are drawn, so it is fed again every frame. */
  private feedInput() {
    if (!this.live()) return
    const touch = this.newest === 'touch' && this.finger !== null
    const ss = this.screenspace
    if (this.screen === 'play') {
      if (touch) {
        const dx = (this.finger!.x - ss.heroX) / ss.tile
        const dy = (this.finger!.y - ss.heroY) / ss.tile
        const d = Math.hypot(dx, dy)
        const k = d < FINGER_STILL ? 0 : Math.min(1, (d - FINGER_STILL) / (WALK_FULL - FINGER_STILL) + 0.35) / d
        setInput(this.sim, dx * k, dy * k)
      } else setInput(this.sim, this.keys.x, this.keys.y)
    } else if (this.feed) {
      if (touch) steerFeed(this.feed, 0, (this.finger!.x - ss.feedLeft) / ss.feedScale)
      else steerFeed(this.feed, this.keys.x < 0 ? -1 : this.keys.x > 0 ? 1 : 0, null)
    }
  }

  private helping() {
    return (this.screen === 'play' || this.screen === 'feed') && this.index === 0 && this.save.stars.park === 0 && !this.switches.autoplay
  }

  // ------------------------------------------------------------------------------------- the frame

  /** Runs whole steps for `seconds` of real time (at most 12 of them), then everything the clock decides: shouts, the end of a course or a finale, the idle pause, the tune. */
  advance(seconds: number): Frame {
    const f = this.frame
    f.events.length = 0
    f.steps = 0
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME)
    this.clock += dt
    const running = (this.screen === 'play' || (this.screen === 'feed' && this.feed !== null)) && !this.paused
    if (running) {
      this.feedInput()
      // The accumulator counts steps, so 0.1 s is exactly 12 of them; the 1e-9 forgives rounding in seconds * HZ.
      this.acc += dt * HZ
      while (this.acc >= 1 - 1e-9 && f.steps < MAX_STEPS) {
        const events = this.screen === 'play' ? this.stepCourse() : this.stepFinale()
        for (const e of events) {
          f.events.push(e)
          this.audio.play(e)
          const id = shoutFor(e)
          if (id) this.shout = { id, at: this.clock }
        }
        events.length = 0
        this.acc = Math.max(0, this.acc - 1)
        f.steps += 1
        if (this.screen !== 'play' && this.screen !== 'feed') break
      }
      if (f.steps === MAX_STEPS) this.acc = 0
    }
    f.alpha = this.acc
    this.update()
    return f
  }

  private stepCourse(): SimEvent[] {
    if (this.bot) this.bot(this.sim, this.course)
    step(this.sim, this.course)
    if (this.sim.phase === 'done') {
      const events = [...this.sim.events]
      this.sim.events.length = 0
      this.startFeed(this.sim.plate)
      return events
    }
    return this.sim.events
  }

  private stepFinale(): FeedEvent[] {
    const feed = this.feed!
    if (this.switches.autoplay) catcher(feed)
    if (feed.phase === 'done') return feed.events
    stepFeed(feed)
    return feed.events
  }

  private update() {
    // Steering with a finger held down or a key held is play, though no new press comes.
    if (this.finger !== null || this.keys.x !== 0 || this.keys.y !== 0) this.lastInputAt = this.clock
    if (this.screen === 'play' || this.screen === 'feed') {
      if (this.feed?.phase === 'done' && !this.recorded) this.record()
      if (this.starsAt >= 0 && this.clock - this.starsAt >= STARS_HOLD) this.leaveFeed()
      else if (!this.paused && !this.switches.autoplay && this.starsAt < 0 && this.clock - this.lastInputAt >= IDLE_FOR) this.pause()
      if (this.helping() && !this.paused && this.starsAt < 0) {
        const end = this.helpAt + HELP_FOR
        if (this.clock >= end && this.clock - Math.max(this.lastInputAt, end) >= HELP_IDLE) this.helpAt = this.clock
      }
    } else if (this.screen === 'party' && this.clock - this.partyAt >= tuneSeconds('party') + 1) this.endParty()
    if (this.homecoming && this.clock - this.homecoming.at >= 4) this.homecoming = null
    this.audio.setTune(this.tune())
    this.watch()
  }

  private tune(): Tune {
    if (this.paused) return 'none'
    if (this.screen === 'courses' || this.screen === 'kitchen') return 'menu'
    if (this.screen === 'party') return 'party'
    if (this.screen === 'feed') return 'feed'
    return this.course.id
  }

  /** Bumps the version when a value the HUD shows has changed on its own. */
  private watch() {
    const seen = this.seen
    const plate = this.sim.plate.length
    const shout = this.shouting ? this.shout!.at : -1
    const ghost = this.ghost
    const stars = this.starsAt >= 0
    const phase = this.sim.phase
    const feedPhase = this.feed?.phase ?? ''
    const left = this.feed ? this.feed.queue.length : -1
    const home = this.homecoming !== null
    if (plate === seen.plate && shout === seen.shout && ghost === seen.ghost && stars === seen.stars && phase === seen.phase && feedPhase === seen.feedPhase && left === seen.left && home === seen.home) return
    Object.assign(seen, { plate, shout, ghost, stars, phase, feedPhase, left, home })
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

  /** Writes the save, except in a tuning run (?course), which reads the save but never writes it. */
  private storeSave() {
    if (this.switches.course !== null) return
    try {
      this.saves.setItem(SAVE_KEY, serializeSave(this.save))
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Monster Lunch cannot use the browser storage, so this visit is not remembered:', e)
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

/** Seconds since the course's or the finale's phase began, for the HUD's timings. */
export function phaseAge(game: Game): number {
  if (game.screen === 'feed' && game.feed) return since(game.feed.phaseAt, game.feed.tick)
  return since(game.sim.phaseAt, game.sim.tick)
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

const DIRECTION_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
}
const OTHER_KEYS = new Set(['Escape', 'KeyP', 'KeyM', 'KeyF', 'Enter', 'Space'])

/**
 * The keyboard and the page around the game. Arrows or WASD walk (any mix of them: two at once
 * walk diagonally), Esc or P pause, Enter resumes, M is the sound and F full screen. The page
 * hiding, the window losing focus, full screen ending and a return from the back-forward cache
 * all pause the game. Every gesture wakes the audio (iOS counts only pointerup, touchend, click
 * and keydown as gestures).
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const held = new Set<string>()
    const steer = () => {
      let x = 0
      let y = 0
      for (const code of held) {
        const d = DIRECTION_KEYS[code]!
        x += d[0]
        y += d[1]
      }
      game.keyDirection(Math.sign(x), Math.sign(y))
    }
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const code = e.code
      if (!(code in DIRECTION_KEYS) && !OTHER_KEYS.has(code)) return
      e.preventDefault()
      game.poke()
      if (code in DIRECTION_KEYS) {
        held.add(code)
        steer()
        return
      }
      if (e.repeat) return
      if (code === 'Escape' || code === 'KeyP') game.togglePause()
      else if (code === 'Enter' || code === 'Space') game.resume()
      else if (code === 'KeyM') game.toggleSound()
      else if (code === 'KeyF') toggleFullscreen()
    }
    const up = (e: KeyboardEvent) => {
      if (held.delete(e.code)) steer()
    }
    // Keys let go while the window was elsewhere are never heard: forget them all.
    const away = () => {
      held.clear()
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
