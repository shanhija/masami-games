/**
 * Small things and verbs for the engine's own tests, so the engine is tested without
 * content/: a ball, a box to hug, a bench to sit on, a bike whose seat is inside a part, a rock
 * in the way, a hat, and a few verbs written against the API like the built-ins are.
 */

import type { ItemApi, Spot, Target } from './api'
import type { Lang } from './lang'
import { Library, type BuiltinAction, type BuiltinItem } from './library'
import type { ActionEntry, ItemEntry, Param } from './protocol'
import { createWorld, newActor, Sim, type Placement } from './sim'
import { STEP, type Look, type RoomId, type Step, type WorldEvent } from './types'

export const kidLook = (top: string): Look => ({
  body: 'kid',
  height: 1.15,
  build: 1,
  skin: '#ffd9b3',
  eyes: '#3a2a20',
  top,
  bottom: '#4a78e0',
  shoes: '#2b2b30',
  skirt: false,
  worn: {},
})

export const ITEMS: BuiltinItem[] = [
  {
    id: 'ball',
    name: 'ball',
    nameFi: 'pallo',
    calls: ['pallo', 'pallon', 'palloa'],
    about: 'a red ball',
    build: (m) => {
      m.sphere(0.12, { at: [0, 0.12, 0], color: 'red' })
      return { carry: 'hand', bouncy: 0.75, solid: false }
    },
  },
  {
    id: 'box',
    name: 'box',
    nameFi: 'laatikko',
    calls: ['laatikko'],
    about: 'a big cardboard box',
    build: (m) => {
      m.box(0.7, 0.6, 0.6, { at: [0, 0.3, 0], color: 'tan' })
      return { carry: 'hug', solid: false }
    },
  },
  {
    id: 'bench',
    name: 'bench',
    nameFi: 'penkki',
    calls: ['penkki'],
    about: 'a park bench',
    build: (m) => {
      m.box(1.6, 0.08, 0.45, { at: [0, 0.45, 0], color: 'brown' })
      for (const x of [-0.7, 0.7]) m.box(0.08, 0.45, 0.4, { at: [x, 0.22, 0], color: 'darkbrown' })
      m.anchor('seat', [0, 0.49, 0])
      return { carry: 'no', sit: true, solid: true }
    },
  },
  {
    id: 'bike',
    name: 'bike',
    nameFi: 'pyörä',
    calls: ['pyörä', 'polkupyörä'],
    about: 'a bicycle',
    build: (m) => {
      for (const z of [-0.5, 0.5]) m.part(z > 0 ? 'wheelFront' : 'wheelBack', { at: [0, 0.32, z] }, () => m.torus(0.3, 0.04, { rot: [0, Math.PI / 2, 0], color: 'black' }))
      m.part('frame', { at: [0, 0.35, 0] }, () => {
        m.box(0.06, 0.06, 1.0, { at: [0, 0.2, 0], color: 'blue' })
        m.box(0.2, 0.05, 0.25, { at: [0, 0.45, -0.15], color: 'black' })
        m.anchor('seat', [0, 0.48, -0.15])
      })
      return { carry: 'hug', ride: true, solid: false, bouncy: 0.2 }
    },
  },
  {
    id: 'rock',
    name: 'rock',
    nameFi: 'kivi',
    calls: ['kivi'],
    about: 'a big grey rock',
    build: (m) => {
      m.cylinder(0.5, 0.6, 0.8, { at: [0, 0.4, 0], color: 'grey' })
      return { carry: 'no', solid: true }
    },
  },
  {
    id: 'hat',
    name: 'hat',
    nameFi: 'hattu',
    calls: ['hattu'],
    about: 'a top hat',
    build: (m) => {
      m.cylinder(0.14, 0.14, 0.2, { at: [0, 0.3, 0], color: 'black' })
      m.cylinder(0.24, 0.24, 0.02, { at: [0, 0.2, 0], color: 'black' })
      return { carry: 'hand', wear: 'head' }
    },
  },
]

const param = (name: string, kind: Param['kind']): Param => ({ name, kind, about: name, optional: true })

