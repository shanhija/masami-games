import { describe, expect, it } from 'vitest'
import { HOLES, RIVER, ROADS, ROCK_PILE, SAND_HILL, SANDPIT } from './map'
import { mulberry32 } from './math'
import { CELL, CHUNKS, GRID, HALF, POINT_AREA, REPOSE, ROAD_Y, SIDE, SURFACE_INDEX, type Terrain } from './model'
import { SETTLE_BUDGET, bladePush, createTerrain, cutBowl, deficitIn, heightAt, kindAt, levelShape, looseAt, looseVolume, markRoadBuilt, pondY, rollOver, setSurface, settle, spill, surplusIn, take } from './terrain'

const at = (ix: number, iz: number) => ix + iz * SIDE
const surfaceOf = (t: Terrain, i: number) => t.hard[i] + t.loose[i]

function settleFully(t: Terrain, maxFrames: number): number {
  let frames = 0
  while (t.settlingCount > 0 && frames < maxFrames) {
    settle(t, SETTLE_BUDGET)
    frames++
  }
  return frames
}

/** The steepest remaining step a point could still pass on, over the repose rise. */
function worstViolation(t: Terrain): number {
  let worst = 0
  for (let iz = 0; iz <= GRID; iz++) {
    for (let ix = 0; ix <= GRID; ix++) {
      const p = at(ix, iz)
      if (t.loose[p] <= 1e-6) continue
      for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]]) {
        const nx = ix + dx
        const nz = iz + dz
        if (nx < 0 || nx > GRID || nz < 0 || nz > GRID) continue
        worst = Math.max(worst, surfaceOf(t, p) - surfaceOf(t, at(nx, nz)) - REPOSE * CELL * Math.hypot(dx, dz))
      }
    }
  }
  return worst
}

/** A flat patch 40 by 20 m from x -10 to 30 (clear of the sand hill) at height 0: loose stuff 1.2 m deep. */
function flatPatch(): Terrain {
  const t = createTerrain()
  levelShape(t, { kind: 'rect', x: 10, z: 0, w: 40, d: 20 }, 0, 'loose')
  t.settlingCount = 0
  t.isSettling.fill(0)
  return t
}

