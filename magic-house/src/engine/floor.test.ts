/**
 * Magic House: the view from high up (step 6) in the engine. The floor is x and z, y is up. Every
 * line of the reference that differs from high up does what it says here (the tests are named by
 * the line's own key), the controller on the floor keeps FEEL as the side's does, and a room seen
 * from high up plays the same every time.
 */

import { describe, expect, it } from 'vitest'
import { NO_POINTING, type Pointing } from '../seats/types'
import { FEEL, MISTAKES, ROOM, SURVEY_NOTES, type Builder, type Level, type Mover, type Player, type Point, type Solid, type StepSpec, type Thing, type World } from './api'
import { solidInPlayerFloor } from './floorState'
import { type Room } from './room'
import { buildSentence, cube, houseFloor, idle, NEVER, partyOf, playRoom, randomHolds, roomStart, testRoom, type Hold } from './testing'
import type { RoomStart } from './sim'
import { surveyText } from './survey'
import { HIGH_FRAME } from './camera'
import { HOUSE_SHELL, ROOM_BOUNDS } from './world'

/** How a room seen from high up starts: played together, in the house's own shell. */
function floorStart(party: 1 | 2 | 3 | 4, level: Level, seed: number): RoomStart {
  return { seed, level, kind: 'together', view: 'high', shell: HOUSE_SHELL, party: partyOf(party) }
}

/** The least a room from high up needs: everyone on the house's floor 1.5 m apart from x -4 at z 0, the way out in the back wall, and these steps. */
function plainFloor(r: Builder, w: World, steps: readonly StepSpec[]): void {
  w.players().forEach((p, i) => p.putAt([-4 + 1.5 * i, 0, 0]))
  r.wayOut([6, 0, -4])
  r.steps(steps)
}

function floorRoom(party: 1 | 2 | 3 | 4, build: (r: Builder, w: World) => void): Room {
  return testRoom((r, w) => {
    plainFloor(r, w, NEVER)
    build(r, w)
  }, floorStart(party, 1, 9))
}

const hold = (room: Room, frames: number, h: Hold, pointing: (f: number) => Pointing = () => NO_POINTING) => playRoom(room, frames, () => room.world.players.map(() => h), pointing)
const STICK = (x: number, y: number): Hold => ({ stick: [x, y], a: false, b: false })

describe('a room seen from high up', () => {
  it('builds, keeps every z, and stands still when nobody moves', () => {
    const room = floorRoom(2, () => {})
    expect(room.world.players.map((p) => p.at)).toEqual([
      [-4, 0, 0],
      [-2.5, 0, 0],
    ])
    expect(room.world.players.every((p) => p.on !== null)).toBe(true)
    playRoom(room, 120, idle(room), () => NO_POINTING)
    expect(room.world.players.map((p) => p.at)).toEqual([
      [-4, 0, 0],
      [-2.5, 0, 0],
    ])
  })

  it('walks the floor by the stick: its right toward +x, its up toward -z', () => {
    const room = floorRoom(1, () => {})
    hold(room, 60, STICK(1, 0))
    const p = room.world.players[0]
    expect(p.at[0]).toBeGreaterThan(-4 + 3.5)
    expect(p.at[2]).toBe(0)
    hold(room, 60, STICK(0, 1))
    expect(p.at[2]).toBeLessThan(-3.5)
    expect(p.heading).toEqual([0, 0, -1])
  })
})

/** Builds a room from high up on the plain floor and gives back what `build` made. */
function withFloor<T>(party: 1 | 2 | 3 | 4, build: (r: Builder, w: World) => T, start: RoomStart = floorStart(party, 1, 9)): { room: Room; got: T } {
  const box: { got: T | null } = { got: null }
  const room = testRoom((r, w) => {
    plainFloor(r, w, NEVER)
    box.got = build(r, w)
  }, start)
  return { room, got: box.got as T }
}

/** Runs handle calls from outside made code, as a test does, on a budget of their own. */
function act<T>(room: Room, call: () => T): T {
  room.runtime.budget.start(Number.MAX_SAFE_INTEGER, 'a test ran too long')
  return call()
}

