import { describe, expect, it } from 'vitest'
import { FEEL, FRAME_ORDER, REFEREE, ROOM } from './api'
import { overlaps } from './geometry'
import {
  addThing,
  addZone,
  attach,
  give,
  putAt,
  zoneWeight,
  bonk,
  changePlayer,
  finish,
  hide,
  moverMoving,
  moverSlideBy,
  moverSpeed,
  putPlayer,
  setClock,
  setSteps,
  show,
  slideTo,
  step,
  addScore,
  type Hooks,
} from './sim'
import { SIDE_FRAME } from './camera'
import { NO_LISTENS, playerHeight, type Listens, type Sim } from './state'
import { IDLE, boxModel, busyRoom, crate, finishBuild, frameOf, onFloor, platform, play, randomHolds, slab, solid, testSim, type Hold } from './testing'
import { STILL_PAD, type Pad } from '../seats/types'

const RIGHT: Hold = { stick: [1, 0], a: false, b: false }
const LEFT: Hold = { stick: [-1, 0], a: false, b: false }
const listen = (l: Partial<Listens>): Listens => ({ ...NO_LISTENS, ...l })
const p0 = (sim: Sim) => sim.world.players[0]

/** Whether a player overlaps any shown solid that is not a through-floor. */
function insideSolid(sim: Sim, seat: number): boolean {
  const p = sim.world.players[seat]
  const hw = (FEEL.width * p.size) / 2
  return sim.world.solids.some((s, i) => !s.hidden && !s.surface.through && overlaps(sim.outlines[i], p.at[0] - hw, p.at[1] + 0.01, p.at[0] + hw, p.at[1] + playerHeight(p)))
}

describe('movers', () => {
  it('carry whoever stands on them, across and up', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    platform(sim, rec, (t) => ({ at: [-4 + t, 2 + 0.5 * t, 0], turn: 0 }), [3, 0.5, 2], {}, NO_LISTENS)
    putPlayer(sim, 0, [-4, 2.25, 0])
    finishBuild(sim)
    play(sim, 120, () => [IDLE])
    expect(p0(sim).at[0]).toBeCloseTo(-2, 2)
    expect(p0(sim).at[1]).toBeCloseTo(2.25 + 1, 2)
  })

  it('carry whoever stands on a turning one round with it', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    const { solid } = platform(sim, rec, (t) => ({ at: [0, 3, 0], turn: Math.min(t, 1) * 0.3 }), [6, 0.3, 2], {}, NO_LISTENS)
    putPlayer(sim, 0, [1, 3.15, 0])
    finishBuild(sim)
    play(sim, 90, () => [IDLE])
    // A turn of 0.3 rad lifts a point 1 m from the middle by about sin(0.3) m, and they still stand on it.
    expect(p0(sim).at[1]).toBeGreaterThan(3.15 + 0.2)
    expect(p0(sim).on).toBe(solid)
  })

  it('push whoever they move into', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const { solid } = platform(sim, rec, (t) => ({ at: [-4 + 2 * t, 1, 0], turn: 0 }), [1, 2, 2], {}, NO_LISTENS)
    finishBuild(sim)
    play(sim, 180, () => [IDLE])
    const o = sim.outlines[sim.where[solid].i]
    expect(p0(sim).at[0]).toBeGreaterThanOrEqual(o.maxX + FEEL.width / 2 - 0.01)
    expect(insideSolid(sim, 0)).toBe(false)
  })

  it('let someone squeezed against a wall slip through, put beside the mover', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [2.4])
    slab(sim, 3, 0, 4, 4, {}, NO_LISTENS)
    platform(sim, rec, (t) => ({ at: [Math.min(2.5, -4 + 2 * t), 1.5, 0], turn: 0 }), [1, 3, 2], {}, NO_LISTENS)
    finishBuild(sim)
    let insideFrames = 0
    for (let f = 0; f < 300; f++) {
      play(sim, 1, () => [IDLE])
      if (insideSolid(sim, 0)) insideFrames += 1
    }
    expect(insideFrames).toBe(0)
    const p = p0(sim)
    expect(p.at[0] < 2 || p.at[1] >= 3 - 0.01).toBe(true)
  })

  it('run their clock at their speed, and slide by an offset with an ease', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const seen: number[] = []
    const { mover } = platform(sim, rec, (t) => (seen.push(t), { at: [t, 6, 0], turn: 0 }), [1, 0.3, 2], {}, NO_LISTENS)
    finishBuild(sim)
    play(sim, 60, () => [IDLE])
    const m = sim.world.movers[0]
    expect(m.clock).toBeCloseTo(1, 9)
    moverSpeed(sim, mover, 0)
    play(sim, 30, () => [IDLE])
    expect(m.clock).toBeCloseTo(1, 9)
    moverSpeed(sim, mover, -1)
    play(sim, 30, () => [IDLE])
    expect(m.clock).toBeCloseTo(0.5, 9)
    moverSpeed(sim, mover, 0)
    moverSlideBy(sim, mover, [0, 2, 0], 1)
    play(sim, 30, () => [IDLE])
    expect(moverMoving(sim, mover)).toBe(true)
    expect(m.at[1]).toBeCloseTo(7, 6)
    play(sim, 30, () => [IDLE])
    expect(moverMoving(sim, mover)).toBe(false)
    expect(m.at[1]).toBeCloseTo(8, 9)
    expect(seen[0]).toBe(0)
  })
})

