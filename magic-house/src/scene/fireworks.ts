/**
 * The house's fireworks at the end of a room (plan.md, A visit: the way out opens, fireworks go
 * up): soft lights rising from the bottom of the frame and opening high up into stars of the
 * house's colours, each with a glow that fades. Quiet and gentle: no bang, no smoke, no flash that
 * fills the screen. A pure plan of what shines where at a time since they began, the same every
 * time for the same frame, so the test reads it and the scene (Fireworks.tsx) only draws it.
 */

import { hash01 } from '../engine/effects'
import type { Camera } from '../engine/world'

/**
 * How the fireworks go: a shell every `every` seconds from `first` (a little early or late each),
 * rising for `rise` seconds and then `burst` seconds of stars; `stars` in each, flying out to
 * `spread` of the frame's height and drooping `droop` m/s² as they fade; the glow at the burst
 * `flash` frame-heights across, fading over `flashSecs`; the rising light trailed by `trail`
 * smaller ones. They rise from `from` and open between `low` and `high`, as shares of the frame's
 * height from its bottom, and keep `side` of its width clear at each side. `z` is in front of the
 * players' plane, so a wall does not hide them.
 */
export const FIREWORKS = {
  first: 0.1,
  every: 0.5,
  late: 0.25,
  rise: 0.9,
  burst: 1.6,
  stars: 16,
  spread: 0.13,
  droop: 0.9,
  flash: 0.32,
  flashSecs: 0.45,
  trail: 3,
  from: 0.25,
  low: 0.62,
  high: 0.85,
  side: 0.12,
  z: 1.2,
} as const

/** The colours of the stars: the house's bright festive set, warm and cool by turns. */
export const FIREWORK_COLOURS = ['#ffd23a', '#ff6bd5', '#5ec8ff', '#7dffb0', '#ff9f43', '#b57bff', '#ffffff'] as const

/** The most shells shining at once, and the most of each kind of light: what the scene makes room for. */
export const SHELLS_MOST = Math.ceil((FIREWORKS.rise + FIREWORKS.burst + FIREWORKS.late) / FIREWORKS.every) + 1
export const LIGHTS_MOST = { stars: SHELLS_MOST * FIREWORKS.stars, glows: SHELLS_MOST * (1 + FIREWORKS.trail) } as const

/** One shell: when it leaves the ground, where it rises from and opens, its colour and how its stars are turned. */
export interface Shell {
  readonly born: number
  readonly x: number
  readonly from: number
  readonly top: number
  readonly color: string
  readonly turn: number
}

/** The frame the fireworks fill: the camera's (world.ts Camera), centre and size in metres. */
export type FireFrame = Pick<Camera, 'x' | 'y' | 'width' | 'height'>

/** The n-th shell (0 first) over this frame. */
export function shellOf(n: number, frame: FireFrame): Shell {
  const bottom = frame.y - frame.height / 2
  const span = frame.width * (1 - 2 * FIREWORKS.side)
  // Across the frame by a golden step, so shells one after another open far apart, never two in one spot.
  const across = (n * 0.618034 + 0.31 * hash01(n, 7, 1)) % 1
  return {
    born: FIREWORKS.first + n * FIREWORKS.every + FIREWORKS.late * hash01(n, 7, 2),
    x: frame.x - span / 2 + across * span,
    from: bottom + FIREWORKS.from * frame.height,
    top: bottom + (FIREWORKS.low + (FIREWORKS.high - FIREWORKS.low) * hash01(n, 7, 3)) * frame.height,
    color: FIREWORK_COLOURS[n % FIREWORK_COLOURS.length],
    turn: hash01(n, 7, 4) * Math.PI * 2,
  }
}

/** One light to draw: a star of a burst, or a soft glow (a rising shell, its trail, a burst's light). `size` is across in metres, `bright` 0 to 1. */
export interface Light {
  readonly kind: 'star' | 'glow'
  readonly x: number
  readonly y: number
  readonly size: number
  readonly color: string
  readonly bright: number
  readonly spin: number
}

/** Every light shining `since` seconds after the fireworks began over this frame, oldest shell first. */
export function lightsAt(since: number, frame: FireFrame): Light[] {
  const out: Light[] = []
  if (since < 0) return out
  const h = frame.height
  // Only the shells that could still shine: born within rise + burst before now.
  const lastN = Math.floor((since - FIREWORKS.first) / FIREWORKS.every)
  const firstN = Math.max(0, Math.floor((since - FIREWORKS.first - FIREWORKS.rise - FIREWORKS.burst - FIREWORKS.late) / FIREWORKS.every))
  for (let n = firstN; n <= lastN; n++) {
    const s = shellOf(n, frame)
    const age = since - s.born
    if (age < 0 || age >= FIREWORKS.rise + FIREWORKS.burst) continue
    if (age < FIREWORKS.rise) {
      // Rising, slowing as it nears the top: the light and its trail just behind it.
      const k = age / FIREWORKS.rise
      for (let i = 0; i <= FIREWORKS.trail; i++) {
        const back = Math.max(0, k - i * 0.06)
        const y = s.from + (s.top - s.from) * (1 - (1 - back) ** 2)
        out.push({ kind: 'glow', x: s.x, y, size: h * (i === 0 ? 0.07 : 0.045 / i), color: i === 0 ? '#fff4c2' : s.color, bright: i === 0 ? 1 : 0.6 / i, spin: 0 })
      }
      continue
    }
    const b = age - FIREWORKS.rise
    const k = b / FIREWORKS.burst
    // The stars fly out fast and slow down, droop a little, and fade over the last part of their life.
    const out01 = 1 - Math.exp(-4 * b)
    const fade = Math.min(1, (1 - k) / 0.45)
    const r = FIREWORKS.spread * h * out01
    const sag = 0.5 * FIREWORKS.droop * b * b
    for (let i = 0; i < FIREWORKS.stars; i++) {
      const a = s.turn + (i / FIREWORKS.stars) * Math.PI * 2
      const reach = 0.8 + 0.2 * hash01(n, i, 5)
      out.push({ kind: 'star', x: s.x + Math.cos(a) * r * reach, y: s.top + Math.sin(a) * r * reach - sag, size: h * 0.028 * (0.6 + 0.4 * fade), color: s.color, bright: fade, spin: a + b * 3 })
    }
    if (b < FIREWORKS.flashSecs) out.push({ kind: 'glow', x: s.x, y: s.top - sag, size: h * FIREWORKS.flash * (0.6 + 0.4 * (b / FIREWORKS.flashSecs)), color: s.color, bright: 1 - b / FIREWORKS.flashSecs, spin: 0 })
  }
  return out
}