describe('the valley at creation', () => {
  const t = createTerrain()

  it('has what the map says', () => {
    expect(heightAt(t, SAND_HILL.x, SAND_HILL.z)).toBeCloseTo(SAND_HILL.h, 0)
    expect(kindAt(t, SAND_HILL.x, SAND_HILL.z)).toBe('sand')
    expect(heightAt(t, ROCK_PILE.x, ROCK_PILE.z)).toBeCloseTo(ROCK_PILE.h, 0)
    expect(kindAt(t, ROCK_PILE.x, ROCK_PILE.z)).toBe('rock')
    expect(t.surface[at(0, 0)]).toBe(SURFACE_INDEX.soft)
    expect(looseAt(t, 20, 0)).toBeCloseTo(1.2, 0)
    expect(t.turf[at(96, 96)]).toBe(1)
    expect(t.surface[at((-40 + HALF) / CELL, (30 + HALF) / CELL)]).toBe(SURFACE_INDEX.road)
    expect(t.bed[at((0 + HALF) / CELL, (30 + HALF) / CELL)]).toBe(0)
    expect(t.bed[at((8 + HALF) / CELL, (0 + HALF) / CELL)]).toBe(2)
    expect(t.turf[at((0 + HALF) / CELL, (30 + HALF) / CELL)]).toBe(0)
    expect(heightAt(t, 0, (RIVER.z0 + RIVER.z1) / 2)).toBeCloseTo(RIVER.floor, 5)
    expect(t.surface[at(96, (-36.5 + HALF) / CELL)]).toBe(SURFACE_INDEX.riverbed)
  })

  it('holds holes and the sand pit as bowls with no grass', () => {
    for (const h of [...HOLES, SANDPIT]) {
      const rim = heightAt(t, h.x + h.r + 0.5, h.z)
      expect(heightAt(t, h.x, h.z)).toBeLessThan(rim - h.depth + 0.2)
      expect(heightAt(t, h.x, h.z)).toBeGreaterThan(rim - h.depth - 0.2)
      expect(t.turf[at(Math.round((h.x + HALF) / CELL), Math.round((h.z + HALF) / CELL))]).toBe(0)
    }
  })

  it('has nothing to settle: every point on the list changes nothing', () => {
    const hard = t.hard.slice()
    const loose = t.loose.slice()
    t.settling.set(Int32Array.from({ length: SIDE * SIDE }, (_, i) => i))
    t.settlingCount = SIDE * SIDE
    t.isSettling.fill(1)
    settle(t, SIDE * SIDE * 2)
    expect(t.settlingCount).toBe(0)
    expect(t.hard).toEqual(hard)
    expect(t.loose).toEqual(loose)
    expect(worstViolation(t)).toBeLessThanOrEqual(0)
  })

  it('reads safely beyond the edge', () => {
    expect(Number.isFinite(heightAt(t, 1000, -1000))).toBe(true)
    expect(heightAt(t, 1000, 1000)).toBe(heightAt(t, HALF, HALF))
    expect(kindAt(t, -1000, 1000)).toBeTypeOf('string')
    expect(looseAt(t, 500, 0)).toBe(looseAt(t, HALF, 0))
  })

  it('reads every point of the 36 chunks, and every read is finite', () => {
    let reads = 0
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      const x0 = (c % CHUNKS) * 16 - HALF
      const z0 = Math.floor(c / CHUNKS) * 16 - HALF
      for (let iz = 0; iz < 33; iz++) {
        for (let ix = 0; ix < 33; ix++) {
          expect(Number.isFinite(heightAt(t, x0 + ix * CELL, z0 + iz * CELL) + looseAt(t, x0 + ix * CELL, z0 + iz * CELL))).toBe(true)
          reads++
        }
      }
    }
    expect(reads).toBe(CHUNKS * CHUNKS * 33 * 33)
  })

  it('makes a valley that is its own each time: a made one is a copy, so what one does to its ground does not reach the next', () => {
    const a = createTerrain()
    const b = createTerrain()
    expect(b.hard).toEqual(a.hard)
    expect(b.loose).toEqual(a.loose)
    expect(b.turf).toEqual(a.turf)
    expect(b.bed).toEqual(a.bed)
    spill(a, 0, 0, 1.4, 6, 'sand')
    a.packed = 3
    a.version[0] = 99
    const c = createTerrain()
    expect(c.loose).toEqual(b.loose)
    expect(c.settlingCount).toBe(0)
    expect(c.packed).toBe(0)
    expect(c.version[0]).toBe(0)
    expect(c.hard).not.toBe(a.hard)
  })
})

describe('take and spill', () => {
  it('spill adds exactly its volume, weighted to the middle, and sets the kind', () => {
    const t = flatPatch()
    const before = looseVolume(t)
    spill(t, 0, 0, 1.3, 2, 'sand')
    expect(looseVolume(t) - before).toBeCloseTo(2, 4)
    expect(heightAt(t, 0, 0)).toBeGreaterThan(heightAt(t, 0.8, 0))
    expect(heightAt(t, 0, 0)).toBeGreaterThan(0.5)
    expect(heightAt(t, 1.5, 0)).toBe(0)
    expect(kindAt(t, 0, 0)).toBe('sand')
    expect(kindAt(t, 3, 0)).toBe('dirt')
    expect(t.turf[at(96, 96)]).toBe(0)
  })

  it('take digs a bowl, reports its kind, and never goes below the hard level', () => {
    const t = flatPatch()
    spill(t, 0, 0, 1.3, 2, 'rock')
    settleFully(t, 5000)
    const got = take(t, 0, 0, 1.3, 1.5)
    expect(got.amount).toBeCloseTo(1.5, 4)
    expect(got.kind).toBe('rock')
    const hard = t.hard.slice()
    const loose = looseVolume(t)
    const all = take(t, 10, 5, 1.3, 1000)
    expect(all.amount).toBeLessThan(10)
    expect(all.amount).toBeGreaterThan(5)
    expect(all.kind).toBe('dirt')
    expect(looseVolume(t)).toBeCloseTo(loose - all.amount, 4)
    expect(t.hard).toEqual(hard)
    expect(Math.min(...t.loose)).toBeGreaterThanOrEqual(0)
    expect(heightAt(t, 10, 5)).toBeCloseTo(-1.2, 5)
  })

  it('take from bare ground with nothing loose gives nothing', () => {
    const t = createTerrain()
    const got = take(t, -40, 30, 1.3, 2)
    expect(got.amount).toBe(0)
    expect(got.kind).toBe('dirt')
  })
})

