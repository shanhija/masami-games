import { describe, expect, it } from 'vitest'
import { FEEL } from './api'
import { setControls, setPushing } from './sim'
import { NO_LISTENS } from './state'
import { IDLE, finishBuild, onFloor, play, slab, solid, testSim, type Hold } from './testing'

const RIGHT: Hold = { stick: [1, 0], a: false, b: false }
const deg = (d: number) => (d * Math.PI) / 180

/** The highest the feet go after a jump whose button is held for so many frames. */
function topOfJump(holdFrames: number): number {
  const { sim } = testSim(1, 'together', 1)
  onFloor(sim, [0])
  finishBuild(sim)
  let top = 0
  for (let f = 0; f < 90; f++) {
    play(sim, 1, () => [{ stick: [0, 0], a: f < holdFrames, b: false }])
    top = Math.max(top, sim.world.players[0].at[1])
  }
  return top
}

/** Whether a running jump pressed at this frame clears a gap of this width between two floors at the same height. */
function clears(gap: number, pressFrame: number): boolean {
  const { sim } = testSim(1, 'together', 1)
  slab(sim, -8, -1, 0, 0, {}, NO_LISTENS)
  slab(sim, gap, -1, 8, 0, {}, NO_LISTENS)
  sim.world.players[0].at = [-6, 0, 0]
  finishBuild(sim)
  for (let f = 0; f < 240; f++) {
    play(sim, 1, () => [{ stick: [1, 0], a: f >= pressFrame && f < pressFrame + 60, b: false }])
    const p = sim.world.players[0]
    if (p.at[0] > gap + 0.3 && p.on !== null) return true
    if (p.at[1] < -0.3) return false
  }
  return false
}

/** Whether any timing of a running jump clears the gap: the best a bot's search can do. */
function anyClears(gap: number): boolean {
  for (let f = 60; f < 110; f++) if (clears(gap, f)) return true
  return false
}

describe('the feel of a player (FEEL)', () => {
  it('walks at FEEL.walk', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    finishBuild(sim)
    play(sim, 30, () => [RIGHT])
    const x0 = sim.world.players[0].at[0]
    play(sim, 60, () => [RIGHT])
    expect(sim.world.players[0].at[0] - x0).toBeCloseTo(FEEL.walk, 2)
    expect(sim.world.players[0].velocity[0]).toBeCloseTo(FEEL.walk, 6)
  })

  it('lifts the feet FEEL.jumpHigh on a held jump and FEEL.jumpLow on a short press', () => {
    expect(Math.abs(topOfJump(60) - FEEL.jumpHigh)).toBeLessThan(0.03)
    expect(Math.abs(topOfJump(1) - FEEL.jumpLow)).toBeLessThan(0.03)
    // A press of a few frames is still the short hop; letting go halfway up stops between the two.
    expect(Math.abs(topOfJump(4) - FEEL.jumpLow)).toBeLessThan(0.03)
    const mid = topOfJump(14)
    expect(mid).toBeGreaterThan(FEEL.jumpLow + 0.1)
    expect(mid).toBeLessThan(FEEL.jumpHigh - 0.1)
  })

  it(`clears a gap of ${FEEL.jumpAcross} m with a running jump, and not one of ${FEEL.jumpAcross * 1.1} m`, () => {
    expect(anyClears(FEEL.jumpAcross)).toBe(true)
    expect(anyClears(FEEL.jumpAcross * 1.1)).toBe(false)
  })

  it(`walks up a step of ${FEEL.stepUp} m and not one of 0.35 m`, () => {
    for (const [h, up] of [
      [FEEL.stepUp, true],
      [0.35, false],
    ] as const) {
      const { sim } = testSim(1, 'together', 1)
      onFloor(sim, [-3])
      slab(sim, 0, 0, 5, h, {}, NO_LISTENS)
      finishBuild(sim)
      play(sim, 120, () => [RIGHT])
      const p = sim.world.players[0]
      expect(p.at[0] > 1).toBe(up)
      if (up) expect(p.at[1]).toBeCloseTo(h, 6)
      else expect(p.at[0]).toBeLessThan(0)
    }
  })

  it(`walks up a ${FEEL.slope} degree slope and not a 50 degree one`, () => {
    for (const [angle, up] of [
      [FEEL.slope, true],
      [50, false],
    ] as const) {
      const { sim } = testSim(1, 'together', 1)
      onFloor(sim, [-3])
      // A ramp 2 m high rising to the right from x 0, and a landing at its top.
      const w = 2 / Math.tan(deg(angle))
      solid(sim, [w / 2, 1, 0], { kind: 'ramp', size: [w, 2, 2], rises: 'right' }, {}, 0, NO_LISTENS)
      slab(sim, w, 0, w + 4, 2, {}, NO_LISTENS)
      finishBuild(sim)
      let highest = 0
      // 100 frames take them 6.7 m: past the ramp and onto the landing if they can climb.
      for (let f = 0; f < 100; f++) {
        play(sim, 1, () => [RIGHT])
        highest = Math.max(highest, sim.world.players[0].at[1])
      }
      if (up) expect(sim.world.players[0].at[1]).toBeCloseTo(2, 6)
      else expect(highest).toBeLessThan(0.4)
    }
  })

  it('forgives a jump pressed just after walking off a ledge, and keeps a press made just before landing', () => {
    // A ledge as high as a player on it stays under the ceiling: they are still falling when the late press, and the frames it is held (each a new press here), would be kept no longer.
    const jumpAfterLedge = (late: number) => {
      const { sim } = testSim(1, 'together', 1)
      slab(sim, -8, 5.6, 0, 6.6, {}, NO_LISTENS)
      slab(sim, -8, -1, 8, 0, {}, NO_LISTENS)
      sim.world.players[0].at = [-2, 6.6, 0]
      finishBuild(sim)
      let left = -1
      for (let f = 0; f < 120; f++) {
        const p = sim.world.players[0]
        const press = left >= 0 && f === left + late
        play(sim, 1, () => [{ stick: [1, 0], a: press || (left >= 0 && f > left + late && f < left + late + 20), b: false }])
        if (left < 0 && p.on === null) left = f
        if (p.jumpedAt > -Infinity) return true
      }
      return false
    }
    expect(jumpAfterLedge(1)).toBe(true)
    expect(jumpAfterLedge(3)).toBe(true)
    expect(jumpAfterLedge(12)).toBe(false)

    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    finishBuild(sim)
    // Up from a jump, then a press 6 frames before landing: it jumps again the frame it lands.
    play(sim, 2, (f) => [{ stick: [0, 0], a: f === 0, b: false }])
    let landedFrame = -1
    let jumps = 0
    let lastJump = sim.world.players[0].jumpedAt
    for (let f = 0; f < 60; f++) {
      const p = sim.world.players[0]
      const falling = p.velocity[1] < 0 && p.at[1] < 0.15 && p.at[1] > 0.02
      play(sim, 1, () => [{ stick: [0, 0], a: falling || (landedFrame >= 0 && f < landedFrame + 20), b: false }])
      if (falling && landedFrame < 0) landedFrame = f
      if (p.jumpedAt !== lastJump) {
        jumps += 1
        lastJump = p.jumpedAt
      }
    }
    expect(jumps).toBe(1)
  })

  it('stops a jump at a ceiling', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    slab(sim, -2, 2, 2, 3, {}, NO_LISTENS)
    finishBuild(sim)
    let top = 0
    for (let f = 0; f < 60; f++) {
      play(sim, 1, () => [{ stick: [0, 0], a: true, b: false }])
      top = Math.max(top, sim.world.players[0].at[1])
    }
    expect(top).toBeCloseTo(2 - FEEL.height, 6)
  })
})

