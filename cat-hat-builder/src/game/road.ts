import { ROADS, ROAD_LENGTH, TRAINING } from './catalog'
import { TRUCK, boulderRect, groundAt, stopBefore } from './layout'
import {
  AUTO_HIT,
  AUTO_HIT_EVERY,
  BOULDER_HITS,
  BOULDER_ROCKS,
  CROSS_FOR,
  FLY_EVERY,
  FLY_FOR,
  ROAD_KINDS,
  STEP,
  ticks,
  type Biome,
  type Crosser,
  type Good,
  type Raw,
  type RoadDef,
  type RoadKind,
  type RoadState,
  type RoadThing,
  type State,
} from './model'
import { rng } from './random'

/**
 * The road: a trip's road laid out from a seed (every seed linted in road.test.ts), and the
 * drive over it: the truck's speed, hills and the ramp, pickups flying into the bed (and
 * into the keep at once), the stops at boulders, crossers and surprises, the hits on a
 * boulder, the horn and its answers, and the end of the trip.
 *
 * A road is its biomes stretched end to end (the town last, at the street sign) with a bridge
 * over each river, its things laid one by one at random spots that keep every spacing rule
 * (a whole new try when one does not fit), and rolling hills that lie flat wherever the
 * truck stops or jumps and under the balloon.
 *
 * One step of the drive, in order: a stop's wait (the builder's own hits at a boulder, the
 * crossers' and the train's time); the speed (the pedal's pull and the hill's, the roll to a
 * stop, and the brake that ends exactly at the next stop); the move, clamped so it can never
 * pass a stop; the ground or the flight (the ramp's lip throws a fast truck into the air);
 * the tilt; arriving at a stop; pickups, the present, the balloon and the ramp's gems; the
 * street sign.
 */

// ---------------------------------------------------------------------------------------
// The drive's numbers

/** Top speed on the flat in m/s: the world slides by about half a screen a second. */
export const TOP = 8
/** The pedal's pull in m/s²: strong from a standstill (so a tap's push rolls a couple of truck lengths), softer near the top; about 3 on average from 0 to TOP. */
const PULL_LOW = 5
const PULL_TOP = 2
/** Near its target speed the engine closes the gap at this rate per second, so a hill moves the speed smoothly. */
const HOLD = 3
/** Let go and the truck rolls to a stop at this many m/s², from TOP in a little over 2 s. */
const COAST = 3.5
/** The brake before every stop, in m/s²: soft enough to see coming. */
const BRAKE = 3
/** Hills, per unit of slope (downhill positive): the held pedal's speed moves by HILL_SPEED m/s and a rolling truck is pulled by HILL_PULL m/s². A 12 degree hill moves top speed by under 1 m/s. */
const HILL_SPEED = 4
const HILL_PULL = 4
/** A tap on the pedal drives it this long. */
const PUSH = 1.3
/** The truck starts this far along the road, on its flat start. */
const START_X = 5
/** Within this many metres of a stopping point the truck is there (it snaps the rest). */
const ARRIVE = 0.02
/** The tilt follows the ground, or the flight's pitch, at this rate per second. */
const TILT_RATE = 10

/** The child's hits on a boulder come at most this often: about four a second. */
const WHACK_EVERY = 0.25
/** After a boulder bursts the truck stays this long, so the burst is seen; then a pedal held all along drives it on, and a tap during the pause pushes it once the pause is over. */
export const CRACK_PAUSE = 0.6
/** The train takes this long to pass the level crossing. */
export const TRAIN_FOR = 3.2
/** The horn sounds at most twice a second; a crosser or the passing train within ANSWER_NEAR metres answers it. */
const HONK_EVERY = 0.5
const ANSWER_NEAR = 20
/**
 * A pickup hops into the bed over GRAB_FOR. The balloon drops its gem from BALLOON_UP metres
 * over the road when the truck's middle is BALLOON_LEAD metres short of it; the gem falls
 * into the bed over BALLOON_FALL. BALLOON_UP is low enough that the whole balloon (its
 * envelope tops out about 3.8 m over the gem, draw/land.ts drawBalloon) fits under the road
 * view's 7.6 m of sky over the ground (game/camera.ts ROAD_HEIGHT), and high enough that the
 * gem hangs clear over the truck's 2.3 m roof.
 */
