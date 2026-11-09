/**
 * The engine's plain helpers over the world: random numbers, where an item's parts and
 * anchors are, what holds a thing up, the rest poses, the cleaning of everything made code
 * can write, and the words code may use for puffs, sounds and moods. Nothing here runs made
 * code.
 *
 * An item is drawn like an actor's root: at (x, y, z), rotated Euler(pitch, yaw, -roll, 'YXZ'),
 * scaled `scale`. A part sits at its pivot `at` plus its pose's (x, y, z), in its parent's
 * frame, rotated Euler(rot + (rx, ry, rz), 'XYZ'), scaled by its pose's s: in three.js a group
 * per part with position, rotation and scale set from those sums.
 */

import { anglesOf, apply, child, eulerXYZ, eulerYXZ, handFrame, hugFrame, IDENTITY, mul, pointIn, proportions, type Frame, type Mat3 } from './body'
import { boundsOf, parseColor } from './kit'
import { measure, type Library } from './library'
import { inWater, groundAt, ROOM_GEO, WATER_Y } from './rooms'
import { terrainOf } from './sky'
import {
  BODY_KINDS, MOODS, PUFF_KINDS, ROOM_HALF, SLOTS, SOUND_NAMES, restPose,
  type Actor, type Added, type BodyKind, type Doing, type Item, type ItemInfo, type Look, type Mood, type PartPose, type Pose, type PuffKind, type Recipe, type Slot, type SoundName, type Vec3, type World, type Worn,
} from './types'

