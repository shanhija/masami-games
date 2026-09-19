/**
 * Runs the foot chase in node for minutes at a time with two kinds of player at the
 * keys: one who hops everything in the way and one who never presses anything. Then
 * each rule on its own, on an empty street with just the thing under test on it.
 */
import { describe, expect, it } from 'vitest'

import { mulberry32 } from './random'
import {
  BOX_H,
  BRAKE_FACTOR,
  CAR_H,
  CRASH_SPEED,
  DOG_H,
  DOG_SLOW,
  DOG_SPEED,
  ESCAPE_BONUS,
  FLY_FOR,
  FLY_H,
  FLY_FACTOR,
  FREEZE_FOR,
  JUMP_BUFFER,
  JUMP_HEIGHT,
  JUMP_TIME,
  LANE,
  MAGNET_SLOW,
  POLICE_DOG_HOLD,
  POLICE_DOG_SLOW,
  POLICE_DOG_SPEED,
  POLICE_SPEED,
  ROAD_HALF_W,
  ROBBER_SPEED,
  SKATES_FACTOR,
  SPAWN_AHEAD,
  START_GAP,
  TURBO_BOLTS,
  TURBO_FACTOR,
  TURBO_MAX,
  YARD_W,
  createSim,
  flying,
  jumpLead,
  pressJump,
  resetSim,
  setThrottle,
  tick,
  type Box,
  type Dog,
  type EventKind,
  type Phase,
  type RoadCar,
  type Role,
  type Sim,
} from './sim'

const DT = 1 / 60
type Driver = (s: Sim) => void
const never: Driver = () => {}

