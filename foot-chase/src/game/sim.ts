/**
 * The foot chase, as plain numbers: no three.js in here, so vitest can run it for
 * minutes. The street runs along +X; both runners run along the path at z = 0, with the
 * houses behind it and the camera in front. The scene draws everything relative to the
 * police officer, which is what keeps the camera on the action.
 *
 * Two players. Both runners run right on their own; each player jumps, sprints or slows
 * their own runner. The robber grabs the money bag off every porch it passes and tries
 * to keep clear; the police tries to get within arm's reach. Fences, crates, yard dogs
 * and the cars on the road crossings are what trip a runner up, and the surprise boxes
 * are what turn a chase around.
 */

export type Role = 'police' | 'robber'
export const ROLES: readonly Role[] = ['police', 'robber']
export const other = (role: Role): Role => (role === 'police' ? 'robber' : 'police')

/**
 * What comes out of a surprise box. A box belongs to one role, wears its picture on the
 * side, and only that runner can open it; the other one bumps into it or jumps on it.
 */
export type Item = 'dog' | 'skates' | 'whistle' | 'magnet' | 'propeller' | 'banana' | 'springs' | 'bone'
export const ITEMS: Record<Role, readonly Item[]> = {
  police: ['dog', 'skates', 'whistle', 'magnet'],
  robber: ['propeller', 'banana', 'springs', 'bone'],
}

/** What tripped a runner: a fence or a crate, a car on the road, or a banana peel. */
export type CrashKind = 'bonk' | 'car' | 'banana'

export interface Runner {
  /** World x of the runner's centre. */
  x: number
  /** Height above the path: 0 on it, BOX_H standing on a crate, FLY_H under the propeller. */
  y: number
  vy: number
  onGround: boolean
  /** World units per second along +X. */
  speed: number
  /** What the speed settles at when nothing is wrong; the role decides it. */
  top: number
  jumpedAt: number
  landedAt: number
  /** Sim time of the last jump press; a press in the air is remembered for JUMP_BUFFER and fires on landing. */
  jumpPressedAt: number
  /** What the player holds: 1 forward (sprint), -1 back (slow down), 0 neither. The input layer sets it. */
  throttle: -1 | 0 | 1
  /** Seconds of sprint left in the tank, up to TURBO_MAX; it refills while the sprint is off. */
  turbo: number
  /** True while the sprint is actually pushing: forward held, tank not empty, in a chase. */
  turboOn: boolean
  /** Sim time of the last crash, or -1, and what it was: the shake, the dizzy stars and the slowdown read it. */
  crashedAt: number
  crashKind: CrashKind
  /** How hard the last crash was, the speed at impact over cruising speed: the shake and the dizzy spell scale with it. */
  crashPower: number
  /** The last surprise this runner got and when: the HUD shouts it for a moment. */
  got: Item | null
  gotAt: number
  /** Timed surprises, each the sim time it runs out at. The magnet is the police's, but it is the robber that is dragged. */
  flyingUntil: number
  springsUntil: number
  skatesUntil: number
  frozenUntil: number
  draggedUntil: number
  boneUntil: number
}

export interface House {
  id: number
  /** World x of the door; the money bag sits on the porch there. */
  x: number
  style: number
  money: boolean
  /** Sim time the robber took the money, or -1. */
  takenAt: number
}

export interface Fence {
  id: number
  x: number
  /** Sim time a runner smashed through it, or -1 while it stands. */
  hitAt: number
}

export interface Box {
  id: number
  x: number
  role: Role
  item: Item
  /** Sim time it was opened or knocked away, or -1 while it stands. */
  hitAt: number
  /** True when its owner opened it, false when the other runner knocked it away. */
  opened: boolean
}

/**
 * guard: a yard dog at its spot. charge: running at a runner. latched: hanging on to one,
 * slowing it. home: a yard dog trotting back to its spot, or the police dog running back
 * to the officer, where it is done.
 */
export type DogState = 'guard' | 'charge' | 'latched' | 'home'

export interface Dog {
  id: number
  kind: 'yard' | 'police'
  x: number
  /** Where a yard dog rests, and the yard it never leaves on its own. The police dog has no yard. */
  rest: number
  home0: number
  home1: number
  state: DogState
  on: Role | null
  latchedAt: number
  facing: -1 | 1
}

