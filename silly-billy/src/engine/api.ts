/**
 * What library code sees: an action is `function* (me, args, w)`, an item's model is
 * `function (m)` (the Kit), an item's process is `function (it, w, dt)`. The built-in actions
 * are written in TypeScript against these same interfaces, and `apidoc.ts` says the same
 * thing in words for the designer model. `runtime.ts` implements them over the plain world.
 *
 * Every setter forgives: a value that is not a finite number is ignored, positions stay
 * inside the room, sizes and angles are clamped. A helper that takes time is a generator to
 * be called with `yield*`; one `yield` is one sim step (1/60 s).
 */

import type { Words } from './lang'
import type { BodyKind, Hand, Look, Pose, RoomId, Slot } from './types'

/** A helper that takes time: run it with `yield*`. */
export type Anim = Generator<void, void, void>

/** A place on the ground, with an optional height. */
export interface Spot {
  x: number
  z: number
  y?: number
}

/** Anything an action can aim at: an actor, an item or a place. */
export type Target = ActorApi | ItemApi | Spot

/** Only the joints to change, for poseTo: { armR: { raise: 2 }, head: { nod: 0.3 } }. */
export type PoseChange = {
  [K in keyof Pose]?: Pose[K] extends number ? number : Partial<Pose[K]>
}

export interface PuffOpts {
  x?: number
  y?: number
  z?: number
  /** Where to puff instead of x, y, z: at a thing's middle. */
  at?: Target
  kind?: string
  color?: string
  count?: number
  size?: number
  speed?: number
  /** Extra upward speed, m/s. */
  up?: number
  life?: number
  gravity?: number
}

export interface ActorApi {
  readonly isActor: true
  readonly id: string
  /** In the game's language for a starting avatar. Setting it renames the actor in both languages, and the new name is heard from then on. */
  name: string
  readonly kind: BodyKind
  readonly height: number
  readonly radius: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  scale: number
  /** The joints, live: set them and they stay. */
  readonly pose: Pose
  /** The look, live: set a colour to repaint it ('top', 'bottom', 'shoes', 'skin', 'eyes', a worn thing's tint). Bad colours are put back. */
  readonly look: Look
  readonly riding: ItemApi | null
  /** Doing something of its own right now, or told something else since the action asking took it in (w.join). */
  readonly busy: boolean
  /** A speech bubble in the game's language: { en, fi }, or a plain string shown as it is in both (a name, a number, the child's own words). */
  say(words: Words, secs?: number): void
  /** Says the words aloud in its own voice too, with the bubble: the child's own words (a text arg), or { en, fi } in the game's language. */
  speak(words: Words, secs?: number): void
  feel(mood: string, secs?: number): void
  holding(hand?: Hand): ItemApi | null
  /** Where its hand (an animal's mouth) is now. */
  handAt(hand?: Hand): Spot & { y: number }
  /** Where its head's middle is now. */
  headAt(): Spot & { y: number }
  /** The point `dist` metres in front of it (side: + to its left). */
  ahead(dist: number, side?: number): Spot
  walkTo(target: Target, opts?: { run?: boolean; near?: number }): Anim
  turnTo(target: Target): Anim
  pickUp(item: ItemApi, hand?: Hand): Anim
  drop(hand?: Hand): ItemApi | null
  jump(height?: number, forward?: number): Anim
  poseTo(change: PoseChange, secs?: number): Anim
  rest(secs?: number): Anim
  ride(item: ItemApi): Anim
  sitOn(item: ItemApi | null): Anim
  getOff(): Anim
  wear(item: ItemApi, slot?: Slot): void
  takeOff(slot: Slot): ItemApi | null
  tumble(): Anim
}

export interface ItemApi {
  readonly isActor: false
  readonly id: string
  readonly kind: string
  /** In the game's language: 'ball', or 'pallo' in Finnish. */
  readonly name: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  scale: number
  vx: number
  vy: number
  vz: number
  readonly size: { w: number; h: number; d: number }
  readonly radius: number
  readonly holder: ActorApi | null
  /** Who wears it (it is then a stand-in that goes with them), or null. */
  readonly wearer: ActorApi | null
  readonly rider: ActorApi | null
  readonly fixed: boolean
  readonly flying: boolean
  tint: string | null
  readonly state: Record<string, number>
  /** A named part's offsets, live: { x, y, z, rx, ry, rz, s }. An unknown name gives a part that moves nothing. */
  part(name: string): { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }
  /** Where a named point of the model is now; a missing name is the top middle. */
  anchor(name: string): Spot & { y: number }
}

export interface WorldApi {
  readonly t: number
  readonly dt: number
  readonly room: RoomId
  /** Half the room's width: x and z stay within ±size. */
  readonly size: number
  readonly actors: ActorApi[]
  readonly items: ItemApi[]
  find(kind: string, opts?: { near?: Target; not?: ItemApi | ItemApi[]; free?: boolean }): ItemApi | null
  actor(name: string): ActorApi | null
  make(kind: string, opts?: { x?: number; y?: number; z?: number; near?: Target; yaw?: number }): ItemApi
  remove(item: ItemApi): void
  throw(item: ItemApi, target: Target, opts?: { speed?: number; arc?: number }): number
  launch(item: ItemApi, vx: number, vy: number, vz: number): void
  touching(a: Target, b: Target): boolean
  distance(a: Target, b: Target): number
  angleTo(from: Target, to: Target): number
  water(x: number, z: number): boolean
  groundAt(x: number, z: number): number
  puff(opts: PuffOpts): void
  sound(name: string): void
  random(): number
  pick<T>(list: readonly T[]): T
  lerp(a: number, b: number, k: number): number
  clamp(v: number, lo: number, hi: number): number
  /** Smooth 0 → 1 → for k in 0..1. */
  ease(k: number): number
  wait(secs: number): Anim
  during(secs: number, fn: (k: number, dt: number) => void): Anim
  until(cond: () => boolean, maxSecs?: number): Anim
  /** Runs several helpers side by side until all are done: two actors walking at once. */
  together(...anims: Anim[]): Anim
  /** Another actor takes part as if told to: what it was doing stops, and it is free again when this action ends. A command of its own takes it out (then it is busy). */
  join(actor: ActorApi): void
}

/** Arguments, by the action's param names: an actor, an item, a place, text or a number, or null when nothing fitted. */
export type Args = Record<string, ActorApi | ItemApi | Spot | string | number | null>

export type ActionFn = (me: ActorApi, args: Args, w: WorldApi) => Anim
export type TickFn = (it: ItemApi, w: WorldApi, dt: number) => void
