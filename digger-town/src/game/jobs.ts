/**
 * The story's jobs and the generator that goes on after it: the data, each step's progress, its
 * pointer and pictures, what a step leaves behind, the friends that bring machines, the chapters'
 * parties and cards, and `applyDone` for restoring a save. Everything a step reports is read from
 * the sim, and everything that changes what happens lives in fields of `Sim`, `JobRun` and the
 * machines, so a structured clone of a sim plays on exactly as the sim itself would. The few
 * module-level caches (`beds`, `natural`) are pure functions of constant data.
 */

import {
  BUILDS, BUILD_HALF, DIG_GRAVEL, DIG_ROCK, DIG_SAND, FLOOR_DIGS, FOREST_RING, FORMS, HOLES, HOME, HUT, LOTS, MOBILE_PARK, BRIDGE, BRIDGE_PIECES_AT, ENTRY, OBSTACLES, PALLET_RING, PARK_GRAVEL, PARTY_AREAS, PARK_ROCK, PARK_SAND, inArea,
  PLANTS, PLAY_PARK, PLAY_PIECES_AT, POND_AT, POND_DIG, POND_PARK, RIVER, ROAD_WIDTH, ROADS, SANDPIT, SANDPIT_RING, TIP_RINGS, WATER_RING,
} from './map'
import type { Area } from './map'
import { BED_HINGE_Z, BED_LEN, BLADE_Z, CELL, CHAPTER_IDS, COINS, COUNTER_JIB, HITCH_Z, JIB_LEN, MACHINE_SPECS, OUTRIGGER_Z, PAD_R, TRAILER_AXLE, TURRET_Z, DAY_OF, DIG_MAX, DIG_MIN, HALF, HOP_FOR, LOG_FULL, MIXER_SAND, REACH_RANGE, ROAD_Y, SCOOP, SIDE, TROLLEY_RANGE, padX } from './model'
import type { Tower, Build, Card, ChapterId, Goal, Terrain, Job, JobRun, Machine, MachineKind, Picture, PlantId, Pointer, Sim, Species, Spot, Step, StepView, Thing, ThingKind, Zone } from './model'
import { clamp, clamp01, localX, localZ, mulberry32, toward, turnTo } from './math'
import { arrived, bedTail, bucketTip, craneBase, receivers } from './machines'
import { NO_AIMS, actionFace, blockButton, nothingToDo, receiverOf } from './hands'
import type { Aims } from './hands'
import { footprints, overlapDepth, rectOf } from './overlap'
import type { Rect } from './overlap'
import { createTerrain, cutBowl, deficitIn, levelShape, markRoadBuilt, setSurface, spill } from './terrain'
import { PARTY_FOR, award, feedPlant, groundY, moveIn, placeInRing, spawnAnimal, spawnThing, startParty } from './world'

// ---------------------------------------------------------------------------------------
// The story.

const sandInto = (scoops: number): Step => ({ kind: 'scoop', into: 'dumper', stuff: 'sand', scoops, park: PARK_SAND, dig: DIG_SAND })
const holeZone = (i: number): Zone => ({ x: HOLES[i].x, z: HOLES[i].z, r: HOLES[i].r })

const FLOOR_Y = -0.3
const BRICKS_AT = PLANTS.press.outSlots
const PLANKS_AT = PLANTS.saw.outSlots

/** The steps that bring bricks from sand: scoop, feed the press, watch it, carry the pallets to the crane's ring. */
const brickSteps = (): Step[] => [
  sandInto(3),
  { kind: 'feed', plant: 'press', stuff: 'sand', need: 4.8, refill: 0 },
  { kind: 'watch', what: { plant: 'press' }, x: PLANTS.press.x, z: PLANTS.press.z },
  { kind: 'carry', thing: 'bricks', count: 3, ring: PALLET_RING },
]

/** The steps that bring planks from the forest: the lorry loads, drives to the saw, unloads and the saw runs. */
const logSteps = (): Step[] => [
  { kind: 'drive', machine: 'semi', ring: FOREST_RING },
  { kind: 'watch', what: 'logs', x: FOREST_RING.x, z: FOREST_RING.z },
  { kind: 'drive', machine: 'semi', ring: PLANTS.saw.ring },
  { kind: 'unload' },
  { kind: 'watch', what: { plant: 'saw' }, x: PLANTS.saw.x, z: PLANTS.saw.z },
]

/** The steps that pour a floor: scoop sand into the mixer, water it, pour it into the form, watch it set. `first` is the scoop's index in the job. */
const floorSteps = (form: number, first: number): Step[] => [
  { kind: 'scoop', into: 'mixer', stuff: 'sand', scoops: 2, park: PARK_SAND, dig: DIG_SAND },
  { kind: 'water' },
  { kind: 'pour', form, refill: first },
  { kind: 'watch', what: { form }, x: LOTS[FORMS[form].lot].x, z: LOTS[FORMS[form].lot].z },
]

/** A job's par is this many times the tap bot's time for it: a bot is perfect and a four-year-old is not. A different factor is this one line. */
export const PAR_FACTOR = 2.5

/** Seconds the tap bot takes for each story job, as sim.test.ts measures it (the test fails when a number goes stale). */
export const BOT_SECONDS: Readonly<Record<string, number>> = {
  hole1: 47,
  hole2: 38,
  rollMain: 23,
  street: 15,
  floorHole: 23,
  cement: 47,
  bricks: 54,
  walls: 20,
  logs: 22,
  roof: 18,
  rocks: 22,
  gravel: 72,
  span: 27,
  sandpit: 70,
  slide: 24,
  pond: 23,
  hallFloor: 99,
  hallBricks: 50,
  hallWalls: 25,
  hallTop: 41,
}

/** The par for a bot time. */
export const parOf = (botSeconds: number): number => Math.round(PAR_FACTOR * botSeconds)

/** A job with the defaults filled in and its par from the bot's time: the story's data by id, or the given seconds. */
const job = (j: Omit<Job, 'setup' | 'movesIn' | 'brings' | 'par'> & Partial<Pick<Job, 'setup' | 'movesIn' | 'brings'>>, botSeconds: number | undefined = BOT_SECONDS[j.id]): Job => {
  if (botSeconds === undefined) throw new Error(`no bot time for job ${j.id}`)
  return { setup: [], movesIn: null, brings: [], par: parOf(botSeconds), ...j }
}
const at = (p: readonly [number, number], thing: ThingKind) => ({ thing, count: 1, x: p[0], z: p[1] })

/** Each story job, in order. */
export const STORY: readonly Job[] = [
  job({
    id: 'hole1',
    chapter: 'road',
    who: 'hedgehog',
    wish: ['road', 'hole', 'sand'],
    brings: ['digger', 'dumper', 'dozer'],
    steps: [sandInto(3), { kind: 'tip', zone: TIP_RINGS[0], stuff: 'sand', need: 4.8, refill: 0 }, { kind: 'push', hole: holeZone(0), level: 0, need: 0.8, refill: 0 }],
  }),
  job({
    id: 'hole2',
    chapter: 'road',
    who: 'hedgehog',
    wish: ['road', 'hole', 'sand'],
    steps: [sandInto(3), { kind: 'tip', zone: TIP_RINGS[1], stuff: 'sand', need: 4.8, refill: 0 }, { kind: 'push', hole: holeZone(1), level: 0, need: 0.8, refill: 0 }],
  }),
  job({ id: 'rollMain', chapter: 'road', who: 'hedgehog', wish: ['road', 'roller'], brings: ['roller'], steps: [{ kind: 'roll', road: 0, need: 0.9 }] }),
  job({ id: 'street', chapter: 'house', who: 'bunny', wish: ['house', 'road'], steps: [{ kind: 'roll', road: 1, need: 0.9 }] }),
  job({
    id: 'floorHole',
    chapter: 'house',
    who: 'bunny',
    wish: ['house', 'floor', 'hole'],
    steps: [{ kind: 'digOut', zone: FLOOR_DIGS[0].dig, scoops: 3, park: FLOOR_DIGS[0].park, makes: { form: 0 } }],
  }),
  job({ id: 'cement', chapter: 'house', who: 'bunny', wish: ['house', 'floor', 'mixer'], brings: ['mixer'], steps: floorSteps(0, 0) }),
  job({ id: 'bricks', chapter: 'house', who: 'bunny', wish: ['house', 'bricks', 'press'], brings: ['forklift'], steps: brickSteps() }),
  job({ id: 'walls', chapter: 'house', who: 'bunny', wish: ['house', 'wall', 'tower'], brings: ['tower'], steps: [{ kind: 'lift', crane: 'tower', build: 0, pieces: 3 }] }),
  job({ id: 'logs', chapter: 'house', who: 'bunny', wish: ['house', 'logs', 'semi'], brings: ['semi'], steps: logSteps() }),
  job({ id: 'roof', chapter: 'house', who: 'bunny', wish: ['house', 'roof', 'tower'], steps: [{ kind: 'lift', crane: 'tower', build: 0, pieces: 2 }], movesIn: { who: 'bunny', build: 0 } }),
  job({
    id: 'rocks',
    chapter: 'bridge',
    who: 'cow',
    wish: ['bridge', 'rock', 'crusher'],
    steps: [{ kind: 'scoop', into: 'crusher', stuff: 'rock', scoops: 2, park: PARK_ROCK, dig: DIG_ROCK }, { kind: 'watch', what: { plant: 'crusher' }, x: PLANTS.crusher.x, z: PLANTS.crusher.z }],
  }),
  job({
    id: 'gravel',
    chapter: 'bridge',
    who: 'cow',
    wish: ['bridge', 'gravel', 'road'],
    steps: [
      { kind: 'scoop', into: 'dumper', stuff: 'gravel', scoops: 3, park: PARK_GRAVEL, dig: DIG_GRAVEL },
      { kind: 'tip', zone: { x: 8, z: -10, r: 4 }, stuff: 'gravel', need: 4.8, refill: 0 },
      { kind: 'clear', zone: { x: 8, z: -10, r: 6 }, max: 1 },
      { kind: 'roll', road: 2, need: 0.9 },
    ],
  }),
  job({
    id: 'span',
    chapter: 'bridge',
    who: 'cow',
    wish: ['bridge', 'mobile'],
    brings: ['mobile'],
    setup: [at(BRIDGE_PIECES_AT[0], 'pier'), at(BRIDGE_PIECES_AT[1], 'beam'), at(BRIDGE_PIECES_AT[2], 'beam')],
    steps: [{ kind: 'lift', crane: 'mobile', build: 1, pieces: 3 }],
  }),
  job({
    id: 'sandpit',
    chapter: 'play',
    who: 'duck',
    wish: ['playground', 'sand', 'hole'],
    steps: [sandInto(3), { kind: 'tip', zone: SANDPIT_RING, stuff: 'sand', need: 4.8, refill: 0 }, { kind: 'push', hole: { x: SANDPIT.x, z: SANDPIT.z, r: SANDPIT.r }, level: 0, need: 0.8, refill: 0 }],
  }),
  job({
    id: 'slide',
    chapter: 'play',
    who: 'duck',
    wish: ['playground', 'mobile'],
    setup: [at(PLAY_PIECES_AT[0], 'slide'), at(PLAY_PIECES_AT[1], 'swing'), at(PLAY_PIECES_AT[2], 'climber')],
    steps: [{ kind: 'lift', crane: 'mobile', build: 2, pieces: 3 }],
  }),
  job({
    id: 'pond',
    chapter: 'play',
    who: 'duck',
    wish: ['pond', 'hole'],
    steps: [{ kind: 'digOut', zone: POND_DIG, scoops: 3, park: POND_PARK, makes: { pond: 0 } }, { kind: 'watch', what: { pond: 0 }, x: POND_AT.x, z: POND_AT.z }],
  }),
  job({ id: 'hallFloor', chapter: 'clock', who: 'hedgehog', wish: ['clock', 'floor'], steps: [{ kind: 'digOut', zone: FLOOR_DIGS[1].dig, scoops: 3, park: FLOOR_DIGS[1].park, makes: { form: 1 } }, ...floorSteps(1, 1)] }),
  job({ id: 'hallBricks', chapter: 'clock', who: 'hedgehog', wish: ['clock', 'bricks', 'press'], steps: brickSteps() }),
  job({ id: 'hallWalls', chapter: 'clock', who: 'hedgehog', wish: ['clock', 'wall', 'tower'], steps: [{ kind: 'lift', crane: 'tower', build: 3, pieces: 3 }] }),
  job({
    id: 'hallTop',
    chapter: 'clock',
    who: 'hedgehog',
    wish: ['clock', 'roof', 'logs'],
    setup: [{ thing: 'clock', count: 1, x: PALLET_RING.x, z: PALLET_RING.z }],
    steps: [...logSteps(), { kind: 'lift', crane: 'tower', build: 3, pieces: 3 }],
  }),
]