export interface RoadCar {
  id: number
  /** Which lane, which is also which way it drives: -1 comes toward the camera, 1 goes away. */
  lane: -1 | 1
  z: number
  vz: number
  style: number
}

export interface Road {
  id: number
  /** World x of the road's centre line; it runs along Z across the path. */
  x: number
  cars: RoadCar[]
  nextCarAt: number
}

export interface Banana {
  id: number
  x: number
  /** Sim time someone slipped on it, or -1. */
  slippedAt: number
}

/**
 * ready: nothing moves until the first press. chase: the game. caught: the police holds
 * the robber while the confetti flies and the loot spills; escape: the robber runs off
 * until the head start is back. escaped: the robber has pulled clear; regroup: the police
 * runs until the head start is back. Both loops end in another chase.
 */
export type Phase = 'ready' | 'chase' | 'caught' | 'escape' | 'escaped' | 'regroup'

export type EventKind =
  | 'start'
  | 'jump'
  | 'boing'
  | 'land'
  | 'crash'
  | 'honk'
  | 'coin'
  | 'pop'
  | 'knock'
  | 'bark'
  | 'yelp'
  | 'caught'
  | 'escaped'
  | 'escape'
  | 'regroup'
  | 'fly'
  | 'whistle'
export interface SimEvent {
  kind: EventKind
  who: Role
}

export interface Sim {
  time: number
  phase: Phase
  /** Sim time the current phase began. */
  phaseAt: number
  police: Runner
  robber: Runner
  houses: House[]
  fences: Fence[]
  boxes: Box[]
  dogs: Dog[]
  roads: Road[]
  bananas: Banana[]
  /** World x where the next lot of the street will be laid, well ahead of the runners. */
  builtTo: number
  yardsSinceRoad: number
  nextId: number
  /** The police's score: times the robber was grabbed. */
  catches: number
  /** The robber's score: money bags taken, less what spilled when caught. */
  coins: number
  /** How many coins spilled at the last catch, and when: the scene throws them. */
  droppedCoins: number
  droppedAt: number
  /** What happened this tick, for sounds and one-shot effects. The driver drains it every frame. */
  events: SimEvent[]
  random: () => number
}

export const RUNNER_HALF = 0.4
/** The police is a touch faster, so with nobody tripping the chase closes in about half a minute. */
export const POLICE_SPEED = 7.2
export const ROBBER_SPEED = 6.6
export const speedOf = (role: Role) => (role === 'police' ? POLICE_SPEED : ROBBER_SPEED)
/** The robber's lead at the start and after every catch or escape. */
export const START_GAP = 14
/** Arm's reach: closer than this is a catch. */
export const CATCH_GAP = 1.3
/** Caught in the air, the police can overshoot; the grip draws it back over about this long. */
export const LOCK_TAU = 0.12
/** This far ahead, the robber has got away, and gets a bonus for it. */
export const ESCAPE_GAP = 30
export const ESCAPE_BONUS = 5
/** The getaway after a catch, and the police closing back in after an escape. */
export const LOOP_SPEED = 13
export const CELEBRATE_FOR = 2.4
/**
 * The pedals. Forward is a sprint: this much faster, for TURBO_MAX seconds of tank,
 * refilled at TURBO_REFILL tanks a second while off; run dry, it waits for a whole bolt.
 * Back slows down to BRAKE_FACTOR of cruising, for waiting out a car.
 */