describe('players together', () => {
  it('walk through each other, and stand on each other', () => {
    const { sim } = testSim(2, 'together', 1)
    onFloor(sim, [-2, 2])
    finishBuild(sim)
    play(sim, 90, () => [RIGHT, { stick: [-1, 0], a: false, b: false }])
    const [a, b] = sim.world.players
    expect(a.at[0]).toBeGreaterThan(2)
    expect(b.at[0]).toBeLessThan(-2)

    // The second jumps onto the first's head, and rides there as the first walks.
    const two = testSim(2, 'together', 1).sim
    onFloor(two, [0, 1])
    finishBuild(two)
    play(two, 60, (f) => [IDLE, { stick: [f < 20 ? -0.3 : 0, 0], a: f < 30, b: false }])
    const [c, d] = two.world.players
    expect(d.on).toBe(c.id)
    expect(d.at[1]).toBeCloseTo(FEEL.height, 6)
    const offset = d.at[0] - c.at[0]
    play(two, 30, () => [RIGHT, IDLE])
    expect(c.at[0]).toBeGreaterThan(1.5)
    expect(d.on).toBe(c.id)
    expect(d.at[0] - c.at[0]).toBeCloseTo(offset, 6)
  })

  it('push each other when pushing is on', () => {
    const { sim } = testSim(2, 'contest', 1)
    onFloor(sim, [-2, 2])
    setPushing(sim, true)
    finishBuild(sim)
    play(sim, 90, () => [RIGHT, { stick: [-1, 0], a: false, b: false }])
    const [a, b] = sim.world.players
    expect(b.at[0] - a.at[0]).toBeGreaterThan(FEEL.width - 0.02)
  })

  it("fly where the stick says, and do not move by a stick that is 'none'", () => {
    const { sim } = testSim(2, 'together', 1)
    onFloor(sim, [-2, 2])
    setControls(sim, 0, 'fly', 'grab', null)
    setControls(sim, 1, 'none', 'grab', null)
    finishBuild(sim)
    play(sim, 60, () => [{ stick: [0, 1], a: false, b: false }, RIGHT])
    const [a, b] = sim.world.players
    expect(a.at[1]).toBeGreaterThan(3)
    expect(b.at[0]).toBeCloseTo(2, 6)
    play(sim, 60, () => [IDLE, IDLE])
    expect(a.at[1]).toBeGreaterThan(3)
  })
})
