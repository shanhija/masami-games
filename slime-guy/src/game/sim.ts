/**
 * Slime Guy as plain numbers: no three.js in here, so vitest can run a course for minutes.
 * The slime runs forward by itself; the player steers, jumps and pulls the arms in. The
 * scene reads this every frame and never writes to it; one-shot looks come from the
 * timestamps (hitAt, takenAt, poppedAt...), and the events feed the sounds and the save.
 *
 * Nothing punishes: no lives, no timer, water brings the slime back to the last flag with
 * every ball it carries, a slime that presses nothing still reaches the arch (frames are
 * climbed, paddles pass through it after a hit, cages are slid round, and holes, gates,
 * fans, spinners and the tower all get easier after EASY_AFTER misses). The first time
 * each kind of obstacle comes, time slows and the game asks for the button that answers it.
 */

import type { ItemId } from './closet'
import { clamp, clamp01, ease, easeAngle, lerp, mod, smoothstep } from './math'
import {
  BALL_R,
  DROP_FOR,
  EASY_AFTER,
  FAN_DOWN,
  FAN_HARD,
  FAN_R,
  FAN_SOFT,
  FAN_UP,
  FISH_AT,
  FISH_RIDE,
  FRAME_DEPTH,
  FRAME_H,
  GATE_DEPTH,
  GATE_GAP,
  GATE_H,
  GIANT_GAP,
  GIFT_AT,
  HIDDEN_TOP,
  HIDE_FOR,
  MAX_SIZE,
  MEASURE_FOR,
  OPEN_AT,
  PAD_H,
  PAD_R,
  PADDLE_BOTTOM,
  PADDLE_IN,
  PADDLE_THICK,
  PADDLE_TOP,
  POLE_DZ,
  POLE_X,
  R0,
  SPIT_AT,
  TEACH_SCALE,
  TOP_DY,
  TOWER_HALF,
  TRACK_HALF,
  TRAMPOLINE_DZ,
  UNLOCK_AT,
  WATER_Y,
  animalFor,
  type Action,
  type Ball,
  type Circle,
  type Course,
  type FanSpec,
  type Ground,
  type Pad,
  type Phase,
  type Sim,
  type SimEvent,
  type SlideSpec,
  type SpinnerSpec,
  type Teachable,
} from './model'

/** What a run needs from the save: the kinds already taught, the babies already home on this island, and what the box holds. */
export interface RunOptions {
  learned: readonly Teachable[]
  babiesHome: readonly [boolean, boolean, boolean]
  gift: ItemId | null
}

// ------------------------------------------------------------------ the numbers

/** A frame advances at most this many real seconds; the sim steps in slices of at most STEP sim seconds. */
const MAX_DT = 0.1
const STEP = 1 / 120

/** Running: the forward speed (SLIDE_SPEED times that on ice), the sideways speed, and how fast each eases in. */
export const RUN_V = 5.5
export const SLIDE_SPEED = 1.6
export const STEER_V = 5
const RUN_TAU = 0.35
export const STEER_TAU = 0.1
/** Hard wind takes hold this fast. */
const WIND_TAU = 0.25

/**
 * Jumps: gravity and the height the bottom reaches, for the smallest slime and the
 * biggest, blended by size between. Small hops are quick and light; big ones slower but
 * longer and a bit higher. Every size clears a frame and a hole of radius 1.5 with a
 * take-off window of more than 0.3 s.
 */
const G_SMALL = 18
const G_BIG = 10
const H_SMALL = 1.7
const H_BIG = 2.2
/** A press of jump this long before landing still jumps. */
export const JUMP_EARLY = 0.15
/** From this size the slime is big: its landings BOING. */
export const BIG = 2
/** The big slime's extra bounce: its height, and how far round the landing (plus the radius) it takes every ball. It bounces after landings at least this fast. */
const BOUNCE_H = 0.35
const BOUNCE_REACH = 2.5
const BOUNCE_FROM_VY = 4

/** A hole holds the slime until its centre is this far inside the rim. */
export const HOLE_GRACE = 0.25
/** How deep it bobs before the fish comes, and how fast it stops moving once it is under the track's top. */
const BOB_Y = -0.6
const SINK_TAU = 0.12
/** The edge warning grows over this last stretch before the water. */
const EDGE_BAND = 0.6
/** The fish's spit flies the slime back for this long, on an arc this high. */
const SPIT_FOR = 1.2
const SPIT_H = 4.5

/** A paddle's hit: how far back the slime flies, for how long, how high it hops, how long paddles then pass through it, how many balls fall off. */
const KNOCK_BACK = 1.5
const KNOCK_FOR = 0.35
const KNOCK_HOP = 2.6
const GHOST_FOR = 1.5
const DROPS = 2
/** Knocked-off balls land this far ahead of the slime. */
const DROP_AHEAD = 2.6
/** A snow gate's bump. */
const BUMP_BACK = 1.1
const BUMP_FOR = 0.3
const BUMP_HOP = 2
/** Course balls float with their centre this high; knocked-off ones land there too. */
export const BALL_Y = 0.55

/** The fans: the soft breath's power, and hard wind's push on the smallest and on the biggest slime (the small one goes backward, the big one barely forward). */
const SOFT_POWER = 0.15
const WIND_SMALL = 8
const WIND_BIG = 5
/** An easy fan pushes with this share. */
const FAN_EASY = 0.45
/** How fast hard wind turns the slime round, rad/s. */
const SPIN_RATE = 9
/** The cage holds off this share of the slime's radius, and slides a slime that runs straight into it sideways this fast. */
export const CAGE_BODY = 0.85
const CAGE_SLIDE = 2.6
/** Fans are heard within this distance. */
const WIND_HEAR = 22
/** One turn of a fan's cycle. */
export const FAN_CYCLE = FAN_SOFT + FAN_UP + FAN_HARD + FAN_DOWN

/** Climbing over a frame takes this long. */
const CLIMB_FOR = 1
/** A marshmallow cushion throws the slime's bottom this high, whatever its size, so the balls up there suit every size. */
export const PAD_THROW_H = 4.6
/** A waiting baby's body. */
export const BABY_R = 0.35

/** At the finish: the gap between the slime and the pole, and the hop onto the trampoline (from how far before it, how long, how high). */
const POLE_GAP = 0.25
const HOP_FROM = 2.8
const HOP_FOR = 0.55
const HOP_H = 1.4

/** The tower: the trampoline's launch, the rise speed it eases to, the circles (radius, x0.75 when easy), how a 5 slides and a 100 goes round, the body share that counts against them. */
const LAUNCH_V = 9
export const RISE_V = 3
export const RISE_TAU = 0.45
export const CIRCLE_R = 1.1
const CIRCLE_EASY = 0.75
export const SLIDE_AMP = 2.2
const SLIDE_PERIOD = 3.2
export const RING_R = 1.1
const RING_PERIOD = 2.4
export const TOWER_BODY = 0.85
/** A bonk drops the slime back to the trampoline over FALL_FOR with a little pop first. */
const FALL_FOR = 1.2
const FALL_POP = 1.5
/** The giant circle pulls the slime to the middle from this far under it (once every circle is behind it); out of the hole it pops up this fast onto the top. */
const FUNNEL_DY = 3
const EMERGE_V = 4
/** The run is done this long after landing on the top, once the box has opened and the gift is on. */
const DONE_AT = 4

/**
 * Teaching: a jump lesson starts this long before a jump would clear (and a press that
 * early waits for it); a spinner lesson when a paddle would reach the slime within
 * SPINNER_TEACH; a gate lesson this far before it. Time eases to TEACH_SCALE and back
 * with these real-second constants.
 */
const TEACH_LEAD = 0.15
export const SPINNER_TEACH = 0.6
const GATE_TEACH = 2.5
const TEACH_IN_TAU = 0.12
const TEACH_OUT_TAU = 0.1
/** A jump held for a lesson is let go after this long. */
const HELD_JUMP_FOR = 0.4