export const TURBO_FACTOR = 1.35
export const BRAKE_FACTOR = 0.4
export const TURBO_MAX = 2.5
export const TURBO_REFILL = 0.1
export const TURBO_BOLTS = 3
/** Where the speed drops to on a crash; it recovers toward the runner's top with RECOVER_TAU. Easing off is quicker. */
export const CRASH_SPEED = 2
export const RECOVER_TAU = 0.5
export const SLOW_TAU = 0.15
/** After a crash nothing else can trip the runner for this long: one stumble at a time. */
export const CRASH_IMMUNE = 1.0
/** How long a crash shakes the camera and how long the runner sees stars. */
export const SHAKE_FOR = 0.5
export const DIZZY_FOR = 1.4
/** A jump from the path is airborne this long and this high; gravity and take-off speed follow. */
export const JUMP_TIME = 0.95
export const JUMP_HEIGHT = 2.6
export const GRAVITY = (8 * JUMP_HEIGHT) / (JUMP_TIME * JUMP_TIME)
export const JUMP_V = (GRAVITY * JUMP_TIME) / 2
export const JUMP_BUFFER = 0.2
/** Fences stand this tall over this much of the path; a runner under that height bonks. */
export const FENCE_H = 1.0
export const FENCE_HALF = 0.2
/** Crates: this tall, this wide, and you can stand on them. */
export const BOX_H = 1.2
export const BOX_HALF = 0.6
/** Cars: too tall to hop over without a good jump; this wide across the path and this long along the road. */
export const CAR_H = 1.7
export const CAR_HALF_W = 0.9
export const CAR_HALF_L = 1.9
export const CAR_SPEED_MIN = 9
export const CAR_SPEED_MAX = 13
/** Cars come from far behind the houses and drive off toward the camera, or the other way. */
export const CAR_FAR = -38
export const CAR_NEAR = 16
export const CAR_EVERY_MIN = 2.2
export const CAR_EVERY_MAX = 4.2
/** A car knocks a runner back this far off the road. */
export const CAR_KNOCK = 1.2
export const ROAD_HALF_W = 2.9
export const LANE = 1.4
/** Dogs are low: a runner over this height sails over. */
export const DOG_H = 0.75
export const DOG_HALF = 0.5
/** A charging yard dog closes at this speed; walking home it takes its time. */
export const DOG_SPEED = 8.5
export const DOG_TROT = 5
/** A dog hangs on for this long, at this share of the runner's speed, unless a jump shakes it off first. */
export const DOG_HOLD = 3
export const DOG_SLOW = 0.6
/** Where a latched dog rides: this far behind the runner's centre, on its leg. */
export const DOG_BITE_AT = 0.5
/** The police dog is quick, hangs on tight (no shaking it off) and lets go on its own. */
export const POLICE_DOG_SPEED = 14
export const POLICE_DOG_HOLD = 2.5
export const POLICE_DOG_SLOW = 0.5
/** The propeller backpack: this high, this much faster, for this long. Nothing on the ground can touch a flyer. */
export const FLY_H = 3.4
export const FLY_FACTOR = 1.6
export const FLY_FOR = 3.5
/** Spring shoes: every take-off this much harder, for this long. */
export const SPRINGS_FACTOR = 1.6
export const SPRINGS_FOR = 8
/** Roller skates: this much faster without touching the sprint, for this long. */
export const SKATES_FACTOR = 1.45
export const SKATES_FOR = 5
/** The whistle: the robber stops dead for this long, if it is on the ground to hear it. */
export const FREEZE_FOR = 1.2
/** The magnet: the robber's coins pull it back, to this share of its speed, for this long. */
export const MAGNET_SLOW = 0.55
export const MAGNET_FOR = 3
/** The bone: dogs leave the robber alone for this long. */
export const BONE_FOR = 8
/** The robber can reach the money bag from this far, and only from this low: not from the air. */
export const MONEY_REACH = 1.2
export const MONEY_H = 2.0
/**
 * The street is laid one lot at a time. A yard is YARD_W long: the house with its porch
 * a third of the way in, a crate and a dog's spot further on, the fence at the end. Every
 * few yards a road crossing takes a lot instead, its centre in the middle of the lot.
 */
export const YARD_W = 24
export const DOOR_AT = 8.5
export const BOX_AT = 15
export const DOG_REST_AT = 17
export const BOX_CHANCE = 0.6
export const DOG_CHANCE = 0.5
export const ROAD_LOT_W = 14
export const ROAD_AFTER = 2
export const ROAD_CHANCE = 0.4
export const ROAD_FORCE_AFTER = 4
/** The first lot starts this far past the robber's start, so the chase opens on a clear path. */
export const FIRST_LOT_X = START_GAP + 8
/** Lots are laid this far ahead of the leading runner, past the right edge of the picture at any gap. */
export const SPAWN_AHEAD = 40
/** Whatever is this far behind the police is dropped. */
export const CULL_BEHIND = 20

