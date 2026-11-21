import { describe, expect, it } from 'vitest'
import { FORMS, FOREST_RING, LOTS, PLACES, PLANTS, RIVER, SANDPIT_RING, TIP_RINGS, WATER_RING } from './map'
import { armPoints, armToTip, bedTail, bucketTip, craneBase, forkPoint, hookPoint, idleCmd, proCmd, seatPoint, stepMachine } from './machines'
import type { Cmd } from './machines'
import {
  BOOM_LEN, BOOM_RANGE, BOOM_ROOT_Y, BOOM_ROOT_Z, BUCKET_LEN, CARRY, CURL_RANGE, DIG_MAX, DIG_MIN, DUMPER_CAP, MACHINE_KINDS, MACHINE_SPECS, MAST_H, MIXER_SAND, SCOOP, SEAT, STICK_LEN, STICK_RANGE,
  type Goal, type MachineKind, type Sim,
} from './model'
import { SETTLE_BUDGET, heightAt, looseVolume, settle, spill, surplusIn } from './terrain'
import { beginWorld, createWorld, groundY, spawnThing, stepWorld } from './world'
import { mulberry32, turnTo } from './math'

export function newWorld(): Sim {
  return createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'pro', seed: 7 })
}

/** One frame of the physics with the given commands for some machines; the rest stand still. */
export function frame(s: Sim, dt: number, cmds: Partial<Record<MachineKind, Cmd>> = {}): void {
  beginWorld(s)
  for (const k of MACHINE_KINDS) {
    const m = s.machines[k]
    if (m.unlocked) stepMachine(s, m, cmds[k] ?? idleCmd(), dt)
  }
  stepWorld(s, dt)
  settle(s.terrain, SETTLE_BUDGET)
  s.time += dt
}

export function run(s: Sim, seconds: number, cmds: Partial<Record<MachineKind, Cmd>> = {}, dt = 1 / 30): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) frame(s, dt, cmds)
}

/** A world with only one machine come, standing where it is told. */
function alone(kind: MachineKind, x: number, z: number, yaw: number): Sim {
  const s = newWorld()
  for (const m of Object.values(s.machines)) m.unlocked = false
  const m = s.machines[kind]
  m.unlocked = true
  m.x = x
  m.z = z
  m.yaw = yaw
  m.y = groundY(s, x, z)
  if (m.kind === 'semi') m.trailerYaw = yaw
  return s
}

/** Everything loose that exists: on the ground, packed into road, and held by machines. Plants and forms eat stuff, so tests of this law keep clear of them. */
const mass = (s: Sim) => looseVolume(s.terrain) + s.terrain.packed + s.machines.digger.load.amount + s.machines.dumper.load.amount + (s.machines.mixer.sand + s.machines.mixer.concrete * MIXER_SAND)

const goal = (x: number, z: number, within: number, extra: Partial<Goal> = {}): Goal => ({ x, z, within, reverse: false, thenPress: false, yaw: null, pace: 1, ...extra })

/** The pro levers that move the digger's joints toward a pose. */
function pose(s: Sim, target: { swing: number; boom: number; stick: number; curl: number }): Cmd {
  const d = s.machines.digger
  const k = (e: number, rate: number) => Math.max(-1, Math.min(1, e / (rate / 30)))
  return { ...idleCmd(), a: k(turnTo(d.swing, target.swing), 2.2), b: k(target.boom - d.boom, 2.2), c: k(target.stick - d.stick, 2.4), d: k(target.curl - d.curl, 3.5) }
}

const FLAT = { x: 38, z: 0 }

/** The most direction changes any machine makes on any route: one back-up and one go-ahead is a turn, more is dithering. */
const MOST_FLIPS = 4

