/**
 * What the browser remembers between visits: how far the story got, the coins and stars, the
 * paints and the builder, and the settings. `parseSave` keeps every good field of what is stored
 * and mends the rest. game.ts is the one place that reads and writes it to storage.
 */

import { MORE_TEMPLATES, STORY } from './jobs'
import { DRIVER_SPECIES, FIRST_PAINT, HAT_COLOURS, MACHINE_KINDS, PAINTS } from './model'
import type { DriverLook, MachineKind, Mode, PaintId } from './model'

export interface Save {
  /** Story jobs finished. */
  storyDone: number
  /** Jobs finished after the story. */
  moreDone: number
  coins: number
  stars: number
  mode: Mode
  sound: boolean
  music: boolean
  /** The paint each machine wears. */
  paints: Record<MachineKind, PaintId>
  /** The paints the child can use: the machines' first colours, the free ones and the bought ones. */
  owned: PaintId[]
  driver: DriverLook
  /** The builder has been chosen on the title. */
  picked: boolean
  /** The story has been finished once. */
  golden: boolean
  /** The job generator's random state. */
  seed: number
  /** The template of the last generated job (an index in MORE_TEMPLATES), or -1: none comes twice running, even across a reload. */
  lastTemplate: number
}

/** The first visit's settings. Frozen all the way down, so a stray write throws. */
const DEFAULTS: Omit<Save, 'seed' | 'lastTemplate'> = Object.freeze({
  storyDone: 0,
  moreDone: 0,
  coins: 0,
  stars: 0,
  mode: 'easy',
  sound: true,
  music: true,
  paints: Object.freeze({ ...FIRST_PAINT }),
  owned: Object.freeze(PAINTS.filter((p) => p.price === 0 || Object.values(FIRST_PAINT).includes(p.id)).map((p) => p.id)) as PaintId[],
  driver: Object.freeze({ species: DRIVER_SPECIES[0], hat: HAT_COLOURS[0] }),
  picked: false,
  golden: false,
})

/** The first visit, with the random state of the job generator it starts from. */
export const freshSave = (seed: number): Save => Object.freeze({ ...DEFAULTS, seed, lastTemplate: -1 })

/** Whether a save holds anything worth keeping when a new game wipes it: story, coins, stars or a bought paint. */
export const hasProgress = (s: Save): boolean => s.storyDone > 0 || s.moreDone > 0 || s.coins > 0 || s.stars > 0 || s.owned.length > DEFAULTS.owned.length

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const PAINT_IDS: readonly string[] = PAINTS.map((p) => p.id)
const isPaint = (v: unknown): v is PaintId => typeof v === 'string' && PAINT_IDS.includes(v)

/** What `parseSave` made of the stored text, and whether any of it had to be mended. */
export interface Parsed {
  save: Save
  /** The text was no save at all, or a field held a bad value: the caller keeps a copy of the text. */
  trouble: boolean
}

/** One field of the stored object: a missing one takes `fallback` quietly, a present one that fails `ok` takes it and is named in `bad`. */
function take<T>(from: Record<string, unknown>, key: string, ok: (v: unknown) => v is T, fallback: T, bad: string[]): T {
  const v = from[key]
  if (v === undefined) return fallback
  if (ok(v)) return v
  bad.push(key)
  return fallback
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isMode = (v: unknown): v is Mode => v === 'easy' || v === 'pro'
const isCoins = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isSpecies = (v: unknown): v is DriverLook['species'] => (DRIVER_SPECIES as readonly unknown[]).includes(v)
const isHat = (v: unknown): v is DriverLook['hat'] => (HAT_COLOURS as readonly unknown[]).includes(v)
const isTemplate = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < MORE_TEMPLATES.length

/**
 * Reads a save back, field by field. Nothing stored is a first visit. A field that is missing
 * takes its default without fuss: that is how a save written before a new field existed carries
 * on. A field that is there with a bad value is mended (clamped where a clamp means something,
 * else the default) and every good field is kept. Text that is not an object starts fresh. Both
 * kinds of trouble warn once and say so in `trouble`. A fresh game's generator starts from `freshSeed`.
 */
export function parseSave(text: string | null, freshSeed: number): Parsed {
  if (text === null) return { save: freshSave(freshSeed), trouble: false }
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch (e) {
    console.warn('Digger Town: the saved game is not readable, so it starts fresh and a copy is kept:', e)
    return { save: freshSave(freshSeed), trouble: true }
  }
  if (!isRecord(v)) {
    console.warn('Digger Town: the saved game is not an object, so it starts fresh and a copy is kept')
    return { save: freshSave(freshSeed), trouble: true }
  }
  const bad: string[] = []
  let storyDone = take(v, 'storyDone', isCount, DEFAULTS.storyDone, bad)
  if (storyDone > STORY.length) {
    bad.push('storyDone')
    storyDone = STORY.length
  }
  // The paints a machine starts with and the free ones are always owned.
  const ownedRaw = v.owned
  const ownedIds = PAINTS.map((p) => p.id).filter((id) => DEFAULTS.owned.includes(id) || (Array.isArray(ownedRaw) && ownedRaw.includes(id)))
  if (ownedRaw !== undefined && !(Array.isArray(ownedRaw) && ownedRaw.length === ownedIds.length && ownedRaw.every(isPaint))) bad.push('owned')
  const paintsRaw = take(v, 'paints', isRecord, {}, bad)
  const paints = Object.fromEntries(
    MACHINE_KINDS.map((k) => {
      const p = paintsRaw[k]
      if (p === undefined) return [k, FIRST_PAINT[k]]
      if (isPaint(p) && ownedIds.includes(p)) return [k, p]
      bad.push(`paints.${k}`)
      return [k, FIRST_PAINT[k]]
    }),
  ) as Record<MachineKind, PaintId>
  const driverRaw = take(v, 'driver', isRecord, {}, bad)
  const save: Save = {
    storyDone,
    moreDone: take(v, 'moreDone', isCount, DEFAULTS.moreDone, bad),
    coins: take(v, 'coins', isCoins, DEFAULTS.coins, bad),
    stars: take(v, 'stars', isCount, DEFAULTS.stars, bad),
    mode: take(v, 'mode', isMode, DEFAULTS.mode, bad),
    sound: take(v, 'sound', isBool, DEFAULTS.sound, bad),
    music: take(v, 'music', isBool, DEFAULTS.music, bad),
    paints,
    owned: ownedIds,
    driver: { species: take(driverRaw, 'species', isSpecies, DEFAULTS.driver.species, bad), hat: take(driverRaw, 'hat', isHat, DEFAULTS.driver.hat, bad) },
    picked: take(v, 'picked', isBool, DEFAULTS.picked, bad),
    golden: take(v, 'golden', isBool, DEFAULTS.golden, bad),
    seed: take(v, 'seed', isCount, freshSeed, bad),
    lastTemplate: take(v, 'lastTemplate', isTemplate, -1, bad),
  }
  if (bad.length > 0) console.warn(`Digger Town: the saved game had bad ${bad.join(', ')}, which were mended, and a copy is kept`)
  return { save, trouble: bad.length > 0 }
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save)
}
