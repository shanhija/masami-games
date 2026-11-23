import { describe, expect, it } from 'vitest'
import { parseColor } from '../../../silly-billy/src/engine/kit'
import { NO_POINTING } from '../seats/types'
import { WALK_MISTAKES } from '../trial/api'
import {
  FEEL,
  HANDLE_VIEW_REF,
  LAMP_REF,
  MISTAKES,
  MOVER_REF,
  MOVER_VIEW_REF,
  PLACED_REF,
  PLACED_VIEW_REF,
  PLAYER_REF,
  PLAYER_VIEW_REF,
  REFEREE,
  SHARED_ACTS_REF,
  SIGN_REF,
  SIGN_VIEW_REF,
  SOLID_REF,
  SURVEY_NOTES,
  THING_REF,
  THING_VIEW_REF,
  ZONE_REF,
  ZONE_VIEW_REF,
  type Builder,
  type Decor,
  type Lamp,
  type Mover,
  type Player,
  type Sign,
  type Solid,
  type Thing,
  type World,
  type Zone,
} from './api'
import { Handles } from './handles'
import type { Room } from './room'
import { cube, houseFloor, idle, NEVER, plainRoom, playRoom, roomStart, testRoom, type Hold } from './testing'

const S1 = roomStart(1, 'together', 1, 5)
const S2 = roomStart(2, 'together', 1, 5)
const sorted = (o: object) => Object.keys(o).sort()
const frames = (room: Room, n: number) => playRoom(room, n, idle(room), () => NO_POINTING)
const holding = (room: Room, n: number, h: Hold) => playRoom(room, n, () => room.world.players.map(() => h), () => NO_POINTING)

/** Builds a room on the plain one and gives back what `build` made. */
function withRoom<T>(start: ReturnType<typeof roomStart>, build: (r: Builder, w: World) => T): { room: Room; got: T } {
  const box: { got: T | null } = { got: null }
  const room = testRoom((r, w) => {
    plainRoom(r, w, NEVER)
    box.got = build(r, w)
  }, start)
  return { room, got: box.got as T }
}

/** Runs handle calls from outside made code, as a test does, on a budget of their own. */
function act<T>(room: Room, call: () => T): T {
  room.runtime.budget.start(Number.MAX_SAFE_INTEGER, 'a test ran too long')
  return call()
}

const KINDS = {
  solid: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...SHARED_ACTS_REF, ...SOLID_REF },
  thing: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...THING_VIEW_REF, glow: '', pose: '', ...THING_REF },
  decor: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...SHARED_ACTS_REF },
  zone: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...ZONE_VIEW_REF, glow: '', ...ZONE_REF },
  lamp: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...LAMP_REF },
  sign: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...PLACED_REF, ...SIGN_VIEW_REF, ...SIGN_REF },
  mover: { ...HANDLE_VIEW_REF, ...MOVER_VIEW_REF, glow: '', ...MOVER_REF },
  player: { ...HANDLE_VIEW_REF, ...PLAYER_VIEW_REF, glow: '', ...PLAYER_REF },
}
const READS = {
  solid: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF },
  thing: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...THING_VIEW_REF },
  decor: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF },
  zone: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...ZONE_VIEW_REF },
  lamp: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF },
  sign: { ...HANDLE_VIEW_REF, ...PLACED_VIEW_REF, ...SIGN_VIEW_REF },
  mover: { ...HANDLE_VIEW_REF, ...MOVER_VIEW_REF },
  player: { ...HANDLE_VIEW_REF, ...PLAYER_VIEW_REF },
}

/** One handle of every kind. */
function everyKind(r: Builder, w: World) {
  return {
    solid: r.box([3, 3, 0], [1, 0.4, 2]),
    thing: r.thing([2, 0, 0], cube(0.5, 0.5, 0.5)),
    decor: r.decor([0, 0, -1], cube(1, 1, 1)),
    zone: r.zone([0, 1, 0], [1, 1, 1]),
    lamp: r.lamp([0, 6, 1]),
    sign: r.sign([0, 6, 0], 3),
    mover: r.mover(() => r.box([0, 0, 0], [2, 0.3, 2]), () => ({ at: [-5, 4, 0] })),
    player: w.players()[0],
  }
}

