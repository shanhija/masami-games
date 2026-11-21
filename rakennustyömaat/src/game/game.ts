import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import { simTime, streetX, tweening, type View } from './camera'
import { PRESENTS } from './catalog'
import { BEDTIME, Child } from './child'
import { DEMOS, demoKeep, demoShot, type Demo } from './fixtures'
import { hudView, sameHud, type HudView, type Nope } from './hud'
import { hitTest } from './layout'
import { GOODS, HZ, IDLE_PAUSE, ROAD_KINDS, type Action, type Hit, type Keep, type RoadKind, type SimEvent, type State } from './model'
import { freshKeep, parseKeep, SAVE_KEY, serializeKeep } from './progress'
import { act, createState, step } from './rules'
import { Sounds, type UiSound } from './sounds'

// A hot edit to this file or anything it runs (the rules, the road, the sounds, the save) reloads the page, so an old game's
// sounds never play on beside a new one; edits to the art still swap in hot.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

/**
 * The running game: the browser glue around the pure state. The clock and its fixed-step
 * accumulator, keys and pointers turned into Actions (a canvas pointer goes through the
 * camera's view and layout.hitTest), the save in the player's saves, the sounds' lifecycle, pause,
 * the URL switches and the HUD's version.
 */

/** What one call to `advance` did: how many steps ran, how far into the next step the picture is, and every event of those steps, in order. One object, reused. */
export interface Frame {
  steps: number
  alpha: number
  events: SimEvent[]
}

/** At most this much real time a frame, so a stall never fast-forwards the street: 6 steps at 60 Hz. */
const MAX_FRAME = 0.1
const MAX_STEPS = 6
/** A finger that moves further than this many CSS pixels drags: on the street it pans, anywhere else it is no tap. */
export const DRAG = 12
/** The arrow keys pan the street this fast, in metres a second. */
export const PAN_SPEED = 14
/** The save is checked and, when the keep changed, written at most this often (seconds), and at once when the page hides. */
const SAVE_EVERY = 1

/** The URL switches, read once at load. */
interface Switches {
  /** ?demo=<name>: a rich scene from fixtures.ts instead of the save. */
  demo: Demo | null
  /** ?nosave: a fresh game, never saved. */
  nosave: boolean
  /** ?seed=<n>: the random numbers' seed, so a run replays. */
  seed: number | null
  /** ?rich: 99 of every good. ?all: every present's unlock. */
  rich: boolean
  all: boolean
  /** ?road=forest|beach|hills: that road starts at once, from the street, whatever the save or demo; on a fresh game too, where it counts as the second trip (the training road is a child's own first trip). */
  road: RoadKind | null
  /** ?autoplay: the scripted child (child.ts) plays on the page for a parent to watch. Only beside ?nosave or ?demo, so its play never reaches the save. */
  autoplay: boolean
}

/** Reads the switches from a query string. A bad value or a bad pair throws, saying what would do. Other parameters (?debug for the renderer, ?sheet) are left alone. */
export function readSwitches(search: string): Switches {
  const p = new URLSearchParams(search)
  const demoText = p.get('demo')
  const demo = demoText === null ? null : (DEMOS.find((d) => d === demoText) ?? undefined)
  if (demo === undefined) throw new Error(`?demo=${demoText}: use one of ${DEMOS.join(', ')}`)
  const seedText = p.get('seed')
  if (seedText !== null && !(/^-?\d{1,10}$/.test(seedText) && Math.abs(Number(seedText)) < 2 ** 31)) throw new Error(`?seed=${seedText}: use a whole number`)
  const roadText = p.get('road')
  const road = roadText === null ? null : (ROAD_KINDS.find((r) => r === roadText) ?? undefined)
  if (road === undefined) throw new Error(`?road=${roadText}: use one of ${ROAD_KINDS.join(', ')}`)
  const nosave = p.has('nosave')
  const autoplay = p.has('autoplay')
  if (autoplay && demo === null && !nosave) throw new Error('?autoplay: use it with ?nosave or ?demo, so the play is never saved')
  return { demo, nosave, seed: seedText === null ? null : Number(seedText), rich: p.has('rich'), all: p.has('all'), road, autoplay }
}

