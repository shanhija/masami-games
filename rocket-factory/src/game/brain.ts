import { firstStep, nextSteps, type Ranked } from './hint'
import { ticks, type State, type Step } from './model'
import { between } from './random'

/**
 * What a scripted child chooses to do, shared by the pure-sim sessions (session.test.ts) and
 * the finger children (child.ts), so both measure the same children (plans/rocket-factory.md,
 * Engineering, the scripted children). A child is a pace (how long it waits between steps and
 * how often it stops to watch) and a behaviour (which of the hint's steps it takes). Every
 * child takes the hint's steps in their rank; a behaviour only skips some kinds.
 */

export const PACES = ['eager', 'table', 'slow'] as const
export type Pace = (typeof PACES)[number]
export const BEHAVIOURS = ['careful', 'neverDefends', 'neverFetches', 'tickleOnly'] as const
export type Behaviour = (typeof BEHAVIOURS)[number]
export interface Profile {
  pace: Pace
  behaviour: Behaviour
}

/** Seconds between two steps, and one step in `watchEvery` (0: never) followed by `watch` seconds of only watching the belts. */
export const PACE: Record<Pace, { pause: readonly [number, number]; watchEvery: number; watch: readonly [number, number] }> = {
  eager: { pause: [2, 8], watchEvery: 0, watch: [0, 0] },
  table: { pause: [4, 14], watchEvery: 5, watch: [15, 60] },
  slow: { pause: [5, 20], watchEvery: 3, watch: [20, 90] },
}

/** The ticks a child of this pace waits after a turn: a pause, and after one turn in `watchEvery` that took a step, a stretch of only watching the belts too. `u` is the child's own generator, never the sim's. */
export function waitAfter(pace: Pace, took: boolean, u: () => number): number {
  const p = PACE[pace]
  const pause = between(u(), ticks(p.pause[0]), ticks(p.pause[1]))
  return took && p.watchEvery > 0 && u() < 1 / p.watchEvery ? pause + between(u(), ticks(p.watch[0]), ticks(p.watch[1])) : pause
}

/** A step that defends the factory with a tower, a hedge or a bowl. */
const defends = (step: Step): boolean =>
  step.kind === 'defend' ||
  step.kind === 'refill' ||
  ((step.kind === 'place' || step.kind === 'free') && (step.sticker === 'tower' || step.sticker === 'bowl')) ||
  (step.kind === 'bottleneck' && (step.sticker === 'tower' || step.sticker === 'bowl'))

/**
 * Would a child of this behaviour take this step: the careful child takes every one; the
 * never-defending child no tickles, towers, hedges or bowls (it still fetches a heap when it
 * bounces); the never-fetching child no heaps and no basket; the tickle-only child tickles but
 * builds no defence.
 */
export function takes(behaviour: Behaviour, step: Step): boolean {
  switch (behaviour) {
    case 'careful':
      return true
    case 'neverDefends':
      return step.kind !== 'muncher' && !defends(step)
    case 'neverFetches':
      return step.kind !== 'heap' && step.kind !== 'basket'
    case 'tickleOnly':
      return !defends(step)
  }
}

/** The step a child of this behaviour takes now: the first of the hint's ranked list it would take, or null for none. */
export function choose(s: State, behaviour: Behaviour): Ranked | null {
  if (behaviour === 'careful') return firstStep(s)
  return nextSteps(s).find((r) => takes(behaviour, r.step)) ?? null
}
