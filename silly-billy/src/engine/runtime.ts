/**
 * The engine's API over the plain world (engine/api.ts, told to the designer in
 * engine/apidoc.ts): one handle per actor and per item, cached by id so code can compare
 * them, and one WorldApi per sim. Setters forgive: a value that is not a finite number is
 * ignored, positions stay in the room, sizes are clamped. Every helper that takes time takes
 * at least one frame, so a loop of helpers cannot spin without yielding. Code that moves
 * another actor makes it join: that actor's own doing waits until this action ends (w.join
 * ends it instead, as a command would), and a command of its own takes it out again. A helper
 * that code `yield`s instead of `yield*`ing runs all the same (runStack).
 */

import type { ActorApi, Anim, Args, ItemApi, PoseChange, Spot, WorldApi } from './api'
import { backFrame, bodyCenter, handFrame, headFrame, proportions, type Proportions } from './body'
import { parseColor } from './kit'
import { wordsOf, type Lang, type Words } from './lang'
import { blocker, clearLine, fieldFor, findWay, MARGIN, nextStep, type Circle, type Point } from './path'
import type { ParamKind, Param } from './protocol'
import { groundAt, inWater, insideRoom } from './rooms'
import type { Reaction, Sim } from './sim'
import { HANDS, ROOM_HALF, SLOTS, STEP, restPart, type Actor, type Hand, type Item, type Look, type Pose, type Slot, type Step, type Vec3 } from './types'
import {
  addPuffs, anchorPoint, bottomOf, CAMERA_FACING, clamp, copyPose, ease, GRAVITY, HEAD_KEYS, heightOf, isDown, isLying, isObject, itemCentre, lerpPose, LIMB_KEYS, LIMBS, MAX_ITEMS,
  moodName, nextRandom, num, POSE_NUMBERS, poseDistance, puffKind, restFor, restHeight, seatedRoot, solidsOf, soundName, supportAt, thinkPose, turnBetween,
  type Loose, type Seat, type Solid,
} from './world'
import { matchWord, normalWord } from './words'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const isIterator = (v: unknown): v is Iterator<unknown> =>
  v !== null && typeof v === 'object' && typeof (v as Iterator<unknown>).next === 'function' && typeof (v as Iterable<unknown>)[Symbol.iterator] === 'function'
/** Frames in `secs`, at least one. */
const frames = (secs: number) => Math.max(1, Math.round(secs / STEP))

/** Words code hands to say or speak, in `lang`, on one line: { en, fi }, or a string or number as it is; anything else shows nothing. */
function lineOf(v: unknown, lang: Lang): string {
  const s = wordsOf(v, lang)
  return s === '[object Object]' ? '' : s.replace(/\s+/g, ' ').trim()
}

/** What an actor says when something cannot be done. */
const HMM: Words = { en: 'Hmm?', fi: 'Hmm?' }
const TOO_BIG: Words = { en: 'Too big!', fi: 'Liian iso!' }

/**
 * Runs a generator one frame per call the way `yield*` would, and also runs a helper that code
 * `yield`ed by mistake: it goes on top and runs to its end before the code goes on.
 */
export function* runStack(root: Iterator<unknown>): Anim {
  const stack = [root]
  for (;;) {
    const r = stack[stack.length - 1]!.next()
    if (r.done) {
      stack.pop()
      if (stack.length === 0) return
    } else if (isIterator(r.value)) stack.push(r.value)
    else yield
  }
}

/** A generator, or a function that makes one (the designer passed the helper itself), or null. */
function iteratorOf(v: unknown): Iterator<unknown> | null {
  if (isIterator(v)) return v
  if (typeof v === 'function') {
    const r: unknown = (v as () => unknown)()
    return isIterator(r) ? r : null
  }
  return null
}

/** A word as an item kind for a thing nobody has made: lowercase, hyphens for spaces. */
const kindWord = (word: string) =>
  word
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9äöå-]/g, '')
    .slice(0, 40) || 'mystery'

/** The frame each actor last took a step in: one stepping now is in the way only for a moment; one waiting stands. */
const walkedIn = new WeakMap<Actor, number>()

/** What a walk keeps from frame to frame. */
interface Walk {
  /** The way being followed (path.ts), or null while the goal is in plain sight or before any was needed. */
  way: Point[] | null
  /** Metres from each spot of the way to its end. */
  rest: number[]
  /** The spot of the way it heads for now. */
  next: number
  /** At the way's end, on the last stretch to the goal, until it plans again. */
  final: boolean
  /** Where the goal was when the way was planned. */
  planX: number
  planZ: number
  /** When it last planned. */
  planned: number
  /** Others stood in its way: the next plan goes round them too. */
  roundOthers: boolean
  /** The others the way goes round, where they stood: the goal is not in plain sight past them either. */
  around: Circle[]
  /** The side it last turned to to get past something, tried first next time. */
  side: number
  /** The least it still had to go since it last planned (Infinity until it looks), and when it last got nearer. */
  left: number
  leftAt: number
  /** On the last stretch: the nearest it has come to the goal, and the frames in a row that brought it no nearer (a step to and fro between two others is no nearer). */
  nearest: number
  stuck: number
  /** When it set off, and when it gives up: later for a longer way, never past 50 s. */
  start: number
  until: number
}

/** A walk that takes longer than this many times its way's length at its pace, and 4 s more, has gone wrong. */
const SLACK = 2
/** No nearer for this long, it plans round the others; for STALL seconds, it gives up. */
const REPLAN = 1
const STALL = 4

/**
 * Where a walker steps this frame on its way to `at` (near enough within `reach` of it): its own
 * spot to wait a frame, or null when it is there or as near as it gets. While nothing solid is in
 * the line it heads straight for the goal; else it follows a way planned round the solid things
 * (path.ts), cutting corners it can see past, and plans again when the goal has moved. It steps
 * round other actors as it goes, and when they keep it from getting on for a second it plans
 * round them too. On the last stretch it stops when no step brings it nearer: against a thing
 * the goal is in or behind, at the room's edge, or beside a crowd standing where it means to go.
 */
function steer(rt: Runtime, a: Actor, goal: Actor | Item | null, walk: Walk, at: Point, reach: number, me: number, step: number, speed: number, solids: Solid[]): Point | null {
  const w = rt.sim.world
  // What is solid for it: not what it rides or can step onto. The goal stays in the list, skipped, so the field is the same for every goal.
  const things: Circle[] = []
  let skip = -1
  for (const s of solids) {
    if (s.item.rider === a.id || s.top <= a.y + 0.3) continue
    if (s.item === goal) skip = things.length
    things.push({ x: s.x, z: s.z, r: s.r })
  }
  const others: Circle[] = []
  const moving: boolean[] = []
  for (const b of w.actors) {
    if (b === a || b === goal || b.riding !== null) continue
    others.push({ x: b.x, z: b.z, r: proportions(b.look).radius * b.scale })
    moving.push((walkedIn.get(b) ?? -Infinity) >= w.frame - 1)
  }
  const lim = ROOM_HALF - Math.min(me, 1)
  const p = { x: a.x, z: a.z }
  let aim = at
  let last = true
  // Heading straight, it keeps on while the line is clear at all; following a way, it heads straight only once the line is well clear: no flickering between the two.
  if (walk.roundOthers || !clearLine(things, skip, me, p, at, walk.around, walk.way === null ? 0.005 : MARGIN)) {
    const moved = walk.way !== null && Math.hypot(at.x - walk.planX, at.z - walk.planZ) > 0.75
    if (walk.roundOthers || (walk.way === null ? w.t - walk.planned >= 0.1 : moved && w.t - walk.planned >= 0.25)) plan(walk, things, skip, others, moving, me, lim, p, at, reach, speed, w.t)
    const way = walk.way
    // No way (planned a moment ago, or nowhere to stand): it heads for the goal, and only the clock stops it.
    if (way === null) last = false
    else if (!walk.final) {
      for (let n = 0; n < 2 && walk.next < way.length - 1 && clearLine(things, skip, me, p, way[walk.next + 1]!, walk.around); n++) walk.next++
      if (walk.next < way.length - 1 && Math.hypot(way[walk.next]!.x - p.x, way[walk.next]!.z - p.z) < 0.15) walk.next++
      const end = way[way.length - 1]!
      walk.final = walk.next === way.length - 1 && Math.hypot(end.x - p.x, end.z - p.z) < 0.3
      if (!walk.final) {
        aim = way[walk.next]!
        last = false
      }
    }
  } else if (walk.way !== null) {
    // In plain sight now: the way is done with, and a new one is planned from here if the goal goes out of sight again.
    walk.way = null
    walk.around = []
    walk.final = false
  }
  let dx = aim.x - p.x
  let dz = aim.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-9) return null
  dx /= d
  dz /= d
  const q = nextStep(p.x, p.z, dx, dz, step, me, things, skip, others, lim, walk.side)
  if (q !== null) walk.side = q.side
  const togo = Math.hypot(at.x - p.x, at.z - p.z)
  const after = q === null ? togo : Math.hypot(at.x - q.x, at.z - q.z)
  if (!last) {
    walk.nearest = Infinity
    walk.stuck = 0
  } else if (after < Math.min(walk.nearest, togo) - 0.2 * step) {
    walk.nearest = after
    walk.stuck = 0
  } else if (++walk.stuck >= 6) {
    // On the last stretch and no nearer for a moment: what stands in the straight way decides. A
    // thing the goal is in or behind, or the room's edge: as near as it gets. Someone passing: a
    // moment's wait. Others standing: a way round them if it leads nearer; else as near as they allow.
    const b = blocker(p.x, p.z, (at.x - p.x) / togo, (at.z - p.z) / togo, step, me, things, skip, others, lim)
    if (b === null || b.kind !== 'actor') return null
    if (!moving[b.index] || walk.stuck >= 36) {
      walk.roundOthers = true
      plan(walk, things, skip, others, moving, me, lim, p, at, reach, speed, w.t)
      const end = walk.way?.[walk.way.length - 1]
      if (end === undefined || Math.hypot(at.x - end.x, at.z - end.z) > togo - 0.3) return null
      walk.stuck = 0
    }
  }
  // How it gets on, as the way left to the goal's middle (the same measure straight or round): a plan sets a new mark to get nearer than, and the clock runs on through plans.
  const end = walk.way?.[walk.way.length - 1]
  const left = last || end === undefined ? togo : Math.hypot(aim.x - p.x, aim.z - p.z) + walk.rest[walk.next]! + Math.hypot(at.x - end.x, at.z - end.z)
  if (walk.left === Infinity) walk.left = left
  else if (left < walk.left - 0.05) {
    walk.left = left
    walk.leftAt = w.t
  } else if (w.t - walk.leftAt > REPLAN && w.t - walk.planned > REPLAN) walk.roundOthers = true
  if (w.t - walk.leftAt > STALL || w.t > walk.until) return null
  return q ?? p
}

