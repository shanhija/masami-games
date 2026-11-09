/**
 * States a body is in for a while (types.ts's Effect): set by code with a time, read by code,
 * the brain and the interpreter, and shown by the body. Here: the words code may use for them,
 * what is left of each, the sway they add on top of whatever pose an action sets (body.ts and the
 * rig both add it, so a held thing stays in the hand), how much they slow walking, and what the
 * world does by itself: water and rain make one wet, snow cold, a hot thing near dries and warms.
 */

import { EFFECTS, type Actor, type Effect, type Mood, type Sway } from './types'

/** Words for a state, as made code may write them. */
const EFFECT_WORDS: Record<string, Effect> = {
  ill: 'sick', poorly: 'sick', unwell: 'sick', nauseous: 'sick', green: 'sick', poisoned: 'sick', sairas: 'sick',
  dizzy: 'dizzy', woozy: 'dizzy', spinning: 'dizzy', giddy: 'dizzy', huimaus: 'dizzy',
  soaked: 'wet', drenched: 'wet', soggy: 'wet', dripping: 'wet', märkä: 'wet',
  freezing: 'cold', chilly: 'cold', frozen: 'cold', shivering: 'cold', kylmä: 'cold',
  tired: 'sleepy', drowsy: 'sleepy', yawning: 'sleepy', väsynyt: 'sleepy',
  warm: 'hot', sweaty: 'hot', burning: 'hot', kuuma: 'hot',
  glow: 'glowing', shiny: 'glowing', shining: 'glowing', sparkly: 'glowing', lit: 'glowing', bright: 'glowing', magic: 'glowing',
}

/** A state from any word code gives: its own name, a near one from the table, else null (nothing happens). */
export function effectName(v: unknown): Effect | null {
  const k = typeof v === 'string' ? v.toLowerCase().trim() : ''
  return EFFECTS.includes(k as Effect) ? (k as Effect) : (EFFECT_WORDS[k] ?? null)
}

/** The longest a state lasts, seconds. */
export const EFFECT_MAX = 120

/** Sets a state for `secs` from now (0 ends it), longer than it has left only if asked for longer. */
export function setEffect(a: Actor, e: Effect, secs: number, t: number): void {
  const s = Math.max(0, Math.min(EFFECT_MAX, secs))
  const fx = (a.effects ??= {})
  if (s === 0) delete fx[e]
  else fx[e] = t + s
}

/** Seconds left of each state it has now. */
export function effectsLeft(a: Actor, t: number): Partial<Record<Effect, number>> {
  const out: Partial<Record<Effect, number>> = {}
  for (const e of EFFECTS) {
    const until = a.effects?.[e]
    if (until !== undefined && until > t) out[e] = Math.round((until - t) * 10) / 10
  }
  return out
}

export const hasEffect = (a: Actor, e: Effect, t: number): boolean => (a.effects?.[e] ?? -Infinity) > t

/** How much the states slow its walking: sick most, then sleepy, then cold. */
export function effectPace(a: Actor, t: number): number {
  if (a.effects === undefined) return 1
  return Math.min(hasEffect(a, 'sick', t) ? 0.55 : 1, hasEffect(a, 'sleepy', t) ? 0.7 : 1, hasEffect(a, 'cold', t) ? 0.85 : 1)
}

/** The face a state wears while the actor's own mood is the everyday happy one. */
const FACE: Partial<Record<Effect, Mood>> = { sick: 'sad', sleepy: 'sleepy', dizzy: 'silly' }

/**
 * One frame of an actor's states, after its action moved it: what the world does to it (`wet`:
 * in water or rain; `cold`: in snow; `warm`: beside a hot thing, which dries and warms), the
 * sway the states add, the face they wear, and the states that ran out. Returns the states that
 * ran out this frame.
 */
export function stepEffects(a: Actor, t: number, phase: number, world: { wet: boolean; snowing: boolean; warm: boolean }): Effect[] {
  if (world.wet && !world.warm) setEffect(a, 'wet', Math.max(6, (a.effects?.wet ?? 0) - t), t)
  if (world.snowing && !world.warm) setEffect(a, 'cold', Math.max(5, (a.effects?.cold ?? 0) - t), t)
  if (world.warm && a.effects !== undefined) {
    delete a.effects.cold
    if (a.effects.wet !== undefined) a.effects.wet = Math.min(a.effects.wet, t + 2)
  }
  const ended: Effect[] = []
  const fx = a.effects
  if (fx === undefined) {
    if (a.sway !== undefined && a.sway !== null) a.sway = null
    return ended
  }
  for (const e of EFFECTS) {
    const until = fx[e]
    if (until !== undefined && until <= t) {
      delete fx[e]
      ended.push(e)
    }
  }
  const s: Sway = { tilt: 0, twist: 0, nod: 0, turn: 0 }
  const on = (e: Effect) => fx[e] !== undefined
  const p = phase * 6.283
  if (on('sick')) {
    s.tilt += 0.13 * Math.sin(1.9 * t + p)
    s.nod += 0.12 + 0.06 * Math.sin(1.3 * t + p)
  }
  if (on('dizzy')) {
    s.tilt += 0.22 * Math.sin(3.1 * t + p)
    s.turn += 0.35 * Math.sin(2.3 * t + p)
    s.nod += 0.08 * Math.sin(4.1 * t)
  }
  if (on('cold')) s.twist += 0.045 * Math.sin(52 * t + p)
  if (on('sleepy')) s.nod += 0.35 * Math.max(0, Math.sin(0.9 * t + p)) ** 3
  a.sway = s.tilt === 0 && s.twist === 0 && s.nod === 0 && s.turn === 0 ? null : s
  if (a.mood === 'happy') {
    const face = EFFECTS.map((e) => (on(e) ? FACE[e] : undefined)).find((m) => m !== undefined)
    if (face !== undefined) {
      a.mood = face
      a.moodUntil = t + 0.2
    }
  }
  if (Object.keys(fx).length === 0) delete a.effects
  return ended
}