const GRAB_FOR = 0.4
export const BALLOON_UP = 3.3
export const BALLOON_LEAD = 2
const BALLOON_FALL = 0.9
/** The balloon's show (draw/frame.ts draws it): it floats in while the truck's middle comes the last BALLOON_NEAR metres to where the gem drops, and drifts off with the gem dropped over BALLOON_AWAY seconds. */
export const BALLOON_NEAR = 25
export const BALLOON_AWAY = 3

/** The ramp rises `rise` metres over `run` metres up to its lip (draw/land.ts drawRamp draws this). */
export const RAMP = { run: 3, rise: 0.9 } as const
/** At the lip at FLY_FROM of TOP or faster the truck flies, thrown up at LAUNCH times its speed and falling at AIR_G (a cartoon float); slower, it rolls off the lip. */
export const FLY_FROM = 0.9
const LAUNCH = 0.85
const AIR_G = 9
/** The arc's gems hang where the middle of a truck flying at 95% of TOP passes, this far past the lip: every flight from FLY_FROM to a little over full speed gathers all three, and a truck rolling off the lip passes under them. */
const ARC_DX = [3, 5.5, 8] as const
/** The fourth gem lies on the ground this far past the lip: a truck rolling off lands on it, a flying one sails over it. */
const FOOT_DX = 3.2
/** A gem's radius, for touching the truck. */
export const GEM_R = 0.3
/** A flight this long or longer lands hard. */
const HARD_LANDING = 0.8

// ---------------------------------------------------------------------------------------
// Laying a road out

/** The plank bridge over the middle of each river stretch is this long (draw/land.ts draws it). */
const BRIDGE = 12
/**
 * Nothing that crosses the road (a family, the train's track) lies within CROSS_CLEAR metres
 * of a bridge's ends: the zebra's half width (1.2 m), the walk's drift to the left (1.1 m)
 * and half a beast (draw/land.ts drawCrosser) stay on the ground, never on the planks or over
 * the water.
 */
const CROSS_CLEAR = 3
/** Things stand from FIRST metres to LAST_CLEAR metres before the sign; the first FLAT_START and the last FLAT_END metres are flat. */
const FIRST = 30
const LAST_CLEAR = 34
const FLAT_START = 25
const FLAT_END = 30
/** The town starts TOWN to TOWN + 10 metres before the sign; the ground runs PAST_END metres past it, for the truck to roll out. */
const TOWN = 40
const PAST_END = 40
/** Nothing within STOP_CLEAR metres of a stop, boulders BOULDER_GAP apart, everything else PICKUP_GAP apart. */
const STOP_CLEAR = 15
const BOULDER_GAP = 60
const PICKUP_GAP = 4
/** Around the ramp's lip, in metres from it: no stop from the run-up to full speed to the brake after the flight, nothing else on the ramp or under the flight. */
const RAMP_STOPS = [-25, 35] as const
const RAMP_CLEAR = [-6, 18] as const
/** The ground lies flat around each stop, the balloon (so the camera, riding the ground's average, shows it whole) and the ramp (metres from it), and blends into the hills over BLEND metres. */
const STOP_FLAT = [-14, 4] as const
const RAMP_FLAT = [-14, 22] as const
const BLEND = 16
/** The rolling hills: two waves of these heights (metres) and wavelength ranges. */
const WAVES = [
  { a: 1.4, l: 70, dl: 40 },
  { a: 0.5, l: 26, dl: 16 },
] as const
/** No slope over 12 degrees, with room for the float32 samples. */
const MAX_SLOPE = Math.tan((12 * Math.PI) / 180) * 0.95

