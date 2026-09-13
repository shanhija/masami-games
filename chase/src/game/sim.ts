/**
 * The chase, as plain numbers: no three.js in here, so vitest can run it for minutes.
 * The road runs along +X in world units; a car is about CAR_LEN long. The scene renders
 * everything relative to the police car, which is what keeps the camera on the action.
 *
 * The player drives one car, the other drives itself and never misses a jump. As the
 * police you are the faster car and win by catching up; as the robber you are the
 * faster car and win by pulling away to ESCAPE_GAP. Either way a crash is what lets
 * the other car gain on you.
 */

import { night } from './daylight'

export type Role = 'police' | 'robber'
export const ROLES: readonly Role[] = ['police', 'robber']

/**
 * Worms come out with the dark: a few at dusk and dawn, nothing else at full night. They
 * crawl along the road toward the cars, and one you hit climbs in instead of bonking.
 */
export type ObstacleKind = 'rock' | 'log' | 'cake' | 'barrel' | 'worm'
export const DAY_KINDS: readonly ObstacleKind[] = ['rock', 'log', 'cake', 'barrel']

export interface Obstacle {
  id: number
  kind: ObstacleKind
  /** World x of its centre. */
  x: number
  /** World units per second along X: 0 for anything that stands still, negative for a worm crawling at the cars. Never changes. */
  vx: number
  /** Sim time the player's car knocked it, or -1 while it still stands. */
  hitAt: number
}

export interface Car {
  /** World x of the car's centre. */
  x: number
  /** Height above the road; 0 on it. */
  y: number
  vy: number
  /** World units per second along +X. */
  speed: number
  /** What the speed settles at when nothing is wrong; the role decides it. */
  top: number
  jumpedAt: number
  landedAt: number
}

/**
 * ready: nothing moves until the first press. chase: the game. caught: the police car
 * rides bumper to bumper with the robber while the stars fly; escape: the robber floors
 * it until the starting gap is back. escaped: the robber has pulled clear (only when the
 * player is the robber); regroup: the police floor it until the starting gap is back.
 * Both loops end in another chase.
 */
export type Phase = 'ready' | 'chase' | 'caught' | 'escape' | 'escaped' | 'regroup'

export type EventKind = 'start' | 'jump' | 'land' | 'crash' | 'caught' | 'escape' | 'escaped' | 'regroup' | 'wormIn' | 'wormOut'
export interface SimEvent {
  kind: EventKind
  car: Role
}

export interface Sim {
  role: Role
  time: number
  phase: Phase
  /** Sim time the current phase began. */
  phaseAt: number
  police: Car
  robber: Car
  obstacles: Obstacle[]
  /** World x where the next obstacle will stand, well ahead of the robber. */
  nextObstacleX: number
  nextId: number
  /** Sim time of the player's last crash, or -1: the shake, the dizzy stars and the slowdown all read it. */
  crashedAt: number
  /** Sim time a worm climbed into the player's car, or -1 while there is none aboard. It rides along, slowing the car, until a jump flings it out. */
  wormAt: number
  /** Sim time the last worm was flung out, or -1: the scene shows it flying. */
  wormOutAt: number
  /** Times the police caught the robber, and times the robber pulled clear. The role says which one is the score. */
  catches: number
  escapes: number
  /** Sim time of the last jump press; a press in the air is remembered for JUMP_BUFFER and fires on landing. */
  jumpPressedAt: number
  /** What the player holds: 1 forward (turbo), -1 back (brake), 0 neither. The input layer sets it. */
  throttle: -1 | 0 | 1
  /** Seconds of turbo left in the tank, up to TURBO_MAX; it refills while the turbo is off. */
  turbo: number
  /** True while the turbo is actually pushing: forward held, tank not empty, in a chase. The flames read it. */
  turboOn: boolean
  /** How hard the last crash was, the speed at impact over cruising speed: the shake and the dizzy spell scale with it. */
  crashPower: number
  /** What happened this tick, for sounds and one-shot effects. The driver drains it every frame. */
  events: SimEvent[]
  random: () => number
}

