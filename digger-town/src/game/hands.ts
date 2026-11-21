/**
 * Easy mode's hands: the big button's sequence per machine, turned into the same `Cmd` pro mode's
 * levers are, so `stepMachine` does all the moving. Joints move toward their targets at the lever
 * rates, together, so nothing teleports. Press handling lives here too: the block after a hop and
 * the 1 s hold before a load is dropped away from the open step. `jobs.ts` says whether such a
 * step is open; that arrives as a plain boolean.
 */

import { CARRY, CURL_RANGE, DIG_MAX, DIG_MIN, DUMP_MAX, MACHINE_KINDS, MACHINE_SPECS, REACH_RANGE, THING_HEIGHT, TROLLEY_RANGE } from './model'
import type { ActionFace, Digger, Dozer, Dumper, Forklift, Machine, MachineKind, Mixer, Mobile, PieceSpot, PlantId, Semi, Sim, Thing, ThingKind, Tower, Zone } from './model'
import { LOTS, PLANTS, RIVER } from './map'
import { clamp, turnTo } from './math'
import { RATES, arrived, armToTip, craneBase, forkPoint, hookPoint, idleCmd, proCmd, receivers, stepMachine } from './machines'
import type { Cmd, Receiver } from './machines'
import { heightAt } from './terrain'
import { PLACE_RADIUS, groundY, thingById } from './world'

/** What the open job step tells the hands: where the digger should dig and what it fills, what a crane's lift step wants next, and whether the dozer is on its way back behind the heap. */
export interface Aims {
  dig: Zone | null
  /** What the digger's bucketfuls go into: a receiver, or 'ground' for a heap beside it. Null outside a digging step: the nearest receiver in reach then. */
  into: 'dumper' | 'mixer' | PlantId | 'ground' | null
  thing: Thing | null
  spot: PieceSpot | null
  /** A push or clear step is on its way back to the start of the next pass: easy mode lifts the blade by itself until the dozer is there. */
  bladeUp: boolean
}

export const NO_AIMS: Aims = { dig: null, into: null, thing: null, spot: null, bladeUp: false }

/** What the big button does this frame: held down (after the block and the hold rule), and just pressed. */
export interface Button {
  down: boolean
  press: boolean
}

const NO_BUTTON: Button = { down: false, press: false }

/** Seconds the button is held before a load is dropped away from the open step, and seconds after a hop before a fresh press counts. */
export const HOLD_FOR = 1
export const HOP_BLOCK = 0.6

/** Called by the sim at each hop (after it sets `lastHop`): the button does nothing until it is let go and pressed again at least HOP_BLOCK later. */
export function blockButton(s: Sim): void {
  s.hands.blocked = true
}

/**
 * Reads the big button for this frame. `guarded` is true when a step is open that needs the
 * load the active machine carries and the machine is outside that step's ring: the press then
 * takes HOLD_FOR seconds (`Hands.heldFor` fills the ring), and a shorter one gives `uhuh`.
 */
export function buttonStep(s: Sim, dt: number, guarded: boolean): Button {
  const h = s.hands
  if (!h.action) {
    const short = guarded && !h.blocked && h.heldFor > 0 && h.heldFor < HOLD_FOR
    h.heldFor = 0
    if (short) s.events.push({ kind: 'uhuh', machine: s.active })
    return NO_BUTTON
  }
  const fresh = h.heldFor === 0
  if (fresh && h.blocked) {
    if (s.lastHop === null) throw new Error('the button is blocked but no hop has happened')
    if (s.time - s.lastHop.at >= HOP_BLOCK) h.blocked = false
  }
  const before = h.heldFor
  h.heldFor += dt
  if (h.blocked) return NO_BUTTON
  if (guarded) return { down: h.heldFor >= HOLD_FOR, press: before < HOLD_FOR && h.heldFor >= HOLD_FOR }
  return { down: true, press: fresh }
}

/** The lever that moves a joint `err` away at `rate` in one frame, no more. */
const lever = (err: number, rate: number, dt: number) => clamp(err / (rate * dt), -1, 1)

/** Levers that bring every joint to its target at the same moment: the slowest one runs at 1. */
function together(errs: readonly number[], rates: readonly number[], dt: number): number[] {
  const t = Math.max(dt, ...errs.map((e, i) => Math.abs(e) / rates[i]))
  return errs.map((e, i) => clamp(e / (rates[i] * t), -1, 1))
}

