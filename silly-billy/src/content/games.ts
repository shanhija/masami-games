/**
 * The group games: built-in actions in which several avatars play together. The step's actor
 * starts the game and has the first part (it is "it", the seeker, the train's front); the
 * others are the ones its `players` arg names, or everyone here. Each takes them in with
 * w.join, so what they were doing stops (off the swing, up from the bench) and they are free
 * again when the game ends or is stopped; a command of their own takes one out, and the game
 * goes on without it. The game moves everybody a frame at a time (Moves), so it can change
 * what anyone does at any moment, lasts 30 to 50 s and ends on its own. Written against the
 * same API as the basic verbs (engine/api.ts); every line is in both languages.
 */

import { palette } from '../../../castle-builder/src/scene/look'
import type { ActorApi, Anim, Args, ItemApi, PoseChange, Spot, Target, WorldApi } from '../engine/api'
import type { Words } from '../engine/lang'
import type { BuiltinAction } from '../engine/library'
import type { Param } from '../engine/protocol'
import { ROOM_GEO } from '../engine/rooms'
import { animal, cheer, point, shrug, sparkle, towardCamera } from './actions'

// ------------------------------------------------------------------------------ who plays, and how they move

const PLAYERS: Param = { name: 'players', kind: 'text', optional: true, about: 'the others who play, ids or names with commas; empty: everyone here' }

/** Words for everybody rather than someone by name. */
const EVERYONE = new Set(['kaikki', 'kaikkien', 'kaikille', 'muut', 'muiden', 'muiden kanssa', 'everyone', 'everybody', 'all', 'others'])

/** Who plays: me first, then the others the players arg names (ids or names, with commas), or everyone here when it names nobody. */
function playersOf(me: ActorApi, args: Args, w: WorldApi): ActorApi[] {
  const text = typeof args.players === 'string' ? args.players.toLowerCase() : ''
  const named: ActorApi[] = []
  let all = false
  for (const piece of text.split(/[,;]+/)) {
    const whole = piece.trim()
    if (whole === '') continue
    if (EVERYONE.has(whole)) all = true
    const one = w.actor(whole)
    const found = one !== null ? [one] : whole.split(/\s+/).flatMap((word) => (EVERYONE.has(word) ? ((all = true), []) : [w.actor(word)].filter((a) => a !== null)))
    for (const a of found) if (a.id !== me.id && !named.some((n) => n.id === a.id)) named.push(a)
  }
  return [me, ...(named.length > 0 && !all ? named : w.actors.filter((a) => a.id !== me.id))]
}

/** The others take part as if told to: what they were doing stops. */
function takeIn(players: ActorApi[], me: ActorApi, w: WorldApi) {
  for (const p of players) if (p.id !== me.id) w.join(p)
}

/** What each player is up to: a helper the game steps one frame at a time, and may change at any moment. */
class Moves {
  private readonly now = new Map<string, Anim>()
  private readonly kinds = new Map<string, string>()

  set(a: ActorApi, kind: string, anim: Anim): void {
    this.now.set(a.id, anim)
    this.kinds.set(a.id, kind)
  }

  /** What it is doing now ('run', 'kick'...), or null when it stands. */
  kind(a: ActorApi): string | null {
    return this.now.has(a.id) ? (this.kinds.get(a.id) ?? null) : null
  }

  drop(a: ActorApi): void {
    this.now.delete(a.id)
  }

  /** One frame of everybody's helper. */
  step(): void {
    for (const [id, anim] of this.now) if (anim.next().done === true) this.now.delete(id)
  }

  /** The players still in the game; those a command of their own took out stop here. */
  keep(players: ActorApi[], me: ActorApi): ActorApi[] {
    const kept = players.filter((p) => p.id === me.id || !p.busy)
    for (const p of players) if (!kept.includes(p)) this.drop(p)
    return kept
  }
}

const gap = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z)

function nearest<T extends Spot>(from: Spot, list: T[]): T | null {
  let best: T | null = null
  for (const t of list) if (best === null || gap(from, t) < gap(from, best)) best = t
  return best
}

/** Something round on the ground to keep clear of. */
interface Round {
  x: number
  z: number
  radius: number
}

/** Big things standing on the ground: what hides someone and what a way keeps clear of. */
const bigThings = (w: WorldApi): ItemApi[] => w.items.filter((it) => it.holder === null && !it.flying && it.radius >= 0.45 && it.size.h >= 0.45)

/** Those here who do not play, standing about: a way or a lane keeps clear of them too. */
const onlookers = (w: WorldApi, players: ActorApi[]): Round[] => w.actors.filter((a) => !players.includes(a)).map((a) => ({ x: a.x, z: a.z, radius: a.radius + 0.3 }))

/** A spot inside the room, `edge` from its side, on dry ground and `room` metres clear of every big thing. */
const clearAt = (w: WorldApi, s: Spot, things: Round[], room: number, edge: number) =>
  Math.abs(s.x) <= w.size - edge && Math.abs(s.z) <= w.size - edge && !w.water(s.x, s.z) && things.every((it) => gap(it, s) > it.radius + room)

/** The row along the front where everybody arrives: each room keeps it clear, so games are played along it. */
const frontRow = (w: WorldApi) => ROOM_GEO[w.room].spawn[0]!.z

/**
 * A walk that does not push on the spot: held up by someone in a narrow way (the one who just
 * found it), it stands a moment and tries again, for at most `most` seconds.
 */
function* steadyWalk(a: ActorApi, to: Target, w: WorldApi, opts: { run: boolean; near: number }, most = 14): Anim {
  for (const until = w.t + most; w.t < until; ) {
    const walk = a.walkTo(to, opts)
    let check = { x: a.x, z: a.z, t: w.t }
    for (;;) {
      if (walk.next().done === true) return
      yield
      if (w.t - check.t < 0.4) continue
      if (gap(a, check) < 0.15) break
      check = { x: a.x, z: a.z, t: w.t }
    }
    yield* a.rest(0.2)
    yield* w.wait(0.5)
  }
}

/** How far it has to turn to face the yaw `to`, radians, -π to π. */
const turnFrom = (a: ActorApi, to: number) => Math.atan2(Math.sin(to - a.yaw), Math.cos(to - a.yaw))

/** Turning toward the yaw `to` by at most `most` radians. */
function turnToward(a: ActorApi, to: number, most: number) {
  a.yaw += Math.max(-most, Math.min(most, turnFrom(a, to)))
}

// ------------------------------------------------------------------------------ poses and little moves

/** Hands over the eyes; an animal tucks its nose down under its paws. */
const coverEyes = (a: ActorApi): PoseChange =>
  animal(a)
    ? { lean: 0.25, head: { nod: 0.55 }, armL: { swing: 1.5, bend: 1.3 }, armR: { swing: 1.5, bend: 1.3 } }
    : { head: { nod: 0.3 }, armL: { swing: 2.5, raise: -0.3, bend: 2.3 }, armR: { swing: 2.5, raise: -0.3, bend: 2.3 } }

/** Down low behind something, knees bent; an animal lies flat. */
const crouch = (a: ActorApi): PoseChange =>
  animal(a)
    ? { bob: -0.1 * (a.height / 0.5), lean: 0.1, legL: { swing: -0.6, bend: 1.2 }, legR: { swing: -0.6, bend: 1.2 }, armL: { swing: 0.8, bend: 1 }, armR: { swing: 0.8, bend: 1 }, tail: 0 }
    : {
        bob: -0.3 * (a.height / 1.15),
        lean: 0.5,
        legL: { swing: 1.2, raise: 0.12, bend: 2.1 },
        legR: { swing: 1.2, raise: 0.12, bend: 2.1 },
        armL: { swing: 0.9, raise: 0.15, bend: 1.1 },
        armR: { swing: 0.9, raise: 0.15, bend: 1.1 },
        head: { nod: -0.1 },
      }