export const CAR_LEN = 3.6
/** The player's car is the faster one, whichever it is. The self-driving car never crashes, so it gets less. */
export const PLAYER_SPEED = 10
export const AI_ROBBER_SPEED = 8
export const AI_POLICE_SPEED = 9
/** A self-driving police car floors it while the robber is still slow from a crash: that is what a crash costs a robber. */
export const AI_POUNCE_SPEED = 12
export const POUNCE_BELOW = 0.85
/**
 * The throttle. Forward is a turbo burst: this much faster, for TURBO_MAX seconds of tank,
 * refilled at TURBO_REFILL tanks a second while off. Back is a brake down to BRAKE_FACTOR
 * of cruising. The other car hurries by AI_HURRY while it hears your turbo, so a burst
 * gains ground but does not decide the chase on its own.
 */
export const TURBO_FACTOR = 1.35
export const BRAKE_FACTOR = 0.4
export const TURBO_MAX = 2.5
export const TURBO_REFILL = 0.1
/** The tank shows as this many bolts; run dry, the turbo waits for a whole bolt before it pushes again. */
export const TURBO_BOLTS = 3
export const AI_HURRY = 1.25
/** At night both cars go this much faster, at full dark. */
export const NIGHT_BOOST = 1.25
/** A worm aboard holds the player's car to this much of its speed until a jump shakes it out, or until it gets bored and hops off. */
export const WORM_SLOW = 0.75
export const WORM_STAY = 4
/** The share of what comes up that is a worm, from how dark it is: some already at dusk and dawn, all of it at full night. */
export const wormShare = (time: number) => Math.min(1, 1.6 * night(time))
/** Worms crawl toward the cars at this speed, all at the same speed, so they keep their spacing. */
export const WORM_CRAWL = 2
/** Worms come closer together than the day's things do. */
export const WORM_SPAWN_MIN = 17
export const WORM_SPAWN_MAX = 27
/** The first worm after something that stands still comes this much further on: it crawls toward it for as long as it lives. */
export const WORM_HEADROOM = 10
/** Where the speed drops to on a crash; it recovers toward the car's top with RECOVER_TAU. Easing off is quicker: a turbo must not carry into the next chase. */
export const CRASH_SPEED = 2
export const RECOVER_TAU = 0.5
export const SLOW_TAU = 0.15
/**
 * The robber's lead at the start and after every escape or regroup. Chasing, that is about
 * eleven seconds of clean driving to close; fleeing, about eight seconds to pull clear to ESCAPE_GAP.
 */
export const START_GAP_POLICE = 26
export const START_GAP_ROBBER = 18
export const startGap = (role: Role) => (role === 'police' ? START_GAP_POLICE : START_GAP_ROBBER)
/** Further behind than that, a self-driving robber eases off (per unit of gap, down to a floor) so it never leaves the picture. */
export const RUBBER_BAND = 0.25
export const ROBBER_MIN_SPEED = 5.5
/** Bumper to bumper: closer than this is a catch. */
export const CATCH_GAP = CAR_LEN + 0.2
/** Caught in the air, the police can overshoot the bumper a little; the lock draws it back over about this long. */
export const LOCK_TAU = 0.12
/** This far ahead, a player robber has got away. */
export const ESCAPE_GAP = 26
/** The getaway after a catch, and the police closing back in after an escape. */
export const TURBO_SPEED = 18
export const CELEBRATE_FOR = 2.4
/** A jump from flat road is airborne this long and this high; gravity and take-off speed follow. */
export const JUMP_TIME = 1.0
export const JUMP_HEIGHT = 3.2
export const GRAVITY = (8 * JUMP_HEIGHT) / (JUMP_TIME * JUMP_TIME)
export const JUMP_V = (GRAVITY * JUMP_TIME) / 2
export const JUMP_BUFFER = 0.2
/** A car's belly has to be above this while it is over an obstacle. */
export const OBSTACLE_H = 1.0
export const OBSTACLE_HALF = 0.7
/** The player's collision half-length: shorter than the body, so a near miss is a miss. */
export const HITBOX_HALF = 1.1
export const SPAWN_MIN = 24
export const SPAWN_MAX = 40
/** Obstacles appear this far ahead of the robber, past the right edge of the picture at any gap. */
export const SPAWN_AHEAD = 26
/** Knocked and passed obstacles are dropped this far behind the police car. */
export const CULL_BEHIND = 20
/** How long the crash shakes the camera and how long the driver sees stars. */
export const SHAKE_FOR = 0.5
export const DIZZY_FOR = 1.4

