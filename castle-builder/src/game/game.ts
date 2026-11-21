import { useEffect, useSyncExternalStore } from 'react'

import type { Saves } from '../../../profiles/src/profiles'

import { mulberry32 } from './random'
import {
  GOODS,
  cannotPay,
  chosenPiece,
  createSim,
  currentWish,
  hallOf,
  isNight,
  look,
  place,
  press,
  raining,
  resetSim,
  restore,
  select,
  serialize,
  setMove,
  setStorms,
  tapKeep,
  tapNode,
  tapPiece,
  tick,
  unlocked,
  walkTo,
  windStrength,
  wishProgress,
  type Selection,
  type Sim,
  type SimEvent,
} from './sim'
import { Sounds, type SoundKind } from './sounds'

const SAVE_KEY = 'castle-builder'
const SAVE_EVERY = 5

/**
 * The running game: the sim, the sounds, the pause, the save in the player's saves, and the
 * one thing the DOM needs to know, a version that bumps when anything the HUD shows
 * has changed. The scene reads the sim directly every frame and sends taps here; the
 * HUD subscribes to the version.
 */
export class Game {
  readonly sim: Sim
  readonly audio = new Sounds()
  paused = false
  /** Counts new castles. The scene is keyed by it, so a new castle remounts every effect with a clean slate. */
  generation = 0
  private version = 0
  private listeners = new Set<() => void>()
  /** What the HUD last saw, all of it in one string; anything else changing is the scene's business. */
  private shown = ''
  private savedAt = 0
  private readonly saves: Saves

  constructor(saves: Saves) {
    this.saves = saves
    this.sim = createSim(mulberry32(Date.now() >>> 0))
    const saved = saves.getItem(SAVE_KEY)
    // Text that is not a castle this game can read leaves the fresh island standing, and goes.
    if (saved !== null && !restore(this.sim, saved)) saves.removeItem(SAVE_KEY)
    this.savedAt = this.sim.time
  }

  /** The big button: Space, Enter, or a tap that hit nothing in particular. While paused it only resumes. */
  press() {
    this.audio.unlock()
    if (this.paused) {
      this.resume()
      return
    }
    press(this.sim)
  }

  /** The arrow keys, as a direction or zero. */
  move(dx: number, dz: number) {
    setMove(this.sim, dx, dz)
  }

  tapGround(x: number, z: number) {
    if (!this.live()) return
    walkTo(this.sim, x, z)
  }

  tapNode(id: number) {
    if (!this.live()) return
    tapNode(this.sim, id)
  }

  tapPiece(id: number) {
    if (!this.live()) return
    tapPiece(this.sim, id)
  }

  tapKeep() {
    if (!this.live()) return
    tapKeep(this.sim)
  }

  /** A tap on a grid cell with a piece chosen. Returns whether the tap was taken by the placement. */
  tapCell(col: number, row: number): boolean {
    if (!this.live()) return false
    if (chosenPiece(this.sim) === null) return false
    place(this.sim, col, row)
    return true
  }

  select(sel: Selection) {
    this.audio.unlock()
    if (this.paused) return
    if (this.sim.phase === 'ready') press(this.sim)
    select(this.sim, sel)
    this.bump()
  }

  look() {
    if (!this.live()) return
    look(this.sim)
    this.bump()
  }

  /** Any tap on the world while the start card is up starts the game and is also taken as the tap it was. */
  private live() {
    this.audio.unlock()
    if (this.paused) {
      this.resume()
      return false
    }
    if (this.sim.phase === 'ready') press(this.sim)
    return true
  }

  pause() {
    this.paused = true
    this.audio.setLoops({ fire: false, rain: false, wind: false, drum: false, bass: false, melody: false, bells: false, night: false })
    this.bump()
  }

  resume() {
    this.paused = false
    this.bump()
  }

