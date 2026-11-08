/**
 * The basic verbs: 22 of the actions Silly Billy ships with (the group games in games.ts are
 * the others), written against the same API the designer's made actions use (engine/api.ts).
 * Everything else (throw, ride, dance, swim) is invented. Each one is short, bouncy and readable from far away: poses, faces, puffs and
 * sounds. Sit and sleep end sitting or lying down, and the sim leaves them so; before the
 * next step it gets the actor up (runtime.ts's prelude), and walkTo and jump stand up too.
 * Every line they say is in both languages, and the bubble shows the game's.
 */

import { CAMERA_YAW, palette } from '../../../castle-builder/src/scene/look'
import type { ActorApi, Anim, Args, ItemApi, PoseChange, Spot, Target, WorldApi } from '../engine/api'
import type { Words } from '../engine/lang'
import type { BuiltinAction } from '../engine/library'
import type { Param, ParamKind } from '../engine/protocol'
import { SLOTS, type Hand, type Limb, type Slot } from '../engine/types'
import { colorOf } from './colors'

// ------------------------------------------------------------------------------ reading the args

type Arg = Args[string] | undefined

const actorOf = (v: Arg): ActorApi | null => (typeof v === 'object' && v !== null && 'isActor' in v && v.isActor ? v : null)
const itemOf = (v: Arg): ItemApi | null => (typeof v === 'object' && v !== null && 'isActor' in v && !v.isActor ? v : null)
const targetOf = (v: Arg): Target | null => (typeof v === 'object' && v !== null ? v : null)
const textOf = (v: Arg): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null)
/** A count from a number arg, kept between 1 and `most`; `fallback` when none was given. */
const countOf = (v: Arg, fallback: number, most: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(most, Math.round(v))) : fallback)

// ------------------------------------------------------------------------------ small helpers

export const animal = (a: ActorApi) => a.kind === 'cat' || a.kind === 'dog'
const hello = (a: ActorApi): Words => (a.kind === 'cat' ? { en: 'Meow!', fi: 'Miau!' } : a.kind === 'dog' ? { en: 'Woof!', fi: 'Hau!' } : { en: 'Hi!', fi: 'Hei!' })
/** Hello to someone by name, which is in the game's language. */
const hiTo = (a: ActorApi): Words => ({ en: `Hi ${a.name}!`, fi: `Hei ${a.name}!` })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Arms up in joy; an animal lifts its front paws and wags. */
export const cheer = (a: ActorApi): PoseChange => (animal(a) ? { armL: { swing: 0.7 }, armR: { swing: 0.7 }, tail: 1 } : { armL: { raise: 2.6, bend: 0.2 }, armR: { raise: 2.6, bend: 0.2 } })
/** Pointing ahead; an animal stretches its nose out. */
export const point = (a: ActorApi): PoseChange => (animal(a) ? { lean: 0.15, head: { nod: -0.25 } } : { armR: { swing: 1.55, raise: 0.1, bend: 0 } })
/** Just one arm. */
const arm = (hand: Hand, limb: Partial<Limb>): PoseChange => (hand === 'right' ? { armR: limb } : { armL: limb })

/** How far it is to a target's edge: an actor's, a thing's, or that of the thing standing on a spot (a place given as a thing). walkTo's `near` is this gap. */
function gapTo(me: ActorApi, w: WorldApi, to: Target): number {
  const d = w.distance(me, to)
  if ('isActor' in to) return d - to.radius - me.radius
  const under = w.items.find((it) => it.holder === null && w.distance(it, to) < 0.01)
  return under ? d - under.radius - me.radius : d
}

/** A spot `dist` metres off, roughly ahead, inside the room. */
function wanderSpot(me: ActorApi, w: WorldApi, dist: number): Spot {
  const a = me.yaw + (w.random() - 0.5) * 2.4
  const m = w.size - 1
  return { x: w.clamp(me.x + Math.sin(a) * dist, -m, m), z: w.clamp(me.z + Math.cos(a) * dist, -m, m) }
}

/** A point toward the camera: turning to it faces the child. */
export const towardCamera = (me: ActorApi): Spot => ({ x: me.x + Math.sin(CAMERA_YAW) * 4, z: me.z + Math.cos(CAMERA_YAW) * 4 })

function nearestActor(me: ActorApi, w: WorldApi): ActorApi | null {
  let best: ActorApi | null = null
  for (const a of w.actors) if (a.id !== me.id && (best === null || w.distance(me, a) < w.distance(me, best))) best = a
  return best
}

/** A hand with nothing in it; a worn wand fills the right one. */
const freeHand = (a: ActorApi): Hand | null => (a.holding('right') === null && a.look.worn.hand === undefined ? 'right' : a.holding('left') === null ? 'left' : null)

/** The hand holding this thing or one of its kind (anything at all, for null), right first. */
function handWith(a: ActorApi, like: ItemApi | null): Hand | null {
  for (const hand of ['right', 'left'] as const) {
    const held = a.holding(hand)
    if (held && (like === null || held.id === like.id || held.kind === like.kind)) return hand
  }
  return null
}

/** A puff of magic at a thing: stars, sparks and the magic sound. */
export function sparkle(w: WorldApi, at: Target) {
  w.sound('magic')
  w.puff({ at, kind: 'star', color: palette.sparkle, count: 10, size: 0.14, speed: 1.6, up: 1.2, life: 0.9 })
  w.puff({ at, kind: 'spark', color: '#ffffff', count: 8, size: 0.08, speed: 2.2, life: 0.6 })
}

/** Palms up and a tilt of the head: that did not make sense. */
export function* shrug(me: ActorApi, w: WorldApi, words: Words): Anim {
  me.feel('surprised')
  me.say(words)
  yield* me.poseTo(animal(me) ? { head: { tilt: 0.4 }, tail: -0.5 } : { armL: { raise: 0.9, bend: 1.2 }, armR: { raise: 0.9, bend: 1.2 }, head: { tilt: 0.3 } }, 0.25)
  yield* w.wait(0.8)
  yield* me.rest()
}

/** A happy little hop with arms up. */
function* hop(me: ActorApi, w: WorldApi): Anim {
  yield* w.together(me.jump(0.35), me.poseTo(cheer(me), 0.12))
}

