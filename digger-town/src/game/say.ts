/**
 * `say`: one clause of the child's Finnish, already parsed into a `Spoken`, acted on in the sim.
 * The order is the plan's: stop, help, come, who, honk, to, move (only without a `to`), work
 * (only without a `to`). A spoken press skips the 1 s hold and the block after a hop; a part the
 * game cannot use gives `uhuh`, and every command it can use gives one `ack`.
 */

import { BUILD_HALF, PLACES } from './map'
import { DIG_MAX, DIG_MIN, DUMP_MAX, MACHINE_KINDS, REACH_RANGE, TROLLEY_RANGE } from './model'
import type { Machine, MachineKind, PlaceId, Sim, Spoken, Zone } from './model'
import { craneBase } from './machines'
import { callFriend, dozerTap, driveTo, guardedOf, hopTo, stepPointer } from './jobs'

/** How far the digger reaches a receiver that is told to be tipped into: the digger's own limit for picking one. */
const REACH_NOW = DUMP_MAX - 0.5

/** How close a truck stops to a ring's middle: its tail is then still inside the ring. */
const STOP_WITHIN = 1.5

/** How near a form the mixer must be for its own hands to back it up to it. */
const MIXER_NEAR = 25

const isMachineKind = (to: string): to is MachineKind => (MACHINE_KINDS as readonly string[]).includes(to)

/** The place a spoken word means now, or null when it means nothing in this job. A child who named a machine means that one: only without a name does the job's pointer hop to its own machine first. */
function placeOf(s: Sim, to: PlaceId, crane: boolean, named: boolean): { x: number; z: number; within: number } | null {
  const zoneAt = (z: Zone) => ({ x: z.x, z: z.z, within: Math.min(z.r * 0.6, 3) })
  const step = s.job === null ? null : s.job.job.steps[s.job.step]
  switch (to) {
    case 'road':
      // Rolling or clearing a road is done along it: the marker moves with the work.
      if (step === null || (step.kind !== 'roll' && step.kind !== 'clear')) return zoneAt(PLACES.road)
    // falls through
    case 'there': {
      const p = stepPointer(s)
      if (p === null) return null
      if (!named && p.machine !== s.active) hopTo(s, p.machine)
      return { x: p.x, z: p.z, within: STOP_WITHIN }
    }
    case 'hole':
      if (step === null) return null
      if (step.kind === 'push') return zoneAt(step.hole)
      if (step.kind === 'tip') return { x: step.zone.x, z: step.zone.z, within: STOP_WITHIN }
      // The digger stands at its park spot and digs the place from there.
      if (step.kind === 'digOut' || step.kind === 'scoop') return { x: step.park.x, z: step.park.z, within: STOP_WITHIN }
      return null
    case 'house': {
      const b = step !== null && step.kind === 'lift' ? s.builds[step.build] : s.builds.find((o) => o.kind === 'house' && o.shown && o.placed < o.spots.length)
      if (b === undefined) return null
      // A crane puts a piece on its spot in the building, not in front of it.
      if (crane && b.placed < b.spots.length) return { x: b.spots[b.placed].x, z: b.spots[b.placed].z, within: 3 }
      return { x: b.x, z: b.z + BUILD_HALF[b.kind][1] + 4, within: 3 }
    }
    default:
      return zoneAt(PLACES[to])
  }
}

