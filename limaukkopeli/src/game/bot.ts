/**
 * The careful child at the keys: it follows the balls and the babies, jumps frames and
 * holes from the middle of their take-off window, goes flat when a paddle is about to
 * come or a gate is close, keeps out of a fan's lane unless something it wants is there,
 * never steers off the track, and in the tower plans a way between the circles a few
 * seconds ahead. courses.test.ts uses it to prove every course can be finished with
 * every ball and baby and no fall, hit or bonk; the game uses it for ?autoplay.
 */

import { GATE_DEPTH, TOWER_HALF, type Course, type Sim } from './model'
import { RISE_TAU, RISE_V, STEER_TAU, STEER_V, TOWER_BODY, circleX, circleY, freeSide, go, nextJump, paddleHitIn, pressJump, setHide, setSteer, towerRate } from './sim'

/** Whatever the bot remembers between frames. */
export interface Bot {
  /** What it pressed last frame, so it presses and lets go like a child. */
  steer: -1 | 0 | 1
  hide: boolean
}

export function createBot(): Bot {
  return { steer: 0, hide: false }
}

/** It goes flat when a paddle would touch it within this long, and when a gate is this close. */
const HIDE_LEAD = 0.3
const GATE_NEAR = 1.2
/** It looks this far ahead for the next ball or baby. */
const LOOK = 16
/** The steering look-ahead: how far ahead in time, in what steps, and the room it keeps from the water. */
const HORIZON = 0.6
const DT = 0.05
const ROOM = 0.3
/** The steering plans it weighs every frame: a way to press, and for how long before letting go. */
const PLANS: readonly (readonly [-1 | 0 | 1, number])[] = [
  [-1, HORIZON],
  [-1, 0.3],
  [-1, 0.15],
  [0, 0],
  [1, 0.15],
  [1, 0.3],
  [1, HORIZON],
]
/** The tower plan: time steps, how many, the width of a lane, and the room it keeps from every circle (which also covers the moment the steering takes to reach full speed). */
const T_DT = 0.1
const T_STEPS = 40
const CELL = 0.25
const T_ROOM = 0.2

/** Reads the run and works the controls for this frame: go, steer, jump, hide. */
export function botStep(s: Sim, bot: Bot): void {
  if (s.phase === 'ready') go(s)
  if (s.phase === 'run') runStep(s, bot)
  else if (s.phase === 'tower') hands(s, bot, towerSteer(s), false)
  else hands(s, bot, 0, false)
}

function hands(s: Sim, bot: Bot, steer: -1 | 0 | 1, hide: boolean) {
  if (steer !== bot.steer) {
    setSteer(s, steer)
    bot.steer = steer
  }
  if (hide !== bot.hide) {
    setHide(s, hide)
    bot.hide = hide
  }
}

function runStep(s: Sim, bot: Bot) {
  const sl = s.slime
  let hide = paddleHitIn(s, HIDE_LEAD) >= 0
  for (const g of s.gates) {
    if (g.liftAt >= 0) continue
    if (g.spec.z - GATE_DEPTH / 2 - (sl.z + sl.r) < GATE_NEAR && sl.z - sl.r < g.spec.z + GATE_DEPTH / 2) hide = true
  }
  if (sl.climbAt >= 0) pressJump(s)
  else if (!hide && !sl.hidden) {
    const j = nextJump(s, 12)
    if (j !== null && j.lo <= j.hi && sl.z >= (j.lo + j.hi) / 2 && sl.z <= j.hi + 0.5) pressJump(s)
  }
  hands(s, bot, steerFor(s, aim(s), bot.steer), hide)
}

/** Where across the track it wants to be: at the next ball or baby, out of hard wind's lanes unless that is where they are. */
function aim(s: Sim): number {
  const sl = s.slime
  let gx = 0
  let gz = Infinity
  const consider = (x: number, z: number) => {
    if (z < sl.z - 0.2 || z > sl.z + LOOK) return
    if (z < gz - 0.3 || (Math.abs(z - gz) <= 0.3 && Math.abs(x - sl.x) < Math.abs(gx - sl.x))) {
      gx = x
      gz = z
    }
  }
  for (const b of s.balls) if (b.takenAt < 0) consider(b.x, b.z)
  for (const b of s.babies) if (b.takenAt < 0) consider(b.x, b.z)
  let x = gx
  for (const fan of s.fans) {
    const f = fan.spec
    // Only a fan whose wind lies between the slime and its goal matters; a goal in the wind is worth a push.
    if (sl.z > f.z + 1 || sl.z < f.z - f.reach - 8 || gz < f.z - f.reach - 0.5) continue
    if (gz < f.z && Math.abs(gx - f.x) < f.width / 2) continue
    const half = f.width / 2 + 0.25 + 0.5 * sl.r
    if (Math.abs(x - f.x) < half) x = f.x + (freeSide(f, x) === 'right' ? half : -half)
  }
  return x
}