/** Ready to run: leaning in, one leg forward. */
const getSet = (a: ActorApi): PoseChange =>
  animal(a)
    ? { lean: 0.3, bob: -0.04, tail: 1, head: { nod: -0.2 } }
    : { lean: 0.45, bob: -0.05, legL: { swing: 0.5, bend: 0.7 }, legR: { swing: -0.3, bend: 0.4 }, armL: { swing: 0.7, bend: 0.6 }, armR: { swing: -0.6, bend: 0.4 } }

/** A hop with arms up: one who won, or scored. */
function* hooray(a: ActorApi, w: WorldApi, words: Words | null, hops = 1): Anim {
  a.feel('happy')
  if (words !== null) a.say(words)
  for (let i = 0; i < hops; i++) yield* w.together(a.jump(0.45), a.poseTo(cheer(a), 0.15))
  yield* w.wait(0.3)
  yield* a.rest(0.25)
}

/** The one who won: a sparkle, a big hop and "I won!". */
function* winner(a: ActorApi, w: WorldApi): Anim {
  sparkle(w, a)
  w.sound('yay')
  yield* hooray(a, w, { en: 'I won!', fi: 'Voitin!' }, 2)
}

const CLAPS: Words[] = [
  { en: 'Well done!', fi: 'Hienoa!' },
  { en: 'Yay!', fi: 'Jee!' },
  { en: 'So fast!', fi: 'Tosi nopea!' },
]

/** Clapping hands in front; an animal pats its front paws. With words, says them too. */
function* clap(a: ActorApi, w: WorldApi, words: Words | null): Anim {
  a.feel('happy')
  if (words !== null) a.say(words)
  if (animal(a)) w.sound(a.kind === 'cat' ? 'meow' : 'woof')
  for (let i = 0; i < 4; i++) {
    yield* a.poseTo(animal(a) ? { armL: { swing: 0.9 }, armR: { swing: 0.2 }, tail: 1 } : { armL: { swing: 1.35, raise: -0.25, bend: 0.8 }, armR: { swing: 1.35, raise: -0.25, bend: 0.8 } }, 0.1)
    yield* a.poseTo(animal(a) ? { armL: { swing: 0.2 }, armR: { swing: 0.9 }, tail: -1 } : { armL: { swing: 1.2, raise: 0.4, bend: 0.6 }, armR: { swing: 1.2, raise: 0.4, bend: 0.6 } }, 0.1)
  }
  yield* a.rest(0.25)
}

/** At the end everyone has fun, one after another: a hop and a word or two. */
function* allHappy(players: ActorApi[], w: WorldApi): Anim {
  const lines: Words[] = [{ en: 'Fun!', fi: 'Kivaa!' }, { en: 'Again!', fi: 'Uudestaan!' }, { en: 'Yay!', fi: 'Jee!' }]
  yield* w.together(
    ...players.map(function* (p, i): Anim {
      yield* w.wait(i * 0.15)
      yield* hooray(p, w, i < 3 ? lines[i]! : null)
    }),
  )
}

/** Nobody else here to play with. */
const nobody = (me: ActorApi, w: WorldApi) => shrug(me, w, { en: 'Who will play?', fi: 'Kuka leikkii?' })

// ------------------------------------------------------------------------------ tag

const TAG_SECS = 40
/** How long "it" counts before it runs: no tag-backs. */
const TAG_COUNT = 2.6
const IT_COLOR = '#ff5a4f'
/** A runner runs off when "it" comes this near. */
const TAG_NEAR = 3.2

/** A spot 3.5 to 7 m away from `from`, on the far side of the runner, inside the room and clear of things. */
function fleeSpot(r: ActorApi, from: Spot, w: WorldApi, things: ItemApi[]): Spot {
  const away = Math.atan2(r.x - from.x, r.z - from.z)
  let best: Spot | null = null
  let score = -Infinity
  for (let i = 0; i < 16; i++) {
    const a = away + (w.random() - 0.5) * (i < 10 ? 3.2 : 6.2)
    const d = 3.5 + w.random() * 3.5
    const s = { x: r.x + Math.sin(a) * d, z: r.z + Math.cos(a) * d }
    if (!clearAt(w, s, things, 0.6, 1.2)) continue
    const v = gap(s, from) - 0.3 * d + w.random()
    if (v > score) {
      best = s
      score = v
    }
  }
  return best ?? { x: -from.x * 0.5, z: -from.z * 0.5 }
}

