/**
 * The road: every seed of every kind and trip laid out by the rules (a lint that lists what
 * is wrong), and the drive stepped tick by tick the way the rules step it: a held pedal and
 * steady hits reach the end, the truck never passes a stop, goods are credited once, the
 * ramp, the push, the boulder, the crossers, the surprises, the horn and Home, and the
 * events that the renderer places carry where they happen.
 */
import { describe, expect, it } from 'vitest'

import { TRACK_LEFT } from '../draw/land'
import { shotRect } from './camera'
import { ROADS, ROAD_LENGTH, TRAINING } from './catalog'
import { hudView } from './hud'
import { TRUCK, groundAt, stopBefore } from './layout'
import { AUTO_HIT, AUTO_HIT_EVERY, BOULDER_HITS, BOULDER_ROCKS, CROSS_FOR, HZ, RAWS, ROAD_KINDS, STEP, ticks, type Biome, type Good, type RoadDef, type RoadKind, type RoadState, type RoadThing, type SimEvent, type State } from './model'
import { freshKeep } from './progress'
import { BALLOON_LEAD, BALLOON_UP, CRACK_PAUSE, FLY_FROM, GEM_R, TOP, TRAIN_BACK, TRAIN_FOR, isStop, makeRoad, roadHorn, roadPedal, roadPush, roadWhack, startRoad, stepRoad, stopX, surfaceAt } from './road'
import { createState } from './rules'

const slopeOf = (degrees: number) => Math.tan((degrees * Math.PI) / 180)
/** Where each pickup should mostly lie, as the plan says. */
const HOMES: Record<'log' | 'clay' | 'sand' | 'gem', readonly Biome[]> = { log: ['forest'], clay: ['river'], sand: ['dunes', 'beach'], gem: ['tunnel', 'quarry'] }
/** Seeds laid out for each kind of road on each trip, each trip from its own seeds. */
const SEEDS = 120
const TRIPS = 12
/** The plank bridge's length (draw/land.ts draws it), and how far from its ends a crossing must lie: the zebra, the family's walk and its width stay on the ground. */
const BRIDGE = 12
const CROSS_CLEAR = 3

