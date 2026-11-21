import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import { botStep, createBot, type Bot } from './bot'
import { SLOTS, type ItemId, type Pattern, type SlimeColour, type SlimeLook, type Slot } from './closet'
import { courseById } from './courses'
import { ANIMALS, COURSE_IDS, MAX_SIZE, type Animal, type CircleNumber, type CourseId, type Sim, type SimEvent } from './model'
import { FRESH, isOpen, nextGift, parseSave, serializeSave, withBaby, withColour, withFinish, withGift, withLearned, withOutfit, withPattern, withSound, withStars, type Save } from './progress'
import { createSim, go as goRun, pressJump, setBalls, setHide, setSteer, startAt, startTop, startTower, tick, windLoud } from './sim'
import { Sounds, type Loops, type SoundKind } from './sounds'

// A hot edit to this file or anything it runs (the sim, the courses, the sounds, the save) reloads the page, so an old
// run's tune never plays on beside a new one; edits to the scene and the HUD still swap in hot.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/** map: the islands. wardrobe: dressing the slime. play: a run of one course. */
export type Screen = 'map' | 'wardrobe' | 'play'

/** Where an input comes from: the keyboard or the thumbs on the screen. Each holds its own steering and hide. */
export type Source = 'keys' | 'touch'
const SOURCES: readonly Source[] = ['keys', 'touch']

/** The slime's hop from island to island on the map takes this long, in clock seconds. */
export const HOP_FOR = 0.8

/** The done card takes no Space, Enter or R this long (sim seconds), so keys mashed while the box opens never skip it; its buttons fade in over the same time. */
export const DONE_CALM = 1.2

/** A run pauses after this long with no input at all (clock seconds); on the map and in the wardrobe the tune falls silent instead. */
const IDLE_FOR = 60
const SAVE_KEY = 'slime-guy'

/** Every loop quiet: paused, the page away, or a map nobody has touched for a minute. */
const SILENT: Loops = { tune: null, wind: 0, rise: false }
const MAP_TUNE: Loops = { tune: 'map', wind: 0, rise: false }
/** What each animal of the measuring pole says. */
const VOICES: Record<Animal, SoundKind> = { mouse: 'mouse', cat: 'meow', dog: 'woof', pony: 'neigh', elephant: 'trumpet' }
/** A circle pops with a sparkle as big as its number; 100 is a little firework. */
const POPS: Record<CircleNumber, SoundKind> = { 1: 'pop1', 5: 'pop5', 100: 'pop100' }

/** The URL switches, read once at load (see the README). */
export interface Switches {
  /** ?course=<id or 1 to 5>: straight into that course whatever the locks; the save is never written. */
  course: CourseId | null
  /** &at=<z>: start the run from there. */
  at: number | null
  /** &size=<1 to 3>: start that big. */
  size: number | null
  /** &tower: start on the trampoline with the key. &top: start on the top with the box about to open. */
  tower: boolean
  top: boolean
  /** ?autoplay (with ?course): the careful bot plays. */
  autoplay: boolean
  /** ?all: every island open for this visit. */
  all: boolean
  /** ?fresh: a fresh save for this visit, never written (everything taught again). */
  fresh: boolean
  /** ?screen=wardrobe: open on the wardrobe. */
  wardrobe: boolean
}

