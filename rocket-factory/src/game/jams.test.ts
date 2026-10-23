/**
 * Things that block a machine (plans/rocket-factory.md, Belts, Not wanted now): what counts as
 * a blocker (a thing its machine does not want now with something it wants waiting behind
 * it, or one it never takes with the belt full behind it, standing since its lane's stamp, a
 * bridge's hump's too), and Beep's lifts: the first BLOCKED_HINT +
 * LIFT_AFTER after it began to block, then each further blocker of the jam every LIFT_AGAIN
 * until the machine takes something, every lift a carry to where the thing is wanted. The
 * belts hop for real (belts.ts); the step here is only the hop and the jams, in the rules'
 * order.
 */
import { describe, expect, it } from 'vitest'

import { add, cell, emptyBoard, line, put } from './beltKit'
import { cellOf } from './board'
import { hop, rebuild } from './belts'
import { BLOCKED_HINT, LIFT_AFTER, LIFT_AGAIN, PART_INFO } from './catalog'
import { blockers, stepJams } from './jams'
import { CELLS, HOP, inSlot, outSlot, overIn, overOut, thingIndex, type State } from './model'

/** The hop on hop ticks, then the jams, then the clock: rules.step's order for these two. */
function run(s: State, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.events = []
    if (s.tick % HOP === 0) hop(s)
    stepJams(s)
    s.tick++
  }
}

/** A pad whose legs want blue bars, fed by a belt from the east carrying `things` (the first nearest the mouth). */
function padLine(things: readonly ('blueBar' | 'goldBar' | 'gear' | 'blueRock')[]): { s: State; mouth: number; pad: number } {
  const s = emptyBoard()
  const pad = add(s, 'pad', 1, 4)
  const cells = line(s, [
    [10, 5],
    [9, 5],
    [8, 5],
    [7, 5],
    [6, 5],
    [5, 5],
    [4, 5],
  ])
  rebuild(s)
  // Nose to tail from the mouth back: out and in slot of each cell.
  const slots = [...cells].reverse().flatMap((c) => [outSlot(c), inSlot(c)])
  things.forEach((t, i) => put(s, slots[i]!, t))
  return { s, mouth: outSlot(cellOf(4, 5)), pad: pad.id }
}

/** Hops until the belt has stood still long enough to stamp its end: a thing that will not go in, with the queue full behind it. */
function settle(s: State): void {
  run(s, 3 * HOP)
}