/** Everything wrong with a laid-out road, as short notes (none for a good road). */
function lint(def: RoadDef): string[] {
  const bad: string[] = []
  const training = def.trip === 1
  const length = training ? TRAINING.length : ROAD_LENGTH
  const plan = ROADS[training ? 'forest' : def.kind]
  const things = def.things
  const of = <K extends RoadThing['kind']>(kind: K) => things.filter((t): t is Extract<RoadThing, { kind: K }> => t.kind === kind)
  const pickups = of('pickup')
  const boulders = of('boulder')
  const crossers = of('crosser')
  const ramps = of('ramp')
  const surprises = of('surprise')
  const trains = surprises.filter((t) => t.what === 'train')

  if (def.length !== length || def.ground.length !== length + 41) bad.push(`length ${def.length}, ${def.ground.length} ground samples`)
  if (def.biomes.map((b) => b.biome).join() !== plan.biomes.join()) bad.push(`biomes ${def.biomes.map((b) => b.biome).join()}`)
  def.biomes.forEach((b, i) => {
    if (b.from !== (i === 0 ? 0 : def.biomes[i - 1].to) || b.to <= b.from) bad.push(`biome ${i} from ${b.from} to ${b.to}`)
  })
  const town = def.biomes[def.biomes.length - 1]
  if (town.to !== length + 40 || town.from < length - 60) bad.push(`town from ${town.from} to ${town.to}`)
  if (things.some((t, i) => i > 0 && t.x < things[i - 1].x)) bad.push('things not sorted')
  if (things.some((t) => t.x < 25 || t.x > length - 30)) bad.push('a thing in the first 25 m or the last 30 m')

  const count = (good: Good) => pickups.filter((t) => t.good === good).length
  const wantPickups = training ? { log: TRAINING.logs, clay: 0, sand: 0, gem: 0 } : plan.pickups
  for (const good of ['log', 'clay', 'sand', 'gem'] as const) if (count(good) !== wantPickups[good]) bad.push(`${count(good)} ${good} pickups`)
  if (count('rock') !== 0) bad.push('a rock pickup')
  if (boulders.length !== (training ? 1 : plan.boulders)) bad.push(`${boulders.length} boulders`)
  if (training && boulders.some((b) => b.size !== 'small' || b.gem)) bad.push('the training boulder is not a small one with no gem')
  if (crossers.length !== 1 || (training && crossers[0].who !== 'ducks')) bad.push(`crossers ${crossers.map((c) => c.who).join()}`)
  if (ramps.length !== (training ? 0 : 1)) bad.push(`${ramps.length} ramps`)
  if (def.rampGems.length !== ramps.length * 4) bad.push(`${def.rampGems.length} ramp gems`)
  if (of('present').length !== 1) bad.push(`${of('present').length} presents`)
  if (surprises.length !== (def.trip >= 3 ? 1 : 0)) bad.push(`${surprises.length} surprises`)

  // Every raw good at least twice, counting the boulders' rocks and gems, the gem at the ramp's foot and the balloon's.
  if (!training) {
    const have: Record<Good, number> = { ...freshKeep().goods, log: count('log'), clay: count('clay'), sand: count('sand') }
    have.rock = boulders.reduce((n, b) => n + BOULDER_ROCKS[b.size], 0)
    have.gem = count('gem') + boulders.filter((b) => b.gem).length + ramps.length + surprises.filter((t) => t.what === 'balloon').length
    for (const raw of RAWS) if (have[raw] < 2) bad.push(`only ${have[raw]} ${raw}`)
  }
  // Mostly in their own biome, when the road has it.
  for (const good of ['log', 'clay', 'sand', 'gem'] as const) {
    const home = def.biomes.filter((b) => HOMES[good].includes(b.biome))
    const inHome = pickups.filter((t) => t.good === good && home.some((b) => t.x >= b.from && t.x <= b.to)).length
    if (home.length > 0 && inHome * 2 < count(good)) bad.push(`only ${inHome} of ${count(good)} ${good} at home`)
  }

  // A plank bridge over the middle of each river; families and the train's track cross on the ground, clear of a bridge and out of the tunnels.
  const rivers = def.biomes.filter((b) => b.biome === 'river')
  const bridges = rivers.map((b) => ({ from: (b.from + b.to - BRIDGE) / 2, to: (b.from + b.to + BRIDGE) / 2 }))
  if (JSON.stringify(def.bridges) !== JSON.stringify(bridges)) bad.push(`bridges ${JSON.stringify(def.bridges)} over rivers ${JSON.stringify(rivers)}`)
  for (const t of [...crossers, ...trains]) {
    if (def.bridges.some((b) => t.x > b.from - CROSS_CLEAR && t.x < b.to + CROSS_CLEAR)) bad.push(`the ${t.kind} at ${t.x} on the bridge`)
    if (def.biomes.some((b) => b.biome === 'tunnel' && t.x >= b.from && t.x <= b.to)) bad.push(`the ${t.kind} at ${t.x} in the tunnel`)
  }

  // Spacing: boulders 60 m apart, nothing within 15 m of a stop.
  for (const a of boulders) for (const b of boulders) if (a !== b && Math.abs(a.x - b.x) < 60) bad.push(`boulders at ${a.x} and ${b.x}`)
  for (const stop of things.filter(isStop)) for (const t of things) if (t !== stop && Math.abs(t.x - stop.x) < 15) bad.push(`${t.kind} at ${t.x} near the ${stop.kind} at ${stop.x}`)

  // The ground: never over 12 degrees, within 2 degrees at the start, the end, every stop, the balloon and the ramp.
  const g = def.ground
  for (let i = 1; i < g.length; i++) if (Math.abs(g[i] - g[i - 1]) > slopeOf(12)) bad.push(`a ${Math.abs(g[i] - g[i - 1]).toFixed(3)} slope at ${i}`)
  const flats: [number, number][] = [
    [0, 25],
    [length - 30, length + 40],
    ...things.filter((t) => isStop(t) || t.kind === 'surprise').map((t): [number, number] => [t.x - 10, t.x + 2]),
    ...ramps.map((t): [number, number] => [t.x - 10, t.x + 16]),
  ]
  for (const [a, b] of flats) for (let i = Math.max(1, Math.ceil(a)); i <= Math.min(g.length - 1, Math.floor(b)); i++) if (Math.abs(g[i] - g[i - 1]) > slopeOf(2)) bad.push(`not flat at ${i}`)
  return bad
}