/** Reads the switches from a query string. A bad value throws, saying what would be right. */
export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const courseText = p.get('course')
  let course: CourseId | null = null
  if (courseText !== null) {
    const n = /^\d+$/.test(courseText) ? Number(courseText) : 0
    const found = n >= 1 && n <= COURSE_IDS.length ? COURSE_IDS[n - 1] : COURSE_IDS.find((id) => id === courseText)
    if (found === undefined) throw new Error(`?course=${courseText}: use one of ${COURSE_IDS.join(', ')}, or a number from 1 to ${COURSE_IDS.length}`)
    course = found
  }
  const number = (name: string, lo: number, hi: number, what: string) => {
    const text = p.get(name)
    if (text === null) return null
    const v = Number(text)
    if (text.trim() === '' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`&${name}=${text}: use ${what}`)
    return v
  }
  const at = number('at', 0, Infinity, 'a distance along the course, 0 or more')
  const size = number('size', 1, MAX_SIZE, `a size from 1 to ${MAX_SIZE}`)
  const tower = p.has('tower')
  const top = p.has('top')
  const autoplay = p.has('autoplay')
  const screen = p.get('screen')
  if (course === null && (at !== null || size !== null || tower || top || autoplay)) throw new Error('&at, &size, &tower, &top and ?autoplay need ?course=<island> too')
  if ([at !== null, tower, top].filter(Boolean).length > 1) throw new Error('&at, &tower and &top each say where the run starts: use only one of them')
  if (course !== null && at !== null) {
    const finish = courseById(course).finishZ
    if (at >= finish) throw new Error(`&at=${at}: ${course} finishes at ${finish}, so start before that`)
  }
  if (screen !== null && screen !== 'wardrobe') throw new Error(`?screen=${screen}: the only screen to open on is ?screen=wardrobe`)
  if (screen !== null && course !== null) throw new Error('?screen=wardrobe and ?course both say where to open: use one of them')
  return { course, at, size, tower, top, autoplay, all: p.has('all'), fresh: p.has('fresh'), wardrobe: screen !== null }
}

/** Something the jar did, for the HUD to show for a moment: a new pattern, or fireworks once all are open. */
export interface JarNews {
  patterns: Pattern[]
  fireworks: number
  at: number
}

/** The island the map starts on: the first open one not done yet, or the last once every one is done. */
function firstIsland(save: Save) {
  const i = COURSE_IDS.findIndex((id, at) => isOpen(save, at) && !save.done.includes(id))
  return i >= 0 ? i : COURSE_IDS.length - 1
}

/**
 * The running game: the screens (the map, the wardrobe, a run), the run's sim and the bot
 * that can play it, the pause, the input from keys and thumbs, the sounds and the save in the
 * browser. The stage calls `advance` once a frame and reads `sim`, `clock`, `generation` and
 * the hop; the HUDs subscribe to the version, which bumps only when something they show has
 * changed, and the stage to the screen key and the look.
 */
export class Game {
  readonly audio = new Sounds()
  readonly switches: Switches
  screen: Screen = 'map'
  save: Save = FRESH
  /** The island chosen on the map, and the course of the run. */
  index = 0
  /** The run being played, or the last one (the map does not read it). Replaced by a new object on every new run. */
  sim: Sim = null!
  paused = false
  /** Bumps with every new run: the play scene remounts. */
  generation = 0
  /** Real seconds the page has run (it stops while the page is hidden): every map and HUD timer reads it. */
  clock = 0
  /** A touch has been seen: the touch buttons show. */
  touch = false
  /** The map's hop: from which island, and the clock when it started (-1 before any). */
  hopFrom = 0
  hopAt = -1
  /** A locked island was tapped: which, and when (its cloud wobbles). */
  locked: { index: number; at: number } | null = null
  jarNews: JarNews | null = null
  /** The look `getLook` hands out: a new object only when the save's colour, pattern or outfit changes. */
  private look: SlimeLook
  private screenKey = 'map:0'
  private version = 0
  /** What the HUDs last saw, all of it in one string. */
  private shown = ''
  /** Counts every new save, so the snapshot sees any change to it. */
  private savesMade = 0
  private listeners = new Set<() => void>()
  private lastInputAt = 0
  /** The page is hidden or the window has lost focus: every loop stays silent until it is back. */
  private away = false
  /** Each source's steering, and a stamp of when it last turned to a new way: the newest wins. */
  private dirs: Record<Source, -1 | 0 | 1> = { keys: 0, touch: 0 }
  private dirAt: Record<Source, number> = { keys: 0, touch: 0 }
  private dirCount = 0
  /** The sources holding hide: the slime keeps its arms in while any does. */
  private hides = new Set<Source>()
  /** ?autoplay: the careful child at the keys of every run. */
  private bot: Bot | null = null
  private storageWarned = false

