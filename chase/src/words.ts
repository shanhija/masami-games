/**
 * Every word of Police Chase in both languages: the start card, the shouts, the hints under
 * the picture, the pause card, and what a screen reader says for each button. A key is
 * written in brackets, `[ESC]`, and the HUD shows it as a key cap, so each language keeps its
 * own word order around it. The game's own name is the directory's (profiles/src/directory.ts).
 */

import type { Words } from '../../profiles/src/lang'
import type { Role } from './game/sim'

/** The two cars, on the start card's buttons. */
export const ROLE: Record<Role, Words> = {
  police: { en: '🚓 Police', fi: '🚓 Poliisi' },
  robber: { en: '💰 Robber', fi: '💰 Rosvo' },
}

/** The pause card's button that switches car: a whole phrase for each, since Finnish puts the car in its own case. */
export const PLAY_AS: Record<Role, Words> = {
  police: { en: 'Play as 🚓 Police', fi: 'Pelaa 🚓 poliisina' },
  robber: { en: 'Play as 💰 Robber', fi: 'Pelaa 💰 rosvona' },
}

/** The start card's line of what to press. */
export const GO: Words = { en: 'Press [SPACE] to go!', fi: 'Paina [VÄLILYÖNTI] ja aja!' }

/** What to do as each car, at the bottom of the start card. */
export const GOAL: Record<Role, Words> = {
  police: { en: 'Jump the rocks and cakes. Catch the robber!', fi: 'Hyppää kivien ja kakkujen yli. Ota rosvo kiinni!' },
  robber: { en: 'Jump the rocks and cakes. Get away from the police!', fi: 'Hyppää kivien ja kakkujen yli. Karkaa poliisilta!' },
}

/** The big shouts in the middle of the picture. */
export const SHOUT = {
  gotcha: { en: 'GOTCHA!', fi: 'KIINNI!' },
  gotAway: { en: 'GOT AWAY!', fi: 'KARKUUN!' },
  /** The robber, to the police, as it floors it after a catch. */
  catchMe: { en: 'Catch me!', fi: 'Ota kiinni!' },
  /** To the robber, as it floors it after a catch. */
  goGoGo: { en: 'Go go go!', fi: 'Kaasua!' },
  /** To the robber that got away, as the police floor it back. */
  hereTheyCome: { en: 'Here they come!', fi: 'Poliisi tulee!' },
  bonk: { en: 'BONK!', fi: 'PUMS!' },
  worm: { en: 'EEK! A worm!', fi: 'IIK! Mato!' },
}

/** The line at the bottom while driving, or what to do with a worm in the car. */
export const HINT = {
  jump: { en: '[SPACE] or tap = jump', fi: '[VÄLILYÖNTI] tai napauta = hyppää' },
  pedals: { en: '[◀] brake [▶] turbo', fi: '[◀] jarru [▶] turbo' },
  worm: { en: 'Jump! Shake it off!', fi: 'Hyppää! Ravista se pois!' },
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

/** What a screen reader says for the buttons and the turbo bolts. */
export const NAME = {
  turbo: { en: 'turbo', fi: 'turbo' },
  brake: { en: 'brake', fi: 'jarru' },
  pause: { en: 'pause', fi: 'tauko' },
  keepGoing: { en: 'keep going', fi: 'jatka' },
  soundOn: { en: 'sound on', fi: 'ääni päällä' },
  soundOff: { en: 'sound off', fi: 'ääni pois' },
  turboLeft: (lit: number, of: number): Words => ({ en: `turbo ${lit} of ${of}`, fi: `turbo ${lit}/${of}` }),
}