describe('laying out a road', () => {
  // The sweep lays out 4,320 roads: about half a second alone, more beside the other test files.
  it(`keeps every rule for ${SEEDS} seeds of every kind on trips 1 to ${TRIPS}`, { timeout: 20_000 }, () => {
    const bad: string[] = []
    for (const kind of ROAD_KINDS)
      for (let trip = 1; trip <= TRIPS; trip++)
        for (let seed = trip * SEEDS; seed < (trip + 1) * SEEDS; seed++) bad.push(...lint(makeRoad(kind, trip, seed)).map((note) => `${kind} trip ${trip} seed ${seed}: ${note}`))
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('gives the same road for the same seed, and other roads for others', () => {
    for (const kind of ROAD_KINDS) {
      expect(makeRoad(kind, 5, 42)).toEqual(makeRoad(kind, 5, 42))
      expect(makeRoad(kind, 5, 43).things).not.toEqual(makeRoad(kind, 5, 42).things)
      expect(makeRoad(kind, 6, 42).things).not.toEqual(makeRoad(kind, 5, 42).things)
    }
  })

  it('takes turns with the train and the balloon from trip 3, and with day and sunset', () => {
    const what = (trip: number, seed: number) => makeRoad('hills', trip, seed).things.flatMap((t) => (t.kind === 'surprise' ? [t.what] : []))
    expect(what(2, 1)).toEqual([])
    for (let trip = 4; trip <= TRIPS; trip++) for (const seed of [1, 2, 3]) expect(what(trip, seed)[0], `trip ${trip}`).not.toBe(what(trip - 1, seed * 5)[0])
    const skies = Array.from({ length: TRIPS }, (_, k) => makeRoad('beach', k + 1, 9).sky)
    expect(skies[0]).toBe('day')
    expect(new Set(skies)).toEqual(new Set(['day', 'sunset']))
  })

  it('floats the balloon low enough to show whole over the road, with its gem over the truck’s roof', () => {
    // Its envelope tops out about 3.8 m over the gem (draw/land.ts drawBalloon); the gem hangs from its net 0.3 m down.
    const bad: string[] = []
    for (const kind of ROAD_KINDS)
      for (let trip = 3; trip <= TRIPS; trip += 2)
        for (let seed = 0; seed < 200; seed++) {
          const def = makeRoad(kind, trip, seed)
          const balloon = def.things.find((t) => t.kind === 'surprise')!
          const s = createState(freshKeep(), 1, false)
          s.road = startRoad(def)
          s.road.x = balloon.x - BALLOON_LEAD
          const gem = groundAt(def, balloon.x) - BALLOON_UP
          const top = shotRect(s, { kind: 'road' }).r.y
          if (gem - 3.8 < top) bad.push(`${kind} trip ${trip} seed ${seed}: the balloon's top ${(top - gem + 3.8).toFixed(2)} m over the view`)
          if (gem + 0.3 + GEM_R > groundAt(def, s.road.x) - TRUCK.height) bad.push(`${kind} trip ${trip} seed ${seed}: the gem in the truck's roof`)
        }
    expect(bad.slice(0, 10)).toEqual([])
  })
})

/**
 * A trip on a fresh keep, stepped the way the rules step it: `act` is the child's hands
 * between steps, `step` one tick (the tick it ran is kept with each event), `run` steps until
 * something holds, `go` holds the pedal and hits every 0.3 s on the way.
 */
function trip(def: RoadDef) {
  const s = createState(freshKeep(), 1, false)
  const road = startRoad(def)
  s.road = road
  const events: { tick: number; e: SimEvent }[] = []
  const act = (hand: (s: State, road: RoadState) => void) => {
    s.events.length = 0
    hand(s, road)
    for (const e of s.events) events.push({ tick: s.tick, e })
  }
  const step = () => {
    s.events.length = 0
    s.tick++
    stepRoad(s, road)
    for (const e of s.events) events.push({ tick: s.tick, e })
  }
  /** Steps until `until` holds or `seconds` pass; true when it held. */
  const run = (seconds: number, until: () => boolean) => {
    for (let k = 0; k < ticks(seconds); k++) {
      if (until()) return true
      step()
    }
    return until()
  }
  const go = (seconds: number, until: () => boolean) => {
    act(pedal(true))
    for (let k = 0; k < ticks(seconds); k++) {
      if (until()) return true
      if (k % ticks(0.3) === 0) act(roadWhack)
      step()
    }
    return until()
  }
  /** Puts the truck at x with speed v as if it drove there: everything behind its middle is done. */
  const put = (x: number, v: number) => {
    def.things.forEach((t, i) => {
      if (t.x < x) road.done[i] = 0
    })
    road.x = x
    road.y = surfaceAt(def, x)
    road.v = v
  }
  const kinds = (kind: SimEvent['kind']) => events.filter((l) => l.e.kind === kind)
  return { s, road, act, step, run, go, put, kinds }
}

/** A flat road with nothing on it, for the pedal's feel. */
const flat = (length: number): RoadDef => ({ kind: 'forest', trip: 2, seed: 0, length, ground: new Float32Array(length + 41), biomes: [{ from: 0, to: length + 40, biome: 'meadow' }], bridges: [], things: [], sky: 'day', rampGems: [] })
const pedal = (down: boolean) => (s: State, road: RoadState) => roadPedal(s, road, down)
const indexOf = (def: RoadDef, kind: RoadThing['kind']) => def.things.findIndex((t) => t.kind === kind)
const rawsOf = (goods: readonly Good[]) => Object.fromEntries(RAWS.map((g) => [g, goods.filter((b) => b === g).length]))
const keptRaws = (s: State) => Object.fromEntries(RAWS.map((g) => [g, s.keep.goods[g]]))

describe('the drive', () => {
  it('reaches the end of every kind of road on every trip, twice, with the pedal held and a hit every 0.3 s, never passing a stop, crediting everything once', () => {
    const bad: string[] = []
    for (let k = 0; k < 2 * ROAD_KINDS.length * TRIPS; k++) {
      const kind: RoadKind = ROAD_KINDS[k % ROAD_KINDS.length]
      const def = makeRoad(kind, 1 + (Math.floor(k / ROAD_KINDS.length) % TRIPS), 5000 + k)
      const name = `${kind} trip ${def.trip} seed ${def.seed}`
      const { s, road, act, step, kinds } = trip(def)
      act(pedal(true))
      for (let n = 0; n < ticks(90) && road.endAt < 0; n++) {
        if (n % ticks(0.3) === 0) act(roadWhack)
        step()
        const next = def.things.findIndex((t, i) => road.done[i] < 0 && isStop(t))
        if (next >= 0 && road.x > stopX(def.things[next]) + 1e-9) bad.push(`${name}: passed the ${def.things[next].kind} at ${def.things[next].x}`)
      }
      if (road.endAt < 0) bad.push(`${name}: stuck at ${road.x.toFixed(1)}`)
      def.things.forEach((t, i) => {
        if (road.done[i] < 0) bad.push(`${name}: the ${t.kind} at ${t.x} not done`)
      })
      if (def.rampGems.length > 0 && [...road.rampGot].map((at) => at >= 0).join() !== 'true,true,true,false') bad.push(`${name}: ramp gems ${[...road.rampGot].join()}`)
      const want = rawsOf(
        def.things.flatMap((t): Good[] =>
          t.kind === 'pickup' ? [t.good] : t.kind === 'boulder' ? [...Array<Good>(BOULDER_ROCKS[t.size]).fill('rock'), ...(t.gem ? ['gem' as const] : [])] : t.kind === 'surprise' && t.what === 'balloon' ? ['gem'] : t.kind === 'ramp' ? ['gem', 'gem', 'gem'] : [],
        ),
      )
      if (JSON.stringify(keptRaws(s)) !== JSON.stringify(want) || JSON.stringify(rawsOf(road.bed)) !== JSON.stringify(want)) bad.push(`${name}: keep ${JSON.stringify(keptRaws(s))}, bed ${JSON.stringify(rawsOf(road.bed))}, want ${JSON.stringify(want)}`)
      const grabs = def.things.filter((t) => t.kind === 'pickup' || (t.kind === 'surprise' && t.what === 'balloon')).length + (def.rampGems.length > 0 ? 3 : 0)
      if (kinds('pickup').length !== grabs) bad.push(`${name}: ${kinds('pickup').length} pickup events for ${grabs}`)
      if (kinds('stop').length !== def.things.filter(isStop).length) bad.push(`${name}: ${kinds('stop').length} stops`)
      if (!road.present || kinds('present').length !== 1 || kinds('arrive').length !== 1) bad.push(`${name}: present ${road.present}, arrive ${kinds('arrive').length}`)
      if (s.flights.length !== road.bed.length) bad.push(`${name}: ${s.flights.length} flights for ${road.bed.length} goods`)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('pushes the truck a couple of truck lengths for a tap, and a quick press and let go is the same push', () => {
    for (const hands of [[roadPush], [pedal(true), pedal(false)]]) {
      const { road, act, step, run } = trip(flat(100))
      const x0 = road.x
      for (const hand of hands) {
        act(hand)
        step()
      }
      expect(run(10, () => road.v === 0)).toBe(true)
      expect((road.x - x0) / TRUCK.length).toBeGreaterThan(1.5)
      expect((road.x - x0) / TRUCK.length).toBeLessThan(3)
    }
  })

  it('takes about 3 m/s² to top speed, and rolls to a stop in about 2 s when let go', () => {
    const { s, road, act, run } = trip(flat(200))
    act(pedal(true))
    expect(run(10, () => road.v >= TOP * 0.97)).toBe(true)
    expect(TOP / (s.tick / HZ)).toBeGreaterThan(2.5)
    expect(TOP / (s.tick / HZ)).toBeLessThan(3.5)
    run(3, () => false)
    expect(road.v).toBeCloseTo(TOP, 3)
    act(pedal(false))
    const t0 = s.tick
    expect(run(5, () => road.v === 0)).toBe(true)
    expect((s.tick - t0) / HZ).toBeGreaterThan(1.8)
    expect((s.tick - t0) / HZ).toBeLessThan(2.8)
  })

  it('slows a little up a hill and speeds a little down one', () => {
    const def = flat(200)
    for (let x = 60; x <= 120; x++) def.ground[x] = -(x - 60) * slopeOf(10)
    for (let x = 121; x < def.ground.length; x++) def.ground[x] = def.ground[120] + (x - 120) * slopeOf(10)
    const { road, go, run } = trip(def)
    go(20, () => road.x > 110)
    expect(road.v).toBeLessThan(TOP - 0.3)
    expect(road.v).toBeGreaterThan(TOP - 1)
    run(3, () => false)
    expect(road.v).toBeGreaterThan(TOP + 0.3)
    expect(road.v).toBeLessThan(TOP + 1)
  })

  it('keeps every good in the bed when Home ends the trip halfway, and picks up nothing after', () => {
    const def = makeRoad('hills', 5, 2)
    const { s, road, go, run } = trip(def)
    expect(go(60, () => road.x > def.length / 2)).toBe(true)
    road.endAt = s.tick
    const bed = road.bed.length
    run(4, () => false)
    expect(bed).toBeGreaterThan(3)
    expect(road.bed.length).toBe(bed)
    expect(keptRaws(s)).toEqual(rawsOf(road.bed))
    expect(road.v).toBe(0)
  })
})

describe('a boulder', () => {
  const def = makeRoad('forest', 1, 11)
  const b = indexOf(def, 'boulder')
  const boulder = def.things[b] as Extract<RoadThing, { kind: 'boulder' }>
  /** The truck stopped at the boulder with the pedal held all along. */
  const atBoulder = () => {
    const t = trip(def)
    t.put(boulder.x - 40, TOP)
    t.act(pedal(true))
    expect(t.run(30, () => t.road.stop === b)).toBe(true)
    return t
  }

  it('stops the truck exactly before it, and the builder hits on their own after a quiet spell until it bursts into the bed', () => {
    const { s, road, run, kinds } = atBoulder()
    expect(road.x).toBe(stopBefore(boulder.x))
    expect(kinds('stop').map((l) => l.e)).toEqual([{ kind: 'stop', why: 'boulder' }])
    const at = s.tick
    expect(run(AUTO_HIT + BOULDER_HITS.small * AUTO_HIT_EVERY, () => road.done[b] >= 0)).toBe(true)
    expect(kinds('whack').map((l) => l.tick - at)).toEqual(Array.from({ length: BOULDER_HITS.small }, (_, k) => ticks(AUTO_HIT) + k * ticks(AUTO_HIT_EVERY)))
    expect(kinds('whack')[0].e).toMatchObject({ tool: s.keep.look.tool })
    expect(kinds('crack').map((l) => l.e)).toMatchObject([{ kind: 'crack', gem: false }])
    expect(s.keep.goods.rock).toBe(BOULDER_ROCKS.small)
    expect(rawsOf(road.bed).rock).toBe(BOULDER_ROCKS.small)
    expect(road.stop).toBe(-1)
  })

  /** Hits the boulder as fast as the tool allows until it bursts. */
  const burst = (t: ReturnType<typeof atBoulder>) => {
    while (t.road.done[b] < 0) {
      t.act(roadWhack)
      t.step()
    }
  }

  it('takes the child’s hits at most four a second, and drives on with the pedal held all along once the burst is over', () => {
    const t = atBoulder()
    const { s, road, run } = t
    const at = s.tick
    burst(t)
    expect(road.done[b] - at).toBe(ticks(0.25) * (BOULDER_HITS.small - 1))
    const x = road.x
    expect(run(2, () => road.x > x)).toBe(true)
    expect(s.tick - road.done[b]).toBe(ticks(CRACK_PAUSE))
    expect(road.pedal).toBe(true)
  })

  it('stands after the burst with the pedal up, so the pedal pulses, and goes on at a press', () => {
    const t = atBoulder()
    const { s, road, act, run } = t
    act(pedal(false))
    burst(t)
    s.lastInputAt = road.hitAt
    const x = road.x
    run(4, () => false)
    expect(road.x).toBe(x)
    s.shot = { kind: 'road' }
    expect(hudView(s, s.tick * STEP, null).road).toMatchObject({ boulder: false, pulse: true })
    act(pedal(true))
    expect(run(1, () => road.x > x + 0.5)).toBe(true)
  })

  it('lets a tap during the burst push the truck its whole way once the burst is over', () => {
    for (const hands of [[roadWhack], [roadPush], [pedal(true), pedal(false)]]) {
      const t = atBoulder()
      const { s, road, act, run } = t
      act(pedal(false))
      burst(t)
      const x = road.x
      run(0.1, () => false)
      for (const hand of hands) act(hand)
      expect(run(CRACK_PAUSE, () => road.x > x)).toBe(true)
      expect(s.tick - road.done[b]).toBe(ticks(CRACK_PAUSE))
      expect(run(10, () => road.v === 0)).toBe(true)
      expect((road.x - x) / TRUCK.length).toBeGreaterThan(1.5)
      expect((road.x - x) / TRUCK.length).toBeLessThan(3)
      expect(s.keep.goods.rock).toBe(BOULDER_ROCKS.small)
    }
  })

  it('ignores the horn, the tool and the pedal once the trip is over, and the builder stops hitting', () => {
    const { s, road, act, run, kinds } = atBoulder()
    road.endAt = s.tick
    const goods = { ...s.keep.goods }
    for (const hand of [roadHorn, roadWhack, roadPush, pedal(true)]) act(hand)
    run(AUTO_HIT + 2 * AUTO_HIT_EVERY, () => false)
    expect([...kinds('honk'), ...kinds('whack'), ...kinds('crack')]).toEqual([])
    expect(s.keep.goods).toEqual(goods)
    expect(road.done[b]).toBe(-1)
  })
})

describe('crossers and surprises', () => {
  it('wait while the family crosses, then go on by itself with the pedal held, and not with it let go', () => {
    const def = makeRoad('forest', 1, 4)
    const c = indexOf(def, 'crosser')
    for (const held of [true, false]) {
      const { s, road, act, go, run, kinds } = trip(def)
      expect(go(60, () => road.stop === c)).toBe(true)
      expect(road.x).toBe(stopBefore(def.things[c].x))
      expect(kinds('stop').at(-1)?.e).toEqual({ kind: 'stop', why: 'crosser' })
      const at = s.tick
      act(pedal(held))
      run(CROSS_FOR + 1, () => road.stop < 0)
      expect(s.tick - at).toBe(ticks(CROSS_FOR))
      run(1, () => false)
      expect(road.v > 0).toBe(held)
    }
  })

  it('wait for the train to pass, the truck’s front clear of the whole track, and the train answers the horn', () => {
    const def = makeRoad('beach', 4, 6)
    const i = indexOf(def, 'surprise')
    const train = def.things[i]
    expect(train).toMatchObject({ what: 'train' })
    const { s, road, act, go, run, kinds } = trip(def)
    expect(go(80, () => road.stop === i)).toBe(true)
    expect(kinds('stop').at(-1)?.e).toEqual({ kind: 'stop', why: 'surprise' })
    // The track runs back up to the left of the crossing (draw/land.ts): the truck stops TRAIN_BACK further back than at a crossing, its front short of the track's back end.
    expect(road.x).toBe(stopX(train))
    expect(road.x).toBeCloseTo(stopBefore(train.x) - TRAIN_BACK, 9)
    expect(road.x + TRUCK.length / 2).toBeLessThan(train.x + TRACK_LEFT)
    const at = s.tick
    act(roadHorn)
    expect(kinds('answer').map((l) => l.e)).toEqual([{ kind: 'answer', who: 'train', x: train.x, y: groundAt(def, train.x) }])
    expect(road.answered).toBe(i)
    run(TRAIN_FOR + 1, () => road.stop < 0)
    expect(s.tick - at).toBe(ticks(TRAIN_FOR))
  })

  it('catch the balloon’s gem in the bed without stopping', () => {
    const def = makeRoad('hills', 3, 6)
    const i = indexOf(def, 'surprise')
    expect(def.things[i]).toMatchObject({ what: 'balloon' })
    const { s, road, go } = trip(def)
    expect(go(80, () => road.done[i] >= 0)).toBe(true)
    expect(road.v).toBeGreaterThan(TOP / 2)
    expect(road.bed.at(-1)).toBe('gem')
    expect(s.flights.at(-1)).toMatchObject({ good: 'gem', to: { kind: 'bed' } })
  })

  it('honk at most twice a second, and the family near the truck answers', () => {
    const def = makeRoad('beach', 2, 8)
    const c = indexOf(def, 'crosser')
    const crosser = def.things[c] as Extract<RoadThing, { kind: 'crosser' }>
    const { road, act, step, run, put, kinds } = trip(def)
    for (let k = 0; k < ticks(3); k++) {
      act(roadHorn)
      step()
    }
    expect(kinds('honk').length).toBe(6)
    expect(kinds('answer')).toEqual([])
    put(crosser.x - 15, 0)
    run(1, () => false)
    act(roadHorn)
    expect(kinds('honk').at(-1)!.e).toEqual({ kind: 'honk', x: road.x, y: road.y })
    expect(kinds('answer').map((l) => l.e)).toEqual([{ kind: 'answer', who: crosser.who, x: crosser.x, y: groundAt(def, crosser.x) }])
    expect(road.answered).toBe(c)
  })
})

describe('the ramp', () => {
  const def = makeRoad('forest', 2, 3)
  const lip = def.things[indexOf(def, 'ramp')].x

  it('flies a fast truck through the arc for three gems, and lets a slower one roll off for the gem at its foot', () => {
    const cases: [number, boolean, number][] = [
      [TOP, true, 3],
      [FLY_FROM * TOP + 0.05, true, 3],
      [TOP + 0.85, true, 3],
      [FLY_FROM * TOP - 0.1, false, 1],
      [3, false, 1],
    ]
    for (const [v, held, gems] of cases) {
      const { s, road, act, run, put, kinds } = trip(def)
      put(lip - 0.05, v)
      act(pedal(held))
      expect(run(5, () => road.landAt >= 0 && s.tick > road.landAt + HZ)).toBe(true)
      expect(s.keep.goods.gem, `${v} m/s`).toBe(gems)
      expect([...road.rampGot].map((at) => at >= 0)).toEqual(gems === 3 ? [true, true, true, false] : [false, false, false, true])
      expect(kinds('ramp').map((l) => l.e)).toEqual(gems === 3 ? [{ kind: 'ramp', x: expect.closeTo(lip, 0) as number, y: surfaceAt(def, lip) }] : [])
      const land = kinds('land').map((l) => l.e)
      expect(land).toEqual([{ kind: 'land', hard: gems === 3, x: expect.any(Number) as number, y: expect.any(Number) as number }])
      const at = land[0] as Extract<SimEvent, { kind: 'land' }>
      expect(at.x).toBeGreaterThan(lip)
      expect(at.y).toBe(surfaceAt(def, at.x))
    }
  })

  it('pitches the truck up off the lip and down into the landing, and follows the ground after', () => {
    const { s, road, act, run, put } = trip(def)
    put(lip - 20, TOP)
    act(pedal(true))
    run(5, () => road.airborne)
    const pitch: number[] = []
    run(3, () => (pitch.push(road.tilt), !road.airborne))
    expect(Math.min(...pitch)).toBeLessThan(-0.15)
    expect(Math.max(...pitch)).toBeGreaterThan(0.15)
    run(1, () => false)
    expect(road.y).toBe(surfaceAt(def, road.x))
    expect(Math.abs(road.tilt)).toBeLessThan(0.05)
    expect(s.keep.goods.gem).toBe(3)
  })
})