describe('driving to a goal', () => {
  // Every ring a job sends a machine to, the plants' feed spots and the gate.
  const all: readonly (readonly [number, number])[] = [PLACES.sand, PLACES.rock, PLACES.road, PLACES.bridge, PLACES.water, PLACES.forest, PLACES.play, PLACES.clock, PLANTS.press.feedSpot, { x: 44, z: 30 }, PLANTS.crusher.feedSpot, PLANTS.saw.feedSpot, SANDPIT_RING, TIP_RINGS[0]].map((p) => [p.x, p.z] as const)

  for (const kind of MACHINE_KINDS.filter((k) => k !== 'tower')) {
    // The water ring is for the mixer: the truck crane is too long to turn beside the tower.
    const spots = kind === 'mobile' ? all.filter((p) => p[0] !== PLACES.water.x) : all
    it(`${kind} reaches every spot from every other, in a few moves`, () => {
      // One world for every route (making a terrain is the slow part): each route starts from the machine as it was made.
      const s = alone(kind, 0, 0, 0)
      for (const b of s.builds) {
        b.shown = true
        b.placed = b.spots.length
      }
      const m = s.machines[kind]
      const made = structuredClone(m)
      for (let from = 0; from < spots.length; from++) {
        for (let to = 0; to < spots.length; to++) {
          if (from === to) continue
          Object.assign(m, structuredClone(made))
          m.x = spots[from][0]
          m.z = spots[from][1]
          m.yaw = ((from * 7 + to * 3) % 12) * 0.5236
          m.y = groundY(s, m.x, m.z)
          if (m.kind === 'semi') m.trailerYaw = m.yaw
          m.goal = goal(spots[to][0], spots[to][1], 4.5)
          let flips = 0
          let last = 0
          for (let i = 0; i < 40 * 30 && m.goal !== null; i++) {
            frame(s, 1 / 30)
            const dir = Math.abs(m.speed) < 0.4 ? 0 : Math.sign(m.speed)
            if (dir !== 0 && last !== 0 && dir !== last) flips++
            if (dir !== 0) last = dir
          }
          const label = `${kind} from ${spots[from]} to ${spots[to]}`
          expect(m.goal, label).toBeNull()
          expect(flips, label).toBeLessThanOrEqual(kind === 'semi' ? 0 : MOST_FLIPS)
        }
      }
    }, 240000)
  }

  it('a goal with a yaw arrives turned to it, and a goal with thenPress is left for the hands', () => {
    const s = alone('dumper', 0, 0, 0)
    s.machines.dumper.goal = goal(10, 10, 0.6, { yaw: 1, reverse: true })
    run(s, 30)
    expect(s.machines.dumper.goal).toBeNull()
    expect(Math.abs(turnTo(s.machines.dumper.yaw, 1))).toBeLessThan(0.06)
    s.machines.dumper.goal = goal(10, 20, 1, { thenPress: true })
    run(s, 30)
    expect(s.machines.dumper.goal).not.toBeNull()
    expect(Math.hypot(s.machines.dumper.x - 10, s.machines.dumper.z - 20)).toBeLessThan(1)
  })
})

describe('the lorry', () => {
  it('loops to goals all round it without backing up, and never orbits one', { timeout: 120000 }, () => {
    const open = { x: 14, z: 22 }
    for (const r of [2, 4, 8, 12]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        const s = alone('semi', open.x, open.z, 0.4)
        const m = s.machines.semi
        m.goal = goal(open.x + Math.sin(a) * r, open.z + Math.cos(a) * r, 1.5)
        let slowest = 0
        for (let i = 0; i < 40 * 30 && m.goal !== null; i++) {
          frame(s, 1 / 30)
          slowest = i / 30
          expect(m.speed, `goal ${r} m at ${k}/16`).toBeGreaterThan(-0.1)
        }
        expect(m.goal, `goal ${r} m at ${k}/16`).toBeNull()
        expect(slowest).toBeLessThan(35)
      }
    }
  })

  it('arrives with its trailer in tow, folded no more than 1.2, and straightens when it drives on', () => {
    const s = alone('semi', 20, 0, 0)
    const m = s.machines.semi
    m.goal = goal(40, 10, 2)
    let worst = 0
    for (let i = 0; i < 30 * 30; i++) {
      frame(s, 1 / 30)
      worst = Math.max(worst, Math.abs(turnTo(m.trailerYaw, m.yaw)))
    }
    expect(m.goal).toBeNull()
    expect(worst).toBeLessThanOrEqual(1.2 + 1e-9)
    run(s, 8, { semi: { ...idleCmd(), drive: 1 } })
    expect(Math.abs(turnTo(m.trailerYaw, m.yaw))).toBeLessThan(0.15)
    const hitch = { x: m.x - Math.sin(m.yaw) * 1.4, z: m.z - Math.cos(m.yaw) * 1.4 }
    expect(Math.hypot(hitch.x - m.x, hitch.z - m.z)).toBeCloseTo(1.4, 6)
  })

  it('does not fold its trailer past the limit even when driven by hand, forward or back', () => {
    const s = alone('semi', 20, 0, 0)
    const m = s.machines.semi
    let worst = 0
    for (const [drive, steer] of [[1, 1], [-1, 1], [-1, -1], [1, -1], [-1, 0.3]]) {
      for (let i = 0; i < 20 * 30; i++) {
        frame(s, 1 / 30, { semi: { ...idleCmd(), drive, steer } })
        worst = Math.max(worst, Math.abs(turnTo(m.trailerYaw, m.yaw)))
        expect(Number.isFinite(m.trailerYaw)).toBe(true)
      }
    }
    expect(worst).toBeLessThanOrEqual(1.2 + 1e-9)
  })

  it('loads logs in the forest ring and unloads them into the saw at its ring', () => {
    const s = alone('semi', FOREST_RING.x, FOREST_RING.z, 0)
    const m = s.machines.semi
    run(s, 2.5)
    expect(m.logs).toBe(1)
    m.x = PLANTS.saw.ring.x
    m.z = PLANTS.saw.ring.z
    run(s, 0.3, { semi: { ...idleCmd(), tap: true } })
    run(s, 6)
    expect(m.logs).toBe(0)
    expect(m.seq).toBe('rest')
    expect(s.plants.saw.made).toBe(1)
    expect(s.things.filter((t) => t.kind === 'planks')).toHaveLength(2)
  })
})

