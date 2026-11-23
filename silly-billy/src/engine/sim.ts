/**
 * The sim: steps the plain world 60 times a second. Each actor runs one step of its queue at a
 * time as a generator (built-in or made code, through runtime.ts's api objects); loose items
 * fall, bounce, roll and float; held, worn and ridden things follow their actor; puffs drift;
 * bubbles and moods run out. Made code is called inside try/catch with the loop guard reset
 * (engine/sandbox.ts) and everything it wrote is made finite and kept in the room afterwards.
 *
 * CONTRACT (the engine builds this file; others import it). Bodies marked "not built yet"
 * are filled in by the engine work; the signatures stay.
 */

import type { Anim, WorldApi } from './api'
import { anglesOf, apply, backFrame, handFrame, headFrame, KID_HEAD_R, pointIn, proportions, rootFrame, type Frame } from './body'
import { useLang, type CastNames, type Lang } from './lang'
import type { LibAction, Library, LibItem } from './library'
import { holdFrame, placeIn } from './attach'
import { stepEffects } from './effects'
import { stepPhysics, stepPuffs, WIND_SPEED } from './physics'
import { groundAt, inWater, insideRoom, ROOM_GEO, WATER_Y } from './rooms'
import { needsSettling, reaction, Runtime, settleDown, stepTask } from './runtime'
import { describeError, resetGuard } from './sandbox'
import { newSky, newTerrain, skyOf, stepFades, terrainOf } from './sky'
import {
  HANDS, ROOM_HALF, ROOMS, SLOTS, STEP, restPose, type Actor, type BodyKind, type Item, type Look, type Pronoun, type Reaction, type RoomId, type Slot, type Step, type World,
} from './types'
import {
  addPuffs, CAMERA_FACING, clamp, cleanActorRoot, cleanItemData, cleanItemRoot, cleanLook, cleanPose, copyLook, goodLook, hash01, infoFor, isDown, isLying, itemCentre,
  itemRotation, lerpPose, listenPose, num, partFrame, placeHeld, restFor, restHeight, seatedRoot, Side, TAU, thinkPose, turnBetween, waterTop, wetAt, withAdded, wornKey,
} from './world'

/** Where a thing stands when a room is set up (content/layouts.ts). */
export interface Placement {
  kind: string
  x: number
  z: number
  yaw?: number
  fixed?: boolean
  tint?: string
}

/** Walking speed by body, m/s. */
const SPEED: Record<BodyKind, number> = { kid: 1.5, grownup: 1.7, cat: 1.9, dog: 2.1 }

/** A step runs at most this long, then it is ended. */
const STEP_CAP = 60

/**
 * Made code's real time: on average this many milliseconds a frame for an action (for all the
 * things of a kind, for a process), with this much to spare for a slow moment. Past it the
 * action ends as failed and the process is taken away. The loop guard cannot stop one long
 * call into the browser (a huge array), but this keeps such code from freezing the game again
 * and again, and tells the designer.
 */
const BUDGET_MS = 8
export const PROCESS_BUDGET_MS = 4
export const SPARE_MS = 500
const TOO_SLOW = 'it took too long: do less in each frame and yield more often'

interface Budget {
  ms: number
  frames: number
  /** The last frame it was counted in. */
  frame: number
  /** Milliseconds a frame it may take on average. */
  rate: number
}

const budget = (rate: number): Budget => ({ ms: 0, frames: 0, frame: -1, rate })
const now = () => performance.now()

/** Counts one call into made code that began at `since`; true while it is within its budget. */
function within(b: Budget, frame: number, since: number): boolean {
  b.ms += now() - since
  if (b.frame !== frame) {
    b.frame = frame
    b.frames++
  }
  return b.ms <= b.frames * b.rate + SPARE_MS
}

/** A fresh actor standing at (x, z), at rest. `names`: a starting avatar's name in each language, which its name follows (null for one the child made). */
export function newActor(spec: { id: string; name: string; calls: string[]; names?: CastNames | null; pronoun: Pronoun; look: Look; x: number; z: number; yaw?: number }): Actor {
  const calls = [...new Set([...spec.calls, spec.name, spec.id].map((c) => c.toLowerCase().trim()).filter((c) => c !== ''))]
  return {
    id: spec.id,
    name: spec.name,
    calls,
    names: spec.names ?? null,
    pronoun: spec.pronoun,
    look: copyLook(spec.look),
    x: spec.x,
    y: 0,
    z: spec.z,
    yaw: spec.yaw ?? 0,
    pitch: 0,
    roll: 0,
    scale: 1,
    pose: restPose(),
    hands: { left: null, right: null },
    riding: null,
    mood: 'happy',
    moodUntil: 0,
    bubble: null,
    thinking: null,
    listening: false,
    doing: null,
    queue: [],
    joinedBy: null,
    speed: SPEED[spec.look.body],
    stride: 0,
  }
}