function* tag(me: ActorApi, args: Args, w: WorldApi): Anim {
  let players = playersOf(me, args, w)
  if (players.length < 2) return yield* nobody(me, w)
  takeIn(players, me, w)
  const moves = new Moves()
  const things = bigThings(w)
  const flee = new Map<string, Spot>()
  const calm = new Map<string, number>()
  const end = w.t + TAG_SECS
  let it = me
  /** Who tagged "it" last: it chases someone else while there is anyone else. */
  let last: ActorApi | null = null
  let chasing: ActorApi | null = null
  let counted = w.t
  let said = 0
  me.say({ en: 'I am it!', fi: 'Minä olen hippa!' })
  me.feel('silly', 4)
  moves.set(me, 'count', me.poseTo(coverEyes(me), 0.3))
  while (w.t < end) {
    players = moves.keep(players, me)
    if (players.length < 2) break
    if (!players.includes(it)) {
      it = me
      counted = w.t
      said = 0
      moves.set(me, 'count', me.poseTo(coverEyes(me), 0.3))
    }
    const counting = w.t - counted < TAG_COUNT
    if (counting) {
      // Eyes covered, it counts to three; then it comes.
      const n = Math.floor((w.t - counted) / 0.7)
      if (n > said && n <= 3) {
        said = n
        it.speak(String(n), 0.6)
      }
    } else if (said === 3) {
      said = 4
      it.say({ en: 'Here I come!', fi: 'Nyt tulen!' })
      it.feel('silly', 4)
      w.sound('whoosh')
    }
    if (!counting) {
      const runners = players.filter((p) => p !== it)
      const target = nearest(it, runners.length > 1 && last !== null ? runners.filter((p) => p !== last) : runners)!
      if (target !== chasing || moves.kind(it) !== 'chase') {
        chasing = target
        moves.set(it, 'chase', it.walkTo(target, { run: true, near: 0.05 }))
      }
      if (w.distance(it, target) <= it.radius + target.radius + 0.3) {
        w.sound('pop')
        w.sound('giggle')
        w.puff({ at: target, kind: 'star', color: IT_COLOR, count: 12, size: 0.14, speed: 2, up: 1, life: 0.8 })
        it.say({ en: 'Tag!', fi: 'Hippa!' })
        it.feel('happy')
        target.feel('surprised', 1.5)
        last = it
        flee.delete(target.id)
        flee.delete(it.id)
        moves.drop(it)
        it = target
        chasing = null
        counted = w.t
        said = 0
        moves.set(it, 'count', w.together(it.turnTo(last), it.poseTo(coverEyes(it), 0.3)))
      }
    }
    // The runners: away when "it" comes near, else a cheeky hop where they are.
    for (const r of players) {
      if (r === it) continue
      const d = w.distance(it, r)
      const spot = flee.get(r.id)
      const near = w.t - counted >= TAG_COUNT && d < TAG_NEAR
      if (spot === undefined || (near && (moves.kind(r) !== 'flee' || gap(spot, it) < 3.2))) {
        const s = fleeSpot(r, it, w, things)
        // Caught standing, it jumps with fright first: that moment is when "it" catches up.
        const startled = near && moves.kind(r) !== 'flee'
        flee.set(r.id, s)
        moves.set(
          r,
          'flee',
          (function* (): Anim {
            if (startled) yield* w.together(r.jump(0.25), r.poseTo(animal(r) ? { tail: 1.2 } : { armL: { raise: 1.6 }, armR: { raise: 1.6 } }, 0.12))
            yield* r.walkTo(s, { run: true, near: 0.2 })
          })(),
        )
        r.feel(near ? 'surprised' : 'happy', 2)
        if (near && w.random() < 0.4) r.say({ en: 'Eek!', fi: 'Iik!' })
      } else if (moves.kind(r) === null && !near && w.t > (calm.get(r.id) ?? 0)) {
        calm.set(r.id, w.t + 2.5 + w.random() * 3)
        const line = w.random() < 0.4 ? { en: 'Catch me!', fi: 'Ota kiinni!' } : null
        moves.set(
          r,
          'tease',
          (function* (): Anim {
            yield* r.turnTo(it)
            if (line !== null) r.say(line)
            yield* w.together(r.jump(0.3), r.poseTo(animal(r) ? { tail: 1 } : { armL: { raise: 2.2 }, armR: { raise: 2.2 } }, 0.15))
            yield* r.rest(0.2)
          })(),
        )
      }
    }
    moves.step()
    // "It" shows from high above: a ring of red stars going round its feet (over its head the name tag would hide them), and arms reaching out while it chases.
    const ring = 0.45 + it.radius
    const ground = w.groundAt(it.x, it.z)
    for (let k = 0; k < 6; k++) {
      const a = w.t * 3 + (k * Math.PI) / 3
      w.puff({ x: it.x + Math.cos(a) * ring, y: Math.max(ground, it.y) + 0.12, z: it.z + Math.sin(a) * ring, kind: 'star', color: IT_COLOR, count: 1, size: 0.24, speed: 0, up: 0, life: 0.1, gravity: 0 })
    }
    if (moves.kind(it) === 'chase' && !animal(it)) {
      for (const arm of [it.pose.armL, it.pose.armR]) Object.assign(arm, { swing: 1.45, raise: 0.2, bend: 0.15 })
    }
    yield
  }
  me.say({ en: 'Game over!', fi: 'Peli loppui!' })
  yield* allHappy(players, w)
  yield* me.rest()
}

// ------------------------------------------------------------------------------ football

const FOOTBALL_SECS = 45
const TEAM_COLORS = [palette.rainbow[0]!, palette.rainbow[4]!]

