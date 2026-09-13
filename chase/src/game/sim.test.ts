/**
 * Runs the chase in node for minutes at a time, in both roles, with three kinds of
 * driver at the wheel of the player's car. The other car has no driver: it must clear
 * every obstacle on its own.
 */
import { describe, expect, it } from 'vitest'

import { DAY_LENGTH, night } from './daylight'
import { mulberry32 } from './random'
import {
  CATCH_GAP,
  JUMP_BUFFER,
  NIGHT_BOOST,
  OBSTACLE_H,
  PLAYER_SPEED,
  START_GAP_POLICE,
  TURBO_BOLTS,
  TURBO_FACTOR,
  TURBO_MAX,
  BRAKE_FACTOR,
  AI_HURRY,
  AI_ROBBER_SPEED,
  WORM_SLOW,
  WORM_SPAWN_MIN,
  WORM_STAY,
  createSim,
  jumpLeadFor,
  nextObstacle,
  overlaps,
  player,
  pressJump,
  resetSim,
  setThrottle,
  tick,
  type EventKind,
  type Role,
  type Sim,
} from './sim'

const DT = 1 / 60

/** Drives `seconds` of the chase at 60 Hz; `drive` is called before each tick and may press jump. */
function run(role: Role, seed: number, seconds: number, drive: (s: Sim) => void, watch: (s: Sim) => void = () => {}) {
  const s = createSim(mulberry32(seed), role)
  pressJump(s)
  const counts: Partial<Record<EventKind, number>> = {}
  let maxGap = 0
  for (let t = 0; t < seconds; t += DT) {
    drive(s)
    tick(s, DT)
    for (const e of s.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1
    s.events.length = 0
    maxGap = Math.max(maxGap, s.robber.x - s.police.x)
    watch(s)
  }
  return { s, counts, maxGap }
}

const never = () => {}

/** Presses at the ideal moment: the next obstacle exactly one jump lead ahead, at the closing speed. */
function perfect(s: Sim) {
  const me = player(s)
  if (s.phase !== 'chase' || me.y > 0) return
  const o = nextObstacle(s, me)
  if (o && o.x - me.x <= jumpLeadFor(me, o)) pressJump(s)
}

/** The car that drives itself is never low over an obstacle still standing on the road: checked every tick. */
function clearsEverything(role: Role) {
  const ai = (s: Sim) => (role === 'police' ? s.robber : s.police)
  return (s: Sim) => {
    for (const o of s.obstacles) {
      if (o.hitAt < 0 && overlaps(ai(s), o)) expect(ai(s).y, `${role === 'police' ? 'robber' : 'police'} over obstacle ${o.id} at t=${s.time.toFixed(2)}`).toBeGreaterThan(OBSTACLE_H)
    }
  }
}

describe('playing as the police', () => {
  it('the robber clears every obstacle, at chase speed and at turbo', () => {
    for (const seed of [1, 2, 3]) run('police', seed, 300, perfect, clearsEverything('police'))
    run('police', 4, 300, never, clearsEverything('police'))
  })

  it('a perfect driver catches the robber many times and never crashes', () => {
    const { counts, s } = run('police', 7, 120, perfect)
    expect(counts.crash).toBeUndefined()
    expect(s.catches).toBeGreaterThanOrEqual(6)
    expect(s.escapes).toBe(0)
    expect(counts.caught).toBe(s.catches)
    expect(counts.escape).toBeGreaterThanOrEqual(s.catches - 1)
  })

  it('a driver who never jumps crashes, slows down, and still catches the robber', () => {
    const { counts, s, maxGap } = run('police', 11, 180, never)
    expect(counts.crash).toBeGreaterThan(5)
    expect(s.catches).toBeGreaterThanOrEqual(3)
    // The robber stays in the picture: past the starting gap it eases off, however many worms ride along.
    expect(maxGap).toBeLessThan(START_GAP_POLICE + 14)
  })
})

describe('playing as the robber', () => {
  it('the police car clears every obstacle, at chase speed and at turbo', () => {
    for (const seed of [1, 2, 3]) run('robber', seed, 300, perfect, clearsEverything('robber'))
    run('robber', 4, 300, never, clearsEverything('robber'))
  })

  it('a perfect driver pulls clear again and again and is never caught', () => {
    const { counts, s } = run('robber', 7, 120, perfect)
    expect(counts.crash).toBeUndefined()
    expect(s.escapes).toBeGreaterThanOrEqual(6)
    expect(s.catches).toBe(0)
    expect(counts.regroup).toBeGreaterThanOrEqual(s.escapes - 1)
  })

  it('a driver who never jumps gets caught, and then gets away to try again', () => {
    const { counts, s } = run('robber', 11, 120, never)
    expect(counts.crash).toBeGreaterThan(5)
    expect(s.catches).toBeGreaterThanOrEqual(2)
    expect(counts.escape).toBeGreaterThanOrEqual(1)
  })
})

/** Holds the turbo down whenever there is any in the tank, and jumps perfectly. */
function flooring(s: Sim) {
  setThrottle(s, s.turbo > 0.01 ? 1 : 0)
  perfect(s)
}

describe('the throttle', () => {
  it('turbo pushes the player past cruising until the tank runs dry, and the tank refills while it is off', () => {
    const s = createSim(mulberry32(1), 'police')
    pressJump(s)
    const drive = (seconds: number) => {
      for (let t = 0; t < seconds; t += DT) {
        perfect(s)
        tick(s, DT)
      }
    }
    drive(3)
    setThrottle(s, 1)
    drive(1.5)
    expect(s.turboOn).toBe(true)
    expect(s.police.speed).toBeGreaterThan(PLAYER_SPEED * (TURBO_FACTOR - 0.05))
    // The robber hears it and hurries.
    expect(s.robber.speed).toBeCloseTo(AI_ROBBER_SPEED * AI_HURRY, 1)
    drive(TURBO_MAX)
    // Run dry, it stays off until a whole bolt is back, however hard the pedal is held.
    expect(s.turbo).toBeLessThan(TURBO_MAX / TURBO_BOLTS)
    expect(s.turboOn).toBe(false)
    expect(s.police.speed).toBeLessThan(PLAYER_SPEED + 0.5)
    setThrottle(s, 0)
    drive(5)
    expect(s.turbo).toBeGreaterThan(1)
  })

  it('the brake holds the player well under cruising, and lets go when released', () => {
    const s = createSim(mulberry32(1), 'police')
    pressJump(s)
    const drive = (seconds: number) => {
      for (let t = 0; t < seconds; t += DT) {
        perfect(s)
        tick(s, DT)
      }
    }
    drive(3)
    setThrottle(s, -1)
    drive(1.5)
    expect(s.police.speed).toBeLessThan(PLAYER_SPEED * (BRAKE_FACTOR + 0.05))
    setThrottle(s, 0)
    drive(3)
    expect(s.police.speed).toBeGreaterThan(PLAYER_SPEED - 0.5)
  })

  it('a crash at turbo is a bigger crash', () => {
    const s = createSim(mulberry32(2), 'police')
    pressJump(s)
    setThrottle(s, 1)
    let crashed = false
    for (let t = 0; t < 30 && !crashed; t += DT) {
      setThrottle(s, s.turbo > 0.01 ? 1 : 0)
      tick(s, DT)
      crashed = s.events.some((e) => e.kind === 'crash')
      s.events.length = 0
    }
    expect(crashed).toBe(true)
    expect(s.crashPower).toBeGreaterThan(1)
  })

  it('flooring it still leaves the chase to the jumps: the other car clears everything and the loop goes on', () => {
    for (const role of ['police', 'robber'] as const) {
      const { s, counts } = run(role, 21, 240, flooring, clearsEverything(role))
      expect(counts.crash).toBeUndefined()
      expect(role === 'police' ? s.catches : s.escapes).toBeGreaterThan(6)
    }
  })
})

describe('the night', () => {
  it('runs faster: the player at NIGHT_BOOST times top speed in a midnight chase, back to normal by day', () => {
    let atNight = 0
    let byDay = 0
    run('police', 2, 2 * DAY_LENGTH, perfect, (s) => {
      if (s.phase !== 'chase' || s.time < 5) return
      if (night(s.time) > 0.999) atNight = Math.max(atNight, s.police.speed)
      if (night(s.time) < 0.001) byDay = Math.max(byDay, s.police.speed)
    })
    expect(Math.abs(atNight - PLAYER_SPEED * NIGHT_BOOST)).toBeLessThan(0.2)
    expect(Math.abs(byDay - PLAYER_SPEED)).toBeLessThan(0.2)
  })

  it('brings the worms: none by day, a mix at dusk and dawn, nothing else at full dark', () => {
    const tally = { dusk: { worm: 0, other: 0 } }
    run('robber', 6, 6 * DAY_LENGTH, perfect, (s) => {
      const newest = s.obstacles[s.obstacles.length - 1]
      if (!newest || newest.id !== s.nextId - 1 || newest.x < s.robber.x + 25) return
      const n = night(s.time)
      const worm = newest.kind === 'worm'
      if (n === 0) expect(worm).toBe(false)
      else if (n > 0.99) expect(worm).toBe(true)
      else if (n > 0.15 && n < 0.6) tally.dusk[worm ? 'worm' : 'other'] += 1
    })
    expect(tally.dusk.worm).toBeGreaterThan(2)
    expect(tally.dusk.other).toBeGreaterThan(2)
  })

  it('has the worms crawl toward the cars, keeping their order on the road', () => {
    const seen = new Map<number, number>()
    run('police', 6, 2 * DAY_LENGTH, perfect, (s) => {
      for (const o of s.obstacles) {
        const before = seen.get(o.id)
        if (before !== undefined) {
          if (o.kind === 'worm') expect(o.x).toBeLessThan(before)
          else expect(o.x).toBe(before)
        }
        seen.set(o.id, o.x)
      }
      for (let i = 1; i < s.obstacles.length; i++) expect(s.obstacles[i]!.x - s.obstacles[i - 1]!.x).toBeGreaterThan(WORM_SPAWN_MIN - 8)
    })
    expect(seen.size).toBeGreaterThan(20)
  })

  it('lets a worm into a car that drives through it, which slows the car until a jump flings the worm out', () => {
    const s = createSim(mulberry32(8), 'police')
    pressJump(s)
    let wormIn = false
    for (let t = 0; t < 4 * DAY_LENGTH && !wormIn; t += DT) {
      tick(s, DT)
      wormIn = s.events.some((e) => e.kind === 'wormIn')
      s.events.length = 0
    }
    expect(wormIn).toBe(true)
    expect(s.wormAt).toBeGreaterThanOrEqual(0)
    expect(s.crashedAt).toBeLessThan(s.wormAt)
    for (let t = 0; t < 2; t += DT) tick(s, DT)
    expect(s.wormAt).toBeGreaterThanOrEqual(0)
    const boost = 1 + (NIGHT_BOOST - 1) * night(s.time)
    expect(s.police.speed).toBeLessThan(PLAYER_SPEED * boost * (WORM_SLOW + 0.05))
    s.events.length = 0
    pressJump(s)
    tick(s, DT)
    expect(s.events.map((e) => e.kind)).toContain('wormOut')
    expect(s.wormAt).toBe(-1)
    expect(s.wormOutAt).toBe(s.time)
  })

  it('has the worm hop off by itself after WORM_STAY if nobody jumps', () => {
    const { counts } = run('police', 8, 4 * DAY_LENGTH, never, (s) => {
      if (s.wormAt >= 0) expect(s.time - s.wormAt).toBeLessThanOrEqual(WORM_STAY + DT)
    })
    // A second worm climbing in while one is aboard just takes its place, so there can be more ins than outs.
    expect(counts.wormOut).toBeGreaterThan(2)
    expect(counts.wormOut).toBeLessThanOrEqual(counts.wormIn!)
  })
})

describe('the sim', () => {
  it('never lets the player crash into the same obstacle twice', () => {
    const { s, counts } = run('police', 5, 200, never, (s) => {
      for (const o of s.obstacles) if (o.hitAt >= 0) expect(o.hitAt).toBeLessThanOrEqual(s.time)
    })
    expect(counts.crash).toBeLessThanOrEqual(s.nextId - 1)
  })

  it('waits in the ready phase until the first press, which is also the first jump', () => {
    const s = createSim(mulberry32(1), 'robber')
    for (let i = 0; i < 60; i++) tick(s, DT)
    expect(s.phase).toBe('ready')
    expect(s.police.x).toBe(0)
    pressJump(s)
    tick(s, DT)
    expect(s.phase).toBe('chase')
    expect(s.robber.y).toBeGreaterThan(0)
    expect(s.police.y).toBe(0)
    expect(s.events).toEqual([
      { kind: 'start', car: 'robber' },
      { kind: 'jump', car: 'robber' },
    ])
  })

  it('remembers a press made in the air for the jump buffer, and fires it on landing', () => {
    const s = createSim(mulberry32(1), 'police')
    pressJump(s)
    tick(s, DT)
    // Press half a buffer before the car lands; the jump must fire the tick it touches down.
    let landed = false
    let pressedAt = -1
    while (!landed) {
      if (pressedAt < 0 && s.police.vy < 0 && s.police.y < 0.6) {
        pressJump(s)
        pressedAt = s.time
      }
      tick(s, DT)
      landed = s.events.some((e) => e.kind === 'land' && e.car === 'police')
      s.events.length = 0
    }
    expect(s.time - pressedAt).toBeLessThan(JUMP_BUFFER)
    tick(s, DT)
    expect(s.events.map((e) => e.kind)).toEqual(['jump'])
  })

  it('locks the cars bumper to bumper while caught and settled on the ground, then lets the robber escape to the starting gap', () => {
    const { s } = run('police', 3, 60, perfect, (s) => {
      const settled = s.time - Math.max(s.phaseAt, s.police.landedAt, s.robber.landedAt) > 0.6
      if (s.phase === 'caught' && s.police.y === 0 && s.robber.y === 0 && settled) expect(s.robber.x - s.police.x).toBeCloseTo(CATCH_GAP, 1)
    })
    expect(s.phase).not.toBe('ready')
    expect(s.obstacles.every((o, i) => i === 0 || o.x > s.obstacles[i - 1]!.x)).toBe(true)
  })

  it('resets in place to the state a new sim starts in, keeping the same cars and lists', () => {
    const { s } = run('police', 4, 30, perfect)
    const police = s.police
    const obstacles = s.obstacles
    expect(s.catches).toBeGreaterThan(0)
    resetSim(s, mulberry32(4), 'robber')
    const fresh = createSim(mulberry32(4), 'robber')
    expect({ ...s, random: null }).toEqual({ ...fresh, random: null })
    expect(s.police).toBe(police)
    expect(s.obstacles).toBe(obstacles)
  })

  it('stays finite over a long run', () => {
    const { s } = run('robber', 9, 600, (s) => {
      if (s.random() < 0.02) pressJump(s)
    })
    for (const v of [s.police.x, s.police.y, s.police.speed, s.robber.x, s.robber.y, s.robber.speed]) expect(Number.isFinite(v)).toBe(true)
    expect(s.obstacles.length).toBeLessThan(10)
  })
})