// ------------------------------------------------------------------ shapes and predictions

const bigShare = (size: number) => clamp01((size - 1) / (MAX_SIZE - 1))
/** Gravity in the air for a slime of this size. */
export const gravityFor = (size: number) => lerp(G_SMALL, G_BIG, bigShare(size))
/** The take-off speed of a jump for this size. */
export const jumpSpeedFor = (size: number) => Math.sqrt(2 * gravityFor(size) * lerp(H_SMALL, H_BIG, bigShare(size)))
/** The size for so many balls out of the course's total: 1 with none, MAX_SIZE with all. */
export const sizeFor = (balls: number, total: number) => (total > 0 ? 1 + ((MAX_SIZE - 1) * balls) / total : 1)

/** Whether (x, z) is inside a slab of track or an ice slide, its edges included. */
export const inRect = (r: Ground | SlideSpec, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1

/** Whether (x, z) is over some slab of track, holes not counted. */
export function onSlab(course: Course, x: number, z: number): boolean {
  for (const g of course.ground) if (inRect(g, x, z)) return true
  return false
}

/** Whether (x, z) is more than `grace` inside the rim of one of the course's holes, lily pads not counted. */
export function inHole(course: Course, x: number, z: number, grace: number): boolean {
  for (const h of course.holes) if (Math.hypot(x - h.x, z - h.z) < h.r - grace) return true
  return false
}

/** Whether the track (not counting lily pads) holds a slime whose centre is at (x, z). */
export function groundAt(course: Course, x: number, z: number): boolean {
  return onSlab(course, x, z) && !inHole(course, x, z, HOLE_GRACE)
}

/** Whether a centre at (x, z) is held: the track, or a hole with its lily pad in. */
export function solidAt(s: Sim, x: number, z: number): boolean {
  if (groundAt(s.course, x, z)) return true
  for (const h of s.holes) if (h.raftAt >= 0 && Math.hypot(x - h.spec.x, z - h.spec.z) < h.spec.r) return true
  return false
}

/** The hole (index) a slime that sank at (x, z) went down, or -1 when it went off a side. */
function holeUnder(s: Sim, x: number, z: number) {
  for (let i = 0; i < s.holes.length; i++) {
    const h = s.holes[i].spec
    if (Math.hypot(x - h.x, z - h.z) < h.r + 0.3) return i
  }
  return -1
}

/** A fan's power at sim time t: SOFT_POWER, speeding up, 1, slowing down, round and round from its phase. */
export function fanPowerAt(spec: FanSpec, t: number): number {
  let k = mod(t + spec.phase, FAN_CYCLE)
  if (k < FAN_SOFT) return SOFT_POWER
  k -= FAN_SOFT
  if (k < FAN_UP) return lerp(SOFT_POWER, 1, smoothstep(0, 1, k / FAN_UP))
  k -= FAN_UP
  if (k < FAN_HARD) return 1
  return lerp(1, SOFT_POWER, smoothstep(0, 1, (k - FAN_HARD) / FAN_DOWN))
}

/** Whether a centre at (x, z) is in a fan's wind: its lane, from `reach` before the fan up to it. */
export const inWind = (f: FanSpec, x: number, z: number) => Math.abs(x - f.x) < f.width / 2 && z > f.z - f.reach && z < f.z

/** Whether a body (a ball of radius r centred at cx, cy, cz) touches a paddle of a spinner whose arm 0 points along `angle`. */
export function paddleTouches(spec: SpinnerSpec, angle: number, cx: number, cy: number, cz: number, r: number): boolean {
  if (cy + r < PADDLE_BOTTOM || cy - r > PADDLE_TOP) return false
  const dx = cx - spec.x
  const dz = cz - spec.z
  if (Math.hypot(dx, dz) > spec.reach + r + PADDLE_THICK) return false
  for (let a = 0; a < spec.arms; a++) {
    const th = angle + a * Math.PI
    const c = Math.cos(th)
    const sn = Math.sin(th)
    const u = dx * c + dz * sn
    const v = -dx * sn + dz * c
    const du = u - clamp(u, PADDLE_IN, spec.reach)
    const dv = v - clamp(v, -PADDLE_THICK / 2, PADDLE_THICK / 2)
    const dy = cy - clamp(cy, PADDLE_BOTTOM, PADDLE_TOP)
    if (du * du + dv * dv + dy * dy < r * r) return true
  }
  return false
}

/** A spinner's turning speed now, rad/s (half once easy). */
const spinRate = (s: Sim, i: number) => {
  const sp = s.spinners[i]
  return ((sp.spec.dir * 2 * Math.PI) / sp.spec.period) * (sp.easy ? 0.5 : 1)
}

/**
 * How soon a paddle would touch the slime standing up (arms out) if it kept running at
 * its speed (its sideways drift counts only for a moment: steering soon changes): sim
 * seconds, or -1 when not within `horizon`. Lessons and the bot both ask this.
 */
export function paddleHitIn(s: Sim, horizon: number): number {
  const sl = s.slime
  const y = sl.grounded ? 0 : Math.max(0, sl.y)
  for (let t = 0; t <= horizon; t += 0.02) {
    const cx = sl.x + sl.vx * Math.min(t, 0.2)
    const cz = sl.z + sl.vz * t
    for (let i = 0; i < s.spinners.length; i++) {
      const sp = s.spinners[i]
      if (Math.abs(sp.spec.z - cz) > sp.spec.reach + 2 * sl.r) continue
      if (paddleTouches(sp.spec, sp.angle + spinRate(s, i) * t, cx, y + sl.r, cz, sl.r)) return t
    }
  }
  return -1
}

/**
 * Where a jump must start to keep the slime's bottom above `height` while its centre
 * crosses z0..z1, running at vz with this size's jump: take-off z from lo to hi, or null
 * when no jump does it.
 */
export function jumpWindow(size: number, vz: number, z0: number, z1: number, height: number): { lo: number; hi: number } | null {
  const g = gravityFor(size)
  const vy = jumpSpeedFor(size)
  const disc = vy * vy - 2 * g * height
  if (disc <= 0 || vz <= 0) return null
  const ta = (vy - Math.sqrt(disc)) / g
  const tb = (vy + Math.sqrt(disc)) / g
  const lo = z1 - vz * tb
  const hi = z0 - vz * ta
  return lo <= hi ? { lo, hi } : null
}

/** A frame or hole ahead on the slime's line, and where a jump over it must start. */
export interface JumpAhead {
  kind: 'frame' | 'hole'
  index: number
  /** Its middle along z. */
  z: number
  lo: number
  hi: number
}

/**
 * The nearest frame or open hole on the slime's line that it has not passed, within
 * `ahead` units, with its take-off window at the slime's speed now (lo > hi when no jump
 * at this speed clears it); null when there is none.
 */
export function nextJump(s: Sim, ahead: number): JumpAhead | null {
  const sl = s.slime
  const vz = Math.max(sl.vz, 0.5)
  let best: JumpAhead | null = null
  let bestStart = Infinity
  const frames = s.course.frames
  for (let index = 0; index < frames.length; index++) {
    const f = frames[index]
    const z0 = f.z - FRAME_DEPTH / 2 - sl.r
    const z1 = f.z + FRAME_DEPTH / 2 + sl.r
    if (z1 <= sl.z || z0 - sl.z > ahead || z0 >= bestStart) continue
    if (sl.x + 0.7 * sl.r <= f.x0 || sl.x - 0.7 * sl.r >= f.x1) continue
    const w = jumpWindow(sl.size, vz, z0, z1, FRAME_H)
    best = { kind: 'frame', index, z: f.z, lo: w ? w.lo : 1, hi: w ? w.hi : 0 }
    bestStart = z0
  }
  for (let index = 0; index < s.holes.length; index++) {
    const hole = s.holes[index]
    if (hole.raftAt >= 0) continue
    const h = hole.spec
    const open = h.r - HOLE_GRACE
    const dx = sl.x - h.x
    if (Math.abs(dx) >= open) continue
    const half = Math.sqrt(open * open - dx * dx)
    const z0 = h.z - half
    const z1 = h.z + half
    if (z1 <= sl.z || z0 - sl.z > ahead || z0 >= bestStart) continue
    const w = jumpWindow(sl.size, vz, z0, z1, 0.02)
    best = { kind: 'hole', index, z: h.z, lo: w ? w.lo : 1, hi: w ? w.hi : 0 }
    bestStart = z0
  }
  return best
}

/** Where circle i of the tower is across the shaft when the tower's clock reads `clock`: 1 stays, 5 slides side to side, 100 goes round its ring; each starts at its own point. */
export function circleX(c: Circle, i: number, clock: number): number {
  if (c.n === 1) return c.baseX
  if (c.n === 5) return c.baseX + SLIDE_AMP * Math.sin(2 * Math.PI * (clock / SLIDE_PERIOD + i * 0.31))
  return c.baseX + RING_R * Math.cos(2 * Math.PI * (clock / RING_PERIOD + i * 0.31))
}

/** The same for its height above the tower floor. */
export function circleY(c: Circle, i: number, clock: number): number {
  if (c.n !== 100) return c.baseY
  return c.baseY + RING_R * Math.sin(2 * Math.PI * (clock / RING_PERIOD + i * 0.31))
}

/** How fast the circles' clock runs now. */
export const towerRate = (s: Sim) => (s.tower.easy ? 0.5 : 1)

// ------------------------------------------------------------------ a run

const emit = (s: Sim, e: SimEvent) => {
  s.events.push(e)
}

function setPhase(s: Sim, phase: Phase) {
  s.phase = phase
  s.phaseAt = s.time
}

/** A fresh run of a course: the slime small at the start (z = 0, x = 0) in the ready phase. */
export function createSim(course: Course, opts: RunOptions): Sim {
  const last = course.circles.length > 0 ? course.circles[course.circles.length - 1].y : 0
  const giantY = last + GIANT_GAP
  const s: Sim = {
    course,
    time: 0,
    phase: 'ready',
    phaseAt: 0,
    slime: {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      balls: 0,
      size: 1,
      r: R0,
      grounded: true,
      hidden: false,
      hiddenAt: -1,
      shownAt: -1,
      jumpedAt: -1,
      landedAt: -1,
      bounceAt: -1,
      hitAt: -1,
      ghostUntil: -1,
      bumpAt: -1,
      climbAt: -1,
      windAt: -1,
      spin: 0,
      sneezeAt: -1,
      burpAt: -1,
      splashAt: -1,
      splashX: 0,
      splashZ: 0,
      fishUntil: -1,
      edge: 0,
      sliding: false,
    },
    balls: course.balls.map((b, id) => ({ id, x: b.x, y: b.y, z: b.z, takenAt: -1, droppedAt: -1, fromX: b.x, fromY: b.y, fromZ: b.z })),
    babies: ([0, 1, 2] as const).map((index) => {
      const b = course.babies[index]
      const home = opts.babiesHome[index]
      return { index, x: b.x, y: b.y, z: b.z, takenAt: home ? 0 : -1, home }
    }),
    spinners: course.spinners.map((spec) => ({ spec, angle: mod(spec.phase * 2 * Math.PI, 2 * Math.PI), hits: 0, easy: false })),
    fans: course.fans.map((spec) => ({ spec, power: fanPowerAt(spec, 0), pushes: 0, easy: false })),
    holes: course.holes.map((spec) => ({ spec, falls: 0, raftAt: -1 })),
    gates: course.gates.map((spec) => ({ spec, bumps: 0, liftAt: -1 })),
    pads: course.pads.map((spec) => ({ spec, boingAt: -1 })),
    flags: course.flags.map((spec) => ({ spec, reachedAt: -1 })),
    rails: [],
    tower: {
      z: course.finishZ + TRAMPOLINE_DZ,
      circles: course.circles.map((c) => ({ n: c.n, baseX: c.x, baseY: c.y, x: c.x, y: c.y, r: CIRCLE_R, poppedAt: -1 })),
      giantY,
      topY: giantY + TOP_DY,
      hits: 0,
      easy: false,
      launchAt: -1,
      bonkAt: -1,
      funnelAt: -1,
    },
    finish: { keyAt: -1, measureAt: -1, animal: -1, topAt: -1, unlockAt: -1, openAt: -1, giftAt: -1 },
    checkpoint: -1,
    stars: 0,
    gift: opts.gift,
    learned: [...opts.learned],
    teach: null,
    timeScale: 1,
    input: { steer: 0, hide: false, jumpAt: -1 },
    nextId: course.balls.length,
    events: [],
    doing: {
      knockUntil: -1,
      hideUntil: -1,
      climbFrame: -1,
      climbFromZ: 0,
      climbFromY: 0,
      climbToZ: 0,
      hopFrame: -1,
      bouncing: false,
      heldJump: false,
      bumpSoundAt: -1,
      spunAt: -1,
      fanGust: course.fans.map(() => -1),
      fanIn: course.fans.map(() => false),
      fanUp: course.fans.map(() => -1),
      teachIndex: -1,
      fromX: 0,
      fromY: 0,
      fromZ: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      moveAt: -1,
      moveFor: 1,
      moveArc: 0,
      finishStep: 'pole',
      towerClock: 0,
      emerging: false,
    },
  }
  placeCircles(s)
  return s
}

/** Go! Ready to run; anything else is ignored. */
export function go(s: Sim): void {
  if (s.phase !== 'ready') return
  setPhase(s, 'run')
  emit(s, { kind: 'go' })
}

/** The steering held: -1 left, 0 none, +1 right. */
export function setSteer(s: Sim, dir: -1 | 0 | 1): void {
  s.input.steer = dir
  answerSteer(s)
}

/** Steering out of a fan's lane the way the lesson shows learns it. */
function answerSteer(s: Sim) {
  const t = s.teach
  if (t !== null && s.input.steer !== 0 && t.action === (s.input.steer < 0 ? 'left' : 'right')) learn(s)
}

/** A press of jump: jumps now if it can, or the moment it lands if that is very soon. */
export function pressJump(s: Sim): void {
  if (s.phase !== 'run') return
  const sl = s.slime
  const lesson = s.teach !== null && s.teach.action === 'jump'
  if (lesson) learn(s)
  if (sl.climbAt >= 0) {
    hopOver(s)
    return
  }
  if (sl.hidden) return
  s.input.jumpAt = s.time
  if (!sl.grounded) return
  if (lesson) {
    // A press the moment the lesson shows may come a breath before a jump clears: it waits for it.
    const j = nextJump(s, 14)
    if (j !== null && j.lo <= j.hi && sl.z < j.lo && sl.z + Math.max(sl.vz, 0.5) * HELD_JUMP_FOR >= j.lo) {
      s.doing.heldJump = true
      return
    }
  }
  jump(s)
}

/** The hide button down or up: down pulls the arms in at once for at least HIDE_FOR; up lets them out after that. */
export function setHide(s: Sim, held: boolean): void {
  s.input.hide = held
  if (!held || s.phase !== 'run') return
  const sl = s.slime
  s.doing.hideUntil = s.time + HIDE_FOR
  if (s.teach !== null && s.teach.action === 'hide') learn(s)
  if (sl.hidden) return
  sl.hidden = true
  sl.hiddenAt = s.time
  s.doing.heldJump = false
  emit(s, { kind: 'hide' })
}

/** Advances the run by `dt` real seconds (the sim scales it by timeScale and steps in small slices). */
export function tick(s: Sim, dt: number): void {
  if (!(dt >= 0)) throw new Error(`tick needs a time step of 0 or more, not ${dt}`)
  const real = Math.min(dt, MAX_DT)
  s.timeScale = s.teach !== null ? ease(s.timeScale, TEACH_SCALE, real, TEACH_IN_TAU) : ease(s.timeScale, 1, real, TEACH_OUT_TAU)
  if (s.teach === null && s.timeScale > 0.999) s.timeScale = 1
  const total = real * s.timeScale
  const n = Math.ceil(total / STEP - 1e-9)
  for (let i = 0; i < n; i++) step(s, total / n)
}

function step(s: Sim, h: number) {
  s.time += h
  for (let i = 0; i < s.spinners.length; i++) {
    const sp = s.spinners[i]
    sp.angle = mod(sp.angle + spinRate(s, i) * h, 2 * Math.PI)
  }
  updateFans(s)
  s.doing.towerClock += h * towerRate(s)
  placeCircles(s)
  switch (s.phase) {
    case 'ready':
    case 'done':
      break
    case 'run':
      stepRun(s, h)
      break
    case 'splash':
      stepSplash(s, h)
      break
    case 'finish':
      stepFinish(s, h)
      break
    case 'tower':
      stepTower(s, h)
      break
    case 'fall':
      stepFall(s, h)
      break
    case 'top':
      stepTop(s, h)
      break
  }
}

/** Each fan's power from its cycle; a fan near the slime announces each speeding up. */
function updateFans(s: Sim) {
  const sl = s.slime
  const d = s.doing
  for (let i = 0; i < s.fans.length; i++) {
    const fan = s.fans[i]
    const k = s.time + fan.spec.phase
    fan.power = fanPowerAt(fan.spec, s.time)
    const into = mod(k, FAN_CYCLE)
    if (into < FAN_SOFT || into >= FAN_SOFT + FAN_UP) continue
    const cycle = Math.floor(k / FAN_CYCLE)
    if (d.fanUp[i] === cycle) continue
    d.fanUp[i] = cycle
    if ((s.phase === 'run' || s.phase === 'ready') && Math.hypot(sl.x - fan.spec.x, sl.z - fan.spec.z) < WIND_HEAR) emit(s, { kind: 'windUp', fan: i })
  }
}

function placeCircles(s: Sim) {
  const clock = s.doing.towerClock
  const circles = s.tower.circles
  for (let i = 0; i < circles.length; i++) {
    circles[i].x = circleX(circles[i], i, clock)
    circles[i].y = circleY(circles[i], i, clock)
  }
}

// ------------------------------------------------------------------ the course

function stepRun(s: Sim, h: number) {
  const sl = s.slime
  if (sl.hidden && !s.input.hide && s.time >= s.doing.hideUntil && !overhead(s)) show(s)
  if (sl.climbAt >= 0) climb(s)
  else {
    move(s, h)
    if (s.phase !== 'run') return
    collide(s)
  }
  takeThings(s)
  passFlags(s)
  lessons(s)
  if (sl.z >= s.course.finishZ) startFinish(s)
  else sl.edge = edgeOf(s)
}

function show(s: Sim) {
  s.slime.hidden = false
  s.slime.shownAt = s.time
  emit(s, { kind: 'show' })
}

/** A gate overlaps the slime's place along the track and across it. */
function underGate(s: Sim, g: { z: number; x0: number; x1: number }) {
  const sl = s.slime
  return sl.z + sl.r > g.z - GATE_DEPTH / 2 && sl.z - sl.r < g.z + GATE_DEPTH / 2 && sl.x + 0.7 * sl.r > g.x0 && sl.x - 0.7 * sl.r < g.x1
}

/** Something over a flat slime that it would bump into standing up: it stays flat until clear. */
function overhead(s: Sim): boolean {
  const sl = s.slime
  for (const g of s.gates) if (g.liftAt < 0 && underGate(s, g.spec)) return true
  for (const sp of s.spinners) if (paddleTouches(sp.spec, sp.angle, sl.x, sl.y + sl.r, sl.z, sl.r)) return true
  return false
}

function onSlideAt(course: Course, x: number, z: number) {
  for (const g of course.slides) if (inRect(g, x, z)) return true
  return false
}

/** Gravity for one step, exact for a steady pull, so a jump follows the very curve jumpWindow predicts. */
function fall(s: Sim, h: number) {
  const sl = s.slime
  const g = gravityFor(sl.size)
  sl.y += sl.vy * h - 0.5 * g * h * h
  sl.vy -= g * h
}

/** Speeds (the run, the steering, the wind, a knock), the move, and the slime's height: falling, landing, cushions, water. */
function move(s: Sim, h: number) {
  const sl = s.slime
  const d = s.doing
  const t = s.time
  // Hard wind from every fan whose lane the slime is in pushes it back and turns it round.
  let push = 0
  let strongest = 0
  for (let i = 0; i < s.fans.length; i++) {
    const fan = s.fans[i]
    const f = fan.spec
    if (fan.power <= 0.5 || !inWind(f, sl.x, sl.z)) {
      d.fanIn[i] = false
      continue
    }
    const strength = smoothstep(0.5, 1, fan.power) * (fan.easy ? FAN_EASY : 1)
    strongest = Math.max(strongest, strength)
    push = Math.max(push, strength * lerp(WIND_SMALL, WIND_BIG, bigShare(sl.size)))
    sl.windAt = t
    if (d.fanIn[i]) continue
    d.fanIn[i] = true
    if (t - d.spunAt >= 1) {
      d.spunAt = t
      emit(s, { kind: 'spun' })
    }
    const gust = Math.floor((t + f.phase) / FAN_CYCLE)
    if (d.fanGust[i] === gust) continue
    d.fanGust[i] = gust
    sl.sneezeAt = t
    emit(s, { kind: 'sneeze' })
    fan.pushes += 1
    if (fan.pushes === EASY_AFTER) {
      fan.easy = true
      emit(s, { kind: 'easy', what: 'fan' })
    }
  }
  if (strongest > 0) {
    const a = sl.spin + SPIN_RATE * strongest * h
    sl.spin = Math.atan2(Math.sin(a), Math.cos(a))
  } else sl.spin = easeAngle(sl.spin, 0, h, 0.35)

  // A knock keeps its speed and takes the steering; when it is over the slime stands a moment.
  if (d.knockUntil >= 0 && t >= d.knockUntil) {
    d.knockUntil = -1
    sl.vz = 0
  }
  if (d.knockUntil < 0) {
    const onSlide = onSlideAt(s.course, sl.x, sl.z)
    if (onSlide && !sl.sliding) emit(s, { kind: 'slide' })
    sl.sliding = onSlide
    if (sl.grounded || push > 0) sl.vz = ease(sl.vz, RUN_V * (onSlide && sl.grounded ? SLIDE_SPEED : 1) - push, h, push > 0 ? WIND_TAU : RUN_TAU)
    sl.vx = ease(sl.vx, s.input.steer * STEER_V, h, STEER_TAU)
  }
  sl.x += sl.vx * h
  sl.z += sl.vz * h

  if (sl.grounded) {
    if (solidAt(s, sl.x, sl.z)) {
      // Standing, or taking off here: a flight starts with the next step, so it follows the curve jumpWindow predicts from this spot.
      const pad = padUnder(s)
      if (pad !== null) throwUp(s, pad)
      else if (d.heldJump) {
        const j = nextJump(s, 14)
        if (t - s.input.jumpAt > HELD_JUMP_FOR || j === null || j.lo > j.hi) d.heldJump = false
        else if (sl.z >= j.lo) jump(s)
      }
      return
    }
    sl.grounded = false
    sl.vy = 0
  }
  const wasY = sl.y
  fall(s, h)
  if (sl.y < 0 && wasY < 0) {
    // Under the track's top: it drops into the water rather than sliding along under the track.
    sl.vx = ease(sl.vx, 0, h, SINK_TAU)
    sl.vz = ease(sl.vz, 0, h, SINK_TAU)
  }
  const pad = sl.vy <= 0 && wasY >= 0 ? padUnder(s) : null
  if (pad !== null) throwUp(s, pad)
  else if (sl.vy <= 0 && sl.y <= 0 && wasY >= 0 && solidAt(s, sl.x, sl.z)) land(s, -sl.vy)
  else if (sl.y < WATER_Y) splash(s)
}

/** The cushion under a slime that is down on it and not rising, or null. */
function padUnder(s: Sim): Pad | null {
  const sl = s.slime
  if (sl.y > PAD_H || sl.vy > 0) return null
  for (const p of s.pads) if (Math.hypot(sl.x - p.spec.x, sl.z - p.spec.z) < PAD_R) return p
  return null
}

function throwUp(s: Sim, pad: Pad) {
  const sl = s.slime
  sl.y = Math.max(sl.y, 0)
  sl.vy = Math.sqrt(2 * gravityFor(sl.size) * PAD_THROW_H)
  sl.grounded = false
  sl.jumpedAt = s.time
  s.doing.bouncing = false
  s.doing.heldJump = false
  pad.boingAt = s.time
  emit(s, { kind: 'pad' })
}

function jump(s: Sim) {
  const sl = s.slime
  sl.vy = jumpSpeedFor(sl.size)
  sl.grounded = false
  sl.jumpedAt = s.time
  s.input.jumpAt = -1
  s.doing.heldJump = false
  s.doing.bouncing = false
  emit(s, { kind: 'jump', big: sl.size >= BIG })
}

/** Down on the track. A big slime bounces once more by itself, and that BOING pulls in every ball near; a jump pressed just before landing jumps at once. */
function land(s: Sim, impact: number) {
  const sl = s.slime
  const d = s.doing
  const t = s.time
  sl.y = 0
  sl.vy = 0
  sl.grounded = true
  sl.landedAt = t
  d.hopFrame = -1
  const wasBounce = d.bouncing
  d.bouncing = false
  const wantsJump = s.input.jumpAt >= 0 && t - s.input.jumpAt <= JUMP_EARLY && !sl.hidden
  if (!wasBounce) emit(s, { kind: 'land', big: sl.size >= BIG })
  if (!wasBounce && !sl.hidden && sl.size >= BIG && impact >= BOUNCE_FROM_VY) {
    sl.bounceAt = t
    emit(s, { kind: 'bounce' })
    const reach = BOUNCE_REACH + sl.r
    for (const b of s.balls) if (free(s, b) && Math.hypot(b.x - sl.x, b.y - sl.r, b.z - sl.z) < reach) take(s, b)
    if (!wantsJump) {
      sl.vy = Math.sqrt(2 * gravityFor(sl.size) * BOUNCE_H)
      sl.grounded = false
      d.bouncing = true
    }
  }
  if (wantsJump) jump(s)
}

/** Frames, snow gates, fan cages and paddles. */
function collide(s: Sim) {
  const sl = s.slime
  const d = s.doing
  const frames = s.course.frames
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    if (i === d.hopFrame || sl.y >= FRAME_H) continue
    if (sl.z + sl.r <= f.z - FRAME_DEPTH / 2 || sl.z - sl.r >= f.z + FRAME_DEPTH / 2) continue
    if (sl.x + 0.7 * sl.r <= f.x0 || sl.x - 0.7 * sl.r >= f.x1) continue
    startClimb(s, i)
    return
  }
  if (d.knockUntil < 0) {
    for (const g of s.gates) {
      if (g.liftAt >= 0 || sl.y + (sl.hidden ? HIDDEN_TOP : 2 * sl.r) <= GATE_GAP || sl.y >= GATE_H || !underGate(s, g.spec)) continue
      bump(s, g)
      return
    }
  }
  for (const fan of s.fans) cage(s, fan.spec)
  if (sl.hidden || s.time < sl.ghostUntil) return
  for (const sp of s.spinners) {
    if (!paddleTouches(sp.spec, sp.angle, sl.x, sl.y + sl.r, sl.z, sl.r)) continue
    hit(s, sp)
    return
  }
}