const uhuh = (s: Sim, m: Machine) => s.events.push({ kind: 'uhuh', machine: m.kind })

// ---------------------------------------------------------------------------------------
// The digger.

const ARM_RATES = [RATES.swing, RATES.boom, RATES.stick, RATES.curl]
const ARM_REST = { swing: 0, boom: CARRY.boom, stick: CARRY.stick, curl: CARRY.curl }
/** A bucket is a bucketful when it holds this much. */
const HAS_LOAD = 0.05
/** The bucket's tip angle when it reaches in and when it opens. */
const REACH_ANGLE = -1
const OPEN_ANGLE = -0.35
const CARRY_ANGLE = -2
const BITE_TRAVEL = 1.6

type ArmTarget = { swing: number; boom: number; stick: number; curl: number }

/** Sets the digger's levers toward a target pose; returns how far the worst joint is from it. `tight` follows a moving target joint by joint. */
function armTo(m: Digger, target: ArmTarget, cmd: Cmd, dt: number, tight: boolean): number {
  const errs = [turnTo(m.swing, target.swing), target.boom - m.boom, target.stick - m.stick, target.curl - m.curl]
  const levers = tight ? errs.map((e, i) => lever(e, ARM_RATES[i], dt)) : together(errs, ARM_RATES, dt)
  ;[cmd.a, cmd.b, cmd.c, cmd.d] = levers
  return Math.max(...errs.map(Math.abs))
}

/** The ground point to dig: in the step's zone if its reach allows, else the most raised ground in front, else straight ahead. */
function pickDig(m: Digger, zone: Zone | null, s: Sim): { x: number; z: number } {
  const ahead = (a: number, r: number) => ({ x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r })
  if (zone !== null) {
    const d = Math.hypot(zone.x - m.x, zone.z - m.z)
    if (d >= DIG_MIN - zone.r && d <= DIG_MAX + zone.r) return ahead(Math.atan2(zone.x - m.x, zone.z - m.z), clamp(d, DIG_MIN + 0.2, DIG_MAX - 0.2))
  }
  let best: { x: number; z: number } | null = null
  let bestH = m.y + 0.3
  for (let a = -Math.PI / 2; a <= Math.PI / 2 + 1e-9; a += Math.PI / 12) {
    for (const r of [3.6, 4.4, 5.2]) {
      const p = ahead(m.yaw + a, r)
      const h = heightAt(s.terrain, p.x, p.z)
      if (h > bestH) {
        best = p
        bestH = h
      }
    }
  }
  return best ?? ahead(m.yaw, 4.6)
}

/** The receiver an `into` names, or undefined when it is not in the sim yet or `into` is the ground. */
export function receiverOf(s: Sim, into: Exclude<Aims['into'], 'ground' | null>): Receiver | undefined {
  return receivers(s, 0, true).find((r) => (typeof r.owner === 'string' ? r.owner === into : r.owner.kind === into))
}

/** How far outside a receiver's circle a heap on the ground is dropped. */
const HEAP_CLEAR = 1

/** Where to open: the step's receiver if it is in reach (only the named one: no other receiver is ever filled), else the nearest receiver in reach when no step names one, else 90 degrees aside, on the side away from the zone being dug and clear of every receiver. */
function pickReceiver(s: Sim, m: Digger, dig: { x: number; z: number }, aims: Aims): { x: number; z: number; top: number } {
  const inReach = (r: Receiver) => {
    const d = Math.hypot(r.x - m.x, r.z - m.z)
    return d >= 2 && d <= DUMP_MAX - 0.5
  }
  if (aims.into !== null && aims.into !== 'ground') {
    const named = receiverOf(s, aims.into)
    if (named !== undefined && inReach(named)) return named
  } else if (aims.into === null) {
    let best: Receiver | null = null
    let bestD = Infinity
    for (const r of receivers(s, 0, true)) {
      const d = Math.hypot(r.x - m.x, r.z - m.z)
      if (inReach(r) && d < bestD) {
        best = r
        bestD = d
      }
    }
    if (best !== null) return best
  }
  const bearing = Math.atan2(dig.x - m.x, dig.z - m.z)
  const away = aims.dig ?? dig
  const clear = (p: { x: number; z: number }) => receivers(s, 0, true).every((r) => Math.hypot(p.x - r.x, p.z - r.z) >= r.r + HEAP_CLEAR)
  const sides = [bearing + Math.PI / 2, bearing - Math.PI / 2].map((a) => ({ x: m.x + Math.sin(a) * 4.8, z: m.z + Math.cos(a) * 4.8 }))
  sides.sort((p, q) => Number(clear(q)) - Number(clear(p)) || Math.hypot(q.x - away.x, q.z - away.z) - Math.hypot(p.x - away.x, p.z - away.z))
  const p = sides[0]
  return { ...p, top: groundY(s, p.x, p.z) + 0.5 }
}