function newItem(id: string, kind: string, at: { x: number; y: number; z: number; yaw: number }, born: number, fixed: boolean, loose: boolean, tint: string | null): Item {
  return {
    id,
    kind,
    x: at.x,
    y: at.y,
    z: at.z,
    yaw: at.yaw,
    pitch: 0,
    roll: 0,
    scale: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    loose,
    holder: null,
    rider: null,
    parts: {},
    state: {},
    tint,
    born,
    fixed,
  }
}

/** Everybody on the room's spawn spots, front row first, facing the camera's side of the room. */
function placeActors(w: World) {
  const spots = ROOM_GEO[w.room].spawn
  w.actors.forEach((a, i) => {
    const s = spots[i % spots.length]!
    const p = insideRoom(s.x, s.z - Math.floor(i / spots.length) * 1.5, 0.5)
    a.x = p.x
    a.z = p.z
    a.y = restHeight(w, a, p.x, p.z, groundAt(w.room, p.x, p.z))
    a.yaw = 0
    a.pitch = 0
    a.roll = 0
  })
}

const copyStep = (s: Step): Step => ({ action: s.action, args: { ...s.args }, serial: s.serial })

/**
 * A fresh world in `room`, with each room's things placed (ids from 1) and the actors on the
 * room's spawn spots, played in `lang` (English unless given: the tests' worlds); the starting
 * avatars take that language's names.
 */
export function createWorld(opts: { room: RoomId; actors: Actor[]; layouts: Record<RoomId, Placement[]>; seed: number; lang?: Lang }): World {
  const w: World = {
    t: 0,
    lang: opts.lang ?? 'en',
    frame: 0,
    room: opts.room,
    actors: [...opts.actors],
    items: [],
    away: { playground: [], pool: [], forest: [] },
    puffs: [],
    sounds: [],
    speech: [],
    events: [],
    nextId: 1,
    rng: opts.seed >>> 0,
    spotlight: null,
    sky: newSky(),
    terrain: { playground: newTerrain(), pool: newTerrain(), forest: newTerrain() },
  }
  for (const room of ROOMS) {
    const list = room === opts.room ? w.items : w.away[room]
    for (const p of opts.layouts[room]) {
      // A loose thing put in the water floats.
      const wet = p.fixed !== true && inWater(room, p.x, p.z)
      list.push(newItem(`#i${w.nextId++}`, p.kind, { x: p.x, y: wet ? WATER_Y : 0, z: p.z, yaw: p.yaw ?? 0 }, -10, p.fixed === true, wet, p.tint ?? null))
    }
  }
  placeActors(w)
  useLang(w, w.lang)
  return w
}

export type { Reaction } from './types'

/** What an actor with nothing running is up to. */
type Mode = 'idle' | 'listening' | 'thinking'

export class Sim {
  world: World
  readonly library: Library
  /** The world as made code sees it. */
  readonly api: WorldApi
  /** What the sim keeps beside the world: indexes, who let go of what, the last good looks. */
  readonly side = new Side()
  private readonly runtime: Runtime
  /** Each actor's running step, its reaction (which goes first and pauses the step), and its settling after a step. */
  private readonly tasks = new Map<string, Anim>()
  private readonly reactions = new Map<string, Anim>()
  private readonly settles = new Map<string, Anim>()
  private readonly modes = new Map<string, Mode>()
  private readonly idleSince = new Map<string, number>()
  /** How often each kind's process has thrown: at 3 it stops. */
  private readonly tickFails = new WeakMap<LibItem, number>()
  /** The real time made code took: each actor's made step, each kind's process. */
  private readonly budgets = new Map<string, Budget>()
  private readonly tickBudgets = new WeakMap<LibItem, Budget>()
  /** The world the side state is about; another one starts afresh. */
  private adopted: World | null = null
  private acc = 0

  constructor(world: World, library: Library) {
    this.world = world
    this.library = library
    this.runtime = new Runtime(this)
    this.api = this.runtime.api
    this.sync()
  }

  /** A world object the sim has not run yet (a copy, or one the game put in): nothing of it is running, so no actor is doing anything. */
  private sync() {
    const w = this.world
    if (w === this.adopted) return
    this.adopted = w
    for (const m of [this.tasks, this.reactions, this.settles, this.modes, this.idleSince, this.budgets]) m.clear()
    const side = this.side
    side.clearItems()
    side.looks.clear()
    side.seats.clear()
    side.hopping.clear()
    side.worn.clear()
    side.voiced.clear()
    side.left.clear()
    this.runtime.clear()
    side.index(w)
    // A world from before the sky and the terrain gets them now, so everything after may read them.
    skyOf(w)
    for (const room of ROOMS) terrainOf(w, room)
    for (const a of w.actors) {
      a.doing = null
      a.joinedBy = null
      a.reacting = null
      side.looks.set(a.id, goodLook(a.look))
    }
    this.acc = 0
  }

  /** One step of 1/60 s. */
  step(): void {
    this.sync()
    const w = this.world
    this.side.index(w)
    w.t += STEP
    w.frame++
    this.side.sounds = 0
    this.side.speeches = 0
    this.side.spoken.clear()
    stepFades(w)
    for (const a of w.actors) this.runActor(a)
    this.stepEffects()
    this.stepItems()
  }