/** A run with any switch is a test: it never writes the save. */
const isTest = (w: Switches) => w.demo !== null || w.nosave || w.seed !== null || w.rich || w.all || w.road !== null

const sameHit = (a: Hit | null, b: Hit | null) => JSON.stringify(a) === JSON.stringify(b)

/** The keys the game takes for itself. */
const PEDAL_KEYS = new Set(['Space', 'ArrowRight', 'KeyD'])
const BACK_KEYS = new Set(['Backspace', 'KeyB'])
const KEYS = new Set([...PEDAL_KEYS, ...BACK_KEYS, 'ArrowLeft', 'KeyH', 'Escape', 'KeyP', 'KeyM', 'KeyF', 'Enter'])

/** Where a held pedal comes from: the keyboard or a finger on the pedal button. */
type Source = 'keys' | 'touch'

/**
 * The running game. The stage calls `advance` once a frame, `setView` with the view it drew
 * and `pointer` for the canvas's pointers; the HUD reads `hud` and `paused` and subscribes
 * to the version, which bumps whenever either changes; every HUD button is an Action through
 * `dispatch`.
 */
export class Game {
  state: State
  readonly audio = new Sounds()
  readonly switches: Switches
  paused = false
  /** Real seconds the page has run, advance's clamped seconds summed (it stops while the page is hidden). */
  clock = 0
  /** The view the stage drew last: canvas pointers hit-test against it. */
  view: View | null = null
  hud: HudView
  private acc = 0
  private frame: Frame = { steps: 0, alpha: 0, events: [] }
  private version = 0
  private listeners = new Set<() => void>()
  private readonly test: boolean
  /** The scripted child playing with ?autoplay, or null. */
  private readonly child: Child | null
  /** The keep as the storage holds it, and when it was last checked (clock). */
  private saved: string
  private savedAt = 0
  private storageWarned = false
  private persistAsked = false
  private lastInput = 0
  private nope: Nope | null = null
  /** What the sounds were last told. */
  private soundOn: boolean
  private musicOn: boolean
  /** The pedal's holders, the keys that hold it, and the street's pan keys (newest last). A holder counts on any shot, so a key held as the road appears drives the truck. */
  private pedals = new Set<Source>()
  private pedalKeys = new Set<string>()
  private panKeys: (-1 | 1)[] = []
  /** Whether the shot was the road at the last sync: the truck gets the held pedal as the road appears. */
  private onRoad = false
  /**
   * The one finger on the canvas: where it went down, what it landed on, whether it has
   * dragged, the street's x it started panning from, and the spot it holds now (a finger
   * that went down on a spot slides between spots; null off them).
   */
  private finger: { id: number; x0: number; y0: number; hit: Hit; drag: boolean; from: number; spot: Hit | null } | null = null

  private readonly saves: Saves

