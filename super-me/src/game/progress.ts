import type { RoomId } from '../../../pia-jump/src/game/model'
import { REWARDS, parseLook, type Look, type Reward } from './closet'
import { LEVELS } from './levels'

/** What the browser remembers between visits. */
export interface Save {
  /** The person, or null until the child has left the closet once: the game opens on the closet until then. */
  look: Look | null
  /** The presents found, whichever level they were in. */
  found: Reward[]
  /** The levels finished. */
  done: RoomId[]
  sound: boolean
  music: boolean
}

export const FRESH: Save = { look: null, found: [], done: [], sound: true, music: true }

/** Reads a save back. Anything it does not know is left out, so an old or hand-edited save still loads; text that is no JSON at all starts fresh, with a warning. */
export function parseSave(text: string | null): Save {
  if (text === null) return FRESH
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    console.warn('Super Me found a save it cannot read and starts fresh:', e)
    return FRESH
  }
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : [])
  return {
    look: r.look ? parseLook(r.look) : null,
    found: REWARDS.filter((x) => list(r.found).includes(x)),
    done: LEVELS.map((l) => l.id).filter((id) => list(r.done).includes(id)),
    sound: r.sound !== false,
    music: r.music !== false,
  }
}

export const serializeSave = (save: Save) => JSON.stringify(save)

/** A level is open when it is the first one or the one before it is done. */
export const isOpen = (save: Save, index: number) => index === 0 || save.done.includes(LEVELS[index - 1]!.id)
