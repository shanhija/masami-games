/**
 * Every word of Rocket Factory in both languages, picked by the player's language where it is
 * shown or said (plans/finnish-and-english.md): each card's one word and each new sticker's
 * name, which Beep says aloud; her countdown, her cheer, her good night, her call when the
 * munchers come out and her question at the lab's one choice; the names a screen reader gives
 * the HUD's buttons (the child sees pictures); and the pause menu, which the parent reads. The
 * game logic keeps ids (a card, a sticker, a 'say' event's Said), never words.
 */

import type { Words } from '../../profiles/src/lang'
import type { CardId, MunchersMode, Placeable, Said, ScienceMode, Sticker } from './game/model'

/** Each card's one word: big on the card as it flips over, and what Beep says as it does. */
export const CARD_WORDS: Record<CardId, Words> = {
  digger: { en: 'Digger!', fi: 'Kaivuri!' },
  gold: { en: 'Gold!', fi: 'Kulta!' },
  science: { en: 'Science!', fi: 'Tiede!' },
  gears: { en: 'Gears!', fi: 'Rattaat!' },
  bubbles: { en: 'Bubbles!', fi: 'Kuplat!' },
  hedges: { en: 'Hedges!', fi: 'Pensaat!' },
  nose: { en: 'Nose!', fi: 'Nokka!' },
  stars: { en: 'Stars!', fi: 'Tähdet!' },
  snacks: { en: 'Snacks!', fi: 'Herkut!' },
  more: { en: 'More!', fi: 'Lisää!' },
  rocket: { en: 'Rocket!', fi: 'Raketti!' },
  fuel: { en: 'Fuel!', fi: 'Polttoaine!' },
}

/** What Beep says the first time she places a sticker of each kind: a word or two a five-year-old knows, and one name per thing, so a sticker a card brings alone is called by its card's word (the orange bottle maker is Stars!, as its card is; the snack bowl comes with Snacks!). */
export const STICKER_WORDS: Record<Placeable, Words> = {
  digger: { en: 'Digger!', fi: 'Kaivuri!' },
  oven: { en: 'Oven!', fi: 'Uuni!' },
  workshop: { en: 'Workshop!', fi: 'Paja!' },
  greenMaker: { en: 'Green bottles!', fi: 'Vihreät pullot!' },
  orangeMaker: { en: 'Stars!', fi: 'Tähdet!' },
  lab: { en: 'Lab!', fi: 'Labra!' },
  pump: { en: 'Pump!', fi: 'Pumppu!' },
  tower: { en: 'Bubble tower!', fi: 'Kuplatorni!' },
  bowl: { en: 'Snack bowl!', fi: 'Herkkukulho!' },
}

/** The words of a sim 'say' event: a card's word or a new sticker's. */
export const saidWords = (said: Said): Words => ('card' in said ? CARD_WORDS[said.card] : STICKER_WORDS[said.sticker])

/** Beep counts down with the launch's countdown, a number a second. */
export const COUNTDOWN: Record<number, Words> = {
  5: { en: 'Five!', fi: 'Viisi!' },
  4: { en: 'Four!', fi: 'Neljä!' },
  3: { en: 'Three!', fi: 'Kolme!' },
  2: { en: 'Two!', fi: 'Kaksi!' },
  1: { en: 'One!', fi: 'Yksi!' },
}

/** Beep's other words: the flight home landing, dusk at Good night, the scout hopping out, and the lab's one choice waiting. */
export const BEEP_SAYS = {
  hooray: { en: 'Hooray!', fi: 'Hurraa!' },
  goodNight: { en: 'Good night!', fi: 'Hyvää yötä!' },
  munchers: { en: 'Munchers!', fi: 'Mutustajat!' },
  whichOne: { en: 'Which one?', fi: 'Kumpi?' },
} as const

/** Each sticker's name for a screen reader. */
export const STICKER_NAMES: Record<Sticker, Words> = {
  digger: { en: 'Digger', fi: 'Kaivuri' },
  oven: { en: 'Oven', fi: 'Uuni' },
  workshop: { en: 'Workshop', fi: 'Paja' },
  greenMaker: { en: 'Green bottle maker', fi: 'Vihreä pullokone' },
  orangeMaker: { en: 'Orange bottle maker', fi: 'Oranssi pullokone' },
  lab: { en: 'Lab', fi: 'Labra' },
  pump: { en: 'Pump', fi: 'Pumppu' },
  tower: { en: 'Bubble tower', fi: 'Kuplatorni' },
  bowl: { en: 'Snack bowl', fi: 'Herkkukulho' },
  hedge: { en: 'Hedge', fi: 'Pensas' },
}

/** The HUD's other buttons, named for a screen reader, and New! on the sticker the chain needs. */
export const HUD = {
  pencil: { en: 'Pencil', fi: 'Kynä' },
  peel: { en: 'Peel', fi: 'Irrota' },
  oops: { en: 'Oops', fi: 'Hups' },
  rocket: { en: 'The rocket', fi: 'Raketti' },
  path: { en: 'The path', fi: 'Polku' },
  pause: { en: 'Pause', fi: 'Tauko' },
  play: { en: 'Play', fi: 'Pelaa' },
  fresh: { en: 'New!', fi: 'Uusi!' },
} as const

/** The pause menu's buttons. */
export const PAUSE = {
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  goodNight: { en: 'Good night', fi: 'Hyvää yötä' },
  sound: { en: 'Sound', fi: 'Äänet' },
  music: { en: 'Music', fi: 'Musiikki' },
  voice: { en: 'Voice', fi: 'Puhe' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  startAgain: { en: 'Start again', fi: 'Aloita alusta' },
  bringBack: { en: 'Bring back', fi: 'Tuo takaisin' },
  forGrownUps: { en: 'For grown-ups', fi: 'Aikuisille' },
  notSaved: { en: 'Not saved', fi: 'Ei tallessa' },
  keepACopy: { en: 'Keep a copy', fi: 'Ota kopio' },
  bringBackACopy: { en: 'Bring back a copy', fi: 'Tuo kopio' },
} as const

/** The Munchers switch: the word under each picture (the parent reads it, so he can tell Few from Polite), and the whole name for a screen reader. */
export const MUNCHER_WORDS: Record<MunchersMode, Words> = {
  many: { en: 'Many', fi: 'Paljon' },
  few: { en: 'Few', fi: 'Vähän' },
  polite: { en: 'Polite', fi: 'Kiltit' },
  none: { en: 'None', fi: 'Ei yhtään' },
}
export const MUNCHER_NAMES: Record<MunchersMode, Words> = {
  many: { en: 'Many munchers', fi: 'Paljon mutustajia' },
  few: { en: 'Few munchers', fi: 'Vähän mutustajia' },
  polite: { en: 'Polite munchers', fi: 'Kiltit mutustajat' },
  none: { en: 'No munchers', fi: 'Ei mutustajia' },
}

/** The Science switch, the same way: one bottle, and one rushing along. */
export const SCIENCE_WORDS: Record<ScienceMode, Words> = {
  normal: { en: 'Normal', fi: 'Tavallinen' },
  quicker: { en: 'Quicker', fi: 'Nopeampi' },
}
export const SCIENCE_NAMES: Record<ScienceMode, Words> = {
  normal: { en: 'Normal science', fi: 'Tavallinen tiede' },
  quicker: { en: 'Quicker science', fi: 'Nopeampi tiede' },
}
