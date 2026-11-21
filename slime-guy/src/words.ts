/**
 * Every word of Slime Guy in both languages, few and big: the buttons, the shouts, the
 * islands, and the name of every thing, colour and pattern a screen reader says. The
 * game's title is the directory's (profiles/src/directory.ts). The Finnish names of the
 * islands and the clothes are the brief's own (design.md).
 */

import type { Words } from '../../profiles/src/lang'
import type { ItemId, Pattern, SlimeColour, Slot } from './game/closet'
import type { CourseId } from './game/model'

export const WORDS = {
  /** The starter's word, as in a race: Finnish starts one with "Paikoillenne, valmiit, hep!". "Mennään!" is too wide for the map's bottom row on a phone. */
  go: { en: 'Go!', fi: 'Hep!' },
  hooray: { en: 'Hooray!', fi: 'Jippii!' },
  again: { en: 'Again!', fi: 'Uudestaan!' },
  map: { en: 'Map', fi: 'Kartta' },
  gotKey: { en: 'You got the key!', fi: 'Sait avaimen!' },
  openBox: { en: 'Open the box!', fi: 'Avaa laatikko!' },
  pause: { en: 'Pause', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  soundOn: { en: 'Sound on', fi: 'Ääni päällä' },
  soundOff: { en: 'Sound off', fi: 'Ääni pois' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Lisää pelejä' },
  /** The jump key's cap on the teaching picture. */
  space: { en: 'Space', fi: 'Välilyönti' },
  steer: { en: 'Steer', fi: 'Ohjaa' },
  hide: { en: 'Hide', fi: 'Piiloon' },
  jump: { en: 'Jump', fi: 'Hyppää' },
  islandBefore: { en: 'Island before', fi: 'Edellinen saari' },
  nextIsland: { en: 'Next island', fi: 'Seuraava saari' },
  wardrobe: { en: 'Wardrobe', fi: 'Vaatekaappi' },
  starJar: { en: 'Star jar', fi: 'Tähtipurkki' },
  backToMap: { en: 'Back to the map', fi: 'Takaisin kartalle' },
  notFoundYet: { en: 'Not found yet', fi: 'Ei vielä löytynyt' },
  noPattern: { en: 'No pattern', fi: 'Ei kuviota' },
  notOpenYet: { en: 'Not open yet', fi: 'Ei vielä auki' },
} as const satisfies Record<string, Words>

/** Each island's name (the ready card and the map), and where Go! takes the slime, written whole for Finnish's endings. */
export const COURSE_WORDS: Record<CourseId, { name: Words; goTo: Words }> = {
  park: { name: { en: 'Park', fi: 'Puisto' }, goTo: { en: 'Go to Park', fi: 'Puistoon' } },
  beach: { name: { en: 'Beach', fi: 'Ranta' }, goTo: { en: 'Go to Beach', fi: 'Rannalle' } },
  candy: { name: { en: 'Candy Land', fi: 'Karkkimaa' }, goTo: { en: 'Go to Candy Land', fi: 'Karkkimaahan' } },
  winter: { name: { en: 'Snow Land', fi: 'Talvimaa' }, goTo: { en: 'Go to Snow Land', fi: 'Talvimaahan' } },
  night: { name: { en: 'Star Night', fi: 'Tähtiyö' }, goTo: { en: 'Go to Star Night', fi: 'Tähtiyöhön' } },
}

/** Each thing to wear: its name (its wardrobe tile), and what the done card says when the box gives it, in a few words. */
export const ITEM_WORDS: Record<ItemId, { name: Words; gift: Words }> = {
  cap: { name: { en: 'Cap', fi: 'Lippis' }, gift: { en: 'A new cap!', fi: 'Uusi lippis!' } },
  tee: { name: { en: 'T-shirt', fi: 'T-paita' }, gift: { en: 'A new T-shirt!', fi: 'Uusi T-paita!' } },
  backpack: { name: { en: 'Backpack', fi: 'Reppu' }, gift: { en: 'A backpack!', fi: 'Reppu!' } },
  roundGlasses: { name: { en: 'Round glasses', fi: 'Pyöreät lasit' }, gift: { en: 'New glasses!', fi: 'Uudet lasit!' } },
  flowers: { name: { en: 'Flower crown', fi: 'Kukkaseppele' }, gift: { en: 'A flower crown!', fi: 'Kukkaseppele!' } },
  denimSkirt: { name: { en: 'Denim skirt', fi: 'Farkkuhame' }, gift: { en: 'A new skirt!', fi: 'Uusi hame!' } },
  sunhat: { name: { en: 'Sun hat', fi: 'Aurinkohattu' }, gift: { en: 'A sun hat!', fi: 'Aurinkohattu!' } },
  sunglasses: { name: { en: 'Sunglasses', fi: 'Aurinkolasit' }, gift: { en: 'Sunglasses!', fi: 'Aurinkolasit!' } },
  flowerShirt: { name: { en: 'Flower shirt', fi: 'Kukkapaita' }, gift: { en: 'A flower shirt!', fi: 'Kukkapaita!' } },
  shoulderBag: { name: { en: 'Shoulder bag', fi: 'Olkalaukku' }, gift: { en: 'A new bag!', fi: 'Uusi laukku!' } },
  flowerSkirt: { name: { en: 'Flower skirt', fi: 'Kukkahame' }, gift: { en: 'A flower skirt!', fi: 'Kukkahame!' } },
  bow: { name: { en: 'Big bow', fi: 'Iso rusetti' }, gift: { en: 'A big bow!', fi: 'Iso rusetti!' } },
  heartGlasses: { name: { en: 'Heart glasses', fi: 'Sydänlasit' }, gift: { en: 'Heart glasses!', fi: 'Sydänlasit!' } },
  glitterShirt: { name: { en: 'Glitter shirt', fi: 'Kimallepaita' }, gift: { en: 'A glitter shirt!', fi: 'Kimallepaita!' } },
  tutu: { name: { en: 'Tutu', fi: 'Tyllihame' }, gift: { en: 'A tutu!', fi: 'Tyllihame!' } },
  handbag: { name: { en: 'Handbag', fi: 'Käsilaukku' }, gift: { en: 'A handbag!', fi: 'Käsilaukku!' } },
  pearls: { name: { en: 'Pearls', fi: 'Helminauha' }, gift: { en: 'Pearls!', fi: 'Helminauha!' } },
  beanie: { name: { en: 'Warm hat', fi: 'Pipo' }, gift: { en: 'A warm hat!', fi: 'Lämmin pipo!' } },
  sweater: { name: { en: 'Sweater', fi: 'Villapaita' }, gift: { en: 'A sweater!', fi: 'Villapaita!' } },
  hoodie: { name: { en: 'Hoodie', fi: 'Huppari' }, gift: { en: 'A hoodie!', fi: 'Huppari!' } },
  scarf: { name: { en: 'Scarf', fi: 'Kaulahuivi' }, gift: { en: 'A scarf!', fi: 'Kaulahuivi!' } },
  teddyBackpack: { name: { en: 'Teddy bag', fi: 'Nallereppu' }, gift: { en: 'A teddy bag!', fi: 'Nallereppu!' } },
  crown: { name: { en: 'Crown', fi: 'Kruunu' }, gift: { en: 'A crown!', fi: 'Kruunu!' } },
  stripes: { name: { en: 'Stripy shirt', fi: 'Raitapaita' }, gift: { en: 'A stripy shirt!', fi: 'Raitapaita!' } },
  stripeSkirt: { name: { en: 'Stripy skirt', fi: 'Raitahame' }, gift: { en: 'A stripy skirt!', fi: 'Raitahame!' } },
  partySkirt: { name: { en: 'Party skirt', fi: 'Juhlahame' }, gift: { en: 'A party skirt!', fi: 'Juhlahame!' } },
  kittyBackpack: { name: { en: 'Kitty bag', fi: 'Kissareppu' }, gift: { en: 'A kitty bag!', fi: 'Kissareppu!' } },
  bowTie: { name: { en: 'Bow tie', fi: 'Rusetti' }, gift: { en: 'A bow tie!', fi: 'Rusetti!' } },
}

/** The wardrobe's tabs, one for each place on the slime. */
export const SLOT_WORDS: Record<Slot, Words> = {
  hat: { en: 'Hats', fi: 'Päähän' },
  glasses: { en: 'Glasses', fi: 'Silmille' },
  shirt: { en: 'Shirts', fi: 'Paidat' },
  skirt: { en: 'Skirts', fi: 'Hameet' },
  bag: { en: 'Bags', fi: 'Laukut' },
  neck: { en: 'Neck things', fi: 'Kaulaan' },
}

export const COLOUR_WORDS: Record<SlimeColour, Words> = {
  green: { en: 'Green', fi: 'Vihreä' },
  pink: { en: 'Pink', fi: 'Pinkki' },
  blue: { en: 'Blue', fi: 'Sininen' },
  purple: { en: 'Purple', fi: 'Violetti' },
  orange: { en: 'Orange', fi: 'Oranssi' },
}

export const PATTERN_WORDS: Record<Pattern, Words> = {
  dots: { en: 'Dots', fi: 'Pilkut' },
  stripes: { en: 'Stripes', fi: 'Raidat' },
  glitter: { en: 'Glitter', fi: 'Kimallus' },
  rainbow: { en: 'Rainbow', fi: 'Sateenkaari' },
  gold: { en: 'Gold', fi: 'Kulta' },
}