/**
 * A fan's cage is a soft round bumper the slime slides round: pushed out along the normal,
 * and slid sideways when it comes head on. It goes round on the side with track: a slime on
 * the side with no way round is held at the cage's front and slid the other way, so the
 * cage never pushes it into the water and never holds it still.
 */
function cage(s: Sim, f: FanSpec) {
  const sl = s.slime
  const d = s.doing
  const reach = FAN_R + CAGE_BODY * sl.r
  const dx = sl.x - f.x
  const dz = sl.z - f.z
  const dist = Math.hypot(dx, dz)
  if (dist >= reach) return
  let side = Math.abs(dx) > 0.05 ? Math.sign(dx) : f.x > 0 ? -1 : 1
  if (!solidAt(s, f.x + side * (reach + 0.05), f.z)) side = -side
  let nx = dist > 1e-6 ? dx / dist : side
  let nz = dist > 1e-6 ? dz / dist : 0
  const wrongSide = Math.abs(dx) > 0.05 && Math.sign(dx) !== side
  if (wrongSide || !solidAt(s, f.x + nx * reach, f.z + nz * reach)) {
    nx = 0
    nz = -1
    sl.z = f.z - Math.sqrt(Math.max(0, reach * reach - dx * dx)) - 1e-3
    sl.vx = side * Math.max(Math.abs(sl.vx), CAGE_SLIDE)
  } else {
    sl.x = f.x + nx * reach
    sl.z = f.z + nz * reach
    if (sl.z < f.z && Math.abs(dx) < 0.5 * reach) sl.vx = side * Math.max(Math.abs(sl.vx), CAGE_SLIDE)
  }
  const vn = sl.vx * nx + sl.vz * nz
  if (vn < 0) {
    sl.vx -= vn * nx
    sl.vz -= vn * nz
  }
  if (s.time - d.bumpSoundAt >= 1) {
    d.bumpSoundAt = s.time
    sl.bumpAt = s.time
    emit(s, { kind: 'bump' })
  }
}