describe('blockers', () => {
  it('a thing its machine does not want, with something it wants behind it, blocks since its belt stood still', () => {
    const { s, mouth, pad } = padLine(['goldBar', 'blueBar', 'blueBar'])
    settle(s)
    const all = blockers(s)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ slot: mouth, building: pad })
    expect(all[0]!.since).toBe(s.belts.blockedSince[cellOf(4, 5)])
    expect(all[0]!.since).toBeGreaterThanOrEqual(0)
  })

  it('blocks nothing when nothing behind it is wanted and its machine takes it at other times, when it is wanted itself, or while the queue has a gap behind it', () => {
    // Blue bars for the rocket's legs once they are full: the pad takes them again after a landing.
    const full = padLine(['blueBar', 'blueBar', 'blueBar'])
    full.s.rocket.got[0] = PART_INFO.legs.n
    settle(full.s)
    expect(blockers(full.s)).toEqual([])
    const wanted = padLine(['blueBar', 'blueBar'])
    expect(blockers(wanted.s)).toEqual([])
    // A gold bar alone at the mouth: its belt never stamps (nothing waits behind it).
    const alone = padLine(['goldBar'])
    settle(alone.s)
    expect(blockers(alone.s)).toEqual([])
  })

  it('a belt filled with things its machine never takes blocks it, with nothing wanted behind: only Beep ever empties it', () => {
    const { s, mouth, pad } = padLine(['goldBar', 'goldBar', 'gear'])
    settle(s)
    expect(blockers(s)).toEqual([{ slot: mouth, building: pad, since: s.belts.blockedSince[cellOf(4, 5)] }])
    // Beep lifts it as any jam, the next every LIFT_AGAIN while the pad takes nothing.
    const since = blockers(s)[0]!.since
    run(s, since + BLOCKED_HINT + LIFT_AFTER - s.tick + 1)
    expect(s.belts.slot[mouth]).toBe(-1)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
  })

  it("a thing at the end of a bridge's hump into a machine tells its time as a belt's end does, and Beep lifts it as any blocker", () => {
    const s = emptyBoard()
    const pad = add(s, 'pad', 1, 4)
    // A bar belt from the east whose last cell bridges a north-south belt beside the pad: the hump's lane leads into the pad's mouth.
    line(s, [
      [7, 5],
      [6, 5],
      [5, 5],
    ])
    const bridge = cell(s, 4, 5, 3, 1, -1, 2)
    rebuild(s)
    const mouth = overOut(bridge)
    expect(s.net.mouths.get(pad.id)).toEqual([mouth])
    put(s, mouth, 'goldBar')
    put(s, overIn(bridge), 'blueBar')
    put(s, outSlot(cellOf(5, 5)), 'blueBar')
    settle(s)
    const since = s.belts.blockedSince[CELLS + bridge]!
    expect(since).toBeGreaterThanOrEqual(0)
    expect(s.belts.blockedSince[bridge]).toBe(-1)
    expect(blockers(s)).toEqual([{ slot: mouth, building: pad.id, since }])
    run(s, since + BLOCKED_HINT + LIFT_AFTER - s.tick + 1)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    run(s, 2 * HOP)
    expect(s.rocket.got[0]).toBeGreaterThan(0)
  })

  it('a machine a muncher naps on wants nothing, so nothing blocks it', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 4)
    line(s, [
      [10, 5],
      [9, 5],
      [8, 5],
    ])
    rebuild(s)
    put(s, outSlot(cellOf(8, 5)), 'gear')
    put(s, inSlot(cellOf(8, 5)), 'blueRock')
    put(s, outSlot(cellOf(9, 5)), 'blueRock')
    settle(s)
    expect(blockers(s).map((b) => b.building)).toEqual([oven.id])
    oven.napper = 7
    expect(blockers(s)).toEqual([])
  })
})