describe('settling', () => {
  it('stops after a dump, leaves no slope above repose, and keeps every cubic metre', () => {
    const t = flatPatch()
    const before = looseVolume(t)
    spill(t, 0, 0, 1.4, 6, 'sand')
    expect(t.settlingCount).toBeGreaterThan(0)
    const frames = settleFully(t, 20000)
    expect(t.settlingCount).toBe(0)
    expect(frames).toBeGreaterThan(1)
    expect(worstViolation(t)).toBeLessThanOrEqual(1e-6)
    expect(looseVolume(t)).toBeCloseTo(before + 6, 3)
    expect(heightAt(t, 0, 0)).toBeLessThan(1.6)
    expect(heightAt(t, 0, 0)).toBeGreaterThan(0.5)
  })

  it('is deterministic', () => {
    const run = () => {
      const t = flatPatch()
      spill(t, 1, 2, 1.4, 6, 'gravel')
      settleFully(t, 20000)
      return t
    }
    const a = run()
    const b = run()
    expect(a.loose).toEqual(b.loose)
    expect(a.kind).toEqual(b.kind)
  })

  it('visits no more than its budget of points a frame, so a frame of settling is bounded work whatever the dump', () => {
    /** All at once, or poured out over 2.5 s the way a bed tips; then until it rests. Returns the most points one frame changed. */
    const dump = (t: Terrain, poured: boolean) => {
      let frames = 0
      let most = 0
      if (!poured) spill(t, 0, 0, 1.4, 6, 'sand')
      while ((t.settlingCount > 0 || frames < 150) && frames < 20000) {
        if (poured && frames < 150) spill(t, 0, 0, 1.4, 6 / 150, 'sand')
        const before = t.loose.slice()
        settle(t, SETTLE_BUDGET)
        let changed = 0
        for (let i = 0; i < before.length; i++) if (t.loose[i] !== before[i]) changed++
        most = Math.max(most, changed)
        frames++
      }
      expect(frames).toBeLessThan(20000)
      return most
    }
    // A visited point hands stuff to up to eight neighbours and changes itself: nine points at most.
    for (const poured of [false, true]) expect(dump(flatPatch(), poured)).toBeLessThanOrEqual(9 * SETTLE_BUDGET)
  })
})

describe('the blade', () => {
  it('takes nothing from flat ground', () => {
    const t = flatPatch()
    const loose = t.loose.slice()
    expect(bladePush(t, -5, 0, 1, 0, 3.6, 1, 0)).toBe(0)
    expect(t.loose).toEqual(loose)
  })

  it('pushes a heap along on flat ground and keeps all of it', () => {
    const t = flatPatch()
    spill(t, 0, 0, 1.4, 3, 'sand')
    settleFully(t, 20000)
    const heap = () => {
      let volume = 0
      let mx = 0
      for (let iz = 0; iz <= GRID; iz++) {
        for (let ix = 0; ix <= GRID; ix++) {
          const x = ix * CELL - HALF
          const z = iz * CELL - HALF
          if (x < -9 || x > 29 || Math.abs(z) > 9) continue
          const h = Math.max(0, surfaceOf(t, at(ix, iz)))
          volume += h * POINT_AREA
          mx += h * POINT_AREA * x
        }
      }
      return { volume, cx: mx / volume }
    }
    expect(heap().volume).toBeCloseTo(3, 3)
    const start = heap().cx
    let moved = 0
    for (let step = 0; step < 220; step++) {
      moved += bladePush(t, -4 + step * 0.08, 0, 1, 0, 3.6, 1, 0)
      settle(t, SETTLE_BUDGET)
    }
    settleFully(t, 20000)
    expect(moved).toBeGreaterThan(3)
    expect(heap().volume).toBeCloseTo(3, 3)
    expect(heap().cx).toBeGreaterThan(start + 5)
  })
})

