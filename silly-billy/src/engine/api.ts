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

import type { Kit } from './kit'
import type { Words } from './lang'
import type { BodyKind, Effect, Hand, ItemMeta, ItemTraits, Look, Pose, RoomId, Slot } from './types'

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
  /** What pitch and roll turn the body round, as a share of its height: 0 its feet (the default: lying down, falling over), 0.5 its middle (cartwheels, somersaults). Back to 0 when the action ends. */
  pivot: number
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
  /** Walks to a target, or along a route of them one after another; speed in metres a second. */
  walkTo(target: Target | Target[], opts?: { run?: boolean; near?: number; speed?: number }): Anim
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
  /** Turns over round its middle in a hop: a cartwheel (sideways, to its left), a somersault (forward) or a back flip. */
  flip(how?: string, opts?: { turns?: number; secs?: number; height?: number; forward?: number }): Anim
  /** The states it is in, with the seconds each has left: { wet: 4.5, sick: 10 }. */
  readonly effects: Partial<Record<Effect, number>>
  /** Puts it in a state for `secs` (0 ends it): 'sick', 'dizzy', 'wet', 'cold', 'sleepy', 'hot', 'glowing'. */
  effect(name: string, secs?: number): void
  /** Puts down what it holds (or `item`) nicely: in front of it, or by `where` (a thing, a place, or 'back': where it was picked up). */
  putDown(item?: ItemApi | null, where?: Target | 'back' | null): Anim
  /** Walks back to where the thing was picked up and puts it down there. */
  putBack(item?: ItemApi | null): Anim
  /** Takes the thing and eats it bite by bite until it is gone (eats from one too big to carry); what it is decides how it tastes. */
  eat(item: ItemApi): Anim
  /** Keeps the thing in its hand when the action ends: things picked up in a made action are put down when it ends otherwise. */
  keep(item: ItemApi): void
  /** Does a library action as part of this one: by id or a word for it, its args by its params' names (things, actors, spots, or words read as a step's are). */
  do(action: string, args?: Record<string, unknown>): Anim
  /** Gets up onto a thing's top and stays there: hops up a low one, climbs a high one. Jumps and flips up there land on it again. */
  climbOnto(item: ItemApi): Anim
  /** Gets down off the thing it stands on, beside it toward `where`, else in front. */
  climbDown(where?: Target | null): Anim
  /** The thing whose top it stands on, or null. */
  readonly onTop: ItemApi | null
  /**
   * Moves a thing of any size to a target, at a side or the top of a thing when `where` says: carried, pushed when too big, by magic when built in or going up onto another (then fixed on it).
   * To a route (a list of targets), or to one point with a speed or someone aboard, it goes along at `speed` metres a second: carried along when it can be, else by itself, and whoever rides it or stands on it goes along.
   */
  moveThing(item: ItemApi, to: Target | Target[], where?: string | null, opts?: { speed?: number; face?: boolean }): Anim
}

/** A named part of one thing, live: offsets on its pivot and turn, and how it is drawn. */
export interface PartApi {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
  /** One colour for all of the part, or null for its own. */
  color: string | null
  /** False hides it. */
  show: boolean
  /** True: its glowing shapes shine (one without any glows all over); false: switched off; null: as the thing says. */
  glow: boolean | null
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
  /** How it is handled and what it is: food ('yummy', 'yucky', 'poison' or null), temp ('hot', 'cold' or null), soft. */
  readonly meta: ItemMeta & ItemTraits
  /** True: its glowing shapes shine (a thing without any glows all over); false: switched off; null: as built. */
  glow: boolean | null
  /** One colour for its glowing shapes, or null for their own. */
  glowColor: string | null
  /** The colour of a real light it gives off round it, or null. */
  light: string | null
  /** The names of its parts and of its anchors. */
  readonly parts: string[]
  readonly anchors: string[]
  /** A named part, live. An unknown name gives a part that does nothing. */
  part(name: string): PartApi
  /** Where a named point of the model is now; a missing name is the top middle. */
  anchor(name: string): Spot & { y: number }
  /** A point of its box now, in its own frame, each -1..1: x from its right to its left, y from its bottom to its top, z from its back to its front. */
  point(x?: number, y?: number, z?: number): Spot & { y: number }
  /** Adds shapes to this one thing with the model kit, kept with it; on the part named, if given. */
  add(build: (m: Kit) => unknown, part?: string): void
  /**
   * Puts it at another thing: 'front', 'back', 'left', 'right' (beside it on the ground, facing away), 'top' (on it), or an anchor or part of it.
   * `up`: a height in metres, or an anchor of the other: it is sized so its top reaches there (stairs, a ladder, a slide up to a floor).
   */
  putAt(target: ItemApi | ActorApi, where?: string, opts?: { up?: number | string }): void
  /** Fixes it to another thing or an actor (put at `where` first, if given, sized by `up` as putAt): it goes and turns with it until detached. */
  attachTo(target: ItemApi | ActorApi, where?: string, opts?: { up?: number | string }): void
  detach(): void
  readonly attachedTo: ItemApi | ActorApi | null
}

/** The sky, the light and the weather, the same in every room; it stays until changed. */
export interface SkyApi {
  /** Hours 0..24: 0 midnight, 6 sunrise, 12 noon, 18 sunset. */
  time: number
  /** How dark it is: 0 by day, 1 at night. */
  readonly night: number
  rain: number
  snow: number
  fog: number
  wind: number
  /** The sky painted one colour, or null for the time of day's; the sunlight's colour, or null. */
  color: string | null
  light: string | null
  /** Eases the values given there over `secs`, going on by itself; `yield*` it to wait until it is done. */
  fade(changes: Partial<Record<'time' | 'rain' | 'snow' | 'fog' | 'wind' | 'color' | 'light', number | string | null>>, secs?: number): Anim
}

/** This room's water (the pool, the pond). */
export interface PoolApi {
  /** 0 empty .. 1 full. */
  level: number
  /** The surface's height now. */
  readonly y: number
  color: string | null
  fade(changes: { level?: number; color?: string | null }, secs?: number): Anim
}

/** This room's ground. */
export interface GroundApi {
  /** A colour washed over it, or null for its own. */
  color: string | null
  fade(changes: { color?: string | null }, secs?: number): Anim
}

export interface WorldApi {
  readonly t: number
  readonly dt: number
  readonly room: RoomId
  /** Half the room's width: x and z stay within ±size. */
  readonly size: number
  readonly actors: ActorApi[]
  readonly items: ItemApi[]
  readonly sky: SkyApi
  readonly pool: PoolApi
  readonly ground: GroundApi
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
