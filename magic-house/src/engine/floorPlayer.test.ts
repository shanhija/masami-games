/**
 * Magic House: the feel of a player from high up (engine/floorPlayer.ts), held to the same FEEL as
 * the side's (engine/player.test.ts): the walk on the floor any way, the jump's two heights, the
 * widest gap a running jump clears along x, along z and at a slant over turned floors, the step up,
 * the slope rising any way, walls slid along, the forgiving jump, ceilings and heads.
 */

import { describe, expect, it } from 'vitest'
import { NO_POINTING } from '../seats/types'
import { FEEL, type Builder, type Point, type Solid, type World } from './api'
import { atan2 } from './math'
import type { Room } from './room'
import { NEVER, partyOf, playRoom, testRoom, type Hold } from './testing'
import { HOUSE_SHELL } from './world'

const IDLE: Hold = { stick: [0, 0], a: false, b: false }
const deg = (d: number) => (d * Math.PI) / 180

/** A room from high up for one or two on the house's floor, built by `build` (which puts the players). */
function bigFloor(party: 1 | 2, build: (r: Builder, w: World) => void): Room {
  return testRoom(
    (r, w) => {
      r.wayOut([0, 0, -4])
      r.steps(NEVER)
      build(r, w)
    },
    { seed: 3, level: 1, kind: 'together', view: 'high', shell: HOUSE_SHELL, party: partyOf(party) },
  )
}

/** One player on the house's floor, whose top is at y 0, standing at `at`. */
function onGround(at: Point, build: (r: Builder, w: World) => void = () => {}): Room {
  return bigFloor(1, (r, w) => {
    w.players()[0].putAt(at)
    build(r, w)
  })
}

const play1 = (room: Room, frames: number, holds: (f: number) => Hold) => playRoom(room, frames, (f) => [holds(f)], () => NO_POINTING)

/** The stick that walks the floor toward (dx, dz): its right is +x, its up is -z. */
const toward = (dx: number, dz: number): readonly [number, number] => [dx, -dz]

