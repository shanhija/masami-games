/**
 * Magic House: what a player's saves hold, and the one module that reads and writes them (plan.md,
 * Help, and how hard: it folds the seated players' saves into the party's level and who has played
 * what, and writes a room's result back to each; nothing else reads or writes saves).
 *
 * The saves come from `enterGame('magic-house')` for the picked player and from `profileSaves(id,
 * 'magic-house')` for the others in the party (profiles/src/profiles.ts; devicePlayers below), each
 * under one key, SAVES_KEY, as the JSON of StoredSaves. A stored form whose version is not
 * SAVES_VERSION, or that does not parse, is started afresh, not mended (coding-style.md: remove and
 * migrate, never carry).
 *
 * Everything here but the thin layer at the bottom (readSaves, changeSaves, devicePlayers) is a pure
 * function over plain data, so vitest holds every rule.
 */

import type { Avatar } from '../../profiles/src/avatar'
import type { Lang } from '../../profiles/src/lang'
import { loadProfiles, profileSaves, type GameEntry, type GameSaves, type Saves } from '../../profiles/src/profiles'
import { SLOTS, type Slot } from '../../silly-billy/src/engine/types'
import { PASS, type Level } from './engine/api'
import { PLAYED_MOST, type BotSecs, type PlayedBefore, type RoomEntry } from './protocol'
import { keptDevice } from './seats/claim'
import type { Device, KeptDevice, Seat } from './seats/types'

/** The one key Magic House keeps under, in each player's saves. */
export const SAVES_KEY = 'house'
/** The stored form's version: raise it whenever the stored form changes, and older saves start afresh. */
export const SAVES_VERSION = 1

/** How a room ended for the party. 'left' is by the pause card (another room or more games). */
export type RoomEnd = 'finished' | 'left'
/** What a child gave the room in the dressing room, or null when they gave none. */
export type Thumb = 'up' | 'down' | null

/** One time this player played a room. */
export interface RoomResult {
  /** The room's id in the library (protocol.ts RoomFile.id), or a room of the game's own, `own:<name>` (own/), so the two never meet. */
  readonly room: string
  /** When it ended, ISO 8601. Every seated player's result of one play has the same, which is how a play is told from another (partyHistory). */
  readonly at: string
  /** The level the party played it at, at its last start (a second start-again plays one lower: restartLevel). */
  readonly level: Level
  /** Seconds of play, on the game's clock, from the door to the end, over every start of it. */
  readonly secs: number
  /** How many times the party started it again. */
  readonly restarts: number
  /** How many hints the helper said, its own and those called with ? (a ? again for a hint already said counts once). */
  readonly hints: number
  readonly end: RoomEnd
  /** The room's steps done at its end, of how many, in its last start: a room with a clock can end with steps undone (engine/api.ts r.clock), and that is no clear. */
  readonly steps: StepsDone
  readonly thumb: Thumb
  /** The bots played it (?autoplay): kept, so a developer sees it saved, but it moves no level and is never told to Opus (plan.md, The door). */
  readonly bots: boolean
}

/** How many of a room's steps were done, of how many it has. */
export interface StepsDone {
  readonly done: number
  readonly of: number
}

/** A thing worn in one slot, in the wearer's colours and pattern. */
export interface Wearing {
  /** What is worn: a present's id in the library (protocol.ts GiftFile.id), or a piece of the starting wardrobe, `own:<name>` (own/). */
  readonly id: string
  /** '#rrggbb', one of the game's own set of colours. Kept as the colour itself, so a change to the set leaves what is worn as it was. */
  readonly main: string
  readonly second: string
  /** A pattern of the game's own set, laid on what the present paints c.main; 'plain' for none. A name no longer in the set is drawn plain. */
  readonly pattern: string
}

/** What a player wears, by slot. A slot left out is worn as their gallery face gives it (its hair, its extra), so a new player looks as they do in the gallery. */
export type Wear = Readonly<Partial<Record<Slot, Wearing>>>

/** A player's quiz levels while a room is late, each from 1 up, moving with their answers. */
export interface QuizLevels {
  readonly maths: number
  readonly reading: number
}