/** The pose that holds the bucket curled, over a receiver: and the same joints with the bucket opened. */
function overPose(m: Digger, x: number, z: number, top: number): { carry: ArmTarget; open: ArmTarget } {
  const swing = turnTo(m.yaw, Math.atan2(x - m.x, z - m.z))
  const reach = clamp(Math.hypot(x - m.x, z - m.z), 3, DUMP_MAX - 0.3)
  const o = armToTip(reach, top + 0.9 - m.y, OPEN_ANGLE)
  return { carry: { swing, boom: o.boom, stick: o.stick, curl: clamp(CARRY_ANGLE - o.boom - o.stick, CURL_RANGE[0], CURL_RANGE[1]) }, open: { swing, ...o } }
}

function digger(s: Sim, m: Digger, btn: Button, aims: Aims, dt: number): Cmd {
  const cmd = idleCmd()
  const busy = m.seq !== 'rest' && m.seq !== 'hold'
  if (btn.press && busy) m.pending = true
  const go = btn.press || btn.down || m.pending
  m.seqT += dt
  const next = (seq: Digger['seq']) => {
    m.seq = seq
    m.seqT = 0
  }
  switch (m.seq) {
    case 'rest':
      if (m.load.amount > HAS_LOAD) next('hold')
      else if (go) {
        const p = pickDig(m, aims.dig, s)
        m.aimX = p.x
        m.aimZ = p.z
        // A spoken press may bring a second one in the same breath, queued for the lift.
        m.pending = m.pending && s.pressNext
        next('reach')
      } else armTo(m, ARM_REST, cmd, dt, false)
      break
    case 'reach': {
      const reach = clamp(Math.hypot(m.aimX - m.x, m.aimZ - m.z), DIG_MIN, DIG_MAX)
      const swing = turnTo(m.yaw, Math.atan2(m.aimX - m.x, m.aimZ - m.z))
      const a = armToTip(reach, groundY(s, m.aimX, m.aimZ) + 0.25 - m.y, REACH_ANGLE)
      if (armTo(m, { swing, ...a }, cmd, dt, false) < 0.05 || m.seqT > 3) next('bite')
      break
    }
    case 'bite': {
      const u = Math.min(1, m.seqT / 0.9)
      const bearing = Math.atan2(m.aimX - m.x, m.aimZ - m.z)
      const reach0 = clamp(Math.hypot(m.aimX - m.x, m.aimZ - m.z), DIG_MIN, DIG_MAX)
      const reach = reach0 - Math.min(BITE_TRAVEL, reach0 - 2.9) * u
      const ground = groundY(s, m.x + Math.sin(bearing) * reach, m.z + Math.cos(bearing) * reach)
      const a = armToTip(reach, ground + 0.25 - 0.55 * Math.min(1, u / 0.4) - m.y, REACH_ANGLE - 1.5 * u)
      armTo(m, { swing: turnTo(m.yaw, bearing), ...a }, cmd, dt, true)
      if (m.seqT >= 0.9) next('lift')
      break
    }
    case 'lift':
      if (armTo(m, { ...ARM_REST, swing: m.swing }, cmd, dt, false) < 0.05 || m.seqT > 3) next('hold')
      break
    case 'hold':
      if (m.load.amount <= HAS_LOAD) next('rest')
      else if (go) {
        const dig = { x: m.aimX, z: m.aimZ }
        const r = pickReceiver(s, m, dig, aims)
        m.aimX = r.x
        m.aimZ = r.z
        m.pending = false
        next('swing')
      }
      break
    case 'swing': {
      const r = overPose(m, m.aimX, m.aimZ, receiverTop(s, m))
      if (armTo(m, r.carry, cmd, dt, false) < 0.05 || m.seqT > 3) next('open')
      break
    }
    case 'open': {
      const r = overPose(m, m.aimX, m.aimZ, receiverTop(s, m))
      armTo(m, r.open, cmd, dt, false)
      if ((m.load.amount <= 1e-6 && m.seqT > 0.25) || m.seqT > 2.5) next('close')
      break
    }
    case 'close':
      if (armTo(m, { ...ARM_REST, swing: m.swing }, cmd, dt, false) < 0.05 || m.seqT > 3) next('rest')
      break
  }
  return cmd
}