  /** Everybody's states: what water, rain, snow and a hot thing near do, the sway and face they show, and getting better when sick runs out. */
  private stepEffects() {
    const w = this.world
    const sky = skyOf(w)
    const top = waterTop(w)
    const hot: { x: number; z: number; r: number }[] = []
    for (const it of w.items) {
      const info = infoFor(this.library, it)
      if (info.recipe.traits.temp === 'hot') hot.push({ x: it.x, z: it.z, r: info.radius * it.scale + 1.5 })
    }
    for (const a of w.actors) {
      if (a.effects === undefined && sky.rain < 0.25 && sky.snow < 0.35 && !inWater(w.room, a.x, a.z)) {
        if (a.sway !== undefined && a.sway !== null) a.sway = null
        continue
      }
      const deep = wetAt(w, a.x, a.z) && a.y < top - 0.1 * a.look.height * a.scale
      const warm = hot.some((h) => (a.x - h.x) ** 2 + (a.z - h.z) ** 2 < h.r * h.r)
      const ended = stepEffects(a, w.t, hash01(a.id, 3), { wet: deep || sky.rain >= 0.25, snowing: sky.snow >= 0.35, warm })
      if (ended.includes('sick') && !this.reactions.has(a.id)) this.react(a.id, 'better')
    }
  }

  /** Real seconds since the last frame: fixed steps, at most 4 a call. */
  advance(dt: number): void {
    this.acc = Math.min(this.acc + clamp(num(dt, 0), 0, 0.25), STEP * 4)
    for (let n = 0; n < 4 && this.acc >= STEP - 1e-9; n++) {
      this.step()
      this.acc -= STEP
    }
  }

  /**
   * Queues steps for an actor; `replace` first ends what it is doing and empties its queue, and
   * takes it out of another actor's step that has it joined (a game it plays in).
   * A step whose action is not in the library yet waits at the front of the queue, the actor
   * thinking, until it is (or until dropSteps).
   */
  give(actor: string, steps: Step[], replace: boolean): void {
    this.sync()
    const a = this.mustActor(actor)
    if (replace) {
      this.leave(a)
      this.end(a, 'stopped', null)
      a.queue.length = 0
      a.thinking = null
    }
    for (const s of steps) a.queue.push(copyStep(s))
  }

  /** Ends what the actor is doing and empties its queue, and takes it out of a step that has it joined; it rests. */
  stop(actor: string): void {
    this.sync()
    const a = this.mustActor(actor)
    this.leave(a)
    this.end(a, 'stopped', null)
    a.queue.length = 0
    a.thinking = null
    this.endReaction(a)
    this.settle(a, true)
  }

  /** Takes waiting steps for this action out of an actor's queue (its invention failed). */
  dropSteps(actor: string, action: string): void {
    this.sync()
    const a = this.mustActor(actor)
    a.queue = a.queue.filter((s) => s.action !== action)
    const front = a.queue[0]
    if (front === undefined || this.library.actions.has(front.action)) a.thinking = null
  }

  /** Runs a built-in reaction now, before the rest of the queue (out of a step that has it joined: the child spoke to it). */
  react(actor: string, kind: Reaction): void {
    this.sync()
    const a = this.mustActor(actor)
    this.leave(a)
    this.reactions.set(a.id, reaction(this.runtime, a, kind))
    a.reacting = kind
    this.idleSince.set(a.id, this.world.t)
  }

  /**
   * w.join: the actor takes part in `by`'s step as if told to. What it was doing, waiting to do
   * or reacting ends, and it leaves a step that had it joined before; one that a newer command
   * took out of this very step stays out.
   */
  enlist(a: Actor, by: Actor): void {
    if (a === by || by.doing === null || a.joinedBy === by.id || this.side.left.get(a.id) === by.doing) return
    this.leave(a)
    this.end(a, 'stopped', null)
    a.queue.length = 0
    a.thinking = null
    this.endReaction(a)
    a.joinedBy = by.id
  }

  /** Out of the step that has it joined, which cannot take it in again. */
  private leave(a: Actor) {
    if (a.joinedBy === null) return
    const by = this.side.actors.get(a.joinedBy)
    if (by !== undefined && by.doing !== null) this.side.left.set(a.id, by.doing)
    a.joinedBy = null
  }

  private endReaction(a: Actor) {
    this.reactions.delete(a.id)
    a.reacting = null
  }

  /** Whether a reaction of the actor's is playing. */
  reacting(actor: string): boolean {
    return this.reactions.has(actor)
  }

