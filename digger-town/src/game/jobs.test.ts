import { describe, expect, it } from 'vitest'
import { BUILDS, BUILD_HALF, FORMS, HOLES, HOME, LOTS, OBSTACLES, PALLET_RING, PLACES, PLANTS, PROPS, RIVER, ROADS, ROAD_WIDTH, SANDPIT, SANDPIT_RING, TIP_RINGS, TOWER_AT } from './map'
import { DUMPER_CAP, MIXER_SAND, REACH_RANGE, SCOOP, TROLLEY_RANGE } from './model'
import type { Job, Sim, Step, Zone } from './model'
import { DELIVERY_RINGS, HILL_RINGS, MORE_HOUSES, MORE_TEMPLATES, STORY, applyDone, machineOf, nextMoreJob, spareSpot, starsFor, templateOf } from './jobs'
import { createSim, stepPointer, stepView } from './sim'
import { craneBase } from './machines'

const newSim = (storyDone = 0) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 11, lastTemplate: -1 })

/** The volume of a bowl the map cuts: 1.498 * depth * r * r. */
const bowl = (h: { r: number; depth: number }) => 1.498 * h.depth * h.r * h.r

const holeAt = (z: Zone) => [...HOLES, SANDPIT].find((h) => Math.hypot(h.x - z.x, h.z - z.z) < 0.5)

/** 100 generated jobs, as a game that plays them one after the other (a built house stays built). */
function generated(count: number): Job[] {
  const s = newSim(STORY.length)
  const jobs: Job[] = []
  for (let i = 0; i < count; i++) {
    s.moreDone = i
    const j = nextMoreJob(s)
    jobs.push(j)
    const house = j.steps.find((st) => st.kind === 'lift')
    if (templateOf(j) === 'house' && house !== undefined && house.kind === 'lift') {
      s.builds[house.build].shown = true
      s.builds[house.build].placed = s.builds[house.build].spots.length
    }
  }
  return jobs
}

const ALL: readonly Job[] = [...STORY, ...generated(100)]

/** Where each step's places are, as zones with a flag for whether they belong to a lot. */
function placesOf(s: Sim, j: Job): { what: string; x: number; z: number; r: number; lot: number }[] {
  const out: { what: string; x: number; z: number; r: number; lot: number }[] = []
  for (const st of j.steps) {
    switch (st.kind) {
      case 'scoop':
        out.push({ what: `${j.id} park`, ...st.park, r: 2.2, lot: -1 }, { what: `${j.id} dig`, ...st.dig, lot: -1 })
        break
      case 'digOut': {
        const lot = 'form' in st.makes ? FORMS[st.makes.form].lot : -1
        out.push({ what: `${j.id} park`, ...st.park, r: 2.2, lot: -1 }, { what: `${j.id} dig`, ...st.zone, lot })
        break
      }
      case 'tip':
        out.push({ what: `${j.id} tip`, ...st.zone, lot: -1 })
        break
      case 'push':
        out.push({ what: `${j.id} hole`, ...st.hole, lot: -1 })
        break
      case 'clear':
        out.push({ what: `${j.id} clear`, ...st.zone, lot: -1 })
        break
      case 'carry':
        out.push({ what: `${j.id} ring`, ...st.ring, lot: -1 })
        break
      case 'drive':
        out.push({ what: `${j.id} drive`, ...st.ring, lot: -1 })
        break
      default:
        break
    }
  }
  void s
  return out
}

describe('the story', () => {
  it('has the chapters in order and unique ids', () => {
    expect(new Set(STORY.map((j) => j.id)).size).toBe(STORY.length)
    const chapters = STORY.map((j) => j.chapter)
    expect(chapters.filter((c, i) => i === 0 || chapters[i - 1] !== c)).toEqual(['road', 'house', 'bridge', 'play', 'clock'])
  })

  it('brings each machine once, before it is needed', () => {
    const come = new Set<string>(['digger', 'dumper'])
    for (const j of STORY) {
      for (const m of j.brings) come.add(m)
      for (const st of j.steps) {
        const k = machineOf(st)
        if (k !== null) expect(come.has(k), `${j.id} needs the ${k}`).toBe(true)
      }
    }
    expect(come.size).toBe(9)
  })

  it('gives every job a par of at least a few seconds', () => {
    for (const j of STORY) expect(j.par, j.id).toBeGreaterThan(5)
  })
})