/** The rim height of whatever the digger's aim point is over. */
function receiverTop(s: Sim, m: Digger): number {
  let top = groundY(s, m.aimX, m.aimZ) + 0.5
  let bestD = Infinity
  for (const r of receivers(s, 0, true)) {
    const d = Math.hypot(r.x - m.aimX, r.z - m.aimZ)
    if (d < r.r && d < bestD) {
      top = r.top
      bestD = d
    }
  }
  return top
}

// ---------------------------------------------------------------------------------------
// The wheeled and tracked machines.

function dumper(m: Dumper, btn: Button, dt: number): Cmd {
  const cmd = idleCmd()
  m.seqT += dt
  const next = (seq: Dumper['seq']) => {
    m.seq = seq
    m.seqT = 0
  }
  switch (m.seq) {
    case 'rest':
      cmd.a = lever(0 - m.bed, RATES.bed, dt)
      if (!btn.press) break
      for (const id of ['press', 'crusher'] as const) {
        const c = PLANTS[id]
        const at = Math.hypot(m.x - c.feedSpot.x, m.z - c.feedSpot.z) < 1 && Math.abs(turnTo(m.yaw, c.feedSpot.yaw)) < 0.5
        if (m.load.amount > HAS_LOAD && !at && Math.hypot(m.x - c.ring.x, m.z - c.ring.z) < c.ring.r) {
          m.ownGoal = { x: c.feedSpot.x, z: c.feedSpot.z, within: 0.6, reverse: true, thenPress: false, yaw: c.feedSpot.yaw, pace: 1.5 }
          m.goal = m.ownGoal
          next('turn')
          return cmd
        }
      }
      next('up')
      break
    case 'turn':
      if (m.goal === null || m.seqT > 10) next('up')
      else if (m.goal !== m.ownGoal) next('rest')
      break
    case 'up':
      cmd.a = 1
      if ((m.load.amount <= 1e-6 && m.bed > 0.5) || m.seqT > 4.5) next('down')
      break
    case 'down':
      cmd.a = -1
      if (m.bed < 0.02) next('rest')
      break
  }
  return cmd
}

function mixer(s: Sim, m: Mixer, btn: Button, dt: number): Cmd {
  const cmd = idleCmd()
  m.seqT += dt
  const next = (seq: Mixer['seq']) => {
    m.seq = seq
    m.seqT = 0
  }
  switch (m.seq) {
    case 'rest':
      cmd.a = lever(0 - m.chute, RATES.chute, dt)
      if (!btn.press) break
      if (m.concrete < 0.05) {
        uhuh(s, m)
        break
      }
      for (const f of s.forms) {
        const lot = LOTS[f.lot]
        if (!f.shown || f.hard || f.fill >= 1 || Math.hypot(lot.x - m.x, lot.z - m.z) > 30) continue
        m.ownGoal = { x: lot.x, z: lot.z, within: 4.8, reverse: true, thenPress: false, yaw: null, pace: 1.5 }
        m.goal = m.ownGoal
        next('turn')
        return cmd
      }
      next('pour')
      break
    case 'turn':
      if (m.goal === null || m.seqT > 10) next('pour')
      else if (m.goal !== m.ownGoal) next('rest')
      break
    case 'pour':
      cmd.a = 1
      if ((m.concrete <= 1e-6 && m.seqT > 0.5) || m.seqT > 8) next('rest')
      break
  }
  return cmd
}

