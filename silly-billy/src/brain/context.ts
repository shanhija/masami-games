/**
 * What the interpreter and the designer are told about the game besides the child's words: the
 * whole scene, one short line a thing. The room and its water; every actor with where it stands
 * and faces, what it holds, wears, rides or sits on and what it is doing or did last; every thing
 * here by its id with where it is, what it stands on or lies in and who holds it; each kind here
 * once with its size, how it is handled, its moving parts and anchors; who was spoken to, the
 * newest thing and the last commands; every action with its params; every item kind (with its
 * Finnish name in a game played in Finnish); the names free for a new avatar. Measured on the
 * commands of 2026-11-09 through the CLI: 2.3k characters more than the old context, and Haiku's
 * first word still came after 0.65 s; its time follows the length of its answer, not of this.
 *
 * The world's state is in its place: the sky (the time, night, rain and snow) and the room's water
 * level in `roomLines`, each actor's states (sick, wet...) in `actorLine`, what a thing is fixed
 * to and its lights in `thingLine`, and whether a kind is food, hot or cold, or soft in `kindLine`.
 * A script (a plan's code for this moment, `moment-...` in the library while it runs) is no action.
 *
 * `api.ts`'s `contextNames` reads the actors, the actions, the item kinds and the rooms back from
 * these lines: a change to their shape is made there too.
 */

import { effectsLeft } from '../engine/effects'
import { LANGS, type Lang } from '../engine/lang'
import { slugOf } from '../engine/protocol'
import { inWater, ROOM_GEO, type Water } from '../engine/rooms'
import { nightOf, skyOf, terrainOf } from '../engine/sky'
import { ROOM_HALF, ROOMS, type Actor, type Item, type RoomId, type World } from '../engine/types'
import type { Vocabulary } from './parse'

/** What the brain knows of the moment besides the world. */
export interface Moment {
  /** The one a command without a name goes to. */
  addressee: string | null
  /** The avatar made last. */
  lastMade: string | null
  /** The last commands understood, oldest first, in the game's language ('Aino: hyppää'). */
  said: readonly string[]
  /** Each actor's last finished step: 'dance', 'throw(pinecone, steve)'. */
  did: ReadonlyMap<string, string>
  /** The game language's names for a new avatar. */
  newNames: readonly string[]
}

/** A plan's script while it runs: an action of this command's, under a name nothing else has. */
const MOMENT = 'moment-'
export const momentId = (serial: number, id: string) => `${MOMENT}${serial}-${slugOf(id)}`
export const isMoment = (id: string) => id.startsWith(MOMENT)
/** A script's own name, for what an actor did: 'backflip-on-trampoline'. */
export const momentName = (id: string) => (isMoment(id) ? id.replace(/^moment-\d+-/, '') : id)

/** Every name anyone here goes by, lowercase, in either language: a new avatar takes none of them (a new Aino made in English would meet Alice's Finnish name). */
export function takenNames(world: World): Set<string> {
  return new Set(world.actors.flatMap(({ name, names }) => (names === null ? [name] : LANGS.map((l) => names[l].name))).map((n) => n.toLowerCase()))
}