const freshRunner = (x: number, top: number): Runner => ({
  x,
  y: 0,
  vy: 0,
  onGround: true,
  speed: 0,
  top,
  jumpedAt: -1,
  landedAt: -1,
  jumpPressedAt: -Infinity,
  throttle: 0,
  turbo: TURBO_MAX,
  turboOn: false,
  crashedAt: -1,
  crashKind: 'bonk',
  crashPower: 1,
  got: null,
  gotAt: -1,
  flyingUntil: -1,
  springsUntil: -1,
  skatesUntil: -1,
  frozenUntil: -1,
  draggedUntil: -1,
  boneUntil: -1,
})

/** Every scalar at its starting value. The runners and the lists are objects of their own, reset in place. */
function freshFields(random: () => number) {
  return {
    time: 0,
    phase: 'ready' as Phase,
    phaseAt: 0,
    builtTo: FIRST_LOT_X,
    yardsSinceRoad: 0,
    nextId: 1,
    catches: 0,
    coins: 0,
    droppedCoins: 0,
    droppedAt: -1,
    random,
  }
}

export function createSim(random: () => number): Sim {
  const s: Sim = {
    ...freshFields(random),
    police: freshRunner(0, POLICE_SPEED),
    robber: freshRunner(START_GAP, ROBBER_SPEED),
    houses: [],
    fences: [],
    boxes: [],
    dogs: [],
    roads: [],
    bananas: [],
    events: [],
  }
  build(s)
  return s
}

/** Back to the start, in place: the scene holds on to the sim, its runners and its lists, so none of them is replaced. */
export function resetSim(s: Sim, random: () => number) {
  Object.assign(s, freshFields(random))
  Object.assign(s.police, freshRunner(0, POLICE_SPEED))
  Object.assign(s.robber, freshRunner(START_GAP, ROBBER_SPEED))
  for (const list of [s.houses, s.fences, s.boxes, s.dogs, s.roads, s.bananas, s.events]) list.length = 0
  build(s)
}

/** The jump: a press of the key, a tap on that runner's half of the screen. In the ready phase it also starts the chase. */
export function pressJump(s: Sim, role: Role) {
  s[role].jumpPressedAt = s.time
}

/** The pedal, held: forward, back, or let go. */
export function setThrottle(s: Sim, role: Role, throttle: -1 | 0 | 1) {
  s[role].throttle = throttle
}

export const flying = (r: Runner, time: number) => time < r.flyingUntil
/** A dog hanging on to this runner, if any: the police dog first, since it holds tighter. */
export function dogOn(s: Sim, role: Role): Dog | null {
  let found: Dog | null = null
  for (const d of s.dogs) if (d.state === 'latched' && d.on === role && (found === null || d.kind === 'police')) found = d
  return found
}
/** Nothing trips a runner that is flying, still stumbling from the last crash, or in one of the loops around the chase. */
export const immune = (s: Sim, r: Runner) => s.phase !== 'chase' || flying(r, s.time) || s.time - r.crashedAt < CRASH_IMMUNE
export const overlapX = (a: number, b: number, half: number) => Math.abs(a - b) < half

/** Take off so the apex is over something exactly `lead` ahead: half the flight at this closing speed. */
export const jumpLead = (speed: number) => (speed * JUMP_TIME) / 2

/** World x of the next thing ahead of the runner that a jump clears, or Infinity: fences and crates still standing. */
export function nextHurdle(s: Sim, r: Runner) {
  let x = Infinity
  for (const f of s.fences) if (f.hitAt < 0 && f.x > r.x && f.x < x) x = f.x
  for (const b of s.boxes) if (b.hitAt < 0 && b.x > r.x && b.x < x) x = b.x
  return x
}

function launch(s: Sim, role: Role, r: Runner) {
  const springs = s.time < r.springsUntil
  r.vy = JUMP_V * (springs ? SPRINGS_FACTOR : 1)
  r.onGround = false
  r.jumpedAt = s.time
  s.events.push({ kind: springs ? 'boing' : 'jump', who: role })
  // The hop is what shakes a yard dog off. The police dog holds on.
  for (const d of s.dogs) if (d.state === 'latched' && d.on === role && d.kind === 'yard') release(s, d)
}