describe('each handle has exactly the calls its reference names', () => {
  it('in the room', () => {
    const { got } = withRoom(S1, everyKind)
    for (const [kind, h] of Object.entries(got)) expect(sorted(h), kind).toEqual(sorted(KINDS[kind as keyof typeof KINDS]))
  })

  it("in the walkthrough's view, only the reads, an act refused with its sentence", () => {
    const { room, got } = withRoom(S1, everyKind)
    const view = new Handles(room.sim, { acts: false, player: null, refuse: WALK_MISTAKES.readOnly, turn: () => {}, note: () => {}, started: () => {} })
    for (const [kind, h] of Object.entries(got)) {
      const seen = view.of(room.handles.idOf(h) as number)
      expect(sorted(seen), kind).toEqual(sorted(READS[kind as keyof typeof READS]))
    }
    const solid = view.of(room.handles.idOf(got.solid) as number) as Solid
    expect(() => solid.putAt([0, 0, 0])).toThrow(WALK_MISTAKES.readOnly('solid', 'putAt'))
    expect(solid.at()).toEqual([3, 3, 0])
  })

  it('a key a handle lacks, a write, or a call used as a value, each says how to read it', () => {
    const { got } = withRoom(S1, everyKind)
    expect(() => (got.zone as unknown as { size: number }).size).toThrow(MISTAKES.noField('zone', 'size', Object.keys(KINDS.zone)).split(':')[0])
    expect(() => ((got.thing as unknown as { mine: number }).mine = 1)).toThrow(MISTAKES.frozen('thing', 'mine'))
    expect(() => `${got.mover.clock as unknown as string}`).toThrow(MISTAKES.notCalled('mover', 'clock'))
    expect(() => (got.player.at as unknown as { x: number }).x).toThrow(MISTAKES.notCalled('player', 'at'))
  })
})