/** One arm up, waving a few times, and hello (an animal lifts a paw and meows). */
function* waveHello(me: ActorApi, w: WorldApi, times: number, to: ActorApi | null): Anim {
  me.feel('happy')
  if (animal(me)) w.sound(me.kind === 'cat' ? 'meow' : 'woof')
  yield* me.poseTo(animal(me) ? { armR: { swing: 1.3, bend: 0.4 }, tail: 1 } : { armR: { swing: 0.3, raise: 2.7, bend: 0.2 }, head: { tilt: 0.15 } }, 0.2)
  me.say(to && !animal(me) ? hiTo(to) : hello(me))
  for (let i = 0; i < times; i++) {
    yield* me.poseTo(animal(me) ? { armR: { bend: 0.9 }, tail: -1 } : { armR: { raise: 2.3, bend: 0.7 } }, 0.14)
    yield* me.poseTo(animal(me) ? { armR: { bend: 0.2 }, tail: 1 } : { armR: { raise: 2.9, bend: 0.1 } }, 0.14)
  }
}

// ------------------------------------------------------------------------------ the verbs

function* walkOrRun(me: ActorApi, args: Args, w: WorldApi, run: boolean): Anim {
  const to = targetOf(args.to) ?? wanderSpot(me, w, run ? 6 : 3.5)
  me.feel('happy')
  if (run) {
    me.say(w.pick([{ en: 'Zoom!', fi: 'Vauhtia!' }, { en: 'Wheee!', fi: 'Jippii!' }, { en: 'Here I go!', fi: 'Nyt mennään!' }]))
    w.sound('whoosh')
  }
  let moving = true
  const go = function* (): Anim {
    yield* me.walkTo(to, { run, near: 0.3 })
    moving = false
  }
  const dust = function* (): Anim {
    while (moving) {
      if (run && w.random() < 0.25) w.puff({ x: me.x, y: 0.05, z: me.z, kind: 'dust', count: 2, size: 0.12, speed: 0.5, up: 0.4, life: 0.5 })
      yield
    }
  }
  yield* w.together(go(), dust())
  if ('isActor' in to) yield* me.turnTo(to)
  yield* me.poseTo(run ? { lean: -0.35, armL: { raise: 0.9 }, armR: { raise: 0.9 } } : { squash: 0.88 }, 0.12)
  yield* me.rest(0.25)
}

/** Where each actor stands when called to the front: its own spot in a row, the first in the middle. */
const COME_Z = 7.2
const COME_X = [0, -1.3, 1.3, -2.6, 2.6, -3.9, 3.9, -5.2, 5.2, -6.5, 6.5]

function* come(me: ActorApi, args: Args, w: WorldApi): Anim {
  void args // come takes nothing: it always comes to the front
  const i = w.actors.findIndex((a) => a.id === me.id)
  const spot = { x: COME_X[i % COME_X.length]!, z: COME_Z }
  me.feel('happy')
  me.say(w.pick([{ en: 'Coming!', fi: 'Tulen!' }, { en: 'Yes!', fi: 'Joo!' }, { en: 'On my way!', fi: 'Tulossa!' }]))
  yield* me.walkTo(spot, { run: w.distance(me, spot) > 6, near: 0.25 })
  yield* me.turnTo(towardCamera(me))
  yield* waveHello(me, w, 3, null)
  yield* me.rest()
}

function* pickUp(me: ActorApi, args: Args, w: WorldApi): Anim {
  let it = itemOf(args.thing)
  if (it === null) {
    // Nothing named: the nearest little loose thing will do.
    const small = w.items.filter((i) => !i.fixed && i.holder === null && i.rider === null && Math.max(i.size.w, i.size.h, i.size.d) < 1.3)
    small.sort((a, b) => w.distance(me, a) - w.distance(me, b))
    it = small[0] ?? null
  }
  if (it === null) return yield* shrug(me, w, { en: 'Nothing here!', fi: 'Ei täällä mitään!' })
  if (it.holder?.id === me.id) {
    me.say({ en: 'Got it!', fi: 'Sain sen!' })
    return yield* hop(me, w)
  }
  const owner = it.holder
  if (owner) {
    yield* me.walkTo(owner, { near: 0.3 })
    yield* me.turnTo(owner)
    me.say({ en: 'Please?', fi: 'Saanko?' })
    yield* me.poseTo(point(me), 0.25)
    owner.say({ en: 'OK!', fi: 'Ole hyvä!' })
    owner.drop(handWith(owner, it) ?? 'right')
  }
  const hand = freeHand(me) ?? 'right'
  if (me.holding(hand)) me.drop(hand)
  yield* me.pickUp(it, hand)
  if (it.holder?.id !== me.id) return yield* me.rest()
  me.feel('happy')
  w.sound('pop')
  yield* me.poseTo(animal(me) ? { head: { nod: -0.3 }, tail: 1 } : arm(hand, { swing: 2.4, bend: 0.3 }), 0.25)
  me.say(w.pick([{ en: 'Got it!', fi: 'Sain sen!' }, { en: 'Yay!', fi: 'Jee!' }, { en: 'Mine!', fi: 'Minun!' }]))
  yield* w.wait(0.5)
  yield* me.rest()
}

function* drop(me: ActorApi, args: Args, w: WorldApi): Anim {
  const hand = handWith(me, itemOf(args.thing)) ?? handWith(me, null)
  if (hand === null) return yield* shrug(me, w, { en: 'Nothing!', fi: 'Ei mitään!' })
  yield* me.poseTo(animal(me) ? { head: { nod: 0.4 } } : { ...arm(hand, { swing: 0.9 }), lean: 0.25 }, 0.2)
  me.drop(hand)
  w.sound('pop')
  yield* w.wait(0.35)
  me.say(w.pick([{ en: 'There!', fi: 'Kas noin!' }, { en: 'Oops!', fi: 'Hups!' }, { en: 'Done!', fi: 'Valmis!' }]))
  yield* me.rest()
}

