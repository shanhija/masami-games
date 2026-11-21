/**
 * What the browser remembers between visits, as pure functions over a Save: the islands
 * finished, the babies found, the biggest animal per island, the things found and worn,
 * the colour and the pattern, the star jar, the obstacles already taught and the sound
 * switch. Every function returns a new Save, or the very same one when nothing changes,
 * and never changes the one it was given (FRESH is frozen, so a stray write throws).
 * game.ts is the only place that reads and writes it to the browser.
 *
 * Lists are kept in their catalogue's order (islands in COURSE_IDS order, things in
 * ITEMS order, patterns in PATTERNS order), so a save read back equals the one written.
 */

import { COLOUR_IDS, ITEM_IDS, ITEMS, NO_OUTFIT, PATTERNS, SLOTS, type ItemId, type Outfit, type Pattern, type SlimeColour, type Slot } from './closet'
import { ANIMALS, COURSE_IDS, type CourseId, type Teachable } from './model'

/** Stars that fill the jar once; each fill opens the next pattern, and fireworks once all are open. */
export const JAR_SIZE = 200

export interface Save {
  /** Islands whose finish the slime has reached at least once, in COURSE_IDS order. */
  done: CourseId[]
  /** The babies found on each island. */
  babies: Record<CourseId, [boolean, boolean, boolean]>
  /** The biggest animal measured on each island (index into ANIMALS), or -1. */
  best: Record<CourseId, number>
  /** The things the boxes have given, in ITEMS order. */
  found: ItemId[]
  outfit: Outfit
  colour: SlimeColour
  pattern: Pattern | null
  /** The patterns the jar has opened, in PATTERNS order. */
  patterns: Pattern[]
  /** Stars in the jar now, 0 to JAR_SIZE - 1. */
  jar: number
  learned: Teachable[]
  sound: boolean
}

/** Every obstacle kind that teaches, in the order a save lists them: a Record, so a new kind fails to compile here until it is listed. */
const TEACHABLES = Object.keys({ spinner: true, fan: true, frame: true, hole: true, gate: true, circle: true } satisfies Record<Teachable, true>) as Teachable[]

/** Freezes a plain value all the way down. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) frozen(inner)
    Object.freeze(value)
  }
  return value
}

const NO_BABIES: [boolean, boolean, boolean] = [false, false, false]

/** A first visit: nothing found, nothing taught, sound on. Frozen all the way down. */
export const FRESH: Save = frozen({
  done: [],
  babies: { park: NO_BABIES, beach: NO_BABIES, candy: NO_BABIES, winter: NO_BABIES, night: NO_BABIES },
  best: { park: -1, beach: -1, candy: -1, winter: -1, night: -1 },
  found: [],
  outfit: { ...NO_OUTFIT },
  colour: 'green',
  pattern: null,
  patterns: [],
  jar: 0,
  learned: [],
  sound: true,
})

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const listOf = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : [])
const recordOf = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {})

/**
 * Reads a save back. Whatever it knows it keeps and whatever it does not it drops, so an
 * old or hand-edited save still loads: unknown islands, things, patterns and lessons go,
 * a worn thing that is not found or sits in the wrong slot comes off, a pattern that is
 * not open comes off, numbers out of range fall back to fresh ones. Nothing stored starts
 * fresh; text that is no JSON object at all starts fresh with a warning.
 */
export function parseSave(text: string | null): Save {
  if (text === null) return FRESH
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    console.warn('Slime Guy found a save it cannot read and starts fresh:', e)
    return FRESH
  }
  if (!isRecord(raw)) {
    console.warn('Slime Guy found a save that is not an object and starts fresh:', raw)
    return FRESH
  }
  const found = ITEM_IDS.filter((id) => listOf(raw.found).includes(id))
  const patterns = PATTERNS.filter((p) => listOf(raw.patterns).includes(p))
  const babies = recordOf(raw.babies)
  const best = recordOf(raw.best)
  const outfit = recordOf(raw.outfit)
  const jar = raw.jar
  return {
    done: COURSE_IDS.filter((id) => listOf(raw.done).includes(id)),
    babies: Object.fromEntries(
      COURSE_IDS.map((id) => {
        const b = listOf(babies[id])
        return [id, [b[0] === true, b[1] === true, b[2] === true]]
      }),
    ) as Save['babies'],
    best: Object.fromEntries(
      COURSE_IDS.map((id) => {
        const v = best[id]
        return [id, typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < ANIMALS.length ? v : -1]
      }),
    ) as Save['best'],
    found,
    outfit: Object.fromEntries(
      SLOTS.map((slot) => {
        const item = found.find((id) => id === outfit[slot])
        return [slot, item !== undefined && ITEMS[item].slot === slot ? item : null]
      }),
    ) as Outfit,
    colour: COLOUR_IDS.find((c) => c === raw.colour) ?? FRESH.colour,
    pattern: patterns.find((p) => p === raw.pattern) ?? null,
    patterns,
    jar: typeof jar === 'number' && Number.isInteger(jar) && jar >= 0 ? Math.min(jar, JAR_SIZE - 1) : 0,
    learned: TEACHABLES.filter((t) => listOf(raw.learned).includes(t)),
    sound: raw.sound !== false,
  }
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save)
}

