/**
 * Every word of Foot Chase in both languages: the start card, the shouts, the hint under the
 * picture, the pause card, and what a screen reader says for each button. A key is written in
 * brackets, `[W]`, and the HUD shows it as a key cap, so each language keeps its own word order
 * around it. The game's own name is the directory's (profiles/src/directory.ts).
 */

import type { Words } from '../../profiles/src/lang'
import type { Shout } from './game/game'
import type { Role } from './game/sim'

/** The two runners, on the start card. */
export const ROLE: Record<Role, Words> = {
  police: { en: '👮 Police', fi: '👮 Poliisi' },
  robber: { en: '💰 Robber', fi: '💰 Rosvo' },
}

/** Each player's keys on the start card, and where to tap instead. */
export const KEYS: Record<Role, { keys: Words; tap: Words }> = {
  police: {
    keys: { en: '[W] jump [A] slow [D] fast', fi: '[W] hyppää [A] hitaasti [D] nopeasti' },
    tap: { en: 'or tap the left side', fi: 'tai napauta vasenta puolta' },
  },
  robber: {
    keys: { en: '[↑] jump [←] slow [→] fast', fi: '[↑] hyppää [←] hitaasti [→] nopeasti' },
    tap: { en: 'or tap the right side', fi: 'tai napauta oikeaa puolta' },
  },
}

/** The start card's last lines: what to press, and what each runner is after. */
export const START = {
  go: { en: 'Press [W] or [↑] to go!', fi: 'Paina [W] tai [↑] ja juokse!' },
  goal: {
    en: 'Robber, grab the money bags and get away! Police, catch the robber! Open your own boxes for a surprise.',
    fi: 'Rosvo, nappaa rahasäkit ja karkaa! Poliisi, ota rosvo kiinni! Avaa omat laatikot ja saat yllätyksen.',
  },
}

/** The big shouts in the middle of the picture. */
export const PHASE_SHOUT = {
  gotcha: { en: 'GOTCHA!', fi: 'KIINNI!' },
  gotAway: { en: 'GOT AWAY!', fi: 'KARKUUN!' },
  runRobber: { en: 'Run, robber!', fi: 'Juokse, rosvo!' },
  hereTheyCome: { en: 'Here they come!', fi: 'Poliisi tulee!' },
}

/** A runner's own shout, over its side of the picture. */
export const SHOUT: Record<Shout, Words> = {
  dog: { en: 'POLICE DOG!', fi: 'POLIISIKOIRA!' },
  skates: { en: 'SKATES!', fi: 'RULLALUISTIMET!' },
  whistle: { en: 'STOP, POLICE!', fi: 'SEIS, POLIISI!' },
  magnet: { en: 'MAGNET!', fi: 'MAGNEETTI!' },
  propeller: { en: 'PROPELLER!', fi: 'PROPELLI!' },
  banana: { en: 'BANANA!', fi: 'BANAANI!' },
  springs: { en: 'BOING BOING!', fi: 'POING POING!' },
  bone: { en: 'A BONE!', fi: 'LUU!' },
  bonk: { en: 'BONK!', fi: 'PUMS!' },
  honk: { en: 'BEEP BEEP!', fi: 'TÖÖT TÖÖT!' },
  slip: { en: 'WHOOPS!', fi: 'HUPS!' },
  woof: { en: 'WOOF!', fi: 'HAU HAU!' },
  stop: { en: 'STOP!', fi: 'SEIS!' },
}

/** The line at the bottom while running, in three parts. */
export const HINT = {
  jump: { en: '[W] [↑] or tap = jump', fi: '[W] [↑] tai napauta = hyppää' },
  slow: { en: '[A] [←] slow', fi: '[A] [←] hitaasti' },
  fast: { en: '[D] [→] fast', fi: '[D] [→] nopeasti' },
}

export const PAUSE = {
  paused: { en: 'Paused', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  startOver: { en: 'Start over', fi: 'Aloita alusta' },
  soundOn: { en: '🔊 Sound on', fi: '🔊 Ääni päällä' },
  soundOff: { en: '🔇 Sound off', fi: '🔇 Ääni pois' },
  fullScreen: { en: '⛶ Full screen', fi: '⛶ Koko näyttö' },
  moreGames: { en: '🎮 More games', fi: '🎮 Muut pelit' },
  escToGoOn: { en: '[ESC] to keep going', fi: 'Paina [ESC] ja jatka' },
}

/** What a screen reader says for the buttons and each runner's sprint bolts. */
export const NAME = {
  pedal: {
    police: { slow: { en: 'police slow', fi: 'poliisi hitaasti' }, fast: { en: 'police sprint', fi: 'poliisi nopeasti' } },
    robber: { slow: { en: 'robber slow', fi: 'rosvo hitaasti' }, fast: { en: 'robber sprint', fi: 'rosvo nopeasti' } },
  } satisfies Record<Role, { slow: Words; fast: Words }>,
  sprintLeft: {
    police: (lit: number, of: number): Words => ({ en: `police sprint ${lit} of ${of}`, fi: `poliisin spurtti ${lit}/${of}` }),
    robber: (lit: number, of: number): Words => ({ en: `robber sprint ${lit} of ${of}`, fi: `rosvon spurtti ${lit}/${of}` }),
  } satisfies Record<Role, (lit: number, of: number) => Words>,
  pause: { en: 'pause', fi: 'tauko' },
  keepGoing: { en: 'keep going', fi: 'jatka' },
  soundOn: { en: 'sound on', fi: 'ääni päällä' },
  soundOff: { en: 'sound off', fi: 'ääni pois' },
}
