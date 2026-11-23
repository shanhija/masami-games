/**
 * The page's side of playing a room, as plain numbers and data so vitest runs it: what a door
 * opens (HouseRoom), the party the sim starts with from the seats and their gallery faces, the
 * fixed 60 frames a second against the screen's own rate, the sound cues not yet played, and the
 * seats a URL asks for (?room=<id>&seats=keys0,touch1).
 */

import type { Avatar } from '../../../profiles/src/avatar'
import type { Words } from '../../../profiles/src/lang'
import { palette } from '../../../silly-billy/src/scene/look'
import type { Level, RoomCode, Shell } from '../engine/api'
import type { LookCode } from '../engine/look'
import type { PartyMember, RoomRuntime, RoomStart } from '../engine/room'
import type { HouseSound } from '../engine/sounds'
import { DT } from '../engine/state'
import type { RoomKind, RoomView, World } from '../engine/world'
import type { BotSecs, PlayLog, Roll } from '../protocol'
import type { RoomEnd, StepsDone, Thumb, Wear } from '../saves'
import { WARDROBE } from '../own/wardrobe/wardrobe'
import { wornOver, type FaceDress } from '../scene/dress'
import { claimSeat } from '../seats/claim'
import type { Device, PartySize, Seat } from '../seats/types'
import type { WalkCode } from '../trial/api'
import type { LookRuntime, WalkRuntime } from '../trial/compile'

/**
 * What a door in the house opens: a room made for one party size, with its name on the door, the
 * seed it always plays on, what was rolled for it, its code and its walkthrough (what ?autoplay
 * plays). The code and the walkthrough are given against the runtime they will run on, because a
 * kept room's are compiled from their guarded text onto that runtime's budget and Math
 * (trial/compile.ts); a room written by hand ignores it, as the trial's handRoom does.
 */
export interface HouseRoom {
  /** `own:<name>` for the game's own rooms, a library id for a kept one (saves.ts RoomResult.room). */
  readonly id: string
  readonly party: PartySize
  readonly name: Words
  readonly seed: number
  readonly roll: Roll
  /** The shell the house draws round it: a kept room's answer's, an own room's facts'. */
  readonly shell: Shell
  readonly code: (runtime: RoomRuntime) => RoomCode
  readonly walk: (runtime: WalkRuntime) => WalkCode
  /** The room's look compiled against the runtime it runs on (engine/look.ts), built on the room as played; null for a room without one, which the house still draws in its shell. */
  readonly look: ((runtime: LookRuntime) => LookCode) | null
  /** The bots' seconds at each level, kept with a made room; null for a room written by hand, whose seconds are not kept with it. */
  readonly botSecs: BotSecs | null
}

/** A room written by hand (the game's own, the shell's hop room) as a door: played as its kind and view say, in its shell, its code as it is, with its look written by hand (null: none, the room plays in its shell). A look written by hand ignores the runtime, as its code does. */
export function handDoor(room: { readonly id: string; readonly party: PartySize; readonly name: Words; readonly seed: number; readonly kind: RoomKind; readonly view: RoomView; readonly shell: Shell; readonly code: RoomCode; readonly walk: WalkCode; readonly look: LookCode | null }): HouseRoom {
  const look = room.look
  return { id: room.id, party: room.party, name: room.name, seed: room.seed, roll: { kind: room.kind, view: room.view }, shell: room.shell, code: () => room.code, walk: () => room.walk, look: look === null ? null : () => look, botSecs: null }
}

/** The clothes every kid wears under what they put on in the dressing room: a top in their seat's colour, so each child finds themself at once, over the same trousers and shoes. */
const CLOTHES = { bottom: '#3d5a99', shoes: palette.ink, eyes: palette.ink } as const

/** The sim's party from the seats in seat order, each dressed from their gallery face by the starting wardrobe (null: a player the browser keeps no profile of, who wears the wardrobe's plain face), with what they wear from their saves over it, slot by slot (saves.ts Wear). */
export function partyFrom(seats: readonly Seat[], faceOf: (seat: Seat) => Avatar | null, wearOf: (seat: Seat) => Wear): PartyMember[] {
  return seats.map((seat, i) => {
    if (seat.index !== i) throw new Error(`seat ${i} has index ${seat.index}: the seats must be in order`)
    const dressed = faceDress(faceOf(seat))
    return {
      seat: seat.index,
      color: seat.color,
      body: { skin: dressed.skin, eyes: CLOTHES.eyes, top: seat.color, bottom: CLOTHES.bottom, shoes: CLOTHES.shoes, skirt: false, build: 1 },
      wear: wornOver(dressed.wear, wearOf(seat)),
    }
  })
}