/** Drives `seconds` of the chase at 60 Hz from a fresh street; each driver is called before every tick and may press. */
function run(seed: number, seconds: number, drivers: Record<Role, Driver>, watch: (s: Sim) => void = () => {}) {
  const s = createSim(mulberry32(seed))
  pressJump(s, 'police')
  const counts: Partial<Record<EventKind, number>> = {}
  const phases = new Set<Phase>()
  for (let t = 0; t < seconds; t += DT) {
    drivers.police(s)
    drivers.robber(s)
    tick(s, DT)
    for (const e of s.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1
    s.events.length = 0
    phases.add(s.phase)
    watch(s)
  }
  return { s, counts, phases }
}

/** Ticks `seconds` on, drivers first, and returns every event in order. */
function drive(s: Sim, seconds: number, ...drivers: Driver[]) {
  const events: { kind: EventKind; who: Role }[] = []
  for (let t = 0; t < seconds; t += DT) {
    for (const d of drivers) d(s)
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  return events
}

/** Ticks on until an event of this kind happens (the tick it happens in included), or fails after `most` seconds. */
function driveUntil(s: Sim, kind: EventKind, most: number, ...drivers: Driver[]) {
  for (let t = 0; t < most; t += DT) {
    for (const d of drivers) d(s)
    tick(s, DT)
    const seen = s.events.find((e) => e.kind === kind)
    s.events.length = 0
    if (seen) return seen
  }
  throw new Error(`no ${kind} within ${most} s`)
}

/**
 * A chase already on, on an empty street with nothing more to lay: the police started it
 * with a hop on the spot and has just landed, a few units in and up to speed; the robber
 * runs `gap` ahead. Things for the police to meet go at POLICE_AT, for the robber at ROBBER_AT.
 */
function emptyStreet(gap = START_GAP) {
  const s = createSim(mulberry32(1))
  for (const list of [s.houses, s.fences, s.boxes, s.dogs, s.roads, s.bananas]) list.length = 0
  s.builtTo = Infinity
  s.robber.x = gap
  pressJump(s, 'police')
  tick(s, DT)
  expect(s.phase).toBe('chase')
  driveUntil(s, 'land', 2)
  expect(s.police.x).toBeLessThan(POLICE_AT - 4)
  return s
}
const POLICE_AT = 10
const ROBBER_AT = START_GAP + 6
/** A gap wide enough that a slowed robber is not caught within a short test, yet short of an escape. */
const WIDE = 26

const box = (s: Sim, role: Role, item: Box['item'], x: number): Box => {
  const b: Box = { id: s.nextId++, x, role, item, hitAt: -1, opened: false }
  s.boxes.push(b)
  return b
}
const yardDog = (s: Sim, x: number, home0: number, home1: number): Dog => {
  const d: Dog = { id: s.nextId++, kind: 'yard', x, rest: x, home0, home1, state: 'guard', on: null, latchedAt: -1, facing: -1 }
  s.dogs.push(d)
  return d
}

/**
 * A player who hops whatever is coming: fences, the other one's crates and roads at the
 * ideal lead, and a dog so as to be at the top of the jump when it arrives.
 */
function hopper(role: Role): Driver {
  return (s) => {
    const r = s[role]
    if (s.phase !== 'chase' || !r.onGround || flying(r, s.time)) return
    let hurdle = Infinity
    for (const f of s.fences) if (f.hitAt < 0 && f.x > r.x) hurdle = Math.min(hurdle, f.x)
    for (const b of s.boxes) if (b.hitAt < 0 && b.role !== role && b.x > r.x) hurdle = Math.min(hurdle, b.x)
    for (const road of s.roads) if (road.x > r.x) hurdle = Math.min(hurdle, road.x)
    if (hurdle - r.x <= jumpLead(r.speed)) {
      pressJump(s, role)
      return
    }
    for (const d of s.dogs) {
      if (d.state !== 'charge') continue
      const closing = d.kind === 'yard' ? (d.x > r.x ? r.speed + DOG_SPEED : 0) : d.x < r.x && role === 'robber' ? POLICE_DOG_SPEED - r.speed : 0
      if (closing > 0 && Math.abs(d.x - r.x) <= jumpLead(closing)) {
        pressJump(s, role)
        return
      }
    }
  }
}

describe('the loop', () => {
  it('a robber who never jumps is caught, spills half the loot, gets a head start, and is chased again', () => {
    let coinsBefore = 0
    let spillsChecked = 0
    const { s, counts, phases } = run(1, 150, { police: hopper('police'), robber: never }, (s) => {
      if (s.phase === 'caught' && s.time === s.phaseAt) {
        expect(s.coins).toBe(coinsBefore - Math.floor(coinsBefore / 2))
        expect(s.droppedCoins).toBe(Math.floor(coinsBefore / 2))
        spillsChecked += 1
      }
      coinsBefore = s.coins
    })
    expect(s.catches).toBeGreaterThanOrEqual(2)
    expect(counts.caught).toBe(s.catches)
    expect(spillsChecked).toBe(s.catches)
    expect(phases.has('escape')).toBe(true)
    expect(counts.escape).toBeGreaterThanOrEqual(s.catches - 1)
  })

  it('a police who never jumps falls behind until the robber gets away, then closes back in', () => {
    const { s, counts, phases } = run(2, 150, { police: never, robber: hopper('robber') })
    expect(counts.escaped).toBeGreaterThanOrEqual(1)
    expect(phases.has('regroup')).toBe(true)
    expect(s.coins).toBeGreaterThan(ESCAPE_BONUS)
    expect(counts.crash).toBeGreaterThan(5)
  })

  it('restores the head start after every catch and escape, and keeps the robber ahead throughout', () => {
    let last: Phase = 'ready'
    let restored = 0
    for (const seed of [3, 4]) {
      run(seed, 150, { police: hopper('police'), robber: seed === 3 ? never : hopper('robber') }, (s) => {
        const gap = s.robber.x - s.police.x
        expect(gap).toBeGreaterThan(0)
        if (s.phase === 'chase' && (last === 'escape' || last === 'regroup')) {
          expect(Math.abs(gap - START_GAP)).toBeLessThan(2)
          restored += 1
        }
        last = s.phase
      })
    }
    expect(restored).toBeGreaterThanOrEqual(2)
  })
})

describe('running', () => {
  it('waits in the ready phase until either player presses, and that press is the first jump', () => {
    const s = createSim(mulberry32(1))
    for (let i = 0; i < 60; i++) tick(s, DT)
    expect(s.phase).toBe('ready')
    expect(s.police.x).toBe(0)
    expect(s.robber.x).toBe(START_GAP)
    expect(s.fences.length).toBeGreaterThan(0)
    pressJump(s, 'robber')
    tick(s, DT)
    expect(s.phase).toBe('chase')
    expect(s.robber.y).toBeGreaterThan(0)
    expect(s.police.y).toBe(0)
    expect(s.events).toEqual([
      { kind: 'start', who: 'robber' },
      { kind: 'jump', who: 'robber' },
    ])
  })

  it('remembers a press made in the air for the jump buffer, and fires it on landing', () => {
    const s = emptyStreet()
    pressJump(s, 'police')
    tick(s, DT)
    s.events.length = 0
    let landed = false
    let pressedAt = -1
    while (!landed) {
      if (pressedAt < 0 && s.police.vy < 0 && s.police.y < 0.6) {
        pressJump(s, 'police')
        pressedAt = s.time
      }
      tick(s, DT)
      landed = s.events.some((e) => e.kind === 'land' && e.who === 'police')
      s.events.length = 0
    }
    expect(s.time - pressedAt).toBeLessThan(JUMP_BUFFER)
    tick(s, DT)
    expect(s.events.map((e) => e.kind)).toEqual(['jump'])
  })

  it('a jump at the ideal lead clears a fence; running into one breaks it and costs a stumble', () => {
    const s = emptyStreet()
    const fence = { id: s.nextId++, x: POLICE_AT, hitAt: -1 }
    s.fences.push(fence)
    const events = drive(s, 4, hopper('police'))
    expect(events.filter((e) => e.who === 'police').map((e) => e.kind)).toEqual(['jump', 'land'])
    expect(fence.hitAt).toBe(-1)
    expect(s.police.x).toBeGreaterThan(fence.x + 2)

    const t = emptyStreet()
    const wall = { id: t.nextId++, x: POLICE_AT, hitAt: -1 }
    t.fences.push(wall)
    let slowest = Infinity
    drive(t, 4, (t) => {
      if (wall.hitAt >= 0) slowest = Math.min(slowest, t.police.speed)
    })
    expect(wall.hitAt).toBeGreaterThan(0)
    expect(t.police.crashKind).toBe('bonk')
    expect(slowest).toBeLessThan(CRASH_SPEED + 0.5)
    expect(t.police.speed).toBeGreaterThan(POLICE_SPEED - 0.5)
  })

  it('one stumble at a time: a fence and a crate right after each other cost one crash, and both go', () => {
    const s = emptyStreet()
    const fence = { id: s.nextId++, x: POLICE_AT, hitAt: -1 }
    s.fences.push(fence)
    const crate = box(s, 'robber', 'banana', POLICE_AT + 2)
    const events = drive(s, 5)
    expect(events.filter((e) => e.kind === 'crash').length).toBe(1)
    expect(fence.hitAt).toBeGreaterThan(0)
    expect(crate.hitAt).toBeGreaterThan(fence.hitAt)
    expect(crate.opened).toBe(false)
  })

  it('the sprint pushes past cruising until the tank runs dry and refills while off; slowing down holds well under cruising', () => {
    const s = emptyStreet()
    drive(s, 3)
    setThrottle(s, 'robber', 1)
    drive(s, 1.5)
    expect(s.robber.turboOn).toBe(true)
    expect(s.robber.speed).toBeGreaterThan(ROBBER_SPEED * (TURBO_FACTOR - 0.05))
    expect(s.police.speed).toBeLessThan(POLICE_SPEED + 0.2)
    drive(s, TURBO_MAX)
    expect(s.robber.turbo).toBeLessThan(TURBO_MAX / TURBO_BOLTS)
    expect(s.robber.turboOn).toBe(false)
    expect(s.robber.speed).toBeLessThan(ROBBER_SPEED + 0.5)
    setThrottle(s, 'robber', 0)
    drive(s, 5)
    expect(s.robber.turbo).toBeGreaterThan(1)
    setThrottle(s, 'police', -1)
    drive(s, 1.5)
    expect(s.police.speed).toBeLessThan(POLICE_SPEED * (BRAKE_FACTOR + 0.05))
    setThrottle(s, 'police', 0)
    drive(s, 3)
    expect(s.police.speed).toBeGreaterThan(POLICE_SPEED - 0.5)
  })
})

describe('crates', () => {
  it('a runner pops its own crate on touch and gets the surprise', () => {
    const s = emptyStreet()
    const crate = box(s, 'police', 'skates', POLICE_AT)
    const events = drive(s, 3)
    expect(events.filter((e) => e.who === 'police').map((e) => e.kind)).toEqual(['pop'])
    expect(crate.opened).toBe(true)
    expect(s.police.got).toBe('skates')
    expect(s.police.crashedAt).toBe(-1)
  })

  it('the other runner knocks it away from the side with a stumble, or lands on top and stands there', () => {
    const s = emptyStreet()
    const crate = box(s, 'robber', 'banana', POLICE_AT)
    const events = drive(s, 3)
    expect(events.filter((e) => e.who === 'police').map((e) => e.kind)).toEqual(['knock', 'crash', 'land'])
    expect(crate.opened).toBe(false)

    const t = emptyStreet()
    drive(t, 1.5)
    const top = box(t, 'robber', 'banana', t.police.x + 10)
    let stood = false
    let pressed = false
    drive(t, 5, (t) => {
      const r = t.police
      // Late enough that the runner is still coming down over the crate: below crate height right over its middle.
      if (!pressed && r.onGround && top.x - r.x <= r.speed * JUMP_TIME * 0.86) {
        pressJump(t, 'police')
        pressed = true
      }
      if (r.onGround && r.y === BOX_H) stood = true
    })
    expect(stood).toBe(true)
    expect(top.hitAt).toBe(-1)
    expect(t.police.crashedAt).toBe(-1)
    expect(t.police.y).toBe(0)
    expect(t.police.x).toBeGreaterThan(top.x + 5)
  })
})

describe('surprises', () => {
  it('propeller: the robber flies high and fast over the fence, and comes down when it runs out', () => {
    const s = emptyStreet()
    box(s, 'robber', 'propeller', ROBBER_AT)
    const fence = { id: s.nextId++, x: 48, hitAt: -1 }
    s.fences.push(fence)
    const events = drive(s, 1.5)
    expect(events.map((e) => e.kind)).toContain('fly')
    drive(s, 2)
    expect(Math.abs(s.robber.y - FLY_H)).toBeLessThan(0.3)
    expect(s.robber.speed).toBeGreaterThan(ROBBER_SPEED * (FLY_FACTOR - 0.05))
    drive(s, FLY_FOR - 2 + 0.7)
    expect(fence.hitAt).toBe(-1)
    expect(s.robber.x).toBeGreaterThan(fence.x)
    expect(s.robber.crashedAt).toBe(-1)
    expect(s.robber.y).toBe(0)
    expect(s.robber.onGround).toBe(true)
    expect(s.phase).toBe('chase')
  })

  it('springs: jumps go much higher and longer', () => {
    const s = emptyStreet()
    box(s, 'robber', 'springs', ROBBER_AT)
    drive(s, 2)
    expect(s.robber.got).toBe('springs')
    pressJump(s, 'robber')
    let top = 0
    let airborne = 0
    const events = drive(s, 3, (s) => {
      top = Math.max(top, s.robber.y)
      if (!s.robber.onGround) airborne += DT
    })
    expect(events.map((e) => e.kind)).toContain('boing')
    expect(top).toBeGreaterThan(JUMP_HEIGHT * 2)
    expect(airborne).toBeGreaterThan(JUMP_TIME * 1.4)
  })

  it('skates: the police runs faster without the sprint, then slows back down', () => {
    const s = emptyStreet(WIDE + 2)
    box(s, 'police', 'skates', POLICE_AT)
    drive(s, 4.5)
    expect(s.police.turboOn).toBe(false)
    expect(s.police.speed).toBeGreaterThan(POLICE_SPEED * (SKATES_FACTOR - 0.05))
    drive(s, 6)
    expect(s.phase).toBe('chase')
    expect(s.police.speed).toBeLessThan(POLICE_SPEED + 0.3)
    expect(s.police.speed).toBeGreaterThan(POLICE_SPEED - 0.3)
  })

  it('whistle: the robber stops dead for a moment, then runs on', () => {
    const s = emptyStreet(WIDE)
    box(s, 'police', 'whistle', POLICE_AT)
    driveUntil(s, 'whistle', 3)
    drive(s, 0.6)
    expect(s.robber.speed).toBeLessThan(0.5)
    drive(s, FREEZE_FOR + 1.5)
    expect(s.phase).toBe('chase')
    expect(s.robber.speed).toBeGreaterThan(ROBBER_SPEED * 0.9)
  })

  it('magnet: the robber is dragged to half speed for a moment', () => {
    const s = emptyStreet(WIDE)
    box(s, 'police', 'magnet', POLICE_AT)
    drive(s, 3.5)
    expect(Math.abs(s.robber.speed - ROBBER_SPEED * MAGNET_SLOW)).toBeLessThan(0.3)
    drive(s, 4)
    expect(s.phase).toBe('chase')
    expect(s.robber.speed).toBeGreaterThan(ROBBER_SPEED - 0.3)
  })

  it('banana: the peel lands behind the robber and the police slips on it', () => {
    const s = emptyStreet()
    box(s, 'robber', 'banana', ROBBER_AT)
    drive(s, 1.5)
    expect(s.bananas.length).toBe(1)
    const peel = s.bananas[0]!
    expect(peel.x).toBeLessThan(s.robber.x)
    const events = drive(s, 4)
    expect(events.filter((e) => e.kind === 'crash').map((e) => e.who)).toEqual(['police'])
    expect(s.police.crashKind).toBe('banana')
    expect(peel.slippedAt).toBeGreaterThan(0)
  })

  it('police dog: runs ahead, grabs a robber on the ground and hangs on, then goes back to the officer', () => {
    const s = emptyStreet(WIDE)
    box(s, 'police', 'dog', POLICE_AT)
    driveUntil(s, 'pop', 3)
    const dog = s.dogs[0]!
    expect(dog.kind).toBe('police')
    expect(driveUntil(s, 'bark', 6).who).toBe('robber')
    expect(dog.state).toBe('latched')
    drive(s, 1)
    expect(Math.abs(s.robber.speed - ROBBER_SPEED * POLICE_DOG_SLOW)).toBeLessThan(0.3)
    pressJump(s, 'robber')
    drive(s, 0.3)
    expect(dog.state).toBe('latched')
    expect(driveUntil(s, 'yelp', POLICE_DOG_HOLD).who).toBe('robber')
    drive(s, 3)
    expect(s.dogs.length).toBe(0)
    expect(s.phase).toBe('chase')
  })

  it('police dog: runs right under a robber in the air and gives up', () => {
    const s = emptyStreet(WIDE)
    box(s, 'police', 'dog', POLICE_AT)
    const events = drive(s, 8, hopper('robber'))
    expect(events.map((e) => e.kind)).not.toContain('bark')
    expect(events.filter((e) => e.kind === 'jump' && e.who === 'robber').length).toBeGreaterThan(0)
    expect(s.dogs.length).toBe(0)
  })

  it('bone: the dog on the robber lets go, and dogs leave the robber alone for a while', () => {
    const s = emptyStreet()
    const first = yardDog(s, START_GAP + 10, START_GAP - 2, START_GAP + 22)
    const second = yardDog(s, START_GAP + 40, START_GAP + 24, START_GAP + 60)
    expect(driveUntil(s, 'bark', 3).who).toBe('robber')
    expect(first.on).toBe('robber')
    box(s, 'robber', 'bone', s.robber.x + 3)
    driveUntil(s, 'pop', 2)
    expect(s.robber.got).toBe('bone')
    expect(first.on).toBe(null)
    expect(first.state).toBe('home')
    const events = drive(s, 6)
    const barks = events.filter((e) => e.kind === 'bark').map((e) => e.who)
    expect(barks.length).toBeGreaterThan(0)
    expect(barks.every((who) => who === 'police')).toBe(true)
    expect(second.on).toBe(null)
    expect(s.robber.x).toBeGreaterThan(second.x)
  })
})

describe('the town', () => {
  it('lays yards with a house, a fence at the end, sometimes a crate and a dog, and a road every few yards, ahead of the runners; drops what is behind', () => {
    const roles = new Set<Role>()
    let roads = 0
    let dogs = 0
    let houses = 0
    const { s } = run(5, 120, { police: hopper('police'), robber: hopper('robber') }, (s) => {
      const lead = Math.max(s.police.x, s.robber.x)
      expect(s.builtTo).toBeGreaterThanOrEqual(lead + SPAWN_AHEAD)
      const behind = s.police.x - 20 - ROAD_HALF_W
      for (const list of [s.houses, s.fences, s.boxes, s.roads, s.bananas]) {
        expect(list.length).toBeLessThan(20)
        for (const item of list) expect(item.x).toBeGreaterThanOrEqual(behind)
      }
      for (const b of s.boxes) roles.add(b.role)
      roads = Math.max(roads, s.roads.length)
      dogs = Math.max(dogs, s.dogs.length)
      houses = Math.max(houses, s.houses.length)
    })
    expect(roles.size).toBe(2)
    expect(roads).toBeGreaterThan(0)
    expect(dogs).toBeGreaterThan(0)
    expect(houses).toBeGreaterThan(1)
    expect(s.fences.every((f, i) => i === 0 || f.x - s.fences[i - 1]!.x >= YARD_W)).toBe(true)
  })

  it('the robber takes the money at each house once; the police never does', () => {
    const taken = new Set<number>()
    let dropped = 0
    const { s, counts } = run(6, 120, { police: hopper('police'), robber: hopper('robber') }, (s) => {
      if (s.phase === 'caught' && s.time === s.phaseAt) dropped += s.droppedCoins
      for (const h of s.houses) {
        if (h.takenAt >= 0) taken.add(h.id)
        expect(h.money).toBe(h.takenAt < 0)
      }
    })
    expect(counts.coin).toBeGreaterThan(5)
    expect(taken.size).toBe(counts.coin)
    expect(s.coins).toBe(counts.coin! + (counts.escaped ?? 0) * ESCAPE_BONUS - dropped)
  })

  it('a yard dog charges a runner in its yard, bites one on the ground and hangs on until a jump shakes it off, then trots home', () => {
    const s = emptyStreet(WIDE)
    const dog = yardDog(s, 16, 0.8, 23.2)
    const events = drive(s, 2.5)
    expect(events.filter((e) => e.kind === 'bark').map((e) => e.who)).toEqual(['police'])
    expect(dog.state).toBe('latched')
    expect(dog.on).toBe('police')
    expect(Math.abs(s.police.speed - POLICE_SPEED * DOG_SLOW)).toBeLessThan(0.5)
    pressJump(s, 'police')
    const later = drive(s, 3)
    expect(later.map((e) => e.kind)).toContain('yelp')
    expect(dog.on).toBe(null)
    expect(dog.state).toBe('guard')
    expect(dog.x).toBe(dog.rest)
    expect(s.police.speed).toBeGreaterThan(POLICE_SPEED - 0.5)
  })

  it('a yard dog is jumped: it runs under the runner, and never chases anyone who is past it', () => {
    const s = emptyStreet(WIDE)
    const dog = yardDog(s, 16, 0.8, 23.2)
    const events = drive(s, 3, hopper('police'))
    expect(events.map((e) => e.kind)).not.toContain('bark')
    expect(s.police.x).toBeGreaterThan(dog.x + 3)
    expect(dog.x).toBeLessThan(s.police.x)
  })

  it('cars cross the road and hit a runner standing in the lane, not one in the air over car height', () => {
    for (const jumping of [false, true]) {
      const s = emptyStreet()
      const road = { id: s.nextId++, x: POLICE_AT + 2, cars: [] as RoadCar[], nextCarAt: Infinity }
      s.roads.push(road)
      const laneX = road.x - LANE
      let planted = false
      let heightAtCar = -1
      const events = drive(s, 4, (s) => {
        const r = s.police
        if (jumping && r.onGround && laneX - r.x <= jumpLead(r.speed)) pressJump(s, 'police')
        if (!planted && Math.abs(r.x - laneX) < 0.3) {
          planted = true
          road.cars.push({ id: s.nextId++, lane: -1, z: 0, vz: 10, style: 0 })
          heightAtCar = r.y
        }
      })
      expect(planted).toBe(true)
      if (jumping) {
        expect(heightAtCar).toBeGreaterThan(CAR_H)
        expect(events.map((e) => e.kind)).not.toContain('honk')
      } else {
        expect(events.map((e) => e.kind)).toContain('honk')
        expect(s.police.crashKind).toBe('car')
      }
    }
  })
})

describe('the sim', () => {
  it('resets in place to the state a new sim starts in, keeping the same runners and lists', () => {
    const { s } = run(4, 30, { police: hopper('police'), robber: never })
    const police = s.police
    const fences = s.fences
    expect(s.catches + s.coins).toBeGreaterThan(0)
    resetSim(s, mulberry32(4))
    const fresh = createSim(mulberry32(4))
    expect({ ...s, random: null }).toEqual({ ...fresh, random: null })
    expect(s.police).toBe(police)
    expect(s.fences).toBe(fences)
  })

  it('stays finite and small over a long run with both players mashing everything', () => {
    const mash = (role: Role): Driver => (s) => {
      if (s.random() < 0.03) pressJump(s, role)
      if (s.random() < 0.01) setThrottle(s, role, ([-1, 0, 1] as const)[Math.floor(s.random() * 3)]!)
    }
    const { s, counts } = run(9, 600, { police: mash('police'), robber: mash('robber') }, (s) => {
      expect(s.dogs.length).toBeLessThan(12)
      for (const road of s.roads) expect(road.cars.length).toBeLessThan(10)
      for (const d of s.dogs) if (d.state === 'latched') expect(s[d.on!].y).toBeLessThan(DOG_H + 3)
    })
    for (const r of [s.police, s.robber]) for (const v of [r.x, r.y, r.speed, r.turbo]) expect(Number.isFinite(v)).toBe(true)
    expect(counts.pop).toBeGreaterThan(3)
    expect(counts.caught).toBeGreaterThan(0)
  })
})