/** The yaw that faces the camera (Castle Builder's CAMERA_YAW, 35 degrees): an idle actor turns this way to look at the child. */
export const CAMERA_FACING = (35 * Math.PI) / 180
export const GRAVITY = 9.8
export const TAU = Math.PI * 2
export const MAX_PUFFS = 600
/** More things than this in a room and making one more takes the oldest loose one away. */
export const MAX_ITEMS = 160
/** How long code may leave a thing in the air before it falls. */
export const PLACED_HOLD = 0.5

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
/** A finite number, or the fallback. */
export const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
/** Smooth 0 → 1 for k in 0..1. */
export const ease = (k: number) => {
  const t = clamp(num(k, 0), 0, 1)
  return t * t * (3 - 2 * t)
}
/** The shortest signed turn from yaw a to yaw b. */
export function turnBetween(a: number, b: number): number {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
/** A steady number in 0..1 from a string and a counter: idle glances that need no state. */
export function hash01(s: string, n: number): number {
  let h = 2166136261 ^ n
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

/** mulberry32, its state kept in the world so a copy goes on the same way. */
export function nextRandom(w: World): number {
  w.rng = (w.rng + 0x6d2b79f5) >>> 0
  let t = w.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ------------------------------------------------------------------------------ geometry

export const itemRotation = (it: Pick<Item, 'yaw' | 'pitch' | 'roll'>): Mat3 => eulerYXZ(it.pitch, it.yaw, -it.roll)

const merged = new WeakMap<Added, { base: Recipe; info: ItemInfo }>()

/**
 * A kind's info with one thing's own added shapes, parts and anchors (the kind's own when it has
 * none): what is drawn, where its anchors and parts are, how big it is. Made once per addition
 * and per model of the kind (a draft becoming the real thing makes it again).
 */
export function withAdded(info: ItemInfo, added: Added | null): ItemInfo {
  if (added === null) return info
  const known = merged.get(added)
  if (known !== undefined && known.base === info.recipe) return known.info
  const base = info.recipe
  const shapes = [...base.shapes, ...added.shapes]
  const parts = [...base.parts, ...added.parts]
  const recipe: Recipe = { shapes, parts, anchors: { ...base.anchors, ...added.anchors }, meta: base.meta, traits: base.traits, bounds: boundsOf(shapes, parts) }
  const out: ItemInfo = { ...info, recipe, ...measure(recipe.bounds) }
  merged.set(added, { base, info: out })
  return out
}

/** What the sim measures of this one thing: its kind's, with what code added to it. */
export const infoFor = (lib: Library, it: Item): ItemInfo => withAdded(lib.info(it.kind), it.added ?? null)

/** The water's surface in the room now: the full pool's at WATER_Y, lower as it empties, down to its floor. */
export function waterTop(w: World): number {
  const floor = ROOM_GEO[w.room].floor
  return floor + (WATER_Y - floor) * terrainOf(w, w.room).water
}

/** Over water that is there now: in the pool or the pond, and not emptied. */
export const wetAt = (w: World, x: number, z: number): boolean => terrainOf(w, w.room).water > 0.02 && inWater(w.room, x, z)

const ORIGIN: Frame = { p: [0, 0, 0], r: IDENTITY, s: 1 }

/** A part's frame in its item's own frame, with the item's part poses. */
export function partFrame(recipe: Recipe, parts: Record<string, PartPose>, name: string | null): Frame {
  if (name === null) return ORIGIN
  const def = recipe.parts.find((p) => p.name === name)
  if (def === undefined) return ORIGIN
  const parent = partFrame(recipe, parts, def.parent)
  // A copy of a part made under the same name moves with it.
  const pose = parts[def.pose ?? def.name]
  if (pose === undefined) return child(parent, def.at, eulerXYZ(def.rot[0], def.rot[1], def.rot[2]))
  const f = child(parent, [def.at[0] + pose.x, def.at[1] + pose.y, def.at[2] + pose.z], eulerXYZ(def.rot[0] + pose.rx, def.rot[1] + pose.ry, def.rot[2] + pose.rz))
  return { p: f.p, r: f.r, s: f.s * pose.s }
}

/** A point given in a part's frame (the item's own when part is null), in the world. */
export function itemPoint(it: Item, info: ItemInfo, part: string | null, local: Vec3): Vec3 {
  const inItem = part === null ? local : pointIn(partFrame(info.recipe, it.parts, part), local)
  return pointIn({ p: [it.x, it.y, it.z], r: itemRotation(it), s: it.scale }, inItem)
}

/** A named anchor now; a missing name is the top middle. */
export function anchorPoint(it: Item, info: ItemInfo, name: string): Vec3 {
  const a = info.recipe.anchors[name] ?? info.recipe.anchors.top!
  return itemPoint(it, info, a.part, a.at)
}

export const boundsCentre = (info: ItemInfo): Vec3 => {
  const { min, max } = info.recipe.bounds
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/** The middle of a thing: what is aimed at and puffed at. */
export const itemCentre = (it: Item, info: ItemInfo): Vec3 => itemPoint(it, info, null, boundsCentre(info))

/** How far below its base point a thing reaches (its bottom is at y + this), and how far above. */
export const bottomOf = (it: Item, info: ItemInfo) => info.recipe.bounds.min[1] * it.scale
export const heightOf = (it: Item, info: ItemInfo) => info.recipe.bounds.max[1] * it.scale

/** A solid thing standing still: a circle on the ground that blocks, and a top to stand on. */
export interface Solid {
  item: Item
  x: number
  z: number
  r: number
  top: number
}

export function solidsOf(w: World, library: Library): Solid[] {
  const out: Solid[] = []
  for (const it of w.items) {
    if (it.loose || it.holder !== null) continue
    const info = infoFor(library, it)
    if (info.recipe.meta.solid) out.push({ item: it, x: it.x, z: it.z, r: info.radius * it.scale, top: it.y + heightOf(it, info) })
  }
  return out
}

/** The height a thing at (x, z) whose bottom is at `from` stands on: the ground (the pool's floor under water), or the top of a solid thing under it no more than a step above. */
export function supportAt(w: World, solids: Solid[], x: number, z: number, from: number, skip: Item | null): number {
  let top = groundAt(w.room, x, z)
  for (const s of solids) {
    if (s.item === skip || s.top <= top || s.top > from + 0.3) continue
    const dx = x - s.x
    const dz = z - s.z
    if (dx * dx + dz * dz < s.r * s.r) top = s.top
  }
  return top
}

/** How much of its height an actor can have under water and still wade on the floor; deeper, it swims. */
const WADE_DEPTH = 0.6

/**
 * Where an actor's feet rest at (x, z) on `ground` (the floor or a solid thing): there, but in
 * water deeper than about half its height, up at the surface with its head out, swimming. A cat
 * or a shrunk kid must not walk on the pool's floor out of sight.
 */
export function restHeight(w: World, a: Pick<Actor, 'look' | 'scale'>, x: number, z: number, ground: number): number {
  if (!wetAt(w, x, z)) return ground
  return Math.max(ground, waterTop(w) - WADE_DEPTH * a.look.height * a.scale)
}

export const isLying = (a: Pick<Actor, 'pitch' | 'roll'>) => Math.abs(a.pitch) > 0.6 || Math.abs(a.roll) > 0.6

/** Sitting on the ground (or crouched low): its body lowered by 12 cm, a cat's (whose legs are short) by 4. The sim leaves it so until the next command. */
export const isDown = (a: Pick<Actor, 'pose' | 'look'>) => a.pose.bob < -(proportions(a.look).animal ? 0.04 : 0.12)

/**
 * A held thing follows its hand: its 'hand' anchor in the hand (an animal's mouth), upright,
 * turned with the actor, tipped by its own pitch and roll. A hugged one has its middle in
 * front of the chest.
 */
export function placeHeld(it: Item, a: Actor, info: ItemInfo, hug: boolean): void {
  it.yaw = a.yaw
  let target: Vec3
  let local: Vec3
  if (hug) {
    target = hugFrame(a, ((info.size[2] / 2) * it.scale) / a.scale).p
    local = boundsCentre(info)
  } else {
    target = handFrame(a, it.holder!.hand).p
    const anchor = info.recipe.anchors.hand!
    local = anchor.part === null ? anchor.at : pointIn(partFrame(info.recipe, it.parts, anchor.part), anchor.at)
  }
  const o = apply(itemRotation(it), local)
  it.x = target[0] - o[0] * it.scale
  it.y = target[1] - o[1] * it.scale
  it.z = target[2] - o[2] * it.scale
}

/** Where a rider's feet go and how it is turned: its hips on the 'seat' anchor, turned with the seat's part. */
export function seatedRoot(a: Actor, it: Item, info: ItemInfo): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } {
  const seat = info.recipe.anchors.seat!
  const { yaw, pitch, roll } = anglesOf(mul(itemRotation(it), partFrame(info.recipe, it.parts, seat.part).r))
  const p = itemPoint(it, info, seat.part, seat.at)
  const hip = apply(eulerYXZ(pitch, yaw, -roll), [0, proportions(a.look).hipY * a.scale, 0])
  return { x: p[0] - hip[0], y: p[1] - hip[1], z: p[2] - hip[2], yaw, pitch, roll }
}

// ------------------------------------------------------------------------------ poses

/** How an actor sits on what it rides: astride ('ride') or on a seat ('sit'). */
export type Seat = 'ride' | 'sit'

/** Standing at rest, the arms round what it carries; seated when it rides or sits on something. */
export function restFor(a: Actor, seat: Seat | null): Pose {
  const p = restPose()
  if (proportions(a.look).animal) return p
  const { left, right } = a.hands
  if (left !== null && left === right) {
    p.armL = { swing: 1.0, raise: 0.3, bend: 0.8 }
    p.armR = { swing: 1.0, raise: 0.3, bend: 0.8 }
  } else {
    if (right !== null) p.armR = { swing: 0.35, raise: 0.1, bend: 0.7 }
    if (left !== null) p.armL = { swing: 0.35, raise: 0.1, bend: 0.7 }
  }
  if (seat === 'ride') {
    p.lean = 0.15
    p.legL = { swing: 1.2, raise: 0.15, bend: 1.1 }
    p.legR = { swing: 1.2, raise: 0.15, bend: 1.1 }
    if (right === null) p.armR = { swing: 1.15, raise: 0.1, bend: 0.4 }
    if (left === null) p.armL = { swing: 1.15, raise: 0.1, bend: 0.4 }
  } else if (seat === 'sit') {
    p.legL = { swing: 1.5, raise: 0.08, bend: 1.5 }
    p.legR = { swing: 1.5, raise: 0.08, bend: 1.5 }
  }
  return p
}

/** Hand on the chin, head tipped: working something out. The free hand goes to the chin. */
export function thinkPose(a: Actor, seat: Seat | null): Pose {
  const p = restFor(a, seat)
  if (proportions(a.look).animal) {
    p.head = { nod: -0.2, turn: 0.2, tilt: 0.35 }
    p.tail = 0.6
    return p
  }
  // Found by search to bring the hand to the chin of a kid and of a grown-up alike (the elbow forward: chibi arms are short).
  const chin = { swing: 1.55, raise: 1.3, bend: 1.9 }
  const fold = { swing: 0.55, raise: 0.1, bend: 1.5 }
  if (a.hands.right === null) {
    p.armR = chin
    if (a.hands.left === null) p.armL = fold
  } else if (a.hands.left === null) p.armL = chin
  p.head = { nod: -0.12, turn: 0.2, tilt: 0.22 }
  return p
}

/** A hand cupped at the ear and the head tipped toward the child. */
export function listenPose(a: Actor, seat: Seat | null): Pose {
  const p = restFor(a, seat)
  p.head = { nod: -0.05, turn: 0, tilt: 0.3 }
  if (proportions(a.look).animal) {
    p.tail = 0.8
    return p
  }
  const ear = { swing: 2.05, raise: -0.15, bend: 2.05 }
  if (a.hands.right === null) p.armR = ear
  else if (a.hands.left === null) p.armL = ear
  return p
}

export const LIMB_KEYS = ['swing', 'raise', 'bend'] as const
export const HEAD_KEYS = ['nod', 'turn', 'tilt'] as const
export const LIMBS = ['armL', 'armR', 'legL', 'legR'] as const
export const POSE_NUMBERS = ['lean', 'tilt', 'twist', 'bob', 'squash', 'tail'] as const
const POSE_KEYS: readonly string[] = [...POSE_NUMBERS, 'head', ...LIMBS]

export const copyPose = (p: Pose): Pose => ({
  lean: p.lean,
  tilt: p.tilt,
  twist: p.twist,
  bob: p.bob,
  squash: p.squash,
  tail: p.tail,
  head: { ...p.head },
  armL: { ...p.armL },
  armR: { ...p.armR },
  legL: { ...p.legL },
  legR: { ...p.legR },
})

/** Sets every joint of `out` to `from` moved the fraction k of the way to `to` (`out` may be `from`: then it eases toward `to`). */
export function lerpPose(out: Pose, from: Pose, to: Pose, k: number): void {
  for (const key of POSE_NUMBERS) out[key] = from[key] + (to[key] - from[key]) * k
  for (const key of HEAD_KEYS) out.head[key] = from.head[key] + (to.head[key] - from.head[key]) * k
  for (const limb of LIMBS) for (const key of LIMB_KEYS) out[limb][key] = from[limb][key] + (to[limb][key] - from[limb][key]) * k
}

/** How far a pose is from another, summed over the joints. */
export function poseDistance(a: Pose, b: Pose): number {
  let d = 0
  for (const key of POSE_NUMBERS) d += Math.abs(a[key] - b[key])
  for (const key of HEAD_KEYS) d += Math.abs(a.head[key] - b.head[key])
  for (const limb of LIMBS) for (const key of LIMB_KEYS) d += Math.abs(a[limb][key] - b[limb][key])
  return d
}

// ------------------------------------------------------------------------------ cleaning what code wrote

/** An angle kept finite and within ±2π (a turn more is the same pose), or the rest value. */
const angle = (v: unknown, rest: number) => (typeof v === 'number' && Number.isFinite(v) ? (v > TAU || v < -TAU ? v % TAU : v) : rest)
/** A whole-body angle: finite; spins may run on, but not into the millions. */
const turn = (v: number) => (Number.isFinite(v) ? (v > 1e4 || v < -1e4 ? v % TAU : v) : 0)

export type Loose = Record<string, unknown>
export const isObject = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v)

function trimKeys(o: Loose, keep: readonly string[]) {
  const keys = Object.keys(o)
  if (keys.length !== keep.length) for (const k of keys) if (!keep.includes(k)) delete o[k]
}

function cleanJoint(v: unknown, keys: readonly string[]): Loose {
  const o = isObject(v) ? v : {}
  for (const k of keys) o[k] = angle(o[k], 0)
  trimKeys(o, keys)
  return o
}

/** The joints: every value finite, angles within ±2π, squash 0.3..2, bob -1..5, nothing else in it. */
export function cleanPose(a: Actor): void {
  try {
    if (!isObject(a.pose)) throw new Error('no pose')
    const p = a.pose as unknown as Loose
    p.lean = angle(p.lean, 0)
    p.tilt = angle(p.tilt, 0)
    p.twist = angle(p.twist, 0)
    p.tail = angle(p.tail, 0)
    p.bob = clamp(num(p.bob, 0), -1, 5)
    p.squash = clamp(num(p.squash, 1), 0.3, 2)
    p.head = cleanJoint(p.head, HEAD_KEYS)
    for (const limb of LIMBS) p[limb] = cleanJoint(p[limb], LIMB_KEYS)
    trimKeys(p, POSE_KEYS)
  } catch {
    a.pose = restPose()
  }
}

const COLOURS = ['skin', 'eyes', 'top', 'bottom', 'shoes'] as const
const LOOK_KEYS = ['body', 'height', 'build', 'skin', 'eyes', 'top', 'bottom', 'shoes', 'skirt', 'worn']

export const copyWorn = (worn: Partial<Record<Slot, Worn>>): Partial<Record<Slot, Worn>> => {
  const out: Partial<Record<Slot, Worn>> = {}
  for (const slot of SLOTS) {
    const w = worn[slot]
    if (w) out[slot] = { kind: w.kind, tint: w.tint }
  }
  return out
}
export const copyLook = (look: Look): Look => ({ ...look, worn: copyWorn(look.worn) })

/** A look to put bad values back to: the given one with its colours parsed (grey where they do not parse) and its sizes in bounds. */
export function goodLook(look: Look): Look {
  const l = copyLook(look)
  for (const k of COLOURS) l[k] = parseColor(l[k]) ?? '#c9ced6'
  if (!BODY_KINDS.includes(l.body)) l.body = 'kid'
  l.height = clamp(num(l.height, 1.15), 0.25, 3)
  l.build = clamp(num(l.build, 1), 0.6, 1.6)
  l.skirt = Boolean(l.skirt)
  return l
}

/** The worn things: known slots only, each { kind, tint } (a bare kind is taken as one), tints as '#rrggbb'. */
function cleanWorn(v: unknown, good: Look): Loose {
  if (!isObject(v)) return copyWorn(good.worn) as Loose
  for (const slot of Object.keys(v)) {
    const e = v[slot]
    if (!SLOTS.includes(slot as Slot) || e === null || e === undefined) {
      delete v[slot]
      continue
    }
    const before = good.worn[slot as Slot]
    if (typeof e === 'string' && e.trim() !== '') v[slot] = { kind: e.trim().slice(0, 48), tint: null }
    else if (!isObject(e) || typeof e.kind !== 'string' || e.kind.trim() === '') {
      if (before) v[slot] = { kind: before.kind, tint: before.tint }
      else delete v[slot]
    } else {
      e.kind = e.kind.trim().slice(0, 48)
      if (e.tint === undefined || e.tint === null) e.tint = null
      else if (e.tint !== before?.tint) e.tint = parseColor(e.tint) ?? before?.tint ?? null
      trimKeys(e, ['kind', 'tint'])
    }
  }
  good.worn = copyWorn(v as Partial<Record<Slot, Worn>>)
  return v
}

/** The look: colours as '#rrggbb' (a bad one is put back to the last good one), a known body, sizes in bounds. `good` follows every accepted change. */
export function cleanLook(a: Actor, good: Look): void {
  try {
    if (!isObject(a.look)) throw new Error('no look')
    const l = a.look as unknown as Loose
    for (const k of COLOURS) {
      if (l[k] === good[k]) continue
      const c = parseColor(l[k])
      if (c === null) l[k] = good[k]
      else l[k] = good[k] = c
    }
    if (l.body !== good.body) {
      if (BODY_KINDS.includes(l.body as BodyKind)) good.body = l.body as BodyKind
      else l.body = good.body
    }
    l.height = good.height = clamp(num(l.height, good.height), 0.25, 3)
    l.build = good.build = clamp(num(l.build, good.build), 0.6, 1.6)
    l.skirt = good.skirt = Boolean(l.skirt)
    l.worn = cleanWorn(l.worn, good)
    trimKeys(l, LOOK_KEYS)
  } catch {
    a.look = copyLook(good)
  }
}

/** Where it is and how it is turned: finite, inside the room, a sane size. */
export function cleanActorRoot(a: Actor): void {
  a.x = clamp(num(a.x, 0), -ROOM_HALF, ROOM_HALF)
  a.z = clamp(num(a.z, 0), -ROOM_HALF, ROOM_HALF)
  a.y = clamp(num(a.y, 0), -2, 30)
  a.yaw = turn(a.yaw)
  a.pitch = turn(a.pitch)
  a.roll = turn(a.roll)
  a.scale = clamp(num(a.scale, 1), 0.2, 4)
  if (a.pivot !== undefined) a.pivot = clamp(num(a.pivot, 0), 0, 1)
}

export function cleanItemRoot(it: Item): void {
  it.x = clamp(num(it.x, 0), -ROOM_HALF, ROOM_HALF)
  it.z = clamp(num(it.z, 0), -ROOM_HALF, ROOM_HALF)
  it.y = clamp(num(it.y, 0), -2, 30)
  it.yaw = turn(it.yaw)
  it.pitch = turn(it.pitch)
  it.roll = turn(it.roll)
  it.scale = clamp(num(it.scale, 1), 0.2, 4)
  it.vx = clamp(num(it.vx, 0), -40, 40)
  it.vy = clamp(num(it.vy, 0), -40, 40)
  it.vz = clamp(num(it.vz, 0), -40, 40)
  it.spin = clamp(num(it.spin, 0), -60, 60)
}

const PART_KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'color', 'show', 'glow']

/** An item's own numbers and its parts' offsets: only finite numbers stay (true and false become 1 and 0). */
export function cleanItemData(it: Item): void {
  try {
    if (!isObject(it.state)) throw new Error('no state')
    const s = it.state as Loose
    let n = 0
    for (const k of Object.keys(s)) {
      const v = s[k]
      if (++n > 64) delete s[k]
      else if (typeof v === 'boolean') s[k] = v ? 1 : 0
      else if (typeof v !== 'number' || !Number.isFinite(v)) delete s[k]
      else if (v > 1e9 || v < -1e9) s[k] = clamp(v, -1e9, 1e9)
    }
  } catch {
    it.state = {}
  }
  try {
    if (!isObject(it.parts)) throw new Error('no parts')
    const parts = it.parts as Loose
    for (const name of Object.keys(parts)) {
      const p = parts[name]
      if (!isObject(p)) {
        delete parts[name]
        continue
      }
      p.x = clamp(num(p.x, 0), -30, 30)
      p.y = clamp(num(p.y, 0), -30, 30)
      p.z = clamp(num(p.z, 0), -30, 30)
      p.rx = angle(p.rx, 0)
      p.ry = angle(p.ry, 0)
      p.rz = angle(p.rz, 0)
      p.s = clamp(num(p.s, 1), 0.01, 20)
      // How it is drawn: a colour or null, shown or not, glowing, switched off or as the thing says; anything else is as built.
      if (p.color !== undefined && p.color !== null) p.color = parseColor(p.color)
      if (p.show !== undefined) p.show = p.show !== false && p.show !== 0
      if (p.glow !== undefined && p.glow !== null) p.glow = typeof p.glow === 'boolean' ? p.glow : null
      trimKeys(p, PART_KEYS)
    }
  } catch {
    it.parts = {}
  }
}

// ------------------------------------------------------------------------------ the words code may use

const PUFF_WORDS: Record<string, PuffKind> = {
  sparkle: 'spark', sparkles: 'spark', sparks: 'spark', glitter: 'spark', magic: 'spark', twinkle: 'spark', hearts: 'heart', love: 'heart',
  stars: 'star', water: 'drop', drops: 'drop', splash: 'drop', rain: 'drop', music: 'note', notes: 'note', bubbles: 'bubble',
  leaves: 'leaf', snowflake: 'snow', snowflakes: 'snow', party: 'confetti', steam: 'smoke', cloud: 'smoke', flame: 'fire', flames: 'fire',
  sand: 'dust', dirt: 'dust', poof: 'smoke',
}
export const PUFF_COLOR: Record<PuffKind, string> = {
  dust: '#d9c7a3', spark: '#fff3a0', heart: '#ff5fae', star: '#f5d33b', drop: '#7cc4f0', note: '#4b3fa8', bubble: '#cdeeff', leaf: '#5ec25a',
  snow: '#ffffff', confetti: '#e8503f', smoke: '#e2e6ec', fire: '#f5a13b',
}
const PUFF_GRAVITY: Record<PuffKind, number> = {
  dust: 0.6, spark: 0, heart: -0.6, star: 1.5, drop: 9.8, note: -0.5, bubble: -0.7, leaf: 0.7, snow: 0.5, confetti: 2.5, smoke: -0.6, fire: -1.4,
}
const CONFETTI = ['#e8503f', '#f5d33b', '#4a78e0', '#5ec25a', '#ff5fae', '#9b5fd3']

const SOUND_WORDS: Record<string, SoundName> = {
  cheer: 'yay', hooray: 'yay', hurray: 'yay', laugh: 'giggle', laughter: 'giggle', hehe: 'giggle', jump: 'boing', bounce: 'boing', spring: 'boing',
  swoosh: 'whoosh', swish: 'whoosh', woosh: 'whoosh', wind: 'whoosh', throw: 'whoosh', water: 'splash', hit: 'bonk', bump: 'bonk', thud: 'bonk',
  boop: 'bonk', cat: 'meow', purr: 'meow', dog: 'woof', bark: 'woof', sparkle: 'magic', spell: 'magic', twinkle: 'magic', poof: 'magic',
  boom: 'crash', bang: 'crash', smash: 'crash', walk: 'step', footstep: 'step', footsteps: 'step', steps: 'step', eat: 'munch', chomp: 'munch',
  crunch: 'munch', ring: 'bell', chime: 'bell', beat: 'drum', sleep: 'snore', zzz: 'snore', electric: 'zap', laser: 'zap', squeeze: 'squeak',
  toy: 'squeak', win: 'ding', ping: 'ding', click: 'pop', paddle: 'swim', swimming: 'swim',
}

const MOOD_WORDS: Record<string, Mood> = {
  confused: 'surprised', focused: 'happy', excited: 'happy', tired: 'sleepy', cross: 'angry', shy: 'love', glad: 'happy', joy: 'happy',
  joyful: 'happy', proud: 'happy', calm: 'happy', cheerful: 'happy', upset: 'sad', unhappy: 'sad', crying: 'sad', lonely: 'sad',
  shocked: 'surprised', amazed: 'surprised', wow: 'surprised', curious: 'surprised', funny: 'silly', goofy: 'silly', playful: 'silly',
  cheeky: 'silly', mad: 'angry', grumpy: 'angry', bored: 'sleepy', sleep: 'sleepy', loving: 'love', loved: 'love', hearts: 'love',
  afraid: 'scared', frightened: 'scared', fear: 'scared', nervous: 'scared',
}

const word = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().trim() : '')

