import { useEffect, useSyncExternalStore } from 'react'

import { mulberry32 } from './random'
import { TURBO_BOLTS, TURBO_MAX, createSim, pressJump, resetSim, score, setThrottle, tick, type Role, type Sim, type SimEvent } from './sim'
import { Sounds, type SoundKind } from './sounds'

/**
 * The running game: the sim, the sounds, the pause, and the one thing the DOM needs to
 * know, a version that bumps when anything the HUD shows has changed. The scene reads the
 * sim directly every frame; the HUD subscribes to the version.
 */
export class Game {
  readonly sim: Sim
  readonly audio = new Sounds()
  paused = false
  /** Counts restarts. The scene is keyed by it, so a restart remounts every effect with a clean slate. */
  generation = 0
  private version = 0
  private listeners = new Set<() => void>()
  /** Which visible values the HUD last saw; anything else changing is the scene's business. */
  private shown = { role: '', phase: '', score: -1, muted: false, bonk: false, worm: false, eek: false, bolts: -1, turboOn: false, paused: false, generation: -1 }

  constructor() {
    this.sim = createSim(mulberry32(Date.now() >>> 0), 'police')
  }

  /** The one input while playing: jump (and start). While paused it only resumes; nothing jumps out of a menu. */
  press() {
    this.audio.unlock()
    if (this.paused) {
      this.resume()
      return
    }
    pressJump(this.sim)
  }

  /** The throttle, from whatever is held: forward, back, or nothing. */
  throttle(value: -1 | 0 | 1) {
    setThrottle(this.sim, value)
  }

  pause() {
    this.paused = true
    this.bump()
  }

  resume() {
    this.paused = false
    this.bump()
  }

  /** A fresh chase, in the same role unless another is asked for. */
  restart(role: Role = this.sim.role) {
    resetSim(this.sim, mulberry32(Date.now() >>> 0), role)
    this.generation += 1
    this.paused = false
    this.bump()
  }

  /** Picks the car to drive. Before the first press this only re-lays the start; once the chase is on it starts over. */
  chooseRole(role: Role) {
    if (this.sim.phase === 'ready') {
      resetSim(this.sim, mulberry32(Date.now() >>> 0), role)
      this.bump()
    } else {
      this.restart(role)
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted)
    this.bump()
  }

  /** One frame: advances the sim, plays what happened, tells the HUD when it has something new to show. */
  advance(dt: number) {
    const s = this.sim
    this.audio.setSiren(!this.paused && s.phase !== 'ready')
    if (this.paused) return
    tick(s, dt)
    for (const e of s.events) this.audio.play(soundFor(s.role, e))
    s.events.length = 0
    this.bump()
  }

  /** Bumps the version if any HUD-visible value changed since the last bump. */
  private bump() {
    const s = this.sim
    const shown = this.shown
    const bonk = bonking(s)
    const worm = s.wormAt >= 0
    const eek = shrieking(s)
    const b = bolts(s)
    if (
      shown.role === s.role &&
      shown.phase === s.phase &&
      shown.score === score(s) &&
      shown.muted === this.audio.muted &&
      shown.bonk === bonk &&
      shown.worm === worm &&
      shown.eek === eek &&
      shown.bolts === b &&
      shown.turboOn === s.turboOn &&
      shown.paused === this.paused &&
      shown.generation === this.generation
    ) {
      return
    }
    shown.role = s.role
    shown.phase = s.phase
    shown.score = score(s)
    shown.muted = this.audio.muted
    shown.bonk = bonk
    shown.worm = worm
    shown.eek = eek
    shown.bolts = b
    shown.turboOn = s.turboOn
    shown.paused = this.paused
    shown.generation = this.generation
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

/** What an event sounds like depends on whose side you are on: a catch is a fanfare for the police and a groan for the robber. */
function soundFor(role: Role, e: SimEvent): SoundKind {
  switch (e.kind) {
    case 'caught':
      return role === 'police' ? 'win' : 'lose'
    case 'escaped':
      return 'win'
    case 'escape':
    case 'regroup':
      return 'turbo'
    case 'start':
      return 'jump'
    case 'wormIn':
      return 'eek'
    case 'wormOut':
      return 'pop'
    default:
      return e.kind
  }
}

/** True for a moment after a crash: the HUD shouts while it is. */
export const bonking = (s: Sim) => s.crashedAt >= 0 && s.time - s.crashedAt < 0.8
/** True for a moment after a worm gets in: the HUD shrieks while it is. */
export const shrieking = (s: Sim) => s.wormAt >= 0 && s.time - s.wormAt < 0.9
/** The turbo tank in whole bolts, as the HUD shows it. */
export const bolts = (s: Sim) => Math.min(TURBO_BOLTS, Math.floor((s.turbo / TURBO_MAX) * TURBO_BOLTS + 1e-6))

/** Re-renders the caller when the HUD-visible state changes; returns the sim to read from. */
export function useGameView(game: Game) {
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game.sim
}

/** Re-renders the caller only on a restart, with the restart count to key the scene by. */
export function useGeneration(game: Game) {
  return useSyncExternalStore(game.subscribe, game.getGeneration)
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

/** The two throttle keys, held: right (or D) is forward, left (or A) is back. The last one pressed wins while both are down. */
const THROTTLE_KEYS: Record<string, -1 | 1> = { ArrowRight: 1, d: 1, D: 1, ArrowLeft: -1, a: -1, A: -1 }

/**
 * Space, the up arrow or Enter jumps (and starts); so does a tap or a click anywhere.
 * Right and left, held, are the throttle: turbo and brake; on the start screen they also
 * pick the car. Esc pauses and shows the menu; any press while paused resumes. M mutes,
 * F is fullscreen. Jump keys do not repeat: one press is one jump request.
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const held: (-1 | 1)[] = []
    const applyThrottle = () => game.throttle(held.length > 0 ? held[held.length - 1]! : 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const throttle = THROTTLE_KEYS[e.key]
      if (throttle !== undefined) {
        if (!held.includes(throttle)) held.push(throttle)
        applyThrottle()
        // Before the first press the arrows also pick the car.
        if (!e.repeat && game.sim.phase === 'ready' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) game.chooseRole(throttle === -1 ? 'police' : 'robber')
        e.preventDefault()
        return
      }
      switch (e.key) {
        case ' ':
        case 'ArrowUp':
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
        default:
          return
      }
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const throttle = THROTTLE_KEYS[e.key]
      if (throttle === undefined) return
      const i = held.indexOf(throttle)
      if (i >= 0) held.splice(i, 1)
      applyThrottle()
    }
    // Losing the window mid-hold must not leave the pedal down.
    const onBlur = () => {
      held.length = 0
      applyThrottle()
    }
    const onPointer = (e: PointerEvent) => {
      // The HUD's buttons are the only DOM that should not also count as a press.
      if ((e.target as HTMLElement).closest('button')) return
      game.press()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [game])
}
