/**
 * ?autoplay (plan.md, Layout): a room on the page played by its own walkthrough, its seats fed by
 * the walk runner (trial/walk.ts) instead of the devices, through the same FrameInput the devices
 * give, with the scene, the HUD and the sounds as in any play. `?autoplay=devices` runs the bots
 * beside the devices instead: the room steps on the devices' input and the bots' pads are only
 * shown, on the debug handle (window.magicHouse.bots), so a headless script can turn them into real
 * key presses and touches and play the room through the real input path, closed loop.
 *
 * Plain numbers and data, so vitest runs it. The walkthrough is played on a WalkRuntime of its own
 * (its turn budget each frame and its seeded Math), exactly as the trial plays it.
 */

import type { Room } from '../engine/room'
import type { WalkCode } from '../trial/api'
import { WalkRuntime } from '../trial/compile'
import { WalkRun, type WalkState } from '../trial/walk'
import type { FrameInput } from '../seats/types'

/** Who steps the room: the bots, or the devices with the bots only shown. */
export type AutoplayMode = 'bots' | 'devices'

/** The mode a URL asks for: no ?autoplay is null, a bare ?autoplay the bots, ?autoplay=devices the devices. */
export function autoplayFromUrl(query: URLSearchParams): AutoplayMode | null {
  const value = query.get('autoplay')
  if (value === null) return null
  if (value === '' || value === 'bots') return 'bots'
  if (value === 'devices') return 'devices'
  throw new Error(`?autoplay=${value} is not a way to autoplay: give ?autoplay for the bots to play, or ?autoplay=devices for the devices to play what the bots show`)
}

/** One bot's pad as last given, and how many presses of each button it has made so far, so a script that polls between frames loses none. */
export interface BotSeat {
  readonly stick: readonly [number, number]
  readonly a: boolean
  readonly b: boolean
  readonly aPresses: number
  readonly bPresses: number
}

/** What the bots gave for the sim frame `frame` (the World's frame before that step), and how their walkthrough stands. */
export interface BotsShown {
  readonly frame: number
  readonly t: number
  readonly state: WalkState
  /** The sentence the walkthrough stopped with, or null. */
  readonly sentence: string | null
  readonly seats: readonly BotSeat[]
}

export class Autoplay {
  readonly run: WalkRun
  /** What the bots gave last; null before the first frame. */
  shown: BotsShown | null = null
  private readonly presses: { a: number; b: number }[]

  /** `walk` gives the walkthrough compiled against the runtime it runs on (shell/play.ts HouseRoom.walk). */
  constructor(
    private readonly room: Room,
    walk: (runtime: WalkRuntime) => WalkCode,
    readonly mode: AutoplayMode,
  ) {
    const runtime = new WalkRuntime()
    this.run = new WalkRun(room, walk(runtime), runtime, { still: null })
    this.presses = room.world.players.map(() => ({ a: 0, b: 0 }))
  }

  /** What the room steps on this sim frame, given what the devices gave: the bots' pads and pointing (with the devices' ? button), or the devices' own. Call once before each step. */
  frame(devices: FrameInput): FrameInput {
    const w = this.room.world
    const bots = this.run.input()
    const seats = bots.pads.map((pad, i) => {
      const n = this.presses[i]
      if (pad.a.pressed) n.a += 1
      if (pad.b.pressed) n.b += 1
      return { stick: pad.stick, a: pad.a.held, b: pad.b.held, aPresses: n.a, bPresses: n.b }
    })
    this.shown = { frame: w.frame, t: w.t, state: this.run.state, sentence: this.run.sentence, seats }
    return this.mode === 'bots' ? { ...bots, help: bots.help || devices.help } : devices
  }
}
