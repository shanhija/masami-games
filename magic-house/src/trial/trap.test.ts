/**
 * The trial's way back (trial/trial.ts trapIn; engine/api.ts THE ROOM and THE TRIAL): over the
 * house's floor nobody falls out, so a place a player can get down to and not climb back to the play
 * from is a trap, and the trial fails it with MISTAKES.trapped, saying where. Fixtures of this file's
 * own: a well between two ledges taller than a jump from the side, and a corner fenced by a terrace
 * and a wall taller than a jump from high up, fail with the exact sentence; the same rooms with a
 * step, a solid that moves, a loose box or a lever in reach pass, and the same help out of reach does
 * not. Help the player can walk to counts as well as help within a jump: a wide well with a lever or
 * a hidden step at one end passes. A start on a ledge the player drops off and never needs again is
 * no trap. The look twins' fixture room passes, and what the check costs is measured.
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES, ROOM_PREAMBLE, type Builder, type Level, type RoomCode, type StepSpec } from '../engine/api'
import { sin } from '../engine/math'
import { buildRoom, RoomRuntime } from '../engine/room'
import { cube, NEVER, roomStart } from '../engine/testing'
import { HOUSE_SHELL, type RoomView } from '../engine/world'
import { TRIAL_MISTAKES } from './api'
import { looksTrialJob } from './twins/looks'
import { BOW, LOOKOUT, twinJob, twinTexts } from './twins/twins'
import { jobRoom, runTrial, trapIn, type TrialRoom } from './trial'

const REAL = () => performance.now()
const LONG = 120_000
const LEVELS: readonly Level[] = [1, 2, 3]

/** A room built from code for one player at a level, seen as `view` says. */
const built = (code: RoomCode, view: RoomView, level: Level) => buildRoom(code, { ...roomStart(1, 'together', level, 7), view }, new RoomRuntime())

/** What the way back says of a room at each level: the same at all three in these fixtures, so one answer. */
function wayBack(code: RoomCode, view: RoomView): string | null {
  const said = LEVELS.map((level) => trapIn(built(code, view, level)))
  expect(new Set(said).size).toBe(1)
  return said[0]
}

/**
 * From the side: a step and a ledge 2.5 m high on each side, and between the ledges a well 2 m wide
 * on the house's floor. The player starts on the floor at the left, climbs the step onto the left
 * ledge, and can drop into the well, whose walls are taller than a jump: everywhere else has its way
 * back (over the right ledge, its step and the floor beyond, and a jump back across the well).
 * `extra` adds what may help.
 */
const well = (extra: (r: Builder) => void): RoomCode => (r, w) => {
  r.box([-5.5, 0.6, 0], [1, 1.2, 1.5])
  r.box([-3, 1.25, 0], [4, 2.5, 1.5])
  r.box([3, 1.25, 0], [4, 2.5, 1.5])
  r.box([5.5, 0.6, 0], [1, 1.2, 1.5])
  extra(r)
  w.players()[0].putAt([-7, 0, 0])
  r.wayOut([0, 0, 0])
  r.steps(FAR_STEP)
}

/** A step whose place is on the house's floor at the right, beyond the well: a place the play needs that nobody in the well gets back to. */
const FAR_STEP: readonly StepSpec[] = [{ ...NEVER[0], at: [7, 0, 0] }]

/**
 * From the side: a well 6 m wide on the house's floor, between a ledge 2.5 m high on the left (with
 * its step) and a wall no jump tops on the right. The player starts on the floor at the left, where
 * the step's place is, and can drop into the well, most of which is more than a jump from either
 * side. `extra` adds what may help.
 */
const wideWell = (extra: (r: Builder) => void): RoomCode => (r, w) => {
  r.box([-5.5, 0.6, 0], [1, 1.2, 1.5])
  r.box([-4, 1.25, 0], [2, 2.5, 1.5])
  r.box([5, 1.25, 0], [4, 2.5, 1.5])
  extra(r)
  w.players()[0].putAt([-7, 0, 0])
  r.wayOut([0, 0, 0])
  r.steps([{ ...NEVER[0], at: [-7, 0, 0] }])
}

/**
 * From high up: a terrace 1.8 m high along z -2 to 0 at the left, a ramp up to it from the right,
 * and the room's back left corner (x -7 to -5, z -4 to -2) fenced by the terrace and a wall 1.8 m
 * high, both taller than a jump from the house's floor. The player starts on the floor at the right,
 * walks up the ramp and can drop off the terrace into the corner. `extra` adds what may help.
 */