  /** Everybody goes to another room: this room's loose things stay here for next time, held and worn ones come along. */
  enterRoom(room: RoomId): void {
    this.sync()
    const w = this.world
    if (room === w.room) return
    for (const a of w.actors) {
      this.end(a, 'stopped', null)
      this.endReaction(a)
      a.joinedBy = null
      if (a.riding !== null) this.runtime.unseat(a)
    }
    const held = new Set<string>()
    for (const a of w.actors) for (const hand of HANDS) if (a.hands[hand] !== null) held.add(a.hands[hand]!)
    // Things fixed to someone go along with them.
    for (const it of w.items) if (it.attached !== undefined && it.attached !== null && this.side.actors.has(it.attached.to)) held.add(it.id)
    w.away[w.room] = w.items.filter((it) => !held.has(it.id))
    w.items = [...w.away[room], ...w.items.filter((it) => held.has(it.id))]
    w.away[room] = []
    w.room = room
    w.puffs.length = 0
    w.spotlight = null
    placeActors(w)
    for (const a of w.actors) {
      const rest = restFor(a, null)
      lerpPose(a.pose, rest, rest, 1)
      this.settles.delete(a.id)
      this.modes.set(a.id, 'idle')
      this.idleSince.set(a.id, w.t)
    }
    this.side.clearItems()
    this.side.index(w)
    this.runtime.clear()
  }

  addActor(actor: Actor): void {
    this.sync()
    if (this.world.actors.some((a) => a.id === actor.id)) throw new Error(`actor ${actor.id} is already here`)
    this.world.actors.push(actor)
    this.side.actors.set(actor.id, actor)
    this.side.looks.set(actor.id, goodLook(actor.look))
    this.idleSince.set(actor.id, this.world.t)
  }

  removeActor(id: string): void {
    this.sync()
    const w = this.world
    const a = this.mustActor(id)
    this.end(a, 'stopped', null)
    for (const hand of HANDS) {
      const held = a.hands[hand] === null ? undefined : this.side.items.get(a.hands[hand]!)
      if (held !== undefined) this.runtime.letGo(a, held)
    }
    if (a.riding !== null) this.runtime.unseat(a)
    for (const b of w.actors) if (b.joinedBy === id) b.joinedBy = null
    for (const it of w.items) if (it.attached?.to === id) this.runtime.detach(it, false)
    w.actors.splice(w.actors.indexOf(a), 1)
    for (const m of [this.tasks, this.reactions, this.settles, this.modes, this.idleSince, this.budgets, this.side.actors, this.side.looks, this.side.voiced, this.side.left, this.side.leftovers]) m.delete(id)
    this.runtime.forget(id)
    if (w.spotlight === id) w.spotlight = null
  }

  /** A new item of a kind in the current room; it pops in. */
  makeItem(kind: string, at: { x: number; z: number; y?: number; yaw?: number }, fixed?: boolean): Item {
    this.sync()
    const w = this.world
    const info = this.library.info(kind)
    const p = insideRoom(num(at.x, 0), num(at.z, 0), Math.min(info.radius, ROOM_HALF - 0.5))
    const low = info.recipe.bounds.min[1]
    const wet = wetAt(w, p.x, p.z)
    const ground = (wet ? waterTop(w) : groundAt(w.room, p.x, p.z)) - low
    const y = at.y === undefined ? ground : clamp(num(at.y, ground), -2, 30)
    const still = fixed === true
    const it = newItem(`#i${w.nextId++}`, kind, { x: p.x, y, z: p.z, yaw: num(at.yaw ?? 0, 0) }, w.t, still, !still && (wet || y > ground + 0.02), null)
    w.items.push(it)
    this.side.items.set(it.id, it)
    return it
  }

  /** Takes a thing out of the room; `keepHandle` keeps code's handle on it (it is being worn). */
  removeItem(id: string, keepHandle = false): void {
    this.sync()
    const w = this.world
    const i = w.items.findIndex((it) => it.id === id)
    if (i < 0) {
      for (const room of ROOMS) {
        const j = w.away[room].findIndex((it) => it.id === id)
        if (j >= 0) {
          w.away[room].splice(j, 1)
          return
        }
      }
      throw new Error(`no item ${id}`)
    }
    const it = w.items[i]!
    this.runtime.release(it)
    if (it.rider !== null) {
      const rider = this.side.actors.get(it.rider)
      if (rider !== undefined) {
        this.runtime.dismount(rider)
        this.settle(rider, false)
      }
    }
    w.items.splice(i, 1)
    this.runtime.unsupport(it)
    // What was fixed to it comes loose: left in the air, it falls.
    for (const o of w.items) if (o.attached?.to === id) this.runtime.detach(o, false)
    this.side.forgetItem(id)
    if (!keepHandle) this.runtime.forget(id)
  }

  /** A thing someone puts on leaves the room but goes on as its slot's stand-in: its process runs, its parts move, and code's handle on it stays live. */
  wearItem(a: Actor, slot: Slot, it: Item): void {
    this.removeItem(it.id, true)
    it.attached = null
    it.loose = false
    it.holder = null
    it.rider = null
    it.vx = it.vy = it.vz = it.spin = 0
    const key = wornKey(a.id, slot)
    const old = this.side.worn.get(key)
    if (old !== undefined && old !== it) this.runtime.forget(old.id)
    this.side.worn.set(key, it)
    this.placeWorn(a, slot, it)
  }

