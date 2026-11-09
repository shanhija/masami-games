/**
 * For the brain's tests only: small worlds and a vocabulary like the library's, matched the
 * way the library matches (engine/words.ts), so the parser and the context can be tested
 * without the engine's sim or the content.
 */

import type { Lang } from '../engine/lang'
import type { ActionEntry, ItemEntry, Param, ParamKind } from '../engine/protocol'
import { restPose, type Actor, type BodyKind, type Item, type ItemMeta, type Pronoun, type Recipe, type Slot, type World } from '../engine/types'
import { matchWord } from '../engine/words'
import type { Vocabulary } from './parse'

export function testActor(id: string, calls: string[], pronoun: Pronoun, body: BodyKind = 'kid'): Actor {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    calls,
    names: null,
    pronoun,
    look: { body, height: body === 'cat' ? 0.5 : 1.15, build: 1, skin: '#f3c9a8', eyes: '#3a2a22', top: '#9b5fd3', bottom: '#4a78e0', shoes: '#e8503f', skirt: false, worn: {} },
    x: 0,
    y: 0,
    z: 4,
    yaw: 0,
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
    speed: 1.4,
    stride: 0,
  }
}

export function testItem(id: string, kind: string, x = 0, z = 0): Item {
  return {
    id,
    kind,
    x,
    y: 0,
    z,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    loose: false,
    holder: null,
    rider: null,
    parts: {},
    state: {},
    tint: null,
    born: 0,
    fixed: false,
  }
}

/** The starting cast with the calls a recognizer may write for them. */
export const testCast = (): Actor[] => [
  testActor('alice', ['alice', 'alis', 'aliisa', 'alisa', 'älis', 'elis'], 'she'),
  testActor('steve', ['steve', 'stiivi', 'stiiv', 'stive', 'steeve', 'tiivi'], 'he'),
  testActor('mike', ['mike', 'maik', 'maikki', 'maike', 'maiki', 'mikke'], 'he', 'grownup'),
  testActor('noora', ['noora', 'nora', 'nuura'], 'she'),
  testActor('mirri', ['mirri', 'miri', 'kissa', 'kisu', 'kisuli', 'cat'], 'it', 'cat'),
]

/** A world played in English unless `lang` says otherwise. */
export function testWorld(actors: Actor[], items: Item[] = [], lang: Lang = 'en'): World {
  return {
    t: 0,
    lang,
    frame: 0,
    room: 'playground',
    actors,
    items,
    away: { playground: [], pool: [], forest: [] },
    puffs: [],
    sounds: [],
    speech: [],
    events: [],
    nextId: items.length + 1,
    rng: 1,
    spotlight: null,
  }
}

const param = (name: string, kind: ParamKind, optional = false): Param => ({ name, kind, about: name, optional })

/** Some basic verbs with params and Finnish calls like the content's (content/actions.ts). */
export const TEST_ACTIONS: { id: string; calls: string[]; params: Param[] }[] = [
  { id: 'walk', calls: ['kävele', 'mene', 'mee', 'kulje', 'walk'], params: [param('to', 'place', true)] },
  { id: 'run', calls: ['juokse', 'juoks', 'run'], params: [param('to', 'place', true)] },
  { id: 'come', calls: ['tule', 'tuu', 'tule tänne', 'tänne', 'come'], params: [] },
  { id: 'jump', calls: ['hyppää', 'hypi', 'pomppaa', 'loikkaa', 'jump'], params: [param('to', 'place', true), param('times', 'number', true)] },
  { id: 'spin', calls: ['pyöri', 'pyörähdä', 'pyörii', 'käänny', 'spin'], params: [param('times', 'number', true)] },
  { id: 'sit', calls: ['istu', 'istuudu', 'sit'], params: [param('on', 'item', true)] },
  { id: 'give', calls: ['anna', 'vie', 'give'], params: [param('thing', 'item', true), param('to', 'actor')] },
  { id: 'pick-up', calls: ['ota', 'nosta', 'poimi', 'pick up'], params: [param('thing', 'item')] },
  { id: 'take-off', calls: ['riisu', 'ota pois'], params: [param('thing', 'text', true)] },
  { id: 'say', calls: ['sano', 'huuda', 'say'], params: [param('words', 'text')] },
  { id: 'follow', calls: ['seuraa', 'follow'], params: [param('who', 'actor')] },
  { id: 'make', calls: ['tee', 'tehkää', 'luo', 'rakenna', 'taio', 'make'], params: [param('thing', 'text'), param('color', 'text', true)] },
  { id: 'wear', calls: ['pue', 'pukeudu', 'laita päähän', 'anna', 'wear'], params: [param('thing', 'text'), param('color', 'text', true)] },
  { id: 'paint', calls: ['maalaa', 'värjää', 'väritä', 'paint'], params: [param('color', 'text'), param('thing', 'thing', true), param('part', 'text', true)] },
  { id: 'wave', calls: ['vilkuta', 'heiluta', 'moikkaa', 'wave'], params: [param('to', 'thing', true)] },
]