/** A gallery face as the starting wardrobe dresses it; a player with no profile wears the plain face's skin and nothing else. */
export function faceDress(face: Avatar | null): FaceDress {
  return face === null ? { skin: WARDROBE.dress(PLAIN_FACE).skin, wear: {} } : WARDROBE.dress(face)
}

/** The face of a player with no profile: the gallery's first choice of every part, bald and bare. */
const PLAIN_FACE: Avatar = { backdrop: 'sky', skin: 'peach', hair: 'none', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'none' }

/** How a door's room starts for this party at this level: as it was rolled, on its own seed. */
export function roomStart(room: HouseRoom, party: readonly PartyMember[], level: Level): RoomStart {
  if (party.length !== room.party) throw new Error(`the room ${room.id} is made for ${room.party} players and the party has ${party.length}`)
  return { seed: room.seed, level, kind: room.roll.kind, view: room.roll.view, shell: room.shell, party }
}

/** How a room went for the party, from the door to its end or to leaving it: the level of its last start, seconds on the game's clock and the hints said over every start of it, and the steps done in its last start. */
export interface Played {
  readonly end: RoomEnd
  readonly level: Level
  readonly secs: number
  readonly restarts: number
  readonly hints: number
  readonly steps: StepsDone
}

/** A room's result for the server's log (POST /play): the party's numbers only, and each player's thumb in seat order. */
export function playLog(room: HouseRoom, played: Played, at: string, thumbs: readonly Thumb[]): PlayLog {
  if (thumbs.length !== room.party) throw new Error(`the room ${room.id} is made for ${room.party} players and ${thumbs.length} thumbs were given`)
  return { room: room.id, at, level: played.level, secs: played.secs, restarts: played.restarts, hints: played.hints, end: played.end, steps: played.steps, party: room.party, thumbs }
}

/** The most sim frames one screen frame plays: a tab that comes back after a long while does not race to catch up. */
export const MOST_FRAMES = 6

/**
 * The sim's fixed frames against the screen's: each screen frame adds the seconds since the last
 * and plays as many whole sim frames as fit, keeping the rest for the next. More than MOST_FRAMES
 * behind, the rest is dropped (the game slows rather than stutters).
 */
export class FrameClock {
  private left = 0

  /** How many sim frames to play for `secs` of the screen's time. */
  advance(secs: number): number {
    if (!(secs >= 0)) throw new Error(`a screen frame of ${secs} s`)
    this.left += secs
    const frames = Math.floor(this.left / DT + 1e-9)
    this.left -= frames * DT
    if (frames <= MOST_FRAMES) return frames
    this.left = 0
    return MOST_FRAMES
  }
}

/** The world's sound cues past `heard`, oldest first, and the serial heard from now on. */
export function newCues(world: World, heard: number): { names: HouseSound[]; heard: number } {
  const fresh = world.sounds.filter((s) => s.serial > heard).sort((a, b) => a.serial - b.serial)
  return { names: fresh.map((s) => s.name), heard: fresh.length === 0 ? heard : fresh[fresh.length - 1].serial }
}

/** One device as a URL names it: keys0 to keys3, touch0 and touch1, gamepad0 and up. */
export function parseDevice(text: string): Device {
  const m = /^(keys|touch|gamepad)(\d+)$/.exec(text)
  if (m === null) throw new Error(`${text} is not a device: write keys0 to keys3, touch0, touch1 or gamepad0`)
  const n = Number(m[2])
  if (m[1] === 'keys' && n <= 3) return { kind: 'keys', zone: n as 0 | 1 | 2 | 3 }
  if (m[1] === 'touch' && n <= 1) return { kind: 'touch', pad: n as 0 | 1 }
  if (m[1] === 'gamepad') return { kind: 'gamepad', index: n }
  throw new Error(`${text} is not a device: write keys0 to keys3, touch0, touch1 or gamepad0`)
}

/** The seats a URL asks for, in order, each taken by the next player of the device; with no list, `party` seats on the key zones from 0. */
export function seatsFromUrl(list: string | null, party: PartySize, players: readonly (string | null)[]): Seat[] {
  const devices: Device[] = list === null ? Array.from({ length: party }, (_, zone) => ({ kind: 'keys', zone: zone as 0 | 1 | 2 | 3 })) : list.split(',').map(parseDevice)
  if (devices.length !== party) throw new Error(`the room is made for ${party} players and the URL seats ${devices.length}`)
  if (devices.length > players.length) throw new Error(`the URL seats ${devices.length} and the device has ${players.length} players`)
  let seats: Seat[] = []
  devices.forEach((device, i) => {
    const next = claimSeat(seats, device, players[i])
    if (next === null) throw new Error(`the URL seats ${list} with a device twice`)
    seats = next
  })
  return seats
}