  /** `search` is the page's query string (see Switches); `seed` seeds the random numbers unless ?seed does; `saves` are the player's. */
  constructor(search: string, seed: number, saves: Saves) {
    this.saves = saves
    const w = (this.switches = readSwitches(search))
    this.test = isTest(w)
    this.child = w.autoplay ? new Child(w.seed ?? seed, BEDTIME) : null
    let keep: Keep
    if (w.demo !== null) keep = demoKeep(w.demo)
    else if (w.nosave) keep = freshKeep()
    else keep = parseKeep(this.load())
    if (w.rich) for (const g of GOODS) keep.goods[g] = 99
    if (w.all) keep.unlocked = [...PRESENTS]
    this.saved = serializeKeep(keep)
    // A first visit opens at the mirror with a dice-made builder; ?road starts on the street, where the truck is.
    const first = w.demo === null && w.road === null && this.saved === serializeKeep(freshKeep())
    // The training road is a child's own first trip: a road asked for by name is that road, so a fresh keep counts the first trip as done (a test run, never saved).
    if (w.road !== null && keep.trips === 0) keep.trips = 1
    const s = (this.state = createState(keep, w.seed ?? seed, first))
    // ?road and a demo's shot are reached as the child would get there, so the builder and the camera are where the rules put them.
    if (w.road !== null) {
      // From the street: the truck, then the signpost's card. A demo then gives only its keep.
      act(s, { kind: 'tap', hit: { kind: 'truck' } })
      act(s, { kind: 'road', road: w.road })
      if (s.road === null || s.road.def.kind !== w.road) throw new Error(`?road=${w.road}: the truck did not set off on it`)
    } else if (w.demo !== null) {
      const shot = demoShot(w.demo, keep)
      switch (shot.kind) {
        case 'mirror':
          act(s, { kind: 'mirror' })
          break
        case 'street':
          act(s, { kind: 'pan', x: shot.x })
          break
        case 'plot':
        case 'room':
          act(s, { kind: 'tap', hit: { kind: 'plot', plot: shot.plot } })
          if (shot.kind === 'room') act(s, { kind: 'tap', hit: { kind: 'room', plot: shot.plot, room: shot.room } })
          break
        case 'road':
          throw new Error(`?demo=${w.demo} opens on the road: a demo opens on the street, and ?road starts a road`)
      }
    }
    this.onRoad = s.shot.kind === 'road'
    this.soundOn = keep.sound
    this.musicOn = keep.music
    this.audio.setSound(keep.sound)
    this.audio.setMusic(keep.music)
    this.hud = hudView(this.state, simTime(this.state), null)
  }

  // ------------------------------------------------------------------------------------- the frame

