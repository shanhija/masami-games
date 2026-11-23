/**
 * Flower Bridge, the own room seen from high up: it builds at every level inside the house's floor
 * with nothing the engine had to set right, plays to its end in the engine on pads steered by hand
 * (apart from the bots, whose walkthrough the trial plays in rooms.test.ts, with the look), takes a
 * flower only into the vase of its colour, and needs both players: alone, the bridge stays out only
 * while you stand on a stone, and the terrace is too high to jump onto.
 */

import { describe, expect, it } from 'vitest'
import { NO_POINTING } from '../../seats/types'
import { FEEL, type Level, type Point } from '../../engine/api'
import { HIGH_FRAME } from '../../engine/camera'
import { buildRoom, RoomRuntime, type Room } from '../../engine/room'
import { partyOf, playRoom, type Hold } from '../../engine/testing'
import { CANAL_NEAR, facts, FLOWERS, room as code, STONES, TERRACE, VASES } from './flower-bridge'

const LEVELS: readonly Level[] = [1, 2, 3]
const build = (level: Level) => buildRoom(code, { seed: facts.seed, level, kind: facts.kind, view: facts.view, shell: facts.shell, party: partyOf(2) }, new RoomRuntime())

/** What one player does next: walk to a point on the floor (x and z), press grab once, hold jump while walking toward a point, or wait until something is so. */
type Act = { to: Point } | { grab: true } | { jumpAt: Point; frames: number } | { until: (room: Room) => boolean }

/** Where the stairs start (their low end, right of the landing), the landing, and the bridge's far end on the terrace. */
const STAIRS_FOOT: Point = [-2.3, 0, 1.2]
const LANDING: Point = [-5.8, TERRACE.top, 1.2]
const OVER: Point = [-5.8, TERRACE.top, -2.3]
/** The path along the terrace between its two rows of flowers (a player grabs from a little nearer the row they reach into, so grab takes that flower), and where a player leaves it for the canal, right of every flower. */
const LANE_Z = -2.9
const EXIT_X = 2.6

/** Where vase k (from 0) stands across x, read from the room as built. */
function vaseX(room: Room, k: number): number {
  const vase = room.world.zones.find((z) => z.name === `vase-${k + 1}`)
  if (vase === undefined) throw new Error(`no vase ${k + 1}`)
  return vase.at[0]
}

/** The acts that set down whatever is carried in vase k, walking in to set it down ahead (+z). */
const setIn = (room: Room, k: number): Act[] => [{ to: [vaseX(room, k), 0, 1.5] }, { to: [vaseX(room, k), 0, 2.25] }, { grab: true }]

/** The acts that bring flower i up from the terrace and set it down in vase k: up the stairs, over the bridge, along the path to it, and down into the canal right of the flowers. */
function fetch(room: Room, i: number, k: number): Act[] {
  const [fx, fy, fz] = room.world.things[i].at
  return [
    { to: STAIRS_FOOT },
    { to: LANDING },
    { to: OVER },
    { to: [OVER[0], fy, LANE_Z] },
    { to: [fx, fy, fz > LANE_Z ? LANE_Z + 0.12 : LANE_Z - 0.12] },
    { grab: true },
    { to: [EXIT_X, fy, LANE_Z] },
    { to: [EXIT_X, 0, -1] },
    ...setIn(room, k),
  ]
}

/** Plays the room on pads steered by these acts, one list a player, for at most `frames`, calling `each` after every frame; gives back the frame it ended at, or -1. */
function steer(room: Room, plans: Act[][], frames: number, each: (room: Room) => void = () => {}): number {
  const next = plans.map(() => 0)
  const held = plans.map(() => 0)
  const holds = (): Hold[] =>
    plans.map((plan, seat) => {
      const p = room.world.players[seat]
      while (next[seat] < plan.length) {
        const act = plan[next[seat]]
        if ('until' in act) {
          if (!act.until(room)) return { stick: [0, 0], a: false, b: false }
          next[seat] += 1
          continue
        }
        if ('grab' in act) {
          next[seat] += 1
          return { stick: [0, 0], a: false, b: true }
        }
        const to = 'to' in act ? act.to : act.jumpAt
        const dx = to[0] - p.at[0]
        const dz = to[2] - p.at[2]
        const d = Math.sqrt(dx * dx + dz * dz)
        if ('jumpAt' in act) {
          held[seat] += 1
          if (held[seat] > act.frames) {
            next[seat] += 1
            continue
          }
          return { stick: d < 0.05 ? [0, 0] : [dx / d, -dz / d], a: held[seat] % 40 < 30, b: false }
        }
        if (d < 0.1) {
          next[seat] += 1
          continue
        }
        // Slower near the point, so it stops there: the stick's right is +x, its up -z.
        const k = Math.min(1, d / 0.6) / d
        return { stick: [dx * k, -dz * k], a: false, b: false }
      }
      return { stick: [0, 0], a: false, b: false }
    })
  for (let f = 0; f < frames; f++) {
    playRoom(room, 1, holds, () => NO_POINTING)
    each(room)
    if (room.world.end !== null) return room.world.frame
  }
  return -1
}