// ---------------------------------------------------------------------------------------
// The generator.

export const MORE_TEMPLATES = ['house', 'pile', 'hill', 'delivery', 'logs', 'gravel'] as const
export type MoreTemplate = (typeof MORE_TEMPLATES)[number]

/** Seconds the tap bot takes for each template on average over its variants, as sim.test.ts measures it; the par is PAR_FACTOR times this. */
export const MORE_BOT_SECONDS: Readonly<Record<MoreTemplate, number>> = { house: 56, pile: 14, hill: 35, delivery: 30, logs: 18, gravel: 23 }

/** Where an animal may want sand tipped, and where it may want a pallet of bricks brought: open ground clear of lots, roads and plants. */
export const HILL_RINGS: readonly Zone[] = [
  { x: -10, z: 40, r: 4 },
  { x: 34, z: 40, r: 4 },
  { x: 32, z: 22, r: 4 },
  { x: -2, z: -30, r: 4 },
]
export const DELIVERY_RINGS: readonly Zone[] = [
  { x: 30, z: 24, r: 3 },
  { x: -32, z: 38, r: 3 },
  { x: -8, z: -30, r: 3 },
]
/** The generated houses' builds, and where the main road's sand heap may lie. */
export const MORE_HOUSES = [4, 5, 6] as const
export const PILE_X = { lo: -12, hi: 16 }

const ASKERS: readonly Species[] = ['bunny', 'duck', 'pig', 'cat', 'dog', 'cow', 'sheep', 'fox', 'bear', 'frog']

/** The template a job came from: its id is `<template>-<n>`. */
export function templateOf(j: Job): MoreTemplate | null {
  const t = MORE_TEMPLATES.find((m) => j.id.startsWith(`${m}-`))
  return t === undefined ? null : t
}

/**
 * The next job after the story. `Sim.seed` is the generator's random state and `Sim.lastTemplate`
 * the index of the template it made last, so a template never comes twice running; this advances
 * both. A house comes only while a lot is free.
 */
export function nextMoreJob(s: Sim): Job {
  const last = s.lastTemplate
  const rnd = mulberry32(s.seed)
  const free = MORE_HOUSES.filter((b) => !s.builds[b].shown && s.builds[b].placed === 0)
  const options = MORE_TEMPLATES.filter((t, i) => i !== last && (t !== 'house' || free.length > 0))
  const template = options[Math.floor(rnd() * options.length)]
  const asker = ASKERS[Math.floor(rnd() * ASKERS.length)]
  const pick = rnd()
  s.seed = Math.floor(rnd() * 2 ** 31)
  s.lastTemplate = MORE_TEMPLATES.indexOf(template)
  const id = `${template}-${s.moreDone}`
  const base = { id, chapter: 'more' as const, who: asker }
  const make = (j: Parameters<typeof job>[0]) => job(j, MORE_BOT_SECONDS[template])
  switch (template) {
    case 'house': {
      const b = free[Math.floor(pick * free.length)]
      const owner = BUILDS[b].owner
      if (owner === null) throw new Error(`build ${b} has no owner`)
      return make({
        ...base,
        who: owner,
        wish: ['house', 'bricks', 'planks'],
        setup: [...BRICKS_AT.map((p) => at(p, 'bricks')), ...PLANKS_AT.map((p) => at(p, 'planks'))],
        steps: [{ kind: 'carry', thing: 'bricks', count: 3, ring: PALLET_RING }, { kind: 'lift', crane: 'tower', build: b, pieces: 5 }],
        movesIn: { who: owner, build: b },
      })
    }
    case 'pile': {
      const x = PILE_X.lo + Math.floor(pick * (PILE_X.hi - PILE_X.lo + 1))
      return make({ ...base, wish: ['sand', 'road', 'dozer'], steps: [{ kind: 'clear', zone: { x, z: 30, r: 3.5 }, max: 1.3 }] })
    }
    case 'hill':
      return make({ ...base, wish: ['sand', 'arrow', 'hole'], steps: [sandInto(3), { kind: 'tip', zone: HILL_RINGS[Math.floor(pick * HILL_RINGS.length)], stuff: 'sand', need: 4.8, refill: 0 }] })
    case 'delivery':
      return make({ ...base, wish: ['bricks', 'arrow', 'forklift'], setup: BRICKS_AT.slice(0, 2).map((p) => at(p, 'bricks')), steps: [{ kind: 'carry', thing: 'bricks', count: 2, ring: DELIVERY_RINGS[Math.floor(pick * DELIVERY_RINGS.length)] }] })
    case 'logs':
      return make({ ...base, wish: ['logs', 'saw', 'semi'], steps: logSteps() })
    case 'gravel':
      return make({
        ...base,
        wish: ['rock', 'crusher', 'gravel'],
        steps: [{ kind: 'scoop', into: 'crusher', stuff: 'rock', scoops: 2, park: PARK_ROCK, dig: DIG_ROCK }, { kind: 'watch', what: { plant: 'crusher' }, x: PLANTS.crusher.x, z: PLANTS.crusher.z }],
      })
  }
}

/** The job that comes next: the story's, then the generator's. */
export function nextJob(s: Sim): Job {
  return s.storyDone < STORY.length ? STORY[s.storyDone] : nextMoreJob(s)
}

// ---------------------------------------------------------------------------------------
// Commands the sim, the speech and the jobs share.

/** The builder hops into a machine that has come: it takes over its goal if it has one, and the button is blocked until pressed again. `own` is the child's choice (a tap, a key, a spoken name); the job's automatic hop is not. */
function hop(s: Sim, kind: MachineKind, own: boolean): void {
  const to = s.machines[kind]
  if (!to.unlocked) throw new Error(`cannot hop into the ${kind}: it has not come`)
  if (kind === s.active) return
  s.hop = { from: s.active, to: kind, t: 0 }
  s.lastHop = { from: s.active, at: s.time }
  if (own) s.ownHopAt = s.time
  s.events.push({ kind: 'hop', from: s.active, to: kind })
  s.active = kind
  to.friend = false
  blockButton(s)
}

/** The child hops into a machine. */
export const hopTo = (s: Sim, kind: MachineKind): void => hop(s, kind, true)

/** Sends a machine to a spot. `friend` is a small animal in the cab; it is not one if the child is in the machine. */
export function driveTo(s: Sim, m: Machine, x: number, z: number, within: number, pace: number, friend: boolean, yaw: number | null = null, reverse = false): void {
  const goal: Goal = { x, z, within, reverse, thenPress: false, yaw, pace }
  m.goal = goal
  m.friend = friend && m.kind !== s.active
}

/** A truck that stops within 1.5 m of a ring's middle has its tail up to 4.45 m from it: the tail counts as in the ring this far outside it. */
const TAIL_SLACK = 0.5
const inZone = (x: number, z: number, zone: Zone, slack = 0) => Math.hypot(x - zone.x, z - zone.z) <= zone.r + slack
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

/** The place (x, z) beside a machine on its left, `side` 1, or its right, -1. */
const beside = (m: { x: number; z: number; yaw: number }, side: number, away: number) => ({ x: m.x + Math.cos(m.yaw) * away * side, z: m.z - Math.sin(m.yaw) * away * side })

/** True if a point is clear of the trees, the plants and the standing houses by `clearance` metres. */
function clearOfStanding(s: Sim, x: number, z: number, clearance: number): boolean {
  for (const [ox, oz, or] of OBSTACLES) if (Math.hypot(x - ox, z - oz) < or + clearance) return false
  for (const b of s.builds) if (b.placed > 0 && b.kind !== 'bridge' && Math.abs(x - b.x) < BUILD_HALF[b.kind][0] + clearance && Math.abs(z - b.z) < BUILD_HALF[b.kind][1] + clearance) return false
  return Math.abs(x) < 42 && Math.abs(z) < 42
}

/** A friend stops this far to the side of the machine it comes to, and within this much of that spot: always inside the digger's reach for a receiver (`DUMP_MAX` less 0.5). */
const FRIEND_AWAY = 5
const FRIEND_WITHIN = 0.8

/** A friend drives a machine next to another one, on whichever side is clear: the truck for the digger, the called machine for "tule tänne". */
export function callFriend(s: Sim, kind: MachineKind, to: Machine): void {
  const m = s.machines[kind]
  const sides = [1, -1].map((side) => beside(to, side, FRIEND_AWAY)).sort((p, q) => near(p, m) - near(q, m))
  const spot = sides.find((p) => clearOfStanding(s, p.x, p.z, 2.5)) ?? sides[0]
  driveTo(s, m, spot.x, spot.z, FRIEND_WITHIN, 1.5, true, to.yaw)
}

// ---------------------------------------------------------------------------------------
// Reading a step.

/** The machine a step is done with, or null when it only waits. */
export function machineOf(step: Step): MachineKind | null {
  switch (step.kind) {
    case 'scoop':
    case 'digOut':
      return 'digger'
    case 'tip':
    case 'feed':
      return 'dumper'
    case 'push':
    case 'clear':
      return 'dozer'
    case 'roll':
      return 'roller'
    case 'water':
    case 'pour':
      return 'mixer'
    case 'carry':
      return 'forklift'
    case 'lift':
      return step.crane
    case 'drive':
      return step.machine
    case 'unload':
      return 'semi'
    case 'watch':
      return null
  }
}

/** The road bed's points per road, found once per terrain. Saves time only: the bed never changes after creation, so a clone finds the same lists. */
const beds = new WeakMap<object, Int32Array[]>()
export function bedPoints(s: Sim, road: number): Int32Array {
  let lists = beds.get(s.terrain.bed)
  if (lists === undefined) {
    const found: number[][] = ROADS.map(() => [])
    for (let i = 0; i < s.terrain.bed.length; i++) if (s.terrain.bed[i] >= 0) found[s.terrain.bed[i]].push(i)
    lists = found.map((l) => Int32Array.from(l))
    beds.set(s.terrain.bed, lists)
  }
  return lists[road]
}

/** How much of a road is rolled into road, 0 to 1. */
function rolledShare(s: Sim, road: number): number {
  const pts = bedPoints(s, road)
  let n = 0
  for (const i of pts) if (s.terrain.rolled[i] >= 1) n++
  return n / pts.length
}

const worldAt = (i: number) => ({ x: (i % SIDE) * CELL - HALF, z: Math.floor(i / SIDE) * CELL - HALF })

/** How far ahead of the roller its marker stays: out of its turning circle. */
const ROLL_AHEAD = 8

/** Where the roller goes next: the nearest road-bed point not yet road that is at least 3 m ahead of it, else the nearest. */
function rollAim(s: Sim, run: JobRun, road: number): { x: number; z: number } {
  if (run.roll !== null && s.time - run.roll.at < 0.25) return run.roll
  const m = s.machines.roller
  let nearest = -1
  let nearestD = Infinity
  for (const i of bedPoints(s, road)) {
    if (s.terrain.rolled[i] >= 1) continue
    const p = worldAt(i)
    const d = Math.hypot(p.x - m.x, p.z - m.z)
    if (d < nearestD) {
      nearest = i
      nearestD = d
    }
  }
  // The marker stays at least ROLL_AHEAD ahead, past the point if need be, so the roller keeps moving over it.
  let aim = { x: m.x, z: m.z }
  if (nearest >= 0) {
    const p = worldAt(nearest)
    const k = nearestD >= ROLL_AHEAD ? 1 : ROLL_AHEAD / Math.max(nearestD, 0.3)
    aim = nearestD < 0.3 ? { x: m.x + Math.sin(m.yaw) * ROLL_AHEAD, z: m.z + Math.cos(m.yaw) * ROLL_AHEAD } : { x: m.x + (p.x - m.x) * k, z: m.z + (p.z - m.z) * k }
  }
  run.roll = { ...aim, at: s.time }
  return aim
}

/** How far from a hole a heap still counts as near it. */
const HEAP_RADIUS = 14
/** The valley as it was made: what stands higher than this has been put there. Built on first use and never written: it saves time only. */
let natural: Terrain | null = null
/** The pits the map cuts. */
const HOLE_SHAPES: readonly Zone[] = [...HOLES, SANDPIT]

/** A skin this thin over the first ground is not a heap: the blade rides on what is that thin, as it rides over the ground's lumps. */
const SKIN = 0.08