export function puffKind(v: unknown): PuffKind {
  const k = word(v)
  return PUFF_KINDS.includes(k as PuffKind) ? (k as PuffKind) : (PUFF_WORDS[k] ?? 'spark')
}

/** Any word as a sound the game has: a near one from a small table, else 'pop'. */
export function soundName(v: unknown): SoundName {
  const k = word(v)
  return SOUND_NAMES.includes(k as SoundName) ? (k as SoundName) : (SOUND_WORDS[k] ?? 'pop')
}

/** Any word as a mood the face can show: a near one from a small table, else 'happy'. */
export function moodName(v: unknown): Mood {
  const k = word(v)
  return MOODS.includes(k as Mood) ? (k as Mood) : (MOOD_WORDS[k] ?? 'happy')
}

export interface PuffSpec {
  kind: PuffKind
  x: number
  y: number
  z: number
  color: string | null
  count: number
  size: number
  speed: number
  up: number
  life: number
  gravity: number | null
}

/** A burst of particles flying out every way, at most MAX_PUFFS in the world (the oldest go). */
export function addPuffs(w: World, s: PuffSpec): void {
  const gravity = s.gravity ?? PUFF_GRAVITY[s.kind]
  for (let i = 0; i < s.count; i++) {
    const a = nextRandom(w) * TAU
    const e = nextRandom(w) * 2 - 1
    const h = Math.sqrt(1 - e * e)
    const v = s.speed * (0.35 + 0.65 * nextRandom(w))
    w.puffs.push({
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      vx: Math.cos(a) * h * v,
      vy: e * v + s.up,
      vz: Math.sin(a) * h * v,
      color: s.color ?? (s.kind === 'confetti' ? CONFETTI[i % CONFETTI.length]! : PUFF_COLOR[s.kind]),
      size: s.size * (0.7 + 0.6 * nextRandom(w)),
      born: w.t,
      life: s.life * (0.75 + 0.5 * nextRandom(w)),
      gravity,
    })
  }
  if (w.puffs.length > MAX_PUFFS) w.puffs.splice(0, w.puffs.length - MAX_PUFFS)
}

