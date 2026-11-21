/**
 * Every word of Monster Lunch in both languages, picked by the player's flag where it is shown.
 * The monsters' names are the same in both; a line with a name in it is written out whole for
 * each monster, so the Finnish keeps its case ending.
 */

import type { Words } from '../../profiles/src/lang'
import type { Shout } from './game/game'
import type { CourseId, Dish, Filling, MonsterId } from './game/model'

/** The course cards' places. */
export const PLACE: Record<CourseId, Words> = {
  park: { en: 'Park', fi: 'Puisto' },
  pond: { en: 'Pond', fi: 'Lampi' },
  garden: { en: 'Garden', fi: 'Puutarha' },
  farm: { en: 'Farm', fi: 'Maatila' },
  castle: { en: 'Castle', fi: 'Linna' },
}

/** The kitchen's heading, for the monster waiting in the course. */
export const LUNCH_FOR: Record<MonsterId, Words> = {
  munch: { en: 'Lunch for Munch!', fi: 'Lounas Munchille!' },
  gulp: { en: 'Lunch for Gulp!', fi: 'Lounas Gulpille!' },
  nibble: { en: 'Lunch for Nibble!', fi: 'Lounas Nibblelle!' },
  chomp: { en: 'Lunch for Chomp!', fi: 'Lounas Chompille!' },
  gobble: { en: 'Lunch for Gobble!', fi: 'Lounas Gobblelle!' },
}

export const DISH_WORD: Record<Dish, Words> = {
  burger: { en: 'Burger', fi: 'Hampurilainen' },
  croissant: { en: 'Croissant', fi: 'Croissant' },
}

/** The fillings' buttons, as a screen reader says them. */
export const FILLING_NAME: Record<Filling, Words> = {
  patty: { en: 'Burger patty', fi: 'Pihvi' },
  cheese: { en: 'Cheese', fi: 'Juusto' },
  salad: { en: 'Lettuce', fi: 'Salaatti' },
  tomato: { en: 'Tomato', fi: 'Tomaatti' },
  egg: { en: 'Egg', fi: 'Kananmuna' },
  pickle: { en: 'Pickle', fi: 'Suolakurkku' },
  onion: { en: 'Onion', fi: 'Sipuli' },
  ketchup: { en: 'Ketchup', fi: 'Ketsuppi' },
  chocolate: { en: 'Chocolate', fi: 'Suklaa' },
  jam: { en: 'Jam', fi: 'Hillo' },
  banana: { en: 'Banana', fi: 'Banaani' },
  cream: { en: 'Cream', fi: 'Kermavaahto' },
  strawberry: { en: 'Strawberry', fi: 'Mansikka' },
  ham: { en: 'Ham', fi: 'Kinkku' },
  blueberry: { en: 'Blueberry', fi: 'Mustikka' },
}

/** The words that pop up on a moment. */
export const SHOUT: Record<Shout, Words> = {
  yum: { en: 'Yum!', fi: 'Nam!' },
  yuck: { en: 'Yuck!', fi: 'Yäk!' },
  oops: { en: 'Oops!', fi: 'Hups!' },
  splash: { en: 'Splash!', fi: 'Plums!' },
  hooray: { en: 'Hooray!', fi: 'Jippii!' },
  burger: { en: 'Burger!', fi: 'Hampurilainen!' },
  croissant: { en: 'Croissant!', fi: 'Croissant!' },
  hurry: { en: 'Hurry!', fi: 'Äkkiä!' },
}

export const SAY = {
  newFood: { en: 'New food!', fi: 'Uutta ruokaa!' },
  new: { en: 'New!', fi: 'Uusi!' },
  holdToStartFresh: { en: 'Hold to start fresh', fi: 'Pidä pohjassa, niin aloitat alusta' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  back: { en: 'Back', fi: 'Takaisin' },
  go: { en: 'Go!', fi: 'Mennään!' },
  pause: { en: 'Pause', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  startAgain: { en: 'Start again', fi: 'Aloita alusta' },
  courses: { en: 'Courses', fi: 'Radat' },
  music: { en: 'Music', fi: 'Musiikki' },
  sound: { en: 'Sound', fi: 'Äänet' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
} as const satisfies Record<string, Words>