function forklift(s: Sim, m: Forklift, btn: Button, dt: number): Cmd {
  const cmd = idleCmd()
  m.seqT += dt
  const next = (seq: Forklift['seq']) => {
    m.seq = seq
    m.seqT = 0
  }
  const LOW = 0.08
  const HIGH = 0.45
  switch (m.seq) {
    case 'rest':
      cmd.a = lever((m.holding >= 0 ? HIGH : LOW) - m.lift, RATES.forks, dt)
      if (!btn.press) break
      if (m.holding >= 0) {
        next('lower')
        break
      }
      {
        let best: Thing | null = null
        let bestD = 5
        for (const t of s.things) {
          const d = Math.hypot(t.x - m.x, t.z - m.z)
          if (!t.gone && t.heldBy === null && d <= bestD) {
            best = t
            bestD = d
          }
        }
        if (best === null) {
          uhuh(s, m)
          break
        }
        m.aim = best.id
        // Stop 1.6 m short of the thing on the way to it, facing it, so the forks reach it from any side (backing off first if it is right beside).
        const to = Math.hypot(best.x - m.x, best.z - m.z)
        const dir = to < 0.3 ? { x: Math.sin(m.yaw), z: Math.cos(m.yaw) } : { x: (best.x - m.x) / to, z: (best.z - m.z) / to }
        const stop = { x: best.x - dir.x * 1.6, z: best.z - dir.z * 1.6 }
        m.ownGoal = { x: stop.x, z: stop.z, within: 0.8, reverse: false, thenPress: false, yaw: Math.atan2(dir.x, dir.z), pace: 1 }
        m.goal = m.ownGoal
        next('seek')
      }
      break
    case 'seek': {
      const t = m.aim >= 0 ? thingById(s, m.aim) : null
      if (t === null || t.gone || t.heldBy !== null || m.seqT > 12 || (m.goal !== null && m.goal !== m.ownGoal)) {
        if (m.goal === m.ownGoal) m.goal = null
        m.aim = -1
        next('rest')
        break
      }
      cmd.a = lever(LOW - m.lift, RATES.forks, dt)
      const fork = forkPoint(m)
      if (Math.hypot(fork.x - t.x, fork.z - t.z) < 1.2 && m.lift < 0.2) {
        cmd.tap = true
        m.goal = null
        m.aim = -1
        next('raise')
      }
      break
    }
    case 'raise':
      cmd.a = lever(HIGH - m.lift, RATES.forks, dt)
      if (m.lift >= HIGH - 0.02) next('rest')
      break
    case 'lower':
      cmd.a = lever(LOW - m.lift, RATES.forks, dt)
      if (m.lift <= LOW + 0.04) {
        cmd.tap = true
        next('rest')
      }
      break
  }
  return cmd
}

function dozer(m: Dozer, active: boolean, s: Sim, aims: Aims, dt: number): Cmd {
  const cmd = idleCmd()
  if (m.goal !== null && !m.goal.reverse) m.bladeUp = false
  const up = m.bladeUp || aims.bladeUp || (active && s.hands.action && !s.hands.blocked) || m.speed < -0.3
  cmd.a = lever((up ? 1 : 0) - m.blade, RATES.blade, dt)
  return cmd
}

function roller(btn: Button): Cmd {
  const cmd = idleCmd()
  cmd.tap = btn.press
  return cmd
}

function semi(s: Sim, m: Semi, btn: Button): Cmd {
  const cmd = idleCmd()
  if (!btn.press) return cmd
  const ring = PLANTS.saw.ring
  if (m.seq === 'rest' && m.logs > 0 && Math.hypot(m.x - ring.x, m.z - ring.z) < ring.r) cmd.tap = true
  else uhuh(s, m)
  return cmd
}

// ---------------------------------------------------------------------------------------
// The cranes.

/** Hook height when moving over: near the top, so it clears everything. */
const travelY = (m: Tower | Mobile) => (m.kind === 'tower' ? 14.5 : 10)
/** The hook may swing sideways once it is within this far of travel height, and a raise counts as done when it is within RAISED_WITHIN: the rest of the climb goes on while it moves. */
const CLEAR_BELOW = 3.5
const RAISED_WITHIN = 2
/** The share of the hook's full speed it goes down at: a load goes down slower than it comes up. */
const LOWER_SHARE = 0.6
/** A hook that is to go down starts down once it is this close (metres) to being over its point, and finishes the sideways move on the way. */
const OVER_ENOUGH = 1.2

/** How far from a point the truck crane stands to work it: well inside its reach, well outside its shortest. */
const STAND_OUT = 10