function* football(me: ActorApi, args: Args, w: WorldApi): Anim {
  let players = playersOf(me, args, w)
  takeIn(players, me, w)
  const moves = new Moves()
  const z0 = frontRow(w)
  const gx = w.size - 3.2
  const team = new Map(players.map((p, i) => [p.id, i % 2]))
  /** Each team's one going for the ball: it stays so until a team-mate is a good bit nearer, so two do not swap back and forth. */
  const chasers: (ActorApi | null)[] = [null, null]
  // Each team's own goal, in its colour: red on the left, blue on the right. A team scores in the other's. One left standing there by a game stopped midway is used again.
  const goals = [-1, 1].map((side, i) => {
    const at = { x: side * gx, z: z0 }
    const g = w.items.find((it) => it.kind === 'goal' && gap(it, at) < 1.5) ?? w.make('goal', { ...at, yaw: (-side * Math.PI) / 2 })
    g.tint = TEAM_COLORS[i]!
    return g
  })
  const sideOf = (i: number) => (i === 0 ? -1 : 1)
  // The room's football, else a ball; someone holding it puts it down.
  const ball = w.find('football', { free: true }) ?? w.find('ball', { free: true }) ?? w.find('football') ?? w.find('ball') ?? w.make('football', { x: 0, z: z0 })
  const holder = ball.holder
  if (holder !== null) holder.drop(holder.holding('left') === ball ? 'left' : 'right')
  const toMiddle = () => {
    ball.x = 0
    ball.z = z0
    ball.y = w.groundAt(0, z0)
    ball.vx = ball.vy = ball.vz = 0
    w.puff({ at: ball, kind: 'spark', color: palette.sparkle, count: 8, size: 0.1, speed: 1.2, life: 0.5 })
    w.sound('pop')
  }
  toMiddle()
  const score = [0, 0]
  const spots = new Map<string, Spot>()
  const spotOf = (p: ActorApi) => {
    let s = spots.get(p.id)
    if (s === undefined) spots.set(p.id, (s = { x: p.x, z: p.z }))
    return s
  }
  const kicked: { by: ActorApi | null } = { by: null }
  // A walker that got nowhere for a while (others in the way at the ball) stands and watches a moment before it tries again.
  const check = new Map<string, { x: number; z: number; t: number }>()
  const waitUntil = new Map<string, number>()
  const walk = (p: ActorApi, kind: string, s: Spot, run: boolean, near: number) => {
    if (moves.kind(p) === kind || (waitUntil.get(p.id) ?? 0) > w.t) return
    moves.set(p, kind, p.walkTo(s, { run, near }))
    check.set(p.id, { x: p.x, z: p.z, t: w.t })
  }
  const unstick = (p: ActorApi) => {
    const c = check.get(p.id)
    if ((moves.kind(p) !== 'chase' && moves.kind(p) !== 'spread') || c === undefined || w.t - c.t < 0.5) return
    check.set(p.id, { x: p.x, z: p.z, t: w.t })
    if (gap(p, c) > 0.2) return
    moves.set(p, 'look', p.turnTo(ball))
    waitUntil.set(p.id, w.t + 0.7)
  }
  const kick = function* (p: ActorApi, aim: Spot): Anim {
    yield* p.turnTo(aim)
    yield* p.poseTo(animal(p) ? { lean: 0.4, head: { nod: 0.5 } } : { lean: -0.1, legR: { swing: -0.8, bend: 0.7 }, armL: { swing: 0.6, raise: 0.5 }, armR: { swing: -0.5, raise: 0.4 } }, 0.12)
    if (ball.holder === null && w.distance(p, ball) - p.radius - ball.radius < 0.75) {
      const a = w.angleTo(ball, aim) + (w.random() - 0.5) * 0.6
      const v = 5 + w.random() * 3
      w.launch(ball, Math.sin(a) * v, 0.6 + w.random() * 2, Math.cos(a) * v)
      w.sound('pop')
      w.puff({ x: ball.x, y: 0.1, z: ball.z, kind: 'dust', count: 6, size: 0.12, speed: 1, up: 0.5, life: 0.5 })
      kicked.by = p
      if (w.random() < 0.25) p.say(w.pick([{ en: 'Kick!', fi: 'Potku!' }, { en: 'Go ball!', fi: 'Mene pallo!' }, { en: 'Mine!', fi: 'Minun!' }]))
    }
    yield* p.poseTo(animal(p) ? { lean: -0.1, head: { nod: -0.2 } } : { lean: -0.2, legR: { swing: 1.2, bend: 0.1 } }, 0.1)
    yield* p.rest(0.2)
  }
  // Out to their halves, then the whistle.
  me.say({ en: 'Football!', fi: 'Jalkapalloa!' })
  players.forEach((p, i) => {
    const k = Math.floor(i / 2)
    const s = spotOf(p)
    s.x = sideOf(i % 2) * (2 + 1.8 * k)
    s.z = z0 + [0, 1.8, -1.8][k % 3]!
    moves.set(p, 'go', p.walkTo(s, { run: true, near: 0.2 }))
    w.puff({ at: p, kind: 'confetti', color: TEAM_COLORS[i % 2]!, count: 10, size: 0.1, speed: 1.5, up: 1, life: 0.9 })
  })
  const start = w.t
  while (w.t - start < 6 && players.some((p) => moves.kind(p) !== null)) {
    moves.step()
    yield
  }
  for (const p of players) moves.set(p, 'look', p.turnTo(ball))
  w.sound('bell')
  me.say({ en: 'Kick off!', fi: 'Peli alkaa!' })
  let pause = 0
  let still = { x: ball.x, z: ball.z, t: w.t }
  while (w.t - start < FOOTBALL_SECS) {
    players = moves.keep(players, me)
    if (pause > 0) {
      pause -= w.dt
      if (pause <= 0) {
        toMiddle()
        still = { x: ball.x, z: ball.z, t: w.t }
      }
      moves.step()
      yield
      continue
    }
    const into = goals.findIndex((g, i) => sideOf(i) * ball.x > gx && Math.abs(ball.z - g.z) < 1.15 && ball.y < 1.2)
    if (into >= 0) {
      // Goal! The team that scored cheers, the other one says oh no; the ball stops in the net.
      const won = 1 - into
      score[won]!++
      ball.vx *= 0.15
      ball.vz *= 0.15
      w.sound('yay')
      w.puff({ at: goals[into]!, kind: 'confetti', color: TEAM_COLORS[won]!, count: 30, size: 0.12, speed: 2.5, up: 2, life: 1.4 })
      const by = kicked.by
      const shooter = by !== null && players.includes(by) && team.get(by.id) === won ? by : (players.find((p) => team.get(p.id) === won) ?? null)
      let groaned = false
      for (const p of players) {
        if (team.get(p.id) === won) moves.set(p, 'cheer', hooray(p, w, p === shooter ? { en: 'Goal!', fi: 'Maali!' } : null, 2))
        else {
          const line = groaned ? null : { en: 'Oh no!', fi: 'Voi ei!' }
          groaned = true
          p.feel('sad', 1.5)
          if (line !== null) p.say(line)
          moves.set(p, 'groan', p.poseTo({ head: { nod: 0.35, tilt: 0.3 } }, 0.3))
        }
      }
      pause = 3
      continue
    }
    if (Math.abs(ball.z - z0) > 4.2 || Math.abs(ball.x) > gx || w.water(ball.x, ball.z)) {
      w.sound('bell')
      me.say({ en: 'Out!', fi: 'Ulkona!' })
      pause = 1.3
      continue
    }
    // A ball nobody gets to for a long while goes back to the middle.
    if (gap(ball, still) > 0.3) still = { x: ball.x, z: ball.z, t: w.t }
    else if (w.t - still.t > 9) {
      toMiddle()
      still = { x: ball.x, z: ball.z, t: w.t }
    }
    for (const t of [0, 1]) {
      const mine = players.filter((p) => team.get(p.id) === t)
      if (mine.length === 0) continue
      const goal = goals[1 - t]!
      const own = goals[t]!
      // The one nearest the ball goes for it (one kicking keeps kicking); the others spread out between their goal and the ball.
      const was = chasers[t]
      const near = nearest(ball, mine)!
      const chaser = mine.find((p) => moves.kind(p) === 'kick') ?? (was !== null && mine.includes(was) && w.distance(was, ball) < w.distance(near, ball) + 1.5 ? was : near)
      chasers[t] = chaser
      if (moves.kind(chaser) !== 'kick') {
        const aim = { x: goal.x, z: goal.z + (w.random() - 0.5) * 1.6 }
        if (w.distance(chaser, ball) - chaser.radius - ball.radius < 0.55) moves.set(chaser, 'kick', kick(chaser, aim))
        else {
          // From afar it comes round behind the ball, to kick it toward the goal; close by it goes straight for it (no running rings round it).
          const d = gap(ball, goal)
          const s = spotOf(chaser)
          const back = w.distance(chaser, ball) > 1.8 ? ball.radius + chaser.radius + 0.1 : 0
          s.x = ball.x - ((goal.x - ball.x) / d) * back
          s.z = ball.z - ((goal.z - ball.z) / d) * back
          walk(chaser, 'chase', s, true, 0.05)
        }
      }
      mine
        .filter((p) => p !== chaser)
        .forEach((p, k) => {
          if (moves.kind(p) === 'cheer' || moves.kind(p) === 'groan') return
          const s = spotOf(p)
          const want = { x: w.clamp(w.lerp(own.x, ball.x, 0.6) + sideOf(t) * 1.2 * k, -gx + 1, gx - 1), z: z0 + [1.8, -1.8, 0][k % 3]! }
          if (moves.kind(p) !== 'spread' ? gap(p, want) > 2 : gap(want, s) > 2.5) {
            s.x = want.x
            s.z = want.z
            moves.drop(p)
            walk(p, 'spread', s, gap(p, s) > 4, 0.3)
          } else if (moves.kind(p) === null && Math.abs(turnFrom(p, w.angleTo(p, ball))) > 0.8) moves.set(p, 'look', p.turnTo(ball))
        })
    }
    for (const p of players) unstick(p)
    moves.step()
    yield
  }
  // The whistle and the score; the winners cheer and the others clap, or everyone cheers a draw.
  moves.step()
  w.sound('bell')
  me.speak({ en: `Red ${score[0]}, blue ${score[1]}!`, fi: `Punaiset ${score[0]}, siniset ${score[1]}!` }, 3)
  yield* w.wait(1.4)
  const best = score[0] === score[1] ? -1 : score[0]! > score[1]! ? 0 : 1
  yield* w.together(
    ...players.map((p, i) => (best < 0 || team.get(p.id) === best ? hooray(p, w, i === 0 ? (best < 0 ? { en: 'A draw!', fi: 'Tasapeli!' } : { en: 'We won!', fi: 'Voitimme!' }) : null, 2) : clap(p, w, null))),
  )
  for (const g of goals) w.remove(g)
  yield* me.rest()
}

// ------------------------------------------------------------------------------ hide and seek

const SEEK_SECS = 44
/** Things one can get right inside, and be hidden from high above. */
const INSIDE = new Set(['bush', 'berry-bush', 'tent'])

interface Hiding {
  thing: ItemApi | null
  spot: Spot
  inside: boolean
}

