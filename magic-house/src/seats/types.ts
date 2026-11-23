/**
 * Magic House: the seats and pointing as the sim reads them: types only (plan.md, The contract, in
 * outline); the devices behind them are in input.ts, keys.ts and TouchPad.tsx.
 *
 * A seat is a device a child claims by pressing on it (plan.md, The engine and the seats). Whatever
 * the device, the sim sees the same thing for each seat every frame: a stick and two buttons (Pad).
 * Pointing (a tap or a click, a finger or the mouse held down) is the room's, not a seat's: it comes
 * from anyone, with no player attached, and every device has it. The bots feed the very same two
 * shapes (trial/api.ts), so a bot can do nothing a child cannot, and a frame's input (FrameInput) is
 * all a replay needs besides the room and its seed.
 *
 * "Frame" is 1/60 s, as in engine/api.ts; a step is only one of the room's list.
 */

import type { Point } from '../engine/api'

/** Where a seat sits in the party: 0 for the first seated, and so on. It is the player's index in w.players() and the bot's in bots. */
export type SeatIndex = 0 | 1 | 2 | 3
/** How many play: a room is made for exactly one party size (plan.md, A room is made for one party size). */
export type PartySize = 1 | 2 | 3 | 4

/** One button of a pad, as the sim reads it in one frame. */
export interface PadButton {
  /** Held down now, at the frame's start. */
  readonly held: boolean
  /** Pressed since the frame before, even when it was let go again within the frame: a quick tap on a touch pad is never lost. A press and a release in one frame give pressed true and held false, and the sim runs press, then release. */
  readonly pressed: boolean
}

/** A seat's pad, as the sim reads it each frame, whatever the device behind it. */
export interface Pad {
  /** x and y, each -1 to 1: +x to the right, +y up. Keys give -1, 0 or 1 on each; a touch pad and a gamepad anything between, with the dead zone already taken out. [0, 0] when let go. */
  readonly stick: readonly [number, number]
  readonly a: PadButton
  readonly b: PadButton
}

/** A pad with nothing held or pressed: a seat that is asleep, a still bot. */
export const STILL_PAD: Pad = { stick: [0, 0], a: { held: false, pressed: false }, b: { held: false, pressed: false } }

/** Which of the keyboard's four zones of keys: each a stick of four keys and two buttons beside it. Step 2 writes the keys; three or four zones on one keyboard meet its limit on keys held at once, which is why gamepads are the way to a full party. */
export type KeyZone = 0 | 1 | 2 | 3
/** Which of the two pads on the touch screen: 0 at the bottom left, 1 at the bottom right. A screen with only touch seats two. */
export type TouchPad = 0 | 1

/** What a seat is. A player claims one by pressing on it, and their saves remember it (saves.ts). */
export type Device =
  | { readonly kind: 'keys'; readonly zone: KeyZone }
  | { readonly kind: 'touch'; readonly pad: TouchPad }
  /** The browser's gamepad index (navigator.getGamepads()), which holds while the pad stays plugged in. */
  | { readonly kind: 'gamepad'; readonly index: number }

export type DeviceKind = Device['kind']

/** A device as a player's saves remember it: a gamepad only by its kind, since its index does not hold from one visit to the next (the next free gamepad is offered). */
export type KeptDevice = Exclude<Device, { readonly kind: 'gamepad' }> | { readonly kind: 'gamepad' }

/** A seat in the party: who sits in it, by what device, and its colour. */
export interface Seat {
  readonly index: SeatIndex
  readonly device: Device
  /** The player's profile id (profiles/src/profiles.ts): the HUD's face, and whose saves a result goes to. Null only for the picked player where the browser keeps no site data (enterGame gives no profile then), whose saves are that visit's memorySaves(). The sim never reads it. */
  readonly profile: string | null
  readonly color: string
}

/**
 * Each seat's colour, by its index: shown over its player and on its pad, and free for a room to use
 * (p.color()). Far apart in hue and in lightness, so they tell apart side by side and to a child who
 * does not see red from green.
 */
export const SEAT_COLORS: Readonly<Record<SeatIndex, string>> = { 0: '#ff5a4e', 1: '#3d8bff', 2: '#ffd23a', 3: '#2fc46a' }

/** A tap or a click, from anyone. The room is never told who. */
export interface Tap {
  /** Where it landed in the room, metres: from the side on z = 0, the page turning the screen's point into the room's by the camera's frame (world.ts Camera), which the sim computes; from high up where the line from the eye through the finger first meets something drawn, else the ground plane at the box's bottom (scene/RoomStage.tsx pointAt). The sim then finds the handle under it nearest the viewer that has a tap of its own (from high up, the highest within TAP_NEAR of the point: engine/floor.ts tapTargetFloor), else r.tap takes it (engine/api.ts SHARED_OPTS_REF). A tap on a thing is a tap whose point falls on it. */
  readonly at: Point
}

/** Pointing in one frame, from anyone and every device: the mouse, fingers on the screen outside the pads, or the bots' w.tap and w.point. */
export interface Pointing {
  /** The taps and clicks since the frame before, in the order they came. */
  readonly taps: readonly Tap[]
  /** Where a finger or the mouse is held down now, each a point in the room found as a tap's is (on z = 0 from the side, on what is under it from high up): what w.pointers() gives. A finger on a pad is the pad's, never here. */
  readonly held: readonly Point[]
}

/** Nothing pointed at. */
export const NO_POINTING: Pointing = { taps: [], held: [] }

/** Everything the sim reads from outside in one frame: each seat's pad in seat order (one for each player), pointing, and the helper's ? button. */
export interface FrameInput {
  readonly pads: readonly Pad[]
  readonly pointing: Pointing
  /** The ? button was pressed since the frame before: the helper comes at once, read in the referee's phase (engine/api.ts FRAME_ORDER). From anyone, as pointing is. */
  readonly help: boolean
}