export const ACTIONS: BuiltinAction[] = [
  {
    id: 'walk',
    name: 'walk',
    nameFi: 'kävele',
    calls: ['kävele', 'mene'],
    about: 'walks to a place',
    params: [param('target', 'place')],
    run: function* (me, args) {
      yield* me.walkTo(args.target as Spot, { near: 0.1 })
    },
  },
  {
    id: 'pick-up',
    name: 'pick up',
    nameFi: 'ota',
    calls: ['ota', 'nosta'],
    about: 'picks a thing up',
    params: [param('thing', 'item')],
    run: function* (me, args) {
      if (args.thing) yield* me.pickUp(args.thing as ItemApi)
    },
  },
  {
    id: 'drop',
    name: 'drop',
    nameFi: 'pudota',
    calls: ['pudota'],
    about: 'lets go',
    params: [],
    run: function* (me, _args, w) {
      me.drop()
      yield* w.wait(0.2)
    },
  },
  {
    id: 'throw',
    name: 'throw',
    nameFi: 'heitä',
    calls: ['heitä'],
    about: 'throws a thing at someone',
    params: [param('thing', 'item'), param('target', 'thing')],
    run: function* (me, args, w) {
      const thing = args.thing as ItemApi | null
      const target = args.target as Target | null
      if (!thing) return
      yield* me.pickUp(thing)
      if (target) yield* me.turnTo(target)
      const t = w.throw(thing, target ?? me.ahead(4))
      yield* w.wait(t + 0.3)
      yield* me.rest()
    },
  },
  {
    id: 'jump',
    name: 'jump',
    nameFi: 'hyppää',
    calls: ['hyppää'],
    about: 'jumps',
    params: [],
    run: function* (me) {
      yield* me.jump(0.6)
    },
  },
  {
    id: 'ride',
    name: 'ride',
    nameFi: 'aja',
    calls: ['aja'],
    about: 'rides a thing three metres ahead',
    params: [param('thing', 'item')],
    run: function* (me, args, w) {
      const thing = args.thing as ItemApi | null
      if (!thing) return
      yield* me.ride(thing)
      const z = thing.z
      yield* w.during(2, (k) => {
        thing.z = z + 3 * k
        thing.part('wheelFront').rx += 0.2
      })
    },
  },
  {
    id: 'sit',
    name: 'sit',
    nameFi: 'istu',
    calls: ['istu'],
    about: 'sits on a thing, or on the ground',
    params: [param('thing', 'item')],
    run: function* (me, args) {
      yield* me.sitOn(args.thing as ItemApi | null)
    },
  },
  {
    id: 'wear',
    name: 'wear',
    nameFi: 'pue',
    calls: ['pue'],
    about: 'puts a thing on',
    params: [param('thing', 'item')],
    run: function* (me, args) {
      const thing = args.thing as ItemApi | null
      if (!thing) return
      yield* me.pickUp(thing)
      me.wear(thing)
    },
  },
  {
    id: 'take-off',
    name: 'take off',
    nameFi: 'riisu',
    calls: ['riisu'],
    about: 'takes a worn thing off',
    params: [param('slot', 'text')],
    run: function* (me, args, w) {
      me.takeOff(args.slot as 'head')
      yield* w.wait(0.2)
    },
  },
]

export const CAST = [
  { id: 'alice', name: 'Alice', top: '#9b5fd3' },
  { id: 'steve', name: 'Steve', top: '#4a78e0' },
  { id: 'mike', name: 'Mike', top: '#5ec25a' },
  { id: 'noora', name: 'Noora', top: '#ff9ccf' },
  { id: 'ella', name: 'Ella', top: '#f5a13b' },
  { id: 'leo', name: 'Leo', top: '#e8503f' },
]

export const newLibrary = () => new Library({ items: ITEMS, actions: ACTIONS })

/** A sim with `actors` kids on the spawn spots and the given things in each room, played in English unless `lang` says otherwise. */
export function makeSim(opts: { room?: RoomId; layouts?: Partial<Record<RoomId, Placement[]>>; actors?: number; seed?: number; library?: Library; lang?: Lang } = {}): Sim {
  const actors = CAST.slice(0, opts.actors ?? 2).map((c) => newActor({ id: c.id, name: c.name, calls: [c.id], pronoun: 'she', look: kidLook(c.top), x: 0, z: 0 }))
  const layouts = { playground: [], pool: [], forest: [], ...opts.layouts }
  return new Sim(createWorld({ room: opts.room ?? 'playground', actors, layouts, seed: opts.seed ?? 1, lang: opts.lang ?? 'en' }), opts.library ?? newLibrary())
}

let serial = 0
export const step = (action: string, args: Record<string, string> = {}): Step => ({ action, args, serial: ++serial })

/** Steps for `secs`, returning (and draining) every event. */
export function run(sim: Sim, secs: number, each: () => void = () => {}): WorldEvent[] {
  const events: WorldEvent[] = []
  for (let i = Math.round(secs / STEP); i > 0; i--) {
    sim.step()
    each()
    events.push(...sim.world.events)
    sim.world.events.length = 0
    sim.world.sounds.length = 0
  }
  return events
}

/** Steps until an event of `type` for `actor` comes (that step included), or throws after `most` seconds. */
export function runUntil(sim: Sim, type: WorldEvent['type'], actor: string, most: number, each: () => void = () => {}): WorldEvent[] {
  const events: WorldEvent[] = []
  for (let i = Math.round(most / STEP); i > 0; i--) {
    sim.step()
    each()
    events.push(...sim.world.events)
    sim.world.events.length = 0
    sim.world.sounds.length = 0
    if (events.some((e) => e.type === type && e.actor === actor)) return events
  }
  throw new Error(`no ${type} for ${actor} within ${most} s: ${JSON.stringify(events.map((e) => e.type))}`)
}

/** Made code as the dev server hands it over: wrapped, with `__g();` written by hand where the server would put it. */
export const guardedAction = (body: string) => `function* __action(me, args, w) {\n${body}\n}`

export function actionEntry(id: string, params: Param[], code: string): ActionEntry {
  return { type: 'action', id, name: id, nameFi: id, calls: [id], about: id, params, code, guarded: guardedAction(code), by: 'opus', asked: id, made: '2026-11-08T00:00:00Z' }
}

export function itemEntry(id: string, code: string | null, calls: string[] = [id]): ItemEntry {
  return {
    type: 'item',
    id,
    name: id,
    nameFi: calls[0] ?? id,
    calls,
    about: id,
    code,
    guarded: code === null ? null : `function __model(m) {\n${code}\n}`,
    tick: null,
    tickGuarded: null,
    rough: code === null ? [{ shape: 'box', size: [0.5, 1, 0.5], at: [0, 0.5, 0], color: 'green' }] : null,
    roughMeta: code === null ? { carry: 'hug' } : null,
    by: 'opus',
    asked: id,
    made: '2026-11-08T00:00:00Z',
  }
}