  /** A fresh island, and the old castle forgotten. */
  newCastle() {
    resetSim(this.sim, mulberry32(Date.now() >>> 0))
    this.saves.removeItem(SAVE_KEY)
    this.savedAt = 0
    this.generation += 1
    this.paused = false
    this.bump()
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted)
    this.bump()
  }

  toggleStorms() {
    setStorms(this.sim, !this.sim.stormsOn)
    this.bump()
  }

  /** One frame: advances the sim, plays what happened, keeps the loops going, saves now and then, tells the HUD when there is news. */
  advance(dt: number) {
    if (this.paused) return
    const s = this.sim
    tick(s, dt)
    for (const e of s.events) for (const kind of soundsFor(e)) this.audio.play(kind)
    s.events.length = 0
    const n = s.pieces.length
    this.audio.setLoops({
      fire: s.pieces.some((p) => p.state === 'burning'),
      rain: raining(s),
      wind: windStrength(s) > 0.3,
      drum: s.phase === 'play' && n >= 1,
      bass: s.phase === 'play' && n >= 4,
      melody: s.phase === 'play' && hallOf(s) !== null,
      bells: s.phase === 'play' && s.pieces.some((p) => p.kind === 'belltower' && p.state === 'ok'),
      night: isNight(s),
    })
    if (s.phase === 'play' && s.time - this.savedAt >= SAVE_EVERY) {
      this.savedAt = s.time
      this.saves.setItem(SAVE_KEY, serialize(s))
    }
    this.bump()
  }

  /** Bumps the version if any HUD-visible value changed since the last bump. */
  private bump() {
    const s = this.sim
    // Which buttons the bar shows, and which of them are dimmed.
    const bar = unlocked(s).map((k) => `${k}:${cannotPay(s, k)}`)
    const wish = currentWish(s)
    const snapshot = [
      s.phase,
      this.paused,
      this.audio.muted,
      s.stormsOn,
      this.generation,
      s.selected,
      s.dye,
      s.wishIndex,
      wish ? `${wish.kind}${wishProgress(s)}/${wish.count}` : 'done',
      Math.floor(s.wishDoneAt),
      s.hint ? `${s.hint.good}@${Math.floor(s.hint.at)}` : '',
      s.weather,
      ...GOODS.map((g) => s.store[g]),
      ...bar,
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
  getGeneration = () => this.generation
}

/** What each thing that happened sounds like. Loops (fire, rain, wind, the tune) are set from the state instead. */
function soundsFor(e: SimEvent): SoundKind[] {
  switch (e.kind) {
    case 'start':
      return ['start']
    case 'swing':
      switch (e.node) {
        case 'tree':
          return ['chop']
        case 'rock':
          return ['tok']
        case 'ore':
          return ['clink']
        case 'sheep':
          return ['snip']
        default:
          return ['rustle']
      }
    case 'gather':
    case 'regrow':
      return ['pop']
    case 'golden':
      return ['golden']
    case 'landed':
      return ['pling']
    case 'fetch':
      return ['fetch']
    case 'work':
      switch (e.piece) {
        case 'woodcutter':
          return ['saw']
        case 'mason':
          return ['hammer']
        case 'smithy':
          return ['anvil']
        case 'weaver':
          return ['loom']
        default:
          return ['splat']
      }
    case 'made':
      return ['ding']
    case 'select':
      return ['select']
    case 'place':
    case 'grow':
      return ['thud', 'hooray']
    case 'lifted':
      return ['whoosh', 'pling']
    case 'cannot':
      return ['uhuh']
    case 'repairTick':
      return ['tock']
    case 'repaired':
      return ['thud', 'hooray']
    case 'douseTick':
      return ['sploosh']
    case 'fireOut':
      return ['hiss', 'hooray']
    case 'ignite':
      return ['whoosh']
    case 'broke':
    case 'chipped':
      return ['crumble']
    case 'lightning':
      return ['zap', 'rumble']
    case 'bong':
      return ['bong']
    case 'stormWarn':
      return ['rumble']
    case 'stormStart':
    case 'blown':
      return ['whoosh']
    case 'rainStart':
      return []
    case 'rainbow':
      return ['chime']
    case 'wish':
    case 'allWishes':
    case 'keepGrew':
      return ['fanfare']
    case 'newWish':
      return ['newWish']
    case 'cheer':
      return ['hooray']
    case 'hop':
    case 'sheepUp':
      return ['boing']
    case 'baa':
    case 'sheepFlip':
      return ['baa']
    case 'paint':
    case 'dye':
      return ['splat']
    case 'splash':
      return ['splash']
  }
}

/** Re-renders the caller when the HUD-visible state changes; returns the sim to read from. */
export function useGameView(game: Game) {
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game.sim
}

/** Re-renders the caller only on a new castle, with the count to key the scene by. */
export function useGeneration(game: Game) {
  return useSyncExternalStore(game.subscribe, game.getGeneration)
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

/** The arrows run the hero; WASD does the same quietly, for a parent. */
const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  W: [0, -1],
  S: [0, 1],
  A: [-1, 0],
  D: [1, 0],
}

/**
 * One keyboard: the arrows run the hero, Space or Enter is the big button (start, place
 * the chosen piece, or hop), Esc pauses, M mutes, F is full screen, L looks at the
 * castle. The keys held are summed, so a diagonal is a diagonal. Taps on the world go
 * through the scene, which knows what was under the finger.
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const held = new Set<string>()
    const applyMove = () => {
      let dx = 0
      let dz = 0
      for (const key of held) {
        const [x, z] = MOVE_KEYS[key]!
        dx += x
        dz += z
      }
      game.move(dx, dz)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (MOVE_KEYS[e.key]) {
        held.add(e.key)
        applyMove()
        e.preventDefault()
        return
      }
      switch (e.key) {
        case ' ':
        case 'Enter':
          if (!e.repeat) game.press()
          break
        case 'Escape':
          if (game.paused) game.resume()
          else game.pause()
          break
        case 'm':
        case 'M':
          game.toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'l':
        case 'L':
          game.look()
          break
        default:
          return
      }
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!held.delete(e.key)) return
      applyMove()
    }
    // Losing the window mid-run must not leave a key down.
    const onBlur = () => {
      held.clear()
      applyMove()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [game])
}
