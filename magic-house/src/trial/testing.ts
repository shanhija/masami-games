/**
 * Magic House: fixtures for the bots' tests: a walkthrough played in a room built from code, frame
 * by frame through the runner (trial/walk.ts), with what each frame fed the room kept; and a minute
 * of random play kept frame by frame, which shows a look never changes the play (engine/look.test.ts
 * on fixtures, own/rooms/rooms.test.ts on every own room with its own look).
 */

import type { Vec3 } from '../../../silly-billy/src/engine/types'

import type { Point, RoomCode } from '../engine/api'
import { buildRoom, RoomRuntime, stepRoom, type Room } from '../engine/room'
import { roomStart } from '../engine/testing'
import type { RoomView } from '../engine/world'
import type { FrameInput, PartySize, SeatIndex } from '../seats/types'
import type { WalkCode } from './api'
import { WalkRuntime } from './compile'
import { randomPresses } from './trial'
import { WalkRun } from './walk'

/** A walkthrough played: the room, the run, and every frame's input. */
export interface Walked {
  readonly room: Room
  readonly run: WalkRun
  readonly inputs: FrameInput[]
}

/**
 * Builds `code` for a party of this size together at level 1 on seed 7, and plays `walk` in it until
 * the walkthrough stops or ends, the room ends, or `secs` of play pass; `still` stands one bot still.
 */
export function walkIn(code: RoomCode, party: PartySize, walk: WalkCode, still: SeatIndex | null, secs: number): Walked {
  return walkInView(code, party, walk, still, secs, 'side')
}

/** walkIn in a room seen as `view` says: from high up the bots plan over the floor (trial/highSearch.ts). */
export function walkInView(code: RoomCode, party: PartySize, walk: WalkCode, still: SeatIndex | null, secs: number, view: RoomView): Walked {
  const room = buildRoom(code, { ...roomStart(party, 'together', 1, 7), view }, new RoomRuntime())
  const run = new WalkRun(room, walk, new WalkRuntime(), { still })
  const inputs: FrameInput[] = []
  while (run.state === 'playing' && room.world.end === null && room.world.t < secs) {
    const input = run.input()
    // The frame in which the walkthrough ends or stops is not its own.
    if (run.state !== 'playing') break
    inputs.push(input)
    stepRoom(room, input)
  }
  return { room, run, inputs }
}

/** A World as a string, its numbers exactly, Infinity and NaN too (JSON would make them null). */
export const worldState = (w: unknown) => JSON.stringify(w, (_k, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v))

/**
 * Plays a room for 60 s of random walking, pressing and tapping from the trial's own stream, with a
 * tap on a prop's foot every 45 frames besides, and gives back the World after each frame, as a string.
 */
export function sixtySeconds(room: Room, propsAt: readonly Vec3[]): string[] {
  const presses = randomPresses(room, 99)
  const frames: string[] = []
  for (let f = 0; f < 3600; f++) {
    const input = presses()
    const extra = f % 45 === 0 && propsAt.length > 0 ? [{ at: propsAt[(f / 45) % propsAt.length] as Point }] : []
    const fed: FrameInput = { ...input, pointing: { ...input.pointing, taps: [...input.pointing.taps, ...extra] } }
    stepRoom(room, fed)
    frames.push(worldState(room.world))
  }
  return frames
}