/** A place for each hider: behind a big thing on the side away from the seeker's base, or inside a bush or a tent, each its own; far corners when the room has too few. */
function hidingPlaces(hiders: ActorApi[], base: Spot, w: WorldApi): Map<string, Hiding> {
  const all = bigThings(w)
  const things = all.filter((it) => it.kind !== 'campfire' && !w.water(it.x, it.z) && gap(it, base) > 3)
  const taken = new Set<string>()
  const out = new Map<string, Hiding>()
  for (const h of hiders) {
    let best: Hiding | null = null
    let score = -Infinity
    for (const it of things) {
      if (taken.has(it.id)) continue
      const inside = INSIDE.has(it.kind) && h.height * 0.65 < it.size.h
      const d = gap(it, base)
      const r = it.radius + h.radius + 0.12
      const spot = inside ? { x: it.x, z: it.z } : { x: it.x + ((it.x - base.x) / d) * r, z: it.z + ((it.z - base.z) / d) * r }
      if (!inside && !clearAt(w, spot, all.filter((o) => o !== it), h.radius, h.radius + 0.4)) continue
      // Far from the base, not too far to run, inside a bush best; along the front, under the big button, only when nothing else is left.
      const v = Math.min(d, 10) - 0.25 * gap(h, spot) + (inside ? 2 : 0) - (spot.z > w.size - 4.5 ? 20 : 0) + w.random() * 2
      if (v > score) {
        best = { thing: it, spot, inside }
        score = v
      }
    }
    if (best === null) {
      const m = w.size - 1.5
      best = { thing: null, spot: { x: w.clamp(Math.sign(h.x - base.x || 1) * m, -m, m), z: w.clamp(base.z - 9, -m, m) }, inside: false }
    }
    if (best.thing !== null) taken.add(best.thing.id)
    out.set(h.id, best)
  }
  return out
}

/** A quick hop to a spot, over whatever is in the way (into a bush, or out of it). */
function* hopTo(a: ActorApi, to: Spot, w: WorldApi): Anim {
  const from = { x: a.x, y: a.y, z: a.z }
  const y = w.groundAt(to.x, to.z)
  a.yaw = w.angleTo(a, to)
  yield* w.during(0.35, (k) => {
    const e = w.ease(k)
    a.x = w.lerp(from.x, to.x, e)
    a.z = w.lerp(from.z, to.z, e)
    a.y = w.lerp(from.y, y, e) + Math.sin(k * Math.PI) * 0.45
  })
}

/** The bush or tent someone is in shakes, leaves flying. */
function* rustle(it: ItemApi, w: WorldApi): Anim {
  const yaw = it.yaw
  w.puff({ at: it, kind: 'leaf', color: palette.leaves[1]!, count: 6, size: 0.12, speed: 1.2, up: 1, life: 0.8 })
  yield* w.during(0.4, (k) => {
    it.yaw = yaw + 0.12 * Math.sin(k * Math.PI * 4) * (1 - k)
  })
  it.yaw = yaw
}

function* hideAndSeek(me: ActorApi, args: Args, w: WorldApi): Anim {
  let players = playersOf(me, args, w)
  if (players.length < 2) return yield* nobody(me, w)
  takeIn(players, me, w)
  const moves = new Moves()
  const start = w.t
  const edge = w.size - 2.5
  // The base, where the seeker counts facing the child: toward the middle (the front is under the big button), clear of things.
  const things = bigThings(w)
  const base = [0, 1.5, -1.5, 3, -3]
    .map((dx) => ({ x: w.clamp(me.x, -4, 4) + dx, z: frontRow(w) - 2.5 }))
    .find((s) => clearAt(w, s, things, 0.8, 2)) ?? { x: 0, z: frontRow(w) - 2.5 }
  /** Until everyone is back at the base (or a few seconds more). */
  const gather = function* (secs: number): Anim {
    for (const until = w.t + secs; w.t < until && players.some((p) => moves.kind(p) !== null); ) {
      players = moves.keep(players, me)
      moves.step()
      yield
    }
  }
  /** One round with this seeker, until it has found everyone: gives the one it found first. */
  const round = function* (seeker: ActorApi): Generator<void, ActorApi | null, void> {
    const hiders = players.filter((p) => p !== seeker)
    const places = hidingPlaces(hiders, base, w)
    const hidden = new Set(hiders.map((p) => p.id))
    const giggle = new Map<string, number>()
    let first: ActorApi | null = null
    seeker.say({ en: 'Go and hide!', fi: 'Menkää piiloon!' })
    w.sound('whoosh')
    moves.set(
      seeker,
      'count',
      (function* (): Anim {
        yield* steadyWalk(seeker, base, w, { run: false, near: 0.2 }, 6)
        yield* seeker.turnTo(towardCamera(seeker))
        yield* seeker.poseTo(coverEyes(seeker), 0.3)
      })(),
    )
    for (const p of hiders) {
      const place = places.get(p.id)!
      moves.set(
        p,
        'hide',
        (function* (): Anim {
          yield* steadyWalk(p, place.inside && place.thing !== null ? place.thing : place.spot, w, { run: true, near: 0.1 }, 10)
          if (place.inside && place.thing !== null) {
            yield* hopTo(p, place.spot, w)
            w.sound('pop')
            yield* w.together(rustle(place.thing, w), p.poseTo(crouch(p), 0.3))
          } else {
            if (place.thing !== null) yield* p.turnTo(place.thing)
            yield* p.poseTo(crouch(p), 0.3)
          }
        })(),
      )
    }
    // The count: once the seeker stands at the base with its eyes covered, one to ten aloud.
    let counted = 0
    let at = Infinity
    const began = w.t
    while (counted < 10 && players.includes(seeker)) {
      players = moves.keep(players, me)
      if (at === Infinity && moves.kind(seeker) === null) at = w.t
      if (w.t - at >= 0.6 * (counted + 1)) {
        counted++
        seeker.speak(String(counted), 0.6)
      }
      if (w.t - began > 14) counted = 10
      moves.step()
      yield
    }
    seeker.speak({ en: 'Ready or not, here I come!', fi: 'Valmiina tai ei, täältä tullaan!' }, 2.5)
    seeker.feel('happy')
    moves.set(seeker, 'ready', seeker.rest(0.3))
    // The search: the nearest one still hidden, then the next; found ones giggle, come out and run to the base.
    let slot = 0
    let looking: ActorApi | null = null
    const comeOut = function* (p: ActorApi, found: boolean): Anim {
      const place = places.get(p.id)!
      p.feel('silly', 2)
      w.sound('giggle')
      p.say(found ? { en: 'Hee hee!', fi: 'Hihii!' } : { en: 'Here I am!', fi: 'Täällä!' })
      yield* p.rest(0.25)
      if (place.inside && place.thing !== null) {
        const it = place.thing
        const d = Math.max(0.01, gap(it, seeker))
        const r = it.radius + p.radius + 0.2
        yield* hopTo(p, { x: it.x + ((seeker.x - it.x) / d) * r, z: it.z + ((seeker.z - it.z) / d) * r }, w)
        yield* rustle(it, w)
      }
      const k = slot++
      const home = { x: w.clamp(base.x + (k % 2 === 0 ? -1 : 1) * (1.1 + 0.9 * Math.floor(k / 2)), -edge, edge), z: base.z + 0.4 }
      yield* steadyWalk(p, home, w, { run: true, near: 0.15 }, 8)
      yield* p.turnTo(towardCamera(p))
    }
    while (hidden.size > 0) {
      players = moves.keep(players, me)
      for (const id of [...hidden]) if (!players.some((p) => p.id === id)) hidden.delete(id)
      const left = players.filter((p) => hidden.has(p.id))
      if (w.t - start > SEEK_SECS || !players.includes(seeker)) {
        // Too long (or the seeker was called away): the rest come out by themselves.
        for (const p of left) {
          hidden.delete(p.id)
          moves.set(p, 'out', comeOut(p, false))
        }
        break
      }
      if ((looking === null || !hidden.has(looking.id)) && moves.kind(seeker) !== 'found') {
        looking = nearest(seeker, left)
        if (looking !== null) {
          const place = places.get(looking.id)!
          const goal = place.inside && place.thing !== null ? place.thing : looking
          const far = gap(seeker, goal) > 5
          moves.set(
            seeker,
            'seek',
            (function* (): Anim {
              yield* seeker.poseTo({ head: { turn: 0.7 } }, 0.25)
              yield* seeker.poseTo({ head: { turn: -0.7 } }, 0.35)
              yield* seeker.poseTo({ head: { turn: 0 } }, 0.2)
              yield* steadyWalk(seeker, goal, w, { run: far, near: 0.3 })
            })(),
          )
        }
      }
      if (looking !== null && hidden.has(looking.id)) {
        const place = places.get(looking.id)!
        const goal = place.inside && place.thing !== null ? place.thing : looking
        const reach = w.distance(seeker, goal) - seeker.radius - ('isActor' in goal && !goal.isActor ? goal.radius : looking.radius)
        if (reach < 0.7 || (moves.kind(seeker) === null && reach < 2.5)) {
          const p = looking
          hidden.delete(p.id)
          looking = null
          first ??= p
          seeker.speak({ en: 'Found you!', fi: 'Löysin sinut!' }, 1.6)
          seeker.feel('happy')
          moves.set(
            seeker,
            'found',
            (function* (): Anim {
              yield* seeker.turnTo(goal)
              yield* seeker.poseTo(point(seeker), 0.2)
              yield* w.wait(0.6)
              yield* seeker.rest(0.25)
            })(),
          )
          moves.set(p, 'out', comeOut(p, true))
        } else if (moves.kind(seeker) === null) looking = null
      }
      // While hidden, now and then a giggle, or a rustle of the bush.
      for (const p of left) {
        if (p === looking || moves.kind(p) !== null || w.t < (giggle.get(p.id) ?? began + 9)) continue
        giggle.set(p.id, w.t + 4 + w.random() * 5)
        const place = places.get(p.id)!
        if (place.inside && place.thing !== null) moves.set(p, 'rustle', rustle(place.thing, w))
        else if (w.random() < 0.5) {
          p.say({ en: 'Hee hee!', fi: 'Hihii!' }, 1.2)
          w.sound('giggle')
        }
      }
      moves.step()
      yield
    }
    // Everyone back at the base, the seeker too.
    if (players.includes(seeker)) {
      moves.set(
        seeker,
        'home',
        (function* (): Anim {
          yield* w.wait(0.8)
          yield* steadyWalk(seeker, base, w, { run: gap(seeker, base) > 4, near: 0.2 }, 8)
          yield* seeker.turnTo(towardCamera(seeker))
        })(),
      )
    }
    yield* gather(8)
    return first
  }
  // A quick round (one or two hiding) and there is time for another: the one found first counts next.
  let seeker = me
  for (let n = 0; n < 2; n++) {
    const first = yield* round(seeker)
    if (n === 1 || first === null || !players.includes(first) || players.length < 2 || w.t - start > (players.length === 2 ? 24 : 19)) break
    seeker = first
    seeker.say({ en: 'My turn!', fi: 'Minun vuoro!' })
    seeker.feel('happy')
    yield* w.wait(1)
  }
  seeker.say({ en: 'Found everyone!', fi: 'Kaikki löytyi!' })
  yield* allHappy(players, w)
  yield* me.rest()
}