describe('surfaces', () => {
  it('a through-floor is jumped up through, stood on, and dropped through with the stick down', () => {
    const { sim } = testSim(1, 'together', 1)
    const floor = onFloor(sim, [0])
    const shelf = slab(sim, -2, 1.1, 2, 1.3, { through: true }, NO_LISTENS)
    finishBuild(sim)
    play(sim, 60, (f) => [{ stick: [0, 0], a: f < 40, b: false }])
    expect(p0(sim).on).toBe(shelf)
    expect(p0(sim).at[1]).toBeCloseTo(1.3, 6)
    play(sim, 60, () => [{ stick: [0, -1], a: false, b: false }])
    expect(p0(sim).on).toBe(floor)
  })

  it('ice lets a player slide on after they let go', () => {
    const slide = (ice: boolean) => {
      const { sim } = testSim(1, 'together', 1)
      slab(sim, -8, -1, 8, 0, { ice }, NO_LISTENS)
      putPlayer(sim, 0, [-7, 0, 0])
      finishBuild(sim)
      play(sim, 60, () => [RIGHT])
      const x = p0(sim).at[0]
      play(sim, 120, () => [IDLE])
      return p0(sim).at[0] - x
    }
    expect(slide(false)).toBeLessThan(0.3)
    expect(slide(true)).toBeGreaterThan(1.5)
  })

  it('bounce throws whoever lands on it that high above its top', () => {
    const { sim } = testSim(1, 'together', 1)
    slab(sim, -8, -1, 8, 0, { bounce: 3 }, NO_LISTENS)
    putPlayer(sim, 0, [0, 0, 0])
    finishBuild(sim)
    p0(sim).at = [0, 2, 0]
    p0(sim).on = null
    play(sim, 30, () => [IDLE])
    let top = 0
    for (let f = 0; f < 60; f++) {
      play(sim, 1, () => [IDLE])
      top = Math.max(top, p0(sim).at[1])
    }
    expect(Math.abs(top - 3)).toBeLessThan(0.05)
  })

  it('a belt carries whoever stands on it at its speed', () => {
    const { sim } = testSim(1, 'together', 1)
    slab(sim, -8, -1, 8, 0, { belt: [2, 0, 0] }, NO_LISTENS)
    putPlayer(sim, 0, [0, 0, 0])
    finishBuild(sim)
    play(sim, 60, () => [IDLE])
    expect(p0(sim).at[0]).toBeCloseTo(2, 6)
  })
})