describe('the world around the machines', () => {
  it('never leaves the world or enters the river without a deck', { timeout: 120000 }, () => {
    for (const kind of MACHINE_KINDS.filter((k) => k !== 'tower')) {
      for (const [x, z, yaw] of [[8, -20, Math.PI], [40, 0, Math.PI / 2], [-40, 0, -Math.PI / 2], [0, 40, 0]] as const) {
        const s = alone(kind, x, z, yaw)
        const m = s.machines[kind]
        if (m.kind === 'mobile') m.legs = 0
        run(s, 40, { [kind]: { ...idleCmd(), drive: 1 } })
        for (const [lz, r] of MACHINE_SPECS[kind].body) {
          const cx = m.x + Math.sin(m.yaw) * lz
          const cz = m.z + Math.cos(m.yaw) * lz
          expect(Math.abs(cx) + r, `${kind} at ${cx.toFixed(1)}, ${cz.toFixed(1)}`).toBeLessThanOrEqual(47.05)
          expect(Math.abs(cz) + r, `${kind} at ${cx.toFixed(1)}, ${cz.toFixed(1)}`).toBeLessThanOrEqual(47.05)
          expect(cz - r >= RIVER.z1 - 0.2 || cz + r <= RIVER.z0 + 0.2, `${kind} in the river at ${cz.toFixed(1)}`).toBe(true)
        }
      }
    }
  })

  it('drives over the river on a deck', () => {
    const s = alone('dumper', 8, -20, Math.PI)
    s.decks.push({ x0: 5, x1: 11, z0: -42, z1: -31, y: 0.5 })
    run(s, 12, { dumper: { ...idleCmd(), drive: 1 } })
    expect(s.machines.dumper.z).toBeLessThan(-42)
    expect(groundY(s, 8, -36.5)).toBeCloseTo(0.5, 5)
  })

  it('never makes a NaN, whatever it is told', () => {
    const rand = mulberry32(5)
    for (const kind of MACHINE_KINDS) {
      const s = alone(kind, 20, 5, 1)
      s.things.length = 0
      spawnThing(s, 'bricks', 22, 8)
      for (let i = 0; i < 60 * 30; i++) {
        const c: Cmd = { drive: rand() * 2 - 1, steer: rand() * 2 - 1, a: rand() * 2 - 1, b: rand() * 2 - 1, c: rand() * 2 - 1, d: rand() * 2 - 1, tap: rand() < 0.05 }
        frame(s, 1 / 30, { [kind]: c })
      }
      const m = s.machines[kind]
      expect([m.x, m.y, m.z, m.yaw, m.speed].every(Number.isFinite)).toBe(true)
    }
  })

  it('a machine in pro does what the same levers do straight through stepMachine', () => {
    const s = newWorld()
    s.active = 'dumper'
    s.hands.levers = { drive: 0.8, steer: -0.5, a: 1, b: 0, c: 0, d: 0 }
    s.machines.dumper.load = { amount: 4, kind: 'sand' }
    const copy = structuredClone(s)
    // the same frames both ways
    for (let i = 0; i < 90; i++) {
      beginWorld(s)
      stepMachine(s, s.machines.dumper, proCmd('dumper', s.hands.levers, false), 1 / 30)
      stepMachine(s, s.machines.digger, idleCmd(), 1 / 30)
      stepWorld(s, 1 / 30)
      beginWorld(copy)
      stepMachine(copy, copy.machines.dumper, proCmd('dumper', copy.hands.levers, false), 1 / 30)
      stepMachine(copy, copy.machines.digger, idleCmd(), 1 / 30)
      stepWorld(copy, 1 / 30)
    }
    expect(copy.machines.dumper).toEqual(s.machines.dumper)
    expect(s.machines.dumper.bed).toBe(1)
    expect(s.machines.dumper.speed).toBeGreaterThan(5)
  })
})