const corner = (extra: (r: Builder) => void): RoomCode => (r, w) => {
  r.box([-5, 0.9, -1], [4, 1.8, 2])
  r.ramp([0, 0.9, -1], [6, 1.8, 2], 'left')
  r.box([-4.8, 0.9, -3], [0.4, 1.8, 2])
  extra(r)
  w.players()[0].putAt([4, 0, 2])
  r.wayOut([5, 0, -4])
  r.steps(NEVER)
}

const nothing = () => {}

/** The sentences, worked out once by hand from the fixtures: the trapped place nearest the start, and the start. */
const WELL_TRAP = MISTAKES.trapped([-0.7, 0], 0, [-7, 0], "step 1's place at 7, 0")
const CORNER_TRAP = MISTAKES.trapped([-5.2, 0, -2.2], 0, [4, 0, 2], "step 1's place at 0, 0, 0")

describe('the way back', () => {
  it('THE TRIAL names the check, and its sentence says where and the principle', () => {
    expect(ROOM_PREAMBLE).toContain(
      "every player starts on a floor with room to move, and from every place they can walk, jump, drop or ride to from their start they can still get back to their start, to every step's place and zone they could get to from it, or to something that answers, can be pushed or carried, or moves;",
    )
    expect(WELL_TRAP).toBe(
      "a player who gets down to -0.7, 0 cannot get back to player 0's start at -7, 0, nor to step 1's place at 7, 0, nor to anything that answers, can be pushed or carried, or moves: no walk, jump, drop or ride leads there. Nothing brings back a player who has dropped where they cannot get out, so wherever a player can get down to, they must be able to climb back up to the play from",
    )
  })

  describe('from the side', () => {
    it('fails a well between two ledges taller than a jump, naming the well', () => {
      expect(wayBack(well(nothing), 'side')).toBe(WELL_TRAP)
    })

    it('passes the well with a step in it: a walk and two jumps lead back', () => {
      expect(wayBack(well((r) => r.box([0, 0.6, 0], [0.8, 1.2, 1.5])), 'side')).toBeNull()
    })

    it('passes the well with a solid that moves in it', () => {
      expect(wayBack(well((r) => r.mover(() => r.box([0, 0, 0], [1, 0.2, 1.5]), (t) => ({ at: [0, 1.3 + 1.2 * sin(t), 0] }))), 'side')).toBeNull()
    })

    it('passes the well with a loose box in it, and fails it with the box out of reach', () => {
      expect(wayBack(well((r) => r.thing([0, 0, 0], cube(0.6, 0.6, 0.6))), 'side')).toBeNull()
      expect(wayBack(well((r) => r.thing([7, 0, 0], cube(0.6, 0.6, 0.6))), 'side')).toBe(WELL_TRAP)
    })

    it('passes the well with a lever in it, and fails it with the lever out of reach', () => {
      expect(wayBack(well((r) => r.box([0.5, 0.25, 0], [0.3, 0.5, 0.3], { use: () => {} })), 'side')).toBeNull()
      expect(wayBack(well((r) => r.box([7, 0.25, 0], [0.3, 0.5, 0.3], { use: () => {} })), 'side')).toBe(WELL_TRAP)
    })

    it('counts a ride on a solid that moves as a way back, though most of the well is out of reach of it', () => {
      // A well 6 m wide between the left ledge and a wall no jump tops; its only way out a lift at its left end, more than a jump from its right end.
      const lift: RoomCode = (r, w) => {
        r.box([-5.5, 0.6, 0], [1, 1.2, 1.5])
        r.box([-4, 1.25, 0], [2, 2.5, 1.5])
        r.box([5, 1.25, 0], [4, 2.5, 1.5])
        r.mover(() => r.box([0, 0, 0], [1, 0.2, 1.5]), (t) => ({ at: [-2.4, 1.3 + 1.2 * sin(t), 0] }))
        w.players()[0].putAt([-7, 0, 0])
        r.wayOut([0, 0, 0])
        r.steps(NEVER)
      }
      expect(wayBack(lift, 'side')).toBeNull()
    })

    it('fails a wide well, and passes it with a lever or a hidden step at one end, which a player in the well walks to', () => {
      expect(wayBack(wideWell(nothing), 'side')).toBe(MISTAKES.trapped([-2.7, 0], 0, [-7, 0], "step 1's place at -7, 0"))
      expect(wayBack(wideWell((r) => r.box([2.6, 0.25, 0], [0.3, 0.5, 0.3], { use: () => {} })), 'side')).toBeNull()
      expect(wayBack(wideWell((r) => r.box([-2.6, 0.6, 0], [0.6, 1.2, 1.5], { hidden: true })), 'side')).toBeNull()
    })

    it('passes a start on a ledge that the player drops off and never needs again: Pirate Sails with the fourth player on a lookout over the bow', () => {
      // The trap twin (twins.ts) without its rope moved up: every rope stays where the deck reaches it.
      const lookout = [
        { in: 'room', find: BOW, put: `${BOW}\n${LOOKOUT}` },
        { in: 'room', find: 'players.forEach((p, i) => p.putAt([starts[i], 0, 0]))', put: 'players.forEach((p, i) => p.putAt(i === 3 ? [7.45, 5, 0] : [starts[i], 0, 0]))' },
      ] as const
      const { job } = twinJob(twinTexts({ name: 'a start on the lookout', edits: lookout }))
      if (job === null) throw new Error('the lookout start does not pass the guard')
      const t = jobRoom(job)
      const runtime = new RoomRuntime()
      const code = t.room(runtime)
      for (const level of LEVELS) {
        const room = buildRoom(code, { ...roomStart(4, 'together', level, t.seed), shell: t.shell }, runtime)
        expect(room.world.players[3].at[1]).toBe(5)
        expect(trapIn(room)).toBeNull()
      }
    }, LONG)
  })

  describe('from high up', () => {
    it('fails a corner fenced by solids taller than a jump, naming the corner', () => {
      expect(wayBack(corner(nothing), 'high')).toBe(CORNER_TRAP)
    })

    it('passes the corner with a step in it', () => {
      expect(wayBack(corner((r) => r.box([-6, 0.55, -2.5], [1, 1.1, 1])), 'high')).toBeNull()
    })

    it('passes the corner with a solid that moves in it', () => {
      expect(wayBack(corner((r) => r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), (t) => ({ at: [-6, 0.9 + 0.8 * sin(t), -3] }))), 'high')).toBeNull()
    })

    it('passes the corner with a loose box in it, and fails it with the box out of reach', () => {
      expect(wayBack(corner((r) => r.thing([-6, 0, -3], cube(0.6, 0.6, 0.6))), 'high')).toBeNull()
      expect(wayBack(corner((r) => r.thing([5, 0, 3], cube(0.6, 0.6, 0.6))), 'high')).toBe(CORNER_TRAP)
    })

    it('passes the corner with a lever in it', () => {
      expect(wayBack(corner((r) => r.box([-6.5, 0.25, -3.5], [0.3, 0.5, 0.3], { use: () => {} })), 'high')).toBeNull()
    })
  })

  it('does not judge a player whose stick does not walk them', () => {
    const flying: RoomCode = (r, w) => {
      well(nothing)(r, w)
      r.controls(w.players(), { stick: 'fly', a: 'grab', b: null })
    }
    expect(wayBack(flying, 'side')).toBeNull()
  })

  it('fails the trial with the sentence at every level, said once', () => {
    const t: TrialRoom = {
      party: 1,
      seed: 7,
      roll: { kind: 'together', view: 'side' },
      level: 1,
      shell: HOUSE_SHELL,
      room: () => well(nothing),
      walk: () => {
        throw new Error('no walkthrough here')
      },
      texts: null,
    }
    const r = runTrial(t, REAL)
    expect(r.passed).toBe(false)
    expect(r.sentences).toEqual([TRIAL_MISTAKES.notCompiled('the walkthrough', 'Error: no walkthrough here'), `at level 1 (the same at level 2, at level 3): ${WELL_TRAP}`])
  }, LONG)

  it("passes the look twins' fixture room, and adds little to its trial's time", () => {
    const t = jobRoom(looksTrialJob())
    const runtime = new RoomRuntime()
    const code = t.room(runtime)
    let checkMs = 0
    for (const level of LEVELS) {
      const room = buildRoom(code, { ...roomStart(1, 'together', level, t.seed), shell: t.shell }, runtime)
      const began = performance.now()
      expect(trapIn(room)).toBeNull()
      checkMs += performance.now() - began
    }
    const report = runTrial(t, REAL)
    expect(report.sentences).toEqual([])
    // The check at three levels is a small share of the whole trial; a generous bound in milliseconds, as the share moves with how busy the machine is.
    console.log(`the way back: ${checkMs.toFixed(1)} ms at three levels of a ${report.ms} ms trial`)
    expect(checkMs).toBeLessThan(300)
  }, LONG)

  it('takes little time on the fixtures from high up, where the graph is biggest', () => {
    const rooms = LEVELS.map((level) => built(corner(nothing), 'high', level))
    const began = performance.now()
    for (const room of rooms) trapIn(room)
    const ms = performance.now() - began
    console.log(`the way back from high up: ${ms.toFixed(1)} ms at three levels`)
    expect(ms).toBeLessThan(1000)
  })
})