function inSlab(course: Course, x: number, z: number) {
  for (const g of course.ground) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return true
  return false
}

/** Track under a centre at (x, z) with room to spare; holes do not count, the bot jumps them. */
const safeAt = (course: Course, x: number, z: number) => inSlab(course, x - ROOM, z) && inSlab(course, x + ROOM, z)

/** The way to press now: the plan that ends nearest the target over the next HORIZON without leaving the track. */
function steerFor(s: Sim, target: number, current: -1 | 0 | 1): -1 | 0 | 1 {
  const sl = s.slime
  const vz = Math.max(sl.vz, 2)
  const keep = 1 - Math.exp(-DT / STEER_TAU)
  let best: -1 | 0 | 1 = 0
  let bestScore = Infinity
  for (const [dir, hold] of PLANS) {
    let x = sl.x
    let vx = sl.vx
    let z = sl.z
    let score = -1
    for (let t = DT; t <= HORIZON + 1e-9; t += DT) {
      vx += ((t <= hold + 1e-9 ? dir * STEER_V : 0) - vx) * keep
      x += vx * DT
      z += vz * DT
      if (!safeAt(s.course, x, z)) {
        score = 1000 + (HORIZON - t) * 100
        break
      }
    }
    if (score < 0) score = Math.abs(x - target) + (dir === current ? 0 : 0.02)
    if (score < bestScore) {
      bestScore = score
      best = dir
    }
  }
  return best
}

/** Reused between frames: the tower plan's costs ((T_STEPS + 1) rows of lanes), and the live circles at one step. */
let plan = new Float64Array(0)
let near = new Float64Array(0)

/**
 * The tower: a plan over lanes across the shaft and steps of time, seeing where every
 * circle will be (they move by the clock) and where the slime will be (it rises at a
 * known speed): the cheapest way that touches no circle, a little cost for moving and for
 * passing close. It steers for the lane the plan holds two steps ahead.
 */
function towerSteer(s: Sim): -1 | 0 | 1 {
  const sl = s.slime
  const tw = s.tower
  if (tw.funnelAt >= 0 || s.doing.emerging) return 0
  const wall = TOWER_HALF - sl.r
  const n = Math.floor((2 * wall) / CELL) + 1
  const lane = (2 * wall) / (n - 1)
  const reach = Math.max(1, Math.round((STEER_V * T_DT) / lane))
  if (plan.length < (T_STEPS + 1) * n) plan = new Float64Array((T_STEPS + 1) * n)
  if (near.length < 3 * tw.circles.length) near = new Float64Array(3 * tw.circles.length)
  const rate = towerRate(s)
  const clock = s.doing.towerClock
  for (let k = T_STEPS; k >= 0; k--) {
    const t = k * T_DT
    const y = sl.y + RISE_V * t + (sl.vy - RISE_V) * RISE_TAU * (1 - Math.exp(-t / RISE_TAU))
    // The circles still ahead and near this height: where they are then, and how close is too close.
    let live = 0
    for (let ci = 0; ci < tw.circles.length; ci++) {
      const c = tw.circles[ci]
      if (c.poppedAt >= 0) continue
      const cy = circleY(c, ci, clock + rate * t)
      if (y > cy + c.r || Math.abs(cy - y) > 8) continue
      near[3 * live] = circleX(c, ci, clock + rate * t)
      near[3 * live + 1] = cy - y - sl.r
      near[3 * live + 2] = TOWER_BODY * sl.r + c.r + T_ROOM
      live++
    }
    for (let i = 0; i < n; i++) {
      const x = -wall + i * lane
      let cost = 0
      for (let l = 0; l < live && cost < Infinity; l++) {
        const d = Math.hypot(x - near[3 * l], near[3 * l + 1])
        if (d < near[3 * l + 2]) cost = Infinity
        else cost += Math.max(0, near[3 * l + 2] + 0.6 - d) * 0.5
      }
      if (k < T_STEPS && cost < Infinity) {
        let next = Infinity
        for (let j = Math.max(0, i - reach); j <= Math.min(n - 1, i + reach); j++) next = Math.min(next, plan[(k + 1) * n + j] + 0.02 * Math.abs(j - i))
        cost += next
      }
      plan[k * n + i] = cost
    }
  }
  let at = Math.round(clampLane((sl.x + wall) / lane, n))
  for (let k = 1; k <= 2; k++) {
    let bestJ = at
    let bestCost = Infinity
    for (let j = Math.max(0, at - reach); j <= Math.min(n - 1, at + reach); j++) {
      const cost = plan[k * n + j] + 0.02 * Math.abs(j - at)
      if (cost < bestCost) {
        bestCost = cost
        bestJ = j
      }
    }
    at = bestJ
  }
  const target = -wall + at * lane
  const err = target - (sl.x + sl.vx * STEER_TAU)
  return Math.abs(err) < 0.1 ? 0 : err < 0 ? -1 : 1
}

const clampLane = (i: number, n: number) => Math.min(n - 1, Math.max(0, i))
