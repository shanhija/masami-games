/**
 * The cast: the five who are there when the game starts, and the names new avatars get.
 * Each looks clearly different from far away: skin, hair and its colour, top, bottom, shoes,
 * a skirt or not, height and build. Each has a name in each language (Aino in Finnish is Alice
 * in English) and keeps its id in both; their calls are what a recognizer may write for the
 * name when a Finnish or an English child says it.
 */

import { LANGS, type CastNames, type Lang } from '../engine/lang'
import { ROOM_GEO } from '../engine/rooms'
import { newActor } from '../engine/sim'
import type { Actor, Look, Pronoun } from '../engine/types'

export interface CastMember {
  /** The same in both languages: saved looks and phrases find it by this. */
  id: string
  names: CastNames
  pronoun: Pronoun
  look: Look
}

/** The cat answers to these in both languages. */
const CAT_WORDS = ['kissa', 'kisu', 'kisuli', 'kissi', 'katti', 'kisse', 'miuku', 'cat', 'kitty']

export const CAST: readonly CastMember[] = [
  {
    id: 'alice',
    names: {
      fi: { name: 'Aino', calls: ['aino', 'ainoo', 'aiino', 'ainno', 'ainu'] },
      en: { name: 'Alice', calls: ['alice', 'alis', 'aliisa', 'alisa', 'älis', 'elis', 'ällis', 'ellis', 'alise', 'alisse', 'aalis', 'allis', 'alyce', 'alys'] },
    },
    pronoun: 'she',
    look: {
      body: 'kid',
      height: 1.15,
      build: 1,
      skin: '#ffd9b3',
      eyes: '#3a5fa0',
      top: '#9b5fd3',
      bottom: '#23306e',
      shoes: '#fbf8f2',
      skirt: false,
      worn: { hair: { kind: 'hair-ponytail', tint: '#e07a1a' } },
    },
  },
  {
    id: 'steve',
    names: {
      fi: { name: 'Eetu', calls: ['eetu', 'eetuu', 'eettu', 'eedu', 'eeto'] },
      en: { name: 'Steve', calls: ['steve', 'stiivi', 'stiiv', 'stive', 'steeve', 'tiivi', 'stiivu', 'stiv', 'stevie', 'stiven', 'stefe', 'steeven', 'steven'] },
    },
    pronoun: 'he',
    look: {
      body: 'kid',
      height: 1.22,
      build: 1.1,
      skin: '#c68a5e',
      eyes: '#2b2b30',
      top: '#4a78e0',
      bottom: '#5e6570',
      shoes: '#e8503f',
      skirt: false,
      worn: { hair: { kind: 'hair-short', tint: '#2b2b30' }, head: { kind: 'cap', tint: null } },
    },
  },
  {
    id: 'mike',
    names: {
      // 'miko' is the stem the endings go on: Mikolle, Mikon, Mikolla.
      fi: { name: 'Mikko', calls: ['mikko', 'miko', 'mikkoo', 'mikke'] },
      en: { name: 'Mike', calls: ['mike', 'maik', 'maikki', 'maike', 'mikke', 'maiki', 'maikke', 'maikk', 'maiku', 'mikko', 'maikka', 'mikey', 'myke'] },
    },
    pronoun: 'he',
    look: {
      body: 'grownup',
      height: 1.8,
      build: 1.05,
      skin: '#f1c79a',
      eyes: '#2b2b30',
      top: '#5ec25a',
      bottom: '#3d63d8',
      shoes: '#5a3a24',
      skirt: false,
      worn: { hair: { kind: 'hair-short', tint: '#8a5a34' }, face: { kind: 'glasses', tint: null } },
    },
  },
  {
    id: 'noora',
    names: {
      fi: { name: 'Noora', calls: ['noora', 'nora', 'nuura', 'noura', 'norra', 'noorah', 'noro', 'nooro'] },
      en: { name: 'Nora', calls: ['nora', 'noora', 'norah', 'noura', 'norra', 'nuura', 'noro'] },
    },
    pronoun: 'she',
    look: {
      body: 'kid',
      height: 1.05,
      build: 0.95,
      skin: '#ffe6cf',
      eyes: '#2a9d8f',
      top: '#ff9ccf',
      bottom: '#ff9ccf',
      shoes: '#e8503f',
      skirt: true,
      worn: { hair: { kind: 'hair-pigtails', tint: '#f5d77a' } },
    },
  },
  {
    id: 'mirri',
    names: {
      fi: { name: 'Mirri', calls: ['mirri', 'miri', 'mirre', 'mirr', 'miiri', ...CAT_WORDS] },
      en: { name: 'Luna', calls: ['luna', 'luuna', 'loona', 'lune', 'lunah', ...CAT_WORDS] },
    },
    pronoun: 'she',
    look: {
      body: 'cat',
      height: 0.5,
      build: 1.1,
      skin: '#f5a13b',
      eyes: '#5ec25a',
      top: '#f5a13b',
      bottom: '#fbf8f2',
      shoes: '#fbf8f2',
      skirt: false,
      worn: {},
    },
  },
]

/**
 * Names for new avatars in each language, in turn, a girl's first: common names a five-year-old
 * knows, each starting with its own letter, unlike the cast's and each other's when heard, and
 * none a word a child says in a command. The Finnish ones keep their consonants in every form
 * (Ellalle, Hugon), so the endings a child puts on them still find them.
 */
export const NEW_NAMES: Record<Lang, readonly string[]> = {
  fi: ['Ella', 'Leo', 'Venla', 'Hugo', 'Iida', 'Niilo', 'Saga', 'Kasper', 'Ronja', 'Onni'],
  en: ['Olivia', 'Jack', 'Hannah', 'Ben', 'Sophie', 'Daniel', 'Grace', 'Peter', 'Kate', 'Tom'],
}

/** The starting actors, fresh, called by their names in `lang` (English unless given): each its own copy of its look, standing on the playground's spawn row. */
export function makeCast(lang: Lang = 'en'): Actor[] {
  const spawn = ROOM_GEO.playground.spawn
  return CAST.map((c, i) => {
    const own = c.names[lang]
    return newActor({ id: c.id, name: own.name, calls: [...own.calls], names: structuredClone(c.names), pronoun: c.pronoun, look: structuredClone(c.look), x: spawn[i]!.x, z: spawn[i]!.z, yaw: 0 })
  })
}

/**
 * The names a starting avatar goes by when its saved entry calls it `name`: its own in both
 * languages when `name` is one of them, so it goes on following the language; null when the
 * child gave it another name, which it keeps in both, and for an avatar the child made.
 */
export function castNamesFor(id: string, name: string): CastNames | null {
  const c = CAST.find((m) => m.id === id)
  const said = name.trim().toLowerCase()
  return c !== undefined && LANGS.some((l) => c.names[l].name.toLowerCase() === said) ? structuredClone(c.names) : null
}