describe('the places', () => {
  const s = newSim()

  it('lie on the map, clear of the trees, plants and river, and outside lots they do not belong to', () => {
    for (const j of ALL) {
      for (const p of placesOf(s, j)) {
        expect(Math.abs(p.x) + p.r * 0, p.what).toBeLessThan(46)
        expect(Math.abs(p.z), p.what).toBeLessThan(46)
        expect(p.z < RIVER.z0 - 1 || p.z > RIVER.z1 + 1, `${p.what} is in the river`).toBe(true)
        for (const [ox, oz, or] of OBSTACLES) expect(Math.hypot(p.x - ox, p.z - oz), `${p.what} is in an obstacle at ${ox}, ${oz}`).toBeGreaterThan(or + 1.2)
        LOTS.forEach((lot, i) => {
          const inside = Math.abs(p.x - lot.x) < lot.w / 2 && Math.abs(p.z - lot.z) < lot.d / 2
          if (inside) expect(i, `${p.what} stands in lot ${i}`).toBe(p.lot)
        })
      }
    }
  })

  it('keep the toilet and the barrels out of every ring, park spot, home and road', () => {
    const rings: { what: string; x: number; z: number; r: number }[] = [
      ...Object.entries(PLACES).map(([what, z]) => ({ what, ...z })),
      ...TIP_RINGS.map((z, i) => ({ what: `tip ring ${i}`, ...z })),
      ...Object.entries(PLANTS).flatMap(([id, p]) => [{ what: `${id} ring`, ...p.ring }, { what: `${id} feed spot`, x: p.feedSpot.x, z: p.feedSpot.z, r: 2 }]),
      ...[HILL_RINGS, DELIVERY_RINGS].flat().map((z, i) => ({ what: `generated ring ${i}`, ...z })),
      { what: 'sand pit ring', ...SANDPIT_RING },
      { what: 'pallet ring', ...PALLET_RING },
      ...Object.entries(HOME).map(([what, p]) => ({ what: `${what} home`, x: p.x, z: p.z, r: 3 })),
    ]
    expect(PROPS.length).toBeGreaterThan(0)
    for (const p of PROPS) {
      for (const r of rings) expect(Math.hypot(p.x - r.x, p.z - r.z), `${p.kind} at ${p.x}, ${p.z} stands in the ${r.what}`).toBeGreaterThan(p.r + r.r)
      for (const road of ROADS) {
        const len = Math.hypot(road.bx - road.ax, road.bz - road.az)
        const across = Math.abs(((p.x - road.ax) * (road.bz - road.az) - (p.z - road.az) * (road.bx - road.ax)) / len)
        const along = ((p.x - road.ax) * (road.bx - road.ax) + (p.z - road.az) * (road.bz - road.az)) / len
        if (along > -2 && along < len + 2) expect(across, `${p.kind} at ${p.x}, ${p.z} stands on a road`).toBeGreaterThan(ROAD_WIDTH / 2 + p.r)
      }
    }
  })

  it('keep the rings and spots of the map and the generator on the map and off each other', () => {
    for (const r of [...HILL_RINGS, ...DELIVERY_RINGS, PALLET_RING]) {
      expect(Math.abs(r.x) + r.r).toBeLessThan(46)
      expect(Math.abs(r.z) + r.r).toBeLessThan(46)
      for (const [ox, oz, or] of OBSTACLES) expect(Math.hypot(r.x - ox, r.z - oz)).toBeGreaterThan(or + r.r * 0.5)
      for (const lot of LOTS) expect(Math.abs(r.x - lot.x) < lot.w / 2 + r.r * 0.5 && Math.abs(r.z - lot.z) < lot.d / 2 + r.r * 0.5).toBe(false)
    }
  })
})