describe('the digger', () => {
  it('has kinematics that match the constants', () => {
    const s = alone('digger', FLAT.x, FLAT.z, 0)
    const d = s.machines.digger
    d.boom = 0
    d.stick = 0
    d.curl = 0
    d.y = 0
    const flat = armPoints(d)
    expect(flat.root.z - d.z).toBeCloseTo(BOOM_ROOT_Z, 9)
    expect(flat.root.y).toBeCloseTo(BOOM_ROOT_Y, 9)
    expect(flat.tip.z - d.z).toBeCloseTo(BOOM_ROOT_Z + BOOM_LEN + STICK_LEN + BUCKET_LEN, 9)
    expect(flat.tip.y).toBeCloseTo(BOOM_ROOT_Y, 9)
    d.boom = CARRY.boom
    d.stick = CARRY.stick
    d.curl = CARRY.curl
    const carry = armPoints(d)
    expect(Math.hypot(carry.elbow.z - carry.root.z, carry.elbow.y - carry.root.y)).toBeCloseTo(BOOM_LEN, 9)
    expect(Math.hypot(carry.wrist.z - carry.elbow.z, carry.wrist.y - carry.elbow.y)).toBeCloseTo(STICK_LEN, 9)
    expect(Math.hypot(carry.tip.z - carry.wrist.z, carry.tip.y - carry.wrist.y)).toBeCloseTo(BUCKET_LEN, 9)
    d.swing = Math.PI / 2
    expect(bucketTip(d).x - d.x).toBeCloseTo(Math.hypot(carry.tip.z - d.z, 0), 9)
    d.swing = 0
    // the inverse puts the tip where it was asked, everywhere the arm can reach
    let reached = 0
    for (let reach = DIG_MIN; reach <= DIG_MAX; reach += 0.4) {
      for (let rise = -1.2; rise <= 0.5; rise += 0.4) {
        for (const angle of [-1.2, -1.8, -2.4]) {
          const j = armToTip(reach, rise, angle)
          expect(j.boom).toBeGreaterThanOrEqual(BOOM_RANGE[0])
          expect(j.boom).toBeLessThanOrEqual(BOOM_RANGE[1])
          expect(j.stick).toBeGreaterThanOrEqual(STICK_RANGE[0])
          expect(j.stick).toBeLessThanOrEqual(STICK_RANGE[1])
          expect(j.curl).toBeGreaterThanOrEqual(CURL_RANGE[0])
          expect(j.curl).toBeLessThanOrEqual(CURL_RANGE[1])
          Object.assign(d, j)
          const tip = bucketTip(d)
          if (Math.abs(tip.z - d.z - reach) < 1e-6 && Math.abs(tip.y - d.y - rise) < 1e-6 && Math.abs(armPoints(d).angle - angle) < 1e-6) reached++
        }
      }
    }
    expect(reached).toBeGreaterThan(40)
  })

  it('digs when the bucket goes below the surface and spills when it is tipped, and keeps every cubic metre', () => {
    const s = alone('digger', FLAT.x, FLAT.z, 0)
    const d = s.machines.digger
    const before = mass(s)
    const ground = heightAt(s.terrain, FLAT.x, FLAT.z + 4.6)
    const ready = armToTip(4.6, ground + 0.4 - d.y, -1.0)
    for (let i = 0; i < 90; i++) frame(s, 1 / 30, { digger: pose(s, { swing: 0, ...ready }) })
    expect(d.load.amount).toBe(0)
    for (let i = 0; i < 60; i++) frame(s, 1 / 30, { digger: pose(s, { swing: 0, ...armToTip(4.6, heightAt(s.terrain, FLAT.x, FLAT.z + 4.6) - 0.4 - d.y, -1.4) }) })
    expect(d.load.amount).toBeCloseTo(SCOOP, 1)
    expect(heightAt(s.terrain, FLAT.x, FLAT.z + 4.6)).toBeLessThan(ground - 0.2)
    expect(mass(s)).toBeCloseTo(before, 3)
    const up = armToTip(4.6, ground + 1.2 - d.y, -0.3)
    for (let i = 0; i < 120; i++) frame(s, 1 / 30, { digger: pose(s, { swing: 0, ...up }) })
    expect(d.load.amount).toBe(0)
    expect(mass(s)).toBeCloseTo(before, 3)
    expect(s.streams).toHaveLength(0)
  })

  it('a bucket tipped over the dumper loads it, and the overflow lands on the ground', () => {
    const s = newWorld()
    for (const k of ['dozer', 'roller', 'mixer', 'forklift', 'tower', 'semi', 'mobile'] as const) s.machines[k].unlocked = false
    const d = s.machines.digger
    const t = s.machines.dumper
    d.x = FLAT.x
    d.z = FLAT.z
    d.yaw = 0
    t.x = FLAT.x + 5
    t.z = FLAT.z
    t.yaw = 0
    t.load = { amount: DUMPER_CAP - 1, kind: 'sand' }
    d.load = { amount: SCOOP, kind: 'sand' }
    const before = mass(s)
    const over = armToTip(5, 4.5 - d.y, -0.3)
    d.swing = turnTo(0, Math.PI / 2)
    for (let i = 0; i < 150; i++) frame(s, 1 / 30, { digger: pose(s, { swing: Math.PI / 2, ...over }) })
    expect(d.load.amount).toBe(0)
    expect(t.load.amount).toBeCloseTo(DUMPER_CAP, 5)
    expect(mass(s)).toBeCloseTo(before, 3)
  })
})