/** A paddle hit: dizzy, a couple of balls fly off to land ahead, knocked back along the track, paddles pass through for a while. */
function hit(s: Sim, sp: Sim['spinners'][number]) {
  const sl = s.slime
  const t = s.time
  sl.hitAt = t
  sl.ghostUntil = t + GHOST_FOR
  const dropped = Math.min(DROPS, sl.balls)
  for (let k = 0; k < dropped; k++) {
    const z = sl.z + DROP_AHEAD + 0.8 * k
    const tries = [sl.x + (k === 0 ? -0.8 : 0.8), sl.x, 0]
    const x = tries.find((x) => groundAt(s.course, x, z) && groundAt(s.course, x - 0.3, z) && groundAt(s.course, x + 0.3, z))
    const spot = x === undefined ? { x: sl.x, z: sl.z } : { x, z }
    s.balls.push({ id: s.nextId++, x: spot.x, y: BALL_Y, z: spot.z, takenAt: -1, droppedAt: t, fromX: sl.x, fromY: sl.y + sl.r, fromZ: sl.z })
  }
  sl.balls -= dropped
  resize(s)
  emit(s, { kind: 'hit', dropped })
  sp.hits += 1
  if (sp.hits === EASY_AFTER) {
    sp.easy = true
    emit(s, { kind: 'easy', what: 'spinner' })
  }
  knock(s, KNOCK_BACK, KNOCK_FOR, KNOCK_HOP)
  s.teach = null
}