/** Where the truck crane at `base` drives to work the point (`x`, `z`) when it is out of reach: `STAND_OUT` from it on the side the crane is on, or the nearest turn round the point from there that is dry ground inside the town (a crane right beside the point has no side, and the river is no place to stand). */
function standFor(x: number, z: number, base: { x: number; z: number }): { x: number; z: number } {
  const away = Math.atan2(base.x - x, base.z - z)
  const spots = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => ({ x: x + Math.sin(away + (k * Math.PI) / 6) * STAND_OUT, z: z + Math.cos(away + (k * Math.PI) / 6) * STAND_OUT }))
  return spots.find((p) => Math.abs(p.x) <= STAND_EDGE && Math.abs(p.z) <= STAND_EDGE && (p.z > RIVER.z1 + 1 || p.z < RIVER.z0 - 1)) ?? spots[0]
}

/** The truck crane stands no further out than this from the town's middle, in metres. */
const STAND_EDGE = 40

function crane(s: Sim, m: Tower | Mobile, active: boolean, btn: Button, aims: Aims, dt: number): Cmd {
  const cmd = idleCmd()
  m.seqT += dt
  const next = (seq: Tower['seq'] | Mobile['seq']) => {
    m.seq = seq as Mobile['seq']
    m.seqT = 0
  }
  const R = m.kind === 'tower' ? RATES.tower : RATES.mobile
  const range = m.kind === 'tower' ? TROLLEY_RANGE : REACH_RANGE
  const base = craneBase(m)
  const hook = hookPoint(m)
  const held = m.holding >= 0 ? thingById(s, m.holding) : null
  const dist = (x: number, z: number) => Math.hypot(x - base.x, z - base.z)
  const inReach = (x: number, z: number) => dist(x, z) >= range[0] - 0.5 && dist(x, z) <= range[1] + 0.5
  /** What is left of the sideways move to the aim point: the jib's turn, the trolley's or boom's run, and how far out the point is. */
  const sideways = () => {
    const out = clamp(dist(m.aimX, m.aimZ), range[0], range[1])
    return { jib: turnTo(m.jib, Math.atan2(m.aimX - base.x, m.aimZ - base.z)), out: out - (m.kind === 'tower' ? m.trolley : m.reach), dist: out }
  }

  // A tap counts while the hook is still rising after a pick or a drop: it goes over the point as soon as the rise is done.
  if (active && s.hands.point !== null && (m.seq === 'rest' || m.seq === 'raise' || (m.seq === 'over' && m.then === 'stay'))) {
    m.aimX = s.hands.point.x
    m.aimZ = s.hands.point.z
    m.tapped = true
    m.then = 'stay'
    if (m.seq === 'rest') next('over')
  }

  if (m.seq === 'rest' && btn.press) {
    if (held === null) {
      // The nearest piece within a step's reach of the hook: the kind the lift step wants next if one lies there, so the piece a child lifts is the one the house or bridge needs; else the one that is the step's own, in reach; else any.
      const nearest = (wanted: ThingKind | null) => {
        let found: Thing | null = null
        let foundD = 5
        for (const t of s.things) {
          const d = Math.hypot(t.x - hook.x, t.z - hook.z)
          if (!t.gone && t.heldBy === null && d <= foundD && (wanted === null || t.kind === wanted)) {
            found = t
            foundD = d
          }
        }
        return found
      }
      const wants = aims.spot === null ? null : aims.spot.wants
      let best = wants === null ? null : nearest(wants)
      if (best === null && aims.thing !== null && !aims.thing.gone && aims.thing.heldBy === null && (m.kind === 'mobile' || inReach(aims.thing.x, aims.thing.z))) best = aims.thing
      best ??= nearest(null)
      if (best === null) uhuh(s, m)
      else {
        m.aimX = best.x
        m.aimZ = best.z
        m.act = 'grab'
        m.target = best.id
      }
    } else {
      if (!m.tapped) {
        const spot = aims.spot !== null && (m.kind === 'mobile' || inReach(aims.spot.x, aims.spot.z)) ? aims.spot : null
        m.aimX = spot !== null ? spot.x : hook.x
        m.aimZ = spot !== null ? spot.z : hook.z
      }
      m.act = 'drop'
    }
    if (held !== null || m.target >= 0) {
      m.then = 'lower'
      m.target = held !== null ? -1 : m.target
      if (m.kind === 'mobile' && !inReach(m.aimX, m.aimZ)) {
        const stand = standFor(m.aimX, m.aimZ, base)
        m.ownGoal = { x: stand.x, z: stand.z, within: 1.5, reverse: false, thenPress: false, yaw: null, pace: 1.5 }
        m.goal = m.ownGoal
        next('drive')
      } else next('over')
    }
  }

  switch (m.seq) {
    case 'drive':
      if (m.goal === null) next('legs')
      else if (m.goal !== m.ownGoal) {
        m.then = 'stay'
        next('rest')
      }
      break
    case 'legs':
      if (m.legs > 0.95) next('over')
      break
    case 'rest':
      cmd.c = lever(travelY(m) - m.hookY, R.hook, dt)
      break
    case 'over': {
      const up = travelY(m)
      const e = sideways()
      const moveOk = m.hookY > up - CLEAR_BELOW
      cmd.c = lever(up - m.hookY, R.hook, dt)
      if (moveOk) [cmd.a, cmd.b] = together([e.jib, e.out], [R.jib, R.reach], dt)
      const enough = m.then === 'lower' ? OVER_ENOUGH : 0.3
      if (moveOk && Math.abs(e.jib) * e.dist < enough && Math.abs(e.out) < enough) next(m.then === 'lower' ? 'lower' : 'rest')
      break
    }
    case 'lower': {
      const thing = m.act === 'grab' ? (m.target >= 0 ? thingById(s, m.target) : null) : held
      if (thing === null || (m.act === 'grab' && (thing.gone || thing.heldBy !== null))) {
        next('raise')
        break
      }
      const spot = aims.spot !== null && Math.hypot(aims.spot.x - hook.x, aims.spot.z - hook.z) <= PLACE_RADIUS ? aims.spot : null
      const target = m.act === 'grab' ? thing.y + THING_HEIGHT[thing.kind] + 0.25 : (spot !== null ? spot.y : groundY(s, hook.x, hook.z)) + THING_HEIGHT[thing.kind] + 0.3
      cmd.c = Math.max(-LOWER_SHARE, lever(target - m.hookY, R.hook, dt))
      const e = sideways()
      ;[cmd.a, cmd.b] = together([e.jib, e.out], [R.jib, R.reach], dt)
      const floor = groundY(s, hook.x, hook.z) + 0.3
      const settled = Math.abs(e.jib) * e.dist < 0.3 && Math.abs(e.out) < 0.3
      if (settled && (Math.abs(target - m.hookY) < 0.15 || (m.hookY <= floor + 0.01 && target < floor))) {
        cmd.tap = true
        m.tapped = false
        m.target = -1
        next('raise')
      }
      break
    }
    case 'raise':
      cmd.c = lever(travelY(m) - m.hookY, R.hook, dt)
      if (travelY(m) - m.hookY < RAISED_WITHIN) {
        m.then = 'stay'
        next(m.tapped ? 'over' : 'rest')
      }
      break
  }
  return cmd
}

