/**
 * The sim: making one, stepping it, and what the child can do to it. A frame is the hands, the
 * world, the ground settling, the clock, and then the jobs. The commands are what a finger, a
 * key or a voice does; the readers (`stepPointer`, `stepView`, `actionFace`, `actionReady`) are
 * what the HUD shows, and the tap bot reads nothing else.
 */

import { DAY_OF } from './model'
import type { Levers, Mode, Sim } from './model'
import { aimsOf, applyDone, digsHere, dozerTap, driveTo, guardedOf, STORY, stepJobs } from './jobs'
import { handsFrame } from './hands'
import { SETTLE_BUDGET, settle } from './terrain'
import { beginWorld, createWorld, stepWorld } from './world'

export { say } from './say'
export { actionFace, actionReady } from './hands'
export { hopTo, nextMoreJob, stepPointer, stepView } from './jobs'

/** Where a game starts: the save's progress and the job generator's state. */
export interface Start {
  storyDone: number
  moreDone: number
  coins: number
  stars: number
  mode: Mode
  seed: number
  lastTemplate: number
}

/** A fresh sim, or the one a save describes: the story's finished jobs stamped in the town. */
export function createSim(start: Start): Sim {
  if (start.storyDone > STORY.length) throw new Error(`the story has ${STORY.length} jobs, not ${start.storyDone}`)
  const s = createWorld(start)
  s.lastTemplate = start.lastTemplate
  for (let i = 0; i < start.storyDone; i++) applyDone(s, STORY[i].id)
  s.day = DAY_OF[start.storyDone < STORY.length ? STORY[start.storyDone].chapter : 'more']
  return s
}

/** One frame of `dt` seconds. */
export function tick(s: Sim, dt: number): void {
  if (!(dt > 0)) throw new Error(`tick: dt must be above 0, got ${dt}`)
  beginWorld(s)
  let guarded = guardedOf(s)
  const real = s.hands.action
  const tap = s.hands.tapped && !real && !s.pressNext
  s.hands.tapped = false
  if (s.pressNext) {
    // A spoken press skips the hold and the block after a hop.
    s.hands.action = true
    s.hands.heldFor = 0
    s.hands.blocked = false
    guarded = false
  } else if (tap) {
    // A tap that went down and up between two ticks is one frame of press; a guarded step then gives its `uhuh` on the next tick, as a short press does.
    s.hands.action = true
  }
  handsFrame(s, dt, guarded, aimsOf(s), s.leverTap)
  if (s.pressNext) {
    s.hands.action = real
    if (!real) s.hands.heldFor = 0
    s.pressNext = false
  } else if (tap) {
    s.hands.action = false
    if (!guarded) s.hands.heldFor = 0
  }
  s.leverTap = false
  if (s.releasePoint) {
    s.hands.point = null
    s.releasePoint = false
  }
  stepWorld(s, dt)
  settle(s.terrain, SETTLE_BUDGET)
  s.time += dt
  stepJobs(s, dt)
}

// ---------------------------------------------------------------------------------------
// What the child does.

/** Finger down or moving: in easy mode a driving machine goes there; a crane's hands read the point themselves. */
export function setPoint(s: Sim, x: number, z: number): void {
  s.hands.point = { x, z }
  const m = s.machines[s.active]
  if (s.mode !== 'easy' || m.kind === 'tower' || m.kind === 'mobile') return
  if (m.kind === 'digger' && digsHere(s, x, z)) return
  const to = m.kind === 'dozer' ? dozerTap(s, x, z) : { x, z }
  if (m.goal !== null && m.goal.x === to.x && m.goal.z === to.z && m.goal.pace === 1 && !m.goal.thenPress) return
  driveTo(s, m, to.x, to.z, 1.5, 1, false)
}

/** Finger up: the machine keeps going to the last point and stops there. */
export function letGo(s: Sim): void {
  s.hands.point = null
}

export function setAction(s: Sim, on: boolean): void {
  if (on && !s.hands.action) s.hands.tapped = true
  s.hands.action = on
}

/** The game let go of every input: a tap made but not yet ticked is dropped, so it does not fire when play comes back. */
export function dropTap(s: Sim): void {
  s.hands.tapped = false
}

export function honk(s: Sim): void {
  const m = s.machines[s.active]
  m.honk = 0.8
  s.events.push({ kind: 'honk', machine: s.active })
}

export function setLevers(s: Sim, levers: Levers): void {
  s.hands.levers = { ...levers }
}

/** Space in pro mode. */
export function leverTap(s: Sim): void {
  s.leverTap = true
}

export function setMode(s: Sim, mode: Mode): void {
  s.mode = mode
  const m = s.machines[s.active]
  if (mode === 'pro') m.goal = null
}

export function setViewYaw(s: Sim, yaw: number): void {
  s.hands.viewYaw = yaw
}

/** The card is read: it goes. */
export function ackCard(s: Sim): void {
  s.card = null
}
