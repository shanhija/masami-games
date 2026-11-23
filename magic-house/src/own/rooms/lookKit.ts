/**
 * What the own rooms' looks (<room>.look.ts), written by hand, share: a fixed scatter with no dice,
 * and the play's solids found by their names, to read or to dress with a model built to their size.
 */

import type { Model } from '../../engine/gift'
import type { LookBuilder, RoomSeen, SeenSolid } from '../../engine/look'

/** A point of the 2D low-discrepancy sequence over the unit square: evenly spread, never in rows, with no dice. */
export function spread(i: number): [number, number] {
  return [(0.5 + i * 0.7548776662) % 1, (0.5 + i * 0.569840291) % 1]
}

/**
 * The play's solids by their names: `solid` finds one, which the room code always builds (a missing
 * one is a mistake in the look, so it throws), and `dressAs` draws one as the model that `model`
 * builds to the solid's size.
 */
export function byName(r: LookBuilder, room: RoomSeen): { solid(name: string): SeenSolid; dressAs(name: string, model: (w: number, h: number, d: number) => Model): void } {
  const solid = (name: string): SeenSolid => {
    const s = room.solids().find((x) => x.name() === name)
    if (s === undefined) throw new Error(`the room has no solid named ${name}`)
    return s
  }
  return {
    solid,
    dressAs: (name, model) => {
      const s = solid(name)
      const [w, h, d] = s.size()
      r.dress(s, model(w, h, d))
    },
  }
}