/** Where each pickup mostly lies when the road has that biome. */
const HOME: Record<Exclude<Raw, 'rock'>, readonly Biome[]> = { log: ['forest'], clay: ['river'], sand: ['dunes', 'beach'], gem: ['tunnel', 'quarry'] }
/** Where each family crosses when the road has that biome. */
const CROSSINGS: Record<Crosser, readonly Biome[]> = { ducks: ['river', 'beach'], cats: ['town', 'meadow'], hedgehogs: ['forest', 'quarry'], cows: ['meadow', 'dunes'] }
const CROSSERS = Object.keys(CROSSINGS) as Crosser[]

/** A thing the truck stops at: a boulder, a crossing, the train. */
export const isStop = (t: RoadThing) => t.kind === 'boulder' || t.kind === 'crosser' || (t.kind === 'surprise' && t.what === 'train')
/**
 * At the train the truck stops TRAIN_BACK metres further back than layout.stopBefore: the
 * level crossing's track runs down-right across the road (draw/land.ts drawCrossing), so its
 * back end lies about 2.6 m left of the crossing's x, and the truck's front stays clear of it.
 */
export const TRAIN_BACK = 2.5
/** Where the truck's middle stops before the stop `t`. */
export const stopX = (t: RoadThing) => stopBefore(t.x) - (t.kind === 'surprise' && t.what === 'train' ? TRAIN_BACK : 0)

/** Two things far enough apart to lie on one road. */
function apart(a: RoadThing, b: RoadThing): boolean {
  if (b.kind === 'ramp' && a.kind !== 'ramp') return apart(b, a)
  if (a.kind === 'ramp') {
    const keep = isStop(b) ? RAMP_STOPS : RAMP_CLEAR
    return b.x - a.x < keep[0] || b.x - a.x > keep[1]
  }
  const d = Math.abs(a.x - b.x)
  if (a.kind === 'boulder' && b.kind === 'boulder') return d >= BOULDER_GAP
  return d >= (isStop(a) || isStop(b) ? STOP_CLEAR : PICKUP_GAP)
}

/** A stretch of road, in metres from the start. */
interface Span {
  from: number
  to: number
}

/** The stretches between `from` and `to` whose biome passes `ok`, neighbours merged, each kept `inset` metres inside its ends. */
function spansOf(biomes: RoadDef['biomes'], ok: (b: Biome) => boolean, from: number, to: number, inset: number): Span[] {
  const runs: Span[] = []
  for (const b of biomes) {
    if (!ok(b.biome)) continue
    const last = runs[runs.length - 1]
    if (last !== undefined && last.to === b.from) last.to = b.to
    else runs.push({ from: b.from, to: b.to })
  }
  return runs.map((r) => ({ from: Math.max(r.from, from) + inset, to: Math.min(r.to, to) - inset })).filter((r) => r.to > r.from)
}
const spanLength = (spans: readonly Span[]) => spans.reduce((n, r) => n + r.to - r.from, 0)
/** `spans` with every one of `holes` cut out. */
function without(spans: readonly Span[], holes: readonly Span[]): Span[] {
  return holes.reduce<Span[]>(
    (out, h) =>
      out.flatMap((r) =>
        [
          { from: r.from, to: Math.min(r.to, h.from) },
          { from: Math.max(r.from, h.to), to: r.to },
        ].filter((piece) => piece.to > piece.from),
      ),
    [...spans],
  )
}
/** The plank bridge over the middle of each river stretch. */
const bridgesOf = (biomes: RoadDef['biomes']): Span[] =>
  biomes.filter((b) => b.biome === 'river').map((b) => ({ from: (b.from + b.to - BRIDGE) / 2, to: (b.from + b.to + BRIDGE) / 2 }))

/** A thing to lay: what it is at x, and the stretches it may lie in. */
interface Want {
  at: (x: number) => RoadThing
  spans: Span[]
}