function* give(me: ActorApi, args: Args, w: WorldApi): Anim {
  const want = itemOf(args.thing)
  const to = actorOf(args.to) ?? nearestActor(me, w)
  let hand = handWith(me, want) ?? (want === null ? handWith(me, null) : null)
  if (hand === null && want !== null) {
    hand = freeHand(me) ?? 'right'
    if (me.holding(hand)) me.drop(hand)
    yield* me.pickUp(want, hand)
    if (want.holder?.id !== me.id) return yield* me.rest()
  }
  const it = hand === null ? null : me.holding(hand)
  if (hand === null || it === null) return yield* shrug(me, w, { en: 'Nothing to give!', fi: 'Minulla ei ole mitään!' })
  if (to === null || to.id === me.id) {
    me.say({ en: 'Mine!', fi: 'Minun!' })
    yield* me.poseTo(arm(hand, { swing: 1, bend: 1.4 }), 0.3)
    yield* w.wait(0.6)
    return yield* me.rest()
  }
  yield* me.walkTo(to, { near: 0.35 })
  w.join(to)
  yield* w.together(me.turnTo(to), to.turnTo(me))
  me.say({ en: 'For you!', fi: 'Sinulle!' })
  const toHand = freeHand(to) ?? 'right'
  if (to.holding(toHand)) to.drop(toHand)
  yield* w.together(me.poseTo(arm(hand, { swing: 1.4, bend: 0.2 }), 0.3), to.poseTo(arm(toHand, { swing: 1.2, bend: 0.3 }), 0.3))
  const mid = { x: (me.x + to.x) / 2, y: me.handAt(hand).y, z: (me.z + to.z) / 2 }
  me.drop(hand)
  // The thing hangs in the air between them until it is taken.
  const hold = function* (): Anim {
    for (let t = 0; t < 3 && it.holder === null; t += w.dt) {
      it.x = mid.x
      it.y = mid.y
      it.z = mid.z
      it.vx = 0
      it.vy = 0
      it.vz = 0
      yield
    }
  }
  yield* w.together(to.pickUp(it, toHand), hold())
  if (it.holder?.id === to.id) {
    to.feel('love')
    to.say(w.pick([{ en: 'Thank you!', fi: 'Kiitos!' }, { en: 'Thanks!', fi: 'Kiitti!' }, { en: 'Yay!', fi: 'Jee!' }]))
    w.puff({ at: to, kind: 'heart', count: 5, size: 0.15, speed: 0.6, up: 1, life: 1.2 })
    w.sound('ding')
  }
  yield* w.together(me.rest(), to.rest())
}

/** Hopping to a place starts this far from it; farther, it walks there first. */
const HOPS_FROM = 4

function* jump(me: ActorApi, args: Args, w: WorldApi): Anim {
  const to = targetOf(args.to)
  const gap = () => (to ? Math.max(0, gapTo(me, w, to) - 0.3) : 0)
  // Far away: walk most of the way, then hop the rest.
  if (to && gap() > HOPS_FROM) yield* me.walkTo(to, { near: HOPS_FROM })
  const n = countOf(args.times, to ? Math.min(12, Math.max(1, Math.ceil(gap() / 0.9))) : 3, 12)
  me.feel('happy')
  for (let i = 0; i < n; i++) {
    if (to) yield* me.turnTo(to)
    w.sound('boing')
    yield* w.together(me.jump(0.65, Math.min(1.1, gap() / (n - i))), me.poseTo(cheer(me), 0.15))
    w.puff({ x: me.x, y: 0.05, z: me.z, kind: 'dust', count: 5, size: 0.12, speed: 0.8, up: 0.3, life: 0.5 })
    yield* me.poseTo(animal(me) ? { tail: -0.5 } : { armL: { raise: 0.4 }, armR: { raise: 0.4 } }, 0.08)
  }
  me.say(w.pick([{ en: 'Boing!', fi: 'Poing!' }, { en: 'Hop hop!', fi: 'Hyppy hyppy!' }, { en: 'Wee!', fi: 'Hui!' }]))
  yield* me.rest()
}

function* wave(me: ActorApi, args: Args, w: WorldApi): Anim {
  yield* me.turnTo(targetOf(args.to) ?? towardCamera(me))
  yield* waveHello(me, w, 4, actorOf(args.to))
  yield* me.rest()
}

function* sit(me: ActorApi, args: Args, w: WorldApi): Anim {
  yield* me.sitOn(itemOf(args.on))
  me.feel('happy')
  me.say(w.pick([{ en: 'Ahh!', fi: 'Ihanaa!' }, { en: 'Comfy!', fi: 'Mukavaa!' }, { en: 'Nice!', fi: 'Kivaa!' }]))
  // Happy to sit: the legs swing (an animal's tail swishes) and settle. It stays sitting.
  const legL = me.pose.legL.bend
  const legR = me.pose.legR.bend
  const tail = me.pose.tail
  yield* w.during(1.2, (k) => {
    const s = Math.sin(k * Math.PI * 4) * 0.3 * (1 - k)
    if (animal(me)) me.pose.tail = tail + s * 2
    else {
      me.pose.legL.bend = legL + s
      me.pose.legR.bend = legR - s
    }
  })
}

function* sleep(me: ActorApi, args: Args, w: WorldApi): Anim {
  const on = itemOf(args.on)
  if (on && me.riding?.id !== on.id) yield* me.walkTo(on, { near: 0.3 })
  me.feel('sleepy', 120)
  me.say(w.pick([{ en: 'Yawn!', fi: 'Nukuttaa!' }, { en: 'So sleepy...', fi: 'Niin väsyttää...' }, { en: 'Night night!', fi: 'Hyvää yötä!' }]))
  yield* me.poseTo(animal(me) ? { lean: -0.3, armL: { swing: 1 }, armR: { swing: 1 }, tail: 1 } : { armL: { raise: 2.7 }, armR: { raise: 2.7 }, squash: 1.12, head: { nod: -0.3 } }, 0.5)
  yield* w.wait(0.4)
  if (on) {
    // Leaning back on the thing, arms loose.
    yield* me.sitOn(on)
    yield* me.poseTo({ lean: -1, squash: 1, armL: { swing: 0, raise: 0.5, bend: 0.3 }, armR: { swing: 0, raise: 0.5, bend: 0.3 }, head: { nod: -0.25, tilt: 0.35 } }, 0.6)
  } else if (animal(me)) {
    // Curled up on its side, paws tucked, tail round.
    const roll = me.roll
    yield* w.together(
      w.during(0.7, (k) => {
        me.roll = roll + (1.45 - roll) * w.ease(k)
      }),
      me.poseTo({ lean: 0.1, bob: 0.1 * (me.look.height / 0.5), squash: 1, armL: { swing: 0.5, bend: 0.9 }, armR: { swing: 0.5, bend: 0.9 }, legL: { swing: -0.4, bend: 0.9 }, legR: { swing: -0.4, bend: 0.9 }, head: { nod: 0.3, tilt: -0.3 }, tail: 1.3 }, 0.7),
    )
  } else {
    // Flat on its back, tipping over backwards about its feet.
    const pitch = me.pitch
    yield* w.together(
      w.during(0.7, (k) => {
        me.pitch = pitch + (-Math.PI / 2 - pitch) * w.ease(k)
      }),
      me.poseTo({ bob: 0.11 * (me.look.height / 1.15), lean: 0, squash: 1, armL: { swing: 0, raise: 0.5, bend: 0.3 }, armR: { swing: 0, raise: 0.5, bend: 0.3 }, legL: { swing: 0, raise: 0.08, bend: 0 }, legR: { swing: 0, raise: 0.08, bend: 0 }, head: { nod: 0, turn: 0, tilt: 0.3 } }, 0.7),
    )
  }
  me.say({ en: 'Zzz...', fi: 'Zzz...' }, 5)
  for (let i = 0; i < 3; i++) {
    w.sound('snore')
    const head = me.headAt()
    w.puff({ x: head.x, y: head.y + 0.25, z: head.z, kind: 'bubble', color: '#bfe4ff', count: 2, size: 0.12, speed: 0.2, up: 0.5, life: 1.6, gravity: -0.2 })
    yield* w.wait(1.1)
  }
}