// ------------------------------------------------------------------------------ the race

interface Track {
  /** Where they line up, the far side, and each lane's z. */
  from: number
  to: number
  lanes: number[]
  /** A swimming race: they line up on the edge and jump in. */
  swim: boolean
}

/** Lanes side by side across the room's front, or across the pool's water: as many as there are racers, clear of things along their whole length. */
function trackOf(w: WorldApi, racers: number, others: Round[]): Track {
  const pool = ROOM_GEO[w.room].water.find((wt) => wt.kind === 'rect')
  const things: Round[] = [...w.items.filter((it) => it.fixed && it.radius >= 0.3), ...others]
  const track = pool !== undefined ? { from: pool.x0 - 0.75, to: pool.x1 - 0.7, mid: (pool.z0 + pool.z1) / 2, lo: pool.z0 + 0.5, hi: pool.z1 - 0.5, step: 0.9 } : { from: -(w.size - 3.5), to: w.size - 3.5, mid: frontRow(w), lo: -w.size + 1.5, hi: w.size - 1.5, step: 1 }
  const free = (z: number) =>
    things.every((it) => {
      const x = w.clamp(it.x, track.from, track.to)
      return Math.hypot(it.x - x, it.z - z) > it.radius + 0.3
    })
  const ok: number[] = []
  const all: number[] = []
  for (let k = 0; k < 14 && ok.length < racers; k++) {
    const z = track.mid + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * track.step
    if (z < track.lo || z > track.hi) continue
    all.push(z)
    if (free(z)) ok.push(z)
  }
  const lanes = ok.length >= racers ? ok : [...ok, ...all.filter((z) => !ok.includes(z))].slice(0, racers)
  while (lanes.length < racers) lanes.push(track.mid + (lanes.length - racers / 2) * 0.8)
  return { from: track.from, to: track.to, lanes: lanes.sort((a, b) => a - b), swim: pool !== undefined }
}

/** Arms going round in the water, as long as it swims. */
function swimStroke(a: ActorApi, w: WorldApi) {
  if (animal(a) || !w.water(a.x, a.z)) return
  const s = w.t * 6 + a.x
  Object.assign(a.pose.armL, { swing: 1.6 + 1.5 * Math.sin(s), raise: 0.35, bend: 0.3 })
  Object.assign(a.pose.armR, { swing: 1.6 - 1.5 * Math.sin(s), raise: 0.35, bend: 0.3 })
}