describe('zones', () => {
  const zone = (sim: Sim, at: [number, number, number], size: [number, number, number], over: Partial<{ wind: [number, number, number]; pull: number; gravity: number; drag: number }>, l: Listens) =>
    addZone(sim, { at, size, color: null, wind: [0, 0, 0], pull: 0, gravity: 1, drag: 0, mover: null, name: null, hidden: false, ...over }, l)

  it('notice who comes in, stays and leaves, a carried thing where the hands are', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-4])
    const z = zone(sim, [0, 1, 0], [2, 2, 2], {}, listen({ enter: true, leave: true }))
    const box = crate(sim, [-4.6, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    expect(p0(sim).holding).toBe(box)
    play(sim, 150, () => [RIGHT])
    const calls = rec.calls.filter((c) => c.startsWith('enter') || c.startsWith('leave'))
    // The thing over the head is where the hands are: it comes and goes with its carrier.
    expect(calls).toEqual([`enter ${z} 0`, `enter ${z} ${box}`, `leave ${z} 0`, `leave ${z} ${box}`])
  })

  it('wind pushes, no gravity floats, wind upward lifts, pull draws in and drag slows', () => {
    const { sim } = testSim(2, 'together', 1)
    onFloor(sim, [-7, 7])
    const light = crate(sim, [-4, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    const pulled = crate(sim, [2, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    zone(sim, [-4, 1, 0], [3, 2, 2], { wind: [8, 0, 0] }, NO_LISTENS)
    zone(sim, [-7, 2, 0], [2, 6, 2], { gravity: 0 }, NO_LISTENS)
    zone(sim, [7, 3, 0], [2, 6, 2], { wind: [0, FEEL.gravity + 6, 0] }, NO_LISTENS)
    zone(sim, [3, 1, 0], [4, 2, 2], { pull: 20 }, NO_LISTENS)
    finishBuild(sim)
    play(sim, 60, () => [{ stick: [0, 1], a: false, b: false }, IDLE])
    const [a, b] = sim.world.players
    expect(sim.world.things[sim.where[light].i].at[0]).toBeGreaterThan(-3.6)
    expect(a.at[1]).toBeGreaterThan(1)
    expect(b.at[1]).toBeGreaterThan(1)
    expect(sim.world.things[sim.where[pulled].i].at[0]).toBeGreaterThan(2.3)

    const fall = (drag: number) => {
      const one = testSim(1, 'together', 1).sim
      onFloor(one, [0])
      zone(one, [0, 4, 0], [4, 8, 2], { drag }, NO_LISTENS)
      finishBuild(one)
      p0(one).at = [0, 6, 0]
      p0(one).on = null
      play(one, 30, () => [IDLE])
      return 6 - p0(one).at[1]
    }
    expect(fall(1)).toBeLessThan(fall(0) / 2)
  })
})

describe('carrying, throwing and pushing', () => {
  it('grab picks up a light thing over the head, puts it down in front, and uses what has use', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const light = crate(sim, [0.7, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    const heavy = crate(sim, [-0.9, 0, 0], 0.6, 0.6, 1, NO_LISTENS)
    finishBuild(sim)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    const th = sim.world.things[sim.where[light].i]
    expect(th.heldBy).toBe(0)
    expect(th.at[1]).toBeCloseTo(FEEL.height + 0.02, 6)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    expect(th.heldBy).toBe(null)
    play(sim, 30, () => [IDLE])
    expect(th.at[0]).toBeGreaterThan(0.25)
    expect(th.at[1]).toBeCloseTo(0, 6)
    // A thing with use is used, never carried.
    sim.listens[light] = listen({ use: true })
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    expect(rec.calls).toContain(`use ${light} 0`)
    expect(th.heldBy).toBe(null)
    // A thing heavier than FEEL.carryMax is not picked up.
    hide(sim, light)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    expect(sim.world.things[sim.where[heavy].i].heldBy).toBe(null)
    expect(p0(sim).holding).toBe(null)
  })

  it(`a throw while walking lands about ${FEEL.throwAhead} m ahead`, () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    const ball = crate(sim, [-6.4, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    play(sim, 20, () => [RIGHT])
    let x0 = 0
    let landed = Infinity
    for (let f = 0; f < 90; f++) {
      play(sim, 1, () => [{ stick: [1, 0], a: false, b: f === 1 }])
      const th = sim.world.things[sim.where[ball].i]
      if (f === 1) x0 = p0(sim).at[0]
      if (f > 1 && th.on !== null && landed === Infinity) landed = th.at[0]
    }
    expect(Math.abs(landed - x0 - FEEL.throwAhead)).toBeLessThan(0.3)
  })

  it(`pushing moves a thing at ${FEEL.pushSpeed} m/s when the pushers weigh enough together`, () => {
    const push = (weight: number, pushers: 1 | 2) => {
      const { sim } = testSim(pushers, 'together', 1)
      onFloor(sim, pushers === 1 ? [-3] : [-3, -3.2])
      const id = crate(sim, [-2, 0, 0], 0.8, 0.8, weight, NO_LISTENS)
      finishBuild(sim)
      play(sim, 60, () => (pushers === 1 ? [RIGHT] : [RIGHT, RIGHT]))
      const th = sim.world.things[sim.where[id].i]
      const x = th.at[0]
      play(sim, 60, () => (pushers === 1 ? [RIGHT] : [RIGHT, RIGHT]))
      return th.at[0] - x
    }
    expect(Math.abs(push(0.3, 1) - FEEL.pushSpeed)).toBeLessThan(0.1)
    expect(push(1.5, 1)).toBeCloseTo(0, 6)
    expect(Math.abs(push(1.5, 2) - FEEL.pushSpeed)).toBeLessThan(0.1)
  })

  it('takes room: a player walking into a thing that does not move stops beside it, never standing where it lies', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [-3])
    const id = crate(sim, [-2, 0, 0], 0.8, 0.8, 1.5, NO_LISTENS)
    finishBuild(sim)
    play(sim, 120, () => [RIGHT])
    const th = sim.world.things[sim.where[id].i]
    const p = sim.world.players[0]
    expect(p.at[0] + FEEL.width / 2).toBeLessThanOrEqual(th.at[0] + th.box.min[0] + 1e-3)
  })
})

describe('loose things', () => {
  it('fall and rest on what is under them, stack a little, and ride a mover', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    const low = crate(sim, [0, 2, 0], 0.6, 0.6, 0.3, NO_LISTENS)
    const high = crate(sim, [0.1, 4, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    const { solid } = platform(sim, rec, (t) => ({ at: [5 + t, 2, 0], turn: 0 }), [2, 0.2, 2], {}, NO_LISTENS)
    const rider = crate(sim, [5, 2.1, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    play(sim, 120, () => [IDLE])
    const [a, b, c] = [low, high, rider].map((id) => sim.world.things[sim.where[id].i])
    expect(a.at[1]).toBeCloseTo(0, 6)
    expect(b.on).toBe(low)
    expect(b.at[1]).toBeCloseTo(0.6, 6)
    expect(c.on).toBe(solid)
    expect(c.at[0]).toBeCloseTo(5 + 2, 1)
  })

  it('slide by the engine through everything and are loose again at the end', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    slab(sim, 1, 0, 1.5, 3, {}, NO_LISTENS)
    const id = crate(sim, [0, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    slideTo(sim, id, [3, 2, 0], 1)
    play(sim, 30, () => [IDLE])
    const th = sim.world.things[sim.where[id].i]
    expect(th.at[0]).toBeCloseTo(1.5, 6)
    play(sim, 30, () => [IDLE])
    expect(th.slide).toBe(null)
    play(sim, 60, () => [IDLE])
    expect(th.at[0]).toBeCloseTo(3, 6)
    expect(th.at[1]).toBeCloseTo(0, 6)
  })

  it('a round thing rolls down a gentle slope, a box rests on it, and neither turns over', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    solid(sim, [0, 0.5, 0], { kind: 'ramp', size: [6, 1, 2], rises: 'left' }, {}, 0, NO_LISTENS)
    const ball = crate(sim, [-1.5, 1, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    sim.world.things[sim.where[ball].i].round = true
    const box = crate(sim, [-2.5, 1, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    play(sim, 120, () => [IDLE])
    const [r, b] = [ball, box].map((id) => sim.world.things[sim.where[id].i])
    expect(r.at[0]).toBeGreaterThan(-0.5)
    expect(r.roll).toBeLessThan(-1)
    expect(b.at[0]).toBeCloseTo(-2.5, 1)
  })
})

describe('the referee', () => {
  it('brings a player who falls out of the room back onto the last floor, and a thing home (the backstop: in a room the house holds everyone in)', () => {
    const { sim } = testSim(1, 'together', 1)
    const floor = slab(sim, -8, 4, 2, 5, {}, NO_LISTENS)
    putPlayer(sim, 0, [0, 5, 0])
    const box = crate(sim, [1.5, 5, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    finishBuild(sim)
    const p = p0(sim)
    const th = sim.world.things[sim.where[box].i]
    let wentHome = false
    let cameBack = false
    for (let f = 0; f < 400 && !cameBack; f++) {
      play(sim, 1, () => [RIGHT])
      if (th.at[0] === th.home[0] && th.at[1] === th.home[1]) wentHome = true
      cameBack = p.back !== null
    }
    expect(wentHome).toBe(true)
    expect(cameBack).toBe(true)
    play(sim, 60, () => [IDLE])
    expect(p.on).toBe(floor)
    expect(p.at[1]).toBeCloseTo(5, 6)
  })

  it('keeps nobody still for more than REFEREE.freeAfter at a time (the freedom rule)', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    rec.frames.push(() => putPlayer(sim, 0, [-7, 0, 0]))
    finishBuild(sim)
    let run = 0
    let longest = 0
    let moved = 0
    for (let f = 0; f < 600; f++) {
      const x = p0(sim).at[0]
      play(sim, 1, () => [RIGHT])
      if (p0(sim).putFrame === sim.world.frame) run += 1
      else run = 0
      longest = Math.max(longest, run)
      if (p0(sim).at[0] > x + 0.03) moved += 1
    }
    expect(longest).toBeLessThanOrEqual(REFEREE.freeAfter * 60)
    expect(moved).toBeGreaterThan(200)

    const two = testSim(1, 'together', 1).sim
    onFloor(two, [0])
    finishBuild(two)
    play(two, 5, () => [IDLE])
    bonk(two, 0)
    const until = p0(two).bonkedUntil
    play(two, 30, () => [IDLE])
    bonk(two, 0)
    expect(p0(two).bonkedUntil).toBe(until)
    play(two, 120, () => [IDLE])
    bonk(two, 0)
    expect(p0(two).bonkedUntil).toBeGreaterThan(until)
  })

  it('caps a change at REFEREE.changeSecs, and grows a player only where there is room', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    slab(sim, -1, 1.6, 1, 2, {}, NO_LISTENS)
    finishBuild(sim)
    changePlayer(sim, 0, { speed: 1, jump: 1, size: 2, weight: 1 }, 60)
    expect(p0(sim).change?.until).toBeCloseTo(REFEREE.changeSecs, 9)
    play(sim, 10, () => [IDLE])
    expect(p0(sim).size).toBeLessThan(1.6 / FEEL.height)
    expect(insideSolid(sim, 0)).toBe(false)
    play(sim, 60, () => [RIGHT])
    expect(p0(sim).size).toBe(2)
  })

  it("shows SIDE_FRAME, never moving, and holds every player inside the room's box", () => {
    const { sim } = testSim(2, 'together', 1)
    onFloor(sim, [-1, 1])
    finishBuild(sim)
    expect(sim.world.camera).toEqual(SIDE_FRAME)
    expect(SIDE_FRAME).toEqual({ x: 0, y: (ROOM.side.height + ROOM.beam - ROOM.lip) / 2, width: ROOM.side.width + 2 * ROOM.wall, height: ROOM.side.height + ROOM.beam + ROOM.lip })
    expect(sim.world.floorFrame).toBeNull()
    for (let f = 0; f < 300; f++) {
      play(sim, 1, () => [LEFT, { ...RIGHT, a: f % 50 < 30 }])
      expect(sim.world.camera).toEqual(SIDE_FRAME)
    }
    const [a, b] = sim.world.players
    expect(a.at[0]).toBeCloseTo(sim.world.bounds.min[0] + FEEL.width / 2, 9)
    expect(b.at[0]).toBeCloseTo(sim.world.bounds.max[0] - FEEL.width / 2, 9)
  })
})

describe('hooks', () => {
  it('touch once each time they meet, land when they come onto a top', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-3])
    const block = slab(sim, 0, 0, 1, 0.8, {}, listen({ touch: true, land: true }))
    finishBuild(sim)
    play(sim, 60, () => [RIGHT])
    play(sim, 30, () => [LEFT])
    play(sim, 60, () => [RIGHT])
    expect(rec.calls.filter((c) => c === `touch ${block} 0`).length).toBe(2)
    play(sim, 80, (f) => [{ stick: [f < 40 ? 0.5 : 0, 0], a: f < 30, b: false }])
    expect(rec.calls.filter((c) => c === `land ${block} 0`).length).toBe(1)
  })

  it("give a tap to the handle under it with a tap of its own, else to the room's", () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-5])
    const block = slab(sim, 0, 0, 1, 1, {}, listen({ tap: true }))
    finishBuild(sim)
    step(sim, { pads: [STILL_PAD], pointing: { taps: [{ at: [0.5, 0.5, 0] }, { at: [5, 5, 0] }], held: [[2, 2, 0]] }, help: false })
    expect(rec.calls).toEqual([`tap ${block} 0.50 0.50`, 'tap null 5.00 5.00'])
    expect(sim.world.pointers).toEqual([[2, 2, 0]])
  })

  it('run a room button press, hold and release, and buttons a before b', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const p = p0(sim)
    p.a = { word: { en: 'ring', fi: 'soita' }, icon: 0 }
    p.b = { word: { en: 'wave', fi: 'vilkuta' }, icon: 0 }
    finishBuild(sim)
    const pad = (a: { held: boolean; pressed: boolean }, b: { held: boolean; pressed: boolean }): Pad => ({ stick: [0, 0], a, b })
    step(sim, frameOf([pad({ held: true, pressed: true }, { held: false, pressed: true })]))
    step(sim, frameOf([pad({ held: true, pressed: false }, { held: false, pressed: false })]))
    step(sim, frameOf([pad({ held: false, pressed: false }, { held: false, pressed: false })]))
    expect(rec.calls).toEqual(['button 0 a press', 'button 0 a hold', 'button 0 b press', 'button 0 b release', 'button 0 a hold', 'button 0 a release'])
  })

  it('follow FRAME_ORDER within a frame', () => {
    const { sim } = busyRoom()
    const phases: string[] = []
    const base = sim.hooks
    const note = (phase: string) => {
      if (phases[phases.length - 1] !== phase) phases.push(phase)
    }
    const hooks: Hooks = {
      button: () => note('buttons'),
      tap: () => note('taps'),
      place: (m, t) => (note('movers'), base.place(m, t)),
      use: () => note('players'),
      touch: () => note('contacts'),
      land: () => note('contacts'),
      zone: () => note('zones'),
      timers: () => note('timers'),
      frame: () => note('frame'),
      done: () => (note('steps'), false),
    }
    sim.hooks = hooks
    const p = p0(sim)
    p.a = { word: { en: 'ring', fi: 'soita' }, icon: 0 }
    sim.listens[sim.world.things[0].id] = listen({ use: true })
    const holds = randomHolds(3, 4)
    for (let f = 0; f < 120; f++) {
      phases.length = 0
      const h = holds(f)
      step(sim, {
        pads: h.map((x, i) => ({ stick: x.stick, a: { held: x.a, pressed: x.a && f % 7 === i }, b: { held: x.b, pressed: x.b && f % 5 === i } })),
        pointing: { taps: f % 9 === 0 ? [{ at: [0, 1, 0] }] : [], held: [] },
        help: false,
      })
      const order = phases.map((ph) => FRAME_ORDER.indexOf(ph as (typeof FRAME_ORDER)[number]))
      expect([...order].sort((a, b) => a - b)).toEqual(order)
    }
  })
})

describe('steps and the end', () => {
  it('asks only the next step, one a frame, and ends at the end of the frame w.finish is called in', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    let asked: number[] = []
    rec.dones.push(() => (asked.push(0), sim.world.frame >= 3), () => (asked.push(1), true))
    setSteps(sim, [
      { hint: { en: 'one', fi: 'yksi' }, at: [0, 0, 0] },
      { hint: { en: 'two', fi: 'kaksi' }, at: 0 },
    ])
    rec.frames.push(() => {
      if (sim.world.next === 1 && sim.world.frame === 4) finish(sim, null)
    })
    finishBuild(sim)
    play(sim, 3, () => [IDLE])
    expect(asked).toEqual([0, 0, 0])
    expect(sim.world.steps[0].doneAt).toBeCloseTo(3 / 60, 9)
    asked = []
    play(sim, 1, () => [IDLE])
    expect(asked).toEqual([1])
    expect(sim.world.end).toEqual({ at: 4 / 60, by: 'finish', order: null })
    expect(sim.world.wayOut.open).toBe(true)
    finish(sim, [0])
    play(sim, 2, () => [IDLE])
    expect(sim.world.end?.at).toBeCloseTo(4 / 60, 9)
  })

  it("ends a contest by its clock, the order by score", () => {
    const { sim } = testSim(3, 'contest', 1)
    onFloor(sim, [-2, 0, 2])
    setClock(sim, 1)
    finishBuild(sim)
    addScore(sim, 1, 5)
    addScore(sim, 2, 3)
    play(sim, 60, () => [IDLE, IDLE, IDLE])
    expect(sim.world.end).toEqual({ at: 1, by: 'clock', order: [1, 2, 0] })
  })

  it('hides and shows: hidden things neither touch nor fall, and someone inside a solid shown is put beside it', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const wall = slab(sim, -0.5, 0, 0.5, 2, {}, NO_LISTENS)
    sim.world.solids[sim.where[wall].i].hidden = true
    const box = crate(sim, [4, 3, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    hide(sim, box)
    finishBuild(sim)
    play(sim, 30, () => [IDLE])
    expect(sim.world.things[sim.where[box].i].at[1]).toBe(3)
    show(sim, wall)
    expect(insideSolid(sim, 0)).toBe(false)
    show(sim, box)
    play(sim, 60, () => [IDLE])
    expect(sim.world.things[sim.where[box].i].at[1]).toBeCloseTo(0, 6)
  })
})

/** Every number in a value, deep: none may be NaN. */
function numbers(v: unknown, out: number[]): number[] {
  if (typeof v === 'number') out.push(v)
  else if (Array.isArray(v)) for (const x of v) numbers(x, out)
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v)) numbers(x, out)
  return out
}

describe('stacks, edges and the referee', () => {
  it('lets players reach both ends of the room together', () => {
    const { sim } = testSim(2, 'together', 1)
    onFloor(sim, [-1, 1])
    finishBuild(sim)
    play(sim, 240, () => [LEFT, RIGHT])
    expect(sim.world.players[0].at[0]).toBeCloseTo(-8 + FEEL.width / 2, 6)
    expect(sim.world.players[1].at[0]).toBeCloseTo(8 - FEEL.width / 2, 6)
  })

  it('lets a player walk off a ledge under the ceiling down to the floor, while a partner stays up there', () => {
    const { sim } = testSim(2, 'together', 1)
    const floor = onFloor(sim, [0, 0])
    slab(sim, -8, 5.6, -2, 6.6, {}, NO_LISTENS)
    putPlayer(sim, 0, [-6, 6.6, 0])
    putPlayer(sim, 1, [-5, 6.6, 0])
    finishBuild(sim)
    play(sim, 180, () => [IDLE, RIGHT])
    expect(sim.world.players[1].on).toBe(floor)
    expect(sim.world.players[1].at[1]).toBeCloseTo(0, 6)
  })

  it("lets a stick 'none' room move its player along with putAt every frame, never held and with no puffs", () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [-7])
    sim.world.players[0].stick = 'none'
    rec.frames.push(() => {
      const at = p0(sim).at
      putPlayer(sim, 0, [at[0] + 3 / 60, at[1], 0])
    })
    finishBuild(sim)
    let still = 0
    for (let f = 0; f < 240; f++) {
      const x = p0(sim).at[0]
      play(sim, 1, () => [IDLE])
      if (p0(sim).at[0] <= x) still += 1
    }
    expect(still).toBe(0)
    expect(p0(sim).at[0]).toBeCloseTo(-7 + 12, 1)
    expect(sim.world.puffs.length).toBe(0)
  })

  it('frees a player pinned by a putAt every other frame, or by a speed of 0.01', () => {
    const pinned = testSim(1, 'together', 1)
    onFloor(pinned.sim, [-7])
    pinned.rec.frames.push(() => {
      if (pinned.sim.world.frame % 2 === 0) putPlayer(pinned.sim, 0, [-7, 0, 0])
    })
    finishBuild(pinned.sim)
    let run = 0
    let longest = 0
    let away = false
    for (let f = 0; f < 600; f++) {
      play(pinned.sim, 1, () => [RIGHT])
      run = p0(pinned.sim).at[0] < -7 + REFEREE.pinRadius ? run + 1 : 0
      longest = Math.max(longest, run)
      if (p0(pinned.sim).at[0] > -7 + 3) away = true
    }
    // Held at most freeAfter, plus the few frames a walk from standing takes to leave the spot.
    expect(longest).toBeLessThanOrEqual(REFEREE.freeAfter * 60 + 10)
    expect(away).toBe(true)

    const slow = testSim(1, 'together', 1)
    onFloor(slow.sim, [-7])
    finishBuild(slow.sim)
    changePlayer(slow.sim, 0, { speed: 0.01, jump: 1, size: 1, weight: 1 }, 20)
    play(slow.sim, 600, () => [RIGHT])
    expect(p0(slow.sim).at[0]).toBeGreaterThan(-7 + 3)
  })

  it('counts a carried thing in a low zone its carrier stands in, with its weight', () => {
    const { sim } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const pad = addZone(sim, { at: [0, 0.15, 0], size: [2, 0.3, 2], color: null, wind: [0, 0, 0], pull: 0, gravity: 1, drag: 0, mover: null, name: null, hidden: false }, NO_LISTENS)
    const rock = crate(sim, [-5, 0, 0], 0.4, 0.4, 0.4, NO_LISTENS)
    finishBuild(sim)
    give(sim, 0, rock)
    play(sim, 2, () => [IDLE])
    expect(zoneWeight(sim, pad)).toBeCloseTo(1.4, 9)
  })

  it('rests a flat thing with its foot on the floor, grown upward only', () => {
    const { sim } = testSim(1, 'together', 1)
    const floor = onFloor(sim, [-7])
    const coin = addThing(sim, { at: [2, 0, 0], model: boxModel(sim, 0.5, 0.06), scale: 1, round: false, weight: 0.1, name: null, hidden: false }, NO_LISTENS)
    finishBuild(sim)
    play(sim, 60, () => [IDLE])
    const th = sim.world.things[sim.where[coin].i]
    expect(th.at[1]).toBeCloseTo(0, 6)
    expect(th.on).toBe(floor)
    expect(th.box.min[1]).toBe(0)
  })

  it('stands a thing whose model reaches under its foot on the floor it is put on, touching from its foot up', () => {
    const { sim } = testSim(1, 'together', 1)
    const floor = onFloor(sim, [-7])
    const model = boxModel(sim, 0.6, 0.6)
    const bounds = sim.world.models[model].bounds
    sim.world.models[model].bounds = { min: [bounds.min[0], -0.08, bounds.min[2]], max: bounds.max }
    const scarf = addThing(sim, { at: [2, 0, 0], model, scale: 1, round: false, weight: 0.3, name: null, hidden: false }, NO_LISTENS)
    finishBuild(sim)
    play(sim, 120, () => [IDLE])
    const th = sim.world.things[sim.where[scarf].i]
    expect(th.box.min[1]).toBe(0)
    expect(th.at[1]).toBeCloseTo(0, 6)
    expect(th.on).toBe(floor)
  })

  it('carries a player on a crate, and a player on a head, along with a sliding mover', () => {
    const one = testSim(1, 'together', 1)
    onFloor(one.sim, [7])
    platform(one.sim, one.rec, (t) => ({ at: [-4 + 1.5 * Math.min(t, 2), 3, 0], turn: 0 }), [3, 0.3, 2], {}, NO_LISTENS)
    const box = crate(one.sim, [-4, 3.15, 0], 0.8, 0.8, 1, NO_LISTENS)
    putPlayer(one.sim, 0, [-4, 3.95, 0])
    finishBuild(one.sim)
    play(one.sim, 90, () => [IDLE])
    expect(p0(one.sim).on).toBe(box)
    expect(p0(one.sim).at[0]).toBeCloseTo(-4 + 1.5 * 1.5, 1)

    const two = testSim(2, 'together', 1)
    onFloor(two.sim, [7, 7])
    platform(two.sim, two.rec, (t) => ({ at: [-4 + 1.5 * Math.min(t, 2), 3, 0], turn: 0 }), [3, 0.3, 2], {}, NO_LISTENS)
    putPlayer(two.sim, 0, [-4, 3.15, 0])
    putPlayer(two.sim, 1, [-4, 3.15 + FEEL.height, 0])
    finishBuild(two.sim)
    play(two.sim, 90, () => [IDLE, IDLE])
    const [low, high] = two.sim.world.players
    expect(high.on).toBe(low.id)
    expect(high.at[0]).toBeCloseTo(-4 + 1.5 * 1.5, 1)
  })

  it('uses what has use with full hands too, keeping what they carry', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const key = crate(sim, [-5, 0, 0], 0.4, 0.4, 0.3, NO_LISTENS)
    const lock = slab(sim, 0.5, 0, 1.3, 1.5, {}, listen({ use: true }))
    finishBuild(sim)
    give(sim, 0, key)
    play(sim, 2, (f) => [{ stick: [0, 0], a: false, b: f === 1 }])
    expect(rec.calls).toContain(`use ${lock} 0`)
    expect(p0(sim).holding).toBe(key)
  })

  it('plays a clone taken just after a solid was put onto a player exactly as the original', () => {
    const { sim, rec } = testSim(1, 'together', 1)
    onFloor(sim, [0])
    const block = slab(sim, 4, 0, 5, 1.5, {}, NO_LISTENS)
    rec.frames.push(() => {
      if (sim.world.frame === 10) putAt(sim, block, [0.2, 0.75, 0])
    })
    finishBuild(sim)
    play(sim, 10, () => [IDLE])
    expect(insideSolid(sim, 0)).toBe(false)
    const twin = attach(structuredClone(sim.world), rec, sim.listens)
    play(sim, 60, () => [IDLE])
    play(twin, 60, () => [IDLE])
    expect(twin.world).toStrictEqual(sim.world)
  })
})

