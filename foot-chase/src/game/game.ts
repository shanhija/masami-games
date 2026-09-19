import { useEffect, useSyncExternalStore } from 'react'

import { mulberry32 } from './random'
import { ROLES, TURBO_BOLTS, TURBO_MAX, createSim, dogOn, flying, pressJump, resetSim, setThrottle, tick, type Item, type Role, type Runner, type Sim, type SimEvent } from './sim'
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
  /** What the HUD last saw, all of it in one string; anything else changing is the scene's business. */
  private shown = ''

  constructor() {
    this.sim = createSim(mulberry32(Date.now() >>> 0))
  }

  /** A player's one button: jump (and start). While paused it only resumes; nothing jumps out of a menu. */
  press(role: Role) {
    this.audio.unlock()
    if (this.paused) {
      this.resume()
      return
    }
    pressJump(this.sim, role)
  }

  /** A player's pedal, from whatever is held: forward, back, or nothing. */
  throttle(role: Role, value: -1 | 0 | 1) {
    setThrottle(this.sim, role, value)
  }

  pause() {
    this.paused = true
    this.bump()
  }

  resume() {
    this.paused = false
    this.bump()
  }

  /** A fresh chase on a fresh street. */
  restart() {
    resetSim(this.sim, mulberry32(Date.now() >>> 0))
    this.generation += 1
    this.paused = false
    this.bump()
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted)
    this.bump()
  }

  /** One frame: advances the sim, plays what happened, tells the HUD when it has something new to show. */
  advance(dt: number) {
    const s = this.sim
    this.audio.setHum(!this.paused && flying(s.robber, s.time))
    if (this.paused) return
    tick(s, dt)
    for (const e of s.events) this.audio.play(soundFor(e))
    s.events.length = 0
    this.bump()
  }

  /** Bumps the version if any HUD-visible value changed since the last bump. */
  private bump() {
    const s = this.sim
    const snapshot = [s.phase, s.catches, s.coins, this.audio.muted, this.paused, this.generation, ...ROLES.map((role) => `${bolts(s[role])}${s[role].turboOn}${shoutFor(s, role)}`)].join('|')
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

function soundFor(e: SimEvent): SoundKind {
  switch (e.kind) {
    case 'start':
    case 'jump':
      return 'jump'
    case 'caught':
      return 'win'
    case 'escaped':
      return 'win'
    case 'escape':
    case 'regroup':
      return 'whoosh'
    case 'fly':
      return 'propeller'
    default:
      return e.kind
  }
}

/** The sprint tank in whole bolts, as the HUD shows it. */
export const bolts = (r: Runner) => Math.min(TURBO_BOLTS, Math.floor((r.turbo / TURBO_MAX) * TURBO_BOLTS + 1e-6))

const ITEM_SHOUT: Record<Item, string> = {
  dog: 'POLICE DOG!',
  skates: 'SKATES!',
  whistle: 'STOP, POLICE!',
  magnet: 'MAGNET!',
  propeller: 'PROPELLER!',
  banana: 'BANANA!',
  springs: 'BOING BOING!',
  bone: 'A BONE!',
}

/**
 * The word over this runner right now, or an empty string: what it just got out of a box,
 * what it just ran into, or the dog that just got hold of it. Each lasts a moment.
 */
export function shoutFor(s: Sim, role: Role): string {
  const r = s[role]
  const t = s.time
  if (r.gotAt >= 0 && t - r.gotAt < 1.3) return ITEM_SHOUT[r.got!]
  if (r.crashedAt >= 0 && t - r.crashedAt < 0.8) return r.crashKind === 'car' ? 'BEEP BEEP!' : r.crashKind === 'banana' ? 'WHOOPS!' : 'BONK!'
  const dog = dogOn(s, role)
  if (dog && t - dog.latchedAt < 0.9) return 'WOOF!'
  if (role === 'robber' && t < r.frozenUntil) return 'STOP!'
  return ''
}

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

/** The police plays the left-hand keys, the robber the arrows. Space and Enter are the big jump keys on each side. */
const JUMP_KEYS: Record<string, Role> = { w: 'police', W: 'police', ' ': 'police', ArrowUp: 'robber', Enter: 'robber' }
const PEDAL_KEYS: Record<string, { role: Role; value: -1 | 1 }> = {
  d: { role: 'police', value: 1 },
  D: { role: 'police', value: 1 },
  a: { role: 'police', value: -1 },
  A: { role: 'police', value: -1 },
  ArrowRight: { role: 'robber', value: 1 },
  ArrowLeft: { role: 'robber', value: -1 },
}

/**
 * Two players on one keyboard: W jumps the police and the up arrow the robber, and
 * either starts the chase. Held, D and A are the police's sprint and slow, right and left
 * the robber's; the last one pressed wins while both are down. On a tablet a tap on the
 * left half of the screen is the police's jump and on the right half the robber's. Esc
 * pauses and shows the menu; any press while paused resumes. M mutes, F is fullscreen.
 * Jump keys do not repeat: one press is one jump request.
 */
export function useGameInput(game: Game) {
  useEffect(() => {
    const held: Record<Role, (-1 | 1)[]> = { police: [], robber: [] }
    const applyPedal = (role: Role) => game.throttle(role, held[role].length > 0 ? held[role][held[role].length - 1]! : 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const pedal = PEDAL_KEYS[e.key]
      if (pedal !== undefined) {
        if (!held[pedal.role].includes(pedal.value)) held[pedal.role].push(pedal.value)
        applyPedal(pedal.role)
        e.preventDefault()
        return
      }
      const jumper = JUMP_KEYS[e.key]
      if (jumper !== undefined) {
        if (!e.repeat) game.press(jumper)
        e.preventDefault()
        return
      }
      switch (e.key) {
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
      const pedal = PEDAL_KEYS[e.key]
      if (pedal === undefined) return
      const i = held[pedal.role].indexOf(pedal.value)
      if (i >= 0) held[pedal.role].splice(i, 1)
      applyPedal(pedal.role)
    }
    // Losing the window mid-hold must not leave a pedal down.
    const onBlur = () => {
      for (const role of ROLES) {
        held[role].length = 0
        applyPedal(role)
      }
    }
    const onPointer = (e: PointerEvent) => {
      // The HUD's buttons are the only DOM that should not also count as a press.
      if ((e.target as HTMLElement).closest('button')) return
      game.press(e.clientX < window.innerWidth / 2 ? 'police' : 'robber')
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