/** Lays every want in order at a random spot of its stretches (to a tenth of a metre) that keeps its distance from those laid before; when one finds no spot, the whole road tries again. */
function lay(wants: readonly Want[], u: () => number): RoadThing[] {
  attempts: for (let attempt = 0; attempt < 100; attempt++) {
    const laid: RoadThing[] = []
    for (const w of wants) {
      const total = spanLength(w.spans)
      let t: RoadThing | null = null
      for (let k = 0; k < 30 && t === null; k++) {
        let r = u() * total
        let span = w.spans[w.spans.length - 1]
        for (const s of w.spans) {
          if (r < s.to - s.from) {
            span = s
            break
          }
          r -= s.to - s.from
        }
        const c = w.at(Math.round(Math.min(span.from + r, span.to) * 10) / 10)
        if (laid.every((o) => apart(o, c))) t = c
      }
      if (t === null) continue attempts
      laid.push(t)
    }
    return laid.sort((a, b) => a.x - b.x)
  }
  throw new Error('no room on the road for everything')
}

/**
 * The road of trip `trip` of `kind` from `seed`: the same arguments always give the same
 * road. Trip 1 is the 200 m training road whatever the kind (forest biomes, TRAINING.logs
 * logs, one small boulder with no gem, the ducks, the present). From trip 2: ROAD_LENGTH
 * metres of the kind's biomes, pickups and boulders (one in three hiding a gem), one family
 * crossing, one ramp, one present, and from trip 3 one surprise, the train and the balloon
 * taking turns. A plank bridge spans the middle of each river stretch; the families and the
 * train's track cross the road on the ground, never on a bridge or in a tunnel.
 */