function* spin(me: ActorApi, args: Args, w: WorldApi): Anim {
  const turns = countOf(args.times, 2, 8)
  const yaw = me.yaw
  me.feel('silly')
  w.sound('whoosh')
  yield* me.poseTo(animal(me) ? { tail: 1.2, head: { turn: 0.7 } } : { armL: { raise: 1.5 }, armR: { raise: 1.5 }, head: { tilt: 0.2 } }, 0.2)
  yield* w.during(0.6 * turns, (k, dt) => {
    me.yaw = yaw + w.ease(k) * Math.PI * 2 * turns
    me.pose.bob = 0.06 * Math.abs(Math.sin(k * Math.PI * turns * 2))
    if (w.random() < dt * 8) w.puff({ at: me, kind: 'star', color: palette.sparkle, count: 1, size: 0.1, speed: 1.5, life: 0.6 })
  })
  me.yaw = yaw
  me.say(w.pick([{ en: 'Wheee!', fi: 'Jippii!' }, { en: 'So dizzy!', fi: 'Huimaa!' }, { en: 'Round and round!', fi: 'Ympäri ympäri!' }]))
  // Dizzy: a wobble that dies away.
  yield* w.during(1, (k) => {
    me.pose.tilt = 0.3 * Math.sin(k * 14) * (1 - k)
    me.pose.head.tilt = -0.35 * Math.sin(k * 11) * (1 - k)
  })
  w.sound('giggle')
  yield* me.rest()
}

function* say(me: ActorApi, args: Args, w: WorldApi): Anim {
  const words = (textOf(args.words) ?? '...').slice(0, 60)
  me.feel('happy')
  yield* me.poseTo(animal(me) ? { head: { nod: -0.3 }, tail: 1 } : { armL: { raise: 0.7, swing: 0.4, bend: 0.4 }, armR: { raise: 0.7, swing: 0.4, bend: 0.4 }, head: { nod: -0.12 } }, 0.2)
  if (animal(me)) w.sound(me.kind === 'cat' ? 'meow' : 'woof')
  // Aloud in its own voice too: the child's own words, and six-year-olds do not read.
  me.speak(words, Math.min(5, 2 + words.length * 0.06))
  yield* me.poseTo({ squash: 1.1 }, 0.12)
  yield* me.poseTo({ squash: 1 }, 0.15)
  yield* w.wait(1.2)
  yield* me.rest()
}

/** Following ends after this long, or once the one followed has stood still for STILL_SECS beside it. */
const FOLLOW_SECS = 15
const STILL_SECS = 3

function* follow(me: ActorApi, args: Args, w: WorldApi): Anim {
  const who = actorOf(args.who) ?? nearestActor(me, w)
  if (who === null) return yield* shrug(me, w, { en: 'Who?', fi: 'Kuka?' })
  if (who.id === me.id) {
    // Following yourself is chasing your own tail.
    me.say({ en: 'Silly me!', fi: 'Hassu minä!' })
    return yield* spin(me, {}, w)
  }
  me.feel('happy')
  me.say(w.pick([{ en: 'Wait for me!', fi: 'Odota minua!' }, { en: 'Coming!', fi: 'Tulen!' }, { en: 'I follow you!', fi: 'Seuraan sinua!' }]))
  const end = w.t + FOLLOW_SECS
  let still = 0
  while (w.t < end && still < STILL_SECS) {
    const t0 = w.t
    const from = { x: who.x, z: who.z }
    const gap = gapTo(me, w, who)
    if (gap > 0.9) yield* me.walkTo(who, { run: gap > 5, near: 0.5 })
    else {
      yield* me.turnTo(who)
      yield* w.wait(0.25)
    }
    still = w.distance(who, from) < 0.1 ? still + (w.t - t0) : 0
  }
  me.say({ en: 'Fun!', fi: 'Kivaa!' })
  yield* me.rest()
}

function* look(me: ActorApi, args: Args, w: WorldApi): Anim {
  const at = targetOf(args.at)
  const shade: PoseChange = animal(me) ? { tail: 0.6 } : { armR: { swing: 2.3, raise: 0.25, bend: 1.9 } }
  if (at) {
    yield* me.turnTo(at)
    const eye = me.headAt().y
    const y = 'isActor' in at ? (at.isActor ? at.headAt().y : at.y + at.size.h / 2) : (at.y ?? 0)
    const nod = w.clamp(Math.atan2(eye - y, Math.max(0.3, w.distance(me, at))), -0.5, 0.8)
    yield* me.poseTo({ ...shade, lean: 0.15, head: { nod } }, 0.3)
    me.feel('surprised')
    me.say('isActor' in at ? (at.isActor ? hiTo(at) : `${capital(at.name)}!`) : { en: 'Ooh!', fi: 'Oho!' })
    yield* w.wait(1.4)
  } else {
    yield* me.poseTo(shade, 0.25)
    yield* me.poseTo({ head: { turn: 0.9 } }, 0.5)
    yield* w.wait(0.3)
    yield* me.poseTo({ head: { turn: -0.9 } }, 0.8)
    yield* w.wait(0.3)
    me.say({ en: 'Hmm...', fi: 'Hmm...' })
    yield* me.poseTo({ head: { turn: 0 } }, 0.3)
  }
  yield* me.rest()
}

