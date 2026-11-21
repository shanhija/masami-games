import { COURSES, DISHES, FILLINGS, FILLINGS_AT_START, MAX_PICKS, type CourseId, type Dish, type Filling } from './model'

/**
 * What the browser remembers, as pure functions over a small JSON object: each course's best
 * stars (0 for not done yet), the courses a parent opened, the switches, the last dish and its
 * fillings (the kitchen starts there next time), how many fillings of each dish the kitchen
 * has shown (the rest wear a "New!"), and whether the party after the last course has played.
 */
export interface Save {
  v: 1
  stars: Record<CourseId, number>
  opened: CourseId[]
  sound: boolean
  music: boolean
  dish: Dish
  picks: Record<Dish, Filling[]>
  seen: Record<Dish, number>
  partied: boolean
}

const FRESH: Save = {
  v: 1,
  stars: { park: 0, pond: 0, garden: 0, farm: 0, castle: 0 },
  opened: [],
  sound: true,
  music: true,
  dish: 'burger',
  picks: { burger: ['patty', 'cheese', 'salad'], croissant: ['chocolate', 'banana'] },
  seen: { burger: FILLINGS_AT_START, croissant: FILLINGS_AT_START },
  partied: false,
}

/** Reads a stored save, keeping whatever of it still makes sense; nothing stored (or nonsense) is a fresh one. */
export function parseSave(text: string | null): Save {
  if (text === null) return structuredClone(FRESH)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return structuredClone(FRESH)
  }
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return structuredClone(FRESH)
  const r = raw as Partial<Record<keyof Save, unknown>>
  const save = structuredClone(FRESH)
  const stars = r.stars as Record<string, unknown> | undefined
  for (const id of COURSES) {
    const n = stars?.[id]
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 3) save.stars[id] = n
  }
  if (Array.isArray(r.opened)) save.opened = COURSES.filter((id) => (r.opened as unknown[]).includes(id))
  if (typeof r.sound === 'boolean') save.sound = r.sound
  if (typeof r.music === 'boolean') save.music = r.music
  if (DISHES.includes(r.dish as Dish)) save.dish = r.dish as Dish
  const picks = r.picks as Record<string, unknown> | undefined
  const seen = r.seen as Record<string, unknown> | undefined
  for (const dish of DISHES) {
    const list = picks?.[dish]
    if (Array.isArray(list)) {
      const kept = (FILLINGS[dish] as readonly Filling[]).filter((f) => list.includes(f)).slice(0, MAX_PICKS)
      if (kept.length > 0) save.picks[dish] = kept
    }
    const n = seen?.[dish]
    if (typeof n === 'number' && Number.isInteger(n) && n >= FILLINGS_AT_START && n <= FILLINGS[dish].length) save.seen[dish] = n
  }
  if (typeof r.partied === 'boolean') save.partied = r.partied
  return save
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save)
}

/** How many courses have been done. */
export function coursesDone(save: Save): number {
  return COURSES.filter((id) => save.stars[id] > 0).length
}

/** A course is open if it is the first, the one before it is done, or a parent opened it. */
export function isOpen(save: Save, index: number): boolean {
  return index === 0 || save.stars[COURSES[index - 1]!] > 0 || save.opened.includes(COURSES[index]!)
}

/** The dish's fillings the kitchen offers: FILLINGS_AT_START, and one more for each course done. */
export function openFillings(save: Save, dish: Dish, all: boolean): readonly Filling[] {
  const list = FILLINGS[dish] as readonly Filling[]
  return all ? list : list.slice(0, Math.min(list.length, FILLINGS_AT_START + coursesDone(save)))
}

/** A course done with `stars`: the best stars kept. */
export function courseDone(save: Save, id: CourseId, stars: number): Save {
  return { ...save, stars: { ...save.stars, [id]: Math.max(save.stars[id], stars) } }
}

/** The kitchen's last choice, remembered for next time. */
export function rememberDish(save: Save, dish: Dish, picks: readonly Filling[]): Save {
  return { ...save, dish, picks: { ...save.picks, [dish]: [...picks] } }
}

/** The kitchen has shown `n` of the dish's fillings: their "New!" goes. */
export function sawFillings(save: Save, dish: Dish, n: number): Save {
  return n <= save.seen[dish] ? save : { ...save, seen: { ...save.seen, [dish]: n } }
}

export function openCourse(save: Save, id: CourseId): Save {
  return save.opened.includes(id) ? save : { ...save, opened: [...save.opened, id] }
}

/** Every course and its stars forgotten, the party unplayed; the switches and the last dish stay. */
export function startFresh(save: Save): Save {
  return { ...structuredClone(FRESH), sound: save.sound, music: save.music, dish: save.dish, picks: save.picks }
}
