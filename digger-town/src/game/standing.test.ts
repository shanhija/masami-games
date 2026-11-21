import { describe, expect, it } from 'vitest'
import { BUILD_HALF, OBSTACLES, RIVER } from './map'
import { EDGE, ROUTE_RADIUS, route, standingGrid } from './machines'
import { MACHINE_KINDS, type Goal, type Sim } from './model'
import { STORY } from './jobs'
import { createSim } from './sim'
import { createWorld } from './world'

const SIDE = 96

const newSim = (storyDone: number): Sim => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 1, lastTemplate: -1 })

/** What a machine of body radius `own` must keep clear of, found the plain way: every cell tried against every thing. */
function bruteGrid(s: Sim, own: number): Uint8Array {
  const mid = (RIVER.z0 + RIVER.z1) / 2
  const hz = (RIVER.z1 - RIVER.z0) / 2
  const rivers: [number, number, number, number][] = []
  let from = -400
  for (const d of s.decks.filter((d) => d.z0 <= RIVER.z0 && d.z1 >= RIVER.z1).sort((p, q) => p.x0 - q.x0)) {
    rivers.push([(from + d.x0) / 2, mid, (d.x0 - from) / 2, hz])
    from = d.x1
  }
  rivers.push([(from + 400) / 2, mid, (400 - from) / 2, hz])
  const inBox = (x: number, z: number, cx: number, cz: number, hx: number, hzz: number, yaw: number) => {
    const lx = (x - cx) * Math.cos(yaw) - (z - cz) * Math.sin(yaw)
    const lz = (x - cx) * Math.sin(yaw) + (z - cz) * Math.cos(yaw)
    return Math.abs(lx) < hx + own && Math.abs(lz) < hzz + own
  }
  const builds = s.builds.filter((b) => b.placed > 0 && b.kind !== 'bridge')
  const grid = new Uint8Array(SIDE * SIDE)
  for (let i = 0; i < grid.length; i++) {
    const x = (i % SIDE) - SIDE / 2 + 0.5
    const z = Math.floor(i / SIDE) - SIDE / 2 + 0.5
    let hit = Math.abs(x) > EDGE - own || Math.abs(z) > EDGE - own
    for (const [ox, oz, or] of OBSTACLES) hit ||= Math.hypot(x - ox, z - oz) < or + own
    for (const b of builds) hit ||= inBox(x, z, b.x, b.z, BUILD_HALF[b.kind][0], BUILD_HALF[b.kind][1], b.yaw)
    for (const [bx, bz, hx, hzz] of rivers) hit ||= inBox(x, z, bx, bz, hx, hzz, 0)
    grid[i] = hit ? 1 : 0
  }
  return grid
}

const radii = [...new Set(Object.values(ROUTE_RADIUS))]

