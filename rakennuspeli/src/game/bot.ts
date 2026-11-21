/**
 * The tap bot: it plays like a child with one finger. It reads only what the HUD shows (the
 * marker `stepPointer`, the button's `actionReady`, the active machine) and does only what a
 * finger does (`setPoint`, `letGo`, `setAction`, `hopTo`). Machines that work by holding the big
 * button get it held; the ones that need a fresh press each time get it tapped; the dozer never
 * gets the button, only the marker to drive to. A crane's hook is
 * tapped over the marker, then the button tapped once it rests.
 */

import type { Sim } from './model'
import { actionReady, hopTo, letGo, setAction, setPoint, stepPointer } from './sim'

/** Seconds a marker may ask for another machine before the bot taps it: the job's own hop comes first, so the bot hops only when that never came. */
const HOP_AFTER = 3
/** Seconds the button stays up after a hop, as a child lets go when it does nothing: the game ignores a press that comes too soon. */
const HOP_WAIT = 0.7
/** The time a button is down and up when it is pressed again and again: down long enough for the 1 s hold a load needs away from its ring. */
const TAP_DOWN = 1.2
const TAP_UP = 0.3

export interface Bot {
  /** When the marker first asked for another machine. */
  sawAt: number | null
  /** Seconds into the current button tapping. */
  pulse: number
  /** Where a crane's hook was last tapped, and how long ago. */
  tapped: { x: number; z: number } | null
  tapAge: number
  /** How many times the bot hopped by itself, a count that stays 0 while the job's own hops do the work. */
  hops: number
}

export const createBot = (): Bot => ({ sawAt: null, pulse: 0, tapped: null, tapAge: 0, hops: 0 })

/** One frame of the bot's thinking. */
export function botFrame(bot: Bot, s: Sim, dt: number): void {
  const p = stepPointer(s)
  if (p === null) {
    setAction(s, false)
    letGo(s)
    bot.sawAt = null
    bot.tapped = null
    return
  }
  if (p.machine !== s.active) {
    setAction(s, false)
    letGo(s)
    bot.tapped = null
    if (!s.machines[p.machine].unlocked) return
    bot.sawAt ??= s.time
    if (s.time - bot.sawAt >= HOP_AFTER) {
      hopTo(s, p.machine)
      bot.hops++
      bot.sawAt = null
    }
    return
  }
  bot.sawAt = null
  bot.tapAge += dt
  // After any hop, by the bot or by the game, the button stays up for a moment.
  const pressing = s.lastHop === null || s.time - s.lastHop.at >= HOP_WAIT
  const tap = () => {
    bot.pulse += dt
    setAction(s, bot.pulse % (TAP_DOWN + TAP_UP) < TAP_DOWN)
  }
  switch (s.active) {
    case 'dozer':
      // Drive to the marker; the hands lift and drop the blade by themselves.
      setAction(s, false)
      setPoint(s, p.x, p.z)
      return
    case 'digger':
    case 'dumper':
    case 'roller':
      if (p.press) {
        letGo(s)
        setAction(s, pressing)
      } else {
        setAction(s, false)
        setPoint(s, p.x, p.z)
      }
      return
    case 'forklift':
    case 'mixer':
    case 'semi':
      if (p.press) {
        letGo(s)
        if (pressing) tap()
        else setAction(s, false)
      } else {
        bot.pulse = 0
        setAction(s, false)
        setPoint(s, p.x, p.z)
      }
      return
    case 'tower':
    case 'mobile': {
      // The hook only takes a tap while it rests, so the bot taps again every so often until it does.
      const aimed = bot.tapped !== null && Math.hypot(bot.tapped.x - p.x, bot.tapped.z - p.z) <= 0.5
      const ready = actionReady(s)
      if (!aimed || (!ready && bot.tapAge > 0.4) || (ready && bot.tapAge > 1.5 && !p.press)) {
        bot.tapped = { x: p.x, z: p.z }
        bot.tapAge = 0
        bot.pulse = 0
        setAction(s, false)
        setPoint(s, p.x, p.z)
        return
      }
      letGo(s)
      if (p.press && pressing && bot.tapAge > 0.1 && ready) tap()
      else setAction(s, false)
      return
    }
  }
}
