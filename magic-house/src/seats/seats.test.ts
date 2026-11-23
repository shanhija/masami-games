import { afterEach, describe, expect, it, vi } from 'vitest'

import { claimSeat, keptDevice, leaveSeat, sameDevice } from './claim'
import { SeatInput } from './input'
import { KEY_PARTS, KEY_ZONE_LIST, KEY_ZONES, keyLabel, zoneKey } from './keys'
import { deadZone, gamepadStick, keysStick, Latch, thumbStick } from './pad'
import { SEAT_COLORS, type Device } from './types'

describe('the key zones', () => {
  it('give every key one zone and one job, and every code a label', () => {
    const codes = KEY_ZONE_LIST.flatMap((zone) => KEY_PARTS.map((part) => KEY_ZONES[zone][part]))
    expect(new Set(codes).size).toBe(codes.length)
    for (const zone of KEY_ZONE_LIST)
      for (const part of KEY_PARTS) {
        expect(zoneKey(KEY_ZONES[zone][part])).toEqual({ zone, part })
        expect(keyLabel(KEY_ZONES[zone][part]).length).toBeGreaterThan(0)
      }
    expect(zoneKey('Space')).toBeNull()
  })

  it('use no modifier a child could turn into a browser shortcut', () => {
    for (const zone of KEY_ZONE_LIST) for (const part of KEY_PARTS) expect(KEY_ZONES[zone][part]).not.toMatch(/Control|Alt|Meta|OS/)
  })

  it('label letters, arrows and the number pad as printed', () => {
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keyLabel('Numpad8')).toBe('8')
    expect(keyLabel('NumpadAdd')).toBe('+')
  })
})

describe('a latched button', () => {
  it('reads a press once, while held after it', () => {
    const b = new Latch()
    b.press()
    expect(b.read()).toEqual({ held: true, pressed: true })
    expect(b.read()).toEqual({ held: true, pressed: false })
    b.release()
    expect(b.read()).toEqual({ held: false, pressed: false })
  })

  it('never loses a tap between two frames', () => {
    const b = new Latch()
    b.press()
    b.release()
    expect(b.read()).toEqual({ held: false, pressed: true })
    expect(b.read()).toEqual({ held: false, pressed: false })
  })

  it('counts a repeat while held as no new press, and two taps in one frame as one', () => {
    const b = new Latch()
    b.press()
    b.read()
    b.press()
    expect(b.read().pressed).toBe(false)
    b.release()
    b.press()
    b.release()
    b.press()
    expect(b.read()).toEqual({ held: true, pressed: true })
    expect(b.read().pressed).toBe(false)
  })

  it('peeks without using up the press', () => {
    const b = new Latch()
    b.press()
    expect(b.peek().pressed).toBe(true)
    expect(b.read().pressed).toBe(true)
  })
})

describe('the stick', () => {
  it('of keys goes by the last key of an axis pressed', () => {
    expect(keysStick([])).toEqual([0, 0])
    expect(keysStick(['left'])).toEqual([-1, 0])
    expect(keysStick(['left', 'right'])).toEqual([1, 0])
    expect(keysStick(['right', 'left', 'up'])).toEqual([-1, 1])
    expect(keysStick(['down'])).toEqual([0, -1])
  })

  it('has a round dead zone and reaches 1 at full push', () => {
    expect(deadZone(0.1, 0.1, 0.2)).toEqual([0, 0])
    expect(deadZone(1, 0, 0.2)).toEqual([1, 0])
    expect(deadZone(3, 0, 0.2)).toEqual([1, 0])
    const [x, y] = deadZone(0.6, 0, 0.2)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBe(0)
    const [dx, dy] = deadZone(Math.SQRT1_2, Math.SQRT1_2, 0.2)
    expect(Math.hypot(dx, dy)).toBeCloseTo(1)
  })

  it('of a thumb turns the screen y over and measures by its reach', () => {
    expect(thumbStick({ x: 100, y: 100 }, { x: 100, y: 40 }, 60)).toEqual([0, 1])
    expect(thumbStick({ x: 100, y: 100 }, { x: 40, y: 100 }, 60)).toEqual([-1, 0])
    expect(thumbStick({ x: 100, y: 100 }, { x: 103, y: 101 }, 60)).toEqual([0, 0])
  })

  it('of a gamepad turns its y over, and its d-pad wins on its axis', () => {
    expect(gamepadStick(0, -1, { up: false, down: false, left: false, right: false })).toEqual([0, 1])
    expect(gamepadStick(0.1, 0.1, { up: false, down: false, left: false, right: false })).toEqual([0, 0])
    expect(gamepadStick(1, 0, { up: false, down: false, left: true, right: false })).toEqual([-1, 0])
    expect(gamepadStick(0, 0, { up: true, down: false, left: false, right: false })).toEqual([0, 1])
  })
})