/** Cubic metres standing in a zone higher than the ground first lay, where their middle is, and how far out from it the stuff reaches: twice the root mean square distance of the stuff from the middle, so the blade can stand behind the whole of it. A point inside `skip` does not count. */
function risenIn(s: Sim, zone: Zone, skip: Zone | null): { x: number; z: number; volume: number; reach: number } {
  natural ??= createTerrain()
  const t = s.terrain
  let sx = 0
  let sz = 0
  let sq = 0
  let sum = 0
  const ix0 = Math.max(0, Math.ceil((zone.x - zone.r + HALF) / CELL))
  const ix1 = Math.min(SIDE - 1, Math.floor((zone.x + zone.r + HALF) / CELL))
  const iz0 = Math.max(0, Math.ceil((zone.z - zone.r + HALF) / CELL))
  const iz1 = Math.min(SIDE - 1, Math.floor((zone.z + zone.r + HALF) / CELL))
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = ix * CELL - HALF
      const z = iz * CELL - HALF
      if (Math.hypot(x - zone.x, z - zone.z) > zone.r || (skip !== null && Math.hypot(x - skip.x, z - skip.z) < skip.r)) continue
      const i = ix + iz * SIDE
      // A hole the map cut and the story filled counts as level ground, not as stuff put there.
      const was = HOLE_SHAPES.some((h) => Math.hypot(x - h.x, z - h.z) < h.r) ? Math.max(natural.hard[i] + natural.loose[i], ROAD_Y) : natural.hard[i] + natural.loose[i]
      const up = Math.max(0, t.hard[i] + t.loose[i] - was - SKIN)
      sum += up
      sx += up * x
      sz += up * z
      sq += up * (x * x + z * z)
    }
  }
  const x = sum > 0 ? sx / sum : zone.x
  const z = sum > 0 ? sz / sum : zone.z
  return { x, z, volume: sum * CELL * CELL, reach: sum > 0 ? 2 * Math.sqrt(Math.max(0, sq / sum - x * x - z * z)) : 0 }
}

/** The farthest a heap is taken to reach from its middle when the dozer stands behind it, in metres: a thin wide skirt of sand does not send the dozer far from the heap. */
const MOST_REACH = 4

/** The dozer starts a pass this far behind the heap's far edge, past its blade's reach: it turns and lowers the blade as it sets off, and is a metre or two on by then. */
const RUN_UP = 2.5

/** How far past the ring a truck tipped in a heap of its sand still lies. */
const TIPPED_SPREAD = 1.5

/** The heap a push step works on: how much has been put on the ground within `HEAP_RADIUS` of the hole (outside the hole itself), and where its middle is: the middle of the sand the truck before it tipped (its ring and a little more) while any lies there, so sand left beside another hole does not pull the dozer off it. */
function heapNear(s: Sim, run: JobRun, hole: Zone): NonNullable<JobRun['heap']> {
  if (run.heap !== null && s.time - run.heap.at < 0.25) return run.heap
  const skip = { x: hole.x, z: hole.z, r: hole.r + 1 }
  const all = risenIn(s, { x: hole.x, z: hole.z, r: HEAP_RADIUS }, skip)
  const before = run.step > 0 ? run.job.steps[run.step - 1] : null
  const tipped = before !== null && before.kind === 'tip' ? risenIn(s, { ...before.zone, r: before.zone.r + TIPPED_SPREAD }, skip) : all
  const middle = tipped.volume > 0 ? tipped : all
  run.heap = all.volume > 0 ? { x: middle.x, z: middle.z, volume: all.volume, reach: middle.reach, at: s.time } : { x: hole.x - 6, z: hole.z, volume: 0, reach: 0, at: s.time }
  return run.heap
}

/** Unit direction a pushed heap goes along a road: the nearest road's way from its a-end to its b-end. */
function roadWay(zone: Zone): { x: number; z: number } {
  let best: (typeof ROADS)[number] = ROADS[0]
  let bestD = Infinity
  for (const r of ROADS) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az)
    const ux = (r.bx - r.ax) / len
    const uz = (r.bz - r.az) / len
    const along = clamp((zone.x - r.ax) * ux + (zone.z - r.az) * uz, 0, len)
    const d = Math.hypot(zone.x - (r.ax + ux * along), zone.z - (r.az + uz * along))
    if (d < bestD) {
      best = r
      bestD = d
    }
  }
  const len = Math.hypot(best.bx - best.ax, best.bz - best.az)
  return { x: (best.bx - best.ax) / len, z: (best.bz - best.az) / len }
}

/** How far to one side of the heap's line a pass of the dozer runs: the straight pass, then one to either side, so a heap spread wider than the blade is all pushed in or swept. */
const passSide = (run: JobRun) => [0, 1.6, -1.6][run.passes % 3]

/** The two points the dozer goes between to clear a heap: behind it, and past the zone, on the line through the heap's middle. */
function clearEnds(s: Sim, run: JobRun, zone: Zone): { from: { x: number; z: number }; to: { x: number; z: number } } {
  if (run.heap === null || s.time - run.heap.at >= 0.25) run.heap = { ...risenIn(s, zone, null), at: s.time }
  const way = roadWay(zone)
  const c = run.heap
  const side = passSide(run)
  const cx = c.x - way.z * side
  const cz = c.z + way.x * side
  return { from: { x: cx - way.x * (zone.r + 2.5), z: cz - way.z * (zone.r + 2.5) }, to: { x: cx + way.x * (zone.r + 6), z: cz + way.z * (zone.r + 6) } }
}

/** The two points the dozer goes between to fill a hole: behind the whole heap, so the blade meets it from its far edge and carries all of it, and just past the hole. */
function pushEnds(s: Sim, run: JobRun, hole: Zone): { from: { x: number; z: number }; to: { x: number; z: number } } {
  const heap = heapNear(s, run, hole)
  const len = Math.hypot(heap.x - hole.x, heap.z - hole.z)
  const dx = (heap.x - hole.x) / len
  const dz = (heap.z - hole.z) / len
  const side = passSide(run)
  const ox = -dz * side
  const oz = dx * side
  const behind = Math.min(heap.reach, MOST_REACH) + BLADE_Z + RUN_UP
  return { from: { x: heap.x + dx * behind + ox, z: heap.z + dz * behind + oz }, to: { x: hole.x - dx * 0.8 + ox, z: hole.z - dz * 0.8 + oz } }
}

/** The things of a kind lying free on the ground (not held, not used up). */
const freeThings = (s: Sim, kind: ThingKind) => s.things.filter((t) => t.kind === kind && !t.gone && t.heldBy === null)

/** Whether a point is inside a crane's reach from where it stands. */
function inCraneReach(s: Sim, crane: 'tower' | 'mobile', x: number, z: number): boolean {
  const range = crane === 'tower' ? TROLLEY_RANGE : REACH_RANGE
  const d = near(craneBase(s.machines[crane]), { x, z })
  return d >= range[0] - 0.5 && d <= range[1] + 0.5
}

/** The thing a lift step wants next, if there is one the crane can reach (a truck crane drives closer, so it reaches any). */
function nextThing(s: Sim, step: Extract<Step, { kind: 'lift' }>): Thing | null {
  const b = s.builds[step.build]
  if (b.placed >= b.spots.length) return null
  const cands = freeThings(s, b.spots[b.placed].wants)
  const base = craneBase(s.machines[step.crane])
  cands.sort((p, q) => near(p, base) - near(q, base))
  return cands.find((t) => step.crane === 'mobile' || inCraneReach(s, step.crane, t.x, t.z)) ?? null
}

/**
 * When the tower's next thing lies out of its reach (a child's forklift put it down elsewhere),
 * the forklift is asked to carry it to the pallet ring: the thing it should fetch, or null.
 */
function rescueThing(s: Sim, step: Extract<Step, { kind: 'lift' }>): Thing | null {
  if (step.crane !== 'tower' || s.machines.tower.holding >= 0) return null
  const b = s.builds[step.build]
  if (b.placed >= b.spots.length || nextThing(s, step) !== null) return null
  const fork = s.machines.forklift
  if (fork.holding >= 0) {
    const held = s.things.find((t) => t.id === fork.holding)
    if (held !== undefined && held.kind === b.spots[b.placed].wants) return held
  }
  const far = freeThings(s, b.spots[b.placed].wants).sort((p, q) => near(p, fork) - near(q, fork))
  return far[0] ?? null
}

/** The step's zone for a place on the map the machine should go to, and how close counts. */
function stepPlace(s: Sim, run: JobRun, step: Step): { x: number; z: number; within: number; yaw: number | null } | null {
  switch (step.kind) {
    case 'scoop':
    case 'digOut':
      return { x: step.park.x, z: step.park.z, within: 0.9, yaw: step.park.yaw }
    case 'tip':
      return { x: step.zone.x, z: step.zone.z, within: step.zone.r * 0.4, yaw: null }
    case 'feed':
      return { x: PLANTS[step.plant].ring.x, z: PLANTS[step.plant].ring.z, within: PLANTS[step.plant].ring.r * 0.4, yaw: null }
    case 'push':
      return { ...pushEnds(s, run, step.hole).from, within: 1.5, yaw: null }
    case 'clear':
      return { ...clearEnds(s, run, step.zone).from, within: 1.5, yaw: null }
    case 'roll':
      return { ...rollAim(s, run, step.road), within: 2, yaw: null }
    case 'water':
      return { x: WATER_RING.x, z: WATER_RING.z, within: WATER_RING.r * 0.4, yaw: null }
    case 'pour':
      return { x: LOTS[s.forms[step.form].lot].x, z: LOTS[s.forms[step.form].lot].z, within: 5, yaw: null }
    case 'carry': {
      const t = freeThings(s, step.thing).find((o) => !inZone(o.x, o.z, step.ring))
      return t === undefined ? { x: step.ring.x, z: step.ring.z, within: step.ring.r * 0.5, yaw: null } : { x: t.x, z: t.z, within: 1.5, yaw: null }
    }
    case 'lift': {
      const stand = craneStand(step.build)
      return step.crane === 'mobile' && stand !== null ? { x: stand.x, z: stand.z, within: 1, yaw: stand.yaw } : null
    }
    case 'drive':
      return { x: step.ring.x, z: step.ring.z, within: step.ring.r * 0.5, yaw: null }
    case 'unload':
      return { x: PLANTS.saw.ring.x, z: PLANTS.saw.ring.z, within: PLANTS.saw.ring.r * 0.5, yaw: null }
    case 'watch':
      return null
  }
}

/** Where the truck crane stands to build each building it builds. */
function craneStand(build: number): Spot | null {
  const kind = BUILDS[build].kind
  return kind === 'bridge' ? MOBILE_PARK : kind === 'playground' ? PLAY_PARK : null
}

/** What stands in a receiver: cubic metres in the dumper's bed, or the mixer's sand and concrete. */
function readIn(s: Sim, into: 'dumper' | 'mixer' | PlantId): number {
  if (into === 'dumper') return s.machines.dumper.load.amount
  if (into === 'mixer') return s.machines.mixer.sand + s.machines.mixer.concrete * MIXER_SAND
  return plantTotal(s, into)
}

/** Everything a plant has been given, each batch counted whole once started: it only grows. */
function plantTotal(s: Sim, id: PlantId): number {
  const p = s.plants[id]
  const need = PLANTS[id].need
  return p.made * need + p.stored + (p.phase === 'work' ? need : 0)
}

/** The digger is where it can dig at the zone, and the zone's stuff can go to `into` from there. */
function diggerSetUp(s: Sim, dig: Zone): boolean {
  const d = near(s.machines.digger, dig)
  return d >= DIG_MIN - 1 && d <= DIG_MAX + 0.2
}

/** The open step is a dig, the point is on its ground, and the digger already reaches it: a tap there means dig here, so the digger stays put. */
export function digsHere(s: Sim, x: number, z: number): boolean {
  if (s.job === null) return false
  const step = s.job.job.steps[s.job.step]
  if (step.kind !== 'scoop' && step.kind !== 'digOut') return false
  const dig = step.kind === 'scoop' ? step.dig : step.zone
  return near({ x, z }, dig) <= dig.r + 0.5 && diggerSetUp(s, dig)
}

function receiverReady(s: Sim, into: 'dumper' | 'mixer' | PlantId): boolean {
  const digger = s.machines.digger
  const r = receiverOf(s, into)
  if (r === undefined) return false
  const d = near(r, digger)
  return d >= 2.2 && d <= 5.8
}

// ---------------------------------------------------------------------------------------
// What the HUD and the hands read.

/** How far off its way, in radians, the dozer may point with its blade down on a pass. */
const BLADE_FACING = 0.3