function* make(me: ActorApi, args: Args, w: WorldApi): Anim {
  const kind = textOf(args.thing)
  if (kind === null) return yield* shrug(me, w, { en: 'Make what?', fi: 'Mitä teen?' })
  const color = colorOf(textOf(args.color))
  me.feel('happy')
  yield* me.poseTo(cheer(me), 0.25)
  const spot = me.ahead(1.2)
  w.sound('magic')
  yield* w.during(0.8, (k, dt) => {
    if (animal(me)) me.pose.tail = Math.sin(k * 20)
    else me.pose.armL.raise = me.pose.armR.raise = 2.4 + 0.3 * Math.sin(k * 25)
    if (w.random() < dt * 20) w.puff({ x: spot.x, y: 0.3 + k, z: spot.z, kind: 'spark', color: palette.sparkle, count: 1, size: 0.1, speed: 1.2, life: 0.6 })
  })
  // It stands in front of its maker, clear of it however big it is, facing the child.
  const it = w.make(kind)
  if (color) it.tint = color
  sparkle(w, it)
  w.puff({ at: it, kind: 'confetti', count: 16, size: 0.1, speed: 2, up: 1.5, life: 1.2 })
  me.say(w.pick([{ en: 'Ta-da!', fi: 'Tadaa!' }, { en: 'Look!', fi: 'Katso!' }, { en: 'Magic!', fi: 'Taikaa!' }]))
  yield* me.poseTo(animal(me) ? { tail: 1, head: { nod: 0.2 } } : { armL: { swing: 0.6, raise: 1.2, bend: 0 }, armR: { swing: 0.6, raise: 1.2, bend: 0 } }, 0.2)
  yield* w.wait(0.6)
  yield* me.rest()
}

function* remove(me: ActorApi, args: Args, w: WorldApi): Anim {
  const it = itemOf(args.thing)
  if (it === null) return yield* shrug(me, w, { en: 'Remove what?', fi: 'Mitä poistan?' })
  if (it.holder?.id !== me.id) {
    if (w.distance(me, it) > 7) yield* me.walkTo(it, { near: 5 })
    yield* me.turnTo(it)
    yield* me.poseTo(point(me), 0.25)
  }
  w.sound('magic')
  const scale = it.scale
  yield* w.during(0.6, (k, dt) => {
    it.scale = scale * (1 + 0.25 * Math.sin(k * Math.PI * 3))
    if (w.random() < dt * 25) w.puff({ at: it, kind: 'spark', color: palette.sparkle, count: 1, size: 0.1, speed: 1.5, life: 0.5 })
  })
  w.puff({ at: it, kind: 'star', color: palette.sparkle, count: 12, size: 0.14, speed: 2, up: 1, life: 0.8 })
  w.remove(it)
  me.say(w.pick([{ en: 'Poof!', fi: 'Poks!' }, { en: 'Bye bye!', fi: 'Hei hei!' }, { en: 'Gone!', fi: 'Poissa!' }]))
  yield* w.wait(0.4)
  yield* me.rest()
}

function* wear(me: ActorApi, args: Args, w: WorldApi): Anim {
  const kind = textOf(args.thing)
  if (kind === null) return yield* shrug(me, w, { en: 'Wear what?', fi: 'Mitä puen?' })
  const color = colorOf(textOf(args.color))
  const head = me.headAt()
  // One held already goes on; otherwise a new one pops up by magic above the head.
  const held = (['right', 'left'] as const).map((h) => me.holding(h)).find((i) => i?.kind === kind) ?? null
  const it = held ?? w.make(kind, { x: head.x, y: head.y + 0.5, z: head.z })
  if (color) it.tint = color
  me.feel('happy')
  yield* me.poseTo(animal(me) ? { head: { nod: -0.4 }, tail: 1 } : { armL: { swing: 2.7, raise: 0.3, bend: 1.3 }, armR: { swing: 2.7, raise: 0.3, bend: 1.3 } }, 0.25)
  sparkle(w, me)
  me.wear(it)
  const worn = SLOTS.map((s) => me.look.worn[s]).find((wn) => wn?.kind === it.kind)
  if (worn && color) worn.tint = color
  yield* me.rest(0.2)
  yield* hop(me, w)
  w.sound('yay')
  me.say(w.pick([{ en: 'Ta-da!', fi: 'Tadaa!' }, { en: 'Look at me!', fi: 'Katso minua!' }, { en: 'So pretty!', fi: 'Niin nätti!' }]))
  yield* w.wait(0.5)
  yield* me.rest()
}

/** A part of a person: one colour of the look, the clothes, or a slot a thing is worn in. Paint and take-off read them. */
type PaintPart = 'top' | 'bottom' | 'shoes' | 'skin' | 'eyes' | 'clothes' | Slot

/** What a child calls each part, in English or Finnish: a word starting with the stem means that part. */
const PART_WORDS: readonly (readonly [string, PaintPart])[] = [
  ['top', 'top'], ['shirt', 'top'], ['jumper', 'top'], ['paita', 'top'], ['paida', 'top'], ['pusero', 'top'], ['takki', 'top'], ['taki', 'top'],
  ['bottom', 'bottom'], ['trousers', 'bottom'], ['pants', 'bottom'], ['skirt', 'bottom'], ['shorts', 'bottom'], ['housu', 'bottom'], ['hame', 'bottom'],
  ['shoe', 'shoes'], ['kenk', 'shoes'], ['keng', 'shoes'],
  ['skin', 'skin'], ['fur', 'skin'], ['iho', 'skin'], ['turkki', 'skin'], ['turki', 'skin'], ['naama', 'skin'], ['kasvo', 'skin'],
  ['eye', 'eyes'], ['silmä', 'eyes'],
  ['clothes', 'clothes'], ['dress', 'clothes'], ['vaatte', 'clothes'], ['mekko', 'clothes'], ['meko', 'clothes'],
  ['hair', 'hair'], ['tukka', 'hair'], ['tuka', 'hair'], ['hius', 'hair'], ['hiuks', 'hair'],
  ['head', 'head'], ['hat', 'head'], ['cap', 'head'], ['lippi', 'head'], ['lakki', 'head'], ['laki', 'head'],
  ['face', 'face'], ['glasses', 'face'], ['lasi', 'face'], ['lase', 'face'],
  ['body', 'body'], ['back', 'back'], ['selkä', 'back'], ['selä', 'back'], ['hand', 'hand'], ['käsi', 'hand'], ['käde', 'hand'],
]
const partOf = (word: string | null): PaintPart | null => (word === null ? null : (PART_WORDS.find(([stem]) => word.toLowerCase().startsWith(stem))?.[1] ?? null))

/** What comes off first when nothing is named: hats before glasses before hair. */
const TAKE_OFF_ORDER: readonly Slot[] = ['head', 'face', 'hand', 'back', 'body', 'hair']