/** A snow gate bumps a slime that is not flat back; after EASY_AFTER bumps it lifts away. */
function bump(s: Sim, g: Sim['gates'][number]) {
  s.slime.bumpAt = s.time
  g.bumps += 1
  emit(s, { kind: 'bump' })
  if (g.bumps === EASY_AFTER) {
    g.liftAt = s.time
    emit(s, { kind: 'easy', what: 'gate' })
  }
  knock(s, BUMP_BACK, BUMP_FOR, BUMP_HOP)
  s.teach = null
}

/** Back along the track (never sideways, never past the track's end into the water) with a little hop. */
function knock(s: Sim, back: number, seconds: number, hop: number) {
  const sl = s.slime
  const d = s.doing
  let b = back
  while (b > 0.05 && !(solidAt(s, sl.x, sl.z - b) && solidAt(s, sl.x, sl.z - b / 2))) b -= 0.1
  sl.vz = -Math.max(0, b) / seconds
  sl.vx = 0
  sl.vy = hop
  sl.grounded = false
  sl.climbAt = -1
  d.climbFrame = -1
  d.knockUntil = s.time + seconds
  d.heldJump = false
  d.bouncing = false
}

function startClimb(s: Sim, i: number) {
  const sl = s.slime
  const d = s.doing
  const f = s.course.frames[i]
  sl.climbAt = s.time
  d.climbFrame = i
  d.climbFromZ = sl.z
  d.climbFromY = Math.max(0, sl.y)
  d.climbToZ = f.z + FRAME_DEPTH / 2 + sl.r + 0.02
  sl.vx = 0
  sl.vy = 0
  sl.vz = 0
  sl.grounded = true
  d.heldJump = false
  // Stuck on it: the moment for the jump has gone, so time comes back for the climb.
  if (s.teach !== null && s.teach.kind === 'frame') s.teach = null
  emit(s, { kind: 'climb' })
}

