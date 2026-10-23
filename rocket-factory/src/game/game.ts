import { useEffect, useSyncExternalStore } from 'react'

import type { StageGame } from '../draw/Stage'
import { working } from './band'
import { CORNER } from './board'
import { IDLE_MOST, IDLE_PAUSE, SESSION_GAP, card } from './catalog'
import { pageChild } from './child'
import { DEMOS, demoState, type Demo } from './fixtures'
import { hudView, pathOrder, sameHud, type HudView } from './hud'
import { middleOf, type HudFrame, type View } from './layout'
import { HZ, MUNCHER_MODES, STEP, type Action, type CardId, type EventKind, type Hit, type MunchersMode, type SimEvent, type State, type Sticker } from './model'
import { OLD_KEY, OLD_MOST, SAVE_KEY, freshKeep, isKeep, keepOf, parseKeep, parseOld, serializeKeep, serializeOld, stateFromKeep, worthKeeping, type Keep } from './progress'
import { act, step } from './rules'
import { Sounds, type UiSound } from './sounds'
import { Router, keyAction, type Press } from './touch'

// A hot edit to this file or anything it runs (the rules, the belts, the sounds, the save) reloads the page, so an old game's
// sounds never play on beside a new one; edits to the art still swap in hot.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/**
 * The running game: the browser glue round the pure state (plans/rocket-factory.md, Save,
 * pause and sessions; Engineering). The clock and its fixed 60 Hz step, the canvas's pointers
 * through the pointer router (touch.ts) against the view the stage drew, the tray's
 * pointers, keys through touch.ts keyAction, the pause and the automatic pause, sessions and
 * the morning after Good night, the save in localStorage (and another tab's), Start again's
 * old factories and a copy kept as a file, the URL switches, the sounds' lifecycle, full
 * screen, and the HUD's version. Every HUD button is an Action through `dispatch`; nothing here
 * changes the state but act and step (and a load, which makes one).
 */

/** What one call to `advance` did: how many steps ran, how far into the next step the picture is (0 to 1), and every event of those steps in order. One object, reused. */
export interface Frame {
  steps: number
  alpha: number
  events: SimEvent[]
}

/** At most this much real time a frame, so a stall never fast-forwards the factory: 6 steps at 60 Hz (?fast multiplies both). */
const MAX_FRAME = 0.1
const MAX_STEPS = 6
/** The save is checked every SAVE_EVERY seconds while the game runs, and written when the keep changed; at once after what she would hate to lose (SAVE_NOW), a pause and a page hide. */
const SAVE_EVERY = 2
const SAVE_NOW: ReadonlySet<EventKind> = new Set<EventKind>(['lay', 'repoint', 'bridge', 'join', 'fork', 'rollUp', 'hedgeIn', 'place', 'peel', 'oops', 'card', 'partFull', 'visitOver', 'landed'])
/** ?fast: at most this many times the speed. */
const FAST_MOST = 20
/** What Beep asks when the lab's one choice waits: the choice card's word. */
const WHICH_ONE = 'Which one?'

/** The URL switches, read once at load (plans/rocket-factory.md, Save: they may read the save and never write it). */
export interface UrlSwitches {
  /** ?demo=<scene>: a scene from fixtures.ts instead of the save. */
  demo: Demo | null
  /** ?nosave: a fresh game, never saved. */
  nosave: boolean
  /** ?seed=<n>: the random numbers' seed, so a run replays. */
  seed: number | null
  /** ?autoplay: the careful eager child of child.ts plays the page, Good night at its bedtime included. Only beside ?nosave or ?demo, so its play never reaches the save. */
  autoplay: boolean
  /** ?debug: the renderer's overlay (the grid, slots, paths, hunger, hit areas, the frame rate), and the game as `window.game` for a look from the console. */
  debug: boolean
  /** ?fast=<n>: the clock runs n times as fast (1 without it). */
  fast: number
  /** ?all: every card found, for looking. */
  all: boolean
  /** ?munchers=many|few|polite|none: the parent's switch for this run. */
  munchers: MunchersMode | null
}

/** Reads the switches from a query string. A bad value or a bad pair throws, saying what would do. Other parameters (?sheet) are left alone. */
export function readSwitches(search: string): UrlSwitches {
  const p = new URLSearchParams(search)
  const demoText = p.get('demo')
  const demo = demoText === null ? null : (DEMOS.find((d) => d === demoText) ?? undefined)
  if (demo === undefined) throw new Error(`?demo=${demoText}: use one of ${DEMOS.join(', ')}`)
  const seedText = p.get('seed')
  if (seedText !== null && !(/^-?\d{1,10}$/.test(seedText) && Math.abs(Number(seedText)) < 2 ** 31)) throw new Error(`?seed=${seedText}: use a whole number`)
  const fastText = p.get('fast')
  const fast = fastText === null ? 1 : Number(fastText)
  if (!(fast >= 1 && fast <= FAST_MOST)) throw new Error(`?fast=${fastText}: use a number from 1 to ${FAST_MOST}`)
  const munchersText = p.get('munchers')
  const munchers = munchersText === null ? null : (MUNCHER_MODES.find((m) => m === munchersText) ?? undefined)
  if (munchers === undefined) throw new Error(`?munchers=${munchersText}: use one of ${MUNCHER_MODES.join(', ')}`)
  const nosave = p.has('nosave')
  const autoplay = p.has('autoplay')
  if (autoplay && demo === null && !nosave) throw new Error('?autoplay: use it with ?nosave or ?demo, so the play is never saved')
  return { demo, nosave, seed: seedText === null ? null : Number(seedText), autoplay, debug: p.has('debug'), fast, all: p.has('all'), munchers }
}

/** A run with any switch is a test: it may read the save and never writes it. */
const isTest = (w: UrlSwitches) => w.demo !== null || w.nosave || w.seed !== null || w.autoplay || w.debug || w.fast !== 1 || w.all || w.munchers !== null

/** What plays the page with ?autoplay: the scripted child (child.ts pageChild), once a frame after the steps, through the same router and buttons a finger uses. */
export interface Player {
  frame(game: Game): void
}

/** ?all: every card on the path found (Bubbles! first), with their patterns. */
function openAll(s: State): void {
  s.found = pathOrder(s)
  s.choice = 'bubbles'
  s.patterns = 1 + s.found.filter((id) => card(id).pattern).length
}

const sameFrame = (a: HudFrame, b: HudFrame) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The running game. The stage (draw/Stage.tsx) calls `advance` once a frame, `setView` with
 * the view it drew and `pointer` for the canvas's pointers; the HUD reads `hud`, `paused`,
 * `path`, `old` and the view's frame, and subscribes to the version, which bumps whenever any
 * of them changes; every HUD button is an Action through `dispatch` or one of the methods
 * below.
 */
export class Game implements StageGame {
  state: State
  readonly audio = new Sounds()
  readonly url: UrlSwitches
  paused = false
  /** The lab card's whole path is open over the board. */
  path = false
  /** A tap on a sticker's empty hole, at this clock time: the lab card wiggles with that sticker peeking out from behind it. */
  peek: { sticker: Sticker; at: number } | null = null
  /** The factories Start again put aside (OLD_KEY), newest first, which Bring back fetches. */
  old: Keep[]
  /** How many times the game has come back from a pause: a card the pause cut off flips in again (the HUD keys it by this). */
  returns = 0
  /** How many taps the Good night card has had: each makes Beep murmur in its sleep and a z float up (the HUD keys the z by this). */
  murmurs = 0
  /** Real seconds the page has run: advance's clamped seconds summed (it stops while the page is hidden). */
  clock = 0
  /** The view the stage drew last: pointers hit-test against it, and the HUD lays itself out in its frame. Null before the first frame. */
  view: View | null = null
  hud: HudView
  /** The last pointer was a finger or a pen: Play and Keep going ask for full screen, and the gutters are a finger's. */
  touch = false
  private readonly router: Router
  private acc = 0
  private readonly frame: Frame = { steps: 0, alpha: 0, events: [] }
  /** The sim time the last frame was drawn at (the stage's own: a step behind the state, `alpha` into it): a pointer lands on what that frame showed. */
  private time: number
  private version = 0
  private listeners = new Set<() => void>()
  private readonly test: boolean
  private readonly seed: number
  private readonly player: Player | null
  /** The keep this tab last wrote (or loaded), so an unchanged one is not written again; and the save's text as the storage held it when this tab last read or wrote it. */
  private saved: string
  private stored: string | null
  /** Another tab wrote the save since: this tab writes no more, and takes the newer save when it is next shown. */
  private stale = false
  private savedAt = 0
  private storageWarned = false
  /** A write to the storage failed (private modes, blocked site data): the pause menu says the game is not saved. */
  private writeFailed = false
  private persistAsked = false
  private lastInput = 0
  /** What the sounds were last told. */
  private soundOn: boolean
  private musicOn: boolean
  private voiceOn: boolean
  /** When the game went away (paused or hidden, the Good night card's sleep too), wall-clock ms; null while it runs. A return after SESSION_GAP away is a new session. */
  private awayAt: number | null = null
  /** How many cards were found when today began (the page's load, a new session, a morning): the Good night card shows the rest. */
  private dayFrom: number
  /** Pointers pressed on a tray sticker, whose moves the page forwards (the button keeps them, not the canvas). */
  private readonly trays = new Set<number>()

  /** `search` is the page's query string (see UrlSwitches); `seed` seeds the random numbers unless ?seed does. */
  constructor(search: string, seed: number) {
    const w = (this.url = readSwitches(search))
    this.test = isTest(w)
    this.seed = w.seed ?? seed
    this.stored = this.read(SAVE_KEY)
    const s = w.demo !== null ? demoState(w.demo, this.seed) : stateFromKeep(w.nosave ? freshKeep() : parseKeep(this.stored), this.seed)
    if (w.all) openAll(s)
    if (w.munchers !== null) act(s, { kind: 'munchers', mode: w.munchers })
    this.state = s
    this.saved = serializeKeep(keepOf(s))
    this.old = parseOld(this.read(OLD_KEY))
    this.dayFrom = s.found.length
    this.time = (s.tick - 1) * STEP
    this.router = new Router((a) => this.dispatch(a))
    this.player = w.autoplay ? pageChild(this.seed) : null
    this.soundOn = s.switches.sound
    this.musicOn = s.switches.music
    this.voiceOn = s.switches.voice
    this.audio.setSound(this.soundOn)
    this.audio.setMusic(this.musicOn)
    this.audio.setVoice(this.voiceOn)
    this.hud = hudView(s, this.time, this.today())
  }

  get debug(): boolean {
    return this.url.debug
  }
  /** The sim time (seconds) of the frame on screen: what a finger sees there, so the scripted child aims with it. */
  get frameTime(): number {
    return this.time
  }
  /** The finger drawing or holding a ghost, for the feedback above it; and what a mouse hovers. */
  get finger(): { x: number; y: number; touch: boolean } | null {
    return this.router.finger
  }
  get hover(): Hit | null {
    return this.router.hover
  }

  /** The Good night card is up: the factory is asleep and nothing steps until morning (the pause menu's Keep going, or the next session). */
  get asleep(): boolean {
    return this.hud.night === 'done'
  }

  /** This factory is not being kept: a test run (a URL switch), a write the storage refused, or another tab's newer save. The pause menu says so. */
  get unsaved(): boolean {
    return this.test || this.writeFailed || this.stale
  }

  // ------------------------------------------------------------------------------------- the frame

  /** Runs whole steps for `seconds` of real time (at most MAX_FRAME of it, ?fast times as many), then the sounds, the idle pause, the save and the HUD's version. */
  advance(seconds: number): Frame {
    const f = this.frame
    f.steps = 0
    f.events.length = 0
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME)
    this.clock += dt
    if (!this.paused && !this.asleep) {
      const s = this.state
      const most = MAX_STEPS * this.url.fast
      // The accumulator counts steps; the 1e-9 forgives rounding in seconds * HZ.
      this.acc += dt * HZ * this.url.fast
      while (this.acc >= 1 - 1e-9 && f.steps < most) {
        step(s)
        for (const e of s.events) f.events.push(e)
        this.acc = Math.max(0, this.acc - 1)
        f.steps++
      }
      if (f.steps >= most) this.acc = 0
      this.audio.frame(s, f.events, dt)
      // Watching is play: untouched, the game pauses after IDLE_PAUSE only while nothing works for her to watch, and after IDLE_MOST anyway (a child who has gone).
      const idle = this.clock - this.lastInput
      if (s.playing && (idle >= IDLE_MOST || (idle >= IDLE_PAUSE && s.munchers.length === 0 && !s.buildings.some(working)))) this.pause()
    }
    f.alpha = this.acc
    this.time = (this.state.tick + f.alpha - 1) * STEP
    if (this.player !== null) this.player.frame(this)
    this.store(f.events.some((e) => SAVE_NOW.has(e.kind)))
    this.sync()
    return f
  }

  /** The view the stage drew: the router's tick runs against it, the window going upright or back drops a drag, and a new HUD frame bumps the HUD. */
  setView(v: View): void {
    const was = this.view
    this.view = v
    if (was !== null && (was.hud.held === 'upright') !== (v.hud.held === 'upright')) this.router.drop()
    this.router.tick(this.state, v, this.time)
    if (was === null || !sameFrame(was.hud, v.hud)) this.bump()
  }

  // ------------------------------------------------------------------------------------- input

  /** One action, from a HUD button, a key, the router or the scripted child: any of them is input. */
  dispatch(a: Action): void {
    this.poke()
    act(this.state, a)
    this.sync()
  }

  /** A HUD button whose action makes no sound of its own: its sound at once, then the action. */
  button(a: Action, sound: UiSound): void {
    this.audio.ui(sound)
    this.dispatch(a)
  }

  /** Any input at all: keeps the game from pausing for want of it. */
  poke(): void {
    this.lastInput = this.clock
  }

  /** A pointer went down somewhere on the page: a finger or a pen makes it a touch screen. */
  seen(touch: boolean): void {
    this.touch = touch
  }

  /** The first touch or key, and every one after: the audio may start, and once the browser is asked to keep the save for good (Safari otherwise clears a site's storage after a week away). */
  gesture(): void {
    this.audio.unlock()
    if (this.persistAsked || this.test) return
    this.persistAsked = true
    if ('storage' in navigator && 'persist' in navigator.storage) void navigator.storage.persist()
  }

  /** A canvas pointer, in CSS px from the canvas's top-left (Stage.tsx canvasEvents), to the router with the view and the time of the frame she saw. Nothing lands before the first frame is drawn. */
  pointer(kind: 'down' | 'move' | 'up' | 'cancel' | 'hover' | 'leave', id: number, sx: number, sy: number, press: Press): void {
    const v = this.view
    if (v === null) return
    const s = this.state
    this.poke()
    switch (kind) {
      case 'down':
        this.touch = press === 'touch' || press === 'heel'
        this.router.down(s, v, id, sx, sy, this.time, press)
        return
      case 'move':
        this.router.move(s, v, id, sx, sy, this.time)
        return
      case 'up':
        this.trays.delete(id)
        this.router.up(s, v, id, sx, sy, this.time)
        return
      case 'cancel':
        this.trays.delete(id)
        this.router.cancel(id, this.time)
        return
      case 'hover':
        this.router.hoverAt(s, v, sx, sy, this.time)
        return
      case 'leave':
        this.router.leave()
        return
    }
  }

  /** A pointer pressed on a tray sticker's button (the hedge's too): dragged out over the board, its sticker's ghost follows it, or the hedge's line draws (the router); its moves and its lift come through `trayPointer`. */
  trayDown(id: number, sticker: Sticker, sx: number, sy: number, press: Press): void {
    this.poke()
    this.touch = press === 'touch'
    this.trays.add(id)
    this.router.tray(this.state, this.view!, id, sticker, sx, sy, this.time, press)
  }

  /** A pointer's move, lift or cancel anywhere on the page: the router's when it was pressed on the tray. */
  trayPointer(kind: 'move' | 'up' | 'cancel', id: number, sx: number, sy: number): void {
    if (this.trays.has(id)) this.pointer(kind, id, sx, sy, this.touch ? 'touch' : 'left')
  }

  /**
   * A key went down; returns whether the game takes it (the page then does nothing else with
   * it). keyAction reads the board's keys; Esc and P open the menu (and close the path's
   * view), F is full screen. In the menu Esc, P, Enter and Space keep going and M is the
   * sound; on the Good night card Enter and Space are a tap on it (Beep murmurs in its sleep);
   * on the start card they press Play. A held key's repeats are taken and do nothing.
   */
  keyDown(code: string, repeat: boolean, ctrl: boolean): boolean {
    // Before the first frame there is no view: the start block's middle.
    const a = keyAction(this.state, this.time, code, ctrl, this.view === null ? { x: CORNER.x + CORNER.w / 2, y: CORNER.y + CORNER.h / 2 } : middleOf(this.view))
    const go = !ctrl && (code === 'Enter' || code === 'Space')
    if (a === null && !go) return false
    this.poke()
    if (repeat) return true
    if (a === 'fullscreen') toggleFullscreen()
    else if (this.paused) {
      if (a === 'pause' || go) this.keepGoing()
      else if (a !== null && a.kind === 'sound') this.dispatch(a)
    } else if (a === 'pause') {
      if (this.path) this.closePath()
      else this.openPause()
    } else if (this.asleep) {
      if (go) this.murmur()
    } else if (!this.state.playing) {
      if (go) this.play()
    } else if (a !== null) this.dispatch(a)
    return true
  }

  // ------------------------------------------------------------------------------------- the HUD's own

  /** The start card's Play: the factory runs, a new session begins (Beep stretches, the hint at once), and on a touch screen full screen is asked for. */
  play(): void {
    this.askFullscreen()
    this.dispatch({ kind: 'play' })
    this.dispatch({ kind: 'session' })
    this.dayFrom = this.state.found.length
  }

  /** The lab card's tap: the whole path, as picture cards. */
  openPath(): void {
    this.audio.ui('open')
    this.path = true
    this.bump()
  }

  closePath(): void {
    this.audio.ui('close')
    this.path = false
    this.bump()
  }

  /** The choice's tap, on the choice card, the lab card or in the path: the lab works on that card first. */
  choose(card: 'bubbles' | 'hedges'): void {
    this.path = false
    this.button({ kind: 'choose', card }, 'pick')
  }

  /** A tap on a sticker's empty hole: the lab card wiggles with that sticker peeking out (more come with a card). */
  peekAt(sticker: Sticker): void {
    this.poke()
    this.audio.ui('tap')
    this.peek = { sticker, at: this.clock }
    this.bump()
  }

  /** A tap on the Good night card: the factory stays asleep, and Beep murmurs in its sleep while a z floats up. Morning is the grown-up's (the pause menu's Keep going) or the next session's. */
  murmur(): void {
    this.poke()
    this.audio.ui('murmur')
    this.murmurs++
    this.bump()
  }

  // ------------------------------------------------------------------------------------- pause, sessions, full screen

  /** The pause button, Esc or P: the menu opens with its own sound. */
  openPause(): void {
    this.audio.ui('open')
    this.pause()
  }

  /** The game stops: a drag drops, the band holds (the menu's own sounds still play), the save is written, and the time away starts counting, over the sleeping factory too. */
  pause(): void {
    if (this.paused) return
    this.router.drop()
    this.paused = true
    this.path = false
    this.awayAt ??= Date.now()
    this.audio.setPaused(true)
    this.store(true)
    this.bump()
  }

  /** The menu's Keep going: the game runs on, and on a touch screen full screen is asked for again. */
  keepGoing(): void {
    this.askFullscreen()
    this.resume()
    this.audio.ui('close')
  }

  /**
   * The menu closes. Over the sleeping factory it is morning, and so it is after SESSION_GAP away
   * from a night still falling; a morning, and any return after SESSION_GAP away, is a new
   * session (Beep stretches, the calm minutes, the hint at once). The rules hear the menu
   * closed (visits wait a while after it).
   */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.returns++
    this.poke()
    this.audio.setPaused(false)
    const away = this.awayAt
    this.awayAt = null
    const long = away !== null && Date.now() - away >= SESSION_GAP * 1000
    const morning = this.state.night !== null && (this.asleep || long)
    if (morning) this.dispatch({ kind: 'wake' })
    if (morning || (long && this.state.playing)) {
      this.dispatch({ kind: 'session' })
      this.dayFrom = this.state.found.length
    }
    this.dispatch({ kind: 'unpaused' })
    this.bump()
  }

  /** The window lost focus, full screen ended or the page came back from the back-forward cache: the game pauses. */
  away(): void {
    this.pause()
  }

  /** The page hid: the game pauses, the save is written and the sound sleeps until the page shows again. */
  hide(): void {
    this.away()
    this.store(true)
    this.audio.suspend()
  }

  /** The page shows again: the sound wakes; the pause menu still holds the game until Keep going, unless another tab saved a newer factory meanwhile, which this tab takes (its start card shows). */
  show(): void {
    this.audio.resume()
    if (this.stale) this.takeStored()
  }

  /** The menu's Good night: the menu goes and dusk falls. */
  goodnight(): void {
    this.resume()
    this.dispatch({ kind: 'goodnight' })
  }

  /** The menu's Full screen: on or off, and the parent's choice is kept (Play and Keep going ask for it only while it is on). */
  fullscreenButton(): void {
    const on = document.fullscreenElement === null
    toggleFullscreen()
    this.dispatch({ kind: 'fullscreen', on })
  }

  /** Full screen at Play and Keep going, on a touch screen, unless the parent turned it off: Safari's bars would take the cells from 49 px to 43. */
  private askFullscreen(): void {
    if (!this.touch || this.state.switches.noFullscreen || !document.fullscreenEnabled || document.fullscreenElement !== null) return
    document.documentElement.requestFullscreen().catch((e: unknown) => console.warn('Rocket Factory could not go full screen:', e))
  }

  // ------------------------------------------------------------------------------------- Start again, Bring back, a copy

  /** The menu's Start again, after its hold: this factory is put aside (putAside) and the rules start afresh. */
  startAgain(): void {
    this.putAside(keepOf(this.state))
    this.router.drop()
    this.dispatch({ kind: 'fresh' })
    this.dayFrom = this.state.found.length
    this.audio.ui('fresh')
    this.resume()
    this.store(true)
  }

  /** The menu's Bring back of the i-th factory put aside: it comes back, and the one she has now is put aside in its place, so nothing is lost; the parent's switches stay as they are. */
  bringBack(i: number): void {
    const back = this.old[i]
    if (back === undefined) throw new Error(`nothing to bring back at ${i}: Start again has put ${this.old.length} factories aside`)
    const now = keepOf(this.state)
    this.load(back)
    this.old = this.old.map((k, j) => (j === i ? now : k))
    this.write(OLD_KEY, serializeOld(this.old))
  }

  /** The save as a file's text, for the grown-up's Keep a copy. */
  copy(): string {
    return serializeKeep(keepOf(this.state))
  }

  /** The grown-up's Bring back a copy: a save kept as a file comes back, the factory she has now put aside first (putAside); text that is no save changes nothing. Whether it came back. */
  bringBackCopy(text: string): boolean {
    if (!isKeep(text)) return false
    this.putAside(keepOf(this.state))
    this.load(parseKeep(text))
    return true
  }

  /** Factory k goes in front of the factories put aside, the oldest past OLD_MOST dropped, unless it found fewer cards and flew no more rockets than the newest there (a second hold of the ring on a young board then keeps her real one). */
  private putAside(k: Keep): void {
    if (!worthKeeping(k, this.old[0])) return
    this.old = [k, ...this.old].slice(0, OLD_MOST)
    this.write(OLD_KEY, serializeOld(this.old))
  }

  /** Keep k is the game now, with the parent's switches as they are: the menu closes on it and it is saved. */
  private load(k: Keep): void {
    const s = stateFromKeep(k, this.seed)
    s.switches = { ...this.state.switches }
    this.router.drop()
    this.state = s
    this.dayFrom = s.found.length
    this.audio.ui('fresh')
    this.resume()
    this.store(true)
  }

  /** Another tab wrote the save (the page's storage event), or `key` null: the storage was cleared. This tab stops writing until it takes the newer save; the factories put aside are the other tab's too. */
  otherTab(key: string | null, text: string | null): void {
    if (key === null || (key === SAVE_KEY && text !== this.stored)) this.stale = true
    if (key === null || key === OLD_KEY) this.old = parseOld(text)
    this.bump()
  }

  /** The newer save another tab wrote becomes this tab's game, at its start card. */
  private takeStored(): void {
    const text = this.read(SAVE_KEY)
    const s = stateFromKeep(parseKeep(text), this.seed)
    this.router.drop()
    this.state = s
    this.stored = text
    this.saved = serializeKeep(keepOf(s))
    this.stale = false
    if (this.paused) this.audio.setPaused(false)
    this.paused = false
    this.awayAt = null
    this.path = false
    this.dayFrom = s.found.length
    this.old = parseOld(this.read(OLD_KEY))
    this.sync()
    this.bump()
  }

  // ------------------------------------------------------------------------------------- the save and the HUD

  /** The text stored under `key`, or null. Storage can be missing or throw (private modes, blocked site data): then the game keeps its keep in memory. */
  private read(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch (e) {
      this.warnStorage(e)
      return null
    }
  }

  /** Stores `text` under `key`, unless this is a test run; whether it was stored. */
  private write(key: string, text: string): boolean {
    if (this.test) return false
    try {
      localStorage.setItem(key, text)
      return true
    } catch (e) {
      this.writeFailed = true
      this.warnStorage(e)
      return false
    }
  }

  /** Writes the keep when it changed since the last write: checked at most every SAVE_EVERY seconds, or at once when `now`. A test run never writes, and nor does a tab whose save another tab has written over since (it would write an older factory over a newer one). */
  store(now: boolean): void {
    if (this.test || this.stale || (!now && this.clock - this.savedAt < SAVE_EVERY)) return
    this.savedAt = this.clock
    const text = serializeKeep(keepOf(this.state))
    if (text === this.saved) return
    if (this.read(SAVE_KEY) !== this.stored) {
      this.stale = true
      this.bump()
      return
    }
    if (!this.write(SAVE_KEY, text)) return
    this.saved = text
    this.stored = text
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Rocket Factory cannot use the browser storage, so this visit is not remembered:', e)
  }

  /** The cards found today. */
  private today(): CardId[] {
    return this.state.found.slice(this.dayFrom)
  }

  /** The sounds follow the switches, Beep asks "Which one?" as the choice card comes up, and the HUD's version bumps when what it shows changed. */
  private sync() {
    const sw = this.state.switches
    if (sw.sound !== this.soundOn) this.audio.setSound((this.soundOn = sw.sound))
    if (sw.music !== this.musicOn) this.audio.setMusic((this.musicOn = sw.music))
    if (sw.voice !== this.voiceOn) this.audio.setVoice((this.voiceOn = sw.voice))
    const v = hudView(this.state, this.time, this.today())
    if (sameHud(v, this.hud)) return
    if (v.ask && !this.hud.ask) this.audio.say(WHICH_ONE)
    this.hud = v
    this.bump()
  }

  private bump() {
    this.version++
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

/** Re-renders the caller whenever the HUD's view, the pause, the path's view or the HUD's frame changes. */
export function useGameView(game: Game): void {
  useSyncExternalStore(game.subscribe, game.getVersion)
}

export function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement !== null) void document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch((e: unknown) => console.warn('Rocket Factory could not go full screen:', e))
}