describe('reads', () => {
  it('kind(), and the same thing always the same handle, its points and lists frozen', () => {
    const { room, got } = withRoom(S2, (r, w) => {
      const pad = r.zone([-4, 1, 0], [1, 2, 2])
      return { ...everyKind(r, w), pad, players: w.players(), again: w.players() }
    })
    for (const k of ['solid', 'thing', 'decor', 'zone', 'lamp', 'sign', 'mover', 'player'] as const) expect(got[k].kind()).toBe(k)
    expect(got.players).toBe(got.again)
    expect(Object.isFrozen(got.players)).toBe(true)
    frames(room, 1)
    act(room, () => {
      expect(got.pad.inside()[0]).toBe(got.players[0])
      expect(Object.isFrozen(got.pad.inside())).toBe(true)
      expect(got.players[0].standingOn()).toBe(room.handles.of(houseFloor(room.world).id))
      expect(Object.isFrozen(got.players[0].at())).toBe(true)
    })
  })

  it("the house's own solids: what a player stands on, read as any solid; an act on one says it is the house's", () => {
    const { room, got } = withRoom(S1, (_, w) => w.players()[0])
    frames(room, 1)
    act(room, () => {
      const floor = got.standingOn() as Solid
      expect(floor).toBe(room.handles.of(houseFloor(room.world).id))
      expect(floor.kind()).toBe('solid')
      expect(floor.at()).toEqual([0, -0.2, 0])
      expect(() => floor.hide()).toThrow(MISTAKES.houseOwns("solid.hide on the house's floor"))
      expect(() => floor.set({ ice: true })).toThrow(MISTAKES.houseOwns("solid.set on the house's floor"))
      expect(() => floor.slideTo([0, 3, 0], 1)).toThrow(MISTAKES.houseOwns("solid.slideTo on the house's floor"))
    })
    expect(houseFloor(room.world).hidden).toBe(false)
  })

  it("at(): a solid's, zone's or sign's middle, a thing's or decor's foot, a lamp's light, a part's in the room", () => {
    const { room, got } = withRoom(S1, (r) => {
      let part: Solid | null = null
      const m = r.mover(() => (part = r.box([1, 0, 0], [1, 0.2, 1])), (t) => ({ at: [-5, 4 + 0 * t, 0], turn: Math.PI / 2 }))
      return { part: part as unknown as Solid, m, zone: r.zone([1, 2, 0], [1, 1, 1]), sign: r.sign([0, 6, 0.5], 1), lamp: r.lamp([1, 5, 2]), thing: r.thing([2, 0, 0], cube(0.4, 0.4, 0.4)), decor: r.decor([4, 0, -2], cube(1, 1, 1)) }
    })
    act(room, () => {
      expect(got.zone.at()).toEqual([1, 2, 0])
      expect(got.sign.at()).toEqual([0, 6, 0.5])
      expect(got.lamp.at()).toEqual([1, 5, 2])
      expect(got.thing.at()).toEqual([2, 0, 0])
      expect(got.decor.at()).toEqual([4, 0, -2])
      expect(got.part.at()[0]).toBeCloseTo(-5, 9)
      expect(got.part.at()[1]).toBeCloseTo(5, 9)
      expect(got.m.at()).toEqual([-5, 4, 0])
      expect(got.m.turn()).toBeCloseTo(Math.PI / 2, 9)
    })
  })

  it('a player: at, velocity, facing, stick, button, holding, standingOn, score, color', () => {
    const { room, got } = withRoom(S1, (r, w) => ({ p: w.players()[0], thing: r.thing([-3.4, 0, 0], cube(0.4, 0.4, 0.4)) }))
    holding(room, 10, { stick: [-1, 0.5], a: false, b: true })
    act(room, () => {
      const p = got.p
      expect(p.facing()).toEqual([-1, 0, 0])
      expect(p.stick()).toEqual([-1, 0.5])
      expect(p.button('b')).toBe(true)
      expect(p.button('a')).toBe(false)
      expect(p.velocity()[0]).toBeLessThan(0)
      expect(p.at()[0]).toBeLessThan(-4)
      expect(p.holding()).toBe(got.thing)
      expect(got.thing.heldBy()).toBe(p)
      expect(p.score()).toBe(0)
      expect(p.color()).toBe('#ff5a4e')
    })
    frames(room, 30)
    act(room, () => {
      expect(got.p.stick()).toEqual([0, 0])
      expect(got.p.standingOn()?.kind()).toBe('solid')
    })
  })
})