describe('the dumper, the dozer, the roller', () => {
  it('a raised bed runs the load out behind it; a hopper takes it when the tail is over it', () => {
    const s = alone('dumper', 20, 0, 0)
    const m = s.machines.dumper
    m.load = { amount: DUMPER_CAP, kind: 'sand' }
    const before = mass(s)
    run(s, 2, { dumper: { ...idleCmd(), a: 1 } })
    expect(m.bed).toBe(1)
    expect(m.load.amount).toBeLessThan(DUMPER_CAP)
    run(s, 6)
    expect(m.load.amount).toBe(0)
    expect(mass(s)).toBeCloseTo(before, 3)
    expect(Math.hypot(bedTail(m).x - 20, bedTail(m).z + 2.95)).toBeLessThan(0.05)
    const at = alone('dumper', PLANTS.press.feedSpot.x, PLANTS.press.feedSpot.z, PLANTS.press.feedSpot.yaw)
    at.machines.dumper.load = { amount: 3, kind: 'sand' }
    run(at, 6, { dumper: { ...idleCmd(), a: 1 } })
    expect(at.plants.press.stored + at.plants.press.made * PLANTS.press.need).toBeCloseTo(3, 5)
  })

  it('the dozer pushes a heap along on flat ground and keeps what it moves', () => {
    const s = alone('dozer', 30, 0, 0)
    s.machines.dozer.blade = 0
    spill(s.terrain, 30, 6, 1.4, 4, 'sand')
    run(s, 1)
    const before = mass(s)
    // where the stuff above the flat ground lies, down the lane the dozer drives
    const lane = () => {
      let v = 0
      let zc = 0
      for (let z = -4; z < 40; z += 2) {
        const here = surplusIn(s.terrain, { x: 30, z, r: 2 }, 0.05)
        v += here
        zc += here * z
      }
      return { v, z: zc / v }
    }
    const start = lane()
    expect(start.v).toBeGreaterThan(3)
    run(s, 6, { dozer: { ...idleCmd(), drive: 0.5 } })
    const end = lane()
    expect(end.z).toBeGreaterThan(start.z + 1)
    expect(end.v).toBeGreaterThan(start.v * 0.25)
    expect(mass(s)).toBeCloseTo(before, 3)
  })

  it('the roller turns a road bed to road in one pass and its stomp makes an event', () => {
    const s = alone('roller', 8, 25, 0)
    s.machines.roller.yaw = Math.PI
    s.machines.roller.z = 27
    s.machines.roller.x = 8
    run(s, 0.1, { roller: { ...idleCmd(), tap: true } })
    expect(s.events.some((e) => e.kind === 'stomp')).toBe(true)
    run(s, 6, { roller: { ...idleCmd(), drive: 1 } })
    expect(s.events.some((e) => e.kind === 'rolled')).toBe(true)
    expect(s.score.coins).toBeGreaterThan(0)
  })
})

