import {
  BAGS,
  CELL_COST,
  GLASSES,
  HAIRS,
  HAIR_COLORS,
  HAT_COLORS,
  PANTS,
  SHIRTS,
  SHOES,
  SKINS,
  THEMES,
  TOOLS,
  WEAR_COLORS,
  type Bag,
  type Biome,
  type Glasses,
  type HouseKind,
  type Look,
  type MachineId,
  type Material,
  type Pose,
  type Raw,
  type RoadKind,
  type Shape,
  type Shoes,
  type Theme,
  type Tool,
  type Unlock,
} from './model'

/**
 * The game's data that is not geometry: which machine makes what, the roads, the presents
 * and what they open, the themes' words and visits, the friends' outfits, the shapes and
 * their price, and the house kinds. The rules, the HUD and the save all ask here what a room
 * costs and what is open, so a tray never lights what the rules refuse. The items are in
 * items.ts; the geometry is in layout.ts.
 */

/** Each machine takes one raw good and makes one material, one for one. */
export const RECIPES: Record<MachineId, { takes: Raw; makes: Material }> = {
  sawmill: { takes: 'log', makes: 'planks' },
  oven: { takes: 'clay', makes: 'bricks' },
  mixer: { takes: 'rock', makes: 'concrete' },
  glassworks: { takes: 'sand', makes: 'glass' },
  rainbow: { takes: 'gem', makes: 'rainbow' },
}
/** The machine that takes a raw good, and the one that makes a material. */
export const MACHINE_FOR_RAW: Record<Raw, MachineId> = { log: 'sawmill', clay: 'oven', rock: 'mixer', sand: 'glassworks', gem: 'rainbow' }
export const MACHINE_FOR_MATERIAL: Record<Material, MachineId> = { planks: 'sawmill', bricks: 'oven', concrete: 'mixer', glass: 'glassworks', rainbow: 'rainbow' }

/** Shapes in columns x floors, in the order the build tray shows them. */
export const SHAPE_SIZE: Record<Shape, { w: number; h: number }> = {
  small: { w: 1, h: 1 },
  wide: { w: 2, h: 1 },
  tall: { w: 1, h: 2 },
  big: { w: 2, h: 2 },
}

/** A room's price: CELL_COST of its material per cell. Building charges it, a take-back and a save that no longer fits give it back, and the build tray dims what cannot pay it. */
export const roomCost = (shape: Shape) => CELL_COST * SHAPE_SIZE[shape].w * SHAPE_SIZE[shape].h

/** The grid of each house kind. The row house is three homes of HOME_COLS columns, each with its own door. */
export const HOUSE_GRID: Record<HouseKind, { cols: number; rows: number }> = {
  tall: { cols: 3, rows: 5 },
  row: { cols: 6, rows: 2 },
}
export const HOME_COLS = 2

/**
 * The three roads of the signpost, and trip 1's training road (a short forest road). Each
 * road is its biomes in order (the generator stretches them over the road's length) and how
 * many of each raw good lie on it as pickups; rocks come from its boulders, and gems also
 * from its ramp and one boulder in three.
 *
 * Each road brings every raw good at least twice and its own goods most (the forest's logs,
 * the beach's sand, the hills' rocks and gems): about 16 raw goods a trip, 18 when the truck
 * flies through the ramp's gems. That pays for about five rooms a trip and fills the
 * six-plot street around trip 11, so driving and building keep taking turns for many
 * sessions (rules.play.test.ts measures it).
 */
export const ROADS: Record<RoadKind, { biomes: readonly Biome[]; pickups: Record<Exclude<Raw, 'rock'>, number>; boulders: number }> = {
  forest: { biomes: ['meadow', 'forest', 'river', 'town'], pickups: { log: 4, clay: 2, sand: 2, gem: 1 }, boulders: 2 },
  beach: { biomes: ['meadow', 'dunes', 'beach', 'town'], pickups: { log: 2, clay: 2, sand: 4, gem: 1 }, boulders: 2 },
  hills: { biomes: ['meadow', 'quarry', 'tunnel', 'town'], pickups: { log: 2, clay: 2, sand: 2, gem: 1 }, boulders: 3 },
}
export const ROAD_LENGTH = 320
/** Trip 1: a 200 m forest road with 4 logs (the planks for the first two-cell room), one small boulder, the ducks and a present. */
export const TRAINING = { length: 200, logs: 4 } as const
/** The words on the signpost's cards. */
export const ROAD_NAMES: Record<RoadKind, string> = { forest: 'Forest', beach: 'Beach', hills: 'Hills' }

/** What the presents hold, in this order, one per trip; after the last, a present holds PRESENT_GEMS gems. */
export const PRESENTS: readonly Unlock[] = ['theme:bath', 'bag:jetpack', 'theme:space', 'tool:wand', 'theme:kitchen', 'shoes:lights', 'theme:sauna', 'glasses:stars', 'shoes:cowboy', 'glasses:hearts', 'bag:cat']
export const PRESENT_GEMS = 3

/** Themes and wardrobe options a present has to open first; everything else is open from the start. */
export const LOCKED_THEMES: readonly Theme[] = ['bath', 'space', 'kitchen', 'sauna']
export const LOCKED_BAGS: readonly Bag[] = ['jetpack', 'cat']
export const LOCKED_TOOLS: readonly Tool[] = ['wand']
export const LOCKED_SHOES: readonly Shoes[] = ['lights', 'cowboy']
export const LOCKED_GLASSES: readonly Glasses[] = ['stars', 'hearts']