/** Stuck to a frame: up to its top and down the far side in CLIMB_FOR. */
function climb(s: Sim) {
  const sl = s.slime
  const d = s.doing
  const u = (s.time - sl.climbAt) / CLIMB_FOR
  if (u < 1) {
    sl.z = lerp(d.climbFromZ, d.climbToZ, smoothstep(0, 1, u))
    sl.y = (1 - u) * d.climbFromY + FRAME_H * Math.sin(Math.PI * u)
    return
  }
  sl.z = d.climbToZ
  sl.y = 0
  sl.climbAt = -1
  d.climbFrame = -1
  sl.vz = RUN_V * 0.3
  emit(s, { kind: 'over' })
}

/** Jump while climbing: straight over the frame. */
function hopOver(s: Sim) {
  const sl = s.slime
  const d = s.doing
  d.hopFrame = d.climbFrame
  d.climbFrame = -1
  sl.climbAt = -1
  sl.vz = Math.max(sl.vz, RUN_V * 0.8)
  jump(s)
}

const free = (s: Sim, b: Ball) => b.takenAt < 0 && (b.droppedAt < 0 || s.time >= b.droppedAt + DROP_FOR)

/** Whether the slime's body touches a ball of radius `rad` centred at (x, y, z): a ball of radius r standing, a puddle HIDDEN_TOP tall when flat. */
function touches(s: Sim, x: number, y: number, z: number, rad: number) {
  const sl = s.slime
  if (sl.hidden) return Math.hypot(x - sl.x, z - sl.z) < sl.r + rad && y > sl.y - rad && y < sl.y + HIDDEN_TOP + rad
  const dx = x - sl.x
  const dy = y - (sl.y + sl.r)
  const dz = z - sl.z
  return dx * dx + dy * dy + dz * dz < (sl.r + rad) * (sl.r + rad)
}

function take(s: Sim, b: Ball) {
  const sl = s.slime
  b.takenAt = s.time
  sl.balls += 1
  resize(s)
  emit(s, { kind: 'ball', balls: sl.balls })
  if (sl.balls % 10 === 0) {
    sl.burpAt = s.time
    emit(s, { kind: 'burp' })
  }
}

function resize(s: Sim) {
  const sl = s.slime
  sl.size = sizeFor(sl.balls, s.course.balls.length)
  sl.r = R0 * sl.size
}

function takeThings(s: Sim) {
  const sl = s.slime
  for (const b of s.balls) {
    if (Math.abs(b.z - sl.z) > sl.r + BALL_R + 0.1 || !free(s, b)) continue
    if (touches(s, b.x, b.y, b.z, BALL_R)) take(s, b)
  }
  for (const baby of s.babies) {
    if (baby.takenAt >= 0 || !touches(s, baby.x, baby.y + BABY_R, baby.z, BABY_R)) continue
    baby.takenAt = s.time
    emit(s, { kind: 'baby', index: baby.index })
  }
}

function passFlags(s: Sim) {
  for (let i = 0; i < s.flags.length; i++) {
    const f = s.flags[i]
    if (f.reachedAt >= 0 || s.slime.z < f.spec.z) continue
    f.reachedAt = s.time
    s.checkpoint = Math.max(s.checkpoint, i)
    emit(s, { kind: 'flag', index: i })
  }
}

/** 0 safely on the track to 1 with the centre at the very edge of the water (a side, or a hole's rim). */
function edgeOf(s: Sim) {
  const sl = s.slime
  for (let k = 0; k <= 6; k++) {
    const off = (k * EDGE_BAND) / 6
    if (!solidAt(s, sl.x - off, sl.z) || !solidAt(s, sl.x + off, sl.z)) return clamp01(1 - off / EDGE_BAND)
  }
  return 0
}

/** Into the water: the fish will bring the slime back to the last flag. A third fall into the same hole floats a lily pad into it. */
function splash(s: Sim) {
  const sl = s.slime
  const d = s.doing
  const t = s.time
  setPhase(s, 'splash')
  sl.splashAt = t
  sl.splashX = sl.x
  sl.splashZ = sl.z
  sl.vx = 0
  sl.vy = 0
  sl.vz = 0
  sl.grounded = false
  sl.climbAt = -1
  sl.edge = 1
  sl.sliding = false
  if (sl.hidden) {
    sl.hidden = false
    sl.shownAt = t
  }
  d.knockUntil = -1
  d.climbFrame = -1
  d.hopFrame = -1
  d.heldJump = false
  d.bouncing = false
  s.input.jumpAt = -1
  s.teach = null
  emit(s, { kind: 'splash' })
  const i = holeUnder(s, sl.x, sl.z)
  if (i < 0) return
  const hole = s.holes[i]
  hole.falls += 1
  if (hole.falls === EASY_AFTER) {
    hole.raftAt = t
    emit(s, { kind: 'easy', what: 'hole' })
  }
}

/** On a scripted arc from doing's from to its to, u from 0 to 1, with the speeds the scene leans by. */
function fly(s: Sim, u: number, h: number) {
  const sl = s.slime
  const d = s.doing
  const x = lerp(d.fromX, d.toX, u)
  const y = lerp(d.fromY, d.toY, u) + d.moveArc * 4 * u * (1 - u)
  const z = lerp(d.fromZ, d.toZ, u)
  sl.vx = (x - sl.x) / h
  sl.vy = (y - sl.y) / h
  sl.vz = (z - sl.z) / h
  sl.x = x
  sl.y = y
  sl.z = z
  sl.grounded = false
}

/** Bobbing in the water; the big friendly fish comes up and spits the slime back to the last flag (or the start). */
function stepSplash(s: Sim, h: number) {
  const sl = s.slime
  const d = s.doing
  const k = s.time - s.phaseAt
  if (k >= FISH_AT && k - h < FISH_AT) emit(s, { kind: 'fish' })
  if (k < SPIT_AT) {
    sl.x = sl.splashX
    sl.z = sl.splashZ
    sl.y = BOB_Y + 0.08 * Math.sin(k * 9)
    return
  }
  if (k - h < SPIT_AT) {
    d.fromX = sl.x
    d.fromY = sl.y
    d.fromZ = sl.z
    d.toX = 0
    d.toY = 0
    d.toZ = s.checkpoint >= 0 ? s.flags[s.checkpoint].spec.z : 0
    d.moveAt = s.phaseAt + SPIT_AT
    d.moveFor = SPIT_FOR
    d.moveArc = SPIT_H
  }
  const u = (s.time - d.moveAt) / d.moveFor
  if (u < 1) {
    fly(s, u, h)
    return
  }
  setPhase(s, 'run')
  sl.x = 0
  sl.y = 0
  sl.z = d.toZ
  sl.vx = 0
  sl.vy = 0
  sl.vz = 0
  sl.grounded = true
  sl.edge = 0
  sl.landedAt = s.time
  sl.fishUntil = s.time + FISH_RIDE
  emit(s, { kind: 'back' })
}