export function makeRoad(kind: RoadKind, trip: number, seed: number): RoadDef {
  const u = rng(seed ^ Math.imul(ROAD_KINDS.indexOf(kind) + 1, 0x632be5ab) ^ Math.imul(trip, 0x2c1b3c6d))
  const training = trip === 1
  const plan = ROADS[training ? 'forest' : kind]
  const length = training ? TRAINING.length : ROAD_LENGTH

  // The biomes in order, stretched over the road: the first (the meadow at the start) a short one, the town last, at the sign.
  if (plan.biomes[plan.biomes.length - 1] !== 'town') throw new Error(`the ${kind} road must end in town`)
  const townAt = Math.round(length - TOWN - u() * 10)
  const names = plan.biomes.slice(0, -1)
  const weights = names.map((_, i) => (i === 0 ? 0.6 : 1) * (0.85 + 0.3 * u()))
  const sum = weights.reduce((a, b) => a + b, 0)
  const biomes: { from: number; to: number; biome: Biome }[] = []
  let from = 0
  names.forEach((biome, i) => {
    const to = i === names.length - 1 ? townAt : Math.round(from + (townAt * weights[i]) / sum)
    biomes.push({ from, to, biome })
    from = to
  })
  biomes.push({ from: townAt, to: length + PAST_END, biome: 'town' })
  const bridges = bridgesOf(biomes)
  // Where a crossing may not lie: on a bridge or within CROSS_CLEAR of its ends.
  const decks = bridges.map((b) => ({ from: b.from - CROSS_CLEAR, to: b.to + CROSS_CLEAR }))

  // What to lay, the hardest to fit first. `near` biomes are preferred when the road has them; `away` ones never used, nor the `holes`.
  const where = (near: readonly Biome[] | null, away: readonly Biome[], inset: number, holes: readonly Span[]) => {
    const anywhere = without(spansOf(biomes, (b) => !away.includes(b), FIRST, length - LAST_CLEAR, inset), holes)
    if (anywhere.length === 0) throw new Error(`no stretch of the ${kind} road is far enough from ${away.join(' and ')}`)
    if (near === null) return anywhere
    const home = without(spansOf(biomes, (b) => near.includes(b) && !away.includes(b), FIRST, length - LAST_CLEAR, inset), holes)
    return spanLength(home) >= 8 ? home : anywhere
  }
  const wants: Want[] = []
  // The ramp's flight stays out of the tunnel and the town.
  if (!training) wants.push({ at: (x) => ({ kind: 'ramp', x }), spans: where(null, ['tunnel', 'town'], 20, []) })
  for (let k = 0; k < (training ? 1 : plan.boulders); k++) {
    const size = training || u() < 0.5 ? 'small' : 'big'
    const gem = !training && u() < 1 / 3
    wants.push({ at: (x) => ({ kind: 'boulder', x, size, gem }), spans: where(null, [], 0, []) })
  }
  const who = training ? 'ducks' : CROSSERS[Math.floor(u() * CROSSERS.length)]
  wants.push({ at: (x) => ({ kind: 'crosser', x, who }), spans: where(CROSSINGS[who], ['tunnel'], 2, decks) })
  if (trip >= 3) {
    const what = trip % 2 === 1 ? 'balloon' : 'train'
    wants.push({ at: (x) => ({ kind: 'surprise', x, what }), spans: where(null, ['tunnel'], 6, what === 'train' ? decks : []) })
  }
  wants.push({ at: (x) => ({ kind: 'present', x }), spans: where(null, [], 0, []) })
  const pickups = training ? { log: TRAINING.logs, clay: 0, sand: 0, gem: 0 } : plan.pickups
  for (const good of ['gem', 'sand', 'clay', 'log'] as const) {
    const n = pickups[good]
    // Mostly in their own biome: all but one in four.
    for (let k = 0; k < n; k++) wants.push({ at: (x) => ({ kind: 'pickup', x, good }), spans: where(k < n - Math.floor(n / 4) ? HOME[good] : null, [], 2, []) })
  }
  const things = lay(wants, u)

  // Rolling hills, flat around every stop, the balloon, the ramp, the start and the end (each sample's distance to flat ground found in two sweeps), scaled down when anywhere would be too steep.
  const flats: Span[] = [
    { from: 0, to: FLAT_START },
    { from: length - FLAT_END, to: length + PAST_END },
  ]
  for (const t of things) {
    if (isStop(t) || t.kind === 'surprise') flats.push({ from: t.x + STOP_FLAT[0], to: t.x + STOP_FLAT[1] })
    if (t.kind === 'ramp') flats.push({ from: t.x + RAMP_FLAT[0], to: t.x + RAMP_FLAT[1] })
  }
  const n = length + PAST_END + 1
  const far = new Float64Array(n).fill(Infinity)
  for (const f of flats) far.fill(0, Math.max(0, Math.ceil(f.from)), Math.floor(f.to) + 1)
  for (let x = 1; x < n; x++) far[x] = Math.min(far[x], far[x - 1] + 1)
  for (let x = n - 2; x >= 0; x--) far[x] = Math.min(far[x], far[x + 1] + 1)
  const waves = WAVES.map((w) => ({ a: w.a, f: (2 * Math.PI) / (w.l + w.dl * u()), p: u() * 2 * Math.PI }))
  const hills = new Float64Array(n)
  let steep = 0
  for (let x = 0; x < n; x++) {
    const k = Math.min(1, far[x] / BLEND)
    let h = 0
    if (k > 0) for (const w of waves) h -= w.a * Math.sin(w.f * x + w.p)
    hills[x] = k * k * (3 - 2 * k) * h
    if (x > 0) steep = Math.max(steep, Math.abs(hills[x] - hills[x - 1]))
  }
  const ground = new Float32Array(n)
  const scale = Math.min(1, MAX_SLOPE / steep)
  for (let x = 0; x < n; x++) ground[x] = hills[x] * scale

  // The ramp's gems, over its flat ground.
  const ramp = things.find((t) => t.kind === 'ramp')
  const v = 0.95 * TOP
  const rampGems =
    ramp === undefined
      ? []
      : [
          ...ARC_DX.map((dx) => ({ x: ramp.x + dx, y: ground[Math.round(ramp.x)] - RAMP.rise - (LAUNCH * dx - (AIR_G * dx * dx) / (2 * v * v)) - TRUCK.height / 2 })),
          { x: ramp.x + FOOT_DX, y: ground[Math.round(ramp.x + FOOT_DX)] - GEM_R },
        ]

  return { kind, trip, seed, length, ground, biomes, bridges, things, sky: trip % 3 === 0 ? 'sunset' : 'day', rampGems }
}