function crash(s: Sim, role: Role, r: Runner, kind: CrashKind) {
  if (immune(s, r)) return
  r.crashedAt = s.time
  r.crashKind = kind
  r.crashPower = Math.max(0.6, r.speed / r.top)
  r.speed = CRASH_SPEED
  r.vy = Math.max(r.vy, 4 * r.crashPower) // the stumble, bigger the faster you hit
  r.onGround = false
  s.events.push({ kind: 'crash', who: role })
}

function latch(s: Sim, d: Dog, role: Role) {
  d.state = 'latched'
  d.on = role
  d.latchedAt = s.time
  s.events.push({ kind: 'bark', who: role })
}

function release(s: Sim, d: Dog) {
  s.events.push({ kind: 'yelp', who: d.on! })
  d.state = 'home'
  d.on = null
}

/** True when the dog has hold of this runner: overlapping it, and the runner low enough to bite. */
function bites(s: Sim, d: Dog, role: Role) {
  const r = s[role]
  return overlapX(r.x, d.x, DOG_HALF + RUNNER_HALF) && r.y < DOG_H && !immune(s, r)
}

/** Lays the street ahead of the leading runner, lot by lot, until it runs past the picture. */
function build(s: Sim) {
  const lead = Math.max(s.police.x, s.robber.x)
  while (s.builtTo < lead + SPAWN_AHEAD) {
    const x0 = s.builtTo
    const road = s.yardsSinceRoad >= ROAD_AFTER && (s.yardsSinceRoad >= ROAD_FORCE_AFTER || s.random() < ROAD_CHANCE)
    if (road) {
      s.roads.push({ id: s.nextId++, x: x0 + ROAD_LOT_W / 2, cars: [], nextCarAt: s.time + s.random() * CAR_EVERY_MIN })
      s.builtTo = x0 + ROAD_LOT_W
      s.yardsSinceRoad = 0
      continue
    }
    s.houses.push({ id: s.nextId++, x: x0 + DOOR_AT, style: Math.floor(s.random() * 4), money: true, takenAt: -1 })
    if (s.random() < BOX_CHANCE) {
      const role: Role = s.random() < 0.5 ? 'police' : 'robber'
      const items = ITEMS[role]
      s.boxes.push({ id: s.nextId++, x: x0 + BOX_AT, role, item: items[Math.floor(s.random() * items.length)]!, hitAt: -1, opened: false })
    }
    if (s.random() < DOG_CHANCE) {
      s.dogs.push({ id: s.nextId++, kind: 'yard', x: x0 + DOG_REST_AT, rest: x0 + DOG_REST_AT, home0: x0 + 0.8, home1: x0 + YARD_W - 0.8, state: 'guard', on: null, latchedAt: -1, facing: -1 })
    }
    s.fences.push({ id: s.nextId++, x: x0 + YARD_W, hitAt: -1 })
    s.builtTo = x0 + YARD_W
    s.yardsSinceRoad += 1
  }
}

/** Drops from the list, in place, whatever `gone` says is done with. */
function cull<T>(list: T[], gone: (item: T) => boolean) {
  for (let i = list.length - 1; i >= 0; i--) if (gone(list[i]!)) list.splice(i, 1)
}

/** Opens a box for its owner: the surprise takes effect at once. */
function open(s: Sim, b: Box, role: Role, r: Runner) {
  const t = s.time
  b.hitAt = t
  b.opened = true
  r.got = b.item
  r.gotAt = t
  s.events.push({ kind: 'pop', who: role })
  switch (b.item) {
    case 'dog':
      s.dogs.push({ id: s.nextId++, kind: 'police', x: s.police.x + 1, rest: 0, home0: -Infinity, home1: Infinity, state: 'charge', on: null, latchedAt: -1, facing: 1 })
      break
    case 'skates':
      s.police.skatesUntil = t + SKATES_FOR
      break
    case 'whistle':
      s.robber.frozenUntil = t + FREEZE_FOR
      s.events.push({ kind: 'whistle', who: 'police' })
      break
    case 'magnet':
      s.robber.draggedUntil = t + MAGNET_FOR
      break
    case 'propeller':
      s.robber.flyingUntil = t + FLY_FOR
      s.events.push({ kind: 'fly', who: 'robber' })
      break
    case 'banana':
      s.bananas.push({ id: s.nextId++, x: s.robber.x - 1.5, slippedAt: -1 })
      break
    case 'springs':
      s.robber.springsUntil = t + SPRINGS_FOR
      break
    case 'bone':
      s.robber.boneUntil = t + BONE_FOR
      for (const d of s.dogs) {
        if (d.state === 'latched' && d.on === 'robber') release(s, d)
        else if (d.kind === 'police' && d.state === 'charge') d.state = 'home'
      }
      break
  }
}

