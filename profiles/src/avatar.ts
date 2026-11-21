/**
 * A profile's avatar: a face a child builds from parts, each part one of a few named choices.
 * The choices are listed in the order the editor shows them; the first of each is what an
 * avatar read from storage falls back to when a part is missing or unknown. `Avatar.tsx`
 * draws it.
 */

export const PARTS = {
  backdrop: ['sky', 'pink', 'sun', 'mint', 'lilac', 'peach', 'grass', 'sea'],
  skin: ['milk', 'peach', 'honey', 'caramel', 'cocoa', 'coffee'],
  hair: ['short', 'long', 'bob', 'pigtails', 'bun', 'curly', 'spiky', 'none'],
  hairColour: ['brown', 'black', 'blonde', 'ginger', 'pink', 'blue', 'purple', 'green'],
  eyes: ['dots', 'big', 'happy', 'wink', 'sleepy'],
  mouth: ['smile', 'grin', 'tongue', 'oh', 'cat'],
  extra: ['none', 'cat-ears', 'bunny-ears', 'crown', 'bow', 'cap', 'glasses', 'flower'],
} as const

export type Part = keyof typeof PARTS
export type Avatar = { [P in Part]: (typeof PARTS)[P][number] }
export const PART_NAMES = Object.keys(PARTS) as Part[]

/** An avatar as stored: every part its own choice, or the first choice where the text holds none we know. */
export function parseAvatar(value: unknown): Avatar {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const avatar = {} as Record<Part, string>
  for (const part of PART_NAMES) {
    const choices: readonly string[] = PARTS[part]
    const chosen = stored[part]
    avatar[part] = typeof chosen === 'string' && choices.includes(chosen) ? chosen : choices[0]
  }
  return avatar as Avatar
}

/** A surprise: every part picked at random. `random` gives numbers in [0, 1). */
export function randomAvatar(random: () => number): Avatar {
  const avatar = {} as Record<Part, string>
  for (const part of PART_NAMES) {
    const choices: readonly string[] = PARTS[part]
    avatar[part] = choices[Math.floor(random() * choices.length)]
  }
  return avatar as Avatar
}