  private readonly saves: Saves

  constructor(saves: Saves) {
    this.saves = saves
    this.switches = readSwitches(location.search)
    const sw = this.switches
    const saved = sw.fresh ? FRESH : this.loadSave()
    this.index = firstIsland(saved)
    this.hopFrom = this.index
    // ?all opens every island by counting every one done; a save like that is never written.
    this.save = sw.all ? { ...saved, done: [...COURSE_IDS] } : saved
    const s = this.save
    this.look = { colour: s.colour, pattern: s.pattern, outfit: s.outfit }
    this.audio.setMuted(!s.sound)
    if (sw.course !== null) {
      this.index = COURSE_IDS.indexOf(sw.course)
      this.hopFrom = this.index
      this.play()
    } else if (sw.wardrobe) this.screen = 'wardrobe'
    this.changed()
  }

  /** One frame: advances the clock, the run (when playing and not paused), the sounds and the save; tells the HUD when there is news. */
  advance(dt: number) {
    this.clock += dt
    if (this.screen === 'play' && !this.paused) {
      const s = this.sim
      if (this.bot !== null) botStep(s, this.bot)
      tick(s, dt)
      for (const e of s.events) this.hear(s.course.id, e)
      s.events.length = 0
      if (this.bot === null && this.clock - this.lastInputAt >= IDLE_FOR) this.pause()
    }
    this.audio.setLoops(this.loops())
    this.changed()
  }

  // ---------------------------------------------------------------- the map
  /** Tap on an island: hop there if open (or play it if already there); a locked one wobbles its cloud. */
  chooseIsland(index: number) {
    if (this.screen !== 'map') return
    if (index < 0 || index >= COURSE_IDS.length) throw new Error(`chooseIsland(${index}): the islands are 0 to ${COURSE_IDS.length - 1}`)
    if (!isOpen(this.save, index)) {
      this.locked = { index, at: this.clock }
      this.audio.play('uhuh')
    } else if (index !== this.index) this.hopTo(index)
    // A tap on the island the slime is still hopping to only lands it; once there, the next tap plays.
    else if (this.clock - this.hopAt >= HOP_FOR) this.play()
    this.changed()
  }

  /** One island left or right, skipping locked ones (the keyboard). */
  stepIsland(dir: -1 | 1) {
    if (this.screen !== 'map') return
    for (let i = this.index + dir; i >= 0 && i < COURSE_IDS.length; i += dir) {
      if (isOpen(this.save, i)) {
        this.hopTo(i)
        this.changed()
        return
      }
    }
    // Nothing open that way: the next island's cloud wobbles, or at the end of the row a "nuh-uh" alone.
    const next = this.index + dir
    if (next >= 0 && next < COURSE_IDS.length) this.locked = { index: next, at: this.clock }
    this.audio.play('uhuh')
    this.changed()
  }

  /** A new run of the chosen island: a fresh sim with what the save knows (the kinds taught, the babies home, the next gift), started where the URL says on a switched course. */
  play() {
    const id = COURSE_IDS[this.index]!
    const save = this.save
    const s = createSim(courseById(id), { learned: [...save.learned], babiesHome: save.babies[id], gift: nextGift(save, id) })
    const sw = this.switches
    if (id === sw.course) {
      if (sw.size !== null) setBalls(s, Math.round(((sw.size - 1) / (MAX_SIZE - 1)) * s.course.balls.length))
      if (sw.at !== null) startAt(s, sw.at)
      if (sw.tower) startTower(s)
      if (sw.top) startTop(s)
    }
    this.sim = s
    this.generation += 1
    this.screen = 'play'
    this.paused = false
    this.jarNews = null
    this.locked = null
    this.hides.clear()
    this.bot = sw.autoplay ? createBot() : null
    this.lastInputAt = this.clock
    // A steering key still held from the map steers the new run at once.
    this.feedSteer()
    this.audio.play('select')
    this.changed()
  }