/** What the open step tells the hands: where the digger digs, what the crane fetches next and where it goes. */
export function aimsOf(s: Sim): Aims {
  if (s.job === null) return NO_AIMS
  const step = s.job.job.steps[s.job.step]
  switch (step.kind) {
    case 'scoop':
      return { dig: step.dig, into: step.into, thing: null, spot: null, bladeUp: false }
    case 'digOut':
      return { dig: step.zone, into: 'ground', thing: null, spot: null, bladeUp: false }
    case 'lift': {
      const b = s.builds[step.build]
      return { dig: null, into: null, thing: nextThing(s, step), spot: b.placed < b.spots.length ? b.spots[b.placed] : null, bladeUp: false }
    }
    case 'push':
    case 'clear': {
      // The blade is up on the way back, and on the way through until the dozer faces where it goes: a blade that comes down while it still turns shoves the heap aside.
      const run = s.job
      const ends = step.kind === 'push' ? pushEnds(s, run, step.hole) : clearEnds(s, run, step.zone)
      const goal = run.phase === 0 ? ends.from : ends.to
      const dozer = s.machines.dozer
      const off = Math.abs(turnTo(dozer.yaw, Math.atan2(goal.x - dozer.x, goal.z - dozer.z)))
      return { dig: null, into: null, thing: null, spot: null, bladeUp: run.phase === 0 || off > BLADE_FACING }
    }
    default:
      return NO_AIMS
  }
}

/** A step is open that needs what the active machine carries, and the machine is out of its ring: a press there takes a 1 s hold. */
export function guardedOf(s: Sim): boolean {
  if (s.job === null) return false
  const step = s.job.job.steps[s.job.step]
  const m = s.machines[s.active]
  switch (step.kind) {
    case 'tip':
      return m.kind === 'dumper' && m.load.amount > 0.05 && !inZone(bedTail(m).x, bedTail(m).z, step.zone, TAIL_SLACK)
    case 'feed':
      return m.kind === 'dumper' && m.load.amount > 0.05 && !inZone(m.x, m.z, PLANTS[step.plant].ring)
    case 'pour':
      return m.kind === 'mixer' && m.concrete > 0.05 && !inZone(m.x, m.z, { ...LOTS[s.forms[step.form].lot], r: 5 })
    case 'carry':
      return m.kind === 'forklift' && m.holding >= 0 && !inZone(m.x, m.z, step.ring)
    default:
      return false
  }
}

/** How far outside a push or clear step's place a tap still counts as a tap on it. */
const TAP_SLACK = 4

/**
 * Where a tap sends the dozer in easy mode. A tap on the hole (or the heap being cleared) means
 * "get that sand in": it goes to the marker, which is behind the heap or at the hole according
 * to the pass, so a child who only taps the hole still does every leg of the work.
 */
export function dozerTap(s: Sim, x: number, z: number): { x: number; z: number } {
  const run = s.job
  if (run === null) return { x, z }
  const step = run.job.steps[run.step]
  if (step.kind !== 'push' && step.kind !== 'clear') return { x, z }
  const place = step.kind === 'push' ? step.hole : step.zone
  if (near({ x, z }, place) > place.r + TAP_SLACK) return { x, z }
  const p = stepPointer(s)
  return p === null ? { x, z } : { x: p.x, z: p.z }
}

/** What to do now and where, as the HUD's marker and portrait show it. Null while there is nothing to do but watch, between jobs, and while a card or a party is up. */
export function stepPointer(s: Sim): Pointer | null {
  const run = s.job
  if (run === null || nothingToDo(s)) return null
  const step = run.job.steps[run.step]
  const kind = machineOf(step)
  if (kind === null) return null
  const m = s.machines[kind]
  const mark = (x: number, z: number, ring: number, press: boolean, machine: MachineKind = kind): Pointer => ({ machine, x, y: groundY(s, x, z), z, ring, press: press && actionFace(s, machine) !== null })
  switch (step.kind) {
    case 'scoop':
    case 'digOut': {
      const dig = step.kind === 'scoop' ? step.dig : step.zone
      const wait = step.kind === 'scoop' && step.into !== 'dumper' && step.into !== 'mixer' && !receiverReady(s, step.into)
      if (!diggerSetUp(s, dig) || wait) return mark(step.park.x, step.park.z, 1.8, false)
      return mark(dig.x, dig.z, dig.r, step.kind === 'digOut' || receiverReady(s, step.into))
    }
    case 'tip': {
      const d = s.machines.dumper
      const tail = bedTail(d)
      return mark(step.zone.x, step.zone.z, step.zone.r, d.load.amount > 0.05 && inZone(tail.x, tail.z, step.zone, TAIL_SLACK) && Math.abs(d.speed) < 1)
    }
    case 'feed': {
      const ring = PLANTS[step.plant].ring
      return mark(ring.x, ring.z, ring.r, s.machines.dumper.load.amount > 0.05 && inZone(m.x, m.z, ring, -0.5))
    }
    case 'push': {
      const ends = pushEnds(s, run, step.hole)
      const p = run.phase === 0 ? ends.from : ends.to
      return mark(p.x, p.z, 2, false)
    }
    case 'clear': {
      const ends = clearEnds(s, run, step.zone)
      const p = run.phase === 0 ? ends.from : ends.to
      return mark(p.x, p.z, 2, false)
    }
    case 'roll': {
      const p = rollAim(s, run, step.road)
      return mark(p.x, p.z, 2.5, false)
    }
    case 'water':
      return mark(WATER_RING.x, WATER_RING.z, WATER_RING.r, false)
    case 'pour': {
      const lot = LOTS[s.forms[step.form].lot]
      // The mixer's hands drive to a form within 25 m by themselves, then pour.
      return mark(lot.x, lot.z, 5, s.machines.mixer.concrete > 0.05 && near(m, lot) <= 25)
    }
    case 'carry': {
      const f = s.machines.forklift
      if (f.holding >= 0) return mark(step.ring.x, step.ring.z, step.ring.r, inZone(f.x, f.z, step.ring))
      const t = freeThings(s, step.thing).filter((o) => !inZone(o.x, o.z, step.ring)).sort((p, q) => near(p, f) - near(q, f))[0]
      if (t === undefined) return mark(step.ring.x, step.ring.z, step.ring.r, false)
      // The forklift takes the nearest thing within 5 m, so the button is only right when that is this one.
      const nearest = s.things.filter((o) => !o.gone && o.heldBy === null && near(f, o) <= 5).sort((p, q) => near(f, p) - near(f, q))[0]
      return mark(t.x, t.z, 1.5, near(f, t) < 4.5 && nearest === t)
    }
    case 'lift': {
      const rescue = rescueThing(s, step)
      if (rescue !== null) {
        const f = s.machines.forklift
        if (f.holding >= 0) return mark(PALLET_RING.x, PALLET_RING.z, PALLET_RING.r, inZone(f.x, f.z, PALLET_RING), 'forklift')
        return mark(rescue.x, rescue.z, 1.5, near(f, rescue) < 4.5, 'forklift')
      }
      const b = s.builds[step.build]
      if (b.placed >= b.spots.length) return null
      const spot = b.spots[b.placed]
      if (m.kind !== 'tower' && m.kind !== 'mobile') throw new Error('a lift step needs a crane')
      if (m.holding >= 0) return mark(spot.x, spot.z, 2.5, true)
      const t = nextThing(s, step)
      return t === null ? mark(spot.x, spot.z, 2.5, false) : mark(t.x, t.z, 1.5, true)
    }
    case 'drive':
      return mark(step.ring.x, step.ring.z, step.ring.r, false)
    case 'unload': {
      const ring = PLANTS.saw.ring
      return mark(ring.x, ring.z, ring.r, s.machines.semi.logs > 0.02 && inZone(m.x, m.z, ring) && s.machines.semi.seq === 'rest')
    }
    case 'watch':
      return null
  }
}

const MAKES_PICTURE = (step: Extract<Step, { kind: 'digOut' }>): Picture => ('form' in step.makes ? 'floor' : 'pond')
const PLANT_PICTURE = (id: PlantId): Picture => id
const BUILD_PICTURE = (s: Sim, build: number): Picture => {
  const b = s.builds[build]
  const wants = b.placed < b.spots.length ? b.spots[b.placed].wants : b.spots[b.spots.length - 1].wants
  return b.kind === 'bridge' ? 'bridge' : b.kind === 'playground' ? 'playground' : wants === 'clock' ? 'clock' : wants === 'planks' ? 'roof' : 'wall'
}

/** The pictures and dots of the open step. */
export function stepView(s: Sim): StepView | null {
  const run = s.job
  if (run === null) return null
  const step = run.job.steps[run.step]
  const dots = (done: number, of: number, pictures: readonly Picture[]): StepView => ({ pictures, done: clamp(Math.floor(done + 1e-6), 0, of), of })
  const share = (count: number, whole: number, of: number) => clamp01(count / whole) * of
  switch (step.kind) {
    case 'scoop':
      return dots(run.count / SCOOP + 0.2, step.scoops, [step.stuff, 'digger', 'arrow', step.into])
    case 'digOut':
      return dots(run.count / SCOOP + 0.2, step.scoops, ['digger', 'hole', 'arrow', MAKES_PICTURE(step)])
    case 'tip':
      return dots(share(run.count, step.need, 3), 3, ['dumper', 'arrow', 'hole'])
    case 'feed':
      return dots(share(run.count, step.need, 3), 3, ['dumper', 'arrow', PLANT_PICTURE(step.plant)])
    case 'push':
      return dots(share(run.count, step.need, 5), 5, ['dozer', 'arrow', 'hole'])
    case 'clear':
      return dots(share(run.count, 1, 5), 5, ['dozer', 'arrow', 'road'])
    case 'roll':
      return dots(share(run.count, step.need, 5), 5, ['roller', 'road'])
    case 'water':
      return dots(run.count * 1.25, 1, ['water', 'mixer'])
    case 'pour':
      return dots(share(run.count, 1, 3), 3, ['mixer', 'arrow', 'floor'])
    case 'carry':
      return dots(run.count, step.count, ['forklift', step.thing, 'arrow'])
    case 'lift':
      return dots(run.count, step.pieces, [step.crane, 'arrow', BUILD_PICTURE(s, step.build)])
    case 'drive':
      return dots(run.count, 1, [step.machine, 'arrow', step.ring === FOREST_RING ? 'logs' : 'saw'])
    case 'unload':
      return dots(run.count, 1, ['semi', 'logs', 'saw'])
    case 'watch':
      return dots(run.count, 1, [typeof step.what === 'string' ? 'logs' : 'form' in step.what ? 'floor' : 'pond' in step.what ? 'pond' : PLANT_PICTURE(step.what.plant)])
  }
}

// ---------------------------------------------------------------------------------------
// Running a step.

const SEND_FAR = 25
const AUTO_HOP = 1.2
const WATCH_MAX = 6
const SEND_PACE = 2.5
const FRIEND_PACE = 1.5
/** The dozer waits this far behind a tip ring, within this much of that spot. */
const WAIT_BEHIND = 8
const WAIT_WITHIN = 1.5
const CARD_FOR = 3
const CARD_END_FOR = 8

/** Time for three stars, or two within twice as long, and one more in pro for beating par. */
export function starsFor(seconds: number, par: number, pro: boolean): number {
  const base = seconds <= par ? 3 : seconds <= 2 * par ? 2 : 1
  return base + (pro && seconds <= par ? 1 : 0)
}

/** Stamps the lot level with a hard floor, ready for a slab. */
function stampFloor(s: Sim, lot: number): void {
  const l = LOTS[lot]
  levelShape(s.terrain, { kind: 'rect', x: l.x, z: l.z, w: l.w, d: l.d }, FLOOR_Y, 'hard')
}

/** What a finished `digOut` leaves: the lot levelled and its form shown, or the pool carved and filling. */
function stampDig(s: Sim, step: Extract<Step, { kind: 'digOut' }>): void {
  if ('form' in step.makes) {
    const form = s.forms[step.makes.form]
    form.shown = true
    stampFloor(s, form.lot)
  } else {
    const pond = s.ponds[step.makes.pond]
    cutBowl(s.terrain, pond.x, pond.z, pond.r, 1)
    pond.shown = true
  }
}

/** What a finished `push` leaves: a road hole levelled with the road, other ground levelled where it was filled to. */
function stampPush(s: Sim, step: Extract<Step, { kind: 'push' }>): void {
  const shape = { kind: 'circle' as const, ...step.hole }
  const i = Math.round((step.hole.x + HALF) / CELL) + Math.round((step.hole.z + HALF) / CELL) * SIDE
  if (s.terrain.bed[i] >= 0) {
    levelShape(s.terrain, shape, ROAD_Y, 'hard')
    setSurface(s.terrain, shape, 'road')
  } else levelShape(s.terrain, shape, step.level, 'loose')
  s.events.push({ kind: 'landed', x: step.hole.x, y: groundY(s, step.hole.x, step.hole.z), z: step.hole.z, stuff: 'sand' })
}

