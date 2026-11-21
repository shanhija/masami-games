import type { Idle, TapMotion } from '../game/items'
import { TAU, arch, clamp01, loop, smooth, squash } from './look'

/**
 * The shared motion vocabulary for room items: an idle loop and a tap reaction, each one
 * transform around the item's anchor (layout.ts: the top centre of a ceiling slot, the
 * centre of a wall slot, the bottom centre of a floor slot), applied by the renderer before
 * it calls the item's drawing. So a ceiling lamp swings from its cord, a floor toy hops off
 * the floor and a poster pulses about its middle, all from the same few lines. Calm, as
 * look.ts rule 10 says: an idle moves at most 3% of the smallest slot box's height with a
 * period of 1.2 to 3 s, and a tap is over within about a second.
 */

/** Each idle loop's period in seconds, and how far it goes: a bob in metres (3% of the 0.6 m ceiling and wall boxes), a sway or swing in radians, a pulse as a fraction of the size. */
const IDLE = {
  bob: { period: 2.2, amount: 0.018 },
  sway: { period: 2.6, amount: 0.035 },
  pulse: { period: 1.8, amount: 0.03 },
  swing: { period: 2.4, amount: 0.05 },
} as const

/** A tap's spin shows the item edge-on for a moment; its width never goes under this, so the transform never flattens to nothing. */
const EDGE_ON = 0.08

/** A hop: up HOP metres over HOP_FOR, then the landing squash played SQUASH_FAST times faster than a tap's, so it settles by about a second. */
const HOP = 0.22
const HOP_FOR = 0.36
const SQUASH_FAST = 1.6
/** A spin: one turn over SPIN_FOR. A shake: SHAKE radians either way, SHAKE_HZ times a second, dying out over SHAKE_FOR. */
const SPIN_FOR = 0.7
const SHAKE = 0.1
const SHAKE_HZ = 6
const SHAKE_FOR = 0.6
/** A grow: up to 1 + GROW over GROW_UP, then a damped wobble back to its size (settled by about 0.9 s). */
const GROW = 0.2
const GROW_UP = 0.15
/** A launch: up LAUNCH metres (the highest any tap lifts an item) and back down over LAUNCH_FOR. */
export const LAUNCH = 0.55
const LAUNCH_FOR = 0.9

/** The idle loop `idle` at sim time t, shifted by `phase` (0 to 1, look.phaseOf of the item and its slot) so two of a thing never move in step. */
export function applyIdle(ctx: CanvasRenderingContext2D, idle: Idle, t: number, phase: number): void {
  if (idle === 'still') return
  const { period, amount } = IDLE[idle]
  const u = loop(t, period, phase)
  const wave = Math.sin(TAU * u)
  switch (idle) {
    case 'bob':
      ctx.translate(0, -amount * (0.5 + 0.5 * wave))
      return
    case 'sway':
    case 'swing':
      ctx.rotate(amount * wave)
      return
    case 'pulse': {
      const k = 1 + amount * wave
      ctx.scale(k, k)
      return
    }
  }
}

/** The tap reaction `tap`, `play` seconds after the tap (-1 never tapped): nothing before a tap or once it has settled, and nothing at all for 'own' (the item's drawing reacts by itself). */
export function applyTap(ctx: CanvasRenderingContext2D, tap: TapMotion, play: number): void {
  if (play < 0 || tap === 'own') return
  switch (tap) {
    case 'hop': {
      if (play < HOP_FOR) ctx.translate(0, -HOP * arch(play / HOP_FOR))
      else {
        const [sx, sy] = squash((play - HOP_FOR) * SQUASH_FAST)
        ctx.scale(sx, sy)
      }
      return
    }
    case 'spin':
      if (play < SPIN_FOR) {
        // A horizontal turn about the anchor: the width runs through cos, edge-on never quite flat.
        const c = Math.cos(TAU * smooth(0, SPIN_FOR, play))
        ctx.scale(Math.sign(c || 1) * Math.max(EDGE_ON, Math.abs(c)), 1)
      }
      return
    case 'shake':
      if (play < SHAKE_FOR) ctx.rotate(SHAKE * Math.sin(TAU * SHAKE_HZ * play) * (1 - play / SHAKE_FOR))
      return
    case 'grow': {
      const k = play < GROW_UP ? 1 + GROW * (play / GROW_UP) : 1 + GROW * Math.exp(-6 * (play - GROW_UP)) * Math.cos(10 * (play - GROW_UP))
      if (play < 1.2) ctx.scale(k, k)
      return
    }
    case 'launch':
      if (play < LAUNCH_FOR) ctx.translate(0, -LAUNCH * arch(clamp01(play / LAUNCH_FOR)))
      return
  }
}
