/**
 * The games of the directory, in the gallery's order, with what their cards say in both
 * languages. The root index.html holds each card's link and picture; the gallery fills in the
 * words in the player's language, a game page names its tab from here (`startPage`), and
 * vite.config.ts builds a page for each folder. A new game is added here and given a card.
 */

// '.js': vite.config.ts reads this file too, and its loader wants the extension.
import type { Words } from './lang.js'

export const GAME_FOLDERS = ['chase', 'foot-chase', 'castle-builder', 'pia-jump', 'cat-hat-builder', 'rocket-factory', 'super-me', 'slime-guy', 'monster-lunch', 'digger-town', 'silly-billy'] as const
export type GameFolder = (typeof GAME_FOLDERS)[number]

/** What a card says: the game's name, one line about it, and how many play. */
export interface Card {
  name: Words
  blurb: Words
  players: Words
}

const ONE: Words = { en: '1 player', fi: '1 pelaaja' }
const TWO: Words = { en: '2 players', fi: '2 pelaajaa' }

export const DIRECTORY: Record<GameFolder, Card> = {
  chase: { name: { en: 'Police Chase', fi: 'Poliisijahti' }, blurb: { en: 'Jump the rocks. Catch the robber!', fi: 'Hyppää kivien yli. Ota rosvo kiinni!' }, players: ONE },
  'foot-chase': { name: { en: 'Foot Chase', fi: 'Juoksujahti' }, blurb: { en: 'Grab the money. Catch the robber!', fi: 'Nappaa rahat. Ota rosvo kiinni!' }, players: TWO },
  'castle-builder': { name: { en: 'Castle Builder', fi: 'Linnanrakentaja' }, blurb: { en: 'Gather, build, and fix the castle!', fi: 'Kerää, rakenna ja korjaa linna!' }, players: ONE },
  'pia-jump': { name: { en: 'Pia Jump', fi: 'Pia hyppää' }, blurb: { en: 'Run, jump and find the kittens!', fi: 'Juokse, hyppää ja etsi kissanpennut!' }, players: ONE },
  'cat-hat-builder': { name: { en: 'Cat Hat Builder', fi: 'Kissakypärä' }, blurb: { en: 'Drive the truck. Build your own house!', fi: 'Aja autoa. Rakenna oma talo!' }, players: ONE },
  'rocket-factory': { name: { en: 'Rocket Factory', fi: 'Rakettitehdas' }, blurb: { en: 'Build a factory. Fill the rocket!', fi: 'Rakenna tehdas. Täytä raketti!' }, players: ONE },
  'super-me': { name: { en: 'Super Me', fi: 'Super-minä' }, blurb: { en: 'Dress up. Build your way!', fi: 'Pukeudu. Rakenna oma tiesi!' }, players: ONE },
  'slime-guy': { name: { en: 'Slime Guy', fi: 'Limaukko' }, blurb: { en: 'Jump, hide and grow. Open the box!', fi: 'Hyppää, piiloudu ja kasva. Avaa laatikko!' }, players: ONE },
  'monster-lunch': { name: { en: 'Monster Lunch', fi: 'Hirviön lounas' }, blurb: { en: 'Make lunch. Feed the monster!', fi: 'Tee lounas. Ruoki hirviö!' }, players: ONE },
  'digger-town': { name: { en: 'Digger Town', fi: 'Kaivurikylä' }, blurb: { en: 'Dig, dump and build. Talk to the machines!', fi: 'Kaiva, kippaa ja rakenna. Puhu koneille!' }, players: ONE },
  'silly-billy': { name: { en: 'Silly Billy', fi: 'Hassu Billy' }, blurb: { en: 'Tell them what to do. They learn new tricks!', fi: 'Kerro, mitä tehdä. Ne oppivat uusia temppuja!' }, players: ONE },
}
