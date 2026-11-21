/**
 * Every word of the gallery in both languages: the directory's own (the cards are in
 * directory.ts), who is playing, and the player editor with each choice of the avatar named.
 */

import type { Avatar, Part } from './avatar'
import type { Words } from './lang'

export const GALLERY = {
  title: { en: 'Masami Games', fi: 'Masamin pelit' },
  pickGame: { en: 'Pick a game!', fi: 'Valitse peli!' },
  whoIsPlaying: { en: 'Who is playing?', fi: 'Kuka pelaa?' },
  newPlayer: { en: 'New player', fi: 'Uusi pelaaja' },
  change: (name: string): Words => ({ en: `Change ${name}`, fi: `Muuta pelaajaa ${name}` }),
  playing: (name: string): Words => ({ en: `${name} is playing. Change player`, fi: `${name} pelaa. Vaihda pelaajaa` }),
} as const

export const EDITOR = {
  yourPlayer: { en: 'Your player', fi: 'Sinun pelaajasi' },
  surprise: { en: '🎲 Surprise me!', fi: '🎲 Yllätä minut!' },
  name: { en: 'Name', fi: 'Nimi' },
  typeName: { en: 'Type your name', fi: 'Kirjoita nimesi' },
  language: { en: 'Language', fi: 'Kieli' },
  savedGames: { en: 'Saved games', fi: 'Tallessa olevat pelit' },
  nothingSaved: { en: 'Nothing saved yet.', fi: 'Mitään ei ole vielä tallessa.' },
  startOver: { en: 'Start over', fi: 'Aloita alusta' },
  reallyStartOver: { en: 'Really start over?', fi: 'Aloitetaanko varmasti alusta?' },
  back: { en: 'Back', fi: 'Takaisin' },
  done: { en: '✓ Done', fi: '✓ Valmis' },
  removePlayer: { en: 'Remove player', fi: 'Poista pelaaja' },
  reallyRemove: (name: string): Words => ({ en: `Really remove ${name}?`, fi: `Poistetaanko pelaaja ${name} varmasti?` }),
} as const

/** The tabs of the avatar's parts. */
export const TAB_NAMES: Record<Part, Words> = {
  skin: { en: 'Face', fi: 'Kasvot' },
  hair: { en: 'Hair', fi: 'Hiukset' },
  hairColour: { en: 'Hair colour', fi: 'Hiusten väri' },
  eyes: { en: 'Eyes', fi: 'Silmät' },
  mouth: { en: 'Mouth', fi: 'Suu' },
  extra: { en: 'Fun', fi: 'Hassut' },
  backdrop: { en: 'Colour', fi: 'Väri' },
}

/** Every choice of every part, by name: what a screen reader says for its button. */
export const CHOICE_NAMES: { [P in Part]: Record<Avatar[P], Words> } = {
  backdrop: {
    sky: { en: 'Sky', fi: 'Taivas' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    sun: { en: 'Sun', fi: 'Aurinko' },
    mint: { en: 'Mint', fi: 'Minttu' },
    lilac: { en: 'Lilac', fi: 'Liila' },
    peach: { en: 'Peach', fi: 'Persikka' },
    grass: { en: 'Grass', fi: 'Ruoho' },
    sea: { en: 'Sea', fi: 'Meri' },
  },
  skin: {
    milk: { en: 'Milk', fi: 'Maito' },
    peach: { en: 'Peach', fi: 'Persikka' },
    honey: { en: 'Honey', fi: 'Hunaja' },
    caramel: { en: 'Caramel', fi: 'Karamelli' },
    cocoa: { en: 'Cocoa', fi: 'Kaakao' },
    coffee: { en: 'Coffee', fi: 'Kahvi' },
  },
  hair: {
    short: { en: 'Short', fi: 'Lyhyet' },
    long: { en: 'Long', fi: 'Pitkät' },
    bob: { en: 'Bob', fi: 'Polkka' },
    pigtails: { en: 'Pigtails', fi: 'Saparot' },
    bun: { en: 'Bun', fi: 'Nuttura' },
    curly: { en: 'Curly', fi: 'Kiharat' },
    spiky: { en: 'Spiky', fi: 'Piikit' },
    none: { en: 'No hair', fi: 'Ei hiuksia' },
  },
  hairColour: {
    brown: { en: 'Brown', fi: 'Ruskea' },
    black: { en: 'Black', fi: 'Musta' },
    blonde: { en: 'Blonde', fi: 'Vaalea' },
    ginger: { en: 'Ginger', fi: 'Punainen' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    blue: { en: 'Blue', fi: 'Sininen' },
    purple: { en: 'Purple', fi: 'Violetti' },
    green: { en: 'Green', fi: 'Vihreä' },
  },
  eyes: {
    dots: { en: 'Dots', fi: 'Pisteet' },
    big: { en: 'Big', fi: 'Isot' },
    happy: { en: 'Happy', fi: 'Iloiset' },
    wink: { en: 'Wink', fi: 'Silmänisku' },
    sleepy: { en: 'Sleepy', fi: 'Uniset' },
  },
  mouth: {
    smile: { en: 'Smile', fi: 'Hymy' },
    grin: { en: 'Grin', fi: 'Virne' },
    tongue: { en: 'Tongue', fi: 'Kieli' },
    oh: { en: 'Oh', fi: 'Oo' },
    cat: { en: 'Cat', fi: 'Kissa' },
  },
  extra: {
    none: { en: 'Nothing', fi: 'Ei mitään' },
    'cat-ears': { en: 'Cat ears', fi: 'Kissan korvat' },
    'bunny-ears': { en: 'Bunny ears', fi: 'Pupun korvat' },
    crown: { en: 'Crown', fi: 'Kruunu' },
    bow: { en: 'Bow', fi: 'Rusetti' },
    cap: { en: 'Cap', fi: 'Lippis' },
    glasses: { en: 'Glasses', fi: 'Lasit' },
    flower: { en: 'Flower', fi: 'Kukka' },
  },
}