/** A finished bridge gets its deck. */
function addDeck(s: Sim): void {
  if (s.decks.length === 0) s.decks.push({ x0: BRIDGE.x - BRIDGE.width / 2, x1: BRIDGE.x + BRIDGE.width / 2, z0: BRIDGE.z0, z1: BRIDGE.z1, y: BRIDGE.deckY })
}

/** Starts the job at its step 0: machines come, things appear, the cards and the animals of the chapter. */
function startJob(s: Sim, j: Job): void {
  for (const kind of j.brings) {
    const m = s.machines[kind]
    if (m.unlocked) continue
    m.unlocked = true
    m.x = ENTRY[kind].x
    m.z = ENTRY[kind].z
    m.yaw = ENTRY[kind].yaw
    m.y = groundY(s, m.x, m.z)
    const first = j.steps[0]
    if (kind === 'tower') s.machines.tower.up = 0
    else if (first.kind === 'scoop' && first.into === kind) {
      // A friend bringing the truck or the mixer for the first scoop drives straight to its place beside the digger.
      const { spot, bearing } = friendSpot(s, first, first.park, m)
      driveTo(s, m, spot.x, spot.z, 0.6, SEND_PACE, true, bearing)
    } else driveTo(s, m, HOME[kind].x, HOME[kind].z, 1, SEND_PACE, true, HOME[kind].yaw)
    s.events.push({ kind: 'comes', machine: kind })
    if (kind !== 'tower') m.honk = 1
  }
  for (const set of j.setup) {
    for (let k = 0; k < set.count; k++) {
      const off = set.count === 1 ? [0, 0] : [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]][k % 4]
      spawnThing(s, set.thing, set.x + off[0], set.z + off[1])
    }
  }
  if (j.id === 'rocks') for (const [who, x, z] of FAR_BANK) spawnAnimal(s, who, x, z).mood = 'wave'
  const template = templateOf(j)
  if (template === 'delivery') {
    // The pallets an earlier delivery left in this ring were the animal's: they go, so the ring has room and nobody stands in one.
    const ring = (j.steps[0] as Extract<Step, { kind: 'carry' }>).ring
    for (const thing of freeThings(s, 'bricks')) if (inZone(thing.x, thing.z, ring)) thing.gone = true
  }
  if (template === 'pile') {
    const zone = (j.steps[0] as Extract<Step, { kind: 'clear' }>).zone
    spill(s.terrain, zone.x, zone.z, 1.6, 5, 'sand')
  }
  if (j.chapter !== 'more' && (s.storyDone === 0 || STORY[s.storyDone - 1].chapter !== j.chapter)) {
    s.card = { kind: 'chapter', chapter: j.chapter }
    s.cardAt = s.time
    s.chapterStars = 0
  }
  s.events.push({ kind: 'wish', who: j.who })
  s.job = { job: j, step: 0, startedAt: s.time, stepAt: s.time, count: 0, base: 0, nearest: Infinity, arrived: 0, prev: null, phase: 0, passes: 0, holdFrom: null, heap: null, roll: null, autoHopAt: null, partnerAt: -1 }
  enterStep(s, s.job, false)
}

/** The cows and sheep on the far bank when the bridge is asked for. */
const FAR_BANK: readonly (readonly [Species, number, number])[] = [
  ['cow', 6, -44],
  ['cow', 11, -45],
  ['sheep', 3, -43],
  ['sheep', 13, -43.5],
  ['sheep', 9, -46],
]

/** Pip's helpers top a dug-out heap up: when the place a scoop digs holds less than the scoops need, the animals tip fresh stuff there, so a child can never dig a job's heap away. */
function restock(s: Sim, step: Extract<Step, { kind: 'scoop' }>): void {
  const t = s.terrain
  const zone = { ...step.dig, r: step.dig.r + 0.4 }
  let have = 0
  for (let iz = Math.ceil((zone.z - zone.r + HALF) / CELL); iz <= Math.floor((zone.z + zone.r + HALF) / CELL); iz++) {
    for (let ix = Math.ceil((zone.x - zone.r + HALF) / CELL); ix <= Math.floor((zone.x + zone.r + HALF) / CELL); ix++) {
      if (Math.hypot(ix * CELL - HALF - zone.x, iz * CELL - HALF - zone.z) <= zone.r) have += t.loose[ix + iz * SIDE] * CELL * CELL
    }
  }
  const need = step.scoops * SCOOP + SCOOP
  if (have >= need) return
  spill(t, step.dig.x, step.dig.z, step.dig.r + 0.3, need - have + SCOOP, step.stuff)
  s.events.push({ kind: 'landed', x: step.dig.x, y: groundY(s, step.dig.x, step.dig.z), z: step.dig.z, stuff: step.stuff })
}

/** Sets up a step: what it measures from, where its machine should be (a far one sets off by itself), and when the builder hops there. */
function enterStep(s: Sim, run: JobRun, hoppedLast: boolean): void {
  const step = run.job.steps[run.step]
  run.count = 0
  run.base = 0
  run.nearest = Infinity
  run.stepAt = s.time
  s.idle = 0
  run.arrived = 0
  run.phase = 0
  run.passes = 0
  run.holdFrom = null
  run.heap = null
  run.roll = null
  run.partnerAt = -1
  run.prev = null
  switch (step.kind) {
    case 'scoop':
      restock(s, step)
      run.prev = readIn(s, step.into)
      break
    case 'digOut':
      run.prev = s.machines.digger.load.amount
      break
    case 'tip':
      run.prev = s.machines.dumper.load.amount
      break
    case 'feed':
      run.base = plantTotal(s, step.plant)
      break
    case 'push':
      run.base = Math.max(deficitIn(s.terrain, step.hole, step.level), 1e-3)
      break
    case 'clear':
      run.base = Math.max(risenIn(s, step.zone, null).volume, 1e-3)
      break
    case 'carry':
      run.base = freeThings(s, step.thing).filter((t) => inZone(t.x, t.z, step.ring)).length
      break
    case 'lift': {
      const b = s.builds[step.build]
      run.base = b.placed
      b.shown = true
      if (b.kind === 'house' && b.lot >= 0 && !FORMS.some((f) => f.lot === b.lot)) stampFloor(s, b.lot)
      break
    }
    default:
      break
  }
  const kind = machineOf(step)
  if (kind === null) return
  const m = s.machines[kind]
  const place = stepPlace(s, run, step)
  if (place !== null && m.unlocked && near(m, place) > SEND_FAR) driveTo(s, m, place.x, place.z, place.within, SEND_PACE, true, place.yaw)
  run.autoHopAt = !hoppedLast && s.active !== kind && m.unlocked ? s.time + AUTO_HOP : null
  if (!m.unlocked) run.autoHopAt = !hoppedLast ? s.time + AUTO_HOP : null
}

/** Moves the job to its next step, or ends it. */
function nextStep(s: Sim, run: JobRun): void {
  const step = run.job.steps[run.step]
  const kind = machineOf(step)
  const m = kind === null ? null : s.machines[kind]
  if (step.kind === 'digOut') stampDig(s, step)
  if (step.kind === 'push') stampPush(s, step)
  if (step.kind === 'lift' && s.builds[step.build].kind === 'bridge' && s.builds[step.build].placed >= s.builds[step.build].spots.length) addDeck(s)
  const x = m === null ? 0 : m.x
  const z = m === null ? 0 : m.z
  s.events.push({ kind: 'stepDone', x, y: groundY(s, x, z), z })
  award(s, COINS.stepDone, x, groundY(s, x, z), z)
  // The child hopped away from the step's machine during the step: they know where they want to be.
  const hopped = s.ownHopAt !== null && s.ownHopAt >= run.stepAt && s.active !== kind
  run.step++
  if (run.step >= run.job.steps.length) finishJob(s, run)
  else enterStep(s, run, hopped)
}

/** Stars, coins, the animal who moves in, and the next thing: another job after a pause, or the chapter's party. */
function finishJob(s: Sim, run: JobRun): void {
  const j = run.job
  const stars = starsFor(s.time - run.startedAt, j.par, s.mode === 'pro')
  s.score.stars += stars
  s.chapterStars += stars
  award(s, COINS.jobDone, HUT.x, 0, HUT.z)
  s.events.push({ kind: 'jobDone', stars })
  if (j.movesIn !== null) moveIn(s, j.movesIn.who, j.movesIn.build)
  s.job = null
  if (s.storyDone < STORY.length) s.storyDone++
  else s.moreDone++
  s.nextJobIn = 2.5
  s.idle = 0
  const last = j.chapter !== 'more' && (s.storyDone >= STORY.length || STORY[s.storyDone].chapter !== j.chapter)
  if (last && j.chapter !== 'more') {
    // The machines the party would show drive out first; the party begins when they are gone.
    s.partyWait = { chapter: j.chapter, t: 0 }
    clearParty(s, j.chapter)
  }
}

/**
 * The ground under the middle of each chapter's party picture, as rectangles: the inner 70 percent, across and up, of the free area, at 1024 x 768, 768 x 1024, 1280 x 800 and 390 x 844 (the camera's view in `scene/frame.test.ts`, which fails when a rectangle is short of it), over the whole party. The edges of the picture are left out: a machine parked at the edge of a construction site's party is natural.
 * The view is a trapezoid, wide at the far end of the screen and narrow at the near one, so it is a stack of strips six metres deep, each as wide as the view is there, clipped to the town.
 */
export const PARTY_FRAMES: Record<ChapterId, readonly Area[]> = {
  road: [
    { x0: -11, x1: 7, z0: 12, z1: 18 },
    { x0: -13, x1: 11, z0: 18, z1: 24 },
    { x0: -12, x1: 10, z0: 24, z1: 30 },
    { x0: -11, x1: 9, z0: 30, z1: 36 },
    { x0: -9, x1: 5, z0: 36, z1: 42 },
  ],
  house: [
    { x0: -13, x1: 7, z0: -18, z1: -12 },
    { x0: -32, x1: 29, z0: -12, z1: -6 },
    { x0: -32, x1: 28, z0: -6, z1: 0 },
    { x0: -31, x1: 27, z0: 0, z1: 6 },
    { x0: -30, x1: 26, z0: 6, z1: 12 },
    { x0: -29, x1: 25, z0: 12, z1: 18 },
    { x0: -28, x1: 24, z0: 18, z1: 24 },
  ],
  bridge: [
    { x0: -5, x1: 21, z0: -36, z1: -30 },
    { x0: -4, x1: 20, z0: -30, z1: -24 },
    { x0: -3, x1: 19, z0: -24, z1: -18 },
  ],
  play: [
    { x0: 12, x1: 24, z0: 30, z1: 36 },
    { x0: 10, x1: 27, z0: 36, z1: 42 },
    { x0: 11, x1: 26, z0: 42, z1: 48 },
  ],
  clock: [
    { x0: 11, x1: 33, z0: -48, z1: -42 },
    { x0: 3, x1: 41, z0: -42, z1: -36 },
    { x0: 4, x1: 40, z0: -36, z1: -30 },
    { x0: 5, x1: 39, z0: -30, z1: -24 },
    { x0: 7, x1: 37, z0: -24, z1: -18 },
    { x0: 8, x1: 36, z0: -18, z1: -12 },
    { x0: 14, x1: 30, z0: -12, z1: -6 },
  ],
}

/** Where a chapter's party is seen: its show and what its camera frames. No machine stands, drives or parks in these when the party begins. */
const partyView = (chapter: ChapterId): readonly Area[] => [...PARTY_AREAS[chapter], ...PARTY_FRAMES[chapter]]

/** A party that waits for its machines to drive out starts anyway after this many seconds. */
const PARTY_WAIT_MAX = 12

/** A machine's middle this far outside a show's area leaves its body clear of the show. */
const SHOW_MARGIN = 3.5

/** A machine leaving a show parks this much further out than it must, where it can: a machine that parks beside it and the sweep that parts parked machines move it a few metres. */
const PARK_ROOM = 6

/** The points a machine leaving a show may be sent to: the town's ground, two metres apart. */
const EXIT_GRID: readonly { x: number; z: number }[] = Array.from({ length: 41 * 41 }, (_, i) => ({ x: -40 + 2 * (i % 41), z: -40 + 2 * Math.floor(i / 41) }))

/** A machine leaving a show stops this near the spot it was sent to. */
const SHOW_WITHIN = 1.5

/** What counts as in a show: anything of a machine this near a show's area. */
export const SHOW_ROOM = 1

/** The building lots as rectangles on the ground. */
const LOT_RECTS = LOTS.map((l): Rect => ({ x: l.x, z: l.z, yaw: 0, hl: l.d / 2, hw: l.w / 2 }))

/** The truck crane's boom, stowed, reaches this far behind its middle: the turret's offset and the shortest reach. */
const STOWED_BOOM = -TURRET_Z + REACH_RANGE[0]