// ------------------------------------------------------------------ the finish and the tower

/** Through the arch: the key is taken, and the sim walks the slime to the pole. */
function startFinish(s: Sim) {
  const sl = s.slime
  const d = s.doing
  setPhase(s, 'finish')
  s.finish.keyAt = s.time
  emit(s, { kind: 'key' })
  d.finishStep = 'pole'
  d.knockUntil = -1
  d.heldJump = false
  d.climbFrame = -1
  sl.climbAt = -1
  sl.edge = 0
  sl.sliding = false
  s.teach = null
  if (sl.hidden) show(s)
}

/** Walks toward (tx, tz) on the ground; true once there. `stop` slows down to stand there, else it runs through. */
function walkTo(s: Sim, tx: number, tz: number, h: number, stop: boolean): boolean {
  const sl = s.slime
  const dx = tx - sl.x
  const dz = tz - sl.z
  const dist = Math.hypot(dx, dz)
  if (dist < (stop ? 0.05 : 0.3)) {
    if (stop) {
      sl.vx = 0
      sl.vz = 0
    }
    return true
  }
  const speed = stop ? Math.min(RUN_V, 0.4 + dist * 2.5) : RUN_V
  sl.vx = ease(sl.vx, (dx / dist) * speed, h, 0.15)
  sl.vz = ease(sl.vz, (dz / dist) * speed, h, 0.15)
  if (Math.hypot(sl.vx, sl.vz) * h >= dist) {
    sl.x = tx
    sl.z = tz
  } else {
    sl.x += sl.vx * h
    sl.z += sl.vz * h
  }
  return false
}

/** To the pole, a stand there while the animal of its size lights up, on to the trampoline and a hop onto it. */
function stepFinish(s: Sim, h: number) {
  const sl = s.slime
  const d = s.doing
  if (d.finishStep === 'hop') {
    const u = (s.time - d.moveAt) / d.moveFor
    if (u < 1) fly(s, u, h)
    else launch(s)
    return
  }
  if (!sl.grounded) {
    fall(s, h)
    if (sl.y <= 0) {
      sl.y = 0
      sl.vy = 0
      sl.grounded = true
      sl.landedAt = s.time
    }
  }
  if (d.finishStep === 'pole') {
    if (!walkTo(s, POLE_X - sl.r - POLE_GAP, s.course.finishZ + POLE_DZ, h, true)) return
    d.finishStep = 'measure'
    s.finish.measureAt = s.time
    s.finish.animal = animalFor(sl.size)
    emit(s, { kind: 'measure', animal: s.finish.animal })
  } else if (d.finishStep === 'measure') {
    if (s.time - s.finish.measureAt >= MEASURE_FOR) d.finishStep = 'trampoline'
  } else if (walkTo(s, 0, s.tower.z - HOP_FROM, h, false)) {
    d.finishStep = 'hop'
    d.fromX = sl.x
    d.fromY = sl.y
    d.fromZ = sl.z
    d.toX = 0
    d.toY = 0
    d.toZ = s.tower.z
    d.moveAt = s.time
    d.moveFor = HOP_FOR
    d.moveArc = HOP_H
    sl.jumpedAt = s.time
    sl.grounded = false
    emit(s, { kind: 'jump', big: sl.size >= BIG })
  }
}

/** The trampoline throws the slime up the tower; every circle is back in place. */
function launch(s: Sim) {
  const sl = s.slime
  const tw = s.tower
  setPhase(s, 'tower')
  tw.launchAt = s.time
  sl.x = 0
  sl.y = 0
  sl.z = tw.z
  sl.vx = 0
  sl.vz = 0
  sl.vy = LAUNCH_V
  sl.grounded = false
  sl.landedAt = s.time
  s.doing.emerging = false
  for (const c of tw.circles) c.poppedAt = -1
  emit(s, { kind: 'trampoline' })
}

/** Rising up the shaft, steering between the circles; the giant circle funnels it through its hole onto the top. */
function stepTower(s: Sim, h: number) {
  const sl = s.slime
  const tw = s.tower
  const d = s.doing
  if (d.emerging) {
    fall(s, h)
    sl.x = ease(sl.x, 0, h, 0.08)
    sl.vx = 0
    if (sl.vy < 0 && sl.y <= tw.topY) top(s)
    return
  }
  const funnel = tw.funnelAt >= 0
  if (funnel) {
    sl.vx = 0
    sl.x = ease(sl.x, 0, h, 0.15)
  } else {
    sl.vx = ease(sl.vx, s.input.steer * STEER_V, h, STEER_TAU)
    sl.x += sl.vx * h
    const wall = TOWER_HALF - sl.r
    if (Math.abs(sl.x) > wall) {
      sl.x = Math.sign(sl.x) * wall
      sl.vx = 0
    }
  }
  sl.vy = ease(sl.vy, RISE_V, h, RISE_TAU)
  sl.y += sl.vy * h
  for (const c of tw.circles) {
    if (c.poppedAt >= 0) continue
    if (sl.y > c.y + c.r) {
      c.poppedAt = s.time
      s.stars += c.n
      emit(s, { kind: 'pop', n: c.n })
      continue
    }
    if (funnel) continue
    const reach = TOWER_BODY * sl.r + c.r
    const dx = sl.x - c.x
    const dy = sl.y + sl.r - c.y
    if (dx * dx + dy * dy >= reach * reach) continue
    bonk(s)
    return
  }
  if (!funnel && sl.y >= tw.giantY - FUNNEL_DY && allPopped(s)) {
    tw.funnelAt = s.time
    emit(s, { kind: 'funnel' })
  }
  if (sl.y >= tw.topY) {
    d.emerging = true
    sl.vy = EMERGE_V
  }
}

function allPopped(s: Sim) {
  for (const c of s.tower.circles) if (c.poppedAt < 0) return false
  return true
}

/** A circle touched: back down to the trampoline (key, balls, babies and stars kept); after EASY_AFTER the circles shrink and slow. */
function bonk(s: Sim) {
  const sl = s.slime
  const tw = s.tower
  const d = s.doing
  tw.bonkAt = s.time
  tw.hits += 1
  emit(s, { kind: 'bonk' })
  if (tw.hits === EASY_AFTER) {
    tw.easy = true
    for (const c of tw.circles) c.r = CIRCLE_R * CIRCLE_EASY
    emit(s, { kind: 'easy', what: 'tower' })
  }
  setPhase(s, 'fall')
  d.fromX = sl.x
  d.fromY = sl.y
  d.fromZ = sl.z
  d.moveAt = s.time
  d.moveFor = FALL_FOR
}

/** Dropping back to the trampoline with a little pop first; then it launches again by itself. */
function stepFall(s: Sim, h: number) {
  const sl = s.slime
  const d = s.doing
  const u = (s.time - d.moveAt) / d.moveFor
  if (u >= 1) {
    launch(s)
    return
  }
  const x = lerp(d.fromX, 0, smoothstep(0, 1, u))
  const y = d.fromY * (1 - u * u) + FALL_POP * Math.sin(Math.PI * u) * (1 - u)
  sl.vx = (x - sl.x) / h
  sl.vy = (y - sl.y) / h
  sl.vz = 0
  sl.x = x
  sl.y = y
}

/** Out on the top platform: the box opens on its own clock. */
function top(s: Sim) {
  const sl = s.slime
  setPhase(s, 'top')
  s.finish.topAt = s.time
  sl.x = 0
  sl.y = s.tower.topY
  sl.vx = 0
  sl.vy = 0
  sl.vz = 0
  sl.grounded = true
  sl.landedAt = s.time
  s.doing.emerging = false
  emit(s, { kind: 'top' })
}

/** Whether `mark` seconds into something passed in the step that took `h` and reached `k`. */
const crossed = (k: number, h: number, mark: number) => k >= mark && k - h < mark