  /** The stand-in for what an actor wears in a slot, no longer kept (it is coming off), if there is one. */
  takeStandIn(actor: string, slot: Slot): Item | undefined {
    const key = wornKey(actor, slot)
    const it = this.side.worn.get(key)
    this.side.worn.delete(key)
    return it
  }

  /** A thing that was out of the room (a worn one taken off) back in it at `at`, with its state and parts; it pops in. */
  putItem(it: Item, at: { x: number; z: number; y: number; yaw: number }): Item {
    this.sync()
    const w = this.world
    const p = insideRoom(num(at.x, 0), num(at.z, 0), Math.min(infoFor(this.library, it).radius, ROOM_HALF - 0.5))
    Object.assign(it, { x: p.x, y: clamp(num(at.y, 0), -2, 30), z: p.z, yaw: num(at.yaw, 0), pitch: 0, roll: 0, scale: 1, vx: 0, vy: 0, vz: 0, spin: 0 })
    Object.assign(it, { loose: false, holder: null, rider: null, born: w.t, fixed: false, attached: null })
    w.items.push(it)
    this.side.items.set(it.id, it)
    return it
  }

  /** A kind's model changed (the draft became the real thing): its items pop again with sparkles and settle on the ground. */
  refreshKind(kind: string): void {
    this.sync()
    const w = this.world
    const info = this.library.info(kind)
    let sparkled = false
    const sparkle = (x: number, y: number, z: number) => {
      addPuffs(w, { kind: 'spark', x, y, z, color: null, count: 14, size: 0.14, speed: 2.2, up: 1, life: 0.9, gravity: null })
      sparkled = true
    }
    for (const it of w.items) {
      if (it.kind !== kind) continue
      it.born = w.t
      const c = itemCentre(it, withAdded(info, it.added ?? null))
      sparkle(c[0], c[1], c[2])
      if (it.holder === null && it.rider === null && !it.fixed) this.runtime.setLoose(it, null)
    }
    for (const a of w.actors) {
      if (!SLOTS.some((s) => a.look.worn[s]?.kind === kind)) continue
      const head = headFrame(a).p
      sparkle(head[0], head[1], head[2])
    }
    if (sparkled) this.runtime.sound('magic')
  }

  // ------------------------------------------------------------------------------ actors

  private mustActor(id: string): Actor {
    const a = this.world.actors.find((x) => x.id === id)
    if (a === undefined) throw new Error(`no actor ${id}`)
    return a
  }

  /** One frame of an actor: a reaction first, else its step, else the next step if its action exists, else settling, else thinking, listening or the idle life. */
  private runActor(a: Actor) {
    const w = this.world
    if (a.joinedBy !== null) {
      const by = this.side.actors.get(a.joinedBy)
      if (by !== undefined && by !== a && (by.doing !== null || this.reactions.has(by.id))) {
        this.idleSince.set(a.id, w.t)
        return
      }
      this.free(a)
    }
    const r = this.reactions.get(a.id)
    if (r !== undefined) {
      this.idleSince.set(a.id, w.t)
      if (this.call(a, r) !== false) this.endReaction(a)
      return
    }
    if (a.doing !== null) {
      this.idleSince.set(a.id, w.t)
      this.advanceStep(a)
      return
    }
    const front = a.queue[0]
    const action = front === undefined ? undefined : this.library.actions.get(front.action)
    if (front !== undefined && action !== undefined) {
      this.settles.delete(a.id)
      this.idleSince.set(a.id, w.t)
      this.start(a, front, action)
      return
    }
    const s = this.settles.get(a.id)
    if (s !== undefined) {
      this.idleSince.set(a.id, w.t)
      if (this.call(a, s) !== false) this.settles.delete(a.id)
      return
    }
    this.ambient(a, front)
  }

  /** One frame of an actor's generator, run as that actor: true when it finished, false while it goes on, or what it threw. */
  private call(a: Actor, gen: Anim): boolean | { error: unknown } {
    this.runtime.current = a.id
    resetGuard()
    try {
      return gen.next().done === true
    } catch (error) {
      return { error }
    } finally {
      this.runtime.current = null
      this.cleanAfter(null)
    }
  }

  /** Everything code may have written since it was called made sane again: every actor (or the item whose process ran) and the items code got hold of. */
  private cleanAfter(ticked: Item | null) {
    const side = this.side
    if (ticked === null) for (const a of this.world.actors) this.cleanActor(a)
    else {
      cleanItemRoot(ticked)
      cleanItemData(ticked)
    }
    for (const id of side.touched) {
      const it = side.anyItem(id)
      if (it !== undefined) cleanItemData(it)
    }
    side.touched.clear()
  }

  private cleanActor(a: Actor) {
    cleanActorRoot(a)
    cleanPose(a)
    let good = this.side.looks.get(a.id)
    if (good === undefined) {
      good = goodLook(a.look)
      this.side.looks.set(a.id, good)
    }
    cleanLook(a, good)
  }