// ---------------------------------------------------------------------------------------
// The drive

/** The height the wheels roll on at road x: the ground, and the ramp's slope up to its lip. */
export function surfaceAt(def: RoadDef, x: number): number {
  const ramp = def.things.find((t) => t.kind === 'ramp')
  const up = ramp !== undefined && x > ramp.x - RAMP.run && x <= ramp.x ? (RAMP.rise * (x - ramp.x + RAMP.run)) / RAMP.run : 0
  return groundAt(def, x) - up
}

/** The truck at the start of a road. */
export function startRoad(def: RoadDef): RoadState {
  return {
    def,
    x: START_X,
    y: surfaceAt(def, START_X),
    v: 0,
    vy: 0,
    airborne: false,
    tilt: 0,
    roll: 0,
    pedal: false,
    pushUntil: -1,
    done: new Int32Array(def.things.length).fill(-1),
    stop: -1,
    stopAt: -1,
    hits: 0,
    hitAt: -1,
    bed: [],
    honkAt: -1,
    present: false,
    endAt: -1,
    selfHit: false,
    answered: -1,
    answerAt: -1,
    rampGot: new Int32Array(def.rampGems.length).fill(-1),
    airAt: -1,
    landAt: -1,
  }
}

/** A good into the keep at once and onto the bed's heap, flying there from (x, y) as a picture from tick `at` for `dur` ticks. */
function credit(s: State, road: RoadState, good: Good, x: number, y: number, at: number, dur: number): void {
  s.keep.goods[good]++
  road.bed.push(good)
  s.flights.push({ good, n: 1, from: { kind: 'road', x, y }, to: { kind: 'bed' }, at, dur })
}

/** A good picked up off the road (or caught from the balloon): credited, and its pickup event. */
function grab(s: State, road: RoadState, good: Good, x: number, y: number, flyFor: number): void {
  credit(s, road, good, x, y, s.tick, ticks(flyFor))
  s.events.push({ kind: 'pickup', good, x, y })
}

/** A hit on the boulder the truck is stopped at, by the child or the builder on their own (`self`); the last one bursts it into the bed, and the truck waits CRACK_PAUSE from it. */
function hit(s: State, road: RoadState, self: boolean): void {
  const b = road.def.things[road.stop]
  if (b.kind !== 'boulder') throw new Error('a hit needs a boulder')
  const r = boulderRect(road.def, b.x, b.size)
  const y = r.y + r.h / 2
  road.hits++
  road.hitAt = s.tick
  road.selfHit = self
  s.events.push({ kind: 'whack', tool: s.keep.look.tool, x: b.x, y })
  if (road.hits < BOULDER_HITS[b.size]) return
  const goods: Good[] = Array<Good>(BOULDER_ROCKS[b.size]).fill('rock')
  if (b.gem) goods.push('gem')
  goods.forEach((good, k) => credit(s, road, good, b.x, y, s.tick + k * ticks(FLY_EVERY), ticks(FLY_FOR)))
  s.events.push({ kind: 'crack', x: b.x, y, gem: b.gem })
  road.done[road.stop] = s.tick
  road.stop = -1
}

/** The tick a burst's pause ends: CRACK_PAUSE after the last hit (every hit pauses the truck, but before the burst it is stopped at the rock anyway); -1 before any hit. */
const pauseEnd = (road: RoadState) => (road.hitAt < 0 ? -1 : road.hitAt + ticks(CRACK_PAUSE))