describe('the cranes', () => {
  const s = newSim()
  const reach = (crane: 'tower' | 'mobile', x: number, z: number, base: { x: number; z: number }) => {
    const range = crane === 'tower' ? TROLLEY_RANGE : REACH_RANGE
    const d = Math.hypot(x - base.x, z - base.z)
    return d >= range[0] && d <= range[1]
  }

  it('reach every spot of every building they lift, and every piece they lift from', () => {
    for (const j of ALL) {
      for (const st of j.steps) {
        if (st.kind !== 'lift') continue
        const crane = s.machines[st.crane]
        // A tower stands at its mast; a truck crane at the spot its building is built from.
        const base = st.crane === 'tower' ? { x: TOWER_AT.x, z: TOWER_AT.z } : craneBase({ ...crane, x: standOf(st.build).x, z: standOf(st.build).z, yaw: standOf(st.build).yaw })
        const b = BUILDS[st.build]
        for (const spot of b.spots) expect(reach(st.crane, spot.x, spot.z, base), `${j.id}: spot ${spot.wants} at ${spot.x}, ${spot.z}`).toBe(true)
        // Pieces a forklift brings to the pallet ring are not lifted from where they are made.
        const carried = j.steps.some((o) => o.kind === 'carry')
        for (const set of j.setup) if (!carried && b.spots.some((o) => o.wants === set.thing)) expect(reach(st.crane, set.x, set.z, base), `${j.id}: ${set.thing} at ${set.x}, ${set.z}`).toBe(true)
      }
    }
    expect(reach('tower', PALLET_RING.x, PALLET_RING.z, TOWER_AT)).toBe(true)
    expect(Math.hypot(PLANTS.press.outSlots[0][0] - TOWER_AT.x, PLANTS.press.outSlots[0][1] - TOWER_AT.z)).toBeGreaterThan(TROLLEY_RANGE[1])
  })

  it("put Pip's spare where the crane that needs it can get it, in every story job and generated one, at every stage of the build", () => {
    let lifts = 0
    let stages = 0
    for (const j of ALL) {
      for (const st of j.steps) {
        if (st.kind !== 'lift') continue
        lifts++
        const stand = st.crane === 'tower' ? null : standOf(st.build)
        const spots = BUILDS[st.build].spots.length
        // Every count of pieces in place, as a job asks for the spare at: the first piece to the one before the last.
        for (let placed = 0; placed < spots; placed++) {
          stages++
          const w = newSim()
          const crane = w.machines[st.crane]
          if (stand !== null) Object.assign(crane, { x: stand.x, z: stand.z, yaw: stand.yaw })
          w.builds[st.build].shown = true
          w.builds[st.build].placed = placed
          const at = spareSpot(w, st)
          const what = `${j.id} with ${placed} of ${spots} in place: spare at ${at.x}, ${at.z}`
          const range = st.crane === 'tower' ? TROLLEY_RANGE : REACH_RANGE
          // The hands' own check: within the range, half a metre to spare.
          const d = Math.hypot(at.x - craneBase(crane).x, at.z - craneBase(crane).z)
          expect(d, what).toBeGreaterThanOrEqual(range[0] - 0.5)
          expect(d, what).toBeLessThanOrEqual(range[1] + 0.5)
          expect(Math.abs(at.x) < 42 && Math.abs(at.z) < 42, `${what}: on the map`).toBe(true)
          expect(at.z > RIVER.z1 || at.z < RIVER.z0, `${what}: not in the river`).toBe(true)
          for (const [ox, oz, or] of OBSTACLES) expect(Math.hypot(at.x - ox, at.z - oz), `${what}: clear of the obstacle at ${ox}, ${oz}`).toBeGreaterThan(or)
          // Not inside a house or the playground with a piece in place: the crane could not lift it out.
          for (const b of w.builds) {
            if (b.placed === 0 || b.kind === 'bridge') continue
            expect(Math.abs(at.x - b.x) > BUILD_HALF[b.kind][0] || Math.abs(at.z - b.z) > BUILD_HALF[b.kind][1], `${what}: outside build ${b.id}`).toBe(true)
          }
        }
      }
    }
    expect(lifts).toBeGreaterThan(5)
    expect(stages).toBeGreaterThan(lifts)
  })

  it('keep brick slots out of the tower reach and plank slots in it', () => {
    for (const [x, z] of PLANTS.press.outSlots) expect(Math.hypot(x - TOWER_AT.x, z - TOWER_AT.z)).toBeGreaterThan(TROLLEY_RANGE[1] + 0.5)
    for (const [x, z] of PLANTS.saw.outSlots) {
      const d = Math.hypot(x - TOWER_AT.x, z - TOWER_AT.z)
      expect(d).toBeGreaterThan(TROLLEY_RANGE[0])
      expect(d).toBeLessThan(TROLLEY_RANGE[1])
    }
  })
})