const GRAB = (x: number, y: number, press: boolean): Hold => ({ stick: [x, y], a: false, b: press })
const solidIndex = (room: Room, s: Solid) => room.sim.where[room.handles.idOf(s) as number].i
const thingOf = (room: Room, t: Thing) => room.world.things[room.sim.where[room.handles.idOf(t) as number].i]

describe('every line that differs from high up does what it says', () => {
  it("the room's box from high up is the house's: the floor ROOM.high.width by ROOM.high.depth, players held under ROOM.high.height", () => {
    const room = floorRoom(1, () => {})
    expect(room.world.bounds).toEqual(ROOM_BOUNDS.high)
    expect(ROOM_BOUNDS.high).toEqual({ min: [-ROOM.high.width / 2, 0, -ROOM.high.depth / 2], max: [ROOM.high.width / 2, ROOM.high.height, ROOM.high.depth / 2] })
  })

  it("r.ramp: from high up a ramp rises 'back' (-z) or 'front' (+z); from the side only right or left", () => {
    const { room, got } = withFloor(1, (r) => ({ back: r.ramp([0, 0.5, -3], [3, 1, 2], 'back'), front: r.ramp([5, 0.5, 3], [3, 1, 2], 'front') }))
    const back = room.sim.outlines[solidIndex(room, got.back)]
    const front = room.sim.outlines[solidIndex(room, got.front)]
    // Each rises 1 m over its 2 m run along z: the back one toward -z, the front one toward +z.
    expect([back.ux + 0, back.uz, back.grade]).toEqual([0, -1, 0.5])
    expect([front.ux + 0, front.uz, front.grade]).toEqual([0, 1, 0.5])
    expect(room.survey.floors[0]).toMatchObject({ rises: 'back', slope: 26.57, z0: -4, z1: -2, top: 1 })
    expect(surveyText(room.survey, (id) => room.describe(id))).toContain('a ramp sloping 26.57 degrees up toward -z: x -1.5 to 1.5, z -4 to -2, top 1')
    expect(buildSentence((r, w) => {
      w.players()[0].putAt([0, 0, 0])
      r.wayOut([6, 0, 0])
      r.steps(NEVER)
      r.ramp([3, 0.5, 0], [2, 1, 2], 'back')
    }, roomStart(1, 'together', 1, 9))).toBe(MISTAKES.notChoice('r.ramp', 'rises', "'back'", ['right', 'left']))
  })

  it('r.mover: from high up its place is { at: [x, y, z], turn }, the turn round y counterclockwise as seen from above', () => {
    const { room, got } = withFloor(1, (r) => {
      let part: Solid | null = null
      const mover = r.mover(
        () => (part = r.box([1, 0, 0], [0.5, 0.2, 0.5])),
        (t) => ({ at: [0, 2, -2 + t], turn: t * (Math.PI / 2) }),
      )
      return { mover, part: part as unknown as Solid }
    })
    expect(act(room, () => got.mover.at())).toEqual([0, 2, -2])
    playRoom(room, 60, idle(room), () => NO_POINTING)
    const at = act(room, () => got.mover.at())
    expect(at[2]).toBeCloseTo(-1, 9)
    // A quarter turn takes the part 1 m along +x to 1 m toward -z.
    const p = act(room, () => got.part.at())
    expect(p[0]).toBeCloseTo(0, 9)
    expect(p[1]).toBeCloseTo(2, 9)
    expect(p[2]).toBeCloseTo(-2, 9)
  })

  it('r.thing: from high up pushed the way they walk, put down in front and thrown ahead the way they face', () => {
    // Pushed: a crate a child weighs enough for, walked into toward -z, for half a second once it moves.
    const pushed = withFloor(1, (r) => r.thing([-4, 0, -1.5], cube(0.8, 0.8, 0.8), { weight: 1 }))
    hold(pushed.room, 30, STICK(0, 1))
    const z0 = act(pushed.room, () => pushed.got.at())[2]
    hold(pushed.room, 30, STICK(0, 1))
    const moved = act(pushed.room, () => pushed.got.at())
    expect(Math.abs(z0 - moved[2] - FEEL.pushSpeed / 2)).toBeLessThan(0.05)
    expect(moved[0]).toBeCloseTo(-4, 6)

    // Pushed together: two children behind a crate of weight 2, their sticks 15 degrees apart, as two thumbs on touch pads are.
    const heavy = withFloor(2, (r) => r.thing([-3.25, 0, -1.5], cube(2.4, 0.8, 0.8), { weight: 2 }))
    const apart = (): Hold[] => [STICK(-0.1305, 0.9914), STICK(0.1305, 0.9914)]
    playRoom(heavy.room, 30, apart, () => NO_POINTING)
    const hz0 = act(heavy.room, () => heavy.got.at())[2]
    playRoom(heavy.room, 30, apart, () => NO_POINTING)
    const hz1 = act(heavy.room, () => heavy.got.at())
    expect(Math.abs(hz0 - hz1[2] - FEEL.pushSpeed / 2)).toBeLessThan(0.05)
    expect(hz1[0]).toBeCloseTo(-3.25, 6)
    // One of them alone weighs too little.
    const alone = withFloor(2, (r) => r.thing([-3.25, 0, -1.5], cube(2.4, 0.8, 0.8), { weight: 2 }))
    playRoom(alone.room, 120, () => [STICK(0, 1), STICK(0, 0)], () => NO_POINTING)
    expect(act(alone.room, () => alone.got.at())[2]).toBeCloseTo(-1.5, 6)

    // Put down in front, the way they last walked: toward -z.
    const carried = withFloor(1, (r) => r.thing([-3.2, 0, 0], cube(0.4, 0.4, 0.4)))
    const th = thingOf(carried.room, carried.got)
    playRoom(carried.room, 2, (f) => [GRAB(0, 0, f === 1)], () => NO_POINTING)
    expect(th.heldBy).toBe(0)
    hold(carried.room, 10, STICK(0, 1))
    hold(carried.room, 20, STICK(0, 0))
    const p = carried.room.world.players[0]
    playRoom(carried.room, 2, (f) => [GRAB(0, 0, f === 1)], () => NO_POINTING)
    playRoom(carried.room, 30, idle(carried.room), () => NO_POINTING)
    expect(th.heldBy).toBe(null)
    expect(th.at[0]).toBeCloseTo(p.at[0], 6)
    expect(th.at[2]).toBeCloseTo(p.at[2] - (FEEL.width / 2 + 0.05 + 0.2), 6)
    expect(th.at[1]).toBeCloseTo(0, 6)

    // Thrown while walking toward +z: it lands about FEEL.throwAhead ahead.
    const thrown = withFloor(1, (r) => r.thing([-3.2, 0, -3.5], cube(0.4, 0.4, 0.4)))
    const ball = thingOf(thrown.room, thrown.got)
    act(thrown.room, () => thrown.room.handles.of(thrown.room.world.players[0].id) as Player).putAt([-4, 0, -3.5])
    playRoom(thrown.room, 2, (f) => [GRAB(0, 0, f === 1)], () => NO_POINTING)
    hold(thrown.room, 20, STICK(0, -1))
    let z = 0
    let landed = Infinity
    for (let f = 0; f < 90; f++) {
      playRoom(thrown.room, 1, () => [GRAB(0, -1, f === 1)], () => NO_POINTING)
      if (f === 1) z = thrown.room.world.players[0].at[2]
      if (f > 1 && ball.on !== null && landed === Infinity) landed = ball.at[2]
    }
    expect(Math.abs(landed - z - FEEL.throwAhead)).toBeLessThan(0.3)
  })

  it('r.decor: from high up it stands anywhere on the floor, and players walk through it', () => {
    const { room } = withFloor(1, (r) => r.decor([-2, 0, 0], cube(1, 2, 1)))
    expect(room.world.decor[0].at).toEqual([-2, 0, 0])
    hold(room, 60, STICK(1, 0))
    expect(room.world.players[0].at[0]).toBeGreaterThan(-1)
  })

  it("r.controls: from high up every player starts with { stick: 'floor', a: 'jump', b: 'grab' }; 'walk' is the side's and 'floor' high up's", () => {
    const room = floorRoom(2, () => {})
    expect(room.world.players.map((p) => [p.stick, p.a, p.b])).toEqual([
      ['floor', 'jump', 'grab'],
      ['floor', 'jump', 'grab'],
    ])
    expect(buildSentence((r, w) => {
      plainFloor(r, w, NEVER)
      r.controls(w.players(), { stick: 'walk' })
    }, floorStart(1, 1, 9))).toBe(MISTAKES.notChoice('r.controls', 'stick', "'walk'", ['floor', 'fly', 'none']))
    expect(buildSentence((r, w) => {
      w.players()[0].putAt([0, 0, 0])
      r.wayOut([6, 0, 0])
      r.steps(NEVER)
      r.controls(w.players(), { stick: 'floor' })
    }, roomStart(1, 'together', 1, 9))).toBe(MISTAKES.notChoice('r.controls', 'stick', "'floor'", ['walk', 'fly', 'none']))
    expect(buildSentence((r, w) => {
      plainFloor(r, w, NEVER)
      r.controls(w.players(), { stick: 'fly' })
    }, floorStart(1, 1, 9))).toBe(MISTAKES.noJump('fly'))
  })

  it('tap and r.tap: from high up at is the point on what was tapped, and the highest handle there with a tap of its own takes it', () => {
    const taps: string[] = []
    const { room, got } = withFloor(1, (r) => {
      r.tap((at) => taps.push(`room ${at.join(' ')}`))
      const crate = r.thing([2, 0, -2], cube(0.8, 0.8, 0.8), { tap: (at) => taps.push(`crate ${at.join(' ')}`) })
      r.box([4, 0.5, 2], [2, 1, 2], { tap: () => taps.push('box') })
      const cloud = r.zone([4, 1.5, 2], [3, 3, 3], { tap: () => taps.push('zone') })
      return { crate, cloud }
    })
    const tapAt = (at: [number, number, number]) => playRoom(room, 1, idle(room), () => ({ taps: [{ at }], held: [] }))
    tapAt([2, 0.8, -2])
    tapAt([-2, 0, 3])
    // On the box's top, inside the zone too: the zone's top is higher.
    tapAt([4, 1, 2])
    act(room, () => got.cloud.hide())
    tapAt([4, 1, 2])
    expect(taps).toEqual(['crate 2 0.8 -2', 'room -2 0 3', 'zone', 'box'])
  })

  it('turn: from high up round y, counterclockwise as seen from above (+x turns toward -z)', () => {
    const { room, got } = withFloor(1, (r) => ({
      ramp: r.ramp([0, 0.5, -2], [3, 1, 2], 'right', { turn: Math.PI / 2 }),
      long: r.box([4, 0.5, 0], [4, 1, 1], { turn: Math.PI / 2 }),
    }))
    const ramp = room.sim.outlines[solidIndex(room, got.ramp)]
    // Turned a quarter, a ramp that rose toward +x rises toward -z, over its 3 m run along z.
    expect(ramp.ux).toBeCloseTo(0, 12)
    expect(ramp.uz).toBeCloseTo(-1, 12)
    expect([ramp.minY, ramp.maxY].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-3.5, -0.5])
    const long = room.sim.outlines[solidIndex(room, got.long)]
    expect([long.minX, long.maxX, long.minY, long.maxY].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([3.5, 4.5, -2, 2])
  })

  it('belt: from high up [vx, 0, vz] along the floor', () => {
    const { room, got } = withFloor(1, (r, w) => {
      const belt = r.box([-4, 0.1, 0], [3, 0.2, 3], { belt: [0, 2, 1.5] })
      w.players()[0].putAt([-4, 0.2, -1])
      return belt
    })
    expect(room.world.solids[solidIndex(room, got)].surface.belt).toEqual([0, 0, 1.5])
    hold(room, 60, STICK(0, 0))
    expect(room.world.players[0].at[2]).toBeCloseTo(-1 + 1.5, 2)
    expect(room.world.players[0].at[1]).toBeCloseTo(0.2, 9)
  })

  it('through: from high up jumped up through from below and stood on, and nothing drops through it', () => {
    const { room, got } = withFloor(1, (r, w) => {
      const plank = r.box([-4, 1.1, 0], [3, 0.2, 3], { through: true })
      w.players()[0].putAt([-4, 0, 0])
      return plank
    })
    hold(room, 60, { stick: [0, 0], a: true, b: false })
    const p = room.world.players[0]
    expect(p.on).toBe(room.handles.idOf(got))
    expect(p.at[1]).toBeCloseTo(1.2, 9)
    // The stick held down walks them toward +z, still on the plank.
    hold(room, 5, STICK(0, -1))
    expect(p.at[2]).toBeGreaterThan(0.1)
    expect(p.at[1]).toBeCloseTo(1.2, 9)
  })

  it('wind: from high up [ax, ay, az]', () => {
    const { room, got } = withFloor(1, (r) => r.zone([0, 1, 0], [14, 2, 8], { wind: [0, 0, 8] }))
    expect(room.world.zones[0].wind).toEqual([0, 0, 8])
    hold(room, 60, STICK(0, 0))
    expect(room.world.players[0].at[2]).toBeGreaterThan(2)
    expect(act(room, () => got.has(room.handles.of(room.world.players[0].id) as Player))).toBe(true)
  })

  it('gravity: from high up the stick still walks them across, and they float', () => {
    const { room } = withFloor(1, (r) => r.zone([0, 1.5, 0], [14, 3, 8], { gravity: -0.2 }))
    hold(room, 60, STICK(1, 0))
    const p = room.world.players[0]
    expect(p.at[1]).toBeGreaterThan(0.5)
    expect(p.at[0]).toBeGreaterThan(-4 + 2)
  })

  it("stick: 'floor' walks any way on the floor; 'fly' from high up keeps the height they are at, the world not pulling them", () => {
    const { room } = withFloor(1, (r, w) => {
      const p = w.players()[0]
      r.controls(w.players(), { stick: 'fly', a: 'grab', b: null })
      w.after(0.2, () => p.push([0, 6, 0]))
    })
    hold(room, 60, STICK(0, 0))
    const p = room.world.players[0]
    const high = p.at[1]
    expect(high).toBeGreaterThan(0.5)
    hold(room, 60, STICK(0, 1))
    expect(p.at[1]).toBeCloseTo(high, 1)
    expect(p.at[2]).toBeLessThan(-2)
  })

  it('w.pointers: from high up on what is under the finger, keeping its z', () => {
    const room = floorRoom(1, () => {})
    playRoom(room, 1, idle(room), () => ({ taps: [], held: [[1, 0.5, -2]] }))
    expect(room.world.pointers).toEqual([[1, 0.5, -2]])
  })

  it('turnTo: from high up round y', () => {
    const { room, got } = withFloor(1, (r, w) => {
      const bar = r.box([3, 0.5, -3], [4, 1, 0.5])
      w.after(0.1, () => bar.turnTo(Math.PI / 2, 0))
      return bar
    })
    playRoom(room, 10, idle(room), () => NO_POINTING)
    const o = room.sim.outlines[solidIndex(room, got)]
    expect([o.minX, o.maxX, o.minY, o.maxY].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([2.75, 3.25, -5, -1])
  })

  it('mover.slideBy and turnBy: from high up [dx, dy, dz], and round y', () => {
    const { room, got } = withFloor(1, (r) => {
      let part: Solid | null = null
      const mover: Mover = r.mover(
        () => (part = r.box([1, 0, 0], [0.5, 0.2, 0.5])),
        () => ({ at: [3, 2, -3] }),
      )
      return { mover, part: part as unknown as Solid }
    })
    act(room, () => got.mover.slideBy([0, 0, 2], 1))
    playRoom(room, 61, idle(room), () => NO_POINTING)
    expect(act(room, () => got.mover.at())).toEqual([3, 2, -1])
    act(room, () => got.mover.turnBy(Math.PI / 2, 0))
    playRoom(room, 1, idle(room), () => NO_POINTING)
    const p = act(room, () => got.part.at())
    expect([p[0], p[1], p[2]].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([3, 2, -2])
  })

  it('thing.push and p.push: from high up [vx, vy, vz]', () => {
    const { room, got } = withFloor(1, (r) => r.thing([2, 0, 0], cube(0.4, 0.4, 0.4)))
    const p = room.handles.of(room.world.players[0].id) as Player
    act(room, () => got.push([0, 0, 3]))
    act(room, () => p.push([0, 0, 5]))
    expect(thingOf(room, got).velocity[2]).toBe(3)
    expect(room.world.players[0].velocity[2]).toBe(5)
    playRoom(room, 1, idle(room), () => NO_POINTING)
    expect(thingOf(room, got).at[2]).toBeGreaterThan(0)
    expect(room.world.players[0].at[2]).toBeGreaterThan(0)
  })

  it('p.facing: from high up the way the stick last walked them, [x, 0, z], one metre long', () => {
    const room = floorRoom(1, () => {})
    const p = room.handles.of(room.world.players[0].id) as Player
    expect(act(room, () => p.facing())).toEqual([1, 0, 0])
    hold(room, 5, STICK(0, 1))
    expect(act(room, () => p.facing())).toEqual([0, 0, -1])
    hold(room, 5, STICK(-0.6, -0.6))
    hold(room, 5, STICK(0, 0))
    const f = act(room, () => p.facing())
    expect(f[0]).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(f[2]).toBeCloseTo(Math.SQRT1_2, 12)
  })
})

describe('the engine from high up (ROOM_PREAMBLE)', () => {
  it('r.wayOut: from high up the door stands in the wall nearest its foot, moved there with a note, the whole door in the wall', () => {
    const door = (at: Point) => testRoom(bare(at), floorStart(1, 1, 9))
    const bare = (at: Point) => (r: Builder, w: World) => {
      w.players()[0].putAt([0, 0, 0])
      r.wayOut(at)
      r.steps(NEVER)
    }
    const cases: [Point, Point][] = [
      // Nearest the back wall; nearest the right wall, onto the house's floor there (nothing stands under it at the wall); in the corners, the door kept half its width off them, in the back wall and in the left wall.
      [[3, 0, -1], [3, 0, -4]],
      [[6.5, 1, 2], [7, 0, 2]],
      [[-6.5, 0, -3.95], [-6.4, 0, -4]],
      [[-6.9, 0, 3.9], [-7, 0, 3.4]],
    ]
    for (const [at, to] of cases) {
      const room = door(at)
      expect(room.world.wayOut.at, at.join(' ')).toEqual(to)
      expect(room.survey.notes).toEqual([SURVEY_NOTES.wayOutMoved(at, to)])
      expect(room.survey.wayOut).toEqual(to)
    }
    expect(door([2, 0, -4]).survey.notes).toEqual([])
    // On a raised floor that runs to the wall, the door stands on it there.
    const raised = testRoom((r, w) => {
      r.box([5.5, 0.5, 2], [3, 1, 2], { name: 'stage' })
      w.players()[0].putAt([0, 0, 0])
      r.wayOut([6, 1, 2])
      r.steps(NEVER)
    }, floorStart(1, 1, 9))
    expect([raised.world.wayOut.at, raised.survey.notes]).toEqual([[7, 1, 2], [SURVEY_NOTES.wayOutMoved([6, 1, 2], [7, 1, 2])]])
    expect(SURVEY_NOTES.wayOutMoved([3, 0, -1], [3, 0, -4])).toBe('r.wayOut was given 3, 0, -1; seen from high up a door stands in a wall, so its foot was moved to the wall nearest it, onto the floor there, at 3, 0, -4')
  })

  it('SPACE: every body keeps the z it is given', () => {
    const { room } = withFloor(1, (r) => {
      r.box([3, 0.25, -3], [1, 0.5, 1])
      r.thing([2, 0, 2], cube(0.4, 0.4, 0.4))
      r.zone([-3, 1, -3], [1, 1, 1])
    })
    expect(room.world.solids[0].at).toEqual([3, 0.25, -3])
    expect(room.world.things[0].at).toEqual([2, 0, 2])
    expect(room.world.zones[0].at).toEqual([-3, 1, -3])
    expect(room.world.wayOut.at).toEqual([6, 0, -4])
    expect(room.survey.notes).toEqual([])
  })

  it("nobody falls out: the house's floor holds them; a player put below it comes back onto the last floor they stood on, and a thing that leaves the box along z comes home", () => {
    const room = testRoom((r, w) => {
      const p = w.players()[0]
      p.putAt([0, 0, -2])
      r.wayOut([6, 0, -4])
      r.steps(NEVER)
      const ball = r.thing([3, 0, 3], cube(0.4, 0.4, 0.4))
      w.after(0.1, () => ball.push([0, 0, 40]))
      w.after(1, () => p.putAt([0, -2, -2]))
    }, floorStart(1, 1, 9))
    let back = false
    for (let f = 0; f < 120; f++) {
      hold(room, 1, STICK(0, f < 30 ? 1 : 0))
      if (room.world.players[0].back !== null) back = true
    }
    const p = room.world.players[0]
    expect(back).toBe(true)
    // Back where they last stood: on the house's floor, against the back wall the stick walked them to.
    expect(p.on).toBe(houseFloor(room.world).id)
    expect(p.at[1]).toBeCloseTo(0, 9)
    expect(p.at[2]).toBeCloseTo(-ROOM.high.depth / 2 + FEEL.width / 2, 9)
    expect(room.world.things[0].at).toEqual([3, 0, 3])
  })

  it("the camera: HIGH_FRAME, the floor with the house's walls and lip round it, never moving; the room's box holds the players in", () => {
    const room = floorRoom(1, () => {})
    expect(HIGH_FRAME).toEqual({ x: 0, z: 0, width: ROOM.high.width + 2 * ROOM.wall, depth: ROOM.high.depth + 2 * ROOM.wall })
    expect(room.world.floorFrame).toEqual(HIGH_FRAME)
    expect(room.world.camera).toEqual({ x: 0, y: ROOM.high.height / 2, width: HIGH_FRAME.width, height: ROOM.high.height })
    hold(room, 300, STICK(1, -1))
    expect(room.world.players[0].at[0]).toBeCloseTo(ROOM.high.width / 2 - FEEL.width / 2, 9)
    expect(room.world.players[0].at[2]).toBeCloseTo(ROOM.high.depth / 2 - FEEL.width / 2, 9)
    expect(room.world.floorFrame).toEqual(HIGH_FRAME)
  })

  it('zones notice who comes in along z, and touch and land fire from high up', () => {
    const seen: string[] = []
    const { room } = withFloor(1, (r) => {
      r.zone([-4, 1, -3], [2, 2, 2], { enter: () => seen.push('enter'), leave: () => seen.push('leave') })
      r.box([-4, 0.25, 3], [2, 0.5, 2], { touch: () => seen.push('touch'), land: () => seen.push('land') })
    })
    hold(room, 60, STICK(0, 1))
    hold(room, 60, STICK(0, -1))
    hold(room, 60, { stick: [0, -1], a: true, b: false })
    expect(seen).toEqual(['enter', 'leave', 'touch', 'land'])
  })

  it('a mover that moves into a player pushes them out of it, never inside', () => {
    const { room, got } = withFloor(1, (r) => r.mover(() => r.box([0, 0, 0], [3, 2, 1]), () => ({ at: [-4, 1, -3] })))
    act(room, () => got.slideBy([0, 0, 5], 2))
    for (let f = 0; f < 150; f++) {
      playRoom(room, 1, idle(room), () => NO_POINTING)
      const p = room.world.players[0]
      expect(solidInPlayerFloor(room.sim, p.at[0], p.at[1], p.at[2], FEEL.width, FEEL.height)).toBe(-1)
    }
  })

  it('p.bonk hops them back from the way they face; use(p) answers grab within reach on the floor', () => {
    const used: string[] = []
    const { room } = withFloor(1, (r) => {
      r.box([-4, 0.5, -1.5], [1, 1, 1], { use: () => used.push('near') })
      r.box([0, 0.5, -1.5], [1, 1, 1], { use: () => used.push('far') })
    })
    const p = room.handles.of(room.world.players[0].id) as Player
    hold(room, 5, STICK(0, 1))
    hold(room, 30, STICK(0, 0))
    act(room, () => p.bonk())
    // Facing -z, the hop goes toward +z and up.
    expect(room.world.players[0].velocity[2]).toBeGreaterThan(2)
    expect(room.world.players[0].velocity[1]).toBeGreaterThan(3)
    expect(room.world.players[0].velocity[0]).toBeCloseTo(0, 12)
    hold(room, 120, STICK(0, 0))
    // The near box is 0.5 m from their front once back by it, the far one 4 m away along x.
    act(room, () => p.putAt([-4, 0, -0.45]))
    playRoom(room, 2, (f) => [GRAB(0, 0, f === 1)], () => NO_POINTING)
    act(room, () => p.putAt([-4, 0, 0.4]))
    playRoom(room, 2, (f) => [GRAB(0, 0, f === 1)], () => NO_POINTING)
    expect(used).toEqual(['near'])
  })

  it('a mover turning round y carries who stands on it round with it, and what they carry', () => {
    const { room, got } = withFloor(1, (r, w) => {
      const disc = r.mover(() => r.box([0, 0.15, 0], [6, 0.3, 1.2]), () => ({ at: [0, 0, 0] }))
      r.thing([2.6, 0.3, 0], cube(0.4, 0.4, 0.4))
      w.players()[0].putAt([2, 0.3, 0])
      return disc
    })
    expect(room.world.players[0].on).toBe(room.world.solids[0].id)
    act(room, () => got.turnBy(Math.PI / 2, 1))
    playRoom(room, 70, idle(room), () => NO_POINTING)
    // A quarter turn round y takes them from 2 m along +x of its middle to 2 m toward -z, and the thing beside them with them.
    const [x, y, z] = room.world.players[0].at
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0.3, 6)
    expect(z).toBeCloseTo(-2, 6)
    const th = room.world.things[0]
    expect(th.at[0] + (th.box.min[0] + th.box.max[0]) / 2).toBeCloseTo(0, 6)
    expect(th.at[2]).toBeCloseTo(-2.6, 6)
  })

  it('plays the same every time: two runs of a minute of random pressing end in the same world', () => {
    const run = () => {
      const room = testRoom((r, w) => {
        plainFloor(r, w, NEVER)
        r.ramp([3, 0.5, -2.4], [3, 1, 2], 'back', { turn: 0.4 })
        r.box([-3, 0.4, 2.4], [2, 0.8, 2], { turn: -0.7, ice: true })
        r.ball([5, 1, 2], 1)
        r.mover(() => r.box([0, 0, 0], [2, 0.3, 2]), (t) => ({ at: [0, 1 + Math.sin(t), -2], turn: t * 0.3 }))
        for (let i = 0; i < 6; i++) r.thing([-6 + i * 2, 0, i % 2 === 0 ? -2 : 2], cube(0.5, 0.5, 0.5), { round: i === 2, weight: i === 4 ? 1 : 0.3 })
        r.zone([0, 1, 2.5], [4, 2, 3], { wind: [2, 0, -3] })
      }, floorStart(3, 2, 11))
      playRoom(room, 3600, randomHolds(5, 3), () => NO_POINTING)
      return JSON.stringify(room.world)
    }
    expect(run()).toBe(run())
  })
})