describe('rolling', () => {
  const bedPoint = (x: number, z: number) => at(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL))

  it('turns a road bed into road over a pit', () => {
    const t = createTerrain()
    const hole = HOLES[0]
    const i = bedPoint(hole.x, hole.z)
    expect(t.bed[i]).toBe(0)
    expect(surfaceOf(t, i)).toBeLessThan(-0.4)
    let turned = 0
    for (let pass = 0; pass < 2; pass++) for (let x = hole.x - 6; x < hole.x + 6; x += 0.15) turned += rollOver(t, x, hole.z, 1, 0, 7, 0.03)
    expect(turned).toBeGreaterThan(50)
    expect(t.surface[i]).toBe(SURFACE_INDEX.road)
    expect(surfaceOf(t, i)).toBeCloseTo(ROAD_Y, 5)
    expect(t.loose[i]).toBe(0)
    expect(t.rolled[i]).toBe(1)
  })

  it('turns a road bed into road under a heap, which is packed', () => {
    const t = createTerrain()
    const before = looseVolume(t) + t.packed
    spill(t, 0, 30, 1.4, 3, 'sand')
    for (let k = 0; k < 90; k++) {
      rollOver(t, 0, 30, 1, 0, 7, 1 / 30)
      settle(t, SETTLE_BUDGET)
    }
    const i = bedPoint(0, 30)
    expect(t.surface[i]).toBe(SURFACE_INDEX.road)
    expect(surfaceOf(t, i)).toBeCloseTo(ROAD_Y, 1)
    expect(t.packed).toBeGreaterThan(3)
    expect(looseVolume(t) + t.packed).toBeCloseTo(before + 3, 3)
  })

  it('flattens ground off the road without turning it to road', () => {
    const t = flatPatch()
    spill(t, 0, 0, 1.4, 3, 'sand')
    for (let k = 0; k < 30; k++) rollOver(t, 0, 0, 1, 0, 7, 1 / 30)
    expect(heightAt(t, 0, 0)).toBeLessThan(0.3)
    expect(t.packed).toBe(0)
    expect(t.surface[at(96, 96)]).toBe(SURFACE_INDEX.soft)
  })

  it('marking a road built makes every bed point road', () => {
    const t = createTerrain()
    const before = looseVolume(t) + t.packed
    markRoadBuilt(t, 1)
    let beds = 0
    for (let i = 0; i < t.bed.length; i++) {
      if (t.bed[i] !== 1) continue
      beds++
      expect(t.surface[i]).toBe(SURFACE_INDEX.road)
      expect(t.rolled[i]).toBe(1)
    }
    expect(beds).toBeGreaterThan(100)
    expect(looseVolume(t) + t.packed).toBeCloseTo(before, 3)
    expect(ROADS.length).toBe(3)
  })
})

describe('stamps, zones and ponds', () => {
  it('levels a circle and a rectangle and sets the surface', () => {
    const t = createTerrain()
    levelShape(t, { kind: 'rect', x: -3, z: -8, w: 10, d: 8 }, -0.3, 'loose')
    expect(heightAt(t, -3, -8)).toBeCloseTo(-0.3, 5)
    expect(heightAt(t, -3, -8)).toBe(heightAt(t, -6, -6))
    levelShape(t, { kind: 'circle', x: -3, z: -8, r: 2 }, 0.2, 'hard')
    expect(t.loose[at(Math.round((-3 + HALF) / CELL), Math.round((-8 + HALF) / CELL))]).toBe(0)
    setSurface(t, { kind: 'circle', x: -3, z: -8, r: 2 }, 'slab')
    expect(t.surface[at(Math.round((-3 + HALF) / CELL), Math.round((-8 + HALF) / CELL))]).toBe(SURFACE_INDEX.slab)
    expect(heightAt(t, -3, -8)).toBeCloseTo(0.2, 5)
  })

  it('counts surplus above and room below a level', () => {
    const t = flatPatch()
    const zone = { x: 0, z: 0, r: 4 }
    expect(surplusIn(t, zone, 0)).toBe(0)
    expect(deficitIn(t, zone, 0)).toBe(0)
    spill(t, 0, 0, 1.4, 2, 'sand')
    expect(surplusIn(t, zone, 0)).toBeCloseTo(2, 4)
    take(t, 0, 0, 1.4, 4)
    expect(deficitIn(t, zone, 0)).toBeGreaterThan(0)
    expect(surplusIn(t, zone, 0) - deficitIn(t, zone, 0)).toBeCloseTo(-2, 4)
  })

  it('the water rises from the lowest point to the rim', () => {
    const t = flatPatch()
    cutBowl(t, 0, 0, 5.5, 1)
    const pond = { shown: true, x: 0, z: 0, r: 5.5, water: 0 }
    const low = pondY(t, pond)
    expect(low).toBeCloseTo(-1, 1)
    const half = pondY(t, { ...pond, water: 0.5 })
    const full = pondY(t, { ...pond, water: 1 })
    expect(half).toBeGreaterThan(low)
    expect(full).toBeGreaterThan(half)
    expect(full).toBeCloseTo(0, 1)
  })
})

