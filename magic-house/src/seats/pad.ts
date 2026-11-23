/**
 * What every device's pad is made of, as plain numbers so vitest can hold it: a button that
 * never loses a press and never counts one twice, and the stick's maths for keys, a thumb on
 * the glass and a gamepad's stick. The devices themselves are in input.ts.
 */

import type { PadButton } from './types'

/**
 * One button of a pad between two frames. The device says down and up as they happen; the frame
 * reads it once. A press is remembered until the frame reads it, so a tap that goes down and up
 * between two frames still reads as pressed (held false), and a press is read by one frame only.
 */
export class Latch {
  private down = false
  private pressed = false

  /** The button went down. A repeat while it is already down (a key's auto-repeat, a second finger on it) is not a new press. */
  press(): void {
    if (this.down) return
    this.down = true
    this.pressed = true
  }

  release(): void {
    this.down = false
  }

  /** The button now, for this frame, and the press forgotten so the next frame does not see it again. */
  read(): PadButton {
    const now = { held: this.down, pressed: this.pressed }
    this.pressed = false
    return now
  }

  /** The button now without using up its press: for a readout that must not steal the frame's. */
  peek(): PadButton {
    return { held: this.down, pressed: this.pressed }
  }
}

/** A direction key of a stick. */
export type Dir = 'up' | 'down' | 'left' | 'right'

/**
 * A stick of four keys, from the keys held in the order they went down. Each axis is -1, 0 or 1;
 * with both keys of an axis held, the one pressed last wins, so a child who presses right while
 * still on left goes right at once instead of stopping.
 */
export function keysStick(held: readonly Dir[]): [number, number] {
  let x = 0
  let y = 0
  for (const dir of held) {
    if (dir === 'left') x = -1
    else if (dir === 'right') x = 1
    else if (dir === 'up') y = 1
    else y = -1
  }
  return [x, y]
}

/** How far from the middle a stick must go before it counts, as a share of its whole reach: a thumb resting on the glass or a gamepad's worn stick never creeps. */
export const DEAD_ZONE = { thumb: 0.15, gamepad: 0.2 } as const

/**
 * A stick's raw push (x right, y up, any length) as the sim reads it: inside the dead zone it is
 * [0, 0]; outside, its length is rescaled so it starts from 0 at the dead zone's edge and is 1 at
 * full reach and beyond, keeping its direction. This is a round dead zone, so a diagonal push is
 * as easy as a straight one.
 */
export function deadZone(x: number, y: number, dead: number): [number, number] {
  const length = Math.hypot(x, y)
  if (length <= dead) return [0, 0]
  const scaled = Math.min(1, (length - dead) / (1 - dead))
  return [(x / length) * scaled, (y / length) * scaled]
}

/**
 * A thumb on a touch pad's stick: where it went down and where it is now, in screen pixels (y
 * down), and how far the stick reaches. The screen's down is the room's down, so y turns over.
 */
export function thumbStick(from: { x: number; y: number }, now: { x: number; y: number }, reach: number): [number, number] {
  return deadZone((now.x - from.x) / reach, (from.y - now.y) / reach, DEAD_ZONE.thumb)
}

/**
 * A gamepad's stick: its left stick's two axes (y down, as the Gamepad API gives them) and its
 * d-pad. The d-pad, when held, wins over the stick on its axis.
 */
export function gamepadStick(axisX: number, axisY: number, pad: { up: boolean; down: boolean; left: boolean; right: boolean }): [number, number] {
  const [sx, sy] = deadZone(axisX, 0 - axisY, DEAD_ZONE.gamepad)
  const dx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0)
  const dy = (pad.up ? 1 : 0) - (pad.down ? 1 : 0)
  return [dx !== 0 ? dx : sx, dy !== 0 ? dy : sy]
}