/** What a player's saves hold, as the game uses them. */
export interface HouseSaves {
  /** The device they last sat at, offered first when they join (seats/claim.ts keptBy); null until they first take a seat. */
  readonly device: KeptDevice | null
  readonly quiz: QuizLevels
  /** Their own room level: the party plays at the lowest among its players, and it moves after each room (movedLevel). */
  readonly level: Level
  /** Every room they played, oldest first, each time it was played. */
  readonly rooms: readonly RoomResult[]
  /** The ids of the presents they own (GiftFile.id), oldest first. The starting wardrobe is everyone's and is not listed. */
  readonly owned: readonly string[]
  readonly wear: Wear
}

/** The saves as stored under SAVES_KEY: the version first, then the saves. */
export interface StoredSaves extends HouseSaves {
  readonly version: typeof SAVES_VERSION
}

/** A new player's saves: no device yet, every level 1, nothing played, owned or worn but their gallery face. */
export const FRESH_SAVES: HouseSaves = { device: null, quiz: { maths: 1, reading: 1 }, level: 1, rooms: [], owned: [], wear: {} }

// ------------------------------------------------------------------------------ the stored form

const isLevel = (v: unknown): v is Level => v === 1 || v === 2 || v === 3
const isWhole = (v: unknown, least: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= least
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

function isDevice(v: unknown): v is KeptDevice {
  if (!isRecord(v)) return false
  if (v.kind === 'keys') return v.zone === 0 || v.zone === 1 || v.zone === 2 || v.zone === 3
  if (v.kind === 'touch') return v.pad === 0 || v.pad === 1
  return v.kind === 'gamepad'
}

function isResult(v: unknown): v is RoomResult {
  return (
    isRecord(v) &&
    typeof v.room === 'string' &&
    typeof v.at === 'string' &&
    !Number.isNaN(Date.parse(v.at)) &&
    isLevel(v.level) &&
    typeof v.secs === 'number' &&
    v.secs >= 0 &&
    isWhole(v.restarts, 0) &&
    isWhole(v.hints, 0) &&
    (v.end === 'finished' || v.end === 'left') &&
    isRecord(v.steps) &&
    isWhole(v.steps.of, 1) &&
    isWhole(v.steps.done, 0) &&
    v.steps.done <= v.steps.of &&
    (v.thumb === 'up' || v.thumb === 'down' || v.thumb === null) &&
    typeof v.bots === 'boolean'
  )
}

const isWearing = (v: unknown): v is Wearing => isRecord(v) && typeof v.id === 'string' && isColour(v.main) && isColour(v.second) && typeof v.pattern === 'string'

/** Why a stored form is not StoredSaves, or null when it is. */
function whyNot(v: unknown): string | null {
  if (!isRecord(v)) return 'it is not an object'
  if (v.version !== SAVES_VERSION) return `its version is ${String(v.version)}, not ${SAVES_VERSION}`
  if (v.device !== null && !isDevice(v.device)) return 'its device is not one'
  if (!isRecord(v.quiz) || !isWhole(v.quiz.maths, 1) || !isWhole(v.quiz.reading, 1)) return 'its quiz levels are not whole numbers from 1'
  if (!isLevel(v.level)) return 'its level is not 1, 2 or 3'
  if (!Array.isArray(v.rooms) || !v.rooms.every(isResult)) return 'a room it played is not a result'
  if (!Array.isArray(v.owned) || !v.owned.every((id) => typeof id === 'string')) return 'what it owns is not a list of ids'
  if (!isRecord(v.wear) || !Object.entries(v.wear).every(([slot, w]) => (SLOTS as readonly string[]).includes(slot) && isWearing(w))) return 'what it wears is not a thing in each slot'
  return null
}

/** A player's saves from their stored text: afresh when there is none, when it does not parse, or when it is not this version's form (with a warning that says why). */
export function parseSaves(text: string | null): HouseSaves {
  if (text === null) return FRESH_SAVES
  let stored: unknown
  try {
    stored = JSON.parse(text)
  } catch (err) {
    console.warn('Magic House starts these saves afresh: they do not parse.', err)
    return FRESH_SAVES
  }
  const why = whyNot(stored)
  if (why !== null) {
    console.warn(`Magic House starts these saves afresh: ${why}.`)
    return FRESH_SAVES
  }
  const { version, ...saves } = stored as StoredSaves
  return saves
}

/** A player's saves as stored text. */
export function storedText(saves: HouseSaves): string {
  const stored: StoredSaves = { version: SAVES_VERSION, ...saves }
  return JSON.stringify(stored)
}

// ------------------------------------------------------------------------------ the party, folded

/** The party's level: the lowest among its players' own (plan.md, Three levels in every room). */
export function partyLevel(players: readonly HouseSaves[]): Level {
  if (players.length === 0) throw new Error('a party has at least one player')
  return Math.min(...players.map((p) => p.level)) as Level
}

/** The level a room is played at after `restarts` starts-again of it: one lower from the second start-again on, never below 1. */
export function restartLevel(level: Level, restarts: number): Level {
  return restarts >= 2 && level > 1 ? ((level - 1) as Level) : level
}

/**
 * The rooms the party has played: a room counts when any of them has played it, so the new door
 * never offers as new a room one of them already knows (it stays a plain door of the house). The
 * bots' plays count too: the room was walked into.
 */
export function partyPlayed(players: readonly HouseSaves[]): ReadonlySet<string> {
  return new Set(players.flatMap((p) => p.rooms.map((r) => r.room)))
}

/**
 * How the party played its last rooms, newest first, at most PLAYED_MOST: the next request's "How
 * they played before" (protocol.ts PlayedBefore). One play is the results of one room with one end
 * time (each seated player has the same), with the thumbs they gave counted. A room no longer in the
 * library (dropped, or one of the game's own, whose bots' seconds are not kept) and the bots' plays
 * are left out, since the line says the bots' time beside theirs and only the children's play is told.
 */
export function partyHistory(players: readonly HouseSaves[], rooms: readonly RoomEntry[]): PlayedBefore[] {
  const plays = new Map<string, { result: RoomResult; entry: RoomEntry; up: number; down: number }>()
  for (const p of players) {
    for (const result of p.rooms) {
      if (result.bots) continue
      const entry = rooms.find((r) => r.id === result.room)
      if (entry === undefined) continue
      const key = `${result.room} ${result.at}`
      const play = plays.get(key) ?? { result, entry, up: 0, down: 0 }
      if (result.thumb === 'up') play.up++
      if (result.thumb === 'down') play.down++
      plays.set(key, play)
    }
  }
  return [...plays.values()]
    .sort((a, b) => Date.parse(b.result.at) - Date.parse(a.result.at))
    .slice(0, PLAYED_MOST)
    .map(({ result: r, entry, up, down }) => ({ name: entry.name, botSecs: entry.botSecs[r.level], secs: r.secs, restarts: r.restarts, hints: r.hints, end: r.end, steps: r.steps, up, down }))
}

/** What the party's saves say for the visit: its level, the rooms it has played, and how it played its last rooms. */
export interface PartyFold {
  readonly level: Level
  readonly played: ReadonlySet<string>
  readonly history: readonly PlayedBefore[]
}

export function foldParty(players: readonly HouseSaves[], rooms: readonly RoomEntry[]): PartyFold {
  return { level: partyLevel(players), played: partyPlayed(players), history: partyHistory(players, rooms) }
}

// ------------------------------------------------------------------------------ how hard, after a room

/**
 * When a player's own level moves after a room (plan.md, Three levels in every room), against the
 * bots' clean pass at the level played. Children take several times the bots' seconds (the bots'
 * minute or two is the children's three to five), so:
 * - up when the room was finished with every step done, no hint and no start-again, in at most
 *   `fast` times the bots' seconds (bots 75 s: within about 3 min);
 * - down when it was left after `leftSecs` or more, or ended by its clock with steps undone (long
 *   fought: the children never lose by it, but they did not clear it), or took `long` times the
 *   bots' seconds or more (bots 75 s: 7.5 min), or was started again `restarts` times (the party's
 *   level has dropped already then). A room left sooner was not fought, only not wanted, and moves
 *   nothing.
 * A clock room's bots' seconds are its clock (trial/trial.ts), so its seconds alone never say long
 * fought: its steps do. A room whose bots' seconds are not kept (the game's own) is measured
 * against `untimedSecs`, the seconds a room is planned for.
 */
export const LEVEL_MOVE = { fast: 2.5, long: 6, restarts: 2, leftSecs: 30, untimedSecs: PASS.aimSecs } as const

/**
 * A player's own level after a room the party started at `door` (the party's level then) and
 * played as `result` says, its bots' seconds at the level played `botSecs` (null: not kept). Up,
 * it is one over the door at least, so the lowest player climbs and the others keep theirs. Down,
 * it drops one only for a player the room was played at (whose own level is the door's or under):
 * a player above the room's level keeps theirs.
 */
export function movedLevel(own: Level, door: Level, result: Pick<RoomResult, 'secs' | 'restarts' | 'hints' | 'end' | 'steps'>, botSecs: number | null): Level {
  const bots = botSecs ?? LEVEL_MOVE.untimedSecs
  const cleared = result.end === 'finished' && result.steps.done === result.steps.of
  const up = cleared && result.hints === 0 && result.restarts === 0 && result.secs <= LEVEL_MOVE.fast * bots
  const down = (result.end === 'left' && result.secs >= LEVEL_MOVE.leftSecs) || (result.end === 'finished' && !cleared) || result.secs >= LEVEL_MOVE.long * bots || result.restarts >= LEVEL_MOVE.restarts
  if (up) return Math.min(3, Math.max(own, door + 1)) as Level
  if (down && own <= door) return Math.max(1, own - 1) as Level
  return own
}

/** How a result moves a level: the party's level at the door and the room's bots' seconds at the level played (null: not kept). */
export interface LevelMove {
  readonly door: Level
  readonly botSecs: number | null
}

/** How a room was played, as the page counts it (shell/counted.ts playedNow). */
export type PlayedRoom = Pick<RoomResult, 'level' | 'secs' | 'restarts' | 'hints' | 'end' | 'steps'>

/**
 * A room's result for every seated player's saves, and how it moves their own level: ended `at`,
 * started at the party's level `door`, its bots' seconds taken at the level played (null where the
 * room keeps none). Under ?autoplay the result is marked the bots' and moves no level; under a
 * developer's ?level it is the children's but moves no level either, since the level was not theirs.
 */
export function roomResult(room: { readonly id: string; readonly botSecs: BotSecs | null }, played: PlayedRoom, at: string, door: Level, by: { readonly autoplay: boolean; readonly devLevel: boolean }): { result: RoomResult; move: LevelMove | null } {
  const result: RoomResult = { room: room.id, at, level: played.level, secs: played.secs, restarts: played.restarts, hints: played.hints, end: played.end, steps: played.steps, thumb: null, bots: by.autoplay }
  const move = by.autoplay || by.devLevel ? null : { door, botSecs: room.botSecs === null ? null : room.botSecs[played.level] }
  return { result, move }
}

/** The saves after a room: its result kept, and the player's own level moved by it, or not moved (`move` null) when the level was not the children's own (?autoplay, a developer's ?level). */
export function afterRoom(saves: HouseSaves, result: RoomResult, move: LevelMove | null): HouseSaves {
  return { ...saves, rooms: [...saves.rooms, result], level: move === null ? saves.level : movedLevel(saves.level, move.door, result, move.botSecs) }
}

/** The saves with the thumb a player gave a room played: the result of that room that ended `at`. A result no longer there (the gallery started the game over meanwhile) is warned of and left. */
export function withThumb(saves: HouseSaves, room: string, at: string, thumb: Thumb): HouseSaves {
  const i = saves.rooms.findIndex((r) => r.room === room && r.at === at)
  if (i < 0) {
    console.warn(`Magic House has no result of ${room} at ${at} to give a thumb: the saves were started over meanwhile.`)
    return saves
  }
  return { ...saves, rooms: saves.rooms.map((r, j) => (j === i ? { ...r, thumb } : r)) }
}

/** The saves with a present owned (once: one already owned stays where it is). */
export function withPresent(saves: HouseSaves, gift: string): HouseSaves {
  return saves.owned.includes(gift) ? saves : { ...saves, owned: [...saves.owned, gift] }
}

/** The saves with what the player wears now. */
export function withWear(saves: HouseSaves, wear: Wear): HouseSaves {
  return { ...saves, wear }
}

/** The saves with the player's quiz levels now. */
export function withQuiz(saves: HouseSaves, quiz: QuizLevels): HouseSaves {
  if (!isWhole(quiz.maths, 1) || !isWhole(quiz.reading, 1)) throw new Error(`quiz levels are whole numbers from 1, not ${quiz.maths} and ${quiz.reading}`)
  return { ...saves, quiz }
}

/** The saves with the device the player sat at, as kept (a gamepad by its kind only). */
export function withDevice(saves: HouseSaves, device: Device): HouseSaves {
  return { ...saves, device: keptDevice(device) }
}

// ------------------------------------------------------------------------------ the party's players

/** A player of this device: their profile id (null where the browser keeps none), gallery face and name, their own language, and their saves of Magic House. */
export interface DevicePlayer {
  readonly profile: string | null
  readonly avatar: Avatar | null
  readonly name: string | null
  readonly lang: Lang
  readonly saves: GameSaves
}

/** A seated player as a screen with a column each shows them (the quiz, the end, the dressing room): their seat, face, name and own language, and their saves as they are now. */
export interface SeatedPlayer {
  readonly seat: Seat
  readonly face: Avatar | null
  readonly name: string | null
  /** Their own language: their column speaks it, while the page plays in the picked player's. */
  readonly lang: Lang
  readonly saves: HouseSaves
}

/** The seated players in seat order, from the device's players and their saves as read (`book`, by profile). */
export function seatedPlayers(seats: readonly Seat[], players: readonly DevicePlayer[], book: ReadonlyMap<string | null, HouseSaves>): SeatedPlayer[] {
  return seats.map((seat) => {
    const player = players.find((p) => p.profile === seat.profile)
    const saves = book.get(seat.profile)
    if (player === undefined || saves === undefined) throw new Error(`seat ${seat.index} is taken by ${seat.profile}, who is not a player of this device`)
    return { seat, face: player.avatar, name: player.name, lang: player.lang, saves }
  })
}

// ------------------------------------------------------------------------------ the thin layer that reads and writes

/** A player's saves as stored now. */
export function readSaves(saves: Saves): HouseSaves {
  return parseSaves(saves.getItem(SAVES_KEY))
}

/** Reads a player's saves, changes them and writes them back at once, and gives them as written. It reads first, so what another tab wrote meanwhile is kept. */
export function changeSaves(saves: Saves, change: (now: HouseSaves) => HouseSaves): HouseSaves {
  const next = change(readSaves(saves))
  saves.setItem(SAVES_KEY, storedText(next))
  return next
}

/**
 * The device's players (plan.md, A party): the picked one first, through `enterGame`, with the
 * saves and language it gave, then the others in the order they were made, each with
 * `profileSaves` and their own language. Where the browser keeps no site data there is one player,
 * who has no profile and plays on the saves in memory that enterGame gave.
 */
export function devicePlayers(entry: GameEntry): DevicePlayer[] {
  const picked = entry.profile
  if (picked === null) return [{ profile: null, avatar: null, name: null, lang: entry.lang, saves: entry.saves }]
  const others = loadProfiles().filter((p) => p.id !== picked.id)
  return [
    { profile: picked.id, avatar: picked.avatar, name: picked.name, lang: entry.lang, saves: entry.saves },
    ...others.map((p) => ({ profile: p.id, avatar: p.avatar, name: p.name, lang: p.lang, saves: profileSaves(p.id, 'magic-house') })),
  ]
}