describe('determinism and robustness', () => {
  it('plays the same inputs to the same World, to the bit', () => {
    const run = () => {
      const { sim } = busyRoom()
      play(sim, 900, randomHolds(11, 4))
      return sim.world
    }
    expect(run()).toStrictEqual(run())
  })

  it('a structuredClone keeps the World whole, and plays on exactly as the original', () => {
    const { sim, rec } = busyRoom()
    const holds = randomHolds(12, 4)
    play(sim, 300, holds)
    const copy = structuredClone(sim.world)
    expect(copy).toStrictEqual(sim.world)
    const twin = attach(copy, rec, sim.listens)
    const next = randomHolds(13, 4)
    const inputs = Array.from({ length: 300 }, (_, f) => next(f))
    play(sim, 300, (f) => inputs[f])
    play(twin, 300, (f) => inputs[f])
    expect(twin.world).toStrictEqual(sim.world)
  })

  it('a minute of random pressing in a busy room breaks nothing', () => {
    const { sim } = busyRoom()
    const holds = randomHolds(21, 4)
    const outside = [0, 0, 0, 0]
    let longestOutside = 0
    const { min, max } = sim.world.bounds
    for (let f = 0; f < 3600; f++) {
      play(sim, 1, holds)
      sim.world.players.forEach((p, i) => {
        const out = p.at[0] < min[0] || p.at[0] > max[0] || p.at[1] < min[1] || p.at[1] > max[1]
        outside[i] = out ? outside[i] + 1 : 0
        longestOutside = Math.max(longestOutside, outside[i])
      })
      if (f % 600 === 0) expect(numbers(sim.world, []).some((n) => Number.isNaN(n))).toBe(false)
    }
    expect(numbers(sim.world, []).some((n) => Number.isNaN(n))).toBe(false)
    expect(longestOutside).toBeLessThan(60)
    for (const th of sim.world.things) {
      expect(th.at[0]).toBeGreaterThanOrEqual(min[0] - 1.5)
      expect(th.at[0]).toBeLessThanOrEqual(max[0] + 1.5)
    }
    expect(sim.world.puffs.length).toBeLessThanOrEqual(600)
    expect(sim.world.sounds.every((s) => sim.world.t - s.born <= 1)).toBe(true)
  })

  it('plays a minute of a busy room in well under a second', () => {
    const { sim } = busyRoom()
    const holds = randomHolds(31, 4)
    const inputs = Array.from({ length: 3600 }, (_, f) => holds(f))
    const start = performance.now()
    play(sim, 3600, (f) => inputs[f])
    const ms = performance.now() - start
    console.log(`a minute of the busy room took ${ms.toFixed(0)} ms`)
    // Loose, for a shared machine: the aim is well under a second.
    expect(ms).toBeLessThan(2500)
  })
})