function* race(me: ActorApi, args: Args, w: WorldApi): Anim {
  let players = playersOf(me, args, w)
  takeIn(players, me, w)
  const moves = new Moves()
  const track = trackOf(w, players.length, onlookers(w, players))
  const lane = new Map(players.map((p, i) => [p.id, track.lanes[i]!]))
  const start = w.t
  me.say({ en: 'Line up!', fi: 'Riviin!' })
  w.sound('whoosh')
  // Two heats: across, and back again.
  for (const [from, to, first] of [[track.from, track.to, true], [track.to, track.from, false]] as const) {
    for (const p of players) {
      const z = lane.get(p.id)!
      moves.set(
        p,
        'line',
        (function* (): Anim {
          if (first) yield* p.walkTo({ x: from, z }, { run: gap(p, { x: from, z }) > 5, near: 0.08 })
          yield* p.turnTo({ x: to, z })
          yield* p.poseTo(getSet(p), 0.25)
        })(),
      )
    }
    for (const until = w.t + 9; w.t < until && players.some((p) => moves.kind(p) !== null); ) {
      players = moves.keep(players, me)
      moves.step()
      yield
    }
    if (!first) me.say({ en: 'And back!', fi: 'Ja takaisin!' })
    yield* w.wait(first ? 0.3 : 1)
    me.speak({ en: 'Ready...', fi: 'Paikoillanne...' }, 0.9)
    yield* w.wait(0.9)
    me.speak({ en: 'Set...', fi: 'Valmiit...' }, 0.9)
    yield* w.wait(0.9)
    me.speak({ en: 'Go!', fi: 'Nyt!' }, 1)
    w.sound('bell')
    const went = w.t
    players = moves.keep(players, me)
    const finished: ActorApi[] = []
    for (const p of players) {
      const z = lane.get(p.id)!
      // Now and then something on the way: a kid trips, a cat stops to sniff, a grown-up jogs the first half to give the kids a chance.
      const trip = w.random() < (animal(p) ? 0.5 : p.kind === 'grownup' ? 0.6 : 0.3) ? w.lerp(from, to, 0.3 + w.random() * 0.4) : null
      moves.set(
        p,
        'run',
        (function* (): Anim {
          yield* w.wait(w.random() * 0.35)
          if (track.swim && first) {
            // Into the water with a splash.
            yield* p.jump(0.45, 1.3)
            w.sound('splash')
            w.puff({ x: p.x, y: 0, z: p.z, kind: 'drop', color: palette.waterLight, count: 10, size: 0.1, speed: 1.6, up: 2, life: 0.7 })
          }
          if (trip !== null && !track.swim) {
            yield* p.walkTo({ x: trip, z }, { run: p.kind !== 'grownup', near: 0.05 })
            if (animal(p)) {
              p.say(p.kind === 'cat' ? { en: 'Meow?', fi: 'Miau?' } : { en: 'Woof?', fi: 'Hau?' })
              yield* p.poseTo({ lean: 0.3, head: { nod: 0.4, turn: 0.5 }, tail: 1 }, 0.3)
              yield* w.wait(0.6 + w.random() * 0.8)
              yield* p.rest(0.2)
            } else if (p.kind !== 'grownup') {
              p.say({ en: 'Oops!', fi: 'Hups!' })
              yield* p.tumble()
              w.sound('giggle')
            }
          }
          yield* p.walkTo({ x: to, z }, { run: true, near: 0.05 })
        })(),
      )
    }
    while (w.t - went < 16 && finished.length < players.length) {
      players = moves.keep(players, me)
      for (const p of players) {
        if (finished.includes(p) || (moves.kind(p) === 'run' && Math.abs(p.x - to) > 0.35)) continue
        finished.push(p)
        moves.set(p, 'done', finished.length === 1 ? winner(p, w) : clap(p, w, w.random() < 0.6 ? w.pick(CLAPS) : null))
      }
      if (!track.swim && w.random() < 0.3) {
        const p = w.pick(players.filter((r) => moves.kind(r) === 'run'))
        if (p) w.puff({ x: p.x, y: 0.05, z: p.z, kind: 'dust', count: 2, size: 0.12, speed: 0.5, up: 0.4, life: 0.5 })
      }
      moves.step()
      for (const p of players) if (moves.kind(p) === 'run' && track.swim) swimStroke(p, w)
      yield
    }
    for (const until = w.t + 2.5; w.t < until && players.some((p) => moves.kind(p) !== null); ) {
      moves.step()
      yield
    }
    if (w.t - start > 28) break
  }
  // Out of the pool onto the edge.
  if (track.swim) {
    for (const p of players) moves.set(p, 'out', p.walkTo({ x: track.from, z: lane.get(p.id)! }, { near: 0.1 }))
    for (const until = w.t + 6; w.t < until && players.some((p) => moves.kind(p) !== null); ) {
      players = moves.keep(players, me)
      moves.step()
      yield
    }
  }
  yield* me.rest()
}

// ------------------------------------------------------------------------------ the train

const TRAIN_SECS = 40
/** How fast a car catches up with its place in the line, m/s: faster than anyone walks. */
const CAR_SPEED = 2.6

/**
 * A winding loop through the room, about 45 m: ten points round the room's middle (round the
 * water in the pool), in and out by turns, each moved nearer or farther until it stands clear
 * of things, onlookers and water; it starts beside the front and goes round either way.
 */
function routeOf(me: ActorApi, w: WorldApi, others: Round[]): Spot[] {
  const things: Round[] = [...bigThings(w), ...others]
  const pool = ROOM_GEO[w.room].water.find((wt) => wt.kind === 'rect')
  const mid = pool === undefined ? { x: 0, z: 0 } : { x: (pool.x0 + pool.x1) / 2, z: (pool.z0 + pool.z1) / 2 }
  const ring = pool === undefined ? 6.5 : Math.hypot(pool.x1 - pool.x0, pool.z1 - pool.z0) / 2 + 1.6
  const dry = (s: Spot) => [0, 0.8].every((d) => !w.water(s.x + d, s.z) && !w.water(s.x - d, s.z) && !w.water(s.x, s.z + d) && !w.water(s.x, s.z - d))
  const from = Math.atan2(me.x - mid.x, me.z - mid.z)
  const way = w.random() < 0.5 ? 1 : -1
  const route: Spot[] = []
  for (let k = 1; k <= 10; k++) {
    const a = from + (way * k * Math.PI) / 5
    const want = ring + (k % 2 === 0 ? 1.2 : -1.2)
    for (const d of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3]) {
      const s = { x: mid.x + Math.sin(a) * (want + d), z: mid.z + Math.cos(a) * (want + d) }
      if (clearAt(w, s, things, 1, 1.5) && dry(s)) {
        route.push(s)
        break
      }
    }
  }
  return route.length > 0 ? route : [{ x: 0, z: frontRow(w) }]
}

/** Elbows bent, arms pumping like a steam engine's rods; an animal's front legs trot. */
function chuff(a: ActorApi, w: WorldApi) {
  if (animal(a)) return
  const s = Math.sin(w.t * 9)
  Object.assign(a.pose.armL, { swing: 0.35 + 0.6 * s, raise: 0.12, bend: 1.6 })
  Object.assign(a.pose.armR, { swing: 0.35 - 0.6 * s, raise: 0.12, bend: 1.6 })
}

interface Car {
  a: ActorApi
  /** How far behind the front its place in the line is, along the way the front walked. */
  back: number
  /** Its walk cycle. */
  phase: number
}