describe('the feel of a player from high up (FEEL)', () => {
  it('walks at FEEL.walk any way on the floor, and no faster at a slant', () => {
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [0, -1],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ]) {
      // From 3 m back, so the 6 m walked stay inside the room's floor.
      const room = onGround([-3 * dx, 0, -3 * dz])
      // A stick pushed all the way into a corner is still one long.
      const stick = dx !== 0 && dz !== 0 ? toward(1, -1) : toward(dx, dz)
      play1(room, 30, () => ({ stick, a: false, b: false }))
      const [x0, , z0] = room.world.players[0].at
      play1(room, 60, () => ({ stick, a: false, b: false }))
      const [x1, , z1] = room.world.players[0].at
      expect(Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2)).toBeCloseTo(FEEL.walk, 2)
      expect((x1 - x0) * dx + (z1 - z0) * dz).toBeCloseTo(FEEL.walk, 2)
    }
  })

  it('lifts the feet FEEL.jumpHigh on a held jump and FEEL.jumpLow on a short press', () => {
    const top = (holdFrames: number) => {
      const room = onGround([0, 0, 0])
      let most = 0
      for (let f = 0; f < 90; f++) {
        play1(room, 1, () => ({ stick: [0, 0], a: f < holdFrames, b: false }))
        most = Math.max(most, room.world.players[0].at[1])
      }
      return most
    }
    expect(Math.abs(top(60) - FEEL.jumpHigh)).toBeLessThan(0.03)
    expect(Math.abs(top(1) - FEEL.jumpLow)).toBeLessThan(0.03)
    const mid = top(14)
    expect(mid).toBeGreaterThan(FEEL.jumpLow + 0.1)
    expect(mid).toBeLessThan(FEEL.jumpHigh - 0.1)
  })

  /**
   * Whether a running jump pressed at this frame clears a gap of this width between two raised floors
   * the way (dx, dz) runs, turned to run that way, from the far end of the first: floors LEDGE.long
   * along the run and LEDGE.high tall on the house's floor, low enough that a jump from them stays
   * under the room's top, so a jump that falls short comes down on the house's floor below them.
   */
  const LEDGE = { long: 2.35, wide: 1.5, high: 0.2 } as const
  const clears = (gap: number, dx: number, dz: number, press: number): boolean => {
    const turn = atan2(-dz, dx)
    let far: Solid | null = null
    const room = bigFloor(1, (r, w) => {
      const mid = gap / 2 + LEDGE.long / 2
      const size: Point = [LEDGE.long, LEDGE.high, LEDGE.wide]
      r.box([-mid * dx, LEDGE.high / 2, -mid * dz], size, { turn })
      far = r.box([mid * dx, LEDGE.high / 2, mid * dz], size, { turn })
      const back = gap / 2 + LEDGE.long - 0.3
      w.players()[0].putAt([-back * dx, LEDGE.high, -back * dz])
    })
    const farId = room.handles.idOf(far)
    for (let f = 0; f < 240; f++) {
      play1(room, 1, () => ({ stick: toward(dx, dz), a: f >= press && f < press + 60, b: false }))
      const p = room.world.players[0]
      if (p.on === farId) return true
      if (p.at[1] < LEDGE.high - 0.1) return false
    }
    return false
  }
  const anyClears = (gap: number, dx: number, dz: number) => {
    for (let f = 0; f < 50; f++) if (clears(gap, dx, dz, f)) return true
    return false
  }

  it(`clears a gap of ${FEEL.jumpAcross} m with a running jump along x, along z and at a slant, and not one of ${FEEL.jumpAcross * 1.1} m`, () => {
    for (const [dx, dz] of [
      [1, 0],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ]) {
      expect(anyClears(FEEL.jumpAcross, dx, dz), `${dx}, ${dz}`).toBe(true)
      expect(anyClears(FEEL.jumpAcross * 1.1, dx, dz), `${dx}, ${dz}`).toBe(false)
    }
  })

  it(`walks up a step of ${FEEL.stepUp} m and not one of 0.35 m`, () => {
    for (const [h, up] of [
      [FEEL.stepUp, true],
      [0.35, false],
    ] as const) {
      // The step stands behind them, toward -z.
      const room = onGround([0, 0, 3], (r) => r.box([0, h / 2, -2], [4, h, 4]))
      play1(room, 120, () => ({ stick: toward(0, -1), a: false, b: false }))
      const p = room.world.players[0]
      expect(p.at[2] < -0.5).toBe(up)
      if (up) expect(p.at[1]).toBeCloseTo(h, 6)
      else expect(p.at[2]).toBeGreaterThan(0)
    }
  })

  it(`walks up a ${FEEL.slope} degree slope rising any way, and not a 50 degree one`, () => {
    for (const rises of ['right', 'left', 'back', 'front'] as const) {
      for (const [angle, up] of [
        [FEEL.slope, true],
        [50, false],
      ] as const) {
        // A ramp 1.5 m high (a player on it stays under the room's top), its run along the way it rises, with a landing at its top.
        const h = 1.5
        const run = h / Math.tan(deg(angle))
        const [dx, dz] = rises === 'right' ? [1, 0] : rises === 'left' ? [-1, 0] : rises === 'back' ? [0, -1] : [0, 1]
        const room = onGround([-3 * dx, 0, -3 * dz], (r) => {
          const along = dx !== 0
          r.ramp([(run / 2) * dx, h / 2, (run / 2) * dz], along ? [run, h, 3] : [3, h, run], rises)
          r.box([(run + 1) * dx, h / 2, (run + 1) * dz], along ? [2, h, 3] : [3, h, 2])
        })
        let highest = 0
        for (let f = 0; f < 100; f++) {
          play1(room, 1, () => ({ stick: toward(dx, dz), a: false, b: false }))
          highest = Math.max(highest, room.world.players[0].at[1])
        }
        if (up) expect(room.world.players[0].at[1], `${rises} ${angle}`).toBeCloseTo(h, 6)
        else expect(highest, `${rises} ${angle}`).toBeLessThan(0.4)
      }
    }
  })

  it('slides along a wall it walks into at a slant, a turned wall too', () => {
    for (const turn of [0, deg(30)]) {
      // A long wall across z = -1 (turned round y), walked into toward -z and +x at once.
      const room = onGround([0, 0, 0], (r) => r.box([0, 1, -1.5], [8, 2, 1], { turn }))
      play1(room, 60, () => ({ stick: toward(Math.SQRT1_2, -Math.SQRT1_2), a: false, b: false }))
      const p = room.world.players[0]
      expect(p.at[0]).toBeGreaterThan(1.5)
      // Never into the wall: the corner of their box nearest it stays on the near side of its face, 0.5 m from its middle (0, -1.5) along its own z turned, (sin turn, cos turn).
      const [nx, nz] = [Math.sin(turn), Math.cos(turn)]
      expect((p.at[0] - FEEL.width / 2) * nx + (p.at[2] - FEEL.width / 2 + 1.5) * nz).toBeGreaterThanOrEqual(0.5 - 0.02)
    }
  })

  it('forgives a jump pressed just after walking off a ledge', () => {
    // A ledge 1.8 m up, as high as a player on it stays under the room's top: they are still falling when a press 12 frames after leaving it would be kept no longer.
    const jumpAfterLedge = (late: number) => {
      const room = bigFloor(
        1,
        (r, w) => {
          r.box([0, 0.9, -2], [8, 1.8, 4])
          w.players()[0].putAt([0, 1.8, -1])
        },
      )
      let left = -1
      for (let f = 0; f < 120; f++) {
        const p = room.world.players[0]
        const press = left >= 0 && f === left + late
        play1(room, 1, () => ({ stick: toward(0, 1), a: press, b: false }))
        if (left < 0 && p.on === null) left = f
        if (p.jumpedAt > -Infinity) return true
      }
      return false
    }
    expect(jumpAfterLedge(1)).toBe(true)
    expect(jumpAfterLedge(3)).toBe(true)
    expect(jumpAfterLedge(12)).toBe(false)
  })

  it('stops a jump at a ceiling', () => {
    const room = onGround([0, 0, 0], (r) => r.box([0, 2.5, 0], [4, 1, 4]))
    let top = 0
    for (let f = 0; f < 60; f++) {
      play1(room, 1, () => ({ stick: [0, 0], a: true, b: false }))
      top = Math.max(top, room.world.players[0].at[1])
    }
    expect(top).toBeCloseTo(2 - FEEL.height, 6)
  })

  it('walk through each other, and stand on each other', () => {
    const room = bigFloor(2, (_, w) => {
      w.players()[0].putAt([0, 0, 0])
      w.players()[1].putAt([0, 0, -1])
    })
    // The second jumps onto the first's head from behind, and rides there as the first walks.
    playRoom(room, 60, (f) => [IDLE, { stick: toward(0, f < 20 ? 0.3 : 0), a: f < 30, b: false }], () => NO_POINTING)
    const [c, d] = room.world.players
    expect(d.on).toBe(c.id)
    expect(d.at[1]).toBeCloseTo(FEEL.height, 6)
    const offset = d.at[2] - c.at[2]
    playRoom(room, 30, () => [{ stick: toward(0, 1), a: false, b: false }, IDLE], () => NO_POINTING)
    expect(c.at[2]).toBeGreaterThan(1.5)
    expect(d.on).toBe(c.id)
    expect(d.at[2] - c.at[2]).toBeCloseTo(offset, 6)
  })
})