/** Where the runner wants to be going, from the phase and everything it wears, carries or has hanging off it. */
function wanted(s: Sim, role: Role, r: Runner) {
  const t = s.time
  switch (s.phase) {
    case 'ready':
    case 'caught':
    case 'escaped':
      return 0
    case 'escape':
      return role === 'robber' ? LOOP_SPEED : 0
    case 'regroup':
      return role === 'police' ? LOOP_SPEED : r.top
  }
  if (flying(r, t)) return r.top * FLY_FACTOR
  if (t < r.frozenUntil && r.onGround) return 0
  let f = r.turboOn ? TURBO_FACTOR : r.throttle === -1 ? BRAKE_FACTOR : 1
  if (t < r.skatesUntil && r.throttle !== -1) f = Math.max(f, SKATES_FACTOR)
  if (t < r.draggedUntil) f *= MAGNET_SLOW
  const dog = dogOn(s, role)
  if (dog) f *= dog.kind === 'police' ? POLICE_DOG_SLOW : DOG_SLOW
  return r.top * f
}

/** The runner's height: the propeller lifts it, otherwise gravity has it, and a crate top or the path catches it. */
function fall(s: Sim, role: Role, r: Runner, dt: number) {
  const t = s.time
  if (flying(r, t)) {
    r.y += (FLY_H - r.y) * (1 - Math.exp(-dt / 0.25))
    r.vy = 0
    r.onGround = false
    return
  }
  // Only a runner that was already up at crate height lands on one; coming at it lower is the side of it.
  const wasAbove = r.y >= BOX_H - 0.02
  r.vy -= GRAVITY * dt
  r.y += r.vy * dt
  let ground = 0
  if (wasAbove) for (const b of s.boxes) if (b.hitAt < 0 && overlapX(r.x, b.x, BOX_HALF + RUNNER_HALF / 2)) ground = BOX_H
  if (r.y <= ground && r.vy <= 0) {
    r.y = ground
    r.vy = 0
    if (!r.onGround) {
      r.onGround = true
      r.landedAt = t
      s.events.push({ kind: 'land', who: role })
    }
  } else {
    r.onGround = false
  }
}

/** Everything on the path the runner can run into, once it has moved this tick. */
function collide(s: Sim, role: Role, r: Runner) {
  const t = s.time
  for (const b of s.boxes) {
    if (b.hitAt >= 0 || !overlapX(r.x, b.x, BOX_HALF + RUNNER_HALF)) continue
    if (b.role === role) {
      // Its owner opens it by touch: from the side or standing on it, not sailing over it.
      if (r.y < BOX_H + 0.5) open(s, b, role, r)
    } else if (r.y < BOX_H - 0.02) {
      // The side of someone else's crate: it tumbles away and the runner stumbles. Standing on top is fine.
      b.hitAt = t
      s.events.push({ kind: 'knock', who: role })
      crash(s, role, r, 'bonk')
    }
  }
  for (const f of s.fences) {
    if (f.hitAt >= 0 || r.y >= FENCE_H || !overlapX(r.x, f.x, FENCE_HALF + RUNNER_HALF)) continue
    f.hitAt = t
    crash(s, role, r, 'bonk')
  }
  for (const road of s.roads) {
    if (!overlapX(r.x, road.x, ROAD_HALF_W + CAR_HALF_W + RUNNER_HALF) || r.y >= CAR_H || immune(s, r)) continue
    for (const c of road.cars) {
      if (!overlapX(r.x, road.x + c.lane * LANE, CAR_HALF_W + RUNNER_HALF) || Math.abs(c.z) >= CAR_HALF_L + 0.3) continue
      s.events.push({ kind: 'honk', who: role })
      crash(s, role, r, 'car')
      r.x -= CAR_KNOCK
      break
    }
  }
  for (const p of s.bananas) {
    if (p.slippedAt >= 0 || r.y > 0.2 || !overlapX(r.x, p.x, 0.5 + RUNNER_HALF) || immune(s, r)) continue
    p.slippedAt = t
    crash(s, role, r, 'banana')
  }
  if (role === 'robber' && (s.phase === 'chase' || s.phase === 'regroup') && r.y < MONEY_H) {
    for (const h of s.houses) {
      if (!h.money || !overlapX(r.x, h.x, MONEY_REACH)) continue
      h.money = false
      h.takenAt = t
      s.coins += 1
      s.events.push({ kind: 'coin', who: role })
    }
  }
}