  private start(a: Actor, step: Step, action: LibAction) {
    const w = this.world
    a.queue.shift()
    a.thinking = null
    this.modes.set(a.id, 'idle')
    a.doing = { ...copyStep(step), since: w.t }
    w.events.push({ type: 'started', actor: a.id, step: copyStep(step) })
    if (action.entry !== null) {
      w.spotlight = a.id
      this.budgets.set(a.id, budget(BUDGET_MS))
    }
    // Things the step is about: riding one of them, the actor stays on.
    const keep = new Set<string>()
    let made: unknown
    this.runtime.current = a.id
    resetGuard()
    try {
      const args = this.runtime.args(a, step, action.params)
      for (const v of Object.values(args)) if (v !== null && typeof v === 'object' && 'isActor' in v && !v.isActor) keep.add(v.id)
      made = action.run(this.runtime.actor(a), args, this.api)
    } catch (error) {
      this.end(a, 'failed', describeError(error))
      return
    } finally {
      this.runtime.current = null
      this.cleanAfter(null)
    }
    this.tasks.set(a.id, stepTask(this.runtime, a, keep, made))
    this.advanceStep(a)
  }

  private advanceStep(a: Actor) {
    const task = this.tasks.get(a.id)
    if (task === undefined) {
      this.end(a, 'stopped', null)
      return
    }
    const b = this.budgets.get(a.id)
    const since = now()
    const r = this.call(a, task)
    const slow = b !== undefined && !within(b, this.world.frame, since)
    if (r === true) this.end(a, 'done', null)
    else if (r !== false) this.end(a, 'failed', describeError(r.error))
    else if (slow) this.end(a, 'failed', TOO_SLOW)
    else if (a.doing !== null && this.world.t - a.doing.since >= STEP_CAP) this.end(a, 'stopped', null)
  }

  /**
   * The step ends, however it ends: a done or failed event, the actors it joined go free, a
   * failure shrugs, and unless it ended sitting, riding or lying down on purpose, the actor is
   * put back on its feet.
   */
  private end(a: Actor, how: 'done' | 'failed' | 'stopped', error: string | null) {
    const w = this.world
    const doing = a.doing
    if (doing === null) return
    a.doing = null
    this.tasks.delete(a.id)
    this.budgets.delete(a.id)
    this.side.hopping.delete(a.id)
    const step = { action: doing.action, args: doing.args, serial: doing.serial }
    w.events.push(how === 'failed' ? { type: 'failed', actor: a.id, step, error: error ?? 'it went wrong' } : { type: 'done', actor: a.id, step })
    if (w.spotlight === a.id) w.spotlight = null
    // What the step picked up and still holds goes down nicely when its holder settles or starts anew.
    for (const [id, step] of this.side.picked) {
      if (step !== doing) continue
      this.side.picked.delete(id)
      const holder = this.side.items.get(id)?.holder ?? null
      if (holder === null) continue
      const list = this.side.leftovers.get(holder.actor) ?? new Set<string>()
      list.add(id)
      this.side.leftovers.set(holder.actor, list)
    }
    for (const b of w.actors) if (b.joinedBy === a.id) this.free(b)
    for (const [id, step] of this.side.left) if (step === doing) this.side.left.delete(id)
    this.idleSince.set(a.id, w.t)
    // The next turn turns round the feet again; the body stays where it is drawn.
    if ((a.pivot ?? 0) !== 0) this.runtime.setPivot(a, 0)
    if (how === 'failed') this.react(a.id, 'shrug')
    if (how !== 'done' || (a.riding === null && !isLying(a) && !isDown(a))) this.settle(a, true)
  }

  /** Another actor's action let go of it: its own step goes on, or it settles. */
  private free(a: Actor) {
    a.joinedBy = null
    if (a.doing === null && !this.reactions.has(a.id)) this.settle(a, false)
  }

  /** Starts settling if there is anything to settle; true if it did. */
  private settle(a: Actor, getOff: boolean): boolean {
    if (!needsSettling(this.runtime, a, getOff)) return false
    this.settles.set(a.id, settleDown(this.runtime, a, getOff))
    return true
  }

  /** Nothing running: waiting for an action being made (thinking), listening to the child, or the idle life. */
  private ambient(a: Actor, front: Step | undefined) {
    const w = this.world
    const mode: Mode = front !== undefined ? 'thinking' : a.listening ? 'listening' : 'idle'
    const before = this.modes.get(a.id) ?? 'idle'
    if (mode !== before) {
      this.modes.set(a.id, mode)
      if (before === 'thinking' && w.spotlight === a.id) w.spotlight = null
      if (mode === 'idle') {
        this.idleSince.set(a.id, w.t)
        if (this.settle(a, false)) return
      }
    }
    const k = 1 - Math.exp(-8 * STEP)
    const seat = this.runtime.seat(a)
    if (front !== undefined) {
      a.thinking ??= { about: front.action, since: w.t, progress: 0 }
      w.spotlight ??= a.id
      lerpPose(a.pose, a.pose, thinkPose(a, seat), k)
    } else if (a.listening) {
      lerpPose(a.pose, a.pose, listenPose(a, seat), k)
      if (a.riding === null) a.yaw += turnBetween(a.yaw, CAMERA_FACING) * (1 - Math.exp(-6 * STEP))
    } else {
      this.idle(a)
      return
    }
    this.idleSince.set(a.id, w.t)
    if (a.riding === null) {
      a.pitch *= 1 - k
      a.roll *= 1 - k
    }
  }