describe('acts of what the room built', () => {
  it('putAt: there at once; a thing also stops; a solid moved a little every frame carries what stands on it', () => {
    const { room, got } = withRoom(S1, (r, w) => {
      w.players()[0].putAt([-6, 0.3, 0])
      return { lift: r.box([-6, 0.15, 0], [1.5, 0.3, 2]), thing: r.thing([2, 3, 0], cube(0.4, 0.4, 0.4)) }
    })
    frames(room, 10)
    act(room, () => got.thing.putAt([4, 5, 0]))
    expect(room.world.things[0].velocity).toEqual([0, 0, 0])
    expect(room.world.things[0].at).toEqual([4, 5, 0])
    for (let i = 1; i <= 30; i++) {
      act(room, () => got.lift.putAt([-6 + i * 0.03, 0.15, 0]))
      frames(room, 1)
    }
    expect(room.world.players[0].at[0]).toBeCloseTo(-5.1, 1)
  })

  it('slideTo: a straight line over secs, easing; a thing passes through everything and is loose at the end', () => {
    const { room, got } = withRoom(S1, (r) => ({ thing: r.thing([2, 0, 0], cube(0.4, 0.4, 0.4)), solid: r.box([5, 3, 0], [1, 0.3, 2]) }))
    act(room, () => {
      got.thing.slideTo([2, 4, 0], 1)
      got.solid.slideTo([7, 3, 0], 2)
    })
    frames(room, 30)
    expect(room.world.things[0].at[1]).toBeCloseTo(2, 1)
    expect(room.world.solids[0].at[0]).toBeGreaterThan(5)
    frames(room, 32)
    expect(room.world.things[0].slide).toBe(null)
    frames(room, 60)
    expect(room.world.things[0].at[1]).toBeCloseTo(0, 2)
    expect(room.world.solids[0].at[0]).toBe(7)
  })

  it('slideTo: a solid passes into other solids, which never stop it', () => {
    // A gate sinks into the floor it stands on; another slides into a wall.
    const { room, got } = withRoom(S1, (r) => ({ gate: r.box([3, 1, 0], [0.4, 2, 2]), wall: r.box([6, 1, 0], [0.4, 2, 2]), door: r.box([4.5, 1, 0], [0.4, 2, 2]) }))
    act(room, () => {
      got.gate.slideTo([3, -1.2, 0], 1)
      got.door.slideTo([6, 1, 0], 1)
    })
    frames(room, 90)
    expect([room.world.solids[0].at, room.world.solids[2].at]).toEqual([
      [3, -1.2, 0],
      [6, 1, 0],
    ])
  })

  it('hide and show: a hidden thing hangs and is let go; a zone notices it leave; anyone inside a solid shown is put beside it', () => {
    const left: string[] = []
    const { room, got } = withRoom(S1, (r, w) => {
      const zone = r.zone([2, 0.5, 0], [2, 1, 2], { leave: () => left.push('leave') })
      return { zone, thing: r.thing([2, 0, 0], cube(0.4, 0.4, 0.4)), wall: r.box([-4, 1, 0], [1, 2, 2], { hidden: true }), p: w.players()[0] }
    })
    frames(room, 2)
    act(room, () => got.thing.hide())
    frames(room, 2)
    expect(left).toEqual(['leave'])
    act(room, () => {
      expect(got.thing.hidden()).toBe(true)
      expect(got.zone.inside()).toEqual([])
      got.wall.show()
    })
    expect(room.world.players[0].at[0] < -4.5 || room.world.players[0].at[0] > -3.5).toBe(true)
  })

  it('glow, pose and turnTo', () => {
    const { room, got } = withRoom(S1, (r) => ({
      solid: r.box([3, 3, 0], [1, 0.4, 2], { model: (m) => m.part('lid', { at: [0, 0.4, 0] }, () => m.box(1, 0.1, 1)) }),
      decor: r.decor([0, 0, -1], cube(1, 1, 1)),
    }))
    act(room, () => {
      got.solid.glow('gold', true)
      got.decor.glow('#00ff00')
      got.solid.pose('lid', [0, 0, 1], 1)
      got.decor.turnTo(1, 0)
    })
    expect(room.world.solids[0].glow).toEqual({ color: parseColor('gold'), pulse: true })
    expect(room.world.decor[0].glow).toEqual({ color: '#00ff00', pulse: false })
    expect(room.world.decor[0].changed).toBe(true)
    frames(room, 60)
    expect(room.world.solids[0].parts.lid.to).toEqual([0, 0, 1])
    expect(room.world.decor[0].turn).toBe(1)
    act(room, () => got.solid.glow(null))
    expect(room.world.solids[0].glow).toBe(null)
  })

  it('solid.set changes its surface from now on', () => {
    const { room, got } = withRoom(S1, (r) => r.box([3, 3, 0], [1, 0.4, 2]))
    act(room, () => got.set({ color: 'red', ice: true, bounce: 1, belt: [2, 0, 5], through: true }))
    expect(room.world.solids[0].surface).toEqual({ color: parseColor('red'), ice: true, bounce: 1, belt: [2, 0, 0], through: true })
  })

  it("a mover: its clock at its speed, slideBy as an offset, turnBy, moving(), hide and show", () => {
    const { room, got } = withRoom(S1, (r) => r.mover(() => r.box([0, 0, 0], [2, 0.3, 2]), (t) => ({ at: [t, 4, 0] })))
    frames(room, 60)
    act(room, () => {
      expect(got.clock()).toBeCloseTo(1, 9)
      got.speed(0)
    })
    frames(room, 30)
    act(room, () => {
      expect(got.clock()).toBeCloseTo(1, 9)
      got.speed(-1)
    })
    frames(room, 30)
    act(room, () => {
      expect(got.clock()).toBeCloseTo(0.5, 9)
      got.speed(0)
      got.slideBy([0, 2, 0], 1)
      got.turnBy(1, 1)
      expect(got.moving()).toBe(true)
    })
    frames(room, 61)
    act(room, () => {
      expect(got.moving()).toBe(false)
      expect(got.at()[1]).toBeCloseTo(6, 9)
      expect(got.turn()).toBeCloseTo(1, 9)
      got.hide()
      expect(got.hidden()).toBe(true)
      got.show()
      expect(got.hidden()).toBe(false)
      got.glow('blue')
    })
    expect(room.world.movers[0].glow?.color).toBe(parseColor('blue'))
  })

  it('a thing: velocity, push adds speed, goHome puts it back with a puff', () => {
    const { room, got } = withRoom(S1, (r) => r.thing([2, 0, 0], cube(0.4, 0.4, 0.4)))
    frames(room, 2)
    act(room, () => got.push([0, 10, 0]))
    let top = 0
    for (let i = 0; i < 40; i++) {
      frames(room, 1)
      top = Math.max(top, room.world.things[0].at[1])
    }
    expect(top).toBeCloseTo((10 * 10) / (2 * FEEL.gravity), 1)
    act(room, () => {
      got.putAt([5, 4, 0])
      expect(got.velocity()).toEqual([0, 0, 0])
      got.goHome()
      expect(got.at()).toEqual([2, 0, 0])
    })
    expect(room.world.puffs.length).toBeGreaterThan(0)
  })

  it('a zone: has, inside, weight with carried things and weight changes, set', () => {
    const { room, got } = withRoom(S2, (r, w) => ({ zone: r.zone([-3.25, 1, 0], [3, 2, 2]), thing: r.thing([-3.5, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.4 }), ps: w.players() }))
    frames(room, 1)
    act(room, () => {
      expect(got.zone.has(got.ps[0])).toBe(true)
      expect(got.zone.has(got.thing)).toBe(true)
      expect(got.zone.weight()).toBeCloseTo(2.4, 9)
      got.ps[1].change({ weight: 3 }, 5)
      got.ps[0].give(got.thing)
    })
    frames(room, 1)
    act(room, () => {
      expect(got.zone.weight()).toBeCloseTo(1 + 3 + 0.4, 9)
      expect(got.zone.inside()).toHaveLength(3)
      got.zone.set({ color: 'pink', wind: [1, 0, 3], pull: 2, gravity: 0, drag: 5 })
      expect(() => got.zone.has(got.zone as never)).toThrow('zone.has')
    })
    expect(room.world.zones[0]).toMatchObject({ color: parseColor('pink'), wind: [1, 0, 0], pull: 2, gravity: 0, drag: 1 })
  })

  it('lamp.set, sign.what and sign.write', () => {
    const { room, got } = withRoom(S1, (r) => ({ lamp: r.lamp([0, 6, 1]) as Lamp, sign: r.sign([0, 6, 0], 3) as Sign }))
    frames(room, 30)
    act(room, () => {
      got.lamp.set({ power: 0.2, reach: 3, color: 'white' })
      expect(got.sign.what()).toBe(3)
      got.sign.write({ count: 1, of: 3 })
      expect(got.sign.what()).toEqual({ count: 1, of: 3 })
      got.sign.write({ clock: 5 })
      expect(got.sign.what()).toEqual({ clock: 5 })
    })
    expect(room.world.lamps[0]).toMatchObject({ power: 0.2, reach: 3, color: parseColor('white') })
    expect(room.world.signs[0].what).toEqual({ clock: 5, from: 0.5 })
  })

  it('decor has putAt, slideTo, hide and show too', () => {
    const { room, got } = withRoom(S1, (r) => r.decor([0, 0, -1], cube(1, 1, 1)) as Decor)
    act(room, () => {
      got.putAt([1, 0, -2])
      expect(got.at()).toEqual([1, 0, -2])
      got.hide()
      expect(got.hidden()).toBe(true)
      got.show()
      got.slideTo([3, 0, -2], 0)
    })
    frames(room, 1)
    expect(room.world.decor[0].at).toEqual([3, 0, -2])
  })
})