function stepTop(s: Sim, h: number) {
  const f = s.finish
  const k = s.time - f.topAt
  if (crossed(k, h, UNLOCK_AT)) {
    f.unlockAt = s.time
    emit(s, { kind: 'unlock' })
  }
  if (crossed(k, h, OPEN_AT)) {
    f.openAt = s.time
    emit(s, { kind: 'open' })
  }
  if (crossed(k, h, GIFT_AT)) {
    f.giftAt = s.time
    emit(s, { kind: 'gift', item: s.gift })
    emit(s, { kind: 'cheer' })
  }
  if (crossed(k, h, DONE_AT)) {
    setPhase(s, 'done')
    emit(s, { kind: 'done' })
  }
}

// ------------------------------------------------------------------ lessons

/** The side of a fan's lane that still has track to stand on, the nearer one when both do. */
export function freeSide(f: FanSpec, x: number): 'left' | 'right' {
  const left = f.x - f.width / 2 > -TRACK_HALF + 0.4
  const right = f.x + f.width / 2 < TRACK_HALF - 0.4
  if (left && right) return x < f.x ? 'left' : 'right'
  if (right) return 'right'
  if (left) return 'left'
  throw new Error(`the fan at x = ${f.x}, z = ${f.z} blows over the whole track`)
}

function startLesson(s: Sim, kind: Teachable, action: Action, index: number) {
  s.teach = { kind, action, at: s.time }
  s.doing.teachIndex = index
  emit(s, { kind: 'teach', action })
}

/** The lesson answered: time comes back, and the kind is learned for good. */
function learn(s: Sim) {
  const t = s.teach
  if (t === null) throw new Error('no lesson to answer')
  s.teach = null
  if (!s.learned.includes(t.kind)) s.learned.push(t.kind)
  emit(s, { kind: 'learned', what: t.kind })
}

/** A lesson that went by unanswered: the obstacle is behind, calm again, or the slime got out another way. */
function lessonOver(s: Sim): boolean {
  const t = s.teach
  if (t === null) return false
  const sl = s.slime
  const i = s.doing.teachIndex
  switch (t.kind) {
    case 'frame': {
      const f = s.course.frames[i]
      return sl.z - sl.r > f.z + FRAME_DEPTH / 2
    }
    case 'hole': {
      const hole = s.holes[i]
      return hole.raftAt >= 0 || sl.z > hole.spec.z + hole.spec.r
    }
    case 'spinner':
      return paddleHitIn(s, SPINNER_TEACH + 0.3) < 0
    case 'gate': {
      const g = s.gates[i]
      return g.liftAt >= 0 || sl.z - sl.r > g.spec.z + GATE_DEPTH / 2
    }
    case 'fan': {
      const fan = s.fans[i]
      const f = fan.spec
      return fan.power <= 0.5 || Math.abs(sl.x - f.x) >= f.width / 2 || sl.z >= f.z || sl.z < f.z - f.reach - 3
    }
    case 'circle':
      throw new Error('a circle lesson belongs to the tower, not the course')
  }
}

/**
 * The first time a kind of obstacle comes (one not in `learned`), at the moment its
 * answer would work: a frame or hole when a jump would clear it, a spinner when a paddle
 * would reach the slime within SPINNER_TEACH, a gate GATE_TEACH before it, a fan's hard
 * wind when the slime comes into its lane.
 */
function lessons(s: Sim) {
  const sl = s.slime
  if (s.teach !== null) {
    if (s.teach.action === 'left' || s.teach.action === 'right') answerSteer(s)
    if (lessonOver(s)) s.teach = null
    return
  }
  if (sl.climbAt >= 0 || s.doing.knockUntil >= 0) return
  const learned = s.learned
  if (sl.grounded && !sl.hidden && (!learned.includes('frame') || !learned.includes('hole'))) {
    const j = nextJump(s, 14)
    if (j !== null && !learned.includes(j.kind) && j.lo <= j.hi && sl.z <= j.hi && sl.z + Math.max(sl.vz, 0.5) * TEACH_LEAD >= j.lo) {
      startLesson(s, j.kind, 'jump', j.index)
      return
    }
  }
  if (!learned.includes('spinner') && !sl.hidden && s.time >= sl.ghostUntil && paddleHitIn(s, SPINNER_TEACH) >= 0) {
    startLesson(s, 'spinner', 'hide', -1)
    return
  }
  if (!learned.includes('gate') && !sl.hidden) {
    for (let i = 0; i < s.gates.length; i++) {
      const g = s.gates[i]
      const gap = g.spec.z - GATE_DEPTH / 2 - (sl.z + sl.r)
      if (g.liftAt >= 0 || gap < 0 || gap > GATE_TEACH || sl.x + 0.7 * sl.r <= g.spec.x0 || sl.x - 0.7 * sl.r >= g.spec.x1) continue
      startLesson(s, 'gate', 'hide', i)
      return
    }
  }
  if (!learned.includes('fan')) {
    for (let i = 0; i < s.fans.length; i++) {
      const fan = s.fans[i]
      const f = fan.spec
      if (fan.power <= 0.5 || Math.abs(sl.x - f.x) >= f.width / 2 || sl.z < f.z - f.reach - 2 || sl.z >= f.z - FAN_R) continue
      startLesson(s, 'fan', freeSide(f, sl.x), i)
      return
    }
  }
}

// ------------------------------------------------------------------ for the HUD and the sounds

/** 0 at the start to 1 at the finish arch, for the HUD's line; 1 from the finish on. */
export function progress(s: Sim): number {
  if (s.phase === 'ready' || s.phase === 'run' || s.phase === 'splash') return clamp01(s.slime.z / s.course.finishZ)
  return 1
}

/** 0 to 1: how loud the wind of the fans near the slime is, for the wind sound. */
export function windLoud(s: Sim): number {
  if (s.phase !== 'ready' && s.phase !== 'run' && s.phase !== 'splash') return 0
  const sl = s.slime
  let loud = 0
  for (const fan of s.fans) loud = Math.max(loud, fan.power * clamp01(1 - Math.hypot(sl.x - fan.spec.x, sl.z - fan.spec.z) / WIND_HEAR))
  return loud
}

// ------------------------------------------------------------------ URL switches

/** For the URL switches: the slime running from z on the main line (x = 0), with every flag before z passed. */
export function startAt(s: Sim, z: number): void {
  if (!solidAt(s, 0, z)) throw new Error(`there is no track at x = 0, z = ${z} to start from`)
  const sl = s.slime
  sl.x = 0
  sl.y = 0
  sl.z = z
  sl.vx = 0
  sl.vy = 0
  sl.vz = 0
  sl.grounded = true
  for (let i = 0; i < s.flags.length; i++) {
    if (s.flags[i].spec.z >= z) continue
    s.flags[i].reachedAt = s.time
    s.checkpoint = i
  }
}

/** For the URL switches: carry this many balls (the size follows). The course's first balls count as taken. */
export function setBalls(s: Sim, balls: number): void {
  const total = s.course.balls.length
  if (s.balls.length !== total) throw new Error('setBalls is for a fresh run, before any ball was knocked off')
  const n = clamp(Math.round(balls), 0, total)
  for (let i = 0; i < total; i++) s.balls[i].takenAt = i < n ? s.time : -1
  s.slime.balls = n
  resize(s)
}

/** For the URL switches: the key taken and the slime on the trampoline, about to rise. */
export function startTower(s: Sim): void {
  const sl = s.slime
  s.finish.keyAt = s.time
  s.finish.measureAt = s.time
  s.finish.animal = animalFor(sl.size)
  for (const f of s.flags) f.reachedAt = s.time
  s.checkpoint = s.flags.length - 1
  s.teach = null
  if (sl.hidden) {
    sl.hidden = false
    sl.shownAt = s.time
  }
  launch(s)
}

/** For the URL switches: the slime just out on the top, the box about to open. */
export function startTop(s: Sim): void {
  startTower(s)
  s.tower.funnelAt = s.time
  top(s)
}
