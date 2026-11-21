/**
 * Every word of Pia Jump in both languages: the rooms, the kittens, the shouts, the HUD and
 * the pause menu, and the words the ABC blocks spell. The game's own name is in the
 * gallery's directory (profiles/src/directory.ts).
 */

import type { Words } from '../../profiles/src/lang'
import type { Shout } from './game/game'
import type { Kitten, RoomId } from './game/model'

export const ROOM_NAMES: Record<RoomId, Words> = {
  garden: { en: 'Garden', fi: 'Puutarha' },
  kitchen: { en: 'Kitchen', fi: 'Keittiö' },
  bath: { en: 'Bath', fi: 'Kylpyhuone' },
  toys: { en: 'Toy Room', fi: 'Leikkihuone' },
  roof: { en: 'Roof', fi: 'Katto' },
}

/** The kittens' names, the same in both languages. */
export const KITTEN_NAMES: Record<Kitten, Words> = {
  sunny: { en: 'Sunny', fi: 'Sunny' },
  coco: { en: 'Coco', fi: 'Coco' },
  mochi: { en: 'Mochi', fi: 'Mochi' },
  lulu: { en: 'Lulu', fi: 'Lulu' },
  pepper: { en: 'Pepper', fi: 'Pepper' },
}

/** What the rooms screen says when a kitten comes home, each name with its Finnish ending. */
export const YOU_FOUND: Record<Kitten, Words> = {
  sunny: { en: 'You found Sunny!', fi: 'Löysit Sunnyn!' },
  coco: { en: 'You found Coco!', fi: 'Löysit Cocon!' },
  mochi: { en: 'You found Mochi!', fi: 'Löysit Mochin!' },
  lulu: { en: 'You found Lulu!', fi: 'Löysit Lulun!' },
  pepper: { en: 'You found Pepper!', fi: 'Löysit Pepperin!' },
}

/** The words that pop up on a moment. */
export const SHOUTS: Record<Shout, Words> = {
  wow: { en: 'Wow!', fi: 'Vau!' },
  boing: { en: 'Boing!', fi: 'Poing!' },
  oops: { en: 'Oops!', fi: 'Hups!' },
  yay: { en: 'Yay!', fi: 'Jee!' },
}

export const HUD = {
  /** The start card in a room. */
  find: (kitten: Words): Words => ({ en: `Find ${kitten.en}!`, fi: `Etsi ${kitten.fi}!` }),
  holdToStartFresh: { en: 'Hold to start fresh', fi: 'Aloita alusta pitämällä pohjassa' },
  paused: { en: 'Paused', fi: 'Tauko' },
  pause: { en: 'Pause', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  startAgain: { en: 'Start again', fi: 'Uudestaan' },
  rooms: { en: 'Rooms', fi: 'Huoneet' },
  music: { en: 'Music', fi: 'Musiikki' },
  sound: { en: 'Sound', fi: 'Äänet' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  youFoundThemAll: { en: 'You found them all!', fi: 'Löysit kaikki!' },
} as const

/** A word the blocks spell the same in both languages: a kitten's name, a run of the alphabet. */
const same = (word: string): Words => ({ en: word, fi: word })

/**
 * The words the ABC blocks spell, by the word the map writes (levels.ts, in English). The
 * blocks are tiles she stands on, so both words are as long as the map's: where no Finnish
 * word of that length fits, the map has a run as long as the Finnish word, and the English
 * found a word of that length too.
 */
export const BLOCK_WORDS: Record<string, Words> = {
  HEY: { en: 'HEY', fi: 'HEI' },
  SUN: { en: 'SUN', fi: 'PUU' },
  YUM: { en: 'YUM', fi: 'NAM' },
  BATH: { en: 'BATH', fi: 'AMME' },
  FUN: { en: 'FUN', fi: 'ILO' },
  MOON: { en: 'MOON', fi: 'ILTA' },
  // The staircases: each kitten's name over a run of the alphabet.
  SUNNY: same('SUNNY'),
  COCO: same('COCO'),
  MOCHI: same('MOCHI'),
  LULU: same('LULU'),
  PEPPER: same('PEPPER'),
  ABCDE: same('ABCDE'),
  ABCDEF: same('ABCDEF'),
  ABCDEFG: same('ABCDEFG'),
}