/**
 * The keyboard and the page round the game for its lifetime: keys (Game.keyDown), the page
 * hiding, the window losing focus, full screen ending and a return from the back-forward
 * cache pause it; the save is written when the page hides and on pagehide, and the sound
 * sleeps while it is hidden; another tab writing the save is heard (Game.otherTab). Every
 * gesture wakes the audio (iOS counts only pointerup, touchend, click and keydown as
 * gestures), and on iOS the sound plays even with the ring switch on silent, like a video. A
 * tray sticker's pointer is followed over the whole page. The browser's own menu never opens
 * over the game, and Ctrl with the wheel or a pinch never zooms the page. No wake lock: the
 * iPad may sleep.
 */
export function useGameInput(game: Game): void {
  useEffect(() => {
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    const down = (e: KeyboardEvent) => {
      if (e.altKey) return
      if (game.keyDown(e.code, e.repeat, e.ctrlKey || e.metaKey)) e.preventDefault()
    }
    const away = () => game.away()
    const visibility = () => {
      if (document.visibilityState === 'hidden') game.hide()
      else game.show()
    }
    const pagehide = () => game.store(true)
    const fullscreen = () => {
      if (document.fullscreenElement === null) game.away()
    }
    const pageshow = (e: PageTransitionEvent) => {
      if (e.persisted) game.away()
    }
    const storage = (e: StorageEvent) => {
      if (e.storageArea === localStorage) game.otherTab(e.key, e.newValue)
    }
    const gesture = () => game.gesture()
    const pressed = (e: PointerEvent) => {
      game.seen(e.pointerType !== 'mouse')
      game.poke()
    }
    const tray = (kind: 'move' | 'up' | 'cancel') => (e: PointerEvent) => game.trayPointer(kind, e.pointerId, e.clientX, e.clientY)
    const trayMove = tray('move')
    const trayUp = tray('up')
    const trayCancel = tray('cancel')
    const noMenu = (e: Event) => e.preventDefault()
    const noZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault()
    }
    const noPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault()
    }
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'] as const
    const safari = ['gesturestart', 'gesturechange', 'gestureend'] as const
    window.addEventListener('keydown', down)
    window.addEventListener('blur', away)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    window.addEventListener('storage', storage)
    window.addEventListener('pointerdown', pressed, true)
    window.addEventListener('pointermove', trayMove)
    window.addEventListener('pointerup', trayUp)
    window.addEventListener('pointercancel', trayCancel)
    window.addEventListener('wheel', noZoom, { passive: false })
    window.addEventListener('touchmove', noPinch, { passive: false })
    for (const g of gestures) window.addEventListener(g, gesture, true)
    for (const g of safari) document.addEventListener(g, noMenu)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    document.addEventListener('contextmenu', noMenu)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('blur', away)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      window.removeEventListener('storage', storage)
      window.removeEventListener('pointerdown', pressed, true)
      window.removeEventListener('pointermove', trayMove)
      window.removeEventListener('pointerup', trayUp)
      window.removeEventListener('pointercancel', trayCancel)
      window.removeEventListener('wheel', noZoom)
      window.removeEventListener('touchmove', noPinch)
      for (const g of gestures) window.removeEventListener(g, gesture, true)
      for (const g of safari) document.removeEventListener(g, noMenu)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', fullscreen)
      document.removeEventListener('contextmenu', noMenu)
    }
  }, [game])
}