export function say(s: Sim, spoken: Spoken, sameBreath: boolean): void {
  let m: Machine = s.machines[s.active]
  let accepted = false
  const uhuh = () => s.events.push({ kind: 'uhuh', machine: m.kind })
  /** The big button, once this frame. A second press in the same breath goes to the digger's queue: the dig cycle takes it when its bucket is up. */
  const press = () => {
    if (s.pressNext && m.kind === 'digger') m.pending = true
    s.pressNext = true
    accepted = true
  }
  const finish = () => {
    if (accepted) s.events.push({ kind: 'ack', machine: m.kind })
  }
  const screen = (yaw: number) => ({ up: { x: Math.sin(yaw), z: Math.cos(yaw) }, left: { x: Math.cos(yaw), z: -Math.sin(yaw) } })
  /** A dumper or mixer backing up to its hopper or form is already doing what a spoken press asks: asking again must not turn it round. */
  const turning = () => (m.kind === 'dumper' || m.kind === 'mixer') && m.seq === 'turn'
  const go = (x: number, z: number, within: number, reverse = false, thenPress = false) => {
    if (thenPress && turning()) {
      accepted = true
      return
    }
    driveTo(s, m, x, z, within, 1, false, null, reverse)
    if (m.goal !== null) m.goal.thenPress = thenPress
    accepted = true
  }
  /** The digger or forklift is told to take but stands away from the spot its step takes from: it goes there first and takes on arrival. */
  const parkFirst = () => {
    const p = stepPointer(s)
    if ((m.kind !== 'digger' && m.kind !== 'forklift') || p === null || p.machine !== m.kind || p.press) return false
    const d = Math.hypot(p.x - m.x, p.z - m.z)
    // A digger that reaches the marker's ground from where it stands digs there.
    if (d < 2.5 || (m.kind === 'digger' && d >= DIG_MIN - p.ring && d <= DIG_MAX + p.ring)) return false
    go(p.x, p.z, STOP_WITHIN, false, true)
    return true
  }
  const isCrane = () => m.kind === 'tower' || m.kind === 'mobile'
  /** A crane's hook goes to a point for one frame's tap. */
  const hookTo = (x: number, z: number) => {
    s.hands.point = { x, z }
    s.releasePoint = true
    accepted = true
  }
  const inReach = (x: number, z: number) => {
    if (m.kind !== 'tower' && m.kind !== 'mobile') return false
    const range = m.kind === 'tower' ? TROLLEY_RANGE : REACH_RANGE
    const d = Math.hypot(x - craneBase(m).x, z - craneBase(m).z)
    return d >= range[0] - 0.5 && d <= range[1] + 0.5
  }

  if (spoken.stop) {
    m.goal = null
    accepted = true
    finish()
    return
  }
  if (spoken.help) {
    s.events.push({ kind: 'hint' })
    s.idle = Math.max(s.idle, 12)
    accepted = true
    finish()
    return
  }
  if (spoken.come) {
    const p = stepPointer(s)
    const who = spoken.who ?? (p === null ? null : p.machine)
    if (who === null || !s.machines[who].unlocked) {
      uhuh()
      return
    }
    if (who === s.active && s.lastHop !== null && s.time - s.lastHop.at <= 4) hopTo(s, s.lastHop.from)
    m = s.machines[s.active]
    if (who === s.active || who === 'tower') {
      uhuh()
      return
    }
    callFriend(s, who, m)
    accepted = true
    finish()
    return
  }
  if (spoken.who !== null) {
    if (!s.machines[spoken.who].unlocked) {
      uhuh()
      return
    }
    hopTo(s, spoken.who)
    m = s.machines[s.active]
    accepted = true
  }
  if (spoken.honk) {
    m.honk = 0.8
    s.events.push({ kind: 'honk', machine: m.kind })
    accepted = true
  }
  // The machine being driven named as the place to go, with a job or a name in the clause, means nothing more than the rest of the clause.
  const toSelf = spoken.to !== null && isMachineKind(spoken.to) && s.machines[spoken.to] === m && (spoken.work !== null || spoken.who !== null)
  if (spoken.to !== null && !toSelf) {
    if (isMachineKind(spoken.to)) {
      const other = s.machines[spoken.to]
      if (!other.unlocked || other === m) uhuh()
      else if (spoken.work !== null) {
        if (spoken.work === 'take' && parkFirst()) {
          // The step's own friend brings the truck to the park spot.
        } else if (Math.hypot(other.x - m.x, other.z - m.z) <= REACH_NOW) {
          press()
          // "Kaiva hiekkaa kippiautoon": dig, and tip the bucket into it.
          if (m.kind === 'digger' && spoken.work === 'take') m.pending = true
        } else callFriend(s, other.kind, m)
        accepted = true
      } else go(other.x, other.z, 4.5)
    } else {
      const place = placeOf(s, spoken.to, isCrane(), spoken.who !== null)
      m = s.machines[s.active]
      if (place === null) uhuh()
      else if (isCrane()) {
        if (inReach(place.x, place.z)) {
          hookTo(place.x, place.z)
          if (spoken.work !== null) s.cranePress = true
        } else if (m.kind === 'mobile') go(place.x, place.z, 8)
        else uhuh()
      } else {
        // The dozer's tap on its hole or heap means the marker of the pass it is on.
        const at = m.kind === 'dozer' ? dozerTap(s, place.x, place.z) : place
        if (spoken.work !== null && turning()) accepted = true
        else if (spoken.work !== null && Math.hypot(at.x - m.x, at.z - m.z) < place.within) {
          // Already there: the job is done now, so a second clause in this breath can queue behind it.
          m.goal = null
          press()
        } else go(at.x, at.z, place.within, false, spoken.work !== null)
      }
    }
    finish()
    return
  }
  if (spoken.move !== null) {
    const { up, left } = screen(s.hands.viewYaw)
    const fx = Math.sin(m.yaw)
    const fz = Math.cos(m.yaw)
    const dir = spoken.move
    if ((dir === 'up' || dir === 'down') && !(m.kind === 'digger' || m.kind === 'roller' || m.kind === 'mixer' || m.kind === 'semi')) {
      const raise = dir === 'up'
      switch (m.kind) {
        case 'dumper':
          m.seq = raise ? 'up' : 'down'
          m.seqT = 0
          accepted = true
          break
        case 'dozer':
          m.bladeUp = raise
          accepted = true
          break
        case 'forklift':
          if (raise || m.holding >= 0) {
            m.seq = raise ? 'raise' : 'lower'
            m.seqT = 0
            accepted = true
          } else uhuh()
          break
        case 'tower':
        case 'mobile':
          if (raise && m.seq === 'rest') {
            m.seq = 'raise'
            m.seqT = 0
            accepted = true
          } else if (!raise && m.holding >= 0) press()
          else uhuh()
          break
      }
    } else if (isCrane() && (dir === 'left' || dir === 'right' || dir === 'forward' || dir === 'back') && m.kind === 'tower') {
      const base = { x: m.x + Math.sin(m.jib) * m.trolley, z: m.z + Math.cos(m.jib) * m.trolley }
      const v = dir === 'left' ? left : dir === 'right' ? { x: -left.x, z: -left.z } : dir === 'forward' ? up : { x: -up.x, z: -up.z }
      hookTo(base.x + v.x * 6, base.z + v.z * 6)
    } else {
      switch (dir) {
        case 'forward':
          go(m.x + fx * 12, m.z + fz * 12, 1.5)
          break
        case 'back':
          go(m.x - fx * 6, m.z - fz * 6, 1.5, true)
          break
        case 'left':
          go(m.x + left.x * 10, m.z + left.z * 10, 1.5)
          break
        case 'right':
          go(m.x - left.x * 10, m.z - left.z * 10, 1.5)
          break
        case 'around':
          go(m.x - fx * 8, m.z - fz * 8, 1.5)
          break
        case 'up':
          go(m.x + up.x * 10, m.z + up.z * 10, 1.5)
          break
        case 'down':
          go(m.x - up.x * 10, m.z - up.z * 10, 1.5)
          break
      }
    }
    finish()
    return
  }
  if (spoken.work !== null) {
    const work = spoken.work
    if (sameBreath && m.goal !== null) {
      m.goal.thenPress = true
      accepted = true
    } else if (guardedOf(s) && stepPointer(s)?.machine === m.kind && (work === 'give' || work === 'take')) {
      // The step needs what the machine carries and it is not in the ring: a load is not tipped on the lawn, it goes to the ring first.
      const p = stepPointer(s)
      if (p === null) throw new Error('a guarded step has a marker')
      // The mixer is the exception: within 25 m of its form its own hands back it up to the form, so it only has to be near.
      if (m.kind === 'mixer' && Math.hypot(p.x - m.x, p.z - m.z) <= MIXER_NEAR) press()
      else go(p.x, p.z, m.kind === 'mixer' ? MIXER_NEAR - 1 : STOP_WITHIN, false, true)
    } else {
      m.goal = null
      // Pushing or rolling with no place goes where the step's marker is (it moves along the work); with no such step, 12 m ahead.
      const ahead = () => {
        const p = stepPointer(s)
        if (p !== null && p.machine === m.kind) go(p.x, p.z, STOP_WITHIN)
        else go(m.x + Math.sin(m.yaw) * 12, m.z + Math.cos(m.yaw) * 12, 1.5)
      }
      switch (m.kind) {
        case 'digger': {
          if (work === 'take' && parkFirst()) break
          // A bucket being filled, or a dig already asked for in this breath, is dumped when it comes up.
          const filling = m.seq === 'reach' || m.seq === 'bite' || m.seq === 'lift' || (sameBreath && s.pressNext)
          if (work === 'give' && m.load.amount <= 0.05 && !filling) uhuh()
          else press()
          break
        }
        case 'dumper':
        case 'mixer':
          if (m.kind === 'mixer' && work === 'take') uhuh()
          else press()
          break
        case 'dozer':
          if (work === 'take' || work === 'give') {
            m.bladeUp = work === 'take'
            accepted = true
          } else {
            m.bladeUp = false
            ahead()
          }
          break
        case 'roller':
          if (work === 'push' || work === 'roll') ahead()
          press()
          break
        case 'forklift':
        case 'tower':
        case 'mobile':
          if (work === 'take' && parkFirst()) break
          if ((work === 'take' && m.holding >= 0) || (work === 'give' && m.holding < 0)) uhuh()
          else press()
          break
        case 'semi':
          if (work === 'give') press()
          else uhuh()
          break
      }
    }
  }
  finish()
}