function standOf(build: number): { x: number; z: number; yaw: number } {
  const kind = BUILDS[build].kind
  if (kind === 'bridge') return { x: 13.5, z: -27, yaw: Math.PI }
  if (kind === 'playground') return { x: 15, z: 35.5, yaw: Math.PI / 2 }
  throw new Error(`no truck crane builds a ${kind}`)
}

describe('the steps', () => {
  const stepsOf = (j: Job): [number, Step][] => j.steps.map((st, i) => [i, st])

  it('want only things that something makes or the job sets out', () => {
    for (const j of ALL) {
      for (const st of j.steps) {
        if (st.kind !== 'lift') continue
        const made = new Set<string>(j.setup.map((o) => o.thing))
        if (j.steps.some((o) => o.kind === 'feed' && o.plant === 'press') || j.chapter === 'house' || j.chapter === 'more' || j.chapter === 'clock') made.add('bricks')
        if (j.steps.some((o) => o.kind === 'unload') || j.chapter === 'house' || j.chapter === 'more' || j.chapter === 'clock') made.add('planks')
        for (const spot of BUILDS[st.build].spots.slice(0, st.pieces)) expect(made.has(spot.wants), `${j.id} wants ${spot.wants}`).toBe(true)
      }
    }
    expect(PLANTS.press.makes).toBe('bricks')
    expect(PLANTS.saw.makes).toBe('planks')
  })

  it('draw no more than the truck or the drum holds, and ask for less than the job delivers', () => {
    for (const j of ALL) {
      let delivered = 0
      for (const [, st] of stepsOf(j)) {
        if (st.kind === 'scoop') {
          delivered = st.scoops * SCOOP
          if (st.into === 'dumper') expect(delivered, j.id).toBeLessThanOrEqual(DUMPER_CAP + 1e-9)
          if (st.into === 'mixer') expect(delivered, j.id).toBeLessThanOrEqual(MIXER_SAND + 1e-9)
        }
        if (st.kind === 'tip' || st.kind === 'feed') {
          expect(st.need, j.id).toBeLessThanOrEqual(DUMPER_CAP)
          expect(st.need, `${j.id} asks for more than the scoops bring`).toBeLessThanOrEqual(delivered + 1e-9)
          delivered = st.need
        }
        if (st.kind === 'push') {
          const hole = holeAt(st.hole)
          expect(hole, `${j.id} fills a hole the map cuts`).toBeDefined()
          if (hole !== undefined) expect(st.need * bowl(hole), j.id).toBeLessThanOrEqual(0.8 * delivered)
        }
      }
    }
  })

  it('send every refill back to a loading step', () => {
    for (const j of ALL) {
      j.steps.forEach((st, i) => {
        if ('refill' in st) {
          expect(st.refill, j.id).toBeLessThan(i)
          expect(j.steps[st.refill].kind, `${j.id} refills to a ${j.steps[st.refill].kind}`).toBe('scoop')
        }
      })
    }
  })

  it('use what every dig leaves', () => {
    STORY.forEach((j, ji) => {
      j.steps.forEach((st, si) => {
        if (st.kind !== 'digOut') return
        if ('pond' in st.makes) {
          const pond = st.makes.pond
          expect(j.steps.slice(si + 1).some((o) => o.kind === 'watch' && typeof o.what === 'object' && 'pond' in o.what && o.what.pond === pond), `${j.id} watches its pond`).toBe(true)
        } else {
          const form = st.makes.form
          const later = [...j.steps.slice(si + 1), ...STORY.slice(ji + 1).flatMap((o) => o.steps)]
          expect(later.some((o) => o.kind === 'pour' && o.form === form), `${j.id} makes form ${form} for a pour`).toBe(true)
        }
      })
    })
  })

  it('pour into forms that exist, and lift into builds that exist', () => {
    for (const j of ALL) {
      for (const st of j.steps) {
        if (st.kind === 'pour') expect(st.form).toBeLessThan(FORMS.length)
        if (st.kind === 'lift') {
          expect(st.build).toBeLessThan(BUILDS.length)
          expect(st.pieces).toBeLessThanOrEqual(BUILDS[st.build].spots.length)
        }
      }
    }
  })

  it('give every step with a machine a picture and a pointer, and every pointer a place on the map', () => {
    for (let k = 0; k < STORY.length; k++) {
      const s = newSim(k)
      const j = STORY[k]
      expect(j).toBeDefined()
      for (let i = 0; i < j.steps.length; i++) {
        s.job = { job: j, step: i, startedAt: 0, stepAt: 0, count: 0, base: 0, nearest: Infinity, arrived: 0, prev: null, phase: 0, passes: 0, holdFrom: null, heap: null, roll: null, autoHopAt: null, partnerAt: -1 }
        // Plants and things the step reads: whatever is not there yet leaves a null pointer or a pointer on the plant.
        for (const m of Object.values(s.machines)) m.unlocked = true
        for (const b of s.builds) b.shown = true
        const view = stepView(s)
        expect(view, `${j.id} step ${i}`).not.toBeNull()
        const p = stepPointer(s)
        if (machineOf(j.steps[i]) !== null && p !== null) {
          expect(Number.isFinite(p.x + p.y + p.z), `${j.id} step ${i}`).toBe(true)
          expect(Math.abs(p.x)).toBeLessThan(48)
          expect(Math.abs(p.z)).toBeLessThan(48)
        }
      }
    }
  })
})