describe('the grid of standing things', () => {
  it('has the body radii of the nine machines, a few distinct ones', () => {
    expect(MACHINE_KINDS.every((k) => ROUTE_RADIUS[k] > 1)).toBe(true)
    expect(radii.length).toBeGreaterThan(3)
  })

  it('equals a grid of every cell against every thing, for every radius and every state of the story', () => {
    let withBuilds = 0
    let withDeck = 0
    for (let done = 0; done <= STORY.length; done++) {
      const s = newSim(done)
      if (s.builds.some((b) => b.placed > 0 && b.kind !== 'bridge')) withBuilds++
      if (s.decks.length > 0) withDeck++
      for (const own of radii) {
        const grid = standingGrid(s, own)
        const brute = bruteGrid(s, own)
        let wrong = 0
        for (let i = 0; i < grid.length; i++) if (grid[i] !== brute[i]) wrong++
        expect(wrong, `after ${done} jobs, radius ${own}`).toBe(0)
      }
    }
    // The states of the story cover a town with builds and one with a deck over the river.
    expect(withBuilds).toBeGreaterThan(2)
    expect(withDeck).toBeGreaterThan(0)
  })

  it('equals the plain grid for builds turned to any angle, at any place, of every size', () => {
    const s = createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 1 })
    s.builds.forEach((b, i) => {
      b.placed = b.spots.length
      b.x = -30 + i * 9.3
      b.z = -20 + i * 7.1
      b.yaw = 0.4 + i * 0.77
    })
    s.decks.push({ x0: 4, x1: 12, z0: RIVER.z0 - 1, z1: RIVER.z1 + 1, y: 1 })
    for (const own of radii) expect(standingGrid(s, own)).toEqual(bruteGrid(s, own))
  })

  it('is kept while the standing things stand, and made again when a build gets a piece, moves, or a deck comes', () => {
    const s = createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 1 })
    const own = radii[0]
    const first = standingGrid(s, own)
    s.time += 5
    s.builds[0].shown = true
    expect(standingGrid(s, own)).toBe(first)
    const house = s.builds.find((b) => b.kind === 'house')
    if (house === undefined) throw new Error('no house')
    house.placed = 1
    const withHouse = standingGrid(s, own)
    expect(withHouse).not.toBe(first)
    expect(withHouse).toEqual(bruteGrid(s, own))
    expect(withHouse.reduce((a, v) => a + v, 0)).toBeGreaterThan(first.reduce((a, v) => a + v, 0))
    house.placed = 2
    expect(standingGrid(s, own)).toBe(withHouse)
    house.x += 5
    expect(standingGrid(s, own)).toEqual(bruteGrid(s, own))
    s.decks.push({ x0: 4, x1: 12, z0: RIVER.z0 - 1, z1: RIVER.z1 + 1, y: 1 })
    expect(standingGrid(s, own)).toEqual(bruteGrid(s, own))
  })

  it('is each sim its own: a copy of a sim has its own grid, and one sim changing does not change the other', () => {
    const a = newSim(0)
    const b = structuredClone(a)
    const own = radii[0]
    const before = standingGrid(b, own).slice()
    const house = a.builds.find((x) => x.kind === 'house')
    if (house === undefined) throw new Error('no house')
    house.placed = 1
    expect(standingGrid(a, own)).not.toEqual(before)
    expect(standingGrid(b, own)).toEqual(before)
  })
})

describe('the way round a standing thing', () => {
  const goal = (x: number, z: number): Goal => ({ x, z, within: 3, reverse: false, thenPress: false, yaw: null, pace: 1 })

  it('turns aside for a goal straight behind a standing build, and keeps straight on when nothing is in the way', () => {
    const s = newSim(STORY.length)
    for (const k of MACHINE_KINDS) s.machines[k].unlocked = k === 'dumper'
    const m = s.machines.dumper
    let turned = 0
    for (const b of s.builds.filter((x) => x.placed > 0 && x.kind !== 'bridge')) {
      // From six metres short of the build's far edge to six metres past its near edge, along the line through its middle.
      const dist = Math.max(...BUILD_HALF[b.kind]) + 6
      for (const [ux, uz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        m.x = b.x - ux * dist
        m.z = b.z - uz * dist
        m.route = null
        const aim = route(s, m, goal(b.x + ux * dist, b.z + uz * dist))
        if (aim === null) continue
        const off = Math.abs(Math.atan2((aim.x - m.x) * uz - (aim.z - m.z) * ux, (aim.x - m.x) * ux + (aim.z - m.z) * uz))
        expect(off, `build ${b.id} from ${ux},${uz}`).toBeGreaterThan(0.05)
        turned++
      }
    }
    expect(turned).toBeGreaterThan(0)
    m.x = 0
    m.z = 0
    m.route = null
    s.time += 1
    expect(route(s, m, goal(0, 3.5))).toBeNull()
  })

  it('answers the same for the same machine and goal for 0.4 s, and plans afresh after', () => {
    const s = newSim(STORY.length)
    const m = s.machines.digger
    m.x = -20
    m.z = 0
    const g = goal(20, 0)
    const first = route(s, m, g)
    const kept = first === null ? null : { x: first.x, z: first.z }
    s.time += 0.2
    const again = route(s, m, g)
    expect(again === null ? null : { x: again.x, z: again.z }).toEqual(kept)
    expect(m.route).not.toBeNull()
    const planned = m.route?.at
    s.time += 0.3
    route(s, m, g)
    expect(m.route?.at).toBeGreaterThan(planned ?? Infinity)
  })
})