/** A round bit of a machine on the ground. */
type Blob = { x: number; z: number; r: number }

/** Points along a line, a metre or two apart, as blobs of radius `r`. */
function along(x0: number, z0: number, x1: number, z1: number, r: number): Blob[] {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5))
  return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, r }))
}

/** The jib and the counter jib of the tower crane, as blobs. */
function jibBlobs(m: Tower): Blob[] {
  const sx = Math.sin(m.jib)
  const cz = Math.cos(m.jib)
  return along(m.x - sx * COUNTER_JIB, m.z - cz * COUNTER_JIB, m.x + sx * JIB_LEN, m.z + cz * JIB_LEN, 0.5)
}

/** Everything of a machine that stands on the ground or hangs over it: its body circles, the lorry's trailer, the truck crane's pads, where they stand for its legs, and boom, the tower's jib. */
function blobsOf(m: Machine): Blob[] {
  const sin = Math.sin(m.yaw)
  const cos = Math.cos(m.yaw)
  const out: Blob[] = MACHINE_SPECS[m.kind].body.map(([lz, r]) => ({ x: m.x + sin * lz, z: m.z + cos * lz, r }))
  if (m.kind === 'semi') out.push({ x: localX(m.x, m.yaw, 0, HITCH_Z) - Math.sin(m.trailerYaw) * TRAILER_AXLE, z: localZ(m.z, m.yaw, 0, HITCH_Z) - Math.cos(m.trailerYaw) * TRAILER_AXLE, r: 1.3 })
  if (m.kind === 'mobile') {
    const base = craneBase(m)
    const pad = padX(m.legs)
    for (const side of [-1, 1]) for (const fore of OUTRIGGER_Z) out.push({ x: localX(m.x, m.yaw, side * pad, fore), z: localZ(m.z, m.yaw, side * pad, fore), r: PAD_R })
    out.push(...along(base.x, base.z, base.x + Math.sin(m.jib) * m.reach, base.z + Math.cos(m.jib) * m.reach, 0.5))
  }
  if (m.kind === 'tower') out.push(...jibBlobs(m))
  return out
}

/** How far from its middle a machine can reach on the ground, in whatever pose: what it must stand away from a show's edge. */
function showReach(m: Machine): number {
  const spec = MACHINE_SPECS[m.kind]
  const body = Math.max(...spec.body.map(([lz, r]) => Math.abs(lz) + r))
  if (m.kind === 'semi') return Math.max(body, TRAILER_AXLE - HITCH_Z + 1.3)
  if (m.kind === 'mobile') return Math.max(body, STOWED_BOOM + 0.5, Math.hypot(padX(1), Math.max(...OUTRIGGER_Z.map(Math.abs))) + PAD_R)
  return body
}

/** True if a blob is within `margin` metres of a rectangle. */
const blobNear = (a: Area, b: Blob, margin: number) => Math.hypot(b.x - clamp(b.x, a.x0, a.x1), b.z - clamp(b.z, a.z0, a.z1)) <= b.r + margin

/** True if any part of a machine is within `margin` of any of the areas. */
export const touchesShow = (areas: readonly Area[], m: Machine, margin: number) => blobsOf(m).some((b) => areas.some((a) => blobNear(a, b, margin)))

/** True if a machine is in a chapter's party view: within SHOW_ROOM of its show, or touching the ground its camera shows. The tower crane cannot leave, so only its jib counts. */
export function inPartyView(chapter: ChapterId, m: Machine): boolean {
  return (m.kind === 'tower' ? jibBlobs(m) : blobsOf(m)).some((b) => blobInView(chapter, b))
}

/** True if a blob is within SHOW_ROOM of a chapter's show or touches the ground its camera shows. */
const blobInView = (chapter: ChapterId, b: Blob) => PARTY_AREAS[chapter].some((a) => blobNear(a, b, SHOW_ROOM)) || PARTY_FRAMES[chapter].some((a) => blobNear(a, b, 0))

/** The machines standing, or on their way, where a chapter's show plays or its camera looks drive out of it by the shortest way from where they stand that is not on a road bed, as far as their whole body, a lorry's trailer and a truck crane's legs and stowed boom need: the one the child is in too, which drives itself. The truck crane stows as it drives. The tower crane cannot drive: its jib swings away from the show. */
export function clearParty(s: Sim, chapter: ChapterId): void {
  const areas = partyView(chapter)
  const inside = (p: { x: number; z: number }) => areas.some((a) => inArea(a, p))
  const things = footprints(s)
  const leaving = Object.values(s.machines).filter((m) => m.unlocked && m.kind !== 'tower' && (inPartyView(chapter, m) || (m.goal !== null && inside(m.goal))))
  // Where the machines already sent out go: another leaving machine does not park on one.
  const sent = new Map<Machine, { x: number; z: number }>()
  // Ground a machine may park on: off the road beds, and with its whole body, and a hand's room round it, clear of the lots, of what stands (a plant's body and legs, a house with a piece in it) and of the other machines where they stand or where they were sent.
  const clearGround = (m: Machine) => {
    const grown = (r: Rect, x: number, z: number): Rect => ({ ...r, x, z, hl: r.hl + SHOW_ROOM, hw: r.hw + SHOW_ROOM })
    const others = Object.values(s.machines)
      .filter((o) => o !== m && o.unlocked && (sent.has(o) || !leaving.includes(o)))
      .map((o) => {
        const at = sent.get(o) ?? o
        return grown(rectOf(o), at.x, at.z)
      })
    const fixed = [...LOT_RECTS, ...things.map((f) => f.rect)]
    return (p: { x: number; z: number }) => {
      const mine = grown(rectOf(m), p.x, p.z)
      return !ROADS.some((_, road) => onRoad(p, road)) && fixed.every((r) => overlapDepth(mine, r) === 0) && others.every((r) => overlapDepth(mine, r) === 0)
    }
  }
  for (const m of Object.values(s.machines)) {
    if (m.kind === 'tower' && m.unlocked && inPartyView(chapter, m)) swingAway(m, chapter)
  }
  for (const m of leaving) {
    const room = showReach(m) + SHOW_ROOM + SHOW_WITHIN
    // The nearest way out: a point of the town's grid at least `by` from every area, on `ground` if it must be.
    const exit = (by: number, on: (p: { x: number; z: number }) => boolean) => {
      let best: { x: number; z: number } | undefined
      for (const p of EXIT_GRID) {
        if (best !== undefined && near(p, m) >= near(best, m)) continue
        if (!inside(p) && areas.every((a) => Math.hypot(p.x - clamp(p.x, a.x0, a.x1), p.z - clamp(p.z, a.z0, a.z1)) >= by - 1e-6) && on(p)) best = p
      }
      return best
    }
    // The roomy way out, on no lot, road bed or standing thing; else a tight one; else any outside the show: a machine always gets out.
    const ground = clearGround(m)
    const anywhere = () => true
    const out = exit(room + PARK_ROOM, ground) ?? exit(room, ground) ?? exit(room, anywhere) ?? exit(SHOW_MARGIN, ground) ?? exit(SHOW_MARGIN, anywhere) ?? exit(0, anywhere)
    if (out === undefined) throw new Error(`no way out of the ${chapter} show for the ${m.kind}`)
    sent.set(m, out)
    driveTo(s, m, out.x, out.z, SHOW_WITHIN, FRIEND_PACE, true)
  }
}

/** True when no machine touches the chapter's show or frame, or is bound for a place in it. */
function viewClear(s: Sim, chapter: ChapterId): boolean {
  const areas = partyView(chapter)
  return Object.values(s.machines).every((m) => {
    const goal = m.goal
    if (!m.unlocked) return true
    // A tower crane whose jib cannot leave the view however it turns is as clear as it can be.
    const stays = m.kind === 'tower' && swingTarget(m, chapter).over > 0
    return !((inPartyView(chapter, m) && !stays) || (goal !== null && areas.some((a) => inArea(a, goal))))
  })
}

/** Counts a waiting party's seconds, and starts it when its machines are out of its view or the wait is up. */
function stepPartyWait(s: Sim, wait: NonNullable<Sim['partyWait']>, dt: number): void {
  wait.t += dt
  if (!viewClear(s, wait.chapter) && wait.t < PARTY_WAIT_MAX) return
  s.partyWait = null
  startParty(s, wait.chapter)
}

/** The way the tower crane's jib turns to have the least of it over the chapter's show, then the least in its party view, the nearest of those, and how many of its blobs stay in the view. */
function swingTarget(m: Tower, chapter: ChapterId): { jib: number; over: number } {
  const count = (jib: number, test: (b: Blob) => boolean) => jibBlobs({ ...m, jib }).filter(test).length
  const onShow = (b: Blob) => PARTY_AREAS[chapter].some((a) => blobNear(a, b, SHOW_ROOM))
  return Array.from({ length: 48 }, (_, i) => turnTo(0, (i * Math.PI * 2) / 48))
    .map((jib) => ({ jib, show: count(jib, onShow), over: count(jib, (b) => blobInView(chapter, b)) }))
    .sort((p, q) => p.show - q.show || p.over - q.over || Math.abs(turnTo(m.jib, p.jib)) - Math.abs(turnTo(m.jib, q.jib)))[0]
}

/** The tower crane's jib turns to the way that has the least of it in the party view, and its counter jib with it; its trolley stays where it is. The mast stays: a crane cannot leave. */
function swingAway(m: Tower, chapter: ChapterId): void {
  const clear = swingTarget(m, chapter).jib
  const out = clamp(m.trolley, TROLLEY_RANGE[0], TROLLEY_RANGE[1])
  m.aimX = m.x + Math.sin(clear) * out
  m.aimZ = m.z + Math.cos(clear) * out
  m.tapped = true
  m.then = 'stay'
  m.target = -1
  m.seq = 'over'
  m.seqT = 0
}

/** The chapter's party is over: its card, and the day moves on. */
function endParty(s: Sim): void {
  const chapter = (s.party as NonNullable<Sim['party']>).chapter
  s.party = null
  s.events.push({ kind: 'chapterDone', chapter })
  const card: Card = chapter === CHAPTER_IDS[CHAPTER_IDS.length - 1] ? { kind: 'theEnd', stars: s.score.stars } : { kind: 'chapterDone', chapter, stars: s.chapterStars }
  s.card = card
  s.cardAt = s.time
  s.chapterStars = 0
}

/** The time of day the sim eases toward. */
function dayTarget(s: Sim): number {
  if (s.party !== null) return DAY_OF[s.party.chapter]
  if (s.job !== null) return DAY_OF[s.job.job.chapter]
  return DAY_OF[s.storyDone < STORY.length ? STORY[s.storyDone].chapter : 'more']
}

/** The count of the open step, and whether it is done. Reads the sim; writes `count`, and keeps `Sim.idle` honest. */
function measure(s: Sim, run: JobRun): boolean {
  const step = run.job.steps[run.step]
  const t = s.terrain
  let done = false
  switch (step.kind) {
    case 'scoop': {
      const now = readIn(s, step.into)
      run.arrived += Math.max(0, now - (run.prev ?? now))
      run.prev = now
      run.count = step.into === 'dumper' || step.into === 'mixer' ? Math.max(run.arrived, now) : run.arrived
      done = run.count >= (step.scoops - 0.2) * SCOOP - 1e-9
      break
    }
    case 'digOut': {
      const d = s.machines.digger
      const now = d.load.amount
      const p = bucketTip(d)
      if (Math.hypot(p.x - step.zone.x, p.z - step.zone.z) < step.zone.r + 2.5) run.arrived += Math.max(0, now - (run.prev ?? now))
      run.prev = now
      run.count = run.arrived
      done = run.count >= (step.scoops - 0.2) * SCOOP - 1e-9
      break
    }
    case 'tip': {
      const d = s.machines.dumper
      const back = bedTail(d)
      if (inZone(back.x, back.z, step.zone, TAIL_SLACK + 0.8 * d.bed)) run.arrived += Math.max(0, (run.prev ?? d.load.amount) - d.load.amount)
      run.prev = d.load.amount
      run.count = run.arrived
      done = run.count >= step.need - 1e-6
      break
    }
    case 'feed':
      run.count = plantTotal(s, step.plant) - run.base
      done = run.count >= step.need - 1e-6
      break
    case 'push':
      run.count = clamp01(1 - deficitIn(t, step.hole, step.level) / run.base)
      done = run.count >= step.need
      break
    case 'clear': {
      const left = risenIn(s, step.zone, null).volume
      run.count = clamp01(1 - left / run.base)
      done = left <= step.max
      break
    }
    case 'roll':
      run.count = rolledShare(s, step.road)
      done = run.count >= step.need
      break
    case 'water':
      run.count = s.machines.mixer.concrete
      done = run.count >= 0.8
      break
    case 'pour':
      run.count = s.forms[step.form].fill
      done = run.count >= 1 - 1e-9
      break
    case 'carry':
      run.count = freeThings(s, step.thing).filter((o) => inZone(o.x, o.z, step.ring)).length - run.base
      done = run.count >= step.count
      break
    case 'lift':
      run.count = s.builds[step.build].placed - run.base
      done = run.count >= step.pieces || s.builds[step.build].placed >= s.builds[step.build].spots.length
      break
    case 'drive':
      run.count = inZone(s.machines[step.machine].x, s.machines[step.machine].z, step.ring, -step.ring.r * 0.3) ? 1 : 0
      done = run.count >= 1
      break
    case 'unload':
      run.count = LOG_FULL - s.machines.semi.logs
      done = s.machines.semi.logs < 0.02 && s.machines.semi.seq === 'rest'
      break
    case 'watch': {
      const w = step.what
      const cond =
        typeof w === 'string'
          ? s.machines.semi.logs >= LOG_FULL - 1e-9
          : 'form' in w
            ? s.forms[w.form].hard
            : 'pond' in w
              ? s.ponds[w.pond].water >= 1
              : s.plants[w.plant].phase === 'idle' && s.plants[w.plant].stored < PLANTS[w.plant].need - 1e-9
      const waited = s.time - run.stepAt
      run.count = cond ? 1 : clamp01(waited / WATCH_MAX)
      done = cond || waited >= WATCH_MAX
      break
    }
  }
  return done
}