  openWardrobe() {
    if (this.screen !== 'map') return
    this.screen = 'wardrobe'
    this.audio.play('tap')
    this.changed()
  }

  closeWardrobe() {
    if (this.screen !== 'wardrobe') return
    this.screen = 'map'
    this.audio.play('tap')
    this.changed()
  }

  // ---------------------------------------------------------------- a run
  /** The ready card's Go: the card goes at once, not a frame later. */
  go() {
    if (!this.live()) return
    goRun(this.sim)
    this.changed()
  }

  /** A source's steering. The sim gets the newest way any source still holds. */
  steer(source: Source, dir: -1 | 0 | 1) {
    if (dir !== 0 && dir !== this.dirs[source]) this.dirAt[source] = ++this.dirCount
    this.dirs[source] = dir
    this.feedSteer()
  }

  jump() {
    if (!this.live()) return
    pressJump(this.sim)
  }

  /** A source's hide button down or up: the arms go in when the first source holds it and may come out when the last lets go. */
  hide(source: Source, held: boolean) {
    if (held) {
      if (!this.live()) return
      if (this.hides.size === 0) setHide(this.sim, true)
      this.hides.add(source)
    } else if (this.hides.delete(source) && this.hides.size === 0) setHide(this.sim, false)
  }

  /** Everything a source holds lets go. */
  release(source: Source) {
    this.steer(source, 0)
    this.hide(source, false)
  }

  /** The same island again from the start. */
  again() {
    if (this.screen !== 'play') return
    this.play()
  }

  /** Back to the map; after a finished run the next island is chosen and the slime hops there. */
  toMap() {
    if (this.screen !== 'play') return
    const finished = this.sim.phase === 'done'
    this.screen = 'map'
    this.paused = false
    this.hides.clear()
    this.bot = null
    this.lastInputAt = this.clock
    const next = this.index + 1
    if (finished && next < COURSE_IDS.length && isOpen(this.save, next)) this.hopTo(next)
    else this.audio.play('tap')
    this.changed()
  }

  pause() {
    if (this.screen !== 'play' || this.paused) return
    this.paused = true
    // The sim holds nothing while the menu is up; on resume a way still held steers again, but hide must be pressed anew.
    setSteer(this.sim, 0)
    if (this.hides.size > 0) {
      this.hides.clear()
      setHide(this.sim, false)
    }
    this.changed()
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.lastInputAt = this.clock
    this.feedSteer()
    this.changed()
  }

  /** The page hid or the window lost focus: everything held lets go, a run pauses, and the loops fall silent now, as no frame may come to do it. */
  goAway() {
    for (const source of SOURCES) this.release(source)
    this.pause()
    this.away = true
    this.audio.setLoops(SILENT)
  }

  /** The page is in front again: the map's tune may play (a run stays paused until Keep going). */
  comeBack() {
    this.away = false
  }

  /** Any input at all: keeps a run from pausing for want of input, and wakes the map's tune. */
  poke() {
    this.lastInputAt = this.clock
    this.away = false
  }

  // ---------------------------------------------------------------- settings and the wardrobe
  toggleMute() {
    this.keep(withSound(this.save, !this.save.sound))
    this.audio.setMuted(!this.save.sound)
    this.audio.play('tap')
    this.changed()
  }

  wear(slot: Slot, item: ItemId | null) {
    this.keep(withOutfit(this.save, slot, item))
    this.audio.play(item === null ? 'tap' : 'wear')
    this.changed()
  }

  setColour(colour: SlimeColour) {
    this.keep(withColour(this.save, colour))
    this.audio.play('select')
    this.changed()
  }

