import { carrySlot } from './beep'
import { hasMouths } from './belts'
import { BLOCKED_HINT, LIFT_AFTER, LIFT_AGAIN } from './catalog'
import { HOP, PRED, THINGS, type Building, type State } from './model'
import { everWants, wants } from './trade'

/**
 * Things that block a machine (plans/rocket-factory.md, Belts, Not wanted now). A thing at a
 * belt's end that the machine does not want now waits and wiggles while the mouth shows what
 * it wants. It counts as blocking when something the machine wants waits behind it, or when
 * the machine never takes such a thing and the belt stands full behind it (gold bars on the
 * gear oven's belt into the workshop: nothing ever empties that belt but Beep). Then it becomes
 * the hint after BLOCKED_HINT (hint.ts), Beep lifts it away by itself LIFT_AFTER later, and once
 * Beep has lifted a jam's first blocker it lifts each further blocker of that jam every
 * LIFT_AGAIN until the machine takes something. A belt that ends on bare ground blocks nothing,
 * and nor does one whose things the machine takes at other times (bars into a full rocket part):
 * it just stands full.
 */

/** A thing at a belt's end that its machine does not want now while something it wants waits behind it, or that it never takes: the slot, the machine and since when (the lane's blockedSince). */
export interface Blocker {
  slot: number
  building: number
  since: number
}

/** How far behind a blocker the queue is searched for something its machine wants, in slots: a whole stroke's belt and more. */
const BEHIND = 96

/** Something building b wants now waits in the queue behind the thing in mouth slot x: the slots upstream of it, through joins, while they are full. */
function wantedBehind(s: State, b: Building, x: number): boolean {
  const { slot } = s.belts
  const { preds } = s.net
  const pred = PRED
  const seen = new Set<number>()
  for (const todo = [x - 1]; todo.length > 0 && seen.size < BEHIND; ) {
    const y = todo.pop()!
    if (seen.has(y) || slot[y]! < 0) continue
    seen.add(y)
    if (wants(s, b, THINGS[slot[y]!]!)) return true
    for (let k = 0; k < pred; k++) if (preds[pred * y + k]! >= 0) todo.push(preds[pred * y + k]!)
  }
  return false
}

/**
 * Every blocker on the board, the longest standing first: at the end of a cell's main lane or of
 * a bridge's hump into a mouth, each lane's blockedSince telling how long its thing has stood
 * with the lane full behind it (belts.ts). A machine a muncher naps on takes nothing, so
 * nothing blocks it until it wakes.
 */
export function blockers(s: State): Blocker[] {
  const out: Blocker[] = []
  const { slot, blockedSince } = s.belts
  for (const b of s.buildings) {
    if (!hasMouths(b) || b.napper !== -1) continue
    for (const x of s.net.mouths.get(b.id)!) {
      const thing = slot[x]! < 0 ? null : THINGS[slot[x]!]!
      if (thing === null || wants(s, b, thing)) continue
      const since = blockedSince[x >> 1]!
      if (since >= 0 && (!everWants(b.kind, thing) || wantedBehind(s, b, x))) out.push({ slot: x, building: b.id, since })
    }
  }
  return out.sort((p, q) => p.since - q.since || p.slot - q.slot)
}

/**
 * Every tick (rules.step, after the hop): Beep lifts a jam's first blocker BLOCKED_HINT +
 * LIFT_AFTER after it began to block, then each further blocker of that jam every LIFT_AGAIN,
 * one a machine at a time. A jam (s.jams) is over once its machine has taken something since
 * the last lift, once the machine is gone, or once a whole BLOCKED_HINT + LIFT_AFTER passes
 * with nothing to lift (a blocker after that is a new jam, and waits its full time). Blockers
 * begin and things move only on hop ticks, so every lift falls on one too.
 */
export function stepJams(s: State): void {
  const tick = s.tick
  if (tick % HOP !== 0) return
  const quiet = BLOCKED_HINT + LIFT_AFTER
  s.jams = s.jams.filter((j) => {
    const b = s.buildings.find((x) => x.id === j.building)
    return b !== undefined && b.gulpAt <= j.at && tick - j.at < quiet
  })
  const lifted = new Set<number>()
  for (const bl of blockers(s)) {
    if (lifted.has(bl.building)) continue
    const jam = s.jams.find((j) => j.building === bl.building)
    if (tick < (jam === undefined ? bl.since + quiet : jam.at + LIFT_AGAIN)) continue
    lifted.add(bl.building)
    // Beep's lift is the carry a tap on the thing makes (beep.ts), so a tickle waiting for Beep is never cut short.
    carrySlot(s, bl.slot, tick)
    if (jam === undefined) s.jams.push({ building: bl.building, at: tick })
    else jam.at = tick
  }
}