function tickDogs(s: Sim, dt: number) {
  const t = s.time
  for (const d of s.dogs) {
    if (d.state === 'latched') {
      if (t - d.latchedAt >= (d.kind === 'police' ? POLICE_DOG_HOLD : DOG_HOLD)) {
        release(s, d)
      } else {
        d.x = s[d.on!].x - DOG_BITE_AT
        d.facing = 1
        continue
      }
    }
    if (d.kind === 'police') {
      if (d.state === 'charge') {
        // Straight at the robber; under a robber in the air it runs right past and gives up.
        d.x += POLICE_DOG_SPEED * dt
        d.facing = 1
        if (d.x > s.robber.x + 1 || t < s.robber.boneUntil) d.state = 'home'
        else if (bites(s, d, 'robber')) latch(s, d, 'robber')
      } else {
        const dx = s.police.x + 1.2 - d.x
        d.facing = dx < 0 ? -1 : 1
        d.x += Math.sign(dx) * Math.min(Math.abs(dx), POLICE_DOG_SPEED * dt)
      }
      continue
    }
    // A yard dog charges the nearest runner in its yard that has not got past it yet, and
    // otherwise trots back to its spot. It never follows anyone out of the yard on its own,
    // so a runner that jumps it is clear of it.
    let target: Role | null = null
    for (const role of ROLES) {
      const r = s[role]
      if (r.x < d.home0 || r.x > d.home1 || r.x >= d.x - 0.3 || immune(s, r) || (role === 'robber' && t < r.boneUntil)) continue
      if (target === null || r.x > s[target].x) target = role
    }
    if (target) {
      d.state = 'charge'
      d.facing = -1
      d.x = Math.max(d.home0, d.x - DOG_SPEED * dt)
      if (bites(s, d, target)) latch(s, d, target)
    } else {
      const dx = d.rest - d.x
      d.state = Math.abs(dx) < 0.05 ? 'guard' : 'home'
      if (d.state === 'home') {
        d.facing = dx < 0 ? -1 : 1
        d.x += Math.sign(dx) * Math.min(Math.abs(dx), DOG_TROT * dt)
      }
    }
  }
  // The police dog is done once it is back at the officer's side; a yard dog is dropped with its yard.
  cull(s.dogs, (d) => (d.kind === 'police' ? d.state === 'home' && Math.abs(s.police.x + 1.2 - d.x) < 0.2 : d.state !== 'latched' && d.x < s.police.x - CULL_BEHIND))
}

function tickRoads(s: Sim, dt: number) {
  const t = s.time
  const lead = Math.max(s.police.x, s.robber.x)
  for (const road of s.roads) {
    for (const c of road.cars) c.z += c.vz * dt
    cull(road.cars, (c) => c.z < CAR_FAR - 2 || c.z > CAR_NEAR + 2)
    // Traffic only where it can be seen: a road far ahead waits, one behind is done.
    if (road.x < s.police.x - 10 || road.x > lead + SPAWN_AHEAD || t < road.nextCarAt) continue
    const lane: -1 | 1 = s.random() < 0.5 ? -1 : 1
    const speed = CAR_SPEED_MIN + s.random() * (CAR_SPEED_MAX - CAR_SPEED_MIN)
    road.cars.push({ id: s.nextId++, lane, z: lane < 0 ? CAR_FAR : CAR_NEAR, vz: -lane * speed, style: Math.floor(s.random() * 4) })
    road.nextCarAt = t + CAR_EVERY_MIN + s.random() * (CAR_EVERY_MAX - CAR_EVERY_MIN)
  }
}

