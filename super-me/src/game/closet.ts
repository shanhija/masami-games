/**
 * The closet: every part of the person the child makes, the options of each, the colours,
 * and which options are presents to find in the levels. Plain data; the art is
 * draw/person.ts, the screen Closet.tsx, and the names of everything words.ts.
 */

/** Every part and its options, in the order the closet shows them. The first option is the one a fresh person wears, except where START_LOOK says otherwise. */
export const OPTIONS = {
  face: ['round', 'oval', 'wide'],
  eyes: ['dots', 'big', 'happy', 'sleepy', 'sparkle'],
  nose: ['button', 'dot', 'clown'],
  mouth: ['smile', 'grin', 'open', 'tongue'],
  hair: ['short', 'long', 'pigtails', 'ponytail', 'curly', 'bun', 'spiky'],
  height: ['short', 'middle', 'tall'],
  build: ['slim', 'middle', 'round'],
  skin: ['milk', 'peach', 'honey', 'caramel', 'cocoa', 'coffee'],
  hat: ['none', 'cap', 'bow', 'ears', 'flowers', 'chef', 'crown', 'wizard'],
  top: ['tee', 'stripes', 'dress', 'stars'],
  bottom: ['pants', 'shorts', 'skirt', 'tutu'],
  shoes: ['sneakers', 'boots', 'sandals', 'rainboots'],
  extra: ['none', 'glasses', 'scarf', 'wings', 'cape'],
  shadow: ['none', 'blue', 'purple', 'pink', 'green', 'rainbow'],
  lips: ['none', 'pink', 'red', 'purple', 'glitter'],
  blush: ['none', 'pink', 'peach', 'hearts'],
  paint: ['none', 'star', 'heart', 'whiskers', 'butterfly'],
} as const

export type Part = keyof typeof OPTIONS
export type Option<P extends Part> = (typeof OPTIONS)[P][number]
export const PARTS = Object.keys(OPTIONS) as Part[]

/** The closet's four tabs and the parts under each. */
export const GROUPS = [
  { id: 'face', parts: ['face', 'eyes', 'nose', 'mouth', 'hair'] },
  { id: 'body', parts: ['height', 'build', 'skin'] },
  { id: 'clothes', parts: ['hat', 'top', 'bottom', 'shoes', 'extra'] },
  { id: 'makeup', parts: ['shadow', 'lips', 'blush', 'paint'] },
] as const satisfies readonly { id: string; parts: readonly Part[] }[]
export type Group = (typeof GROUPS)[number]['id']

/** Clothes colours. */
export const COLOURS = {
  red: '#E8384F',
  orange: '#F28C28',
  yellow: '#F7C843',
  green: '#43B05C',
  teal: '#2BB6A8',
  blue: '#3F7FE0',
  purple: '#8B5CC9',
  pink: '#F27BAE',
  white: '#F7F3EE',
  black: '#3A3340',
} as const
export type Colour = keyof typeof COLOURS

export const HAIR_COLOURS = {
  black: '#2E2433',
  brown: '#6B4329',
  blonde: '#EFC15A',
  ginger: '#D2662C',
  pink: '#F48FB8',
  blue: '#5B8DEF',
} as const
export type HairColour = keyof typeof HAIR_COLOURS

export const SKINS: Record<Option<'skin'>, string> = {
  milk: '#FBE6D8',
  peach: '#F3C9A6',
  honey: '#E3AA7C',
  caramel: '#C68B5C',
  cocoa: '#94613F',
  coffee: '#6A4430',
}

/** The parts whose options take a colour, and the field of Look that holds it. */
export const COLOURED = {
  hair: 'hairColour',
  hat: 'hatColour',
  top: 'topColour',
  bottom: 'bottomColour',
  shoes: 'shoesColour',
  extra: 'extraColour',
} as const satisfies Partial<Record<Part, string>>
export type ColouredPart = keyof typeof COLOURED

/** Options of a coloured part that keep their own colours: a crown is always gold. */
const OWN_COLOURS: ReadonlySet<string> = new Set(['hat:none', 'hat:flowers', 'hat:chef', 'hat:crown', 'top:stars', 'extra:none', 'extra:glasses', 'extra:wings'])

