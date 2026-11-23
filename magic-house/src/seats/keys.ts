/**
 * The keyboard's four zones of keys (plan.md, The engine and the seats): each a stick of four keys
 * and two buttons, by the key's place on the keyboard (KeyboardEvent.code), not its letter, so the
 * zones sit where they sit on a Finnish keyboard as on an English one.
 *
 * Laid out left to right so four children fit round one full keyboard, each child's two hands
 * side by side and nobody's hands across another's:
 *
 *   zone 0  stick W A S D (left hand), buttons V and B below and to its right (right hand)
 *   zone 1  stick I J K L (right hand), buttons N and M below and to its left (left hand)
 *   zone 2  the arrows (right hand), buttons Enter and right Shift just to their left (left hand)
 *   zone 3  the number pad's 8 4 5 6 (left hand), buttons its Enter and + (right hand)
 *
 * Why these: a cheap keyboard reads keys through a grid of wires and cannot tell some three-key
 * chords apart (ghosting), worst inside the letter block. The arrows and the number pad sit on
 * wires of their own on common keyboards, so zones 2 and 3 rarely ghost against the letters, and
 * zones 0 and 1 keep to the corners of the letter block, far apart. No zone uses Ctrl, Alt or the
 * system key: a child holding Ctrl while another presses W would close the tab. Two or three on a
 * keyboard play well; a full party is for gamepads (plan.md). A laptop has no number pad, so there
 * zone 3 is missing and three can share it.
 */

import type { Dir } from './pad'
import type { KeyZone } from './types'

/** What a key does in its zone: one of the stick's directions, or button a or b. */
export type KeyPart = Dir | 'a' | 'b'

/** Each zone's keys by KeyboardEvent.code. */
export const KEY_ZONES: Readonly<Record<KeyZone, Readonly<Record<KeyPart, string>>>> = {
  0: { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', a: 'KeyV', b: 'KeyB' },
  1: { up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL', a: 'KeyN', b: 'KeyM' },
  2: { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight', a: 'Enter', b: 'ShiftRight' },
  3: { up: 'Numpad8', left: 'Numpad4', down: 'Numpad5', right: 'Numpad6', a: 'NumpadEnter', b: 'NumpadAdd' },
}

export const KEY_ZONE_LIST: readonly KeyZone[] = [0, 1, 2, 3]
export const KEY_PARTS: readonly KeyPart[] = ['up', 'left', 'down', 'right', 'a', 'b']

/** Every zone key by its code: which zone, and what it does there. */
const BY_CODE: ReadonlyMap<string, { zone: KeyZone; part: KeyPart }> = new Map(
  KEY_ZONE_LIST.flatMap((zone) => KEY_PARTS.map((part) => [KEY_ZONES[zone][part], { zone, part }] as const)),
)

/** The zone and the job of a key, or null for a key no zone uses. */
export function zoneKey(code: string): { zone: KeyZone; part: KeyPart } | null {
  return BY_CODE.get(code) ?? null
}

/** What is printed on a zone's key, as the legend shows it: the letter, the digit or a sign. Shown as a picture of the key, never as a word. */
export function keyLabel(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter !== null) return letter[1]
  const digit = /^Numpad(\d)$/.exec(code)
  if (digit !== null) return digit[1]
  switch (code) {
    case 'ArrowUp':
      return '↑'
    case 'ArrowDown':
      return '↓'
    case 'ArrowLeft':
      return '←'
    case 'ArrowRight':
      return '→'
    case 'Enter':
    case 'NumpadEnter':
      return '↵'
    case 'ShiftRight':
      return '⇧'
    case 'NumpadAdd':
      return '+'
  }
  throw new Error(`no label for the key ${code}`)
}