  setPattern(pattern: Pattern | null) {
    this.keep(withPattern(this.save, pattern))
    this.audio.play('select')
    this.changed()
  }

  /** A touch was seen anywhere: show the touch buttons from now on. */
  sawTouch() {
    if (this.touch) return
    this.touch = true
    this.changed()
  }

  // ---------------------------------------------------------------- inside

  /** The player steers the sim now: in a run, not paused, not the bot's turn. */
  private live() {
    return this.screen === 'play' && !this.paused && this.bot === null
  }

  private feedSteer() {
    if (!this.live()) return
    let best: Source | null = null
    for (const s of SOURCES) if (this.dirs[s] !== 0 && (best === null || this.dirAt[s] > this.dirAt[best])) best = s
    setSteer(this.sim, best === null ? 0 : this.dirs[best])
  }

  private hopTo(index: number) {
    this.hopFrom = this.index
    this.index = index
    this.hopAt = this.clock
    this.audio.play('hop')
  }

  /** What one thing that happened in the run sounds like, and what it changes in the save. */
  private hear(id: CourseId, e: SimEvent) {
    const a = this.audio
    switch (e.kind) {
      case 'go':
        a.play('go')
        break
      case 'jump':
        a.play(e.big ? 'jumpBig' : 'pip')
        break
      case 'land':
        a.play(e.big ? 'landBig' : 'land')
        break
      case 'bounce':
        a.play('bounce')
        break
      case 'hide':
        a.play('squish')
        a.play('giggle')
        break
      case 'show':
        a.play('unsquish')
        break
      case 'ball':
        a.play('plop')
        break
      case 'burp':
        a.play('burp')
        break
      case 'baby':
        a.play('squeal')
        this.keep(withBaby(this.save, id, e.index))
        break
      case 'hit':
        a.play('hit')
        if (e.dropped > 0) a.play('drop')
        break
      case 'bump':
        a.play('bump')
        break
      case 'climb':
        a.play('climb')
        break
      case 'over':
        a.play('over')
        break
      case 'windUp':
        a.play('windUp')
        break
      case 'spun':
        a.play('spun')
        break
      case 'sneeze':
        a.play('sneeze')
        break
      case 'pad':
        a.play('pad')
        a.play('whee')
        break
      case 'slide':
        a.play('whee')
        break
      case 'splash':
        a.play('splash')
        break
      case 'fish':
        a.play('ptui')
        break
      case 'back':
        a.play('back')
        break
      case 'flag':
        a.play('flag')
        break
      case 'easy':
        a.play('easy')
        break
      case 'key':
        a.play('key')
        break
      case 'measure': {
        const animal = ANIMALS[e.animal]
        if (animal === undefined) throw new Error(`measure: no animal ${e.animal}`)
        a.play(VOICES[animal])
        this.keep(withFinish(this.save, id, e.animal))
        break
      }
      case 'trampoline':
        a.play('trampoline')
        break
      case 'pop': {
        a.play(POPS[e.n])
        const jar = withStars(this.save, e.n)
        this.keep(jar.save)
        if (jar.patterns.length > 0 || jar.fireworks > 0) {
          // One run can fill the jar more than once: its news adds up until the next run.
          const was = this.jarNews
          this.jarNews = { patterns: was === null ? jar.patterns : [...was.patterns, ...jar.patterns], fireworks: (was === null ? 0 : was.fireworks) + jar.fireworks, at: this.clock }
          a.play('jar')
          a.play(jar.fireworks > 0 ? 'fireworks' : 'pattern')
        }
        break
      }
      case 'bonk':
        a.play('bonk')
        break
      case 'funnel':
        a.play('funnel')
        break
      case 'top':
        a.play('top')
        break
      case 'unlock':
        a.play('unlock')
        break
      case 'open':
        a.play('open')
        break
      case 'gift':
        a.play('gift')
        a.play('fanfare')
        if (e.item !== null) this.keep(withGift(this.save, e.item))
        break
      case 'cheer':
        a.play('cheer')
        break
      case 'done':
        break
      case 'teach':
        a.play('teach')
        break
      case 'learned':
        a.play('learned')
        this.keep(withLearned(this.save, e.what))
        break
      default: {
        const missed: never = e
        throw new Error(`no sound for ${JSON.stringify(missed)}`)
      }
    }
  }

