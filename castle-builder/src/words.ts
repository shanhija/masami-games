/**
 * Every word of Castle Builder in both languages, which are few: the King's wish, the goods
 * and the prices are pictures. What is left is the start card, the pause menu, and the names
 * a screen reader says for the buttons. The game's own name is the directory's.
 */

import type { Words } from '../../profiles/src/lang'
import type { BarKind } from './game/sim'

export const WORDS = {
  look: { en: 'Look at the castle', fi: 'Katso linnaa' },
  pause: { en: 'Pause', fi: 'Tauko' },
  paused: { en: 'Paused', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  soundOn: { en: 'Sound on', fi: 'Äänet päällä' },
  soundOff: { en: 'Sound off', fi: 'Äänet pois' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Lisää pelejä' },
  stormsOn: { en: 'Storms on', fi: 'Myrskyt päällä' },
  stormsOff: { en: 'Storms off', fi: 'Myrskyt pois' },
  newCastle: { en: 'New castle', fi: 'Uusi linna' },
  reallyNewCastle: { en: 'Really? Yes, new castle', fi: 'Varmasti? Kyllä, uusi linna' },
  tapToPlay: { en: 'Tap to play', fi: 'Napauta ja pelaa' },
  play: { en: 'Play', fi: 'Pelaa' },
  howToPlay: {
    en: 'Arrows run. Space builds or hops. Tap a tree to chop it, a sheep to shear it. Fix what the storm breaks.',
    fi: 'Nuolilla juokset. Välilyönnillä rakennat tai hyppäät. Napauta puuta, niin hakkaat sen. Napauta lammasta, niin keritset sen. Korjaa, mitä myrsky rikkoo.',
  },
  stillHere: { en: 'Your castle is still here!', fi: 'Linnasi on vielä tallella!' },
} as const satisfies Record<string, Words>

/** What each button of the build bar builds or does, for a screen reader: the pieces, the workshops and their people, the brush and the hand. */
export const BAR_NAMES: Record<BarKind, Words> = {
  wall: { en: 'Wall', fi: 'Muuri' },
  tower: { en: 'Tower', fi: 'Torni' },
  gate: { en: 'Gate', fi: 'Portti' },
  room: { en: 'Room', fi: 'Huone' },
  hall: { en: 'Dance hall', fi: 'Tanssisali' },
  garden: { en: 'Garden', fi: 'Puutarha' },
  banner: { en: 'Banner', fi: 'Lippu' },
  belltower: { en: 'Bell tower', fi: 'Kellotorni' },
  woodcutter: { en: 'Woodcutter', fi: 'Puunhakkaaja' },
  mason: { en: 'Mason', fi: 'Kivenhakkaaja' },
  smithy: { en: 'Smithy', fi: 'Seppä' },
  weaver: { en: 'Weaver', fi: 'Kutoja' },
  dyer: { en: 'Dyer', fi: 'Värjääjä' },
  paint: { en: 'Paint', fi: 'Maalaa' },
  lift: { en: 'Take a piece back', fi: 'Ota pala takaisin' },
}
