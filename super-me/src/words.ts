/**
 * Every word of Super Me in both languages: the map, the levels, the pause menu, the
 * presents' cheers, and the closet with every part, option and colour named for the screen
 * reader. The game's own name is in the gallery's directory (profiles/src/directory.ts).
 */

import type { RoomId } from '../../pia-jump/src/game/model'
import type { Words } from '../../profiles/src/lang'
import type { Colour, Group, HairColour, Option, Part, Reward } from './game/closet'
import type { Kind } from './game/model'

/** The levels, one in each of Pia Jump's places, named as Pia Jump names them. */
export const LEVEL_NAMES: Record<RoomId, Words> = {
  garden: { en: 'Garden', fi: 'Puutarha' },
  kitchen: { en: 'Kitchen', fi: 'Keittiö' },
  bath: { en: 'Bath', fi: 'Kylpyhuone' },
  toys: { en: 'Toy Room', fi: 'Leikkihuone' },
  roof: { en: 'Roof', fi: 'Katto' },
}

export const HUD = {
  music: { en: 'Music', fi: 'Musiikki' },
  sound: { en: 'Sound', fi: 'Äänet' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  /** The word on the corner's button back to the gallery. */
  games: { en: 'Games', fi: 'Pelit' },
  holdToStartFresh: { en: 'Hold to start fresh', fi: 'Aloita alusta pitämällä pohjassa' },
  dressUp: { en: 'Dress up', fi: 'Pukeudu' },
  pause: { en: 'Pause', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  startAgain: { en: 'Start again', fi: 'Aloita alusta' },
  again: { en: 'Again', fi: 'Uudestaan' },
  map: { en: 'Map', fi: 'Kartta' },
  findThePresents: { en: 'Find the presents!', fi: 'Etsi lahjat!' },
  build: { en: 'Build', fi: 'Rakenna' },
} as const

export const CLOSET = {
  surpriseMe: { en: 'Surprise me', fi: 'Yllätä minut' },
  surpriseMeShown: { en: 'Surprise me!', fi: 'Yllätä minut!' },
  play: { en: 'Play', fi: 'Pelaa' },
  playShown: { en: 'Play!', fi: 'Pelaa!' },
  presentToFind: { en: 'A present to find', fi: 'Lahja, joka on vielä piilossa' },
} as const

/** The blocks she builds with, as the tray's buttons are named. */
export const KIND_NAMES: Record<Kind, Words> = {
  plank: { en: 'Plank', fi: 'Lauta' },
  cube: { en: 'Cube', fi: 'Palikka' },
  trampoline: { en: 'Trampoline', fi: 'Trampoliini' },
  ladder: { en: 'Ladder', fi: 'Tikkaat' },
}

/** What the child reads when a present opens. */
export const REWARD_WORDS: Record<Reward, Words> = {
  'paint:butterfly': { en: 'A butterfly!', fi: 'Perhonen!' },
  'shoes:rainboots': { en: 'Rain boots!', fi: 'Kumisaappaat!' },
  'hat:flowers': { en: 'Flowers!', fi: 'Kukkia!' },
  'nose:clown': { en: 'A funny nose!', fi: 'Hassu nenä!' },
  'lips:glitter': { en: 'Shiny lips!', fi: 'Kiiltävät huulet!' },
  'hat:chef': { en: 'A chef hat!', fi: 'Kokin hattu!' },
  'shadow:rainbow': { en: 'Rainbow eyes!', fi: 'Sateenkaarisilmät!' },
  'eyes:sparkle': { en: 'Sparkly eyes!', fi: 'Kimaltavat silmät!' },
  'extra:wings': { en: 'Wings!', fi: 'Siivet!' },
  'bottom:tutu': { en: 'A tutu!', fi: 'Tyllihame!' },
  'blush:hearts': { en: 'Heart cheeks!', fi: 'Sydänposket!' },
  'hat:crown': { en: 'A crown!', fi: 'Kruunu!' },
  'extra:cape': { en: 'A cape!', fi: 'Viitta!' },
  'top:stars': { en: 'A star dress!', fi: 'Tähtimekko!' },
  'hat:wizard': { en: 'A magic hat!', fi: 'Taikahattu!' },
}

/** The closet's four tabs. */
export const GROUP_NAMES: Record<Group, Words> = {
  face: { en: 'Face', fi: 'Kasvot' },
  body: { en: 'Body', fi: 'Vartalo' },
  clothes: { en: 'Clothes', fi: 'Vaatteet' },
  makeup: { en: 'Makeup', fi: 'Meikki' },
}

/** Each part's tab, as the screen reader names it. */
export const PART_NAMES: Record<Part, Words> = {
  face: { en: 'Face shape', fi: 'Kasvojen muoto' },
  eyes: { en: 'Eyes', fi: 'Silmät' },
  nose: { en: 'Nose', fi: 'Nenä' },
  mouth: { en: 'Mouth', fi: 'Suu' },
  hair: { en: 'Hair', fi: 'Hiukset' },
  height: { en: 'Height', fi: 'Pituus' },
  build: { en: 'Body shape', fi: 'Vartalon muoto' },
  skin: { en: 'Skin', fi: 'Iho' },
  hat: { en: 'Hat', fi: 'Hattu' },
  top: { en: 'Top', fi: 'Paita' },
  bottom: { en: 'Trousers and skirts', fi: 'Housut ja hameet' },
  shoes: { en: 'Shoes', fi: 'Kengät' },
  extra: { en: 'Extras', fi: 'Lisät' },
  shadow: { en: 'Eyeshadow', fi: 'Luomiväri' },
  lips: { en: 'Lips', fi: 'Huulet' },
  blush: { en: 'Cheeks', fi: 'Posket' },
  paint: { en: 'Face paint', fi: 'Kasvomaali' },
}

/** Every option of every part, as the screen reader names its tile. */
export const OPTION_NAMES: { [P in Part]: Record<Option<P>, Words> } = {
  face: {
    round: { en: 'Round', fi: 'Pyöreät' },
    oval: { en: 'Oval', fi: 'Soikeat' },
    wide: { en: 'Wide', fi: 'Leveät' },
  },
  eyes: {
    dots: { en: 'Dots', fi: 'Pisteet' },
    big: { en: 'Big', fi: 'Isot' },
    happy: { en: 'Happy', fi: 'Iloiset' },
    sleepy: { en: 'Sleepy', fi: 'Uniset' },
    sparkle: { en: 'Sparkly', fi: 'Kimaltavat' },
  },
  nose: {
    button: { en: 'Button', fi: 'Nappinenä' },
    dot: { en: 'Dot', fi: 'Pikkunenä' },
    clown: { en: 'Clown', fi: 'Pellen nenä' },
  },
  mouth: {
    smile: { en: 'Smile', fi: 'Hymy' },
    grin: { en: 'Big smile', fi: 'Iso hymy' },
    open: { en: 'Open', fi: 'Auki' },
    tongue: { en: 'Tongue out', fi: 'Kieli ulkona' },
  },
  hair: {
    short: { en: 'Short', fi: 'Lyhyet' },
    long: { en: 'Long', fi: 'Pitkät' },
    pigtails: { en: 'Pigtails', fi: 'Saparot' },
    ponytail: { en: 'Ponytail', fi: 'Poninhäntä' },
    curly: { en: 'Curly', fi: 'Kiharat' },
    bun: { en: 'Bun', fi: 'Nuttura' },
    spiky: { en: 'Spiky', fi: 'Piikit' },
  },
  height: {
    short: { en: 'Short', fi: 'Lyhyt' },
    middle: { en: 'Middle', fi: 'Keskipitkä' },
    tall: { en: 'Tall', fi: 'Pitkä' },
  },
  build: {
    slim: { en: 'Slim', fi: 'Hoikka' },
    middle: { en: 'Middle', fi: 'Keskikokoinen' },
    round: { en: 'Round', fi: 'Pyöreä' },
  },
  skin: {
    milk: { en: 'Milk', fi: 'Maito' },
    peach: { en: 'Peach', fi: 'Persikka' },
    honey: { en: 'Honey', fi: 'Hunaja' },
    caramel: { en: 'Caramel', fi: 'Karamelli' },
    cocoa: { en: 'Cocoa', fi: 'Kaakao' },
    coffee: { en: 'Coffee', fi: 'Kahvi' },
  },
  hat: {
    none: { en: 'No hat', fi: 'Ei hattua' },
    cap: { en: 'Cap', fi: 'Lippis' },
    bow: { en: 'Bow', fi: 'Rusetti' },
    ears: { en: 'Ears', fi: 'Korvat' },
    flowers: { en: 'Flowers', fi: 'Kukat' },
    chef: { en: 'Chef hat', fi: 'Kokin hattu' },
    crown: { en: 'Crown', fi: 'Kruunu' },
    wizard: { en: 'Magic hat', fi: 'Taikahattu' },
  },
  top: {
    tee: { en: 'T-shirt', fi: 'T-paita' },
    stripes: { en: 'Stripes', fi: 'Raitapaita' },
    dress: { en: 'Dress', fi: 'Mekko' },
    stars: { en: 'Star dress', fi: 'Tähtimekko' },
  },
  bottom: {
    pants: { en: 'Trousers', fi: 'Housut' },
    shorts: { en: 'Shorts', fi: 'Shortsit' },
    skirt: { en: 'Skirt', fi: 'Hame' },
    tutu: { en: 'Tutu', fi: 'Tyllihame' },
  },
  shoes: {
    sneakers: { en: 'Trainers', fi: 'Lenkkarit' },
    boots: { en: 'Boots', fi: 'Saappaat' },
    sandals: { en: 'Sandals', fi: 'Sandaalit' },
    rainboots: { en: 'Rain boots', fi: 'Kumisaappaat' },
  },
  extra: {
    none: { en: 'Nothing', fi: 'Ei mitään' },
    glasses: { en: 'Glasses', fi: 'Lasit' },
    scarf: { en: 'Scarf', fi: 'Huivi' },
    wings: { en: 'Wings', fi: 'Siivet' },
    cape: { en: 'Cape', fi: 'Viitta' },
  },
  shadow: {
    none: { en: 'No eyeshadow', fi: 'Ei luomiväriä' },
    blue: { en: 'Blue', fi: 'Sininen' },
    purple: { en: 'Purple', fi: 'Violetti' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    green: { en: 'Green', fi: 'Vihreä' },
    rainbow: { en: 'Rainbow', fi: 'Sateenkaari' },
  },
  lips: {
    none: { en: 'No lipstick', fi: 'Ei huulipunaa' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    red: { en: 'Red', fi: 'Punainen' },
    purple: { en: 'Purple', fi: 'Violetti' },
    glitter: { en: 'Shiny', fi: 'Kiiltävät' },
  },
  blush: {
    none: { en: 'No blush', fi: 'Ei poskipunaa' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    peach: { en: 'Peach', fi: 'Persikka' },
    hearts: { en: 'Hearts', fi: 'Sydämet' },
  },
  paint: {
    none: { en: 'No face paint', fi: 'Ei kasvomaalia' },
    star: { en: 'Star', fi: 'Tähti' },
    heart: { en: 'Heart', fi: 'Sydän' },
    whiskers: { en: 'Whiskers', fi: 'Viikset' },
    butterfly: { en: 'Butterfly', fi: 'Perhonen' },
  },
}

/** The colours of clothes and of hair, as the screen reader names their swatches. */
export const COLOUR_NAMES: Record<Colour | HairColour, Words> = {
  red: { en: 'Red', fi: 'Punainen' },
  orange: { en: 'Orange', fi: 'Oranssi' },
  yellow: { en: 'Yellow', fi: 'Keltainen' },
  green: { en: 'Green', fi: 'Vihreä' },
  teal: { en: 'Teal', fi: 'Turkoosi' },
  blue: { en: 'Blue', fi: 'Sininen' },
  purple: { en: 'Purple', fi: 'Violetti' },
  pink: { en: 'Pink', fi: 'Pinkki' },
  white: { en: 'White', fi: 'Valkoinen' },
  black: { en: 'Black', fi: 'Musta' },
  brown: { en: 'Brown', fi: 'Ruskea' },
  blonde: { en: 'Blonde', fi: 'Vaalea' },
  ginger: { en: 'Ginger', fi: 'Punainen' },
}