describe('the generator', () => {
  it('never makes one template twice running, and a house only while a lot is free', () => {
    const jobs = generated(100)
    const templates = jobs.map((j) => templateOf(j))
    templates.forEach((t, i) => {
      expect(t).not.toBeNull()
      if (i > 0) expect(t, `job ${i}`).not.toBe(templates[i - 1])
    })
    expect(templates.filter((t) => t === 'house')).toHaveLength(MORE_HOUSES.length)
    for (const t of MORE_TEMPLATES) expect(templates.includes(t), t).toBe(true)
  })

  it('is the same for the same seed and different for another', () => {
    const run = (seed: number) => {
      const s = createSim({ storyDone: STORY.length, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed, lastTemplate: -1 })
      return Array.from({ length: 12 }, (_, i) => {
        s.moreDone = i
        return nextMoreJob(s).id
      })
    }
    expect(run(5000)).toEqual(run(5000))
    expect(run(5000)).not.toEqual(run(9000))
  })

  it('makes houses for the lots 1 to 3 with their owners moving in', () => {
    for (const j of generated(100)) {
      if (templateOf(j) !== 'house') continue
      expect(j.movesIn).not.toBeNull()
      const lift = j.steps.find((st) => st.kind === 'lift')
      expect(lift !== undefined && lift.kind === 'lift' && j.movesIn !== null && BUILDS[lift.build].owner === j.movesIn.who).toBe(true)
      expect(j.setup.filter((o) => o.thing === 'bricks')).toHaveLength(3)
      expect(j.setup.filter((o) => o.thing === 'planks')).toHaveLength(2)
    }
  })
})

describe('stars', () => {
  it('give three within par, two within twice that, one otherwise, and one more in pro for beating par', () => {
    expect(starsFor(10, 20, false)).toBe(3)
    expect(starsFor(20, 20, false)).toBe(3)
    expect(starsFor(30, 20, false)).toBe(2)
    expect(starsFor(41, 20, false)).toBe(1)
    expect(starsFor(10, 20, true)).toBe(4)
    expect(starsFor(30, 20, true)).toBe(2)
  })
})

describe('restoring a save', () => {
  it('stamps the town of each finished job: builds, forms, ponds, decks, roads, machines', () => {
    const s = newSim(STORY.length)
    expect(s.builds[0].placed).toBe(BUILDS[0].spots.length)
    expect(s.builds[1].placed).toBe(3)
    expect(s.builds[2].placed).toBe(3)
    expect(s.builds[3].placed).toBe(BUILDS[3].spots.length)
    expect(s.forms.every((f) => f.shown && f.hard)).toBe(true)
    expect(s.ponds[0].shown && s.ponds[0].water === 1).toBe(true)
    expect(s.decks).toHaveLength(1)
    for (const m of Object.values(s.machines)) expect(m.unlocked).toBe(true)
    expect(s.machines.tower.up).toBe(1)
    expect(s.animals.some((a) => a.species === 'bunny' && a.home === 0)).toBe(true)
    expect(() => applyDone(newSim(), 'nonsense')).toThrow()
    expect(() => applyDone(newSim(), 'walls'), 'no bricks were made for the walls').toThrow(/no bricks was made/)
  })
})