  /** Breathing, a glance about now and then, and after a while a turn toward the child. Asleep, only breathing. */
  private idle(a: Actor) {
    const w = this.world
    const t = w.t
    const phase = hash01(a.id, 7) * TAU
    a.pose.bob += 0.006 * (Math.sin(2.2 * t + phase) - Math.sin(2.2 * (t - STEP) + phase))
    if (w.frame % 15 === 0 && a.riding === null && a.y > this.runtime.groundUnder(a) + 0.05) {
      this.settle(a, false)
      return
    }
    if (isLying(a)) return
    const slot = Math.floor((t + phase) / 3.5)
    const look = hash01(a.id, slot) < 0.45 ? 0 : (hash01(a.id, slot + 1000) - 0.5) * 0.9
    a.pose.head.turn += (look - a.pose.head.turn) * (1 - Math.exp(-3 * STEP))
    if (a.riding === null && t - (this.idleSince.get(a.id) ?? 0) > 6) a.yaw += turnBetween(a.yaw, CAMERA_FACING) * (1 - Math.exp(-1.5 * STEP))
  }

  // ------------------------------------------------------------------------------ items

  /** The items' own processes, physics, carried and ridden things, puffs, bubbles and moods running out, and a last clean of everything. */
  private stepItems() {
    const w = this.world
    const side = this.side
    const lib = this.library
    this.syncWorn()
    for (const it of w.items) this.tick(it)
    // Worn things go on with their processes: a wand still sparkles in the hand.
    for (const it of [...side.worn.values()]) this.tick(it)
    stepPhysics(w, lib, side)
    this.carry()
    stepPuffs(w, skyOf(w).wind * WIND_SPEED, STEP)
    for (const a of w.actors) {
      if (a.bubble !== null && w.t > a.bubble.until) a.bubble = null
      if (a.mood !== 'happy' && w.t > a.moodUntil) a.mood = 'happy'
      this.cleanActor(a)
    }
    for (const it of w.items) cleanItemRoot(it)
    for (const id of side.exposed) {
      const it = side.anyItem(id)
      if (it === undefined) side.exposed.delete(id)
      else cleanItemData(it)
    }
  }

  /** One frame of a thing's process, if its kind has one that still works: three throws, or too much time, and the kind loses it. */
  private tick(it: Item) {
    const li = this.library.items.get(it.kind)
    if (li === undefined || li.tick === null) return
    const fails = this.tickFails.get(li) ?? 0
    if (fails >= 3) return
    let b = li.entry === null ? undefined : this.tickBudgets.get(li)
    if (li.entry !== null && b === undefined) this.tickBudgets.set(li, (b = budget(PROCESS_BUDGET_MS)))
    resetGuard()
    const since = now()
    try {
      li.tick(this.runtime.item(it), this.api, STEP)
    } catch {
      this.tickFails.set(li, fails + 1)
    }
    if (b !== undefined && !within(b, this.world.frame, since)) this.tickFails.set(li, 3)
    this.cleanAfter(it)
  }

  /** Every worn thing's stand-in follows its slot; a thing worn without having been in the room (a look from the library, code that set it) gets one now. */
  private syncWorn() {
    const w = this.world
    const side = this.side
    const live = new Set<string>()
    for (const a of w.actors) {
      for (const slot of SLOTS) {
        const worn = a.look.worn[slot]
        if (worn === undefined) {
          if (a.wornParts?.[slot] !== undefined) delete a.wornParts[slot]
          continue
        }
        const key = wornKey(a.id, slot)
        live.add(key)
        let it = side.worn.get(key)
        if (it === undefined || it.kind !== worn.kind) {
          if (it !== undefined) this.runtime.forget(it.id)
          it = newItem(`#i${w.nextId++}`, worn.kind, { x: a.x, y: a.y, z: a.z, yaw: a.yaw }, w.t, false, false, worn.tint)
          side.worn.set(key, it)
        }
        it.tint = worn.tint
        this.placeWorn(a, slot, it)
        // The scene poses the worn model with these.
        ;(a.wornParts ??= {})[slot] = it.parts
      }
    }
    for (const [key, it] of side.worn) {
      if (live.has(key)) continue
      side.worn.delete(key)
      this.runtime.forget(it.id)
    }
  }