/** Ends a chase in a celebration: the phase, the score, the loot spilling on a catch, every dog letting go. */
function celebrate(s: Sim, phase: 'caught' | 'escaped') {
  s.phase = phase
  s.phaseAt = s.time
  if (phase === 'caught') {
    s.catches += 1
    s.droppedCoins = Math.floor(s.coins / 2)
    s.droppedAt = s.time
    s.coins -= s.droppedCoins
  } else {
    s.coins += ESCAPE_BONUS
  }
  for (const d of s.dogs) if (d.state === 'latched') release(s, d)
  s.events.push({ kind: phase, who: phase === 'caught' ? 'police' : 'robber' })
}

export function tick(s: Sim, dt: number) {
  s.time += dt
  const t = s.time

  if (s.phase === 'ready') {
    if (!ROLES.some((role) => t - s[role].jumpPressedAt <= JUMP_BUFFER)) return
    s.phase = 'chase'
    s.phaseAt = t
    s.events.push({ kind: 'start', who: t - s.police.jumpPressedAt <= JUMP_BUFFER ? 'police' : 'robber' })
  }

  const gapBefore = s.robber.x - s.police.x
  if (s.phase === 'caught' && t - s.phaseAt >= CELEBRATE_FOR) {
    s.phase = 'escape'
    s.phaseAt = t
    s.events.push({ kind: 'escape', who: 'robber' })
  } else if (s.phase === 'escaped' && t - s.phaseAt >= CELEBRATE_FOR) {
    s.phase = 'regroup'
    s.phaseAt = t
    s.events.push({ kind: 'regroup', who: 'police' })
  } else if ((s.phase === 'escape' && gapBefore >= START_GAP) || (s.phase === 'regroup' && gapBefore <= START_GAP)) {
    s.phase = 'chase'
    s.phaseAt = t
  }

  for (const role of ROLES) {
    const r = s[role]
    // The sprint only counts in a chase and on foot; the loops around it run themselves. The
    // tank drains while the sprint pushes and fills back up while it does not.
    const enough = r.turboOn ? r.turbo > 0 : r.turbo >= TURBO_MAX / TURBO_BOLTS
    r.turboOn = s.phase === 'chase' && r.throttle === 1 && enough && !flying(r, t)
    r.turbo = r.turboOn ? Math.max(0, r.turbo - dt) : Math.min(TURBO_MAX, r.turbo + TURBO_REFILL * TURBO_MAX * dt)
    // The runner settles toward its speed: quick to slow, slower to get going again, which is the crash wearing off.
    const want = wanted(s, role, r)
    r.speed += (want - r.speed) * (1 - Math.exp(-dt / (want < r.speed ? SLOW_TAU : RECOVER_TAU)))
    // Jumps decide before the move, so a runner takes off from where it stood this tick. In a
    // chase the player's press does it; in the loops the runner hops whatever is in its way.
    if (s.phase === 'chase') {
      const pressed = t - r.jumpPressedAt <= JUMP_BUFFER
      if (pressed && r.onGround && !flying(r, t) && !(t < r.frozenUntil)) {
        r.jumpPressedAt = -Infinity
        launch(s, role, r)
      }
    } else if (r.onGround && r.speed > 1 && nextHurdle(s, r) - r.x <= jumpLead(r.speed)) {
      launch(s, role, r)
    }
    r.x += r.speed * dt
  }
  // The grip, once the police is down: drawn to the robber's back rather than snapped.
  if (s.phase === 'caught' && s.police.onGround) s.police.x += (s.robber.x - CATCH_GAP - s.police.x) * Math.min(1, dt / LOCK_TAU)

  build(s)
  tickRoads(s, dt)
  tickDogs(s, dt)
  for (const role of ROLES) {
    fall(s, role, s[role], dt)
    collide(s, role, s[role])
  }

  const behind = s.police.x - CULL_BEHIND
  cull(s.houses, (h) => h.x < behind)
  cull(s.fences, (f) => f.x < behind)
  cull(s.boxes, (b) => b.x < behind)
  cull(s.roads, (r) => r.x < behind - ROAD_HALF_W)
  cull(s.bananas, (p) => p.x < behind)

  if (s.phase === 'chase') {
    const gap = s.robber.x - s.police.x
    if (gap <= CATCH_GAP) celebrate(s, 'caught')
    else if (gap >= ESCAPE_GAP) celebrate(s, 'escaped')
  }
}
