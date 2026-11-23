/**
 * The glowing door for a new room (plan.md, A visit and One room ahead), as plain data so vitest
 * runs it. One unplayed room is kept ready for the party's size: when a kept room of their size
 * waits that these players have not played, the door opens it, and once they walk in the next is
 * asked for. When none waits, the door waits for the room in the making with a bar against the
 * line's readySecs from the room's asked time. Where nothing can be asked for (the hosted build, or
 * no CLI on the dev server) the door opens a kept room they have not played, and is not there when
 * there is none.
 *
 * A room kept while its look is still being made (the line's lookWaitUntil, at most LOOK_WAIT past
 * the keep) is still waited for: the door opens it once the look settles or that time is past, so
 * the room the party walks into has its look when it has one.
 *
 * "Not played" is any of the party's saves (saves.ts partyPlayed) or this visit's walking in. Times the server
 * wrote (a room's asked time) are measured by the server's clock as the line last said it, never the
 * tablet's own, which need not agree with the laptop's.
 *
 * Also here, so vitest runs them: what the wait behind the door does next (afterWait), and which
 * plain doors the house shows (houseDoors).
 */

import type { Words } from '../../../profiles/src/lang'
import type { Level } from '../engine/api'
import type { Line, LineRoom, LibraryIndex, PlayedBefore, RoomEntry, RoomRequest, RoomState } from '../protocol'
import { rollRoom } from '../roll'
import type { DeviceKind, PartySize } from '../seats/types'

/** The states of a room still in the making. */
export const MAKING: ReadonlySet<RoomState> = new Set<RoomState>(['asked', 'writing', 'trial', 'fixing'])
/** After this many rooms of a party size in a row are dropped in one visit, the page asks no more for that size: something is wrong that more asking will not mend (plan.md, When rooms fail). */
export const DROPS_STOP = 3
/** How far the bar fills by readySecs; past that it holds there, never full before the room is kept. */
export const BAR_MOST = 0.95

export type NewDoor =
  /** A kept room of their size they have not played: the door opens it. */
  | { readonly kind: 'ready'; readonly room: RoomEntry }
  /** Their room is in the making: the door shows its bar, measured by the server's clock (skewMs ahead of the page's), over the run of this visit's rooms of their size dropped in a row before it and the room itself, so a drop never empties the bar. */
  | { readonly kind: 'waiting'; readonly room: LineRoom; readonly run: readonly LineRoom[]; readonly readySecs: number; readonly skewMs: number }
  /** No new room here. */
  | { readonly kind: 'none' }

/** The line as this page heard it: the server's line, how far the server's clock is ahead of the page's, and the server's time when this visit first heard the line. */
export interface HeardLine {
  readonly line: Line
  readonly skewMs: number
  /** Ms since 1970 by the server's clock: drops before it do not stop a new visit from asking. */
  readonly visitStart: number
}

/** A line the server just said, as heard `pageNow` (the page's Date.now()), after what was heard before this visit, if anything. */
export function heard(before: HeardLine | null, line: Line, pageNow: number): HeardLine {
  const server = Date.parse(line.now)
  return { line, skewMs: server - pageNow, visitStart: before === null ? server : before.visitStart }
}

/** What the door is decided from. */
export interface DoorFacts {
  readonly party: PartySize
  readonly index: LibraryIndex
  /** The line of rooms as heard, or null where nothing can be asked for (the hosted build, no CLI). */
  readonly heard: HeardLine | null
  /** The room ids any of these players has played (their saves) or walked into this visit. */
  readonly played: ReadonlySet<string>
  /** Now by the server's clock, ms since 1970 (the page's Date.now() plus HeardLine.skewMs): a look's wait runs out by it. */
  readonly serverNow: number
}

/** Whether a room of the line is kept and its look is still awaited at `serverNow`. */
export function lookAwaited(room: LineRoom, serverNow: number): boolean {
  return room.kept !== null && room.lookWaitUntil !== null && Date.parse(room.lookWaitUntil) > serverNow
}

/** The soonest a look's wait runs out after `serverNow`, ms by the server's clock, or null when no look is awaited: the page looks at the door again then. */
export function lookWaitEnds(line: Line, serverNow: number): number | null {
  const ends = line.rooms.filter((r) => lookAwaited(r, serverNow)).map((r) => Date.parse(r.lookWaitUntil!))
  return ends.length === 0 ? null : Math.min(...ends)
}