// ------------------------------------------------------------------------------ what the sim keeps beside the world

export const wornKey = (actor: string, slot: Slot) => `${actor}|${slot}`

/** State of one run that is not part of the world: never saved, empty again for a copy of the world. */
export class Side {
  /** Items and actors by id, rebuilt at the start of every step and kept up to date by the sim. */
  readonly items = new Map<string, Item>()
  readonly actors = new Map<string, Actor>()
  /** Seconds a loose thing has lain still on the ground. */
  readonly still = new Map<string, number>()
  /** Who let go of a loose thing: it does not hit them until it has left them. */
  readonly thrownBy = new Map<string, string>()
  /** Loose things that already hit someone since they were let go. */
  readonly hitDone = new Set<string>()
  /** Items code put somewhere by hand, and when it last did: left in the air, they fall. */
  readonly placed = new Map<string, number>()
  /** Items whose state or parts code has had in its hands: cleaned after every call. */
  readonly exposed = new Set<string>()
  /** Items whose state or parts code got during the call now running: cleaned as soon as it returns. */
  readonly touched = new Set<string>()
  /** Loose things lying on something or floating: not flying. */
  readonly grounded = new Set<string>()
  /** Each actor's last good look, to put back a bad colour. */
  readonly looks = new Map<string, Look>()
  /** How each rider sits on its thing. */
  readonly seats = new Map<string, Seat>()
  /** Actors hopping onto a thing: it does not carry them yet. */
  readonly hopping = new Set<string>()
  /** Each worn thing's stand-in, by wornKey: kept out of the room, following its slot, so its process runs and code's handle on it stays live. */
  readonly worn = new Map<string, Item>()
  /** The line each actor's voice is saying, until when, and for which step: it is not started again while it lasts. */
  readonly voiced = new Map<string, { text: string; until: number; doing: Doing | null }>()
  /** Actors a newer command took out of another actor's step that had them joined, by that step: it cannot take them in again. */
  readonly left = new Map<string, Doing>()
  /** Things picked up while a made action ran, by the step it was: still held when it ends, they are put down nicely (me.keep takes one out). */
  readonly picked = new Map<string, Doing>()
  /** Things each actor is to put down nicely when it settles or starts its next step (unless that step is about them). */
  readonly leftovers = new Map<string, Set<string>>()
  /** Where the thing each actor stands on was last frame: when it moves or turns, whoever stands on it goes with it. */
  readonly standing = new Map<string, { id: string; x: number; y: number; z: number; yaw: number }>()
  /** Sounds asked for this frame: a loop full of them plays a few. */
  sounds = 0
  /** Lines said aloud this frame, the same way: a few in all, and a line or two from each actor ("kaikki sanokaa hei" is everyone's hello). */
  speeches = 0
  readonly spoken = new Map<string, number>()