/** Plans the walk's way to `at`; round the other actors too when they stood in its way (those standing, and any close by). */
function plan(walk: Walk, things: Circle[], skip: number, others: Circle[], moving: boolean[], me: number, lim: number, p: Point, at: Point, reach: number, speed: number, t: number) {
  const extra = walk.roundOthers ? others.filter((b, k) => !moving[k] || Math.hypot(b.x - p.x, b.z - p.z) < b.r + me + 1.5) : []
  const way = findWay(fieldFor(things), { from: p, to: at, reach, me, skip, lim, extra })
  Object.assign(walk, { planned: t, roundOthers: false, around: extra, planX: at.x, planZ: at.z, left: Infinity, next: 0, final: false, way: way?.points ?? null, rest: [] })
  if (way === null) return
  const pts = way.points
  walk.rest = new Array<number>(pts.length).fill(0)
  for (let k = pts.length - 2; k >= 0; k--) walk.rest[k] = walk.rest[k + 1]! + Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.z - pts[k]!.z)
  walk.until = Math.min(walk.start + 50, Math.max(walk.until, t + 4 + (SLACK * way.length) / speed))
}

/** Legs and empty arms swinging in step; animals trot. */
function walkCycle(a: Actor, pr: Proportions, run: boolean) {
  const s = Math.sin(a.stride)
  const amp = run ? 0.9 : 0.6
  const p = a.pose
  if (pr.animal) {
    p.armL.swing = p.legR.swing = amp * s
    p.armR.swing = p.legL.swing = -amp * s
    p.tail = 0.35 * Math.sin(a.stride * 2)
    p.bob = 0.015 * Math.abs(Math.cos(a.stride))
    return
  }
  p.legL.swing = amp * s
  p.legR.swing = -amp * s
  p.legL.bend = (run ? 0.3 : 0.12) + (run ? 0.9 : 0.4) * Math.max(0, s)
  p.legR.bend = (run ? 0.3 : 0.12) + (run ? 0.9 : 0.4) * Math.max(0, -s)
  for (const [hand, arm, sign] of [['left', p.armL, -1], ['right', p.armR, 1]] as const) {
    if (a.hands[hand] !== null) continue
    arm.swing = sign * amp * 0.8 * s
    arm.bend = run ? 1.3 : 0.3
    arm.raise += (0.05 - arm.raise) * 0.2
  }
  p.bob = (run ? 0.05 : 0.025) * Math.abs(Math.cos(a.stride))
  p.lean += ((run ? 0.2 : 0.05) - p.lean) * 0.2
}

/** Down to what is under it, or up out of the ground. */
function* fall(rt: Runtime, a: Actor): Anim {
  let vy = 0
  for (let i = 0; i < 600 && a.riding === null; i++) {
    const ground = rt.groundUnder(a)
    if (a.y <= ground) {
      a.y = ground
      return
    }
    vy -= GRAVITY * STEP
    a.y = Math.max(ground, a.y + vy * STEP)
    yield
  }
}

const TAKE_OFF_ORDER: readonly Slot[] = ['head', 'face', 'hand', 'back', 'body', 'hair']

let actorOf: (h: ActorHandle) => Actor
let itemOf: (h: ItemHandle) => Item

// ------------------------------------------------------------------------------ actors

class ActorHandle implements ActorApi {
  readonly #rt: Runtime
  readonly #a: Actor
  static {
    actorOf = (h) => h.#a
  }

  constructor(rt: Runtime, a: Actor) {
    this.#rt = rt
    this.#a = a
  }