function* train(me: ActorApi, args: Args, w: WorldApi): Anim {
  let players = playersOf(me, args, w)
  takeIn(players, me, w)
  const moves = new Moves()
  const start = w.t
  const route = routeOf(me, w, onlookers(w, players))
  me.say({ en: 'All aboard!', fi: 'Kaikki kyytiin!' })
  yield* me.turnTo(route[0]!)
  // The line: nearest first, each a body's width behind the one ahead.
  const cars: Car[] = []
  let back = 0
  let ahead = me
  for (const p of players.filter((q) => q !== me).sort((a, b) => w.distance(me, a) - w.distance(me, b))) {
    back += ahead.radius + p.radius + 0.3
    cars.push({ a: p, back, phase: 0 })
    ahead = p
  }
  // Where the front has walked, with how far it had come; first a straight line behind it.
  const trail: { x: number; y: number; z: number; d: number }[] = []
  const behind = back + 1
  for (let k = 0; k <= 20; k++) {
    const s = me.ahead(-behind * (1 - k / 20))
    trail.push({ x: s.x, y: me.y, z: s.z, d: behind * (k / 20) })
  }
  const placeOf = (car: Car) => {
    const d = trail[trail.length - 1]!.d - car.back
    let i = trail.length - 1
    while (i > 0 && trail[i - 1]!.d > d) i--
    const b = trail[i]!
    const a = trail[Math.max(0, i - 1)]!
    const k = b.d - a.d < 1e-6 ? 1 : w.clamp((d - a.d) / (b.d - a.d), 0, 1)
    return { x: w.lerp(a.x, b.x, k), y: w.lerp(a.y, b.y, k), z: w.lerp(a.z, b.z, k) }
  }
  /** A car near its place walks there itself, step by step along the line; one far off walks round things to it first. */
  const drive = (car: Car) => {
    const p = car.a
    const at = placeOf(car)
    const off = gap(p, at)
    if (off > 1.2) {
      if (moves.kind(p) !== 'catch') moves.set(p, 'catch', p.walkTo(at, { run: off > 3, near: 0.2 }))
      return
    }
    if (moves.kind(p) !== null && moves.kind(p) !== 'catch') return
    moves.drop(p)
    const step = Math.min(off, CAR_SPEED * w.dt)
    if (step > 0.002) {
      turnToward(p, Math.atan2(at.x - p.x, at.z - p.z), 8 * w.dt)
      p.x += ((at.x - p.x) / off) * step
      p.z += ((at.z - p.z) / off) * step
      car.phase += step * ((Math.PI * 2) / 0.9)
    }
    p.y = at.y
    const s = Math.sin(car.phase)
    const pose = p.pose
    const moving = step > 0.002
    if (animal(p)) {
      pose.armL.swing = pose.legR.swing = moving ? 0.6 * s : pose.armL.swing * 0.8
      pose.armR.swing = pose.legL.swing = moving ? -0.6 * s : pose.armR.swing * 0.8
    } else {
      pose.legL.swing = moving ? 0.6 * s : pose.legL.swing * 0.8
      pose.legR.swing = moving ? -0.6 * s : pose.legR.swing * 0.8
      pose.legL.bend = 0.12 + (moving ? 0.4 * Math.max(0, s) : 0)
      pose.legR.bend = 0.12 + (moving ? 0.4 * Math.max(0, -s) : 0)
    }
    pose.bob = moving ? 0.025 * Math.abs(Math.cos(car.phase)) : 0
  }
  for (const car of cars) moves.set(car.a, 'catch', car.a.walkTo(placeOf(car), { near: 0.2 }))
  // Everybody to their places in the line, then off it goes.
  for (const until = w.t + 7; w.t < until && cars.some((c) => players.includes(c.a) && (moves.kind(c.a) !== null || gap(c.a, placeOf(c)) > 0.6)); ) {
    players = moves.keep(players, me)
    for (const car of cars) if (players.includes(car.a) && moves.kind(car.a) !== 'catch') drive(car)
    moves.step()
    yield
  }
  me.speak({ en: 'Toot toot!', fi: 'Tuut tuut!' }, 1.5)
  w.sound('bell')
  let leg = 0
  let walking = false
  let check = { x: me.x, z: me.z, t: w.t }
  let smoke = 0
  let chug = w.t + 2
  while (leg < route.length && w.t - start < TRAIN_SECS) {
    players = moves.keep(players, me)
    // On to the next point a metre before this one (no stop on the way), once the walk ends as near as it got, or when it gets nowhere.
    const stuck = w.t - check.t > 0.9 && gap(me, check) < 0.3
    if (w.t - check.t > 0.9) check = { x: me.x, z: me.z, t: w.t }
    if (walking && (gap(me, route[leg]!) < 1 || moves.kind(me) === null || stuck)) {
      leg++
      walking = false
    }
    if (leg < route.length && !walking) {
      moves.set(me, 'lead', me.walkTo(route[leg]!, { near: 0.3 }))
      walking = true
    }
    const tip = trail[trail.length - 1]!
    const moved = gap(me, tip)
    if (moved > 0.05) trail.push({ x: me.x, y: me.y, z: me.z, d: tip.d + moved })
    moves.step()
    for (const car of cars) if (players.includes(car.a)) drive(car)
    for (const p of players) chuff(p, w)
    if (w.t >= smoke) {
      smoke = w.t + 0.3
      const h = me.headAt()
      w.puff({ x: h.x, y: h.y + 0.35, z: h.z, kind: 'smoke', color: '#e4e4e4', count: 2, size: 0.18, speed: 0.3, up: 1.2, life: 1.2 })
    }
    if (w.t >= chug) {
      chug = w.t + 3.5
      const aboard = players.filter((p) => p !== me)
      const who = w.random() < 0.6 || aboard.length === 0 ? me : w.pick(aboard)
      who.say({ en: 'Choo choo!', fi: 'Tsuku tsuku!' }, 1.5)
    }
    yield
  }
  // The last stop: the front stands, the cars close up behind it, and all cheer.
  moves.drop(me)
  me.say({ en: 'Last stop!', fi: 'Perillä!' })
  for (const until = w.t + 1.5; w.t < until; ) {
    players = moves.keep(players, me)
    moves.step()
    for (const car of cars) if (players.includes(car.a)) drive(car)
    yield
  }
  yield* allHappy(players, w)
  yield* me.rest()
}

// ------------------------------------------------------------------------------ the library entries

export const GAMES: BuiltinAction[] = [
  {
    id: 'tag',
    name: 'tag',
    nameFi: 'hippa',
    calls: ['hippa', 'hippaa', 'hippasta', 'hippana', 'hipassa', 'hippaleikki', 'hippaleikkiä', 'tag', 'tig', 'play tag'],
    about: 'A game of tag: it is "it" first and chases the others, and a touch makes the one touched "it"; about 40 s.',
    params: [PLAYERS],
    run: tag,
  },
  {
    id: 'football-game',
    name: 'play football',
    nameFi: 'jalkapallo',
    calls: ['pelataan jalkapalloa', 'pelaa jalkapalloa', 'pelatkaa jalkapalloa', 'pelataan futista', 'pelaa futista', 'pelatkaa futista', 'jalkapallopeli', 'futispeli', 'play football', 'play soccer', 'soccer'],
    about: 'A game of football with two goals and two teams: the nearest of each team runs to the ball and kicks it toward the other goal, and the score is said at the end; about 45 s.',
    params: [PLAYERS],
    run: football,
  },
  {
    id: 'hide-and-seek',
    name: 'hide and seek',
    nameFi: 'piiloleikki',
    calls: ['piilosta', 'piilosille', 'piiloleikki', 'piiloleikkiä', 'piiloleikkiin', 'hide and seek', 'hide seek', 'hide and go seek'],
    about: 'Hide and seek: it covers its eyes and counts while the others hide behind things, then finds them one by one.',
    params: [PLAYERS],
    run: hideAndSeek,
  },
  {
    id: 'race',
    name: 'race',
    nameFi: 'kilpajuoksu',
    calls: ['kilpajuoksu', 'kilpajuoksua', 'kilpaa', 'juokse kilpaa', 'juoskaa kilpaa', 'juostaan kilpaa', 'uidaan kilpaa', 'uikaa kilpaa', 'kilpailu', 'kilpailua', 'race', 'running race', 'have a race'],
    about: 'A race across the room and back (a swimming race in the pool): ready, set, go, and the winner cheers.',
    params: [PLAYERS],
    run: race,
  },
  {
    id: 'train',
    name: 'train',
    nameFi: 'juna',
    calls: ['juna', 'junaa', 'junana', 'junaleikki', 'junaleikkiä', 'tsuku tsuku', 'play train', 'choo choo', 'follow the leader', 'follow leader'],
    about: 'A train, follow the leader: the others line up behind it and follow as it winds through the room, choo choo.',
    params: [PLAYERS],
    run: train,
  },
]