describe('Beep lifts a jam', () => {
  it('lifts the first blocker BLOCKED_HINT + LIFT_AFTER after it began to block, as a carry to where it is wanted', () => {
    const { s, mouth, pad } = padLine(['goldBar', 'blueBar', 'blueBar', 'blueBar'])
    settle(s)
    const since = blockers(s)[0]!.since
    const due = since + BLOCKED_HINT + LIFT_AFTER
    run(s, due - s.tick)
    expect(s.belts.slot[mouth]).toBe(thingIndex('goldBar'))
    expect(s.jams).toEqual([])
    run(s, 1)
    // Nothing on this board wants a gold bar: it goes in Beep's basket, and Beep flew to it.
    expect(s.belts.slot[mouth]).not.toBe(thingIndex('goldBar'))
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    expect(s.jams).toEqual([{ building: pad, at: due }])
    expect(s.beep.movedAt).toBe(due)
    expect(s.beep.pose).toBe('carry')
    expect(s.flights).toHaveLength(1)
    expect(s.events).toContainEqual(expect.objectContaining({ kind: 'carry', thing: 'goldBar' }))
  })

  it('lifts a blocker while a caught muncher waits for its tickle without taking Beep away from it: the carry is credited, and Beep stays tickling', () => {
    const { s, mouth } = padLine(['goldBar', 'blueBar', 'blueBar'])
    settle(s)
    const due = blockers(s)[0]!.since + BLOCKED_HINT + LIFT_AFTER
    run(s, due - s.tick)
    s.munchers.push({ id: 7, burrow: 0, mode: 'caught', modeAt: s.tick, cell: cellOf(10, 7), toward: cellOf(10, 7), stepAt: s.tick, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: s.tick, scout: false, shotBy: -1 })
    s.tickles = [7]
    s.beep = { ...s.beep, x: 9.95, y: 7.5, fromX: 9.95, fromY: 7.5, movedAt: s.tick - 30, pose: 'tickle', poseAt: s.tick - 30 }
    const beep = { ...s.beep }
    run(s, 1)
    expect(s.belts.slot[mouth]).not.toBe(thingIndex('goldBar'))
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    expect(s.flights).toHaveLength(1)
    expect(s.events).toContainEqual(expect.objectContaining({ kind: 'carry', thing: 'goldBar' }))
    expect(s.beep).toEqual(beep)
  })

  it('sends a lifted thing to a building that wants it', () => {
    const { s } = padLine(['blueRock', 'blueBar', 'blueBar'])
    const oven = add(s, 'oven', 12, 8)
    rebuild(s)
    settle(s)
    const due = blockers(s)[0]!.since + BLOCKED_HINT + LIFT_AFTER
    run(s, due - s.tick + 1)
    expect(oven.queue).toEqual(['blueRock'])
    expect(s.basket.every((n) => n === 0)).toBe(true)
  })

  it('lifts each further blocker of the jam every LIFT_AGAIN until the machine takes something, then the jam is over', () => {
    const { s, mouth } = padLine(['goldBar', 'goldBar', 'goldBar', 'blueBar', 'blueBar'])
    settle(s)
    const first = blockers(s)[0]!.since + BLOCKED_HINT + LIFT_AFTER
    run(s, first - s.tick + 1)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    // The next gold bar moves up and is lifted LIFT_AGAIN after the first, not sooner.
    run(s, LIFT_AGAIN - 1)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    run(s, 1)
    expect(s.basket[thingIndex('goldBar')]).toBe(2)
    expect(s.jams[0]!.at).toBe(first + LIFT_AGAIN)
    run(s, LIFT_AGAIN)
    expect(s.basket[thingIndex('goldBar')]).toBe(3)
    // Then the blue bars ride in: the pad takes one, and the jam is over.
    run(s, 4 * HOP)
    expect(s.rocket.got[0]).toBeGreaterThan(0)
    expect(s.jams).toEqual([])
    expect(s.belts.slot[mouth]).not.toBe(thingIndex('goldBar'))
  })

  it('a jam left with nothing to lift for a whole wait is over, and a later blocker waits its full time again', () => {
    const { s, mouth } = padLine(['goldBar', 'blueBar', 'blueBar'])
    settle(s)
    const first = blockers(s)[0]!.since + BLOCKED_HINT + LIFT_AFTER
    run(s, first - s.tick + 1)
    s.rocket.got[0] = 20
    run(s, BLOCKED_HINT + LIFT_AFTER + HOP)
    expect(s.jams).toEqual([])
    // A new gold bar at the mouth with blue bars behind it, the legs open again, on a belt that moved meanwhile: no lift until its own full wait.
    s.rocket.got[0] = 0
    s.belts.slot.fill(-1)
    s.belts.blockedSince.fill(-1)
    put(s, mouth, 'goldBar')
    put(s, inSlot(cellOf(4, 5)), 'blueBar')
    put(s, outSlot(cellOf(5, 5)), 'blueBar')
    settle(s)
    const again = blockers(s)[0]!.since
    run(s, again + BLOCKED_HINT + LIFT_AFTER - s.tick)
    expect(s.belts.slot[mouth]).toBe(thingIndex('goldBar'))
    run(s, 1)
    expect(s.belts.slot[mouth]).not.toBe(thingIndex('goldBar'))
  })

  it('only acts on hop ticks', () => {
    const { s, mouth } = padLine(['goldBar', 'blueBar', 'blueBar'])
    settle(s)
    s.tick = blockers(s)[0]!.since + BLOCKED_HINT + LIFT_AFTER + 1
    stepJams(s)
    expect(s.belts.slot[mouth]).toBe(thingIndex('goldBar'))
  })
})