/** An island is open when it is the first, when the one before it is done, or when it is done itself (a finished island can always be played again). Throws for an index that is no island. */
export function isOpen(save: Save, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= COURSE_IDS.length) throw new Error(`there is no island ${index}: the islands are 0 to ${COURSE_IDS.length - 1}`)
  return index === 0 || save.done.includes(COURSE_IDS[index - 1]) || save.done.includes(COURSE_IDS[index])
}

/** What this island's box gives next: its own island's things first in ITEMS order, then any other thing not found in ITEMS order; null once all are found. */
export function nextGift(save: Save, course: CourseId): ItemId | null {
  const left = ITEM_IDS.filter((id) => !save.found.includes(id))
  return left.find((id) => ITEMS[id].course === course) ?? (left.length > 0 ? left[0] : null)
}

/** The baby found on that island; the same save if it was already. */
export function withBaby(save: Save, course: CourseId, index: 0 | 1 | 2): Save {
  if (save.babies[course][index]) return save
  const babies: [boolean, boolean, boolean] = [...save.babies[course]]
  babies[index] = true
  return { ...save, babies: { ...save.babies, [course]: babies } }
}

/** The island done, and its best animal kept if this one is bigger. Throws for an animal that is not an index into ANIMALS. */
export function withFinish(save: Save, course: CourseId, animal: number): Save {
  if (!Number.isInteger(animal) || animal < 0 || animal >= ANIMALS.length) throw new Error(`there is no animal ${animal}: it is an index into ANIMALS, 0 to ${ANIMALS.length - 1}`)
  const done = save.done.includes(course) ? save.done : COURSE_IDS.filter((id) => id === course || save.done.includes(id))
  const best = animal > save.best[course] ? { ...save.best, [course]: animal } : save.best
  return done === save.done && best === save.best ? save : { ...save, done, best }
}

/** The gift found and put straight on (in its slot, in place of what was there). */
export function withGift(save: Save, item: ItemId): Save {
  const slot = ITEMS[item].slot
  if (save.found.includes(item) && save.outfit[slot] === item) return save
  const found = save.found.includes(item) ? save.found : ITEM_IDS.filter((id) => id === item || save.found.includes(id))
  return { ...save, found, outfit: { ...save.outfit, [slot]: item } }
}

/**
 * Stars into the jar. Every time it fills it empties by JAR_SIZE and opens the next
 * pattern in PATTERNS order, which goes straight on; once all are open, a fill counts a
 * fireworks instead. Says which patterns opened and how many fireworks, for the HUD.
 * Throws for a count that is not a whole number of stars.
 */
export function withStars(save: Save, n: number): { save: Save; patterns: Pattern[]; fireworks: number } {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${n} stars: stars come in whole numbers, 0 or more`)
  if (n === 0) return { save, patterns: [], fireworks: 0 }
  let jar = save.jar + n
  let patterns = save.patterns
  let pattern = save.pattern
  const opened: Pattern[] = []
  let fireworks = 0
  while (jar >= JAR_SIZE) {
    jar -= JAR_SIZE
    const next = PATTERNS.find((p) => !patterns.includes(p))
    if (next === undefined) fireworks += 1
    else {
      const was = patterns
      patterns = PATTERNS.filter((p) => p === next || was.includes(p))
      pattern = next
      opened.push(next)
    }
  }
  return { save: { ...save, jar, patterns, pattern }, patterns: opened, fireworks }
}

/** The obstacle kind taught; the same save if it already was. */
export function withLearned(save: Save, what: Teachable): Save {
  return save.learned.includes(what) ? save : { ...save, learned: TEACHABLES.filter((t) => t === what || save.learned.includes(t)) }
}

/** Puts a found thing on, or takes the slot off with null. Throws for a thing not found or in the wrong slot. */
export function withOutfit(save: Save, slot: Slot, item: ItemId | null): Save {
  if (item !== null) {
    if (!save.found.includes(item)) throw new Error(`${item} is not found yet, so it cannot be worn`)
    if (ITEMS[item].slot !== slot) throw new Error(`${item} goes in the ${ITEMS[item].slot} slot, not the ${slot} slot`)
  }
  return save.outfit[slot] === item ? save : { ...save, outfit: { ...save.outfit, [slot]: item } }
}

export function withColour(save: Save, colour: SlimeColour): Save {
  return save.colour === colour ? save : { ...save, colour }
}

/** Puts an open pattern on, or none with null. Throws for one not open. */
export function withPattern(save: Save, pattern: Pattern | null): Save {
  if (pattern !== null && !save.patterns.includes(pattern)) throw new Error(`the ${pattern} pattern is not open yet: the star jar opens it`)
  return save.pattern === pattern ? save : { ...save, pattern }
}

export function withSound(save: Save, on: boolean): Save {
  return save.sound === on ? save : { ...save, sound: on }
}