// ---------------------------------------------------------------------------------------
// Driving by keys, and the whole frame.

/** Arrows or WASD in easy mode: head the way they point on the screen. */
function screenDrive(m: Machine, viewYaw: number, drive: number, steer: number): { drive: number; steer: number } {
  const spec = MACHINE_SPECS[m.kind]
  const want = turnTo(m.yaw, viewYaw + Math.atan2(steer, drive))
  const mag = Math.min(1, Math.hypot(drive, steer))
  if (spec.pivot > 0) return { drive: Math.abs(want) < 0.6 ? mag : 0, steer: clamp(want * 2, -1, 1) }
  if (Math.abs(want) < Math.PI / 2 || m.kind === 'semi') return { drive: mag, steer: clamp(want * 1.5, -1, 1) }
  return { drive: -mag, steer: clamp(turnTo(m.yaw + Math.PI, viewYaw + Math.atan2(steer, drive)) * 1.5, -1, 1) }
}

/** What one machine's hands command this frame in easy mode. `active` is the one the child is in: only it reads the button, the finger and the keys. */
export function easyCmd(s: Sim, m: Machine, active: boolean, btn: Button, aims: Aims, dt: number): Cmd {
  let b = active ? btn : NO_BUTTON
  if (m.goal !== null && m.goal.thenPress && arrived(m, m.goal)) {
    m.goal = null
    b = { down: true, press: true }
  }
  let cmd: Cmd
  switch (m.kind) {
    case 'digger':
      cmd = digger(s, m, b, aims, dt)
      break
    case 'dumper':
      cmd = dumper(m, b, dt)
      break
    case 'dozer':
      cmd = dozer(m, active, s, aims, dt)
      break
    case 'roller':
      cmd = roller(b)
      break
    case 'mixer':
      cmd = mixer(s, m, b, dt)
      break
    case 'forklift':
      cmd = forklift(s, m, b, dt)
      break
    case 'semi':
      cmd = semi(s, m, b)
      break
    case 'tower':
    case 'mobile':
      cmd = crane(s, m, active, b, aims, dt)
      break
  }
  const keys = s.hands.levers
  if (active && m.kind !== 'tower' && m.kind !== 'mobile' && (keys.drive !== 0 || keys.steer !== 0)) {
    m.goal = null
    if (m.kind === 'dozer') m.bladeUp = false
    const k = screenDrive(m, s.hands.viewYaw, keys.drive, keys.steer)
    cmd.drive = k.drive
    cmd.steer = k.steer
  }
  return cmd
}