/** One tick of the drive (s.road is this road). */
export function stepRoad(s: State, road: RoadState): void {
  const def = road.def
  const things = def.things
  const now = s.tick

  // Waiting at a stop while the trip is on: a boulder for its hits (the builder's own after a quiet spell), a crossing and the train for their time.
  if (road.stop >= 0 && road.endAt < 0) {
    const t = things[road.stop]
    if (t.kind === 'boulder') {
      if (now - Math.max(road.stopAt, road.hitAt) >= ticks(road.selfHit ? AUTO_HIT_EVERY : AUTO_HIT)) hit(s, road, true)
    } else if (now - road.stopAt >= ticks(t.kind === 'crosser' ? CROSS_FOR : TRAIN_FOR)) {
      road.done[road.stop] = now
      road.stop = -1
    }
  }

  // The speed: the pedal pulls toward top speed (moved by the hill), letting go rolls to a stop, and the brake keeps it to what ends exactly at the next stop.
  const next = things.findIndex((t, i) => road.done[i] < 0 && isStop(t))
  const nextX = next < 0 ? Infinity : stopX(things[next])
  if (!road.airborne) {
    const slope = groundAt(def, road.x + 0.5) - groundAt(def, road.x - 0.5)
    const going = road.endAt < 0 && now >= pauseEnd(road) && (road.pedal || now < road.pushUntil)
    const pull = PULL_LOW + (PULL_TOP - PULL_LOW) * Math.min(1, road.v / TOP)
    const a = going ? Math.max(-COAST, Math.min(pull, HOLD * (TOP + HILL_SPEED * slope - road.v))) : -COAST + HILL_PULL * slope
    road.v = Math.min(Math.max(0, road.v + a * STEP), Math.sqrt(2 * BRAKE * Math.max(0, nextX - road.x)))
  }
  const x0 = road.x
  road.x = Math.min(x0 + road.v * STEP, nextX)
  road.roll += road.x - x0

  // On the ground, or flying: off the ramp's lip a fast truck is thrown up, a slow one rolls off.
  const ramp = things.findIndex((t) => t.kind === 'ramp')
  if (road.airborne) {
    road.vy += AIR_G * STEP
    road.y += road.vy * STEP
    const floor = surfaceAt(def, road.x)
    if (road.y >= floor) {
      road.y = floor
      road.vy = 0
      road.airborne = false
      road.landAt = now
      s.events.push({ kind: 'land', hard: now - road.airAt >= ticks(HARD_LANDING), x: road.x, y: road.y })
    }
  } else if (ramp >= 0 && road.done[ramp] < 0 && road.x > things[ramp].x) {
    const fly = road.v >= FLY_FROM * TOP
    road.done[ramp] = now
    road.airborne = true
    road.airAt = now
    road.vy = fly ? -LAUNCH * road.v : 0
    road.y = surfaceAt(def, things[ramp].x)
    if (fly) s.events.push({ kind: 'ramp', x: road.x, y: road.y })
  } else road.y = surfaceAt(def, road.x)
  const half = TRUCK.wheelBase / 2
  const tilt = road.airborne ? 0.5 * Math.atan2(road.vy, Math.max(1, road.v)) : Math.atan((surfaceAt(def, road.x + half) - surfaceAt(def, road.x - half)) / TRUCK.wheelBase)
  road.tilt += (tilt - road.tilt) * Math.min(1, TILT_RATE * STEP)

  // Arriving at a stop.
  if (next >= 0 && road.stop < 0 && road.x >= nextX - ARRIVE) {
    const t = things[next]
    road.x = nextX
    road.v = 0
    road.stop = next
    road.stopAt = now
    road.hits = 0
    road.selfHit = false
    s.events.push({ kind: 'stop', why: t.kind === 'boulder' ? 'boulder' : t.kind === 'crosser' ? 'crosser' : 'surprise' })
  }

  // What the truck reaches while the trip is on: pickups and the present at its front bumper, the balloon over it, the ramp's gems where it touches them, and the street sign.
  if (road.endAt >= 0) return
  const front = road.x + TRUCK.length / 2
  things.forEach((t, i) => {
    if (road.done[i] >= 0) return
    if (t.kind === 'pickup' && front >= t.x) {
      road.done[i] = now
      grab(s, road, t.good, t.x, groundAt(def, t.x) - 0.25, GRAB_FOR)
    } else if (t.kind === 'present' && front >= t.x) {
      road.done[i] = now
      road.present = true
      s.events.push({ kind: 'present' })
    } else if (t.kind === 'surprise' && t.what === 'balloon' && road.x >= t.x - BALLOON_LEAD) {
      road.done[i] = now
      grab(s, road, 'gem', t.x, groundAt(def, t.x) - BALLOON_UP, BALLOON_FALL)
    }
  })
  def.rampGems.forEach((g, k) => {
    const touch = Math.abs(g.x - road.x) <= TRUCK.length / 2 + GEM_R && g.y >= road.y - TRUCK.height - GEM_R && g.y <= road.y + GEM_R
    if (road.rampGot[k] < 0 && touch) {
      road.rampGot[k] = now
      grab(s, road, 'gem', g.x, g.y, GRAB_FOR)
    }
  })
  if (road.x >= def.length) {
    road.endAt = now
    s.events.push({ kind: 'arrive' })
  }
}