/** The door for these facts. A room kept a moment ago that the library has not told the page of yet still shows as waiting, so it is never asked for twice. */
export function newDoor(f: DoorFacts): NewDoor {
  const lookWait = new Set((f.heard === null ? [] : f.heard.line.rooms).filter((r) => lookAwaited(r, f.serverNow)).map((r) => r.kept))
  const fresh = f.index.rooms.filter((r) => r.party === f.party && !f.played.has(r.id) && !lookWait.has(r.id))
  if (fresh.length > 0) return { kind: 'ready', room: fresh[fresh.length - 1]! }
  if (f.heard === null) return { kind: 'none' }
  const known = new Set(f.index.rooms.map((r) => r.id))
  const making = f.heard.line.rooms.filter((r) => r.party === f.party && (MAKING.has(r.state) || (r.state === 'kept' && r.kept !== null && !f.played.has(r.kept) && (!known.has(r.kept) || lookWait.has(r.kept)))))
  if (making.length === 0) return { kind: 'none' }
  const room = making[making.length - 1]!
  // The rooms of their size dropped in a row this visit just before this one: the same wait, asked again.
  const before = f.heard.line.rooms.slice(0, f.heard.line.rooms.indexOf(room)).filter((r) => r.party === f.party && Date.parse(r.asked) >= f.heard!.visitStart)
  let from = before.length
  while (from > 0 && before[from - 1]!.state === 'dropped') from--
  return { kind: 'waiting', room, run: [...before.slice(from), room], readySecs: f.heard.line.readySecs, skewMs: f.heard.skewMs }
}

/** How many of this party size's rooms asked this visit were dropped in a row, the newest last. */
export function dropsInARow(f: DoorFacts): number {
  if (f.heard === null) return 0
  const start = f.heard.visitStart
  const finished = f.heard.line.rooms.filter((r) => r.party === f.party && Date.parse(r.asked) >= start && (r.state === 'kept' || r.state === 'dropped'))
  let n = 0
  for (let i = finished.length - 1; i >= 0 && finished[i]!.state === 'dropped'; i--) n++
  return n
}

/** Whether the page asks for a room for this party now: it can ask, no room of their size is ready or in the making, and fewer than DROPS_STOP in a row were dropped this visit. */
export function askNow(f: DoorFacts): boolean {
  return f.heard !== null && newDoor(f).kind === 'none' && dropsInARow(f) < DROPS_STOP
}

/** What the wait behind the new door does next: open the room once it is ready, go back to the house when nothing more is coming, else stay (a room in the making, or about to be asked for after a drop). */
export function afterWait(f: DoorFacts): 'open' | 'house' | 'stay' {
  const door = newDoor(f)
  if (door.kind === 'ready') return 'open'
  return door.kind === 'none' && !askNow(f) ? 'house' : 'stay'
}

/** A plain door of the house: a room by its id, with its name on it. */
export interface HouseDoor {
  readonly id: string
  readonly name: Words
}

/** The house's plain doors: the party's own room and every kept room of its size, oldest first, less the one the new door opens or waits for (a room kept while its look is awaited is the new door's, never a plain door that would open it without its look). */
export function houseDoors(own: readonly { readonly id: string; readonly name: Words; readonly party: PartySize }[], index: LibraryIndex, party: PartySize, door: NewDoor): HouseDoor[] {
  const behindNewDoor = door.kind === 'ready' ? door.room.id : door.kind === 'waiting' ? door.room.kept : null
  const kept = index.rooms.filter((r) => r.party === party && r.id !== behindNewDoor)
  return [...own.filter((r) => r.party === party), ...kept].map((r) => ({ id: r.id, name: r.name }))
}

/** The request for a new room: the game's dice for this party, their level, their devices and how they played this visit, newest first. */
export function roomRequest(party: PartySize, level: Level, devices: readonly DeviceKind[], played: readonly PlayedBefore[], random: () => number): RoomRequest {
  if (devices.length !== party) throw new Error(`a party of ${party} sits at ${devices.length} devices`)
  return { party, roll: rollRoom(party, random), level, devices, played }
}

/** The line with a room the server just gave back put in (or put in place of its older self), so the door shows it before the server's word arrives. */
export function withRoom(h: HeardLine, room: LineRoom): HeardLine {
  const line = h.line
  const rooms = line.rooms.some((r) => r.line === room.line) ? line.rooms.map((r) => (r.line === room.line ? room : r)) : [...line.rooms, room]
  return { ...h, line: { ...line, rooms } }
}

/**
 * How full the bar is at `serverNowMs` (the server's clock), 0 to BAR_MOST, and the seconds until
 * it reaches BAR_MOST, over one wait's run of rooms (the door's run: rooms dropped in a row, then
 * the room in the making). Each room fills the rest of the way toward BAR_MOST over readySecs from
 * where the bar stood when it was asked, so the bar never goes back while children watch it.
 */
export function barAt(run: readonly LineRoom[], readySecs: number, serverNowMs: number): { fill: number; left: number } {
  if (run.length === 0) throw new Error('a bar needs the room it waits for')
  let fill = 0
  let left = readySecs
  run.forEach((room, i) => {
    const until = i + 1 < run.length ? Date.parse(run[i + 1]!.asked) : serverNowMs
    const secs = Math.max(0, (until - Date.parse(room.asked)) / 1000)
    fill += (BAR_MOST - fill) * Math.min(1, secs / readySecs)
    left = Math.max(0, readySecs - secs)
  })
  return { fill, left }
}