  /** A stand-in where its slot is, as the scene draws it: a 'hand' thing upright in the right hand by its 'hand' anchor, the rest on the head, the body or the back, sized from the model kid to this body. */
  private placeWorn(a: Actor, slot: Slot, it: Item) {
    const info = infoFor(this.library, it)
    const pr = proportions(a.look)
    let f: Frame
    let size = a.scale
    if (slot === 'hand') {
      it.yaw = a.yaw
      it.pitch = it.roll = 0
      it.scale = clamp(a.scale, 0.2, 4)
      const grip = info.recipe.anchors.hand!
      const o = apply(itemRotation(it), grip.part === null ? grip.at : pointIn(partFrame(info.recipe, it.parts, grip.part), grip.at))
      const hand = handFrame(a, 'right', pr).p
      it.x = hand[0] - o[0] * it.scale
      it.y = hand[1] - o[1] * it.scale
      it.z = hand[2] - o[2] * it.scale
      return
    }
    if (slot === 'body') {
      f = rootFrame(a)
      size *= pr.shoulderY / 0.68
    } else if (slot === 'back') {
      f = backFrame(a, pr)
      size *= pr.shoulderY / 0.68
    } else {
      f = headFrame(a, pr)
      size *= pr.headR / KID_HEAD_R
    }
    const { yaw, pitch, roll } = anglesOf(f.r)
    Object.assign(it, { x: f.p[0], y: f.p[1], z: f.p[2], yaw, pitch, roll, scale: clamp(size, 0.2, 4) })
  }

  /** Held things follow their hands and riders sit on their things: riders of free things first, then what is held, then riders of held things. */
  private carry() {
    const w = this.world
    const side = this.side
    for (const a of w.actors) {
      for (const hand of HANDS) {
        const id = a.hands[hand]
        const it = id === null ? undefined : side.items.get(id)
        if (id !== null && (it === undefined || it.holder === null || it.holder.actor !== a.id)) a.hands[hand] = null
      }
    }
    for (const it of w.items) {
      if (it.rider !== null) {
        const r = side.actors.get(it.rider)
        if (r === undefined || r.riding !== it.id) it.rider = null
      }
    }
    this.carryRiders(false)
    for (const it of w.items) {
      if (it.holder === null) continue
      const a = side.actors.get(it.holder.actor)
      if (a === undefined || (a.hands.left !== it.id && a.hands.right !== it.id)) {
        it.holder = null
        this.runtime.setLoose(it, null)
        continue
      }
      placeHeld(it, a, infoFor(this.library, it), a.hands.left === it.id && a.hands.right === it.id && !proportions(a.look).animal)
    }
    this.placeAttached()
    this.carryRiders(true)
    this.carryStanders()
  }

  /**
   * Whoever stands on a thing's top (climbOnto) goes with it when it moves or turns: by however
   * far it went since the last frame, round its middle, as a rider goes with what it rides.
   */
  private carryStanders() {
    const side = this.side
    for (const a of this.world.actors) {
      const on = a.riding === null ? (a.on ?? null) : null
      const it = on === null ? undefined : side.items.get(on)
      if (it === undefined) {
        side.standing.delete(a.id)
        continue
      }
      const was = side.standing.get(a.id)
      if (was !== undefined && was.id === it.id) {
        const turn = it.yaw - was.yaw
        const dx = a.x - was.x
        const dz = a.z - was.z
        const c = Math.cos(turn)
        const s = Math.sin(turn)
        a.x = clamp(it.x + dx * c + dz * s, -ROOM_HALF, ROOM_HALF)
        a.z = clamp(it.z - dx * s + dz * c, -ROOM_HALF, ROOM_HALF)
        a.y = clamp(a.y + it.y - was.y, -2, 30)
        a.yaw += turn
      }
      side.standing.set(a.id, { id: it.id, x: it.x, y: it.y, z: it.z, yaw: it.yaw })
    }
  }

  /** Things fixed to others go where those are now, the ones they hang from first; one whose holder left the room comes loose. */
  private placeAttached() {
    const side = this.side
    const done = new Set<string>()
    const place = (it: Item, depth: number) => {
      const att = it.attached ?? null
      if (att === null || done.has(it.id)) return
      done.add(it.id)
      const up = side.items.get(att.to)
      if (up !== undefined && depth < 16) place(up, depth + 1)
      const f = holdFrame(side, this.library, att)
      if (f === null) this.runtime.detach(it, false)
      else placeIn(f, att, it)
    }
    for (const it of this.world.items) place(it, 0)
  }

  private carryRiders(onHeld: boolean) {
    const side = this.side
    for (const a of this.world.actors) {
      if (a.riding === null || side.hopping.has(a.id)) continue
      const it = side.items.get(a.riding)
      if (it === undefined || it.rider !== a.id) {
        this.runtime.unseat(a)
        this.settle(a, false)
        continue
      }
      // Riders of free things go first; riders of held things and of things fixed to others, after those are placed.
      if ((it.holder !== null || (it.attached ?? null) !== null) !== onHeld) continue
      const s = seatedRoot(a, it, infoFor(this.library, it))
      a.x = clamp(s.x, -ROOM_HALF, ROOM_HALF)
      a.y = clamp(s.y, -2, 30)
      a.z = clamp(s.z, -ROOM_HALF, ROOM_HALF)
      a.yaw = s.yaw
      a.pitch = s.pitch
      a.roll = s.roll
    }
  }
}