/**
 * Every unlocked machine's frame: the active machine in pro mode takes the levers, every other
 * machine (and the active one in easy mode) runs its hands, so a machine left in mid-sequence
 * finishes it. Call between `beginWorld` and `stepWorld`.
 */
export function handsFrame(s: Sim, dt: number, guarded: boolean, aims: Aims, leverTap: boolean): void {
  const btn = buttonStep(s, dt, guarded)
  for (const k of MACHINE_KINDS) {
    const m = s.machines[k]
    if (!m.unlocked) continue
    const active = k === s.active
    stepMachine(s, m, active && s.mode === 'pro' ? proCmd(k, s.hands.levers, leverTap) : easyCmd(s, m, active, btn, aims, dt), dt)
  }
}

// ---------------------------------------------------------------------------------------
// What the HUD shows of the big button.

/** Between jobs, and while a card or a party is up, no step is asking for anything: the marker and the big button have nothing to show. */
export const nothingToDo = (s: Sim): boolean => s.job === null || s.card !== null || s.party !== null

/**
 * The big button's picture on a machine now, or null when the button does nothing there or nothing is asked. In easy
 * mode every machine's button works; in pro mode Space does something only for the roller, the
 * forklift, the cranes and the lorry, so the others show no button.
 */
export function actionFace(s: Sim, kind: MachineKind): ActionFace | null {
  if (nothingToDo(s)) return null
  const m = s.machines[kind]
  if (!m.unlocked) return 'none'
  const pro = s.mode === 'pro'
  switch (m.kind) {
    case 'digger':
      if (pro) return null
      return m.load.amount > 0.05 ? 'dump' : 'dig'
    case 'dumper':
      return pro ? null : 'tip'
    case 'dozer':
      if (pro) return null
      return m.blade < 0.5 ? 'bladeUp' : 'bladeDown'
    case 'roller':
      return 'stomp'
    case 'mixer':
      return pro ? null : 'pour'
    case 'forklift':
      return m.holding >= 0 ? 'drop' : 'pick'
    case 'tower':
    case 'mobile':
      return m.holding >= 0 ? 'unhook' : 'hook'
    case 'semi':
      return 'unload'
  }
}

/** The active machine's button would do something useful now: it is not in the middle of something, and has something to do. In pro, a machine whose Space does nothing is never ready. */
export function actionReady(s: Sim): boolean {
  const m = s.machines[s.active]
  if (actionFace(s, s.active) === null) return false
  switch (m.kind) {
    case 'digger':
      return m.seq === 'rest' || m.seq === 'hold'
    case 'dumper':
      return m.seq === 'rest' && m.load.amount > 0.05
    case 'dozer':
    case 'roller':
      return true
    case 'mixer':
      return m.seq === 'rest' && m.concrete >= 0.05
    case 'forklift':
      return m.seq === 'rest' && (m.holding >= 0 || s.things.some((t) => !t.gone && t.heldBy === null && Math.hypot(t.x - m.x, t.z - m.z) <= 5))
    case 'tower':
    case 'mobile':
      return m.seq === 'rest' && (m.holding >= 0 || s.things.some((t) => !t.gone && t.heldBy === null))
    case 'semi':
      return m.seq === 'rest' && m.logs > 0.02 && Math.hypot(m.x - PLANTS.saw.ring.x, m.z - PLANTS.saw.ring.z) < PLANTS.saw.ring.r
  }
}
