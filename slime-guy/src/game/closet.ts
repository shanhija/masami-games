/**
 * The wardrobe as data: what the slime can wear, where each thing goes, which island's
 * box gives it first, the slime's colours and the patterns the star jar opens. No
 * trousers or shoes: they do not suit a slime. The 3D art is scene/Clothes.tsx, the
 * pictures Icons.tsx, the screen Wardrobe.tsx.
 */

import type { CourseId } from './model'

/** Where a thing sits on the slime: one thing per place. */
export const SLOTS = ['hat', 'glasses', 'shirt', 'skirt', 'bag', 'neck'] as const
export type Slot = (typeof SLOTS)[number]

/**
 * Every thing to wear: its place, the island whose box gives it first, and its main
 * colour (the art and the icon share it). Within an island the box gives them in this
 * order.
 */
export const ITEMS = {
  cap: { slot: 'hat', course: 'park', colour: '#3f8fe0' },
  tee: { slot: 'shirt', course: 'park', colour: '#ff5e5e' },
  backpack: { slot: 'bag', course: 'park', colour: '#ffb02e' },
  roundGlasses: { slot: 'glasses', course: 'park', colour: '#8a5a34' },
  flowers: { slot: 'hat', course: 'park', colour: '#ff8fc8' },
  denimSkirt: { slot: 'skirt', course: 'park', colour: '#4a6fb8' },

  sunhat: { slot: 'hat', course: 'beach', colour: '#f5d58a' },
  sunglasses: { slot: 'glasses', course: 'beach', colour: '#2b2140' },
  flowerShirt: { slot: 'shirt', course: 'beach', colour: '#2fc4b0' },
  shoulderBag: { slot: 'bag', course: 'beach', colour: '#ff7f5e' },
  flowerSkirt: { slot: 'skirt', course: 'beach', colour: '#ffd23f' },

  bow: { slot: 'hat', course: 'candy', colour: '#ff4f9a' },
  heartGlasses: { slot: 'glasses', course: 'candy', colour: '#ff3b6b' },
  glitterShirt: { slot: 'shirt', course: 'candy', colour: '#c58bff' },
  tutu: { slot: 'skirt', course: 'candy', colour: '#ffb3dd' },
  handbag: { slot: 'bag', course: 'candy', colour: '#e8384f' },
  pearls: { slot: 'neck', course: 'candy', colour: '#fff6ea' },

  beanie: { slot: 'hat', course: 'winter', colour: '#e8503f' },
  sweater: { slot: 'shirt', course: 'winter', colour: '#5ec25a' },
  hoodie: { slot: 'shirt', course: 'winter', colour: '#9b5fd3' },
  scarf: { slot: 'neck', course: 'winter', colour: '#ffd23f' },
  teddyBackpack: { slot: 'bag', course: 'winter', colour: '#b5773e' },

  crown: { slot: 'hat', course: 'night', colour: '#ffcf3f' },
  stripes: { slot: 'shirt', course: 'night', colour: '#3f7fe0' },
  stripeSkirt: { slot: 'skirt', course: 'night', colour: '#ff6b8b' },
  partySkirt: { slot: 'skirt', course: 'night', colour: '#7b52d6' },
  kittyBackpack: { slot: 'bag', course: 'night', colour: '#ff9ad1' },
  bowTie: { slot: 'neck', course: 'night', colour: '#e8384f' },
} as const satisfies Record<string, { slot: Slot; course: CourseId; colour: string }>

export type ItemId = keyof typeof ITEMS
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

/** What the slime wears in each place, or null. */
export type Outfit = Record<Slot, ItemId | null>
export const NO_OUTFIT: Outfit = { hat: null, glasses: null, shirt: null, skirt: null, bag: null, neck: null }

/** The slime's colours: the jelly itself, a deeper shade for its shadow side and edges, a lighter one for the shine. */
export const SLIME_COLOURS = {
  green: { body: '#7fe07a', deep: '#3fae4f', light: '#c9f7b8' },
  pink: { body: '#ff8fc8', deep: '#e0559d', light: '#ffd1ea' },
  blue: { body: '#6fc8ff', deep: '#3f8fe0', light: '#c8ecff' },
  purple: { body: '#b38bff', deep: '#7b52d6', light: '#e2d4ff' },
  orange: { body: '#ffb15c', deep: '#e57d22', light: '#ffe0b8' },
} as const
export type SlimeColour = keyof typeof SLIME_COLOURS
export const COLOUR_IDS = Object.keys(SLIME_COLOURS) as SlimeColour[]

/** The patterns, in the order the star jar opens them. */
export const PATTERNS = ['dots', 'stripes', 'glitter', 'rainbow', 'gold'] as const
export type Pattern = (typeof PATTERNS)[number]

/** Everything that decides how the slime looks. */
export interface SlimeLook {
  colour: SlimeColour
  pattern: Pattern | null
  outfit: Outfit
}

/** The colours of the three baby slimes on every island. */
export const BABY_COLOURS: readonly [string, string, string] = ['#ffd23f', '#ff8fc8', '#5fd8f0']

/**
 * The three babies' jellies, each BABY_COLOURS colour with a deeper and a lighter shade
 * like SLIME_COLOURS: the yellow one has the gold pattern's shades, the pink one the pink
 * slime's, and the cyan one steps from its body the way the blue slime's shades do.
 */
export const BABY_SHADES = [
  { body: '#ffd23f', deep: '#e0a020', light: '#fff2b0' },
  { body: '#ff8fc8', deep: '#e0559d', light: '#ffd1ea' },
  { body: '#5fd8f0', deep: '#33a6d3', light: '#c8f6ff' },
] as const