  /** Who wears this stand-in, and where; null for anything else. */
  wearerOf(it: Item): { actor: string; slot: Slot } | null {
    for (const [key, s] of this.worn) {
      if (s !== it) continue
      const at = key.lastIndexOf('|')
      return { actor: key.slice(0, at), slot: key.slice(at + 1) as Slot }
    }
    return null
  }

  /** A thing code may hold a handle on: one in the room, or a worn one's stand-in. */
  anyItem(id: string): Item | undefined {
    const it = this.items.get(id)
    if (it !== undefined) return it
    for (const s of this.worn.values()) if (s.id === id) return s
    return undefined
  }

  index(w: World): void {
    this.items.clear()
    for (const it of w.items) this.items.set(it.id, it)
    this.actors.clear()
    for (const a of w.actors) this.actors.set(a.id, a)
  }

  forgetItem(id: string): void {
    this.items.delete(id)
    this.picked.delete(id)
    this.still.delete(id)
    this.thrownBy.delete(id)
    this.hitDone.delete(id)
    this.placed.delete(id)
    this.exposed.delete(id)
    this.grounded.delete(id)
  }

  /** Forgets everything about the things in the room (they went away, or the world was swapped). */
  clearItems(): void {
    for (const m of [this.still, this.thrownBy, this.placed, this.picked, this.leftovers]) m.clear()
    for (const s of [this.hitDone, this.exposed, this.touched, this.grounded]) s.clear()
  }
}