  /** Moving another actor makes it take part in the action now running. */
  #join() {
    this.#rt.join(this.#a)
  }

  get isActor(): true {
    return true
  }
  get id(): string {
    return this.#a.id
  }
  get name(): string {
    return this.#a.name
  }
  set name(v: unknown) {
    // Only words (or a number): a missing arg must not rename anyone 'null'.
    if (typeof v !== 'string' && !isNum(v)) return
    const name = String(v).replace(/\s+/g, ' ').trim().slice(0, 24)
    if (name === '' || name.toLowerCase() === this.#a.name.toLowerCase()) return
    this.#a.name = name
    // A name the child gave stays in both languages.
    this.#a.names = null
    const call = name.toLowerCase()
    if (!this.#a.calls.includes(call)) this.#a.calls.push(call)
  }
  get kind() {
    return this.#a.look.body
  }
  get height(): number {
    return this.#a.look.height * this.#a.scale
  }
  get radius(): number {
    return proportions(this.#a.look).radius * this.#a.scale
  }
  get x(): number {
    return this.#a.x
  }
  set x(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.x = clamp(v, -ROOM_HALF, ROOM_HALF)
  }
  get y(): number {
    return this.#a.y
  }
  set y(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.y = clamp(v, -2, 30)
  }
  get z(): number {
    return this.#a.z
  }
  set z(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.z = clamp(v, -ROOM_HALF, ROOM_HALF)
  }
  get yaw(): number {
    return this.#a.yaw
  }
  set yaw(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    // Riding, the rider faces where its seat does: turning it turns what it rides.
    const ridden = this.#rt.steered(this.#a)
    if (ridden !== null) ridden.yaw += turnBetween(this.#a.yaw, v)
    this.#a.yaw = v
  }
  get pitch(): number {
    return this.#a.pitch
  }
  set pitch(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.pitch = v
  }
  get roll(): number {
    return this.#a.roll
  }
  set roll(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.roll = v
  }
  get scale(): number {
    return this.#a.scale
  }
  set scale(v: unknown) {
    if (!isNum(v)) return
    this.#join()
    this.#a.scale = clamp(v, 0.2, 4)
  }
  get pose(): Pose {
    this.#join()
    return this.#a.pose
  }
  /** Setting the whole pose sets the joints given. */
  set pose(v: unknown) {
    this.#join()
    for (const t of poseTargets(v)) writeJoint(this.#a.pose, t, t.to)
  }
  get look(): Look {
    return this.#a.look
  }
  /** Setting the whole look sets the fields given; the sim puts back what does not fit. */
  set look(v: unknown) {
    if (!isObject(v)) return
    const look = this.#a.look as unknown as Loose
    for (const k of Object.keys(v)) if (k in look) look[k] = v[k]
  }
  get riding(): ItemApi | null {
    return this.#a.riding === null ? null : this.#rt.itemById(this.#a.riding)
  }
  /** Doing something of its own, or told something else since the action asking took it in. */
  get busy(): boolean {
    return this.#a.doing !== null || this.#rt.sim.reacting(this.#a.id) || this.#rt.left(this.#a)
  }

  /** The bubble shows the words in the game's language, picked now: what shows next follows a change of language. */
  say(words: unknown, secs?: unknown): void {
    const a = this.#a
    const t = lineOf(words, this.#rt.sim.world.lang).slice(0, 48)
    a.bubble = t === '' ? null : { text: t, until: this.#rt.sim.world.t + clamp(num(secs, 2), 0.3, 12) }
  }

  speak(words: unknown, secs?: unknown): void {
    const a = this.#a
    const rt = this.#rt
    const side = rt.sim.side
    // Said in full: the bubble shows only the start of a long line.
    const line = lineOf(words, rt.sim.world.lang).slice(0, 200)
    this.say(line, secs)
    // A loop full of lines says one or two a frame from each actor, and a few in all. The line
    // this step is saying is not started again until it is over: said every frame, it would be
    // cut off every frame and never heard.
    const mine = side.spoken.get(a.id) ?? 0
    const was = side.voiced.get(a.id)
    if (a.bubble === null || mine >= 2 || side.speeches >= 8 || (was !== undefined && was.text === line && was.doing === a.doing && rt.sim.world.t < was.until)) return
    side.voiced.set(a.id, { text: line, until: a.bubble.until, doing: a.doing })
    rt.sim.world.speech.push({ actor: a.id, text: line })
    side.speeches++
    side.spoken.set(a.id, mine + 1)
  }

  feel(mood: unknown, secs?: unknown): void {
    this.#a.mood = moodName(mood)
    this.#a.moodUntil = this.#rt.sim.world.t + clamp(num(secs, 3), 0.3, 30)
  }

  holding(hand?: unknown): ItemApi | null {
    const a = this.#a
    const id = hand === 'left' || hand === 'right' ? a.hands[hand] : (a.hands.right ?? a.hands.left)
    return id === null ? null : this.#rt.itemById(id)
  }

  handAt(hand?: unknown): Spot & { y: number } {
    const p = handFrame(this.#a, hand === 'left' ? 'left' : 'right').p
    return { x: p[0], y: p[1], z: p[2] }
  }

  headAt(): Spot & { y: number } {
    const p = headFrame(this.#a).p
    return { x: p[0], y: p[1], z: p[2] }
  }

  ahead(dist: unknown, side?: unknown): Spot {
    const a = this.#a
    const d = num(dist, 1)
    const s = num(side, 0)
    const p = insideRoom(a.x + Math.sin(a.yaw) * d + Math.cos(a.yaw) * s, a.z + Math.cos(a.yaw) * d - Math.sin(a.yaw) * s, 0.3)
    return { x: p.x, z: p.z }
  }

  *walkTo(target: unknown, opts?: unknown): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    const o = isObject(opts) ? opts : {}
    const near = clamp(num(o.near, 0.6), 0, 30)
    const run = o.run === true
    const goal = rt.thing(target)
    if (rt.spot(target) === null) {
      yield
      return
    }
    yield* this.#upright()
    const w = rt.sim.world
    const pr = proportions(a.look)
    const walk: Walk = { way: null, rest: [], next: 0, final: false, planX: 0, planZ: 0, planned: -Infinity, roundOthers: false, around: [], side: 1, left: Infinity, leftAt: w.t, nearest: Infinity, stuck: 0, start: w.t, until: Infinity }
    let walked = 0
    for (;;) {
      const at = rt.spot(target)
      if (at === null) break
      const me = pr.radius * a.scale
      const reach = goal === null || goal === a ? 0 : rt.radiusOf(goal) + me
      const dist = Math.hypot(at.x - a.x, at.z - a.z)
      if (dist - reach <= near) break
      const solids = solidsOf(w, rt.sim.library)
      const wading = inWater(w.room, a.x, a.z)
      const pace = (run ? 2 : 1) * (wading ? 0.6 : 1)
      const speed = a.speed * pace * Math.sqrt(a.scale)
      if (walked === 0) walk.until = w.t + clamp(4 + (SLACK * (dist - reach - near)) / speed, 12, 50)
      const step = Math.min(speed * STEP, dist - reach - near + 0.01)
      const to = steer(rt, a, goal, walk, at, reach + near, me, step, speed, solids)
      if (to === null) break
      const p = insideRoom(to.x, to.z, Math.min(me, 1))
      const mx = p.x - a.x
      const mz = p.z - a.z
      if (mx * mx + mz * mz > 1e-8) {
        a.yaw += clamp(turnBetween(a.yaw, Math.atan2(mx, mz)), -10 * STEP, 10 * STEP)
        a.stride += Math.PI * 2.4 * pace * STEP
        walkedIn.set(a, w.frame)
      }
      a.x = p.x
      a.z = p.z
      a.y += clamp(rt.standAt(a, solids) - a.y, -3 * STEP, 3 * STEP)
      walkCycle(a, pr, run)
      walked++
      yield
    }
    if (walked === 0) {
      yield
      return
    }
    // Feet together again; the empty arms down.
    const from = copyPose(a.pose)
    const rest = restFor(a, null)
    const to = copyPose(a.pose)
    to.legL = rest.legL
    to.legR = rest.legR
    to.bob = 0
    to.lean = 0
    if (pr.animal) {
      to.armL = rest.armL
      to.armR = rest.armR
      to.tail = 0
    } else {
      if (a.hands.left === null) to.armL = rest.armL
      if (a.hands.right === null) to.armR = rest.armR
    }
    for (let i = 1, n = frames(0.15); i <= n; i++) {
      lerpPose(a.pose, from, to, ease(i / n))
      yield
    }
  }

  *turnTo(target: unknown): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    // Riding, it turns what it rides and goes round with it; sitting on something, it does not turn.
    if (a.riding !== null && rt.steered(a) === null) {
      yield
      return
    }
    for (let i = 0; i < 120; i++) {
      const at = rt.spot(target)
      const d = at === null || (at.x - a.x) ** 2 + (at.z - a.z) ** 2 < 1e-6 ? 0 : turnBetween(a.yaw, Math.atan2(at.x - a.x, at.z - a.z))
      const turn = clamp(d, -6 * STEP, 6 * STEP)
      const ridden = rt.steered(a)
      if (ridden !== null) ridden.yaw += turn
      else if (a.riding !== null) return
      a.yaw += turn
      yield
      if (Math.abs(d) <= 6 * STEP) return
    }
  }

  *pickUp(item: unknown, hand?: unknown): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    const it = rt.liveItem(item)
    if (it === null || it.holder?.actor === a.id) {
      yield
      return
    }
    const info = rt.sim.library.info(it.kind)
    if (info.recipe.meta.carry === 'no' || (it.rider !== null && it.rider !== a.id)) {
      yield* this.#cannot(info.recipe.meta.carry === 'no' ? TOO_BIG : HMM)
      return
    }
    yield* this.walkTo(it, { near: 0.2 })
    const pr = proportions(a.look)
    const gap = () => Math.hypot(it.x - a.x, it.z - a.z) - rt.radiusOf(it) - pr.radius * a.scale
    if (!rt.alive(it) || it.rider !== null || gap() > 0.7) {
      yield* this.#cannot(HMM)
      return
    }
    yield* this.turnTo(it)
    const hug = info.recipe.meta.carry === 'hug' && !pr.animal
    const want: Hand | null = hand === 'left' || hand === 'right' ? hand : null
    const side = rt.handFor(a, want)
    const middle = it.y + ((info.recipe.bounds.min[1] + info.recipe.bounds.max[1]) / 2) * it.scale - a.y
    const low = clamp(1 - middle / (pr.shoulderY * a.scale), 0, 1)
    const arm = { swing: 0.7 + 0.5 * low, raise: hug ? 0.35 : 0.1, bend: 0.15 }
    const reach: PoseChange = pr.animal
      ? { head: { nod: 0.2 + 0.6 * low } }
      : hug
        ? { lean: 0.2 + 0.5 * low, armL: arm, armR: arm }
        : { lean: 0.15 + 0.55 * low, [side === 'left' ? 'armL' : 'armR']: arm }
    yield* this.poseTo(reach, 0.2)
    if (!rt.alive(it) || (it.rider !== null && it.rider !== a.id)) {
      yield* this.#cannot(HMM)
      return
    }
    rt.grab(a, it, want)
    yield* this.poseTo(restFor(a, rt.seat(a)), 0.22)
  }

  /** A little shrug and a word, when something cannot be done. */
  *#cannot(words: Words): Anim {
    this.say(words, 1.5)
    this.feel('surprised', 1.5)
    const palms = { swing: 0.35, raise: 0.55, bend: 1.5 }
    yield* this.poseTo(proportions(this.#a.look).animal ? { head: { tilt: 0.4 } } : { head: { tilt: 0.3 }, armL: palms, armR: palms }, 0.25)
    yield* this.rest(0.3)
  }

  drop(hand?: unknown): ItemApi | null {
    const rt = this.#rt
    const a = this.#a
    const h: Hand = hand === 'left' || hand === 'right' ? hand : a.hands.right !== null ? 'right' : 'left'
    const id = a.hands[h]
    if (id === null) return null
    const it = rt.sim.side.items.get(id)
    if (it === undefined) {
      a.hands[h] = null
      return null
    }
    rt.letGo(a, it)
    return rt.item(it)
  }

  *jump(height?: unknown, forward?: unknown): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    const h = clamp(num(height, 0.6), 0, 8)
    const f = clamp(num(forward, 0), -8, 8)
    yield* this.#upright()
    if (h < 0.02 && Math.abs(f) < 0.02) {
      yield
      return
    }
    const bendL = a.pose.legL.bend
    const bendR = a.pose.legR.bend
    yield* this.poseTo({ squash: 0.8, legL: { bend: bendL + 0.5 }, legR: { bend: bendR + 0.5 } }, 0.1)
    const pr = proportions(a.look)
    const vy0 = Math.sqrt(2 * GRAVITY * Math.max(h, 0.05))
    const vh = f / ((2 * vy0) / GRAVITY)
    const sx = Math.sin(a.yaw)
    const sz = Math.cos(a.yaw)
    let vy = vy0
    for (let t = 0; ; t += STEP) {
      a.y += vy * STEP - 0.5 * GRAVITY * STEP * STEP
      vy -= GRAVITY * STEP
      const p = insideRoom(a.x + sx * vh * STEP, a.z + sz * vh * STEP, pr.radius * a.scale)
      a.x = p.x
      a.z = p.z
      a.pose.squash = 1 + 0.12 * clamp(vy / vy0, -1, 1)
      a.pose.legL.bend += (bendL - a.pose.legL.bend) * 0.3
      a.pose.legR.bend += (bendR - a.pose.legR.bend) * 0.3
      const ground = rt.groundUnder(a)
      if ((vy < 0 && a.y <= ground) || t > 6) {
        a.y = ground
        break
      }
      yield
    }
    rt.pushOut(a)
    yield* this.poseTo({ squash: 0.82, legL: { bend: bendL + 0.4 }, legR: { bend: bendR + 0.4 } }, 0.07)
    yield* this.poseTo({ squash: 1, legL: { bend: bendL }, legR: { bend: bendR } }, 0.12)
  }

  *poseTo(change: unknown, secs?: unknown): Anim {
    const a = this.#a
    this.#join()
    const targets = poseTargets(change)
    const from = targets.map((t) => readJoint(a.pose, t))
    for (let i = 1, n = frames(clamp(num(secs, 0.3), 0, 30)); i <= n; i++) {
      const k = ease(i / n)
      targets.forEach((t, j) => writeJoint(a.pose, t, from[j]! + (t.to - from[j]!) * k))
      yield
    }
  }

  *rest(secs?: unknown): Anim {
    const a = this.#a
    this.#join()
    const from = copyPose(a.pose)
    const pitch = a.pitch
    const roll = a.roll
    for (let i = 1, n = frames(clamp(num(secs, 0.3), 0, 10)); i <= n; i++) {
      const k = ease(i / n)
      lerpPose(a.pose, from, restFor(a, this.#rt.seat(a)), k)
      if (a.riding === null) {
        a.pitch = pitch * (1 - k)
        a.roll = roll * (1 - k)
      }
      yield
    }
  }

  *ride(item: unknown): Anim {
    yield* this.#mount(item, 'ride')
  }

  *sitOn(item: unknown): Anim {
    if (item !== null && item !== undefined) {
      yield* this.#mount(item, 'sit')
      return
    }
    const a = this.#a
    this.#join()
    if (a.riding !== null) yield* this.getOff()
    const pr = proportions(a.look)
    const back = { swing: -0.45, raise: 0.25, bend: 0.1 }
    const ground: PoseChange = pr.animal
      ? { lean: -0.35, bob: -0.06, legL: { swing: -0.9, bend: 1.7 }, legR: { swing: -0.9, bend: 1.7 }, tail: 0.3 }
      : {
          lean: -0.1,
          bob: -(pr.hipY - 0.04),
          legL: { swing: 1.45, raise: 0.12, bend: 0.12 },
          legR: { swing: 1.45, raise: 0.12, bend: 0.12 },
          ...(a.hands.left === null ? { armL: back } : {}),
          ...(a.hands.right === null ? { armR: back } : {}),
        }
    yield* this.poseTo(ground, 0.35)
  }

  /** Walks to a thing and hops onto its 'seat'. */
  *#mount(target: unknown, seat: Seat): Anim {
    const rt = this.#rt
    const a = this.#a
    const side = rt.sim.side
    this.#join()
    const it = rt.liveItem(target)
    if (it === null) {
      yield
      return
    }
    if (a.riding === it.id) {
      side.seats.set(a.id, seat)
      yield* this.poseTo(restFor(a, seat), 0.25)
      return
    }
    if (a.riding !== null) yield* this.getOff()
    if (it.holder?.actor === a.id) rt.letGo(a, it)
    yield* this.walkTo(it, { near: 0.15 })
    if (!rt.alive(it) || Math.hypot(it.x - a.x, it.z - a.z) - rt.radiusOf(it) - rt.radiusOf(a) > 0.8) {
      yield* this.#cannot(HMM)
      return
    }
    if (it.rider !== null && it.rider !== a.id) {
      const other = side.actors.get(it.rider)
      if (other !== undefined) rt.dismount(other)
    }
    rt.release(it)
    it.loose = false
    it.vx = it.vy = it.vz = it.spin = 0
    side.placed.set(it.id, rt.sim.world.t)
    a.riding = it.id
    it.rider = a.id
    side.seats.set(a.id, seat)
    side.hopping.add(a.id)
    const from = { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, roll: a.roll }
    const pose = copyPose(a.pose)
    const info = rt.sim.library.info(it.kind)
    for (let i = 1, n = frames(0.3); i <= n; i++) {
      const k = ease(i / n)
      const s = seatedRoot(a, it, info)
      a.x = lerp(from.x, s.x, k)
      a.z = lerp(from.z, s.z, k)
      a.y = lerp(from.y, s.y, k) + Math.sin(k * Math.PI) * 0.3 * a.scale
      a.yaw = from.yaw + turnBetween(from.yaw, s.yaw) * k
      a.pitch = lerp(from.pitch, s.pitch, k)
      a.roll = lerp(from.roll, s.roll, k)
      lerpPose(a.pose, pose, restFor(a, seat), k)
      yield
      if (a.riding !== it.id) return
    }
    side.hopping.delete(a.id)
  }

  *getOff(): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    if (a.riding === null) {
      if (isLying(a) || isDown(a)) yield* this.#standUp()
      else yield
      return
    }
    const it = rt.sim.side.items.get(a.riding)
    const spot = it === undefined ? { x: a.x, z: a.z } : rt.besideSpot(a, it)
    rt.unseat(a)
    const from = { x: a.x, y: a.y, z: a.z, pitch: a.pitch, roll: a.roll }
    const pose = copyPose(a.pose)
    const w = rt.sim.world
    const ground = restHeight(w, a, spot.x, spot.z, groundAt(w.room, spot.x, spot.z))
    for (let i = 1, n = frames(0.3); i <= n; i++) {
      const k = ease(i / n)
      a.x = lerp(from.x, spot.x, k)
      a.z = lerp(from.z, spot.z, k)
      a.y = lerp(from.y, ground, k) + Math.sin(k * Math.PI) * 0.2 * a.scale
      a.pitch = from.pitch * (1 - k)
      a.roll = from.roll * (1 - k)
      lerpPose(a.pose, pose, restFor(a, null), k)
      yield
    }
  }

  *#standUp(): Anim {
    yield* this.rest(0.3)
    yield* fall(this.#rt, this.#a)
  }

  /** Off what it rides, up from lying or sitting: ready to walk or jump. */
  *#upright(): Anim {
    const a = this.#a
    if (a.riding !== null) yield* this.getOff()
    else if (isLying(a) || isDown(a)) yield* this.#standUp()
  }

  wear(item: unknown, slot?: unknown): void {
    const rt = this.#rt
    const a = this.#a
    const it = rt.liveItem(item)
    if (it === null) return
    const s: Slot = SLOTS.includes(slot as Slot) ? (slot as Slot) : (rt.sim.library.info(it.kind).recipe.meta.wear ?? 'hand')
    // What was worn there goes in a sparkle: old hair lying at the feet looked like a mistake.
    if (a.look.worn[s] !== undefined) {
      const p = s === 'body' ? bodyCenter(a) : s === 'back' ? backFrame(a).p : s === 'hand' ? handFrame(a, 'right').p : headFrame(a).p
      addPuffs(rt.sim.world, { kind: 'spark', x: p[0]!, y: p[1]!, z: p[2]!, color: null, count: 10, size: 0.12, speed: 1.4, up: 0.6, life: 0.7, gravity: 0 })
    }
    // A worn wand fills the right hand: what that hand held goes to the left one, or falls. The
    // thing put on leaves the hand that held it first, so a wand worn from the left hand makes room there.
    rt.release(it)
    if (s === 'hand') rt.freeRightHand(a, it)
    a.look.worn[s] = { kind: it.kind, tint: it.tint }
    // It leaves the room but goes on as the slot's stand-in: its process runs and this handle stays live.
    rt.sim.wearItem(a, s, it)
  }

  takeOff(slot: unknown): ItemApi | null {
    const a = this.#a
    // No slot given: a hat or glasses before the hair.
    const s = SLOTS.includes(slot as Slot) ? (slot as Slot) : TAKE_OFF_ORDER.find((k) => a.look.worn[k] !== undefined)
    if (s === undefined || a.look.worn[s] === undefined) return null
    return this.#rt.item(this.#rt.dropWorn(a, s))
  }

  *tumble(): Anim {
    const rt = this.#rt
    const a = this.#a
    this.#join()
    if (a.riding !== null) rt.dismount(a)
    rt.sound('bonk')
    this.feel('surprised', 2)
    const pr = proportions(a.look)
    const from = copyPose(a.pose)
    const flat = restFor(a, null)
    if (!pr.animal) {
      if (a.hands.left === null) flat.armL = { swing: 2.6, raise: 0.6, bend: 0.2 }
      if (a.hands.right === null) flat.armR = { swing: 2.6, raise: 0.6, bend: 0.2 }
      flat.legL = { swing: 0.6, raise: 0.2, bend: 0.3 }
      flat.legR = { swing: 0.3, raise: 0.2, bend: 0.5 }
    }
    const pitch = a.pitch
    const y = a.y
    for (let i = 1, n = frames(0.3); i <= n; i++) {
      const k = ease(i / n)
      a.pitch = lerp(pitch, -1.45, k)
      a.y = y + Math.sin(k * Math.PI) * 0.15 * a.scale + k * pr.torsoD * 0.5 * a.scale
      lerpPose(a.pose, from, flat, k)
      yield
    }
    const head = headFrame(a).p
    addPuffs(rt.sim.world, { kind: 'star', x: head[0], y: head[1] + 0.15, z: head[2], color: null, count: 6, size: 0.12, speed: 1.2, up: 0.8, life: 0.8, gravity: 0 })
    yield* rt.api.wait(0.5)
    yield* this.rest(0.4)
    yield* fall(rt, a)
    this.feel('silly', 1.5)
  }
}
Object.freeze(ActorHandle.prototype)

/** A joint poseTo can move: a number of the pose, or of its head or a limb. */
interface JointTarget {
  group: 'head' | (typeof LIMBS)[number] | null
  key: string
  to: number
}

function poseTargets(change: unknown): JointTarget[] {
  if (!isObject(change)) return []
  const out: JointTarget[] = []
  for (const key of POSE_NUMBERS) if (isNum(change[key])) out.push({ group: null, key, to: change[key] })
  const head = change.head
  if (isObject(head)) for (const key of HEAD_KEYS) if (isNum(head[key])) out.push({ group: 'head', key, to: head[key] })
  for (const limb of LIMBS) {
    const l = change[limb]
    if (isObject(l)) for (const key of LIMB_KEYS) if (isNum(l[key])) out.push({ group: limb, key, to: l[key] })
  }
  return out
}

const readJoint = (pose: Pose, t: JointTarget): number => num(((t.group === null ? pose : pose[t.group]) as unknown as Record<string, unknown>)[t.key], 0)
const writeJoint = (pose: Pose, t: JointTarget, v: number) => {
  ;((t.group === null ? pose : pose[t.group]) as unknown as Record<string, number>)[t.key] = v
}

// ------------------------------------------------------------------------------ items

class ItemHandle implements ItemApi {
  readonly #rt: Runtime
  readonly #it: Item
  static {
    itemOf = (h) => h.#it
  }

  constructor(rt: Runtime, it: Item) {
    this.#rt = rt
    this.#it = it
  }

  /** Code put it somewhere: it stays put while code keeps moving it, and falls if left in the air. */
  #placed() {
    const it = this.#it
    if (it.holder !== null || it.fixed) return
    it.loose = false
    it.vx = it.vy = it.vz = it.spin = 0
    this.#rt.sim.side.placed.set(it.id, this.#rt.sim.world.t)
  }

  /** No speed for a thing that is not flying changes nothing: code that just put it somewhere (a catch) keeps it there, and a held thing stays held. */
  #still(v: number): boolean {
    return v === 0 && !this.#it.loose
  }

  /** Code gave it a speed: it flies. */
  #fly() {
    const it = this.#it
    if (it.holder !== null) this.#rt.release(it)
    it.fixed = false
    if (!it.loose) this.#rt.setLoose(it, this.#rt.current)
  }

  #touch() {
    const side = this.#rt.sim.side
    side.exposed.add(this.#it.id)
    side.touched.add(this.#it.id)
  }

  get isActor(): false {
    return false
  }
  get id(): string {
    return this.#it.id
  }
  get kind(): string {
    return this.#it.kind
  }
  /** In the game's language: 'ball', or 'pallo' in Finnish. */
  get name(): string {
    const info = this.#rt.sim.library.info(this.#it.kind)
    return this.#rt.sim.world.lang === 'fi' ? info.nameFi : info.name
  }
  get x(): number {
    return this.#it.x
  }
  set x(v: unknown) {
    if (!isNum(v) || v === this.#it.x) return
    this.#it.x = clamp(v, -ROOM_HALF, ROOM_HALF)
    this.#placed()
  }
  get y(): number {
    return this.#it.y
  }
  set y(v: unknown) {
    if (!isNum(v) || v === this.#it.y) return
    this.#it.y = clamp(v, -2, 30)
    this.#placed()
  }
  get z(): number {
    return this.#it.z
  }
  set z(v: unknown) {
    if (!isNum(v) || v === this.#it.z) return
    this.#it.z = clamp(v, -ROOM_HALF, ROOM_HALF)
    this.#placed()
  }
  get yaw(): number {
    return this.#it.yaw
  }
  set yaw(v: unknown) {
    if (isNum(v)) this.#it.yaw = v
  }
  get pitch(): number {
    return this.#it.pitch
  }
  set pitch(v: unknown) {
    if (isNum(v)) this.#it.pitch = v
  }
  get roll(): number {
    return this.#it.roll
  }
  set roll(v: unknown) {
    if (isNum(v)) this.#it.roll = v
  }
  get scale(): number {
    return this.#it.scale
  }
  set scale(v: unknown) {
    if (isNum(v)) this.#it.scale = clamp(v, 0.2, 4)
  }
  get vx(): number {
    return this.#it.vx
  }
  set vx(v: unknown) {
    if (!isNum(v) || this.#still(v)) return
    this.#fly()
    this.#it.vx = clamp(v, -40, 40)
  }
  get vy(): number {
    return this.#it.vy
  }
  set vy(v: unknown) {
    if (!isNum(v) || this.#still(v)) return
    this.#fly()
    this.#it.vy = clamp(v, -40, 40)
  }
  get vz(): number {
    return this.#it.vz
  }
  set vz(v: unknown) {
    if (!isNum(v) || this.#still(v)) return
    this.#fly()
    this.#it.vz = clamp(v, -40, 40)
  }
  get size(): { w: number; h: number; d: number } {
    const [w, h, d] = this.#rt.sim.library.info(this.#it.kind).size
    const s = this.#it.scale
    return { w: w * s, h: h * s, d: d * s }
  }
  get radius(): number {
    return this.#rt.sim.library.info(this.#it.kind).radius * this.#it.scale
  }
  get holder(): ActorApi | null {
    const h = this.#it.holder
    return h === null ? null : this.#rt.actorById(h.actor)
  }
  get rider(): ActorApi | null {
    return this.#it.rider === null ? null : this.#rt.actorById(this.#it.rider)
  }
  get wearer(): ActorApi | null {
    const w = this.#rt.sim.side.wearerOf(this.#it)
    return w === null ? null : this.#rt.actorById(w.actor)
  }
  get fixed(): boolean {
    return this.#it.fixed
  }
  get flying(): boolean {
    return this.#it.loose && !this.#rt.sim.side.grounded.has(this.#it.id)
  }
  get tint(): string | null {
    return this.#it.tint
  }
  set tint(v: unknown) {
    if (v === null || v === undefined || v === '') this.#it.tint = null
    else this.#it.tint = parseColor(v) ?? this.#it.tint
    // A worn thing's colour is its wearer's look.
    const wearer = this.#rt.sim.side.wearerOf(this.#it)
    const worn = wearer === null ? undefined : this.#rt.sim.side.actors.get(wearer.actor)?.look.worn[wearer.slot]
    if (worn !== undefined) worn.tint = this.#it.tint
  }
  get state(): Record<string, number> {
    this.#touch()
    return this.#it.state
  }
  /** Setting the whole state keeps its numbers. */
  set state(v: unknown) {
    this.#touch()
    if (isObject(v)) for (const k of Object.keys(v)) if (isNum(v[k])) this.#it.state[k] = v[k]
  }

  part(name: unknown): { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number } {
    const it = this.#it
    const n = String(name)
    if (!this.#rt.sim.library.info(it.kind).recipe.parts.some((p) => p.name === n || p.pose === n)) return restPart()
    this.#touch()
    return (it.parts[n] ??= restPart())
  }

  anchor(name: unknown): Spot & { y: number } {
    const p = anchorPoint(this.#it, this.#rt.sim.library.info(this.#it.kind), String(name))
    return { x: p[0], y: p[1], z: p[2] }
  }
}
Object.freeze(ItemHandle.prototype)

// ------------------------------------------------------------------------------ the world

class WorldHandle implements WorldApi {
  readonly #rt: Runtime

  constructor(rt: Runtime) {
    this.#rt = rt
  }

  get t(): number {
    return this.#rt.sim.world.t
  }
  get dt(): number {
    return STEP
  }
  get room() {
    return this.#rt.sim.world.room
  }
  get size(): number {
    return ROOM_HALF
  }
  get actors(): ActorApi[] {
    return this.#rt.sim.world.actors.map((a) => this.#rt.actor(a))
  }
  get items(): ItemApi[] {
    return this.#rt.sim.world.items.map((it) => this.#rt.item(it))
  }

  find(kind: unknown, opts?: unknown): ItemApi | null {
    if (typeof kind !== 'string') return null
    const rt = this.#rt
    const o = isObject(opts) ? opts : {}
    const not = new Set((Array.isArray(o.not) ? o.not : [o.not]).map((v) => rt.thing(v)))
    const free = o.free === true
    const from = rt.spot(o.near) ?? rt.here() ?? { x: 0, z: 0 }
    const kinds = rt.kindsFor(kind)
    for (const fits of kinds) {
      let best: Item | null = null
      let bestD = Infinity
      for (const it of rt.sim.world.items) {
        if (!fits(it) || not.has(it) || (free && (it.holder !== null || it.rider !== null))) continue
        const d = (it.x - from.x) ** 2 + (it.z - from.z) ** 2
        if (d < bestD) {
          best = it
          bestD = d
        }
      }
      if (best !== null) return rt.item(best)
    }
    return null
  }

  actor(name: unknown): ActorApi | null {
    const a = this.#rt.actorFor(String(name))
    return a === null ? null : this.#rt.actor(a)
  }

  make(kind: unknown, opts?: unknown): ItemApi {
    const rt = this.#rt
    const sim = rt.sim
    const w = sim.world
    const word = typeof kind === 'string' && kind.trim() !== '' ? kind.trim() : 'mystery'
    const k = sim.library.items.has(word) ? word : (sim.library.itemKindFor(word) ?? kindWord(word))
    const r = sim.library.info(k).radius
    const o = isObject(opts) ? opts : {}
    const me = rt.current === null ? undefined : sim.side.actors.get(rt.current)
    let at: { x: number; z: number }
    const near = rt.thing(o.near)
    const nearSpot = rt.spot(o.near)
    if (near !== null) {
      const ra = rt.radiusOf(near)
      // Beside an item, on the side toward whoever makes it; in front of an actor.
      const toward = 'look' in near ? null : me
      const yaw = toward ? Math.atan2(toward.x - near.x, toward.z - near.z) : 'look' in near ? near.yaw : CAMERA_FACING
      at = { x: near.x + Math.sin(yaw) * (ra + r + 0.3), z: near.z + Math.cos(yaw) * (ra + r + 0.3) }
    } else if (nearSpot !== null) at = nearSpot
    else if (me !== undefined) {
      const d = proportions(me.look).radius * me.scale + r + 0.4
      at = { x: me.x + Math.sin(me.yaw) * d, z: me.z + Math.cos(me.yaw) * d }
    } else at = { x: 0, z: 0 }
    if (isNum(o.x)) at.x = o.x
    if (isNum(o.z)) at.z = o.z
    if (w.items.length >= MAX_ITEMS) {
      const old = w.items.find((it) => !it.fixed && it.holder === null && it.rider === null)
      if (old !== undefined) this.remove(rt.item(old))
    }
    const it = sim.makeItem(k, { x: at.x, z: at.z, yaw: isNum(o.yaw) ? o.yaw : CAMERA_FACING })
    if (isNum(o.y)) {
      it.y = clamp(o.y, -2, 30)
      it.loose = false
      sim.side.placed.set(it.id, w.t)
    }
    return rt.item(it)
  }

  remove(item: unknown): void {
    const rt = this.#rt
    const it = rt.liveItem(item)
    if (it === null) return
    const c = itemCentre(it, rt.sim.library.info(it.kind))
    addPuffs(rt.sim.world, { kind: 'smoke', x: c[0], y: c[1], z: c[2], color: '#ffffff', count: 10, size: 0.22, speed: 1.4, up: 0.6, life: 0.7, gravity: -0.3 })
    rt.sound('pop')
    rt.sim.removeItem(it.id)
  }

  throw(item: unknown, target: unknown, opts?: unknown): number {
    const rt = this.#rt
    const it = rt.liveItem(item)
    if (it === null) return 0
    const o = isObject(opts) ? opts : {}
    const speed = clamp(num(o.speed, 8), 1, 40)
    const arc = clamp(num(o.arc, 0.35), 0, 3)
    const by = it.holder?.actor ?? rt.current
    const info = rt.sim.library.info(it.kind)
    const from = itemCentre(it, info)
    let to = rt.centre(target)
    if (to === null) {
      const thrower = by === null ? undefined : rt.sim.side.actors.get(by)
      const yaw = thrower?.yaw ?? CAMERA_FACING
      const x = from[0] + Math.sin(yaw) * 5
      const z = from[2] + Math.cos(yaw) * 5
      to = [x, groundAt(rt.sim.world.room, x, z) + 0.1, z]
    }
    if (it.holder !== null) rt.release(it)
    it.fixed = false
    const dx = to[0] - from[0]
    const dz = to[2] - from[2]
    const time = Math.min(8, Math.max(0.25, Math.hypot(dx, dz) / speed) * (1 + arc))
    rt.setLoose(it, by)
    it.vx = dx / time
    it.vz = dz / time
    it.vy = (to[1] - from[1] + 0.5 * GRAVITY * time * time) / time
    it.spin = (nextRandom(rt.sim.world) < 0.5 ? -1 : 1) * (6 + 4 * nextRandom(rt.sim.world))
    return time
  }

  launch(item: unknown, vx: unknown, vy: unknown, vz: unknown): void {
    const rt = this.#rt
    const it = rt.liveItem(item)
    if (it === null) return
    const by = it.holder?.actor ?? rt.current
    if (it.holder !== null) rt.release(it)
    it.fixed = false
    rt.setLoose(it, by)
    it.vx = clamp(num(vx, 0), -40, 40)
    it.vy = clamp(num(vy, 0), -40, 40)
    it.vz = clamp(num(vz, 0), -40, 40)
  }

  touching(a: unknown, b: unknown): boolean {
    const rt = this.#rt
    const p = rt.spot(a)
    const q = rt.spot(b)
    if (p === null || q === null) return false
    const ra = rt.span(a)
    const rb = rt.span(b)
    const gap = Math.hypot(p.x - q.x, p.z - q.z) - ra.r - rb.r
    return gap <= 0.15 && ra.bottom <= rb.top + 0.25 && rb.bottom <= ra.top + 0.25
  }

  distance(a: unknown, b: unknown): number {
    const p = this.#rt.spot(a)
    const q = this.#rt.spot(b)
    return p === null || q === null ? 0 : Math.hypot(p.x - q.x, p.z - q.z)
  }

  angleTo(from: unknown, to: unknown): number {
    const p = this.#rt.spot(from)
    const q = this.#rt.spot(to)
    if (p !== null && q !== null && (p.x !== q.x || p.z !== q.z)) return Math.atan2(q.x - p.x, q.z - p.z)
    const t = this.#rt.thing(from)
    return t === null ? 0 : t.yaw
  }

  water(x: unknown, z: unknown): boolean {
    const p = this.#rt.spot(x) ?? { x: num(x, 0), z: num(z, 0) }
    return inWater(this.#rt.sim.world.room, p.x, p.z)
  }

  groundAt(x: unknown, z: unknown): number {
    const p = this.#rt.spot(x) ?? { x: num(x, 0), z: num(z, 0) }
    return groundAt(this.#rt.sim.world.room, p.x, p.z)
  }

  puff(opts: unknown): void {
    const rt = this.#rt
    const o = isObject(opts) ? opts : {}
    let at: Vec3 | null = o.at === undefined || o.at === null ? null : rt.centre(o.at)
    if (at === null && isNum(o.x) && isNum(o.z)) at = [o.x, num(o.y, groundAt(rt.sim.world.room, o.x, o.z) + 0.5), o.z]
    if (at === null) {
      const me = rt.current === null ? undefined : rt.sim.side.actors.get(rt.current)
      at = me === undefined ? [0, 0.5, 0] : bodyCenter(me)
    }
    // A coordinate given beside `at` wins: at the wand, but up at its tip.
    if (isNum(o.x)) at[0] = o.x
    if (isNum(o.y)) at[1] = o.y
    if (isNum(o.z)) at[2] = o.z
    addPuffs(rt.sim.world, {
      kind: puffKind(o.kind),
      x: clamp(at[0], -ROOM_HALF - 2, ROOM_HALF + 2),
      y: clamp(at[1], -2, 30),
      z: clamp(at[2], -ROOM_HALF - 2, ROOM_HALF + 2),
      color: parseColor(o.color),
      count: Math.round(clamp(num(o.count, 12), 1, 80)),
      size: clamp(num(o.size, 0.15), 0.02, 2),
      speed: clamp(num(o.speed, 2), 0, 20),
      up: clamp(num(o.up, 1), -10, 20),
      life: clamp(num(o.life, 1), 0.1, 8),
      gravity: isNum(o.gravity) ? clamp(o.gravity, -20, 20) : null,
    })
  }

  sound(name: unknown): void {
    this.#rt.sound(name)
  }

  random(): number {
    return nextRandom(this.#rt.sim.world)
  }

  pick<T>(list: readonly T[]): T {
    if (!Array.isArray(list) || list.length === 0) return null as T
    return list[Math.floor(nextRandom(this.#rt.sim.world) * list.length)] as T
  }

  lerp(a: number, b: number, k: number): number {
    return a + (b - a) * k
  }

  clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v))
  }

  ease(k: number): number {
    return ease(k)
  }

  *wait(secs: unknown): Anim {
    for (let i = 0, n = frames(clamp(num(secs, 1), 0, 60)); i < n; i++) yield
  }

  *during(secs: unknown, fn: unknown): Anim {
    for (let i = 1, n = frames(clamp(num(secs, 1), 0, 60)); i <= n; i++) {
      if (typeof fn === 'function') (fn as (k: number, dt: number) => void)(i / n, STEP)
      yield
    }
  }

  *until(cond: unknown, maxSecs?: unknown): Anim {
    for (let i = 0, n = frames(clamp(num(maxSecs, 10), 0, 60)); i < n; i++) {
      yield
      if (typeof cond !== 'function' || (cond as () => unknown)()) return
    }
  }

  *together(...anims: unknown[]): Anim {
    const runs = anims.map(iteratorOf).flatMap((it) => (it === null ? [] : [runStack(it)]))
    do {
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.next().done) runs.splice(i, 1)
      yield
    } while (runs.length > 0)
  }

  join(actor: unknown): void {
    const a = this.#rt.thing(actor)
    const by = this.#rt.current === null ? undefined : this.#rt.sim.side.actors.get(this.#rt.current)
    if (a !== null && 'look' in a && by !== undefined) this.#rt.sim.enlist(a, by)
  }
}
Object.freeze(WorldHandle.prototype)

// ------------------------------------------------------------------------------ the runtime

/** The API objects for one sim, and the moves they share. */
export class Runtime {
  readonly sim: Sim
  readonly api: WorldApi
  /** The actor whose code is running now: what w.find and w.make measure from, and who other actors join when its code moves them. */
  current: string | null = null
  private readonly actors = new Map<string, ActorHandle>()
  private readonly items = new Map<string, ItemHandle>()

  constructor(sim: Sim) {
    this.sim = sim
    this.api = Object.freeze(new WorldHandle(this))
  }

  actor(a: Actor): ActorApi {
    let h = this.actors.get(a.id)
    if (h === undefined || actorOf(h) !== a) {
      h = new ActorHandle(this, a)
      this.actors.set(a.id, h)
    }
    return h
  }

  item(it: Item): ItemApi {
    let h = this.items.get(it.id)
    if (h === undefined || itemOf(h) !== it) {
      h = new ItemHandle(this, it)
      this.items.set(it.id, h)
    }
    return h
  }

  actorById(id: string): ActorApi | null {
    const a = this.sim.side.actors.get(id)
    return a === undefined ? null : this.actor(a)
  }

  itemById(id: string): ItemApi | null {
    const it = this.sim.side.items.get(id)
    return it === undefined ? null : this.item(it)
  }

  /** The thing went away: its handle goes too. */
  forget(id: string): void {
    this.actors.delete(id)
    this.items.delete(id)
  }

  clear(): void {
    this.actors.clear()
    this.items.clear()
  }

  // ------------------------------------------------------------ what code passes

  /** The actor or item behind a handle; a word is an actor's name or the nearest thing of a kind. */
  thing(v: unknown): Actor | Item | null {
    if (v instanceof ActorHandle) return actorOf(v)
    if (v instanceof ItemHandle) return itemOf(v)
    if (typeof v !== 'string' || v.trim() === '') return null
    if (v.startsWith('#')) return this.sim.side.items.get(v) ?? null
    const a = this.actorFor(v)
    if (a !== null) return a
    const found = this.api.find(v)
    return found === null ? null : itemOf(found as ItemHandle)
  }

  /** An item in the room now, from a handle, an id or a kind word. */
  liveItem(v: unknown): Item | null {
    const t = this.thing(v)
    return t !== null && !('look' in t) && this.alive(t) ? t : null
  }

  alive(it: Item): boolean {
    return this.sim.side.items.get(it.id) === it
  }

  /** Where a target stands: an actor, an item, a spot { x, z } or [x, z], or a word as in thing(). */
  spot(v: unknown): { x: number; z: number; y: number } | null {
    const t = this.thing(v)
    if (t !== null) return { x: t.x, z: t.z, y: t.y }
    if (Array.isArray(v) && isNum(v[0]) && isNum(v[1])) return { x: v[0], z: v[1], y: groundAt(this.sim.world.room, v[0], v[1]) }
    if (isObject(v) && isNum(v.x) && isNum(v.z)) return { x: v.x, z: v.z, y: isNum(v.y) ? v.y : groundAt(this.sim.world.room, v.x, v.z) }
    return null
  }

  /** The middle of a target: an actor's body, an item's bounds, a spot's ground (or its y). */
  centre(v: unknown): Vec3 | null {
    const t = this.thing(v)
    if (t !== null) return 'look' in t ? bodyCenter(t) : itemCentre(t, this.sim.library.info(t.kind))
    const s = this.spot(v)
    return s === null ? null : [s.x, s.y, s.z]
  }

  radiusOf(t: Actor | Item): number {
    return 'look' in t ? proportions(t.look).radius * t.scale : this.sim.library.info(t.kind).radius * t.scale
  }

  /** How far a target reaches on the ground, and from what height to what height. */
  span(v: unknown): { r: number; bottom: number; top: number } {
    const t = this.thing(v)
    if (t === null) {
      const s = this.spot(v)
      return { r: 0, bottom: s?.y ?? 0, top: s?.y ?? 0 }
    }
    if ('look' in t) return { r: this.radiusOf(t), bottom: t.y, top: t.y + t.look.height * t.scale }
    const info = this.sim.library.info(t.kind)
    return { r: this.radiusOf(t), bottom: t.y + bottomOf(t, info), top: t.y + heightOf(t, info) }
  }

  actorFor(word: string): Actor | null {
    const id = matchWord(word, this.sim.world.actors.map((a) => ({ id: a.id, words: [a.id, a.name, ...a.calls] })))
    return id === null ? null : (this.sim.side.actors.get(id) ?? null)
  }

  /** Tests for the items a kind word means: the kind itself first, then any kind with that word in its id or name ('ball' finds a beach ball). */
  kindsFor(word: string): ((it: Item) => boolean)[] {
    const lib = this.sim.library
    const kind = lib.items.has(word) ? word : lib.itemKindFor(word)
    const w = normalWord(word)
    const named = (name: string) => normalWord(name).split(' ').includes(w)
    const loose = (it: Item) => {
      const info = lib.info(it.kind)
      return named(it.kind) || named(info.name) || named(info.nameFi)
    }
    return kind === null ? [loose] : [(it) => it.kind === kind, loose]
  }

  /** Where the actor whose code runs now stands. */
  here(): { x: number; z: number } | null {
    const a = this.current === null ? undefined : this.sim.side.actors.get(this.current)
    return a === undefined ? null : { x: a.x, z: a.z }
  }

  /** Code moving another actor makes it join the step running now, unless a command of its own took it out of that step. */
  join(a: Actor): void {
    if (this.current !== null && this.current !== a.id && !this.left(a)) a.joinedBy = this.current
  }

  /** Whether a command of its own took the actor out of the step running now. */
  left(a: Actor): boolean {
    const by = this.current === null ? undefined : this.sim.side.actors.get(this.current)
    return by !== undefined && by.doing !== null && this.sim.side.left.get(a.id) === by.doing
  }

  /** What a rider turns by turning itself: a thing it rides astride that is not built into the room. Null when it rides nothing, sits, or its thing is fixed. */
  steered(a: Actor): Item | null {
    if (a.riding === null || this.seat(a) !== 'ride') return null
    const it = this.sim.side.items.get(a.riding)
    return it === undefined || it.fixed || it.rider !== a.id ? null : it
  }

  seat(a: Actor): Seat | null {
    if (a.riding === null) return null
    const it = this.sim.side.items.get(a.riding)
    return this.sim.side.seats.get(a.id) ?? (it !== undefined && this.sim.library.info(it.kind).recipe.meta.ride ? 'ride' : 'sit')
  }

  sound(name: unknown): void {
    const side = this.sim.side
    if (side.sounds >= 8) return
    this.sim.world.sounds.push(soundName(name))
    side.sounds++
  }

  /** Where the actor's feet rest now: on the ground or a solid thing under it, or swimming in deep water. */
  groundUnder(a: Actor): number {
    return this.standAt(a, solidsOf(this.sim.world, this.sim.library))
  }

  standAt(a: Actor, solids: Solid[]): number {
    const w = this.sim.world
    return restHeight(w, a, a.x, a.z, supportAt(w, solids, a.x, a.z, a.y, null))
  }

  /** Out of any solid thing it landed inside (not one it stands on). */
  pushOut(a: Actor): void {
    const me = proportions(a.look).radius * a.scale
    for (const s of solidsOf(this.sim.world, this.sim.library)) {
      if (s.top <= a.y + 0.3) continue
      const dx = a.x - s.x
      const dz = a.z - s.z
      const d = Math.hypot(dx, dz)
      const r = s.r + me
      if (d >= r) continue
      const p = insideRoom(s.x + (d > 1e-6 ? dx / d : 1) * r, s.z + (d > 1e-6 ? dz / d : 0) * r, me)
      a.x = p.x
      a.z = p.z
    }
  }

  // ------------------------------------------------------------ holding, riding, wearing

  /** Whoever holds it lets go; it stays where it is. */
  release(it: Item): void {
    if (it.holder === null) return
    const a = this.sim.side.actors.get(it.holder.actor)
    if (a !== undefined) for (const hand of HANDS) if (a.hands[hand] === it.id) a.hands[hand] = null
    it.holder = null
  }

  /** It flies or falls from here, and does not hit `by` until it has left them. */
  setLoose(it: Item, by: string | null): void {
    const side = this.sim.side
    it.loose = true
    side.still.delete(it.id)
    side.placed.delete(it.id)
    side.hitDone.delete(it.id)
    side.grounded.delete(it.id)
    if (by === null) side.thrownBy.delete(it.id)
    else side.thrownBy.set(it.id, by)
    this.unsupport(it)
  }

  /** The actor lets go of it and it falls. */
  letGo(a: Actor, it: Item): void {
    this.release(it)
    it.fixed = false
    it.vx = it.vy = it.vz = it.spin = 0
    this.setLoose(it, a.id)
  }

  /** The right hand gets free for a worn 'hand' thing: what it held (not hugged, not the thing itself) goes to a free left hand, or falls. */
  freeRightHand(a: Actor, except: Item): void {
    if (proportions(a.look).animal) return
    const id = a.hands.right
    const held = id === null ? undefined : this.sim.side.items.get(id)
    if (held === undefined || held === except || a.hands.left === id) return
    if (a.hands.left === null) {
      a.hands.right = null
      a.hands.left = held.id
      held.holder = { actor: a.id, hand: 'left' }
    } else this.letGo(a, held)
  }

  /**
   * The hand a one-hand thing goes into: the one asked for, else the right unless it is full and
   * the left is free. Never the right while a 'hand' thing is worn: the wand fills that hand.
   * An animal holds it in its mouth.
   */
  handFor(a: Actor, want: Hand | null): Hand {
    if (proportions(a.look).animal) return 'right'
    if (a.look.worn.hand !== undefined) return 'left'
    if (want !== null) return want
    return a.hands.right === null || a.hands.left !== null ? 'right' : 'left'
  }

  /** Into the hand (or both arms for a 'hug' thing), from whoever had it; what was in the way is dropped. */
  grab(a: Actor, it: Item, want: Hand | null): void {
    const side = this.sim.side
    const animal = proportions(a.look).animal
    const hug = this.sim.library.info(it.kind).recipe.meta.carry === 'hug' && !animal
    this.release(it)
    const dropFrom = (hand: Hand) => {
      const id = a.hands[hand]
      const held = id === null ? undefined : side.items.get(id)
      if (held !== undefined) this.letGo(a, held)
      a.hands[hand] = null
    }
    if (hug) {
      dropFrom('left')
      dropFrom('right')
      a.hands.left = a.hands.right = it.id
      it.holder = { actor: a.id, hand: 'right' }
    } else {
      if (a.hands.left !== null && a.hands.left === a.hands.right) dropFrom('right')
      const hand = this.handFor(a, want)
      if (a.hands[hand] !== null) dropFrom(hand)
      a.hands[hand] = it.id
      it.holder = { actor: a.id, hand }
    }
    it.loose = false
    it.fixed = false
    it.vx = it.vy = it.vz = it.spin = 0
    side.placed.delete(it.id)
    side.still.delete(it.id)
    side.thrownBy.delete(it.id)
    side.hitDone.delete(it.id)
    side.grounded.delete(it.id)
    this.unsupport(it)
  }

  /** Things standing on a solid thing that went away fall now. */
  unsupport(it: Item): void {
    const lib = this.sim.library
    const info = lib.info(it.kind)
    if (!info.recipe.meta.solid) return
    const r = info.radius * it.scale
    const top = it.y + heightOf(it, info)
    for (const o of this.sim.world.items) {
      if (o === it || o.loose || o.holder !== null || o.fixed) continue
      if (Math.abs(o.y + bottomOf(o, lib.info(o.kind)) - top) < 0.1 && (o.x - it.x) ** 2 + (o.z - it.z) ** 2 < r * r) this.sim.side.placed.set(o.id, -Infinity)
    }
  }

  unseat(a: Actor): void {
    const side = this.sim.side
    if (a.riding !== null) {
      const it = side.items.get(a.riding)
      if (it !== undefined && it.rider === a.id) it.rider = null
    }
    a.riding = null
    side.seats.delete(a.id)
    side.hopping.delete(a.id)
  }

  /** Off at once, standing beside the thing. */
  dismount(a: Actor): void {
    const it = a.riding === null ? undefined : this.sim.side.items.get(a.riding)
    const spot = it === undefined ? { x: a.x, z: a.z } : this.besideSpot(a, it)
    this.unseat(a)
    a.x = spot.x
    a.z = spot.z
    a.y = restHeight(this.sim.world, a, spot.x, spot.z, groundAt(this.sim.world.room, spot.x, spot.z))
    a.pitch = 0
    a.roll = 0
    const rest = restFor(a, null)
    lerpPose(a.pose, rest, rest, 1)
  }

  /** A free spot next to a thing: in front of the rider, else to a side, else behind. */
  besideSpot(a: Actor, it: Item): { x: number; z: number } {
    const me = proportions(a.look).radius * a.scale
    const d = this.sim.library.info(it.kind).radius * it.scale + me + 0.1
    const solids = solidsOf(this.sim.world, this.sim.library)
    for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const x = it.x + Math.sin(a.yaw + turn) * d
      const z = it.z + Math.cos(a.yaw + turn) * d
      if (Math.abs(x) > ROOM_HALF - me || Math.abs(z) > ROOM_HALF - me) continue
      if (solids.some((s) => s.item !== it && (x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + me) ** 2)) continue
      return { x, z }
    }
    return insideRoom(it.x + Math.sin(a.yaw) * d, it.z + Math.cos(a.yaw) * d, me)
  }

  /** A worn thing comes off as a loose item (the very one, its state and parts kept), tossed a little forward from where it was worn. */
  dropWorn(a: Actor, slot: Slot): Item {
    const worn = a.look.worn[slot]!
    delete a.look.worn[slot]
    const p = slot === 'body' ? [a.x, a.y, a.z] : slot === 'back' ? backFrame(a).p : slot === 'hand' ? handFrame(a, 'right').p : headFrame(a).p
    const fx = Math.sin(a.yaw)
    const fz = Math.cos(a.yaw)
    const at = { x: p[0]! + fx * 0.25, z: p[2]! + fz * 0.25, y: p[1]!, yaw: a.yaw }
    const kept = this.sim.takeStandIn(a.id, slot)
    const it = kept !== undefined && kept.kind === worn.kind ? this.sim.putItem(kept, at) : this.sim.makeItem(worn.kind, at)
    it.tint = worn.tint
    it.vx = fx * 0.8
    it.vz = fz * 0.8
    it.vy = 1.2
    this.setLoose(it, a.id)
    return it
  }

  // ------------------------------------------------------------ a step's arguments

  /** A step's words as the action's arguments, by each param's kind; a param the step did not name takes a word it gave under another name. */
  args(a: Actor, step: Step, params: Param[]): Args {
    const out: Args = {}
    const named = new Set(params.map((p) => p.name))
    const spare = Object.keys(step.args)
      .filter((k) => !named.has(k))
      .map((k) => step.args[k]!)
    let things = 0
    for (const p of params) {
      const raw = step.args[p.name] ?? spare.shift()
      const slot = p.kind === 'item' || p.kind === 'thing' ? things++ : 0
      out[p.name] = raw === undefined ? null : this.arg(a, p.kind, String(raw).trim(), slot)
    }
    return out
  }

  private arg(a: Actor, kind: ParamKind, value: string, slot: number): Args[string] {
    if (value === '') return null
    switch (kind) {
      case 'text':
        return value.slice(0, 200)
      case 'number': {
        const n = Number(value.replace(',', '.'))
        return Number.isFinite(n) ? n : null
      }
      case 'actor': {
        const b = this.actorFor(value)
        return b === null ? null : this.actor(b)
      }
      case 'item': {
        const it = this.itemFor(a, value, slot)
        return it === null ? null : this.item(it)
      }
      case 'thing': {
        const b = this.actorFor(value)
        if (b !== null) return this.actor(b)
        const it = this.itemFor(a, value, slot)
        return it === null ? null : this.item(it)
      }
      case 'place': {
        const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value)
        if (m) return insideRoom(Number(m[1]), Number(m[2]), 0.3)
        const b = this.actorFor(value)
        if (b !== null) return { x: b.x, z: b.z }
        const it = this.itemFor(a, value, -1)
        return it === null ? null : { x: it.x, z: it.z }
      }
    }
  }

  /** An instance by id; else the kind a word means: what the actor holds, else the nearest free one, else (slot 0 or 1) a new one in front of it. */
  private itemFor(a: Actor, word: string, slot: number): Item | null {
    const side = this.sim.side
    if (word.startsWith('#')) {
      const it = side.items.get(word)
      if (it !== undefined) return it
    }
    const lib = this.sim.library
    const kind = lib.items.has(word) ? word : lib.itemKindFor(word)
    if (kind === null) return null
    for (const id of [a.hands.right, a.hands.left]) {
      const held = id === null ? undefined : side.items.get(id)
      if (held !== undefined && held.kind === kind) return held
    }
    let best: Item | null = null
    let bestD = Infinity
    for (const it of this.sim.world.items) {
      if (it.kind !== kind || (it.holder !== null && it.holder.actor !== a.id) || (it.rider !== null && it.rider !== a.id)) continue
      const d = (it.x - a.x) ** 2 + (it.z - a.z) ** 2
      if (d < bestD) {
        best = it
        bestD = d
      }
    }
    if (best !== null || slot < 0) return best
    const d = (slot === 0 ? 1.5 : 4) + lib.info(kind).radius
    return this.sim.makeItem(kind, { x: a.x + Math.sin(a.yaw) * d, z: a.z + Math.cos(a.yaw) * d, yaw: a.yaw + Math.PI })
  }
}

// ------------------------------------------------------------------------------ built-in moves the sim runs

/**
 * Before a step: off what it rides (unless the step is about that thing), and up to standing
 * from lying, sitting on the ground or a pose left over (thinking, listening). Nothing to do,
 * no frames.
 */
function* prelude(rt: Runtime, a: Actor, keep: ReadonlySet<string>): Anim {
  const me = rt.actor(a)
  if (a.riding !== null && !keep.has(a.riding)) yield* me.getOff()
  if (isLying(a) || isDown(a) || poseDistance(a.pose, restFor(a, rt.seat(a))) > 0.6) {
    yield* me.rest(0.25)
    yield* fall(rt, a)
  }
}

/** A step's run: the prelude, then the action's generator (anything else the action returned was over at once). */
export function stepTask(rt: Runtime, a: Actor, keep: ReadonlySet<string>, made: unknown): Anim {
  return runStack(
    (function* () {
      yield* prelude(rt, a, keep)
      if (isIterator(made)) yield made
    })(),
  )
}

/** After a step, or when something let go of it: off what it rides if asked, joints to rest, feet on what is under them. */
export function* settleDown(rt: Runtime, a: Actor, getOff: boolean): Anim {
  const me = rt.actor(a)
  if (getOff && a.riding !== null) yield* me.getOff()
  yield* me.rest(0.3)
  yield* fall(rt, a)
}

/** Whether settleDown has anything to do. */
export function needsSettling(rt: Runtime, a: Actor, getOff: boolean): boolean {
  if (getOff && a.riding !== null) return true
  if (a.riding === null && (Math.abs(a.pitch) > 0.02 || Math.abs(a.roll) > 0.02)) return true
  if (poseDistance(a.pose, restFor(a, rt.seat(a))) > 0.05) return true
  return a.riding === null && Math.abs(a.y - rt.groundUnder(a)) > 0.01
}

/** The little built-in reactions: a shrug, a cheer, a puzzled tilt, a wave, a think. */
export function* reaction(rt: Runtime, a: Actor, kind: Reaction): Anim {
  const me = rt.actor(a)
  const w = rt.api
  const animal = proportions(a.look).animal
  const up = { swing: 2.9, raise: 0.3, bend: 0.2 }
  switch (kind) {
    case 'shrug': {
      me.say(HMM, 1.6)
      me.feel('surprised', 1.6)
      const palms = { swing: 0.35, raise: 0.55, bend: 1.5 }
      yield* me.poseTo(animal ? { head: { tilt: 0.4 } } : { head: { tilt: 0.25 }, armL: palms, armR: palms, bob: 0.02 }, 0.25)
      yield* w.wait(0.6)
      break
    }
    case 'huh':
      me.say({ en: 'Huh?', fi: 'Häh?' }, 1.5)
      me.feel('surprised', 1.5)
      yield* me.poseTo({ head: { tilt: 0.45, nod: -0.1, turn: 0.15 } }, 0.25)
      yield* w.wait(0.7)
      break
    case 'yay':
      me.say({ en: 'Yay!', fi: 'Jee!' }, 1.5)
      me.feel('happy', 2)
      rt.sound('yay')
      yield* me.poseTo(animal ? { tail: 0.9 } : { armL: up, armR: up }, 0.15)
      if (a.riding === null && !isLying(a)) yield* me.jump(0.45)
      else yield* w.wait(0.4)
      break
    case 'hello': {
      me.say({ en: 'Hi!', fi: 'Hei!' }, 2)
      me.feel('happy', 2)
      if (a.riding === null) yield* me.turnTo({ x: a.x + Math.sin(CAMERA_FACING) * 5, z: a.z + Math.cos(CAMERA_FACING) * 5 })
      const arm = a.hands.right === null || a.hands.left !== null ? 'armR' : 'armL'
      yield* me.poseTo(animal ? { armR: { swing: 1.4, raise: 0, bend: 0.3 } } : { [arm]: { swing: 2.6, raise: 0.35, bend: 0.3 } }, 0.2)
      yield* w.during(1, (k) => {
        a.pose[arm].raise = (animal ? 0 : 0.35) + 0.35 * Math.sin(k * Math.PI * 6)
      })
      break
    }
    case 'think':
      me.say({ en: 'Hmm...', fi: 'Hmm...' }, 1.8)
      yield* me.poseTo(thinkPose(a, rt.seat(a)), 0.25)
      yield* w.wait(1.2)
      break
  }
  yield* me.rest(0.3)
}