export const TEST_ITEMS: { id: string; calls: string[]; carry: ItemMeta['carry']; wear?: Slot }[] = [
  { id: 'tree', calls: ['puu', 'puun', 'puuhun', 'puulle', 'puita', 'tree'], carry: 'no' },
  { id: 'bench', calls: ['penkki', 'penkille', 'penkin', 'penkkiin', 'bench'], carry: 'no' },
  { id: 'ball', calls: ['pallo', 'pallon', 'palloa', 'ball'], carry: 'hand' },
  { id: 'slide', calls: ['liukumäki', 'liukumäkeen', 'liukumäen', 'slide'], carry: 'no' },
  { id: 'swing', calls: ['keinu', 'keinuun', 'keinun', 'swing'], carry: 'no' },
  { id: 'glasses', calls: ['lasit', 'silmälasit', 'glasses'], carry: 'hand', wear: 'face' },
  { id: 'hair-short', calls: ['tukka', 'tukan', 'hiukset', 'short hair'], carry: 'hand', wear: 'hair' },
]

const anchorsOf = (id: string): Recipe['anchors'] => (id === 'slide' ? { top: { at: [0, 2, 0], part: null } } : id === 'swing' ? { seat: { at: [0, 0.5, 0], part: 'seat1' } } : {})

export function testVocabulary(actions = TEST_ACTIONS, items = TEST_ITEMS): Vocabulary {
  const words = (list: { id: string; calls: string[] }[]) => list.map((e) => ({ id: e.id, words: [e.id, ...e.calls] }))
  return {
    // The Finnish names are the first calls, as the content's are.
    actions: new Map(actions.map((a) => [a.id, { id: a.id, name: a.id, nameFi: a.calls[0] ?? a.id, about: `does ${a.id}`, params: a.params }])),
    // Big things stand 2 m high and are solid; the slide has its steps' top as an anchor, the swing its seat.
    items: new Map(
      items.map((i) => [
        i.id,
        {
          id: i.id,
          name: i.id.replace(/-/g, ' '),
          nameFi: i.calls[0] ?? i.id,
          info: {
            size: i.carry === 'no' ? [2, 2, 2] : [0.3, 0.3, 0.3],
            rough: false,
            recipe: {
              parts: i.id === 'swing' ? [{ name: 'seat1', at: [0, 0.5, 0], rot: [0, 0, 0], parent: null }] : [],
              anchors: anchorsOf(i.id),
              meta: { wear: i.wear ?? null, carry: i.carry, ride: false, sit: i.id === 'swing' || i.id === 'bench', bouncy: 0.3, solid: i.carry === 'no' },
              traits: { food: null, temp: null, soft: i.id === 'bench' },
            },
          },
        },
      ]),
    ),
    actionFor: (word, opts) => matchWord(word, words(actions), opts),
    itemKindFor: (word, opts) => matchWord(word, words(items), opts),
  }
}

const MADE = '2026-11-08T00:00:00.000Z'

/** A made action as the dev server sends it: the designer's code, and the same wrapped as the guard wraps it (one header line). */
export function actionEntry(id: string, code: string, params: Param[] = []): ActionEntry {
  return { type: 'action', id, name: id, nameFi: id, calls: [id], about: id, params, code, guarded: `function* __action(me, args, w) {\n${code}\n}`, by: 'opus', asked: id, made: MADE }
}

/** A made thing: its model code, or null for the interpreter's draft. */
export function itemEntry(id: string, code: string | null, tick: string | null = null): ItemEntry {
  return {
    type: 'item',
    id,
    name: id,
    nameFi: id,
    calls: [id],
    about: id,
    code,
    guarded: code === null ? null : `function __model(m) {\n${code}\n}`,
    tick,
    tickGuarded: tick === null ? null : `function __tick(it, w, dt) {\n${tick}\n}`,
    rough: code === null ? [{ shape: 'cylinder', size: [0.3, 0.04, 0.3], at: [0, 0.02, 0], color: 'orange' }] : null,
    roughMeta: code === null ? { carry: 'hand' } : null,
    by: code === null ? 'haiku' : 'opus',
    asked: id,
    made: MADE,
  }
}