/** A position in whole metres. */
const at = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`
/** A size to the decimetre. */
const dm = (v: number) => String(Math.round(v * 10) / 10)
/** Which way a yaw looks, as the child sees the room: front is toward the viewer (+z), right is +x. */
const FACING = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left']
const facing = (yaw: number) => FACING[((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8]!
/** The room's water by name: the pool's pool and the forest's pond. */
const WATER_NAME: Record<RoomId, string> = { playground: 'water', pool: 'the pool', forest: 'the pond' }

function waterLine(world: World): string {
  const room = world.room
  const water = ROOM_GEO[room].water
  if (water.length === 0) return 'Water: none.'
  const spot = (x: number, z: number) => `${dm(x)},${dm(z)}`
  const one = (w: Water) =>
    w.kind === 'rect' ? `${WATER_NAME[room]}, from ${spot(w.x0, w.z0)} to ${spot(w.x1, w.z1)}` : `${WATER_NAME[room]}, round, its middle at ${spot(w.x, w.z)}, ${dm(w.r * 2)} m across`
  const level = terrainOf(world, room).water
  const how = level >= 0.99 ? 'full' : level <= 0.01 ? 'empty' : `${Math.round(level * 100)}% full`
  return `Water: ${water.map(one).join('; ')}, ${dm(-ROOM_GEO[room].floor)} m deep, ${how}.`
}

/** The sky, the same in every room: the time of day, and the weather when there is any. */
function skyLine(world: World): string {
  const sky = skyOf(world)
  const h = Math.floor(sky.time)
  const night = nightOf(sky.time)
  const light = night >= 0.99 ? 'night' : night <= 0.01 ? 'day' : h < 12 ? 'dawn' : 'dusk'
  const weather = (['rain', 'snow', 'fog', 'wind'] as const).filter((k) => sky[k] > 0.05).map((k) => `${k} ${Math.round(sky[k] * 100)}%`)
  return `Sky: ${light}, ${h}:${String(Math.round((sky.time - h) * 60)).padStart(2, '0')}${weather.length > 0 ? `; ${weather.join(', ')}` : ''}.`
}

/** The room as a whole: which it is, how places are written, its water and the sky. */
function roomLines(world: World): string[] {
  return [
    `Room: ${world.room}. Rooms: ${ROOMS.map((r) => `${r} (${ROOM_GEO[r].calls[0]})`).join(', ')}.`,
    `Places are 'x,z' in metres: x to the right, z toward the front (the viewer), each from -${ROOM_HALF} to ${ROOM_HALF}.`,
    waterLine(world),
    skyLine(world),
  ]
}

/** One actor: who, where, what it holds, wears, rides and does, and the states it is in (sick, wet...) with the seconds left. */
function actorLine(a: Actor, world: World, vocab: Vocabulary, did: string | undefined): string {
  const thing = (id: string) => {
    const it = world.items.find((i) => i.id === id)
    return it === undefined ? id : `${it.id} ${it.kind}`
  }
  const held = [...new Set([a.hands.right, a.hands.left].flatMap((id) => (id === null ? [] : [thing(id)])))]
  const worn = Object.values(a.look.worn).flatMap((w) => (w === undefined ? [] : [w.tint === null ? w.kind : `${w.kind} (${w.tint})`]))
  // What it rides or sits on: a thing made to be ridden is ridden (a mystery box is sat on).
  const ridden = world.items.find((i) => i.id === a.riding)
  const rides = ridden !== undefined && vocab.items.get(ridden.kind)?.info.recipe.meta.ride === true ? 'rides' : 'sits on'
  const step = (action: string, args: Record<string, string>) => `${momentName(action)}(${Object.values(args).join(', ')})`
  const states = Object.entries(effectsLeft(a, world.t)).map(([e, secs]) => `${e} ${Math.ceil(secs)} s`)
  return [
    `${a.id} ${a.name} ${a.look.body} ${a.pronoun}`,
    `at ${at(a.x, a.z)}${a.y > 0.3 ? ` up ${dm(a.y)}` : ''}${inWater(world.room, a.x, a.z) ? ' in water' : ''} facing ${facing(a.yaw)}${a.scale !== 1 ? ` size x${dm(a.scale)}` : ''}`,
    ...(held.length > 0 ? [`holds ${held.join(', ')}`] : []),
    ...(worn.length > 0 ? [`wears ${worn.join(', ')}`] : []),
    ...(ridden !== undefined ? [`${rides} ${ridden.id} ${ridden.kind}`] : []),
    ...(states.length > 0 ? [states.join(', ')] : []),
    ...(a.joinedBy !== null ? [`taken along by ${a.joinedBy}`] : []),
    ...(a.doing !== null ? [`doing ${step(a.doing.action, a.doing.args)}`] : []),
    ...(a.thinking !== null ? [`waits for ${a.thinking.about} to be made`] : []),
    ...(a.doing === null && did !== undefined ? [`did ${did}`] : []),
  ].join('; ')
}

/** One thing here: where it is, what it stands on or lies in or is fixed to, who holds it, and its lights when someone switched them. */
function thingLine(it: Item, world: World, vocab: Vocabulary, newest: string | null): string {
  const holder = it.holder?.actor
  const where =
    holder !== undefined
      ? `held by ${holder}`
      : [
          at(it.x, it.z),
          ...(it.y > 0.15 ? [`up ${dm(it.y)}`] : []),
          ...(inWater(world.room, it.x, it.z) ? ['in water'] : []),
          ...(it.attached ? [`fixed to ${it.attached.to}${it.attached.at === null ? '' : ` at ${it.attached.at}`}`] : [standsOn(it, world, vocab)].flatMap((on) => (on === null ? [] : [`on ${on.id} ${on.kind}`]))),
        ].join(' ')
  return [
    `${it.id} ${it.kind}`,
    where,
    ...(it.fixed ? ['fixed'] : []),
    ...(it.loose && Math.hypot(it.vx, it.vy, it.vz) > 0.5 ? ['flying'] : []),
    ...(it.scale !== 1 ? [`size x${dm(it.scale)}`] : []),
    ...(it.tint !== null ? [`painted ${it.tint}`] : []),
    ...(it.glow === true ? ['lit'] : it.glow === false ? ['switched off'] : []),
    ...(it.light ? [`shines ${it.light}`] : []),
    ...(it.added ? ['with added bits'] : []),
    ...(vocab.items.get(it.kind)?.info.rough === true ? ['a draft, being made'] : []),
    ...(it.id === newest ? ['newest'] : []),
  ].join(' ')
}

/** The thing another one stands on: up off the ground, over the other's footprint, near its top. */
function standsOn(it: Item, world: World, vocab: Vocabulary): Item | null {
  if (it.y < 0.15) return null
  return (
    world.items.find((o) => {
      if (o === it || o.holder !== null) return false
      const size = vocab.items.get(o.kind)?.info.size
      if (size === undefined) return false
      const reach = (Math.max(size[0], size[2]) / 2) * o.scale
      return Math.hypot(o.x - it.x, o.z - it.z) <= reach && Math.abs(o.y + size[1] * o.scale - it.y) < 0.4
    }) ?? null
  )
}

const EVERY_ANCHOR = new Set(['top', 'seat', 'hand'])

/** A kind here, once: its size, how it is handled, food, hot or cold, soft, its moving parts and its anchors (a kind nobody made is a mystery box). */
function kindLine(kind: string, vocab: Vocabulary): string {
  const lib = vocab.items.get(kind)
  if (lib === undefined) return `${kind}: a mystery box, nobody made it yet`
  const info = lib.info
  const meta = info.recipe.meta
  const how = [
    meta.carry === 'no' ? 'too big to carry' : meta.carry === 'hug' ? 'carried in both arms' : 'carried in a hand',
    ...(meta.ride ? ['ridden'] : []),
    ...(meta.sit ? ['sat on'] : []),
    ...(meta.wear !== null ? [`worn on ${meta.wear}`] : []),
    ...(meta.solid ? ['solid'] : []),
    ...(info.recipe.traits.food !== null ? [`food: ${info.recipe.traits.food}`] : []),
    ...(info.recipe.traits.temp !== null ? [info.recipe.traits.temp] : []),
    ...(info.recipe.traits.soft ? ['soft'] : []),
  ]
  const parts = [...new Set(info.recipe.parts.map((p) => p.pose ?? p.name).filter((n) => !n.includes('~')))]
  // Every thing has a top, a seat and a hand anchor: only its own are news.
  const anchors = Object.keys(info.recipe.anchors).filter((n) => !EVERY_ANCHOR.has(n))
  return [
    `${kind}: ${info.size.map(dm).join('x')}`,
    how.join(', '),
    ...(parts.length > 0 ? [`parts ${parts.slice(0, 8).join(' ')}${parts.length > 8 ? ` +${parts.length - 8}` : ''}`] : []),
    ...(anchors.length > 0 ? [`anchors ${anchors.slice(0, 8).join(' ')}`] : []),
  ].join('; ')
}

export function interpreterContext(world: World, vocab: Vocabulary, moment: Moment): string {
  const taken = takenNames(world)
  const lang: Lang = world.lang
  // What was made last: the thing that appeared last (the room's own things are there from the start).
  const born = world.items.filter((i) => i.born > 0).sort((a, b) => b.born - a.born)[0]
  const kindsHere = [...new Set(world.items.map((i) => i.kind))]
  const kindName = (id: string) => {
    const fi = vocab.items.get(id)!.nameFi.toLowerCase()
    return lang === 'fi' && fi !== id ? `${id} (${fi})` : id
  }
  return [
    ...roomLines(world),
    'Actors (id name body pronoun; where; what it holds, wears, rides, does):',
    ...world.actors.map((a) => `- ${actorLine(a, world, vocab, moment.did.get(a.id))}`),
    `Last spoken to: ${moment.addressee ?? 'nobody'}. Last made: ${moment.lastMade ?? 'nobody'}.`,
    ...(moment.said.length > 0 ? [`Said before: ${moment.said.join(' / ')}.`] : []),
    `Things here (id kind where), ${world.items.length}:`,
    ...world.items.map((it) => `- ${thingLine(it, world, vocab, born?.id ?? null)}`),
    'Kinds here (kind: w x h x d m; how; moving parts; anchors):',
    ...kindsHere.map((k) => `- ${kindLine(k, vocab)}`),
    'Actions (id(params): about; ? optional):',
    ...[...vocab.actions.values()].filter((a) => !isMoment(a.id)).map((a) => `${a.id}(${a.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.kind}`).join(', ')}): ${a.about}`),
    `Item kinds: ${[...vocab.items.keys()].map(kindName).join(', ')}.`,
    `Names free for a new avatar: ${moment.newNames.filter((n) => !taken.has(n.toLowerCase())).join(', ') || 'none'}.`,
  ].join('\n')
}