/** How many flowers have gone into vases: they are hidden then. */
const inVases = (room: Room) => room.world.things.filter((t) => t.hidden).length

describe('Flower Bridge', () => {
  it.each(LEVELS)('builds at level %i inside the house from high up with nothing the engine had to set right, both players on the shop floor', (level) => {
    const room = build(level)
    expect(room.survey.notes).toEqual([])
    expect(room.world.view).toBe('high')
    expect(room.world.floorFrame).toEqual(HIGH_FRAME)
    expect(room.world.things.length).toBe(FLOWERS[level - 1])
    // Every flower grows on the terrace: a loose thing on the shop's side would be a step up onto it for a player alone.
    expect(room.world.things.every((t) => t.at[1] === TERRACE.top && t.at[2] < TERRACE.front)).toBe(true)
    expect(room.world.zones.filter((z) => z.name?.startsWith('vase-')).length).toBe(VASES[level - 1])
    expect(room.world.players.every((p) => p.at[1] === 0 && p.at[2] > CANAL_NEAR)).toBe(true)
    // The terrace is out of a held jump's reach from the floor, and under the top a player still stands on it.
    expect(TERRACE.top).toBeGreaterThan(FEEL.jumpHigh)
    expect(TERRACE.top + FEEL.height).toBeLessThanOrEqual(room.world.bounds.max[1])
  })

  it.each(LEVELS)(
    'plays to its end at level %i: one holds the near stone, the other brings every flower to the vase of its colour',
    (level) => {
      const room = build(level)
      const holder: Act[] = [{ to: STONES[0] }]
      const carrier: Act[] = [{ until: (r) => r.world.next >= 1 }]
      for (let i = 0; i < room.world.things.length; i++) carrier.push(...fetch(room, i, i % VASES[level - 1]))
      const ended = steer(room, [holder, carrier], 240 * 60)
      expect(ended).toBeGreaterThan(0)
      expect(room.world.end?.by).toBe('finish')
      expect(room.world.steps.every((s) => s.doneAt !== null)).toBe(true)
      // A player who knows the way takes a minute or two, as the bots' clean pass does.
      expect(ended / 60).toBeGreaterThan(60)
      expect(ended / 60).toBeLessThan(200)
    },
    60_000,
  )

  it('takes a flower only into the vase of its colour: set down in another, it stays out until it is brought to its own', () => {
    const room = build(1)
    const holder: Act[] = [{ to: STONES[0] }]
    const toOther: Act[] = [{ until: (r) => r.world.next >= 1 }, ...fetch(room, 0, 1), { to: [vaseX(room, 1), 0, 1.5] }]
    steer(room, [holder, toOther], 40 * 60)
    expect(inVases(room)).toBe(0)
    expect(room.world.things[0].heldBy).toBe(null)
    expect(room.world.things[0].at[2]).toBeGreaterThan(CANAL_NEAR)
    const back: Act[] = [{ to: [vaseX(room, 1), 0, 2.0] }, { grab: true }, ...setIn(room, 0)]
    steer(room, [holder, back], 30 * 60)
    expect(inVases(room)).toBe(1)
    expect(room.world.things[0].hidden).toBe(true)
  })

  it('needs both players: alone, the bridge stays out only while you stand on a stone, and the terrace is too high to jump onto from the canal', () => {
    for (const still of [0, 1]) {
      const room = build(1)
      const mover = still === 0 ? 1 : 0
      // The one who moves stands on the near stone, then runs for the stairs and over the bridge's place, then tries the terrace's face from the canal.
      const plan: Act[] = [{ to: STONES[0] }, { until: (r) => r.world.next >= 1 }, { to: STAIRS_FOOT }, { to: LANDING }, { to: OVER }, { to: [0, 0, -1] }, { jumpAt: [0, 0, -3], frames: 240 }]
      let highest = 0
      steer(room, still === 0 ? [[], plan] : [plan, []], 40 * 60, (r) => {
        for (const p of r.world.players) if (p.at[2] < TERRACE.front) highest = Math.max(highest, p.at[1])
      })
      expect(room.world.next).toBe(1)
      expect(highest).toBeLessThan(TERRACE.top - 0.5)
      expect(room.world.players[mover].at[1]).toBeLessThan(TERRACE.top)
      expect(room.world.end).toBe(null)
    }
  })
})