/** Every look field's options, in the wardrobe's order. The player's hat is never 'none' (that is the friends'). */
export const LOOK_OPTIONS: { [K in keyof Look]: readonly Look[K][] } = {
  hat: HAT_COLORS,
  hair: HAIRS,
  hairColor: HAIR_COLORS,
  skin: SKINS,
  glasses: GLASSES,
  shirt: SHIRTS,
  shirtColor: WEAR_COLORS,
  bag: BAGS,
  pants: PANTS,
  pantsColor: WEAR_COLORS,
  shoes: SHOES,
  tool: TOOLS,
}
export const LOOK_KEYS = Object.keys(LOOK_OPTIONS) as (keyof Look)[]
/** The options of each look field a present has to open first (written `${field}:${option}` in keep.unlocked). */
const LOOK_LOCKED: { [K in keyof Look]: readonly Look[K][] } = {
  hat: [], hair: [], hairColor: [], skin: [], shirt: [], shirtColor: [], pants: [], pantsColor: [],
  glasses: LOCKED_GLASSES, bag: LOCKED_BAGS, shoes: LOCKED_SHOES, tool: LOCKED_TOOLS,
}
/** `value` is one of the field's options and open: never locked, or opened by a present in `unlocked`. Takes anything, so a save or a patch can be checked as it comes. */
export const optionOpen = (unlocked: readonly Unlock[], field: keyof Look, value: unknown) =>
  (LOOK_OPTIONS[field] as readonly unknown[]).includes(value) && (!(LOOK_LOCKED[field] as readonly unknown[]).includes(value) || unlocked.includes(`${field}:${value}` as Unlock))
/** A theme shows in the picker and the room tray: one of the brief's ten, or opened by a present. */
export const themeOpen = (unlocked: readonly Unlock[], theme: Theme) => !LOCKED_THEMES.includes(theme) || unlocked.includes(`theme:${theme}`)
/** Every open theme, in the picker's order. */
export const openThemes = (unlocked: readonly Unlock[]): Theme[] => THEMES.filter((t) => themeOpen(unlocked, t))

/**
 * Every theme's card word (one English word or two, for a five-year-old), and the pose the
 * builder takes visiting a room of it, standing where layout.visitPoint puts them.
 */
export const THEME_INFO: Record<Theme, { name: string; visit: Pose }> = {
  disco: { name: 'Disco', visit: 'dance' },
  play: { name: 'Play', visit: 'play' },
  ballpit: { name: 'Ball pit', visit: 'jump' },
  slide: { name: 'Slide', visit: 'slide' },
  gym: { name: 'Gym', visit: 'bounce' },
  sleep: { name: 'Sleep', visit: 'sleep' },
  music: { name: 'Music', visit: 'dance' },
  crafts: { name: 'Crafts', visit: 'play' },
  cat: { name: 'Cat', visit: 'sit' },
  birthday: { name: 'Birthday', visit: 'cheer' },
  bath: { name: 'Bath', visit: 'sit' },
  space: { name: 'Space', visit: 'float' },
  kitchen: { name: 'Kitchen', visit: 'play' },
  sauna: { name: 'Sauna', visit: 'sit' },
}

/**
 * The friends who live in the rooms: the builder rig in eight fixed outfits, never with the
 * cat-ear hat (only the player wears it). The theme art picks each room's friend from these.
 */
export const FRIENDS: readonly Look[] = [
  { hat: 'none', hair: 'puffs', hairColor: 'black', skin: 6, shirt: 'star', shirtColor: 'purple', pants: 'shorts', pantsColor: 'yellow', shoes: 'sneakers', glasses: 'none', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'short', hairColor: 'blond', skin: 1, shirt: 'stripes', shirtColor: 'blue', pants: 'jeans', pantsColor: 'blue', shoes: 'sneakers', glasses: 'round', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'braids', hairColor: 'darkBrown', skin: 4, shirt: 'dress', shirtColor: 'pink', pants: 'skirt', pantsColor: 'pink', shoes: 'wellies', glasses: 'none', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'curly', hairColor: 'ginger', skin: 0, shirt: 'hoodie', shirtColor: 'green', pants: 'dungarees', pantsColor: 'teal', shoes: 'boots', glasses: 'none', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'spiky', hairColor: 'black', skin: 3, shirt: 'tee', shirtColor: 'orange', pants: 'shorts', pantsColor: 'blue', shoes: 'sneakers', glasses: 'sunglasses', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'ponytail', hairColor: 'brown', skin: 5, shirt: 'tee', shirtColor: 'teal', pants: 'jeans', pantsColor: 'purple', shoes: 'sneakers', glasses: 'none', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'long', hairColor: 'red', skin: 2, shirt: 'stripes', shirtColor: 'red', pants: 'skirt', pantsColor: 'yellow', shoes: 'wellies', glasses: 'round', bag: 'none', tool: 'hammer' },
  { hat: 'none', hair: 'curly', hairColor: 'black', skin: 7, shirt: 'hoodie', shirtColor: 'yellow', pants: 'work', pantsColor: 'green', shoes: 'boots', glasses: 'none', bag: 'none', tool: 'hammer' },
]

/** The builder before the child changes anything (the first visit rolls the dice instead). */
export const DEFAULT_LOOK: Look = {
  hat: 'yellow',
  hair: 'short',
  hairColor: 'brown',
  skin: 2,
  shirt: 'vest',
  shirtColor: 'orange',
  pants: 'jeans',
  pantsColor: 'blue',
  shoes: 'boots',
  glasses: 'none',
  bag: 'none',
  tool: 'hammer',
}