describe('claiming a seat', () => {
  const zone0: Device = { kind: 'keys', zone: 0 }
  const pad1: Device = { kind: 'touch', pad: 1 }

  it('gives the next index and its colour', () => {
    const one = claimSeat([], zone0, 'a')!
    const two = claimSeat(one, pad1, 'b')!
    expect(two.map((s) => [s.index, s.color])).toEqual([
      [0, SEAT_COLORS[0]],
      [1, SEAT_COLORS[1]],
    ])
  })

  it('refuses a device someone sits at, a player seated already and a fifth seat', () => {
    const one = claimSeat([], zone0, 'a')!
    expect(claimSeat(one, { kind: 'keys', zone: 0 }, 'b')).toBeNull()
    expect(claimSeat(one, pad1, 'a')).toBeNull()
    let four = one
    for (const [i, d] of ([{ kind: 'keys', zone: 1 }, { kind: 'gamepad', index: 0 }, pad1] as Device[]).entries()) four = claimSeat(four, d, `p${i}`)!
    expect(four).toHaveLength(4)
    expect(claimSeat(four, { kind: 'keys', zone: 3 }, 'z')).toBeNull()
  })

  it('lets two players with no profile sit, and moves the seats after a leaver up', () => {
    const two = claimSeat(claimSeat([], zone0, null)!, pad1, null)!
    expect(two).toHaveLength(2)
    const left = leaveSeat(two, 0)
    expect(left).toEqual([{ index: 0, device: pad1, profile: null, color: SEAT_COLORS[0] }])
  })

  it('tells devices apart and keeps a gamepad only by its kind', () => {
    expect(sameDevice({ kind: 'gamepad', index: 1 }, { kind: 'gamepad', index: 1 })).toBe(true)
    expect(sameDevice({ kind: 'gamepad', index: 1 }, { kind: 'gamepad', index: 2 })).toBe(false)
    expect(sameDevice(zone0, { kind: 'touch', pad: 0 })).toBe(false)
    expect(keptDevice({ kind: 'gamepad', index: 3 })).toEqual({ kind: 'gamepad' })
    expect(keptDevice(pad1)).toEqual(pad1)
  })
})

describe('the seats input', () => {
  /** A gamepad as the Gamepad API gives it, its buttons held or not. */
  let gamepads: ({ index: number; buttons: { pressed: boolean }[]; axes: number[] } | null)[] = []
  vi.stubGlobal('navigator', { getGamepads: () => gamepads })
  afterEach(() => {
    gamepads = []
  })
  const buttons = (held: number[]) => Array.from({ length: 16 }, (_, i) => ({ pressed: held.includes(i) }))

  it('gathers each seat in seat order, a press read by one frame only', () => {
    const input = new SeatInput()
    const seats: Device[] = [{ kind: 'keys', zone: 1 }, { kind: 'keys', zone: 0 }]
    input.keyDown(0, 'right')
    input.keyDown(0, 'a')
    input.keyUp(0, 'a')
    input.keyDown(1, 'up')
    const first = input.frame(seats)
    expect(first.pads[0].stick).toEqual([0, 1])
    expect(first.pads[1]).toEqual({ stick: [1, 0], a: { held: false, pressed: true }, b: { held: false, pressed: false } })
    const second = input.frame(seats)
    expect(second.pads[1].a).toEqual({ held: false, pressed: false })
    expect(second.pads[1].stick).toEqual([1, 0])
  })

  it('reads a touch pad: the thumb from where it landed, and a quick tap on a button', () => {
    const input = new SeatInput()
    const pad: Device = { kind: 'touch', pad: 0 }
    input.thumbDown(0, 7, 100, 100, 50)
    input.thumbMove(0, 7, 150, 100)
    // A second finger on the stick side does not take it over.
    input.thumbDown(0, 8, 0, 0, 50)
    input.buttonDown(0, 'b', 9)
    input.buttonDown(0, 'b', 10)
    input.buttonUp(0, 'b', 9)
    const frame = input.frame([pad])
    expect(frame.pads[0].stick).toEqual([1, 0])
    expect(frame.pads[0].b).toEqual({ held: true, pressed: true })
    input.buttonUp(0, 'b', 10)
    input.thumbUp(0, 7)
    expect(input.frame([pad]).pads[0]).toEqual({ stick: [0, 0], a: { held: false, pressed: false }, b: { held: false, pressed: false } })
  })

  it('reads a gamepad by polling, and a seated one unplugged as let go', () => {
    const input = new SeatInput()
    const pad: Device = { kind: 'gamepad', index: 2 }
    expect(input.frame([pad]).pads[0].a.held).toBe(false)
    gamepads = [null, null, { index: 2, buttons: buttons([0, 15]), axes: [0, 0] }]
    expect(input.frame([pad]).pads[0]).toEqual({ stick: [1, 0], a: { held: true, pressed: true }, b: { held: false, pressed: false } })
    expect(input.frame([pad]).pads[0].a).toEqual({ held: true, pressed: false })
    gamepads = []
    expect(input.frame([pad]).pads[0].a).toEqual({ held: false, pressed: false })
  })

  it('offers each device pressed on as a claim once, in order', () => {
    const input = new SeatInput()
    input.keyDown(2, 'left')
    input.buttonDown(1, 'a', 1)
    input.keyDown(2, 'a')
    gamepads = [{ index: 0, buttons: buttons([3]), axes: [0, 0] }]
    expect(input.takeClaims()).toEqual([{ kind: 'keys', zone: 2 }, { kind: 'touch', pad: 1 }, { kind: 'gamepad', index: 0 }])
    // Still held: no new claim.
    expect(input.takeClaims()).toEqual([])
  })

  it('passes the ? press to one frame', () => {
    const input = new SeatInput()
    input.pressHelp()
    expect(input.frame([]).help).toBe(true)
    expect(input.frame([]).help).toBe(false)
  })
})
