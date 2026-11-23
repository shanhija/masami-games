/**
 * Magic House: the names of every sound a room can play (w.sound) and the engine plays itself.
 *
 * Silly Billy's twenty synthesised sounds come first, always there, safe for children by how they
 * are made. The recorded ones add to them: magic-house/sounds/sources.json says what each is made
 * of, `npm install` builds them, and the page plays a recording wherever one is built, for a
 * synthesised name too (splash, meow, woof and bell have recordings). Where the recordings are not
 * built, a recorded name plays the synthesised sound beside it here, so every name always sounds.
 * The names are chosen so a designer and a child know what each is: nothing that shoots, screams
 * or hurts.
 */

import { SOUND_NAMES, type SoundName } from '../../../silly-billy/src/engine/types'

/** Each recorded sound, with the synthesised sound it plays where the recordings are not built. */
export const RECORDED = {
  chime: 'ding',
  coins: 'bell',
  keys: 'bell',
  knock: 'drum',
  hammer: 'drum',
  spring: 'boing',
  thump: 'drum',
  door: 'drum',
  book: 'pop',
  page: 'whoosh',
  cloth: 'whoosh',
  click: 'pop',
  tick: 'pop',
  pluck: 'pop',
  yes: 'ding',
  plop: 'pop',
  bubbles: 'pop',
  squish: 'boing',
  pebbles: 'crash',
  'steps-wood': 'step',
  'steps-leaves': 'step',
  'steps-snow': 'step',
  tada: 'yay',
  xylophone: 'magic',
  sparkle: 'magic',
  baa: 'squeak',
  tweet: 'squeak',
  'clip-clop': 'step',
  balloon: 'whoosh',
  giggles: 'giggle',
  critter: 'giggle',
  dice: 'crash',
} as const satisfies Record<string, SoundName>

export type RecordedName = keyof typeof RECORDED

/** A sound by its name: one of Silly Billy's synthesised sounds or one of the recorded ones. */
export type HouseSound = SoundName | RecordedName

/** Every sound's name, the synthesised first and then the recorded: what w.sound takes and its line lists. */
export const HOUSE_SOUNDS: readonly HouseSound[] = [...SOUND_NAMES, ...(Object.keys(RECORDED) as RecordedName[])]

/** The synthesised sound that stands in for a name while no recording of it is there. */
export function synthesised(name: HouseSound): SoundName {
  return name in RECORDED ? RECORDED[name as RecordedName] : (name as SoundName)
}