/** Where the hands go to take a thing off its slot. */
function reachFor(me: ActorApi, slot: Slot): PoseChange {
  if (animal(me)) return { head: { nod: -0.4 }, armR: { swing: 1.2, bend: 0.6 } }
  if (slot === 'hand') return { armR: { swing: 1.3 } }
  if (slot === 'body') return { lean: 0.35, armL: { swing: 0.6, bend: 0.4 }, armR: { swing: 0.6, bend: 0.4 } }
  if (slot === 'back') return { armL: { swing: 2.6, bend: 2 }, armR: { swing: 2.6, bend: 2 } }
  return { armL: { swing: 2.9, bend: 1.5 }, armR: { swing: 2.9, bend: 1.5 } }
}

/** The slot a part of a person is worn in: clothes go on the body; skin, eyes and shoes do not come off. */
function slotOf(part: PaintPart | null): Slot | null {
  if (part === 'clothes' || part === 'top' || part === 'bottom') return 'body'
  return part === null || part === 'shoes' || part === 'skin' || part === 'eyes' ? null : part
}

function* takeOff(me: ActorApi, args: Args, w: WorldApi): Anim {
  const word = textOf(args.thing)?.toLowerCase() ?? null
  const worn = me.look.worn
  // A worn kind by its id, else the slot the word means ('tukka' is the hair, 'mekko' what is on the body); nothing named, the first thing worn.
  const slot = word === null ? (TAKE_OFF_ORDER.find((s) => worn[s] !== undefined) ?? null) : (SLOTS.find((s) => worn[s]?.kind === word) ?? slotOf(partOf(word)))
  if (slot === null || worn[slot] === undefined) return yield* shrug(me, w, { en: 'Nothing to take off!', fi: 'Ei ole mitään päällä!' })
  yield* me.poseTo(reachFor(me, slot), 0.25)
  const it = me.takeOff(slot)
  w.sound('pop')
  if (it) w.launch(it, Math.sin(me.yaw + 1.2) * 1.5, 2.5, Math.cos(me.yaw + 1.2) * 1.5)
  me.say(w.pick([{ en: 'Off it goes!', fi: 'Pois vaan!' }, { en: 'Off!', fi: 'Pois!' }, { en: 'Whoops!', fi: 'Hupsis!' }]))
  yield* me.rest(0.2)
  yield* hop(me, w)
  yield* me.rest()
}

function paintActor(a: ActorApi, part: PaintPart | null, color: string) {
  const look = a.look
  const p = part ?? (animal(a) ? 'skin' : 'clothes')
  if (p === 'top' || p === 'bottom' || p === 'shoes' || p === 'skin' || p === 'eyes') look[p] = color
  else if (p === 'clothes') {
    look.top = color
    look.bottom = color
  } else {
    const worn = look.worn[p]
    // Nothing worn there: the clothes get the paint instead.
    if (worn) worn.tint = color
    else {
      look.top = color
      look.bottom = color
    }
  }
}

function* paint(me: ActorApi, args: Args, w: WorldApi): Anim {
  const color = colorOf(textOf(args.color))
  if (color === null) return yield* shrug(me, w, { en: 'What colour?', fi: 'Mikä väri?' })
  const target = actorOf(args.thing) ?? itemOf(args.thing) ?? me
  if (target.id !== me.id) {
    yield* me.walkTo(target, { near: 0.3 })
    yield* me.turnTo(target)
  }
  me.feel('happy')
  for (let i = 0; i < 4; i++) {
    const up = i % 2 === 0
    yield* me.poseTo(animal(me) ? { tail: up ? 1 : -1, head: { nod: up ? -0.2 : 0.2 } } : { armR: { swing: up ? 1.9 : 1.1, raise: 0.2, bend: 0.4 } }, 0.16)
    w.puff({ at: target, kind: 'drop', color, count: 3, size: 0.1, speed: 1, life: 0.6 })
  }
  if (target.isActor) paintActor(target, partOf(textOf(args.part)), color)
  else target.tint = color
  w.sound('magic')
  w.puff({ at: target, kind: 'confetti', color, count: 14, size: 0.1, speed: 2, up: 1, life: 1 })
  if (target.isActor) {
    target.feel('surprised')
    target.say(target.id === me.id ? { en: 'So pretty!', fi: 'Niin nätti!' } : { en: 'Wow!', fi: 'Vau!' })
  } else me.say({ en: 'So pretty!', fi: 'Niin nätti!' })
  yield* me.rest()
}

/** How small and how big a resize may make anything. */
const SMALLEST = 0.3
const BIGGEST = 3.5

function* resize(me: ActorApi, args: Args, w: WorldApi, factor: number): Anim {
  const target = actorOf(args.thing) ?? itemOf(args.thing) ?? me
  const bigger = factor > 1
  if (target.id !== me.id) {
    yield* me.turnTo(target)
    yield* me.poseTo(point(me), 0.25)
  }
  const from = target.scale
  const to = w.clamp(from * factor, SMALLEST, BIGGEST)
  w.sound(bigger ? 'magic' : 'squeak')
  sparkle(w, target)
  if (target.isActor) yield* target.poseTo({ squash: bigger ? 0.75 : 1.25 }, 0.15)
  yield* w.during(0.9, (k, dt) => {
    // Eased, with a little overshoot in the middle.
    target.scale = from + (to - from) * (w.ease(k) + 0.12 * Math.sin(k * Math.PI))
    if (w.random() < dt * 14) w.puff({ at: target, kind: 'star', color: palette.sparkle, count: 1, size: 0.12, speed: 1.4, life: 0.6 })
  })
  target.scale = to
  if (target.isActor) {
    yield* target.poseTo({ squash: 1 }, 0.15)
    target.feel(bigger ? 'happy' : 'surprised')
    target.say(
      to === from
        ? bigger
          ? { en: 'Big enough!', fi: 'Tarpeeksi iso!' }
          : { en: 'Small enough!', fi: 'Tarpeeksi pieni!' }
        : bigger
          ? w.pick([{ en: 'Big!', fi: 'Iso!' }, { en: 'So tall!', fi: 'Niin pitkä!' }, { en: 'Huge!', fi: 'Valtava!' }])
          : w.pick([{ en: 'Tiny!', fi: 'Pikkuinen!' }, { en: 'So small!', fi: 'Niin pieni!' }, { en: 'Eek!', fi: 'Iik!' }]),
    )
  } else me.say(bigger ? { en: 'Bigger!', fi: 'Isompi!' } : { en: 'Smaller!', fi: 'Pienempi!' })
  yield* me.rest()
}

