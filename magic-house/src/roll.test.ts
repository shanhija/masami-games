/**
 * The game's dice for a room (plan.md, A model cannot roll dice, so the game does): together, against each other and
 * side by side 3, 1 and 1 in 5, a party of one only together, and from the side and from high up 4
 * and 1 in 5. Two dice: every room has one size (engine/api.ts ROOM). Draws spread evenly over
 * [0, 1) show the odds exactly.
 */

import { describe, expect, it } from 'vitest'

import { badRoll, rollRoom } from './roll'
import type { Roll } from './protocol'
import type { PartySize } from './seats/types'

/** A random that gives these draws in turn, and says when it is drawn once too often. */
const draws = (...d: number[]) => () => {
  const next = d.shift()
  if (next === undefined) throw new Error('drawn more often than the dice have')
  return next
}

/** How often each face comes up over n evenly spread draws of one die (the other drawn 0). */
function faces(party: PartySize, die: 0 | 1, n: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const two = [0, 0]
    two[die] = (i + 0.5) / n
    const roll = rollRoom(party, draws(...two))
    const face = [roll.kind, roll.view][die]!
    out[face] = (out[face] ?? 0) + 1
  }
  return out
}

describe('the dice', () => {
  it('roll together, against each other and side by side 3, 1 and 1 in 5', () => {
    expect(faces(3, 0, 1000)).toEqual({ together: 600, contest: 200, side: 200 })
  })

  it('roll a party of one only together', () => {
    expect(faces(1, 0, 1000)).toEqual({ together: 1000 })
  })

  it('roll the view from the side and from high up 4 and 1 in 5', () => {
    expect(faces(2, 1, 1000)).toEqual({ side: 800, high: 200 })
  })

  it('draw kind and view in that order, and nothing more', () => {
    expect(rollRoom(2, draws(0.7, 0.9))).toEqual({ kind: 'contest', view: 'high' })
    expect(rollRoom(2, draws(0.7, 0.7))).toEqual({ kind: 'contest', view: 'side' })
    expect(Object.keys(rollRoom(4, draws(0, 0)))).toEqual(['kind', 'view'])
  })

  it('say why a roll could not have come from them', () => {
    const roll = (kind: string, view: string) => ({ kind, view }) as Roll
    expect(badRoll(1, roll('contest', 'side'))).toBe('a party of one plays alone, never contest')
    expect(badRoll(1, roll('side', 'side'))).toBe('a party of one plays alone, never side')
    expect(badRoll(3, roll('together', 'high'))).toBeNull()
    expect(badRoll(3, roll('together', 'below'))).toBe('no room is seen below')
    expect(badRoll(3, roll('alone', 'side'))).toBe('no room is rolled alone')
    expect(badRoll(4, roll('contest', 'side'))).toBeNull()
  })
})