const freshCar = (x: number, top: number): Car => ({ x, y: 0, vy: 0, speed: top, top, jumpedAt: -1, landedAt: -1 })

/** Every scalar at its starting value. The cars and the lists are objects of their own, reset in place. */
function freshFields(random: () => number, role: Role) {
  return {
    role,
    time: 0,
    phase: 'ready' as Phase,
    phaseAt: 0,
    nextObstacleX: startGap(role) + SPAWN_AHEAD + 4,
    nextId: 1,
    crashedAt: -1,
    wormAt: -1,
    wormOutAt: -1,
    catches: 0,
    escapes: 0,
    jumpPressedAt: -Infinity,
    throttle: 0 as const,
    turbo: TURBO_MAX,
    turboOn: false,
    crashPower: 1,
    random,
  }
}
const policeTop = (role: Role) => (role === 'police' ? PLAYER_SPEED : AI_POLICE_SPEED)
const robberTop = (role: Role) => (role === 'robber' ? PLAYER_SPEED : AI_ROBBER_SPEED)

export function createSim(random: () => number, role: Role): Sim {
  return { ...freshFields(random, role), police: freshCar(0, policeTop(role)), robber: freshCar(startGap(role), robberTop(role)), obstacles: [], events: [] }
}

/** Back to the start, in place: the scene holds on to the sim, its cars and its lists, so none of them is replaced. */
export function resetSim(s: Sim, random: () => number, role: Role) {
  Object.assign(s, freshFields(random, role))
  Object.assign(s.police, freshCar(0, policeTop(role)))
  Object.assign(s.robber, freshCar(startGap(role), robberTop(role)))
  s.obstacles.length = 0
  s.events.length = 0
}

export const player = (s: Sim) => (s.role === 'police' ? s.police : s.robber)
export const other = (s: Sim): Role => (s.role === 'police' ? 'robber' : 'police')
/** The score the player is playing for. */
export const score = (s: Sim) => (s.role === 'police' ? s.catches : s.escapes)

/** The jump: a press of the key, a tap, a click. In the ready phase it also starts the chase. */
export function pressJump(s: Sim) {
  s.jumpPressedAt = s.time
}

/** The throttle, held: forward, back, or let go. */
export function setThrottle(s: Sim, throttle: -1 | 0 | 1) {
  s.throttle = throttle
}

/** Take off so the apex lands over an obstacle exactly `lead` ahead: half the flight at this closing speed. */
export const jumpLead = (speed: number) => (speed * JUMP_TIME) / 2
/** The lead for this car over this obstacle: what closes the gap is the car's speed plus the crawl coming the other way. */
export const jumpLeadFor = (car: Car, o: Obstacle) => jumpLead(car.speed - o.vx)

function wormOut(s: Sim) {
  s.wormAt = -1
  s.wormOutAt = s.time
  s.events.push({ kind: 'wormOut', car: s.role })
}

function launch(s: Sim, car: Car, who: Role) {
  car.vy = JUMP_V
  car.y = 1e-6 // off the ground from this tick on
  car.jumpedAt = s.time
  s.events.push({ kind: 'jump', car: who })
  // The hop is what shakes a worm out: any jump of the player's car, whoever asked for it.
  if (car === player(s) && s.wormAt >= 0) wormOut(s)
}

const grounded = (car: Car) => car.y <= 0

/** True when the car's hitbox overlaps the obstacle along the road, whatever the height. */
export function overlaps(car: Car, o: Obstacle) {
  return Math.abs(car.x - o.x) < OBSTACLE_HALF + HITBOX_HALF
}

/** The nearest obstacle still on the road ahead of the car's centre, or null. Obstacles are kept in x order: nothing ever overtakes anything. */
export function nextObstacle(s: Sim, car: Car): Obstacle | null {
  for (const o of s.obstacles) if (o.hitAt < 0 && o.x > car.x) return o
  return null
}

/** Jump when grounded and the next obstacle is within the lead: how the self-driving car, and the player's car outside the chase, drive. */
function autoJump(s: Sim, car: Car, who: Role) {
  if (!grounded(car)) return
  const o = nextObstacle(s, car)
  if (o && o.x - car.x <= jumpLeadFor(car, o)) launch(s, car, who)
}