/** A refilled step: the index of the last loading step of the job before this one. */
function refillTarget(run: JobRun): number {
  const step = run.job.steps[run.step]
  if ('refill' in step) return step.refill
  for (let i = run.step - 1; i >= 0; i--) if (run.job.steps[i].kind === 'scoop') return i
  return 0
}

/** Centre to centre, how far from the digger's place every machine the step does not use must stand: its tracks and a truck beside it, with room between. */
const KEEP_OUT = 7
/** How far past the edge of what a machine is in the way of it is sent to stand. */
const ASIDE_PAST = 1.5

/** Where a machine goes to get out of the way of `inTheWay`: straight away from `centre` along the line through it, past the edge by `ASIDE_PAST`. */
function asideOf(centre: { x: number; z: number }, m: { x: number; z: number }, inTheWay: (p: { x: number; z: number }) => boolean): { x: number; z: number } {
  const d = near(centre, m)
  const dir = d < 0.5 ? { x: 1, z: 0 } : { x: (m.x - centre.x) / d, z: (m.z - centre.z) / d }
  let out = d
  while (out < 80 && inTheWay({ x: centre.x + dir.x * out, z: centre.z + dir.z * out })) out++
  out += ASIDE_PAST
  return { x: clamp(centre.x + dir.x * out, -40, 40), z: clamp(centre.z + dir.z * out, -40, 40) }
}

/** The machines `who` picks that stand in the way (`inTheWay` holds at their middle) drive home, or aside, away from `centre`, when home is in the way too. */
function clearOut(s: Sim, who: (m: Machine) => boolean, inTheWay: (p: { x: number; z: number }) => boolean, centre: { x: number; z: number }): void {
  for (const m of Object.values(s.machines)) {
    if (!m.unlocked || !who(m) || !inTheWay(m)) continue
    const home = HOME[m.kind]
    if (!inTheWay(home)) driveTo(s, m, home.x, home.z, 1.5, FRIEND_PACE, true, home.yaw)
    else {
      const to = asideOf(centre, m, inTheWay)
      driveTo(s, m, to.x, to.z, 1.5, FRIEND_PACE, true)
    }
  }
}

/** A machine a friend may send: not the one the child is in, not the tower, not one already on its way, and not one of `keep`. */
const free = (s: Sim, keep: readonly MachineKind[]) => (m: Machine) => !keep.includes(m.kind) && m.kind !== 'tower' && m.kind !== s.active && m.goal === null

/** The friends of a digging step: the machines it does not use go out of the digger's place, and the truck or the mixer it fills comes alongside. */
function partners(s: Sim, run: JobRun, step: Extract<Step, { kind: 'scoop' | 'digOut' }>): void {
  if (s.time - run.partnerAt < 0.4) return
  run.partnerAt = s.time
  const digger = s.machines.digger
  const into = step.kind === 'scoop' && (step.into === 'dumper' || step.into === 'mixer') ? step.into : null
  clearOut(s, free(s, into === null ? ['digger'] : ['digger', into]), (p) => near(p, step.park) < KEEP_OUT, step.park)
  if (step.kind === 'digOut' || into === null) return
  const dig = step.dig
  if (!diggerSetUp(s, dig) || Math.abs(digger.speed) > 0.5) return
  const m = s.machines[into]
  if (!m.unlocked || m.kind === s.active) return
  const r = receivers(s, 0, true).find((o) => typeof o.owner !== 'string' && o.owner === m)
  if (r === undefined) throw new Error(`no receiver for the ${into}`)
  const d = near(r, digger)
  const { spot, bearing } = friendSpot(s, step, digger, m)
  const placed = d >= 3.8 && d <= 5.6 && near(m, spot) < 2.5
  // A friend on its way keeps its goal while the digger settles: the spot moves with the digger, but a few metres of it is the same place.
  const sent = m.goal !== null && near(m.goal, spot) < 3
  if (!placed && !sent) driveTo(s, m, spot.x, spot.z, 0.6, FRIEND_PACE, true, bearing)
}

/** Where the truck or the mixer stands for a scoop step with the digger at `digger`: to the side of it on the nearer clear side, its hopper inside the digger's reach, and the way the digger faces. */
function friendSpot(s: Sim, step: Extract<Step, { kind: 'scoop' }>, digger: { x: number; z: number }, m: Machine): { spot: { x: number; z: number }; bearing: number } {
  const bearing = Math.atan2(step.dig.x - digger.x, step.dig.z - digger.z)
  const off = step.into === 'dumper' ? -(BED_HINGE_Z + BED_LEN / 2) : 3
  const spots = [1, -1].map((side) => {
    const rx = digger.x + Math.cos(bearing) * 4.8 * side
    const rz = digger.z - Math.sin(bearing) * 4.8 * side
    return { x: rx + Math.sin(bearing) * off, z: rz + Math.cos(bearing) * off }
  })
  spots.sort((p, q) => near(p, m) - near(q, m))
  return { spot: spots.find((p) => clearOfStanding(s, p.x, p.z, 2.5)) ?? spots[0], bearing }
}

/** While the truck tips, the dozer that will push the heap into the hole drives to wait behind the ring, away from the hole, so it is there when the tipping is done. */
function waitForPush(s: Sim, run: JobRun, step: Extract<Step, { kind: 'tip' }>): void {
  const next = run.job.steps[run.step + 1]
  const dozer = s.machines.dozer
  if (next === undefined || next.kind !== 'push' || !dozer.unlocked || dozer.kind === s.active || dozer.goal !== null) return
  const len = near(step.zone, next.hole)
  const spot = { x: step.zone.x + ((step.zone.x - next.hole.x) / len) * WAIT_BEHIND, z: step.zone.z + ((step.zone.z - next.hole.z) / len) * WAIT_BEHIND }
  if (near(dozer, spot) > WAIT_WITHIN * 2) driveTo(s, dozer, spot.x, spot.z, WAIT_WITHIN, FRIEND_PACE, true, Math.atan2(next.hole.x - spot.x, next.hole.z - spot.z))
}

/** Machines left where the dozer, the roller or a crane must work go home by themselves, once a second (not `keep`, not the one the child is in, and not one on its way somewhere). */
function tidy(s: Sim, run: JobRun, keep: MachineKind, inTheWay: (p: { x: number; z: number }) => boolean, centre: { x: number; z: number }): void {
  if (s.time - run.partnerAt < 1) return
  run.partnerAt = s.time
  clearOut(s, free(s, [keep]), inTheWay, centre)
}

/** True if a point is within `margin` metres of a building's ground: its whole lot, or its footprint when it has none. */
function nearBuild(b: Build, p: { x: number; z: number }, margin: number): boolean {
  const lot = b.lot >= 0 ? LOTS[b.lot] : null
  const [hx, hz] = lot === null ? BUILD_HALF[b.kind] : [lot.w / 2, lot.d / 2]
  return Math.abs(p.x - b.x) < hx + margin && Math.abs(p.z - b.z) < hz + margin
}

/** A machine's middle this close to a building's ground has its body in it, or in the crane's way. */
const BUILD_MARGIN = 3.5

/** The middle of a road's bed. */
const roadMiddle = (road: number) => ({ x: (ROADS[road].ax + ROADS[road].bx) / 2, z: (ROADS[road].az + ROADS[road].bz) / 2 })

/** True if a machine stands on a road's bed or just beside it. */
function onRoad(m: { x: number; z: number }, road: number): boolean {
  const r = ROADS[road]
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az)
  const along = ((m.x - r.ax) * (r.bx - r.ax) + (m.z - r.az) * (r.bz - r.az)) / len
  const across = Math.abs(((m.x - r.ax) * (r.bz - r.az) - (m.z - r.az) * (r.bx - r.ax)) / len)
  return along > -4 && along < len + 4 && across < ROAD_WIDTH / 2 + 3
}

/** How far from the turret a truck crane's spare appears: inside its reach range, clear of its own body. */
const SPARE_OUT = 9

/**
 * Where Pip's spare for a lift step appears, in reach of the crane that needs it: the tower
 * crane gets it on the pallet ring (the point of the ring with the most room round it), the truck
 * crane beside or behind it where it stands to work, on dry ground clear of what stands there.
 */
export function spareSpot(s: Sim, step: Extract<Step, { kind: 'lift' }>): { x: number; z: number } {
  if (step.crane === 'tower') {
    const ring = [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].map(([dx, dz]) => ({ x: PALLET_RING.x + dx, z: PALLET_RING.z + dz }))
    const room = (p: { x: number; z: number }) => Math.min(...s.things.filter((t) => !t.gone).map((t) => near(t, p)))
    return ring.reduce((best, p) => (room(p) > room(best) ? p : best))
  }
  const stand = craneStand(step.build)
  if (stand === null) throw new Error(`build ${step.build} has no place for the truck crane to stand`)
  const base = craneBase({ ...s.machines.mobile, x: stand.x, z: stand.z, yaw: stand.yaw })
  const dry = (p: { x: number; z: number }) => p.z > RIVER.z1 + 1 || p.z < RIVER.z0 - 1
  const spots = [Math.PI / 2, -Math.PI / 2, Math.PI].map((a) => ({ x: base.x + Math.sin(stand.yaw + a) * SPARE_OUT, z: base.z + Math.cos(stand.yaw + a) * SPARE_OUT }))
  const spot = spots.find((p) => dry(p) && clearOfStanding(s, p.x, p.z, 2.5))
  if (spot === undefined) throw new Error(`no clear spot in reach of the truck crane at build ${step.build}`)
  return spot
}

/** Pip's spare: when nothing a lift needs exists anywhere and the child has waited, one appears where the crane can get it. */
function spareThing(s: Sim, step: Extract<Step, { kind: 'lift' }>): void {
  const b = s.builds[step.build]
  if (b.placed >= b.spots.length || s.idle < 10) return
  const wants = b.spots[b.placed].wants
  if (s.things.some((t) => t.kind === wants && !t.gone)) return
  const at = spareSpot(s, step)
  spawnThing(s, wants, at.x, at.z)
  s.idle = 0
}

/** How far two bodies, or a body and a standing thing, may lie in each other before a friend moves the parked one: a hand's width. */
const OVERLAP_MAX = 0.3
/** Seconds between two looks for parked machines in each other's way. */
const SWEEP_EVERY = 0.5

