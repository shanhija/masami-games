/**
 * What is counted of a room played (plan.md, Never trapped; Help, and how hard), as plain numbers so
 * vitest runs it: the seconds on the game's clock and the hints the helper said over every start of
 * the room, how often it was started again from the pause card, and how it ended: finished, or left
 * by Another room or More games. The page writes it into each player's saves (saves.ts afterRoom).
 */

import type { Level } from '../engine/api'
import type { World } from '../engine/world'
import type { RoomEnd } from '../saves'
import type { Played } from './play'

/** The seconds and hints of the starts given up so far (each Start again gives one up). */
export interface Spent {
  readonly secs: number
  readonly hints: number
}

export const NOTHING_SPENT: Spent = { secs: 0, hints: 0 }

/** The start now playing is given up for a fresh one: its seconds and hints are added to those before it. */
export function spentAfter(spent: Spent, world: Pick<World, 't' | 'helper'>): Spent {
  return { secs: spent.secs + world.t, hints: spent.hints + world.helper.hints }
}

/**
 * How the room went, at its end or when it is left: the level of the start now playing, the restarts,
 * the seconds and hints of every start (the starts given up and this one), and the steps done in
 * this start (a room with a clock may end with some undone). A finished room counts its seconds to
 * the moment it ended, not the cheer after it; a left one to the moment it was left.
 */
export function playedNow(end: RoomEnd, level: Level, restarts: number, spent: Spent, world: Pick<World, 't' | 'helper' | 'end' | 'steps'>): Played {
  if (end === 'finished' && world.end === null) throw new Error('the room is counted as finished but it has not ended')
  const secs = end === 'finished' && world.end !== null ? world.end.at : world.t
  const steps = { done: world.steps.filter((s) => s.doneAt !== null).length, of: world.steps.length }
  return { end, level, secs: spent.secs + secs, restarts, hints: spent.hints + world.helper.hints, steps }
}