  /** The loops for this frame: the island's tune, the fans' wind and the tower's whoosh in a run; the map's tune elsewhere; silence while paused or away. */
  private loops(): Loops {
    if (this.away) return SILENT
    if (this.screen !== 'play') return this.clock - this.lastInputAt >= IDLE_FOR ? SILENT : MAP_TUNE
    if (this.paused) return SILENT
    const s = this.sim
    return { tune: s.course.id, wind: windLoud(s), rise: s.phase === 'tower' }
  }

  /** A new save: kept, written at once (never on a tuning visit), and a new look when what the slime wears changed. */
  private keep(save: Save) {
    this.save = save
    this.savesMade += 1
    const l = this.look
    if (save.colour !== l.colour || save.pattern !== l.pattern || SLOTS.some((slot) => save.outfit[slot] !== l.outfit[slot])) this.look = { colour: save.colour, pattern: save.pattern, outfit: save.outfit }
    const sw = this.switches
    if (sw.course !== null || sw.fresh || sw.all) return
    try {
      this.saves.setItem(SAVE_KEY, serializeSave(save))
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private loadSave(): Save {
    // Storage can be missing or throw (private modes, blocked cookies): then the game keeps its save in memory.
    try {
      return parseSave(this.saves.getItem(SAVE_KEY))
    } catch (e) {
      this.warnStorage(e)
      return parseSave(null)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Slime Guy cannot use the browser storage, so this visit is not remembered:', e)
  }

  /** Bumps the version, and tells every subscriber, when anything a HUD shows has changed: all of it in one string, as castle-builder keeps it. */
  private changed() {
    this.screenKey = `${this.screen}:${this.generation}`
    let run = ''
    if (this.screen === 'play') {
      const s = this.sim
      let babies = 0
      for (const b of s.babies) if (b.takenAt >= 0) babies |= 1 << b.index
      const f = s.finish
      run = `${s.phase}|${f.keyAt >= 0}|${f.measureAt >= 0 ? f.animal : -1}|${babies}|${s.stars}|${s.teach === null ? '' : s.teach.action}|${s.checkpoint}`
    }
    const snapshot = `${this.screenKey}|${this.paused}|${this.touch}|${this.index}|${this.savesMade}|${this.hopAt}|${this.locked === null ? -1 : this.locked.at}|${this.jarNews === null ? -1 : this.jarNews.at}|${run}`
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
  getScreenKey = () => this.screenKey
  /** The look of the slime now; the same object until the save's colour, pattern or outfit changes. */
  getLook = (): SlimeLook => this.look
}

/** Re-renders the caller whenever anything the HUD shows changes; returns the game. */
export function useGameView(game: Game) {
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game
}

/** Re-renders the caller only when the screen or the run changes. */
export function useScreenKey(game: Game) {
  return useSyncExternalStore(game.subscribe, game.getScreenKey)
}

/** Re-renders the caller only when the slime's look changes, with the look. */
export function useLook(game: Game) {
  return useSyncExternalStore(game.subscribe, game.getLook)
}

const STEER_KEYS: Partial<Record<string, -1 | 1>> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
const JUMP_KEYS = new Set(['ArrowUp', 'KeyW', 'Space'])
const HIDE_KEYS = new Set(['ArrowDown', 'KeyS'])
const OTHER_KEYS = new Set(['Enter', 'Escape', 'KeyR', 'KeyC', 'KeyM', 'KeyF'])

/**
 * The keyboard on every screen, and the page around the game. In a run: arrows or A and D
 * steer (the last pressed wins while both are down), up, W or Space jump, down or S hides
 * while held, Enter or Space is Go on the ready card and Map on the done card, R is Again
 * there, Esc pauses and resumes, and Enter or Space resumes too. On the map: left and right
 * step the islands, Space or Enter plays, C opens the wardrobe; in the wardrobe Esc goes back.
 * M is the sound and F full screen everywhere. The page hiding, the window losing focus,
 * full screen ending and a return from the back-forward cache all pause a run. Every gesture
 * wakes the audio, and a touch shows the touch buttons.
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    /** The steering keys held, newest last, and the hide keys held. */
    const steers: string[] = []
    const hides = new Set<string>()
    const steer = () => game.steer('keys', steers.length > 0 ? STEER_KEYS[steers[steers.length - 1]!]! : 0)
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const code = e.code
      const dir = STEER_KEYS[code]
      if (dir === undefined && !JUMP_KEYS.has(code) && !HIDE_KEYS.has(code) && !OTHER_KEYS.has(code)) return
      e.preventDefault()
      game.poke()
      if (dir !== undefined) {
        if (!steers.includes(code)) steers.push(code)
        steer()
        if (game.screen === 'map' && !e.repeat) game.stepIsland(dir)
        return
      }
      if (e.repeat) return
      if (HIDE_KEYS.has(code)) {
        hides.add(code)
        game.hide('keys', true)
        return
      }
      if (code === 'KeyM') game.toggleMute()
      else if (code === 'KeyF') toggleFullscreen()
      else if (game.screen === 'map') {
        if (code === 'Space' || code === 'Enter') game.play()
        else if (code === 'KeyC') game.openWardrobe()
      } else if (game.screen === 'wardrobe') {
        if (code === 'Escape') game.closeWardrobe()
      } else if (code === 'Escape') {
        if (game.paused) game.resume()
        else game.pause()
      } else if (game.paused) {
        if (code === 'Space' || code === 'Enter') game.resume()
      } else {
        const s = game.sim
        if (s.phase === 'ready') {
          if (code === 'Space' || code === 'Enter') game.go()
          else if (JUMP_KEYS.has(code)) game.jump()
        } else if (s.phase === 'done') {
          if (s.time - s.phaseAt < DONE_CALM) return
          if (code === 'Space' || code === 'Enter') game.toMap()
          else if (code === 'KeyR') game.again()
        } else if (JUMP_KEYS.has(code)) game.jump()
      }
    }
    const up = (e: KeyboardEvent) => {
      const i = steers.indexOf(e.code)
      if (i >= 0) {
        steers.splice(i, 1)
        steer()
      } else if (hides.delete(e.code) && hides.size === 0) game.hide('keys', false)
    }
    // Keys let go while the window was elsewhere are never heard: forget them all.
    const away = () => {
      steers.length = 0
      hides.clear()
      game.goAway()
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') away()
      else game.comeBack()
    }
    const focus = () => game.comeBack()
    const fullscreen = () => {
      if (!document.fullscreenElement) game.pause()
    }
    const pageshow = (e: PageTransitionEvent) => {
      if (e.persisted) away()
    }
    const pointer = (e: PointerEvent) => {
      game.poke()
      if (e.pointerType === 'touch') game.sawTouch()
    }
    // Browsers make no sound before a gesture, and iOS counts only these as gestures.
    const unlock = () => game.audio.unlock()
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'] as const
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    window.addEventListener('focus', focus)
    window.addEventListener('pageshow', pageshow)
    window.addEventListener('pointerdown', pointer, true)
    for (const g of gestures) window.addEventListener(g, unlock, true)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', focus)
      window.removeEventListener('pageshow', pageshow)
      window.removeEventListener('pointerdown', pointer, true)
      for (const g of gestures) window.removeEventListener(g, unlock, true)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', fullscreen)
    }
  }, [game])
}

/** Full screen on and off, where the browser has it (an iPhone does not). */
export function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}
