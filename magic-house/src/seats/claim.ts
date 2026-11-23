/**
 * Claiming a seat (plan.md, The engine and the seats): a player takes a seat by pressing on a
 * device nobody sits at. The seat's index is the next free one and its colour is that index's
 * (SEAT_COLORS). Pure, so the rules are tested without a keyboard.
 */

import { SEAT_COLORS, type Device, type KeptDevice, type Seat, type SeatIndex } from './types'

/** Whether two devices are the same one. */
export function sameDevice(a: Device, b: Device): boolean {
  switch (a.kind) {
    case 'keys':
      return b.kind === 'keys' && a.zone === b.zone
    case 'touch':
      return b.kind === 'touch' && a.pad === b.pad
    case 'gamepad':
      return b.kind === 'gamepad' && a.index === b.index
  }
}

/** The most seats a party has. */
export const MOST_SEATS = 4

/**
 * The party with one more seat: `profile` sits at `device`. Null when it cannot: the party is full,
 * someone sits at that device already, or that player is seated already (a player has one seat).
 */
export function claimSeat(seats: readonly Seat[], device: Device, profile: string | null): Seat[] | null {
  if (seats.length >= MOST_SEATS) return null
  if (seats.some((s) => sameDevice(s.device, device))) return null
  if (profile !== null && seats.some((s) => s.profile === profile)) return null
  const index = seats.length as SeatIndex
  return [...seats, { index, device, profile, color: SEAT_COLORS[index] }]
}

/** The party without one seat; those after it move up one place and take that place's colour, so the indices stay 0, 1, 2 in a row. */
export function leaveSeat(seats: readonly Seat[], index: SeatIndex): Seat[] {
  return seats.filter((s) => s.index !== index).map((s, i) => ({ ...s, index: i as SeatIndex, color: SEAT_COLORS[i as SeatIndex] }))
}

/** A device as a player's saves keep it: a gamepad only by its kind (saves.ts). */
export function keptDevice(device: Device): KeptDevice {
  return device.kind === 'gamepad' ? { kind: 'gamepad' } : device
}

/** Whether a device is the one a player's saves keep: the same keys or touch pad, or any gamepad for one kept as a gamepad. */
export function isKept(kept: KeptDevice, device: Device): boolean {
  return kept.kind === 'gamepad' ? device.kind === 'gamepad' : sameDevice(kept, device)
}

/**
 * Who sits down at a press on a device nobody sits at (plan.md, A seat is a device: their saves
 * remember it, and it is offered first): the first player not seated yet whose saves keep this
 * device, else `next`, the face that breathes. `kept` is each player's kept device, in the order
 * of `players`; the answer is an index into them, or -1 for nobody.
 */
export function whoSits(players: readonly (string | null)[], kept: readonly (KeptDevice | null)[], seats: readonly Seat[], device: Device, next: number): number {
  const free = (i: number) => !seats.some((s) => s.profile === players[i])
  const owner = kept.findIndex((k, i) => k !== null && free(i) && isKept(k, device))
  return owner >= 0 ? owner : next
}