function* rename(me: ActorApi, args: Args, w: WorldApi): Anim {
  const name = textOf(args.name)
  if (name === null) return yield* shrug(me, w, { en: 'What name?', fi: 'Mikä nimi?' })
  const who = actorOf(args.who) ?? me
  const pretty = capital(name.slice(0, 18))
  if (who.id !== me.id) {
    yield* me.turnTo(who)
    yield* me.poseTo(point(me), 0.25)
  }
  sparkle(w, who)
  w.puff({ at: who, kind: 'confetti', count: 18, size: 0.1, speed: 2.2, up: 1.5, life: 1.2 })
  who.name = pretty
  who.feel('happy')
  who.say({ en: `I am ${pretty}!`, fi: `Olen ${pretty}!` })
  if (who.id === me.id) yield* hop(me, w)
  else yield* w.wait(0.5)
  yield* me.rest()
}

// ------------------------------------------------------------------------------ the library entries

const param = (name: string, kind: ParamKind, about: string, optional: boolean): Param => ({ name, kind, about, optional })

export const BASIC_VERBS: BuiltinAction[] = [
  {
    id: 'walk',
    name: 'walk',
    nameFi: 'kävele',
    calls: ['kävele', 'kävelkää', 'kävellä', 'kävelee', 'kävelemään', 'mene', 'menkää', 'mennä', 'menee', 'mee', 'menes', 'kulje', 'kulkee', 'astele', 'tepastele', 'walk', 'go'],
    about: 'Walks to a place or a thing. With nowhere given, wanders a few steps.',
    params: [param('to', 'place', 'where to walk: a place, a thing or someone', true)],
    run: (me, args, w) => walkOrRun(me, args, w, false),
  },
  {
    id: 'run',
    name: 'run',
    nameFi: 'juokse',
    calls: ['juokse', 'juoskaa', 'juosta', 'juoksee', 'juoksemaan', 'juoks', 'kipitä', 'kipittää', 'kirmaa', 'ryntää', 'ryntäile', 'pinkaise', 'run'],
    about: 'Runs to a place or a thing, kicking up dust. With nowhere given, dashes off a little way.',
    params: [param('to', 'place', 'where to run: a place, a thing or someone', true)],
    run: (me, args, w) => walkOrRun(me, args, w, true),
  },
  {
    id: 'come',
    name: 'come',
    nameFi: 'tule',
    calls: ['tule', 'tulkaa', 'tulla', 'tulee', 'tuu', 'tuukaa', 'tule tänne', 'tulkaa tänne', 'tänne', 'come', 'come here'],
    about: 'Comes to the front of the room, turns to the child and waves.',
    params: [],
    run: come,
  },
  {
    id: 'pick-up',
    name: 'pick up',
    nameFi: 'ota',
    calls: ['ota', 'ottakaa', 'ottaa', 'otetaan', 'nosta', 'nostakaa', 'nostaa', 'nostetaan', 'poimi', 'poimikaa', 'poimia', 'kerää', 'kerätä', 'hae', 'hakekaa', 'hakea', 'nappaa', 'napata', 'tartu', 'pick up', 'take', 'grab', 'get'],
    about: 'Walks to a thing and picks it up in a free hand (the nearest little thing if none is named).',
    params: [param('thing', 'item', 'the thing to pick up', false)],
    run: pickUp,
  },
  {
    id: 'drop',
    name: 'drop',
    nameFi: 'pudota',
    // 'laske' is put down only with a thing that can be carried (brain/parse.ts): next to a slide it is slide down, next to a number count.
    calls: ['pudota', 'pudottakaa', 'pudottaa', 'pudotetaan', 'tiputa', 'tiputtaa', 'tiputetaan', 'laske', 'laskekaa', 'laske maahan', 'päästä', 'päästä irti', 'irti', 'jätä', 'jättää', 'drop', 'put down', 'let go'],
    about: 'Puts down what it holds: that thing, or whatever is in its hands.',
    params: [param('thing', 'item', 'the thing to put down', true)],
    run: drop,
  },
  {
    id: 'give',
    name: 'give',
    nameFi: 'anna',
    calls: ['anna', 'antakaa', 'antaa', 'vie', 'viekää', 'viedä', 'ojenna', 'ojentaa', 'lahjoita', 'give', 'hand'],
    about: 'Takes a thing (or what it holds) to someone and hands it over.',
    params: [param('thing', 'item', 'what to give', true), param('to', 'actor', 'who gets it', false)],
    run: give,
  },
  {
    id: 'jump',
    name: 'jump',
    nameFi: 'hyppää',
    calls: ['hyppää', 'hypätkää', 'hypätä', 'hyppii', 'hypi', 'hyppiä', 'hyppy', 'hyppimään', 'pomppaa', 'pomppii', 'pomppi', 'pompi', 'pomppia', 'loikkaa', 'loikki', 'jump', 'hop'],
    about: 'Jumps up and down, or hops all the way to a place.',
    params: [param('to', 'place', 'where to hop to', true), param('times', 'number', 'how many jumps', true)],
    run: jump,
  },
  {
    id: 'wave',
    name: 'wave',
    nameFi: 'vilkuta',
    calls: ['vilkuta', 'vilkuttakaa', 'vilkuttaa', 'vilkutetaan', 'heiluta', 'heiluttaa', 'heilutetaan', 'heilauta', 'moikkaa', 'moikkaile', 'tervehdi', 'tervehtiä', 'heippaa', 'wave', 'say hi'],
    about: 'Turns to someone (or to the child) and waves hello.',
    params: [param('to', 'thing', 'who or what to wave to', true)],
    run: wave,
  },
  {
    id: 'sit',
    name: 'sit',
    nameFi: 'istu',
    calls: ['istu', 'istukaa', 'istua', 'istuu', 'istuudu', 'istuutukaa', 'istuutua', 'istahda', 'istu alas', 'istumaan', 'sit', 'sit down'],
    about: 'Sits on a thing (a bench, a rock, a swing) or on the ground, and stays sitting.',
    params: [param('on', 'item', 'what to sit on', true)],
    run: sit,
  },
  {
    id: 'sleep',
    name: 'sleep',
    nameFi: 'nuku',
    calls: ['nuku', 'nukkukaa', 'nukkua', 'nukkuu', 'nukkumaan', 'mene nukkumaan', 'käy maate', 'käy makuulle', 'makaa', 'maatkaa', 'maata', 'torku', 'torkkuu', 'lepää', 'levätä', 'sleep', 'nap', 'lie down'],
    about: 'Yawns and lies down for a nap (on a thing, or on the ground), snoring. Stays lying down.',
    params: [param('on', 'item', 'what to sleep on', true)],
    run: sleep,
  },
  {
    id: 'spin',
    name: 'spin',
    nameFi: 'pyöri',
    calls: ['pyöri', 'pyörikää', 'pyöriä', 'pyörii', 'pyörähdä', 'pyörähtää', 'pyörähdys', 'käänny', 'kääntykää', 'kääntyä', 'kieppu', 'kieppuu', 'piruetti', 'spin', 'twirl', 'turn around'],
    about: 'Spins round and round with arms out, then wobbles, dizzy.',
    params: [param('times', 'number', 'how many turns', true)],
    run: spin,
  },
  {
    id: 'say',
    name: 'say',
    nameFi: 'sano',
    calls: ['sano', 'sanokaa', 'sanoa', 'sanoo', 'huuda', 'huutakaa', 'huutaa', 'puhu', 'puhua', 'kerro', 'kertoa', 'kuiskaa', 'kuiskata', 'say', 'tell', 'shout'],
    about: 'Says the words aloud, in a speech bubble too.',
    params: [param('words', 'text', 'what to say', false)],
    run: say,
  },
  {
    id: 'follow',
    name: 'follow',
    nameFi: 'seuraa',
    calls: ['seuraa', 'seuratkaa', 'seurata', 'seuraamaan', 'tule perässä', 'mene perässä', 'kulje perässä', 'perässä', 'tule mukaan', 'mukaan', 'follow', 'follow me'],
    about: 'Follows someone around for a while.',
    params: [param('who', 'actor', 'who to follow', false)],
    run: follow,
  },
  {
    id: 'look',
    name: 'look',
    nameFi: 'katso',
    calls: ['katso', 'katsokaa', 'katsoa', 'katsoo', 'kato', 'katsele', 'katselkaa', 'katsella', 'tähyile', 'tuijota', 'kurkkaa', 'kurkista', 'look', 'see', 'watch'],
    about: 'Looks at a thing or someone, hand over the eyes; with nothing given, looks all around.',
    params: [param('at', 'thing', 'who or what to look at', true)],
    run: look,
  },
  {
    id: 'make',
    name: 'make',
    nameFi: 'tee',
    calls: ['tee', 'tehkää', 'tehdä', 'tekee', 'luo', 'luokaa', 'luoda', 'rakenna', 'rakentakaa', 'rakentaa', 'taio', 'taiko', 'taikoa', 'loihdi', 'loihtia', 'askartele', 'make', 'build', 'create'],
    about: 'Makes a thing appear by magic in front of it: any kind, in a colour if asked.',
    params: [param('thing', 'text', 'the kind of thing to make', false), param('color', 'text', 'a colour for it', true)],
    run: make,
  },
  {
    id: 'remove',
    name: 'remove',
    nameFi: 'poista',
    calls: ['poista', 'poistakaa', 'poistaa', 'häivytä', 'häivyttää', 'hävitä', 'hävitä se', 'vie pois', 'taio pois', 'siivoa', 'siivota', 'remove', 'take away', 'vanish'],
    about: 'Makes a thing vanish in a puff of magic.',
    params: [param('thing', 'item', 'the thing to make vanish', false)],
    run: remove,
  },
  {
    id: 'wear',
    name: 'wear',
    nameFi: 'pue',
    calls: ['pue', 'pukekaa', 'pukea', 'pukee', 'pukevat', 'pukeudu', 'pukeutua', 'laita päähän', 'laita päälle', 'pistä päähän', 'anna', 'wear', 'put on'],
    about: "Puts on a thing to wear (hair, a hat, glasses, a dress, a wand...), new by magic unless it holds one, in a colour if asked. Also 'give her curly hair'.",
    params: [param('thing', 'text', 'the kind of thing to wear', false), param('color', 'text', 'a colour for it', true)],
    run: wear,
  },
  {
    id: 'take-off',
    name: 'take off',
    nameFi: 'riisu',
    calls: ['riisu', 'riisukaa', 'riisua', 'riisuu', 'ota pois', 'ota päästä', 'ota päältä', 'pois päältä', 'take off'],
    about: 'Takes off something it wears (that kind, or a slot: hair, head, face, body, back, hand) and tosses it aside.',
    params: [param('thing', 'text', 'what to take off: a worn kind or a slot', true)],
    run: takeOff,
  },
  {
    id: 'paint',
    name: 'paint',
    nameFi: 'maalaa',
    calls: ['maalaa', 'maalatkaa', 'maalata', 'maalaamaan', 'värjää', 'värjätä', 'väritä', 'värittää', 'sävytä', 'paint', 'colour', 'color'],
    about: 'Paints a thing or someone (or itself) a colour; on a person one part (top, bottom, shoes, skin, eyes, hair or a worn thing), or the clothes.',
    params: [param('color', 'text', 'the colour', false), param('thing', 'thing', 'who or what to paint (itself if none)', true), param('part', 'text', 'top, bottom, shoes, skin, eyes, hair or a worn slot', true)],
    run: paint,
  },
  {
    id: 'grow',
    name: 'grow',
    nameFi: 'kasva',
    calls: ['kasva', 'kasvakaa', 'kasvaa', 'kasvetaan', 'kasvata', 'kasvattaa', 'suurenna', 'suurentaa', 'isoksi', 'isommaksi', 'suureksi', 'jättiläiseksi', 'grow', 'bigger'],
    about: 'Makes itself (or a thing or someone) bigger.',
    params: [param('thing', 'thing', 'who or what grows (itself if none)', true)],
    run: (me, args, w) => resize(me, args, w, 1.5),
  },
  {
    id: 'shrink',
    name: 'shrink',
    nameFi: 'kutistu',
    calls: ['kutistu', 'kutistukaa', 'kutistua', 'kutista', 'kutistaa', 'pienennä', 'pienentää', 'pieneksi', 'pienemmäksi', 'pikkuiseksi', 'pikkuruiseksi', 'shrink', 'smaller'],
    about: 'Makes itself (or a thing or someone) smaller.',
    params: [param('thing', 'thing', 'who or what shrinks (itself if none)', true)],
    run: (me, args, w) => resize(me, args, w, 1 / 1.5),
  },
  {
    id: 'rename',
    name: 'rename',
    nameFi: 'nimeä',
    calls: ['nimeä', 'nimetä', 'nimeä uudelleen', 'nimi', 'nimesi', 'nimeksi', 'nimeltään', 'sinun nimesi on', 'olet nyt', 'rename', 'call', 'name'],
    about: 'Gives itself (or someone) a new name.',
    params: [param('name', 'text', 'the new name', false), param('who', 'actor', 'who gets the name (itself if none)', true)],
    run: rename,
  },
]