describe('writes', () => {
  const sum = (t: Terrain) => t.version.reduce((a, b) => a + b, 0)
  const bump = (iz: number, ix: number) => {
    const t = createTerrain()
    const before = t.version.slice()
    levelShape(t, { kind: 'circle', x: ix * CELL - HALF, z: iz * CELL - HALF, r: 0.1 }, 5, 'loose')
    const hit: [number, number][] = []
    for (let c = 0; c < CHUNKS * CHUNKS; c++) if (t.version[c] !== before[c]) hit.push([c % CHUNKS, Math.floor(c / CHUNKS)])
    return hit
  }

  it('bumps the chunks whose range grown by one point holds the point', () => {
    expect(bump(10, 10)).toEqual([[0, 0]])
    expect(bump(31, 31)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]])
    expect(bump(40, 33)).toEqual([[0, 1], [1, 1]])
    expect(bump(34, 34)).toEqual([[1, 1]])
    expect(bump(0, 192)).toEqual([[5, 0]])
    expect(bump(96, 95)).toEqual([[2, 2], [3, 2], [2, 3], [3, 3]])
  })

  it('does nothing when nothing changes', () => {
    const t = createTerrain()
    const before = sum(t)
    levelShape(t, { kind: 'circle', x: 0, z: 0, r: 1 }, heightAt(t, 0, 0) + 100, 'loose')
    expect(sum(t)).toBeGreaterThan(before)
    const mid = sum(t)
    setSurface(t, { kind: 'circle', x: 0, z: 0, r: 1 }, 'soft')
    expect(sum(t)).toBe(mid)
  })

  it('clears the grass wherever stuff was lost or gained', () => {
    const t = createTerrain()
    const i = at(60, 60)
    expect(t.turf[i]).toBe(1)
    take(t, 60 * CELL - HALF, 60 * CELL - HALF, 1, 0.5)
    expect(t.turf[i]).toBe(0)
  })
})

describe('the law', () => {
  it('loose stuff, packed stuff and what is held stay the same over minutes of random work', () => {
    const t = createTerrain()
    const random = mulberry32(7)
    const total = () => looseVolume(t) + t.packed + held
    let held = 0
    const start = total()
    const near = (c: number) => (random() * 2 - 1) * c
    for (let step = 0; step < 6000; step++) {
      const x = near(40)
      const z = near(40)
      const roll = random()
      if (roll < 0.25) held += take(t, x, z, 1.3, random() * 2).amount
      else if (roll < 0.45) {
        const give = Math.min(held, random() * 3)
        spill(t, x, z, 1.4, give, 'gravel')
        held -= give
      } else if (roll < 0.6) bladePush(t, x, z, Math.cos(step), Math.sin(step), 3.6, 1, heightAt(t, x, z))
      else if (roll < 0.7) rollOver(t, x / 2, 30, 1, 0, 7, 0.5)
      settle(t, SETTLE_BUDGET)
      if (step % 500 === 0) expect(Math.abs(total() - start)).toBeLessThan(1e-3)
    }
    settleFully(t, 50000)
    expect(Math.abs(total() - start)).toBeLessThan(1e-3)
    expect(Math.min(...t.loose)).toBeGreaterThanOrEqual(0)
    expect(t.packed).toBeGreaterThan(0)
  })
})