describe('the mixer, the plants, the forms and the ponds', () => {
  it('fills with water under the tower, mixes, and pours into a form that then sets', () => {
    const s = alone('mixer', WATER_RING.x, WATER_RING.z, 0)
    const m = s.machines.mixer
    m.sand = MIXER_SAND
    run(s, 0.5)
    expect(s.watering).toBe(true)
    expect(s.streams.some((st) => st.stuff === 'water')).toBe(true)
    run(s, 1.5)
    expect(m.water).toBe(1)
    run(s, 3.5)
    expect(m.concrete).toBe(1)
    expect(m.sand).toBe(0)
    expect(s.events.some((e) => e.kind === 'mixed')).toBe(true)
    // pour into form 0: the chute is 4.4 m behind the middle
    const lot = LOTS[FORMS[0].lot]
    s.forms[0].shown = true
    m.x = lot.x
    m.z = lot.z + 4.2
    m.yaw = 0
    m.speed = 0
    m.chute = 0
    run(s, 9, { mixer: { ...idleCmd(), a: 1 } })
    expect(m.concrete).toBe(0)
    expect(s.forms[0].fill).toBe(1)
    expect(s.forms[0].hard).toBe(true)
    expect(s.events.some((e) => e.kind === 'set')).toBe(true)
  })

  it('pours loose concrete on the ground when no form is there, and the law holds', () => {
    const s = alone('mixer', FLAT.x, FLAT.z, 0)
    const m = s.machines.mixer
    m.concrete = 1
    const before = mass(s)
    run(s, 6, { mixer: { ...idleCmd(), a: 1 } })
    expect(m.concrete).toBe(0)
    expect(mass(s)).toBeCloseTo(before, 3)
  })

  it('takes a hopper full into a batch: bricks on a slot, gravel on the ground, planks from logs', () => {
    const s = newWorld()
    s.plants.press.stored = PLANTS.press.need
    s.plants.crusher.stored = PLANTS.crusher.need
    const before = looseVolume(s.terrain)
    for (let i = 0; i < 90; i++) frame(s, 1 / 30)
    expect(s.plants.press.phase).toBe('idle')
    expect(s.plants.press.made).toBe(1)
    expect(s.things.filter((t) => t.kind === 'bricks')).toHaveLength(1)
    const slot = PLANTS.press.outSlots[0]
    expect(Math.hypot(s.things[0].x - slot[0], s.things[0].z - slot[1])).toBeLessThan(1e-9)
    expect(s.plants.crusher.made).toBe(1)
    expect(looseVolume(s.terrain) - before).toBeCloseTo(PLANTS.crusher.perBatch, 3)
    expect(s.events.filter((e) => e.kind === 'plantThump').length).toBeGreaterThan(2)
    expect(s.events.some((e) => e.kind === 'plantDone')).toBe(true)
  })

  it('fills a shown pond over three seconds', () => {
    const s = newWorld()
    s.ponds[0].shown = true
    run(s, 1.5)
    expect(s.ponds[0].water).toBeCloseTo(0.5, 1)
    run(s, 2)
    expect(s.ponds[0].water).toBe(1)
  })
})

