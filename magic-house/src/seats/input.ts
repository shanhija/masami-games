/**
 * Every device of the seats, gathered once per sim frame into what the sim reads (FrameInput):
 * the keyboard's four zones (keys.ts), the two touch pads (TouchPad.tsx feeds them here), the
 * gamepads (polled, as the Gamepad API wants), and pointing from anyone on the room's surface.
 * Presses are latched (pad.ts Latch), so a press between two frames is never lost and never
 * counted twice. Every press on a device is also offered as a claim (takeClaims), which the
 * shell turns into a seat with claim.ts.
 */

import type { Point } from '../engine/api'
import { zoneKey } from './keys'
import { gamepadStick, keysStick, Latch, thumbStick, type Dir } from './pad'
import { sameDevice } from './claim'
import { STILL_PAD, type Device, type FrameInput, type KeyZone, type Pad, type TouchPad } from './types'

/** The scene's way from a point on the screen (clientX, clientY) to the point in the room under it, by the camera of this frame (scene/RoomStage.tsx pointAt: on z = 0 from the side, on what is drawn there from high up). The handle under it is the sim's to find (types.ts Tap). */
export type ScreenToRoom = (clientX: number, clientY: number) => Point

/** A pad's button. */
export type PadPart = 'a' | 'b'

/** Gamepad buttons in the standard mapping: the bottom face button is a, the right one b, then the d-pad; Start pauses, and Select (Back) or the top face button (Y) calls the helper, as the HUD's ? does. A room sees only a and b, so these never reach it. */
const GAMEPAD = { a: 0, b: 1, help: 3, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const

/** Any element inside one marked with this attribute (the HUD's buttons, the touch pads) is never pointing. */
export const NO_POINT = 'data-no-point'

interface KeysState {
  /** The stick's keys held, in the order they went down. */
  held: Dir[]
  a: Latch
  b: Latch
}

interface TouchState {
  /** The finger on the stick, where it went down and where it is, and the stick's reach in pixels; null when none. */
  thumb: { id: number; from: { x: number; y: number }; now: { x: number; y: number }; reach: number } | null
  /** The fingers on each button: it is down while any is. */
  fingers: Record<PadPart, Set<number>>
  a: Latch
  b: Latch
}

interface GamepadState {
  stick: [number, number]
  a: Latch
  b: Latch
  /** Every button's state at the last poll, for a claim on any button's press. */
  was: boolean[]
}

const keysState = (): KeysState => ({ held: [], a: new Latch(), b: new Latch() })
const touchState = (): TouchState => ({ thumb: null, fingers: { a: new Set(), b: new Set() }, a: new Latch(), b: new Latch() })

export class SeatInput {
  private keys: Record<KeyZone, KeysState> = { 0: keysState(), 1: keysState(), 2: keysState(), 3: keysState() }
  private touch: Record<TouchPad, TouchState> = { 0: touchState(), 1: touchState() }
  private gamepads = new Map<number, GamepadState>()
  /** Taps and clicks since the last frame, as screen points, in the order they came. */
  private taps: { x: number; y: number }[] = []
  /** Where each finger or the held mouse is on the surface now, by pointer id. */
  private pointers = new Map<number, { x: number; y: number }>()
  private toRoom: ScreenToRoom | null = null
  private help = false
  /** A gamepad's Start was pressed since the last takePause. */
  private pause = false
  /** Devices pressed on since the last takeClaims, each once, in the order they were pressed. */
  private pressed: Device[] = []

  /** Listens to the keyboard (and lets go of everything when the window loses focus or hides) until the function it gives back is called. */
  start(): () => void {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = zoneKey(e.code)
      if (key === null) return
      // Arrows would scroll, Enter would press the focused button.
      e.preventDefault()
      if (e.repeat) return
      this.keyDown(key.zone, key.part)
    }
    const up = (e: KeyboardEvent) => {
      const key = zoneKey(e.code)
      if (key !== null) this.keyUp(key.zone, key.part)
    }
    const letGo = () => this.letGo()
    const hidden = () => {
      if (document.visibilityState === 'hidden') this.letGo()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', letGo)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', letGo)
      document.removeEventListener('visibilitychange', hidden)
    }
  }

  /** A zone's key went down: a key the stick already holds, or a button already down, is not pressed again. */
  keyDown(zone: KeyZone, part: Dir | PadPart): void {
    const state = this.keys[zone]
    if (part === 'a' || part === 'b') state[part].press()
    else if (!state.held.includes(part)) state.held.push(part)
    this.offer({ kind: 'keys', zone })
  }

  keyUp(zone: KeyZone, part: Dir | PadPart): void {
    const state = this.keys[zone]
    if (part === 'a' || part === 'b') state[part].release()
    else state.held = state.held.filter((d) => d !== part)
  }

  /**
   * Pointing on the room's surface (the scene's element) until the function it gives back is
   * called: a press of a finger or the mouse's main button is a tap where it lands, and where it
   * is held is held, all turned into the room's points by `toRoom` when the frame is gathered.
   * Presses inside an element marked NO_POINT (the HUD, the pads) are not pointing.
   */
  point(surface: HTMLElement, toRoom: ScreenToRoom): () => void {
    this.toRoom = toRoom
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target instanceof Element && e.target.closest(`[${NO_POINT}]`) !== null) return
      surface.setPointerCapture(e.pointerId)
      this.taps.push({ x: e.clientX, y: e.clientY })
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const move = (e: PointerEvent) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
    }
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', up)
    surface.addEventListener('lostpointercapture', up)
    return () => {
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerup', up)
      surface.removeEventListener('pointercancel', up)
      surface.removeEventListener('lostpointercapture', up)
      this.toRoom = null
      this.taps = []
      this.pointers.clear()
    }
  }

  /** A finger went down on a touch pad's stick, at a screen point, with the stick's reach in pixels. The first finger owns the stick until it lifts; it is the middle the stick is pushed from. */
  thumbDown(pad: TouchPad, id: number, x: number, y: number, reach: number): void {
    const state = this.touch[pad]
    if (state.thumb === null) state.thumb = { id, from: { x, y }, now: { x, y }, reach }
    this.offer({ kind: 'touch', pad })
  }

  thumbMove(pad: TouchPad, id: number, x: number, y: number): void {
    const thumb = this.touch[pad].thumb
    if (thumb !== null && thumb.id === id) thumb.now = { x, y }
  }

  thumbUp(pad: TouchPad, id: number): void {
    const state = this.touch[pad]
    if (state.thumb !== null && state.thumb.id === id) state.thumb = null
  }

  /** The stick's thumb on a pad, for drawing it: where it went down and where it is; null when none. */
  thumbOf(pad: TouchPad): { from: { x: number; y: number }; now: { x: number; y: number } } | null {
    return this.touch[pad].thumb
  }

  /** A finger went down on a touch pad's button. */
  buttonDown(pad: TouchPad, part: PadPart, id: number): void {
    const state = this.touch[pad]
    state.fingers[part].add(id)
    state[part].press()
    this.offer({ kind: 'touch', pad })
  }

  buttonUp(pad: TouchPad, part: PadPart, id: number): void {
    const state = this.touch[pad]
    if (state.fingers[part].delete(id) && state.fingers[part].size === 0) state[part].release()
  }

  /** The ? button was pressed: the helper comes in the next frame (FrameInput.help). */
  pressHelp(): void {
    this.help = true
  }

  /** Reads every gamepad now: its stick, its two buttons and a claim when any button went down. Each frame does this, and so does takeClaims; polling more often only catches more. */
  poll(): void {
    const pads = navigator.getGamepads()
    const seen = new Set<number>()
    for (const gamepad of pads) {
      if (gamepad === null) continue
      seen.add(gamepad.index)
      let state = this.gamepads.get(gamepad.index)
      if (state === undefined) {
        state = { stick: [0, 0], a: new Latch(), b: new Latch(), was: [] }
        this.gamepads.set(gamepad.index, state)
      }
      const held = gamepad.buttons.map((b) => b.pressed)
      const on = (i: number) => held[i] === true
      if (on(GAMEPAD.a)) state.a.press()
      else state.a.release()
      if (on(GAMEPAD.b)) state.b.press()
      else state.b.release()
      state.stick = gamepadStick(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0, { up: on(GAMEPAD.up), down: on(GAMEPAD.down), left: on(GAMEPAD.left), right: on(GAMEPAD.right) })
      const went = (i: number) => on(i) && state.was[i] !== true
      if (went(GAMEPAD.start)) this.pause = true
      if (went(GAMEPAD.help) || went(GAMEPAD.select)) this.help = true
      if (held.some((h, i) => h && state.was[i] !== true)) this.offer({ kind: 'gamepad', index: gamepad.index })
      state.was = held
    }
    // A gamepad unplugged lets go of everything.
    for (const [index, state] of this.gamepads)
      if (!seen.has(index)) {
        state.a.release()
        state.b.release()
        state.stick = [0, 0]
        state.was = []
      }
  }

  /** Whether any gamepad's Start was pressed since the last call: the room's pause card opens or closes on it, as on Escape. Seated or not, so a gamepad party is never trapped. */
  takePause(): boolean {
    this.poll()
    const pressed = this.pause
    this.pause = false
    return pressed
  }

  /** The gamepads plugged in now, by their index. */
  gamepadIndices(): number[] {
    return navigator
      .getGamepads()
      .filter((g) => g !== null)
      .map((g) => g.index)
  }

  /** The devices pressed on since the last call, each once, oldest first: the shell seats a player at each one nobody sits at (claim.ts claimSeat). Called once as players start to join, it drops the presses from before. */
  takeClaims(): Device[] {
    this.poll()
    const claims = this.pressed
    this.pressed = []
    return claims
  }

  /**
   * The frame's input for the seated devices, in seat order: each one's pad with its presses used
   * up, the taps since the last frame and where pointers are held, turned into the room's points,
   * and the ? button. Called once per sim frame.
   */
  frame(devices: readonly Device[]): FrameInput {
    this.poll()
    const toRoom = this.toRoom
    const pads = devices.map((d) => this.read(d))
    const room = (p: { x: number; y: number }) => {
      if (toRoom === null) throw new Error('pointing without a surface: point() was not called')
      return toRoom(p.x, p.y)
    }
    const input: FrameInput = {
      pads,
      pointing: { taps: this.taps.map((p) => ({ at: room(p) })), held: [...this.pointers.values()].map(room) },
      help: this.help,
    }
    this.taps = []
    this.help = false
    return input
  }

  /** One device's pad now, its presses used up. */
  private read(device: Device): Pad {
    switch (device.kind) {
      case 'keys': {
        const state = this.keys[device.zone]
        return { stick: keysStick(state.held), a: state.a.read(), b: state.b.read() }
      }
      case 'touch': {
        const state = this.touch[device.pad]
        const thumb = state.thumb
        return { stick: thumb === null ? [0, 0] : thumbStick(thumb.from, thumb.now, thumb.reach), a: state.a.read(), b: state.b.read() }
      }
      case 'gamepad': {
        const state = this.gamepads.get(device.index)
        // A seated gamepad that is not plugged in (yet) reads as let go.
        if (state === undefined) return STILL_PAD
        return { stick: state.stick, a: state.a.read(), b: state.b.read() }
      }
    }
  }

  private offer(device: Device): void {
    if (!this.pressed.some((d) => sameDevice(d, device))) this.pressed.push(device)
  }

  /** Lets go of every key, pad and pointer: the window lost focus, so their releases would never come. Presses not yet read stay for the next frame. */
  private letGo(): void {
    for (const state of Object.values(this.keys)) {
      state.held = []
      state.a.release()
      state.b.release()
    }
    for (const state of Object.values(this.touch)) {
      state.thumb = null
      state.fingers.a.clear()
      state.fingers.b.clear()
      state.a.release()
      state.b.release()
    }
    this.pointers.clear()
  }
}