/** Everything about one person. */
export type Look = { [P in Part]: Option<P> } & {
  hairColour: HairColour
  hatColour: Colour
  topColour: Colour
  bottomColour: Colour
  shoesColour: Colour
  extraColour: Colour
}

export const START_LOOK: Look = {
  face: 'round',
  eyes: 'big',
  nose: 'button',
  mouth: 'smile',
  hair: 'pigtails',
  height: 'middle',
  build: 'middle',
  skin: 'peach',
  hat: 'none',
  top: 'tee',
  bottom: 'pants',
  shoes: 'sneakers',
  extra: 'none',
  shadow: 'none',
  lips: 'none',
  blush: 'pink',
  paint: 'none',
  hairColour: 'brown',
  hatColour: 'pink',
  topColour: 'yellow',
  bottomColour: 'blue',
  shoesColour: 'red',
  extraColour: 'purple',
}

/** Whether the closet offers a colour for what the look wears on `part`. */
export function takesColour(look: Look, part: Part): part is ColouredPart {
  return part in COLOURED && !OWN_COLOURS.has(`${part}:${look[part]}`)
}

/** The presents hidden in the levels, three per level in level order (levels.ts says which level holds which). */
export const REWARDS = [
  'paint:butterfly',
  'shoes:rainboots',
  'hat:flowers',
  'nose:clown',
  'lips:glitter',
  'hat:chef',
  'shadow:rainbow',
  'eyes:sparkle',
  'extra:wings',
  'bottom:tutu',
  'blush:hearts',
  'hat:crown',
  'extra:cape',
  'top:stars',
  'hat:wizard',
] as const
export type Reward = (typeof REWARDS)[number]

/** The part and option a present holds. */
export function rewardPart(r: Reward): { part: Part; option: string } {
  const [part, option] = r.split(':') as [Part, string]
  return { part, option }
}

/** The present that holds `option` of `part`, or null when it is in the closet from the start. */
export function rewardOf(part: Part, option: string): Reward | null {
  const key = `${part}:${option}`
  return (REWARDS as readonly string[]).includes(key) ? (key as Reward) : null
}

/** Whether the child may pick `option` of `part`: it is no present, or its present is found. */
export function canWear(part: Part, option: string, found: ReadonlySet<Reward>): boolean {
  const r = rewardOf(part, option)
  return r === null || found.has(r)
}

/** The look with the present's option put on. */
export function wear(look: Look, r: Reward): Look {
  const { part, option } = rewardPart(r)
  return { ...look, [part]: option }
}

/** The look with one part changed. Throws on an option the part does not have. */
export function withOption(look: Look, part: Part, option: string): Look {
  if (!(OPTIONS[part] as readonly string[]).includes(option)) throw new Error(`${part} has no option ${option}`)
  return { ...look, [part]: option }
}

/** A saved look, read back: any field missing or not in the lists takes START_LOOK's (an old save, a hand-edited one). */
export function parseLook(raw: unknown): Look {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const look: Record<string, unknown> = { ...START_LOOK }
  for (const part of PARTS) {
    if ((OPTIONS[part] as readonly unknown[]).includes(r[part])) look[part] = r[part]
  }
  for (const part of Object.keys(COLOURED) as ColouredPart[]) {
    const key = COLOURED[part]
    const palette = part === 'hair' ? HAIR_COLOURS : COLOURS
    if (typeof r[key] === 'string' && r[key] in palette) look[key] = r[key]
  }
  return look as Look
}

/** A random look from what the child may wear: `pick(n)` returns a whole number from 0 to n - 1. */
export function surprise(found: ReadonlySet<Reward>, pick: (n: number) => number): Look {
  const look: Record<string, unknown> = {}
  for (const part of PARTS) {
    const open = (OPTIONS[part] as readonly string[]).filter((o) => canWear(part, o, found))
    look[part] = open[pick(open.length)]
  }
  for (const part of Object.keys(COLOURED) as ColouredPart[]) {
    const names = Object.keys(part === 'hair' ? HAIR_COLOURS : COLOURS)
    look[COLOURED[part]] = names[pick(names.length)]
  }
  return look as Look
}