/** The truck is stopped at a boulder still standing: the pedal is the tool button. */
const atBoulder = (road: RoadState) => road.stop >= 0 && road.def.things[road.stop].kind === 'boulder'

/** The pedal held or let go. A press is a push (so a quick tap still rolls the truck), or a hit at a boulder. */
export function roadPedal(s: State, road: RoadState, down: boolean): void {
  road.pedal = down
  if (down) roadPush(s, road)
}

/** A quick tap on the pedal while the trip is on: at a boulder a hit; elsewhere a push of PUSH seconds, from the end of a burst's pause when it comes during one, so it rolls the truck its whole way. */
export function roadPush(s: State, road: RoadState): void {
  if (road.endAt >= 0) return
  if (atBoulder(road)) roadWhack(s, road)
  else road.pushUntil = Math.max(s.tick, pauseEnd(road)) + ticks(PUSH)
}

/** The horn while the trip is on, at most twice a second: the nearest crosser family within ANSWER_NEAR metres, or the train while it passes, answers. */
export function roadHorn(s: State, road: RoadState): void {
  if (road.endAt >= 0 || (road.honkAt >= 0 && s.tick - road.honkAt < ticks(HONK_EVERY))) return
  road.honkAt = s.tick
  s.events.push({ kind: 'honk', x: road.x, y: road.y })
  let best = -1
  let near = ANSWER_NEAR
  road.def.things.forEach((t, i) => {
    const d = Math.abs(t.x - road.x)
    if ((t.kind === 'crosser' || (t.kind === 'surprise' && t.what === 'train' && road.stop === i)) && d <= near) {
      best = i
      near = d
    }
  })
  if (best < 0) return
  const t = road.def.things[best]
  road.answered = best
  road.answerAt = s.tick
  s.events.push({ kind: 'answer', who: t.kind === 'crosser' ? t.who : 'train', x: t.x, y: groundAt(road.def, t.x) })
}

/** A hit on the boulder the truck is stopped at (the tool button, or a tap on the rock), at most four a second, while the trip is on. A tap that reaches the tool button as the rock bursts (during the burst's pause, before the button turns back into the pedal) is the pedal's tap: a push. */
export function roadWhack(s: State, road: RoadState): void {
  if (road.endAt >= 0) return
  if (atBoulder(road)) {
    if (road.hitAt < 0 || s.tick - road.hitAt >= ticks(WHACK_EVERY)) hit(s, road, false)
  } else if (s.tick < pauseEnd(road)) roadPush(s, road)
}