/** A parked machine that lies in another machine, a plant's body or legs or a standing house by more than OVERLAP_MAX is driven clear of it by a friend: the child's machine, the cranes and one on its way stay. */
function sweep(s: Sim): void {
  const things = footprints(s)
  for (const m of Object.values(s.machines)) {
    if (!m.unlocked || m.kind === 'mobile' || !free(s, [])(m)) continue
    const mine = rectOf(m)
    // Standing things do not move, so it leaves those first; only when it is clear of them does it make way for another machine.
    const crowd = [things.map((f) => ({ from: f.rect, depth: overlapDepth(mine, f.rect) })), Object.values(s.machines).filter((o) => o !== m && o.unlocked).map((o) => ({ from: o, depth: overlapDepth(mine, rectOf(o)) }))]
    const pushers = crowd.map((list) => list.filter((c) => c.depth > OVERLAP_MAX)).find((list) => list.length > 0)
    if (pushers === undefined) continue
    let px = 0
    let pz = 0
    for (const c of pushers) {
      const d = near(m, c.from)
      px += d < 0.05 ? c.depth : ((m.x - c.from.x) / d) * c.depth
      pz += d < 0.05 ? 0 : ((m.z - c.from.z) / d) * c.depth
    }
    const len = Math.hypot(px, pz)
    const out = Math.max(...pushers.map((c) => c.depth)) + 1.5
    // Pushed both ways at once, it goes the way it faces.
    const want = len < 1e-6 ? m.yaw : Math.atan2(px, pz)
    const others = Object.values(s.machines).filter((o) => o !== m && o.unlocked).map(rectOf)
    const clearAt = (x: number, z: number) => [...things.map((f) => f.rect), ...LOT_RECTS, ...others].every((r) => overlapDepth({ ...mine, x, z }, r) <= OVERLAP_MAX)
    // The way away if it is clear there (of the lots too, where houses are to come), else the nearest turn from it that is.
    const turns = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => want + (k * Math.PI) / 4)
    const way = turns.find((a) => clearAt(m.x + Math.sin(a) * out, m.z + Math.cos(a) * out)) ?? want
    driveTo(s, m, m.x + Math.sin(way) * out, m.z + Math.cos(way) * out, 0.5, FRIEND_PACE, true)
  }
}

const STUCK_FOR = 6

/** A machine with a goal that has not moved for STUCK_FOR seconds is lifted a few metres toward it by a friend: a child's machine never stays wedged. */
function unstick(s: Sim): void {
  for (const m of Object.values(s.machines)) {
    const g = m.goal
    if (!m.unlocked || g === null || arrived(m, g)) {
      m.seen = null
      continue
    }
    const seen = m.seen
    if (seen === null || Math.hypot(m.x - seen.x, m.z - seen.z) > 0.7) m.seen = { x: m.x, z: m.z, at: s.time }
    else if (s.time - seen.at >= STUCK_FOR) {
      const d = Math.max(near(m, g), 0.1)
      const k = Math.min(8, d) / d
      m.x += (g.x - m.x) * k
      m.z += (g.z - m.z) * k
      m.speed = 0
      m.y = groundY(s, m.x, m.z)
      m.seen = { x: m.x, z: m.z, at: s.time }
    }
  }
}

/** Everything the jobs do in a frame, after the world has stepped. */
export function stepJobs(s: Sim, dt: number): void {
  unstick(s)
  const tower = s.machines.tower
  if (tower.unlocked) tower.up = Math.min(1, tower.up + dt / 1.5)
  if (s.hop !== null) {
    s.hop.t += dt / HOP_FOR
    if (s.hop.t >= 1) s.hop = null
  }
  if (Math.floor(s.time / SWEEP_EVERY) !== Math.floor((s.time - dt) / SWEEP_EVERY)) sweep(s)
  s.day = toward(s.day, dayTarget(s), 0.08 * dt)
  if (s.card !== null) {
    const cardFor = s.card.kind === 'chapter' ? CARD_FOR : CARD_END_FOR
    if (s.time - s.cardAt >= cardFor) s.card = null
  }
  if (s.party !== null && s.party.t >= PARTY_FOR) endParty(s)
  if (s.partyWait !== null) stepPartyWait(s, s.partyWait, dt)
  const run = s.job
  if (run === null) {
    if (s.party !== null || s.partyWait !== null || (s.card !== null && s.card.kind !== 'chapter')) return
    s.nextJobIn -= dt
    if (s.nextJobIn <= 0) startJob(s, nextJob(s))
    return
  }
  const step = run.job.steps[run.step]
  // Only easy mode hops by itself: in pro the held keys never change hands under the child's fingers.
  if (run.autoHopAt !== null && s.mode === 'easy' && s.time >= run.autoHopAt) {
    const kind = machineOf(step)
    run.autoHopAt = null
    if (kind !== null && s.machines[kind].unlocked && kind !== s.active && !(s.ownHopAt !== null && s.ownHopAt >= run.stepAt)) hop(s, kind, false)
  }
  const before = run.count
  const done = measure(s, run)
  // Idle: the count grew, or the step's machine came closer to the pointer.
  const p = stepPointer(s)
  let progress = run.count > before + 1e-9
  if (p !== null) {
    const d = near(s.machines[p.machine], p)
    if (d < run.nearest - 0.3) {
      run.nearest = d
      progress = true
    }
  }
  s.idle = progress ? 0 : s.idle + dt
  if (done) {
    nextStep(s, run)
    return
  }
  switch (step.kind) {
    case 'scoop':
    case 'digOut':
      partners(s, run, step)
      break
    case 'tip':
    case 'feed': {
      if (step.kind === 'tip') waitForPush(s, run, step)
      const d = s.machines.dumper
      if (d.load.amount < 0.05 && d.seq === 'rest' && d.bed < 0.05 && run.count < step.need - 1e-6) refill(s, run)
      break
    }
    case 'pour': {
      const m = s.machines.mixer
      if (m.concrete < 0.01 && m.seq === 'rest' && m.chute < 0.05 && run.count < 1 - 1e-9 && s.forms[step.form].fill < 1) refill(s, run)
      break
    }
    case 'water': {
      const m = s.machines.mixer
      if (m.sand < 0.05 && m.concrete < 0.01) refill(s, run)
      break
    }
    case 'push': {
      const ends = pushEnds(s, run, step.hole)
      const dozer = s.machines.dozer
      const goal = run.phase === 0 ? ends.from : ends.to
      if (near(dozer, goal) < 2.2 && (run.phase === 1 || wayClear(s, run, ends))) flipPhase(run)
      const heap = heapNear(s, run, step.hole)
      tidy(s, run, 'dozer', (p) => near(p, heap) < 7 || near(p, step.hole) < 8, step.hole)
      const need = (step.need - run.count) * run.base
      if (heap.volume < need * 0.3 && s.machines.dumper.load.amount < 0.2 && s.machines.dumper.seq === 'rest') refill(s, run)
      break
    }
    case 'clear': {
      const ends = clearEnds(s, run, step.zone)
      const goal = run.phase === 0 ? ends.from : ends.to
      if (near(s.machines.dozer, goal) < 2.2 && (run.phase === 1 || wayClear(s, run, ends))) flipPhase(run)
      tidy(s, run, 'dozer', (p) => near(p, step.zone) < step.zone.r + 6, step.zone)
      break
    }
    case 'roll':
      tidy(s, run, 'roller', (p) => onRoad(p, step.road), roadMiddle(step.road))
      break
    case 'lift':
      spareThing(s, step)
      tidy(s, run, step.crane, (p) => nearBuild(s.builds[step.build], p, BUILD_MARGIN) && s.builds[step.build].kind !== 'bridge', s.builds[step.build])
      break
    default:
      break
  }
  if (s.cranePress) {
    const m = s.machines[s.active]
    if (m.kind === 'tower' || m.kind === 'mobile') {
      if (m.seq === 'rest') {
        s.cranePress = false
        s.pressNext = true
      }
    } else s.cranePress = false
  }
}

/** How far from the dozer's line a machine on its way counts as crossing it, in metres. */
const WAY_ASIDE = 8
/** The longest the dozer waits at the start of a pass for machines crossing its way, in seconds. */
const WAY_WAIT = 4

/** True when the dozer at the start of a pass may set off along `ends`: no other machine is driving across the line, or it has waited WAY_WAIT s for them (a friend on its way home goes round the dozer and the blade would only push the heap aside). */
function wayClear(s: Sim, run: JobRun, ends: { from: { x: number; z: number }; to: { x: number; z: number } }): boolean {
  const { from, to } = ends
  const len = Math.max(near(from, to), 1e-6)
  const crossing = Object.values(s.machines).some((o) => {
    if (o.kind === 'dozer' || !o.unlocked || o.goal === null) return false
    const along = clamp(((o.x - from.x) * (to.x - from.x) + (o.z - from.z) * (to.z - from.z)) / len, 0, len)
    return Math.hypot(o.x - (from.x + ((to.x - from.x) * along) / len), o.z - (from.z + ((to.z - from.z) * along) / len)) < WAY_ASIDE
  })
  if (crossing) run.holdFrom ??= s.time
  if (!crossing || s.time - (run.holdFrom ?? s.time) >= WAY_WAIT) {
    run.holdFrom = null
    return true
  }
  return false
}

/** The dozer reached the end of a leg: the other leg is next, and a pass is counted when one ends. The marker is new, so getting closer to it counts as progress again. */
function flipPhase(run: JobRun): void {
  if (run.phase === 1) run.passes++
  run.phase = run.phase === 0 ? 1 : 0
  run.nearest = Infinity
}

/** The load ran out short: back to the loading step, and a hint for the bubble. */
function refill(s: Sim, run: JobRun): void {
  run.step = refillTarget(run)
  s.events.push({ kind: 'hint' })
  enterStep(s, run, false)
}

// ---------------------------------------------------------------------------------------
// Restoring a save.

/** The machines' pictures: every machine at home, the job done in the town. */
function placeHome(s: Sim, kind: MachineKind): void {
  const m = s.machines[kind]
  m.unlocked = true
  m.x = HOME[kind].x
  m.z = HOME[kind].z
  m.yaw = HOME[kind].yaw
  m.goal = null
  m.friend = false
  m.y = groundY(s, m.x, m.z)
  if (kind === 'tower') s.machines.tower.up = 1
}

/** Stamps what a finished job leaves, step by step, so a save restored by `storyDone` rebuilds the town without replaying it. */
export function applyDone(s: Sim, jobId: string): void {
  const j = STORY.find((o) => o.id === jobId)
  if (j === undefined) throw new Error(`no story job ${jobId}`)
  for (const kind of j.brings) placeHome(s, kind)
  if (jobId === 'rocks') for (const [who, x, z] of FAR_BANK) spawnAnimal(s, who, x, z)
  if (jobId === 'span') for (const a of s.animals) if (a.z < RIVER.z0) [a.x, a.z] = [8 + (a.id % 5) - 2, -22 + (a.id % 3)]
  for (const step of j.steps) {
    switch (step.kind) {
      case 'digOut':
        stampDig(s, step)
        if ('pond' in step.makes) s.ponds[step.makes.pond].water = 1
        break
      case 'push':
        stampPush(s, step)
        break
      case 'roll':
        markRoadBuilt(s.terrain, step.road)
        break
      case 'pour': {
        const f = s.forms[step.form]
        f.shown = true
        f.fill = 1
        f.hard = true
        const lot = LOTS[f.lot]
        setSurface(s.terrain, { kind: 'rect', x: lot.x, z: lot.z, w: lot.w, d: lot.d }, 'slab')
        break
      }
      case 'scoop':
        if (step.into !== 'dumper' && step.into !== 'mixer') feedPlant(s, step.into, step.scoops * SCOOP)
        break
      case 'feed':
        feedPlant(s, step.plant, step.need)
        break
      case 'carry':
        for (let k = 0; k < step.count; k++) {
          const thing = freeThings(s, step.thing).filter((t) => !inZone(t.x, t.z, step.ring)).sort((p, q) => near(p, step.ring) - near(q, step.ring))[0]
          if (thing === undefined) throw new Error(`job ${jobId} carries ${step.count} ${step.thing} to its ring but only ${k} were made`)
          placeInRing(s, thing, step.ring)
        }
        break
      case 'lift': {
        const b = s.builds[step.build]
        b.shown = true
        // The pieces come from the things lying about (a plant's pallets, the planks at the saw). Only the jobs that put their own pieces out as setup
        // (span, slide and hallTop) may find one missing: those were never put out here.
        for (let k = 0; k < step.pieces && b.placed < b.spots.length; k++) {
          const wants = b.spots[b.placed].wants
          const thing = freeThings(s, wants)[0]
          if (thing !== undefined) thing.gone = true
          else if (!j.setup.some((o) => o.thing === wants)) throw new Error(`job ${jobId} lifts ${step.pieces} pieces but no ${wants} was made for piece ${k}`)
          b.placed++
        }
        if (b.kind === 'bridge' && b.placed >= b.spots.length) addDeck(s)
        break
      }
      case 'unload':
        feedPlant(s, 'saw', PLANTS.saw.need)
        break
      default:
        break
    }
  }
  if (j.movesIn !== null) {
    const b = s.builds[j.movesIn.build]
    const a = s.animals.find((o) => o.species === j.movesIn?.who && o.home < 0) ?? spawnAnimal(s, j.movesIn.who, b.x, b.z + 5)
    a.home = j.movesIn.build
    a.x = b.x
    a.z = b.z + BUILD_HALF[b.kind][1] + 1.2
    a.goalX = a.x
    a.goalZ = a.z
    a.y = groundY(s, a.x, a.z)
  }
}