  /** Runs whole steps for `seconds` of real time (at most MAX_FRAME of it), then the sounds, the idle pause, the save and the HUD's version. */
  advance(seconds: number): Frame {
    const f = this.frame
    f.steps = 0
    f.events.length = 0
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME)
    this.clock += dt
    if (!this.paused && !this.asleep) {
      if (this.panKeys.length > 0 && this.state.shot.kind === 'street') this.panTo(this.streetMiddle(this.state.shot.x) + this.panKeys[this.panKeys.length - 1]! * PAN_SPEED * dt)
      // The accumulator counts steps; the 1e-9 forgives rounding in seconds * HZ.
      this.acc += dt * HZ
      while (this.acc >= 1 - 1e-9 && f.steps < MAX_STEPS) {
        step(this.state)
        for (const e of this.state.events) {
          f.events.push(e)
          if (e.kind === 'nope') this.nope = { good: e.good, at: this.state.tick }
        }
        this.acc = Math.max(0, this.acc - 1)
        f.steps++
      }
      if (f.steps === MAX_STEPS) this.acc = 0
      this.audio.frame(this.state, f.events, dt)
      // A held pedal is input that lasts: the truck rolling on is never idle.
      if (this.pedals.size === 0 && this.clock - this.lastInput >= IDLE_PAUSE) this.pause()
    }
    f.alpha = this.acc
    // With ?autoplay the child plays against the view drawn last, as a finger would (it waits out a pause, and wakes the Good night card).
    if (this.child !== null) this.child.frame(this)
    this.store(false)
    this.sync()
    return f
  }

  /** The Good night card is up: the street is still and nothing steps until a tap wakes it. */
  get asleep() {
    return this.hud.night === 'done'
  }

  /** The view the stage drew; the rules see its screen, to bring what bounces into sight on it. */
  setView(v: View): void {
    this.view = v
    const screen = this.state.screen
    if (screen === null || screen.w !== v.w || screen.h !== v.h) this.state.screen = { w: v.w, h: v.h }
  }

  // ------------------------------------------------------------------------------------- input

  /** One action, from a HUD button, a key or the canvas: any of them is input. */
  dispatch(a: Action): void {
    this.poke()
    act(this.state, a)
    this.sync()
  }

  /** A HUD button whose action makes no sound of its own (a tab, a pick, closing a card): its click, then the action. */
  button(a: Action, sound: UiSound): void {
    this.audio.ui(sound)
    this.dispatch(a)
  }

  /** Any input at all: keeps the game from pausing for want of it. */
  poke(): void {
    this.lastInput = this.clock
  }

  /**
   * A pointer on the canvas, in CSS pixels from its top-left. One finger at a time, and
   * none while the camera moves between shots; the rules hear when it goes down and lifts
   * (a finger held still is the child busy there). A finger down on a ghost spot presses it,
   * slides between spots, and lifting places the room there; on the street a drag pans;
   * otherwise a down and up without a drag taps what the down landed on.
   */
  pointer(kind: 'down' | 'move' | 'up' | 'cancel', sx: number, sy: number, id: number): void {
    const s = this.state
    if (kind === 'down') {
      this.poke()
      if (this.finger !== null || this.paused || this.view === null || tweening(s, simTime(s))) return
      const hit = hitTest(s, this.view, sx, sy)
      const spot = hit.kind === 'spot' ? hit : null
      this.finger = { id, x0: sx, y0: sy, hit, drag: false, from: s.shot.kind === 'street' ? this.streetMiddle(s.shot.x) : 0, spot }
      this.dispatch({ kind: 'touch', down: true })
      if (spot) this.dispatch({ kind: 'press', hit: spot })
      return
    }
    const f = this.finger
    if (f === null || f.id !== id) return
    if (kind === 'move') {
      if (!f.drag && Math.hypot(sx - f.x0, sy - f.y0) > DRAG) f.drag = true
      if (f.hit.kind === 'spot') {
        const hit = hitTest(s, this.view!, sx, sy)
        const spot = hit.kind === 'spot' ? hit : null
        if (!sameHit(spot, f.spot)) {
          f.spot = spot
          this.dispatch({ kind: 'press', hit: spot })
        }
      } else if (f.drag && s.shot.kind === 'street') this.panTo(f.from - (sx - f.x0) / this.view!.ppm)
      return
    }
    this.finger = null
    this.dispatch({ kind: 'touch', down: false })
    // A question that opened under a held finger is answered on its cards: lifting the finger never closes it, nor taps what is under it.
    const tap = kind === 'up' && s.ask === null
    if (f.hit.kind === 'spot') {
      if (tap && f.spot) this.dispatch({ kind: 'tap', hit: f.spot })
      if (f.spot) this.dispatch({ kind: 'press', hit: null })
    } else if (tap && !f.drag) this.dispatch({ kind: 'tap', hit: f.hit })
  }

  /** Pans the street so its middle is at x, kept inside the street's ends for the view drawn last. */
  private panTo(x: number) {
    this.dispatch({ kind: 'pan', x: this.streetMiddle(x) })
  }

  /** Where a street shot centred at x shows its middle on the view drawn last, inside the pan limits (camera.streetX): a drag and the arrow keys pan on from there, so a shot the rules put past a limit moves at once. */
  private streetMiddle(x: number): number {
    const v = this.view!
    return streetX(x, v.w / v.ppm, this.state.keep.plots.length)
  }

  /**
   * The pedal held or let go by one source: the truck gets the pedal down while any source
   * holds it. Nothing holds it while paused. The HUD's version bumps, as the pedal button
   * shows whether a finger holds it.
   */
  pedal(source: Source, down: boolean): void {
    if ((down && this.paused) || this.pedals.has(source) === down) return
    const was = this.pedals.size > 0
    if (down) this.pedals.add(source)
    else this.pedals.delete(source)
    const now = this.pedals.size > 0
    if (was !== now && this.state.shot.kind === 'road') this.dispatch({ kind: 'pedal', down: now })
    this.bump()
  }

  /** Whether `source` holds the pedal now: the pedal button looks pressed only while the game counts its finger (a pause lets go of it). */
  holds(source: Source): boolean {
    return this.pedals.has(source)
  }

  /**
   * A key went down; returns whether the game takes it (the page then does nothing else
   * with it). Space, the right arrow and D hold the pedal (held anywhere, the truck drives
   * once the road appears; at a boulder they hit the rock), H honks, the arrows pan the street, Esc and P pause, M is the sound, F full
   * screen, Backspace and B go back (Home on the road, and close a question); Space and
   * Enter resume from the menu and wake from Good night.
   */
  keyDown(code: string, repeat: boolean): boolean {
    if (!KEYS.has(code)) return false
    this.poke()
    if (repeat) return true
    const s = this.state
    if (code === 'Escape' || code === 'KeyP') this.togglePause()
    else if (code === 'KeyM') this.dispatch({ kind: 'sound', on: !s.keep.sound })
    else if (code === 'KeyF') toggleFullscreen()
    else if (this.paused) {
      if (code === 'Space' || code === 'Enter') this.resume()
    } else if (this.asleep) {
      if (code === 'Space' || code === 'Enter') this.dispatch({ kind: 'wake' })
    } else {
      const road = s.ask === null && s.shot.kind === 'road'
      if (PEDAL_KEYS.has(code)) {
        if (road && this.hud.road!.boulder) this.dispatch({ kind: 'whack' })
        // Held on any shot: a key already down when the road appears drives the truck.
        this.pedalKeys.add(code)
        this.pedal('keys', true)
      }
      if (s.ask !== null) {
        if (BACK_KEYS.has(code)) this.closeAsk()
      } else if (road) {
        if (code === 'KeyH') this.dispatch({ kind: 'horn' })
        else if (BACK_KEYS.has(code)) this.dispatch({ kind: 'home' })
      } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
        const dir = code === 'ArrowLeft' ? -1 : 1
        if (!this.panKeys.includes(dir)) this.panKeys.push(dir)
      } else if (BACK_KEYS.has(code) && s.shot.kind !== 'street') this.dispatch({ kind: 'back' })
    }
    return true
  }

  keyUp(code: string): void {
    if (this.pedalKeys.delete(code) && this.pedalKeys.size === 0) this.pedal('keys', false)
    if (code === 'ArrowLeft' || code === 'ArrowRight') this.panKeys = this.panKeys.filter((d) => d !== (code === 'ArrowLeft' ? -1 : 1))
  }

  /** Every held key, the pedal and the finger on the canvas let go (a pause, the page hiding, the window losing focus). */
  release(): void {
    this.pedalKeys.clear()
    this.panKeys = []
    if (this.pedals.size > 0) {
      this.pedals.clear()
      if (this.state.shot.kind === 'road') this.dispatch({ kind: 'pedal', down: false })
      this.bump()
    }
    const f = this.finger
    this.finger = null
    if (f) this.dispatch({ kind: 'touch', down: false })
    if (f && f.spot) this.dispatch({ kind: 'press', hit: null })
  }

  /** The top-left button: the mirror on the street, Home on the road, back anywhere else. */
  backButton(): void {
    const back = this.hud.back
    this.button({ kind: back === 'face' ? 'mirror' : back === 'home' ? 'home' : 'back' }, 'tap')
  }

  /** A tap outside a question's cards (or B): the room question leaves the room empty, the others close. */
  closeAsk(): void {
    this.button(this.state.ask!.kind === 'theme' ? { kind: 'theme', theme: null } : { kind: 'back' }, 'close')
  }

  // ------------------------------------------------------------------------------------- pause

  /** The pause menu opens: the music and the engine's hum stop, but the sound runs on for the menu's own (the parent gate's rising tone, a switch's click). */
  pause(): void {
    if (this.paused || this.asleep) return
    this.release()
    this.paused = true
    this.audio.setPaused(true)
    this.bump()
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.poke()
    this.audio.setPaused(false)
    this.bump()
  }

  togglePause(): void {
    if (this.paused) this.resume()
    else this.pause()
  }

  /** The window lost focus, full screen ended or the page came back from the back-forward cache: everything lets go and the game pauses. */
  away(): void {
    this.release()
    this.pause()
  }

  /** The page hid: the game pauses and the sound sleeps until the page shows again. */
  hide(): void {
    this.away()
    this.audio.suspend()
  }

  /** The page shows again: the sound wakes, and the pause menu still holds the music back until Keep going. */
  show(): void {
    this.audio.resume()
  }

  /** The pause menu's Good night: the menu goes and evening falls. */
  goodnight(): void {
    this.resume()
    this.dispatch({ kind: 'goodnight' })
  }

  /** The pause menu's Start again, after its hold: a fresh street, the sound switches kept by the rules. */
  startAgain(): void {
    this.resume()
    this.dispatch({ kind: 'fresh' })
    this.audio.ui('fresh')
  }

  /** The first touch or key, and every one after: the audio may start, and once the browser is asked to keep the save for good. */
  gesture(): void {
    this.audio.unlock()
    if (this.persistAsked || this.test) return
    this.persistAsked = true
    if ('storage' in navigator && 'persist' in navigator.storage) void navigator.storage.persist()
  }

  // ------------------------------------------------------------------------------------- the save and the HUD

  private load(): string | null {
    // Storage can be missing or throw (private modes, blocked site data): then the game keeps its keep in memory.
    try {
      return this.saves.getItem(SAVE_KEY)
    } catch (e) {
      this.warnStorage(e)
      return null
    }
  }

  /** Writes the keep when it changed since the last write: checked at most every SAVE_EVERY seconds, or at once when `now`. A test run never writes. */
  store(now: boolean): void {
    if (this.test || (!now && this.clock - this.savedAt < SAVE_EVERY)) return
    this.savedAt = this.clock
    const text = serializeKeep(this.state.keep)
    if (text === this.saved) return
    try {
      this.saves.setItem(SAVE_KEY, text)
      this.saved = text
    } catch (e) {
      this.warnStorage(e)
    }
  }

  private warnStorage(e: unknown) {
    if (this.storageWarned) return
    this.storageWarned = true
    console.warn('Cat Hat Builder cannot use the browser storage, so this visit is not remembered:', e)
  }

  /** The truck gets a pedal already held as the road appears; the sounds follow the keep's switches; and the HUD's version bumps when what it shows changed. */
  private sync() {
    const onRoad = this.state.shot.kind === 'road'
    if (onRoad && !this.onRoad && this.pedals.size > 0) act(this.state, { kind: 'pedal', down: true })
    this.onRoad = onRoad
    const keep = this.state.keep
    if (keep.sound !== this.soundOn) this.audio.setSound((this.soundOn = keep.sound))
    if (keep.music !== this.musicOn) this.audio.setMusic((this.musicOn = keep.music))
    const v = hudView(this.state, simTime(this.state), this.nope)
    if (sameHud(v, this.hud)) return
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

/** Re-renders the caller whenever the HUD's view or the pause changes. */
export function useGameView(game: Game): void {
  useSyncExternalStore(game.subscribe, game.getVersion)
}

export function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

/**
 * The keyboard and the page around the game for its lifetime: keys (Game.keyDown), the page
 * hiding, the window losing focus, full screen ending and a return from the back-forward
 * cache pause it; the save is written when the page hides, and the sound sleeps while it is
 * hidden. Every gesture wakes the audio (iOS counts only pointerup, touchend, click and
 * keydown as gestures), and on iOS the sound plays even with the ring switch on silent, like
 * a video. The browser's own menu never opens over the game (a right click, a two-finger
 * click on a trackpad, a long press).
 */
export function useGameInput(game: Game): void {
  useEffect(() => {
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (game.keyDown(e.code, e.repeat)) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => game.keyUp(e.code)
    const away = () => game.away()
    const visibility = () => {
      if (document.visibilityState !== 'hidden') {
        game.show()
        return
      }
      game.hide()
      game.store(true)
    }
    const pagehide = () => game.store(true)
    const fullscreen = () => {
      if (!document.fullscreenElement) game.pause()
    }
    const pageshow = (e: PageTransitionEvent) => {
      if (e.persisted) game.away()
    }
    const gesture = () => game.gesture()
    const poke = () => game.poke()
    const noMenu = (e: Event) => e.preventDefault()
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'] as const
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    window.addEventListener('pointerdown', poke, true)
    for (const g of gestures) window.addEventListener(g, gesture, true)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    document.addEventListener('contextmenu', noMenu)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      window.removeEventListener('pointerdown', poke, true)
      for (const g of gestures) window.removeEventListener(g, gesture, true)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', fullscreen)
      document.removeEventListener('contextmenu', noMenu)
    }
  }, [game])
}