describe('forks and hooks', () => {
  it('a forklift picks a thing on its forks, carries it at the fork point and sets it down in a ring slot', () => {
    const s = alone('forklift', 20, 0, 0)
    const m = s.machines.forklift
    const t = spawnThing(s, 'bricks', 20, 1.9)
    run(s, 0.1, { forklift: { ...idleCmd(), tap: true } })
    expect(m.holding).toBe(t.id)
    run(s, 2, { forklift: { ...idleCmd(), a: 1 } })
    const f = forkPoint(m)
    expect(Math.hypot(t.x - f.x, t.z - f.z)).toBeLessThan(1e-9)
    expect(t.y).toBeCloseTo(f.y, 9)
    expect(f.y).toBeGreaterThan(2)
    run(s, 2, { forklift: { ...idleCmd(), a: -1 } })
    run(s, 0.1, { forklift: { ...idleCmd(), tap: true } })
    expect(m.holding).toBe(-1)
    expect(t.heldBy).toBeNull()
    expect(t.y).toBeCloseTo(groundY(s, t.x, t.z), 9)
  })

  it('a tower hook grabs by the top, carries, and a let-go near the next spot makes a piece', () => {
    const s = alone('tower', 14, -2, Math.PI / 2)
    const m = s.machines.tower
    m.up = 1
    s.builds[0].shown = true
    const spot = s.builds[0].spots[0]
    const t = spawnThing(s, 'bricks', 20, -2)
    m.jib = Math.PI / 2
    m.trolley = 6
    m.hookY = 1.6
    run(s, 0.1, { tower: { ...idleCmd(), tap: true } })
    expect(m.holding).toBe(t.id)
    // up, round to the spot, out, down
    const toSpot = Math.atan2(spot.x - 14, spot.z + 2)
    run(s, 2, { tower: { ...idleCmd(), c: 1 } })
    for (let i = 0; i < 300; i++) frame(s, 1 / 30, { tower: { ...idleCmd(), a: Math.sign(turnTo(m.jib, toSpot)) * (Math.abs(turnTo(m.jib, toSpot)) > 0.02 ? 1 : 0), b: Math.sign(Math.hypot(spot.x - 14, spot.z + 2) - m.trolley) * (Math.abs(Math.hypot(spot.x - 14, spot.z + 2) - m.trolley) > 0.1 ? 1 : 0) } })
    const h = hookPoint(m)
    expect(Math.hypot(h.x - spot.x, h.z - spot.z)).toBeLessThan(0.6)
    expect(Math.hypot(t.x - h.x, t.z - h.z)).toBeLessThan(1e-9)
    run(s, 0.1, { tower: { ...idleCmd(), tap: true } })
    expect(m.holding).toBe(-1)
    expect(t.gone).toBe(true)
    expect(s.builds[0].placed).toBe(1)
    expect(s.events.some((e) => e.kind === 'place')).toBe(true)
    expect(craneBase(m)).toEqual({ x: 14, z: -2 })
  })

  it('a truck crane needs its legs down before the hook moves, and stows when it drives', () => {
    const s = alone('mobile', 20, 0, 0)
    const m = s.machines.mobile
    m.reach = 12
    m.hookY = 3
    run(s, 0.3, { mobile: { ...idleCmd(), b: 1 } })
    expect(m.reach).toBeLessThan(12)
    run(s, 2)
    expect(m.legs).toBe(1)
    const down = m.reach
    run(s, 0.5, { mobile: { ...idleCmd(), b: 1 } })
    expect(m.reach).toBeGreaterThan(down + 2)
    run(s, 4, { mobile: { ...idleCmd(), drive: 1 } })
    expect(m.legs).toBeLessThan(0.2)
    expect(m.reach).toBeLessThan(5.5)
    expect(m.speed).toBeGreaterThan(1)
  })
})

describe('seatPoint', () => {
  it('puts the driver where SEAT says, in the right frame', () => {
    for (const kind of MACHINE_KINDS) {
      const s = alone(kind, 20, 0, 0)
      const m = s.machines[kind]
      const [sx, sy, sz] = SEAT[kind]
      const p = seatPoint(m)
      const mast = kind === 'tower' ? MAST_H : 0
      const yaw = m.kind === 'tower' ? m.jib : 0
      expect(p.x).toBeCloseTo(m.x + sx * Math.cos(yaw) + sz * Math.sin(yaw), 6)
      expect(p.y).toBeCloseTo(m.y + sy + mast, 6)
      expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeCloseTo(Math.hypot(sx, sz), 6)
    }
    const s = alone('digger', 20, 0, 0)
    const d = s.machines.digger
    d.swing = Math.PI
    expect(seatPoint(d).z).toBeCloseTo(d.z - SEAT.digger[2], 6)
  })
})