function fly(s: Sim, car: Car, who: Role, dt: number) {
  if (grounded(car)) return
  car.vy -= GRAVITY * dt
  car.y += car.vy * dt
  if (car.y <= 0) {
    car.y = 0
    car.vy = 0
    car.landedAt = s.time
    s.events.push({ kind: 'land', car: who })
  }
}

/** Ends a chase in a celebration: the phase, the score, and no obstacle until the loop is back in a chase. */
function celebrate(s: Sim, phase: 'caught' | 'escaped') {
  s.phase = phase
  s.phaseAt = s.time
  if (phase === 'caught') s.catches += 1
  else s.escapes += 1
  // No obstacle lands in the middle of the celebration: the next one waits past the turbo run,
  // and not by a fixed distance, or every chase after the first would play out the same.
  s.nextObstacleX = Math.max(s.nextObstacleX, s.robber.x + SPAWN_AHEAD + TURBO_SPEED * 2 + s.random() * SPAWN_MIN)
  s.events.push({ kind: phase, car: phase === 'caught' ? 'police' : 'robber' })
}

export function tick(s: Sim, dt: number) {
  s.time += dt
  let pressed = s.time - s.jumpPressedAt <= JUMP_BUFFER
  const me = player(s)
  const ai = s.role === 'police' ? s.robber : s.police

  if (s.phase === 'ready') {
    if (!pressed) return
    s.phase = 'chase'
    s.phaseAt = s.time
    s.jumpPressedAt = -Infinity
    pressed = false
    s.events.push({ kind: 'start', car: s.role })
    launch(s, me, s.role)
  }

  if (s.wormAt >= 0 && s.time - s.wormAt >= WORM_STAY) wormOut(s)

  const gapBefore = s.robber.x - s.police.x
  if (s.phase === 'caught' && s.time - s.phaseAt >= CELEBRATE_FOR) {
    s.phase = 'escape'
    s.phaseAt = s.time
    s.events.push({ kind: 'escape', car: 'robber' })
  } else if (s.phase === 'escaped' && s.time - s.phaseAt >= CELEBRATE_FOR) {
    s.phase = 'regroup'
    s.phaseAt = s.time
    s.events.push({ kind: 'regroup', car: 'police' })
  } else if ((s.phase === 'escape' && gapBefore >= startGap(s.role)) || (s.phase === 'regroup' && gapBefore <= startGap(s.role))) {
    s.phase = 'chase'
    s.phaseAt = s.time
  }

  // The throttle only counts in a chase; the loops around it drive themselves. The tank
  // drains while the turbo pushes and fills back up while it does not.
  const enough = s.turboOn ? s.turbo > 0 : s.turbo >= TURBO_MAX / TURBO_BOLTS
  s.turboOn = s.phase === 'chase' && s.throttle === 1 && enough
  s.turbo = s.turboOn ? Math.max(0, s.turbo - dt) : Math.min(TURBO_MAX, s.turbo + TURBO_REFILL * TURBO_MAX * dt)
  const pedal = s.turboOn ? TURBO_FACTOR : s.phase === 'chase' && s.throttle === -1 ? BRAKE_FACTOR : 1
  const hurry = s.turboOn ? AI_HURRY : 1

  // Where each car wants to be: its top, a turbo for the one closing the loop, and for a
  // self-driving robber the rubber band that keeps it in the picture. The whole road runs
  // faster at night, a worm aboard holds the player back, and the pedal does the rest.
  const boost = 1 + (NIGHT_BOOST - 1) * night(s.time)
  const pouncing = s.role === 'robber' && me.speed < POUNCE_BELOW * me.top * boost
  const robberWants = boost * (s.phase === 'escape' ? TURBO_SPEED : s.role === 'police' ? Math.max(ROBBER_MIN_SPEED, s.robber.top - RUBBER_BAND * Math.max(0, gapBefore - START_GAP_POLICE)) : s.robber.top)
  const policeWants = boost * (s.phase === 'regroup' ? TURBO_SPEED : pouncing ? AI_POUNCE_SPEED : s.police.top)
  // The self-driving car takes its speed on the ground and keeps it in the air: the take-off
  // lead planned the landing at that speed. The player's car settles toward its speed over
  // RECOVER_TAU, which is the crash slowdown wearing off.
  const aiWants = (ai === s.robber ? robberWants : policeWants) * hurry
  const meWants = (me === s.robber ? robberWants : policeWants) * (s.wormAt >= 0 ? WORM_SLOW : 1) * pedal
  if (grounded(ai)) ai.speed = aiWants
  // Caught, the pair rides bumper to bumper as one, but only while both are on the ground:
  // a jump keeps the speed it took off with, or it would not land where it planned. In the
  // air each car goes its own way for the moment and the lock takes hold again on landing.
  // Otherwise the player's car settles toward its speed, on road covered rather than
  // seconds, so a crash costs the same distance at night.
  const locked = s.phase === 'caught' && grounded(me) && grounded(ai)
  if (locked) me.speed = meWants
  else if (s.phase !== 'caught') me.speed += (meWants - me.speed) * (1 - Math.exp((-dt * boost) / (meWants < me.speed ? SLOW_TAU : RECOVER_TAU)))
  if (locked) s.police.speed = s.robber.speed

  // Jumps decide before the move, so a car takes off from where it stood this tick.
  autoJump(s, ai, other(s))
  if (s.phase === 'chase') {
    if (pressed && grounded(me)) {
      s.jumpPressedAt = -Infinity
      launch(s, me, s.role)
    }
  } else {
    autoJump(s, me, s.role)
  }

  s.police.x += s.police.speed * dt
  s.robber.x += s.robber.speed * dt
  for (const o of s.obstacles) o.x += o.vx * dt
  fly(s, s.police, 'police', dt)
  fly(s, s.robber, 'robber', dt)
  // The bumper lock, once both are down (a landing this tick counts): drawn in rather than snapped.
  if (s.phase === 'caught' && grounded(s.police) && grounded(s.robber)) {
    s.police.x += (s.robber.x - CATCH_GAP - s.police.x) * Math.min(1, dt / LOCK_TAU)
  }

  while (s.robber.x + SPAWN_AHEAD >= s.nextObstacleX) {
    const worm = s.random() < wormShare(s.time)
    const last = s.obstacles[s.obstacles.length - 1]
    const x = worm && last && last.vx === 0 ? s.nextObstacleX + WORM_HEADROOM : s.nextObstacleX
    const kind = worm ? 'worm' : DAY_KINDS[Math.floor(s.random() * DAY_KINDS.length)]!
    s.obstacles.push({ id: s.nextId++, kind, x, vx: worm ? -WORM_CRAWL : 0, hitAt: -1 })
    s.nextObstacleX = x + (worm ? WORM_SPAWN_MIN + s.random() * (WORM_SPAWN_MAX - WORM_SPAWN_MIN) : SPAWN_MIN + s.random() * (SPAWN_MAX - SPAWN_MIN))
  }
  while (s.obstacles.length > 0 && s.obstacles[0]!.x < s.police.x - CULL_BEHIND) s.obstacles.shift()

  // Only the player's car can hit anything: the other always jumps in time, by construction (the test checks).
  if (me.y < OBSTACLE_H) {
    for (const o of s.obstacles) {
      if (o.hitAt >= 0 || !overlaps(me, o)) continue
      o.hitAt = s.time
      if (o.kind === 'worm') {
        // No bonk: the worm climbs aboard and rides along until the next jump.
        s.wormAt = s.time
        s.events.push({ kind: 'wormIn', car: s.role })
        break
      }
      s.crashedAt = s.time
      s.crashPower = Math.max(0.6, me.speed / (me.top * boost))
      me.speed = CRASH_SPEED
      me.vy = Math.max(me.vy, 4 * s.crashPower) // the bump, bigger the faster you hit
      me.y = Math.max(me.y, 1e-6)
      s.events.push({ kind: 'crash', car: s.role })
      break
    }
  }

  if (s.phase === 'chase') {
    const gap = s.robber.x - s.police.x
    if (gap <= CATCH_GAP) {
      celebrate(s, 'caught')
    } else if (s.role === 'robber' && gap >= ESCAPE_GAP) {
      celebrate(s, 'escaped')
    }
  }
}
