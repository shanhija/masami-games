import { describe, expect, it } from 'vitest'

import type { Player } from '../engine/world'
import { ANIM, animate } from './animate'
import { fixture } from './fixtures'

/** A player standing on a floor, as the meadow's first, changed by `o`. */
function player(o: Partial<Player>): Player {
  return { ...fixture('small').world.players[0]!, ...o }
}

describe('the animator', () => {
  it('walks by the metres walked: the legs swing opposite and change over half a cycle, the back leg bends', () => {
    const at = (stride: number) => animate(player({ velocity: [4, 0, 0], stride }), 1, 'side').pose
    const a = at(ANIM.cycle / 4)
    expect(a.legL.swing).toBeGreaterThan(0.5)
    expect(a.legR.swing).toBeCloseTo(-a.legL.swing)
    expect(a.legR.bend).toBeGreaterThan(a.legL.bend)
    expect(a.armL.swing).toBeLessThan(0)
    const b = at((3 * ANIM.cycle) / 4)
    expect(b.legL.swing).toBeCloseTo(-a.legL.swing)
    // The same metres walked, the same pose, whatever the time.
    expect(animate(player({ velocity: [4, 0, 0], stride: 0.3 }), 2, 'side').pose.legL).toEqual(animate(player({ velocity: [4, 0, 0], stride: 0.3 }), 7, 'side').pose.legL)
  })

  it('stands still breathing, the legs straight', () => {
    const p = animate(player({}), 3, 'side').pose
    expect(p.legL.swing).toBeCloseTo(0)
    expect(p.legR.swing).toBeCloseTo(0)
    expect(Math.abs(p.bob)).toBeLessThan(0.01)
  })

  it('jumps with a knee and an arm up, and comes down with its arms out', () => {
    const up = animate(player({ on: null, velocity: [0, 5, 0], jumpedAt: 0.95 }), 1, 'side')
    expect(up.pose.legL.bend).toBeGreaterThan(1)
    expect(up.pose.armR.swing).toBeGreaterThan(2.5)
    expect(up.pose.squash).toBeGreaterThan(1)
    const down = animate(player({ on: null, velocity: [0, -5, 0] }), 1, 'side')
    expect(down.pose.armL.raise).toBeGreaterThan(1)
    expect(down.mood).toBe('happy')
    expect(animate(player({ on: null, velocity: [0, -12, 0] }), 1, 'side').mood).toBe('surprised')
  })

  it('squashes on landing, more after a harder fall, and is itself again after', () => {
    const soft = animate(player({ landedAt: 0.98, landSpeed: 4 }), 1, 'side').pose.squash
    const hard = animate(player({ landedAt: 0.98, landSpeed: 10 }), 1, 'side').pose.squash
    expect(soft).toBeLessThan(1)
    expect(hard).toBeLessThan(soft)
    expect(animate(player({ landedAt: 0.5, landSpeed: 10 }), 1, 'side').pose.squash).toBe(1)
  })

  it('carries over the head with both arms, lifting it there after the pick-up', () => {
    const held = animate(player({ holding: 9, grabbedAt: 0 }), 5, 'side').pose
    expect(held.armL.swing).toBeGreaterThan(2.5)
    expect(held.armR.swing).toBe(held.armL.swing)
    const lifting = animate(player({ holding: 9, grabbedAt: 5 }), 5.05, 'side').pose
    expect(lifting.armL.swing).toBeLessThan(held.armL.swing)
  })

  it('leans into a push with its arms out in front, and throws from over the head', () => {
    const push = animate(player({ pushing: 9, velocity: [1.5, 0, 0], stride: 2 }), 1, 'side').pose
    expect(push.lean).toBeGreaterThan(0.3)
    expect(push.armL.swing).toBeGreaterThan(1.2)
    const throwing = animate(player({ threwAt: 0.9 }), 1, 'side').pose
    expect(throwing.armR.swing).toBeGreaterThan(0.9)
    expect(throwing.armR.swing).toBeLessThan(Math.PI)
  })

  it('reaches out when it uses something', () => {
    expect(animate(player({ grabbedAt: 0.9 }), 1 + ANIM.grab / 2 - 0.1, 'side').pose.armR.swing).toBeGreaterThan(1)
  })

  it('is bonked with stars, a surprised face and a wobble, only while it lasts', () => {
    const bonked = animate(player({ bonkedUntil: 2 }), 1.3, 'side')
    expect(bonked.stars).toBe(true)
    expect(bonked.mood).toBe('surprised')
    expect(bonked.pose.armL.raise).toBeGreaterThan(0.5)
    expect(animate(player({ bonkedUntil: 2 }), 2.1, 'side').stars).toBe(false)
  })

  it('faces the way the world says, turned enough to keep its face in view', () => {
    expect(animate(player({ facing: 1 }), 0, 'side').yaw).toBe(ANIM.side)
    expect(animate(player({ facing: -1 }), 0, 'side').yaw).toBe(-ANIM.side)
    expect(ANIM.side).toBeLessThan(Math.PI / 2)
  })

  it('from high up turns all the way to its heading, and walks by its speed on the floor', () => {
    // Silly Billy's kid faces +z: toward the viewer is 0, +x a quarter turn, away from the viewer half a turn.
    expect(animate(player({ heading: [0, 0, 1] }), 0, 'high').yaw).toBeCloseTo(0)
    expect(animate(player({ heading: [1, 0, 0] }), 0, 'high').yaw).toBeCloseTo(Math.PI / 2)
    expect(animate(player({ heading: [-1, 0, 0] }), 0, 'high').yaw).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(animate(player({ heading: [0, 0, -1] }), 0, 'high').yaw)).toBeCloseTo(Math.PI)
    // Walking toward -z swings the legs as walking along x does.
    const along = animate(player({ velocity: [4, 0, 0], stride: ANIM.cycle / 4 }), 1, 'high').pose.legL.swing
    expect(animate(player({ velocity: [0, 0, -4], stride: ANIM.cycle / 4 }), 1, 'high').pose.legL.swing).toBeCloseTo(along)
    expect(along).toBeGreaterThan(0.5)
  })

  it('is drawn at the size the world says', () => {
    expect(animate(player({ size: 1.6 }), 5, 'side').scale).toBe(1.6)
    expect(animate(player({}), 5, 'side').scale).toBe(1)
  })

  it('blinks while coming back after a fall, and is shown once it is back', () => {
    const back = player({ back: { from: [0, 0, 0], until: 2 } })
    const shown = Array.from({ length: 20 }, (_, i) => animate(back, 1 + i * 0.05, 'side').shown)
    expect(shown).toContain(true)
    expect(shown).toContain(false)
    expect(animate(back, 2.01, 'side').shown).toBe(true)
  })
})