describe("a player's acts", () => {
  it('putAt: while building their start, z set to 0 and noted; in play there at once, held still at most REFEREE.freeAfter', () => {
    const hold = { on: false }
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      const p = w.players()[0]
      p.putAt([-3, 0, 1])
      // Put somewhere every frame by the room's own code.
      return () => {
        if (hold.on) p.putAt([2, 0, 0])
      }
    }, S1)
    expect(room.world.players[0].start).toEqual([-3, 0, 0])
    expect(room.survey.notes).toContain(SURVEY_NOTES.zSet('p.putAt', 1))
    act(room, () => (room.handles.of(0) as Player).putAt([2, 0, 0]))
    expect(room.world.players[0].at).toEqual([2, 0, 0])
    hold.on = true
    const from = room.world.t
    let freed = -1
    for (let f = 0; f < 200 && freed < 0; f++) {
      holding(room, 1, { stick: [1, 0], a: false, b: false })
      if (room.world.players[0].at[0] > 2.01) freed = room.world.t - from
    }
    expect(freed).toBeGreaterThan(REFEREE.freeAfter - 0.1)
    expect(freed).toBeLessThanOrEqual(REFEREE.freeAfter + 0.1)
  })

  it('push adds speed; change for secs, size within its range; bonk stills, then not again for a while', () => {
    const { room, got } = withRoom(S1, (...[, w]: [Builder, World]) => w.players()[0] as Player)
    act(room, () => got.push([0, 10, 0]))
    let top = 0
    for (let i = 0; i < 40; i++) {
      frames(room, 1)
      top = Math.max(top, room.world.players[0].at[1])
    }
    expect(top).toBeCloseTo(2.5, 1)
    frames(room, 30)
    act(room, () => got.change({ speed: 2, size: 9 }, 100))
    expect(room.world.players[0].change).toMatchObject({ speed: 2, jump: 1, size: REFEREE.sizeMax, weight: 1 })
    expect(room.world.players[0].change?.until).toBeCloseTo(room.world.t + REFEREE.changeSecs, 9)
    frames(room, 2)
    expect(room.world.players[0].size).toBeGreaterThan(1)
    act(room, () => got.bonk())
    const bonkedUntil = room.world.players[0].bonkedUntil
    expect(bonkedUntil).toBeCloseTo(room.world.t + REFEREE.bonkSecs, 9)
    frames(room, 70)
    act(room, () => got.bonk())
    expect(room.world.players[0].bonkedUntil).toBe(bonkedUntil)
  })

  it('give puts a thing in their arms whatever it weighs; drop puts it down in front; addScore shows the badge', () => {
    const { room, got } = withRoom(S1, (r, w) => ({ p: w.players()[0] as Player, rock: r.thing([3, 0, 0], cube(0.6, 0.6, 0.6), { weight: 2 }) as Thing }))
    act(room, () => got.p.give(got.rock))
    frames(room, 1)
    act(room, () => {
      expect(got.p.holding()).toBe(got.rock)
      got.p.drop()
      expect(got.p.holding()).toBe(null)
      got.p.addScore(2)
      got.p.addScore(-1)
      got.p.glow('red', true)
    })
    expect(room.world.things[0].at[0]).toBeGreaterThan(-4)
    expect(room.world.players[0]).toMatchObject({ score: 1, badge: true, glow: { color: parseColor('red'), pulse: true } })
  })

  it('a mover part goes only where its mover takes it', () => {
    const { room, got } = withRoom(S1, (r) => {
      let part: Solid | null = null
      const m: Mover = r.mover(() => (part = r.box([0, 0, 0], [1, 0.2, 1])), () => ({ at: [-5, 4, 0] }))
      return { part: part as unknown as Solid, m }
    })
    act(room, () => {
      expect(() => got.part.slideTo([0, 0, 0], 1)).toThrow(MISTAKES.moverPart('solid.slideTo'))
      expect(got.m.hidden()).toBe(false)
    })
  })

  it('zone.has and thing.heldBy give back the same player handles', () => {
    const { room, got } = withRoom(S1, (r, w) => ({ zone: r.zone([-4, 1, 0], [1, 2, 2]) as Zone, p: w.players()[0] }))
    frames(room, 1)
    act(room, () => expect(got.zone.inside()).toEqual([got.p]))
  })
})
